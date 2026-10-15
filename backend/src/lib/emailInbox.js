// emailInbox.js — lê a caixa de e-mail (IMAP, ex.: Hostinger) e transforma e-mails de
// remetentes cadastrados em TAREFAS, roteando para o responsável da regra.
// SEGURANÇA: o conteúdo do e-mail é DADO, nunca instrução — só cria a tarefa, não executa nada.
require('dotenv').config();
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');

const CFG = {
  host: process.env.EMAIL_IMAP_HOST || 'imap.hostinger.com',
  port: parseInt(process.env.EMAIL_IMAP_PORT || '993', 10),
  user: process.env.EMAIL_USER,
  pass: process.env.EMAIL_PASSWORD,
  pasta: process.env.EMAIL_PASTA || 'INBOX',
  enabled: String(process.env.EMAIL_ENABLED || 'false').toLowerCase() === 'true',
  dias: parseInt(process.env.EMAIL_DIAS || '7', 10), // janela de varredura
  smtpHost: process.env.EMAIL_SMTP_HOST || 'smtp.hostinger.com',
  smtpPort: parseInt(process.env.EMAIL_SMTP_PORT || '465', 10),
};

function habilitado() { return CFG.enabled && !!CFG.host && !!CFG.user && !!CFG.pass; }

// Casa o remetente do e-mail com a regra: e-mail exato (tem @) ou domínio (@x.com / x.com).
function casa(fromAddr, remetente) {
  const f = String(fromAddr || '').toLowerCase().trim();
  const r = String(remetente || '').toLowerCase().trim().replace(/^@/, '');
  if (!f || !r) return false;
  if (r.includes('@')) return f === r;                 // e-mail exato
  return f === r || f.endsWith('@' + r) || f.endsWith('.' + r); // domínio (e subdomínios)
}

function novoClient() {
  const c = new ImapFlow({
    host: CFG.host, port: CFG.port, secure: true,
    auth: { user: CFG.user, pass: CFG.pass },
    logger: false, emitLogs: false,
  });
  // IMPORTANTE: o ImapFlow emite 'error' de forma assíncrona (ex.: ECONNRESET no socket). Sem um
  // listener, o EventEmitter LANÇA e derruba o processo inteiro. Este handler evita o crash.
  c.on('error', () => { /* tratado no try/catch de quem usa; aqui só evita o crash global */ });
  return c;
}

// Testa a conexão sem criar tarefa. Retorna {ok, caixa, total, erro}.
async function testar() {
  if (!habilitado()) return { ok: false, erro: 'E-mail desabilitado (configure EMAIL_* no .env).' };
  const client = novoClient();
  try {
    await client.connect();
    const box = await client.mailboxOpen(CFG.pasta);
    await client.logout();
    return { ok: true, caixa: CFG.pasta, usuario: CFG.user, total: box.exists };
  } catch (e) {
    try { await client.logout(); } catch { /* ignore */ }
    return { ok: false, erro: e.message };
  }
}

