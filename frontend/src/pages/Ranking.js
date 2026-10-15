import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

// Ranking trimestral COMPLETO — acesso restrito à Direção (no App.js, perfis: ['Diretor Geral']).
// A Direção vê posições e pontuação reais para decidir a premiação.
export default function Ranking() {
  const { API } = useAuth();
  const hoje = new Date();
  const [tri, setTri] = useState(Math.floor(hoje.getMonth() / 3) + 1);
  const [ano] = useState(hoje.getFullYear());
  const [d, setD] = useState(null);

  const carregar = useCallback(() => { API.get('/certificados/ranking', { params: { trimestre: tri, ano } }).then(r => setD(r.data)); }, [API, tri, ano]);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div style={s.wrap}>
      <Banner emoji="🏆" titulo="Ranking trimestral" cor="roxo" />
      <div style={s.sub}>{ano} · visão da Direção (confidencial)</div>

      <div style={s.tabs}>
        {[1, 2, 3, 4].map(t => <button key={t} onClick={() => setTri(t)} style={{ ...s.tab, ...(tri === t ? s.tabAtiva : {}) }}>{t}º Tri</button>)}
      </div>

      {!d ? <div style={s.load}>Carregando…</div> : d.ranking.length === 0 ? <div style={s.card}>Sem pontuação neste trimestre ainda.</div> : (
        d.ranking.map((r, i) => (
          <div key={r.colaborador_id} style={{ ...s.card, ...(i < 3 ? { borderLeft: `3px solid ${['#FFD700', '#C0C0C0', '#CD7F32'][i]}` } : {}) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18, width: 30, textAlign: 'center' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.nome}</div>
                <div style={{ fontSize: 11, color: '#999' }}>{r.loja} · ⭐{r.certificados} · ind {r.nota_indicadores}{r.pontos_perdidos ? ` · -${r.pontos_perdidos}` : ''}</div>
              </div>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#185FA5' }}>{r.pontuacao}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  load: { padding: 30, textAlign: 'center', color: '#666' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 8 },
  tabs: { display: 'flex', gap: 6, marginBottom: 12 },
  tab: { fontSize: 12, padding: '5px 14px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666' },
  tabAtiva: { background: '#111', color: '#fff', borderColor: '#111' },
};
