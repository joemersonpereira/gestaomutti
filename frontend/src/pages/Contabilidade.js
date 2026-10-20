import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import MultiLojaSelect from '../components/MultiLojaSelect';
import ScrollX from '../components/ScrollX';

// Módulo Contabilidade — Fatia 1: Créditos a recuperar.
// Crédito de devolução com fornecedor (ERP) e os abatimentos no contas a pagar, mostrando a NF
// vinculada ao boleto — o que a contabilidade precisa para baixar e registrar contabilmente.
// ERP SOMENTE LEITURA.

const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// hora do cache (gravado em UTC "YYYY-MM-DD HH:MM:SS") → hora local pt-BR
const fmtCacheHora = at => { try { return new Date(String(at).replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return at; } };
const hoje = new Date();
const iniAno = `${hoje.getFullYear()}-01-01`;
const iniMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
const hojeStr = hoje.toISOString().slice(0, 10);

const s = {
  wrap: { padding: 20, maxWidth: 1200, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, margin: '0 0 2px', color: '#1e293b' },
  sub: { fontSize: 13, color: '#64748b', margin: '0 0 16px' },
  filtros: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 },
  lab: { display: 'flex', flexDirection: 'column', fontSize: 11, color: '#64748b', gap: 3 },
  inp: { border: '1px solid #cbd5e1', borderRadius: 7, padding: '7px 9px', fontSize: 13 },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' },
  cardLab: { fontSize: 12, color: '#64748b' },
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 2 },
  tabs: { display: 'flex', gap: 6, marginBottom: 12 },
  tab: a => ({ padding: '8px 14px', borderRadius: 8, border: '1px solid ' + (a ? '#0d6b5e' : '#e5e7eb'), background: a ? '#e6f3f0' : '#fff', color: a ? '#0d6b5e' : '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }),
  tbl: { width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', fontSize: 13 },
  th: { textAlign: 'left', padding: '9px 10px', background: '#f8fafc', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: .3, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' },
  td: { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' },
  tdNum: { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  btn: { padding: '8px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#334155' },
  pill: c => ({ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.fg, fontWeight: 600 }),
  nf: { fontWeight: 700, color: '#0f766e' },
};
const statusCor = st => ({
  'Em aberto': { bg: '#dcfce7', fg: '#15803d' }, 'Parcial': { bg: '#fef9c3', fg: '#a16207' },
  'Utilizado': { bg: '#e0e7ff', fg: '#4338ca' }, 'Cancelado': { bg: '#fee2e2', fg: '#b91c1c' },
  'Estornado': { bg: '#f3e8ff', fg: '#7e22ce' },
}[st] || { bg: '#f1f5f9', fg: '#475569' });

// Donut simples (conic-gradient) + legenda. segments = [{label, valor, cor}].
function Donut({ segments, size = 150, onPick, ativo }) {
  const segs = (segments || []).filter(s => Number(s.valor) > 0);
  const total = segs.reduce((a, s) => a + Number(s.valor), 0);
  let acc = 0;
  const stops = total > 0 ? segs.map(s => { const from = acc / total * 360; acc += Number(s.valor); const to = acc / total * 360; return `${s.cor} ${from}deg ${to}deg`; }).join(', ') : '#eef2f0 0deg 360deg';
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: `conic-gradient(${stops})`, position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: size * 0.3, background: 'var(--surface,#fff)', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 11, color: '#64748b' }}>total</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{(total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 240, flex: 1 }}>
        {segs.map((s, i) => (
          <div key={i} onClick={() => onPick && s.bucket && onPick(s)} title={onPick && s.bucket ? 'Ver o que está dentro' : ''}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '3px 6px', borderRadius: 6, cursor: onPick && s.bucket ? 'pointer' : 'default', background: ativo === s.bucket ? '#eef2f0' : 'transparent' }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: s.cor, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{s.label}{onPick && s.bucket ? <span style={{ color: '#cbd5e1' }}> ›</span> : null}</span>
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{(Number(s.valor)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            <span style={{ color: '#94a3b8', width: 44, textAlign: 'right' }}>{total > 0 ? Math.round(Number(s.valor) / total * 100) : 0}%</span>
          </div>
        ))}
        {!segs.length && <span style={{ fontSize: 12, color: '#94a3b8' }}>Sem dados no período.</span>}
      </div>
    </div>
  );
}

function baixarCsv(nome, colunas, linhas) {
  const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const txt = [colunas.map(c => esc(c.h)).join(';'), ...linhas.map(l => colunas.map(c => esc(c.f(l))).join(';'))].join('\n');
  const blob = new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); URL.revokeObjectURL(a.href);
}

export default function Contabilidade() {
  const { API } = useAuth();
  const [secao, setSecao] = useState('painel'); // painel | creditos | emprestimos | cofre | extrato | despesas
  const [aba, setAba] = useState('recuperar'); // recuperar | abatimentos
  const [loja, setLoja] = useState('');
  const [de, setDe] = useState(iniAno);
  const [ate, setAte] = useState(hojeStr);
  const [busca, setBusca] = useState('');
  const [resumo, setResumo] = useState({ total: { saldo_aberto: 0, utilizado: 0, n_aberto: 0 } });
  const [creditos, setCreditos] = useState([]);
  const [utils, setUtils] = useState([]);
  const [saldoFiltro, setSaldoFiltro] = useState('aberto'); // aberto | todos
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  const q = useCallback(() => {
    const p = new URLSearchParams();
    if (loja) p.set('loja', loja);
    if (de) p.set('de', de);
    if (ate) p.set('ate', ate);
    if (busca.trim()) p.set('busca', busca.trim());
    return p;
  }, [loja, de, ate, busca]);

  const carregar = useCallback(() => {
    if (secao !== 'creditos') return;
    setCarregando(true); setErro(null);
    const lojaP = loja ? `?loja=${encodeURIComponent(loja)}` : '';
    API.get(`/contabilidade/creditos/resumo${lojaP}`).then(r => setResumo(r.data)).catch(() => {});
    if (aba === 'recuperar') {
      const p = q(); p.set('saldo', saldoFiltro);
      API.get(`/contabilidade/creditos?${p.toString()}`).then(r => setCreditos(r.data.creditos || [])).catch(e => setErro(e.response?.data?.erro || 'Erro ao carregar créditos.')).finally(() => setCarregando(false));
    } else {
      API.get(`/contabilidade/creditos/utilizacoes?${q().toString()}`).then(r => setUtils(r.data.utilizacoes || [])).catch(e => setErro(e.response?.data?.erro || 'Erro ao carregar abatimentos.')).finally(() => setCarregando(false));
    }
  }, [API, aba, q, loja, saldoFiltro, secao]);

  useEffect(() => { carregar(); }, [carregar]);

  const t = resumo.total || { saldo_aberto: 0, utilizado: 0, n_aberto: 0 };

  return (
    <div style={s.wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '6px 0 12px', borderBottom: '1px solid var(--line,#ddd8cf)', marginBottom: 16 }}>
        <h1 style={{ ...s.h1, margin: 0 }}>🧮 Contabilidade</h1>
        <div style={{ ...s.tabs, margin: 0, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button style={s.tab(secao === 'painel')} onClick={() => setSecao('painel')}>📊 Painel</button>
          <button style={s.tab(secao === 'perda')} onClick={() => setSecao('perda')}>⚠️ Sem nota (perda)</button>
          <button style={s.tab(secao === 'creditos')} onClick={() => setSecao('creditos')}>💳 Créditos a recuperar</button>
          <button style={s.tab(secao === 'emprestimos')} onClick={() => setSecao('emprestimos')}>🏦 Empréstimos</button>
          <button style={s.tab(secao === 'cofre')} onClick={() => setSecao('cofre')}>💵 Cofre & Caixa 30/31</button>
          <button style={s.tab(secao === 'extrato')} onClick={() => setSecao('extrato')}>📄 Extrato de contas</button>
          <button style={s.tab(secao === 'pendencias')} onClick={() => setSecao('pendencias')}>📂 NF / Pendências</button>
          <button style={s.tab(secao === 'despesas')} onClick={() => setSecao('despesas')}>💰 Orçamento</button>
        </div>
      </div>

      {secao === 'painel' ? <PainelBI API={API} /> : secao === 'perda' ? <PerdaApuracao API={API} /> : secao === 'emprestimos' ? <Emprestimos API={API} /> : secao === 'cofre' ? <CofreCaixa API={API} /> : secao === 'extrato' ? <ExtratoContas API={API} /> : secao === 'pendencias' ? <PendenciasNf API={API} /> : secao === 'despesas' ? <CartaoDespesas API={API} /> : <>
      <p style={s.sub}>Crédito de devolução com fornecedor e os abatimentos no contas a pagar (com a NF vinculada, para baixar e registrar contabilmente). Leitura do ERP A7.</p>

      <div style={s.filtros}>
        <div style={s.lab}>Lojas<MultiLojaSelect value={loja} onChange={setLoja} compact /></div>
        <div style={s.lab}>De<input type="date" style={s.inp} value={de} onChange={e => setDe(e.target.value)} /></div>
        <div style={s.lab}>Até<input type="date" style={s.inp} value={ate} onChange={e => setAte(e.target.value)} /></div>
        <div style={s.lab}>Buscar (fornecedor, nº NF/crédito)<input style={{ ...s.inp, minWidth: 240 }} value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && carregar()} placeholder="Ex.: Santa Cruz, 14736683" /></div>
        <button style={s.btn} onClick={carregar}>🔎 Aplicar</button>
      </div>

      <div style={s.cards}>
        <div style={s.card}><div style={s.cardLab}>A recuperar (saldo em aberto)</div><div style={{ ...s.cardVal, color: '#15803d' }}>{brl(t.saldo_aberto)}</div><div style={s.cardLab}>{t.n_aberto} crédito(s)</div></div>
        <div style={s.card}><div style={s.cardLab}>Já utilizado (abatido)</div><div style={{ ...s.cardVal, color: '#4338ca' }}>{brl(t.utilizado)}</div><div style={s.cardLab}>no período total</div></div>
        <div style={s.card}><div style={s.cardLab}>Total de crédito (aberto + utilizado)</div><div style={{ ...s.cardVal, color: '#0f172a' }}>{brl(Number(t.saldo_aberto) + Number(t.utilizado))}</div></div>
      </div>

      <div style={s.tabs}>
        <button style={s.tab(aba === 'recuperar')} onClick={() => setAba('recuperar')}>💰 A recuperar</button>
        <button style={s.tab(aba === 'abatimentos')} onClick={() => setAba('abatimentos')}>🧾 Abatimentos (NF p/ baixar)</button>
      </div>

      {erro && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>{erro}</div>}

      {aba === 'recuperar' ? (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <label style={{ fontSize: 13, color: '#475569', display: 'flex', gap: 6, alignItems: 'center' }}>
              <select style={s.inp} value={saldoFiltro} onChange={e => setSaldoFiltro(e.target.value)}>
                <option value="aberto">Só com saldo a recuperar</option>
                <option value="todos">Todos os créditos</option>
              </select>
            </label>
            <div style={{ flex: 1 }} />
            <button style={s.btn} onClick={() => baixarCsv('creditos-a-recuperar.csv', [
              { h: 'Código', f: r => r.codigo }, { h: 'Emissão', f: r => r.data_emissao }, { h: 'Loja', f: r => r.loja },
              { h: 'Fornecedor', f: r => r.fornecedor }, { h: 'CNPJ', f: r => r.cnpj },
              { h: 'NF devolução nº', f: r => r.nf_dev_numero }, { h: 'NF devolução série', f: r => r.nf_dev_serie }, { h: 'NF devolução valor', f: r => r.nf_dev_valor }, { h: 'Chave NF devolução', f: r => r.nf_dev_chave }, { h: 'Devolução (cód.)', f: r => r.devolucao_codigo },
              { h: 'Valor crédito', f: r => r.valor }, { h: 'Utilizado', f: r => r.valor_utilizado }, { h: 'Saldo', f: r => r.saldo }, { h: 'Status', f: r => r.status_label },
            ], creditos)}>⬇️ CSV</button>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>A coluna <b style={{ color: '#0f766e' }}>NF devolução</b> é a nota que a loja <b>emitiu</b> ao devolver a mercadoria — a que gerou o crédito com o fornecedor.</div>
          <ScrollX>
            <table style={s.tbl}>
              <thead><tr>{['Código', 'Emissão', 'Loja', 'Fornecedor', 'NF devolução (emitida)', 'Valor', 'Utilizado', 'Saldo', 'Status'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {creditos.map(c => (
                  <tr key={c.id}>
                    <td style={s.td}>#{c.codigo}</td>
                    <td style={s.td}>{c.data_emissao}</td>
                    <td style={s.td}>{c.loja}</td>
                    <td style={s.td}>{c.fornecedor}</td>
                    <td style={s.td}>
                      {c.nf_dev_numero
                        ? <span title={`Chave: ${c.nf_dev_chave || '—'}${c.nf_dev_valor ? ' · NF R$ ' + c.nf_dev_valor : ''}${c.nf_dev_status && c.nf_dev_status !== 'C' ? ' · status ' + c.nf_dev_status : ''}`}><span style={s.nf}>{c.nf_dev_numero}{c.nf_dev_serie ? '/' + c.nf_dev_serie : ''}</span>{c.devolucao_codigo ? <span style={{ color: '#94a3b8', fontSize: 11 }}> · dev #{c.devolucao_codigo}</span> : null}</span>
                        : (c.devolucao_codigo ? <span style={{ color: '#94a3b8' }}>dev #{c.devolucao_codigo} · sem NF</span> : <span style={{ color: '#cbd5e1' }}>—</span>)}
                    </td>
                    <td style={s.tdNum}>{brl(c.valor)}</td>
                    <td style={s.tdNum}>{brl(c.valor_utilizado)}</td>
                    <td style={{ ...s.tdNum, fontWeight: 700, color: Number(c.saldo) > 0 ? '#15803d' : '#94a3b8' }}>{brl(c.saldo)}</td>
                    <td style={s.td}><span style={s.pill(statusCor(c.status_label))}>{c.status_label}</span></td>
                  </tr>
                ))}
                {!creditos.length && !carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={9}>Nenhum crédito no filtro.</td></tr>}
                {carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={9}>Carregando…</td></tr>}
              </tbody>
            </table>
          </ScrollX>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>Cada linha é um abatimento do crédito num boleto. <b style={{ color: '#0f766e' }}>NF devolução</b> = a nota que gerou o crédito; <b>NF boleto</b> = a nota da compra paga. <b>Valor final</b> = título − crédito abatido (o que sobrou pra pagar).</div>
            <div style={{ flex: 1 }} />
            <button style={s.btn} onClick={() => baixarCsv('abatimentos-nf.csv', [
              { h: 'Data', f: r => r.data_abatimento }, { h: 'Loja', f: r => r.loja }, { h: 'Fornecedor', f: r => r.fornecedor }, { h: 'CNPJ', f: r => r.cnpj },
              { h: 'Crédito', f: r => r.codigo_credito },
              { h: 'NF devolução nº', f: r => r.nf_dev_numero }, { h: 'NF devolução série', f: r => r.nf_dev_serie }, { h: 'NF devolução valor', f: r => r.nf_dev_valor }, { h: 'Chave NF devolução', f: r => r.nf_dev_chave },
              { h: 'Título (boleto)', f: r => r.valor_titulo }, { h: 'Crédito abatido', f: r => r.valor_abatido }, { h: 'Valor final', f: r => r.valor_final },
              { h: 'NF boleto nº', f: r => r.nf_numero }, { h: 'NF boleto série', f: r => r.nf_serie }, { h: 'Chave NF boleto', f: r => r.nf_chave },
              { h: 'Documento (boleto)', f: r => r.numerodocumento }, { h: 'Vencimento', f: r => r.vencimento },
            ], utils)}>⬇️ CSV</button>
          </div>
          <ScrollX>
            <table style={s.tbl}>
              <thead><tr>{['Data', 'Loja', 'Fornecedor', 'NF devolução (gerou crédito)', 'Título (boleto)', 'Crédito abatido', 'Valor final', 'NF boleto', 'Documento', 'Venc.'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {utils.map(u => (
                  <tr key={u.id}>
                    <td style={s.td}>{u.data_abatimento}</td>
                    <td style={s.td}>{u.loja}</td>
                    <td style={s.td}>{u.fornecedor}</td>
                    <td style={s.td}>
                      {u.nf_dev_numero
                        ? <span title={`Chave: ${u.nf_dev_chave || '—'}${u.nf_dev_valor ? ' · NF R$ ' + u.nf_dev_valor : ''}`}><span style={s.nf}>{u.nf_dev_numero}{u.nf_dev_serie ? '/' + u.nf_dev_serie : ''}</span> <span style={{ color: '#94a3b8', fontSize: 11 }}>· créd #{u.codigo_credito}</span></span>
                        : <span style={{ color: '#cbd5e1' }}>créd #{u.codigo_credito} · sem NF</span>}
                    </td>
                    <td style={s.tdNum}>{u.valor_titulo != null ? brl(u.valor_titulo) : '—'}</td>
                    <td style={{ ...s.tdNum, color: '#4338ca' }}>− {brl(u.valor_abatido)}</td>
                    <td style={{ ...s.tdNum, fontWeight: 700 }}>{u.valor_titulo != null ? brl(u.valor_final) : '—'}</td>
                    <td style={s.td}>{u.nf_numero ? <span style={s.nf} title={u.nf_chave || ''}>{u.nf_numero}{u.nf_serie ? '/' + u.nf_serie : ''}</span> : <span style={{ color: '#cbd5e1' }}>sem NF</span>}</td>
                    <td style={s.td}>{u.numerodocumento || '—'}</td>
                    <td style={s.td}>{u.vencimento || '—'}</td>
                  </tr>
                ))}
                {!utils.length && !carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={10}>Nenhum abatimento no filtro.</td></tr>}
                {carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={10}>Carregando…</td></tr>}
              </tbody>
            </table>
          </ScrollX>
        </>
      )}
      </>}
    </div>
  );
}

// ============================ EMPRÉSTIMOS ============================
const e0 = { descricao: '', credor: '', tipo: 'bancario', loja_id: '', valor_principal: '', taxa_juros: '', num_parcelas: '', valor_parcela: '', data_contratacao: hojeStr, data_primeira_parcela: '', observacao: '' };
// soma meses a uma data 'YYYY-MM-DD' (preserva o dia quando possível)
function addMesesStr(iso, n) { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-').map(Number); const base = new Date(y, (m - 1) + n, 1); const ult = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate(); base.setDate(Math.min(d, ult)); const mm = String(base.getMonth() + 1).padStart(2, '0'), dd = String(base.getDate()).padStart(2, '0'); return `${base.getFullYear()}-${mm}-${dd}`; }
const lerArquivo = file => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });

function Emprestimos({ API }) {
  const [lista, setLista] = useState([]);
  const [status, setStatus] = useState('');
  const [filtroLoja, setFiltroLoja] = useState('');
  const [form, setForm] = useState(e0);
  const [editId, setEditId] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [aberto, setAberto] = useState(null); // emprestimo expandido (parcelas/anexos)
  const [parcelas, setParcelas] = useState([]);
  const [anexos, setAnexos] = useState([]);
  const [msg, setMsg] = useState(null);
  const [previa, setPrevia] = useState([]); // parcelas conferidas antes de gerar (só no cadastro novo)

  const carregar = useCallback(() => {
    const p = status ? `?status=${status}` : '';
    API.get(`/contabilidade/emprestimos${p}`).then(r => setLista(r.data.emprestimos || [])).catch(() => {});
  }, [API, status]);
  useEffect(() => { carregar(); }, [carregar]);

  const abrir = useCallback((id) => {
    if (aberto === id) { setAberto(null); return; }
    setAberto(id);
    API.get(`/contabilidade/emprestimos/${id}/parcelas`).then(r => setParcelas(r.data.parcelas || [])).catch(() => setParcelas([]));
    API.get(`/contabilidade/emprestimos/${id}/anexos`).then(r => setAnexos(r.data.anexos || [])).catch(() => setAnexos([]));
  }, [API, aberto]);

  const recarregarDetalhe = id => {
    API.get(`/contabilidade/emprestimos/${id}/parcelas`).then(r => setParcelas(r.data.parcelas || [])).catch(() => {});
    carregar();
  };

  async function salvar() {
    setMsg(null);
    if (!form.descricao && !form.credor) { setMsg({ erro: 'Informe ao menos descrição ou credor.' }); return; }
    const body = { ...form, valor_principal: Number(form.valor_principal) || 0, taxa_juros: Number(form.taxa_juros) || 0, num_parcelas: Number(form.num_parcelas) || 1, valor_parcela: Number(form.valor_parcela) || 0 };
    if (!editId && previa.length) body.parcelas = previa; // usa as parcelas conferidas na tela
    try {
      if (editId) await API.put(`/contabilidade/emprestimos/${editId}`, body);
      else await API.post('/contabilidade/emprestimos', body);
      setForm(e0); setEditId(null); setMostrarForm(false); setPrevia([]); carregar();
    } catch (e) { setMsg({ erro: e.response?.data?.erro || 'Erro ao salvar (sem permissão de escrita?).' }); }
  }
  function editar(e) {
    setEditId(e.id); setMostrarForm(true);
    setForm({ descricao: e.descricao || '', credor: e.credor || '', tipo: e.tipo || 'bancario', loja_id: e.loja_id || '', valor_principal: e.valor_principal || '', taxa_juros: e.taxa_juros || '', num_parcelas: e.num_parcelas || '', valor_parcela: e.valor_parcela || '', data_contratacao: (e.data_contratacao || '').slice(0, 10), data_primeira_parcela: (e.data_primeira_parcela || '').slice(0, 10), observacao: e.observacao || '' });
  }
  async function remover(e) {
    if (!window.confirm(`Remover o empréstimo "${e.descricao || e.credor}"? As parcelas e anexos serão apagados.`)) return;
    try { await API.delete(`/contabilidade/emprestimos/${e.id}`); carregar(); if (aberto === e.id) setAberto(null); }
    catch (err) { window.alert(err.response?.data?.erro || 'Erro ao remover.'); }
  }
  async function togglePaga(empId, p) {
    try { await API.put(`/contabilidade/emprestimos/${empId}/parcela/${p.numero}`, { pago: !p.pago }); recarregarDetalhe(empId); }
    catch (err) { window.alert(err.response?.data?.erro || 'Sem permissão para baixar parcela.'); }
  }
  async function editarParcela(empId, numero, campos) {
    try { await API.put(`/contabilidade/emprestimos/${empId}/parcela/${numero}`, campos); recarregarDetalhe(empId); }
    catch (err) { window.alert(err.response?.data?.erro || 'Sem permissão para editar parcela.'); }
  }
  function gerarPrevia() {
    const n = Number(form.num_parcelas) || 0;
    if (!n || !form.data_primeira_parcela) { setMsg({ erro: 'Informe o nº de parcelas e a data da 1ª parcela.' }); return; }
    setMsg(null);
    setPrevia(Array.from({ length: n }, (_, i) => ({ numero: i + 1, vencimento: addMesesStr(form.data_primeira_parcela, i), valor: Number(form.valor_parcela) || 0 })));
  }
  const setPreviaCampo = (i, campo, v) => setPrevia(prev => prev.map((p, idx) => idx === i ? { ...p, [campo]: campo === 'valor' ? v : v } : p));
  async function anexar(empId, file) {
    if (!file) return;
    const dados = await lerArquivo(file);
    try { await API.post(`/contabilidade/emprestimos/${empId}/anexo`, { nome: file.name, tipo: file.type, dados }); API.get(`/contabilidade/emprestimos/${empId}/anexos`).then(r => setAnexos(r.data.anexos || [])); carregar(); }
    catch (err) { window.alert(err.response?.data?.erro || 'Erro ao anexar.'); }
  }
  async function verAnexo(a) {
    const r = await API.get(`/contabilidade/emprestimo-anexo/${a.id}`);
    const w = window.open(); if (w) w.document.write(`<iframe src="${r.data.dados}" style="width:100%;height:100%;border:0"></iframe>`);
  }
  async function removerAnexo(empId, a) {
    if (!window.confirm(`Remover o anexo "${a.nome}"?`)) return;
    try { await API.delete(`/contabilidade/emprestimo-anexo/${a.id}`); setAnexos(anexos.filter(x => x.id !== a.id)); carregar(); }
    catch (err) { window.alert(err.response?.data?.erro || 'Erro.'); }
  }

  const stPill = st => ({ ativo: { bg: '#dcfce7', fg: '#15803d' }, quitado: { bg: '#e0e7ff', fg: '#4338ca' }, cancelado: { bg: '#fee2e2', fg: '#b91c1c' } }[st] || { bg: '#f1f5f9', fg: '#475569' });
  const lojasDisp = [...new Set(lista.map(e => e.loja_nome).filter(Boolean))].sort();
  const listaVis = lista.filter(e => !filtroLoja || (filtroLoja === '__grupo__' ? !e.loja_nome : e.loja_nome === filtroLoja));
  const totalDevedor = listaVis.filter(e => e.status !== 'cancelado').reduce((a, e) => a + Number(e.saldo_devedor || 0), 0);

  return (
    <>
      <p style={s.sub}>Lançamento de empréstimos com parcelas geradas automaticamente e anexo do contrato. A contabilidade acessa para registrar; parcelas podem ser baixadas conforme o pagamento.</p>

      <div style={s.cards}>
        <div style={s.card}><div style={s.cardLab}>Saldo devedor (em aberto)</div><div style={{ ...s.cardVal, color: '#b45309' }}>{brl(totalDevedor)}</div><div style={s.cardLab}>{listaVis.filter(e => e.status === 'ativo').length} empréstimo(s) ativo(s)</div></div>
        <div style={s.card}><div style={s.cardLab}>Total de contratos</div><div style={{ ...s.cardVal, color: '#0f172a' }}>{listaVis.length}</div></div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <select style={s.inp} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos os status</option><option value="ativo">Ativos</option><option value="quitado">Quitados</option><option value="cancelado">Cancelados</option>
        </select>
        <select style={s.inp} value={filtroLoja} onChange={e => setFiltroLoja(e.target.value)}>
          <option value="">Todas as lojas</option><option value="__grupo__">Grupo (sem loja)</option>
          {lojasDisp.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button style={{ ...s.btn, background: '#1d4ed8', color: '#fff', borderColor: '#1d4ed8' }} onClick={() => { setForm(e0); setEditId(null); setMostrarForm(m => !m); }}>＋ Novo empréstimo</button>
      </div>

      {mostrarForm && (
        <div style={{ ...s.card, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, color: '#1e293b' }}>{editId ? 'Editar empréstimo' : 'Novo empréstimo'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <label style={s.lab}>Descrição<input style={s.inp} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Capital de giro" /></label>
            <label style={s.lab}>Credor (banco/pessoa)<input style={s.inp} value={form.credor} onChange={e => setForm({ ...form, credor: e.target.value })} /></label>
            <label style={s.lab}>Tipo<select style={s.inp} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}><option value="bancario">Bancário</option><option value="socio">Sócio</option><option value="fornecedor">Fornecedor</option><option value="outro">Outro</option></select></label>
            <label style={s.lab}>Loja (opcional)<MultiLojaSelect value={form.loja_id} onChange={v => setForm({ ...form, loja_id: (v || '').split(',')[0] || '' })} compact /></label>
            <label style={s.lab}>Valor principal (R$)<input type="number" style={s.inp} value={form.valor_principal} onChange={e => setForm({ ...form, valor_principal: e.target.value })} /></label>
            <label style={s.lab}>Juros (% a.m.)<input type="number" style={s.inp} value={form.taxa_juros} onChange={e => setForm({ ...form, taxa_juros: e.target.value })} /></label>
            <label style={s.lab}>Nº de parcelas<input type="number" style={s.inp} value={form.num_parcelas} onChange={e => setForm({ ...form, num_parcelas: e.target.value })} /></label>
            <label style={s.lab}>Valor da parcela (R$)<input type="number" style={s.inp} value={form.valor_parcela} onChange={e => setForm({ ...form, valor_parcela: e.target.value })} /></label>
            <label style={s.lab}>Data da contratação<input type="date" style={s.inp} value={form.data_contratacao} onChange={e => setForm({ ...form, data_contratacao: e.target.value })} /></label>
            <label style={s.lab}>1ª parcela<input type="date" style={s.inp} value={form.data_primeira_parcela} onChange={e => setForm({ ...form, data_primeira_parcela: e.target.value })} /></label>
            <label style={{ ...s.lab, gridColumn: '1 / -1' }}>Observação<input style={s.inp} value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} /></label>
          </div>
          {msg?.erro && <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 8 }}>{msg.erro}</div>}
          {!editId && (
            <div style={{ marginTop: 12 }}>
              <button style={s.btn} onClick={gerarPrevia}>🔢 Conferir parcelas</button>
              {previa.length > 0 && (
                <div style={{ marginTop: 10, border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#f8fafc' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Confira o vencimento e o valor de cada parcela (a 1ª pode ser diferente)</div>
                  <table style={{ ...s.tbl, fontSize: 12 }}>
                    <thead><tr>{['#', 'Vencimento', 'Valor'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {previa.map((p, i) => (
                        <tr key={i}>
                          <td style={s.td}>{p.numero}</td>
                          <td style={s.td}><input type="date" value={p.vencimento || ''} style={{ ...s.inp, padding: '4px 6px', fontSize: 12 }} onChange={e => setPreviaCampo(i, 'vencimento', e.target.value)} /></td>
                          <td style={s.tdNum}><input type="number" value={p.valor} style={{ ...s.inp, padding: '4px 6px', fontSize: 12, width: 100, textAlign: 'right' }} onChange={e => setPreviaCampo(i, 'valor', Number(e.target.value) || 0)} /></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td style={s.td} colSpan={2}><b>Total</b></td><td style={s.tdNum}><b>{brl(previa.reduce((a, p) => a + Number(p.valor || 0), 0))}</b></td></tr></tfoot>
                  </table>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>💡 Gerado a partir da 1ª data + 1 mês. Ajuste o que precisar antes de salvar.</div>
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={{ ...s.btn, background: '#1d4ed8', color: '#fff', borderColor: '#1d4ed8' }} onClick={salvar}>Salvar</button>
            <button style={s.btn} onClick={() => { setMostrarForm(false); setEditId(null); setForm(e0); setPrevia([]); }}>Cancelar</button>
          </div>
        </div>
      )}

      <ScrollX>
        <table style={s.tbl}>
          <thead><tr>{['', 'Descrição', 'Credor', 'Tipo', 'Loja', 'Principal', 'Parcelas', 'Saldo devedor', 'Status', 'Anexos', ''].map((h, i) => <th key={i} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {listaVis.map(e => (
              <React.Fragment key={e.id}>
                <tr style={{ cursor: 'pointer' }} onClick={() => abrir(e.id)}>
                  <td style={s.td}>{aberto === e.id ? '▾' : '▸'}</td>
                  <td style={s.td}>{e.descricao || '—'}</td>
                  <td style={s.td}>{e.credor || '—'}</td>
                  <td style={s.td}>{e.tipo}</td>
                  <td style={s.td}>{e.loja_nome || 'Grupo'}</td>
                  <td style={s.tdNum}>{brl(e.valor_principal)}</td>
                  <td style={s.tdNum}>{e.pagas}/{e.n_parcelas}</td>
                  <td style={{ ...s.tdNum, fontWeight: 700, color: Number(e.saldo_devedor) > 0 ? '#b45309' : '#94a3b8' }}>{brl(e.saldo_devedor)}</td>
                  <td style={s.td}><span style={s.pill(stPill(e.status))}>{e.status}</span></td>
                  <td style={s.td}>{e.n_anexos ? '📎 ' + e.n_anexos : '—'}</td>
                  <td style={s.td} onClick={ev => ev.stopPropagation()}>
                    <button style={{ ...s.btn, padding: '3px 8px', fontSize: 12 }} onClick={() => editar(e)}>✏️</button>{' '}
                    <button style={{ ...s.btn, padding: '3px 8px', fontSize: 12, color: '#b91c1c' }} onClick={() => remover(e)}>🗑</button>
                  </td>
                </tr>
                {aberto === e.id && (
                  <tr><td colSpan={11} style={{ padding: 0, background: '#f8fafc' }}>
                    <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Parcelas (baixa por pagamento)</div>
                        <table style={{ ...s.tbl, fontSize: 12 }}>
                          <thead><tr>{['#', 'Vencimento', 'Valor', 'Pago?', 'Pagamento'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                          <tbody>
                            {parcelas.map(p => (
                              <tr key={p.id}>
                                <td style={s.td}>{p.numero}</td>
                                <td style={s.td}><input type="date" defaultValue={p.vencimento || ''} style={{ ...s.inp, padding: '4px 6px', fontSize: 12 }}
                                  onBlur={ev => { if (ev.target.value !== (p.vencimento || '')) editarParcela(e.id, p.numero, { vencimento: ev.target.value }); }} /></td>
                                <td style={s.tdNum}><input type="number" defaultValue={p.valor} style={{ ...s.inp, padding: '4px 6px', fontSize: 12, width: 90, textAlign: 'right' }}
                                  onBlur={ev => { const v = Number(ev.target.value) || 0; if (v !== Number(p.valor)) editarParcela(e.id, p.numero, { valor: v }); }} /></td>
                                <td style={s.td}><input type="checkbox" checked={!!p.pago} onChange={() => togglePaga(e.id, p)} /></td>
                                <td style={s.td}>{p.data_pagamento || (p.pago ? '✓' : '—')}</td>
                              </tr>
                            ))}
                            {!parcelas.length && <tr><td style={s.td} colSpan={5}>Sem parcelas.</td></tr>}
                          </tbody>
                        </table>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>💡 Pode ajustar o vencimento e o valor de cada parcela (ex.: 1ª parcela em data diferente das demais).</div>
                        {e.observacao && <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>📝 {e.observacao}</div>}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Contrato e documentos</div>
                        {anexos.map(a => (
                          <div key={a.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
                            <button style={{ ...s.btn, padding: '3px 8px', fontSize: 12 }} onClick={() => verAnexo(a)}>📄 {a.nome}</button>
                            <button style={{ ...s.btn, padding: '3px 6px', fontSize: 12, color: '#b91c1c' }} onClick={() => removerAnexo(e.id, a)}>×</button>
                          </div>
                        ))}
                        {!anexos.length && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Nenhum anexo.</div>}
                        <label style={{ ...s.btn, display: 'inline-block', marginTop: 4 }}>＋ Anexar<input type="file" style={{ display: 'none' }} onChange={ev => anexar(e.id, ev.target.files[0])} /></label>
                      </div>
                    </div>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
            {!lista.length && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={11}>Nenhum empréstimo lançado.</td></tr>}
          </tbody>
        </table>
      </ScrollX>
    </>
  );
}

// ============================ COFRE & CAIXA 30/31 ============================
function fimDoMes(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).toISOString().slice(0, 10); }
const mesAtual = hojeStr.slice(0, 7);

function CofreCaixa({ API }) {
  const [sub, setSub] = useState('saldo'); // saldo | fechamento | extrato
  const [loja, setLoja] = useState('');
  const [posicao, setPosicao] = useState(hojeStr);  // data de referência do saldo
  const [de, setDe] = useState(fimDoMes(mesAtual).slice(0, 8) + '01');
  const [ate, setAte] = useState(hojeStr);
  const [saldos, setSaldos] = useState([]); const [totSaldo, setTotSaldo] = useState({ saldo: 0, fundo_fixo: 0, caixa_liquido: 0 });
  const [fech, setFech] = useState([]); const [extrato, setExtrato] = useState([]);
  const [fundos, setFundos] = useState({}); const [carregando, setCarregando] = useState(false); const [erro, setErro] = useState(null);

  const carregar = useCallback(() => {
    setCarregando(true); setErro(null);
    const L = loja ? `loja=${encodeURIComponent(loja)}&` : '';
    if (sub === 'saldo') {
      API.get(`/contabilidade/cofre/saldo?${L}ate=${posicao}`).then(r => { setSaldos(r.data.saldos || []); setTotSaldo(r.data.total || {}); }).catch(e => setErro(e.response?.data?.erro || 'Erro.')).finally(() => setCarregando(false));
      API.get(`/contabilidade/cofre/fundo-fixo`).then(r => { const m = {}; (r.data.fundos || []).forEach(f => { m[f.loja_id] = f.valor; }); setFundos(m); }).catch(() => {});
    } else if (sub === 'fechamento') {
      API.get(`/contabilidade/cofre/fechamento?${L}de=${de}&ate=${ate}`).then(r => setFech(r.data.fechamento || [])).catch(e => setErro(e.response?.data?.erro || 'Erro.')).finally(() => setCarregando(false));
    } else {
      API.get(`/contabilidade/cofre/extrato?${L}de=${de}&ate=${ate}`).then(r => setExtrato(r.data.extrato || [])).catch(e => setErro(e.response?.data?.erro || 'Erro.')).finally(() => setCarregando(false));
    }
  }, [API, sub, loja, posicao, de, ate]);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvarFundo(loja_id, valor) {
    try { await API.put(`/contabilidade/cofre/fundo-fixo`, { loja_id, valor: Number(valor) || 0 }); carregar(); }
    catch (e) { window.alert(e.response?.data?.erro || 'Sem permissão para editar fundo fixo.'); }
  }

  return (
    <>
      <p style={s.sub}>Conta <b>cofre</b> de cada loja (ERP): dinheiro do caixa que entrou e o que foi feito com ele (depósito no banco, despesas). O saldo do cofre é o <b>dinheiro ainda não depositado</b> — e no fim do mês é o <b>Saldo em caixa 30/31</b> (menos o fundo fixo da loja). Leitura do ERP A7.</p>

      <div style={s.filtros}>
        <div style={s.lab}>Lojas<MultiLojaSelect value={loja} onChange={setLoja} compact /></div>
        {sub === 'saldo'
          ? <>
            <div style={s.lab}>Posição em<input type="date" style={s.inp} value={posicao} onChange={e => setPosicao(e.target.value)} /></div>
            <div style={s.lab}>Fim do mês<input type="month" style={s.inp} defaultValue={mesAtual} onChange={e => e.target.value && setPosicao(fimDoMes(e.target.value))} /></div>
          </>
          : <>
            <div style={s.lab}>De<input type="date" style={s.inp} value={de} onChange={e => setDe(e.target.value)} /></div>
            <div style={s.lab}>Até<input type="date" style={s.inp} value={ate} onChange={e => setAte(e.target.value)} /></div>
          </>}
        <button style={s.btn} onClick={carregar}>🔎 Aplicar</button>
      </div>

      <div style={s.tabs}>
        <button style={s.tab(sub === 'saldo')} onClick={() => setSub('saldo')}>💵 Saldo em caixa (30/31)</button>
        <button style={s.tab(sub === 'fechamento')} onClick={() => setSub('fechamento')}>📅 Fechamento diário</button>
        <button style={s.tab(sub === 'extrato')} onClick={() => setSub('extrato')}>📜 Extrato do cofre</button>
      </div>

      {erro && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>{erro}</div>}

      {sub === 'saldo' && <>
        <div style={s.cards}>
          <div style={s.card}><div style={s.cardLab}>No cofre (não depositado)</div><div style={{ ...s.cardVal, color: '#b45309' }}>{brl(totSaldo.saldo)}</div><div style={s.cardLab}>posição em {posicao.split('-').reverse().join('/')}</div></div>
          <div style={s.card}><div style={s.cardLab}>Fundo fixo (fica na loja)</div><div style={{ ...s.cardVal, color: '#64748b' }}>{brl(totSaldo.fundo_fixo)}</div></div>
          <div style={s.card}><div style={s.cardLab}>Caixa líquido a depositar</div><div style={{ ...s.cardVal, color: '#15803d' }}>{brl(totSaldo.caixa_liquido)}</div></div>
        </div>
        <ScrollX>
          <table style={s.tbl}>
            <thead><tr>{['Loja', 'Cofre (ERP)', 'Última mov.', 'Saldo no cofre', 'Fundo fixo', 'Caixa líquido'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {saldos.map(r => (
                <tr key={r.loja_erp}>
                  <td style={s.td}>{r.loja}</td>
                  <td style={s.td}>{r.nome}</td>
                  <td style={s.td}>{r.ultima_mov || '—'}</td>
                  <td style={{ ...s.tdNum, fontWeight: 700, color: Number(r.saldo) >= 0 ? '#b45309' : '#b91c1c' }}>{brl(r.saldo)}{Number(r.saldo) < 0 ? <span style={{ fontSize: 10, fontWeight: 600, color: '#b91c1c' }}> (negativo)</span> : null}</td>
                  <td style={s.tdNum}>
                    <input type="number" defaultValue={fundos[r.loja_id] ?? r.fundo_fixo ?? 0} style={{ ...s.inp, width: 100, textAlign: 'right' }}
                      onBlur={e => { const v = Number(e.target.value) || 0; if (v !== (Number(r.fundo_fixo) || 0)) salvarFundo(r.loja_id, v); }} />
                  </td>
                  <td style={{ ...s.tdNum, fontWeight: 700, color: Number(r.caixa_liquido) >= 0 ? '#15803d' : '#b91c1c' }}>{brl(r.caixa_liquido)} <span style={{ fontSize: 10, fontWeight: 600 }}>{Number(r.caixa_liquido) >= 0 ? '(positivo)' : '(negativo)'}</span></td>
                </tr>
              ))}
              {!saldos.length && !carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={6}>Sem dados.</td></tr>}
              {carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={6}>Carregando…</td></tr>}
            </tbody>
          </table>
        </ScrollX>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>💡 Ajuste o <b>fundo fixo</b> de cada loja (o troco que sempre fica). O <b>caixa líquido</b> = saldo do cofre − fundo fixo = o que deveria estar depositado.<br/>
          <span style={{ color: '#15803d', fontWeight: 600 }}>Positivo</span> = ainda há dinheiro no cofre a depositar. <span style={{ color: '#b91c1c', fontWeight: 600 }}>Negativo</span> = o saldo do cofre está <b>abaixo do fundo fixo</b> (ou negativo no ERP — normalmente lançamento pós-datado/ajuste), ou seja, não há sobra a depositar.</div>
      </>}

      {sub === 'fechamento' && <ScrollX>
        <table style={s.tbl}>
          <thead><tr>{['Dia', 'Loja', 'Entrou do caixa', 'Depositado no banco', 'Despesas pagas', 'Ficou retido'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {fech.map((r, i) => (
              <tr key={i}>
                <td style={s.td}>{r.dia.split('-').reverse().join('/')}</td>
                <td style={s.td}>{r.loja}</td>
                <td style={s.tdNum}>{brl(r.entrou_caixa)}</td>
                <td style={s.tdNum}>{brl(r.depositado_banco)}</td>
                <td style={s.tdNum}>{brl(r.despesas)}</td>
                <td style={{ ...s.tdNum, fontWeight: 700, color: Number(r.retido) > 0.5 ? '#b91c1c' : '#15803d' }}>{brl(r.retido)}{Number(r.retido) > 0.5 ? ' ⚠️' : ''}</td>
              </tr>
            ))}
            {!fech.length && !carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={6}>Sem movimentação no período.</td></tr>}
            {carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={6}>Carregando…</td></tr>}
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>⚠️ <b>Ficou retido</b> = entrou do caixa − depositado − despesas. Positivo = dinheiro do dia que não foi todo depositado (todo dinheiro deve ser depositado).</div>
      </ScrollX>}

      {sub === 'extrato' && <ScrollX>
        <table style={s.tbl}>
          <thead><tr>{['Data/hora', 'Loja', 'Movimento', 'Valor', 'Saldo', 'Descrição'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {extrato.map((r, i) => (
              <tr key={i}>
                <td style={s.td}>{r.datahora}</td>
                <td style={s.td}>{r.loja}</td>
                <td style={s.td}>{r.tipo_mov}</td>
                <td style={{ ...s.tdNum, color: r.credito ? '#15803d' : '#b91c1c' }}>{brl(r.valor)}</td>
                <td style={s.tdNum}>{brl(r.saldo)}</td>
                <td style={s.td}>{r.descricao || '—'}</td>
              </tr>
            ))}
            {!extrato.length && !carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={6}>Sem movimentação no período.</td></tr>}
            {carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={6}>Carregando…</td></tr>}
          </tbody>
        </table>
      </ScrollX>}
    </>
  );
}

// ============================ EXTRATO DE CONTAS ============================
function ExtratoContas({ API }) {
  const [modo, setModo] = useState('pagar'); // pagar | movimento
  const [loja, setLoja] = useState('');
  const [conta, setConta] = useState('');
  const [contas, setContas] = useState([]);
  const [de, setDe] = useState(fimDoMes(mesAtual).slice(0, 8) + '01');
  const [ate, setAte] = useState(hojeStr);
  const [busca, setBusca] = useState('');
  const [somentePagos, setSomentePagos] = useState(false);
  const [sitNf, setSitNf] = useState('todas'); // todas | com | sem (apuração das sem nota)
  const [rows, setRows] = useState([]);
  const [mov, setMov] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [loteAberto, setLoteAberto] = useState(null);
  const [loteItens, setLoteItens] = useState([]);
  const abrirLote = (m) => {
    if (loteAberto === m.mov_id) { setLoteAberto(null); return; }
    setLoteAberto(m.mov_id); setLoteItens([]);
    API.get(`/contabilidade/extrato/lote?mov=${m.mov_id}`).then(r => setLoteItens(r.data.titulos || [])).catch(() => setLoteItens([]));
  };

  useEffect(() => { const L = loja ? `?loja=${encodeURIComponent(loja)}` : ''; API.get(`/contabilidade/extrato/contas${L}`).then(r => setContas(r.data.contas || [])).catch(() => {}); }, [API, loja]);

  const carregar = useCallback(() => {
    setCarregando(true); setErro(null);
    if (modo === 'movimento') {
      if (!conta) { setMov([]); setCarregando(false); return; }
      const p = new URLSearchParams({ conta }); if (de) p.set('de', de); if (ate) p.set('ate', ate);
      API.get(`/contabilidade/extrato/movimento?${p.toString()}`).then(r => setMov(r.data.movimento || [])).catch(e => setErro(e.response?.data?.erro || 'Erro ao carregar.')).finally(() => setCarregando(false));
      return;
    }
    const p = new URLSearchParams();
    if (loja) p.set('loja', loja); if (conta) p.set('conta', conta); if (de) p.set('de', de); if (ate) p.set('ate', ate);
    if (busca.trim()) p.set('busca', busca.trim()); if (somentePagos) p.set('somentePagos', '1');
    API.get(`/contabilidade/extrato?${p.toString()}`).then(r => setRows(r.data.lancamentos || [])).catch(e => setErro(e.response?.data?.erro || 'Erro ao carregar.')).finally(() => setCarregando(false));
  }, [API, modo, loja, conta, de, ate, busca, somentePagos]);
  useEffect(() => { carregar(); }, [carregar]);

  const tot = rows.reduce((a, r) => ({ valor: a.valor + Number(r.valor || 0), desc: a.desc + Number(r.desconto || 0), cred: a.cred + Number(r.credito_recuperar || 0), final: a.final + Number(r.valor_final || 0) }), { valor: 0, desc: 0, cred: 0, final: 0 });
  const semNf = rows.filter(r => !r.com_nf).length;
  const anexarNfServico = async (r, file) => {
    if (!file) return;
    const dados = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    try {
      const resp = await API.post(`/contabilidade/extrato/nf/${r.id}`, { anexo_nome: file.name, anexo_tipo: file.type, anexo_dados: dados });
      const d = resp.data;
      window.alert(d.ehNf ? `✅ Nota reconhecida\nNº: ${d.numero || '?'}\nCNPJ: ${d.cnpj || '?'}\nValor: ${d.valor != null ? brl(d.valor) : '?'}` : (d.aviso || '⚠️ O PDF não parece uma nota fiscal.'));
      carregar();
    } catch (e) { window.alert(e.response?.data?.erro || 'Erro ao anexar.'); }
  };
  const verNfServico = (r) => API.get(`/contabilidade/extrato/nf/${r.id}`).then(resp => { const w = window.open(); if (w) w.document.write(`<iframe src="${resp.data.dados}" style="width:100%;height:100vh;border:0"></iframe>`); }).catch(() => window.alert('Sem nota anexada.'));

  return (
    <>
      <div style={s.tabs}>
        <button style={s.tab(modo === 'pagar')} onClick={() => setModo('pagar')}>📋 Contas a pagar</button>
        <button style={s.tab(modo === 'movimento')} onClick={() => setModo('movimento')}>🏦 Movimento da conta (tudo)</button>
        <button style={s.tab(modo === 'importar')} onClick={() => setModo('importar')}>📂 Importar NFs (pasta)</button>
      </div>
      {modo === 'importar' && <ImportarNfsPasta API={API} />}
      {modo !== 'importar' && <>
      <p style={s.sub}>{modo === 'pagar'
        ? <>Contas a pagar (ERP): plano de contas, NF, desconto, crédito a recuperar abatido, valor final, conta que pagou e data da baixa. A coluna <b>NF?</b> sinaliza <b>despesa sem nota</b> — base do cruzamento ({semNf} sem NF no filtro). Traga as notas em lote na aba <b>📂 Importar NFs</b>.</>
        : <>Extrato <b>completo</b> da conta escolhida (tudo que entrou e saiu, com saldo corrente) — direto do ERP. Escolha uma <b>conta</b> no filtro.</>}</p>
      <div style={s.filtros}>
        <div style={s.lab}>Lojas<MultiLojaSelect value={loja} onChange={setLoja} compact /></div>
        <div style={s.lab}>Conta<select style={s.inp} value={conta} onChange={e => setConta(e.target.value)}><option value="">Todas as contas</option>{contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
        <div style={s.lab}>De<input type="date" style={s.inp} value={de} onChange={e => setDe(e.target.value)} /></div>
        <div style={s.lab}>Até<input type="date" style={s.inp} value={ate} onChange={e => setAte(e.target.value)} /></div>
        <div style={s.lab}>Buscar<input style={{ ...s.inp, minWidth: 190 }} value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && carregar()} placeholder="fornecedor, NF, documento" /></div>
        <div style={s.lab}>Situação NF<select style={s.inp} value={sitNf} onChange={e => setSitNf(e.target.value)}><option value="todas">Todas</option><option value="semreal">⚠️ Só sem nota REAL (perda)</option><option value="naoemite">● Só não emite (imposto/sócio)</option><option value="com">✓ Só com nota</option></select></div>
        <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={somentePagos} onChange={e => setSomentePagos(e.target.checked)} /> Só pagos</label>
        <button style={s.btn} onClick={carregar}>🔎 Aplicar</button>
      </div>
      {erro && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>{erro}</div>}
      {modo === 'pagar' ? <>
      <div style={s.cards}>
        <div style={s.card}><div style={s.cardLab}>Valor (títulos)</div><div style={{ ...s.cardVal, color: '#0f172a' }}>{brl(tot.valor)}</div><div style={s.cardLab}>{rows.length} lançamento(s)</div></div>
        <div style={s.card}><div style={s.cardLab}>Desconto</div><div style={{ ...s.cardVal, color: '#b45309' }}>{brl(tot.desc)}</div></div>
        <div style={s.card}><div style={s.cardLab}>Crédito a recuperar</div><div style={{ ...s.cardVal, color: '#4338ca' }}>{brl(tot.cred)}</div></div>
        <div style={s.card}><div style={s.cardLab}>Valor final</div><div style={{ ...s.cardVal, color: '#15803d' }}>{brl(tot.final)}</div></div>
      </div>
      <div style={{ display: 'flex', marginBottom: 8 }}><div style={{ flex: 1 }} /><button style={s.btn} onClick={() => baixarCsv('extrato-contas.csv', [
        { h: 'Data sistema', f: r => r.data_sistema }, { h: 'Data banco', f: r => r.data_banco }, { h: 'Baixa', f: r => r.data_baixa },
        { h: 'Fornecedor', f: r => r.fornecedor }, { h: 'Plano de contas', f: r => r.plano_contas }, { h: 'NF', f: r => r.nf_numero }, { h: 'Série', f: r => r.nf_serie },
        { h: 'Documento', f: r => r.numerodocumento }, { h: 'Valor', f: r => r.valor }, { h: 'Desconto', f: r => r.desconto }, { h: 'Crédito a recuperar', f: r => r.credito_recuperar }, { h: 'Valor final', f: r => r.valor_final }, { h: 'Conta', f: r => r.conta },
      ], rows)}>⬇️ CSV</button></div>
      <ScrollX>
        <table style={s.tbl}>
          <thead><tr>{['Data sistema', 'Banco', 'Baixa', 'Fornecedor', 'Plano de contas', 'NF?', 'Documento', 'Valor', 'Desconto', 'Crédito recup.', 'Valor final', 'Conta'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.filter(r => sitNf === 'todas' ? true : sitNf === 'com' ? r.com_nf : sitNf === 'naoemite' ? (!r.com_nf && r.nao_emite) : (!r.com_nf && !r.nao_emite)).map(r => (
              <tr key={r.id}>
                <td style={s.td}>{r.data_sistema}</td>
                <td style={s.td}>{r.data_banco || '—'}</td>
                <td style={s.td}>{r.data_baixa || '—'}</td>
                <td style={s.td}>{r.fornecedor}</td>
                <td style={s.td}>{r.plano_contas || '—'}</td>
                <td style={s.td}>{r.nf_numero
                  ? <span style={{ color: '#15803d', fontWeight: 600 }}>✓ {r.nf_numero}{r.nf_serie ? '/' + r.nf_serie : ''}</span>
                  : r.nf_servico_valida
                    ? <span style={{ color: '#15803d', fontWeight: 600, cursor: 'pointer' }} onClick={() => verNfServico(r)}>✓ nota serviço 📄</span>
                    : <label style={{ color: '#b91c1c', fontWeight: 600, cursor: 'pointer' }} title="Anexar a nota de serviço (PDF)">⚠️ sem NF · 📎<input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => anexarNfServico(r, e.target.files[0])} /></label>}</td>
                <td style={s.td}>{r.numerodocumento || '—'}</td>
                <td style={s.tdNum}>{brl(r.valor)}</td>
                <td style={s.tdNum}>{brl(r.desconto)}</td>
                <td style={{ ...s.tdNum, color: '#4338ca' }}>{brl(r.credito_recuperar)}</td>
                <td style={{ ...s.tdNum, fontWeight: 700 }}>{brl(r.valor_final)}</td>
                <td style={s.td}>{r.conta || <span style={{ color: '#cbd5e1' }}>em aberto</span>}</td>
              </tr>
            ))}
            {!rows.length && !carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={12}>Nenhum lançamento no filtro.</td></tr>}
            {carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={12}>Carregando…</td></tr>}
          </tbody>
        </table>
      </ScrollX>
      </> : (
        <ScrollX>
          <table style={s.tbl}>
            <thead><tr>{['Data/hora', 'Movimento', 'Documento', 'Plano de contas', 'Entrada', 'Saída', 'Saldo', 'Descrição'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {mov.map((m, i) => {
                const ehLote = Number(m.n_titulos) > 1;
                return (
                <React.Fragment key={i}>
                <tr style={ehLote ? { cursor: 'pointer' } : null} onClick={ehLote ? () => abrirLote(m) : undefined}>
                  <td style={s.td}>{m.datahora}</td>
                  <td style={s.td}>{m.tipo_mov}</td>
                  <td style={s.td}>{ehLote ? <span style={{ color: '#1d4ed8', fontWeight: 600 }}>{loteAberto === m.mov_id ? '▾' : '▸'} lote · {m.n_titulos} títulos</span> : (m.documento_baixado || '—')}</td>
                  <td style={s.td}>{m.plano_contas || '—'}</td>
                  <td style={{ ...s.tdNum, color: '#15803d' }}>{m.credito ? brl(m.valor) : ''}</td>
                  <td style={{ ...s.tdNum, color: '#b91c1c' }}>{!m.credito ? brl(Math.abs(Number(m.valor))) : ''}</td>
                  <td style={{ ...s.tdNum, fontWeight: 700 }}>{brl(m.saldo)}</td>
                  <td style={s.td}>{[m.descricao, m.transf_obs].filter(Boolean).join(' · ') || '—'}</td>
                </tr>
                {ehLote && loteAberto === m.mov_id && (
                  <tr><td colSpan={8} style={{ padding: 0, background: '#f8fafc' }}>
                    <div style={{ padding: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Títulos deste lote ({loteItens.length})</div>
                      <table style={{ ...s.tbl, fontSize: 12 }}>
                        <thead><tr>{['Documento', 'Fornecedor', 'Plano de contas', 'NF', 'Vencimento', 'Valor título', 'Valor pago'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                        <tbody>
                          {loteItens.map((t, j) => (
                            <tr key={j}>
                              <td style={s.td}>{t.numerodocumento || '—'}</td>
                              <td style={s.td}>{t.fornecedor || '—'}</td>
                              <td style={s.td}>{t.plano_contas || '—'}</td>
                              <td style={s.td}>{t.nf_numero ? t.nf_numero + (t.nf_serie ? '/' + t.nf_serie : '') : '—'}</td>
                              <td style={s.td}>{t.vencimento || '—'}</td>
                              <td style={s.tdNum}>{brl(t.valor_titulo)}</td>
                              <td style={{ ...s.tdNum, fontWeight: 700 }}>{brl(t.valor_pago)}</td>
                            </tr>
                          ))}
                          {!loteItens.length && <tr><td style={s.td} colSpan={7}>Carregando…</td></tr>}
                        </tbody>
                        {loteItens.length ? <tfoot><tr style={{ fontWeight: 700, background: '#eef2f7' }}><td style={s.td} colSpan={5}>Total do lote ({loteItens.length} títulos)</td><td style={s.tdNum}>{brl(loteItens.reduce((a, t) => a + Number(t.valor_titulo || 0), 0))}</td><td style={s.tdNum}>{brl(loteItens.reduce((a, t) => a + Number(t.valor_pago || 0), 0))}</td></tr></tfoot> : null}
                      </table>
                    </div>
                  </td></tr>
                )}
                </React.Fragment>
              );})}
              {!conta && !carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={8}>Escolha uma conta no filtro para ver o movimento.</td></tr>}
              {conta && !mov.length && !carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={8}>Sem movimento no período.</td></tr>}
              {carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={8}>Carregando…</td></tr>}
            </tbody>
          </table>
        </ScrollX>
      )}
      </>}
    </>
  );
}

// ============================ CARTÃO-DESPESAS / CONTA ORÇAMENTÁRIA ============================
function CartaoDespesas({ API }) {
  const [loja, setLoja] = useState('');
  const [de, setDe] = useState(iniMes);
  const [ate, setAte] = useState(hojeStr);
  const [resumo, setResumo] = useState({ linhas: [], total: { verba: 0, gasto: 0, saldo: 0 } });
  const [planos, setPlanos] = useState([]);
  const [sel, setSel] = useState(null); // conta_id selecionada
  const [mov, setMov] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  const qs = useCallback(() => {
    const p = new URLSearchParams();
    if (loja) p.set('loja', loja); if (de) p.set('de', de); if (ate) p.set('ate', ate);
    return p;
  }, [loja, de, ate]);

  const carregar = useCallback(() => {
    setCarregando(true); setErro(null);
    API.get(`/contabilidade/orcamento/resumo?${qs().toString()}`).then(r => setResumo(r.data)).catch(e => setErro(e.response?.data?.erro || 'Erro ao carregar orçamento.')).finally(() => setCarregando(false));
    API.get(`/contabilidade/orcamento/plano?${qs().toString()}`).then(r => setPlanos(r.data.planos || [])).catch(() => {});
  }, [API, qs]);
  useEffect(() => { carregar(); }, [carregar]);

  const carregarMov = useCallback(() => {
    if (!sel) { setMov([]); return; }
    const p = qs(); p.set('contas', sel);
    API.get(`/contabilidade/orcamento/movimento?${p.toString()}`).then(r => setMov(r.data.movimento || [])).catch(() => {});
  }, [API, sel, qs]);
  useEffect(() => { carregarMov(); }, [carregarMov]);

  const t = resumo.total || { verba: 0, gasto: 0, saldo: 0 };
  const pctTotal = t.verba > 0 ? Math.round((t.gasto / t.verba) * 1000) / 10 : null;
  const selLinha = (resumo.linhas || []).find(l => String(l.conta_id) === String(sel));
  const barraPct = p => p == null ? null : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 54, height: 7, borderRadius: 4, background: '#e2e8f0', overflow: 'hidden' }}><div style={{ width: Math.min(100, p) + '%', height: '100%', background: p >= 100 ? '#b91c1c' : p >= 85 ? '#b45309' : '#0d6b5e' }} /></div>
      <span style={{ fontSize: 12, fontWeight: 600, color: p >= 100 ? '#b91c1c' : p >= 85 ? '#b45309' : '#15803d' }}>{p}%</span>
    </div>
  );

  return (
    <>
      <p style={s.sub}>Verba da loja = a conta <b>“Orçamento - &lt;loja&gt;”</b> do ERP. O <b>escritório credita</b> a verba (transferência) e o <b>gerente gasta</b> (lançamentos de saída). Mostra, por loja, verba × gasto × saldo — ao vivo do Alpha 7, sem precisar lançar nada à mão.</p>
      <div style={s.filtros}>
        <label style={s.lab}>Loja<MultiLojaSelect value={loja} onChange={setLoja} /></label>
        <label style={s.lab}>De<input type="date" style={s.inp} value={de} onChange={e => setDe(e.target.value)} /></label>
        <label style={s.lab}>Até<input type="date" style={s.inp} value={ate} onChange={e => setAte(e.target.value)} /></label>
        <button style={s.btn} onClick={carregar} disabled={carregando}>{carregando ? 'Carregando…' : '🔄 Atualizar'}</button>
        <button style={{ ...s.btn, marginLeft: 'auto' }} onClick={() => baixarCsv('orcamento.csv', [
          { h: 'Loja', f: l => l.loja }, { h: 'Conta', f: l => l.conta }, { h: 'Verba', f: l => l.verba },
          { h: 'Gasto', f: l => l.gasto }, { h: 'Saldo', f: l => l.saldo }, { h: '% consumido', f: l => l.pct_gasto ?? '' }, { h: 'Nº gastos', f: l => l.n_gastos },
        ], resumo.linhas || [])} disabled={!(resumo.linhas || []).length}>⬇️ CSV</button>
      </div>

      <div style={s.cards}>
        <div style={s.card}><div style={s.cardLab}>Verba (crédito do escritório)</div><div style={{ ...s.cardVal, color: '#0f172a' }}>{brl(t.verba)}</div></div>
        <div style={s.card}><div style={s.cardLab}>Gasto (pelo gerente)</div><div style={{ ...s.cardVal, color: '#b45309' }}>{brl(t.gasto)}</div></div>
        <div style={s.card}><div style={s.cardLab}>Saldo</div><div style={{ ...s.cardVal, color: t.saldo >= 0 ? '#15803d' : '#b91c1c' }}>{brl(t.saldo)}</div></div>
        <div style={s.card}><div style={s.cardLab}>% consumido</div><div style={{ ...s.cardVal, color: (pctTotal >= 100 ? '#b91c1c' : pctTotal >= 85 ? '#b45309' : '#15803d') }}>{pctTotal != null ? pctTotal + '%' : '—'}</div></div>
      </div>

      {erro && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>{erro}</div>}

      <ScrollX>
        <table style={s.tbl}>
          <thead><tr>{['Loja', 'Verba', 'Gasto', 'Saldo', '% consumido', 'Nº gastos'].map(h => <th key={h} style={h === 'Loja' || h === '% consumido' ? s.th : { ...s.th, textAlign: 'right' }}>{h}</th>)}</tr></thead>
          <tbody>
            {(resumo.linhas || []).map(r => (
              <tr key={r.conta_id} style={{ cursor: 'pointer', background: String(sel) === String(r.conta_id) ? '#e6f3f0' : undefined }} onClick={() => setSel(String(sel) === String(r.conta_id) ? null : r.conta_id)}>
                <td style={{ ...s.td, fontWeight: 600 }}>{r.loja}{r.conta !== r.loja && <span style={{ color: '#94a3b8', fontWeight: 400 }}> · {r.conta.replace(/^Or[çc]amento - /i, '')}</span>}</td>
                <td style={s.tdNum}>{brl(r.verba)}</td>
                <td style={{ ...s.tdNum, color: '#b45309' }}>{brl(r.gasto)}</td>
                <td style={{ ...s.tdNum, fontWeight: 700, color: r.saldo >= 0 ? '#15803d' : '#b91c1c' }}>{brl(r.saldo)}</td>
                <td style={s.td}>{barraPct(r.pct_gasto) || '—'}</td>
                <td style={s.tdNum}>{r.n_gastos}</td>
              </tr>
            ))}
            {!(resumo.linhas || []).length && !carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8', padding: 24 }} colSpan={6}>Nenhum movimento de orçamento no período.</td></tr>}
          </tbody>
        </table>
      </ScrollX>

      {!!planos.length && (
        <div style={{ ...s.card, marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>🏷️ Gasto por categoria (plano de contas)</div>
          <ScrollX>
            <table style={s.tbl}>
              <thead><tr><th style={s.th}>Categoria</th><th style={{ ...s.th, textAlign: 'right' }}>Lançamentos</th><th style={{ ...s.th, textAlign: 'right' }}>Total</th></tr></thead>
              <tbody>
                {planos.map((p, i) => (
                  <tr key={i}><td style={s.td}>{p.plano}</td><td style={s.tdNum}>{p.n}</td><td style={{ ...s.tdNum, color: '#b45309' }}>{brl(p.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        </div>
      )}

      {sel && (
        <div style={{ ...s.card, marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Movimento — {selLinha ? selLinha.conta : ''}</div>
          <ScrollX>
            <table style={s.tbl}>
              <thead><tr>{['Data', 'Tipo', 'Valor', 'Plano de contas', 'Documento', 'Descrição', 'Usuário'].map(h => <th key={h} style={h === 'Valor' ? { ...s.th, textAlign: 'right' } : s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {mov.map((l, i) => (
                  <tr key={i}>
                    <td style={s.td}>{l.data ? String(l.data).split('-').reverse().join('/') : '—'}</td>
                    <td style={s.td}><span style={s.pill(l.credito ? { bg: '#dcfce7', fg: '#15803d' } : { bg: '#fef3c7', fg: '#b45309' })}>{l.credito ? 'Verba' : 'Gasto'}</span></td>
                    <td style={{ ...s.tdNum, color: l.credito ? '#15803d' : '#b45309' }}>{brl(l.valor)}</td>
                    <td style={{ ...s.td, color: l.plano_contas ? '#334155' : '#cbd5e1' }}>{l.plano_contas || '— sem plano —'}</td>
                    <td style={s.td}>{l.numerodocumento || '—'}</td>
                    <td style={{ ...s.td, whiteSpace: 'normal', maxWidth: 260 }}>{l.descricao || '—'}</td>
                    <td style={s.td}>{l.usuario || '—'}</td>
                  </tr>
                ))}
                {!mov.length && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={7}>Sem movimento no período.</td></tr>}
              </tbody>
            </table>
          </ScrollX>
        </div>
      )}
    </>
  );
}

// ============================ IMPORTAR NFs DA PASTA (OneDrive sincronizado) ============================
function ImportarNfsPasta({ API }) {
  const [base, setBase] = useState('');
  const [baseSalva, setBaseSalva] = useState('');
  const [sub, setSub] = useState('');
  const [pastas, setPastas] = useState([]);
  const [itens, setItens] = useState([]);
  const [fImp, setFImp] = useState('todos'); // todos | casaram | semcruz | semvalor | naonf
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { API.get('/contabilidade/nf-pasta/config').then(r => { setBase(r.data.base || ''); setBaseSalva(r.data.base || ''); }).catch(() => {}); }, [API]);

  const salvarBase = () => API.put('/contabilidade/nf-pasta/config', { base }).then(() => { setBaseSalva(base); setMsg('✅ Caminho salvo.'); listar(''); }).catch(e => setMsg(e.response?.data?.erro || 'Erro.'));
  const listar = (s) => { setSub(s); API.get(`/contabilidade/nf-pasta/listar?sub=${encodeURIComponent(s)}`).then(r => { setPastas(r.data.pastas || []); }).catch(e => { setPastas([]); setMsg(e.response?.data?.erro || 'Erro ao listar.'); }); };
  const entrar = (p) => listar(sub ? sub + '/' + p : p);
  const subir = () => { const parts = sub.split('/').filter(Boolean); parts.pop(); listar(parts.join('/')); };
  const scan = () => {
    setCarregando(true); setMsg(''); setItens([]);
    API.get(`/contabilidade/nf-pasta/scan?sub=${encodeURIComponent(sub)}`).then(r => setItens(r.data.itens || [])).catch(e => setMsg(e.response?.data?.erro || 'Erro no scan.')).finally(() => setCarregando(false));
  };
  const vincular = (it) => API.post('/contabilidade/nf-pasta/vincular', { caminho: it.caminho, contapagar_id: it.match.contapagar_id }).then(() => { it._vinc = true; setItens(x => [...x]); }).catch(e => window.alert(e.response?.data?.erro || 'Erro.'));
  const vincularTodos = async () => {
    const alvo = itens.filter(i => i.match && !i._vinc && !i.ja_vinculado);
    if (!alvo.length) { setMsg('Nenhum item casado para vincular.'); return; }
    if (!window.confirm(`Vincular ${alvo.length} nota(s) aos contas a pagar que casaram?`)) return;
    for (const it of alvo) { try { await API.post('/contabilidade/nf-pasta/vincular', { caminho: it.caminho, contapagar_id: it.match.contapagar_id }); it._vinc = true; } catch (e) { /* segue */ } }
    setItens(x => [...x]); setMsg('✅ Vinculação concluída.');
  };

  const casaram = itens.filter(i => i.match).length;
  const semCruz = itens.filter(i => i.ehNf && i.valor != null && !i.match).length; // NF na pasta sem par no contas a pagar
  const semValor = itens.filter(i => i.ehNf && i.valor == null).length;
  const naoNf = itens.filter(i => !i.ehNf).length;
  const itensVis = itens.filter(i => {
    if (fImp === 'casaram') return !!i.match;
    if (fImp === 'semcruz') return i.ehNf && i.valor != null && !i.match;
    if (fImp === 'semvalor') return i.ehNf && i.valor == null;
    if (fImp === 'naonf') return !i.ehNf;
    return true;
  });
  const fBtn = (k, label, cor) => <button onClick={() => setFImp(k)} style={{ fontSize: 12, fontWeight: 600, padding: '4px 9px', borderRadius: 16, cursor: 'pointer', border: '1px solid ' + (fImp === k ? (cor || '#1d4ed8') : '#e5e7eb'), background: fImp === k ? (cor || '#1d4ed8') : '#fff', color: fImp === k ? '#fff' : '#475569' }}>{label}</button>;
  return (
    <>
      <p style={s.sub}>Lê as NFs da <b>pasta do OneDrive já sincronizada no PC</b>, extrai número/CNPJ/valor e <b>casa com o contas a pagar</b> (por valor + CNPJ). Depois é só vincular — a nota passa a contar como "com NF" no extrato.</p>
      <div style={s.card}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Caminho da pasta raiz (ex.: C:/Users/voce/OneDrive/Notas Fiscais 1)</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...s.inp, flex: 1, minWidth: 320 }} value={base} onChange={e => setBase(e.target.value)} placeholder="C:/Users/.../OneDrive/Notas Fiscais 1" />
          <button style={{ ...s.btn, background: '#1d4ed8', color: '#fff', borderColor: '#1d4ed8' }} onClick={salvarBase}>Salvar caminho</button>
        </div>
        {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#15803d' : '#b91c1c', marginTop: 6 }}>{msg}</div>}
      </div>
      {baseSalva && (
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <b style={{ fontSize: 13 }}>📂 {sub || '(raiz)'}</b>
            {sub && <button style={{ ...s.btn, padding: '3px 8px', fontSize: 12 }} onClick={subir}>⬆️ voltar</button>}
            <div style={{ flex: 1 }} />
            <button style={{ ...s.btn, background: '#0d6b5e', color: '#fff', borderColor: '#0d6b5e' }} onClick={scan} disabled={carregando}>{carregando ? 'Lendo…' : '🔎 Ler NFs desta pasta (com subpastas)'}</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pastas.map(p => <button key={p} style={{ ...s.btn, padding: '5px 10px', fontSize: 12 }} onClick={() => entrar(p)}>📁 {p}</button>)}
            {!pastas.length && <span style={{ fontSize: 12, color: '#94a3b8' }}>Sem subpastas aqui — clique em "Ler NFs".</span>}
          </div>
        </div>
      )}
      {itens.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0 10px', flexWrap: 'wrap' }}>
            {fBtn('todos', `Todos (${itens.length})`)}
            {fBtn('casaram', `✓ Casaram (${casaram})`, '#15803d')}
            {fBtn('semcruz', `⚠️ NF sem cruzamento (${semCruz})`, '#b91c1c')}
            {fBtn('semvalor', `Sem valor lido (${semValor})`, '#b45309')}
            {fBtn('naonf', `Não é NF (${naoNf})`, '#64748b')}
            <div style={{ flex: 1 }} />
            <button style={{ ...s.btn, background: '#15803d', color: '#fff', borderColor: '#15803d' }} onClick={vincularTodos}>✓ Vincular todos que casaram</button>
          </div>
          {fImp === 'semcruz' && <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>⚠️ Essas NFs estão na pasta mas <b>não acharam par no contas a pagar</b> — pode ser lançamento faltando no Alpha, valor divergente, ou já vinculadas. Confira no ERP.</div>}
          <ScrollX>
            <table style={s.tbl}>
              <thead><tr>{['Arquivo', 'Pasta', 'É NF?', 'Valor lido', 'Casa com (contas a pagar)', 'Ação'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {itensVis.map((it, i) => (
                  <tr key={i}>
                    <td style={s.td} title={it.arquivo}>{it.arquivo.length > 26 ? it.arquivo.slice(0, 24) + '…' : it.arquivo}</td>
                    <td style={s.td}>{it.pasta}</td>
                    <td style={s.td}>{it.ehNf ? <span style={{ color: '#15803d' }}>✓ NF{it.numero ? ' ' + it.numero : ''}</span> : (it.temTexto ? <span style={{ color: '#b45309' }}>não é NF</span> : <span style={{ color: '#b91c1c' }}>⚠️ imagem</span>)}</td>
                    <td style={s.tdNum}>{it.valor != null ? brl(it.valor) : '—'}</td>
                    <td style={s.td}>{it.match ? <span>{(it.match.fornecedor || '').slice(0, 24)} · {brl(it.match.valor)} <span style={{ color: '#94a3b8', fontSize: 11 }}>doc {it.match.numerodocumento || '—'}</span></span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={s.td}>{it._vinc || it.ja_vinculado ? <span style={{ color: '#15803d', fontWeight: 600 }}>✓ vinculado</span> : it.match ? <button style={{ ...s.btn, padding: '3px 8px', fontSize: 12 }} onClick={() => vincular(it)}>vincular</button> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        </>
      )}
    </>
  );
}

// ============================ NF / PENDÊNCIAS (aba dedicada) ============================
// Mostra todas as NFs da pasta que AINDA NÃO foram vinculadas a um título = pendências.
// Lê as digitais (texto) e as imagens (OCR via Claude). Vincula: 1-clique se casou, manual se não.
function PendenciasNf({ API }) {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [ocr, setOcr] = useState(true);
  const [msg, setMsg] = useState('');
  const [so, setSo] = useState('pend'); // pend (não vinculadas) | casaram | semcruz | todos
  const [buscaId, setBuscaId] = useState(null); // caminho do item em vínculo manual
  const [titulos, setTitulos] = useState([]);
  const [bq, setBq] = useState('');

  const scan = useCallback(() => {
    setCarregando(true); setMsg(''); setItens([]);
    API.get(`/contabilidade/nf-pasta/scan?${ocr ? 'ocr=1' : ''}`).then(r => {
      setItens(r.data.itens || []);
      const la = r.data.lidosAgora || 0, dc = r.data.doCache || 0;
      setMsg(`✅ ${r.data.total} nota(s): ${dc} já lidas (do cache) + ${la} lidas agora. O que foi lido fica salvo — na próxima é instantâneo.`);
    }).catch(e => setMsg(e.response?.data?.erro || 'Erro no scan. Configure a pasta em Extrato → Importar NFs.')).finally(() => setCarregando(false));
  }, [API, ocr]);

  const naoVinc = itens.filter(i => i.ehNf && !i._vinc && !i.ja_vinculado);
  const casaram = naoVinc.filter(i => i.match);
  const semcruz = naoVinc.filter(i => !i.match);
  const vis = so === 'casaram' ? casaram : so === 'semcruz' ? semcruz : so === 'todos' ? itens : naoVinc;

  const vincular = (it, contapagar_id) => API.post('/contabilidade/nf-pasta/vincular', { caminho: it.caminho, contapagar_id }).then(() => { it._vinc = true; setItens(x => [...x]); setBuscaId(null); }).catch(e => window.alert(e.response?.data?.erro || 'Erro.'));
  const vincularTodosCasaram = async () => {
    if (!casaram.length) { setMsg('Nenhuma casada para vincular.'); return; }
    if (!window.confirm(`Vincular ${casaram.length} nota(s) que casaram?`)) return;
    for (const it of casaram) { try { await API.post('/contabilidade/nf-pasta/vincular', { caminho: it.caminho, contapagar_id: it.match.contapagar_id }); it._vinc = true; } catch { /* segue */ } }
    setItens(x => [...x]); setMsg('✅ Vinculação concluída.');
  };
  const abrirManual = (it) => { setBuscaId(it.caminho); setBq(it.fornecedor || ''); buscarTitulos(it.fornecedor || '', it.valor); };
  const buscarTitulos = (q, valor) => { const p = new URLSearchParams(); if (q) p.set('q', q); if (valor != null) p.set('valor', valor); API.get(`/contabilidade/nf-pasta/titulos?${p.toString()}`).then(r => setTitulos(r.data.titulos || [])).catch(() => setTitulos([])); };

  const fBtn = (k, label, cor) => <button onClick={() => setSo(k)} style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 16, cursor: 'pointer', border: '1px solid ' + (so === k ? (cor || '#0d6b5e') : '#e5e7eb'), background: so === k ? (cor || '#0d6b5e') : '#fff', color: so === k ? '#fff' : '#475569' }}>{label}</button>;

  return (
    <>
      <p style={s.sub}>Todas as notas da pasta do OneDrive que <b>ainda não foram vinculadas</b> a um título = pendências. Lê as digitais direto e as <b>imagens/fotos pela visão do Claude (OCR)</b>, trazendo valor e fornecedor. Vincule em 1 clique quando casou, ou busque o título na mão.</p>
      <div style={s.filtros}>
        <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 6 }}><input type="checkbox" checked={ocr} onChange={e => setOcr(e.target.checked)} /> Ler imagens com OCR (Claude)</label>
        <button style={{ ...s.btn, background: '#0d6b5e', color: '#fff', borderColor: '#0d6b5e' }} onClick={scan} disabled={carregando}>{carregando ? 'Lendo a pasta…' : '🔎 Ler pasta e listar pendências'}</button>
        {!!casaram.length && <button style={{ ...s.btn, background: '#15803d', color: '#fff', borderColor: '#15803d', marginLeft: 'auto' }} onClick={vincularTodosCasaram}>✓ Vincular todas que casaram ({casaram.length})</button>}
      </div>
      {msg && <div style={{ fontSize: 13, color: msg.startsWith('✅') ? '#15803d' : '#b91c1c', marginBottom: 10 }}>{msg}</div>}
      {carregando && <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>Lendo os PDFs (com OCR nas imagens, pode levar 1–2 min)…</div>}

      {itens.length > 0 && (
        <>
          <div style={s.cards}>
            <div style={s.card}><div style={s.cardLab}>Pendentes (não vinculadas)</div><div style={{ ...s.cardVal, color: '#b45309' }}>{naoVinc.length}</div></div>
            <div style={s.card}><div style={s.cardLab}>Casaram (1 clique)</div><div style={{ ...s.cardVal, color: '#15803d' }}>{casaram.length}</div></div>
            <div style={s.card}><div style={s.cardLab}>Sem cruzamento (manual)</div><div style={{ ...s.cardVal, color: '#b91c1c' }}>{semcruz.length}</div></div>
            <div style={s.card}><div style={s.cardLab}>Lidas por OCR</div><div style={{ ...s.cardVal, color: '#4338ca' }}>{itens.filter(i => i.via_ocr).length}</div></div>
          </div>
          <div style={{ display: 'flex', gap: 6, margin: '4px 0 10px', flexWrap: 'wrap' }}>
            {fBtn('pend', `Pendentes (${naoVinc.length})`, '#b45309')}
            {fBtn('casaram', `✓ Casaram (${casaram.length})`, '#15803d')}
            {fBtn('semcruz', `⚠️ Sem cruzamento (${semcruz.length})`, '#b91c1c')}
            {fBtn('todos', `Todas (${itens.length})`)}
          </div>
          <ScrollX>
            <table style={s.tbl}>
              <thead><tr>{['Arquivo', 'Pasta', 'Origem', 'NF nº', 'Fornecedor (lido)', 'Valor', 'Casa com (título)', 'Ação'].map(h => <th key={h} style={h === 'Valor' ? { ...s.th, textAlign: 'right' } : s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {vis.map((it, i) => (
                  <React.Fragment key={i}>
                    <tr>
                      <td style={s.td} title={it.arquivo}>{it.arquivo.length > 24 ? it.arquivo.slice(0, 22) + '…' : it.arquivo}</td>
                      <td style={s.td}>{it.pasta}</td>
                      <td style={s.td}>{!it.ehNf ? <span style={{ color: '#94a3b8' }}>não é NF</span> : it.via_ocr ? <span style={s.pill({ bg: '#e0e7ff', fg: '#4338ca' })}>OCR</span> : <span style={s.pill({ bg: '#dcfce7', fg: '#15803d' })}>texto</span>}</td>
                      <td style={s.td}>{it.numero || '—'}</td>
                      <td style={s.td}>{(it.fornecedor || '').slice(0, 26) || '—'}</td>
                      <td style={s.tdNum}>{it.valor != null ? brl(it.valor) : '—'}</td>
                      <td style={s.td}>{it.match ? <span>{(it.match.fornecedor || '').slice(0, 22)} · {brl(it.match.valor)} <span style={{ color: '#94a3b8', fontSize: 11 }}>doc {it.match.numerodocumento || '—'}</span></span> : <span style={{ color: '#cbd5e1' }}>— sem par —</span>}</td>
                      <td style={s.td}>{it._vinc || it.ja_vinculado ? <span style={{ color: '#15803d', fontWeight: 600 }}>✓ vinculado</span> : it.match ? <button style={{ ...s.btn, padding: '3px 8px', fontSize: 12 }} onClick={() => vincular(it, it.match.contapagar_id)}>vincular</button> : <button style={{ ...s.btn, padding: '3px 8px', fontSize: 12, color: '#0d6b5e', borderColor: '#0d6b5e' }} onClick={() => abrirManual(it)}>🔗 manual</button>}</td>
                    </tr>
                    {buscaId === it.caminho && (
                      <tr><td colSpan={8} style={{ ...s.td, background: '#f8fafc' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                          <b style={{ fontSize: 12 }}>Buscar título p/ vincular:</b>
                          <input style={{ ...s.inp, minWidth: 220 }} value={bq} onChange={e => setBq(e.target.value)} placeholder="fornecedor ou documento" />
                          <button style={{ ...s.btn, padding: '5px 10px', fontSize: 12 }} onClick={() => buscarTitulos(bq, null)}>Buscar</button>
                          <button style={{ ...s.btn, padding: '5px 10px', fontSize: 12 }} onClick={() => buscarTitulos(bq, it.valor)}>Buscar por valor ({it.valor != null ? brl(it.valor) : '—'})</button>
                          <button style={{ ...s.btn, padding: '5px 10px', fontSize: 12, color: '#b91c1c' }} onClick={() => setBuscaId(null)}>fechar</button>
                        </div>
                        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                          {titulos.map(t => (
                            <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                              <span style={{ flex: 1 }}>{t.fornecedor || '—'} · doc {t.numerodocumento || '—'} · {t.data}</span>
                              <span style={{ fontWeight: 700 }}>{brl(t.valor)}</span>
                              <button style={{ ...s.btn, padding: '3px 8px', fontSize: 12, background: '#0d6b5e', color: '#fff', borderColor: '#0d6b5e' }} onClick={() => vincular(it, t.id)}>vincular</button>
                            </div>
                          ))}
                          {!titulos.length && <div style={{ padding: 10, fontSize: 12, color: '#94a3b8' }}>Nenhum título encontrado — ajuste a busca.</div>}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
                {!vis.length && <tr><td colSpan={8} style={{ ...s.td, textAlign: 'center', color: '#94a3b8', padding: 20 }}>Nada aqui neste filtro.</td></tr>}
              </tbody>
            </table>
          </ScrollX>
        </>
      )}
      {!itens.length && !carregando && <div style={{ ...s.card, textAlign: 'center', color: '#64748b' }}>Clique em <b>"Ler pasta e listar pendências"</b> para começar.</div>}
    </>
  );
}

// ============================ SEM NOTA (PERDA) — apuração + classificação na hora ============================
const MOTIVOS_NE = ['Imposto', 'Folha de pagamento', 'Sócio (retirada)', 'Compra internacional', 'Aluguel/Sistema', 'Fórmula', 'Estágio', 'Banco/Tarifas', 'Recarga', 'Pessoa física', 'Outro'];
function PerdaApuracao({ API }) {
  const [loja, setLoja] = useState('');
  const [de, setDe] = useState(fimDoMes(mesAtual).slice(0, 8) + '01');
  const [ate, setAte] = useState(hojeStr);
  const [grupos, setGrupos] = useState([]);
  const [total, setTotal] = useState(0);
  const [mot, setMot] = useState({}); // chave linha -> motivo escolhido
  const [carregando, setCarregando] = useState(false);
  const [planos, setPlanos] = useState([]);
  const [verPlanos, setVerPlanos] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    const p = new URLSearchParams(); if (loja) p.set('loja', loja); if (de) p.set('de', de); if (ate) p.set('ate', ate);
    API.get(`/contabilidade/perda?${p.toString()}`).then(r => { setGrupos(r.data.grupos || []); setTotal(r.data.total || 0); }).catch(() => {}).finally(() => setCarregando(false));
    API.get('/contabilidade/planos-sem-nf').then(r => setPlanos(r.data.planos || [])).catch(() => {});
  }, [API, loja, de, ate]);
  useEffect(() => { carregar(); }, [carregar]);

  const motDe = (g, i) => mot[i] || g.sugestao || 'Outro';
  const classForn = (g, i) => API.put(`/contabilidade/fornecedores/${g.pessoa_id}`, { nome: g.fornecedor, emite_nf: 0, motivo: motDe(g, i) }).then(carregar).catch(() => {});
  const classPlano = (g, i) => { if (!g.plano) return; API.post('/contabilidade/planos-sem-nf', { termo: g.plano, motivo: motDe(g, i) }).then(carregar).catch(() => {}); };
  const removerPlano = (termo) => API.delete(`/contabilidade/planos-sem-nf/${encodeURIComponent(termo)}`).then(carregar).catch(() => {});

  return (
    <>
      <p style={s.sub}>Apuração do que está contando como <b>sem nota (perda fiscal)</b>. O que <b>não tem NF por natureza</b> (folha, impostos, sócio, estágio…) deve sair daqui — classifique na hora <b>por fornecedor</b> (vale só pra ele) ou <b>por plano de contas</b> (vale pra todos do mesmo plano). O que sobrar é a perda real a resolver.</p>
      <div style={s.filtros}>
        <div style={s.lab}>Lojas<MultiLojaSelect value={loja} onChange={setLoja} compact /></div>
        <div style={s.lab}>De<input type="date" style={s.inp} value={de} onChange={e => setDe(e.target.value)} /></div>
        <div style={s.lab}>Até<input type="date" style={s.inp} value={ate} onChange={e => setAte(e.target.value)} /></div>
        <button style={s.btn} onClick={carregar} disabled={carregando}>{carregando ? 'Carregando…' : '🔎 Aplicar'}</button>
        <div style={{ flex: 1 }} />
        <button style={s.btn} onClick={() => baixarCsv('sem-nota-perda.csv', [
          { h: 'Loja', f: g => g.loja }, { h: 'Fornecedor', f: g => g.fornecedor }, { h: 'Plano de contas', f: g => g.plano || '' },
          { h: 'Títulos', f: g => g.n }, { h: 'Valor', f: g => g.valor },
        ], grupos)} disabled={!grupos.length}>⬇️ Excel (CSV)</button>
        <button style={s.btn} onClick={() => setVerPlanos(v => !v)}>⚙️ Planos sem NF ({planos.length})</button>
      </div>

      <div style={s.cards}>
        <div style={s.card}><div style={s.cardLab}>Perda real (a resolver)</div><div style={{ ...s.cardVal, color: '#b91c1c' }}>{brl(total)}</div><div style={s.cardLab}>{grupos.length} fornecedor(es)/plano(s)</div></div>
      </div>

      {verPlanos && (
        <div style={{ ...s.card, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Planos de contas marcados como “sem NF”</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {planos.map((p, i) => <span key={i} style={{ fontSize: 12, background: '#f1f5f9', borderRadius: 16, padding: '3px 10px', display: 'flex', gap: 6, alignItems: 'center' }}>{p.termo} <span style={{ color: '#94a3b8' }}>({p.motivo})</span> <button style={{ border: 0, background: 'none', color: '#b91c1c', cursor: 'pointer' }} onClick={() => removerPlano(p.termo)}>✕</button></span>)}
            {!planos.length && <span style={{ fontSize: 12, color: '#94a3b8' }}>Nenhum ainda.</span>}
          </div>
        </div>
      )}

      <ScrollX>
        <table style={s.tbl}>
          <thead><tr>{['Loja', 'Fornecedor', 'Plano de contas', 'Títulos', 'Valor', 'Motivo', 'Classificar'].map(h => <th key={h} style={h === 'Valor' || h === 'Títulos' ? { ...s.th, textAlign: 'right' } : s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {grupos.map((g, i) => (
              <tr key={i}>
                <td style={s.td}>{g.loja}</td>
                <td style={s.td}>{g.fornecedor || '—'}</td>
                <td style={{ ...s.td, color: g.plano ? '#334155' : '#cbd5e1' }}>{g.plano || '— sem plano —'}</td>
                <td style={s.tdNum}>{g.n}</td>
                <td style={{ ...s.tdNum, color: '#b91c1c', fontWeight: 700 }}>{brl(g.valor)}</td>
                <td style={s.td}>
                  <select value={mot[i] || ''} onChange={e => setMot(m => ({ ...m, [i]: e.target.value }))} style={{ ...s.inp, padding: '4px 6px', minWidth: 140 }}>
                    <option value="">— motivo —</option>
                    {MOTIVOS_NE.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </td>
                <td style={s.td}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button style={{ ...s.btn, padding: '4px 8px', fontSize: 12 }} disabled={!mot[i]} title="Marca só este fornecedor como não-emite" onClick={() => classForn(g, i)}>fornecedor</button>
                    <button style={{ ...s.btn, padding: '4px 8px', fontSize: 12, color: '#0d6b5e', borderColor: '#0d6b5e' }} disabled={!mot[i] || !g.plano} title="Marca o plano de contas (vale pra todos deste plano)" onClick={() => classPlano(g, i)}>este plano</button>
                  </div>
                </td>
              </tr>
            ))}
            {!grupos.length && !carregando && <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color: '#15803d', padding: 24 }}>🎉 Nenhuma perda não classificada no período.</td></tr>}
          </tbody>
        </table>
      </ScrollX>
      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>Escolha o motivo e clique em <b>fornecedor</b> (só ele) ou <b>este plano</b> (todos do mesmo plano — ideal pra folha/impostos). O item sai da perda na hora.</p>
    </>
  );
}

// ============================ PAINEL / BI (tela central da Contabilidade) ============================
function PainelBI({ API }) {
  const [loja, setLoja] = useState('');
  const [de, setDe] = useState(fimDoMes(mesAtual).slice(0, 8) + '01');
  const [ate, setAte] = useState(hojeStr);
  const [bi, setBi] = useState({ total: { valor: 0, com_valor: 0, sem_valor: 0, nao_emite_valor: 0, pct: null }, por_loja: [], por_motivo: [] });
  const [orc, setOrc] = useState({ linhas: [], total: { verba: 0, gasto: 0, saldo: 0 } });
  const [pasta, setPasta] = useState(null);
  const [pastaLoading, setPastaLoading] = useState(false);
  const [drill, setDrill] = useState(null); // { bucket, label, itens, total, carregando }
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  const abrirDrill = (seg) => {
    setDrill({ bucket: seg.bucket, label: seg.label, itens: [], total: 0, carregando: true });
    const p = new URLSearchParams(); p.set('bucket', seg.bucket); if (loja) p.set('loja', loja); if (de) p.set('de', de); if (ate) p.set('ate', ate);
    API.get(`/contabilidade/bi/detalhe?${p.toString()}`).then(r => setDrill({ bucket: seg.bucket, label: seg.label, itens: r.data.itens || [], total: r.data.total || 0, carregando: false })).catch(() => setDrill(d => d && { ...d, carregando: false }));
  };

  const conferirPasta = useCallback(() => {
    setPastaLoading(true); setPasta(null);
    const p = new URLSearchParams(); if (de) p.set('de', de); if (ate) p.set('ate', ate);
    API.get(`/contabilidade/nf-pasta/resumo?${p.toString()}`).then(r => setPasta(r.data)).catch(e => setPasta({ erro: e.response?.data?.erro || 'Erro ao conferir a pasta.' })).finally(() => setPastaLoading(false));
  }, [API, de, ate]);

  const carregar = useCallback(() => {
    setCarregando(true); setErro(null);
    const p = new URLSearchParams(); if (loja) p.set('loja', loja); if (de) p.set('de', de); if (ate) p.set('ate', ate);
    API.get(`/contabilidade/bi?${p.toString()}`).then(r => setBi(r.data)).catch(e => setErro(e.response?.data?.erro || 'Erro.')).finally(() => setCarregando(false));
    API.get(`/contabilidade/orcamento/resumo?${p.toString()}`).then(r => setOrc(r.data)).catch(() => {});
  }, [API, loja, de, ate]);
  useEffect(() => { carregar(); }, [carregar]);

  const t = bi.total || {};
  const corPct = p => (p ?? 0) >= 80 ? '#15803d' : (p ?? 0) >= 50 ? '#b45309' : '#b91c1c';
  return (
    <>
      <p style={s.sub}>Panorama fiscal das despesas (contas a pagar) no período: <b>quanto está com nota fiscal × sem nota</b> — o que está sem nota é perda de aproveitamento fiscal. Conta a NF de entrada do ERP e as notas de serviço anexadas no extrato.</p>
      <div style={s.filtros}>
        <div style={s.lab}>Lojas<MultiLojaSelect value={loja} onChange={setLoja} compact /></div>
        <div style={s.lab}>De<input type="date" style={s.inp} value={de} onChange={e => setDe(e.target.value)} /></div>
        <div style={s.lab}>Até<input type="date" style={s.inp} value={ate} onChange={e => setAte(e.target.value)} /></div>
        <div style={s.lab}>Fim do mês<input type="month" style={s.inp} defaultValue={mesAtual} onChange={e => { if (e.target.value) { setDe(e.target.value + '-01'); setAte(fimDoMes(e.target.value)); } }} /></div>
        <button style={s.btn} onClick={carregar}>🔎 Aplicar</button>
      </div>
      {erro && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>{erro}</div>}

      {(() => { const base = (t.valor || 0) || 1; const w = v => Math.max(0, Math.round((v || 0) / base * 1000) / 10); return (
      <div style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={s.cardLab}>% com nota fiscal <span style={{ fontWeight: 400 }}>(entre quem deve emitir)</span></div>
          <div style={{ fontSize: 44, fontWeight: 700, color: corPct(t.pct), fontVariantNumeric: 'tabular-nums' }}>{t.pct != null ? t.pct + '%' : '—'}</div>
          <div style={s.cardLab}>{carregando ? 'carregando…' : 'período selecionado'}</div>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
            <div title={`Com nota: ${brl(t.com_valor)}`} style={{ width: w(t.com_valor) + '%', background: '#15803d' }} />
            <div title={`Sem nota (perda): ${brl(t.sem_valor)}`} style={{ width: w(t.sem_valor) + '%', background: '#fca5a5' }} />
            <div title={`Não emite: ${brl(t.nao_emite_valor)}`} style={{ flex: 1, background: '#cbd5e1' }} />
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, marginTop: 6 }}>
            <span style={{ color: '#15803d', fontWeight: 600 }}>✓ com nota {brl(t.com_valor)}</span>
            <span style={{ color: '#b91c1c', fontWeight: 600 }}>⚠️ sem nota {brl(t.sem_valor)}</span>
            <span style={{ color: '#64748b', fontWeight: 600 }}>● não emite {brl(t.nao_emite_valor)}</span>
          </div>
        </div>
      </div>
      ); })()}

      <div style={s.cards}>
        <div style={s.card}><div style={s.cardLab}>Total de despesas</div><div style={{ ...s.cardVal, color: '#0f172a' }}>{brl(t.valor)}</div></div>
        <div style={s.card}><div style={s.cardLab}>Com nota fiscal</div><div style={{ ...s.cardVal, color: '#15803d' }}>{brl(t.com_valor)}</div></div>
        <div style={s.card}><div style={s.cardLab}>Sem nota (perda fiscal)</div><div style={{ ...s.cardVal, color: '#b91c1c' }}>{brl(t.sem_valor)}</div></div>
        <div style={s.card}><div style={s.cardLab}>Não emite NF</div><div style={{ ...s.cardVal, color: '#64748b' }}>{brl(t.nao_emite_valor)}</div><div style={s.cardLab}>sócio/imposto/internacional</div></div>
      </div>

      {(() => {
        const palette = ['#64748b', '#0ea5e9', '#a855f7', '#f59e0b', '#14b8a6', '#ec4899', '#6366f1'];
        const segs = [
          { label: '✓ Com nota fiscal', valor: t.com_valor || 0, cor: '#15803d', bucket: 'com' },
          { label: '⚠️ Sem nota (perda fiscal)', valor: t.sem_valor || 0, cor: '#ef4444', bucket: 'perda' },
          ...(bi.por_motivo || []).map((m, i) => ({ label: '● ' + m.motivo, valor: m.valor || 0, cor: palette[i % palette.length], bucket: m.motivo })),
        ];
        return (
          <div style={s.card}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>📊 Composição das despesas <span style={{ fontWeight: 400, fontSize: 12, color: '#94a3b8' }}>— clique numa fatia pra ver o que tem dentro</span></div>
            <Donut segments={segs} onPick={abrirDrill} ativo={drill && drill.bucket} />
            {drill && (
              <div style={{ marginTop: 14, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <b style={{ fontSize: 13 }}>{drill.label}</b>
                  <span style={{ color: '#64748b', fontSize: 13 }}>{brl(drill.total)} · {drill.itens.length} item(ns)</span>
                  <button style={{ ...s.btn, padding: '3px 8px', fontSize: 12, marginLeft: 'auto' }} onClick={() => setDrill(null)}>fechar ✕</button>
                </div>
                <ScrollX>
                  <table style={s.tbl}>
                    <thead><tr>{['Loja', 'Fornecedor', 'Plano de contas', 'Títulos', 'Valor'].map(h => <th key={h} style={h === 'Valor' || h === 'Títulos' ? { ...s.th, textAlign: 'right' } : s.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {drill.carregando && <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }}>Carregando…</td></tr>}
                      {!drill.carregando && drill.itens.map((it, i) => (
                        <tr key={i}>
                          <td style={s.td}>{it.loja}</td>
                          <td style={s.td}>{it.fornecedor || '—'}</td>
                          <td style={{ ...s.td, color: it.plano ? '#334155' : '#cbd5e1' }}>{it.plano || '— sem plano —'}</td>
                          <td style={s.tdNum}>{it.n}</td>
                          <td style={{ ...s.tdNum, fontWeight: 700 }}>{brl(it.valor)}</td>
                        </tr>
                      ))}
                      {!drill.carregando && !drill.itens.length && <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }}>Sem itens.</td></tr>}
                    </tbody>
                  </table>
                </ScrollX>
              </div>
            )}
          </div>
        );
      })()}

      <div style={{ ...s.card, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700 }}>📂 Conferência da pasta do OneDrive</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Lê os PDFs da pasta e cruza com os títulos sem nota do período — mostra quanto dá pra recuperar vinculando.</div>
        </div>
        <button style={{ ...s.btn, background: '#0d6b5e', color: '#fff', borderColor: '#0d6b5e' }} onClick={conferirPasta} disabled={pastaLoading}>{pastaLoading ? 'Conferindo…' : '🔎 Conferir pasta'}</button>
        {pasta && !pasta.erro && (
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', width: '100%', borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
            <div><div style={s.cardLab}>PDFs lidos</div><div style={{ fontSize: 20, fontWeight: 700 }}>{pasta.total_pdfs}</div></div>
            <div><div style={s.cardLab}>São nota fiscal</div><div style={{ fontSize: 20, fontWeight: 700 }}>{pasta.total_nf}</div></div>
            <div><div style={s.cardLab}>Casaram c/ título</div><div style={{ fontSize: 20, fontWeight: 700, color: '#15803d' }}>{pasta.casaram}</div></div>
            <div><div style={s.cardLab}>Recuperável (vincular)</div><div style={{ fontSize: 20, fontWeight: 700, color: '#15803d' }}>{brl(pasta.recuperavel)}</div></div>
            <div><div style={s.cardLab}>NF sem cruzamento</div><div style={{ fontSize: 20, fontWeight: 700, color: '#b45309' }}>{pasta.sem_cruzamento}</div></div>
            <div><div style={s.cardLab}>PDF sem texto (OCR)</div><div style={{ fontSize: 20, fontWeight: 700, color: '#94a3b8' }}>{pasta.sem_texto}</div></div>
            <div style={{ width: '100%', fontSize: 12, color: '#64748b' }}>Pra vincular uma a uma: aba <b>💳 Extrato</b> → <b>📂 Importar NFs da pasta</b>.</div>
          </div>
        )}
        {pasta && pasta.erro && <div style={{ width: '100%', color: '#b91c1c', fontSize: 13 }}>{pasta.erro}{pasta.semPasta ? ' (configure em 💳 Extrato → Importar NFs da pasta)' : ''}</div>}
      </div>

      {(bi.por_motivo || []).length > 0 && (
        <div style={{ ...s.card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Não emite NF, por motivo:</span>
          {bi.por_motivo.map((m, i) => <span key={i} style={{ fontSize: 12, fontWeight: 600, background: '#f1f5f9', color: '#475569', borderRadius: 20, padding: '3px 10px' }}>{m.motivo}: {brl(m.valor)}</span>)}
          <span style={{ fontSize: 11, color: '#94a3b8' }}>· defina em 🏭 Fornecedores</span>
        </div>
      )}

      <div style={{ fontWeight: 700, fontSize: 14, margin: '6px 0 8px' }}>Por loja</div>
      <ScrollX>
        <table style={s.tbl}>
          <thead><tr>{['Loja', 'Despesas', 'Com nota', 'Sem nota', '% com nota'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {(bi.por_loja || []).map((L, i) => (
              <tr key={i}>
                <td style={s.td}>{L.loja}</td>
                <td style={s.tdNum}>{brl(L.valor)}</td>
                <td style={{ ...s.tdNum, color: '#15803d' }}>{brl(L.com_valor)}</td>
                <td style={{ ...s.tdNum, color: '#b91c1c' }}>{brl(L.sem_valor)}</td>
                <td style={s.td}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 70, height: 8, borderRadius: 4, background: '#fca5a5', overflow: 'hidden' }}><div style={{ width: (L.pct || 0) + '%', height: '100%', background: '#15803d' }} /></div><span style={{ fontSize: 12, fontWeight: 600, color: corPct(L.pct) }}>{L.pct != null ? L.pct + '%' : '—'}</span></div></td>
              </tr>
            ))}
            {!(bi.por_loja || []).length && !carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={5}>Sem despesas no período.</td></tr>}
            {carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={5}>Carregando…</td></tr>}
          </tbody>
        </table>
      </ScrollX>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>💡 Pra subir o % com nota: vá em <b>Extrato de contas</b> e anexe as notas de serviço (📂 Importar NFs da pasta traz várias de uma vez).</div>

      {(() => { const to = orc.total || {}; const pct = to.verba > 0 ? Math.round((to.gasto / to.verba) * 1000) / 10 : null; return (
      <div style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, margin: '6px 0 10px' }}>💰 Orçamento das lojas <span style={{ fontWeight: 400, fontSize: 12, color: '#94a3b8' }}>(conta “Orçamento” do ERP — verba × gasto × saldo)</span></div>
        <div style={s.cards}>
          <div style={s.card}><div style={s.cardLab}>Verba (escritório)</div><div style={{ ...s.cardVal, color: '#0f172a' }}>{brl(to.verba)}</div></div>
          <div style={s.card}><div style={s.cardLab}>Gasto (gerentes)</div><div style={{ ...s.cardVal, color: '#b45309' }}>{brl(to.gasto)}</div></div>
          <div style={s.card}><div style={s.cardLab}>Saldo</div><div style={{ ...s.cardVal, color: (to.saldo || 0) >= 0 ? '#15803d' : '#b91c1c' }}>{brl(to.saldo)}</div></div>
          <div style={s.card}><div style={s.cardLab}>% consumido</div><div style={{ ...s.cardVal, color: (pct >= 100 ? '#b91c1c' : pct >= 85 ? '#b45309' : '#15803d') }}>{pct != null ? pct + '%' : '—'}</div></div>
        </div>
        <ScrollX>
          <table style={s.tbl}>
            <thead><tr>{['Loja', 'Verba', 'Gasto', 'Saldo', '% consumido'].map(h => <th key={h} style={h === 'Loja' || h === '% consumido' ? s.th : { ...s.th, textAlign: 'right' }}>{h}</th>)}</tr></thead>
            <tbody>
              {(orc.linhas || []).map((L, i) => (
                <tr key={i}>
                  <td style={{ ...s.td, fontWeight: 600 }}>{L.loja}</td>
                  <td style={s.tdNum}>{brl(L.verba)}</td>
                  <td style={{ ...s.tdNum, color: '#b45309' }}>{brl(L.gasto)}</td>
                  <td style={{ ...s.tdNum, fontWeight: 700, color: (L.saldo || 0) >= 0 ? '#15803d' : '#b91c1c' }}>{brl(L.saldo)}</td>
                  <td style={s.td}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 70, height: 8, borderRadius: 4, background: '#e2e8f0', overflow: 'hidden' }}><div style={{ width: Math.min(100, L.pct_gasto || 0) + '%', height: '100%', background: (L.pct_gasto || 0) >= 100 ? '#b91c1c' : (L.pct_gasto || 0) >= 85 ? '#b45309' : '#0d6b5e' }} /></div><span style={{ fontSize: 12, fontWeight: 600, color: (L.pct_gasto || 0) >= 100 ? '#b91c1c' : (L.pct_gasto || 0) >= 85 ? '#b45309' : '#15803d' }}>{L.pct_gasto != null ? L.pct_gasto + '%' : '—'}</span></div></td>
                </tr>
              ))}
              {!(orc.linhas || []).length && !carregando && <tr><td style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }} colSpan={5}>Sem movimento de orçamento no período.</td></tr>}
            </tbody>
          </table>
        </ScrollX>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Detalhe e gasto por categoria na aba <b>💰 Orçamento</b>.</div>
      </div>
      ); })()}
    </>
  );
}


// ── SPED / EFD — repositório pra contabilidade baixar (o Alpha gera, sobe aqui, o contador pega) ──
const ROT_TIPO_SPED = { fiscal: 'SPED Fiscal (ICMS/IPI)', contribuicoes: 'SPED Contribuições (PIS/COFINS)', ecd: 'ECD (Contábil)', outro: 'Outro' };
const ROT_ETAPA = { envio: 'Envio (dia 01)', retorno: 'Retorno da contab.', corrigido: 'Corrigido (dia 10)', final: 'Final / entregue' };
const kb = n => !n ? '—' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
// linha técnica do Espião: código HTTP · endpoint · qual token está carregado (impressão digital, não o valor) · hora
function espiaoTecnico(d) {
  if (!d) return '';
  const tk = d.tokens || {};
  const hora = d.em ? new Date(d.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  return [d.codigo || (d.status ? 'HTTP ' + d.status : ''), d.endpoint,
    `token conta #${tk.conta || 'ausente'} · usuário #${tk.usuario || 'ausente'}`, hora && 'testado às ' + hora].filter(Boolean).join(' · ');
}
// erro de chamada ao backend → texto com o código HTTP (inclui resposta em blob, como a do download de XML)
async function espiaoErroTexto(e, padrao) {
  const r = e && e.response;
  if (!r) return `${padrao} (sem resposta do servidor: ${(e && e.message) || 'rede'})`;
  let d = r.data;
  if (d instanceof Blob) { try { d = JSON.parse(await d.text()); } catch { d = null; } }
  const msg = (d && d.erro) || padrao;
  return /HTTP \d{3}/.test(msg) ? msg : `${msg} (HTTP ${r.status})`;
}

export function SpedRepo({ API }) {
  const [arquivos, setArquivos] = useState([]);
  const [lojas, setLojas] = useState([]);
  const [fCompetencia, setFCompetencia] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [competencias, setCompetencias] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [msg, setMsg] = useState('');
  const [arq, setArq] = useState(null);
  const [det, setDet] = useState(null);
  const [competencia, setCompetencia] = useState('');
  const [loja, setLoja] = useState('');
  const [tipo, setTipo] = useState('fiscal');
  const [etapa, setEtapa] = useState('envio');
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sub, setSub] = useState('arquivos'); // arquivos | correcao
  const [espiaoStatus, setEspiaoStatus] = useState(null);
  const [cruzando, setCruzando] = useState(null); // id em processamento
  const [espiaoResult, setEspiaoResult] = useState(null);

  const carregar = useCallback(() => {
    setCarregando(true); setErro(null);
    const p = new URLSearchParams();
    if (fCompetencia) p.set('competencia', fCompetencia);
    if (fTipo) p.set('tipo', fTipo);
    API.get(`/contabilidade/sped?${p.toString()}`).then(r => setArquivos(r.data.arquivos || []))
      .catch(e => setErro(e.response?.data?.erro || 'Erro ao carregar.')).finally(() => setCarregando(false));
    API.get('/contabilidade/sped/competencias').then(r => setCompetencias(r.data.competencias || [])).catch(() => {});
  }, [API, fCompetencia, fTipo]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/contabilidade/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  const [testandoEspiao, setTestandoEspiao] = useState(false);
  const testarEspiao = useCallback(() => {
    setTestandoEspiao(true);
    return API.get('/contabilidade/sped/espiao/status').then(r => setEspiaoStatus(r.data))
      .catch(async e => setEspiaoStatus({ ok: false, configurado: true, erro: await espiaoErroTexto(e, 'Falha ao testar a conexão do Espião') }))
      .finally(() => setTestandoEspiao(false));
  }, [API]);
  useEffect(() => { testarEspiao(); }, [testarEspiao]);

  const cruzarEspiao = async (a) => {
    setCruzando(a.id); setEspiaoResult(null); setMsg('');
    try {
      const r = await API.post(`/contabilidade/sped/${a.id}/cruzar-espiao`);
      setEspiaoResult({ nome: a.nome, ...r.data });
    } catch (e) { setMsg('⚠️ ' + await espiaoErroTexto(e, 'Espião: erro ao cruzar.')); }
    finally { setCruzando(null); }
  };
  const [validando, setValidando] = useState(null);
  const [validarResult, setValidarResult] = useState(null);
  const validar = async (a) => {
    setValidando(a.id); setValidarResult(null); setMsg('');
    try {
      const r = await API.post(`/contabilidade/sped/${a.id}/validar`);
      setValidarResult({ nome: a.nome, ...r.data });
    } catch (e) { setMsg('⚠️ ' + (e.response && e.response.data && e.response.data.erro || 'erro ao validar.')); }
    finally { setValidando(null); }
  };

  const escolher = e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const fr = new FileReader();
    fr.onload = async () => {
      const dados = String(fr.result).split(',')[1];
      setArq({ nome: file.name, dados }); setMsg('lendo o arquivo…'); setDet(null);
      try {
        const r = await API.post('/contabilidade/sped/detectar', { conteudo: dados });
        if (r.data.ok) {
          setDet(r.data);
          if (r.data.competencia) setCompetencia(r.data.competencia);
          if (r.data.tipo) setTipo(r.data.tipo);
          if (r.data.loja) setLoja(r.data.loja);
          setMsg(`✅ detectei: ${ROT_TIPO_SPED[r.data.tipo] || r.data.tipo} · ${r.data.competencia}${r.data.cnpj ? ' · CNPJ ' + r.data.cnpj : ''}`);
        } else { setMsg('⚠️ ' + (r.data.erro || 'não reconheci o arquivo — preencha à mão.')); }
      } catch (e2) { setMsg('⚠️ ' + (e2.response && e2.response.data && e2.response.data.erro || 'erro ao ler.')); }
    };
    fr.readAsDataURL(file);
  };
  const enviar = async () => {
    if (!arq) { setMsg('⚠️ escolha o arquivo gerado no Alpha.'); return; }
    setEnviando(true); setMsg('');
    try {
      const r = await API.post('/contabilidade/sped', { conteudo: arq.dados, nome: arq.nome, competencia, loja: loja || null, tipo, etapa, obs: obs || null });
      setMsg(r.data.duplicado ? 'ℹ️ esse arquivo já estava no repositório.' : '✅ arquivo disponibilizado pra contabilidade.');
      setArq(null); setDet(null); setObs(''); carregar();
    } catch (e) { setMsg('⚠️ ' + (e.response && e.response.data && e.response.data.erro || 'erro ao enviar.')); } finally { setEnviando(false); }
  };
  const baixar = async (a) => {
    try {
      const r = await API.get(`/contabilidade/sped/${a.id}/arquivo`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const el = document.createElement('a'); el.href = url; el.download = a.nome || 'sped.txt'; el.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { setMsg('⚠️ erro ao baixar.'); }
  };
  const excluir = async (a) => {
    if (!window.confirm(`Excluir ${a.nome}?`)) return;
    await API.delete(`/contabilidade/sped/${a.id}`); carregar();
  };

  if (sub === 'correcao') return (
    <>
      <div style={s.tabs}>
        <button style={s.tab(false)} onClick={() => setSub('arquivos')}>📁 Arquivos</button>
        <button style={s.tab(true)} onClick={() => setSub('correcao')}>🛠️ Retorno & Banco de correção</button>
        <button style={s.tab(false)} onClick={() => setSub('faltantes')}>🔎 Conciliação NF × XML</button>
        <button style={s.tab(false)} onClick={() => setSub('leadtime')}>⏱️ Tempo de entrada</button>
      </div>
      <BancoCorrecao API={API} lojas={lojas} competencias={competencias} />
    </>
  );
  if (sub === 'faltantes') return (
    <>
      <div style={s.tabs}>
        <button style={s.tab(false)} onClick={() => setSub('arquivos')}>📁 Arquivos</button>
        <button style={s.tab(false)} onClick={() => setSub('correcao')}>🛠️ Retorno & Banco de correção</button>
        <button style={s.tab(true)} onClick={() => setSub('faltantes')}>🔎 Conciliação NF × XML</button>
        <button style={s.tab(false)} onClick={() => setSub('leadtime')}>⏱️ Tempo de entrada</button>
      </div>
      <NfFaltantes API={API} lojas={lojas} espiaoStatus={espiaoStatus} />
    </>
  );
  if (sub === 'leadtime') return (
    <>
      <div style={s.tabs}>
        <button style={s.tab(false)} onClick={() => setSub('arquivos')}>📁 Arquivos</button>
        <button style={s.tab(false)} onClick={() => setSub('correcao')}>🛠️ Retorno & Banco de correção</button>
        <button style={s.tab(false)} onClick={() => setSub('faltantes')}>🔎 Conciliação NF × XML</button>
        <button style={s.tab(true)} onClick={() => setSub('leadtime')}>⏱️ Tempo de entrada</button>
      </div>
      <LeadTime API={API} lojas={lojas} />
    </>
  );
  return (
    <>
      <div style={s.tabs}>
        <button style={s.tab(true)} onClick={() => setSub('arquivos')}>📁 Arquivos</button>
        <button style={s.tab(false)} onClick={() => setSub('correcao')}>🛠️ Retorno & Banco de correção</button>
        <button style={s.tab(false)} onClick={() => setSub('faltantes')}>🔎 Conciliação NF × XML</button>
        <button style={s.tab(false)} onClick={() => setSub('leadtime')}>⏱️ Tempo de entrada</button>
      </div>
      <LeadResumoCard API={API} onDetalhe={() => setSub('leadtime')} />
      <p style={s.sub}>O arquivo SPED é gerado no Alpha (<b>Fiscal → Exportação Arquivo → SPED Fiscal / Contribuições</b>) e fica disponível aqui pro <b>usuário da contabilidade baixar direto</b> — sem precisar enviar por fora. Competência, tipo e loja são <b>detectados do próprio arquivo</b>; quando a contabilidade já devolveu erros antes, o sistema <b>já aponta sozinho</b> os que reconhece no arquivo novo. Para subir automático quando o Alpha gera, use o vigia de pasta (<code>scripts/sped-watch.js</code>).</p>

      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Disponibilizar um arquivo</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={s.lab}>Arquivo (.txt do Alpha)<input type="file" accept=".txt,text/plain" onChange={escolher} style={{ ...s.inp, padding: 5 }} /></div>
          <div style={s.lab}>Competência<input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} style={s.inp} /></div>
          <div style={s.lab}>Tipo<select value={tipo} onChange={e => setTipo(e.target.value)} style={s.inp}>{Object.entries(ROT_TIPO_SPED).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div style={s.lab}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}><option value="">Grupo (consolidado)</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
          <div style={s.lab}>Etapa<select value={etapa} onChange={e => setEtapa(e.target.value)} style={s.inp}>{Object.entries(ROT_ETAPA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div style={s.lab}>Observação<input value={obs} onChange={e => setObs(e.target.value)} placeholder="opcional" style={{ ...s.inp, minWidth: 160 }} /></div>
          <button style={{ ...s.btn, background: '#0d6b5e', color: '#fff', borderColor: '#0d6b5e' }} onClick={enviar} disabled={enviando}>{enviando ? 'enviando…' : '⬆️ disponibilizar'}</button>
        </div>
        {msg && <div style={{ marginTop: 10, fontSize: 12.5, color: msg.indexOf('⚠️') === 0 ? '#b91c1c' : '#0d6b5e' }}>{msg}</div>}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        {espiaoStatus && (
          <div style={{ fontSize: 12, color: espiaoStatus.ok ? '#15803d' : '#a16207', flex: '1 1 320px', minWidth: 0, overflowWrap: 'anywhere' }}>
            {espiaoStatus.ok ? '🟢 Espião NFe conectado — o botão 🔎 Espião cruza cada SPED Fiscal com a SEFAZ e aponta as NF não lançadas.'
              : espiaoStatus.configurado ? `🟡 Espião NFe configurado, mas a chamada falhou — ${espiaoStatus.erro || 'sem detalhe'}`
                : `⚪ ${espiaoStatus.erro || 'Espião NFe não configurado.'}`}
            {espiaoStatus.detalhe && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{espiaoTecnico(espiaoStatus.detalhe)}</div>}
          </div>
        )}
        <button style={s.btn} onClick={testarEspiao} disabled={testandoEspiao}>{testandoEspiao ? 'testando…' : '🔌 testar conexão Espião'}</button>
      </div>
      {validarResult && (
        <div style={{ ...s.card, marginBottom: 16, borderLeft: '4px solid #a16207' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>✓ Validação do SPED — {validarResult.nome}</div>
            <button style={s.btn} onClick={() => setValidarResult(null)}>fechar</button>
          </div>
          <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 10 }}>
            {validarResult.totalItens} item(ns) de entrada · <b style={{ color: validarResult.totalProblemas ? '#b91c1c' : '#15803d' }}>{validarResult.totalProblemas} a revisar/corrigir</b>. Corrija no Alpha e gere o arquivo de novo antes de enviar.
          </div>
          {(validarResult.checks || []).filter(c => c.n).map((c, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: c.gravidade === 'alta' ? '#b91c1c' : c.gravidade === 'revisar' ? '#a16207' : '#475569' }}>
                {c.gravidade === 'alta' ? '🔴' : c.gravidade === 'revisar' ? '🟡' : '🔵'} {c.titulo}: {c.n}{c.valor != null ? ` (${brl(c.valor)})` : ''}
              </div>
              {!!(c.grupos || []).length && <div style={{ fontSize: 11.5, color: '#64748b', marginLeft: 18 }}>
                {c.grupos.slice(0, 6).map((g, j) => <span key={j} style={{ marginRight: 12 }}>CFOP <b>{g.cfop}</b> / CST {g.cst}: {g.n}{g.esperado ? ` → ${g.esperado}` : ''}</span>)}
              </div>}
            </div>
          ))}
          {!validarResult.totalProblemas && <div style={{ fontSize: 13, color: '#15803d' }}>🎉 Nenhum CFOP/CST divergente nas entradas desse SPED.</div>}
        </div>
      )}
      {espiaoResult && (
        <div style={{ ...s.card, marginBottom: 16, borderLeft: '4px solid #0d6b5e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>🔎 SEFAZ × SPED — {espiaoResult.nome} ({espiaoResult.competencia})</div>
            <button style={s.btn} onClick={() => setEspiaoResult(null)}>fechar</button>
          </div>
          <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 10 }}>
            {espiaoResult.resumo.espiao} nota(s) na SEFAZ · {espiaoResult.resumo.noSped} no SPED · <b style={{ color: espiaoResult.resumo.faltantes ? '#b91c1c' : '#15803d' }}>{espiaoResult.resumo.faltantes} não lançada(s)</b> · {espiaoResult.resumo.inseridosBanco} adicionada(s) ao banco de correção.
          </div>
          {!!(espiaoResult.faltantes || []).length && <ScrollX><table style={s.tbl}>
            <thead><tr>{['NF', 'Emitente', 'Emissão', 'Valor', 'Chave', 'XML'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>{espiaoResult.faltantes.map((n, i) => (
              <tr key={i}><td style={s.td}>{n.numero}</td><td style={s.td}>{n.emitente}<div style={{ fontSize: 11, color: '#94a3b8' }}>{n.cnpjEmitente}</div></td>
                <td style={s.td}>{n.data}</td><td style={s.tdNum}>{brl(n.valor)}</td>
                <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 10.5 }}>{n.chave}</td>
                <td style={s.td}>{n.possuiXml ? '📄' : '—'}</td></tr>
            ))}</tbody></table></ScrollX>}
          {!(espiaoResult.faltantes || []).length && <div style={{ fontSize: 13, color: '#15803d' }}>🎉 Todas as notas da SEFAZ estão lançadas nesse SPED.</div>}
        </div>
      )}

      <div style={s.filtros}>
        <div style={s.lab}>Competência<select style={s.inp} value={fCompetencia} onChange={e => setFCompetencia(e.target.value)}><option value="">Todas</option>{competencias.map(c => <option key={c.competencia} value={c.competencia}>{c.competencia} ({c.n})</option>)}</select></div>
        <div style={s.lab}>Tipo<select style={s.inp} value={fTipo} onChange={e => setFTipo(e.target.value)}><option value="">Todos</option>{Object.entries(ROT_TIPO_SPED).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      </div>

      {erro && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>{erro}</div>}

      <ScrollX>
        <table style={s.tbl}>
          <thead><tr>{['Competência', 'Loja', 'Tipo', 'Etapa', 'Arquivo', 'Tamanho', 'Origem', 'Subido em', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {arquivos.map(a => (
              <tr key={a.id}>
                <td style={s.td}><b>{a.competencia}</b></td>
                <td style={s.td}>{a.loja_nome}</td>
                <td style={s.td}>{ROT_TIPO_SPED[a.tipo] || a.tipo}</td>
                <td style={s.td}>{ROT_ETAPA[a.etapa] || a.etapa}</td>
                <td style={s.td}>{a.nome}{a.obs ? <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.obs}</div> : null}</td>
                <td style={s.td}>{kb(a.tamanho)}</td>
                <td style={s.td}>{a.fonte === 'pasta' ? '🤖 vigia' : '✋ manual'}</td>
                <td style={s.td}>{(a.criado_em || '').slice(0, 16).replace('T', ' ')}</td>
                <td style={s.td}><button style={s.btn} onClick={() => baixar(a)}>⬇️ baixar</button>{' '}
                  {a.tipo === 'fiscal' && <button style={s.btn} onClick={() => validar(a)} disabled={validando === a.id} title="Conferir CFOP/CST do arquivo antes de enviar">{validando === a.id ? '…' : '✓ validar'}</button>}{' '}
                  {a.tipo === 'fiscal' && <button style={s.btn} onClick={() => cruzarEspiao(a)} disabled={cruzando === a.id} title="Cruzar com a SEFAZ (Espião): achar NF não lançada">{cruzando === a.id ? '…' : '🔎 Espião'}</button>}{' '}
                  <button style={{ ...s.btn, color: '#b91c1c' }} onClick={() => excluir(a)}>🗑️</button></td>
              </tr>
            ))}
            {!carregando && !arquivos.length && <tr><td colSpan={9} style={{ ...s.td, textAlign: 'center', color: '#94a3b8', padding: 24 }}>Nenhum arquivo SPED no repositório ainda.</td></tr>}
          </tbody>
        </table>
      </ScrollX>
    </>
  );
}

// ── Retorno da contabilidade + Banco de correção ──────────────────────────────────────────────
const ST_ERRO = { aberto: { t: 'Aberto', bg: '#fef9c3', fg: '#a16207' }, corrigido: { t: 'Corrigido', bg: '#dcfce7', fg: '#15803d' }, ignorado: { t: 'Ignorado', bg: '#f1f5f9', fg: '#64748b' } };

function BancoCorrecao({ API, lojas, competencias }) {
  const [banco, setBanco] = useState({ categorias: [], total: {} });
  const [erros, setErros] = useState([]);
  const [fComp, setFComp] = useState('');
  const [fStatus, setFStatus] = useState('aberto');
  const [msg, setMsg] = useState('');
  // retorno form
  const [competencia, setCompetencia] = useState('');
  const [tipo, setTipo] = useState('fiscal');
  const [loja, setLoja] = useState('');
  const [texto, setTexto] = useState('');
  const [arqRetorno, setArqRetorno] = useState(null); // {nome, dados}
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(() => {
    API.get('/contabilidade/sped/banco-correcao').then(r => setBanco(r.data)).catch(() => {});
    const p = new URLSearchParams();
    if (fComp) p.set('competencia', fComp);
    if (fStatus) p.set('status', fStatus);
    API.get(`/contabilidade/sped/erros?${p.toString()}`).then(r => setErros(r.data.erros || [])).catch(() => {});
  }, [API, fComp, fStatus]);
  useEffect(() => { carregar(); }, [carregar]);

  const escolherArq = e => {
    const f = e.target.files && e.target.files[0]; if (!f) { setArqRetorno(null); return; }
    const fr = new FileReader(); fr.onload = () => setArqRetorno({ nome: f.name, dados: String(fr.result).split(',')[1] }); fr.readAsDataURL(f);
  };
  const enviarRetorno = async () => {
    if (!competencia) { setMsg('⚠️ informe a competência do retorno.'); return; }
    if (!texto.trim() && !arqRetorno) { setMsg('⚠️ cole a lista de erros ou anexe a planilha que a contabilidade mandou.'); return; }
    setEnviando(true); setMsg('');
    try {
      const corpo = { competencia, tipo, loja: loja || null };
      if (texto.trim()) corpo.texto = texto; else { corpo.conteudo = arqRetorno.dados; corpo.nome = arqRetorno.nome; }
      const r = await API.post('/contabilidade/sped/retorno', corpo);
      setMsg(`✅ ${r.data.inseridos} erro(s) registrados e classificados.`); setTexto(''); setArqRetorno(null); carregar();
    } catch (e) { setMsg('⚠️ ' + (e.response && e.response.data && e.response.data.erro || 'erro.')); } finally { setEnviando(false); }
  };
  const mudar = async (e, status) => { await API.patch(`/contabilidade/sped/erro/${e.id}`, { status }); carregar(); };
  const remover = async (e) => { if (window.confirm('Excluir esse erro?')) { await API.delete(`/contabilidade/sped/erro/${e.id}`); carregar(); } };

  const t = banco.total || {};
  return (
    <>
      <p style={s.sub}>A contabilidade devolve as pendências aqui. O sistema <b>classifica cada erro</b> (categoria + registro SPED) e vai formando o <b>banco de correção</b> — nos meses seguintes, o que já apareceu é apontado <b>automaticamente</b> no upload do arquivo, sem a contabilidade precisar reavaliar.</p>

      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Registrar retorno da contabilidade</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
          <div style={s.lab}>Competência<input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} style={s.inp} /></div>
          <div style={s.lab}>Tipo<select value={tipo} onChange={e => setTipo(e.target.value)} style={s.inp}>{Object.entries(ROT_TIPO_SPED).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div style={s.lab}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}><option value="">Todas / grupo</option>{(lojas || []).map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
        </div>
        <textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Cole aqui a lista de pendências que a contabilidade mandou — uma por linha. Ex.: 'NF 12345 Santa Cruz não lançada', 'Fornecedor DPA sem IE (0150)', 'Item 789 estoque negativo'…  (ou anexe a planilha abaixo)" rows={5} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 7, padding: 9, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <button style={{ ...s.btn, background: '#0d6b5e', color: '#fff', borderColor: '#0d6b5e' }} onClick={enviarRetorno} disabled={enviando}>{enviando ? 'registrando…' : '📥 registrar e classificar'}</button>
          <span style={{ fontSize: 12, color: '#64748b' }}>ou anexe a planilha/arquivo que a contabilidade mandou:</span>
          <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={escolherArq} style={{ fontSize: 12 }} />
          {arqRetorno && <span style={{ fontSize: 12, color: '#0d6b5e' }}>📎 {arqRetorno.nome}</span>}
          {msg && <span style={{ fontSize: 12.5, color: msg.indexOf('⚠️') === 0 ? '#b91c1c' : '#0d6b5e' }}>{msg}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 6 }}>Aceita Excel (.xlsx/.xls), CSV ou texto. Cada linha da planilha vira um erro, classificado automaticamente. Se colar texto, o texto tem prioridade sobre o arquivo.</div>
      </div>

      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Banco de correção — o que mais se repete</div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{t.total || 0} erro(s) no histórico · {t.abertos || 0} em aberto · {t.competencias || 0} competência(s)</div>
        <ScrollX>
          <table style={s.tbl}>
            <thead><tr>{['Categoria', 'Registro', 'Total', 'Em aberto', 'Corrigidos', 'Competências', 'Período'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {(banco.categorias || []).map((c, i) => (
                <tr key={i}>
                  <td style={s.td}><b>{c.categoria}</b></td>
                  <td style={s.td}>{c.registro || '—'}</td>
                  <td style={s.td}>{c.total}</td>
                  <td style={s.td}><span style={{ color: c.abertos ? '#a16207' : '#15803d', fontWeight: 600 }}>{c.abertos}</span></td>
                  <td style={s.td}>{c.corrigidos}</td>
                  <td style={s.td}>{c.competencias > 1 ? <b style={{ color: '#b91c1c' }}>{c.competencias}× recorrente</b> : c.competencias}</td>
                  <td style={s.td}>{c.desde === c.ate ? c.desde : `${c.desde} → ${c.ate}`}</td>
                </tr>
              ))}
              {!(banco.categorias || []).length && <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color: '#94a3b8', padding: 20 }}>Ainda não há erros registrados.</td></tr>}
            </tbody>
          </table>
        </ScrollX>
      </div>

      <div style={s.filtros}>
        <div style={s.lab}>Competência<select style={s.inp} value={fComp} onChange={e => setFComp(e.target.value)}><option value="">Todas</option>{(competencias || []).map(c => <option key={c.competencia} value={c.competencia}>{c.competencia}</option>)}</select></div>
        <div style={s.lab}>Status<select style={s.inp} value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">Todos</option><option value="aberto">Em aberto</option><option value="corrigido">Corrigidos</option><option value="ignorado">Ignorados</option></select></div>
      </div>

      <ScrollX>
        <table style={s.tbl}>
          <thead><tr>{['Competência', 'Categoria', 'Erro', 'Loja', 'Origem', 'Status', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {erros.map(e => {
              const st = ST_ERRO[e.status] || ST_ERRO.aberto;
              return (
                <tr key={e.id}>
                  <td style={s.td}>{e.competencia}</td>
                  <td style={s.td}>{e.categoria}{e.registro ? <span style={{ color: '#94a3b8' }}> · {e.registro}</span> : null}</td>
                  <td style={{ ...s.td, whiteSpace: 'normal', maxWidth: 360 }}>{e.descricao}</td>
                  <td style={s.td}>{e.loja_nome}</td>
                  <td style={s.td}>{e.origem === 'sistema' ? '🤖 sistema' : e.origem === 'manual' ? '✋ manual' : '📥 contab.'}</td>
                  <td style={s.td}><span style={s.pill(st)}>{st.t}</span></td>
                  <td style={s.td}>
                    {e.status !== 'corrigido' && <button style={s.btn} onClick={() => mudar(e, 'corrigido')} title="Marcar corrigido">✅</button>}{' '}
                    {e.status === 'aberto' && <button style={s.btn} onClick={() => mudar(e, 'ignorado')} title="Ignorar">🚫</button>}{' '}
                    {e.status !== 'aberto' && <button style={s.btn} onClick={() => mudar(e, 'aberto')} title="Reabrir">↺</button>}{' '}
                    <button style={{ ...s.btn, color: '#b91c1c' }} onClick={() => remover(e)}>🗑️</button>
                  </td>
                </tr>
              );
            })}
            {!erros.length && <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color: '#94a3b8', padding: 20 }}>Nenhum erro com esse filtro.</td></tr>}
          </tbody>
        </table>
      </ScrollX>
    </>
  );
}

// ── NF não lançada: cruza Espião (SEFAZ) × Alpha direto, SEM precisar do SPED ─────────────────
function NfFaltantes({ API, lojas, espiaoStatus }) {
  const mesAtual = new Date().toISOString().slice(0, 7);
  const [competencia, setCompetencia] = useState(mesAtual);
  const [loja, setLoja] = useState('');            // '' = todas as lojas
  const [diasMin, setDiasMin] = useState('');      // urgência: só com mais de X dias
  const [carregando, setCarregando] = useState(false);
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState('');
  const [baixando, setBaixando] = useState(null); // chave do XML em download (só quando o usuário clica)

  // baixa o XML só se o usuário quiser (botão por linha) — não é usado no confronto, é sob demanda
  const baixarXml = async (chave, numero) => {
    setBaixando(chave);
    try {
      const r = await API.get('/contabilidade/espiao/xml/' + chave, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/xml' }));
      const a = document.createElement('a');
      a.href = url; a.download = (numero ? 'NF' + numero + '-' : '') + chave + '.xml';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) {
      alert(await espiaoErroTexto(e, 'Não foi possível baixar o XML dessa nota.'));
    } finally { setBaixando(null); }
  };

  const conferir = async () => {
    setCarregando(true); setErro(''); setRes(null);
    try {
      const params = { competencia }; if (loja) params.loja = loja; if (diasMin) params.diasMin = diasMin;
      const r = await API.get('/contabilidade/sped/entradas-faltantes', { params });
      setRes(r.data);
    } catch (e) { setErro(await espiaoErroTexto(e, 'erro ao conferir.')); }
    finally { setCarregando(false); }
  };
  const corDias = d => (d >= 15 ? '#b91c1c' : d >= 7 ? '#b45309' : '#64748b');

  return (
    <>
      <p style={s.sub}>Cruza o que a <b>SEFAZ tem</b> (via Espião) com o que foi <b>lançado no Alpha</b> — aponta as <b>notas que faltam dar entrada</b>, ordenadas da <b>mais antiga</b> (mais urgente). Não precisa do SPED: direto, por loja e competência. O confronto não baixa nada; o <b>📥 XML</b> em cada linha é opcional, só se você quiser o arquivo.</p>
      {espiaoStatus && !espiaoStatus.ok && (
        <div style={{ fontSize: 12.5, marginBottom: 12, color: '#a16207', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, padding: 10 }}>
          🟡 O Espião não está respondendo, e sem ele este cruzamento não funciona — {espiaoStatus.erro || 'sem detalhe'}
          {espiaoStatus.detalhe && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{espiaoTecnico(espiaoStatus.detalhe)}</div>}
        </div>
      )}
      <div style={s.filtros}>
        <div style={s.lab}>Competência<input type="month" style={s.inp} value={competencia} onChange={e => setCompetencia(e.target.value)} /></div>
        <div style={s.lab}>Loja<select style={s.inp} value={loja} onChange={e => setLoja(e.target.value)}><option value="">🏬 Todas as lojas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
        <div style={s.lab}>Só com mais de<select style={s.inp} value={diasMin} onChange={e => setDiasMin(e.target.value)}><option value="">(todas)</option><option value="3">3 dias</option><option value="7">7 dias</option><option value="15">15 dias</option><option value="30">30 dias</option></select></div>
        <button style={{ ...s.btn, background: '#0d6b5e', color: '#fff', borderColor: '#0d6b5e' }} onClick={conferir} disabled={carregando}>{carregando ? 'conferindo…' : '🔎 conferir SEFAZ × Alpha'}</button>
      </div>
      {erro && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>⚠️ {erro}</div>}
      {res && (res.totalUrgentes > 0) && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 12px', marginBottom: 12, fontSize: 13, fontWeight: 700 }}>🚨 {res.totalUrgentes} nota(s) com <b>7 dias ou mais</b> sem dar entrada — priorize!</div>}
      {res && (res.lojas || []).map((L, i) => (
        <div key={i} style={{ ...s.card, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{L.loja} {L.urgentes ? <span style={{ fontSize: 11, color: '#b91c1c' }}>· 🚨 {L.urgentes} urgente(s)</span> : null}</div>
          <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 10 }}>
            {L.sefaz} nota(s) na SEFAZ · {L.noAlpha} no Alpha · <b style={{ color: L.faltantes.length ? '#b91c1c' : '#15803d' }}>{L.faltantes.length} faltando lançar</b>.
          </div>
          {!!L.faltantes.length && <ScrollX><table style={s.tbl}>
            <thead><tr>{['Dias', 'NF', 'Emitente', 'Emissão', 'Valor', 'Chave', 'XML'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>{L.faltantes.map((n, j) => (
              <tr key={j} style={(n.dias >= 7) ? { background: n.dias >= 15 ? '#fef2f2' : '#fffbeb' } : null}>
                <td style={{ ...s.tdNum, fontWeight: 800, color: corDias(n.dias || 0) }}>{n.dias != null ? n.dias + 'd' : '—'}</td>
                <td style={s.td}>{n.numero}</td><td style={s.td}>{n.emitente}<div style={{ fontSize: 11, color: '#94a3b8' }}>{n.cnpjEmitente}</div></td>
                <td style={s.td}>{n.data}</td><td style={s.tdNum}>{brl(n.valor)}</td>
                <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 10.5 }}>{n.chave}</td>
                <td style={s.td}>{n.possuiXml ? <button style={{ ...s.btn, padding: '2px 8px', fontSize: 11 }} disabled={baixando === n.chave} onClick={() => baixarXml(n.chave, n.numero)} title="Baixar o XML dessa nota (opcional)">{baixando === n.chave ? '…' : '📥 XML'}</button> : '—'}</td></tr>
            ))}</tbody></table></ScrollX>}
          {!L.faltantes.length && <div style={{ fontSize: 13, color: '#15803d' }}>🎉 Tudo que a SEFAZ tem já está lançado no Alpha.</div>}
        </div>
      ))}
    </>
  );
}

// ── BI: tempo entre a emissão do XML e a entrada efetiva no estoque (Alpha) ──────────────────────
function LeadTime({ API, lojas }) {
  const mesAtual = new Date().toISOString().slice(0, 7);
  const [competencia, setCompetencia] = useState(mesAtual);
  const [loja, setLoja] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [res, setRes] = useState(null); const [erro, setErro] = useState('');
  const [drill, setDrill] = useState(null); // {key, lojaId, label, loading, rows, erro}
  const conferir = async (forcar) => {
    setCarregando(true); setErro(''); setRes(null); setDrill(null);
    try {
      const params = { competencia }; if (loja) params.loja = loja; if (forcar) params.forcar = '1';
      const r = await API.get('/contabilidade/espiao/lead-estoque', { params });
      setRes(r.data);
    } catch (e) { setErro(e.response && e.response.data && e.response.data.erro || 'erro.'); }
    finally { setCarregando(false); }
  };
  // clicou numa faixa → lista as empresas daquela faixa (toggle)
  const abrirFaixa = async (L, k, label, min, max) => {
    const key = L.loja_id + '|' + k;
    if (drill && drill.key === key) { setDrill(null); return; }
    setDrill({ key, lojaId: L.loja_id, label, loading: true, rows: [] });
    try {
      const params = { competencia, loja: L.loja_id, min }; if (max != null) params.max = max;
      const r = await API.get('/contabilidade/espiao/lead-estoque/detalhe', { params });
      setDrill({ key, lojaId: L.loja_id, label, loading: false, rows: r.data.notas || [] });
    } catch (e) { setDrill({ key, lojaId: L.loja_id, label, loading: false, rows: [], erro: e.response && e.response.data && e.response.data.erro || 'erro ao abrir a faixa.' }); }
  };
  const BUCKETS = [['ate1', 'até 1 dia', '#16a34a', 0, 1], ['d13', '1 a 3 dias', '#65a30d', 1, 3], ['d37', '3 a 7 dias', '#ca8a04', 3, 7], ['d715', '7 a 15 dias', '#ea580c', 7, 15], ['m15', 'mais de 15 dias', '#b91c1c', 15, null]];
  return (
    <>
      <p style={s.sub}>Quanto tempo leva entre a <b>emissão do XML</b> (fornecedor) e a <b>entrada efetiva no nosso estoque</b> (Alpha). Mede a agilidade do recebimento, por loja e competência.</p>
      <div style={s.filtros}>
        <div style={s.lab}>Competência<input type="month" style={s.inp} value={competencia} onChange={e => setCompetencia(e.target.value)} /></div>
        <div style={s.lab}>Loja<select style={s.inp} value={loja} onChange={e => setLoja(e.target.value)}><option value="">🏬 Todas as lojas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
        <button style={{ ...s.btn, background: '#0d6b5e', color: '#fff', borderColor: '#0d6b5e' }} onClick={conferir} disabled={carregando}>{carregando ? 'analisando…' : '⏱️ analisar tempo de entrada'}</button>
      </div>
      {erro && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>⚠️ {erro}</div>}
      {res && res.cache && <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: '#64748b', margin: '-4px 0 10px' }}>
        <span>{res.cache.deCache ? '📦 do cache' : '🔄 recém-calculado'} · atualizado {fmtCacheHora(res.cache.atualizado_em)}</span>
        <button style={{ ...s.btn, padding: '2px 10px', fontSize: 11 }} onClick={() => conferir(true)} disabled={carregando}>🔄 atualizar agora</button>
      </div>}
      {res && (res.lojas || []).map((L, i) => (
        <div key={i} style={{ ...s.card, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{L.loja}</div>
          {!L.n ? <div style={{ fontSize: 13, color: '#94a3b8' }}>Sem entradas com data no período.</div> : <>
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 12 }}>
              <div><div style={{ fontSize: 11, color: '#94a3b8' }}>entradas</div><div style={{ fontSize: 22, fontWeight: 800 }}>{L.n}</div></div>
              <div><div style={{ fontSize: 11, color: '#94a3b8' }}>tempo médio</div><div style={{ fontSize: 22, fontWeight: 800, color: '#0d6b5e' }}>{L.media} <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>dias</span></div></div>
              <div><div style={{ fontSize: 11, color: '#94a3b8' }}>mediana</div><div style={{ fontSize: 22, fontWeight: 800 }}>{L.mediana} <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>dias</span></div></div>
              <div><div style={{ fontSize: 11, color: '#94a3b8' }}>pior</div><div style={{ fontSize: 22, fontWeight: 800, color: '#b91c1c' }}>{L.pior} <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>dias</span></div></div>
            </div>
            <div style={{ marginBottom: 12 }}>{BUCKETS.map(([k, lbl, cor, min, max]) => { const v = L.buckets[k] || 0; const pct = L.n ? Math.round(v / L.n * 100) : 0; const aberta = drill && drill.key === (L.loja_id + '|' + k); return (
              <div key={k} onClick={v ? () => abrirFaixa(L, k, lbl, min, max) : undefined} title={v ? 'ver as ' + v + ' nota(s) de ' + lbl : ''}
                style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12, cursor: v ? 'pointer' : 'default', background: aberta ? '#f1f5f9' : 'transparent', borderRadius: 6, padding: '2px 4px' }}>
                <div style={{ width: 92, color: '#475569', fontWeight: aberta ? 700 : 400 }}>{lbl}</div>
                <div style={{ flex: 1, background: '#eef2f7', borderRadius: 6, height: 16, overflow: 'hidden' }}><div style={{ width: Math.max(2, pct) + '%', height: '100%', background: cor }} /></div>
                <div style={{ width: 70, textAlign: 'right', color: '#475569' }}><b>{v}</b> · {pct}%</div>
                <div style={{ width: 14, textAlign: 'center', color: '#94a3b8' }}>{v ? (aberta ? '▾' : '▸') : ''}</div>
              </div>); })}</div>
            {drill && drill.lojaId === L.loja_id && (
              <div style={{ ...s.card, margin: '0 0 12px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>📋 Empresas · {drill.label}{!drill.loading && !drill.erro ? ` (${drill.rows.length})` : ''}</div>
                  <button style={{ ...s.btn, padding: '2px 10px', fontSize: 11 }} onClick={() => setDrill(null)}>fechar</button>
                </div>
                {drill.loading && <div style={{ fontSize: 12, color: '#94a3b8' }}>carregando…</div>}
                {drill.erro && <div style={{ fontSize: 12, color: '#b91c1c' }}>⚠️ {drill.erro}</div>}
                {!drill.loading && !drill.erro && !drill.rows.length && <div style={{ fontSize: 12, color: '#94a3b8' }}>Nenhuma nota nessa faixa.</div>}
                {!drill.loading && !drill.erro && !!drill.rows.length && (
                  <ScrollX><table style={s.tbl}><thead><tr>{['NF', 'Fornecedor', 'Emissão', 'Entrada', 'Dias'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                    <tbody>{drill.rows.map((p, j) => <tr key={j}><td style={s.td}>{p.numero}</td><td style={s.td}>{p.fornecedor}</td><td style={s.td}>{p.emissao}</td><td style={s.td}>{p.entrada}</td><td style={{ ...s.tdNum, fontWeight: 800, color: p.dias >= 15 ? '#b91c1c' : p.dias >= 7 ? '#b45309' : '#0d6b5e' }}>{p.dias}d</td></tr>)}</tbody></table></ScrollX>
                )}
              </div>
            )}
            {!!(L.piores || []).length && <>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', margin: '6px 0 4px' }}>🐢 As que mais demoraram</div>
              <ScrollX><table style={s.tbl}><thead><tr>{['NF', 'Fornecedor', 'Emissão', 'Entrada', 'Dias'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>{L.piores.map((p, j) => <tr key={j}><td style={s.td}>{p.numero}</td><td style={s.td}>{p.fornecedor}</td><td style={s.td}>{p.emissao}</td><td style={s.td}>{p.entrada}</td><td style={{ ...s.tdNum, fontWeight: 800, color: p.dias >= 15 ? '#b91c1c' : '#b45309' }}>{p.dias}d</td></tr>)}</tbody></table></ScrollX>
            </>}
          </>}
        </div>
      ))}
    </>
  );
}

// card resumido do BI de tempo de entrada (grupo) p/ o painel da Contabilidade
function LeadResumoCard({ API, onDetalhe }) {
  const [d, setD] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const carregar = useCallback((forcar) => {
    if (forcar) setAtualizando(true);
    API.get('/contabilidade/espiao/lead-resumo' + (forcar ? '?forcar=1' : '')).then(r => setD(r.data)).catch(() => setD({ erro: true })).finally(() => setAtualizando(false));
  }, [API]);
  useEffect(() => { carregar(false); }, [carregar]);
  if (!d || d.erro || !d.total) return null;
  const pct3 = d.total ? Math.round(d.ate3 / d.total * 100) : 0;
  const nomeMes = (() => { const [a, m] = d.competencia.split('-').map(Number); return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); })();
  return (
    <div style={{ ...s.card, marginBottom: 16, background: '#f6fbfa', border: '1px solid #cdeae3' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>⏱️ Tempo de entrada da mercadoria <span style={{ fontWeight: 400, color: '#64748b', textTransform: 'capitalize' }}>· {nomeMes}</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {d.cache && <span style={{ fontSize: 11, color: '#94a3b8' }}>atualizado {fmtCacheHora(d.cache.atualizado_em)}</span>}
          <button style={{ ...s.btn, padding: '4px 10px', fontSize: 12 }} onClick={() => carregar(true)} disabled={atualizando} title="Recalcular agora (buscar no Alpha)">{atualizando ? '…' : '🔄'}</button>
          <button style={{ ...s.btn, padding: '4px 12px', fontSize: 12 }} onClick={onDetalhe}>ver detalhe →</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
        <div><div style={{ fontSize: 11, color: '#94a3b8' }}>tempo médio (XML → estoque)</div><div style={{ fontSize: 24, fontWeight: 800, color: '#0d6b5e' }}>{d.media} <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>dias</span></div></div>
        <div><div style={{ fontSize: 11, color: '#94a3b8' }}>mediana</div><div style={{ fontSize: 24, fontWeight: 800 }}>{d.mediana} <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>dias</span></div></div>
        <div><div style={{ fontSize: 11, color: '#94a3b8' }}>entraram em até 3 dias</div><div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a' }}>{pct3}%</div></div>
        <div><div style={{ fontSize: 11, color: '#94a3b8' }}>demoraram 7 dias+</div><div style={{ fontSize: 24, fontWeight: 800, color: d.lentas7 ? '#b45309' : '#16a34a' }}>{d.lentas7}</div></div>
        <div><div style={{ fontSize: 11, color: '#94a3b8' }}>entradas no mês</div><div style={{ fontSize: 24, fontWeight: 800 }}>{d.total}</div></div>
      </div>
      {!!(d.lojas || []).filter(l => l.n).length && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 8 }}>Por loja (média): {d.lojas.filter(l => l.n).map((l, i) => <span key={i}>{i ? ' · ' : ''}{l.loja} <b style={{ color: l.media >= 5 ? '#b45309' : '#0d6b5e' }}>{l.media}d</b></span>)}</div>}
    </div>
  );
}
