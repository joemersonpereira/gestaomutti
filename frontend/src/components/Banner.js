import React from 'react';

// Cabeçalho compartilhado (usado por ~20 telas). Card claro com um BADGE colorido no emoji,
// título + subtítulo + ações (children). API mantida (emoji, titulo, sub, cor, arte, children);
// `cor` define o acento. Refinado na identidade do app (verde-petróleo da marca).
const ACC = {
  azul: '#0E7C5A', verde: '#0E7C5A', roxo: '#0E7C5A', ciano: '#0E7C5A',
  laranja: '#B45309', vermelho: '#A3372A',
};
const TINT = {
  '#0E7C5A': '#E7F4EF', '#B45309': '#FBF0E2', '#A3372A': '#FBEBE7',
};

// Botão para usar dentro do Banner.
export const bannerBtn = { fontSize: 12, padding: '7px 12px', borderRadius: 9, border: '1px solid #ddd8cf', background: '#fff', color: '#1c2a2e', cursor: 'pointer', fontWeight: 600 };

export default function Banner({ emoji, titulo, sub, cor = 'verde', arte, children }) {
  const acc = ACC[cor] || '#0E7C5A';
  const tint = TINT[acc] || '#E7F4EF';
  return (
    <div style={{
      background: 'var(--surface,#fff)', border: '1px solid var(--line,#e9e7e1)', borderRadius: 14,
      padding: '15px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14,
      flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(28,42,46,.05)',
    }}>
      {(emoji || arte) && (
        <div style={{
          width: 46, height: 46, borderRadius: 13, flexShrink: 0, fontSize: 24, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: tint, border: `1px solid ${acc}26`, boxShadow: `0 2px 8px -4px ${acc}66`,
        }}>{emoji || arte}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--fg,#1c2a2e)', letterSpacing: '-.02em' }}>{titulo}</div>
        {sub && <div style={{ fontSize: 13, color: 'var(--fg-soft,#5d6b6e)', marginTop: 3, lineHeight: 1.45 }}>{sub}</div>}
      </div>
      {children && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>}
    </div>
  );
}
