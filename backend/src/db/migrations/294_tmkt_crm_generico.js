// 294_tmkt_crm_generico.js — generaliza o CRM proativo p/ 3 alvos: evento | plano | espaco.
// Antes era só por evento (292/293). Cria tabelas genéricas (escopo_tipo+escopo_id) e migra o que havia.
// Idempotente.
const db = require('../connection');
const has = t => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const addCol = (t, c, ddl) => { try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${ddl}`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } };

// vínculo classificação ↔ alvo (evento/plano/espaco)
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_crm_vinculo (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL,
  escopo_tipo TEXT NOT NULL, escopo_id TEXT NOT NULL,
  classificacao_id TEXT NOT NULL, nome TEXT, criado_em TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS ix_tmkt_crm_vinculo ON tmkt_crm_vinculo(escopo_tipo, escopo_id)');

// config de disparo por alvo
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_crm_outreach (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL,
  escopo_tipo TEXT NOT NULL, escopo_id TEXT NOT NULL,
  ativo INTEGER DEFAULT 0, dias_antes INTEGER DEFAULT 15, recorrente INTEGER DEFAULT 1,
  assunto TEXT, mensagem TEXT, criado_em TEXT, atualizado_em TEXT
)`);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_tmkt_crm_outreach ON tmkt_crm_outreach(empresa_id, escopo_tipo, escopo_id)');

// log genérico (reusa a tabela existente, só adiciona escopo_tipo/escopo_id)
if (has('tmkt_outreach_log')) {
  addCol('tmkt_outreach_log', 'escopo_tipo', "escopo_tipo TEXT");
  addCol('tmkt_outreach_log', 'escopo_id', 'escopo_id TEXT');
  try { db.exec("UPDATE tmkt_outreach_log SET escopo_tipo='evento' WHERE escopo_tipo IS NULL"); } catch (e) {}
  try { db.exec('UPDATE tmkt_outreach_log SET escopo_id=evento_id WHERE escopo_id IS NULL'); } catch (e) {}
}

// migra os vínculos/config de evento que já existiam (feature nova; normalmente vazio)
if (has('tmkt_evento_classificacao')) {
  try { db.exec(`INSERT INTO tmkt_crm_vinculo (id, empresa_id, escopo_tipo, escopo_id, classificacao_id, nome, criado_em)
    SELECT id, empresa_id, 'evento', evento_id, classificacao_id, nome, criado_em FROM tmkt_evento_classificacao
    WHERE NOT EXISTS (SELECT 1 FROM tmkt_crm_vinculo v WHERE v.id = tmkt_evento_classificacao.id)`); } catch (e) {}
}
if (has('tmkt_evento_outreach')) {
  try { db.exec(`INSERT INTO tmkt_crm_outreach (id, empresa_id, escopo_tipo, escopo_id, ativo, dias_antes, recorrente, assunto, mensagem, criado_em, atualizado_em)
    SELECT id, empresa_id, 'evento', evento_id, ativo, dias_antes, recorrente, assunto, mensagem, criado_em, atualizado_em FROM tmkt_evento_outreach
    WHERE NOT EXISTS (SELECT 1 FROM tmkt_crm_outreach o WHERE o.id = tmkt_evento_outreach.id)`); } catch (e) {}
}

console.log('✅ migration 294: CRM genérico (tmkt_crm_vinculo + tmkt_crm_outreach + log escopo) com migração do evento');
