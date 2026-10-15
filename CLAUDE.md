# Sistema de Gestão — Grupo Mutti

Sistema interno de um grupo de farmácias na Bahia (Mutti, Ultra, Farma Rocha, Posto de
Medicamentos). Dono e principal usuário: **Joe**, do administrativo/financeiro.

## O desenho em uma frase

Node/Express + **SQLite** (`better-sqlite3`) no backend, React (CRA) no frontend, e o **ERP A7 em
Postgres somente para leitura**. O sistema puxa dados vivos do ERP, mas nunca escreve nele.

```
backend/src/
  routes/       68 rotas REST — uma por módulo
  lib/          a regra de negócio (é aqui que mora a lógica, não nas rotas)
  db/
    connection.js        SQLite do app
    erp.js               erpQuery() — Postgres do ERP, SÓ SELECT
    migrations/          192 arquivos NNN_nome.js
    migrar.js            aplica as pendentes em ordem e anota em schema_migracoes
    migrar-pendentes.js  só delega para o migrar.js (mantido pelos .bat)
frontend/src/pages/      95 telas
coletor/                 robô Playwright (fora do backend: não pode ir no deploy)
docs/                    o caminho técnico da v2.0 em Postgres
```

## Regras que valem para tudo

1. **O ERP é somente leitura.** O usuário `leitura_inteligente` tem `SELECT` e a sessão está em
   `transaction_read_only`. Não tente escrever, nem sugira escrever — o sistema existe para ser
   uma **segunda opinião** independente do ERP. Correção é sempre manual, por quem é do setor.

2. **Toda entrega leva o caminho técnico da v2.0.** O sistema vai ser reescrito em Postgres por
   outro programador. Toda correção ou feature nova precisa vir com as tabelas e o DDL/SQL
   Postgres documentados, para ele aplicar. É requisito permanente do Joe.

3. **Migração nova = arquivo novo.** `db/migrations/NNN_nome.js`, número seguinte, e **idempotente**
   (`CREATE TABLE IF NOT EXISTS`, `ALTER` protegido). Nunca edite uma migração já rodada. Não há lista
   para registrar: `migrar.js` descobre os arquivos sozinho e anota os aplicados na tabela
   `schema_migracoes` (desde 2026-10-15; banco anterior a isso recebe *baseline* no 1º boot).

4. **Simplicidade acima de completude.** O Joe pediu isso explicitamente: telas unificadas em vez
   de espalhadas, e **nada de valor fixo no código** — o que muda com o tempo (taxa, meta, regra,
   prazo) vira cadastro, não constante.

5. **Layout responsivo de verdade** — adaptar ao espaço disponível sem distorcer.

6. **Decida e siga.** O Joe prefere que você resolva as dúvidas pequenas sozinho e só pergunte o
   que realmente muda o rumo do trabalho.

7. **Preço sempre com terminação psicológica** (`,99` / `,90`) em qualquer sugestão de precificação.

8. **Datas do Postgres**: use `to_char(campo,'YYYY-MM-DD')` no SQL. `String(data).slice(0,10)` em
   cima de um `Date` do driver devolve `"Thu Aug 2"` — já quebrou duas vezes.

## Identificadores que aparecem em todo lugar

- Empresa: `empresa-mutti-001`
- Lojas (id do app → unidade do ERP): `loja-esplanada` 70423 · `loja-entrerioss1` 70424 ·
  `loja-entrerios2` 70422 · `loja-rioreal` 70421 · `loja-farmarocha` 70418 · `loja-posto` 70419 ·
  `loja-ultraentrerios` 70417 · `loja-ultraesplanada` 70420
- **Atenção:** `unisEmpresa()` recebe o **id do app** (`loja-rioreal`), não o número do ERP. Passar
  o número devolve lista vazia, em silêncio.

## Antes de entregar

- Rode o que você mexeu. Se não deu para rodar, diga isso — não afirme que funciona.
- Ao ler um arquivo de fora (planilha, PDF de operadora), **confira o total contra o que a tela do
  sistema de origem mostra**. Se não bater exato, o leitor está errado; não arredonde a diferença.
- Diga o que **não** fechou antes de dizer o que fechou.

## Deploy

VPS própria (NexiiAgency, Docker Swarm + Traefik), endereço **gestao.farmaciasmutti.com.br**.
Push em `main` publica via `.github/workflows/deploy.yml`. O banco SQLite vive no volume
`gestaomutti_db`; o container é descartável. Segredos só em `/opt/apps/gestaomutti/.env.production`
na VPS — nunca no repositório, nunca na conversa. Runbook: `docs/deploy-vps.md`.

## Agentes deste projeto

- `.claude/agents/coletor-cartoes.md` — Conciliação de Cartões: baixa os relatórios das 8
  credenciadoras, importa, confronta e reporta. Contém as 15 armadilhas já descobertas nos dados
  reais — leia antes de mexer em qualquer coisa de cartão.
