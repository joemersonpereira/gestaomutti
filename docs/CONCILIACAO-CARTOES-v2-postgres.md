# Conciliação de Cartões — caminho técnico para a v2.0 (Postgres)

Módulo novo: **💳 Conciliação de Cartões** (`/api/conciliacao-cartao`, tela `ConciliacaoCartoes.js`).
Este documento tem tudo que o programador precisa para aplicar na v2.0: o diagnóstico, o DDL em
Postgres, as consultas ao ERP prontas para colar e — principalmente — as **armadilhas que só
apareceram nos dados reais** (cada uma custou uma rodada de teste; repetir o erro é fácil).

---

## 1. O problema

O PDV **não é integrado ao TEF por DLL**. O operador escolhe a forma de pagamento no ERP e depois
escolhe outra na SiTef: marca "02-CREDITO" e passa Alelo, marca "04-PIX QRCode" e passa débito,
marca 2x e o cliente parcela em 3x. O ERP grava o título errado, a conciliação automática não fecha
e o dinheiro fica "Não Conciliado" (na tela do A7: 2.901 títulos / R$ 148.329,96 em 30 dias).

Como não dá para mexer no ERP, o confronto é feito **por fora**: a verdade é o que a operadora
registrou. O sistema aponta o que está errado e a Tesouraria corrige à mão no ERP.

Tamanho do problema medido no banco: **2.741 correções manuais** de fev→ago/2026
(`correcaocartaoreceber`), 501 só em agosto, sendo 169 trocas de forma de pagamento — R$ 162.152,87.

---

## 2. As duas fontes de verdade

| Fonte | De onde vem | Cobre hoje | Upload? |
|---|---|---|---|
| **A — automática** | `conciliacaocartaoitem` (arquivos EDI que as credenciadoras já mandam para o ERP) | Rede, Brasil Card/Bolt, Brasil Convênios | não |
| **B — upload** | relatório que a Tesouraria baixa no portal da operadora | Rede, Brasil Card, Le Card, Bracov, Nutricash | sim, diário |

As duas passam pelo **mesmo motor** (mesmo casamento, mesmas regras, mesma tela).

---

## 3. Tabelas novas do app — DDL Postgres

