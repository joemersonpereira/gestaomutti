// setup.js — cria todas as tabelas e insere dados iniciais
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Usa o MESMO caminho que connection.js, para o servidor e as migrações lerem
// exatamente o arquivo que o setup criou (evita "banco vazio / login falha").
const dbPath = path.resolve(process.env.DB_PATH || './db/mutti.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
// PROTEÇÃO: nunca apaga um banco que já existe (evita zerar os dados em cada deploy).
// Só recria do zero se o banco ainda não existe OU se for pedido explicitamente (SETUP_FORCE=1).
if (fs.existsSync(dbPath) && !process.env.SETUP_FORCE) {
  try {
    const chk = new Database(dbPath, { readonly: true });
    const existe = chk.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='empresas'").get();
    chk.close();
    if (existe) { console.log('⏭️  setup: banco já existe — não vou recriar (use SETUP_FORCE=1 para resetar). Rode as migrações para aplicar novidades.'); process.exit(0); }
  } catch (e) { /* banco corrompido/ilegível → segue e recria */ }
}
for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) { if (fs.existsSync(f)) fs.unlinkSync(f); }
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── TABELAS ──────────────────────────────────────────────────────────────────

db.exec(`
  -- Empresas (multi-tenant)
  CREATE TABLE empresas (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    cnpj TEXT,
    segmento TEXT,
    subdominio TEXT UNIQUE,
    responsavel TEXT,
    email TEXT,
    telefone TEXT,
    plano TEXT DEFAULT 'profissional',
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now'))
  );

  -- Lojas
  CREATE TABLE lojas (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    endereco TEXT,
    cidade TEXT,
    telefone TEXT,
    supervisor_responsavel TEXT,
    ativa INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
  );

  -- Funções
  CREATE TABLE funcoes (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    tem_checklist INTEGER DEFAULT 0,
    tem_avaliacao INTEGER DEFAULT 1,
    tem_meta INTEGER DEFAULT 0,
    ativa INTEGER DEFAULT 1,
    escritorio INTEGER DEFAULT 0,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
  );

  -- Colaboradores
  CREATE TABLE colaboradores (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    loja_id TEXT NOT NULL,
    funcao_id TEXT NOT NULL,
    departamento TEXT,
    situacao TEXT DEFAULT 'ativo',
    nome TEXT NOT NULL,
    cpf TEXT,
    email TEXT UNIQUE,
    telefone TEXT,
    salario REAL DEFAULT 0,
    senha_hash TEXT NOT NULL,
    senha_provisoria INTEGER DEFAULT 1,
    dois_fatores_ativo INTEGER DEFAULT 0,
    chefe_setor INTEGER DEFAULT 0,
    lideranca INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    admissao TEXT,
    empresa_registro TEXT,
    empresa_atuacao TEXT,
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (loja_id) REFERENCES lojas(id),
    FOREIGN KEY (funcao_id) REFERENCES funcoes(id)
  );

  -- Sessões (controle de login)
  CREATE TABLE sessoes (
    id TEXT PRIMARY KEY,
    colaborador_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    dispositivo TEXT,
    ip TEXT,
    criado_em TEXT DEFAULT (datetime('now')),
    expira_em TEXT NOT NULL,
    ativo INTEGER DEFAULT 1,
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
  );

  -- Tarefas (Kanban central)
  CREATE TABLE tarefas (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    loja_id TEXT,
    tipo TEXT NOT NULL CHECK(tipo IN ('tarefa','notificacao')),
    origem TEXT NOT NULL,
    referencia_id TEXT,
    titulo TEXT NOT NULL,
    descricao TEXT,
    responsavel_id TEXT,
    apoio_id TEXT,
    status TEXT DEFAULT 'aberto' CHECK(status IN ('aberto','andamento','concluido','atrasado')),
    urgente INTEGER DEFAULT 0,
    urgente_por TEXT, urgente_confirmado TEXT,
    prazo TEXT,
    sla_horas INTEGER,
    reanalise_status TEXT,
    criado_por TEXT,
    criado_em TEXT DEFAULT (datetime('now')),
    atualizado_em TEXT DEFAULT (datetime('now')),
    concluido_em TEXT,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (responsavel_id) REFERENCES colaboradores(id)
  );

  -- Avaliações de tarefas (dupla — quem abriu avalia quem resolveu e vice-versa)
  CREATE TABLE avaliacoes_tarefa (
    id TEXT PRIMARY KEY,
    tarefa_id TEXT NOT NULL,
    avaliador_id TEXT NOT NULL,
    avaliado_id TEXT,
    tipo TEXT NOT NULL CHECK(tipo IN ('resolucao','descricao','atendimento')),
    nota INTEGER CHECK(nota BETWEEN 1 AND 5),
    status TEXT DEFAULT 'ativa',
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tarefa_id) REFERENCES tarefas(id)
  );

  -- Ocorrências (Conduta Profissional)
  CREATE TABLE ocorrencias (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    colaborador_id TEXT NOT NULL,
    loja_id TEXT,
    lancado_por_id TEXT,
    -- modelo por motivo/indicador (routes/ocorrencias.js, painel)
    motivo_id TEXT, motivo TEXT, deducao REAL DEFAULT 0, zera INTEGER DEFAULT 0,
    categoria TEXT, indicador_alvo TEXT, indicador_gerente TEXT, obs TEXT,
    data TEXT, criado_por TEXT,
    -- modelo legado RH/conduta (colaboradores.js, meurh.js, relatorios.js, certificados.js)
    tipo TEXT, descricao TEXT, pontos_deduzidos INTEGER DEFAULT 0,
    contestacao TEXT, resposta_rh TEXT, data_ocorrencia TEXT,
    -- fluxo RH porteiro: aguardando_rh, ativa, rejeitada, reanalise, assinatura
    exige_assinatura INTEGER DEFAULT 0, assinado_em TEXT, validada_por TEXT, validada_em TEXT, reanalise TEXT,
    documento TEXT,
    exige_termo INTEGER DEFAULT 0, termo_tipo TEXT,
    -- comum: sem CHECK para aceitar 'ativa'/'revertida' e 'pendente'/'contestado'/'aceito'/'mantido'
    status TEXT DEFAULT 'ativa',
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
  );

  -- Movimentações (transferências e trocas de turno)
  CREATE TABLE movimentacoes (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    colaborador_id TEXT NOT NULL,
    lancado_por_id TEXT,
    tipo TEXT NOT NULL CHECK(tipo IN ('transferencia','turno')),
    loja_origem_id TEXT,
    loja_destino_id TEXT,
    turno_origem TEXT,
    turno_destino TEXT,
    data_inicio TEXT,
    data_fim TEXT,
    tipo_transferencia TEXT DEFAULT 'definitiva',
    motivo TEXT,
    status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente','confirmado')),
    ciencia_em TEXT,
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
  );

  -- Certificados e conquistas
  CREATE TABLE certificados (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    colaborador_id TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('conquista','reconhecimento','desenvolvimento')),
    titulo TEXT NOT NULL,
    descricao TEXT,
    emitido_por TEXT,
    pontos INTEGER DEFAULT 0,
    fonte TEXT DEFAULT 'manual',
    validado INTEGER DEFAULT 0,
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
  );

  -- Vendas diárias
  CREATE TABLE vendas (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    loja_id TEXT NOT NULL,
    colaborador_id TEXT NOT NULL,
    valor REAL NOT NULL,
    data_venda TEXT NOT NULL,
    grupo TEXT,
    lancado_por_id TEXT,
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (loja_id) REFERENCES lojas(id),
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
  );

  -- Metas mensais
  CREATE TABLE metas (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    loja_id TEXT NOT NULL,
    colaborador_id TEXT,
    mes INTEGER NOT NULL,
    ano INTEGER NOT NULL,
    valor_meta REAL NOT NULL,
    valor_super_meta REAL,
    peso REAL DEFAULT 1.0,
    status_aprovacao TEXT DEFAULT 'pendente' CHECK(status_aprovacao IN ('pendente','aprovado','correcao','auto')),
    comentario_diretor TEXT,
    nome_campanha TEXT,
    responsavel_id TEXT,
    status_aceite TEXT DEFAULT 'pendente',
    reanalisado INTEGER DEFAULT 0,
    atingida INTEGER DEFAULT 0,
    campanha_id TEXT,
    modo TEXT DEFAULT 'geral',
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (loja_id) REFERENCES lojas(id)
  );

  -- Campanhas de marketing
  CREATE TABLE campanhas (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('campanha','acao')),
    titulo TEXT NOT NULL,
    descricao TEXT,
    prazo TEXT,
    prazo_ciencia INTEGER DEFAULT 5,
    midia_json TEXT,
    status TEXT DEFAULT 'ativa',
    criado_por_id TEXT,
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
  );

  -- Campanhas x Lojas (segmentação)
  CREATE TABLE campanhas_lojas (
    campanha_id TEXT NOT NULL,
    loja_id TEXT NOT NULL,
    ciencia_em TEXT,
    comprovante_status TEXT DEFAULT 'pendente',
    comprovante_json TEXT,
    comprovante_enviado_em TEXT,
    comprovante_validado_em TEXT,
    PRIMARY KEY (campanha_id, loja_id),
    FOREIGN KEY (campanha_id) REFERENCES campanhas(id),
    FOREIGN KEY (loja_id) REFERENCES lojas(id)
  );

  -- Logs de auditoria
  CREATE TABLE logs (
    id TEXT PRIMARY KEY,
    empresa_id TEXT,
    colaborador_id TEXT,
    acao TEXT NOT NULL,
    tabela TEXT,
    registro_id TEXT,
    detalhes TEXT,
    ip TEXT,
    criado_em TEXT DEFAULT (datetime('now'))
  );

  -- Avaliação dos indicadores comerciais do vendedor (mensal)
  -- Escala: bom = 100% do peso | regular = 50% | ruim = 0%
  CREATE TABLE indicadores_vendedor (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    loja_id TEXT NOT NULL,
    colaborador_id TEXT NOT NULL,
    mes INTEGER NOT NULL,
    ano INTEGER NOT NULL,
    indicador TEXT NOT NULL,
    avaliacao TEXT NOT NULL CHECK(avaliacao IN ('bom','regular','ruim')),
    valor_num REAL DEFAULT 0,
    lancado_por_id TEXT,
    criado_em TEXT DEFAULT (datetime('now')),
    atualizado_em TEXT DEFAULT (datetime('now')),
    UNIQUE(colaborador_id, mes, ano, indicador),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
  );

  -- Configuração dos pesos dos indicadores por empresa/função (somam 100pts)
  CREATE TABLE config_indicadores (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    funcao_id TEXT NOT NULL,
    indicador TEXT NOT NULL,
    label TEXT NOT NULL,
    peso INTEGER NOT NULL,
    pct_aceitavel INTEGER DEFAULT 80,
    ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    UNIQUE(empresa_id, funcao_id, indicador),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
  );

  -- Checklist (Módulo 4)
  CREATE TABLE checklist_modelos (
    id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL,
    periodo TEXT NOT NULL CHECK(periodo IN ('checkin','checkout','mensal','diario','semanal')),
    categoria TEXT, funcao_id TEXT, ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE checklist_itens (
    id TEXT PRIMARY KEY, modelo_id TEXT NOT NULL, texto TEXT NOT NULL,
    peso INTEGER DEFAULT 0, ordem INTEGER DEFAULT 0,
    FOREIGN KEY (modelo_id) REFERENCES checklist_modelos(id)
  );
  CREATE TABLE checklist_execucoes (
    id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL,
    modelo_id TEXT NOT NULL, colaborador_id TEXT NOT NULL, periodo TEXT NOT NULL,
    data TEXT NOT NULL, nota INTEGER DEFAULT 0, status TEXT DEFAULT 'concluido',
    criado_em TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE checklist_respostas (
    id TEXT PRIMARY KEY, execucao_id TEXT NOT NULL, item_id TEXT NOT NULL,
    resposta TEXT NOT NULL CHECK(resposta IN ('ok','nok','na','bom','regular','ruim')), observacao TEXT,
    FOREIGN KEY (execucao_id) REFERENCES checklist_execucoes(id)
  );

  -- Auditoria (Módulo 5)
  CREATE TABLE auditorias (
    id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL,
    supervisor_id TEXT NOT NULL, data TEXT NOT NULL, nota INTEGER DEFAULT 0,
    observacoes TEXT, status TEXT DEFAULT 'concluida', criado_em TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE auditoria_itens (
    id TEXT PRIMARY KEY, auditoria_id TEXT NOT NULL, categoria TEXT, texto TEXT NOT NULL,
    peso INTEGER DEFAULT 0, resultado TEXT NOT NULL CHECK(resultado IN ('bom','regular','ruim')),
    observacao TEXT, FOREIGN KEY (auditoria_id) REFERENCES auditorias(id)
  );

  -- Avaliações por função (Módulo 6)
  CREATE TABLE avaliacoes_funcao (
    id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL,
    colaborador_id TEXT NOT NULL, funcao_id TEXT NOT NULL, mes INTEGER NOT NULL, ano INTEGER NOT NULL,
    indicador TEXT NOT NULL, avaliacao TEXT NOT NULL CHECK(avaliacao IN ('bom','regular','ruim')),
    lancado_por_id TEXT, criado_em TEXT DEFAULT (datetime('now')), atualizado_em TEXT DEFAULT (datetime('now')),
    UNIQUE(colaborador_id, mes, ano, indicador)
  );
`);

