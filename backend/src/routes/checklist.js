const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { auth, exigePerfil, exigePerfilOuLideranca } = require('../middleware/auth');
const { gerarTarefa } = require('./tarefas');
const { dispatchAvaliacaoAdmin, pendentesDoDia } = require('./avaliacaoAdmin');
const { parseAgenda, getAgenda } = require('../lib/agenda');
const calc = require('../lib/calculosVendas');

router.use(auth);

// Garante a tabela do ciclo de limpeza (abrir/fechar por colaborador) mesmo em bancos já existentes.
db.exec(`CREATE TABLE IF NOT EXISTS limpeza_dia (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, loja_id TEXT NOT NULL, colaborador_id TEXT NOT NULL,
  data TEXT NOT NULL, modelo_id TEXT, aberto_em TEXT, fechado INTEGER DEFAULT 0, fechado_em TEXT,
  respostas_json TEXT, execucao_id TEXT,
  UNIQUE(empresa_id, loja_id, colaborador_id, data)
);`);

// Configuração: tempo mínimo (minutos) entre abrir e fechar o checklist do dia. Default 240 (4h).
function getMinFechamento(empresaId) {
  const row = db.prepare(`SELECT valor FROM configuracoes WHERE empresa_id=? AND chave='checklist_min_min'`).get(empresaId);
  const n = row ? parseInt(row.valor) : NaN;
  return Number.isFinite(n) ? n : 240;
}

// GET /checklist/senha-do-dia — PIN sugerido do dia (só sugestão; não troca nada).
// Determinístico por empresa+pessoa+data: 6 dígitos diferentes a cada dia, um por pessoa.
function pinDoDia(empresaId, colaboradorId, dataISO) {
  const h = crypto.createHash('sha256').update(`mutti-senha-dia:${empresaId}:${colaboradorId}:${dataISO}`).digest('hex');
  return String(parseInt(h.slice(0, 12), 16) % 1000000).padStart(6, '0');
}
router.get('/senha-do-dia', exigePerfilOuLideranca('Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const hoje = new Date().toISOString().slice(0, 10);
  const empresa = req.usuario.empresa_id, loja = req.usuario.loja_id;
  const acha = nome => db.prepare(`SELECT c.id, c.nome FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND c.loja_id=? AND f.nome=? AND c.ativo=1 LIMIT 1`).get(empresa, loja, nome);
  const ger = acha('Gerente'), sub = acha('Subgerente');
  const pessoas = [];
  if (ger) pessoas.push({ nome: ger.nome, funcao: 'Gerente', pin: pinDoDia(empresa, ger.id, hoje) });
  if (sub) pessoas.push({ nome: sub.nome, funcao: 'Subgerente', pin: pinDoDia(empresa, sub.id, hoje) });
  // Liderança cobrindo hoje (não é o gerente/subgerente): mostra também o PIN dela.
  if (req.usuario.lideranca && req.usuario.id !== ger?.id && req.usuario.id !== sub?.id) {
    pessoas.push({ nome: req.usuario.nome, funcao: 'Liderança (substituto)', pin: pinDoDia(empresa, req.usuario.id, hoje) });
  }
  res.json({ data: hoje, pessoas });
});


router.get('/config', (req, res) => {
  res.json({
    checklist_min_min: getMinFechamento(req.usuario.empresa_id),
    diario_agenda: getAgenda(db, req.usuario.empresa_id, 'checklist_diario_agenda'),
    limpeza_agenda: getAgenda(db, req.usuario.empresa_id, 'checklist_limpeza_agenda'),
    operacional_agenda: getAgenda(db, req.usuario.empresa_id, 'checklist_operacional_agenda'),
  });
});

// POST /checklist/config — define o tempo mínimo de fechamento (gestão)
router.post('/config', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const min = Math.max(0, parseInt(req.body.checklist_min_min) || 0);
  db.prepare(`INSERT INTO configuracoes (empresa_id,chave,valor) VALUES (?,'checklist_min_min',?)
    ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor`).run(req.usuario.empresa_id, String(min));
  res.json({ mensagem: 'Tempo mínimo atualizado.', checklist_min_min: min });
});

// POST /checklist/config/agenda — define a agenda de dias de um checklist (gestão)
// body: { tipo: 'diario'|'limpeza'|'operacional', agenda } (compat: diario_agenda)
router.post('/config/agenda', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const tipos = { diario: 'checklist_diario_agenda', limpeza: 'checklist_limpeza_agenda', operacional: 'checklist_operacional_agenda' };
  const chave = tipos[req.body.tipo] || 'checklist_diario_agenda';
  const a = parseAgenda(req.body.agenda || req.body.diario_agenda);
  db.prepare(`INSERT INTO configuracoes (empresa_id,chave,valor) VALUES (?,?,?)
    ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor`).run(req.usuario.empresa_id, chave, JSON.stringify(a));
  res.json({ mensagem: 'Agenda atualizada.', tipo: req.body.tipo || 'diario', agenda: a });
});

// ── Atuação do dia: o gerente informa QUEM atuou como caixa/conferente (abre todos os colaboradores, não prende à função) ──
// GET /checklist/atuacao?loja_id=&data= — roster + quem já está marcado
router.get('/atuacao', (req, res) => {
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const data = req.query.data || new Date().toISOString().slice(0, 10);
  const roster = db.prepare(`SELECT c.id, c.nome, f.nome as funcao FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.ativo=1 AND f.id!='func-gerente'
      AND (c.loja_id=? OR c.id IN (SELECT colaborador_id FROM colaborador_lojas WHERE empresa_id=? AND loja_id=?))
    ORDER BY c.nome`).all(req.usuario.empresa_id, lojaId, req.usuario.empresa_id, lojaId);
  const desig = db.prepare(`SELECT colaborador_id, funcao_atuada FROM atuacao_dia WHERE empresa_id=? AND loja_id=? AND data=?`).all(req.usuario.empresa_id, lojaId, data);
  res.json({
    roster,
    caixas: desig.filter(d => d.funcao_atuada === 'func-caixa').map(d => d.colaborador_id),
    conferentes: desig.filter(d => d.funcao_atuada === 'func-conferente').map(d => d.colaborador_id),
    farmaceuticos: desig.filter(d => d.funcao_atuada === 'func-farmaceutico').map(d => d.colaborador_id),
    estagiarios: desig.filter(d => d.funcao_atuada === 'func-estagiario').map(d => d.colaborador_id),
  });
});

