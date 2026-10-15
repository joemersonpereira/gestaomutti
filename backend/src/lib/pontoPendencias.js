// pontoPendencias.js — detecta pendência de ponto e falta, cria tarefa e aplica penalidade em pontos.
//  • Marcação em aberto (incompleto): tarefa p/ o colaborador; se não solicitar correção, -10 pts por 24h.
//  • Falta (loja operou, sem batida, sem folga/afastamento): -50 pts + tarefa ao colaborador E ao gerente.
//  • Se depois o dia virar folga/afastamento/atestado aprovado, resolve e ESTORNA a penalidade da falta.
const { v4: uuid } = require('uuid');
const db = require('../db/connection');
const tang = require('./tangerino');

const PONTOS_POR_BLOCO = 10;   // incompleto: 10 por 24h
const PONTOS_FALTA = 50;       // falta: 50 (uma vez)
const BLOCO_MS = 24 * 3600 * 1000;
const DIAS_JANELA = 7;
const iso = d => d.toISOString().slice(0, 10);
const br = d => d.split('-').reverse().join('/');

// Config (pontos_config): liga/desliga o job e a penalidade, valores dos descontos.
function config(empresaId) {
  const g = (k, d) => { const r = db.prepare('SELECT valor FROM pontos_config WHERE empresa_id=? AND chave=?').get(empresaId, k); return r == null ? d : r.valor; };
  return {
    jobAtivo: g('ponto_job_ativo', '1') !== '0',
    penalidade: g('ponto_penalidade_ativa', '0') === '1', // DESLIGADA por padrão (segurança)
    ptsIncompleto: Number(g('ponto_incompleto_pts', PONTOS_POR_BLOCO)) || PONTOS_POR_BLOCO,
    ptsFalta: Number(g('ponto_falta_pts', PONTOS_FALTA)) || PONTOS_FALTA,
    prazoDia: Math.min(28, Math.max(1, Number(g('ponto_prazo_dia', 26)) || 26)), // último dia p/ pedir correção
  };
}

