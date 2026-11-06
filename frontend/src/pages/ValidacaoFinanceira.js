import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

// Painel único de Validação Financeira — pendências de confirmação de pagamento de vários módulos
// (Trade a receber, Devolução reembolso, e o que surgir). O Comercial anexa o comprovante; o
// FINANCEIRO confirma. As pendências são lidas ao vivo de cada módulo (agregador extensível).
const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
const CONFIRMA = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Financeiro', 'Tesouraria'];

export default function ValidacaoFinanceira() {
  const { API, usuario } = useAuth();
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [origem, setOrigem] = useState('');
  const [venc, setVenc] = useState('todos');   // todos | vencidos | avencer
  const [vde, setVde] = useState(''); const [vate, setVate] = useState('');
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);
  const alvoRef = useRef(null);
  const podeConfirmar = CONFIRMA.includes(usuario?.funcao);
  const carregar = useCallback(() => {
    API.get('/validacao-financeira', { params: { origem: origem || undefined } })
      .then(r => { setD(r.data); setErro(''); })
      .catch(e => setErro(e.response?.data?.erro || 'Erro ao carregar.'));
  }, [API, origem]);
  useEffect(() => { carregar(); }, [carregar]);

  const chave = i => i.origem + '|' + i.ref_id;
  const anexar = i => { alvoRef.current = i; fileRef.current && fileRef.current.click(); };
  const onFile = e => {
    const file = e.target.files[0]; const i = alvoRef.current; e.target.value = '';
    if (!file || !i) return;
    if (file.size > 12000000) { setErro('Arquivo muito grande (máx 12MB).'); return; }
    setBusy(chave(i) + ':up');
    const r = new FileReader();
    r.onload = () => API.post('/validacao-financeira/comprovante', { origem: i.origem, ref_id: i.ref_id, dados: r.result, mime: file.type, nome: file.name })
      .then(carregar).catch(er => setErro(er.response?.data?.erro || 'Erro ao anexar.')).finally(() => setBusy(''));
    r.readAsDataURL(file);
  };
  const ver = i => API.get('/validacao-financeira/comprovante', { params: { origem: i.origem, ref_id: i.ref_id }, responseType: 'blob' })
    .then(r => window.open(URL.createObjectURL(r.data), '_blank')).catch(() => setErro('Não consegui abrir o comprovante.'));
  const confirmar = i => {
    if (!window.confirm(`Confirmar o pagamento de ${brl(i.valor)} — ${i.ref} (${i.origemRotulo})?\nIsso dá baixa no módulo de origem.`)) return;
    setBusy(chave(i) + ':ok');
    API.post('/validacao-financeira/confirmar', { origem: i.origem, ref_id: i.ref_id, valor: i.valor })
      .then(carregar).catch(er => setErro(er.response?.data?.erro || 'Erro ao confirmar.')).finally(() => setBusy(''));
  };

  const r = d?.resumo;
  const hojeISO = new Date().toISOString().slice(0, 10);
  const itens = (d?.itens || []).filter(i => {
    const dt = (i.data || '').slice(0, 10);
    if (venc === 'vencidos' && !(dt && dt < hojeISO)) return false;
    if (venc === 'avencer' && !(dt && dt >= hojeISO)) return false;
    if (vde && (!dt || dt < vde)) return false;
    if (vate && (!dt || dt > vate)) return false;
    return true;
  });
  const vencidosN = (d?.itens || []).filter(i => { const dt = (i.data || '').slice(0, 10); return dt && dt < hojeISO; }).length;
  return (
    <div style={s.wrap}>
      <div style={{ padding: '6px 0 12px', borderBottom: '1px solid #e5e7eb', marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#1e293b' }}>💰 Validação Financeira</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Tudo que espera a confirmação de pagamento do Financeiro, num lugar só. O comercial anexa o comprovante; o <b>Financeiro confirma</b> e o item baixa no módulo de origem.</p>
      </div>

      {erro && <div style={s.erro}>⚠️ {erro}</div>}

      <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={onFile} />

      {r && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginBottom: 14 }}>
        <Stat n={r.pendentes} l="Pendentes de confirmação" cor={r.pendentes ? '#C0392B' : '#1E874B'} bg={r.pendentes ? '#FBEAEA' : '#EAF6EF'} />
        <Stat n={brl(r.valorPendente)} l="Valor a confirmar" cor="#C87A1E" />
        <Stat n={r.comComprovante} l="Já com comprovante" cor="#1E874B" />
      </div>}

      <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Origem:</span>
        <button onClick={() => setOrigem('')} style={{ ...s.chip, ...(!origem ? s.chipOn : {}) }}>Todas</button>
        {(r?.porOrigem || []).map(o => (
          <button key={o.origem} onClick={() => setOrigem(o.origem)} style={{ ...s.chip, ...(origem === o.origem ? s.chipOn : {}) }}>
            {o.emoji} {o.rotulo} · {o.n} · {brl(o.valor)}
          </button>
        ))}
        {!podeConfirmar && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#B45309' }}>Você pode anexar comprovante; a confirmação é do Financeiro.</span>}
      </div>

      <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Vencimento:</span>
        <button onClick={() => setVenc('todos')} style={{ ...s.chip, ...(venc === 'todos' ? s.chipOn : {}) }}>Todos</button>
        <button onClick={() => setVenc('vencidos')} style={{ ...s.chip, ...(venc === 'vencidos' ? { background: '#C0392B', color: '#fff', borderColor: '#C0392B' } : { color: '#C0392B', borderColor: '#f0c7c7' }) }}>⚠️ Vencidos{vencidosN ? ' · ' + vencidosN : ''}</button>
        <button onClick={() => setVenc('avencer')} style={{ ...s.chip, ...(venc === 'avencer' ? s.chipOn : {}) }}>A vencer</button>
        <span style={{ width: 1, background: '#e5e7eb', alignSelf: 'stretch', margin: '0 2px' }} />
        <label style={{ fontSize: 11.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>de<input type="date" value={vde} onChange={e => setVde(e.target.value)} style={{ ...s.input || {}, border: '1.5px solid #e2e8f0', borderRadius: 9, padding: '6px 8px', fontSize: 13 }} /></label>
        <label style={{ fontSize: 11.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>até<input type="date" value={vate} onChange={e => setVate(e.target.value)} style={{ border: '1.5px solid #e2e8f0', borderRadius: 9, padding: '6px 8px', fontSize: 13 }} /></label>
        {(vde || vate || venc !== 'todos') && <button onClick={() => { setVenc('todos'); setVde(''); setVate(''); }} style={s.btnMini}>limpar</button>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}><b>{itens.length}</b> de {(d?.itens || []).length}</span>
      </div>

      <div style={{ ...s.card, overflowX: 'auto' }}>
        {!itens.length && <div style={s.vazio}>Nada aguardando confirmação 🎉</div>}
        {!!itens.length && <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{['Origem', 'Referência', 'Contraparte', 'Loja', 'Vencimento', 'Valor', 'Comprovante', 'Ação'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>{itens.map(i => (
            <tr key={chave(i)} style={{ borderTop: '1px solid #f2f2f2' }}>
              <td style={s.td}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#EEF2FF', color: '#3730a3', fontWeight: 700, whiteSpace: 'nowrap' }}>{i.emoji} {i.origemRotulo}</span></td>
              <td style={s.td}><b>{i.ref}</b><div style={{ fontSize: 10.5, color: '#94a3b8' }}>{i.descricao}</div></td>
              <td style={s.td}>{i.contraparte}</td>
              <td style={s.td}>{i.loja}</td>
              <td style={s.td}>{dBR(i.data)}</td>
              <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{brl(i.valor)}</td>
              <td style={s.td}>
                {i.temComprovante
                  ? <button onClick={() => ver(i)} style={{ ...s.btnMini, borderColor: '#1E874B', color: '#1E874B' }}>📎 ver</button>
                  : <span style={{ fontSize: 11.5, color: '#C0392B' }}>sem comprovante</span>}
                <button onClick={() => anexar(i)} disabled={busy === chave(i) + ':up'} style={{ ...s.btnMini, marginLeft: 4 }}>{busy === chave(i) + ':up' ? '…' : (i.temComprovante ? 'trocar' : '+ anexar')}</button>
              </td>
              <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                {podeConfirmar
                  ? <button onClick={() => confirmar(i)} disabled={busy === chave(i) + ':ok'} style={{ ...s.btn, background: i.temComprovante ? '#1E874B' : '#9CA3AF' }} title={i.temComprovante ? 'Confirmar o pagamento' : 'Sem comprovante — você ainda pode confirmar'}>{busy === chave(i) + ':ok' ? 'confirmando…' : '✓ confirmar'}</button>
                  : <span style={{ fontSize: 11.5, color: '#94a3b8' }}>aguarda o Financeiro</span>}
              </td>
            </tr>))}</tbody>
        </table>}
      </div>
    </div>
  );
}

function Stat({ n, l, cor, bg }) {
  return <div style={{ ...s.card, margin: 0, background: bg || '#fff' }}>
    <div style={{ fontSize: 22, fontWeight: 800, color: cor || '#1e293b', fontVariantNumeric: 'tabular-nums' }}>{n}</div>
    <div style={{ fontSize: 11.5, color: '#64748b' }}>{l}</div>
  </div>;
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1300, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  card: { background: '#fff', border: '1px solid #eceae4', borderRadius: 12, padding: 14, marginBottom: 12 },
  chip: { fontSize: 12.5, padding: '6px 11px', border: '1px solid #ddd', borderRadius: 20, background: '#fff', cursor: 'pointer', color: '#333', whiteSpace: 'nowrap' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  btn: { fontSize: 12.5, padding: '7px 13px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 11.5, padding: '5px 9px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
  th: { textAlign: 'left', fontSize: 11, color: '#888', padding: '6px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  td: { padding: '7px 8px', verticalAlign: 'top' },
  erro: { background: '#FBEAEA', border: '1px solid #F0C7C7', color: '#8A2E2E', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 12 },
  vazio: { textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 24 },
};
