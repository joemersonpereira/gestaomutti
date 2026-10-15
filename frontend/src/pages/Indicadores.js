import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

export default function Indicadores() {
  const { API } = useAuth();
  const [funcoes, setFuncoes] = useState([]);
  const [funcaoId, setFuncaoId] = useState('');
  const [criterios, setCriterios] = useState([]);
  const [pesosEdit, setPesosEdit] = useState({}); // id -> peso editável
  const [aplicar, setAplicar] = useState([]);     // funções em que o novo critério será criado
  const [novo, setNovo] = useState({ label: '', pct_aceitavel: 80 });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    API.get('/referencias/funcoes').then(r => {
      const fs = r.data.funcoes || [];
      setFuncoes(fs);
      if (fs.length && !funcaoId) setFuncaoId(fs[0].id);
    });
  }, [API]); // eslint-disable-line

  const carregar = useCallback(() => {
    if (!funcaoId) return;
    API.get(`/indicadores/${funcaoId}`).then(r => { const cs = r.data.criterios || []; setCriterios(cs); setPesosEdit(Object.fromEntries(cs.map(c => [c.id, c.peso]))); }).catch(() => setCriterios([]));
  }, [API, funcaoId]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setAplicar([funcaoId].filter(Boolean)); }, [funcaoId]);

  const totalEdit = criterios.reduce((a, c) => a + (Number(pesosEdit[c.id]) || 0), 0);

  async function adicionar() {
    setMsg('');
    if (!novo.label.trim()) { setMsg('Dê um nome ao critério.'); return; }
    const alvos = (aplicar.length ? aplicar : [funcaoId]).filter(Boolean);
    try {
      for (const fid of alvos) await API.post(`/indicadores/${fid}`, { label: novo.label.trim(), pct_aceitavel: Number(novo.pct_aceitavel) || 80 });
      carregar();
      setNovo({ label: '', pct_aceitavel: 80 });
      setMsg(alvos.length > 1 ? `✅ Critério criado em ${alvos.length} funções.` : '✅ Critério adicionado.');
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro ao adicionar.'); }
  }
  async function remover(id) {
    try { const r = await API.delete(`/indicadores/${funcaoId}/${id}`); const cs = r.data.criterios; setCriterios(cs); setPesosEdit(Object.fromEntries(cs.map(c => [c.id, c.peso]))); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro ao remover.'); }
  }
  async function salvarPct(id, pct) {
    try { const r = await API.patch(`/indicadores/${funcaoId}/${id}`, { pct_aceitavel: pct }); setCriterios(r.data.criterios); }
    catch (e) { /* mantém valor anterior */ }
  }
  function dividirIgual() {
    const n = criterios.length; if (!n) return;
    const base = Math.floor(100 / n), resto = 100 - base * n;
    setPesosEdit(Object.fromEntries(criterios.map((c, i) => [c.id, base + (i < resto ? 1 : 0)])));
  }
  async function salvarPesos() {
    const itens = criterios.map(c => ({ id: c.id, peso: Math.round(Number(pesosEdit[c.id]) || 0), ativo: 1 }));
    const soma = itens.reduce((a, i) => a + i.peso, 0);
    if (soma !== 100) { setMsg(`Os pesos devem somar 100 (atual: ${soma}). Use "dividir igual" ou ajuste.`); return; }
    try { await API.put('/config/indicadores', { funcao_id: funcaoId, itens }); setMsg('✅ Pesos salvos.'); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro ao salvar pesos.'); }
  }

  return (
    <div style={s.wrap}>
      <Banner emoji="👤" titulo="Indicadores por função — avaliação da pessoa" cor="roxo" />
      <div style={s.sub}>Critérios que avaliam <strong>cada colaborador</strong> daquela função (Caixa, Vendedor, Conferente…). Aqui você <strong>cria o indicador, define o peso e o % aceitável</strong>, e pode aplicá-lo a <strong>uma ou várias funções</strong>. Os pesos somam 100 (use “dividir igual” ou ajuste na mão). Não confunda com os "Pilares da loja", que dão a nota do gerente/loja.</div>

      <div style={s.card}>
        <label style={s.rotulo}>Função</label>
        <select style={s.campo} value={funcaoId} onChange={e => setFuncaoId(e.target.value)}>
          {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
      </div>

      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Critérios ({criterios.length})</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: totalEdit === 100 ? '#3B6D11' : '#993C1D' }}>Peso total: {totalEdit}/100 {totalEdit === 100 ? '✅' : '⚠️'}</span>
        </div>

        {criterios.length === 0 && <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>Nenhum critério ainda. Adicione abaixo.</div>}

        {criterios.map(c => (
          <div key={c.id} style={s.crit}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</div>
              {c.fonte && <div style={{ fontSize: 10, color: '#185FA5', marginTop: 2 }}>📊 Fonte: {c.fonte}</div>}
            </div>
            <div style={{ textAlign: 'center' }}>
              <label style={{ fontSize: 10, color: '#999', display: 'block' }}>peso</label>
              <input type="number" min="0" max="100" value={pesosEdit[c.id] ?? c.peso} style={s.pctInput}
                onChange={e => setPesosEdit({ ...pesosEdit, [c.id]: e.target.value })} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <label style={{ fontSize: 10, color: '#999', display: 'block' }}>% aceitável</label>
              <input type="number" min="0" max="100" defaultValue={c.pct_aceitavel} style={s.pctInput}
                onBlur={e => salvarPct(c.id, e.target.value)} />
            </div>
            <button style={s.btnRemover} onClick={() => remover(c.id)} title="Remover">✕</button>
          </div>
        ))}

        <div style={s.barra}>
          {criterios.map((c, i) => (
            <div key={c.id} style={{ width: `${Number(pesosEdit[c.id]) || 0}%`, background: CORES[i % CORES.length], height: '100%' }} title={`${c.label}: ${pesosEdit[c.id]}%`} />
          ))}
        </div>
        {criterios.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <button style={s.btnGhost} onClick={dividirIgual}>÷ Dividir igual</button>
            <button style={s.btn} onClick={salvarPesos}>Salvar pesos</button>
          </div>
        )}
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Adicionar critério</div>
        <input style={s.campo} placeholder="Nome do critério (ex.: Erros de entrada)" value={novo.label}
          onChange={e => setNovo({ ...novo, label: e.target.value })} />
        <label style={s.rotulo}>% aceitável (mínimo para não impactar)</label>
        <input style={s.campo} type="number" min="0" max="100" value={novo.pct_aceitavel}
          onChange={e => setNovo({ ...novo, pct_aceitavel: e.target.value })} />
        <label style={s.rotulo}>Aplicar a estas funções (marque uma ou várias)</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {funcoes.map(f => {
            const on = aplicar.includes(f.id);
            return (
              <button key={f.id} type="button" onClick={() => setAplicar(on ? aplicar.filter(x => x !== f.id) : [...aplicar, f.id])}
                style={{ fontSize: 12, padding: '5px 11px', borderRadius: 20, cursor: 'pointer', border: '1px solid ' + (on ? '#6A3AB0' : '#ddd'), background: on ? '#6A3AB0' : '#fff', color: on ? '#fff' : '#555' }}>
                {on ? '✓ ' : ''}{f.nome}
              </button>
            );
          })}
        </div>
        {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginBottom: 8 }}>{msg}</div>}
        <button style={s.btn} onClick={adicionar}>+ Adicionar {aplicar.length > 1 ? `em ${aplicar.length} funções` : ''}</button>
      </div>

      <div style={s.info}>
        💡 Ao adicionar ou remover um critério, o sistema divide os 100 pontos igualmente entre eles —
        você nunca precisa calcular peso na mão. O <strong>% aceitável</strong> é o mínimo que a pessoa
        precisa naquele critério para não impactar (nem ser impactada por) o indicador do gerente.
      </div>
    </div>
  );
}

const CORES = ['#185FA5', '#3B6D11', '#856404', '#993C1D', '#3C3489', '#BA7517', '#1A4D00'];
const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  rotulo: { display: 'block', fontSize: 12, color: '#666', marginBottom: 3 },
  campo: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', marginBottom: 8 },
  crit: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f5f5f5' },
  pctInput: { width: 56, padding: '4px 6px', fontSize: 12, border: '1px solid #ddd', borderRadius: 6, textAlign: 'center' },
  btnRemover: { background: '#FCEBEB', color: '#993C1D', border: 'none', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', fontSize: 12 },
  barra: { display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 10, background: '#f0f0f0' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnGhost: { fontSize: 12.5, padding: '8px 12px', background: '#fff', color: '#555', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' },
  info: { background: '#E6F1FB', borderLeft: '3px solid #185FA5', borderRadius: '0 8px 8px 0', padding: '10px 12px', fontSize: 12, color: '#185FA5', lineHeight: 1.6 },
};
