import React from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { CobrancaTradeView } from './TradeMarketing';

// Menu próprio de Cobrança do Trade. Regra (Joe 2026-11-11): só o FINANCEIRO dá baixa, e sempre
// com comprovante anexado — o anexo é feito por quem é do TRADE. O componente já diferencia os papéis.
const TRADE = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Comprador Beleza', 'Comprador Bem-estar', 'Marketing'];

export default function CobrancaTrade() {
  const { API, usuario } = useAuth();
  const gestao = TRADE.includes(usuario.funcao); // perfis de trade (anexam comprovante / enviam e-mail)
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 4px' }}>
      <Banner emoji="💰" titulo="Cobrança do Trade" cor="verde"
        sub="Parcelas a receber dos fornecedores. O Trade anexa o comprovante; o Financeiro dá a baixa (só com comprovante)." />
      <div style={{ marginTop: 12 }}>
        <CobrancaTradeView API={API} gestao={gestao} />
      </div>
    </div>
  );
}
