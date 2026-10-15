// tesourariaErp.js — dados de Tesouraria a partir do ERP + controle de cobrança de quebras (Mutti).
//  • Quebras de caixa (sobra/falta) do operador: quebracaixa tipo 'A', cash (sem correção de cartão).
//    valor < 0 = FALTA; valor > 0 = SOBRA. Acima do limiar (padrão R$5) entra p/ cobrança do operador.
//  • Indicadores do SETOR (chefe de tesouraria, não do operador): cancelamentos, estornos, conciliação no prazo.
//  • Cruzamento: operadores com sessão de caixa no dia (sessaocaixa) x quem o gerente informou no checklist.
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa, lojasEmpresa } = require('./escopoCompras');
const tang = require('./tangerino');

const soDigitos = s => String(s || '').replace(/\D/g, '');
// Mapa usuário do ERP (id) -> colaborador Mutti {nome, tangerino_id}, casando por CPF.
async function mapaUsuarioColaborador(empresaId) {
  const cols = db.prepare(`SELECT id, nome, cpf, tangerino_id FROM colaboradores WHERE empresa_id=? AND cpf IS NOT NULL`).all(empresaId);
  const porCpf = new Map(cols.map(c => [soDigitos(c.cpf), c]));
  const us = await erpQuery(`SELECT u.id::text uid, p.cpf FROM usuario u JOIN pessoa p ON p.id=u.pessoaid WHERE p.cpf IS NOT NULL AND p.cpf<>''`, []);
  const m = new Map();
  for (const u of us) { const c = porCpf.get(soDigitos(u.cpf)); if (c) m.set(u.uid, c); }
  return m;
}

const LIMIAR_PADRAO = 5;
// Escala PADRÃO (fonte) que transforma a diferença de caixa em nota. Agora personalizável.
const ESCALA_CAIXA_PADRAO = [{ ate: 0, nota: 100 }, { ate: 5, nota: 90 }, { ate: 20, nota: 70 }, { ate: 50, nota: 40 }];

function getConfig(empresaId) {
  const g = (k, d) => { const r = db.prepare('SELECT valor FROM tesouraria_config WHERE empresa_id=? AND chave=?').get(empresaId, k); return r == null ? d : r.valor; };
  const czRaw = g('pontos_caixa_zerado', 100);
  const cz = Number(czRaw); // 0 = desliga; default 100
  let escala; try { escala = JSON.parse(g('escala_nota_caixa', 'null')); } catch { escala = null; }
  if (!Array.isArray(escala) || !escala.length) escala = ESCALA_CAIXA_PADRAO;
  else escala = escala.map(f => ({ ate: Number(f.ate) || 0, nota: Number(f.nota) || 0 })).sort((a, b) => a.ate - b.ate);
  return { limiar: Number(g('limiar_cobranca', LIMIAR_PADRAO)) || LIMIAR_PADRAO, pontosTopOperador: Number(g('pontos_top_operador', 0)) || 0, pontosDescontoQuebra: Number(g('pontos_desconto_quebra', 0)) || 0, pontosCaixaZerado: Number.isFinite(cz) ? cz : 100, escalaNotaCaixa: escala };
}
function setConfig(empresaId, { limiar, pontosTopOperador, pontosDescontoQuebra, pontosCaixaZerado, escalaNotaCaixa } = {}) {
  const up = (k, v) => db.prepare(`INSERT INTO tesouraria_config (empresa_id,chave,valor) VALUES (?,?,?)
    ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor`).run(empresaId, k, String(v));
  if (limiar != null) up('limiar_cobranca', Math.max(0, Number(limiar) || 0));
  if (pontosTopOperador != null) up('pontos_top_operador', Math.max(0, Number(pontosTopOperador) || 0));
  if (pontosDescontoQuebra != null) up('pontos_desconto_quebra', Math.max(0, Number(pontosDescontoQuebra) || 0));
  if (pontosCaixaZerado != null) up('pontos_caixa_zerado', Math.max(0, Number(pontosCaixaZerado) || 0));
  if (Array.isArray(escalaNotaCaixa)) {
    const lim = escalaNotaCaixa.map(f => ({ ate: Math.max(0, Number(f.ate) || 0), nota: Math.max(0, Math.min(100, Number(f.nota) || 0)) })).sort((a, b) => a.ate - b.ate);
    up('escala_nota_caixa', JSON.stringify(lim));
  }
  return getConfig(empresaId);
}

