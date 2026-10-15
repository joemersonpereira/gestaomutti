// pontorep.js — regra de negócio do módulo PONTO REP-P NATIVO.
// Modelos de escala, motivos de afastamento, parâmetros legais e o MOTOR DE VALIDAÇÃO
// da escala: permite criar, mas gera ALERTAS quando a escala fere a legislação e exige
// AUTORIZAÇÃO de um superior do RH (exceção com justificativa + ciência registrada).
const db = require('../db/connection');
const { v4: uuid } = require('uuid');
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('./escopoCompras');

// ───────── cadastros básicos ─────────
const modelos = (emp) => db.prepare(`SELECT * FROM pontorep_escala_modelo WHERE empresa_id=? AND ativo=1 ORDER BY codigo`).all(emp);
const motivos = (emp) => db.prepare(`SELECT * FROM pontorep_afastamento_motivo WHERE empresa_id=? AND ativo=1 ORDER BY nome`).all(emp);
const parametros = (emp) => db.prepare(`SELECT * FROM pontorep_param WHERE empresa_id=? ORDER BY chave`).all(emp);
function param(emp, chave, def = null) {
  const r = db.prepare(`SELECT valor FROM pontorep_param WHERE empresa_id=? AND chave=?`).get(emp, chave);
  if (!r || r.valor == null) return def;
  const n = Number(r.valor);
  return Number.isFinite(n) && /^[0-9.]+$/.test(String(r.valor)) ? n : r.valor;
}
function setParam(emp, chave, valor) {
  db.prepare(`INSERT INTO pontorep_param (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em`).run(emp, chave, String(valor));
  return db.prepare(`SELECT * FROM pontorep_param WHERE empresa_id=? AND chave=?`).get(emp, chave);
}

