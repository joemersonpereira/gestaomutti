# Conversão Giro Premiado / E-commerce × ERP A7 — caminho técnico v2.0 (Postgres)

## O que faz
Todo dia, no horário configurado (padrão **18:00**, horário da Bahia), a rotina:
1. Lê os checkouts **pendentes** da API do e-commerce (`GET /api/ecomm/pending-checkouts?all=true`).
   A API só devolve quem preencheu o formulário e ainda não tem venda registrada.
2. Separa os **testes**: nome com "teste" e qualquer checkout do mesmo telefone.
3. Para cada cliente, procura vendas no A7 **depois** do checkout, dentro da janela (padrão 15 dias).
4. Grava o resultado no histórico e **registra na API** (`POST /api/ecomm/register-purchase`) as vendas confirmadas.

### Regra de negócio (definida pelo Joe em 29/09/2026)
- **Só há cruzamento se o cliente for identificado por TELEFONE ou NOME.**
  - Telefone: últimos 8 dígitos do telefone do formulário = `contato` (ddd+contato) do cadastro
    da pessoa, ou `venda.ddd + venda.contato`.
  - Nome: nome completo (sem acento, maiúsculo) = `venda.nome` ou `pessoa.nome` da venda.
- **Só é venda se o cliente levou o MESMO produto do giro ou uma VARIAÇÃO** dele. Variação =
  as N primeiras palavras da descrição iguais (config `palavras_variacao`, padrão 3 = tipo + marca
  + linha). Ex.: "ENXAGUANTE BUCAL PLAX FRESH MINT" → "ENXAGUANTE BUCAL PLAX MELANCIA" conta;
  "SHAMPOO HASKELL" → "CONDICIONADOR HASKELL" não conta.
- **Item diferente não é venda**: o checkout fica como `visita` e **não vai para a API**.
- Cada item de cupom (`itemvenda.id`) confirma **no máximo 1 checkout**: o mais recente do cliente
  anterior à compra. Um item já usado nunca confirma outro checkout (o cliente pode ter girado o
  mesmo produto mais de uma vez).
- Valor enviado à API = valor do **item** (`itemvenda.valortotal`), não do cupom.
  `transaction_id` = `A7-COO-<coo>`.

### Resultados
| resultado | significado |
|---|---|
| `registrada` | venda confirmada e registrada na API (200, ou 409 = já estava registrada) |
| `apontada` | venda confirmada, mas `registrar_auto=0` (ou execução simulada) |
| `visita` | cliente identificado comprou depois do checkout, mas outro item |
| `aguardando` | sem compra ainda, janela aberta |
| `sem_compra` | janela encerrada sem compra |
| `teste` | checkout de teste |
| `erro` | falha no ERP ou na API (detalhe no campo `detalhe`) |

## Arquivos (v1, SQLite)
- `backend/src/lib/ecommConversao.js` — regra e execução (`executar`, `talvezExecutar`)
- `backend/src/routes/ecommConversao.js` — `GET /api/ecomm-conversao`, `PUT /config/:chave`, `POST /executar` (`{simular:true}` não registra)
- `backend/src/server.js` — agendador: checa a cada 5 min; roda 1x/dia a partir de `hora_execucao`
- Migrations `204_ecomm_conversao.js`, `205_ecomm_conversao_item.js`
- `.env`: `ECOMM_API_SECRET` (chave da API do e-commerce — não vai para o banco)

