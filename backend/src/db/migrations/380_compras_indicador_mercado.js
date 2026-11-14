// 380 — Referência de MERCADO editável por indicador do Meu Setor de Compras (Joe 2026-11-13).
// A referência de mercado (ex.: "CMV ~68–72% em drogaria independente") vinha fixa no código; agora
// o diretor/gestão pode editar e fica salva. Sem valor salvo, cai na referência padrão do catálogo.
//
// ── Caminho técnico v2.0 (Postgres) ──
// ALTER TABLE compras_meusetor_indicador ADD COLUMN mercado text;
const db = require('../connection');
console.log('▶ Migração 380 — compras_meusetor_indicador.mercado (referência de mercado editável)');
const cols = db.prepare("SELECT name FROM pragma_table_info('compras_meusetor_indicador')").all().map(c => c.name);
if (!cols.includes('mercado')) db.exec('ALTER TABLE compras_meusetor_indicador ADD COLUMN mercado TEXT');
console.log('✓ Migração 380 concluída');