// ───────── helpers de data/hora ─────────
const hhmmToMin = (s) => { if (!s) return null; const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
const addDias = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const diasEntre = (ini, fim) => { const out = []; let d = ini; while (d <= fim) { out.push(d); d = addDias(d, 1); } return out; };
// jornada líquida em minutos (trata virada de meia-noite, ex.: 12x36 noturno) menos intervalo
function jornadaMin(entrada, saida, intervalo) {
  const e = hhmmToMin(entrada), s = hhmmToMin(saida);
  if (e == null || s == null) return 0;
  let dur = s - e; if (dur <= 0) dur += 1440;
  return Math.max(0, dur - (Number(intervalo) || 0));
}
// a jornada (a partir da entrada, com duração dur) encosta na janela noturna 22h–5h?
function tocaNoturno(entrada, durMin) {
  const s = hhmmToMin(entrada); if (s == null) return false;
  const e = s + durMin;
  return [[1320, 1740], [-120, 300]].some(([a, b]) => Math.max(s, a) < Math.min(e, b));
}

// ───────── gera os dias previstos a partir do modelo (ciclo trabalha/folga) ─────────
function gerarDias(modelo, dataIni, dataFim, entrada, saida, intervalo, offset = 0) {
  const trab = Math.max(1, Number(modelo.dias_trabalha) || 1);
  const folg = Math.max(0, Number(modelo.dias_folga) || 0);
  const ciclo = trab + folg;
  return diasEntre(dataIni, dataFim).map((data, i) => {
    const folga = folg > 0 && ((i + offset) % ciclo) >= trab ? 1 : 0;
    if (folga) return { data, folga: 1, entrada: null, saida: null, intervalo_min: 0, jornada_min: 0 };
    const jm = jornadaMin(entrada, saida, intervalo);
    return { data, folga: 0, entrada, saida, intervalo_min: Number(intervalo) || 0, jornada_min: jm };
  });
}

// ───────── MOTOR DE VALIDAÇÃO: retorna a lista de alertas de legislação ─────────
// nível: informativo | atencao | critico | bloqueio (bloqueio = a lei proíbe absolutamente)
function validar(emp, modelo, dias) {
  const A = [];
  const push = (regra, nivel, base_legal, mensagem, data_ref = null) => A.push({ regra, nivel, base_legal, mensagem, data_ref });
  const P = (k, d) => Number(param(emp, k, d));

  const limiteDia = modelo.codigo === '12x36' ? 720 : P('jornada_diaria_max_min', 480);
  const heMax = P('he_max_dia_min', 120);
  const interj = P('interjornada_min_min', 660);
  const consecMax = P('dias_consecutivos_max', 6);
  const folgasMin = P('folgas_semanais_min', 1);
  const semanaMax = P('jornada_semanal_max_min', 2640);
  const intraMin = P('intervalo_intra_min_min', 60);
  const intra46 = P('intervalo_4a6_min', 15);

  const trabalho = dias.filter(d => !d.folga);

  // 1) Jornada diária + hora extra
  for (const d of trabalho) {
    if (d.jornada_min > limiteDia + heMax)
      push('he_max_dia', 'critico', 'CLT art.59', `Jornada de ${(d.jornada_min / 60).toFixed(1)}h em ${d.data} passa de 2h extras (limite ${(limiteDia / 60)}h + 2h).`, d.data);
    else if (d.jornada_min > limiteDia)
      push('jornada_diaria', 'atencao', 'CLT art.58/59', `Jornada de ${(d.jornada_min / 60).toFixed(1)}h em ${d.data} acima da prevista (${(limiteDia / 60)}h) — gera hora extra.`, d.data);
    // intervalo intrajornada
    if (d.jornada_min > 360 && (d.intervalo_min || 0) < intraMin)
      push('intervalo_intra', 'critico', 'CLT art.71', `Intervalo de ${d.intervalo_min || 0}min em ${d.data} — jornada acima de 6h exige no mínimo ${intraMin}min.`, d.data);
    else if (d.jornada_min > 240 && d.jornada_min <= 360 && (d.intervalo_min || 0) < intra46)
      push('intervalo_4a6', 'atencao', 'CLT art.71 §1º', `Jornada de 4h–6h em ${d.data} exige intervalo de ${intra46}min.`, d.data);
    // aprendiz / menor
    if (modelo.codigo === 'aprendiz' && d.jornada_min > 360)
      push('aprendiz_jornada', 'critico', 'CLT art.432', `Aprendiz não pode passar de 6h/dia (${d.data}); proibida prorrogação.`, d.data);
    if ((modelo.codigo === 'aprendiz' || modelo.codigo === 'menor') && tocaNoturno(d.entrada, d.jornada_min))
      push('menor_noturno', 'critico', 'CLT art.404', `Trabalho noturno proibido para menor/aprendiz (${d.data}).`, d.data);
  }

  // 2) Interjornada (11h entre o fim de um dia e o início do próximo dia de trabalho)
  for (let i = 1; i < trabalho.length; i++) {
    const ant = trabalho[i - 1], at = trabalho[i];
    const fimAnt = hhmmToMin(ant.entrada) + ant.jornada_min + (ant.intervalo_min || 0); // minuto do fim (pode passar de 1440)
    const diasPulo = (new Date(at.data) - new Date(ant.data)) / 864e5;
    const inicioAt = diasPulo * 1440 + hhmmToMin(at.entrada);
    const gap = inicioAt - fimAnt;
    if (gap < interj)
      push('interjornada', 'critico', 'CLT art.66', `Descanso de ${(gap / 60).toFixed(1)}h entre ${ant.data} e ${at.data} — mínimo ${(interj / 60)}h.`, at.data);
  }

  // 3) Dias consecutivos sem folga (DSR até o 7º dia)
  let seq = 0;
  for (const d of dias) {
    if (d.folga) { seq = 0; continue; }
    seq++;
    if (seq > consecMax) { push('dsr', 'critico', 'OJ 410 SDI-1 TST', `${seq} dias consecutivos de trabalho até ${d.data} — DSR deve ocorrer até o 7º dia.`, d.data); }
  }

  // 4) Folgas e jornada por semana (janelas de 7 dias a partir do início)
  for (let i = 0; i < dias.length; i += 7) {
    const janela = dias.slice(i, i + 7);
    if (janela.length < 7) break;
    const folgas = janela.filter(d => d.folga).length;
    const somaMin = janela.reduce((a, d) => a + (d.jornada_min || 0), 0);
    if (folgas < folgasMin)
      push('folga_semanal', 'critico', 'Lei 605/49', `Semana de ${janela[0].data} tem ${folgas} folga(s) — mínimo ${folgasMin}.`, janela[0].data);
    if (somaMin > semanaMax)
      push('jornada_semanal', 'atencao', 'CF art.7º XIII', `Semana de ${janela[0].data} soma ${(somaMin / 60).toFixed(1)}h — acima de ${(semanaMax / 60)}h.`, janela[0].data);
  }

  return A;
}

const ORDEM = { bloqueio: 3, critico: 2, atencao: 1, informativo: 0 };
// só "prévia": valida sem gravar
function validarPreview(emp, { modeloId, dataIni, dataFim, entrada, saida, intervalo, colaboradorId }) {
  const modelo = db.prepare(`SELECT * FROM pontorep_escala_modelo WHERE id=? AND empresa_id=?`).get(modeloId, emp);
  if (!modelo) return { erro: 'Modelo de escala não encontrado.' };
  const dias = gerarDias(modelo, dataIni, dataFim, entrada, saida, intervalo);
  const alertas = validar(emp, modelo, dias).concat(alertasColaborador(emp, colaboradorId, modelo, dias)).sort((a, b) => ORDEM[b.nivel] - ORDEM[a.nivel]);
  return { modelo: { id: modelo.id, codigo: modelo.codigo, nome: modelo.nome }, dias, alertas, precisaAutorizacao: alertas.some(a => a.nivel === 'atencao' || a.nivel === 'critico') };
}

// ───────── cria a escala (permite, mas registra as exceções para o RH autorizar) ─────────
function criarEscala(emp, payload, usuario) {
  const { colaboradorId, lojaId, modeloId, dataIni, dataFim, entrada, saida, intervalo, diasCustom } = payload;
  const modelo = db.prepare(`SELECT * FROM pontorep_escala_modelo WHERE id=? AND empresa_id=?`).get(modeloId, emp);
  if (!modelo) return { erro: 'Modelo de escala não encontrado.' };
  if (!colaboradorId || !dataIni || !dataFim) return { erro: 'Informe colaborador e período.' };

  const dias = (Array.isArray(diasCustom) && diasCustom.length) ? diasCustom : gerarDias(modelo, dataIni, dataFim, entrada, saida, intervalo);
  const alertas = validar(emp, modelo, dias).concat(alertasColaborador(emp, colaboradorId, modelo, dias));
  const bloqueado = alertas.find(a => a.nivel === 'bloqueio');
  if (bloqueado) return { erro: `A lei proíbe esta escala: ${bloqueado.mensagem}`, bloqueio: bloqueado };

  const precisa = alertas.some(a => a.nivel === 'atencao' || a.nivel === 'critico');
  const escalaId = uuid();
  const status = precisa ? 'pendente_autorizacao' : 'autorizada';

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO pontorep_escala
      (id,empresa_id,loja_id,colaborador_id,modelo_id,data_ini,data_fim,entrada,saida,intervalo_min,status,criado_por_id,criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(escalaId, emp, lojaId || null, colaboradorId, modeloId, dataIni, dataFim, entrada || null, saida || null, Number(intervalo) || 0, status, usuario?.id || null);
    const insDia = db.prepare(`INSERT INTO pontorep_escala_dia (id,escala_id,data,folga,entrada,saida,intervalo_min,jornada_min) VALUES (?,?,?,?,?,?,?,?)`);
    for (const d of dias) insDia.run(uuid(), escalaId, d.data, d.folga, d.entrada, d.saida, d.intervalo_min, d.jornada_min);
    const insExc = db.prepare(`INSERT INTO pontorep_excecao (id,empresa_id,escala_id,regra,nivel,base_legal,mensagem,data_ref,status,criado_em) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`);
    for (const a of alertas) insExc.run(uuid(), emp, escalaId, a.regra, a.nivel, a.base_legal, a.mensagem, a.data_ref, a.nivel === 'informativo' ? 'autorizada' : 'pendente');
  });
  tx();
  return { ok: true, escalaId, status, precisaAutorizacao: precisa, alertas: alertas.sort((a, b) => ORDEM[b.nivel] - ORDEM[a.nivel]) };
}