// POST /checklist/atuacao — grava quem atuou e libera as avaliações dos chefes (substitui a marcação do dia)
router.post('/atuacao', exigePerfilOuLideranca('Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const lojaId = req.body.loja_id || req.usuario.loja_id;
  const data = req.body.data || new Date().toISOString().slice(0, 10);
  const eid = req.usuario.empresa_id;
  const diaFechado = db.prepare(`SELECT fechado FROM gerente_checklist_dia WHERE empresa_id=? AND loja_id=? AND data=?`).get(eid, lojaId, data);
  if (diaFechado?.fechado) return res.status(400).json({ erro: 'O checklist do dia já foi fechado — não é mais possível alterar a atuação.' });
  const caixas = Array.isArray(req.body.caixas) ? req.body.caixas : [];
  const conferentes = Array.isArray(req.body.conferentes) ? req.body.conferentes : [];
  const farmaceuticos = Array.isArray(req.body.farmaceuticos) ? req.body.farmaceuticos : [];
  const estagiarios = Array.isArray(req.body.estagiarios) ? req.body.estagiarios : [];
  const designados = new Set([...caixas]); // só caixa vai pro chefe de setor; conferente é avaliado pelo gerente no checklist
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM atuacao_dia WHERE empresa_id=? AND loja_id=? AND data=?`).run(eid, lojaId, data);
    const ins = db.prepare(`INSERT OR IGNORE INTO atuacao_dia (id,empresa_id,loja_id,data,colaborador_id,funcao_atuada) VALUES (?,?,?,?,?,?)`);
    caixas.forEach(id => ins.run(uuidv4(), eid, lojaId, data, id, 'func-caixa'));
    conferentes.forEach(id => ins.run(uuidv4(), eid, lojaId, data, id, 'func-conferente'));
    farmaceuticos.forEach(id => ins.run(uuidv4(), eid, lojaId, data, id, 'func-farmaceutico'));
    estagiarios.forEach(id => ins.run(uuidv4(), eid, lojaId, data, id, 'func-estagiario'));
    // tira da fila quem não foi mais designado (apenas avaliações ainda PENDENTES)
    const pend = db.prepare(`SELECT id, avaliado_id FROM avaliacao_admin WHERE empresa_id=? AND loja_id=? AND data=? AND status='pendente'`).all(eid, lojaId, data);
    pend.forEach(p => {
      if (!designados.has(p.avaliado_id)) {
        db.prepare(`DELETE FROM avaliacao_admin_itens WHERE avaliacao_id=?`).run(p.id);
        db.prepare(`DELETE FROM avaliacao_admin WHERE id=?`).run(p.id);
      }
    });
  });
  tx();
  let aviso = '';
  try {
    const r = dispatchAvaliacaoAdmin(eid, lojaId, data, req.usuario.id);
    if (r && r.semChefe && r.semChefe.length) {
      aviso = ` ⚠️ ${r.semChefe.join(' e ')}: não há chefe de setor cadastrado, então a avaliação não foi gerada. Defina um "Chefe do setor" no cadastro do colaborador.`;
    }
  } catch (e) { console.error('dispatch atuacao', e.message); }
  res.json({ mensagem: 'Atuação registrada. Avaliações liberadas para os chefes de setor.' + aviso, caixas: caixas.length, conferentes: conferentes.length, farmaceuticos: farmaceuticos.length, estagiarios: estagiarios.length });
});

// GET /checklist/modelos?periodo=
router.get('/modelos', (req, res) => {
  let q = `SELECT * FROM checklist_modelos WHERE empresa_id = ? AND ativo = 1`;
  const params = [req.usuario.empresa_id];
  if (req.query.periodo) { q += ' AND periodo = ?'; params.push(req.query.periodo); }
  const modelos = db.prepare(q + ' ORDER BY periodo, nome').all(...params);
  modelos.forEach(m => { m.itens = db.prepare('SELECT * FROM checklist_itens WHERE modelo_id = ? ORDER BY ordem').all(m.id); });
  res.json({ modelos });
});

// POST /checklist/modelos — cria modelo + itens (gestão)
router.post('/modelos', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { nome, periodo, categoria, funcao_id, itens = [] } = req.body;
  if (!nome || !periodo) return res.status(400).json({ erro: 'Nome e período obrigatórios.' });
  const id = uuidv4();
  db.prepare(`INSERT INTO checklist_modelos (id,empresa_id,nome,periodo,categoria,funcao_id) VALUES (?,?,?,?,?,?)`)
    .run(id, req.usuario.empresa_id, nome, periodo, categoria || null, funcao_id || null);
  const ins = db.prepare(`INSERT INTO checklist_itens (id,modelo_id,texto,peso,ordem) VALUES (?,?,?,?,?)`);
  itens.forEach((it, i) => ins.run(uuidv4(), id, it.texto, it.peso || Math.round(100 / itens.length), i + 1));
  res.status(201).json({ mensagem: 'Modelo criado.', id });
});

// POST /checklist/executar — registra um check-in/out
// body: { modelo_id, respostas: [{ item_id, resposta:'ok'|'nok'|'na', observacao }] }
router.post('/executar', (req, res) => {
  const { modelo_id, respostas = [] } = req.body;
  const modelo = db.prepare('SELECT * FROM checklist_modelos WHERE id = ? AND empresa_id = ?').get(modelo_id, req.usuario.empresa_id);
  if (!modelo) return res.status(404).json({ erro: 'Modelo não encontrado.' });

  const itens = db.prepare('SELECT * FROM checklist_itens WHERE modelo_id = ?').all(modelo_id);
  const pesoItem = {}; itens.forEach(i => pesoItem[i.id] = i.peso || Math.round(100 / itens.length));

  // Nota Bom/Regular/Ruim: bom=100, regular=50, ruim=0, ponderada pelo peso do item. Item "ruim" gera correção.
  const notaItemBRR = r => r === 'bom' ? 100 : r === 'regular' ? 50 : 0;
  let somaPeso = 0, somaPond = 0;
  const negativos = [];
  respostas.forEach(r => {
    if (r.resposta === 'np') return; // não se aplica — fora do cálculo
    const p = pesoItem[r.item_id] || 0;
    somaPeso += p;
    somaPond += p * notaItemBRR(r.resposta);
    if (r.resposta === 'ruim') negativos.push(itens.find(i => i.id === r.item_id)?.texto || 'item');
  });
  const nota = somaPeso ? Math.round(somaPond / somaPeso) : 100;

  const execId = uuidv4();
  const hoje = new Date().toISOString().slice(0, 10);
  db.prepare(`INSERT INTO checklist_execucoes (id,empresa_id,loja_id,modelo_id,colaborador_id,periodo,data,nota) VALUES (?,?,?,?,?,?,?,?)`)
    .run(execId, req.usuario.empresa_id, req.usuario.loja_id, modelo_id, req.usuario.id, modelo.periodo, hoje, nota);
  const insR = db.prepare(`INSERT INTO checklist_respostas (id,execucao_id,item_id,resposta,observacao) VALUES (?,?,?,?,?)`);
  respostas.forEach(r => insR.run(uuidv4(), execId, r.item_id, r.resposta, r.observacao || null));

  // Regra universal: itens negativos geram tarefa para o gerente da loja
  let tarefa_gerada = false;
  if (negativos.length) {
    const gerente = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id = ? AND loja_id = ? AND funcao_id = 'func-gerente' AND ativo = 1 LIMIT 1`)
      .get(req.usuario.empresa_id, req.usuario.loja_id);
    if (gerente) {
      gerarTarefa({
        empresa_id: req.usuario.empresa_id, loja_id: req.usuario.loja_id, tipo: 'tarefa', origem: 'checklist',
        titulo: `Corrigir itens do checklist (${modelo.nome})`,
        descricao: `Itens negativos: ${negativos.join('; ')}.`,
        responsavel_id: gerente.id, urgente: nota < 70 ? 1 : 0, sla_horas: 24, criado_por: req.usuario.id,
      });
      tarefa_gerada = true;
    }
  }
  res.status(201).json({ mensagem: 'Checklist registrado.', nota, itens_negativos: negativos.length, tarefa_gerada });
});

