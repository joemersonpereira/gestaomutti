import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Seletor de LOJAS com múltipla seleção (checkbox). Reutilizável em todas as telas.
// value: CSV de ids ("" = todas) OU array de ids. onChange(csv) devolve o CSV de ids ("" = todas).
// lojas: opcional; se não vier, busca de /referencias/lojas. compact: botão menor.
export default function MultiLojaSelect({ value, onChange, lojas: lojasProp, compact, style }) {
  const { API } = useAuth();
  const [lojas, setLojas] = useState(lojasProp || null);
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => { if (lojasProp) setLojas(lojasProp); }, [lojasProp]);
  useEffect(() => {
    if (lojasProp) return;
    API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => setLojas([]));
  }, [API, lojasProp]);

  // Fecha ao clicar fora.
  useEffect(() => {
    const fora = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const sel = useMemo(() => {
    const v = Array.isArray(value) ? value : String(value || '').split(',');
    return new Set(v.map(x => String(x).trim()).filter(Boolean));
  }, [value]);

  const lista = lojas || [];
  const emitir = novoSet => onChange([...novoSet].join(','));
  const toggle = id => { const n = new Set(sel); const k = String(id); n.has(k) ? n.delete(k) : n.add(k); emitir(n); };
  const todas = () => emitir(new Set());
  const todasMenos = () => emitir(new Set(lista.map(l => String(l.id)))); // seleciona todas explicitamente

  const rotulo = sel.size === 0 ? 'Todas as lojas'
    : sel.size === 1 ? (lista.find(l => String(l.id) === [...sel][0])?.nome || '1 loja')
      : sel.size === lista.length ? 'Todas as lojas' : `${sel.size} lojas`;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', ...style }}>
      <button type="button" onClick={() => setAberto(a => !a)} style={{ ...s.btn, ...(compact ? { padding: '5px 10px', fontSize: 12.5 } : {}) }}>
        🏬 <span style={{ fontWeight: 600 }}>{rotulo}</span> <span style={{ color: '#999', fontSize: 11 }}>▾</span>
      </button>
      {aberto && (
        <div style={s.pop}>
          <div style={s.head}>
            <button type="button" onClick={todas} style={s.link}>Todas</button>
            <span style={{ color: '#ddd' }}>·</span>
            <button type="button" onClick={todasMenos} style={s.link}>Marcar todas</button>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#999' }}>{sel.size === 0 ? 'todas' : `${sel.size} sel.`}</span>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {lista.map(l => {
              const on = sel.has(String(l.id));
              return (
                <label key={l.id} style={{ ...s.item, background: on ? '#EAF3FB' : 'transparent' }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(l.id)} />
                  <span style={{ flex: 1, color: on ? '#185FA5' : '#333', fontWeight: on ? 600 : 400 }}>{l.nome}</span>
                  {l.cidade && <span style={{ fontSize: 10.5, color: '#aaa' }}>{l.cidade}</span>}
                </label>
              );
            })}
            {lista.length === 0 && <div style={{ fontSize: 12, color: '#999', padding: 10 }}>Carregando lojas…</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#333', whiteSpace: 'nowrap' },
  pop: { position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #e2e2e2', borderRadius: 10, boxShadow: '0 8px 24px rgba(16,24,40,.14)', zIndex: 50, minWidth: 240, padding: 6 },
  head: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 8px', borderBottom: '1px solid #f0f0f0', marginBottom: 4 },
  link: { border: 'none', background: 'none', color: '#185FA5', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 },
  item: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '7px 8px', borderRadius: 6, cursor: 'pointer' },
};
