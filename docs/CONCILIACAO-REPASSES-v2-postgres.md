# Repasses de cartão — caminho técnico para a v2.0 (Postgres)

Parte 2 do módulo **💳 Conciliação de Cartões** (a parte 1, do confronto de vendas, está em
`CONCILIACAO-CARTOES-v2-postgres.md`). Aqui a pergunta é outra: **a credenciadora pagou tudo o que
devia, com a taxa combinada, e para qual filial?** — e a resposta não usa o ERP em momento nenhum,
nem o extrato bancário dele.

```
venda do dia (relatório da operadora) → o que o ERP registrou   ← Parte 1
venda conferida                        → parcela paga no repasse ← Parte 2
parcela paga                           → depósito por filial     ← Parte 2
depósito                               → taxa cobrada × contrato ← Parte 2
```

---

## 1. Fonte

Rede: **recebimentos → exportar relatório → Excel → "relatório detalhado"**. Um arquivo, várias abas:

| Aba | O que traz | Uso |
|---|---|---|
| `pagamentos` | uma linha por PARCELA paga: NSU, data da venda, bruto, taxa MDR, líquido, estabelecimento, banco/ag/cc | casar venda a venda e conferir a taxa |
| `recebidos` | o depósito consolidado (data + bandeira + modalidade + estabelecimento) | é o que cai na conta |
| `pagamentos futuros` | agenda do que ainda vai cair | previsão |
| `ajustes`, `cancelamentos e contestações`, `cobranças em aberto` | chargeback e descontos | o que foi tirado do repasse |

Medido no arquivo real de 20/08/2026: **1.064 parcelas**, bruto R$ 55.037,21 − MDR R$ 880,96 =
**R$ 54.156,25**, em **27 depósitos** — e os 27 fecham exato com a soma das parcelas.

O número do **estabelecimento** é o que abre o crédito por filial:
`48269786` Esplanada · `71713654` Rio Real · `73920746` Entre Rios 2 · `90625145` Entre Rios 1.


### 1.1 As outras seis credenciadoras (mapeadas em 24/08/2026)

Todo relatório passa pelo mesmo funil (`lerRepasse` → `{parcelas[], depositos[], ajustes[]}`), mas a
riqueza do que cada uma entrega é bem diferente. Vale saber o que dá para cobrar de cada uma:

| Credenciadora | Layout | Detalhe | O que dá para conferir |
|---|---|---|---|
| Rede | `REDE_RECEBIMENTOS` (xlsx, várias abas) | parcela a parcela + ajustes | tudo: valor, taxa, filial, vencimento |
| Alelo | `ALELO_RECEBIMENTOS` (xlsx, 2 abas) | parcela a parcela | valor, taxa, filial |
| Banese / Mulvi | `MULVI_RECEBIMENTOS` (xlsx) | parcela a parcela, com NSU | valor, taxa, parcelamento — **mas a loja não vem no arquivo** |
| Multi Mais / Uze | PDF | parcela a parcela | valor e data (taxa a revisar) |
| Bracov | `BRACOV_LOTES` (xls) | só o total do lote | valor, taxa e data de pagamento |
| Nutricash | `NUTRICASH_FECHAMENTO` (xlsx) | só o total do lote | valor e data de pagamento |
| Brasil Card | mesma tela das vendas, com o radio em **PGTO** | por data de pagamento | valor pago no dia |

**Mulvi Pay / Banese Card** (`mulvipay.com.br` → Minhas vendas ▸ Meus recebimentos ▸ Detalhado ▸ Excel).
Arquivo "Movimento Financeiro Analítico": `Data_Lançamento`, `Data_Transação`, `Bandeira`,
`Tipo_Transação`, `NSU`, `Parcela` (no formato `4/6`), `ValorBruto`, `ValorLiquido`. Fecha exato com
o portal (10 parcelas, R$ 702,98 bruto / R$ 670,26 líquido em 18 a 24/08/2026). Taxa medida:
**débito 1,80% · rotativo ~4,2% · parcelado 4,70%**.