// Liga a cobrança da quebra ao LEDGER DE PONTOS (gamificação): "só pontuar" desconta pontos do operador.
// Idempotente por ref = quebra-pontos:<quebraId>. Se sair de 'pontuado', remove o desconto.
async function aplicarPontosQuebra(empresaId, quebra, status, usuarioId) {
  const { v4: uuid } = require('uuid');
  const ref = `quebra-pontos:${quebra.id}`;
  const jaId = db.prepare('SELECT id FROM pontos_lancamentos WHERE empresa_id=? AND ref=?').get(empresaId, ref);
  if (status !== 'pontuado') { if (jaId) db.prepare('DELETE FROM pontos_lancamentos WHERE id=?').run(jaId.id); return { removido: !!jaId }; }
  if (jaId) return { jaExistia: true };
  const pontos = Number(getConfig(empresaId).pontosDescontoQuebra) || 0;
  if (!pontos) return { semConfig: true };
  const mapU = await mapaUsuarioColaborador(empresaId);
  const colab = mapU.get(String(quebra.operadorId));
  if (!colab) return { semColaborador: true };
  const comp = (quebra.data || '').slice(0, 7);
  db.prepare(`INSERT INTO pontos_lancamentos (id,empresa_id,colaborador_id,colaborador_nome,loja_id,tipo,descricao,pontos,competencia,origem,ref,criado_por,criado_em)
    VALUES (?,?,?,?,?, 'ajuste', ?, ?, ?, 'tesouraria', ?, ?, datetime('now'))`)
    .run(uuid(), empresaId, colab.id, colab.nome, quebra.lojaId || colab.loja_id || null,
      `Quebra de caixa em ${String(quebra.data || '').split('-').reverse().join('/')} — −${pontos} pontos`, -pontos, comp, ref, usuarioId || null);
  return { descontado: pontos, colaborador: colab.nome };
}

// unidade ERP -> nome da loja Mutti (p/ rotular linhas)
function mapaUnidadeLoja(empresaId) {
  const m = new Map();
  for (const l of lojasEmpresa(empresaId)) if (l.erp_unidadenegocio_id != null) m.set(Number(l.erp_unidadenegocio_id), l);
  return m;
}

