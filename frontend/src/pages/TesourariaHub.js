import React, { useState } from 'react';
import Banner from '../components/Banner';
import TesourariaCaixa from './TesourariaCaixa';
import Tesouraria from './Tesouraria';
import { CartaoDespesas } from './Contabilidade';
import { useAuth } from '../context/AuthContext';

// Hub da Tesouraria (Joe 2026-11-11) — um menu só, controle da GESTÃO (Financeiro).
// Junta num lugar: o Fechamento do dia por loja (caixas do dia + anexos de depósitos/despesas/recargas),
// o Controle da gestão (Caixa Destaque, diferenças de caixa só leitura, cancelamentos, atendimento,
// conferência) e o Orçamento da loja (verba × gasto × saldo, por plano de contas).
// NÃO abre tarefa/cobrança pro operador — é só visão de controle.

const ABAS = [
  ['fechamento', '📎 Fechamento do dia'],
  ['controle', '🏦 Controle da gestão'],
  ['orcamento', '💰 Orçamento loja'],
];

export default function TesourariaHub() {
  const { API } = useAuth();
  const [aba, setAba] = useState('fechamento');
  return (
    <div style={s.wrap}>
      <Banner emoji="🏦" titulo="Tesouraria" cor="roxo" sub="Controle de caixa da gestão — fechamento do dia por loja, diferenças e orçamento. Sem tarefa pro operador." />
      <div style={s.tabs}>
        {ABAS.map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)} style={{ ...s.tab, ...(aba === k ? s.tabOn : {}) }}>{l}</button>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        {aba === 'fechamento' && <TesourariaCaixa embed />}
        {aba === 'controle' && <Tesouraria embed soControle />}
        {aba === 'orcamento' && (
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <CartaoDespesas API={API} />
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '18px 20px', maxWidth: 1180, margin: '0 auto' },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  tab: { padding: '8px 14px', borderRadius: 9, border: '1px solid #e3e8ea', background: '#f3f7f6', color: '#334', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  tabOn: { background: 'linear-gradient(95deg,#0E7C5A,#0b6e59)', color: '#fff', borderColor: 'transparent' },
};
