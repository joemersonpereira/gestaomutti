import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

// Widget flutuante da Rhia — disponível em qualquer tela do sistema.
export default function FloatingRhia() {
  const { API } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState([{ de: 'rhia', texto: 'Oi! 🤖 Sou a Rhia. Precisa de ajuda com o sistema, um processo ou uma dúvida de medicamento? Pergunte aqui.' }]);
  const [q, setQ] = useState('');
  const [load, setLoad] = useState(false);
  const fim = useRef(null);
  useEffect(() => { if (aberto) fim.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, aberto]);

  const enviar = () => {
    const p = q.trim(); if (!p || load) return;
    setMsgs(m => [...m, { de: 'user', texto: p }]); setQ(''); setLoad(true);
    API.post('/rhia/perguntar', { pergunta: p })
      .then(r => setMsgs(m => [...m, { de: 'rhia', texto: r.data.resposta, fontes: r.data.fontes }]))
      .catch(() => setMsgs(m => [...m, { de: 'rhia', texto: 'Tive um problema agora. Tente de novo.' }]))
      .finally(() => setLoad(false));
  };

  return (
    <>
      <button onClick={() => setAberto(a => !a)} title="Rhia — assistente" style={S.fab}>{aberto ? '✕' : '🤖'}</button>
      {aberto && (
        <div style={S.painel}>
          <div style={S.cab}>🤖 Rhia <span style={{ fontSize: 11, fontWeight: 400, opacity: .8 }}>· assistente do Mutti</span></div>
          <div style={S.corpo}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.de === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                <div style={{ ...S.bolha, ...(m.de === 'user' ? S.bUser : S.bRhia) }}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.texto}</div>
                  {m.fontes && m.fontes.length > 0 && <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>📎 {m.fontes.map(f => f.titulo).join(' · ')}</div>}
                </div>
              </div>
            ))}
            {load && <div style={{ fontSize: 11, color: '#999' }}>Rhia está pensando…</div>}
            <div ref={fim} />
          </div>
          <div style={S.rodape}>
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} placeholder="Pergunte à Rhia…" style={S.inp} />
            <button onClick={enviar} disabled={load} style={S.env}>➤</button>
          </div>
        </div>
      )}
    </>
  );
}

const S = {
  fab: { position: 'fixed', right: 20, bottom: 20, width: 56, height: 56, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg,#7A4FB0,#2E5C9E)', color: '#fff', fontSize: 24, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,.25)', zIndex: 3000 },
  painel: { position: 'fixed', right: 20, bottom: 86, width: 340, maxWidth: 'calc(100vw - 40px)', height: 460, maxHeight: '70vh', background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,.28)', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 3000, fontFamily: 'system-ui, sans-serif' },
  cab: { background: 'linear-gradient(135deg,#7A4FB0,#2E5C9E)', color: '#fff', padding: '12px 14px', fontWeight: 700, fontSize: 15 },
  corpo: { flex: 1, overflowY: 'auto', padding: 12, background: '#F7F8FA', fontSize: 12.5 },
  bolha: { maxWidth: '85%', padding: '8px 10px', borderRadius: 10 },
  bUser: { background: '#111', color: '#fff', borderBottomRightRadius: 2 },
  bRhia: { background: '#fff', color: '#222', border: '1px solid #eee', borderBottomLeftRadius: 2 },
  rodape: { display: 'flex', gap: 6, padding: 8, borderTop: '1px solid #eee' },
  inp: { flex: 1, border: '1px solid #ddd', borderRadius: 20, padding: '8px 12px', fontSize: 13, outline: 'none' },
  env: { width: 38, borderRadius: '50%', border: 'none', background: '#2E5C9E', color: '#fff', cursor: 'pointer', fontSize: 15 },
};