// ── Quebras de caixa (operador) ─────────────────────────────────────────────
async function quebras(empresaId, { ini, fim, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !habilitado()) return { ok: true, quebras: [], resumo: vazioResumo(), limiar: getConfig(empresaId).limiar };
  const cfg = getConfig(empresaId);
  const rows = await erpQuery(`
    SELECT q.id::text id, q.datahora::date::text data, q.valor::float8 valor,
           q.usuarioresponsavelid::text operador_id, q.unidadenegocioid::int unidade,
           q.observacao, q.status, u.login, p.nome operador
    FROM quebracaixa q
    LEFT JOIN usuario u ON u.id=q.usuarioresponsavelid
    LEFT JOIN pessoa p ON p.id=u.pessoaid
    WHERE q.tipo='A' AND q.origemcorrecaocartaoreceberid IS NULL
      AND q.unidadenegocioid = ANY($1::bigint[])
      AND q.datahora >= $2::date AND q.datahora < ($3::date + 1)
    ORDER BY q.datahora DESC, abs(q.valor) DESC`, [unis, ini, fim]);

  const mapLoja = mapaUnidadeLoja(empresaId);
  const ids = rows.map(r => r.id);
  const cobr = ids.length
    ? new Map(db.prepare(`SELECT quebra_erp_id, status, valor_cobrado, observacao, resolvido_em FROM caixa_cobrancas
        WHERE empresa_id=? AND quebra_erp_id IN (${ids.map(() => '?').join(',')})`).all(empresaId, ...ids).map(c => [c.quebra_erp_id, c]))
    : new Map();

  const resumo = vazioResumo();
  const quebras = rows.map(r => {
    const valor = Number(r.valor) || 0;
    const tipo = valor < 0 ? 'falta' : 'sobra';
    const relevante = Math.abs(valor) > cfg.limiar;   // acima do limiar = diferença que exige atenção/justificativa
    const acobrar = relevante && tipo === 'falta';    // cobrança monetária do operador só em FALTA
    const c = cobr.get(r.id);
    const loja = mapLoja.get(Number(r.unidade));
    resumo.total++;
    if (tipo === 'falta') { resumo.faltas++; resumo.valorFalta += valor; } else { resumo.sobras++; resumo.valorSobra += valor; }
    if (relevante) { resumo.relevantes++; if (tipo === 'sobra') resumo.sobrasRelevantes++; }
    if (acobrar) { resumo.acobrar++; resumo.valorAcobrar += Math.abs(valor); if (!c || c.status === 'pendente') resumo.pendentes++; }
    return {
      id: r.id, data: r.data, valor, tipo, acobrar, relevante,
      operadorId: r.operador_id, operador: (r.operador || r.login || '—').trim(), login: r.login,
      lojaId: loja?.id || null, loja: loja?.nome || ('Unid. ' + r.unidade),
      observacao: r.observacao || '', erpStatus: r.status,
      cobranca: c ? { status: c.status, valorCobrado: c.valor_cobrado, observacao: c.observacao, resolvidoEm: c.resolvido_em } : { status: 'pendente' },
    };
  });
  resumo.valorFalta = round(resumo.valorFalta); resumo.valorSobra = round(resumo.valorSobra); resumo.valorAcobrar = round(resumo.valorAcobrar);
  return { ok: true, quebras, resumo, limiar: cfg.limiar };
}
function vazioResumo() { return { total: 0, faltas: 0, sobras: 0, valorFalta: 0, valorSobra: 0, relevantes: 0, sobrasRelevantes: 0, acobrar: 0, valorAcobrar: 0, pendentes: 0 }; }
const round = n => Math.round((Number(n) || 0) * 100) / 100;

// Marca a decisão de cobrança de uma quebra (upsert por quebra_erp_id).
function marcarCobranca(empresaId, quebra, { status, valorCobrado, observacao, usuarioId } = {}) {
  const { v4: uuid } = require('uuid');
  const comp = (quebra.data || '').slice(0, 7);
  const existe = db.prepare('SELECT id FROM caixa_cobrancas WHERE empresa_id=? AND quebra_erp_id=?').get(empresaId, quebra.id);
  const resolvido = status && status !== 'pendente';
  if (existe) {
    db.prepare(`UPDATE caixa_cobrancas SET status=?, valor_cobrado=?, observacao=?, resolvido_em=${resolvido ? "datetime('now')" : 'NULL'}, resolvido_por=? WHERE id=?`)
      .run(status || 'pendente', Number(valorCobrado) || 0, observacao || null, resolvido ? (usuarioId || null) : null, existe.id);
    return { ok: true, id: existe.id, atualizado: true };
  }
  const id = uuid();
  db.prepare(`INSERT INTO caixa_cobrancas (id,empresa_id,quebra_erp_id,loja_id,operador_erp_id,operador_nome,data,valor,tipo,status,valor_cobrado,observacao,competencia,resolvido_em,resolvido_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,${resolvido ? "datetime('now')" : 'NULL'},?)`)
    .run(id, empresaId, quebra.id, quebra.lojaId || null, quebra.operadorId || null, quebra.operador || null, quebra.data || null,
      Number(quebra.valor) || 0, quebra.tipo || null, status || 'pendente', Number(valorCobrado) || 0, observacao || null, comp, resolvido ? (usuarioId || null) : null);
  return { ok: true, id, criado: true };
}

