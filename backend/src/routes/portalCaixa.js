// portalCaixa.js — PORTAL DO COLABORADOR POR CPF (público, sem login). Joe 2026-11-12.
//   CAIXA  entra por CPF → vê SÓ os PONTOS dele + as DIFERENÇAS de caixa dele.
//   GERENTE entra por CPF → vê os CAIXAS da loja dele no dia + ANEXA depósitos/despesas da loja.
// Cada um só o que lhe cabe: a sessão nunca enxerga dados de outro colaborador (caixa) nem de outra loja (gerente).
//
// ── Caminho técnico v2.0 (Postgres) ──
// Tabela portal_caixa_sessao já no 378. Papel = função do colaborador (func-gerente/subgerente/supervisor
// = gerente; demais = caixa). erp_uid = usuario(s) do ERP com o mesmo CPF (mapeado no acesso, não guardado
// no cadastro — só 10 colaboradores têm erp_usuario_id preenchido). Diferenças = quebracaixa por operador
// (lib tesourariaErp.quebras filtrada pelo erp_uid). Pontos = pontos_lancamentos por colaborador_id.
// Anexos = tesouraria_anexo (mesma tabela do fechamento de caixa da gestão), tipo deposito/despesa/recarga.
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { v4: uuid } = require('uuid');
const { erpQuery, habilitado } = require('../db/erp');
const tes = require('../lib/tesourariaErp');
const EMP = 'empresa-mutti-001';
const soDig = s => String(s || '').replace(/\D/g, '');
const GESTAO_FUNC = new Set(['func-gerente', 'func-subgerente', 'func-supervisor', 'func-coordenador', 'func-diretor']);
// gerente = função de gestão OU marcado como conferente/chefe de setor/liderança no cadastro.
// (hoje ninguém tem função "gerente" na base; quem confere o caixa da loja é o conferente — Joe pode marcar mais.)
function ehGerente(c) {
  if (GESTAO_FUNC.has(c.funcao_id)) return true;
  if (Number(c.conferente) === 1 || Number(c.chefe_setor) === 1 || Number(c.lideranca) === 1) return true;
  const fn = String(c.funcao_nome || '').toLowerCase();
  return /geren|supervis|coorden|diretor|l[ií]der/.test(fn);
}

// ── ACESSO: entra por CPF. Acha o colaborador ativo, define o papel e emite um token de sessão. ──
router.post('/acesso', async (req, res) => {
  const cpf = soDig((req.body || {}).cpf);
  if (cpf.length !== 11) return res.status(400).json({ erro: 'Informe um CPF válido (11 dígitos).' });
  const colab = db.prepare(`SELECT c.*, l.nome loja_nome, f.nome funcao_nome
      FROM colaboradores c LEFT JOIN lojas l ON l.id=c.loja_id LEFT JOIN funcoes f ON f.id=c.funcao_id
      WHERE c.empresa_id=? AND replace(replace(replace(COALESCE(c.cpf,''),'.',''),'-',''),' ','')=? AND COALESCE(c.ativo,1)=1`).get(EMP, cpf);
  if (!colab) return res.status(403).json({ erro: 'CPF não encontrado entre os colaboradores ativos. Procure o RH.' });
  const papel = ehGerente(colab) ? 'gerente' : 'caixa';
  // usuario(s) do ERP com esse CPF → p/ filtrar as diferenças de caixa do operador
  let erpUids = [];
  if (habilitado()) {
    try {
      const us = await erpQuery(`SELECT u.id::text uid FROM usuario u JOIN pessoa p ON p.id=u.pessoaid
        WHERE regexp_replace(COALESCE(p.cpf,''),'[^0-9]','','g') = $1`, [cpf]);
      erpUids = (us || []).map(r => String(r.uid));
    } catch (e) { /* ERP fora do ar → caixa vê só pontos */ }
  }
  const token = uuid().replace(/-/g, '');
  db.prepare(`INSERT INTO portal_caixa_sessao (token, empresa_id, colaborador_id, cpf, nome, papel, loja_id, erp_uid)
    VALUES (?,?,?,?,?,?,?,?)`).run(token, EMP, colab.id, cpf, colab.nome, papel, colab.loja_id || null, erpUids.join(','));
  res.json({ ok: true, token, papel, nome: colab.nome, apelido: colab.apelido || null, loja: colab.loja_nome || null, loja_id: colab.loja_id || null, funcao: colab.funcao_nome || null });
});

