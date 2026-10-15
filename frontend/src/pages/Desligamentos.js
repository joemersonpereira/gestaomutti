import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const TIPO_L = { voluntario: 'Voluntário', involuntario: 'Involuntário', fim_contrato: 'Fim de contrato', outro: 'Outro' };
const MOTIVO_L = { melhor_oportunidade: 'Melhor oportunidade', salario: 'Salário/benefícios', lideranca: 'Liderança', ambiente: 'Ambiente/clima', crescimento: 'Falta de crescimento', pessoal_familia: 'Pessoal/família', mudanca: 'Mudança de cidade', insatisfacao: 'Insatisfação geral', saude: 'Saúde', outro: 'Outro', nao_informado: 'Não informado' };
const DIM_L = { s_geral: 'Satisfação geral', s_lideranca: 'Liderança', s_ambiente: 'Ambiente', s_remuneracao: 'Remuneração', s_crescimento: 'Crescimento', s_reconhecimento: 'Reconhecimento', s_carga: 'Carga de trabalho', s_ferramentas: 'Ferramentas/condições' };
const dt = x => x ? String(x).slice(0, 10).split('-').reverse().join('/') : '';

export default function Desligamentos() {
  const { API } = useAuth();
  const [aba, setAba] = useState('lista');
  return (
    <div style={s.wrap}>
      <Banner emoji="🚪" titulo="Desligamentos" cor="vermelho" sub="Registre o desligamento, envie a pesquisa e acompanhe os indicadores de saída." />
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[['lista', '📋 Registrar & lista'], ['analytics', '📊 Indicadores']].map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {aba === 'lista' && <Lista API={API} />}
      {aba === 'analytics' && <Analytics API={API} />}
    </div>
  );
}

