# Coletor de relatórios das operadoras

Robô que entra no portal de cada operadora, baixa o relatório do dia e manda para a
**Conciliação de Cartões** do sistema. Serve para as operadoras que **não mandam arquivo para o
ERP** — hoje: **Alelo, Le Card, Nutricash e Bracov** (Rede e Brasil Card já chegam sozinhas no A7).

Fica fora do `backend` de propósito: o Playwright é pesado e não pode ir junto no deploy do
servidor. Roda na máquina do escritório, como as rotinas mensais das planilhas.

---

## Como as senhas ficam guardadas

**O robô não guarda senha de operadora.** Você loga uma vez, com o navegador aberto na sua frente,
e o que fica salvo é o **cookie de sessão** que o portal devolve (pasta `sessoes/`). É o mesmo que
o "manter conectado" do navegador. Vantagens:

- passa por token de SMS e por captcha (você resolve na hora do login);
- ninguém — nem eu — precisa ver ou digitar sua senha;
- se a sessão cair, o robô **para e avisa**, em vez de ficar tentando entrar.

⚠️ Trate a pasta `sessoes/` como se fosse a senha: quem tem esse arquivo entra no portal. Ela já
está fora do git (`.gitignore`).

A **única** senha no `.env` é a de um usuário **do sistema Mutti** (perfil Tesouraria), que o robô
usa para mandar o arquivo importado — não dá acesso a dinheiro nenhum.

---

## Instalação (uma vez)

```
cd mutti-sistema\coletor
npm install
npx playwright install chromium
copy .env.exemplo .env
```

Abra o `.env` e preencha `COLETOR_EMAIL` / `COLETOR_SENHA` (usuário do sistema) e, para os portais
que atendem uma loja só, `COLETOR_LOJA_LECARD`, `COLETOR_LOJA_NUTRICASH` etc.

## Gravar a sessão de cada portal (uma vez, e de novo quando expirar)

```
npm run gravar -- rede
```

Abre o navegador. Você faz o login, marca "manter conectado" se houver, e **navega até a tela do
relatório** — a mesma que usa hoje (na Rede: *recebimentos*). Volta no terminal e aperta ENTER.
Pronto: a sessão e o endereço daquela tela ficam salvos.

Depois repita para `lecard`, `nutricash`, `bracov` e `alelo`.

### A Rede já está mapeada

As receitas `rede` (repasse) e `rede_vendas` foram escritas com o portal aberto, e sabem:

- mexer no **calendário** (é um web component com shadow DOM — os dias não têm atributo, então o
  robô acha a célula pela propriedade do elemento);
- escolher **"relatório detalhado"**, que é o único que traz parcela a parcela;
- esperar a geração assíncrona (*1/3 gerando → 2/3 preparando → seu arquivo está pronto*);
- **trocar de estabelecimento** e repetir a coleta em cada grupo:

| Grupo | Nº |
|---|---|
| Grupo Mutti (matriz e filiais) | 48269786 |
| Farma Rocha | 26100061 |
| Farmácia Figueiredo (matriz e filiais) | 15050262 |
| Posto de Medicamentos | 42619300 |

Primeira rodada, com o navegador à vista para você acompanhar:

```
npm run coletar -- rede 2026-07-01 2026-08-23 --ver
npm run coletar -- rede_vendas 2026-07-01 2026-08-23 --ver
```

## Rodar

```
npm run coletar                                  ← todas, movimento de ontem
npm run coletar -- alelo                         ← só a Alelo
npm run coletar -- alelo 2026-08-20              ← um dia
npm run coletar -- alelo 2026-08-01 2026-08-20   ← um período
npm run coletar -- alelo --ver                   ← mostra o navegador (para ver onde travou)
```

Ou dois cliques no `COLETAR.bat`.

Cada execução: entra no portal → baixa → salva em `baixados/` → manda para o sistema → já mostra
quantas transações casaram e quantas divergências apareceram. O log fica em `logs/`.

## Deixar rodando sozinho todo dia (7h)

```
schtasks /create /tn "Mutti - Coletor de cartoes" /tr "C:\Users\joeme\claude\mutti-sistema\coletor\COLETAR-AGENDADO.bat" /sc daily /st 07:00
```

Para conferir ou remover:

```
schtasks /query /tn "Mutti - Coletor de cartoes"
schtasks /delete /tn "Mutti - Coletor de cartoes" /f
```

---

## O que ainda falta para cada operadora

O robô sabe **entrar** (sessão gravada). Falta ensinar o **caminho dentro do portal**: em qual campo
vai a data e qual botão gera o arquivo. Isso está em `receitas.js`, um bloco por operadora:

```js
passos: [
  { tipo: 'preencher', seletor: '#dataInicial', valor: '{DATA_INI}' },
  { tipo: 'preencher', seletor: '#dataFinal',   valor: '{DATA_FIM}' },
  { tipo: 'clicar',    seletor: 'button:has-text("Consultar")' },
  { tipo: 'baixar',    seletor: 'button:has-text("Exportar")' },   // ← o clique que baixa
]
```

| Operadora | Entra | Sabe baixar | Lê o arquivo |
|---|---|---|---|
| Le Card | após `gravar` | falta a receita | ✅ testado |
| Nutricash | após `gravar` | falta a receita | ✅ testado |
| Bracov | após `gravar` | falta a receita | ✅ testado |
| Alelo | após `gravar` | falta a receita | ❌ falta o leitor |

Para eu completar as receitas preciso de uma destas coisas, por portal:
1. a **URL** da tela de relatório e o **nome dos campos/botões** (um print resolve), ou
2. você roda `npm run coletar -- <operadora> --ver`, vê onde para, e me conta o que aparece.

Para a **Alelo** preciso também de **um relatório baixado** (qualquer dia), para escrever o leitor
do formato dela — os outros quatro já estão prontos e testados com arquivos reais.
