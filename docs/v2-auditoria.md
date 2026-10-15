# v2.0 — Menu Auditoria (Postgres)

Módulo de **leitura pura do ERP** (não cria tabela no app, não escreve no ERP). Na v2.0 em
Postgres, as duas telas são duas queries de leitura sobre o próprio ERP A7.

## (A) Lançamentos manuais na conta corrente

O que é: o que foi **digitado à mão** na conta corrente (recarga, desconto a cliente, ajuste),
em oposição à baixa automática de cartão e à baixa de contas a pagar. Identificado pelo
`tipomovimentacaocontacorrente.descricao IN ('Lançamento de Entrada','Lançamento de Saída')`.

```sql
SELECT m.datahora, cc.nome AS conta, cc.unidadenegocioid AS loja_erp,
  tm.descricao AS tipo, tm.credito, m.valor, m.descricao, m.numerodocumento,
  COALESCE(pu.nome, u.login) AS usuario, pl.nome AS plano_contas
FROM movimentacaocontacorrente m
JOIN contacorrente cc ON cc.id = m.contacorrenteid
JOIN tipomovimentacaocontacorrente tm ON tm.id = m.tipomovimentacaocontacorrenteid
   AND tm.descricao IN ('Lançamento de Entrada','Lançamento de Saída')
LEFT JOIN usuario u ON u.id = m.usuarioid
LEFT JOIN pessoa pu ON pu.id = u.pessoaid
LEFT JOIN LATERAL (
  SELECT p.nome FROM lancamentofinanceiro lf
  JOIN planocontas p ON p.id = lf.planocontasid
  WHERE lf.movimentacaocontacorrenteid = m.id LIMIT 1
) pl ON TRUE
WHERE cc.unidadenegocioid = ANY($1::bigint[])
  AND lower(COALESCE(pu.nome, u.login, '')) <> 'sistema'  -- baixa automática do ERP, não manual
  AND cc.id = ANY($2::bigint[])                            -- opcional: contas selecionadas (0..N)
  AND m.datahora >= $3::date AND m.datahora < ($4::date + interval '1 day')
ORDER BY m.datahora DESC LIMIT 2000;
```

Mapa loja: `cc.unidadenegocioid` (ERP) → nome, via tabela `lojas.erp_unidadenegocio_id` do app.

Regras pedidas pelo Joe:
- Usuário **"sistema"** = baixa automática do ERP → **não** é lançamento manual, fica fora.
- Descrição que começa com **"Baixa de Cartão…"** = reprocessamento do arquivo de cartão re-lançado
  à mão (às vezes o arquivo precisa reprocessar). Marcado com `reprocesso_cartao` e ocultado por
  padrão (`semCartao=1` → `AND m.descricao NOT ILIKE 'Baixa de Cart_o%'`). Dá pra mostrar.
- A tela permite **selecionar várias contas** (multi-select). A lista de contas vem de
  `GET /contabilidade/extrato/contas` (`contacorrente` status A, banco/cofre/orçamento).
  O filtro é `cc.id = ANY(...)`; sem seleção = todas.

## (C) Conciliação BANCÁRIA — situação por conta/banco

O que Joe realmente queria na Auditoria (não a de cartão, que ficou mantida). Linha do extrato
do banco (`extratobancario`, importado por OFX/CNAB) está **conciliada** se tem link em
`extratobancarioconciliacao` (liga a linha ao `movimentacaocontacorrente`). Senão, pendente.
Conta/banco vem de `contabancaria.contacorrenteid → contacorrente` (nome + `unidadenegocioid`).

```sql
SELECT cc.id AS conta_id, cc.nome AS conta, cc.unidadenegocioid AS loja_erp,
  COUNT(*) AS linhas,
  COUNT(*) FILTER (WHERE ec.id IS NOT NULL) AS conciliadas,
  COUNT(*) FILTER (WHERE ec.id IS NULL) AS pendentes,
  ABS(SUM(eb.valor) FILTER (WHERE ec.id IS NULL)) AS valor_pendente,
  ROUND(AVG(EXTRACT(EPOCH FROM (now()-eb.datahora))/86400) FILTER (WHERE ec.id IS NULL)::numeric,1) AS dias_atraso_medio,
  MIN(eb.datahora) FILTER (WHERE ec.id IS NULL) AS pendente_mais_antigo
FROM extratobancario eb
JOIN contabancaria cb ON cb.id = eb.contabancariaid
JOIN contacorrente cc ON cc.id = cb.contacorrenteid
LEFT JOIN extratobancarioconciliacao ec ON ec.extratobancarioid = eb.id
WHERE cc.unidadenegocioid = ANY($1::bigint[])
  AND eb.datahora >= $2::date AND eb.datahora < ($3::date + interval '1 day')
GROUP BY cc.id, cc.nome, cc.unidadenegocioid ORDER BY linhas DESC;
```

Drill-down das pendentes: mesma base com `ec.id IS NULL` + `cc.id = $conta`, trazendo
`eb.datahora, eb.valor, eb.descricao, eb.numerodocumento, tipomovimentacaoextratobancario.descricao`.

