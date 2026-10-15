import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Talentos } from './EstagioRH';

// Banco de Talentos — menu próprio, serve recrutamento de ESTAGIÁRIOS e COLABORADORES EFETIVOS.
export default function BancoTalentos() {
  const { API } = useAuth();
  return (
    <div style={{ padding: 20, maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#1c2a2e' }}>📝 Banco de Talentos</h1>
      <p style={{ fontSize: 13, color: '#5d6b6e', margin: '0 0 16px' }}>Recrutamento de estagiários e efetivos: link público de cadastro, testes online e candidatos para contratar.</p>
      <Talentos API={API} />
    </div>
  );
}
