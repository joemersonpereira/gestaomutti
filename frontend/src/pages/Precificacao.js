import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { UI, Kpi, KpiGrid, Tabs, FiltroBar, thR, tdR, CORES } from '../components/ui';
import MeuSetorArea, { fontePrecificacao } from './MeuSetorArea';
import { usePeriodo, CampoPeriodo } from '../components/Periodo';

const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const num = v => (Number(v) || 0).toLocaleString('pt-BR');
const GESTAO = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Comprador Beleza', 'Comprador Bem-estar'];
// aba → { label, endpoint, tipo (p/ marcar corrigido) }
const ABAS = {
  abaixo_custo: { label: '🔴 Vendido abaixo do custo', ep: 'abaixo-custo', tipo: 'abaixo_custo' },
  abaixo_margem: { label: '🟠 Vendido abaixo da margem', ep: 'abaixo-margem', tipo: 'abaixo_margem' },
  comprado: { label: '📈 Comprado mais caro', ep: 'comprado', tipo: 'comprado_caro' },
  pesquisa: { label: '📋 Pesquisa de Preço' },
  cadernos: { label: '📒 Cadernos de Oferta' },
  cruzamento: { label: '🔀 Cruzamento' },
  meu_setor: { label: '🎯 Meu Setor' },
  metas: { label: '⚙️ Metas & Premiações' },
};

