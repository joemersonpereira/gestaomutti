import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

// "Minha posição" mensal: cada pessoa vê APENAS a sua colocação no mês (sem ver os demais).
// Mostra a distancia ate o podio para estimular a subir, sem revelar pontuacao de ninguem.
export default function MinhaPosicao() {
  const { API } = useAuth();
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const ano = hoje.getFullYear();
  const [d, setD] = useState(null);

  const carregar = useCallback(() => { API.get('/certificados/minha-posicao', { params: { mes, ano } }).then(r => setD(r.data)).catch(() => setD(false)); }, [API, mes, ano]);
  useEffect(() => { carregar(); }, [carregar]);

  let conteudo = null;
  if (d && d.posicao) {
    const pos = d.posicao;
    let titulo, frase, cor;
    if (pos === 1) { titulo = 'Você está em 1º lugar! 🥇'; frase = 'Você lidera o mês. Mantenha o ritmo para fechar no topo!'; cor = '#8a6d00'; }
    else if (pos <= 3) { titulo = `Você está em ${pos}º lugar 🏅`; frase = 'Você está no pódio do mês. Falta pouquíssimo para a liderança!'; cor = '#185FA5'; }
    else {
      const faltam = pos - 3;
      titulo = `Você está em ${pos}º lugar`;
      frase = `Faltam ${faltam} posição${faltam > 1 ? 's' : ''} para entrar no pódio do mês. Bora subir! 🚀`;
      cor = '#3B6D11';
    }
    conteudo = (
      <div style={{ ...s.card, borderLeft: `4px solid ${cor}`, textAlign: 'center', padding: '24px 16px' }}>
        <div style={{ fontSize: 44, fontWeight: 800, color: cor }}>{pos}º</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{titulo}</div>
        <div style={{ fontSize: 13, color: '#555', marginTop: 6 }}>{frase}</div>
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 10 }}>Sua colocação entre {d.total} no mês. Você vê apenas a sua posição.</div>
      </div>
    );
  } else if (d && !d.posicao) {
    conteudo = <div style={s.card}>Você ainda não pontuou neste mês. Conquiste certificados e boas avaliações para entrar no ranking! 🚀</div>;
  } else if (d === false) {
    conteudo = <div style={s.card}>Não foi possível carregar sua posição agora.</div>;
  } else {
    conteudo = <div style={s.load}>Carregando…</div>;
  }

  return (
    <div style={s.wrap}>
      <Banner emoji="📊" titulo="Minha posição" cor="roxo" sub="Sua colocação no mês — só você vê a sua posição" />

      <div style={{ marginBottom: 12 }}>
        <select style={s.sel} value={mes} onChange={e => setMes(Number(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}/{ano}</option>)}
        </select>
      </div>

      {conteudo}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 820, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  load: { padding: 30, textAlign: 'center', color: '#666' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 8 },
  sel: { fontSize: 13, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 8 },
};
