import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const STATUS_COR = { aprovado: ['#EAF3DE', '#3B6D11'], pendente: ['#FAEEDA', '#854F0B'], correcao: ['#FCEBEB', '#993C1D'] };
const hoje = new Date();

export default function Metas() {
  const { API, usuario } = useAuth();
  const ehGerente = usuario.funcao === 'Gerente';
  const [lojas, setLojas] = useState([]);
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [metas, setMetas] = useState([]);
  const [form, setForm] = useState({ loja_id: '', valor_meta: '', valor_super_meta: '' });
  const [lote, setLote] = useState(false);
  const [nomeCamp, setNomeCamp] = useState('');
  const [loteVals, setLoteVals] = useState({});
  const [msg, setMsg] = useState('');

  async function lancarLote() {
    setMsg('');
    if (!nomeCamp.trim()) { setMsg('Dê um nome à campanha (igual para todas as lojas).'); return; }
    const lojasPayload = lojas.map(l => ({ loja_id: l.id, valor_meta: Number(loteVals[l.id]?.meta) || 0, valor_super_meta: Number(loteVals[l.id]?.super) || 0 })).filter(x => x.valor_meta > 0);
    if (!lojasPayload.length) { setMsg('Preencha a meta de ao menos uma loja.'); return; }
    try {
      const r = await API.post('/metas/lote', { nome: nomeCamp.trim(), mes, ano, lojas: lojasPayload });
      setMsg('✅ ' + r.data.mensagem); setLoteVals({}); setNomeCamp(''); carregar();
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro ao lançar em lote.'); }
  }

  const carregar = useCallback(() => {
    API.get('/metas', { params: { mes, ano } }).then(r => setMetas((r.data.metas || []).filter(m => !m.colaborador_id)));
  }, [API, mes, ano]);

  useEffect(() => {
    API.get('/referencias/lojas').then(r => {
      const ls = r.data.lojas || [];
      setLojas(ls);
      if (ehGerente && usuario.loja_id) setForm(f => ({ ...f, loja_id: usuario.loja_id }));
    });
  }, [API, ehGerente, usuario.loja_id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function propor() {
    setMsg('');
    if (!form.loja_id || !form.valor_meta) { setMsg('Loja e valor da meta são obrigatórios.'); return; }
    try {
      const r = await API.post('/metas', {
        loja_id: form.loja_id, mes, ano,
        valor_meta: Number(form.valor_meta),
        valor_super_meta: form.valor_super_meta ? Number(form.valor_super_meta) : undefined,
      });
      setMsg('✅ ' + r.data.mensagem);
      setForm({ loja_id: ehGerente ? usuario.loja_id : '', valor_meta: '', valor_super_meta: '' });
      carregar();
    } catch (e) {
      setMsg(e.response?.data?.erro || 'Erro ao propor meta.');
    }
  }

  return (
    <div style={s.wrap}>
      <Banner emoji="🎯" titulo="Metas" cor="verde" />
      <div style={s.sub}>{ehGerente ? 'Proponha a meta da sua loja (vai para aprovação do Diretor)' : 'Defina e acompanhe as metas das lojas'}</div>

      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Nova meta</div>
          {!ehGerente && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setLote(false)} style={{ ...s.miniTab, ...(!lote ? s.miniTabOn : {}) }}>Uma loja</button>
              <button onClick={() => setLote(true)} style={{ ...s.miniTab, ...(lote ? s.miniTabOn : {}) }}>Todas as lojas</button>
            </div>
          )}
        </div>

        {lote && !ehGerente ? (
          <>
            <input style={s.campo} placeholder="Nome da campanha (igual para todas) *" value={nomeCamp} onChange={e => setNomeCamp(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select style={s.campo} value={mes} onChange={e => setMes(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}
              </select>
              <input style={s.campo} type="number" value={ano} onChange={e => setAno(Number(e.target.value))} />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ textAlign: 'left', color: '#666' }}>
                  <th style={{ padding: '6px 4px' }}>Loja</th><th style={{ padding: '6px 4px' }}>Meta (R$)</th><th style={{ padding: '6px 4px' }}>Super (R$)</th>
                </tr></thead>
                <tbody>
                  {lojas.map(l => (
                    <tr key={l.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '6px 4px', fontWeight: 600 }}>{l.nome}</td>
                      <td style={{ padding: '6px 4px' }}><input type="number" placeholder="—" value={loteVals[l.id]?.meta || ''} onChange={e => setLoteVals({ ...loteVals, [l.id]: { ...loteVals[l.id], meta: e.target.value } })} style={{ ...s.campo, marginBottom: 0, width: 110 }} /></td>
                      <td style={{ padding: '6px 4px' }}><input type="number" placeholder="+5%" value={loteVals[l.id]?.super || ''} onChange={e => setLoteVals({ ...loteVals, [l.id]: { ...loteVals[l.id], super: e.target.value } })} style={{ ...s.campo, marginBottom: 0, width: 110 }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', margin: '8px 0' }}>{msg}</div>}
            <button style={{ ...s.btn, marginTop: 8 }} onClick={lancarLote}>Lançar para todas as lojas preenchidas</button>
          </>
        ) : (
        <>
        <select style={s.campo} value={form.loja_id} onChange={e => setForm({ ...form, loja_id: e.target.value })} disabled={ehGerente}>
          <option value="">Loja *</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8 }}>
          <select style={s.campo} value={mes} onChange={e => setMes(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}
          </select>
          <input style={s.campo} type="number" value={ano} onChange={e => setAno(Number(e.target.value))} />
        </div>
        <input style={s.campo} type="number" placeholder="Meta (R$) *" value={form.valor_meta} onChange={e => setForm({ ...form, valor_meta: e.target.value })} />
        <input style={s.campo} type="number" placeholder="Super meta (R$) — opcional, padrão +10%" value={form.valor_super_meta} onChange={e => setForm({ ...form, valor_super_meta: e.target.value })} />
        {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginBottom: 8 }}>{msg}</div>}
        <button style={s.btn} onClick={propor}>{ehGerente ? 'Propor meta' : 'Lançar meta'}</button>
        </>
        )}
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Metas de {String(mes).padStart(2, '0')}/{ano} ({metas.length})</div>
        {metas.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhuma meta neste período.</div>}
        {metas.map(m => {
          const cor = STATUS_COR[m.status_aprovacao] || ['#f0f0f0', '#666'];
          return (
            <div key={m.id} style={s.item}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m.loja_nome}</div>
                <div style={{ fontSize: 11, color: '#999' }}>Meta R$ {Number(m.valor_meta).toLocaleString('pt-BR')} · Super R$ {Number(m.valor_super_meta).toLocaleString('pt-BR')}</div>
              </div>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: cor[0], color: cor[1], height: 'fit-content' }}>{m.status_aprovacao}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  campo: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', marginBottom: 8 },
  item: { display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid #f5f5f5' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  miniTab: { fontSize: 11, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#666' },
  miniTabOn: { background: '#185FA5', color: '#fff', borderColor: '#185FA5' },
};
