import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const BRAND = '#0d6b5e';

// Diretoria — Fechamento do setor (mensal) + Ranking trimestral de Desenvolvimento.
export default function FechamentoSetor() {
  const { API } = useAuth();
  const [setor, setSetor] = useState('tesouraria');
  const [setores, setSetores] = useState([{ id: 'tesouraria', nome: 'Tesouraria' }, { id: 'retail', nome: 'Retail' }, { id: 'compras', nome: 'Compras' }]);
  const [view, setView] = useState('mensal');
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 4px' }}>
      <Banner emoji="🏁" titulo="Fechamento do setor" cor="roxo" sub="Diretoria valida a premiação do MÊS: 5 requisitos por pessoa (cada um não validado tira 10% do prêmio; metade é garantida, piso de 50%). E o ranking TRIMESTRAL de Desenvolvimento premia quem se desenvolveu mais." />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>Setor:</span>
        {setores.map(s => (
          <button key={s.id} onClick={() => setSetor(s.id)} style={pill(setor === s.id)}>{s.nome}</button>
        ))}
        <div style={{ width: 1, height: 22, background: '#e5e7eb', margin: '0 4px' }} />
        <button onClick={() => setView('mensal')} style={pill(view === 'mensal')}>📋 Fechamento mensal</button>
        <button onClick={() => setView('rank')} style={pill(view === 'rank')}>🏆 Ranking trimestral</button>
      </div>
      {view === 'mensal'
        ? <Mensal API={API} setor={setor} onSetores={setSetores} />
        : <RankTri API={API} setor={setor} />}
    </div>
  );
}

