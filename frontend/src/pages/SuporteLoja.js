import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { UI, Kpi, KpiGrid, Tabs, FiltroBar, thR, tdR, CORES } from '../components/ui';
import { RecebimentoAberto } from './Fiscal';
import MeuSetorArea from './MeuSetorArea';
import MinhaAreaLateral from '../components/MinhaAreaLateral';
import { usePeriodo, CampoPeriodo } from '../components/Periodo';

const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const num = v => (Number(v) || 0).toLocaleString('pt-BR');
const dBR = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const corFarol = f => f === 'verde' ? CORES.ok : f === 'amarelo' ? '#B45309' : f === 'vermelho' ? CORES.alerta : CORES.fraco;

// ── Filtro de loja compartilhado ──────────────────────────────────────────────
function useLojas(API) {
  const [lojas, setLojas] = useState([]);
  useEffect(() => { API.get('/suporte-loja/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  return lojas;
}
function BarraLoja({ loja, setLoja, lojas, per, diasOpc, children }) {
  return (
    <FiltroBar>
      <label style={UI.fld}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={{ ...UI.inp, minWidth: 170 }}><option value="">Rede (todas)</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
      {per && <CampoPeriodo {...per} diasOpc={diasOpc || [15, 30, 60, 90]} />}
      {children}
    </FiltroBar>
  );
}

// ── Aba: NF × XML (recebida sem entrada) ──────────────────────────────────────
// Pendências acionáveis do Suporte p/ o painel "Minha área" (cada linha abre a aba correspondente).
function PendenciasSuporte({ API, irPara }) {
  const [p, setP] = useState(null);
  useEffect(() => { API.get('/suporte-loja/minha-area').then(r => setP(r.data)).catch(() => setP(null)); }, [API]);
  if (!p || p.erp === false) return null;
  const Linha = ({ emoji, label, qtd, valor, aba }) => (
    <div onClick={() => irPara(aba)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 9, background: qtd ? '#fff7f5' : '#f5f9f6', border: '1px solid ' + (qtd ? '#f1d6cf' : '#e4efe7'), marginBottom: 6 }}>
      <span style={{ fontSize: 15 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, color: '#334' }}>{label}</div>{valor ? <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{brl0(valor)} parados</div> : null}</div>
      <b style={{ fontSize: 15, color: qtd ? CORES.alerta : CORES.ok }}>{num(qtd)}</b>
    </div>
  );
  const acCor = p.acuracidade == null ? '#94a3b8' : p.acuracidade >= 95 ? CORES.ok : p.acuracidade >= 90 ? '#B7791F' : CORES.alerta;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>📋 Pendências agora</div>
      <Linha emoji="📥" label="Notas pendentes de entrada" qtd={p.notasPendentes?.qtd || 0} valor={p.notasPendentes?.valor} aba="notas-pendentes" />
      <Linha emoji="⚠️" label="Sem recepção de transporte" qtd={p.semRecepcao?.qtd || 0} valor={p.semRecepcao?.valor} aba="entrada-sem-recepcao" />
      <Linha emoji="🧾" label="XMLs não lançados" qtd={p.xmlNaoLancado?.qtd || 0} valor={p.xmlNaoLancado?.valor} aba="nfxml" />
      <div onClick={() => irPara('acuracidade')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 9, background: '#f5f9f6', border: '1px solid #e4efe7' }}>
        <span style={{ fontSize: 15 }}>🎯</span>
        <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600, color: '#334' }}>Acuracidade</div></div>
        <b style={{ fontSize: 15, color: acCor }}>{p.acuracidade != null ? p.acuracidade + '%' : '—'}</b>
      </div>
    </div>
  );
}

function NfXml({ API }) {
  const lojas = useLojas(API);
  const [loja, setLoja] = useState(''); const per = usePeriodo('60');
  const [d, setD] = useState(null); const [carr, setCarr] = useState(false);
  const carregar = useCallback(() => { if (!per.params) return; setCarr(true); API.get('/suporte-loja/nf-xml', { params: { loja, ...per.params } }).then(r => setD(r.data)).catch(() => setD(null)).finally(() => setCarr(false)); }, [API, loja, per.periodo, per.ini, per.fim]); // eslint-disable-line
  useEffect(() => { carregar(); }, [carregar]);
  const it = d?.itens || [];
  return (<>
    <BarraLoja loja={loja} setLoja={setLoja} lojas={lojas} per={per} diasOpc={[30, 60, 90, 120]} />
    <div style={{ fontSize: 12, color: CORES.suave, margin: '-4px 2px 10px' }}>Notas que a SEFAZ distribuiu (XML) e que <b>não têm entrada no ERP</b> — possível pendência/erro de lançamento.</div>
    {carr && !d ? <div style={UI.card}>⏳ Carregando…</div> : !d || d.erro ? <div style={UI.card}>⚠️ {d?.erro || 'Não foi possível carregar.'}</div> : <>
      <KpiGrid>
        <Kpi label="Notas sem entrada" valor={num(d.resumo?.total || 0)} cor={d.resumo?.total ? CORES.alerta : CORES.ok} />
        <Kpi label="Valor parado (XML)" valor={brl0(d.resumo?.valorTotal)} cor={CORES.alerta} />
        <Kpi label="⚠️ Há +7 dias" valor={num(d.resumo?.criticos || 0)} cor={d.resumo?.criticos ? CORES.alerta : CORES.ok} sub="prazo de manifestação" />
      </KpiGrid>
      <div style={{ ...UI.card, padding: 0, overflowX: 'auto' }}>
        <table style={UI.tabela}><thead><tr>{['Fornecedor', 'Loja', 'Emissão', 'Dias', 'Valor (XML)', 'Chave'].map((h, i) => <th key={h} style={i >= 3 && i <= 4 ? thR : UI.th}>{h}</th>)}</tr></thead>
          <tbody>
            {it.length === 0 && <tr><td colSpan={6} style={{ ...UI.td, color: CORES.ok, fontWeight: 600, padding: 16 }}>✅ Nenhuma nota recebida sem entrada no período.</td></tr>}
            {it.map((r, i) => <tr key={r.chave || i}>
              <td style={{ ...UI.td, fontWeight: 600 }}>{r.fornecedor || '—'}{r.cnpj ? <div style={{ fontSize: 10, color: CORES.fraco }}>{r.cnpj}</div> : null}</td>
              <td style={UI.td}>{r.loja}</td>
              <td style={UI.td}>{dBR(r.emissao)}</td>
              <td style={{ ...tdR, fontWeight: 700, color: r.dias > 7 ? CORES.alerta : CORES.suave }}>{r.dias}</td>
              <td style={{ ...tdR, fontWeight: 700 }}>{brl(r.valor)}</td>
              <td style={{ ...UI.td, fontSize: 10.5, color: CORES.fraco, fontFamily: 'monospace' }}>{r.chave}</td>
            </tr>)}
          </tbody></table>
      </div>
    </>}
  </>);
}

