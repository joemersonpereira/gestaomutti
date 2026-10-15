import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const TIPO = { vale_pontos: '🏅 Vale-pontos', brinde: '🎁 Brinde', day_off: '🌴 Day off', vale_compras: '🛍️ Vale-compras', outro: '🎗️ Outro' };
const ST = {
  a_receber: { l: 'A receber', c: '#8A6D1D', bg: '#FBF3DA' },
  entregue: { l: 'Entregue', c: '#185FA5', bg: '#E4EEF8' },
  usado: { l: 'Usado', c: '#3B6D11', bg: '#E7F1DC' },
  cancelado: { l: 'Cancelado', c: '#993C1D', bg: '#F5E2DB' },
};
const MOTIVO = { aniversario: '🎂 Aniversário', anos_casa: '🥂 Anos de Mutti', manual: '✍️ Manual' };
const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';

export default function Beneficios() {
  const { API } = useAuth();
  const [aba, setAba] = useState('painel');
  return (
    <div style={s.wrap}>
      <Banner emoji="🎁" titulo="Benefícios" cor="verde" sub="Controle dos benefícios concedidos: vale-compras e day off de aniversário, brinde dos anos de Mutti e concessões manuais." />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['painel', '📊 Painel'], ['conceder', '➕ Conceder']].map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {aba === 'painel' && <Painel API={API} />}
      {aba === 'conceder' && <Conceder API={API} />}
    </div>
  );
}