async function processar(empresaId) {
  if (!tang.habilitado()) return { ok: false, motivo: 'Tangerino não configurado.' };
  const cfg = config(empresaId);
  if (!cfg.jobAtivo) return { ok: true, criadas: 0, faltas: 0, descontos: 0, motivo: 'Job de ponto desativado.' };
  const colabs = db.prepare(`SELECT id, nome, loja_id, tangerino_id FROM colaboradores WHERE empresa_id=? AND ativo=1 AND tangerino_id IS NOT NULL`).all(empresaId);
  if (!colabs.length) return { ok: true, criadas: 0, faltas: 0, descontos: 0, motivo: 'Nenhum vínculo Tangerino.' };
  const porTang = new Map(colabs.map(c => [String(c.tangerino_id), c]));

  const hoje = new Date();
  const ini = iso(new Date(hoje.getTime() - DIAS_JANELA * BLOCO_MS)); const fim = iso(new Date(hoje.getTime() - BLOCO_MS)); // dias já fechados
  let bat;
  try { bat = await tang.todasBatidas({ startDate: ini, endDate: fim }); } catch (e) { return { ok: false, motivo: e.message }; }

  // marcações por colaborador+data e dias em que a loja operou (alguém bateu)
  const dias = new Map();          // colabId -> Map(data -> nº marcações)
  const opera = new Map();         // loja_id -> Set(data)
  for (const b of bat) {
    const c = porTang.get(String(b.employeeId)); if (!c) continue;
    const data = String(b.date || '').slice(0, 10); if (!data) continue;
    if (!dias.has(c.id)) dias.set(c.id, new Map());
    const m = dias.get(c.id); m.set(data, (m.get(data) || 0) + (b.dateIn ? 1 : 0) + (b.dateOut ? 1 : 0));
    if (c.loja_id) { if (!opera.has(c.loja_id)) opera.set(c.loja_id, new Set()); opera.get(c.loja_id).add(data); }
  }

  // folga/afastamento (não penaliza; a hora fica negativa no Tangerino p/ o banco de horas)
  const folgas = db.prepare(`SELECT colaborador_id, data FROM folgas WHERE empresa_id=? AND data BETWEEN ? AND ? AND (status IS NULL OR status IN ('aprovada','aprovado','confirmada'))`).all(empresaId, ini, fim);
  const folgaSet = new Map(); folgas.forEach(f => { if (!folgaSet.has(f.colaborador_id)) folgaSet.set(f.colaborador_id, new Set()); folgaSet.get(f.colaborador_id).add(String(f.data).slice(0, 10)); });
  const afast = db.prepare(`SELECT colaborador_id, data_inicio, data_fim FROM afastamentos WHERE empresa_id=? AND (status IS NULL OR status='aprovado') AND NOT (data_fim < ? OR data_inicio > ?)`).all(empresaId, ini, fim);
  const coberto = (id, data) => (folgaSet.get(id)?.has(data)) || afast.some(a => a.colaborador_id === id && String(a.data_inicio).slice(0, 10) <= data && data <= String(a.data_fim || a.data_inicio).slice(0, 10));

  // gerente por loja (p/ avisar da falta)
  const gerentes = new Map();
  db.prepare(`SELECT c.id, c.loja_id, f.nome fn FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id WHERE c.empresa_id=? AND c.ativo=1 AND f.nome IN ('Gerente','Subgerente') ORDER BY (f.nome='Gerente') DESC`).all(empresaId)
    .forEach(g => { if (g.loja_id && !gerentes.has(g.loja_id)) gerentes.set(g.loja_id, g.id); });

  const existe = db.prepare('SELECT * FROM ponto_pendencias WHERE empresa_id=? AND colaborador_id=? AND data=?');
  const insPend = db.prepare(`INSERT INTO ponto_pendencias (id,empresa_id,colaborador_id,data,tipo,tarefa_id,criado_em) VALUES (?,?,?,?,?,?,datetime('now'))`);
  const insTarefa = db.prepare(`INSERT INTO tarefas (id,empresa_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,status,criado_em,atualizado_em)
    VALUES (?,?, 'tarefa','ponto',?,?,?,?,'aberto',datetime('now'),datetime('now'))`);
  const temCorrecao = db.prepare(`SELECT 1 FROM ponto_correcoes WHERE empresa_id=? AND colaborador_id=? AND data=? AND status<>'rejeitada' LIMIT 1`);
  const insLanc = db.prepare(`INSERT INTO pontos_lancamentos (id,empresa_id,colaborador_id,colaborador_nome,loja_id,tipo,descricao,pontos,competencia,origem,ref,criado_por,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,'ponto',?,NULL,datetime('now'))`);
  const comp = () => new Date().toISOString().slice(0, 7);
  const lancar = (c, tipo, desc, pts, ref) => insLanc.run(uuid(), empresaId, c.id, c.nome, c.loja_id || null, tipo, desc, pts, comp(), ref);
  const resolver = (pend, c, estorna) => {
    db.prepare("UPDATE ponto_pendencias SET resolvido=1, resolvido_em=datetime('now') WHERE id=?").run(pend.id);
    if (pend.tarefa_id) db.prepare("UPDATE tarefas SET status='concluido', atualizado_em=datetime('now') WHERE id=?").run(pend.tarefa_id);
    if (estorna && pend.pontos_descontados > 0) lancar(c, 'estorno', `Estorno: ponto do dia ${br(pend.data)} justificado`, pend.pontos_descontados, pend.id);
  };

  let criadas = 0, faltas = 0, descontos = 0, pontos = 0, resolvidas = 0;
  const agora = Date.now();

  for (const c of colabs) {
    const m = dias.get(c.id) || new Map();
    const operaLoja = opera.get(c.loja_id) || new Set();
    const datas = new Set([...m.keys(), ...operaLoja]); // dias que ele bateu + dias que a loja operou

    for (const data of datas) {
      const qtd = m.get(data) || 0;
      const incompleto = qtd % 2 !== 0;
      const falta = qtd === 0 && operaLoja.has(data);
      let pend = existe.get(empresaId, c.id, data);

      // coberto por folga/afastamento → resolve (estorna se era falta) e não penaliza
      if (coberto(c.id, data)) { if (pend && !pend.resolvido) { resolver(pend, c, pend.tipo === 'falta'); resolvidas++; } continue; }

      // cria pendência nova
      if (!pend && (incompleto || falta)) {
        const tid = uuid();
        if (falta) {
          // NÃO penaliza automático (evita punir folga não registrada) — vira item na aba Ponto → Faltas p/ o gerente confirmar em lote.
          insPend.run(uuid(), empresaId, c.id, data, 'falta', null);
          faltas++;
          continue;
        } else {
          insTarefa.run(tid, empresaId, 'pend:' + c.id + ':' + data,
            `🕐 Corrija seu ponto de ${br(data)}`.slice(0, 140),
            `Há uma marcação em aberto no seu ponto do dia ${br(data)}. Bata a faltante ou peça correção no menu Ponto. Após 24h sem solicitar, desconto de ${PONTOS_POR_BLOCO} pontos a cada 24h.`, c.id);
          insPend.run(uuid(), empresaId, c.id, data, 'incompleto', tid);
          pend = existe.get(empresaId, c.id, data); criadas++;
        }
      }
      if (!pend || pend.resolvido) continue;

      const solicitou = !!temCorrecao.get(empresaId, c.id, data);
      // resolvido: corrigiu (incompleto virou par / falta virou batida) OU solicitou correção
      if ((pend.tipo === 'incompleto' && !incompleto) || (pend.tipo === 'falta' && !falta) || solicitou) {
        resolver(pend, c, pend.tipo === 'falta' && solicitou); // falta justificada por correção → estorna
        resolvidas++; continue;
      }

      // incompleto: acumula pts por bloco de 24h (só se a penalidade estiver LIGADA)
      if (cfg.penalidade && pend.tipo === 'incompleto') {
        const blocos = Math.floor((agora - new Date(pend.criado_em + 'Z').getTime()) / BLOCO_MS);
        const devido = blocos * cfg.ptsIncompleto;
        if (devido > (pend.pontos_descontados || 0)) {
          const diff = devido - (pend.pontos_descontados || 0);
          lancar(c, 'penalidade', `Ponto do dia ${br(data)} sem correção (>${blocos * 24}h)`, -diff, pend.id);
          db.prepare("UPDATE ponto_pendencias SET pontos_descontados=?, ultimo_desconto_em=datetime('now') WHERE id=?").run(devido, pend.id);
          descontos++; pontos += diff;
        }
      }
    }
  }
  return { ok: true, criadas, faltas, resolvidas, descontos, pontosDescontados: pontos };
}

module.exports = { processar, config };
