import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner, { bannerBtn } from '../components/Banner';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';

const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
const COLS = [
  { id: 'rascunho', nome: 'Rascunho', cor: '#7A8794' }, { id: 'negociacao', nome: 'Negociação', cor: '#D6409F' },
  { id: 'vigente', nome: 'Vigente', cor: '#1E874B' }, { id: 'encerrado', nome: 'Encerrado', cor: '#555' },
];

// Busca genérica no ERP (fornecedor/produto).
function BuscaERP({ API, rota, campo, onPick, placeholder }) {
  const [q, setQ] = useState(''); const [itens, setItens] = useState([]);
  const buscar = v => { setQ(v); if (v.length >= 2) API.get(rota, { params: { q: v } }).then(r => setItens(r.data[campo] || [])).catch(() => setItens([])); else setItens([]); };
  return (
    <div style={{ position: 'relative' }}>
      <input value={q} onChange={e => buscar(e.target.value)} placeholder={placeholder} style={{ ...s.inp, width: '100%' }} />
      {q.length >= 2 && itens.length > 0 && <div style={{ position: 'absolute', zIndex: 6, background: '#fff', border: '1px solid #eee', borderRadius: 8, maxHeight: 170, overflowY: 'auto', width: '100%', boxShadow: '0 6px 18px rgba(0,0,0,.12)' }}>{itens.map(it => <div key={it.id + (it.ean || '')} onMouseDown={() => { onPick(it); setQ(''); setItens([]); }} style={{ padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}>{it.nome}{it.ean ? <span style={{ color: '#999' }}> · {it.ean}</span> : ''}</div>)}</div>}
    </div>
  );
}

export default function TradeMarketing() {
  const { API, usuario } = useAuth();
  const gestao = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Comprador Beleza', 'Comprador Bem-estar', 'Marketing'].includes(usuario.funcao);
  const [aba, setAba] = useState('vendas');
  const [modelo, setModelo] = useState(false);
  return (
    <div style={s.wrap}>
      <Banner emoji="📐" titulo="Trade Marketing" cor="roxo" sub="Aluguel de espaços da loja (pontos extras, ilhas, gôndolas) para fornecedores — contrato, financeiro e sell-out no ERP.">
        {gestao && <button onClick={() => setModelo(true)} style={bannerBtn}>📄 Modelo de contrato</button>}
      </Banner>
      <div style={{ display: 'flex', gap: 6, margin: '10px 0 14px', flexWrap: 'wrap' }}>
        {[['dashboard', '📊 Dashboard'], ['vendas', '🗂️ Negociações'], ['porloja', '🏬 Espaços por loja'], ['espacos', '🗂️ Áreas & Espaços'], ['temas', '🎨 Temas'], ['grupos', '🏢 Grupos econômicos']].map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {modelo && <ModeloContrato API={API} onClose={() => setModelo(false)} />}
      {aba === 'dashboard' && <Dashboard API={API} />}
      {aba === 'vendas' && <Vendas API={API} gestao={gestao} />}
      {aba === 'porloja' && <EspacoLoja API={API} gestao={gestao} />}
      {aba === 'espacos' && <Espacos API={API} gestao={gestao} />}
      {aba === 'temas' && <Temas API={API} gestao={gestao} />}
      {aba === 'grupos' && <GruposEconomicos API={API} gestao={gestao} />}
    </div>
  );
}

function Vendas({ API, gestao }) {
  const [d, setD] = useState(null); const [busca, setBusca] = useState(''); const [edit, setEdit] = useState(null);
  const carregar = useCallback((b = '') => API.get('/trademkt/vendas', { params: { busca: b || undefined } }).then(r => setD(r.data)).catch(() => setD({ vendas: [] })), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!d) return <div style={s.card}>Carregando…</div>;
  const mover = (v, dir) => { const ids = COLS.map(c => c.id); const novo = ids[ids.indexOf(v.status) + dir]; if (novo) API.post(`/trademkt/vendas/${v.id}/mover`, { status: novo }).then(() => carregar(busca)); };
  const total = d.vendas.reduce((x, v) => x + (v.valor || 0), 0);
  const aReceber = d.vendas.reduce((x, v) => x + (v.aReceber || 0), 0);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 12.5, color: '#666' }}>{d.vendas.length} negociação(ões) · vendido {brl(total)} · a receber <b style={{ color: '#B7791F' }}>{brl(aReceber)}</b></div>
        {gestao && <button onClick={() => setEdit('novo')} style={s.btn}>+ Nova negociação</button>}
      </div>
      <form onSubmit={e => { e.preventDefault(); carregar(busca); }} style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔎 fornecedor ou código…" style={{ ...s.inp, flex: 1, maxWidth: 380 }} /><button style={s.btnMini}>Buscar</button>
      </form>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
        {COLS.map(col => {
          const itens = d.vendas.filter(v => v.status === col.id);
          return (
            <div key={col.id} style={{ minWidth: 250, flex: '1 1 250px', maxHeight: 'calc(100vh - 250px)', minHeight: 240, overflowY: 'auto', overflowX: 'hidden' }}>
              <div style={{ ...s.colHead, background: col.cor }}>{col.nome} <span style={s.colN}>{itens.length}</span></div>
              <div style={s.colBody}>
                {itens.map(v => (
                  <div key={v.id} style={s.cardA}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11.5, fontWeight: 700, color: col.cor }}>📐 {v.codigo}</span>{v.atrasado ? <span style={{ ...s.tag, background: '#FBEAEA', color: '#C0392B' }}>atraso</span> : null}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4 }}>{v.fornecedor_nome}</div>
                    <div style={{ fontSize: 11.5, color: '#666' }}>{v.espacos} espaço(s){v.tema_desc ? ` · ${v.tema_desc}` : ''}</div>
                    {(v.vigencia_ini || v.vigencia_fim) && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>🗓️ {dBR(v.vigencia_ini)}–{dBR(v.vigencia_fim)}</div>}
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E874B', marginTop: 4 }}>{brl(v.valor)}</div>
                    {v.aReceber > 0 && <div style={{ fontSize: 11, color: '#B7791F' }}>a receber {brl(v.aReceber)}</div>}
                    {gestao && <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      <button onClick={() => mover(v, -1)} disabled={v.status === COLS[0].id} style={s.mv}>◀</button>
                      <button onClick={() => setEdit(v.id)} style={{ ...s.mv, flex: 1 }}>Abrir</button>
                      <button onClick={() => mover(v, 1)} disabled={v.status === 'encerrado'} style={s.mv}>▶</button>
                    </div>}
                  </div>
                ))}
                {itens.length === 0 && <div style={{ fontSize: 12, color: '#bbb', textAlign: 'center', padding: 16 }}>—</div>}
              </div>
            </div>
          );
        })}
      </div>
      {edit && <EditorVenda API={API} idInicial={edit === 'novo' ? null : edit} onClose={() => setEdit(null)} onSaved={() => carregar(busca)} />}
    </div>
  );
}

