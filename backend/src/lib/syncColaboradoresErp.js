// syncColaboradoresErp.js — varredura: mantém ativo no app só quem está ativo no Alpha 7.
// Vínculo por CPF (usuario→pessoa.cpf = colaboradores.cpf, só dígitos). O ERP (usuario.status A/I)
// é a verdade. Só mexe em quem TEM vínculo no ERP e está INATIVO lá — quem não tem usuário no ERP
// (ex.: escritório sem login no PDV) é deixado como está. SEMPRE tem prévia antes de aplicar.
const db = require('../db/connection');
const { erpQuery } = require('../db/erp');
const { randomUUID } = require('crypto');

const dig = s => String(s || '').replace(/\D/g, '');

// Mapa cpf(dígitos) → tem algum usuário ATIVO no ERP?
async function mapaErp() {
  const rows = await erpQuery(`SELECT pf.cpf, u.status FROM usuario u JOIN pessoa pf ON pf.id=u.pessoaid WHERE pf.cpf IS NOT NULL AND pf.cpf<>''`);
  const m = {};
  rows.forEach(r => { const c = dig(r.cpf); if (!c) return; m[c] = (m[c] || false) || (r.status === 'A'); });
  return m;
}

// Conjunto de CPFs (dígitos) que estão no grupo "ESTAGIO" (ou similar) no ERP → são estagiários.
async function cpfsEstagio() {
  const rows = await erpQuery(`SELECT DISTINCT regexp_replace(pf.cpf,'[^0-9]','','g') cpf
    FROM usuarioparticipantegrupousuario upg
    JOIN grupousuario g ON g.id = upg.grupousuarioid
    JOIN usuario u ON u.id = upg.usuarioid
    JOIN pessoa pf ON pf.id = u.pessoaid
    WHERE UPPER(g.nome) LIKE '%ESTAGI%' AND pf.cpf IS NOT NULL AND pf.cpf <> ''`);
  return new Set(rows.map(r => r.cpf).filter(Boolean));
}

// Cria a ficha de estágio do colaborador (igual ao syncEstagiario da rota), se ainda não tiver.
function criarFichaEstagio(empresaId, colab) {
  const ja = db.prepare('SELECT id FROM estagio_ficha WHERE colaborador_id=?').get(colab.id);
  if (ja) return;
  db.prepare(`INSERT INTO estagio_ficha (id,empresa_id,nome,cpf,loja,status,origem,colaborador_id,criado_em,atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
    .run(randomUUID(), empresaId, colab.nome, colab.cpf || '', colab.loja_id, 'ativo', 'alpha-estagio', colab.id);
}

async function prever(empresaId) {
  const m = await mapaErp();
  let estagio = new Set(); try { estagio = await cpfsEstagio(); } catch (e) { /* grupo indisponível: segue sem marcar */ }
  const colabs = db.prepare(`SELECT id, nome, cpf, ativo, is_estagiario, loja_id FROM colaboradores WHERE empresa_id=?`).all(empresaId);
  const aDesativar = [], aReativar = [], semVinculo = [], aMarcarEstagio = [];
  let matchAtivo = 0, matchInativo = 0;
  colabs.forEach(c => {
    const cp = dig(c.cpf);
    if (cp && estagio.has(cp) && !c.is_estagiario) aMarcarEstagio.push({ id: c.id, nome: c.nome, cpf: c.cpf });
    if (cp && cp in m) {
      if (m[cp]) { matchAtivo++; if (!c.ativo) aReativar.push({ id: c.id, nome: c.nome, cpf: c.cpf }); }
      else { matchInativo++; if (c.ativo) aDesativar.push({ id: c.id, nome: c.nome, cpf: c.cpf }); }
    } else semVinculo.push({ id: c.id, nome: c.nome, cpf: c.cpf });
  });
  return { total: colabs.length, matchAtivo, matchInativo, aDesativar, aReativar, semVinculo: semVinculo.length, semVinculoLista: semVinculo, aMarcarEstagio };
}

// Aplica: desativa os inativos-no-ERP. reativar=true também reativa os que voltaram a ser ativos no ERP.
// Sempre marca como estagiário (is_estagiario=1 + cria ficha) quem está no grupo "ESTAGIO" do ERP.
async function aplicar(empresaId, { reativar = false } = {}) {
  const p = await prever(empresaId);
  const upd = db.prepare(`UPDATE colaboradores SET ativo=? WHERE id=? AND empresa_id=?`);
  const marcarEst = db.prepare(`UPDATE colaboradores SET is_estagiario=1 WHERE id=? AND empresa_id=?`);
  const colabById = {}; db.prepare(`SELECT id, nome, cpf, loja_id FROM colaboradores WHERE empresa_id=?`).all(empresaId).forEach(c => { colabById[c.id] = c; });
  const tx = db.transaction(() => {
    p.aDesativar.forEach(c => upd.run(0, c.id, empresaId));
    if (reativar) p.aReativar.forEach(c => upd.run(1, c.id, empresaId));
    p.aMarcarEstagio.forEach(c => { marcarEst.run(c.id, empresaId); if (colabById[c.id]) criarFichaEstagio(empresaId, colabById[c.id]); });
  });
  tx();
  return { desativados: p.aDesativar.length, reativados: reativar ? p.aReativar.length : 0, marcadosEstagio: p.aMarcarEstagio.length, aDesativar: p.aDesativar, aReativar: reativar ? p.aReativar : [], aMarcarEstagio: p.aMarcarEstagio };
}

module.exports = { prever, aplicar, cpfsEstagio };
