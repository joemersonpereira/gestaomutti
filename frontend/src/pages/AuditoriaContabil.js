import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import MultiLojaSelect from '../components/MultiLojaSelect';
import ScrollX from '../components/ScrollX';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';
import CacheBar from '../components/CacheBar';

// colunas ordenáveis da tabela de lançamentos manuais (clicar no cabeçalho ordena; Valor = maior↔menor)
const COLS_MANUAIS = [
  { k: 'datahora', label: 'Data', tipo: 'txt', get: l => l.datahora || '' },
  { k: 'loja', label: 'Loja', tipo: 'txt', get: l => l.loja || '' },
  { k: 'conta', label: 'Conta', tipo: 'txt', get: l => l.conta || '' },
  { k: 'tipo', label: 'Tipo', tipo: 'txt', get: l => (l.credito ? 'Entrada' : 'Saída') },
  { k: 'valor', label: 'Valor', tipo: 'num', right: true, get: l => Number(l.valor) || 0 },
  { k: 'plano_contas', label: 'Plano de contas', tipo: 'txt', get: l => l.plano_contas || '' },
  { k: 'numerodocumento', label: 'Documento', tipo: 'txt', get: l => l.numerodocumento || '' },
  { k: 'descricao', label: 'Descrição', tipo: 'txt', get: l => l.descricao || '' },
  { k: 'usuario', label: 'Usuário', tipo: 'txt', get: l => l.usuario || '' },
];

// Módulo Auditoria.
// (A) Lançamentos manuais na conta corrente (Lançamento de Entrada/Saída) — o que foi digitado à mão
//     na conciliação, em vez de baixa automática (cartão) ou baixa de contas a pagar.
// (B) Conciliação de cartão: % conciliado × pendentes e atraso, por operadora.
// ERP SOMENTE LEITURA.

const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hoje = new Date();
const iniMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
const hojeStr = hoje.toISOString().slice(0, 10);

const s = {
  wrap: { padding: 20, maxWidth: 1200, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, margin: 0, color: '#1e293b' },
  filtros: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 },
  lab: { display: 'flex', flexDirection: 'column', fontSize: 11, color: '#64748b', gap: 3 },
  inp: { border: '1px solid #cbd5e1', borderRadius: 7, padding: '7px 9px', fontSize: 13 },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' },
  cardLab: { fontSize: 12, color: '#64748b' },
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 2 },
  tabs: { display: 'flex', gap: 6 },
  tab: a => ({ padding: '8px 14px', borderRadius: 8, border: '1px solid ' + (a ? '#0d6b5e' : '#e5e7eb'), background: a ? '#e6f3f0' : '#fff', color: a ? '#0d6b5e' : '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }),
  tbl: { width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', fontSize: 13 },
  th: { textAlign: 'left', padding: '9px 10px', background: '#f8fafc', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: .3, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' },
  td: { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' },
  tdNum: { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  btn: { padding: '8px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#334155' },
  pill: c => ({ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.fg, fontWeight: 600 }),
};

// Multi-seleção de contas (dropdown com checkboxes).
function ContaMulti({ contas, sel, onChange }) {
  const [aberto, setAberto] = useState(false);
  const ref = React.useRef(null);
  useEffect(() => {
    const fora = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', fora); return () => document.removeEventListener('mousedown', fora);
  }, []);
  const toggle = id => onChange(sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  const texto = !sel.length ? 'Todas as contas' : sel.length === 1 ? (contas.find(c => String(c.id) === String(sel[0]))?.nome || '1 conta') : `${sel.length} contas`;
  return (
    <div style={{ position: 'relative', minWidth: 190 }} ref={ref}>
      <button type="button" style={{ ...s.inp, width: '100%', textAlign: 'left', cursor: 'pointer', background: '#fff', display: 'flex', justifyContent: 'space-between', gap: 8 }} onClick={() => setAberto(a => !a)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto}</span><span style={{ color: '#94a3b8' }}>▾</span>
      </button>
      {aberto && (
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxHeight: 280, overflowY: 'auto', minWidth: 240 }}>
          <div style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 10 }}>
            <button type="button" style={{ ...s.btn, padding: '2px 8px', fontSize: 11 }} onClick={() => onChange(contas.map(c => String(c.id)))}>Todas</button>
            <button type="button" style={{ ...s.btn, padding: '2px 8px', fontSize: 11 }} onClick={() => onChange([])}>Limpar</button>
          </div>
          {contas.map(c => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}>
              <input type="checkbox" checked={sel.includes(String(c.id))} onChange={() => toggle(String(c.id))} />
              <span style={{ flex: 1 }}>{c.nome}</span>
              {c.tipo && <span style={{ fontSize: 10, color: '#94a3b8' }}>{c.tipo}</span>}
            </label>
          ))}
          {!contas.length && <div style={{ padding: 12, fontSize: 12, color: '#94a3b8' }}>Nenhuma conta.</div>}
        </div>
      )}
    </div>
  );
}

