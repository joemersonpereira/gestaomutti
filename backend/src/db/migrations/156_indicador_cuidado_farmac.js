// 156 — Indicador automático "Cuidado farmacêutico" (nº de atendimentos do mês vs meta)
// para a função Farmacêutico. Semeia com peso 0 para NÃO mexer nos pesos já ajustados;
// o gestor define o peso na tela "Indicadores por função" (soma 100) e a meta no módulo.
const db = require('../connection');
const { v4: uuidv4 } = require('uuid');

const IND = 'cuidado_farmac';
const LABEL = 'Cuidado farmacêutico (atendimentos)';

const funcoes = db.prepare(`SELECT id, empresa_id FROM funcoes WHERE id='func-farmaceutico'`).all();
let add = 0;
for (const f of funcoes) {
  const existe = db.prepare(`SELECT 1 FROM config_indicadores WHERE empresa_id=? AND funcao_id=? AND indicador=?`).get(f.empresa_id, f.id, IND);
  if (existe) continue;
  const ordem = (db.prepare(`SELECT COALESCE(MAX(ordem),0) m FROM config_indicadores WHERE empresa_id=? AND funcao_id=?`).get(f.empresa_id, f.id).m) + 1;
  db.prepare(`INSERT INTO config_indicadores (id,empresa_id,funcao_id,indicador,label,peso,pct_aceitavel,ordem,ativo)
    VALUES (?,?,?,?,?,0,80,?,1)`).run(uuidv4(), f.empresa_id, f.id, IND, LABEL, ordem);
  add++;
}
console.log(`✅ migration 156: indicador "${IND}" semeado no Farmacêutico (${add} função/ões; peso 0 — ajuste na tela de indicadores).`);
