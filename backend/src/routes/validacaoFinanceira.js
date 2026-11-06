// validacaoFinanceira.js — Painel único de Validação Financeira: lista as pendências de confirmação
// de pagamento de vários módulos (Trade, Devolução…), guarda o comprovante e registra a confirmação.
// O Comercial pode anexar o comprovante; o FINANCEIRO (e gestão) confirma o pagamento.
const express = require('express');
const router = express.Router();
const { auth, exigePerfil } = require('../middleware/auth');
const fv = require('../lib/financeiroValidacao');

router.use(auth);
const emp = req => req.usuario.empresa_id;
const wrap = fn => (req, res) => { try { res.json(fn(req)); } catch (e) { res.status(400).json({ erro: e.message }); } };

// quem VÊ o painel e pode ANEXAR comprovante (Comercial acompanha e pode subir o comprovante)
const ACESSO = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Financeiro', 'Tesouraria', 'Contabilidade', 'Comercial', 'Marketing', 'Supervisor'];
// quem CONFIRMA o pagamento (o Financeiro sempre precisa confirmar)
const CONFIRMA = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Financeiro', 'Tesouraria'];

router.get('/', exigePerfil(...ACESSO), wrap(req => fv.listar(emp(req), { origem: req.query.origem || null })));

router.post('/comprovante', exigePerfil(...ACESSO), wrap(req => fv.anexarComprovante(emp(req), { ...req.body, usuario: req.usuario })));

router.get('/comprovante', exigePerfil(...ACESSO), (req, res) => {
  const c = fv.getComprovante(emp(req), req.query.origem, req.query.ref_id);
  if (!c || !c.comprovante) return res.status(404).json({ erro: 'Sem comprovante.' });
  const m = /^data:([^;]+);base64,(.*)$/.exec(c.comprovante);
  const mime = (m && m[1]) || c.comprovante_mime || 'application/octet-stream';
  const buf = Buffer.from(m ? m[2] : c.comprovante, 'base64');
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `inline; filename="${(c.comprovante_nome || 'comprovante').replace(/"/g, '')}"`);
  res.send(buf);
});

router.post('/confirmar', exigePerfil(...CONFIRMA), wrap(req => fv.confirmar(emp(req), { ...req.body, usuario: req.usuario })));

module.exports = router;
