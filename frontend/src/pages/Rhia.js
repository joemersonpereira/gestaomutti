import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner, { bannerBtn } from '../components/Banner';

export default function Rhia() {
  const { API, usuario } = useAuth();
  const dono = ['Diretor Geral', 'Gestor Geral'].includes(usuario.funcao); // a Rhia é do Diretor: ele treina e vê tudo
  const [status, setStatus] = useState(null);
  const [msgs, setMsgs] = useState([{ de: 'rhia', texto: `Oi, eu sou a Rhia 🤖 — a inteligência do Grupo Mutti. Pergunte o que precisar: farmácia, atendimento, gestão, financeiro ou o próprio sistema. Eu respondo pela minha inteligência e pelo que o Diretor me ensina.` }]);
  const [pergunta, setPergunta] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [painel, setPainel] = useState(false);
  const [convOpen, setConvOpen] = useState(false);
  const fimRef = useRef(null);
  const carregarStatus = useCallback(() => API.get('/rhia/status').then(r => setStatus(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregarStatus(); }, [carregarStatus]);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const enviar = () => {
    const q = pergunta.trim(); if (!q || carregando) return;
    setMsgs(m => [...m, { de: 'user', texto: q }]); setPergunta(''); setCarregando(true);
    API.post('/rhia/perguntar', { pergunta: q }).then(r => {
      setMsgs(m => [...m, { de: 'rhia', texto: r.data.resposta, fontes: r.data.fontes, id: r.data.id, usouIa: r.data.usouIa }]);
    }).catch(() => setMsgs(m => [...m, { de: 'rhia', texto: 'Tive um problema para responder agora. Tente de novo.' }]))
      .finally(() => setCarregando(false));
  };
  const feedback = (id, util) => API.post(`/rhia/feedback/${id}`, { util }).catch(() => {});

  return (
    <div style={s.wrap}>
      <Banner emoji="🤖" titulo="Rhia — a inteligência do Grupo Mutti" cor="ciano" sub={<>Pergunte de tudo: farmácia, atendimento, gestão, financeiro, marketing e o sistema. {status && !status.iaHabilitada && <span style={{ color: '#FFE9A8' }}>IA ainda não ativada — o Diretor precisa definir a chave da Anthropic.</span>}</>}>
        {dono && <>
          <button onClick={() => { setConvOpen(false); setPainel(p => !p); }} style={bannerBtn}>📚 Treinar{status ? ` (${status.fontes})` : ''}</button>
          <button onClick={() => { setPainel(false); setConvOpen(c => !c); }} style={bannerBtn}>💬 O que perguntam</button>
        </>}
      </Banner>

      {painel && <BaseConhecimento API={API} onChange={carregarStatus} />}
      {convOpen && <Conversas API={API} />}

      <div style={s.chat}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.de === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{ ...s.bolha, ...(m.de === 'user' ? s.bolhaUser : s.bolhaRhia) }}>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{m.texto}</div>
              {m.fontes && m.fontes.length > 0 && <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>📎 {m.fontes.map(f => f.titulo).join(' · ')}</div>}
              {m.id && <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button onClick={() => feedback(m.id, 1)} style={s.fb}>👍 útil</button>
                <button onClick={() => feedback(m.id, 0)} style={s.fb}>👎</button>
              </div>}
            </div>
          </div>
        ))}
        {carregando && <div style={{ fontSize: 12, color: '#999' }}>Rhia está pensando…</div>}
        <div ref={fimRef} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input value={pergunta} onChange={e => setPergunta(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} placeholder="Pergunte à Rhia…" style={{ ...s.inp, flex: 1 }} />
        <button onClick={enviar} disabled={carregando} style={s.btn}>Enviar</button>
      </div>
    </div>
  );
}

