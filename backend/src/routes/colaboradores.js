const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');
const syncErp = require('../lib/syncColaboradoresErp');

router.use(auth);

// Garante a tabela de lojas adicionais do colaborador (multi-loja) mesmo em bancos já existentes.
db.exec(`CREATE TABLE IF NOT EXISTS colaborador_lojas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL, loja_id TEXT NOT NULL,
  UNIQUE(colaborador_id, loja_id)
);`);
try { db.exec(`ALTER TABLE colaboradores ADD COLUMN lideranca INTEGER DEFAULT 0`); } catch (e) { /* já existe */ }
try { db.exec(`ALTER TABLE afastamentos ADD COLUMN substituto_id TEXT`); } catch (e) { /* já existe */ }
try {
  const emps = db.prepare(`SELECT id FROM empresas`).all();
  const insF = db.prepare(`INSERT OR IGNORE INTO funcoes (id,empresa_id,nome,tem_checklist,tem_avaliacao,tem_meta,ativa,escritorio) VALUES ('func-subgerente',?,?,1,1,0,1,0)`);
  emps.forEach(e => { try { insF.run(e.id, 'Subgerente'); } catch (err) { /* ok */ } });
} catch (e) { /* ok */ }

// Substitui as lojas adicionais (extras) de um colaborador
function salvarLojasExtra(empresaId, colabId, lojaSede, lojas) {
  db.prepare(`DELETE FROM colaborador_lojas WHERE colaborador_id=?`).run(colabId);
  if (!Array.isArray(lojas)) return;
  const ins = db.prepare(`INSERT OR IGNORE INTO colaborador_lojas (id,empresa_id,colaborador_id,loja_id) VALUES (?,?,?,?)`);
  lojas.filter(l => l && l !== lojaSede).forEach(l => ins.run(uuidv4(), empresaId, colabId, l));
}