// ── Indicadores do SETOR (chefe de tesouraria) ──────────────────────────────
async function indicadoresSetor(empresaId, { ini, fim, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !habilitado()) return { ok: false, erro: 'Sem lojas mapeadas no ERP.' };
  const [canc, est, conc] = await Promise.all([
    // Cancelamentos de venda (status C) x fechadas (F)
    erpQuery(`SELECT count(*) FILTER (WHERE status='C') canceladas, count(*) FILTER (WHERE status='F') fechadas
      FROM venda WHERE unidadenegocioid = ANY($1::bigint[]) AND datahoraabertura >= $2::date AND datahoraabertura < ($3::date + 1)`, [unis, ini, fim]),
    // Estornos de pagamento de venda (envolve conciliação de cartão)
    erpQuery(`SELECT count(*) estornos FROM estornovenda
      WHERE unidadenegocioid = ANY($1::bigint[]) AND datahora >= $2::date AND datahora < ($3::date + 1)`, [unis, ini, fim]),
    // Conciliação de cartão: itens conciliados (baixadata) e no prazo (baixa <= vencimento)
    erpQuery(`SELECT count(*) itens, count(baixadata) conciliados,
        count(*) FILTER (WHERE baixadata IS NOT NULL AND baixadata::date <= datavencimento) no_prazo
      FROM conciliacaocartaoitem
      WHERE unidadenegocioid = ANY($1::bigint[]) AND datahoratransacao >= $2::date AND datahoratransacao < ($3::date + 1)`, [unis, ini, fim]),
  ]);
  const c = canc[0] || {}, e = est[0] || {}, k = conc[0] || {};
  const canceladas = Number(c.canceladas) || 0, fechadas = Number(c.fechadas) || 0;
  const estornos = Number(e.estornos) || 0;
  const itens = Number(k.itens) || 0, conciliados = Number(k.conciliados) || 0, noPrazo = Number(k.no_prazo) || 0;
  const pct = (a, b) => b > 0 ? round(100 * a / b) : 0;
  return {
    ok: true, periodo: { ini, fim },
    cancelamentos: { qtd: canceladas, base: fechadas + canceladas, taxa: pct(canceladas, fechadas + canceladas) },
    estornos: { qtd: estornos, base: fechadas, taxa: pct(estornos, fechadas) },
    conciliacao: { itens, conciliados, pendentes: itens - conciliados, indice: pct(conciliados, itens), noPrazo, indiceNoPrazo: pct(noPrazo, conciliados) },
  };
}

// ── Cruzamento: sessões de caixa do dia (operadores que abriram/fecharam) ────
async function sessoesDia(empresaId, { data, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !habilitado()) return { ok: true, sessoes: [] };
  const rows = await erpQuery(`
    SELECT s.id::text id, s.caixaid::text caixa, s.pdvid::text pdv, s.unidadenegocioid::int unidade,
           s.datahorainicial, s.datahorafinal, s.usuarioid::text operador_id, u.login, p.nome operador,
           (f.id IS NOT NULL) fechado
    FROM sessaocaixa s
    LEFT JOIN usuario u ON u.id=s.usuarioid
    LEFT JOIN pessoa p ON p.id=u.pessoaid
    LEFT JOIN fechamentocaixa f ON f.sessaocaixaid=s.id
    WHERE s.unidadenegocioid = ANY($1::bigint[]) AND s.datahorainicial::date = $2::date
    ORDER BY s.datahorainicial`, [unis, data]);
  const mapLoja = mapaUnidadeLoja(empresaId);
  const sessoes = rows.map(r => {
    const loja = mapLoja.get(Number(r.unidade));
    return {
      id: r.id, caixa: r.caixa, pdv: r.pdv, lojaId: loja?.id || null, loja: loja?.nome || ('Unid. ' + r.unidade),
      operadorId: r.operador_id, operador: (r.operador || r.login || '—').trim(), login: r.login,
      inicio: r.datahorainicial, fim: r.datahorafinal, fechado: !!r.fechado,
    };
  });
  return { ok: true, data, sessoes };
}

