// 290_tmkt_capa_pos_defaults.js — enquadramento inicial das capas que precisam (Esfriou mostra o nome
// no topo; Sorte em Dobro centraliza a placa do banner largo). Só preenche se ainda estiver vazio
// (não sobrescreve ajuste feito pelo enquadrador). Idempotente.
const db = require('../connection');
const EMP = 'empresa-mutti-001';
const set = (tema, pos) => {
  try { db.prepare("UPDATE tmkt_plano SET capa_pos=? WHERE empresa_id=? AND tema=? AND (capa_pos IS NULL OR capa_pos='')").run(pos, EMP, tema); }
  catch (e) { /* coluna capa_pos pode não existir em base muito antiga; 289 cria */ }
};
set('inverno', '50% 12%');  // Esfriou — mostra o nome no topo
set('natal', '40% 50%');    // Sorte em Dobro — centraliza a placa
console.log('✅ migration 290: capa_pos default (Esfriou/Sorte) se vazio');
