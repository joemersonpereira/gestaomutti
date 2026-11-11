import React from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { CalendarioEmpresa } from './TradeMarketing';

// Agenda geral da empresa (menu de topo, pra todos). Mesma base do calendário do Trade
// (tabela agenda_evento): eventos "da empresa" todos veem; "só eu" só o dono. Contatos de
// prospecção, retomadas e tarefas de trade do usuário entram sozinhos como pessoais.
const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Comprador Beleza', 'Comprador Bem-estar', 'Marketing'];

export default function AgendaGeral() {
  const { API, usuario } = useAuth();
  const gestao = GESTAO.includes(usuario.funcao);
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 4px' }}>
      <Banner emoji="📅" titulo="Agenda da empresa" cor="verde"
        sub="Compromissos gerais da empresa (todos veem) + os seus (só você vê). Contatos e tarefas entram sozinhos." />
      <div style={{ marginTop: 12 }}>
        <CalendarioEmpresa API={API} gestao={gestao} />
      </div>
    </div>
  );
}
