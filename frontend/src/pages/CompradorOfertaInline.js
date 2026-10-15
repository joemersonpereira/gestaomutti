import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

// Resposta da lista de ofertas DENTRO da tarefa (origem='mkt_comprador').
// O comprador seleciona o caderno de oferta do ERP e envia — sem tela separada.
const dBR = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');

export default function CompradorOfertaInline({ agendaId, onChange }) {
  const { API } = useAuth();
  const [sol, setSol] = useState(null);
  const [cadernos, setCadernos] = useState([]);
  const [sel, setSel] = useState({ caderno_id: '', obs: '' });
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    API.get(`/mkt/agenda/${agendaId}/comprador`).then(r => setSol(r.data.solicitacao)).catch(() => setSol(false));
  }, [API, agendaId]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/vendas/cadernos-oferta').then(r => setCadernos(r.data.cadernos || [])).catch(() => {}); }, [API]);

  const enviar = () => {
    if (!sel.caderno_id) { setMsg('Selecione o caderno de oferta.'); return; }
    const cad = cadernos.find(c => String(c.id) === String(sel.caderno_id));
    API.post(`/mkt/agenda/${agendaId}/comprador-resposta`, { caderno_id: sel.caderno_id, caderno_nome: cad?.nome, resposta: sel.obs })
      .then(() => { setMsg('✅ Caderno enviado.'); onChange?.(); carregar(); })
      .catch(e => setMsg(e.response?.data?.erro || 'Erro.'));
  };

  if (sol === null) return <div style={s.box}>Carregando…</div>;
  if (sol === false) return null;
  const respondido = sol.comprador_status === 'respondido';

  return (
    <div style={{ ...s.box, borderLeft: `4px solid ${sol.atrasada ? '#C0392B' : respondido ? '#1E8449' : '#E0912F'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>🛒 Lista de ofertas — {sol.titulo}</div>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: sol.atrasada ? '#C0392B' : '#777' }}>{sol.comprador_prazo ? `prazo ${dBR(sol.comprador_prazo)}` : 'sem prazo'}</span>
      </div>

      {respondido ? (
        <div style={{ fontSize: 12, color: '#333', marginTop: 6, background: '#F3FBF6', borderRadius: 8, padding: '7px 10px' }}>
          📕 Caderno enviado: <b>{sol.comprador_caderno_nome || '—'}</b>
          <span style={{ marginLeft: 8, fontSize: 11, color: sol.comprador_no_prazo === 0 ? '#C0392B' : '#1E8449' }}>{sol.comprador_no_prazo === 0 ? 'fora do prazo' : 'no prazo'}</span>
          {sol.comprador_resposta && <div style={{ fontSize: 11.5, color: '#777', marginTop: 3, whiteSpace: 'pre-wrap' }}>{sol.comprador_resposta}</div>}
        </div>
      ) : sol.podeResponder ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11.5, color: '#666', marginBottom: 4 }}>Selecione o <b>caderno de oferta</b> (criado no ERP):</div>
          <select value={sel.caderno_id} onChange={e => setSel(x => ({ ...x, caderno_id: e.target.value }))} style={s.sel}>
            <option value="">Escolha o caderno de oferta…</option>
            {cadernos.map(c => <option key={c.id} value={c.id}>{c.nome}{c.fim ? ` · val. ${dBR(c.fim)}` : ''}{c.itens ? ` · ${c.itens} itens` : ''}</option>)}
          </select>
          {cadernos.length === 0 && <div style={{ fontSize: 11, color: '#B7791F', marginBottom: 6 }}>Nenhum caderno de oferta vigente no ERP no momento.</div>}
          <input value={sel.obs} onChange={e => setSel(x => ({ ...x, obs: e.target.value }))} placeholder="Observação (opcional)" style={s.sel} />
          <button onClick={enviar} disabled={!sel.caderno_id} style={{ ...s.btn, opacity: sel.caderno_id ? 1 : 0.5, marginTop: 6 }}>Enviar caderno</button>
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: '#B7791F', marginTop: 6 }}>Aguardando o comprador ({sol.comprador_nome}) responder.</div>
      )}
      {msg && <div style={{ fontSize: 11.5, color: msg.startsWith('✅') ? '#1E8449' : '#C0392B', marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

const s = {
  box: { background: '#fafafa', border: '1px solid #eee', borderRadius: 10, padding: '10px 12px', marginTop: 8 },
  sel: { padding: '7px 9px', fontSize: 12, border: '1px solid #ddd', borderRadius: 6, width: '100%', boxSizing: 'border-box', marginBottom: 6, fontFamily: 'inherit' },
  btn: { fontSize: 12.5, padding: '7px 14px', background: '#E0912F', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
};