// Cria/vincula a ficha de estágio quando o colaborador é marcado "é estagiário".
// Não duplica os ~25 campos de estágio: só semeia o básico (nome/cpf/loja) e deixa
// o resto para o módulo Estágios completar. Reversível: desmarcar não apaga a ficha.
function syncEstagiario(empresaId, colabId) {
  const c = db.prepare('SELECT nome, cpf, loja_id FROM colaboradores WHERE id=?').get(colabId);
  if (!c) return;
  const ja = db.prepare('SELECT id FROM estagio_ficha WHERE colaborador_id=?').get(colabId);
  if (ja) {
    // mantém nome/cpf/loja em dia com o cadastro geral
    db.prepare(`UPDATE estagio_ficha SET nome=?, cpf=?, loja=?, atualizado_em=datetime('now') WHERE id=?`)
      .run(c.nome, c.cpf || '', c.loja_id, ja.id);
    return;
  }
  db.prepare(`INSERT INTO estagio_ficha (id,empresa_id,nome,cpf,loja,status,origem,colaborador_id,criado_em,atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
    .run(uuidv4(), empresaId, c.nome, c.cpf || '', c.loja_id, 'ativo', 'colaborador', colabId);
}

// GET /colaboradores — lista da empresa
router.get('/', (req, res) => {
  const { loja_id, funcao_id } = req.query;
  let q = `
    SELECT c.id, c.nome, c.email, c.cpf, c.salario, c.admissao, c.nascimento, c.ativo, c.senha_provisoria, c.chefe_setor, c.lideranca, c.conferente, c.is_estagiario, c.is_socio,
      f.nome as funcao, l.nome as loja, c.loja_id, c.funcao_id, c.departamento, c.empresa_registro, c.empresa_atuacao,
      c.telefone, c.endereco, c.apelido, c.contato_emergencia_nome, c.contato_emergencia_telefone, (c.foto IS NOT NULL) as tem_foto,
      c.cep, c.endereco_numero, c.complemento, c.bairro, c.cidade, c.uf, c.num_calcado, c.tam_blusa, c.tam_calca, c.tam_jaleco, c.inicio_loja,
      c.lgpd_consentido, c.lgpd_consentido_em, c.tangerino_id, c.tangerino_nome,
      (SELECT COUNT(*) FROM dependentes WHERE colaborador_id=c.id) as n_dependentes,
      (SELECT group_concat(loja_id) FROM colaborador_lojas WHERE colaborador_id = c.id) as lojas_extra
    FROM colaboradores c
    JOIN funcoes f ON f.id = c.funcao_id
    JOIN lojas l ON l.id = c.loja_id
    WHERE c.empresa_id = ?
  `;
  const params = [req.usuario.empresa_id];
  if (loja_id) { q += ' AND c.loja_id = ?'; params.push(loja_id); }
  if (funcao_id) { q += ' AND c.funcao_id = ?'; params.push(funcao_id); }
  q += ' ORDER BY c.nome';
  res.json({ colaboradores: db.prepare(q).all(...params) });
});

// GET /colaboradores/sync-alpha — PRÉVIA da varredura com o Alpha 7 (não altera nada)
router.get('/sync-alpha', exigePerfil('Gestor Geral', 'Diretor Geral', 'RH'), async (req, res) => {
  try { res.json(await syncErp.prever(req.usuario.empresa_id)); }
  catch (e) { res.status(503).json({ erro: 'ERP indisponível para a varredura.', detalhe: String(e.message || e) }); }
});
// POST /colaboradores/sync-alpha/aplicar — aplica (desativa inativos do ERP; reativar opcional)
router.post('/sync-alpha/aplicar', exigePerfil('Gestor Geral', 'Diretor Geral', 'RH'), async (req, res) => {
  try { res.json(await syncErp.aplicar(req.usuario.empresa_id, { reativar: !!req.body.reativar })); }
  catch (e) { res.status(503).json({ erro: 'ERP indisponível para a varredura.', detalhe: String(e.message || e) }); }
});

// POST /colaboradores/sync-alpha/importar — cria quem está ativo no ERP e não existe no app (INATIVO, sem login)
router.post('/sync-alpha/importar', exigePerfil('Gestor Geral', 'Diretor Geral', 'RH'), async (req, res) => {
  try { res.json(await syncErp.importar(req.usuario.empresa_id)); }
  catch (e) { res.status(503).json({ erro: 'ERP indisponível para a importação.', detalhe: String(e.message || e) }); }
});

// POST /colaboradores — cadastrar novo
router.post('/', exigePerfil('Gestor Geral', 'Diretor Geral', 'RH'), (req, res) => {
  const { nome, email, cpf, funcao_id, loja_id, departamento, salario, admissao, chefe_setor } = req.body;
  if (!nome || !email || !funcao_id || !loja_id) {
    return res.status(400).json({ erro: 'Nome, e-mail, função e loja obrigatórios.' });
  }
  const existe = db.prepare('SELECT id FROM colaboradores WHERE email = ?').get(email);
  if (existe) return res.status(400).json({ erro: 'E-mail já cadastrado.' });

  // Senha inicial: o RH pode definir uma no cadastro; senão usa o padrão. O colaborador troca no 1º acesso.
  const senhaInformada = String(req.body.senha || '').trim();
  if (senhaInformada && senhaInformada.length < 4) return res.status(400).json({ erro: 'A senha precisa ter ao menos 4 caracteres.' });
  const senhaProvisoria = senhaInformada || '12345';
  const hash = bcrypt.hashSync(senhaProvisoria, 10);
  const id = uuidv4();

  db.prepare(`
    INSERT INTO colaboradores (id,empresa_id,loja_id,funcao_id,departamento,nome,email,cpf,salario,senha_hash,senha_provisoria,ativo,admissao,nascimento,chefe_setor,empresa_registro,empresa_atuacao)
    VALUES (?,?,?,?,?,?,?,?,?,?,1,1,?,?,?,?,?)
  `).run(id, req.usuario.empresa_id, loja_id, funcao_id, departamento || null, nome, email.toLowerCase(), cpf || '', salario || 0, hash, admissao || null, req.body.nascimento || null, chefe_setor ? 1 : 0, req.body.empresa_registro || null, req.body.empresa_atuacao || null);

  salvarLojasExtra(req.usuario.empresa_id, id, loja_id, req.body.lojas_extra);
  if (req.body.lideranca) db.prepare(`UPDATE colaboradores SET lideranca=1 WHERE id=?`).run(id);
  if (req.body.conferente) db.prepare(`UPDATE colaboradores SET conferente=1 WHERE id=?`).run(id);
  if (req.body.inicio_loja) db.prepare(`UPDATE colaboradores SET inicio_loja=? WHERE id=?`).run(String(req.body.inicio_loja).slice(0, 10), id);
  // Dados pessoais (telefone, endereço, contato de emergência, apelido, foto)
  db.prepare(`UPDATE colaboradores SET telefone=?, endereco=?, apelido=?, contato_emergencia_nome=?, contato_emergencia_telefone=?, foto=?,
      cep=?, endereco_numero=?, complemento=?, bairro=?, cidade=?, uf=?, num_calcado=?, tam_blusa=?, tam_calca=?, tam_jaleco=?,
      bio=?, presente_favorito=?, cores_favoritas=?, estilo_musical=?, hobbies=?, time_coracao=? WHERE id=?`)
    .run(req.body.telefone || null, req.body.endereco || null, req.body.apelido || null, req.body.contato_emergencia_nome || null,
      req.body.contato_emergencia_telefone || null, (req.body.foto || '').toString().slice(0, 900000) || null,
      req.body.cep || null, req.body.endereco_numero || null, req.body.complemento || null, req.body.bairro || null, req.body.cidade || null, req.body.uf || null,
      req.body.num_calcado || null, req.body.tam_blusa || null, req.body.tam_calca || null, req.body.tam_jaleco || null,
      (req.body.bio || '').toString().slice(0, 500) || null, req.body.presente_favorito || null, req.body.cores_favoritas || null,
      req.body.estilo_musical || null, req.body.hobbies || null, req.body.time_coracao || null, id);
  // Dependentes (filhos e pets) informados no cadastro
  if (Array.isArray(req.body.dependentes)) req.body.dependentes.filter(d => String(d.nome || '').trim()).forEach(d => inserirDependente(req.usuario.empresa_id, id, d));
  if (req.body.is_estagiario) { db.prepare(`UPDATE colaboradores SET is_estagiario=1 WHERE id=?`).run(id); syncEstagiario(req.usuario.empresa_id, id); }
  if (req.body.is_socio) db.prepare(`UPDATE colaboradores SET is_socio=1 WHERE id=?`).run(id);

  res.status(201).json({
    mensagem: 'Colaborador cadastrado.',
    id,
    senha_provisoria: senhaProvisoria,
    aviso: `Envie por e-mail para ${email}: senha provisória ${senhaProvisoria}`
  });
});

// PATCH /colaboradores/:id — edita informações do colaborador
router.patch('/:id', exigePerfil('Gestor Geral', 'Diretor Geral', 'RH'), (req, res) => {
  const c = db.prepare('SELECT * FROM colaboradores WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!c) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  const { nome, email, cpf, funcao_id, loja_id, departamento, salario, admissao, nascimento } = req.body;
  if (email && email.toLowerCase() !== (c.email || '').toLowerCase()) {
    const existe = db.prepare('SELECT id FROM colaboradores WHERE email=? AND id<>?').get(email.toLowerCase(), c.id);
    if (existe) return res.status(400).json({ erro: 'E-mail já usado por outro colaborador.' });
  }
  db.prepare(`UPDATE colaboradores SET nome=?, email=?, cpf=?, funcao_id=?, loja_id=?, departamento=?, salario=?, admissao=?, nascimento=?, empresa_registro=?, empresa_atuacao=? WHERE id=?`)
    .run(
      nome ?? c.nome, ((email ?? c.email) || '').toLowerCase(), cpf ?? c.cpf, funcao_id ?? c.funcao_id, loja_id ?? c.loja_id,
      departamento ?? c.departamento, salario != null ? Number(salario) || 0 : c.salario, admissao ?? c.admissao, nascimento ?? c.nascimento,
      req.body.empresa_registro !== undefined ? req.body.empresa_registro : c.empresa_registro,
      req.body.empresa_atuacao !== undefined ? req.body.empresa_atuacao : c.empresa_atuacao, c.id
    );
  if (req.body.lojas_extra !== undefined) salvarLojasExtra(req.usuario.empresa_id, c.id, loja_id ?? c.loja_id, req.body.lojas_extra);
  if (req.body.lideranca !== undefined) db.prepare(`UPDATE colaboradores SET lideranca=? WHERE id=?`).run(req.body.lideranca ? 1 : 0, c.id);
  if (req.body.conferente !== undefined) db.prepare(`UPDATE colaboradores SET conferente=? WHERE id=?`).run(req.body.conferente ? 1 : 0, c.id);
  if (req.body.inicio_loja !== undefined) db.prepare(`UPDATE colaboradores SET inicio_loja=? WHERE id=?`).run(req.body.inicio_loja ? String(req.body.inicio_loja).slice(0, 10) : null, c.id);
  ['telefone', 'endereco', 'apelido', 'contato_emergencia_nome', 'contato_emergencia_telefone', 'foto',
    'cep', 'endereco_numero', 'complemento', 'bairro', 'cidade', 'uf', 'num_calcado', 'tam_blusa', 'tam_calca', 'tam_jaleco',
    'bio', 'presente_favorito', 'cores_favoritas', 'estilo_musical', 'hobbies', 'time_coracao'].forEach(campo => {
    if (req.body[campo] !== undefined) db.prepare(`UPDATE colaboradores SET ${campo}=? WHERE id=?`).run((campo === 'foto' ? String(req.body[campo] || '').slice(0, 900000) : req.body[campo]) || null, c.id);
  });
  if (req.body.is_estagiario !== undefined) {
    db.prepare(`UPDATE colaboradores SET is_estagiario=? WHERE id=?`).run(req.body.is_estagiario ? 1 : 0, c.id);
    if (req.body.is_estagiario) syncEstagiario(req.usuario.empresa_id, c.id);
  }
  if (req.body.is_socio !== undefined) db.prepare(`UPDATE colaboradores SET is_socio=? WHERE id=?`).run(req.body.is_socio ? 1 : 0, c.id);
  res.json({ mensagem: 'Colaborador atualizado.' });
});

// PATCH /colaboradores/:id/resetar-senha — volta para a senha padrão (troca no próximo acesso)
router.patch('/:id/resetar-senha', exigePerfil('Gestor Geral', 'Diretor Geral', 'RH'), (req, res) => {
  const c = db.prepare('SELECT id FROM colaboradores WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!c) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  const senhaPadrao = '12345';
  const hash = bcrypt.hashSync(senhaPadrao, 10);
  db.prepare('UPDATE colaboradores SET senha_hash=?, senha_provisoria=1 WHERE id=?').run(hash, c.id);
  res.json({ mensagem: `Senha redefinida para ${senhaPadrao}. O colaborador troca no próximo acesso.`, senha: senhaPadrao });
});

// PATCH /colaboradores/:id/chefe-setor — marca/desmarca chefe do setor
router.patch('/:id/chefe-setor', exigePerfil('Gestor Geral', 'Diretor Geral', 'RH'), (req, res) => {
  const r = db.prepare('UPDATE colaboradores SET chefe_setor = ? WHERE id = ? AND empresa_id = ?')
    .run(req.body.chefe_setor ? 1 : 0, req.params.id, req.usuario.empresa_id);
  if (!r.changes) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  res.json({ mensagem: req.body.chefe_setor ? 'Marcado como chefe do setor.' : 'Removido de chefe do setor.' });
});

// PATCH /colaboradores/:id/ativar
router.patch('/:id/ativar', exigePerfil('Gestor Geral', 'Diretor Geral', 'RH'), (req, res) => {
  const { ativo } = req.body;
  db.prepare('UPDATE colaboradores SET ativo = ? WHERE id = ? AND empresa_id = ?')
    .run(ativo ? 1 : 0, req.params.id, req.usuario.empresa_id);
  res.json({ mensagem: 'Status atualizado.' });
});

// ─── OCORRÊNCIAS ──────────────────────────────────────────────────────────────

// GET /colaboradores/:id/ocorrencias
router.get('/:id/ocorrencias', (req, res) => {
  const podeVer =
    req.params.id === req.usuario.id ||
    ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'RH', 'Gerente'].includes(req.usuario.funcao_nome);
  if (!podeVer) return res.status(403).json({ erro: 'Sem permissão.' });

  const ocorr = db.prepare(`
    SELECT o.*, c.nome as lancado_por_nome
    FROM ocorrencias o
    LEFT JOIN colaboradores c ON c.id = o.lancado_por_id
    WHERE o.colaborador_id = ? AND o.empresa_id = ?
    ORDER BY o.criado_em DESC
  `).all(req.params.id, req.usuario.empresa_id);

  // Calcula nota do indicador Conduta Profissional
  const deducoes = { atraso: 10, advertencia_verbal: 20, advertencia_escrita: 40, suspensao: 100 };
  const pontos_deduzidos = ocorr
    .filter(o => o.status !== 'aceito')
    .reduce((a, o) => a + Math.abs(o.pontos_deduzidos), 0);
  const nota_conduta = Math.max(0, 100 - pontos_deduzidos);

  res.json({ ocorrencias: ocorr, nota_conduta });
});

// POST /colaboradores/:id/ocorrencias — RH lança ocorrência
router.post('/:id/ocorrencias', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { tipo, descricao, data_ocorrencia } = req.body;
  if (!tipo || !descricao) return res.status(400).json({ erro: 'Tipo e descrição obrigatórios.' });

  const deducoes = { atraso: 10, advertencia_verbal: 20, advertencia_escrita: 40, suspensao: 100 };
  const pontos = deducoes[tipo] || 10;

  const id = uuidv4();
  db.prepare(`
    INSERT INTO ocorrencias (id,empresa_id,colaborador_id,lancado_por_id,tipo,descricao,pontos_deduzidos,status,data_ocorrencia,criado_em)
    VALUES (?,?,?,?,?,?,?,'pendente',?,datetime('now'))
  `).run(id, req.usuario.empresa_id, req.params.id, req.usuario.id, tipo, descricao, pontos, data_ocorrencia || null);

  // Gera notificação de ciência para o colaborador
  gerarTarefa({
    empresa_id: req.usuario.empresa_id,
    loja_id: req.usuario.loja_id,
    tipo: 'notificacao',
    origem: 'rh',
    titulo: `Ocorrência registrada — ${tipo.replace('_', ' ')}`,
    descricao,
    responsavel_id: req.params.id,
    sla_horas: 24,
    criado_por: req.usuario.id,
  });

  res.status(201).json({ mensagem: 'Ocorrência registrada. Notificação enviada ao colaborador.', id, pontos_deduzidos: pontos });
});

// POST /colaboradores/:id/ocorrencias/:ocorrId/contestar
router.post('/:id/ocorrencias/:ocorrId/contestar', (req, res) => {
  if (req.params.id !== req.usuario.id) return res.status(403).json({ erro: 'Sem permissão.' });
  const { justificativa } = req.body;
  if (!justificativa) return res.status(400).json({ erro: 'Justificativa obrigatória.' });

  const ocorr = db.prepare('SELECT * FROM ocorrencias WHERE id = ? AND colaborador_id = ?')
    .get(req.params.ocorrId, req.usuario.id);
  if (!ocorr) return res.status(404).json({ erro: 'Ocorrência não encontrada.' });
  if (ocorr.status !== 'pendente') return res.status(400).json({ erro: 'Só é possível contestar ocorrências pendentes.' });

  db.prepare(`UPDATE ocorrencias SET status = 'contestado', contestacao = ? WHERE id = ?`)
    .run(justificativa, req.params.ocorrId);

  // Gera tarefa para o RH analisar
  const rh = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id = ? AND funcao_id = 'func-rh' AND ativo = 1 LIMIT 1`)
    .get(req.usuario.empresa_id);
  if (rh) {
    gerarTarefa({
      empresa_id: req.usuario.empresa_id,
      loja_id: req.usuario.loja_id,
      tipo: 'tarefa',
      origem: 'rh',
      titulo: `Contestação de ocorrência — ${req.usuario.nome}`,
      descricao: `Justificativa: ${justificativa}`,
      responsavel_id: rh.id,
      sla_horas: 120,
      criado_por: req.usuario.id,
    });
  }

  res.json({ mensagem: 'Contestação enviada. RH irá analisar.' });
});