// ── Aba: Notas pendentes de entrada (conciliadas/liberadas sem recepção física) ──
function NotasPendentesEntrada({ API }) {
  const lojas = useLojas(API);
  const [loja, setLoja] = useState(''); const per = usePeriodo('90');
  const [d, setD] = useState(null); const [carr, setCarr] = useState(false);
  const [soSemConf, setSoSemConf] = useState(true);
  const carregar = useCallback(() => { if (!per.params) return; setCarr(true); API.get('/suporte-loja/notas-pendentes-entrada', { params: { loja, ...per.params } }).then(r => setD(r.data)).catch(() => setD(null)).finally(() => setCarr(false)); }, [API, loja, per.periodo, per.ini, per.fim]); // eslint-disable-line
  useEffect(() => { carregar(); }, [carregar]);
  const itTodos = d?.itens || [];
  const it = soSemConf ? itTodos.filter(i => !i.conferida) : itTodos;
  return (<>
    <BarraLoja loja={loja} setLoja={setLoja} lojas={lojas} per={per} diasOpc={[30, 60, 90, 120]}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: CORES.corpo, cursor: 'pointer' }}>
        <input type="checkbox" checked={soSemConf} onChange={e => setSoSemConf(e.target.checked)} /> só sem conferência
      </label>
    </BarraLoja>
    <div style={{ fontSize: 12, color: CORES.suave, margin: '-4px 2px 10px' }}>A nota é <b>liberada</b> quando o <b>pedido é conciliado</b>. Aqui estão as liberadas que ainda <b>não tiveram recepção física</b> (pendentes de dar entrada). As <b>sem conferência</b> são o caso crítico.</div>
    {carr && !d ? <div style={UI.card}>⏳ Carregando…</div> : !d || d.erro ? <div style={UI.card}>⚠️ {d?.erro || 'Não foi possível carregar.'}</div> : <>
      <KpiGrid>
        <Kpi label="Liberadas sem recepção" valor={num(d.resumo?.total || 0)} cor={d.resumo?.total ? CORES.alerta : CORES.ok} />
        <Kpi label="⚠️ Sem conferência" valor={num(d.resumo?.semConferencia || 0)} cor={d.resumo?.semConferencia ? CORES.alerta : CORES.ok} sub={brl0(d.resumo?.valorSemConferencia)} />
        <Kpi label="Valor parado" valor={brl0(d.resumo?.valorTotal)} cor={CORES.alerta} />
        <Kpi label="Há +7 dias" valor={num(d.resumo?.criticos || 0)} cor={d.resumo?.criticos ? CORES.alerta : CORES.ok} />
      </KpiGrid>
      <div style={{ ...UI.card, padding: 0, overflowX: 'auto' }}>
        <table style={UI.tabela}><thead><tr>{['Fornecedor', 'Loja', 'NF', 'Pedido', 'Conciliada', 'Dias', 'Conferência', 'Valor'].map((h, i) => <th key={h} style={i === 5 || i === 7 ? thR : UI.th}>{h}</th>)}</tr></thead>
          <tbody>
            {it.length === 0 && <tr><td colSpan={8} style={{ ...UI.td, color: CORES.ok, fontWeight: 600, padding: 16 }}>✅ Nenhuma nota liberada pendente de entrada {soSemConf ? 'sem conferência ' : ''}no período.</td></tr>}
            {it.map((r, i) => <tr key={(r.concil || '') + i}>
              <td style={{ ...UI.td, fontWeight: 600 }}>{r.fornecedor || '—'}</td>
              <td style={UI.td}>{r.loja}</td>
              <td style={UI.td}>{r.nf || '—'}</td>
              <td style={{ ...UI.td, color: CORES.suave }}>{r.pedido ? '#' + r.pedido : '—'}</td>
              <td style={UI.td}>{dBR(r.conciliada)}</td>
              <td style={{ ...tdR, fontWeight: 700, color: r.dias > 7 ? CORES.alerta : CORES.suave }}>{r.dias}</td>
              <td style={UI.td}><span style={{ background: r.conferida ? '#eaf6ef' : '#fdecea', color: r.conferida ? CORES.ok : CORES.alerta, borderRadius: 6, padding: '1px 8px', fontWeight: 700, fontSize: 11 }}>{r.conferida ? 'conferida' : 'sem conferência'}</span></td>
              <td style={{ ...tdR, fontWeight: 700 }}>{brl(r.valor)}</td>
            </tr>)}
          </tbody></table>
      </div>
    </>}
  </>);
}

// ── Aba: Correções de estoque (ajustes de inventário INE/INS) ─────────────────
function Ajustes({ API }) {
  const lojas = useLojas(API);
  const [loja, setLoja] = useState(''); const per = usePeriodo('30');
  const [d, setD] = useState(null); const [carr, setCarr] = useState(false);
  const carregar = useCallback(() => { if (!per.params) return; setCarr(true); API.get('/suporte-loja/ajustes-estoque', { params: { loja, ...per.params } }).then(r => setD(r.data)).catch(() => setD(null)).finally(() => setCarr(false)); }, [API, loja, per.periodo, per.ini, per.fim]); // eslint-disable-line
  useEffect(() => { carregar(); }, [carregar]);
  const it = d?.itens || [];
  return (<>
    <BarraLoja loja={loja} setLoja={setLoja} lojas={lojas} per={per} />
    <div style={{ fontSize: 12, color: CORES.suave, margin: '-4px 2px 10px' }}>Ajustes de <b>inventário</b> feitos no Alpha 7 (entradas e saídas manuais de estoque) — visão de auditoria.</div>
    {carr && !d ? <div style={UI.card}>⏳ Carregando…</div> : !d || d.erro ? <div style={UI.card}>⚠️ {d?.erro || 'Não foi possível carregar.'}</div> : <>
      <KpiGrid>
        <Kpi label="Ajustes no período" valor={num(d.resumo?.total || 0)} />
        <Kpi label="Entradas (+)" valor={num(d.resumo?.entradas || 0)} sub={brl0(d.resumo?.valorEntrada)} cor={CORES.ok} />
        <Kpi label="Saídas (−)" valor={num(d.resumo?.saidas || 0)} sub={brl0(d.resumo?.valorSaida)} cor={CORES.alerta} />
        <Kpi label="Líquido" valor={brl0(d.resumo?.valorLiquido)} cor={(d.resumo?.valorLiquido || 0) < 0 ? CORES.alerta : CORES.ok} />
      </KpiGrid>
      <div style={{ ...UI.card, padding: 0, overflowX: 'auto' }}>
        <table style={UI.tabela}><thead><tr>{['Produto', 'Loja', 'Tipo', 'Qtd', 'Valor', 'Quem', 'Quando'].map((h, i) => <th key={h} style={i >= 3 && i <= 4 ? thR : UI.th}>{h}</th>)}</tr></thead>
          <tbody>
            {it.length === 0 && <tr><td colSpan={7} style={{ ...UI.td, color: CORES.ok, fontWeight: 600, padding: 16 }}>✅ Nenhum ajuste de estoque no período.</td></tr>}
            {it.map((r, i) => <tr key={i}>
              <td style={{ ...UI.td, fontWeight: 600 }}>{r.produto}{r.ean ? <div style={{ fontSize: 10, color: CORES.fraco }}>🔖 {r.ean}</div> : null}</td>
              <td style={UI.td}>{r.loja}</td>
              <td style={UI.td}><span style={{ background: r.entrada ? '#eaf6ef' : '#fdecea', color: r.entrada ? CORES.ok : CORES.alerta, borderRadius: 6, padding: '1px 7px', fontWeight: 700, fontSize: 11 }}>{r.entrada ? 'Entrada' : 'Saída'}</span></td>
              <td style={{ ...tdR, fontWeight: 700, color: r.entrada ? CORES.ok : CORES.alerta }}>{r.qtd > 0 ? '+' : ''}{num(r.qtd)}</td>
              <td style={tdR}>{brl(r.valor)}</td>
              <td style={UI.td}>{r.quem || '—'}</td>
              <td style={{ ...UI.td, whiteSpace: 'nowrap', color: CORES.suave }}>{r.quando ? dBR(r.quando) + ' ' + String(r.quando).slice(11, 16) : '—'}</td>
            </tr>)}
          </tbody></table>
      </div>
    </>}
  </>);
}

