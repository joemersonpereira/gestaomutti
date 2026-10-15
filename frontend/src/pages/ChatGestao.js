import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const quando = iso => { if (!iso) return ''; const d = new Date(iso.replace(' ', 'T') + 'Z'); const dif = (Date.now() - d.getTime()) / 1000; if (dif < 60) return 'agora'; if (dif < 3600) return Math.floor(dif / 60) + 'min'; if (dif < 86400) return Math.floor(dif / 3600) + 'h'; return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

export default function ChatGestao() {
  const { API } = useAuth();
  const [msgs, setMsgs] = useState(null);
  const [eu, setEu] = useState(null);
  const [texto, setTexto] = useState('');
  const [semAcesso, setSemAcesso] = useState(false);
  const fimRef = useRef(null);
  const carregar = useCallback(() => API.get('/painel/chat')
    .then(r => { setMsgs(r.data.mensagens || []); setEu(r.data.eu); })
    .catch(e => { if (e.response?.status === 403) setSemAcesso(true); setMsgs([]); }), [API]);
  useEffect(() => { carregar(); const t = setInterval(carregar, 6000); return () => clearInterval(t); }, [carregar]);
  useEffect(() => { fimRef.current && fimRef.current.scrollIntoView(); }, [msgs]);
  const enviar = () => { const t = texto.trim(); if (!t) return; setTexto(''); API.post('/painel/chat', { texto: t }).then(carregar); };

  if (semAcesso) return <div style={s.wrap}><div style={s.card}>Este chat é do pessoal do escritório.</div></div>;
  return (
    <div style={s.wrap}>
      <Banner emoji="💬" titulo="Chat da Gestão" cor="azul" sub="Conversa do pessoal do escritório — combine, alinhe e resolva por aqui." />
      <div style={{ ...s.card, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)', minHeight: 380 }}>
        <div style={{ flex: 1, overflowY: 'auto', background: '#F7F9FB', borderRadius: 10, padding: 12 }}>
          {msgs === null ? <div style={{ fontSize: 13, color: '#999' }}>carregando…</div> :
            !msgs.length ? <div style={{ fontSize: 13, color: '#aaa' }}>Nenhuma mensagem ainda. Comece a conversa. 👋</div> :
              msgs.map(m => { const meu = m.autor_id === eu; return (
                <div key={m.id} style={{ marginBottom: 9, textAlign: meu ? 'right' : 'left' }}>
                  <div style={{ display: 'inline-block', maxWidth: '72%', background: meu ? '#185FA5' : '#fff', color: meu ? '#fff' : '#333', border: meu ? 'none' : '1px solid #e6e9ee', borderRadius: 14, padding: '8px 12px', textAlign: 'left', boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
                    {!meu && <div style={{ fontSize: 11, fontWeight: 700, color: '#185FA5' }}>{m.autor_nome} {m.autor_funcao ? <span style={{ fontWeight: 400, color: '#aaa' }}>· {m.autor_funcao}</span> : ''}</div>}
                    <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{m.texto}</div>
                    <div style={{ fontSize: 10, opacity: 0.6, textAlign: 'right', marginTop: 2 }}>{quando(m.criado_em)}</div>
                  </div>
                </div>
              ); })}
          <div ref={fimRef} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} placeholder="Escreva uma mensagem…" style={{ flex: 1, border: '1px solid #ddd', borderRadius: 10, padding: '10px 12px', fontSize: 14 }} />
          <button onClick={enviar} style={{ fontSize: 14, padding: '10px 20px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>Enviar</button>
        </div>
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 900, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px' },
};