```sql
-- De-para 1: forma de pagamento do ERP → o que ela é de verdade.
-- É isto que permite dizer "está errado".
CREATE TABLE IF NOT EXISTS conc_modalidade_grupo (
  empresa_id      text        NOT NULL,
  modalidade_id   text        NOT NULL,          -- modalidadecartao.id do ERP (bigint como texto)
  modalidade_nome text,
  grupo           text        NOT NULL,          -- DEBITO|CREDITO|PARCELADO|VOUCHER|PIX|CREDIARIO|PREPAGO|OUTRO
  conciliar       boolean     NOT NULL DEFAULT true,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, modalidade_id)
);

-- De-para 2: operadora do relatório → formas do ERP que pertencem a ela.
-- Define o ESCOPO: sem isso não dá para dizer "a operadora não pagou este título".
CREATE TABLE IF NOT EXISTS conc_operadora_modalidade (
  empresa_id    text        NOT NULL,
  operadora     text        NOT NULL,
  modalidade_id text        NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, operadora, modalidade_id)
);

-- Um relatório importado = um lote (idempotente pelo hash do conteúdo).
CREATE TABLE IF NOT EXISTS conc_arquivo (
  id           bigserial PRIMARY KEY,
  empresa_id   text        NOT NULL,
  operadora    text        NOT NULL,
  layout       text        NOT NULL,             -- REDE|BRASILCARD|LECARD|BRACOV|NUTRICASH
  loja_id      text,                             -- informada no upload (arquivos sem CNPJ)
  nome_arquivo text,
  hash         text        NOT NULL,             -- sha1 do arquivo
  data_ini     date,
  data_fim     date,
  linhas       integer     NOT NULL DEFAULT 0,
  valor_total  numeric(14,2) NOT NULL DEFAULT 0,
  usuario_id   text,
  importado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_conc_arquivo_hash UNIQUE (empresa_id, hash)
);

-- Linhas do relatório, normalizadas (a verdade da operadora).
CREATE TABLE IF NOT EXISTS conc_item (
  id             bigserial PRIMARY KEY,
  arquivo_id     bigint      NOT NULL REFERENCES conc_arquivo(id) ON DELETE CASCADE,
  empresa_id     text        NOT NULL,
  operadora      text        NOT NULL,
  uni_erp        bigint,                          -- unidadenegocio.id (por CNPJ ou pela loja do upload)
  loja_id        text,
  data           date        NOT NULL,
  hora           time,
  nsu            text,
  autorizacao    text,
  cartao         text,
  cliente        text,
  bandeira       text,
  grupo          text,                            -- NULL quando o arquivo não informa (convênios)
  tipo_operadora text,
  parcelas       integer     NOT NULL DEFAULT 1,
  valor          numeric(14,2) NOT NULL DEFAULT 0,
  valor_liquido  numeric(14,2) NOT NULL DEFAULT 0,
  taxa           numeric(7,4)  NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_conc_item_busca   ON conc_item (empresa_id, data, uni_erp);
CREATE INDEX IF NOT EXISTS ix_conc_item_arquivo ON conc_item (arquivo_id);

-- Decisão humana sobre cada divergência. A divergência em si é SEMPRE recalculada;
-- aqui fica só o que a Tesouraria fez com ela.
CREATE TABLE IF NOT EXISTS conc_tratativa (
  id            bigserial PRIMARY KEY,
  empresa_id    text        NOT NULL,
  ref           text        NOT NULL,             -- 'MODALIDADE|ext:1234' | 'SO_ERP|edi:99'
  tipo          text,
  status        text        NOT NULL DEFAULT 'aberta',  -- aberta|corrigida|procede|ignorada
  valor         numeric(14,2),
  loja_id       text,
  operador      text,
  obs           text,
  usuario_id    text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_conc_tratativa_ref UNIQUE (empresa_id, ref)
);
```

**Upserts** (traduzidos do `INSERT OR REPLACE` do SQLite):

```sql
INSERT INTO conc_modalidade_grupo (empresa_id, modalidade_id, modalidade_nome, grupo, conciliar, atualizado_em)
VALUES ($1,$2,$3,$4,$5, now())
ON CONFLICT (empresa_id, modalidade_id)
DO UPDATE SET grupo = EXCLUDED.grupo, conciliar = EXCLUDED.conciliar, atualizado_em = now();

INSERT INTO conc_tratativa (empresa_id, ref, tipo, status, valor, loja_id, operador, obs, usuario_id)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
ON CONFLICT (empresa_id, ref)
DO UPDATE SET status = EXCLUDED.status, obs = EXCLUDED.obs,
              usuario_id = EXCLUDED.usuario_id, atualizado_em = now();
```

---

## 4. Consultas ao ERP (read-only)

### 4.1 Lado ERP — títulos agrupados por transação

`$1` = unidades de negócio (bigint[]), `$2`/`$3` = período (date), `$4` = **dias cobertos por
relatório** (date[]).

