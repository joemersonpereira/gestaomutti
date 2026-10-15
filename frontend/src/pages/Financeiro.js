import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';
import MultiLojaSelect from '../components/MultiLojaSelect';

const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const dataBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
const COR = { verde: '#1E874B', amarelo: '#B7791F', vermelho: '#C0392B' };
const hojeISO = () => new Date().toISOString().slice(0, 10);
const inicioMes = () => { const h = new Date(); return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`; };
const proxMes = () => { const h = new Date(); const d = new Date(h.getFullYear(), h.getMonth() + 1, 1); return d.toISOString().slice(0, 10); };

export default function Financeiro() {
  const { API } = useAuth();
  const [aba, setAba] = useState('fluxo');
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  useEffect(() => { API.get('/financeiro/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  return (
    <div style={s.wrap}>
      <Banner emoji="💼" titulo="Financeiro" cor="verde" sub="DFC / DRE, orçamento projetado × realizado e análise de despesas — geral e por loja." />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <MultiLojaSelect lojas={lojas} value={loja} onChange={setLoja} compact />
        {[['repr', '🏪 Eficiência de loja'], ['fluxo', '💵 Fluxo de caixa'], ['manuais', '🧾 Lançamentos manuais'], ['dre', '📄 DRE (fiscal)'], ['confronto', '⚖️ DRE × DFC'], ['orcamento', '🎯 Orçamento × realizado'], ['reajustes', '📈 Reajuste de despesas']].map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {aba === 'repr' && <EficienciaLoja API={API} loja={loja} setLoja={setLoja} lojas={lojas} />}
      {aba === 'fluxo' && <FluxoCaixa API={API} loja={loja} />}
      {aba === 'manuais' && <LancamentosManuais API={API} loja={loja} />}
      {aba === 'dre' && <DRE API={API} loja={loja} />}
      {aba === 'confronto' && <Confronto API={API} loja={loja} />}
      {aba === 'orcamento' && <OrcamentoFin API={API} loja={loja} lojas={lojas} setLoja={setLoja} />}
      {aba === 'reajustes' && <Reajustes API={API} loja={loja} />}
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
  useEffect(() => { setD(null); setErro(''); API.get('/financeiro/dre', { params: { ano, loja: loja || undefined } }).then(r => { if (r.data.ok) setD(r.data); else setErro(r.data.erro); }).catch(e => setErro(e.response?.data?.erro || 'Falha.')); }, [API, ano, loja]);
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
                const despLines = d.despesas.filter(l => !ehForn(l.categoria));
                const fornLines = d.despesas.filter(l => ehForn(l.categoria));
                const somaCol = (lines, key, j) => lines.reduce((a, l) => a + ((l[key] || [])[j] || 0), 0);
                const totDespReal = d.periodos.map((_, j) => somaCol(despLines, 'valores', j));
                const totDespPrev = d.periodos.map((_, j) => somaCol(despLines, 'previsto', j));
                const totFornReal = d.periodos.map((_, j) => somaCol(fornLines, 'valores', j));
                const totFornPrev = d.periodos.map((_, j) => somaCol(fornLines, 'previsto', j));
                return (
                  <React.Fragment>
                    <tr><td colSpan={d.periodos.length + 1} style={secaoc}>❤️ DESPESAS <span style={{ fontWeight: 400, color: '#999' }}>(sem fornecedores/compras · clique no grupo p/ detalhar · clique na célula p/ ver lançamentos)</span></td></tr>
                    {despLines.map((l, i) => linhaDesp(l, i))}
                    <tr style={s.totalRow}><td style={tdCatc}>Total de despesas</td>{totDespReal.map((v, j) => cellPR(totDespPrev[j], v, d.periodos[j].projetado, { cor: COR.vermelho }))}</tr>

                    {fornLines.length > 0 && <>
                      <tr><td colSpan={d.periodos.length + 1} style={secaoc}>📦 FORNECEDORES / COMPRAS <span style={{ fontWeight: 400, color: '#999' }}>(CMV — custo de mercadoria)</span></td></tr>
                      {fornLines.map((l, i) => linhaDesp(l, 'f' + i))}
                      <tr style={s.totalRow}><td style={tdCatc}>Total fornecedores pagos</td>{totFornReal.map((v, j) => cellPR(totFornPrev[j], v, d.periodos[j].projetado, { cor: COR.vermelho }))}</tr>
                    </>}
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
  const gerar = () => {
    const mesesBase = []; for (let m = Math.min(baseIni, baseFim); m <= Math.max(baseIni, baseFim); m++) mesesBase.push(m);
    API.post('/financeiro/orcamento/gerar', { loja, ano, fatorPct: fator, mesesBase })
      .then(r => { setMsg(r.data.ok ? `✅ Gerado da base ${MESAB[mesesBase[0] - 1]}–${MESAB[mesesBase[mesesBase.length - 1] - 1]} ${fator >= 0 ? '+' : ''}${fator}%.` : ('⚠️ ' + r.data.erro)); carregar(); });
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
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>Base</span>
            <select value={baseIni} onChange={e => setBaseIni(Number(e.target.value))} style={{ ...s.inp, padding: '5px' }}>{MESAB.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
            <span style={{ fontSize: 12, color: '#888' }}>a</span>
            <select value={baseFim} onChange={e => setBaseFim(Number(e.target.value))} style={{ ...s.inp, padding: '5px' }}>{MESAB.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
            <input type="number" value={fator} onChange={e => setFator(Number(e.target.value))} style={{ ...s.inp, width: 58 }} title="acréscimo/decréscimo %" />%
            <button onClick={gerar} style={{ ...s.btnMini }}>⚙️ Gerar</button>
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

// Aba "Eficiência de loja": representatividade (plano de contas × mercado) + venda por colaborador.
function EficienciaLoja({ API, loja, setLoja, lojas }) {
  const [sub, setSub] = useState('repr');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['repr', '📊 Representatividade × mercado'], ['colab', '👥 Venda por colaborador']].map(([v, l]) => (
          <button key={v} onClick={() => setSub(v)} style={{ ...s.chip, ...(sub === v ? s.chipOn : {}) }}>{l}</button>
        ))}
      </div>
      {sub === 'repr' && <Representatividade API={API} loja={loja} />}
      {sub === 'colab' && <VendaPorColaborador API={API} loja={loja} setLoja={setLoja} lojas={lojas} />}
    </div>
  );
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
