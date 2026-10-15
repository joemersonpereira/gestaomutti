import { useState } from 'react';

// Hook reutilizável: ordenação de tabela por coluna (txt A→Z / num maior↔menor).
// cols: [{ k, label, get:(it)=>valor, tipo:'txt'|'num', center? }].
// inicial: { col, dir } (opcional). Retorna { linhas, ordem, clicar, seta }.
export function useOrdenavel(itens, cols, inicial) {
  const [ordem, setOrdem] = useState(inicial || { col: cols[0]?.k, dir: 'asc' });
  const clicar = k => setOrdem(o => o.col === k
    ? { col: k, dir: o.dir === 'asc' ? 'desc' : 'asc' }
    : { col: k, dir: cols.find(c => c.k === k)?.tipo === 'txt' ? 'asc' : 'desc' });
  const colDef = cols.find(c => c.k === ordem.col);
  const linhas = (itens || []).slice();
  if (colDef) linhas.sort((a, b) => {
    const va = colDef.get(a), vb = colDef.get(b);
    const r = colDef.tipo === 'txt'
      ? String(va ?? '').localeCompare(String(vb ?? ''), 'pt', { sensitivity: 'base' })
      : (Number(va) - Number(vb));
    return ordem.dir === 'asc' ? r : -r;
  });
  const seta = k => ordem.col === k ? (ordem.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return { linhas, ordem, clicar, seta };
}

// Cabeçalho <th> clicável padrão. `base` = estilo do th; `ativo` = cor da coluna ativa.
export function ThOrd({ c, ordem, clicar, seta, base, ativo = '#B7791F' }) {
  return (
    <th
      onClick={() => clicar(c.k)}
      title="Ordenar"
      style={{ ...base, textAlign: c.center ? 'center' : (c.right ? 'right' : 'left'), cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: ordem.col === c.k ? ativo : (base && base.color) }}
    >
      {c.label}{seta(c.k)}
    </th>
  );
}
