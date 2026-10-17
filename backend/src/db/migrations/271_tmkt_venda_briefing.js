// 271_tmkt_venda_briefing.js — Briefing da negociação como CHAT (Joe 2026-10-16):
// a aba "Material & arte" vira também o briefing: uma conversa (mensagens) entre a gestão e o
// fornecedor, com anexo de arquivo, para ir inserindo observações da ação.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_venda_briefing (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, venda_id TEXT NOT NULL,
  autor TEXT,            -- 'gestao' | 'fornecedor'
  autor_nome TEXT,
  tipo TEXT DEFAULT 'msg', -- 'msg' (observação) | 'comprovacao' (prova da ação, foto)
  texto TEXT,
  anexo_b64 TEXT, anexo_mime TEXT, anexo_nome TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_venda_briefing ON tmkt_venda_briefing(empresa_id, venda_id)`);
console.log('✅ migration 271: tmkt_venda_briefing (chat de briefing + anexos)');
