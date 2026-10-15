import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const DIM_L = { s_geral: 'Satisfação geral', s_lideranca: 'Liderança', s_ambiente: 'Ambiente e clima', s_remuneracao: 'Remuneração', s_crescimento: 'Crescimento', s_reconhecimento: 'Reconhecimento', s_carga: 'Carga de trabalho', s_ferramentas: 'Ferramentas/condições' };
const dt = x => x ? String(x).slice(0, 10).split('-').reverse().join('/') : '';

export default function Pesquisas() {
  const [aba, setAba] = useState('clima');
  return (
    <div style={s.wrap}>
      <Banner emoji="📊" titulo="Pesquisas" cor="roxo" sub="Clima interno (eNPS) e avaliação dos setores e da gerência pelos colaboradores." />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['clima', '💬 Clima (eNPS)'], ['avaliacao', '🏅 Setores & gerência']].map(([v, l]) => (
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>
        ))}
      </div>
      {aba === 'clima' && <ClimaTab />}
      {aba === 'avaliacao' && <AvaliacaoSetores />}
    </div>
  );
}

function ClimaTab() {
  const { API } = useAuth();
  const [d, setD] = useState(null);
  const [sel, setSel] = useState(null);
  const [titulo, setTitulo] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/clima/campanhas').then(r => { setD(r.data); if (!sel && r.data.campanhas[0]) setSel(r.data.campanhas[0].id); }).catch(() => setD(false)), [API, sel]);
  useEffect(() => { carregar(); }, [carregar]);
  const abrir = () => API.post('/clima/campanhas', { titulo: titulo || 'Pesquisa de clima' }).then(() => { setTitulo(''); carregar(); }).catch(e => setMsg(e.response?.data?.erro || 'Erro'));
  const encerrar = id => { if (window.confirm('Encerrar esta pesquisa? Ninguém mais poderá responder.')) API.post(`/clima/campanhas/${id}/encerrar`).then(carregar); };
  if (!d) return <div style={s.card}>Carregando…</div>;
  const aberta = d.campanhas.find(c => c.status === 'aberta');

  return (
    <>
      <div style={s.sub}>Ouça a equipe de forma anônima e acompanhe o eNPS interno — retenção antes de perder gente.</div>

      <div style={s.card}>
        {aberta ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13 }}>🟢 Pesquisa <strong>aberta</strong>: {aberta.titulo} · {aberta.participou}/{d.ativos} responderam ({d.ativos ? Math.round(aberta.participou / d.ativos * 100) : 0}%)</div>
            <button onClick={() => encerrar(aberta.id)} style={{ ...s.btn, background: '#993C1D' }}>Encerrar pesquisa</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título (ex.: Clima — 2º semestre)" style={{ ...s.inp, flex: 1, minWidth: 200 }} />
            <button onClick={abrir} style={s.btn}>Abrir nova pesquisa</button>
          </div>
        )}
        {msg && <div style={{ fontSize: 12, color: '#993C1D', marginTop: 6 }}>{msg}</div>}
      </div>

      {d.campanhas.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {d.campanhas.map(c => <button key={c.id} onClick={() => setSel(c.id)} style={{ ...s.chip, ...(sel === c.id ? s.chipOn : {}) }}>{c.titulo} · {dt(c.criado_em)}{c.status === 'aberta' ? ' 🟢' : ''}</button>)}
        </div>
      )}
      {sel && <Analytics API={API} id={sel} ativos={d.ativos} />}
    </>
  );
}