// GET /checklist/execucoes?loja_id=&de=&ate=
router.get('/execucoes', (req, res) => {
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const execs = db.prepare(`
    SELECT e.*, m.nome as modelo_nome, c.nome as colaborador_nome
    FROM checklist_execucoes e
    JOIN checklist_modelos m ON m.id = e.modelo_id
    JOIN colaboradores c ON c.id = e.colaborador_id
    WHERE e.empresa_id = ? AND e.loja_id = ?
    ORDER BY e.data DESC, e.criado_em DESC LIMIT 60
  `).all(req.usuario.empresa_id, lojaId);
  const media = execs.length ? Math.round(execs.reduce((a, e) => a + e.nota, 0) / execs.length) : null;
  res.json({ execucoes: execs, media });
});

// ── Reposição (aba do checklist diário do gerente) ──
// GET /checklist/reposicao?loja_id=&data= — colaboradores da loja + se já avaliados hoje
router.get('/reposicao', (req, res) => {
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const data = req.query.data || new Date().toISOString().slice(0, 10);
  const colabs = db.prepare(`SELECT c.id, c.nome, f.nome as funcao FROM colaboradores c
    JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.ativo=1 AND f.id != 'func-gerente'
      AND (c.loja_id=? OR c.id IN (SELECT colaborador_id FROM colaborador_lojas WHERE empresa_id=? AND loja_id=?))
    ORDER BY c.nome`).all(req.usuario.empresa_id, lojaId, req.usuario.empresa_id, lojaId);
  const marcados = db.prepare(`SELECT colaborador_id, fez FROM reposicao_dia WHERE empresa_id=? AND loja_id=? AND data=?`).all(req.usuario.empresa_id, lojaId, data);
  const map = {}; marcados.forEach(m => { map[m.colaborador_id] = m.fez; });
  res.json({ data, colaboradores: colabs.map(c => ({ ...c, fez: map[c.id] != null ? map[c.id] : null })) });
});

// POST /checklist/reposicao — gerente marca quem fez/não fez; quem não fez recebe tarefa de ciência/correção
router.post('/reposicao', exigePerfilOuLideranca('Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const lojaId = req.body.loja_id || req.usuario.loja_id;
  const data = req.body.data || new Date().toISOString().slice(0, 10);
  const avaliacoes = req.body.avaliacoes || []; // [{colaborador_id, fez}]
  // Quem já foi avaliado hoje fica travado: não dá pra remarcar.
  const jaMarcados = new Set(db.prepare(`SELECT colaborador_id FROM reposicao_dia WHERE empresa_id=? AND loja_id=? AND data=?`)
    .all(req.usuario.empresa_id, lojaId, data).map(r => r.colaborador_id));
  const up = db.prepare(`INSERT INTO reposicao_dia (id,empresa_id,loja_id,colaborador_id,data,fez) VALUES (?,?,?,?,?,?)
    ON CONFLICT(empresa_id,colaborador_id,data) DO NOTHING`);
  let tarefas = 0, ignorados = 0;
  const mes = parseInt(data.slice(5, 7)), ano = parseInt(data.slice(0, 4));
  for (const a of avaliacoes) {
    if (jaMarcados.has(a.colaborador_id)) { ignorados++; continue; } // já avaliado: não remarca
    up.run(uuidv4(), req.usuario.empresa_id, lojaId, a.colaborador_id, data, a.fez ? 1 : 0);
    if (!a.fez) {
      // já existe tarefa de reposição aberta para esse colaborador nesse dia? evita duplicar
      const jaTem = db.prepare(`SELECT 1 FROM tarefas WHERE empresa_id=? AND origem='reposicao' AND responsavel_id=? AND status!='concluido' AND date(criado_em)=?`).get(req.usuario.empresa_id, a.colaborador_id, data);
      if (!jaTem) {
        gerarTarefa({
          empresa_id: req.usuario.empresa_id, loja_id: lojaId, tipo: 'notificacao', origem: 'reposicao',
          titulo: 'Reposição da seção pendente',
          descricao: 'Sua seção não foi reposta hoje. Confirme a ciência e faça a correção.',
          responsavel_id: a.colaborador_id, urgente: 0, sla_horas: 24, criado_por: req.usuario.id,
        });
        tarefas++;
      }
    }
  }
  // alerta de disciplina: colaborador com 3+ faltas de reposição no mês
  const alertas = db.prepare(`SELECT colaborador_id, COUNT(*) n FROM reposicao_dia
    WHERE empresa_id=? AND loja_id=? AND fez=0 AND CAST(strftime('%m',data) AS INTEGER)=? AND CAST(strftime('%Y',data) AS INTEGER)=?
    GROUP BY colaborador_id HAVING n>=3`).all(req.usuario.empresa_id, lojaId, mes, ano);
  res.json({ mensagem: ignorados ? `Reposição registrada. ${ignorados} já avaliado(s) hoje foram mantidos.` : 'Reposição registrada.', tarefas_geradas: tarefas, ja_avaliados: ignorados, alerta_disciplina: alertas.length > 0 });
});

// ── Checklist do gerente: 4 seções (33/15/15/37), check-in (manhã) + check-out (noite) ──
const { SECOES_GERENTE: SECOES_SEED } = require('../lib/secoesGerenteSeed');

// Lê as seções/itens do Checklist Diário do banco (com fallback para a semente)
function getSecoesGerente(empresaId) {
  let secs = [];
  try { secs = db.prepare(`SELECT * FROM gerente_secoes WHERE empresa_id=? AND ativo=1 ORDER BY ordem, nome`).all(empresaId); } catch (e) { secs = []; }
  if (!secs.length) return SECOES_SEED;
  return secs.map(s => ({
    secao: s.nome, peso: s.peso,
    itens: db.prepare(`SELECT nome FROM gerente_itens WHERE empresa_id=? AND secao_id=? AND ativo=1 ORDER BY ordem, nome`).all(empresaId, s.id).map(i => i.nome),
  }));
}
const notaItem = av => av === 'bom' ? 100 : av === 'regular' ? 50 : 0;