## DDL Postgres (v2.0)
```sql
CREATE TABLE IF NOT EXISTS ecomm_conversao_config (
  empresa_id TEXT NOT NULL,
  chave      TEXT NOT NULL,
  valor      TEXT,
  label      TEXT,
  PRIMARY KEY (empresa_id, chave)
);

INSERT INTO ecomm_conversao_config (empresa_id, chave, valor, label) VALUES
 ('empresa-mutti-001','ativo','1','Rotina diária ligada (1) / desligada (0)'),
 ('empresa-mutti-001','hora_execucao','18:00','Horário diário da validação (HH:MM)'),
 ('empresa-mutti-001','janela_dias','15','Dias após o checkout em que a compra na loja ainda conta'),
 ('empresa-mutti-001','palavras_variacao','3','Palavras iniciais da descrição que precisam bater para ser variação'),
 ('empresa-mutti-001','registrar_auto','1','Registrar a venda na API automaticamente (1) ou só apontar (0)'),
 ('empresa-mutti-001','api_base','https://ec-farmaciamutti.pages.dev','Endereço da API do e-commerce'),
 ('empresa-mutti-001','ultima_execucao','','Data da última execução')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS ecomm_conversao_log (
  checkout_id    TEXT PRIMARY KEY,
  empresa_id     TEXT NOT NULL,
  checkout_em    TIMESTAMP,
  origem         TEXT,
  cliente        TEXT,
  telefone       TEXT,
  produto        TEXT,
  preco          NUMERIC(12,2),
  resultado      TEXT NOT NULL CHECK (resultado IN ('registrada','apontada','visita','aguardando','sem_compra','teste','erro')),
  via            TEXT CHECK (via IN ('telefone','nome')),
  erp_venda_id   BIGINT,
  erp_item_id    BIGINT,
  coo            TEXT,
  loja           TEXT,
  venda_em       TIMESTAMP,
  item_erp       TEXT,
  valor          NUMERIC(12,2),
  detalhe        TEXT,
  analisado_em   TIMESTAMP NOT NULL,
  registrado_em  TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ecomm_conv_res  ON ecomm_conversao_log (empresa_id, resultado);
CREATE INDEX IF NOT EXISTS idx_ecomm_conv_item ON ecomm_conversao_log (erp_item_id);
-- Garante no banco que um item de cupom só confirma 1 venda:
CREATE UNIQUE INDEX IF NOT EXISTS uq_ecomm_conv_item_registrado
  ON ecomm_conversao_log (erp_item_id) WHERE resultado = 'registrada';
```

## SQL do ERP (somente leitura)
```sql
-- 1) Pessoas do A7 com o telefone do formulário ($1 = últimos 8 dígitos)
SELECT DISTINCT pessoaid FROM contato c
 WHERE right(regexp_replace(coalesce(c.ddd,'')||coalesce(c.contato,''),'\D','','g'),8) = $1;

-- 2) Vendas do cliente na janela ($1 início, $2 fim, $3 fone8, $4 pessoas[], $5 nomes[])
SELECT v.id, to_char(v.datahorafechamento,'YYYY-MM-DD HH24:MI') quando, v.coo, v.valortotal,
       coalesce(pu.nome, v.unidadenegocioid::text) loja,
       CASE WHEN v.pessoaid = ANY($4::bigint[])
              OR right(regexp_replace(coalesce(v.ddd,'')||coalesce(v.contato,''),'\D','','g'),8) = $3
            THEN 'telefone' ELSE 'nome' END via
  FROM venda v
  LEFT JOIN pessoa pe ON pe.id = v.pessoaid
  LEFT JOIN unidadenegocio un ON un.id = v.unidadenegocioid
  LEFT JOIN pessoa pu ON pu.id = un.pessoaid
 WHERE v.status IN ('F','D') AND v.datahorafechamento >= $1 AND v.datahorafechamento < $2
   AND ( v.pessoaid = ANY($4::bigint[])
      OR (length($3) = 8 AND right(regexp_replace(coalesce(v.ddd,'')||coalesce(v.contato,''),'\D','','g'),8) = $3)
      OR translate(upper(v.nome), 'ÁÀÂÃÉÊÍÓÔÕÚÇ','AAAAEEIOOOUC') = ANY($5::text[])
      OR translate(upper(pe.nome),'ÁÀÂÃÉÊÍÓÔÕÚÇ','AAAAEEIOOOUC') = ANY($5::text[]) )
 ORDER BY v.datahorafechamento;

-- 3) Itens (não cancelados) dessas vendas
SELECT i.id, i.vendaid, pr.descricao, i.valortotal
  FROM itemvenda i
  JOIN embalagem e ON e.id = i.embalagemid
  JOIN produto  pr ON pr.id = e.produtoid
 WHERE i.vendaid = ANY($1::bigint[]) AND i.status <> 'C'
 ORDER BY i.vendaid, i.sequencia;
```

## Observações
- Horários: a API devolve Unix/UTC; o A7 grava hora local. A rotina converte o checkout para UTC-3.
- Se o servidor estiver desligado às 18:00, a rotina roda assim que ele subir **no mesmo dia**.
  Se a execução falhar (ERP ou API fora), `ultima_execucao` é limpa e ela tenta de novo em 5 min.
- As 2 vendas registradas manualmente em 29/09/2026 (Josefa COO 019417, Joselma COO 008398)
  foram lançadas no histórico com o `erp_item_id`, para a rotina não reutilizar esses itens.