```sql
SELECT cr.id, cr.unidadenegocioid uni, cr.numerotransacao nsu, cr.numeroautorizacao aut,
       cr.valor::float8 valor, cr.taxa::float8 taxa, cr.numeroparcela, cr.totalparcela,
       to_char(cr.dataemissao,  'YYYY-MM-DD') data,
       to_char(cr.dataemissao,  'HH24:MI:SS') hora,
       to_char(cr.datavencimento,'YYYY-MM-DD') vencimento,
       cr.statusconciliacao, cr.conferido, cr.status, cr.origem,
       cr.modalidadecartaoid mod_id, mc.nome modalidade,
       COALESCE(p.nome, 'usuário ' || cr.usuarioid) operador, cr.usuarioid
  FROM cartaoreceber cr
  LEFT JOIN modalidadecartao mc ON mc.id = cr.modalidadecartaoid
  LEFT JOIN usuario us ON us.id = cr.usuarioid
  LEFT JOIN pessoa  p  ON p.id  = us.pessoaid
 WHERE cr.unidadenegocioid = ANY($1::bigint[])
   AND cr.dataemissao >= $2::date AND cr.dataemissao < ($3::date + 1)
   AND cr.dataemissao::date = ANY($4::date[])
   AND NOT EXISTS (SELECT 1 FROM correcaocartaoreceberincorreto ci WHERE ci.cartaoreceberid = cr.id);
```

Depois, **em código**, agrupar as parcelas da mesma venda pela chave
`uni | nsu(ou aut, ou id) | totalparcela | hora | origem`, somando `valor` e usando `max(totalparcela)`.

### 4.2 Lado operadora — fonte automática (EDI que o ERP já recebe)

```sql
WITH por_lote AS (
  SELECT i.unidadenegocioid uni, i.numerotransacao nsu, i.totalparcela,
         i.datahoratransacao::date d, i.conciliacaocartaoid lote,
         MIN(i.id) id, MIN(i.cartaoreceberid) cartaoreceberid,
         to_char(MIN(i.datahoratransacao),'YYYY-MM-DD') data,
         to_char(MIN(i.datahoratransacao),'HH24:MI:SS') hora,
         SUM(i.valor)::float8 valor, MAX(i.taxa)::float8 taxa, MIN(i.bandeira) bandeira,
         COALESCE(MIN(co.nome),'operadora') operadora, MIN(t.descricao) tipo_op,
         CASE WHEN MIN(t.codigoagrupamentobaixa) LIKE 'D_bito'   THEN 'DEBITO'
              WHEN MIN(t.codigoagrupamentobaixa) LIKE 'Cr_dito' AND MAX(i.totalparcela) > 1 THEN 'PARCELADO'
              WHEN MIN(t.codigoagrupamentobaixa) LIKE 'Cr_dito'  THEN 'CREDITO'
              WHEN MIN(t.codigoagrupamentobaixa) =    'Voucher'  THEN 'VOUCHER'
              WHEN MIN(t.codigoagrupamentobaixa) =    'Pix'      THEN 'PIX'
              WHEN MIN(t.codigoagrupamentobaixa) LIKE 'Pr_-pago' THEN 'PREPAGO'
              WHEN MIN(t.codigoagrupamentobaixa) LIKE 'Credi_rio' THEN 'CREDIARIO'
              ELSE 'OUTRO' END grupo
    FROM conciliacaocartaoitem i
    JOIN conciliacaocartao cc ON cc.id = i.conciliacaocartaoid
    LEFT JOIN conciliacaocartaooperadora      co ON co.id = cc.conciliacaocartaooperadoraid
    LEFT JOIN conciliacaocartaotipoautorizacao t ON t.id  = i.conciliacaocartaotipoautorizacaoid
   WHERE i.unidadenegocioid = ANY($1::bigint[])
     AND i.datahoratransacao >= $2::date AND i.datahoratransacao < ($3::date + 1)
   GROUP BY 1,2,3,4,5
  HAVING SUM(i.valor) > 0
)
SELECT DISTINCT ON (uni, nsu, totalparcela, d) *
  FROM por_lote ORDER BY uni, nsu, totalparcela, d, lote;
```

O `LIKE 'D_bito'` (com `_`) não é preguiça: **as colunas de texto do ERP vêm com acentuação
inconsistente** (aparece `Brasil Conv�nios` em `conciliacaocartaooperadora.nome`). O curinga evita
depender do encoding.

### 4.3 Loja pelo CNPJ do relatório

