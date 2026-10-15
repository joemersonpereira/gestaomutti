// Pesquisa de satisfação do cliente (avaliação da loja por QR code).
// Endpoints PÚBLICOS (sem login) p/ a tela que o cliente abre pelo QR + resumo p/ gestão.
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const satGam = require('../lib/satisfacaoGamificacao');
const GESTAO_SAT = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Gerente'];
const { erpQuery, habilitado } = require('../db/erp');
const { cpfValido } = require('../lib/holerites');

const soDigitos = s => String(s || '').replace(/\D/g, '');

// Confere no ERP se o CPF teve compra nas últimas 24h naquela loja.
// Retorna { comprou, vendas, vendedor_erp, vendedor_nome } — vendedor só quando único.
async function compraDoClienteHoje(lojaId, cpf) {
  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  if (!loja || !loja.erp_unidadenegocio_id) return { comprou: false, semErp: true };
  const rows = await erpQuery(`
    SELECT COALESCE(uv.id, 0) AS vend_id, uv.apelido AS vendedor, COUNT(*) AS n
    FROM venda v JOIN pessoa pc ON pc.id = v.pessoaid
    LEFT JOIN orcamento o ON o.id = v.orcamentoid
    LEFT JOIN usuario uv ON uv.id = COALESCE(o.usuarioid, v.usuarioid)
    WHERE v.unidadenegocioid = $1 AND v.status IN ('F','D')
      AND regexp_replace(COALESCE(pc.cpf,''),'[^0-9]','','g') = $2
      AND v.datahorafechamento > now() - interval '24 hours'
    GROUP BY uv.id, uv.apelido`, [loja.erp_unidadenegocio_id, cpf]);
  const total = rows.reduce((a, r) => a + Number(r.n), 0);
  if (!total) return { comprou: false };
  const vend = rows.length === 1 && rows[0].vend_id ? rows[0] : null; // atribui só se 1 vendedor
  return { comprou: true, vendas: total, vendedor_erp: vend ? Number(vend.vend_id) : null, vendedor_nome: vend ? vend.vendedor : null };
}

// ── PÚBLICO: nome da loja (p/ exibir na tela de avaliação) ──
router.get('/publico/loja/:id', (req, res) => {
  const l = db.prepare('SELECT id, nome FROM lojas WHERE id=? AND ativa=1').get(req.params.id);
  if (!l) return res.status(404).json({ erro: 'Loja não encontrada.' });
  res.json({ id: l.id, nome: l.nome });
});

// ── PÚBLICO: registra a avaliação (1 a 5 + comentário), VALIDADA por CPF ──
// Só aceita de quem comprou hoje naquela loja (cruza com o ERP). 1 por CPF/loja/dia.
router.post('/publico', async (req, res) => {
  const { loja_id, nota, comentario } = req.body || {};
  const cpf = soDigitos(req.body && req.body.cpf);
  const n = parseInt(nota, 10);
  if (!loja_id || !(n >= 1 && n <= 5)) return res.status(400).json({ erro: 'Informe a loja e uma nota de 1 a 5.' });
  if (!cpfValido(cpf)) return res.status(400).json({ erro: 'Informe um CPF válido — usamos para confirmar sua compra de hoje.' });
  const loja = db.prepare('SELECT empresa_id FROM lojas WHERE id=? AND ativa=1').get(loja_id);
  if (!loja) return res.status(404).json({ erro: 'Loja não encontrada.' });

  // 1 avaliação por CPF/loja/dia
  const jaHoje = db.prepare(`SELECT 1 FROM satisfacao_avaliacoes WHERE loja_id=? AND cpf=? AND date(criado_em)=date('now','localtime')`).get(loja_id, cpf);
  if (jaHoje) return res.status(409).json({ erro: 'Você já avaliou hoje. Obrigado! 😊' });

  // Confirma a compra no ERP
  if (!habilitado()) return res.status(503).json({ erro: 'Não foi possível validar sua compra agora. Tente em instantes.' });
  let val;
  try { val = await compraDoClienteHoje(loja_id, cpf); }
  catch (e) { console.error('[satisfacao] validação ERP falhou:', e.message); return res.status(503).json({ erro: 'Não foi possível validar sua compra agora. Tente em instantes.' }); }
  if (val.semErp) return res.status(400).json({ erro: 'Esta loja ainda não está integrada para avaliação.' });
  if (!val.comprou) return res.status(403).json({ erro: 'Não encontramos uma compra sua hoje nesta loja. A avaliação é só para quem comprou hoje.' });

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().slice(0, 60);
  db.prepare(`INSERT INTO satisfacao_avaliacoes (id,empresa_id,loja_id,nota,comentario,cpf,validado,vendedor_erp,vendedor_nome,vendas_dia,ip,criado_em)
    VALUES (?,?,?,?,?,?,1,?,?,?,?,datetime('now'))`)
    .run(uuidv4(), loja.empresa_id, loja_id, n, (comentario || '').toString().slice(0, 500), cpf, val.vendedor_erp || null, val.vendedor_nome || null, val.vendas || null, ip);
  res.status(201).json({ ok: true, mensagem: 'Obrigado pela sua avaliação!', vendedor: val.vendedor_nome || null });
});

