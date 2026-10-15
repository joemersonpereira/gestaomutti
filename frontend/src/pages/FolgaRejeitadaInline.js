import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const fmt = d => { try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };
const hojeStr = new Date().toISOString().slice(0, 10);

// Card de folga recusada: o solicitante pode pedir outro dia ou encerrar.
export default function FolgaRejeitadaInline({ folgaId, onChange }) {
  const { API } = useAuth();
  const [fo, setFo] = useState(null);
  const [data, setData] = useState(hojeStr);
  const [motivo, setMotivo] = useState('');
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    API.get(`/folgas/${folgaId}`).then(r => setFo(r.data)).catch(() => setFo(false));
  }, [API, folgaId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function repropor() {
    if (!data) { setMsg('Escolha a nova data.'); return; }
    try {
      const r = await API.post(`/folgas/${folgaId}/repropor`, { data, motivo });
      const fila = r.data.fila_total > 1 ? ` · ${r.data.fila_posicao}º na fila` : '';
      setMsg(`✅ ${r.data.mensagem}${fila}`); onChange?.();
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }
  async function encerrar() {
    try { await API.post(`/folgas/${folgaId}/encerrar-recusa`, {}); onChange?.(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }

  if (fo === null) return <div style={s.box}>Carregando…</div>;
  if (fo === false) return null;

  return (
    <div style={s.box}>
      <div style={{ fontSize: 12, color: '#993C1D', fontWeight: 600, marginBottom: 6 }}>Folga de {fmt(fo.data)} recusada{fo.aprovado_por_nome ? ` por ${fo.aprovado_por_nome}` : ''}.</div>
      <div style={{ fontSize: 11, color: '#777', marginBottom: 8 }}>Quer pedir outro dia?</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={data} onChange={e => setData(e.target.value)} style={s.campo} />
        <input placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} style={{ ...s.campo, flex: 1, minWidth: 120 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button style={s.ok} onClick={repropor}>Pedir outro dia</button>
        <button style={s.ghost} onClick={encerrar}>Encerrar</button>
      </div>
      {msg && <div style={{ fontSize: 11, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

const s = {
  box: { background: '#FCEBEB', border: '1px solid #F1C9C2', borderRadius: 10, padding: '10px 12px', marginTop: 8 },
  campo: { padding: '6px 8px', fontSize: 12, border: '1px solid #ddd', borderRadius: 6 },
  ok: { fontSize: 12, padding: '6px 12px', border: 'none', borderRadius: 8, background: '#111', color: '#fff', cursor: 'pointer' },
  ghost: { fontSize: 12, padding: '6px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'none', color: '#666', cursor: 'pointer' },
};
