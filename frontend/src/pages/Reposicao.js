import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

export default function Reposicao() {
  const { API, usuario } = useAuth();
  const ehGestao = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState(usuario.loja_id || '');
  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(hoje);
  const [colabs, setColabs] = useState([]);
  const [adicionados, setAdicionados] = useState([]); // ids de quem o gerente disse estar na loja hoje
  const [marcas, setMarcas] = useState({});
  const [sel, setSel] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => { if (ehGestao) API.get('/referencias/lojas').then(r => { const l = r.data.lojas || []; setLojas(l); if (!lojaId && l.length) setLojaId(l[0].id); }); }, [API, ehGestao, lojaId]);

  const carregar = useCallback(() => {
    if (!lojaId) return;
    API.get('/checklist/reposicao', { params: { loja_id: lojaId, data } }).then(r => {
      setColabs(r.data.colaboradores || []);
      setAdicionados([]); setMarcas({}); setSel('');
    });
  }, [API, lojaId, data]);
  useEffect(() => { carregar(); }, [carregar]);

  const avaliados = colabs.filter(c => c.fez != null);              // já avaliados hoje (travados)
  const candidatos = colabs.filter(c => c.fez == null && !adicionados.includes(c.id)); // disponíveis pra adicionar
  const naLista = adicionados.map(id => colabs.find(c => c.id === id)).filter(Boolean); // adicionados (presentes)

  function adicionar() { if (sel && !adicionados.includes(sel)) { setAdicionados([...adicionados, sel]); setSel(''); } }
  function remover(id) { setAdicionados(adicionados.filter(x => x !== id)); const m = { ...marcas }; delete m[id]; setMarcas(m); }

  async function salvar() {
    if (!naLista.length) { setMsg('Adicione quem está na loja hoje.'); return; }
    const semMarca = naLista.filter(c => marcas[c.id] === undefined);
    if (semMarca.length) { setMsg(`Marque Fez / Não fez para: ${semMarca.map(c => c.nome).join(', ')}.`); return; }
    const avaliacoes = naLista.map(c => ({ colaborador_id: c.id, fez: marcas[c.id] === true }));
    const r = await API.post('/checklist/reposicao', { loja_id: lojaId, data, avaliacoes });
    setMsg(`✅ Registrado para ${avaliacoes.length} colaborador(es). ${r.data.tarefas_geradas} tarefa(s) gerada(s).${r.data.alerta_disciplina ? ' ⚠️ Há colaborador com 3+ faltas — disciplina impactada.' : ''}`);
    carregar();
  }

  return (
    <div style={s.wrap}>
      <Banner emoji="🔄" titulo="Reposição" cor="ciano" sub="Adicione quem está na loja hoje e marque Fez / Não fez — só quem você adicionar entra no cálculo. Quem ficar “Não fez” recebe uma tarefa." />

      <div style={s.card}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ehGestao && (
            <select style={{ ...s.campo, width: 'auto', marginBottom: 0 }} value={lojaId} onChange={e => setLojaId(e.target.value)}>
              {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          )}
          <input style={{ ...s.campo, width: 'auto', marginBottom: 0 }} type="date" value={data} onChange={e => setData(e.target.value)} />
        </div>
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Quem está na loja hoje</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <select style={{ ...s.campo, marginBottom: 0, flex: 1, minWidth: 180 }} value={sel} onChange={e => setSel(e.target.value)}>
            <option value="">+ adicionar colaborador…</option>
            {candidatos.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.funcao}</option>)}
          </select>
          <button style={s.btn} disabled={!sel} onClick={adicionar}>Adicionar</button>
        </div>

        {naLista.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Ninguém adicionado ainda. Use o seletor acima para incluir quem está presente.</div>}
        {naLista.map(c => (
          <div key={c.id} style={s.linha}>
            <div><div style={{ fontSize: 13, fontWeight: 600 }}>{c.nome}</div><div style={{ fontSize: 11, color: '#999' }}>{c.funcao}</div></div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => setMarcas({ ...marcas, [c.id]: true })} style={{ ...s.toggle, ...(marcas[c.id] === true ? s.tOk : {}) }}>Fez</button>
              <button onClick={() => setMarcas({ ...marcas, [c.id]: false })} style={{ ...s.toggle, ...(marcas[c.id] === false ? s.tBad : {}) }}>Não fez</button>
              <button onClick={() => remover(c.id)} title="remover" style={{ ...s.toggle, border: 'none', color: '#bbb', padding: '5px 6px' }}>✕</button>
            </div>
          </div>
        ))}

        {naLista.length > 0 && <button style={{ ...s.btn, marginTop: 12 }} onClick={salvar}>Salvar reposição do dia</button>}
        {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#854F0B', marginTop: 8 }}>{msg}</div>}
      </div>

      {avaliados.length > 0 && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Já avaliados hoje</div>
          {avaliados.map(c => (
            <div key={c.id} style={s.linha}>
              <div><div style={{ fontSize: 13, fontWeight: 600 }}>{c.nome}</div><div style={{ fontSize: 11, color: '#999' }}>{c.funcao}</div></div>
              <span style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6, ...(c.fez ? { background: '#EAF3DE', color: '#3B6D11' } : { background: '#FCEBEB', color: '#993C1D' }) }}>
                {c.fez ? '✓ Fez' : '✗ Não fez'} <span style={{ fontSize: 10, opacity: 0.7 }}>· avaliado</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={s.info}>💡 Adicione apenas quem está na loja no dia. Quem ficar "Não fez" recebe uma <strong>tarefa de ciência/correção</strong> no Kanban. Colaborador que acumular <strong>3 faltas no mês</strong> derruba a <strong>Disciplina operacional</strong> — e a premiação base do gerente cai para 3%.</div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 820, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  campo: { padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, marginBottom: 8 },
  linha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f5f5' },
  toggle: { fontSize: 12, padding: '5px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#666' },
  tOk: { background: '#EAF3DE', color: '#3B6D11', borderColor: '#3B6D11' },
  tBad: { background: '#FCEBEB', color: '#993C1D', borderColor: '#993C1D' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  info: { background: '#E6F1FB', borderLeft: '3px solid #185FA5', borderRadius: '0 8px 8px 0', padding: '10px 12px', fontSize: 12, color: '#185FA5', lineHeight: 1.6 },
};