// ───────── autorização do superior do RH ─────────
function autorizarEscala(emp, escalaId, usuario, justificativa) {
  const esc = db.prepare(`SELECT * FROM pontorep_escala WHERE id=? AND empresa_id=?`).get(escalaId, emp);
  if (!esc) return { erro: 'Escala não encontrada.' };
  if (!justificativa || String(justificativa).trim().length < 20)
    return { erro: 'A justificativa da liberação precisa ter pelo menos 20 caracteres (fica registrada com sua ciência).' };
  const tx = db.transaction(() => {
    db.prepare(`UPDATE pontorep_excecao SET status='autorizada', justificativa=?, autorizado_por_id=?, autorizado_em=datetime('now')
      WHERE escala_id=? AND status='pendente'`).run(justificativa, usuario?.id || null, escalaId);
    db.prepare(`UPDATE pontorep_escala SET status='autorizada', autorizado_por_id=?, autorizado_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?`)
      .run(usuario?.id || null, escalaId);
  });
  tx();
  return { ok: true, status: 'autorizada' };
}
function publicarEscala(emp, escalaId, usuario) {
  const esc = db.prepare(`SELECT * FROM pontorep_escala WHERE id=? AND empresa_id=?`).get(escalaId, emp);
  if (!esc) return { erro: 'Escala não encontrada.' };
  if (esc.status === 'pendente_autorizacao') return { erro: 'Escala tem exceções pendentes de autorização do RH.' };
  db.prepare(`UPDATE pontorep_escala SET status='publicada', atualizado_em=datetime('now') WHERE id=?`).run(escalaId);
  return { ok: true, status: 'publicada' };
}

// ───────── listagens ─────────
function listarEscalas(emp, { status } = {}) {
  const cond = status ? ` AND e.status=?` : '';
  const args = status ? [emp, status] : [emp];
  return db.prepare(`
    SELECT e.*, c.nome colaborador_nome, m.nome modelo_nome, m.codigo modelo_codigo,
      (SELECT COUNT(*) FROM pontorep_excecao x WHERE x.escala_id=e.id AND x.status='pendente') pendentes,
      (SELECT COUNT(*) FROM pontorep_excecao x WHERE x.escala_id=e.id) excecoes
    FROM pontorep_escala e
    LEFT JOIN colaboradores c ON c.id=e.colaborador_id
    LEFT JOIN pontorep_escala_modelo m ON m.id=e.modelo_id
    WHERE e.empresa_id=?${cond}
    ORDER BY e.criado_em DESC LIMIT 300`).all(...args);
}
function escalaDetalhe(emp, escalaId) {
  const e = db.prepare(`SELECT e.*, c.nome colaborador_nome, m.nome modelo_nome, m.codigo modelo_codigo
    FROM pontorep_escala e LEFT JOIN colaboradores c ON c.id=e.colaborador_id
    LEFT JOIN pontorep_escala_modelo m ON m.id=e.modelo_id WHERE e.id=? AND e.empresa_id=?`).get(escalaId, emp);
  if (!e) return null;
  e.dias = db.prepare(`SELECT * FROM pontorep_escala_dia WHERE escala_id=? ORDER BY data`).all(escalaId);
  e.alertas = db.prepare(`SELECT * FROM pontorep_excecao WHERE escala_id=? ORDER BY criado_em`).all(escalaId);
  return e;
}

// ───────── Configurações (Geral/Web/Mobile/Inconsistências) ─────────
const configs = (emp) => db.prepare(`SELECT * FROM pontorep_config WHERE empresa_id=? ORDER BY grupo, ordem`).all(emp);
function cfg(emp, chave, def = null) {
  const r = db.prepare(`SELECT valor FROM pontorep_config WHERE empresa_id=? AND chave=?`).get(emp, chave);
  if (!r || r.valor == null) return def;
  const n = Number(r.valor);
  return /^-?[0-9.]+$/.test(String(r.valor)) ? n : r.valor;
}
function setConfig(emp, chave, valor) {
  db.prepare(`UPDATE pontorep_config SET valor=? WHERE empresa_id=? AND chave=?`).run(String(valor), emp, chave);
  return db.prepare(`SELECT * FROM pontorep_config WHERE empresa_id=? AND chave=?`).get(emp, chave);
}

// ───────── Motivos de afastamento: salvar flags (abona/falta/absenteísmo/habilitar) ─────────
function salvarMotivoFlags(emp, id, b) {
  db.prepare(`UPDATE pontorep_afastamento_motivo SET abona=?, conta_falta=?, absenteismo=?, hab_gestores=?, hab_colaboradores=?, ativo=? WHERE id=? AND empresa_id=?`)
    .run(b.abona ? 1 : 0, b.conta_falta ? 1 : 0, b.absenteismo ? 1 : 0, b.hab_gestores ? 1 : 0, b.hab_colaboradores ? 1 : 0, b.ativo === 0 ? 0 : 1, id, emp);
  return { ok: true };
}
function criarMotivo(emp, b) {
  if (!b.nome) return { erro: 'Informe o nome do motivo.' };
  const id = uuid();
  db.prepare(`INSERT INTO pontorep_afastamento_motivo (id,empresa_id,codigo,nome,base_legal,dias_regra,quem_paga,remunerado,justificada,doc_exigido,abona,conta_falta,absenteismo,hab_gestores,hab_colaboradores,padrao,ativo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1)`).run(id, emp, (b.codigo || b.nome).toLowerCase().replace(/\s+/g, '_').slice(0, 40), b.nome, b.base_legal || null, b.dias_regra || null,
      b.quem_paga || 'E', b.remunerado ? 1 : 0, b.justificada ? 1 : 0, b.doc_exigido || null, b.abona ? 1 : 0, b.conta_falta ? 1 : 0, b.absenteismo ? 1 : 0, b.hab_gestores ? 1 : 0, b.hab_colaboradores ? 1 : 0);
  return { ok: true, id };
}

// ───────── Justificativas de atraso (catálogo) ─────────
const justificativasAtraso = (emp) => db.prepare(`SELECT * FROM pontorep_justificativa_atraso WHERE empresa_id=? AND ativo=1 ORDER BY descricao`).all(emp);
function salvarJustificativa(emp, b) {
  if (!b.descricao) return { erro: 'Informe a descrição.' };
  const id = b.id || uuid();
  if (b.id) db.prepare(`UPDATE pontorep_justificativa_atraso SET descricao=?, anexo_obrigatorio=?, obs_obrigatoria=?, hab_gestores=?, hab_colaboradores=? WHERE id=? AND empresa_id=?`)
    .run(b.descricao, b.anexo_obrigatorio ? 1 : 0, b.obs_obrigatoria ? 1 : 0, b.hab_gestores ? 1 : 0, b.hab_colaboradores ? 1 : 0, b.id, emp);
  else db.prepare(`INSERT OR IGNORE INTO pontorep_justificativa_atraso (id,empresa_id,descricao,anexo_obrigatorio,obs_obrigatoria,hab_gestores,hab_colaboradores,ativo) VALUES (?,?,?,?,?,?,?,1)`)
    .run(id, emp, b.descricao, b.anexo_obrigatorio ? 1 : 0, b.obs_obrigatoria ? 1 : 0, b.hab_gestores ? 1 : 0, b.hab_colaboradores ? 1 : 0);
  return { ok: true, id };
}
const removerJustificativa = (emp, id) => { db.prepare(`UPDATE pontorep_justificativa_atraso SET ativo=0 WHERE id=? AND empresa_id=?`).run(id, emp); return { ok: true }; };

