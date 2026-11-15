// acessos.js — controle configurável de quais funções veem quais menus/módulos.
// Guarda apenas OVERRIDES (desvios do padrão do código): mapa { funcao_nome: { modulo_id: true|false } }.
// true = libera mesmo que o padrão não deixe; false = bloqueia. Sem entrada = usa o padrão do código.
// TRAVAS DE SEGURANÇA: 'Diretor Geral' nunca é bloqueado; 'parametros'/'acessos' nunca são
// bloqueados para Diretor Geral e Gestor Geral (para ninguém se trancar fora da configuração).
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');

router.use(auth);

const CHAVE = 'acessos_modulos';
const NUNCA_BLOQUEIA_FUNCAO = ['Diretor Geral'];
const MODULOS_PROTEGIDOS = ['parametros', 'acessos']; // p/ Gestor Geral e Diretor Geral

function ler(empresaId) {
  const r = db.prepare('SELECT valor FROM configuracoes WHERE empresa_id=? AND chave=?').get(empresaId, CHAVE);
  if (!r) return {};
  try { return JSON.parse(r.valor) || {}; } catch { return {}; }
}
function gravar(empresaId, mapa) {
  db.prepare(`INSERT INTO configuracoes (empresa_id, chave, valor) VALUES (?,?,?)
    ON CONFLICT(empresa_id, chave) DO UPDATE SET valor=excluded.valor`).run(empresaId, CHAVE, JSON.stringify(mapa));
}
// Remove qualquer bloqueio que poderia trancar alguém fora — aplicado antes de salvar.
function sanear(mapa) {
  const out = {};
  for (const [funcao, mods] of Object.entries(mapa || {})) {
    if (NUNCA_BLOQUEIA_FUNCAO.includes(funcao)) continue; // Diretor Geral: sem overrides
    const limpo = {};
    for (const [mod, permitido] of Object.entries(mods || {})) {
      const bloqueio = permitido === false || permitido === 0;
      // não deixa bloquear a configuração para Gestor Geral
      if (bloqueio && funcao === 'Gestor Geral' && MODULOS_PROTEGIDOS.includes(mod)) continue;
      limpo[mod] = !!permitido;
    }
    if (Object.keys(limpo).length) out[funcao] = limpo;
  }
  return out;
}

// Overrides do usuário logado (o App aplica sobre o padrão): função ⊕ colaborador (a PESSOA vence).
function colabOverrides(colaboradorId) {
  const ov = {};
  try {
    db.prepare('SELECT modulo_id, permitido FROM colaborador_acessos WHERE colaborador_id=?').all(colaboradorId)
      .forEach(r => { ov[r.modulo_id] = !!r.permitido; });
  } catch { /* tabela pode não existir em bases antigas */ }
  return ov;
}
router.get('/meus', (req, res) => {
  const mapa = ler(req.usuario.empresa_id);
  const funcOv = mapa[req.usuario.funcao_nome] || {};
  const pessoaOv = colabOverrides(req.usuario.id);
  res.json({ funcao: req.usuario.funcao_nome, overrides: { ...funcOv, ...pessoaOv } });
});