// ══════════════════ AVALIAÇÃO DO VENDEDOR (QR do vendedor) ══════════════════
// Confere no ERP se o CPF teve venda hoje COM aquele vendedor (validação estrita).
async function vendaComVendedorHoje(vendedorId, cpf) {
  const v = db.prepare('SELECT erp_pessoa_id FROM colaboradores WHERE id=?').get(vendedorId);
  if (!v || !v.erp_pessoa_id) return false;
  const r = await erpQuery(`
    SELECT COUNT(*) AS n
    FROM venda v JOIN pessoa pc ON pc.id = v.pessoaid
    LEFT JOIN orcamento o ON o.id = v.orcamentoid
    JOIN usuario uv ON uv.id = COALESCE(o.usuarioid, v.usuarioid)
    WHERE v.status IN ('F','D')
      AND regexp_replace(COALESCE(pc.cpf,''),'[^0-9]','','g') = $1
      AND uv.pessoaid = $2
      AND v.datahorafechamento > now() - interval '24 hours'`, [cpf, v.erp_pessoa_id]);
  return Number(r[0].n) > 0;
}

// Revalida as avaliações de vendedor PENDENTES do dia (a venda já pode ter fechado no
// caixa). Throttle simples p/ não marretar o ERP.
let _ultimaRevalida = 0;
async function revalidarPendentesVendedor(empresaId, force) {
  if (!habilitado()) return;
  if (!force && Date.now() - _ultimaRevalida < 60 * 1000) return;
  _ultimaRevalida = Date.now();
  const pend = db.prepare(`SELECT id, vendedor_id, cpf FROM satisfacao_vendedor
    WHERE empresa_id=? AND validado=0 AND date(criado_em)=date('now','localtime')`).all(empresaId);
  for (const p of pend) {
    try {
      if (await vendaComVendedorHoje(p.vendedor_id, p.cpf)) {
        db.prepare(`UPDATE satisfacao_vendedor SET validado=1, validado_em=datetime('now') WHERE id=?`).run(p.id);
      }
    } catch { /* ERP instável — tenta na próxima */ }
  }
}

// PÚBLICO: dados do vendedor (p/ exibir na tela do QR).
router.get('/publico/vendedor/:id', (req, res) => {
  const v = db.prepare(`SELECT c.id, c.nome, l.nome AS loja FROM colaboradores c JOIN lojas l ON l.id=c.loja_id
    WHERE c.id=? AND c.ativo=1`).get(req.params.id);
  if (!v) return res.status(404).json({ erro: 'Vendedor não encontrado.' });
  res.json({ id: v.id, nome: v.nome, loja: v.loja });
});

