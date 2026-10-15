// 185_botvendas_logistica.js — marca registros de LOGÍSTICA/entrega (via Integração / Usuário da API /
// painel logístico) que NÃO são atendimento humano, p/ a monitoria escondê-los por padrão.
const db = require('../connection');
const cols = db.prepare("PRAGMA table_info(botvendas_atendimentos)").all().map(c => c.name);
if (!cols.includes('logistica')) db.exec("ALTER TABLE botvendas_atendimentos ADD COLUMN logistica INTEGER DEFAULT 0");
console.log('✅ migration 185: botvendas_atendimentos.logistica');