// Acessos POR COLABORADOR (menus do escritório que a pessoa vê) — RH/gestão edita.
const PODE_COLAB = ['RH', 'Gestor Geral', 'Diretor Geral'];
router.get('/colaborador/:id', exigePerfil(...PODE_COLAB), (req, res) => {
  const emp = req.usuario.empresa_id;
  const colab = db.prepare(`SELECT c.id, c.nome, f.nome AS funcao, f.escritorio AS escritorio
    FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.id=? AND c.empresa_id=?`).get(req.params.id, emp);
  if (!colab) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  const rows = db.prepare('SELECT modulo_id, permitido FROM colaborador_acessos WHERE empresa_id=? AND colaborador_id=?').all(emp, req.params.id);
  const overrides = {}; rows.forEach(r => { overrides[r.modulo_id] = !!r.permitido; });
  const funcaoOverrides = ler(emp)[colab.funcao] || {}; // base da função (p/ a UI mostrar o padrão herdado)
  res.json({ colaborador: { id: colab.id, nome: colab.nome, funcao: colab.funcao, escritorio: !!colab.escritorio }, overrides, funcaoOverrides });
});
router.put('/colaborador/:id', exigePerfil(...PODE_COLAB), (req, res) => {
  const emp = req.usuario.empresa_id;
  const colab = db.prepare('SELECT id FROM colaboradores WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!colab) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  const mapa = req.body.overrides || {}; // { modulo_id: true | false | null(=padrão) }
  const del = db.prepare('DELETE FROM colaborador_acessos WHERE colaborador_id=? AND modulo_id=?');
  const up = db.prepare(`INSERT INTO colaborador_acessos (empresa_id, colaborador_id, modulo_id, permitido, atualizado_em)
    VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(colaborador_id, modulo_id) DO UPDATE SET permitido=excluded.permitido, atualizado_em=excluded.atualizado_em`);
  const tx = db.transaction(() => {
    for (const [mod, v] of Object.entries(mapa)) {
      if (v === true || v === false) up.run(emp, req.params.id, mod, v ? 1 : 0);
      else del.run(req.params.id, mod); // null/'padrao' = remove o desvio
    }
  });
  tx();
  const rows = db.prepare('SELECT modulo_id, permitido FROM colaborador_acessos WHERE empresa_id=? AND colaborador_id=?').all(emp, req.params.id);
  const overrides = {}; rows.forEach(r => { overrides[r.modulo_id] = !!r.permitido; });
  res.json({ mensagem: 'Acessos do colaborador salvos.', overrides });
});

// Replicar os acessos (de módulo) de UMA pessoa para outros colaboradores.
// body: { destinos: [id...], overrides?: { modulo_id: true|false|null } }
// Se `overrides` vier (config na tela), aplica ela; senão copia os acessos salvos da origem.
// Substitui por completo os acessos de cada destino (fica idêntico à origem).
router.post('/colaborador/:id/replicar', exigePerfil(...PODE_COLAB), (req, res) => {
  const emp = req.usuario.empresa_id;
  const origem = db.prepare('SELECT id FROM colaboradores WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!origem) return res.status(404).json({ erro: 'Colaborador de origem não encontrado.' });
  const destinos = Array.isArray(req.body.destinos) ? [...new Set(req.body.destinos.filter(d => d && d !== req.params.id))] : [];
  if (!destinos.length) return res.status(400).json({ erro: 'Selecione pelo menos um colaborador de destino.' });
  // Config a replicar: da tela (overrides) ou a salva da origem.
  let pares; // [ [modulo_id, 0|1] ... ]
  if (req.body.overrides && typeof req.body.overrides === 'object') {
    pares = Object.entries(req.body.overrides).filter(([, v]) => v === true || v === false).map(([m, v]) => [m, v ? 1 : 0]);
  } else {
    pares = db.prepare('SELECT modulo_id, permitido FROM colaborador_acessos WHERE empresa_id=? AND colaborador_id=?').all(emp, req.params.id).map(r => [r.modulo_id, r.permitido ? 1 : 0]);
  }
  const del = db.prepare('DELETE FROM colaborador_acessos WHERE empresa_id=? AND colaborador_id=?');
  const up = db.prepare(`INSERT INTO colaborador_acessos (empresa_id, colaborador_id, modulo_id, permitido, atualizado_em)
    VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(colaborador_id, modulo_id) DO UPDATE SET permitido=excluded.permitido, atualizado_em=excluded.atualizado_em`);
  let n = 0;
  const tx = db.transaction(() => {
    for (const dest of destinos) {
      const existe = db.prepare('SELECT id FROM colaboradores WHERE id=? AND empresa_id=?').get(dest, emp);
      if (!existe) continue;
      del.run(emp, dest);
      for (const [m, v] of pares) up.run(emp, dest, m, v);
      n++;
    }
  });
  tx();
  res.json({ mensagem: `Acessos replicados para ${n} colaborador(es).`, replicados: n, ajustes: pares.length });
});

// Configuração completa POR FUNÇÃO (só gestão máxima edita).
const PODE = ['Gestor Geral', 'Diretor Geral'];
router.get('/config', exigePerfil(...PODE), (req, res) => {
  const funcoes = db.prepare('SELECT nome FROM funcoes WHERE empresa_id=? AND ativa=1 ORDER BY nome').all(req.usuario.empresa_id).map(f => f.nome);
  res.json({ overrides: ler(req.usuario.empresa_id), funcoes, protegidos: MODULOS_PROTEGIDOS, sempreLiberado: NUNCA_BLOQUEIA_FUNCAO });
});
router.put('/config', exigePerfil(...PODE), (req, res) => {
  const mapa = sanear(req.body.overrides || {});
  gravar(req.usuario.empresa_id, mapa);
  res.json({ mensagem: 'Acessos salvos.', overrides: mapa });
});

module.exports = router;
module.exports.sanear = sanear; // exposto para teste
