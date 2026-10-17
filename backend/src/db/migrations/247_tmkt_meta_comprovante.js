// 247_tmkt_meta_comprovante.js — Trade: META DE COMPRA (contrapartida) + comprovante de quitação.
// Meta: o trade pode estar atrelado a um valor de COMPRA do fornecedor (ex.: comprar R$100.000 de
// um produto/grupo/laboratório/fornecedor/classificação) — medido pelas ENTRADAS do Alpha 7.
// Comprovante: o fornecedor anexa o comprovante do pagamento que fez, por parcela. Idempotente.
const db = require('../connection');
const add = (t, c, d) => { try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } };

add('tmkt_vendas', 'meta_compra_valor', 'REAL');
add('tmkt_vendas', 'meta_escopo_tipo', 'TEXT');   // produto | grupo | laboratorio | fornecedor | classificacao
add('tmkt_vendas', 'meta_escopo_ref', 'TEXT');    // JSON [{id,nome,ean?}]
add('tmkt_vendas', 'meta_periodo_ini', 'TEXT');
add('tmkt_vendas', 'meta_periodo_fim', 'TEXT');

add('tmkt_parcelas', 'comprovante_foto', 'TEXT');
add('tmkt_parcelas', 'comprovante_mime', 'TEXT');
add('tmkt_parcelas', 'comprovante_em', 'TEXT');

// espaço é POR LOJA: o fornecedor pode comprar N unidades do mesmo espaço numa loja
// (ex.: 2 cestões na loja X + 1 na loja Y). Quantidade por item do pedido.
add('tmkt_venda_espacos', 'quantidade', 'INTEGER DEFAULT 1');
console.log('✅ migration 247: tmkt meta de compra + comprovante + quantidade por loja');