function baixarCsv(nome, colunas, linhas) {
  const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const txt = [colunas.map(c => esc(c.h)).join(';'), ...linhas.map(l => colunas.map(c => esc(c.f(l))).join(';'))].join('\n');
  const blob = new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); URL.revokeObjectURL(a.href);
}

export default function AuditoriaContabil() {
  const { API } = useAuth();
  const [secao, setSecao] = useState('manuais'); // manuais | bancaria | cartao

  return (
    <div style={s.wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '6px 0 12px', borderBottom: '1px solid var(--line,#ddd8cf)', marginBottom: 16 }}>
        <h1 style={s.h1}>🔎 Auditoria</h1>
        <div style={{ ...s.tabs, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button style={s.tab(secao === 'manuais')} onClick={() => setSecao('manuais')}>✍️ Lançamentos manuais</button>
          <button style={s.tab(secao === 'bancaria')} onClick={() => setSecao('bancaria')}>🏦 Conciliação bancária</button>
          <button style={s.tab(secao === 'cartao')} onClick={() => setSecao('cartao')}>💳 Conciliação de cartão</button>
          <button style={s.tab(secao === 'feriados')} onClick={() => setSecao('feriados')}>📅 Feriados</button>
        </div>
      </div>
      {secao === 'manuais' ? <Manuais API={API} /> : secao === 'bancaria' ? <ConciliacaoBancaria API={API} /> : secao === 'feriados' ? <Feriados API={API} /> : <ConciliacaoAudit API={API} />}
    </div>
  );
}

// (A) Lançamentos manuais na conta corrente.
function Manuais({ API }) {
  const [loja, setLoja] = useState('');
  const [de, setDe] = useState(iniMes);
  const [ate, setAte] = useState(hojeStr);
  const [contas, setContas] = useState([]);
  const [selContas, setSelContas] = useState([]);
  const [semCartao, setSemCartao] = useState(true);
  const [planos, setPlanos] = useState([]);
  const [plano, setPlano] = useState(''); // '' = todos | '__SEM__' = sem plano | nome do plano
  const [rows, setRows] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  // Lista de contas (banco/cofre/orçamento) para o seletor — recarrega quando muda a loja.
  useEffect(() => {
    const lp = loja ? `?loja=${encodeURIComponent(loja)}` : '';
    API.get(`/contabilidade/extrato/contas${lp}`)
      .then(r => { const cs = r.data.contas || []; setContas(cs); setSelContas(prev => prev.filter(id => cs.some(c => String(c.id) === String(id)))); })
      .catch(() => setContas([]));
  }, [API, loja]);

  // Lista de planos de contas presentes (p/ o filtro) — recarrega quando muda escopo/período (não o plano).
  useEffect(() => {
    const p = new URLSearchParams();
    if (loja) p.set('loja', loja); if (de) p.set('de', de); if (ate) p.set('ate', ate);
    if (selContas.length) p.set('contas', selContas.join(',')); if (semCartao) p.set('semCartao', '1');
    API.get(`/contabilidade/auditoria/manuais/planos?${p.toString()}`)
      .then(r => { const ps = r.data.planos || []; setPlanos(ps); setPlano(prev => (prev && prev !== '__SEM__' && !ps.some(x => x.plano === prev)) ? '' : prev); })
      .catch(() => setPlanos([]));
  }, [API, loja, de, ate, selContas, semCartao]);

  const [cache, setCache] = useState(null);
  const carregar = useCallback((forcar) => {
    setCarregando(true); setErro(null);
    const p = new URLSearchParams();
    if (loja) p.set('loja', loja);
    if (de) p.set('de', de);
    if (ate) p.set('ate', ate);
    if (selContas.length) p.set('contas', selContas.join(','));
    if (semCartao) p.set('semCartao', '1');
    if (plano) p.set('plano', plano);
    if (forcar) p.set('forcar', '1');
    API.get(`/contabilidade/auditoria/manuais?${p.toString()}`)
      .then(r => { setRows(r.data.lancamentos || []); setCache(r.data.cache); })
      .catch(e => setErro(e.response?.data?.erro || 'Erro ao carregar lançamentos.'))
      .finally(() => setCarregando(false));
  }, [API, loja, de, ate, selContas, semCartao, plano]);
  useEffect(() => { carregar(); }, [carregar]);

  const totE = rows.filter(r => r.credito).reduce((a, r) => a + Number(r.valor || 0), 0);
  const totS = rows.filter(r => !r.credito).reduce((a, r) => a + Number(r.valor || 0), 0);
  const { linhas, ordem, clicar, seta } = useOrdenavel(rows, COLS_MANUAIS, { col: 'datahora', dir: 'desc' });

  return (
    <>
      <div style={s.filtros}>
        <label style={s.lab}>Loja<MultiLojaSelect value={loja} onChange={setLoja} /></label>
        <label style={s.lab}>Contas<ContaMulti contas={contas} sel={selContas} onChange={setSelContas} /></label>
        <label style={s.lab}>Plano de contas
          <select style={{ ...s.inp, minWidth: 180 }} value={plano} onChange={e => setPlano(e.target.value)}>
            <option value="">Todos os planos</option>
            <option value="__SEM__">— Sem plano —{planos.find(p => p.plano == null) ? ` (${planos.find(p => p.plano == null).n})` : ''}</option>
            {planos.filter(p => p.plano != null).map((p, i) => <option key={i} value={p.plano}>{p.plano} ({p.n})</option>)}
          </select>
        </label>
        <label style={s.lab}>De<input type="date" style={s.inp} value={de} onChange={e => setDe(e.target.value)} /></label>
        <label style={s.lab}>Até<input type="date" style={s.inp} value={ate} onChange={e => setAte(e.target.value)} /></label>
        <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 6 }}><input type="checkbox" checked={semCartao} onChange={e => setSemCartao(e.target.checked)} /> Ocultar reprocesso de cartão</label>
        <button style={s.btn} onClick={() => carregar(true)} disabled={carregando}>{carregando ? 'Carregando…' : '🔄 Atualizar'}</button>
        <button style={{ ...s.btn, marginLeft: 'auto' }} onClick={() => baixarCsv('lancamentos-manuais.csv', [
          { h: 'Data', f: l => l.datahora }, { h: 'Loja', f: l => l.loja }, { h: 'Conta', f: l => l.conta },
          { h: 'Tipo', f: l => l.tipo }, { h: 'Valor', f: l => l.valor }, { h: 'Plano', f: l => l.plano_contas || '' },
          { h: 'Documento', f: l => l.numerodocumento || '' }, { h: 'Descrição', f: l => l.descricao || '' }, { h: 'Usuário', f: l => l.usuario || '' },
        ], rows)} disabled={!rows.length}>⬇️ CSV</button>
      </div>

      <div style={s.cards}>
        <div style={s.card}><div style={s.cardLab}>Lançamentos manuais</div><div style={s.cardVal}>{rows.length}</div></div>
        <div style={s.card}><div style={s.cardLab}>Entradas (crédito)</div><div style={{ ...s.cardVal, color: '#15803d' }}>{brl(totE)}</div></div>
        <div style={s.card}><div style={s.cardLab}>Saídas (débito)</div><div style={{ ...s.cardVal, color: '#b91c1c' }}>{brl(totS)}</div></div>
      </div>
      <CacheBar cache={cache} onAtualizar={() => carregar(true)} atualizando={carregando} />

      {erro && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>{erro}</div>}

      <ScrollX>
        <table style={s.tbl}>
          <thead><tr>{COLS_MANUAIS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />)}</tr></thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                <td style={s.td}>{l.datahora}</td>
                <td style={s.td}>{l.loja}</td>
                <td style={s.td}>{l.conta}</td>
                <td style={s.td}><span style={s.pill(l.credito ? { bg: '#dcfce7', fg: '#15803d' } : { bg: '#fee2e2', fg: '#b91c1c' })}>{l.credito ? 'Entrada' : 'Saída'}</span>{l.reprocesso_cartao ? <span style={{ ...s.pill({ bg: '#e0e7ff', fg: '#4338ca' }), marginLeft: 4 }}>↻ cartão</span> : null}</td>
                <td style={{ ...s.tdNum, color: l.credito ? '#15803d' : '#b91c1c' }}>{brl(l.valor)}</td>
                <td style={{ ...s.td, color: l.plano_contas ? '#334155' : '#cbd5e1' }}>{l.plano_contas || '— sem plano —'}</td>
                <td style={s.td}>{l.numerodocumento || '—'}</td>
                <td style={{ ...s.td, whiteSpace: 'normal', maxWidth: 260 }}>{l.descricao || '—'}</td>
                <td style={s.td}>{l.usuario || '—'}</td>
              </tr>
            ))}
            {!rows.length && !carregando && <tr><td colSpan={9} style={{ ...s.td, textAlign: 'center', color: '#94a3b8', padding: 24 }}>Nenhum lançamento manual no período.</td></tr>}
          </tbody>
        </table>
      </ScrollX>
      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
        Mostra só o que foi digitado à mão na conta corrente (Lançamento de Entrada/Saída) — recargas, descontos a cliente, ajustes.
        Baixas automáticas de cartão e baixas de contas a pagar não entram aqui.
      </p>
    </>
  );
}

