// 198_pontorep_apuracao.js — Apuração diária (batida × escala prevista) e estabelecimentos por loja.
// A batida em si já mora em pontorep_marcacao (imutável, migration 193). Idempotente.
const db = require('../connection');
const { v4: uuid } = require('uuid');
const EMP = 'empresa-mutti-001';

// Resultado apurado por colaborador/dia (camada de cálculo POR CIMA da batida original)
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_apuracao_dia (
  id             TEXT PRIMARY KEY,
  empresa_id     TEXT NOT NULL,
  colaborador_id TEXT NOT NULL,
  data           TEXT NOT NULL,
  previsto_min   INTEGER DEFAULT 0,
  trabalhado_min INTEGER DEFAULT 0,
  atraso_min     INTEGER DEFAULT 0,
  extra_min      INTEGER DEFAULT 0,
  noturno_min    INTEGER DEFAULT 0,
  saldo_min      INTEGER DEFAULT 0,     -- trabalhado - previsto (alimenta banco de horas)
  falta          INTEGER DEFAULT 0,
  folga          INTEGER DEFAULT 0,
  batidas        INTEGER DEFAULT 0,
  status         TEXT,                  -- ok | atraso | extra | falta | incompleto | folga
  apurado_em     TEXT,
  UNIQUE(empresa_id, colaborador_id, data)
)`);

// Estabelecimentos (1 por loja) — a batida referencia o estabelecimento e tem NSR próprio por ele
const lojas = db.prepare(`SELECT DISTINCT loja_id FROM colaboradores WHERE empresa_id=? AND loja_id IS NOT NULL AND loja_id<>''`).all(EMP);
const ins = db.prepare(`INSERT OR IGNORE INTO pontorep_estabelecimento (id,empresa_id,loja_id,razao_social,criado_em) VALUES (?,?,?,?,datetime('now'))`);
lojas.forEach(l => ins.run(uuid(), EMP, l.loja_id, l.loja_id));

console.log('✅ migration 198: pontorep_apuracao_dia +', lojas.length, 'estabelecimentos semeados');
