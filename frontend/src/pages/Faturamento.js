import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import MeuSetorArea from './MeuSetorArea';
import MinhaAreaLateral from '../components/MinhaAreaLateral';

const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const num = v => (Number(v) || 0).toLocaleString('pt-BR');
const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Financeiro'];
const cmvCor = c => c == null ? '#94a3b8' : c <= 50 ? '#15803d' : c <= 68 ? '#B7791F' : '#C0392B';

const c = {
  card: { background: '#fff', border: '1px solid #eef1f4', borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: '0 1px 2px rgba(16,40,45,.04)' },
  inp: { border: '1px solid #e3e8ea', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  fld: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5, color: '#64748b', fontWeight: 600 },
  th: { padding: '9px 10px', textAlign: 'left', color: '#64748b', fontSize: 12, fontWeight: 700 },
  td: { padding: '9px 10px', fontSize: 12.5 },
  tab: { padding: '8px 14px', borderRadius: 9, border: '1px solid #e3e8ea', background: '#f3f7f6', color: '#334', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  tabOn: { background: 'linear-gradient(95deg,#0E7C5A,#0b6e59)', color: '#fff', borderColor: 'transparent' },
};
const ABAS = [['geral', '📊 Visão geral'], ['vendedores', '🧑‍💼 Vendedores'], ['comparativo', '📈 Comparativo'], ['metas', '🎯 Metas']];

function Stat({ label, valor, sub, cor }) {
  return <div style={{ background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 10, padding: '8px 12px', minWidth: 120 }}>
    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color: cor || '#1f2937' }}>{valor}</div>
    {sub && <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{sub}</div>}
  </div>;
}