function Analytics({ API, id, ativos }) {
  const [a, setA] = useState(null);
  useEffect(() => { API.get(`/clima/campanhas/${id}/analytics`).then(r => setA(r.data)).catch(() => setA(false)); }, [API, id]);
  if (!a) return <div style={s.card}>Carregando…</div>;
  const enpsCor = a.enps == null ? '#999' : a.enps >= 50 ? '#3B6D11' : a.enps >= 0 ? '#BA7517' : '#993C1D';
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 12 }}>
        <Kpi t="Respostas" v={a.respostas} sub={ativos ? `${Math.round(a.respostas / ativos * 100)}% da equipe` : ''} cor="#185FA5" bg="#EAF3FB" />
        <Kpi t="eNPS interno" v={a.enps == null ? '—' : a.enps} sub="recomendaria a empresa" cor={enpsCor} bg="#F6F2FB" />
      </div>
      <div style={s.card}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 8 }}>Médias por dimensão (1 a 5)</div>
        {Object.entries(a.medias).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ width: 150, fontSize: 12, color: '#444' }}>{DIM_L[k] || k}</span>
            <div style={{ flex: 1, height: 8, background: '#eee', borderRadius: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: `${((v || 0) / 5) * 100}%`, background: v == null ? '#ccc' : v >= 4 ? '#3B6D11' : v >= 3 ? '#BA7517' : '#993C1D' }} /></div>
            <span style={{ width: 30, fontSize: 13, fontWeight: 700, textAlign: 'right', color: v == null ? '#999' : '#333' }}>{v == null ? '—' : v.toFixed(1)}</span>
          </div>
        ))}
        {a.respostas === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhuma resposta ainda.</div>}
      </div>
      {a.por_loja.length > 0 && (
        <div style={s.card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 8 }}>Satisfação geral por loja <span style={{ fontWeight: 400, color: '#aaa' }}>(só lojas com 3+ respostas)</span></div>
          {a.por_loja.map((l, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}><span>{l.loja} <span style={{ color: '#aaa' }}>({l.n})</span></span><strong>{l.s_geral == null ? '—' : l.s_geral.toFixed(1)}</strong></div>)}
        </div>
      )}
      {a.comentarios.length > 0 && (
        <div style={s.card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 8 }}>Comentários (anônimos)</div>
          {a.comentarios.map((c, i) => <div key={i} style={{ fontSize: 12.5, color: '#555', fontStyle: 'italic', padding: '5px 0', borderTop: i ? '1px solid #f4f4f4' : 'none' }}>“{c}”</div>)}
        </div>
      )}
    </div>
  );
}

function Kpi({ t, v, sub, cor, bg }) {
  return <div style={{ background: bg, borderRadius: 12, padding: '14px 16px' }}>
    <div style={{ fontSize: 11, color: cor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .3 }}>{t}</div>
    <div style={{ fontSize: 28, fontWeight: 800, color: cor, marginTop: 2 }}>{v}</div>
    {sub && <div style={{ fontSize: 11, color: cor, opacity: .8 }}>{sub}</div>}
  </div>;
}

