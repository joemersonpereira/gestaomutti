import React from 'react';

// Barra de cache: mostra quando o dado foi atualizado e um botão pra recalcular agora (?forcar=1).
// Use com as respostas que trazem { cache: { atualizado_em, deCache } } do backend (lib/erpCache).
// hora do cache vem em UTC "YYYY-MM-DD HH:MM:SS".
const fmtHora = at => { try { return new Date(String(at).replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return at; } };

export default function CacheBar({ cache, onAtualizar, atualizando, style }) {
  if (!cache || !cache.atualizado_em) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: '#64748b', margin: '0 0 10px', flexWrap: 'wrap', ...style }}>
      <span>{cache.deCache ? '📦 do cache' : '🔄 recém-calculado'} · atualizado {fmtHora(cache.atualizado_em)}</span>
      {onAtualizar && <button onClick={onAtualizar} disabled={atualizando}
        style={{ padding: '2px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600, color: '#334155' }}>
        {atualizando ? 'atualizando…' : '🔄 atualizar agora'}</button>}
    </div>
  );
}