// ── Aba: Acuracidade de Estoque (contagem × sistema) ──────────────────────────
function Acuracidade({ API }) {
  const lojas = useLojas(API);
  const [loja, setLoja] = useState(''); const per = usePeriodo('365');
  const [d, setD] = useState(null); const [carr, setCarr] = useState(false);
  const carregar = useCallback(() => { if (!per.params) return; setCarr(true); API.get('/suporte-loja/acuracidade', { params: { loja, ...per.params } }).then(r => setD(r.data)).catch(() => setD(null)).finally(() => setCarr(false)); }, [API, loja, per.periodo, per.ini, per.fim]); // eslint-disable-line
  useEffect(() => { carregar(); }, [carregar]);
  const it = d?.itens || [];
  const mediaFarol = d?.resumo?.acuracidadeMedia == null ? 'sem' : d.resumo.acuracidadeMedia >= 95 ? 'verde' : d.resumo.acuracidadeMedia >= 90 ? 'amarelo' : 'vermelho';
  const mediaFin = d?.resumo?.acuracidadeFinMedia == null ? 'sem' : d.resumo.acuracidadeFinMedia >= 95 ? 'verde' : d.resumo.acuracidadeFinMedia >= 90 ? 'amarelo' : 'vermelho';
  return (<>
    <BarraLoja loja={loja} setLoja={setLoja} lojas={lojas} per={per} diasOpc={[90, 180, 365, 730]} />
    <div style={{ fontSize: 12, color: CORES.suave, margin: '-4px 2px 10px' }}>Acuracidade de Estoque (contagem física × sistema). <b>Benchmark de mercado: ≥95% bom · 90–95% atenção · &lt;90% ruim.</b></div>
    {carr && !d ? <div style={UI.card}>⏳ Carregando…</div> : !d || d.erro ? <div style={UI.card}>⚠️ {d?.erro || 'Não foi possível carregar.'}</div> : <>
      <KpiGrid>
        <Kpi label="Acuracidade (por SKU)" valor={d.resumo?.acuracidadeMedia != null ? d.resumo.acuracidadeMedia + '%' : '—'} cor={corFarol(mediaFarol)} sub="contagem, ponderada" />
        <Kpi label="Acuracidade financeira" valor={d.resumo?.acuracidadeFinMedia != null ? d.resumo.acuracidadeFinMedia + '%' : '—'} cor={corFarol(d.resumo?.acuracidadeFinMedia == null ? 'sem' : d.resumo.acuracidadeFinMedia >= 95 ? 'verde' : d.resumo.acuracidadeFinMedia >= 90 ? 'amarelo' : 'vermelho')} sub="por valor (estoque)" />
        <Kpi label="Valor corrigido" valor={brl0(d.resumo?.valorCorrecao)} cor={CORES.alerta} sub={'de ' + brl0(d.resumo?.valorTeorico) + ' contados'} />
        <Kpi label="Contagens / SKUs" valor={num(d.resumo?.contagens || 0)} sub={num(d.resumo?.skus || 0) + ' SKUs'} />
      </KpiGrid>
      <div style={UI.card}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>📐 O mesmo erro, por 3 formas de dividir <span style={{ fontSize: 11, color: CORES.fraco, fontWeight: 400 }}>— valor corrigido {brl0(d.resumo?.valorCorrecao)}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginTop: 8 }}>
          <div style={{ border: '1px solid ' + CORES.marca, borderRadius: 10, padding: '8px 12px', background: CORES.verdeClaro }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: CORES.marcaEsc }}>Acuracidade (÷ contado) ✓ oficial</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: corFarol(mediaFin) }}>{d.resumo?.acuracidadeFinMedia != null ? d.resumo.acuracidadeFinMedia + '%' : '—'}</div>
            <div style={{ fontSize: 10, color: CORES.fraco }}>a mais rigorosa (padrão IRA)</div>
          </div>
          <div style={{ border: '1px solid ' + CORES.borda, borderRadius: 10, padding: '8px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: CORES.suave }}>Erro ÷ estoque total</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: CORES.texto }}>{d.resumo?.erroVsEstoque != null ? d.resumo.erroVsEstoque + '%' : '—'}</div>
            <div style={{ fontSize: 10, color: CORES.fraco }}>de {brl0(d.resumo?.valorEstoque)} em estoque</div>
          </div>
          <div style={{ border: '1px solid ' + CORES.borda, borderRadius: 10, padding: '8px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: CORES.suave }}>Erro ÷ venda do período</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: CORES.texto }}>{d.resumo?.erroVsVenda != null ? d.resumo.erroVsVenda + '%' : '—'}</div>
            <div style={{ fontSize: 10, color: CORES.fraco }}>de {brl0(d.resumo?.vendaTotal)} vendidos</div>
          </div>
        </div>
      </div>
      {d.porLoja?.length > 0 && <div style={UI.card}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>📊 Acuracidade por loja <span style={{ fontSize: 11, color: CORES.fraco, fontWeight: 400 }}>— meta de mercado ≥95%</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {d.porLoja.map((l, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 150, minWidth: 150, fontSize: 12, fontWeight: 600, textAlign: 'right', color: CORES.suave }}>{l.loja}</div>
            <div style={{ flex: 1, position: 'relative', background: '#f1f5f4', borderRadius: 6, height: 22 }}>
              <div style={{ position: 'absolute', left: '95%', top: -2, bottom: -2, width: 2, background: '#cbd5e1', zIndex: 1 }} title="meta 95%" />
              <div style={{ width: Math.min(100, l.acuracidade || 0) + '%', height: '100%', background: corFarol(l.farol), borderRadius: 6, transition: 'width .3s' }} />
            </div>
            <div style={{ width: 92, minWidth: 92, fontSize: 12.5, fontWeight: 800, color: corFarol(l.farol) }}>{l.acuracidade != null ? l.acuracidade + '%' : '—'} <span style={{ fontSize: 10, color: CORES.fraco, fontWeight: 400 }}>({num(l.skus)})</span></div>
          </div>)}
        </div>
      </div>}
      <div style={{ ...UI.card, padding: 0, overflowX: 'auto' }}>
        <table style={UI.tabela}><thead><tr>{['Contagem', 'Loja', 'Data', 'SKUs', 'OK', 'Diverg.', 'Acur. SKU', 'Correção R$', 'Acur. financ.'].map((h, i) => <th key={h} style={i >= 3 ? thR : UI.th}>{h}</th>)}</tr></thead>
          <tbody>
            {it.length === 0 && <tr><td colSpan={9} style={{ ...UI.td, color: CORES.suave, padding: 16 }}>Nenhuma contagem (inventário) no período.</td></tr>}
            {it.map((r) => { const ffin = r.acuracidadeFin == null ? 'sem' : r.acuracidadeFin >= 95 ? 'verde' : r.acuracidadeFin >= 90 ? 'amarelo' : 'vermelho'; return <tr key={r.id}>
              <td style={{ ...UI.td, fontWeight: 600 }}>{r.titulo} <span style={{ color: CORES.fraco, fontWeight: 400 }}>#{r.codigo}</span></td>
              <td style={UI.td}>{r.loja}</td>
              <td style={UI.td}>{dBR(r.data)}</td>
              <td style={tdR}>{num(r.skus)}</td>
              <td style={{ ...tdR, color: CORES.ok }}>{num(r.ok)}</td>
              <td style={{ ...tdR, color: r.divergentes ? CORES.alerta : CORES.suave }}>{num(r.divergentes)}</td>
              <td style={{ ...tdR, fontWeight: 800, color: corFarol(r.farol) }}>{r.acuracidade != null ? r.acuracidade + '%' : '—'}</td>
              <td style={{ ...tdR, color: r.valorCorrecao ? CORES.alerta : CORES.suave }}>{r.valorCorrecao ? brl0(r.valorCorrecao) : '—'}</td>
              <td style={{ ...tdR, fontWeight: 800, color: corFarol(ffin) }}>{r.acuracidadeFin != null ? r.acuracidadeFin + '%' : '—'}</td>
            </tr>; })}
          </tbody></table>
      </div>
    </>}
  </>);
}

