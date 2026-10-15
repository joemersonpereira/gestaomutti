// autocadastro.js — o RH gera um link; o colaborador preenche os próprios dados e
// anexa documentos; o RH revisa e aprova, criando o colaborador.
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { cpfValido } = require('../lib/holerites');

const soDigitos = s => String(s || '').replace(/\D/g, '');
const RH = ['RH', 'Gestor Geral', 'Diretor Geral'];

// ══════════════ PÚBLICO (sem login) — o colaborador preenche ══════════════
router.get('/publico/:token', (req, res) => {
  const a = db.prepare(`SELECT a.status, a.convite_nome, a.nome, e.nome AS empresa FROM autocadastro a JOIN empresas e ON e.id=a.empresa_id WHERE a.token=?`).get(req.params.token);
  if (!a) return res.status(404).json({ erro: 'Link inválido.' });
  res.json({ empresa: a.empresa, convite_nome: a.convite_nome, status: a.status, ja_enviado: ['preenchido', 'aprovado'].includes(a.status) });
});

router.post('/publico/:token', (req, res) => {
  const a = db.prepare(`SELECT id, status FROM autocadastro WHERE token=?`).get(req.params.token);
  if (!a) return res.status(404).json({ erro: 'Link inválido.' });
  if (['aprovado'].includes(a.status)) return res.status(409).json({ erro: 'Este cadastro já foi aprovado.' });
  const b = req.body || {};
  if (!(b.nome || '').trim()) return res.status(400).json({ erro: 'Informe seu nome completo.' });
  const cpf = soDigitos(b.cpf);
  if (!cpfValido(cpf)) return res.status(400).json({ erro: 'Informe um CPF válido.' });
  const docs = Array.isArray(b.documentos) ? b.documentos.slice(0, 12) : [];

  // Campos extras (foto, contato de emergência, endereço detalhado, tamanhos, sobre mim,
  // dependentes, LGPD) guardados como JSON — aplicados na aprovação.
  const s = (v, n) => (v || '').toString().slice(0, n) || null;
  const extra = {
    apelido: s(b.apelido, 80), foto: b.foto ? String(b.foto).slice(0, 900000) : null,
    contato_emergencia_nome: s(b.contato_emergencia_nome, 120), contato_emergencia_telefone: s(b.contato_emergencia_telefone, 40),
    cep: s(b.cep, 12), endereco_numero: s(b.endereco_numero, 20), complemento: s(b.complemento, 80), bairro: s(b.bairro, 80), cidade: s(b.cidade, 80), uf: s(b.uf, 2),
    num_calcado: s(b.num_calcado, 10), tam_blusa: s(b.tam_blusa, 10), tam_calca: s(b.tam_calca, 10), tam_jaleco: s(b.tam_jaleco, 10),
    bio: s(b.bio, 500), presente_favorito: s(b.presente_favorito, 120), cores_favoritas: s(b.cores_favoritas, 120), estilo_musical: s(b.estilo_musical, 120), hobbies: s(b.hobbies, 160), time_coracao: s(b.time_coracao, 80),
    dependentes: Array.isArray(b.dependentes) ? b.dependentes.slice(0, 10) : [],
    lgpd: !!b.lgpd,
  };
  const tx = db.transaction(() => {
    db.prepare(`UPDATE autocadastro SET status='preenchido', nome=?, cpf=?, rg=?, nascimento=?, telefone=?, email=?, endereco=?, dados_extra=?, preenchido_em=datetime('now') WHERE id=?`)
      .run(String(b.nome).slice(0, 200), cpf, (b.rg || '').toString().slice(0, 40) || null, (b.nascimento || '').toString().slice(0, 10) || null,
        (b.telefone || '').toString().slice(0, 40) || null, (b.email || '').toString().slice(0, 160).toLowerCase() || null,
        (b.endereco || '').toString().slice(0, 500) || null, JSON.stringify(extra).slice(0, 12_000_000), a.id);
    db.prepare(`DELETE FROM autocadastro_docs WHERE autocadastro_id=?`).run(a.id);
    const ins = db.prepare(`INSERT INTO autocadastro_docs (id,autocadastro_id,tipo,nome,mime,dados,criado_em) VALUES (?,?,?,?,?,?,datetime('now'))`);
    docs.forEach(d => { if (d && d.dados) ins.run(uuidv4(), a.id, (d.tipo || '').toString().slice(0, 80) || null, (d.nome || 'documento').toString().slice(0, 120), (d.mime || '').toString().slice(0, 60), String(d.dados).slice(0, 8_000_000)); });
  });
  tx();
  res.status(201).json({ ok: true, mensagem: 'Cadastro enviado! O RH vai conferir seus dados. 💚' });
});

