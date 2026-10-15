# v2.0 — Orçamento das lojas (Postgres)

Substitui o antigo "Cartão-despesas" (que era SQLite manual) por **leitura da conta real
"Orçamento - &lt;loja&gt;" do ERP**. Não cria tabela no app, não escreve no ERP.

## Modelo

Cada loja tem uma conta corrente `contacorrente` tipo C chamada **"Orçamento - &lt;loja&gt;"**
(`nome ILIKE 'Or_amento%'`). Existe também "Orçamento - ESC" (unidade 1 = escritório, a fonte).

- **Verba** = créditos na conta (principalmente `Entrada de Transferência` do escritório).
- **Gasto** = débitos (`Lançamento de Saída` + `Pagamento de Conta`, feitos pelo gerente).
- **Saldo** = `SUM(valor)` (créditos positivos, débitos negativos).

Como `unisEmpresa()` só devolve unidades de loja, a conta ESC (unidade 1) fica naturalmente fora
do resumo por loja. Farma Rocha tem 2 contas de orçamento (ADM + loja) — ambas aparecem.

## Queries (lib `orcamentoErp.js`)

Resumo por loja:
```sql
SELECT cc.id AS conta_id, cc.nome AS conta, cc.unidadenegocioid AS loja_erp,
  SUM(m.valor) FILTER (WHERE tm.credito) AS verba,
  ABS(SUM(m.valor) FILTER (WHERE NOT tm.credito)) AS gasto,
  SUM(m.valor) AS saldo,
  COUNT(*) FILTER (WHERE NOT tm.credito) AS n_gastos
FROM movimentacaocontacorrente m
JOIN contacorrente cc ON cc.id=m.contacorrenteid AND cc.status='A' AND cc.nome ILIKE 'Or_amento%'
JOIN tipomovimentacaocontacorrente tm ON tm.id=m.tipomovimentacaocontacorrenteid
WHERE cc.unidadenegocioid = ANY($1::bigint[])
  AND m.datahora >= $2::date AND m.datahora < ($3::date + interval '1 day')
GROUP BY cc.id, cc.nome, cc.unidadenegocioid HAVING COUNT(*)>0 ORDER BY cc.nome;
```

`orcamentoMovimento` = detalhe (data, tipo, valor, plano, usuário, descrição) por conta.
`orcamentoPorPlano` = gastos agrupados por `planocontas.nome` (categoria), via
`lancamentofinanceiro.movimentacaocontacorrenteid` (LATERAL). Combustível, Redes Sociais etc.

## Rotas / tela
- `GET /contabilidade/orcamento/resumo | /movimento | /plano`.
- Tela: aba **💰 Orçamento** em `Contabilidade.js` (era `CartaoDespesas`, agora lê o ERP):
  por loja verba × gasto × saldo × % consumido, gasto por categoria, e movimento ao clicar.
- O **BI central** (`PainelBI`) ganhou o bloco **"Orçamento das lojas"** com os mesmos números
  (`GET /orcamento/resumo` com a mesma loja/período do BI).

Obs.: as rotas antigas `/contabilidade/despesa/*` e as tabelas `contabil_cartao_despesa` /
`contabil_cartao_lancamento` ficaram órfãs (sem uso na tela). Não removi para não quebrar dados
já lançados; na v2.0 podem ser descartadas.
