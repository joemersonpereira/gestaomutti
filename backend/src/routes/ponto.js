// ponto.js — módulo Ponto (integração Tangerino): colaboradores, batidas por período, espelho.
const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil } = require('../middleware/auth');
const tang = require('../lib/tangerino');

const GESTAO = ['RH', 'Gestor Geral', 'Diretor Geral', 'Supervisor', 'Controladoria'];
const so = v => (v == null ? '' : String(v).replace(/\D/g, '')); // só dígitos (CPF)
const responsavelSetor = (emp, funcoes) => { const ph = funcoes.map(() => '?').join(','); const r = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND c.ativo=1 AND f.nome IN (${ph}) ORDER BY c.nome LIMIT 1`).get(emp, ...funcoes); return r ? r.id : null; };
const diasEntre = (ini, fim) => { const out = []; const d = new Date(ini + 'T00:00:00'); const f = new Date(fim + 'T00:00:00'); while (d <= f) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); } return out; };
router.use(auth);

router.get('/status', (req, res) => {
  const prazoDia = require('../lib/pontoPendencias').config(req.usuario.empresa_id).prazoDia;
  res.json({ habilitado: tang.habilitado(), prazoDia, prazoAberto: new Date().getDate() <= prazoDia });
});

router.get('/colaboradores', exigePerfil(...GESTAO), async (req, res) => {
  if (!tang.habilitado()) return res.status(503).json({ erro: 'Integração do Tangerino não configurada (defina TANGERINO_TOKEN no .env).' });
  try {
    const r = await tang.colaboradores(Number(req.query.page) || 0, Number(req.query.size) || 100);
    res.json(r);
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

router.get('/batidas', exigePerfil(...GESTAO), async (req, res) => {
  if (!tang.habilitado()) return res.status(503).json({ erro: 'Integração do Tangerino não configurada (defina TANGERINO_TOKEN no .env).' });
  const { ini, fim, employeeId } = req.query;
  if (!ini || !fim) return res.status(400).json({ erro: 'Informe o período (ini e fim).' });
  try {
    const r = await tang.batidas({ startDate: ini, endDate: fim, employeeId: employeeId || undefined });
    res.json(r);
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

router.get('/espelho', exigePerfil(...GESTAO), async (req, res) => {
  if (!tang.habilitado()) return res.status(503).json({ erro: 'Integração do Tangerino não configurada (defina TANGERINO_TOKEN no .env).' });
  const { ini, fim, employeeId } = req.query;
  if (!ini || !fim) return res.status(400).json({ erro: 'Informe o período (ini e fim).' });
  try {
    const r = await tang.espelho({ startDate: ini, endDate: fim, employeeId: employeeId || undefined });
    res.json(r);
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

// ── Vínculo colaborador Mutti ↔ Tangerino (por CPF) ──────────────────────
router.get('/vinculos', exigePerfil(...GESTAO), (req, res) => {
  const rows = db.prepare(`SELECT c.id, c.nome, c.cpf, c.tangerino_id, c.tangerino_nome, l.nome loja
    FROM colaboradores c LEFT JOIN lojas l ON l.id=c.loja_id WHERE c.empresa_id=? AND c.ativo=1 ORDER BY c.nome`).all(req.usuario.empresa_id);
  res.json({ vinculos: rows, vinculados: rows.filter(r => r.tangerino_id).length, total: rows.length });
});

// Casa automaticamente por CPF (traz todos do Tangerino e vincula quem bater).
router.post('/vincular-cpf', exigePerfil(...GESTAO), async (req, res) => {
  if (!tang.habilitado()) return res.status(503).json({ erro: 'Integração do Tangerino não configurada.' });
  try {
    const tcolabs = await tang.todosColaboradores();
    const porCpf = new Map();
    tcolabs.forEach(t => { const cpf = so(t.cpf); if (cpf) porCpf.set(cpf, t); });
    const mutti = db.prepare('SELECT id, cpf, tangerino_id FROM colaboradores WHERE empresa_id=? AND ativo=1').all(req.usuario.empresa_id);
    const upd = db.prepare('UPDATE colaboradores SET tangerino_id=?, tangerino_nome=? WHERE id=?');
    let vinculados = 0; const semMatch = [];
    const tx = db.transaction(() => {
      for (const c of mutti) {
        if (c.tangerino_id) continue; // não sobrescreve vínculo manual/existente
        const t = porCpf.get(so(c.cpf));
        if (t) { upd.run(String(t.id), t.name || null, c.id); vinculados++; }
        else if (!so(c.cpf)) semMatch.push(c.id);
      }
    });
    tx();
    res.json({ ok: true, vinculados, tangerinoTotal: tcolabs.length, semCpf: semMatch.length });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

// Vínculo/desvínculo manual
router.post('/vincular/:colabId', exigePerfil(...GESTAO), (req, res) => {
  db.prepare('UPDATE colaboradores SET tangerino_id=?, tangerino_nome=? WHERE id=? AND empresa_id=?')
    .run(req.body.tangerino_id || null, req.body.tangerino_nome || null, req.params.colabId, req.usuario.empresa_id);
  res.json({ ok: true });
});

// ── Resumo RH: batidas do período confrontadas com folgas/afastamentos ───
router.get('/resumo', exigePerfil(...GESTAO), async (req, res) => {
  if (!tang.habilitado()) return res.status(503).json({ erro: 'Integração do Tangerino não configurada.' });
  const { ini, fim, loja } = req.query;
  if (!ini || !fim) return res.status(400).json({ erro: 'Informe o período (ini e fim).' });
  const emp = req.usuario.empresa_id;
  const colabs = db.prepare(`SELECT c.id, c.nome, c.loja_id, c.tangerino_id, l.nome loja FROM colaboradores c LEFT JOIN lojas l ON l.id=c.loja_id
    WHERE c.empresa_id=? AND c.ativo=1 AND c.tangerino_id IS NOT NULL ${loja ? 'AND c.loja_id=?' : ''}`).all(...(loja ? [emp, loja] : [emp]));
  if (!colabs.length) return res.json({ ok: true, colaboradores: [], aviso: 'Nenhum colaborador vinculado ao Tangerino (faça o vínculo por CPF).' });
  const porTang = new Map(colabs.map(c => [String(c.tangerino_id), c]));

  let bat;
  try { bat = await tang.todasBatidas({ startDate: ini, endDate: fim }); } catch (e) { return res.status(502).json({ erro: e.message }); }
  // batidas por colaborador Mutti → por data (junta TODAS as marcações do dia: um dia típico tem 4 = entrada, saída-almoço, volta, saída)
  const diasBat = new Map(); // colabId -> Map(data -> [ms,...])
  const diasOperando = new Map(); // loja_id -> Set(datas com qualquer batida) = dia que a loja funcionou
  const pendTang = new Map();  // colabId -> Map(data -> motivo) — pendência sinalizada pelo próprio Tangerino
  const PEND_L = { SAIDA: 'falta bater a saída', ENTRADA: 'falta bater a entrada', INTERVALO: 'intervalo em aberto' };
  for (const b of bat) {
    const c = porTang.get(String(b.employeeId)); if (!c) continue;
    const data = String(b.date || '').slice(0, 10); if (!data) continue;
    if (!diasBat.has(c.id)) diasBat.set(c.id, new Map());
    const dm = diasBat.get(c.id); if (!dm.has(data)) dm.set(data, []);
    if (b.dateIn) dm.get(data).push(Number(b.dateIn));
    if (b.dateOut) dm.get(data).push(Number(b.dateOut));
    // Tangerino já classifica: status PENDING / pendingType (ex.: SAIDA) = marcação pendente lá na origem.
    if (b.status === 'PENDING' || b.pendingType) {
      if (!pendTang.has(c.id)) pendTang.set(c.id, new Map());
      pendTang.get(c.id).set(data, PEND_L[b.pendingType] || 'pendente no Tangerino');
    }
    if (c.loja_id) { if (!diasOperando.has(c.loja_id)) diasOperando.set(c.loja_id, new Set()); diasOperando.get(c.loja_id).add(data); }
  }
  // folgas aprovadas e afastamentos no período
  const folgas = db.prepare(`SELECT colaborador_id, data FROM folgas WHERE empresa_id=? AND data BETWEEN ? AND ? AND (status IS NULL OR status IN ('aprovada','aprovado','confirmada'))`).all(emp, ini, fim);
  const folgaSet = new Map(); folgas.forEach(f => { if (!folgaSet.has(f.colaborador_id)) folgaSet.set(f.colaborador_id, new Set()); folgaSet.get(f.colaborador_id).add(String(f.data).slice(0, 10)); });
  const afast = db.prepare(`SELECT colaborador_id, data_inicio, data_fim FROM afastamentos WHERE empresa_id=? AND (status IS NULL OR status='aprovado') AND NOT (data_fim < ? OR data_inicio > ?)`).all(emp, ini, fim);
  const afastCobre = (colabId, data) => afast.some(a => a.colaborador_id === colabId && String(a.data_inicio).slice(0, 10) <= data && data <= String(a.data_fim).slice(0, 10));

  const todasDatas = diasEntre(ini, fim);
  const out = colabs.map(c => {
    const bmap = diasBat.get(c.id) || new Map();
    const opera = diasOperando.get(c.loja_id) || new Set();
    const temAlgumaBatida = bmap.size > 0; // só marca falta p/ quem realmente bate ponto
    const dias = [];
    let trabalhados = 0, pendencias = 0, faltas = 0, folga = 0, afastado = 0;
    for (const data of todasDatas) {
      const marcs = (bmap.get(data) || []).slice().sort((a, b) => a - b); // todas as batidas do dia
      const temFolga = folgaSet.get(c.id)?.has(data);
      const temAfast = afastCobre(c.id, data);
      const motivoPend = pendTang.get(c.id)?.get(data); // pendência que o Tangerino já apontou
      let situacao, motivo;
      if (marcs.length) {
        // pendente se o Tangerino sinalizou OU se ficou marcação em aberto (nº ímpar de batidas)
        const completo = marcs.length % 2 === 0 && !motivoPend;
        situacao = completo ? 'ok' : 'pendente';
        if (completo) trabalhados++; else { pendencias++; motivo = motivoPend || 'marcação em aberto'; }
      }
      else if (temFolga) { situacao = 'folga'; folga++; }
      else if (temAfast) { situacao = 'afastado'; afastado++; }
      else if (temAlgumaBatida && opera.has(data)) { situacao = 'falta'; faltas++; }
      else situacao = '—';
      if (situacao !== '—') dias.push({ data, situacao, motivo, marcacoes: marcs, qtd: marcs.length });
    }
    return { id: c.id, nome: c.nome, loja: c.loja, semRegistros: !temAlgumaBatida, trabalhados, pendencias, faltas, folga, afastado, dias };
  }).sort((a, b) => (b.faltas + b.pendencias) - (a.faltas + a.pendencias));
  res.json({ ok: true, periodo: { ini, fim }, colaboradores: out.filter(c => !c.semRegistros), semRegistros: out.filter(c => c.semRegistros).map(c => ({ id: c.id, nome: c.nome, loja: c.loja })) });
});

// ── Correções de ponto (solicitação → RH resolve) ────────────────────────
router.get('/correcoes', (req, res) => {
  const emp = req.usuario.empresa_id;
  const gestor = GESTAO.includes(req.usuario.funcao || req.usuario.funcao_nome);
  const rows = db.prepare(`SELECT co.*, c.nome colaborador FROM ponto_correcoes co JOIN colaboradores c ON c.id=co.colaborador_id
    WHERE co.empresa_id=? ${gestor ? '' : 'AND co.colaborador_id=?'} ORDER BY co.solicitado_em DESC LIMIT 200`).all(...(gestor ? [emp] : [emp, req.usuario.id]));
  res.json({ correcoes: rows, gestor });
});
router.post('/correcoes', (req, res) => {
  const b = req.body; if (!b.data) return res.status(400).json({ erro: 'Informe a data.' });
  const prazoDia = require('../lib/pontoPendencias').config(req.usuario.empresa_id).prazoDia;
  if (new Date().getDate() > prazoDia) return res.status(403).json({ erro: `Prazo encerrado: correções de ponto só até o dia ${prazoDia} de cada mês. Reabre no próximo mês.` });
  const id = uuid();
  db.prepare(`INSERT INTO ponto_correcoes (id,empresa_id,colaborador_id,data,tipo,horario,motivo,status,solicitado_por_id,solicitado_em)
    VALUES (?,?,?,?,?,?,?,'pendente',?,datetime('now'))`)
    .run(id, req.usuario.empresa_id, b.colaborador_id || req.usuario.id, b.data, b.tipo || 'outro', b.horario || null, b.motivo || null, req.usuario.id);
  res.json({ ok: true, id });
});
// Listas de justificativas (inserir batida) e motivos de ajuste (abono) do Tangerino.
router.get('/justificativas', exigePerfil(...GESTAO), async (req, res) => {
  if (!tang.habilitado()) return res.json({ justificativas: [], motivos: [] });
  try {
    const [j, m] = await Promise.all([tang.justificativas().catch(() => null), tang.motivosAjuste().catch(() => null)]);
    const arr = x => Array.isArray(x) ? x : (x && x.content) || [];
    res.json({ justificativas: arr(j).map(x => ({ id: x.id, descricao: x.description })), motivos: arr(m).map(x => ({ id: x.id, descricao: x.description, abono: x.allowance })) });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

router.post('/correcoes/:id/resolver', exigePerfil(...GESTAO), async (req, res) => {
  const emp = req.usuario.empresa_id;
  const co = db.prepare('SELECT * FROM ponto_correcoes WHERE id=? AND empresa_id=?').get(req.params.id, emp);
  if (!co) return res.status(404).json({ erro: 'Correção não encontrada.' });
  const st = req.body.status === 'aprovada' ? 'aprovada' : 'rejeitada';
  let resposta = req.body.resposta || null, empurrada = false;

  if (st === 'aprovada' && tang.habilitado()) {
    const colab = db.prepare('SELECT tangerino_id FROM colaboradores WHERE id=?').get(co.colaborador_id);
    if (!colab || !colab.tangerino_id) resposta = 'Aprovada. (Colaborador sem vínculo Tangerino — lançar manualmente.)';
    else {
      try {
        if ((co.tipo === 'entrada' || co.tipo === 'saida') && co.horario && req.body.justificationId) {
          await tang.inserirBatida({ employeeId: colab.tangerino_id, data: co.data, hora: co.horario, justificationId: req.body.justificationId });
          resposta = `✅ Batida ${co.horario} inserida no Tangerino.`; empurrada = true;
        } else if ((co.tipo === 'falta' || co.tipo === 'abono') && req.body.reasonId) {
          await tang.lancarAjuste({ employeeId: colab.tangerino_id, dataIni: co.data, reasonId: req.body.reasonId });
          resposta = `✅ Abono/ajuste lançado no Tangerino.`; empurrada = true;
        } else {
          resposta = 'Aprovada. (Escolha a justificativa/motivo para empurrar ao Tangerino, ou lance manualmente.)';
        }
      } catch (e) { resposta = 'Aprovada, mas FALHOU no Tangerino: ' + e.message; }
    }
  }
  db.prepare(`UPDATE ponto_correcoes SET status=?, resolvido_por_id=?, resolvido_por_nome=?, resolvido_em=datetime('now'), resposta=? WHERE id=? AND empresa_id=?`)
    .run(st, req.usuario.id, req.usuario.nome, resposta, req.params.id, emp);
  res.json({ ok: true, empurrada, resposta });
});

// ── Atestado do colaborador (auto-serviço → RH aprova → empurra ao Tangerino) ──
router.post('/atestado', (req, res) => {
  const b = req.body; if (!b.data_inicio) return res.status(400).json({ erro: 'Informe a data.' });
  const id = uuid();
  db.prepare(`INSERT INTO afastamentos (id,empresa_id,colaborador_id,lancado_por_id,tipo,data_inicio,data_fim,motivo,anexo_url,status)
    VALUES (?,?,?,?,'atestado',?,?,?,?,'pendente')`)
    .run(id, req.usuario.empresa_id, req.usuario.id, req.usuario.id, b.data_inicio, b.data_fim || b.data_inicio, b.motivo || null, b.anexo_url || null);
  // avisa o RH
  const rh = responsavelSetor(req.usuario.empresa_id, ['RH', 'Gestor Geral', 'Diretor Geral']);
  db.prepare(`INSERT INTO tarefas (id,empresa_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,status,criado_em,atualizado_em)
    VALUES (?,?, 'tarefa','atestado',?,?,?,?,'aberto',datetime('now'),datetime('now'))`)
    .run(uuid(), req.usuario.empresa_id, id, `🩺 Atestado de ${req.usuario.nome} p/ validar`.slice(0, 140),
      `Atestado de ${b.data_inicio}${b.data_fim && b.data_fim !== b.data_inicio ? ' a ' + b.data_fim : ''}. Validar e aprovar no menu Ponto → Atestados.`, rh);
  res.json({ ok: true, id });
});
router.get('/meus-atestados', (req, res) => {
  res.json({ atestados: db.prepare(`SELECT id, data_inicio, data_fim, motivo, status, criado_em FROM afastamentos WHERE empresa_id=? AND colaborador_id=? AND tipo='atestado' ORDER BY criado_em DESC LIMIT 50`).all(req.usuario.empresa_id, req.usuario.id) });
});
router.get('/atestados', exigePerfil(...GESTAO), (req, res) => {
  const rows = db.prepare(`SELECT a.id, a.colaborador_id, a.data_inicio, a.data_fim, a.motivo, a.status, a.anexo_url, a.tangerino_ok, a.criado_em, c.nome colaborador, c.tangerino_id
    FROM afastamentos a JOIN colaboradores c ON c.id=a.colaborador_id WHERE a.empresa_id=? AND a.tipo='atestado' ORDER BY (a.status='pendente') DESC, a.criado_em DESC LIMIT 200`).all(req.usuario.empresa_id);
  res.json({ atestados: rows });
});
router.post('/atestados/:id/resolver', exigePerfil(...GESTAO), async (req, res) => {
  const emp = req.usuario.empresa_id;
  const a = db.prepare(`SELECT * FROM afastamentos WHERE id=? AND empresa_id=? AND tipo='atestado'`).get(req.params.id, emp);
  if (!a) return res.status(404).json({ erro: 'Atestado não encontrado.' });
  const st = req.body.status === 'aprovado' ? 'aprovado' : 'rejeitado';
  let resposta = null, ok = false;
  if (st === 'aprovado') {
    const r = await require('../lib/afastamentoSync').push(emp, a.colaborador_id, 'atestado', a.data_inicio, a.data_fim);
    ok = !!r.ok; resposta = r.ok ? '✅ Abono de atestado lançado no Tangerino.' : (r.skip ? 'Aprovado (Tangerino: ' + r.skip + ').' : 'Aprovado, mas falhou no Tangerino: ' + r.erro);
  }
  db.prepare('UPDATE afastamentos SET status=?, tangerino_ok=? WHERE id=?').run(st, ok ? 1 : 0, a.id);
  db.prepare(`UPDATE tarefas SET status='concluido', atualizado_em=datetime('now') WHERE origem='atestado' AND referencia_id=?`).run(a.id);
  res.json({ ok: true, resposta });
});

// ── Faltas a confirmar (gerente decide: foi falta ou folga?) ──────────────
const GESTAO_FALTA = [...GESTAO, 'Gerente', 'Subgerente'];
router.get('/faltas', exigePerfil(...GESTAO_FALTA), (req, res) => {
  const rows = db.prepare(`SELECT p.id, p.colaborador_id, p.data, p.confirmada, p.pontos_descontados, c.nome colaborador, l.nome loja
    FROM ponto_pendencias p JOIN colaboradores c ON c.id=p.colaborador_id LEFT JOIN lojas l ON l.id=c.loja_id
    WHERE p.empresa_id=? AND p.tipo='falta' AND p.resolvido=0 ORDER BY p.confirmada, p.data DESC LIMIT 300`).all(req.usuario.empresa_id);
  res.json({ faltas: rows });
});
// Confirma a falta → desconta 50 pts e avisa o colaborador.
router.post('/faltas/:id/confirmar', exigePerfil(...GESTAO_FALTA), (req, res) => {
  const emp = req.usuario.empresa_id;
  const p = db.prepare(`SELECT * FROM ponto_pendencias WHERE id=? AND empresa_id=? AND tipo='falta'`).get(req.params.id, emp);
  if (!p || p.resolvido || p.confirmada) return res.status(400).json({ erro: 'Falta já tratada.' });
  const cfg = require('../lib/pontoPendencias').config(emp);
  const pts = cfg.penalidade ? cfg.ptsFalta : 0; // só desconta se a penalidade estiver ligada
  const c = db.prepare('SELECT nome, loja_id FROM colaboradores WHERE id=?').get(p.colaborador_id);
  const brData = String(p.data).split('-').reverse().join('/');
  if (pts > 0) db.prepare(`INSERT INTO pontos_lancamentos (id,empresa_id,colaborador_id,colaborador_nome,loja_id,tipo,descricao,pontos,competencia,origem,ref,criado_por,criado_em)
    VALUES (?,?,?,?,?,'penalidade',?,?,?,'ponto',?,?,datetime('now'))`)
    .run(uuid(), emp, p.colaborador_id, c.nome, c.loja_id || null, `Falta confirmada em ${brData}`, -pts, new Date().toISOString().slice(0, 7), p.id, req.usuario.id);
  db.prepare("UPDATE ponto_pendencias SET confirmada=1, pontos_descontados=?, ultimo_desconto_em=datetime('now') WHERE id=?").run(pts, p.id);
  // avisa o colaborador
  db.prepare(`INSERT INTO tarefas (id,empresa_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,status,criado_em,atualizado_em)
    VALUES (?,?, 'notificacao','ponto',?,?,?,?,'aberto',datetime('now'),datetime('now'))`)
    .run(uuid(), emp, p.id, `⛔ Falta registrada em ${brData}`.slice(0, 140), `Foi registrada uma falta sua em ${brData}${pts ? ` (−${pts} pontos)` : ''}. Se houver justificativa (atestado), envie no Meu RH.`, p.colaborador_id);
  db.prepare("UPDATE tarefas SET status='concluido', atualizado_em=datetime('now') WHERE origem='ponto' AND referencia_id=? AND status!='concluido'").run(p.id);
  res.json({ ok: true, descontou: pts });
});
// Era folga → registra folga (justifica) e resolve sem desconto.
router.post('/faltas/:id/folga', exigePerfil(...GESTAO_FALTA), (req, res) => {
  const emp = req.usuario.empresa_id;
  const p = db.prepare(`SELECT * FROM ponto_pendencias WHERE id=? AND empresa_id=? AND tipo='falta'`).get(req.params.id, emp);
  if (!p || p.resolvido) return res.status(400).json({ erro: 'Falta já tratada.' });
  const c = db.prepare('SELECT loja_id FROM colaboradores WHERE id=?').get(p.colaborador_id);
  db.prepare(`INSERT INTO folgas (id,empresa_id,loja_id,colaborador_id,data,status,solicitado_por_id,aprovado_por_id,aprovado_em,motivo,criado_em)
    VALUES (?,?,?,?,?,'aprovada',?,?,datetime('now'),?,datetime('now'))`)
    .run(uuid(), emp, c.loja_id || null, p.colaborador_id, p.data, req.usuario.id, req.usuario.id, 'Confirmado como folga (ponto)');
  // estorna se por acaso já havia desconto
  if (p.pontos_descontados > 0) db.prepare(`INSERT INTO pontos_lancamentos (id,empresa_id,colaborador_id,colaborador_nome,loja_id,tipo,descricao,pontos,competencia,origem,ref,criado_por,criado_em)
    VALUES (?,?,?,?,?,'estorno',?,?,?,'ponto',?,?,datetime('now'))`).run(uuid(), emp, p.colaborador_id, '', c.loja_id || null, 'Estorno (era folga)', p.pontos_descontados, new Date().toISOString().slice(0, 7), p.id, req.usuario.id);
  db.prepare("UPDATE ponto_pendencias SET resolvido=1, resolvido_em=datetime('now') WHERE id=?").run(p.id);
  db.prepare("UPDATE tarefas SET status='concluido', atualizado_em=datetime('now') WHERE origem='ponto' AND referencia_id=? AND status!='concluido'").run(p.id);
  res.json({ ok: true });
});

// Config da penalidade de ponto (liga/desliga + valores).
router.get('/config', exigePerfil(...GESTAO), (req, res) => res.json(require('../lib/pontoPendencias').config(req.usuario.empresa_id)));
router.post('/config', exigePerfil(...GESTAO), (req, res) => {
  const emp = req.usuario.empresa_id, b = req.body;
  const set = (k, v) => db.prepare(`INSERT INTO pontos_config (empresa_id,chave,valor,atualizado_em,atualizado_por) VALUES (?,?,?,datetime('now'),?)
    ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em, atualizado_por=excluded.atualizado_por`).run(emp, k, String(v), req.usuario.id);
  if ('jobAtivo' in b) set('ponto_job_ativo', b.jobAtivo ? '1' : '0');
  if ('penalidade' in b) set('ponto_penalidade_ativa', b.penalidade ? '1' : '0');
  if ('ptsIncompleto' in b) set('ponto_incompleto_pts', Number(b.ptsIncompleto) || 10);
  if ('ptsFalta' in b) set('ponto_falta_pts', Number(b.ptsFalta) || 50);
  if ('prazoDia' in b) set('ponto_prazo_dia', Math.min(28, Math.max(1, Number(b.prazoDia) || 26)));
  res.json({ ok: true, ...require('../lib/pontoPendencias').config(emp) });
});

// Processa pendências de ponto agora (tarefas + penalidades). Também roda agendado.
router.post('/processar-pendencias', exigePerfil(...GESTAO), async (req, res) => {
  try { res.json(await require('../lib/pontoPendencias').processar(req.usuario.empresa_id)); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});

router.get('/pendencias', exigePerfil(...GESTAO), (req, res) => {
  const rows = db.prepare(`SELECT p.*, c.nome colaborador FROM ponto_pendencias p JOIN colaboradores c ON c.id=p.colaborador_id
    WHERE p.empresa_id=? ORDER BY p.resolvido, p.criado_em DESC LIMIT 300`).all(req.usuario.empresa_id);
  res.json({ pendencias: rows });
});

// ── Escala de horário (semanal/mensal) — gerente lança a da equipe dele ──────
const escalaHorario = require('../lib/escalaHorario');
const GESTAO_ESCALA = [...GESTAO, 'Gerente', 'Subgerente'];
const hojeAno = () => new Date().getFullYear();
const hojeMes = () => new Date().getMonth() + 1;

router.get('/escala/colaboradores', exigePerfil(...GESTAO_ESCALA), (req, res) => {
  res.json({ colaboradores: escalaHorario.colaboradoresLoja(req.usuario.empresa_id, req.query.loja || req.usuario.loja_id || null) });
});
router.get('/escala', exigePerfil(...GESTAO_ESCALA), (req, res) => {
  const ano = Number(req.query.ano) || hojeAno(), mes = Number(req.query.mes) || hojeMes();
  if (!req.query.colaborador) return res.status(400).json({ erro: 'Informe o colaborador.' });
  res.json(escalaHorario.getEscala(req.usuario.empresa_id, { colaboradorId: req.query.colaborador, ano, mes }));
});
router.post('/escala/semanal', exigePerfil(...GESTAO_ESCALA), (req, res) => {
  const { lojaId, colaboradorId, ano, mes, dias } = req.body || {};
  if (!colaboradorId || !ano || !mes) return res.status(400).json({ erro: 'colaborador, ano e mês obrigatórios.' });
  res.json(escalaHorario.salvarSemanal(req.usuario.empresa_id, { lojaId, colaboradorId, ano: Number(ano), mes: Number(mes), dias, criadoPorId: req.usuario.id }));
});
router.post('/escala/data', exigePerfil(...GESTAO_ESCALA), (req, res) => {
  const { lojaId, colaboradorId, data, entrada, saida, folga } = req.body || {};
  if (!colaboradorId || !data) return res.status(400).json({ erro: 'colaborador e data obrigatórios.' });
  res.json(escalaHorario.salvarData(req.usuario.empresa_id, { lojaId, colaboradorId, data, entrada, saida, folga, criadoPorId: req.usuario.id }));
});

module.exports = router;
