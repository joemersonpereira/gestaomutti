import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const CAT = { limpeza: '🧹 Limpeza', escritorio: '📎 Escritório', fardamento: '👕 Fardamento', brinde: '🎁 Brindes' };
const STF = { pedido: { l: 'Pedido', c: '#8A6D1D' }, separacao: { l: 'Separação', c: '#7A5AA8' }, enviado: { l: 'Enviado', c: '#185FA5' }, entregue: { l: 'Entregue', c: '#3B6D11' }, cancelado: { l: 'Cancelado', c: '#993C1D' } };
const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lerImg = file => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
const ehImg = v => typeof v === 'string' && (v.startsWith('data:') || v.startsWith('http'));
function Foto({ src, fallback, size = 76 }) {
  return ehImg(src)
    ? <img src={src} alt="" style={{ width: '100%', height: size, objectFit: 'cover', borderRadius: 8, marginBottom: 8, display: 'block' }} />
    : <div style={{ height: size, borderRadius: 8, background: '#F5F6F8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size / 2), marginBottom: 8 }}>{src || fallback}</div>;
}

export default function Mercado({ modo } = {}) {
  const { API, usuario } = useAuth();
  const ehAdmin = ['Suporte', 'Gestor Geral', 'Diretor Geral', 'Controladoria'].includes(usuario.funcao);
  const almox = modo === 'gestao';                 // visão Almoxarifado (gestão de estoque/custos/fluxo)
  const admin = modo === 'comprar' ? false : ehAdmin; // 'comprar' = só a visão de pedir (Meu Mercado)
  const [aba, setAba] = useState(almox && admin ? 'estoque' : 'comprar');
  const abas = [['comprar', '🛒 Comprar'], ['pedidos', admin ? '📦 Fluxo de pedidos' : '📦 Meus pedidos']];
  if (admin) abas.push(['estoque', '📥 Estoque & NF'], ['brindes', '🎁 Brindes'], ['custos', '💰 Custos']);

  return (
    <div style={s.wrap}>
      {almox
        ? <Banner emoji="📦" titulo="Almoxarifado" cor="ciano" sub="Gestão do estoque interno: entrada por NF do ERP, fluxo de pedidos, custos e brindes." />
        : <Banner emoji="🏬" titulo="Meu Mercado" cor="laranja" sub="Peça materiais de limpeza, escritório, fardamento e brindes para a sua loja." />}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {abas.map(([v, l]) => <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {aba === 'comprar' && <Comprar API={API} admin={admin} />}
      {aba === 'pedidos' && <Pedidos API={API} admin={admin} />}
      {aba === 'estoque' && admin && <Estoque API={API} usuario={usuario} />}
      {aba === 'brindes' && admin && <Brindes API={API} />}
      {aba === 'custos' && admin && <Custos API={API} />}
    </div>
  );
}

function Comprar({ API, admin }) {
  const [prod, setProd] = useState([]);
  const [cesta, setCesta] = useState({}); // "produtoId|variacaoId" -> {produto_id, variacao_id, variacao_nome, nome, categoria, qtd}
  const [sel, setSel] = useState({}); // produto_id -> variacao_id selecionada
  const [cat, setCat] = useState('todas');
  const [forn, setForn] = useState('todos');
  const [busca, setBusca] = useState('');
  const [obs, setObs] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/mercado/produtos').then(r => setProd(r.data.produtos || [])).catch(() => setProd([])), [API]);
  useEffect(() => { carregar(); }, [carregar]);

  const base = prod.filter(p => p.categoria !== 'brinde');
  const cats = [...new Set(base.map(p => p.categoria))];
  const forns = [...new Set(base.map(p => p.fornecedor).filter(Boolean))].sort();
  const compraveis = base.filter(p =>
    (cat === 'todas' || p.categoria === cat) &&
    (forn === 'todos' || p.fornecedor === forn) &&
    (!busca || p.nome.toLowerCase().includes(busca.toLowerCase())));
  const itensCesta = Object.entries(cesta).filter(([, v]) => v.qtd > 0);

  // Chave da cesta por produto+variação. Para produto com variação, usa a selecionada.
  const varSel = p => p.variacoes && p.variacoes.length ? (sel[p.id] || p.variacoes[0].id) : null;
  const chave = (pid, vid) => `${pid}|${vid || ''}`;
  const qtdDe = (p) => { const v = varSel(p); return cesta[chave(p.id, v)]?.qtd || 0; };
  const setQtd = (p, q) => {
    const vid = varSel(p);
    const vNome = vid ? (p.variacoes.find(x => x.id === vid)?.nome || null) : null;
    const k = chave(p.id, vid);
    setCesta(c => ({ ...c, [k]: { produto_id: p.id, variacao_id: vid, variacao_nome: vNome, nome: p.nome, categoria: p.categoria, qtd: Math.max(0, q) } }));
  };

  async function enviar() {
    if (!itensCesta.length) return;
    const cats2 = new Set(itensCesta.map(([, v]) => v.categoria));
    const categoria = cats2.has('fardamento') && cats2.size === 1 ? 'fardamento' : 'materiais';
    await API.post('/mercado/pedidos', { categoria, obs, itens: itensCesta.map(([, v]) => ({ produto_id: v.produto_id, variacao_id: v.variacao_id, quantidade: v.qtd })) });
    setCesta({}); setObs(''); setMsg('✅ Pedido enviado! Acompanhe em “Meus pedidos”.'); setTimeout(() => setMsg(''), 3500);
  }

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* Filtros (SULTS-like) */}
      <div style={{ width: 210, flexShrink: 0 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔎 Buscar produto…" style={{ ...s.inp, width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
        <div style={s.filtroBox}>
          <div style={s.filtroTit}>Categorias</div>
          <FiltroItem ativo={cat === 'todas'} onClick={() => setCat('todas')} label="Todas" n={base.length} />
          {cats.map(c => <FiltroItem key={c} ativo={cat === c} onClick={() => setCat(c)} label={CAT[c] || c} n={base.filter(p => p.categoria === c).length} />)}
        </div>
        {forns.length > 0 && (
          <div style={s.filtroBox}>
            <div style={s.filtroTit}>Fornecedores</div>
            <FiltroItem ativo={forn === 'todos'} onClick={() => setForn('todos')} label="Todos" n={base.length} />
            {forns.map(f => <FiltroItem key={f} ativo={forn === f} onClick={() => setForn(f)} label={f} n={base.filter(p => p.fornecedor === f).length} />)}
          </div>
        )}
      </div>

      {/* Catálogo */}
      <div style={{ flex: 1, minWidth: 280 }}>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>{compraveis.length} produto(s)</div>
        {msg && <div style={{ fontSize: 13, color: '#3B6D11', marginBottom: 8, fontWeight: 600 }}>{msg}</div>}
        {compraveis.length === 0 && <div style={s.card}>Nenhum produto disponível. {admin ? 'Importe uma NF ou cadastre em “Estoque & NF”.' : 'Fale com o suporte.'}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 12 }}>
          {compraveis.map(p => {
            const q = qtdDe(p);
            const temVar = p.variacoes && p.variacoes.length > 0;
            const vid = varSel(p);
            const vSelObj = temVar ? p.variacoes.find(x => x.id === vid) : null;
            const estoque = temVar ? (vSelObj?.estoque || 0) : p.estoque;
            return (
              <div key={p.id} style={{ ...s.card, marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
                <Foto src={p.imagem} fallback={CAT[p.categoria]?.split(' ')[0] || '📦'} />
                <span style={{ ...s.tag, alignSelf: 'flex-start' }}>{CAT[p.categoria]?.split(' ').slice(1).join(' ') || p.categoria}</span>
                <div style={{ fontSize: 13, fontWeight: 600, margin: '4px 0', minHeight: 34 }}>{p.nome}</div>
                {p.fornecedor && <div style={{ fontSize: 11, color: '#999' }}>Fornecedor: {p.fornecedor}</div>}
                {temVar && (
                  <select value={vid} onChange={e => setSel({ ...sel, [p.id]: e.target.value })} style={{ ...s.inp, fontSize: 12, padding: '5px 7px', margin: '4px 0' }}>
                    {p.variacoes.map(v => <option key={v.id} value={v.id} disabled={v.estoque <= 0}>{v.nome}{v.estoque <= 0 ? ' (esgotado)' : ` — ${v.estoque}`}</option>)}
                  </select>
                )}
                <div style={{ fontSize: 11, color: estoque > 0 ? '#3B6D11' : '#993C1D', margin: '2px 0 8px' }}>
                  {estoque > 0 ? `${estoque} disponível` : 'sem estoque'}{p.categoria === 'fardamento' && p.preco > 0 ? ` · ${brl(p.preco)}` : ''}
                </div>
                <div style={{ marginTop: 'auto' }}>
                  {q > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                      <button onClick={() => setQtd(p, q - 1)} style={s.stepBtn}>−</button>
                      <input type="number" min="0" value={q} onChange={e => setQtd(p, parseInt(e.target.value) || 0)} style={{ width: 46, border: '1px solid #ddd', borderRadius: 6, padding: 5, textAlign: 'center', fontSize: 13 }} />
                      <button onClick={() => setQtd(p, q + 1)} style={s.stepBtn}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => setQtd(p, 1)} disabled={estoque <= 0} style={{ ...s.btnAdd, ...(estoque <= 0 ? { background: '#ccc', cursor: 'not-allowed' } : {}) }}>Adicionar</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Carrinho */}
      {itensCesta.length > 0 && (
        <div style={{ ...s.card, position: 'sticky', top: 8, width: 230, flexShrink: 0, border: '1.5px solid #185FA5' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>🛒 Carrinho</div>
          {itensCesta.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#444', padding: '3px 0' }}>
              <span style={{ flex: 1 }}>{v.nome}{v.variacao_nome ? <span style={{ color: '#999' }}> · {v.variacao_nome}</span> : ''}</span>
              <span style={{ fontWeight: 600 }}>{v.qtd}×</span>
            </div>
          ))}
          <textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação (opcional)" rows={2} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 8, padding: 8, margin: '8px 0', resize: 'vertical', fontSize: 12 }} />
          <button onClick={enviar} style={{ ...s.btn, width: '100%' }}>Enviar pedido</button>
        </div>
      )}
    </div>
  );
}

function FiltroItem({ ativo, onClick, label, n }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, background: ativo ? '#111' : 'transparent', color: ativo ? '#fff' : '#444' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 10, color: ativo ? '#ccc' : '#aaa', marginLeft: 6 }}>{n}</span>
    </div>
  );
}

// Resumo de gastos da loja com o mercado (visão do gerente): mês atual + categorias + últimos meses.
function MeusGastos({ API }) {
  const [g, setG] = useState(null);
  useEffect(() => { API.get('/mercado/meus-gastos').then(r => setG(r.data)).catch(() => setG(null)); }, [API]);
  if (!g || g.semLoja) return null;
  const meses = g.meses || [];
  const max = Math.max(1, ...meses.map(m => m.valor || 0));
  const mLabel = c => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][(+c.split('-')[1]) - 1];
  return (
    <div style={{ ...s.card, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: '#888' }}>Gasto da sua loja com mercado · mês atual</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#8A6D1D' }}>{brl(g.total)}</div>
        </div>
        {meses.length > 1 && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 46 }}>
            {meses.map(m => (
              <div key={m.comp} title={`${mLabel(m.comp)}: ${brl(m.valor)}`} style={{ width: 16, textAlign: 'center' }}>
                <div style={{ height: Math.round(36 * (m.valor || 0) / max) + 2, background: '#D6B45A', borderRadius: 3 }} />
                <div style={{ fontSize: 8.5, color: '#aaa', marginTop: 2 }}>{mLabel(m.comp)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {(g.categorias || []).length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {g.categorias.map(c => <span key={c.categoria} style={{ fontSize: 11, background: '#F5F1E6', color: '#6b551a', borderRadius: 8, padding: '3px 9px' }}>{c.categoria}: {brl(c.valor)}</span>)}
        </div>
      )}
    </div>
  );
}

function Pedidos({ API, admin }) {
  const [d, setD] = useState(null);
  const [status, setStatus] = useState(admin ? 'pedido' : '');
  const [entregando, setEntregando] = useState(null); // pedido id em modo "confirmar entrega"
  const [envio, setEnvio] = useState({}); // item id -> qtd enviada
  const carregar = useCallback(() => API.get('/mercado/pedidos', { params: admin && status ? { status } : {} }).then(r => setD(r.data)).catch(() => setD({ pedidos: [] })), [API, admin, status]);
  useEffect(() => { carregar(); }, [carregar]);
  const proximo = { pedido: 'separacao', separacao: 'enviado', enviado: 'entregue' };
  async function mover(id, novo) { await API.patch(`/mercado/pedidos/${id}/status`, { status: novo }); carregar(); }
  function abrirEntrega(p) { setEntregando(p.id); setEnvio(Object.fromEntries(p.itens.map(i => [i.id, i.quantidade]))); }
  async function confirmarEntrega(p) {
    await API.patch(`/mercado/pedidos/${p.id}/status`, { status: 'entregue', itens: p.itens.map(i => ({ id: i.id, atendida: envio[i.id] })) });
    setEntregando(null); carregar();
  }
  if (!d) return <div style={s.card}>Carregando…</div>;
  return (
    <div>
      {!admin && <MeusGastos API={API} />}
      {admin && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {['pedido', 'separacao', 'enviado', 'entregue'].map(st => <button key={st} onClick={() => setStatus(st)} style={{ ...s.chipS, ...(status === st ? s.chipOn : {}) }}>{STF[st].l}</button>)}
      </div>}
      {d.pedidos.length === 0 && <div style={s.card}>Nenhum pedido {admin ? `em ${STF[status]?.l.toLowerCase()}` : 'ainda'}.</div>}
      {d.pedidos.map(p => (
        <div key={p.id} style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: 12, color: '#999' }}>{admin ? `${p.solicitante_nome} · ${p.loja_nome || ''}` : `${CAT[p.categoria] || p.categoria}`} · {String(p.criado_em).slice(0, 10).split('-').reverse().join('/')}</div>
            <span style={{ fontSize: 11, fontWeight: 700, color: STF[p.status].c, background: STF[p.status].c + '18', padding: '2px 10px', borderRadius: 6 }}>{STF[p.status].l}</span>
          </div>
          <div style={{ margin: '6px 0' }}>{p.itens.map((i, k) => (
            <span key={k} style={{ fontSize: 12, color: '#333', marginRight: 10 }}>
              {i.quantidade}× {i.nome}{i.variacao_nome ? ` (${i.variacao_nome})` : ''}
              {p.status === 'entregue' && i.atendida != null && i.atendida < i.quantidade && <span style={{ color: '#993C1D' }}> · enviado {i.atendida}</span>}
            </span>
          ))}</div>
          {p.obs && <div style={{ fontSize: 11, color: '#888' }}>Obs: {p.obs}</div>}

          {entregando === p.id ? (
            <div style={{ marginTop: 8, background: '#FAFAFB', borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Quanto foi enviado de cada item?</div>
              {p.itens.map(i => (
                <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 0' }}>
                  <span style={{ flex: 1 }}>{i.nome}{i.variacao_nome ? ` (${i.variacao_nome})` : ''} <span style={{ color: '#999' }}>· pedido {i.quantidade}</span></span>
                  <input type="number" min="0" max={i.quantidade} value={envio[i.id] ?? ''} onChange={e => setEnvio({ ...envio, [i.id]: Math.max(0, Math.min(i.quantidade, parseInt(e.target.value) || 0)) })} style={{ ...s.inp, width: 64 }} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => confirmarEntrega(p)} style={sBtn('#3B6D11')}>Confirmar entrega</button>
                <button onClick={() => setEntregando(null)} style={sBtn('#eee', '#666')}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {admin && p.status === 'enviado' && <button onClick={() => abrirEntrega(p)} style={sBtn('#3B6D11')}>Registrar entrega</button>}
              {admin && proximo[p.status] && p.status !== 'enviado' && <button onClick={() => mover(p.id, proximo[p.status])} style={sBtn('#185FA5')}>→ {STF[proximo[p.status]].l}</button>}
              {(p.status === 'pedido') && <button onClick={() => mover(p.id, 'cancelado')} style={sBtn('#eee', '#993C1D')}>Cancelar</button>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Estoque({ API, usuario }) {
  const [prod, setProd] = useState([]);
  const [modo, setModo] = useState('numero'); // numero | fornecedor
  const [nf, setNf] = useState({ numero: '', loja_id: usuario.loja_id || '', fornecedor: '' });
  const [lojas, setLojas] = useState([]);
  const [nfsFornec, setNfsFornec] = useState(null);
  const [achada, setAchada] = useState(null);
  const [catNf, setCatNf] = useState('limpeza');
  const [novo, setNovo] = useState({ categoria: 'limpeza', nome: '', unidade: 'UN', fornecedor: '', custo: '', preco: '', estoque: '', resgatavel: false, pontos: '', tem_variacoes: false, variacoes: [], imagem: null });
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/mercado/produtos').then(r => setProd(r.data.produtos || [])), [API]);
  useEffect(() => { carregar(); API.get('/referencias/lojas').then(r => { setLojas(r.data.lojas || []); }).catch(() => {}); }, [API, carregar]);

  async function buscarNf(numero) {
    setMsg(''); setAchada(null);
    try {
      const r = await API.get('/mercado/nf-erp', { params: { numero: numero || nf.numero, loja_id: nf.loja_id } });
      if (!r.data.encontrada) { setMsg('NF não encontrada nessa loja.'); return; }
      setNfsFornec(null);
      setAchada({ ...r.data, itens: r.data.itens.map(i => ({ ...i, incluir: true, categoria: catNf })) });
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro na busca.'); }
  }
  async function buscarFornec() {
    setMsg(''); setAchada(null); setNfsFornec(null);
    try {
      const r = await API.get('/mercado/nfs-erp', { params: { fornecedor: nf.fornecedor, loja_id: nf.loja_id } });
      if (!r.data.nfs.length) { setMsg('Nenhuma NF desse fornecedor nessa loja.'); return; }
      setNfsFornec(r.data.nfs);
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro na busca.'); }
  }
  async function importar() {
    const itens = achada.itens.filter(i => i.incluir).map(i => ({ ...i, categoria: i.categoria || catNf }));
    const r = await API.post('/mercado/importar-nf', { nf_numero: achada.nf.numero, fornecedor: achada.nf.fornecedor, itens });
    setMsg(`✅ ${r.data.importados} item(ns) importados ao estoque.`); setAchada(null); carregar();
  }
  async function criar() {
    if (!novo.nome) return;
    const payload = { ...novo };
    if (novo.tem_variacoes) payload.variacoes = novo.variacoes.filter(v => String(v.nome || '').trim());
    await API.post('/mercado/produtos', payload);
    setNovo({ categoria: 'limpeza', nome: '', unidade: 'UN', fornecedor: '', custo: '', preco: '', estoque: '', resgatavel: false, pontos: '', tem_variacoes: false, variacoes: [] });
    carregar(); setMsg('✅ Produto cadastrado.');
  }
  const addVar = () => setNovo({ ...novo, variacoes: [...novo.variacoes, { nome: '', estoque: '' }] });
  const setVar = (i, campo, val) => setNovo({ ...novo, variacoes: novo.variacoes.map((v, j) => j === i ? { ...v, [campo]: val } : v) });
  const rmVar = (i) => setNovo({ ...novo, variacoes: novo.variacoes.filter((_, j) => j !== i) });

  return (
    <div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📥 Importar NF do ERP → estoque + custo</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {[['numero', 'Por número da NF'], ['fornecedor', 'Por fornecedor']].map(([v, l]) =>
            <button key={v} onClick={() => { setModo(v); setNfsFornec(null); setAchada(null); }} style={{ ...s.chipS, ...(modo === v ? s.chipOn : {}) }}>{l}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {lojas.length > 0 && <select value={nf.loja_id} onChange={e => setNf({ ...nf, loja_id: e.target.value })} style={s.inp}>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>}
          {modo === 'numero'
            ? <input value={nf.numero} onChange={e => setNf({ ...nf, numero: e.target.value })} placeholder="Número da NF" style={s.inp} />
            : <input value={nf.fornecedor} onChange={e => setNf({ ...nf, fornecedor: e.target.value })} placeholder="Nome do fornecedor" style={{ ...s.inp, minWidth: 180 }} />}
          <select value={catNf} onChange={e => setCatNf(e.target.value)} style={s.inp}>{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button onClick={() => modo === 'numero' ? buscarNf() : buscarFornec()} style={s.btn}>Buscar</button>
        </div>
        {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 8 }}>{msg}</div>}

        {nfsFornec && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>NFs encontradas — escolha uma:</div>
            {nfsFornec.map((n, k) => (
              <div key={k} onClick={() => buscarNf(n.numero)} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 8px', borderTop: '1px solid #f4f4f4', cursor: 'pointer', fontSize: 12 }}>
                <span>NF {n.numero}{n.serie ? `/${n.serie}` : ''} · {n.fornecedor}</span>
                <span style={{ color: '#666' }}>{n.entrada ? n.entrada.split('-').reverse().join('/') : ''} · {brl(n.valor_total)} →</span>
              </div>
            ))}
          </div>
        )}
        {achada && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>NF {achada.nf.numero} · {achada.nf.fornecedor} · {brl(achada.nf.valor_total)}</div>
            {achada.itens.map((i, k) => (
              <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', borderTop: '1px solid #f4f4f4', flexWrap: 'wrap' }}>
                <input type="checkbox" checked={i.incluir} onChange={e => setAchada({ ...achada, itens: achada.itens.map((x, j) => j === k ? { ...x, incluir: e.target.checked } : x) })} />
                <div style={{ flex: 1, minWidth: 160, fontSize: 12 }}>{i.descricao}<div style={{ fontSize: 10, color: '#999' }}>{i.quantidade} un · custo {brl(i.custo)}</div></div>
                <select value={i.categoria} onChange={e => setAchada({ ...achada, itens: achada.itens.map((x, j) => j === k ? { ...x, categoria: e.target.value } : x) })} style={{ ...s.inp, fontSize: 11 }}>{Object.entries(CAT).map(([kk, v]) => <option key={kk} value={kk}>{v}</option>)}</select>
              </div>
            ))}
            <button onClick={importar} style={{ ...s.btn, marginTop: 8 }}>Importar selecionados</button>
          </div>
        )}
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>➕ Cadastrar produto manual</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={novo.categoria} onChange={e => setNovo({ ...novo, categoria: e.target.value })} style={s.inp}>{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} placeholder="Nome" style={{ ...s.inp, flex: 1, minWidth: 160 }} />
          <input value={novo.fornecedor} onChange={e => setNovo({ ...novo, fornecedor: e.target.value })} placeholder="Fornecedor" style={{ ...s.inp, width: 130 }} />
          <input type="number" value={novo.custo} onChange={e => setNovo({ ...novo, custo: e.target.value })} placeholder="Custo" style={{ ...s.inp, width: 80 }} />
          {!novo.tem_variacoes && <input type="number" value={novo.estoque} onChange={e => setNovo({ ...novo, estoque: e.target.value })} placeholder="Estoque" style={{ ...s.inp, width: 80 }} />}
          {novo.categoria === 'fardamento' && <input type="number" value={novo.preco} onChange={e => setNovo({ ...novo, preco: e.target.value })} placeholder="Preço" style={{ ...s.inp, width: 80 }} />}
          <button onClick={criar} style={s.btn}>Add</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <label style={{ ...s.chipS, cursor: 'pointer' }}>📷 Foto do produto<input type="file" accept="image/*" onChange={async e => { const f = e.target.files[0]; if (f) setNovo({ ...novo, imagem: await lerImg(f) }); }} style={{ display: 'none' }} /></label>
          {novo.imagem && <><img src={novo.imagem} alt="" style={{ height: 40, borderRadius: 6 }} /><button onClick={() => setNovo({ ...novo, imagem: null })} style={sBtn('#f3f3f3', '#993C1D')}>✕</button></>}
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#555', marginTop: 8 }}>
          <input type="checkbox" checked={novo.tem_variacoes} onChange={e => setNovo({ ...novo, tem_variacoes: e.target.checked, variacoes: e.target.checked && !novo.variacoes.length ? [{ nome: '', estoque: '' }] : novo.variacoes })} />
          Tem variações (tamanho/cor) — ex.: P, M, G, GG
        </label>
        {novo.tem_variacoes && (
          <div style={{ marginTop: 8, background: '#FAFAFB', borderRadius: 8, padding: 8 }}>
            {novo.variacoes.map((v, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input value={v.nome} onChange={e => setVar(i, 'nome', e.target.value)} placeholder="Variação (ex.: GG)" style={{ ...s.inp, flex: 1 }} />
                <input type="number" value={v.estoque} onChange={e => setVar(i, 'estoque', e.target.value)} placeholder="Estoque" style={{ ...s.inp, width: 90 }} />
                <button onClick={() => rmVar(i)} style={sBtn('#f3f3f3', '#993C1D')}>✕</button>
              </div>
            ))}
            <button onClick={addVar} style={{ ...s.chipS, borderStyle: 'dashed' }}>+ variação</button>
          </div>
        )}
        {(novo.categoria === 'brinde' || novo.categoria === 'fardamento') && (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#555', marginTop: 8 }}>
            <input type="checkbox" checked={novo.resgatavel} onChange={e => setNovo({ ...novo, resgatavel: e.target.checked })} />
            Disponível na loja de pontos por
            <input type="number" disabled={!novo.resgatavel} value={novo.pontos} onChange={e => setNovo({ ...novo, pontos: e.target.value })} placeholder="pontos" style={{ ...s.inp, width: 80 }} /> pontos
          </label>
        )}
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Estoque atual</div>
        {prod.map(p => <EstoqueLinha key={p.id} API={API} p={p} onChange={carregar} />)}
      </div>
    </div>
  );
}

function EstoqueLinha({ API, p, onChange }) {
  const [nv, setNv] = useState({ nome: '', estoque: '' });
  const [add, setAdd] = useState(false);
  const temVar = p.variacoes && p.variacoes.length > 0;
  const ajustar = (vid, delta) => API.post(`/mercado/variacoes/${vid}/ajuste`, { quantidade: delta }).then(onChange);
  const criarVar = () => { if (!nv.nome.trim()) return; API.post(`/mercado/produtos/${p.id}/variacoes`, nv).then(() => { setNv({ nome: '', estoque: '' }); setAdd(false); onChange(); }); };
  const salvarResg = (resgatavel, pontos) => API.patch(`/mercado/produtos/${p.id}`, { resgatavel, pontos: Number(pontos) || 0 }).then(onChange);
  const salvarFoto = async (file) => { if (!file) return; const img = await lerImg(file); API.patch(`/mercado/produtos/${p.id}`, { imagem: img }).then(onChange); };
  return (
    <div style={{ padding: '6px 0', borderTop: '1px solid #f4f4f4' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          {ehImg(p.imagem) && <img src={p.imagem} alt="" style={{ width: 26, height: 26, borderRadius: 5, objectFit: 'cover' }} />}
          <span>{CAT[p.categoria]?.slice(0, 2)} {p.nome}{p.fornecedor ? <span style={{ color: '#aaa' }}> · {p.fornecedor}</span> : ''}{p.resgatavel ? <span style={{ color: '#7A5AA8' }}> · 🏅{p.pontos}pts</span> : ''}</span>
        </span>
        <label style={{ ...s.linkMini, cursor: 'pointer' }}>📷<input type="file" accept="image/*" onChange={e => salvarFoto(e.target.files[0])} style={{ display: 'none' }} /></label>
        <span style={{ color: p.estoque > 0 ? '#333' : '#993C1D' }}>{p.estoque} un · custo {brl(p.custo)}</span>
      </div>
      {temVar && (
        <div style={{ marginLeft: 16, marginTop: 4 }}>
          {p.variacoes.map(v => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#555', padding: '2px 0' }}>
              <span style={{ flex: 1 }}>▪ {v.nome}</span>
              <button onClick={() => ajustar(v.id, -1)} style={s.stepMini}>−</button>
              <span style={{ width: 34, textAlign: 'center', color: v.estoque > 0 ? '#333' : '#993C1D', fontWeight: 600 }}>{v.estoque}</span>
              <button onClick={() => ajustar(v.id, 1)} style={s.stepMini}>+</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginLeft: 16, marginTop: 2 }}>
        {add ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
            <input value={nv.nome} onChange={e => setNv({ ...nv, nome: e.target.value })} placeholder="Variação (ex.: GG)" style={{ ...s.inp, fontSize: 11, padding: '4px 6px' }} />
            <input type="number" value={nv.estoque} onChange={e => setNv({ ...nv, estoque: e.target.value })} placeholder="Estoque" style={{ ...s.inp, fontSize: 11, padding: '4px 6px', width: 70 }} />
            <button onClick={criarVar} style={sBtn('#185FA5')}>ok</button>
            <button onClick={() => setAdd(false)} style={sBtn('#f3f3f3', '#666')}>✕</button>
          </div>
        ) : (
          <button onClick={() => setAdd(true)} style={{ ...s.linkMini }}>+ variação</button>
        )}
      </div>
      {p.categoria === 'fardamento' && (
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: '#7A5AA8', marginLeft: 16, marginTop: 4 }}>
          <input type="checkbox" checked={!!p.resgatavel} onChange={e => salvarResg(e.target.checked, p.pontos)} />
          🏅 Resgatável por
          <input type="number" defaultValue={p.pontos || ''} onBlur={e => salvarResg(p.resgatavel, e.target.value)} placeholder="pts" style={{ ...s.inp, width: 64, fontSize: 11, padding: '3px 5px' }} /> pontos
        </label>
      )}
    </div>
  );
}

function Brindes({ API }) {
  const [prod, setProd] = useState([]);
  const [sai, setSai] = useState({});
  const carregar = useCallback(() => API.get('/mercado/produtos', { params: { categoria: 'brinde' } }).then(r => setProd(r.data.produtos || [])).catch(() => setProd([])), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  async function saida(p) {
    const v = sai[p.id] || {}; if (!(v.q > 0)) return;
    if (p.variacoes && p.variacoes.length && !v.variacao_id) { alert('Escolha a variação do brinde.'); return; }
    await API.post('/mercado/brindes/saida', { produto_id: p.id, quantidade: v.q, destino: v.destino, variacao_id: v.variacao_id }); setSai({ ...sai, [p.id]: {} }); carregar();
  }
  async function salvarPontos(p, resgatavel, pontos) { await API.patch(`/mercado/produtos/${p.id}`, { resgatavel, pontos: Number(pontos) || 0 }); carregar(); }
  return (
    <div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Controle de brindes recebidos (entrada por NF na aba Estoque) e saídas. Marque “loja de pontos” para o colaborador poder resgatar com os pontos da gamificação. Gerentes não têm acesso a esta aba.</div>
      {prod.length === 0 && <div style={s.card}>Nenhum brinde no estoque. Importe uma NF com categoria “Brindes”.</div>}
      {prod.map(p => (
        <div key={p.id} style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>🎁 {p.nome}{p.variacoes && p.variacoes.length ? <span style={{ fontSize: 11, color: '#999', fontWeight: 400 }}> · {p.variacoes.length} variações</span> : ''}</div>
            <div style={{ fontSize: 12, color: p.estoque > 0 ? '#3B6D11' : '#993C1D' }}>{p.estoque} em estoque</div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {p.variacoes && p.variacoes.length > 0 && (
              <select value={sai[p.id]?.variacao_id || ''} onChange={e => setSai({ ...sai, [p.id]: { ...sai[p.id], variacao_id: e.target.value } })} style={s.inp}>
                <option value="">Variação…</option>
                {p.variacoes.map(v => <option key={v.id} value={v.id}>{v.nome} ({v.estoque})</option>)}
              </select>
            )}
            <input type="number" placeholder="Qtd" value={sai[p.id]?.q || ''} onChange={e => setSai({ ...sai, [p.id]: { ...sai[p.id], q: parseInt(e.target.value) || 0 } })} style={{ ...s.inp, width: 70 }} />
            <input placeholder="Destino (loja/pessoa/campanha)" value={sai[p.id]?.destino || ''} onChange={e => setSai({ ...sai, [p.id]: { ...sai[p.id], destino: e.target.value } })} style={{ ...s.inp, flex: 1, minWidth: 160 }} />
            <button onClick={() => saida(p)} style={sBtn('#185FA5')}>Registrar saída</button>
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#7A5AA8', marginTop: 8, background: '#F6F2FB', padding: '6px 8px', borderRadius: 8 }}>
            <input type="checkbox" checked={!!p.resgatavel} onChange={e => salvarPontos(p, e.target.checked, p.pontos)} />
            🏅 Loja de pontos —
            <input type="number" value={p.pontos || ''} onBlur={e => salvarPontos(p, p.resgatavel, e.target.value)} onChange={e => { p.pontos = e.target.value; setSai({ ...sai }); }} placeholder="pontos" style={{ ...s.inp, width: 80 }} /> pontos p/ resgatar
          </label>
        </div>
      ))}
    </div>
  );
}

function Custos({ API }) {
  const [d, setD] = useState(null);
  useEffect(() => { API.get('/mercado/custos').then(r => setD(r.data)).catch(() => setD(null)); }, [API]);
  if (!d) return <div style={s.card}>Carregando…</div>;
  return (
    <div>
      <div style={{ ...s.card, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#999' }}>Custo total do mês ({String(d.mes).padStart(2, '0')}/{d.ano})</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#185FA5' }}>{brl(d.total_geral)}</div>
      </div>
      {d.lojas.length === 0 && <div style={s.card}>Nenhuma saída registrada no mês.</div>}
      {d.lojas.map(l => (
        <div key={l.loja} style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}><span>{l.loja}</span><span style={{ color: '#185FA5' }}>{brl(l.total)}</span></div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{Object.entries(l.categorias).map(([c, v]) => `${CAT[c]?.split(' ')[1] || c}: ${brl(v)}`).join(' · ')}</div>
        </div>
      ))}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 12 },
  chip: { fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipS: { fontSize: 12, padding: '5px 10px', borderRadius: 16, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnAdd: { fontSize: 13, padding: '8px 12px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, width: '100%' },
  stepBtn: { width: 30, height: 30, borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: '#333' },
  stepMini: { width: 22, height: 22, borderRadius: 5, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1, color: '#333' },
  linkMini: { background: 'none', border: 'none', color: '#185FA5', fontSize: 11, cursor: 'pointer', padding: '2px 0' },
  filtroBox: { background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 8, marginBottom: 10 },
  filtroTit: { fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: .4, padding: '2px 8px 6px' },
  tag: { fontSize: 9, fontWeight: 700, color: '#185FA5', background: '#E4EEF8', padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: .3 },
};
const sBtn = (bg, c) => ({ fontSize: 12, padding: '6px 11px', background: bg, color: c || '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 });