// middleware: exige uma sessão de portal válida (token emitido em /acesso)
function exigePortal(req, res, next) {
  const tok = String(req.get('x-portal') || req.query.portal || '');
  const s = tok && db.prepare('SELECT * FROM portal_caixa_sessao WHERE token=? AND empresa_id=?').get(tok, EMP);
  if (!s) return res.status(401).json({ erro_acesso: true, erro: 'Entre com seu CPF para continuar.' });
  req.portal = s;
  next();
}
function soGerente(req, res, next) { if (req.portal.papel !== 'gerente') return res.status(403).json({ erro: 'Disponível só para o gerente da loja.' }); next(); }
const hojeISO = () => new Date().toISOString().slice(0, 10);
const diasAtras = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// ── CAIXA: meus pontos + minhas diferenças de caixa ──
router.get('/meu-resumo', exigePortal, async (req, res) => {
  const s = req.portal;
  // pontos (saldo + extrato)
  const lanc = db.prepare(`SELECT tipo, descricao, pontos, competencia, criado_em FROM pontos_lancamentos
    WHERE empresa_id=? AND colaborador_id=? ORDER BY criado_em DESC LIMIT 60`).all(EMP, s.colaborador_id);
  const saldo = db.prepare(`SELECT COALESCE(SUM(pontos),0) saldo FROM pontos_lancamentos WHERE empresa_id=? AND colaborador_id=?`).get(EMP, s.colaborador_id).saldo;
  // diferenças de caixa do operador (quebras da loja filtradas pelo erp_uid), últimos 90 dias
  let diferencas = [], resumoDif = { faltas: 0, sobras: 0, valorFalta: 0, valorSobra: 0 };
  const uids = new Set(String(s.erp_uid || '').split(',').filter(Boolean));
  if (uids.size && habilitado()) {
    try {
      const q = await tes.quebras(EMP, { ini: diasAtras(90), fim: hojeISO(), lojaId: s.loja_id || '' });
      diferencas = (q.quebras || []).filter(x => x.operadorId && uids.has(String(x.operadorId)))
        .map(x => ({ data: x.data, valor: x.valor, tipo: x.tipo, loja: x.loja, relevante: x.relevante, observacao: x.observacao, cobranca: x.cobranca?.status || null }));
      diferencas.forEach(d => { if (d.tipo === 'falta') { resumoDif.faltas++; resumoDif.valorFalta += d.valor; } else { resumoDif.sobras++; resumoDif.valorSobra += d.valor; } });
      resumoDif.valorFalta = Math.round(resumoDif.valorFalta * 100) / 100; resumoDif.valorSobra = Math.round(resumoDif.valorSobra * 100) / 100;
    } catch (e) { /* ERP indisponível → mostra só pontos */ }
  }
  res.json({ ok: true, nome: s.nome, papel: s.papel, loja_id: s.loja_id,
    pontos: { saldo, lancamentos: lanc },
    diferencas, resumoDif, erpVinculado: uids.size > 0 });
});

// ── GERENTE: caixas da loja no dia + anexos ──
router.get('/caixas', exigePortal, soGerente, async (req, res) => {
  const s = req.portal;
  const data = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data : hojeISO();
  let sessoes = [], resumo = null;
  if (habilitado()) {
    try { const c = await tes.conferenciaCaixa(EMP, { data, lojaId: s.loja_id || '' }); if (c.ok) { sessoes = c.sessoes || []; resumo = c.resumo; } }
    catch (e) { /* ERP fora do ar */ }
  }
  const anx = anexosDoDia(s.loja_id, data);
  res.json({ ok: true, data, loja_id: s.loja_id, sessoes, resumo, anexos: anx });
});