// PATCH /colaboradores/:id/ocorrencias/:ocorrId/analisar — RH decide
router.patch('/:id/ocorrencias/:ocorrId/analisar', exigePerfil('RH', 'Gestor Geral'), (req, res) => {
  const { decisao, resposta } = req.body;
  if (!['aceito', 'mantido'].includes(decisao)) return res.status(400).json({ erro: 'Decisão inválida.' });

  db.prepare(`UPDATE ocorrencias SET status = ?, resposta_rh = ? WHERE id = ? AND empresa_id = ?`)
    .run(decisao, resposta || '', req.params.ocorrId, req.usuario.empresa_id);

  res.json({ mensagem: `Contestação ${decisao}.` });
});

// ─── MOVIMENTAÇÕES ────────────────────────────────────────────────────────────

// GET /colaboradores/:id/movimentacoes
router.get('/:id/movimentacoes', (req, res) => {
  const podeVer = req.params.id === req.usuario.id ||
    ['RH', 'Gestor Geral', 'Diretor Geral', 'Supervisor'].includes(req.usuario.funcao_nome);
  if (!podeVer) return res.status(403).json({ erro: 'Sem permissão.' });

  const movs = db.prepare(`
    SELECT m.*,
      lo.nome as loja_origem_nome,
      ld.nome as loja_destino_nome,
      c.nome as lancado_por_nome
    FROM movimentacoes m
    LEFT JOIN lojas lo ON lo.id = m.loja_origem_id
    LEFT JOIN lojas ld ON ld.id = m.loja_destino_id
    LEFT JOIN colaboradores c ON c.id = m.lancado_por_id
    WHERE m.colaborador_id = ? AND m.empresa_id = ?
    ORDER BY m.criado_em DESC
  `).all(req.params.id, req.usuario.empresa_id);

  res.json({ movimentacoes: movs });
});

