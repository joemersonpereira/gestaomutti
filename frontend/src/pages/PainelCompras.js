import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';
import AlertaItensInline from './AlertaItensInline';
import SetorObservacoes from '../components/SetorObservacoes';
import MultiLojaSelect from '../components/MultiLojaSelect';

const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const dataBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
const MESNOMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Hook: lista de lojas p/ os filtros.
function useLojas(API) {
  const [lojas, setLojas] = useState([]);
  useEffect(() => { API.get('/compras/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  return lojas;
}
// Agora multi-loja: value é CSV de ids ("" = todas). Reusa o componente compartilhado.
function LojaSelect({ lojas, value, onChange }) {
  return <MultiLojaSelect lojas={lojas} value={value} onChange={onChange} compact />;
}
const CORES = { verde: '#1E874B', amarelo: '#B7791F', vermelho: '#C0392B' };
// rótulo claro da unidade de cada indicador (p/ não confundir % com dias/R$)
const UNI_ROT = { '%': '%', 'dias': 'dias', 'R$': 'R$', 'qtd': 'un', 'un': 'un' };
const BG = { verde: '#E7F5EC', amarelo: '#FCF3E2', vermelho: '#FBEAE7' };

export default function PainelCompras() {
  const { API, usuario } = useAuth();
  const gestao = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria'].includes(usuario.funcao);
  const diretoria = ['Diretor Geral', 'Gestor Geral'].includes(usuario.funcao); // só Diretoria cadastra meta/premiação
  const [aba, setAba] = useState('meusetor');
  const [lateral, setLateral] = useState(() => { try { return localStorage.getItem('compras_lateral') !== '0'; } catch (e) { return true; } });
  const [wide, setWide] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1120 : true);
  useEffect(() => { const f = () => setWide(window.innerWidth >= 1120); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const setLat = v => { setLateral(v); try { localStorage.setItem('compras_lateral', v ? '1' : '0'); } catch (e) { } };
  const shift = lateral && wide ? 320 : 0;
  return (
    <div style={{ ...s.wrap, paddingRight: shift, transition: 'padding-right .18s' }}>
      <Banner emoji="🧮" titulo="Compras" cor="laranja" sub="Painel de bordo do comprador — termômetro do fornecedor, agenda de visitas, orçamento e indicadores." />
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {ABAS_COMPRAS.map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {aba === 'feiras' && <Feiras API={API} gestao={gestao} />}
      {aba === 'remanejamento' && <Remanejamento API={API} gestao={gestao} />}
      {aba === 'conciliacao' && <ConciliacaoPedidoNF API={API} gestao={gestao} />}
      {aba === 'simples' && <CompraSimples API={API} gestao={gestao} />}
      {aba === 'vencidos' && <Vencidos API={API} gestao={gestao} />}
      {aba === 'painel' && <Orcamento API={API} gestao={gestao} />}
      {aba === 'estoque' && <EstoqueIndicadores API={API} />}
      {aba === 'ruptura' && <RupturaAba API={API} />}
      {aba === 'meusetor' && <MeuSetorCompras API={API} gestao={gestao} />}
      {aba === 'metas' && <MetasCompras API={API} gestao={diretoria} />}
      {aba === 'regime' && <RegimeFornecedores API={API} gestao={gestao} />}
      {aba === 'config' && <Config API={API} gestao={gestao} />}
      <LateralCompras API={API} usuario={usuario} aba={aba} onAba={setAba} aberto={lateral} setAberto={setLat} />
    </div>
  );
}
const ABAS_COMPRAS = [['meusetor', '🏆 Meu Setor'], ['metas', '🎯 Metas'], ['painel', '💰 Orçamento de compra'], ['estoque', '📊 Análise de estoque'], ['ruptura', '🚨 Ruptura'], ['remanejamento', '📦 Pedidos de Transferência'], ['conciliacao', '🔗 Conciliação Pedido × NF'], ['simples', '🏛️ Compra do Simples'], ['vencidos', '⏳ Análise de vencidos'], ['feiras', '🎪 Feiras'], ['regime', '🏭 Regime tributário'], ['config', '⚙️ Grupos por comprador']];

// ── Minha área (lateral do Compras) — mesmo padrão do Retail ──
function LateralCompras({ API, usuario, aba, onAba, aberto, setAberto }) {
  const [meu, setMeu] = useState(null);
  const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  useEffect(() => {
    if (!aberto) return;
    API.get('/compras/compradores').then(r => {
      const sou = (r.data.compradores || []).find(c => c.id === usuario?.id);
      if (!sou) { setMeu({ semComprador: true }); return; }
      const now = new Date();
      API.get('/compras/meu-setor', { params: { comprador: sou.id, ano: now.getFullYear(), mes: now.getMonth() + 1 } })
        .then(rr => setMeu({ nome: sou.nome, ...rr.data })).catch(() => setMeu({ nome: sou.nome }));
    }).catch(() => setMeu(null));
  }, [API, usuario, aberto]);
  if (!aberto) return (
    <button onClick={() => setAberto(true)} style={{ position: 'fixed', right: 14, bottom: 18, zIndex: 41, display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(95deg,#0E7C5A,#0b6e59)', color: '#fff', border: 'none', borderRadius: 999, padding: '11px 18px', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,.25)' }}>🧮 Minha área</button>
  );
  const notaCor = n => n == null ? '#94a3b8' : n >= 90 ? '#15803d' : n >= 70 ? '#B7791F' : '#C0392B';
  return (
    <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 312, maxWidth: '92vw', overflowY: 'auto', zIndex: 41, background: '#fff', borderLeft: '1px solid #e3e8ea', boxShadow: '-6px 0 26px rgba(16,40,45,.10)', padding: 14 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <b style={{ fontSize: 13 }}>🧮 Minha área</b>
          <button onClick={() => setAberto(false)} title="Recolher" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18 }}>⟩</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 12 }}>
          {ABAS_COMPRAS.map(([k, l]) => (
            <button key={k} onClick={() => onAba(k)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 9px', borderRadius: 10, border: '1px solid ' + (aba === k ? 'transparent' : '#e8edf0'), background: aba === k ? 'linear-gradient(95deg,#0E7C5A,#0b6e59)' : '#f7f9fa', color: aba === k ? '#fff' : '#334', fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>{l}</button>
          ))}
        </div>
        {meu && !meu.semComprador && <div onClick={() => onAba('meusetor')} style={{ cursor: 'pointer', background: 'linear-gradient(135deg,#0E7C5A,#0b6e59)', color: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 12, opacity: .9 }}>🏆 Meu Setor — {meu.nome ? meu.nome.split(' ')[0] : 'este mês'}</div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{meu.premio > 0 ? brl(meu.premio) : (meu.nota != null ? meu.nota + '/130' : '—')}</div>
          <div style={{ fontSize: 11.5, opacity: .9 }}>nota {meu.nota ?? '—'}/130 · bônus {meu.bonusPct ?? 0}%{meu.premio > 0 ? '' : ' · sem prêmio ainda'}</div>
        </div>}
        {meu && meu.semComprador && <div style={{ background: '#f0fdf9', border: '1px solid #cdeadd', borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 11.5, color: '#0d6b5e' }}>🏆 <b>Meu Setor</b> — você não é um comprador. Abra a aba Meu Setor pra ver cada comprador.</div>}
        <SetorObservacoes API={API} base="/compras/observacoes" titulo="📝 Anotações de Compras" />
      </div>
    </div>
  );
}

// ── Termômetro do fornecedor ──────────────────────────────────────────────
function Termometro({ API, gestao }) {
  const [dados, setDados] = useState(null);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(null);      // fornecedorId com detalhe aberto
  const [detalhe, setDetalhe] = useState({});      // fornecedorId → { itens }
  const carregar = useCallback((b = '') => {
    setErro(''); setDados(null);
    API.get('/compras/fornecedores/termometro', { params: { busca: b, limite: 300 } })
      .then(r => setDados(r.data)).catch(e => setErro(e.response?.data?.erro || 'Falha ao carregar.'));
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const toggleDiverg = (f) => {
    if (aberto === f.id) { setAberto(null); return; }
    setAberto(f.id);
    if (!detalhe[f.id]) API.get(`/compras/fornecedores/${f.id}/divergencias`, { params: { dias: 90 } })
      .then(r => setDetalhe(d => ({ ...d, [f.id]: r.data }))).catch(() => setDetalhe(d => ({ ...d, [f.id]: { itens: [] } })));
  };

  if (erro) return <div style={{ ...s.card, color: CORES.vermelho }}>⚠️ {erro}</div>;
  if (!dados) return <div style={s.card}>Carregando termômetro do ERP…</div>;
  const cont = { verde: 0, amarelo: 0, vermelho: 0 };
  dados.fornecedores.forEach(f => cont[f.cor]++);

  return (
    <div>
      <MetasInline API={API} gestao={gestao} chaves={['termometro_nota', 'entrega_atraso_max']} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <form onSubmit={e => { e.preventDefault(); carregar(busca); }} style={{ display: 'flex', gap: 6, flex: 1, minWidth: 220 }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔎 Buscar fornecedor…" style={{ ...s.inp, flex: 1, maxWidth: 320 }} />
          <button style={s.btn}>Buscar</button>
        </form>
        {['verde', 'amarelo', 'vermelho'].map(c =>
          <span key={c} style={{ ...s.pill, background: BG[c], color: CORES[c] }}>● {cont[c]}</span>)}
      </div>
      <div style={{ fontSize: 11.5, color: '#888', marginBottom: 8 }}>
        {dados.total} fornecedores com compra nos últimos 12 meses. Nota combina <b>atraso de entrega</b>, <b>devoluções em aberto</b> e <b>divergência de conciliação</b>. A coluna <b>Diverg. ped×NF</b> compara o pedido com o XML da NF (via conferência) — <b>sobra/falta</b> de quantidade e <b>diferença de preço</b> (clique para ver os itens).
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={s.tab}>
          <thead>
            <tr>
              {['', 'Fornecedor', 'Compra 12m', 'Atraso entrega', 'Devol. em aberto', 'Divergência NF', 'Diverg. ped×NF (90d)', 'Última visita', 'Próxima'].map((h, i) =>
                <th key={i} style={{ ...s.th, textAlign: i >= 2 && i <= 6 ? 'center' : 'left' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {dados.fornecedores.map(f => {
              const dv = f.divergencia;
              const abertoAqui = aberto === f.id;
              return (
              <React.Fragment key={f.id}>
              <tr style={{ borderTop: '1px solid #f0f0f0', background: abertoAqui ? '#FBFAF5' : undefined }}>
                <td style={s.td}><span title={`nota ${f.nota}`} style={{ ...s.dot, background: CORES[f.cor] }} /></td>
                <td style={{ ...s.td, fontWeight: 600 }}>{f.nome}</td>
                <td style={{ ...s.td, textAlign: 'center' }}>{brl(f.compra12m)}</td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  {f.entrega && f.entrega.pedidos
                    ? <span style={{ color: f.entrega.pctAtraso >= 30 ? CORES.vermelho : f.entrega.pctAtraso >= 15 ? CORES.amarelo : CORES.verde }}>
                        {f.entrega.pctAtraso}% <span style={{ color: '#aaa', fontSize: 11 }}>· {f.entrega.atrasoMedio != null ? f.entrega.atrasoMedio.toFixed(1) : '0'}d</span>
                      </span>
                    : <span style={{ color: '#ccc' }}>—</span>}
                </td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  {f.devolucao && f.devolucao.abertas
                    ? <span style={{ color: f.devolucao.abertasAtrasadas ? CORES.vermelho : '#555' }}>{f.devolucao.abertas}{f.devolucao.abertasAtrasadas ? ` (${f.devolucao.abertasAtrasadas} atrasada${f.devolucao.abertasAtrasadas > 1 ? 's' : ''})` : ''}</span>
                    : <span style={{ color: '#ccc' }}>—</span>}
                </td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  {f.conciliacao && f.conciliacao.divergencias
                    ? <span style={{ color: CORES.amarelo }}>{f.conciliacao.divergencias} <span style={{ color: '#aaa', fontSize: 11 }}>· {f.conciliacao.pctDivergencia}%</span></span>
                    : <span style={{ color: '#ccc' }}>—</span>}
                </td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  {dv && dv.divergentes
                    ? <button onClick={() => toggleDiverg(f)} title="ver itens" style={{ border: 'none', background: 'none', cursor: 'pointer', color: dv.impactoPreco > 0 ? CORES.vermelho : CORES.amarelo, fontWeight: 600, fontSize: 12.5 }}>
                        {abertoAqui ? '▾' : '▸'} {dv.divergentes} <span style={{ color: '#999', fontSize: 11 }}>· {dv.sobras}▲/{dv.faltas}▼{dv.impactoPreco ? ` · Δ${brl(dv.impactoPreco)}` : ''}</span>
                      </button>
                    : <span style={{ color: '#ccc' }}>—</span>}
                </td>
                <td style={{ ...s.td, fontSize: 12, color: '#777' }}>{f.ultimaVisita ? f.ultimaVisita.split('-').reverse().join('/') : '—'}</td>
                <td style={{ ...s.td, fontSize: 12 }}>{f.proximaVisita ? <span style={{ color: CORES.verde, fontWeight: 600 }}>{f.proximaVisita.split('-').reverse().join('/')}</span> : '—'}</td>
              </tr>
              {abertoAqui && (
                <tr><td colSpan={9} style={{ padding: 0, background: '#FBFAF5' }}>
                  <DivergDetalhe d={detalhe[f.id]} />
                </td></tr>
              )}
              </React.Fragment>
            );})}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Feiras de negócios ────────────────────────────────────────────────────
function Feiras({ API, gestao }) {
  const vazio = { nome: '', data_ini: '', data_fim: '', verba_planejada: '', dias_aviso: 30, meses_cobertura: 3, observacao: '', participantes: [] };
  const [feiras, setFeiras] = useState(null);
  const [form, setForm] = useState(null); // objeto sendo editado/criado
  const [busca, setBusca] = useState('');
  const [tipoBusca, setTipoBusca] = useState('laboratorio');
  const [result, setResult] = useState([]);
  const carregar = useCallback(() => API.get('/feiras').then(r => setFeiras(r.data.feiras || [])).catch(() => setFeiras([])), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const dBR = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');

  const buscar = () => {
    const url = tipoBusca === 'laboratorio' ? '/feiras/erp/laboratorios' : '/feiras/erp/fornecedores';
    API.get(url, { params: { busca } }).then(r => setResult(r.data.itens || [])).catch(() => setResult([]));
  };
  const addPart = (it) => { if (!form.participantes.some(p => p.tipo === tipoBusca && p.ref_id === it.ref_id)) setForm(f => ({ ...f, participantes: [...f.participantes, { tipo: tipoBusca, ref_id: it.ref_id, nome: it.nome }] })); };
  const rmPart = (i) => setForm(f => ({ ...f, participantes: f.participantes.filter((_, idx) => idx !== i) }));
  const salvar = () => {
    if (!form.nome || !form.data_ini) return;
    const req = form.id ? API.put(`/feiras/${form.id}`, form) : API.post('/feiras', form);
    req.then(() => { setForm(null); setResult([]); carregar(); });
  };
  const excluir = (id) => { if (window.confirm('Excluir esta feira?')) API.delete(`/feiras/${id}`).then(carregar); };

  return (
    <div>
      <div style={{ ...s.card, background: '#FFF7EC', borderColor: '#F0E0BE', fontSize: 12.5, color: '#8A6D3B' }}>
        🎪 Cadastre as <b>feiras de negócios</b> do ano (oportunidade de compra melhor). O sistema avisa os compradores e o Diretor <b>N dias antes</b> para <b>segurar a compra de volume</b> daqueles fornecedores/laboratórios e concentrar na feira. Participantes vêm do ERP.
      </div>
      {gestao && !form && <button onClick={() => setForm({ ...vazio })} style={{ ...s.btn, marginBottom: 12 }}>+ Nova feira</button>}

      {form && (
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{form.id ? 'Editar feira' : 'Nova feira'}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome da feira (ex.: Feira Nazária 2026)" style={{ ...s.inp, flex: '1 1 260px' }} />
            <label style={s.lbl}>Início <input type="date" value={form.data_ini} onChange={e => setForm(f => ({ ...f, data_ini: e.target.value }))} style={s.inp} /></label>
            <label style={s.lbl}>Fim <input type="date" value={form.data_fim} onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))} style={s.inp} /></label>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <label style={s.lbl}>Verba planejada (R$) <input type="number" value={form.verba_planejada} onChange={e => setForm(f => ({ ...f, verba_planejada: e.target.value }))} placeholder="compra a concentrar" style={{ ...s.inp, width: 160 }} /></label>
            <label style={s.lbl} title="Por quantos meses essa compra abastece. A verba é aportada no mês da feira e abatida dos meses seguintes — a feira antecipa compra futura, então não pesa como estouro.">Abastece (meses) <input type="number" min={1} value={form.meses_cobertura} onChange={e => setForm(f => ({ ...f, meses_cobertura: e.target.value }))} placeholder="ex.: 3" style={{ ...s.inp, width: 90 }} /></label>
            <label style={s.lbl}>Avisar (dias antes) <input type="number" value={form.dias_aviso} onChange={e => setForm(f => ({ ...f, dias_aviso: e.target.value }))} style={{ ...s.inp, width: 90 }} /></label>
            <input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Observação (opcional)" style={{ ...s.inp, flex: '1 1 200px' }} />
          </div>
          {/* Participantes */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: 8, marginTop: 4 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Laboratórios / fornecedores presentes</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
              <select value={tipoBusca} onChange={e => { setTipoBusca(e.target.value); setResult([]); }} style={{ ...s.inp, padding: '6px 8px' }}>
                <option value="laboratorio">Laboratório</option>
                <option value="fornecedor">Fornecedor</option>
              </select>
              <input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()} placeholder={`buscar ${tipoBusca} no ERP…`} style={{ ...s.inp, flex: '1 1 200px' }} />
              <button onClick={buscar} style={s.btnMini}>Buscar</button>
            </div>
            {result.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, maxHeight: 120, overflowY: 'auto' }}>
                {result.map(it => <button key={it.ref_id} onClick={() => addPart(it)} style={{ ...s.chip, fontSize: 11.5 }}>+ {it.nome}</button>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {form.participantes.map((p, i) => (
                <span key={i} style={{ fontSize: 11.5, background: p.tipo === 'laboratorio' ? '#EAF3FB' : '#FCF3E2', color: p.tipo === 'laboratorio' ? '#2C6FA6' : '#B7791F', borderRadius: 8, padding: '3px 9px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {p.tipo === 'laboratorio' ? '🧪' : '🏭'} {p.nome}
                  <button onClick={() => rmPart(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#C0392B', fontWeight: 700 }}>✕</button>
                </span>
              ))}
              {form.participantes.length === 0 && <span style={{ fontSize: 11.5, color: '#999' }}>Nenhum participante ainda.</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={salvar} disabled={!form.nome || !form.data_ini} style={{ ...s.btn, opacity: (form.nome && form.data_ini) ? 1 : 0.5 }}>Salvar feira</button>
            <button onClick={() => { setForm(null); setResult([]); }} style={s.btnMini}>Cancelar</button>
          </div>
        </div>
      )}

      {!feiras && <div style={s.card}>Carregando…</div>}
      {feiras && feiras.length === 0 && !form && <div style={{ ...s.card, textAlign: 'center', color: '#999' }}>Nenhuma feira cadastrada ainda.</div>}
      {(feiras || []).map(f => (
        <div key={f.id} style={{ ...s.card, borderLeft: '4px solid #E0912F' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>🎪 {f.nome}</div>
            <span style={{ fontSize: 12.5, color: '#666' }}>{dBR(f.data_ini)}{f.data_fim ? ` – ${dBR(f.data_fim)}` : ''}</span>
            {f.verba_planejada ? <span style={{ fontSize: 12.5, background: '#EEF4FB', color: '#2C5B8A', borderRadius: 8, padding: '3px 9px', fontWeight: 700 }}>verba {brl(f.verba_planejada)}</span> : null}
            {f.realizadoNfs ? <span style={{ fontSize: 12, background: '#EAF6EE', color: CORES.verde, borderRadius: 8, padding: '3px 9px', fontWeight: 700 }}>realizado {brl(f.realizadoValor)} · {f.realizadoNfs} NFs</span> : null}
            {gestao && <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={() => setForm({ ...f, verba_planejada: f.verba_planejada || '', participantes: (f.participantes || []).map(p => ({ tipo: p.tipo, ref_id: p.ref_id, nome: p.nome })) })} style={s.btnMini}>editar</button>
              <button onClick={() => excluir(f.id)} style={{ ...s.btnMini, color: '#C0392B' }}>excluir</button>
            </span>}
          </div>
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 4 }}>Avisa {f.dias_aviso} dias antes {f.tarefa_gerada ? '· ✅ tarefa já gerada' : '· ⏳ aguardando janela'}</div>
          {(f.participantes || []).length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {f.participantes.map(p => <span key={p.id} style={{ fontSize: 11, color: '#555', background: '#f4f4f4', borderRadius: 6, padding: '2px 8px' }}>{p.tipo === 'laboratorio' ? '🧪' : '🏭'} {p.nome}</span>)}
            </div>
          )}
          {f.observacao && <div style={{ fontSize: 12, color: '#777', marginTop: 6 }}>{f.observacao}</div>}
          {/* Verba × realizado */}
          {f.verba_planejada ? (() => {
            const pct = Math.min(100, Math.round((f.realizadoValor || 0) / f.verba_planejada * 100));
            const estourou = (f.realizadoValor || 0) > f.verba_planejada;
            return (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#666', marginBottom: 3 }}>
                  <span>Realizado (NFs) <b>{brl(f.realizadoValor || 0)}</b> de <b>{brl(f.verba_planejada)}</b></span>
                  <span style={{ color: estourou ? CORES.vermelho : '#666' }}>{pct}%{estourou ? ' · acima da verba' : ''}</span>
                </div>
                <div style={{ height: 8, background: '#eee', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: pct + '%', height: '100%', background: estourou ? CORES.vermelho : CORES.verde }} />
                </div>
              </div>
            );
          })() : null}
          <FeiraVerba API={API} feira={f} onChange={carregar} />
          <FeiraNfs API={API} feira={f} onChange={carregar} />
        </div>
      ))}
    </div>
  );
}

// Análise de compras por período → prever a verba (abre tarefa p/ Diretor + agenda só escritório).
function FeiraVerba({ API, feira, onChange }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState(null);
  const hoje = new Date().toISOString().slice(0, 10);
  const ha90 = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const [de, setDe] = useState(ha90);
  const [ate, setAte] = useState(hoje);
  const [verba, setVerba] = useState('');
  const [justif, setJustif] = useState('');
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(false);

  const analisar = () => {
    setCarregando(true); setMsg('');
    API.get(`/feiras/${feira.id}/analise-compras`, { params: { de, ate } })
      .then(r => { setDados(r.data); if (!verba && r.data.mediaMensal) setVerba(String(r.data.mediaMensal)); })
      .catch(e => setMsg(e.response?.data?.erro || 'Falha ao analisar.'))
      .finally(() => setCarregando(false));
  };
  const abrir = () => { setAberto(a => !a); if (!dados) analisar(); };
  const prever = () => {
    const v = Number(verba);
    if (!v || v <= 0) { setMsg('Informe a verba prevista.'); return; }
    const base = dados ? `Comprado ${brl(dados.total)} em ${dados.dias}d dos participantes (média ${brl(dados.mediaMensal)}/mês).` : '';
    API.post(`/feiras/${feira.id}/prever-verba`, { verba: v, base, justificativa: justif })
      .then(r => { setMsg(`✅ Verba de ${brl(r.data.verba)} prevista${r.data.tarefaCriada ? ' — tarefa aberta p/ o Diretor' : ''} e agendada (só escritório).`); onChange && onChange(); })
      .catch(e => setMsg(e.response?.data?.erro || 'Falha ao prever.'));
  };

  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={abrir} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#8E44AD', fontWeight: 600, fontSize: 12, padding: 0 }}>{aberto ? '▾ ocultar análise de compras / verba' : '📊 analisar compras e prever a verba'}</button>
      {aberto && (
        <div style={{ marginTop: 6, background: '#FBF7FE', border: '1px solid #ECDDF5', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <label style={{ fontSize: 11.5, color: '#666' }}>de <input type="date" value={de} onChange={e => setDe(e.target.value)} style={{ ...s.inp, padding: '5px 7px' }} /></label>
            <label style={{ fontSize: 11.5, color: '#666' }}>até <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={{ ...s.inp, padding: '5px 7px' }} /></label>
            <button onClick={analisar} style={s.btnMini}>Analisar</button>
            <span style={{ fontSize: 10.5, color: '#999' }}>quanto já foi comprado desses fornecedores/laboratórios</span>
          </div>
          {carregando && <div style={{ fontSize: 12, color: '#999' }}>Analisando compras…</div>}
          {dados && (
            <>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                <div><div style={{ fontSize: 10.5, color: '#888' }}>Comprado no período</div><div style={{ fontSize: 16, fontWeight: 700 }}>{brl(dados.total)}</div></div>
                <div><div style={{ fontSize: 10.5, color: '#888' }}>Média mensal</div><div style={{ fontSize: 16, fontWeight: 700, color: '#8E44AD' }}>{brl(dados.mediaMensal)}</div></div>
              </div>
              {dados.porParticipante && dados.porParticipante.length > 0 && (
                <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 8 }}>
                  {dados.porParticipante.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid #f2ecf7' }}>
                      <span>{p.tipo === 'laboratorio' ? '🧪' : '🏭'} {p.nome} <span style={{ color: '#bbb' }}>· {p.nfs} NF</span></span>
                      <b>{brl(p.valor)}</b>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                <label style={{ fontSize: 11.5, color: '#666' }}>Verba prevista R$ <input type="number" value={verba} onChange={e => setVerba(e.target.value)} style={{ ...s.inp, padding: '5px 7px', width: 120 }} /></label>
                <input value={justif} onChange={e => setJustif(e.target.value)} placeholder="justificativa (opcional)" style={{ ...s.inp, padding: '5px 8px', flex: 1, minWidth: 160 }} />
                <button onClick={prever} style={{ ...s.btnMini, background: '#8E44AD', color: '#fff', border: 'none' }}>Prever verba → Diretor</button>
              </div>
              <div style={{ fontSize: 10.5, color: '#999', marginTop: 4 }}>Ao prever, abre tarefa p/ o Diretor Geral aprovar e agenda na Comunidade (visão só escritório).</div>
            </>
          )}
          {msg && <div style={{ fontSize: 11.5, marginTop: 6, color: msg.startsWith('✅') ? '#1E8449' : '#C0392B' }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}

// Lançar/marcar as NFs compradas na feira (rateio por produto no valor atribuível).
function FeiraNfs({ API, feira, onChange }) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState(null);
  const [de, setDe] = useState(feira.data_ini || '');
  const [ate, setAte] = useState(feira.data_fim || feira.data_ini || '');
  const [numero, setNumero] = useState('');
  const [buscMsg, setBuscMsg] = useState('');
  const dBR = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');
  const buscar = () => { setBuscMsg(''); setItens(null); API.get(`/feiras/${feira.id}/nfs-sugeridas`, { params: { de, ate } }).then(r => setItens(r.data.itens || [])).catch(() => setItens([])); };
  // Adiciona uma NF pelo NÚMERO digitado (mescla na lista; não duplica se já estiver lá).
  const buscarNumero = () => {
    const n = numero.trim(); if (!n) return;
    setBuscMsg('buscando…');
    API.get(`/feiras/${feira.id}/nf-por-numero`, { params: { numero: n } })
      .then(r => {
        const achadas = r.data.itens || [];
        if (!achadas.length) { setBuscMsg(r.data.aviso || `NF ${n} não encontrada.`); return; }
        setItens(list => {
          const base = list || [];
          const ids = new Set(base.map(x => x.nf_id));
          return [...achadas.filter(x => !ids.has(x.nf_id)), ...base];
        });
        setBuscMsg(`${achadas.length} NF ${n} encontrada(s) — marque abaixo.`); setNumero('');
      })
      .catch(e => setBuscMsg(e.response?.data?.erro || 'falha na busca'));
  };
  const toggle = (it) => {
    const req = it.marcada
      ? API.delete(`/feiras/${feira.id}/nfs/${it.nf_id}`)
      : API.post(`/feiras/${feira.id}/nfs`, { nf_id: it.nf_id, nf_numero: it.numero, fornecedor: it.fornecedor, valor: it.valorFeira, data_entrada: it.data });
    req.then(() => { setItens(list => (list || []).map(x => x.nf_id === it.nf_id ? { ...x, marcada: !x.marcada } : x)); onChange && onChange(); });
  };
  const abrir = () => { setAberto(a => !a); if (!itens) buscar(); };

  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={abrir} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#2C6FA6', fontWeight: 600, fontSize: 12, padding: 0 }}>{aberto ? '▾ ocultar lançamento de NFs' : '📋 lançar NFs compradas na feira'}</button>
      {aberto && (
        <div style={{ marginTop: 6, background: '#fafafa', border: '1px solid #eee', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <label style={{ fontSize: 11.5, color: '#666' }}>de <input type="date" value={de} onChange={e => setDe(e.target.value)} style={{ ...s.inp, padding: '5px 7px' }} /></label>
            <label style={{ fontSize: 11.5, color: '#666' }}>até <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={{ ...s.inp, padding: '5px 7px' }} /></label>
            <button onClick={buscar} style={s.btnMini}>Buscar NFs</button>
            <span style={{ fontSize: 10.5, color: '#999' }}>NF do fornecedor = valor total; laboratório = só os itens do fabricante (rateio).</span>
          </div>
          {/* Digitar o número da NF direto (caso não queira marcar da lista sugerida). */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontSize: 11.5, color: '#666' }}>ou informe o nº da NF:</span>
            <input value={numero} onChange={e => setNumero(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscarNumero()} placeholder="ex.: 3158" style={{ ...s.inp, padding: '5px 8px', width: 110 }} />
            <button onClick={buscarNumero} style={s.btnMini}>Adicionar NF</button>
            {buscMsg && <span style={{ fontSize: 10.5, color: buscMsg.includes('encontrada(s)') ? '#1E8449' : '#C0392B' }}>{buscMsg}</span>}
          </div>
          {itens === null && <div style={{ fontSize: 12, color: '#999' }}>Buscando NFs…</div>}
          {itens && itens.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhuma NF dos participantes no período.</div>}
          {itens && itens.length > 0 && (
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {itens.map(it => (
                <div key={it.nf_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid #f2f2f2' }}>
                  <input type="checkbox" checked={!!it.marcada} onChange={() => toggle(it)} />
                  <span style={{ flex: 1, fontSize: 12 }}>NF {it.numero || '—'} · {it.fornecedor} <span style={{ color: '#aaa' }}>· {dBR(it.data)}</span></span>
                  {it.rateio && <span style={{ fontSize: 10, color: '#2C6FA6', background: '#EAF3FB', borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>rateio</span>}
                  <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{brl(it.valorFeira)}{it.rateio && it.total !== it.valorFeira ? <span style={{ color: '#bbb', fontWeight: 400 }}> /{brl(it.total)}</span> : null}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Eficiência por comprador ──────────────────────────────────────────────
function EficienciaComprador({ API, gestao }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [dias, setDias] = useState(90);
  const [modo, setModo] = useState('dias'); // 'dias' | 'periodo' | 'mes'
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [mesSel, setMesSel] = useState(new Date().toISOString().slice(0, 7));
  const [capMsg, setCapMsg] = useState('');
  const carregar = useCallback(() => {
    if (modo === 'periodo' && (!de || !ate)) return; // espera as duas datas
    if (modo === 'mes' && !mesSel) return;
    setErro(''); setD(null);
    const params = modo === 'periodo' ? { de, ate } : modo === 'mes' ? { mes: mesSel } : { dias };
    API.get('/compras/eficiencia-compradores', { params })
      .then(r => { if (r.data.erro) setErro(r.data.erro); else setD(r.data); }).catch(e => setErro(e.response?.data?.erro || 'Falha.'));
  }, [API, dias, modo, de, ate, mesSel]);
  useEffect(() => { carregar(); }, [carregar]);
  const capturar = () => { setCapMsg('capturando…'); API.post('/compras/eficiencia-compradores/capturar').then(r => { setCapMsg(`✅ foto de ${r.data.capturados} comprador(es) salva`); carregar(); }).catch(e => setCapMsg('⚠️ ' + (e.response?.data?.erro || 'falha'))); };
  const semSnapshot = d && d.compradores && d.compradores.some(c => c.semSnapshot);

  const COLS = [
    { k: 'nome', label: 'Comprador', tipo: 'txt', get: c => c.nome },
    { k: 'compras', label: 'Compras', tipo: 'num', right: true, get: c => c.compras || 0 },
    { k: 'semPedidoPct', label: 'Sem pedido', tipo: 'num', right: true, get: c => c.semPedidoPct || 0 },
    { k: 'divergentes', label: 'Diverg. ped×NF', tipo: 'num', right: true, get: c => (c.diverg ? c.diverg.divergentes : 0) },
    { k: 'ruptura', label: 'Ruptura', tipo: 'num', right: true, get: c => c.ruptura || 0 },
    { k: 'cobertura', label: 'Cobertura', tipo: 'num', right: true, get: c => c.cobertura || 0 },
    { k: 'excesso', label: 'Excesso estoque', tipo: 'num', right: true, get: c => c.excesso || 0 },
    { k: 'vencidosValor', label: 'Vencendo (risco)', tipo: 'num', right: true, get: c => c.vencidosValor || 0 },
    { k: 'conversaoNovos', label: 'Conv. novos', tipo: 'num', right: true, get: c => c.conversaoNovos || 0 },
    { k: 'listasNoPrazoPct', label: 'Listas no prazo', tipo: 'num', right: true, get: c => c.listasNoPrazoPct || 0 },
  ];
  const comData = (d?.compradores || []).filter(c => !c.semGrupo);
  const semGrupo = (d?.compradores || []).filter(c => c.semGrupo);
  const { linhas, ordem, clicar, seta } = useOrdenavel(comData, COLS, { col: 'semPedidoPct', dir: 'desc' });
  const cor = st => ({ verde: CORES.verde, amarelo: CORES.amarelo, vermelho: CORES.vermelho }[st] || '#999');

  return (
    <div>
      <div style={{ ...s.card, background: '#FFF7EC', borderColor: '#F0E0BE', fontSize: 12.5, color: '#8A6D3B' }}>
        🎯 Eficiência de cada <b>comprador</b> (produtos dos grupos dele). Destaque: <b>compra que entra SEM PEDIDO</b> no sistema — impede a conciliação com o XML da NF. Também: divergência pedido×NF, ruptura, conversão de produtos novos e listas de oferta no prazo. Atribuição por classificação/grupo do produto.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <select value={modo} onChange={e => setModo(e.target.value)} style={{ ...s.inp, padding: '6px 8px' }}>
          <option value="dias">Janela (últimos dias)</option>
          <option value="periodo">Período (datas)</option>
          <option value="mes">Mês (fechar o mês)</option>
        </select>
        {modo === 'dias' && <select value={dias} onChange={e => setDias(Number(e.target.value))} style={{ ...s.inp, padding: '6px 8px' }}>
          {[30, 60, 90, 180, 365].map(x => <option key={x} value={x}>{x} dias</option>)}
        </select>}
        {modo === 'periodo' && <>
          <label style={{ fontSize: 12, color: '#666' }}>de <input type="date" value={de} onChange={e => setDe(e.target.value)} style={{ ...s.inp, padding: '5px 7px' }} /></label>
          <label style={{ fontSize: 12, color: '#666' }}>até <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={{ ...s.inp, padding: '5px 7px' }} /></label>
          {(!de || !ate) && <span style={{ fontSize: 11, color: '#B7791F' }}>informe as duas datas</span>}
        </>}
        {modo === 'mes' && <input type="month" value={mesSel} onChange={e => setMesSel(e.target.value)} style={{ ...s.inp, padding: '5px 7px' }} />}
        {d && d.de && d.ate && <span style={{ fontSize: 11, color: '#999' }}>{d.porData ? `período ${d.de.split('-').reverse().join('/')} → ${d.ate.split('-').reverse().join('/')}` : `últimos ${d.dias} dias`}{d.snapshot ? ' · indicadores = foto do fim do mês' : ''}</span>}
        {gestao && <button onClick={capturar} style={{ ...s.btnMini, marginLeft: 'auto' }} title="Salva a foto dos indicadores do mês corrente agora">📸 Capturar foto do mês</button>}
      </div>
      {capMsg && <div style={{ fontSize: 11.5, marginBottom: 8, color: capMsg.startsWith('✅') ? CORES.verde : '#B7791F' }}>{capMsg}</div>}
      {semSnapshot && <div style={{ ...s.card, background: '#FCF7EA', borderColor: '#F0E0BE', fontSize: 12, color: '#8A6D3B' }}>📸 Este mês ainda não tem <b>foto</b> dos indicadores de estoque (ruptura/cobertura/excesso/vencendo) — eles só existem a partir de quando o sistema começou a capturar. Compras, Sem pedido e Divergência do mês continuam corretos. Use <b>Capturar foto do mês</b> para o mês corrente.</div>}
      {erro && <div style={{ ...s.card, color: CORES.vermelho }}>⚠️ {erro}</div>}
      {!d && !erro && <div style={s.card}>Analisando compradores… (pode levar alguns segundos)</div>}
      {d && comData.length === 0 && <div style={s.card}>Nenhum comprador com grupo vinculado. Vincule os grupos na aba <b>⚙️ Grupos por comprador</b> para a eficiência aparecer.</div>}
      {d && comData.length > 0 && (
        <div style={{ ...s.card, overflowX: 'auto' }}>
          <table style={s.tab}>
            <thead><tr>{COLS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />)}</tr></thead>
            <tbody>
              {linhas.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ ...s.td, fontWeight: 600 }}>{c.nome}<div style={{ fontSize: 10.5, color: '#aaa' }}>{c.produtos} produtos</div></td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{brl(c.compras)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                      <span style={{ ...s.dot, background: cor(c.semSemPedido) }} />
                      <b style={{ color: cor(c.semSemPedido) }}>{c.semPedidoPct}%</b>
                    </span>
                    <div style={{ fontSize: 10.5, color: '#999' }}>{brl(c.semPedidoValor)} · {c.semPedidoNfs} NFs</div>
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    {c.diverg && c.diverg.divergentes
                      ? <><b>{c.diverg.divergentes}</b><div style={{ fontSize: 10.5, color: '#999' }}>{c.diverg.sobras}▲/{c.diverg.faltas}▼{c.diverg.impactoPreco ? ` · Δ${brl(c.diverg.impactoPreco)}` : ''}</div></>
                      : <span style={{ color: '#ccc' }}>—</span>}
                  </td>
                  <td style={{ ...s.td, textAlign: 'right', color: c.ruptura == null ? '#ccc' : c.ruptura > 5 ? CORES.vermelho : CORES.verde }}>{c.ruptura != null ? c.ruptura + '%' : '—'}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: c.cobertura == null ? '#ccc' : '#333' }}>{c.cobertura != null ? c.cobertura + 'd' : '—'}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: c.excesso ? CORES.amarelo : '#ccc' }}>{c.excesso ? brl(c.excesso) : '—'}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: c.vencidosValor ? CORES.vermelho : '#ccc' }}>{c.vencidosValor ? brl(c.vencidosValor) : '—'}<div style={{ fontSize: 10.5, color: '#999' }}>{c.vencidosItens ? `${c.vencidosItens} itens` : ''}</div></td>
                  <td style={{ ...s.td, textAlign: 'right', color: c.conversaoNovos == null ? '#ccc' : c.conversaoNovos >= 70 ? CORES.verde : CORES.amarelo }}>{c.conversaoNovos != null ? c.conversaoNovos + '%' : '—'}</td>
                  <td style={{ ...s.td, textAlign: 'right', color: c.listasNoPrazoPct == null ? '#ccc' : c.listasNoPrazoPct >= 90 ? CORES.verde : CORES.amarelo }}>{c.listasNoPrazoPct != null ? c.listasNoPrazoPct + '%' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>{d.porData ? `Período ${d.de.split('-').reverse().join('/')} → ${d.ate.split('-').reverse().join('/')}.` : `Janela de ${d.dias} dias.`} <b>Sem pedido</b> = valor de NF de entrada dos produtos do comprador sem pedido vinculado (🟢 &lt;10% · 🟡 &lt;25% · 🔴 acima). <b>Impacto</b> da divergência = diferença de preço × qtd (positivo = pagou mais que o pedido).</div>
        </div>
      )}
      {semGrupo.length > 0 && <div style={{ ...s.card, fontSize: 12, color: '#999' }}>Sem grupo vinculado (não entram na análise): {semGrupo.map(c => c.nome).join(', ')}.</div>}
    </div>
  );
}

// Detalhe das divergências NF × pedido de um fornecedor (drill do termômetro).
function DivergDetalhe({ d }) {
  if (!d) return <div style={{ padding: '10px 14px', fontSize: 12, color: '#999' }}>Carregando itens…</div>;
  if (!d.itens || d.itens.length === 0) return <div style={{ padding: '10px 14px', fontSize: 12, color: '#999' }}>Sem divergências relevantes nos últimos {d.dias || 90} dias.</div>;
  const dBR = x => (x ? String(x).slice(0, 10).split('-').reverse().join('/') : '');
  return (
    <div style={{ padding: '8px 14px 14px' }}>
      <table style={{ ...s.tab, fontSize: 12 }}>
        <thead><tr>{['Produto', 'NF', 'Pedido', 'Qtd ped', 'Qtd NF', 'Sobra/Falta', 'Preço ped', 'Preço NF', 'Dif. preço', 'Impacto'].map((h, i) =>
          <th key={i} style={{ ...s.th, textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
        <tbody>
          {d.itens.map((it, i) => (
            <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
              <td style={{ ...s.td, fontWeight: 600 }}>{it.descricao}</td>
              <td style={{ ...s.td, color: '#777' }}>{it.nf || '—'}</td>
              <td style={{ ...s.td, color: '#777' }}>{it.pedido || '—'}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{it.qtdPedido}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{it.qtdNf}</td>
              <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: it.tipoQtd === 'sobra' ? CORES.amarelo : it.tipoQtd === 'falta' ? CORES.vermelho : '#ccc' }}>
                {it.tipoQtd ? `${it.tipoQtd === 'sobra' ? '▲ sobra' : '▼ falta'} ${Math.abs(it.difQtd)}` : '—'}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{brl(it.precoPedido)}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{brl(it.precoNf)}</td>
              <td style={{ ...s.td, textAlign: 'right', fontWeight: it.precoSignif ? 700 : 400, color: !it.precoSignif ? '#ccc' : it.difPreco > 0 ? CORES.vermelho : CORES.verde }}>
                {it.precoSignif ? `${it.difPreco > 0 ? '+' : ''}${brl(it.difPreco)}${it.pctPreco != null ? ` (${it.pctPreco > 0 ? '+' : ''}${it.pctPreco}%)` : ''}` : '—'}</td>
              <td style={{ ...s.td, textAlign: 'right', color: it.impacto > 0 ? CORES.vermelho : it.impacto < 0 ? CORES.verde : '#ccc' }}>{it.impacto ? brl(it.impacto) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>Preço só é marcado como divergência quando muda mais de 1% do pedido. Impacto = diferença de preço × qtd da NF (positivo = pagou mais que o pedido). Data ref.: {dBR(d.itens[0]?.data)}.</div>
    </div>
  );
}

// ── Agenda de visitas ─────────────────────────────────────────────────────
function Visitas({ API, gestao }) {
  const [visitas, setVisitas] = useState([]);
  const [faixa, setFaixa] = useState(500000);
  const [editando, setEditando] = useState(null);
  const [novo, setNovo] = useState(false);
  const carregar = useCallback(() => {
    API.get('/compras/visitas').then(r => { setVisitas(r.data.visitas || []); setFaixa(r.data.faixaVisita || 500000); }).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  const grupos = [
    ['sugerida', '🔔 Sugeridas pelo gatilho', 'Fornecedor atingiu mais uma faixa de compra — marque a visita.'],
    ['agendada', '📅 Agendadas', 'Visitas com data marcada.'],
    ['realizada', '✅ Realizadas', 'Histórico de visitas concluídas.'],
    ['dispensada', '🚫 Dispensadas', ''],
  ];

  return (
    <div>
      <MetasInline API={API} gestao={gestao} chaves={['visita_faixa']} onSaved={carregar} />
      <div style={{ ...s.card, background: '#F4F8FC', borderColor: '#DCE9F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12.5, color: '#33506B' }}>
          🤝 <b>Proximidade com o fornecedor.</b> A cada <b>{brl(faixa)}</b> de compra acumulada no ano, o sistema sugere uma visita do fornecedor/laboratório à empresa.
        </div>
        {gestao && <button onClick={() => setNovo(true)} style={s.btn}>+ Nova visita</button>}
      </div>

      {novo && <FormVisita API={API} onDone={() => { setNovo(false); carregar(); }} onCancel={() => setNovo(false)} />}

      {grupos.map(([st, titulo, desc]) => {
        const lista = visitas.filter(v => v.status === st);
        if (!lista.length && st === 'dispensada') return null;
        return (
          <div key={st} style={{ marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{titulo} <span style={{ fontSize: 12, color: '#999', fontWeight: 400 }}>({lista.length})</span></div>
            {desc && <div style={{ fontSize: 11.5, color: '#999', marginBottom: 6 }}>{desc}</div>}
            {lista.length === 0 && <div style={{ fontSize: 12.5, color: '#bbb', padding: '6px 0' }}>Nenhuma.</div>}
            {lista.map(v => (
              <div key={v.id} style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{v.fornecedor_nome}
                      {v.gatilho_faixa ? <span style={s.tag}>faixa {v.gatilho_faixa} · {brl(v.compra_acumulada)}</span> : null}
                      {v.origem === 'manual' ? <span style={{ ...s.tag, background: '#EEE', color: '#777' }}>manual</span> : null}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                      {v.data_visita ? <>📆 {v.data_visita.split('-').reverse().join('/')}{v.hora_visita ? ` ${v.hora_visita}` : ''} · </> : ''}
                      {v.responsavel_nome ? <>👤 {v.responsavel_nome} · </> : ''}
                      {v.observacao || <span style={{ color: '#bbb' }}>sem observação</span>}
                    </div>
                  </div>
                  {gestao && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {st !== 'realizada' && <button onClick={() => setEditando(v.id)} style={s.btnMini}>Agendar/editar</button>}
                      {st === 'agendada' && <button onClick={() => API.put(`/compras/visitas/${v.id}`, { status: 'realizada' }).then(carregar)} style={{ ...s.btnMini, background: CORES.verde, color: '#fff', borderColor: CORES.verde }}>✓ Realizada</button>}
                      {st === 'sugerida' && <button onClick={() => API.put(`/compras/visitas/${v.id}`, { status: 'dispensada' }).then(carregar)} style={s.btnMini}>Dispensar</button>}
                    </div>
                  )}
                </div>
                {editando === v.id && <FormVisita API={API} visita={v} onDone={() => { setEditando(null); carregar(); }} onCancel={() => setEditando(null)} />}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function FormVisita({ API, visita, onDone, onCancel }) {
  const [f, setF] = useState({
    fornecedor_nome: visita?.fornecedor_nome || '', data_visita: visita?.data_visita || '',
    hora_visita: visita?.hora_visita || '', responsavel_nome: visita?.responsavel_nome || '', observacao: visita?.observacao || '',
  });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const salvar = () => {
    if (visita) API.put(`/compras/visitas/${visita.id}`, { ...f, status: f.data_visita ? 'agendada' : visita.status }).then(onDone);
    else API.post('/compras/visitas', f).then(onDone);
  };
  return (
    <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 10, display: 'grid', gap: 8 }}>
      {!visita && <input value={f.fornecedor_nome} onChange={e => set('fornecedor_nome', e.target.value)} placeholder="Fornecedor" style={s.inp} />}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={s.lbl}>Data<input type="date" value={f.data_visita} onChange={e => set('data_visita', e.target.value)} style={s.inp} /></label>
        <label style={s.lbl}>Hora<input type="time" value={f.hora_visita} onChange={e => set('hora_visita', e.target.value)} style={s.inp} /></label>
        <label style={{ ...s.lbl, flex: 1, minWidth: 160 }}>Anfitrião<input value={f.responsavel_nome} onChange={e => set('responsavel_nome', e.target.value)} placeholder="Quem recebe" style={s.inp} /></label>
      </div>
      <textarea value={f.observacao} onChange={e => set('observacao', e.target.value)} placeholder="Pauta / observação da visita" style={{ ...s.inp, minHeight: 52, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={salvar} style={s.btn}>Salvar</button>
        <button onClick={onCancel} style={{ ...s.btn, background: '#999' }}>Cancelar</button>
      </div>
    </div>
  );
}

// ── Estoque & Remanejamento ───────────────────────────────────────────────
// Conciliação Pedido × NF — por comprador. Todo comprador lança o pedido p/ depois conferir com a NF.
// Mostra: % comprado sem pedido, quanto o fornecedor cobrou a mais, divergências de quantidade e os
// pedidos pendentes (atrasados em destaque). Roda por MÊS (as junções de recebimento × NF são pesadas).
function mesesOpc(n = 6) {
  const out = []; const h = new Date();
  for (let i = 0; i < n; i++) { const d = new Date(h.getFullYear(), h.getMonth() - i, 1); const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; out.push([v, d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })]); }
  return out;
}
// Compra do Simples Nacional — Lucro Real comprando do Simples/MEI = tributação maior. Por comprador/mês.
// A gestão pode PERDOAR um fornecedor/mês se o comprador comprovar desconto compensatório.
function CompraSimples({ API, gestao }) {
  const [comps, setComps] = useState([]);
  const [comprador, setComprador] = useState('');
  const [mes, setMes] = useState(mesesOpc(1)[0][0]);
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const MESES = mesesOpc(6);
  useEffect(() => { API.get('/compras/compradores').then(r => { const l = r.data.compradores || []; setComps(l); setComprador(p => p || (l[0] && l[0].id) || ''); }).catch(() => {}); }, [API]);
  const carregar = useCallback(() => {
    if (!comprador) return; setErro(''); setD(null);
    API.get('/compras/simples', { params: { comprador, ano: mes.slice(0, 4), mes: Number(mes.slice(5, 7)) } }).then(r => setD(r.data)).catch(e => setErro(e.response?.data?.erro || 'Falha ao carregar.'));
  }, [API, comprador, mes]);
  useEffect(() => { carregar(); }, [carregar]);
  const perdoar = (f) => {
    const just = window.prompt(`Perdoar a compra do Simples de ${f.razao}?\nComprove o desconto compensatório (justificativa):`, f.perdoado ? '' : '');
    if (just === null) return; // cancelou
    API.post('/compras/simples/perdao', { comprador, cnpj: f.cnpj, ano: mes.slice(0, 4), mes: Number(mes.slice(5, 7)), justificativa: just, perdoar: !f.perdoado })
      .then(() => carregar()).catch(e => alert(e.response?.data?.erro || 'Falha.'));
  };
  const [aliqEdit, setAliqEdit] = useState('');
  useEffect(() => { if (d && d.aliquota != null) setAliqEdit(String(d.aliquota)); }, [d]);
  const salvarAliq = () => { API.put('/compras/simples/aliquota', { aliquota: Number(aliqEdit) || 0 }).then(() => carregar()).catch(e => alert(e.response?.data?.erro || 'Falha.')); };
  const r = d && d.erp !== false && !d.semComprador ? d : null;
  return (
    <div>
      <div style={{ ...s.card, background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 12, fontSize: 12.5 }}>
        🏛️ <b>Compra do Simples Nacional</b> — a Mutti é <b>Lucro Real</b>, então comprar de fornecedor do <b>Simples/MEI</b> gera menos crédito tributário (custo efetivo maior). Isto é indicador do comprador. Se ele <b>comprovar que o Simples deu um desconto</b> que compensa a tributação a mais, a gestão pode <b>perdoar</b> aquele fornecedor no mês. O regime vem da aba <b>🏭 Regime tributário</b>.
      </div>
      <div style={{ marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={comprador} onChange={e => setComprador(e.target.value)} style={{ ...s.inp, padding: '6px 8px', minWidth: 210 }}>
          {comps.length === 0 && <option value="">(sem compradores)</option>}
          {comps.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select value={mes} onChange={e => setMes(e.target.value)} style={{ ...s.inp, padding: '6px 8px' }}>{MESES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button onClick={carregar} style={{ ...s.inp, padding: '6px 12px', cursor: 'pointer', fontWeight: 600 }}>🔄 Atualizar</button>
      </div>
      {erro && <div style={{ ...s.card, color: CORES.vermelho }}>⚠️ {erro}</div>}
      {!d && !erro && <div style={s.card}>Carregando compras do comprador…</div>}
      {d && d.semComprador && <div style={s.card}>Este comprador ainda não tem grupos vinculados. Configure em <b>⚙️ Grupos por comprador</b>.</div>}
      {r && <>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <Kpi titulo="Comprado no mês" valor={brl(r.totalComprado)} />
          <Kpi titulo="Do Simples/MEI" valor={brl(r.simplesBruto)} cor={r.simplesBruto ? CORES.amarelo : CORES.verde} />
          <Kpi titulo="% do Simples (líq.)" valor={r.simplesPct + '%'} cor={r.simplesPct > 10 ? CORES.vermelho : CORES.verde} />
          <Kpi titulo="Perdoado" valor={brl(r.simplesPerdoado)} cor={CORES.verde} />
          <Kpi titulo="Imposto a mais (est.)" valor={r.aliquota > 0 ? brl(r.impostoAMais) : '—'} cor={r.impostoAMais ? CORES.vermelho : '#999'} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10, fontSize: 12.5, background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 8, padding: '8px 11px' }}>
          <span>🧮 <b>Imposto pago a mais</b> = valor do Simples (líq.) × alíquota de crédito perdido.</span>
          <span style={{ color: '#64748b' }}>Alíquota efetiva (o contador calibra — ICMS/PIS-COFINS que se perde):</span>
          {gestao ? <>
            <input value={aliqEdit} onChange={e => setAliqEdit(e.target.value.replace(',', '.'))} style={{ ...s.inp, width: 70, padding: '4px 8px' }} /> <span>%</span>
            <button onClick={salvarAliq} style={{ ...s.inp, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>Salvar</button>
          </> : <b>{r.aliquota}%</b>}
          {r.aliquota === 0 && <span style={{ color: '#B7791F' }}>⚠️ defina a alíquota pra ver o R$ estimado.</span>}
        </div>
        {r.naoClassificado > 0 && <div style={{ fontSize: 11.5, color: '#92700e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 11px', marginBottom: 10 }}>
          ⚠️ {brl(r.naoClassificado)} comprado de fornecedores <b>sem regime classificado</b> (não entram na conta). Classifique em 🏭 Regime tributário pra fechar.
        </div>}
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tab}>
            <thead><tr>{['Fornecedor', 'CNPJ', 'Regime', 'Comprado', 'Imposto a mais', 'Status', gestao ? 'Ação' : ''].filter(Boolean).map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {(r.fornecedores || []).length === 0 && <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#3B6D11' }}>Nenhuma compra de fornecedor do Simples neste mês. 👍</td></tr>}
              {(r.fornecedores || []).map(f => <tr key={f.cnpj} style={{ borderTop: '1px solid #f0f0f0', background: f.perdoado ? '#F2FBF4' : '#fff' }}>
                <td style={{ ...s.td, fontWeight: 600 }}>{f.razao}</td>
                <td style={{ ...s.td, color: '#888', fontSize: 12 }}>{f.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}</td>
                <td style={{ ...s.td }}><span style={{ ...s.badge, background: '#FCF3E2', color: '#B7791F' }}>{f.regime}</span></td>
                <td style={{ ...s.td, textAlign: 'center' }}>{brl(f.total)}</td>
                <td style={{ ...s.td, textAlign: 'center', color: f.impostoAMais ? CORES.vermelho : '#999', fontWeight: f.impostoAMais ? 600 : 400 }}>{f.perdoado ? '—' : (r.aliquota > 0 ? brl(f.impostoAMais) : '—')}</td>
                <td style={{ ...s.td }}>{f.perdoado ? <span style={{ color: '#1E874B', fontWeight: 600 }}>✅ perdoado</span> : <span style={{ color: '#B7791F' }}>impacta</span>}</td>
                {gestao && <td style={{ ...s.td }}><button onClick={() => perdoar(f)} style={{ ...s.inp, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>{f.perdoado ? 'Remover perdão' : 'Perdoar'}</button></td>}
              </tr>)}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  );
}

function ConciliacaoPedidoNF({ API, gestao }) {
  const [comps, setComps] = useState([]);
  const [comprador, setComprador] = useState('');
  const [mes, setMes] = useState(mesesOpc(1)[0][0]); // mês atual (YYYY-MM)
  const [resumo, setResumo] = useState(null);
  const [pend, setPend] = useState(null);
  const [erro, setErro] = useState('');
  const MESES = mesesOpc(6);
  useEffect(() => { API.get('/compras/compradores').then(r => { const l = r.data.compradores || []; setComps(l); setComprador(p => p || (l[0] && l[0].id) || ''); }).catch(() => {}); }, [API]);
  const carregar = useCallback(() => {
    if (!comprador) return;
    setErro(''); setResumo(null); setPend(null);
    const ano = mes.slice(0, 4), m = Number(mes.slice(5, 7));
    API.get('/compras/conciliacao', { params: { comprador, ano, mes: m } }).then(r => setResumo(r.data)).catch(e => setErro(e.response?.data?.erro || 'Falha ao carregar (janela pesada no ERP — tente de novo).'));
    API.get('/compras/conciliacao/pendentes', { params: { comprador, dias: 60 } }).then(r => setPend(r.data.itens || [])).catch(() => setPend([]));
  }, [API, comprador, mes]);
  useEffect(() => { carregar(); }, [carregar]);
  const r = resumo && resumo.erp !== false && !resumo.semComprador ? resumo : null;
  const atrasadosLista = (pend || []).filter(p => p.atrasado);
  return (
    <div>
      <div style={{ ...s.card, background: '#f0fdf4', border: '1px solid #bbf7d0', marginBottom: 12, fontSize: 12.5 }}>
        🔗 <b>Conciliação Pedido × NF</b> — todo comprador lança o pedido no sistema; aqui o pedido é confrontado com a NF/XML da entrada. Serve pra ver se o <b>fornecedor cobrou mais caro</b>, se <b>mandou mais ou menos</b>, e pra <b>acompanhar os pedidos pendentes</b>. Os pedidos <b>atrasados</b> (prazo vencido e ainda sem NF) é o comprador quem resolve — atualizando o prazo no Alpha ou cobrando o fornecedor.
      </div>
      <div style={{ marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={comprador} onChange={e => setComprador(e.target.value)} style={{ ...s.inp, padding: '6px 8px', minWidth: 210 }}>
          {comps.length === 0 && <option value="">(sem compradores)</option>}
          {comps.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select value={mes} onChange={e => setMes(e.target.value)} style={{ ...s.inp, padding: '6px 8px' }}>
          {MESES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button onClick={carregar} style={{ ...s.inp, padding: '6px 12px', cursor: 'pointer', fontWeight: 600 }}>🔄 Atualizar</button>
      </div>
      {erro && <div style={{ ...s.card, color: CORES.vermelho }}>⚠️ {erro}</div>}
      {!resumo && !erro && <div style={s.card}>Conciliando pedido × NF do comprador… (a janela do mês pode levar alguns segundos)</div>}
      {resumo && resumo.semComprador && <div style={s.card}>Este comprador ainda não tem grupos/classificações vinculados. Configure em <b>⚙️ Grupos por comprador</b>.</div>}
      {r && <>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <Kpi titulo="Comprado no mês" valor={brl(r.compras)} />
          <Kpi titulo="Sem pedido (%)" valor={(r.semPedidoPct || 0) + '%'} cor={r.semPedidoPct > 5 ? CORES.vermelho : CORES.verde} />
          <Kpi titulo="Fornecedor cobrou a mais" valor={brl(r.impactoPreco)} cor={r.impactoPreco > 0 ? CORES.vermelho : CORES.verde} />
          <Kpi titulo="Divergências de qtd" valor={r.sobraFalta} cor={r.sobraFalta ? CORES.amarelo : CORES.verde} />
          <Kpi titulo="Pedidos atrasados" valor={r.pedidosAtrasados} cor={r.pedidosAtrasados ? CORES.vermelho : CORES.verde} />
        </div>
        <div style={{ fontSize: 11.5, color: '#64748b', background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 8, padding: '7px 11px', marginBottom: 10 }}>
          Sobras: <b>{r.sobras}</b> · Faltas: <b>{r.faltas}</b> · NFs sem pedido: <b>{r.semPedidoNfs}</b> (R$ {brl(r.semPedidoValor).replace('R$ ', '')}) · Pedidos pendentes (sem NF): <b>{r.pedidosPendentes}</b>, dos quais <b style={{ color: r.pedidosAtrasados ? CORES.vermelho : '#555' }}>{r.pedidosAtrasados} atrasados</b>.
        </div>
      </>}
      <div style={{ fontWeight: 700, fontSize: 14, margin: '14px 0 8px' }}>Pedidos pendentes (sem NF) <span style={{ fontWeight: 400, color: '#888', fontSize: 12 }}>— atrasados em vermelho; o comprador acompanha</span></div>
      {pend === null && <div style={s.card}>Carregando pedidos pendentes…</div>}
      {pend && pend.length === 0 && <div style={{ ...s.card, color: '#aaa' }}>Nenhum pedido pendente sem NF. 🎉</div>}
      {pend && pend.length > 0 && <div style={{ overflowX: 'auto' }}>
        <table style={s.tab}>
          <thead><tr>{['Pedido', 'Fornecedor', 'Lançado', 'Prazo', 'Atraso', 'Valor'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {pend.map((p, i) => <tr key={i} style={{ borderTop: '1px solid #f0f0f0', background: p.atrasado ? '#FDF6F5' : '#fff' }}>
              <td style={{ ...s.td, color: '#888' }}>#{p.codigo}</td>
              <td style={{ ...s.td, fontWeight: 600 }}>{p.fornecedor}</td>
              <td style={{ ...s.td, color: '#555', whiteSpace: 'nowrap' }}>{dataBR(p.data)}</td>
              <td style={{ ...s.td, color: '#555', whiteSpace: 'nowrap' }}>{p.prazo ? dataBR(p.prazo) : <span style={{ color: '#bbb' }}>sem prazo</span>}</td>
              <td style={{ ...s.td, textAlign: 'center', color: p.atrasado ? CORES.vermelho : '#999', fontWeight: p.atrasado ? 700 : 400 }}>{p.atrasado ? p.diasAtraso + 'd' : '—'}</td>
              <td style={{ ...s.td, textAlign: 'center' }}>{brl(p.valor)}</td>
            </tr>)}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>Mostra os pedidos sem NF dos últimos 60 dias ({atrasadosLista.length} atrasado(s)). Lista limitada aos 400 mais relevantes.</div>
      </div>}
    </div>
  );
}

function Remanejamento({ API, gestao }) {
  const lojas = useLojas(API);
  const [loja, setLoja] = useState('');
  const [comprador, setComprador] = useState(''); const [comps, setComps] = useState([]);
  const [dados, setDados] = useState(null);
  const [dias, setDias] = useState(7);
  const [filtroSt, setFiltroSt] = useState(''); // '' = todas · 'A' · 'S' · 'E'
  const [erro, setErro] = useState('');
  useEffect(() => { API.get('/compras/metas').then(r => { const v = r.data.metas?.transf_dias?.usado; if (v) setDias(Number(v)); }).catch(() => {}); API.get('/compras/compradores').then(r => setComps(r.data.compradores || [])).catch(() => {}); }, [API]);
  const carregar = useCallback((d, lj, cp) => {
    setErro(''); setDados(null);
    API.get('/compras/pedidos-transferencia-pendentes', { params: { dias: d, loja: lj || undefined, comprador: cp || undefined } })
      .then(r => setDados(r.data)).catch(e => setErro(e.response?.data?.erro || 'Falha ao carregar.'));
  }, [API]);
  useEffect(() => { carregar(dias, loja, comprador); }, [carregar, dias, loja, comprador]);
  const STATUS_OPC = dados?.statusOpcoes || [['', 'Todas'], ['A', 'Aberta'], ['S', 'Em separação'], ['E', 'Em trânsito']];

  const COLS_T = [
    { k: 'statusLabel', label: 'Situação', get: t => t.statusLabel || '', tipo: 'txt' },
    { k: 'data', label: 'Solicitado em', get: t => t.data || '', tipo: 'txt' },
    { k: 'codigo', label: 'Código', get: t => t.codigo || 0, tipo: 'num' },
    { k: 'rota', label: 'Origem → Destino', get: t => `${t.origem} ${t.destino}`, tipo: 'txt' },
    { k: 'dias', label: 'Parada há', get: t => t.dias || 0, tipo: 'num', center: true },
    { k: 'itens', label: 'Itens', get: t => t.itens || 0, tipo: 'num', center: true },
    { k: 'valor', label: 'Valor', get: t => t.valor || 0, tipo: 'num', center: true },
  ];
  const transfFiltradas = (dados?.transferencias || []).filter(t => !filtroSt || t.status === filtroSt);
  const { linhas: linhasT, ordem: ordemT, clicar: clicarT, seta: setaT } = useOrdenavel(transfFiltradas, COLS_T, { col: 'dias', dir: 'desc' });
  const [drill, setDrill] = useState(null); const [itensDrill, setItensDrill] = useState(null);
  const abrir = (t) => { setDrill(t); setItensDrill(null); API.get(`/compras/pedidos-transferencia/${t.id}/itens`).then(r => setItensDrill(r.data.itens || [])).catch(() => setItensDrill([])); };

  if (erro) return <div style={{ ...s.card, color: CORES.vermelho }}>⚠️ {erro}</div>;
  if (!dados) return <div style={s.card}>Carregando transferências do ERP…</div>;
  const r = dados.resumo;

  return (
    <div>
      <MetasInline API={API} gestao={gestao} chaves={['transf_dias']} onSaved={() => carregar(dias, loja, comprador)} />
      <div style={{ marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <LojaSelect lojas={lojas} value={loja} onChange={setLoja} />
        <select value={comprador} onChange={e => setComprador(e.target.value)} style={{ ...s.inp, padding: '6px 8px' }} title="filtrar transferências que têm produtos deste comprador">
          <option value="">Todos os compradores</option>{comps.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <Kpi titulo="Pendentes" valor={r.pendentes} />
        <Kpi titulo={`Atrasadas (>${dados.diasAceitavel}d)`} valor={r.atrasadas} cor={r.atrasadas ? CORES.vermelho : CORES.verde} />
        <Kpi titulo="Valor parado" valor={brl(r.valorParado)} />
        <Kpi titulo="Mais antiga" valor={r.maisAntigaDias + ' dias'} cor={r.maisAntigaDias > dados.diasAceitavel ? CORES.vermelho : '#333'} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12.5, color: '#666', flexWrap: 'wrap' }}>
        <span>Situação:</span>
        {STATUS_OPC.map(([v, l]) => (
          <button key={v} onClick={() => setFiltroSt(v)} style={{ border: '1px solid ' + (filtroSt === v ? '#0d6b5e' : '#e3e8ea'), background: filtroSt === v ? '#eef7f2' : '#fff', color: filtroSt === v ? '#0d6b5e' : '#555', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
        ))}
        <span style={{ width: 1, height: 18, background: '#e5e7eb', margin: '0 4px' }} />
        <span>Considerar atrasada acima de</span>
        <select value={dias} onChange={e => setDias(Number(e.target.value))} style={{ ...s.inp, padding: '5px 8px' }}>
          {[3, 5, 7, 10, 15, 30].map(d => <option key={d} value={d}>{d} dias</option>)}
        </select>
      </div>
      <div style={{ fontSize: 11.5, color: '#64748b', background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 8, padding: '7px 11px', marginBottom: 10 }}>
        <b>O que é cada situação:</b> <span style={{ color: '#666' }}>⬜ <b>Aberta</b> — pedido de transferência criado, ainda não começou a separar.</span> · <span style={{ color: '#B7791F' }}>🟨 <b>Em separação</b> — a loja de origem está separando os produtos.</span> · <span style={{ color: '#2E5C9E' }}>🟦 <b>Em trânsito</b> — já saiu da origem e está a caminho do destino.</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={s.tab}>
          <thead><tr>{COLS_T.map(c => <ThOrd key={c.k} c={c} ordem={ordemT} clicar={clicarT} seta={setaT} base={s.th} />)}</tr></thead>
          <tbody>
            {linhasT.map(t => (
              <tr key={t.id} onClick={() => abrir(t)} title="ver os produtos desta transferência" style={{ borderTop: '1px solid #f0f0f0', background: t.atrasada ? '#FDF6F5' : '#fff', cursor: 'pointer' }}>
                <td style={s.td}><span style={{ ...s.badge, background: t.status === 'E' ? '#EAF1FB' : t.status === 'S' ? '#FCF3E2' : '#F0F0F0', color: t.status === 'E' ? '#2E5C9E' : t.status === 'S' ? '#B7791F' : '#666' }}>{t.statusLabel}</span></td>
                <td style={{ ...s.td, color: '#555', whiteSpace: 'nowrap' }}>{dataBR(t.data)}</td>
                <td style={{ ...s.td, color: '#888' }}>#{t.codigo}</td>
                <td style={{ ...s.td, fontWeight: 600 }}>{t.origem} <span style={{ color: '#bbb' }}>→</span> {t.destino}</td>
                <td style={{ ...s.td, textAlign: 'center', color: t.atrasada ? CORES.vermelho : '#333', fontWeight: t.atrasada ? 700 : 400 }}>{t.dias}d</td>
                <td style={{ ...s.td, textAlign: 'center' }}>{t.itens}</td>
                <td style={{ ...s.td, textAlign: 'center' }}>{brl(t.valor)}</td>
              </tr>
            ))}
            {transfFiltradas.length === 0 && <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color: '#aaa' }}>{dados.transferencias.length === 0 ? 'Nenhuma transferência pendente. 🎉' : 'Nenhuma nesta situação.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ ...s.card, marginTop: 12, background: '#FAFAFA', fontSize: 12, color: '#888' }}>
        🚧 <b>Curva ABC de estoque</b> e <b>sugestão automática de remanejamento</b> (excesso numa loja → falta em outra) entram junto com a fase de <b>CMV/custo</b>, que traz o custo de estoque necessário para esses cálculos.
      </div>
      {drill && (
        <div onClick={() => setDrill(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 18, width: '100%', maxWidth: 700, maxHeight: '82vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Pedido de Transferência #{drill.codigo} · {drill.origem} → {drill.destino}</div>
              <button onClick={() => setDrill(null)} style={s.btnMini}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: '#888', margin: '4px 0 10px' }}>{drill.statusLabel} · parado há {drill.dias}d · {drill.itens} item(ns) · {brl(drill.valor)}</div>
            {!itensDrill ? <div style={{ fontSize: 13, color: '#888' }}>Carregando produtos…</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={s.tab}>
                  <thead><tr><th style={{ ...s.th, textAlign: 'left' }}>Produto</th><th style={{ ...s.th, textAlign: 'center' }}>Qtd</th><th style={{ ...s.th, textAlign: 'right' }}>Valor</th></tr></thead>
                  <tbody>
                    {itensDrill.map(it => (
                      <tr key={it.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                        <td style={s.td}>{it.descricao}{it.lote ? <span style={{ color: '#aaa', fontSize: 11 }}> · lote {it.lote}</span> : ''}{it.ean ? <span style={{ color: '#ccc', fontSize: 11 }}> · {it.ean}</span> : ''}</td>
                        <td style={{ ...s.td, textAlign: 'center' }}>{it.qtd}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{brl(it.valor)}</td>
                      </tr>
                    ))}
                    {itensDrill.length === 0 && <tr><td colSpan={3} style={{ ...s.td, textAlign: 'center', color: '#aaa' }}>Sem itens nesta transferência.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Alertas → tarefas automáticas ─────────────────────────────────────────
const CAT_INFO = {
  ped10k: ['💰', 'Pedido acima de R$10k', '#2E5C9E'],
  marcanova: ['🏷️', 'Marca nova', '#7A4Fb0'],
  itensnovos: ['✨', 'Itens novos → Marketing', '#B7791F'],
  semvenda: ['🐌', 'Comprado sem venda (1 mês)', '#C0392B'],
};
function Alertas({ API, gestao }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [sinc, setSinc] = useState(false);
  const [filtro, setFiltro] = useState('todos'); // categoria ou 'todos'
  const carregar = useCallback(() => {
    API.get('/compras/alertas').then(r => setDados(r.data)).catch(e => setErro(e.response?.data?.erro || 'Falha ao carregar.'));
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const sincronizar = () => { setSinc(true); API.post('/compras/alertas/sincronizar').then(() => { setSinc(false); carregar(); }).catch(() => setSinc(false)); };

  if (erro) return <div style={{ ...s.card, color: CORES.vermelho }}>⚠️ {erro}</div>;
  if (!dados) return <div style={s.card}>Carregando alertas…</div>;

  // contagem por categoria (na ordem do CAT_INFO, + o que sobrar)
  const cont = {};
  dados.alertas.forEach(a => { cont[a.categoria] = (cont[a.categoria] || 0) + 1; });
  const cats = [...Object.keys(CAT_INFO).filter(c => cont[c]), ...Object.keys(cont).filter(c => !CAT_INFO[c])];
  const lista = filtro === 'todos' ? dados.alertas : dados.alertas.filter(a => a.categoria === filtro);

  return (
    <div>
      <div style={{ ...s.card, background: '#F4F8FC', borderColor: '#DCE9F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12.5, color: '#33506B' }}>
          🔔 Eventos de compra viram <b>tarefas automáticas</b>: pedido &gt; R$10k → Diretor · marca nova → Diretor+Supervisor · item novo → Marketing · comprado sem venda em 1 mês → Comprador.
        </div>
        {gestao && <button onClick={sincronizar} disabled={sinc} style={s.btn}>{sinc ? 'Sincronizando…' : '🔄 Sincronizar agora'}</button>}
      </div>
      {/* Filtro por tipo de tarefa */}
      {dados.alertas.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <button onClick={() => setFiltro('todos')} style={{ ...s.chip, ...(filtro === 'todos' ? s.chipOn : {}) }}>Todos ({dados.alertas.length})</button>
          {cats.map(c => {
            const info = CAT_INFO[c] || ['🔔', c, '#666'];
            return <button key={c} onClick={() => setFiltro(c)} style={{ ...s.chip, ...(filtro === c ? s.chipOn : {}) }}>{info[0]} {info[1]} ({cont[c]})</button>;
          })}
        </div>
      )}
      {lista.length === 0 && <div style={s.card}>Nenhum alerta {filtro !== 'todos' ? 'desse tipo' : 'no momento'}.</div>}
      {lista.map(a => {
        const [emoji, label, cor] = CAT_INFO[a.categoria] || ['🔔', a.categoria, '#666'];
        const temLista = a.categoria === 'itensnovos' || a.categoria === 'semvenda';
        const intro = temLista && a.descricao ? a.descricao.split('\n')[0] : a.descricao;
        return (
          <div key={a.id} style={{ ...s.card, borderLeft: `4px solid ${cor}`, opacity: a.status === 'concluido' ? 0.55 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{emoji} {a.titulo}</div>
              <span style={{ ...s.badge, background: '#F2F2F2', color: cor }}>{label}</span>
            </div>
            {intro && <div style={{ fontSize: 12, color: '#666', marginTop: 5, whiteSpace: 'pre-line' }}>{intro}</div>}
            {temLista && <AlertaItensInline refId={a.referencia_id} />}
            <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
              {a.tipo === 'notificacao' ? '🔕 Notificação' : '📋 Tarefa'}
              {a.responsavel ? ` · responsável: ${a.responsavel}` : ''}{a.apoio ? ` · apoio: ${a.apoio}` : ''}
              {a.status === 'concluido' ? ' · ✅ concluído' : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Editor de metas reutilizável (sugeridas + editáveis) ───────────────────
function MetasInline({ API, gestao, chaves, onSaved, comprador, compradorNome }) {
  const [metas, setMetas] = useState(null);
  const [draft, setDraft] = useState({});
  const [open, setOpen] = useState(false);
  const carregar = useCallback(() => API.get('/compras/metas', { params: { comprador: comprador || undefined } }).then(r => setMetas(r.data.metas)).catch(() => {}), [API, comprador]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!metas) return null;
  const itens = chaves.map(k => [k, metas[k]]).filter(([, m]) => m);
  const salvar = () => API.put('/compras/metas', draft, { params: { comprador: comprador || undefined } }).then(() => { setDraft({}); setOpen(false); carregar(); onSaved && onSaved(); });
  const fmt = m => m.valor != null ? m.valor : `${comprador ? (m.geral != null ? `geral: ${m.geral}` : `sugerida: ${m.sugerido ?? '—'}`) : `sugerida: ${m.sugerido ?? '—'}`}`;
  return (
    <div style={{ ...s.card, background: '#FBFAF7', borderColor: '#EDE7DA', padding: '10px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12.5, color: '#7A6E52' }}>🎯 <b>Metas {comprador ? `de ${compradorNome || 'comprador'}` : 'desta tela (geral)'}:</b> {itens.map(([k, m]) => <span key={k} style={s.tag}>{m.label}: {fmt(m)}{m.un && m.un !== 'R$' ? m.un : ''}</span>)}</div>
        {gestao && <button onClick={() => setOpen(o => !o)} style={s.btnMini}>{open ? 'Fechar' : (comprador ? 'Ajustar metas do comprador' : 'Ajustar metas')}</button>}
      </div>
      {open && (
        <div style={{ marginTop: 10, borderTop: '1px solid #EDE7DA', paddingTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {comprador && <div style={{ width: '100%', fontSize: 11.5, color: '#8a7a54' }}>Editando as metas <b>só de {compradorNome || 'este comprador'}</b>. Em branco = herda a meta geral.</div>}
          {itens.map(([k, m]) => (
            <label key={k} style={s.lbl}>{m.label} {m.un ? `(${m.un})` : ''}
              <input type="number" step="any" defaultValue={m.valor ?? ''} placeholder={comprador ? `geral ${m.geral ?? m.sugerido ?? ''}` : `sugerida ${m.sugerido ?? ''}`}
                onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} style={{ ...s.inp, width: 150 }} />
            </label>
          ))}
          <button onClick={salvar} style={s.btn}>Salvar metas</button>
          <span style={{ fontSize: 11, color: '#aaa' }}>Deixe em branco para {comprador ? 'herdar a meta geral' : 'voltar à meta sugerida'}.</span>
        </div>
      )}
    </div>
  );
}

// ── Indicadores de estoque (Fase 5) ────────────────────────────────────────
// Painel de evolução do estoque: gráfico de nível (cresceu/diminuiu) + variação mensal + linhas que impactam.
function EvolucaoEstoque({ API, loja, comprador }) {
  const [meses, setMeses] = useState(6);
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    setD(null); setErro('');
    API.get('/compras/estoque-evolucao', { params: { loja: loja || undefined, comprador: comprador || undefined, meses } })
      .then(r => { if (r.data.erro) setErro(r.data.erro); else setD(r.data); }).catch(e => setErro(e.response?.data?.erro || 'Falha.'));
  }, [API, loja, comprador, meses]);

  const box = { marginTop: 14, background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '12px 14px' };
  if (erro) return <div style={box}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📊 Evolução do estoque</div><div style={{ color: CORES.vermelho, fontSize: 12 }}>⚠️ {erro}</div></div>;
  if (!d) return <div style={box}><div style={{ fontSize: 13, fontWeight: 700 }}>📊 Evolução do estoque</div><div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>Carregando…</div></div>;

  const serie = d.serie || [];
  const cresceu = d.netPeriodo >= 0;
  const corTend = cresceu ? CORES.verde : CORES.vermelho;
  const maxLinha = Math.max(1, ...[...d.subindo, ...d.caindo].map(l => Math.abs(l.net)));

  // Gráfico: linha do NÍVEL de estoque + barras da VARIAÇÃO mensal (verde sobe / vermelho desce).
  // viewBox largo e baixo → no 100% da largura o gráfico fica compacto (não gigante).
  const W = 1180, H = 200, padL = 8, padR = 8, padT = 14, padB = 30;
  const iw = W - padL - padR, ih = H - padT - padB;
  const niveis = serie.map(s => s.nivelFim);
  const nMin = Math.min(...niveis), nMax = Math.max(...niveis);
  const nRange = nMax - nMin || 1;
  const nets = serie.map(s => s.net);
  const netMax = Math.max(1, ...nets.map(Math.abs));
  const bw = serie.length ? iw / serie.length : iw;
  const xC = i => padL + bw * i + bw / 2;
  const yN = v => padT + ih - ((v - nMin) / nRange) * ih; // nível
  const zeroY = padT + ih; // barras a partir do eixo inferior
  const barH = v => (Math.abs(v) / netMax) * (ih * 0.42);

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>📊 Evolução do estoque</div>
        <div style={{ fontSize: 13 }}>
          {cresceu ? '▲ cresceu' : '▼ diminuiu'} <b style={{ color: corTend }}>{brl(Math.abs(d.netPeriodo))}</b>
          {d.variacaoPct != null && <span style={{ color: corTend }}> ({cresceu ? '+' : ''}{d.variacaoPct}%)</span>}
          <span style={{ color: '#999' }}> em {d.meses} meses · hoje <b>{brl(d.valorAtual)}</b></span>
        </div>
        <select value={meses} onChange={e => setMeses(Number(e.target.value))} style={{ ...s.inp, padding: '4px 6px', fontSize: 12, marginLeft: 'auto' }}>
          {[3, 6, 12].map(m => <option key={m} value={m}>{m} meses</option>)}
        </select>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 380, height: 'auto', display: 'block' }}>
          {/* barras de variação mensal */}
          {serie.map((sPt, i) => {
            const up = sPt.net >= 0; const h = barH(sPt.net);
            return <rect key={'b' + i} x={xC(i) - bw * 0.28} y={up ? zeroY - h : zeroY} width={bw * 0.56} height={h}
              fill={up ? '#CDE9D6' : '#F6D3CC'} rx={2} />;
          })}
          {/* eixo zero das barras */}
          <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="#eee" />
          {/* linha do nível de estoque */}
          <polyline fill="none" stroke="#185FA5" strokeWidth={2.5}
            points={serie.map((sPt, i) => `${xC(i)},${yN(sPt.nivelFim)}`).join(' ')} />
          {serie.map((sPt, i) => (
            <g key={'p' + i}>
              <circle cx={xC(i)} cy={yN(sPt.nivelFim)} r={3.5} fill="#185FA5" />
              <text x={xC(i)} y={yN(sPt.nivelFim) - 8} textAnchor="middle" fontSize={10.5} fill="#185FA5" fontWeight="600">{(sPt.nivelFim / 1000).toFixed(0)}k</text>
              <text x={xC(i)} y={H - 18} textAnchor="middle" fontSize={11} fill="#666">{sPt.mesLabel}</text>
              <text x={xC(i)} y={H - 5} textAnchor="middle" fontSize={9.5} fill={sPt.net >= 0 ? CORES.verde : CORES.vermelho}>{sPt.net >= 0 ? '+' : ''}{Math.round(sPt.net / 1000)}k</text>
            </g>
          ))}
        </svg>
      </div>
      <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>Linha azul = valor do estoque a custo ao fim de cada mês. Barras = variação do mês (verde entrou mais do que saiu, vermelho saiu mais).</div>

      {/* Linhas que puxam pra cima / pra baixo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14, marginTop: 12 }}>
        <LinhasImpacto titulo="🔺 Puxando o estoque pra cima" itens={d.subindo} max={maxLinha} cor={CORES.verde} />
        <LinhasImpacto titulo="🔻 Puxando o estoque pra baixo" itens={d.caindo} max={maxLinha} cor={CORES.vermelho} />
      </div>
    </div>
  );
}

function LinhasImpacto({ titulo, itens, max, cor }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#444' }}>{titulo}</div>
      {(!itens || itens.length === 0) && <div style={{ fontSize: 12, color: '#bbb' }}>—</div>}
      {(itens || []).map((l, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 2 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }} title={l.linha}>{l.linha}</span>
            <b style={{ color: cor, whiteSpace: 'nowrap' }}>{l.net >= 0 ? '+' : ''}{brl(l.net)}</b>
          </div>
          <div style={{ height: 6, background: '#f1f1f1', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: Math.max(3, Math.round(Math.abs(l.net) / max * 100)) + '%', height: '100%', background: cor }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Aba RUPTURA — por loja, curva e classificação, com custo (venda perdida) e drill nos produtos.
function RupturaAba({ API }) {
  const nf = n => (Number(n) || 0).toLocaleString('pt-BR');
  const lojas = useLojas(API);
  const [compradores, setCompradores] = useState([]);
  const [loja, setLoja] = useState('');
  const [comprador, setComprador] = useState('');
  const [fatorPct, setFatorPct] = useState(43);
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [drill, setDrill] = useState(null);
  useEffect(() => { API.get('/compras/compradores').then(r => setCompradores(r.data.compradores || [])).catch(() => {}); }, [API]);
  const fator = Math.min(1, Math.max(0.01, (Number(fatorPct) || 43) / 100));
  const carregar = useCallback(() => {
    setErro(''); setD(null);
    API.get('/compras/ruptura', { params: { loja: loja || undefined, comprador: comprador || undefined, fator } })
      .then(r => { if (r.data.erro && !r.data.porLoja) setErro(r.data.erro); else setD(r.data); })
      .catch(e => setErro(e.response?.data?.erro || 'Falha ao carregar ruptura.'));
  }, [API, loja, comprador, fator]);
  useEffect(() => { carregar(); }, [carregar]);
  const abrirDrill = (titulo, extra) => {
    setDrill({ titulo, produtos: null });
    API.get('/compras/ruptura-produtos', { params: { loja: loja || undefined, comprador: comprador || undefined, fator, ...extra } })
      .then(r => setDrill({ titulo, produtos: r.data.produtos || [], total: r.data.total || 0, remanejaveis: r.data.remanejaveis || 0 }))
      .catch(() => setDrill({ titulo, produtos: [], total: 0 }));
  };
  const CURVA_COR = { A: '#1E874B', B: '#B7791F', C: '#C0392B', D: '#7A7A7A' };
  const exportar = () => {
    API.get('/compras/ruptura-export', { params: { loja: loja || undefined, comprador: comprador || undefined, fator }, responseType: 'blob' })
      .then(r => { const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'ruptura-reposicao.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); })
      .catch(() => {});
  };
  const filtros = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
      <LojaSelect lojas={lojas} value={loja} onChange={setLoja} />
      <select value={comprador} onChange={e => setComprador(e.target.value)} style={{ ...s.inp, padding: '6px 8px' }}>
        <option value="">👥 Todos os compradores</option>
        {compradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <label style={{ fontSize: 11.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>% que não volta (custo)
        <input type="number" min="1" max="100" value={fatorPct} onChange={e => setFatorPct(e.target.value)} style={{ ...s.inp, width: 64, padding: '6px 8px' }} /></label>
      <button onClick={exportar} title="Exporta a lista de reposição (código Alpha 7 + EAN + quantidade) pra subir no Alpha e mandar ao fornecedor" style={{ ...s.inp, padding: '6px 11px', cursor: 'pointer', background: '#0E7C5A', color: '#fff', border: '1px solid transparent', fontWeight: 700 }}>⬇️ Exportar p/ Alpha 7</button>
    </div>
  );
  if (erro) return <div style={s.card}>{filtros}<div style={{ color: CORES.vermelho }}>⚠️ {erro}</div></div>;
  if (!d) return <div style={s.card}>{filtros}Calculando ruptura do ERP… (pode levar alguns segundos)</div>;
  const t = d.totais || {};
  const Tabela = ({ titulo, linhas, col1, chave, corFn, onLinha }) => (
    <div style={{ ...s.card, flex: '1 1 300px', minWidth: 0 }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>{titulo}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ color: '#64748b', borderBottom: '2px solid #eef1f4' }}>
            {[col1, 'SKUs', 'Ruptura', 'Venda/mês', 'Custo/mês'].map((h, i) => <th key={h} style={{ padding: '6px 8px', textAlign: i ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan={5} style={{ padding: 10, color: '#aaa' }}>Sem ruptura.</td></tr>}
            {linhas.map((r, i) => (
              <tr key={i} onClick={() => onLinha(r)} style={{ borderTop: '1px solid #f3f4f6', cursor: 'pointer' }} title="ver produtos">
                <td style={{ padding: '6px 8px', fontWeight: 600, color: corFn ? corFn(r) : '#334' }}>{r[chave]}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{nf(r.emRuptura)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.pct != null ? r.pct + '%' : '—'}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#B45309' }}>{brl(r.vendaRuptura)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: CORES.vermelho }}>{brl(r.custo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
  return (
    <div style={s.card}>
      {filtros}
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
        🚨 <b>Ruptura</b> = de tudo que <b>vendeu nos últimos 30 dias</b>, quantos itens estão <b>hoje com estoque zero</b>. O <b>custo</b> estima a venda perdida (venda recente dos itens em falta × <b>{Math.round(fator * 100)}%</b> que não se recupera — cliente vai a outra loja ou desiste). Clique numa linha para ver os produtos.
      </div>
      {t.bloqueados > 0 && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, background: '#f8fafc', border: '1px solid #eef1f4', borderRadius: 8, padding: '7px 10px' }}>🔒 <b>{nf(t.bloqueados)}</b> item(ns) <b>bloqueado(s) para compra</b> estão zerados — ficam <b>fora</b> da ruptura (é decisão comercial, não falta).</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <Kpi titulo="SKUs em ruptura" valor={nf(t.emRuptura || 0) + ' de ' + nf(t.comVenda || 0)} />
        <Kpi titulo="Ruptura (contagem)" valor={(t.pct || 0) + '%'} cor={t.pct > 10 ? CORES.vermelho : t.pct > 5 ? CORES.amarelo : CORES.verde} />
        <Kpi titulo="Ruptura ponderada (venda)" valor={(t.pctPonderada || 0) + '%'} cor={t.pctPonderada > 8 ? CORES.vermelho : t.pctPonderada > 4 ? CORES.amarelo : CORES.verde} />
        <Kpi titulo="Venda em falta / mês" valor={brl(t.vendaRuptura || 0)} cor="#B45309" />
        <Kpi titulo={`Custo (não volta ${Math.round(fator * 100)}%)`} valor={brl(t.custo || 0)} cor={CORES.vermelho} />
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {!d.lojaId && <Tabela titulo="📍 Por loja" linhas={d.porLoja} col1="Loja" chave="loja" onLinha={r => abrirDrill('Ruptura — ' + r.loja, { loja: r.loja_id })} />}
        <Tabela titulo="🔤 Por curva ABC" linhas={d.porCurva} col1="Curva" chave="curva" corFn={r => CURVA_COR[r.curva]} onLinha={r => abrirDrill('Ruptura — curva ' + r.curva, { curva: r.curva })} />
        <Tabela titulo="🏷️ Por classificação" linhas={d.porClassificacao.slice(0, 15)} col1="Classificação" chave="classif" onLinha={r => abrirDrill('Ruptura — ' + r.classif, { classif: r.classif })} />
      </div>
      {drill && (
        <div onClick={() => setDrill(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 16, width: 'min(780px,95vw)', maxHeight: '82vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <b style={{ fontSize: 14 }}>{drill.titulo}</b>
              {drill.produtos && <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 8 }}>{nf(drill.total)} produto(s){drill.remanejaveis ? ' · ' + nf(drill.remanejaveis) + ' com estoque em outra loja (remanejável)' : ''}</span>}
              <button onClick={() => setDrill(null)} style={{ marginLeft: 'auto', border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', padding: '3px 9px', cursor: 'pointer' }}>✕</button>
            </div>
            {!drill.produtos ? <div style={{ color: '#94a3b8', padding: 10 }}>carregando…</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ color: '#64748b', borderBottom: '2px solid #eef1f4' }}>
                    {['Produto', 'Loja', 'Curva', 'Classificação', 'Vendeu 30d', 'Qtd', 'Perda est.', 'Remanejar de (estoque)'].map((h, i) => <th key={h} style={{ padding: '6px 8px', textAlign: (i > 3 && i < 7) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {drill.produtos.length === 0 && <tr><td colSpan={8} style={{ padding: 10, color: '#aaa' }}>Nenhum produto.</td></tr>}
                    {drill.produtos.map((p, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>{p.descricao}</td>
                        <td style={{ padding: '6px 8px', color: '#64748b', whiteSpace: 'nowrap' }}>{p.loja}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: CURVA_COR[p.curva] || '#334' }}>{p.curva}</td>
                        <td style={{ padding: '6px 8px', color: '#64748b' }}>{p.classif}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{brl(p.venda30d)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{nf(p.qtd30d)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: CORES.vermelho }}>{brl(p.perdido)}</td>
                        <td style={{ padding: '6px 8px', color: p.remanejar ? '#15803d' : '#cbd5e1', fontSize: 11.5 }}>{p.remanejar || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EstoqueIndicadores({ API }) {
  const lojas = useLojas(API);
  const [compradores, setCompradores] = useState([]);
  const [loja, setLoja] = useState('');
  const [comprador, setComprador] = useState('');
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => { API.get('/compras/compradores').then(r => setCompradores(r.data.compradores || [])).catch(() => {}); }, [API]);
  const carregar = useCallback(() => { setErro(''); setD(null); API.get('/compras/estoque-indicadores', { params: { loja: loja || undefined, comprador: comprador || undefined } }).then(r => { if (r.data.erro) setErro(r.data.erro); else setD(r.data); }).catch(e => setErro(e.response?.data?.erro || 'Falha.')); }, [API, loja, comprador]);
  useEffect(() => { carregar(); }, [carregar]);
  const filtros = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
      <LojaSelect lojas={lojas} value={loja} onChange={setLoja} />
      <select value={comprador} onChange={e => setComprador(e.target.value)} style={{ ...s.inp, padding: '6px 8px' }}>
        <option value="">👥 Todos os compradores</option>
        {compradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
    </div>
  );
  if (erro) return <div style={s.card}>{filtros}<div style={{ color: CORES.vermelho }}>⚠️ {erro}</div></div>;
  if (!d) return <div style={s.card}>{filtros}Carregando estoque…</div>;
  const cor = st => ({ verde: CORES.verde, amarelo: CORES.amarelo, vermelho: CORES.vermelho, cinza: '#999' }[st]);
  const abcTot = d.curvaABC.A.venda + d.curvaABC.B.venda + d.curvaABC.C.venda || 1;
  const ABC = { A: ['#1E874B', 'Curva A (giro alto)'], B: ['#B7791F', 'Curva B (giro médio)'], C: ['#C0392B', 'Curva C (giro baixo)'], D: ['#7A7A7A', 'Curva D (sem giro / parado)'] };

  return (
    <div style={s.card}>
      {filtros}
      <MetasInline API={API} gestao chaves={['ruptura_max', 'cobertura_min', 'cobertura_max', 'conversao_novos_janela', 'conversao_novos_meta']} onSaved={carregar}
        comprador={comprador || undefined} compradorNome={(compradores.find(c => String(c.id) === String(comprador)) || {}).nome} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <Kpi titulo="Estoque (a custo)" valor={brl(d.estoque.valor)} />
        <Kpi titulo={`Ruptura (meta ≤${d.ruptura.meta}%)`} valor={d.ruptura.pct + '%'} cor={cor(d.ruptura.semaforo)} />
        <Kpi titulo={`Cobertura (meta ${d.cobertura.min}-${d.cobertura.max}d)`} valor={d.cobertura.dias != null ? d.cobertura.dias + ' dias' : '—'} cor={cor(d.cobertura.semaforo)} />
        <Kpi titulo="Excesso p/ remanejar" valor={brl(d.orcamentoEstoque.excesso)} cor={d.orcamentoEstoque.excesso > 0 ? CORES.vermelho : CORES.verde} />
        {d.produtosNovos && <Kpi titulo={`Conversão produtos novos (meta ≥${d.produtosNovos.meta}%)`} valor={d.produtosNovos.pct != null ? d.produtosNovos.pct + '%' : '—'} cor={cor(d.produtosNovos.semaforo)} />}
      </div>
      {/* Conversão / maturidade de produtos novos */}
      {d.produtosNovos && d.produtosNovos.total > 0 && (
        <div style={{ marginTop: 12, background: '#FAFAF7', border: '1px solid #eee', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#555' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#333' }}>🌱 Maturidade de produtos novos (compra em {d.produtosNovos.janelaDias} dias)</div>
          <b>{d.produtosNovos.total}</b> produtos novos comprados · <b style={{ color: CORES.verde }}>{d.produtosNovos.convertidos}</b> já venderam ({d.produtosNovos.pct}%) · <b style={{ color: CORES.vermelho }}>{d.produtosNovos.parados}</b> parados.
          {d.produtosNovos.diasMedio != null && <span> Tempo médio até a 1ª venda: <b>{d.produtosNovos.diasMedio} dias</b>.</span>}
          {d.produtosNovos.valorParado > 0 && <span style={{ color: CORES.vermelho }}> <b>{brl(d.produtosNovos.valorParado)}</b> parados em estoque de produtos que ainda não venderam.</span>}
        </div>
      )}
      <div style={{ fontSize: 12, color: '#777', marginTop: 10 }}>
        <b>Orçamento de estoque aceitável:</b> entre {brl(d.orcamentoEstoque.alvoMin)} e {brl(d.orcamentoEstoque.alvoMax)} (cobertura de {d.cobertura.min}–{d.cobertura.max} dias × custo/dia {brl(d.cobertura.custoDia)}).
        {d.orcamentoEstoque.excesso > 0 && <span style={{ color: CORES.vermelho }}> Há <b>{brl(d.orcamentoEstoque.excesso)}</b> acima do teto — candidato a redução/remanejamento entre lojas.</span>}
        {d.orcamentoEstoque.falta > 0 && <span style={{ color: CORES.amarelo }}> Faltam <b>{brl(d.orcamentoEstoque.falta)}</b> para o piso de cobertura.</span>}
      </div>
      {/* Curva ABCD */}
      {(() => {
        const totItens = ['A', 'B', 'C', 'D'].reduce((s, c) => s + ((d.curvaABC[c] && d.curvaABC[c].n) || 0), 0) || 1;
        return (
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📈 Curva ABCD de estoque</div>

        {/* Barra 1: representatividade na VENDA (Pareto 80/15/5) — só A/B/C, que têm giro */}
        <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>Participação na <b>venda</b> (90 dias)</div>
        <div style={{ display: 'flex', height: 24, borderRadius: 8, overflow: 'hidden', border: '1px solid #eee' }}>
          {['A', 'B', 'C'].map(c => {
            const pct = Math.round(d.curvaABC[c].venda / abcTot * 100);
            return pct > 0 ? <div key={c} title={`${ABC[c][1]}: ${pct}% da venda`} style={{ width: pct + '%', background: ABC[c][0], color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c} {pct}%</div> : null;
          })}
        </div>

        {/* Barra 2: representatividade do ESTOQUE (R$ a custo) por curva — a "gordura" parada */}
        {(() => {
          const totVal = ['A', 'B', 'C', 'D'].reduce((s, c) => s + ((d.curvaABC[c] && d.curvaABC[c].valor) || 0), 0) || 1;
          return (<>
            <div style={{ fontSize: 11, color: '#888', margin: '10px 0 3px' }}>Participação no <b>estoque (R$ a custo)</b> — total {brl(totVal)}</div>
            <div style={{ display: 'flex', height: 24, borderRadius: 8, overflow: 'hidden', border: '1px solid #eee' }}>
              {['A', 'B', 'C', 'D'].map(c => {
                const val = (d.curvaABC[c] && d.curvaABC[c].valor) || 0;
                const pct = Math.round(val / totVal * 100);
                return pct > 0 ? <div key={c} title={`${ABC[c][1]}: ${pct}% do estoque (${brl(val)})`} style={{ width: pct + '%', background: ABC[c][0], color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c} {pct}%</div> : null;
              })}
            </div>
          </>);
        })()}

        {/* Barra 3: representatividade por Nº DE ITENS (SKUs) */}
        <div style={{ fontSize: 11, color: '#888', margin: '10px 0 3px' }}>Participação por <b>nº de itens</b> (SKUs em estoque)</div>
        <div style={{ display: 'flex', height: 24, borderRadius: 8, overflow: 'hidden', border: '1px solid #eee' }}>
          {['A', 'B', 'C', 'D'].map(c => {
            const n = (d.curvaABC[c] && d.curvaABC[c].n) || 0;
            const pct = Math.round(n / totItens * 100);
            return pct > 0 ? <div key={c} title={`${ABC[c][1]}: ${pct}% dos itens (${n})`} style={{ width: pct + '%', background: ABC[c][0], color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c} {pct}%</div> : null;
          })}
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
          {['A', 'B', 'C'].map(c => (
            <div key={c} style={{ fontSize: 12, color: '#555' }}>
              <span style={{ ...s.dot, background: ABC[c][0], marginRight: 5 }} />{ABC[c][1]}: <b>{d.curvaABC[c].n}</b> itens · estoque <b>{brl(d.curvaABC[c].valor || 0)}</b> · venda {brl(d.curvaABC[c].venda)}
            </div>
          ))}
          {d.curvaABC.D && (
            <div style={{ fontSize: 12, color: '#555' }}>
              <span style={{ ...s.dot, background: ABC.D[0], marginRight: 5 }} />{ABC.D[1]}: <b>{d.curvaABC.D.n}</b> itens ({Math.round(d.curvaABC.D.n / totItens * 100)}%) · <b style={{ color: CORES.vermelho }}>{brl(d.curvaABC.D.valor)}</b> parado
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
          Padrão de mercado (Pareto): <b>A</b> = 80% da venda, <b>B</b> = próximos 15%, <b>C</b> = últimos 5%. <b>D</b> = tem estoque mas <b>não vendeu nada em 90 dias</b> (dinheiro parado) — candidato a liquidação/remanejamento ou devolução. Por isso a D só aparece na barra de itens (não tem venda).
        </div>
      </div>
        );
      })()}
      {/* Evolução do estoque: cresceu/diminuiu + linha que impacta (no fim, compacto) */}
      <EvolucaoEstoque API={API} loja={loja} comprador={comprador} />
    </div>
  );
}

// ── Faltas da loja × comprador (cobrança) ──────────────────────────────────
function Faltas({ API, gestao }) {
  const lojas = useLojas(API);
  const [compradores, setCompradores] = useState([]);
  const [loja, setLoja] = useState('');
  const [comprador, setComprador] = useState('');
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => { API.get('/compras/compradores').then(r => setCompradores(r.data.compradores || [])).catch(() => {}); }, [API]);
  const carregar = useCallback(() => {
    setErro(''); setD(null);
    API.get('/compras/faltas', { params: { loja: loja || undefined, comprador: comprador || undefined } })
      .then(r => { if (r.data.erro) setErro(r.data.erro); else setD(r.data); }).catch(e => setErro(e.response?.data?.erro || 'Falha.'));
  }, [API, loja, comprador]);
  useEffect(() => { carregar(); }, [carregar]);
  const cor = st => ({ verde: CORES.verde, amarelo: CORES.amarelo, vermelho: CORES.vermelho }[st] || '#333');
  const R = d && d.resumo;
  const [classFiltro, setClassFiltro] = useState('');
  const COLS_F = [
    { k: 'dias', label: 'Há', get: i => i.dias, tipo: 'num' },
    { k: 'descricao', label: 'Produto', get: i => i.descricao || '', tipo: 'txt' },
    { k: 'classificacao', label: 'Classificação', get: i => i.classificacao || '', tipo: 'txt' },
    { k: 'loja', label: 'Loja', get: i => i.loja || '', tipo: 'txt' },
    { k: 'lancadaPor', label: 'Lançada por', get: i => i.lancadaPor || '', tipo: 'txt' },
    { k: 'comprador', label: 'Comprador responsável', get: i => i.comprador || '', tipo: 'txt' },
    { k: 'status', label: 'Status', get: i => i.status || '', tipo: 'txt' },
  ];
  const classes = d ? [...new Set(d.itens.map(i => i.classificacao).filter(Boolean))].sort((a, b) => a.localeCompare(b)) : [];
  const itensFiltrados = (d?.itens || []).filter(i => !classFiltro || (i.classificacao || '—') === classFiltro);
  const { linhas: linhasF, ordem: ordemF, clicar: clicarF, seta: setaF } = useOrdenavel(itensFiltrados, COLS_F, { col: 'dias', dir: 'desc' });

  return (
    <div>
      <div style={{ ...s.card, background: '#FBEFEF', borderColor: '#F0D9D9', fontSize: 12.5, color: '#8A4B4B' }}>
        🚨 O que as lojas <b>lançaram como falta</b> e o comprador ainda não resolveu. Cada falta é atribuída ao <b>comprador dono do produto</b> (pela classificação), para cobrar quem deixa faltar. Atrasada = aberta há mais que o prazo da meta.
      </div>
      <MetasInline API={API} gestao={gestao} chaves={['falta_dias_atender', 'falta_atendimento_meta']} onSaved={carregar} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <LojaSelect lojas={lojas} value={loja} onChange={setLoja} />
        <select value={comprador} onChange={e => setComprador(e.target.value)} style={{ ...s.inp, padding: '6px 8px' }}>
          <option value="">👥 Todos os compradores</option>
          {compradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        {classes.length > 0 && (
          <select value={classFiltro} onChange={e => setClassFiltro(e.target.value)} style={{ ...s.inp, padding: '6px 8px', maxWidth: 220 }}>
            <option value="">🏷️ Todas as classificações</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>
      {erro && <div style={{ ...s.card, color: CORES.vermelho }}>⚠️ {erro}</div>}
      {!d && !erro && <div style={s.card}>Carregando…</div>}
      {R && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <Kpi titulo="Faltas abertas" valor={R.abertas} />
            <Kpi titulo={`Atrasadas (>${R.slaDias}d)`} valor={R.atrasadas} cor={cor(R.semaforo)} />
            <Kpi titulo="Sem comprador vinculado" valor={R.semDono} cor={R.semDono ? CORES.amarelo : CORES.verde} />
            <Kpi titulo="Tempo médio p/ atender" valor={R.tempoMedio != null ? R.tempoMedio + ' dias' : '—'} />
            <Kpi titulo={`Atendidas (meta ${R.meta}%)`} valor={R.atendidasPct != null ? R.atendidasPct + '%' : '—'} cor={R.atendidasPct != null && R.atendidasPct >= R.meta ? CORES.verde : CORES.amarelo} />
          </div>
          {d.porComprador.length > 0 && (
            <div style={{ ...s.card }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Cobrança por comprador</div>
              {d.porComprador.map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderTop: i ? '1px solid #f2f2f2' : 'none' }}>
                  <span style={{ fontWeight: 600 }}>{c.comprador}</span>
                  <span>{c.abertas} aberta(s){c.atrasadas > 0 && <span style={{ color: CORES.vermelho, fontWeight: 700 }}> · {c.atrasadas} atrasada(s)</span>}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tab}>
              <thead><tr>{COLS_F.map(c => <ThOrd key={c.k} c={c} ordem={ordemF} clicar={clicarF} seta={setaF} base={s.th} />)}</tr></thead>
              <tbody>
                {linhasF.map(i => (
                  <tr key={i.id} style={{ borderTop: '1px solid #f0f0f0', background: i.atrasada ? '#FDF6F5' : '#fff' }}>
                    <td style={{ ...s.td, color: i.atrasada ? CORES.vermelho : '#555', fontWeight: i.atrasada ? 700 : 400 }}>{i.dias}d{i.atrasada ? ' ⚠️' : ''}</td>
                    <td style={{ ...s.td, fontWeight: 600, maxWidth: 240, whiteSpace: 'normal' }}>{i.descricao}{i.quantidade > 1 ? <span style={{ color: '#aaa' }}> ×{i.quantidade}</span> : ''}{i.ean && <div style={{ fontSize: 10.5, color: '#999', fontWeight: 400 }}>🔖 {i.ean}</div>}</td>
                    <td style={{ ...s.td, fontSize: 11.5, color: '#666', maxWidth: 150, whiteSpace: 'normal' }}>{i.classificacao || '—'}</td>
                    <td style={{ ...s.td, fontSize: 12 }}>{i.loja}</td>
                    <td style={{ ...s.td, fontSize: 12, color: '#777' }}>{i.lancadaPor || '—'}</td>
                    <td style={{ ...s.td, fontSize: 12 }}>{i.comprador || <span style={{ color: '#B7791F' }}>⚠️ sem vínculo</span>}</td>
                    <td style={{ ...s.td }}><span style={{ fontSize: 11, color: i.status === 'em_pedido' ? '#2E5C9E' : '#B7791F' }}>{i.status === 'em_pedido' ? 'Em pedido' : 'Aberta'}</span></td>
                  </tr>
                ))}
                {linhasF.length === 0 && <tr><td colSpan={COLS_F.length} style={{ ...s.td, textAlign: 'center', color: '#aaa' }}>Nenhuma falta pendente. 🎉</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Análise de vencidos ────────────────────────────────────────────────────
function Vencidos({ API, gestao }) {
  const lojas = useLojas(API);
  const [loja, setLoja] = useState('');
  const [dias, setDias] = useState(90);
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [cliDe, setCliDe] = useState(null); // produto aberto no modal
  const [classFiltro, setClassFiltro] = useState('');
  const [nivel, setNivel] = useState('classificacao'); // 'grupo' (nível 2) | 'classificacao' (nível 3)
  const [filtroAcao, setFiltroAcao] = useState(''); // '' | remanejar | girar | promover | vencido
  const [vencFiltro, setVencFiltro] = useState('avencer'); // avencer (oculta os já vencidos) | vencidos | todos
  const [ordem, setOrdem] = useState({ col: 'validade', dir: 'asc' });
  const carregar = useCallback(() => {
    setErro(''); setD(null);
    API.get('/compras/vencidos', { params: { loja, dias } }).then(r => { if (r.data.erro) setErro(r.data.erro); else setD(r.data); }).catch(e => setErro(e.response?.data?.erro || 'Falha.'));
  }, [API, loja, dias]);
  useEffect(() => { carregar(); }, [carregar]);

  const ACAO = { remanejar: ['🔄', '#2E5C9E'], girar: ['📣', '#1E874B'], promover: ['🏷️', '#B7791F'] };
  const R = d && d.resumo;
  const cor = st => ({ verde: CORES.verde, amarelo: CORES.amarelo, vermelho: CORES.vermelho }[st] || '#333');

  // Colunas ordenáveis
  const COLS = [
    { k: 'validade', label: 'Validade', get: it => (it.vencido ? -1e9 : it.diasParaVencer), tipo: 'num' },
    { k: 'descricao', label: 'Produto', get: it => it.descricao || '', tipo: 'txt', left: true },
    { k: 'classificacao', label: nivel === 'grupo' ? 'Grupo principal' : 'Classificação', get: it => it[nivel] || '', tipo: 'txt', left: true },
    { k: 'loja', label: 'Loja', get: it => it.loja || '', tipo: 'txt', left: true },
    { k: 'estoque', label: 'Estoque', get: it => it.estoque || 0, tipo: 'num', center: true },
    { k: 'demandaAqui', label: 'Demanda aqui', get: it => it.demandaAqui || 0, tipo: 'num', center: true },
    { k: 'valor', label: 'Valor', get: it => it.valor || 0, tipo: 'num', center: true },
  ];
  const clicarCol = k => setOrdem(o => o.col === k ? { col: k, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { col: k, dir: COLS.find(c => c.k === k)?.tipo === 'txt' ? 'asc' : 'desc' });
  const classes = d ? [...new Set(d.itens.map(i => i[nivel]).filter(Boolean))].sort((a, b) => a.localeCompare(b)) : [];
  let linhas = d ? d.itens.slice() : [];
  if (classFiltro) linhas = linhas.filter(i => (i[nivel] || '—') === classFiltro);
  if (filtroAcao === 'vencido') linhas = linhas.filter(i => i.vencido);
  else if (filtroAcao) linhas = linhas.filter(i => i.acao === filtroAcao);
  if (vencFiltro === 'avencer') linhas = linhas.filter(i => !i.vencido);
  else if (vencFiltro === 'vencidos') linhas = linhas.filter(i => i.vencido);
  const qtdVencidos = d ? d.itens.filter(i => i.vencido).length : 0;
  const colDef = COLS.find(c => c.k === ordem.col);
  if (colDef) {
    linhas.sort((a, b) => { const va = colDef.get(a), vb = colDef.get(b); const r = colDef.tipo === 'txt' ? String(va).localeCompare(String(vb), 'pt', { sensitivity: 'base' }) : (va - vb); return ordem.dir === 'asc' ? r : -r; });
  }
  const seta = k => ordem.col === k ? (ordem.dir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <div>
      <div style={{ ...s.card, background: '#FBF7F4', borderColor: '#EEDFD6', fontSize: 12.5, color: '#7A5A48' }}>
        ⏳ Produtos com <b>lote perto do vencimento</b> que ainda têm estoque. O sistema cruza com a <b>demanda por loja</b> para sugerir <b>girar aqui</b> (acionando clientes que usam) ou <b>remanejar</b> para a loja que mais vende. Clique em um produto para ver os <b>clientes com telefone</b>.
      </div>
      <MetasInline API={API} gestao={gestao} chaves={['vencido_perda_max', 'remanejar_meta']} onSaved={carregar} />
      {R && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <Kpi titulo="Valor em risco" valor={brl(R.valorRisco)} onClick={() => setFiltroAcao('')} ativo={!filtroAcao} />
          <Kpi titulo={`Perda p/ vencimento (meta ≤${R.vencido.meta}%)`} valor={brl(R.vencido.valor) + ' · ' + R.vencido.pct + '%'} cor={cor(R.vencido.semaforo)} onClick={() => setFiltroAcao(filtroAcao === 'vencido' ? '' : 'vencido')} ativo={filtroAcao === 'vencido'} />
          <Kpi titulo={`A remanejar (${R.remanejar.qtd})`} valor={brl(R.remanejar.valor)} cor="#2E5C9E" onClick={() => setFiltroAcao(filtroAcao === 'remanejar' ? '' : 'remanejar')} ativo={filtroAcao === 'remanejar'} />
          <Kpi titulo={`Girar na loja (${R.girar.qtd})`} valor={brl(R.girar.valor)} cor={CORES.verde} onClick={() => setFiltroAcao(filtroAcao === 'girar' ? '' : 'girar')} ativo={filtroAcao === 'girar'} />
          <Kpi titulo={`Sem saída na rede (${R.perdaCerta.qtd})`} valor={brl(R.perdaCerta.valor)} cor={CORES.amarelo} onClick={() => setFiltroAcao(filtroAcao === 'promover' ? '' : 'promover')} ativo={filtroAcao === 'promover'} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <LojaSelect lojas={lojas} value={loja} onChange={setLoja} />
        <label style={{ fontSize: 12.5, color: '#666' }}>Período (a vencer em):
          <select value={dias} onChange={e => setDias(Number(e.target.value))} style={{ ...s.inp, padding: '6px 8px', marginLeft: 6 }}>
            {[15, 30, 45, 60, 90, 120, 180, 270, 365].map(x => <option key={x} value={x}>{x} dias</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12.5, color: '#666' }}>Ver por:
          <select value={nivel} onChange={e => { setNivel(e.target.value); setClassFiltro(''); }} style={{ ...s.inp, padding: '6px 8px', marginLeft: 6 }}>
            <option value="grupo">Grupo principal</option>
            <option value="classificacao">Classificação</option>
          </select>
        </label>
        {classes.length > 0 && (
          <label style={{ fontSize: 12.5, color: '#666' }}>{nivel === 'grupo' ? 'Grupo' : 'Classificação'}:
            <select value={classFiltro} onChange={e => setClassFiltro(e.target.value)} style={{ ...s.inp, padding: '6px 8px', marginLeft: 6, maxWidth: 220 }}>
              <option value="">Todas</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        <label style={{ fontSize: 12.5, color: '#666' }}>Vencimento:
          <select value={vencFiltro} onChange={e => setVencFiltro(e.target.value)} style={{ ...s.inp, padding: '6px 8px', marginLeft: 6 }}>
            <option value="avencer">Só a vencer (oculta vencidos)</option>
            <option value="vencidos">Só vencidos{qtdVencidos ? ` (${qtdVencidos})` : ''}</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        {d && <span style={{ fontSize: 12, color: '#999' }}>{linhas.length} produto(s){vencFiltro === 'avencer' && qtdVencidos ? ` · ${qtdVencidos} vencidos ocultos` : ''}</span>}
      </div>
      {erro && <div style={{ ...s.card, color: CORES.vermelho }}>⚠️ {erro}</div>}
      {!d && !erro && <div style={s.card}>Analisando lotes…</div>}
      {d && d.itens.length === 0 && <div style={s.card}>Nenhum produto vencendo na janela. 🎉</div>}
      {d && d.itens.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tab}>
            <thead><tr>
              {COLS.map(c => (
                <th key={c.k} onClick={() => clicarCol(c.k)} title="Ordenar" style={{ ...s.th, textAlign: c.center ? 'center' : 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: ordem.col === c.k ? '#B7791F' : undefined }}>{c.label}{seta(c.k)}</th>
              ))}
              <th style={{ ...s.th, textAlign: 'left' }}>Sugestão</th>
              <th style={s.th}></th>
            </tr></thead>
            <tbody>
              {linhas.map((it, idx) => {
                const [emoji, cor] = ACAO[it.acao] || ['•', '#666'];
                return (
                  <tr key={idx} style={{ borderTop: '1px solid #f0f0f0', background: it.vencido ? '#FBEAE7' : '#fff' }}>
                    <td style={{ ...s.td }}>
                      <span style={{ color: it.vencido ? CORES.vermelho : it.diasParaVencer <= 30 ? CORES.amarelo : '#555', fontWeight: 600 }}>
                        {it.vencido ? 'VENCIDO' : it.diasParaVencer + 'd'}</span>
                      <div style={{ fontSize: 10.5, color: '#aaa' }}>{dataBR(it.validade)}</div>
                    </td>
                    <td style={{ ...s.td, fontWeight: 600, maxWidth: 240, whiteSpace: 'normal' }}>
                      {it.descricao}
                      {it.ean && <div style={{ fontSize: 10.5, color: '#999', fontWeight: 400 }}>🔖 {it.ean}</div>}
                    </td>
                    <td style={{ ...s.td, fontSize: 11.5, color: '#666', maxWidth: 150, whiteSpace: 'normal' }}>{it[nivel] || '—'}</td>
                    <td style={{ ...s.td, fontSize: 12 }}>{it.loja}</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>{it.estoque}</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>{it.demandaAqui}<span style={{ color: '#bbb', fontSize: 11 }}>/90d</span></td>
                    <td style={{ ...s.td, textAlign: 'center', color: '#555' }}>{brl(it.valor)}</td>
                    <td style={{ ...s.td, fontSize: 12, color: cor, maxWidth: 260, whiteSpace: 'normal' }}>{emoji} {it.sugestao}</td>
                    <td style={s.td}><button onClick={() => setCliDe(it)} style={s.btnMini}>📞 Clientes</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {cliDe && <ClientesModal API={API} loja={loja} item={cliDe} onClose={() => setCliDe(null)} />}
    </div>
  );
}

function ClientesModal({ API, loja, item, onClose }) {
  const [c, setC] = useState(null);
  useEffect(() => { API.get('/compras/vencidos/clientes', { params: { produto: item.produtoId, loja } }).then(r => setC(r.data.clientes || [])).catch(() => setC([])); }, [API, item, loja]);
  const tel = t => (t || '').replace(/\D/g, '');
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 18, maxWidth: 520, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>📞 Clientes que usam</div>
            <div style={{ fontSize: 12.5, color: '#666' }}>{item.descricao}</div>
          </div>
          <button onClick={onClose} style={{ ...s.btnMini, border: 'none' }}>✕</button>
        </div>
        <div style={{ fontSize: 11.5, color: '#999', margin: '8px 0' }}>Últimos 12 meses. Ligue para impulsionar a venda antes do vencimento.</div>
        {!c && <div style={{ fontSize: 13, color: '#888' }}>Carregando…</div>}
        {c && c.length === 0 && <div style={{ fontSize: 13, color: '#888' }}>Sem clientes identificados (vendas sem cadastro).</div>}
        {c && c.map((x, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: i ? '1px solid #f2f2f2' : 'none' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{x.nome}</div>
              <div style={{ fontSize: 11, color: '#999' }}>{x.compras} compra(s) · última {dataBR(x.ultima)}</div>
            </div>
            {x.telefone
              ? <a href={`tel:${tel(x.telefone)}`} style={{ ...s.btn, textDecoration: 'none', padding: '6px 12px' }}>📞 {x.telefone}</a>
              : <span style={{ fontSize: 12, color: '#bbb' }}>sem telefone</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ titulo, valor, cor = '#333', onClick, ativo }) {
  return (
    <div onClick={onClick} title={onClick ? 'clique para filtrar' : undefined}
      style={{ background: ativo ? '#eef7f2' : '#fff', border: '1px solid ' + (ativo ? '#0d6b5e' : '#eee'), borderRadius: 12, padding: '10px 16px', minWidth: 130, flex: '1 1 130px', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '.03em' }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor, marginTop: 2 }}>{valor}</div>
    </div>
  );
}

// ── Orçamento de compra ───────────────────────────────────────────────────
function Orcamento({ API, gestao }) {
  const lojas = useLojas(API);
  const hoje = new Date();
  const [compradores, setCompradores] = useState([]);
  const [loja, setLoja] = useState('');
  const [comprador, setComprador] = useState('');
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [editCfg, setEditCfg] = useState(false);
  const [cmvMeta, setCmvMeta] = useState('');
  const [cresc, setCresc] = useState('');
  useEffect(() => { API.get('/compras/compradores').then(r => setCompradores(r.data.compradores || [])).catch(() => {}); }, [API]);
  const carregar = useCallback(() => {
    setErro(''); setD(null);
    API.get('/compras/orcamento', { params: { loja: loja || undefined, comprador: comprador || undefined, mes } }).then(r => {
      if (r.data.erro) setErro(r.data.erro); else setD(r.data);
      setCmvMeta(r.data.cmv?.meta ?? ''); setCresc('');
    }).catch(e => setErro(e.response?.data?.erro || 'Falha ao carregar.'));
  }, [API, loja, comprador, mes]);
  useEffect(() => { carregar(); }, [carregar]);
  const filtroOrc = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
      <LojaSelect lojas={lojas} value={loja} onChange={setLoja} />
      <select value={comprador} onChange={e => setComprador(e.target.value)} style={{ ...s.inp, padding: '6px 8px' }}>
        <option value="">👥 Toda a compra (rede)</option>
        {compradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <select value={mes} onChange={e => setMes(Number(e.target.value))} style={{ ...s.inp, padding: '6px 8px' }}>
        {MESNOMES.map((m, i) => <option key={i} value={i + 1}>{m}/{hoje.getFullYear()}</option>)}
      </select>
    </div>
  );

  const salvarCfg = () => API.put('/compras/orcamento/config', { cmv_meta: cmvMeta, crescimento_meta: cresc })
    .then(() => { setEditCfg(false); carregar(); });
  const aprovarCarry = (f, aprovado) => API.post('/compras/orcamento/carry', { ano: d?.ano, mes: f.mesNum, valor: f.carrySaida, aprovado })
    .then(carregar).catch(e => alert(e.response?.data?.erro || 'Só o Diretor/Gestor pode aprovar o arrasto.'));

  const c = d && d.mesCorrente;
  const semColor = c && { verde: CORES.verde, amarelo: CORES.amarelo, vermelho: CORES.vermelho, cinza: '#999' }[c.semaforo];

  return (
    <div>
      <div style={{ ...s.card }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>💰 Orçamento de compra</div>
        {filtroOrc}
        {erro && <div style={{ color: CORES.vermelho }}>⚠️ {erro}</div>}
        {!d && !erro && <div style={{ color: '#888', fontSize: 13 }}>Calculando orçamento…</div>}
      </div>
      {d && <>
      {d.projecaoBase === 'tendencia' &&
        <div style={{ ...s.card, background: '#FCF3E2', borderColor: '#F0E0BE', fontSize: 12.5, color: '#8A6D3B' }}>
          ⚠️ O ERP ainda só tem histórico de {d.ano}. A projeção usa a <b>tendência do próprio ano</b> (média dos últimos meses). Quando houver o ano anterior, ela passa automaticamente a <b>ano passado × crescimento acumulado</b>.
        </div>}

      {/* Semáforo do mês */}
      <div style={{ ...s.card, borderLeft: `5px solid ${semColor}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>🚦 Saldo de compra — {d.mesNome}/{d.ano}</div>
          <span style={{ ...s.badge, background: BG[c.semaforo] || '#eee', color: semColor, fontSize: 13 }}>
            {c.semaforo === 'verde' ? 'Dentro do orçamento' : c.semaforo === 'amarelo' ? 'Perto do limite' : c.semaforo === 'vermelho' ? 'Orçamento estourado' : 'Sem base'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <Kpi titulo="Orçamento do mês" valor={brl(c.orcamento)} />
          <Kpi titulo="Entrada efetivada (mês)" valor={brl(c.comprado)} cor={CORES.verde} />
          <Kpi titulo={`Pedido não recebido (${c.pendentesQtd})`} valor={brl(c.pendentes)} cor={CORES.amarelo} />
          <Kpi titulo="Saldo a comprar" valor={brl(c.saldo)} cor={semColor} />
        </div>
        {c.estourouSemFeira && <div style={{ marginTop: 10, background: '#FBEAE7', border: '1px solid #f0c0b8', borderRadius: 10, padding: '9px 12px', color: '#9a3b2a', fontSize: 12.5, fontWeight: 600 }}>⚠️ Orçamento estourado <b>sem feira para justificar</b>. Se foi uma compra de feira (antecipação), cadastre a feira no menu 🎪 Feiras com a verba e os meses que ela abastece — aí o estouro deixa de pesar. Senão, a compra do mês passou do planejado.</div>}
        {c.temFeira && c.aporteFeira > 0 && <div style={{ marginTop: 10, background: '#FFF7EC', border: '1px solid #F0E0BE', borderRadius: 10, padding: '9px 12px', color: '#8A6D3B', fontSize: 12.5 }}>🎪 Este mês tem <b>feira</b>: a verba de {brl(c.aporteFeira)} está aportada no orçamento (compra antecipada) e será abatida dos próximos meses que ela abastece.</div>}
        <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>Saldo = orçamento do mês − <b>entrada já efetivada</b> (NF) − <b>pedido ainda não recebido</b> (últimos 30 dias). {d.escopoComprador && <span style={{ color: '#7A6E52' }}>· Escopo do comprador: cada boleto é rateado <b>item a item da NF</b> (fração dos itens que são dele) — <b>{d.rateioComprometido}%</b> do comprometido total.</span>}</div>
      </div>
      {d.escopoComprador && <div style={{ ...s.card, background: '#EAF3EC', borderColor: '#CFE6D6', fontSize: 12.5, color: '#2E6B45' }}>
        🎯 Visão do <b>comprador</b>: projeção de venda, orçamento e entradas consideram <b>apenas os produtos das classificações/grupos vinculados a ele</b>. Configure na aba "⚙️ Grupos por comprador".
      </div>}

      {/* CMV + projeção */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13 }}>
            <b>CMV usado no orçamento: {d.cmv.usado != null ? d.cmv.usado + '%' : '—'}</b>
            <span style={{ color: '#888', marginLeft: 8 }}>· real do ERP: {d.cmv.real != null ? d.cmv.real + '%' : '—'}{d.cmv.meta != null ? ` · meta definida: ${d.cmv.meta}%` : ''}</span>
            {d.crescimentoYTD != null && <span style={{ color: '#888', marginLeft: 8 }}>· crescimento YTD: {d.crescimentoYTD}%</span>}
          </div>
          {gestao && <button onClick={() => setEditCfg(v => !v)} style={s.btnMini}>{editCfg ? 'Fechar' : 'Ajustar metas'}</button>}
        </div>
        {editCfg && (
          <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={s.lbl}>Meta de CMV % <span style={{ color: '#bbb' }}>(vazio = usa o real)</span>
              <input type="number" step="0.1" value={cmvMeta} onChange={e => setCmvMeta(e.target.value)} placeholder={String(d.cmv.real ?? '')} style={{ ...s.inp, width: 120 }} /></label>
            <label style={s.lbl}>Crescimento anual % <span style={{ color: '#bbb' }}>(sem histórico)</span>
              <input type="number" step="1" value={cresc} onChange={e => setCresc(e.target.value)} placeholder="0" style={{ ...s.inp, width: 120 }} /></label>
            <button onClick={salvarCfg} style={s.btn}>Salvar</button>
          </div>
        )}
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={s.tab}>
            <thead><tr>{['Mês', 'Venda projetada', 'Orçamento de compras'].map((h, i) =>
              <th key={i} style={{ ...s.th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {d.linhas.map(l => (
                <tr key={l.mesNum} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ ...s.td, fontWeight: 600 }}>{l.mes}/{l.ano || d.ano}{l.viaMeta ? <span title="usa a meta de venda cadastrada" style={{ fontSize: 9.5, color: '#0d6b5e', fontWeight: 700, marginLeft: 4 }}>meta</span> : null}
                    {l.real && <span style={{ ...s.tag, marginLeft: 4 }}>realizado</span>}
                    {l.parcial && <span style={{ ...s.tag, marginLeft: 4, background: '#EAF3FB', color: '#2C6FA6' }}>projeção do mês</span>}
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{brl(l.projecao)}
                    {l.parcial && <div style={{ fontSize: 10.5, color: '#999' }}>já vendido {brl(l.realizadoParcial)} em {l.diaParcial}/{l.diasMes} dias</div>}
                  </td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{l.orcamento != null ? brl(l.orcamento) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fluxo de caixa */}
      {d.fluxo && d.fluxo.length > 0 && (
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>💵 Orçamento × fluxo de caixa (6 meses)</div>
          <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
            <b>Saldo = orçamento de compra (+ arrasto) − comprometido.</b> O orçamento de compra já vem <b>ajustado pela feira</b>: a verba da feira é <b>aportada no mês da feira</b> e <b>abatida proporcionalmente dos outros meses</b> — o total do ano continua o mesmo. Saldo positivo = ainda há espaço para comprar; negativo = os compromissos superam o orçamento e o excedente é <b>empurrado para o mês seguinte</b>. A coluna <b>🎪 Feira</b> mostra o aporte (+) no mês da feira e o rateio (−) nos demais.{d.reservaFeira ? <span style={{ color: '#B15E00' }}> Verba de feira do ano redistribuída: <b>{brl(d.reservaFeira)}</b>.</span> : null}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tab}>
              <thead><tr>{['', 'Mês', 'Orçamento de compra', 'Comprometido', '🎪 Feira', 'Saldo', 'Empurra', 'Aprovação'].map((h, i) =>
                <th key={i} style={{ ...s.th, textAlign: i >= 2 && i < 7 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>
                {d.fluxo.map(f => {
                  const cor = { verde: CORES.verde, amarelo: CORES.amarelo, vermelho: CORES.vermelho, cinza: '#bbb' }[f.semaforo];
                  return (
                    <tr key={f.mesNum} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={s.td}><span style={{ ...s.dot, background: cor }} /></td>
                      <td style={{ ...s.td, fontWeight: 600 }}>{f.mes}</td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{brl(f.desejado)}{f.carryEntrada > 0 ? <span style={{ color: '#bbb', fontSize: 11 }}> (+{brl(f.carryEntrada)} arrasto)</span> : null}</td>
                      <td style={{ ...s.td, textAlign: 'right', color: '#B7791F' }}>−{brl(f.comprometido)} <span style={{ color: '#bbb', fontSize: 11 }}>({f.contas})</span></td>
                      <td style={{ ...s.td, textAlign: 'right' }} title={f.feiraNomes || ''}>
                        {f.aporteFeira > 0
                          ? <span style={{ color: '#B15E00', fontWeight: 700 }}>+{brl(f.aporteFeira)}</span>
                          : f.abateFeira > 0
                            ? <span style={{ color: '#999' }}>−{brl(f.abateFeira)} <span style={{ color: '#ccc', fontSize: 10 }}>rateio</span></span>
                            : <span style={{ color: '#ccc' }}>—</span>}
                        {f.feiraNomes ? <div style={{ fontSize: 10, color: '#B15E00', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }}>🎪 {f.feiraNomes}</div> : null}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', color: f.saldo < 0 ? CORES.vermelho : CORES.verde, fontWeight: 700 }}>{brl(f.saldo)}</td>
                      <td style={{ ...s.td, textAlign: 'right', color: f.excedente > 0 ? CORES.vermelho : '#ccc', fontWeight: f.excedente > 0 ? 700 : 400 }}>{f.excedente > 0 ? '→ ' + brl(f.excedente) : '—'}</td>
                      <td style={s.td}>{f.carrySaida > 0
                        ? (f.carryAprovado
                          ? <span style={{ color: CORES.verde, fontWeight: 700, fontSize: 11.5 }}>✓ aprovado{gestao ? <button onClick={() => aprovarCarry(f, false)} style={{ ...s.btnMini, marginLeft: 6, padding: '2px 7px' }}>desfazer</button> : ''}</span>
                          : (gestao ? <button onClick={() => aprovarCarry(f, true)} style={{ ...s.btn, padding: '4px 10px', fontSize: 12, background: '#B7791F' }}>aprovar arrasto</button> : <span style={{ color: '#B7791F', fontWeight: 700, fontSize: 11.5 }}>⏳ pendente do Diretor</span>))
                        : <span style={{ color: '#ccc' }}>—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: '#999', marginTop: 10 }}>
            💡 Comprometido considera apenas o plano de contas <b>CMV (compras)</b>; impostos, aluguel e demais despesas não entram no fluxo de compra.
          </div>
          {d.fluxo.some(f => f.carrySaida > 0) && <div style={{ ...s.card, marginTop: 8, background: '#FCF3E2', borderColor: '#F0E0BE', fontSize: 12, color: '#8A6D3B' }}>
            ⚠️ Há valor <b>empurrado para o mês seguinte</b> (os compromissos superaram o orçamento do mês). Esse arrasto precisa de <b>aprovação do Diretor</b> na coluna <b>Aprovação</b> — enquanto pendente, é um risco de caixa que a Direção precisa autorizar.
            {(() => { const p = d.fluxo.filter(f => f.carrySaida > 0 && !f.carryAprovado).length; return p ? <b style={{ color: '#C0392B' }}> {p} mês(es) aguardando aprovação.</b> : <b style={{ color: '#1E874B' }}> Todos os arrastos aprovados. ✓</b>; })()}
          </div>}
        </div>
      )}
      </>}
    </div>
  );
}

function Config({ API, gestao }) {
  const [compradores, setCompradores] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [classifs, setClassifs] = useState([]);
  const [erroErp, setErroErp] = useState('');
  const [editando, setEditando] = useState(null);
  const [sel, setSel] = useState([]);
  const [modo, setModo] = useState('classificacao'); // 'classificacao' | 'grupo' | 'laboratorio' | 'fornecedor'
  const [busca, setBusca] = useState('');
  const [abertos, setAbertos] = useState({}); // classificação-pai expandida (id -> bool)
  const [erpItens, setErpItens] = useState([]); // resultado da busca ao vivo (laboratório/fornecedor)
  const carregar = useCallback(() => {
    API.get('/compras/compradores').then(r => setCompradores(r.data.compradores || [])).catch(() => {});
    API.get('/compras/classificacoes-erp').then(r => setClassifs(r.data.classificacoes || [])).catch(e => setErroErp(e.response?.data?.erro || 'ERP indisponível'));
    API.get('/compras/grupos-erp').then(r => setGrupos(r.data.grupos || [])).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  // Laboratório/fornecedor: busca ao vivo no ERP (reusa os endpoints das feiras).
  useEffect(() => {
    if (modo !== 'laboratorio' && modo !== 'fornecedor') return;
    if (busca.trim().length < 2) { setErpItens([]); return; }
    const rota = modo === 'laboratorio' ? '/feiras/erp/laboratorios' : '/feiras/erp/fornecedores';
    const t = setTimeout(() => {
      API.get(rota, { params: { busca: busca.trim() } })
        .then(r => setErpItens((r.data.itens || []).map(i => ({ id: Number(i.ref_id), nome: i.nome }))))
        .catch(() => setErpItens([]));
    }, 300);
    return () => clearTimeout(t);
  }, [API, modo, busca]);

  const abrir = c => { setEditando(c.id); setSel((c.grupos || []).map(g => ({ id: g.grupocompra_id, nome: g.grupo_nome, tipo: g.tipo || 'grupo' }))); setBusca(''); setErpItens([]); };
  const toggle = (g, tipo) => setSel(x => x.some(y => y.id === g.id && y.tipo === tipo) ? x.filter(y => !(y.id === g.id && y.tipo === tipo)) : [...x, { id: g.id, nome: g.nome, tipo }]);
  const salvar = () => API.put(`/compras/compradores/${editando}/grupos`, { grupos: sel }).then(() => { setEditando(null); carregar(); });
  const ehErpBusca = modo === 'laboratorio' || modo === 'fornecedor';
  const lista = modo === 'classificacao' ? classifs : modo === 'grupo' ? grupos : erpItens;
  const listaFiltrada = ehErpBusca ? erpItens : lista.filter(g => !busca || g.nome.toLowerCase().includes(busca.toLowerCase()) || (g.caminho || '').toLowerCase().includes(busca.toLowerCase()));
  const icoTipo = t => t === 'classificacao' ? '🏷️ ' : t === 'laboratorio' ? '🧪 ' : t === 'fornecedor' ? '🏭 ' : '📦 ';

  return (
    <div>
      <div style={{ fontSize: 11.5, color: '#999', marginBottom: 8 }}>Defina o que cada comprador cuida — por <b>classificação</b> (Genérico, Perfumaria…), <b>grupo de compra</b>, <b>laboratório</b> 🧪 ou <b>fornecedor</b> 🏭 (do ERP). Pode combinar vários. A projeção de venda, o orçamento e os indicadores passam a considerar só isso. O vínculo por fornecedor considera os produtos já comprados dele (via NF). Editável a qualquer momento.</div>
      {erroErp && <div style={{ ...s.card, color: '#993C1D' }}>⚠️ {erroErp}</div>}
      {compradores.length === 0 && <div style={s.card}>Nenhum colaborador com função <strong>Comprador</strong> cadastrado.</div>}
      {compradores.map(c => (
        <div key={c.id} style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.nome} <span style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>· {c.funcao}</span></div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                {(c.grupos || []).length === 0 ? <span style={{ color: '#B7791F' }}>⚠️ nada vinculado</span>
                  : (c.grupos || []).map(g => <span key={g.tipo + g.grupocompra_id} style={{ ...s.chipInfo, background: g.tipo === 'classificacao' ? '#EAF3EC' : g.tipo === 'laboratorio' ? '#F3ECFA' : g.tipo === 'fornecedor' ? '#FBF0E6' : '#F0F3F7' }}>{icoTipo(g.tipo)}{g.grupo_nome}</span>)}
              </div>
            </div>
            {gestao && <button onClick={() => abrir(c)} style={s.btn}>Editar</button>}
          </div>
          {editando === c.id && (
            <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 10 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {[['classificacao', '🏷️ Classificação'], ['grupo', '📦 Grupo de compra'], ['laboratorio', '🧪 Laboratório'], ['fornecedor', '🏭 Fornecedor']].map(([v, l]) =>
                  <button key={v} onClick={() => { setModo(v); setBusca(''); setErpItens([]); }} style={{ ...s.chip, ...(modo === v ? s.chipOn : {}) }}>{l}</button>)}
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder={ehErpBusca ? '🔎 Digite p/ buscar no ERP…' : '🔎 Buscar…'} style={{ ...s.inp, flex: 1, maxWidth: 240 }} />
                <span style={{ fontSize: 12, color: '#666' }}>{sel.length} selecionado(s)</span>
              </div>
              {/* Chips já selecionados de OUTROS modos ficam guardados; aqui listamos o modo atual. */}
              {sel.filter(x => x.tipo !== modo).length > 0 && (
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Também vinculado: {sel.filter(x => x.tipo !== modo).map((x, i) => <span key={i} style={{ ...s.chipInfo, cursor: 'pointer' }} onClick={() => toggle({ id: x.id, nome: x.nome }, x.tipo)}>{icoTipo(x.tipo)}{x.nome} ✕</span>)}</div>
              )}
              {modo === 'classificacao' && !busca && <div style={{ fontSize: 11, color: '#64748b', margin: '2px 0 6px' }}>💡 Marque a <b>classificação-pai</b> (em destaque) — já inclui todas as subníveis. Clique no <b>▸</b> só se quiser escolher subníveis específicos.</div>}
              <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid #eef1f4', borderRadius: 8, padding: 6 }}>
                {modo === 'classificacao' && !busca ? (
                  listaFiltrada.filter(g => g.principal).map(pai => {
                    const onPai = sel.some(x => x.id === pai.id && x.tipo === modo);
                    const filhos = classifs.filter(c => !c.principal && (c.caminho || '').startsWith((pai.caminho || '') + ' >'));
                    const filhosSel = filhos.filter(f => sel.some(x => x.id === f.id && x.tipo === modo)).length;
                    const aberto = !!abertos[pai.id];
                    return (
                      <div key={pai.id} style={{ marginBottom: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, background: onPai ? '#E6F1FB' : '#f8fafc' }}>
                          <input type="checkbox" checked={onPai} onChange={() => toggle(pai, modo)} />
                          <b onClick={() => toggle(pai, modo)} title={pai.caminho} style={{ flex: 1, fontSize: 13, color: onPai ? '#185FA5' : '#334', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pai.nome}</b>
                          {filhosSel > 0 && !onPai && <span style={{ fontSize: 10.5, color: '#185FA5', fontWeight: 700 }}>{filhosSel} sub</span>}
                          <span style={{ fontSize: 10, color: '#aaa' }}>{pai.itens}</span>
                          {filhos.length > 0 && <button onClick={() => setAbertos(a => ({ ...a, [pai.id]: !a[pai.id] }))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', fontSize: 12, fontWeight: 700, minWidth: 34 }}>{aberto ? '▾' : '▸ ' + filhos.length}</button>}
                        </div>
                        {aberto && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 2, padding: '2px 0 6px 26px' }}>
                          {filhos.map(f => { const on = sel.some(x => x.id === f.id && x.tipo === modo); return (
                            <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 6px', borderRadius: 5, cursor: 'pointer', background: on ? '#E6F1FB' : 'transparent', color: on ? '#185FA5' : '#555' }}>
                              <input type="checkbox" checked={on} onChange={() => toggle(f, modo)} />
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.caminho}>{f.nome}</span>
                              <span style={{ fontSize: 9.5, color: '#bbb' }}>{f.itens}</span>
                            </label>
                          ); })}
                        </div>}
                      </div>
                    );
                  })
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 4 }}>
                    {listaFiltrada.map(g => {
                      const on = sel.some(x => x.id === g.id && x.tipo === modo);
                      return (
                        <label key={modo + g.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', background: on ? '#E6F1FB' : 'transparent', color: on ? '#185FA5' : '#444', fontWeight: (modo === 'classificacao' && g.principal) ? 700 : 400 }}>
                          <input type="checkbox" checked={on} onChange={() => toggle(g, modo)} />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.caminho || g.nome}>{modo === 'classificacao' && !g.principal ? '↳ ' : ''}{g.nome}</span>
                          {g.itens != null && <span style={{ fontSize: 10, color: '#aaa' }}>{g.itens}</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
                {ehErpBusca && busca.trim().length < 2 && <div style={{ fontSize: 12, color: '#999' }}>Digite ao menos 2 letras para buscar {modo === 'laboratorio' ? 'laboratórios' : 'fornecedores'} no ERP.</div>}
                {ehErpBusca && busca.trim().length >= 2 && listaFiltrada.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhum resultado.</div>}
                {!ehErpBusca && lista.length === 0 && !erroErp && <div style={{ fontSize: 12, color: '#999' }}>Carregando do ERP…</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={salvar} style={s.btn}>Salvar</button>
                <button onClick={() => setEditando(null)} style={{ ...s.btn, background: '#999' }}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Meu Setor de Compras: premiação ponderada por comprador ──
// ── 🎯 Metas do Compras — cadastro dos indicadores/alvos no padrão das outras áreas ──
function MetasCompras({ API, gestao }) {
  const { usuario } = useAuth();
  const [comps, setComps] = useState([]); const [comp, setComp] = useState('');
  const [d, setD] = useState(null); const [sugMsg, setSugMsg] = useState('');
  const [sugMeses, setSugMeses] = useState(3);
  const [sugPrev, setSugPrev] = useState(null); // sugestões da análise (renderizadas INLINE na coluna Sugerido)
  const [cfgAberto, setCfgAberto] = useState(false); // config de pilares/tetos colapsada (Joe: tirar do topo)
  const [exp, setExp] = useState({}); // quais indicadores mostram o texto longo (ⓘ) — padrão colapsado
  const toggleExp = k => setExp(e => ({ ...e, [k]: !e[k] }));
  const sugByChave = React.useMemo(() => Object.fromEntries((sugPrev || []).map(r => [r.chave, r])), [sugPrev]);
  const [salvoFlash, setSalvoFlash] = useState('');
  // As células salvam sozinhas ao sair do campo; este botão confirma (comita o campo em foco) e dá retorno visual.
  const salvarTudo = () => { try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {} setTimeout(() => { setSalvoFlash('✓ Alterações salvas'); setTimeout(() => setSalvoFlash(''), 2800); }, 120); };
  const [pilCfg, setPilCfg] = useState({ pilares: [], bonus: 50 }); const [novoPilar, setNovoPilar] = useState('');
  const meses = React.useMemo(() => { const out = []; const dt = new Date(); dt.setDate(1); const N = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']; for (let i = 0; i < 12; i++) { out.push({ ano: dt.getFullYear(), mes: dt.getMonth() + 1, label: `${N[dt.getMonth()]}/${dt.getFullYear()}` }); dt.setMonth(dt.getMonth() - 1); } return out; }, []);
  const [sel, setSel] = useState(meses[0].ano + '-' + meses[0].mes);
  useEffect(() => { API.get('/compras/compradores').then(r => { const c = r.data.compradores || []; setComps(c); const meu = c.find(x => x.id === usuario?.id); setComp(meu ? meu.id : (c[0] ? c[0].id : '')); }).catch(() => {}); }, [API, usuario]);
  const carregar = useCallback(() => {
    if (!comp) { setD(null); return; }
    const [ano, mes] = sel.split('-');
    API.get('/compras/meu-setor', { params: { comprador: comp, ano, mes } }).then(r => setD(r.data)).catch(() => setD(null));
  }, [API, comp, sel]);
  useEffect(() => { carregar(); }, [carregar]);
  // Trocar de comprador/mês limpa a análise anterior (senão "volta o resultado da análise de novo", Joe).
  useEffect(() => { setSugPrev(null); setSugMsg(''); }, [comp, sel]);
  const carregarPil = useCallback(() => API.get('/compras/meu-setor/pilares').then(r => setPilCfg({ pilares: r.data.pilares || [], bonus: r.data.bonus ?? 50 })).catch(() => {}), [API]);
  useEffect(() => { carregarPil(); }, [carregarPil]);
  // Atualiza o estado local NA HORA (otimista) — evita a corrida com o cache serve-stale do ERP, que
  // devolvia o valor velho logo após salvar (bug do "66 vira 62"). O PUT persiste; a tela já reflete.
  const patchLocal = (chave, patch) => setD(prev => prev ? { ...prev,
    metas: (prev.metas || []).map(m => m.chave === chave ? { ...m, ...patch } : m),
    metasInativas: (prev.metasInativas || []).map(m => m.chave === chave ? { ...m, ...patch } : m) } : prev);
  const salvarCfg = (chave, patch) => { patchLocal(chave, patch); return API.put('/compras/meu-setor/config', { chave, comprador_id: comp, ...patch }).catch(() => {}); };
  const salvarPilar = (pilar, patch) => API.put('/compras/meu-setor/pilar', { pilar, ...patch }).then(() => { carregarPil(); carregar(); }).catch(() => {});
  const addPilar = () => { const p = novoPilar.trim(); if (!p) return; if (pilCfg.pilares.length >= 5) { setSugMsg('Máximo de 5 pilares.'); setTimeout(() => setSugMsg(''), 3000); return; } salvarPilar(p, { teto: 100, ordem: pilCfg.pilares.length }); setNovoPilar(''); };
  const delPilar = pilar => API.delete('/compras/meu-setor/pilar', { params: { pilar } }).then(() => { carregarPil(); carregar(); }).catch(() => {});
  const salvarBonus = v => API.put('/compras/meu-setor/premio-config', { bonus_pct: v }).then(carregarPil).catch(() => {});
  // Gera o PREVIEW da sugestão (média histórica → alvo atual → sugerido), sem aplicar.
  const sugerirMetas = async () => {
    const [a0, m0] = sel.split('-').map(Number);
    const lista = [];
    for (let i = 0; i < sugMeses; i++) { const dt = new Date(a0, m0 - 1 - i, 1); lista.push({ ano: dt.getFullYear(), mes: dt.getMonth() + 1 }); }
    setSugPrev(null); setSugMsg(sugMeses === 1 ? '⏳ analisando o mês…' : `⏳ analisando os últimos ${sugMeses} meses…`);
    try {
      const resps = await Promise.all(lista.map(x => API.get('/compras/meu-setor', { params: { comprador: comp, ano: x.ano, mes: x.mes } }).then(r => r.data).catch(() => null)));
      const acc = {}; const info = {};
      resps.forEach(rd => (rd?.metas || []).forEach(m => {
        info[m.chave] = { nome: m.nome, unidade: m.unidade, direcao: m.direcao, alvoAtual: m.meta };
        const r = Number(m.realizado);
        if (!Number.isFinite(r)) return;
        if (!acc[m.chave]) acc[m.chave] = { soma: 0, n: 0 };
        acc[m.chave].soma += r; acc[m.chave].n += 1;
      }));
      const rows = Object.keys(info).map(k => {
        const a = acc[k]; const media = a && a.n ? a.soma / a.n : null;
        const i = info[k];
        const sug = media == null ? null : (i.direcao === 'maior' ? Math.max(1, Math.round(media)) : (Math.abs(media) >= 100 ? Math.round(media) : Math.round(media * 100) / 100));
        return { chave: k, nome: i.nome, unidade: i.unidade, direcao: i.direcao, alvoAtual: i.alvoAtual, media: media == null ? null : Math.round(media * 100) / 100, sugerido: sug };
      }).filter(r => r.media != null);
      // CMV: a sugestão NÃO vem do realizado médio, e sim da MÉDIA DAS LOJAS dos produtos dos grupos do
      // comprador (cada loja pesa igual) — é o que o Joe cadastra por grupo e quer trazer pra meta.
      try {
        const cs = await API.get('/compras/cmv-sugestao', { params: { comprador: comp, meses: sugMeses } }).then(r => r.data);
        if (cs && cs.erp !== false && cs.cmvLojas != null) {
          const novo = { media: cs.cmvLojas, sugerido: cs.cmvLojas, fonteCmv: `média das ${cs.lojas} lojas · ponderada ${cs.cmvPond}%` };
          const i = rows.findIndex(r => r.chave === 'cmv');
          if (i >= 0) rows[i] = { ...rows[i], ...novo };
          else rows.unshift({ chave: 'cmv', nome: 'CMV (%)', unidade: '%', direcao: 'menor', alvoAtual: null, ...novo });
        }
      } catch (e) { /* mantém o realizado médio se a média das lojas falhar */ }
      if (!rows.length) { setSugMsg('Sem base no período — comprador sem movimento.'); setTimeout(() => setSugMsg(''), 3500); return; }
      setSugPrev(rows); setSugMsg('');
    } catch { setSugMsg('Erro ao analisar.'); setTimeout(() => setSugMsg(''), 3500); }
  };
  const aplicarSugestoes = async () => {
    if (!sugPrev) return;
    setSugMsg('⏳ aplicando…');
    const aplicaveis = sugPrev.filter(r => r.sugerido != null);
    await Promise.all(aplicaveis.map(r => API.put('/compras/meu-setor/config', { chave: r.chave, meta: r.sugerido, ativo: true, comprador_id: comp }).catch(() => {})));
    aplicaveis.forEach(r => patchLocal(r.chave, { meta: r.sugerido, ativo: true })); // otimista (sem corrida com o cache)
    setSugPrev(null);
    setSugMsg(`✅ ${aplicaveis.length} meta(s) aplicada(s) pela média de ${sugMeses} ${sugMeses === 1 ? 'mês' : 'meses'}.`);
    setTimeout(() => setSugMsg(''), 4000);
  };
  // Replicar TODAS as metas deste comprador para outro (meta/direção/peso/ativo). Útil p/ compradores da mesma área.
  const [repComp, setRepComp] = useState('');
  const replicarMetas = async () => {
    if (!repComp || !d || !d.metas) return;
    setSugMsg('⏳ replicando metas…');
    await Promise.all(d.metas.map(m => API.put('/compras/meu-setor/config', { chave: m.chave, comprador_id: repComp, meta: m.meta, direcao: m.direcao, peso: m.peso, ativo: m.ativo !== false }).catch(() => {})));
    const nome = comps.find(c => c.id === repComp)?.nome || 'comprador';
    setRepComp(''); setSugMsg('✅ Metas replicadas para ' + nome + '.');
    setTimeout(() => setSugMsg(''), 4500);
  };
  const fmtU = (v, u) => v == null ? '—' : (u === 'R$' ? fmtVal(v, 'R$') : u === '%' ? v + '%' : v + (u ? ' ' + u : ''));
  if (!gestao) return <div style={s.card}>🎯 As metas do setor são cadastradas pela gestão. Veja a sua apuração em <b>🏆 Meu Setor</b>.</div>;
  const linhas = (d?.metas || []).concat((d && d.metasInativas) || []);
  return (
    <div>
      <div style={{ ...s.card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginRight: 'auto' }}>🎯 Cadastro de metas do setor de Compras</div>
        <label style={fld}>Base p/ sugerir (comprador)<select value={comp} onChange={e => setComp(e.target.value)} style={{ ...inp, minWidth: 200 }}>
          {comps.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select></label>
        <label style={fld}>Mês<select value={sel} onChange={e => setSel(e.target.value)} style={inp}>
          {meses.map(m => <option key={m.ano + '-' + m.mes} value={m.ano + '-' + m.mes}>{m.label}</option>)}
        </select></label>
      </div>
      <div style={{ ...s.card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>Indicadores &amp; alvos</div>
          <label style={{ fontSize: 12, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}>Base
            <select value={sugMeses} onChange={e => setSugMeses(Number(e.target.value))} style={inpSm}>
              <option value={1}>mês selecionado</option>
              {[3, 6, 12].map(n => <option key={n} value={n}>média de {n} meses</option>)}
            </select></label>
          <button onClick={sugerirMetas} style={{ background: '#0d6b5e', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>🔍 Buscar análise do período</button>
          {sugPrev && <button onClick={aplicarSugestoes} title="Copia TODOS os valores sugeridos para a coluna Meta/alvo de uma vez" style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>✓ Aplicar todas</button>}
          {sugPrev && <button onClick={() => setSugPrev(null)} style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>limpar sugestões</button>}
          {comps.filter(c => c.id !== comp).length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }} title="Copia TODAS as metas deste comprador para outro (útil quando dois compradores da mesma área têm a meta igual)">
            <span>📋 Replicar p/</span>
            <select value={repComp} onChange={e => setRepComp(e.target.value)} style={inpSm}>
              <option value="">outro comprador…</option>
              {comps.filter(c => c.id !== comp).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <button onClick={replicarMetas} disabled={!repComp} style={{ background: repComp ? '#185FA5' : '#cbd5e1', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: repComp ? 'pointer' : 'default' }}>Replicar</button>
          </span>}
          <button onClick={salvarTudo} style={{ marginLeft: 'auto', background: '#0d6b5e', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>💾 Salvar</button>
          {salvoFlash && <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>{salvoFlash}</span>}
          {sugMsg && <span style={{ fontSize: 12, fontWeight: 600, color: sugMsg.startsWith('Sem') || sugMsg.startsWith('Erro') ? '#b45309' : '#15803d' }}>{sugMsg}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 8 }}>Escolha o <b>período</b> e clique <b>🔍 Buscar análise</b> — a coluna <b>Sugerido</b> enche com a média do período (o <b>CMV</b> pela <b>média das lojas</b> dos grupos do comprador). Clique <b>← usar</b> numa linha, ou <b>✓ Aplicar todas</b> pra jogar tudo pra Meta de uma vez. Salva na hora.{sugPrev && <b style={{ color: '#185FA5' }}> — análise de {sugMeses === 1 ? 'o mês selecionado' : 'média de ' + sugMeses + ' meses'} carregada.</b>}</div>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc', borderBottom: '2px solid #eef1f4' }}>{['Indicador', 'Pilar', 'Peso', 'Direção', 'Meta/alvo', 'Sugerido (análise)', 'Fonte', 'Ativo'].map(h => <th key={h} style={{ padding: '9px 10px' }}>{h}</th>)}</tr></thead>
          <tbody>{linhas.length === 0 && <tr><td colSpan={8} style={{ padding: 14, color: '#94a3b8' }}>Selecione um comprador para carregar os indicadores.</td></tr>}
            {linhas.map(m => { const sg = sugByChave[m.chave]; return (
            <tr key={m.chave} style={{ borderTop: '1px solid #f1f3f5' }}>
              <td style={{ padding: '9px 10px', verticalAlign: 'top' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <b>{m.nome}</b>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#0d6b5e', background: '#eef7f2', borderRadius: 6, padding: '1px 6px' }}>{UNI_ROT[m.unidade] || m.unidade || '—'}</span>
                  <button onClick={() => toggleExp(m.chave)} title="o que é / como é calculado" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#94a3b8', padding: 0 }}>{exp[m.chave] ? '▲' : 'ⓘ'}</button>
                </span>
                {exp[m.chave] && <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', maxWidth: 440, whiteSpace: 'normal' }}>{m.desc || ''}</div>
                  {m.calc && <div style={{ fontSize: 10.5, color: '#b0b8ba', maxWidth: 480, whiteSpace: 'normal', marginTop: 1 }}>📐 {m.calc}</div>}
                  {m.acesso && <div style={{ fontSize: 10.5, color: '#b0b8ba', maxWidth: 480, whiteSpace: 'normal' }}>🔎 {m.acesso}</div>}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 2 }}>
                    <span style={{ fontSize: 10.5, color: '#2563eb', whiteSpace: 'nowrap' }}>📈 Mercado:</span>
                    <input defaultValue={m.mercado || ''} placeholder="referência de mercado (editável)…" onBlur={e => { if ((e.target.value || '') !== (m.mercado || '')) salvarCfg(m.chave, { mercado: e.target.value }); }}
                      style={{ flex: 1, minWidth: 220, maxWidth: 460, fontSize: 10.5, color: '#2563eb', border: '1px solid #e3e8ea', borderRadius: 6, padding: '3px 7px', background: '#f8fbff' }} />
                  </div>
                </div>}
              </td>
              <td style={{ padding: '9px 10px', verticalAlign: 'top' }}><select value={m.pilar || ''} onChange={e => salvarCfg(m.chave, { pilar: e.target.value, ativo: true })} style={inpSm}>{(pilCfg.pilares || []).map(p => <option key={p.pilar} value={p.pilar}>{p.pilar}</option>)}{!(pilCfg.pilares || []).some(p => p.pilar === m.pilar) && m.pilar && <option value={m.pilar}>{m.pilar}</option>}</select></td>
              <td style={{ padding: '9px 10px', verticalAlign: 'top' }}><input type="number" defaultValue={m.peso} key={m.chave + '-p-' + m.peso} onBlur={e => salvarCfg(m.chave, { peso: e.target.value, ativo: true })} style={{ ...inpSm, width: 56 }} /></td>
              <td style={{ padding: '9px 10px', verticalAlign: 'top' }}><select value={m.direcao} onChange={e => salvarCfg(m.chave, { direcao: e.target.value, ativo: true })} style={inpSm}><option value="menor">≤ teto</option><option value="maior">≥ piso</option></select></td>
              <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', verticalAlign: 'top' }}><span style={{ color: '#94a3b8', fontSize: 12, marginRight: 2 }}>{m.direcao === 'menor' ? '≤' : '≥'}</span><input type="number" defaultValue={m.meta ?? ''} key={m.chave + '-m-' + (m.meta ?? '')} placeholder="—" onBlur={e => salvarCfg(m.chave, { meta: e.target.value, ativo: true })} style={{ ...inpSm, width: 74 }} /> <b style={{ color: '#0d6b5e', fontSize: 12 }}>{UNI_ROT[m.unidade] || m.unidade}</b></td>
              <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{sg && sg.sugerido != null ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontWeight: 700, color: '#0d6b5e' }}>{m.direcao === 'menor' ? '≤ ' : '≥ '}{fmtU(sg.sugerido, m.unidade)}</span>
                  <button onClick={() => salvarCfg(m.chave, { meta: sg.sugerido, ativo: true })} title="usar esta sugestão como meta" style={{ background: '#eaf2fb', color: '#185FA5', border: '1px solid #cfe0f5', borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>← usar</button>
                  {sg.fonteCmv && <span title={sg.fonteCmv} style={{ fontSize: 10, color: '#2563eb' }}>🏬</span>}
                </span>
              ) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
              <td style={{ padding: '9px 10px', color: '#94a3b8', verticalAlign: 'top' }}>{m.fonte === 'auto' ? '⚙️ auto' : '✍️ manual'}</td>
              <td style={{ padding: '9px 10px', verticalAlign: 'top' }}><input type="checkbox" defaultChecked={m.ativo !== false} key={m.chave + '-a-' + (m.ativo !== false)} onChange={e => salvarCfg(m.chave, { ativo: e.target.checked })} /></td>
            </tr>); })}</tbody>
        </table></div>
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>⚙️ auto = vem do ERP · ✍️ manual = lançado em 🏆 Meu Setor. O <b>CMV</b> é sugerido pela <b>média das lojas</b> dos grupos do comprador; os demais pela média do realizado. Clique no <b>ⓘ</b> de cada indicador pra ver o que é e como é calculado.</p>
      </div>
      <div style={{ ...s.card }}>
        <button onClick={() => setCfgAberto(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>⚙️ Configurar pilares, tetos e bônus</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>(avançado)</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{cfgAberto ? 'recolher ▲' : 'abrir ▼'}</span>
        </button>
        {cfgAberto && <div style={{ marginTop: 10 }}>
          <div style={{ background: '#f0f7f4', border: '1px solid #cdeadd', borderRadius: 8, padding: 10, fontSize: 12, color: '#334', marginBottom: 10 }}>
            Cada indicador entra num <b>pilar</b> com um <b>peso</b>. Nota do pilar = Σ peso batido ÷ Σ peso ativo × 100. Prêmio = nota × teto/100; bater <b>100%</b> paga o teto + <b>bônus</b>. A premiação do comprador é a soma dos pilares.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>🧱 Pilares &amp; tetos <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>(até 5)</span></div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>Bônus a 100%
              <input type="number" defaultValue={pilCfg.bonus} key={'b' + pilCfg.bonus} onBlur={e => salvarBonus(e.target.value)} style={{ ...inpSm, width: 60 }} />%</label>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {pilCfg.pilares.map(p => (
              <div key={p.pilar} style={{ border: '1px solid #e3e8ea', borderRadius: 10, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ fontSize: 12.5 }}>{p.pilar}</b>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 3 }}>teto R$
                  <input type="number" defaultValue={p.teto} key={p.pilar + p.teto} onBlur={e => salvarPilar(p.pilar, { teto: e.target.value })} style={{ ...inpSm, width: 64 }} /></label>
                <button onClick={() => delPilar(p.pilar)} title="remover" style={{ border: 'none', background: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 13 }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input value={novoPilar} onChange={e => setNovoPilar(e.target.value)} placeholder="novo pilar…" style={{ ...inpSm, width: 120 }} />
              <button onClick={addPilar} style={{ background: '#0d6b5e', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ pilar</button>
            </div>
          </div>
        </div>}
      </div>
      {d && <FaixasPremioCompras d={d} gestao={false} />}
      {d && <PessoasPremioCompras API={API} comp={comp} d={d} gestao={gestao} />}
      <CmvPorGrupo API={API} />
    </div>
  );
}

// ── Meta de CMV por GRUPO PRINCIPAL (igual p/ todas as lojas ou por loja) + gerar pela média ──
const CMV_COR = { verde: '#15803d', amarelo: '#B7791F', vermelho: '#C0392B', cinza: '#94a3b8' };
function CmvPorGrupo({ API }) {
  const [lojas, setLojas] = useState([]); const [loja, setLoja] = useState('');
  const [meses, setMeses] = useState(3); const [base, setBase] = useState('lojas'); const [d, setD] = useState(null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const salvarTudoCmv = () => { try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {} setTimeout(() => { setMsg('✓ Metas de CMV salvas'); setTimeout(() => setMsg(''), 2800); }, 120); };
  useEffect(() => { API.get('/compras/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  const carregar = useCallback(() => { API.get('/compras/cmv-metas', { params: { loja, meses, base } }).then(r => setD(r.data)).catch(() => setD(null)); }, [API, loja, meses, base]);
  useEffect(() => { carregar(); }, [carregar]);
  const salvar = (grupo, meta) => API.put('/compras/cmv-metas', { loja_id: loja, grupo, meta }).then(carregar).catch(() => {});
  const flash = (t, ms = 3500) => { setMsg(t); setTimeout(() => setMsg(''), ms); };
  const gerar = () => {
    setBusy(true); flash('⏳ analisando os últimos ' + meses + ' meses…', 8000);
    API.get('/compras/cmv-metas/sugerir', { params: { loja, meses } }).then(r => {
      const g = (r.data.grupos || []).map(x => ({ ...x, usar: base === 'simples' ? x.cmvSimples : base === 'lojas' ? x.cmvLojas : x.cmvPond })).filter(x => x.usar != null);
      if (!g.length) { setBusy(false); return flash('Sem venda no período para gerar.'); }
      const nomeBase = base === 'simples' ? 'simples' : base === 'lojas' ? 'das lojas' : 'ponderada';
      Promise.all(g.map(x => API.put('/compras/cmv-metas', { loja_id: loja, grupo: x.grupo, meta: x.usar }).catch(() => {})))
        .then(() => { carregar(); setBusy(false); flash(`✅ ${g.length} metas geradas pela média ${nomeBase} de ${meses} meses — revise e ajuste.`, 4500); });
    }).catch(() => { setBusy(false); flash('⚠️ erro ao analisar.'); });
  };
  const escopo = loja ? (lojas.find(l => l.id === loja)?.nome || 'loja') : 'TODAS as lojas';
  const tabBtn = (v, l) => <button key={v} onClick={() => setBase(v)} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid ' + (base === v ? 'transparent' : '#e3e8ea'), background: base === v ? 'linear-gradient(95deg,#0E7C5A,#0b6e59)' : '#f3f7f6', color: base === v ? '#fff' : '#334', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{l}</button>;
  return (
    <div style={{ ...s.card }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>📉 Meta de CMV por grupo principal</div>
        <label style={{ ...fld, marginLeft: 'auto' }}>Cadastrar para<select value={loja} onChange={e => setLoja(e.target.value)} style={inp}>
          <option value="">Todas as lojas (igual)</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select></label>
        <label style={fld}>Período<select value={meses} onChange={e => setMeses(Number(e.target.value))} style={inp}>
          {[1, 2, 3, 6, 12].map(n => <option key={n} value={n}>últimos {n} {n === 1 ? 'mês' : 'meses'}</option>)}
        </select></label>
        <button onClick={gerar} disabled={busy} style={{ background: '#0d6b5e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-end' }}>{busy ? '⏳' : '⚙️ Gerar pela média'}</button>
        <button onClick={salvarTudoCmv} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-end' }}>💾 Salvar</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Meta pela média:</span>
        {tabBtn('pond', '⚖️ Ponderada')}
        {tabBtn('simples', '➗ Simples')}
        {loja === '' && tabBtn('lojas', '🏬 Média das lojas')}
        <span style={{ fontSize: 11.5, color: '#94a3b8' }}>{base === 'pond' ? 'Σcusto ÷ Σvenda do período (loja/mês de mais venda pesa mais).' : base === 'lojas' ? 'média do CMV de cada loja (cada loja conta igual, independe do tamanho).' : 'média dos CMV de cada mês (cada mês conta igual).'}</span>
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Definindo para <b>{escopo}</b>. Cada grupo (PERFUMARIA, GENÉRICO, PROPAGADO…) tem seu CMV próprio. A meta já vem <b>pré-preenchida</b> com a média <b>{base === 'pond' ? 'ponderada' : base === 'lojas' ? 'das lojas' : 'simples'}</b> dos últimos {meses} {meses === 1 ? 'mês' : 'meses'} — é só ajustar e <b>💾 Salvar</b> (ou sair do campo). As médias ficam todas à mostra pra você comparar. Uma meta por loja <b>sobrepõe</b> a de "Todas".</div>
      {msg && <div style={{ fontSize: 12.5, fontWeight: 600, color: msg.startsWith('⚠️') || msg.startsWith('Sem') ? '#b45309' : '#15803d', marginBottom: 8 }}>{msg}</div>}
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc', borderBottom: '2px solid #eef1f4' }}>{['Grupo principal', '⚖️ CMV ponderado', '➗ CMV simples', ...(loja === '' ? ['🏬 CMV lojas'] : []), 'Venda (período)', 'Meta (%)', ''].map(h => <th key={h} style={{ padding: '9px 10px' }}>{h}</th>)}</tr></thead>
        <tbody>
          {(!d || !(d.grupos || []).length) && <tr><td colSpan={loja === '' ? 7 : 6} style={{ padding: 14, color: '#94a3b8' }}>{d ? 'Sem venda no período.' : '⏳ carregando…'}</td></tr>}
          {(d?.grupos || []).map(g => (
            <tr key={g.grupo} style={{ borderTop: '1px solid #f1f3f5' }}>
              <td style={{ padding: '9px 10px', fontWeight: 600 }}>{g.grupo} <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 400 }}>{g.meses ? g.meses + 'm' : ''}</span></td>
              <td style={{ padding: '9px 10px', fontWeight: base === 'pond' ? 700 : 400, color: base === 'pond' ? (g.salvo ? (CMV_COR[g.farol] || '#334') : '#334') : '#94a3b8' }}>{g.cmvPond != null ? g.cmvPond + '%' : '—'}</td>
              <td style={{ padding: '9px 10px', fontWeight: base === 'simples' ? 700 : 400, color: base === 'simples' ? '#334' : '#94a3b8' }}>{g.cmvSimples != null ? g.cmvSimples + '%' : '—'}</td>
              {loja === '' && <td style={{ padding: '9px 10px', fontWeight: base === 'lojas' ? 700 : 400, color: base === 'lojas' ? '#334' : '#94a3b8' }}>{g.cmvLojas != null ? g.cmvLojas + '%' : '—'}<span style={{ fontSize: 10, color: '#cbd5e1' }}>{g.lojas_n ? ' ' + g.lojas_n + 'lj' : ''}</span></td>}
              <td style={{ padding: '9px 10px', color: '#64748b' }}>{'R$ ' + (g.venda || 0).toLocaleString('pt-BR')}</td>
              <td style={{ padding: '9px 10px' }}><input type="number" step="0.1" defaultValue={g.meta ?? ''} key={g.grupo + '|' + (g.meta ?? 'x') + '|' + g.origem + '|' + base} placeholder="—" onBlur={e => salvar(g.grupo, e.target.value)} style={{ ...inpSm, width: 80, borderColor: g.salvo ? '#cdeadd' : '#e3e8ea', background: g.salvo ? '#f6fcf9' : '#fff' }} />{!g.salvo ? <span style={{ fontSize: 10, color: '#94a3b8' }} title="pré-preenchido com a média escolhida — ajuste e saia do campo p/ fixar"> (média)</span> : (g.origem === 'global' && loja ? <span style={{ fontSize: 10, color: '#94a3b8' }} title="herdada de Todas as lojas"> (global)</span> : '')}</td>
              <td style={{ padding: '9px 10px' }}>{g.salvo && <span style={{ fontSize: 11, fontWeight: 700, color: CMV_COR[g.farol] }}>{g.farol === 'verde' ? '✓ no alvo' : g.farol === 'amarelo' ? '≈ no limite' : g.farol === 'vermelho' ? '▲ acima' : ''}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

function MeuSetorCompras({ API, gestao }) {
  const { usuario } = useAuth();
  const [comps, setComps] = useState([]); const [comp, setComp] = useState('');
  const [d, setD] = useState(null); const [carreg, setCarreg] = useState(false);
  const [pilarSel, setPilarSel] = useState(null); const [det, setDet] = useState(null);
  const meses = React.useMemo(() => { const out = []; const dt = new Date(); dt.setDate(1); const N = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']; for (let i = 0; i < 12; i++) { out.push({ ano: dt.getFullYear(), mes: dt.getMonth() + 1, label: `${N[dt.getMonth()]}/${dt.getFullYear()}` }); dt.setMonth(dt.getMonth() - 1); } return out; }, []);
  const [sel, setSel] = useState(meses[0].ano + '-' + meses[0].mes);
  const BGF = { verde: '#EAF7EF', amarelo: '#FCF7EA', vermelho: '#FBEAEA', sem_dados: '#F6F7F9' };
  const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  useEffect(() => { API.get('/compras/compradores').then(r => { const c = r.data.compradores || []; setComps(c); const meu = c.find(x => x.id === usuario?.id); setComp(meu ? meu.id : (c[0] ? c[0].id : '')); }).catch(() => {}); }, [API, usuario]);
  const carregar = useCallback(() => {
    if (!comp) return; setCarreg(true);
    const [ano, mes] = sel.split('-');
    API.get('/compras/meu-setor', { params: { comprador: comp, ano, mes } }).then(r => setD(r.data)).catch(() => setD(null)).finally(() => setCarreg(false));
  }, [API, comp, sel]);
  useEffect(() => { carregar(); }, [carregar]);
  const [ano, mes] = sel.split('-');
  const salvarReal = (chave, valor) => API.put('/compras/meu-setor/realizado', { comprador_id: comp, ano, mes, chave, valor }).then(carregar).catch(() => {});
  const COR = { verde: '#15803d', vermelho: '#C0392B', sem_dados: '#94a3b8' };
  const notaCor = n => n == null ? '#94a3b8' : n >= 90 ? '#15803d' : n >= 70 ? '#B7791F' : '#C0392B';
  return (
    <div>
      <div style={{ ...s.card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={fld}>Comprador<select value={comp} onChange={e => setComp(e.target.value)} style={{ ...inp, minWidth: 200 }}>
          {comps.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select></label>
        <label style={fld}>Mês<select value={sel} onChange={e => setSel(e.target.value)} style={inp}>
          {meses.map(m => <option key={m.ano + '-' + m.mes} value={m.ano + '-' + m.mes}>{m.label}</option>)}
        </select></label>
        {d && <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Tile label="Nota geral" valor={(d.notaGeral ?? '—') + ''} sub="média dos pilares" cor={notaCor(d.notaGeral)} />
          <Tile label="Premiação" valor={brl(d.premioTotal)} sub={`de ${brl(d.premioMax)} · bônus +${d.bonusPct}%`} cor="#0d6b5e" forte />
        </div>}
      </div>
      {gestao && <div style={{ ...s.card, background: '#f0f7f4', border: '1px solid #cdeadd', fontSize: 12, color: '#334', display: 'flex', alignItems: 'center', gap: 8 }}>🧱 Os <b>pilares</b>, metas, pesos e tetos são cadastrados na aba <b>🎯 Metas</b>. Aqui você lança os realizados manuais e vê a apuração por pilar.</div>}
      {!d ? <div style={s.card}>{carreg ? '⏳ Calculando…' : 'Selecione um comprador.'}</div> :
        (() => {
          const metas = d.metas || [];
          const ICON = { verde: '🟢', amarelo: '🟡', vermelho: '🔴', sem_dados: '⚪' };
          const resumo = { verde: metas.filter(m => m.hit).length, vermelho: metas.filter(m => !m.hit && m.realizado != null).length, sem: metas.filter(m => m.realizado == null).length };
          return <>
            {/* Tabela plana de metas do setor (igual ao Caixa) */}
            <div style={s.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>🎯 Metas do setor</div>
                <span style={{ fontSize: 13 }}>Nota geral: <b style={{ color: notaCor(d.notaGeral), fontSize: 17 }}>{d.notaGeral ?? '—'}</b><span style={{ color: '#999' }}>/100</span></span>
                <span style={{ fontSize: 12.5, background: '#eef7f2', border: '1px solid #cdeadd', color: '#0d6b5e', borderRadius: 999, padding: '3px 10px', fontWeight: 700 }}>🏆 Prêmio: {brl(d.premioTotal)}</span>
                <span style={{ display: 'flex', gap: 8, fontSize: 12.5 }}><b style={{ color: COR.verde }}>🟢 {resumo.verde}</b><b style={{ color: '#C0392B' }}>🔴 {resumo.vermelho}</b>{resumo.sem ? <span style={{ color: '#94a3b8' }}>⚪ {resumo.sem}</span> : null}</span>
                <button onClick={() => carregar()} disabled={carreg} style={{ ...s.btn, background: '#fff', color: '#0d6b5e', border: '1px solid #0d6b5e', marginLeft: 'auto' }}>{carreg ? '⏳' : '🔄 Atualizar'}</button>
              </div>
              {/* GRID de cards de pilar (igual Meu Setor do Caixa) — clique num card p/ ver os indicadores dele */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(5, (d.pilares || []).length || 1)}, minmax(0, 1fr))`, gap: 10, marginBottom: 12 }}>
                {(d.pilares || []).map(p => (
                  <div key={p.pilar} onClick={() => setPilarSel(pilarSel === p.pilar ? null : p.pilar)} title="clique para ver os indicadores deste pilar"
                    style={{ background: BGF[p.farol] || '#F6F7F9', border: '2px solid ' + (pilarSel === p.pilar ? (COR[p.farol] || '#94a3b8') : 'transparent'), borderRadius: 12, padding: '10px 12px', cursor: 'pointer' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#334' }}>{p.pilar}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: notaCor(p.nota), lineHeight: 1.15 }}>{p.nota == null ? '—' : p.nota}<span style={{ fontSize: 12, color: '#999', fontWeight: 600 }}>/100</span></div>
                    <div style={{ fontSize: 11 }}><span style={{ color: COR.verde }}>🟢{p.verde}</span> <span style={{ color: '#C0392B' }}>🔴{p.vermelho}</span>{p.semDados ? <span style={{ color: '#94a3b8' }}> ⚪{p.semDados}</span> : null}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#0d6b5e', marginTop: 3 }}>{brl(p.premio)}{p.bonus && <span title="bateu 100% — teto + bônus" style={{ fontSize: 10, color: '#B7791F' }}> ★</span>}</div>
                  </div>
                ))}
              </div>
              {pilarSel && <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 6 }}>Indicadores do pilar <b>{pilarSel}</b>. <button onClick={() => setPilarSel(null)} style={{ background: 'none', border: 'none', color: '#0d6b5e', cursor: 'pointer', fontWeight: 600 }}>fechar</button></div>}
              {!pilarSel ? <div style={{ fontSize: 12.5, color: '#94a3b8', padding: '8px 2px', textAlign: 'center' }}>👆 Clique num pilar acima para ver os indicadores dele.</div> :
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
                {metas.filter(m => m.pilar === pilarSel).map(m => (
                  <div key={m.chave} onClick={() => setDet(m)} title="clique para entender o indicador"
                    style={{ background: BGF[m.farol] || '#F6F7F9', border: '1px solid ' + (COR[m.farol] || '#94a3b8') + '44', borderRadius: 12, padding: '11px 14px', cursor: 'pointer' }}>
                    <div style={{ fontSize: 11.5, color: '#555', fontWeight: 600, minHeight: 30 }}>{m.nome} <span style={{ color: COR[m.farol] || '#94a3b8' }}>ⓘ</span></div>
                    {m.fonte === 'manual' && gestao
                      ? <input type="number" defaultValue={m.realizado ?? ''} placeholder="lançar…" onClick={e => e.stopPropagation()} onBlur={e => salvarReal(m.chave, e.target.value)} style={{ ...inp, width: '100%', margin: '2px 0', fontSize: 16, fontWeight: 700 }} />
                      : <div style={{ fontSize: 27, fontWeight: 800, color: COR[m.farol] || '#334', margin: '2px 0', lineHeight: 1.1 }}>{m.realizado == null ? '—' : (m.unidade === 'R$' ? fmtVal(m.realizado, 'R$') : m.realizado + (m.unidade === '%' ? '%' : ''))}</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
                      <span style={{ color: '#777' }}>Meta {m.direcao === 'menor' ? '≤' : '≥'} {fmtVal(m.meta, m.unidade)}{m.metaPorComprador ? <span title="alvo deste comprador" style={{ color: '#0d6b5e' }}> •</span> : ''}</span>
                      <b style={{ color: COR[m.farol] || '#94a3b8' }}>{m.hit ? 'no alvo' : m.farol === 'sem_dados' ? 'sem dados' : 'fora'}</b>
                    </div>
                    {m.mercado && <div style={{ fontSize: 10, color: '#2563eb', marginTop: 4, whiteSpace: 'normal', lineHeight: 1.3 }}>📈 {m.mercado}</div>}
                    <div style={{ fontSize: 9.5, color: '#bbb', marginTop: 3, textTransform: 'uppercase', letterSpacing: .3 }}>{m.fonte === 'auto' ? '⚙️ automático' : '✍️ manual'} · ⓘ detalhes</div>
                  </div>
                ))}
              </div>}
            </div>
            {det && <IndicadorModalCompras m={det} onClose={() => setDet(null)} />}
            {(d.pessoas || []).length > 0 && <PessoasPremioCompras API={API} comp={comp} d={d} gestao={false} />}
            <AcordosCompras API={API} comp={comp} ano={ano} mes={mes} gestao={gestao} onChange={carregar} />
          </>;
        })()}
    </div>
  );
}

// ── Modal de detalhe do indicador (igual Caixa): o que significa, como é medido/calculado, o que fazer ──
function IndicadorModalCompras({ m, onClose }) {
  const COR = { verde: '#15803d', amarelo: '#B7791F', vermelho: '#C0392B', sem_dados: '#94a3b8' };
  const val = m.realizado == null ? '—' : (m.unidade === 'R$' ? fmtVal(m.realizado, 'R$') : m.realizado + (m.unidade === '%' ? '%' : (m.unidade ? ' ' + m.unidade : '')));
  const alvo = (m.direcao === 'menor' ? '≤ ' : '≥ ') + fmtVal(m.meta, m.unidade);
  const statusTxt = m.hit ? '✅ No alvo' : m.farol === 'sem_dados' ? '⚪ Sem dados' : '🔴 Fora do alvo';
  const significa = m.realizado == null ? 'Ainda não há dado no período para medir este indicador.'
    : m.hit ? `Está no alvo: o realizado (${val}) está ${m.direcao === 'menor' ? 'dentro do limite' : 'no mínimo exigido'} da meta (${alvo}).`
      : `Fora do alvo: o realizado (${val}) ${m.direcao === 'menor' ? 'passou do teto' : 'ficou abaixo do piso'} da meta (${alvo}).`;
  const Bloco = ({ t, children }) => <div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: .3, marginBottom: 2 }}>{t}</div><div style={{ fontSize: 13, color: '#334', lineHeight: 1.45 }}>{children}</div></div>;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(16,40,45,.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 22, maxWidth: 560, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#1c2a2e' }}>{m.nome}</div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>{m.pilar} · {m.fonte === 'auto' ? '⚙️ automático do sistema' : '✍️ lançado pelo gestor'}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: COR[m.farol] || '#334' }}>{val}</div>
          <div style={{ fontSize: 13, color: '#555' }}>Meta {alvo}<br /><b style={{ color: COR[m.farol] || '#94a3b8' }}>{statusTxt}</b></div>
        </div>
        <Bloco t="O que significa">{significa}</Bloco>
        {m.desc && <Bloco t="Como é medido">{m.desc}</Bloco>}
        {m.calc && <Bloco t="Como é calculado">{m.calc}</Bloco>}
        {m.acesso && <Bloco t="Onde acessar / de onde vem">{m.acesso}</Bloco>}
        {m.mercado && <Bloco t="Referência de mercado">{m.mercado}</Bloco>}
        <div style={{ textAlign: 'right', marginTop: 6 }}><button onClick={onClose} style={{ background: '#0d6b5e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>Fechar</button></div>
      </div>
    </div>
  );
}

// ── Pessoas vinculadas à premiação do COMPRADOR (por fator) — igual Caixa, mas por comprador ──
function PessoasPremioCompras({ API, comp, d, gestao }) {
  const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const [cols, setCols] = useState([]); const [sel, setSel] = useState(''); const [fator, setFator] = useState(100); const [msg, setMsg] = useState('');
  const [pessoas, setPessoas] = useState([]);
  const carregar = useCallback(() => { if (!comp) return; API.get('/compras/meu-setor/pessoas', { params: { comprador: comp } }).then(r => setPessoas(r.data.pessoas || [])).catch(() => setPessoas([])); }, [API, comp]);
  useEffect(() => { API.get('/colaboradores').then(r => setCols(r.data.colaboradores || [])).catch(() => {}); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const premioTotal = d?.premioTotal || 0;
  const vincular = () => {
    if (!sel) { setMsg('Selecione um colaborador.'); setTimeout(() => setMsg(''), 2500); return; }
    API.put('/compras/meu-setor/pessoa', { comprador_id: comp, colaborador_id: sel, fator: (Number(fator) || 0) / 100 })
      .then(() => { setSel(''); setFator(100); carregar(); }).catch(e => { setMsg(e.response?.data?.erro || 'Erro.'); setTimeout(() => setMsg(''), 3000); });
  };
  const remover = cid => API.delete('/compras/meu-setor/pessoa', { params: { comprador: comp, colaborador: cid } }).then(carregar).catch(() => {});
  const jaTem = new Set(pessoas.map(p => p.colaborador_id));
  return (
    <div style={{ ...s.card }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>🧑‍🤝‍🧑 Pessoas na premiação deste comprador</div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Cada pessoa vinculada recebe a premiação deste comprador <b>× o fator</b> dela (100% = cheio, 50% = metade). Ex.: titular 100% + assistente 50%. No período, o comprador faz <b style={{ color: '#0d6b5e' }}>{brl(premioTotal)}</b>.</div>
      {pessoas.length > 0 && <div style={{ overflowX: 'auto', marginBottom: 10 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr style={{ textAlign: 'left', color: '#7a8a8c', borderBottom: '2px solid #eef1f4' }}>{['Pessoa', 'Fator', 'Prêmio no período', ''].map(h => <th key={h} style={{ padding: '7px 10px' }}>{h}</th>)}</tr></thead>
        <tbody>{pessoas.map(p => (
          <tr key={p.colaborador_id} style={{ borderTop: '1px solid #f1f3f5' }}>
            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{p.nome}</td>
            <td style={{ padding: '8px 10px' }}>{Math.round(p.fator * 100)}%</td>
            <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0d6b5e' }}>{brl(premioTotal * (Number(p.fator) || 0))}</td>
            <td style={{ padding: '8px 10px' }}>{gestao && <button onClick={() => remover(p.colaborador_id)} style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#c0392b', borderRadius: 7, padding: '3px 10px', fontSize: 11.5, cursor: 'pointer' }}>remover</button>}</td>
          </tr>))}</tbody>
      </table></div>}
      {!pessoas.length && <div style={{ fontSize: 12.5, color: '#94a3b8', marginBottom: 10 }}>Ninguém vinculado ainda — a premiação vai inteira para o comprador titular.</div>}
      {gestao && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{ ...inp, minWidth: 220 }}>
          <option value="">Selecione o colaborador…</option>
          {cols.filter(c => !jaTem.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ' · ' + c.funcao : ''}</option>)}
        </select>
        <label style={{ fontSize: 12, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Fator<input type="number" value={fator} onChange={e => setFator(e.target.value)} style={{ ...inp, width: 64 }} />%</label>
        <button onClick={vincular} style={{ background: '#0d6b5e', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>+ Vincular</button>
        {msg && <span style={{ fontSize: 12, color: '#b45309' }}>{msg}</span>}
      </div>}
    </div>
  );
}

// ── Faixas do prêmio por pilar (igual Caixa): mostra quanto o comprador ganha por faixa de nota ──
function FaixasPremioCompras({ d, notaCor, API, gestao, onSaved }) {
  const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const pilares = d.pilares || [];
  const nP = pilares.length;
  const somaTeto = pilares.reduce((a, p) => a + (Number(p.teto) || 0), 0);
  const bonus = Number(d.bonusPct) || 0;
  // edição das faixas: teto por pilar (uniforme) + bônus a 100%
  const tetoComum = pilares.length ? (pilares.every(p => Number(p.teto) === Number(pilares[0].teto)) ? Number(pilares[0].teto) : '') : 100;
  const [tetoEdit, setTetoEdit] = useState(tetoComum);
  const [bonusEdit, setBonusEdit] = useState(bonus);
  const [salvando, setSalvando] = useState(false); const [msg, setMsg] = useState('');
  useEffect(() => { setTetoEdit(tetoComum); setBonusEdit(bonus); }, [d.compradorId, tetoComum, bonus]);
  const salvarFaixas = async () => {
    if (!API) return;
    setSalvando(true); setMsg('');
    try {
      if (tetoEdit !== '' && tetoEdit != null) await Promise.all(pilares.map(p => API.put('/compras/meu-setor/pilar', { pilar: p.pilar, teto: Number(tetoEdit) }).catch(() => {})));
      await API.put('/compras/meu-setor/premio-config', { bonus_pct: Number(bonusEdit) || 0 }).catch(() => {});
      setMsg('✅ salvo'); onSaved && onSaved(); setTimeout(() => setMsg(''), 2500);
    } catch { setMsg('⚠️ erro'); } finally { setSalvando(false); }
  };
  const faixas = [
    { pct: '0%', v: 0 },
    { pct: '50%', v: somaTeto * 0.5 },
    { pct: '75%', v: somaTeto * 0.75 },
    { pct: '100% ★', v: somaTeto * (1 + bonus / 100), destaque: true },
  ];
  return (
    <div style={s.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>🏆 Faixas do prêmio por pilar</div>
        {gestao && <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Teto R$/pilar
            <input type="number" value={tetoEdit} onChange={e => setTetoEdit(e.target.value)} placeholder="por pilar" style={{ ...inpSm, width: 80 }} /></label>
          <label style={{ fontSize: 12, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Bônus 100% (%)
            <input type="number" value={bonusEdit} onChange={e => setBonusEdit(e.target.value)} style={{ ...inpSm, width: 56 }} /></label>
          <button onClick={salvarFaixas} disabled={salvando} style={{ background: '#0d6b5e', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{salvando ? '⏳' : 'Salvar'}</button>
          {msg && <span style={{ fontSize: 12, fontWeight: 600, color: msg.startsWith('⚠️') ? '#b45309' : '#15803d' }}>{msg}</span>}
        </span>}
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
        Cada um dos <b>{nP} pilares</b> tem seu teto e paga <b>proporcional à nota</b>. Como a nota não passa de 100, <b>bater 100% paga o teto + {bonus}% de bônus</b>. A premiação do comprador é a <b>soma dos pilares</b>. {gestao ? 'Ajuste o teto e o bônus aqui.' : 'Ajuste os tetos e o bônus no card 🧱 Pilares & tetos acima.'}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        {faixas.map(f => (
          <div key={f.pct} style={{ flex: '1 1 110px', minWidth: 110, background: f.destaque ? '#0d6b5e' : '#f8fafc', color: f.destaque ? '#fff' : '#334', border: '1px solid ' + (f.destaque ? '#0d6b5e' : '#e8edf0'), borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, opacity: f.destaque ? .9 : .7 }}>{f.pct}</div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{brl(f.v)}</div>
          </div>
        ))}
        <div style={{ flex: '1 1 130px', minWidth: 130, background: '#eef7f2', border: '1px solid #cdeadd', borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#0d6b5e' }}>máx ({nP} pilares)</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0d6b5e' }}>{brl(d.premioMax)}</div>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: '#334' }}>No mês selecionado o comprador faria <b style={{ color: '#0d6b5e' }}>{brl(d.premioTotal)}</b> <span style={{ color: '#94a3b8' }}>(nota geral {d.notaGeral ?? '—'}/100)</span>.</div>
    </div>
  );
}

// ── Acordos comerciais: comprador registra (fornecedor + valor + evidência) · diretoria valida ──
function AcordosCompras({ API, comp, ano, mes, gestao, onChange }) {
  const { usuario } = useAuth();
  const diretoria = ['Diretor Geral', 'Gestor Geral', 'Controladoria'].includes(usuario?.funcao);
  const [itens, setItens] = useState([]); const [novo, setNovo] = useState({ fornecedor: '', valor: '', descricao: '' });
  const [arq, setArq] = useState(null); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [abrir, setAbrir] = useState(false);
  const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const carregar = useCallback(() => { if (!comp) return; API.get('/compras/acordos', { params: { comprador: comp, ano, mes } }).then(r => setItens(r.data.itens || [])).catch(() => {}); }, [API, comp, ano, mes]);
  useEffect(() => { carregar(); }, [carregar]);
  const flash = t => { setMsg(t); setTimeout(() => setMsg(''), 3000); };
  const fileToB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  const registrar = async () => {
    if (!novo.fornecedor.trim()) return flash('⚠️ Informe o fornecedor.');
    setBusy(true);
    let evidencia = null, evidencia_nome = null;
    if (arq) { try { evidencia = await fileToB64(arq); evidencia_nome = arq.name; } catch { } }
    API.post('/compras/acordos', { comprador_id: comp, ano, mes, fornecedor: novo.fornecedor, valor: novo.valor, descricao: novo.descricao, evidencia, evidencia_nome })
      .then(() => { setNovo({ fornecedor: '', valor: '', descricao: '' }); setArq(null); setAbrir(false); flash('✅ Acordo registrado (aguarda validação da diretoria).'); carregar(); onChange && onChange(); })
      .catch(e => flash('⚠️ ' + (e.response?.data?.erro || 'erro'))).finally(() => setBusy(false));
  };
  const validar = (id, status) => API.put(`/compras/acordos/${id}/validar`, { status }).then(() => { carregar(); onChange && onChange(); }).catch(e => flash('⚠️ ' + (e.response?.data?.erro || 'erro')));
  const del = id => API.delete(`/compras/acordos/${id}`).then(() => { carregar(); onChange && onChange(); }).catch(() => {});
  const SB = { pendente: { t: '⏳ Aguardando diretoria', c: '#B7791F', bg: '#FCF7EA' }, validado: { t: '✅ Validado', c: '#15803d', bg: '#EAF7EF' }, recusado: { t: '🚫 Recusado', c: '#C0392B', bg: '#FBEAEA' } };
  const nVal = itens.filter(i => i.status === 'validado').length;
  return (
    <div style={{ ...s.card, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <b style={{ fontSize: 14 }}>🤝 Acordos comerciais do mês</b>
        <span style={{ fontSize: 12, color: '#15803d', fontWeight: 700 }}>{nVal} validado(s)</span>
        <button onClick={() => setAbrir(v => !v)} style={{ marginLeft: 'auto', background: '#0d6b5e', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, cursor: 'pointer' }}>{abrir ? 'fechar' : '+ Registrar acordo'}</button>
      </div>
      {abrir && <div style={{ background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 10, padding: 12, marginBottom: 10, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ ...fld, flex: 1, minWidth: 180 }}>Fornecedor<input value={novo.fornecedor} onChange={e => setNovo(n => ({ ...n, fornecedor: e.target.value }))} placeholder="Nome do fornecedor" style={inp} /></label>
          <label style={fld}>Valor do acordo (R$)<input type="number" value={novo.valor} onChange={e => setNovo(n => ({ ...n, valor: e.target.value }))} style={{ ...inp, width: 130 }} /></label>
        </div>
        <label style={fld}>Descrição<textarea value={novo.descricao} onChange={e => setNovo(n => ({ ...n, descricao: e.target.value }))} rows={2} placeholder="O que foi acordado…" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} /></label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={fld}>📎 Evidência<input type="file" onChange={e => setArq(e.target.files?.[0] || null)} style={{ fontSize: 12 }} /></label>
          <button onClick={registrar} disabled={busy} style={{ background: '#0d6b5e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>{busy ? '⏳' : 'Enviar p/ validação'}</button>
          {msg && <span style={{ fontSize: 12.5, fontWeight: 600, color: msg.startsWith('⚠️') ? '#b91c1c' : '#15803d' }}>{msg}</span>}
        </div>
      </div>}
      {itens.length === 0 ? <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Nenhum acordo registrado neste mês.</div> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {itens.map(a => { const sb = SB[a.status] || SB.pendente; return (
            <div key={a.id} style={{ border: '1px solid #eef1f4', borderRadius: 10, padding: '9px 11px', background: sb.bg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div><b style={{ fontSize: 13 }}>{a.fornecedor}</b> {a.valor != null && <span style={{ color: '#0d6b5e', fontWeight: 700 }}>· {brl(a.valor)}</span>}
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>{a.descricao || '—'}</div></div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: sb.c, whiteSpace: 'nowrap' }}>{sb.t}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                {a.tem_evidencia && <a href={`${API.defaults?.baseURL || ''}/compras/acordos/${a.id}/evidencia`} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: '#185FA5' }}>📎 ver evidência</a>}
                <span style={{ fontSize: 10.5, color: '#94a3b8' }}>por {a.criado_por || '—'}{a.validado_por ? ` · validado por ${a.validado_por}` : ''}</span>
                {diretoria && a.status === 'pendente' && <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button onClick={() => validar(a.id, 'validado')} style={{ background: '#15803d', color: '#fff', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Validar</button>
                  <button onClick={() => validar(a.id, 'recusado')} style={{ background: '#fff', color: '#C0392B', border: '1px solid #f1b4ab', borderRadius: 7, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>Recusar</button>
                </span>}
                {!diretoria && a.status === 'pendente' && a.comprador_id === usuario?.id && <button onClick={() => del(a.id)} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 12 }}>remover</button>}
              </div>
            </div>
          ); })}
        </div>}
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>💡 O comprador registra o acordo com a evidência; a <b>diretoria valida</b>. Só os <b>validados</b> contam no indicador "Acordos comerciais".</div>
    </div>
  );
}
// ── Regime tributário dos fornecedores (BrasilAPI) ──
const REG_COR = { 'MEI': '#7c3aed', 'Simples Nacional': '#15803d', 'Lucro Presumido': '#B7791F', 'Lucro Real': '#C0392B' };
function RegimeFornecedores({ API, gestao }) {
  const [itens, setItens] = useState([]); const [cnpj, setCnpj] = useState(''); const [lote, setLote] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [busca, setBusca] = useState(''); const [filtroReg, setFiltroReg] = useState('');
  const carregar = useCallback(() => API.get('/compras/regime').then(r => setItens(r.data.itens || [])).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const flash = (t, ms = 3000) => { setMsg(t); setTimeout(() => setMsg(''), ms); };
  const [prog, setProg] = useState(null);
  const REGIMES_UI = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI', 'Não optante (Presumido/Real)', 'Desconhecido'];
  const pollProg = useCallback(() => { const t = setInterval(() => { API.get('/compras/regime/progresso').then(r => { setProg(r.data); if (!r.data.rodando) { clearInterval(t); carregar(); } }).catch(() => clearInterval(t)); }, 2500); return t; }, [API, carregar]);
  const validarTodos = () => {
    if (!window.confirm('Vai validar TODOS os fornecedores do ERP (com compra nos últimos 3 anos) na BrasilAPI, em segundo plano. Pode levar vários minutos. Continuar?')) return;
    API.post('/compras/regime/validar-todos', {}).then(r => { if (r.data.jaRodando) flash('⏳ já está rodando.'); else { flash(`▶️ validando ${r.data.total} fornecedores em background…`); setProg({ rodando: true, total: r.data.total, feitos: 0, pct: 0 }); pollProg(); } }).catch(() => flash('⚠️ Erro ao iniciar.'));
  };
  const pararValidacao = () => API.post('/compras/regime/parar', {}).then(() => flash('⏹️ parado.')).catch(() => {});
  const setManual = (cnpj, regime) => API.post('/compras/regime/manual', { cnpj, regime }).then(() => carregar()).catch(() => flash('⚠️ Erro no manual.'));
  const herdarMatriz = () => API.post('/compras/regime/propagar-matriz', {}).then(r => { flash(`🏢 ${r.data.propagados} filial(is) herdaram o regime da matriz.`); carregar(); }).catch(() => flash('⚠️ Erro ao herdar da matriz.'));
  const consultarUm = () => { if (!cnpj.trim()) return; setBusy(true); API.post('/compras/regime/consultar', { cnpj, forcar: true }).then(r => { flash(r.data.ok ? '✅ ' + (r.data.razao_social || '') + ' → ' + r.data.regime : '⚠️ ' + r.data.erro); setCnpj(''); carregar(); }).catch(() => flash('⚠️ Erro na consulta.')).finally(() => setBusy(false)); };
  const puxarErp = () => {
    if (!window.confirm('Vai buscar os maiores fornecedores do ERP e consultar o regime de cada um na BrasilAPI (serviço externo). Pode levar ~1 min. Continuar?')) return;
    setBusy(true); API.post('/compras/regime/puxar-erp', { limite: 100 }).then(r => { flash(r.data.aviso ? '⚠️ ' + r.data.aviso : `✅ ${r.data.consultados} fornecedor(es) consultado(s) · ${r.data.falhas} falha(s)`); carregar(); }).catch(() => flash('⚠️ Erro ao puxar do ERP.')).finally(() => setBusy(false));
  };
  const consultarLote = () => {
    const cnpjs = lote.split(/[\s,;\n]+/).map(x => x.replace(/\D/g, '')).filter(x => x.length === 14);
    if (!cnpjs.length) return flash('⚠️ Cole CNPJs (14 dígitos cada).');
    if (!window.confirm(`Vai consultar ${cnpjs.length} CNPJ(s) na BrasilAPI (serviço externo). Continuar?`)) return;
    setBusy(true); API.post('/compras/regime/consultar-lote', { cnpjs }).then(r => { flash(`✅ ${r.data.consultados} ok · ${r.data.falhas} falha(s)`); setLote(''); carregar(); }).catch(() => flash('⚠️ Erro no lote.')).finally(() => setBusy(false));
  };
  const resumo = itens.reduce((a, i) => { a[i.regime] = (a[i.regime] || 0) + 1; return a; }, {});
  const bq = busca.trim().toLowerCase();
  const itensFiltrados = itens.filter(i => (!filtroReg || i.regime === filtroReg) && (!bq || (i.razao_social || '').toLowerCase().includes(bq) || String(i.cnpj).includes(bq.replace(/\D/g, ''))));
  return (
    <div>
      <div style={{ ...s.card, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12.5, color: '#92400e' }}>
        ⚠️ A consulta de regime <b>envia o CNPJ do fornecedor para a BrasilAPI</b> (serviço público externo). Classifica em <b>Simples Nacional · MEI · Lucro Presumido · Lucro Real</b>. O Presumido/Real vem das escriturações (ECF) públicas; fornecedor pequeno às vezes só tem o Simples. Resultado fica salvo (não reconsulta por 60 dias).
      </div>
      {gestao && <div style={{ ...s.card, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={fld}>Consultar um CNPJ<input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" style={{ ...inp, width: 200 }} /></label>
          <button onClick={consultarUm} disabled={busy} style={{ ...inp, cursor: 'pointer', background: '#0d6b5e', color: '#fff', border: 'none', fontWeight: 700 }}>{busy ? '⏳' : 'Consultar'}</button>
          {msg && <span style={{ fontSize: 12.5, fontWeight: 600, color: msg.startsWith('⚠️') ? '#b91c1c' : '#15803d' }}>{msg}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ ...fld, flex: 1, minWidth: 260 }}>Ou cole vários CNPJs (lote)<textarea value={lote} onChange={e => setLote(e.target.value)} rows={2} placeholder="um por linha ou separados por vírgula…" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} /></label>
          <button onClick={consultarLote} disabled={busy} style={{ ...inp, cursor: 'pointer', color: '#0d6b5e', borderColor: '#0d6b5e', fontWeight: 700 }}>Consultar lote</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={puxarErp} disabled={busy} style={{ ...inp, cursor: 'pointer', background: '#B7791F', color: '#fff', border: 'none', fontWeight: 700 }}>{busy ? '⏳ consultando…' : '⬇️ Puxar fornecedores do ERP (top 100 por volume)'}</button>
          <button onClick={validarTodos} disabled={prog?.rodando} style={{ ...inp, cursor: 'pointer', background: '#0d6b5e', color: '#fff', border: 'none', fontWeight: 700 }}>{prog?.rodando ? '⏳ validando…' : '✅ Validar TODOS os fornecedores'}</button>
          <button onClick={herdarMatriz} disabled={prog?.rodando} style={{ ...inp, cursor: 'pointer', color: '#2E5C9E', borderColor: '#2E5C9E', fontWeight: 700 }} title="Filiais Desconhecidas herdam o regime de um CNPJ já classificado da mesma raiz (regime é da empresa, não da filial)">🏢 Herdar da matriz</button>
          <span style={{ fontSize: 11.5, color: '#94a3b8' }}>"Validar TODOS" roda em segundo plano (3 anos de compra); o "Puxar" é só o top 100. "Herdar da matriz" aplica o regime de um CNPJ já classificado às filiais Desconhecidas da mesma raiz.</span>
        </div>
        {prog && (prog.rodando || prog.pct < 100) && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 10, background: '#eef1f4', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: (prog.pct || 0) + '%', height: '100%', background: '#0d6b5e', transition: 'width .3s' }} /></div>
          <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{prog.feitos || 0}/{prog.total || 0} ({prog.pct || 0}%){prog.falha ? ' · ' + prog.falha + ' falha(s)' : ''}</span>
          {prog.rodando && <button onClick={pararValidacao} style={{ fontSize: 11.5, color: '#b91c1c', border: '1px solid #fecaca', background: '#fff', borderRadius: 7, padding: '3px 10px', cursor: 'pointer' }}>parar</button>}
        </div>}
      </div>}
      {Object.keys(resumo).length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        {Object.entries(resumo).sort((a, b) => b[1] - a[1]).map(([r, n]) => {
          const on = filtroReg === r;
          return <button key={r} onClick={() => setFiltroReg(on ? '' : r)} title="clique para filtrar" style={{ fontSize: 12.5, fontWeight: 700, background: on ? (REG_COR[r] || '#64748b') : (REG_COR[r] || '#64748b') + '18', color: on ? '#fff' : (REG_COR[r] || '#64748b'), border: '1px solid ' + (REG_COR[r] || '#64748b') + (on ? '' : '44'), borderRadius: 999, padding: '4px 12px', cursor: 'pointer' }}>{r}: {n}</button>;
        })}
        {filtroReg && <button onClick={() => setFiltroReg('')} style={{ fontSize: 12, color: '#64748b', border: 'none', background: 'none', cursor: 'pointer' }}>✕ limpar filtro</button>}
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔎 buscar fornecedor…" style={{ ...inp, marginLeft: 'auto', minWidth: 220 }} />
      </div>}
      <div style={{ ...s.card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc', borderBottom: '2px solid #eef1f4' }}>{['Fornecedor', 'CNPJ', 'Regime', 'Consultado', ...(gestao ? ['Ajuste manual'] : [])].map(h => <th key={h} style={{ padding: '9px 11px' }}>{h}</th>)}</tr></thead>
          <tbody>
            {itensFiltrados.length === 0 && <tr><td colSpan={gestao ? 5 : 4} style={{ padding: 14, color: '#94a3b8' }}>{itens.length === 0 ? 'Nenhum fornecedor consultado ainda.' : 'Nada com esse filtro/busca.'}</td></tr>}
            {itensFiltrados.map(i => (
              <tr key={i.cnpj} style={{ borderTop: '1px solid #f1f3f5' }}>
                <td style={{ padding: '9px 11px', fontWeight: 600 }}>{i.razao_social || '—'}</td>
                <td style={{ padding: '9px 11px', fontFamily: 'monospace', color: '#64748b' }}>{String(i.cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}</td>
                <td style={{ padding: '9px 11px' }}>{i.erro ? <span style={{ color: '#b91c1c' }}>⚠️ {i.erro}</span> : <span style={{ fontWeight: 700, color: REG_COR[i.regime] || '#334' }}>{i.regime}{i.ult_ano ? <span style={{ color: '#94a3b8', fontWeight: 400 }}> ({i.ult_ano})</span> : ''}{i.manual ? <span title={'manual' + (i.manual_por ? ' · ' + i.manual_por : '')} style={{ fontSize: 10, color: '#B7791F', fontWeight: 600 }}> ✏️ manual</span> : ''}{i.via_matriz && !i.manual ? <span title="herdado da matriz (mesma raiz de CNPJ)" style={{ fontSize: 10, color: '#2E5C9E', fontWeight: 600 }}> 🏢 via matriz</span> : ''}</span>}</td>
                <td style={{ padding: '9px 11px', color: '#94a3b8', fontSize: 11.5 }}>{i.consultado_em ? String(i.consultado_em).replace('T', ' ').slice(0, 16) : ''}</td>
                {gestao && <td style={{ padding: '7px 11px' }}><select value={i.manual ? i.regime : ''} onChange={e => setManual(i.cnpj, e.target.value)} style={{ ...inp, padding: '4px 6px', fontSize: 11.5, minWidth: 150 }} title="fixar o regime à mão (não é sobrescrito pela API)"><option value="">— definir manual —</option>{REGIMES_UI.map(r => <option key={r} value={r}>{r}</option>)}</select></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// formata o valor de um indicador: R$ com casas decimais e milhar; % com %; demais cru.
const fmtVal = (v, unidade) => v == null ? '—' : (unidade === 'R$' ? 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : unidade === '%' ? v + '%' : String(v));
const fld = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5, color: '#64748b', fontWeight: 600 };
const inp = { border: '1px solid #e3e8ea', borderRadius: 8, padding: '7px 9px', fontSize: 13 };
const inpSm = { border: '1px solid #e3e8ea', borderRadius: 6, padding: '4px 6px', fontSize: 12 };
function Tile({ label, valor, sub, cor, forte }) {
  return <div style={{ textAlign: 'right', background: forte ? '#eef7f2' : '#f8fafc', border: '1px solid ' + (forte ? '#cdeadd' : '#eef2f0'), borderRadius: 10, padding: '6px 12px', minWidth: 110 }}>
    <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 19, fontWeight: 800, color: cor || '#0f172a' }}>{valor}</div>
    {sub && <div style={{ fontSize: 9.5, color: '#94a3b8' }}>{sub}</div>}
  </div>;
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1360, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 12 },
  chip: { fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  chipInfo: { fontSize: 11, background: '#F0F3F7', borderRadius: 12, padding: '3px 8px', color: '#444', marginRight: 4, display: 'inline-block', marginBottom: 3 },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 12, padding: '5px 10px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
  tab: { width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', border: '1px solid #eee', borderRadius: 10 },
  th: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em', color: '#999', padding: '10px 10px', borderBottom: '2px solid #f0f0f0', whiteSpace: 'nowrap' },
  td: { padding: '9px 10px', color: '#333', whiteSpace: 'nowrap' },
  dot: { display: 'inline-block', width: 12, height: 12, borderRadius: '50%' },
  pill: { fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 14 },
  tag: { fontSize: 10.5, background: '#EEF3F8', color: '#5A7186', borderRadius: 10, padding: '2px 7px', marginLeft: 6, fontWeight: 600 },
  badge: { fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 12, whiteSpace: 'nowrap' },
  lbl: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#888' },
};