// Notas das funções avaliadas no dia (farmacêutico/estagiário) que entram como seção no score do gerente.
// Cada função presente vira uma "seção" com peso próprio; também alimenta o indicador individual da pessoa (via /avaliacoes).
// (Conferente NÃO entra aqui — segue avaliado normalmente, sem compor o score do gerente.)
const ROLE_SECOES = [
  { funcao_id: 'func-farmaceutico', nome: 'Farmacêutico', peso: 10 },
  { funcao_id: 'func-estagiario', nome: 'Estagiário', peso: 10 },
];
function notasFuncoesDia(empresaId, lojaId, data) {
  const [ano, mes] = data.split('-').map(Number);
  const out = [];
  for (const rs of ROLE_SECOES) {
    const pessoas = db.prepare(`SELECT colaborador_id FROM atuacao_dia WHERE empresa_id=? AND loja_id=? AND data=? AND funcao_atuada=?`).all(empresaId, lojaId, data, rs.funcao_id);
    if (!pessoas.length) continue;
    const cfg = db.prepare(`SELECT indicador, label, peso FROM config_indicadores WHERE empresa_id=? AND funcao_id=? AND ativo=1`).all(empresaId, rs.funcao_id);
    if (!cfg.length) continue;
    const notas = [];
    pessoas.forEach(p => {
      const rows = db.prepare(`SELECT indicador, avaliacao FROM avaliacoes_funcao WHERE colaborador_id=? AND mes=? AND ano=?`).all(p.colaborador_id, mes, ano);
      if (!rows.length) return;
      const mapa = {}; rows.forEach(r => mapa[r.indicador] = r.avaliacao);
      notas.push(calc.calcNotaIndicadores(mapa, cfg));
    });
    if (notas.length) out.push({ nome: rs.nome, peso: rs.peso, nota: Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) });
  }
  return out;
}

function scoreChecklist(empresaId, lojaId, data) {
  const rows = db.prepare(`SELECT secao, item, avaliacao FROM gerente_checklist WHERE empresa_id=? AND loja_id=? AND data=?`).all(empresaId, lojaId, data);
  const map = {}; rows.forEach(r => { map[`${r.secao}__${r.item}`] = r.avaliacao; });
  let total = 0, pesoUsado = 0, avaliados = 0, totalItens = 0;
  getSecoesGerente(empresaId).forEach(sec => {
    let soma = 0, n = 0;
    sec.itens.forEach(it => {
      totalItens++;
      const av = map[`${sec.secao}__${it}`];
      if (av) { avaliados++; if (av !== 'np') { soma += notaItem(av); n++; } } // N/P = não se aplica, fora do cálculo
    });
    if (n) { total += (soma / n) * sec.peso; pesoUsado += sec.peso; }
  });
  // Farmacêutico/Estagiário do dia: média das avaliações por pessoa (informados nos seletores) entra como seção
  notasFuncoesDia(empresaId, lojaId, data).forEach(rs => { total += rs.nota * rs.peso; pesoUsado += rs.peso; });
  return { nota: pesoUsado ? Math.round(total / pesoUsado) : 100, completo: avaliados === totalItens, avaliados, total_itens: totalItens };
}

// GET /checklist/gerente?loja_id=&data=
router.get('/gerente', (req, res) => {
  const lojaId = req.query.loja_id || req.usuario.loja_id;
  const data = req.query.data || new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`SELECT secao, item, avaliacao FROM gerente_checklist WHERE empresa_id=? AND loja_id=? AND data=?`).all(req.usuario.empresa_id, lojaId, data);
  const aval = {}; rows.forEach(r => { aval[`${r.secao}__${r.item}`] = r.avaliacao; });
  const dia = db.prepare(`SELECT aberto_em, fechado_em, fechado, limpeza_status, limpeza_motivo FROM gerente_checklist_dia WHERE empresa_id=? AND loja_id=? AND data=?`).get(req.usuario.empresa_id, lojaId, data);
  const score = scoreChecklist(req.usuario.empresa_id, lojaId, data);
  let pendAdmin = 0;
  try { pendAdmin = pendentesDoDia(req.usuario.empresa_id, lojaId, data); } catch (e) { /* tabela pode não existir */ }
  res.json({
    data, secoes: getSecoesGerente(req.usuario.empresa_id), avaliacoes: aval, score,
    aberto: !!dia?.aberto_em, aberto_em: dia?.aberto_em || null,
    fechado: dia?.fechado ? 1 : 0, fechado_em: dia?.fechado_em || null,
    pend_admin: pendAdmin,
    finalizado: !!(dia?.fechado && pendAdmin === 0),
    validado: !!(dia?.fechado && score.completo && score.nota >= 95),
    limpeza_status: dia?.limpeza_status || null, limpeza_motivo: dia?.limpeza_motivo || null,
  });
});

// POST /checklist/gerente/abrir — abre o checklist do dia (de manhã)
router.post('/gerente/abrir', exigePerfilOuLideranca('Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const lojaId = req.body.loja_id || req.usuario.loja_id;
  const data = req.body.data || new Date().toISOString().slice(0, 10);
  const dia = db.prepare(`SELECT aberto_em FROM gerente_checklist_dia WHERE empresa_id=? AND loja_id=? AND data=?`).get(req.usuario.empresa_id, lojaId, data);
  if (dia?.aberto_em) return res.json({ mensagem: 'Já estava aberto.', aberto_em: dia.aberto_em });
  db.prepare(`INSERT INTO gerente_checklist_dia (id,empresa_id,loja_id,data,aberto_em) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,loja_id,data) DO UPDATE SET aberto_em=datetime('now')`).run(uuidv4(), req.usuario.empresa_id, lojaId, data);
  try { dispatchAvaliacaoAdmin(req.usuario.empresa_id, lojaId, data, req.usuario.id); } catch (e) { console.error('dispatchAvaliacaoAdmin', e.message); }
  // Ao abrir, o card do Checklist Diário no Kanban passa para "em andamento"
  db.prepare(`UPDATE tarefas SET status='andamento', atualizado_em=datetime('now') WHERE empresa_id=? AND origem='checklist_diario' AND referencia_id=? AND status='aberto'`).run(req.usuario.empresa_id, `${lojaId}:${data}`);
  res.json({ mensagem: 'Checklist aberto. Confira ao longo do dia e feche no fim do expediente.' });
});

