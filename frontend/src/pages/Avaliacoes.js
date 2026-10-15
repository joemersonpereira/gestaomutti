import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const FUNCOES = [['func-farmaceutico', 'Farmacêutico'], ['func-estagiario', 'Estagiário']];
const AVAL = [['bom', 'Bom', '#3B6D11'], ['regular', 'Regular', '#BA7517'], ['ruim', 'Ruim', '#993C1D']];

export default function Avaliacoes() {
  const { API, usuario } = useAuth();
  const [funcao, setFuncao] = useState('func-farmaceutico');
  const [colabs, setColabs] = useState([]);
  const [sel, setSel] = useState('');
  const [dados, setDados] = useState(null);
  const [edit, setEdit] = useState({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    API.get('/colaboradores', { params: { funcao_id: funcao, ...(usuario.funcao === 'Gerente' ? { loja_id: usuario.loja_id } : {}) } }).then(r => { setColabs(r.data.colaboradores); setSel(''); setDados(null); });
  }, [API, funcao, usuario]);

  const carregar = useCallback(id => {
    API.get(`/avaliacoes/${id}`).then(r => { setDados(r.data); const e = {}; r.data.indicadores.forEach(i => e[i.indicador] = i.avaliacao); setEdit(e); });
  }, [API]);

  function escolher(id) { setSel(id); setMsg(''); if (id) carregar(id); else setDados(null); }
  async function salvar() {
    const r = await API.post(`/avaliacoes/${sel}`, { avaliacoes: edit });
    setMsg(`✅ Salvo · nota ${r.data.nota}/100` + (r.data.tarefa_gerada ? ' · tarefa de desenvolvimento gerada' : ''));
    carregar(sel);
  }

  return (
    <div style={s.wrap}>
      <Banner emoji="⭐" titulo="Avaliações" cor="roxo" sub="Farmacêutico e estagiário" />

      <div style={s.tabs}>
        {FUNCOES.map(([id, l]) => <button key={id} onClick={() => setFuncao(id)} style={{ ...s.tab, ...(funcao === id ? s.tabAtiva : {}) }}>{l}</button>)}
      </div>

      <div style={s.card}>
        <select style={s.input} value={sel} onChange={e => escolher(e.target.value)}>
          <option value="">Selecione o colaborador…</option>
          {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>

        {dados && (
          <>
            {dados.indicadores.map(ind => (
              <div key={ind.indicador} style={s.itemRow}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12 }}>{ind.label}</div>
                  <div style={{ fontSize: 10, color: '#999' }}>peso {ind.peso}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {AVAL.map(([v, l, c]) => (
                    <button key={v} onClick={() => setEdit({ ...edit, [ind.indicador]: v })}
                      style={{ ...s.op, ...(edit[ind.indicador] === v ? { borderColor: c, color: c, background: c + '14' } : {}) }}>{l}</button>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ fontSize: 12, color: '#666', margin: '8px 0' }}>Nota atual: <strong style={{ color: dados.nota >= 90 ? '#3B6D11' : '#BA7517' }}>{dados.nota}/100</strong></div>
            {msg && <div style={{ fontSize: 12, color: '#3B6D11', marginBottom: 8 }}>{msg}</div>}
            <button style={s.btn} onClick={salvar}>Salvar avaliação</button>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  tabs: { display: 'flex', gap: 6, marginBottom: 12 },
  tab: { fontSize: 12, padding: '5px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666' },
  tabAtiva: { background: '#111', color: '#fff', borderColor: '#111' },
  itemRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f5f5f5' },
  op: { fontSize: 11, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6, background: 'none', cursor: 'pointer', color: '#666' },
  input: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', marginBottom: 8 },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
};
