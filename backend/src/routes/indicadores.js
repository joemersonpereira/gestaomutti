const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');

router.use(auth);
// Cadastro de indicadores é nível gestão/configuração
const PODE = ['Diretor Geral', 'Gestor Geral', 'Suporte'];

// Gera uma chave (slug) a partir do rótulo, única por função
function slug(texto) {
  return (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'criterio';
}

// Divide 100 pontos igualmente entre os critérios ativos (sempre soma 100)
function rebalancear(empresaId, funcaoId) {
  const ativos = db.prepare(`SELECT id FROM config_indicadores WHERE empresa_id=? AND funcao_id=? AND ativo=1 ORDER BY ordem, rowid`).all(empresaId, funcaoId);
  const n = ativos.length;
  if (!n) return;
  const base = Math.floor(100 / n);
  const resto = 100 - base * n; // distribui +1 aos primeiros 'resto'
  const upd = db.prepare(`UPDATE config_indicadores SET peso=? WHERE id=?`);
  ativos.forEach((r, i) => upd.run(base + (i < resto ? 1 : 0), r.id));
}

function listar(empresaId, funcaoId) {
  return db.prepare(`SELECT id, indicador, label, peso, pct_aceitavel, ordem FROM config_indicadores
    WHERE empresa_id=? AND funcao_id=? AND ativo=1 ORDER BY ordem, rowid`).all(empresaId, funcaoId);
}

// GET /indicadores/:funcaoId — lista critérios da função
// Descobre de onde vem a NOTA de cada indicador (transparência da distribuição)
function fonteIndicador(empresaId, indicador) {
  const fontes = [];
  const chk = db.prepare(`SELECT 1 FROM checklist_secao WHERE empresa_id=? AND indicador_alvo=?
    UNION SELECT 1 FROM checklist_def WHERE empresa_id=? AND modo='inteiro' AND indicador_alvo=?`).get(empresaId, indicador, empresaId, indicador);
  if (chk) fontes.push('Checklist');
  const oc = db.prepare(`SELECT 1 FROM ocorrencia_motivos WHERE empresa_id=? AND (indicador_alvo=? OR indicador_gerente=?)`).get(empresaId, indicador, indicador);
  if (oc) fontes.push('Ocorrências');
  if (indicador === 'atendimento') fontes.push('Avaliação de atendimento');
  if (['meta_vendas', 'vitaminas', 'pbm', 'generico', 'vendas'].includes(indicador)) fontes.push('Vendas');
  if (indicador === 'caixa') fontes.push('Tesouraria (caixa)');
  if (!fontes.length) fontes.push('Avaliação manual (checklist do gerente)');
  return fontes.join(' + ');
}

router.get('/:funcaoId', (req, res) => {
  const criterios = listar(req.usuario.empresa_id, req.params.funcaoId)
    .map(c => ({ ...c, fonte: fonteIndicador(req.usuario.empresa_id, c.indicador) }));
  res.json({ funcao: req.params.funcaoId, criterios, total: criterios.reduce((a, c) => a + c.peso, 0) });
});

// POST /indicadores/:funcaoId — adiciona critério { label, pct_aceitavel }
router.post('/:funcaoId', exigePerfil(...PODE), (req, res) => {
  const { label } = req.body;
  const pct = Number(req.body.pct_aceitavel);
  if (!label || !label.trim()) return res.status(400).json({ erro: 'Informe o nome do critério.' });
  const empresaId = req.usuario.empresa_id, funcaoId = req.params.funcaoId;

  // chave única dentro da função
  let base = slug(label), ind = base, i = 1;
  const existe = k => db.prepare(`SELECT 1 FROM config_indicadores WHERE empresa_id=? AND funcao_id=? AND indicador=?`).get(empresaId, funcaoId, k);
  while (existe(ind)) ind = `${base}_${++i}`;

  const ordem = (db.prepare(`SELECT COALESCE(MAX(ordem),0) m FROM config_indicadores WHERE empresa_id=? AND funcao_id=?`).get(empresaId, funcaoId).m) + 1;
  db.prepare(`INSERT INTO config_indicadores (id,empresa_id,funcao_id,indicador,label,peso,pct_aceitavel,ordem,ativo)
    VALUES (?,?,?,?,?,0,?,?,1)`).run(uuidv4(), empresaId, funcaoId, ind, label.trim(), isNaN(pct) ? 80 : pct, ordem);

  rebalancear(empresaId, funcaoId); // 100 ÷ nº de critérios
  res.status(201).json({ mensagem: 'Critério adicionado.', criterios: listar(empresaId, funcaoId) });
});

// PATCH /indicadores/:funcaoId/:id — edita rótulo e/ou % aceitável
router.patch('/:funcaoId/:id', exigePerfil(...PODE), (req, res) => {
  const { label, pct_aceitavel } = req.body;
  const row = db.prepare(`SELECT * FROM config_indicadores WHERE id=? AND empresa_id=? AND funcao_id=?`)
    .get(req.params.id, req.usuario.empresa_id, req.params.funcaoId);
  if (!row) return res.status(404).json({ erro: 'Critério não encontrado.' });
  db.prepare(`UPDATE config_indicadores SET label=?, pct_aceitavel=? WHERE id=?`)
    .run(label && label.trim() ? label.trim() : row.label, pct_aceitavel != null && pct_aceitavel !== '' ? Number(pct_aceitavel) : row.pct_aceitavel, row.id);
  res.json({ mensagem: 'Critério atualizado.', criterios: listar(req.usuario.empresa_id, req.params.funcaoId) });
});

// DELETE /indicadores/:funcaoId/:id — remove (desativa) e rebalanceia
router.delete('/:funcaoId/:id', exigePerfil(...PODE), (req, res) => {
  const row = db.prepare(`SELECT * FROM config_indicadores WHERE id=? AND empresa_id=? AND funcao_id=? AND ativo=1`)
    .get(req.params.id, req.usuario.empresa_id, req.params.funcaoId);
  if (!row) return res.status(404).json({ erro: 'Critério não encontrado.' });
  db.prepare(`UPDATE config_indicadores SET ativo=0 WHERE id=?`).run(row.id);
  rebalancear(req.usuario.empresa_id, req.params.funcaoId);
  res.json({ mensagem: 'Critério removido.', criterios: listar(req.usuario.empresa_id, req.params.funcaoId) });
});

module.exports = router;
module.exports.rebalancear = rebalancear;
module.exports.slug = slug;