// POST /checklist/gerente — salva itens (precisa estar aberto); item Ruim gera tarefa 24h
router.post('/gerente', exigePerfilOuLideranca('Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const lojaId = req.body.loja_id || req.usuario.loja_id;
  const data = req.body.data || new Date().toISOString().slice(0, 10);
  const dia = db.prepare(`SELECT aberto_em, fechado FROM gerente_checklist_dia WHERE empresa_id=? AND loja_id=? AND data=?`).get(req.usuario.empresa_id, lojaId, data);
  if (!dia?.aberto_em) return res.status(400).json({ erro: 'Abra o checklist primeiro (botão "Abrir checklist").' });
  if (dia.fechado) return res.status(400).json({ erro: 'O checklist do dia já foi fechado.' });
  const avaliacoes = req.body.avaliacoes || [];
  const up = db.prepare(`INSERT INTO gerente_checklist (id,empresa_id,loja_id,data,secao,item,avaliacao) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(empresa_id,loja_id,data,secao,item) DO UPDATE SET avaliacao=excluded.avaliacao`);
  let tarefas = 0;
  // resolve a função-alvo configurada (item herda da seção) em uma pessoa da loja; senão cai no gerente atual
  const resolverResp = (funcaoId) => {
    if (!funcaoId) return req.usuario.id;
    const p = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND loja_id=? AND funcao_id=? AND ativo=1 ORDER BY chefe_setor DESC LIMIT 1`).get(req.usuario.empresa_id, lojaId, funcaoId);
    return p?.id || req.usuario.id;
  };
  // Itens que, em Regular/Ruim, abrem tarefa para Compras (gerente escolhe a área) com a equipe como apoio
  const GRUPO_COMERCIAL = ['Seção Beleza sem buraco', 'Seção Bem estar sem buraco', 'Pontas de Gôndola Beleza Cheia', 'Paletes de ofertas Cheios', 'Cestões organizados e cheios'];
  // Itens que, em Regular/Ruim, abrem tarefa para o conferente com o chefe do Suporte ciente
  const GRUPO_SUPORTE = ['Estoque arrumado', 'Sala de Conferência de mercadorias', 'Área de devolução'];
  const eid = req.usuario.empresa_id;
  const acharFuncao = (funcaoId, soLoja) => db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND funcao_id=? AND ativo=1 ${soLoja ? 'AND loja_id=?' : ''} ORDER BY chefe_setor DESC LIMIT 1`).get(...(soLoja ? [eid, funcaoId, lojaId] : [eid, funcaoId]))?.id || null;
  const jaTemTarefa = (origem, item) => db.prepare(`SELECT 1 FROM tarefas WHERE empresa_id=? AND origem=? AND titulo LIKE ? AND status!='concluido' AND date(criado_em)=?`).get(eid, origem, `%${item}%`, data);

  for (const a of avaliacoes) {
    up.run(uuidv4(), eid, lojaId, data, a.secao, a.item, a.avaliacao);
    const ruimOuReg = a.avaliacao === 'ruim' || a.avaliacao === 'regular';

    if (ruimOuReg && GRUPO_COMERCIAL.includes(a.item)) {
      if (!jaTemTarefa('checklist_comercial', a.item)) {
        const area = a.area || (/beleza/i.test(a.item) ? 'Beleza' : /bem.?estar/i.test(a.item) ? 'Bem-estar' : 'Beleza');
        // Roteia para o comprador da área (Beleza/Bem-estar); cai no Comercial geral se ainda não houver comprador cadastrado.
        const funcAlvo = area === 'Bem-estar' ? 'func-compras-bemestar' : 'func-compras-beleza';
        const chefe = acharFuncao(funcAlvo) || acharFuncao('func-comercial');
        const funcEquipe = acharFuncao(funcAlvo) ? funcAlvo : 'func-comercial';
        const apoio = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND funcao_id=? AND ativo=1 AND id!=? LIMIT 1`).get(eid, funcEquipe, chefe || '')?.id || null;
        gerarTarefa({ empresa_id: eid, loja_id: lojaId, tipo: 'tarefa', origem: 'checklist_comercial', referencia_id: `${lojaId}:${data}:${a.item}`,
          titulo: `Compras (${area}): ${a.item}`,
          descricao: `O gerente avaliou "${a.item}" como ${a.avaliacao} (área ${area}). Verifique a reposição/abastecimento. Se entender que o produto foi comprado ou está na loja, peça reanálise.`,
          responsavel_id: chefe || req.usuario.id, apoio_id: apoio, urgente: 0, sla_horas: 48, criado_por: req.usuario.id });
        tarefas++;
      }
      continue;
    }

    if (ruimOuReg && GRUPO_SUPORTE.includes(a.item)) {
      if (!jaTemTarefa('checklist_suporte', a.item)) {
        const conf = acharFuncao('func-conferente', true);
        const chefeSup = acharFuncao('func-suporte');
        gerarTarefa({ empresa_id: eid, loja_id: lojaId, tipo: 'tarefa', origem: 'checklist_suporte', referencia_id: `${lojaId}:${data}:${a.item}`,
          titulo: `Pendência: ${a.item}`,
          descricao: `O gerente avaliou "${a.item}" como ${a.avaliacao}. Regularize. O chefe do Suporte está ciente.`,
          responsavel_id: conf || chefeSup || req.usuario.id, apoio_id: chefeSup, urgente: 0, sla_horas: 24, criado_por: req.usuario.id });
        tarefas++;
      }
      continue;
    }

    if (a.avaliacao === 'ruim') {
      const jaTem = db.prepare(`SELECT 1 FROM tarefas WHERE empresa_id=? AND origem='checklist_gerente' AND titulo=? AND status!='concluido' AND date(criado_em)=?`).get(eid, `Corrigir: ${a.item}`, data);
      if (!jaTem) {
        const secRow = db.prepare(`SELECT id, responsavel_pendencia FROM gerente_secoes WHERE empresa_id=? AND nome=?`).get(eid, a.secao);
        const itRow = secRow ? db.prepare(`SELECT responsavel_pendencia FROM gerente_itens WHERE empresa_id=? AND secao_id=? AND nome=?`).get(eid, secRow.id, a.item) : null;
        const funcaoAlvo = (itRow && itRow.responsavel_pendencia) || (secRow && secRow.responsavel_pendencia) || null;
        gerarTarefa({ empresa_id: eid, loja_id: lojaId, tipo: 'tarefa', origem: 'checklist_gerente',
          titulo: `Corrigir: ${a.item}`, descricao: `Item "${a.item}" (${a.secao}) avaliado como Ruim no checklist. Corrija em 24h.`,
          responsavel_id: resolverResp(funcaoAlvo), urgente: 0, sla_horas: 24, criado_por: req.usuario.id });
        tarefas++;
      }
    }
  }
  res.json({ mensagem: 'Checklist salvo.', tarefas_geradas: tarefas, score: scoreChecklist(eid, lojaId, data) });
});

// Reanálise nas tarefas de checklist (vai e volta entre gerente e comprador/conferente)
router.post('/tarefa/:id/reanalise', (req, res) => {
  const t = db.prepare(`SELECT * FROM tarefas WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!t) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  if (!['checklist_comercial', 'checklist_suporte'].includes(t.origem)) return res.status(400).json({ erro: 'Reanálise não disponível para esta tarefa.' });
  const souResponsavel = t.responsavel_id === req.usuario.id;
  // responsável (comprador/conferente) pede reanálise → vai ao gerente que abriu; gerente insiste → volta ao responsável
  const destino = souResponsavel ? t.criado_por : t.responsavel_id;
  if (!destino) return res.status(400).json({ erro: 'Sem destinatário para a reanálise.' });
  gerarTarefa({ empresa_id: req.usuario.empresa_id, loja_id: t.loja_id, tipo: 'notificacao', origem: 'checklist_reanalise', referencia_id: t.id,
    titulo: `Reanálise: ${t.titulo}`,
    descricao: `${req.usuario.nome} pediu reanálise. ${req.body.texto || ''}`.trim(),
    responsavel_id: destino, urgente: 0, sla_horas: 48, criado_por: req.usuario.id });
  res.json({ mensagem: 'Reanálise enviada.' });
});

// POST /checklist/gerente/fechar — fecha o dia; exige limpeza finalizada (ou justificar/penalizar)
router.post('/gerente/fechar', exigePerfilOuLideranca('Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const lojaId = req.body.loja_id || req.usuario.loja_id;
  const data = req.body.data || new Date().toISOString().slice(0, 10);
  const { acao, motivo } = req.body;
  const dia = db.prepare(`SELECT aberto_em, fechado FROM gerente_checklist_dia WHERE empresa_id=? AND loja_id=? AND data=?`).get(req.usuario.empresa_id, lojaId, data);
  if (!dia?.aberto_em) return res.status(400).json({ erro: 'Abra o checklist antes de fechar.' });
  if (dia.fechado) return res.json({ ok: true, mensagem: 'Já estava fechado.' });

  // Trava de tempo: mínimo configurável entre abrir e fechar (default 4h; 0 para testes)
  const minMin = getMinFechamento(req.usuario.empresa_id);
  const minutos = (Date.now() - new Date(dia.aberto_em.replace(' ', 'T') + 'Z').getTime()) / 60000;
  if (minutos < minMin) return res.json({ ok: false, cedo_demais: true, faltam_min: Math.ceil(minMin - minutos) });

  // Dependência da reposição: o gerente precisa ter registrado a reposição do dia (aba Reposição)
  const temReposicao = db.prepare(`SELECT 1 FROM reposicao_dia WHERE empresa_id=? AND loja_id=? AND data=? LIMIT 1`).get(req.usuario.empresa_id, lojaId, data);
  if (!temReposicao) return res.json({ ok: false, precisa_reposicao: true });

  // Dependência da limpeza: todos os colaboradores de limpeza da loja precisam ter feito o checklist hoje
  const limpezaColabs = db.prepare(`SELECT id, nome FROM colaboradores WHERE empresa_id=? AND loja_id=? AND funcao_id='func-limpeza' AND ativo=1`).all(req.usuario.empresa_id, lojaId);
  const pendentes = limpezaColabs.filter(c => !db.prepare(`SELECT 1 FROM checklist_execucoes WHERE empresa_id=? AND loja_id=? AND colaborador_id=? AND date(data)=? LIMIT 1`).get(req.usuario.empresa_id, lojaId, c.id, data));

  let limpezaStatus = 'ok';
  if (pendentes.length) {
    if (!acao) return res.json({ ok: false, precisa_limpeza: true, limpeza_colaborador: pendentes.map(c => c.nome).join(', ') });
    if (acao === 'justificar') limpezaStatus = 'justificado';
    else if (acao === 'penalizar') {
      limpezaStatus = 'penalizado';
      pendentes.forEach(c => gerarTarefa({ empresa_id: req.usuario.empresa_id, loja_id: lojaId, tipo: 'notificacao', origem: 'ocorrencia',
        referencia_id: c.id, titulo: 'Penalização — limpeza não finalizada',
        descricao: `Checklist de limpeza não finalizado em ${data}. ${motivo || ''}`.trim(),
        responsavel_id: c.id, urgente: 0, sla_horas: 24, criado_por: req.usuario.id }));
    } else return res.status(400).json({ erro: 'Ação inválida.' });
  }
  // Avaliações dos chefes de setor NÃO travam o fechamento: o gerente fecha a parte dele
  // e o dia fica "pendente" até os chefes avaliarem (aí vira "finalizado").
  let pendAdmin = 0;
  try { pendAdmin = pendentesDoDia(req.usuario.empresa_id, lojaId, data); } catch (e) { console.error('pendentesDoDia', e.message); }

  db.prepare(`UPDATE gerente_checklist_dia SET fechado=1, fechado_em=datetime('now'), limpeza_status=?, limpeza_motivo=? WHERE empresa_id=? AND loja_id=? AND data=?`)
    .run(limpezaStatus, motivo || null, req.usuario.empresa_id, lojaId, data);
  // Conclui o card "Checklist Diário" do dia no Kanban (se existir)
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now'), atualizado_em=datetime('now')
    WHERE empresa_id=? AND origem='checklist_diario' AND referencia_id=? AND status!='concluido'`).run(req.usuario.empresa_id, `${lojaId}:${data}`);
  res.json({ ok: true, mensagem: pendAdmin > 0 ? `Dia fechado. Fica pendente até os chefes de setor avaliarem (${pendAdmin}).` : 'Checklist do dia finalizado.', limpeza_status: limpezaStatus, pend_admin: pendAdmin });
});

// ── Cadastro das seções/itens do Checklist Diário ──
router.get('/gerente-secoes', (req, res) => {
  const eid = req.usuario.empresa_id;
  const secoes = db.prepare(`SELECT * FROM gerente_secoes WHERE empresa_id=? ORDER BY ordem, nome`).all(eid).map(s => ({
    ...s, itens: db.prepare(`SELECT * FROM gerente_itens WHERE empresa_id=? AND secao_id=? ORDER BY ordem, nome`).all(eid, s.id),
  }));
  const totalPeso = secoes.filter(s => s.ativo).reduce((a, s) => a + (s.peso || 0), 0);
  res.json({ secoes, total_peso: totalPeso });
});

router.post('/gerente-secoes', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const { nome, peso } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome da seção é obrigatório.' });
  const eid = req.usuario.empresa_id;
  const ordem = (db.prepare(`SELECT MAX(ordem) m FROM gerente_secoes WHERE empresa_id=?`).get(eid)?.m ?? -1) + 1;
  const id = uuidv4();
  db.prepare(`INSERT INTO gerente_secoes (id,empresa_id,nome,peso,ordem,ativo) VALUES (?,?,?,?,?,1)`).run(id, eid, nome, Number(peso) || 0, ordem);
  res.status(201).json({ id, mensagem: 'Seção criada.' });
});

router.patch('/gerente-secoes/:id', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const s = db.prepare(`SELECT * FROM gerente_secoes WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!s) return res.status(404).json({ erro: 'Seção não encontrada.' });
  const { nome, peso, ativo, responsavel_pendencia } = req.body;
  db.prepare(`UPDATE gerente_secoes SET nome=?, peso=?, ativo=?, responsavel_pendencia=? WHERE id=?`)
    .run(nome ?? s.nome, peso != null ? Number(peso) : s.peso, ativo != null ? (ativo ? 1 : 0) : s.ativo, responsavel_pendencia !== undefined ? (responsavel_pendencia || null) : s.responsavel_pendencia, s.id);
  res.json({ mensagem: 'Seção atualizada.' });
});

router.post('/gerente-secoes/:id/itens', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const eid = req.usuario.empresa_id;
  const s = db.prepare(`SELECT id FROM gerente_secoes WHERE id=? AND empresa_id=?`).get(req.params.id, eid);
  if (!s) return res.status(404).json({ erro: 'Seção não encontrada.' });
  if (!req.body.nome) return res.status(400).json({ erro: 'Nome do item é obrigatório.' });
  const ordem = (db.prepare(`SELECT MAX(ordem) m FROM gerente_itens WHERE empresa_id=? AND secao_id=?`).get(eid, s.id)?.m ?? -1) + 1;
  const id = uuidv4();
  db.prepare(`INSERT INTO gerente_itens (id,empresa_id,secao_id,nome,ordem,ativo) VALUES (?,?,?,?,?,1)`).run(id, eid, s.id, req.body.nome, ordem);
  res.status(201).json({ id, mensagem: 'Item criado.' });
});

