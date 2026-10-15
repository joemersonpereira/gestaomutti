// servicosFarmaceuticos.js — cuidado farmacêutico: serviços, catálogo cadastrável, base de
// pacientes (anamnese que persiste), termo de responsabilidade/LGPD e histórico por paciente.
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { auth } = require('../middleware/auth');
const { erpQuery, habilitado } = require('../db/erp');
const { buscarProduto } = require('../lib/faltasErp');
const cuidadoFarmac = require('../lib/cuidadoFarmac');

// ── Público (SEM auth): avaliação do atendimento pelo paciente via QR/link ────
// O id do serviço (uuid) é o token. Rotas ANTES do router.use(auth).
router.get('/public/atendimento/:id', (req, res) => {
  const sv = db.prepare(`SELECT s.id, s.tipo, s.colaborador_nome, s.loja_nome, s.data, s.paciente_id,
      (SELECT nome FROM pacientes_farmac WHERE id=s.paciente_id) AS paciente_nome
    FROM servicos_farmaceuticos s WHERE s.id=?`).get(req.params.id);
  if (!sv) return res.status(404).json({ erro: 'Atendimento não encontrado.' });
  const ja = db.prepare('SELECT nota FROM farmac_avaliacoes WHERE servico_id=?').get(sv.id);
  res.json({ tipo: sv.tipo, profissional: sv.colaborador_nome, loja: sv.loja_nome, data: sv.data, paciente: sv.paciente_nome, ja_avaliado: !!ja });
});
router.post('/public/atendimento/:id/avaliar', (req, res) => {
  const n = parseInt(req.body.nota, 10);
  if (!(n >= 1 && n <= 5)) return res.status(400).json({ erro: 'Dê uma nota de 1 a 5.' });
  const sv = db.prepare('SELECT id, empresa_id, loja_id, paciente_id, colaborador_id FROM servicos_farmaceuticos WHERE id=?').get(req.params.id);
  if (!sv) return res.status(404).json({ erro: 'Atendimento não encontrado.' });
  if (db.prepare('SELECT 1 FROM farmac_avaliacoes WHERE servico_id=?').get(sv.id)) return res.status(409).json({ erro: 'Este atendimento já foi avaliado. Obrigado!' });
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim();
  db.prepare(`INSERT INTO farmac_avaliacoes (id,empresa_id,loja_id,servico_id,paciente_id,colaborador_id,nota,comentario,ip)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(uuid(), sv.empresa_id, sv.loja_id, sv.id, sv.paciente_id, sv.colaborador_id, n, (req.body.comentario || '').toString().slice(0, 500) || null, ip);
  res.json({ ok: true });
});

router.use(auth);

// ── ERP: busca de produto (identificar o item) e de venda pelo COO do cupom ───
router.get('/erp/produtos', async (req, res) => {
  try { res.json({ produtos: await buscarProduto(req.query.q || '', 15) }); }
  catch { res.json({ produtos: [] }); }
});
// Busca de cliente no ERP p/ importar como paciente (nome, CPF, nascimento, telefone principal)
router.get('/erp/clientes', async (req, res) => {
  const termo = (req.query.q || '').toString().trim();
  if (termo.length < 3 || !habilitado()) return res.json({ clientes: [] });
  const soDigitos = termo.replace(/\D/g, '');
  try {
    const rows = await erpQuery(`
      SELECT p.nome, p.cpf, p.datanascimento,
        (SELECT c.ddd || c.contato FROM contato c WHERE c.pessoaid=p.id AND c.tipo IN ('C','T') ORDER BY c.principal DESC NULLS LAST LIMIT 1) AS telefone
      FROM pessoa p
      WHERE p.cpf IS NOT NULL AND (
        ($1 <> '' AND p.cpf = $1) OR p.nome ILIKE $2
      )
      ORDER BY (p.cpf = $1) DESC, p.nome LIMIT 12`, [soDigitos, `%${termo}%`]);
    res.json({ clientes: rows.map(r => ({
      nome: r.nome, cpf: r.cpf || '', telefone: r.telefone || '',
      nascimento: r.datanascimento ? String(r.datanascimento).slice(0, 10) : '',
    })) });
  } catch (e) { res.json({ clientes: [], erro: e.message }); }
});
router.get('/erp/venda-coo', async (req, res) => {
  const coo = (req.query.coo || '').replace(/\D/g, '');
  if (!coo || !habilitado()) return res.json({ vendas: [] });
  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(req.query.loja_id || req.usuario.loja_id) || {};
  const uni = loja.erp_unidadenegocio_id;
  try {
    const vendas = await erpQuery(`SELECT v.id, v.coo, v.datahorafechamento, v.valortotal FROM venda v
      WHERE v.coo=$1 ${uni ? 'AND v.unidadenegocioid=$2' : ''} AND v.status IN ('F','D')
      ORDER BY v.datahorafechamento DESC LIMIT 8`, uni ? [coo, uni] : [coo]);
    const out = [];
    for (const v of vendas) {
      const itens = await erpQuery(`SELECT e.descricao, e.codigobarras ean, i.quantidade, i.valortotal
        FROM itemvenda i JOIN embalagem e ON e.id=i.embalagemid WHERE i.vendaid=$1 ORDER BY e.descricao`, [v.id]);
      out.push({ coo: String(v.coo), data: v.datahorafechamento, valor: Number(v.valortotal) || 0, itens: itens.map(x => ({ descricao: x.descricao, ean: x.ean, quantidade: Number(x.quantidade) || 0, valor: Number(x.valortotal) || 0 })) });
    }
    res.json({ vendas: out });
  } catch (e) { res.json({ vendas: [], erro: e.message }); }
});

const GESTAO = ['Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'RH', 'Controladoria'];
const ehGestao = u => GESTAO.includes(u.funcao_nome);
const TERMO_INJETAVEL_PADRAO = 'Declaro estar ciente de que o serviço de aplicação de medicamento injetável será realizado por profissional habilitado, conforme prescrição/orientação, e autorizo sua realização. Fui informado(a) sobre eventuais reações e a conduta em caso de intercorrência.';
const TIPOS_PADRAO = [
  { nome: 'Aplicação de injetável', valor_padrao: 0, exige_termo: 1, termo_texto: TERMO_INJETAVEL_PADRAO },
  { nome: 'Aferição de pressão', valor_padrao: 0, exige_termo: 0 }, { nome: 'Teste de glicemia', valor_padrao: 0, exige_termo: 0 },
  { nome: 'Nebulização', valor_padrao: 0, exige_termo: 1, termo_texto: 'Autorizo a realização de nebulização conforme orientação, ciente das condições do serviço.' },
  { nome: 'Perfuração de orelha', valor_padrao: 0, exige_termo: 1, termo_texto: 'Autorizo a perfuração de orelha e declaro ciência dos cuidados pós-procedimento.' },
  { nome: 'Curativo', valor_padrao: 0, exige_termo: 0 }, { nome: 'Orientação farmacêutica', valor_padrao: 0, exige_termo: 0 },
  { nome: 'Teste rápido (COVID/dengue)', valor_padrao: 0, exige_termo: 1, termo_texto: 'Autorizo a coleta para teste rápido e o registro do resultado, conforme a LGPD.' },
];

function seedTipos(emp) {
  const n = db.prepare('SELECT COUNT(*) c FROM servico_farmac_tipos WHERE empresa_id=?').get(emp).c;
  if (n) return;
  const ins = db.prepare('INSERT INTO servico_farmac_tipos (id,empresa_id,nome,valor_padrao,exige_termo,termo_texto,ordem,ativo) VALUES (?,?,?,?,?,?,?,1)');
  TIPOS_PADRAO.forEach((t, i) => ins.run(uuid(), emp, t.nome, t.valor_padrao, t.exige_termo, t.termo_texto || null, i));
}

// ── Catálogo de serviços cadastráveis ────────────────────────────────────────
router.get('/tipos', (req, res) => {
  seedTipos(req.usuario.empresa_id);
  res.json({ tipos: db.prepare('SELECT * FROM servico_farmac_tipos WHERE empresa_id=? AND ativo=1 ORDER BY ordem, nome').all(req.usuario.empresa_id) });
});
router.post('/tipos', (req, res) => {
  if (!ehGestao(req.usuario)) return res.status(403).json({ erro: 'Só a gestão cadastra serviços.' });
  const { id, nome, valor_padrao, exige_termo, termo_texto } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Informe o nome do serviço.' });
  if (id) db.prepare('UPDATE servico_farmac_tipos SET nome=?, valor_padrao=?, exige_termo=?, termo_texto=? WHERE id=? AND empresa_id=?')
    .run(nome.trim(), Number(valor_padrao) || 0, exige_termo ? 1 : 0, (termo_texto || '').trim() || null, id, req.usuario.empresa_id);
  else {
    const ordem = (db.prepare('SELECT COALESCE(MAX(ordem),0) m FROM servico_farmac_tipos WHERE empresa_id=?').get(req.usuario.empresa_id).m) + 1;
    db.prepare('INSERT INTO servico_farmac_tipos (id,empresa_id,nome,valor_padrao,exige_termo,termo_texto,ordem,ativo) VALUES (?,?,?,?,?,?,?,1)')
      .run(uuid(), req.usuario.empresa_id, nome.trim(), Number(valor_padrao) || 0, exige_termo ? 1 : 0, (termo_texto || '').trim() || null, ordem);
  }
  res.json({ ok: true });
});
router.delete('/tipos/:id', (req, res) => {
  if (!ehGestao(req.usuario)) return res.status(403).json({ erro: 'Sem permissão.' });
  db.prepare('UPDATE servico_farmac_tipos SET ativo=0 WHERE id=? AND empresa_id=?').run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// Config: meta mensal de atendimentos que vale nota 100 no indicador do farmacêutico
router.get('/config', (req, res) => {
  res.json({ meta_atendimentos: cuidadoFarmac.metaAtendimentos(req.usuario.empresa_id), gestao: ehGestao(req.usuario) });
});
router.put('/config', (req, res) => {
  if (!ehGestao(req.usuario)) return res.status(403).json({ erro: 'Só a gestão altera a meta.' });
  const meta = cuidadoFarmac.setMetaAtendimentos(req.usuario.empresa_id, req.body.meta_atendimentos);
  res.json({ ok: true, meta_atendimentos: meta });
});

// ── Pacientes (base + anamnese que persiste entre visitas) ───────────────────
router.get('/pacientes', (req, res) => {
  const q = (req.query.q || '').trim();
  let sql = 'SELECT id, nome, cpf, telefone FROM pacientes_farmac WHERE empresa_id=?';
  const p = [req.usuario.empresa_id];
  if (q) { sql += ' AND (nome LIKE ? OR cpf LIKE ? OR telefone LIKE ?)'; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY nome LIMIT 30';
  res.json({ pacientes: db.prepare(sql).all(...p) });
});
router.get('/pacientes/:id', (req, res) => {
  const pac = db.prepare('SELECT * FROM pacientes_farmac WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!pac) return res.status(404).json({ erro: 'Paciente não encontrado.' });
  const historico = db.prepare('SELECT id, tipo, valor, data, colaborador_nome, comentario, intercorrencia, resultado, produto, lote, validade, coo, crm FROM servicos_farmaceuticos WHERE empresa_id=? AND paciente_id=? ORDER BY data DESC LIMIT 100').all(req.usuario.empresa_id, req.params.id);
  const alertas = historico.filter(h => h.intercorrencia).map(h => ({ data: h.data, tipo: h.tipo, texto: h.intercorrencia }));
  res.json({ paciente: pac, historico, alertas });
});
router.post('/pacientes', (req, res) => {
  const u = req.usuario; const b = req.body;
  if (!b.nome || !b.nome.trim()) return res.status(400).json({ erro: 'Informe o nome do paciente.' });
  const campos = { nome: b.nome.trim(), cpf: (b.cpf || '').trim() || null, telefone: (b.telefone || '').trim() || null, nascimento: (b.nascimento || '').slice(0, 10) || null, alergias: (b.alergias || '').trim() || null, medicamentos: (b.medicamentos || '').trim() || null, condicoes: (b.condicoes || '').trim() || null, obs: (b.obs || '').trim() || null, consent_lgpd: b.consent_lgpd ? 1 : 0 };
  if (b.id) {
    db.prepare(`UPDATE pacientes_farmac SET nome=?,cpf=?,telefone=?,nascimento=?,alergias=?,medicamentos=?,condicoes=?,obs=?,consent_lgpd=?, consent_em=COALESCE(consent_em, CASE WHEN ?=1 THEN datetime('now') END), atualizado_em=datetime('now') WHERE id=? AND empresa_id=?`)
      .run(campos.nome, campos.cpf, campos.telefone, campos.nascimento, campos.alergias, campos.medicamentos, campos.condicoes, campos.obs, campos.consent_lgpd, campos.consent_lgpd, b.id, u.empresa_id);
    return res.json({ ok: true, id: b.id });
  }
  const id = uuid();
  db.prepare(`INSERT INTO pacientes_farmac (id,empresa_id,nome,cpf,telefone,nascimento,alergias,medicamentos,condicoes,obs,consent_lgpd,consent_em,criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?, ${campos.consent_lgpd ? "datetime('now')" : 'NULL'}, ?)`)
    .run(id, u.empresa_id, campos.nome, campos.cpf, campos.telefone, campos.nascimento, campos.alergias, campos.medicamentos, campos.condicoes, campos.obs, campos.consent_lgpd, u.id);
  res.json({ ok: true, id });
});

// ── Serviços realizados ──────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const u = req.usuario;
  const hoje = new Date();
  const mes = String(parseInt(req.query.mes) || hoje.getMonth() + 1).padStart(2, '0');
  const ano = String(parseInt(req.query.ano) || hoje.getFullYear());
  const lojaId = req.query.loja_id || (ehGestao(u) ? null : u.loja_id);
  let sql = `SELECT sf.*, p.nome paciente_nome, av.nota AS nota_avaliacao FROM servicos_farmaceuticos sf
    LEFT JOIN pacientes_farmac p ON p.id=sf.paciente_id
    LEFT JOIN farmac_avaliacoes av ON av.servico_id=sf.id
    WHERE sf.empresa_id=? AND strftime('%m',sf.data)=? AND strftime('%Y',sf.data)=?`;
  const p = [u.empresa_id, mes, ano];
  if (lojaId) { sql += ' AND sf.loja_id=?'; p.push(lojaId); }
  if (req.query.colaborador_id) { sql += ' AND sf.colaborador_id=?'; p.push(req.query.colaborador_id); }
  sql += ' ORDER BY sf.data DESC, sf.criado_em DESC LIMIT 500';
  const servicos = db.prepare(sql).all(...p);
  const porColaborador = {}, porTipo = {};
  let total = 0, valorTotal = 0, notaSoma = 0, notaN = 0;
  servicos.forEach(sv => {
    total++; valorTotal += Number(sv.valor) || 0;
    if (sv.nota_avaliacao) { notaSoma += sv.nota_avaliacao; notaN++; }
    const ck = sv.colaborador_nome || '—'; porColaborador[ck] = porColaborador[ck] || { nome: ck, qtd: 0, valor: 0 };
    porColaborador[ck].qtd++; porColaborador[ck].valor += Number(sv.valor) || 0;
    porTipo[sv.tipo] = (porTipo[sv.tipo] || 0) + 1;
  });
  const satisfacao = { avaliados: notaN, media: notaN ? Math.round((notaSoma / notaN) * 10) / 10 : null, nota100: notaN ? Math.round((notaSoma / notaN) / 5 * 100) : null };
  res.json({
    mes: +mes, ano: +ano, servicos, gestao: ehGestao(u),
    resumo: { total, valorTotal, satisfacao, porColaborador: Object.values(porColaborador).sort((a, b) => b.qtd - a.qtd), porTipo: Object.entries(porTipo).map(([tipo, qtd]) => ({ tipo, qtd })).sort((a, b) => b.qtd - a.qtd) },
  });
});

router.post('/', (req, res) => {
  const u = req.usuario;
  const { tipo, cliente, valor, obs, comentario, paciente_id, termo_aceito, intercorrencia, retorno,
    resultado, produto, lote, validade, coo, crm, receita_data, receita_anexo } = req.body;
  if (!tipo || !tipo.trim()) return res.status(400).json({ erro: 'Informe o tipo de serviço.' });
  const colabId = (ehGestao(u) && req.body.colaborador_id) ? req.body.colaborador_id : u.id;
  const colab = db.prepare('SELECT nome, loja_id FROM colaboradores WHERE id=? AND empresa_id=?').get(colabId, u.empresa_id) || {};
  const lojaId = (ehGestao(u) && req.body.loja_id) ? req.body.loja_id : (colab.loja_id || u.loja_id || null);
  const lojaNome = lojaId ? db.prepare('SELECT nome FROM lojas WHERE id=?').get(lojaId)?.nome || null : null;
  const data = (req.body.data || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const pacNome = paciente_id ? (db.prepare('SELECT nome FROM pacientes_farmac WHERE id=?').get(paciente_id)?.nome || null) : ((cliente || '').trim() || null);
  const tx = v => (v || '').toString().trim() || null;
  const id = uuid();
  db.prepare(`INSERT INTO servicos_farmaceuticos (id,empresa_id,loja_id,loja_nome,colaborador_id,colaborador_nome,tipo,cliente,valor,obs,comentario,intercorrencia,resultado,produto,lote,validade,coo,crm,receita_data,receita_anexo,paciente_id,termo_aceito,termo_aceito_em,data,criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ${termo_aceito ? "datetime('now')" : 'NULL'}, ?,?)`)
    .run(id, u.empresa_id, lojaId, lojaNome, colabId, colab.nome || u.nome, tipo.trim(), tx(cliente), Number(valor) || 0, tx(obs), tx(comentario), tx(intercorrencia),
      tx(resultado), tx(produto), tx(lote), tx(validade), tx(coo), tx(crm), (receita_data || '').slice(0, 10) || null, (receita_anexo || '').slice(0, 1500000) || null,
      paciente_id || null, termo_aceito ? 1 : 0, data, u.id);
  // Marcar retorno → cria um agendamento
  if (retorno && String(retorno).slice(0, 10)) {
    db.prepare(`INSERT INTO agendamentos_farmac (id,empresa_id,loja_id,loja_nome,paciente_id,paciente_nome,colaborador_id,tipo,data,obs,status,servico_origem_id,criado_por)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'agendado', ?,?)`)
      .run(uuid(), u.empresa_id, lojaId, lojaNome, paciente_id || null, pacNome, colabId, tipo.trim(), String(retorno).slice(0, 10), 'Retorno do atendimento', id, u.id);
  }
  res.json({ ok: true, id });
});

// ── Agenda de atendimentos ───────────────────────────────────────────────────
router.get('/agenda', (req, res) => {
  const u = req.usuario;
  const lojaId = req.query.loja_id || (ehGestao(u) ? null : u.loja_id);
  const de = req.query.de || new Date().toISOString().slice(0, 10);
  const ate = req.query.ate || '2100-01-01';
  let sql = `SELECT a.*, COALESCE(p.telefone, '') AS telefone FROM agendamentos_farmac a
    LEFT JOIN pacientes_farmac p ON p.id=a.paciente_id
    WHERE a.empresa_id=? AND a.data BETWEEN ? AND ?`;
  const p = [u.empresa_id, de, ate];
  if (lojaId) { sql += ' AND (a.loja_id=? OR a.loja_id IS NULL)'; p.push(lojaId); }
  if (req.query.status) { sql += ' AND a.status=?'; p.push(req.query.status); }
  sql += " ORDER BY a.data, COALESCE(a.hora,'')";
  res.json({ agendamentos: db.prepare(sql).all(...p) });
});
router.post('/agenda', (req, res) => {
  const u = req.usuario; const b = req.body;
  if (!b.data) return res.status(400).json({ erro: 'Informe a data.' });
  const pac = b.paciente_id ? db.prepare('SELECT nome FROM pacientes_farmac WHERE id=?').get(b.paciente_id) : null;
  const lojaId = b.loja_id || u.loja_id || null;
  const lojaNome = lojaId ? db.prepare('SELECT nome FROM lojas WHERE id=?').get(lojaId)?.nome || null : null;
  db.prepare(`INSERT INTO agendamentos_farmac (id,empresa_id,loja_id,loja_nome,paciente_id,paciente_nome,colaborador_id,tipo,data,hora,obs,status,criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?, 'agendado', ?)`)
    .run(uuid(), u.empresa_id, lojaId, lojaNome, b.paciente_id || null, pac?.nome || (b.paciente_nome || '').trim() || null, u.id, (b.tipo || '').trim() || null, String(b.data).slice(0, 10), (b.hora || '').trim() || null, (b.obs || '').trim() || null, u.id);
  res.json({ ok: true });
});
router.patch('/agenda/:id', (req, res) => {
  const st = ['agendado', 'realizado', 'cancelado'].includes(req.body.status) ? req.body.status : null;
  if (!st) return res.status(400).json({ erro: 'Status inválido.' });
  db.prepare('UPDATE agendamentos_farmac SET status=? WHERE id=? AND empresa_id=?').run(st, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const u = req.usuario;
  const s = db.prepare('SELECT criado_por FROM servicos_farmaceuticos WHERE id=? AND empresa_id=?').get(req.params.id, u.empresa_id);
  if (!s) return res.status(404).json({ erro: 'Não encontrado.' });
  if (!ehGestao(u) && s.criado_por !== u.id) return res.status(403).json({ erro: 'Sem permissão.' });
  db.prepare('DELETE FROM servicos_farmaceuticos WHERE id=? AND empresa_id=?').run(req.params.id, u.empresa_id);
  res.json({ ok: true });
});

module.exports = router;