Rotas: `GET /contabilidade/auditoria/bancaria` e `/auditoria/bancaria/pendentes`.
Lib: `conciliacaoBancaria`, `conciliacaoBancariaPendentes` em `auditoriaErp.js`.
Tela: 3 abas (`manuais` | `bancaria` | `cartao`) em `AuditoriaContabil.js`.

## (B) Conciliação de cartão — situação por operadora

O que é: quanto do cartão já foi **conciliado (baixado)** × quanto está **pendente** e há quantos
dias. `conciliacaocartaoitem.baixadata IS NULL` = pendente. Atraso = `now() − datavencimento`
dos pendentes. Operadora vem de `conciliacaocartaooperadora.nome` via `conciliacaocartao`.

```sql
SELECT COALESCE(op.nome,'—') AS operadora,
  COUNT(*) AS itens, SUM(i.valor) AS valor,
  COUNT(*) FILTER (WHERE i.baixadata IS NOT NULL) AS conciliados,
  COUNT(*) FILTER (WHERE i.baixadata IS NULL) AS pendentes,
  SUM(i.valor) FILTER (WHERE i.baixadata IS NULL) AS valor_pendente,
  ROUND(AVG(EXTRACT(EPOCH FROM (now()-i.datavencimento))/86400)
        FILTER (WHERE i.baixadata IS NULL)::numeric,1) AS dias_atraso_medio,
  MIN(i.datavencimento) FILTER (WHERE i.baixadata IS NULL) AS pendente_mais_antigo
FROM conciliacaocartaoitem i
JOIN conciliacaocartao c ON c.id = i.conciliacaocartaoid
LEFT JOIN conciliacaocartaooperadora op ON op.id = c.conciliacaocartaooperadoraid
WHERE i.datavencimento >= $1::date AND i.datavencimento < ($2::date + interval '1 day')
GROUP BY op.nome ORDER BY itens DESC;
```

Obs.: `conciliacaocartao` fica em `unidadenegocioid = 1` (nível empresa), por isso a conciliação
não filtra por loja — é consolidada por operadora.

## Backend atual (v1)
- `backend/src/lib/auditoriaErp.js` — `conciliacaoTempo({de,ate})`, `lancamentosManuais(unis,{de,ate,conta})`.
- Rotas em `backend/src/routes/contabilidade.js`: `GET /contabilidade/auditoria/manuais`,
  `GET /contabilidade/auditoria/conciliacao`. Perfis: Diretor/Gestor/Controladoria/Contabilidade.
- Tela: `frontend/src/pages/AuditoriaContabil.js` (menu Administrativo › Contabilidade › Auditoria,
  id `auditoria-contabil`). Não confundir com `Auditoria.js` = Checklist de Supervisão (outro módulo).

## Filtro por plano de contas (manuais)
`GET /auditoria/manuais/planos` → distintos `planocontas.nome` presentes (inclui NULL=sem plano),
via mesmo LEFT JOIN LATERAL. Filtro na lista: `plano=<nome>` (`AND pl.nome=$n`) ou `plano=__SEM__`
(`AND pl.nome IS NULL`).

## Índice de conciliação bancária (dias úteis)
`GET /auditoria/bancaria/indice` traz TODAS as contas de banco (base `contabancaria JOIN contacorrente`),
com `conciliado_ate = MAX(eb.datahora) FILTER (ec.id IS NOT NULL)` e `ultima_linha = MAX(eb.datahora)`.
No Node: `dias_uteis_atraso = diasUteisEntre(conciliado_ate, hoje)` (0 se em dia/futuro),
`indice = conciliado_ate==null ? 0 : max(0, 100 - 15*atraso)`. Índice geral = média das contas com linhas.
`lib/feriados.js`: `feriadosBR(ano)` (fixos nacionais + Carnaval/Sexta Santa/Corpus Christi por Páscoa
de Gauss + Bahia 02/07) e `diasUteisEntre(de,ate)` (exclui sáb/dom/feriado). Em v2.0 os feriados
podem virar cadastro (hoje são calculados, não valor fixo).

## NF da pasta — OCR + cache (aba "NF / Pendências")
- OCR: `lerNf.ocrViaClaude(b64)` manda o PDF como content block `document` pro Claude (Messages API,
  reusa ANTHROPIC_API_KEY), pede JSON {ehNf,numero,cnpj,valor,fornecedor}. Deploy-proof (sem poppler).
  `lerComprovante(b64,{ocr})`/`lerArquivoPdf(caminho,{ocr})` só chamam OCR quando não há texto.
- Cache: migration **229** `contabil_nf_pasta_cache` (PK empresa+caminho; revalida por tamanho+mtime).
  `varrerPasta` lê do cache quando o arquivo não mudou; só reprocessa novos/alterados; devolve
  `lidosAgora`/`doCache`. Vínculo manual: `GET /nf-pasta/titulos?q=&valor=&loja=` (candidatos do
  contas a pagar por fornecedor/documento e valor ±5%, exclui já vinculados) + `POST /nf-pasta/vincular`.