// PÚBLICO: registra a avaliação do vendedor. Entra PENDENTE e é validada depois
// (quando a venda fecha no caixa). 1 por CPF/vendedor/dia.
router.post('/publico-vendedor', async (req, res) => {
  const { vendedor_id, nota, comentario } = req.body || {};
  const cpf = soDigitos(req.body && req.body.cpf);
  const n = parseInt(nota, 10);
  if (!vendedor_id || !(n >= 1 && n <= 5)) return res.status(400).json({ erro: 'Informe o vendedor e uma nota de 1 a 5.' });
  if (!cpfValido(cpf)) return res.status(400).json({ erro: 'Informe um CPF válido — usamos para confirmar seu atendimento.' });
  const v = db.prepare('SELECT empresa_id, loja_id, erp_pessoa_id FROM colaboradores WHERE id=? AND ativo=1').get(vendedor_id);
  if (!v) return res.status(404).json({ erro: 'Vendedor não encontrado.' });

  const jaHoje = db.prepare(`SELECT 1 FROM satisfacao_vendedor WHERE vendedor_id=? AND cpf=? AND date(criado_em)=date('now','localtime')`).get(vendedor_id, cpf);
  if (jaHoje) return res.status(409).json({ erro: 'Você já avaliou este vendedor hoje. Obrigado! 😊' });

  // Tenta validar na hora (pode a venda já ter fechado); senão fica pendente.
  let validado = 0;
  if (habilitado()) { try { validado = (await vendaComVendedorHoje(vendedor_id, cpf)) ? 1 : 0; } catch { validado = 0; } }
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().slice(0, 60);
  db.prepare(`INSERT INTO satisfacao_vendedor (id,empresa_id,loja_id,vendedor_id,cpf,nota,comentario,validado,validado_em,ip,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(uuidv4(), v.empresa_id, v.loja_id, vendedor_id, cpf, n, (comentario || '').toString().slice(0, 500), validado, validado ? new Date().toISOString() : null, ip);
  res.status(201).json({ ok: true, mensagem: 'Obrigado pela sua avaliação! 💚' });
});

// GESTÃO: ranking de satisfação por vendedor da loja (só avaliações VALIDADAS).
router.get('/vendedores', auth, async (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const mm = String(mes).padStart(2, '0');
  try { await revalidarPendentesVendedor(req.usuario.empresa_id); } catch { /* ignora */ }
  const rows = db.prepare(`SELECT c.id, c.nome,
      COUNT(sv.id) FILTER (WHERE sv.validado=1) AS n,
      AVG(sv.nota) FILTER (WHERE sv.validado=1) AS media,
      COUNT(sv.id) FILTER (WHERE sv.validado=0 AND date(sv.criado_em)=date('now','localtime')) AS pendentes_hoje
    FROM colaboradores c
    LEFT JOIN satisfacao_vendedor sv ON sv.vendedor_id=c.id AND strftime('%m', sv.criado_em)=? AND strftime('%Y', sv.criado_em)=?
    WHERE c.empresa_id=? AND c.loja_id=? AND c.ativo=1 AND (c.funcao_id='func-vendedor' OR c.conferente=1)
    GROUP BY c.id, c.nome`).all(mm, String(ano), req.usuario.empresa_id, lojaId);
  const vend = rows.map(r => ({ id: r.id, nome: r.nome, avaliacoes: r.n || 0,
    media: r.n ? Math.round((r.media) * 10) / 10 : null, nota100: r.n ? Math.round((r.media / 5) * 100) : null,
    pendentes_hoje: r.pendentes_hoje || 0 }))
    .sort((a, b) => (b.nota100 ?? -1) - (a.nota100 ?? -1));
  res.json({ loja_id: lojaId, mes, ano, vendedores: vend });
});

// ── GESTÃO: resumo (média, distribuição, comentários) por loja/mês ──
router.get('/resumo', auth, (req, res) => {
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1;
  const ano = parseInt(req.query.ano) || hoje.getFullYear();
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const mm = String(mes).padStart(2, '0');
  const rows = db.prepare(`SELECT nota, comentario, criado_em FROM satisfacao_avaliacoes
    WHERE loja_id=? AND strftime('%m', criado_em)=? AND strftime('%Y', criado_em)=? ORDER BY criado_em DESC`)
    .all(lojaId, mm, String(ano));
  const total = rows.length;
  const soma = rows.reduce((a, r) => a + r.nota, 0);
  res.json({
    loja_id: lojaId, mes, ano, total,
    media: total ? Math.round((soma / total) * 10) / 10 : null,
    nota100: total ? Math.round((soma / total) / 5 * 100) : null,
    distribuicao: [5, 4, 3, 2, 1].map(s => ({ estrela: s, n: rows.filter(r => r.nota === s).length })),
    comentarios: rows.filter(r => r.comentario && r.comentario.trim())
      .slice(0, 20).map(r => ({ nota: r.nota, comentario: r.comentario, data: r.criado_em })),
  });
});

// Revalida as pendentes de tempos em tempos (vendas que fecharam no caixa após a
// avaliação). A cada 3 min, para cada empresa com avaliação pendente hoje.
setInterval(() => {
  try {
    const empresas = db.prepare(`SELECT DISTINCT empresa_id FROM satisfacao_vendedor WHERE validado=0 AND date(criado_em)=date('now','localtime')`).all();
    empresas.forEach(e => revalidarPendentesVendedor(e.empresa_id, true).catch(() => {}));
  } catch { /* ignora */ }
}, 3 * 60 * 1000).unref();

// ── Gamificação: pontos por avaliação coletada (incentiva o vendedor a pedir avaliação) ──
router.get('/gamificacao', auth, (req, res) => {
  const hoje = new Date();
  res.json(satGam.ranking(req.usuario.empresa_id, { ano: req.query.ano || hoje.getFullYear(), mes: req.query.mes || (hoje.getMonth() + 1), lojaId: req.query.loja_id || null }));
});
router.put('/gamificacao/config', auth, exigePerfil(...GESTAO_SAT), (req, res) => {
  res.json({ ok: true, config: satGam.setConfig(req.usuario.empresa_id, req.body, req.usuario.id) });
});
router.post('/gamificacao/premiar', auth, exigePerfil(...GESTAO_SAT), (req, res) => {
  res.json(satGam.premiar(req.usuario.empresa_id, { ano: req.body.ano, mes: req.body.mes, lojaId: req.body.loja_id || null, usuarioId: req.usuario.id }));
});

module.exports = router;
