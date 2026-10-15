// Indicadores do CONFERENTE a partir do ERP.
// - Erros de entrada = % de recebimentos físicos SEM divergência (bateu com a NF).
//   Fonte: recebimentofisico + flags de liberação de divergência.
// - Recepção de transporte = a recepção (tela "Recepção de Transporte" = notafiscalconferencia)
//   deve ser feita NA CHEGADA da mercadoria, não no mesmo momento em que se inicia o
//   recebimento físico. "Batida" = |recebimentofisico.datahora − notafiscalconferencia.datahora|
//   menor que o limiar (padrão 5 min) → ele registrou a recepção só na hora de conferir (errado).
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');

const GAP_BATIDA_SEG = (parseInt(process.env.RECEB_GAP_BATIDA_MIN, 10) || 5) * 60;

function faixaMes(mes, ano) {
  const ini = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const pm = mes === 12 ? 1 : mes + 1, pa = mes === 12 ? ano + 1 : ano;
  const fim = `${pa}-${String(pm).padStart(2, '0')}-01`;
  return [ini, fim];
}

// Cache curto por loja/mês (evita recalcular a mesma loja várias vezes num mesmo request —
// o ranking chama conferenteNota 4× por colaborador, todos da mesma loja).
const _cacheConf = new Map(); // chave `${lojaId}|${mes}|${ano}` → { t, dados }
const CONF_TTL_MS = 60 * 1000;

// Por conferente (usuário do ERP) numa loja/mês.
async function conferentesLojaMes(lojaId, mes, ano) {
  if (!habilitado()) return [];
  const ck = `${lojaId}|${mes}|${ano}`;
  const hit = _cacheConf.get(ck);
  if (hit && (Date.now() - hit.t) < CONF_TTL_MS) return hit.dados;
  const loja = db.prepare('SELECT erp_unidadenegocio_id FROM lojas WHERE id=?').get(lojaId);
  if (!loja || !loja.erp_unidadenegocio_id) return [];
  const uni = loja.erp_unidadenegocio_id;
  const [ini, fim] = faixaMes(mes, ano);
  const guarda = dados => { _cacheConf.set(ck, { t: Date.now(), dados }); return dados; };
  try {
    // (A) Recebimento físico → erros de entrada (divergência)
    const rf = await erpQuery(`
      SELECT u.id AS usuarioid, u.apelido AS nome, u.login,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE rf.liberacaousuariocomdivergenciaid IS NOT NULL OR rf.liberacaousuariolotedivergenteid IS NOT NULL) AS com_divergencia
      FROM recebimentofisico rf JOIN usuario u ON u.id = rf.usuarioid
      WHERE rf.unidadenegocioid = $1 AND rf.datahora >= $2 AND rf.datahora < $3
      GROUP BY u.id, u.apelido, u.login`, [uni, ini, fim]);
    // (B) Recepção de transporte × início do recebimento físico (por NF)
    const rc = await erpQuery(`
      SELECT nc.usuarioid,
        COUNT(*) AS total_recep,
        COUNT(*) FILTER (WHERE ABS(EXTRACT(EPOCH FROM (rf.datahora - nc.datahora))) < $4) AS batidas
      FROM notafiscalconferencia nc
      JOIN notafiscal nf ON nf.id = nc.notafiscalid
      JOIN recebimentofisiconotafiscal rfn ON rfn.notafiscalid = nc.notafiscalid
      JOIN recebimentofisico rf ON rf.id = rfn.recebimentofisicoid
      WHERE nf.unidadenegocioid = $1 AND nc.datahora >= $2 AND nc.datahora < $3
      GROUP BY nc.usuarioid`, [uni, ini, fim, GAP_BATIDA_SEG]);
    const recepPorUser = {}; rc.forEach(r => { recepPorUser[Number(r.usuarioid)] = { total: Number(r.total_recep) || 0, batidas: Number(r.batidas) || 0 }; });
    const orgEst = orgEstoqueNota(lojaId, mes, ano); // do checklist do gerente (por loja)
    return guarda(rf.map(r => {
      const total = Number(r.total) || 0, div = Number(r.com_divergencia) || 0;
      const rec = recepPorUser[Number(r.usuarioid)] || { total: 0, batidas: 0 };
      const erros = total ? Math.round(((total - div) / total) * 100) : null;
      const recepcao = rec.total ? Math.round(((rec.total - rec.batidas) / rec.total) * 100) : null;
      const notas = [erros, recepcao, orgEst].filter(n => n != null);
      return {
        usuarioid: Number(r.usuarioid), nome: r.nome, login: r.login, total,
        com_divergencia: div, erros_entrada_nota: erros,
        recep_total: rec.total, batidas: rec.batidas,
        recepcao_batida_pct: rec.total ? Math.round((rec.batidas / rec.total) * 100) : null,
        recepcao_nota: recepcao,
        org_estoque_nota: orgEst, // "Estoque arrumado" do checklist do gerente (mesmo p/ a loja)
        nota_geral: notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null,
      };
    }).sort((a, b) => b.total - a.total));
  } catch (e) { console.error('[recebimento] falha ERP:', e.message); return []; }
}