function Painel({ API }) {
  const [resumo, setResumo] = useState(null);
  const [lista, setLista] = useState([]);
  const [f, setF] = useState({ status: '', tipo: '', q: '' });
  const [msg, setMsg] = useState('');

  const carregarResumo = useCallback(() => API.get('/beneficios/resumo').then(r => setResumo(r.data)).catch(() => {}), [API]);
  const carregarLista = useCallback(() => {
    const params = {}; if (f.status) params.status = f.status; if (f.tipo) params.tipo = f.tipo; if (f.q) params.q = f.q;
    API.get('/beneficios', { params }).then(r => setLista(r.data.beneficios || [])).catch(() => setLista([]));
  }, [API, f]);
  useEffect(() => { carregarResumo(); }, [carregarResumo]);
  useEffect(() => { const t = setTimeout(carregarLista, 250); return () => clearTimeout(t); }, [carregarLista]);

  const mudar = (id, status) => API.patch(`/beneficios/${id}`, { status }).then(() => { setMsg(''); carregarLista(); carregarResumo(); }).catch(e => setMsg(e.response?.data?.erro || 'Erro'));

  const aReceber = resumo?.a_receber || { qtd: 0, valor: 0 };
  const valeAberto = resumo?.vale_compras_em_aberto || 0;
  const tot = resumo?.por_status || [];
  const entregues = tot.find(x => x.status === 'entregue')?.qtd || 0;
  const usados = tot.find(x => x.status === 'usado')?.qtd || 0;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Kpi t="A receber" v={aReceber.qtd} sub={`${brl(aReceber.valor)} em vales`} cor="#8A6D1D" bg="#FBF3DA" />
        <Kpi t="Vale-compras em aberto" v={brl(valeAberto)} sub="a receber + entregue" cor="#185FA5" bg="#E4EEF8" />
        <Kpi t="Entregues" v={entregues} sub="aguardando uso" cor="#185FA5" bg="#EAF1F8" />
        <Kpi t="Usados" v={usados} sub="concluídos" cor="#3B6D11" bg="#E7F1DC" />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <input placeholder="🔎 Buscar colaborador" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} style={{ ...s.inp, minWidth: 180 }} />
        <select value={f.status} onChange={e => setF({ ...f, status: e.target.value })} style={s.inp}>
          <option value="">Todos os status</option>
          {Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
        </select>
        <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} style={s.inp}>
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {msg && <div style={{ color: '#993C1D', fontSize: 12, marginBottom: 8 }}>{msg}</div>}

      {lista.length === 0 && <div style={{ ...s.card, color: '#999', textAlign: 'center' }}>Nenhum benefício encontrado.</div>}
      {lista.map(b => {
        const st = ST[b.status] || ST.a_receber;
        return (
          <div key={b.id} style={s.row}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{b.colaborador_nome || '—'} {b.loja && <span style={{ color: '#999', fontWeight: 400, fontSize: 12 }}>· {b.loja}</span>}</div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                {TIPO[b.tipo] || b.tipo}{b.produto_nome ? ` · ${b.produto_nome}` : ''}{b.valor > 0 ? ` · ${brl(b.valor)}` : ''} · {MOTIVO[b.motivo] || b.motivo || '—'}
                {b.competencia ? ` · ${b.competencia}` : ''} · concedido {dt(b.concedido_em)}
                {b.folga_id ? ' · 🌴 folga marcada' : ''}{b.obs ? ` · ${b.obs}` : ''}
              </div>
            </div>
            <span style={{ ...s.badge, color: st.c, background: st.bg }}>{st.l}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {b.status === 'a_receber' && <button onClick={() => mudar(b.id, 'entregue')} style={s.miniAzul}>Entregar</button>}
              {(b.status === 'a_receber' || b.status === 'entregue') && <button onClick={() => mudar(b.id, 'usado')} style={s.miniVerde}>Dar baixa</button>}
              {b.status !== 'cancelado' && b.status !== 'usado' && <button onClick={() => mudar(b.id, 'cancelado')} style={s.miniCinza}>✕</button>}
              {(b.status === 'cancelado' || b.status === 'usado') && <button onClick={() => mudar(b.id, 'a_receber')} style={s.miniCinza}>↺</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Conceder({ API }) {
  const [colabs, setColabs] = useState([]);
  const [brindes, setBrindes] = useState([]);
  const [form, setForm] = useState({ colaborador_id: '', tipo: 'vale_compras', valor: '', obs: '', produto_id: '', variacao_id: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => {
    API.get('/colaboradores').then(r => setColabs(r.data.colaboradores || r.data || [])).catch(() => {});
    API.get('/beneficios/brindes').then(r => setBrindes(r.data.brindes || [])).catch(() => {});
  }, [API]);

  const brindeSel = brindes.find(b => b.id === form.produto_id);
  const salvar = () => {
    if (!form.colaborador_id) return setMsg('Escolha o colaborador.');
    if (form.tipo === 'brinde' && brindeSel && brindeSel.variacoes.length && !form.variacao_id) return setMsg('Escolha a variação do brinde.');
    API.post('/beneficios', { ...form, valor: Number(form.valor) || 0 })
      .then(() => { setMsg('✅ Benefício concedido!'); setForm({ colaborador_id: '', tipo: 'vale_compras', valor: '', obs: '', produto_id: '', variacao_id: '' }); })
      .catch(e => setMsg(e.response?.data?.erro || 'Erro ao conceder.'));
  };

  return (
    <div style={{ ...s.card, maxWidth: 460 }}>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>Conceder benefício manual</div>
      <label style={s.lbl}>Colaborador</label>
      <select value={form.colaborador_id} onChange={e => setForm({ ...form, colaborador_id: e.target.value })} style={{ ...s.inp, width: '100%', marginBottom: 10 }}>
        <option value="">Selecione…</option>
        {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <label style={s.lbl}>Tipo</label>
      <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} style={{ ...s.inp, width: '100%', marginBottom: 10 }}>
        {Object.entries(TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {form.tipo === 'vale_compras' && (
        <>
          <label style={s.lbl}>Valor (R$)</label>
          <input type="number" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} placeholder="100,00" style={{ ...s.inp, width: '100%', marginBottom: 10 }} />
        </>
      )}
      {form.tipo === 'vale_pontos' && (
        <>
          <label style={s.lbl}>Quantos pontos</label>
          <input type="number" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} placeholder="ex.: 100" style={{ ...s.inp, width: '100%', marginBottom: 4 }} />
          <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>Os pontos caem na hora na loja de pontos do colaborador.</div>
        </>
      )}
      {form.tipo === 'brinde' && (
        <>
          <label style={s.lbl}>Brinde do estoque</label>
          <select value={form.produto_id} onChange={e => setForm({ ...form, produto_id: e.target.value, variacao_id: '' })} style={{ ...s.inp, width: '100%', marginBottom: 10 }}>
            <option value="">Selecione o brinde…</option>
            {brindes.map(b => <option key={b.id} value={b.id} disabled={!b.tem_variacoes && b.estoque <= 0}>{b.nome}{!b.tem_variacoes ? ` (${b.estoque} em estoque)` : ''}</option>)}
          </select>
          {brindeSel && typeof brindeSel.imagem === 'string' && brindeSel.imagem.startsWith('data:') && (
            <img src={brindeSel.imagem} alt="" style={{ height: 80, borderRadius: 8, marginBottom: 10, display: 'block' }} />
          )}
          {brindeSel && brindeSel.variacoes.length > 0 && (
            <select value={form.variacao_id} onChange={e => setForm({ ...form, variacao_id: e.target.value })} style={{ ...s.inp, width: '100%', marginBottom: 10 }}>
              <option value="">Variação…</option>
              {brindeSel.variacoes.map(v => <option key={v.id} value={v.id} disabled={v.estoque <= 0}>{v.nome} ({v.estoque})</option>)}
            </select>
          )}
          <div style={{ fontSize: 11, color: '#999', marginBottom: 10, marginTop: -4 }}>O estoque baixa quando o benefício for marcado como entregue.</div>
        </>
      )}
      <label style={s.lbl}>Observação</label>
      <input value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} placeholder="Ex.: campanha, reconhecimento…" style={{ ...s.inp, width: '100%', marginBottom: 12 }} />
      {msg && <div style={{ fontSize: 12, marginBottom: 8, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D' }}>{msg}</div>}
      <button onClick={salvar} style={s.btn}>Conceder</button>
    </div>
  );
}

function Kpi({ t, v, sub, cor, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: cor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .3 }}>{t}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor, marginTop: 2 }}>{v}</div>
      <div style={{ fontSize: 11, color: cor, opacity: .8 }}>{sub}</div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 12 },
  row: { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '10px 14px', marginBottom: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  chip: { fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  badge: { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  lbl: { fontSize: 12, color: '#666', display: 'block', marginBottom: 4 },
  btn: { fontSize: 13, padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  miniAzul: { fontSize: 11, padding: '5px 9px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  miniVerde: { fontSize: 11, padding: '5px 9px', background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  miniCinza: { fontSize: 11, padding: '5px 9px', background: '#f3f3f3', color: '#666', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer' },
};
