# Conciliação de Cartões — descritivo de estado (para handoff)

Snapshot do módulo em 06/10/2026, escrito pra quem for continuar o trabalho sem ter visto a
conversa anterior. Complementa (não substitui) `docs/CONCILIACAO-CARTOES-v2-postgres.md` (DDL +
armadilhas originais) e `.claude/agents/coletor-cartoes.md` (robô Playwright + as 15 armadilhas
clássicas) — leia os dois também antes de mexer em qualquer coisa de cartão.

## Arquitetura

```
backend/src/lib/conciliacaoCartao.js          motor: casamento, divergências, pendentes, painel
backend/src/lib/conciliacaoCartaoParsers.js   leitores de VENDAS (Rede, Brasil Card x2, Le Card,
                                               Bracov, Nutricash, Mulvi)
backend/src/lib/conciliacaoRepasseParsers.js  leitores de REPASSE/recebimentos
backend/src/lib/conciliacaoUzeParsers.js      PDFs (Le Card, Uze, Bracov — plataforma Algorix)
backend/src/lib/repasseCartao.js              motor de repasse + de-para de estabelecimento
backend/src/routes/conciliacaoCartao.js       rotas REST (/api/conciliacao-cartao/*)
backend/src/db/erp.js                         erpQuery() — Postgres do ERP, só leitura, COM CACHE
frontend/src/pages/ConciliacaoCartoes.js      tela única, 7 abas
```

## As 7 abas da tela

1. **📊 Painel do mês** — BI: divergências abertas, correções já feitas no ERP, % casado, ranking de
   operador. Pode conferir com EDI automático (Rede/Brasil Card, sem upload) ou com os relatórios
   que a Tesouraria subiu.
2. **📥 Importar relatório** — upload de vendas ou repasse. Se o arquivo trouxer loja(s) que o
   sistema não reconhece (Le Card mistura lojas num arquivo só), aparece um painel pra mapear e
   reprocessar sem reupload.
