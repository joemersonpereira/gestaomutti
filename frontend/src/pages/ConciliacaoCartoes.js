import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';

// Conciliação de Cartões — a Tesouraria sobe o relatório de cada operadora todo dia; o sistema
// confronta com o que o ERP registrou e lista o que precisa ser corrigido à mão no ERP.
const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlK = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const dBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
// baixa CSV (Excel): cols = [{h:'título', f:linha=>valor}], num(x) formata número com vírgula decimal
const num = x => x == null || x === '' ? '' : String(x).replace('.', ',');
function baixarCSV(nome, cols, linhas) {
  const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const txt = [cols.map(c => esc(c.h)).join(';'), ...linhas.map(l => cols.map(c => esc(c.f(l))).join(';'))].join('\n');
  const blob = new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = (nome || 'export') + '.csv'; a.click(); URL.revokeObjectURL(a.href);
}
const mesAtual = () => { const h = new Date(); return { ini: `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`, fim: h.toISOString().slice(0, 10) }; };
// mesmo enum do backend (GRUPOS/ROTULO_GRUPO em conciliacaoCartao.js) — é taxonomia de código, não cadastro
const GRUPOS_PAGAMENTO = ['DEBITO', 'CREDITO', 'PARCELADO', 'VOUCHER', 'PIX', 'CREDIARIO', 'PREPAGO', 'OUTRO'];
const ROTULO_GRUPO_PAGAMENTO = { DEBITO: 'Débito', CREDITO: 'Crédito à vista', PARCELADO: 'Crédito parcelado', VOUCHER: 'Voucher/benefício', PIX: 'Pix', CREDIARIO: 'Crediário', PREPAGO: 'Pré-pago', OUTRO: 'Outro' };

