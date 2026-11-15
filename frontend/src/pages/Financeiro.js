import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';
import MultiLojaSelect from '../components/MultiLojaSelect';
import MeuSetorArea from './MeuSetorArea';
import MinhaAreaLateral from '../components/MinhaAreaLateral';

const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const dataBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
const COR = { verde: '#1E874B', amarelo: '#B7791F', vermelho: '#C0392B' };
const hojeISO = () => new Date().toISOString().slice(0, 10);
const inicioMes = () => { const h = new Date(); return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`; };
const proxMes = () => { const h = new Date(); const d = new Date(h.getFullYear(), h.getMonth() + 1, 1); return d.toISOString().slice(0, 10); };
// Gráfico de linhas em SVG (sem lib). series = [{ nome, cor, valores:[12] }]. Mostra eixo, meses e legenda.
function GraficoLinhas({ series, meses, altura = 190 }) {
  const M = meses || ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const W = 820, H = altura, padL = 58, padR = 14, padT = 12, padB = 24;
  const vals = (series || []).flatMap(s => s.valores).filter(v => typeof v === 'number' && !Number.isNaN(v));
  if (!vals.length) return <div style={{ color: '#94a3b8', fontSize: 12, padding: 10 }}>Sem dados pra plotar.</div>;
  let min = Math.min(0, ...vals), max = Math.max(0, ...vals); if (min === max) max = min + 1;
  const n = M.length;
  const x = i => padL + (W - padL - padR) * (n <= 1 ? 0.5 : i / (n - 1));
  const y = v => padT + (H - padT - padB) * (1 - (v - min) / (max - min));
  const fmtK = v => { const a = Math.abs(v); return a >= 1000000 ? (Math.round(v / 100000) / 10) + 'M' : a >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v * 10) / 10; };
  const ticks = [max, (max + min) / 2, min];
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 560, height: 'auto', display: 'block' }}>
        {ticks.map((t, i) => <g key={i}><line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#eef1f4" /><text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{fmtK(t)}</text></g>)}
        {min < 0 && max > 0 && <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} stroke="#cbd5e1" strokeDasharray="3 3" />}
        {M.map((m, i) => <text key={i} x={x(i)} y={H - 7} textAnchor="middle" fontSize="9" fill="#94a3b8">{m}</text>)}
        {(series || []).map((s, si) => {
          const pts = s.valores.map((v, i) => (typeof v === 'number' && !Number.isNaN(v)) ? `${x(i)},${y(v)}` : null).filter(Boolean).join(' ');
          const dy = si % 2 === 0 ? -7 : 13; // alterna rótulo acima/abaixo quando há 2+ linhas
          return <g key={si}>
            <polyline points={pts} fill="none" stroke={s.cor} strokeWidth="2.2" />
            {s.valores.map((v, i) => (typeof v === 'number' && !Number.isNaN(v)) ? <g key={i}>
              <circle cx={x(i)} cy={y(v)} r="2.6" fill={s.cor} />
              <text x={x(i)} y={y(v) + dy} textAnchor="middle" fontSize="8.5" fontWeight="700" fill={s.cor}>{fmtK(v)}</text>
            </g> : null)}
          </g>;
        })}
      </svg>
      {(series || []).length > 1 && <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 11.5, flexWrap: 'wrap' }}>{series.map((s, i) => <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 3, background: s.cor, display: 'inline-block', borderRadius: 2 }} />{s.nome}</span>)}</div>}
    </div>
  );
}

export default function Financeiro() {
  const { API } = useAuth();
  const [aba, setAba] = useState('meusetor');
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  useEffect(() => { API.get('/financeiro/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  return (
    <div style={s.wrap}>
      <Banner emoji="💳" titulo="Contas a pagar" cor="verde" sub="Meu Setor do financeiro, contas a pagar, créditos de devolução e análise de despesas." />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <MultiLojaSelect lojas={lojas} value={loja} onChange={setLoja} compact />
        {[['meusetor', '🏆 Meu Setor'], ['metas', '⚙️ Metas'], ['contaspagar', '💳 Contas a pagar'], ['creditos', '↩️ Créditos devolução'], ['semplano', '🧾 Sem plano'], ['reajustes', '📈 Análise de despesas']].map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {aba === 'reajustes' && <Reajustes API={API} loja={loja} />}
      {aba === 'contaspagar' && <ContasPagarSecao API={API} loja={loja} tipo="aberto" />}
      {aba === 'creditos' && <ContasPagarSecao API={API} loja={loja} tipo="credito" />}
      {aba === 'semplano' && <ContasPagarSecao API={API} loja={loja} tipo="semplano" />}
      {aba === 'meusetor' && <MeuSetorArea area="gerencial" embutido abaFixa="setor" />}
      {aba === 'metas' && <MeuSetorArea area="gerencial" embutido abaFixa="metas" />}
      <MinhaAreaLateral area="gerencial" titulo="Minha área" />
    </div>
  );
}

// Planejamento — menu próprio (Financeiro): Fluxo de caixa + Orçamento × realizado.
export function PlanejamentoPage() {
  const { API } = useAuth();
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  const [aba, setAba] = useState('fluxo');
  useEffect(() => { API.get('/financeiro/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  return (
    <div style={s.wrap}>
      <Banner emoji="🗺️" titulo="Planejamento" cor="verde" sub="Fluxo de caixa e orçamento projetado × realizado — geral e por loja." />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <MultiLojaSelect lojas={lojas} value={loja} onChange={setLoja} compact />
        {[['fluxo', '💵 Fluxo de caixa'], ['acomp', '📉 Acompanhamento'], ['orcamento', '🎯 Orçamento × realizado']].map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {aba === 'fluxo' && <FluxoCaixa API={API} loja={loja} />}
      {aba === 'acomp' && <AcompanhamentoOrcamento API={API} loja={loja} lojas={lojas} setLoja={setLoja} />}
      {aba === 'orcamento' && <OrcamentoFin API={API} loja={loja} lojas={lojas} setLoja={setLoja} />}
    </div>
  );
}

// Resultado — menu próprio (Diretoria): DRE (fiscal) + DRE × DFC.
export function ResultadoPage() {
  const { API } = useAuth();
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  const [aba, setAba] = useState('dre');
  useEffect(() => { API.get('/financeiro/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  return (
    <div style={s.wrap}>
      <Banner emoji="📄" titulo="Resultado" cor="verde" sub="DRE (fiscal) e confronto DRE × DFC — geral e por loja." />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <MultiLojaSelect lojas={lojas} value={loja} onChange={setLoja} compact />
        {[['dre', '📄 DRE (fiscal)'], ['confronto', '⚖️ DRE × DFC']].map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {aba === 'dre' && <DRE API={API} loja={loja} />}
      {aba === 'confronto' && <Confronto API={API} loja={loja} />}
    </div>
  );
}

// Indicadores mercado: tabela TRANSPOSTA (indicadores nas linhas, lojas nas colunas) + Mercado ideal
// editável (semáforo) + gráfico por indicador. Joe 2026-11-14 noite.
const k0 = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
// defs das linhas: key, label, fmt, dir (maior|menor|null), mercado (chave editável), neg (cor por sinal)
const IND_COMP = [
  { key: 'faturamento', label: 'Faturamento', fmt: 'money', dir: 'maior' },
  { key: 'colaboradores', label: 'Colaboradores', fmt: 'int' },
  { key: 'estagiarios', label: 'Estagiários', fmt: 'int' },
  { key: 'fat_colab', label: 'Produtividade / funcionário (ano)', fmt: 'money', dir: 'maior' },
  { key: 'produtividade_func', label: 'Produtividade / funcionário (R$/mês)', fmt: 'money', dir: 'maior' },
  { key: 'custo_medio_func', label: 'Custo médio / funcionário (R$/mês)', fmt: 'money', dir: 'menor' },
  { key: 'rentabilidade_func', label: 'Rentabilidade / funcionário (R$/mês)', fmt: 'money', dir: 'maior', neg: true },
  { key: 'vendas_m2', label: 'Vendas por m² (R$/mês)', fmt: 'money', dir: 'maior' },
  { key: 'capital_giro', label: 'Capital de giro (R$/mês)', fmt: 'money' },
  { key: 'pmr', label: 'PMR — prazo recebimento (dias)', fmt: 'int', dir: 'menor' },
  { key: 'pmp', label: 'PMP — prazo pagamento (dias)', fmt: 'int', dir: 'maior' },
  { key: 'posicionamento', label: 'Posicionamento (PMR÷PMP · <1 bom)', fmt: 'int', dir: 'menor' },
  { key: 'cmv_pct', label: 'CMV %', fmt: 'pct', dir: 'menor', mercado: 'cmv_pct' },
  { key: 'desp_pct', label: 'Despesas %', fmt: 'pct', dir: 'menor', mercado: 'desp_pct' },
  { key: 'desconto_pct', label: 'Desconto % (s/ tabela)', fmt: 'pct', dir: 'menor', mercado: 'desconto_pct' },
  { key: 'imposto_pct', label: 'Imposto %', fmt: 'pct', dir: 'menor', mercado: 'imposto_pct' },
  { key: 'margem_pct', label: 'Margem %', fmt: 'pct', dir: 'maior', mercado: 'margem_pct', neg: true },
  { key: 'ponto_equilibrio', label: 'Ponto de equilíbrio (R$/mês)', fmt: 'money', dir: 'menor' },
  { key: 'ticket', label: 'Ticket médio', fmt: 'ticket', dir: 'maior' },
  { key: 'cupons', label: 'Cupons', fmt: 'int', dir: 'maior' },
  { key: 'clientes', label: 'Clientes', fmt: 'int', dir: 'maior' },
  { key: 'erros_caixa', label: 'Erros de caixa', fmt: 'int', dir: 'menor' },
  { key: 'entregas', label: 'Entregas', fmt: 'int', dir: 'maior' },
  { key: 'resultado', label: 'Resultado líquido', fmt: 'money', dir: 'maior', neg: true },
];
const fmtVal = (fmt, v) => {
  if (v == null) return '—';
  if (fmt === 'money') return k0(v);
  if (fmt === 'ticket') return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  if (fmt === 'pct') return (Math.round(Number(v) * 10) / 10) + '%';
  return Number(v).toLocaleString('pt-BR');
};
// compacto p/ caber na tabela: 11,0M · 501k · 1.251 · 55,2%
const fmtComp = (fmt, v) => {
  if (v == null) return '—';
  if (fmt === 'money') { const a = Math.abs(v); const s = v < 0 ? '-' : ''; if (a >= 1e6) return s + (a / 1e6).toFixed(1).replace('.', ',') + 'M'; if (a >= 1e3) return s + Math.round(a / 1e3) + 'k'; return s + Math.round(a); }
  if (fmt === 'ticket') return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  if (fmt === 'pct') return (Math.round(Number(v) * 10) / 10) + '%';
  return Number(v).toLocaleString('pt-BR');
};
// Donut SVG (sem lib): fatias [{label, valor, cor}]. Mostra % na legenda; hover no arco mostra o valor.
function Donut({ fatias, titulo }) {
  const tot = fatias.reduce((a, f) => a + Math.max(0, f.valor), 0) || 1;
  const R = 70, r = 42, cx = 80, cy = 80; let ang = -Math.PI / 2;
  const arco = (frac) => {
    const a0 = ang, a1 = ang + frac * 2 * Math.PI; ang = a1;
    const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
    const xi1 = cx + r * Math.cos(a1), yi1 = cy + r * Math.sin(a1), xi0 = cx + r * Math.cos(a0), yi0 = cy + r * Math.sin(a0);
    const big = frac > 0.5 ? 1 : 0;
    return `M${x0},${y0} A${R},${R} 0 ${big} 1 ${x1},${y1} L${xi1},${yi1} A${r},${r} 0 ${big} 0 ${xi0},${yi0} Z`;
  };
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        {fatias.filter(f => f.valor > 0).map((f, i) => <path key={i} d={arco(f.valor / tot)} fill={f.cor}><title>{f.label}: {'R$ ' + Math.round(f.valor).toLocaleString('pt-BR')} ({Math.round(f.valor / tot * 100)}%)</title></path>)}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="12" fontWeight="700" fill="#334">{titulo}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10" fill="#94a3b8">tabela 100%</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {fatias.map((f, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, background: f.cor, flexShrink: 0 }} />
          <span style={{ color: '#475569' }}>{f.label}</span>
          <b style={{ marginLeft: 'auto', color: '#334' }}>{Math.round(f.valor / tot * 100)}%</b>
        </div>)}
      </div>
    </div>
  );
}
function ComparativoLojas({ API }) {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [d, setD] = useState(null);
  const [mercado, setMercado] = useState({});
  const [graf, setGraf] = useState('resultado'); // indicador selecionado p/ o gráfico
  const [tipoGraf, setTipoGraf] = useState('barra'); // barra | linha
  const [lojaPie, setLojaPie] = useState(''); // '' = rede
  const [lucroAlvo, setLucroAlvo] = useState(6); // Bulla: lucro líquido alvo → calcula CMV ideal
  const [msg, setMsg] = useState('');
  const [recalc, setRecalc] = useState(false); // true durante um recálculo forçado (carga pesada)
  const carregar = React.useCallback((forcar) => {
    if (forcar) setRecalc(true); else setD(null);
    API.get('/financeiro/comparativo-lojas', { params: forcar ? { ano, forcar: 1 } : { ano } })
      .then(r => { setD(r.data); setMercado(r.data.mercado || {}); })
      .catch(() => setD({ erro: 1 }))
      .finally(() => setRecalc(false));
  }, [API, ano]);
  useEffect(() => { carregar(false); }, [carregar]);
  const ls = d?.lojas || [];
  const cacheInfo = d?.cache; // { atualizado_em, deCache, stale }
  const quandoCache = iso => { if (!iso) return ''; const dt = new Date(String(iso).replace(' ', 'T') + 'Z'); return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const salvarMercado = () => API.put('/financeiro/eficiencia-mercado', { mercado }).then(r => { setMercado(r.data.mercado || {}); setMsg('✅ Metas de mercado salvas.'); setTimeout(() => setMsg(''), 2000); }).catch(() => setMsg('⚠️ Erro ao salvar.'));
  const nomeCurto = n => (n || '').replace(/^Mutti\s*-\s*/i, '').replace(/^Ultra\s*-\s*/i, 'U.').replace(/Entre Rios/i, 'E.Rios').replace(/Posto de Medicamentos/i, 'Posto').replace(/Farma Rocha/i, 'F.Rocha');
  const tdR = { padding: '4px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: 11.5 };
  const thC = (al) => ({ textAlign: al, padding: '5px 6px', background: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: 10.5, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap', position: 'sticky', top: 0 });
  // semáforo de uma célula vs mercado
  const corCel = (ind, v) => {
    if (ind.neg) return (v || 0) < 0 ? COR.vermelho : COR.verde;
    const m = ind.mercado != null ? Number(mercado[ind.mercado]) : NaN;
    if (!ind.dir || !Number.isFinite(m) || v == null) return '#334';
    const bom = ind.dir === 'maior' ? v >= m : v <= m;
    return bom ? COR.verde : COR.vermelho;
  };
  const gi = IND_COMP.find(x => x.key === graf) || IND_COMP[IND_COMP.length - 1];
  const vals = ls.map(l => ({ loja: l.loja, v: Number(l[gi.key]) || 0, raw: l[gi.key] }));
  const maxAbs = Math.max(1, ...vals.map(x => Math.abs(x.v)));
  // Composição de custo (donut) sobre a TABELA (faturamento + desconto). Reconstrói R$ dos %.
  const compDe = (arr) => arr.reduce((ac, l) => {
    const fat = Number(l.faturamento) || 0;
    ac.fat += fat; ac.desconto += Number(l.desconto) || 0;
    ac.cmv += (Number(l.cmv_pct) || 0) / 100 * fat; ac.despesas += (Number(l.desp_pct) || 0) / 100 * fat;
    ac.imposto += (Number(l.imposto_pct) || 0) / 100 * fat; ac.resultado += Number(l.resultado) || 0;
    return ac;
  }, { fat: 0, desconto: 0, cmv: 0, despesas: 0, imposto: 0, resultado: 0 });
  const comp = compDe(lojaPie ? ls.filter(l => l.loja_id === lojaPie) : ls);
  const fatiasPie = [
    { label: 'Desconto', valor: comp.desconto, cor: '#B23A48' },
    { label: 'CMV', valor: comp.cmv, cor: '#C77D3A' },
    { label: 'Despesas', valor: comp.despesas, cor: '#6D4AA8' },
    { label: 'Imposto', valor: comp.imposto, cor: '#2E5C9E' },
    { label: 'Margem (resultado)', valor: Math.max(0, comp.resultado), cor: '#0E7C5A' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...s.inp, padding: '6px 8px' }}>{[anoAtual - 1, anoAtual, anoAtual + 1].map(a => <option key={a} value={a}>{a}</option>)}</select>
        <button onClick={() => carregar(true)} disabled={recalc} title="Recalcula tudo do ERP (demora ~1min). Normalmente não precisa: a tela fica salva e abre na hora." style={{ ...s.inp, padding: '6px 10px', cursor: recalc ? 'wait' : 'pointer', background: recalc ? '#eef2f0' : '#fff', fontWeight: 700, color: COR.verde }}>{recalc ? '⏳ Recalculando…' : '🔄 Atualizar'}</button>
        {cacheInfo && cacheInfo.atualizado_em && <span style={{ fontSize: 11, color: cacheInfo.stale ? '#B7791F' : '#94a3b8' }}>{cacheInfo.stale ? '⚠️ ' : '🕒 '}calculado {quandoCache(cacheInfo.atualizado_em)}{cacheInfo.stale ? ' (pode estar desatualizado — clique Atualizar)' : ''}</span>}
        <span style={{ fontSize: 12, color: '#888', flexBasis: '100%' }}>Indicadores por loja no ano · <b style={{ color: COR.verde }}>verde = melhor que o mercado</b> · <b style={{ color: COR.vermelho }}>vermelho = pior</b>. Clique num indicador para ver o gráfico. <b>Fica salvo</b> — só recalcula no botão Atualizar.</span>
      </div>
      {!d && <div style={s.card}>Carregando…</div>}
      {d && d.erro && <div style={{ ...s.card, color: COR.vermelho }}>ERP indisponível.</div>}
      {d && !d.erro && <>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14, alignItems: 'stretch' }}>
        <div style={{ ...s.card, flex: '1 1 400px', marginBottom: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>📊 {gi.label} por loja</span>
            <select value={graf} onChange={e => setGraf(e.target.value)} style={{ ...s.inp, padding: '4px 8px', fontSize: 12 }}>{IND_COMP.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}</select>
            <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
              {[['barra', '▭ Barras'], ['linha', '📈 Linha']].map(([v, l]) => <button key={v} onClick={() => setTipoGraf(v)} style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 7, border: '1px solid ' + (tipoGraf === v ? '#0E7C5A' : '#ddd'), background: tipoGraf === v ? '#0E7C5A' : '#fff', color: tipoGraf === v ? '#fff' : '#555', cursor: 'pointer' }}>{l}</button>)}
            </div>
          </div>
          {tipoGraf === 'linha'
            ? <GraficoLinhas meses={ls.map(l => nomeCurto(l.loja))} series={[{ cor: gi.neg ? '#0E7C5A' : '#2E5C9E', valores: ls.map(l => Number(l[gi.key]) || 0) }, ...(gi.mercado && Number.isFinite(Number(mercado[gi.mercado])) ? [{ cor: '#C77D3A', valores: ls.map(() => Number(mercado[gi.mercado])) }] : [])]} />
            : [...vals].sort((a, b) => b.v - a.v).map((x, i) => { const pos = x.v >= 0; const w = Math.abs(x.v) / maxAbs * 100; const cor = gi.neg ? (pos ? COR.verde : COR.vermelho) : '#0E7C5A'; return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }} title={`${x.loja}: ${fmtVal(gi.fmt, x.raw)}`}>
              <span style={{ width: 150, fontSize: 12, color: '#444', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.loja}</span>
              <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 6, height: 22, position: 'relative', minWidth: 160 }}>
                <div style={{ width: Math.max(w, 1) + '%', height: '100%', background: cor, borderRadius: 6 }} />
                <span style={{ position: 'absolute', left: 8, top: 3, fontSize: 11.5, fontWeight: 800, color: w > 30 ? '#fff' : '#333' }}>{fmtVal(gi.fmt, x.raw)}</span>
              </div>
            </div>
          ); })}
          {tipoGraf === 'linha' && gi.mercado && Number.isFinite(Number(mercado[gi.mercado])) && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}><span style={{ color: '#C77D3A', fontWeight: 700 }}>— linha laranja</span> = meta de mercado ({mercado[gi.mercado]}%).</div>}
        </div>
        <div style={{ ...s.card, flex: '1 1 320px', marginBottom: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>🧩 DDC — Desconto · Despesa · Custo</span>
            <select value={lojaPie} onChange={e => setLojaPie(e.target.value)} style={{ ...s.inp, padding: '4px 8px', fontSize: 12 }}>
              <option value="">Rede (todas)</option>
              {ls.map(l => <option key={l.loja_id} value={l.loja_id}>{l.loja}</option>)}
            </select>
          </div>
          <Donut fatias={fatiasPie} titulo={lojaPie ? (ls.find(l => l.loja_id === lojaPie)?.loja || '').split(' ')[0] : 'Rede'} />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>Método Bulla: de cada R$ 100 de preço de tabela (venda bruta), quanto virou <b>Desconto</b>, <b>Custo</b> (CMV), <b>Despesa</b> e imposto — e o que sobrou de <b>Lucro/Margem</b>.</div>
        </div>
        </div>
        <div style={{ ...s.card, overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>🏪 Indicadores × lojas</span>
            <button onClick={salvarMercado} style={{ ...s.btnMini }}>💾 Salvar metas de mercado</button>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, fontSize: 12, color: '#64748b' }}>
              🧮 Lucro alvo (Bulla)<input type="number" value={lucroAlvo} onChange={e => setLucroAlvo(Number(e.target.value))} style={{ width: 46, border: '1px solid #cdeadd', borderRadius: 6, padding: '2px 4px', fontSize: 12, textAlign: 'right' }} />%
              <button onClick={() => {
                const sf = ls.reduce((a, l) => a + (l.faturamento || 0), 0) || 1;
                const despM = ls.reduce((a, l) => a + (l.desp_pct || 0) * (l.faturamento || 0), 0) / sf;
                const impM = ls.reduce((a, l) => a + (l.imposto_pct || 0) * (l.faturamento || 0), 0) / sf;
                const cmvIdeal = Math.round((100 - lucroAlvo - despM - impM) * 10) / 10;
                setMercado(m => ({ ...m, cmv_pct: cmvIdeal, margem_pct: lucroAlvo }));
                setMsg(`✅ CMV ideal = ${cmvIdeal}% (100 − ${lucroAlvo}% lucro − ${Math.round(despM * 10) / 10}% desp − ${Math.round(impM * 10) / 10}% imp). Salve pra fixar.`); setTimeout(() => setMsg(''), 6000);
              }} style={{ ...s.btnMini }}>calcular CMV ideal</button>
            </span>
            {msg && <span style={{ fontSize: 12, color: msg[0] === '✅' ? '#15803d' : '#b91c1c' }}>{msg}</span>}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>
              <th style={{ ...thC('left'), left: 0, zIndex: 2 }}>Indicador</th>
              {ls.map(l => <th key={l.loja_id} style={thC('right')} title={l.loja}>{nomeCurto(l.loja)}</th>)}
              <th style={{ ...thC('right'), background: '#eef7f2' }}>Mercado</th>
            </tr></thead>
            <tbody>{IND_COMP.map(ind => (
              <tr key={ind.key} style={{ background: graf === ind.key ? '#f0f7f4' : 'transparent' }}>
                <td onClick={() => setGraf(ind.key)} title="Ver gráfico deste indicador" style={{ padding: '4px 8px', borderBottom: '1px solid #f1f5f9', fontWeight: 600, cursor: 'pointer', position: 'sticky', left: 0, background: graf === ind.key ? '#f0f7f4' : '#fff', whiteSpace: 'nowrap', fontSize: 11.5 }}>{graf === ind.key ? '📊 ' : ''}{ind.label}</td>
                {ls.map(l => <td key={l.loja_id} style={{ ...tdR, color: corCel(ind, l[ind.key]), fontWeight: (ind.neg || ind.mercado) ? 700 : 500 }} title={fmtVal(ind.fmt, l[ind.key])}>{fmtComp(ind.fmt, l[ind.key])}</td>)}
                <td style={{ ...tdR, background: '#f7fbf9' }}>
                  {ind.mercado ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><input type="number" value={mercado[ind.mercado] ?? ''} onChange={e => setMercado(m => ({ ...m, [ind.mercado]: e.target.value }))} placeholder="—" style={{ width: 40, border: '1px solid #cdeadd', borderRadius: 6, padding: '2px 4px', fontSize: 11.5, textAlign: 'right' }} />%</span> : '—'}
                </td>
              </tr>
            ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Desconto = sobre o preço de tabela (itemvenda) · Imposto = deduções do DRE · Erros de caixa = diferenças da Tesouraria · Entregas = finalizadas no ano. Edite o <b>Mercado ideal</b> por indicador e salve — o semáforo compara cada loja com ele.</div>
        </div>
      </>}
    </div>
  );
}

// Eficiência de loja — menu próprio (Diretoria). Comparativo entre lojas + representatividade/mercado.
export function EficienciaLojaPage() {
  const { API } = useAuth();
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  const [aba, setAba] = useState('comparativo');
  useEffect(() => { API.get('/financeiro/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  return (
    <div style={s.wrap}>
      <Banner emoji="🏪" titulo="Eficiência de loja" cor="verde" sub="Comparativo entre lojas e representatividade — faturamento, colaboradores, margem e resultado." />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['comparativo', '📊 Indicadores'], ['colab', '👥 Por colaborador'], ['estoque', '📦 Eficiência de estoque'], ['repr', '💹 Financeiro']].map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {aba === 'comparativo' && <ComparativoLojas API={API} />}
      {aba === 'colab' && <EficienciaPessoas API={API} lojas={lojas} />}
      {aba === 'estoque' && <EficienciaEstoque API={API} />}
      {aba === 'repr' && <><div style={{ marginBottom: 12 }}><MultiLojaSelect lojas={lojas} value={loja} onChange={setLoja} compact /></div><EficienciaLoja API={API} loja={loja} setLoja={setLoja} lojas={lojas} /></>}
    </div>
  );
}

// 👥 Eficiência por pessoa — vendedor (vende mais), caixa (atende mais), conferente (confere mais),
// entregador (mais entregas). Reusa os endpoints existentes; ranking em barras + tabela. Joe 2026-11-14.
function RankBar({ itens, fmt, cor = '#0E7C5A' }) {
  const max = Math.max(1, ...itens.map(i => Math.abs(i.valor || 0)));
  return (
    <div>
      {itens.map((it, i) => { const w = Math.abs(it.valor || 0) / max * 100; return (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }} title={`${it.nome}: ${fmt(it.valor)}`}>
          <span style={{ width: 24, fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>{i + 1}º</span>
          <span style={{ width: 180, fontSize: 12, color: '#444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.nome}{it.loja ? <span style={{ color: '#aab', fontSize: 10.5 }}> · {it.loja}</span> : ''}</span>
          <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 6, height: 20, position: 'relative', minWidth: 120 }}>
            <div style={{ width: Math.max(w, 1) + '%', height: '100%', background: cor, borderRadius: 6 }} />
            <span style={{ position: 'absolute', left: 8, top: 2, fontSize: 11, fontWeight: 700, color: w > 35 ? '#fff' : '#333' }}>{fmt(it.valor)}</span>
          </div>
        </div>
      ); })}
      {!itens.length && <div style={{ fontSize: 12, color: '#94a3b8', padding: 12 }}>Sem dados no período.</div>}
    </div>
  );
}
function EficienciaPessoas({ API, lojas }) {
  const anoAtual = new Date().getFullYear();
  const [tipo, setTipo] = useState('vendedor'); // vendedor | caixa | conferente | entregador
  const [loja, setLoja] = useState('');
  const [ini, setIni] = useState(`${anoAtual}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`);
  const [fim, setFim] = useState(new Date().toISOString().slice(0, 10));
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState('');
  const k = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const num = v => (Number(v) || 0).toLocaleString('pt-BR');
  const carregar = useCallback(() => {
    setItens(null); setErro('');
    if (tipo === 'vendedor') { return; } // vendedor usa o componente detalhado VendaPorColaborador (abaixo)
    if (tipo === 'caixa_dif') {
      // Caixa com MENOR diferença (destaque): roster dos operadores (cupons) × soma |diferença| (quebras); menor = melhor.
      Promise.all([
        API.get('/tesouraria/cupons-operador', { params: { ini, fim, loja: loja || undefined } }).then(r => r.data.operadores || []).catch(() => []),
        API.get('/tesouraria/quebras', { params: { ini, fim, loja: loja || undefined } }).then(r => r.data.quebras || []).catch(() => []),
      ]).then(([ops, quebras]) => {
        // casa por NOME (o operadorId do cupons-operador ≠ o da quebras). Soma falta+sobra em MÓDULO.
        const norm = x => (x || '').trim().toUpperCase().replace(/#$/, '').trim();
        const diff = {}; quebras.forEach(q => { const k = norm(q.operador); if (k) diff[k] = (diff[k] || 0) + Math.abs(Number(q.valor) || 0); });
        const roster = {}; ops.forEach(o => { const nome = o.nome || o.operador; roster[norm(nome)] = nome; });
        // inclui operadores que só aparecem nas quebras (caso não estejam no cupons)
        Object.keys(diff).forEach(k => { if (!roster[k]) roster[k] = k; });
        const arr = Object.entries(roster).map(([k, nome]) => ({ nome, valor: diff[k] || 0 })).sort((a, b) => a.valor - b.valor);
        setItens(arr.slice(0, 30));
      }).catch(() => setErro('Erro.'));
      return;
    }
    if (tipo === 'caixa') {
      API.get('/tesouraria/cupons-operador', { params: { ini, fim, loja: loja || undefined } })
        .then(r => { const arr = (r.data.operadores || r.data.itens || r.data.ranking || []).map(o => ({ nome: o.nome || o.operador, loja: o.loja, valor: o.cupons ?? o.n ?? o.qtd ?? 0 })); arr.sort((a, b) => b.valor - a.valor); setItens(arr.slice(0, 30)); })
        .catch(e => setErro(e.response?.data?.erro || 'Erro.'));
    } else if (tipo === 'entregador') {
      API.get('/entrega/entregadores', { params: { ini, fim, loja: loja || undefined } })
        .then(r => { const arr = (r.data.entregadores || []).map(o => ({ nome: o.entregador || o.nome, loja: o.loja, valor: o.finalizadas ?? o.entregas ?? o.total ?? 0 })); arr.sort((a, b) => b.valor - a.valor); setItens(arr.slice(0, 30)); })
        .catch(e => setErro(e.response?.data?.erro || 'Erro.'));
    } else if (tipo === 'conferente') {
      // Ranking por MENOR TEMPO MÉDIO de conferência (datahorafinal − datahora), Rede ou loja.
      API.get('/recebimento/conferentes-tempo', { params: { loja_id: loja || undefined, mes, ano: anoAtual } })
        .then(r => { const arr = (r.data.conferentes || []).map(o => ({ nome: o.nome, valor: o.tempo_min, sub: o.n + ' NFs' })).sort((a, b) => a.valor - b.valor); setItens(arr.slice(0, 30)); })
        .catch(e => setErro(e.response?.data?.erro || 'Erro.'));
    }
  }, [API, tipo, loja, ini, fim, mes, anoAtual]);
  useEffect(() => { carregar(); }, [carregar]);
  const CFG = {
    vendedor: { titulo: 'Vendedores — quem vende mais (ano)', fmt: k, cor: '#0E7C5A', periodo: false },
    caixa: { titulo: 'Caixas — quem atende mais (cupons)', fmt: num, cor: '#2E5C9E', periodo: true },
    caixa_dif: { titulo: 'Caixas — menor diferença (R$) · menor é melhor', fmt: v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), cor: '#0E7C5A', periodo: true },
    conferente: { titulo: 'Conferentes — menor tempo de conferência (min) · menor é melhor', fmt: v => (Number(v) || 0).toLocaleString('pt-BR') + ' min', cor: '#C77D3A', periodo: 'mes' },
    entregador: { titulo: 'Entregadores — quem mais entrega', fmt: num, cor: '#6D4AA8', periodo: true },
  }[tipo];
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['vendedor', '🛍️ Vendedor'], ['caixa', '💳 Caixa (atende)'], ['caixa_dif', '💰 Caixa (diferença)'], ['conferente', '📦 Conferente'], ['entregador', '🛵 Entregador']].map(([v, l]) =>
          <button key={v} onClick={() => setTipo(v)} style={{ ...s.chip, ...(tipo === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {tipo === 'vendedor' ? <VendaPorColaborador API={API} loja={loja} setLoja={setLoja} lojas={lojas} /> : <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={loja} onChange={e => setLoja(e.target.value)} style={{ ...s.inp, padding: '6px 8px' }}>
            <option value="">Rede (todas)</option>
            {(lojas || []).map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          {CFG.periodo === true && <><input type="date" value={ini} onChange={e => setIni(e.target.value)} style={{ ...s.inp, padding: '5px 7px' }} /><span style={{ color: '#888', fontSize: 12 }}>a</span><input type="date" value={fim} onChange={e => setFim(e.target.value)} style={{ ...s.inp, padding: '5px 7px' }} /></>}
          {CFG.periodo === 'mes' && <select value={mes} onChange={e => setMes(Number(e.target.value))} style={{ ...s.inp, padding: '6px 8px' }}>{['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].map((m, i) => <option key={i} value={i + 1}>{m}/{anoAtual}</option>)}</select>}
          <button onClick={carregar} style={{ ...s.btnMini }}>🔄 Atualizar</button>
        </div>
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🏆 {CFG.titulo}</div>
          {erro && <div style={{ fontSize: 12.5, color: '#b45309', marginBottom: 8 }}>{erro}</div>}
          {itens === null ? <div style={{ fontSize: 12, color: '#999' }}>carregando…</div> : <RankBar itens={itens} fmt={CFG.fmt} cor={CFG.cor} />}
        </div>
      </>}
    </div>
  );
}

// Seção do Gerencial (aba própria, igual Meu Setor/Metas): uma análise do ERP por vez.
const CP_CONFIG = {
  aberto: {
    url: '/financeiro/contas-pagar-aberto', titulo: '💳 Contas a pagar em aberto (vencidas, sem baixa)', cor: '#C0392B',
    sub: 'Títulos vencidos ainda não baixados — correr atrás do que é.',
    cols: [
      { k: 'venc', l: 'Vencimento', get: it => dataBR(it.vencimento) },
      { k: 'dias', l: 'Atraso', num: true, get: it => it.dias + 'd', cor: it => it.dias > 30 ? '#C0392B' : '#555' },
      { k: 'forn', l: 'Fornecedor', get: it => it.fornecedor || '—' },
      { k: 'doc', l: 'Documento', get: it => it.numerodocumento || '—' },
      { k: 'desc', l: 'Descrição', wrap: true, get: it => it.descricao || '—' },
      { k: 'user', l: 'Lançou', get: it => it.usuario || '—' },
      { k: 'valor', l: 'Valor', num: true, get: it => brl(it.valor) },
    ],
  },
  semplano: {
    url: '/financeiro/lancamentos-sem-plano', titulo: '🧾 Lançamentos sem plano de contas', cor: '#B7791F',
    sub: 'Precisam ser classificados (sem plano não dá pra analisar a despesa).',
    cols: [
      { k: 'venc', l: 'Vencimento', get: it => dataBR(it.vencimento) },
      { k: 'forn', l: 'Fornecedor', get: it => it.fornecedor || '—' },
      { k: 'doc', l: 'Documento', get: it => it.numerodocumento || '—' },
      { k: 'desc', l: 'Descrição', wrap: true, get: it => it.descricao || '—' },
      { k: 'user', l: 'Lançou', get: it => it.usuario || '—' },
      { k: 'valor', l: 'Valor', num: true, get: it => brl(it.valor) },
    ],
  },
  credito: {
    url: '/financeiro/creditos-devolucao', titulo: '↩️ Créditos de devolução a recuperar', cor: '#2E5C9E',
    sub: 'Devoluções a fornecedor em aberto — crédito/dinheiro preso no fornecedor.',
    cols: [
      { k: 'data', l: 'Emissão', get: it => dataBR(it.data) },
      { k: 'cod', l: 'Código', get: it => it.codigo },
      { k: 'forn', l: 'Fornecedor', get: it => it.fornecedor || '—' },
      { k: 'nf', l: 'NF devolução', get: it => it.nf || '—' },
      { k: 'st', l: 'Status', get: it => it.status_rot || it.status },
      { k: 'valor', l: 'Saldo a recuperar', num: true, get: it => brl(it.valor) },
    ],
  },
};
function ContasPagarSecao({ API, loja, tipo }) {
  const cfg = CP_CONFIG[tipo] || CP_CONFIG.aberto;
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); API.get(cfg.url, { params: loja ? { loja } : {} }).then(r => setD(r.data)).catch(() => setD({ erro: 1 })); }, [API, loja, cfg.url]);
  const th = { textAlign: 'left', padding: '7px 8px', background: '#f8fafc', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
  const td = { padding: '6px 8px', borderBottom: '1px solid #f1f5f9' };
  return (
    <div style={s.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{cfg.titulo}</div>
        {d && !d.erro && <div style={{ fontSize: 14 }}><b style={{ color: cfg.cor }}>{brl(d.total)}</b> <span style={{ color: '#888' }}>· {d.qtd} {d.qtd === 1 ? 'item' : 'itens'}</span></div>}
      </div>
      <div style={{ fontSize: 11.5, color: '#888', marginBottom: 10 }}>{cfg.sub}</div>
      {!d && <div style={{ color: '#888', fontSize: 13 }}>Carregando…</div>}
      {d && d.erro && <div style={{ color: '#c0392b', fontSize: 13 }}>ERP indisponível.</div>}
      {d && !d.erro && !(d.itens || []).length && <div style={{ color: '#15803d', fontSize: 13 }}>Nada pendente. 👏</div>}
      {d && (d.itens || []).length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{cfg.cols.map(c => <th key={c.k} style={{ ...th, textAlign: c.num ? 'right' : 'left' }}>{c.l}</th>)}</tr></thead>
            <tbody>{d.itens.map((it, i) => <tr key={i}>{cfg.cols.map(c => <td key={c.k} style={{ ...td, textAlign: c.num ? 'right' : 'left', whiteSpace: c.wrap ? 'normal' : 'nowrap', maxWidth: c.wrap ? 340 : undefined, color: c.cor ? c.cor(it) : undefined }}>{c.get(it)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// DFC importado da planilha do Joe (regime caixa) — plano de contas hierárquico por loja/mês.
function DfcPlanilha({ API, loja }) {
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [d, setD] = useState(null); const [erro, setErro] = useState('');
  const [sel, setSel] = useState({ ano: null, mes: null });
  const carregar = useCallback(() => {
    setErro('');
    API.get('/financeiro/dfc-plano', { params: { loja: loja || undefined, ano: sel.ano || undefined, mes: sel.mes || undefined } })
      .then(r => setD(r.data)).catch(e => setErro(e.response?.data?.erro || 'Falha.'));
  }, [API, loja, sel.ano, sel.mes]);
  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <div style={{ ...s.card, color: '#C0392B' }}>⚠️ {erro}</div>;
  if (!d) return <div style={s.card}>Carregando DFC…</div>;
  if (!d.periodos || d.periodos.length === 0) return <div style={s.card}>Nenhum DFC importado ainda. Importe as planilhas de DFC (regime caixa) por loja.</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontSize: 12.5, color: '#666' }}>Mês:
          <select value={`${d.ano}-${d.mes}`} onChange={e => { const [a, m] = e.target.value.split('-'); setSel({ ano: Number(a), mes: Number(m) }); }} style={{ ...s.inp, padding: '6px 8px', marginLeft: 6 }}>
            {d.periodos.map(p => <option key={`${p.ano}-${p.mes}`} value={`${p.ano}-${p.mes}`}>{MES[p.mes - 1]}/{p.ano}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 12, color: '#999' }}>{loja ? '1 loja' : `${d.periodos.find(p => p.ano === d.ano && p.mes === d.mes)?.lojas || ''} lojas (rede)`}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ ...s.tab, maxWidth: 640 }}>
          <tbody>
            {d.linhas.map((l, i) => {
              if (l.nivel === 0) return (
                <tr key={i}><td style={{ ...s.td, fontWeight: 800, fontSize: 13, background: '#EEF4EF', borderTop: '2px solid #dfe9e2' }}>{l.conta}</td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 800, background: '#EEF4EF', borderTop: '2px solid #dfe9e2' }}>{brl(l.valor)}</td></tr>
              );
              const cor = l.sinal === '-' ? '#C0392B' : l.sinal === '+' ? '#1E7A46' : '#333';
              return (
                <tr key={i} style={{ borderTop: '1px solid #f3f3f3' }}>
                  <td style={{ ...s.td, paddingLeft: l.nivel === 2 ? 28 : 12, fontWeight: l.nivel === 1 ? 700 : 400, color: l.nivel === 1 ? '#333' : '#666', fontSize: l.nivel === 2 ? 12.5 : 13 }}>{l.conta}</td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: l.nivel === 1 ? 700 : 400, color: l.valor ? cor : '#bbb' }}>{brl(l.valor)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DlpDfc({ API, loja }) {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [d, setD] = useState(null); const [erro, setErro] = useState('');
  const [modo, setModo] = useState('%'); const [cfgOpen, setCfgOpen] = useState(false);
  const carregar = useCallback(() => { setD(null); setErro(''); API.get('/financeiro/demonstrativos', { params: { ano, loja: loja || undefined } }).then(r => { if (r.data.ok) setD(r.data); else setErro(r.data.erro); }).catch(e => setErro(e.response?.data?.erro || 'Falha.')); }, [API, ano, loja]);
  useEffect(() => { carregar(); }, [carregar]);
  const soma = a => (a || []).reduce((x, y) => x + y, 0);
  const base = d ? soma(d.dlp.vendaBruta) : 0;
  const baseMes = d ? d.dlp.vendaBruta : [];
  const cel = (v, mi) => { if (modo === '%') { const b = mi == null ? base : baseMes[mi]; return b ? (Math.round(v / b * 1000) / 10) + '%' : (v ? '—' : '0%'); } return v ? brl(v) : '—'; };
  const linha = (label, arr, opt = {}) => (
    <tr style={{ borderTop: opt.forte ? '2px solid #cfe0cf' : '1px solid #f2f2f2', background: opt.forte ? '#E9F6EC' : '#fff' }}>
      <td style={{ ...s.tdCat, fontWeight: opt.forte ? 800 : (opt.neg ? 400 : 600), color: opt.forte ? '#1E7A46' : '#333', paddingLeft: opt.ind ? 22 : 10 }}>{label}</td>
      {(arr || []).map((v, i) => <td key={i} style={{ ...s.tdN, color: v < 0 ? COR.vermelho : (opt.forte ? '#1E7A46' : '#444'), fontWeight: opt.forte ? 700 : 400 }}>{cel(v, i)}</td>)}
      <td style={{ ...s.tdN, fontWeight: 800, color: soma(arr) < 0 ? COR.vermelho : (opt.forte ? '#1E7A46' : '#111') }}>{cel(soma(arr), null)}</td>
    </tr>
  );
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...s.inp, padding: '6px 8px' }}>{[anoAtual - 1, anoAtual, anoAtual + 1].map(a => <option key={a} value={a}>{a}</option>)}</select>
        <button onClick={() => setModo(m => m === '%' ? 'R$' : '%')} style={s.btnMini}>{modo === '%' ? 'Ver R$' : 'Ver %'}</button>
        <button onClick={() => setCfgOpen(true)} style={s.btnMini}>⚙️ Configurar planos</button>
        <span style={{ fontSize: 11.5, color: '#888' }}>DLP (competência) e DFC (caixa) por <b>margem de contribuição</b>, % sobre venda bruta.</span>
      </div>
      {erro && <div style={{ ...s.card, color: COR.vermelho }}>⚠️ {erro}</div>}
      {!d && !erro && <div style={s.card}>Carregando…</div>}
      {d && <>
        <div style={{ overflowX: 'auto' }}><table style={s.tab}>
          <thead><tr><th style={{ ...s.th, textAlign: 'left', position: 'sticky', left: 0, background: '#fff' }}>DLP {ano} ({modo})</th>{MESAB.map((m, i) => <th key={i} style={{ ...s.th, textAlign: 'right' }}>{m}</th>)}<th style={{ ...s.th, textAlign: 'right' }}>Ano</th></tr></thead>
          <tbody>
            {linha('Vendas Brutas', d.dlp.vendaBruta)}
            {linha('(−) Descontos concedidos', d.dlp.descontos.map(v => -v), { neg: true, ind: true })}
            {linha('(=) Vendas Líquidas', d.dlp.vendaLiquida)}
            {linha('(−) CMV', d.dlp.cmv.map(v => -v), { neg: true, ind: true })}
            {linha('(=) Lucro Bruto', d.dlp.lucroBruto, { forte: true })}
            {linha('(−) Despesas Variáveis', d.dlp.despVariaveis.map(v => -v), { neg: true, ind: true })}
            {linha('(=) Margem de Contribuição', d.dlp.margemContribuicao, { forte: true })}
            {linha('(−) Despesas Fixas', d.dlp.despFixas.map(v => -v), { neg: true, ind: true })}
            {linha('(=) Lucro Operacional', d.dlp.lucroOperacional, { forte: true })}
            {soma(d.dlp.receitaNaoOp) > 0 && linha('(+) Receitas Não Operacionais', d.dlp.receitaNaoOp, { ind: true })}
            {linha('(−) Despesas Não Operacionais', d.dlp.despesaNaoOp.map(v => -v), { neg: true, ind: true })}
            {linha('(=) Lucro Líquido', d.dlp.lucroLiquido, { forte: true })}
          </tbody>
        </table></div>
        <div style={{ overflowX: 'auto', marginTop: 12 }}><table style={s.tab}>
          <thead><tr><th style={{ ...s.th, textAlign: 'left', position: 'sticky', left: 0, background: '#fff' }}>DFC {ano} ({modo})</th>{MESAB.map((m, i) => <th key={i} style={{ ...s.th, textAlign: 'right' }}>{m}</th>)}<th style={{ ...s.th, textAlign: 'right' }}>Ano</th></tr></thead>
          <tbody>
            {linha('Receita recebida no mês', d.dfc.receita)}
            {linha('(−) Fornecedores pagos', d.dfc.fornecedoresPagos.map(v => -v), { neg: true, ind: true })}
            {linha('(=) Lucro Bruto (caixa)', d.dfc.lucroBruto, { forte: true })}
            {linha('(−) Despesas Variáveis pagas', d.dfc.despVariaveis.map(v => -v), { neg: true, ind: true })}
            {linha('(=) Margem de Contribuição', d.dfc.margemContribuicao, { forte: true })}
            {linha('(−) Despesas Fixas pagas', d.dfc.despFixas.map(v => -v), { neg: true, ind: true })}
            {linha('(=) Resultado de Caixa Operacional', d.dfc.resultadoOperacional, { forte: true })}
            {linha('(−) Despesas Não Operacionais pagas', d.dfc.despesaNaoOp.map(v => -v), { neg: true, ind: true })}
            {linha('(=) Resultado de Caixa Ajustado', d.dfc.resultadoAjustado, { forte: true })}
          </tbody>
        </table></div>
        <div style={{ ...s.card, background: '#F0F6FF', borderColor: '#CFE0F5', fontSize: 11.5, color: '#2E5C9E', marginTop: 8 }}>ℹ️ <b>DLP</b> = competência (o resultado do negócio) · <b>DFC</b> = caixa (o que entrou/saiu). A separação <b>Variáveis × Fixas</b> vem da configuração dos planos (⚙️). CMV = custo real do estoque. Ajuste os planos pra bater com a leitura do seu contador/instituto.</div>
      </>}
      {cfgOpen && <ConfigPlanos API={API} ano={ano} loja={loja} onClose={() => setCfgOpen(false)} onSaved={() => { setCfgOpen(false); carregar(); }} />}
    </div>
  );
}

function ConfigPlanos({ API, ano, loja, onClose, onSaved }) {
  const [grupos, setGrupos] = useState(null); const [msg, setMsg] = useState('');
  useEffect(() => { API.get('/financeiro/dlp-grupos', { params: { ano, loja: loja || undefined } }).then(r => setGrupos(r.data.grupos || [])).catch(() => setGrupos([])); }, [API, ano, loja]);
  const setClasse = (grupo, classe) => setGrupos(gs => gs.map(g => g.grupo === grupo ? { ...g, classe } : g));
  const salvar = () => { setMsg('Salvando…'); API.post('/financeiro/dlp-config', { itens: grupos.map(g => ({ grupo: g.grupo, classe: g.classe })) }).then(() => onSaved()); };
  const OPC = [['variavel', 'Variável'], ['fixa', 'Fixa'], ['despesa_nao_op', 'Não Operacional'], ['receita_nao_op', 'Receita Não Op.'], ['ignorar', 'Ignorar (é CMV)']];
  return (
    <div onClick={onClose} style={s.overlay}><div onClick={e => e.stopPropagation()} style={{ ...s.modal, maxWidth: 680 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><b style={{ fontSize: 15 }}>⚙️ Configurar planos de contas → eixos do DLP/DFC</b><button onClick={onClose} style={s.btnMini}>✕</button></div>
      <div style={{ fontSize: 11.5, color: '#888', marginBottom: 8 }}>Diga se cada grupo é <b>Variável</b> (varia com a venda: impostos, comissão, cartão, frete), <b>Fixa</b> (aluguel, pessoal…) ou <b>Não Operacional</b>. "Ignorar" = é compra/CMV (já tratado pelo estoque).</div>
      {!grupos && <div style={s.card}>Carregando…</div>}
      {grupos && <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>{grupos.map(g => (
        <div key={g.grupo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #f2f2f2', fontSize: 12.5 }}>
          <span style={{ flex: 1 }}>{g.grupo} <span style={{ color: '#aaa' }}>· {brl(g.valor)}</span></span>
          <select value={g.classe} onChange={e => setClasse(g.grupo, e.target.value)} style={{ ...s.inp, padding: '4px 6px' }}>{OPC.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>))}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button onClick={salvar} style={s.btnDark}>Salvar</button>{msg && <span style={{ fontSize: 12, color: '#888', alignSelf: 'center' }}>{msg}</span>}</div>
    </div></div>
  );
}

function DRE({ API, loja }) {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [d, setD] = useState(null); const [erro, setErro] = useState(''); const [aberto, setAberto] = useState(false);
  const [linhaSel, setLinhaSel] = useState('resultado');
  useEffect(() => { setD(null); setErro(''); API.get('/financeiro/dre', { params: { ano, loja: loja || undefined } }).then(r => { if (r.data.ok) setD(r.data); else setErro(r.data.erro); }).catch(e => setErro(e.response?.data?.erro || 'Falha.')); }, [API, ano, loja]);
  const LINHAS_DRE = [['receitaBruta', 'Receita Bruta', '#1E7A46'], ['receitaLiquida', 'Receita Líquida', '#1E7A46'], ['cmv', 'CMV', '#B23'], ['lucroBruto', 'Lucro Bruto', '#2E5C9E'], ['despOperTotal', 'Despesas Operacionais', '#B23'], ['resultadoOper', 'Resultado Operacional', '#2E5C9E'], ['resultado', 'Resultado Líquido', '#0E7C5A'], ['margem', 'Margem líquida %', '#6D4AA8']];
  const soma = a => (a || []).reduce((x, y) => x + y, 0);
  const brlc = v => v ? (v < 0 ? '-' : '') + Math.round(Math.abs(v) / 1000).toLocaleString('pt-BR') + 'k' : '—'; // mensal em milhares
  const limpaGrupo = g => (g || '').replace(/^\d[\d.]*\s*-\s*/, '').replace(/\s*\(-\)\s*$/, ''); // "2.03 - DESPESAS COM PESSOAL (-)" → "DESPESAS COM PESSOAL"
  const cc = { padding: '4px 8px', fontSize: 11.5, position: 'sticky', left: 0, background: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: 200, maxWidth: 200 };
  const cn = { padding: '4px 5px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: 11 };
  const cth = { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.02em', color: '#999', padding: '6px 5px', whiteSpace: 'nowrap', textAlign: 'right', borderBottom: '2px solid #f0f0f0' };
  const linha = (label, arr, opt = {}) => (
    <tr style={{ borderTop: opt.forte ? '2px solid #ddd' : '1px solid #f4f4f4', background: opt.bg || (opt.forte ? '#FAFAFA' : '#fff') }}>
      <td title={label} style={{ ...cc, fontWeight: opt.forte ? 800 : opt.neg ? 400 : 600, color: opt.cor || '#222', paddingLeft: opt.ind ? 16 : 8 }}>{label}</td>
      {(arr || []).map((v, i) => <td key={i} style={{ ...cn, color: v < 0 ? COR.vermelho : (opt.cor || '#333'), fontWeight: opt.forte ? 700 : 400 }}>{brlc(v)}</td>)}
      <td style={{ ...cn, fontWeight: 800, color: soma(arr) < 0 ? COR.vermelho : (opt.cor || '#111'), borderLeft: '1px solid #eee' }}>{brl(soma(arr))}</td>
    </tr>
  );
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...s.inp, padding: '6px 8px' }}>{[anoAtual - 1, anoAtual, anoAtual + 1].map(a => <option key={a} value={a}>{a}</option>)}</select>
        <span style={{ fontSize: 12, color: '#888' }}>Competência · valores mensais em <b>milhares (k)</b> · coluna <b>Ano</b> em R$ cheio.</span>
      </div>
      {erro && <div style={{ ...s.card, color: COR.vermelho }}>⚠️ {erro}</div>}
      {!d && !erro && <div style={s.card}>Carregando…</div>}
      {d && <>
        <div style={{ ...s.card, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>📈 Evolução no ano</span>
            <select value={linhaSel} onChange={e => setLinhaSel(e.target.value)} style={{ ...s.inp, padding: '5px 8px' }}>
              {LINHAS_DRE.map(l => <option key={l[0]} value={l[0]}>{l[1]}</option>)}
              {(d.despOperGrupos || []).map((g, i) => <option key={'g' + i} value={'g' + i}>↳ {limpaGrupo(g.grupo)}</option>)}
            </select>
          </div>
          {(() => {
            const sel = linhaSel[0] === 'g'
              ? { nome: limpaGrupo((d.despOperGrupos[Number(linhaSel.slice(1))] || {}).grupo), cor: '#B23', valores: (d.despOperGrupos[Number(linhaSel.slice(1))] || {}).valores || [] }
              : (() => { const L = LINHAS_DRE.find(l => l[0] === linhaSel) || LINHAS_DRE[6]; return { nome: L[1], cor: L[2], valores: d[L[0]] || [] }; })();
            return <GraficoLinhas series={[sel]} meses={MESAB} />;
          })()}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #eee', borderRadius: 10 }}>
          <thead><tr><th style={{ ...cth, textAlign: 'left', position: 'sticky', left: 0, background: '#fff', width: 200 }}>DRE {ano}</th>{MESAB.map((m, i) => <th key={i} style={cth}>{m}</th>)}<th style={{ ...cth, borderLeft: '1px solid #eee' }}>Ano</th></tr></thead>
          <tbody>
            {linha('(+) Receita Bruta', d.receitaBruta, { forte: true, cor: '#1E7A46' })}
            {linha('(−) Deduções', d.deducoes.map(v => -v), { neg: true, ind: true })}
            {linha('(=) Receita Líquida', d.receitaLiquida, { forte: true })}
            {linha('(−) CMV (custo real)', d.cmv.map(v => -v), { neg: true, ind: true })}
            {linha('(=) Lucro Bruto', d.lucroBruto, { forte: true })}
            <tr style={{ borderTop: '2px solid #ddd', background: '#FAFAFA' }}><td colSpan={14} style={{ ...cc, width: 'auto', fontWeight: 700, cursor: 'pointer' }} onClick={() => setAberto(a => !a)}>{aberto ? '▾' : '▸'} (−) Despesas Operacionais <span style={{ color: '#999', fontWeight: 400 }}>({d.despOperGrupos.length} grupos)</span></td></tr>
            {aberto && d.despOperGrupos.map(g => linha(limpaGrupo(g.grupo), g.valores.map(v => -v), { neg: true, ind: true }))}
            {linha('Total Desp. Operacionais', d.despOperTotal.map(v => -v), { cor: '#B23' })}
            {linha('(=) Resultado Operacional', d.resultadoOper, { forte: true })}
            {soma(d.financeiras) > 0 && linha('(−) Desp. Financeiras', d.financeiras.map(v => -v), { neg: true, ind: true })}
            {linha('(=) Resultado antes do IR', d.resultadoAntesIR || d.resultadoOper, { forte: true })}
            {soma(d.irCsll) > 0 && linha('(−) IRPJ / CSLL', (d.irCsll || []).map(v => -v), { neg: true, ind: true })}
            {linha('(=) RESULTADO LÍQUIDO', d.resultado, { forte: true, bg: '#EEF4FF' })}
            <tr style={{ background: '#EEF4FF' }}><td style={{ ...cc, fontWeight: 700, color: '#555' }}>Margem líquida %</td>{d.margem.map((v, i) => <td key={i} style={{ ...cn, color: v < 0 ? COR.vermelho : COR.verde, fontWeight: 700 }}>{v ? v + '%' : '—'}</td>)}<td style={{ ...cn, fontWeight: 800, borderLeft: '1px solid #eee' }}>{d.receitaBruta.reduce((a, b) => a + b, 0) ? Math.round(soma(d.resultado) / soma(d.receitaBruta) * 1000) / 10 + '%' : '—'}</td></tr>
          </tbody>
        </table>
        <div style={{ ...s.card, background: '#EAF3EC', borderColor: '#CFE6D6', fontSize: 11.5, color: '#2E6B45', marginTop: 8 }}>✅ <b>CMV real</b> = custo médio do item vendido × quantidade (via estoque), não as compras. As compras não entram na DRE (viram estoque). Deduções = imposto/tributo/Simples/devolução; ajuste as classificações no seu plano de contas.</div>
      </>}
    </div>
  );
}

function Confronto({ API, loja }) {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(''); // '' = ano todo
  const [d, setD] = useState(null); const [erro, setErro] = useState('');
  const [drill, setDrill] = useState(null); // {linha, label}
  const [conceito, setConceito] = useState('resultado');
  useEffect(() => { setD(null); setErro(''); API.get('/financeiro/demonstrativos', { params: { ano, loja: loja || undefined } }).then(r => { if (r.data.ok) setD(r.data); else setErro(r.data.erro); }).catch(e => setErro(e.response?.data?.erro || 'Falha.')); }, [API, ano, loja]);
  const dlp = d?.dlp, dfc = d?.dfc;
  const per = arr => !arr ? 0 : (mes === '' ? arr.reduce((a, b) => a + b, 0) : (arr[Number(mes)] || 0));
  const baseDlp = per(dlp?.vendaBruta), baseDfc = per(dfc?.receita);
  const pct = (v, base) => base ? (Math.round(v / base * 1000) / 10) + '%' : '—';
  const L = (label, val, opt = {}) => label == null ? null : { label, val, ...opt };
  // Pares ALINHADOS: cada linha da DFC na mesma altura do conceito equivalente na DRE.
  const pares = (dlp && dfc) ? [
    [L('Vendas Brutas', per(dlp.vendaBruta)), null],
    [L('(−) Descontos concedidos', -per(dlp.descontos), { neg: 1 }), null],
    [L('(=) Vendas Líquidas', per(dlp.vendaLiquida)), L('Receita recebida (líquida)', per(dfc.receita))],
    [L('(−) CMV', -per(dlp.cmv), { neg: 1 }), L('(−) Fornecedores pagos', -per(dfc.fornecedoresPagos), { neg: 1, drill: 'fornecedores' })],
    [L('(=) Lucro Bruto', per(dlp.lucroBruto), { forte: 1 }), L('(=) Lucro Bruto', per(dfc.lucroBruto), { forte: 1 })],
    [L('(−) Despesas Variáveis', -per(dlp.despVariaveis), { neg: 1, drill: 'variavel' }), L('(−) Despesas Variáveis pagas', -per(dfc.despVariaveis), { neg: 1, drill: 'variavel' })],
    [L('(=) Margem de Contribuição', per(dlp.margemContribuicao), { forte: 1 }), L('(=) Margem de Contribuição', per(dfc.margemContribuicao), { forte: 1 })],
    [L('(−) Despesas Fixas', -per(dlp.despFixas), { neg: 1, drill: 'fixa' }), L('(−) Despesas Fixas pagas', -per(dfc.despFixas), { neg: 1, drill: 'fixa' })],
    [L('(=) Lucro Operacional', per(dlp.lucroOperacional), { forte: 1 }), L('(=) Resultado Operacional', per(dfc.resultadoOperacional), { forte: 1 })],
    [L('(±) Não Operacional', per(dlp.receitaNaoOp) - per(dlp.despesaNaoOp), { neg: 1, drill: 'nao_op' }), L('(±) Não Operacional', per(dfc.receitaNaoOp) - per(dfc.despesaNaoOp), { neg: 1, drill: 'nao_op' })],
    [L('(−) IR/CSLL sobre o lucro', -per(dlp.irCsll), { neg: 1, drill: 'ircsll' }), L('(−) IR/CSLL pago', -per(dfc.irCsll), { neg: 1, drill: 'ircsll' })],
    [L('(=) Lucro Líquido', per(dlp.lucroLiquido), { forte: 1 }), L('(=) Resultado Ajustado', per(dfc.resultadoAjustado), { forte: 1 })],
  ] : [];
  const td = { padding: '3px 6px', whiteSpace: 'nowrap' };
  const celulas = (it, base, cor, lado) => {
    if (!it) return <><td style={td} /><td style={td} /><td style={td} /></>;
    const c = it.val < 0 ? COR.vermelho : (it.forte ? cor : '#444');
    const clic = it.drill ? () => setDrill({ linha: it.drill, label: it.label.replace(/^\([^)]*\)\s*/, '') }) : undefined;
    return <>
      <td onClick={clic} title={it.drill ? 'ver lançamentos' : undefined} style={{ ...td, fontWeight: it.forte ? 800 : (it.neg ? 400 : 600), color: it.forte ? cor : '#333', paddingLeft: it.neg ? 16 : 8, cursor: it.drill ? 'pointer' : 'default', textDecoration: it.drill ? 'underline dotted' : 'none' }}>{it.label}</td>
      <td onClick={clic} style={{ ...td, textAlign: 'right', color: c, fontWeight: it.forte ? 700 : 400, cursor: it.drill ? 'pointer' : 'default' }}>{brl(it.val)}</td>
      <td style={{ ...td, textAlign: 'right', color: c, fontWeight: it.forte ? 800 : 600, width: 40, fontSize: 11 }}>{pct(it.val, base)}</td>
    </>;
  };
  // Δ DRE×DFC: só o % (compacto), R$ no hover. Positivo = competência > caixa.
  const celDif = (p0, p1) => {
    if (!p0 || !p1) return <td style={{ ...td, borderLeft: '1px solid #eee' }} />;
    const a = Math.abs(p0.val), b = Math.abs(p1.val); const dif = a - b;
    const pctd = b ? Math.round(dif / b * 1000) / 10 : (a ? 100 : 0);
    const cor = Math.abs(pctd) < 5 ? '#999' : (Math.abs(pctd) > 40 ? COR.vermelho : '#B7791F');
    return <td title={a || b ? `${dif >= 0 ? '+' : ''}${brl(dif)}` : ''} style={{ ...td, textAlign: 'right', borderLeft: '1px solid #eee', color: cor, fontWeight: 700, width: 46, fontSize: 11 }}>{a || b ? `${pctd >= 0 ? '+' : ''}${pctd}%` : '—'}</td>;
  };
  const difLiq = per(dlp?.lucroLiquido) - per(dfc?.resultadoAjustado);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...s.inp, padding: '6px 8px' }}>{[anoAtual - 1, anoAtual, anoAtual + 1].map(a => <option key={a} value={a}>{a}</option>)}</select>
        <select value={mes} onChange={e => setMes(e.target.value)} style={{ ...s.inp, padding: '6px 8px' }}><option value="">Ano todo</option>{MESAB.map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
        <span style={{ fontSize: 11.5, color: '#888' }}>DRE (competência) e DFC (caixa) <b>alinhados linha a linha</b> — R$ e %. Receita Líquida ↔ Receita recebida, CMV ↔ Fornecedores pagos, Fixas ↔ Fixas…</span>
      </div>
      {erro && <div style={{ ...s.card, color: COR.vermelho }}>⚠️ {erro}</div>}
      {!d && !erro && <div style={s.card}>Carregando…</div>}
      {d && <>
        <div style={{ ...s.card, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>📈 Competência × Caixa no ano</span>
            <select value={conceito} onChange={e => setConceito(e.target.value)} style={{ ...s.inp, padding: '5px 8px' }}>
              {[['receita', 'Receita'], ['lucroBruto', 'Lucro Bruto'], ['margemContribuicao', 'Margem de Contribuição'], ['operacional', 'Resultado Operacional'], ['resultado', 'Resultado Líquido']].map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
            </select>
          </div>
          {(() => {
            const map = { receita: [dlp.vendaLiquida, dfc.receita], lucroBruto: [dlp.lucroBruto, dfc.lucroBruto], margemContribuicao: [dlp.margemContribuicao, dfc.margemContribuicao], operacional: [dlp.lucroOperacional, dfc.resultadoOperacional], resultado: [dlp.lucroLiquido, dfc.resultadoAjustado] };
            const [cA, cB] = map[conceito] || map.resultado;
            return <GraficoLinhas meses={MESAB} series={[{ nome: 'Competência (DRE)', cor: '#1E7A46', valores: cA || [] }, { nome: 'Caixa (DFC)', cor: '#2E5C9E', valores: cB || [] }]} />;
          })()}
        </div>
        <div style={{ ...s.card, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>
              <th colSpan={3} style={{ textAlign: 'left', color: '#1E7A46', fontWeight: 800, fontSize: 13, padding: '4px 10px', borderBottom: '2px solid #e0efe4' }}>📄 DRE / DLP — Competência</th>
              <th style={{ width: 18, borderBottom: 'none' }} />
              <th colSpan={3} style={{ textAlign: 'left', color: '#2E5C9E', fontWeight: 800, fontSize: 13, padding: '4px 10px', borderBottom: '2px solid #dbe6f5' }}>💵 DFC — Caixa</th>
              <th style={{ textAlign: 'right', color: '#B7791F', fontWeight: 800, fontSize: 12, padding: '4px 10px', borderBottom: '2px solid #f0e6cf', borderLeft: '1px solid #eee' }}>Δ DRE×DFC</th>
            </tr></thead>
            <tbody>{pares.map((p, i) => {
              const forte = p[0]?.forte || p[1]?.forte;
              return (
                <tr key={i} style={{ borderTop: forte ? '2px solid #e8e8e8' : '1px solid #f5f5f5', background: forte ? '#F6FAF7' : '#fff' }}>
                  {celulas(p[0], baseDlp, '#1E7A46', 'dre')}
                  <td style={{ borderLeft: '1px solid #eee' }} />
                  {celulas(p[1], baseDfc, '#2E5C9E', 'dfc')}
                  {celDif(p[0], p[1])}
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <div style={{ ...s.card, background: '#EEF4FF', borderColor: '#CFE0F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>⚖️ Diferença (Lucro Líquido DRE − Resultado Ajustado Caixa)</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: difLiq < 0 ? COR.vermelho : COR.verde }}>{brl(difLiq)} {baseDlp ? `· ${Math.round(difLiq / baseDlp * 1000) / 10}%` : ''}</span>
        </div>
        {dlp && (() => {
          const impLanc = per(dlp.impostosVar), impPrev = per(dlp.impostosVarPrev), difI = impPrev - impLanc;
          return (
            <div style={{ ...s.card, background: '#FBF7EE', borderColor: '#EADFC4', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
              <span style={{ fontWeight: 800, color: '#8A6D1F' }}>🧮 Impostos variáveis</span>
              <span>Lançado (a vencer/vencido): <b>{brl(impLanc)}</b></span>
              <span style={{ color: '#B7791F' }}>Previsto: <b>{brl(impPrev)}</b></span>
              <span style={{ color: difI > 0 ? COR.vermelho : COR.verde }}>Diferença: <b>{difI >= 0 ? '+' : ''}{brl(difI)}</b></span>
              <span style={{ fontSize: 11, color: '#999' }}>Por <b>vencimento</b> (a emissão do ICMS vem em bloco). Previsto = ICMS pela <b>média mensal</b> dos meses realizados + PIS/COFINS/ISS/Simples a <b>{dlp.aliquotaImpostos}%</b> × venda.</span>
            </div>
          );
        })()}
        <div style={{ ...s.card, background: '#F0F6FF', borderColor: '#CFE0F5', fontSize: 11.5, color: '#2E5C9E' }}>ℹ️ A diferença entre <b>competência</b> (DRE) e <b>caixa</b> (DFC) vem do tempo: cartão/crediário viram receita na DRE na hora mas entram no caixa depois; compras/despesas entram na DRE na emissão mas saem do caixa quando pagas. Clique numa linha de despesa pra ver os lançamentos dos dois lados e o que está só num deles.</div>
      </>}
      {drill && <DrillLinha API={API} loja={loja} ano={ano} mes={mes} linha={drill.linha} label={drill.label} onClose={() => setDrill(null)} />}
    </div>
  );
}

// Drill de uma linha do DRE×DFC. Por padrão mostra SÓ AS DIFERENÇAS (o que está de um lado e não do outro) —
// a soma disso é exatamente a diferença DRE×DFC. Toggle "ver todos" mostra tudo. Colunas ordenáveis.
const COLS_DL = [
  { k: 'fornecedor', label: 'Fornecedor', tipo: 'txt', get: x => x.fornecedor || '' },
  { k: 'plano', label: 'Plano', tipo: 'txt', get: x => x.plano || '' },
  { k: 'valor', label: 'Valor', tipo: 'num', right: true, get: x => x.valor || 0 },
];
function ListaDrill({ titulo, itens, sub }) {
  const { linhas, ordem, clicar, seta } = useOrdenavel(itens || [], COLS_DL, { col: 'valor', dir: 'desc' });
  const total = (itens || []).reduce((a, x) => a + (x.valor || 0), 0);
  return (
    <div style={{ flex: '1 1 340px', minWidth: 300 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 4 }}>{titulo} · <span style={{ color: '#B7791F' }}>{brl(total)}</span> <span style={{ color: '#aaa', fontWeight: 400 }}>· {(itens || []).length}</span></div>
      <div style={{ fontSize: 10.5, color: '#aaa', marginBottom: 4 }}>{sub}</div>
      <div style={{ maxHeight: '52vh', overflowY: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr>{COLS_DL.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={{ ...s.th, position: 'sticky', top: 0, background: '#fff' }} />)}</tr></thead>
          <tbody>
            {linhas.map(x => (
              <tr key={x.id} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={{ padding: '4px 8px', maxWidth: 180, whiteSpace: 'normal' }}>{x.fornecedor}</td>
                <td style={{ padding: '4px 8px', color: '#888', fontSize: 11 }}>{x.plano}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>{brl(x.valor)}</td>
              </tr>
            ))}
            {(!itens || itens.length === 0) && <tr><td colSpan={3} style={{ padding: 10, color: '#aaa', textAlign: 'center' }}>Nada aqui.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function DrillLinha({ API, loja, ano, mes, linha, label, onClose }) {
  const [dre, setDre] = useState(null); const [dfc, setDfc] = useState(null);
  const [todos, setTodos] = useState(false);
  useEffect(() => {
    const p = { ano, mes: mes === '' ? undefined : mes, linha, loja: loja || undefined };
    API.get('/financeiro/dlp-lancamentos', { params: { ...p, lado: 'dre' } }).then(r => setDre(r.data)).catch(() => setDre({ lancamentos: [] }));
    API.get('/financeiro/dlp-lancamentos', { params: { ...p, lado: 'dfc' } }).then(r => setDfc(r.data)).catch(() => setDfc({ lancamentos: [] }));
  }, [API, ano, mes, linha, loja]);
  const idsDre = new Set((dre?.lancamentos || []).map(x => x.id));
  const idsDfc = new Set((dfc?.lancamentos || []).map(x => x.id));
  const soDre = (dre?.lancamentos || []).filter(x => !idsDfc.has(x.id));
  const soDfc = (dfc?.lancamentos || []).filter(x => !idsDre.has(x.id));
  const netDif = soDre.reduce((a, x) => a + x.valor, 0) - soDfc.reduce((a, x) => a + x.valor, 0);
  const carregando = !dre || !dfc;
  return (
    <div onClick={onClose} style={s.overlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...s.modal, maxWidth: 900 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{label} · {mes === '' ? ano : `${MESAB[Number(mes)]}/${ano}`}</div>
          <button onClick={onClose} style={s.btnMini}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '6px 0 10px' }}>
          <span style={{ fontSize: 12, color: '#555' }}>Diferença DRE − Caixa: <b style={{ color: netDif >= 0 ? COR.verde : COR.vermelho }}>{netDif >= 0 ? '+' : ''}{brl(netDif)}</b></span>
          <button onClick={() => setTodos(t => !t)} style={{ ...s.chip, marginLeft: 'auto' }}>{todos ? 'ver só as diferenças' : 'ver todos'}</button>
        </div>
        {carregando ? <div style={{ fontSize: 13, color: '#888' }}>Carregando…</div> : (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {todos
              ? <><ListaDrill titulo="📄 Competência (emissão)" itens={dre.lancamentos} sub="tudo que foi emitido no período" /><ListaDrill titulo="💵 Caixa (pago)" itens={dfc.lancamentos} sub="tudo que foi pago no período" /></>
              : <><ListaDrill titulo="📄 Só na competência" itens={soDre} sub="emitido no mês, mas NÃO pago nele (ainda aberto ou pago depois)" /><ListaDrill titulo="💵 Só no caixa" itens={soDfc} sub="pago no mês, mas emitido em OUTRO mês" /></>}
          </div>
        )}
      </div>
    </div>
  );
}

const GRANS = [['semana', 'Semana'], ['mes', 'Mês'], ['trimestre', 'Trimestre'], ['semestre', 'Semestre']];
// Entrada informativa: patrocínio recebido nas ações de Marketing (não mexe no DRE/DFC do ERP).
function PatrocinioMkt({ API }) {
  const [d, setD] = useState(null); const [ab, setAb] = useState(false);
  const ano = new Date().getFullYear();
  useEffect(() => { API.get('/financeiro/patrocinio-mkt', { params: { ano } }).then(r => setD(r.data)).catch(() => {}); }, [API, ano]);
  if (!d || !d.total) return null;
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return (
    <div style={{ ...s.card, borderLeft: '4px solid #1E8449', background: '#F3FBF6', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>💰 Patrocínio recebido (Marketing) — {ano}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#1E8449', marginLeft: 'auto' }}>{brl(d.total)}</div>
        <button onClick={() => setAb(v => !v)} style={{ ...s.chip, marginLeft: 8 }}>{ab ? '−' : 'detalhar'}</button>
      </div>
      <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>Entrada de caixa vinda das ações de Marketing (informativo — não altera os números do DRE/DFC do ERP).</div>
      {ab && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {d.meses.map((v, i) => v > 0 && <span key={i} style={{ fontSize: 11, background: '#e3efe6', borderRadius: 6, padding: '2px 7px' }}>{MES[i]}: <b>{brl(v)}</b></span>)}
          </div>
          {d.itens.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '3px 0', borderBottom: '1px solid #eef3ef' }}>
              <span style={{ flex: 1 }}>{it.titulo}{it.patrocinador ? ` · ${it.patrocinador}` : ''}</span>
              <span style={{ color: '#888' }}>{String(it.data_ini).slice(0, 10).split('-').reverse().join('/')}</span>
              <span style={{ fontWeight: 700, color: '#1E8449' }}>{brl(it.patrocinio_valor)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FluxoCaixa({ API, loja }) {
  const [g, setG] = useState('mes');
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [drill, setDrill] = useState(null); // {grupo, periodo}
  const [aberto, setAberto] = useState({}); // categoria -> bool
  const [verAnteriores, setVerAnteriores] = useState(false); // por padrão abre já no período atual
  const carregar = useCallback(() => {
    setErro(''); setD(null);
    API.get('/financeiro/fluxo', { params: { loja: loja || undefined, g, hist: verAnteriores ? 12 : 1, proj: 3 } })
      .then(r => { if (r.data.erro) setErro(r.data.erro); else setD(r.data); }).catch(e => setErro(e.response?.data?.erro || 'Falha.'));
  }, [API, loja, g, verAnteriores]);
  useEffect(() => { carregar(); }, [carregar]);
  const [exportando, setExportando] = useState(false);
  const exportar = async () => {
    setExportando(true);
    try {
      const r = await API.get('/financeiro/fluxo/export', { params: { loja: loja || undefined, g, hist: 6, proj: 3 }, responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a'); a.href = url; a.download = `fluxo-caixa-${g}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { alert('Não consegui exportar agora.'); }
    setExportando(false);
  };

  // Estilos do fluxo — tamanho confortável (linhas um pouco justas, mas legíveis).
  const cpad = '4px 9px';
  const tdNc = { padding: cpad, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
  const tdCatc = { padding: cpad, fontSize: 12.5, position: 'sticky', left: 0, background: '#fff', whiteSpace: 'nowrap', zIndex: 1 };
  const secaoc = { padding: '4px 9px', fontSize: 11.5, fontWeight: 700, background: '#FAFAFA', color: '#555', letterSpacing: '.03em' };
  const thc = { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.02em', color: '#999', padding: '5px 9px', borderBottom: '2px solid #f0f0f0', whiteSpace: 'nowrap' };

  // Célula Previsão × Realizado: Realizado em cima (negrito), Previsão embaixo (menor) + Δ%.
  const brlK = v => (v ? brl(v) : '—');
  const cellPR = (prev, real, proj, extra = {}) => {
    const dif = (!proj && real != null && prev) ? Math.round((real - prev) / prev * 100) : null;
    return (
      <td style={{ ...tdNc, verticalAlign: 'top', ...(extra.style || {}) }} onClick={extra.onClick} title={extra.title}>
        <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.15, color: proj ? '#bbb' : (extra.cor || '#333') }}>{proj ? '—' : brlK(real)}</div>
        <div style={{ fontWeight: 400, fontSize: 13, lineHeight: 1.15, color: extra.prevCor || COR.vermelho }}>prev {brlK(prev)}{dif != null ? ` · ${dif >= 0 ? '+' : ''}${dif}%` : ''}</div>
      </td>
    );
  };
  // Semana/mês ATUAL = último período não-projetado (p/ destacar). Por padrão é a 1ª coluna.
  const atualIdx = d ? d.periodos.reduce((acc, p, i) => (p.projetado ? acc : i), -1) : -1;
  // Linha de grupo de despesa (reutilizada em Despesas e em Fornecedores/Compras).
  const linhaDesp = (l, i) => {
    const exp = !!aberto[l.categoria];
    const temFilhos = (l.filhos || []).length > 1;
    return (
      <React.Fragment key={'d' + i + l.categoria}>
        <tr style={{ borderTop: '1px solid #f5f5f5' }}>
          <td style={{ ...tdCatc, fontWeight: 600, cursor: temFilhos ? 'pointer' : 'default' }} onClick={() => temFilhos && setAberto(a => ({ ...a, [l.categoria]: !exp }))}>
            {temFilhos ? <span style={{ color: '#999', marginRight: 4 }}>{exp ? '▾' : '▸'}</span> : <span style={{ marginRight: 14 }} />}{l.categoria}
          </td>
          {l.valores.map((v, j) => cellPR(l.previsto[j], v, d.periodos[j].projetado, {
            onClick: () => v && !d.periodos[j].projetado && setDrill({ grupo: l.categoria, periodo: d.periodos[j] }),
            style: { cursor: v && !d.periodos[j].projetado ? 'pointer' : 'default' },
            title: 'clique p/ ver os lançamentos pagos',
          }))}
        </tr>
        {exp && (l.filhos || []).map((f, k) => (
          <tr key={'f' + k} style={{ background: '#FCFCFC' }}>
            <td style={{ ...tdCatc, paddingLeft: 26, fontSize: 10.5, color: '#666', background: '#FCFCFC' }}>↳ {f.plano}</td>
            {f.valores.map((v, j) => cellPR(f.previsto ? f.previsto[j] : null, v, d.periodos[j].projetado))}
          </tr>
        ))}
      </React.Fragment>
    );
  };

  return (
    <div>
      <PatrocinioMkt API={API} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: '#888' }}>Por:</span>
        {GRANS.map(([v, l]) => <button key={v} onClick={() => setG(v)} style={{ ...s.chip, ...(g === v ? s.chipOn : {}) }}>{l}</button>)}
        <button onClick={() => setVerAnteriores(v => !v)} style={{ ...s.chip, marginLeft: 8 }} title="mostrar/ocultar os períodos passados (à esquerda)">{verAnteriores ? '✕ Ocultar anteriores' : '◄ Ver anteriores'}</button>
        <button onClick={exportar} disabled={exportando || !d} style={{ ...s.chip, background: '#1D6F42', color: '#fff', borderColor: '#1D6F42', opacity: (exportando || !d) ? 0.6 : 1 }}>{exportando ? 'Gerando…' : '⬇ Exportar Excel'}</button>
        <span style={{ fontSize: 11.5, color: '#aaa', marginLeft: 8 }}>Cada célula: <b>Realizado</b> (cima) × <b>prev</b> (baixo). <span style={{ color: '#2e9c4e', fontWeight: 600 }}>coluna verde = período atual</span> · <b>*</b> = previsão (futuro). Receita prev = projeção · Crediário/Despesa prev = a receber/a pagar · Realizado despesa = pago.</span>
      </div>
      {erro && <div style={{ ...s.card, color: COR.vermelho }}>⚠️ {erro}</div>}
      {!d && !erro && <div style={s.card}>Calculando fluxo de caixa…</div>}
      {d && (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tab}>
            <thead>
              <tr>
                <th style={{ ...thc, textAlign: 'left', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>Categoria</th>
                {d.periodos.map((p, i) => {
                  const atual = i === atualIdx;
                  return (
                    <th key={i} style={{ ...thc, textAlign: 'right', background: p.projetado ? '#FAFAF5' : (atual ? '#EAF6EC' : '#fff'), color: atual ? '#1a7a3a' : undefined, borderBottom: atual ? '2px solid #2e9c4e' : thc.borderBottom }}>
                      {p.label}{p.projetado ? ' *' : atual ? ' •' : ''}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={d.periodos.length + 1} style={secaoc}>💚 RECEITAS</td></tr>
              {d.receitas.map((l, i) => (
                <tr key={'r' + i} style={{ borderTop: '1px solid #f5f5f5' }}>
                  <td style={{ ...tdCatc }}>{l.categoria}</td>
                  {l.valores.map((v, j) => cellPR(l.previsto[j], v, d.periodos[j].projetado, { prevCor: '#333' }))}
                </tr>
              ))}
              <tr style={s.totalRow}><td style={tdCatc}>Total de receitas</td>{d.totalReceita.map((v, j) => cellPR(d.totalReceitaPrev[j], v, d.periodos[j].projetado, { cor: COR.verde, prevCor: '#333' }))}</tr>

              {(() => {
                const ehForn = c => /cmv|compra|fornecedor/i.test(c || '');
                const totL = l => Math.abs((l.valores || []).reduce((a, b) => a + (Number(b) || 0), 0)); // soma do ano p/ ordenar
                const despLines = d.despesas.filter(l => !ehForn(l.categoria)).sort((a, b) => totL(b) - totL(a)); // maior → menor
                const fornLines = d.despesas.filter(l => ehForn(l.categoria)).sort((a, b) => totL(b) - totL(a));
                const somaCol = (lines, key, j) => lines.reduce((a, l) => a + ((l[key] || [])[j] || 0), 0);
                const totDespReal = d.periodos.map((_, j) => somaCol(despLines, 'valores', j));
                const totDespPrev = d.periodos.map((_, j) => somaCol(despLines, 'previsto', j));
                const totFornReal = d.periodos.map((_, j) => somaCol(fornLines, 'valores', j));
                const totFornPrev = d.periodos.map((_, j) => somaCol(fornLines, 'previsto', j));
                return (
                  <React.Fragment>
                    {fornLines.length > 0 && <>
                      <tr><td colSpan={d.periodos.length + 1} style={secaoc}>📦 FORNECEDORES / COMPRAS <span style={{ fontWeight: 400, color: '#999' }}>(CMV — custo de mercadoria)</span></td></tr>
                      {fornLines.map((l, i) => linhaDesp(l, 'f' + i))}
                      <tr style={s.totalRow}><td style={tdCatc}>Total fornecedores pagos</td>{totFornReal.map((v, j) => cellPR(totFornPrev[j], v, d.periodos[j].projetado, { cor: COR.vermelho }))}</tr>
                    </>}

                    <tr><td colSpan={d.periodos.length + 1} style={secaoc}>❤️ DESPESAS <span style={{ fontWeight: 400, color: '#999' }}>(maior → menor · sem fornecedores/compras · clique no grupo p/ detalhar · clique na célula p/ ver lançamentos)</span></td></tr>
                    {despLines.map((l, i) => linhaDesp(l, i))}
                    <tr style={s.totalRow}><td style={tdCatc}>Total de despesas</td>{totDespReal.map((v, j) => cellPR(totDespPrev[j], v, d.periodos[j].projetado, { cor: COR.vermelho }))}</tr>
                  </React.Fragment>
                );
              })()}

              <tr style={{ borderTop: '2px solid #333' }}><td style={{ ...tdCatc, fontWeight: 800 }}>SALDO (receita − despesa − fornecedores)</td>
                {d.saldo.map((v, j) => cellPR(d.saldoPrev ? d.saldoPrev[j] : null, v, d.periodos[j].projetado, { cor: v >= 0 ? COR.verde : COR.vermelho, prevCor: '#333' }))}</tr>
            </tbody>
          </table>
        </div>
      )}
      {drill && <DrillGrupo API={API} loja={loja} grupo={drill.grupo} periodo={drill.periodo} onClose={() => setDrill(null)} />}
    </div>
  );
}

const COLS_DRILL = [
  { k: 'venc', label: 'Venc.', get: x => x.vencimento || '', tipo: 'txt' },
  { k: 'forn', label: 'Fornecedor', get: x => x.fornecedor || '', tipo: 'txt' },
  { k: 'plano', label: 'Plano', get: x => x.plano || '', tipo: 'txt' },
  { k: 'loja', label: 'Loja', get: x => x.loja || '', tipo: 'txt' },
  { k: 'status', label: 'Status', get: x => x.status || '', tipo: 'txt' },
  { k: 'valor', label: 'Valor', get: x => x.valor || 0, tipo: 'num', right: true },
];
function DrillGrupo({ API, loja, grupo, periodo, base, onClose }) {
  const [l, setL] = useState(null);
  useEffect(() => { API.get('/financeiro/lancamentos-grupo', { params: { grupo, ini: periodo.ini, fim: periodo.fim, loja: loja || undefined, base: base || undefined } }).then(r => setL(r.data.lancamentos || [])).catch(() => setL([])); }, [API, grupo, periodo, loja, base]);
  const { linhas, ordem, clicar, seta } = useOrdenavel(l || [], COLS_DRILL, { col: 'valor', dir: 'desc' });
  const total = (l || []).reduce((a, x) => a + (x.valor || 0), 0);
  return (
    <div onClick={onClose} style={s.overlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...s.modal, maxWidth: 760 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{grupo} · {periodo.label}</div>
          <button onClick={onClose} style={s.btnMini}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: '#888', margin: '4px 0 10px' }}>{dataBR(periodo.ini)} a {dataBR(periodo.fim)} · {(l || []).length} lançamento(s) · total {brl(total)}</div>
        {!l && <div style={{ fontSize: 13, color: '#888' }}>Carregando…</div>}
        {l && (
          <div style={{ overflowX: 'auto', maxHeight: '60vh' }}>
            <table style={s.tab}>
              <thead><tr>{COLS_DRILL.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />)}</tr></thead>
              <tbody>
                {linhas.map(x => (
                  <tr key={x.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={s.td}>{dataBR(x.vencimento)}</td>
                    <td style={{ ...s.td, maxWidth: 200, whiteSpace: 'normal' }}>{x.fornecedor}</td>
                    <td style={{ ...s.td, fontSize: 12, color: '#777' }}>{x.plano}</td>
                    <td style={{ ...s.td, fontSize: 12 }}>{x.loja}</td>
                    <td style={s.td}><span style={{ fontSize: 11, color: x.status === 'Pago' ? COR.verde : COR.amarelo }}>{x.status}</span></td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{brl(x.valor)}</td>
                  </tr>
                ))}
                {linhas.length === 0 && <tr><td colSpan={6} style={{ ...s.td, color: '#aaa', textAlign: 'center' }}>Sem lançamentos.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const MESAB = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// 📉 Acompanhamento do orçamento (aba própria): visão SIMPLES por mês, com alerta de estouro e
// drill-down — clica no grupo e abre os subplanos pra ver de ONDE vem o estouro.
function AcompanhamentoOrcamento({ API, loja, lojas, setLoja }) {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [selMes, setSelMes] = useState(new Date().getMonth());
  const [open, setOpen] = useState({});
  const [justifs, setJustifs] = useState({}); // "grupoChave|mesNum" -> { texto, autor, atualizado_em }
  const [editJ, setEditJ] = useState(null);   // grupo chave em edição
  const [jtxt, setJtxt] = useState('');
  useEffect(() => { setD(null); setErro(''); setSelMes(ano === anoAtual ? new Date().getMonth() : 'ano');
    API.get('/financeiro/orcamento', { params: { ano, loja: loja || undefined } }).then(r => { if (r.data.erro) { setErro(r.data.erro); return; } setD(r.data); }).catch(() => setErro('Falha ao carregar.'));
  }, [API, ano, loja, anoAtual]);
  const carregarJustifs = React.useCallback(() => { API.get('/financeiro/orcamento/justificativas', { params: { ano, loja: loja || undefined } }).then(r => setJustifs(r.data.justificativas || {})).catch(() => {}); }, [API, ano, loja]);
  useEffect(() => { carregarJustifs(); }, [carregarJustifs]);
  const limpo = n => (n || '').replace(/^\d+\s*-\s*/, '');
  const mesesN = ano === anoAtual ? (new Date().getMonth() + 1) : 12;
  const perIni = selMes === 'ano' ? 0 : selMes;
  const perFim = selMes === 'ano' ? mesesN : selMes + 1;
  const mesNum = selMes === 'ano' ? 0 : selMes + 1; // 0 = ano acumulado; 1-12 = mês (p/ a justificativa)
  const salvarJustif = (chave) => { API.post('/financeiro/orcamento/justificativa', { loja: loja || '', ano, mes: mesNum, grupo: chave, texto: jtxt }).then(() => { setEditJ(null); setJtxt(''); carregarJustifs(); }).catch(() => {}); };
  const sliceSum = arr => (arr || []).slice(perIni, perFim).reduce((a, v) => a + (v || 0), 0);
  const grpOrcMes = (g, i) => ((g.direto || [])[i] || 0) + (g.filhos || []).reduce((a, f) => a + ((f.projetado || [])[i] || 0), 0);
  const grpRealMes = (g, i) => (g.filhos || []).reduce((a, f) => a + ((f.realizado || [])[i] || 0), 0);
  const periodo = fn => { let s = 0; for (let i = perIni; i < perFim; i++) s += fn(i); return s; };
  const grupos = (d ? d.despesas : []).map(g => {
    const orc = periodo(i => grpOrcMes(g, i)), real = periodo(i => grpRealMes(g, i));
    const filhos = (g.filhos || []).map(f => { const fo = sliceSum(f.projetado), fr = sliceSum(f.realizado); return { nome: limpo(f.nome || f.chave), orc: fo, real: fr, desvio: fr - fo, pct: fo ? Math.round((fr - fo) / fo * 1000) / 10 : null }; })
      .filter(x => x.orc > 0 || x.real > 0).sort((a, b) => b.desvio - a.desvio);
    return { chave: g.chave, nome: limpo(g.nome || g.chave), orc, real, desvio: real - orc, pct: orc ? Math.round((real - orc) / orc * 1000) / 10 : null, filhos };
  }).filter(x => x.orc > 0 || x.real > 0).sort((a, b) => b.desvio - a.desvio);
  const estouros = grupos.filter(x => x.desvio > 0);
  const totalEstouro = estouros.reduce((a, x) => a + x.desvio, 0);
  const maxAbs = Math.max(1, ...grupos.map(x => Math.abs(x.desvio)));
  const periodoLbl = selMes === 'ano' ? `no ano até ${MESAB[mesesN - 1]}` : `em ${MESAB[selMes]}/${String(ano).slice(2)}`;
  const nomeLoja = loja ? (lojas.find(l => l.id === loja)?.nome || '') : 'Rede (todas as lojas)';
  const linhaDesvio = (x, sub) => { const estourou = x.desvio > 0; const cor = estourou ? COR.vermelho : COR.verde; const w = Math.min(100, Math.abs(x.desvio) / maxAbs * 100); const expansivel = !sub && x.filhos && x.filhos.length > 0; const aberto = open[x.chave];
    const jKey = x.chave + '|' + mesNum; const jus = !sub ? justifs[jKey] : null; const editando = !sub && editJ === x.chave;
    return (
      <React.Fragment key={(sub ? 's-' : '') + (x.chave || x.nome)}>
        <tr onClick={expansivel ? () => setOpen(o => ({ ...o, [x.chave]: !o[x.chave] })) : undefined} style={{ borderTop: '1px solid #f4f6f8', cursor: expansivel ? 'pointer' : 'default', background: sub ? '#fbfcfd' : '#fff' }}>
          <td style={{ padding: sub ? '3px 8px 3px 26px' : '5px 8px', fontWeight: sub ? 400 : 600, color: sub ? '#64748b' : '#334', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }} title={x.nome}>
            {expansivel ? <span style={{ color: '#94a3b8', marginRight: 4 }}>{aberto ? '▾' : '▸'}</span> : sub ? '• ' : ''}{estourou ? '🔴' : '🟢'} {x.nome}
            {!sub && <button onClick={e => { e.stopPropagation(); setEditJ(editando ? null : x.chave); setJtxt(jus ? jus.texto : ''); }} title={jus ? 'Ver/editar justificativa' : 'Justificar este desvio'} style={{ marginLeft: 6, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, opacity: jus ? 1 : 0.5 }}>{jus ? '💬' : '💬＋'}</button>}
          </td>
          <td style={{ padding: '3px 8px', textAlign: 'right', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{brl(x.orc)}</td>
          <td style={{ padding: '3px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{brl(x.real)}</td>
          <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 700, color: cor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{estourou ? '+' : ''}{brl(x.desvio)}{x.pct != null ? <span style={{ fontWeight: 400, fontSize: 11 }}> ({estourou ? '+' : ''}{x.pct}%)</span> : null}</td>
          <td style={{ padding: '3px 8px', width: '24%' }}><div style={{ background: '#f1f5f9', borderRadius: 5, height: 10 }}><div style={{ width: w + '%', height: '100%', background: cor, borderRadius: 5 }} /></div></td>
        </tr>
        {!sub && (jus || editando) && (
          <tr style={{ background: '#FCFBF4' }}>
            <td colSpan={5} style={{ padding: '2px 8px 8px 24px' }}>
              {editando ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <textarea value={jtxt} onChange={e => setJtxt(e.target.value)} placeholder={`Por que ${x.nome} ${estourou ? 'estourou' : 'ficou assim'} ${periodoLbl}?`} rows={2} style={{ flex: 1, minWidth: 240, border: '1px solid #e3d9b0', borderRadius: 8, padding: '6px 9px', fontSize: 12.5, resize: 'vertical' }} />
                  <button onClick={() => salvarJustif(x.chave)} style={{ ...s.btnDark, padding: '6px 12px' }}>Salvar</button>
                  <button onClick={() => { setEditJ(null); setJtxt(''); }} style={{ ...s.btnMini }}>Cancelar</button>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#6b5d2e' }}><b>💬 Justificativa:</b> {jus.texto} <span style={{ color: '#a99', fontSize: 10.5 }}>— {jus.autor || '—'}{jus.atualizado_em ? ' · ' + String(jus.atualizado_em).slice(0, 10).split('-').reverse().join('/') : ''}</span></div>
              )}
            </td>
          </tr>
        )}
        {expansivel && aberto && x.filhos.map(f => linhaDesvio(f, true))}
      </React.Fragment>
    );
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...s.inp, padding: '6px 8px' }}>{[anoAtual - 1, anoAtual, anoAtual + 1].map(a => <option key={a} value={a}>{a}</option>)}</select>
        <select value={selMes} onChange={e => setSelMes(e.target.value === 'ano' ? 'ano' : Number(e.target.value))} style={{ ...s.inp, padding: '6px 8px' }}>
          {MESAB.slice(0, ano === anoAtual ? mesesN : 12).map((m, i) => <option key={i} value={i}>{m}/{String(ano).slice(2)}</option>)}
          <option value="ano">Ano (acumulado)</option>
        </select>
        <MultiLojaSelect lojas={lojas} value={loja} onChange={v => setLoja && setLoja(v)} compact />
        <span style={{ fontSize: 12, color: '#888' }}>{nomeLoja}</span>
      </div>
      {!d && !erro && <div style={s.card}>Carregando…</div>}
      {erro && <div style={{ ...s.card, color: COR.vermelho }}>⚠️ {erro}</div>}
      {d && (
        <div style={{ ...s.card, borderLeft: '4px solid ' + (estouros.length ? COR.vermelho : COR.verde) }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: estouros.length ? COR.vermelho : COR.verde }}>📉 Acompanhamento {periodoLbl}</span>
            {estouros.length
              ? <span style={{ fontSize: 12.5, color: '#64748b' }}><b style={{ color: COR.vermelho }}>{estouros.length} grupo(s) estourando</b> · <b style={{ color: COR.vermelho }}>{brl(totalEstouro)}</b> acima do orçado · {grupos.length - estouros.length} dentro ✓</span>
              : <span style={{ fontSize: 12.5, color: COR.verde, fontWeight: 600 }}>✓ Tudo dentro do orçamento ({grupos.length} grupos).</span>}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ color: '#94a3b8', fontSize: 11 }}>
                <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600 }}>Categoria <span style={{ fontWeight: 400 }}>(clique p/ ver subplanos)</span></th>
                <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>Orçado</th>
                <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>Realizado</th>
                <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>Desvio</th>
                <th style={{ padding: '4px 8px' }}></th>
              </tr></thead>
              <tbody>{grupos.map(g => linhaDesvio(g, false))}</tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>🔴 estourou · 🟢 dentro do orçado · {selMes === 'ano' ? 'acumulado do ano' : 'só o mês selecionado'}. <b>Clique num grupo</b> para abrir os subplanos e ver de onde vem o estouro.</div>
        </div>
      )}
    </div>
  );
}

function OrcamentoFin({ API, loja, lojas, setLoja }) {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [proj, setProj] = useState({}); // chave (receita/subplano) -> [12] editável
  const [projG, setProjG] = useState({}); // grupo -> [12] valor orçado direto no grupo (além dos subplanos)
  const [fator, setFator] = useState(5);
  const [msg, setMsg] = useState('');
  const [rateioOpen, setRateioOpen] = useState(false);
  const [aberto, setAberto] = useState({}); // grupo -> expandido
  const [distrib, setDistrib] = useState(null); // grupo aberto p/ dividir
  const carregar = useCallback(() => {
    setErro(''); setD(null); setMsg('');
    API.get('/financeiro/orcamento', { params: { ano, loja: loja || undefined } })
      .then(r => {
        if (r.data.erro) { setErro(r.data.erro); return; }
        setD(r.data);
        const p = {}, pg = {}; p[r.data.receita.chave] = [...r.data.receita.projetado];
        r.data.despesas.forEach(g => { pg[g.chave] = [...(g.direto || Array(12).fill(0))]; (g.filhos || []).forEach(f => { p[f.chave] = [...f.projetado]; }); });
        setProj(p); setProjG(pg);
      }).catch(e => setErro(e.response?.data?.erro || 'Falha.'));
  }, [API, ano, loja]);
  useEffect(() => { carregar(); }, [carregar]);

  const nomeLoja = loja ? (lojas.find(l => l.id === loja)?.nome || '') : 'Rede (soma das lojas)';
  const setCell = (chave, mi, v) => setProj(p => ({ ...p, [chave]: (p[chave] || Array(12).fill(0)).map((x, i) => i === mi ? (v === '' ? 0 : Number(v)) : x) }));
  const linhasDesp = d ? d.despesas : [];
  // soma dos subplanos (ao vivo do estado)
  const sumSub = g => { const out = Array(12).fill(0); (g.filhos || []).forEach(f => (proj[f.chave] || []).forEach((v, i) => out[i] += (v || 0))); return out; };
  // projetado do grupo = soma dos subplanos + valor orçado direto no grupo principal
  const projGrupo = g => { const sub = sumSub(g), dir = projG[g.chave] || []; return sub.map((v, i) => v + (dir[i] || 0)); };
  // editar o TOTAL do grupo principal → ajusta o "orçado direto" (total − soma dos subplanos)
  const setGrupoTotal = (g, mi, v) => { const val = v === '' ? 0 : Number(v); const sub = sumSub(g)[mi]; setProjG(pg => ({ ...pg, [g.chave]: (pg[g.chave] || Array(12).fill(0)).map((x, i) => i === mi ? Math.max(0, val - sub) : x) })); };
  // dividir o total do grupo entre os subplanos (proporcional ao realizado) e zerar o orçado direto
  const dividirInline = g => {
    const tot = projGrupo(g);
    const pesos = (g.filhos || []).map(f => (f.realizado || []).reduce((a, x) => a + x, 0));
    const soma = pesos.reduce((a, x) => a + x, 0);
    setProj(p => { const np = { ...p }; (g.filhos || []).forEach((f, idx) => { const w = soma > 0 ? pesos[idx] / soma : 1 / ((g.filhos || []).length || 1); np[f.chave] = tot.map(v => Math.round(v * w)); }); return np; });
    setProjG(pg => ({ ...pg, [g.chave]: Array(12).fill(0) }));
    setAberto(a => ({ ...a, [g.chave]: true }));
    setMsg('✅ Total do grupo distribuído nos subplanos — confira e clique Salvar.');
  };

  const salvar = () => {
    const cells = [];
    Object.entries(proj).forEach(([chave, arr]) => {
      const tipo = chave === (d.receita.chave) ? 'receita' : 'despesa';
      arr.forEach((v, i) => cells.push({ chave, tipo, mes: i + 1, valor: v }));
    });
    // valor orçado direto no grupo principal (chave = nome do grupo)
    Object.entries(projG).forEach(([chave, arr]) => arr.forEach((v, i) => cells.push({ chave, tipo: 'despesa', mes: i + 1, valor: v })));
    API.put('/financeiro/orcamento', { loja, ano, cells }).then(r => { setMsg(r.data.ok ? '✅ Orçamento salvo.' : ('⚠️ ' + r.data.erro)); carregar(); });
  };
  const [baseIni, setBaseIni] = useState(1);
  const [baseFim, setBaseFim] = useState(12);
  const [anoBase, setAnoBase] = useState(anoAtual);
  // Ano futuro não tem realizado ainda → por padrão usa o histórico do ano anterior como base.
  useEffect(() => { setAnoBase(ano > anoAtual ? ano - 1 : ano); }, [ano, anoAtual]);
  const gerar = () => {
    const mesesBase = []; for (let m = Math.min(baseIni, baseFim); m <= Math.max(baseIni, baseFim); m++) mesesBase.push(m);
    API.post('/financeiro/orcamento/gerar', { loja, ano, fatorPct: fator, mesesBase, anoBase })
      .then(r => {
        if (!r.data.ok) { setMsg('⚠️ ' + r.data.erro); return; }
        if (r.data.semBase) { setMsg(`⚠️ Sem realizado em ${anoBase} pra esta loja — nada a gerar. Escolha um ano-base com histórico.`); return; }
        setMsg(`✅ Gerado p/ ${ano} com base ${MESAB[mesesBase[0] - 1]}–${MESAB[mesesBase[mesesBase.length - 1] - 1]}/${anoBase} ${fator >= 0 ? '+' : ''}${fator}%.`); carregar();
      });
  };

  // Soma projetado/realizado do ano por linha.
  const somaP = arr => (arr || []).reduce((a, v) => a + (v || 0), 0);
  const somaR = arr => (arr || []).reduce((a, v) => a + (v || 0), 0);

  const linhaEl = (label, chave, realArr, tipo, bold) => {
    const p = proj[chave] || Array(12).fill(0);
    const tp = somaP(p), tr = somaR(realArr), varr = tr ? Math.round((tp - tr) / tr * 100) : null;
    return (
      <React.Fragment key={chave}>
        <tr style={{ borderTop: '1px solid #f0f0f0' }}>
          <td rowSpan={2} style={{ ...s.tdCat, fontWeight: bold ? 700 : 600, verticalAlign: 'middle' }}>{label}</td>
          <td style={s.miniLbl}>Proj.</td>
          {p.map((v, mi) => <td key={mi} style={s.tdN}>{d.editavel
            ? <input value={v || ''} onChange={e => setCell(chave, mi, e.target.value)} style={s.inpMini} />
            : brl(v)}</td>)}
          <td style={{ ...s.tdN, fontWeight: 700 }}>{brl(tp)}</td>
        </tr>
        <tr style={{ background: '#FCFCFC' }}>
          <td style={s.miniLbl}>Real.</td>
          {(realArr || []).map((v, mi) => <td key={mi} style={{ ...s.tdN, color: '#999', fontSize: 11.5 }}>{v ? brl(v) : '—'}</td>)}
          <td style={{ ...s.tdN, color: '#777', fontSize: 11.5 }}>{brl(tr)}{varr != null && <div style={{ color: (tipo === 'despesa' ? varr > 0 : varr < 0) ? COR.vermelho : COR.verde, fontWeight: 700, fontSize: 11 }}>{varr > 0 ? '+' : ''}{varr}%</div>}</td>
        </tr>
      </React.Fragment>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...s.inp, padding: '6px 8px' }}>
          {[anoAtual - 1, anoAtual, anoAtual + 1].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <MultiLojaSelect lojas={lojas} value={loja} onChange={v => setLoja && setLoja(v)} compact />
        {!loja && <span style={{ fontSize: 11, color: '#B7791F' }}>selecione a loja p/ editar o orçamento</span>}
        <button onClick={() => setRateioOpen(true)} style={s.btnMini}>⚖️ Rateio entre lojas</button>
        {d && d.editavel && (
          <>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>Base: ano</span>
            <select value={anoBase} onChange={e => setAnoBase(Number(e.target.value))} style={{ ...s.inp, padding: '5px' }} title="de qual ano puxar o histórico realizado como base">{[anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1].map(a => <option key={a} value={a}>{a}</option>)}</select>
            <select value={baseIni} onChange={e => setBaseIni(Number(e.target.value))} style={{ ...s.inp, padding: '5px' }}>{MESAB.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
            <span style={{ fontSize: 12, color: '#888' }}>a</span>
            <select value={baseFim} onChange={e => setBaseFim(Number(e.target.value))} style={{ ...s.inp, padding: '5px' }}>{MESAB.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
            <input type="number" value={fator} onChange={e => setFator(Number(e.target.value))} style={{ ...s.inp, width: 58 }} title="acréscimo/decréscimo %" />%
            <button onClick={gerar} style={{ ...s.btnMini }} title={`Gera o orçamento de ${ano} pela média do realizado de ${anoBase} (meses escolhidos) ${fator >= 0 ? '+' : ''}${fator}%`}>⚙️ Gerar</button>
            <button onClick={salvar} style={s.btnDark}>Salvar</button>
          </>
        )}
      </div>
      {!loja && <div style={{ ...s.card, background: '#FCF7EA', borderColor: '#F0E0BE', fontSize: 12.5, color: '#8A6D3B' }}>👉 Para <b>lançar/editar</b> o orçamento, escolha uma <b>loja</b> no seletor acima (o "Rede" é só a soma, leitura). Com a loja: digite na <b>Receita</b> e nas <b>despesas</b> — você pode orçar direto no <b>grupo principal</b> (linha em negrito) e usar <b>↧ dividir</b> para ratear nos subplanos, ou abrir o grupo (▸) e editar cada <b>subplano</b>. Depois clique <b>Salvar</b>.</div>}
      {loja && d && d.editavel && <div style={{ fontSize: 11.5, color: '#888', marginBottom: 8 }}>✏️ Editando <b>{nomeLoja}</b> — edite tanto os <b>grupos principais</b> (negrito) quanto os <b>subplanos</b> (abra com ▸). O <b>↧ dividir</b> distribui o total do grupo entre os subplanos. Não esqueça de <b>Salvar</b>.</div>}
      {msg && <div style={{ ...s.card, background: '#EAF3EC', borderColor: '#CFE6D6', fontSize: 12.5, color: '#2E6B45' }}>{msg}</div>}
      {erro && <div style={{ ...s.card, color: COR.vermelho }}>⚠️ {erro}</div>}
      {!d && !erro && <div style={s.card}>Carregando…</div>}
      {d && (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tab}>
            <thead><tr>
              <th style={{ ...s.th, textAlign: 'left', position: 'sticky', left: 0, background: '#fff' }}>Categoria</th>
              <th style={s.th}></th>
              {MESAB.map((m, i) => <th key={i} style={{ ...s.th, textAlign: 'right' }}>{m}</th>)}
              <th style={{ ...s.th, textAlign: 'right' }}>Ano</th>
            </tr></thead>
            <tbody>
              <tr><td colSpan={15} style={s.secao}>💚 RECEITA</td></tr>
              {linhaEl(d.receita.label, d.receita.chave, d.receita.realizado, 'receita', true)}
              <tr><td colSpan={15} style={s.secao}>❤️ DESPESAS <span style={{ fontWeight: 400, color: '#999' }}>(clique no grupo para abrir os subplanos)</span></td></tr>
              {linhasDesp.map(g => {
                const exp = !!aberto[g.chave]; const pg = projGrupo(g); const temFilhos = (g.filhos || []).length >= 1;
                const tp = pg.reduce((a, v) => a + v, 0), tr = g.realizado.reduce((a, v) => a + v, 0), varr = tr ? Math.round((tp - tr) / tr * 100) : null;
                return (
                  <React.Fragment key={g.chave}>
                    <tr style={{ borderTop: '2px solid #eee' }}>
                      <td rowSpan={2} style={{ ...s.tdCat, fontWeight: 700, verticalAlign: 'middle', cursor: temFilhos ? 'pointer' : 'default' }} onClick={() => temFilhos && setAberto(a => ({ ...a, [g.chave]: !exp }))}>
                        {temFilhos ? <span style={{ color: '#999', marginRight: 4 }}>{exp ? '▾' : '▸'}</span> : ''}{g.label}
                        {d.editavel && temFilhos && <button onClick={e => { e.stopPropagation(); dividirInline(g); }} title="dividir o total do grupo entre os subplanos" style={{ ...s.btnMini, marginLeft: 6, padding: '2px 6px', fontSize: 10 }}>↧ dividir</button>}
                      </td>
                      <td style={s.miniLbl}>Proj.</td>
                      {pg.map((v, mi) => <td key={mi} style={{ ...s.tdN, fontWeight: 600 }}>{d.editavel
                        ? <input value={v || ''} onChange={e => setGrupoTotal(g, mi, e.target.value)} style={s.inpMini} title="total do grupo (edite aqui e use ↧ dividir)" />
                        : (v ? brl(v) : '—')}</td>)}
                      <td style={{ ...s.tdN, fontWeight: 700 }}>{brl(tp)}</td>
                    </tr>
                    <tr style={{ background: '#FCFCFC' }}>
                      <td style={s.miniLbl}>Real.</td>
                      {g.realizado.map((v, mi) => <td key={mi} style={{ ...s.tdN, color: '#999', fontSize: 11.5 }}>{v ? brl(v) : '—'}</td>)}
                      <td style={{ ...s.tdN, color: '#777', fontSize: 11.5 }}>{brl(tr)}{varr != null && <div style={{ color: varr > 0 ? COR.vermelho : COR.verde, fontWeight: 700, fontSize: 11 }}>{varr > 0 ? '+' : ''}{varr}%</div>}</td>
                    </tr>
                    {exp && (g.filhos || []).map(f => linhaEl('↳ ' + f.label, f.chave, f.realizado, 'despesa'))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rateioOpen && d && <RateioModal API={API} ano={ano} despesas={d.despesas} onClose={() => setRateioOpen(false)} onSaved={carregar} />}
      {distrib && <DistribuirGrupoModal API={API} loja={loja} ano={ano} grupo={distrib} onClose={() => setDistrib(null)} onSaved={carregar} />}
    </div>
  );
}

function RateioModal({ API, ano, despesas, onClose, onSaved }) {
  const [lojas, setLojas] = useState([]);
  const [rateio, setRateio] = useState({});
  const [sel, setSel] = useState(''); // chave selecionada
  const [lojasSel, setLojasSel] = useState([]);
  const [criterio, setCriterio] = useState('igual');
  const [valorMes, setValorMes] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/financeiro/orcamento/rateio').then(r => { setLojas(r.data.lojas || []); setRateio(r.data.rateio || {}); }).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const abrir = ch => { setSel(ch); const c = rateio[ch]; setLojasSel(c ? c.lojas : lojas.map(l => l.id)); setCriterio(c ? c.criterio : 'igual'); setValorMes(''); };
  const toggleLoja = id => setLojasSel(x => x.includes(id) ? x.filter(y => y !== id) : [...x, id]);
  const distribuir = () => {
    if (!sel || !lojasSel.length || !valorMes) { setMsg('Escolha o plano, as lojas e um valor mensal.'); return; }
    API.post('/financeiro/orcamento/ratear', { ano, chave: sel, tipo: 'despesa', valores: Number(valorMes), criterio, lojas: lojasSel })
      .then(r => { setMsg(r.data.ok ? `✅ R$ ${Number(valorMes).toLocaleString('pt-BR')}/mês rateado entre ${lojasSel.length} loja(s).` : ('⚠️ ' + r.data.erro)); carregar(); onSaved && onSaved(); });
  };
  return (
    <div onClick={onClose} style={s.overlay}>
      <div onClick={e => e.stopPropagation()} style={s.modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>⚖️ Rateio de planos entre lojas — {ano}</div>
          <button onClick={onClose} style={s.btnMini}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Escolha um plano de contas que é <b>central</b> (ex.: contabilidade, marketing) e distribua o valor entre as lojas que compõem o rateio.</div>
        <div style={{ display: 'grid', gap: 8 }}>
          <select value={sel} onChange={e => abrir(e.target.value)} style={s.inp}>
            <option value="">Selecione o plano de contas…</option>
            {despesas.map(d => <option key={d.chave} value={d.chave}>{d.label}{rateio[d.chave] ? ` · rateado (${rateio[d.chave].lojas.length} lojas)` : ''}</option>)}
          </select>
          {sel && (
            <>
              <div style={{ fontSize: 12, color: '#888' }}>Lojas do rateio:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {lojas.map(l => <button key={l.id} onClick={() => toggleLoja(l.id)} style={{ ...s.chip, ...(lojasSel.includes(l.id) ? s.chipOn : {}) }}>{l.nome}</button>)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: '#888' }}>Critério
                  <select value={criterio} onChange={e => setCriterio(e.target.value)} style={{ ...s.inp, marginLeft: 4 }}>
                    <option value="igual">Igual entre as lojas</option>
                    <option value="faturamento">Proporcional ao faturamento</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, color: '#888' }}>Valor mensal (central) R$
                  <input type="number" value={valorMes} onChange={e => setValorMes(e.target.value)} style={{ ...s.inp, width: 120, marginLeft: 4 }} /></label>
                <button onClick={distribuir} style={s.btnDark}>Distribuir nas lojas</button>
              </div>
            </>
          )}
          {msg && <div style={{ fontSize: 12.5, color: msg[0] === '✅' ? '#2E6B45' : '#C0392B' }}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}

function DistribuirGrupoModal({ API, loja, ano, grupo, onClose, onSaved }) {
  const [valorMes, setValorMes] = useState('');
  const [criterio, setCriterio] = useState('realizado');
  const [msg, setMsg] = useState('');
  const distribuir = () => {
    if (!loja) { setMsg('Selecione uma loja no topo para editar.'); return; }
    if (!valorMes) { setMsg('Informe o valor mensal do grupo.'); return; }
    API.post('/financeiro/orcamento/distribuir-grupo', { loja, ano, grupo: grupo.chave, valores: Number(valorMes), criterio })
      .then(r => { setMsg(r.data.ok ? `✅ R$ ${Number(valorMes).toLocaleString('pt-BR')}/mês dividido em ${r.subplanos || grupo.filhos.length} subplanos.` : ('⚠️ ' + r.data.erro)); onSaved && onSaved(); });
  };
  return (
    <div onClick={onClose} style={s.overlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...s.modal, maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>÷ Orçar grupo e dividir nos subplanos</div>
          <button onClick={onClose} style={s.btnMini}>✕</button>
        </div>
        <div style={{ fontSize: 12.5, color: '#666', marginBottom: 10 }}><b>{grupo.label}</b> — {grupo.filhos.length} subplanos. Informe o valor mensal do grupo; o sistema divide entre os subplanos.</div>
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#888' }}>Critério de divisão
            <select value={criterio} onChange={e => setCriterio(e.target.value)} style={{ ...s.inp, marginLeft: 4 }}>
              <option value="realizado">Proporcional ao realizado</option>
              <option value="igual">Igual entre os subplanos</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: '#888' }}>Valor mensal do grupo R$
            <input type="number" value={valorMes} onChange={e => setValorMes(e.target.value)} style={{ ...s.inp, width: 140, marginLeft: 4 }} /></label>
          <button onClick={distribuir} style={s.btnDark}>Dividir nos subplanos</button>
          {msg && <div style={{ fontSize: 12.5, color: msg[0] === '✅' ? '#2E6B45' : '#C0392B' }}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}

// 📦 Eficiência de estoque por loja: valor, cobertura, ruptura, curva ABC, excesso, produtos parados.
const IND_EST = [
  { key: 'valor_estoque', label: 'Valor em estoque', fmt: 'money' },
  { key: 'posicoes', label: 'Posições (SKUs)', fmt: 'int' },
  { key: 'cobertura_dias', label: 'Cobertura (dias)', fmt: 'int', sem: 'cobertura_sem' },
  { key: 'giro', label: 'Giro de estoque (x/ano)', fmt: 'int' },
  { key: 'ruptura_pct', label: 'Ruptura %', fmt: 'pct', sem: 'ruptura_sem' },
  { key: 'excesso', label: 'Excesso de estoque', fmt: 'money', ruim: v => v > 0 },
  { key: 'abc_a_pct', label: 'Curva A (% valor)', fmt: 'pct' },
  { key: 'abc_b_pct', label: 'Curva B (% valor)', fmt: 'pct' },
  { key: 'abc_c_pct', label: 'Curva C (% valor)', fmt: 'pct' },
  { key: 'abc_d_pct', label: 'Curva D — parado (% valor)', fmt: 'pct', ruim: v => v > 15 },
  { key: 'parados_valor', label: 'Produtos novos parados (R$)', fmt: 'money', ruim: v => v > 0 },
  { key: 'tempo_entrada', label: 'Tempo médio de entrada (dias)', fmt: 'int', ruim: v => v > 3 },
];
function EficienciaEstoque({ API }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); API.get('/financeiro/eficiencia-estoque').then(r => setD(r.data)).catch(() => setD({ erro: 1 })); }, [API]);
  const ls = (d?.lojas || []).filter(l => l.erp && l.posicoes > 0);
  const tdR = { padding: '6px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
  const thC = (al) => ({ textAlign: al, padding: '8px 10px', background: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: 11.5, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap', position: 'sticky', top: 0 });
  const semCor = s => s === 'verde' ? COR.verde : s === 'amarelo' ? '#B7791F' : s === 'vermelho' ? COR.vermelho : '#334';
  const ABC = [['abc_a_pct', '#0E7C5A', 'A'], ['abc_b_pct', '#2E9E6B', 'B'], ['abc_c_pct', '#C9A227', 'C'], ['abc_d_pct', '#B23A48', 'D']];
  return (
    <div>
      {!d && <div style={s.card}>Carregando estoque de todas as lojas… (puxa do ERP, pode levar alguns segundos)</div>}
      {d && d.erro && <div style={{ ...s.card, color: COR.vermelho }}>ERP indisponível.</div>}
      {d && !d.erro && <>
        <div style={{ ...s.card, marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🅰️ Curva ABC por loja (% do valor em estoque)</div>
          {ls.map(l => (
            <div key={l.loja_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span style={{ width: 150, fontSize: 12, color: '#444', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.loja}</span>
              <div style={{ flex: 1, display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', minWidth: 200, border: '1px solid #eef1f4' }}>
                {ABC.map(([key, cor, lbl]) => { const w = l[key] || 0; return w > 0 ? <div key={key} title={`Curva ${lbl}: ${w}%`} style={{ width: w + '%', background: cor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 700 }}>{w >= 8 ? lbl : ''}</div> : null; })}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', fontSize: 11, color: '#64748b' }}>
            {ABC.map(([, cor, lbl]) => <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: cor }} />Curva {lbl}{lbl === 'D' ? ' (sem venda — parado)' : ''}</span>)}
          </div>
        </div>
        <div style={{ ...s.card, overflowX: 'auto' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📦 Indicadores de estoque × lojas</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>
              <th style={{ ...thC('left'), left: 0, zIndex: 2 }}>Indicador</th>
              {ls.map(l => <th key={l.loja_id} style={thC('right')}>{l.loja}</th>)}
            </tr></thead>
            <tbody>{IND_EST.map(ind => (
              <tr key={ind.key}>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: 600, position: 'sticky', left: 0, background: '#fff', whiteSpace: 'nowrap' }}>{ind.label}</td>
                {ls.map(l => { const v = l[ind.key]; const cor = ind.sem ? semCor(l[ind.sem]) : (ind.ruim && ind.ruim(v) ? COR.vermelho : '#334'); return (
                  <td key={l.loja_id} style={{ ...tdR, color: cor, fontWeight: (ind.sem || ind.ruim) ? 700 : 500 }} title={fmtVal(ind.fmt, v)}>{fmtComp(ind.fmt, v)}</td>
                ); })}
              </tr>
            ))}</tbody>
          </table>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Cobertura = dias de estoque · Ruptura = itens com venda mas sem saldo · Curva D = produtos sem venda (estoque parado) · Excesso = acima do alvo de orçamento de estoque.</div>
        </div>
      </>}
    </div>
  );
}

// Aba "Eficiência de loja": representatividade (plano de contas × mercado) + venda por colaborador.
function EficienciaLoja({ API, loja }) {
  // "Venda por colaborador" foi pra aba 👥 Por colaborador. Aqui fica só a Representatividade × mercado.
  return <Representatividade API={API} loja={loja} />;
}

// Faturamento da loja ÷ vendedores → média que cada um deveria vender e quem está abaixo.
function VendaPorColaborador({ API, loja, setLoja, lojas }) {
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(String(new Date().getMonth() + 1)); // default mês atual
  const [d, setD] = useState(null); const [erro, setErro] = useState('');
  const carregar = useCallback(() => {
    setErro(''); setD(null);
    API.get('/financeiro/venda-colaborador', { params: { ano, mes: mes || undefined, loja: loja || undefined } })
      .then(r => { if (r.data.erro) setErro(r.data.erro); else if (!r.data.ok) setErro('Sem dados no período.'); else setD(r.data); })
      .catch(e => setErro(e.response?.data?.erro || 'Falha.'));
  }, [API, ano, mes, loja]);
  useEffect(() => { carregar(); }, [carregar]);
  return (
    <div>
      <div style={{ ...s.card, background: '#F4F8FC', borderColor: '#DCE9F5', fontSize: 12.5, color: '#33506B' }}>
        👥 Faturamento da loja <b>÷ nº de vendedores</b> = a <b>média que cada colaborador deveria vender</b>. Quem está <b style={{ color: COR.vermelho }}>abaixo da média</b> aparece marcado. Vendedor = quem atendeu (não o caixa).
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {setLoja && (
          <select value={loja || ''} onChange={e => setLoja(e.target.value)} style={{ ...s.inp, padding: '6px 8px' }}>
            <option value="">🏬 Rede (todas as lojas)</option>
            {(lojas || []).map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        )}
        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...s.inp, padding: '6px 8px' }}>{[anoAtual - 1, anoAtual].map(a => <option key={a} value={a}>{a}</option>)}</select>
        <select value={mes} onChange={e => setMes(e.target.value)} style={{ ...s.inp, padding: '6px 8px' }}>
          <option value="">Ano (acumulado)</option>
          {MES.map((m, i) => <option key={i} value={i + 1}>{m}/{ano}</option>)}
        </select>
      </div>
      {erro && <div style={{ ...s.card, color: COR.vermelho }}>⚠️ {erro}</div>}
      {!d && !erro && <div style={s.card}>Analisando…</div>}
      {d && d.lojas.length === 0 && <div style={s.card}>Sem vendas no período.</div>}
      {d && d.lojas.map(L => <LojaEficiencia key={L.lojaId} L={L} />)}
    </div>
  );
}

function LojaEficiencia({ L }) {
  const COLS = [
    { k: 'nome', label: 'Colaborador', tipo: 'txt', get: v => v.nome },
    { k: 'cupons', label: 'Cupons', tipo: 'num', right: true, get: v => v.cupons },
    { k: 'venda', label: 'Venda', tipo: 'num', right: true, get: v => v.venda },
    { k: 'pctMedia', label: '% da média', tipo: 'num', right: true, get: v => v.pctMedia || 0 },
    { k: 'status', label: 'Situação', tipo: 'num', right: true, get: v => (v.abaixo ? 0 : 1) },
  ];
  const { linhas, ordem, clicar, seta } = useOrdenavel(L.vendedores, COLS, { col: 'venda', dir: 'desc' });
  return (
    <div style={s.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>🏬 {L.loja}</div>
        <span style={{ fontSize: 12.5, color: '#555' }}>Faturamento <b>{brl(L.faturamento)}</b> · {L.nVendedores} vendedores</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, background: '#EEF4FB', color: '#2C5B8A', borderRadius: 8, padding: '4px 10px', fontWeight: 700 }}>Média por vendedor: {brl(L.media)}</span>
        <span style={{ fontSize: 12.5, background: L.abaixoCount ? '#FBEAEE' : '#EAF6EE', color: L.abaixoCount ? COR.vermelho : COR.verde, borderRadius: 8, padding: '4px 10px', fontWeight: 700 }}>{L.abaixoCount} abaixo da média</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={s.tab}>
          <thead><tr>{COLS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />)}</tr></thead>
          <tbody>
            {linhas.map((v, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f2f2f2', background: v.abaixo ? '#FDF3F4' : '#fff' }}>
                <td style={{ ...s.tdCat, fontWeight: 600 }}>{v.abaixo ? '🔻' : '✅'} {v.nome}</td>
                <td style={s.tdN}>{v.cupons}</td>
                <td style={{ ...s.tdN, fontWeight: 700 }}>{brl(v.venda)}</td>
                <td style={{ ...s.tdN, color: v.abaixo ? COR.vermelho : COR.verde, fontWeight: 700 }}>{v.pctMedia != null ? v.pctMedia + '%' : '—'}</td>
                <td style={{ ...s.tdN, color: v.abaixo ? COR.vermelho : COR.verde }}>{v.abaixo ? 'abaixo' : 'na média+'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Análise vertical: cada linha como % do faturamento bruto × benchmark do mercado farma (editável).
function Representatividade({ API, loja }) {
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(''); // '' = ano acumulado
  const [nivel, setNivel] = useState(2); // 2 = plano principal · 3 = subplano
  const [d, setD] = useState(null); const [erro, setErro] = useState('');
  const [bm, setBm] = useState({}); // chave -> valor sendo digitado
  const carregar = useCallback(() => {
    setErro(''); setD(null);
    API.get('/financeiro/representatividade', { params: { ano, mes: mes || undefined, loja: loja || undefined, nivel } })
      .then(r => { if (r.data.erro) setErro(r.data.erro); else if (!r.data.ok) setErro('Sem dados no período.'); else setD(r.data); })
      .catch(e => setErro(e.response?.data?.erro || 'Falha.'));
  }, [API, ano, mes, loja, nivel]);
  useEffect(() => { carregar(); }, [carregar]);
  const salvarBm = (chave, valor) => API.put('/financeiro/representatividade/benchmark', { chave, valor: valor === '' ? null : Number(valor) }).then(carregar);

  const semColor = { verde: COR.verde, amarelo: COR.amarelo, vermelho: COR.vermelho, cinza: '#bbb' };
  const pctFmt = v => v == null ? '—' : (v + '%');

  // Célula de benchmark editável + diferença com semáforo.
  const cellBench = (l) => {
    if (l.melhor == null) return (<><td style={s.tdN}>—</td><td style={s.tdN}>—</td></>);
    const val = bm[l.chave] != null ? bm[l.chave] : (l.benchmark != null ? l.benchmark : '');
    return (
      <>
        <td style={{ ...s.tdN }}>
          <input type="number" step="0.1" value={val}
            onChange={e => setBm(b => ({ ...b, [l.chave]: e.target.value }))}
            onBlur={e => salvarBm(l.chave, e.target.value)}
            onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
            style={{ width: 62, padding: '3px 5px', fontSize: 12, border: '1px solid #ddd', borderRadius: 6, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
          <span style={{ color: '#bbb', fontSize: 11 }}> %</span>
        </td>
        <td style={{ ...s.tdN }}>
          {l.diferenca == null ? '—' : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: semColor[l.semaforo] }} />
              <b style={{ color: semColor[l.semaforo] }}>{l.diferenca > 0 ? '+' : ''}{l.diferenca} p.p.</b>
            </span>
          )}
        </td>
      </>
    );
  };

  return (
    <div>
      <div style={{ ...s.card, background: '#F4F8FC', borderColor: '#DCE9F5', fontSize: 12.5, color: '#33506B' }}>
        📊 Quanto <b>cada linha representa sobre o faturamento bruto</b> e como isso se compara com o <b>mercado farma</b>. Os % de referência são <b>padrões editáveis</b> (típicos de drogaria) — ajuste na coluna <b>Mercado farma</b> conforme o seu instituto/consultor. Semáforo: 🟢 melhor que o mercado · 🟡 na média · 🔴 pior.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...s.inp, padding: '6px 8px' }}>{[anoAtual - 1, anoAtual].map(a => <option key={a} value={a}>{a}</option>)}</select>
        <select value={mes} onChange={e => setMes(e.target.value)} style={{ ...s.inp, padding: '6px 8px' }}>
          <option value="">Ano (acumulado)</option>
          {MES.map((m, i) => <option key={i} value={i + 1}>{m}/{ano}</option>)}
        </select>
        <div style={{ display: 'inline-flex', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
          {[[2, 'Plano principal'], [3, 'Subplano']].map(([v, l]) => (
            <button key={v} onClick={() => setNivel(v)} style={{ fontSize: 12, padding: '6px 12px', border: 'none', cursor: 'pointer', background: nivel === v ? '#1E3A5F' : '#fff', color: nivel === v ? '#fff' : '#666' }}>{l}</button>
          ))}
        </div>
        {d && <span style={{ fontSize: 12, color: '#888' }}>Faturamento bruto: <b>{brl(d.faturamento)}</b> · {d.periodoLabel}</span>}
      </div>
      {erro && <div style={{ ...s.card, color: COR.vermelho }}>⚠️ {erro}</div>}
      {!d && !erro && <div style={s.card}>Analisando…</div>}
      {d && (
        <div style={{ ...s.card, overflowX: 'auto' }}>
          <table style={s.tab}>
            <thead><tr>
              <th style={{ ...s.th, textAlign: 'left' }}>Linha</th>
              <th style={{ ...s.th, textAlign: 'right' }}>R$</th>
              <th style={{ ...s.th, textAlign: 'right' }}>% faturamento</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Mercado farma</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Diferença</th>
            </tr></thead>
            <tbody>
              {d.linhas.map(l => {
                const forte = l.tipo === 'base' || l.tipo === 'subtotal' || l.tipo === 'resultado';
                const neg = l.tipo === 'menos';
                return (
                  <tr key={l.chave} style={{ borderTop: forte ? '2px solid #e3e9f0' : '1px solid #f2f2f2', background: l.tipo === 'resultado' ? (l.valor >= 0 ? '#EAF6EE' : '#FBEAEE') : (l.tipo === 'subtotal' ? '#F7FAFC' : '#fff') }}>
                    <td style={{ ...s.tdCat, fontWeight: forte ? 800 : 600, paddingLeft: neg ? 22 : 10, color: forte ? '#1E3A5F' : '#444' }}>{neg ? '(−) ' : l.tipo === 'subtotal' ? '(=) ' : ''}{l.label}</td>
                    <td style={{ ...s.tdN, fontWeight: forte ? 700 : 400, color: l.valor < 0 ? COR.vermelho : '#333' }}>{brl(l.valor)}</td>
                    <td style={{ ...s.tdN, fontWeight: 700, color: l.tipo === 'resultado' ? (l.valor >= 0 ? COR.verde : COR.vermelho) : '#333' }}>{pctFmt(l.pct)}</td>
                    {cellBench(l)}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>Cada linha é um <b>{nivel === 3 ? 'subplano de contas' : 'plano de contas principal'}</b> do seu ERP como % do faturamento. Alterne <b>Plano principal / Subplano</b> no topo. Deixe o <b>Mercado farma</b> em branco nos que não quer comparar; CMV e Resultado já vêm com padrão editável.</div>
        </div>
      )}
    </div>
  );
}

function Reajustes({ API, loja }) {
  // Compara dois trimestres por padrão.
  const q = (m) => { const d = new Date(); d.setMonth(d.getMonth() - m); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
  const [p, setP] = useState({ iniA: q(6), fimA: q(3), iniB: q(3), fimB: q(0), minVar: 15 });
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const carregar = useCallback(() => {
    setErro(''); setD(null);
    API.get('/financeiro/reajustes', { params: { ...p, loja: loja || undefined } })
      .then(r => { if (r.data.erro) setErro(r.data.erro); else setD(r.data); }).catch(e => setErro(e.response?.data?.erro || 'Falha.'));
  }, [API, p, loja]);
  useEffect(() => { carregar(); }, [carregar]);
  const set = (k, v) => setP(x => ({ ...x, [k]: v }));
  const COLS = [
    { k: 'fornecedor', label: 'Fornecedor', tipo: 'txt', get: x => x.fornecedor },
    { k: 'plano', label: 'Plano', tipo: 'txt', get: x => x.plano },
    { k: 'mediaA', label: 'Média A', tipo: 'num', right: true, get: x => x.mediaA },
    { k: 'mediaB', label: 'Média B', tipo: 'num', right: true, get: x => x.mediaB },
    { k: 'variacao', label: 'Variação', tipo: 'num', right: true, get: x => x.variacao },
  ];
  const { linhas, ordem, clicar, seta } = useOrdenavel(d?.itens, COLS, { col: 'variacao', dir: 'desc' });

  return (
    <div>
      <div style={{ ...s.card, background: '#F4F8FC', borderColor: '#DCE9F5', fontSize: 12.5, color: '#33506B' }}>
        📈 Compara a <b>média mensal</b> de cada fornecedor/plano entre dois períodos para flagrar <b>reajustes</b> de despesa. CMV (compras) fica de fora — já é avaliado no Painel de Compras.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: '#888' }}>Período A</span>
        <input type="date" value={p.iniA} onChange={e => set('iniA', e.target.value)} style={s.inp} />
        <input type="date" value={p.fimA} onChange={e => set('fimA', e.target.value)} style={s.inp} />
        <span style={{ fontSize: 12, color: '#888' }}>vs B</span>
        <input type="date" value={p.iniB} onChange={e => set('iniB', e.target.value)} style={s.inp} />
        <input type="date" value={p.fimB} onChange={e => set('fimB', e.target.value)} style={s.inp} />
        <label style={{ fontSize: 12, color: '#888' }}>var. mín
          <select value={p.minVar} onChange={e => set('minVar', Number(e.target.value))} style={{ ...s.inp, marginLeft: 4 }}>
            {[5, 10, 15, 20, 30].map(x => <option key={x} value={x}>{x}%</option>)}
          </select>
        </label>
      </div>
      {erro && <div style={{ ...s.card, color: COR.vermelho }}>⚠️ {erro}</div>}
      {!d && !erro && <div style={s.card}>Analisando…</div>}
      {d && d.itens.length === 0 && <div style={s.card}>Nenhum reajuste acima do limite no período. 🎉</div>}
      {d && d.itens.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tab}>
            <thead><tr>{COLS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />)}</tr></thead>
            <tbody>
              {linhas.map((x, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ ...s.td, fontWeight: 600, maxWidth: 220, whiteSpace: 'normal' }}>{x.fornecedor}</td>
                  <td style={{ ...s.td, fontSize: 12, color: '#777' }}>{x.plano}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{brl(x.mediaA)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{brl(x.mediaB)}</td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: x.variacao > 0 ? COR.vermelho : COR.verde }}>
                    {x.variacao > 0 ? '▲' : '▼'} {Math.abs(x.variacao)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, cor = '#333' }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '10px 16px', minWidth: 150, flex: '1 1 150px' }}>
      <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '.03em' }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor, marginTop: 2 }}>{valor}</div>
    </div>
  );
}

// Aba "Lançamentos manuais" — lista/auditoria dos lançamentos da tela "Lançamento Financeiro" do A7.
const COLS_LM = [
  { k: 'data', label: 'Data', tipo: 'txt', get: x => x.data || '' },
  { k: 'loja', label: 'Loja', tipo: 'txt', get: x => x.loja || '' },
  { k: 'tipo', label: 'Tipo', tipo: 'txt', get: x => x.tipo || '' },
  { k: 'origem', label: 'Origem', tipo: 'txt', get: x => x.origem || '' },
  { k: 'grupo', label: 'Grupo', tipo: 'txt', get: x => x.grupo || '' },
  { k: 'plano', label: 'Plano', tipo: 'txt', get: x => x.plano || '' },
  { k: 'descricao', label: 'Descrição', tipo: 'txt', get: x => x.descricao || '' },
  { k: 'usuario', label: 'Usuário', tipo: 'txt', get: x => x.usuario || '' },
  { k: 'valor', label: 'Valor', tipo: 'num', right: true, get: x => x.valor || 0 },
];
function LancamentosManuais({ API, loja }) {
  const hoje = new Date();
  const [ini, setIni] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`);
  const [fim, setFim] = useState(hoje.toISOString().slice(0, 10));
  const [tipo, setTipo] = useState(''); const [busca, setBusca] = useState(''); const [extrato, setExtrato] = useState(false);
  const [d, setD] = useState(null); const [erro, setErro] = useState('');
  const addDia = st => { const dt = new Date(st + 'T00:00:00'); dt.setDate(dt.getDate() + 1); return dt.toISOString().slice(0, 10); };
  const carregar = useCallback(() => {
    setErro(''); setD(null);
    API.get('/financeiro/lancamentos-manuais', { params: { ini, fim: addDia(fim), loja: loja || undefined, tipo: tipo || undefined, busca: busca || undefined, extrato: extrato ? 1 : undefined } })
      .then(r => { if (r.data.erro) setErro(r.data.erro); else if (!r.data.ok) setErro('Sem dados.'); else setD(r.data); })
      .catch(e => setErro(e.response?.data?.erro || 'Falha.'));
  }, [API, ini, fim, loja, tipo, busca, extrato]);
  useEffect(() => { carregar(); }, [carregar]);
  const { linhas, ordem, clicar, seta } = useOrdenavel(d?.lancamentos || [], COLS_LM, { col: 'data', dir: 'desc' });
  const dataBRlm = s => String(s || '').slice(0, 10).split('-').reverse().join('/');
  const kpi = (t, v, c) => <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '8px 14px', minWidth: 120 }}><div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '.03em' }}>{t}</div><div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div></div>;
  return (
    <div>
      <div style={{ ...s.card, background: '#F4F8FC', borderColor: '#DCE9F5', fontSize: 12.5, color: '#33506B' }}>
        🧾 Todos os <b>lançamentos manuais</b> da tela "Lançamento Financeiro" do A7 (entradas e saídas digitadas, fora do contas a pagar). Marque <b>Incluir extrato</b> pra ver também os movimentos do banco.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: '#666' }}>De <input type="date" value={ini} onChange={e => setIni(e.target.value)} style={{ ...s.inp, padding: '5px 7px' }} /></label>
        <label style={{ fontSize: 12, color: '#666' }}>até <input type="date" value={fim} onChange={e => setFim(e.target.value)} style={{ ...s.inp, padding: '5px 7px' }} /></label>
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...s.inp, padding: '6px 8px' }}><option value="">Entradas + Saídas</option><option value="E">Só entradas</option><option value="S">Só saídas</option></select>
        <input placeholder="buscar (descrição/plano)" value={busca} onChange={e => setBusca(e.target.value)} style={{ ...s.inp, padding: '6px 8px', minWidth: 200 }} />
        <label style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={extrato} onChange={e => setExtrato(e.target.checked)} /> incluir extrato (banco)</label>
      </div>
      {erro && <div style={{ ...s.card, color: COR.vermelho }}>⚠️ {erro}</div>}
      {!d && !erro && <div style={s.card}>Carregando…</div>}
      {d && (<>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          {kpi('Lançamentos', d.n, '#333')}
          {kpi('Entradas', brl(d.entradas), COR.verde)}
          {kpi('Saídas', brl(d.saidas), COR.vermelho)}
          {kpi('Saldo', brl(d.saldo), d.saldo >= 0 ? COR.verde : COR.vermelho)}
        </div>
        <div style={{ ...s.card, overflowX: 'auto', maxHeight: '64vh' }}>
          <table style={s.tab}>
            <thead><tr>{COLS_LM.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={{ ...s.th, position: 'sticky', top: 0, background: '#fff' }} />)}</tr></thead>
            <tbody>
              {linhas.map(x => (
                <tr key={x.id} style={{ borderTop: '1px solid #f2f2f2' }}>
                  <td style={s.td}>{dataBRlm(x.data)}</td>
                  <td style={{ ...s.td, fontSize: 12 }}>{x.loja}</td>
                  <td style={{ ...s.td, fontSize: 11, color: x.valor >= 0 ? COR.verde : COR.vermelho }}>{x.tipo}</td>
                  <td style={{ ...s.td, fontSize: 11, color: '#888' }}>{x.origem}</td>
                  <td style={{ ...s.td, fontSize: 12 }}>{x.grupo}</td>
                  <td style={{ ...s.td, fontSize: 11, color: '#777' }}>{x.plano}</td>
                  <td style={{ ...s.td, maxWidth: 240, whiteSpace: 'normal', fontSize: 12 }}>{x.descricao}</td>
                  <td style={{ ...s.td, fontSize: 11, color: '#888' }}>{x.usuario}</td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: x.valor >= 0 ? COR.verde : COR.vermelho }}>{brl(x.valor)}</td>
                </tr>
              ))}
              {linhas.length === 0 && <tr><td colSpan={COLS_LM.length} style={{ ...s.td, textAlign: 'center', color: '#aaa' }}>Nenhum lançamento manual no período.</td></tr>}
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1360, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 12 },
  chip: { fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '6px 9px', fontSize: 13 },
  lbl: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#888' },
  btnMini: { fontSize: 12, padding: '5px 10px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
  btnDark: { fontSize: 13, padding: '7px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  miniLbl: { fontSize: 10, color: '#bbb', padding: '2px 6px', whiteSpace: 'nowrap' },
  inpMini: { width: 66, border: '1px solid #e0e0e0', borderRadius: 5, padding: '3px 5px', fontSize: 11.5, textAlign: 'right' },
  tab: { width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', border: '1px solid #eee', borderRadius: 10 },
  th: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em', color: '#999', padding: '9px 10px', borderBottom: '2px solid #f0f0f0', whiteSpace: 'nowrap' },
  td: { padding: '9px 10px', color: '#333' },
  tdN: { padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  tdCat: { padding: '7px 10px', fontSize: 12.5, position: 'sticky', left: 0, background: '#fff' },
  secao: { padding: '8px 10px', fontSize: 12, fontWeight: 700, background: '#FAFAFA', color: '#555', letterSpacing: '.03em' },
  totalRow: { borderTop: '1px solid #e5e5e5', background: '#FCFCFC' },
  tag: { fontSize: 10, background: '#EEF3F8', color: '#5A7186', borderRadius: 10, padding: '2px 6px', marginLeft: 6, fontWeight: 600 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: 18, width: '100%', maxHeight: '82vh', overflowY: 'auto' },
};