export function FaturamentoOnline() { return <Faturamento canal="entrega" />; }
export default function Faturamento({ canal = 'todos' } = {}) {
  const { API, usuario } = useAuth();
  const online = canal === 'entrega';
  const gestao = GESTAO.includes(usuario?.funcao);
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  const [periodo, setPeriodo] = useState('30'); // 'hoje' | 7|15|30|60|90 | 'custom'
  const [ini, setIni] = useState(''); const [fim, setFim] = useState('');
  const [d, setD] = useState(null);
  const [carreg, setCarreg] = useState(false);
  const [aba, setAba] = useState('geral');
  const ymdLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const _ag = new Date(); const hojeStr = ymdLocal(_ag);
  const ontemStr = ymdLocal(new Date(_ag.getFullYear(), _ag.getMonth(), _ag.getDate() - 1));
  const semanaStr = ymdLocal(new Date(_ag.getFullYear(), _ag.getMonth(), _ag.getDate() - ((_ag.getDay() + 6) % 7)));
  const mesAtual = { ini: ymdLocal(new Date(_ag.getFullYear(), _ag.getMonth(), 1)), fim: hojeStr };
  const mesPassado = { ini: ymdLocal(new Date(_ag.getFullYear(), _ag.getMonth() - 1, 1)), fim: ymdLocal(new Date(_ag.getFullYear(), _ag.getMonth(), 0)) };
  useEffect(() => { API.get('/faturamento/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  const periodoParams = periodo === 'hoje' ? { ini: hojeStr, fim: hojeStr }
    : periodo === 'ontem' ? { ini: ontemStr, fim: ontemStr } : periodo === 'semana' ? { ini: semanaStr, fim: hojeStr }
    : periodo === 'mes_atual' ? mesAtual : periodo === 'mes_passado' ? mesPassado
      : periodo === 'custom' ? (ini && fim ? { ini, fim } : null) : { dias: Number(periodo) };
  const diasEff = periodoParams && periodoParams.ini && periodoParams.fim
    ? Math.max(1, Math.round((new Date(periodoParams.fim) - new Date(periodoParams.ini)) / 86400000) + 1)
    : (periodoParams && periodoParams.dias) || 30;
  const carregar = useCallback(() => {
    if (!periodoParams) return;
    setCarreg(true);
    API.get('/faturamento', { params: { loja, canal, ...periodoParams } }).then(r => setD(r.data)).catch(() => setD(null)).finally(() => setCarreg(false));
  }, [API, loja, canal, periodo, ini, fim]); // eslint-disable-line
  useEffect(() => { carregar(); }, [carregar]);
  const escopo = loja ? (lojas.find(l => l.id === loja)?.nome || 'loja') : 'Rede (todas as lojas)';

  return (
    <div style={{ padding: '18px 20px' }}>
      <Banner emoji={online ? '🛒' : '📊'} titulo={online ? 'Online' : 'Faturamento'} cor="verde" sub={online ? 'As mesmas informações do Faturamento, mas apenas do que foi faturado por ENTREGA (vendas online) — por loja, vendedor e grupo/classificação, com metas próprias.' : 'Venda, CMV, unidades, clientes e ticket por loja, vendedor e grupo/classificação — do espelho do ERP. Inclui a projeção do mês (mesma base do orçamento de Compras).'} />
      <div style={{ ...c.card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={c.fld}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={{ ...c.inp, minWidth: 190 }}>
          <option value="">Rede (todas)</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select></label>
        <label style={c.fld}>Período<select value={periodo} onChange={e => setPeriodo(e.target.value)} style={c.inp}>
          <option value="hoje">Hoje</option>
          <option value="ontem">Ontem</option>
          <option value="semana">Esta semana</option>
          <option value="mes_atual">Mês atual</option>
          <option value="mes_passado">Mês passado</option>
          {[7, 15, 30, 60, 90].map(n => <option key={n} value={String(n)}>últimos {n} dias</option>)}
          <option value="custom">Datas específicas…</option>
        </select></label>
        {periodo === 'custom' && <label style={c.fld}>De–Até<span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <input type="date" value={ini} onChange={e => setIni(e.target.value)} style={{ ...c.inp, padding: '5px 7px' }} />–
          <input type="date" value={fim} onChange={e => setFim(e.target.value)} style={{ ...c.inp, padding: '5px 7px' }} />
        </span></label>}
        <button onClick={carregar} style={{ ...c.inp, cursor: 'pointer', fontWeight: 700 }}>🔄 Atualizar</button>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b', alignSelf: 'center' }}>{escopo}</div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {(online ? [...ABAS, ['meu-setor', '🎯 Meu Setor']] : ABAS).map(([k, l]) => <button key={k} onClick={() => setAba(k)} style={{ ...c.tab, ...(aba === k ? c.tabOn : {}) }}>{l}</button>)}
      </div>

      {aba === 'meu-setor' && <MeuSetorArea area="online" embutido />}

      {carreg && !d && <div style={c.card}>⏳ Carregando o espelho do ERP…</div>}
      {d && d.erp === false && <div style={c.card}>⚠️ ERP indisponível no momento.</div>}
      {d && d.erro && <div style={c.card}>⚠️ {d.erro}</div>}

      {d && d.erp && !d.erro && <>
        {aba === 'geral' && <VisaoGeral d={d} online={online} API={API} loja={loja} dias={diasEff} ini={periodoParams?.ini || ''} fim={periodoParams?.fim || ''} canal={canal} />}
        {aba === 'vendedores' && <Vendedores API={API} d={d} loja={loja} dias={diasEff} canal={canal} gestao={gestao} />}
        {aba === 'comparativo' && <Comparativo API={API} loja={loja} canal={canal} />}
        {aba === 'metas' && <Metas API={API} gestao={gestao} lojas={lojas} d={d} canal={canal} />}
      </>}
      {online && <MinhaAreaLateral area="online" titulo="Minha área" />}
    </div>
  );
}

const minLbl = m => m == null ? '—' : (m >= 60 ? Math.floor(m / 60) + 'h' + String(Math.round(m % 60)).padStart(2, '0') : m + ' min');
// Avaliações CSAT < 3 que precisam de justificativa do responsável. "Minha área" = só as do colab logado.
function AvaliacoesBaixas({ API, loja, ini, fim }) {
  const [minhas, setMinhas] = useState(false);
  const [d, setD] = useState(null); const [rasc, setRasc] = useState({});
  const carregar = useCallback(() => { API.get('/faturamento/avaliacoes-baixas', { params: { minhas: minhas ? 1 : undefined, loja, ini: ini || undefined, fim: fim || undefined } }).then(r => setD(r.data)).catch(() => setD(null)); }, [API, minhas, loja, ini, fim]);
  useEffect(() => { carregar(); }, [carregar]);
  const salvar = (ans) => { const t = (rasc[ans] || '').trim(); if (!t) return; API.post('/faturamento/avaliacao-justificar', { answer_id: ans, justificativa: t }).then(() => { setRasc(m => ({ ...m, [ans]: '' })); carregar(); }).catch(() => {}); };
  const it = d?.itens || [];
  const dBR2 = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
  return (
    <div style={c.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>⭐ Avaliações abaixo de 3 <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 400 }}>— precisam de justificativa do responsável</span></div>
        {d && <span style={{ fontSize: 12, color: d.pendentes ? '#C0392B' : '#15803d', fontWeight: 700 }}>{d.pendentes} sem justificar</span>}
        <label style={{ marginLeft: 'auto', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={minhas} onChange={e => setMinhas(e.target.checked)} /> 👤 Minha área (só as minhas)
        </label>
      </div>
      {it.length === 0 ? <div style={{ fontSize: 13, color: '#15803d' }}>✅ Nenhuma avaliação abaixo de 3 {minhas ? 'sua ' : ''}no período.</div> :
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: 'left', color: '#7a8a8c', borderBottom: '2px solid #eef1f4' }}>{['Data', 'Nota', 'Vendedor', 'Pedido', 'Justificativa'].map(h => <th key={h} style={{ padding: '7px 8px' }}>{h}</th>)}</tr></thead>
          <tbody>{it.map(r => <tr key={r.answer_id} style={{ borderTop: '1px solid #f1f3f5' }}>
            <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{dBR2(r.respondido_em)}</td>
            <td style={{ padding: '7px 8px' }}><span style={{ background: '#fdecea', color: '#C0392B', borderRadius: 6, padding: '1px 8px', fontWeight: 800 }}>{r.nota}</span></td>
            <td style={{ padding: '7px 8px', fontWeight: 600 }}>{r.vendedor_nome || '—'}</td>
            <td style={{ padding: '7px 8px', color: '#666' }}>{r.order_id || '—'}</td>
            <td style={{ padding: '7px 8px', minWidth: 260 }}>{r.justificativa ?
              <div><div>{r.justificativa}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>por {r.justificado_por || '—'} · {dBR2(r.justificado_em)}</div></div> :
              <div style={{ display: 'flex', gap: 6 }}><input value={rasc[r.answer_id] || ''} onChange={e => setRasc(m => ({ ...m, [r.answer_id]: e.target.value }))} placeholder="justifique…" style={{ flex: 1, border: '1px solid #ddd', borderRadius: 7, padding: '5px 8px', fontSize: 12 }} />
                <button onClick={() => salvar(r.answer_id)} style={{ background: '#0d6b5e', color: '#fff', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Salvar</button></div>}</td>
          </tr>)}</tbody>
        </table></div>}
    </div>
  );
}

function VisaoGeral({ d, online, API, loja, dias, ini, fim, canal }) {
  const [exp, setExp] = useState(null);
  const [cestasView, setCestasView] = useState('motivo');
  const [atend, setAtend] = useState(null); const [metaT, setMetaT] = useState({}); const [vendas, setVendas] = useState(null);
  // Metas (venda/ticket/cmv/unidades/identificação + tempos) — valem pro Faturamento e pro Online.
  useEffect(() => {
    if (!API) return;
    API.get('/faturamento/metas', { params: { canal, escopo: loja ? 'loja' : 'rede', alvo: loja || '' } }).then(r => { const its = r.data.itens || []; const comp = new Date().toISOString().slice(0, 7); const f = ind => { const e = its.find(x => x.competencia === comp && x.indicador === ind) || its.find(x => x.competencia === '' && x.indicador === ind); return e ? Number(e.meta) : null; }; setMetaT({ resp: f('tempo_resposta'), at: f('tempo_atendimento'), venda: f('venda'), ticket: f('ticket'), cmv: f('cmv'), unidades: f('unidades'), clientes: f('clientes_identif') }); }).catch(() => {});
  }, [API, loja, canal]);
  useEffect(() => {
    if (!online || !API) return;
    API.get('/faturamento/atendimento-online', { params: { loja, dias, ini: ini || undefined, fim: fim || undefined } }).then(r => setAtend(r.data)).catch(() => {});
    API.get('/faturamento/vendas-online', { params: { dias, ini: ini || undefined, fim: fim || undefined } }).then(r => setVendas(r.data)).catch(() => setVendas(null));
  }, [API, online, loja, dias, ini, fim]);
  const t = d.totais, p = d.projecao;
  const tempoCard = (label, min, meta) => { const ok = meta != null && min != null && min <= meta; const bad = meta != null && min != null && min > meta; return <div style={{ background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 10, padding: '8px 14px', minWidth: 150 }}>
    <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 800, color: bad ? '#C0392B' : ok ? '#15803d' : '#1f2937' }}>{minLbl(min)}</div>
    {meta != null && <div style={{ fontSize: 10.5, color: ok ? '#15803d' : '#C0392B' }}>meta ≤ {minLbl(meta)} {ok ? '✓' : '▲'}</div>}
  </div>; };
  // Meta junto do indicador (no hero): linha "meta ≥/≤ X ✓/▲". `maior`=true quando maior é melhor.
  const okMeta = (real, meta, maior) => (meta == null || real == null) ? null : (maior ? real >= meta : real <= meta);
  const mLine = (meta, real, fmt, maior = true) => meta == null ? null : (
    <div style={{ fontSize: 10, marginTop: 1, color: okMeta(real, meta, maior) ? '#bff0de' : '#ffd6cf' }}>meta {maior ? '≥' : '≤'} {fmt(meta)} {okMeta(real, meta, maior) ? '✓' : '▲'}</div>
  );
  return (
    <div>
      <div style={{ ...c.card, background: 'linear-gradient(135deg,#0E7C5A,#0b6e59)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, opacity: .85 }}>Venda no período ({d.dias} dias)</div>
            <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{brl(t.venda)}</div>
            {mLine(metaT.venda, t.venda, brl0, true)}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, opacity: .85 }}>Projeção do mês (run-rate)</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{brl0(p.projecaoMes)}</div>
            <div style={{ fontSize: 10.5, opacity: .8 }}>{brl0(p.vendaMes)} em {p.dia}/{p.diasMes} dias · base do orçamento de Compras</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12, fontSize: 13 }}>
          <div><b style={{ fontSize: 18 }}>{t.cmv != null ? t.cmv + '%' : '—'}</b><div style={{ opacity: .8, fontSize: 11 }}>CMV</div>{mLine(metaT.cmv, t.cmv, v => v + '%', false)}</div>
          <div><b style={{ fontSize: 18 }}>{t.cmv != null ? (Math.round((100 - t.cmv) * 10) / 10) + '%' : '—'}</b><div style={{ opacity: .8, fontSize: 11 }}>margem · {brl0(t.venda - t.custo)}</div></div>
          <div><b style={{ fontSize: 18 }}>{brl(t.ticket)}</b><div style={{ opacity: .8, fontSize: 11 }}>ticket médio</div>{mLine(metaT.ticket, t.ticket, brl, true)}</div>
          <div><b style={{ fontSize: 18 }}>{num(t.unidades)}</b><div style={{ opacity: .8, fontSize: 11 }}>unidades</div>{mLine(metaT.unidades, t.unidades, num, true)}</div>
          <div><b style={{ fontSize: 18 }}>{num(t.cupons)}</b><div style={{ opacity: .8, fontSize: 11 }}>cupons</div></div>
          <div><b style={{ fontSize: 18 }}>{num(t.clientes)}</b><div style={{ opacity: .8, fontSize: 11 }}>clientes</div></div>
          <div><b style={{ fontSize: 18 }}>{t.identificacao != null ? t.identificacao + '%' : '—'}</b><div style={{ opacity: .8, fontSize: 11 }}>identificação</div>{mLine(metaT.clientes, t.identificacao, v => v + '%', true)}</div>
          <div><b style={{ fontSize: 18 }}>{brl0(t.vendaEntrega)}</b><div style={{ opacity: .8, fontSize: 11 }}>🛵 entrega · {num(t.cuponsEntrega)} cupons</div></div>
        </div>
      </div>

      {p.tendencia && <div style={c.card}>
        <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8 }}>🔮 Tendência do mês <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 400 }}>— no ritmo atual ({p.dia}/{p.diasMes} dias), o mês fecha assim</span></div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[['Venda', brl0(p.tendencia.venda)], ['CMV', p.tendencia.cmv != null ? p.tendencia.cmv + '%' : '—'], ['Ticket', brl(p.tendencia.ticket)], ['Unidades', num(p.tendencia.unidades)], ['Clientes', num(p.tendencia.clientes)], ['Identificação', p.tendencia.identificacao != null ? p.tendencia.identificacao + '%' : '—']].map(([l, v]) => (
            <div key={l} style={{ background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 10, padding: '7px 12px', minWidth: 110 }}>
              <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>{l}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0d6b5e' }}>{v}</div>
            </div>))}
        </div>
      </div>}

      {online && atend && atend.atendimentos > 0 && <div style={c.card}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>💬 Atendimento online (BotVendas) <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 400 }}>— no período</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 12 }}>
          {tempoCard('⚡ Tempo de 1ª resposta', atend.respMin, metaT.resp)}
          {tempoCard('🕐 Tempo de atendimento', atend.taMin, metaT.at)}
          {(() => { const sc = atend.score != null ? atend.score : atend.scoreGeral; const qt = atend.score != null ? atend.comScore : atend.scoreGeralQtd; return (
          <div style={{ background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 10, padding: '8px 14px' }}>
            <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>⭐ Média de avaliação</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: sc == null ? '#94a3b8' : sc >= 4 ? '#15803d' : sc >= 3 ? '#B7791F' : '#C0392B' }}>{sc != null ? sc : '—'}<span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}> / 5</span></div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{qt ? num(qt) + ' nota(s)' + (atend.score == null ? ' · 180d' : '') : 'sem nota no período'}</div>
          </div>); })()}
          {vendas?.resumo && vendas.resumo.atendimentos > 0 && <>
            <div style={{ background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 10, padding: '8px 14px' }}>
              <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>🎯 Taxa de conversão</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0d6b5e' }}>{vendas.resumo.conversao != null ? vendas.resumo.conversao + '%' : '—'}</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{num(vendas.resumo.vendas)} de {num(vendas.resumo.atendimentos)} viraram venda</div>
            </div>
            <div style={{ background: '#fff7f5', border: '1px solid #f6e2dd', borderRadius: 10, padding: '8px 14px' }}>
              <div style={{ fontSize: 10.5, color: '#b45309', fontWeight: 600 }}>📉 Vendas perdidas</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#C0392B' }}>{num(vendas.resumo.perdidas)}</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>atendimentos sem venda</div>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 10, padding: '8px 14px' }}>
              <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>🧾 Ticket médio</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1f2937' }}>{vendas.resumo.ticket != null ? brl(vendas.resumo.ticket) : '—'}</div>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 10, padding: '8px 14px' }}>
              <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>💰 Venda via bot</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0d6b5e' }}>{brl0(vendas.resumo.vendaTotal)}</div>
            </div>
          </>}
          <div style={{ background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 10, padding: '8px 14px' }}>
            <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>💬 Atendimentos</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1f2937' }}>{num(vendas?.resumo?.atendimentos || atend.atendimentos)}</div>
            <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{vendas?.resumo?.atendimentos ? 'do relatório BotVendas' : (atend.comResp != null ? num(atend.comResp) + ' com 1ª resposta' : '')}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>💡 As metas de tempo (menor melhor) são cadastradas na aba <b>🎯 Metas</b>. Tempos e avaliação sincronizam sozinhos; venda/conversão vêm ao vivo do relatório do BotVendas.</div>
        {vendas?.vendedores?.length > 0 && <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>👤 Por vendedor <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>— venda via bot no período</span></div>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ background: '#f8fafc', borderBottom: '2px solid #eef1f4' }}>
              {['Vendedor', 'Atend.', 'Vendas', 'Perdidas', 'Conversão', 'Venda', 'Ticket'].map((h, i) => <th key={h} style={{ padding: '7px 9px', textAlign: i ? 'right' : 'left', color: '#64748b', fontSize: 11.5, fontWeight: 700 }}>{h}</th>)}
            </tr></thead>
            <tbody>{vendas.vendedores.map((v, i) => <tr key={i} style={{ borderTop: '1px solid #f1f3f5' }}>
              <td style={{ padding: '7px 9px', fontWeight: 600 }}>{v.nome}</td>
              <td style={{ padding: '7px 9px', textAlign: 'right' }}>{num(v.atendimentos)}</td>
              <td style={{ padding: '7px 9px', textAlign: 'right', color: '#0d6b5e', fontWeight: 700 }}>{num(v.vendas)}</td>
              <td style={{ padding: '7px 9px', textAlign: 'right', color: v.perdidas ? '#C0392B' : '#94a3b8' }}>{num(v.perdidas)}</td>
              <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700 }}>{v.conversao != null ? v.conversao + '%' : '—'}</td>
              <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700 }}>{brl0(v.venda)}</td>
              <td style={{ padding: '7px 9px', textAlign: 'right' }}>{v.ticket ? brl(v.ticket) : '—'}</td>
            </tr>)}</tbody>
          </table></div>
        </div>}
      </div>}

      {online && <AvaliacoesBaixas API={API} loja={loja} ini={ini} fim={fim} />}

      <div style={c.card}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>🧩 Vendas por grupo principal <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 400 }}>— clique pra ver as classificações</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
          {d.porGrupo.map(g => (
            <div key={g.grupo} onClick={() => setExp(exp === g.grupo ? null : g.grupo)} style={{ border: '1px solid #eef1f4', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', background: exp === g.grupo ? '#f0f7f4' : '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <b style={{ fontSize: 13 }}>{g.grupo}</b><span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>{g.pct}%</span>
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0d6b5e' }}>{brl0(g.venda)}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>CMV <b style={{ color: cmvCor(g.cmv) }}>{g.cmv != null ? g.cmv + '%' : '—'}</b> · {num(g.unidades)} un</div>
            </div>
          ))}
        </div>
        {exp && <div style={{ marginTop: 10, borderTop: '1px solid #eef1f4', paddingTop: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>{exp} — por classificação</div>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#f8fafc' }}>{['Classificação', 'Venda', 'CMV', 'Unidades'].map((h, i) => <th key={h} style={{ ...c.th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>{(d.porGrupo.find(g => g.grupo === exp)?.classificacoes || []).map(cl => (
              <tr key={cl.classificacao} style={{ borderTop: '1px solid #f1f3f5' }}>
                <td style={c.td}>{cl.classificacao}</td>
                <td style={{ ...c.td, textAlign: 'right' }}>{brl0(cl.venda)}</td>
                <td style={{ ...c.td, textAlign: 'right', color: cmvCor(cl.cmv), fontWeight: 700 }}>{cl.cmv != null ? cl.cmv + '%' : '—'}</td>
                <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{num(cl.unidades)}</td>
              </tr>))}</tbody>
          </table></div>
        </div>}
      </div>

      <div style={c.card}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>🏪 Por loja</div>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#f8fafc', borderBottom: '2px solid #eef1f4' }}>{['Loja', 'Venda', 'CMV', 'Ticket', 'Unidades', 'Cupons', 'Clientes', 'Identif.', '🛵 Entrega'].map((h, i) => <th key={h} style={{ ...c.th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
          <tbody>{d.porLoja.map(l => (
            <tr key={l.uni} style={{ borderTop: '1px solid #f1f3f5' }}>
              <td style={{ ...c.td, fontWeight: 600 }}>{l.loja}</td>
              <td style={{ ...c.td, textAlign: 'right', fontWeight: 700 }}>{brl0(l.venda)}</td>
              <td style={{ ...c.td, textAlign: 'right', color: cmvCor(l.cmv), fontWeight: 700 }}>{l.cmv != null ? l.cmv + '%' : '—'}</td>
              <td style={{ ...c.td, textAlign: 'right' }}>{brl(l.ticket)}</td>
              <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{num(l.unidades)}</td>
              <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{num(l.cupons)}</td>
              <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{num(l.clientes)}</td>
              <td style={{ ...c.td, textAlign: 'right', fontWeight: 700, color: '#0d6b5e' }}>{l.identificacao != null ? l.identificacao + '%' : '—'}</td>
              <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{brl0(l.vendaEntrega)}<div style={{ fontSize: 10, color: '#b0b8c0' }}>{num(l.cuponsEntrega)} cup</div></td>
            </tr>))}</tbody>
        </table></div>
      </div>

      {d.cestasExcluidas && d.cestasExcluidas.total > 0 && <div style={c.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>🗑️ Cestas excluídas <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 400 }}>— venda perdida (cesta descartada no PDV)</span></div>
          <div style={{ display: 'flex', gap: 5 }}>
            <button onClick={() => setCestasView('motivo')} style={{ ...c.tab, padding: '5px 11px', fontSize: 12, ...(cestasView === 'motivo' ? c.tabOn : {}) }}>por motivo</button>
            <button onClick={() => setCestasView('vendedor')} style={{ ...c.tab, padding: '5px 11px', fontSize: 12, ...(cestasView === 'vendedor' ? c.tabOn : {}) }}>por vendedor</button>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#C0392B' }}>{brl0(d.cestasExcluidas.valor)}</div>
            <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{num(d.cestasExcluidas.total)} cestas perdidas</div>
          </div>
        </div>
        {cestasView === 'motivo' ? <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#f8fafc', borderBottom: '2px solid #eef1f4' }}>{['Motivo', 'Cestas', 'Valor perdido', '% do total'].map((h, i) => <th key={h} style={{ ...c.th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
          <tbody>{d.cestasExcluidas.motivos.map(m => (
            <tr key={m.motivo} style={{ borderTop: '1px solid #f1f3f5' }}>
              <td style={{ ...c.td, fontWeight: 600 }}>{m.motivo}</td>
              <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{num(m.cestas)}</td>
              <td style={{ ...c.td, textAlign: 'right', fontWeight: 700, color: '#C0392B' }}>{brl0(m.valor)}</td>
              <td style={{ ...c.td, textAlign: 'right', color: '#94a3b8' }}>{d.cestasExcluidas.valor ? Math.round(m.valor / d.cestasExcluidas.valor * 100) : 0}%</td>
            </tr>))}</tbody>
        </table></div> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#f8fafc', borderBottom: '2px solid #eef1f4' }}>{['#', 'Vendedor', 'Cestas excluídas', 'Valor perdido'].map((h, i) => <th key={h} style={{ ...c.th, textAlign: i > 1 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
          <tbody>{(d.cestasExcluidas.porVendedor || []).map((v, i) => (
            <tr key={(v.usuarioId || 'x') + '-' + i} style={{ borderTop: '1px solid #f1f3f5', background: i === 0 ? '#fef2f2' : '#fff' }}>
              <td style={{ ...c.td, color: '#94a3b8' }}>{i + 1}{i === 0 ? ' 🔺' : ''}</td>
              <td style={{ ...c.td, fontWeight: 600 }}>{v.vendedor}</td>
              <td style={{ ...c.td, textAlign: 'right', fontWeight: 700, color: '#C0392B' }}>{num(v.cestas)}</td>
              <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{brl0(v.valor)}</td>
            </tr>))}</tbody>
        </table></div>}
      </div>}
    </div>
  );
}

