// 128 — falta precisa de confirmação do gerente antes de penalizar (evita punir folga não registrada).
const db = require('../connection');
if (!db.prepare("PRAGMA table_info(ponto_pendencias)").all().some(x => x.name === 'confirmada'))
  db.exec("ALTER TABLE ponto_pendencias ADD COLUMN confirmada INTEGER DEFAULT 0");
console.log('✅ migration 128: ponto_pendencias.confirmada');