// ══════════════ RH (com login) ══════════════
router.use(auth);

// Gera um novo link.
router.post('/', exigePerfil(...RH), (req, res) => {
  const token = crypto.randomBytes(18).toString('base64url');
  const id = uuidv4();
  db.prepare(`INSERT INTO autocadastro (id,empresa_id,token,status,funcao_id,loja_id,convite_nome,criado_por,criado_em) VALUES (?,?,?,'aguardando',?,?,?,?,datetime('now'))`)
    .run(id, req.usuario.empresa_id, token, req.body.funcao_id || null, req.body.loja_id || null, (req.body.convite_nome || '').toString().slice(0, 120) || null, req.usuario.id);
  res.status(201).json({ ok: true, id, token });
});

// Lista os auto-cadastros.
router.get('/', exigePerfil(...RH), (req, res) => {
  const rows = db.prepare(`SELECT a.id, a.token, a.status, a.convite_nome, a.nome, a.cpf, a.criado_em, a.preenchido_em,
      (SELECT COUNT(*) FROM autocadastro_docs d WHERE d.autocadastro_id=a.id) docs,
      f.nome funcao, l.nome loja
    FROM autocadastro a LEFT JOIN funcoes f ON f.id=a.funcao_id LEFT JOIN lojas l ON l.id=a.loja_id
    WHERE a.empresa_id=? AND a.status<>'aprovado' ORDER BY (a.status='preenchido') DESC, a.criado_em DESC LIMIT 100`).all(req.usuario.empresa_id);
  res.json({ itens: rows });
});

