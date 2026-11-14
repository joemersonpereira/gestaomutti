// 376 — Meu Setor de Compras passa a funcionar por PILARES (igual Tesouraria) — Joe 2026-11-12.
// Até 5 pilares; cada indicador é alocado num pilar. Nota do pilar = Σpeso batido ÷ Σpeso ativo × 100.
// Prêmio do pilar = nota × teto/100; bater 100% paga teto + bônus (padrão +50%). Premiação do comprador = Σ pilares.
//
// ── Caminho técnico v2.0 (Postgres) ──
// ALTER TABLE compras_meusetor_indicador ADD COLUMN pilar text;
// CREATE TABLE compras_pilar (empresa_id text, pilar text, teto numeric DEFAULT 100, ordem int DEFAULT 0, ativo int DEFAULT 1, PRIMARY KEY(empresa_id,pilar));
// CREATE TABLE compras_premio_config (empresa_id text PRIMARY KEY, bonus_pct numeric DEFAULT 50);
const db = require('../connection');
console.log('▶ Migração 376 — Compras por pilares (indicador.pilar + compras_pilar + premio_config)');
const cols = db.prepare("PRAGMA table_info(compras_meusetor_indicador)").all().map(c => c.name);
if (!cols.includes('pilar')) db.exec("ALTER TABLE compras_meusetor_indicador ADD COLUMN pilar TEXT");
db.exec(`CREATE TABLE IF NOT EXISTS compras_pilar (
  empresa_id TEXT NOT NULL, pilar TEXT NOT NULL, teto REAL DEFAULT 100, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
  PRIMARY KEY (empresa_id, pilar))`);
db.exec(`CREATE TABLE IF NOT EXISTS compras_premio_config (empresa_id TEXT PRIMARY KEY, bonus_pct REAL DEFAULT 50)`);
console.log('✓ Migração 376 concluída (pilares do Compras)');
