import React, { useRef, useEffect } from 'react';

// ScrollX — envolve um conteúdo largo (tabela) e adiciona uma barra de rolagem horizontal
// NO TOPO, sincronizada com a rolagem do conteúdo (e com a barra de baixo). Assim dá pra
// rolar sem precisar chegar ao fim da tabela. Reutilizável em qualquer tela do sistema.
export default function ScrollX({ children, style, maxHeight }) {
  const topRef = useRef(null), bodyRef = useRef(null), spacerRef = useRef(null);
  useEffect(() => {
    const top = topRef.current, body = bodyRef.current, spacer = spacerRef.current;
    if (!top || !body || !spacer) return;
    const sync = () => {
      const w = body.scrollWidth;
      spacer.style.width = w + 'px';
      // esconde a barra de cima quando não há overflow
      top.style.display = w > body.clientWidth + 1 ? 'block' : 'none';
    };
    sync();
    let ro;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(sync); ro.observe(body); }
    window.addEventListener('resize', sync);
    let lock = false;
    const onTop = () => { if (lock) return; lock = true; body.scrollLeft = top.scrollLeft; lock = false; };
    const onBody = () => { if (lock) return; lock = true; top.scrollLeft = body.scrollLeft; lock = false; };
    top.addEventListener('scroll', onTop);
    body.addEventListener('scroll', onBody);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', sync); top.removeEventListener('scroll', onTop); body.removeEventListener('scroll', onBody); };
  });
  return (
    <div style={style}>
      <div ref={topRef} style={{ overflowX: 'auto', overflowY: 'hidden' }}><div ref={spacerRef} style={{ height: 1 }} /></div>
      <div ref={bodyRef} style={{ overflowX: 'auto', ...(maxHeight ? { maxHeight, overflowY: 'auto' } : {}) }}>{children}</div>
    </div>
  );
}