router.patch('/gerente-itens/:id', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const i = db.prepare(`SELECT * FROM gerente_itens WHERE id=? AND empresa_id=?`).get(req.params.id, req.usuario.empresa_id);
  if (!i) return res.status(404).json({ erro: 'Item não encontrado.' });
  const { nome, ativo, responsavel_pendencia } = req.body;
  db.prepare(`UPDATE gerente_itens SET nome=?, ativo=?, responsavel_pendencia=? WHERE id=?`).run(nome ?? i.nome, ativo != null ? (ativo ? 1 : 0) : i.ativo, responsavel_pendencia !== undefined ? (responsavel_pendencia || null) : i.responsavel_pendencia, i.id);
  res.json({ mensagem: 'Item atualizado.' });
});

// ───────────────────────────────────────────────────────────────────────────
// Checklist de Limpeza com ciclo ABRIR/FECHAR (igual o Diário, mas por colaborador da limpeza).
// Usa o modelo diário de limpeza (periodo='diario', categoria='limpeza'). Ao fechar, grava
// uma execução normal (checklist_execucoes) — assim o painel e o fechamento do gerente seguem iguais.
// A trava de tempo reaproveita a MESMA configuração do Diário (checklist_min_min).
function modeloLimpezaDiario(empresaId) {
  return db.prepare(`SELECT * FROM checklist_modelos WHERE empresa_id=? AND periodo='diario' AND categoria='limpeza' AND ativo=1 ORDER BY criado_em LIMIT 1`).get(empresaId);
}

