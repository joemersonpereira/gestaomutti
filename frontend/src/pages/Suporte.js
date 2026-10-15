import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner, { bannerBtn } from '../components/Banner';

const CAT_LABEL = { sistema: '💻 Sistema', erp: '🗄️ ERP', equipamento: '🖥️ Equipamento', acesso: '🔑 Acesso/Senha', duvida: '❓ Dúvida', outro: '📌 Outro' };
const PRI = { baixa: { l: 'Baixa', c: '#7A8794' }, normal: { l: 'Normal', c: '#185FA5' }, alta: { l: 'Alta', c: '#BA7517' }, urgente: { l: 'Urgente', c: '#C0392B' } };
const ST = { aberto: { l: 'Aberto', c: '#C0392B', bg: '#FCEBEB' }, andamento: { l: 'Em andamento', c: '#BA7517', bg: '#FBF0DA' }, resolvido: { l: 'Resolvido', c: '#1E874B', bg: '#EAF3E9' }, fechado: { l: 'Fechado', c: '#7A8794', bg: '#F1F3F5' } };
const dt = s => (s ? String(s).slice(0, 16).replace('T', ' ').split('-').reverse().join('/').replace(/\/(\d{2}) /, '/$1 ') : '');

export default function Suporte() {
  const { API } = useAuth();
  const [d, setD] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [form, setForm] = useState({ titulo: '', descricao: '', categoria: 'sistema', prioridade: 'normal' });
  const [abrindo, setAbrindo] = useState(false);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    API.get('/suporte', { params: { status: filtro || undefined } }).then(r => setD(r.data)).catch(() => setD({ chamados: [] }));
  }, [API, filtro]);
  useEffect(() => { carregar(); }, [carregar]);

  async function abrir(e) {
    e.preventDefault();
    if (!form.titulo.trim()) { setMsg('Dê um título ao chamado.'); return; }
    await API.post('/suporte', form);
    setForm({ titulo: '', descricao: '', categoria: 'sistema', prioridade: 'normal' });
    setAbrindo(false); setMsg(''); carregar();
  }
  async function atualizar(id, patch) { await API.patch(`/suporte/${id}`, patch); carregar(); }

  const gestor = d?.gestor;
  return (
    <div style={s.wrap}>
      <Banner emoji="🛠️" titulo="Suporte / Chamados" cor="ciano"
        sub={gestor ? 'Fila de chamados do grupo — assuma, responda e mova o status.' : 'Abra um chamado para o time de suporte: erro no sistema, acesso, equipamento ou dúvida.'}>
        <button onClick={() => setAbrindo(v => !v)} style={bannerBtn}>{abrindo ? '✕ Cancelar' : '+ Novo chamado'}</button>
      </Banner>

      {abrindo && (
        <form onSubmit={abrir} style={{ ...s.card, borderLeft: '4px solid #0E7C86' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Abrir chamado</div>
          <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Resumo do problema (ex.: não consigo emitir etiqueta)" style={s.inp} />
          <textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Detalhe o que acontece, em qual tela, mensagem de erro…" style={{ ...s.inp, minHeight: 80, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} style={{ ...s.inp, width: 'auto', flex: 1, minWidth: 150 }}>
              {Object.entries(CAT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={form.prioridade} onChange={e => setForm({ ...form, prioridade: e.target.value })} style={{ ...s.inp, width: 'auto', flex: 1, minWidth: 130 }}>
              {Object.entries(PRI).map(([v, o]) => <option key={v} value={v}>{o.l}</option>)}
            </select>
          </div>
          {msg && <div style={{ fontSize: 12, color: '#C0392B', marginBottom: 6 }}>{msg}</div>}
          <button style={s.btn}>Abrir chamado</button>
        </form>
      )}

      <div style={{ display: 'flex', gap: 6, margin: '4px 0 12px', flexWrap: 'wrap' }}>
        {[['', 'Todos'], ['aberto', 'Abertos'], ['andamento', 'Em andamento'], ['resolvido', 'Resolvidos'], ['fechado', 'Fechados']].map(([v, l]) => (
          <button key={v} onClick={() => setFiltro(v)} style={{ ...s.chip, ...(filtro === v ? s.chipOn : {}) }}>{l}</button>
        ))}
        {d && <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: '#666' }}>{d.abertos || 0} em aberto</span>}
      </div>

      {!d && <div style={s.card}>Carregando…</div>}
      {d && d.chamados.length === 0 && <div style={{ ...s.card, textAlign: 'center', color: '#999' }}>Nenhum chamado {filtro ? ST[filtro]?.l.toLowerCase() : ''} por aqui.</div>}
      {d && d.chamados.map(c => {
        const st = ST[c.status] || ST.aberto; const pr = PRI[c.prioridade] || PRI.normal;
        return (
          <div key={c.id} style={{ ...s.card, borderLeft: `4px solid ${pr.c}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{c.titulo}</div>
                <div style={{ fontSize: 11.5, color: '#999', marginTop: 2 }}>{CAT_LABEL[c.categoria] || c.categoria} · {c.aberto_nome}{c.loja_nome ? ` · ${c.loja_nome}` : ''} · {dt(c.criado_em)}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: pr.c }}>{pr.l}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.c }}>{st.l}</span>
              </div>
            </div>
            {c.descricao && <div style={{ fontSize: 13, color: '#444', marginTop: 8, whiteSpace: 'pre-wrap' }}>{c.descricao}</div>}
            {c.resposta && <div style={{ fontSize: 13, color: '#0E5C33', background: '#EAF3E9', borderRadius: 8, padding: '8px 10px', marginTop: 8 }}><b>Resposta{c.responsavel_nome ? ` · ${c.responsavel_nome}` : ''}:</b> {c.resposta}</div>}
            {gestor && <GestorControles c={c} onSalvar={atualizar} />}
          </div>
        );
      })}
    </div>
  );
}

function GestorControles({ c, onSalvar }) {
  const [resp, setResp] = useState(c.resposta || '');
  return (
    <div style={{ borderTop: '1px dashed #e2e9e3', marginTop: 10, paddingTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <textarea value={resp} onChange={e => setResp(e.target.value)} placeholder="Escreva uma resposta…" style={{ ...s.inp, marginBottom: 0, flex: 1, minWidth: 200, minHeight: 38, resize: 'vertical' }} />
      <button onClick={() => onSalvar(c.id, { resposta: resp, assumir: true, status: c.status === 'aberto' ? 'andamento' : c.status })} style={s.btnMini}>💬 Responder</button>
      <select value={c.status} onChange={e => onSalvar(c.id, { status: e.target.value, resposta: resp })} style={{ ...s.inp, width: 'auto', marginBottom: 0 }}>
        {Object.entries(ST).map(([v, o]) => <option key={v} value={v}>{o.l}</option>)}
      </select>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 820, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  inp: { width: '100%', padding: '9px 11px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, marginBottom: 8, fontFamily: 'inherit' },
  btn: { fontSize: 13, padding: '9px 16px', background: '#0E7C86', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 12, padding: '8px 12px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  chip: { fontSize: 12, padding: '6px 12px', border: '1px solid #ddd', borderRadius: 20, background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#0E7C86', color: '#fff', borderColor: '#0E7C86' },
};