// ─── DADOS INICIAIS ───────────────────────────────────────────────────────────

const { v4: uuidv4 } = require('uuid');

const empresaId = 'empresa-mutti-001';
const senhaHash = bcrypt.hashSync('Mutti@2026', 10);
const senhaColabHash = bcrypt.hashSync('Mutti123', 10);

// Empresa
db.prepare(`INSERT INTO empresas VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
  empresaId, 'Grupo Mutti', '12.345.678/0001-99', 'Farmácia',
  'grupomutti', 'Carlos Mutti', 'carlos@grupomutti.com.br',
  '(75) 99999-0000', 'profissional', 1, new Date().toISOString()
);

// Lojas
const lojas = [
  { id: 'loja-esplanada', nome: 'Mutti - Esplanada', cidade: 'Alagoinhas-BA' },
  { id: 'loja-rioreal', nome: 'Mutti - Rio Real', cidade: 'Rio Real-BA' },
  { id: 'loja-entrerioss1', nome: 'Mutti - Entre Rios 1', cidade: 'Entre Rios-BA' },
  { id: 'loja-entrerios2', nome: 'Mutti - Entre Rios 2', cidade: 'Entre Rios-BA' },
  { id: 'loja-ultraesplanada', nome: 'Ultra - Esplanada', cidade: 'Alagoinhas-BA' },
  { id: 'loja-ultraentrerios', nome: 'Ultra - Entre Rios', cidade: 'Entre Rios-BA' },
  { id: 'loja-farmarocha', nome: 'Farma Rocha', cidade: 'Alagoinhas-BA' },
  { id: 'loja-posto', nome: 'Posto de Medicamentos', cidade: 'Alagoinhas-BA' },
];
const insLoja = db.prepare(`INSERT INTO lojas VALUES (?,?,?,?,?,?,?,?,?)`);
lojas.forEach(l => insLoja.run(l.id, empresaId, l.nome, '', l.cidade, '', 'Denilson', 1, new Date().toISOString()));

// Funções
const funcoes = [
  { id: 'func-diretor', nome: 'Diretor Geral', checklist: 0, aval: 0, meta: 0, escritorio: 1 },
  { id: 'func-gestor', nome: 'Gestor Geral', checklist: 0, aval: 0, meta: 0, escritorio: 1 },
  { id: 'func-supervisor', nome: 'Supervisor', checklist: 0, aval: 0, meta: 0, escritorio: 1 },
  { id: 'func-gerente', nome: 'Gerente', checklist: 1, aval: 1, meta: 1, escritorio: 1 },
  { id: 'func-subgerente', nome: 'Subgerente', checklist: 1, aval: 1, meta: 0, escritorio: 0 },
  { id: 'func-vendedor', nome: 'Vendedor', checklist: 0, aval: 1, meta: 1, escritorio: 0 },
  { id: 'func-caixa', nome: 'Caixa', checklist: 0, aval: 1, meta: 0, escritorio: 0 },
  { id: 'func-conferente', nome: 'Conferente', checklist: 0, aval: 1, meta: 0, escritorio: 0 },
  { id: 'func-farmaceutico', nome: 'Farmacêutico', checklist: 0, aval: 1, meta: 0, escritorio: 0 },
  { id: 'func-estagiario', nome: 'Estagiário', checklist: 0, aval: 1, meta: 0, escritorio: 0 },
  { id: 'func-limpeza', nome: 'Limpeza', checklist: 1, aval: 0, meta: 0, escritorio: 0 },
  { id: 'func-rh', nome: 'RH', checklist: 0, aval: 0, meta: 0, escritorio: 1 },
  { id: 'func-marketing', nome: 'Marketing', checklist: 0, aval: 0, meta: 0, escritorio: 1 },
  { id: 'func-suporte', nome: 'Suporte', checklist: 0, aval: 0, meta: 0, escritorio: 1 },
  { id: 'func-tesouraria', nome: 'Tesouraria', checklist: 0, aval: 0, meta: 0, escritorio: 1 },
  { id: 'func-comercial', nome: 'Comercial', checklist: 0, aval: 0, meta: 0, escritorio: 1 },
  // ── Estrutura organizacional (cadastráveis) ──
  { id: 'func-financeiro', nome: 'Financeiro', checklist: 0, aval: 0, meta: 0, escritorio: 1 },
  { id: 'func-controladoria', nome: 'Controladoria', checklist: 0, aval: 0, meta: 0, escritorio: 1 },
  { id: 'func-compras-beleza', nome: 'Comprador Beleza', checklist: 0, aval: 0, meta: 0, escritorio: 1 },
  { id: 'func-compras-bemestar', nome: 'Comprador Bem-estar', checklist: 0, aval: 0, meta: 0, escritorio: 1 },
  { id: 'func-devolucao', nome: 'Devolução', checklist: 0, aval: 0, meta: 0, escritorio: 1 },
  { id: 'func-atendimento-online', nome: 'Atendimento Online', checklist: 0, aval: 0, meta: 0, escritorio: 0 },
  { id: 'func-operador-loja', nome: 'Operador de Loja', checklist: 0, aval: 0, meta: 0, escritorio: 0 },
  { id: 'func-promotor', nome: 'Promotor de Vendas', checklist: 0, aval: 0, meta: 0, escritorio: 0 },
  { id: 'func-entregador', nome: 'Entregador', checklist: 0, aval: 0, meta: 0, escritorio: 0 },
  { id: 'func-ouvidoria', nome: 'Ouvidoria', checklist: 0, aval: 0, meta: 0, escritorio: 1 },
];
const insFuncao = db.prepare(`INSERT INTO funcoes (id,empresa_id,nome,tem_checklist,tem_avaliacao,tem_meta,ativa,escritorio) VALUES (?,?,?,?,?,?,1,?)`);
funcoes.forEach(f => insFuncao.run(f.id, empresaId, f.nome, f.checklist, f.aval, f.meta, f.escritorio));

// Colaboradores iniciais
const colaboradores = [
  { id: 'colab-carlos', lojaId: 'loja-esplanada', funcaoId: 'func-diretor', nome: 'Carlos Mutti', email: 'carlos@grupomutti.com.br', salario: 0, senha: senhaHash },
  { id: 'colab-denilson', lojaId: 'loja-esplanada', funcaoId: 'func-supervisor', nome: 'Denilson Silva', email: 'denilson@grupomutti.com.br', salario: 5000, senha: senhaHash },
  { id: 'colab-renato', lojaId: 'loja-esplanada', funcaoId: 'func-gerente', nome: 'Renato Ferreira', email: 'renato@grupomutti.com.br', salario: 3200, senha: senhaColabHash },
  { id: 'colab-helenneide', lojaId: 'loja-esplanada', funcaoId: 'func-vendedor', nome: 'Helenneide Souza', email: 'helenneide@grupomutti.com.br', salario: 1800, senha: senhaColabHash },
  { id: 'colab-ingrid', lojaId: 'loja-esplanada', funcaoId: 'func-caixa', nome: 'Ingrid Santos', email: 'ingrid@grupomutti.com.br', salario: 1500, senha: senhaColabHash },
  { id: 'colab-paloma', lojaId: 'loja-esplanada', funcaoId: 'func-caixa', nome: 'Paloma Cardoso', email: 'paloma@grupomutti.com.br', salario: 1500, senha: senhaColabHash },
  { id: 'colab-jonas', lojaId: 'loja-esplanada', funcaoId: 'func-conferente', nome: 'Jonas Lima', email: 'jonas@grupomutti.com.br', salario: 1600, senha: senhaColabHash },
  { id: 'colab-marli', lojaId: 'loja-esplanada', funcaoId: 'func-limpeza', nome: 'Marli Souza', email: 'marli@grupomutti.com.br', salario: 1400, senha: senhaColabHash },
  { id: 'colab-cristiano', lojaId: 'loja-rioreal', funcaoId: 'func-gerente', nome: 'Cristiano Bonfim', email: 'cristiano@grupomutti.com.br', salario: 3200, senha: senhaColabHash },
  { id: 'colab-randal', lojaId: 'loja-farmarocha', funcaoId: 'func-gerente', nome: 'Randal Alves', email: 'randal@grupomutti.com.br', salario: 3200, senha: senhaColabHash },
];
// departamento = SETOR central. A função representa a área/cargo dentro do setor.
const DEPTO_POR_FUNCAO = {
  'func-diretor': 'Direção', 'func-gestor': 'Direção',
  'func-supervisor': 'Supervisão',
  'func-gerente': 'Operação', 'func-subgerente': 'Operação', 'func-vendedor': 'Operação', 'func-caixa': 'Operação',
  'func-conferente': 'Operação', 'func-farmaceutico': 'Operação', 'func-estagiario': 'Operação', 'func-limpeza': 'Operação',
  'func-atendimento-online': 'Operação', 'func-operador-loja': 'Operação', 'func-promotor': 'Operação', 'func-entregador': 'Operação',
  'func-rh': 'Gente & Gestão',
  'func-marketing': 'Comercial', 'func-comercial': 'Comercial', 'func-compras-beleza': 'Comercial', 'func-compras-bemestar': 'Comercial',
  'func-suporte': 'Suporte', 'func-devolucao': 'Suporte',
  'func-tesouraria': 'Administrativo', 'func-financeiro': 'Administrativo', 'func-controladoria': 'Administrativo',
  'func-ouvidoria': 'Ouvidoria',
};
const insColab = db.prepare(`INSERT INTO colaboradores (id,empresa_id,loja_id,funcao_id,departamento,nome,email,salario,senha_hash,senha_provisoria,ativo,admissao) VALUES (?,?,?,?,?,?,?,?,?,0,1,'2020-01-01')`);
colaboradores.forEach(c => insColab.run(c.id, empresaId, c.lojaId, c.funcaoId, DEPTO_POR_FUNCAO[c.funcaoId] || null, c.nome, c.email, c.salario, c.senha));

// Tarefas de exemplo
const tarefasEx = [
  { id: uuidv4(), tipo: 'tarefa', origem: 'checklist', titulo: 'Corrigir itens negativos do checklist', descricao: 'Organização vitrine, precificação e banheiro.', responsavelId: 'colab-renato', urgente: 1, sla: 24 },
  { id: uuidv4(), tipo: 'tarefa', origem: 'encomenda', titulo: 'Encomenda pendente — Losartana 50mg', descricao: 'Cliente aguarda contato há 3 dias.', responsavelId: 'colab-helenneide', urgente: 0, sla: 48 },
  { id: uuidv4(), tipo: 'notificacao', origem: 'campanha', titulo: 'Ciência — Campanha Vitamina D', descricao: 'Confirme que está ciente desta campanha.', responsavelId: 'colab-helenneide', urgente: 0, sla: 120 },
  { id: uuidv4(), tipo: 'tarefa', origem: 'auditoria', titulo: 'Correção — Auditoria Junho/2026', descricao: 'Controle de estoque vencido e livro de registro desatualizado.', responsavelId: 'colab-renato', urgente: 0, sla: 72 },
];
const insTarefa = db.prepare(`INSERT INTO tarefas (id,empresa_id,loja_id,tipo,origem,titulo,descricao,responsavel_id,urgente,status,sla_horas,criado_em,atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,'aberto',?,datetime('now'),datetime('now'))`);
tarefasEx.forEach(t => insTarefa.run(t.id, empresaId, 'loja-esplanada', t.tipo, t.origem, t.titulo, t.descricao, t.responsavelId, t.urgente, t.sla));

// ─── MÓDULO 1: pesos dos indicadores + dados de exemplo ───────────────────────

const INDICADORES_VENDEDOR = [
  { indicador: 'identificacao', label: 'Identificação do cliente', peso: 20, ordem: 1 },
  { indicador: 'cadastro',      label: 'Pdv+',        peso: 20, ordem: 2 },
  { indicador: 'pbm',           label: 'PBM',                      peso: 25, ordem: 3 },
  { indicador: 'vitaminas',     label: 'Vitaminas',                peso: 20, ordem: 4 },
  { indicador: 'campanha',      label: 'Campanhas',                peso: 15, ordem: 5 },
];
const insCfgInd = db.prepare(`INSERT INTO config_indicadores (id,empresa_id,funcao_id,indicador,label,peso,ordem,ativo) VALUES (?,?,?,?,?,?,?,1)`);
INDICADORES_VENDEDOR.forEach(i => insCfgInd.run(uuidv4(), empresaId, 'func-vendedor', i.indicador, i.label, i.peso, i.ordem));

// Pesos das demais funções avaliadas (somam 100 cada)
const INDICADORES_FUNCAO = {
  'func-farmaceutico': [
    { indicador: 'atendimento', label: 'Qualidade do atendimento', peso: 25, ordem: 1 },
    { indicador: 'prescricao', label: 'Conferência de prescrição', peso: 20, ordem: 2 },
    { indicador: 'sngpc', label: 'SNGPC em dia', peso: 20, ordem: 3 },
    { indicador: 'farmacia_popular', label: 'Farmácia Popular em dia', peso: 15, ordem: 4 },
    { indicador: 'sala_aplicacao', label: 'Organização Sala de Aplicação', peso: 20, ordem: 5 },
  ],
  'func-estagiario': [
    { indicador: 'pontualidade', label: 'Pontualidade', peso: 25, ordem: 1 },
    { indicador: 'aprendizado', label: 'Evolução / aprendizado', peso: 30, ordem: 2 },
    { indicador: 'proatividade', label: 'Proatividade', peso: 25, ordem: 3 },
    { indicador: 'organizacao', label: 'Organização', peso: 20, ordem: 4 },
  ],
  'func-conferente': [
    { indicador: 'erros_entrada', label: 'Erros de entrada', peso: 25, ordem: 1 },
    { indicador: 'recebimento', label: 'Recepção de transporte', peso: 25, ordem: 2 },
    { indicador: 'org_estoque', label: 'Organização do estoque', peso: 25, ordem: 3 },
    { indicador: 'devolucoes', label: 'Devoluções', peso: 25, ordem: 4 },
  ],
};
Object.entries(INDICADORES_FUNCAO).forEach(([fid, inds]) =>
  inds.forEach(i => insCfgInd.run(uuidv4(), empresaId, fid, i.indicador, i.label, i.peso, i.ordem))
);

// Vendedores extras para o ranking da Esplanada
const vendedoresExtra = [
  { id: 'colab-jeferson', nome: 'Jeferson Santos', email: 'jeferson@grupomutti.com.br' },
  { id: 'colab-nayara', nome: 'Nayara Santos', email: 'nayara@grupomutti.com.br' },
  { id: 'colab-luiz', nome: 'Luiz Eduardo', email: 'luiz@grupomutti.com.br' },
];
vendedoresExtra.forEach(v => insColab.run(v.id, empresaId, 'loja-esplanada', 'func-vendedor', 'Atendimento', v.nome, v.email, 1700, senhaColabHash));

// Chefes de setor para a avaliação administrativa (Suporte avalia conferentes, Tesouraria avalia caixas)
const insChefe = db.prepare(`INSERT INTO colaboradores (id,empresa_id,loja_id,funcao_id,departamento,nome,email,salario,senha_hash,senha_provisoria,ativo,admissao,chefe_setor) VALUES (?,?,?,?,?,?,?,?,?,0,1,'2020-01-01',1)`);
insChefe.run('colab-suporte-chefe', empresaId, 'loja-esplanada', 'func-suporte', 'Suporte', 'Sandra Suporte', 'suporte@grupomutti.com.br', 2200, senhaColabHash);
insChefe.run('colab-tesouraria-chefe', empresaId, 'loja-esplanada', 'func-tesouraria', 'Tesouraria', 'Tales Tesouraria', 'tesouraria@grupomutti.com.br', 2400, senhaColabHash);

// Usuários de TESTE — senha fixa (não muda a cada deploy). Um por módulo/perfil.
const senhaTesteHash = bcrypt.hashSync('Teste@2026', 10);
const usuariosTeste = [
  { id: 'colab-teste-rh', funcaoId: 'func-rh', nome: 'RH', email: 'teste.rh@grupomutti.com.br' },
  { id: 'colab-teste-suporte', funcaoId: 'func-suporte', nome: 'Suporte', email: 'teste.suporte@grupomutti.com.br' },
  { id: 'colab-teste-tesouraria', funcaoId: 'func-tesouraria', nome: 'Tesouraria', email: 'teste.tesouraria@grupomutti.com.br' },
  { id: 'colab-teste-caixa', funcaoId: 'func-caixa', nome: 'Caixa', email: 'teste.caixa@grupomutti.com.br' },
  { id: 'colab-teste-atendimento', funcaoId: 'func-vendedor', nome: 'Atendimento', email: 'teste.atendimento@grupomutti.com.br' },
  { id: 'colab-teste-comercial', funcaoId: 'func-comercial', nome: 'Comercial', email: 'teste.comercial@grupomutti.com.br' },
  { id: 'colab-teste-marketing', funcaoId: 'func-marketing', nome: 'Marketing', email: 'teste.marketing@grupomutti.com.br' },
];
usuariosTeste.forEach(u => insColab.run(u.id, empresaId, 'loja-esplanada', u.funcaoId, DEPTO_POR_FUNCAO[u.funcaoId] || null, u.nome, u.email, 1800, senhaTesteHash));

const hoje = new Date();
const MES = hoje.getMonth() + 1, ANO = hoje.getFullYear();

// Meta da loja (proposta pelo gerente, já aprovada pelo diretor) + meta dos vendedores por peso
const metaLojaId = uuidv4();
db.prepare(`INSERT INTO metas (id,empresa_id,loja_id,colaborador_id,mes,ano,valor_meta,valor_super_meta,peso,status_aprovacao,criado_em) VALUES (?,?,?,NULL,?,?,?,?,1.0,'aprovado',datetime('now'))`)
  .run(metaLojaId, empresaId, 'loja-esplanada', MES, ANO, 450000, 495000);

const vendedores = [
  { id: 'colab-helenneide', peso: 1.0, inds: { identificacao:'bom', cadastro:'bom', pbm:'bom', vitaminas:'bom', campanha:'bom', generico:'regular' }, vit: 34 },
  { id: 'colab-jeferson',   peso: 1.0, inds: { identificacao:'bom', cadastro:'regular', pbm:'bom', vitaminas:'regular', campanha:'bom', generico:'bom' }, vit: 22 },
  { id: 'colab-nayara',     peso: 1.0, inds: { identificacao:'regular', cadastro:'bom', pbm:'regular', vitaminas:'bom', campanha:'regular', generico:'bom' }, vit: 31 },
  { id: 'colab-luiz',       peso: 0.8, inds: { identificacao:'regular', cadastro:'regular', pbm:'bom', vitaminas:'regular', campanha:'regular', generico:'regular' }, vit: 14 },
];
const insMetaVend = db.prepare(`INSERT INTO metas (id,empresa_id,loja_id,colaborador_id,mes,ano,valor_meta,valor_super_meta,peso,status_aprovacao,criado_em) VALUES (?,?,?,?,?,?,0,0,?,'auto',datetime('now'))`);
const insVenda = db.prepare(`INSERT INTO vendas (id,empresa_id,loja_id,colaborador_id,valor,data_venda,lancado_por_id,criado_em) VALUES (?,?,?,?,?,?,?,datetime('now'))`);
const insInd = db.prepare(`INSERT INTO indicadores_vendedor (id,empresa_id,loja_id,colaborador_id,mes,ano,indicador,avaliacao,valor_num,lancado_por_id) VALUES (?,?,?,?,?,?,?,?,?,?)`);

vendedores.forEach(v => {
  insMetaVend.run(uuidv4(), empresaId, 'loja-esplanada', v.id, MES, ANO, v.peso);
  // 14 dias de vendas de exemplo
  const base = 380 + Math.round(v.peso * 80);
  for (let d = 1; d <= 14; d++) {
    const valor = base + Math.round((Math.sin(d) + Math.random()) * 60);
    const data = `${ANO}-${String(MES).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    insVenda.run(uuidv4(), empresaId, 'loja-esplanada', v.id, valor, data, 'colab-renato');
  }
  // Indicadores
  Object.entries(v.inds).forEach(([ind, av]) => {
    insInd.run(uuidv4(), empresaId, 'loja-esplanada', v.id, MES, ANO, ind, av, ind === 'vitaminas' ? v.vit : 0, 'colab-renato');
  });
});