**Bracov** (`www1.tln.com.br/ConsultaWeb` → Consultas ▸ Movimento de lotes fechados ▸ Planilha).
Colunas `VALOR · QUANT · TAXA · VALTAXA · VAL_LIQ · INICIO · FIM · N_FEC · DT_FECH · DT_PGTO ·
CREDENCIADO · NOME_CREDENCIADO · CNPJ`. Taxa **4% + R$ 3 fixos por lote**, fechamento quinzenal e
pagamento ~45 dias depois. Traz CNPJ por credenciado, então a filial sai sozinha.

**Brasil Card** (`brasilcard.net/bca/lojista/relatoriovenda`). A mesma tela serve para venda e para
repasse — o que muda é o radio **VENDA / PGTO**. Com **INCLUIR FILIAIS** marcado o arquivo ganha as
colunas `PDV` e `CNPJ`, que é o que permite ratear por loja: sem isso vem só a loja logada. Taxa
medida em 99 vendas reais: **1x 2,99% · 2x 3,49% · 3x ou mais 3,99%**.

---

## 2. Tabelas novas — DDL Postgres

```sql
-- de-para: número do estabelecimento na credenciadora → filial.
-- Aprende sozinho: o relatório de VENDAS traz estabelecimento + CNPJ, e o CNPJ acha a loja.
CREATE TABLE IF NOT EXISTS conc_estabelecimento (
  empresa_id      text NOT NULL,
  operadora       text NOT NULL,
  estabelecimento text NOT NULL,
  uni_erp         bigint,
  loja_id         text,
  cnpj            text,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, operadora, estabelecimento)
);

-- taxa combinada: por FILIAL (cada CNPJ tem seu credenciamento) e por FAIXA de parcelamento
CREATE TABLE IF NOT EXISTS conc_taxa_contratada (
  empresa_id    text NOT NULL,
  operadora     text NOT NULL,
  loja_id       text NOT NULL DEFAULT '*',   -- '*' = todas as filiais
  bandeira      text NOT NULL DEFAULT '*',   -- '*' = todas as bandeiras
  grupo         text NOT NULL,               -- DEBITO|CREDITO|PARCELADO|VOUCHER|PIX
  parcela_ini   integer NOT NULL DEFAULT 0,  -- faixa (2..6, 7..12); 0/0 = não se aplica
  parcela_fim   integer NOT NULL DEFAULT 0,
  taxa          numeric(7,4) NOT NULL,
  vigencia_ini  date,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, operadora, loja_id, bandeira, grupo, parcela_ini, parcela_fim)
);

CREATE TABLE IF NOT EXISTS conc_repasse_arquivo (
  id bigserial PRIMARY KEY, empresa_id text NOT NULL, operadora text, layout text,
  nome_arquivo text, hash text NOT NULL, data_ini date, data_fim date,
  linhas integer DEFAULT 0, valor_total numeric(14,2) DEFAULT 0,
  usuario_id text, importado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_conc_repasse_arquivo_hash UNIQUE (empresa_id, hash)
);

-- o depósito (o que cai na conta) — tipo: 'recebido' | 'a_receber'
CREATE TABLE IF NOT EXISTS conc_repasse (
  id bigserial PRIMARY KEY,
  arquivo_id bigint REFERENCES conc_repasse_arquivo(id) ON DELETE CASCADE,
  empresa_id text NOT NULL, operadora text, data date NOT NULL,
  estabelecimento text, uni_erp bigint, loja_id text,
  banco text, agencia text, conta text,
  bandeira text, modalidade text, grupo text,
  valor numeric(14,2), valor_bruto numeric(14,2), taxa numeric(7,4),
  status text, tipo text NOT NULL DEFAULT 'recebido'
);
CREATE INDEX IF NOT EXISTS ix_conc_repasse_dia ON conc_repasse (empresa_id, data, estabelecimento);

-- cada parcela paga, ligada ao depósito e à venda que eu já tinha conferido
CREATE TABLE IF NOT EXISTS conc_repasse_parcela (
  id bigserial PRIMARY KEY,
  arquivo_id bigint REFERENCES conc_repasse_arquivo(id) ON DELETE CASCADE,
  repasse_id bigint REFERENCES conc_repasse(id) ON DELETE CASCADE,
  empresa_id text NOT NULL, operadora text,
  data_recebimento date, data_venda date, data_vencimento date,
  nsu text, autorizacao text, lote text,
  estabelecimento text, uni_erp bigint, loja_id text,
  bandeira text, modalidade text, grupo text,
  parcelas integer, parcela integer,
  valor_bruto numeric(14,2), taxa numeric(7,4), valor_taxa numeric(14,2), valor_liquido numeric(14,2),
  status text, item_id bigint REFERENCES conc_item(id)
);
CREATE INDEX IF NOT EXISTS ix_conc_rep_parcela_busca ON conc_repasse_parcela (empresa_id, data_recebimento, estabelecimento);
CREATE INDEX IF NOT EXISTS ix_conc_rep_parcela_nsu   ON conc_repasse_parcela (empresa_id, nsu);

CREATE TABLE IF NOT EXISTS conc_repasse_ajuste (
  id bigserial PRIMARY KEY,
  arquivo_id bigint REFERENCES conc_repasse_arquivo(id) ON DELETE CASCADE,
  empresa_id text NOT NULL, operadora text,
  tipo text,                    -- ajuste | cancelamento | cobranca_aberta
  data date, data_venda date, nsu text,
  estabelecimento text, uni_erp bigint, loja_id text,
  bandeira text, motivo text, descricao text,
  valor numeric(14,2), pendente numeric(14,2)
);

-- validação do financeiro (ref: 'dep:<id>' | 'dia:2026-08-21')
CREATE TABLE IF NOT EXISTS conc_repasse_conferencia (
  id bigserial PRIMARY KEY, empresa_id text NOT NULL, ref text NOT NULL,
  status text NOT NULL DEFAULT 'aberto', valor numeric(14,2), obs text, usuario_id text,
  criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_conc_repasse_conf_ref UNIQUE (empresa_id, ref)
);

-- previsão por parcela, para quando a credenciadora não mandar a agenda:
-- sai do próprio relatório de vendas, que informa taxa, líquido e prazo
CREATE TABLE IF NOT EXISTS conc_previsao (
  id bigserial PRIMARY KEY, item_id bigint REFERENCES conc_item(id) ON DELETE CASCADE,
  empresa_id text NOT NULL, operadora text, uni_erp bigint, loja_id text, estabelecimento text,
  data_venda date, data_prevista date, bandeira text, grupo text,
  parcela integer, total_parcela integer,
  valor_bruto numeric(14,2), valor_liquido numeric(14,2), taxa numeric(7,4)
);
CREATE INDEX IF NOT EXISTS ix_conc_previsao_dia ON conc_previsao (empresa_id, data_prevista, estabelecimento);
```