// POST /colaboradores/:id/movimentacoes — RH lança
router.post('/:id/movimentacoes', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { tipo, loja_origem_id, loja_destino_id, turno_origem, turno_destino, data_inicio, data_fim, tipo_transferencia, motivo } = req.body;
  if (!tipo || !data_inicio) return res.status(400).json({ erro: 'Tipo e data de início obrigatórios.' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO movimentacoes (id,empresa_id,colaborador_id,lancado_por_id,tipo,loja_origem_id,loja_destino_id,turno_origem,turno_destino,data_inicio,data_fim,tipo_transferencia,motivo,status,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pendente',datetime('now'))
  `).run(id, req.usuario.empresa_id, req.params.id, req.usuario.id, tipo, loja_origem_id || null, loja_destino_id || null, turno_origem || null, turno_destino || null, data_inicio, data_fim || null, tipo_transferencia || 'definitiva', motivo || '');

  // Gera notificação de ciência (prazo 5 dias = 120h)
  gerarTarefa({
    empresa_id: req.usuario.empresa_id,
    loja_id: req.usuario.loja_id,
    tipo: 'notificacao',
    origem: 'rh',
    titulo: tipo === 'transferencia' ? 'Ciência — Transferência de loja' : 'Ciência — Troca de turno',
    descricao: motivo || 'Movimentação registrada pelo RH.',
    responsavel_id: req.params.id,
    sla_horas: 120,
    criado_por: req.usuario.id,
  });

  res.status(201).json({ mensagem: 'Movimentação registrada. Notificação enviada.', id });
});

// POST /colaboradores/:id/movimentacoes/:movId/ciencia
router.post('/:id/movimentacoes/:movId/ciencia', (req, res) => {
  if (req.params.id !== req.usuario.id) return res.status(403).json({ erro: 'Sem permissão.' });
  const mov = db.prepare(`SELECT * FROM movimentacoes WHERE id=? AND colaborador_id=?`).get(req.params.movId, req.usuario.id);
  if (!mov) return res.status(404).json({ erro: 'Movimentação não encontrada.' });
  db.prepare(`UPDATE movimentacoes SET status = 'confirmado', ciencia_em = datetime('now') WHERE id = ?`).run(mov.id);
  // Transferência definitiva: move o colaborador para a loja destino (passa a valer as metas de lá)
  let moveu = false;
  if (mov.tipo === 'transferencia' && (mov.tipo_transferencia || 'definitiva') === 'definitiva' && mov.loja_destino_id) {
    db.prepare(`UPDATE colaboradores SET loja_id=? WHERE id=?`).run(mov.loja_destino_id, req.usuario.id);
    moveu = true;
  }
  res.json({ mensagem: 'Ciência confirmada.' + (moveu ? ' Você agora está na nova loja.' : '') });
});

// ── Afastamentos e férias ──
// GET /colaboradores/:id/afastamentos
router.get('/:id/afastamentos', (req, res) => {
  const rows = db.prepare(`SELECT a.*, lp.nome as lancado_por_nome, sub.nome as substituto_nome FROM afastamentos a
    LEFT JOIN colaboradores lp ON lp.id=a.lancado_por_id
    LEFT JOIN colaboradores sub ON sub.id=a.substituto_id
    WHERE a.empresa_id=? AND a.colaborador_id=? ORDER BY a.data_inicio DESC`).all(req.usuario.empresa_id, req.params.id);
  res.json({ afastamentos: rows });
});

// POST /colaboradores/:id/afastamentos — RH lança afastamento/férias
router.post('/:id/afastamentos', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { tipo, data_inicio, data_fim, motivo, substituto_id, turno } = req.body;
  if (!['afastamento', 'ferias'].includes(tipo)) return res.status(400).json({ erro: 'Tipo deve ser afastamento ou ferias.' });
  if (!data_inicio) return res.status(400).json({ erro: 'Data de início obrigatória.' });

  const alvo = db.prepare(`SELECT c.id, c.loja_id, f.nome as funcao_nome, f.escritorio FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.id=? AND c.empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!alvo) return res.status(404).json({ erro: 'Colaborador não encontrado.' });

  // Gerente, subgerente ou administrativo (escritório): substituto é obrigatório (pra onde vão as tarefas no período).
  const exigeSub = ['Gerente', 'Subgerente'].includes(alvo.funcao_nome) || alvo.escritorio;
  if (exigeSub && !substituto_id) {
    let candidatos;
    if (['Gerente', 'Subgerente'].includes(alvo.funcao_nome)) {
      candidatos = db.prepare(`SELECT id, nome FROM colaboradores WHERE empresa_id=? AND loja_id=? AND lideranca=1 AND ativo=1 AND id!=? ORDER BY nome`).all(req.usuario.empresa_id, alvo.loja_id, alvo.id);
    } else {
      candidatos = db.prepare(`SELECT c.id, c.nome FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND f.escritorio=1 AND c.ativo=1 AND c.id!=? ORDER BY c.nome`).all(req.usuario.empresa_id, alvo.id);
    }
    return res.status(400).json({ precisa_substituto: true, candidatos, erro: 'Designe um substituto para o período (as tarefas serão direcionadas a ele).' });
  }

  const id = uuidv4();
  db.prepare(`INSERT INTO afastamentos (id,empresa_id,colaborador_id,lancado_por_id,tipo,data_inicio,data_fim,motivo,substituto_id,turno)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, req.usuario.empresa_id, req.params.id, req.usuario.id, tipo, data_inicio, data_fim || null, motivo || '', substituto_id || null, turno || null);

  // Empurra o afastamento/férias/atestado para o Tangerino (abono no banco de horas), se houver vínculo.
  require('../lib/afastamentoSync').push(req.usuario.empresa_id, req.params.id, tipo, data_inicio, data_fim)
    .then(r => { if (r && r.ok) console.log(`[afastamento→tangerino] ${req.params.id} tipo ${tipo} motivo ${r.reasonId} OK`); else if (r && r.erro) console.error('[afastamento→tangerino]', r.erro); })
    .catch(() => {});

  // Avisa o substituto: ciência com loja + turno + período que ele cobrirá.
  if (substituto_id) {
    const loja = db.prepare(`SELECT nome FROM lojas WHERE id=?`).get(alvo.loja_id);
    const nomeAlvo = db.prepare(`SELECT nome FROM colaboradores WHERE id=?`).get(req.params.id)?.nome || '';
    gerarTarefa({
      empresa_id: req.usuario.empresa_id, loja_id: alvo.loja_id, tipo: 'notificacao', origem: 'folga_substituto', referencia_id: id,
      titulo: `Você vai substituir ${nomeAlvo} (${tipo === 'ferias' ? 'férias' : 'afastamento'})`,
      descricao: `Você cobrirá ${nomeAlvo} de ${data_inicio}${data_fim ? ' a ' + data_fim : ''} na loja ${loja?.nome || '—'}${turno ? `, turno ${turno}` : ''}. Confirme a ciência.`,
      responsavel_id: substituto_id, sla_horas: 72, criado_por: req.usuario.id,
    });
  }

  // Se o afastamento já está em curso hoje, redireciona as tarefas abertas da pessoa pro substituto (não deixa parado).
  const hoje = new Date().toISOString().slice(0, 10);
  if (substituto_id && data_inicio <= hoje && (!data_fim || data_fim >= hoje)) {
    db.prepare(`UPDATE tarefas SET responsavel_id=?, atualizado_em=datetime('now') WHERE empresa_id=? AND responsavel_id=? AND status!='concluido'`).run(substituto_id, req.usuario.empresa_id, req.params.id);
  }

  if (tipo === 'ferias') {
    // Férias: abre tarefa de ASSINATURA (ciência com foto + IP + hora). RH entra como apoio e só conclui ao baixar o PDF.
    const { criarAssinatura } = require('./assinaturas');
    criarAssinatura({
      empresaId: req.usuario.empresa_id, colaboradorId: req.params.id, lojaId: alvo.loja_id,
      tipo: 'ferias', referenciaId: id, cienciaGestao: true,
      titulo: `Ciência de férias · ${data_inicio}${data_fim ? ' a ' + data_fim : ''}`,
      texto: `Declaro ciência das minhas férias de ${data_inicio}${data_fim ? ' a ' + data_fim : ''}.${motivo ? ' ' + motivo : ''}`,
      criadoPor: req.usuario.id,
    });
  } else {
    gerarTarefa({
      empresa_id: req.usuario.empresa_id, loja_id: alvo.loja_id || req.usuario.loja_id, tipo: 'notificacao', origem: 'rh',
      titulo: 'Afastamento registrado',
      descricao: `Afastamento de ${data_inicio}${data_fim ? ' a ' + data_fim : ' (sem data de retorno definida)'}.${motivo ? ' ' + motivo : ''}`,
      responsavel_id: req.params.id, sla_horas: 120, criado_por: req.usuario.id,
    });
  }
  res.status(201).json({ id, mensagem: 'Registrado e colaborador avisado.' });
});

// POST /colaboradores/afastamentos/lote — lança férias/afastamento para VÁRIAS pessoas de uma vez
// body: { tipo, data_inicio, data_fim, motivo, pessoas: [{ colaborador_id, substituto_id, turno }] }
router.post('/afastamentos/lote', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { tipo, data_inicio, data_fim, motivo, pessoas } = req.body;
  if (!['afastamento', 'ferias'].includes(tipo)) return res.status(400).json({ erro: 'Tipo deve ser afastamento ou ferias.' });
  if (!data_inicio) return res.status(400).json({ erro: 'Data de início obrigatória.' });
  if (!Array.isArray(pessoas) || !pessoas.length) return res.status(400).json({ erro: 'Selecione ao menos uma pessoa.' });
  const hoje = new Date().toISOString().slice(0, 10);
  const { criarAssinatura } = require('./assinaturas');
  let criados = 0;
  for (const p of pessoas) {
    if (!p.colaborador_id) continue;
    const alvo = db.prepare(`SELECT c.id, c.loja_id, c.nome FROM colaboradores c WHERE c.id=? AND c.empresa_id=?`).get(p.colaborador_id, req.usuario.empresa_id);
    if (!alvo) continue;
    const id = uuidv4();
    db.prepare(`INSERT INTO afastamentos (id,empresa_id,colaborador_id,lancado_por_id,tipo,data_inicio,data_fim,motivo,substituto_id,turno)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, req.usuario.empresa_id, alvo.id, req.usuario.id, tipo, data_inicio, data_fim || null, motivo || '', p.substituto_id || null, p.turno || null);
    require('../lib/afastamentoSync').push(req.usuario.empresa_id, alvo.id, tipo, data_inicio, data_fim).catch(() => {});
    if (p.substituto_id && data_inicio <= hoje && (!data_fim || data_fim >= hoje)) {
      db.prepare(`UPDATE tarefas SET responsavel_id=?, atualizado_em=datetime('now') WHERE empresa_id=? AND responsavel_id=? AND status!='concluido'`).run(p.substituto_id, req.usuario.empresa_id, alvo.id);
    }
    if (p.substituto_id) {
      const loja = db.prepare(`SELECT nome FROM lojas WHERE id=?`).get(alvo.loja_id);
      gerarTarefa({ empresa_id: req.usuario.empresa_id, loja_id: alvo.loja_id, tipo: 'notificacao', origem: 'folga_substituto', referencia_id: id,
        titulo: `Você vai substituir ${alvo.nome} (${tipo === 'ferias' ? 'férias' : 'afastamento'})`,
        descricao: `Você cobrirá ${alvo.nome} de ${data_inicio}${data_fim ? ' a ' + data_fim : ''} na loja ${loja?.nome || '—'}${p.turno ? `, turno ${p.turno}` : ''}. Confirme a ciência.`,
        responsavel_id: p.substituto_id, sla_horas: 72, criado_por: req.usuario.id });
    }
    if (tipo === 'ferias') {
      criarAssinatura({ empresaId: req.usuario.empresa_id, colaboradorId: alvo.id, lojaId: alvo.loja_id, tipo: 'ferias', referenciaId: id, cienciaGestao: true,
        titulo: `Ciência de férias · ${data_inicio}${data_fim ? ' a ' + data_fim : ''}`,
        texto: `Declaro ciência das minhas férias de ${data_inicio}${data_fim ? ' a ' + data_fim : ''}.${motivo ? ' ' + motivo : ''}`,
        criadoPor: req.usuario.id });
    } else {
      gerarTarefa({ empresa_id: req.usuario.empresa_id, loja_id: alvo.loja_id, tipo: 'notificacao', origem: 'rh',
        titulo: 'Afastamento registrado', descricao: `Afastamento de ${data_inicio}${data_fim ? ' a ' + data_fim : ''}.${motivo ? ' ' + motivo : ''}`,
        responsavel_id: alvo.id, sla_horas: 120, criado_por: req.usuario.id });
    }
    criados++;
  }
  if (!criados) return res.status(400).json({ erro: 'Nenhuma pessoa válida.' });
  res.status(201).json({ criados, mensagem: `${criados} registro(s) lançados.` });
});

