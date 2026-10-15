import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

const COR = { verde: '#1E874B', amarelo: '#B7791F', vermelho: '#C0392B', neutro: '#334' };
const BG = { verde: '#EAF7EF', amarelo: '#FCF7EA', vermelho: '#FBEAEA', neutro: '#F4F6F8' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const slug = t => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const keyDe = a => 'diretoria:' + (a.link || slug(a.area));
const quando = iso => { if (!iso) return ''; const d = new Date(iso.replace(' ', 'T') + 'Z'); const dif = (Date.now() - d.getTime()) / 1000; if (dif < 60) return 'agora'; if (dif < 3600) return Math.floor(dif / 60) + 'min'; if (dif < 86400) return Math.floor(dif / 3600) + 'h'; return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); };

function pior(a) {
  if (a.erro) return '#B7791F';
  const st = (a.kpis || []).map(k => k.status);
  if (st.includes('vermelho')) return COR.vermelho;
  if (st.includes('amarelo')) return COR.amarelo;
  if (st.includes('verde')) return COR.verde;
  return '#ccd';
}

export default function PainelGestao() {
  const { API, usuario } = useAuth();
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano] = useState(hoje.getFullYear());
  const [d, setD] = useState(null);
  const [carreg, setCarreg] = useState(false);
  const [cont, setCont] = useState({});
  const [pessoas, setPessoas] = useState([]);
  const podeEditar = ['Diretor Geral', 'Gestor Geral'].includes(usuario.funcao);
  const carregar = useCallback(() => {
    setCarreg(true);
    API.get('/painel/diretoria', { params: { mes, ano } }).then(r => setD(r.data)).catch(() => setD(false)).finally(() => setCarreg(false));
    API.get('/painel/comentarios/contagem').then(r => setCont(r.data.contagem || {})).catch(() => {});
  }, [API, mes, ano]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/painel/pessoas').then(r => setPessoas(r.data.pessoas || [])).catch(() => {}); }, [API]);
  const irPara = link => window.dispatchEvent(new CustomEvent('mutti-nav', { detail: link }));
  const salvarConfig = (key, dono, meta, expectativas) => API.post('/painel/setor-config', { setor_key: key, dono, meta, expectativas }).then(carregar).catch(() => {});

  const areas = (d && d.areas) || [];
  const prioridades = areas.filter(a => !a.erro && a.cobrar && ['#C0392B', '#B7791F'].includes(pior(a)))
    .map(a => ({ area: a.area, emoji: a.emoji, link: a.link, cobrar: a.cobrar, cor: pior(a) }))
    .sort((x, y) => (x.cor === COR.vermelho ? 0 : 1) - (y.cor === COR.vermelho ? 0 : 1));
  const R = d && d.resumo;

  return (
    <div style={s.wrap}>
      <div style={s.banner}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🎯 Painel da Gestão</div>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>Visão de todos os setores — a gestão comenta, combina e cobra aqui mesmo.</div>
          {R && <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 26, fontWeight: 800 }}>{R.mediaRede ?? '—'}<span style={{ fontSize: 13, opacity: 0.7 }}>/100</span></div><div style={{ fontSize: 11, opacity: 0.8 }}>Nota média da rede</div></div>
            <div><div style={{ fontSize: 26, fontWeight: 800 }}>{R.lojasCriticas ?? '—'}</div><div style={{ fontSize: 11, opacity: 0.8 }}>Lojas abaixo de 75</div></div>
            <div><div style={{ fontSize: 26, fontWeight: 800 }}>{prioridades.length}</div><div style={{ fontSize: 11, opacity: 0.8 }}>Setores para cobrar</div></div>
          </div>}
        </div>
        <div style={s.bannerArt}>📊</div>
        <label style={{ position: 'absolute', top: 16, right: 18, zIndex: 2, fontSize: 11, color: '#fff', opacity: 0.95 }}>
          <select value={mes} onChange={e => setMes(Number(e.target.value))} style={{ background: 'rgba(255,255,255,.2)', color: '#fff', border: '1px solid rgba(255,255,255,.4)', borderRadius: 8, padding: '5px 8px', fontSize: 12 }}>
            {MESES.map((m, i) => <option key={i} value={i + 1} style={{ color: '#333' }}>{m}/{ano}</option>)}
          </select>
        </label>
      </div>

      {carreg && !d && <div style={{ ...s.card, textAlign: 'center', color: '#888' }}>Reunindo os indicadores de todos os setores…</div>}
      {d === false && <div style={s.card}>Sem acesso.</div>}
      {d && d.areas && (
        <div style={s.colunas}>
          <aside style={s.lateral}>
            <div style={s.card}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#666', marginBottom: 8 }}>🩺 Saúde da rede</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Mini n={(R?.mediaRede ?? '—') + '/100'} l="Nota média" cor={R?.mediaRede >= 90 ? COR.verde : R?.mediaRede >= 75 ? COR.amarelo : COR.vermelho} />
                <Mini n={R?.lojasCriticas ?? '—'} l="Lojas abaixo de 75" cor={R?.lojasCriticas ? COR.vermelho : COR.verde} />
                <Mini n={R?.lojasTotal ?? '—'} l="Lojas ativas" cor="#334" />
              </div>
              <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 8 }}>{carreg ? 'atualizando…' : `atualizado ${d.geradoEm?.split('-').reverse().join('/') || ''}`}</div>
            </div>
          </aside>

          <div style={s.centro}>
            {(d.setores || []).map(sx => {
              const doSetor = areas.filter(a => a.setor === sx.key);
              if (!doSetor.length) return null;
              return <SetorGrupo key={sx.key} sx={sx} areas={doSetor} API={API} cont={cont} pessoas={pessoas} irPara={irPara} onComentou={carregar} podeEditar={podeEditar} onSalvar={salvarConfig} />;
            })}
          </div>

          <aside style={s.lateralDir}>
            <div style={s.card}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#666', marginBottom: 8 }}>🚨 Prioridades — o que cobrar</div>
              {!prioridades.length ? <div style={{ fontSize: 12, color: '#1E874B' }}>Tudo no verde. 👏</div> :
                prioridades.map((p, i) => (
                  <div key={i} onClick={() => p.link && irPara(p.link)} style={{ borderLeft: `3px solid ${p.cor}`, background: '#FAFBFC', borderRadius: 8, padding: '8px 10px', marginBottom: 8, cursor: p.link ? 'pointer' : 'default' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>{p.emoji} {p.area}</div>
                    <div style={{ fontSize: 11.5, color: '#666', marginTop: 2 }}>{p.cobrar}</div>
                  </div>
                ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Mini({ n, l, cor }) {
  return <div style={{ background: '#F6F7F9', borderRadius: 10, padding: '8px 12px' }}>
    <div style={{ fontSize: 20, fontWeight: 800, color: cor }}>{n}</div>
    <div style={{ fontSize: 11, color: '#777' }}>{l}</div>
  </div>;
}

// Grupo de um departamento: cabeçalho (dono + meta editáveis + semáforo consolidado) + suas áreas.
function SetorGrupo({ sx, areas, API, cont, pessoas, irPara, onComentou, podeEditar, onSalvar }) {
  const [editando, setEditando] = useState(false);
  const [dono, setDono] = useState(sx.dono || '');
  const [meta, setMeta] = useState(sx.meta || '');
  const [exp, setExp] = useState(sx.expectativas || '');
  const [verExp, setVerExp] = useState(false);
  useEffect(() => { setDono(sx.dono || ''); setMeta(sx.meta || ''); setExp(sx.expectativas || ''); }, [sx.dono, sx.meta, sx.expectativas]);
  const cores = areas.map(pior);
  const rollup = cores.includes(COR.vermelho) ? COR.vermelho : cores.includes(COR.amarelo) ? COR.amarelo : cores.includes(COR.verde) ? COR.verde : '#ccd';
  const salvar = () => { onSalvar(sx.key, dono, meta, exp); setEditando(false); };
  const expLinhas = (sx.expectativas || '').split('\n').map(l => l.trim()).filter(Boolean);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 2px 6px' }}>
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: rollup, flexShrink: 0 }} />
        <div style={{ fontSize: 16, fontWeight: 800 }}>{sx.emoji} {sx.nome}</div>
        {podeEditar && !editando && <button onClick={() => setEditando(true)} title="Definir dono, meta e expectativas" style={s.editar}>✏️ dono/meta</button>}
      </div>
      {!editando ? (
        <div style={{ paddingLeft: 19, margin: '0 2px 8px' }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#555' }}>
            <span>👤 <b>Responsável:</b> {sx.dono || '—'}</span>
            {sx.meta ? <span>🎯 <b>Meta:</b> {sx.meta}</span> : (podeEditar ? <span style={{ color: '#aaa' }}>🎯 meta não definida</span> : null)}
            {expLinhas.length > 0 && <button onClick={() => setVerExp(v => !v)} style={{ ...s.editar, padding: '1px 8px' }}>📋 Expectativas {verExp ? '▲' : '▼'}</button>}
          </div>
          {verExp && expLinhas.length > 0 && (
            <div style={{ marginTop: 6, background: '#F7F9FB', border: '1px solid #eef1f4', borderRadius: 10, padding: '8px 12px' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>O que se espera do setor{sx.expectativas_sugerida ? ' · sugestão (edite e salve)' : ''}:</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {expLinhas.map((l, i) => <li key={i} style={{ fontSize: 12, color: '#444', marginBottom: 2 }}>{l}</li>)}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...s.card, marginBottom: 8, marginLeft: 19 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Responsável a cobrar</div>
          <input value={dono} onChange={e => setDono(e.target.value)} placeholder="ex.: Valderson (compras medicamentos)" style={s.cfgInp} />
          <div style={{ fontSize: 11, color: '#888', margin: '6px 0 4px' }}>Meta / alvo do setor</div>
          <input value={meta} onChange={e => setMeta(e.target.value)} placeholder="ex.: ruptura ≤ 4% e cobertura 45–60d" style={s.cfgInp} />
          <div style={{ fontSize: 11, color: '#888', margin: '6px 0 4px' }}>Expectativas do setor (uma por linha) — o que você espera do chefe/equipe</div>
          <textarea value={exp} onChange={e => setExp(e.target.value)} rows={5} style={{ ...s.cfgInp, resize: 'vertical', lineHeight: 1.5 }} />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={salvar} style={s.enviar}>Salvar</button>
            <button onClick={() => setEditando(false)} style={s.comentarBtn2}>Cancelar</button>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 12, alignItems: 'start' }}>
        {areas.map((a, i) => <BlocoSetor key={i} a={a} API={API} pk={keyDe(a)} cont={cont[keyDe(a)]} pessoas={pessoas} irPara={irPara} onComentou={onComentou} />)}
      </div>
    </div>
  );
}

// Seta de tendência mês-a-mês (verde = melhorou, vermelho = piorou, cinza = estável)
function Tend({ t }) {
  if (!t) return null;
  if (t.dir === 'flat') return <span title="estável vs mês anterior" style={{ fontSize: 11, color: '#9aa2ab', marginLeft: 4 }}>▬</span>;
  const cor = t.bom ? '#1E874B' : '#C0392B';
  return <span title={(t.dir === 'up' ? 'subiu' : 'caiu') + ' vs mês anterior — ' + (t.bom ? 'melhorou' : 'piorou')} style={{ fontSize: 12, color: cor, fontWeight: 700, marginLeft: 4 }}>{t.dir === 'up' ? '▲' : '▼'}</span>;
}

// Bloco de um setor com KPIs + comentários (comunidade da gestão em cima do painel)
function BlocoSetor({ a, API, pk, cont, pessoas, irPara, onComentou }) {
  const [aberto, setAberto] = useState(false);
  const [coments, setComents] = useState(null);
  const [texto, setTexto] = useState('');
  const [dir, setDir] = useState('');
  const [aviso, setAviso] = useState('');
  const nCom = cont?.n || 0;
  const abrir = () => {
    const nv = !aberto; setAberto(nv);
    if (nv && !coments) API.get('/painel/comentarios', { params: { key: pk } }).then(r => setComents(r.data.comentarios || [])).catch(() => setComents([]));
  };
  const enviar = () => {
    const t = texto.trim(); if (!t) return;
    API.post('/painel/comentarios', { key: pk, texto: t, direcionar_id: dir || undefined }).then(r => {
      setTexto('');
      if (r.data?.tarefa_id) { const p = (pessoas || []).find(x => x.id === dir); setAviso('✅ Tarefa aberta para ' + (p?.nome || 'a pessoa') + '.'); setTimeout(() => setAviso(''), 4000); }
      setDir('');
      API.get('/painel/comentarios', { params: { key: pk } }).then(r2 => setComents(r2.data.comentarios || [])); onComentou && onComentou();
    });
  };
  const apagar = id => API.delete(`/painel/comentarios/${id}`).then(() => { setComents(c => c.filter(x => x.id !== id)); onComentou && onComentou(); }).catch(() => {});
  return (
    <div style={{ ...s.card, borderLeft: `4px solid ${pior(a)}`, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{a.emoji} {a.area}<Tend t={a.tendencia} /></div>
        {a.link && <button onClick={() => irPara(a.link)} style={s.ir}>abrir →</button>}
      </div>
      {a.erro ? <div style={{ fontSize: 12, color: '#B7791F' }}>⚠️ Dado indisponível agora (ERP ocupado). Recarregue.</div> : <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(a.kpis || []).map((k, j) => (
            <div key={j} style={{ background: BG[k.status] || BG.neutro, borderRadius: 10, padding: '8px 12px', minWidth: 96, flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: COR[k.status] || COR.neutro }}>{k.valor}</div>
              <div style={{ fontSize: 10.5, color: '#666' }}>{k.label}</div>
              {k.sub && <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>{k.sub}</div>}
            </div>
          ))}
        </div>
        {a.cobrar && <div style={{ fontSize: 12, color: '#444', marginTop: 9, background: '#FAFBFC', border: '1px solid #eef1f4', borderRadius: 8, padding: '7px 10px' }}>📌 {a.cobrar}</div>}
      </>}
      <button onClick={abrir} style={{ ...s.comentarBtn, marginTop: 9 }}>💬 {nCom ? `${nCom} comentário${nCom > 1 ? 's' : ''}` : 'Comentar neste painel'} {aberto ? '▲' : '▼'}</button>
      {aberto && <div style={{ marginTop: 8, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
        {coments === null ? <div style={{ fontSize: 12, color: '#999' }}>carregando…</div> :
          coments.length === 0 ? <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>Sem comentários. Deixe a primeira nota.</div> :
            coments.map(c => (
              <div key={c.id} style={{ padding: '5px 0', borderTop: '1px solid #f6f6f6' }}>
                <div style={{ fontSize: 11.5 }}><b>{c.autor_nome}</b> <span style={{ color: '#bbb' }}>{c.autor_funcao ? `· ${c.autor_funcao} ` : ''}· {quando(c.criado_em)}</span>
                  <button onClick={() => apagar(c.id)} title="Apagar" style={{ float: 'right', border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
                <div style={{ fontSize: 12.5, color: '#444', whiteSpace: 'pre-wrap' }}>{c.texto}</div>
              </div>
            ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} placeholder="Escreva uma nota, contexto, combinado…" style={{ flex: 1, minWidth: 150, border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 12.5 }} />
          <select value={dir} onChange={e => setDir(e.target.value)} title="Direcionar a alguém (abre uma tarefa)" style={{ border: '1px solid #ddd', borderRadius: 8, padding: '7px 6px', fontSize: 11.5, maxWidth: 140, color: dir ? '#185FA5' : '#888' }}>
            <option value="">↗ Direcionar…</option>
            {(pessoas || []).map(p => <option key={p.id} value={p.id}>{p.nome}{p.funcao ? ` · ${p.funcao}` : ''}</option>)}
          </select>
          <button onClick={enviar} style={s.enviar}>{dir ? 'Enviar + tarefa' : 'Enviar'}</button>
        </div>
        {aviso && <div style={{ fontSize: 11, color: '#1E874B', marginTop: 4 }}>{aviso}</div>}
      </div>}
    </div>
  );
}

// Chat do escritório (sala única da gestão) — poll a cada 8s
function ChatGestao({ API }) {
  const [msgs, setMsgs] = useState(null);
  const [eu, setEu] = useState(null);
  const [texto, setTexto] = useState('');
  const fimRef = useRef(null);
  const carregar = useCallback(() => API.get('/painel/chat').then(r => { setMsgs(r.data.mensagens || []); setEu(r.data.eu); }).catch(() => setMsgs([])), [API]);
  useEffect(() => { carregar(); const t = setInterval(carregar, 8000); return () => clearInterval(t); }, [carregar]);
  useEffect(() => { fimRef.current && fimRef.current.scrollIntoView(); }, [msgs]);
  const enviar = () => { const t = texto.trim(); if (!t) return; setTexto(''); API.post('/painel/chat', { texto: t }).then(carregar); };
  return (
    <div style={{ ...s.card, display: 'flex', flexDirection: 'column', maxHeight: 460 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#666', marginBottom: 6 }}>💬 Chat da Gestão <span style={{ fontWeight: 400, color: '#aaa' }}>· escritório</span></div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 180, background: '#F7F9FB', borderRadius: 10, padding: 8 }}>
        {msgs === null ? <div style={{ fontSize: 12, color: '#999' }}>carregando…</div> :
          !msgs.length ? <div style={{ fontSize: 12, color: '#aaa' }}>Comece a conversa do escritório aqui. 👋</div> :
            msgs.map(m => { const meu = m.autor_id === eu; return (
              <div key={m.id} style={{ marginBottom: 7, textAlign: meu ? 'right' : 'left' }}>
                <div style={{ display: 'inline-block', maxWidth: '88%', background: meu ? '#185FA5' : '#fff', color: meu ? '#fff' : '#333', border: meu ? 'none' : '1px solid #e6e9ee', borderRadius: 12, padding: '6px 10px', textAlign: 'left' }}>
                  {!meu && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#185FA5' }}>{m.autor_nome}</div>}
                  <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{m.texto}</div>
                  <div style={{ fontSize: 9.5, opacity: 0.6, textAlign: 'right', marginTop: 1 }}>{quando(m.criado_em)}</div>
                </div>
              </div>
            ); })}
        <div ref={fimRef} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} placeholder="Mensagem…" style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 12.5 }} />
        <button onClick={enviar} style={s.enviar}>➤</button>
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1320, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  banner: { background: 'linear-gradient(120deg,#3A7BD5 0%,#185FA5 45%,#0E3E6E 100%)', color: '#fff', borderRadius: 18, padding: '22px 24px', marginBottom: 16, position: 'relative', overflow: 'hidden', boxShadow: '0 6px 22px rgba(14,62,110,.28)' },
  bannerArt: { position: 'absolute', right: 20, bottom: -10, fontSize: 120, opacity: 0.14, lineHeight: 1 },
  colunas: { display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  lateral: { flex: '1 1 250px', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 10 },
  centro: { flex: '2 1 460px', minWidth: 320 },
  lateralDir: { flex: '1 1 250px', maxWidth: 320, position: 'sticky', top: 10 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 0 },
  ir: { fontSize: 11.5, padding: '4px 10px', background: '#fff', color: '#2E5C9E', border: '1px solid #cdddef', borderRadius: 7, cursor: 'pointer' },
  comentarBtn: { fontSize: 12, padding: '5px 10px', background: '#F4F6F8', color: '#555', border: '1px solid #e6e9ee', borderRadius: 8, cursor: 'pointer', width: '100%', textAlign: 'left' },
  enviar: { fontSize: 12.5, padding: '7px 12px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  editar: { fontSize: 11, padding: '3px 9px', background: '#fff', color: '#666', border: '1px solid #dde3ea', borderRadius: 7, cursor: 'pointer', marginLeft: 4 },
  cfgInp: { width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 12.5, fontFamily: 'inherit' },
  comentarBtn2: { fontSize: 12.5, padding: '7px 12px', background: '#F4F6F8', color: '#555', border: '1px solid #e6e9ee', borderRadius: 8, cursor: 'pointer' },
};
