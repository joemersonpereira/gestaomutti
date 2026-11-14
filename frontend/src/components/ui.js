// ui.js — PADRÃO VISUAL OFICIAL do sistema (Joe 2026-11-13). Toda tela nova (e as existentes, à medida
// que forem tocadas) deve usar estes tokens/componentes: cards KPI em grid, abas verde-claro, barra de
// filtros e tabela no mesmo estilo. Marca = verde-petróleo #0E7C5A. NÃO redefinir estilo por tela.
import React from 'react';

export const CORES = {
  marca: '#0E7C5A', marcaEsc: '#0b6e59', verdeClaro: '#e9f6ef',
  borda: '#eef1f4', bordaInp: '#dfe3e8', texto: '#1f2a37', suave: '#64748b', fraco: '#94a3b8',
  fundoTh: '#f8fafc', ok: '#15803d', alerta: '#C0392B', zebra: '#fbfcfd',
};

export const UI = {
  page: { padding: '18px 20px' },
  card: { background: '#fff', border: `1px solid ${CORES.borda}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: 16, marginBottom: 12 },
  // Barra de filtros padrão (loja/período/etc) — flex que quebra no mobile.
  filtros: { background: '#fff', border: `1px solid ${CORES.borda}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: 14, marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' },
  fld: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5, color: CORES.suave, fontWeight: 600 },
  inp: { border: `1px solid ${CORES.bordaInp}`, borderRadius: 8, padding: '7px 9px', fontSize: 13, background: '#fff' },
  btn: { border: `1px solid ${CORES.bordaInp}`, borderRadius: 8, padding: '7px 11px', fontSize: 13, fontWeight: 700, background: '#fff', cursor: 'pointer' },
  // KPI em grade responsiva.
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 },
  // Abas verde-claro (inativa clara, ativa sólida).
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  tab: { padding: '8px 14px', borderRadius: 9, border: '1px solid transparent', background: CORES.verdeClaro, color: CORES.marcaEsc, fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  tabOn: { background: `linear-gradient(95deg, ${CORES.marca}, ${CORES.marcaEsc})`, color: '#fff' },
  // Tabela padrão.
  tabela: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '9px 10px', textAlign: 'left', color: CORES.suave, fontSize: 12, fontWeight: 700, background: CORES.fundoTh, borderBottom: `2px solid ${CORES.borda}`, whiteSpace: 'nowrap' },
  td: { padding: '9px 10px', fontSize: 12.5, borderTop: `1px solid #f1f3f5` },
};

// Card KPI: rótulo em cima, valor grande. `cor` pinta o valor; `sub` é a legenda miúda.
export function Kpi({ label, valor, cor, sub }) {
  return (
    <div style={UI.card}>
      <div style={{ fontSize: 11, color: CORES.fraco, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || CORES.texto, lineHeight: 1.15, marginTop: 2 }}>{valor}</div>
      {sub != null && <div style={{ fontSize: 10.5, color: CORES.fraco, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
// Grade de KPIs: <KpiGrid><Kpi .../>...</KpiGrid>
export function KpiGrid({ children, style }) { return <div style={{ ...UI.kpiGrid, ...style }}>{children}</div>; }

// Abas verde-claro padrão. itens = [[id, label], ...]; ativa = id; onChange(id).
export function Tabs({ itens, ativa, onChange }) {
  return (
    <div style={UI.tabs}>
      {itens.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)} style={{ ...UI.tab, ...(ativa === id ? UI.tabOn : {}) }}>{label}</button>
      ))}
    </div>
  );
}
// Barra de filtros padrão: <FiltroBar><label style={UI.fld}>…</label>…</FiltroBar>
export function FiltroBar({ children, style }) { return <div style={{ ...UI.filtros, ...style }}>{children}</div>; }

// Célula de cabeçalho/corpo com alinhamento à direita (p/ números).
export const thR = { ...UI.th, textAlign: 'right' };
export const tdR = { ...UI.td, textAlign: 'right' };