Colunas somadas a `conc_item` na migration 191: `estabelecimento text`, `prazo_texto text`.

---

## 3. Regras do motor

- **Depósito × parcelas** — agrupa as parcelas por `(data, estabelecimento, bandeira, modalidade)`,
  com `PARCELADO` contando como `CREDITO` (é assim que a credenciadora consolida), e compara com o
  valor depositado. Tolerância R$ 0,02.
- **Parcela × venda** — casa `nsu` (depois `numero da autorização`) com `conc_item`, dentro da mesma
  loja. Uma parcela sem venda correspondente só vira divergência se o **dia daquela venda já tiver
  sido importado**; senão fica como *"dia não conferido"*. Sem essa regra, o repasse de hoje — que
  paga débito de ontem e a 5ª parcela de uma venda de março — apontaria centenas de falsos alarmes
  (no teste real: 1.028 de 1.064 parcelas).
- **Taxa** — efetiva = `soma(valor_taxa) / soma(valor_bruto)`, agrupada por
  `(filial, bandeira, grupo, parcelas)`. A esperada é a mais específica que casar:
  filial > todas · bandeira > todas · faixa que contém o parcelamento.
  Peso: `loja_id ≠ '*'` vale 4, `bandeira ≠ '*'` vale 2, faixa preenchida vale 1.
- **Rateio por filial** — vem do `estabelecimento`. O de-para é aprendido no import das VENDAS
  (que trazem estabelecimento + CNPJ) e é editável na tela.
- **Replicar taxas** — copia a tabela de uma filial para as outras (a negociação costuma ser a
  mesma), substituindo o que houver na filial de destino.

---

## 4. Endpoints (mesmo router `/api/conciliacao-cartao`)