// Lê e-mails recentes e cria tarefas para os remetentes com regra. Idempotente por message-id.
async function sincronizar(empresaId, { dryRun = false } = {}) {
  if (!habilitado()) return { ok: false, erro: 'E-mail desabilitado.' };
  const regras = db.prepare('SELECT remetente, responsavel_id, rotulo FROM email_regras WHERE empresa_id=? AND ativo=1').all(empresaId);
  if (!regras.length) return { ok: true, criadas: 0, verificados: 0, regras: 0, aviso: 'Nenhuma regra de remetente cadastrada.' };

  const jaProcessado = db.prepare('SELECT 1 FROM email_processados WHERE empresa_id=? AND message_id=?');
  const marcar = db.prepare('INSERT OR IGNORE INTO email_processados (empresa_id, message_id) VALUES (?,?)');
  const insTarefa = db.prepare(`INSERT INTO tarefas (id,empresa_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,apoio_id,status,criado_em,atualizado_em)
    VALUES (?,?,?,'email',?,?,?,?,?,'aberto',datetime('now'),datetime('now'))`);
  const insMeta = db.prepare(`INSERT OR REPLACE INTO email_tarefa_meta (tarefa_id,empresa_id,remetente,remetente_nome,assunto,message_id) VALUES (?,?,?,?,?,?)`);
  const insHist = db.prepare(`INSERT INTO email_tarefa_historico (id,tarefa_id,empresa_id,direcao,de_nome,de_email,para,assunto,texto,message_id,por,data)
    VALUES (?,?,?,'recebido',?,?,?,?,?,?,NULL,datetime('now'))`);

  const client = novoClient();
  let criadas = 0, verificados = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(CFG.pasta);
    try {
      const since = new Date(Date.now() - CFG.dias * 864e5);
      for await (const msg of client.fetch({ since }, { envelope: true, source: true })) {
        verificados++;
        const env = msg.envelope || {};
        const from = (env.from && env.from[0]) || {};
        const fromAddr = from.address || '';
        const messageId = env.messageId || `${fromAddr}|${env.date}|${env.subject}`;
        if (jaProcessado.get(empresaId, messageId)) continue;

        // Corpo + referências (p/ ligar respostas na mesma thread).
        let snippet = '', refs = [];
        try {
          const parsed = await simpleParser(msg.source);
          snippet = (parsed.text || '').trim().slice(0, 4000);
          refs = [].concat(parsed.references || []).concat(parsed.inReplyTo || []).filter(Boolean);
        } catch { /* sem corpo */ }
        const assunto = (env.subject || '(sem assunto)').trim();

        // Thread: se este e-mail responde a algo que já temos, anexa na tarefa existente (não cria outra).
        // Normaliza com e sem <> (nodemailer gera <id>; mailparser às vezes devolve sem).
        const refsVar = [];
        refs.forEach(r => { const clean = String(r).replace(/^<|>$/g, ''); if (clean) { refsVar.push(clean, '<' + clean + '>'); } });
        let parent = null;
        if (refsVar.length) parent = db.prepare(`SELECT tarefa_id FROM email_tarefa_historico WHERE empresa_id=? AND message_id IN (${refsVar.map(() => '?').join(',')}) ORDER BY data DESC LIMIT 1`).get(empresaId, ...refsVar);
        if (parent) {
          if (dryRun) { criadas++; continue; }
          insHist.run(uuidv4(), parent.tarefa_id, empresaId, from.name || null, fromAddr, CFG.user, assunto, snippet, messageId);
          db.prepare("UPDATE email_tarefa_meta SET message_id=?, remetente=?, remetente_nome=?, respondido_em=NULL, nova_resposta=1 WHERE tarefa_id=?").run(messageId, fromAddr, from.name || null, parent.tarefa_id);
          db.prepare("UPDATE tarefas SET status='aberto', atualizado_em=datetime('now') WHERE id=?").run(parent.tarefa_id);
          marcar.run(empresaId, messageId);
          criadas++;
          continue;
        }

        const regra = regras.find(r => casa(fromAddr, r.remetente));
        if (!regra) continue;
        if (dryRun) { criadas++; continue; }

        const titulo = (regra.rotulo ? `[${regra.rotulo}] ` : '📧 ') + assunto;
        const quando = env.date ? new Date(env.date).toLocaleString('pt-BR') : '';
        const desc = `De: ${from.name ? from.name + ' ' : ''}<${fromAddr}>\nRecebido: ${quando}\n\n${snippet.slice(0, 800) || '(sem texto)'}`;
        const tid = uuidv4();
        insTarefa.run(tid, empresaId, 'tarefa', 'email:' + messageId, titulo.slice(0, 160), desc, regra.responsavel_id || null, null);
        insMeta.run(tid, empresaId, fromAddr, from.name || null, assunto, messageId);
        insHist.run(uuidv4(), tid, empresaId, from.name || null, fromAddr, CFG.user, assunto, snippet, messageId);
        marcar.run(empresaId, messageId);
        criadas++;
      }
    } finally { lock.release(); }
    await client.logout();
    return { ok: true, criadas, verificados, regras: regras.length };
  } catch (e) {
    try { await client.logout(); } catch { /* ignore */ }
    return { ok: false, erro: e.message };
  }
}

