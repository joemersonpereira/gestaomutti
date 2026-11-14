// 312_ecomm_conversao_categoria.js — Giro de CATEGORIA ("Giro 15% OFF · CONDICIONADOR E SHAMPOO
// ADULTO"): cadastro que liga o rótulo do cupom às classificações do A7, e lista de todos os itens
// do cupom que confirmaram a venda (soma de vários itens). Idempotente.
const db = require('../connection');
const EMP = 'empresa-mutti-001';

db.exec(`CREATE TABLE IF NOT EXISTS ecomm_conversao_categoria (
  empresa_id        TEXT NOT NULL,
  rotulo            TEXT NOT NULL,   -- texto do cupom depois do "·", em maiúsculas sem acento
  classificacao_ids TEXT NOT NULL,   -- ids de classificacao do A7 separados por vírgula (subárvore conta)
  descricao         TEXT,
  PRIMARY KEY (empresa_id, rotulo)
)`);
try { db.exec(`ALTER TABLE ecomm_conversao_log ADD COLUMN erp_itens TEXT`); } catch (e) { /* já existe */ }

// 94675 = PRINCIPAL > PERFUMARIA > CONDICIONADOR ADULTO · 94679 = PRINCIPAL > PERFUMARIA > SHAMPOO ADULTO
db.prepare(`INSERT OR IGNORE INTO ecomm_conversao_categoria (empresa_id, rotulo, classificacao_ids, descricao) VALUES (?,?,?,?)`)
  .run(EMP, 'CONDICIONADOR E SHAMPOO ADULTO', '94675,94679', 'Perfumaria > Condicionador Adulto + Shampoo Adulto');

console.log('✅ migration 312: ecomm_conversao_categoria (', db.prepare('SELECT COUNT(*) n FROM ecomm_conversao_categoria').get().n, 'rótulo(s)) + ecomm_conversao_log.erp_itens');