// ── Checklist de Limpeza Mensal (Módulo 4 · indicador "Limpeza" do pilar Organização) ──
const CHECK_LIMPEZA_ID = 'check-limpeza-mensal';
const ITENS_LIMPEZA = [
  ['Limpeza embaixo das prateleiras', 20],
  ['Ponta de gôndolas de vidro', 20],
  ['Limpeza de monitores', 20],
  ['Limpeza de balcões', 20],
  ['Lavar tapetes', 20],
]; // pesos somam 100
db.prepare(`INSERT INTO checklist_modelos (id,empresa_id,nome,periodo,categoria,funcao_id,ativo) VALUES (?,?,?,?,?,?,1)`)
  .run(CHECK_LIMPEZA_ID, empresaId, 'Checklist de Limpeza Mensal', 'mensal', 'limpeza', 'func-limpeza');
const insCheckItem = db.prepare(`INSERT INTO checklist_itens (id,modelo_id,texto,peso,ordem) VALUES (?,?,?,?,?)`);
ITENS_LIMPEZA.forEach(([texto, peso], i) => insCheckItem.run(uuidv4(), CHECK_LIMPEZA_ID, texto, peso, i + 1));
// Execução demo (nota 88, como no protótipo do painel do gerente)
db.prepare(`INSERT INTO checklist_execucoes (id,empresa_id,loja_id,modelo_id,colaborador_id,periodo,data,nota) VALUES (?,?,?,?,?,?,?,?)`)
  .run(uuidv4(), empresaId, 'loja-esplanada', CHECK_LIMPEZA_ID, 'colab-renato', 'mensal', `${ANO}-${String(MES).padStart(2,'0')}-05`, 88);