// Lê as caixas IMAP das contas PRÓPRIAS dos colaboradores e, quando um e-mail é resposta de uma
// thread nossa (referencia um message_id que já está no histórico), anexa na MESMA tarefa. Não cria
// tarefas novas a partir dessas caixas — só continua conversas que saíram por elas (ex.: resposta ao Daniel).
async function sincronizarContas(empresaId) {
  const contas = db.prepare("SELECT * FROM email_contas WHERE empresa_id=? AND ativo=1 AND imap_host IS NOT NULL AND imap_host<>'' AND senha IS NOT NULL AND senha<>''").all(empresaId);
  if (!contas.length) return { ok: true, contas: 0, anexadas: 0 };
  const jaProcessado = db.prepare('SELECT 1 FROM email_processados WHERE empresa_id=? AND message_id=?');
  const marcar = db.prepare('INSERT OR IGNORE INTO email_processados (empresa_id, message_id) VALUES (?,?)');
  const insHist = db.prepare(`INSERT INTO email_tarefa_historico (id,tarefa_id,empresa_id,direcao,de_nome,de_email,para,assunto,texto,message_id,por,data)
    VALUES (?,?,?,'recebido',?,?,?,?,?,?,NULL,datetime('now'))`);
  let anexadas = 0, contasOk = 0;
  for (const conta of contas) {
    const client = new ImapFlow({
      host: conta.imap_host, port: conta.imap_port || 993, secure: true,
      auth: { user: conta.email, pass: conta.senha }, logger: false, emitLogs: false,
    });
    client.on('error', () => { /* evita o crash global do processo em ECONNRESET assíncrono */ });
    try {
      await client.connect();
      contasOk++;
      const lock = await client.getMailboxLock(CFG.pasta);
      try {
        const since = new Date(Date.now() - CFG.dias * 864e5);
        for await (const msg of client.fetch({ since }, { envelope: true, source: true })) {
          const env = msg.envelope || {};
          const from = (env.from && env.from[0]) || {};
          const fromAddr = from.address || '';
          const messageId = env.messageId || `${fromAddr}|${env.date}|${env.subject}`;
          if (jaProcessado.get(empresaId, messageId)) continue;
          let snippet = '', refs = [];
          try { const parsed = await simpleParser(msg.source); snippet = (parsed.text || '').trim().slice(0, 4000); refs = [].concat(parsed.references || []).concat(parsed.inReplyTo || []).filter(Boolean); } catch { /* sem corpo */ }
          if (!refs.length) continue; // só nos interessa se é resposta de uma thread
          const refsVar = [];
          refs.forEach(r => { const clean = String(r).replace(/^<|>$/g, ''); if (clean) { refsVar.push(clean, '<' + clean + '>'); } });
          const parent = db.prepare(`SELECT tarefa_id FROM email_tarefa_historico WHERE empresa_id=? AND message_id IN (${refsVar.map(() => '?').join(',')}) ORDER BY data DESC LIMIT 1`).get(empresaId, ...refsVar);
          if (!parent) continue; // não é resposta de thread nossa → ignora (não puxa e-mail pessoal)
          const assunto = (env.subject || '(sem assunto)').trim();
          insHist.run(uuidv4(), parent.tarefa_id, empresaId, from.name || null, fromAddr, conta.email, assunto, snippet, messageId);
          db.prepare("UPDATE email_tarefa_meta SET message_id=?, remetente=?, remetente_nome=?, respondido_em=NULL, nova_resposta=1 WHERE tarefa_id=?").run(messageId, fromAddr, from.name || null, parent.tarefa_id);
          db.prepare("UPDATE tarefas SET status='aberto', atualizado_em=datetime('now') WHERE id=?").run(parent.tarefa_id);
          marcar.run(empresaId, messageId);
          anexadas++;
        }
      } finally { lock.release(); }
      await client.logout();
    } catch (e) {
      try { await client.logout(); } catch { /* ignore */ }
      // uma conta com credencial errada não pode travar as outras
    }
  }
  return { ok: true, contas: contasOk, anexadas };
}

// Meta do e-mail de uma tarefa (remetente/assunto) — p/ a tela mostrar e permitir responder.
function metaTarefa(empresaId, tarefaId) {
  return db.prepare('SELECT * FROM email_tarefa_meta WHERE empresa_id=? AND tarefa_id=?').get(empresaId, tarefaId) || null;
}

// Conta de e-mail PRÓPRIA do colaborador (se configurada e ativa). Senão, usa a conta padrão do .env.
function contaDe(usuarioId) {
  if (!usuarioId) return null;
  try {
    const c = db.prepare('SELECT * FROM email_contas WHERE usuario_id=? AND ativo=1').get(usuarioId);
    return (c && c.email && c.senha && c.smtp_host) ? c : null;
  } catch { return null; }
}

