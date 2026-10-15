import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Lista COMPLETA de itens de um alerta de compra (nome + código de barras), expansível.
// Usada dentro da tarefa (Kanban) e na aba Alertas do Painel de Compras.
export default function AlertaItensInline({ refId, resumo }) {
  const { API } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState(null);
  const [busca, setBusca] = useState('');

  const abrir = () => {
    setAberto(a => !a);
    if (!itens) API.get('/compras/alertas/itens', { params: { ref: refId } }).then(r => setItens(r.data.itens || [])).catch(() => setItens([]));
  };
  const lista = (itens || []).filter(i => !busca
    || (i.descricao || '').toLowerCase().includes(busca.toLowerCase())
    || (i.ean || '').includes(busca)
    || (i.classificacao || '').toLowerCase().includes(busca.toLowerCase()));

  const exportarExcel = () => {
    const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const linhas = [['Produto', 'Código de barras', 'Classificação', 'Info']];
    lista.forEach(i => linhas.push([i.descricao, i.ean || '', i.classificacao || '', i.extra || '']));
    const csv = '﻿' + linhas.map(l => l.map(esc).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `itens_${(refId || 'alerta').replace(/[:]/g, '-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <div style={{ marginTop: 6 }}>
      <button onClick={abrir} style={s.toggle}>{aberto ? '▾ ocultar itens' : `▸ ver todos os itens${resumo ? ` (${resumo})` : ''}`}</button>
      {aberto && (
        <div style={s.box}>
          {itens === null && <div style={{ fontSize: 12, color: '#999' }}>Carregando…</div>}
          {itens && itens.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Sem itens registrados neste alerta.</div>}
          {itens && itens.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔎 filtrar por nome, código ou classificação" style={s.busca} />
                <span style={{ fontSize: 11, color: '#999' }}>{lista.length} de {itens.length}</span>
                <button onClick={exportarExcel} style={s.xls}>⬇️ Excel</button>
              </div>
              <div style={s.scroll}>
                {lista.map((it, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '3px 0', borderBottom: '1px solid #f2f2f2' }}>
                    <span style={{ fontSize: 12, color: '#333', flex: 1, fontWeight: 500 }}>{it.descricao}</span>
                    {it.classificacao && <span style={{ fontSize: 10, color: '#2C6FA6', background: '#EAF3FB', borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>{it.classificacao}</span>}
                    {it.ean && <span style={{ fontSize: 11, color: '#8a6d3b', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>🔖 {it.ean}</span>}
                    {it.extra && <span style={{ fontSize: 10.5, color: '#aaa', whiteSpace: 'nowrap' }}>{it.extra}</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  toggle: { border: 'none', background: 'none', cursor: 'pointer', color: '#2C6FA6', fontWeight: 600, fontSize: 12, padding: 0 },
  box: { marginTop: 6, background: '#fafafa', border: '1px solid #eee', borderRadius: 10, padding: '10px 12px' },
  busca: { flex: 1, minWidth: 160, padding: '5px 8px', fontSize: 12, border: '1px solid #ddd', borderRadius: 6 },
  xls: { fontSize: 11.5, padding: '5px 10px', background: '#1E7A46', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' },
  scroll: { maxHeight: 300, overflowY: 'auto' },
};