// Ranking clicável reutilizável (pódio + barra). dados=[{nome,qtd,valor}], sel=nome selecionado.
function RankingClicavel({ titulo, dados, sel, onSel }) {
  if (!dados || !dados.length) return null;
  const max = Math.max(1, ...dados.map(d => d.qtd));
  const medalha = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1 + 'º');
  return (
    <div style={UI.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#334' }}>{titulo}</div>
        <div style={{ fontSize: 11, color: CORES.fraco }}>clique para ver as notas</div>
        {sel && <button onClick={() => onSel('')} style={{ marginLeft: 'auto', border: '1px solid ' + CORES.borda, background: '#fff', borderRadius: 7, color: CORES.suave, cursor: 'pointer', fontSize: 11.5, padding: '3px 9px' }}>limpar ✕</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
        {dados.map((p, i) => { const on = sel === p.nome; return (
          <button key={i} onClick={() => onSel(on ? '' : p.nome)} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid ' + (on ? CORES.marca : CORES.borda), background: on ? CORES.verdeClaro : '#fff', borderRadius: 11, padding: '8px 11px', cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ width: 26, textAlign: 'center', fontSize: i < 3 ? 16 : 13, fontWeight: 800, color: CORES.fraco }}>{medalha(i)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</div>
              <div style={{ height: 5, background: '#f1f5f4', borderRadius: 3, marginTop: 4 }}><div style={{ width: Math.max(8, p.qtd / max * 100) + '%', height: '100%', background: CORES.alerta, borderRadius: 3 }} /></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: CORES.alerta, lineHeight: 1 }}>{num(p.qtd)}</div>
              {p.valor != null && <div style={{ fontSize: 10, color: CORES.fraco }}>{brl0(p.valor)}</div>}
            </div>
          </button>); })}
      </div>
    </div>
  );
}

// Seção: Recepção registrada JUNTO com a conferência (processo). gap < limite = não registrou na chegada.
function GapRecepcao({ API, loja, params }) {
  const [d, setD] = useState(null); const [pessoa, setPessoa] = useState('');
  useEffect(() => { if (!params) return; setPessoa(''); API.get('/suporte-loja/recepcao-conferencia', { params: { loja, ...params } }).then(r => setD(r.data)).catch(() => setD(null)); }, [API, loja, JSON.stringify(params)]); // eslint-disable-line
  if (!d || d.erp === false || d.erro) return null;
  const maxL = Math.max(1, ...(d.porLoja || []).map(l => l.pct));
  const corPct = p => p >= 60 ? CORES.alerta : p >= 30 ? '#B45309' : CORES.ok;
  const its = (d.itens || []).filter(i => !pessoa || (i.recebeu || '—') === pessoa);
  return (
    <div style={UI.card}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>⏱️ Recepção registrada junto com a conferência <span style={{ fontSize: 11, color: CORES.fraco, fontWeight: 400 }}>— gap &lt; {d.limiteMin} min = não registrou na chegada (processo errado)</span></div>
      <KpiGrid style={{ marginTop: 10 }}>
        <Kpi label="Feito junto (processo errado)" valor={(d.resumo?.pct ?? 0) + '%'} cor={corPct(d.resumo?.pct || 0)} sub={num(d.resumo?.junto) + ' de ' + num(d.resumo?.total) + ' recebimentos'} />
        <Kpi label="Gap médio recepção→conferência" valor={(d.resumo?.gapMedio ?? 0) + ' min'} />
      </KpiGrid>
      {d.porLoja?.length > 0 && <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: CORES.suave, margin: '2px 0 8px' }}>% feito junto por loja <span style={{ fontWeight: 400, color: CORES.fraco }}>(menor é melhor)</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {d.porLoja.map((l, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 150, minWidth: 150, fontSize: 12, fontWeight: 600, textAlign: 'right', color: CORES.suave }}>{l.loja}</div>
            <div style={{ flex: 1, background: '#f1f5f4', borderRadius: 6, height: 20 }}><div style={{ width: Math.max(3, l.pct / maxL * 100) + '%', height: '100%', background: corPct(l.pct), borderRadius: 6 }} /></div>
            <div style={{ width: 120, minWidth: 120, fontSize: 12.5, fontWeight: 800, color: corPct(l.pct) }}>{l.pct}% <span style={{ fontSize: 10, color: CORES.fraco, fontWeight: 400 }}>({l.junto}/{l.total})</span></div>
          </div>)}
        </div>
      </div>}
      <RankingClicavel titulo="🧑 Quem mais registra junto (recebeu)" sel={pessoa} onSel={setPessoa} dados={(d.porPessoa || []).map(p => ({ nome: p.nome, qtd: p.qtd }))} />
      {pessoa && <div style={{ overflowX: 'auto' }}>
        <div style={{ fontSize: 12, fontWeight: 700, margin: '2px 0 6px' }}>📄 Recebimentos de <span style={{ color: CORES.marca }}>{pessoa}</span> (gap &lt; {d.limiteMin} min)</div>
        <table style={UI.tabela}><thead><tr>{['Loja', 'Recebimento', 'Recepção', 'Conferência', 'Gap (min)'].map((h, i) => <th key={h} style={i >= 4 ? thR : UI.th}>{h}</th>)}</tr></thead>
          <tbody>{its.slice(0, 200).map((r, i) => <tr key={i}>
            <td style={UI.td}>{r.loja}</td><td style={UI.td}>#{r.codigo}</td>
            <td style={UI.td}>{dBR(r.recepcao)} {String(r.recepcao || '').slice(11, 16)}</td>
            <td style={UI.td}>{dBR(r.conferencia)} {String(r.conferencia || '').slice(11, 16)}</td>
            <td style={{ ...tdR, fontWeight: 700, color: CORES.alerta }}>{r.gapMin}</td>
          </tr>)}</tbody></table>
      </div>}
    </div>
  );
}