// (C) Conciliação bancária: linhas do extrato × conciliadas, por conta/banco.
function ConciliacaoBancaria({ API }) {
  const [loja, setLoja] = useState('');
  const [de, setDe] = useState(iniMes);
  const [ate, setAte] = useState(hojeStr);
  const [contas, setContas] = useState([]);
  const [total, setTotal] = useState({ linhas: 0, conciliadas: 0, pendentes: 0, pct: 0, valor_pendente: 0 });
  const [indice, setIndice] = useState({ contas: [], total: {} });
  const [pontos, setPontos] = useState(15);
  const [sel, setSel] = useState(null);
  const [pend, setPend] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  const qs = useCallback(() => {
    const p = new URLSearchParams();
    if (loja) p.set('loja', loja); if (de) p.set('de', de); if (ate) p.set('ate', ate);
    return p;
  }, [loja, de, ate]);

  const carregar = useCallback(() => {
    setCarregando(true); setErro(null);
    API.get(`/contabilidade/auditoria/bancaria?${qs().toString()}`)
      .then(r => { setContas(r.data.contas || []); setTotal(r.data.total || {}); })
      .catch(e => setErro(e.response?.data?.erro || 'Erro ao carregar conciliação bancária.'))
      .finally(() => setCarregando(false));
    const lp = loja ? `?loja=${encodeURIComponent(loja)}` : '';
    API.get(`/contabilidade/auditoria/bancaria/indice${lp}`).then(r => { setIndice(r.data); if (r.data.total?.pontos_por_dia) setPontos(r.data.total.pontos_por_dia); }).catch(() => {});
  }, [API, qs, loja]);
  useEffect(() => { carregar(); }, [carregar]);

  const salvarPontos = () => API.put('/contabilidade/auditoria/indice-config', { pontos: Number(pontos) || 15 }).then(() => carregar()).catch(() => {});

  const carregarPend = useCallback(() => {
    if (!sel) { setPend([]); return; }
    const p = qs(); p.set('conta', sel);
    API.get(`/contabilidade/auditoria/bancaria/pendentes?${p.toString()}`).then(r => setPend(r.data.pendentes || [])).catch(() => {});
  }, [API, sel, qs]);
  useEffect(() => { carregarPend(); }, [carregarPend]);

  const pctCor = p => p >= 90 ? { bg: '#dcfce7', fg: '#15803d' } : p >= 60 ? { bg: '#fef9c3', fg: '#a16207' } : { bg: '#fee2e2', fg: '#b91c1c' };
  const selConta = contas.find(c => String(c.conta_id) === String(sel));

  return (
    <>
      <div style={s.filtros}>
        <label style={s.lab}>Loja<MultiLojaSelect value={loja} onChange={setLoja} /></label>
        <label style={s.lab}>De<input type="date" style={s.inp} value={de} onChange={e => setDe(e.target.value)} /></label>
        <label style={s.lab}>Até<input type="date" style={s.inp} value={ate} onChange={e => setAte(e.target.value)} /></label>
        <button style={s.btn} onClick={carregar} disabled={carregando}>{carregando ? 'Carregando…' : '🔄 Atualizar'}</button>
        <button style={{ ...s.btn, marginLeft: 'auto' }} onClick={() => baixarCsv('conciliacao-bancaria.csv', [
          { h: 'Conta', f: c => c.conta }, { h: 'Loja', f: c => c.loja }, { h: 'Linhas', f: c => c.linhas }, { h: 'Conciliadas', f: c => c.conciliadas },
          { h: 'Pendentes', f: c => c.pendentes }, { h: '% conciliado', f: c => (c.linhas ? Math.round(c.conciliadas / c.linhas * 1000) / 10 : 0) },
          { h: 'Valor pendente', f: c => c.valor_pendente }, { h: 'Dias atraso médio', f: c => c.dias_atraso_medio || 0 }, { h: 'Pendente + antigo', f: c => c.pendente_mais_antigo || '' },
        ], contas)} disabled={!contas.length}>⬇️ CSV</button>
      </div>

      <div style={s.cards}>
        <div style={s.card}><div style={s.cardLab}>Linhas do extrato</div><div style={s.cardVal}>{(total.linhas || 0).toLocaleString('pt-BR')}</div></div>
        <div style={s.card}><div style={s.cardLab}>% conciliado</div><div style={{ ...s.cardVal, color: (total.pct >= 90 ? '#15803d' : total.pct >= 60 ? '#a16207' : '#b91c1c') }}>{(total.pct || 0)}%</div></div>
        <div style={s.card}><div style={s.cardLab}>Pendentes</div><div style={{ ...s.cardVal, color: '#b91c1c' }}>{(total.pendentes || 0).toLocaleString('pt-BR')}</div></div>
        <div style={s.card}><div style={s.cardLab}>Valor pendente</div><div style={{ ...s.cardVal, color: '#b91c1c' }}>{brl(total.valor_pendente)}</div></div>
      </div>

      {erro && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>{erro}</div>}

      {(() => { const it = indice.total || {}; const ind = it.indice; const corInd = v => v == null ? '#94a3b8' : v >= 80 ? '#15803d' : v >= 50 ? '#b45309' : '#b91c1c';
        return (
        <div style={{ ...s.card, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={s.cardLab}>Índice de conciliação (hoje {it.hoje ? String(it.hoje).split('-').reverse().join('/') : ''})</div>
              <div style={{ fontSize: 44, fontWeight: 700, color: corInd(ind), fontVariantNumeric: 'tabular-nums' }}>{ind != null ? ind : '—'}<span style={{ fontSize: 18, color: '#94a3b8' }}>/100</span></div>
              <div style={s.cardLab}>{it.em_dia || 0} de {it.contas || 0} contas em dia · conta só dias úteis (sem sáb/dom/feriado)</div>
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                Quanto mais dias úteis sem conciliar, menor o índice. Cada dia útil de atraso tira
                <input type="number" min="1" max="100" value={pontos} onChange={e => setPontos(e.target.value)} style={{ ...s.inp, width: 60, padding: '3px 6px' }} /> pontos.
                <button style={{ ...s.btn, padding: '3px 10px', fontSize: 12 }} onClick={salvarPontos}>salvar</button>
              </div>
              <ScrollX>
                <table style={s.tbl}>
                  <thead><tr><th style={s.th}>Conta / Banco</th><th style={s.th}>Loja</th><th style={s.th}>Conciliado até</th><th style={{ ...s.th, textAlign: 'right' }}>Dias úteis atraso</th><th style={{ ...s.th, textAlign: 'right' }}>Pendentes</th><th style={{ ...s.th, textAlign: 'right' }}>Índice</th></tr></thead>
                  <tbody>
                    {(indice.contas || []).slice().sort((a, b) => (a.indice ?? 999) - (b.indice ?? 999)).map((c, i) => (
                      <tr key={i}>
                        <td style={{ ...s.td, fontWeight: 600 }}>{c.conta}</td>
                        <td style={s.td}>{c.loja}</td>
                        <td style={s.td}>{c.conciliado_ate ? String(c.conciliado_ate).split('-').reverse().join('/') : <span style={{ color: '#b91c1c' }}>nunca</span>}</td>
                        <td style={{ ...s.tdNum, color: (c.dias_uteis_atraso || 0) > 2 ? '#b91c1c' : (c.dias_uteis_atraso || 0) > 0 ? '#b45309' : '#15803d' }}>{c.dias_uteis_atraso != null ? c.dias_uteis_atraso : '—'}</td>
                        <td style={{ ...s.tdNum, color: c.pendentes > 0 ? '#b91c1c' : '#94a3b8' }}>{Number(c.pendentes || 0).toLocaleString('pt-BR')}</td>
                        <td style={s.tdNum}><span style={{ ...s.pill(c.indice == null ? { bg: '#f1f5f9', fg: '#94a3b8' } : c.indice >= 80 ? { bg: '#dcfce7', fg: '#15803d' } : c.indice >= 50 ? { bg: '#fef9c3', fg: '#a16207' } : { bg: '#fee2e2', fg: '#b91c1c' }) }}>{c.indice != null ? c.indice : '—'}</span></td>
                      </tr>
                    ))}
                    {!(indice.contas || []).length && <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }}>Sem contas bancárias.</td></tr>}
                  </tbody>
                </table>
              </ScrollX>
            </div>
          </div>
        </div>
        ); })()}

      <div style={{ fontWeight: 700, fontSize: 14, margin: '4px 0 8px' }}>Detalhe por conta no período</div>
      <ScrollX>
        <table style={s.tbl}>
          <thead><tr>
            <th style={s.th}>Conta / Banco</th><th style={s.th}>Loja</th><th style={{ ...s.th, textAlign: 'right' }}>Linhas</th><th style={{ ...s.th, textAlign: 'right' }}>Conciliadas</th>
            <th style={{ ...s.th, textAlign: 'right' }}>Pendentes</th><th style={{ ...s.th, textAlign: 'right' }}>% conciliado</th>
            <th style={{ ...s.th, textAlign: 'right' }}>Valor pendente</th><th style={{ ...s.th, textAlign: 'right' }}>Dias atraso médio</th><th style={s.th}>Pendente + antigo</th>
          </tr></thead>
          <tbody>
            {contas.map((c, i) => {
              const pct = c.linhas ? Math.round(c.conciliadas / c.linhas * 1000) / 10 : 0;
              return (
                <tr key={i} style={{ cursor: 'pointer', background: String(sel) === String(c.conta_id) ? '#e6f3f0' : undefined }} onClick={() => setSel(String(sel) === String(c.conta_id) ? null : c.conta_id)}>
                  <td style={{ ...s.td, fontWeight: 600 }}>{c.conta}</td>
                  <td style={s.td}>{c.loja}</td>
                  <td style={s.tdNum}>{Number(c.linhas).toLocaleString('pt-BR')}</td>
                  <td style={s.tdNum}>{Number(c.conciliadas).toLocaleString('pt-BR')}</td>
                  <td style={{ ...s.tdNum, color: c.pendentes > 0 ? '#b91c1c' : '#94a3b8' }}>{Number(c.pendentes).toLocaleString('pt-BR')}</td>
                  <td style={s.tdNum}><span style={s.pill(pctCor(pct))}>{pct}%</span></td>
                  <td style={{ ...s.tdNum, color: '#b91c1c' }}>{brl(c.valor_pendente)}</td>
                  <td style={{ ...s.tdNum, color: Number(c.dias_atraso_medio) > 30 ? '#b91c1c' : '#334155' }}>{c.dias_atraso_medio != null ? `${c.dias_atraso_medio} d` : '—'}</td>
                  <td style={s.td}>{c.pendente_mais_antigo || '—'}</td>
                </tr>
              );
            })}
            {!contas.length && !carregando && <tr><td colSpan={9} style={{ ...s.td, textAlign: 'center', color: '#94a3b8', padding: 24 }}>Nenhum extrato bancário no período.</td></tr>}
          </tbody>
        </table>
      </ScrollX>

      {sel && (
        <div style={{ ...s.card, marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Linhas pendentes — {selConta ? selConta.conta : ''}</div>
          <ScrollX>
            <table style={s.tbl}>
              <thead><tr>{['Data', 'Tipo', 'Valor', 'Documento', 'Descrição'].map(h => <th key={h} style={h === 'Valor' ? { ...s.th, textAlign: 'right' } : s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {pend.map((l, i) => (
                  <tr key={i}>
                    <td style={s.td}>{l.data ? String(l.data).split('-').reverse().join('/') : '—'}</td>
                    <td style={s.td}>{l.tipo || '—'}</td>
                    <td style={{ ...s.tdNum, color: Number(l.valor) < 0 ? '#b91c1c' : '#15803d' }}>{brl(l.valor)}</td>
                    <td style={s.td}>{l.numerodocumento || '—'}</td>
                    <td style={{ ...s.td, whiteSpace: 'normal', maxWidth: 320 }}>{l.descricao || '—'}</td>
                  </tr>
                ))}
                {!pend.length && <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#94a3b8' }}>Sem linhas pendentes nesta conta.</td></tr>}
              </tbody>
            </table>
          </ScrollX>
        </div>
      )}
      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
        Conciliação bancária: linhas do extrato do banco (OFX/CNAB importado) × quantas já foram conciliadas com o movimento da conta corrente. Pendente = linha do extrato ainda sem baixa casada. Clique numa conta para ver as pendentes.
      </p>
    </>
  );
}

// (B) Conciliação de cartão: situação por operadora.
function ConciliacaoAudit({ API }) {
  const [de, setDe] = useState(iniMes);
  const [ate, setAte] = useState(hojeStr);
  const [ops, setOps] = useState([]);
  const [total, setTotal] = useState({ itens: 0, conciliados: 0, pendentes: 0, pct: 0, valor_pendente: 0 });
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(() => {
    setCarregando(true); setErro(null);
    const p = new URLSearchParams();
    if (de) p.set('de', de);
    if (ate) p.set('ate', ate);
    API.get(`/contabilidade/auditoria/conciliacao?${p.toString()}`)
      .then(r => { setOps(r.data.operadoras || []); setTotal(r.data.total || {}); })
      .catch(e => setErro(e.response?.data?.erro || 'Erro ao carregar conciliação.'))
      .finally(() => setCarregando(false));
  }, [API, de, ate]);
  useEffect(() => { carregar(); }, [carregar]);

  const pctCor = p => p >= 90 ? { bg: '#dcfce7', fg: '#15803d' } : p >= 60 ? { bg: '#fef9c3', fg: '#a16207' } : { bg: '#fee2e2', fg: '#b91c1c' };

  return (
    <>
      <div style={s.filtros}>
        <label style={s.lab}>Venc. de<input type="date" style={s.inp} value={de} onChange={e => setDe(e.target.value)} /></label>
        <label style={s.lab}>Venc. até<input type="date" style={s.inp} value={ate} onChange={e => setAte(e.target.value)} /></label>
        <button style={s.btn} onClick={carregar} disabled={carregando}>{carregando ? 'Carregando…' : '🔄 Atualizar'}</button>
        <button style={{ ...s.btn, marginLeft: 'auto' }} onClick={() => baixarCsv('conciliacao-cartao.csv', [
          { h: 'Operadora', f: o => o.operadora }, { h: 'Itens', f: o => o.itens }, { h: 'Conciliados', f: o => o.conciliados },
          { h: 'Pendentes', f: o => o.pendentes }, { h: '% conciliado', f: o => (o.itens ? Math.round(o.conciliados / o.itens * 1000) / 10 : 0) },
          { h: 'Valor pendente', f: o => o.valor_pendente }, { h: 'Dias atraso médio', f: o => o.dias_atraso_medio || 0 }, { h: 'Pendente + antigo', f: o => o.pendente_mais_antigo || '' },
        ], ops)} disabled={!ops.length}>⬇️ CSV</button>
      </div>

      <div style={s.cards}>
        <div style={s.card}><div style={s.cardLab}>Itens no período</div><div style={s.cardVal}>{(total.itens || 0).toLocaleString('pt-BR')}</div></div>
        <div style={s.card}><div style={s.cardLab}>% conciliado</div><div style={{ ...s.cardVal, color: (total.pct >= 90 ? '#15803d' : total.pct >= 60 ? '#a16207' : '#b91c1c') }}>{(total.pct || 0)}%</div></div>
        <div style={s.card}><div style={s.cardLab}>Pendentes</div><div style={{ ...s.cardVal, color: '#b91c1c' }}>{(total.pendentes || 0).toLocaleString('pt-BR')}</div></div>
        <div style={s.card}><div style={s.cardLab}>Valor pendente</div><div style={{ ...s.cardVal, color: '#b91c1c' }}>{brl(total.valor_pendente)}</div></div>
      </div>

      {erro && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>{erro}</div>}

      <ScrollX>
        <table style={s.tbl}>
          <thead><tr>
            <th style={s.th}>Operadora</th><th style={{ ...s.th, textAlign: 'right' }}>Itens</th><th style={{ ...s.th, textAlign: 'right' }}>Conciliados</th>
            <th style={{ ...s.th, textAlign: 'right' }}>Pendentes</th><th style={{ ...s.th, textAlign: 'right' }}>% conciliado</th>
            <th style={{ ...s.th, textAlign: 'right' }}>Valor pendente</th><th style={{ ...s.th, textAlign: 'right' }}>Dias atraso médio</th><th style={s.th}>Pendente + antigo</th>
          </tr></thead>
          <tbody>
            {ops.map((o, i) => {
              const pct = o.itens ? Math.round(o.conciliados / o.itens * 1000) / 10 : 0;
              return (
                <tr key={i}>
                  <td style={{ ...s.td, fontWeight: 600 }}>{o.operadora}</td>
                  <td style={s.tdNum}>{Number(o.itens).toLocaleString('pt-BR')}</td>
                  <td style={s.tdNum}>{Number(o.conciliados).toLocaleString('pt-BR')}</td>
                  <td style={{ ...s.tdNum, color: o.pendentes > 0 ? '#b91c1c' : '#94a3b8' }}>{Number(o.pendentes).toLocaleString('pt-BR')}</td>
                  <td style={s.tdNum}><span style={s.pill(pctCor(pct))}>{pct}%</span></td>
                  <td style={{ ...s.tdNum, color: '#b91c1c' }}>{brl(o.valor_pendente)}</td>
                  <td style={{ ...s.tdNum, color: Number(o.dias_atraso_medio) > 30 ? '#b91c1c' : '#334155' }}>{o.dias_atraso_medio != null ? `${o.dias_atraso_medio} d` : '—'}</td>
                  <td style={s.td}>{o.pendente_mais_antigo || '—'}</td>
                </tr>
              );
            })}
            {!ops.length && !carregando && <tr><td colSpan={8} style={{ ...s.td, textAlign: 'center', color: '#94a3b8', padding: 24 }}>Nenhuma conciliação no período.</td></tr>}
          </tbody>
        </table>
      </ScrollX>
      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
        Mede quanto do cartão já foi conciliado (baixado) × o que ficou pendente e há quantos dias.
        O atraso médio é hoje menos o vencimento dos itens ainda pendentes.
      </p>
    </>
  );
}

// Cadastro de feriados (personalizados/municipais) — somados aos nacionais/Bahia já calculados.
function Feriados({ API }) {
  const [calc, setCalc] = useState([]);
  const [cad, setCad] = useState([]);
  const [data, setData] = useState('');
  const [nome, setNome] = useState('');
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    API.get('/contabilidade/feriados').then(r => { setCalc(r.data.calculados || []); setCad(r.data.cadastrados || []); }).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  const add = () => {
    if (!data) { setMsg('Informe a data.'); return; }
    API.post('/contabilidade/feriados', { data, nome }).then(() => { setData(''); setNome(''); setMsg(''); carregar(); }).catch(e => setMsg(e.response?.data?.erro || 'Erro.'));
  };
  const remover = (d) => { if (!window.confirm('Remover este feriado?')) return; API.delete(`/contabilidade/feriados/${d}`).then(carregar).catch(() => {}); };
  const fmt = d => d ? String(d).split('-').reverse().join('/') : '';

  return (
    <>
      <p style={s.sub}>Feriados usados pra contar <b>dias úteis</b> no índice de conciliação. Os nacionais e o da Bahia (02/07) já vêm calculados; aqui você adiciona os <b>municipais</b> ou outros específicos.</p>
      <div style={s.filtros}>
        <label style={s.lab}>Data<input type="date" style={s.inp} value={data} onChange={e => setData(e.target.value)} /></label>
        <label style={s.lab}>Nome<input style={{ ...s.inp, minWidth: 200 }} value={nome} onChange={e => setNome(e.target.value)} placeholder="ex.: Aniversário da cidade" /></label>
        <button style={{ ...s.btn, background: '#0d6b5e', color: '#fff', borderColor: '#0d6b5e' }} onClick={add}>＋ Adicionar feriado</button>
        {msg && <span style={{ color: '#b91c1c', fontSize: 13 }}>{msg}</span>}
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, margin: '6px 0 8px' }}>Feriados cadastrados (seus)</div>
      <ScrollX>
        <table style={s.tbl}>
          <thead><tr><th style={s.th}>Data</th><th style={s.th}>Nome</th><th style={s.th}></th></tr></thead>
          <tbody>
            {cad.map((f, i) => (
              <tr key={i}>
                <td style={s.td}>{fmt(f.data)}</td>
                <td style={s.td}>{f.nome || '—'}</td>
                <td style={s.td}><button style={{ ...s.btn, padding: '3px 8px', fontSize: 12, color: '#b91c1c' }} onClick={() => remover(f.data)}>🗑 remover</button></td>
              </tr>
            ))}
            {!cad.length && <tr><td colSpan={3} style={{ ...s.td, textAlign: 'center', color: '#94a3b8', padding: 18 }}>Nenhum feriado cadastrado. Os nacionais/Bahia já contam automático.</td></tr>}
          </tbody>
        </table>
      </ScrollX>

      <div style={{ fontWeight: 700, fontSize: 14, margin: '18px 0 8px' }}>Já calculados (nacionais + Bahia) <span style={{ fontWeight: 400, fontSize: 12, color: '#94a3b8' }}>— ano atual e próximo</span></div>
      <ScrollX>
        <table style={s.tbl}>
          <thead><tr><th style={s.th}>Data</th><th style={s.th}>Nome</th></tr></thead>
          <tbody>
            {calc.map((f, i) => (
              <tr key={i}><td style={s.td}>{fmt(f.data)}</td><td style={{ ...s.td, color: '#64748b' }}>{f.nome}</td></tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
    </>
  );
}
