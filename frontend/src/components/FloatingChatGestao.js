import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const quando = iso => { if (!iso) return ''; const d = new Date(iso.replace(' ', 'T') + 'Z'); const dif = (Date.now() - d.getTime()) / 1000; if (dif < 60) return 'agora'; if (dif < 3600) return Math.floor(dif / 60) + 'min'; if (dif < 86400) return Math.floor(dif / 3600) + 'h'; return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); };

// Chat do escritório flutuante — sala única da gestão, disponível em qualquer tela (só p/ escritório).
export default function FloatingChatGestao() {
  const { API, usuario } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState(null);
  const [eu, setEu] = useState(null);
  const [texto, setTexto] = useState('');
  const [bloqueado, setBloqueado] = useState(false);
  const fim = useRef(null);

  const carregar = useCallback(() => {
    API.get('/painel/chat').then(r => { setMsgs(r.data.mensagens || []); setEu(r.data.eu); })
      .catch(e => { if (e.response?.status === 403) setBloqueado(true); else setMsgs([]); });
  }, [API]);

  // Só o escritório enxerga; carrega/poll quando aberto.
  useEffect(() => { if (!usuario?.escritorio) return; carregar(); }, [usuario, carregar]);
  useEffect(() => { if (!aberto || !usuario?.escritorio) return; const t = setInterval(carregar, 8000); return () => clearInterval(t); }, [aberto, usuario, carregar]);
  useEffect(() => { if (aberto) fim.current?.scrollIntoView(); }, [msgs, aberto]);

  if (!usuario?.escritorio || bloqueado) return null;

  const enviar = () => { const t = texto.trim(); if (!t) return; setTexto(''); API.post('/painel/chat', { texto: t }).then(carregar); };

  return (
    <>
      <button onClick={() => setAberto(a => !a)} title="Chat da Gestão" style={S.fab}>{aberto ? '✕' : '💬'}</button>
      {aberto && (
        <div style={S.painel}>
          <div style={S.cab}>💬 Chat da Gestão <span style={{ fontSize: 11, fontWeight: 400, opacity: .85 }}>· escritório</span></div>
          <div style={S.corpo}>
            {msgs === null ? <div style={{ fontSize: 12, color: '#999' }}>carregando…</div> :
              !msgs.length ? <div style={{ fontSize: 12, color: '#aaa' }}>Comece a conversa do escritório aqui. 👋</div> :
                msgs.map(m => { const meu = m.autor_id === eu; return (
                  <div key={m.id} style={{ marginBottom: 7, textAlign: meu ? 'right' : 'left' }}>
                    <div style={{ display: 'inline-block', maxWidth: '86%', background: meu ? '#185FA5' : '#fff', color: meu ? '#fff' : '#333', border: meu ? 'none' : '1px solid #e6e9ee', borderRadius: 12, padding: '6px 10px', textAlign: 'left' }}>
                      {!meu && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#185FA5' }}>{m.autor_nome}</div>}
                      <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{m.texto}</div>
                      <div style={{ fontSize: 9.5, opacity: 0.6, textAlign: 'right', marginTop: 1 }}>{quando(m.criado_em)}</div>
                    </div>
                  </div>
                ); })}
            <div ref={fim} />
          </div>
          <div style={S.rodape}>
            <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} placeholder="Mensagem para a gestão…" style={S.input} />
            <button onClick={enviar} style={S.btnEnviar}>➤</button>
          </div>
        </div>
      )}
    </>
  );
}

const S = {
  fab: { position: 'fixed', right: 20, bottom: 86, width: 56, height: 56, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg,#2E5C9E,#0E3E6E)', color: '#fff', fontSize: 23, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,.25)', zIndex: 3000 },
  painel: { position: 'fixed', right: 20, bottom: 152, width: 340, maxWidth: 'calc(100vw - 40px)', height: 460, maxHeight: '70vh', background: '#F7F9FB', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,.28)', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 3000, fontFamily: 'system-ui, sans-serif' },
  cab: { background: 'linear-gradient(120deg,#185FA5,#0E3E6E)', color: '#fff', padding: '11px 14px', fontSize: 14, fontWeight: 700 },
  corpo: { flex: 1, overflowY: 'auto', padding: 10 },
  rodape: { display: 'flex', gap: 6, padding: 8, background: '#fff', borderTop: '1px solid #eef1f4' },
  input: { flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit' },
  btnEnviar: { fontSize: 13, padding: '8px 12px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
};
