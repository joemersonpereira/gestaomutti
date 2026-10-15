import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const RST = {
  solicitado: { l: 'Solicitado', c: '#8A6D1D', bg: '#FBF3DA' },
  separado: { l: 'Separado', c: '#7A5AA8', bg: '#F1EAF9' },
  entregue: { l: 'Entregue', c: '#3B6D11', bg: '#E7F1DC' },
  cancelado: { l: 'Cancelado', c: '#993C1D', bg: '#F5E2DB' },
};
const dt = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
// Regras do Regulamento #EuSouGrupoMutti (as com * são lançadas pela Gente & Gestão).
const REGRA = [
  ['🎂 Aniversário pessoal', '100'], ['🥂 Tempo de casa', '100/ano'], ['🎓 Treinamento/curso', '10–20'],
  ['📱 Post social #EuSouGrupoMutti *', '15'], ['🔁 Repost oficial *', '5'], ['🚀 +10% acima da super meta', '200'],
  ['📊 Indicador alcançado *', '10'], ['🏦 Caixa zerado *', '100'],
];

export default function LojaPontos() {
  const { API, usuario } = useAuth();
  const admin = ['Suporte', 'Gestor Geral', 'Diretor Geral', 'Controladoria', 'RH'].includes(usuario.funcao);
  const [aba, setAba] = useState('loja');
  const abas = [['loja', '🎁 Loja'], ['extrato', '🧾 Meu extrato'], ['social', '📱 Post social']];
  if (admin) abas.push(['lancar', '➕ Lançar pontos'], ['fila', '📦 Resgates (gestão)'], ['config', '⚙️ Config']);
  return (
    <div style={s.wrap}>
      <Banner emoji="🏅" titulo="Loja de pontos" cor="roxo" sub="#EuSouGrupoMutti · acumule pontos participando do Grupo Mutti e troque por brindes." />
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {abas.map(([v, l]) => <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {aba === 'loja' && <Loja API={API} />}
      {aba === 'extrato' && <Extrato API={API} />}
      {aba === 'social' && <PostSocial API={API} usuario={usuario} />}
      {aba === 'lancar' && admin && <Lancar API={API} />}
      {aba === 'fila' && admin && <Fila API={API} />}
      {aba === 'config' && admin && <Config API={API} />}
    </div>
  );
}

function Extrato({ API }) {
  const [d, setD] = useState(null);
  useEffect(() => { API.get('/pontos/extrato').then(r => setD(r.data)).catch(() => setD(false)); }, [API]);
  if (!d) return <div style={s.card}>Carregando…</div>;
  const tipos = d.tipos || {};
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ ...s.card, flex: 1, minWidth: 100, marginBottom: 0, textAlign: 'center' }}><div style={{ fontSize: 11, color: '#999' }}>Ganhos</div><div style={{ fontSize: 22, fontWeight: 800, color: '#3B6D11' }}>{d.ganhos}</div></div>
        <div style={{ ...s.card, flex: 1, minWidth: 100, marginBottom: 0, textAlign: 'center' }}><div style={{ fontSize: 11, color: '#999' }}>Resgatados</div><div style={{ fontSize: 22, fontWeight: 800, color: '#993C1D' }}>{d.gastos}</div></div>
        <div style={{ ...s.card, flex: 1, minWidth: 100, marginBottom: 0, textAlign: 'center', background: '#F6F2FB' }}><div style={{ fontSize: 11, color: '#7A5AA8' }}>Saldo</div><div style={{ fontSize: 22, fontWeight: 800, color: '#7A5AA8' }}>{d.saldo}</div></div>
      </div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Extrato</div>
        {d.ganhos.length === 0 && d.resgates.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Você ainda não tem lançamentos. Participe para pontuar! 🚀</div>}
        {d.ganhos.map((g, k) => (
          <div key={'g' + k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderTop: '1px solid #f4f4f4' }}>
            <span>{tipos[g.tipo] || g.tipo}{g.descricao ? ` · ${g.descricao}` : ''} <span style={{ color: '#aaa' }}>· {dt(g.criado_em)}</span></span>
            <span style={{ color: '#3B6D11', fontWeight: 700 }}>+{g.pontos}</span>
          </div>
        ))}
        {d.resgates.map((r, k) => (
          <div key={'r' + k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderTop: '1px solid #f4f4f4' }}>
            <span>🎁 Resgate: {r.produto_nome} <span style={{ color: '#aaa' }}>· {dt(r.criado_em)}</span></span>
            <span style={{ color: '#993C1D', fontWeight: 700 }}>−{r.pontos}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Lancar({ API }) {
  const [colabs, setColabs] = useState([]);
  const [presets, setPresets] = useState([]);
  const [tipos, setTipos] = useState({});
  const [lancs, setLancs] = useState([]);
  const [form, setForm] = useState({ colaborador_id: '', tipo: 'post_social', pontos: 15, descricao: '' });
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/pontos/lancamentos').then(r => { setLancs(r.data.lancamentos || []); setTipos(r.data.tipos || {}); }).catch(() => {}), [API]);
  useEffect(() => {
    API.get('/colaboradores').then(r => setColabs(r.data.colaboradores || r.data || [])).catch(() => {});
    API.get('/pontos/presets').then(r => setPresets(r.data.presets || [])).catch(() => {});
    carregar();
  }, [API, carregar]);

  const escolherPreset = (i) => { const p = presets[i]; if (p) setForm({ ...form, tipo: p.tipo, pontos: p.pontos, descricao: p.label }); };
  const salvar = () => {
    if (!form.colaborador_id) return setMsg('Escolha o colaborador.');
    API.post('/pontos/lancar', form).then(() => { setMsg('✅ Pontos lançados!'); setForm({ ...form, colaborador_id: '' }); carregar(); setTimeout(() => setMsg(''), 3000); })
      .catch(e => setMsg(e.response?.data?.erro || 'Erro.'));
  };
  const remover = (id) => API.delete(`/pontos/lancamentos/${id}`).then(carregar);

  return (
    <div>
      <div style={{ ...s.card, maxWidth: 520 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Lançar pontos (#EuSouGrupoMutti)</div>
        <select value={form.colaborador_id} onChange={e => setForm({ ...form, colaborador_id: e.target.value })} style={{ ...s.inp, width: '100%', marginBottom: 8 }}>
          <option value="">Colaborador…</option>
          {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select onChange={e => escolherPreset(e.target.value)} style={{ ...s.inp, width: '100%', marginBottom: 8 }} defaultValue="">
          <option value="" disabled>Escolher regra do regulamento…</option>
          {presets.map((p, i) => <option key={i} value={i}>{p.label} — {p.pontos} pts</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Descrição" style={{ ...s.inp, flex: 1, minWidth: 160 }} />
          <input type="number" value={form.pontos} onChange={e => setForm({ ...form, pontos: e.target.value })} placeholder="Pontos" style={{ ...s.inp, width: 90 }} />
        </div>
        {msg && <div style={{ fontSize: 12, marginBottom: 8, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D' }}>{msg}</div>}
        <button onClick={salvar} style={s.btn}>Lançar pontos</button>
      </div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Últimos lançamentos</div>
        {lancs.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhum lançamento ainda.</div>}
        {lancs.map(l => (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '6px 0', borderTop: '1px solid #f4f4f4' }}>
            <span>{l.colaborador_nome} · {tipos[l.tipo] || l.tipo}{l.descricao ? ` · ${l.descricao}` : ''} <span style={{ color: '#aaa' }}>· {dt(l.criado_em)}{l.origem === 'automatico' ? ' · auto' : ''}</span></span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <b style={{ color: '#3B6D11' }}>+{l.pontos}</b>
              {l.origem === 'manual' && <button onClick={() => remover(l.id)} style={{ ...sBtn('#f3f3f3', '#993C1D'), padding: '3px 7px' }}>✕</button>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Loja({ API }) {
  const [saldo, setSaldo] = useState(null);
  const [itens, setItens] = useState([]);
  const [meus, setMeus] = useState([]);
  const [sel, setSel] = useState({}); // produto_id -> variacao_id
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => {
    API.get('/pontos/loja').then(r => { setSaldo(r.data.saldo); setItens(r.data.itens || []); }).catch(() => {});
    API.get('/pontos/meus-resgates').then(r => setMeus(r.data.resgates || [])).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  const resgatar = (p) => {
    const temVar = p.variacoes && p.variacoes.length > 0;
    const vid = temVar ? (sel[p.id] || p.variacoes[0].id) : null;
    const vNome = temVar ? p.variacoes.find(v => v.id === vid)?.nome : '';
    if (!window.confirm(`Resgatar "${p.nome}${vNome ? ` (${vNome})` : ''}" por ${p.pontos} pontos?`)) return;
    API.post('/pontos/resgatar', { produto_id: p.id, variacao_id: vid })
      .then(r => { setMsg(`✅ Resgate solicitado! Saldo: ${r.data.saldo} pts.`); carregar(); setTimeout(() => setMsg(''), 4000); })
      .catch(e => { setMsg(e.response?.data?.erro || 'Erro no resgate.'); setTimeout(() => setMsg(''), 4000); });
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ ...s.card, background: 'linear-gradient(135deg,#7A5AA8,#5B3E86)', color: '#fff', flex: '1 1 200px', marginBottom: 0 }}>
          <div style={{ fontSize: 12, opacity: .85 }}>Seu saldo</div>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{saldo ?? '—'} <span style={{ fontSize: 15, fontWeight: 500 }}>pts</span></div>
          <button onClick={() => window.dispatchEvent(new CustomEvent('mutti-nav', { detail: 'pedemeia' }))} style={{ marginTop: 8, fontSize: 12, padding: '6px 10px', background: 'rgba(255,255,255,.2)', color: '#fff', border: '1px solid rgba(255,255,255,.5)', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>🐷 Trocar por dinheiro (Pé de Meia)</button>
        </div>
        <div style={{ ...s.card, flex: '2 1 320px', marginBottom: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Como ganhar pontos</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {REGRA.map(([l, p]) => <span key={l} style={s.regra}>{l} <b>+{p}</b></span>)}
          </div>
        </div>
      </div>
      {msg && <div style={{ fontSize: 13, marginBottom: 10, fontWeight: 600, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D' }}>{msg}</div>}

      {itens.length === 0 && <div style={s.card}>Ainda não há brindes na loja de pontos. Volte em breve! 🎁</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
        {itens.map(p => (
          <div key={p.id} style={{ ...s.card, marginBottom: 0, display: 'flex', flexDirection: 'column', textAlign: 'center', opacity: p.resgatavel ? 1 : .6 }}>
            {(typeof p.imagem === 'string' && (p.imagem.startsWith('data:') || p.imagem.startsWith('http')))
              ? <img src={p.imagem} alt="" style={{ width: '100%', height: 82, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
              : <div style={{ height: 82, borderRadius: 8, background: '#F6F2FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, marginBottom: 8 }}>{p.imagem || (p.categoria === 'fardamento' ? '👕' : '🎁')}</div>}
            <div style={{ fontSize: 13, fontWeight: 600, minHeight: 34 }}>{p.nome}</div>
            {p.variacoes && p.variacoes.length > 0 && (
              <select value={sel[p.id] || p.variacoes[0].id} onChange={e => setSel({ ...sel, [p.id]: e.target.value })} style={{ ...s.inp, fontSize: 12, padding: '5px 7px', marginBottom: 6 }}>
                {p.variacoes.map(v => <option key={v.id} value={v.id}>{v.nome} ({v.estoque})</option>)}
              </select>
            )}
            <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>{p.estoque} disponível(is)</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#7A5AA8', marginBottom: 8 }}>🏅 {p.pontos} pts</div>
            <button onClick={() => resgatar(p)} disabled={!p.resgatavel} style={{ ...s.btn, marginTop: 'auto', background: p.resgatavel ? '#7A5AA8' : '#ccc', cursor: p.resgatavel ? 'pointer' : 'not-allowed' }}>
              {p.resgatavel ? 'Resgatar' : 'Pontos insuficientes'}
            </button>
          </div>
        ))}
      </div>

      {meus.length > 0 && (
        <div style={{ ...s.card, marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Meus resgates</div>
          {meus.map(r => {
            const st = RST[r.status] || RST.solicitado;
            return (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '6px 0', borderTop: '1px solid #f4f4f4' }}>
                <span>🎁 {r.produto_nome} · <span style={{ color: '#7A5AA8' }}>{r.pontos} pts</span> · {dt(r.criado_em)}</span>
                <span style={{ ...s.badge, color: st.c, background: st.bg }}>{st.l}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CFG_LABELS = {
  super_meta_pontos: ['🚀 Super meta superada (+10%)', 'automático ao fechar o mês'],
  produtividade_pontos: ['📊 Por indicador atingido (gerência)', 'automático por indicador do mês'],
  caixa_zerado_pontos: ['🏦 Operador zerou o caixa', 'automático'],
  caixa_diferenca_pontos: ['🏦 Diferença de caixa < R$10 no mês', 'automático'],
  cmv_pontos: ['📉 CMV abaixo do limite → ganha estes pontos', 'quando o CMV do colaborador/loja fica abaixo do % definido abaixo (automático)'],
  cmv_max: ['📉 Limite de CMV (%) para pontuar', 'CMV abaixo deste % faz o colaborador ganhar os pontos acima (ex.: 65%)'],
  satisfacao_pontos: ['⭐ Avaliação coletada do cliente', 'por avaliação validada (incentiva cobrar)'],
  post_social_pontos: ['📱 Post social #EuSouGrupoMutti', 'ao aprovar a tarefa do print'],
  repost_pontos: ['🔁 Repost de perfil oficial', 'ao aprovar a tarefa do print'],
};
function Config({ API }) {
  const [cfg, setCfg] = useState(null);
  const [msg, setMsg] = useState('');
  const [recalc, setRecalc] = useState('');
  useEffect(() => { API.get('/pontos/config').then(r => setCfg(r.data.config)).catch(() => setCfg(false)); }, [API]);
  if (cfg === null) return <div style={s.card}>Carregando…</div>;
  if (cfg === false) return <div style={s.card}>Sem acesso.</div>;
  const salvar = () => API.put('/pontos/config', cfg).then(() => { setMsg('✅ Config salva!'); setTimeout(() => setMsg(''), 3000); }).catch(e => setMsg(e.response?.data?.erro || 'Erro'));
  const recalcular = () => { setRecalc('Recalculando…'); API.post('/pontos/recalcular').then(r => setRecalc(`✅ ${r.data.lancados} pontuação(ões) lançada(s) no mês.`)).catch(e => setRecalc(e.response?.data?.erro || 'Erro')); };
  return (
    <div style={{ ...s.card, maxWidth: 520 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Pontos por regra (#EuSouGrupoMutti)</div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>Defina quantos pontos cada conquista vale. Vale para os lançamentos automáticos e para os presets manuais.</div>
      {Object.keys(CFG_LABELS).map(k => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #f4f4f4' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{CFG_LABELS[k][0]}</div>
            <div style={{ fontSize: 10.5, color: '#aaa' }}>{CFG_LABELS[k][1]}</div>
          </div>
          <input type="number" value={cfg[k] ?? ''} onChange={e => setCfg({ ...cfg, [k]: e.target.value })} style={{ ...s.inp, width: 80 }} />
          <span style={{ fontSize: 11, color: '#999' }}>{k === 'cmv_max' ? '%' : 'pts'}</span>
        </div>
      ))}
      {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D' }}>{msg}</div>}
      <button onClick={salvar} style={{ ...s.btn, marginTop: 10 }}>Salvar config</button>
      <div style={{ borderTop: '1px solid #eee', marginTop: 14, paddingTop: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Recalcular pontos automáticos do mês</div>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>Lê vendas (super meta), indicadores e caixa e lança os pontos que faltam (não duplica).</div>
        <button onClick={recalcular} style={{ ...s.btn, background: '#185FA5' }}>Recalcular agora</button>
        {recalc && <div style={{ fontSize: 12, marginTop: 8, color: recalc.startsWith('✅') ? '#3B6D11' : '#666' }}>{recalc}</div>}
      </div>
    </div>
  );
}

const REDES = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['linkedin', 'LinkedIn'], ['facebook', 'Facebook'], ['x', 'X']];
const PST = { pendente: { l: 'Em análise', c: '#8A6D1D', bg: '#FBF3DA' }, aprovado: { l: 'Aprovado', c: '#3B6D11', bg: '#E7F1DC' }, rejeitado: { l: 'Rejeitado', c: '#993C1D', bg: '#F5E2DB' } };
const lerImg = file => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });

function PostSocial({ API, usuario }) {
  const aprova = ['Marketing', 'Gestor Geral', 'Diretor Geral', 'RH', 'Controladoria'].includes(usuario.funcao);
  const [form, setForm] = useState({ tipo: 'autoral', rede: 'instagram', link: '', imagem: null });
  const [meus, setMeus] = useState([]);
  const [pend, setPend] = useState([]);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => {
    API.get('/pontos/post-social/meus').then(r => setMeus(r.data.posts || [])).catch(() => {});
    if (aprova) API.get('/pontos/post-social/pendentes').then(r => setPend(r.data.posts || [])).catch(() => {});
  }, [API, aprova]);
  useEffect(() => { carregar(); }, [carregar]);

  const enviar = () => {
    if (!form.imagem) return setMsg('Anexe o print da publicação.');
    API.post('/pontos/post-social', form).then(() => { setMsg('✅ Enviado! Aguarde a aprovação.'); setForm({ tipo: 'autoral', rede: 'instagram', link: '', imagem: null }); carregar(); setTimeout(() => setMsg(''), 4000); })
      .catch(e => setMsg(e.response?.data?.erro || 'Erro ao enviar.'));
  };
  const decidir = (id, aprovado) => {
    const motivo = aprovado ? null : (window.prompt('Motivo da rejeição (opcional):') || '');
    API.post(`/pontos/post-social/${id}/decidir`, { aprovado, motivo }).then(carregar);
  };

  return (
    <div>
      <div style={{ ...s.card, maxWidth: 460 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Enviar post social #EuSouGrupoMutti</div>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>Publique marcando a #EuSouGrupoMutti e o perfil oficial, anexe o print. Aprovado, os pontos caem (autoral 15 · repost 5). Máx. 2/mês.</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {[['autoral', '✍️ Post autoral'], ['repost', '🔁 Repost oficial']].map(([v, l]) =>
            <button key={v} onClick={() => setForm({ ...form, tipo: v })} style={{ ...s.chipS, ...(form.tipo === v ? s.chipOn : {}) }}>{l}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <select value={form.rede} onChange={e => setForm({ ...form, rede: e.target.value })} style={s.inp}>{REDES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <input value={form.link} onChange={e => setForm({ ...form, link: e.target.value })} placeholder="Link (opcional)" style={{ ...s.inp, flex: 1, minWidth: 140 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <label style={{ ...s.chipS, cursor: 'pointer' }}>📷 Anexar print<input type="file" accept="image/*" onChange={async e => { const f = e.target.files[0]; if (f) setForm({ ...form, imagem: await lerImg(f) }); }} style={{ display: 'none' }} /></label>
          {form.imagem && <img src={form.imagem} alt="" style={{ height: 44, borderRadius: 6 }} />}
        </div>
        {msg && <div style={{ fontSize: 12, marginBottom: 8, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D' }}>{msg}</div>}
        <button onClick={enviar} style={s.btn}>Enviar para aprovação</button>
      </div>

      {meus.length > 0 && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Meus envios</div>
          {meus.map(m => { const st = PST[m.status] || PST.pendente; return (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '6px 0', borderTop: '1px solid #f4f4f4' }}>
              <span>{m.tipo === 'repost' ? '🔁 Repost' : '✍️ Autoral'}{m.rede ? ` · ${m.rede}` : ''} <span style={{ color: '#aaa' }}>· {dt(m.criado_em)}</span>{m.motivo_rejeicao ? <span style={{ color: '#993C1D' }}> · {m.motivo_rejeicao}</span> : ''}</span>
              <span style={{ ...s.badge, color: st.c, background: st.bg }}>{st.l}</span>
            </div>
          ); })}
        </div>
      )}

      {aprova && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📥 Aprovações pendentes ({pend.length})</div>
          {pend.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nada para aprovar. 🎉</div>}
          {pend.map(p => (
            <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #f4f4f4', flexWrap: 'wrap' }}>
              {p.imagem && <img src={p.imagem} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 8 }} />}
              <div style={{ flex: 1, minWidth: 160, fontSize: 12 }}>
                <div style={{ fontWeight: 600 }}>{p.colaborador_nome}{p.loja ? <span style={{ color: '#999', fontWeight: 400 }}> · {p.loja}</span> : ''}</div>
                <div style={{ color: '#666' }}>{p.tipo === 'repost' ? '🔁 Repost' : '✍️ Autoral'}{p.rede ? ` · ${p.rede}` : ''} · {dt(p.criado_em)}{p.link ? <> · <a href={p.link} target="_blank" rel="noreferrer">link</a></> : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => decidir(p.id, true)} style={sBtn('#3B6D11')}>Aprovar</button>
                <button onClick={() => decidir(p.id, false)} style={sBtn('#eee', '#993C1D')}>Rejeitar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Fila({ API }) {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState('solicitado');
  const carregar = useCallback(() => API.get('/pontos/resgates', { params: f ? { status: f } : {} }).then(r => setRows(r.data.resgates || [])).catch(() => setRows([])), [API, f]);
  useEffect(() => { carregar(); }, [carregar]);
  const prox = { solicitado: 'separado', separado: 'entregue' };
  const mudar = (id, status) => API.patch(`/pontos/resgates/${id}`, { status }).then(carregar);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {Object.entries(RST).map(([k, v]) => <button key={k} onClick={() => setF(k)} style={{ ...s.chipS, ...(f === k ? s.chipOn : {}) }}>{v.l}</button>)}
      </div>
      {rows.length === 0 && <div style={s.card}>Nenhum resgate {RST[f]?.l.toLowerCase()}.</div>}
      {rows.map(r => {
        const st = RST[r.status] || RST.solicitado;
        return (
          <div key={r.id} style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>🎁 {r.produto_nome} <span style={{ color: '#7A5AA8', fontWeight: 700 }}>· {r.pontos} pts</span></div>
              <span style={{ ...s.badge, color: st.c, background: st.bg }}>{st.l}</span>
            </div>
            <div style={{ fontSize: 12, color: '#666', margin: '4px 0' }}>{r.colaborador_nome} · {r.loja_nome || '—'} · {dt(r.criado_em)}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {prox[r.status] && <button onClick={() => mudar(r.id, prox[r.status])} style={sBtn('#7A5AA8')}>→ {RST[prox[r.status]].l}</button>}
              {r.status !== 'cancelado' && r.status !== 'entregue' && <button onClick={() => mudar(r.id, 'cancelado')} style={sBtn('#eee', '#993C1D')}>Cancelar (devolve pontos)</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const sBtn = (bg, cor = '#fff') => ({ fontSize: 12, padding: '6px 12px', background: bg, color: cor, border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 });
const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 12 },
  chip: { fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipS: { fontSize: 12, padding: '5px 10px', borderRadius: 16, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  badge: { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 },
  regra: { fontSize: 11, background: '#F6F6F8', borderRadius: 16, padding: '4px 10px', color: '#555' },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  btn: { fontSize: 13, padding: '8px 14px', background: '#7A5AA8', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
};
