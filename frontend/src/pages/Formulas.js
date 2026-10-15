import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const dataBR = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const tel = t => (t || '').replace(/\D/g, '');
const FLUXO = { aguardando: 'chegou', chegou: 'avisado', avisado: 'entregue' };
const ST = {
  aguardando: ['⏳', 'Aguardando chegar', '#B7791F'],
  chegou: ['📦', 'Chegou na farmácia', '#2E5C9E'],
  avisado: ['📞', 'Cliente avisado', '#7A4FB0'],
  entregue: ['✅', 'Entregue', '#1E874B'],
  cancelado: ['🚫', 'Cancelado', '#999'],
};

export default function Formulas() {
  const { API, usuario } = useAuth();
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  const [dias, setDias] = useState(30);
  const [filtro, setFiltro] = useState('');
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => { API.get('/compras/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  const carregar = useCallback(() => {
    setErro(''); setD(null);
    API.get('/formulas', { params: { loja: loja || undefined, dias } }).then(r => { if (r.data.erro) setErro(r.data.erro); else setD(r.data); }).catch(e => setErro(e.response?.data?.erro || 'Falha.'));
  }, [API, loja, dias]);
  useEffect(() => { carregar(); }, [carregar]);

  const avancar = (f, novo) => API.put(`/formulas/${f.id}`, {
    status: novo, loja_id: loja || undefined, responsavel_id: usuario.id, responsavel_nome: usuario.nome,
    cliente: f.cliente, telefone: f.telefone, formula: f.formula,
  }).then(() => carregar());

  const lista = (d?.formulas || []).filter(f => !filtro || (f.statusEntrega === filtro));

  return (
    <div style={s.wrap}>
      <Banner emoji="💊" titulo="Fórmulas — controle de entrega" cor="ciano" sub="Fórmulas manipuladas pagas (crediário do ERP). Acompanhe a chegada e cobre o vendedor de ligar/entregar ao cliente." />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}><option value="">🏬 Todas as lojas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
        <select value={dias} onChange={e => setDias(Number(e.target.value))} style={s.inp}>{[7, 15, 30, 60, 90].map(x => <option key={x} value={x}>últimos {x} dias</option>)}</select>
      </div>

      {d && d.resumo && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[['', 'Todas', d.resumo.total], ['aguardando', 'Aguardando', d.resumo.aguardando], ['chegou', 'Chegaram', d.resumo.chegou], ['avisado', 'Avisados', d.resumo.avisado], ['entregue', 'Entregues', d.resumo.entregue]].map(([v, l, n]) =>
            <button key={v} onClick={() => setFiltro(v)} style={{ ...s.pill, ...(filtro === v ? { background: '#111', color: '#fff', borderColor: '#111' } : {}) }}>{l} <b>{n}</b></button>)}
          {d.resumo.atrasadas > 0 && <span style={{ ...s.pill, background: '#FBEAE7', color: '#C0392B', borderColor: '#F0D9D9' }}>⚠️ Atrasadas <b>{d.resumo.atrasadas}</b></span>}
        </div>
      )}
      {d && <div style={{ fontSize: 11.5, color: '#999', marginBottom: 8 }}>⏱️ Prazo: <b>{d.prazoDias} dias</b> após o pagamento para ficar pronta E entregue ao cliente (inclui os 2 dias de entrega).</div>}
      {erro && <div style={{ ...s.card, color: '#C0392B' }}>⚠️ {erro}</div>}
      {!d && !erro && <div style={s.card}>Carregando…</div>}
      {d && lista.length === 0 && <div style={s.card}>Nenhuma fórmula no período.</div>}

      {lista.map(f => {
        const [emoji, label, cor] = ST[f.statusEntrega] || ['•', f.statusEntrega, '#666'];
        const prox = FLUXO[f.statusEntrega];
        const prazoTxt = f.statusEntrega === 'entregue' ? null : f.atrasada ? `⚠️ atrasada há ${Math.abs(f.diasRestantes)} dia(s)` : (f.diasRestantes === 0 ? '⏱️ vence hoje' : `⏱️ ${f.diasRestantes} dia(s) p/ o prazo`);
        return (
          <div key={f.id} style={{ ...s.card, borderLeft: `4px solid ${f.atrasada ? '#C0392B' : cor}`, background: f.atrasada ? '#FDF6F5' : '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{f.cliente || 'Cliente não identificado'} <span style={{ ...s.badge, background: cor + '18', color: cor }}>{emoji} {label}</span>
                  {prazoTxt && <span style={{ ...s.badge, background: f.atrasada ? '#FBEAE7' : '#EEF3F8', color: f.atrasada ? '#C0392B' : '#5A7186' }}>{prazoTxt}</span>}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  🧪 {f.formula} · {brl(f.valor)} · {f.pago ? '✅ pago' : '⚠️ em aberto'}{f.forma ? ' (' + f.forma + ')' : ''} · 📅 {dataBR(f.dataEmissao)} · 🏬 {f.loja}
                </div>
                <div style={{ fontSize: 11.5, color: '#999', marginTop: 3 }}>
                  Lançou: {f.lancou || '—'}{f.caixa ? ` · caixa: ${f.caixa}` : ''}{f.caixaOperador ? ` (${f.caixaOperador})` : ''}
                  {f.telefone ? ` · 📱 ${f.telefone}` : ' · sem telefone na observação'}
                </div>
                {f.observacao && <div style={{ fontSize: 11, color: '#bbb', marginTop: 3 }}>obs: {f.observacao}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {f.telefone && <a href={`https://wa.me/55${tel(f.telefone)}`} target="_blank" rel="noreferrer" style={{ ...s.btnMini, color: '#1E8449', borderColor: '#1E8449', textDecoration: 'none' }}>WhatsApp</a>}
                {f.telefone && <a href={`tel:${tel(f.telefone)}`} style={{ ...s.btnMini, textDecoration: 'none' }}>📞 Ligar</a>}
                {prox && <button onClick={() => avancar(f, prox)} style={{ ...s.btn, background: ST[prox][2] }}>{ST[prox][0]} {ST[prox][1]}</button>}
                {f.statusEntrega !== 'entregue' && f.statusEntrega !== 'cancelado' && f.statusEntrega !== 'avisado' && <button onClick={() => avancar(f, 'entregue')} style={{ ...s.btn, background: '#1E874B' }}>✅ Entregue ao cliente</button>}
                {f.statusEntrega !== 'entregue' && f.statusEntrega !== 'cancelado' && <button onClick={() => avancar(f, 'cancelado')} style={s.btnMini}>Cancelar</button>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 10 },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  btn: { fontSize: 12.5, padding: '7px 12px', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 12, padding: '5px 10px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
  pill: { fontSize: 12.5, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#555' },
  badge: { fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, marginLeft: 4 },
};