function anexosDoDia(lojaId, data) {
  const rows = db.prepare(`SELECT id, tipo, descricao, valor, nome, tipo_mime, criado_em FROM tesouraria_anexo
    WHERE empresa_id=? AND loja_id=? AND data=? ORDER BY criado_em DESC`).all(EMP, lojaId || '', data);
  return rows.map(r => ({ id: r.id, tipo: r.tipo, descricao: r.descricao, valor: r.valor, nome: r.nome, tem_foto: !!r.tipo_mime, criado_em: r.criado_em }));
}

// gerente anexa um depósito / despesa / recarga da loja dele (mesma tabela do fechamento da gestão)
router.post('/anexo', exigePortal, soGerente, (req, res) => {
  const s = req.portal; const b = req.body || {};
  const data = /^\d{4}-\d{2}-\d{2}$/.test(b.data || '') ? b.data : hojeISO();
  if (!['deposito', 'despesa', 'recarga'].includes(b.tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
  if (!b.dados) return res.status(400).json({ erro: 'Anexe o arquivo/foto.' });
  const ROT = { deposito: 'depósito', despesa: 'despesa', recarga: 'recarga' };
  if (b.tipo !== 'despesa') { // despesa pode ter várias no dia; depósito/recarga só uma
    const ja = db.prepare(`SELECT 1 FROM tesouraria_anexo WHERE empresa_id=? AND loja_id=? AND data=? AND tipo=? LIMIT 1`).get(EMP, s.loja_id || '', data, b.tipo);
    if (ja) return res.status(409).json({ erro: `Já existe ${ROT[b.tipo]} anexado para esta loja em ${data.split('-').reverse().join('/')}. Exclua o anterior para anexar outro.` });
  }
  const id = uuid();
  db.prepare(`INSERT INTO tesouraria_anexo (id,empresa_id,loja_id,data,tipo,descricao,valor,nome,tipo_mime,dados,origem,criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, EMP, s.loja_id || '', data, b.tipo, b.descricao || null, b.valor != null && b.valor !== '' ? Number(b.valor) : null,
      b.nome || (b.tipo + '.jpg'), b.tipo_mime || null, String(b.dados).slice(0, 8000000), 'portal', 'portal:' + s.nome);
  res.status(201).json({ ok: true, id });
});

router.delete('/anexo/:id', exigePortal, soGerente, (req, res) => {
  // só apaga anexo da PRÓPRIA loja
  const a = db.prepare('SELECT loja_id FROM tesouraria_anexo WHERE id=? AND empresa_id=?').get(req.params.id, EMP);
  if (!a || String(a.loja_id || '') !== String(req.portal.loja_id || '')) return res.status(403).json({ erro: 'Anexo de outra loja.' });
  db.prepare('DELETE FROM tesouraria_anexo WHERE id=? AND empresa_id=?').run(req.params.id, EMP);
  res.json({ ok: true });
});

// visualizar o anexo (gerente, só da própria loja)
router.get('/anexo/:id/arquivo', exigePortal, soGerente, (req, res) => {
  const a = db.prepare('SELECT loja_id, nome, tipo_mime, dados FROM tesouraria_anexo WHERE id=? AND empresa_id=?').get(req.params.id, EMP);
  if (!a || String(a.loja_id || '') !== String(req.portal.loja_id || '')) return res.status(404).end();
  if (!a.dados) return res.status(404).end();
  res.setHeader('Content-Type', a.tipo_mime || 'application/octet-stream');
  res.end(Buffer.from(String(a.dados).replace(/^data:[^,]+,/, ''), 'base64'));
});

module.exports = router;
