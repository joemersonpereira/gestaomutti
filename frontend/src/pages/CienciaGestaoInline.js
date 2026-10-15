import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

// Notificação de ciência da gestão (origem='ciencia_gestao'): confirmar fica no histórico da tarefa.
export default function CienciaGestaoInline({ assinaturaId, concluido, onChange }) {
  const { API } = useAuth();
  const [a, setA] = useState(null);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => { API.get(`/assinaturas/${assinaturaId}`).then(r => setA(r.data)).catch(() => setA(false)); }, [API, assinaturaId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function confirmar() {
    try { await API.post(`/assinaturas/${assinaturaId}/ciencia-gestao`, {}); setMsg('✅ Ciência registrada.'); onChange?.(); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }
  if (a === null) return <div style={s.box}>Carregando…</div>;
  if (a === false) return null;

  return (
    <div style={s.box}>
      {a.texto && <div style={{ fontSize: 12, color: '#444', marginBottom: 8 }}>{a.texto}</div>}
      {!concluido && <button style={s.btn} onClick={confirmar}>✅ Confirmar ciência</button>}
      <Historico hist={a.historico} />
      {msg && <div style={{ fontSize: 11, color: '#3B6D11', marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

export function Historico({ hist }) {
  if (!hist || !hist.length) return null;
  const fmtDt = d => { try { return new Date(d.replace(' ', 'T') + 'Z').toLocaleString('pt-BR'); } catch { return d; } };
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 4 }}>HISTÓRICO DE CIÊNCIAS</div>
      {hist.map((h, i) => (
        <div key={i} style={{ fontSize: 11, color: '#555', padding: '2px 0', borderTop: i ? '1px solid #f3f3f3' : 'none' }}>
          ✓ <strong>{h.nome}</strong> <span style={{ color: '#999' }}>· {h.papel || '—'} · {fmtDt(h.criado_em)}{h.ip ? ` · IP ${h.ip}` : ''}</span>
        </div>
      ))}
    </div>
  );
}

const s = {
  box: { background: '#F4F7FB', border: '1px solid #DBE6F0', borderRadius: 10, padding: '10px 12px', marginTop: 8 },
  btn: { fontSize: 12, padding: '6px 12px', border: 'none', borderRadius: 8, background: '#111', color: '#fff', cursor: 'pointer' },
};