// ── Cancelamentos × ponto ───────────────────────────────────────────────────
// O cancelamento de venda no caixa é autorizado pelo GERENTE (senha de liberação), não pelo operador.
// Cruzamos o horário do cancelamento com as batidas do gerente que autorizou (liberacaousuario):
// 'dentro' (estava trabalhando), 'fora' (autorizou fora do horário) ou 'sem_vinculo'.
const TOL_MS = 5 * 60 * 1000;        // tolerância de 5 min nas bordas
const TURNO_MAX_MS = 12 * 3600 * 1000; // se faltou bater a saída, considera até 12h após a entrada
async function cancelamentos(empresaId, { ini, fim, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !habilitado()) return { ok: false, erro: 'Sem lojas mapeadas no ERP.' };
  const rows = await erpQuery(`
    SELECT v.id::text id, v.datahoraabertura dh, v.valortotal::float8 valor, v.unidadenegocioid::int unidade,
           lu.usuarioid::text uid, gu.login, gp.nome gerente, op.nome caixa
    FROM venda v
    LEFT JOIN liberacaousuario lu ON lu.id=v.liberacaousuariocancelamentoid
    LEFT JOIN usuario gu ON gu.id=lu.usuarioid LEFT JOIN pessoa gp ON gp.id=gu.pessoaid
    LEFT JOIN usuario ou ON ou.id=v.usuarioid LEFT JOIN pessoa op ON op.id=ou.pessoaid
    WHERE v.status='C' AND v.unidadenegocioid = ANY($1::bigint[])
      AND v.datahoraabertura >= $2::date AND v.datahoraabertura < ($3::date + 1)
    ORDER BY v.datahoraabertura DESC LIMIT 2000`, [unis, ini, fim]);

  const mapU = await mapaUsuarioColaborador(empresaId);
  // batidas do período por tangerino_id -> [{in,out}]
  const batIdx = new Map(); let pontoOk = false;
  if (tang.habilitado()) {
    try {
      const bat = await tang.todasBatidas({ startDate: ini, endDate: fim });
      for (const b of bat) {
        const tid = String(b.employeeId); if (!b.dateIn) continue;
        if (!batIdx.has(tid)) batIdx.set(tid, []);
        batIdx.get(tid).push({ in: Number(b.dateIn), out: b.dateOut ? Number(b.dateOut) : Number(b.dateIn) + TURNO_MAX_MS });
      }
      pontoOk = true;
    } catch { pontoOk = false; }
  }
  const mapLoja = mapaUnidadeLoja(empresaId);
  const resumo = { total: 0, valor: 0, dentro: 0, fora: 0, semVinculo: 0, valorFora: 0 };
  const lista = rows.map(r => {
    const t = new Date(r.dh).getTime();
    const col = mapU.get(r.uid); // gerente que autorizou → colaborador → Tangerino
    let situacao = 'sem_vinculo';
    if (col && col.tangerino_id && pontoOk) {
      const ivs = batIdx.get(String(col.tangerino_id)) || [];
      situacao = ivs.some(iv => t >= iv.in - TOL_MS && t <= iv.out + TOL_MS) ? 'dentro' : 'fora';
    }
    const valor = Number(r.valor) || 0;
    resumo.total++; resumo.valor += valor;
    if (situacao === 'dentro') resumo.dentro++;
    else if (situacao === 'fora') { resumo.fora++; resumo.valorFora += valor; }
    else resumo.semVinculo++;
    const loja = mapLoja.get(Number(r.unidade));
    return { id: r.id, data: r.dh, valor, gerente: (r.gerente || r.login || '—').trim(), login: r.login,
      caixa: (r.caixa || '').trim(), loja: loja?.nome || ('Unid. ' + r.unidade), situacao, colaborador: col?.nome || null };
  });
  resumo.valor = round(resumo.valor); resumo.valorFora = round(resumo.valorFora);
  return { ok: true, pontoOk, periodo: { ini, fim }, cancelamentos: lista, resumo };
}

// ── Cupons baixados por operador de caixa (desempenho de atendimento) ────────
// "Cupom baixado" = venda fechada (status='F') processada pelo operador (venda.usuarioid). Filtro por loja ou todas.
async function cuponsPorOperador(empresaId, { ini, fim, lojaId } = {}) {
  const unis = unisEmpresa(empresaId, lojaId);
  if (!unis.length || !habilitado()) return { ok: false, erro: 'Sem lojas mapeadas no ERP.' };
  const rows = await erpQuery(`
    SELECT COALESCE(p.nome, u.login, '—') operador, u.id::text operador_id, count(*) cupons,
      sum(v.valortotal)::float8 valor, count(DISTINCT v.unidadenegocioid) lojas
    FROM venda v LEFT JOIN usuario u ON u.id=v.usuarioid LEFT JOIN pessoa p ON p.id=u.pessoaid
    WHERE v.status='F' AND v.unidadenegocioid = ANY($1::bigint[])
      AND v.datahorafechamento >= $2::date AND v.datahorafechamento < ($3::date + 1)
    GROUP BY 1,2 ORDER BY cupons DESC`, [unis, ini, fim]);
  const total = rows.reduce((a, r) => a + Number(r.cupons), 0);
  const operadores = rows.map(r => ({
    operador: (r.operador || '—').trim(), operadorId: r.operador_id, cupons: Number(r.cupons) || 0,
    valor: round(r.valor), ticket: Number(r.cupons) ? round(Number(r.valor) / Number(r.cupons)) : 0, lojas: Number(r.lojas) || 1,
  }));
  return { ok: true, total, operadores, pontosTop: Number(getConfig(empresaId).pontosTopOperador) || 0 };
}

