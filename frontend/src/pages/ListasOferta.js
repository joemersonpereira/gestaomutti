import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

// Listas de oferta — o comprador vê as solicitações do Marketing e responde com a lista
// de produtos em oferta, dentro do prazo. Atraso conta no indicador dele (premiação).
const dBR = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');

export default function ListasOferta() {
  const { API } = useAuth();
  const [sols, setSols] = useState(null);
  const [cadernos, setCadernos] = useState([]);
  const [sel, setSel] = useState({}); // id -> { caderno_id, obs }
  const carregar = useCallback(() => API.get('/mkt/comprador/solicitacoes').then(r => setSols(r.data.solicitacoes || [])).catch(() => setSols([])), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/vendas/cadernos-oferta').then(r => setCadernos(r.data.cadernos || [])).catch(() => setCadernos([])); }, [API]);
  const enviar = (id) => {
    const e = sel[id] || {}; if (!e.caderno_id) return;
    const cad = cadernos.find(c => String(c.id) === String(e.caderno_id));
    API.post(`/mkt/agenda/${id}/comprador-resposta`, { caderno_id: e.caderno_id, caderno_nome: cad?.nome, resposta: e.obs }).then(() => { setSel(s => ({ ...s, [id]: {} })); carregar(); });
  };
  const pend = (sols || []).filter(s => s.comprador_status !== 'respondido');
  const feitas = (sols || []).filter(s => s.comprador_status === 'respondido');

  return (
    <div style={s.wrap}>
      <Banner emoji="🛒" titulo="Listas de oferta" cor="laranja" sub="Solicitações do Marketing: envie a lista de produtos em oferta dentro do prazo." />
      {!sols && <div style={{ ...s.card, color: '#999' }}>Carregando…</div>}
      {sols && sols.length === 0 && <div style={{ ...s.card, textAlign: 'center', color: '#999' }}>Nenhuma solicitação de lista de oferta no momento. 🎉</div>}

      {pend.length > 0 && <div style={{ fontSize: 13, fontWeight: 800, margin: '4px 0 8px' }}>⏳ Pendentes ({pend.length})</div>}
      {pend.map(sol => (
        <div key={sol.id} style={{ ...s.card, borderLeft: `4px solid ${sol.atrasada ? '#C0392B' : '#E0912F'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>📣 {sol.titulo}</div>
            {sol.atrasada
              ? <span style={{ fontSize: 10, color: '#fff', background: '#C0392B', borderRadius: 5, padding: '1px 7px' }}>atrasada</span>
              : <span style={{ fontSize: 10, color: '#fff', background: '#E0912F', borderRadius: 5, padding: '1px 7px' }}>pendente</span>}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: sol.atrasada ? '#C0392B' : '#666' }}>{sol.comprador_prazo ? `prazo ${dBR(sol.comprador_prazo)}` : 'sem prazo'}</span>
          </div>
          <div style={{ fontSize: 11.5, color: '#999', marginTop: 2 }}>{sol.canal ? `${sol.canal} · ` : ''}{dBR(sol.data_ini)}{!sol.souEu ? ` · comprador: ${sol.comprador_nome}` : ''}</div>
          {sol.souEu ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11.5, color: '#666', marginBottom: 4 }}>Selecione o <b>caderno de oferta</b> (criado no ERP) desta ação:</div>
              <select value={(sel[sol.id] || {}).caderno_id || ''} onChange={e => setSel(x => ({ ...x, [sol.id]: { ...(x[sol.id] || {}), caderno_id: e.target.value } }))} style={s.inp}>
                <option value="">Escolha o caderno de oferta…</option>
                {cadernos.map(c => <option key={c.id} value={c.id}>{c.nome}{c.fim ? ` · val. ${dBR(c.fim)}` : ''}{c.itens ? ` · ${c.itens} itens` : ''}</option>)}
              </select>
              {cadernos.length === 0 && <div style={{ fontSize: 11, color: '#B7791F', marginBottom: 6 }}>Nenhum caderno de oferta vigente no ERP no momento.</div>}
              <input value={(sel[sol.id] || {}).obs || ''} onChange={e => setSel(x => ({ ...x, [sol.id]: { ...(x[sol.id] || {}), obs: e.target.value } }))} placeholder="Observação (opcional)" style={s.inp} />
              <button onClick={() => enviar(sol.id)} disabled={!(sel[sol.id] || {}).caderno_id} style={{ ...s.btn, opacity: (sel[sol.id] || {}).caderno_id ? 1 : 0.5 }}>Enviar caderno</button>
            </div>
          ) : <div style={{ fontSize: 11.5, color: '#B7791F', marginTop: 6 }}>Aguardando o comprador responder.</div>}
        </div>
      ))}

      {feitas.length > 0 && <div style={{ fontSize: 13, fontWeight: 800, margin: '14px 0 8px' }}>✅ Respondidas ({feitas.length})</div>}
      {feitas.map(sol => (
        <div key={sol.id} style={{ ...s.card, borderLeft: '4px solid #1E8449' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>📣 {sol.titulo}</div>
            <span style={{ fontSize: 10, color: '#fff', background: sol.comprador_no_prazo === 0 ? '#C0392B' : '#1E8449', borderRadius: 5, padding: '1px 7px' }}>{sol.comprador_no_prazo === 0 ? 'fora do prazo' : 'no prazo'}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#999' }}>{sol.comprador_nome} · {dBR(sol.comprador_respondido_em)}</span>
          </div>
          <div style={{ fontSize: 12.5, color: '#333', marginTop: 6, background: '#FAFAF7', borderRadius: 8, padding: '7px 10px' }}>
            📕 Caderno: <b>{sol.comprador_caderno_nome || '—'}</b>
            {sol.comprador_resposta && <div style={{ fontSize: 11.5, color: '#777', marginTop: 3, whiteSpace: 'pre-wrap' }}>{sol.comprador_resposta}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 860, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  inp: { width: '100%', padding: '9px 11px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, marginBottom: 8, fontFamily: 'inherit', boxSizing: 'border-box' },
  btn: { fontSize: 13, padding: '9px 16px', background: '#E0912F', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
};
