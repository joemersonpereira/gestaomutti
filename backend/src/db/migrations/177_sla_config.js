// 177_sla_config.js — SLA (prazo em horas) por TIPO de tarefa (origem), configurável.
// Tira os prazos "chumbados" no código: a tarefa gerada usa o SLA cadastrado; origem '_padrao' = default geral.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS sla_config (
  empresa_id  TEXT,
  origem      TEXT,
  horas       INTEGER,
  rotulo      TEXT,
  atualizado_em TEXT,
  PRIMARY KEY (empresa_id, origem)
)`);
// Semente do padrão geral (48h) por empresa, se ainda não houver nenhum SLA cadastrado.
const empresas = db.prepare('SELECT id FROM empresas').all();
const ins = db.prepare("INSERT OR IGNORE INTO sla_config (empresa_id, origem, horas, rotulo, atualizado_em) VALUES (?, '_padrao', 48, 'Padrão (todas as tarefas)', datetime('now'))");
empresas.forEach(e => ins.run(e.id));
console.log(`✅ migration 177: sla_config criada; padrão semeado p/ ${empresas.length} empresa(s)`);