```sql
SELECT id, cnpj, nome FROM unidadenegocio WHERE cnpj IS NOT NULL;
```
O CNPJ do relatório da Rede/Bracov bate exatamente com `unidadenegocio.cnpj` (só dígitos).

### 4.4 Histórico de correções feitas no ERP (o retrabalho)

```sql
SELECT to_char(cc.datahora,'YYYY-MM-DD') data, cc.valortotal::float8 valor, cc.motivo, cc.observacao,
       cri.unidadenegocioid uni, mci.nome mod_errada, mcc.nome mod_correta,
       cri.totalparcela parc_errada, cc.totalparcela parc_correta,
       COALESCE(p.nome,  'usuário ' || cc.usuarioid) quem,
       COALESCE(pv.nome, '') operador
  FROM correcaocartaoreceber cc
  JOIN correcaocartaoreceberincorreto i ON i.correcaocartaoreceberid = cc.id
  JOIN cartaoreceber cri ON cri.id = i.cartaoreceberid
  LEFT JOIN modalidadecartao mci ON mci.id = cri.modalidadecartaoid
  LEFT JOIN modalidadecartao mcc ON mcc.id = cc.modalidadecartaoid
  LEFT JOIN usuario u  ON u.id  = cc.usuarioid  LEFT JOIN pessoa p  ON p.id  = u.pessoaid
  LEFT JOIN usuario uv ON uv.id = cri.usuarioid LEFT JOIN pessoa pv ON pv.id = uv.pessoaid
 WHERE cri.unidadenegocioid = ANY($1::bigint[])
   AND cc.datahora >= $2::date AND cc.datahora < ($3::date + 1);
```

⚠️ **`correcaocartaoreceber.unidadenegocioorigemid` é sempre NULL** neste banco — a loja tem que
vir de `cartaoreceber.unidadenegocioid` do título corrigido.

---

## 5. O motor

### 5.1 Casamento (cascata, cada título casa uma vez só)

1. `uni + NSU` exato
2. `uni + cauda do NSU` (últimos 8 dígitos) — o ERP prefixa o NSU de algumas operadoras
3. `uni + nº de autorização` (exato, depois cauda)
4. `uni + dia + valor` — palpite, marcado como `valor+dia` na tela

Havendo mais de um candidato, escolhe por nota: **valor igual (8) + mesmo dia (4) + mesma forma (2)
+ mesmo parcelamento (1)**, desempate pela hora mais próxima. Candidatos a mais de 30 h de distância
são descartados (o NSU é reciclado pela operadora em poucas semanas).

### 5.2 Divergências

| Tipo | Regra |
|---|---|
| `MODALIDADE` | grupo da operadora ≠ grupo da forma do ERP — **salvo** quando a forma pertence à operadora que pagou (de-para 2) |
| `PARCELAMENTO` | `parcelas` diferentes |
| `VALOR` | diferença > R$ 0,02 (soma das parcelas do ERP × venda da operadora) |
| `TAXA` | > 0,10 p.p. — **opcional** (`?taxa=1`), fora disso só o total no resumo |
| `SO_OPERADORA` | operadora pagou, ERP não tem título |
| `SO_ERP` | ERP tem título e a operadora não pagou — **só** dentro do escopo da operadora **e** em (loja, dia) que tenha relatório |

### 5.3 Índice do operador

`erros ÷ vendas de cartão do operador no período` (mínimo de 20 vendas para exibir).
Só contam `MODALIDADE`, `PARCELAMENTO` e `VALOR` — são os erros de digitação; sobras não são culpa do caixa.

---

## 6. Armadilhas (todas apareceram nos dados reais)

1. **Parcelado é dividido no ERP.** Uma venda de R$ 52,10 em 4x vira 4 títulos de ~13,02.
   A operadora reporta R$ 52,10. Sem agrupar, tudo vira "valor diferente".