// DELETE /colaboradores/:id/afastamentos/:afId — RH cancela
router.delete('/:id/afastamentos/:afId', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  db.prepare(`DELETE FROM afastamentos WHERE id=? AND empresa_id=? AND colaborador_id=?`).run(req.params.afId, req.usuario.empresa_id, req.params.id);
  res.json({ mensagem: 'Registro removido.' });
});

// ── Documentos do colaborador (CPF, RG, certidões…) — RH gerencia ────────────────────
router.get('/:id/docs', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral', 'Controladoria', 'Financeiro'), (req, res) => {
  const rows = db.prepare(`SELECT id, tipo, nome, mime, criado_em FROM colaborador_docs WHERE colaborador_id=? AND empresa_id=? ORDER BY criado_em DESC`).all(req.params.id, req.usuario.empresa_id);
  res.json({ documentos: rows });
});
router.post('/:id/docs', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const c = db.prepare('SELECT id FROM colaboradores WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!c) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  if (!req.body.dados) return res.status(400).json({ erro: 'Anexe o arquivo.' });
  db.prepare(`INSERT INTO colaborador_docs (id,empresa_id,colaborador_id,tipo,nome,mime,dados,criado_em) VALUES (?,?,?,?,?,?,?,datetime('now'))`)
    .run(uuidv4(), req.usuario.empresa_id, c.id, (req.body.tipo || '').toString().slice(0, 80) || null, (req.body.nome || 'documento').toString().slice(0, 160), (req.body.mime || '').toString().slice(0, 60), String(req.body.dados).slice(0, 8_000_000));
  res.status(201).json({ ok: true });
});
router.get('/:id/docs/:docId', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral', 'Controladoria', 'Financeiro'), (req, res) => {
  const d = db.prepare(`SELECT nome, mime, dados FROM colaborador_docs WHERE id=? AND colaborador_id=? AND empresa_id=?`).get(req.params.docId, req.params.id, req.usuario.empresa_id);
  if (!d || !d.dados) return res.status(404).end();
  res.setHeader('Content-Type', d.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${(d.nome || 'doc').replace(/[^\w .-]/g, '_')}"`);
  res.send(Buffer.from(String(d.dados).replace(/^data:.*;base64,/, ''), 'base64'));
});
router.delete('/:id/docs/:docId', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  db.prepare(`DELETE FROM colaborador_docs WHERE id=? AND colaborador_id=? AND empresa_id=?`).run(req.params.docId, req.params.id, req.usuario.empresa_id);
  res.json({ ok: true });
});