function EditorVenda({ API, idInicial, onClose, onSaved }) {
  const [id, setId] = useState(idInicial);
  const [aba, setAba] = useState('dados');
  const [v, setV] = useState({ fornecedor_nome: '', status: 'rascunho', valor: '', eans: [], espacos: [], parcelas: [] });
  const [cad, setCad] = useState({ areas: [], espacos: [], temas: [] });
  const [lojas, setLojas] = useState([]); const [espLoja, setEspLoja] = useState([]); const [espLojaSel, setEspLojaSel] = useState(''); const [verContrato, setVerContrato] = useState(false);
  const [sell, setSell] = useState(null);
  const recarregar = useCallback(aid => API.get(`/trademkt/vendas/${aid}`).then(r => setV(r.data.venda)), [API]);
  useEffect(() => {
    API.get('/trademkt/cadastros').then(r => setCad(r.data)).catch(() => {});
    API.get('/compras/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {});
    API.get('/trademkt/espaco-loja').then(r => setEspLoja(r.data.itens || [])).catch(() => {});
    if (id) recarregar(id);
  }, [API, id, recarregar]);
  const set = (k, val) => setV(x => ({ ...x, [k]: val }));
  const salvarDados = () => {
    if (!v.fornecedor_nome) return;
    if (id) return API.put(`/trademkt/vendas/${id}`, v).then(() => recarregar(id).then(onSaved));
    return API.post('/trademkt/vendas', v).then(r => { setId(r.data.id); recarregar(r.data.id); onSaved(); });
  };
  const recarregarEspLoja = () => API.get('/trademkt/espaco-loja').then(r => setEspLoja(r.data.itens || [])).catch(() => {});
  const addEspacoLoja = p => API.post(`/trademkt/vendas/${id}/espacos`, { espaco_id: p.id, espaco_desc: p.espaco, area_desc: p.area, valor: p.preco_unit, loja_id: p.loja_id, loja_nome: p.loja_nome })
    .then(() => Promise.all([recarregar(id).then(onSaved), recarregarEspLoja()]))
    .catch(err => alert(err.response?.data?.erro || 'Não foi possível adicionar o espaço.'));
  const delEspaco = eid => API.delete(`/trademkt/vendas/${id}/espacos/${eid}`).then(() => recarregar(id).then(onSaved));
  const addEan = p => { if (!v.eans.includes(p.ean)) { const eans = [...v.eans, p.ean]; set('eans', eans); API.put(`/trademkt/vendas/${id}`, { eans }).then(() => recarregar(id)); } };
  const delEan = e => { const eans = v.eans.filter(x => x !== e); set('eans', eans); API.put(`/trademkt/vendas/${id}`, { eans }).then(() => recarregar(id)); };
  const gerarParcelas = (n, prim) => API.post(`/trademkt/vendas/${id}/parcelas`, { parcelas: n, valor: v.valor, primeiro_venc: prim }).then(() => recarregar(id));
  const baixar = pid => API.post(`/trademkt/parcelas/${pid}/baixa`, {}).then(() => recarregar(id).then(onSaved));
  const verSellout = () => API.get(`/trademkt/vendas/${id}/sellout`).then(r => setSell(r.data)).catch(e => setSell({ ok: false, motivo: e.response?.data?.erro || 'Erro' }));
  const precisaSalvar = !id;
  const ABAS = [['dados', '📄 Dados & Espaços'], ['financeiro', '💳 Financeiro'], ['sellout', '📈 Sell-out (ERP)']];
  const COLS_SELL = [
    { k: 'ean', label: 'EAN', tipo: 'txt', get: it => it.ean || '' },
    { k: 'qtd_contrato', label: 'Qtd contrato', tipo: 'num', right: true, get: it => it.qtd_contrato || 0 },
    { k: 'valor_contrato', label: 'R$ contrato', tipo: 'num', right: true, get: it => it.valor_contrato || 0 },
    { k: 'qtd_anterior', label: 'Qtd anterior', tipo: 'num', right: true, get: it => it.qtd_anterior || 0 },
    { k: 'valor_anterior', label: 'R$ anterior', tipo: 'num', right: true, get: it => it.valor_anterior || 0 },
    { k: 'variacao', label: 'Var.', tipo: 'num', right: true, get: it => it.variacao ?? 0 },
  ];
  const { linhas: linhasSell, ordem: ordemSell, clicar: clicarSell, seta: setaSell } = useOrdenavel(sell?.itens, COLS_SELL, { col: 'variacao', dir: 'desc' });

  return (
    <div onClick={onClose} style={s.overlay}><div onClick={e => e.stopPropagation()} style={{ ...s.modal, maxWidth: 780 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <b style={{ fontSize: 15 }}>{id ? `Negociação ${v.codigo || ''}` : 'Nova negociação'} {v.status && <span style={s.tag}>{v.status}</span>}</b>
        <button onClick={onClose} style={s.btnMini}>✕ Fechar</button>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 8 }}>
        {ABAS.map(([k, l]) => <button key={k} disabled={precisaSalvar && k !== 'dados'} onClick={() => setAba(k)} style={{ ...s.chip, ...(aba === k ? s.chipOn : {}), opacity: precisaSalvar && k !== 'dados' ? .4 : 1 }}>{l}{precisaSalvar && k !== 'dados' ? ' (salve 1º)' : ''}</button>)}
      </div>

      {aba === 'dados' && <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ ...s.lbl, flex: 1, minWidth: 200 }}>Fornecedor *
            {v.fornecedor_id ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '6px 10px', background: '#F3F7F4', border: '1px solid #DDEBE1', borderRadius: 8 }}>✅ <b>{v.fornecedor_nome}</b><button type="button" onClick={() => { set('fornecedor_id', ''); set('fornecedor_nome', ''); }} style={{ ...s.mv, marginLeft: 'auto' }}>trocar</button></div>
              : <BuscaERP API={API} rota="/trademkt/erp/fornecedores" campo="fornecedores" placeholder="buscar fornecedor no ERP…" onPick={f => { set('fornecedor_id', f.id); set('fornecedor_nome', f.nome); }} />}
          </div>
          <label style={s.lbl}>Loja<select value={v.loja_id || ''} onChange={e => set('loja_id', e.target.value)} style={s.inp}><option value="">—</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={s.lbl}>Início vigência<input type="date" value={v.vigencia_ini || ''} onChange={e => set('vigencia_ini', e.target.value)} style={s.inp} /></label>
          <label style={s.lbl}>Fim vigência<input type="date" value={v.vigencia_fim || ''} onChange={e => set('vigencia_fim', e.target.value)} style={s.inp} /></label>
          <label style={s.lbl}>Forma pgto<select value={v.forma_pagamento || ''} onChange={e => set('forma_pagamento', e.target.value)} style={s.inp}><option value="">—</option>{['Boleto', 'Depósito', 'Desconto em boleto', 'Bonificação', 'Brinde'].map(f => <option key={f}>{f}</option>)}</select></label>
          <label style={s.lbl}>Tema<select value={v.tema_id || ''} onChange={e => { const t = cad.temas.find(x => x.id === e.target.value); set('tema_id', e.target.value); set('tema_desc', t ? t.descricao : ''); }} style={s.inp}><option value="">—</option>{cad.temas.map(t => <option key={t.id} value={t.id}>{t.descricao}</option>)}</select></label>
          <label style={s.lbl}>Valor total R$<input type="number" value={v.valor} onChange={e => set('valor', e.target.value)} style={{ ...s.inp, width: 120 }} /></label>
          <label style={s.lbl}>Status<select value={v.status} onChange={e => set('status', e.target.value)} style={s.inp}>{COLS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}<option value="cancelado">Cancelado</option></select></label>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ ...s.lbl, flex: 1, minWidth: 200 }}>URL do contrato assinado<input value={v.contrato_url || ''} onChange={e => set('contrato_url', e.target.value)} placeholder="cole a URL" style={s.inp} /></label>
          {id && <button type="button" onClick={() => setVerContrato(true)} style={s.btnMini} title="Preenche o modelo com os dados desta negociação">📄 Gerar contrato do modelo</button>}
        </div>
        <textarea value={v.observacao || ''} onChange={e => set('observacao', e.target.value)} placeholder="Observações" style={{ ...s.inp, minHeight: 46, resize: 'vertical' }} />
        <button onClick={salvarDados} style={s.btn}>💾 Salvar</button>
        {verContrato && id && <ContratoGerado API={API} vendaId={id} onClose={() => setVerContrato(false)} />}

        {id && (() => {
          const lojasComEspaco = [...new Set(espLoja.map(x => x.loja_nome))];
          const daLoja = espLojaSel ? espLoja.filter(x => x.loja_nome === espLojaSel) : [];
          const totalEsp = (v.espacos || []).reduce((a, e) => a + (e.valor || 0), 0);
          const nLojas = new Set((v.espacos || []).map(e => e.loja_nome).filter(Boolean)).size;
          return (
            <div style={{ borderTop: '1px solid #eee', paddingTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🏬 Áreas e espaços da negociação {totalEsp ? <span style={{ fontWeight: 400, color: '#1E874B' }}>· {brl(totalEsp)}{nLojas > 1 ? ` · ${nLojas} lojas` : ''}</span> : ''}</div>
              {(v.espacos || []).map(e => <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderTop: '1px solid #f5f5f5' }}><span>{e.loja_nome ? <b style={{ color: '#2E5C9E' }}>{e.loja_nome}</b> : ''} · {e.area_desc ? e.area_desc + ' · ' : ''}{e.espaco_desc}{e.slot ? <span style={{ color: '#8A6D3B' }}> · vaga {e.slot}</span> : ''} — {brl(e.valor)}</span><button onClick={() => delEspaco(e.id)} style={s.mv}>✕</button></div>)}
              {(v.espacos || []).length === 0 && <div style={{ fontSize: 11.5, color: '#aaa', padding: '4px 0' }}>Nenhum espaço ainda — adicione de uma ou mais lojas abaixo.</div>}
              <div style={{ marginTop: 10, background: '#F7FAFF', border: '1px solid #E3ECF7', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#2E5C9E', marginBottom: 6 }}>➕ Incluir espaço (pode ser de várias lojas)</div>
                <select value={espLojaSel} onChange={e => setEspLojaSel(e.target.value)} style={{ ...s.inp, marginBottom: 6 }}><option value="">Escolha a loja…</option>{lojasComEspaco.map(l => <option key={l} value={l}>{l}</option>)}</select>
                {espLojaSel && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 150, overflowY: 'auto' }}>
                  {daLoja.map(p => { const cheio = (p.disponiveis != null ? p.disponiveis : p.quantidade) <= 0;
                    return <button key={p.id} disabled={cheio} onClick={() => addEspacoLoja(p)} style={{ ...s.btnMini, opacity: cheio ? 0.45 : 1, cursor: cheio ? 'not-allowed' : 'pointer' }} title={`${p.loja_nome} · ${p.area} · ${p.ocupados || 0}/${p.quantidade} ocupados`}>+ {p.area} · {p.espaco} ({brl(p.preco_unit)}) <b style={{ color: cheio ? '#C0392B' : '#1E874B' }}>{p.ocupados || 0}/{p.quantidade}</b></button>; })}
                  {daLoja.length === 0 && <span style={{ fontSize: 11.5, color: '#aaa' }}>Sem espaços nessa loja.</span>}
                </div>}
              </div>
            </div>
          );
        })()}
      </div>}

      {aba === 'financeiro' && id && <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Parcelas / recebimentos</div>
        <GerarParcelas onGerar={gerarParcelas} />
        {(v.parcelas || []).length === 0 && <div style={s.vazio}>Sem parcelas. Gere acima ou o valor é à vista.</div>}
        {(v.parcelas || []).map(p => {
          const atras = !p.recebido && p.vencimento && p.vencimento < new Date().toISOString().slice(0, 10);
          return <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '6px 0', borderTop: '1px solid #f2f2f2' }}>
            <span><span style={{ ...s.tag, background: p.recebido ? '#E7F5EC' : atras ? '#FBEAEA' : '#FCF3E2', color: p.recebido ? '#1E874B' : atras ? '#C0392B' : '#B7791F' }}>{p.recebido ? 'recebido' : atras ? 'atrasado' : 'a receber'}</span> parcela {p.numero} · venc {dBR(p.vencimento)} · {brl(p.valor)}</span>
            <button onClick={() => baixar(p.id)} style={s.mv}>{p.recebido ? 'estornar' : 'dar baixa'}</button>
          </div>;
        })}
      </div>}

      {aba === 'sellout' && id && <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12.5, color: '#666' }}>Vendas ao consumidor dos EANs monitorados: período do contrato × período anterior igual (do ERP).</div>
          <button onClick={verSellout} style={s.btnMini}>🔄 Apurar</button>
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={s.lbl}>EANs monitorados</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>{(v.eans || []).map(e => <span key={e} style={{ fontSize: 12, background: '#EEF2F7', borderRadius: 12, padding: '3px 8px' }}>{e} <b onClick={() => delEan(e)} style={{ cursor: 'pointer', color: '#999' }}>✕</b></span>)}</div>
          <BuscaERP API={API} rota="/trademkt/erp/produtos" campo="produtos" placeholder="buscar produto p/ monitorar (nome ou EAN)…" onPick={addEan} />
        </div>
        {sell && !sell.ok && <div style={{ ...s.card, background: '#FCF7EA', color: '#8A6D3B', fontSize: 12.5 }}>{sell.motivo}</div>}
        {sell && sell.ok && <div style={{ overflowX: 'auto' }}>
          <div style={{ fontSize: 11.5, color: '#999', marginBottom: 4 }}>Contrato {dBR(sell.periodo.ini)}–{dBR(sell.periodo.fim)} ({sell.periodo.dias}d) × anterior desde {dBR(sell.periodo.antIni)} {sell.loja ? '· só a loja da venda' : '· todas as lojas'}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr>{COLS_SELL.map(c => <ThOrd key={c.k} c={c} ordem={ordemSell} clicar={clicarSell} seta={setaSell} base={s.th} />)}</tr></thead>
            <tbody>{linhasSell.map(it => <tr key={it.ean} style={{ borderTop: '1px solid #f0f0f0' }}>
              <td style={s.td}>{it.ean}</td><td style={s.tdR}>{it.qtd_contrato}</td><td style={s.tdR}>{brl(it.valor_contrato)}</td>
              <td style={s.tdR}>{it.qtd_anterior}</td><td style={s.tdR}>{brl(it.valor_anterior)}</td>
              <td style={{ ...s.tdR, fontWeight: 700, color: it.variacao > 0 ? '#1E874B' : it.variacao < 0 ? '#C0392B' : '#999' }}>{it.variacao == null ? '—' : (it.variacao > 0 ? '+' : '') + it.variacao + '%'}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>}
    </div></div>
  );
}

