// 125_ponto_rh.js — vínculo do colaborador com o Tangerino (por CPF) + solicitações de correção de ponto.
const db = require('../connection');
const add = (t, c, def) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };

add('colaboradores', 'tangerino_id', 'TEXT');        // id do colaborador no Tangerino (ponto)
add('colaboradores', 'tangerino_nome', 'TEXT');      // nome no Tangerino (referência do vínculo)

db.exec(`
CREATE TABLE IF NOT EXISTS ponto_correcoes (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL,
  data TEXT NOT NULL,                 -- dia da ocorrência
  tipo TEXT,                          -- entrada | saida | falta | abono | outro
  horario TEXT,                       -- horário correto informado (HH:MM), quando aplicável
  motivo TEXT,
  status TEXT DEFAULT 'pendente',     -- pendente | aprovada | rejeitada
  solicitado_por_id TEXT, solicitado_em TEXT DEFAULT (datetime('now')),
  resolvido_por_id TEXT, resolvido_por_nome TEXT, resolvido_em TEXT, resposta TEXT
);
CREATE INDEX IF NOT EXISTS idx_ponto_corr_colab ON ponto_correcoes(colaborador_id);
`);
console.log('✅ migration 125: colaboradores.tangerino_id + ponto_correcoes');
