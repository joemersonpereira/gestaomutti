// 149 — Expectativas por setor: o que a direção espera do chefe/equipe daquele setor.
// Texto editável (uma expectativa por linha), mostrado na "sala de cobrança" do Painel da Gestão.
const db = require('../connection');
try { db.exec('ALTER TABLE setor_config ADD COLUMN expectativas TEXT'); console.log('✅ migration 149: setor_config.expectativas'); }
catch (e) { console.log('migration 149: coluna já existe (' + e.message + ')'); }