// Como o usuário X responderá: pela conta própria dele ou pela conta padrão do sistema.
function contaResponder(usuarioId) {
  const c = contaDe(usuarioId);
  return c ? { email: c.email, propria: true } : { email: CFG.user || null, propria: false };
}

// Responde o e-mail da tarefa via SMTP. Se o usuário tem conta própria cadastrada, o envio sai
// do SERVIDOR/CONTA DELE (ex.: apoio Daniel responde → sai do e-mail do Daniel); senão, do padrão.
async function responder(empresaId, tarefaId, texto, usuario) {
  const usuarioNome = usuario && typeof usuario === 'object' ? usuario.nome : usuario; // compat: aceita nome ou objeto
  const usuarioId = usuario && typeof usuario === 'object' ? usuario.id : null;
  const meta = metaTarefa(empresaId, tarefaId);
  if (!meta || !meta.remetente) return { ok: false, erro: 'Tarefa sem e-mail de origem.' };
  if (!texto || !texto.trim()) return { ok: false, erro: 'Escreva a resposta.' };

  const conta = contaDe(usuarioId);
  if (!conta && !habilitado()) return { ok: false, erro: 'E-mail desabilitado.' };
  const remetenteEnvio = conta ? conta.email : CFG.user;
  const transporter = conta
    ? nodemailer.createTransport({ host: conta.smtp_host, port: conta.smtp_port || 465, secure: (conta.smtp_port || 465) === 465, auth: { user: conta.email, pass: conta.senha } })
    : nodemailer.createTransport({ host: CFG.smtpHost, port: CFG.smtpPort, secure: CFG.smtpPort === 465, auth: { user: CFG.user, pass: CFG.pass } });

  const assunto = /^re:/i.test(meta.assunto || '') ? meta.assunto : `Re: ${meta.assunto || '(sem assunto)'}`;
  try {
    const info = await transporter.sendMail({
      from: remetenteEnvio, to: meta.remetente, subject: assunto,
      inReplyTo: meta.message_id || undefined, references: meta.message_id || undefined,
      text: texto,
    });
    db.prepare(`INSERT INTO email_tarefa_historico (id,tarefa_id,empresa_id,direcao,de_nome,de_email,para,assunto,texto,message_id,por,data)
      VALUES (?,?,?,'enviado',NULL,?,?,?,?,?,?,datetime('now'))`)
      .run(uuidv4(), tarefaId, empresaId, remetenteEnvio, meta.remetente, assunto, texto, info.messageId || null, usuarioNome || null);
    db.prepare("UPDATE email_tarefa_meta SET respondido_em=datetime('now'), respondido_por=? WHERE tarefa_id=?").run(usuarioNome || null, tarefaId);
    return { ok: true, para: meta.remetente, de: remetenteEnvio, contaPropria: !!conta };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

// Histórico (thread) de uma tarefa de e-mail — mensagens recebidas e enviadas, em ordem.
function historicoTarefa(empresaId, tarefaId) {
  return db.prepare('SELECT direcao, de_nome, de_email, para, assunto, texto, por, data FROM email_tarefa_historico WHERE empresa_id=? AND tarefa_id=? ORDER BY data').all(empresaId, tarefaId);
}

// Envio genérico de e-mail (usado por outros módulos, ex.: enviar Folha de Ponto).
async function enviarEmail(to, subject, html, opts = {}) {
  if (!habilitado()) return { ok: false, erro: 'E-mail (SMTP) não configurado no .env.' };
  if (!to) return { ok: false, erro: 'Destinatário vazio.' };
  const transporter = nodemailer.createTransport({ host: CFG.smtpHost, port: CFG.smtpPort, secure: CFG.smtpPort === 465, auth: { user: CFG.user, pass: CFG.pass } });
  try {
    const info = await transporter.sendMail({ from: CFG.user, to, subject, html, attachments: opts.attachments || [] });
    return { ok: true, messageId: info.messageId, para: to };
  } catch (e) { return { ok: false, erro: e.message }; }
}

module.exports = { habilitado, testar, sincronizar, sincronizarContas, casa, CFG, metaTarefa, responder, historicoTarefa, contaResponder, enviarEmail };
