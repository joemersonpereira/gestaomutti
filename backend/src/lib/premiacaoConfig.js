// lib/premiacaoConfig.js — percentuais de premiação configuráveis por empresa.
// Antes eram fixos no código (fonte). Agora vêm da tabela `configuracoes` (JSON), com
// fallback para os valores históricos, para não mudar o comportamento de quem não editou.
const db = require('../db/connection');

// Vendedor: % sobre as vendas conforme a meta. Regra: <100% da meta → parcial;
// bateu a super meta E indicadores ≥ limiar → super; senão → meta.
const VEND_DEF = { parcial: 3, meta: 4, sup: 5, limiar: 95 };
// Gerente: % conforme a nota geral dos pilares (faixa min→pct, ordem decrescente).
const GER_DEF = [{ min: 95, pct: 10 }, { min: 90, pct: 8 }, { min: 80, pct: 5 }, { min: 70, pct: 3 }, { min: 0, pct: 0 }];

function lerJson(emp, chave, def) {
  const r = db.prepare('SELECT valor FROM configuracoes WHERE empresa_id=? AND chave=?').get(emp, chave);
  if (!r) return def;
  try { const v = JSON.parse(r.valor); return v ?? def; } catch { return def; }
}
function gravarJson(emp, chave, valor) {
  db.prepare(`INSERT INTO configuracoes (empresa_id, chave, valor) VALUES (?,?,?)
    ON CONFLICT(empresa_id, chave) DO UPDATE SET valor=excluded.valor`).run(emp, chave, JSON.stringify(valor));
}

function getVendedor(emp) { return { ...VEND_DEF, ...lerJson(emp, 'premiacao_vend', {}) }; }
function setVendedor(emp, cfg) {
  const v = {
    parcial: Number(cfg.parcial) || 0, meta: Number(cfg.meta) || 0,
    sup: Number(cfg.sup) || 0, limiar: Math.max(0, Math.min(100, Number(cfg.limiar) || VEND_DEF.limiar)),
  };
  gravarJson(emp, 'premiacao_vend', v); return v;
}

function getGerente(emp) {
  const f = lerJson(emp, 'premiacao_ger', GER_DEF);
  return Array.isArray(f) && f.length ? f : GER_DEF;
}
function setGerente(emp, faixas) {
  const limpa = (Array.isArray(faixas) ? faixas : [])
    .map(x => ({ min: Number(x.min) || 0, pct: Number(x.pct) || 0 }))
    .sort((a, b) => b.min - a.min);
  const v = limpa.length ? limpa : GER_DEF;
  gravarJson(emp, 'premiacao_ger', v); return v;
}

module.exports = { VEND_DEF, GER_DEF, getVendedor, setVendedor, getGerente, setGerente };
