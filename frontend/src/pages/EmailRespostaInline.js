import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

// Responder o e-mail de origem DIRETO da tarefa (origem='email'). Envia via SMTP.
export default function EmailRespostaInline({ tarefaId }) {
  const { API } = useAuth();
  const [meta, setMeta] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [pode, setPode] = useState(false);
  const [conta, setConta] = useState(null); // por qual conta ESTE usuário envia
  const [abrir, setAbrir] = useState(false);
  const [texto, setTexto] = useState('');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cfgAberto, setCfgAberto] = useState(false);

  const carregar = useCallback(() => {
    API.get(`/tarefas/${tarefaId}/email`).then(r => { setMeta(r.data.meta); setHistorico(r.data.historico || []); setPode(r.data.podeResponder); setConta(r.data.contaResponder || null); }).catch(() => setMeta(false));
  }, [API, tarefaId]);
  useEffect(() => { carregar(); }, [carregar]);

  const enviar = () => {
    if (!texto.trim()) { setMsg('Escreva a resposta.'); return; }
    setEnviando(true); setMsg('');
    API.post(`/tarefas/${tarefaId}/email-responder`, { texto })
      .then(r => { setMsg('✅ Resposta enviada para ' + r.data.para); setTexto(''); setAbrir(false); carregar(); })
      .catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'falha ao enviar')))
      .finally(() => setEnviando(false));
  };

  if (!meta) return null;
  const respondido = meta.respondido_em;
  const fmtData = d => { try { return new Date(String(d).replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return String(d || '').slice(0, 16); } };
  return (
    <div style={s.box}>
      <div style={{ fontSize: 11.5, color: '#555' }}>✉️ De <b>{meta.remetente_nome || ''} &lt;{meta.remetente}&gt;</b>{meta.assunto ? ` · ${meta.assunto}` : ''}</div>

      {/* Histórico da conversa (recebido + enviado) */}
      {historico.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
          {historico.map((h, i) => {
            const enviado = h.direcao === 'enviado';
            return (
              <div key={i} style={{ alignSelf: enviado ? 'flex-end' : 'flex-start', maxWidth: '88%', background: enviado ? '#E8F1FB' : '#fff', border: `1px solid ${enviado ? '#CFE0F5' : '#eee'}`, borderRadius: 10, padding: '7px 10px' }}>
                <div style={{ fontSize: 10.5, color: enviado ? '#2C6FA6' : '#888', fontWeight: 600, marginBottom: 2 }}>
                  {enviado ? `➡️ Enviado${h.por ? ' por ' + h.por : ''}` : `⬅️ Recebido de ${h.de_nome || h.de_email}`} · {fmtData(h.data)}
                </div>
                <div style={{ fontSize: 12, color: '#333', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{h.texto || '(sem texto)'}</div>
              </div>
            );
          })}
        </div>
      )}

      {respondido && !abrir && <div style={{ fontSize: 11, color: '#1E8449', marginTop: 6 }}>✅ Última resposta{meta.respondido_por ? ` por ${meta.respondido_por}` : ''} em {String(meta.respondido_em).slice(0, 16).replace('T', ' ')}</div>}
      {/* Sempre é possível continuar respondendo (não só quando chega mensagem nova). */}
      {pode
        ? (abrir
          ? <div style={{ marginTop: 6 }}>
              <textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escreva a mensagem…" rows={4} style={s.ta} />
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button onClick={enviar} disabled={enviando} style={s.btn}>{enviando ? 'enviando…' : '📧 Enviar'}</button>
                <button onClick={() => setAbrir(false)} style={s.btnMini}>cancelar</button>
              </div>
              {/* Deixa claro por QUAL conta o e-mail vai sair (própria do usuário ou a padrão). */}
              <div style={{ fontSize: 10.5, color: '#999', marginTop: 4 }}>
                Para {meta.remetente} na mesma conversa · sai de <b style={{ color: conta?.propria ? '#2C6FA6' : '#999' }}>{conta?.email || '—'}</b>
                {conta?.propria ? ' (sua conta)' : ' (conta padrão)'}
              </div>
            </div>
          : <button onClick={() => setAbrir(true)} style={{ ...s.btnMini, marginTop: 6, color: '#2C6FA6', fontWeight: 600 }}>↩️ {respondido ? 'Responder de novo / enviar mais' : 'Responder por e-mail'}</button>)
        : <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>Sem permissão para responder.</div>}
      {msg && <div style={{ fontSize: 11.5, marginTop: 5, color: msg.startsWith('✅') ? '#1E8449' : '#C0392B' }}>{msg}</div>}

      {/* Configurar a PRÓPRIA conta de e-mail: quem responde envia pelo servidor dele. */}
      {pode && (
        <div style={{ marginTop: 8, borderTop: '1px dashed #e5e5e5', paddingTop: 6 }}>
          <button onClick={() => setCfgAberto(v => !v)} style={{ ...s.btnMini, border: 'none', padding: 0, color: '#888' }}>
            ⚙️ minha conta de e-mail {conta?.propria ? '(configurada)' : '(usando a padrão)'}
          </button>
          {cfgAberto && <MinhaConta API={API} onSalvo={() => { setCfgAberto(false); carregar(); }} />}
        </div>
      )}
    </div>
  );
}

// Formulário da conta de e-mail própria do colaborador (só a dele; a senha não é devolvida ao carregar).
function MinhaConta({ API, onSalvo }) {
  const [f, setF] = useState({ email: '', smtp_host: '', smtp_port: 465, imap_host: '', imap_port: 993, senha: '' });
  const [temSenha, setTemSenha] = useState(false);
  const [msg, setMsg] = useState('');
  const [salv, setSalv] = useState(false);
  useEffect(() => {
    API.get('/tarefas/email/minha-conta').then(r => {
      const c = r.data.conta;
      if (c) { setF(x => ({ ...x, email: c.email || '', smtp_host: c.smtp_host || '', smtp_port: c.smtp_port || 465, imap_host: c.imap_host || '', imap_port: c.imap_port || 993, senha: '' })); setTemSenha(!!c.temSenha); }
    }).catch(() => {});
  }, [API]);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const salvar = () => {
    setSalv(true); setMsg('');
    API.put('/tarefas/email/minha-conta', f)
      .then(() => { setMsg('✅ conta salva — suas respostas sairão deste e-mail'); onSalvo && onSalvo(); })
      .catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'falha ao salvar')))
      .finally(() => setSalv(false));
  };
  const remover = () => { API.delete('/tarefas/email/minha-conta').then(() => { setMsg('conta removida'); onSalvo && onSalvo(); }).catch(() => {}); };
  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10.5, color: '#999' }}>Preencha se quiser que as respostas saiam do <b>seu</b> e-mail (ex.: Hostinger/Gmail). Senão, sai da conta padrão do grupo.</div>
      <input value={f.email} onChange={e => set('email', e.target.value)} placeholder="seu e-mail (ex.: daniel@grupomutti.com.br)" style={s.ta} />
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={f.smtp_host} onChange={e => set('smtp_host', e.target.value)} placeholder="SMTP saída (ex.: smtp.hostinger.com)" style={{ ...s.ta, flex: 2 }} />
        <input value={f.smtp_port} onChange={e => set('smtp_port', e.target.value)} placeholder="porta" style={{ ...s.ta, flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={f.imap_host} onChange={e => set('imap_host', e.target.value)} placeholder="IMAP entrada (ex.: imap.hostinger.com)" style={{ ...s.ta, flex: 2 }} />
        <input value={f.imap_port} onChange={e => set('imap_port', e.target.value)} placeholder="porta" style={{ ...s.ta, flex: 1 }} />
      </div>
      <div style={{ fontSize: 10, color: '#aaa' }}>Preencha o IMAP para que a resposta que voltar na sua caixa apareça de volta na tarefa.</div>
      <input type="password" value={f.senha} onChange={e => set('senha', e.target.value)} placeholder={temSenha ? 'senha (deixe em branco p/ manter)' : 'senha da conta de e-mail'} style={s.ta} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={salvar} disabled={salv} style={s.btn}>{salv ? 'salvando…' : 'Salvar minha conta'}</button>
        {temSenha && <button onClick={remover} style={s.btnMini}>usar a padrão</button>}
      </div>
      {msg && <div style={{ fontSize: 11, color: msg.startsWith('✅') ? '#1E8449' : '#C0392B' }}>{msg}</div>}
    </div>
  );
}

const s = {
  box: { marginTop: 8, background: '#fafafa', border: '1px solid #eee', borderRadius: 10, padding: '10px 12px' },
  ta: { width: '100%', padding: '8px 10px', fontSize: 12.5, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' },
  btn: { fontSize: 12.5, padding: '7px 14px', background: '#2C6FA6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 12, padding: '6px 10px', background: 'none', color: '#555', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
};