2. **O mesmo NSU serve a duas vendas no mesmo dia.** Agrupar só por NSU soma vendas distintas
   (achamos R$ 1.068,66 no ERP × R$ 534,33 na operadora — exatamente o dobro). Por isso a chave leva
   `totalparcela + hora + origem`.
3. **O EDI traz a mesma venda em dois arquivos** (vendas, layout `J`, e liquidação, layout `L`).
   Sem o `DISTINCT ON` por lote, o valor dobra: 2.934 falsos "valor diferente" num mês.
4. **O ERP prefixa o NSU de algumas operadoras.** Le Card: relatório `92530852`, ERP `192530852`.
   Sem o match por cauda, 0% de casamento nessa operadora.
5. **Título já corrigido não pode ser acusado de novo.** Excluir quem está em
   `correcaocartaoreceberincorreto` (origem `C` em `cartaoreceber` = correção).
6. **`String(date).slice(0,10)`** com o driver `pg` devolve `"Thu Aug 2"` — sempre `to_char` no SQL.
7. **Convênio não é "crédito errado".** Brasil Card/Bracov aparecem no arquivo como crédito, mas no
   ERP têm forma própria. Por isso o de-para 2 tem precedência sobre o grupo.
8. **Pix quase nunca é da maquininha.** Incluir "04-PIX QRCode" no escopo da Rede gerou 335 falsos
   "não pagou" (R$ 16.863) num único dia.
9. **Dia sem relatório não pode gerar cobrança.** Ao rodar o mês com só 1 dia importado saíram
   15.367 falsos `SO_ERP`. O ERP só entra nos dias efetivamente cobertos.

`cartaoreceber.origem`: `V`=venda · `N`=entrega · `C`=correção · `R`=recebimento de crediário ·
`M`=manual · `O`/`P`=outros. `statusconciliacao`: `A`=não conciliado · `B`/`C`=conciliado.

---

## 7. Endpoints (`/api/conciliacao-cartao`, perfis Diretor/Gestor/Controladoria/Tesouraria/Financeiro)

| Método | Rota | O que faz |
|---|---|---|
| GET | `/lojas` | lojas da empresa |
| GET | `/painel?ini&fim&loja` | BI do período: confronto + correções + lotes + dias sem relatório |
| GET | `/divergencias?ini&fim&loja&operadora` | divergências dos relatórios importados |
| GET | `/edi?ini&fim&loja` | confronto usando os arquivos que o ERP já recebe (sem upload) |
| GET | `/correcoes?ini&fim&loja` | histórico de correções feitas no ERP |
| GET | `/lotes` · `/lotes/:id` · DELETE `/lotes/:id` | relatórios importados |
| POST | `/importar` `{conteudo(base64), nome, loja}` | sobe o relatório e já devolve o confronto |
| POST | `/tratativa` `{ref, tipo, status, valor, lojaId, operador, obs}` | marca corrigida/ignorada |
| GET | `/ajustes` · POST `/ajustes/modalidades` · POST `/ajustes/operadora` | de-para |

Layouts lidos hoje (detecção automática pelo cabeçalho, em `conciliacaoCartaoParsers.js`):
**Rede** (traz CNPJ, modalidade e taxa), **Brasil Card**, **Le Card**, **Bracov** (traz CNPJ),
**Nutricash**. Para incluir outra operadora basta somar uma assinatura + um parser — o motor não muda.

## 8. Resultado medido (agosto/2026)

- Fonte automática, mês inteiro: **22.314 transações, 99,7% casadas, 335 divergências** (13 de forma
  de pagamento, 8 de parcelamento, 5 de valor, 73 pagas sem título no ERP, 236 sem pagamento).
- Relatório da Rede de 20/08 (732 transações): **98,9% casadas, 11 divergências**.
- Correções manuais já feitas no ERP em agosto: **501** (169 trocando a forma), R$ 162.152,87.