// ── Avaliação de setores & gerência (gestão) ────────────────────────────────
function AvaliacaoSetores() {
  const { API } = useAuth();
  const [lista, setLista] = useState(null);
  const [sug, setSug] = useState({ setores: [], gerentes: [] });
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(null); // null = fechado; objeto = criando
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/pesquisas').then(r => setLista(r.data)).catch(() => setLista(false)), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/pesquisas/sugestoes').then(r => setSug(r.data)).catch(() => {}); }, [API]);

  const novo = () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const fim = new Date(Date.now() + 13 * 864e5).toISOString().slice(0, 10);
    setForm({ titulo: '', inicio: hoje, fim, pontosResposta: 20, setores: [...sug.setores], gerentes: sug.gerentes.map(g => ({ ...g, on: true })),
      perguntasSetor: [...(sug.perguntasSetor || [])], perguntasGerencia: [...(sug.perguntasGerencia || [])] });
  };
  const toggleSetor = nome => setForm(f => ({ ...f, setores: f.setores.includes(nome) ? f.setores.filter(x => x !== nome) : [...f.setores, nome] }));
  const toggleGer = id => setForm(f => ({ ...f, gerentes: f.gerentes.map(g => g.id === id ? { ...g, on: !g.on } : g) }));
  const setPerg = (campo, i, v) => setForm(f => ({ ...f, [campo]: f[campo].map((p, j) => j === i ? v : p) }));
  const addPerg = campo => setForm(f => ({ ...f, [campo]: [...f[campo], ''] }));
  const delPerg = (campo, i) => setForm(f => ({ ...f, [campo]: f[campo].filter((_, j) => j !== i) }));
  const criar = () => {
    const payload = { titulo: form.titulo, inicio: form.inicio, fim: form.fim, pontosResposta: form.pontosResposta, setores: form.setores, gerentes: form.gerentes.filter(g => g.on).map(g => ({ id: g.id, nome: g.nome })),
      perguntasSetor: form.perguntasSetor.map(p => p.trim()).filter(Boolean), perguntasGerencia: form.perguntasGerencia.map(p => p.trim()).filter(Boolean) };
    API.post('/pesquisas', payload).then(() => { setForm(null); setMsg('✅ Pesquisa criada.'); carregar(); setTimeout(() => setMsg(''), 3000); })
      .catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  };
  const encerrar = id => { if (window.confirm('Encerrar esta pesquisa? Ninguém mais poderá responder.')) API.post(`/pesquisas/${id}/encerrar`).then(carregar); };

  if (lista === null) return <div style={s.card}>Carregando…</div>;
  return (
    <>
      <div style={{ ...s.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: '#555' }}>Colaboradores avaliam <b>setores</b> e a <b>gerência</b>. Quem responde ganha os pontos configurados.</div>
        {!form && <button onClick={novo} style={s.btn}>+ Nova pesquisa</button>}
      </div>
      {msg && <div style={{ fontSize: 12.5, color: msg.startsWith('⚠️') ? '#993C1D' : '#3B6D11', marginBottom: 10 }}>{msg}</div>}

      {form && (
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Nova pesquisa de avaliação</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <label style={s.fld}>Título<input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Avaliação de setores e gerência" style={{ ...s.inp, width: 260 }} /></label>
            <label style={s.fld}>Início<input type="date" value={form.inicio} onChange={e => setForm({ ...form, inicio: e.target.value })} style={s.inp} /></label>
            <label style={s.fld}>Fim<input type="date" value={form.fim} onChange={e => setForm({ ...form, fim: e.target.value })} style={s.inp} /></label>
            <label style={s.fld}>Pontos por resposta<input type="number" min="0" value={form.pontosResposta} onChange={e => setForm({ ...form, pontosResposta: e.target.value })} style={{ ...s.inp, width: 96 }} /></label>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#666', margin: '4px 0 6px' }}>Setores a avaliar</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {sug.setores.map(nome => <button key={nome} onClick={() => toggleSetor(nome)} style={{ ...s.chip, ...(form.setores.includes(nome) ? s.chipOn : {}) }}>{form.setores.includes(nome) ? '✓ ' : ''}{nome}</button>)}
            {!sug.setores.length && <span style={{ fontSize: 12, color: '#999' }}>Nenhum setor cadastrado nos colaboradores.</span>}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#666', margin: '4px 0 6px' }}>Gerência a avaliar</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {form.gerentes.map(g => <button key={g.id} onClick={() => toggleGer(g.id)} style={{ ...s.chip, ...(g.on ? s.chipOn : {}) }}>{g.on ? '✓ ' : ''}{g.nome}{g.loja ? ` · ${g.loja}` : ''}</button>)}
            {!form.gerentes.length && <span style={{ fontSize: 12, color: '#999' }}>Nenhum gerente ativo encontrado.</span>}
          </div>
          {form.setores.length > 0 && <PerguntasEditor titulo="❓ Perguntas sobre os setores" itens={form.perguntasSetor} onSet={(i, v) => setPerg('perguntasSetor', i, v)} onAdd={() => addPerg('perguntasSetor')} onDel={i => delPerg('perguntasSetor', i)} />}
          {form.gerentes.some(g => g.on) && <PerguntasEditor titulo="❓ Perguntas sobre a gerência" itens={form.perguntasGerencia} onSet={(i, v) => setPerg('perguntasGerencia', i, v)} onAdd={() => addPerg('perguntasGerencia')} onDel={i => delPerg('perguntasGerencia', i)} />}
          <div style={{ fontSize: 11, color: '#999', margin: '4px 0 10px' }}>💡 O colaborador dá uma nota de <b>1 a 5</b> para cada pergunta, em cada setor e cada gerente, e pode deixar um comentário. Ao criar, a pesquisa fica <b>publicada</b> e disponível no período — os colaboradores respondem em <b>Meu RH → Avaliação</b>.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={criar} style={s.btn}>Criar e publicar pesquisa</button>
            <button onClick={() => setForm(null)} style={{ ...s.btn, background: '#eee', color: '#555' }}>Cancelar</button>
          </div>
        </div>
      )}

      {!lista.pesquisas?.length && !form && <div style={s.card}><div style={{ fontSize: 13, color: '#999' }}>Nenhuma pesquisa de avaliação ainda.</div></div>}
      {(lista.pesquisas || []).map(p => (
        <div key={p.id} style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{p.vigente ? '🟢 ' : p.status === 'aberta' ? '🟡 ' : '⚫ '}{p.titulo}</div>
              <div style={{ fontSize: 11.5, color: '#888' }}>{dt(p.inicio)} a {dt(p.fim)} · {p.alvos} alvos · {p.respondentes}/{lista.ativos} responderam · {p.pontos_resposta} pts/resposta{p.vigente ? '' : p.status === 'aberta' ? ' · fora do período' : ' · encerrada'}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setSel(sel === p.id ? null : p.id)} style={{ ...s.chip, ...(sel === p.id ? s.chipOn : {}) }}>{sel === p.id ? 'Fechar' : 'Resultados'}</button>
              {p.status === 'aberta' && <button onClick={() => encerrar(p.id)} style={{ ...s.btn, background: '#993C1D', padding: '6px 12px', fontSize: 12 }}>Encerrar</button>}
            </div>
          </div>
          {sel === p.id && <Resultados API={API} id={p.id} />}
        </div>
      ))}
    </>
  );
}