// Premia o operador que mais baixou cupons no mês. Idempotente por competência (ano-mês [+loja]).
async function premiarTopOperador(empresaId, { ano, mes, lojaId, usuarioId } = {}) {
  const pontos = Number(getConfig(empresaId).pontosTopOperador) || 0;
  if (!pontos) return { ok: false, erro: 'Configure os pontos do operador destaque antes de premiar.' };
  const y = Number(ano), m = Number(mes);
  if (!y || !m) return { ok: false, erro: 'Informe ano e mês.' };
  const ini = `${y}-${String(m).padStart(2, '0')}-01`;
  const fimD = new Date(y, m, 0).getDate();
  const fim = `${y}-${String(m).padStart(2, '0')}-${String(fimD).padStart(2, '0')}`;
  const r = await cuponsPorOperador(empresaId, { ini, fim, lojaId });
  if (!r.ok || !r.operadores.length) return { ok: false, erro: r.erro || 'Sem cupons no período.' };
  const top = r.operadores[0];
  const mapU = await mapaUsuarioColaborador(empresaId);
  const colab = mapU.get(top.operadorId);
  if (!colab) return { ok: false, erro: `Operador destaque (${top.operador}) sem colaborador vinculado por CPF.` };
  const { v4: uuid } = require('uuid');
  const competencia = `${y}-${String(m).padStart(2, '0')}`;
  const ref = `top-operador:${competencia}:${lojaId || 'todas'}`;
  const ja = db.prepare('SELECT 1 FROM pontos_lancamentos WHERE empresa_id=? AND ref=?').get(empresaId, ref);
  if (ja) return { ok: true, premiado: false, jaExistia: true, top, pontos };
  db.prepare(`INSERT INTO pontos_lancamentos (id,empresa_id,colaborador_id,colaborador_nome,loja_id,tipo,descricao,pontos,competencia,origem,ref,criado_por,criado_em)
    VALUES (?,?,?,?,?, 'premio', ?, ?, ?, 'tesouraria', ?, ?, datetime('now'))`)
    .run(uuid(), empresaId, colab.id, colab.nome, colab.loja_id || null,
      `Operador destaque do caixa em ${String(m).padStart(2, '0')}/${y} (${top.cupons} cupons) — +${pontos} pontos`,
      pontos, competencia, ref, usuarioId || null);
  return { ok: true, premiado: true, top, colaborador: colab.nome, pontos };
}

