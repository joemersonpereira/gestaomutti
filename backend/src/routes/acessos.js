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

// Overrides da função do usuário logado (o App aplica sobre o padrão).
router.get('/meus', (req, res) => {
  const mapa = ler(req.usuario.empresa_id);
  res.json({ funcao: req.usuario.funcao_nome, overrides: mapa[req.usuario.funcao_nome] || {} });
});

// Configuração completa (só gestão máxima edita).
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