// ── Aba: Entrada sem recepção (NF entrou mas não teve recebimento físico) ─────
function EntradaSemRecepcao({ API }) {
  const lojas = useLojas(API);
  const [loja, setLoja] = useState(''); const per = usePeriodo('30'); const [conf, setConf] = useState(''); const [faixa, setFaixa] = useState('');
  const [d, setD] = useState(null); const [carr, setCarr] = useState(false);
  const carregar = useCallback(() => { if (!per.params) return; setCarr(true); API.get('/suporte-loja/entrada-sem-recepcao', { params: { loja, ...per.params } }).then(r => setD(r.data)).catch(() => setD(null)).finally(() => setCarr(false)); }, [API, loja, per.periodo, per.ini, per.fim]); // eslint-disable-line
  useEffect(() => { carregar(); }, [carregar]);
  const naFaixa = (dd) => !faixa || (faixa === 'ate6' ? dd <= 6 : faixa === 'd7_14' ? dd >= 7 && dd <= 14 : faixa === 'd15_29' ? dd >= 15 && dd <= 29 : dd >= 30);
  const it = d?.itens || [];
  return (<>
    <BarraLoja loja={loja} setLoja={setLoja} lojas={lojas} per={per} diasOpc={[15, 30, 60, 90]} />
    <div style={{ fontSize: 12, color: CORES.suave, margin: '-4px 2px 10px' }}>Notas que deram <b>entrada no ERP mas NÃO têm recepção de transporte registrada</b> — a mercadoria foi lançada sem passar pela recepção física na loja.</div>
    <GapRecepcao API={API} loja={loja} params={per.params} />
    {carr && !d ? <div style={UI.card}>⏳ Carregando…</div> : !d || d.erro ? <div style={UI.card}>⚠️ {d?.erro || 'Não foi possível carregar.'}</div> : <>
      <KpiGrid>
        <Kpi label="Notas sem recepção" valor={num(d.resumo?.total || 0)} cor={d.resumo?.total ? CORES.alerta : CORES.ok} />
        <Kpi label="Valor sem conferência" valor={brl0(d.resumo?.valorTotal)} cor={CORES.alerta} />
      </KpiGrid>
      {d.resumo?.buckets && <div style={UI.card}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>⏳ Por tempo sem conferência <span style={{ fontSize: 11, color: CORES.fraco, fontWeight: 400 }}>— clique para filtrar</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          {[['ate6', '≤ 6 dias', d.resumo.buckets.ate6, CORES.ok], ['d7_14', '7–14 dias', d.resumo.buckets.d7_14, '#B45309'], ['d15_29', '15–29 dias', d.resumo.buckets.d15_29, '#C0392B'], ['m30', '30+ dias', d.resumo.buckets.m30, '#8a1c12']].map(([key, lbl, b, cor]) => { const on = faixa === key; return (
            <button key={key} onClick={() => setFaixa(on ? '' : key)} style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid ' + (on ? cor : CORES.borda), borderLeft: '4px solid ' + cor, borderRadius: 10, padding: '8px 12px', background: on ? '#fff7f5' : '#fff', boxShadow: on ? '0 0 0 1px ' + cor : 'none' }}>
              <div style={{ fontSize: 11, color: CORES.fraco, fontWeight: 600 }}>{lbl}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: cor }}>{num(b?.qtd || 0)}</div>
              <div style={{ fontSize: 10.5, color: CORES.fraco }}>{brl0(b?.valor)}</div>
            </button>
          ); })}
        </div>
      </div>}
      <RankingClicavel titulo="🧑‍🔧 Quem deu entrada sem recepção (conferente)" sel={conf} onSel={setConf}
        dados={(d.resumo?.porConferente || []).map(c => ({ nome: c.conferente, qtd: c.qtd, valor: c.valor }))} />
      <div style={{ ...UI.card, padding: 0, overflowX: 'auto' }}>
        {conf && <div style={{ padding: '10px 10px 0', fontSize: 12, fontWeight: 700 }}>📄 Notas de <span style={{ color: CORES.marca }}>{conf}</span></div>}
        <table style={UI.tabela}><thead><tr>{['Fornecedor', 'Conferente', 'Loja', 'NF', 'Entrada', 'Dias', 'Valor'].map((h, i) => <th key={h} style={i >= 5 ? thR : UI.th}>{h}</th>)}</tr></thead>
          <tbody>
            {it.length === 0 && <tr><td colSpan={7} style={{ ...UI.td, color: CORES.ok, fontWeight: 600, padding: 16 }}>✅ Toda entrada teve recepção no período.</td></tr>}
            {it.filter(r => (!conf || (r.conferente || '—') === conf) && naFaixa(r.dias)).map((r, i) => <tr key={i}>
              <td style={{ ...UI.td, fontWeight: 600 }}>{r.fornecedor || '—'}</td>
              <td style={UI.td}>{r.conferente || '—'}</td>
              <td style={UI.td}>{r.loja}</td>
              <td style={UI.td}>{r.numero || '—'}</td>
              <td style={UI.td}>{dBR(r.entrada)}</td>
              <td style={{ ...tdR, fontWeight: 700, color: r.dias > 7 ? CORES.alerta : CORES.suave }}>{r.dias}</td>
              <td style={{ ...tdR, fontWeight: 700 }}>{brl(r.valor)}</td>
            </tr>)}
          </tbody></table>
      </div>
    </>}
  </>);
}

