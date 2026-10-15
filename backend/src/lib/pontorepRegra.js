// pontorepRegra.js — Regras de Ponto (N regras nomeadas, uma padrão, colaboradores por vigência).
const db = require('../db/connection');
const { v4: uuid } = require('uuid');
const addDias = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const J = (v, def) => { try { return v ? JSON.parse(v) : def; } catch { return def; } };

function listarRegras(emp) {
  return db.prepare(`SELECT r.*,
    (SELECT COUNT(*) FROM pontorep_regra_colaborador rc WHERE rc.regra_id=r.id AND rc.vigencia_fim IS NULL) colaboradores
    FROM pontorep_regra r WHERE r.empresa_id=? AND r.ativo=1 ORDER BY r.padrao DESC, r.nome`).all(emp)
    .map(r => ({ ...r, he: J(r.he_json, {}), banco: J(r.banco_json, {}) }));
}
function getRegra(emp, id) {
  const r = db.prepare(`SELECT * FROM pontorep_regra WHERE id=? AND empresa_id=?`).get(id, emp);
  if (!r) return null;
  return { ...r, he: J(r.he_json, {}), banco: J(r.banco_json, {}) };
}
function salvarRegra(emp, b, usuario) {
  if (!b.nome) return { erro: 'Informe o nome da regra.' };
  const he = JSON.stringify(b.he || {});
  const banco = JSON.stringify(b.banco || {});
  const id = b.id || uuid();
  const tx = db.transaction(() => {
    if (b.padrao) db.prepare(`UPDATE pontorep_regra SET padrao=0 WHERE empresa_id=?`).run(emp); // só uma padrão
    if (b.id) {
      db.prepare(`UPDATE pontorep_regra SET nome=?,descricao=?,padrao=?,tipo_controle=?,controle_atraso=?,tolerancia_min=?,dia_fechamento=?,
        codigo_externo=?,noturno_ini=?,noturno_fim=?,noturno_tipo=?,noturno_estendida=?,he_json=?,banco_json=?,atualizado_em=datetime('now')
        WHERE id=? AND empresa_id=?`).run(b.nome, b.descricao || null, b.padrao ? 1 : 0, b.tipo_controle || 'banco', b.controle_atraso || 'flexivel',
          Number(b.tolerancia_min) || 0, Number(b.dia_fechamento) || 25, b.codigo_externo || null, b.noturno_ini || '22:00', b.noturno_fim || '05:00',
          b.noturno_tipo || 'padrao', b.noturno_estendida ? 1 : 0, he, banco, b.id, emp);
    } else {
      db.prepare(`INSERT INTO pontorep_regra (id,empresa_id,nome,descricao,padrao,tipo_controle,controle_atraso,tolerancia_min,dia_fechamento,
        codigo_externo,noturno_ini,noturno_fim,noturno_tipo,noturno_estendida,he_json,banco_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, emp, b.nome, b.descricao || null, b.padrao ? 1 : 0, b.tipo_controle || 'banco',
          b.controle_atraso || 'flexivel', Number(b.tolerancia_min) || 0, Number(b.dia_fechamento) || 25, b.codigo_externo || null,
          b.noturno_ini || '22:00', b.noturno_fim || '05:00', b.noturno_tipo || 'padrao', b.noturno_estendida ? 1 : 0, he, banco);
    }
  });
  tx();
  return { ok: true, id };
}
function removerRegra(emp, id) {
  const r = db.prepare(`SELECT padrao FROM pontorep_regra WHERE id=? AND empresa_id=?`).get(id, emp);
  if (r && r.padrao) return { erro: 'Não é possível remover a regra padrão. Marque outra como padrão antes.' };
  db.prepare(`UPDATE pontorep_regra SET ativo=0 WHERE id=? AND empresa_id=?`).run(id, emp);
  return { ok: true };
}
function setPadrao(emp, id) {
  const tx = db.transaction(() => {
    db.prepare(`UPDATE pontorep_regra SET padrao=0 WHERE empresa_id=?`).run(emp);
    db.prepare(`UPDATE pontorep_regra SET padrao=1 WHERE id=? AND empresa_id=?`).run(id, emp);
  });
  tx();
  return { ok: true };
}

// colaboradores da regra (vigentes + histórico)
function colaboradoresDaRegra(emp, regraId) {
  return db.prepare(`SELECT rc.*, c.nome colaborador_nome FROM pontorep_regra_colaborador rc
    LEFT JOIN colaboradores c ON c.id=rc.colaborador_id WHERE rc.empresa_id=? AND rc.regra_id=? ORDER BY (rc.vigencia_fim IS NOT NULL), c.nome`).all(emp, regraId);
}
// adiciona VÁRIOS colaboradores de uma vez, com vigência (fecha a regra anterior de cada um)
function adicionarColaboradores(emp, regraId, { colaboradorIds, vigenciaIni }) {
  const ids = Array.isArray(colaboradorIds) ? colaboradorIds.filter(Boolean) : [];
  if (!ids.length) return { erro: 'Selecione ao menos um colaborador.' };
  if (!vigenciaIni) return { erro: 'Informe a vigência.' };
  const fimAnterior = addDias(vigenciaIni, -1);
  const tx = db.transaction(() => {
    for (const cid of ids) {
      // fecha qualquer regra vigente do colaborador (ele passa a ter só a nova)
      db.prepare(`UPDATE pontorep_regra_colaborador SET vigencia_fim=? WHERE empresa_id=? AND colaborador_id=? AND vigencia_fim IS NULL AND vigencia_ini<=?`)
        .run(fimAnterior, emp, cid, fimAnterior);
      // evita duplicar o mesmo vínculo vigente
      const ja = db.prepare(`SELECT 1 FROM pontorep_regra_colaborador WHERE empresa_id=? AND regra_id=? AND colaborador_id=? AND vigencia_fim IS NULL`).get(emp, regraId, cid);
      if (!ja) db.prepare(`INSERT INTO pontorep_regra_colaborador (id,empresa_id,regra_id,colaborador_id,vigencia_ini) VALUES (?,?,?,?,?)`).run(uuid(), emp, regraId, cid, vigenciaIni);
    }
  });
  tx();
  return { ok: true, adicionados: ids.length };
}
function removerColaboradorRegra(emp, linkId) {
  db.prepare(`DELETE FROM pontorep_regra_colaborador WHERE id=? AND empresa_id=?`).run(linkId, emp);
  return { ok: true };
}
// regra vigente de um colaborador numa data (para a apuração usar os parâmetros certos no futuro)
function regraVigenteColab(emp, colabId, data) {
  const rc = db.prepare(`SELECT regra_id FROM pontorep_regra_colaborador WHERE empresa_id=? AND colaborador_id=? AND vigencia_ini<=?
    AND (vigencia_fim IS NULL OR vigencia_fim>=?) ORDER BY vigencia_ini DESC LIMIT 1`).get(emp, colabId, data, data);
  if (!rc) return db.prepare(`SELECT * FROM pontorep_regra WHERE empresa_id=? AND padrao=1 AND ativo=1 LIMIT 1`).get(emp) || null;
  return getRegra(emp, rc.regra_id);
}

module.exports = { listarRegras, getRegra, salvarRegra, removerRegra, setPadrao, colaboradoresDaRegra, adicionarColaboradores, removerColaboradorRegra, regraVigenteColab };
