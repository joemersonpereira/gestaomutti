# NF na SEFAZ não lançada + BI de tempo de entrada (Espião × Alpha) — caminho técnico v2.0 (Postgres)

## O que faz

Três telas dentro de **Contabilidade**, todas apoiadas na integração **Espião NFe** (captura o que a
SEFAZ tem) cruzada com o **ERP A7** (o que foi efetivamente lançado no estoque). Nenhuma delas
escreve no ERP — é confronto/leitura, "segunda opinião".

1. **NF na SEFAZ não lançada no Alpha** (`GET /contabilidade/sped/entradas-faltantes`)
   Para a competência e a(s) loja(s), pega as NF-e de **entrada** (recebidas) que a SEFAZ registrou
   e tira as que já têm a `chaveacesso` lançada no `notafiscal` do ERP. O que sobra **faltou dar
   entrada**. Cada nota traz **`dias`** (hoje − emissão), a lista vem ordenada da **mais antiga
   primeiro** (a mais urgente), e o backend conta as **urgentes** (≥ 7 dias). Filtro `diasMin` ("só
   com mais de X dias") e padrão **todas as lojas**.

2. **BI — tempo de entrada** (`GET /contabilidade/espiao/lead-estoque`)
   Mede o intervalo entre a **emissão do XML** (`datahoraemissao`) e a **entrada efetiva no estoque**
   (`datahoraentrada`), por loja, na competência: média, mediana, pior caso, distribuição em faixas
   (buckets) e as **10 notas mais lentas** com fornecedor e datas. Fonte 100% ERP (rápido, não
   depende do Espião).

3. **Card-resumo no painel** (`GET /contabilidade/espiao/lead-resumo`)
   Versão enxuta do BI, agregada no **grupo** (todas as lojas de uma vez), para o cartão do topo do
   painel: total de notas, média, mediana, % entregue em ≤ 3 dias, nº de lentas (≥ 7 d) e o ranking
   de média por loja. Um clique leva para a aba ⏱️ *Tempo de entrada*.

4. **Baixar XML (opcional)** (`GET /contabilidade/espiao/xml/:chave`)
   Download do XML de uma nota específica, **sob demanda** — só quando o usuário clica no 📥 XML da
   linha. O confronto em si **não baixa nada**; este endpoint é um proxy puro para o Espião.

## Regra de negócio

- **Entrada = `fornecedorid IS NOT NULL`** no `notafiscal`. É isso que separa nota de entrada
  (compra/recebimento) das demais.
- **Chave canônica**: sempre comparar `regexp_replace(chaveacesso,'[^0-9]','','g')` dos dois lados
  (o Espião e o ERP guardam a chave com formatações diferentes).
- **Janela ampla no cruzamento de faltantes**: para não acusar como "faltante" uma nota que foi
  lançada em **outro mês**, a busca de chaves já lançadas vai de `emissão − 90 dias` até
  `fim do mês + 40 dias`. A competência limita o que a SEFAZ devolve, não o que o Alpha pode ter.
- **Canceladas não contam** (`situacao ~ /cancel/i`), nem chave repetida na mesma resposta.
- **Lead time só com `datahoraentrada >= datahoraemissao`** (descarta sujeira de data que daria
  negativo). `dias` é fracionário (`EXTRACT(EPOCH ...)/86400`).
- **CNPJ da loja** tem de ter 14 dígitos e a loja precisa de `erp_unidadenegocio_id`; sem isso a
  loja é ignorada em silêncio (igual ao resto do sistema).
- **Urgência** fixada em **7 dias** para o destaque e o contador; o filtro `diasMin` é livre
  (3/7/15/30). Em v2.0, considerar virar cadastro (ver "parametrizar" abaixo).

## Tabelas do ERP usadas (somente leitura)

| tabela | colunas | papel |
|---|---|---|
| `notafiscal` | `unidadenegocioid`, `fornecedorid`, `chaveacesso`, `numero`, `datahoraemissao`, `datahoraentrada` | nota de entrada lançada no Alpha |
| `fornecedor` | `id`, `pessoaid` | nome do emitente (nas 10 mais lentas) |
| `pessoa` | `id`, `razaosocial`, `nome` | razão social / nome do fornecedor |

Do lado do app (SQLite hoje, Postgres na v2.0) só se lê a tabela **`lojas`**: `id`, `cnpj`,
`erp_unidadenegocio_id`, `empresa_id`. **Nenhuma tabela nova é necessária** para estas telas — é
tudo consulta. (A tela de SEFAZ×SPED que grava faltantes no banco de correção usa
`contabil_sped_erro`, documentada em `SPED-*`; não é esta.)

## SQL Postgres (v2.0) — igual ao que roda hoje

### 1) Chaves já lançadas no Alpha (para achar as faltantes)
```sql
SELECT DISTINCT regexp_replace(chaveacesso,'[^0-9]','','g') AS chave
FROM notafiscal
WHERE unidadenegocioid = $1
  AND chaveacesso IS NOT NULL
  AND datahoraemissao >= ($2::date - interval '90 days')
  AND datahoraemissao <  ($3::date + interval '40 days');
-- $1 = unidadenegocioid ; $2 = 1º dia da competência ; $3 = último dia da competência
```
O conjunto resultante é subtraído das chaves que a SEFAZ devolveu (via Espião) no período.

### 2) BI de tempo de entrada por loja (`lead-estoque`)
```sql
WITH e AS (
  SELECT EXTRACT(EPOCH FROM (datahoraentrada - datahoraemissao))/86400.0 AS dias
  FROM notafiscal
  WHERE unidadenegocioid = $1 AND fornecedorid IS NOT NULL
    AND datahoraentrada >= $2::date AND datahoraentrada < ($3::date + interval '1 day')
    AND datahoraemissao IS NOT NULL AND datahoraentrada >= datahoraemissao
)
SELECT COUNT(*) n,
       ROUND(AVG(dias)::numeric,2) media,
       ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY dias))::numeric,2) mediana,
       COUNT(*) FILTER (WHERE dias < 1)                   ate1,
       COUNT(*) FILTER (WHERE dias >= 1  AND dias < 3)    d13,
       COUNT(*) FILTER (WHERE dias >= 3  AND dias < 7)    d37,
       COUNT(*) FILTER (WHERE dias >= 7  AND dias < 15)   d715,
       COUNT(*) FILTER (WHERE dias >= 15)                 m15,
       ROUND(MAX(dias)::numeric,1) pior
FROM e;
```
As 10 mais lentas (mesma janela):
```sql
SELECT nf.numero,
       COALESCE(p.razaosocial, p.nome) AS fornecedor,
       to_char(nf.datahoraemissao,'DD/MM/YYYY') AS emissao,
       to_char(nf.datahoraentrada,'DD/MM/YYYY') AS entrada,
       ROUND((EXTRACT(EPOCH FROM (nf.datahoraentrada - nf.datahoraemissao))/86400.0)::numeric,1) AS dias
FROM notafiscal nf
LEFT JOIN fornecedor f ON f.id = nf.fornecedorid
LEFT JOIN pessoa     p ON p.id = f.pessoaid
WHERE nf.unidadenegocioid = $1 AND nf.fornecedorid IS NOT NULL
  AND nf.datahoraentrada >= $2::date AND nf.datahoraentrada < ($3::date + interval '1 day')
  AND nf.datahoraemissao IS NOT NULL AND nf.datahoraentrada >= nf.datahoraemissao
ORDER BY (nf.datahoraentrada - nf.datahoraemissao) DESC
LIMIT 10;
```

### 3) Resumo do grupo (`lead-resumo`, card do painel)
```sql
-- agregado (IN com todas as unidades da empresa)
WITH e AS (
  SELECT EXTRACT(EPOCH FROM (datahoraentrada - datahoraemissao))/86400.0 dias
  FROM notafiscal
  WHERE unidadenegocioid IN ($3,$4,...) AND fornecedorid IS NOT NULL
    AND datahoraentrada >= $1::date AND datahoraentrada < ($2::date + interval '1 day')
    AND datahoraemissao IS NOT NULL AND datahoraentrada >= datahoraemissao
)
SELECT COUNT(*) n, ROUND(AVG(dias)::numeric,2) media,
       ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY dias))::numeric,2) mediana,
       COUNT(*) FILTER (WHERE dias < 3)  ate3,
       COUNT(*) FILTER (WHERE dias >= 7) lentas7
FROM e;

-- média por unidade (para o ranking)
SELECT unidadenegocioid uni, COUNT(*) n,
       ROUND(AVG(EXTRACT(EPOCH FROM (datahoraentrada - datahoraemissao))/86400.0)::numeric,2) media
FROM notafiscal
WHERE unidadenegocioid IN ($3,$4,...) AND fornecedorid IS NOT NULL
  AND datahoraentrada >= $1::date AND datahoraentrada < ($2::date + interval '1 day')
  AND datahoraemissao IS NOT NULL AND datahoraentrada >= datahoraemissao
GROUP BY unidadenegocioid;
```

## Integração Espião NFe (API v1-cloud)

- Cliente: `backend/src/lib/espiaoNfe.js`. Base `https://api.espiaonfe.com.br`.
- **Auth por header**: `esp-cloud-token` (conta) + `user-token` (usuário).
- Endpoints usados:
  - `GET /v1-cloud/empresas` — teste de credencial (`testarConexao`).
  - `GET /v1-cloud/consulta/periodo/nfe-resumo` — resumo paginado do período
    (`cnpjCpf`, `dataInicial`, `dataFinal` em `yyyy-MM-dd`, `emitidaRecebida=0` recebidas, `modelo=55`).
  - `GET /v1-cloud/consulta/chave/xml` — XML por chave (o download opcional). XML vem em `dados.mensagem`.
- **Cota 3 req/s** → tratamento de 429/503: pausa mínima de 350 ms entre chamadas + retry com backoff.
- Tokens **só no ambiente** (`ESPIAO_V1_TOKEN_CONTA`, `ESPIAO_V1_TOKEN_USUARIO`, `ESPIAO_V1_API_BASE`),
  nunca no banco nem no repositório. Em v2.0 seguem como variáveis de ambiente do serviço.

> ⚠️ **Operacional (não é bug de código):** se o par de tokens do `.env.production` estiver errado,
> a tela de faltantes e o download de XML não funcionam (a de BI funciona, porque é só ERP). O
> indicador 🔎 em Contabilidade mostra 🟢 (ok) / 🟡 (token recusado).

## Parametrizar na v2.0 (regra 4 do projeto: nada fixo no código)

Hoje o limiar de urgência (**7 dias**) e as **faixas do BI** (1 / 3 / 7 / 15) estão no código.
Sugestão para a v2.0 — virar cadastro por empresa:

```sql
CREATE TABLE IF NOT EXISTS contabil_leadtime_config (
  empresa_id       TEXT    NOT NULL,
  chave            TEXT    NOT NULL,
  valor            TEXT,
  label            TEXT,
  PRIMARY KEY (empresa_id, chave)
);

INSERT INTO contabil_leadtime_config (empresa_id, chave, valor, label) VALUES
 ('empresa-mutti-001','urgencia_dias','7','Dias sem lançar a partir dos quais a NF faltante é urgente'),
 ('empresa-mutti-001','buckets_dias','1,3,7,15','Cortes das faixas do BI de tempo de entrada (em dias)')
ON CONFLICT (empresa_id, chave) DO NOTHING;
```

### Cache opcional do resumo da SEFAZ (desempenho)
A consulta de período no Espião é paginada e limitada a 3 req/s; um mês movimentado demora. Em v2.0
vale cachear o **resumo** por loja+competência (não o XML), invalidando quando o usuário pede
"reconferir":

```sql
CREATE TABLE IF NOT EXISTS espiao_resumo_cache (
  empresa_id   TEXT        NOT NULL,
  cnpj         TEXT        NOT NULL,
  competencia  TEXT        NOT NULL,   -- 'AAAA-MM'
  notas        JSONB       NOT NULL,   -- resumo (chave, numero, emitente, datas, valor, possuiXml)
  atualizado   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, cnpj, competencia)
);
```

## Erro devolvido quando o Espião falha (contrato desde 2026-10-19)

Toda rota que chama o Espião (`sped/espiao/status`, `sped/entradas-faltantes`,
`sped/:id/cruzar-espiao`, `espiao/xml/:chave`) devolve, em caso de falha, o mesmo formato. A
rota responde **502**, e o `/status` responde 200 com `ok:false`:

```json
{
  "erro": "Espião respondeu HTTP 401 (Não autorizado) em /v1-cloud/empresas: \"Token não autorizado\". A API recusou o par de tokens …",
  "status": 401,
  "detalhe": {
    "status": 401, "codigo": "HTTP 401 (Não autorizado)",
    "mensagemApi": "Token não autorizado", "endpoint": "/v1-cloud/empresas",
    "dica": "…", "tokens": { "conta": "69bb8d83", "usuario": "319ea23f" },
    "em": "2026-10-20T02:03:51.156Z"
  }
}
```

- `status` é o código HTTP **do Espião** (0/`null` = sem resposta: rede, DNS ou timeout de 30 s).
- `tokens` traz a **impressão digital** de cada token (8 primeiros hex do sha256), nunca o valor.
  Serve para conferir, pela tela, qual token o servidor carregou depois de trocar o `.env`.
- `dica` vem de uma tabela por código. Para 401, a mensagem da API diz qual token falhou: *"Token U
  inválido"* = usuário, *"Token C inválido"* = conta. *"Token não autorizado"* é genérico, e a API
  devolve a mesma resposta para tokens inventados.
- Atenção: `/v1-cloud/consulta/chave/xml` valida a chave **antes** do token. Um 400 nesse endpoint
  não prova que os tokens são válidos.

### Paginação e limite de chamadas (conferido na API real em 2026-10-19)

- **Fim da paginação é `"codigoProximaPagina": "-1"`**, e não campo vazio. Pedir a página `"-1"`
  **devolve a página 1 de novo**: quem testar só "veio algum código?" entra em laço e repete as
  mesmas notas. Até 2026-10-19 o v1 fazia exatamente isso. Pare quando o código for `"-1"` ou
  ausente.
- Cada página tem até 100 itens (exemplo real: Esplanada, 01–19/out = 334 notas em 4 páginas).
- **Limite de 3 chamadas/s por conta**: acima disso a API responde 429 *"API calls quota
  exceeded"*. O v1 usa uma fila única com ≥ 400 ms entre chamadas e tenta de novo até 2 vezes no
  429 (1,5 s, depois 3 s). Na v2.0, se houver mais de uma instância, a fila tem de ser
  compartilhada (o limite é da conta, não do processo).
- Os cabeçalhos são `esp-cloud-token` (conta) e `user-token` (usuário), como no swagger
  `v1-cloud`. Existe também um swagger `v1-api`, de outro produto, que este sistema não usa.

Nenhuma tabela nova. Em v2.0, o mesmo contrato vale para qualquer cliente de API externa. Se for
útil guardar histórico das falhas:

```sql
CREATE TABLE IF NOT EXISTS integracao_falha_log (
  id           BIGSERIAL   PRIMARY KEY,
  empresa_id   TEXT        NOT NULL,
  integracao   TEXT        NOT NULL,            -- 'espiao'
  endpoint     TEXT        NOT NULL,
  status_http  INTEGER,                         -- NULL = sem resposta
  mensagem_api TEXT,
  token_digital JSONB,                          -- {"conta":"…","usuario":"…"} (sha256/8, nunca o token)
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intfalha_emp_int ON integracao_falha_log (empresa_id, integracao, criado_em DESC);
```

## Arquivos (v1, SQLite)

- `backend/src/routes/contabilidade.js` — rotas `sped/entradas-faltantes`, `espiao/lead-estoque`,
  `espiao/lead-resumo`, `espiao/xml/:chave`.
- `backend/src/lib/espiaoNfe.js` — cliente da API do Espião.
- `frontend/src/pages/Contabilidade.js` — componentes `NfFaltantes`, `LeadTime`, `LeadResumoCard`
  (aba ⏱️ *Tempo de entrada*; card no topo do painel; botão 📥 XML opcional por linha).