3. **⚠️ Divergências** — lista linha a linha (forma errada, parcelamento, valor, taxa, "operadora
   pagou e ERP não tem", "ERP tem e operadora não pagou"). Filtros: tipo, status, operadora,
   modalidade, operador, NSU, valor.
4. **⏳ Aguardando relatório** — TODA venda de cartão do ERP (qualquer operadora/bandeira) que ainda
   não cruzou com NENHUM relatório, manual ou EDI. Não é divergência — é "falta conferir".
5. **🏷️ Sem operadora** — venda cuja modalidade do ERP não bate em nenhum palpite automático nem
   de-para manual. Sinal de bandeira nova que ninguém cadastrou ainda.
6. **💰 Repasses** — motor separado (`repasseCartao.js`), confere o que a operadora efetivamente
   depositou × o que devia, por filial e por taxa contratada.
7. **🔧 Correções no ERP** / **⚙️ Ajustes** — histórico de correções manuais já feitas, e os de-paras
   (modalidade→grupo, operadora→modalidades, loja-no-arquivo→loja, estabelecimento→loja).

## Operadoras e seus parsers hoje

| Operadora | Layout de vendas aceito | Observação |
|---|---|---|
| Rede | `REDE` (nsu/cv + modalidade) | CNPJ por linha quando o export tem a coluna; senão cai no de-para de estabelecimento |
| Brasil Card | `BRASILCARD` (1 linha = 1 venda inteira) **e** `BRASILCARD_DET` (1 linha = 1 parcela, com vencimento — formato "Relatório de vendas completos") | o `_DET` tem variante "com filiais" (PDV+CNPJ) e variante simples (sem nada — precisa escolher a loja) |
| Le Card | `LECARD` | arquivo mistura várias lojas; usa `conc_loja_texto` pra resolver |
| Bracov | `BRACOV` | |
| Nutricash | `NUTRICASH` | parser existe, **não validado com arquivo real nesta sessão** |
| Banese / Mulvi | `MULVI` | uma loja por vez, não diz a loja no arquivo |
| Alelo | aba "Extrato" do xlsx | parser existe, **não validado com arquivo real nesta sessão** |
| Multi Mais / Uze | só PDF via `conciliacaoUzeParsers.js` | |

## Tabelas SQLite deste módulo (além das documentadas no DDL v2)

- **`conc_loja_texto`** (nova) — de-para `(empresa_id, operadora, texto normalizado)` → `uni_erp`.
  Resolve arquivos que trazem o nome da loja por linha (hoje: Le Card) em vez de CNPJ.
- **`conc_item.loja_arquivo`** (coluna nova) — guarda o texto bruto da loja como veio no arquivo,
  pra poder reprocessar um lote já importado sem pedir o arquivo de novo.
- `conc_estabelecimento` (já existia) — de-para número-do-estabelecimento → loja. Fica mais
  confiável agora que o bug de loja-errada (abaixo) foi corrigido.

Migração: `backend/src/db/migrations/193_conc_loja_texto.js`.

## Bugs encontrados e corrigidos nesta sessão (não repetir)

1. **`pendentesPorOperadora` só cobria 4 operadoras hardcoded.** Reescrito pra varrer TODA venda de
   cartão do período e checar casamento contra relatório manual (`casar()`) **e** EDI automático
   (`conciliacaocartaoitem.cartaoreceberid`), sem lista fixa de operadora. Pix do banco é excluído
   por padrão (só entra se a modalidade foi explicitamente mapeada a uma operadora).
2. **Nova aba "Sem operadora"** — detecta modalidade do ERP sem nenhuma operadora reconhecida
   (nem palpite, nem de-para manual). `PALPITE_OPERADORA` ganhou entradas para "Multi Mais / Uze"
   e "Banese / Mulvi" que faltavam.
3. **Filtro global "Forma de pagamento"** (Débito/Crédito/Parcelado/Voucher/Pix/...) — aplicado
   tanto na lista de divergências quanto nos números-resumo do Painel (antes só filtrava a lista,
   e os cards do topo ainda somavam tudo, inclusive Pix passado na maquininha do Brasil Card).
4. **Hora zerada do EDI do Brasil Card/Bolt quebrava o casamento.** `conciliacaocartaoitem` chega
   com `datahoratransacao` em 00:00:00 pro Brasil Card (não é meia-noite real, é "hora
   desconhecida"), e a janela de 60min do casamento por valor+dia rejeitava o par certo — virava
   um falso "operadora pagou, ERP não tem" + "ERP tem, operadora não pagou" ao mesmo tempo. Corrigido
   em `casar()`: hora exatamente 00:00 agora é tratada como ausente, não como horário real.
5. **Parser novo: Brasil Card "detalhado"** (`BRASILCARD_DET`) — a Brasil Card tem um formato de
   export por PARCELA (não por venda) que não tinha leitor nenhum. Agrupa por número de autorização
   (liga as parcelas da mesma venda) e soma bruto/líquido. A variante "com filiais" traz PDV+CNPJ e
   resolve a loja sozinha; peguei isso cruzando arquivo × ERP quando a variante simples não trazia
   loja nenhuma (7 arquivos por loja, 2 ficaram sem sinal — resolvidos depois pelo arquivo
   consolidado com CNPJ). **Cuidado com duplicata**: esse export tem uma versão "por loja" e uma
   "todas as filiais juntas" — são os MESMOS dados, exportação diferente. Confira NSU/autorização
   antes de importar os dois.
6. **BUG GRAVE, já corrigido: loja errada quando o upload usa "identificar pelo arquivo" e a linha
   não tem CNPJ.** Em `importar()`, `uniEscolhida` usava `unisEmpresa(empresaId, lojaId)[0]` mesmo
   quando `lojaId` estava vazio — e `unisEmpresa(empresaId, '')` devolve **todas** as lojas (sem
   filtro). Isso jogava silenciosamente toda linha sem CNPJ pra "a primeira loja da lista" (no caso,
   Mutti-Esplanada), e **corrompeu o de-para de estabelecimento** (`aprenderEstabelecimentos`
   aprendeu a loja errada a partir daí). Impacto medido: **5.436 vendas da Farma Rocha e 163 do
   Posto** gravadas como se fossem da Esplanada — corrigido em massa (UPDATE direto no SQLite, cada
   linha conferida por NSU contra o ERP antes de corrigir). Fix: `uniEscolhida` agora só existe
   quando `lojaId` foi realmente escolhido; sem loja e sem CNPJ resolvido, a linha vai pra
   "sem loja" (fica de fora, não adivinha).
   **Se uma reconciliação parecer estranha numa loja específica, vale conferir se não é esse mesmo
   padrão em outra operadora/arquivo antigo.**
7. **Cache de duas camadas**, pedido explícito do Joe pra não gastar conexão à toa com o ERP:
   - `erp.js`: toda `erpQuery()` fica em memória por 60s (`ERP_CACHE_TTL_MS`, default 60000,
     `=0` desliga). Dedup de chamadas concorrentes idênticas também.
   - `ConciliacaoCartoes.js` (`useDados`): resultado de cada aba fica em memória por 120s
     (`TTL_UI_MS`), sobrevive a trocar de aba. `recarregar()` (usado após importar/marcar
     tratativa) **sempre** ignora o cache — senão a tela mostraria dado velho depois de uma ação.

## Pendências / não fechado

- Nutricash e Alelo: parsers existem mas **não foram testados com arquivo real** nesta sessão.
- Le Card: automação Playwright (robô) ficou travada em anti-bot real (Cloudflare + captcha) —
  pausada por decisão do Joe, fluxo hoje é upload manual.
- Rede/Cielo/GetNet/Stone compartilham o MESMO palpite de modalidade genérico
  (`01-DEBITO/02-CREDITO/03-PARCELADO`) — só faz sentido se a loja realmente usa só uma dessas
  credenciadoras "de verdade" na maquininha principal (hoje: Rede). Se Cielo/GetNet/Stone também
  entrarem em uso de verdade, o de-para vai colidir e precisa de ajuste fino (bandeira/CNPJ pra
  desambiguar, não só modalidade).
- Vale uma varredura geral em `conc_estabelecimento` e nos lotes já importados de TODAS as
  operadoras (não só Rede) procurando o mesmo padrão do bug #6 — só fiz a varredura completa pra
  Rede.
- Posto de Medicamentos não tem nenhuma venda Brasil Card no período testado (01–14/09) — não é
  erro, só não teve venda dessa operadora lá (ou o export "com filiais" não cobriu essa loja ainda).

## Referências

- `docs/CONCILIACAO-CARTOES-v2-postgres.md` — DDL Postgres pra v2.0 + as 15 armadilhas originais
  (PRECISA ser atualizado com os itens 1–6 acima antes da reescrita; ainda não fiz essa atualização).
- `docs/CONCILIACAO-REPASSES-v2-postgres.md` — idem, pro motor de repasse.
- `.claude/agents/coletor-cartoes.md` — playbook do robô + armadilhas de cada portal.
