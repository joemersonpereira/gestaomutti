# Sistema de Gestão — Grupo Mutti

Sistema real com backend Node.js, banco de dados SQLite e frontend React.

---

## Estrutura do projeto

```
mutti-sistema/
├── backend/          ← Servidor Node.js + API REST + Banco de dados
│   ├── src/
│   │   ├── server.js         ← Ponto de entrada do servidor
│   │   ├── db/
│   │   │   ├── setup.js      ← Cria o banco e insere dados iniciais
│   │   │   └── connection.js ← Conexão com SQLite
│   │   ├── middleware/
│   │   │   └── auth.js       ← Autenticação JWT
│   │   └── routes/
│   │       ├── auth.js       ← Login, logout, trocar senha
│   │       ├── tarefas.js    ← Kanban completo + avaliações
│   │       └── colaboradores.js ← Colaboradores, ocorrências, movimentações
│   ├── .env                  ← Variáveis de ambiente
│   └── package.json
└── frontend/         ← Interface React
    ├── src/
    │   ├── App.js            ← Componente raiz + roteamento
    │   ├── context/
    │   │   └── AuthContext.js ← Login, logout, JWT
    │   └── pages/
    │       ├── Login.js      ← Tela de login
    │       └── Kanban.js     ← Kanban de tarefas
    └── package.json
```

---

## Instalação

### Pré-requisitos
- Node.js 18+ instalado (https://nodejs.org)
- npm (vem com o Node)

### Passo 1 — Backend

```bash
cd mutti-sistema/backend
npm install
node src/db/setup.js    # Cria o banco de dados
npm run dev             # Inicia o servidor (porta 3001)
```

### Passo 2 — Frontend (novo terminal)

```bash
cd mutti-sistema/frontend
npm install
npm start               # Inicia o React (porta 3000)
```

### Passo 3 — Acessar

Abra no navegador: **http://localhost:3000**

---

## Usuários iniciais

| Nome | E-mail | Senha | Perfil |
|------|--------|-------|--------|
| Carlos Mutti | carlos@grupomutti.com.br | Mutti@2026 | Diretor Geral |
| Denilson Silva | denilson@grupomutti.com.br | Mutti@2026 | Supervisor |
| Renato Ferreira | renato@grupomutti.com.br | Mutti123 | Gerente |
| Helenneide Souza | helenneide@grupomutti.com.br | Mutti123 | Vendedor |
| Ingrid Santos | ingrid@grupomutti.com.br | Mutti123 | Caixa |

---

## API disponível

### Autenticação
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /api/auth/login | Login — retorna JWT |
| GET | /api/auth/me | Dados do usuário logado |
| POST | /api/auth/trocar-senha | Troca senha (obrigatório no primeiro acesso) |
| POST | /api/auth/logout | Logout |

### Tarefas (Kanban)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/tarefas | Lista tarefas do usuário |
| POST | /api/tarefas | Cria nova tarefa |
| GET | /api/tarefas/:id | Detalhe de uma tarefa |
| PATCH | /api/tarefas/:id/status | Move no kanban |
| POST | /api/tarefas/:id/avaliacao | Avalia tarefa concluída |
| POST | /api/tarefas/:id/ciencia | Confirma ciência de notificação |
| GET | /api/tarefas/status/bloqueio | Verifica se usuário está bloqueado |
| GET | /api/tarefas/relatorio/sla | Relatório de SLA por origem |

### Colaboradores
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/colaboradores | Lista colaboradores |
| POST | /api/colaboradores | Cadastra novo colaborador |
| PATCH | /api/colaboradores/:id/ativar | Ativa/desativa colaborador |
| GET | /api/colaboradores/:id/ocorrencias | Lista ocorrências |
| POST | /api/colaboradores/:id/ocorrencias | Lança ocorrência (RH) |
| POST | /api/colaboradores/:id/ocorrencias/:ocId/contestar | Colaborador contesta |
| PATCH | /api/colaboradores/:id/ocorrencias/:ocId/analisar | RH decide contestação |
| GET | /api/colaboradores/:id/movimentacoes | Lista movimentações |
| POST | /api/colaboradores/:id/movimentacoes | Lança movimentação (RH) |
| POST | /api/colaboradores/:id/movimentacoes/:mId/ciencia | Confirma ciência |

---

## Próximos módulos a desenvolver

Seguir a mesma estrutura para adicionar:

1. `/api/vendas` — lançamento e consulta de vendas
2. `/api/metas` — metas mensais com aprovação do Diretor
3. `/api/indicadores` — avaliações de farmacêutico, estagiário, conferente
4. `/api/checklist` — check-in e check-out
5. `/api/campanhas` — marketing com segmentação por loja
6. `/api/certificados` — conquistas e certificados
7. `/api/relatorios` — exportação de dados

---

## Variáveis de ambiente (.env)

```env
PORT=3001
JWT_SECRET=troque_por_uma_chave_segura_em_producao
JWT_EXPIRES_IN=8h
DB_PATH=./db/mutti.db
NODE_ENV=development
```

**⚠️ Em produção:** troque o JWT_SECRET por uma string aleatória longa.

---

## Deploy em produção (sugestão low-cost)

### Opção 1 — Railway (mais fácil)
1. Crie conta em railway.app
2. Conecte o repositório GitHub
3. Configure as variáveis de ambiente
4. Deploy automático

Custo: ~US$ 5/mês

### Opção 2 — VPS (mais controle)
1. Contrate VPS na DigitalOcean, Vultr ou Hostinger (~R$ 20/mês)
2. Instale Node.js no servidor
3. Use PM2 para manter o processo rodando
4. Use Nginx como proxy reverso
5. Certifique com Let's Encrypt (HTTPS gratuito)

---

## Migrar para PostgreSQL (quando escalar)

Substitua o `better-sqlite3` por `pg` e ajuste as queries:
- `datetime('now')` → `NOW()`
- `INTEGER` → `BOOLEAN` onde necessário
- O restante da lógica permanece igual
