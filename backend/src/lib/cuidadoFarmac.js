// lib/cuidadoFarmac.js — indicador automático do farmacêutico a partir do módulo
// Cuidado Farmacêutico: nº de atendimentos do mês vs uma meta mensal configurável.
const db = require('../db/connection');

const CHAVE_META = 'farmac_meta_atendimentos';
const META_PADRAO = 40; // atendimentos/mês para nota 100 (ajustável em Parâmetros do módulo)

function metaAtendimentos(empresaId) {
  const row = db.prepare(`SELECT valor FROM configuracoes WHERE empresa_id=? AND chave=?`).get(empresaId, CHAVE_META);
  const n = row ? parseInt(row.valor, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : META_PADRAO;
}

function setMetaAtendimentos(empresaId, n) {
  const v = Math.max(1, parseInt(n, 10) || META_PADRAO);
  db.prepare(`INSERT INTO configuracoes (empresa_id, chave, valor) VALUES (?,?,?)
    ON CONFLICT(empresa_id, chave) DO UPDATE SET valor=excluded.valor`).run(empresaId, CHAVE_META, String(v));
  return v;
}

// Quantos atendimentos o profissional registrou no mês (independe de tipo).
function atendimentosDoMes(colaboradorId, mes, ano) {
  return db.prepare(`SELECT COUNT(*) c FROM servicos_farmaceuticos
    WHERE colaborador_id=? AND CAST(strftime('%m', data) AS INTEGER)=? AND CAST(strftime('%Y', data) AS INTEGER)=?`)
    .get(colaboradorId, mes, ano).c;
}

// Nota 0..100 do indicador (proporcional à meta, teto 100). null = não pontua.
function notaCuidado(empresaId, colaboradorId, mes, ano) {
  const feitos = atendimentosDoMes(colaboradorId, mes, ano);
  const meta = metaAtendimentos(empresaId);
  if (!meta) return null;
  return { feitos, meta, nota: Math.min(100, Math.round((feitos / meta) * 100)) };
}

module.exports = { CHAVE_META, META_PADRAO, metaAtendimentos, setMetaAtendimentos, atendimentosDoMes, notaCuidado };