| Método | Rota | O que faz |
|---|---|---|
| GET | `/repasses?ini&fim&loja` | conferência do período: depósitos, taxas, rateio por filial |
| GET | `/repasses/deposito/:id` | as parcelas que formaram aquele depósito |
| POST | `/repasses/importar` `{conteudo(base64), nome}` | sobe o relatório de recebimentos |
| POST | `/repasses/conferencia` `{ref, status, valor, obs}` | o financeiro marca como conferido |
| GET | `/repasses/config` | taxas cadastradas + estabelecimentos + lojas |
| POST | `/repasses/taxa` `{operadora, lojaId, bandeira, grupo, parcelaIni, parcelaFim, taxa}` | cadastra/atualiza |
| POST | `/repasses/taxa/excluir` | remove uma taxa |
| POST | `/repasses/taxa/replicar` `{operadora, deLojaId, paraLojas[]}` | copia entre filiais |
| POST | `/repasses/estabelecimento` | ajusta o de-para manualmente |
| GET/DELETE | `/repasses/lotes`, `/repasses/lotes/:id` | arquivos importados |

Arquivos: `lib/conciliacaoRepasseParsers.js` (leitura do relatório) · `lib/repasseCartao.js` (motor) ·
`db/migrations/191_conciliacao_repasse.js` e `192_taxa_contratada_filial.js` ·
aba **💰 Repasses** em `pages/ConciliacaoCartoes.js`.

---

## 5. Armadilha (além das 9 da Parte 1)

10. **A parcela do repasse quase nunca é da venda de hoje.** O crédito de hoje paga o débito de
    ontem e a 5ª parcela de uma venda de março. Comparar o repasse só com as vendas do dia gera
    divergência onde não há — a conferência precisa olhar a `data_venda` de cada parcela e saber
    quais dias já foram importados.

