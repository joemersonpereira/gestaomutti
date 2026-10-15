// 141 — Baixa (pagamento) das cobranças de quebra de caixa: liga a cobrança ao Financeiro como
// um "débito do operador" que pode ser quitado. Colunas pago/pago_em/pago_por em caixa_cobrancas.
const db = require('../connection');
const cols = db.prepare(`PRAGMA table_info(caixa_cobrancas)`).all().map(c => c.name);
if (!cols.includes('pago')) db.exec(`ALTER TABLE caixa_cobrancas ADD COLUMN pago INTEGER DEFAULT 0`);
if (!cols.includes('pago_em')) db.exec(`ALTER TABLE caixa_cobrancas ADD COLUMN pago_em TEXT`);
if (!cols.includes('pago_por')) db.exec(`ALTER TABLE caixa_cobrancas ADD COLUMN pago_por TEXT`);
console.log('✅ migration 141: caixa_cobrancas.pago/pago_em/pago_por');
