import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import MultiLojaSelect from '../components/MultiLojaSelect';
import ScrollX from '../components/ScrollX';

// Cadastro de Fornecedores (do contas a pagar do ERP) — marca se EMITE nota fiscal ou não.
// Quem não emite (sócio/retirada, compra internacional, imposto/DARF, pessoa física) sai da conta de
// "sem nota (perda fiscal)" no BI da Contabilidade e aparece em faixa própria.
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MOTIVOS = ['Folha de pagamento', 'Sócio (retirada)', 'Imposto/DARF', 'Banco/Tarifas', 'Recarga', 'Fórmula', 'Aluguel', 'Compra internacional', 'Pessoa física', 'Empréstimo/financiamento', 'Outro'];
const s = {
  wrap: { padding: 20, maxWidth: 1180, margin: '0 auto' },
  filtros: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14, background: 'var(--surface,#fff)', border: '1px solid var(--line,#ddd8cf)', borderRadius: 10, padding: 12 },
  lab: { display: 'flex', flexDirection: 'column', fontSize: 11, color: 'var(--fg-soft,#5d6b6e)', gap: 3 },
  inp: { border: '1px solid #cbd5e1', borderRadius: 7, padding: '7px 9px', fontSize: 13 },
  btn: { padding: '8px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#334155' },
  tbl: { width: '100%', borderCollapse: 'collapse', background: 'var(--surface,#fff)', border: '1px solid var(--line,#ddd8cf)', borderRadius: 10, overflow: 'hidden', fontSize: 13 },
  th: { textAlign: 'left', padding: '9px 10px', background: 'var(--surface-2,#efece6)', color: 'var(--fg-soft,#5d6b6e)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: .3, whiteSpace: 'nowrap' },
  td: { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' },
  tdNum: { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
};

export default function Fornecedores() {
  const { API } = useAuth();
  const [loja, setLoja] = useState('');
  const [busca, setBusca] = useState('');
  const [rows, setRows] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [filtroEmite, setFiltroEmite] = useState('todos'); // todos | emite | nao

  const carregar = useCallback(() => {
    setCarregando(true);
    const p = new URLSearchParams(); if (loja) p.set('loja', loja);
    API.get(`/contabilidade/fornecedores?${p.toString()}`).then(r => setRows(r.data.fornecedores || [])).catch(() => setRows([])).finally(() => setCarregando(false));
  }, [API, loja]);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = (f, campos) => {
    const body = { nome: f.nome, cnpj: f.cnpj, emite_nf: campos.emite_nf ?? f.emite_nf, motivo: campos.motivo ?? f.motivo };
    if (campos.emite_nf === 1) body.motivo = null;
    API.put(`/contabilidade/fornecedores/${f.pessoa_id}`, body).then(() => {
      setRows(rs => rs.map(x => x.pessoa_id === f.pessoa_id ? { ...x, ...body } : x));
    }).catch(e => window.alert(e.response?.data?.erro || 'Erro ao salvar.'));
  };

  const vis = rows.filter(f => {
    if (busca && !((f.nome || '').toLowerCase().includes(busca.toLowerCase()) || (f.cnpj || '').includes(busca))) return false;
    if (filtroEmite === 'emite') return f.emite_nf === 1;
    if (filtroEmite === 'nao') return f.emite_nf === 0;
    return true;
  });
  const naoEmite = rows.filter(f => f.emite_nf === 0).length;

  return (
    <div style={s.wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '6px 0 12px', borderBottom: '1px solid var(--line,#ddd8cf)', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#1e293b' }}>🏭 Fornecedores</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--fg-soft,#64748b)', margin: '0 0 16px' }}>Marque quem emite nota fiscal e quem não emite (sócio, compra internacional, imposto). Isso ajusta o BI da Contabilidade (não conta como 'sem nota').</p>
      <div style={s.filtros}>
        <div style={s.lab}>Lojas<MultiLojaSelect value={loja} onChange={setLoja} compact /></div>
        <div style={s.lab}>Buscar<input style={{ ...s.inp, minWidth: 220 }} value={busca} onChange={e => setBusca(e.target.value)} placeholder="nome ou CNPJ" /></div>
        <div style={s.lab}>Mostrar<select style={s.inp} value={filtroEmite} onChange={e => setFiltroEmite(e.target.value)}><option value="todos">Todos</option><option value="emite">Só emite NF</option><option value="nao">Só NÃO emite</option></select></div>
        <button style={s.btn} onClick={carregar}>🔎 Aplicar</button>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: '#64748b' }}>{rows.length} fornecedor(es) · <b style={{ color: '#b45309' }}>{naoEmite} não emitem</b></div>
      </div>
      <ScrollX>
        <table style={s.tbl}>
          <thead><tr>{['Fornecedor', 'CNPJ', 'Títulos', 'Valor', '% c/ nota', 'Emite NF?', 'Motivo (se não emite)'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {vis.map(f => {
              const pct = f.n > 0 ? Math.round(f.com_n / f.n * 100) : null;
              return (
                <tr key={f.pessoa_id} style={{ background: f.emite_nf === 0 ? '#fff7ed' : undefined }}>
                  <td style={s.td}>{f.nome || '—'}</td>
                  <td style={s.td}>{f.cnpj || '—'}</td>
                  <td style={s.tdNum}>{f.n}</td>
                  <td style={s.tdNum}>{brl(f.valor)}</td>
                  <td style={s.tdNum}>{pct != null ? pct + '%' : '—'}</td>
                  <td style={s.td}>
                    <select value={f.emite_nf === 0 ? 'nao' : 'sim'} onChange={e => salvar(f, { emite_nf: e.target.value === 'sim' ? 1 : 0 })} style={{ ...s.inp, padding: '4px 6px' }}>
                      <option value="sim">✓ Emite</option><option value="nao">⚠️ Não emite</option>
                    </select>
                  </td>
                  <td style={s.td}>{f.emite_nf === 0
                    ? <input list="motivosDL" defaultValue={f.motivo || ''} placeholder="escolher ou digitar…" style={{ ...s.inp, padding: '4px 6px', minWidth: 190 }} onBlur={e => { if ((e.target.value || '') !== (f.motivo || '')) salvar(f, { motivo: e.target.value }); }} />
                    : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                </tr>
              );
            })}
            {!vis.length && !carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={7}>Nenhum fornecedor.</td></tr>}
            {carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={7}>Carregando…</td></tr>}
          </tbody>
        </table>
      </ScrollX>
      <datalist id="motivosDL">{MOTIVOS.map(m => <option key={m} value={m} />)}</datalist>
    </div>
  );
}
