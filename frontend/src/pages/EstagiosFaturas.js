import React from 'react';

// Módulo Estágios e Faturas — o app roda em /estagios.html (mesmo domínio), usando o token
// do Pulsy (mutti_token) e a API /api/estagios. Embutido aqui por iframe.
// Cache-bust: o iframe costuma guardar o estagios.html em cache e não pegar as atualizações.
// Um carimbo estável por carregamento da página garante versão nova a cada Ctrl+F5.
if (typeof window !== 'undefined' && !window.__FAT_V) window.__FAT_V = Date.now();

export default function EstagiosFaturas() {
  const v = (typeof window !== 'undefined' && window.__FAT_V) || '';
  return (
    <iframe
      title="Estágios e Faturas"
      src={`/estagios.html?v=${v}`}
      style={{ border: 0, width: '100%', height: '100vh', display: 'block' }}
    />
  );
}