// ── Histórico completo (ficha do colaborador) — positivo e negativo, numa linha do tempo ─
// Gerente/Subgerente só podem ver quem é da PRÓPRIA loja (Visão 360 da equipe).
function guardLoja(req, res) {
  if (!['Gerente', 'Subgerente'].includes(req.usuario.funcao_nome)) return true;
  const alvo = db.prepare('SELECT loja_id FROM colaboradores WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!alvo || alvo.loja_id !== req.usuario.loja_id) { res.status(403).json({ erro: 'Você só vê colaboradores da sua loja.' }); return false; }
  return true;
}
router.get('/:id/historico', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral', 'Supervisor', 'Gerente', 'Subgerente', 'Controladoria', 'Financeiro'), (req, res) => {
  if (!guardLoja(req, res)) return;
  const emp = req.usuario.empresa_id, id = req.params.id;
  const itens = [];
  const add = (data, categoria, origem, titulo, detalhe, pontos) => { if (data) itens.push({ data: String(data).slice(0, 19).replace('T', ' '), categoria, origem, titulo, detalhe: detalhe || null, pontos: pontos || null }); };
  try {
    db.prepare(`SELECT * FROM ocorrencias WHERE empresa_id=? AND colaborador_id=? ORDER BY criado_em DESC LIMIT 200`).all(emp, id).forEach(o => {
      const tt = o.termo_tipo || (o.exige_termo ? 'termo' : null);
      const titulo = tt === 'advertencia' ? '⚠️ Advertência' : tt === 'suspensao' ? '⛔ Suspensão' : tt === 'termo' ? '📝 Termo' : '⚠️ Ocorrência';
      add(o.data_ocorrencia || o.data || o.criado_em, 'negativo', 'ocorrencia', titulo, o.motivo || o.descricao || o.obs, o.pontos_deduzidos ? -Math.abs(o.pontos_deduzidos) : (o.deducao ? -Math.abs(o.deducao) : null));
    });
  } catch { /* ignora */ }
  try {
    const VERBO = { conquista: '🏆 Conquista', reconhecimento: '⭐ Reconhecimento', desenvolvimento: '📚 Curso/desenvolvimento' };
    db.prepare(`SELECT * FROM certificados WHERE empresa_id=? AND colaborador_id=? AND validado=1 ORDER BY criado_em DESC LIMIT 200`).all(emp, id).forEach(ce =>
      add(ce.criado_em, 'positivo', 'certificado', VERBO[ce.tipo] || '🏆 Conquista', ce.titulo, ce.pontos ? Math.abs(ce.pontos) : null));
  } catch { /* ignora */ }
  try {
    db.prepare(`SELECT * FROM beneficios WHERE empresa_id=? AND colaborador_id=? ORDER BY concedido_em DESC LIMIT 100`).all(emp, id).forEach(b =>
      add(b.concedido_em, 'positivo', 'beneficio', '🎁 Benefício', `${b.tipo}${b.produto_nome ? ' · ' + b.produto_nome : ''} (${b.status})`, null));
  } catch { /* ignora */ }
  try {
    db.prepare(`SELECT tipo, titulo, assinado_em FROM assinaturas WHERE empresa_id=? AND colaborador_id=? AND assinado_em IS NOT NULL ORDER BY assinado_em DESC LIMIT 100`).all(emp, id).forEach(a =>
      add(a.assinado_em, 'neutro', 'assinatura', '✍️ Assinatura de termo', a.titulo, null));
  } catch { /* ignora */ }
  itens.sort((a, b) => (a.data < b.data ? 1 : -1));
  const resumo = {
    positivos: itens.filter(i => i.categoria === 'positivo').length,
    negativos: itens.filter(i => i.categoria === 'negativo').length,
    advertencias: itens.filter(i => i.titulo.includes('Advertência')).length,
    suspensoes: itens.filter(i => i.titulo.includes('Suspensão')).length,
  };
  res.json({ historico: itens.slice(0, 300), resumo });
});

