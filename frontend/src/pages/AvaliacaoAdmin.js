import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { LancarDiferenca, ChecklistConduta } from './AvaliacaoSetorItens';

const NOTAS = [['bom', 'Bom', '#3B6D11', '#EAF3DE'], ['regular', 'Regular', '#854F0B', '#FAEEDA'], ['ruim', 'Ruim', '#993C1D', '#FCEBEB']];

export default function AvaliacaoAdmin() {
  const { API } = useAuth();
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [lista, setLista] = useState([]);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    API.get('/avaliacao-admin', { params: { data } }).then(r => setLista(r.data.avaliacoes || [])).catch(() => {});
  }, [API, data]);
  useEffect(() => { carregar(); }, [carregar]);

  const pendentes = lista.filter(a => a.status === 'pendente' || a.status === 'contestada');
  const feitas = lista.filter(a => a.status === 'avaliada');

  return (
    <div style={s.wrap}>
      <Banner emoji="⭐" titulo="Avaliações do setor" cor="roxo" sub="Avalie as pessoas do seu setor quando o gerente abre o checklist do dia." />

      <div style={s.card}>
        <label style={{ fontSize: 11, color: '#999' }}>Dia</label>
        <input type="date" value={data} onChange={e => setData(e.target.value)} style={s.input} />
      </div>

      {msg && <div style={{ ...s.card, color: '#993C1D', fontSize: 12 }}>{msg}</div>}

      {lista.length === 0 && <div style={s.card}><div style={{ fontSize: 12, color: '#999' }}>Nenhuma avaliação para este dia. Elas aparecem quando o gerente abre o Checklist Diário.</div></div>}

      {pendentes.length > 0 && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>A avaliar ({pendentes.length})</div>
          {pendentes.map(a => (
            <div key={a.id} style={{ padding: '8px 0', borderTop: '1px solid #f5f5f5' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{a.avaliado_nome}{a.status === 'contestada' && <span style={{ fontSize: 10, color: '#854F0B', background: '#FAEEDA', padding: '2px 8px', borderRadius: 10, marginLeft: 8 }}>contestou — reavaliar</span>}</div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>{a.funcao_nome} · {a.loja_nome}{a.chefe_nome ? ` · chefe: ${a.chefe_nome}` : ''}</div>
              {a.status === 'contestada' && a.reanalise_motivo && <div style={{ fontSize: 12, color: '#854F0B', background: '#FAEEDA', padding: '6px 8px', borderRadius: 8, marginBottom: 6 }}>Motivo: {a.reanalise_motivo}</div>}
              {a.funcao_id === 'func-caixa' && <LancarDiferenca a={a} API={API} />}
              <ChecklistConduta a={a} API={API} onSaved={carregar} />
            </div>
          ))}
        </div>
      )}

      {feitas.length > 0 && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Avaliadas ({feitas.length})</div>
          {feitas.map(a => {
            const n = NOTAS.find(x => x[0] === a.nota) || ['', a.nota, '#666', '#eee'];
            return (
              <div key={a.id} style={{ padding: '6px 0', borderTop: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.avaliado_nome}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{a.funcao_nome} · {a.loja_nome}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: n[2], background: n[3], padding: '3px 10px', borderRadius: 10 }}>{n[1]}{a.nota_pct != null ? ` · ${a.nota_pct}%` : ''}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: { maxWidth: 760, margin: '0 auto' },
  titulo: { fontSize: 20, fontWeight: 700 },
  sub: { fontSize: 13, color: '#666', marginBottom: 12 },
  card: { background: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  input: { width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', marginTop: 4 },
};
