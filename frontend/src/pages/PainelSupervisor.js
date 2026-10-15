import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import PainelGerente from './PainelGerente';

const corNota = n => (n == null ? '#999' : n >= 90 ? '#3B6D11' : n >= 75 ? '#BA7517' : '#993C1D');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default function PainelSupervisor() {
  const { API } = useAuth();
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano] = useState(hoje.getFullYear());
  const [d, setD] = useState(null);
  const [carreg, setCarreg] = useState(false);
  const [aberta, setAberta] = useState(null);
  const carregar = useCallback(() => {
    setCarreg(true);
    API.get('/painel/supervisor', { params: { mes, ano } }).then(r => setD(r.data)).catch(() => setD(false)).finally(() => setCarreg(false));
  }, [API, mes, ano]);
  useEffect(() => { carregar(); }, [carregar]);
  const brl = n => 'R$ ' + Math.round(Number(n) || 0).toLocaleString('pt-BR');
  const rede = d && d.resumo_rede;

  if (d === false) return <div style={s.wrap}><div style={s.card}>Sem acesso.</div></div>;
  const criticas = (d?.lojas || []).filter(l => l.nota_geral < 75).length;

  return (
    <div style={s.wrap}>
      <div style={s.banner}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🌐 Painel do Supervisor</div>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>Todas as lojas — clique numa loja para abrir o painel completo do gerente.</div>
          {d && d.lojas && <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 26, fontWeight: 800 }}>{d.media_rede}<span style={{ fontSize: 13, opacity: 0.7 }}>/100</span></div><div style={{ fontSize: 11, opacity: 0.8 }}>Nota média da rede</div></div>
            <div><div style={{ fontSize: 26, fontWeight: 800 }}>{criticas}</div><div style={{ fontSize: 11, opacity: 0.8 }}>Lojas abaixo de 75</div></div>
            <div><div style={{ fontSize: 26, fontWeight: 800 }}>{d.lojas.length}</div><div style={{ fontSize: 11, opacity: 0.8 }}>Lojas ativas</div></div>
            {rede && rede.vendido > 0 && (
              <div style={{ borderLeft: '1px solid rgba(255,255,255,.3)', paddingLeft: 18 }}>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{brl(rede.vendido)}</div>
                <div style={{ fontSize: 11, opacity: 0.85 }}>Vendas do mês · rede{rede.pct != null ? ` · ${rede.pct}% da meta` : ''}{rede.pct_super != null ? ` · ${rede.pct_super}% da super` : ''}</div>
              </div>
            )}
          </div>}
        </div>
        <div style={s.bannerArt}>🏪</div>
        <label style={{ position: 'absolute', top: 16, right: 18, zIndex: 2 }}>
          <select value={mes} onChange={e => setMes(Number(e.target.value))} style={{ background: 'rgba(255,255,255,.2)', color: '#fff', border: '1px solid rgba(255,255,255,.4)', borderRadius: 8, padding: '5px 8px', fontSize: 12 }}>
            {MESES.map((m, i) => <option key={i} value={i + 1} style={{ color: '#333' }}>{m}/{ano}</option>)}
          </select>
        </label>
      </div>

      {!d && <div style={{ ...s.card, textAlign: 'center', color: '#888' }}>Carregando rede…</div>}
      {d && d.lojas && d.lojas.map((l, i) => {
        const aberto = aberta === l.loja_id;
        return (
          <div key={l.loja_id} style={{ ...s.card, ...(i === 0 ? { borderLeft: '4px solid #FFD700' } : l.nota_geral < 75 ? { borderLeft: '4px solid #C0392B' } : { borderLeft: '4px solid #1E874B' }) }}>
            <div onClick={() => setAberta(aberto ? null : l.loja_id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{i === 0 ? '🥇 ' : ''}{l.loja}</div>
                {l.vendido > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: l.pct == null ? '#334' : l.pct >= 100 ? '#1E874B' : l.pct >= 90 ? '#BA7517' : '#C0392B' }}>💰 {brl(l.vendido)} <span style={{ fontSize: 11, fontWeight: 600, color: '#999' }}>vendido{l.pct != null ? ` · ${l.pct}% da meta` : ''}</span></div>}
                <div style={{ fontSize: 11.5, color: '#999' }}>premiação {l.premio_pct}% {l.indicadores_abaixo > 0 ? `· ${l.indicadores_abaixo} indicador(es) abaixo` : '· tudo ok'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: corNota(l.nota_geral) }}>{l.nota_geral}</span>
                <span style={{ fontSize: 12, color: '#2E5C9E', fontWeight: 600 }}>{aberto ? '▲ fechar' : '▼ ver painel do gerente'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {l.pilares.map(p => (
                <span key={p.id} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: '#f5f5f5', color: corNota(p.nota) }}>{p.nome}: {p.nota ?? '—'}</span>
              ))}
            </div>
            {aberto && (
              <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 4, background: '#FBFCFD', borderRadius: 10, margin: '12px -6px -6px', padding: '4px 6px 6px' }}>
                <PainelGerente lojaIdInicial={l.loja_id} embutido />
              </div>
            )}
          </div>
        );
      })}
      {carreg && d && <div style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>atualizando…</div>}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  banner: { background: 'linear-gradient(120deg,#2FA36B 0%,#1E874B 45%,#0E5C33 100%)', color: '#fff', borderRadius: 18, padding: '22px 24px', marginBottom: 16, position: 'relative', overflow: 'hidden', boxShadow: '0 6px 22px rgba(14,92,51,.26)' },
  bannerArt: { position: 'absolute', right: 22, bottom: -14, fontSize: 120, opacity: 0.14, lineHeight: 1 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
};
