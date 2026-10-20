import React from 'react';
import { useAuth } from '../context/AuthContext';
import { SpedRepo } from './Contabilidade';

// Menu Fiscal — reúne o repositório de SPED/EFD, a conciliação NF × XML (SEFAZ × Alpha)
// e o BI de tempo de entrada da mercadoria. O conteúdo vive no SpedRepo (abas internas):
//   📁 Arquivos · 🛠️ Retorno & Banco de correção · 🔎 Conciliação NF × XML · ⏱️ Tempo de entrada
// Obs.: as páginas pegam o API do contexto (useAuth), não por prop — o App renderiza <C /> sem props.
export default function Fiscal() {
  const { API } = useAuth();
  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '6px 0 12px', borderBottom: '1px solid var(--line,#ddd8cf)', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#1e293b' }}>📋 Fiscal</h1>
      </div>
      <SpedRepo API={API} />
    </div>
  );
}