// ── Aba: Tempo de entrada (lead-time emissão→entrada) por loja + gráfico de todas ─────
const compAtual = () => new Date().toISOString().slice(0, 7);
function TempoEntrada({ API }) {
  const [comp, setComp] = useState(compAtual());
  const [d, setD] = useState(null); const [carr, setCarr] = useState(false);
  const carregar = useCallback(() => { setCarr(true); API.get('/contabilidade/espiao/lead-estoque', { params: { competencia: comp } }).then(r => setD(r.data)).catch(() => setD(null)).finally(() => setCarr(false)); }, [API, comp]);
  useEffect(() => { carregar(); }, [carregar]);
  const lojas = (d?.lojas || []).filter(l => l.n > 0).slice().sort((a, b) => a.media - b.media);
  const maxMedia = Math.max(1, ...lojas.map(l => l.media));
  const farol = m => m < 3 ? 'verde' : m < 7 ? 'amarelo' : 'vermelho';
  const geralMedia = lojas.length ? Math.round(lojas.reduce((a, l) => a + l.media * l.n, 0) / lojas.reduce((a, l) => a + l.n, 0) * 10) / 10 : null;
  return (<>
    <FiltroBar>
      <label style={UI.fld}>Competência<input type="month" value={comp} onChange={e => setComp(e.target.value)} style={UI.inp} /></label>
      <button onClick={carregar} style={{ ...UI.btn, cursor: 'pointer' }}>🔄 Atualizar</button>
    </FiltroBar>
    <div style={{ fontSize: 12, color: CORES.suave, margin: '-4px 2px 10px' }}>Tempo de entrada = dias entre a <b>emissão da NF</b> e a <b>entrada no ERP</b> (menor é melhor). Mede a agilidade do recebimento por loja.</div>
    {carr && !d ? <div style={UI.card}>⏳ Carregando…</div> : !d || d.erro ? <div style={UI.card}>⚠️ {d?.erro || 'Não foi possível carregar.'}</div> : <>
      <KpiGrid>
        <Kpi label="Tempo médio (rede)" valor={geralMedia != null ? geralMedia + ' dias' : '—'} cor={geralMedia == null ? CORES.fraco : corFarol(farol(geralMedia))} />
        <Kpi label="Notas no mês" valor={num(lojas.reduce((a, l) => a + l.n, 0))} />
        <Kpi label="Lojas" valor={num(lojas.length)} />
      </KpiGrid>
      {lojas.length > 0 && <div style={UI.card}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>📊 Tempo médio de entrada por loja <span style={{ fontSize: 11, color: CORES.fraco, fontWeight: 400 }}>— menor é melhor</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {lojas.map((l, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 150, minWidth: 150, fontSize: 12, fontWeight: 600, textAlign: 'right', color: CORES.suave }}>{l.loja}</div>
            <div style={{ flex: 1, background: '#f1f5f4', borderRadius: 6, height: 22 }}>
              <div style={{ width: Math.max(3, l.media / maxMedia * 100) + '%', height: '100%', background: corFarol(farol(l.media)), borderRadius: 6 }} />
            </div>
            <div style={{ width: 110, minWidth: 110, fontSize: 12.5, fontWeight: 800, color: corFarol(farol(l.media)) }}>{l.media} dias <span style={{ fontSize: 10, color: CORES.fraco, fontWeight: 400 }}>({num(l.n)})</span></div>
          </div>)}
        </div>
      </div>}
      <div style={{ ...UI.card, padding: 0, overflowX: 'auto' }}>
        <table style={UI.tabela}><thead><tr>{['Loja', 'Notas', 'Média', 'Mediana', '≤1d', '1–3d', '3–7d', '7–15d', '+15d', 'Pior'].map((h, i) => <th key={h} style={i ? thR : UI.th}>{h}</th>)}</tr></thead>
          <tbody>
            {lojas.length === 0 && <tr><td colSpan={10} style={{ ...UI.td, color: CORES.suave, padding: 16 }}>Sem notas de entrada no mês.</td></tr>}
            {lojas.map((l, i) => <tr key={i}>
              <td style={{ ...UI.td, fontWeight: 600 }}>{l.loja}</td>
              <td style={tdR}>{num(l.n)}</td>
              <td style={{ ...tdR, fontWeight: 800, color: corFarol(farol(l.media)) }}>{l.media}</td>
              <td style={tdR}>{l.mediana}</td>
              <td style={{ ...tdR, color: CORES.ok }}>{num(l.buckets.ate1)}</td>
              <td style={tdR}>{num(l.buckets.d13)}</td>
              <td style={tdR}>{num(l.buckets.d37)}</td>
              <td style={{ ...tdR, color: '#B45309' }}>{num(l.buckets.d715)}</td>
              <td style={{ ...tdR, color: CORES.alerta }}>{num(l.buckets.m15)}</td>
              <td style={{ ...tdR, color: CORES.alerta }}>{l.pior}d</td>
            </tr>)}
          </tbody></table>
      </div>
    </>}
  </>);
}

// ── Aba: Erros de entrada (qtd do XML × qtd bipada pelo conferente) ───────────
function ErrosEntrada({ API }) {
  const lojas = useLojas(API);
  const [loja, setLoja] = useState(''); const per = usePeriodo('30'); const [conf, setConf] = useState('');
  const [d, setD] = useState(null); const [carr, setCarr] = useState(false);
  const carregar = useCallback(() => { if (!per.params) return; setCarr(true); setConf(''); API.get('/suporte-loja/erros-entrada', { params: { loja, ...per.params } }).then(r => setD(r.data)).catch(() => setD(null)).finally(() => setCarr(false)); }, [API, loja, per.periodo, per.ini, per.fim]); // eslint-disable-line
  useEffect(() => { carregar(); }, [carregar]);
  const it = (d?.itens || []).filter(r => !conf || (r.conferente || '—') === conf);
  return (<>
    <BarraLoja loja={loja} setLoja={setLoja} lojas={lojas} per={per} diasOpc={[15, 30, 60, 90]} />
    <div style={{ fontSize: 12, color: CORES.suave, margin: '-4px 2px 10px' }}>Itens em que a <b>quantidade bipada pelo conferente ≠ a quantidade do XML/NF</b> do fornecedor — divergência de entrada.</div>
    {carr && !d ? <div style={UI.card}>⏳ Carregando…</div> : !d || d.erro ? <div style={UI.card}>⚠️ {d?.erro || 'Não foi possível carregar.'}</div> : <>
      <KpiGrid>
        <Kpi label="Itens com erro" valor={num(d.resumo?.itens || 0)} cor={d.resumo?.itens ? CORES.alerta : CORES.ok} />
        <Kpi label="NFs com erro" valor={num(d.resumo?.nfs || 0)} />
      </KpiGrid>
      <RankingClicavel titulo="🧑‍🔧 Erros por conferente" sel={conf} onSel={setConf} dados={(d.porConferente || []).map(c => ({ nome: c.nome, qtd: c.qtd }))} />
      <div style={{ ...UI.card, padding: 0, overflowX: 'auto' }}>
        {conf && <div style={{ padding: '10px 10px 0', fontSize: 12, fontWeight: 700 }}>📄 Erros de <span style={{ color: CORES.marca }}>{conf}</span></div>}
        <table style={UI.tabela}><thead><tr>{['Produto', 'Conferente', 'Loja', 'NF', 'Entrada', 'Qtd XML', 'Qtd bipada', 'Diferença'].map((h, i) => <th key={h} style={i >= 5 ? thR : UI.th}>{h}</th>)}</tr></thead>
          <tbody>
            {it.length === 0 && <tr><td colSpan={8} style={{ ...UI.td, color: CORES.ok, fontWeight: 600, padding: 16 }}>✅ Nenhum erro de quantidade no período.</td></tr>}
            {it.map((r, i) => <tr key={i}>
              <td style={{ ...UI.td, fontWeight: 600 }}>{r.produto}{r.ean ? <div style={{ fontSize: 10, color: CORES.fraco }}>🔖 {r.ean}</div> : null}</td>
              <td style={UI.td}>{r.conferente || '—'}</td>
              <td style={UI.td}>{r.loja}</td>
              <td style={UI.td}>{r.numero || '—'}</td>
              <td style={UI.td}>{dBR(r.entrada)}</td>
              <td style={tdR}>{num(r.qtdXml)}</td>
              <td style={{ ...tdR, fontWeight: 700 }}>{num(r.qtdConf)}</td>
              <td style={{ ...tdR, fontWeight: 800, color: CORES.alerta }}>{r.diferenca > 0 ? '+' : ''}{num(r.diferenca)}</td>
            </tr>)}
          </tbody></table>
      </div>
    </>}
  </>);
}

