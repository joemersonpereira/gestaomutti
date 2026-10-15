import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const ITENS_PADRAO = [
  'Fachada e vitrine', 'Organização das gôndolas', 'Validade dos produtos', 'Limpeza geral',
  'Atendimento ao cliente', 'Uniforme e crachá', 'Precificação correta', 'Estoque organizado',
];

export default function Auditoria() {
  const { API, usuario } = useAuth();
  const ehSup = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const [lojas, setLojas] = useState([]);
  const [auds, setAuds] = useState([]);
  const [form, setForm] = useState({ loja_id: '', observacoes: '' });
  const [itens, setItens] = useState([]);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => { API.get('/auditoria').then(r => setAuds(r.data.auditorias)); }, [API]);
  useEffect(() => {
    carregar();
    if (ehSup) API.get('/config/lojas').then(r => setLojas(r.data.lojas)).catch(() => {});
    API.get('/auditoria/modelo')
      .then(r => {
        const ativos = (r.data.itens || []).filter(i => i.ativo).map(i => ({ texto: i.texto, resultado: 'bom' }));
        setItens(ativos.length ? ativos : ITENS_PADRAO.map(t => ({ texto: t, resultado: 'bom' })));
      })
      .catch(() => setItens(ITENS_PADRAO.map(t => ({ texto: t, resultado: 'bom' }))));
  }, [API, carregar, ehSup]);

  async function salvar() {
    if (!form.loja_id) { setMsg('Selecione a loja.'); return; }
    if (!itens.length) { setMsg('Nenhum item de auditoria configurado.'); return; }
    const r = await API.post('/auditoria', { ...form, data: new Date().toISOString().slice(0, 10), itens: itens.map((i, x) => ({ ...i, peso: Math.round(100 / itens.length) })) });
    setMsg(`✅ Registrada · nota ${r.data.nota}` + (r.data.tarefa_gerada ? ' · tarefa gerada' : ''));
    carregar();
  }

  return (
    <div style={s.wrap}>
      <Banner emoji="🔎" titulo="Auditoria" cor="ciano" sub="Visitas do supervisor" />
      {msg && <div style={{ ...s.card, color: '#3B6D11' }}>{msg}</div>}

      {ehSup && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Nova auditoria</div>
          <select style={s.input} value={form.loja_id} onChange={e => setForm({ ...form, loja_id: e.target.value })}>
            <option value="">Selecione a loja…</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          {itens.map((i, x) => (
            <div key={x} style={s.itemRow}>
              <span style={{ flex: 1, fontSize: 12 }}>{i.texto}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['bom', 'Bom', '#3B6D11', '#EAF3DE'], ['regular', 'Regular', '#854F0B', '#FAEEDA'], ['ruim', 'Ruim', '#993C1D', '#FCEBEB']].map(([v, label, cor, bg]) => (
                  <button key={v} onClick={() => setItens(itens.map((it, j) => j === x ? { ...it, resultado: v } : it))}
                    style={{ ...s.op, fontSize: 11, fontWeight: 600, color: i.resultado === v ? cor : '#999', background: i.resultado === v ? bg : 'none', borderColor: i.resultado === v ? cor : '#ddd' }}>{label}</button>
                ))}
              </div>
            </div>
          ))}
          <textarea style={s.input} placeholder="Observações" value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} />
          <button style={s.btn} onClick={salvar}>Registrar auditoria</button>
        </div>
      )}

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Histórico</div>
        {auds.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhuma auditoria.</div>}
        {auds.map(a => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
            <span>{a.loja_nome} · {a.data} · {a.supervisor_nome}</span>
            <strong style={{ color: a.nota >= 95 ? '#3B6D11' : a.nota >= 75 ? '#BA7517' : '#993C1D' }}>{a.nota}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  itemRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f5' },
  op: { fontSize: 14, padding: '3px 8px', border: '1px solid #ddd', borderRadius: 6, background: 'none', cursor: 'pointer' },
  input: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', marginBottom: 8 },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
};