function Vendedores({ API, d, loja, dias, canal, gestao }) {
  const [ord, setOrd] = useState('venda');
  const [exp, setExp] = useState(null);
  const [det, setDet] = useState({});
  const [metaV, setMetaV] = useState({});
  const [premCfg, setPremCfg] = useState({ base: 3, meta: 4, superMeta: 5 });
  useEffect(() => { API.get('/faturamento/premiacao-config').then(r => setPremCfg(r.data)).catch(() => {}); }, [API]);
  const compAtual = new Date().toISOString().slice(0, 7);
  const lista = [...d.porVendedor].sort((a, b) => (b[ord] || 0) - (a[ord] || 0));
  const col = (k, l) => <th onClick={() => setOrd(k)} style={{ ...c.th, textAlign: k === 'nome' ? 'left' : 'right', cursor: 'pointer', color: ord === k ? '#0d6b5e' : '#64748b' }}>{l}{ord === k ? ' ▾' : ''}</th>;
  const toggle = v => {
    if (exp === v.usuarioId) return setExp(null);
    setExp(v.usuarioId);
    if (v.usuarioId && !det[v.usuarioId]) API.get('/faturamento/vendedor-grupos', { params: { vendedor: v.usuarioId, loja, dias, canal } }).then(r => setDet(m => ({ ...m, [v.usuarioId]: r.data.grupos || [] }))).catch(() => {});
    if (v.usuarioId && metaV[v.usuarioId] === undefined) API.get('/faturamento/metas', { params: { canal, escopo: 'vendedor', alvo: v.usuarioId } }).then(r => {
      const its = r.data.itens || []; const f = ind => { const e = its.find(x => x.competencia === compAtual && x.indicador === ind) || its.find(x => x.competencia === '' && x.indicador === ind); return e ? e.meta : null; };
      setMetaV(m => ({ ...m, [v.usuarioId]: { venda: f('venda'), sup: f('venda_super') } }));
    }).catch(() => setMetaV(m => ({ ...m, [v.usuarioId]: { venda: null, sup: null } })));
  };
  return (
    <div style={c.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>🧑‍💼 Por vendedor <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 400 }}>({d.porVendedor.length}) — clique na linha pra ver a premiação e as vendas por grupo</span></div>
        {gestao && <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#64748b', background: '#f8fafc', border: '1px solid #e8edf0', borderRadius: 10, padding: '5px 10px' }}>
          🏆 Faixas (% da venda):
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>abaixo<input type="number" step="0.5" defaultValue={premCfg.base} onBlur={e => { const v = e.target.value; setPremCfg(p => ({ ...p, base: Number(v) })); API.put('/faturamento/premiacao-config', { base: v }).catch(() => {}); }} style={{ width: 48, padding: '3px 5px', border: '1px solid #d9e2e0', borderRadius: 6, textAlign: 'right' }} />%</label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>meta<input type="number" step="0.5" defaultValue={premCfg.meta} onBlur={e => { const v = e.target.value; setPremCfg(p => ({ ...p, meta: Number(v) })); API.put('/faturamento/premiacao-config', { meta: v }).catch(() => {}); }} style={{ width: 48, padding: '3px 5px', border: '1px solid #d9e2e0', borderRadius: 6, textAlign: 'right' }} />%</label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>super<input type="number" step="0.5" defaultValue={premCfg.superMeta} onBlur={e => { const v = e.target.value; setPremCfg(p => ({ ...p, superMeta: Number(v) })); API.put('/faturamento/premiacao-config', { superMeta: v }).catch(() => {}); }} style={{ width: 48, padding: '3px 5px', border: '1px solid #d9e2e0', borderRadius: 6, textAlign: 'right' }} />%</label>
        </span>}
      </div>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: '#f8fafc', borderBottom: '2px solid #eef1f4' }}>
          {col('nome', 'Vendedor')}{col('venda', 'Venda')}{col('cmv', 'CMV')}{col('ticket', 'Ticket')}{col('unidades', 'Unidades')}{col('cupons', 'Cupons')}{col('clientes', 'Clientes')}{col('identificacao', 'Identif.')}
        </tr></thead>
        <tbody>{lista.map((v, i) => (
          <React.Fragment key={(v.usuarioId || 'x') + '-' + i}>
          <tr onClick={() => toggle(v)} style={{ borderTop: '1px solid #f1f3f5', cursor: 'pointer', background: exp === v.usuarioId ? '#f0f7f4' : '#fff' }}>
            <td style={{ ...c.td, fontWeight: 600 }}>{exp === v.usuarioId ? '▾ ' : '▸ '}{v.nome}</td>
            <td style={{ ...c.td, textAlign: 'right', fontWeight: 700 }}>{brl0(v.venda)}</td>
            <td style={{ ...c.td, textAlign: 'right', color: cmvCor(v.cmv), fontWeight: 700 }}>{v.cmv != null ? v.cmv + '%' : '—'}</td>
            <td style={{ ...c.td, textAlign: 'right' }}>{brl(v.ticket)}</td>
            <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{num(v.unidades)}</td>
            <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{num(v.cupons)}</td>
            <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{num(v.clientes)}</td>
            <td style={{ ...c.td, textAlign: 'right', fontWeight: 700, color: '#0d6b5e' }}>{v.identificacao != null ? v.identificacao + '%' : '—'}</td>
          </tr>
          {exp === v.usuarioId && <tr><td colSpan={8} style={{ background: '#f8fafc', padding: '8px 12px' }}>
            {metaV[v.usuarioId] && (metaV[v.usuarioId].venda != null || metaV[v.usuarioId].sup != null) && (() => {
              const mv = metaV[v.usuarioId]; const pct = mv.venda ? Math.round(v.venda / mv.venda * 100) : null;
              const bMeta = mv.venda != null && v.venda >= mv.venda; const bSuper = mv.sup != null && v.venda >= mv.sup;
              const faixaPct = bSuper ? premCfg.superMeta : bMeta ? premCfg.meta : premCfg.base;  // % de premiação da faixa atual
              const premio = Math.round(v.venda * (Number(faixaPct) || 0) / 100);
              const faixa = (lbl, p, ativa, cor) => <div style={{ background: ativa ? cor : '#f8fafc', color: ativa ? '#fff' : '#64748b', border: '1px solid ' + (ativa ? cor : '#e8edf0'), borderRadius: 9, padding: '5px 10px', fontSize: 11.5, fontWeight: 700 }}>{lbl}: {p}%{ativa ? ' ◀' : ''}</div>;
              return <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #e8edf0' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ background: '#eef7f2', border: '1px solid #cdeadd', borderRadius: 10, padding: '6px 12px' }}>
                    <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>🏆 Premiação estimada (venda × faixa)</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#0d6b5e' }}>{brl0(premio)} <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 400 }}>= {faixaPct}% de {brl0(v.venda)}</span></div>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#64748b' }}>Vendido {brl0(v.venda)} / meta {mv.venda != null ? brl0(mv.venda) : '—'}{mv.sup != null ? ' · super ' + brl0(mv.sup) : ''} {pct != null && <b style={{ color: bSuper ? '#7c3aed' : bMeta ? '#15803d' : '#B7791F' }}>({pct}% {bSuper ? '🏆 bateu a SUPER' : bMeta ? '✓ bateu a meta' : 'da meta'})</b>}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Faixas:</span>
                  {faixa('Abaixo da meta', premCfg.base, !bMeta && !bSuper, '#B7791F')}
                  {faixa('Bateu a meta', premCfg.meta, bMeta && !bSuper, '#15803d')}
                  {faixa('Bateu a super', premCfg.superMeta, bSuper, '#7c3aed')}
                </div>
              </div>;
            })()}
            {!det[v.usuarioId] ? <span style={{ fontSize: 12, color: '#94a3b8' }}>⏳ carregando vendas por grupo…</span> :
              det[v.usuarioId].length === 0 ? <span style={{ fontSize: 12, color: '#94a3b8' }}>Sem vendas no período.</span> :
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
                {det[v.usuarioId].map(g => (
                  <div key={g.grupo} style={{ border: '1px solid #eef1f4', borderRadius: 10, padding: '7px 10px', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><b style={{ fontSize: 12 }}>{g.grupo}</b><span style={{ fontSize: 11, color: '#64748b' }}>{g.pct}%</span></div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0d6b5e' }}>{brl0(g.venda)}</div>
                    <div style={{ fontSize: 10.5, color: '#64748b' }}>CMV <b style={{ color: cmvCor(g.cmv) }}>{g.cmv != null ? g.cmv + '%' : '—'}</b> · {num(g.unidades)} un</div>
                  </div>))}
              </div>}
          </td></tr>}
          </React.Fragment>))}</tbody>
      </table></div>
    </div>
  );
}