// Conecta no dispositivo pelo HopToDesk (tenta o protocolo do app instalado) + abre o painel como alternativa.
function conectarHopToDesk(deviceId) {
  const idDigits = String(deviceId || '').replace(/\D/g, '');
  if (!idDigits) { window.open('https://dashboard.hoptodesk.com', '_blank'); return; }
  try { window.location.href = 'hoptodesk://' + idDigits; } catch (e) {}
  // fallback: o painel (onde o botão Conectar funciona na web) — abre em nova aba após um instante.
  setTimeout(() => window.open('https://dashboard.hoptodesk.com', '_blank'), 400);
}

// Aba: Chamados do HopToDesk (acompanhamento + conectar).
function Chamados({ API }) {
  const [r, setR] = useState(null); const [tickets, setTickets] = useState([]);
  const [status, setStatus] = useState('aberto'); const [prio, setPrio] = useState(''); const [busca, setBusca] = useState('');
  const carregar = useCallback(() => {
    API.get('/hoptodesk/resumo', { params: { dias: 30 } }).then(res => setR(res.data)).catch(() => setR(null));
    API.get('/hoptodesk/tickets', { params: { status, prioridade: prio, busca } }).then(res => setTickets(res.data.tickets || [])).catch(() => setTickets([]));
  }, [API, status, prio, busca]);
  useEffect(() => { carregar(); }, [carregar]);
  const prioCor = p => p === 'urgent' ? CORES.alerta : p === 'high' ? '#B45309' : p === 'medium' ? '#2563eb' : CORES.fraco;
  const stCor = t => t.concluido ? CORES.ok : t.status === 'waiting' ? '#B45309' : CORES.alerta;
  const dBRdt = s => { try { return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); } catch (e) { return '—'; } };
  return (<>
    {r && !r.configurado && <div style={{ ...UI.card, background: '#fff7ed', border: '1px solid #fed7aa' }}>
      <b>🎧 Chamados do HopToDesk</b> — ainda sem dados. Em produção os chamados chegam pelo <b>webhook</b> (já configurado); e se você colocar a <b>API key</b> no .env eu puxo o histórico. <i>No preview, use "Semear exemplo" abaixo pra ver a tela.</i>
    </div>}
    <KpiGrid>
      <Kpi label="Em aberto (fila)" valor={num(r?.abertosAgora || 0)} cor={(r?.abertosAgora || 0) ? CORES.alerta : CORES.ok} sub="status aberto/andamento/aguardando" />
      <Kpi label="Concluídos (30d)" valor={num(r?.concluidos || 0)} cor={CORES.ok} />
      <Kpi label="Conclusão (30d)" valor={r?.pctConclusao != null ? r.pctConclusao + '%' : '—'} cor={r?.pctConclusao >= 90 ? CORES.ok : r?.pctConclusao >= 70 ? '#B45309' : CORES.alerta} sub="resolvidos ÷ total" />
      <Kpi label="Tempo médio" valor={r?.tempoMedioH != null ? r.tempoMedioH + ' h' : '—'} cor={CORES.suave} sub="abertura → resolução" />
    </KpiGrid>
    <FiltroBar>
      <label style={UI.fld}>Status<select value={status} onChange={e => setStatus(e.target.value)} style={UI.inp}><option value="aberto">Em aberto</option><option value="concluido">Concluídos</option><option value="">Todos</option></select></label>
      <label style={UI.fld}>Prioridade<select value={prio} onChange={e => setPrio(e.target.value)} style={UI.inp}><option value="">Todas</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></label>
      <label style={UI.fld}>Busca<input value={busca} onChange={e => setBusca(e.target.value)} placeholder="assunto/cliente/nº" style={UI.inp} /></label>
      <button onClick={carregar} style={{ ...UI.btn, cursor: 'pointer' }}>🔄 Atualizar</button>
    </FiltroBar>
    <div style={{ ...UI.card, padding: 0, overflowX: 'auto' }}>
      <table style={UI.tabela}><thead><tr>{['#', 'Assunto', 'Cliente', 'Dispositivo', 'Prioridade', 'Status', 'Criado', ''].map(h => <th key={h} style={UI.th}>{h}</th>)}</tr></thead>
        <tbody>
          {tickets.length === 0 && <tr><td colSpan={8} style={{ ...UI.td, padding: 16, color: CORES.fraco }}>Nenhum chamado {status === 'aberto' ? 'em aberto' : status === 'concluido' ? 'concluído' : ''} no filtro.</td></tr>}
          {tickets.map(t => <tr key={t.id}>
            <td style={{ ...UI.td, fontWeight: 700 }}>{t.numero || '—'}</td>
            <td style={{ ...UI.td, fontWeight: 600 }}>{t.titulo || '—'}</td>
            <td style={UI.td}>{t.cliente || '—'}</td>
            <td style={UI.td}>{t.device_nome || '—'}{t.device_id && <div style={{ fontSize: 10.5, color: CORES.fraco }}>{t.device_id}</div>}</td>
            <td style={UI.td}><span style={{ fontWeight: 700, color: prioCor(t.prioridade) }}>{t.prioridadeLabel || '—'}</span></td>
            <td style={UI.td}><span style={{ background: t.concluido ? '#ecfdf5' : '#fef2f2', color: stCor(t), borderRadius: 999, padding: '2px 9px', fontSize: 11.5, fontWeight: 700 }}>{t.statusLabel}</span></td>
            <td style={UI.td}>{dBRdt(t.criado_em)}</td>
            <td style={UI.td}>{t.device_id && <button onClick={() => conectarHopToDesk(t.device_id)} style={{ ...UI.btn, background: CORES.marca, color: '#fff', borderColor: 'transparent', padding: '4px 10px', fontSize: 11.5 }}>🖥 Conectar</button>}</td>
          </tr>)}
        </tbody></table>
    </div>
    <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
      <button onClick={() => API.post('/hoptodesk/sincronizar').then(carregar).catch(() => {})} style={{ ...UI.btn, cursor: 'pointer' }}>⬇️ Puxar da API (se chave configurada)</button>
      <button onClick={() => API.post('/hoptodesk/semear').then(carregar).catch(() => {})} style={{ ...UI.btn, cursor: 'pointer', color: CORES.suave }}>🌱 Semear exemplo (preview)</button>
    </div>
  </>);
}

