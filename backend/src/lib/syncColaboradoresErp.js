// syncColaboradoresErp.js — varredura: mantém ativo no app só quem está ativo no Alpha 7.
// Vínculo por CPF (usuario→pessoa.cpf = colaboradores.cpf, só dígitos). O ERP (usuario.status A/I)
// é a verdade. Só mexe em quem TEM vínculo no ERP e está INATIVO lá — quem não tem usuário no ERP
// (ex.: escritório sem login no PDV) é deixado como está. SEMPRE tem prévia antes de aplicar.
const db = require('../db/connection');
const { erpQuery } = require('../db/erp');

const dig = s => String(s || '').replace(/\D/g, '');

// Mapa cpf(dígitos) → tem algum usuário ATIVO no ERP?
async function mapaErp() {
  const rows = await erpQuery(`SELECT pf.cpf, u.status FROM usuario u JOIN pessoa pf ON pf.id=u.pessoaid WHERE pf.cpf IS NOT NULL AND pf.cpf<>''`);
  const m = {};
  rows.forEach(r => { const c = dig(r.cpf); if (!c) return; m[c] = (m[c] || false) || (r.status === 'A'); });
  return m;
}

async function prever(empresaId) {
  const m = await mapaErp();
  const colabs = db.prepare(`SELECT id, nome, cpf, ativo FROM colaboradores WHERE empresa_id=?`).all(empresaId);
  const aDesativar = [], aReativar = [], semVinculo = [];
  let matchAtivo = 0, matchInativo = 0;
  colabs.forEach(c => {
    const cp = dig(c.cpf);
    if (cp && cp in m) {
      if (m[cp]) { matchAtivo++; if (!c.ativo) aReativar.push({ id: c.id, nome: c.nome, cpf: c.cpf }); }
      else { matchInativo++; if (c.ativo) aDesativar.push({ id: c.id, nome: c.nome, cpf: c.cpf }); }
    } else semVinculo.push({ id: c.id, nome: c.nome, cpf: c.cpf });
  });
  return { total: colabs.length, matchAtivo, matchInativo, aDesativar, aReativar, semVinculo: semVinculo.length, semVinculoLista: semVinculo };
}

// Aplica: desativa os inativos-no-ERP. reativar=true também reativa os que voltaram a ser ativos no ERP.
async function aplicar(empresaId, { reativar = false } = {}) {
  const p = await prever(empresaId);
  const upd = db.prepare(`UPDATE colaboradores SET ativo=? WHERE id=? AND empresa_id=?`);
  const tx = db.transaction(() => {
    p.aDesativar.forEach(c => upd.run(0, c.id, empresaId));
    if (reativar) p.aReativar.forEach(c => upd.run(1, c.id, empresaId));
  });
  tx();
  return { desativados: p.aDesativar.length, reativados: reativar ? p.aReativar.length : 0, aDesativar: p.aDesativar, aReativar: reativar ? p.aReativar : [] };
}

module.exports = { prever, aplicar };
