import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Confirmação de ciência do colaborador escalado (origem='escala_ciencia').
export default function EscalaCienciaInline({ escalaId, concluido, onChange }) {
  const { API } = useAuth();
  const [msg, setMsg] = useState('');
  async function confirmar() {
    try { await API.post(`/escala/${escalaId}/ciencia`, {}); setMsg('✅ Ciência confirmada.'); onChange?.(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }
  if (concluido) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <button style={{ fontSize: 12, padding: '6px 12px', border: 'none', borderRadius: 8, background: '#111', color: '#fff', cursor: 'pointer' }} onClick={confirmar}>✅ Confirmar ciência da escala</button>
      {msg && <div style={{ fontSize: 11, color: '#3B6D11', marginTop: 6 }}>{msg}</div>}
    </div>
  );
}