// Conferência: cruza as SESSÕES de caixa do ERP com os operadores que o gerente INFORMOU no
// checklist do dia (= os lancamentos_caixa do dia/loja). Flag por sessão + lista de informados sem sessão.
async function conferenciaCaixa(empresaId, { data, lojaId } = {}) {
  const s = await sessoesDia(empresaId, { data, lojaId });
  if (!s.ok) return s;
  const mapU = await mapaUsuarioColaborador(empresaId); // uid ERP -> colaborador
  const inf = db.prepare(`SELECT DISTINCT lc.colaborador_id, lc.loja_id, c.nome, l.nome loja
      FROM lancamentos_caixa lc JOIN colaboradores c ON c.id=lc.colaborador_id LEFT JOIN lojas l ON l.id=lc.loja_id
      WHERE lc.empresa_id=? AND date(lc.data)=date(?) ${lojaId ? 'AND lc.loja_id=?' : ''}`).all(...(lojaId ? [empresaId, data, lojaId] : [empresaId, data]));
  const infSet = new Set(inf.map(i => i.colaborador_id));
  const sessoes = s.sessoes.map(se => {
    const colab = mapU.get(String(se.operadorId));
    const foiInformado = colab ? infSet.has(colab.id) : false;
    return { ...se, colaboradorId: colab?.id || null, colaboradorNome: colab?.nome || null,
      status: !colab ? 'sem_vinculo' : (foiInformado ? 'ok' : 'nao_informado') };
  });
  const comSessao = new Set(sessoes.map(se => se.colaboradorId).filter(Boolean));
  const informadosSemSessao = inf.filter(i => !comSessao.has(i.colaborador_id)).map(i => ({ colaboradorId: i.colaborador_id, nome: i.nome, loja: i.loja }));
  const resumo = {
    sessoes: sessoes.length,
    ok: sessoes.filter(x => x.status === 'ok').length,
    naoInformado: sessoes.filter(x => x.status === 'nao_informado').length,
    semVinculo: sessoes.filter(x => x.status === 'sem_vinculo').length,
    informadosSemSessao: informadosSemSessao.length,
  };
  return { ok: true, data, sessoes, informadosSemSessao, resumo };
}

// Débitos do operador = quebras marcadas como COBRADO ainda não quitadas (contas a receber do funcionário).
function debitosOperador(empresaId, { lojaId, incluirPagos } = {}) {
  const nomeLoja = mapaUnidadeLoja(empresaId);
  const rows = db.prepare(`SELECT id, quebra_erp_id, loja_id, operador_erp_id, operador_nome, data, valor, valor_cobrado, competencia, observacao, pago, pago_em
    FROM caixa_cobrancas WHERE empresa_id=? AND status='cobrado' AND valor_cobrado>0 ${lojaId ? 'AND loja_id=?' : ''} ${incluirPagos ? '' : 'AND COALESCE(pago,0)=0'}
    ORDER BY pago ASC, data DESC`).all(...(lojaId ? [empresaId, lojaId] : [empresaId]));
  const nomeDaLoja = id => { const l = db.prepare('SELECT nome FROM lojas WHERE id=?').get(id); return l ? l.nome : (nomeLoja[id] || '—'); };
  const itens = rows.map(r => ({
    id: r.id, quebraId: r.quebra_erp_id, loja: nomeDaLoja(r.loja_id), operador: r.operador_nome || '—', operadorId: r.operador_erp_id,
    data: r.data, valor: round(r.valor), valorCobrado: round(r.valor_cobrado), competencia: r.competencia, observacao: r.observacao,
    pago: !!r.pago, pagoEm: r.pago_em,
  }));
  // agrega por operador (só em aberto)
  const porOp = new Map();
  for (const it of itens) { if (it.pago) continue; const k = it.operadorId || it.operador; if (!porOp.has(k)) porOp.set(k, { operador: it.operador, operadorId: it.operadorId, qtd: 0, total: 0 }); const o = porOp.get(k); o.qtd++; o.total = round(o.total + it.valorCobrado); }
  const operadores = [...porOp.values()].sort((a, b) => b.total - a.total);
  const totalAberto = round(itens.filter(i => !i.pago).reduce((a, i) => a + i.valorCobrado, 0));
  return { ok: true, totalAberto, qtdAberto: itens.filter(i => !i.pago).length, operadores, itens };
}
function marcarPagoCobranca(empresaId, cobrancaId, { pago = true, usuarioId } = {}) {
  const c = db.prepare('SELECT id FROM caixa_cobrancas WHERE id=? AND empresa_id=?').get(cobrancaId, empresaId);
  if (!c) return { ok: false, erro: 'Cobrança não encontrada.' };
  db.prepare(`UPDATE caixa_cobrancas SET pago=?, pago_em=${pago ? "datetime('now')" : 'NULL'}, pago_por=? WHERE id=?`).run(pago ? 1 : 0, pago ? (usuarioId || null) : null, cobrancaId);
  return { ok: true };
}

module.exports = { getConfig, setConfig, quebras, marcarCobranca, indicadoresSetor, sessoesDia, cancelamentos, mapaUsuarioColaborador, cuponsPorOperador, premiarTopOperador, aplicarPontosQuebra, debitosOperador, marcarPagoCobranca, conferenciaCaixa };