// Pendências operacionais de recebimento por loja (ao vivo do ERP):
//  - sem_recepcao = NFs de entrada (mov. estoque) na janela SEM recepção de transporte
//    (sem registro em notafiscalconferencia) → conferente não deu entrada da chegada.
//  - conf_abertos = recebimentos físicos iniciados e NÃO finalizados (datahorafinal IS NULL)
//    → conferência em aberto/parada.
// `lojas` = [{ id, nome, uni }] (uni = erp_unidadenegocio_id). Default janela 30 dias.
async function pendenciasRecebimento(lojas, dias = 30) {
  const base = lojas.map(l => ({ loja_id: l.id, loja_nome: l.nome, uni: Number(l.uni), sem_recepcao: 0, valor_recepcao: 0, conf_abertos: 0, conf_mais_antigo: null }));
  if (!habilitado() || !base.length) return base;
  const unis = base.map(b => b.uni);
  try {
    const rec = await erpQuery(`
      SELECT nf.unidadenegocioid AS uni,
        COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM notafiscalconferencia nc WHERE nc.notafiscalid=nf.id)) AS sem_recep,
        COALESCE(SUM(nf.valortotal) FILTER (WHERE NOT EXISTS (SELECT 1 FROM notafiscalconferencia nc WHERE nc.notafiscalid=nf.id)),0) AS valor_recep
      FROM notafiscal nf
      WHERE nf.unidadenegocioid = ANY($1) AND nf.datahoraentrada > now()-($2 || ' days')::interval
        AND nf.tipooperacao='1' AND nf.tipomovimentacaofisica='A'
      GROUP BY nf.unidadenegocioid`, [unis, String(dias)]);
    const conf = await erpQuery(`
      SELECT rf.unidadenegocioid AS uni, COUNT(*) AS abertos, MIN(rf.datahora) AS mais_antigo
      FROM recebimentofisico rf
      WHERE rf.unidadenegocioid = ANY($1) AND rf.datahorafinal IS NULL AND rf.datahora > now()-interval '120 days'
      GROUP BY rf.unidadenegocioid`, [unis]);
    const porUni = {}; base.forEach(b => porUni[b.uni] = b);
    rec.forEach(r => { const b = porUni[Number(r.uni)]; if (b) { b.sem_recepcao = Number(r.sem_recep) || 0; b.valor_recepcao = Number(r.valor_recep) || 0; } });
    conf.forEach(r => { const b = porUni[Number(r.uni)]; if (b) { b.conf_abertos = Number(r.abertos) || 0; b.conf_mais_antigo = r.mais_antigo; } });
    return base;
  } catch (e) { console.error('[recebimento] pendências falha ERP:', e.message); return base; }
}