// ── Desempenho do mês (meta/super meta/indicadores) — p/ conversa de feedback ────────
router.get('/:id/desempenho', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral', 'Supervisor', 'Gerente', 'Subgerente', 'Controladoria', 'Financeiro'), async (req, res) => {
  if (!guardLoja(req, res)) return;
  const emp = req.usuario.empresa_id;
  const c = db.prepare(`SELECT c.id, c.loja_id, c.funcao_id, f.nome funcao, l.nome loja FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id LEFT JOIN lojas l ON l.id=c.loja_id WHERE c.id=? AND c.empresa_id=?`).get(req.params.id, emp);
  if (!c) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  const hoje = new Date();
  const mes = parseInt(req.query.mes) || hoje.getMonth() + 1, ano = parseInt(req.query.ano) || hoje.getFullYear();
  const out = { funcao: c.funcao, loja: c.loja, mes, ano };
  try {
    const fv = require('../lib/fotoVendedor');
    const vendasErp = require('../lib/vendasErp');
    const indicadoresErp = require('../lib/indicadoresErp');
    if (c.loja_id) {
      await vendasErp.prewarmLoja(c.loja_id, mes, ano);
      await indicadoresErp.prewarmIndicadoresVendedores(c.loja_id, mes, ano);
      if (c.funcao_id === 'func-vendedor') {
        const metaRow = fv.metaLojaDoPeriodo(emp, c.loja_id, mes, ano);
        const metaLoja = metaRow ? metaRow.valor_meta : 0;
        const vends = fv.vendedoresDaLoja(emp, c.loja_id, mes, ano);
        const somaPesos = vends.reduce((a, v) => a + (v.peso || 0), 0) || 1;
        const v = vends.find(x => x.colaborador_id === c.id);
        if (v) {
          const foto = fv.fotoVendedor(emp, c.loja_id, mes, ano, v, somaPesos, metaLoja, fv.pesosVendedor(emp));
          out.vendedor = { pct_meta: foto.pct_meta, pct_super: foto.pct_super, bateu_meta: foto.pct_meta >= 100, bateu_super: foto.pct_super >= 100, nota_indicadores: foto.nota_indicadores, premiacao_pct: foto.premiacao_pct, vitaminas: foto.vitaminas_unidades };
        }
      } else if (['func-gerente', 'func-subgerente'].includes(c.funcao_id)) {
        const metaRow = fv.metaLojaDoPeriodo(emp, c.loja_id, mes, ano);
        const metaLoja = metaRow ? metaRow.valor_meta : 0;
        const superLoja = metaRow && metaRow.valor_super_meta ? metaRow.valor_super_meta : Math.round(metaLoja * 1.05);
        const vendido = vendasErp.totalLojaMesSync(c.loja_id, mes, ano) || 0;
        out.loja_meta = { vendido, meta: metaLoja, pct_meta: metaLoja ? Math.round(vendido / metaLoja * 100) : null, pct_super: superLoja ? Math.round(vendido / superLoja * 100) : null, bateu_meta: metaLoja > 0 && vendido >= metaLoja };
      }
    }
  } catch (e) { out.erro_erp = true; }
  res.json(out);
});