// ───────── Feriados (p/ a falta ser considerada e p/ regra de férias) ─────────
const feriados = (emp, lojaId) => db.prepare(
  `SELECT * FROM pontorep_feriado WHERE empresa_id=? AND ativo=1 AND (loja_id IS NULL OR loja_id=?) ORDER BY substr(data,6)`
).all(emp, lojaId || null);
function criarFeriado(emp, { lojaId, data, nome, tipo, recorrente, trabalha }) {
  if (!data || !nome) return { erro: 'Informe data e nome do feriado.' };
  const id = uuid();
  db.prepare(`INSERT OR IGNORE INTO pontorep_feriado (id,empresa_id,loja_id,data,nome,tipo,recorrente,trabalha,ativo)
    VALUES (?,?,?,?,?,?,?,?,1)`).run(id, emp, lojaId || null, data, nome, tipo || 'municipal', recorrente ? 1 : 0, trabalha ? 1 : 0);
  return { ok: true, id };
}
const removerFeriado = (emp, id) => { db.prepare(`UPDATE pontorep_feriado SET ativo=0 WHERE id=? AND empresa_id=?`).run(id, emp); return { ok: true }; };
// é feriado nessa data? (casa por dia/mês quando recorrente)
function ehFeriado(emp, lojaId, isoData) {
  const md = isoData.slice(5); // MM-DD
  return db.prepare(`SELECT * FROM pontorep_feriado WHERE empresa_id=? AND ativo=1 AND (loja_id IS NULL OR loja_id=?)
    AND ((recorrente=1 AND substr(data,6)=?) OR (recorrente=0 AND data=?)) LIMIT 1`).get(emp, lojaId || null, md, isoData) || null;
}

// ───────── Necessidade de equipe por loja/turno (base da Escala Inteligente) ─────────
const necessidades = (emp, lojaId) => db.prepare(
  `SELECT n.*, m.codigo modelo_codigo FROM pontorep_necessidade n LEFT JOIN pontorep_escala_modelo m ON m.id=n.modelo_id
   WHERE n.empresa_id=? AND n.ativo=1 ${lojaId ? 'AND n.loja_id=?' : ''} ORDER BY n.loja_id, n.faixa_ini`
).all(...(lojaId ? [emp, lojaId] : [emp]));
function criarNecessidade(emp, b) {
  if (!b.lojaId || !b.turno) return { erro: 'Informe loja e turno.' };
  const id = uuid();
  db.prepare(`INSERT INTO pontorep_necessidade (id,empresa_id,loja_id,turno,faixa_ini,faixa_fim,modelo_id,dia_semana,qtd_min,funcao,ativo)
    VALUES (?,?,?,?,?,?,?,?,?,?,1)`).run(id, emp, b.lojaId, b.turno, b.faixaIni || null, b.faixaFim || null,
    b.modeloId || null, b.diaSemana === '' || b.diaSemana == null ? null : Number(b.diaSemana), Number(b.qtdMin) || 1, b.funcao || null);
  return { ok: true, id };
}
const removerNecessidade = (emp, id) => { db.prepare(`UPDATE pontorep_necessidade SET ativo=0 WHERE id=? AND empresa_id=?`).run(id, emp); return { ok: true }; };

// ───────── Config por colaborador (travar hora extra) ─────────
function colaboradorConfig(emp, colabId) {
  return db.prepare(`SELECT * FROM pontorep_colaborador_config WHERE empresa_id=? AND colaborador_id=?`).get(emp, colabId)
    || { empresa_id: emp, colaborador_id: colabId, bloqueia_he: 0, tol_encerrar_min: null, observacao: null };
}
function setColaboradorConfig(emp, colabId, { bloqueia_he, tol_encerrar_min, observacao }) {
  db.prepare(`INSERT INTO pontorep_colaborador_config (empresa_id,colaborador_id,bloqueia_he,tol_encerrar_min,observacao,atualizado_em)
    VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id,colaborador_id) DO UPDATE SET bloqueia_he=excluded.bloqueia_he,
      tol_encerrar_min=excluded.tol_encerrar_min, observacao=excluded.observacao, atualizado_em=excluded.atualizado_em`)
    .run(emp, colabId, bloqueia_he ? 1 : 0, tol_encerrar_min == null || tol_encerrar_min === '' ? null : Number(tol_encerrar_min), observacao || null);
  return colaboradorConfig(emp, colabId);
}

// ───────── Regra de ponto por colaborador — VERSIONADA por vigência ─────────
function regrasColaborador(emp, colabId) {
  return db.prepare(`SELECT r.*, m.codigo modelo_codigo, m.nome modelo_nome
    FROM pontorep_colaborador_regra r LEFT JOIN pontorep_escala_modelo m ON m.id=r.modelo_id
    WHERE r.empresa_id=? AND r.colaborador_id=? ORDER BY r.vigencia_ini DESC`).all(emp, colabId);
}
function regraVigente(emp, colabId, data) {
  return db.prepare(`SELECT r.*, m.codigo modelo_codigo FROM pontorep_colaborador_regra r
    LEFT JOIN pontorep_escala_modelo m ON m.id=r.modelo_id
    WHERE r.empresa_id=? AND r.colaborador_id=? AND r.vigencia_ini<=?
      AND (r.vigencia_fim IS NULL OR r.vigencia_fim>=?) ORDER BY r.vigencia_ini DESC LIMIT 1`).get(emp, colabId, data, data);
}
// Troca a regra SEM apagar as anteriores: fecha a vigente no dia anterior e cria a nova.
function trocarRegraColaborador(emp, colabId, modeloId, vigenciaIni, usuario) {
  if (!colabId || !modeloId || !vigenciaIni) return { erro: 'Informe colaborador, regra e vigência.' };
  const tx = db.transaction(() => {
    const fimAnterior = addDias(vigenciaIni, -1);
    db.prepare(`UPDATE pontorep_colaborador_regra SET vigencia_fim=?
      WHERE empresa_id=? AND colaborador_id=? AND vigencia_fim IS NULL AND vigencia_ini<=?`).run(fimAnterior, emp, colabId, fimAnterior);
    db.prepare(`INSERT INTO pontorep_colaborador_regra (id,empresa_id,colaborador_id,modelo_id,vigencia_ini,criado_por_id,criado_em)
      VALUES (?,?,?,?,?,?,datetime('now'))`).run(uuid(), emp, colabId, modeloId, vigenciaIni, usuario?.id || null);
  });
  tx();
  return { ok: true };
}
function removerRegraColaborador(emp, id) {
  db.prepare(`DELETE FROM pontorep_colaborador_regra WHERE id=? AND empresa_id=?`).run(id, emp);
  return { ok: true };
}

