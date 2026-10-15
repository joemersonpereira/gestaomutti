import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import ChecklistLimpezaInline from './ChecklistLimpezaInline';

const OP = [['bom', 'Bom', '#3B6D11', '#EAF3DE'], ['regular', 'Regular', '#854F0B', '#FAEEDA'], ['ruim', 'Ruim', '#993C1D', '#FCEBEB'], ['np', 'N/P', '#666', '#eee']];

export default function Checklist() {
  const { API } = useAuth();
  const [modelos, setModelos] = useState([]);
  const [exec, setExec] = useState({});
  const [ativo, setAtivo] = useState(null);
  const [resp, setResp] = useState({});
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    API.get('/checklist/modelos').then(r => setModelos(r.data.modelos || []));
    API.get('/checklist/execucoes').then(r => setExec(r.data || {}));
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  // O checklist de limpeza diário vira ciclo abrir/fechar; os demais (mensal etc.) seguem avulsos.
  const ehDiarioLimpeza = m => m.periodo === 'diario' && m.categoria === 'limpeza';
  const diarioLimpeza = modelos.find(ehDiarioLimpeza);
  const outros = modelos.filter(m => !ehDiarioLimpeza(m));

  function abrir(m) { setAtivo(m); const r = {}; m.itens.forEach(i => r[i.id] = 'bom'); setResp(r); setMsg(''); }
  async function enviar() {
    const respostas = ativo.itens.map(i => ({ item_id: i.id, resposta: resp[i.id] || 'bom' }));
    const r = await API.post('/checklist/executar', { modelo_id: ativo.id, respostas });
    setMsg(`✅ Registrado · nota ${r.data.nota}` + (r.data.tarefa_gerada ? ' · tarefa gerada' : ''));
    setAtivo(null); carregar();
  }

  return (
    <div style={s.wrap}>
      <Banner emoji="🧹" titulo="Checklist de Limpeza" cor="ciano" sub="Abra de manhã, confira durante o dia e feche no fim — igual o Diário" />
      {exec.media != null && <div style={s.card}><span style={{ fontSize: 12, color: '#666' }}>Média recente: </span><strong style={{ color: exec.media >= 95 ? '#3B6D11' : '#BA7517' }}>{exec.media}/100</strong></div>}
      {msg && <div style={{ ...s.card, color: '#3B6D11' }}>{msg}</div>}

      {/* Ciclo diário (abrir → conferir → fechar) */}
      {!ativo && diarioLimpeza && <ChecklistLimpezaInline onChange={carregar} />}

      {/* Demais modelos (mensal etc.) — execução avulsa */}
      {!ativo && outros.map(m => (
        <div key={m.id} style={s.card} onClick={() => abrir(m)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{m.nome}</span>
            <span style={s.tag}>{m.periodo}</span>
          </div>
          <div style={{ fontSize: 11, color: '#999' }}>{m.itens.length} itens · toque para executar</div>
        </div>
      ))}
      {!ativo && modelos.length === 0 && <div style={s.card}>Nenhum modelo de checklist cadastrado.</div>}

      {ativo && (
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{ativo.nome}</div>
          {ativo.itens.map(i => (
            <div key={i.id} style={s.itemRow}>
              <span style={{ flex: 1, fontSize: 12 }}>{i.texto}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {OP.map(([v, label, cor, bg]) => (
                  <button key={v} onClick={() => setResp({ ...resp, [i.id]: v })}
                    style={{ ...s.op, fontWeight: 600, ...(resp[i.id] === v ? { borderColor: cor, background: bg, color: cor } : { color: '#888' }) }}>{label}</button>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <button style={s.btn} onClick={enviar}>Registrar checklist</button>
            <button style={s.btnGhost} onClick={() => setAtivo(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {!ativo && exec.execucoes && exec.execucoes.length > 0 && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Execuções recentes</div>
          {exec.execucoes.slice(0, 10).map(e => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
              <span>{e.modelo_nome} · {e.data}</span>
              <strong style={{ color: e.nota >= 95 ? '#3B6D11' : e.nota >= 75 ? '#BA7517' : '#993C1D' }}>{e.nota}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  tag: { fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#E6F1FB', color: '#185FA5' },
  itemRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #f5f5f5' },
  op: { fontSize: 14, padding: '3px 8px', border: '1px solid #ddd', borderRadius: 6, background: 'none', cursor: 'pointer' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnSec: { fontSize: 13, padding: '8px 14px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnGhost: { fontSize: 13, padding: '8px 14px', background: 'none', color: '#666', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' },
  dateInput: { padding: '7px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8 },
  info: { fontSize: 11, color: '#888', marginTop: 12, lineHeight: 1.5 },
};