// GET /checklist/limpeza?data= — estado do dia do colaborador + itens + respostas salvas
router.get('/limpeza', (req, res) => {
  const data = req.query.data || new Date().toISOString().slice(0, 10);
  const lojaId = req.usuario.loja_id;
  const modelo = modeloLimpezaDiario(req.usuario.empresa_id);
  if (!modelo) return res.json({ modelo: null, itens: [], aberto: false, fechado: 0, respostas: {}, min_min: getMinFechamento(req.usuario.empresa_id) });
  const itens = db.prepare(`SELECT id, texto, peso FROM checklist_itens WHERE modelo_id=? ORDER BY ordem, texto`).all(modelo.id);
  const dia = db.prepare(`SELECT aberto_em, fechado, fechado_em, respostas_json FROM limpeza_dia WHERE empresa_id=? AND loja_id=? AND colaborador_id=? AND data=?`).get(req.usuario.empresa_id, lojaId, req.usuario.id, data);
  let respostas = {};
  if (dia?.respostas_json) { try { respostas = JSON.parse(dia.respostas_json); } catch (e) { respostas = {}; } }
  res.json({
    modelo: { id: modelo.id, nome: modelo.nome },
    itens,
    aberto: !!dia?.aberto_em, aberto_em: dia?.aberto_em || null,
    fechado: dia?.fechado ? 1 : 0, fechado_em: dia?.fechado_em || null,
    respostas, min_min: getMinFechamento(req.usuario.empresa_id),
  });
});

// POST /checklist/limpeza/abrir — abre o dia (de manhã)
router.post('/limpeza/abrir', (req, res) => {
  const data = req.body.data || new Date().toISOString().slice(0, 10);
  const lojaId = req.usuario.loja_id;
  const modelo = modeloLimpezaDiario(req.usuario.empresa_id);
  if (!modelo) return res.status(400).json({ erro: 'Nenhum checklist de limpeza diário cadastrado.' });
  const dia = db.prepare(`SELECT aberto_em FROM limpeza_dia WHERE empresa_id=? AND loja_id=? AND colaborador_id=? AND data=?`).get(req.usuario.empresa_id, lojaId, req.usuario.id, data);
  if (dia?.aberto_em) return res.json({ mensagem: 'Já estava aberto.', aberto_em: dia.aberto_em });
  db.prepare(`INSERT INTO limpeza_dia (id,empresa_id,loja_id,colaborador_id,data,modelo_id,aberto_em) VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,loja_id,colaborador_id,data) DO UPDATE SET aberto_em=datetime('now'), modelo_id=excluded.modelo_id`)
    .run(uuidv4(), req.usuario.empresa_id, lojaId, req.usuario.id, data, modelo.id);
  db.prepare(`UPDATE tarefas SET status='andamento', atualizado_em=datetime('now') WHERE empresa_id=? AND origem='checklist_limpeza' AND referencia_id=? AND status='aberto'`).run(req.usuario.empresa_id, `${req.usuario.id}:${data}`);
  res.json({ mensagem: 'Checklist de limpeza aberto. Confira ao longo do dia e feche no fim.' });
});

// POST /checklist/limpeza/salvar — salva o progresso (precisa estar aberto e não fechado)
router.post('/limpeza/salvar', (req, res) => {
  const data = req.body.data || new Date().toISOString().slice(0, 10);
  const lojaId = req.usuario.loja_id;
  const dia = db.prepare(`SELECT aberto_em, fechado FROM limpeza_dia WHERE empresa_id=? AND loja_id=? AND colaborador_id=? AND data=?`).get(req.usuario.empresa_id, lojaId, req.usuario.id, data);
  if (!dia?.aberto_em) return res.status(400).json({ erro: 'Abra o checklist primeiro.' });
  if (dia.fechado) return res.status(400).json({ erro: 'O checklist do dia já foi fechado.' });
  const respostas = req.body.respostas || {};
  db.prepare(`UPDATE limpeza_dia SET respostas_json=? WHERE empresa_id=? AND loja_id=? AND colaborador_id=? AND data=?`)
    .run(JSON.stringify(respostas), req.usuario.empresa_id, lojaId, req.usuario.id, data);
  res.json({ mensagem: 'Progresso salvo.' });
});