11. **Nem todo relatório diz de que loja ele é.** Rede, Alelo, Bracov e Brasil Card (com "incluir
    filiais") trazem CNPJ ou nº de estabelecimento por linha, e a filial sai sozinha. Mulvi,
    Nutricash e Le Card filtram a loja no próprio portal e não repetem isso dentro do arquivo —
    ali a loja tem que vir **escolhida no upload** e valer para o arquivo inteiro. Na v2.0:
    `POST /repasses/importar` aceita `loja_id` opcional, e `resolveLoja()` usa o de-para do
    estabelecimento primeiro e cai na loja escolhida como fallback.

12. **O grupo do repasse não é o grupo da venda.** No ERP existe UMA forma de pagamento para a
    Mulvi ("10-BANESE / MULVI PAY") cobrindo débito, rotativo e parcelado. Se o motor cobrar
    modalidade nessa operadora, acusa erro em 100% das vendas. Regra: convênio de bandeira própria
    entra com `grupo = NULL` do lado da venda (só valor e parcelamento são cobrados), enquanto no
    **repasse** o grupo real da operadora é usado, porque ali ele existe e a taxa depende dele.

13. **Data com ano de 2 dígitos.** A planilha do Bracov escreve `17/08/26`. O parser de data
    padrão (`dd/mm/aaaa`) devolve `null` e o arquivo inteiro vira "nenhum lote" em silêncio —
    sem erro nenhum. Na v2.0, o normalizador de data tem que aceitar `dd/mm/aa` (00–79 → 20xx).

14. **A diferença entre o que a operadora deve e o que ela pagou não é a taxa.** No PDF do Le Card
    e do Uze, `(compras − pago)` junta taxa de administração, antecipação, atraso e pagamento
    recebido em loja — dava 42% e 50% de "taxa". As duas últimas colunas numéricas da linha de
    crédito são sempre `Taxa Admin. compras` e `Compras`; usando essas, a taxa fica cravada em
    7,00% (Le Card, 44/44) e 4,70–5,00% (Uze). O resto vai para `outros_descontos`, num campo
    próprio. Na v2.0: `conc_repasse.valor_taxa` e `conc_repasse.outros_descontos` separados, e
    o confronto de taxa olha só o primeiro.

15. **No repasse da Rede, débito e crédito à vista vêm com `numero_parcelas = 0`, não 1.** Uma
    faixa cadastrada como 1..1 não casa e 21 mil parcelas ficam sem taxa de referência, em
    silêncio. A faixa desses grupos tem que ser 0/0 ("não se aplica").

16. **O lote do Bracov não lista venda a venda — tem que ser composto pelas vendas do período.**
    O "Movimento de Lotes fechados" traz só o total por lote (`VALOR`/`QUANT`/`VAL_LIQ`) e o
    período (`INICIO`–`FIM`) por CNPJ. As vendas que formam o lote são as que já foram importadas
    do relatório de VENDAS do Bracov: mesma loja (uni), `data_venda ∈ [INICIO, FIM]`. O import
    sintetiza uma parcela por venda encontrada, ligada à venda conferida (`item_id`) e ao
    depósito do lote — aí o lote fecha venda a venda. Se faltar venda no período, a soma fica
    abaixo do `VAL_LIQ` e o depósito "não fecha" (divergência real, não silêncio).

    **v2.0 (Postgres).** O layout de lote vira uma flag na importação:
    ```sql
    -- colunas já existentes em conc_repasse servem; o que muda é COMO as parcelas nascem:
    -- para layout 'BRACOV_LOTES' (e qualquer lote-só-total que se queira compor), o serviço de
    -- importação roda, por lote:
    INSERT INTO conc_repasse_parcela
      (arquivo_id, repasse_id, empresa_id, operadora, data_recebimento, data_venda, data_vencimento,
       nsu, autorizacao, lote, estabelecimento, uni_erp, loja_id, bandeira, modalidade, grupo,
       parcelas, parcela, valor_bruto, taxa, valor_taxa, valor_liquido, status, item_id)
    SELECT :arquivo_id, :repasse_id, :empresa_id, :operadora, :pago, i.data, :pago,
           i.nsu, i.autorizacao, :lote, :estab, :uni, :loja, 'Bracov', 'Convênio', 'CREDIARIO',
           COALESCE(i.parcelas,1), 1, i.valor, :taxa_pct,
           round(i.valor * :taxa_pct/100, 2), round(i.valor - i.valor*:taxa_pct/100, 2), 'PAGO', i.id
      FROM conc_item i
     WHERE i.empresa_id = :empresa_id AND i.operadora = :operadora
       AND i.uni_erp = :uni AND i.data BETWEEN :ini AND :fim;
    ```
    Idealmente guardar `conc_repasse.periodo_ini`/`periodo_fim` e `qtd_lote` para auditoria
    ("lote diz 5 vendas, achei 4").

17. **Previsão de repasse ≠ dinheiro que caiu — o reconhecimento é LOTE × EXTRATO do banco.**
    A Uze/Multi Mais exporta "Pagamentos efetuados / previsão" (layout posicional, agrupado por
    loja com CNPJ no cabeçalho; uma linha de crédito por lote: Data do Crédito, Vencimento Repasse,
    Compras bruto, Comissão, Valor pago, Status "Confirmado (R)"). "Confirmado" é a operadora
    dizendo que pagou — só o extrato bancário do ERP (`lancamentofinanceiro origem='F' tipo='E'`)
    confirma que o valor caiu. A auto-conferência passou a reconhecer **lotes-só-total** (sem
    parcela para "fechar") pelo próprio valor contra o extrato — antes eram ignorados porque
    `depositado ≠ soma_parcelas (=0)`.

    **v2.0 (Postgres).** O reconhecimento é uma query de casamento por (uni, valor) com janela de
    dias úteis, marcando a conferência quando bate:
    ```sql
    -- lote previsto (sem parcelas) reconhecido no extrato:
    UPDATE conc_repasse r SET status_conf = 'reconhecido', conferido_em = now()
     WHERE r.tipo = 'recebido' AND r.id = :dep_id
       AND NOT EXISTS (SELECT 1 FROM conc_repasse_parcela p WHERE p.repasse_id = r.id)
       AND EXISTS (
         SELECT 1 FROM lancamentofinanceiro lf
          WHERE lf.unidadenegocioid = :uni AND lf.origem='F' AND lf.tipo='E'
            AND lf.datahora >= :ini::date AND lf.datahora < (:fim::date + 6)
            AND round(lf.valor::numeric,2) = round(r.valor,2));
    -- o que NÃO bate fica 'previsto' (a conferir): previsão que a operadora confirmou mas
    -- ainda não localizei no banco.
    ```
    Resolução de loja por CNPJ vale para depósitos também (Uze/Bracov trazem o CNPJ no lote, não
    só na parcela); normalizar os dois lados em dígitos — `unidadenegocio.cnpj` no ERP é só dígito.

18. **Filtros multi-loja/operadora e "Depósitos que não fecham" (por bandeira × extrato).**
    O filtro de loja passou a aceitar VÁRIAS lojas (CSV); no app isso virou cláusulas `loja_id IN (…)`
    nas conferências locais (conferir, conferirVencimentos, conferirNoBanco, custoMaquinas) e
    `unisEmpresa` já aceitava CSV no lado ERP. O repasse ganhou filtro multi-operadora (`operadoras`
    CSV → `resumo.porOperadora`). A conferência lote×extrato (conferirNoBanco) virou **aba própria**
    ("Depósitos que não fecham") com duas visões: por LOTE (data|loja|operadora) e por BANDEIRA (cada
    `conc_repasse` recebido, casado 1-a-1 com o crédito do extrato por estabelecimento+valor+data±6d),
    sinalizando "caiu em outra data" (`banco_data <> data`).

    **v2.0 (Postgres).** Multi-loja é `WHERE loja_id = ANY($lojas)`. Por bandeira × extrato:
    ```sql
    SELECT r.*, b.data AS banco_data,
           (b.id IS NOT NULL) AS caiu, (b.id IS NOT NULL AND b.data <> r.data) AS em_outra_data
      FROM conc_repasse r
      LEFT JOIN LATERAL (
        SELECT eb.id, eb.datahora::date AS data FROM extratobancario eb
         JOIN contabancaria cb ON cb.id = eb.contabancariaid
         JOIN contacorrente cc ON cc.id = cb.contacorrenteid
        WHERE cc.unidadenegocioid = ANY(:bank_unis) AND eb.valor > 0
          AND round(eb.valor::numeric,2) = round(r.valor,2)
          AND regexp_replace(upper(coalesce(eb.descricao,'')),'\D','','g') LIKE '%'||regexp_replace(r.estabelecimento,'\D','','g')||'%'
          AND eb.datahora::date BETWEEN r.data - 6 AND r.data + 6
        ORDER BY abs(eb.datahora::date - r.data) LIMIT 1) b ON true
     WHERE r.tipo='recebido' AND r.data BETWEEN :ini AND :fim;
    ```

19. **Conciliação de Recebimento (#17): Efetuar Recebimento (ERP) × repasse pago.** Nova aba que
    lista os títulos A RECEBER do ERP — `cartaoreceber` com `recebimentocartaoid IS NULL` e
    `status <> 'C'`, por `datavencimento`, menos os já corrigidos (`correcaocartaoreceberincorreto`) —
    e marca cada um como conciliado quando bate com uma parcela de repasse já importada
    (`conc_repasse_parcela`) por `uni_erp + NSU` (ou autorização), mostrando de qual operadora/lote
    caiu. O que não bate fica pendente ("não caiu no meio dos lotes"). Filtro conciliou/não é
    server-side; valor/modalidade/NSU na tela. Teto de 10 mil linhas na resposta + trava de 60 mil
    no ERP (a tela sempre filtra por vencimento).

    **v2.0 (Postgres).**
    ```sql
    SELECT cr.id, cr.unidadenegocioid, mc.nome modalidade, cr.valor, cr.datavencimento, cr.numerotransacao nsu,
           p.operadora, p.data_recebimento, p.lote, (p.id IS NOT NULL) AS conciliado
      FROM cartaoreceber cr
      LEFT JOIN modalidadecartao mc ON mc.id = cr.modalidadecartaoid
      LEFT JOIN conc_repasse_parcela p
        ON p.uni_erp = cr.unidadenegocioid
       AND regexp_replace(p.nsu,'\D','','g') = regexp_replace(cr.numerotransacao,'\D','','g')
     WHERE cr.unidadenegocioid = ANY(:unis) AND cr.recebimentocartaoid IS NULL AND cr.status <> 'C'
       AND cr.datavencimento BETWEEN :ini AND :fim
       AND NOT EXISTS (SELECT 1 FROM correcaocartaoreceberincorreto ci WHERE ci.cartaoreceberid = cr.id);
    ```