function Mensal({ API, setor, onSetores }) {
  const [d, setD] = useState(null); const [sel, setSel] = useState(''); const [carreg, setCarreg] = useState(false);
  const carregar = useCallback((params) => {
    setCarreg(true);
    API.get('/diretoria/fechamento-setor', { params: { setor, ...(params || {}) } })
      .then(r => { setD(r.data); setSel(r.data.ano + '-' + r.data.mes); if (r.data.setores) onSetores(r.data.setores); })
      .catch(() => setD(null)).finally(() => setCarreg(false));
  }, [API, setor, onSetores]);
  useEffect(() => { carregar(); }, [carregar]);
  const escolher = v => { setSel(v); const [ano, mes] = v.split('-'); carregar({ ano, mes }); };
  const toggle = (l, gate) => {
    const valor = !l.gates[gate];
    setD(prev => ({ ...prev, linhas: prev.linhas.map(x => x.colaborador_id === l.colaborador_id ? recalc({ ...x, gates: { ...x.gates, [gate]: valor } }, prev) : x) }));
    API.put('/diretoria/fechamento-setor/validacao', { setor, ano: d.ano, mes: d.mes, colaborador_id: l.colaborador_id, gate, valor })
      .then(() => carregar({ ano: d.ano, mes: d.mes })).catch(() => carregar({ ano: d.ano, mes: d.mes }));
  };
  const recalc = (l, dd) => {
    const falhos = (dd.gates || []).filter(g => !l.gates[g]).length;
    const descontoPorReq = Math.round(l.premioBruto * (dd.pesoReq || .1) * 100) / 100;
    const desconto = Math.round(Math.min((dd.gates || []).length, falhos) * descontoPorReq * 100) / 100;
    const premioFinal = Math.round(Math.max(l.premioBruto * (dd.piso || .5), l.premioBruto - desconto) * 100) / 100;
    return { ...l, falhos, descontoPorReq, desconto, premioFinal };
  };
  return (
    <>
      <div style={card}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={fld}>Mês de fechamento<select value={sel} onChange={e => escolher(e.target.value)} style={{ ...inp, minWidth: 180 }}>
            {(d?.meses || []).map(m => <option key={m.ano + '-' + m.mes} value={m.ano + '-' + m.mes}>{m.label}{m.atual ? ' — atual' : ''}</option>)}
          </select></label>
          {d?.notaGeral != null && <span style={{ fontSize: 12.5, color: '#64748b' }}>Nota do setor: <b>{d.notaGeral}/100</b></span>}
          <button onClick={() => carregar({ ano: d?.ano, mes: d?.mes, forcar: 1 })} disabled={carreg} style={{ ...inp, cursor: 'pointer', color: BRAND, borderColor: BRAND, fontWeight: 700 }}>{carreg ? '⏳' : '🔄 Atualizar'}</button>
          {d?.cache?.atualizado_em && <span style={{ fontSize: 11, color: '#94a3b8' }}>snapshot {String(d.cache.atualizado_em).replace('T', ' ').slice(0, 16)} · recalcula 1×/dia</span>}
        </div>
        {d && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <Tile label="Prêmio bruto do mês" valor={brl(d.totalBruto)} />
          <Tile label="Desconto por validação" valor={'− ' + brl(d.totalBruto - d.totalFinal)} cor="#b45309" />
          <Tile label="Total a pagar" valor={brl(d.totalFinal)} cor={BRAND} forte />
        </div>}
      </div>
      {!d ? <Msg>{carreg ? '⏳ Calculando premiação do mês…' : 'Sem dados.'}</Msg> :
        d.linhas.length === 0 ? <Msg>Ninguém com premiação neste setor/mês.{setor === 'tesouraria' ? ' Vincule as pessoas nas Faixas do prêmio (Caixa → Metas).' : ' Depende de contratos assinados com espaços no mês.'}</Msg> :
          <div style={{ overflowX: 'auto', ...card, padding: 0 }}>
            <table style={tbl}>
              <thead><tr style={trh}>
                <th style={th}>Pessoa</th><th style={{ ...th, textAlign: 'right' }}>Prêmio bruto</th>
                {d.gates.map(g => <th key={g} style={{ ...th, textAlign: 'center' }}>{d.gateLabels[g]}</th>)}
                <th style={{ ...th, textAlign: 'right' }}>Desconto</th><th style={{ ...th, textAlign: 'right' }}>A receber</th>
              </tr></thead>
              <tbody>{d.linhas.map(l => {
                const ok = 5 - l.falhos;
                return (
                  <tr key={l.colaborador_id} style={{ borderTop: '1px solid #f1f3f5' }}>
                    <td style={td}><b style={{ fontSize: 13 }}>{l.nome}</b>
                      <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{Math.round((l.fator || 1) * 100)}% · garante {brl(l.garantido)} · <b style={{ color: ok === 5 ? BRAND : '#b45309' }}>{ok}/5 validado</b></div></td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{brl(l.premioBruto)}</td>
                    {d.gates.map(g => (
                      <td key={g} style={{ ...td, textAlign: 'center' }}>
                        <span onClick={() => toggle(l, g)} title={l.gates[g] ? 'Validado — clique p/ tirar' : 'Clique p/ validar'}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 800, border: '1.5px solid ' + (l.gates[g] ? BRAND : '#d7dde1'), background: l.gates[g] ? BRAND : '#fff', color: l.gates[g] ? '#fff' : '#cbd5e1' }}>{l.gates[g] ? '✓' : ''}</span>
                      </td>
                    ))}
                    <td style={{ ...td, textAlign: 'right', color: l.desconto ? '#b91c1c' : '#94a3b8' }}>{l.desconto ? '− ' + brl(l.desconto) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: BRAND, fontSize: 14 }}>{brl(l.premioFinal)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>}
      <p style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>💡 Clique no quadradinho de cada requisito pra validar. Cada requisito vale <b>10%</b> do prêmio; deixar de validar tira esse 10% (no máximo os 5 = 50%; a outra metade é garantida).</p>
    </>
  );
}

function RankTri({ API, setor }) {
  const [d, setD] = useState(null); const [sel, setSel] = useState(''); const [premio, setPremio] = useState(''); const [msg, setMsg] = useState('');
  const carregar = useCallback((params) => {
    API.get('/diretoria/rank-trimestral', { params: { setor, ...(params || {}) } })
      .then(r => { setD(r.data); setSel(r.data.ano + '-' + r.data.tri); setPremio(r.data.premio); }).catch(() => setD(null));
  }, [API, setor]);
  useEffect(() => { carregar(); }, [carregar]);
  const escolher = v => { setSel(v); const [ano, tri] = v.split('-'); carregar({ ano, tri }); };
  const salvarPremio = () => API.put('/diretoria/rank-trimestral/premio', { setor, valor: Number(premio) }).then(() => { setMsg('✅ Prêmio salvo.'); setTimeout(() => setMsg(''), 2000); carregar({ ano: d?.ano, tri: d?.tri }); }).catch(() => setMsg('⚠️ Erro.'));
  return (
    <>
      <div style={card}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={fld}>Trimestre<select value={sel} onChange={e => escolher(e.target.value)} style={{ ...inp, minWidth: 210 }}>
            {(d?.trimestres || []).map(t => <option key={t.ano + '-' + t.tri} value={t.ano + '-' + t.tri}>{t.label}{t.atual ? ' — atual' : ''}</option>)}
          </select></label>
          <label style={fld}>Prêmio do 1º lugar (R$)<span style={{ display: 'flex', gap: 6 }}><input type="number" value={premio} onChange={e => setPremio(e.target.value)} style={{ ...inp, width: 110 }} /><button onClick={salvarPremio} style={{ ...inp, cursor: 'pointer', background: BRAND, color: '#fff', border: 'none', fontWeight: 700 }}>Salvar</button></span></label>
          {d && <span style={{ fontSize: 12, color: '#64748b' }}>Mede o <b>Desenvolvimento</b> validado nos meses {(d.meses || []).join(' · ')}.</span>}
          {msg && <span style={{ fontSize: 12.5, fontWeight: 600, color: msg.startsWith('⚠️') ? '#b91c1c' : '#15803d' }}>{msg}</span>}
        </div>
      </div>
      {!d ? <Msg>Carregando…</Msg> : d.linhas.length === 0 ? <Msg>Ninguém no ranking deste setor/trimestre ainda.</Msg> :
        <div style={{ overflowX: 'auto', ...card, padding: 0 }}>
          <table style={tbl}>
            <thead><tr style={trh}><th style={th}>#</th><th style={th}>Pessoa</th><th style={{ ...th, textAlign: 'center' }}>Desenvolvimento no trimestre</th><th style={{ ...th, textAlign: 'right' }}>Prêmio do trimestre (mensal)</th><th style={{ ...th, textAlign: 'right' }}>Bônus 1º lugar</th></tr></thead>
            <tbody>{d.linhas.map(l => (
              <tr key={l.colaborador_id} style={{ borderTop: '1px solid #f1f3f5', background: l.vencedor ? '#eef7f2' : '#fff' }}>
                <td style={{ ...td, fontWeight: 800, color: l.pos === 1 ? '#b7791f' : '#64748b' }}>{l.pos === 1 ? '🥇' : l.pos === 2 ? '🥈' : l.pos === 3 ? '🥉' : l.pos}</td>
                <td style={td}><b>{l.nome}</b></td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <span style={{ fontWeight: 800, color: BRAND }}>{l.devMeses}/3</span>
                  <span style={{ marginLeft: 8 }}>{[0, 1, 2].map(i => <span key={i} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, margin: '0 2px', background: i < l.devMeses ? BRAND : '#e2e8f0' }} />)}</span>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{brl(l.premioTri)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: l.vencedor ? BRAND : '#cbd5e1' }}>{l.vencedor ? '🏆 ' + brl(d.premio) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
      <p style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>🏆 O ranking soma, nos 3 meses do trimestre, quantas vezes o requisito <b>Desenvolvimento</b> foi validado. Quem tiver mais leva o bônus (empate = todos levam). Ajuste o valor do prêmio acima.</p>
    </>
  );
}

function Tile({ label, valor, cor, forte }) {
  return <div style={{ flex: 1, minWidth: 160, background: forte ? '#eef7f2' : '#f8fafc', border: '1px solid ' + (forte ? '#cdeadd' : '#eef2f0'), borderRadius: 12, padding: '10px 14px' }}>
    <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 21, fontWeight: 800, color: cor || '#0f172a' }}>{valor}</div>
  </div>;
}
const Msg = ({ children }) => <div style={{ ...card, textAlign: 'center', color: '#94a3b8' }}>{children}</div>;

const pill = on => ({ padding: '7px 14px', borderRadius: 999, border: '1px solid ' + (on ? 'transparent' : '#e3e8ea'), background: on ? 'linear-gradient(95deg,#0E7C5A,#0b6e59)' : '#f3f7f6', color: on ? '#fff' : '#334', fontSize: 13, fontWeight: 700, cursor: 'pointer' });
const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, marginBottom: 14 };
const fld = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5, color: '#64748b', fontWeight: 600 };
const inp = { border: '1px solid #e3e8ea', borderRadius: 8, padding: '8px 10px', fontSize: 13 };
const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 };
const trh = { textAlign: 'left', color: '#64748b', background: '#f8fafc', borderBottom: '2px solid #eef1f4' };
const th = { padding: '10px 12px', whiteSpace: 'nowrap', fontWeight: 700 };
const td = { padding: '10px 12px', verticalAlign: 'top' };
