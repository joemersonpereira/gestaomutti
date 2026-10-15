import React from 'react';
import ChecklistOperacionalInline from './ChecklistOperacionalInline';

export default function Operacional() {
  return (
    <div style={{ padding: '1rem', maxWidth: 940, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>🛠️ Checklist do dia</div>
      <ChecklistOperacionalInline />
    </div>
  );
}