export default function Precificacao() {
  const { API, usuario } = useAuth();
  const gestao = GESTAO.includes(usuario?.funcao);
  const [lojas, setLojas] = useState([]); const [comps, setComps] = useState([]); const [classifs, setClassifs] = useState([]);
  const [loja, setLoja] = useState(''); const [comp, setComp] = useState(''); const [classif, setClassif] = useState('');
  const per = usePeriodo('30'); const [margem, setMargem] = useState(20); const [dir, setDir] = useState('caro');
  const [aba, setAba] = useState('abaixo_custo');
  const [d, setD] = useState(null); const [carreg, setCarreg] = useState(false);
  useEffect(() => {
    API.get('/precificacao/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {});
    API.get('/compras/compradores').then(r => setComps(r.data.compradores || [])).catch(() => {});
    API.get('/compras/classificacoes-erp').then(r => setClassifs(r.data.classificacoes || [])).catch(() => {});
  }, [API]);
  const cfg = ABAS[aba];
  const ehMS = aba === 'meu_setor' || aba === 'metas';
  const ehPesquisa = aba === 'pesquisa'; const ehCadernos = aba === 'cadernos'; const ehCruz = aba === 'cruzamento';
  const carregar = useCallback(() => {
    if (!ABAS[aba].ep) return; // abas Meu Setor / Metas têm render próprio
    setCarreg(true);
    const params = { loja, comprador: comp || undefined, classificacao: classif || undefined, ...(per.params || {}) };
    if (aba === 'abaixo_margem') params.margem = margem;
    if (aba === 'comprado') params.dir = dir;
    API.get('/precificacao/' + ABAS[aba].ep, { params }).then(r => setD(r.data)).catch(() => setD(null)).finally(() => setCarreg(false));
  }, [API, loja, comp, classif, per.periodo, per.ini, per.fim, aba, margem, dir]); // eslint-disable-line
  useEffect(() => { carregar(); }, [carregar]);
  const corrigidos = d?.corrigidos || {};
  const itens = d?.itens || [];
  // Correção é por PRODUTO + LOJA (uni). uni=0 = "todas as lojas" (legado). Casa a linha pela sua loja,
  // caindo pro 0 se houver uma correção geral. "corrigido" só vale se feito DEPOIS da última ocorrência.
  const corrOf = (it) => corrigidos[it.produtoId + ':' + (it.uni || 0)] || corrigidos[it.produtoId + ':0'];
  const efetivo = (it) => { const c = corrOf(it); return !!c && (!it.dataISO || String(c.corrigido_em || '').slice(0, 10) >= it.dataISO); };
  const voltou = (it) => !!corrOf(it) && !efetivo(it);
  const pendentes = itens.filter(i => !efetivo(i));
  const marcar = (it) => API.put('/precificacao/corrigir', { tipo: cfg.tipo, produto_id: it.produtoId, uni: it.uni || 0 }).then(carregar).catch(() => {});
  const desmarcar = (it) => { const c = corrOf(it); API.delete('/precificacao/corrigir', { params: { tipo: cfg.tipo, produto_id: it.produtoId, uni: (c && c.uni) || 0 } }).then(carregar).catch(() => {}); };

  return (
    <div style={UI.page}>
      <Banner emoji="🏷️" titulo="Precificação" cor="verde" sub="Produtos vendendo abaixo do custo ou da margem e comprados mais caro que a última entrada — do espelho do ERP. Marque como corrigido conforme ajusta; a meta é zerar os pendentes." />

      {!ehMS && !ehPesquisa && !ehCadernos && !ehCruz && <FiltroBar>
        <label style={UI.fld}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={{ ...UI.inp, minWidth: 170 }}><option value="">Rede (todas)</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        <label style={UI.fld}>Comprador<select value={comp} onChange={e => setComp(e.target.value)} style={UI.inp}><option value="">Todos</option>{comps.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
        <label style={UI.fld}>Classificação<select value={classif} onChange={e => setClassif(e.target.value)} style={{ ...UI.inp, minWidth: 180 }}><option value="">Todas</option>{classifs.map(x => <option key={x.id} value={x.id}>{x.principal ? x.nome : '— ' + x.nome}</option>)}</select></label>
        <CampoPeriodo {...per} diasOpc={[7, 15, 30, 60, 90, 120]} />
        {aba === 'abaixo_margem' && <label style={UI.fld}>Margem mín. %<input type="number" value={margem} onChange={e => setMargem(e.target.value)} style={{ ...UI.inp, width: 80 }} /></label>}
        {aba === 'comprado' && <label style={UI.fld}>Variação<select value={dir} onChange={e => setDir(e.target.value)} style={UI.inp}><option value="caro">mais caro</option><option value="barato">mais barato</option></select></label>}
        <button onClick={carregar} style={{ ...UI.btn, cursor: 'pointer' }}>🔄 Atualizar</button>
      </FiltroBar>}

      <Tabs itens={Object.entries(ABAS).map(([k, v]) => [k, v.label])} ativa={aba} onChange={setAba} />

      {ehMS ? <MeuSetorArea fonte={fontePrecificacao()} embutido abaFixa={aba === 'metas' ? 'metas' : 'setor'} /> :
      ehPesquisa ? <PesquisaPreco API={API} comps={comps} classifs={classifs} gestao={gestao} /> :
      ehCadernos ? <Cadernos API={API} gestao={gestao} comps={comps} /> :
      ehCruz ? <Cruzamento API={API} /> :
      carreg && !d ? <div style={UI.card}>⏳ Carregando…</div> : !d ? <div style={UI.card}>⚠️ Não foi possível carregar (ERP indisponível ou erro). Tente Atualizar.</div> : d.erro ? <div style={UI.card}>⚠️ {d.erro}</div> : d.semComprador ? <div style={UI.card}>O comprador selecionado não tem grupos/classificações vinculados.</div> : <>
        <KpiGrid>
          <Kpi label="Pendentes (meta: zerar)" valor={pendentes.length} cor={pendentes.length ? CORES.alerta : CORES.ok} />
          <Kpi label="Corrigidos" valor={itens.length - pendentes.length} cor={CORES.ok} />
          {aba === 'abaixo_custo' && <Kpi label="Perda total (abaixo do custo)" valor={brl0(d.perdaTotal)} cor={CORES.alerta} />}
          {aba === 'abaixo_custo' && d.perdaErro != null && <Kpi label="⚠️ Perda por ERRO de preço" valor={brl0(d.perdaErro)} cor={CORES.alerta} sub="fora PBM/caderno" />}
          <Kpi label="Itens no período" valor={num(itens.length)} sub={d.margemMin != null ? `margem < ${d.margemMin}%` : (cfg.label)} />
        </KpiGrid>

        <div style={{ ...UI.card, padding: 0, overflowX: 'auto' }}>
          <table style={UI.tabela}>
            <thead><tr>
              {(aba === 'comprado'
                ? ['Produto', 'Entrada anterior', 'Entrada atual', 'Variação', '']
                : ['Produto', 'Venda un.', 'Custo un.', aba === 'abaixo_custo' ? 'Perda (total)' : 'Margem', 'Origem (PBM/caderno)', '']).map((h, i) => <th key={h + i} style={i && i < 4 ? thR : UI.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {itens.length === 0 && <tr><td colSpan={aba === 'comprado' ? 5 : 6} style={{ ...UI.td, padding: 16, color: CORES.ok, fontWeight: 600 }}>✅ Nenhum produto {aba === 'comprado' ? (dir === 'caro' ? 'comprado mais caro' : 'comprado mais barato') : aba === 'abaixo_custo' ? 'abaixo do custo' : 'abaixo da margem'} no período.</td></tr>}
              {itens.map(it => { const cor = corrOf(it); const ok = efetivo(it); const volt = voltou(it); return (
                <tr key={it.produtoId + ':' + (it.uni || 0)} style={{ background: ok ? '#f0fdf4' : volt ? '#fff7ed' : '#fff', opacity: ok ? .75 : 1 }}>
                  <td style={{ ...UI.td, fontWeight: 600 }}>{ok && '✓ '}{it.produto}
                    {(it.ean || it.loja || it.ultima || it.fornecedor) && <div style={{ fontSize: 10, color: CORES.fraco, fontWeight: 400 }}>{it.ean ? '🔖 ' + it.ean : ''}{it.loja ? ' · ' + it.loja : ''}{it.fornecedor ? ' · 🏭 ' + it.fornecedor : ''}{it.ultima ? ' · últ. ' + it.ultima : ''}</div>}
                    {ok && <div style={{ fontSize: 10.5, color: CORES.ok }}>corrigido por {cor.corrigido_por || '—'}</div>}
                    {volt && <div style={{ fontSize: 10.5, color: '#b45309', fontWeight: 700 }}>⚠️ voltou a ocorrer após a correção ({cor.corrigido_em ? String(cor.corrigido_em).slice(0, 10).split('-').reverse().join('/') : ''})</div>}</td>
                  {aba === 'comprado' ? <>
                    <td style={{ ...tdR, color: CORES.suave }}>{brl(it.anterior)}</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{brl(it.atual)} <span style={{ fontSize: 10, color: '#cbd5e1' }}>{it.emDia}</span></td>
                    <td style={{ ...tdR, fontWeight: 800, color: it.variacao >= 0 ? CORES.alerta : CORES.ok }}>{it.variacao > 0 ? '+' : ''}{it.variacao}%</td>
                  </> : <>
                    <td style={tdR}>{brl(it.vendaUnit != null ? it.vendaUnit : it.venda)}
                      <div style={{ fontSize: 10, color: CORES.fraco, fontWeight: 400 }}>tot. {brl0(it.venda)} · {num(it.qtd)} un</div></td>
                    <td style={tdR}>{brl(it.custoUnit != null ? it.custoUnit : it.custo)}
                      <div style={{ fontSize: 10, color: CORES.fraco, fontWeight: 400 }}>tot. {brl0(it.custo)}</div></td>
                    <td style={{ ...tdR, fontWeight: 800, color: CORES.alerta }}>{aba === 'abaixo_custo' ? brl(it.perda) : (it.margem != null ? it.margem + '%' : '—')}</td>
                    <td style={{ ...UI.td, fontSize: 11.5 }}>{it.pbm && <span style={{ background: '#eef2fb', color: '#2c5577', borderRadius: 6, padding: '1px 6px', marginRight: 4 }}>💊 {it.pbm}{it.pbmPct ? ' ' + it.pbmPct + '%' : ''}</span>}{it.caderno && <span style={{ background: '#fef7e8', color: '#8a5a00', borderRadius: 6, padding: '1px 6px' }}>📒 {it.caderno}</span>}{!it.pbm && !it.caderno && <span style={{ color: CORES.alerta, fontWeight: 700 }}>⚠️ erro de preço</span>}</td>
                  </>}
                  <td style={tdR}>{gestao && (ok
                    ? <button onClick={() => desmarcar(it)} style={{ border: 'none', background: 'none', color: CORES.fraco, cursor: 'pointer', fontSize: 11.5 }}>desfazer</button>
                    : <button onClick={() => marcar(it)} style={{ background: CORES.marcaEsc, color: '#fff', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>✓ corrigido</button>)}</td>
                </tr>); })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11.5, color: CORES.suave }}>💡 A <b>meta de correção</b> é o <b>nº de pendentes</b> (quanto menor melhor). "Comprado mais caro" compara a <b>última entrada com a anterior da mesma embalagem</b>. Valores por <b>unidade</b>; o total do período fica embaixo.</p>
      </>}
    </div>
  );
}

// ── Fase 1: seleção de produtos do ERP + geração da planilha de pesquisa (formato da empresa) ──────
function PesquisaPreco({ API, comps, classifs, gestao }) {
  const [comprador, setComprador] = useState(''); const [classif, setClassif] = useState(''); const [busca, setBusca] = useState('');
  const [curvaF, setCurvaF] = useState(''); const [tagF, setTagF] = useState(''); const [itens, setItens] = useState([]); const [filiais, setFiliais] = useState([]); const [tags, setTags] = useState([]); const [tagAplicar, setTagAplicar] = useState('');
  const [sel, setSel] = useState(() => new Set()); const [filialRef, setFilialRef] = useState('entrerios');
  const [carreg, setCarreg] = useState(false); const [baixando, setBaixando] = useState(false); const [proxEnvio, setProxEnvio] = useState('');
  useEffect(() => { API.get('/precificacao/pesquisa/filiais').then(r => setFiliais(r.data.filiais || [])).catch(() => {}); API.get('/precificacao/pesquisa/tags').then(r => setTags(r.data.tags || [])).catch(() => {}); }, [API]);
  const carregar = () => { setCarreg(true); API.get('/precificacao/pesquisa/produtos', { params: { comprador: comprador || undefined, classificacao: classif || undefined, tag: tagF || undefined, busca: busca || undefined, limite: 500 } }).then(r => { setItens(r.data.itens || []); if (r.data.filiais) setFiliais(r.data.filiais); }).catch(() => setItens([])).finally(() => setCarreg(false)); };
  const aplicarTag = () => { const t = tagAplicar.trim(); if (!t || !sel.size) return; Promise.all([...sel].map(id => API.post('/precificacao/pesquisa/tag', { produto_id: id, tag: t }).catch(() => {}))).then(() => { if (!tags.includes(t)) setTags([...tags, t]); carregar(); }); };
  const visiveis = itens.filter(i => !curvaF || i.curva === curvaF);
  const toggle = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selVisiveis = () => setSel(new Set(visiveis.map(i => i.produtoId)));
  const selCurva = c => setSel(new Set(itens.filter(i => i.curva === c).map(i => i.produtoId)));
  const curvaCor = c => c === 'A' ? CORES.ok : c === 'B' ? '#B45309' : c === 'C' ? CORES.alerta : CORES.fraco;
  const baixar = () => { if (!sel.size) return; setBaixando(true);
    API.post('/precificacao/pesquisa/planilha', { produtoIds: [...sel], filialRef }, { responseType: 'blob' }).then(res => {
      const url = URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url; a.download = 'PRODUTOS_PESQUISA_PRECO.xlsx'; a.click(); URL.revokeObjectURL(url);
    }).catch(() => {}).finally(() => setBaixando(false)); };
  return (<>
    <FiltroBar>
      <label style={UI.fld}>Comprador<select value={comprador} onChange={e => setComprador(e.target.value)} style={UI.inp}><option value="">Todos</option>{(comps || []).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
      <label style={UI.fld}>Classificação<select value={classif} onChange={e => setClassif(e.target.value)} style={{ ...UI.inp, minWidth: 170 }}><option value="">Todas</option>{(classifs || []).map(x => <option key={x.id} value={x.id}>{x.principal ? x.nome : '— ' + x.nome}</option>)}</select></label>
      <label style={UI.fld}>Tag<select value={tagF} onChange={e => setTagF(e.target.value)} style={UI.inp}><option value="">Todas</option>{tags.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      <label style={UI.fld}>Busca<input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && carregar()} placeholder="nome/EAN" style={UI.inp} /></label>
      <button onClick={carregar} style={{ ...UI.btn, cursor: 'pointer', background: CORES.marca, color: '#fff', borderColor: 'transparent' }}>🔎 Buscar produtos</button>
    </FiltroBar>
    <div style={{ ...UI.card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <b style={{ fontSize: 12.5 }}>Seleção ({sel.size}):</b>
      <button onClick={selVisiveis} style={{ ...UI.btn, cursor: 'pointer' }}>Selecionar todos ({visiveis.length})</button>
      {['A', 'B', 'C'].map(c => <button key={c} onClick={() => selCurva(c)} style={{ ...UI.btn, cursor: 'pointer', color: curvaCor(c) }}>Curva {c}</button>)}
      <button onClick={() => setSel(new Set())} style={{ ...UI.btn, cursor: 'pointer', color: CORES.suave }}>Limpar</button>
      <label style={{ ...UI.fld, marginLeft: 'auto' }}>Filtrar curva<select value={curvaF} onChange={e => setCurvaF(e.target.value)} style={UI.inp}><option value="">Todas</option><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></label>
      <label style={UI.fld}>Filial de referência<select value={filialRef} onChange={e => setFilialRef(e.target.value)} style={UI.inp}>{filiais.map(f => <option key={f.chave} value={f.chave}>{f.nome}</option>)}</select></label>
      <button onClick={baixar} disabled={!sel.size || baixando} style={{ ...UI.btn, cursor: sel.size ? 'pointer' : 'default', background: sel.size ? CORES.marca : '#cbd5e1', color: '#fff', borderColor: 'transparent' }}>⬇️ Baixar planilha ({sel.size})</button>
    </div>
    {gestao && <div style={{ ...UI.card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <b style={{ fontSize: 12.5 }}>🏷️ Tag dos selecionados:</b>
      <input list="tags-sugeridas" value={tagAplicar} onChange={e => setTagAplicar(e.target.value)} placeholder="Formador de opinião…" style={{ ...UI.inp, minWidth: 190 }} />
      <datalist id="tags-sugeridas">{tags.map(t => <option key={t} value={t} />)}</datalist>
      <button onClick={aplicarTag} disabled={!tagAplicar.trim() || !sel.size} style={{ ...UI.btn, cursor: 'pointer', background: tagAplicar.trim() && sel.size ? CORES.marca : '#cbd5e1', color: '#fff', borderColor: 'transparent' }}>Aplicar tag aos {sel.size} selecionados</button>
      <span style={{ fontSize: 11.5, color: CORES.suave }}>Marque "Formador de tráfego/opinião" etc; depois filtre por essa tag na barra de cima.</span>
    </div>}
    <div style={{ ...UI.card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: '#f0f9ff', border: '1px solid #bae6fd' }}>
      <b style={{ fontSize: 12.5 }}>🗓️ Cronograma de envio</b>
      <label style={UI.fld}>Próximo envio à empresa<input type="date" value={proxEnvio} onChange={e => setProxEnvio(e.target.value)} style={UI.inp} /></label>
      <span style={{ fontSize: 11.5, color: CORES.suave }}>{proxEnvio ? 'Planilha será enviada em ' + proxEnvio.split('-').reverse().join('/') : 'Defina a data do próximo envio (a frequência vira cadastro na Fase 2).'}</span>
    </div>
    <div style={{ ...UI.card, padding: 0, overflowX: 'auto' }}>
      <table style={UI.tabela}><thead><tr>{['', 'Produto', 'EAN', 'Estrutura', 'Curva', 'Venda und', ...filiais.map(f => f.nome)].map((h, i) => <th key={h + i} style={i > 4 ? thR : UI.th}>{h}</th>)}</tr></thead>
        <tbody>
          {carreg && <tr><td colSpan={6 + filiais.length} style={{ ...UI.td, padding: 16 }}>⏳ Carregando…</td></tr>}
          {!carreg && visiveis.length === 0 && <tr><td colSpan={6 + filiais.length} style={{ ...UI.td, padding: 16, color: CORES.fraco }}>Busque por comprador, classificação ou nome pra listar os produtos.</td></tr>}
          {visiveis.map(i => { const on = sel.has(i.produtoId); return (
            <tr key={i.produtoId} style={{ background: on ? '#ecfdf5' : '#fff', cursor: 'pointer' }} onClick={() => toggle(i.produtoId)}>
              <td style={UI.td}><input type="checkbox" checked={on} readOnly /></td>
              <td style={{ ...UI.td, fontWeight: 600 }}>{i.descricao}<div style={{ fontSize: 10, color: CORES.fraco }}>cód {i.codigo} · {i.laboratorio || ''}</div>
                {(i.tags || []).length > 0 && <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 2 }}>{i.tags.map(t => <span key={t} style={{ fontSize: 9.5, background: '#eef7f2', color: '#0d6b5e', borderRadius: 999, padding: '1px 6px' }}>🏷️ {t}</span>)}</div>}</td>
              <td style={UI.td}>{i.ean}</td>
              <td style={{ ...UI.td, fontSize: 11 }}>{i.estrutura}</td>
              <td style={UI.td}><b style={{ color: curvaCor(i.curva) }}>{i.curva}</b></td>
              <td style={thR}>{num(i.vendaUnd)}</td>
              {filiais.map(f => <td key={f.chave} style={tdR}>{brl(i.precos[f.chave])}</td>)}
            </tr>); })}
        </tbody></table>
    </div>
    <p style={{ fontSize: 11.5, color: CORES.suave }}>💡 A planilha sai no <b>formato da empresa</b> (Código · EAN · Descrição · Estrutura · Preço de Referência · preço por filial). A <b>curva</b> é calculada pela venda (und) do conjunto. Depois a empresa devolve com os preços dos concorrentes e você cruza na Fase 3.</p>
  </>);
}

// ── Fase 2: cadernos de oferta — frequência de conferência + validador de execução ────────────────
function Cadernos({ API, gestao, comps }) {
  const [cadernos, setCadernos] = useState([]); const [resumo, setResumo] = useState(null); const [cadsErp, setCadsErp] = useState([]);
  const vazio = { nome: '', frequencia_dias: 15, responsavel_tipo: 'comprador', responsavel_nome: '', proxima_conferencia: '' };
  const [form, setForm] = useState(null); // null = fechado; objeto = criando/editando
  const carregar = () => API.get('/precificacao/cadernos').then(r => { setCadernos(r.data.cadernos || []); setResumo(r.data.resumo); }).catch(() => {});
  useEffect(() => { carregar(); API.get('/precificacao/cadernos-erp').then(r => setCadsErp(r.data.cadernos || [])).catch(() => {}); }, []); // eslint-disable-line
  const salvar = () => { if (!form.nome.trim()) return; API.post('/precificacao/cadernos', form).then(() => { setForm(null); carregar(); }).catch(() => {}); };
  const conferido = (id) => API.post(`/precificacao/cadernos/${id}/exec`, { ok: true }).then(carregar).catch(() => {});
  const remover = (id) => API.delete('/precificacao/cadernos/' + id).then(carregar).catch(() => {});
  const stChip = s => s === 'atrasado' ? { bg: '#fef2f2', c: CORES.alerta, t: 'Atrasado' } : s === 'proximo' ? { bg: '#fffbeb', c: '#B45309', t: 'Vence em breve' } : s === 'inativo' ? { bg: '#f1f5f9', c: CORES.fraco, t: 'Inativo' } : { bg: '#ecfdf5', c: CORES.ok, t: 'Em dia' };
  const dBR = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
  return (<>
    <KpiGrid>
      <Kpi label="Cadernos ativos" valor={num(resumo?.total || 0)} />
      <Kpi label="Em dia" valor={num(resumo?.emDia || 0)} cor={CORES.ok} />
      <Kpi label="Atrasados" valor={num(resumo?.atrasados || 0)} cor={(resumo?.atrasados || 0) ? CORES.alerta : CORES.ok} />
      <Kpi label="% em dia" valor={resumo?.pctEmDia != null ? resumo.pctEmDia + '%' : '—'} cor={resumo?.pctEmDia >= 90 ? CORES.ok : '#B45309'} />
    </KpiGrid>
    {gestao && <div style={{ ...UI.card, display: 'flex', gap: 10, alignItems: 'center' }}>
      <b style={{ fontSize: 13 }}>📒 Cadernos de oferta</b>
      <button onClick={() => setForm({ ...vazio })} style={{ ...UI.btn, cursor: 'pointer', background: CORES.marca, color: '#fff', borderColor: 'transparent', marginLeft: 'auto' }}>+ Novo caderno</button>
    </div>}
    {form && <div style={UI.card}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <label style={UI.fld}>Caderno (do Alpha)<input list="cadernos-erp" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="escolha o caderno do ERP…" style={{ ...UI.inp, minWidth: 220 }} />
          <datalist id="cadernos-erp">{cadsErp.map(c => <option key={c.id} value={c.nome}>{c.fim ? 'vig. até ' + c.fim.split('-').reverse().join('/') : ''}</option>)}</datalist></label>
        <label style={UI.fld}>Frequência (dias)<input type="number" value={form.frequencia_dias} onChange={e => setForm({ ...form, frequencia_dias: e.target.value })} style={UI.inp} /></label>
        <label style={UI.fld}>Responsável por<select value={form.responsavel_tipo} onChange={e => setForm({ ...form, responsavel_tipo: e.target.value })} style={UI.inp}><option value="comprador">Comprador</option><option value="pessoa">Pessoa</option></select></label>
        {form.responsavel_tipo === 'comprador'
          ? <label style={UI.fld}>Comprador<select value={form.responsavel_nome} onChange={e => setForm({ ...form, responsavel_nome: e.target.value })} style={UI.inp}><option value="">—</option>{(comps || []).map(x => <option key={x.id} value={x.nome}>{x.nome}</option>)}</select></label>
          : <label style={UI.fld}>Pessoa<input value={form.responsavel_nome} onChange={e => setForm({ ...form, responsavel_nome: e.target.value })} placeholder="nome" style={UI.inp} /></label>}
        <label style={UI.fld}>Próxima conferência<input type="date" value={form.proxima_conferencia || ''} onChange={e => setForm({ ...form, proxima_conferencia: e.target.value })} style={UI.inp} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={salvar} style={{ ...UI.btn, cursor: 'pointer', background: CORES.marca, color: '#fff', borderColor: 'transparent' }}>Salvar</button>
        <button onClick={() => setForm(null)} style={{ ...UI.btn, cursor: 'pointer' }}>Cancelar</button>
        <span style={{ fontSize: 11.5, color: CORES.suave, alignSelf: 'center' }}>Deixe a data em branco pra calcular pela frequência.</span>
      </div>
    </div>}
    <div style={{ ...UI.card, padding: 0, overflowX: 'auto' }}>
      <table style={UI.tabela}><thead><tr>{['Caderno', 'Frequência', 'Responsável', 'Próxima conferência', 'Status', 'Última', ''].map(h => <th key={h} style={UI.th}>{h}</th>)}</tr></thead>
        <tbody>
          {cadernos.length === 0 && <tr><td colSpan={7} style={{ ...UI.td, padding: 16, color: CORES.fraco }}>Nenhum caderno cadastrado{gestao ? ' — clique em "Novo caderno".' : '.'}</td></tr>}
          {cadernos.map(c => { const sc = stChip(c.status); return (
            <tr key={c.id}>
              <td style={{ ...UI.td, fontWeight: 600 }}>{c.nome}</td>
              <td style={UI.td}>{c.frequencia_dias ? c.frequencia_dias + ' dias' : '—'}</td>
              <td style={UI.td}>{c.responsavel_nome || '—'}{c.responsavel_tipo ? <span style={{ fontSize: 10, color: CORES.fraco }}> · {c.responsavel_tipo}</span> : ''}</td>
              <td style={UI.td}>{dBR(c.proxima_conferencia)}{c.diasRestantes != null && <span style={{ fontSize: 10, color: CORES.fraco }}> ({c.diasRestantes < 0 ? Math.abs(c.diasRestantes) + 'd atrás' : c.diasRestantes + 'd'})</span>}</td>
              <td style={UI.td}><span style={{ background: sc.bg, color: sc.c, borderRadius: 999, padding: '2px 9px', fontSize: 11.5, fontWeight: 700 }}>{sc.t}</span></td>
              <td style={UI.td}>{c.ultima ? <span style={{ fontSize: 11.5 }}>{dBR(c.ultima.data)} · {c.ultima.por_nome || '—'} {c.ultima.ok ? '✓' : '✗'}</span> : <span style={{ color: CORES.fraco }}>—</span>}</td>
              <td style={UI.td}><div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => conferido(c.id)} title="marcar conferido hoje" style={{ ...UI.btn, cursor: 'pointer', background: CORES.marca, color: '#fff', borderColor: 'transparent', padding: '4px 10px', fontSize: 11.5 }}>✓ Conferido</button>
                {gestao && <button onClick={() => setForm({ id: c.id, nome: c.nome, frequencia_dias: c.frequencia_dias, responsavel_tipo: c.responsavel_tipo || 'comprador', responsavel_nome: c.responsavel_nome || '', proxima_conferencia: c.proxima_conferencia || '', ativo: c.ativo })} style={{ ...UI.btn, cursor: 'pointer', padding: '4px 8px', fontSize: 11.5 }}>editar</button>}
                {gestao && <button onClick={() => remover(c.id)} style={{ ...UI.btn, cursor: 'pointer', color: CORES.alerta, padding: '4px 8px', fontSize: 11.5 }}>remover</button>}
              </div></td>
            </tr>); })}
        </tbody></table>
    </div>
    <p style={{ fontSize: 11.5, color: CORES.suave }}>💡 Cada caderno tem uma <b>frequência</b> de conferência e um <b>responsável</b> (comprador ou pessoa). Ao marcar <b>✓ Conferido</b>, a próxima data avança pela frequência. O status fica <b style={{ color: CORES.alerta }}>Atrasado</b> quando passa da data.</p>
  </>);
}

// ── Fase 3: cruzamento do retorno da empresa × preço atual do Alpha ────────────────────────────────
function Cruzamento({ API }) {
  const [filiais, setFiliais] = useState([]); const [filialRef, setFilialRef] = useState('entrerios');
  const [d, setD] = useState(null); const [carregando, setCarregando] = useState(false); const [erro, setErro] = useState(''); const [filtro, setFiltro] = useState('');
  useEffect(() => { API.get('/precificacao/pesquisa/filiais').then(r => setFiliais(r.data.filiais || [])).catch(() => {}); }, [API]);
  const onFile = e => { const f = e.target.files && e.target.files[0]; if (!f) return; setErro(''); setCarregando(true);
    const fr = new FileReader(); fr.onload = () => { const b64 = String(fr.result).split(',')[1] || '';
      API.post('/precificacao/pesquisa/cruzar', { base64: b64, filialRef }).then(r => setD(r.data)).catch(er => { setErro(er.response?.data?.erro || 'Erro ao ler a planilha.'); setD(null); }).finally(() => setCarregando(false));
    }; fr.readAsDataURL(f); e.target.value = ''; };
  const stChip = s => s === 'mais_caro' ? { bg: '#fef2f2', c: CORES.alerta, t: 'Mais caro' } : s === 'mais_barato' ? { bg: '#ecfdf5', c: CORES.ok, t: 'Mais barato' } : s === 'igual' ? { bg: '#eff6ff', c: '#2563eb', t: 'Igual' } : { bg: '#f1f5f9', c: CORES.fraco, t: 'Sem concorrente' };
  const itens = (d?.itens || []).filter(i => !filtro || i.status === filtro);
  const conc = d?.concorrentes || [];
  return (<>
    <div style={{ ...UI.card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <b style={{ fontSize: 13 }}>🔀 Cruzar retorno da pesquisa × Alpha</b>
      <label style={UI.fld}>Nosso preço (filial)<select value={filialRef} onChange={e => setFilialRef(e.target.value)} style={UI.inp}>{filiais.map(f => <option key={f.chave} value={f.chave}>{f.nome}</option>)}</select></label>
      <label style={{ ...UI.btn, cursor: 'pointer', background: CORES.marca, color: '#fff', borderColor: 'transparent' }}>⬆️ Subir planilha devolvida<input type="file" accept=".xlsx,.xls" onChange={onFile} style={{ display: 'none' }} /></label>
      {carregando && <span style={{ fontSize: 12, color: CORES.suave }}>⏳ lendo…</span>}
      {erro && <span style={{ fontSize: 12, color: CORES.alerta }}>⚠️ {erro}</span>}
      <span style={{ fontSize: 11.5, color: CORES.suave }}>A empresa devolve a planilha com os preços dos concorrentes; o sistema cruza com o preço atual do Alpha.</span>
    </div>
    {d && <>
      <KpiGrid>
        <Kpi label="Produtos cruzados" valor={num(d.resumo?.total || 0)} />
        <Kpi label="Estamos MAIS CAROS" valor={num(d.resumo?.maisCaro || 0)} cor={(d.resumo?.maisCaro || 0) ? CORES.alerta : CORES.ok} sub="acima do menor concorrente" />
        <Kpi label="Estamos mais baratos" valor={num(d.resumo?.maisBarato || 0)} cor={CORES.ok} />
        <Kpi label="Sem preço de concorrente" valor={num(d.resumo?.semConc || 0)} cor={CORES.fraco} />
      </KpiGrid>
      <div style={{ ...UI.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <b style={{ fontSize: 12.5 }}>Filtrar:</b>
        {[['', 'Todos'], ['mais_caro', '🔴 Mais caros'], ['mais_barato', '🟢 Mais baratos'], ['sem_conc', 'Sem concorrente']].map(([k, l]) => <button key={k} onClick={() => setFiltro(k)} style={{ ...UI.btn, cursor: 'pointer', ...(filtro === k ? { background: CORES.marca, color: '#fff', borderColor: 'transparent' } : {}) }}>{l}</button>)}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: CORES.suave }}>Concorrentes: {conc.join(' · ') || '—'}</span>
      </div>
      <div style={{ ...UI.card, padding: 0, overflowX: 'auto' }}>
        <table style={UI.tabela}><thead><tr>{['Produto', 'EAN', 'Nosso preço', ...conc, 'Menor conc.', 'Gap', 'Status'].map((h, i) => <th key={h + i} style={i >= 2 ? thR : UI.th}>{h}</th>)}</tr></thead>
          <tbody>
            {itens.length === 0 && <tr><td colSpan={5 + conc.length} style={{ ...UI.td, padding: 16, color: CORES.fraco }}>Nada no filtro.</td></tr>}
            {itens.map((i, k) => { const sc = stChip(i.status); return (
              <tr key={k} style={{ background: i.status === 'mais_caro' ? '#fff7f7' : '#fff' }}>
                <td style={{ ...UI.td, fontWeight: 600 }}>{i.descricao}</td>
                <td style={UI.td}>{i.ean}</td>
                <td style={{ ...tdR, fontWeight: 700 }}>{i.nossoPreco != null ? brl(i.nossoPreco) : '—'}</td>
                {conc.map(c => <td key={c} style={{ ...tdR, color: i.precos[c] != null && i.menorConc === i.precos[c] ? CORES.ok : CORES.suave, fontWeight: i.menorConc === i.precos[c] ? 700 : 400 }}>{i.precos[c] != null ? brl(i.precos[c]) : '—'}</td>)}
                <td style={{ ...tdR, fontWeight: 700 }}>{i.menorConc != null ? brl(i.menorConc) : '—'}</td>
                <td style={{ ...tdR, fontWeight: 800, color: i.gap > 0 ? CORES.alerta : i.gap < 0 ? CORES.ok : CORES.suave }}>{i.gap != null ? (i.gap > 0 ? '+' : '') + brl(i.gap) + (i.gapPct != null ? ' (' + i.gapPct + '%)' : '') : '—'}</td>
                <td style={UI.td}><span style={{ background: sc.bg, color: sc.c, borderRadius: 999, padding: '2px 9px', fontSize: 11.5, fontWeight: 700 }}>{sc.t}</span></td>
              </tr>); })}
          </tbody></table>
      </div>
      <p style={{ fontSize: 11.5, color: CORES.suave }}>💡 "Nosso preço" vem do <b>Alpha ao vivo</b> (filial escolhida), casado por EAN. <b>Gap</b> = nosso − menor concorrente (positivo = estamos mais caros). As colunas de concorrente são detectadas automaticamente na planilha devolvida.</p>
    </>}
  </>);
}