// ── Comparativo de 2 períodos + evolução ──
const monthRange = offset => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset); const p2 = x => String(x).padStart(2, '0'); const ini = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-01'; const last = new Date(d.getFullYear(), d.getMonth() + 1, 0); const fim = last.getFullYear() + '-' + p2(last.getMonth() + 1) + '-' + p2(last.getDate()); return { ini, fim }; };
const MU = { venda: 'R$', ticket: 'R$', cmv: '%', unidades: 'n', clientes: 'n', identificacao: '%' };
const fmtM = (k, v) => v == null ? '—' : MU[k] === 'R$' ? brl0(v) : MU[k] === '%' ? v + '%' : num(v);
function Comparativo({ API, loja, canal }) {
  const a0 = monthRange(-1), b0 = monthRange(0);
  const [ini1, setIni1] = useState(a0.ini); const [fim1, setFim1] = useState(a0.fim);
  const [ini2, setIni2] = useState(b0.ini); const [fim2, setFim2] = useState(b0.fim);
  const [d, setD] = useState(null); const [hist, setHist] = useState([]); const [carreg, setCarreg] = useState(false);
  const [drill, setDrill] = useState(null); const [drillData, setDrillData] = useState(null);
  const [hp, setHp] = useState(null);
  const carregar = () => { setCarreg(true); setDrill(null); API.get('/faturamento/comparativo', { params: { loja, canal, ini1, fim1, ini2, fim2 } }).then(r => setD(r.data)).catch(() => setD(null)).finally(() => setCarreg(false)); };
  const abrirDrill = grupo => { setDrill(grupo); setDrillData(null); API.get('/faturamento/comparativo-itens', { params: { loja, canal, grupo, ini1, fim1, ini2, fim2 } }).then(r => setDrillData(r.data.itens || [])).catch(() => setDrillData([])); };
  useEffect(() => { API.get('/faturamento/historico', { params: { meses: 12, canal, ...(loja ? { loja } : {}) } }).then(r => setHist(r.data.meses || [])).catch(() => {}); }, [API, loja, canal]);
  useEffect(() => { carregar(); }, []); // eslint-disable-line
  const melhor = (dir, delta) => delta == null ? '#64748b' : ((dir === 'menor' ? delta < 0 : delta > 0) ? '#15803d' : (delta === 0 ? '#64748b' : '#C0392B'));
  const dstr = s => { const [, m, dd] = s.split('-'); return dd + '/' + m; };
  const dr = (ini, setI, fim, setF) => <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
    <input type="date" value={ini} onChange={e => setI(e.target.value)} style={{ ...c.inp, padding: '5px 7px' }} />–
    <input type="date" value={fim} onChange={e => setF(e.target.value)} style={{ ...c.inp, padding: '5px 7px' }} /></span>;
  // evolução chart
  const serie = hist.map(h => ({ mes: h.mes, v: h.venda || 0, cmv: h.cmv != null ? h.cmv : null, sobrou: Math.round((h.venda || 0) * (1 - (h.cmv || 0) / 100)) }));
  const maxV = Math.max(1, ...serie.map(s => s.v)), W = 640, H = 120, pad = 6;
  const xC = i => pad + (serie.length > 1 ? i * (W - 2 * pad) / (serie.length - 1) : 0);
  const yC = v => H - pad - (v / maxV) * (H - 2 * pad);
  const yCmv = cmv => H - pad - ((cmv || 0) / 100) * (H - 2 * pad);
  const tend = serie.length >= 2 ? (serie[serie.length - 1].v - serie[0].v) : 0;
  const sobe = d ? [...d.grupos].filter(g => g.deltaPct != null).sort((a, b) => b.deltaPct - a.deltaPct).slice(0, 4) : [];
  const cai = d ? [...d.grupos].filter(g => g.deltaPct != null).sort((a, b) => a.deltaPct - b.deltaPct).slice(0, 4) : [];
  return (
    <div>
      <div style={{ ...c.card, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={c.fld}>Período A (base){dr(ini1, setIni1, fim1, setFim1)}</label>
        <label style={c.fld}>Período B (comparar){dr(ini2, setIni2, fim2, setFim2)}</label>
        <button onClick={carregar} style={{ ...c.inp, cursor: 'pointer', background: '#0d6b5e', color: '#fff', border: 'none', fontWeight: 700 }}>{carreg ? '⏳' : '📊 Comparar'}</button>
      </div>

      {serie.length > 1 && <div style={c.card}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>📈 Evolução — venda &amp; CMV <span style={{ fontSize: 12, fontWeight: 600, color: tend >= 0 ? '#15803d' : '#C0392B' }}>· {tend >= 0 ? '↗' : '↘'} {tend >= 0 ? 'crescendo' : 'caindo'} ({brl0(serie[0].v)} → {brl0(serie[serie.length - 1].v)})</span>
          {hp != null && serie[hp] && <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0d6b5e', marginLeft: 8 }}>▸ {ymLabel(serie[hp].mes)}: {brl0(serie[hp].v)} · CMV {serie[hp].cmv ?? '—'}% · sobra {brl0(serie[hp].sobrou)}</span>}</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 340px', minWidth: 300 }}>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, marginBottom: 4, fontWeight: 600 }}><span style={{ color: '#0d6b5e' }}>● Venda</span><span style={{ color: '#B7791F' }}>● CMV</span></div>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 130 }} preserveAspectRatio="none" onMouseLeave={() => setHp(null)}>
              <polyline fill="none" stroke="#0d6b5e" strokeWidth="2" points={serie.map((s, i) => `${xC(i)},${yC(s.v)}`).join(' ')} />
              <polyline fill="none" stroke="#B7791F" strokeWidth="1.6" strokeDasharray="4 3" points={serie.filter(s => s.cmv != null).map((s, i) => `${xC(serie.indexOf(s))},${yCmv(s.cmv)}`).join(' ')} />
              {serie.map((s, i) => <g key={s.mes}>
                <circle cx={xC(i)} cy={yC(s.v)} r={hp === i ? 5 : 2.5} fill="#0d6b5e" />
                {s.cmv != null && <circle cx={xC(i)} cy={yCmv(s.cmv)} r={hp === i ? 4 : 2} fill="#B7791F" />}
                <rect x={xC(i) - (W / serie.length) / 2} y="0" width={W / serie.length} height={H} fill="transparent" style={{ cursor: 'pointer' }} onMouseEnter={() => setHp(i)} onClick={() => setHp(i)} />
              </g>)}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>{serie.map((s, i) => <span key={s.mes} onClick={() => setHp(i)} style={{ cursor: 'pointer', fontWeight: hp === i ? 700 : 400, color: hp === i ? '#0d6b5e' : '#94a3b8' }}>{ymLabel(s.mes)}</span>)}</div>
          </div>
          <div style={{ flex: '0 1 320px', minWidth: 250, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: '#f8fafc' }}>{['Mês', 'Venda', 'CMV', 'Sobrou'].map((h, i) => <th key={h} style={{ ...c.th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>{serie.map((s, i) => <tr key={s.mes} onMouseEnter={() => setHp(i)} style={{ borderTop: '1px solid #f1f3f5', background: hp === i ? '#f0f7f4' : '#fff', cursor: 'pointer' }}>
                <td style={{ ...c.td, fontWeight: 600 }}>{ymLabel(s.mes)}</td>
                <td style={{ ...c.td, textAlign: 'right' }}>{brl0(s.v)}</td>
                <td style={{ ...c.td, textAlign: 'right', color: cmvCor(s.cmv), fontWeight: 700 }}>{s.cmv != null ? s.cmv + '%' : '—'}</td>
                <td style={{ ...c.td, textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{brl0(s.sobrou)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>}

      {!d ? <div style={c.card}>{carreg ? '⏳ Comparando…' : 'Escolha os dois períodos e clique em Comparar.'}</div> : d.erro ? <div style={c.card}>⚠️ {d.erro}</div> : <>
        <div style={c.card}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>⚖️ A ({dstr(ini1)}–{dstr(fim1)}) × B ({dstr(ini2)}–{dstr(fim2)})</div>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#f8fafc', borderBottom: '2px solid #eef1f4' }}>{['Métrica', 'A', 'B', 'Variação'].map((h, i) => <th key={h} style={{ ...c.th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>{d.metricas.map(m => <tr key={m.chave} style={{ borderTop: '1px solid #f1f3f5' }}>
              <td style={{ ...c.td, fontWeight: 600 }}>{m.nome} <span style={{ fontSize: 10, color: '#cbd5e1' }}>{m.dir === 'menor' ? '↓melhor' : '↑melhor'}</span></td>
              <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{fmtM(m.chave, m.a)}</td>
              <td style={{ ...c.td, textAlign: 'right', fontWeight: 700 }}>{fmtM(m.chave, m.b)}</td>
              <td style={{ ...c.td, textAlign: 'right', fontWeight: 800, color: melhor(m.dir, m.delta) }}>{m.delta == null ? '—' : (m.delta > 0 ? '+' : '') + m.delta + '%'}</td>
            </tr>)}</tbody>
          </table></div>
        </div>

        {d.bProjecao && <div style={{ ...c.card, background: '#eef5fb', border: '1px solid #cfe2f3', fontSize: 12.5, color: '#2c5577' }}>
          ⏳ O <b>período B</b> ainda está em andamento ({d.bProjecao.decorridos}/{d.bProjecao.totalDias} dias). No ritmo atual ele fecha em <b>{brl0(d.bProjecao.venda)}</b> de venda{d.bProjecao.deltaVendaPct != null && <> — isso seria <b style={{ color: d.bProjecao.deltaVendaPct >= 0 ? '#15803d' : '#C0392B' }}>{d.bProjecao.deltaVendaPct > 0 ? '+' : ''}{d.bProjecao.deltaVendaPct}%</b> vs A</>}. (A tabela acima mostra o B <b>parcial</b>, por isso a variação parece negativa.)
        </div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          <div style={c.card}><div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, color: '#15803d' }}>📈 Categorias crescendo</div>
            {sobe.map(g => <div key={g.grupo} onClick={() => abrirDrill(g.grupo)} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: '1px solid #f1f3f5', fontSize: 12.5, cursor: 'pointer' }}><span>▸ {g.grupo}</span><b style={{ color: g.deltaPct >= 0 ? '#15803d' : '#C0392B' }}>{g.deltaPct > 0 ? '+' : ''}{g.deltaPct}% <span style={{ color: '#94a3b8', fontWeight: 400 }}>({brl0(g.vendaB)})</span></b></div>)}
          </div>
          <div style={c.card}><div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, color: '#C0392B' }}>📉 Categorias caindo</div>
            {cai.map(g => <div key={g.grupo} onClick={() => abrirDrill(g.grupo)} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: '1px solid #f1f3f5', fontSize: 12.5, cursor: 'pointer' }}><span>▸ {g.grupo}</span><b style={{ color: '#C0392B' }}>{g.deltaPct}% <span style={{ color: '#94a3b8', fontWeight: 400 }}>({brl0(g.vendaB)})</span></b></div>)}
          </div>
        </div>

        {(d.porLoja || []).length > 1 && <div style={c.card}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>🏪 Quem impacta — por loja <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 400 }}>(ordenado por quanto cada loja puxou a venda)</span></div>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#f8fafc', borderBottom: '2px solid #eef1f4' }}>{['Loja', 'Venda A', 'Venda B', 'Δ R$', 'Δ %'].map((h, i) => <th key={h} style={{ ...c.th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>{d.porLoja.map(l => <tr key={l.uni} style={{ borderTop: '1px solid #f1f3f5' }}>
              <td style={{ ...c.td, fontWeight: 600 }}>{l.loja}</td>
              <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{brl0(l.vendaA)}</td>
              <td style={{ ...c.td, textAlign: 'right', fontWeight: 700 }}>{brl0(l.vendaB)}</td>
              <td style={{ ...c.td, textAlign: 'right', fontWeight: 700, color: l.deltaVenda >= 0 ? '#15803d' : '#C0392B' }}>{(l.deltaVenda >= 0 ? '+' : '') + brl0(l.deltaVenda)}</td>
              <td style={{ ...c.td, textAlign: 'right', color: l.deltaPct == null ? '#64748b' : l.deltaPct >= 0 ? '#15803d' : '#C0392B' }}>{l.deltaPct == null ? '—' : (l.deltaPct > 0 ? '+' : '') + l.deltaPct + '%'}</td>
            </tr>)}</tbody>
          </table></div>
        </div>}

        <div style={c.card}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>🧩 Todos os grupos (A × B) <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 400 }}>— clique num grupo pra ver os itens</span></div>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#f8fafc', borderBottom: '2px solid #eef1f4' }}>{['Grupo', 'Venda A', 'Venda B', 'Δ', 'CMV A→B', 'Un A→B'].map((h, i) => <th key={h} style={{ ...c.th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>{d.grupos.map(g => <tr key={g.grupo} onClick={() => abrirDrill(g.grupo)} style={{ borderTop: '1px solid #f1f3f5', cursor: 'pointer' }}>
              <td style={{ ...c.td, fontWeight: 600 }}>▸ {g.grupo}</td>
              <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{brl0(g.vendaA)}</td>
              <td style={{ ...c.td, textAlign: 'right', fontWeight: 700 }}>{brl0(g.vendaB)}</td>
              <td style={{ ...c.td, textAlign: 'right', fontWeight: 700, color: g.deltaPct == null ? '#64748b' : g.deltaPct >= 0 ? '#15803d' : '#C0392B' }}>{g.deltaPct == null ? '—' : (g.deltaPct > 0 ? '+' : '') + g.deltaPct + '%'}</td>
              <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{g.cmvA ?? '—'}→{g.cmvB ?? '—'}</td>
              <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{num(g.unA)}→{num(g.unB)}</td>
            </tr>)}</tbody>
          </table></div>
        </div>
      </>}

      {drill && <div onClick={() => setDrill(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(16,40,45,.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 16, maxWidth: 760, width: '100%', maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <b style={{ fontSize: 15 }}>🧩 {drill} — itens (A × B)</b>
            <button onClick={() => setDrill(null)} style={{ marginLeft: 'auto', border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
          </div>
          {!drillData ? <div style={{ color: '#94a3b8', fontSize: 13 }}>⏳ carregando itens…</div> :
            drillData.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13 }}>Sem itens no período.</div> :
            <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f8fafc', borderBottom: '2px solid #eef1f4' }}>{['Produto', 'Venda A', 'Venda B', 'Δ'].map((h, i) => <th key={h} style={{ ...c.th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>{drillData.map(it => <tr key={it.produtoId} style={{ borderTop: '1px solid #f1f3f5' }}>
                <td style={{ ...c.td, fontWeight: 600 }}>{it.produto}</td>
                <td style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{brl0(it.vendaA)}</td>
                <td style={{ ...c.td, textAlign: 'right', fontWeight: 700 }}>{brl0(it.vendaB)}</td>
                <td style={{ ...c.td, textAlign: 'right', fontWeight: 700, color: it.deltaPct == null ? '#64748b' : it.deltaPct >= 0 ? '#15803d' : '#C0392B' }}>{it.deltaPct == null ? (it.vendaB > 0 ? 'novo' : '—') : (it.deltaPct > 0 ? '+' : '') + it.deltaPct + '%'}</td>
              </tr>)}</tbody>
            </table></div>}
        </div>
      </div>}
    </div>
  );
}