// ── Checklist de Limpeza DIÁRIO (mesma categoria 'limpeza') ──
const CHECK_LIMPEZA_DIA_ID = 'check-limpeza-diario';
const ITENS_LIMPEZA_DIA = [
  ['Varrer', 10], ['Passar pano', 10], ['Lavagem sanitários', 10], ['Esvaziar lixeiras', 10],
  ['Limpeza de espelhos', 10], ['Papel higiênico / toalha', 10], ['Sabonete líquido', 10],
  ['Limpeza copa', 10], ['Sala de aplicação', 10], ['Administrativo', 10],
]; // pesos somam 100
db.prepare(`INSERT INTO checklist_modelos (id,empresa_id,nome,periodo,categoria,funcao_id,ativo) VALUES (?,?,?,?,?,?,1)`)
  .run(CHECK_LIMPEZA_DIA_ID, empresaId, 'Checklist de Limpeza Diário', 'diario', 'limpeza', 'func-limpeza');
ITENS_LIMPEZA_DIA.forEach(([texto, peso], i) => insCheckItem.run(uuidv4(), CHECK_LIMPEZA_DIA_ID, texto, peso, i + 1));
db.prepare(`INSERT INTO checklist_execucoes (id,empresa_id,loja_id,modelo_id,colaborador_id,periodo,data,nota) VALUES (?,?,?,?,?,?,?,?)`)
  .run(uuidv4(), empresaId, 'loja-esplanada', CHECK_LIMPEZA_DIA_ID, 'colab-renato', 'diario', `${ANO}-${String(MES).padStart(2,'0')}-10`, 100);

