// MinhaAreaLateral.js — PADRÃO "Minha área" (Joe 2026-11-14): painel lateral deslizante que vai em TODA
// tela mencionada do Meu Setor (online, suporte, …). Mostra o resumo do setor (premiação + metas em farol)
// e abre o Meu Setor completo (pilares, metas, premiação, observações) num overlay. Reutiliza /meu-setor-area.
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { CORES } from './ui';
import MeuSetorArea from '../pages/MeuSetorArea';

const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

export default function MinhaAreaLateral({ area = 'online', titulo = 'Minha área', extras = null }) {
  const { API, usuario } = useAuth();
  const chave = 'minhaarea_' + area;
  const [aberto, setAberto] = useState(() => { try { return localStorage.getItem(chave) !== '0'; } catch (e) { return true; } });
  const [overlay, setOverlay] = useState(false);
  const [d, setD] = useState(null);
  const [wide, setWide] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1120 : true);
  useEffect(() => { const f = () => setWide(window.innerWidth >= 1120); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const setLat = v => { setAberto(v); try { localStorage.setItem(chave, v ? '1' : '0'); } catch (e) {} };
  // Empurra o conteúdo à esquerda quando o painel está aberto em tela larga (igual Tesouraria).
  useEffect(() => {
    if (aberto && wide) { document.body.style.paddingRight = '320px'; document.body.style.transition = 'padding-right .18s'; }
    else { document.body.style.paddingRight = ''; }
    return () => { document.body.style.paddingRight = ''; };
  }, [aberto, wide]);
  const carregar = useCallback(() => { if (aberto) API.get(`/meu-setor-area/${area}/apurar`, { params: { dias: 30 } }).then(r => setD(r.data)).catch(() => setD(null)); }, [API, area, aberto]);
  useEffect(() => { carregar(); }, [carregar]);
  const hoje = new Date().toISOString().slice(0, 10);
  const minha = (d?.pessoas || []).find(p => p.colaborador_id === usuario?.id);

  return (<>
    {!aberto && <button onClick={() => setLat(true)} style={{ position: 'fixed', right: 14, bottom: 18, zIndex: 41, display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(95deg,#0E7C5A,#0b6e59)', color: '#fff', border: 'none', borderRadius: 999, padding: '11px 18px', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,.25)' }}>🎯 {titulo}</button>}

    {aberto && <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 312, maxWidth: '92vw', overflowY: 'auto', zIndex: 41, background: '#fff', borderLeft: '1px solid #e3e8ea', boxShadow: '-6px 0 26px rgba(16,40,45,.10)', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div><div style={{ fontWeight: 800, fontSize: 14 }}>🎯 {titulo}</div><div style={{ fontSize: 11.5, color: '#94a3b8' }}>Hoje · {hoje.split('-').reverse().join('/')}</div></div>
        <button onClick={() => setLat(false)} title="Recolher" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18 }}>⟩</button>
      </div>

      <button onClick={() => setOverlay(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', padding: '9px 10px', borderRadius: 10, border: '1px solid transparent', background: 'linear-gradient(95deg,#0E7C5A,#0b6e59)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>📈 Abrir Meu Setor</button>

      {extras}

      {d && d.notaGeral != null && <div onClick={() => setOverlay(true)} style={{ cursor: 'pointer', background: 'linear-gradient(135deg,#0E7C5A,#0b6e59)', color: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 12, opacity: .9 }}>🏆 {minha ? 'Seu prêmio no período' : 'Premiação do setor (período)'}</div>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{brl(minha ? minha.premioTotal : d.premioTotalChefe)}</div>
        <div style={{ fontSize: 11.5, opacity: .9 }}>{minha ? `fator ${Math.round((minha.fator || 0) * 100)}% · ` : 'prêmio cheio (chefe) · '}nota geral {d.notaGeral}/100</div>
      </div>}

      {d?.resumo && <div style={{ paddingTop: 4 }}>
        <div onClick={() => setOverlay(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 6 }}>
          <b style={{ fontSize: 13 }}>🎯 Metas do setor</b>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700 }}><span style={{ color: '#15803d' }}>🟢{d.resumo.verde}</span> <span style={{ color: '#B7791F' }}>🟡{d.resumo.amarelo}</span> <span style={{ color: '#C0392B' }}>🔴{d.resumo.vermelho}</span></span>
        </div>
        {(d.metas || []).filter(m => m.farol === 'vermelho').slice(0, 5).map(m => (
          <div key={m.chave} onClick={() => setOverlay(true)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11.5, color: '#475569', marginTop: 3 }}>
            <span style={{ color: '#C0392B' }}>🔴 {m.label}</span>
            <b style={{ color: '#C0392B' }}>{m.realizado == null ? '—' : (m.unidade === '%' ? m.realizado + '%' : m.realizado)}</b>
          </div>
        ))}
        {d.resumo.vermelho === 0 && <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>✅ Metas no alvo.</div>}
        <div onClick={() => setOverlay(true)} style={{ fontSize: 11, color: '#0d6b5e', cursor: 'pointer', marginTop: 6, fontWeight: 600 }}>ver tudo →</div>
      </div>}
      {!d && <div style={{ fontSize: 12, color: '#94a3b8' }}>⏳ Carregando…</div>}
    </div>}

    {overlay && <div style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(15,23,42,.45)', display: 'flex', justifyContent: 'flex-end' }} onClick={() => setOverlay(false)}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(980px, 96vw)', background: '#f6f8f9', height: '100%', overflowY: 'auto', boxShadow: '-10px 0 40px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e8edf0', position: 'sticky', top: 0, zIndex: 2 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>🎯 Meu Setor — {area === 'online' ? 'Online' : 'Suporte Loja'}</div>
          <button onClick={() => setOverlay(false)} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>×</button>
        </div>
        <div style={{ padding: '14px 16px' }}><MeuSetorArea area={area} embutido /></div>
      </div>
    </div>}
  </>);
}