function GerarParcelas({ onGerar }) {
  const [n, setN] = useState(1); const [prim, setPrim] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10 }}>
      <label style={s.lbl}>Nº parcelas<input type="number" min="1" value={n} onChange={e => setN(Number(e.target.value))} style={{ ...s.inp, width: 80 }} /></label>
      <label style={s.lbl}>1º vencimento<input type="date" value={prim} onChange={e => setPrim(e.target.value)} style={s.inp} /></label>
      <button onClick={() => onGerar(n, prim)} style={s.btnMini}>Gerar parcelas</button>
    </div>
  );
}

function Dashboard({ API }) {
  const [d, setD] = useState(null); const [loja, setLoja] = useState(''); const [lojas, setLojas] = useState([]);
  const carregar = useCallback(() => API.get('/trademkt/dashboard', { params: { loja: loja || undefined } }).then(r => setD(r.data)).catch(() => {}), [API, loja]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/trademkt/espaco-loja').then(r => setLojas([...new Set((r.data.itens || []).map(i => i.loja_nome))])).catch(() => {}); }, [API]);
  const k = d?.kpis;
  const cards = k ? [
    ['Total de Espaços', k.total, '#2E5C9E'], ['Espaços Vendidos', k.vendidos, '#1E874B'],
    ['Disponíveis', k.disponiveis, '#B7791F'], ['Taxa de Ocupação', k.ocupacao + '%', '#7A4FB0'],
    ['Potencial (mês)', brl(k.potencial), '#1E874B'], ['Potencial Perdido', brl(k.potencialPerdido), '#C0392B'],
    ['Produtos Monitorados', k.monitorados, '#555'],
  ] : [];
  const COLS_L = [
    { k: 'loja', label: 'Loja', tipo: 'txt', get: l => l.loja || '' },
    { k: 'total', label: 'Total', tipo: 'num', right: true, get: l => l.total || 0 },
    { k: 'vendidos', label: 'Vendidos', tipo: 'num', right: true, get: l => l.vendidos || 0 },
    { k: 'disponiveis', label: 'Disponíveis', tipo: 'num', right: true, get: l => l.disponiveis || 0 },
    { k: 'ocupacao', label: 'Ocupação', tipo: 'num', right: true, get: l => l.ocupacao || 0 },
    { k: 'receita', label: 'Receita', tipo: 'num', right: true, get: l => l.receita || 0 },
    { k: 'potencial', label: 'Potencial', tipo: 'num', right: true, get: l => l.potencial || 0 },
  ];
  const { linhas: linhasL, ordem: ordemL, clicar: clicarL, seta: setaL } = useOrdenavel(d?.lojas, COLS_L, { col: 'potencial', dir: 'desc' });
  return (
    <div>
      <div style={{ ...s.card, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13 }}>📊 Visão geral de espaços e vendas</b>
        <select value={loja} onChange={e => setLoja(e.target.value)} style={{ ...s.inp, marginLeft: 'auto' }}><option value="">Todas as lojas</option>{lojas.map(l => <option key={l} value={l}>{l}</option>)}</select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 12 }}>
        {cards.map(([lab, val, cor]) => (
          <div key={lab} style={{ ...s.card, marginBottom: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: cor }}>{val}</div>
            <div style={{ fontSize: 11.5, color: '#888' }}>{lab}</div>
          </div>
        ))}
      </div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Performance por loja <span style={{ fontWeight: 400, color: '#999' }}>· ordenado por potencial</span></div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{COLS_L.map(c => <ThOrd key={c.k} c={c} ordem={ordemL} clicar={clicarL} seta={setaL} base={s.th} />)}</tr></thead>
            <tbody>{linhasL.map(l => (
              <tr key={l.loja} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={s.td}><b>{l.loja}</b></td>
                <td style={s.tdR}>{l.total}</td>
                <td style={{ ...s.tdR, color: '#1E874B' }}>{l.vendidos}</td>
                <td style={{ ...s.tdR, color: '#B7791F' }}>{l.disponiveis}</td>
                <td style={s.tdR}>{l.ocupacao}%</td>
                <td style={s.tdR}>{brl(l.receita)}</td>
                <td style={{ ...s.tdR, color: '#888' }}>{brl(l.potencial)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const PLACEHOLDERS = ['@Codigo', '@Fornecedor', '@FornecedorCnpj', '@Tema', '@VigenciaInicio', '@VigenciaFim', '@FormaPagamento', '@Valor', '@Lojas', '@Espacos', '@DataHoje'];
function ModeloContrato({ API, onClose }) {
  const [txt, setTxt] = useState(''); const [padrao, setPadrao] = useState(''); const [msg, setMsg] = useState(''); const ref = useRef();
  useEffect(() => { API.get('/trademkt/contrato-template').then(r => { setTxt(r.data.template || ''); setPadrao(r.data.padrao || ''); }).catch(() => {}); }, [API]);
  const inserir = ph => { const el = ref.current; if (!el) { setTxt(t => t + ph); return; } const s0 = el.selectionStart, e0 = el.selectionEnd; setTxt(t => t.slice(0, s0) + ph + t.slice(e0)); };
  const salvar = () => API.post('/trademkt/contrato-template', { template: txt }).then(() => { setMsg('✅ Modelo salvo.'); setTimeout(() => setMsg(''), 2500); }).catch(() => setMsg('Erro.'));
  return (
    <div onClick={onClose} style={s.overlay}><div onClick={e => e.stopPropagation()} style={{ ...s.modal, maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><b>📄 Modelo de contrato</b><button onClick={onClose} style={s.btnMini}>✕ Fechar</button></div>
      <div style={{ fontSize: 11.5, color: '#888', marginBottom: 6 }}>Use os campos abaixo — eles são preenchidos automaticamente ao gerar o contrato de cada negociação. Clique p/ inserir:</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>{PLACEHOLDERS.map(p => <button key={p} onClick={() => inserir(p)} style={{ ...s.mv, fontFamily: 'monospace' }}>{p}</button>)}</div>
      <textarea ref={ref} value={txt} onChange={e => setTxt(e.target.value)} style={{ ...s.inp, width: '100%', minHeight: 260, fontFamily: 'monospace', fontSize: 12.5, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <button onClick={salvar} style={s.btn}>💾 Salvar modelo</button>
        <button onClick={() => setTxt(padrao)} style={s.btnMini}>restaurar padrão</button>
        {msg && <span style={{ fontSize: 12, color: '#1E874B' }}>{msg}</span>}
      </div>
    </div></div>
  );
}
function ContratoGerado({ API, vendaId, onClose }) {
  const [txt, setTxt] = useState(null);
  useEffect(() => { API.get(`/trademkt/vendas/${vendaId}/contrato`).then(r => setTxt(r.data.texto || '')).catch(() => setTxt('Erro ao gerar.')); }, [API, vendaId]);
  const copiar = () => { navigator.clipboard?.writeText(txt || ''); };
  const imprimir = () => { const w = window.open('', '_blank'); if (w) { w.document.write('<pre style="font:13px/1.5 system-ui;white-space:pre-wrap;padding:24px">' + (txt || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) + '</pre>'); w.document.close(); w.print(); } };
  return (
    <div onClick={onClose} style={s.overlay}><div onClick={e => e.stopPropagation()} style={{ ...s.modal, maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><b>📄 Contrato gerado</b><button onClick={onClose} style={s.btnMini}>✕ Fechar</button></div>
      {txt == null ? <div style={s.vazio}>gerando…</div> : <pre style={{ background: '#FAFBFC', border: '1px solid #eee', borderRadius: 8, padding: 12, fontSize: 12.5, whiteSpace: 'pre-wrap', maxHeight: '60vh', overflow: 'auto' }}>{txt}</pre>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button onClick={copiar} style={s.btnMini}>📋 Copiar</button><button onClick={imprimir} style={s.btn}>🖨 Imprimir / PDF</button></div>
    </div></div>
  );
}

function GruposEconomicos({ API, gestao }) {
  const [grupos, setGrupos] = useState([]); const [nome, setNome] = useState('');
  const carregar = useCallback(() => API.get('/trademkt/grupos-economicos').then(r => setGrupos(r.data.grupos || [])).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const criar = () => { if (!nome.trim()) return; API.post('/trademkt/grupos-economicos', { nome: nome.trim() }).then(() => { setNome(''); carregar(); }); };
  const del = id => { if (window.confirm('Excluir este grupo econômico?')) API.delete(`/trademkt/grupos-economicos/${id}`).then(carregar); };
  const addForn = (gid, f) => API.post(`/trademkt/grupos-economicos/${gid}/fornecedor`, { fornecedor_id: f.id, fornecedor_nome: f.nome }).then(carregar);
  const delForn = fid => API.delete(`/trademkt/grupos-economicos/fornecedor/${fid}`).then(carregar);
  return (
    <div>
      {gestao && <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do grupo (ex.: Grupo Hypera, Grupo EMS)…" style={{ ...s.inp, flex: 1, minWidth: 220 }} onKeyDown={e => e.key === 'Enter' && criar()} />
        <button onClick={criar} style={s.btn}>+ Criar grupo</button>
      </div>}
      <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Agrupe fornecedores da mesma matriz/econômico. Útil p/ visão consolidada e apuração de acordos por grupo.</div>
      {grupos.length === 0 && <div style={s.card}>Nenhum grupo econômico ainda.</div>}
      {grupos.map(g => (
        <div key={g.id} style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>🏢 {g.nome} <span style={{ fontWeight: 400, color: '#999', fontSize: 12 }}>· {(g.fornecedores || []).length} fornecedor(es)</span></div>
            {gestao && <button onClick={() => del(g.id)} style={s.mv}>excluir</button>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: gestao ? 8 : 0 }}>
            {(g.fornecedores || []).map(f => <span key={f.id} style={{ fontSize: 12, background: '#F1F5FA', border: '1px solid #DDE7F0', borderRadius: 20, padding: '3px 10px', display: 'inline-flex', gap: 6, alignItems: 'center' }}>{f.fornecedor_nome}{gestao && <button onClick={() => delForn(f.id)} style={{ border: 'none', background: 'none', color: '#C0392B', cursor: 'pointer', fontSize: 13, padding: 0 }}>✕</button>}</span>)}
            {(g.fornecedores || []).length === 0 && <span style={{ fontSize: 11.5, color: '#aaa' }}>Sem fornecedores.</span>}
          </div>
          {gestao && <BuscaERP API={API} rota="/trademkt/erp/fornecedores" campo="fornecedores" placeholder="+ adicionar fornecedor do ERP…" onPick={f => addForn(g.id, f)} />}
        </div>
      ))}
    </div>
  );
}

function FotoPonto({ API, item, gestao, onChange }) {
  const [src, setSrc] = useState(null); const [aberta, setAberta] = useState(false); const inputRef = useRef();
  useEffect(() => { let vivo = true; if (item.tem_foto) API.get(`/trademkt/espaco-loja/${item.id}/foto`).then(r => { if (vivo) setSrc(r.data.foto); }).catch(() => {}); else setSrc(null); return () => { vivo = false; }; }, [API, item.id, item.tem_foto]);
  const enviar = e => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 3 * 1024 * 1024) { alert('Foto muito grande (máx 3MB).'); return; }
    const rd = new FileReader(); rd.onload = () => API.put(`/trademkt/espaco-loja/${item.id}/foto`, { foto: rd.result }).then(() => onChange && onChange()).catch(err => alert(err.response?.data?.erro || 'Erro ao enviar foto.')); rd.readAsDataURL(f);
  };
  const remover = () => API.put(`/trademkt/espaco-loja/${item.id}/foto`, { foto: null }).then(() => { setSrc(null); onChange && onChange(); });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {src ? <img src={src} alt="ponto" onClick={() => setAberta(true)} style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', border: '1px solid #ddd' }} />
        : <span style={{ fontSize: 16, opacity: .35 }}>🏷️</span>}
      {gestao && <button onClick={() => inputRef.current?.click()} style={{ ...s.mv, padding: '2px 6px' }} title={src ? 'trocar foto' : 'adicionar foto do ponto'}>📷</button>}
      {gestao && src && <button onClick={remover} style={{ ...s.mv, padding: '2px 6px' }} title="remover foto">✕</button>}
      <input ref={inputRef} type="file" accept="image/*" onChange={enviar} style={{ display: 'none' }} />
      {aberta && src && <div onClick={() => setAberta(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'grid', placeItems: 'center', zIndex: 1000, cursor: 'zoom-out' }}>
        <img src={src} alt="ponto" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10 }} />
      </div>}
    </div>
  );
}

function TabelaEspacoLoja({ loja, arr, API, gestao, carregar, del }) {
  const COLS = [
    { k: 'area', label: 'Área', tipo: 'txt', get: i => i.area || '' },
    { k: 'espaco', label: 'Espaço', tipo: 'txt', get: i => i.espaco || '' },
    { k: 'vagas', label: 'Vagas', tipo: 'num', right: true, get: i => i.quantidade || 0 },
    { k: 'preco', label: 'Preço unit.', tipo: 'num', right: true, get: i => i.preco_unit || 0 },
    { k: 'potencial', label: 'Potencial', tipo: 'num', right: true, get: i => (i.quantidade || 0) * (i.preco_unit || 0) },
  ];
  const { linhas, ordem, clicar, seta } = useOrdenavel(arr, COLS, { col: 'potencial', dir: 'desc' });
  return (
    <div style={s.card}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>🏬 {loja} <span style={{ fontWeight: 400, color: '#999', fontSize: 12 }}>· {arr.length} espaço(s)</span></div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>
            <th style={{ ...s.th, textAlign: 'left' }}>Foto</th>
            {COLS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />)}
            <th style={s.th}></th>
          </tr></thead>
          <tbody>{linhas.map(i => { const cheio = (i.disponiveis != null ? i.disponiveis : i.quantidade) <= 0; return (
            <tr key={i.id} style={{ borderTop: '1px solid #f2f2f2' }}>
              <td style={s.td}><FotoPonto API={API} item={i} gestao={gestao} onChange={carregar} /></td>
              <td style={s.td}>{i.area}</td><td style={s.td}>{i.espaco}</td>
              <td style={s.tdR}><span style={{ color: cheio ? '#C0392B' : (i.ocupados ? '#B7791F' : '#1E874B'), fontWeight: 600 }}>{i.ocupados || 0}/{i.quantidade}</span></td><td style={s.tdR}>{brl(i.preco_unit)}</td>
              <td style={{ ...s.tdR, color: '#1E874B' }}>{brl((i.quantidade || 0) * (i.preco_unit || 0))}</td>
              <td style={s.tdR}>{gestao && <button onClick={() => del(i.id)} style={s.mv}>✕</button>}</td>
            </tr>); })}</tbody>
        </table>
      </div>
    </div>
  );
}

function EspacoLoja({ API, gestao }) {
  const [itens, setItens] = useState([]); const [lojaSel, setLojaSel] = useState('');
  const carregar = useCallback(() => API.get('/trademkt/espaco-loja').then(r => setItens(r.data.itens || [])).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const lojas = [...new Set(itens.map(i => i.loja_nome))];
  const filtrados = lojaSel ? itens.filter(i => i.loja_nome === lojaSel) : itens;
  const grupos = {}; filtrados.forEach(i => { (grupos[i.loja_nome] = grupos[i.loja_nome] || []).push(i); });
  const total = filtrados.reduce((a, i) => a + (i.quantidade || 0), 0);
  const potencial = filtrados.reduce((a, i) => a + (i.quantidade || 0) * (i.preco_unit || 0), 0);
  const del = id => API.delete(`/trademkt/espaco-loja/${id}`).then(carregar);
  return (
    <div>
      <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={lojaSel} onChange={e => setLojaSel(e.target.value)} style={s.inp}><option value="">Todas as lojas</option>{lojas.map(l => <option key={l} value={l}>{l}</option>)}</select>
        <span style={{ fontSize: 12.5, color: '#666' }}>{filtrados.length} espaço(s) · <b>{total}</b> vagas · potencial <b style={{ color: '#1E874B' }}>{brl(potencial)}</b></span>
      </div>
      {Object.entries(grupos).map(([loja, arr]) => (
        <TabelaEspacoLoja key={loja} loja={loja} arr={arr} API={API} gestao={gestao} carregar={carregar} del={del} />
      ))}
      {itens.length === 0 && <div style={s.card}>Nenhum espaço por loja cadastrado.</div>}
    </div>
  );
}

function Espacos({ API, gestao }) {
  const [d, setD] = useState({ areas: [], espacos: [], temas: [] });
  const [area, setArea] = useState(''); const [esp, setEsp] = useState({ descricao: '', area_id: '', valor_ref: '', observacoes: '' });
  const carregar = useCallback(() => API.get('/trademkt/cadastros').then(r => setD(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const addArea = () => { if (!area) return; API.post('/trademkt/cadastros/areas', { descricao: area }).then(() => { setArea(''); carregar(); }); };
  const addEsp = () => { if (!esp.descricao) return; API.post('/trademkt/espacos', esp).then(() => { setEsp({ descricao: '', area_id: '', valor_ref: '', observacoes: '' }); carregar(); }); };
  const seed = () => API.post('/trademkt/seed-padrao').then(carregar);
  const vazio = d.areas.length === 0 && d.espacos.length === 0;
  return (
    <>
    {gestao && vazio && <div style={{ ...s.card, background: '#F6FAFF', borderColor: '#CFE0F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 12.5, color: '#2E5C9E' }}>Comece rápido: crie um <b>catálogo padrão de farmácia</b> (ponta de gôndola, ilha, frente de caixa, perfumaria…) com valores de referência.</span>
      <button onClick={seed} style={s.btn}>✨ Criar catálogo padrão</button>
    </div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🗂️ Áreas</div>
        {gestao && <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}><input value={area} onChange={e => setArea(e.target.value)} placeholder="ex.: Entrada, Ponta de gôndola" style={{ ...s.inp, flex: 1 }} /><button onClick={addArea} style={s.btnMini}>+ Add</button></div>}
        {d.areas.map(a => <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderTop: '1px solid #f2f2f2' }}><span>{a.descricao}</span>{gestao && <button onClick={() => API.delete(`/trademkt/cadastros/areas/${a.id}`).then(carregar)} style={s.mv}>✕</button>}</div>)}
        {d.areas.length === 0 && <div style={s.vazio}>Nenhuma área.</div>}
      </div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🏬 Espaços</div>
        {gestao && <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
          <input value={esp.descricao} onChange={e => setEsp(x => ({ ...x, descricao: e.target.value }))} placeholder="ex.: Ilha promocional 1" style={s.inp} />
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={esp.area_id} onChange={e => setEsp(x => ({ ...x, area_id: e.target.value }))} style={{ ...s.inp, flex: 1 }}><option value="">Área…</option>{d.areas.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}</select>
            <input type="number" value={esp.valor_ref} onChange={e => setEsp(x => ({ ...x, valor_ref: e.target.value }))} placeholder="R$ ref" style={{ ...s.inp, width: 90 }} />
            <button onClick={addEsp} style={s.btnMini}>+ Add</button>
          </div>
        </div>}
        {d.espacos.map(e => <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderTop: '1px solid #f2f2f2' }}><span>{(d.areas.find(a => a.id === e.area_id) || {}).descricao ? (d.areas.find(a => a.id === e.area_id).descricao + ' · ') : ''}{e.descricao} <b style={{ color: '#1E874B' }}>{brl(e.valor_ref)}</b></span>{gestao && <button onClick={() => API.delete(`/trademkt/espacos/${e.id}`).then(carregar)} style={s.mv}>✕</button>}</div>)}
        {d.espacos.length === 0 && <div style={s.vazio}>Nenhum espaço.</div>}
      </div>
    </div>
    </>
  );
}

function Temas({ API, gestao }) {
  const [temas, setTemas] = useState([]); const [t, setT] = useState('');
  const carregar = useCallback(() => API.get('/trademkt/cadastros').then(r => setTemas(r.data.temas || [])).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const add = () => { if (!t) return; API.post('/trademkt/cadastros/temas', { descricao: t }).then(() => { setT(''); carregar(); }); };
  return (
    <div style={{ ...s.card, maxWidth: 480 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🎨 Temas de campanha</div>
      {gestao && <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}><input value={t} onChange={e => setT(e.target.value)} placeholder="ex.: Volta às aulas, Natal…" style={{ ...s.inp, flex: 1 }} /><button onClick={add} style={s.btnMini}>+ Add</button></div>}
      {temas.map(x => <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderTop: '1px solid #f2f2f2' }}><span>{x.descricao}</span>{gestao && <button onClick={() => API.delete(`/trademkt/cadastros/temas/${x.id}`).then(carregar)} style={s.mv}>✕</button>}</div>)}
      {temas.length === 0 && <div style={s.vazio}>Nenhum tema.</div>}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1500, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 10 },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  btn: { fontSize: 13, padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 12, padding: '6px 10px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
  colHead: { color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 12px', borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 2 },
  colN: { background: 'rgba(255,255,255,.3)', borderRadius: 10, padding: '1px 8px', fontSize: 12 },
  colBody: { background: '#F7F8FA', border: '1px solid #eee', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: 8, minHeight: 180 },
  cardA: { background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 10, marginBottom: 8 },
  tag: { fontSize: 10, background: '#F0F3F7', color: '#5A7186', borderRadius: 8, padding: '2px 6px', fontWeight: 600, marginLeft: 6 },
  mv: { fontSize: 12, padding: '4px 8px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer' },
  lbl: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#888' },
  vazio: { fontSize: 12.5, color: '#aaa', textAlign: 'center', padding: 14 },
  chip: { fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: 18, width: '100%', maxHeight: '90vh', overflowY: 'auto' },
  th: { textAlign: 'right', fontSize: 11, color: '#888', padding: '4px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  td: { textAlign: 'left', padding: '4px 8px' }, tdR: { textAlign: 'right', padding: '4px 8px' },
};