function Lista({ API }) {
  const [colabs, setColabs] = useState([]);
  const [desl, setDesl] = useState([]);
  const [form, setForm] = useState({ colaborador_id: '', tipo: 'voluntario', data_desligamento: '', motivo_rh: '', obs_rh: '' });
  const [novoLink, setNovoLink] = useState(null);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => {
    API.get('/colaboradores').then(r => setColabs((r.data.colaboradores || []).filter(c => c.ativo !== 0))).catch(() => {});
    API.get('/desligamentos').then(r => setDesl(r.data.desligamentos || [])).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  const registrar = () => {
    if (!form.colaborador_id) return setMsg('Escolha o colaborador.');
    if (!window.confirm('Registrar o desligamento? O colaborador será inativado.')) return;
    API.post('/desligamentos', form).then(r => { setNovoLink(window.location.origin + r.data.link); setForm({ colaborador_id: '', tipo: 'voluntario', data_desligamento: '', motivo_rh: '', obs_rh: '' }); carregar(); })
      .catch(e => setMsg(e.response?.data?.erro || 'Erro.'));
  };
  const linkDe = d => window.location.origin + `/pesquisa-desligamento?t=${d.token}`;
  const copiar = txt => { navigator.clipboard?.writeText(txt); setMsg('✅ Link copiado!'); setTimeout(() => setMsg(''), 2500); };

  return (
    <div>
      <div style={{ ...s.card, maxWidth: 520 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Registrar desligamento</div>
        <select value={form.colaborador_id} onChange={e => setForm({ ...form, colaborador_id: e.target.value })} style={{ ...s.inp, width: '100%', marginBottom: 8 }}>
          <option value="">Colaborador…</option>
          {colabs.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.funcao} · {c.loja}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} style={s.inp}>{Object.entries(TIPO_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: '#999' }}>Data do desligamento</label><input type="date" value={form.data_desligamento} onChange={e => setForm({ ...form, data_desligamento: e.target.value })} style={{ ...s.inp, width: '100%', boxSizing: 'border-box' }} /></div>
        </div>
        <input value={form.motivo_rh} onChange={e => setForm({ ...form, motivo_rh: e.target.value })} placeholder="Motivo (registro do RH)" style={{ ...s.inp, width: '100%', boxSizing: 'border-box', marginBottom: 8 }} />
        <textarea value={form.obs_rh} onChange={e => setForm({ ...form, obs_rh: e.target.value })} placeholder="Observações (opcional)" rows={2} style={{ ...s.inp, width: '100%', boxSizing: 'border-box', marginBottom: 8, resize: 'vertical' }} />
        {msg && <div style={{ fontSize: 12, marginBottom: 8, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D' }}>{msg}</div>}
        <button onClick={registrar} style={s.btn}>Registrar e gerar pesquisa</button>
        {novoLink && (
          <div style={{ marginTop: 10, background: '#EAF3FB', borderRadius: 8, padding: 10, fontSize: 12 }}>
            🔗 Envie este link da pesquisa para o colaborador:
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}><input readOnly value={novoLink} style={{ ...s.inp, flex: 1 }} /><button onClick={() => copiar(novoLink)} style={s.btnMini}>Copiar</button></div>
          </div>
        )}
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Desligamentos ({desl.length})</div>
        {desl.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhum desligamento registrado.</div>}
        {desl.map(d => (
          <div key={d.id} style={{ padding: '8px 0', borderTop: '1px solid #f4f4f4' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{d.colaborador_nome} <span style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>· {d.funcao || ''} · {d.loja || ''}</span></div>
              <span style={{ ...s.badge, ...(d.pesquisa_status === 'respondida' ? { color: '#3B6D11', background: '#E7F1DC' } : { color: '#8A6D1D', background: '#FBF3DA' }) }}>{d.pesquisa_status === 'respondida' ? '✅ pesquisa respondida' : '⏳ aguardando pesquisa'}</span>
            </div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{TIPO_L[d.tipo] || d.tipo}{d.data_desligamento ? ` · ${dt(d.data_desligamento)}` : ''}{d.motivo_rh ? ` · ${d.motivo_rh}` : ''}{d.motivo_saida ? ` · disse: ${MOTIVO_L[d.motivo_saida] || d.motivo_saida}` : ''}</div>
            {d.pesquisa_status !== 'respondida' && <button onClick={() => copiar(linkDe(d))} style={{ ...s.linkMini, marginTop: 2 }}>🔗 copiar link da pesquisa</button>}
            {d.comentario && <div style={{ fontSize: 12, color: '#555', fontStyle: 'italic', marginTop: 3 }}>“{d.comentario}”</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Analytics({ API }) {
  const [d, setD] = useState(null);
  useEffect(() => { API.get('/desligamentos/analytics').then(r => setD(r.data)).catch(() => setD(false)); }, [API]);
  if (d === null) return <div style={s.card}>Carregando…</div>;
  if (d === false) return <div style={s.card}>Sem dados.</div>;
  const enpsCor = d.enps == null ? '#999' : d.enps >= 50 ? '#3B6D11' : d.enps >= 0 ? '#BA7517' : '#993C1D';
  const barra = (v) => v == null ? '—' : v.toFixed(1);
  const Bloco = ({ t, children }) => <div style={s.card}><div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 8 }}>{t}</div>{children}</div>;
  const dist = (obj, labels) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  const totalResp = d.respondidas || 0;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 12 }}>
        <Kpi t="Desligamentos" v={d.total} sub={`${d.respondidas} responderam`} cor="#185FA5" bg="#EAF3FB" />
        <Kpi t="eNPS de saída" v={d.enps == null ? '—' : d.enps} sub="recomendaria a empresa" cor={enpsCor} bg="#F6F2FB" />
        <Kpi t="Pendentes" v={d.pendentes} sub="pesquisa não respondida" cor="#8A6D1D" bg="#FBF3DA" />
      </div>

      <Bloco t="Médias por dimensão (1 a 5)">
        {Object.entries(d.medias).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ width: 150, fontSize: 12, color: '#444' }}>{DIM_L[k] || k}</span>
            <div style={{ flex: 1, height: 8, background: '#eee', borderRadius: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: `${((v || 0) / 5) * 100}%`, background: v == null ? '#ccc' : v >= 4 ? '#3B6D11' : v >= 3 ? '#BA7517' : '#993C1D' }} /></div>
            <span style={{ width: 30, fontSize: 13, fontWeight: 700, textAlign: 'right', color: v == null ? '#999' : '#333' }}>{barra(v)}</span>
          </div>
        ))}
        {totalResp === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhuma pesquisa respondida ainda.</div>}
      </Bloco>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}><Bloco t="Motivos da saída">
          {dist(d.por_motivo).length === 0 && <div style={{ fontSize: 12, color: '#999' }}>—</div>}
          {dist(d.por_motivo).map(([k, n]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}><span>{MOTIVO_L[k] || k}</span><strong>{n}</strong></div>)}
        </Bloco></div>
        <div style={{ flex: 1, minWidth: 240 }}><Bloco t="Tipo de desligamento">
          {dist(d.por_tipo).map(([k, n]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}><span>{TIPO_L[k] || k}</span><strong>{n}</strong></div>)}
        </Bloco></div>
        <div style={{ flex: 1, minWidth: 240 }}><Bloco t="Voltaria a trabalhar?">
          {dist(d.voltaria).length === 0 && <div style={{ fontSize: 12, color: '#999' }}>—</div>}
          {dist(d.voltaria).map(([k, n]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}><span>{k === 'sim' ? '👍 Sim' : k === 'nao' ? '👎 Não' : '🤔 Talvez'}</span><strong>{n}</strong></div>)}
        </Bloco></div>
      </div>
    </div>
  );
}

function Kpi({ t, v, sub, cor, bg }) {
  return <div style={{ background: bg, borderRadius: 12, padding: '12px 14px' }}>
    <div style={{ fontSize: 11, color: cor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .3 }}>{t}</div>
    <div style={{ fontSize: 24, fontWeight: 800, color: cor, marginTop: 2 }}>{v}</div>
    <div style={{ fontSize: 10.5, color: cor, opacity: .8 }}>{sub}</div>
  </div>;
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 12 },
  chip: { fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  badge: { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  btn: { fontSize: 13, padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 12, padding: '6px 12px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  linkMini: { background: 'none', border: 'none', color: '#185FA5', fontSize: 11.5, cursor: 'pointer', padding: 0 },
};
