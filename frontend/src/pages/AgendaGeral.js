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
      <Banner emoji="📅" titulo="Calendário da empresa" cor="verde"
        sub="Tudo num lugar: programações do trade, feriados, compromissos da empresa (todos veem) + os seus (só você). Para agendar, clique num dia ou em “+ Agendar”." />
      <div style={{ marginTop: 12 }}>
        <CalendarioEmpresa API={API} gestao={gestao} botaoExtra={gestao ? (
          <button onClick={() => { try { sessionStorage.setItem('mkt_nova_acao', JSON.stringify({ novo: new Date().toISOString().slice(0, 10) })); } catch (e) { } window.dispatchEvent(new CustomEvent('mutti-nav', { detail: 'mkt-calendario' })); }}
            title="Criar uma ação de marketing (material, briefing, gasto) — abre no módulo Marketing"
            style={{ fontSize: 13, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#111', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>📣 + Ação</button>
        ) : null} />
      </div>
    </div>
  );
}
