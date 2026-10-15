// Relatório de recebimento físico por conferente (indicadores do conferente via ERP).
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { auth } = require('../middleware/auth');
const recebimentoErp = require('../lib/recebimentoErp');

router.use(auth);

// GET /recebimento/pendencias?loja_id=&dias=   (loja_id vazio/"todas" = rede, p/ gestão)
// Notas pendentes de recepção de transporte + conferências em aberto, por loja.
router.get('/pendencias', async (req, res) => {
  const ehRede = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(req.usuario.funcao_nome);
  const dias = Math.min(parseInt(req.query.dias) || 30, 90);
  const querTodas = !req.query.loja_id || req.query.loja_id === 'todas';
  let lojas;
  if (querTodas && ehRede) {
    lojas = db.prepare(`SELECT id, nome, erp_unidadenegocio_id AS uni FROM lojas WHERE empresa_id=? AND erp_unidadenegocio_id IS NOT NULL ORDER BY nome`).all(req.usuario.empresa_id);
  } else {
    const lojaId = (querTodas ? req.usuario.loja_id : req.query.loja_id);
    lojas = db.prepare(`SELECT id, nome, erp_unidadenegocio_id AS uni FROM lojas WHERE id=? AND erp_unidadenegocio_id IS NOT NULL`).all(lojaId);
  }
  const linhas = await recebimentoErp.pendenciasRecebimento(lojas, dias);
  const total = linhas.reduce((a, l) => ({
    sem_recepcao: a.sem_recepcao + l.sem_recepcao,
    valor_recepcao: a.valor_recepcao + l.valor_recepcao,
    conf_abertos: a.conf_abertos + l.conf_abertos,
  }), { sem_recepcao: 0, valor_recepcao: 0, conf_abertos: 0 });
  res.json({ escopo: querTodas && ehRede ? 'rede' : 'loja', dias, lojas: linhas, total });
});

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// GET /recebimento/conferentes?loja_id=&mes=&ano=  (marca quais já têm cadastro no Mutti)
router.get('/conferentes', async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const lista = await recebimentoErp.conferentesLojaMes(lojaId, mes, ano);
  // Cadastros func-conferente existentes p/ casar por erp_usuario_id ou nome/apelido.
  const cads = db.prepare(`SELECT id, nome, erp_usuario_id FROM colaboradores WHERE empresa_id=? AND funcao_id='func-conferente' AND ativo=1`).all(req.usuario.empresa_id);
  const porErp = new Map(cads.filter(c => c.erp_usuario_id).map(c => [Number(c.erp_usuario_id), c]));
  const porNome = new Map(cads.map(c => [norm(c.nome), c]));
  const conferentes = lista.map(c => {
    const cad = porErp.get(c.usuarioid) || porNome.get(norm(c.nome)) || null;
    return { ...c, colaborador_id: cad ? cad.id : null, vinculadoPorNome: cad ? !cad.erp_usuario_id : false };
  });
  res.json({ loja_id: lojaId, mes, ano, gap_batida_min: recebimentoErp.GAP_BATIDA_SEG / 60, conferentes });
});

// POST /recebimento/conferentes/importar  { usuarioid, nome, loja_id }  → cria colaborador func-conferente
const GEST_CONF = ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'RH', 'Suporte'];
router.post('/conferentes/importar', require('../middleware/auth').exigePerfil(...GEST_CONF), (req, res) => {
  const emp = req.usuario.empresa_id;
  const usuarioid = parseInt(req.body.usuarioid);
  const nome = (req.body.nome || '').toString().trim().slice(0, 120);
  const lojaId = req.body.loja_id || req.usuario.loja_id;
  if (!usuarioid || !nome || !lojaId) return res.status(400).json({ erro: 'Informe usuário do ERP, nome e loja.' });
  // idempotente: já existe um func-conferente com esse erp_usuario_id?
  const ja = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND funcao_id='func-conferente' AND erp_usuario_id=?`).get(emp, usuarioid);
  if (ja) return res.json({ ok: true, colaborador_id: ja.id, jaExistia: true });
  // ou um cadastro pelo mesmo nome sem erp — vincula o erp nele.
  const porNome = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND funcao_id='func-conferente' AND UPPER(nome)=UPPER(?)`).get(emp, nome);
  if (porNome) { db.prepare('UPDATE colaboradores SET erp_usuario_id=?, loja_id=COALESCE(loja_id,?) WHERE id=?').run(usuarioid, lojaId, porNome.id); return res.json({ ok: true, colaborador_id: porNome.id, vinculado: true }); }
  const { v4: uuid } = require('uuid');
  const id = uuid();
  db.prepare(`INSERT INTO colaboradores (id,empresa_id,nome,funcao_id,loja_id,ativo,erp_usuario_id,origem_erp,senha_hash,criado_em)
    VALUES (?,?,?,'func-conferente',?,1,?, 'recebimento', '', datetime('now'))`).run(id, emp, nome, lojaId, usuarioid);
  res.status(201).json({ ok: true, colaborador_id: id, criado: true });
});

module.exports = router;