// ── Checklist de Limpeza SEMANAL ──
const CHECK_LIMPEZA_SEM_ID = 'check-limpeza-semanal';
const ITENS_LIMPEZA_SEM = [
  ['Letreiros de sanca', 25], ['Acrílico da farmacinha', 25], ['Depósito', 25], ['Escada', 25],
]; // pesos somam 100
db.prepare(`INSERT INTO checklist_modelos (id,empresa_id,nome,periodo,categoria,funcao_id,ativo) VALUES (?,?,?,?,?,?,1)`)
  .run(CHECK_LIMPEZA_SEM_ID, empresaId, 'Checklist de Limpeza Semanal', 'semanal', 'limpeza', 'func-limpeza');
ITENS_LIMPEZA_SEM.forEach(([texto, peso], i) => insCheckItem.run(uuidv4(), CHECK_LIMPEZA_SEM_ID, texto, peso, i + 1));

// ── Lançamentos de Caixa (fechamento diário) — alimenta indicador "Caixa" e o ranking Caixa Destaque ──
db.exec(`CREATE TABLE IF NOT EXISTS lancamentos_caixa (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, colaborador_id TEXT, turno TEXT,
  data TEXT NOT NULL, faturamento REAL DEFAULT 0, diferenca REAL NOT NULL DEFAULT 0, observacao TEXT,
  justificativa TEXT, justif_status TEXT, criado_em TEXT DEFAULT (datetime('now'))
);`);

