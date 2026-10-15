import React from 'react';

// Cabeçalho LEVE no estilo "Faturas": card claro com título + subtítulo + ações (children).
// Mantém as props antigas (emoji, titulo, sub, cor, arte, children); `cor` vira um acento sutil.
const ACC = {
  azul: '#0d6b5e', verde: '#0d6b5e', roxo: '#0d6b5e', laranja: '#b45309', vermelho: '#a33a26', ciano: '#0d6b5e',
};

// Botão para usar dentro do Banner (agora claro).
export const bannerBtn = { fontSize: 12, padding: '6px 11px', borderRadius: 8, border: '1px solid #ddd8cf', background: '#fff', color: '#1c2a2e', cursor: 'pointer', fontWeight: 600 };

export default function Banner({ emoji, titulo, sub, cor = 'verde', arte, children }) {
  const acc = ACC[cor] || '#0d6b5e';
  return (
    <div style={{ background: 'var(--surface,#fff)', border: '1px solid var(--line,#ddd8cf)', borderLeft: `4px solid ${acc}`, borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', boxShadow: '0 1px 2px rgba(28,42,46,.06)' }}>
      {(emoji || arte) && <div style={{ fontSize: 24, lineHeight: 1 }}>{emoji || arte}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg,#1c2a2e)', letterSpacing: '-.01em' }}>{titulo}</div>
        {sub && <div style={{ fontSize: 13, color: 'var(--fg-soft,#5d6b6e)', marginTop: 2 }}>{sub}</div>}
      </div>
      {children && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>}
    </div>
  );
}