// ── Transferências (EXECUÇÃO) — a finalização das transferências, cobrada pelo Suporte ──
// Vem da tabela `transferencia` do ERP (status A/S/E). O PEDIDO fica em Compras; aqui é a execução.
function TransferenciasExec({ API }) {
  const lojas = useLojas(API);
  const [loja, setLoja] = useState('');
  const [status, setStatus] = useState('');
  const [dados, setDados] = useState(null);
  const [sel, setSel] = useState(null);           // transferência aberta no modal
  const [itens, setItens] = useState(null);
  const carregar = useCallback(() => {
    API.get('/compras/transferencias-pendentes', { params: { loja } })
      .then(r => setDados(r.data)).catch(() => setDados({ erro: true }));
  }, [API, loja]);
  useEffect(() => { carregar(); }, [carregar]);
  const abrir = (t) => {
    setSel(t); setItens(null);
    API.get(`/compras/transferencias/${t.id}/itens`).then(r => setItens(r.data.itens || [])).catch(() => setItens([]));
  };
  const r = dados?.resumo || {};
  const statusOpc = dados?.statusOpcoes || [['', 'Todas'], ['A', 'Aberta'], ['S', 'Em separação'], ['E', 'Em trânsito']];
  const lista = (dados?.transferencias || []).filter(t => !status || t.status === status);
  return (<>
    <div style={{ ...UI.card, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
      <b>🔄 Transferências — execução</b> — aqui o Suporte cobra a <b>finalização</b> das transferências já em andamento (o pedido do comprador fica em <b>Compras ▸ Pedidos de Transferência</b>). Status vêm do Alpha 7; canceladas não entram.
    </div>
    <KpiGrid>
      <Kpi label="Pendentes" valor={num(r.pendentes || 0)} cor={(r.pendentes || 0) ? CORES.alerta : CORES.ok} sub="A finalizar (A/S/E)" />
      <Kpi label="Atrasadas" valor={num(r.atrasadas || 0)} cor={(r.atrasadas || 0) ? CORES.alerta : CORES.ok} sub={`> ${dados?.diasAceitavel || 7} dias`} />
      <Kpi label="Valor parado" valor={brl0(r.valorParado || 0)} cor={CORES.suave} />
      <Kpi label="Mais antiga" valor={(r.maisAntigaDias || 0) + ' dias'} cor={(r.maisAntigaDias || 0) > (dados?.diasAceitavel || 7) ? CORES.alerta : CORES.suave} />
    </KpiGrid>
    <BarraLoja loja={loja} setLoja={setLoja} lojas={lojas}>
      <label style={UI.fld}>Status<select value={status} onChange={e => setStatus(e.target.value)} style={UI.inp}>{statusOpc.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <button onClick={carregar} style={{ ...UI.btn, cursor: 'pointer' }}>🔄 Atualizar</button>
    </BarraLoja>
    <div style={{ ...UI.card, padding: 0, overflowX: 'auto' }}>
      <table style={UI.tabela}><thead><tr>{['Código', 'Origem', 'Destino', 'Dias', 'Itens', 'Valor', 'Status', ''].map(h => <th key={h} style={UI.th}>{h}</th>)}</tr></thead>
        <tbody>
          {lista.length === 0 && <tr><td colSpan={8} style={{ ...UI.td, padding: 16, color: CORES.fraco }}>Nenhuma transferência pendente no filtro.</td></tr>}
          {lista.map(t => <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => abrir(t)}>
            <td style={{ ...UI.td, fontWeight: 700 }}>{t.codigo || t.id}</td>
            <td style={UI.td}>{t.origem || '—'}</td>
            <td style={UI.td}>{t.destino || '—'}</td>
            <td style={{ ...UI.td, color: t.atrasada ? CORES.alerta : CORES.corpo, fontWeight: t.atrasada ? 700 : 400 }}>{t.dias}</td>
            <td style={UI.td}>{num(t.itens)}</td>
            <td style={UI.td}>{brl(t.valor)}</td>
            <td style={UI.td}><span style={{ background: '#ecfdf5', color: CORES.ok, borderRadius: 999, padding: '2px 9px', fontSize: 11.5, fontWeight: 700 }}>{t.statusLabel}</span></td>
            <td style={{ ...UI.td, color: CORES.marca, fontWeight: 600 }}>ver itens ›</td>
          </tr>)}
        </tbody></table>
    </div>
    {sel && <div onClick={() => setSel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...UI.card, maxWidth: 680, width: '92%', maxHeight: '82vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <b>Transferência #{sel.codigo || sel.id} — {sel.origem} → {sel.destino}</b>
          <button onClick={() => setSel(null)} style={{ ...UI.btn, cursor: 'pointer' }}>Fechar</button>
        </div>
        {itens === null && <div style={{ color: CORES.fraco }}>Carregando itens…</div>}
        {itens && itens.length === 0 && <div style={{ color: CORES.fraco }}>Sem itens nesta transferência.</div>}
        {itens && itens.length > 0 && <table style={UI.tabela}><thead><tr>{['Produto', 'EAN', 'Qtd', 'Valor'].map(h => <th key={h} style={UI.th}>{h}</th>)}</tr></thead>
          <tbody>{itens.map(i => <tr key={i.id}>
            <td style={UI.td}>{i.descricao}</td><td style={UI.td}>{i.ean || '—'}</td>
            <td style={UI.td}>{num(i.qtd)}</td><td style={UI.td}>{brl(i.valor)}</td>
          </tr>)}</tbody></table>}
      </div>
    </div>}
  </>);
}

const ABAS = [
  ['recebido', '🚚 Recepção sem entrada'],           // recepção de transporte registrada, não deu entrada (conferência)
  ['entrada-sem-recepcao', '⚠️ Sem recepção de transporte'], // deu entrada sem a recepção de transporte registrada
  ['notas-pendentes', '📥 Notas pendentes de entrada'],      // conciliadas (liberadas) sem recepção física
  ['erros-entrada', '🔢 Erros de entrada'],          // qtd XML × qtd bipada
  ['tempo-entrada', '⏱️ Tempo de entrada'],
  ['nfxml', '🧾 XMLs não lançados'],                 // XML (NFe) da SEFAZ não lançado no ERP
  ['ajustes', '📦 Ajustes de estoque'],
  ['acuracidade', '🎯 Acuracidade'],
  ['chamados', '🎧 Chamados'],
  ['transferencias', '🔄 Transferências'],
  ['meu-setor', '🎯 Meu Setor'],
  ['metas', '⚙️ Metas & Premiações'],
];

export default function SuporteLoja() {
  const { API } = useAuth();
  const [aba, setAba] = useState('recebido');
  return (
    <div style={UI.page}>
      <Banner emoji="🛟" titulo="Suporte Loja" cor="verde" sub="Acompanhamento fiscal e de estoque das lojas — recebimento, notas sem entrada, ajustes de inventário e acuracidade da contagem." />
      <Tabs itens={ABAS} ativa={aba} onChange={setAba} />
      {aba === 'recebido' && <RecebimentoAberto API={API} />}
      {aba === 'entrada-sem-recepcao' && <EntradaSemRecepcao API={API} />}
      {aba === 'notas-pendentes' && <NotasPendentesEntrada API={API} />}
      {aba === 'erros-entrada' && <ErrosEntrada API={API} />}
      {aba === 'tempo-entrada' && <TempoEntrada API={API} />}
      {aba === 'nfxml' && <NfXml API={API} />}
      {aba === 'ajustes' && <Ajustes API={API} />}
      {aba === 'acuracidade' && <Acuracidade API={API} />}
      {aba === 'chamados' && <Chamados API={API} />}
      {aba === 'transferencias' && <TransferenciasExec API={API} />}
      {aba === 'meu-setor' && <MeuSetorArea area="suporte" embutido abaFixa="setor" />}
      {aba === 'metas' && <MeuSetorArea area="suporte" embutido abaFixa="metas" />}
      <MinhaAreaLateral area="suporte" titulo="Minha área" extras={<PendenciasSuporte API={API} irPara={setAba} />} />
    </div>
  );
}