// ── Aceite formal de campanha (prova legal: IP + selfie + termo) ──
db.exec(`CREATE TABLE IF NOT EXISTS aceites_campanha (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, meta_id TEXT NOT NULL, colaborador_id TEXT,
  colaborador_nome TEXT, campanha_nome TEXT, ip TEXT, user_agent TEXT, selfie TEXT,
  aceito_em TEXT DEFAULT (datetime('now'))
);`);

// ── Calendário de vendas (dias não úteis definidos pela SUPERVISÃO) ──
db.exec(`CREATE TABLE IF NOT EXISTS dias_nao_uteis (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL,
  data TEXT NOT NULL, tipo TEXT DEFAULT 'feriado',
  UNIQUE(empresa_id, loja_id, data)
);`);

// ── Reposição diária por colaborador (base da Disciplina operacional) ──
db.exec(`CREATE TABLE IF NOT EXISTS reposicao_dia (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL, data TEXT NOT NULL, fez INTEGER DEFAULT 1,
  UNIQUE(empresa_id, colaborador_id, data)
);`);

// ── Regras de premiação por faixa de % (ex.: Caixa Destaque, 3 faixas) ──
db.exec(`CREATE TABLE IF NOT EXISTS regras_premiacao (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, area TEXT NOT NULL,
  faixa1_valor REAL DEFAULT 0, faixa2_valor REAL DEFAULT 0, faixa3_valor REAL DEFAULT 0, faixa4_valor REAL DEFAULT 0,
  aceitavel REAL DEFAULT 90,
  UNIQUE(empresa_id, area)
);`);
// Regra padrão do Caixa Destaque (valor máx 250 → 4 faixas 100/75/50/25%, aceitável 90%)
db.prepare(`INSERT OR IGNORE INTO regras_premiacao (id,empresa_id,area,faixa1_valor,faixa2_valor,faixa3_valor,faixa4_valor,aceitavel) VALUES (?,?,?,?,?,?,?,?)`)
  .run(uuidv4(), empresaId, 'func-caixa', 250, 150, 100, 50, 90);

// ── Checklist do gerente (único por dia: abre de manhã, fecha no fim do dia) ──
db.exec(`CREATE TABLE IF NOT EXISTS gerente_checklist (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, data TEXT NOT NULL,
  secao TEXT NOT NULL, item TEXT NOT NULL, avaliacao TEXT,
  UNIQUE(empresa_id, loja_id, data, secao, item)
);`);
db.exec(`CREATE TABLE IF NOT EXISTS gerente_checklist_dia (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, data TEXT NOT NULL,
  aberto_em TEXT, fechado_em TEXT, fechado INTEGER DEFAULT 0,
  limpeza_status TEXT, limpeza_motivo TEXT,
  UNIQUE(empresa_id, loja_id, data)
);`);

// ── Comentários/justificativas das tarefas (com reanálise) ──
db.exec(`CREATE TABLE IF NOT EXISTS tarefa_comentarios (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, tarefa_id TEXT NOT NULL,
  autor_id TEXT, autor_nome TEXT, texto TEXT NOT NULL, tipo TEXT DEFAULT 'comentario',
  interno INTEGER DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now'))
);`);

db.exec(`CREATE TABLE IF NOT EXISTS tarefa_anexos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, tarefa_id TEXT NOT NULL,
  autor_id TEXT, autor_nome TEXT,
  tipo TEXT, nome TEXT, mime TEXT, tamanho INTEGER, dados TEXT,
  exige_assinatura INTEGER DEFAULT 0, assinado INTEGER DEFAULT 0,
  assinado_por_id TEXT, assinado_por_nome TEXT,
  assinatura_selfie TEXT, assinatura_ip TEXT, assinatura_em TEXT,
  assinatura_ciente INTEGER DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now'))
);`);

db.exec(`CREATE TABLE IF NOT EXISTS tarefa_anexo_assinaturas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, anexo_id TEXT NOT NULL,
  signatario_id TEXT NOT NULL, signatario_nome TEXT,
  assinado INTEGER DEFAULT 0, selfie TEXT, ip TEXT, assinado_em TEXT, ciente INTEGER DEFAULT 0
);`);

// ── Ocorrências: cadastro de motivos (cada motivo impacta UM indicador) + lançamentos ──
db.exec(`CREATE TABLE IF NOT EXISTS empresas_terceirizadas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL, cnpj TEXT,
  ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now'))
);`);
db.exec(`CREATE TABLE IF NOT EXISTS tarefa_apoios (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, tarefa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now'))
);`);
db.exec(`CREATE TABLE IF NOT EXISTS tarefa_leitura (
  tarefa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL, ultima_leitura TEXT,
  PRIMARY KEY (tarefa_id, colaborador_id)
);`);
db.exec(`CREATE TABLE IF NOT EXISTS ocorrencia_motivos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, categoria TEXT NOT NULL,
  motivo TEXT NOT NULL, deducao REAL DEFAULT 0, zera INTEGER DEFAULT 0,
  indicador_alvo TEXT NOT NULL, indicador_gerente TEXT, ativo INTEGER DEFAULT 1,
  exige_termo INTEGER DEFAULT 0, termo_tipo TEXT
);`);
db.exec(`CREATE TABLE IF NOT EXISTS ocorrencias (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT, colaborador_id TEXT NOT NULL,
  motivo_id TEXT, motivo TEXT, deducao REAL DEFAULT 0, zera INTEGER DEFAULT 0,
  categoria TEXT, indicador_alvo TEXT, indicador_gerente TEXT, obs TEXT,
  status TEXT DEFAULT 'ativa', data TEXT, criado_por TEXT, criado_em TEXT DEFAULT (datetime('now')),
  exige_termo INTEGER DEFAULT 0, termo_tipo TEXT
);`);
// Seed dos motivos de Conduta Profissional (RH) — tabela 4.7
const MOTIVOS_CONDUTA = [
  ['Atraso', 10, 0], ['3+ atrasos no mês', 20, 0], ['Falta não justificada', 20, 0],
  ['Advertência verbal', 20, 0], ['Advertência escrita', 40, 0], ['Suspensão', 0, 1],
  ['Uso indevido de celular/equipamento', 10, 0], ['Descumprimento de norma', 15, 0],
  ['Postura inadequada com cliente', 15, 0], ['Postura inadequada com colega', 10, 0],
];
const insMot = db.prepare(`INSERT INTO ocorrencia_motivos (id,empresa_id,categoria,motivo,deducao,zera,indicador_alvo) VALUES (?,?,?,?,?,?,?)`);
MOTIVOS_CONDUTA.forEach(([m, d, z]) => insMot.run(uuidv4(), empresaId, 'RH', m, d, z, 'conduta'));
// Motivos que geram termo (advertência/suspensão) já marcados para exigir texto/assinatura
db.prepare(`UPDATE ocorrencia_motivos SET exige_termo=1, termo_tipo='suspensao' WHERE empresa_id=? AND motivo LIKE 'Suspens%'`).run(empresaId);
db.prepare(`UPDATE ocorrencia_motivos SET exige_termo=1, termo_tipo='advertencia' WHERE empresa_id=? AND motivo LIKE 'Advert%'`).run(empresaId);

