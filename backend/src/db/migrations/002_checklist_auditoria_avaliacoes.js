// 002_checklist_auditoria_avaliacoes.js — Módulos 4, 5 e 6
const db = require('../connection');
const { v4: uuidv4 } = require('uuid');

console.log('▶ Migração 002 — Checklist, Auditoria e Avaliações');

db.exec(`
  -- ── CHECKLIST (Módulo 4) ──────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS checklist_modelos (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    periodo TEXT NOT NULL CHECK(periodo IN ('checkin','checkout','mensal','diario')),
    categoria TEXT,
    funcao_id TEXT,
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS checklist_itens (
    id TEXT PRIMARY KEY,
    modelo_id TEXT NOT NULL,
    texto TEXT NOT NULL,
    peso INTEGER DEFAULT 0,
    ordem INTEGER DEFAULT 0,
    FOREIGN KEY (modelo_id) REFERENCES checklist_modelos(id)
  );
  CREATE TABLE IF NOT EXISTS checklist_execucoes (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    loja_id TEXT NOT NULL,
    modelo_id TEXT NOT NULL,
    colaborador_id TEXT NOT NULL,
    periodo TEXT NOT NULL,
    data TEXT NOT NULL,
    nota INTEGER DEFAULT 0,
    status TEXT DEFAULT 'concluido',
    criado_em TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS checklist_respostas (
    id TEXT PRIMARY KEY,
    execucao_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    resposta TEXT NOT NULL CHECK(resposta IN ('ok','nok','na')),
    observacao TEXT,
    FOREIGN KEY (execucao_id) REFERENCES checklist_execucoes(id)
  );

  -- ── AUDITORIA (Módulo 5) ──────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS auditorias (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    loja_id TEXT NOT NULL,
    supervisor_id TEXT NOT NULL,
    data TEXT NOT NULL,
    nota INTEGER DEFAULT 0,
    observacoes TEXT,
    status TEXT DEFAULT 'concluida',
    criado_em TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS auditoria_itens (
    id TEXT PRIMARY KEY,
    auditoria_id TEXT NOT NULL,
    categoria TEXT,
    texto TEXT NOT NULL,
    peso INTEGER DEFAULT 0,
    resultado TEXT NOT NULL CHECK(resultado IN ('conforme','nao_conforme','na')),
    observacao TEXT,
    FOREIGN KEY (auditoria_id) REFERENCES auditorias(id)
  );

  -- ── AVALIAÇÕES POR FUNÇÃO (Módulo 6: farmacêutico, estagiário, conferente) ──
  CREATE TABLE IF NOT EXISTS avaliacoes_funcao (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    loja_id TEXT NOT NULL,
    colaborador_id TEXT NOT NULL,
    funcao_id TEXT NOT NULL,
    mes INTEGER NOT NULL,
    ano INTEGER NOT NULL,
    indicador TEXT NOT NULL,
    avaliacao TEXT NOT NULL CHECK(avaliacao IN ('bom','regular','ruim')),
    lancado_por_id TEXT,
    criado_em TEXT DEFAULT (datetime('now')),
    atualizado_em TEXT DEFAULT (datetime('now')),
    UNIQUE(colaborador_id, mes, ano, indicador)
  );

  CREATE INDEX IF NOT EXISTS idx_cl_exec ON checklist_execucoes(loja_id, data);
  CREATE INDEX IF NOT EXISTS idx_aud ON auditorias(loja_id, data);
  CREATE INDEX IF NOT EXISTS idx_avalfun ON avaliacoes_funcao(loja_id, mes, ano);
`);

// Pesos dos indicadores por função (somam 100 cada)
const INDICADORES = {
  'func-farmaceutico': [
    { indicador: 'atendimento', label: 'Qualidade do atendimento', peso: 30, ordem: 1 },
    { indicador: 'prescricao', label: 'Conferência de prescrição', peso: 25, ordem: 2 },
    { indicador: 'sngpc', label: 'SNGPC em dia', peso: 25, ordem: 3 },
    { indicador: 'organizacao', label: 'Organização do balcão', peso: 20, ordem: 4 },
  ],
  'func-estagiario': [
    { indicador: 'pontualidade', label: 'Pontualidade', peso: 25, ordem: 1 },
    { indicador: 'aprendizado', label: 'Evolução / aprendizado', peso: 30, ordem: 2 },
    { indicador: 'proatividade', label: 'Proatividade', peso: 25, ordem: 3 },
    { indicador: 'organizacao', label: 'Organização', peso: 20, ordem: 4 },
  ],
  'func-conferente': [
    { indicador: 'erros_entrada', label: 'Erros de entrada', peso: 25, ordem: 1 },
    { indicador: 'recebimento', label: 'Recebimento no prazo', peso: 25, ordem: 2 },
    { indicador: 'org_estoque', label: 'Organização do estoque', peso: 25, ordem: 3 },
    { indicador: 'devolucoes', label: 'Devoluções', peso: 25, ordem: 4 },
  ],
};

