# Status dos Módulos — Sistema Mutti

Gerado nesta sessão de desenvolvimento. Backend dos **12 módulos** implementado e validado
(schema + queries verificados em banco `node:sqlite` em memória; todos os arquivos passam em `node --check`).
Frontend (React) entregue para todos os módulos.

> ⚠️ Ambiente de geração sem rede: não foi possível rodar `npm install`/servidor real aqui.
> Antes de subir, rode `npm install` no backend e no frontend.

## Como rodar

```bash
# Backend
cd backend
npm install
node src/db/setup.js        # cria o banco do zero com schema + dados demo (já inclui M1–M6)
npm run dev                 # sobe a API (porta padrão do projeto)

# (Opcional) Se você já tinha um banco antigo e NÃO quer recriar, rode as migrações:
node src/db/migrations/001_vendas_metas.js
node src/db/migrations/002_checklist_auditoria_avaliacoes.js

# Frontend
cd ../frontend
npm install
npm start
```

`setup.js` é auto-suficiente: recria todas as tabelas novas e semeia os pesos dos indicadores.
As migrações servem para atualizar um banco existente **sem perder dados** (usam `CREATE TABLE IF NOT EXISTS`
e `INSERT OR IGNORE`).

## Regras universais aplicadas (em todos os módulos)

1. Todo evento que exige ação **gera tarefa automática** no Kanban (`gerarTarefa`).
2. Notificação de ciência vencida bloqueia (via SLA da notificação).
3. Avaliação ao concluir tarefa — nota ≤2 vira acompanhamento do Diretor.
4. Escala: **Bom = 100% / Regular = 50% / Ruim = 0%** dos pesos.
5. Pesos sempre somam **100pts** por categoria (validado em `setup`, migração e `/config`).
6. Vendedor vê **% da meta/super meta**, nunca o valor total em R$ (aplicado no backend e no front).
7. Vitaminas: premiação por faixa (≥30un=R$10 / 20–29un=R$7 / 10–19un=R$5).

## Módulos

| # | Módulo | Backend | Frontend | Rota API | Página |
|---|--------|---------|----------|----------|--------|
| 1 | Vendas e metas | ✅ | ✅ | `/api/vendas`, `/api/metas` | `Vendas.js` |
| 2 | Painel do Gerente (4 pilares / 24 ind.) | ✅ | ✅ | `/api/painel/gerente` | `PainelGerente.js` |
| 3 | Meu RH unificado | ✅ | ✅ | `/api/meu-rh` | `MeuRH.js` |
| 4 | Checklist da loja | ✅ | ✅ | `/api/checklist` | `Checklist.js` |
| 5 | Auditoria do supervisor | ✅ | ✅ | `/api/auditoria` | `Auditoria.js` |
| 6 | Avaliações (farm./estag./confer.) | ✅ | ✅ | `/api/avaliacoes` | `Avaliacoes.js` |
| 7 | Marketing (campanhas/ações) | ✅ | ✅ | `/api/marketing` | `Marketing.js` |
| 8 | Painel do Supervisor | ✅ | ✅ | `/api/painel/supervisor` | `PainelSupervisor.js` |
| 9 | Painel do Diretor (aprovações 24h) | ✅ | ✅ | `/api/aprovacoes`, `/api/metas/:id/aprovar` | `PainelDiretor.js` |
| 10 | Ranking trimestral + certificados | ✅ | ✅ | `/api/certificados`, `/api/certificados/ranking` | `Ranking.js` |
| 11 | Relatórios (CSV/HTML, Excel opcional) | ✅ | ✅ | `/api/relatorios` | `Relatorios.js` |
| 12 | Configurações SaaS | ✅ | ✅ | `/api/config` | `Config.js` |

## Observações por módulo

- **M2 / M8 (painéis):** indicadores com dado real são calculados **ao vivo** (meta de vendas,
  vitaminas, PBM, genérico, auditoria, checklist, **limpeza**, tarefas no prazo, farmacêutico,
  estagiários, conferência, ocorrências RH, campanhas/ações/ciência). O indicador **"Limpeza mensal ≥90"**
  do pilar Organização lê a média do **"Checklist de Limpeza Mensal"** (pré-cadastrado, 12 itens,
  categoria `limpeza`) — a marcação por categoria garante que ele isole só o checklist de limpeza.
  Indicadores sem módulo-fonte ainda (NPS, caixa, disciplina, estoque, documentação) vêm marcados como
  `fonte: 'estimado'` e **não são fabricados** — entram como “—” e ficam de fora da média do pilar até existir a fonte.
- **M9 (aprovações):** metas pendentes mostram **horas restantes** (SLA 24h) calculadas a partir
  da tarefa de aprovação vinculada. Certificados emitidos por não-diretores exigem validação.
- **M11 (relatórios):** CSV e relatório HTML imprimível funcionam sem dependências extras.
  O `.xlsx` usa a lib `xlsx` via *lazy-require*: se não estiver instalada, a API responde 501
  orientando `npm i xlsx`. (Sugestão: adicionar `xlsx` e `pdfkit` ao `package.json` quando quiser
  exportação nativa de planilha/PDF no servidor.)
- **M12 (config):** edição dos pesos por função valida que a soma seja exatamente **100** antes de salvar.

## Navegação

`App.js` foi refatorado para navegação **dirigida por módulos e perfil**: cada item de menu só
aparece para as funções autorizadas (constante `MODULOS`). Para incluir um novo módulo, basta
adicionar uma entrada com `{ id, label, C: Componente, perfis }`.