// ── Checklist operacional adiável (diária/semanal/mensal) ──
db.exec(`CREATE TABLE IF NOT EXISTS checklist_def (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL,
  destino TEXT DEFAULT 'operacional', modo TEXT DEFAULT 'inteiro', indicador_alvo TEXT, ativo INTEGER DEFAULT 1
);`);
db.exec(`CREATE TABLE IF NOT EXISTS checklist_secao (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, checklist_id TEXT NOT NULL,
  nome TEXT NOT NULL, peso REAL DEFAULT 0, indicador_alvo TEXT, responsavel TEXT DEFAULT 'gerente'
);`);
db.exec(`CREATE TABLE IF NOT EXISTS operacional_itens (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT, checklist_id TEXT, secao_id TEXT, nome TEXT NOT NULL,
  periodicidade TEXT NOT NULL CHECK(periodicidade IN ('diaria','semanal','mensal')),
  responsavel_funcao TEXT, ativo INTEGER DEFAULT 1
);`);
db.exec(`CREATE TABLE IF NOT EXISTS operacional_exec (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, item_id TEXT NOT NULL, loja_id TEXT NOT NULL,
  periodo_ref TEXT NOT NULL, data_prevista TEXT, status TEXT DEFAULT 'pendente',
  adiamentos INTEGER DEFAULT 0, feito_em TEXT,
  UNIQUE(empresa_id, item_id, loja_id, periodo_ref)
);`);

const insCaixa = db.prepare(`INSERT INTO lancamentos_caixa (id,empresa_id,loja_id,colaborador_id,turno,data,faturamento,diferenca,observacao) VALUES (?,?,?,?,?,?,?,?,?)`);
const DEMO_CAIXA = {
  'colab-ingrid': { turno: 'Manhã', dias: [
    [2, 4250.80, 0, ''], [3, 3890.40, 2.50, ''], [4, 4100.20, 0, ''], [5, 3750.60, 8.30, 'Diferença justificada'],
    [7, 4500.00, 0, ''], [9, 4200.30, 0, ''], [10, 3950.70, 0, ''], [11, 4300.90, 0, ''], [12, 4150.40, 3.20, ''], [13, 4400.10, 0, ''],
  ] },
  'colab-paloma': { turno: 'Tarde', dias: [
    [2, 3800.50, 12.40, 'Troco errado'], [3, 3600.20, 0, ''], [4, 3900.80, 0, ''], [5, 3400.30, 25.00, 'Erro identificado'],
    [7, 3700.00, 0, ''], [9, 3550.40, 4.50, ''], [10, 3820.60, 0, ''], [11, 3650.20, 60.00, 'Divergência grave — verificar'],
  ] },
};
for (const [colabId, info] of Object.entries(DEMO_CAIXA)) {
  info.dias.forEach(([dia, fat, dif, obs]) => insCaixa.run(uuidv4(), empresaId, 'loja-esplanada', colabId, info.turno, `${ANO}-${String(MES).padStart(2,'0')}-${String(dia).padStart(2,'0')}`, fat, dif, obs));
}

// ── Avaliação administrativa (chefe do setor avalia pessoas de funções delegadas) ──
db.exec(`CREATE TABLE IF NOT EXISTS avaliacao_admin (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, data TEXT NOT NULL,
  funcao_id TEXT NOT NULL, avaliado_id TEXT NOT NULL, chefe_id TEXT,
  nota TEXT, status TEXT DEFAULT 'pendente', reanalisada INTEGER DEFAULT 0, reanalise_motivo TEXT, nota_pct INTEGER,
  criado_em TEXT DEFAULT (datetime('now'))
);`);

// ── Pilares & Indicadores do Gerente (agora cadastráveis) ──
db.exec(`CREATE TABLE IF NOT EXISTS pilares (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL,
  cor TEXT, peso INTEGER DEFAULT 0, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);`);
db.exec(`CREATE TABLE IF NOT EXISTS indicadores_def (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, pilar_id TEXT NOT NULL, nome TEXT NOT NULL,
  min INTEGER DEFAULT 0, fonte TEXT DEFAULT 'manual', acao TEXT, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);`);
const { DEFAULT_PILARES } = require('../lib/pilaresSeed');
const insPilar = db.prepare(`INSERT INTO pilares (id,empresa_id,nome,cor,peso,ordem,ativo) VALUES (?,?,?,?,?,?,1)`);
const insIndDef = db.prepare(`INSERT INTO indicadores_def (id,empresa_id,pilar_id,nome,min,fonte,acao,ordem,ativo) VALUES (?,?,?,?,?,?,?,?,1)`);
DEFAULT_PILARES.forEach((p, pi) => {
  insPilar.run(p.id, empresaId, p.nome, p.cor, p.peso, pi);
  p.indicadores.forEach((ind, ii) => insIndDef.run(ind.id, empresaId, p.id, ind.nome, ind.min, ind.fonte, ind.acao, ii));
});

// ── Configurações gerais (chave/valor) ──
db.exec(`CREATE TABLE IF NOT EXISTS configuracoes (
  empresa_id TEXT NOT NULL, chave TEXT NOT NULL, valor TEXT, PRIMARY KEY (empresa_id, chave)
);`);

// ── Seções/itens do Checklist Diário do gerente (cadastráveis) ──
db.exec(`CREATE TABLE IF NOT EXISTS gerente_secoes (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL, peso INTEGER DEFAULT 0, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1, responsavel_pendencia TEXT
);`);
db.exec(`CREATE TABLE IF NOT EXISTS gerente_itens (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, secao_id TEXT NOT NULL, nome TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1, responsavel_pendencia TEXT
);`);
const { SECOES_GERENTE: SEED_SEC } = require('../lib/secoesGerenteSeed');
const insGSec = db.prepare(`INSERT INTO gerente_secoes (id,empresa_id,nome,peso,ordem,ativo) VALUES (?,?,?,?,?,1)`);
const insGItem = db.prepare(`INSERT INTO gerente_itens (id,empresa_id,secao_id,nome,ordem,ativo) VALUES (?,?,?,?,?,1)`);
SEED_SEC.forEach((sec, si) => {
  const sid = uuidv4();
  insGSec.run(sid, empresaId, sec.secao, sec.peso, si);
  sec.itens.forEach((it, ii) => insGItem.run(uuidv4(), empresaId, sid, it, ii));
});

// ── Itens do Checklist de Supervisão (auditoria) — cadastráveis ──
db.exec(`CREATE TABLE IF NOT EXISTS auditoria_modelo_itens (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, texto TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);`);
const { AUDITORIA_ITENS } = require('../lib/auditoriaModeloSeed');
const insAudItem = db.prepare(`INSERT INTO auditoria_modelo_itens (id,empresa_id,texto,ordem,ativo) VALUES (?,?,?,?,1)`);
AUDITORIA_ITENS.forEach((t, i) => insAudItem.run(uuidv4(), empresaId, t, i));