// Detalhe (dados + docs).
router.get('/:id', exigePerfil(...RH), (req, res) => {
  const a = db.prepare(`SELECT * FROM autocadastro WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!a) return res.status(404).json({ erro: 'Não encontrado.' });
  const docs = db.prepare(`SELECT id, nome, mime FROM autocadastro_docs WHERE autocadastro_id=?`).all(a.id);
  delete a.token;
  res.json({ ...a, documentos: docs });
});

router.get('/:id/doc/:docId', exigePerfil(...RH), (req, res) => {
  const a = db.prepare(`SELECT id FROM autocadastro WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!a) return res.status(404).end();
  const d = db.prepare(`SELECT nome, mime, dados FROM autocadastro_docs WHERE id=? AND autocadastro_id=?`).get(req.params.docId, a.id);
  if (!d || !d.dados) return res.status(404).end();
  res.setHeader('Content-Type', d.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${(d.nome || 'documento').replace(/[^\w .-]/g, '_')}"`);
  res.send(Buffer.from(String(d.dados).replace(/^data:.*;base64,/, ''), 'base64'));
});

// Aprova → cria o colaborador (RH define função/loja) e aplica os dados que a pessoa preencheu.
router.post('/:id/aprovar', exigePerfil(...RH), async (req, res) => {
  const a = db.prepare(`SELECT * FROM autocadastro WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!a) return res.status(404).json({ erro: 'Não encontrado.' });
  if (a.status === 'aprovado') return res.status(409).json({ erro: 'Já aprovado.' });
  const funcaoId = req.body.funcao_id || a.funcao_id;
  const lojaId = req.body.loja_id || a.loja_id;
  if (!funcaoId || !lojaId) return res.status(400).json({ erro: 'Defina a função e a loja para aprovar.' });
  if (!a.nome || !a.cpf) return res.status(400).json({ erro: 'O colaborador ainda não preencheu os dados.' });
  // evita duplicar por CPF
  const jaCpf = db.prepare(`SELECT id FROM colaboradores WHERE cpf=? AND cpf<>''`).get(a.cpf);
  if (jaCpf) return res.status(409).json({ erro: 'Já existe um colaborador com esse CPF.' });
  const email = (a.email && a.email.includes('@')) ? a.email : `cad-${a.cpf}@grupomutti.local`;
  const colabId = uuidv4();
  const senhaProv = Math.random().toString(36).slice(2, 8).toUpperCase();
  const hash = bcrypt.hashSync(senhaProv, 8);
  let ex = {}; try { ex = JSON.parse(a.dados_extra || '{}'); } catch { ex = {}; }
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO colaboradores (id,empresa_id,loja_id,funcao_id,departamento,situacao,nome,cpf,email,telefone,nascimento,salario,senha_hash,senha_provisoria,ativo,admissao,criado_em)
      VALUES (?,?,?,?,?, 'ativo', ?,?,?,?,?,0,?,1,1, COALESCE(?, date('now')), datetime('now'))`)
      .run(colabId, req.usuario.empresa_id, lojaId, funcaoId, null, a.nome, a.cpf, email, a.telefone || null, a.nascimento || null, hash, req.body.admissao || null);
    // Aplica os extras que a pessoa preencheu
    db.prepare(`UPDATE colaboradores SET apelido=?, foto=?, contato_emergencia_nome=?, contato_emergencia_telefone=?, endereco=?,
        cep=?, endereco_numero=?, complemento=?, bairro=?, cidade=?, uf=?, num_calcado=?, tam_blusa=?, tam_calca=?, tam_jaleco=?,
        bio=?, presente_favorito=?, cores_favoritas=?, estilo_musical=?, hobbies=?, time_coracao=? WHERE id=?`)
      .run(ex.apelido || null, ex.foto || null, ex.contato_emergencia_nome || null, ex.contato_emergencia_telefone || null, a.endereco || null,
        ex.cep || null, ex.endereco_numero || null, ex.complemento || null, ex.bairro || null, ex.cidade || null, ex.uf || null,
        ex.num_calcado || null, ex.tam_blusa || null, ex.tam_calca || null, ex.tam_jaleco || null,
        ex.bio || null, ex.presente_favorito || null, ex.cores_favoritas || null, ex.estilo_musical || null, ex.hobbies || null, ex.time_coracao || null, colabId);
    // Dependentes (filhos e pets)
    (ex.dependentes || []).filter(d => String(d.nome || '').trim()).forEach(d => {
      db.prepare(`INSERT INTO dependentes (id,empresa_id,colaborador_id,tipo,especie,nome,apelido,nascimento,foto,criado_em)
        VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`)
        .run(uuidv4(), req.usuario.empresa_id, colabId, d.tipo === 'pet' ? 'pet' : 'filho', d.tipo === 'pet' ? (d.especie || 'outro') : null,
          String(d.nome).slice(0, 120), (d.apelido || '').toString().slice(0, 80) || null, d.nascimento || null, (d.foto || '').toString().slice(0, 900000) || null);
    });
    // Copia os documentos anexados para a ficha do colaborador
    db.prepare(`SELECT tipo, nome, mime, dados FROM autocadastro_docs WHERE autocadastro_id=?`).all(a.id).forEach(doc => {
      db.prepare(`INSERT INTO colaborador_docs (id,empresa_id,colaborador_id,tipo,nome,mime,dados,criado_em) VALUES (?,?,?,?,?,?,?,datetime('now'))`)
        .run(uuidv4(), req.usuario.empresa_id, colabId, doc.tipo || null, doc.nome || 'documento', doc.mime || null, doc.dados);
    });
    db.prepare(`UPDATE autocadastro SET status='aprovado', funcao_id=?, loja_id=?, aprovado_por=?, aprovado_em=datetime('now'), colaborador_id=? WHERE id=?`)
      .run(funcaoId, lojaId, req.usuario.id, colabId, a.id);
  });
  tx();
  // Consentimento LGPD que a pessoa marcou (gera termo em Meus Documentos)
  if (ex.lgpd) { try { const c = db.prepare('SELECT * FROM colaboradores WHERE id=?').get(colabId); const { registrarConsentimentoLgpd } = require('./colaboradores'); await registrarConsentimentoLgpd(req.usuario.empresa_id, c, req.ip, req.usuario.nome); } catch (e) { console.error('[autocadastro] LGPD:', e.message); } }
  res.json({ ok: true, colaborador_id: colabId, email, senha_provisoria: senhaProv });
});

router.post('/:id/rejeitar', exigePerfil(...RH), (req, res) => {
  db.prepare(`UPDATE autocadastro SET status='rejeitado', obs=?, aprovado_por=?, aprovado_em=datetime('now') WHERE id=? AND empresa_id=?`)
    .run((req.body.obs || '').toString().slice(0, 300) || null, req.usuario.id, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

router.delete('/:id', exigePerfil(...RH), (req, res) => {
  db.prepare(`DELETE FROM autocadastro_docs WHERE autocadastro_id=?`).run(req.params.id);
  db.prepare(`DELETE FROM autocadastro WHERE id=? AND empresa_id=?`).run(req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

module.exports = router;