// alertas específicos do colaborador (ex.: hora extra bloqueada / "encerrar o ponto")
function alertasColaborador(emp, colabId, modelo, dias) {
  if (!colabId) return [];
  const cfg = colaboradorConfig(emp, colabId);
  if (!cfg.bloqueia_he) return [];
  const limite = modelo.codigo === '12x36' ? 720 : Number(param(emp, 'jornada_diaria_max_min', 480));
  const tol = cfg.tol_encerrar_min != null ? Number(cfg.tol_encerrar_min) : Number(param(emp, 'tolerancia_dia_min', 10));
  const A = [];
  for (const d of dias.filter(x => !x.folga)) {
    if (d.jornada_min > limite + tol)
      A.push({ regra: 'he_bloqueada', nivel: 'critico', base_legal: 'Regra interna (HE bloqueada)', mensagem: `Colaborador com HORA EXTRA BLOQUEADA: jornada de ${(d.jornada_min / 60).toFixed(1)}h em ${d.data} passa da jornada (${limite / 60}h + ${tol}min de tolerância) — encerrar o ponto.`, data_ref: d.data });
  }
  return A;
}

// ───────── Criar escala em LOTE (vários colaboradores de uma vez) ─────────
function criarEscalaLote(emp, payload, usuario) {
  const ids = Array.isArray(payload.colaboradorIds) ? payload.colaboradorIds.filter(Boolean) : [];
  if (!ids.length) return { erro: 'Selecione ao menos um colaborador.' };
  const res = [];
  for (const id of ids) {
    const r = criarEscala(emp, { ...payload, colaboradorId: id }, usuario);
    const nome = db.prepare(`SELECT nome FROM colaboradores WHERE id=?`).get(id)?.nome || id;
    res.push({ colaboradorId: id, nome, ...(r.erro ? { erro: r.erro } : { ok: true, status: r.status, precisaAutorizacao: r.precisaAutorizacao, alertas: r.alertas?.length || 0 }) });
  }
  return { ok: true, total: res.length, criadas: res.filter(r => r.ok).length, resultados: res };
}

// ═══════════ FECHAMENTO, JANELA DE CORREÇÃO, ESPELHO, AFASTAMENTO, ACOMPANHAMENTO ═══════════

// Config de fechamento (dia do mês + janela de correção)
function fechamentoConfig(emp) {
  return db.prepare(`SELECT * FROM pontorep_fechamento_config WHERE empresa_id=?`).get(emp)
    || { empresa_id: emp, dia_fechamento: 25, correcao_prazo_dias: 1, correcao_hora_limite: '23:59' };
}
function setFechamentoConfig(emp, { dia_fechamento, correcao_prazo_dias, correcao_hora_limite }) {
  db.prepare(`INSERT INTO pontorep_fechamento_config (empresa_id,dia_fechamento,correcao_prazo_dias,correcao_hora_limite,atualizado_em)
    VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(empresa_id) DO UPDATE SET dia_fechamento=excluded.dia_fechamento,
      correcao_prazo_dias=excluded.correcao_prazo_dias, correcao_hora_limite=excluded.correcao_hora_limite, atualizado_em=excluded.atualizado_em`)
    .run(emp, Number(dia_fechamento) || 25, Number(correcao_prazo_dias) || 1, correcao_hora_limite || '23:59');
  return fechamentoConfig(emp);
}
const competenciaFechada = (emp, comp) => {
  const f = db.prepare(`SELECT status FROM pontorep_fechamento WHERE empresa_id=? AND competencia=?`).get(emp, comp);
  return !!(f && f.status === 'fechado');
};
// A janela de correção do ponto de um dia: fecha em (dia + prazo) às HH:MM. Depois trava.
function janelaCorrecao(emp, dataRef) {
  const c = fechamentoConfig(emp);
  const deadlineDia = addDias(dataRef, Number(c.correcao_prazo_dias) || 1);
  const deadline = new Date(`${deadlineDia}T${c.correcao_hora_limite || '23:59'}:59`);
  const comp = dataRef.slice(0, 7);
  const aberta = new Date() <= deadline && !competenciaFechada(emp, comp);
  return { aberta, deadline: `${deadlineDia} ${c.correcao_hora_limite || '23:59'}`, competenciaFechada: competenciaFechada(emp, comp) };
}
function solicitarCorrecao(emp, usuario, { dataRef, tipo, descricao, horarioSugerido }) {
  if (!dataRef) return { erro: 'Informe a data do ponto a corrigir.' };
  const j = janelaCorrecao(emp, dataRef);
  if (!j.aberta) return { erro: j.competenciaFechada ? 'Competência já fechada — não é mais possível pedir correção.' : `Prazo de correção encerrado (limite: ${j.deadline}).` };
  const id = uuid();
  db.prepare(`INSERT INTO pontorep_correcao (id,empresa_id,colaborador_id,data_ref,tipo,descricao,horario_sugerido,status,criado_em)
    VALUES (?,?,?,?,?,?,?, 'pendente', datetime('now'))`).run(id, emp, usuario?.id, dataRef, tipo || 'ajuste', descricao || null, horarioSugerido || null);
  return { ok: true, id };
}
const listarCorrecoes = (emp, { status } = {}) => db.prepare(
  `SELECT c.*, col.nome colaborador_nome FROM pontorep_correcao c LEFT JOIN colaboradores col ON col.id=c.colaborador_id
   WHERE c.empresa_id=? ${status ? 'AND c.status=?' : ''} ORDER BY c.criado_em DESC LIMIT 300`
).all(...(status ? [emp, status] : [emp]));
function responderCorrecao(emp, id, { status, resposta }, usuario) {
  if (!['aprovada', 'recusada'].includes(status)) return { erro: 'Status inválido.' };
  db.prepare(`UPDATE pontorep_correcao SET status=?, resposta=?, resolvido_por_id=?, resolvido_em=datetime('now') WHERE id=? AND empresa_id=?`)
    .run(status, resposta || null, usuario?.id || null, id, emp);
  return { ok: true };
}