// POST /checklist/limpeza/fechar — aplica a trava de tempo, gera a execução (nota) e fecha
router.post('/limpeza/fechar', (req, res) => {
  const data = req.body.data || new Date().toISOString().slice(0, 10);
  const lojaId = req.usuario.loja_id;
  const dia = db.prepare(`SELECT * FROM limpeza_dia WHERE empresa_id=? AND loja_id=? AND colaborador_id=? AND data=?`).get(req.usuario.empresa_id, lojaId, req.usuario.id, data);
  if (!dia?.aberto_em) return res.status(400).json({ erro: 'Abra o checklist antes de fechar.' });
  if (dia.fechado) return res.json({ ok: true, mensagem: 'Já estava fechado.' });

  // Trava de tempo: mesma config do Diário (checklist_min_min)
  const minMin = getMinFechamento(req.usuario.empresa_id);
  const minutos = (Date.now() - new Date(dia.aberto_em.replace(' ', 'T') + 'Z').getTime()) / 60000;
  if (minutos < minMin) return res.json({ ok: false, cedo_demais: true, faltam_min: Math.ceil(minMin - minutos) });

  let respostas = req.body.respostas;
  if (!respostas) { try { respostas = JSON.parse(dia.respostas_json || '{}'); } catch (e) { respostas = {}; } }
  const modelo = db.prepare(`SELECT * FROM checklist_modelos WHERE id=?`).get(dia.modelo_id);
  const itens = db.prepare(`SELECT * FROM checklist_itens WHERE modelo_id=?`).all(dia.modelo_id);
  const pesoItem = {}; itens.forEach(i => pesoItem[i.id] = i.peso || Math.round(100 / itens.length));
  const notaItemBRR = r => r === 'bom' ? 100 : r === 'regular' ? 50 : 0;
  let somaPeso = 0, somaPond = 0; const negativos = [];
  const respArr = Object.entries(respostas).map(([item_id, resposta]) => ({ item_id, resposta }));
  respArr.forEach(r => {
    if (r.resposta === 'np') return; // não se aplica — fora do cálculo
    const p = pesoItem[r.item_id] || 0;
    somaPeso += p;
    somaPond += p * notaItemBRR(r.resposta);
    if (r.resposta === 'ruim') negativos.push(itens.find(i => i.id === r.item_id)?.texto || 'item');
  });
  const nota = somaPeso ? Math.round(somaPond / somaPeso) : 100;
  const execId = uuidv4();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO checklist_execucoes (id,empresa_id,loja_id,modelo_id,colaborador_id,periodo,data,nota) VALUES (?,?,?,?,?,?,?,?)`)
      .run(execId, req.usuario.empresa_id, lojaId, dia.modelo_id, req.usuario.id, modelo.periodo, data, nota);
    const insR = db.prepare(`INSERT INTO checklist_respostas (id,execucao_id,item_id,resposta,observacao) VALUES (?,?,?,?,?)`);
    respArr.forEach(r => insR.run(uuidv4(), execId, r.item_id, r.resposta, null));
    db.prepare(`UPDATE limpeza_dia SET fechado=1, fechado_em=datetime('now'), respostas_json=?, execucao_id=? WHERE id=?`)
      .run(JSON.stringify(respostas), execId, dia.id);
  });
  tx();
  // Conclui o card "Checklist de Limpeza" do dia no Kanban (se existir)
  db.prepare(`UPDATE tarefas SET status='concluido', concluido_em=datetime('now'), atualizado_em=datetime('now') WHERE empresa_id=? AND origem='checklist_limpeza' AND referencia_id=? AND status!='concluido'`).run(req.usuario.empresa_id, `${req.usuario.id}:${data}`);

  let tarefa_gerada = false;
  if (negativos.length) {
    const gerente = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND loja_id=? AND funcao_id='func-gerente' AND ativo=1 LIMIT 1`).get(req.usuario.empresa_id, lojaId);
    if (gerente) {
      gerarTarefa({
        empresa_id: req.usuario.empresa_id, loja_id: lojaId, tipo: 'tarefa', origem: 'checklist',
        titulo: `Corrigir itens do checklist de limpeza`,
        descricao: `Itens negativos (${data}): ${negativos.join('; ')}.`,
        responsavel_id: gerente.id, urgente: nota < 70 ? 1 : 0, sla_horas: 24, criado_por: req.usuario.id,
      });
      tarefa_gerada = true;
    }
  }
  res.json({ ok: true, mensagem: `Checklist de limpeza fechado · nota ${nota}.`, nota, itens_negativos: negativos.length, tarefa_gerada });
});

// ── Editar o MODELO do Checklist de Limpeza (itens conferidos no ciclo diário) ──
// GET /checklist/limpeza-modelo — modelo diário de limpeza + itens (para o cadastro)
router.get('/limpeza-modelo', (req, res) => {
  const modelo = modeloLimpezaDiario(req.usuario.empresa_id);
  if (!modelo) return res.json({ modelo: null, itens: [] });
  const itens = db.prepare(`SELECT id, texto, peso, ordem FROM checklist_itens WHERE modelo_id=? ORDER BY ordem, texto`).all(modelo.id);
  res.json({ modelo: { id: modelo.id, nome: modelo.nome }, itens });
});

// POST /checklist/limpeza-modelo/itens — adiciona item
router.post('/limpeza-modelo/itens', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const modelo = modeloLimpezaDiario(req.usuario.empresa_id);
  if (!modelo) return res.status(400).json({ erro: 'Nenhum checklist de limpeza diário cadastrado.' });
  const texto = (req.body.texto || '').trim();
  if (!texto) return res.status(400).json({ erro: 'Escreva o item.' });
  const ordem = (db.prepare(`SELECT MAX(ordem) m FROM checklist_itens WHERE modelo_id=?`).get(modelo.id)?.m ?? -1) + 1;
  db.prepare(`INSERT INTO checklist_itens (id,modelo_id,texto,peso,ordem) VALUES (?,?,?,?,?)`)
    .run(uuidv4(), modelo.id, texto, Number(req.body.peso) || 0, ordem);
  res.status(201).json({ mensagem: 'Item adicionado.' });
});

// PATCH /checklist/limpeza-itens/:id — edita texto/peso de um item
router.patch('/limpeza-itens/:id', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const modelo = modeloLimpezaDiario(req.usuario.empresa_id);
  const it = modelo && db.prepare(`SELECT * FROM checklist_itens WHERE id=? AND modelo_id=?`).get(req.params.id, modelo.id);
  if (!it) return res.status(404).json({ erro: 'Item não encontrado.' });
  const texto = req.body.texto != null ? String(req.body.texto).trim() : it.texto;
  const peso = req.body.peso != null ? (Number(req.body.peso) || 0) : it.peso;
  db.prepare(`UPDATE checklist_itens SET texto=?, peso=? WHERE id=?`).run(texto, peso, it.id);
  res.json({ mensagem: 'Item atualizado.' });
});

// DELETE /checklist/limpeza-itens/:id — remove um item
router.delete('/limpeza-itens/:id', exigePerfil('Supervisor', 'Gestor Geral', 'Diretor Geral'), (req, res) => {
  const modelo = modeloLimpezaDiario(req.usuario.empresa_id);
  const it = modelo && db.prepare(`SELECT id FROM checklist_itens WHERE id=? AND modelo_id=?`).get(req.params.id, modelo.id);
  if (!it) return res.status(404).json({ erro: 'Item não encontrado.' });
  db.prepare(`DELETE FROM checklist_itens WHERE id=?`).run(it.id);
  res.json({ mensagem: 'Item removido.' });
});

module.exports = router;
