import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';

const hojeISO = () => new Date().toISOString().slice(0, 10);
const inicioMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const num = n => (Number(n) || 0).toLocaleString('pt-BR');
const corTempo = m => m <= 45 ? '#1E874B' : m <= 75 ? '#B7791F' : '#C0392B';

export default function Entrega() {
  const { API } = useAuth();
  const [ini, setIni] = useState(inicioMes()); const [fim, setFim] = useState(hojeISO());
  const [loja, setLoja] = useState(''); const [lojas, setLojas] = useState([]);
  const [d, setD] = useState(null); const [ent, setEnt] = useState(null); const [tempo, setTempo] = useState(null); const [canc, setCanc] = useState(null); const [ve, setVe] = useState(null); const [veAberto, setVeAberto] = useState(false); const [veModo, setVeModo] = useState('vendedor'); const [carreg, setCarreg] = useState(false);
  useEffect(() => { API.get('/entrega/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  const carregar = useCallback(() => {
    setCarreg(true);
    const params = { ini, fim, loja };
    Promise.all([
      API.get('/entrega/resumo', { params }).then(r => setD(r.data)).catch(e => setD({ erro: e.response?.data?.erro || e.message })),
      API.get('/entrega/entregadores', { params }).then(r => setEnt(r.data)).catch(() => setEnt(null)),
      API.get('/entrega/tempo', { params }).then(r => setTempo(r.data)).catch(() => setTempo(null)),
      API.get('/entrega/cancelados', { params }).then(r => setCanc(r.data)).catch(() => setCanc(null)),
      API.get('/entrega/vendas-entrega', { params }).then(r => setVe(r.data)).catch(() => setVe(null)),
    ]).finally(() => setCarreg(false));
  }, [API, ini, fim, loja]);
  useEffect(() => { carregar(); }, [carregar]);

  const maxEnt = Math.max(1, ...((ent?.entregadores || []).map(e => e.entregas)));
  const maxFaixa = Math.max(1, ...((tempo?.faixas || []).map(f => f.n)));

  // Ordenação: valor vendido por vendedor / operador de caixa
  const veCaixaMode = veModo === 'caixa';
  const veFonte = ((veCaixaMode ? ve?.operadoresFechamento : ve?.vendedores) || []).filter(v => (v.vendedor || v.operador) !== '—');
  const maxVe = Math.max(1, ...veFonte.map(v => v.valor || 0));
  const COLS_VE = [
    { k: 'nome', label: veCaixaMode ? 'Operador de caixa' : 'Vendedor', get: v => v.vendedor || v.operador || '', tipo: 'txt' },
    { k: 'entregas', label: 'Entregas', get: v => v.entregas || 0, tipo: 'num', right: true },
    { k: 'valor', label: 'Valor vendido', get: v => v.valor || 0, tipo: 'num', right: true },
  ];
  const { linhas: linhasVe, ordem: ordemVe, clicar: clicarVe, seta: setaVe } = useOrdenavel(veFonte, COLS_VE, { col: 'valor', dir: 'desc' });

  // Ordenação: por entregador
  const COLS_ENT = [
    { k: 'entregador', label: 'Entregador', get: e => e.entregador || '', tipo: 'txt' },
    { k: 'entregas', label: 'Entregas', get: e => e.entregas || 0, tipo: 'num' },
    { k: 'finalizadas', label: 'Finalizadas', get: e => e.finalizadas || 0, tipo: 'num' },
    { k: 'tempoMedio', label: 'Tempo médio', get: e => e.tempoMedio || 0, tipo: 'num' },
    { k: 'taxaTotal', label: 'Taxa recolhida', get: e => e.taxaTotal || 0, tipo: 'num' },
  ];
  const { linhas: linhasEnt, ordem: ordemEnt, clicar: clicarEnt, seta: setaEnt } = useOrdenavel(ent?.entregadores, COLS_ENT, { col: 'entregas', dir: 'desc' });

  // Ordenação: motivos de orçamentos não concretizados
  const COLS_CANC = [
    { k: 'motivo', label: 'Motivo', get: m => m.motivo || '', tipo: 'txt' },
    { k: 'tipo', label: 'Tipo', get: m => m.categoria || '', tipo: 'txt' },
    { k: 'n', label: 'Qtd', get: m => m.n || 0, tipo: 'num', right: true },
  ];
  const { linhas: linhasCanc, ordem: ordemCanc, clicar: clicarCanc, seta: setaCanc } = useOrdenavel(canc?.motivos, COLS_CANC, { col: 'n', dir: 'desc' });

  // Ordenação: entregas baixadas por operador de caixa
  const cxFonte = (ve?.porCaixa || []).filter(c => c.operador !== '—');
  const COLS_CX = [
    { k: 'operador', label: 'Operador de caixa', get: c => c.operador || '', tipo: 'txt' },
    { k: 'baixadas', label: 'Baixadas', get: c => c.baixadas || 0, tipo: 'num', right: true },
    { k: 'valor', label: 'Valor', get: c => c.valor || 0, tipo: 'num', right: true },
    { k: 'tempoMedio', label: 'Tempo médio', get: c => c.tempoMedio || 0, tipo: 'num', right: true },
  ];
  const { linhas: linhasCx, ordem: ordemCx, clicar: clicarCx, seta: setaCx } = useOrdenavel(cxFonte, COLS_CX, { col: 'baixadas', dir: 'desc' });

  return (
    <div style={s.wrap}>
      <Banner emoji="🛵" titulo="Entrega" cor="ciano" sub="Delivery ao vivo do ERP — entregas por entregador e tempo de rota (enviada → baixada)." />
      <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={s.lbl}>De<input type="date" value={ini} onChange={e => setIni(e.target.value)} style={s.inp} /></label>
        <label style={s.lbl}>Até<input type="date" value={fim} onChange={e => setFim(e.target.value)} style={s.inp} /></label>
        <label style={s.lbl}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}><option value="">Todas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        {carreg && <span style={{ fontSize: 12, color: '#999' }}>carregando…</span>}
      </div>
      {d?.erro && <div style={s.erro}>⚠️ {d.erro}</div>}
      {d?.ok && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <Stat n={num(d.total)} l="Entregas" />
        <Stat n={num(d.finalizadas)} l="Finalizadas" cor="#1E874B" bg="#EAF7EF" sub={d.total ? Math.round(100 * d.finalizadas / d.total) + '% do total' : ''} />
        <Stat n={num(d.andamento)} l="Em andamento" cor="#B7791F" bg="#FCF7EA" />
        <Stat n={d.tempoMedio + ' min'} l="Tempo médio (rota)" cor={corTempo(d.tempoMedio)} />
        <Stat n={brl(d.taxaTotal)} l="Taxa de entrega" sub={`média ${brl(d.taxaMedia)}`} />
        <Stat n={num(d.entregadores)} l="Entregadores" />
      </div>}

      {ve?.ok && <div style={{ ...s.card, background: '#F3F9F5', borderColor: '#CBE3D3' }}>
        <div onClick={() => setVeAberto(v => !v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, cursor: 'pointer' }}>
          <div>
            <div style={{ fontSize: 11, color: '#777' }}>💰 Valor vendido por entrega {ve.canceladasCaixa?.qtd ? <span style={{ color: '#C0392B' }}> · {num(ve.canceladasCaixa.qtd)} canceladas no caixa ({brl(ve.canceladasCaixa.valor)})</span> : ''}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#1E874B' }}>{brl(ve.totalVendido)} <span style={{ fontSize: 12, color: '#999', fontWeight: 400 }}>· {num(ve.entregas)} entregas</span></div>
          </div>
          <span style={{ fontSize: 12, color: '#2E5C9E' }}>{veAberto ? '▲ ocultar' : '▼ ver por vendedor / caixa'}</span>
        </div>
        {veAberto && (
          <div style={{ marginTop: 10, borderTop: '1px solid #e6efe9', paddingTop: 8 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button onClick={() => setVeModo('vendedor')} style={{ ...s.segBtn, ...(veCaixaMode ? {} : s.segOn) }}>👤 Por vendedor</button>
              <button onClick={() => setVeModo('caixa')} style={{ ...s.segBtn, ...(veCaixaMode ? s.segOn : {}) }}>🧾 Por operador de caixa</button>
            </div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>{veCaixaMode ? 'Operador de caixa que fechou o cupom da entrega.' : 'Vendedor que atendeu e criou o orçamento da entrega.'}</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead><tr><th style={{ ...s.th, textAlign: 'left' }}>#</th>{COLS_VE.map(c => <ThOrd key={c.k} c={c} ordem={ordemVe} clicar={clicarVe} seta={setaVe} base={s.th} />)}</tr></thead>
                <tbody>{linhasVe.map((v, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}>
                    <td style={{ ...s.td, color: '#999', width: 24 }}>{i + 1}</td>
                    <td style={{ ...s.td, fontWeight: 600 }}>{v.vendedor || v.operador}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{num(v.entregas)}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#1E874B', fontWeight: 600 }}>{brl(v.valor)} <span style={{ display: 'inline-block', width: 60, height: 6, background: '#e6efe9', borderRadius: 3, verticalAlign: 'middle', marginLeft: 4 }}><span style={{ display: 'inline-block', width: (60 * v.valor / maxVe) + 'px', height: 6, background: veCaixaMode ? '#2E5C9E' : '#1E874B', borderRadius: 3 }} /></span></td>
                  </tr>))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>}

      {tempo?.faixas && <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>⏱️ Tempo de rota (enviada → baixada)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tempo.faixas.map(f => (
            <div key={f.faixa} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 60px', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#666' }}>{f.faixa}</span>
              <div style={{ background: '#F1F3F5', borderRadius: 5, height: 16, overflow: 'hidden' }}><div style={{ width: (100 * f.n / maxFaixa) + '%', background: '#2E5C9E', height: '100%', minWidth: f.n ? 2 : 0 }} /></div>
              <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(f.n)}</span>
            </div>
          ))}
        </div>
      </div>}

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🧑‍🔧 Por entregador</div>
        {!ent?.entregadores?.length ? <div style={s.vazio}>Sem entregas no período.</div> :
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{COLS_ENT.map(c => <ThOrd key={c.k} c={c} ordem={ordemEnt} clicar={clicarEnt} seta={setaEnt} base={s.th} />)}<th style={s.th}></th></tr></thead>
            <tbody>{linhasEnt.map((e, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={{ ...s.td, fontWeight: 600 }}>{e.entregador}</td>
                <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>{num(e.entregas)}</td>
                <td style={{ ...s.td, color: '#1E874B' }}>{num(e.finalizadas)}{e.canceladas ? <span style={{ color: '#C0392B' }}> · {e.canceladas} canc.</span> : ''}</td>
                <td style={{ ...s.td, color: corTempo(e.tempoMedio), fontWeight: 600 }}>{e.tempoMedio} min</td>
                <td style={{ ...s.td, color: '#888', fontVariantNumeric: 'tabular-nums' }}>{brl(e.taxaTotal)}</td>
                <td style={{ ...s.td, width: 130 }}><div style={{ background: '#F1F3F5', borderRadius: 4, height: 8 }}><div style={{ width: (100 * e.entregas / maxEnt) + '%', background: '#2E5C9E', height: '100%', borderRadius: 4 }} /></div></td>
              </tr>))}</tbody>
          </table>
        </div>}
      </div>
      {canc?.ok && <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🚫 Orçamentos de entrega não concretizados</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <Stat n={num(canc.total)} l="Total (canc. + descart.)" cor="#8A2E2E" bg="#FBEAEA" sub={d?.total ? Math.round(100 * canc.total / (d.total + canc.total)) + '% dos orçamentos' : ''} />
          <Stat n={num(canc.descartados)} l="Descartados" cor="#B7791F" bg="#FCF7EA" />
          <Stat n={num(canc.cancelados)} l="Cancelados" cor="#C0392B" bg="#FBEAEA" />
          <Stat n={num(canc.manuais)} l="Motivos manuais" cor="#666" />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{COLS_CANC.map(c => <ThOrd key={c.k} c={c} ordem={ordemCanc} clicar={clicarCanc} seta={setaCanc} base={s.th} />)}</tr></thead>
            <tbody>{linhasCanc.map((m, i) => {
              const cor = m.categoria === 'descartado' ? '#B7791F' : m.categoria === 'cancelado' ? '#C0392B' : '#888';
              return <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={{ ...s.td, textTransform: m.categoria === 'manual' ? 'none' : 'none' }}>{m.motivo}</td>
                <td style={{ ...s.td }}><span style={{ color: cor, fontWeight: 600, fontSize: 11.5 }}>{m.categoria === 'descartado' ? 'descartado' : m.categoria === 'cancelado' ? 'cancelado' : 'manual'}</span></td>
                <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{num(m.n)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {canc.porColaborador?.length > 0 && <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>👤 Quem mais descarta/cancela</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {canc.porColaborador.filter(c => !/sem usu/i.test(c.colaborador)).slice(0, 10).map((c, i) => (
              <span key={i} style={{ fontSize: 12, background: i === 0 ? '#FBEAEA' : '#F1F3F5', border: '1px solid ' + (i === 0 ? '#F0C7C7' : '#e6e6e6'), borderRadius: 20, padding: '3px 10px' }}>{c.colaborador} <b style={{ color: '#C0392B' }}>{num(c.n)}</b></span>
            ))}
          </div>
        </div>}
      </div>}

      {ve?.ok && ve.porCaixa?.length > 0 && <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>💵 Entregas baixadas por operador de caixa</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{COLS_CX.map(c => <ThOrd key={c.k} c={c} ordem={ordemCx} clicar={clicarCx} seta={setaCx} base={s.th} />)}</tr></thead>
            <tbody>{linhasCx.map((c, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={{ ...s.td, fontWeight: 600 }}>{c.operador}</td>
                <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(c.baixadas)}</td>
                <td style={{ ...s.td, textAlign: 'right', color: '#1E874B' }}>{brl(c.valor)}</td>
                <td style={{ ...s.td, textAlign: 'right', color: corTempo(c.tempoMedio) }}>{c.tempoMedio ? c.tempoMedio + ' min' : '—'}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <div style={{ ...s.nota, marginTop: 8 }}>💡 "Baixou" = o operador de caixa que <b>finalizou/deu baixa</b> na entrega no ERP (não quem entregou na rua).</div>
      </div>}
      <div style={s.nota}>💡 Tempo de rota = da <b>saída (enviada)</b> até a <b>baixa (entregue)</b>. Verde ≤45 min · amarelo ≤75 · vermelho acima. <b>Descartados/cancelados</b> vêm do motivo do cancelamento no ERP. O bloco <b>🤖 BotVendas</b> vem ao vivo da API do bot (funil de pedidos e atendentes).</div>
    </div>
  );
}

function Stat({ n, l, cor = '#111', bg = '#F6F7F9', sub }) {
  return <div style={{ background: bg, borderRadius: 10, padding: '10px 14px', minWidth: 120, flex: 1 }}>
    <div style={{ fontSize: 19, fontWeight: 700, color: cor }}>{n}</div>
    <div style={{ fontSize: 11, color: '#777' }}>{l}</div>
    {sub ? <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>{sub}</div> : null}
  </div>;
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1080, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 12 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 10 },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  lbl: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#888' },
  th: { textAlign: 'left', fontSize: 11, color: '#888', padding: '5px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  td: { textAlign: 'left', padding: '6px 8px' },
  vazio: { fontSize: 12.5, color: '#aaa', textAlign: 'center', padding: 14 },
  segBtn: { fontSize: 12, padding: '5px 12px', borderRadius: 20, border: '1px solid #d6e3da', background: '#fff', color: '#567', cursor: 'pointer', fontWeight: 600 },
  segOn: { background: '#1E874B', color: '#fff', borderColor: '#1E874B' },
  nota: { fontSize: 11.5, color: '#888', background: '#F6F7F9', borderRadius: 8, padding: '8px 10px' },
  erro: { background: '#FBEAEA', border: '1px solid #F0C7C7', color: '#8A2E2E', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, marginBottom: 10 },
};