// "Organização do estoque" do conferente = vem do item "Estoque arrumado" (seção
// Organização) que o GERENTE marca no Checklist Diário dele (tabela gerente_checklist).
// É por loja/mês (o gerente avalia o estoque da loja) → vale p/ os conferentes da loja.
function orgEstoqueNota(lojaId, mes, ano) {
  const mm = String(mes).padStart(2, '0');
  let rows;
  try {
    rows = db.prepare(`SELECT avaliacao FROM gerente_checklist
      WHERE loja_id=? AND secao LIKE '%rganiza%' AND (item LIKE '%stoque%' OR item LIKE '%rrumado%')
        AND strftime('%m', data)=? AND strftime('%Y', data)=?`).all(lojaId, mm, String(ano));
  } catch { return null; }
  if (!rows.length) return null;
  const map = { bom: 100, regular: 50, ruim: 0 };
  const vals = rows.map(r => map[r.avaliacao]).filter(v => v != null);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

// "Devoluções" do conferente = % das coletas sob responsabilidade dele registradas
// DENTRO do prazo (fluxo até a coleta, inclusive). O conferente é dono da etapa de
// coleta (devolucoes.conferente_id); a coleta é "no prazo" se foi registrada até
// prazo_horas depois de a coleta ser liberada (transição p/ status 'coleta').
function devolucoesNota(colaboradorId, mes, ano) {
  const mm = String(mes).padStart(2, '0'), yy = String(ano);
  let devs;
  try {
    devs = db.prepare(`SELECT id, prazo_horas FROM devolucoes
      WHERE conferente_id=? AND strftime('%m', criado_em)=? AND strftime('%Y', criado_em)=?`).all(colaboradorId, mm, yy);
  } catch { return null; }
  if (!devs.length) return null;
  let comColeta = 0, noPrazo = 0;
  for (const d of devs) {
    const hist = db.prepare(`SELECT status, de_status, criado_em FROM devolucao_historico
      WHERE devolucao_id=? ORDER BY criado_em ASC`).all(d.id);
    // liberou a coleta = entrou no status 'coleta'; registrou = saiu de 'coleta'
    const liberou = hist.find(h => h.status === 'coleta' && h.de_status !== 'coleta');
    const registrou = hist.find(h => h.de_status === 'coleta' && h.status !== 'coleta');
    if (!liberou || !registrou) continue; // coleta ainda não fechada → não pontua nem penaliza
    comColeta++;
    const prazoMs = (Number(d.prazo_horas) || 48) * 3600 * 1000;
    const dt = new Date(registrou.criado_em) - new Date(liberou.criado_em);
    if (dt <= prazoMs) noPrazo++;
  }
  if (!comColeta) return null;
  return Math.round((noPrazo / comColeta) * 100);
}

// Nota de um colaborador conferente (casando por erp_usuario_id ou pelo nome/apelido).
async function conferenteNota(colaboradorId, indicador, mes, ano) {
  const c = db.prepare('SELECT nome, loja_id, erp_usuario_id FROM colaboradores WHERE id=?').get(colaboradorId);
  if (!c) return null;
  if (indicador === 'devolucoes') return devolucoesNota(colaboradorId, mes, ano);
  if (indicador === 'org_estoque') return orgEstoqueNota(c.loja_id, mes, ano);
  const lista = await conferentesLojaMes(c.loja_id, mes, ano);
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const match = lista.find(x => (c.erp_usuario_id && Number(c.erp_usuario_id) === x.usuarioid) || norm(x.nome) === norm(c.nome));
  if (!match) return null;
  if (indicador === 'erros_entrada') return match.erros_entrada_nota;
  if (indicador === 'recebimento') return match.recepcao_nota; // "Recepção de transporte"
  return null;
}

module.exports = { conferentesLojaMes, conferenteNota, orgEstoqueNota, devolucoesNota, pendenciasRecebimento, GAP_BATIDA_SEG };