// Perfil social (sobre mim) — leitura por qualquer colaborador logado (p/ a Comunidade).
const CAMPOS_PERFIL = ['bio', 'presente_favorito', 'cores_favoritas', 'estilo_musical', 'hobbies', 'time_coracao'];
router.get('/:id/perfil', (req, res) => {
  const c = db.prepare(`SELECT c.id, c.nome, c.apelido, c.bio, c.presente_favorito, c.cores_favoritas, c.estilo_musical, c.hobbies, c.time_coracao,
      (c.foto IS NOT NULL) tem_foto, f.nome funcao, l.nome loja,
      (SELECT COUNT(*) FROM dependentes WHERE colaborador_id=c.id) n_dependentes
    FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id LEFT JOIN lojas l ON l.id=c.loja_id
    WHERE c.id=? AND c.empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!c) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  res.json({ perfil: c });
});

// O próprio colaborador edita seu "sobre mim" (ou RH/gestão).
router.patch('/:id/perfil', (req, res) => {
  const c = db.prepare('SELECT id FROM colaboradores WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!c) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  const ehRHgestao = ['RH', 'Gestor Geral', 'Diretor Geral'].includes(req.usuario.funcao_nome);
  if (req.usuario.id !== c.id && !ehRHgestao) return res.status(403).json({ erro: 'Sem permissão.' });
  CAMPOS_PERFIL.forEach(campo => {
    if (req.body[campo] !== undefined) db.prepare(`UPDATE colaboradores SET ${campo}=? WHERE id=?`).run((campo === 'bio' ? String(req.body[campo] || '').slice(0, 500) : req.body[campo]) || null, c.id);
  });
  res.json({ ok: true });
});

// Busca endereço por CEP (proxy do ViaCEP) — preenche rua/bairro/cidade/UF no cadastro.
router.get('/cep/:cep', async (req, res) => {
  const cep = String(req.params.cep || '').replace(/\D/g, '');
  if (cep.length !== 8) return res.status(400).json({ erro: 'CEP inválido.' });
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (d.erro) return res.status(404).json({ erro: 'CEP não encontrado.' });
    res.json({ endereco: d.logradouro || '', bairro: d.bairro || '', cidade: d.localidade || '', uf: d.uf || '' });
  } catch (e) { res.status(502).json({ erro: 'Não foi possível consultar o CEP.' }); }
});

// ── Dependentes (filhos e pets) ──────────────────────────────────────────────────────
function inserirDependente(emp, colabId, d) {
  const id = uuidv4();
  db.prepare(`INSERT INTO dependentes (id,empresa_id,colaborador_id,tipo,especie,nome,apelido,nascimento,foto,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(id, emp, colabId, d.tipo === 'pet' ? 'pet' : 'filho', d.tipo === 'pet' ? (d.especie || 'outro') : null,
      String(d.nome || '').slice(0, 120), (d.apelido || '').toString().slice(0, 80) || null, d.nascimento || null, (d.foto || '').toString().slice(0, 900000) || null);
  return id;
}

router.get('/:id/dependentes', (req, res) => {
  const rows = db.prepare(`SELECT id, tipo, especie, nome, apelido, nascimento, (foto IS NOT NULL) tem_foto
    FROM dependentes WHERE empresa_id=? AND colaborador_id=? ORDER BY criado_em`).all(req.usuario.empresa_id, req.params.id);
  res.json({ dependentes: rows });
});

router.post('/:id/dependentes', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const c = db.prepare('SELECT id FROM colaboradores WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!c) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  if (!String(req.body.nome || '').trim()) return res.status(400).json({ erro: 'Informe o nome.' });
  const id = inserirDependente(req.usuario.empresa_id, c.id, req.body);
  res.status(201).json({ ok: true, id });
});

router.patch('/dependente/:depId', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const d = db.prepare('SELECT * FROM dependentes WHERE id=? AND empresa_id=?').get(req.params.depId, req.usuario.empresa_id);
  if (!d) return res.status(404).json({ erro: 'Não encontrado.' });
  db.prepare(`UPDATE dependentes SET tipo=?, especie=?, nome=?, apelido=?, nascimento=?, foto=? WHERE id=?`)
    .run(req.body.tipo || d.tipo, (req.body.tipo || d.tipo) === 'pet' ? (req.body.especie || d.especie || 'outro') : null,
      req.body.nome ?? d.nome, req.body.apelido ?? d.apelido, req.body.nascimento ?? d.nascimento,
      req.body.foto !== undefined ? (String(req.body.foto || '').slice(0, 900000) || null) : d.foto, d.id);
  res.json({ ok: true });
});

router.delete('/dependente/:depId', exigePerfil('RH', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  db.prepare('DELETE FROM dependentes WHERE id=? AND empresa_id=?').run(req.params.depId, req.usuario.empresa_id);
  res.json({ ok: true });
});

router.get('/dependente/:depId/foto', (req, res) => {
  const d = db.prepare('SELECT foto FROM dependentes WHERE id=? AND empresa_id=?').get(req.params.depId, req.usuario.empresa_id);
  if (!d || !d.foto) return res.status(404).end();
  const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(d.foto);
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]); res.set('Cache-Control', 'private, max-age=300'); res.send(Buffer.from(m[2], 'base64'));
});

// ── LGPD: consentimento p/ compartilhar dados (gera termo assinado em Meus Documentos) ─
async function gerarTermoLgpdPdf(nome, cpf, quando) {
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 56; let y = 786; const W = 595 - M * 2;
  const draw = (txt, f, size, gap) => {
    const palavras = String(txt).split(' '); let linha = '';
    for (const p of palavras) {
      const t = linha ? linha + ' ' + p : p;
      if (f.widthOfTextAtSize(t, size) > W && linha) { page.drawText(linha, { x: M, y, size, font: f, color: rgb(0.1, 0.1, 0.1) }); y -= size + 4; linha = p; }
      else linha = t;
    }
    if (linha) { page.drawText(linha, { x: M, y, size, font: f, color: rgb(0.1, 0.1, 0.1) }); y -= size + 4; }
    y -= gap || 0;
  };
  draw('TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS (LGPD)', bold, 13, 14);
  draw(`Eu, ${nome}${cpf ? ', CPF ' + cpf : ''}, colaborador(a) do Grupo Mutti, autorizo, de forma livre, informada e inequívoca, nos termos da Lei nº 13.709/2018 (LGPD), o tratamento e o compartilhamento interno dos meus dados pessoais e dos dados dos meus dependentes (filhos e pets), incluindo nome, apelido, foto e datas de nascimento.`, font, 11, 10);
  draw('Finalidade: relacionamento e integração interna, como celebração de datas comemorativas e publicações na rede social interna (Comunidade) do Grupo Mutti.', font, 11, 10);
  draw('Estou ciente de que: (i) o compartilhamento é restrito ao ambiente interno da empresa; (ii) posso revogar este consentimento a qualquer momento junto à área de Gente & Gestão; (iii) os dados serão tratados conforme a Política de Privacidade do Grupo Mutti.', font, 11, 16);
  draw(`Consentimento registrado eletronicamente em ${quando}.`, bold, 11, 30);
  draw(`_______________________________________`, font, 11, 2);
  draw(`${nome}`, font, 11, 0);
  return Buffer.from(await pdf.save());
}

async function registrarConsentimentoLgpd(emp, colab, ip, registradoPor) {
  if (colab.lgpd_consentido) return false;
  const quando = new Date().toLocaleString('pt-BR');
  const pdf = await gerarTermoLgpdPdf(colab.nome, colab.cpf, quando);
  db.prepare(`INSERT INTO documentos_pessoais
    (id,empresa_id,colaborador_id,cpf,tipo,competencia,titulo,arquivo_nome,mime,dados,paginas,status,ciente_em,ciente_ip,criado_por,criado_em)
    VALUES (?,?,?,?, 'termo_lgpd', ?, 'Termo de Consentimento LGPD', 'termo-lgpd.pdf', 'application/pdf', ?, 1, 'ciente', datetime('now'), ?, ?, datetime('now'))`)
    .run(uuidv4(), emp, colab.id, colab.cpf || '', String(new Date().getFullYear()), pdf, ip || null, registradoPor || null);
  db.prepare(`UPDATE colaboradores SET lgpd_consentido=1, lgpd_consentido_em=datetime('now') WHERE id=?`).run(colab.id);
  return true;
}

// Registra o consentimento — o próprio colaborador ou RH/gestão (na cadastro).
router.post('/:id/lgpd', async (req, res) => {
  const c = db.prepare('SELECT * FROM colaboradores WHERE id=? AND empresa_id=?').get(req.params.id, req.usuario.empresa_id);
  if (!c) return res.status(404).json({ erro: 'Colaborador não encontrado.' });
  const ehRHgestao = ['RH', 'Gestor Geral', 'Diretor Geral'].includes(req.usuario.funcao_nome);
  if (req.usuario.id !== c.id && !ehRHgestao) return res.status(403).json({ erro: 'Sem permissão.' });
  try { const criou = await registrarConsentimentoLgpd(req.usuario.empresa_id, c, req.ip, req.usuario.nome); res.json({ ok: true, criou }); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
module.exports.registrarConsentimentoLgpd = registrarConsentimentoLgpd;
