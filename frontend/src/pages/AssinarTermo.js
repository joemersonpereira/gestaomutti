import React, { useState, useEffect, useRef, useCallback } from 'react';

const api = (path, opts) => fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...opts }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.erro || 'Erro'); return d; });

export default function AssinarTermo() {
  const token = new URLSearchParams(window.location.search).get('t') || '';
  const [termo, setTermo] = useState(null);
  const [erro, setErro] = useState('');
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const temAssinatura = useRef(false);

  useEffect(() => {
    if (!token) { setErro('Link inválido.'); return; }
    api('/termos/public/' + token).then(t => { setTermo(t); setNome(t.paciente_nome || ''); if (t.status === 'assinado') setPronto(true); }).catch(e => setErro(e.message));
  }, [token]);

  // Canvas de assinatura (mouse + toque)
  const pos = e => {
    const c = canvasRef.current, r = c.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) };
  };
  const start = e => { e.preventDefault(); drawing.current = true; const ctx = canvasRef.current.getContext('2d'); const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = e => { if (!drawing.current) return; e.preventDefault(); const ctx = canvasRef.current.getContext('2d'); const p = pos(e); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#153'; ctx.lineTo(p.x, p.y); ctx.stroke(); temAssinatura.current = true; };
  const end = () => { drawing.current = false; };
  const limpar = useCallback(() => { const c = canvasRef.current; if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height); temAssinatura.current = false; }, []);

  async function assinar() {
    if (!nome.trim()) { setErro('Informe seu nome completo.'); return; }
    if (!temAssinatura.current) { setErro('Faça sua assinatura no quadro.'); return; }
    if (!aceite) { setErro('Marque o aceite do termo.'); return; }
    setEnviando(true); setErro('');
    try {
      await api('/termos/public/' + token + '/assinar', { method: 'POST', body: JSON.stringify({ assinante_nome: nome.trim(), assinante_cpf: cpf.trim(), assinatura: canvasRef.current.toDataURL('image/png'), aceite: true }) });
      setPronto(true);
    } catch (e) { setErro(e.message); }
    setEnviando(false);
  }

  if (erro && !termo) return <Tela><div style={{ color: '#C0392B', fontSize: 15 }}>⚠️ {erro}</div></Tela>;
  if (!termo) return <Tela><div style={{ color: '#666' }}>Carregando termo…</div></Tela>;
  if (pronto) return <Tela><div style={{ textAlign: 'center' }}><div style={{ fontSize: 42 }}>✅</div><div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>Termo assinado!</div><div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>Obrigado. Pode devolver o aparelho ao atendente.</div></div></Tela>;

  return (
    <Tela>
      <div style={{ fontSize: 12, color: '#0E7C86', fontWeight: 700, letterSpacing: 0.5 }}>{termo.loja_nome || 'Grupo Mutti'} · Cuidado Farmacêutico</div>
      <div style={{ fontSize: 20, fontWeight: 800, margin: '4px 0 2px' }}>Termo de responsabilidade</div>
      {termo.tipo && <div style={{ fontSize: 13, color: '#555' }}>Serviço: <b>{termo.tipo}</b></div>}
      <div style={{ background: '#F7FBFC', border: '1px solid #d7ecef', borderRadius: 10, padding: '12px 14px', fontSize: 13.5, color: '#333', lineHeight: 1.6, margin: '12px 0', whiteSpace: 'pre-wrap' }}>{termo.termo_texto}</div>

      <label style={s.lab}>Nome completo</label>
      <input value={nome} onChange={e => setNome(e.target.value)} style={s.inp} placeholder="Seu nome" />
      <label style={s.lab}>CPF (opcional)</label>
      <input value={cpf} onChange={e => setCpf(e.target.value)} style={s.inp} placeholder="000.000.000-00" />

      <label style={s.lab}>Assinatura</label>
      <div style={{ border: '1px dashed #9bd', borderRadius: 10, background: '#fff', position: 'relative' }}>
        <canvas ref={canvasRef} width={520} height={170}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          style={{ width: '100%', height: 170, touchAction: 'none', display: 'block' }} />
        <button type="button" onClick={limpar} style={{ position: 'absolute', top: 6, right: 6, fontSize: 11, padding: '3px 9px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>limpar</button>
      </div>

      <label style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'flex-start', margin: '12px 0' }}>
        <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} style={{ marginTop: 3 }} />
        <span>Li e concordo com o termo acima, e autorizo o registro dos meus dados para fins de atendimento (LGPD).</span>
      </label>
      {erro && <div style={{ fontSize: 13, color: '#C0392B', marginBottom: 8 }}>⚠️ {erro}</div>}
      <button onClick={assinar} disabled={enviando} style={{ width: '100%', fontSize: 15, fontWeight: 700, padding: '13px', background: '#0E7C86', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', opacity: enviando ? 0.6 : 1 }}>{enviando ? 'enviando…' : '✔ Assinar termo'}</button>
    </Tela>
  );
}

function Tela({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#eef4f5', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '18px 12px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 6px 30px rgba(0,0,0,.12)', padding: '20px 18px', maxWidth: 560, width: '100%' }}>{children}</div>
    </div>
  );
}

const s = {
  lab: { display: 'block', fontSize: 12, color: '#666', margin: '8px 0 3px', fontWeight: 600 },
  inp: { width: '100%', padding: '11px 12px', fontSize: 14, border: '1px solid #ccd', borderRadius: 9, boxSizing: 'border-box' },
};
