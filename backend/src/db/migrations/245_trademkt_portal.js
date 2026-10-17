// 245_trademkt_portal.js — Trade Marketing: portal do fornecedor (catálogo público + pedido).
// Dá ao ESPAÇO: tamanho, tipo de prazo (mensal/semanal/trimestral/periodo) e flag de disponível.
// Dá à VENDA: origem (portal), token de acompanhamento, contato do fornecedor, escopo dos produtos
// da ação (por produto/classificação/laboratório/fornecedor/caderno) e a comprovação da ação montada.
// Idempotente.
const db = require('../connection');
const addCol = (tabela, col, ddl) => { try { db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${col} ${ddl}`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } };

// espaço (o que o fornecedor vê no catálogo)
addCol('tmkt_espaco_loja', 'tamanho', 'TEXT');                 // ex.: "1,20m x 0,80m" / "ponta de gôndola dupla"
addCol('tmkt_espaco_loja', 'prazo_tipo', "TEXT DEFAULT 'mensal'"); // mensal | semanal | trimestral | periodo
addCol('tmkt_espaco_loja', 'descricao', 'TEXT');
addCol('tmkt_espaco_loja', 'disponivel', 'INTEGER DEFAULT 1'); // aparece no catálogo público

// venda (o pedido do fornecedor)
addCol('tmkt_vendas', 'origem', "TEXT DEFAULT 'interno'");     // interno | portal
addCol('tmkt_vendas', 'token', 'TEXT');                        // acesso de acompanhamento do fornecedor
addCol('tmkt_vendas', 'contato_nome', 'TEXT');
addCol('tmkt_vendas', 'contato_email', 'TEXT');
addCol('tmkt_vendas', 'contato_fone', 'TEXT');
addCol('tmkt_vendas', 'fornecedor_cnpj', 'TEXT');
addCol('tmkt_vendas', 'escopo_tipo', 'TEXT');                  // produto | classificacao | laboratorio | fornecedor | caderno
addCol('tmkt_vendas', 'escopo_ref', 'TEXT');                   // JSON: [{id,nome}] do que foi escolhido
addCol('tmkt_vendas', 'comprovacao_prazo_dias', 'INTEGER');    // prazo p/ enviar a foto da ação montada
addCol('tmkt_vendas', 'comprovacao_ate', 'TEXT');              // data limite
addCol('tmkt_vendas', 'comprovacao_foto', 'TEXT');             // base64
addCol('tmkt_vendas', 'comprovacao_mime', 'TEXT');
addCol('tmkt_vendas', 'comprovacao_em', 'TEXT');
addCol('tmkt_parcelas', 'forma', 'TEXT');                      // deposito | abatimento | bonificacao (por parcela)

db.exec(`CREATE INDEX IF NOT EXISTS ix_tmkt_vendas_token ON tmkt_vendas (token)`);
console.log('✅ migration 245: trademkt_portal');
