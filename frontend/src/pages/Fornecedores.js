import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import MultiLojaSelect from '../components/MultiLojaSelect';
import ScrollX from '../components/ScrollX';
import CacheBar from '../components/CacheBar';

// Cadastro de Fornecedores (do contas a pagar do ERP) — marca se EMITE nota fiscal ou não.
// Quem não emite (sócio/retirada, compra internacional, imposto/DARF, pessoa física) sai da conta de
// "sem nota (perda fiscal)" no BI da Contabilidade e aparece em faixa própria.
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MOTIVOS = ['Folha de pagamento', 'Sócio (retirada)', 'Imposto/DARF', 'Banco/Tarifas', 'Recarga', 'Fórmula', 'Aluguel', 'Compra internacional', 'Pessoa física', 'Empréstimo/financiamento', 'Outro'];
// conta de consumo (Luz/Água/Telefone…): EMITE nota, mas o ERP não vincula — confere pela pasta (recibo).
const CONSUMOS = ['Luz / Energia', 'Água / Esgoto', 'Telefone / Internet', 'Gás', 'TV / Streaming'];
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
  const [recibosDe, setRecibosDe] = useState(null); // fornecedor com o painel de recibos aberto
  const [cache, setCache] = useState(null);
  const setNRecibos = (pessoaId, n) => setRows(rs => rs.map(x => x.pessoa_id === pessoaId ? { ...x, n_recibos: n } : x));

  const carregar = useCallback((forcar) => {
    setCarregando(true);
    const p = new URLSearchParams(); if (loja) p.set('loja', loja); if (forcar) p.set('forcar', '1');
    API.get(`/contabilidade/fornecedores?${p.toString()}`).then(r => { setRows(r.data.fornecedores || []); setCache(r.data.cache); }).catch(() => setRows([])).finally(() => setCarregando(false));
  }, [API, loja]);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = (f, campos) => {
    const emite_nf = campos.emite_nf ?? f.emite_nf;
    const consumo = campos.consumo ?? f.consumo ?? 0;
    const body = { nome: f.nome, cnpj: f.cnpj, emite_nf, consumo, motivo: campos.motivo ?? f.motivo };
    if (emite_nf === 1 && !consumo) body.motivo = null; // "emite" normal não tem motivo; consumo guarda qual utilitária
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
      <p style={{ fontSize: 13, color: 'var(--fg-soft,#64748b)', margin: '0 0 16px' }}>Marque quem emite nota fiscal e quem não emite (sócio, compra internacional, imposto). Isso ajusta o BI da Contabilidade (não conta como 'sem nota'). Para <b>contas de consumo</b> (Luz, Água, Telefone…), a NF vem no boleto — marque o motivo e guarde o <b>📎 recibo</b> por mês.</p>
      <div style={s.filtros}>
        <div style={s.lab}>Lojas<MultiLojaSelect value={loja} onChange={setLoja} compact /></div>
        <div style={s.lab}>Buscar<input style={{ ...s.inp, minWidth: 220 }} value={busca} onChange={e => setBusca(e.target.value)} placeholder="nome ou CNPJ" /></div>
        <div style={s.lab}>Mostrar<select style={s.inp} value={filtroEmite} onChange={e => setFiltroEmite(e.target.value)}><option value="todos">Todos</option><option value="emite">Só emite NF</option><option value="nao">Só NÃO emite</option></select></div>
        <button style={s.btn} onClick={() => carregar()}>🔎 Aplicar</button>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: '#64748b' }}>{rows.length} fornecedor(es) · <b style={{ color: '#b45309' }}>{naoEmite} não emitem</b></div>
      </div>
      <CacheBar cache={cache} onAtualizar={() => carregar(true)} atualizando={carregando} />
      <ScrollX>
        <table style={s.tbl}>
          <thead><tr>{['Fornecedor', 'CNPJ', 'Títulos', 'Valor', '% c/ nota', 'Emite NF?', 'Motivo (se não emite)', 'Recibo'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {vis.map(f => {
              const pct = f.n > 0 ? Math.round(f.com_n / f.n * 100) : null;
              return (
                <tr key={f.pessoa_id} style={{ background: f.consumo ? '#eff6ff' : f.emite_nf === 0 ? '#fff7ed' : undefined }}>
                  <td style={s.td}>{f.nome || '—'}</td>
                  <td style={s.td}>{f.cnpj || '—'}</td>
                  <td style={s.tdNum}>{f.n}</td>
                  <td style={s.tdNum}>{brl(f.valor)}</td>
                  <td style={s.tdNum}>{f.consumo ? <span title="emite, mas confere pela pasta" style={{ color: '#2563eb' }}>via pasta</span> : (pct != null ? pct + '%' : '—')}</td>
                  <td style={s.td}>
                    <select value={f.consumo ? 'consumo' : (f.emite_nf === 0 ? 'nao' : 'sim')} onChange={e => { const v = e.target.value; salvar(f, v === 'consumo' ? { emite_nf: 1, consumo: 1 } : v === 'nao' ? { emite_nf: 0, consumo: 0 } : { emite_nf: 1, consumo: 0 }); }} style={{ ...s.inp, padding: '4px 6px' }}>
                      <option value="sim">✓ Emite</option><option value="nao">⚠️ Não emite</option><option value="consumo">💡 Conta de consumo</option>
                    </select>
                  </td>
                  <td style={s.td}>{(f.emite_nf === 0 || f.consumo)
                    ? <input list={f.consumo ? 'consumoDL' : 'motivosDL'} defaultValue={f.motivo || ''} placeholder={f.consumo ? 'Luz / Água / Telefone…' : 'escolher ou digitar…'} style={{ ...s.inp, padding: '4px 6px', minWidth: 190 }} onBlur={e => { if ((e.target.value || '') !== (f.motivo || '')) salvar(f, { motivo: e.target.value }); }} />
                    : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                  <td style={s.td}>{(f.emite_nf === 0 || f.consumo)
                    ? <button style={{ ...s.btn, padding: '4px 8px', fontSize: 12, borderColor: (f.consumo && !f.n_recibos) ? '#f59e0b' : '#cbd5e1', color: (f.consumo && !f.n_recibos) ? '#b45309' : '#334155' }}
                        onClick={() => setRecibosDe(f)} title="Recibos/boletos + rechecagem na pasta">📎 {f.n_recibos ? f.n_recibos : (f.consumo ? 'pendente' : 'anexar')}</button>
                    : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                </tr>
              );
            })}
            {!vis.length && !carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={8}>Nenhum fornecedor.</td></tr>}
            {carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={8}>Carregando…</td></tr>}
          </tbody>
        </table>
      </ScrollX>
      <datalist id="motivosDL">{MOTIVOS.map(m => <option key={m} value={m} />)}</datalist>
      <datalist id="consumoDL">{CONSUMOS.map(m => <option key={m} value={m} />)}</datalist>
      {recibosDe && <RecibosModal API={API} forn={recibosDe} onClose={() => setRecibosDe(null)} onCount={setNRecibos} />}
    </div>
  );
}

// Painel de recibos/boletos de um fornecedor (por competência). Arquivo guardado em base64.
function RecibosModal({ API, forn, onClose, onCount }) {
  const mesAtual = new Date().toISOString().slice(0, 7);
  const [lista, setLista] = useState([]);
  const [competencia, setCompetencia] = useState(mesAtual);
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [rech, setRech] = useState(null); const [rechLoad, setRechLoad] = useState(false);
  const carregar = useCallback(() => {
    API.get(`/contabilidade/fornecedores/${forn.pessoa_id}/recibos`).then(r => { setLista(r.data.recibos || []); onCount(forn.pessoa_id, (r.data.recibos || []).length); }).catch(() => setLista([]));
  }, [API, forn.pessoa_id, onCount]);
  useEffect(() => { carregar(); }, [carregar]);
  const rechecar = async () => {
    setRechLoad(true); setRech(null);
    try { const r = await API.get(`/contabilidade/fornecedores/${forn.pessoa_id}/recheck`); setRech(r.data); }
    catch (e) { setRech({ erro: e.response?.data?.erro || 'Falha na rechecagem.' }); }
    finally { setRechLoad(false); }
  };
  const enviar = async () => {
    if (!arquivo) { setErro('Escolha o arquivo do recibo (PDF ou foto).'); return; }
    setEnviando(true); setErro('');
    try {
      const dados = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(arquivo); });
      await API.post(`/contabilidade/fornecedores/${forn.pessoa_id}/recibos`, { competencia, nome: arquivo.name, tipo_mime: arquivo.type, dados });
      setArquivo(null); carregar();
    } catch (e) { setErro(e.response?.data?.erro || 'Falha ao enviar.'); }
    finally { setEnviando(false); }
  };
  const excluir = async (id) => { if (!window.confirm('Excluir este recibo?')) return; await API.delete(`/contabilidade/fornecedores/recibo/${id}`); carregar(); };
  const baixar = async (id) => {
    try {
      const r = await API.get(`/contabilidade/fornecedores/recibo/${id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data); window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { window.alert('Não foi possível abrir o recibo.'); }
  };
  const compBR = c => { const [a, m] = String(c).split('-'); return `${m}/${a}`; };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 18, maxWidth: 560, width: '100%', maxHeight: '86vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
          <div><div style={{ fontSize: 15, fontWeight: 800 }}>📎 Recibos — {forn.nome}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{forn.motivo || 'Não emite NF'} · o boleto/recibo é o documento fiscal.</div></div>
          <button style={{ ...s.btn, padding: '4px 10px' }} onClick={onClose}>fechar</button>
        </div>
        <div style={{ ...s.filtros, marginBottom: 12 }}>
          <div style={s.lab}>Competência<input type="month" style={s.inp} value={competencia} onChange={e => setCompetencia(e.target.value)} /></div>
          <div style={s.lab}>Arquivo (PDF/foto)<input type="file" accept="application/pdf,image/*" onChange={e => setArquivo(e.target.files[0] || null)} style={{ fontSize: 12 }} /></div>
          <button style={{ ...s.btn, background: '#0d6b5e', color: '#fff', borderColor: '#0d6b5e' }} onClick={enviar} disabled={enviando}>{enviando ? 'enviando…' : '⬆️ anexar recibo'}</button>
        </div>
        {erro && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 13 }}>⚠️ {erro}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <button style={{ ...s.btn, padding: '5px 12px', fontSize: 12 }} onClick={rechecar} disabled={rechLoad} title="Confere no ERP os meses com despesa deste fornecedor e aponta quais ainda não têm recibo na pasta">{rechLoad ? 'rechecando…' : '🔁 rechecar na pasta'}</button>
          {rech && !rech.erro && <span style={{ fontSize: 12, color: rech.faltando ? '#b45309' : '#15803d', fontWeight: 600 }}>{rech.faltando ? `⚠️ ${rech.faltando} mês(es) com despesa sem recibo` : '✅ todos os meses com despesa têm recibo'}</span>}
          {rech && rech.erro && <span style={{ fontSize: 12, color: '#b91c1c' }}>⚠️ {rech.erro}</span>}
        </div>
        {rech && !rech.erro && !!(rech.meses || []).length && (
          <table style={{ ...s.tbl, marginBottom: 12 }}>
            <thead><tr>{['Mês da despesa', 'Títulos', 'Valor', 'Recibo na pasta?'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>{rech.meses.map((m, i) => (
              <tr key={i} style={m.tem_recibo ? undefined : { background: '#fffbeb' }}>
                <td style={s.td}>{(() => { const [a, mm] = m.competencia.split('-'); return `${mm}/${a}`; })()}</td>
                <td style={s.tdNum}>{m.n}</td>
                <td style={s.tdNum}>{brl(m.valor)}</td>
                <td style={s.td}>{m.tem_recibo ? <span style={{ color: '#15803d', fontWeight: 600 }}>✅ sim</span> : <span style={{ color: '#b45309', fontWeight: 600 }}>⚠️ falta</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', margin: '4px 0 6px' }}>Recibos anexados</div>
        <table style={s.tbl}>
          <thead><tr>{['Competência', 'Arquivo', 'Enviado', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {lista.map(r => (
              <tr key={r.id}>
                <td style={s.td}>{compBR(r.competencia)}</td>
                <td style={s.td}><button style={{ ...s.btn, padding: '2px 8px', fontSize: 12 }} onClick={() => baixar(r.id)}>📄 {r.nome || 'recibo'}</button></td>
                <td style={s.td}>{String(r.criado_em || '').slice(0, 10).split('-').reverse().join('/')}</td>
                <td style={s.td}><button style={{ ...s.btn, padding: '2px 8px', fontSize: 12, color: '#b91c1c', borderColor: '#fecaca' }} onClick={() => excluir(r.id)}>excluir</button></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={4} style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }}>Nenhum recibo anexado ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
