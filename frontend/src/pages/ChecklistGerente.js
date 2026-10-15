import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import Reposicao from './Reposicao';
import ChecklistDiarioInline from './ChecklistDiarioInline';

const AVS = [['bom', 'Bom', '#3B6D11', '#EAF3DE'], ['regular', 'Regular', '#854F0B', '#FAEEDA'], ['ruim', 'Ruim', '#993C1D', '#FCEBEB'], ['np', 'N/P', '#666', '#eee']];

export default function ChecklistGerente() {
  const [aba, setAba] = useState('checklist');
  return (
    <div style={s.wrap}>
      <Banner emoji="✅" titulo="Checklist Diário" cor="verde" sub="Check-in (manhã) e check-out (noite) · 4 seções somando 100 pontos" />
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button onClick={() => setAba('checklist')} style={{ ...s.tab, ...(aba === 'checklist' ? s.tabAtiva : {}) }}>Checklist</button>
        <button onClick={() => setAba('reposicao')} style={{ ...s.tab, ...(aba === 'reposicao' ? s.tabAtiva : {}) }}>Reposição</button>
      </div>
      {aba === "checklist" ? <ChecklistDiarioInline /> : <Reposicao />}
    </div>
  );
}


const s = {
  wrap: { padding: '1rem', maxWidth: 960, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  campo: { padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8 },
  tab: { fontSize: 12, padding: '6px 14px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666' },
  tabAtiva: { background: '#111', color: '#fff', borderColor: '#111' },
  turno: { fontSize: 11, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#666' },
  turnoAtivo: { background: '#185FA5', color: '#fff', borderColor: '#185FA5' },
  linha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f5f5f5', gap: 8 },
  av: { fontSize: 10, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 5, background: '#fff', cursor: 'pointer', color: '#999' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnSec: { fontSize: 13, padding: '8px 14px', background: 'none', color: '#666', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' },
  alerta: { background: '#FAEEDA', border: '1px solid #BA7517', borderRadius: 10, padding: '12px', marginTop: 10 },
  info: { background: '#E6F1FB', borderLeft: '3px solid #185FA5', borderRadius: '0 8px 8px 0', padding: '10px 12px', fontSize: 12, color: '#185FA5', lineHeight: 1.6, marginTop: 10 },
};