// Blindagem: se qualquer tela do módulo estourar ao montar, mostra o erro em vez de deixar a
// página inteira branca (e informa a mensagem exata pra corrigir). Reinicia ao trocar de aba/loja.
class Blindagem extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { try { console.error('[ConciliacaoCartoes] render error:', err, info); } catch { /* ignora */ } }
  render() {
    if (this.state.err) {
      const msg = String((this.state.err && this.state.err.message) || this.state.err);
      return (
        <div style={{ background: '#FBEAEA', border: '1px solid #F0C7C7', color: '#8A2E2E', borderRadius: 10, padding: '14px 16px', fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ Algo quebrou ao montar esta tela (mas a página não some mais).</div>
          <div style={{ marginBottom: 8 }}>Tire um print desta mensagem e me mande — ela diz exatamente o que falhou. Troque a loja/aba ou clique abaixo para tentar de novo.</div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, background: '#fff', border: '1px solid #f0c7c7', borderRadius: 8, padding: '8px 10px', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{msg}</div>
          <button onClick={() => this.setState({ err: null })} style={{ marginTop: 10, fontSize: 12.5, padding: '7px 12px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>tentar de novo</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ConciliacaoCartoes() {
  const { API } = useAuth();
  const [aba, setAba] = useState('painel');
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  const [per, setPer] = useState(mesAtual());
  const [fonte, setFonte] = useState('erp');
  const [grupo, setGrupo] = useState('');
  const [tipoIni, setTipoIni] = useState('');
  useEffect(() => { API.get('/conciliacao-cartao/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  const filtros = { ini: per.ini, fim: per.fim, loja, fonte, grupo };

  return (
    <div style={s.wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '6px 0 12px', borderBottom: '1px solid var(--line,#ddd8cf)', marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#1e293b' }}>💳 Conciliação de Cartões</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--fg-soft,#64748b)', margin: '0 0 16px' }}>O relatório da operadora × o que o ERP registrou. Como o PDV não fala com o TEF, o que a operadora diz é a verdade.</p>
      <div style={{ ...s.card, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={s.fld}>De<input type="date" value={per.ini} onChange={e => setPer(p => ({ ...p, ini: e.target.value }))} style={s.inp} /></label>
        <label style={s.fld}>Até<input type="date" value={per.fim} onChange={e => setPer(p => ({ ...p, fim: e.target.value }))} style={s.inp} /></label>
        <label style={s.fld}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}>
          <option value="">Todas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        <label style={s.fld}>Forma de pagamento<select value={grupo} onChange={e => setGrupo(e.target.value)} style={s.inp}>
          <option value="">Todas</option>{GRUPOS_PAGAMENTO.map(g => <option key={g} value={g}>{ROTULO_GRUPO_PAGAMENTO[g]}</option>)}</select></label>
        <label style={s.fld}>Conferir com<select value={fonte} onChange={e => setFonte(e.target.value)} style={s.inp}>
          <option value="erp">Conferência automática (arquivos que o ERP já recebe)</option>
          <option value="arquivos">Relatórios que eu subi</option>
        </select></label>
        <button onClick={() => setPer(mesAtual())} style={{ ...s.chip, marginLeft: 'auto' }}>mês atual</button>
      </div>
      <div style={{ ...s.nota, marginTop: -4, marginBottom: 10 }}>
        {fonte === 'erp'
          ? '🔄 Conferindo com os arquivos de conciliação que as credenciadoras já mandam para o ERP (Rede e Brasil Card/Bolt) — não precisa subir nada. Para Le Card, Nutricash, Bracov e Alelo, use "Relatórios que eu subi".'
          : '📥 Conferindo com os relatórios que a Tesouraria subiu na aba Importar.'}
      </div>
      <div style={{ display: 'flex', gap: 6, margin: '4px 0 14px', flexWrap: 'wrap' }}>
        {[['painel', '📊 Painel do mês'], ['importar', '📥 Importar relatório'], ['diverg', '⚠️ Divergências'],
          ['pendentes', '⏳ Vendas a conciliar'], ['recebimentos', '💵 Recebimentos futuros'], ['sem-operadora', '🏷️ Sem operadora'],
          ['taxas', '🏧 Taxas de máquina'], ['combinado', '📑 Taxas combinadas'], ['maquinas', '🖥️ Aluguel de máquinas'],
          ['repasses', '💰 Repasses'], ['correcoes', '🔧 Correções no ERP'], ['ajustes', '⚙️ Ajustes']].map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      <Blindagem key={aba + '|' + loja + '|' + fonte + '|' + grupo + '|' + per.ini + '|' + per.fim}>
        {aba === 'painel' && <Painel API={API} f={filtros} irPara={t => { setTipoIni(t); setAba('diverg'); }} />}
        {aba === 'importar' && <Importar API={API} lojas={lojas} />}
        {aba === 'diverg' && <Divergencias API={API} f={filtros} tipoIni={tipoIni} />}
        {aba === 'pendentes' && <AguardandoRelatorio API={API} f={filtros} />}
        {aba === 'sem-operadora' && <SemOperadora API={API} f={filtros} />}
        {aba === 'recebimentos' && <RecebimentosFuturos API={API} f={filtros} />}
        {aba === 'taxas' && <TaxasMaquina API={API} f={filtros} />}
        {aba === 'combinado' && <TaxasCombinadas API={API} f={filtros} lojas={lojas} />}
        {aba === 'maquinas' && <AluguelMaquinas API={API} f={filtros} />}
        {aba === 'repasses' && <Repasses API={API} f={filtros} lojas={lojas} />}
        {aba === 'correcoes' && <Correcoes API={API} f={filtros} />}
        {aba === 'ajustes' && <Ajustes API={API} />}
      </Blindagem>
    </div>
  );
}

// Cache fora do componente (sobrevive a trocar de aba e voltar — o componente desmonta e
// remonta, mas o Map continua vivo). Evita reconsultar o ERP e mostrar "carregando…" de novo
// quando o usuário só voltou pra uma tela que já tinha acabado de ver.
const CACHE_UI = new Map();
const TTL_UI_MS = 120000;

function useDados(API, url, params, deps) {
  const chaveInicial = url + '|' + JSON.stringify(params);
  const jaTinha = CACHE_UI.get(chaveInicial);
  const fresco = jaTinha && (Date.now() - jaTinha.ts < TTL_UI_MS);
  const [d, setD] = useState(fresco ? jaTinha.data : null);
  const [carreg, setCarreg] = useState(!fresco);
  const buscar = useCallback((forcar) => {
    const chave = url + '|' + JSON.stringify(params);
    if (!forcar) {
      const c = CACHE_UI.get(chave);
      if (c && (Date.now() - c.ts < TTL_UI_MS)) { setD(c.data); setCarreg(false); return; }
    }
    setCarreg(true);
    API.get(url, { params }).then(r => { CACHE_UI.set(chave, { ts: Date.now(), data: r.data }); setD(r.data); })
      .catch(e => setD({ erro: e.response?.data?.erro || e.message })).finally(() => setCarreg(false));
  }, deps); // eslint-disable-line
  useEffect(() => { buscar(false); }, [buscar]);
  // recarregar (chamado após uma mudança — importar, marcar tratativa) sempre busca de novo,
  // nunca serve do cache — senão a tela mostraria o dado de antes da mudança por até 2 minutos.
  const recarregar = useCallback(() => buscar(true), [buscar]);
  return [d, carreg, recarregar];
}

function Stat({ n, l, cor = '#1e293b', bg, sub }) {
  return <div style={{ background: bg || '#fff', border: '1px solid #e5e7eb', borderLeft: '4px solid ' + (cor === '#1e293b' ? '#cbd5e1' : cor), borderRadius: 10, padding: '12px 14px', minWidth: 150, flex: '1 1 150px' }}>
    <div style={{ fontSize: 11.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: .3 }}>{l}</div>
    <div style={{ fontSize: 23, fontWeight: 800, color: cor, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{n}</div>
    {sub != null && sub !== '' && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
  </div>;
}

// barra horizontal simples (nome + valor)
function Barras({ itens, titulo, campo = 'n', sufixo = '', cor = '#7A4FB0', vazio = 'nada por aqui' , max: maxProp }) {
  const lista = (itens || []).slice(0, 12);
  const max = maxProp || Math.max(...lista.map(i => Number(i[campo]) || 0), 1);
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{titulo}</div>
      {!lista.length && <div style={s.vazio}>{vazio}</div>}
      {lista.map((i, k) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 60px', gap: 8, alignItems: 'center', marginBottom: 7 }}>
          <div>
            <div style={{ fontSize: 12, marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
              <span>{i.nome}</span>
              {i.valor != null && <span style={{ color: '#999', fontSize: 11 }}>{brl(i.valor)}</span>}
            </div>
            <div style={{ background: '#F1F3F5', borderRadius: 5, height: 12, overflow: 'hidden' }}>
              <div style={{ width: (100 * (Number(i[campo]) || 0) / max) + '%', background: cor, height: '100%', minWidth: 2 }} />
            </div>
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{i[campo]}{sufixo}</span>
        </div>
      ))}
    </div>
  );
}

// ── Painel (BI do mês) ─────────────────────────────────────────────────────
function Painel({ API, f, irPara }) {
  const [d, carreg] = useDados(API, '/conciliacao-cartao/painel', f, [API, f.ini, f.fim, f.loja, f.grupo]);
  const usaErp = f.fonte === 'erp';
  const [edi, carregEdi] = useDados(API, usaErp ? '/conciliacao-cartao/edi' : '/conciliacao-cartao/lojas',
    usaErp ? { ini: f.ini, fim: f.fim, loja: f.loja, grupo: f.grupo } : {}, [API, f.ini, f.fim, f.loja, f.grupo, usaErp]);
  if (carreg || !d || (usaErp && (carregEdi || !edi))) return <div style={s.vazio}>carregando… (conferindo transação por transação com o ERP)</div>;
  if (d.erro) return <div style={s.erroBox}>⚠️ {d.erro}</div>;
  const conf = usaErp ? { resumo: edi.resumo, avisos: edi.avisos || [], vazio: !edi.resumo?.linhasOperadora } : (d.confronto || {});
  const r = conf.resumo || {}; const corr = d.correcoes || {};
  const semRelatorio = usaErp ? (edi.diasSemRelatorio || []) : (d.diasSemRelatorio || []);
  return (
    <>
      {(() => {
        const pct = r.pctCasado;
        const pctCor = pct == null ? '#94a3b8' : pct >= 95 ? '#15803d' : pct >= 80 ? '#B7791F' : '#C0392B';
        const KPI = ({ l, v, cor, bg, sub }) => (
          <div style={{ ...s.card, margin: 0, borderLeft: '4px solid ' + (cor || '#cbd5e1'), background: bg || '#fff' }}>
            <div style={{ fontSize: 11.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: .3 }}>{l}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: cor || '#1e293b', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{v}</div>
            {sub != null && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
          </div>
        );
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 12 }}>
            {/* Hero: % casado com barra */}
            <div style={{ ...s.card, margin: 0, gridColumn: 'span 1' }}>
              <div style={{ fontSize: 11.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: .3 }}>% casaram com o ERP</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: pctCor, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{pct != null ? pct + '%' : '—'}</div>
              <div style={{ height: 8, borderRadius: 4, background: '#eef2f0', overflow: 'hidden', margin: '6px 0 4px' }}><div style={{ width: Math.min(100, pct || 0) + '%', height: '100%', background: pctCor }} /></div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{(r.casados ?? 0).toLocaleString('pt-BR')} de {(r.linhasOperadora ?? 0).toLocaleString('pt-BR')} transações</div>
            </div>
            <KPI l="Divergências em aberto" v={(r.abertas ?? 0).toLocaleString('pt-BR')} cor="#C0392B" bg="#FBEAEA" sub={`de ${r.divergencias ?? 0} encontradas`} />
            <KPI l="Valor envolvido" v={brlK(r.valorDivergente || 0)} cor="#C0392B" bg="#FBEAEA" />
            <KPI l="Correções já feitas no ERP" v={corr.total ?? '—'} cor="#B7791F" bg="#FDF6E7" sub={corr.trocaDeForma != null ? `${corr.trocaDeForma} trocaram a forma` : ''} />
            <KPI l="Total no relatório da operadora" v={brlK(r.valorOperadora || 0)} cor="#0d6b5e" />
          </div>
        );
      })()}

      {/* O que fazer agora: cada tipo de erro vira um botão que abre a lista já filtrada. */}
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>O que precisa ser corrigido no ERP</div>
        <div style={{ fontSize: 11.5, color: '#888', marginBottom: 10 }}>Clique no tipo para ver a lista, com loja, hora, NSU e quem passou a venda.</div>
        {!(r.porTipo || []).length && <div style={s.vazio}>nada pendente no período 🎉</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
          {(r.porTipo || []).map(t => (
            <button key={t.tipo} onClick={() => irPara && irPara(t.tipo)} title="Ver a lista"
              style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid ' + t.cor + '33', background: t.cor + '0D',
                borderRadius: 10, padding: '10px 12px', borderLeft: '4px solid ' + t.cor }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: t.cor, fontVariantNumeric: 'tabular-nums' }}>{t.n}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>{t.rotulo}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{brl(t.valor)} · {t.abertas} em aberto →</div>
            </button>))}
        </div>
      </div>

      {(conf.avisos || []).map((a, i) => <div key={i} style={s.aviso}>💡 {a}</div>)}
      {conf.vazio && <div style={s.aviso}>{usaErp
        ? 'O ERP não recebeu arquivo de conciliação nesse período. Use "Relatórios que eu subi".'
        : <>Nenhum relatório importado nesse período — comece pela aba <b>Importar relatório</b>.</>}</div>}
      {semRelatorio.length > 0 && !conf.vazio && (
        <div style={s.aviso}>📅 <b>{semRelatorio.length} dia(s) ainda sem dado pra conferir</b>{usaErp ? ' (o ERP não recebeu o arquivo da credenciadora)' : ''} no período: {semRelatorio.slice(0, 12).map(dBR).join(', ')}{semRelatorio.length > 12 ? '…' : ''} — as vendas de cartão desses dias ficam pendentes, não é erro.</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10 }}>
        <RankingOperadores itens={r.porOperador || []} />
        <Barras titulo="Erros por tipo" itens={(r.porTipo || []).map(t => ({ nome: t.rotulo, n: t.n, valor: t.valor }))} cor="#C0392B" vazio="nenhuma divergência no período 🎉" />
        <Barras titulo="Erros por loja" itens={r.porLoja || []} cor="#2E5C9E" />
        <Barras titulo="Erros por dia" itens={r.porDia || []} cor="#7A4FB0" />
        {corr.porTroca && <Barras titulo="Correções no ERP: de → para" itens={corr.porTroca} cor="#B7791F" vazio="nenhuma correção no período" />}
        {corr.porLoja && <Barras titulo="Correções por loja" itens={corr.porLoja} cor="#C87A1E" />}
      </div>

      {d.lotes?.length > 0 && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Relatórios importados no período</div>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{['Operadora', 'Lotes', 'Transações', 'Valor', 'Último envio'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>{d.lotes.map((l, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={{ ...s.td, fontWeight: 600 }}>{l.operadora}</td>
                <td style={s.td}>{l.lotes}</td><td style={s.td}>{l.linhas}</td>
                <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>{brl(l.valor)}</td>
                <td style={{ ...s.td, color: '#999' }}>{String(l.ultimo || '').slice(0, 16).replace('T', ' ')}</td>
              </tr>))}</tbody>
          </table></div>
        </div>
      )}
    </>
  );
}

function RankingOperadores({ itens }) {
  const lista = (itens || []).slice(0, 12);
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>Operadores com mais erros</div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>Índice = erros a cada 100 vendas de cartão (só quem passou de 20 vendas no período).</div>
      {!lista.length && <div style={s.vazio}>nenhum erro de digitação no período 🎉</div>}
      {lista.map((o, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{o.nome}</div>
            <div style={{ fontSize: 11, color: '#888' }}>
              {o.n} erro(s) em {o.vendas} vendas · {brl(o.valor)}
              {o.forma > 0 && ` · forma: ${o.forma}`}{o.parcelas > 0 && ` · parcelas: ${o.parcelas}`}{o.valorDif > 0 && ` · valor: ${o.valorDif}`}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: o.indice >= 2 ? '#C0392B' : o.indice >= 1 ? '#C87A1E' : '#1E874B', fontVariantNumeric: 'tabular-nums' }}>
              {o.indice != null ? o.indice + '%' : '—'}
            </div>
            <div style={{ fontSize: 10, color: '#aaa' }}>índice</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Aguardando relatório: TODA venda de cartão do ERP (qualquer operadora/bandeira) que ainda
// não cruzou com nenhum relatório — nem o importado manualmente, nem o EDI automático (Rede/
// Brasil Card). Não é divergência (a operadora pode ter pago certinho), é só "ainda não dá pra
// saber" porque falta cruzar o valor daquela venda com algum relatório.
const LIMITE_TABELA = 1000;

function AguardandoRelatorio({ API, f }) {
  const [d, carreg] = useDados(API, '/conciliacao-cartao/pendentes', f, [API, f.ini, f.fim, f.loja, f.grupo]);
  const [filtroOp, setFiltroOp] = useState('');
  const [filtroMod, setFiltroMod] = useState('');
  const [buscaOperador, setBuscaOperador] = useState('');
  const [buscaNsu, setBuscaNsu] = useState('');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');
  if (carreg || !d) return <div style={s.vazio}>carregando…</div>;
  if (d.erro) return <div style={s.erroBox}>⚠️ {d.erro}</div>;
  const todas = d.pendentes || [];
  const modalidades = [...new Set(todas.map(p => p.modalidade))].sort();
  const lista = todas.filter(p => (!filtroOp || p.operadora === filtroOp)
    && (!filtroMod || p.modalidade === filtroMod)
    && (!buscaOperador || (p.operador || '').toLowerCase().includes(buscaOperador.toLowerCase()))
    && (!buscaNsu || String(p.nsu || p.autorizacao || '').includes(buscaNsu))
    && (!valorMin || p.valor >= Number(valorMin))
    && (!valorMax || p.valor <= Number(valorMax)));
  const limparFiltros = () => { setFiltroOp(''); setFiltroMod(''); setBuscaOperador(''); setBuscaNsu(''); setValorMin(''); setValorMax(''); };
  const exportar = () => baixarCSV('vendas-a-conciliar', [
    { h: 'Operadora', f: p => p.operadora }, { h: 'Data', f: p => dBR(p.data) }, { h: 'Hora', f: p => (p.hora || '').slice(0, 5) },
    { h: 'Loja', f: p => p.loja }, { h: 'Modalidade', f: p => p.modalidade }, { h: 'NSU', f: p => p.nsu || p.autorizacao || '' },
    { h: 'Operador', f: p => p.operador || '' }, { h: 'Valor', f: p => num(p.valor) },
  ], lista);
  return (
    <>
      <div style={s.nota}>
        ⏳ Vendas de cartão que já estão no ERP mas ainda não cruzaram com nenhum relatório de operadora nem com o EDI automático —
        pode estar tudo certo, só falta subir o arquivo (ou chegar o EDI) pra confirmar. Suba em <b>Importar relatório</b>.
      </div>

      {(d.avisos || []).map((a, i) => <div key={i} style={s.aviso}>💡 {a}</div>)}

      <div style={{ ...s.card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Stat n={d.resumo?.total ?? 0} l="Vendas aguardando relatório" cor={d.resumo?.total ? '#C87A1E' : '#1E874B'} bg={d.resumo?.total ? '#FDF6E7' : '#EAF6EF'} />
        <Stat n={brlK(d.resumo?.valor || 0)} l="Valor envolvido" cor="#C87A1E" />
      </div>

      {!!(d.resumo?.porOperadora || []).length && (
        <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setFiltroOp('')} style={{ ...s.chip, ...(!filtroOp ? s.chipOn : {}) }}>todas</button>
          {d.resumo.porOperadora.map(o => (
            <button key={o.operadora} onClick={() => setFiltroOp(o.operadora)}
              style={{ ...s.chip, ...(filtroOp === o.operadora ? s.chipOn : {}) }}>
              {o.operadora} · {o.n} · {brl(o.valor)}
            </button>
          ))}
        </div>
      )}

      <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={s.fld}>Modalidade<select value={filtroMod} onChange={e => setFiltroMod(e.target.value)} style={s.inp}>
          <option value="">Todas</option>{modalidades.map(m => <option key={m} value={m}>{m}</option>)}</select></label>
        <label style={s.fld}>Operador<input value={buscaOperador} onChange={e => setBuscaOperador(e.target.value)} placeholder="nome…" style={s.inp} /></label>
        <label style={s.fld}>NSU<input value={buscaNsu} onChange={e => setBuscaNsu(e.target.value)} placeholder="número…" style={s.inp} /></label>
        <label style={s.fld}>Valor de<input type="number" value={valorMin} onChange={e => setValorMin(e.target.value)} placeholder="0" style={{ ...s.inp, width: 90 }} /></label>
        <label style={s.fld}>até<input type="number" value={valorMax} onChange={e => setValorMax(e.target.value)} placeholder="—" style={{ ...s.inp, width: 90 }} /></label>
        <button onClick={limparFiltros} style={s.chip}>limpar filtros</button>
        <button onClick={exportar} disabled={!lista.length} style={{ ...s.chip, ...s.chipOn, marginLeft: 'auto' }}>⬇️ Excel detalhado</button>
      </div>

      <div style={{ ...s.card, overflowX: 'auto' }}>
        {!lista.length && <div style={s.vazio}>nada aguardando relatório no período 🎉</div>}
        {lista.length > LIMITE_TABELA && <div style={s.aviso}>⚠️ Mostrando {LIMITE_TABELA} de {lista.length} registros — refine os filtros acima pra ver o resto.</div>}
        {!!lista.length && <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{['Operadora', 'Data', 'Hora', 'Loja', 'Modalidade', 'NSU', 'Operador', 'Valor'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>{lista.slice(0, LIMITE_TABELA).map((p, i) => (
            <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}>
              <td style={{ ...s.td, fontWeight: 600 }}>{p.operadora}</td>
              <td style={s.td}>{dBR(p.data)}</td>
              <td style={s.td}>{(p.hora || '').slice(0, 5)}</td>
              <td style={s.td}>{p.loja}</td>
              <td style={s.td}>{p.modalidade}</td>
              <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 11.5 }}>{p.nsu || p.autorizacao || '—'}</td>
              <td style={{ ...s.td, maxWidth: 160 }}>{p.operador || '—'}</td>
              <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{brl(p.valor)}</td>
            </tr>))}</tbody>
        </table>}
      </div>
    </>
  );
}

// ── Sem operadora: modalidade do ERP que o sistema não sabe de qual credenciadora é ────────
// Diferente da aba anterior (que é sobre CRUZAR valor) — esta é sobre CADASTRO: a modalidade nem
// bate em nenhum palpite automático nem foi mapeada à mão em Ajustes ▸ Operadoras. É sinal de
// bandeira/credenciadora nova que a loja passou a aceitar e ninguém cadastrou ainda.
function SemOperadora({ API, f }) {
  const [d, carreg] = useDados(API, '/conciliacao-cartao/sem-operadora', f, [API, f.ini, f.fim, f.loja, f.grupo]);
  const [filtroMod, setFiltroMod] = useState('');
  const [buscaOperador, setBuscaOperador] = useState('');
  const [buscaNsu, setBuscaNsu] = useState('');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');
  if (carreg || !d) return <div style={s.vazio}>carregando…</div>;
  if (d.erro) return <div style={s.erroBox}>⚠️ {d.erro}</div>;
  const lista = (d.semOperadora || []).filter(p => (!filtroMod || p.modalidade === filtroMod)
    && (!buscaOperador || (p.operador || '').toLowerCase().includes(buscaOperador.toLowerCase()))
    && (!buscaNsu || String(p.nsu || p.autorizacao || '').includes(buscaNsu))
    && (!valorMin || p.valor >= Number(valorMin))
    && (!valorMax || p.valor <= Number(valorMax)));
  const limparFiltros = () => { setFiltroMod(''); setBuscaOperador(''); setBuscaNsu(''); setValorMin(''); setValorMax(''); };
  const exportar = () => baixarCSV('sem-operadora', [
    { h: 'Modalidade', f: p => p.modalidade }, { h: 'Data', f: p => dBR(p.data) }, { h: 'Hora', f: p => (p.hora || '').slice(0, 5) },
    { h: 'Loja', f: p => p.loja }, { h: 'NSU', f: p => p.nsu || p.autorizacao || '' }, { h: 'Operador', f: p => p.operador || '' }, { h: 'Valor', f: p => num(p.valor) },
  ], lista);
  return (
    <>
      <div style={s.nota}>
        🏷️ Vendas de cartão cuja modalidade não bate em nenhuma operadora conhecida pelo sistema (nem palpite automático, nem de-para salvo) —
        provável bandeira/credenciadora nova. Mapeie em <b>Ajustes ▸ Operadoras</b> pra ela entrar na conferência.
      </div>

      {(d.avisos || []).map((a, i) => <div key={i} style={s.aviso}>💡 {a}</div>)}

      <div style={{ ...s.card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Stat n={d.resumo?.total ?? 0} l="Vendas sem operadora" cor={d.resumo?.total ? '#C0392B' : '#1E874B'} bg={d.resumo?.total ? '#FBEAEA' : '#EAF6EF'} />
        <Stat n={brlK(d.resumo?.valor || 0)} l="Valor envolvido" cor="#C0392B" />
      </div>

      {!!(d.resumo?.porModalidade || []).length && (
        <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setFiltroMod('')} style={{ ...s.chip, ...(!filtroMod ? s.chipOn : {}) }}>todas</button>
          {d.resumo.porModalidade.map(o => (
            <button key={o.modalidade} onClick={() => setFiltroMod(o.modalidade)}
              style={{ ...s.chip, ...(filtroMod === o.modalidade ? s.chipOn : {}) }}>
              {o.modalidade} · {o.n} · {brl(o.valor)}
            </button>
          ))}
        </div>
      )}

      <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={s.fld}>Operador<input value={buscaOperador} onChange={e => setBuscaOperador(e.target.value)} placeholder="nome…" style={s.inp} /></label>
        <label style={s.fld}>NSU<input value={buscaNsu} onChange={e => setBuscaNsu(e.target.value)} placeholder="número…" style={s.inp} /></label>
        <label style={s.fld}>Valor de<input type="number" value={valorMin} onChange={e => setValorMin(e.target.value)} placeholder="0" style={{ ...s.inp, width: 90 }} /></label>
        <label style={s.fld}>até<input type="number" value={valorMax} onChange={e => setValorMax(e.target.value)} placeholder="—" style={{ ...s.inp, width: 90 }} /></label>
        <button onClick={limparFiltros} style={s.chip}>limpar filtros</button>
        <button onClick={exportar} disabled={!lista.length} style={{ ...s.chip, ...s.chipOn, marginLeft: 'auto' }}>⬇️ Excel detalhado</button>
      </div>

      <div style={{ ...s.card, overflowX: 'auto' }}>
        {!lista.length && <div style={s.vazio}>nenhuma modalidade órfã no período 🎉</div>}
        {lista.length > LIMITE_TABELA && <div style={s.aviso}>⚠️ Mostrando {LIMITE_TABELA} de {lista.length} registros — refine os filtros acima pra ver o resto.</div>}
        {!!lista.length && <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{['Modalidade', 'Data', 'Hora', 'Loja', 'NSU', 'Operador', 'Valor'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>{lista.slice(0, LIMITE_TABELA).map((p, i) => (
            <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}>
              <td style={{ ...s.td, fontWeight: 600 }}>{p.modalidade}</td>
              <td style={s.td}>{dBR(p.data)}</td>
              <td style={s.td}>{(p.hora || '').slice(0, 5)}</td>
              <td style={s.td}>{p.loja}</td>
              <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 11.5 }}>{p.nsu || p.autorizacao || '—'}</td>
              <td style={{ ...s.td, maxWidth: 160 }}>{p.operador || '—'}</td>
              <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{brl(p.valor)}</td>
            </tr>))}</tbody>
        </table>}
      </div>
    </>
  );
}

// ── Importar relatório ─────────────────────────────────────────────────────
// Tela única pros três tipos de arquivo da credenciadora (vendas, repasse/recebimentos e o que
// ainda tá "a receber" — esses dois últimos vêm no MESMO arquivo de recebimentos, então na prática
// é uma escolha entre 2 endpoints diferentes do backend). Antes ficava um upload dentro da aba
// Importar (só vendas) e outro escondido dentro da aba Repasses — juntei os dois aqui.
function Importar({ API, lojas }) {
  const [tipo, setTipo] = useState('vendas');   // 'vendas' | 'repasse'
  const [loja, setLoja] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [lotes, setLotes] = useState([]);
  const inputRef = useRef(null);
  const carregarLotes = useCallback(() => {
    const rota = tipo === 'vendas' ? '/conciliacao-cartao/lotes' : '/conciliacao-cartao/repasses/lotes';
    API.get(rota).then(r => setLotes(r.data.lotes || [])).catch(() => {});
  }, [API, tipo]);
  useEffect(() => { carregarLotes(); }, [carregarLotes]);

  const enviar = async files => {
    if (!files?.length) return;
    setEnviando(true); setResultados([]);
    const rota = tipo === 'vendas' ? '/conciliacao-cartao/importar' : '/conciliacao-cartao/repasses/importar';
    const saida = [];
    for (const file of Array.from(files)) {
      try {
        const b64 = await new Promise((ok, err) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = err; fr.readAsDataURL(file); });
        const corpo = tipo === 'vendas' ? { conteudo: b64, nome: file.name, loja } : { conteudo: b64, nome: file.name };
        const r = await API.post(rota, corpo);
        saida.push({ nome: file.name, _b64: b64, _loja: loja, ...r.data });
      } catch (e) { saida.push({ nome: file.name, ok: false, erro: e.response?.data?.erro || e.message }); }
    }
    setResultados(saida); setEnviando(false); carregarLotes();
    if (inputRef.current) inputRef.current.value = '';
  };

  const reprocessar = async i => {
    const item = resultados[i];
    const r = await API.post('/conciliacao-cartao/importar', { conteudo: item._b64, nome: item.nome, loja: item._loja });
    setResultados(list => list.map((x, k) => k === i ? { nome: item.nome, _b64: item._b64, _loja: item._loja, ...r.data } : x));
    carregarLotes();
  };

  const apagar = async id => {
    if (!window.confirm('Apagar esse lote importado? As divergências dele saem do painel.')) return;
    const rota = tipo === 'vendas' ? '/conciliacao-cartao/lotes/' : '/conciliacao-cartao/repasses/lotes/';
    await API.delete(rota + id); carregarLotes();
  };

  return (
    <>
      <div style={s.card}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {[['vendas', '🛒 Vendas'], ['repasse', '💰 Repasse / recebimentos (inclui "a receber")']].map(([v, l]) => (
            <button key={v} onClick={() => { setTipo(v); setResultados([]); }}
              style={{ ...s.btnMini, padding: '6px 12px', fontWeight: tipo === v ? 700 : 400,
                background: tipo === v ? '#2E5C9E' : '#eee', color: tipo === v ? '#fff' : '#333' }}>{l}</button>
          ))}
        </div>

        {tipo === 'vendas' ? <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Subir o relatório de vendas do dia</div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
            Aceito hoje: <b>Rede, Brasil Card, Le Card, Bracov e Nutricash</b> (.xlsx, .xls ou .csv, do jeito que a operadora exporta).
            Pode mandar vários de uma vez. Rede e Bracov trazem o CNPJ e a loja é reconhecida sozinha; nos outros, escolha a loja abaixo.
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={s.fld}>Loja (quando o arquivo não traz o CNPJ)
              <select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}>
                <option value="">— identificar pelo arquivo —</option>
                {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </label>
            <input ref={inputRef} type="file" multiple accept=".xlsx,.xls,.csv" onChange={e => enviar(e.target.files)} style={{ fontSize: 12.5 }} disabled={enviando} />
            {enviando && <span style={{ fontSize: 12.5, color: '#888' }}>conferindo com o ERP…</span>}
          </div>
        </> : <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Subir o relatório de recebimentos da credenciadora</div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
            Na Rede: <b>recebimentos → exportar relatório → Excel → "relatório detalhado"</b>. Esse arquivo traz o depósito,
            a parcela de cada venda que o formou, e o que ainda está a receber — é o que permite conferir sem depender do ERP.
          </div>
          <input ref={inputRef} type="file" multiple accept=".xlsx,.xls,.csv" onChange={e => enviar(e.target.files)} style={{ fontSize: 12.5 }} disabled={enviando} />
          {enviando && <span style={{ fontSize: 12.5, color: '#888', marginLeft: 8 }}>conferindo…</span>}
        </>}
      </div>

      {resultados.map((r, i) => tipo === 'vendas' ? <React.Fragment key={i}>
        <ResultadoImport r={r} />
        {!!(r.lojasParaMapear || []).length && <MapearLojas API={API} lojas={lojas} item={r} onReprocessar={() => reprocessar(i)} />}
      </React.Fragment> : (r.ok
        ? <div key={i} style={{ ...s.card, borderLeft: '4px solid #1E874B' }}>
            <b>{r.operadora}</b> · {r.qtdDepositos} depósitos · {r.qtdParcelas} parcelas · {brl(r.valorTotal)}
            {(r.avisos || []).map((a, k) => <div key={k} style={s.aviso}>💡 {a}</div>)}
          </div>
        : <div key={i} style={s.erroBox}>⚠️ <b>{r.nome}</b>: {r.erro}</div>))}

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Relatórios já enviados ({tipo === 'vendas' ? 'vendas' : 'repasse'})</div>
        {!lotes.length && <div style={s.vazio}>nenhum relatório importado ainda</div>}
        {lotes.length > 0 && <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{['Operadora', 'Arquivo', 'Período', 'Transações', 'Valor', 'Enviado', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>{lotes.map(l => (
            <tr key={l.id} style={{ borderTop: '1px solid #f2f2f2' }}>
              <td style={{ ...s.td, fontWeight: 600 }}>{l.operadora}</td>
              <td style={{ ...s.td, color: '#666', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome_arquivo}</td>
              <td style={s.td}>{dBR(l.data_ini)}{l.data_fim !== l.data_ini ? ' → ' + dBR(l.data_fim) : ''}</td>
              <td style={s.td}>{l.linhas}</td>
              <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>{brl(l.valor_total)}</td>
              <td style={{ ...s.td, color: '#999' }}>{String(l.importado_em || '').slice(0, 16).replace('T', ' ')}</td>
              <td style={s.td}><button onClick={() => apagar(l.id)} style={s.btnMini}>apagar</button></td>
            </tr>))}</tbody>
        </table></div>}
      </div>
    </>
  );
}

function ResultadoImport({ r }) {
  if (!r.ok) return <div style={s.erroBox}>⚠️ <b>{r.nome}</b>: {r.erro}</div>;
  const s2 = r.resumo || {};
  return (
    <div style={{ ...s.card, borderLeft: '4px solid ' + (s2.abertas ? '#C0392B' : '#1E874B') }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{r.operadora} · {r.nome}</div>
      <div style={{ fontSize: 12, color: '#666', margin: '4px 0 10px' }}>
        {r.linhas} transações · {brl(r.valorTotal)} · {dBR(r.periodo?.ini)}{r.periodo?.fim !== r.periodo?.ini ? ' → ' + dBR(r.periodo?.fim) : ''}
        {' · '}{s2.casados}/{s2.linhasOperadora} casaram com o ERP ({s2.pctCasado}%)
      </div>
      {(r.avisos || []).map((a, i) => <div key={i} style={s.aviso}>💡 {a}</div>)}
      {!s2.divergencias && <div style={{ fontSize: 13, color: '#1E874B', fontWeight: 600 }}>✅ Nenhuma divergência — está tudo batendo.</div>}
      {s2.divergencias > 0 && <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {(s2.porTipo || []).map(t => (
            <span key={t.tipo} style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 20, background: t.cor + '18', color: t.cor, fontWeight: 600 }}>
              {t.rotulo}: {t.n} ({brl(t.valor)})
            </span>))}
        </div>
        <ListaDivergencias itens={(r.divergencias || []).slice(0, 60)} />
        {r.divergencias?.length > 60 && <div style={{ ...s.nota, marginTop: 8 }}>Mostrando 60 de {r.divergencias.length}. O restante está na aba <b>Divergências</b>.</div>}
      </>}
    </div>
  );
}

// ── Mapear loja do arquivo: a Le Card manda um relatório só com VÁRIAS lojas misturadas (uma
// coluna "Loja" por linha, sem CNPJ) — sem esse de-para o import não sabe a qual loja do ERP cada
// linha pertence. Aparece só quando o import encontra nome(s) de loja ainda não mapeado(s).
function MapearLojas({ API, lojas, item, onReprocessar }) {
  const [escolha, setEscolha] = useState({});
  const [salvando, setSalvando] = useState(false);
  const pendentes = item.lojasParaMapear || [];
  const salvarEReprocessar = async () => {
    setSalvando(true);
    for (const p of pendentes) {
      const lojaId = escolha[p.texto];
      if (lojaId) await API.post('/conciliacao-cartao/lojas-texto', { operadora: p.operadora, texto: p.texto, lojaId });
    }
    await onReprocessar();
    setSalvando(false);
  };
  const faltam = pendentes.filter(p => !escolha[p.texto]).length;
  return (
    <div style={{ ...s.card, borderLeft: '4px solid #C87A1E' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>⚠️ Este arquivo tem loja(s) que eu não reconheço ainda</div>
      <div style={{ fontSize: 11.5, color: '#888', marginBottom: 10 }}>
        Diga qual loja do ERP é cada uma — depois de mapear, é só clicar em "salvar e reprocessar" (não precisa subir o arquivo de novo).
      </div>
      {pendentes.map(p => (
        <div key={p.texto} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 12.5, minWidth: 200 }}>{p.texto} <span style={{ color: '#999' }}>({p.n} venda{p.n > 1 ? 's' : ''})</span></span>
          <select value={escolha[p.texto] || ''} onChange={e => setEscolha(m => ({ ...m, [p.texto]: e.target.value }))} style={s.inp}>
            <option value="">— escolher loja —</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
      ))}
      <button onClick={salvarEReprocessar} disabled={salvando || faltam > 0} style={{ ...s.chip, marginTop: 6, opacity: faltam > 0 ? 0.5 : 1 }}>
        {salvando ? 'salvando…' : 'salvar e reprocessar'}
      </button>
    </div>
  );
}

// ── Divergências do período ────────────────────────────────────────────────
function Divergencias({ API, f, tipoIni }) {
  const [tipo, setTipo] = useState(tipoIni || '');
  const [status, setStatus] = useState('abertas');
  const [filtroOp, setFiltroOp] = useState('');
  const [filtroMod, setFiltroMod] = useState('');
  const [buscaOperador, setBuscaOperador] = useState('');
  const [buscaNsu, setBuscaNsu] = useState('');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');
  const url = f.fonte === 'erp' ? '/conciliacao-cartao/edi' : '/conciliacao-cartao/divergencias';
  const [d, carreg, recarregar] = useDados(API, url, { ini: f.ini, fim: f.fim, loja: f.loja, grupo: f.grupo }, [API, f.ini, f.fim, f.loja, f.fonte, f.grupo]);
  if (carreg || !d) return <div style={s.vazio}>carregando… (conferindo transação por transação com o ERP)</div>;
  if (d.erro) return <div style={s.erroBox}>⚠️ {d.erro}</div>;
  if (d.vazio) return <div style={s.aviso}>Nenhum relatório importado nesse período. Vá em <b>Importar relatório</b>.</div>;
  const todas = d.divergencias || [];
  const operadoras = d.operadoras || [...new Set(todas.map(x => x.operadora).filter(Boolean))];
  const modalidades = [...new Set(todas.map(x => x.modalidadeErp).filter(Boolean))].sort();
  const lista = todas.filter(x => (!tipo || x.tipo === tipo))
    .filter(x => status === 'todas' || (status === 'abertas' ? (x.status === 'aberta' || x.status === 'procede') : x.status !== 'aberta'))
    .filter(x => (!filtroOp || x.operadora === filtroOp)
      && (!filtroMod || x.modalidadeErp === filtroMod)
      && (!buscaOperador || (x.operador || '').toLowerCase().includes(buscaOperador.toLowerCase()))
      && (!buscaNsu || String(x.nsu || x.autorizacao || '').includes(buscaNsu))
      && (!valorMin || x.valor >= Number(valorMin))
      && (!valorMax || x.valor <= Number(valorMax)));
  const limparFiltros = () => { setFiltroOp(''); setFiltroMod(''); setBuscaOperador(''); setBuscaNsu(''); setValorMin(''); setValorMax(''); };
  const exportar = () => baixarCSV('divergencias', [
    { h: 'O que houve', f: x => x.rotulo }, { h: 'Loja', f: x => x.loja }, { h: 'Data', f: x => dBR(x.data) }, { h: 'Hora', f: x => (x.hora || '').slice(0, 5) },
    { h: 'Quem passou', f: x => x.operador || '' }, { h: 'No sistema', f: x => x.modalidadeErp || '' }, { h: 'Na maquininha', f: x => x.tipoOperadora || x.grupoOperadora || '' },
    { h: 'Operadora', f: x => x.operadora || '' }, { h: 'Bandeira', f: x => x.bandeira || '' }, { h: 'NSU/Autorização', f: x => x.nsu || x.autorizacao || '' },
    { h: 'Valor', f: x => num(x.valor) }, { h: 'Situação', f: x => x.status }, { h: 'Detalhe', f: x => x.detalhe || '' },
  ], lista);
  return (
    <>
      {/* Resumo + tipos de erro como chips clicáveis (mais claro que o dropdown) */}
      {(() => { const porTipo = d.resumo?.porTipo || []; const totAb = porTipo.reduce((a, t) => a + (t.abertas ?? t.n ?? 0), 0); const totVal = porTipo.reduce((a, t) => a + (t.valor || 0), 0);
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div style={{ ...s.card, margin: 0, borderLeft: '4px solid #C0392B' }}><div style={{ fontSize: 11.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: .3 }}>Divergências em aberto</div><div style={{ fontSize: 24, fontWeight: 800, color: '#C0392B', fontVariantNumeric: 'tabular-nums' }}>{totAb.toLocaleString('pt-BR')}</div></div>
            <div style={{ ...s.card, margin: 0, borderLeft: '4px solid #C0392B' }}><div style={{ fontSize: 11.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: .3 }}>Valor envolvido</div><div style={{ fontSize: 24, fontWeight: 800, color: '#C0392B', fontVariantNumeric: 'tabular-nums' }}>{brl(totVal)}</div></div>
          </div>
        ); })()}
      <div style={{ ...s.card }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <button onClick={() => setTipo('')} style={{ ...s.chip, ...(!tipo ? s.chipOn : {}) }}>Todos</button>
          {(d.resumo?.porTipo || []).map(t => (
            <button key={t.tipo} onClick={() => setTipo(tipo === t.tipo ? '' : t.tipo)}
              style={{ ...s.chip, ...(tipo === t.tipo ? { background: t.cor, color: '#fff', borderColor: t.cor } : { borderColor: t.cor + '55', color: t.cor }) }}>
              {t.rotulo} · {t.n}
            </button>))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={status} onChange={e => setStatus(e.target.value)} style={s.inp}>
            <option value="abertas">Em aberto</option><option value="tratadas">Já tratadas</option><option value="todas">Todas</option>
          </select>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#64748b' }}>
            <b>{lista.length}</b> de {todas.length} divergência(s) · <b>{brl(lista.reduce((a, x) => a + x.valor, 0))}</b>
          </span>
        </div>
      </div>
      <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {operadoras.length > 1 && <label style={s.fld}>Operadora<select value={filtroOp} onChange={e => setFiltroOp(e.target.value)} style={s.inp}>
          <option value="">Todas</option>{operadoras.map(o => <option key={o} value={o}>{o}</option>)}</select></label>}
        <label style={s.fld}>Modalidade<select value={filtroMod} onChange={e => setFiltroMod(e.target.value)} style={s.inp}>
          <option value="">Todas</option>{modalidades.map(m => <option key={m} value={m}>{m}</option>)}</select></label>
        <label style={s.fld}>Operador<input value={buscaOperador} onChange={e => setBuscaOperador(e.target.value)} placeholder="nome…" style={s.inp} /></label>
        <label style={s.fld}>NSU<input value={buscaNsu} onChange={e => setBuscaNsu(e.target.value)} placeholder="número…" style={s.inp} /></label>
        <label style={s.fld}>Valor de<input type="number" value={valorMin} onChange={e => setValorMin(e.target.value)} placeholder="0" style={{ ...s.inp, width: 90 }} /></label>
        <label style={s.fld}>até<input type="number" value={valorMax} onChange={e => setValorMax(e.target.value)} placeholder="—" style={{ ...s.inp, width: 90 }} /></label>
        <button onClick={limparFiltros} style={s.chip}>limpar filtros</button>
        <button onClick={exportar} disabled={!lista.length} style={{ ...s.chip, ...s.chipOn, marginLeft: 'auto' }}>⬇️ Excel detalhado</button>
      </div>
      <ListaDivergencias itens={lista} todas={todas} API={API} onMudar={recarregar} />
    </>
  );
}

function ListaDivergencias({ itens, todas = [], API, onMudar }) {
  const [remanejar, setRemanejar] = useState(null); // a transação SO_OPERADORA sendo remanejada
  const COLS = [
    { k: 'tipo', label: 'O que houve', tipo: 'txt', get: x => x.rotulo },
    { k: 'loja', label: 'Loja', tipo: 'txt', get: x => x.loja },
    { k: 'data', label: 'Data', tipo: 'txt', get: x => x.data + (x.hora || '') },
    { k: 'operador', label: 'Quem passou', tipo: 'txt', get: x => x.operador || '' },
    { k: 'erp', label: 'No sistema', tipo: 'txt', get: x => x.modalidadeErp || '' },
    { k: 'oper', label: 'Na maquininha', tipo: 'txt', get: x => x.tipoOperadora || '' },
    { k: 'nsu', label: 'NSU / Autorização', tipo: 'txt', get: x => x.nsu || x.autorizacao || '' },
    { k: 'valor', label: 'Valor', tipo: 'num', get: x => x.valor, right: true },
    { k: 'status', label: 'Situação', tipo: 'txt', get: x => x.status },
  ];
  const { linhas, ordem, clicar, seta } = useOrdenavel(itens, COLS, { col: 'valor', dir: 'desc' });
  if (!itens.length) return <div style={s.vazio}>nenhuma divergência com esse filtro 🎉</div>;
  const tratar = async (x, novo) => {
    if (!API) return;
    await API.post('/conciliacao-cartao/tratativa', { ref: x.ref, tipo: x.tipo, status: novo, valor: x.valor, lojaId: x.lojaId, operador: x.operador });
    onMudar && onMudar();
  };
  return (
    <div style={{ ...s.card, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr>{COLS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />)}{API && <th style={s.th}></th>}</tr></thead>
        <tbody>
          {linhas.map((x, i) => (
            <tr key={x.ref || i} style={{ borderTop: '1px solid #f2f2f2', opacity: x.status !== 'aberta' && x.status !== 'procede' ? 0.55 : 1 }}>
              <td style={s.td}>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: x.cor + '18', color: x.cor, fontWeight: 700, whiteSpace: 'nowrap' }}>{x.rotulo}</span>
                <div style={{ fontSize: 11.5, color: '#666', marginTop: 4, maxWidth: 420 }}>{x.detalhe}</div>
              </td>
              <td style={s.td}>{x.loja}</td>
              <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{dBR(x.data)}<div style={{ fontSize: 10.5, color: '#aaa' }}>{(x.hora || '').slice(0, 5)}</div></td>
              <td style={{ ...s.td, maxWidth: 150 }}>{x.operador || '—'}</td>
              <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                <span style={{ color: '#C0392B', fontWeight: 600 }}>{x.modalidadeErp || '—'}</span>
                {x.parcelasErp > 1 && <span style={{ color: '#999' }}> {x.parcelasErp}x</span>}
              </td>
              <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                <span style={{ color: '#1E874B', fontWeight: 600 }}>{x.tipoOperadora || x.grupoOperadora || '—'}</span>
                {x.parcelasOperadora > 1 && <span style={{ color: '#999' }}> {x.parcelasOperadora}x</span>}
                {x.bandeira && <div style={{ fontSize: 10.5, color: '#aaa' }}>{x.bandeira}</div>}
              </td>
              <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 11.5 }}>{x.nsu || x.autorizacao || '—'}
                </td>
              <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{brl(x.valor)}</td>
              <td style={s.td}>{x.status === 'aberta' ? <span style={{ color: '#C0392B' }}>em aberto</span>
                : x.status === 'corrigida' ? <span style={{ color: '#1E874B' }}>corrigida</span>
                : x.status === 'remanejada' ? <span style={{ color: '#2E5C9E' }}>↔ remanejada</span>
                : x.status === 'ignorada' ? <span style={{ color: '#999' }}>ignorada</span> : <span style={{ color: '#C87A1E' }}>procede</span>}</td>
              {API && <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                {x.tipo === 'SO_OPERADORA' && (x.status === 'aberta' || x.status === 'procede') &&
                  <button onClick={() => setRemanejar(x)} style={{ ...s.btnMini, borderColor: '#2E5C9E', color: '#2E5C9E' }} title="A maquininha é de uma loja mas a venda foi lançada em outra — remanejar/casar">↔ outra loja</button>}
                <button onClick={() => tratar(x, 'corrigida')} style={s.btnMini} title="Já corrigi no ERP">✅ corrigi</button>
                <button onClick={() => tratar(x, 'ignorada')} style={s.btnMini} title="Não é erro">🚫 ignorar</button>
                {x.status !== 'aberta' && <button onClick={() => tratar(x, 'aberta')} style={s.btnMini}>reabrir</button>}
              </td>}
            </tr>))}
        </tbody>
      </table>
      {remanejar && <RemanejarModal x={remanejar} todas={todas} API={API}
        onClose={() => setRemanejar(null)} onOk={() => { setRemanejar(null); onMudar && onMudar(); }} />}
    </div>
  );
}

// Modal: a maquininha ficou numa loja mas a venda foi lançada em outra. O usuário escolhe a venda
// correspondente (SO_ERP de outra loja, mesmo valor) ou só a loja de destino. As duas pontas são
// marcadas como "remanejada" (some da loja de origem e da loja de destino).
function RemanejarModal({ x, todas, API, onClose, onOk }) {
  const [sel, setSel] = useState(null);     // SO_ERP escolhida (casar venda)
  const [lojaManual, setLojaManual] = useState(''); // ou só a loja (uni) sem casar venda
  const [salvando, setSalvando] = useState(false);
  // candidatas: "ERP tem, operadora não pagou" de OUTRA loja, ainda em aberto, mesmo valor
  const cents = v => Math.round((Number(v) || 0) * 100);
  const candidatas = (todas || []).filter(d => d.tipo === 'SO_ERP'
    && String(d.uni) !== String(x.uni)
    && (d.status === 'aberta' || d.status === 'procede')
    && cents(d.valor) === cents(x.valor));
  // lojas de destino possíveis (pelas divergências carregadas) p/ o caso "sem casar venda"
  const lojasDestino = [...new Map((todas || []).filter(d => String(d.uni) !== String(x.uni) && d.uni != null)
    .map(d => [String(d.uni), { uni: d.uni, nome: d.loja }])).values()].sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  const confirmar = async () => {
    if (!sel && !lojaManual) return;
    setSalvando(true);
    try {
      const body = sel
        ? { ref: x.ref, tipo: x.tipo, valor: x.valor, lojaId: sel.uni, lojaNome: sel.loja, refPar: sel.ref, refParValor: sel.valor }
        : { ref: x.ref, tipo: x.tipo, valor: x.valor, lojaId: lojaManual, lojaNome: (lojasDestino.find(l => String(l.uni) === String(lojaManual)) || {}).nome };
      await API.post('/conciliacao-cartao/remanejar', body);
      onOk();
    } catch (e) { alert(e.response?.data?.erro || 'Erro ao remanejar.'); setSalvando(false); }
  };
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.modal, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 2 }}>↔ Remanejar para outra loja</div>
        <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 12 }}>A maquininha está na <b>{x.loja}</b>, mas a venda pode ter sido lançada em outra loja. Escolha a venda correspondente (ou só a loja) para conciliar as duas pontas.</div>
        <div style={{ ...s.card, margin: 0, marginBottom: 12, background: '#F7FAFF', border: '1px solid #E3ECF7' }}>
          <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 700 }}>TRANSAÇÃO (operadora pagou)</div>
          <div style={{ fontSize: 13 }}><b>{brl(x.valor)}</b> · {x.loja} · {dBR(x.data)} {(x.hora || '').slice(0, 5)} · NSU {x.nsu || x.autorizacao || '—'} · {x.tipoOperadora || x.operadora}</div>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Venda correspondente em outra loja <span style={{ color: '#94a3b8', fontWeight: 400 }}>(mesmo valor, "ERP tem, operadora não pagou")</span></div>
        {candidatas.length === 0
          ? <div style={{ fontSize: 12.5, color: '#8A6D3B', background: '#FFF8E6', border: '1px solid #F0E0B0', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>Nenhuma venda de outra loja com esse valor em aberto. Você pode só <b>mudar a loja</b> abaixo (a outra ponta você trata quando aparecer).</div>
          : <div style={{ display: 'grid', gap: 6, marginBottom: 10, maxHeight: 220, overflowY: 'auto' }}>
            {candidatas.map(c => {
              const on = sel && sel.ref === c.ref;
              return <div key={c.ref} onClick={() => { setSel(on ? null : c); setLojaManual(''); }}
                style={{ border: '1px solid ' + (on ? '#2E5C9E' : '#e5e7eb'), background: on ? '#EAF1FB' : '#fff', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 12.5 }}><b>{c.loja}</b> · {dBR(c.data)} · {c.modalidadeErp || '—'}{c.operador ? ' · ' + c.operador : ''} · NSU {c.nsu || c.autorizacao || '—'}</div>
                <div style={{ fontWeight: 700, color: '#2E5C9E', whiteSpace: 'nowrap' }}>{brl(c.valor)}{on ? ' ✓' : ''}</div>
              </div>;
            })}
          </div>}
        <div style={{ fontSize: 12.5, color: '#64748b', margin: '4px 0 6px' }}>— ou só mudar a loja (sem casar uma venda agora) —</div>
        <select value={lojaManual} onChange={e => { setLojaManual(e.target.value); setSel(null); }} style={{ ...s.inp, width: '100%', marginBottom: 14 }}>
          <option value="">Escolher a loja de destino…</option>
          {lojasDestino.map(l => <option key={l.uni} value={l.uni}>{l.nome}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={s.btnMini}>cancelar</button>
          <button onClick={confirmar} disabled={salvando || (!sel && !lojaManual)} style={{ ...s.btn, opacity: (salvando || (!sel && !lojaManual)) ? 0.5 : 1 }}>{salvando ? 'salvando…' : 'Remanejar e conciliar'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Repasses: o que a credenciadora pagou ──────────────────────────────────
function Repasses({ API, f }) {
  const [d, carreg, recarregar] = useDados(API, '/conciliacao-cartao/repasses', { ini: f.ini, fim: f.fim, loja: f.loja }, [API, f.ini, f.fim, f.loja]);
  const [aberto, setAberto] = useState(null);
  const [detalhe, setDetalhe] = useState(null);

  const abrir = async id => {
    if (aberto === id) { setAberto(null); setDetalhe(null); return; }
    setAberto(id); setDetalhe(null);
    const r = await API.get('/conciliacao-cartao/repasses/deposito/' + id);
    setDetalhe(r.data);
  };
  const conferir = async (dep, status) => {
    await API.post('/conciliacao-cartao/repasses/conferencia', { ref: 'dep:' + dep.id, status, valor: dep.valor });
    recarregar();
  };
  const conferirAjuste = async (a, status) => {
    await API.post('/conciliacao-cartao/repasses/conferencia', { ref: 'ajuste:' + a.id, status, valor: a.valor, obs: a.motivo || a.descricao });
    recarregar();
  };

  return (
    <>
      <div style={s.nota}>📥 Pra subir um relatório de recebimentos, vá na aba <b>Importar relatório</b> e escolha "Repasse / recebimentos".</div>

      {carreg && <div style={s.vazio}>carregando…</div>}
      {d?.erro && <div style={s.erroBox}>⚠️ {d.erro}</div>}
      {d?.vazio && <div style={s.aviso}>Nenhum relatório de recebimentos importado nesse período.</div>}

      {d?.ok && !d.vazio && <>
        <div style={{ ...s.card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Stat n={brlK(d.resumo.recebido)} l="Caiu na conta" cor="#1E874B" bg="#EAF6EF" sub={`${d.resumo.depositos} depósitos`} />
          <Stat n={brlK(d.resumo.bruto)} l="Venda bruta" />
          <Stat n={brlK(d.resumo.taxaTotal)} l="Taxa da credenciadora" cor="#C87A1E" bg="#FDF6E7"
            sub={d.resumo.bruto ? (100 * d.resumo.taxaTotal / d.resumo.bruto).toFixed(2) + '% efetivo' : ''} />
          <Stat n={d.resumo.naoFecham} l="Depósitos que não fecham" cor={d.resumo.naoFecham ? '#C0392B' : '#1E874B'}
            bg={d.resumo.naoFecham ? '#FBEAEA' : '#EAF6EF'} sub={brlK(d.resumo.valorNaoFecha)} />
          {d.resumo.aReceber > 0 && <Stat n={brlK(d.resumo.aReceber)} l="Ainda a receber" cor="#2E5C9E" bg="#EDF2FA" />}
          {d.resumo.valorAjustes > 0 && <Stat n={brlK(d.resumo.valorAjustes)} l="Descontos/chargeback" cor="#C0392B" bg="#FBEAEA" sub={`${d.resumo.ajustes} lançamento(s)`} />}
          {(() => { const cancs = (d.ajustes || []).filter(a => a.tipo === 'cancelamento');
            const pendentes = cancs.filter(a => a.conferencia?.status !== 'conferido').length;
            return cancs.length > 0 && <Stat n={pendentes} l="Cancelamentos p/ conferir" cor={pendentes ? '#C0392B' : '#1E874B'}
              bg={pendentes ? '#FBEAEA' : '#EAF6EF'} sub={`${cancs.length} no período`} />; })()}
        </div>

        <div style={s.nota}>
          🔎 Das {d.resumo.parcelasPagas} parcelas pagas, <b>{d.resumo.parcelasConciliadas}</b> casaram com vendas que você já conferiu
          {d.resumo.parcelasSemVenda > 0 && <> · <b style={{ color: '#C0392B' }}>{d.resumo.parcelasSemVenda} pagas sem venda sua ({brl(d.resumo.valorSemVenda)})</b></>}
          {d.resumo.parcelasNaoConferidas > 0 && <> · {d.resumo.parcelasNaoConferidas} são de dias que você ainda não importou ({brl(d.resumo.valorNaoConferido)})</>}.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10, marginTop: 10 }}>
          <Barras titulo="Quanto caiu de cada filial" itens={d.resumo.porLoja.map(l => ({ nome: l.nome, n: l.n, valor: l.valor }))} cor="#1E874B" />
          <Barras titulo="Por bandeira" itens={d.resumo.porBandeira} cor="#2E5C9E" />
          {d.resumo.porDia.length > 1 && <Barras titulo="Por dia de crédito" itens={d.resumo.porDia} cor="#7A4FB0" />}
        </div>

        <ConferirBanco API={API} f={f} />

        <Vencimentos API={API} f={f} />

        <Taxas taxas={d.resumo.taxas} custoExtra={d.resumo.custoExtraTotal} />

        <div style={{ ...s.card, overflowX: 'auto' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>Depósitos</div>
          <div style={{ fontSize: 11.5, color: '#888', marginBottom: 8 }}>Clique num depósito para ver as vendas que formaram o valor.</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{['Data', 'Filial', 'Bandeira / modalidade', 'Bruto', 'Taxa', 'Depositado', 'Fecha?', 'Financeiro'].map(h =>
              <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {d.depositos.map(dep => (
                <React.Fragment key={dep.id}>
                  <tr onClick={() => abrir(dep.id)} style={{ borderTop: '1px solid #f2f2f2', cursor: 'pointer', background: aberto === dep.id ? '#F7F5FC' : 'transparent' }}>
                    <td style={s.td}>{dBR(dep.data)}</td>
                    <td style={{ ...s.td, fontWeight: 600 }}>{dep.loja}<div style={{ fontSize: 10.5, color: '#aaa', fontWeight: 400 }}>estab. {dep.estabelecimento}</div></td>
                    <td style={s.td}>{dep.bandeira} {dep.modalidade}<div style={{ fontSize: 10.5, color: '#aaa' }}>{dep.parcelas} parcela(s)</div></td>
                    <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>{brl(dep.bruto)}</td>
                    <td style={{ ...s.td, color: '#C87A1E', fontVariantNumeric: 'tabular-nums' }}>{brl(dep.taxaTotal)}</td>
                    <td style={{ ...s.td, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{brl(dep.valor)}</td>
                    <td style={s.td}>{dep.fecha
                      ? <span style={{ color: '#1E874B' }}>✅ fecha</span>
                      : <span style={{ color: '#C0392B', fontWeight: 700 }}>⚠️ {brl(dep.diferenca)}</span>}</td>
                    <td style={s.td} onClick={e => e.stopPropagation()}>
                      {dep.conferencia?.status === 'conferido'
                        ? <span style={{ color: '#1E874B' }}>conferido</span>
                        : <button onClick={() => conferir(dep, 'conferido')} style={s.btnMini}>✅ conferir</button>}
                    </td>
                  </tr>
                  {aberto === dep.id && (
                    <tr><td colSpan={8} style={{ padding: '4px 8px 12px', background: '#FAFAFB' }}>
                      {!detalhe && <div style={s.vazio}>carregando as vendas…</div>}
                      {detalhe?.parcelas && <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                        <thead><tr>{['Venda em', 'NSU', 'Parcela', 'Bruto', 'Taxa', 'Líquido', 'Confere com minha venda?'].map(h =>
                          <th key={h} style={{ ...s.th, fontSize: 10.5 }}>{h}</th>)}</tr></thead>
                        <tbody>{detalhe.parcelas.slice(0, 100).map(p => (
                          <tr key={p.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                            <td style={s.td}>{dBR(p.data_venda)}</td>
                            <td style={{ ...s.td, fontFamily: 'monospace' }}>{p.nsu}</td>
                            <td style={s.td}>{p.parcela}/{p.parcelas}</td>
                            <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>{brl(p.valor_bruto)}</td>
                            <td style={{ ...s.td, color: '#C87A1E' }}>{p.taxa}%</td>
                            <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>{brl(p.valor_liquido)}</td>
                            <td style={s.td}>{p.item_id
                              ? <span style={{ color: '#1E874B' }}>✅ sim</span>
                              : <span style={{ color: '#999' }}>dia não importado</span>}</td>
                          </tr>))}</tbody>
                      </table>}
                      {detalhe?.parcelas?.length > 100 && <div style={s.nota}>mostrando 100 de {detalhe.parcelas.length} parcelas</div>}
                    </td></tr>
                  )}
                </React.Fragment>))}
            </tbody>
          </table>
        </div>

        {d.ajustes?.some(a => a.tipo === 'cancelamento') && (
          <div style={{ ...s.card, borderLeft: '4px solid #C0392B' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>Cancelamentos e contestações</div>
            <div style={{ fontSize: 11.5, color: '#888', marginBottom: 8 }}>
              O cliente liga pra credenciadora pedindo cancelamento com frequência — confira aqui se cada um já foi tratado (estorno, nota, etc.).
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr>{['Data', 'Filial', 'Motivo', 'NSU', 'Valor', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>{d.ajustes.filter(a => a.tipo === 'cancelamento').map(a => (
                <tr key={a.id} style={{ borderTop: '1px solid #f2f2f2' }}>
                  <td style={s.td}>{dBR(a.data)}</td>
                  <td style={s.td}>{a.loja}</td>
                  <td style={s.td}>{a.motivo || a.descricao}</td>
                  <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 11.5 }}>{a.nsu || '—'}</td>
                  <td style={{ ...s.td, color: '#C0392B', fontWeight: 600 }}>{brl(a.valor)}</td>
                  <td style={s.td}>{a.conferencia?.status === 'conferido'
                    ? <span style={{ color: '#1E874B' }}>✅ tratado</span>
                    : <button onClick={() => conferirAjuste(a, 'conferido')} style={s.btnMini}>marcar tratado</button>}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}

        {d.ajustes?.some(a => a.tipo !== 'cancelamento') && (
          <div style={{ ...s.card, borderLeft: '4px solid #C87A1E' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Outros descontos da credenciadora (ajustes, cobranças)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr>{['Tipo', 'Data', 'Motivo', 'NSU', 'Valor'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>{d.ajustes.filter(a => a.tipo !== 'cancelamento').map(a => (
                <tr key={a.id} style={{ borderTop: '1px solid #f2f2f2' }}>
                  <td style={s.td}>{a.tipo}</td><td style={s.td}>{dBR(a.data)}</td>
                  <td style={s.td}>{a.motivo || a.descricao}</td>
                  <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 11.5 }}>{a.nsu || '—'}</td>
                  <td style={{ ...s.td, color: '#C0392B', fontWeight: 600 }}>{brl(a.valor)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </>}
    </>
  );
}

// "Caiu o lote?" — confere cada lote de repasse (data × loja × operadora) contra a conciliação
// bancária do Alpha (extratobancario). O vínculo real é o código do estabelecimento no texto do
// crédito ("REDE VISA CD0071713654"); a liquidação cai numa conta centralizada do grupo.
function ConferirBanco({ API, f }) {
  const [d, setD] = useState(null);
  const [carreg, setCarreg] = useState(false);
  const [erro, setErro] = useState(null);
  const [filtro, setFiltro] = useState('todos'); // todos | pendente | problema
  const [regras, setRegras] = useState([]);
  const recarregar = useCallback(() => {
    setCarreg(true); setErro(null);
    API.get('/conciliacao-cartao/repasses/conferir-banco', { params: { ini: f.ini, fim: f.fim, loja: f.loja || '' } })
      .then(r => { if (r.data.ok) setD(r.data); else setErro(r.data.erro || 'Erro.'); })
      .catch(e => setErro(e.response?.data?.erro || 'Erro.')).finally(() => setCarreg(false));
    API.get('/conciliacao-cartao/repasses/banco-regras').then(r => setRegras(r.data.regras || [])).catch(() => {});
  }, [API, f.ini, f.fim, f.loja]);
  useEffect(() => { setD(null); recarregar(); }, [recarregar]);
  const tratar = async (l, status) => {
    await API.post('/conciliacao-cartao/repasses/banco-tratativa', { chave: l.chave, status, valor: l.valor });
    recarregar();
  };
  const regraOperadora = async (operadora, ignorar) => {
    await API.post('/conciliacao-cartao/repasses/banco-regra', { operadora, ignorar, motivo: ignorar ? 'não cai no banco (factoring/antecipação)' : null });
    recarregar();
  };
  const r = d && d.resumo;
  const pct = r && r.valorTotal ? (100 * r.valorCaiu / r.valorTotal) : 0;
  const META = {
    caiu: { cor: '#1E874B', rot: '✅ caiu' }, confirmado: { cor: '#1E874B', rot: '✅ validado à mão' },
    pendente: { cor: '#C0392B', rot: '⏳ pendente' }, ignorado: { cor: '#999', rot: '🚫 ignorado' },
  };
  const exportar = () => baixarCSV('repasses-caiu-no-banco', [
    { h: 'Data', f: x => dBR(x.data) }, { h: 'Loja', f: x => x.loja }, { h: 'Operadora', f: x => x.operadora },
    { h: 'Bandeira', f: x => x.bandeira }, { h: 'Modalidade', f: x => x.modalidade }, { h: 'Estabelecimento', f: x => x.estabelecimento },
    { h: 'Valor', f: x => num(x.valor) }, { h: 'Caiu no banco', f: x => x.caiu ? 'SIM' : 'NÃO' }, { h: 'Data no banco', f: x => dBR(x.banco_data) },
  ], (d && d.linhas) || []);
  const lotes = (d && d.lotes) || [];
  const mostrar = filtro === 'pendente' ? lotes.filter(l => l.status === 'pendente')
    : filtro === 'problema' ? lotes.filter(l => l.status !== 'caiu' && l.status !== 'confirmado')
      : lotes;
  return (
    <div style={{ ...s.card, borderLeft: '4px solid #1E874B' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Caiu o lote? — conferência com o banco (Alpha 7)</div>
          <div style={{ fontSize: 11.5, color: '#888' }}>Cada lote de repasse confrontado com o crédito no extrato bancário, pelo código do estabelecimento. O que não cruza fica <b>pendente de validação humana</b>.</div>
        </div>
        <button onClick={exportar} disabled={!lotes.length} style={{ ...s.chip, ...s.chipOn }}>⬇️ Excel detalhado</button>
      </div>
      {erro && <div style={s.erroBox}>⚠️ {erro}</div>}
      {carreg && !d && <div style={s.vazio}>conferindo com o banco…</div>}
      {r && (
        <>
          <div style={{ height: 8, background: '#EDEDED', borderRadius: 5, overflow: 'hidden', margin: '4px 0 10px' }}>
            <div style={{ width: pct.toFixed(1) + '%', height: '100%', background: '#1E874B' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <Stat n={pct.toFixed(1) + '%'} l="do valor caiu no banco" cor="#1E874B" bg="#EAF6EF" sub={`${brlK(r.valorCaiu)} de ${brlK(r.valorTotal)}`} />
            <Stat n={`${r.lotesCaiu}/${r.lotes}`} l="lotes validados" sub="automático + à mão" />
            <Stat n={r.pendentes || 0} l="pendentes de validação" cor={r.pendentes ? '#C0392B' : '#1E874B'}
              bg={r.pendentes ? '#FBEAEA' : '#EAF6EF'} sub={brlK(r.valorPendente || 0)} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setFiltro('todos')} style={{ ...s.chip, ...(filtro === 'todos' ? s.chipOn : {}) }}>Todos os lotes</button>
            <button onClick={() => setFiltro('pendente')} style={{ ...s.chip, ...(filtro === 'pendente' ? s.chipOn : {}) }}>⏳ Pendentes ({r.pendentes || 0})</button>
            <button onClick={() => setFiltro('problema')} style={{ ...s.chip, ...(filtro === 'problema' ? s.chipOn : {}) }}>Tudo que não caiu sozinho</button>
          </div>
          {!!regras.length && (
            <div style={{ fontSize: 11.5, color: '#888', marginBottom: 8 }}>
              🚫 Operadoras que não caem no banco (factoring/antecipação), ignoradas sozinhas:{' '}
              {regras.map(rg => (
                <span key={rg.operadora} style={{ display: 'inline-block', margin: '0 6px 4px 0', padding: '2px 8px', borderRadius: 20, background: '#f1f1f1', color: '#555' }}>
                  {rg.operadora} <button onClick={() => regraOperadora(rg.operadora, false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#2E5C9E' }} title="voltar a cobrar pendência">↺</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr>{['Data', 'Loja', 'Operadora', 'Lote', 'Linhas', 'Situação', ''].map((h, i) =>
                <th key={i} style={['Data', 'Loja', 'Operadora'].includes(h) ? s.th : { ...s.th, textAlign: h ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>
                {mostrar.slice(0, 400).map((l, i) => {
                  const m = META[l.status] || META.pendente;
                  return (
                    <tr key={i} style={{ borderTop: '1px solid #f2f2f2', opacity: l.status === 'ignorado' ? 0.55 : 1 }}>
                      <td style={s.td}>{dBR(l.data)}</td>
                      <td style={{ ...s.td, fontWeight: 600 }}>{l.loja}</td>
                      <td style={s.td}>{l.operadora}<div style={{ fontSize: 10.5, color: '#aaa' }}>{l.caiuLinhas}/{l.linhas} linhas no banco</div></td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{brl(l.valor)}</td>
                      <td style={{ ...s.td, textAlign: 'right', color: '#888' }}>{l.caiuLinhas}/{l.linhas}</td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: m.cor }}>{m.rot}</td>
                      <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {(l.status === 'pendente') && <>
                          <button onClick={() => tratar(l, 'confirmado')} style={s.btnMini} title="Conferi e o lote caiu no banco">✓ caiu</button>
                          <button onClick={() => tratar(l, 'ignorado')} style={s.btnMini} title="Não precisa cobrar só este lote">🚫 este</button>
                          <button onClick={() => { if (window.confirm(`Ignorar SEMPRE os lotes de ${l.operadora}? (factoring/antecipação — não cai no banco)`)) regraOperadora(l.operadora, true); }} style={s.btnMini} title="Essa operadora nunca cai no banco — ignorar sempre">🚫 sempre {l.operadora}</button>
                        </>}
                        {l.ignoradoPorRegra && <span style={{ fontSize: 10.5, color: '#aaa' }}>por regra da operadora</span>}
                        {(l.status === 'confirmado' || (l.status === 'ignorado' && !l.ignoradoPorRegra)) &&
                          <button onClick={() => tratar(l, 'reabrir')} style={s.btnMini}>reabrir</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {mostrar.length > 400 && <div style={s.nota}>mostrando 400 de {mostrar.length} lotes — baixe o Excel pro detalhe completo</div>}
          {!mostrar.length && <div style={s.vazio}>{filtro !== 'todos' ? '🎉 nada pendente — tudo validado.' : 'Nenhum lote de repasse no período.'}</div>}
        </>
      )}
    </div>
  );
}

// A data de vencimento do título no ERP tem que ser a data em que a credenciadora paga —
// senão, no dia do repasse, o Financeiro filtra por vencimento e o valor não fecha.
function Vencimentos({ API, f }) {
  const [d, carreg] = useDados(API, '/conciliacao-cartao/repasses/vencimentos',
    { ini: f.ini, fim: f.fim, loja: f.loja }, [API, f.ini, f.fim, f.loja]);
  if (carreg || !d) return <div style={s.card}><div style={s.vazio}>conferindo os vencimentos com o ERP…</div></div>;
  if (d.erro) return <div style={s.erroBox}>⚠️ {d.erro}</div>;
  if (d.vazio) return null;
  const r = d.resumo;
  const pct = r.conferidos ? Math.round(1000 * r.iguais / r.conferidos) / 10 : 0;
  return (
    <div style={{ ...s.card, borderLeft: '4px solid ' + (r.divergentes ? '#C87A1E' : '#1E874B') }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Data de vencimento: ERP × credenciadora</div>
      <div style={{ fontSize: 11.5, color: '#888', margin: '4px 0 10px' }}>
        Se o título do ERP vencer num dia e a credenciadora pagar em outro, o valor não fecha quando você
        filtrar por vencimento — mesmo com o dinheiro certo. Aqui a conferência é título a título.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <Stat n={pct + '%'} l="Vencimento correto" cor={pct >= 99 ? '#1E874B' : '#C87A1E'} bg={pct >= 99 ? '#EAF6EF' : '#FDF6E7'}
          sub={`${r.iguais} de ${r.conferidos} títulos`} />
        <Stat n={r.divergentes} l="Vencimento errado no ERP" cor={r.divergentes ? '#C0392B' : '#1E874B'}
          bg={r.divergentes ? '#FBEAEA' : '#EAF6EF'} sub={brl(r.valorDivergente)} />
        {r.semTituloNoErp > 0 && <Stat n={r.semTituloNoErp} l="Pagas sem título no ERP" cor="#2E5C9E" bg="#EDF2FA" />}
      </div>

      {r.porDia?.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 10 }}>
          <thead><tr>{['Dia do crédito', 'Valor pago', 'Parcelas', 'Vencimento certo', 'Vencimento errado'].map(h =>
            <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>{r.porDia.map(x => (
            <tr key={x.data} style={{ borderTop: '1px solid #f2f2f2' }}>
              <td style={{ ...s.td, fontWeight: 600 }}>{dBR(x.data)}</td>
              <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>{brl(x.pago)}</td>
              <td style={s.td}>{x.parcelas}</td>
              <td style={{ ...s.td, color: '#1E874B' }}>{x.vencimentoBate}</td>
              <td style={{ ...s.td, color: x.vencimentoErrado ? '#C0392B' : '#999', fontWeight: x.vencimentoErrado ? 700 : 400 }}>{x.vencimentoErrado}</td>
            </tr>))}</tbody>
        </table>
      )}

      {d.linhas?.length > 0 && <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{['Loja', 'NSU', 'Parcela', 'Valor', 'Vence no ERP', 'Paga em', 'Diferença'].map(h =>
            <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>{d.linhas.slice(0, 50).map(l => (
            <tr key={l.ref} style={{ borderTop: '1px solid #f2f2f2' }}>
              <td style={s.td}>{l.loja}</td>
              <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 11.5 }}>{l.nsu}</td>
              <td style={s.td}>{l.parcela}/{l.totalParcela}</td>
              <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>{brl(l.valor)}</td>
              <td style={{ ...s.td, color: '#C0392B' }}>{dBR(l.vencimentoErp)}</td>
              <td style={{ ...s.td, color: '#1E874B' }}>{dBR(l.vencimentoOperadora)}</td>
              <td style={{ ...s.td, fontWeight: 600 }}>{l.diferencaDias == null ? 'sem data'
                : (l.diferencaDias > 0 ? '+' : '') + l.diferencaDias + ' dia(s)'}</td>
            </tr>))}</tbody>
        </table>
        {d.linhas.length > 50 && <div style={s.nota}>mostrando 50 de {d.linhas.length}</div>}
      </div>}
      {!d.linhas?.length && <div style={{ fontSize: 13, color: '#1E874B', fontWeight: 600 }}>✅ Todos os vencimentos do ERP batem com a credenciadora.</div>}
    </div>
  );
}

function Taxas({ taxas, custoExtra }) {
  if (!taxas?.length) return null;
  const semContrato = taxas.filter(t => t.contratada == null).length;
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Taxa cobrada × taxa combinada</div>
      <div style={{ fontSize: 11.5, color: '#888', margin: '4px 0 10px' }}>
        {semContrato > 0
          ? <>Cadastre as taxas do seu contrato em <b>Ajustes</b> para o sistema apontar cobrança a mais ({semContrato} combinações ainda sem taxa cadastrada).</>
          : <>Diferença total no período: <b style={{ color: custoExtra > 0 ? '#C0392B' : '#1E874B' }}>{brl(custoExtra)}</b>.</>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{['Bandeira / modalidade', 'Parcelas', 'Cobrada', 'Combinada', 'Diferença', 'Sobre', 'Custo extra'].map(h =>
            <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>{taxas.map((t, i) => (
            <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}>
              <td style={{ ...s.td, fontWeight: 600 }}>{t.bandeira} {t.grupo === 'PARCELADO' ? 'Crédito parcelado' : t.grupo === 'CREDITO' ? 'Crédito' : t.grupo === 'DEBITO' ? 'Débito' : t.grupo}</td>
              <td style={s.td}>{t.parcelas ? t.parcelas + 'x' : '—'}</td>
              <td style={{ ...s.td, fontWeight: 700 }}>{t.efetiva}%</td>
              <td style={s.td}>{t.contratada != null ? t.contratada + '%' : <span style={{ color: '#bbb' }}>não cadastrada</span>}</td>
              <td style={{ ...s.td, color: t.diferencaPontos > 0 ? '#C0392B' : t.diferencaPontos < 0 ? '#1E874B' : '#999' }}>
                {t.diferencaPontos != null ? (t.diferencaPontos > 0 ? '+' : '') + t.diferencaPontos + ' p.p.' : '—'}</td>
              <td style={{ ...s.td, color: '#888' }}>{brl(t.bruto)}</td>
              <td style={{ ...s.td, fontWeight: 600, color: t.custoExtra > 0 ? '#C0392B' : '#999' }}>
                {t.custoExtra != null ? brl(t.custoExtra) : '—'}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── Correções já feitas no ERP ─────────────────────────────────────────────
function Correcoes({ API, f }) {
  const [d, carreg] = useDados(API, '/conciliacao-cartao/correcoes', f, [API, f.ini, f.fim, f.loja]);
  if (carreg || !d) return <div style={s.vazio}>carregando…</div>;
  if (d.erro) return <div style={s.erroBox}>⚠️ {d.erro}</div>;
  return (
    <>
      <div style={{ ...s.card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Stat n={d.total} l="Correções no período" cor="#B7791F" bg="#FDF6E7" />
        <Stat n={d.trocaDeForma} l="Trocaram a forma de pagamento" cor="#C0392B" bg="#FBEAEA" />
        <Stat n={brlK(d.valor)} l="Valor corrigido" />
      </div>
      <div style={s.nota}>Isto é o retrabalho que já aconteceu: cada linha é uma venda que alguém teve que consertar à mão no ERP. Serve para medir o tamanho do problema e treinar quem mais erra.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10, marginTop: 10 }}>
        <Barras titulo="De → para (o erro mais comum)" itens={d.porTroca} cor="#C0392B" />
        <Barras titulo="Operador que fez a venda" itens={d.porOperador} cor="#C87A1E" />
        <Barras titulo="Por loja" itens={d.porLoja} cor="#2E5C9E" />
        <Barras titulo="Quem corrigiu" itens={d.porQuemCorrigiu} cor="#1E874B" />
        <Barras titulo="Por dia" itens={d.porDia} cor="#7A4FB0" />
      </div>
    </>
  );
}

// ── Ajustes (de-para) ──────────────────────────────────────────────────────
function Ajustes({ API }) {
  const [d, setD] = useState(null);
  const [salvando, setSalvando] = useState('');
  const carregar = useCallback(() => API.get('/conciliacao-cartao/ajustes').then(r => setD(r.data)).catch(e => setD({ erro: e.response?.data?.erro || e.message })), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!d) return <div style={s.vazio}>carregando…</div>;
  if (d.erro) return <div style={s.erroBox}>⚠️ {d.erro}</div>;

  const mudarGrupo = async (m, grupo) => {
    setSalvando(m.id);
    await API.post('/conciliacao-cartao/ajustes/modalidades', { itens: [{ id: m.id, nome: m.nome, grupo, conciliar: m.conciliar }] });
    await carregar(); setSalvando('');
  };
  const mudarConciliar = async (m, conciliar) => {
    setSalvando(m.id);
    await API.post('/conciliacao-cartao/ajustes/modalidades', { itens: [{ id: m.id, nome: m.nome, grupo: m.grupo, conciliar }] });
    await carregar(); setSalvando('');
  };
  const alternarOperadora = async (op, modId) => {
    const atual = d.operadoras[op] || [];
    const novo = atual.includes(modId) ? atual.filter(x => x !== modId) : [...atual, modId];
    setSalvando(op + modId);
    await API.post('/conciliacao-cartao/ajustes/operadora', { operadora: op, modalidades: novo });
    await carregar(); setSalvando('');
  };
  const ativas = d.modalidades.filter(m => m.ativa);

  return (
    <>
      <TaxasContrato API={API} />
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Forma de pagamento do ERP → o que ela é de verdade</div>
        <div style={{ fontSize: 11.5, color: '#888', margin: '4px 0 10px' }}>
          É isto que deixa o sistema dizer "está errado": se o ERP marcou uma forma de <i>crédito</i> e a operadora registrou <i>voucher</i>, vira divergência.
          Desmarque "conferir" nas formas que não passam em maquininha (Pix do banco, crediário da casa).
        </div>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{['Forma no ERP', 'É de verdade', 'Conferir?'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>{ativas.map(m => (
            <tr key={m.id} style={{ borderTop: '1px solid #f2f2f2', opacity: salvando === m.id ? 0.5 : 1 }}>
              <td style={{ ...s.td, fontWeight: 600 }}>{m.nome}</td>
              <td style={s.td}>
                <select value={m.grupo} onChange={e => mudarGrupo(m, e.target.value)} style={{ ...s.inp, padding: '4px 7px' }}>
                  {d.grupos.map(g => <option key={g} value={g}>{d.rotulos[g] || g}</option>)}
                </select>
              </td>
              <td style={s.td}><input type="checkbox" checked={m.conciliar} onChange={e => mudarConciliar(m, e.target.checked)} /></td>
            </tr>))}</tbody>
        </table></div>
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Quais formas do ERP pertencem a cada operadora</div>
        <div style={{ fontSize: 11.5, color: '#888', margin: '4px 0 10px' }}>
          Serve para o sistema saber o que cobrar de cada relatório. Sem isso ele não consegue dizer "a operadora não pagou este título".
        </div>
        {Object.keys(d.operadoras).map(op => (
          <div key={op} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f4f4f4' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{op}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ativas.map(m => {
                const on = (d.operadoras[op] || []).includes(m.id);
                return <button key={m.id} onClick={() => alternarOperadora(op, m.id)}
                  style={{ ...s.chip, ...(on ? { background: '#7A4FB0', color: '#fff', borderColor: '#7A4FB0' } : {}), fontSize: 11.5, padding: '4px 9px' }}>
                  {m.nome}</button>;
              })}
            </div>
          </div>))}
      </div>
    </>
  );
}

// ── Taxas do contrato: por FILIAL, por bandeira e por faixa de parcelamento ─
// Cada CNPJ tem seu credenciamento, então a taxa é cadastrada loja a loja — com um botão para
// copiar a tabela de uma filial para as outras, que é como a negociação costuma ser feita.
const FAIXAS = [
  { k: 'DEBITO', rot: 'Débito', grupo: 'DEBITO', ini: 0, fim: 0 },
  { k: 'CREDITO', rot: 'Crédito à vista', grupo: 'CREDITO', ini: 0, fim: 0 },
  { k: 'P2_6', rot: '2 a 6x', grupo: 'PARCELADO', ini: 2, fim: 6 },
  { k: 'P7_12', rot: '7 a 12x', grupo: 'PARCELADO', ini: 7, fim: 12 },
];
const BANDEIRAS = ['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard'];

function TaxasContrato({ API }) {
  const [d, setD] = useState(null);
  const [operadora, setOperadora] = useState('Rede');
  const [loja, setLoja] = useState('*');
  const [editando, setEditando] = useState({});
  const [copiando, setCopiando] = useState(false);
  const [puxando, setPuxando] = useState(false);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/conciliacao-cartao/repasses/config')
    .then(r => setD(r.data)).catch(e => setD({ erro: e.response?.data?.erro || e.message })), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!d) return null;
  if (d.erro) return <div style={s.erroBox}>⚠️ {d.erro}</div>;

  const lojas = d.lojas || [];
  // Rede/Cielo negociam por bandeira; Brasil Card, Banese, Bracov, Alelo, Le Card e Multi Mais
  // são a credenciadora E a bandeira — ali é uma linha só, gravada como '*'.
  const cred = (d.credenciadoras || []).find(c => c.nome === operadora) || { propria: true, bandeiras: [] };
  const linhasBandeira = cred.propria ? [{ label: operadora, valor: '*' }]
    : cred.bandeiras.map(b => ({ label: b, valor: b }));
  const achar = (bandeira, fx) => (d.taxas || []).find(t => t.operadora === operadora && t.loja_id === loja
    && t.bandeira === bandeira && t.grupo === fx.grupo && t.parcela_ini === fx.ini && t.parcela_fim === fx.fim);
  const chaveCel = (b, fx) => b + '|' + fx.k;

  const gravar = async (bandeira, fx, valor) => {
    const taxa = Number(String(valor).replace(',', '.'));
    if (!valor || Number.isNaN(taxa)) return;
    await API.post('/conciliacao-cartao/repasses/taxa', { operadora, lojaId: loja, bandeira, grupo: fx.grupo,
      parcelaIni: fx.ini, parcelaFim: fx.fim, taxa });
    setEditando(e => ({ ...e, [chaveCel(bandeira, fx)]: undefined }));
    carregar();
  };
  const limpar = async (bandeira, fx) => {
    await API.post('/conciliacao-cartao/repasses/taxa/excluir', { operadora, lojaId: loja, bandeira, grupo: fx.grupo,
      parcelaIni: fx.ini, parcelaFim: fx.fim });
    carregar();
  };
  const replicar = async () => {
    const destino = lojas.map(l => l.id).filter(id => id !== loja);
    if (!destino.length) return;
    if (!window.confirm(`Copiar as taxas de ${loja === '*' ? 'TODAS as filiais' : (lojas.find(l => l.id === loja) || {}).nome} para as outras ${destino.length} filiais? O que estiver cadastrado nelas será substituído.`)) return;
    setCopiando(true); setMsg('');
    const r = await API.post('/conciliacao-cartao/repasses/taxa/replicar', { operadora, deLojaId: loja, paraLojas: destino });
    setCopiando(false);
    setMsg(r.data.ok ? `✅ ${r.data.copiadas} taxa(s) copiadas para ${r.data.lojas} filial(is).` : '⚠️ ' + r.data.erro);
    carregar();
  };

  // O ERP tem tabelas para taxa contratada, mas hoje estão vazias — o botão consulta e diz o que achou.
  const puxarDoErp = async () => {
    setPuxando(true); setMsg('');
    const r = await API.post('/conciliacao-cartao/repasses/taxas-erp/importar').catch(e => ({ data: { ok: false, erro: e.response?.data?.erro || e.message } }));
    setPuxando(false);
    setMsg(r.data.ok ? `✅ ${r.data.importadas} taxa(s) trazidas do ERP.` : '⚠️ ' + r.data.erro);
    carregar();
  };

  const cadastradasNaLoja = (d.taxas || []).filter(t => t.operadora === operadora && t.loja_id === loja).length;

  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Taxas combinadas com a credenciadora</div>
      <div style={{ fontSize: 11.5, color: '#888', margin: '4px 0 10px' }}>
        É por <b>filial</b> (cada CNPJ tem seu credenciamento), por <b>bandeira</b> e por <b>faixa de parcelamento</b>.
        Preencha uma filial e use <b>copiar para as outras</b> quando a negociação for a mesma.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <label style={s.fld}>Credenciadora
          <select value={operadora} onChange={e => setOperadora(e.target.value)} style={s.inp}>
            {['Rede', 'Cielo', 'GetNet', 'Stone', 'Brasil Card', 'Le Card', 'Nutricash', 'Bracov', 'Alelo'].map(o =>
              <option key={o} value={o}>{o}</option>)}
          </select></label>
        <label style={s.fld}>Filial
          <select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}>
            <option value="*">Todas as filiais (padrão)</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select></label>
        <button onClick={replicar} disabled={copiando || !cadastradasNaLoja} style={{ ...s.chip, opacity: cadastradasNaLoja ? 1 : 0.5 }}>
          {copiando ? 'copiando…' : '📋 copiar para as outras filiais'}
        </button>
        <button onClick={puxarDoErp} disabled={puxando} style={s.chip} title="Traz as taxas cadastradas no ERP, se houver">
          {puxando ? 'consultando o ERP…' : '⬇️ puxar do ERP'}
        </button>
        <span style={{ fontSize: 11.5, color: '#888' }}>{cadastradasNaLoja} taxa(s) nesta filial</span>
      </div>
      {msg && <div style={s.aviso}>{msg}</div>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>
            <th style={s.th}>{cred.propria ? 'Credenciadora' : 'Bandeira'}</th>
            {FAIXAS.map(fx => <th key={fx.k} style={{ ...s.th, textAlign: 'center' }}>{fx.rot}</th>)}
          </tr></thead>
          <tbody>
            {linhasBandeira.map(({ label, valor: b }) => (
              <tr key={label} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={{ ...s.td, fontWeight: 600 }}>{label}</td>
                {FAIXAS.map(fx => {
                  const atual = achar(b, fx);
                  const k = chaveCel(b, fx);
                  const valor = editando[k] !== undefined ? editando[k] : (atual ? String(atual.taxa) : '');
                  return (
                    <td key={fx.k} style={{ ...s.td, textAlign: 'center' }}>
                      <input value={valor} placeholder="—"
                        onChange={e => setEditando(x => ({ ...x, [k]: e.target.value }))}
                        onBlur={e => { if (e.target.value !== (atual ? String(atual.taxa) : '')) gravar(b, fx, e.target.value); }}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                        style={{ ...s.inp, width: 64, textAlign: 'right', padding: '4px 6px',
                          background: atual ? '#EAF6EF' : '#fff', borderColor: atual ? '#BEE3CD' : '#ddd' }} />
                      <span style={{ fontSize: 11, color: '#aaa' }}>%</span>
                      {atual && <button onClick={() => limpar(b, fx)} title="remover" style={{ ...s.btnMini, marginLeft: 4, padding: '2px 5px' }}>×</button>}
                    </td>
                  );
                })}
              </tr>))}
          </tbody>
        </table>
      </div>
      <div style={{ ...s.nota, marginTop: 8 }}>
        💡 O que ficar em branco não é conferido. A taxa da <b>filial</b> tem prioridade sobre a de "todas as filiais",
        e a de uma <b>bandeira</b> específica tem prioridade sobre a genérica.
        <div style={{ marginTop: 6 }}>
          Por que cadastrar aqui e não usar o ERP: as tabelas de taxa do ERP estão <b>vazias</b>, e a taxa que aparece
          em cada título é <b>o valor que a própria credenciadora informou</b> — comparar com ela seria comparar a
          operadora com ela mesma. O que está aqui é o seu contrato, e é ele que denuncia cobrança a mais.
        </div>
      </div>

      {d.estabelecimentos?.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Estabelecimentos reconhecidos (é o que abre o repasse por filial)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {d.estabelecimentos.map(e => {
              const l = lojas.find(x => x.id === e.loja_id);
              return <span key={e.operadora + e.estabelecimento} style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 20, background: l ? '#EAF6EF' : '#FBEAEA', color: l ? '#1E874B' : '#8A2E2E' }}>
                {e.estabelecimento} → {l ? l.nome : 'sem loja'}</span>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Recebimentos futuros: o que vai entrar (vendas com vencimento futuro, sem baixa) ──
function RecebimentosFuturos({ API, f }) {
  const [dias, setDias] = useState(90);
  const [rini, setRini] = useState('');
  const [rfim, setRfim] = useState('');
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const custom = rini && rfim;
  const params = () => custom ? { loja: f.loja || '', rini, rfim } : { loja: f.loja || '', dias };
  useEffect(() => {
    setCarregando(true); setErro(null);
    API.get('/conciliacao-cartao/recebimentos-futuros', { params: params() })
      .then(r => { if (r.data.ok) setD(r.data); else setErro(r.data.erro || 'Erro.'); })
      .catch(e => setErro(e.response?.data?.erro || 'Erro.')).finally(() => setCarregando(false));
    // eslint-disable-next-line
  }, [API, f.loja, dias, rini, rfim]);
  const exportarDetalhe = () => {
    setExportando(true);
    API.get('/conciliacao-cartao/recebimentos-futuros/itens', { params: params() }).then(r => {
      const itens = (r.data && r.data.itens) || [];
      const cols = [
        { h: 'Loja', f: x => x.loja }, { h: 'CNPJ', f: x => x.cnpj }, { h: 'Operadora', f: x => x.operadora },
        { h: 'Bandeira', f: x => x.bandeira }, { h: 'Data venda', f: x => dBR(x.data_venda) }, { h: 'Data recebimento', f: x => dBR(x.data_recebimento) },
        { h: 'NSU', f: x => x.nsu }, { h: 'Autorização', f: x => x.autorizacao }, { h: 'Estabelecimento', f: x => x.estabelecimento }, { h: 'Valor', f: x => String(x.valor).replace('.', ',') },
      ];
      const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const txt = [cols.map(c => esc(c.h)).join(';'), ...itens.map(l => cols.map(c => esc(c.f(l))).join(';'))].join('\n');
      const blob = new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'recebimentos-futuros.csv'; a.click(); URL.revokeObjectURL(a.href);
    }).catch(() => {}).finally(() => setExportando(false));
  };
  const t = (d && d.total) || {};
  const maxDia = d ? Math.max(...(d.porData || []).map(x => x.valor), 1) : 1;
  const Stat = ({ l, v, cor }) => <div style={{ ...s.card, flex: '1 1 160px', margin: 0 }}><div style={{ fontSize: 11.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: .3 }}>{l}</div><div style={{ fontSize: 22, fontWeight: 800, color: cor || '#1e293b', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{v}</div></div>;
  return (
    <div>
      <div style={s.card}>O que vai <b>entrar na conta</b> — vendas de cartão com vencimento a partir de hoje e ainda sem baixa, por dia e por operadora (valor líquido). Útil pro fluxo de caixa e pra contabilidade.</div>
      <div style={{ ...s.card, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>Período:</span>
        {[30, 60, 90, 180].map(n => <button key={n} onClick={() => { setRini(''); setRfim(''); setDias(n); }} style={{ ...s.chip, ...(!custom && dias === n ? s.chipOn : {}) }}>{n} dias</button>)}
        <span style={{ fontSize: 12, color: '#cbd5e1' }}>|</span>
        <label style={s.fld}>De<input type="date" value={rini} onChange={e => setRini(e.target.value)} style={s.inp} /></label>
        <label style={s.fld}>Até<input type="date" value={rfim} onChange={e => setRfim(e.target.value)} style={s.inp} /></label>
        {custom && <button onClick={() => { setRini(''); setRfim(''); }} style={s.chip}>usar presets</button>}
        <div style={{ flex: 1 }} />
        <button onClick={exportarDetalhe} disabled={exportando} style={{ ...s.chip, ...s.chipOn }}>{exportando ? 'gerando…' : '⬇️ Excel detalhado'}</button>
      </div>
      {erro && <div style={s.erroBox}>{erro}</div>}
      {carregando && <div style={s.vazio}>Carregando…</div>}
      {d && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <Stat l={`A receber (${d.dias} dias)`} v={brl(t.valor)} cor="#15803d" />
            <Stat l="Próximos 7 dias" v={brl(t.proximos7)} cor="#0d6b5e" />
            <Stat l="Vendas a liquidar" v={Number(t.n || 0).toLocaleString('pt-BR')} />
          </div>
          {!!(d.porOperadora || []).length && (
            <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>Por operadora:</span>
              {d.porOperadora.map((o, i) => <span key={i} style={{ fontSize: 12.5, background: '#eef2f0', borderRadius: 16, padding: '4px 10px' }}>{o.operadora} · <b>{brl(o.valor)}</b></span>)}
            </div>
          )}
          <div style={{ ...s.card, overflowX: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Por data de recebimento</div>
            {!(d.porData || []).length && <div style={s.vazio}>Nada a receber no período 🎉</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {(d.porData || []).map((x, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...s.td, whiteSpace: 'nowrap', fontWeight: 600, width: 90 }}>{dBR(x.data)}</td>
                    <td style={{ ...s.td, width: '55%' }}>
                      <div style={{ height: 14, borderRadius: 4, background: '#eef2f0', overflow: 'hidden' }}><div style={{ width: (100 * x.valor / maxDia) + '%', height: '100%', background: '#0d6b5e', minWidth: 2 }} /></div>
                    </td>
                    <td style={{ ...s.td, color: '#94a3b8', fontSize: 11.5 }} title={x.operadoras.map(o => o.operadora + ': ' + brl(o.valor)).join('\n')}>{x.operadoras.map(o => o.operadora).join(', ')}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{brl(x.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Aluguel/mensalidade de máquinas: o que a operadora descontou no repasse ──
function AluguelMaquinas({ API, f }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    setCarregando(true); setErro(null);
    API.get('/conciliacao-cartao/custo-maquinas', { params: { ini: f.ini, fim: f.fim, loja: f.loja || '' } })
      .then(r => { if (r.data.ok) setD(r.data); else setErro(r.data.erro || 'Erro.'); })
      .catch(e => setErro(e.response?.data?.erro || 'Erro.')).finally(() => setCarregando(false));
  }, [API, f.ini, f.fim, f.loja]);
  const t = (d && d.total) || {};
  const exportar = () => baixarCSV('aluguel-maquinas', [
    { h: 'Operadora', f: l => l.operadora }, { h: 'Descrição', f: l => l.descricao }, { h: 'Loja', f: l => l.loja },
    { h: 'Qtd', f: l => l.n }, { h: 'Valor', f: l => num(l.valor) },
  ], (d && d.linhas) || []);
  return (
    <div>
      <div style={{ ...s.card, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>Aluguel, mensalidade e <b>cobranças que a operadora descontou</b> no repasse (vêm dos relatórios de repasse importados). Filtra por período e loja. Se estiver vazio, é porque ainda não foram importados relatórios de repasse com esses descontos (aba <b>Repasses ▸ Importar</b>).</div>
        <button onClick={exportar} disabled={!d || !(d.linhas || []).length} style={{ ...s.chip, ...s.chipOn }}>⬇️ Excel detalhado</button>
      </div>
      {erro && <div style={s.erroBox}>{erro}</div>}
      {carregando && <div style={s.vazio}>Carregando…</div>}
      {d && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <Stat l="Total descontado" v={brl(t.valor)} cor="#C0392B" />
            <Stat l="Lançamentos" v={Number(t.n || 0).toLocaleString('pt-BR')} />
          </div>
          {!!(d.porLoja || []).length && (
            <div style={{ ...s.card, overflowX: 'auto' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Por loja</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Loja', 'Lançamentos', 'Total'].map(h => <th key={h} style={h === 'Loja' ? s.th : { ...s.th, textAlign: 'right' }}>{h}</th>)}</tr></thead>
                <tbody>{d.porLoja.map((l, i) => <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}><td style={{ ...s.td, fontWeight: 600 }}>{l.loja}</td><td style={{ ...s.td, textAlign: 'right' }}>{l.n}</td><td style={{ ...s.td, textAlign: 'right', color: '#C0392B', fontWeight: 600 }}>{brl(l.valor)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <div style={{ ...s.card, overflowX: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Detalhe (operadora × descrição × loja)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['Operadora', 'Descrição', 'Loja', 'Qtd', 'Valor'].map(h => <th key={h} style={h === 'Qtd' || h === 'Valor' ? { ...s.th, textAlign: 'right' } : s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {(d.linhas || []).map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{l.operadora}</td>
                    <td style={s.td}>{l.descricao}</td>
                    <td style={s.td}>{l.loja}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{l.n}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#C0392B', fontWeight: 600 }}>{brl(l.valor)}</td>
                  </tr>
                ))}
                {!(d.linhas || []).length && <tr><td colSpan={5} style={s.vazio}>Nenhum desconto de repasse no período — importe os relatórios de repasse.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Taxas combinadas: cadastro + BI (combinado × praticado) + contrato da negociação ─────────
const OPERADORAS_TAXA = ['Rede', 'Cielo', 'GetNet', 'Stone', 'Brasil Card', 'Le Card', 'Nutricash', 'Bracov', 'Alelo', 'Banese / Mulvi', 'Multi Mais / Uze'];
function TaxasCombinadas({ API, f, lojas }) {
  return (
    <div>
      <BiTaxa API={API} f={f} />
      <ContratosNegociacao API={API} lojas={lojas} />
      <TaxasContrato API={API} />
    </div>
  );
}

// BI: o combinado está sendo cumprido? taxa COMBINADA (cadastro) × PRATICADA (ERP)
function BiTaxa({ API, f }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [carreg, setCarreg] = useState(false);
  const [soAcima, setSoAcima] = useState(false);
  useEffect(() => {
    setCarreg(true); setErro(null); setD(null);
    API.get('/conciliacao-cartao/bi-taxa', { params: { ini: f.ini, fim: f.fim, loja: f.loja || '' } })
      .then(r => { if (r.data.ok) setD(r.data); else setErro(r.data.erro || 'Erro.'); })
      .catch(e => setErro(e.response?.data?.erro || 'Erro.')).finally(() => setCarreg(false));
  }, [API, f.ini, f.fim, f.loja]);
  const t = (d && d.total) || {};
  const exportar = () => baixarCSV('combinado-x-praticado', [
    { h: 'Loja', f: x => x.loja }, { h: 'Operadora', f: x => x.operadora }, { h: 'Bandeira', f: x => x.bandeira }, { h: 'Grupo', f: x => x.grupoRotulo },
    { h: 'Transações', f: x => x.n }, { h: 'Bruto', f: x => num(x.bruto) }, { h: 'Combinado %', f: x => x.combinado != null ? num(x.combinado) : '' },
    { h: 'Praticado %', f: x => x.praticado != null ? num(x.praticado) : '' }, { h: 'Diferença p.p.', f: x => x.diff != null ? num(x.diff) : '' },
    { h: 'Cobrado a mais', f: x => num(x.cobradoAMais) }, { h: 'Situação', f: x => x.semCombinado ? 'SEM COMBINADO' : (x.diff > 0.01 ? 'ACIMA' : 'OK') },
  ], (d && d.linhas) || []);
  const linhas = (d && d.linhas) || [];
  const mostrar = soAcima ? linhas.filter(l => l.diff != null && l.diff > 0.01) : linhas;
  return (
    <div style={{ ...s.card, borderLeft: '4px solid #7A4FB0' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>O combinado está sendo cumprido? — taxa combinada × praticada</div>
          <div style={{ fontSize: 11.5, color: '#888' }}>A taxa que você cadastrou (combinada) contra a que a operadora realmente descontou (ERP). Onde o praticado passa do combinado, é o que levar à credenciadora.</div>
        </div>
        <button onClick={exportar} disabled={!linhas.length} style={{ ...s.chip, ...s.chipOn }}>⬇️ Excel detalhado</button>
      </div>
      {erro && <div style={s.erroBox}>⚠️ {erro}</div>}
      {carreg && <div style={s.vazio}>cruzando combinado × praticado…</div>}
      {d && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <Stat n={brlK(t.cobradoAMais)} l="cobrado acima do combinado" cor={t.cobradoAMais > 0 ? '#C0392B' : '#1E874B'} bg={t.cobradoAMais > 0 ? '#FBEAEA' : '#EAF6EF'} sub={`${t.acima || 0} grupo(s) acima`} />
            <Stat n={brlK(t.bruto)} l="venda bruta analisada" sub={`${(t.n || 0).toLocaleString('pt-BR')} transações`} />
            <Stat n={t.semCombinado || 0} l="grupos sem taxa combinada" cor={t.semCombinado ? '#C87A1E' : '#1E874B'} bg={t.semCombinado ? '#FDF6E7' : '#EAF6EF'} sub="cadastre a taxa abaixo" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={() => setSoAcima(false)} style={{ ...s.chip, ...(soAcima ? {} : s.chipOn) }}>Tudo</button>
            <button onClick={() => setSoAcima(true)} style={{ ...s.chip, ...(soAcima ? s.chipOn : {}) }}>Só o que está acima do combinado</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr>{['Loja', 'Operadora', 'Bandeira', 'Grupo', 'Combinado', 'Praticado', 'Dif (p.p.)', 'Cobrado a mais'].map(h =>
                <th key={h} style={['Loja', 'Operadora', 'Bandeira', 'Grupo'].includes(h) ? s.th : { ...s.th, textAlign: 'right' }}>{h}</th>)}</tr></thead>
              <tbody>
                {mostrar.slice(0, 400).map((l, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{l.loja}</td>
                    <td style={s.td}>{l.operadora}</td>
                    <td style={s.td}>{l.bandeira}</td>
                    <td style={s.td}>{l.grupoRotulo}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{l.combinado != null ? l.combinado + '%' : <span style={{ color: '#C87A1E' }}>— sem</span>}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{l.praticado != null ? l.praticado + '%' : '—'}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: l.diff == null ? '#999' : l.diff > 0.01 ? '#C0392B' : l.diff < -0.01 ? '#1E874B' : '#888' }}>
                      {l.diff != null ? (l.diff > 0 ? '+' : '') + l.diff : '—'}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: l.cobradoAMais > 0 ? '#C0392B' : '#888', fontVariantNumeric: 'tabular-nums' }}>{l.cobradoAMais > 0 ? brl(l.cobradoAMais) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mostrar.length > 400 && <div style={s.nota}>mostrando 400 de {mostrar.length} — baixe o Excel pro detalhe completo</div>}
          {!mostrar.length && <div style={s.vazio}>{soAcima ? '🎉 nada acima do combinado no período.' : 'Sem movimento de cartão no período.'}</div>}
        </>
      )}
    </div>
  );
}

// Contratos da negociação: anexo (PDF/foto) + validade por operadora (e filial, ou todas)
function ContratosNegociacao({ API, lojas }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState({ operadora: 'Rede', loja: '*', vigIni: '', vigFim: '', obs: '' });
  const [arq, setArq] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/conciliacao-cartao/repasses/contratos')
    .then(r => setLista(r.data.contratos || [])).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const nomeLoja = id => id === '*' ? 'Todas as filiais' : (lojas.find(l => l.id === id) || {}).nome || id;
  const escolher = e => {
    const file = e.target.files?.[0]; if (!file) { setArq(null); return; }
    const fr = new FileReader(); fr.onload = () => setArq({ nome: file.name, mime: file.type, dados: String(fr.result).split(',')[1] }); fr.readAsDataURL(file);
  };
  const salvar = async () => {
    setSalvando(true); setMsg('');
    try {
      await API.post('/conciliacao-cartao/repasses/contrato', {
        operadora: form.operadora, lojaId: form.loja, vigenciaIni: form.vigIni || null, vigenciaFim: form.vigFim || null, obs: form.obs || null,
        nome: arq?.nome, tipoMime: arq?.mime, dados: arq?.dados,
      });
      setMsg('✅ contrato salvo.'); setArq(null); setForm(f => ({ ...f, obs: '' })); carregar();
    } catch (e) { setMsg('⚠️ ' + (e.response?.data?.erro || e.message)); } finally { setSalvando(false); }
  };
  const baixar = async (c) => {
    try {
      const r = await API.get('/conciliacao-cartao/repasses/contrato/arquivo', { params: { operadora: c.operadora, loja: c.loja_id }, responseType: 'blob' });
      const url = URL.createObjectURL(r.data); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { setMsg('⚠️ ' + (e.response?.data?.erro || 'sem arquivo')); }
  };
  const excluir = async (c) => {
    if (!window.confirm(`Excluir o contrato de ${c.operadora} (${nomeLoja(c.loja_id)})?`)) return;
    await API.post('/conciliacao-cartao/repasses/contrato/excluir', { operadora: c.operadora, lojaId: c.loja_id }); carregar();
  };
  const hoje = new Date().toISOString().slice(0, 10);
  const vencido = c => c.vigencia_fim && c.vigencia_fim < hoje;
  return (
    <div style={{ ...s.card }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Contrato da negociação (acordo + validade)</div>
      <div style={{ fontSize: 11.5, color: '#888', margin: '4px 0 10px' }}>Anexe o contrato/proposta que a credenciadora assinou e a validade (vigência) do acordo — é o que sustenta a cobrança quando o praticado fugir do combinado.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <label style={s.fld}>Credenciadora<select value={form.operadora} onChange={e => setForm(f => ({ ...f, operadora: e.target.value }))} style={s.inp}>
          {OPERADORAS_TAXA.map(o => <option key={o} value={o}>{o}</option>)}</select></label>
        <label style={s.fld}>Filial<select value={form.loja} onChange={e => setForm(f => ({ ...f, loja: e.target.value }))} style={s.inp}>
          <option value="*">Todas as filiais</option>{(lojas || []).map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        <label style={s.fld}>Vigência de<input type="date" value={form.vigIni} onChange={e => setForm(f => ({ ...f, vigIni: e.target.value }))} style={s.inp} /></label>
        <label style={s.fld}>até<input type="date" value={form.vigFim} onChange={e => setForm(f => ({ ...f, vigFim: e.target.value }))} style={s.inp} /></label>
        <label style={s.fld}>Contrato (PDF/foto)<input type="file" accept="application/pdf,image/*" onChange={escolher} style={{ ...s.inp, padding: 4 }} /></label>
        <input value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} placeholder="observação (opcional)" style={{ ...s.inp, flex: 1, minWidth: 180 }} />
        <button onClick={salvar} disabled={salvando} style={{ ...s.chip, ...s.chipOn }}>{salvando ? 'salvando…' : '💾 salvar'}</button>
      </div>
      {msg && <div style={s.aviso}>{msg}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{['Credenciadora', 'Filial', 'Vigência', 'Observação', 'Contrato', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {lista.map((c, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={{ ...s.td, fontWeight: 600 }}>{c.operadora}</td>
                <td style={s.td}>{nomeLoja(c.loja_id)}</td>
                <td style={s.td}>{c.vigencia_ini ? dBR(c.vigencia_ini) : '—'} a {c.vigencia_fim ? dBR(c.vigencia_fim) : '—'}
                  {vencido(c) && <span style={{ color: '#C0392B', fontWeight: 700 }}> (vencido)</span>}</td>
                <td style={{ ...s.td, maxWidth: 220, color: '#666' }}>{c.obs || '—'}</td>
                <td style={s.td}>{c.tem_arquivo ? <button onClick={() => baixar(c)} style={s.btnMini}>📄 ver</button> : <span style={{ color: '#aaa' }}>sem anexo</span>}</td>
                <td style={s.td}><button onClick={() => excluir(c)} style={s.btnMini}>🗑️</button></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={6} style={s.vazio}>Nenhum contrato cadastrado ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Taxas de máquina (ERP): taxa cobrada por operadora/bandeira/modalidade ──
function TaxasMaquina({ API, f }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    setCarregando(true); setErro(null);
    API.get('/conciliacao-cartao/taxas', { params: { ini: f.ini, fim: f.fim, loja: f.loja || '' } })
      .then(r => { if (r.data.ok) setD(r.data); else setErro(r.data.erro || 'Erro.'); })
      .catch(e => setErro(e.response?.data?.erro || 'Erro.')).finally(() => setCarregando(false));
  }, [API, f.ini, f.fim, f.loja]);
  const t = (d && d.total) || {};
  const corPct = p => p >= 2 ? '#C0392B' : p >= 1 ? '#B7791F' : '#15803d';
  const Stat = ({ l, v, cor }) => <div style={{ ...s.card, flex: '1 1 150px', margin: 0 }}><div style={{ fontSize: 11.5, color: '#888' }}>{l}</div><div style={{ fontSize: 20, fontWeight: 700, color: cor || '#1c2a2e', fontVariantNumeric: 'tabular-nums' }}>{v}</div></div>;
  const exportar = () => {
    const linhas = (d && d.linhas) || [];
    const cols = [
      { h: 'Loja', f: x => x.loja }, { h: 'Operadora', f: x => x.operadora }, { h: 'Bandeira', f: x => x.bandeira }, { h: 'Modalidade', f: x => x.modalidade },
      { h: 'Transações', f: x => x.n }, { h: 'Bruto', f: x => String(x.bruto).replace('.', ',') }, { h: 'Taxa', f: x => String(x.taxa).replace('.', ',') },
      { h: 'Antecipação', f: x => String(x.taxa_antecip).replace('.', ',') }, { h: 'Líquido', f: x => String(x.liquido).replace('.', ',') }, { h: '% efetiva', f: x => x.pct != null ? String(x.pct).replace('.', ',') : '' },
    ];
    const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const txt = [cols.map(c => esc(c.h)).join(';'), ...linhas.map(l => cols.map(c => esc(c.f(l))).join(';'))].join('\n');
    const blob = new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'taxas-maquina.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <div>
      <div style={{ ...s.card, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240, fontSize: 13 }}>Taxas cobradas pelas <b>máquinas de cartão</b> no período (do ERP): quanto foi descontado de taxa por operadora, bandeira e modalidade, e a <b>taxa efetiva (%)</b>. Bruto = líquido + taxa.</div>
        <button onClick={exportar} disabled={!d || !(d.linhas || []).length} style={{ ...s.chip, ...s.chipOn }}>⬇️ Excel detalhado</button>
      </div>
      {erro && <div style={s.erroBox}>{erro}</div>}
      {carregando && <div style={s.vazio}>Carregando…</div>}
      {d && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <Stat l="Bruto (vendas)" v={brl(t.bruto)} />
            <Stat l="Taxa cobrada" v={brl(t.taxa)} cor="#C0392B" />
            <Stat l="Antecipação" v={brl(t.taxa_antecip)} cor="#B7791F" />
            <Stat l="Líquido recebido" v={brl(t.liquido)} cor="#15803d" />
            <Stat l="Taxa efetiva" v={(t.pct != null ? t.pct + '%' : '—')} cor={corPct(t.pct || 0)} />
          </div>
          {!!(d.porLoja || []).length && (
            <div style={{ ...s.card, overflowX: 'auto' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Por loja</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Loja', 'Transações', 'Bruto', 'Taxa', 'Líquido', '% efetiva'].map(h => <th key={h} style={h === 'Loja' ? s.th : { ...s.th, textAlign: 'right' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {d.porLoja.map((l, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ ...s.td, fontWeight: 600 }}>{l.loja}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{Number(l.n).toLocaleString('pt-BR')}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{brl(l.bruto)}</td>
                      <td style={{ ...s.td, textAlign: 'right', color: '#C0392B', fontWeight: 600 }}>{brl(l.taxa)}</td>
                      <td style={{ ...s.td, textAlign: 'right', color: '#15803d' }}>{brl(l.liquido)}</td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: corPct(l.pct || 0) }}>{l.pct != null ? l.pct + '%' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ ...s.card, overflowX: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Detalhe (loja × operadora × bandeira × modalidade)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['Loja', 'Operadora', 'Bandeira', 'Modalidade', 'Transações', 'Bruto', 'Taxa', 'Antecip.', 'Líquido', '% efetiva'].map(h => <th key={h} style={['Loja', 'Operadora', 'Bandeira', 'Modalidade'].includes(h) ? s.th : { ...s.th, textAlign: 'right' }}>{h}</th>)}</tr></thead>
              <tbody>
                {(d.linhas || []).map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{l.loja}</td>
                    <td style={s.td}>{l.operadora}</td>
                    <td style={s.td}>{l.bandeira}</td>
                    <td style={s.td}>{l.modalidade}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{Number(l.n).toLocaleString('pt-BR')}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{brl(l.bruto)}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#C0392B' }}>{brl(l.taxa)}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#B7791F' }}>{l.taxa_antecip ? brl(l.taxa_antecip) : '—'}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#15803d' }}>{brl(l.liquido)}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: corPct(l.pct || 0) }}>{l.pct != null ? l.pct + '%' : '—'}</td>
                  </tr>
                ))}
                {!(d.linhas || []).length && <tr><td colSpan={10} style={s.vazio}>Sem movimento de cartão no período.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const s = {
  wrap: { padding: 20, maxWidth: 1180, margin: '0 auto' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', marginBottom: 12 },
  inp: { border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  fld: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#64748b' },
  chip: { fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#475569', fontWeight: 600 },
  chipOn: { background: '#e6f3f0', color: '#0d6b5e', borderColor: '#0d6b5e' },
  th: { textAlign: 'left', fontSize: 11, color: '#888', padding: '5px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  td: { textAlign: 'left', padding: '7px 8px', verticalAlign: 'top' },
  vazio: { fontSize: 12.5, color: '#aaa', textAlign: 'center', padding: 14 },
  nota: { fontSize: 11.5, color: '#888', background: '#F6F7F9', borderRadius: 8, padding: '8px 10px' },
  aviso: { fontSize: 12, color: '#7A5A18', background: '#FDF6E7', border: '1px solid #F0E0BC', borderRadius: 8, padding: '8px 10px', marginBottom: 8 },
  erroBox: { background: '#FBEAEA', border: '1px solid #F0C7C7', color: '#8A2E2E', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, marginBottom: 10 },
  btnMini: { fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', marginRight: 4, color: '#555' },
  btn: { fontSize: 13, padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: 18, width: '100%', maxHeight: '90vh', overflowY: 'auto' },
};