// Fechar a competência → gera os espelhos dos colaboradores ativos
function fecharCompetencia(emp, competencia, usuario) {
  if (!/^\d{4}-\d{2}$/.test(String(competencia || ''))) return { erro: 'Competência inválida (use AAAA-MM).' };
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO pontorep_fechamento (id,empresa_id,competencia,status,fechado_por_id,fechado_em,criado_em)
      VALUES (?,?,?, 'fechado', ?, datetime('now'), datetime('now'))
      ON CONFLICT(empresa_id,competencia) DO UPDATE SET status='fechado', fechado_por_id=excluded.fechado_por_id, fechado_em=excluded.fechado_em`)
      .run(uuid(), emp, competencia, usuario?.id || null);
    const colabs = db.prepare(`SELECT id FROM colaboradores WHERE empresa_id=? AND ativo=1`).all(emp);
    const ins = db.prepare(`INSERT OR IGNORE INTO pontorep_espelho (id,empresa_id,competencia,colaborador_id,status,criado_em) VALUES (?,?,?,?, 'gerado', datetime('now'))`);
    for (const c of colabs) ins.run(uuid(), emp, competencia, c.id);
  });
  tx();
  const n = db.prepare(`SELECT COUNT(*) n FROM pontorep_espelho WHERE empresa_id=? AND competencia=?`).get(emp, competencia).n;
  return { ok: true, competencia, espelhos: n };
}
function reabrirCompetencia(emp, competencia) {
  db.prepare(`UPDATE pontorep_fechamento SET status='aberto' WHERE empresa_id=? AND competencia=?`).run(emp, competencia);
  return { ok: true };
}
const listarFechamentos = (emp) => db.prepare(`SELECT f.*,
    (SELECT COUNT(*) FROM pontorep_espelho e WHERE e.empresa_id=f.empresa_id AND e.competencia=f.competencia) espelhos,
    (SELECT COUNT(*) FROM pontorep_espelho e WHERE e.empresa_id=f.empresa_id AND e.competencia=f.competencia AND e.status='assinado') assinados
  FROM pontorep_fechamento f WHERE f.empresa_id=? ORDER BY f.competencia DESC`).all(emp);
const listarEspelhos = (emp, competencia) => db.prepare(
  `SELECT e.*, c.nome colaborador_nome FROM pontorep_espelho e LEFT JOIN colaboradores c ON c.id=e.colaborador_id
   WHERE e.empresa_id=? AND e.competencia=? ORDER BY c.nome`).all(emp, competencia);
function enviarEspelhos(emp, competencia) {
  db.prepare(`UPDATE pontorep_espelho SET status='enviado', enviado_em=datetime('now') WHERE empresa_id=? AND competencia=? AND status='gerado'`).run(emp, competencia);
  return { ok: true };
}

// Afastamentos (lançamento) — alimenta o painel de acompanhamento
function lancarAfastamento(emp, b, usuario) {
  if (!b.colaboradorId || !b.motivoId || !b.dataIni) return { erro: 'Informe colaborador, motivo e data inicial.' };
  const dias = b.dataFim ? Math.max(1, Math.round((new Date(b.dataFim) - new Date(b.dataIni)) / 864e5) + 1) : 1;
  const id = uuid();
  db.prepare(`INSERT INTO pontorep_afastamento (id,empresa_id,colaborador_id,motivo_id,data_ini,data_fim,dias,documento_ref,observacao,criado_por_id,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(id, emp, b.colaboradorId, b.motivoId, b.dataIni, b.dataFim || null, dias, b.documentoRef || null, b.observacao || null, usuario?.id || null);
  return { ok: true, id, dias };
}
const listarAfastamentos = (emp, { colaboradorId } = {}) => db.prepare(
  `SELECT a.*, c.nome colaborador_nome, m.nome motivo_nome FROM pontorep_afastamento a
   LEFT JOIN colaboradores c ON c.id=a.colaborador_id LEFT JOIN pontorep_afastamento_motivo m ON m.id=a.motivo_id
   WHERE a.empresa_id=? ${colaboradorId ? 'AND a.colaborador_id=?' : ''} ORDER BY a.data_ini DESC LIMIT 300`
).all(...(colaboradorId ? [emp, colaboradorId] : [emp]));

// Painel de acompanhamento: quem tem MUITOS atestados (real, dos afastamentos).
// Atrasos/horas extras/banco dependem da apuração das batidas (ainda não coletadas) → sinalizado.
function acompanhamento(emp, { meses = 12 } = {}) {
  const desde = addDias(new Date().toISOString().slice(0, 10), -Math.max(30, Number(meses) * 30));
  const atestados = db.prepare(`
    SELECT a.colaborador_id, c.nome, COUNT(*) qtd, COALESCE(SUM(a.dias),0) dias
    FROM pontorep_afastamento a JOIN pontorep_afastamento_motivo m ON m.id=a.motivo_id
    LEFT JOIN colaboradores c ON c.id=a.colaborador_id
    WHERE a.empresa_id=? AND a.data_ini>=? AND m.codigo IN ('atestado','auxilio_doenca','acidente_trabalho')
    GROUP BY a.colaborador_id, c.nome ORDER BY qtd DESC LIMIT 50`).all(emp, desde);
  // Atrasos / horas extras / banco de horas — da APURAÇÃO das batidas
  const temApur = db.prepare(`SELECT COUNT(*) n FROM pontorep_apuracao_dia WHERE empresa_id=?`).get(emp).n > 0;
  const atrasos = db.prepare(`SELECT ap.colaborador_id, c.nome, COUNT(*) dias, COALESCE(SUM(ap.atraso_min),0) min
    FROM pontorep_apuracao_dia ap LEFT JOIN colaboradores c ON c.id=ap.colaborador_id
    WHERE ap.empresa_id=? AND ap.data>=? AND ap.atraso_min>0 GROUP BY ap.colaborador_id, c.nome ORDER BY min DESC LIMIT 50`).all(emp, desde);
  const horasExtras = db.prepare(`SELECT ap.colaborador_id, c.nome, COALESCE(SUM(ap.extra_min),0) min
    FROM pontorep_apuracao_dia ap LEFT JOIN colaboradores c ON c.id=ap.colaborador_id
    WHERE ap.empresa_id=? AND ap.data>=? AND ap.extra_min>0 GROUP BY ap.colaborador_id, c.nome ORDER BY min DESC LIMIT 50`).all(emp, desde);
  const bancoHoras = db.prepare(`SELECT ap.colaborador_id, c.nome, COALESCE(SUM(ap.saldo_min),0) min
    FROM pontorep_apuracao_dia ap LEFT JOIN colaboradores c ON c.id=ap.colaborador_id
    WHERE ap.empresa_id=? AND ap.data>=? GROUP BY ap.colaborador_id, c.nome HAVING ABS(SUM(ap.saldo_min))>0 ORDER BY ABS(SUM(ap.saldo_min)) DESC LIMIT 50`).all(emp, desde);
  return { desde, atestados, temApuracao: temApur, atrasos, horasExtras, bancoHoras };
}

// ═══════════ FÉRIAS (regras CLT art.129–145) ═══════════
function validarFerias(emp, { colaboradorId, dataIni, dias, abonoDias = 0, aquisitivoFim }) {
  const A = [];
  const push = (regra, nivel, base, msg) => A.push({ regra, nivel, base_legal: base, mensagem: msg });
  const d = Number(dias) || 0, ab = Number(abonoDias) || 0;
  // art.134 §3 — não iniciar nos 2 dias que antecedem feriado ou DSR (descanso semanal)
  if (dataIni) {
    for (let k = 1; k <= 2; k++) {
      const dk = addDias(dataIni, k);
      const fer = ehFeriado(emp, null, dk);
      const domingo = new Date(dk + 'T00:00:00').getDay() === 0;
      if (fer) push('inicio_antes_feriado', 'critico', 'CLT art.134 §3', `Férias não podem iniciar em ${dataIni}: cai a ${k} dia(s) do feriado "${fer.nome}" (${dk}).`);
      else if (domingo) push('inicio_antes_dsr', 'critico', 'CLT art.134 §3', `Férias não podem iniciar em ${dataIni}: cai a ${k} dia(s) do descanso semanal (domingo ${dk}).`);
    }
    // art.135 — aviso de no mínimo 30 dias de antecedência
    const ant = Math.round((new Date(dataIni) - new Date(new Date().toISOString().slice(0, 10))) / 864e5);
    if (ant < 30) push('antecedencia', 'atencao', 'CLT art.135', `Aviso de férias com ${ant} dia(s) de antecedência — o mínimo é 30.`);
  }
  // art.134 §1 — fracionamento: nenhum período < 5 dias; um deles ≥ 14
  if (d > 0 && d < 5) push('fracao_min', 'critico', 'CLT art.134 §1', `Período de ${d} dias — nenhum período de férias pode ter menos de 5 dias.`);
  else if (d >= 5 && d < 14) push('fracao_14', 'atencao', 'CLT art.134 §1', `Período de ${d} dias — ao fracionar, um dos períodos precisa ter pelo menos 14 dias.`);
  if (d > 30) push('limite_30', 'critico', 'CLT art.130', `Período de ${d} dias — o máximo é 30 dias por período aquisitivo.`);
  // art.143 — abono pecuniário até 1/3
  if (ab > Math.floor((d + ab) / 3)) push('abono', 'atencao', 'CLT art.143', `Abono de ${ab} dias — o máximo é 1/3 do período (≈${Math.floor((d + ab) / 3)} dias).`);
  // art.134 caput — concessivo: gozar em até 12 meses após o aquisitivo, senão dobra (art.137)
  if (aquisitivoFim) {
    const limite = addDias(aquisitivoFim, 365);
    if (dataIni > limite) push('concessivo', 'critico', 'CLT art.137', `Início ${dataIni} passou do período concessivo (limite ${limite}) — férias vencidas são pagas em dobro.`);
  }
  return A.sort((a, b) => ORDEM[b.nivel] - ORDEM[a.nivel]);
}
function solicitarFerias(emp, b, usuario) {
  if (!b.colaboradorId || !b.dataIni || !b.dias) return { erro: 'Informe colaborador, início e nº de dias.' };
  const alertas = validarFerias(emp, b);
  const id = uuid();
  db.prepare(`INSERT INTO pontorep_ferias (id,empresa_id,colaborador_id,aquisitivo_ini,aquisitivo_fim,data_ini,dias,abono_dias,status,alertas_json,criado_por_id,criado_em)
    VALUES (?,?,?,?,?,?,?,?, 'solicitada', ?, ?, datetime('now'))`)
    .run(id, emp, b.colaboradorId, b.aquisitivoIni || null, b.aquisitivoFim || null, b.dataIni, Number(b.dias), Number(b.abonoDias) || 0, JSON.stringify(alertas), usuario?.id || null);
  return { ok: true, id, alertas };
}
const listarFerias = (emp) => db.prepare(`SELECT fe.*, c.nome colaborador_nome FROM pontorep_ferias fe
  LEFT JOIN colaboradores c ON c.id=fe.colaborador_id WHERE fe.empresa_id=? ORDER BY fe.criado_em DESC LIMIT 300`).all(emp);
function decidirFerias(emp, id, status, usuario) {
  if (!['aprovada', 'recusada'].includes(status)) return { erro: 'Status inválido.' };
  db.prepare(`UPDATE pontorep_ferias SET status=?, aprovado_por_id=?, aprovado_em=datetime('now') WHERE id=? AND empresa_id=?`).run(status, usuario?.id || null, id, emp);
  return { ok: true };
}

// ═══════════ ESCALA INTELIGENTE (dimensionamento + pico de vendas do ERP) ═══════════

// Venda por HORA da loja (ERP) → aponta as faixas de PICO (30% acima da média)
async function picosVenda(emp, lojaId, dias = 90) {
  if (!habilitado() || !lojaId) return { erp: habilitado(), horas: [], media: 0 };
  const unis = unisEmpresa(emp, lojaId);
  if (!unis.length) return { erp: true, horas: [], media: 0 };
  const rows = await erpQuery(`
    SELECT to_char(datahorafechamento,'HH24') hora, count(*) vendas, COALESCE(sum(valortotal),0)::float8 valor
    FROM venda WHERE unidadenegocioid = ANY($1::bigint[]) AND status='F'
      AND datahorafechamento >= now()::date - $2::int AND datahorafechamento < now()::date + 1
    GROUP BY 1 ORDER BY 1`, [unis, dias]).catch(() => []);
  const horas = rows.map(r => ({ hora: r.hora, vendas: Number(r.vendas) || 0, valor: Math.round(Number(r.valor) || 0) }));
  const media = horas.length ? horas.reduce((a, h) => a + h.vendas, 0) / horas.length : 0;
  horas.forEach(h => { h.pico = media > 0 && h.vendas >= media * 1.3; });
  return { erp: true, horas, media: Math.round(media) };
}

// Sugere a escala do período p/ TODA a equipe da loja, escalonando as folgas (não folgam todos no mesmo dia),
// cruza com a NECESSIDADE cadastrada e o PICO de vendas → aponta os gargalos.
async function sugerirEscalaInteligente(emp, { lojaId, dataIni, dataFim, modeloId, entrada = '08:00', saida = '16:20', intervalo = 60 }) {
  const modelo = db.prepare(`SELECT * FROM pontorep_escala_modelo WHERE id=? AND empresa_id=?`).get(modeloId, emp);
  if (!modelo) return { erro: 'Escolha um modelo de escala.' };
  if (!lojaId || !dataIni || !dataFim) return { erro: 'Informe loja e período.' };
  const colabs = db.prepare(`SELECT id, nome FROM colaboradores WHERE empresa_id=? AND loja_id=? AND ativo=1 ORDER BY nome`).all(emp, lojaId);
  const listaDias = diasEntre(dataIni, dataFim);
  // cada colaborador com um offset diferente → folgas espalhadas
  const sugestoes = colabs.map((c, k) => ({
    colaboradorId: c.id, nome: c.nome,
    dias: gerarDias(modelo, dataIni, dataFim, entrada, saida, intervalo, k),
  }));
  const necs = necessidades(emp, lojaId);
  const cobertura = listaDias.map((data, i) => {
    const dow = new Date(data + 'T00:00:00').getDay();
    const necessario = necs.filter(n => n.dia_semana == null || n.dia_semana === dow).reduce((a, n) => a + (Number(n.qtd_min) || 0), 0);
    const trabalhando = sugestoes.filter(s => !s.dias[i].folga).length;
    return { data, trabalhando, necessario, gap: trabalhando - necessario };
  });
  const picos = await picosVenda(emp, lojaId);
  const gargalos = [];
  if (!colabs.length) gargalos.push({ tipo: 'sem_equipe', nivel: 'critico', msg: 'Nenhum colaborador ativo vinculado a esta loja.' });
  if (!necs.length) gargalos.push({ tipo: 'sem_necessidade', nivel: 'atencao', msg: 'Sem necessidade cadastrada p/ esta loja — cadastre em "Necessidade" para dimensionar.' });
  cobertura.filter(c => c.necessario > 0 && c.gap < 0).forEach(c =>
    gargalos.push({ tipo: 'cobertura', nivel: 'critico', data: c.data, msg: `${c.data}: ${c.trabalhando} na escala p/ ${c.necessario} necessários — faltam ${-c.gap}.` }));
  picos.horas.filter(h => h.pico).forEach(h =>
    gargalos.push({ tipo: 'pico', nivel: 'atencao', msg: `Pico de vendas às ${h.hora}h (${h.vendas} vendas/90d, ${Math.round(h.vendas / (picos.media || 1) * 100)}% da média) — reforce essa faixa.` }));
  return { modelo: { id: modelo.id, codigo: modelo.codigo, nome: modelo.nome }, colaboradores: colabs.length, sugestoes, cobertura, picos, gargalos, necessidades: necs, params: { entrada, saida, intervalo } };
}

// Aplica a sugestão criando a escala de cada colaborador (com a folga escalonada preservada).
function aplicarSugestao(emp, { lojaId, dataIni, dataFim, modeloId, entrada = '08:00', saida = '16:20', intervalo = 60, colaboradorIds }, usuario) {
  const ids = Array.isArray(colaboradorIds) ? colaboradorIds.filter(Boolean) : [];
  if (!ids.length) return { erro: 'Nenhum colaborador para aplicar.' };
  const modelo = db.prepare(`SELECT * FROM pontorep_escala_modelo WHERE id=? AND empresa_id=?`).get(modeloId, emp);
  if (!modelo) return { erro: 'Modelo não encontrado.' };
  const res = [];
  ids.forEach((id, k) => {
    const dias = gerarDias(modelo, dataIni, dataFim, entrada, saida, intervalo, k);
    const r = criarEscala(emp, { colaboradorId: id, lojaId, modeloId, dataIni, dataFim, entrada, saida, intervalo, diasCustom: dias }, usuario);
    const nome = db.prepare(`SELECT nome FROM colaboradores WHERE id=?`).get(id)?.nome || id;
    res.push({ colaboradorId: id, nome, ...(r.erro ? { erro: r.erro } : { ok: true, status: r.status, precisaAutorizacao: r.precisaAutorizacao }) });
  });
  return { ok: true, total: res.length, criadas: res.filter(r => r.ok).length, resultados: res };
}

module.exports = {
  modelos, motivos, parametros, setParam,
  validarPreview, criarEscala, criarEscalaLote, autorizarEscala, publicarEscala,
  listarEscalas, escalaDetalhe,
  feriados, criarFeriado, removerFeriado, ehFeriado,
  necessidades, criarNecessidade, removerNecessidade,
  colaboradorConfig, setColaboradorConfig,
  regrasColaborador, regraVigente, trocarRegraColaborador, removerRegraColaborador,
  alertasColaborador,
  salvarMotivoFlags, criarMotivo, justificativasAtraso, salvarJustificativa, removerJustificativa,
  configs, cfg, setConfig,
  fechamentoConfig, setFechamentoConfig, janelaCorrecao, solicitarCorrecao, listarCorrecoes, responderCorrecao,
  fecharCompetencia, reabrirCompetencia, listarFechamentos, listarEspelhos, enviarEspelhos,
  lancarAfastamento, listarAfastamentos, acompanhamento,
  picosVenda, sugerirEscalaInteligente, aplicarSugestao,
  validarFerias, solicitarFerias, listarFerias, decidirFerias,
  param, // exportado p/ o módulo de apuração
};
