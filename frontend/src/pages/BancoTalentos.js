import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Talentos } from './EstagioRH';
import { UI, CORES } from '../components/ui';

// Banco de Talentos — menu próprio, serve recrutamento de ESTAGIÁRIOS e COLABORADORES EFETIVOS.
export default function BancoTalentos() {
  const { API } = useAuth();
  return (
    <div style={{ ...UI.page, maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: CORES.texto }}>📝 Banco de Talentos</h1>
      <p style={{ fontSize: 13, color: CORES.suave, margin: '0 0 16px' }}>Recrutamento de estagiários e efetivos: link público de cadastro, testes online e candidatos para contratar.</p>
      <Talentos API={API} />
    </div>
  );
}
