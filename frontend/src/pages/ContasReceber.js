import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';

const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlK = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const dBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';

export default function ContasReceber() {
  const { API } = useAuth();
  const [aba, setAba] = useState('visao');
  const [loja, setLoja] = useState(''); const [lojas, setLojas] = useState([]);
  const [resumo, setResumo] = useState(null);
  useEffect(() => { API.get('/contas-receber/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  useEffect(() => { setResumo(null); API.get('/contas-receber/resumo', { params: { loja } }).then(r => setResumo(r.data)).catch(() => setResumo({ erro: true })); }, [API, loja]);
  return (
    <div style={s.wrap}>
      <Banner emoji="📥" titulo="Contas a Receber" cor="azul" sub="O que está em aberto no ERP — crediário (clientes), cartão (credenciadoras) e PBM. Aging por vencimento." />
      <div style={{ ...s.card, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={s.fld}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}><option value="">Todas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        {resumo?.ok && <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Stat n={brlK(resumo.total)} l="Total a receber" cor="#111" />
          <Stat n={brlK(resumo.vencidoTotal)} l="Vencido" cor="#C0392B" bg="#FBEAEA" />
        </div>}
      </div>
      <div style={{ display: 'flex', gap: 6, margin: '4px 0 14px', flexWrap: 'wrap' }}>
        {[['visao', '🧭 Visão geral'], ['crediario', '👤 Crediário'], ['cartao', '💳 Cartão'], ['pbm', '💊 PBM']].map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {aba === 'visao' && <Visao resumo={resumo} />}
      {aba === 'crediario' && <Crediario API={API} loja={loja} />}
      {aba === 'cartao' && <Cartao API={API} loja={loja} />}
      {aba === 'pbm' && <Pbm API={API} loja={loja} />}
    </div>
  );
}

function Stat({ n, l, cor = '#111', bg = '#F6F7F9', sub }) {
  return <div style={{ background: bg, borderRadius: 10, padding: '10px 14px', minWidth: 120 }}>
    <div style={{ fontSize: 18, fontWeight: 700, color: cor, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
    <div style={{ fontSize: 11, color: '#777' }}>{l}</div>
    {sub != null && <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>{sub}</div>}
  </div>;
}

// Barras de aging (a vencer / 1-30 / 31-60 / 61-90 / 90+)
function Aging({ ag }) {
  if (!ag) return null;
  const faixas = [
    ['A vencer', ag.aVencer, '#1E874B'], ['1–30 d', ag.d1_30, '#B7791F'], ['31–60 d', ag.d31_60, '#C87A1E'],
    ['61–90 d', ag.d61_90, '#C0562B'], ['+90 d', ag.d90, '#C0392B'],
  ];
  const max = Math.max(...faixas.map(f => f[1]), 1);
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Aging (por vencimento)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {faixas.map(([l, v, c]) => (
          <div key={l} style={{ display: 'grid', gridTemplateColumns: '78px 1fr 110px', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#666' }}>{l}</span>
            <div style={{ background: '#F1F3F5', borderRadius: 5, height: 16, overflow: 'hidden' }}>
              <div style={{ width: (100 * v / max) + '%', background: c, height: '100%', minWidth: v > 0 ? 2 : 0 }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{brl(v)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid #eee', fontSize: 12.5 }}>
        <span style={{ color: '#666' }}>Total <b style={{ color: '#111' }}>{brl(ag.total)}</b></span>
        <span style={{ color: '#C0392B' }}>Vencido <b>{brl(ag.vencidoTotal)}</b> ({ag.total ? Math.round(100 * ag.vencidoTotal / ag.total) : 0}%)</span>
      </div>
    </div>
  );
}

function useDados(API, url, params, deps) {
  const [d, setD] = useState(null); const [carreg, setCarreg] = useState(false);
  const carregar = useCallback(() => {
    setCarreg(true);
    API.get(url, { params }).then(r => setD(r.data)).catch(e => setD({ erro: e.response?.data?.erro || e.message })).finally(() => setCarreg(false));
  }, deps); // eslint-disable-line
  useEffect(() => { carregar(); }, [carregar]);
  return [d, carreg, carregar];
}

function Visao({ resumo }) {
  if (!resumo) return <div style={s.vazio}>carregando…</div>;
  if (resumo.erro || !resumo.ok) return <div style={s.erroBox}>⚠️ Não foi possível carregar (ERP indisponível ou sem lojas mapeadas).</div>;
  const linhas = [
    ['👤 Crediário (clientes)', resumo.crediario, '#2E5C9E'],
    ['💳 Cartão (credenciadoras)', resumo.cartao, '#7A4FB0'],
    ['💊 PBM', resumo.pbm, '#1E874B'],
  ];
  const max = Math.max(...linhas.map(l => l[1].total), 1);
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Composição do total a receber</div>
      {linhas.map(([l, v, c]) => (
        <div key={l} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span style={{ fontWeight: 600 }}>{l}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{brl(v.total)} {v.vencido > 0 && <span style={{ color: '#C0392B', fontSize: 11.5 }}>· venc. {brl(v.vencido)}</span>}</span>
          </div>
          <div style={{ background: '#F1F3F5', borderRadius: 6, height: 20, overflow: 'hidden' }}>
            <div style={{ width: (100 * v.total / max) + '%', background: c, height: '100%' }} />
          </div>
        </div>
      ))}
      <div style={{ ...s.nota, marginTop: 8 }}>💡 O cartão considera títulos <b>emitidos nos últimos 90 dias</b> (o recebível real); títulos antigos em aberto são backlog de conciliação — veja na aba Cartão.</div>
    </div>
  );
}

function Crediario({ API, loja }) {
  const [d, carreg] = useDados(API, '/contas-receber/crediario', { loja }, [API, loja]);
  const COLS = [
    { k: 'cliente', label: 'Cliente', tipo: 'txt', get: c => c.cliente || '' },
    { k: 'titulos', label: 'Títulos', tipo: 'num', get: c => c.titulos || 0 },
    { k: 'total', label: 'Total', tipo: 'num', get: c => c.total || 0 },
    { k: 'vencido', label: 'Vencido', tipo: 'num', get: c => c.vencido || 0 },
  ];
  const { linhas, ordem, clicar, seta } = useOrdenavel(d?.porCliente, COLS, { col: 'total', dir: 'desc' });
  return (
    <>
      {carreg && !d && <div style={s.vazio}>carregando…</div>}
      {d?.erro && <div style={s.erroBox}>⚠️ {d.erro}</div>}
      {d?.ok && <>
        <Aging ag={d.aging} />
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Maiores devedores <span style={{ color: '#999', fontWeight: 400 }}>({d.titulos} títulos abertos)</span></div>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{COLS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />)}</tr></thead>
            <tbody>{linhas.map((c, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={{ ...s.td, fontWeight: 600 }}>{c.cliente}</td>
                <td style={s.td}>{c.titulos}</td>
                <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>{brl(c.total)}</td>
                <td style={{ ...s.td, color: c.vencido > 0 ? '#C0392B' : '#999', fontVariantNumeric: 'tabular-nums' }}>{c.vencido > 0 ? brl(c.vencido) : '—'}</td>
              </tr>))}</tbody>
          </table></div>
        </div>
      </>}
    </>
  );
}

function Cartao({ API, loja }) {
  const [dias, setDias] = useState(90);
  const [d, carreg] = useDados(API, '/contas-receber/cartao', { loja, dias }, [API, loja, dias]);
  const COLS_B = [
    { k: 'bandeira', label: 'Bandeira', tipo: 'txt', get: b => b.bandeira || '' },
    { k: 'titulos', label: 'Títulos', tipo: 'num', get: b => b.titulos || 0 },
    { k: 'total', label: 'Total', tipo: 'num', get: b => b.total || 0 },
    { k: 'taxa', label: 'Taxa', tipo: 'num', get: b => b.taxa || 0 },
  ];
  const { linhas: linhasB, ordem: ordemB, clicar: clicarB, seta: setaB } = useOrdenavel(d?.porBandeira, COLS_B, { col: 'total', dir: 'desc' });
  const COLS_C = [
    { k: 'credenciadora', label: 'Credenciadora', tipo: 'txt', get: c => c.credenciadora || '' },
    { k: 'titulos', label: 'Títulos', tipo: 'num', get: c => c.titulos || 0 },
    { k: 'total', label: 'Total', tipo: 'num', get: c => c.total || 0 },
    { k: 'taxa', label: 'Taxa', tipo: 'num', get: c => c.taxa || 0 },
  ];
  const { linhas: linhasC, ordem: ordemC, clicar: clicarC, seta: setaC } = useOrdenavel(d?.porCredenciadora, COLS_C, { col: 'total', dir: 'desc' });
  return (
    <>
      <div style={{ ...s.card, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={s.fld}>Emitidos nos últimos
          <select value={dias} onChange={e => setDias(Number(e.target.value))} style={s.inp}>
            <option value={30}>30 dias</option><option value={60}>60 dias</option><option value={90}>90 dias</option>
            <option value={180}>180 dias</option><option value={0}>tudo (inclui backlog)</option>
          </select>
        </label>
        {d?.ok && <span style={{ fontSize: 11.5, color: '#888' }}>{d.titulos} títulos · taxa estimada {brl(d.taxaTotal)}</span>}
      </div>
      {carreg && !d && <div style={s.vazio}>carregando…</div>}
      {d?.erro && <div style={s.erroBox}>⚠️ {d.erro}</div>}
      {d?.ok && <>
        <Aging ag={d.aging} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ ...s.card, flex: '1 1 300px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Por bandeira / modalidade</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr>{COLS_B.map(c => <ThOrd key={c.k} c={c} ordem={ordemB} clicar={clicarB} seta={setaB} base={s.th} />)}</tr></thead>
              <tbody>{linhasB.map((b, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}>
                  <td style={{ ...s.td, fontWeight: 600 }}>{b.bandeira}</td>
                  <td style={s.td}>{b.titulos}</td>
                  <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>{brl(b.total)}</td>
                  <td style={{ ...s.td, color: '#999', fontVariantNumeric: 'tabular-nums' }}>{brl(b.taxa)}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div style={{ ...s.card, flex: '1 1 300px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Por credenciadora <span style={{ fontWeight: 400, color: '#999', fontSize: 11.5 }}>(Rede, Cielo, Stone…)</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr>{COLS_C.map(c => <ThOrd key={c.k} c={c} ordem={ordemC} clicar={clicarC} seta={setaC} base={s.th} />)}</tr></thead>
              <tbody>{linhasC.map((c, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}>
                  <td style={{ ...s.td, fontWeight: 600, color: c.credenciadora.startsWith('(') ? '#C0392B' : undefined }}>{c.credenciadora}</td>
                  <td style={s.td}>{c.titulos}</td>
                  <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>{brl(c.total)}</td>
                  <td style={{ ...s.td, color: '#999', fontVariantNumeric: 'tabular-nums' }}>{brl(c.taxa)}</td>
                </tr>))}</tbody>
            </table>
            <div style={{ ...s.nota, marginTop: 8 }}>Credenciadora vem da conciliação do título; os ainda não conciliados aparecem como <b>(não conciliado)</b>.</div>
          </div>
          <div style={{ ...s.card, flex: '1 1 240px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Conciliação</div>
            {d.porConciliacao.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i ? '1px solid #f2f2f2' : 'none', fontSize: 12.5 }}>
                <span style={{ color: c.cod === 'A' ? '#C0392B' : '#1E874B', fontWeight: 600 }}>{c.status}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{brl(c.total)} <span style={{ color: '#aaa' }}>· {c.titulos}</span></span>
              </div>
            ))}
            <div style={{ ...s.nota, marginTop: 8 }}>Não conciliado = ainda não casou com o arquivo da credenciadora.</div>
          </div>
        </div>
      </>}
    </>
  );
}

function Pbm({ API, loja }) {
  const [d, carreg] = useDados(API, '/contas-receber/pbm', { loja }, [API, loja]);
  const COLS = [
    { k: 'pbm', label: 'Programa', tipo: 'txt', get: p => p.pbm || '' },
    { k: 'titulos', label: 'Títulos', tipo: 'num', get: p => p.titulos || 0 },
    { k: 'total', label: 'Total', tipo: 'num', get: p => p.total || 0 },
    { k: 'vencido', label: 'Vencido (reposição pendente)', tipo: 'num', get: p => p.vencido || 0 },
    { k: 'maisAntiga', label: 'Mais antigo', tipo: 'txt', get: p => p.maisAntiga || '' },
  ];
  const { linhas, ordem, clicar, seta } = useOrdenavel(d?.porPbm, COLS, { col: 'total', dir: 'desc' });
  return (
    <>
      {carreg && !d && <div style={s.vazio}>carregando…</div>}
      {d?.erro && <div style={s.erroBox}>⚠️ {d.erro}</div>}
      {d?.ok && <>
        <Aging ag={d.aging} />
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Por programa PBM <span style={{ color: '#999', fontWeight: 400 }}>({d.titulos} títulos)</span></div>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{COLS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />)}</tr></thead>
            <tbody>{linhas.map((p, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={{ ...s.td, fontWeight: 600 }}>{p.pbm}</td>
                <td style={s.td}>{p.titulos}</td>
                <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>{brl(p.total)}</td>
                <td style={{ ...s.td, color: p.vencido > 0 ? '#C0392B' : '#999', fontVariantNumeric: 'tabular-nums' }}>{p.vencido > 0 ? brl(p.vencido) : '—'}</td>
                <td style={{ ...s.td, color: '#999' }}>{dBR(p.maisAntiga)}</td>
              </tr>))}</tbody>
          </table></div>
          <div style={{ ...s.nota, marginTop: 8 }}>💡 O "vencido" é o valor autorizado cujo prazo passou sem repor — a <b>reposição pendente</b> do PBM.</div>
        </div>
      </>}
    </>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1080, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 12 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 10 },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  fld: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#888' },
  chip: { fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  th: { textAlign: 'left', fontSize: 11, color: '#888', padding: '5px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  td: { textAlign: 'left', padding: '6px 8px' },
  vazio: { fontSize: 12.5, color: '#aaa', textAlign: 'center', padding: 14 },
  nota: { fontSize: 11.5, color: '#888', background: '#F6F7F9', borderRadius: 8, padding: '8px 10px' },
  erroBox: { background: '#FBEAEA', border: '1px solid #F0C7C7', color: '#8A2E2E', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, marginBottom: 10 },
};