const empresas = db.prepare('SELECT id FROM empresas').all();
const insCfg = db.prepare(`INSERT OR IGNORE INTO config_indicadores (id,empresa_id,funcao_id,indicador,label,peso,ordem,ativo) VALUES (?,?,?,?,?,?,?,1)`);
let seeded = 0;
for (const emp of empresas) {
  for (const [funcaoId, inds] of Object.entries(INDICADORES)) {
    const soma = inds.reduce((a, i) => a + i.peso, 0);
    if (soma !== 100) throw new Error(`${funcaoId} pesos somam ${soma}`);
    for (const i of inds) seeded += insCfg.run(uuidv4(), emp.id, funcaoId, i.indicador, i.label, i.peso, i.ordem).changes;
  }
}
console.log(`✓ Tabelas de checklist, auditoria e avaliações criadas.`);
console.log(`✓ ${seeded} pesos de indicadores por função semeados.`);

// ── Garante a coluna `categoria` em bancos antigos (criados antes desta migração) ──
const colunas = db.prepare(`PRAGMA table_info(checklist_modelos)`).all().map(c => c.name);
if (!colunas.includes('categoria')) {
  db.exec(`ALTER TABLE checklist_modelos ADD COLUMN categoria TEXT`);
  console.log('✓ Coluna categoria adicionada em checklist_modelos.');
}

// ── Checklist de Limpeza Mensal (indicador "Limpeza" do pilar Organização) ──
const ITENS_LIMPEZA = [
  ['Piso da área de vendas limpo e seco', 9],
  ['Prateleiras e gôndolas sem poeira', 9],
  ['Balcão de atendimento higienizado', 9],
  ['Vitrines e vidros limpos', 9],
  ['Banheiros limpos e abastecidos', 8],
  ['Lixeiras esvaziadas e higienizadas', 8],
  ['Área da farmácia/manipulação limpa', 8],
  ['Geladeira de medicamentos limpa', 8],
  ['Depósito/estoque limpo e organizado', 8],
  ['Fachada e entrada limpas', 8],
  ['Filtros do ar-condicionado limpos', 8],
  ['Materiais de limpeza repostos', 8],
]; // pesos somam 100
const insModelo = db.prepare(`INSERT OR IGNORE INTO checklist_modelos (id,empresa_id,nome,periodo,categoria,funcao_id,ativo) VALUES (?,?,?,?,?,?,1)`);
const insItem = db.prepare(`INSERT OR IGNORE INTO checklist_itens (id,modelo_id,texto,peso,ordem) VALUES (?,?,?,?,?)`);
let modelosLimpeza = 0;
for (const emp of empresas) {
  const modeloId = `check-limpeza-${emp.id}`;
  const r = insModelo.run(modeloId, emp.id, 'Checklist de Limpeza Mensal', 'mensal', 'limpeza', 'func-limpeza');
  if (r.changes) {
    ITENS_LIMPEZA.forEach(([texto, peso], i) => insItem.run(uuidv4(), modeloId, texto, peso, i + 1));
    modelosLimpeza++;
  }
  // Diário (mesma categoria 'limpeza')
  const diaId = `check-limpeza-dia-${emp.id}`;
  const rd = insModelo.run(diaId, emp.id, 'Checklist de Limpeza Diário', 'diario', 'limpeza', 'func-limpeza');
  if (rd.changes) {
    [['Piso varrido e limpo', 15], ['Balcão e caixa higienizados', 15], ['Banheiros limpos e abastecidos', 15], ['Gôndolas sem poeira', 15], ['Lixeiras esvaziadas', 10], ['Vitrine e entrada limpas', 15], ['Área de medicamentos limpa', 15]]
      .forEach(([texto, peso], i) => insItem.run(uuidv4(), diaId, texto, peso, i + 1));
  }
}
console.log(`✓ Checklist de Limpeza Mensal semeado em ${modelosLimpeza} empresa(s).`);
console.log('✅ Migração 002 concluída.');
