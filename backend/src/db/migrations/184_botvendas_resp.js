// 184_botvendas_resp.js — tempo de PRIMEIRA RESPOSTA do atendente (segundos), calculado das mensagens.
const db = require('../connection');
const cols = db.prepare("PRAGMA table_info(botvendas_atendimentos)").all().map(c => c.name);
if (!cols.includes('resp_seconds')) db.exec("ALTER TABLE botvendas_atendimentos ADD COLUMN resp_seconds INTEGER");
console.log('✅ migration 184: botvendas_atendimentos.resp_seconds');