function PerguntasEditor({ titulo, itens, onSet, onAdd, onDel }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#666', margin: '4px 0 6px' }}>{titulo}</div>
      {itens.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: '#bbb', paddingTop: 8 }}>{i + 1}.</span>
          <input value={p} onChange={e => onSet(i, e.target.value)} placeholder="Escreva a pergunta…" style={{ ...s.inp, flex: 1 }} />
          <button onClick={() => onDel(i)} title="Remover" style={{ ...s.chip, color: '#993C1D', borderColor: '#eecccc' }}>✕</button>
        </div>
      ))}
      <button onClick={onAdd} style={{ ...s.chip, marginTop: 2 }}>+ pergunta</button>
    </div>
  );
}

function Resultados({ API, id }) {
  const [r, setR] = useState(null);
  useEffect(() => { API.get(`/pesquisas/${id}/resultados`).then(x => setR(x.data)).catch(() => setR(false)); }, [API, id]);
  if (!r) return <div style={{ fontSize: 12, color: '#999', marginTop: 10 }}>Carregando resultados…</div>;
  const Bloco = ({ titulo, itens }) => !itens.length ? null : (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 6 }}>{titulo}</div>
      {itens.map(a => (
        <div key={a.id} style={{ padding: '6px 0', borderTop: '1px solid #f4f4f4' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, fontSize: 13, color: '#333' }}>{a.nome} <span style={{ color: '#aaa', fontSize: 11 }}>({a.respostas})</span></span>
            <div style={{ flex: 1, maxWidth: 220, height: 8, background: '#eee', borderRadius: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: `${((a.media || 0) / 5) * 100}%`, background: a.media == null ? '#ccc' : a.media >= 4 ? '#3B6D11' : a.media >= 3 ? '#BA7517' : '#993C1D' }} /></div>
            <strong style={{ width: 34, textAlign: 'right', fontSize: 13, color: a.media == null ? '#999' : '#333' }}>{a.media == null ? '—' : a.media.toFixed(1)}</strong>
          </div>
          {a.porPergunta?.length > 0 && <div style={{ marginTop: 4, paddingLeft: 12 }}>{a.porPergunta.map((q, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#888', padding: '1px 0' }}>
              <span style={{ flex: 1 }}>{q.pergunta} <span style={{ color: '#bbb' }}>({q.respostas})</span></span>
              <strong style={{ width: 30, textAlign: 'right', color: q.media == null ? '#bbb' : q.media >= 4 ? '#3B6D11' : q.media >= 3 ? '#BA7517' : '#993C1D' }}>{q.media == null ? '—' : q.media.toFixed(1)}</strong>
            </div>))}</div>}
          {a.comentarios.length > 0 && <div style={{ marginTop: 4, paddingLeft: 2 }}>{a.comentarios.slice(0, 4).map((c, i) => <div key={i} style={{ fontSize: 11.5, color: '#777', fontStyle: 'italic' }}>“{c}”</div>)}</div>}
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 8 }}>
      <div style={{ fontSize: 12, color: '#888' }}>{r.respondentes} respondente(s). Média de 1 (ruim) a 5 (excelente).</div>
      <Bloco titulo="🏢 Setores" itens={r.setores} />
      <Bloco titulo="👔 Gerência" itens={r.gerencia} />
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1120, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 12 },
  chip: { fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  fld: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#888' },
  btn: { fontSize: 13, padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
};