function BaseConhecimento({ API, onChange }) {
  const [fontes, setFontes] = useState([]);
  const [tipo, setTipo] = useState('texto');
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [url, setUrl] = useState('');
  const [base64, setBase64] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/rhia/fontes').then(r => setFontes(r.data.fontes || [])).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const onFile = e => { const f = e.target.files[0]; if (!f) return; setTitulo(t => t || f.name.replace(/\.pdf$/i, '')); const rd = new FileReader(); rd.onload = () => setBase64(rd.result); rd.readAsDataURL(f); };
  const salvar = () => {
    if (!titulo) { setMsg('Dê um título.'); return; }
    setMsg('Processando…');
    API.post('/rhia/fontes', { tipo, titulo, texto, url, base64 }).then(r => {
      setMsg(`✅ Aprendido (${r.data.trechos} trecho(s)).`); setTexto(''); setUrl(''); setBase64(''); setTitulo(''); carregar(); onChange && onChange();
    }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  };
  const remover = id => API.delete(`/rhia/fontes/${id}`).then(() => { carregar(); onChange && onChange(); });

  const seedFarma = () => { setMsg('Carregando pacote…'); API.post('/rhia/seed-farma').then(r => { setMsg(`✅ Pacote farmacêutico carregado (${r.data.adicionadas} artigo(s)).`); carregar(); onChange && onChange(); }).catch(() => setMsg('⚠️ Erro')); };
  const seedSistema = () => { setMsg('Carregando mapa do sistema…'); API.post('/rhia/seed-sistema').then(r => { setMsg(`✅ Mapa do sistema carregado (${r.data.trechos} trecho(s)).`); carregar(); onChange && onChange(); }).catch(() => setMsg('⚠️ Erro')); };
  return (
    <div style={s.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>📚 Ensinar a Rhia</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={seedSistema} style={{ ...s.btnMini, borderColor: '#2E5C9E', color: '#2E5C9E' }}>🧭 Carregar mapa do sistema</button>
          <button onClick={seedFarma} style={{ ...s.btnMini, borderColor: '#7A4FB0', color: '#7A4FB0' }}>💊 Carregar pacote farmacêutico</button>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: '#999', marginBottom: 8 }}>Pacote base: referência × genérico × similar, como ler receita, tarjas/controlados, pesquisa de princípio ativo. Você pode complementar com seus próprios materiais abaixo.</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {[['texto', '✍️ Texto'], ['pdf', '📄 PDF'], ['imagem', '🖼️ Imagem'], ['audio', '🎙️ Áudio'], ['link', '🔗 Link/Vídeo']].map(([v, l]) => <button key={v} onClick={() => setTipo(v)} style={{ ...s.chip, ...(tipo === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título (ex: Política de troca)" style={s.inp} />
        {tipo === 'texto' && <textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Cole aqui o conteúdo/procedimento…" style={{ ...s.inp, minHeight: 90, resize: 'vertical' }} />}
        {tipo === 'pdf' && <><input type="file" accept="application/pdf" onChange={onFile} />{base64 && <span style={{ fontSize: 12, color: '#1E874B' }}>PDF carregado ✓</span>}<span style={{ fontSize: 11, color: '#999' }}>PDFs de texto (manuais, políticas). PDFs que são só imagem não têm texto para extrair.</span></>}
        {tipo === 'imagem' && <><input type="file" accept="image/*" onChange={onFile} />{base64 && <span style={{ fontSize: 12, color: '#1E874B' }}>Imagem carregada ✓</span>}<textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Observação (opcional) — a Rhia vai LER a imagem e entender o conteúdo" style={{ ...s.inp, minHeight: 50, resize: 'vertical' }} /><span style={{ fontSize: 11, color: '#999' }}>🖼️ A Rhia lê a imagem (foto de cartaz, tabela, receita, procedimento) com a IA. Requer a IA ativada.</span></>}
        {tipo === 'audio' && <><input type="file" accept="audio/*" onChange={onFile} /><textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Cole aqui um resumo/transcrição do áudio (a transcrição automática ainda está em roadmap)" style={{ ...s.inp, minHeight: 70, resize: 'vertical' }} /><span style={{ fontSize: 11, color: '#999' }}>🎙️ Por enquanto a Rhia aprende pelo resumo/transcrição colado; transcrição automática de áudio virá com serviço dedicado.</span></>}
        {tipo === 'link' && <><input value={url} onChange={e => setUrl(e.target.value)} placeholder="URL do vídeo/material" style={s.inp} /><textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Resumo/transcrição do vídeo (opcional, ajuda a Rhia a responder)" style={{ ...s.inp, minHeight: 60, resize: 'vertical' }} /></>}
        {msg && <div style={{ fontSize: 12.5, color: msg[0] === '✅' ? '#1E874B' : msg[0] === '⚠' ? '#C0392B' : '#888' }}>{msg}</div>}
        <button onClick={salvar} style={s.btn}>Ensinar</button>
      </div>
      {fontes.length > 0 && <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Base atual ({fontes.length}):</div>
        {fontes.map(f => (
          <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '5px 0', borderTop: '1px solid #f2f2f2' }}>
            <span>{f.tipo === 'pdf' ? '📄' : f.tipo === 'link' ? '🔗' : '✍️'} {f.titulo} <span style={{ color: '#bbb' }}>· {f.trechos} trecho(s)</span></span>
            <button onClick={() => remover(f.id)} style={s.fb}>remover</button>
          </div>
        ))}
      </div>}
    </div>
  );
}

// Painel do Diretor: histórico de tudo que perguntaram à Rhia.
function Conversas({ API }) {
  const [conv, setConv] = useState(null);
  useEffect(() => { API.get('/rhia/conversas').then(r => setConv(r.data.conversas || [])).catch(() => setConv([])); }, [API]);
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>💬 O que perguntam à Rhia <span style={{ fontWeight: 400, color: '#999' }}>(últimas 200)</span></div>
      {!conv && <div style={{ fontSize: 12, color: '#999' }}>Carregando…</div>}
      {conv && conv.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Ninguém perguntou nada ainda.</div>}
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {(conv || []).map(c => (
          <div key={c.id} style={{ padding: '7px 0', borderTop: '1px solid #f2f2f2', fontSize: 12.5 }}>
            <div style={{ color: '#666' }}><b>{c.colaborador || 'Colaborador'}</b> · {new Date(c.criado_em + 'Z').toLocaleString('pt-BR')} {c.usou_ia ? '' : '· (sem IA)'} {c.util === 1 ? '· 👍' : c.util === 0 ? '· 👎' : ''}</div>
            <div style={{ marginTop: 2 }}>❓ {c.pergunta}</div>
            <div style={{ marginTop: 2, color: '#444', whiteSpace: 'pre-wrap' }}>💬 {String(c.resposta || '').slice(0, 400)}{(c.resposta || '').length > 400 ? '…' : ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 900, margin: '0 auto', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', minHeight: '70vh' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 12 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 12 },
  chat: { flex: 1, background: '#F7F8FA', border: '1px solid #eee', borderRadius: 12, padding: 14, overflowY: 'auto', marginTop: 8, minHeight: 320 },
  bolha: { maxWidth: '80%', padding: '10px 12px', borderRadius: 12 },
  bolhaUser: { background: '#111', color: '#fff', borderBottomRightRadius: 3 },
  bolhaRhia: { background: '#fff', color: '#222', border: '1px solid #eee', borderBottomLeftRadius: 3 },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '9px 11px', fontSize: 13.5 },
  btn: { fontSize: 13, padding: '9px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 12, padding: '6px 10px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
  chip: { fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  fb: { fontSize: 11, padding: '2px 8px', background: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: 12, cursor: 'pointer' },
};
