import React, { useEffect, useState } from 'react';

// Página PÚBLICA (sem login) — QR do vendedor. O cliente avalia quem o atendeu.
// URL: /avaliar-vendedor?v=<colaborador_id>. A avaliação é validada depois, quando a
// compra dele com esse vendedor é confirmada no caixa.
const CARINHAS = [
  { n: 1, emoji: '😞', txt: 'Péssimo' },
  { n: 2, emoji: '😕', txt: 'Ruim' },
  { n: 3, emoji: '😐', txt: 'Regular' },
  { n: 4, emoji: '🙂', txt: 'Bom' },
  { n: 5, emoji: '😍', txt: 'Ótimo' },
];

export default function AvaliarVendedor() {
  const vendId = new URLSearchParams(window.location.search).get('v') || '';
  const [vend, setVend] = useState(null);
  const [erroVend, setErroVend] = useState(false);
  const [nota, setNota] = useState(0);
  const [cpf, setCpf] = useState('');
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState('');

  const mascaraCpf = v => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');

  useEffect(() => {
    if (!vendId) { setErroVend(true); return; }
    fetch(`/api/satisfacao/publico/vendedor/${encodeURIComponent(vendId)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setVend).catch(() => setErroVend(true));
  }, [vendId]);

  async function enviar() {
    if (!nota) { setErro('Toque em uma carinha para dar sua nota.'); return; }
    if (cpf.replace(/\D/g, '').length !== 11) { setErro('Informe seu CPF (11 dígitos) — usamos só para confirmar seu atendimento.'); return; }
    setEnviando(true); setErro('');
    try {
      const r = await fetch('/api/satisfacao/publico-vendedor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendedor_id: vendId, nota, comentario, cpf: cpf.replace(/\D/g, '') }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(data.erro || 'Não consegui enviar. Tente de novo.'); return; }
      setOk(true);
    } catch { setErro('Não consegui enviar. Tente de novo.'); }
    finally { setEnviando(false); }
  }

  const wrap = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg,#185FA5,#0E3E6E)', padding: 20, fontFamily: 'system-ui, sans-serif' };
  const card = { background: '#fff', borderRadius: 20, padding: '28px 22px', width: '100%', maxWidth: 420, boxShadow: '0 12px 40px rgba(0,0,0,.25)', textAlign: 'center' };
  const iniciais = n => String(n || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

  if (erroVend) return <div style={wrap}><div style={card}><div style={{ fontSize: 40 }}>🔍</div><h2>Vendedor não encontrado</h2><p style={{ color: '#666' }}>O QR parece inválido. Peça ajuda a um atendente.</p></div></div>;
  if (!vend) return <div style={wrap}><div style={card}>Carregando…</div></div>;

  if (ok) return (
    <div style={wrap}><div style={card}>
      <div style={{ fontSize: 64 }}>💚</div>
      <h2 style={{ margin: '8px 0', color: '#185FA5' }}>Obrigado!</h2>
      <p style={{ color: '#555', fontSize: 15 }}>Sua avaliação do atendimento de <strong>{vend.nome}</strong> foi registrada.</p>
    </div></div>
  );

  return (
    <div style={wrap}><div style={card}>
      <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#EAF3FB', color: '#185FA5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>{iniciais(vend.nome)}</div>
      <h2 style={{ margin: '8px 0 2px', color: '#185FA5' }}>{vend.nome}</h2>
      <p style={{ color: '#777', fontSize: 14, marginTop: 0 }}>{vend.loja} · Como foi seu atendimento?</p>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '18px 0 6px', flexWrap: 'wrap' }}>
        {CARINHAS.map(c => (
          <button key={c.n} onClick={() => { setNota(c.n); setErro(''); }}
            style={{ border: nota === c.n ? '2px solid #185FA5' : '2px solid #eee', background: nota === c.n ? '#EAF3FB' : '#fafafa', borderRadius: 14, width: 62, height: 76, cursor: 'pointer', transition: 'all .12s', transform: nota === c.n ? 'scale(1.06)' : 'none' }}>
            <div style={{ fontSize: 30, filter: nota && nota !== c.n ? 'grayscale(60%)' : 'none' }}>{c.emoji}</div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{c.txt}</div>
          </button>
        ))}
      </div>

      <input value={cpf} onChange={e => { setCpf(mascaraCpf(e.target.value)); setErro(''); }} inputMode="numeric"
        placeholder="Seu CPF (para confirmar o atendimento)"
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 12, padding: 12, marginTop: 12, fontSize: 15, textAlign: 'center', letterSpacing: 1, fontFamily: 'inherit' }} />

      <textarea value={comentario} onChange={e => setComentario(e.target.value)} maxLength={500}
        placeholder="Quer deixar um comentário? (opcional)" rows={3}
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 12, padding: 12, marginTop: 10, fontSize: 14, resize: 'vertical', fontFamily: 'inherit' }} />

      {erro && <div style={{ color: '#993C1D', fontSize: 13, marginTop: 8 }}>{erro}</div>}

      <button onClick={enviar} disabled={enviando}
        style={{ width: '100%', marginTop: 14, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: enviando ? 0.6 : 1 }}>
        {enviando ? 'Enviando…' : 'Enviar avaliação'}
      </button>
      <p style={{ color: '#aaa', fontSize: 11, marginTop: 12 }}>Usamos seu CPF apenas para confirmar seu atendimento de hoje. Uma avaliação por dia.</p>
    </div></div>
  );
}