// ── Notas manuais de indicadores (fonte 'manual') por loja/mês ──
db.exec(`CREATE TABLE IF NOT EXISTS indicador_nota_manual (
  empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, indicador_id TEXT NOT NULL,
  mes INTEGER NOT NULL, ano INTEGER NOT NULL, nota INTEGER,
  atualizado_em TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, loja_id, indicador_id, mes, ano)
);`);

// ── Avaliação do caixa/conferente via checklist de conduta ──
// modelo: itens de conduta por função (cadastráveis)
db.exec(`CREATE TABLE IF NOT EXISTS avaliacao_conduta_modelo (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, funcao_id TEXT NOT NULL, texto TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1
);`);
// notas por item de cada avaliação administrativa
db.exec(`CREATE TABLE IF NOT EXISTS avaliacao_admin_itens (
  id TEXT PRIMARY KEY, avaliacao_id TEXT NOT NULL, texto TEXT NOT NULL, nota TEXT
);`);
const { CONDUTA_ITENS } = require('../lib/avaliacaoAdminModeloSeed');
const insCond = db.prepare(`INSERT INTO avaliacao_conduta_modelo (id,empresa_id,funcao_id,texto,ordem,ativo) VALUES (?,?,?,?,?,1)`);
Object.entries(CONDUTA_ITENS).forEach(([fid, itens]) => itens.forEach((t, i) => insCond.run(uuidv4(), empresaId, fid, t, i)));

// ── Afastamentos e férias ──
db.exec(`CREATE TABLE IF NOT EXISTS afastamentos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL, lancado_por_id TEXT,
  tipo TEXT NOT NULL, data_inicio TEXT NOT NULL, data_fim TEXT, motivo TEXT, substituto_id TEXT, turno TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);`);

// ── Ciclo do Checklist de Limpeza (abrir/fechar por colaborador da limpeza) ──
db.exec(`CREATE TABLE IF NOT EXISTS limpeza_dia (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, colaborador_id TEXT NOT NULL,
  data TEXT NOT NULL, modelo_id TEXT, aberto_em TEXT, fechado INTEGER DEFAULT 0, fechado_em TEXT,
  respostas_json TEXT, execucao_id TEXT,
  UNIQUE(empresa_id, loja_id, colaborador_id, data)
);`);

// ── Ciclo diário do Checklist Operacional (abrir/fechar por loja; semanais/mensais entram no período) ──
db.exec(`CREATE TABLE IF NOT EXISTS operacional_dia (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, data TEXT NOT NULL,
  aberto_em TEXT, fechado INTEGER DEFAULT 0, fechado_em TEXT,
  UNIQUE(empresa_id, loja_id, data)
);`);

// ── Atuação do dia: quem o gerente informou que atuou como caixa/conferente (independe da função cadastrada) ──
db.exec(`CREATE TABLE IF NOT EXISTS atuacao_dia (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, data TEXT NOT NULL,
  colaborador_id TEXT NOT NULL, funcao_atuada TEXT NOT NULL,
  UNIQUE(empresa_id, loja_id, data, colaborador_id, funcao_atuada)
);`);

// ── Colaborador que atua em mais de uma loja (lojas adicionais além da loja-sede) ──
db.exec(`CREATE TABLE IF NOT EXISTS colaborador_lojas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL, loja_id TEXT NOT NULL,
  UNIQUE(colaborador_id, loja_id)
);`);

// ── Log de ciências (histórico de quem deu ciência numa assinatura/tarefa) ──
db.exec(`CREATE TABLE IF NOT EXISTS ciencias (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, assinatura_id TEXT NOT NULL,
  colaborador_id TEXT NOT NULL, papel TEXT, ip TEXT, criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(assinatura_id, colaborador_id)
);`);

// ── Metas e lançamentos dos indicadores comerciais (meta por loja e por colaborador; realizado por período) ──
db.exec(`CREATE TABLE IF NOT EXISTS indicador_metas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, indicador TEXT NOT NULL,
  mes INTEGER NOT NULL, ano INTEGER NOT NULL, escopo TEXT NOT NULL,
  meta_valor REAL DEFAULT 0, unidade TEXT DEFAULT 'percentual', criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, loja_id, indicador, mes, ano, escopo)
);`);
db.exec(`CREATE TABLE IF NOT EXISTS indicador_lancamentos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, colaborador_id TEXT NOT NULL, indicador TEXT NOT NULL,
  mes INTEGER NOT NULL, ano INTEGER NOT NULL, data_inicio TEXT, data_fim TEXT, valor REAL DEFAULT 0,
  criado_por TEXT, criado_em TEXT DEFAULT (datetime('now'))
);`);

db.exec(`CREATE TABLE IF NOT EXISTS meta_grupos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, meta_id TEXT NOT NULL, grupo TEXT NOT NULL,
  valor_meta REAL DEFAULT 0, valor_super REAL DEFAULT 0,
  UNIQUE(meta_id, grupo)
);`);

// ── Escala de feriado/fim de semana (horário + turnos + equipe; negociação supervisor↔gerente) ──
db.exec(`CREATE TABLE IF NOT EXISTS feriado_escala (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, data TEXT NOT NULL,
  tipo TEXT, modo TEXT, status TEXT,
  turnos_json TEXT, criado_por_id TEXT, gerente_id TEXT,
  gerente_obs TEXT, supervisor_obs TEXT,
  criado_em TEXT DEFAULT (datetime('now')), atualizado_em TEXT,
  UNIQUE(empresa_id, loja_id, data)
);`);
db.exec(`CREATE TABLE IF NOT EXISTS feriado_escala_equipe (
  id TEXT PRIMARY KEY, escala_id TEXT NOT NULL, colaborador_id TEXT NOT NULL,
  turno_nome TEXT, horario_custom TEXT, incluido_por TEXT,
  ciencia INTEGER DEFAULT 0, ciencia_em TEXT, escalonado INTEGER DEFAULT 0, criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(escala_id, colaborador_id)
);`);

// ── Assinaturas/ciência documentada (foto, IP, hora) — gera PDF guardável ──
db.exec(`CREATE TABLE IF NOT EXISTS assinaturas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, tarefa_id TEXT, colaborador_id TEXT NOT NULL,
  tipo TEXT, referencia_id TEXT, titulo TEXT, texto TEXT,
  foto_base64 TEXT, ip TEXT, user_agent TEXT, assinado_em TEXT,
  baixado_por_id TEXT, baixado_em TEXT, criado_em TEXT DEFAULT (datetime('now'))
);`);

// ── Folgas (pedido/aprovação) — alimenta o "motor de folga" e a resolução de quem cobre a loja ──
db.exec(`CREATE TABLE IF NOT EXISTS folgas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT, colaborador_id TEXT NOT NULL,
  data TEXT NOT NULL, status TEXT DEFAULT 'pendente',
  solicitado_por_id TEXT, aprovado_por_id TEXT, aprovado_em TEXT,
  substituto_id TEXT, turno TEXT, motivo TEXT, criado_em TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, colaborador_id, data)
);`);

db.close();
console.log('✅ Banco de dados criado com sucesso!');
console.log('');
console.log('Usuários de acesso:');
console.log('  Diretor:    carlos@grupomutti.com.br  / Mutti@2026');
console.log('  Supervisor: denilson@grupomutti.com.br / Mutti@2026');
console.log('  Gerente:    renato@grupomutti.com.br  / Mutti123');
console.log('  Vendedor:   helenneide@grupomutti.com.br / Mutti123');
