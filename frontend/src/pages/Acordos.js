import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
const COLS = [
  { id: 'novo', nome: 'Novo', cor: '#2E5C9E' }, { id: 'negociacao', nome: 'Negociação', cor: '#D6409F' },
  { id: 'vigente', nome: 'Vigente', cor: '#1E874B' }, { id: 'concluido', nome: 'Concluído', cor: '#555' },
];
const DIMS = [['fornecedor', '🏢 Fornecedor'], ['fabricante', '🏭 Fabricante'], ['grupo_preco', '🏷️ Grupo de Preço'], ['grupo_pai', '📁 Grupo Produto Pai'], ['grupo_filho', '📂 Grupo Produto Filho'], ['produtos', '📦 Produtos']];
const tempoStatus = desde => { if (!desde) return ''; const ms = Date.now() - new Date(desde + 'Z').getTime(); const h = Math.floor(ms / 3.6e6); return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d ${h % 24}h`; };

function SignaturePad({ onChange }) {
  const ref = useRef(null); const draw = useRef(false);
  const pos = e => { const c = ref.current, r = c.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) }; };
  const start = e => { e.preventDefault(); draw.current = true; const ctx = ref.current.getContext('2d'); const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = e => { if (!draw.current) return; const ctx = ref.current.getContext('2d'); const p = pos(e); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111'; ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { if (draw.current) { draw.current = false; onChange(ref.current.toDataURL()); } };
  return <div><canvas ref={ref} width={400} height={110} style={{ width: '100%', height: 110, border: '1px dashed #ccc', borderRadius: 8, touchAction: 'none', background: '#fff' }} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end} /><button type="button" onClick={() => { ref.current.getContext('2d').clearRect(0, 0, 400, 110); onChange(''); }} style={s.mv}>limpar</button></div>;
}

function gerarContrato(API, id) {
  API.get(`/acordos/${id}/contrato`).then(r => {
    const w = window.open('', '_blank');
    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    w.document.write(`<html><head><title>Contrato ${esc(r.data.codigo || '')}</title></head>
      <body style="font-family:Georgia,serif;max-width:760px;margin:24px auto;padding:0 20px;color:#222;line-height:1.5">
      <div style="text-align:right;margin-bottom:8px"><button onclick="navigator.clipboard.writeText(document.getElementById('c').innerText)" style="padding:6px 12px;cursor:pointer">📋 Copiar</button>
      <button onclick="window.print()" style="padding:6px 12px;cursor:pointer">🖨️ Imprimir/PDF</button></div>
      <pre id="c" style="white-space:pre-wrap;font-family:Georgia,serif;font-size:14px">${esc(r.data.texto)}</pre>
      </body></html>`);
    w.document.close();
  }).catch(e => alert('Não foi possível gerar o contrato: ' + (e.response?.data?.erro || e.message)));
}

export default function Acordos() {
  const { API, usuario } = useAuth();
  const gestao = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Comprador Beleza', 'Comprador Bem-estar', 'Marketing'].includes(usuario.funcao);
  const [d, setD] = useState(null); const [busca, setBusca] = useState(''); const [edit, setEdit] = useState(null); const [vista, setVista] = useState('kanban');
  const carregar = useCallback((b = '') => API.get('/acordos', { params: { busca: b || undefined } }).then(r => setD(r.data)).catch(() => setD({ acordos: [] })), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!d) return <div style={s.wrap}>Carregando…</div>;
  const mover = (a, dir) => { const ids = COLS.map(c => c.id); const novo = ids[ids.indexOf(a.status) + dir]; if (novo) API.post(`/acordos/${a.id}/mover`, { status: novo }).then(() => carregar(busca)); };

  return (
    <div style={s.wrap}>
      <Banner emoji="🤝" titulo="Acordos e Negociações" cor="roxo" sub={`${d.acordos.length} acordo(s) · ${brl(d.acordos.reduce((x, a) => x + (a.valor_total || 0), 0))}`}>
        {[['kanban', '🗂️ Kanban'], ['dashboard', '📊 Dashboard']].map(([v, l]) => <button key={v} onClick={() => setVista(v)} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.5)', background: vista === v ? '#fff' : 'rgba(255,255,255,.15)', color: vista === v ? '#43206E' : '#fff', cursor: 'pointer', fontWeight: 600 }}>{l}</button>)}
        {gestao && <button onClick={() => setEdit('novo')} style={{ fontSize: 12.5, padding: '7px 12px', borderRadius: 8, border: 'none', background: '#fff', color: '#43206E', cursor: 'pointer', fontWeight: 700 }}>+ Novo acordo</button>}
      </Banner>
      {vista === 'dashboard' && <DashboardAcordos API={API} onAbrir={setEdit} />}
      {vista === 'kanban' && <>
      <form onSubmit={e => { e.preventDefault(); carregar(busca); }} style={{ display: 'flex', gap: 6, margin: '8px 0 14px' }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔎 Buscar fornecedor, código, comprador…" style={{ ...s.inp, flex: 1, maxWidth: 420 }} /><button style={s.btnMini}>Buscar</button>
      </form>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
        {COLS.map(col => {
          const itens = d.acordos.filter(a => a.status === col.id);
          return (
            <div key={col.id} style={{ minWidth: 260, flex: '1 1 260px', maxHeight: 'calc(100vh - 250px)', minHeight: 240, overflowY: 'auto', overflowX: 'hidden' }}>
              <div style={{ ...s.colHead, background: col.cor }}>{col.nome} <span style={s.colN}>{itens.length}</span></div>
              <div style={s.colBody}>
                {itens.map(a => (
                  <div key={a.id} style={s.cardA}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11.5, fontWeight: 700, color: col.cor }}>📄 {a.codigo}</span>{a.tipo && <span style={s.tag}>{a.tipo}</span>}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4 }}>{a.fornecedor_nome}</div>
                    {a.comprador_nome && <div style={{ fontSize: 11.5, color: '#666' }}>👤 {a.comprador_nome}</div>}
                    <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>🕐 {tempoStatus(a.status_desde)} · {a.condicoes} cond.</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E874B', marginTop: 4 }}>{brl(a.valor_total)}</div>
                    {gestao && <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      <button onClick={() => mover(a, -1)} disabled={a.status === COLS[0].id} style={s.mv}>◀</button>
                      <button onClick={() => setEdit(a.id)} style={{ ...s.mv, flex: 1 }}>Abrir</button>
                      <button onClick={() => mover(a, 1)} disabled={a.status === 'concluido'} style={s.mv}>▶</button>
                    </div>}
                  </div>
                ))}
                {itens.length === 0 && <div style={{ fontSize: 12, color: '#bbb', textAlign: 'center', padding: 18 }}>—</div>}
              </div>
            </div>
          );
        })}
      </div>
      </>}
      {edit && <EditorAcordo API={API} idInicial={edit === 'novo' ? null : edit} onClose={() => setEdit(null)} onSaved={() => carregar(busca)} />}
    </div>
  );
}

// 📊 Dashboard de TODOS os acordos
function DashboardAcordos({ API, onAbrir }) {
  const [d, setD] = useState(null);
  useEffect(() => { API.get('/acordos/dashboard').then(r => setD(r.data)).catch(() => setD(false)); }, [API]);
  if (!d) return <div style={{ padding: 20, color: '#888' }}>Carregando dashboard…</div>;
  if (d === false) return <div style={{ padding: 20, color: '#993C1D' }}>Não foi possível carregar.</div>;
  const T = d.totais;
  const maxF = Math.max(1, ...d.porFornecedor.map(f => f.valor));
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <Kpi n={T.acordos} l="Acordos" />
        <Kpi n={T.ativos} l="Ativos" cor="#185FA5" />
        <Kpi n={brl(T.valorContratado)} l="Valor contratado" cor="#1E874B" />
        <Kpi n={brl(T.totalPago)} l="Já pago/recebido" cor="#7A4FB0" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
        <div style={s.dcard}>
          <div style={s.dh}>Por status</div>
          {d.porStatus.filter(x => x.n > 0).map(x => (
            <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderTop: '1px solid #f5f5f5' }}>
              <span>{x.label} <span style={{ color: '#bbb' }}>({x.n})</span></span><b style={{ color: '#1E874B' }}>{brl(x.valor)}</b>
            </div>
          ))}
        </div>
        <div style={s.dcard}>
          <div style={s.dh}>⏰ Vencendo em 30 dias</div>
          {!d.vencendo.length ? <div style={{ fontSize: 12, color: '#1E874B' }}>Nenhum vencendo. 👍</div> :
            d.vencendo.map(v => (
              <div key={v.id} onClick={() => onAbrir(v.id)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderTop: '1px solid #f5f5f5', cursor: 'pointer' }}>
                <span>📄 {v.codigo} <span style={{ color: '#888' }}>{v.fornecedor}</span></span>
                <span style={{ color: '#B7791F', fontWeight: 700 }}>{v.data_fim.split('-').reverse().join('/')}</span>
              </div>
            ))}
        </div>
        <div style={{ ...s.dcard, gridColumn: '1 / -1' }}>
          <div style={s.dh}>🏭 Top fornecedores (por valor)</div>
          {d.porFornecedor.map((f, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '200px 1fr 120px', gap: 8, alignItems: 'center', padding: '3px 0' }}>
              <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome} <span style={{ color: '#bbb' }}>({f.n})</span></span>
              <div style={{ background: '#F1F3F5', borderRadius: 5, height: 10 }}><div style={{ width: (100 * f.valor / maxF) + '%', height: '100%', background: '#2E5C9E', borderRadius: 5 }} /></div>
              <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'right' }}>{brl(f.valor)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function Kpi({ n, l, cor = '#334' }) {
  return <div style={{ background: '#F6F7F9', borderRadius: 12, padding: '12px 16px', minWidth: 130 }}>
    <div style={{ fontSize: 22, fontWeight: 800, color: cor }}>{n}</div><div style={{ fontSize: 11, color: '#777' }}>{l}</div>
  </div>;
}

function EditorAcordo({ API, idInicial, onClose, onSaved }) {
  const [id, setId] = useState(idInicial);
  const [aba, setAba] = useState('basico');
  const [a, setA] = useState({ fornecedor_nome: '', comprador_nome: '', tipo: 'verba', status: 'novo', observacao: '', condicoes: [], lojas: [], pagamentos: [], assinaturas: [], historico: [] });
  const [compradores, setCompradores] = useState([]); const [lojasEmp, setLojasEmp] = useState([]);
  const recarregar = useCallback((aid) => API.get(`/acordos/${aid}`).then(r => setA(r.data.acordo)), [API]);
  useEffect(() => {
    API.get('/acordos/erp/compradores').then(r => setCompradores(r.data.compradores || [])).catch(() => {});
    API.get('/compras/lojas').then(r => setLojasEmp(r.data.lojas || [])).catch(() => {});
    if (id) recarregar(id);
  }, [API, id, recarregar]);
  const set = (k, v) => setA(x => ({ ...x, [k]: v }));
  const salvarBasico = () => {
    if (!a.fornecedor_nome) return;
    if (id) return API.put(`/acordos/${id}`, a).then(() => recarregar(id).then(onSaved));
    return API.post('/acordos', a).then(r => { setId(r.data.id); recarregar(r.data.id); onSaved(); });
  };
  const precisaSalvar = !id;
  const ABAS = [['basico', '📄 Acordo'], ['condicoes', '🤝 Condições'], ['apuracao', '📊 Apuração'], ['pagamentos', '💳 Pagamentos & Assinaturas'], ['historico', '🕐 Histórico']];

  return (
    <div onClick={onClose} style={s.overlay}><div onClick={e => e.stopPropagation()} style={{ ...s.modal, maxWidth: 820 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <b style={{ fontSize: 15 }}>{id ? `Acordo ${a.codigo || ''}` : 'Novo acordo'} {a.status && <span style={s.tag}>{a.status}</span>}</b>
        <div style={{ display: 'flex', gap: 6 }}>
          {id && <button onClick={() => gerarContrato(API, id)} style={s.btnMini} title="Gera o contrato preenchido com os dados do acordo">📄 Gerar contrato</button>}
          <button onClick={onClose} style={s.btnMini}>✕ Fechar</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 8 }}>
        {ABAS.map(([v, l]) => <button key={v} disabled={precisaSalvar && v !== 'basico'} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}), opacity: precisaSalvar && v !== 'basico' ? .4 : 1 }}>{l}{precisaSalvar && v !== 'basico' ? ' (salve 1º)' : ''}</button>)}
      </div>

      {aba === 'basico' && <>
        <TabBasico a={a} set={set} API={API} compradores={compradores} salvar={salvarBasico} />
        {id && <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🏬 Lojas participantes</div>
          <TabLojas API={API} id={id} a={a} lojas={lojasEmp} reload={() => recarregar(id)} />
        </div>}
      </>}
      {aba === 'condicoes' && id && <TabCondicoes API={API} id={id} a={a} reload={() => recarregar(id)} />}
      {aba === 'apuracao' && id && <TabApuracao API={API} id={id} />}
      {aba === 'pagamentos' && id && <>
        <TabPagamentos API={API} id={id} a={a} reload={() => recarregar(id)} />
        <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>✍️ Assinaturas</div>
          <TabAssinaturas API={API} id={id} a={a} reload={() => recarregar(id)} />
        </div>
      </>}
      {aba === 'historico' && id && <div>{(a.historico || []).length === 0 && <div style={s.vazio}>Sem histórico.</div>}{(a.historico || []).map((h, i) => <div key={i} style={{ fontSize: 12.5, padding: '5px 0', borderTop: i ? '1px solid #f2f2f2' : 'none' }}>🔀 {h.de_status || '—'} → <b>{h.para_status}</b> · {h.colaborador_nome} · {new Date(h.criado_em + 'Z').toLocaleString('pt-BR')}</div>)}</div>}
    </div></div>
  );
}

function TabBasico({ a, set, API, compradores, salvar }) {
  const [buscaForn, setBuscaForn] = useState(''); const [forns, setForns] = useState([]);
  const buscar = q => { setBuscaForn(q); set('fornecedor_nome', q); if (q.length >= 2) API.get('/acordos/erp/fornecedores', { params: { q } }).then(r => setForns(r.data.fornecedores || [])).catch(() => {}); };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ ...s.lbl, flex: 1, minWidth: 200 }}>Fornecedor *
          {a.fornecedor_id
            ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '6px 10px', background: '#F3F7F4', border: '1px solid #DDEBE1', borderRadius: 8 }}>✅ <b>{a.fornecedor_nome}</b><button type="button" onClick={() => { set('fornecedor_id', ''); set('fornecedor_nome', ''); setBuscaForn(''); setForns([]); }} style={{ ...s.mv, marginLeft: 'auto' }}>trocar</button></div>
            : <div style={{ position: 'relative' }}>
              <input value={buscaForn} onChange={e => buscar(e.target.value)} placeholder="buscar fornecedor no ERP…" style={{ ...s.inp, width: '100%' }} />
              {buscaForn.length >= 2 && forns.length > 0 && <div style={{ position: 'absolute', zIndex: 6, background: '#fff', border: '1px solid #eee', borderRadius: 8, maxHeight: 160, overflowY: 'auto', width: '100%', boxShadow: '0 6px 18px rgba(0,0,0,.12)' }}>{forns.map(f => <div key={f.id} onMouseDown={() => { set('fornecedor_id', f.id); set('fornecedor_nome', f.nome); setForns([]); setBuscaForn(''); }} style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}>{f.nome}</div>)}</div>}
            </div>}
        </div>
        <label style={{ ...s.lbl, flex: 1, minWidth: 160 }}>Funcionário responsável
          <select value={a.comprador_id || ''} onChange={e => { const c = compradores.find(x => x.id === e.target.value); set('comprador_id', e.target.value); set('comprador_nome', c ? c.nome : ''); }} style={s.inp}><option value="">—</option>{compradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={s.lbl}>Status<select value={a.status || 'novo'} onChange={e => set('status', e.target.value)} style={s.inp}>{COLS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}<option value="cancelado">Cancelado</option></select></label>
        <label style={s.lbl}>Tipo<select value={a.tipo || 'verba'} onChange={e => set('tipo', e.target.value)} style={s.inp}>{['verba', 'bonificacao', 'desconto', 'rebate', 'acao', 'outro'].map(t => <option key={t} value={t}>{t}</option>)}</select></label>
        <label style={s.lbl}>Apuração<select value={a.apuracao || ''} onChange={e => set('apuracao', e.target.value)} style={s.inp}><option value="">—</option><option>Data de Emissão</option><option>Data de Entrada</option><option>Data de Venda</option></select></label>
        <label style={{ ...s.lbl, flex: 1, minWidth: 160 }}>URL do contrato assinado<input value={a.url_contrato || ''} onChange={e => set('url_contrato', e.target.value)} placeholder="cole a URL" style={s.inp} /></label>
      </div>
      <textarea value={a.observacao || ''} onChange={e => set('observacao', e.target.value)} placeholder="Observações (máx 1000)" maxLength={1000} style={{ ...s.inp, minHeight: 60, resize: 'vertical' }} />
      <button onClick={salvar} style={s.btn}>💾 Salvar acordo</button>
    </div>
  );
}

// Busca no ERP conforme a dimensão escolhida (fornecedor/fabricante/classificação/produto).
function BuscaERP({ API, dim, onPick, placeholder }) {
  const [q, setQ] = useState(''); const [itens, setItens] = useState([]); const [open, setOpen] = useState(false);
  const buscar = v => { setQ(v); setOpen(true); if (v.length >= 2) API.get('/acordos/erp/buscar', { params: { dim, q: v } }).then(r => setItens(r.data.itens || [])).catch(() => setItens([])); else setItens([]); };
  return (
    <div style={{ position: 'relative' }}>
      <input value={q} onChange={e => buscar(e.target.value)} placeholder={placeholder || 'buscar no ERP…'} style={{ ...s.inp, width: '100%' }} />
      {open && q.length >= 2 && itens.length > 0 && <div style={{ position: 'absolute', zIndex: 5, background: '#fff', border: '1px solid #eee', borderRadius: 8, maxHeight: 180, overflowY: 'auto', width: '100%', boxShadow: '0 6px 18px rgba(0,0,0,.12)' }}>{itens.map(it => <div key={it.id + (it.ean || '')} onClick={() => { onPick(it); setQ(''); setItens([]); setOpen(false); }} style={{ padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}>{it.nome}{it.ean ? <span style={{ color: '#999' }}> · {it.ean}</span> : ''}</div>)}</div>}
    </div>
  );
}

const VAZIO_COND = { dimensao: 'fornecedor', alvo_id: '', alvo_nome: '', estrategia: 'global', apuracao: 'Data de Entrada', periodo: 'global', meta_global: '', meta_mensal: '', periodo_ini: '', periodo_fim: '', descricao: '', valor: '', percentual: '', comissao_unitaria: '', escopo: '', excecoes: '' };

function TabCondicoes({ API, id, a, reload }) {
  const [c, setC] = useState(VAZIO_COND);
  const set = (k, v) => setC(x => ({ ...x, [k]: v }));
  const ehProduto = c.dimensao === 'produtos';
  const add = () => API.post(`/acordos/${id}/condicoes`, {
    ...c, tipo: c.dimensao,
    escopo: c.escopo ? c.escopo.split(/[\s,;\n]+/).filter(Boolean) : null,
    excecoes: c.excecoes ? c.excecoes.split(/[\s,;\n]+/).filter(Boolean) : null,
  }).then(() => { setC(VAZIO_COND); reload(); });
  // upload de arquivo (csv/txt) → extrai códigos de barras para escopo ou exceções
  const upload = campo => e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { const eans = (String(rd.result).match(/\d{6,14}/g) || []); setC(x => ({ ...x, [campo]: (x[campo] ? x[campo] + '\n' : '') + eans.join('\n') })); }; rd.readAsText(f); };
  const addEan = it => set('escopo', (c.escopo ? c.escopo + '\n' : '') + (it.ean || it.id));

  return (
    <div>
      <div style={{ display: 'grid', gap: 10, border: '1px solid #eee', borderRadius: 10, padding: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Nova condição</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={s.lbl}>Dimensão<select value={c.dimensao} onChange={e => set('dimensao', e.target.value)} style={s.inp}>{DIMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label style={s.lbl}>Estratégia<select value={c.estrategia} onChange={e => set('estrategia', e.target.value)} style={s.inp}><option value="global">Global (% em tudo)</option><option value="restricao">Restrição (só o escopo)</option></select></label>
          <label style={s.lbl}>% Retorno<input type="number" value={c.percentual} onChange={e => set('percentual', e.target.value)} style={{ ...s.inp, width: 90 }} /></label>
          <label style={s.lbl}>Comissão unit.<input type="number" value={c.comissao_unitaria} onChange={e => set('comissao_unitaria', e.target.value)} style={{ ...s.inp, width: 100 }} /></label>
        </div>

        {/* Alvo buscado no ERP (para dimensões que não são "produtos") */}
        {!ehProduto && <div>
          <div style={s.lbl}>Alvo ({DIMS.find(d => d[0] === c.dimensao)?.[1]}) — buscar no sistema</div>
          {c.alvo_nome
            ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '6px 10px', background: '#F3F7F4', border: '1px solid #DDEBE1', borderRadius: 8 }}>✅ <b>{c.alvo_nome}</b><button onClick={() => { set('alvo_id', ''); set('alvo_nome', ''); }} style={{ ...s.mv, marginLeft: 'auto' }}>trocar</button></div>
            : <BuscaERP API={API} dim={c.dimensao} onPick={it => { set('alvo_id', it.id); set('alvo_nome', it.nome); }} placeholder={`buscar ${DIMS.find(d => d[0] === c.dimensao)?.[1]}…`} />}
        </div>}

        {/* Apuração / metas */}
        <div style={{ border: '1px dashed #e2e2e2', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6 }}>📐 Apuração das compras</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={s.lbl}>Apurar por<select value={c.apuracao} onChange={e => set('apuracao', e.target.value)} style={s.inp}><option>Data de Entrada</option><option>Data de Emissão</option><option>Data de Venda</option></select></label>
            <label style={s.lbl}>Período<select value={c.periodo} onChange={e => set('periodo', e.target.value)} style={s.inp}><option value="global">Global no período</option><option value="mensal">Mensal (meta por mês)</option></select></label>
            <label style={s.lbl}>De<input type="date" value={c.periodo_ini} onChange={e => set('periodo_ini', e.target.value)} style={s.inp} /></label>
            <label style={s.lbl}>Até<input type="date" value={c.periodo_fim} onChange={e => set('periodo_fim', e.target.value)} style={s.inp} /></label>
            <label style={s.lbl}>Meta global R$<input type="number" value={c.meta_global} onChange={e => set('meta_global', e.target.value)} placeholder="ex.: 500000" style={{ ...s.inp, width: 120 }} /></label>
            {c.periodo === 'mensal' && <label style={s.lbl}>Meta mensal R$<input type="number" value={c.meta_mensal} onChange={e => set('meta_mensal', e.target.value)} placeholder="ex.: 30000" style={{ ...s.inp, width: 120 }} /></label>}
            <label style={s.lbl}>Verba R$<input type="number" value={c.valor} onChange={e => set('valor', e.target.value)} style={{ ...s.inp, width: 110 }} /></label>
          </div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Ex.: contrato global de R$500.000 no período com % sobre compras; ou meta de R$30.000/mês dentro do global.</div>
        </div>

        {/* Escopo (produtos) */}
        {ehProduto && <div>
          <div style={s.lbl}>Produtos do escopo — busque para adicionar o EAN, ou cole/suba a lista</div>
          <BuscaERP API={API} dim="produtos" onPick={addEan} placeholder="buscar produto por nome ou código de barras…" />
          <textarea value={c.escopo} onChange={e => set('escopo', e.target.value)} placeholder="7891234567890, 7899876543210…" style={{ ...s.inp, width: '100%', minHeight: 44, resize: 'vertical', marginTop: 6 }} />
          <label style={{ ...s.btnMini, display: 'inline-block', cursor: 'pointer' }}>📎 Subir lista (.csv/.txt)<input type="file" accept=".csv,.txt" onChange={upload('escopo')} style={{ display: 'none' }} /></label>
        </div>}

        {/* Exceções ("exceto") — vale para grupos/fabricante */}
        <div>
          <div style={s.lbl}>⛔ Exceto — códigos de barras que NÃO entram (ex.: "todo o grupo, exceto estes itens")</div>
          <textarea value={c.excecoes} onChange={e => set('excecoes', e.target.value)} placeholder="EANs a excluir, separados por espaço/vírgula/linha" style={{ ...s.inp, width: '100%', minHeight: 40, resize: 'vertical' }} />
          <label style={{ ...s.btnMini, display: 'inline-block', cursor: 'pointer' }}>📎 Subir lista de exceções (.csv/.txt)<input type="file" accept=".csv,.txt" onChange={upload('excecoes')} style={{ display: 'none' }} /></label>
        </div>

        <input value={c.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Descrição da condição (opcional)" style={s.inp} />
        <button onClick={add} style={s.btn}>+ Adicionar condição</button>
      </div>

      {(a.condicoes || []).length === 0 && <div style={s.vazio}>Nenhuma condição.</div>}
      {(a.condicoes || []).map(x => {
        const exc = x.excecoes ? (() => { try { return JSON.parse(x.excecoes).length; } catch { return 0; } })() : 0;
        const esc = x.escopo ? (() => { try { return JSON.parse(x.escopo).length; } catch { return 0; } })() : 0;
        return (
          <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 12.5, padding: '7px 0', borderTop: '1px solid #f2f2f2' }}>
            <span>
              <b>{DIMS.find(d => d[0] === (x.dimensao || x.tipo))?.[1] || x.dimensao || x.tipo}</b>
              {x.alvo_nome ? ` · ${x.alvo_nome}` : ''} {x.estrategia === 'restricao' ? '· restrição' : '· global'}
              {x.percentual ? ` · ${x.percentual}%` : ''}{x.valor ? ` · ${brl(x.valor)}` : ''}
              {x.periodo === 'mensal' ? ` · meta ${brl(x.meta_mensal)}/mês` : (x.meta_global ? ` · meta ${brl(x.meta_global)} no período` : '')}
              {(x.periodo_ini || x.periodo_fim) ? ` · ${dBR(x.periodo_ini)}–${dBR(x.periodo_fim)}` : ''}
              {x.apuracao ? ` · apura por ${x.apuracao}` : ''}
              {esc ? ` · ${esc} itens` : ''}{exc ? ` · exceto ${exc}` : ''}
              {x.descricao ? <span style={{ color: '#888' }}> — {x.descricao}</span> : ''}
            </span>
            <button onClick={() => API.delete(`/acordos/${id}/condicoes/${x.id}`).then(reload)} style={s.mv}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

function TabLojas({ API, id, a, lojas, reload }) {
  const jaTem = new Set((a.lojas || []).map(l => l.loja_id));
  const add = l => API.post(`/acordos/${id}/lojas`, { loja_id: l.id, loja_nome: l.nome }).then(reload);
  return (
    <div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Lojas participantes do acordo:</div>
      {(a.lojas || []).map(l => <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderTop: '1px solid #f2f2f2' }}><span>🏬 {l.loja_nome}</span><button onClick={() => API.delete(`/acordos/${id}/lojas/${l.id}`).then(reload)} style={s.mv}>✕</button></div>)}
      <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {lojas.filter(l => !jaTem.has(l.id)).map(l => <button key={l.id} onClick={() => add(l)} style={s.btnMini}>+ {l.nome}</button>)}
      </div>
    </div>
  );
}

function TabPagamentos({ API, id, a, reload }) {
  const VZ = { forma: '', data_vencimento: '', data_pagamento: '', valor: '', valor_credito: '', nf_ref: '', anexo_url: '' };
  const [p, setP] = useState(VZ);
  const [msg, setMsg] = useState('');
  const [nfNum, setNfNum] = useState(''); const [nfs, setNfs] = useState([]);
  const [boletoQ, setBoletoQ] = useState(''); const [boletos, setBoletos] = useState([]);
  const set = (k, v) => setP(x => ({ ...x, [k]: v }));
  const ehBrinde = p.forma === 'Brinde'; const ehBoleto = p.forma === 'Desconto em boleto'; const ehDeposito = p.forma === 'Depósito';
  const add = () => API.post(`/acordos/${id}/pagamentos`, p).then(r => { setMsg(r.data.tarefa ? '✅ Pagamento salvo — tarefa gerada automaticamente.' : '✅ Pagamento salvo.'); setP(VZ); setNfs([]); setBoletos([]); setNfNum(''); setBoletoQ(''); reload(); });
  const buscarNf = () => { if (!nfNum) return; API.get('/acordos/erp/nf', { params: { numero: nfNum } }).then(r => setNfs(r.data.nfs || [])).catch(() => setNfs([])); };
  const buscarBoletos = () => { if (!a.fornecedor_id) { setMsg('⚠️ O acordo precisa ter fornecedor do ERP para buscar boletos.'); return; } API.get('/acordos/erp/boletos', { params: { fornecedor_id: a.fornecedor_id, q: boletoQ || undefined } }).then(r => setBoletos(r.data.boletos || [])).catch(() => setBoletos([])); };
  return (
    <div>
      <div style={{ display: 'grid', gap: 8, border: '1px solid #eee', borderRadius: 10, padding: 12, marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={s.lbl}>Forma<select value={p.forma} onChange={e => set('forma', e.target.value)} style={s.inp}><option value="">—</option>{['Boleto', 'Desconto em boleto', 'Depósito', 'Crédito em NF', 'Bonificação', 'Brinde', 'Cartão'].map(f => <option key={f}>{f}</option>)}</select></label>
          <label style={s.lbl}>Vencimento<input type="date" value={p.data_vencimento} onChange={e => set('data_vencimento', e.target.value)} style={s.inp} /></label>
          <label style={s.lbl}>Pagamento<input type="date" value={p.data_pagamento} onChange={e => set('data_pagamento', e.target.value)} style={s.inp} /></label>
          <label style={s.lbl}>Valor<input type="number" value={p.valor} onChange={e => set('valor', e.target.value)} style={{ ...s.inp, width: 100 }} /></label>
          <label style={s.lbl}>Crédito<input type="number" value={p.valor_credito} onChange={e => set('valor_credito', e.target.value)} style={{ ...s.inp, width: 90 }} /></label>
          <label style={s.lbl}>NF/Doc ref.<input value={p.nf_ref} onChange={e => set('nf_ref', e.target.value)} style={{ ...s.inp, width: 110 }} /></label>
        </div>

        {/* Brinde → buscar a NF onde vieram os brindes */}
        {ehBrinde && <div style={{ border: '1px dashed #E0D2EC', borderRadius: 8, padding: 10, background: '#FBF8FE' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7A4FB0', marginBottom: 6 }}>🎁 NF dos brindes (busca no ERP)</div>
          <div style={{ display: 'flex', gap: 6 }}><input value={nfNum} onChange={e => setNfNum(e.target.value)} placeholder="nº da NF" style={{ ...s.inp, flex: 1 }} /><button type="button" onClick={buscarNf} style={s.btnMini}>Buscar</button></div>
          {nfs.map(n => <div key={n.id} onClick={() => { set('nf_ref', String(n.numero)); setNfs([]); }} style={{ padding: '6px 8px', fontSize: 12.5, cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}>NF {n.numero} · {n.fornecedor || '—'}</div>)}
          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Ao salvar, gera tarefa para lançar o brinde no controle (Meu Mercado).</div>
        </div>}

        {/* Desconto em boleto → buscar boleto do fornecedor no ERP */}
        {ehBoleto && <div style={{ border: '1px dashed #CFE0F5', borderRadius: 8, padding: 10, background: '#F6FAFF' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#2E5C9E', marginBottom: 6 }}>🧾 Boleto do fornecedor (contas a pagar em aberto no ERP)</div>
          <div style={{ display: 'flex', gap: 6 }}><input value={boletoQ} onChange={e => setBoletoQ(e.target.value)} placeholder="nº do documento (opcional)" style={{ ...s.inp, flex: 1 }} /><button type="button" onClick={buscarBoletos} style={s.btnMini}>Buscar</button></div>
          {boletos.map(bo => <div key={bo.id} onClick={() => { set('nf_ref', bo.doc || bo.id); set('valor', bo.valor); setBoletos([]); }} style={{ padding: '6px 8px', fontSize: 12.5, cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}>Doc {bo.doc || bo.id} · venc {dBR(bo.venc)} · {brl(bo.valor)}</div>)}
        </div>}

        {ehDeposito && <div style={{ fontSize: 11.5, color: '#8A6D3B', background: '#FCF7EA', border: '1px solid #F0E0BE', borderRadius: 8, padding: '6px 10px' }}>💰 Ao salvar, o sistema abre automaticamente uma <b>tarefa para o Financeiro</b> efetuar o depósito.</div>}

        <input value={p.anexo_url} onChange={e => set('anexo_url', e.target.value)} placeholder="URL do comprovante (anexo)" style={s.inp} />
        {msg && <div style={{ fontSize: 12.5, color: msg[0] === '✅' ? '#1E874B' : '#B7791F' }}>{msg}</div>}
        <button onClick={add} style={s.btn}>+ Adicionar pagamento</button>
      </div>
      {(a.pagamentos || []).length === 0 && <div style={s.vazio}>Nenhum pagamento.</div>}
      {(a.pagamentos || []).map(x => (
        <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '6px 0', borderTop: '1px solid #f2f2f2' }}>
          <span><span style={{ ...s.tag, background: x.status === 'pago' ? '#E7F5EC' : '#FCF3E2', color: x.status === 'pago' ? '#1E874B' : '#B7791F' }}>{x.status}</span> {x.forma || ''} · venc {dBR(x.data_vencimento)} {x.data_pagamento ? '· pago ' + dBR(x.data_pagamento) : ''} · {brl(x.valor)}{x.nf_ref ? ' · NF ' + x.nf_ref : ''}</span>
          <button onClick={() => API.delete(`/acordos/${id}/pagamentos/${x.id}`).then(reload)} style={s.mv}>✕</button>
        </div>
      ))}
    </div>
  );
}

function TabAssinaturas({ API, id, a, reload }) {
  const [nome, setNome] = useState(''); const [papel, setPapel] = useState(''); const [assin, setAssin] = useState('');
  const add = () => { if (!nome) return; API.post(`/acordos/${id}/assinaturas`, { nome, papel, assinatura: assin }).then(() => { setNome(''); setPapel(''); setAssin(''); reload(); }); };
  return (
    <div>
      <div style={{ display: 'grid', gap: 8, border: '1px solid #eee', borderRadius: 10, padding: 12, marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome de quem assina" style={{ ...s.inp, flex: 1 }} />
          <input value={papel} onChange={e => setPapel(e.target.value)} placeholder="Papel (fornecedor/comprador)" style={{ ...s.inp, flex: 1 }} />
        </div>
        <SignaturePad onChange={setAssin} />
        <button onClick={add} style={s.btn}>+ Registrar assinatura</button>
      </div>
      {(a.assinaturas || []).map(x => <div key={x.id} style={{ fontSize: 13, padding: '5px 0', borderTop: '1px solid #f2f2f2' }}>✍️ <b>{x.nome}</b> {x.papel ? `(${x.papel})` : ''} {x.tem ? '· assinado' : ''} · {new Date(x.criado_em + 'Z').toLocaleDateString('pt-BR')}</div>)}
    </div>
  );
}

const kBRL = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
function TabApuracao({ API, id }) {
  const [d, setD] = React.useState(null); const [carreg, setCarreg] = React.useState(true);
  React.useEffect(() => {
    setCarreg(true);
    API.get(`/acordos/${id}/apuracao`).then(r => setD(r.data)).catch(e => setD({ erro: e.response?.data?.erro || e.message })).finally(() => setCarreg(false));
  }, [API, id]);
  if (carreg) return <div style={{ ...s.cardA, textAlign: 'center', color: '#999' }}>apurando compras no ERP…</div>;
  if (!d || d.erro) return <div style={{ ...s.cardA, color: '#993C1D' }}>⚠️ {d?.erro || 'Não foi possível apurar.'}</div>;
  if (!d.condicoes?.length) return <div style={{ ...s.cardA, color: '#888' }}>Este acordo ainda não tem condições com dimensão/período para apurar. Cadastre nas <b>Condições</b>.</div>;
  const C = d.consolidado || {};
  const corAt = a => a == null ? '#999' : a >= 100 ? '#1E874B' : a >= 80 ? '#B7791F' : '#C0392B';
  const Card = ({ n, l, cor = '#111', sub }) => <div style={{ background: '#F7F8FA', border: '1px solid #eee', borderRadius: 10, padding: '10px 14px', minWidth: 130, flex: 1 }}>
    <div style={{ fontSize: 18, fontWeight: 800, color: cor }}>{n}</div><div style={{ fontSize: 11, color: '#777' }}>{l}</div>{sub && <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>{sub}</div>}
  </div>;
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Card n={kBRL(C.comprado)} l="Comprado no ERP" sub={`meta ${kBRL(C.meta)}`} />
        <Card n={C.atingimento != null ? C.atingimento + '%' : '—'} l="Atingimento" cor={corAt(C.atingimento)} />
        <Card n={kBRL(C.retornoAtingido)} l="Retorno atingido" cor="#1E874B" sub={`esperado ${kBRL(C.retornoEsperado)}`} />
        <Card n={kBRL(C.aReceber)} l="A receber" cor="#2E5C9E" />
      </div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Compras reais (nota fiscal de entrada) × meta de cada condição · {d.unidades} loja(s).</div>
      {d.condicoes.map((it, i) => {
        const ap = it.apuracao || {}; const c = it.condicao || {};
        return (
          <div key={i} style={{ ...s.cardA }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <b style={{ fontSize: 13 }}>{c.descricao || (c.dimensao + (c.alvo_nome ? ' · ' + c.alvo_nome : ''))}</b>
              <span style={{ fontSize: 11.5, color: '#888' }}>{c.dimensao}{c.alvo_nome ? ` · ${c.alvo_nome}` : ''} · {c.percentual || 0}%</span>
            </div>
            {!ap.ok ? <div style={{ fontSize: 12, color: '#B7791F', marginTop: 4 }}>{ap.erro || (ap.semAlvo ? 'sem alvo/escopo definido' : 'sem período')}</div> :
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0', fontSize: 12.5 }}>
                <span>Comprado <b>{kBRL(ap.realizado)}</b></span>
                <span style={{ color: '#888' }}>Meta {kBRL(ap.meta)}{ap.mensal ? ` (${kBRL(ap.metaMensal)}/mês)` : ''}</span>
                <span style={{ color: corAt(ap.atingimento), fontWeight: 700 }}>{ap.atingimento != null ? ap.atingimento + '%' : '—'}</span>
                <span style={{ color: '#1E874B' }}>Retorno {kBRL(ap.retornoAtingido)}</span>
                <span style={{ color: '#aaa' }}>· {ap.periodo?.ini} a {ap.periodo?.fim} · por {ap.apuracao}</span>
              </div>
              <div style={{ background: '#eee', borderRadius: 5, height: 8, overflow: 'hidden' }}>
                <div style={{ width: Math.min(100, ap.atingimento || 0) + '%', height: '100%', background: corAt(ap.atingimento) }} />
              </div>
              {ap.mensal && ap.porMes?.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                  {ap.porMes.map(m => <span key={m.mes} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, background: m.atingiu ? '#EAF7EF' : '#FBEAEA', color: m.atingiu ? '#1E7A46' : '#8A2E2E' }}>{m.mes.slice(5)}: {kBRL(m.comprado)} {m.atingiu ? '✓' : '✗'}</span>)}
                </div>
              )}
            </>}
          </div>
        );
      })}
      <div style={{ fontSize: 11.5, color: '#888', background: '#F6F7F9', borderRadius: 8, padding: '8px 10px' }}>💡 "A receber" = retorno atingido ainda não baixado. A baixa/pagamento é lançada na aba Pagamentos.</div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1500, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666' },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  btn: { fontSize: 13, padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 12, padding: '6px 10px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
  dcard: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px' },
  dh: { fontSize: 13, fontWeight: 700, color: '#555', marginBottom: 8 },
  colHead: { color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 12px', borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 2 },
  colN: { background: 'rgba(255,255,255,.3)', borderRadius: 10, padding: '1px 8px', fontSize: 12 },
  colBody: { background: '#F7F8FA', border: '1px solid #eee', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: 8, minHeight: 200 },
  cardA: { background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 10, marginBottom: 8 },
  tag: { fontSize: 10, background: '#F0F3F7', color: '#5A7186', borderRadius: 8, padding: '2px 6px', fontWeight: 600, marginLeft: 6 },
  mv: { fontSize: 12, padding: '4px 8px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer' },
  lbl: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#888' },
  vazio: { fontSize: 12.5, color: '#aaa', textAlign: 'center', padding: 16 },
  chip: { fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: 18, width: '100%', maxHeight: '90vh', overflowY: 'auto' },
};
