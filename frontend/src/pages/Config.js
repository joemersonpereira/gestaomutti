import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

export default function Config({ embutido } = {}) {
  const { API } = useAuth();
  const [funcoes, setFuncoes] = useState([]);
  const [edit, setEdit] = useState({});
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    API.get('/config/indicadores').then(r => {
      setFuncoes(r.data.funcoes);
      const e = {};
      r.data.funcoes.forEach(f => f.itens.forEach(i => e[i.id] = i.peso));
      setEdit(e);
    });
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  function soma(f) { return f.itens.reduce((a, i) => a + (parseInt(edit[i.id]) || 0), 0); }
  async function salvar(f) {
    if (soma(f) !== 100) { setMsg(`⚠️ ${f.funcao_id}: pesos somam ${soma(f)}, devem somar 100.`); return; }
    await API.put('/config/indicadores', { funcao_id: f.funcao_id, itens: f.itens.map(i => ({ id: i.id, peso: parseInt(edit[i.id]) || 0, ativo: 1 })) });
    setMsg(`✅ ${f.funcao_id} salvo.`); carregar();
  }

  const nome = fid => ({ 'func-vendedor': 'Vendedor', 'func-farmaceutico': 'Farmacêutico', 'func-estagiario': 'Estagiário', 'func-conferente': 'Conferente' }[fid] || fid);

  return (
    <div style={embutido ? {} : s.wrap}>
      {!embutido && <Banner emoji="⚙️" titulo="Configurações" cor="azul" sub="Pesos dos indicadores por função (devem somar 100)" />}
      {msg && <div style={{ ...s.card, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D' }}>{msg}</div>}

      {funcoes.map(f => (
        <div key={f.funcao_id} style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{nome(f.funcao_id)}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: soma(f) === 100 ? '#3B6D11' : '#993C1D' }}>Σ {soma(f)}/100</span>
          </div>
          {f.itens.map(i => (
            <div key={i.id} style={s.itemRow}>
              <span style={{ flex: 1, fontSize: 12 }}>{i.label}</span>
              <input type="number" style={s.peso} value={edit[i.id] ?? ''} onChange={e => setEdit({ ...edit, [i.id]: e.target.value })} />
            </div>
          ))}
          <button style={{ ...s.btn, opacity: soma(f) === 100 ? 1 : 0.6 }} onClick={() => salvar(f)}>Salvar</button>
        </div>
      ))}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  itemRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f5' },
  peso: { width: 60, padding: '6px 8px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, textAlign: 'center' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', marginTop: 10 },
};
