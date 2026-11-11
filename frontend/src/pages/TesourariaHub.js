import React, { useState } from 'react';
import Banner from '../components/Banner';
import TesourariaCaixa from './TesourariaCaixa';
import Tesouraria from './Tesouraria';
import { CartaoDespesas } from './Contabilidade';
import { useAuth } from '../context/AuthContext';

// Hub da Tesouraria (Joe 2026-11-11) — um menu só, controle da GESTÃO (Financeiro).
// Conjunto ÚNICO de abas: o Fechamento do dia fica JUNTO com as apurações (Joe: "o fechamento do dia
// tinha que estar junto com essas apurações de fechamento"). Sem tarefa/cobrança pro operador.
// As apurações reusam a página antiga Tesouraria.js com tabFixa (sem barra de abas própria).

const NATIVAS = ['fechamento', 'orcamento'];
const ABAS = [
  ['fechamento', '📎 Fechamento do dia'],
  ['ranking', '🏆 Caixa Destaque'],
  ['quebras', '💸 Diferenças'],
  ['conferencia', '✅ Conferência'],
  ['cancelamentos', '🚫 Cancelamentos'],
  ['atendimento', '🧾 Atendimento do caixa'],
  ['indicadores', '📈 Setor'],
  ['debitos', '💵 Débitos por caixa'],
  ['orcamento', '💰 Orçamento loja'],
];

// Gestão/Financeiro vê tudo; o GERENTE (e subgerente) vê SÓ o Fechamento do dia — anexa as fotos e
// apenas VISUALIZA quem teve diferença; a apuração e o orçamento são da gestão (Joe 2026-11-11).
const GESTAO_TES = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Financeiro', 'Tesouraria', 'Supervisor'];

export default function TesourariaHub() {
  const { API, usuario } = useAuth();
  const ehGestao = GESTAO_TES.includes(usuario?.funcao);
  const abas = ehGestao ? ABAS : ABAS.filter(([k]) => k === 'fechamento');
  const [aba, setAba] = useState('fechamento');
  return (
    <div style={s.wrap}>
      <Banner emoji="🏦" titulo="Tesouraria" cor="roxo" sub={ehGestao ? 'Controle de caixa da gestão — fechamento do dia por loja junto com as apurações e o orçamento. Sem tarefa pro operador.' : 'Fechamento do dia — anexe os depósitos, despesas e recargas da sua loja e acompanhe os caixas e diferenças do dia.'} />
      {abas.length > 1 && <div style={s.tabs}>
        {abas.map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)} style={{ ...s.tab, ...(aba === k ? s.tabOn : {}) }}>{l}</button>
        ))}
      </div>}
      <div style={{ marginTop: 14 }}>
        {aba === 'fechamento' && <TesourariaCaixa embed />}
        {aba === 'orcamento' && (
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <CartaoDespesas API={API} />
          </div>
        )}
        {!NATIVAS.includes(aba) && <Tesouraria embed soControle tabFixa={aba} />}
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