const MES_LBL = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ymLabel = ym => { const [a, m] = ym.split('-'); return MES_LBL[Number(m) - 1] + '/' + a.slice(2); };
function mesesFrente(n) { const out = []; const d = new Date(); d.setDate(1); for (let i = 0; i < n; i++) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() + 1); } return out; }

// Visão quando o escopo é Por loja / Por vendedor e ainda não escolheu um alvo.
//  • Por LOJA: tabela informativa (venda/CMV/…) — clicar na linha abre o cadastro daquela loja.
//  • Por VENDEDOR: GRADE EDITÁVEL — cada vendedor já vem com a meta (+super) SUGERIDA pela média
//    mensal dele; edite só quem quiser e "Salvar metas de todos" grava pra todos de uma vez (N meses).
function OverviewMetas(props) {
  if (props.escopo === 'vendedor') return <GradeVendedores {...props} />;
  const { d, lojas, onPick } = props;
  const base = d.porLoja || [];
  const total = base.reduce((a, r) => a + (r.venda || 0), 0);
  return (
    <div style={c.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>🏪 Visão por loja <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>— clique numa linha para cadastrar a meta</span></div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>no período selecionado</div>
      </div>
      {base.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13 }}>Sem movimento no período. Troque a loja/período acima.</div> :
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc', borderBottom: '2px solid #eef1f4' }}>
            {['Loja', 'Venda', 'CMV', 'Unid.', 'Clientes', 'Ticket', ''].map((h, i) => <th key={i} style={{ padding: '8px 10px', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>)}
          </tr></thead>
          <tbody>{base.map((r, i) => {
            const id = lojas.find(l => Number(l.erp_unidadenegocio_id) === Number(r.uni))?.id || '';
            return <tr key={i} onClick={() => id && onPick(id)} style={{ borderTop: '1px solid #f1f3f5', cursor: id ? 'pointer' : 'default' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f0f7f4'; }} onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
              <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.loja}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{brl0(r.venda)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', color: r.cmv > 65 ? '#C0392B' : '#15803d' }}>{r.cmv != null ? r.cmv + '%' : '—'}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{num(r.unidades)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{num(r.clientes)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{brl(r.ticket)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', color: '#0d6b5e', fontWeight: 700 }}>{id ? 'definir →' : ''}</td>
            </tr>;
          })}</tbody>
          <tfoot><tr style={{ borderTop: '2px solid #eef1f4', fontWeight: 700 }}>
            <td style={{ padding: '8px 10px' }}>Total ({base.length})</td>
            <td style={{ padding: '8px 10px', textAlign: 'right' }}>{brl0(total)}</td><td colSpan={4}></td><td></td>
          </tr></tfoot>
        </table></div>}
    </div>
  );
}

// Grade editável de metas por vendedor. Dois jeitos de preencher:
//  (A) SUGESTÃO individual: cada vendedor já vem pela média mensal dele × ajuste.
//  (B) RATEIO da meta da loja: informe a meta da loja, marque quem compõe a loja e distribua entre os
//      selecionados pela REPRESENTATIVIDADE de venda de cada um (soma = meta da loja).
// Edite as células que quiser e "Salvar" grava TODOS os selecionados de uma vez, pros próximos N meses.
function GradeVendedores({ d, onPick, API, canal, gestao, histN, futMeses, futN, ajusteMeta, setAjusteMeta, ajusteSuper, setAjusteSuper, onFlash, onSaved }) {
  const vends = (d.porVendedor || []).filter(v => v.usuarioId);
  const [medias, setMedias] = useState({}); // uid -> {media, ultimo}
  const [edit, setEdit] = useState({});     // uid -> {meta?, super?} (só o que o usuário alterou)
  const [sel, setSel] = useState(null);     // Set de uid selecionados; null = todos
  const [metaLoja, setMetaLoja] = useState(''); const [superLoja, setSuperLoja] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    setEdit({}); setSel(null); setMetaLoja(''); setSuperLoja('');
    API.get('/faturamento/metas-sugestao-vendedores', { params: { loja: d.lojaId || '', meses: histN, canal } })
      .then(r => setMedias(r.data.base || {})).catch(() => setMedias({}));
  }, [API, d.lojaId, histN, canal]);
  const isSel = uid => sel === null ? true : sel.has(uid);
  const toggle = uid => setSel(s => { const b = s === null ? new Set(vends.map(x => String(x.usuarioId))) : new Set(s); b.has(uid) ? b.delete(uid) : b.add(uid); return b; });
  const todosSel = sel === null || sel.size === vends.length;
  const toggleTodos = () => setSel(todosSel ? new Set() : null);
  const aj = (v, pct) => v == null ? null : Math.round(v * (1 + (Number(pct) || 0) / 100));
  const valMeta = uid => edit[uid]?.meta != null ? edit[uid].meta : (aj(medias[uid]?.media, ajusteMeta) ?? '');
  const valSuper = uid => edit[uid]?.super != null ? edit[uid].super : (aj(medias[uid]?.media, ajusteSuper) ?? '');
  const setCell = (uid, campo, v) => setEdit(e => ({ ...e, [uid]: { ...e[uid], [campo]: v === '' ? null : Number(v) } }));
  const selVends = vends.filter(v => isSel(String(v.usuarioId)));
  // (B) rateio da meta da loja entre os selecionados pela representatividade (média mensal; senão venda do período)
  const ratear = () => {
    const ml = Number(metaLoja) || 0, sl = Number(superLoja) || 0;
    if (!ml && !sl) return onFlash('Informe a meta da loja a distribuir.');
    if (!selVends.length) return onFlash('Marque ao menos um vendedor para compor a loja.');
    const basis = v => { const uid = String(v.usuarioId); return medias[uid]?.media != null ? medias[uid].media : (v.venda || 0); };
    const soma = selVends.reduce((a, v) => a + basis(v), 0);
    if (!soma) return onFlash('Sem base de venda para ratear (histórico/venda zerados).');
    const ne = { ...edit };
    selVends.forEach(v => { const uid = String(v.usuarioId); const sh = basis(v) / soma; ne[uid] = { meta: ml ? Math.round(ml * sh) : null, super: sl ? Math.round(sl * sh) : null }; });
    setEdit(ne);
    onFlash(`✅ Meta da loja distribuída entre ${selVends.length} vendedores por representatividade. Revise e salve.`, 5000);
  };
  const salvarTodos = () => {
    const vendedores = selVends.map(v => { const uid = String(v.usuarioId); return { uid, meta: valMeta(uid), super: valSuper(uid) }; })
      .filter(x => (x.meta !== '' && x.meta != null) || (x.super !== '' && x.super != null));
    if (!vendedores.length) return onFlash('Sem metas para salvar — verifique a sugestão/seleção.');
    if (!window.confirm(`Salvar as metas de ${vendedores.length} vendedores para os próximos ${futN} meses?\n\nVenda e Super vêm da grade (editáveis). Ticket, CMV, Unidades, Clientes%, Vitaminas e Entrega vêm da MÉDIA de cada vendedor; os Tempos, da média do atendimento online. (sobrescreve as metas deles)`)) return;
    setSalvando(true); onFlash('⏳ gerando e salvando a grade completa…', 15000);
    API.put('/faturamento/metas-gerar-completo-vendedores', { futMeses, vendedores, loja: d.lojaId || '', meses: histN, canal })
      .then(r => { setSalvando(false); onFlash(`✅ ${r.data.metas} metas salvas para ${r.data.vendedores} vendedores (${futN} meses) — venda, ticket, CMV, unidades, clientes, vitaminas, entrega e tempos. Clique em "detalhes" para conferir.`, 7000); onSaved && onSaved(); })
      .catch(() => { setSalvando(false); onFlash('⚠️ erro ao salvar.'); });
  };
  const inp = { width: 104, textAlign: 'right', padding: '5px 7px', border: '1px solid #d9e2e0', borderRadius: 7, fontSize: 12.5 };
  const somaMeta = selVends.reduce((a, v) => a + (Number(valMeta(String(v.usuarioId))) || 0), 0);
  return (
    <div style={c.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>🧑‍💼 Metas por vendedor <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>— já sugeridas; edite quem quiser e salve todos</span></div>
        {gestao && <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>meta
            <input type="number" step="1" value={ajusteMeta} onChange={e => setAjusteMeta(e.target.value)} style={{ ...inp, width: 52 }} />%</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>super
            <input type="number" step="1" value={ajusteSuper} onChange={e => setAjusteSuper(e.target.value)} style={{ ...inp, width: 52 }} />%</span>
          <button onClick={salvarTodos} disabled={salvando} style={{ ...c.inp, cursor: 'pointer', background: '#0d6b5e', color: '#fff', border: 'none', fontWeight: 700 }}>💾 Salvar ({selVends.length}) · {futN}m</button>
        </span>}
      </div>
      {gestao && <div style={{ background: '#f0f7f4', border: '1px solid #cdeadd', borderRadius: 10, padding: '9px 12px', marginBottom: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5 }}>
        <b>Distribuir a meta da loja</b> entre os <b>{selVends.length}</b> marcados:
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>meta R$<input type="number" value={metaLoja} onChange={e => setMetaLoja(e.target.value)} placeholder="0" style={{ ...inp, width: 110 }} /></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>super R$<input type="number" value={superLoja} onChange={e => setSuperLoja(e.target.value)} placeholder="0" style={{ ...inp, width: 110 }} /></span>
        <button onClick={ratear} style={{ ...c.inp, cursor: 'pointer', color: '#0d6b5e', borderColor: '#0d6b5e', fontWeight: 700 }}>📊 Ratear por representatividade</button>
        <span style={{ color: '#64748b', fontSize: 11.5 }}>divide pela participação de venda de cada um (soma das metas atuais: <b>{brl0(somaMeta)}</b>)</span>
      </div>}
      <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 8 }}>A meta já vem pela <b>média mensal</b> de cada vendedor (últimos {histN} meses) × ajuste — ou use o <b>rateio da meta da loja</b> acima. Marque quem compõe a loja, edite as células que quiser e salve. Grava os próximos {futN} meses.</div>
      {vends.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13 }}>Sem movimento no período. Troque a loja/período acima.</div> :
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc', borderBottom: '2px solid #eef1f4' }}>
            <th style={{ padding: '8px 10px' }}><input type="checkbox" checked={todosSel} onChange={toggleTodos} title="marcar todos" /></th>
            {['Vendedor', 'Venda (per.)', 'Média/mês', 'Meta/mês', 'Super/mês', ''].map((h, i) => <th key={i} style={{ padding: '8px 10px', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>)}
          </tr></thead>
          <tbody>{vends.map(v => {
            const uid = String(v.usuarioId);
            const semBase = medias[uid]?.media == null;
            const on = isSel(uid);
            return <tr key={uid} style={{ borderTop: '1px solid #f1f3f5', opacity: on ? 1 : 0.45 }}>
              <td style={{ padding: '7px 10px' }}><input type="checkbox" checked={on} onChange={() => toggle(uid)} /></td>
              <td style={{ padding: '7px 10px', fontWeight: 600 }}>{v.nome}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b' }}>{brl0(v.venda)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', color: semBase ? '#cbd5e1' : '#64748b' }}>{semBase ? '—' : brl0(medias[uid].media)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right' }}><input type="number" value={valMeta(uid)} onChange={e => setCell(uid, 'meta', e.target.value)} style={inp} /></td>
              <td style={{ padding: '7px 10px', textAlign: 'right' }}><input type="number" value={valSuper(uid)} onChange={e => setCell(uid, 'super', e.target.value)} style={inp} /></td>
              <td style={{ padding: '7px 10px', textAlign: 'right' }}><button onClick={() => onPick(uid)} style={{ background: 'none', border: 'none', color: '#0d6b5e', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>detalhes →</button></td>
            </tr>;
          })}</tbody>
          <tfoot><tr style={{ borderTop: '2px solid #eef1f4', fontWeight: 700 }}>
            <td></td><td style={{ padding: '8px 10px' }}>Selecionados ({selVends.length})</td><td colSpan={2}></td>
            <td style={{ padding: '8px 10px', textAlign: 'right' }}>{brl0(somaMeta)}</td><td colSpan={2}></td>
          </tr></tfoot>
        </table></div>}
    </div>
  );
}
function Metas({ API, gestao, lojas, d, canal = 'todos' }) {
  const [escopo, setEscopo] = useState('rede');
  const [alvo, setAlvo] = useState('');
  const [futN, setFutN] = useState(6);
  const [histN, setHistN] = useState(6);
  const [ajusteMeta, setAjusteMeta] = useState(0);
  const [ajusteSuper, setAjusteSuper] = useState(10);
  const [cat, setCat] = useState([]); const [itens, setItens] = useState([]); const [hist, setHist] = useState([]);
  const [msg, setMsg] = useState('');
  const vendedores = (d.porVendedor || []).filter(v => v.usuarioId);
  const futMeses = mesesFrente(futN);
  const flash = (t, ms = 3500) => { setMsg(t); setTimeout(() => setMsg(''), ms); };
  const carregar = useCallback(() => {
    const esc = { ...(escopo === 'loja' ? { loja: alvo } : escopo === 'vendedor' ? { vendedor: alvo } : {}) };
    API.get('/faturamento/metas', { params: { canal, escopo, alvo } }).then(r => { setCat(r.data.catalogo || []); setItens(r.data.itens || []); }).catch(() => {});
    API.get('/faturamento/historico', { params: { meses: histN, canal, ...esc } }).then(r => setHist(r.data.meses || [])).catch(() => setHist([]));
  }, [API, escopo, alvo, histN, canal]);
  useEffect(() => { carregar(); }, [carregar]);
  const metaSalva = (comp, ind) => { const r = itens.find(x => x.competencia === comp && x.indicador === ind); return r ? r.meta : null; };
  const salvar = (comp, indicador, meta) => API.put('/faturamento/metas', { canal, escopo, alvo, competencia: comp, indicador, meta }).then(carregar).catch(() => {});
  // super meta usa o histórico de 'venda' como base
  const histKey = ind => ind === 'venda_super' ? 'venda' : ind;
  const histMedia = ind => { const k = histKey(ind); const vals = hist.map(h => h[k]).filter(v => v != null && Number.isFinite(Number(v))); return vals.length ? Math.round(vals.reduce((a, b) => a + Number(b), 0) / vals.length * 100) / 100 : null; };
  const ultimoReal = ind => { const h = hist[hist.length - 1]; return h ? h[histKey(ind)] : null; };
  const comAjuste = (v, ind) => { if (v == null) return null; const a = ind === 'venda_super' ? Number(ajusteSuper) : Number(ajusteMeta); return Math.round(v * (1 + (a || 0) / 100) * 100) / 100; };
  // crescimento histórico da VENDA no período (p/ avisar se o ajuste ficou acima da tendência real)
  const crescimento = (() => { const s = hist.map(h => h.venda).filter(v => v > 0); return s.length >= 2 && s[0] ? Math.round((s[s.length - 1] - s[0]) / s[0] * 1000) / 10 : null; })();
  const metaAcimaTend = crescimento != null && Number(ajusteMeta) > crescimento + 15;
  const unidadeDe = ind => cat.find(x => x.chave === ind)?.unidade;
  const fmt = (ind, v) => v == null ? '—' : (unidadeDe(ind) === 'R$' ? brl0(v) : (unidadeDe(ind) === '%' ? v + '%' : num(v)));
  const lote = (fn, aviso) => {
    const its = []; cat.forEach(ind => futMeses.forEach(comp => { const v = fn(ind.chave, comp); if (v != null) its.push({ canal, escopo, alvo, competencia: comp, indicador: ind.chave, meta: v }); }));
    if (!its.length) return flash('Sem base pra preencher.');
    API.put('/faturamento/metas-lote', { itens: its }).then(() => { carregar(); flash(aviso); }).catch(() => flash('⚠️ erro'));
  };
  const aj = `(meta ${ajusteMeta > 0 ? '+' : ''}${ajusteMeta}% · super ${ajusteSuper > 0 ? '+' : ''}${ajusteSuper}%)`;
  const preencherMedia = () => lote((ind, comp) => comAjuste(histMedia(ind), ind), `✅ ${futN} meses pela média ${aj} — ajuste à vontade.`);
  const preencherUltimo = () => lote((ind, comp) => comAjuste(ultimoReal(ind), ind), `✅ ${futN} meses pelo último mês ${aj}.`);
  const replicarPrimeiro = () => { const base = {}; cat.forEach(ind => { base[ind.chave] = metaSalva(futMeses[0], ind.chave); }); lote((ind, comp) => comp === futMeses[0] ? null : base[ind], `✅ ${ymLabel(futMeses[0])} replicado para os demais meses.`); };
  // #6 rateio rede→loja: distribui a meta da rede entre as lojas pela participação histórica de venda de cada uma.
  const VOL_RATEIO = new Set(['venda', 'venda_super', 'unidades', 'vitaminas', 'entrega']); // divide por share; ratios (ticket/cmv/identif) copiam
  const distribuirLojas = () => {
    const pl = d.porLoja || []; const total = pl.reduce((a, l) => a + (l.venda || 0), 0);
    if (!total) return flash('Sem base de venda por loja — carregue o faturamento primeiro.');
    const its = [];
    pl.forEach(l => {
      const lojaApp = lojas.find(x => Number(x.erp_unidadenegocio_id) === Number(l.uni)); if (!lojaApp) return;
      const share = l.venda / total;
      cat.forEach(ind => futMeses.forEach(comp => {
        const rede = metaSalva(comp, ind.chave); if (rede == null) return;
        const v = VOL_RATEIO.has(ind.chave) ? Math.round(rede * share * 100) / 100 : rede;
        its.push({ canal, escopo: 'loja', alvo: lojaApp.id, competencia: comp, indicador: ind.chave, meta: v });
      }));
    });
    if (!its.length) return flash('Defina as metas da REDE primeiro (preencha abaixo).');
    API.put('/faturamento/metas-lote', { itens: its }).then(() => flash(`✅ Metas distribuídas para ${pl.length} lojas pela participação de cada uma (volumes rateados, taxas copiadas). Veja em "🏪 Por loja".`, 5000)).catch(() => flash('⚠️ erro'));
  };
  // gera a meta de venda (+super) de TODOS os vendedores de uma vez, pela média/último de cada um.
  const gerarTodosVendedores = () => {
    if (!window.confirm('Gerar a meta de VENDA (+super) de TODOS os vendedores pela média do histórico de cada um, nos próximos ' + futN + ' meses? (sobrescreve as metas de venda deles)')) return;
    flash('⏳ gerando para todos os vendedores…', 12000);
    API.put('/faturamento/metas-gerar-vendedores', { base: 'media', meses: histN, futMeses, ajusteMeta, ajusteSuper, canal, loja: '' })
      .then(r => flash(`✅ Metas de venda geradas para ${r.data.vendedores} vendedores (${r.data.metas} metas). Selecione um vendedor pra conferir.`, 6000))
      .catch(() => flash('⚠️ erro ao gerar.'));
  };
  // #7 rateio loja→vendedores: pega a meta (+super) de VENDA da loja em cada mês e divide entre os
  // vendedores da loja pela participação histórica de cada um (soma = total da loja). Editável depois.
  const distribuirVendedores = () => {
    const competencias = futMeses.map(comp => ({ competencia: comp, meta: metaSalva(comp, 'venda'), metaSuper: metaSalva(comp, 'venda_super') }))
      .filter(x => x.meta != null || x.metaSuper != null);
    if (!competencias.length) return flash('Defina a meta de VENDA desta loja primeiro (preencha abaixo).');
    if (!window.confirm(`Dividir a meta de VENDA (+super) desta loja entre os vendedores dela, pela participação histórica de cada um, em ${competencias.length} mês(es)? (sobrescreve as metas de venda desses vendedores)`)) return;
    flash('⏳ distribuindo para os vendedores da loja…', 12000);
    API.put('/faturamento/metas-distribuir-vendedores', { loja: alvo, competencias, meses: histN, canal })
      .then(r => flash(`✅ Meta da loja dividida entre ${r.data.vendedores} vendedores (${r.data.metas} metas) pela participação de cada um. Veja em "🧑‍💼 Por vendedor".`, 6000))
      .catch(e => flash('⚠️ ' + (e.response?.data?.erro || 'erro ao distribuir.')));
  };
  const escBtn = (v, l) => <button key={v} onClick={() => { setEscopo(v); setAlvo(''); }} style={{ ...c.tab, ...(escopo === v ? c.tabOn : {}), padding: '6px 12px', fontSize: 12.5 }}>{l}</button>;
  const alvoNome = escopo === 'rede' ? 'Rede (todas as lojas)' : escopo === 'loja' ? (lojas.find(l => l.id === alvo)?.nome || '—') : (vendedores.find(v => String(v.usuarioId) === String(alvo))?.nome || '—');

  return (
    <div>
      <div style={{ ...c.card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginRight: 'auto' }}>🎯 Metas de faturamento</div>
        <div style={{ display: 'flex', gap: 6 }}>{escBtn('rede', '🌐 Rede')}{escBtn('loja', '🏪 Por loja')}{escBtn('vendedor', '🧑‍💼 Por vendedor')}</div>
        {escopo === 'loja' && <label style={c.fld}>Loja<select value={alvo} onChange={e => setAlvo(e.target.value)} style={c.inp}><option value="">— escolha —</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>}
        {escopo === 'vendedor' && <label style={c.fld}>Vendedor<select value={alvo} onChange={e => setAlvo(e.target.value)} style={{ ...c.inp, maxWidth: 220 }}><option value="">— escolha —</option>{vendedores.map(v => <option key={v.usuarioId} value={v.usuarioId}>{v.nome}</option>)}</select></label>}
        <label style={c.fld}>Meses à frente<select value={futN} onChange={e => setFutN(Number(e.target.value))} style={c.inp}>{[3, 6, 12].map(n => <option key={n} value={n}>{n} meses</option>)}</select></label>
        {escopo === 'vendedor' && gestao && <button onClick={gerarTodosVendedores} style={{ ...c.inp, cursor: 'pointer', background: '#0d6b5e', color: '#fff', border: 'none', fontWeight: 700, alignSelf: 'flex-end' }}>🧑‍💼 Gerar p/ TODOS os vendedores</button>}
      </div>

      {escopo !== 'rede' && !alvo ? <OverviewMetas escopo={escopo} d={d} lojas={lojas} onPick={setAlvo} API={API} canal={canal} gestao={gestao}
        histN={histN} futMeses={futMeses} futN={futN} ajusteMeta={ajusteMeta} setAjusteMeta={setAjusteMeta} ajusteSuper={ajusteSuper} setAjusteSuper={setAjusteSuper} onFlash={flash} onSaved={carregar} /> : <>
        <div style={{ ...c.card, background: '#f0f7f4', border: '1px solid #cdeadd', fontSize: 12.5, color: '#334', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {escopo !== 'rede' && <button onClick={() => setAlvo('')} style={{ ...c.inp, cursor: 'pointer', fontWeight: 700, color: '#0d6b5e', borderColor: '#0d6b5e', padding: '5px 10px' }}>← Voltar p/ {escopo === 'loja' ? 'as lojas' : 'os vendedores'}</button>}
          <span>Metas de <b>{alvoNome}</b>. Preencha vários meses à frente; use o histórico abaixo como base. <span style={{ color: '#94a3b8' }}>Salva ao sair do campo; o botão confirma.</span></span>
          {gestao && <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => { try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch (e) {} setTimeout(() => flash('✓ Metas salvas'), 120); }} style={{ ...c.inp, cursor: 'pointer', background: '#0d6b5e', color: '#fff', border: 'none', fontWeight: 700 }}>💾 Salvar</button>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>meta
              <input type="number" step="1" value={ajusteMeta} onChange={e => setAjusteMeta(e.target.value)} style={{ ...c.inp, width: 56, textAlign: 'right', padding: '5px 7px' }} />%</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>super
              <input type="number" step="1" value={ajusteSuper} onChange={e => setAjusteSuper(e.target.value)} style={{ ...c.inp, width: 56, textAlign: 'right', padding: '5px 7px' }} />%</span>
            <button onClick={preencherMedia} style={{ ...c.inp, cursor: 'pointer', color: '#0d6b5e', borderColor: '#0d6b5e', fontWeight: 700 }}>📊 Média do histórico</button>
            <button onClick={preencherUltimo} style={{ ...c.inp, cursor: 'pointer', color: '#0d6b5e', borderColor: '#0d6b5e', fontWeight: 700 }}>↩️ Último mês</button>
            <button onClick={replicarPrimeiro} style={{ ...c.inp, cursor: 'pointer', color: '#0d6b5e', borderColor: '#0d6b5e', fontWeight: 700 }}>📋 Replicar {ymLabel(futMeses[0])} →</button>
            {escopo === 'rede' && <button onClick={distribuirLojas} style={{ ...c.inp, cursor: 'pointer', background: '#0d6b5e', color: '#fff', border: 'none', fontWeight: 700 }}>🏪 Distribuir p/ as lojas</button>}
            {escopo === 'loja' && <button onClick={distribuirVendedores} style={{ ...c.inp, cursor: 'pointer', background: '#0d6b5e', color: '#fff', border: 'none', fontWeight: 700 }}>🧑‍💼 Distribuir p/ os vendedores</button>}
          </span>}
          {msg && <span style={{ fontSize: 12, fontWeight: 600, color: msg.startsWith('⚠️') || msg.startsWith('Sem') ? '#b45309' : '#15803d' }}>{msg}</span>}
        </div>
        {crescimento != null && <div style={{ ...c.card, padding: '8px 14px', background: metaAcimaTend ? '#fef3e2' : '#f8fafc', border: '1px solid ' + (metaAcimaTend ? '#f0c27a' : '#eef2f0'), fontSize: 12, color: metaAcimaTend ? '#8a5a00' : '#64748b' }}>
          📊 Crescimento da venda no histórico ({histN} meses): <b>{crescimento > 0 ? '+' : ''}{crescimento}%</b>. {metaAcimaTend ? <b>⚠️ O ajuste de meta (+{ajusteMeta}%) está bem acima dessa tendência — a meta pode ficar inatingível.</b> : 'O ajuste de meta está coerente com a tendência.'}</div>}

        {hist.length > 0 && <div style={c.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>📈 Histórico realizado <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>(base pra calibrar)</span></div>
            <label style={{ ...c.fld, marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5 }}>período
              <select value={histN} onChange={e => setHistN(Number(e.target.value))} style={{ ...c.inp, padding: '5px 7px' }}>{[3, 6, 12].map(n => <option key={n} value={n}>últimos {n} meses</option>)}</select></label>
          </div>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: '#f8fafc' }}><th style={{ ...c.th }}>Indicador</th>{hist.map(h => <th key={h.mes} style={{ ...c.th, textAlign: 'right' }}>{ymLabel(h.mes)}</th>)}<th style={{ ...c.th, textAlign: 'right', color: '#0d6b5e' }}>média</th></tr></thead>
            <tbody>{cat.map(ind => <tr key={ind.chave} style={{ borderTop: '1px solid #f1f3f5' }}>
              <td style={{ ...c.td, fontWeight: 600 }}>{ind.nome}</td>
              {hist.map(h => <td key={h.mes} style={{ ...c.td, textAlign: 'right', color: '#64748b' }}>{fmt(ind.chave, h[ind.chave])}</td>)}
              <td style={{ ...c.td, textAlign: 'right', fontWeight: 700, color: '#0d6b5e' }}>{fmt(ind.chave, histMedia(ind.chave))}</td>
            </tr>)}</tbody>
          </table></div>
        </div>}

        {gestao ? <div style={c.card}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>🎯 Metas (próximos {futN} meses) <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>— digite e saia do campo pra salvar</span></div>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: '#f8fafc' }}><th style={{ ...c.th }}>Indicador</th>{futMeses.map(m => <th key={m} style={{ ...c.th, textAlign: 'right' }}>{ymLabel(m)}</th>)}</tr></thead>
            <tbody>{cat.map(ind => <tr key={ind.chave} style={{ borderTop: '1px solid #f1f3f5' }}>
              <td style={{ ...c.td, fontWeight: 600 }}>{ind.nome} <span style={{ fontSize: 10, color: '#cbd5e1' }}>{ind.direcao === 'menor' ? '≤' : '≥'}</span></td>
              {futMeses.map(m => { const v = metaSalva(m, ind.chave); return <td key={m} style={{ ...c.td, textAlign: 'right' }}>
                <input type="number" step="0.01" defaultValue={v ?? ''} key={m + (v ?? 'x')} placeholder="—" onBlur={e => salvar(m, ind.chave, e.target.value)} style={{ ...c.inp, width: 84, textAlign: 'right', background: v != null ? '#f6fcf9' : '#fff', borderColor: v != null ? '#cdeadd' : '#e3e8ea' }} />
              </td>; })}
            </tr>)}</tbody>
          </table></div>
        </div> : <div style={c.card}>🎯 As metas são cadastradas pela gestão.</div>}
      </>}
    </div>
  );
}
