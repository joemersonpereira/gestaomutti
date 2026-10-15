import React, { useEffect, useState } from 'react';

// Página PÚBLICA (sem login) — QR/link do atendimento farmacêutico.
// URL: /avaliar-atendimento?s=<servico_id>. O paciente avalia aquele atendimento específico.
const CARINHAS = [
  { n: 1, emoji: '😞', txt: 'Péssimo' },
  { n: 2, emoji: '😕', txt: 'Ruim' },
  { n: 3, emoji: '😐', txt: 'Regular' },
  { n: 4, emoji: '🙂', txt: 'Bom' },
  { n: 5, emoji: '😍', txt: 'Ótimo' },
];

export default function AvaliarAtendimento() {
  const sid = new URLSearchParams(window.location.search).get('s') || '';
  const [at, setAt] = useState(null);
  const [erroAt, setErroAt] = useState(false);
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!sid) { setErroAt(true); return; }
    fetch(`/api/servicos-farmaceuticos/public/atendimento/${encodeURIComponent(sid)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setAt(d); if (d.ja_avaliado) setOk(true); }).catch(() => setErroAt(true));
  }, [sid]);

  async function enviar() {
    if (!nota) { setErro('Toque em uma carinha para dar sua nota.'); return; }
    setEnviando(true); setErro('');
    try {
      const r = await fetch(`/api/servicos-farmaceuticos/public/atendimento/${encodeURIComponent(sid)}/avaliar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota, comentario }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(data.erro || 'Não consegui enviar. Tente de novo.'); return; }
      setOk(true);
    } catch { setErro('Não consegui enviar. Tente de novo.'); }
    finally { setEnviando(false); }
  }

  const wrap = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg,#0E7C86,#0A4E58)', padding: 20, fontFamily: 'system-ui, sans-serif' };
  const card = { background: '#fff', borderRadius: 20, padding: '28px 22px', width: '100%', maxWidth: 420, boxShadow: '0 12px 40px rgba(0,0,0,.25)', textAlign: 'center' };

  if (erroAt) return <div style={wrap}><div style={card}><div style={{ fontSize: 40 }}>🔍</div><h2>Atendimento não encontrado</h2><p style={{ color: '#666' }}>O QR parece inválido. Peça ajuda ao farmacêutico.</p></div></div>;
  if (!at) return <div style={wrap}><div style={card}>Carregando…</div></div>;

  if (ok) return (
    <div style={wrap}><div style={card}>
      <div style={{ fontSize: 64 }}>💚</div>
      <h2 style={{ margin: '8px 0', color: '#0E7C86' }}>Obrigado!</h2>
      <p style={{ color: '#555', fontSize: 15 }}>Sua avaliação do atendimento{at.profissional ? <> de <strong>{at.profissional}</strong></> : ''} foi registrada.</p>
    </div></div>
  );

  return (
    <div style={wrap}><div style={card}>
      <div style={{ fontSize: 40 }}>🩺</div>
      <h2 style={{ margin: '6px 0 2px', color: '#0E7C86' }}>{at.tipo}</h2>
      <p style={{ color: '#777', fontSize: 14, marginTop: 0 }}>
        {at.profissional ? <>Atendido por <strong>{at.profissional}</strong></> : 'Cuidado Farmacêutico'}{at.loja ? ` · ${at.loja}` : ''}
      </p>
      <p style={{ color: '#555', fontSize: 15, fontWeight: 600 }}>Como foi seu atendimento?</p>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '14px 0 6px', flexWrap: 'wrap' }}>
        {CARINHAS.map(c => (
          <button key={c.n} onClick={() => { setNota(c.n); setErro(''); }}
            style={{ border: nota === c.n ? '2px solid #0E7C86' : '2px solid #eee', background: nota === c.n ? '#E6F5F6' : '#fafafa', borderRadius: 14, width: 62, height: 76, cursor: 'pointer', transition: 'all .12s', transform: nota === c.n ? 'scale(1.06)' : 'none' }}>
            <div style={{ fontSize: 30, filter: nota && nota !== c.n ? 'grayscale(60%)' : 'none' }}>{c.emoji}</div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{c.txt}</div>
          </button>
        ))}
      </div>

      <textarea value={comentario} onChange={e => setComentario(e.target.value)} maxLength={500}
        placeholder="Quer deixar um comentário? (opcional)" rows={3}
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 12, padding: 12, marginTop: 10, fontSize: 14, resize: 'vertical', fontFamily: 'inherit' }} />

      {erro && <div style={{ color: '#993C1D', fontSize: 13, marginTop: 8 }}>{erro}</div>}

      <button onClick={enviar} disabled={enviando}
        style={{ width: '100%', marginTop: 14, background: '#0E7C86', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: enviando ? 0.6 : 1 }}>
        {enviando ? 'Enviando…' : 'Enviar avaliação'}
      </button>
      <p style={{ color: '#aaa', fontSize: 11, marginTop: 12 }}>Sua opinião ajuda a melhorar o cuidado com você.</p>
    </div></div>
  );
}
