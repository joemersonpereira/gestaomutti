import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner, { bannerBtn } from '../components/Banner';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';

const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
const COLS = [
  { id: 'rascunho', nome: 'Rascunho', cor: '#7A8794' },
  { id: 'negociacao', nome: 'Negociação', cor: '#D6409F' },
  { id: 'confirmado', nome: 'Confirmado', cor: '#2E5C9E' },
  { id: 'briefing', nome: 'Briefing / material', cor: '#B45309' },
  { id: 'aguardando', nome: 'Aguardando liberar', cor: '#8A6D3B' },
  { id: 'vigente', nome: 'Em veiculação', cor: '#1E874B' },
  { id: 'encerrado', nome: 'Encerrado', cor: '#555' },
];
// status legados/entrada do portal → coluna do Kanban (pedido do portal cai em Negociação)
const COL_DE = { pedido: 'negociacao', vendido: 'confirmado', concluido: 'aguardando' };
const colDe = st => COL_DE[st] || (COLS.some(c => c.id === st) ? st : 'rascunho');
// "próximo a vencer": em veiculação e faltando ≤ 15 dias p/ o fim
function proxVencer(v) {
  if (colDe(v.status) !== 'vigente' || !v.vigencia_fim) return false;
  const dias = Math.ceil((new Date(v.vigencia_fim) - new Date()) / 864e5);
  return dias >= 0 && dias <= 15;
}

// Busca de NF do fornecedor no Alpha (para a bonificação)
function BuscaNota({ API, fornecedorId, onPick }) {
  const [q, setQ] = useState(''); const [itens, setItens] = useState([]);
  const buscar = v => { setQ(v); if (fornecedorId && v.length >= 1) API.get('/trademkt/erp/notas', { params: { fornecedor_id: fornecedorId, q: v } }).then(r => setItens(r.data.notas || [])).catch(() => setItens([])); else setItens([]); };
  return <div style={{ position: 'relative' }}>
    <input value={q} onChange={e => buscar(e.target.value)} placeholder={fornecedorId ? 'nº da NF…' : 'vincule o fornecedor'} disabled={!fornecedorId} style={{ ...s.inp, width: '100%' }} />
    {itens.length > 0 && <div style={{ position: 'absolute', zIndex: 9, background: '#fff', border: '1px solid #eee', borderRadius: 8, maxHeight: 160, overflowY: 'auto', width: '100%', boxShadow: '0 6px 18px rgba(0,0,0,.12)' }}>{itens.map(n => <div key={n.id} onMouseDown={() => { onPick(n); setQ(''); setItens([]); }} style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}>NF {n.numero} · {dBR(n.data)}</div>)}</div>}
  </div>;
}
// Busca de escopo do Alpha (produto/fornecedor/laboratório/classificação/caderno/pessoa/grupos)
function EscopoBusca({ API, tipo, onPick }) {
  const [q, setQ] = useState(''); const [itens, setItens] = useState([]);
  const buscar = v => { setQ(v); API.get('/trademkt/erp/escopo', { params: { tipo, q: v } }).then(r => setItens(r.data.itens || [])).catch(() => setItens([])); };
  return <div style={{ position: 'relative' }}>
    <input value={q} onChange={e => buscar(e.target.value)} placeholder={`buscar ${tipo}…`} style={{ ...s.inp, width: '100%' }} />
    {itens.length > 0 && <div style={{ position: 'absolute', zIndex: 9, background: '#fff', border: '1px solid #eee', borderRadius: 8, maxHeight: 170, overflowY: 'auto', width: '100%', boxShadow: '0 6px 18px rgba(0,0,0,.12)' }}>{itens.map(x => <div key={x.id + (x.ean || '')} onMouseDown={() => { onPick(x); setQ(''); setItens([]); }} style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}>{x.nome}{x.ean ? ` · ${x.ean}` : ''}</div>)}</div>}
  </div>;
}
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
      <Banner emoji="📣" titulo="Trade Marketing" cor="roxo" sub="Aluguel de espaços da loja (pontos extras, ilhas, gôndolas) para fornecedores — contrato, financeiro e sell-out no ERP.">
        {gestao && <button onClick={() => setModelo(true)} style={bannerBtn}>📄 Modelo de contrato</button>}
      </Banner>
      <div style={{ display: 'flex', gap: 6, margin: '10px 0 14px', flexWrap: 'wrap' }}>
        {[['dashboard', '📊 Dashboard'], ['portal', '🌐 Portal do fornecedor'], ['vendas', '🗂️ Negociações'], ['cobranca', '💰 Cobrança'], ['porloja', '🏬 Espaços por loja'], ['espacos', '🗂️ Áreas & Espaços'], ['temas', '🎨 Temas'], ['grupos', '🏢 Grupos econômicos']].map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {modelo && <ModeloContrato API={API} onClose={() => setModelo(false)} />}
      {aba === 'portal' && <Portal API={API} gestao={gestao} />}
      {aba === 'cobranca' && <Cobranca API={API} gestao={gestao} />}
      {aba === 'dashboard' && <Dashboard API={API} />}
      {aba === 'vendas' && <Vendas API={API} gestao={gestao} />}
      {aba === 'porloja' && <EspacoLoja API={API} gestao={gestao} />}
      {aba === 'espacos' && <Espacos API={API} gestao={gestao} />}
      {aba === 'temas' && <Temas API={API} gestao={gestao} />}
      {aba === 'grupos' && <GruposEconomicos API={API} gestao={gestao} />}
    </div>
  );
}

// ══════ PORTAL DO FORNECEDOR (gestão) ══════
function Portal({ API, gestao }) {
  const [sub, setSub] = useState('planos');
  return (
    <div>
      <div style={{ ...s.card, background: '#F7FAFF', border: '1px solid #E3ECF7', fontSize: 12.5, color: '#334', marginBottom: 12 }}>
        📥 Os <b>pedidos do fornecedor</b> agora entram direto no Kanban da aba <b>🗂️ Negociações</b> (coluna <b>Negociação</b>, com a etiqueta 🌐 portal). Abra o card para ver tudo: espaços, material/arte, briefing, contrato, financeiro e comprovação.
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['planos', '📦 Planos comerciais'], ['calendario', '🗓️ Calendário geral'], ['acesso', '🔑 Liberados & Interessados'], ['posicoes', '🎛️ Posições & preços']].map(([k, l]) =>
          <button key={k} onClick={() => setSub(k)} style={{ ...s.chip, ...(sub === k ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {sub === 'planos' && <PortalPlanos API={API} gestao={gestao} />}
      {sub === 'calendario' && <PortalCalendario API={API} gestao={gestao} />}
      {sub === 'acesso' && <PortalAcesso API={API} gestao={gestao} />}
      {sub === 'posicoes' && <PortalPosicoes API={API} gestao={gestao} />}
    </div>
  );
}
const ARTE_BADGE = { pendente: { t: '⏳ aguardando material', c: '#8A6D3B', b: '#FBF0DA' }, enviada: { t: '📎 material p/ aprovar', c: '#2E5C9E', b: '#E7F0FB' }, aprovada: { t: '✅ arte aprovada', c: '#1E874B', b: '#E6F4EC' }, reprovada: { t: '✖ reprovada', c: '#B91C1C', b: '#FBEAEA' } };
const CRIA_ROT = { anexo: 'arte/spot anexado', texto: 'texto p/ leitura ao vivo', producao: 'produção pela Mutti' };
// preview da arte de um item (baixa com auth e mostra miniatura)
function ArtePreview({ API, iid }) {
  const [u, setU] = useState(null);
  useEffect(() => { let live = true; API.get(`/trademkt/portal/item/${iid}/arte`, { responseType: 'blob' }).then(r => { if (live) setU(URL.createObjectURL(r.data)); }).catch(() => { }); return () => { live = false; }; }, [API, iid]);
  if (!u) return null;
  return <a href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="arte" style={{ maxHeight: 64, maxWidth: 120, borderRadius: 8, border: '1px solid #eee', verticalAlign: 'middle' }} /></a>;
}

// anexo que respeita auth (gestão baixa como blob; portal usa URL pública direta)
function Anexo({ API, direct, url, mime, nome }) {
  const [src, setSrc] = useState(direct ? url : null);
  useEffect(() => { if (direct) return; let live = true; API.get(url, { responseType: 'blob' }).then(r => { if (live) setSrc(URL.createObjectURL(r.data)); }).catch(() => { }); return () => { live = false; }; }, [API, direct, url]);
  const img = /^image\//.test(mime || '');
  if (!src) return <span style={{ fontSize: 11, color: '#aaa' }}>…</span>;
  return img ? <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt="anexo" style={{ maxHeight: 120, borderRadius: 8, marginTop: 4, border: '1px solid #eee' }} /></a>
    : <a href={src} target="_blank" rel="noopener noreferrer" download={nome || undefined} style={{ fontSize: 12, color: '#2563eb' }}>📎 {nome || 'anexo'}</a>;
}
// briefing da negociação: chat (observações) + anexos + comprovação (gestão anexa fotos)
function BriefingThread({ API, listUrl, postUrl, anexoUrl, podeComprovar }) {
  const [msgs, setMsgs] = useState(null); const [txt, setTxt] = useState(''); const [file, setFile] = useState(null); const [tipo, setTipo] = useState('msg');
  const carregar = useCallback(() => API.get(listUrl).then(r => setMsgs(r.data.mensagens)).catch(() => setMsgs([])), [API, listUrl]);
  useEffect(() => { carregar(); }, [carregar]);
  const enviar = () => {
    if (!txt.trim() && !file) return;
    const base = { texto: txt || undefined, tipo };
    const send = b => API.post(postUrl, b).then(() => { setTxt(''); setFile(null); setTipo('msg'); carregar(); }).catch(e => alert(e.response?.data?.erro || 'Erro.'));
    if (file) { const r = new FileReader(); r.onload = () => send({ ...base, anexo: r.result, mime: file.type, nome: file.name }); r.readAsDataURL(file); } else send(base);
  };
  if (!msgs) return <div style={{ fontSize: 12, color: '#999' }}>Carregando briefing…</div>;
  return <div>
    <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflowY: 'auto', padding: '4px 0' }}>
      {msgs.map(m => { const gest = m.autor === 'gestao';
        return <div key={m.id} style={{ justifySelf: gest ? 'start' : 'end', background: m.tipo === 'comprovacao' ? '#E6F4EC' : (gest ? '#F3F7F4' : '#EFF6FF'), borderRadius: 10, padding: '7px 10px', maxWidth: '88%' }}>
          <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 700 }}>{gest ? '🏢 ' : '🏷️ '}{m.autor_nome || (gest ? 'Gestão' : 'Fornecedor')}{m.tipo === 'comprovacao' ? ' · ✅ comprovação' : ''} <span style={{ fontWeight: 400 }}>· {dBR(m.criado_em)}</span></div>
          {m.texto && <div style={{ fontSize: 13, marginTop: 2, whiteSpace: 'pre-wrap' }}>{m.texto}</div>}
          {m.tem_anexo && <Anexo API={API} direct={false} url={anexoUrl(m.id)} mime={m.anexo_mime} nome={m.anexo_nome} />}
        </div>; })}
      {!msgs.length && <div style={{ fontSize: 12, color: '#aaa' }}>Sem mensagens ainda — escreva o briefing ou anexe um arquivo.</div>}
    </div>
    <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <input value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), enviar())} placeholder={tipo === 'comprovacao' ? 'comprovação da ação (anexe a foto)…' : 'escreva uma observação…'} style={{ ...s.inp, flex: 1, minWidth: 160 }} />
      <label style={{ ...s.mv, cursor: 'pointer' }}>📎{file ? ' ✓' : ''}<input type="file" accept="image/*,application/pdf,video/*" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} /></label>
      {podeComprovar && <label style={{ fontSize: 11, display: 'flex', gap: 3, alignItems: 'center' }} title="marcar como comprovação da ação (foto p/ o fornecedor)"><input type="checkbox" checked={tipo === 'comprovacao'} onChange={e => setTipo(e.target.checked ? 'comprovacao' : 'msg')} />✅ comprovação</label>}
      <button onClick={enviar} style={s.btn}>Enviar</button>
    </div>
  </div>;
}
// material/arte de cada posição de uma negociação (usado no editor e no portal de pedidos)
function MaterialEspacos({ API, venda, onChange }) {
  const itemAcao = (iid, rota, body) => API.post(`/trademkt/portal/item/${iid}/${rota}`, body || {}).then(onChange).catch(e => alert(e.response?.data?.erro || 'Erro.'));
  const reprovar = iid => { const m = window.prompt('Motivo da reprovação (o fornecedor vê e reenvia):', ''); if (m !== null) itemAcao(iid, 'arte-reprovar', { motivo: m }); };
  const subirArte = (iid, file) => { if (!file) return; const r = new FileReader(); r.onload = () => itemAcao(iid, 'arte', { arte: r.result, mime: file.type }); r.readAsDataURL(file); };
  const esp = venda.espacos || [];
  if (!esp.length) return <div style={s.vazio}>Esta negociação ainda não tem posições.</div>;
  return <div style={{ display: 'grid', gap: 8 }}>
    <div style={{ fontSize: 12, color: '#666' }}>Material de cada posição — aprove, reprove (com motivo), insira a peça ou isente a produção (−R$150).</div>
    {esp.map(e => { const bd = ARTE_BADGE[e.arte_status] || ARTE_BADGE.pendente; const temMaterial = e.tem_arte || e.criativo_tipo === 'texto';
      return <div key={e.id} style={{ borderTop: '1px solid #f3f3f3', paddingTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 600 }}>{e.quantidade > 1 ? e.quantidade + '× ' : ''}{e.espaco_desc} <span style={{ color: '#999', fontWeight: 400, fontSize: 12 }}>· {e.loja_nome}</span></div>
            <div style={{ fontSize: 11.5, color: '#666', marginTop: 2 }}>
              {e.modo_venda === 'insercao' ? `Inserção${e.insercoes ? ' · ' + e.insercoes + '×' : ''}${e.agenda ? ' · ' + e.agenda : ''}` : 'Período fechado'}
              {e.criativo_tipo ? ` · ${CRIA_ROT[e.criativo_tipo] || e.criativo_tipo}` : ''}
              {e.producao ? (e.producao_isenta ? ' · 🎁 arte isenta' : ' · +R$150 arte') : ''}
            </div>
            {e.criativo_texto && <div style={{ fontSize: 12, color: '#334', marginTop: 3, background: '#F8FAFC', borderRadius: 6, padding: '4px 8px' }}>🗣️ "{e.criativo_texto}"</div>}
            {e.briefing && <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>📝 {e.briefing}</div>}
            {e.arte_obs && <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 3 }}>↩ {e.arte_obs}</div>}
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <b>{brl(e.valor)}</b>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: bd.c, background: bd.b, padding: '2px 7px', borderRadius: 999 }}>{bd.t}</span>
            {e.tem_arte && <ArtePreview API={API} iid={e.id} />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {temMaterial && e.arte_status !== 'aprovada' && <button onClick={() => itemAcao(e.id, 'arte-aprovar')} style={{ ...s.mv, color: '#1E874B', fontWeight: 700 }}>✓ Aprovar arte</button>}
          {temMaterial && e.arte_status !== 'reprovada' && <button onClick={() => reprovar(e.id)} style={{ ...s.mv, color: '#B91C1C' }}>✖ Reprovar</button>}
          {!e.tem_arte && <label style={{ ...s.mv, cursor: 'pointer', color: '#2E5C9E' }}>⬆ {e.producao ? 'Subir arte produzida' : 'Inserir material'}<input type="file" accept="image/*,video/*,audio/*,application/pdf" style={{ display: 'none' }} onChange={ev => subirArte(e.id, ev.target.files[0])} /></label>}
          {e.producao && <button onClick={() => itemAcao(e.id, 'isentar', { isenta: !e.producao_isenta })} style={{ ...s.mv, color: '#B45309' }}>{e.producao_isenta ? 'voltar a cobrar arte' : '🎁 isentar arte (−R$150)'}</button>}
        </div>
      </div>; })}
  </div>;
}

function PortalPedidos({ API, gestao }) {
  const [d, setD] = useState(null);
  const [status, setStatus] = useState('pedido');
  const carregar = useCallback(() => API.get('/trademkt/portal/pedidos', { params: { status } }).then(r => setD(r.data)).catch(() => setD({ pedidos: [] })), [API, status]);
  useEffect(() => { carregar(); }, [carregar]);
  const acao = (id, rota) => API.post(`/trademkt/portal/pedido/${id}/${rota}`).then(() => carregar());
  const itemAcao = (iid, rota, body) => API.post(`/trademkt/portal/item/${iid}/${rota}`, body || {}).then(carregar).catch(e => alert(e.response?.data?.erro || 'Erro.'));
  const reprovar = iid => { const m = window.prompt('Motivo da reprovação (o fornecedor vê e reenvia):', ''); if (m !== null) itemAcao(iid, 'arte-reprovar', { motivo: m }); };
  const subirArte = (iid, file) => { if (!file) return; const r = new FileReader(); r.onload = () => itemAcao(iid, 'arte', { arte: r.result, mime: file.type }); r.readAsDataURL(file); };
  const ABAS = [['pedido', '🕓 Pendentes'], ['vigente', '📡 Em veiculação'], ['vendido', '✅ Confirmados']];

  return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {ABAS.map(([v, l]) => <button key={v} onClick={() => setStatus(v)} style={{ ...s.chip, ...(status === v ? s.chipOn : {}) }}>{l}</button>)}
    </div>
    {!d ? <div style={s.card}>Carregando…</div> : !d.pedidos.length ? <div style={s.card}>Nenhum pedido aqui. 🎉</div> : d.pedidos.map(p =>
      <div key={p.id} style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div><b>{p.codigo}</b> · {p.fornecedor_nome} <span style={{ color: '#888', fontSize: 12 }}>({p.fornecedor_cnpj})</span>
            <div style={{ fontSize: 12, color: '#666' }}>{p.contato_nome} · {p.contato_email} · {p.contato_fone || ''}{p.origem === 'recompra' ? ' · 🔄 recompra' : ''}</div></div>
          <div style={{ textAlign: 'right' }}><b style={{ fontSize: 16 }}>{brl(p.valor)}</b><div style={{ fontSize: 12, color: '#666' }}>{p.vigencia_ini ? `${dBR(p.vigencia_ini)} a ${dBR(p.vigencia_fim)}` : 'sem período'}</div></div>
        </div>
        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
          {p.espacos.map((e) => { const bd = ARTE_BADGE[e.arte_status] || ARTE_BADGE.pendente; const temMaterial = e.tem_arte || e.criativo_tipo === 'texto';
            return <div key={e.id} style={{ borderTop: '1px solid #f3f3f3', paddingTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 600 }}>{e.quantidade > 1 ? e.quantidade + '× ' : ''}{e.espaco_desc} <span style={{ color: '#999', fontWeight: 400, fontSize: 12 }}>· {e.loja_nome}</span></div>
                  <div style={{ fontSize: 11.5, color: '#666', marginTop: 2 }}>
                    {e.modo_venda === 'insercao' ? `Inserção${e.insercoes ? ' · ' + e.insercoes + '×' : ''}${e.agenda ? ' · ' + e.agenda : ''}` : 'Período fechado'}
                    {e.criativo_tipo ? ` · ${CRIA_ROT[e.criativo_tipo] || e.criativo_tipo}` : ''}
                    {e.producao ? (e.producao_isenta ? ' · 🎁 arte isenta' : ' · +R$150 arte') : ''}
                  </div>
                  {e.criativo_texto && <div style={{ fontSize: 12, color: '#334', marginTop: 3, background: '#F8FAFC', borderRadius: 6, padding: '4px 8px' }}>🗣️ "{e.criativo_texto}"</div>}
                  {e.briefing && <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>📝 {e.briefing}</div>}
                  {e.arte_obs && <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 3 }}>↩ {e.arte_obs}</div>}
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <b>{brl(e.valor)}</b>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: bd.c, background: bd.b, padding: '2px 7px', borderRadius: 999 }}>{bd.t}</span>
                  {e.tem_arte && <ArtePreview API={API} iid={e.id} />}
                </div>
              </div>
              {gestao && <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {temMaterial && e.arte_status !== 'aprovada' && <button onClick={() => itemAcao(e.id, 'arte-aprovar')} style={{ ...s.mv, color: '#1E874B', fontWeight: 700 }}>✓ Aprovar arte</button>}
                {temMaterial && e.arte_status !== 'reprovada' && <button onClick={() => reprovar(e.id)} style={{ ...s.mv, color: '#B91C1C' }}>✖ Reprovar</button>}
                {!e.tem_arte && <label style={{ ...s.mv, cursor: 'pointer', color: '#2E5C9E' }}>⬆ {e.producao ? 'Subir arte produzida' : 'Inserir material'}<input type="file" accept="image/*,video/*,audio/*,application/pdf" style={{ display: 'none' }} onChange={ev => subirArte(e.id, ev.target.files[0])} /></label>}
                {e.producao && <button onClick={() => itemAcao(e.id, 'isentar', { isenta: !e.producao_isenta })} style={{ ...s.mv, color: '#B45309' }}>{e.producao_isenta ? 'voltar a cobrar arte' : '🎁 isentar arte (−R$150)'}</button>}
              </div>}
            </div>; })}
        </div>
        {p.escopo && p.escopo.length > 0 && <div style={{ fontSize: 12, color: '#555', marginTop: 6 }}>Produtos: {p.escopo.map(x => x.nome).join(', ')}</div>}
        {p.observacao && <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>Obs: {p.observacao}</div>}
        {gestao && status === 'pedido' && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={() => acao(p.id, 'aprovar')} style={{ ...s.btn, background: '#1E874B' }}>✓ Aprovar pedido</button>
          <button onClick={() => { if (window.confirm('Recusar este pedido?')) acao(p.id, 'recusar'); }} style={{ ...s.btn, background: '#fff', color: '#B91C1C', border: '1px solid #B91C1C' }}>Recusar</button>
        </div>}
      </div>)}
  </div>;
}
function PortalAcesso({ API, gestao }) {
  const [lib, setLib] = useState(null); const [intr, setIntr] = useState(null); const [doc, setDoc] = useState(''); const [nome, setNome] = useState('');
  const carregar = useCallback(() => { API.get('/trademkt/portal/liberados').then(r => setLib(r.data.liberados)).catch(() => setLib([])); API.get('/trademkt/portal/interesse').then(r => setIntr(r.data.interessados)).catch(() => setIntr([])); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const add = () => { if (!doc) return; API.post('/trademkt/portal/liberados', { documento: doc, nome }).then(() => { setDoc(''); setNome(''); carregar(); }).catch(e => alert(e.response?.data?.erro || 'Erro')); };
  const del = dd => API.delete('/trademkt/portal/liberados/' + dd).then(carregar);
  const liberar = id => API.post('/trademkt/portal/interesse/' + id + '/liberar').then(carregar);
  if (!lib || !intr) return <div style={s.card}>Carregando…</div>;
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
    <div style={s.card}><h4 style={{ marginTop: 0 }}>🔑 Fornecedores liberados ({lib.length})</h4>
      {gestao && <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}><input value={doc} onChange={e => setDoc(e.target.value)} placeholder="CNPJ" style={{ ...s.inp, flex: 1 }} /><input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome (opcional)" style={{ ...s.inp, flex: 1 }} /><button onClick={add} style={s.btn}>+ Liberar</button></div>}
      {lib.map(l => <div key={l.documento} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f3f3', fontSize: 13 }}><span>{l.nome || '—'} <span style={{ color: '#999' }}>{l.documento}</span></span>{gestao && <button onClick={() => del(l.documento)} style={{ border: 'none', background: 'none', color: '#B91C1C', cursor: 'pointer' }}>remover</button>}</div>)}
      {!lib.length && <div style={{ color: '#888', fontSize: 13 }}>Ninguém liberado ainda.</div>}
    </div>
    <div style={s.card}><h4 style={{ marginTop: 0 }}>🙋 Interessados ({intr.filter(i => !i.liberado).length})</h4>
      {intr.map(i => <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f3f3', fontSize: 13, opacity: i.liberado ? .5 : 1 }}><span>{i.nome || '—'} <span style={{ color: '#999' }}>{i.cnpj}</span> <span style={{ fontSize: 11, color: '#B45309' }}>{i.motivo}</span></span>{gestao && !i.liberado && <button onClick={() => liberar(i.id)} style={{ border: 'none', background: 'none', color: '#1E874B', cursor: 'pointer', fontWeight: 700 }}>liberar</button>}</div>)}
      {!intr.length && <div style={{ color: '#888', fontSize: 13 }}>Nenhum interessado.</div>}
    </div>
  </div>;
}
// agrupa cada posição numa "família" (físicos entram todos juntos; rádio divide externa/interna)
function familiaDe(p) {
  if (['off', 'allline', 'digital'].includes(p.segmento)) return 'fisico';
  if (p.segmento === 'radio') return /interna/i.test(p.area || '') ? 'radio_int' : 'radio_ext';
  if (p.segmento === 'crm') return /pdv/i.test((p.area || '') + ' ' + (p.espaco || '')) ? 'crm_pdv' : 'crm_filipeta';
  return p.segmento; // encarte, ecommerce, social
}
const FAMN = {
  fisico: '🏬 Espaços físicos (por loja)',
  encarte: '📰 Tabloide (rede · por edição)',
  ecommerce: '🛒 E-commerce (rede)',
  social: '📱 Digital — Redes sociais (rede)',
  crm_filipeta: '🧾 Filipeta (rede)',
  crm_pdv: '🖥️ PDV+ (rede)',
  crm: '🧾 CRM (rede)',
  radio_ext: '📻 Rádio externa (por cidade)',
  radio_int: '📻 Rádio interna (rede)',
  endomarketing: '🎉 Endomarketing (rede)'
};
const FAM_ORDEM = ['fisico', 'encarte', 'ecommerce', 'social', 'crm_filipeta', 'crm_pdv', 'crm', 'radio_ext', 'radio_int', 'endomarketing'];
const UNID = { mes: '/mês', dia: '/dia', semana: '/sem', edicao: '/edição', periodo: 'período' };
const UNID_OPTS = [['mes', 'por mês'], ['dia', 'por dia'], ['semana', 'por semana'], ['edicao', 'por edição'], ['periodo', 'por período']];
const MIDIA_OPTS = [['off', 'OFF (loja física)'], ['on', 'ON (digital no ponto)'], ['ambos', 'Ambos (all-line)']];
const MIDIA_BADGE = { off: { t: 'OFF', c: '#8A6D3B', b: '#FBF0DA' }, on: { t: 'ON', c: '#2E5C9E', b: '#E7F0FB' }, ambos: { t: 'AMBOS', c: '#1E874B', b: '#E6F4EC' } };

function PortalPosicoes({ API, gestao }) {
  const [d, setD] = useState(null);
  const [lojaF, setLojaF] = useState('');       // filtro de loja p/ os espaços físicos
  const [novo, setNovo] = useState(false);
  const carregar = useCallback(() => API.get('/trademkt/portal/posicoes').then(r => setD(r.data.posicoes)).catch(() => setD([])), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!d) return <div style={s.card}>Carregando…</div>;
  const save = (id, campo, val) => API.patch('/trademkt/portal/espaco/' + id, { [campo]: val }).then(carregar);
  const saveFoto = (id, file) => { if (!file) return; const r = new FileReader(); r.onload = () => API.put('/trademkt/espaco-loja/' + id + '/foto', { foto: r.result }).then(carregar).catch(e => alert(e.response?.data?.erro || 'Erro.')); r.readAsDataURL(file); };
  const replicar = p => { if (window.confirm(`Aplicar preço, vagas e mídia de "${p.espaco}" a TODAS as lojas que têm essa posição?`)) API.post(`/trademkt/portal/espaco/${p.id}/replicar`).then(r => { alert(`${r.data.atualizadas} loja(s) atualizada(s).`); carregar(); }); };

  const grupos = {}; d.forEach(p => { const f = familiaDe(p); (grupos[f] = grupos[f] || []).push(p); });
  const fams = Object.keys(grupos).sort((a, b) => FAM_ORDEM.indexOf(a) - FAM_ORDEM.indexOf(b));
  const lojasFis = [...new Set((grupos.fisico || []).map(p => p.local))].sort();

  return <div style={{ display: 'grid', gap: 14 }}>
    <div style={{ ...s.card, background: '#f0f7ff', border: '1px solid #cfe3fb', fontSize: 12.5, color: '#334', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div><b>Disponibilidade do que é comercializável.</b> Tabloide, e-commerce, redes e rádio interna são <b>padrão da rede</b>. Os <b>espaços físicos</b> são <b>por loja</b> e a <b>rádio externa</b> é <b>por cidade</b>. A coluna <b>Un.</b> diz a que a vaga se refere (mês, dia, edição…). <b>Livres</b> = ainda não reservadas.</div>
      {gestao && <button onClick={() => setNovo(true)} style={s.btn}>➕ Nova posição</button>}
    </div>
    {novo && <NovaPosicao API={API} lojas={lojasFis} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); carregar(); }} />}

    {fams.map(fam => {
      const ehFis = fam === 'fisico';
      const ehSocial = fam === 'social';
      let itens = grupos[fam];
      if (ehFis && lojaF) itens = itens.filter(p => p.local === lojaF);
      return <div key={fam} style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h4 style={{ margin: 0 }}>{FAMN[fam] || fam} <span style={{ fontWeight: 400, color: '#aaa', fontSize: 12 }}>· {grupos[fam].length}</span></h4>
          {ehFis && <label style={{ fontSize: 12, color: '#666' }}>Loja: <select value={lojaF} onChange={e => setLojaF(e.target.value)} style={{ ...s.inp, width: 190, display: 'inline-block' }}><option value="">Todas as lojas</option>{lojasFis.map(l => <option key={l} value={l}>{l}</option>)}</select></label>}
        </div>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse', marginTop: 8, minWidth: 720 }}><thead><tr style={{ color: '#888', textAlign: 'left' }}>
          <th>Posição</th><th>{ehFis ? 'Loja' : fam === 'radio_ext' ? 'Cidade' : 'Local'}</th>{ehFis && <th>Mídia</th>}<th>Venda</th><th>Vagas</th>{ehSocial && <th title="máximo por dia">Lim/dia</th>}{ehSocial && <th title="máximo por mês">Lim/mês</th>}<th>Un.</th><th>Preço</th><th>Livres</th><th>Disp.</th><th>Dest.</th>{ehFis && gestao && <th></th>}
        </tr></thead><tbody>
          {itens.map(p => <tr key={p.id} style={{ borderTop: '1px solid #f3f3f3' }}>
            <td style={{ padding: '5px 0' }}>{p.espaco} {gestao && <label style={{ cursor: 'pointer', fontSize: 12, color: p.tem_foto ? '#1E874B' : '#2E5C9E' }} title={p.tem_foto ? 'tem imagem — trocar (aparece no portal)' : 'adicionar imagem (aparece no portal)'}>{p.tem_foto ? '🖼️✓' : '🖼️'}<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => saveFoto(p.id, e.target.files[0])} /></label>}</td>
            <td style={{ color: p.escopo !== 'loja' ? '#1E874B' : '#555', fontWeight: p.escopo !== 'loja' ? 700 : 400 }}>{p.local}</td>
            {ehFis && <td>{gestao
              ? <select value={p.midia || 'ambos'} onChange={e => save(p.id, 'midia', e.target.value)} style={{ ...s.inp, width: 96, padding: '3px 4px' }}>{MIDIA_OPTS.map(([v, l]) => <option key={v} value={v}>{l.split(' ')[0]}</option>)}</select>
              : (() => { const m = MIDIA_BADGE[p.midia] || MIDIA_BADGE.ambos; return <span style={{ fontSize: 10.5, fontWeight: 700, color: m.c, background: m.b, padding: '2px 6px', borderRadius: 6 }}>{m.t}</span>; })()}</td>}
            <td>{gestao
              ? <select value={p.modo_venda} onChange={e => save(p.id, 'modo_venda', e.target.value)} style={{ ...s.inp, width: 90, padding: '3px 4px' }}><option value="periodo">Período</option><option value="insercao">Inserção</option></select>
              : <span style={{ fontSize: 11, color: '#777' }}>{p.modo_venda === 'insercao' ? 'Inserção' : 'Período'}</span>}</td>
            <td><input type="number" defaultValue={p.quantidade} disabled={!gestao} onBlur={e => gestao && Number(e.target.value) !== p.quantidade && save(p.id, 'quantidade', Number(e.target.value))} style={{ ...s.inp, width: 52 }} /></td>
            {ehSocial && <td><input type="number" defaultValue={p.limite_dia ?? ''} placeholder="—" disabled={!gestao} onBlur={e => gestao && String(e.target.value) !== String(p.limite_dia ?? '') && save(p.id, 'limite_dia', e.target.value)} style={{ ...s.inp, width: 48 }} /></td>}
            {ehSocial && <td><input type="number" defaultValue={p.limite_mes ?? ''} placeholder="—" disabled={!gestao} onBlur={e => gestao && String(e.target.value) !== String(p.limite_mes ?? '') && save(p.id, 'limite_mes', e.target.value)} style={{ ...s.inp, width: 48 }} /></td>}
            <td>{gestao
              ? <select value={p.unidade} onChange={e => save(p.id, 'unidade', e.target.value)} style={{ ...s.inp, width: 82, padding: '3px 4px' }}>{UNID_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              : <span style={{ fontSize: 11, color: '#777' }}>{UNID[p.unidade] || ''}</span>}</td>
            <td><input type="number" step="0.01" defaultValue={p.preco_unit} disabled={!gestao} onBlur={e => gestao && Number(e.target.value) !== p.preco_unit && save(p.id, 'preco_unit', Number(e.target.value))} style={{ ...s.inp, width: 82 }} /></td>
            <td style={{ fontWeight: 700, color: p.livres > 0 ? '#1E874B' : '#B91C1C' }}>{p.livres}</td>
            <td><input type="checkbox" checked={!!p.disponivel} disabled={!gestao} onChange={e => save(p.id, 'disponivel', e.target.checked)} /></td>
            <td><input type="checkbox" checked={!!p.destaque} disabled={!gestao} onChange={e => save(p.id, 'destaque', e.target.checked)} /></td>
            {ehFis && gestao && <td><button onClick={() => replicar(p)} title="Aplicar estes valores a todas as lojas com esta posição" style={s.mv}>⇊ todas</button></td>}
          </tr>)}
        </tbody></table>
        </div>
      </div>;
    })}
  </div>;
}

// cadastro de uma nova posição comercializável
function NovaPosicao({ API, lojas, onClose, onSaved }) {
  const MODS = [['off', '🏬 Espaço físico'], ['encarte', '📰 Tabloide'], ['ecommerce', '🛒 E-commerce'], ['social', '📱 Digital / Redes'], ['crm_filipeta', '🧾 Filipeta'], ['crm_pdv', '🖥️ PDV+'], ['radio_ext', '📻 Rádio externa (cidade)'], ['radio_int', '📻 Rádio interna'], ['endomarketing', '🎉 Endomarketing']];
  const REDES = ['Instagram', 'TikTok', 'Facebook', 'YouTube', 'WhatsApp', 'Kwai', 'Outra'];
  const BANDEIRAS = ['ESCRITÓRIO', 'Farmácia Mutti', 'Ultra Popular', 'Farma Rocha'];
  const [f, setF] = useState({ mod: 'off', espaco: '', tamanho: '', descricao: '', loja_nome: '', rede: 'Instagram', bandeiras: ['ESCRITÓRIO'], bandMode: 'cada', midia: 'ambos', modo_venda: 'periodo', unidade: 'periodo', quantidade: 1, preco_unit: '' });
  const [foto, setFoto] = useState(null);
  const ehRede = ['social', 'ecommerce', 'encarte', 'crm_filipeta', 'crm_pdv'].includes(f.mod);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const ehFis = f.mod === 'off';
  const ehRadioExt = f.mod === 'radio_ext';
  const precisaLocal = ehFis || ehRadioExt;
  const salvar = () => {
    if (!f.espaco.trim()) return alert('Dê um nome à posição.');
    const segMap = { radio_ext: 'radio', radio_int: 'radio', crm_filipeta: 'crm', crm_pdv: 'crm' };
    const segmento = segMap[f.mod] || f.mod;
    const areaMap = { radio_ext: 'Rádio Externa', radio_int: 'Rádio Interna', crm_filipeta: 'Filipeta', crm_pdv: 'PDV+', social: f.rede };
    const area = areaMap[f.mod] || null;
    // alvos de loja_nome: rede toda (ESCRITÓRIO), uma por bandeira, ou um grupo compartilhado
    let alvos;
    if (ehRede) {
      const bs = (f.bandeiras && f.bandeiras.length) ? f.bandeiras : ['ESCRITÓRIO'];
      if (bs.includes('ESCRITÓRIO')) alvos = ['ESCRITÓRIO'];
      else if (f.bandMode === 'cada') alvos = bs;        // uma posição por bandeira
      else alvos = [bs.join(' + ')];                     // grupo: cota compartilhada entre as bandeiras
    } else if (precisaLocal) alvos = [(f.loja_nome || '').trim()];
    else alvos = [''];
    const base = {
      segmento, area, espaco: f.espaco.trim(), tamanho: f.tamanho, descricao: f.descricao,
      midia: ehFis ? f.midia : undefined, modo_venda: f.modo_venda, unidade: f.unidade,
      quantidade: f.quantidade, preco_unit: f.preco_unit,
      foto: foto ? foto.b64 : undefined, foto_mime: foto ? foto.mime : undefined
    };
    Promise.all(alvos.map(ln => API.post('/trademkt/portal/espaco', { ...base, loja_nome: ln })))
      .then(onSaved).catch(e => alert(e.response?.data?.erro || 'Erro ao criar.'));
  };
  const pegarFoto = file => { if (!file) return; const r = new FileReader(); r.onload = () => setFoto({ b64: r.result, mime: file.type }); r.readAsDataURL(file); };
  return <div onClick={onClose} style={s.overlay}><div onClick={e => e.stopPropagation()} style={{ ...s.modal, maxWidth: 560 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <b style={{ fontSize: 15 }}>➕ Nova posição comercializável</b><button onClick={onClose} style={s.btnMini}>✕</button>
    </div>
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={s.lbl}>Módulo<select value={f.mod} onChange={e => { const m = e.target.value; const fis = m === 'off'; set('mod', m); set('modo_venda', ['social', 'radio_ext', 'radio_int'].includes(m) ? 'insercao' : 'periodo'); set('unidade', m === 'encarte' ? 'edicao' : fis ? 'periodo' : 'mes'); }} style={s.inp}>{MODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label style={s.lbl}>Nome da posição<input value={f.espaco} onChange={e => set('espaco', e.target.value)} placeholder={ehRadioExt ? 'ex.: Conde FM — Spot Gravado (30s)' : f.mod === 'social' ? 'ex.: Stories, Reels, Feed…' : 'ex.: Ponta de Gôndola'} style={s.inp} /></label>
      {f.mod === 'social' && <label style={s.lbl}>Rede social<select value={f.rede} onChange={e => set('rede', e.target.value)} style={s.inp}>{REDES.map(r => <option key={r} value={r}>{r}</option>)}</select></label>}
      <label style={s.lbl}>Tamanho / especificação <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span><input value={f.tamanho} onChange={e => set('tamanho', e.target.value)} placeholder={f.mod === 'ecommerce' ? 'ex.: banner 1080×720 px' : ehRadioExt || f.mod === 'radio_int' ? 'ex.: spot 30s' : f.mod === 'encarte' ? 'ex.: 1/4 de página' : 'ex.: 1,0 × 0,5 m'} style={s.inp} /></label>
      <label style={s.lbl}>O que é / descrição <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span><input value={f.descricao} onChange={e => set('descricao', e.target.value)} placeholder="aparece pro fornecedor no portal" style={s.inp} /></label>
      <div style={s.lbl}><span>Foto da posição <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional — aparece no card do portal)</span></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          {foto ? <><img src={foto.b64} alt="prévia" style={{ height: 44, borderRadius: 6, border: '1px solid #eee' }} /><button type="button" onClick={() => setFoto(null)} style={{ ...s.mv, color: '#B91C1C' }}>remover</button></>
            : <label style={{ ...s.mv, cursor: 'pointer', color: '#2E5C9E' }}>🖼️ + foto<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => pegarFoto(e.target.files[0])} /></label>}
        </div>
      </div>
      {precisaLocal && <label style={s.lbl}>{ehRadioExt ? 'Cidade' : 'Loja'}<input value={f.loja_nome} onChange={e => set('loja_nome', e.target.value)} list="lojas-fis" placeholder={ehRadioExt ? 'ex.: Conde' : 'ex.: Mutti - Rio Real'} style={s.inp} /><datalist id="lojas-fis">{lojas.map(l => <option key={l} value={l} />)}</datalist></label>}
      {ehRede && <div style={s.lbl}><span>Bandeiras <span style={{ fontWeight: 400, color: '#94a3b8' }}>(quantidade por grupo ou por bandeira)</span></span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
          {BANDEIRAS.map(x => { const on = f.bandeiras.includes(x);
            const toggle = () => { let b; if (x === 'ESCRITÓRIO') b = ['ESCRITÓRIO']; else { b = f.bandeiras.filter(y => y !== 'ESCRITÓRIO'); b = on ? b.filter(y => y !== x) : [...b, x]; if (!b.length) b = ['ESCRITÓRIO']; } set('bandeiras', b); };
            return <label key={x} style={{ fontSize: 12.5, display: 'flex', gap: 4, alignItems: 'center', background: on ? '#E6F4EC' : '#f8fafc', padding: '4px 8px', borderRadius: 8, cursor: 'pointer' }}><input type="checkbox" checked={on} onChange={toggle} />{x === 'ESCRITÓRIO' ? 'Rede toda' : x}</label>; })}
        </div>
        {!f.bandeiras.includes('ESCRITÓRIO') && f.bandeiras.length > 1 && <div style={{ marginTop: 6, fontSize: 12, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="radio" name="bm" checked={f.bandMode === 'cada'} onChange={() => set('bandMode', 'cada')} /> {f.quantidade || 1} para CADA bandeira (cria {f.bandeiras.length})</label>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="radio" name="bm" checked={f.bandMode === 'grupo'} onChange={() => set('bandMode', 'grupo')} /> {f.quantidade || 1} compartilhado entre as {f.bandeiras.length}</label>
        </div>}
      </div>}
      {!precisaLocal && !ehRede && <div style={{ fontSize: 11.5, color: '#1E874B', fontWeight: 700 }}>Padrão da rede · ESCRITÓRIO</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {ehFis && <label style={s.lbl}>Mídia<select value={f.midia} onChange={e => set('midia', e.target.value)} style={s.inp}>{MIDIA_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
        <label style={s.lbl}>Modo de venda<select value={f.modo_venda} onChange={e => set('modo_venda', e.target.value)} style={s.inp}><option value="periodo">Período fechado</option><option value="insercao">Inserção (qtd)</option></select></label>
        <label style={s.lbl}>Unidade da vaga<select value={f.unidade} onChange={e => set('unidade', e.target.value)} style={s.inp}>{UNID_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={s.lbl}>Vagas<input type="number" value={f.quantidade} onChange={e => set('quantidade', e.target.value)} style={{ ...s.inp, width: 90 }} /></label>
        <label style={s.lbl}>Preço R$<input type="number" step="0.01" value={f.preco_unit} onChange={e => set('preco_unit', e.target.value)} placeholder="99,90" style={{ ...s.inp, width: 120 }} /></label>
      </div>
      <button onClick={salvar} style={s.btn}>💾 Criar posição</button>
    </div>
  </div></div>;
}

// ── PLANOS COMERCIAIS (gestão) ──────────────────────────────────────────────
const PLANO_CAPA = id => `/api/publico/trade/plano/${id}/capa`;
function PortalPlanos({ API, gestao }) {
  const [d, setD] = useState(null); const [edit, setEdit] = useState(null);
  const carregar = useCallback(() => API.get('/trademkt/portal/planos').then(r => setD(r.data.planos)).catch(() => setD([])), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!d) return <div style={s.card}>Carregando…</div>;
  const novo = () => { const nome = window.prompt('Nome do novo plano comercial:', ''); if (nome) API.post('/trademkt/portal/plano', { nome }).then(r => { carregar(); setEdit(r.data.id); }); };
  const del = id => { if (window.confirm('Excluir este plano?')) API.delete('/trademkt/portal/plano/' + id).then(carregar); };
  const STBADGE = { rascunho: { t: 'rascunho', c: '#64748b', b: '#f1f5f9' }, publicado: { t: 'publicado', c: '#1E874B', b: '#E6F4EC' }, vigente: { t: 'publicado', c: '#1E874B', b: '#E6F4EC' }, encerrado: { t: 'encerrado', c: '#94a3b8', b: '#f1f5f9' } };
  return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ ...s.card, background: '#f0f7ff', border: '1px solid #cfe3fb', fontSize: 12.5, color: '#334', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div>Planos que o fornecedor vê no portal. Amarre as <b>posições reais</b> e as <b>lojas de veiculação</b> — comprar o plano <b>reserva</b> essas posições. Só aparece no portal quando o status é <b>publicado</b>.</div>
      {gestao && <button onClick={novo} style={s.btn}>+ Novo plano</button>}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 12 }}>
      {d.map(p => { const st = STBADGE[p.status] || STBADGE.rascunho;
        return <div key={p.id} style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ height: 96, background: p.tem_capa ? `center/cover no-repeat url(${PLANO_CAPA(p.id)})` : 'linear-gradient(135deg,#6d28d9,#2563eb)', position: 'relative' }}>
            {p.destaque ? <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 10.5, fontWeight: 700, background: '#fff', color: '#B45309', padding: '2px 7px', borderRadius: 999 }}>⭐ destaque</span> : null}
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{p.periodo || p.ano || ''}</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nome}</div>
            <div style={{ fontSize: 11.5, color: '#666', margin: '4px 0' }}>{p.posicoes} posição(ões) · {p.vagas} vaga(s){p.investimento ? ' · ' + brl(p.investimento) : ''}</div>
            <span style={{ fontSize: 10, fontWeight: 700, color: st.c, background: st.b, padding: '2px 7px', borderRadius: 999 }}>{st.t}</span>
            {gestao && <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={() => setEdit(p.id)} style={{ ...s.mv, flex: 1 }}>✏️ Editar</button>
              <button onClick={() => del(p.id)} style={{ ...s.mv, color: '#B91C1C' }}>excluir</button>
            </div>}
          </div>
        </div>; })}
      {!d.length && <div style={{ ...s.card, gridColumn: '1/-1' }}>Nenhum plano ainda. Clique em <b>+ Novo plano</b>.</div>}
    </div>
    {edit && <PlanoEditor API={API} id={edit} onClose={() => setEdit(null)} onSaved={carregar} />}
  </div>;
}

function PlanoEditor({ API, id, onClose, onSaved }) {
  const [p, setP] = useState(null); const [espacos, setEspacos] = useState([]); const [fotos, setFotos] = useState([]); const [cotas, setCotas] = useState([]);
  const [lojas, setLojas] = useState([]); const [posicoes, setPosicoes] = useState([]);
  const [novoFmt, setNovoFmt] = useState(''); const [buscaPos, setBuscaPos] = useState(''); const [addCota, setAddCota] = useState('');
  const carregar = useCallback(() => API.get('/trademkt/portal/plano/' + id).then(r => { setP(r.data.plano); setEspacos(r.data.espacos); setFotos(r.data.fotos || []); setCotas(r.data.cotas || []); }), [API, id]);
  useEffect(() => {
    carregar();
    API.get('/compras/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => { });
    API.get('/trademkt/portal/posicoes').then(r => setPosicoes(r.data.posicoes || [])).catch(() => { });
  }, [API, id, carregar]);
  if (!p) return <div onClick={onClose} style={s.overlay}><div style={s.modal}>Carregando…</div></div>;
  const set = (k, v) => setP(x => ({ ...x, [k]: v }));
  const salvar = () => API.put('/trademkt/portal/plano/' + id, {
    nome: p.nome, tema: p.tema, ano: p.ano, periodo: p.periodo, chamada: p.chamada, contexto: p.contexto,
    mercado: p.mercado, pracas: p.pracas, frequencia: p.frequencia, formato: p.formato,
    cota_tipo: p.cota_tipo, cota_qtd: p.cota_qtd, cota_prazo: p.cota_prazo, investimento: p.investimento, investimento_obs: p.investimento_obs,
    observacoes: p.observacoes, destaque: p.destaque, status: p.status, ordem: p.ordem,
    veic_ini: p.veic_ini, veic_fim: p.veic_fim, por_que: p.por_que, o_que_mostrar: p.o_que_mostrar, publico: p.publico,
    produtos_foco: p.produtos_foco, sellout_potencial: p.sellout_potencial, oportunidades: p.oportunidades,
    conteudo_redes: p.conteudo_redes, midias_on: p.midias_on, midias_off: p.midias_off, midias_online: p.midias_online,
    formatos: p.formatos || [], lojas: p.lojas || [], faq: p.faq || []
  }).then(() => { onSaved(); onClose(); });
  const subirCapa = file => { if (!file) return; const r = new FileReader(); r.onload = () => API.post('/trademkt/portal/plano/' + id + '/capa', { foto: r.result, mime: file.type }).then(carregar); r.readAsDataURL(file); };
  const subirFoto = (file, secao) => { if (!file) return; const r = new FileReader(); r.onload = () => API.post('/trademkt/portal/plano/' + id + '/foto', { foto: r.result, mime: file.type, secao }).then(carregar); r.readAsDataURL(file); };
  const rmFoto = fid => API.delete('/trademkt/portal/plano/' + id + '/foto/' + fid).then(carregar);
  const fotoSec = sec => fotos.find(f => f.secao === sec);
  const faqSet = (i, k, v) => { const f = [...(p.faq || [])]; f[i] = { ...f[i], [k]: v }; set('faq', f); };
  const faqAdd = () => set('faq', [...(p.faq || []), { q: '', a: '' }]);
  const faqRm = i => set('faq', (p.faq || []).filter((_, k) => k !== i));
  const TA = (campo, rot, ph) => { const fs = fotoSec(campo);
    return <div style={{ display: 'grid', gap: 3 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{rot}</span>
      <textarea value={p[campo] || ''} onChange={e => set(campo, e.target.value)} rows={2} placeholder={ph} style={{ ...s.inp, resize: 'vertical' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {fs ? <><img src={`/api/publico/trade/plano/${id}/foto/${fs.id}?v=${Date.now()}`} alt="banner" style={{ height: 40, borderRadius: 6, border: '1px solid #eee' }} /><button onClick={() => rmFoto(fs.id)} style={{ ...s.mv, color: '#B91C1C' }}>remover banner</button></>
          : <label style={{ ...s.mv, cursor: 'pointer', color: '#2E5C9E' }}>🖼️ + banner deste bloco<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => subirFoto(e.target.files[0], campo)} /></label>}
      </div>
    </div>; };
  const addFmt = () => { if (!novoFmt.trim()) return; set('formatos', [...(p.formatos || []), novoFmt.trim()]); setNovoFmt(''); };
  const rmFmt = i => set('formatos', (p.formatos || []).filter((_, k) => k !== i));
  const toggleLoja = lid => set('lojas', (p.lojas || []).includes(lid) ? p.lojas.filter(x => x !== lid) : [...(p.lojas || []), lid]);
  const addEspaco = pid => { const q = window.prompt('Quantidade desta posição POR COTA:', '1'); if (q === null) return; API.post('/trademkt/portal/plano/' + id + '/espacos', { espaco_id: pid, quantidade: Math.max(1, Number(q) || 1), cota_id: addCota || null }).then(carregar); };
  const rmEspaco = linkId => API.delete('/trademkt/portal/plano/' + id + '/espacos/' + linkId).then(carregar);
  const qtdEspaco = (linkId, q) => API.put('/trademkt/portal/plano/' + id + '/espacos/' + linkId, { quantidade: Math.max(1, Number(q) || 1) }).then(carregar);
  // cotas (Ouro/Prata/Bronze)
  const addCotaNivel = () => { const nome = window.prompt('Nome da cota (ex.: Ouro, Prata, Bronze):', ''); if (nome) API.post('/trademkt/portal/plano/' + id + '/cotas', { nome, quantidade: 1 }).then(carregar); };
  const updCota = (cid, campo, val) => API.put('/trademkt/portal/plano/' + id + '/cotas/' + cid, { [campo]: val }).then(carregar);
  const rmCota = cid => { if (window.confirm('Excluir esta cota e desamarrar as posições dela?')) API.delete('/trademkt/portal/plano/' + id + '/cotas/' + cid).then(carregar); };
  const cotaNome = cid => { const c = cotas.find(x => x.id === cid); return c ? c.nome : 'Comum a todas'; };
  return <div onClick={onClose} style={s.overlay}><div onClick={e => e.stopPropagation()} style={{ ...s.modal, maxWidth: 740 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <b style={{ fontSize: 15 }}>📦 Plano comercial</b><button onClick={onClose} style={s.btnMini}>✕</button>
    </div>
    <div style={{ display: 'grid', gap: 10, maxHeight: '72vh', overflowY: 'auto', paddingRight: 4 }}>
      {/* capa */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ width: 120, height: 72, borderRadius: 10, background: p.tem_capa ? `center/cover no-repeat url(${PLANO_CAPA(id)}?v=${Date.now()})` : 'linear-gradient(135deg,#6d28d9,#2563eb)', flex: '0 0 auto' }} />
        <label style={{ ...s.mv, cursor: 'pointer' }}>🖼️ {p.tem_capa ? 'trocar capa' : 'subir capa'}<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => subirCapa(e.target.files[0])} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ ...s.lbl, flex: 2, minWidth: 200 }}>Nome *<input value={p.nome || ''} onChange={e => set('nome', e.target.value)} style={s.inp} /></label>
        <label style={s.lbl}>Período<input value={p.periodo || ''} onChange={e => set('periodo', e.target.value)} placeholder="ex.: Verão 2027" style={s.inp} /></label>
        <label style={s.lbl}>Ano<input value={p.ano || ''} onChange={e => set('ano', e.target.value)} style={{ ...s.inp, width: 80 }} /></label>
      </div>
      <label style={s.lbl}>Chamada<input value={p.chamada || ''} onChange={e => set('chamada', e.target.value)} placeholder="frase de impacto" style={s.inp} /></label>
      <label style={s.lbl}>Contexto<textarea value={p.contexto || ''} onChange={e => set('contexto', e.target.value)} rows={2} style={{ ...s.inp, resize: 'vertical' }} /></label>

      {/* período de veiculação — TRAVA as posições amarradas no período */}
      <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🗓️ Período de veiculação da campanha</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={s.lbl}>Início<input type="date" value={(p.veic_ini || '').slice(0, 10)} onChange={e => set('veic_ini', e.target.value)} style={s.inp} /></label>
          <label style={s.lbl}>Fim<input type="date" value={(p.veic_fim || '').slice(0, 10)} onChange={e => set('veic_fim', e.target.value)} style={s.inp} /></label>
        </div>
        <div style={{ fontSize: 11.5, color: '#9A3412', marginTop: 4 }}>Quando publicado, as <b>posições amarradas</b> ficam <b>reservadas</b> neste período (não vendem pra outro fornecedor).</div>
      </div>

      {/* PROPOSTA COMERCIAL — tudo que o fornecedor perguntaria (base: upfront Globo/Fenamilho) */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📣 Proposta comercial <span style={{ fontWeight: 400, color: '#94a3b8' }}>— o fornecedor precisa sair com tudo respondido</span></div>
        <div style={{ display: 'grid', gap: 8 }}>
          {TA('por_que', 'Por que essa ação existe / importância da data pra região', 'ex.: o Arraiá é a maior data do interused... o que ela representa')}
          {TA('o_que_mostrar', 'O que vamos mostrar / como a campanha aparece', 'ex.: tabloide temático, vitrines, rádio interna, stories diários…')}
          {TA('oportunidades', 'Ao participar, a marca ganha', 'ex.: associação à data, conexão com público engajado, presença multiplataforma…')}
          {TA('publico', 'Público / perfil / audiência', 'ex.: famílias da região, 70% das vendas identificadas, ticket R$58,60…')}
          {TA('produtos_foco', 'Produtos / categorias foco', 'ex.: protetor solar, repelente, hidratação…')}
          {TA('sellout_potencial', 'Sell-out possível / expectativa de giro', 'ex.: categoria cresce +X% no período; base histórica do ERP')}
          {TA('conteudo_redes', 'Ideia de conteúdo nas redes sociais', 'ex.: reels de receita, stories com oferta do dia, live com farmacêutico…')}
        </div>
      </div>

      {/* MÍDIAS on/off/online */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📺 Mídias da campanha</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {TA('midias_on', 'Mídia ON (dentro da loja)', 'ex.: ponta de gôndola, TV interna, rádio interna, filipeta…')}
          {TA('midias_off', 'Mídia OFF (fora da loja)', 'ex.: rádio da cidade, fachada, panfletagem…')}
          {TA('midias_online', 'Mídia ONLINE', 'ex.: banner no e-commerce, Instagram, TikTok, grupo VIP…')}
        </div>
      </div>

      {/* GALERIA de fotos */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>🖼️ Galeria de fotos <span style={{ fontWeight: 400, color: '#94a3b8' }}>— fotos da ação/edições anteriores</span></div>
          <label style={{ ...s.mv, cursor: 'pointer' }}>+ foto<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => subirFoto(e.target.files[0])} /></label>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {fotos.filter(f => !f.secao).map(f => <div key={f.id} style={{ position: 'relative' }}><img src={`/api/publico/trade/plano/${id}/foto/${f.id}`} alt="" style={{ height: 70, borderRadius: 8, border: '1px solid #eee' }} /><button onClick={() => rmFoto(f.id)} title="remover" style={{ position: 'absolute', top: -6, right: -6, border: 'none', background: '#B91C1C', color: '#fff', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: 11 }}>×</button></div>)}
          {!fotos.filter(f => !f.secao).length && <div style={{ fontSize: 11.5, color: '#aaa' }}>Nenhuma foto ainda.</div>}
        </div>
      </div>

      {/* FAQ — perguntas e respostas */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>❓ Perguntas & respostas</div>
          <button onClick={faqAdd} style={s.btnMini}>+ pergunta</button>
        </div>
        {(p.faq || []).map((fq, i) => <div key={i} style={{ display: 'grid', gap: 4, marginBottom: 8, borderLeft: '3px solid #E3ECF7', paddingLeft: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}><input value={fq.q || ''} onChange={e => faqSet(i, 'q', e.target.value)} placeholder="pergunta" style={{ ...s.inp, flex: 1 }} /><button onClick={() => faqRm(i)} style={s.mv}>✕</button></div>
          <textarea value={fq.a || ''} onChange={e => faqSet(i, 'a', e.target.value)} rows={2} placeholder="resposta" style={{ ...s.inp, resize: 'vertical' }} />
        </div>)}
        {!(p.faq || []).length && <div style={{ fontSize: 11.5, color: '#aaa' }}>Sem perguntas ainda — adicione as dúvidas comuns do fornecedor.</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={s.lbl}>Mercado<input value={p.mercado || ''} onChange={e => set('mercado', e.target.value)} style={s.inp} /></label>
        <label style={s.lbl}>Praças<input value={p.pracas || ''} onChange={e => set('pracas', e.target.value)} style={s.inp} /></label>
        <label style={s.lbl}>Frequência<input value={p.frequencia || ''} onChange={e => set('frequencia', e.target.value)} style={s.inp} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={s.lbl}>Tipo de cota<input value={p.cota_tipo || ''} onChange={e => set('cota_tipo', e.target.value)} style={s.inp} /></label>
        <label style={s.lbl}>Qtd cotas<input type="number" value={p.cota_qtd || ''} onChange={e => set('cota_qtd', e.target.value)} style={{ ...s.inp, width: 90 }} /></label>
        <label style={s.lbl}>Prazo<input value={p.cota_prazo || ''} onChange={e => set('cota_prazo', e.target.value)} style={s.inp} /></label>
        <label style={s.lbl}>Investimento R$<input type="number" value={p.investimento || ''} onChange={e => set('investimento', e.target.value)} style={{ ...s.inp, width: 120 }} /></label>
      </div>
      {/* formatos inclusos */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Formatos / benefícios extras <span style={{ fontWeight: 400, color: '#94a3b8' }}>(texto livre)</span></div>
        <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>O que de fato está incluso vem das <b>Posições reais amarradas</b> abaixo (aparecem no portal como "O que está incluso"). Use aqui só o que não é uma posição — ex.: "Selo de patrocínio", "Citação no release".</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>{(p.formatos || []).map((f, i) => <span key={i} style={{ ...s.chip }}>{f} <span onClick={() => rmFmt(i)} style={{ cursor: 'pointer', color: '#B91C1C' }}>×</span></span>)}</div>
        <div style={{ display: 'flex', gap: 6 }}><input value={novoFmt} onChange={e => setNovoFmt(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFmt())} placeholder="ex.: 1 banner no e-commerce / mês" style={{ ...s.inp, flex: 1 }} /><button onClick={addFmt} style={s.btnMini}>+ incluir</button></div>
      </div>
      {/* COTAS (Ouro/Prata/Bronze) */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>🏅 Cotas <span style={{ fontWeight: 400, color: '#94a3b8' }}>— níveis (Ouro/Prata/Bronze), cada um com valor, nº de cotas e posições</span></div>
          <button onClick={addCotaNivel} style={s.btnMini}>+ cota</button>
        </div>
        {cotas.map(c => <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '5px 0', borderTop: '1px solid #f5f5f5' }}>
          <input defaultValue={c.nome} onBlur={ev => ev.target.value !== c.nome && updCota(c.id, 'nome', ev.target.value)} style={{ ...s.inp, width: 110 }} />
          <label style={{ fontSize: 11, color: '#64748b' }}>R$ <input type="number" step="0.01" defaultValue={c.preco || ''} onBlur={ev => Number(ev.target.value) !== c.preco && updCota(c.id, 'preco', ev.target.value)} style={{ ...s.inp, width: 90 }} /></label>
          <label style={{ fontSize: 11, color: '#64748b' }}>nº cotas <input type="number" min="1" defaultValue={c.quantidade} onBlur={ev => Number(ev.target.value) !== c.quantidade && updCota(c.id, 'quantidade', ev.target.value)} style={{ ...s.inp, width: 56 }} /></label>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{espacos.filter(e => e.cota_id === c.id).length} posição(ões)</span>
          <button onClick={() => rmCota(c.id)} style={{ ...s.mv, color: '#B91C1C', marginLeft: 'auto' }}>✕</button>
        </div>)}
        {!cotas.length && <div style={{ fontSize: 11.5, color: '#aaa' }}>Sem cotas — use "+ cota" (ex.: Ouro, Prata, Bronze). Sem cotas, o plano usa o investimento único.</div>}
      </div>

      {/* posições reais amarradas (por cota) */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🔗 Posições amarradas <span style={{ fontWeight: 400, color: '#94a3b8' }}>— o que cada cota inclui (comprar reserva as vagas)</span></div>
        {espacos.map(e => { const pos = posicoes.find(x => x.id === e.espaco_id); const c = cotas.find(x => x.id === e.cota_id); const nCot = c ? c.quantidade : (cotas.length ? cotas.reduce((a, x) => a + (x.quantidade || 1), 0) : (Number(p.cota_qtd) || 1)); const totCota = (Number(e.quantidade) || 1) * nCot;
          return <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '4px 0', borderTop: '1px solid #f5f5f5' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="number" min="1" defaultValue={e.quantidade} onBlur={ev => Number(ev.target.value) !== e.quantidade && qtdEspaco(e.id, ev.target.value)} style={{ ...s.inp, width: 44, padding: '3px 4px' }} title="quantidade por cota" /><span>{e.espaco || '(posição removida)'} <span style={{ color: '#999' }}>· {e.loja_nome || '—'}</span> <span style={{ fontSize: 10.5, fontWeight: 700, color: c ? '#B45309' : '#64748b', background: c ? '#FEF3C7' : '#f1f5f9', padding: '1px 7px', borderRadius: 999 }}>{c ? c.nome : 'comum'}</span></span></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 11, color: '#64748b' }} title="total reservado = qtd/cota × nº de cotas">reserva {totCota}{pos ? `/${pos.quantidade}` : ''}</span><button onClick={() => rmEspaco(e.id)} style={s.mv}>✕</button></span>
          </div>; })}
        {!espacos.length && <div style={{ fontSize: 11.5, color: '#aaa' }}>Nenhuma posição amarrada ainda.</div>}
        <div style={{ marginTop: 8, background: '#F7FAFF', border: '1px solid #E3ECF7', borderRadius: 10, padding: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#334' }}>Vincular à cota:</span>
            <select value={addCota} onChange={e => setAddCota(e.target.value)} style={{ ...s.inp, width: 160 }}><option value="">Comum a todas</option>{cotas.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.quantidade})</option>)}</select>
          </div>
          <input value={buscaPos} onChange={e => setBuscaPos(e.target.value)} placeholder="🔎 buscar posição por nome, espaço ou loja…" style={{ ...s.inp, width: '100%', marginBottom: 6 }} />
          {(() => {
            const jaTem = new Set(espacos.filter(e => e.cota_id === (addCota || null)).map(e => e.espaco_id));
            const q = buscaPos.trim().toLowerCase();
            const cSel = cotas.find(c => c.id === addCota); const need = cSel ? (cSel.quantidade || 1) : 1; // capacidade mínima = nº de cotas
            const livreR = x => (x.livre_real != null ? x.livre_real : x.livres) || 0;
            const filtro = x => !jaTem.has(x.id) && livreR(x) >= need && (!q || (`${x.espaco} ${x.local} ${x.segmento} ${x.area || ''}`).toLowerCase().includes(q));
            const fams = FAM_ORDEM.filter(f => posicoes.some(x => familiaDe(x) === f && filtro(x)));
            if (!fams.length) return <div style={{ fontSize: 12, color: '#aaa', padding: 6 }}>Nenhuma posição com {need}+ vaga(s) livre(s){addCota ? ` p/ a cota ${cotaNome(addCota)}` : ''}.</div>;
            return <div style={{ maxHeight: 200, overflowY: 'auto', display: 'grid', gap: 6 }}>
              {fams.map(f => <div key={f}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#2E5C9E', margin: '2px 0' }}>{FAMN[f] || f}</div>
                {posicoes.filter(x => familiaDe(x) === f && filtro(x)).map(x => <button key={x.id} onClick={() => addEspaco(x.id)} style={{ ...s.mv, width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                  <span>➕ <b>{x.espaco}</b> · {x.local}</span>
                  <span style={{ color: '#666', whiteSpace: 'nowrap' }}>{brl(x.preco_unit)}{x.modo_venda === 'insercao' ? '/ins.' : ''} · <b style={{ color: livreR(x) > 0 ? '#1E874B' : '#B91C1C' }}>{livreR(x)}/{x.quantidade}</b> livres</span>
                </button>)}
              </div>)}
            </div>;
          })()}
        </div>
      </div>
      {/* veiculação nas lojas */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Veiculação nas lojas</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{lojas.map(l => <label key={l.id} style={{ fontSize: 12.5, display: 'flex', gap: 4, alignItems: 'center', background: (p.lojas || []).includes(l.id) ? '#E6F4EC' : '#f8fafc', padding: '4px 8px', borderRadius: 8, cursor: 'pointer' }}><input type="checkbox" checked={(p.lojas || []).includes(l.id)} onChange={() => toggleLoja(l.id)} />{l.nome}</label>)}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid #eee', paddingTop: 8 }}>
        <label style={s.lbl}>Status<select value={p.status || 'rascunho'} onChange={e => set('status', e.target.value)} style={s.inp}><option value="rascunho">Rascunho</option><option value="publicado">Publicado (aparece no portal)</option><option value="encerrado">Encerrado</option></select></label>
        <label style={{ ...s.lbl, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 }}><input type="checkbox" checked={!!p.destaque} onChange={e => set('destaque', e.target.checked)} />⭐ Destaque</label>
        <label style={s.lbl}>Ordem<input type="number" value={p.ordem || 0} onChange={e => set('ordem', e.target.value)} style={{ ...s.inp, width: 70 }} /></label>
      </div>
      <button onClick={salvar} style={s.btn}>💾 Salvar plano</button>
    </div>
  </div></div>;
}

// ── CALENDÁRIO DE TRADE (gestão) ────────────────────────────────────────────
const DOW = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const CAL_TIPON = { acao: '🎯 Ações da rede', tematico: '🔁 Dias temáticos', campanha: '📣 Campanhas' };
const CAL_TIPORDEM = ['tematico', 'acao', 'campanha'];
function quandoTxt(e) {
  if (e.recorrencia === 'semanal') return 'Toda ' + (DOW[e.dia_semana] || '—');
  if (e.recorrencia === 'quinzenal') return 'Quinzenal · ' + (DOW[e.dia_semana] || '—');
  if (e.recorrencia === 'mensal') return 'Dia ' + (e.dia_mes || '?') + ' de cada mês';
  return e.data ? dBR(e.data) : (e.data_ini ? `${dBR(e.data_ini)}–${dBR(e.data_fim)}` : '—');
}
// expande recorrências de eventos num mês (espelha o backend, p/ a grade na gestão)
function expandirMesCal(eventos, ano, mes) {
  const nd = new Date(ano, mes, 0).getDate(); const out = []; const pad = n => String(n).padStart(2, '0');
  (eventos || []).forEach(e => {
    const push = dia => { const data = `${ano}-${pad(mes)}-${pad(dia)}`; if (e.data_ini && data < String(e.data_ini).slice(0, 10)) return; if (e.data_fim && data > String(e.data_fim).slice(0, 10)) return; out.push({ ...e, dia }); };
    if (e.recorrencia === 'semanal' || e.recorrencia === 'quinzenal') { for (let dd = 1; dd <= nd; dd++) { if (new Date(ano, mes - 1, dd).getDay() === Number(e.dia_semana)) { if (e.recorrencia === 'quinzenal' && Math.floor((dd - 1) / 7) % 2 !== 0) continue; push(dd); } } }
    else if (e.recorrencia === 'mensal') { if (e.dia_mes >= 1 && e.dia_mes <= nd) push(e.dia_mes); }
    else { const ref = String(e.data || e.data_ini || '').slice(0, 10); if (ref) { const [y, m] = ref.split('-').map(Number); if (y === ano && m === mes) push(Number(ref.slice(8, 10))); } }
  });
  return out;
}
const MESNOMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function PortalCalendario({ API, gestao }) {
  const [d, setD] = useState(null); const [edit, setEdit] = useState(null);
  const [vista, setVista] = useState('grade'); const hoje = new Date();
  const [mref, setMref] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 });
  const carregar = useCallback(() => API.get('/trademkt/portal/calendario').then(r => setD(r.data.eventos)).catch(() => setD([])), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!d) return <div style={s.card}>Carregando…</div>;
  const navMes = dir => setMref(p => { let m = p.mes + dir, a = p.ano; if (m < 1) { m = 12; a--; } if (m > 12) { m = 1; a++; } return { ano: a, mes: m }; });
  const del = id => { if (window.confirm('Excluir este evento?')) API.delete('/trademkt/portal/calendario/' + id).then(carregar); };
  const subirComprov = (id, file) => { if (!file) return; const r = new FileReader(); r.onload = () => API.post(`/trademkt/portal/calendario/${id}/comprovacao`, { foto: r.result, mime: file.type }).then(carregar); r.readAsDataURL(file); };
  const verComprov = id => API.get(`/trademkt/portal/calendario/${id}/comprovacao`, { responseType: 'blob' }).then(r => window.open(URL.createObjectURL(r.data), '_blank')).catch(() => { });
  const grupos = {}; d.forEach(e => { (grupos[e.tipo] = grupos[e.tipo] || []).push(e); });
  const tipos = Object.keys(grupos).sort((a, b) => CAL_TIPORDEM.indexOf(a) - CAL_TIPORDEM.indexOf(b));
  return <div style={{ display: 'grid', gap: 14 }}>
    <div style={{ ...s.card, background: '#f0f7ff', border: '1px solid #cfe3fb', fontSize: 12.5, color: '#334', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div><b>Calendário geral</b> da rede — todas as programações (ações, dias temáticos, campanhas). Marque <b>“aparece no Trade”</b> nas comercializáveis (o fornecedor vê e pode <b>patrocinar o dia</b>); depois anexe a <b>comprovação</b>. As não marcadas ficam só internas.</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setVista(vista === 'grade' ? 'lista' : 'grade')} style={s.chip}>{vista === 'grade' ? '☰ Lista' : '📅 Grade'}</button>
        {gestao && <button onClick={() => setEdit('novo')} style={s.btn}>+ Novo evento</button>}
      </div>
    </div>
    {vista === 'grade' ? <div style={s.card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 10 }}>
        <button onClick={() => navMes(-1)} style={s.mv}>‹</button>
        <b style={{ fontSize: 15, textTransform: 'capitalize', minWidth: 170, textAlign: 'center' }}>{MESNOMES[mref.mes - 1]} {mref.ano}</b>
        <button onClick={() => navMes(1)} style={s.mv}>›</button>
      </div>
      {(() => {
        const nd = new Date(mref.ano, mref.mes, 0).getDate(); const first = new Date(mref.ano, mref.mes - 1, 1).getDay();
        const occ = expandirMesCal(d, mref.ano, mref.mes); const porDia = {}; occ.forEach(x => { (porDia[x.dia] = porDia[x.dia] || []).push(x); });
        const dow = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']; const cells = [];
        for (let i = 0; i < first; i++) cells.push(<div key={'e' + i} />);
        for (let dia = 1; dia <= nd; dia++) { const evs = porDia[dia] || []; const isHoje = (mref.ano === hoje.getFullYear() && mref.mes === hoje.getMonth() + 1 && dia === hoje.getDate());
          cells.push(<div key={dia} style={{ minHeight: 76, border: '1px solid #eef2f7', borderRadius: 8, padding: '3px 4px', overflow: 'hidden', background: isHoje ? '#eff6ff' : '#fff' }}>
            <div style={{ fontSize: 11, fontWeight: isHoje ? 800 : 700, color: isHoje ? '#2563eb' : '#334' }}>{dia}</div>
            {evs.map((e, i) => <div key={i} onClick={() => setEdit(e.id)} title={e.nome + (e.descricao ? ' — ' + e.descricao : '')} style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: e.cor || '#2563eb', borderRadius: 5, padding: '1px 5px', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}>{e.no_trade ? '🛒 ' : ''}{e.nome}</div>)}
          </div>);
        }
        return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>{dow.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 800, color: '#94a3b8' }}>{w}</div>)}{cells}</div>;
      })()}
      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 8 }}>🛒 = aparece no Trade · clique num evento para editar.</div>
    </div> : tipos.map(t => <div key={t} style={s.card}>
      <h4 style={{ marginTop: 0 }}>{CAL_TIPON[t] || t} <span style={{ fontWeight: 400, color: '#aaa', fontSize: 12 }}>· {grupos[t].length}</span></h4>
      <div style={{ display: 'grid', gap: 8 }}>
        {grupos[t].map(e => <div key={e.id} style={{ borderTop: '1px solid #f3f3f3', paddingTop: 8, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div><b>{e.cor ? <span style={{ color: e.cor }}>● </span> : ''}{e.nome}</b> {e.categoria ? <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', padding: '1px 7px', borderRadius: 999 }}>{e.categoria}</span> : ''} {e.no_trade ? <span style={{ fontSize: 10.5, fontWeight: 700, color: '#1E874B', background: '#E6F4EC', padding: '1px 7px', borderRadius: 999 }}>🛒 Trade</span> : <span style={{ fontSize: 10.5, color: '#94a3b8', background: '#f1f5f9', padding: '1px 7px', borderRadius: 999 }}>interno</span>}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>🗓️ {quandoTxt(e)}{e.patrocinavel ? ` · 💰 patrocinável${e.preco ? ' ' + brl(e.preco) : ''}` : ' · não patrocinável'}{e.patrocinador_nome ? ` · 🏷️ ${e.patrocinador_nome}` : ''}</div>
            {e.descricao && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{e.descricao}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {e.tem_comprov ? <button onClick={() => verComprov(e.id)} style={{ ...s.mv, color: '#1E874B' }}>✅ ver comprovação</button> : null}
            {gestao && <label style={{ ...s.mv, cursor: 'pointer', color: '#2E5C9E' }}>📷 {e.tem_comprov ? 'trocar' : 'comprovação'}<input type="file" accept="image/*" style={{ display: 'none' }} onChange={ev => subirComprov(e.id, ev.target.files[0])} /></label>}
            {gestao && <button onClick={() => setEdit(e.id)} style={s.mv}>✏️</button>}
            {gestao && <button onClick={() => del(e.id)} style={{ ...s.mv, color: '#B91C1C' }}>✕</button>}
          </div>
        </div>)}
      </div>
    </div>)}
    {!d.length && <div style={s.card}>Nenhum evento ainda. Clique em <b>+ Novo evento</b> (ex.: "Segunda do Suplemento", semanal).</div>}
    {edit && <CalEditor API={API} id={edit === 'novo' ? null : edit} evento={edit === 'novo' ? null : d.find(x => x.id === edit)} onClose={() => { setEdit(null); carregar(); }} onSaved={carregar} />}
  </div>;
}
function CalEditor({ API, id: idInicial, evento, onClose, onSaved }) {
  const [id, setId] = useState(idInicial);
  const [e, setE] = useState(evento || { nome: '', tipo: 'tematico', categoria: '', recorrencia: 'semanal', dia_semana: 1, dia_mes: 1, data: '', data_ini: '', data_fim: '', descricao: '', cor: '#2E5C9E', no_trade: 1, patrocinavel: 1, preco: '', status: 'ativo' });
  const [espacos, setEspacos] = useState([]); const [posicoes, setPosicoes] = useState([]); const [buscaPos, setBuscaPos] = useState('');
  const set = (k, v) => setE(x => ({ ...x, [k]: v }));
  const carregarLinks = useCallback(aid => API.get(`/trademkt/portal/calendario/${aid}/espacos`).then(r => setEspacos(r.data.espacos)).catch(() => { }), [API]);
  useEffect(() => { API.get('/trademkt/portal/posicoes').then(r => setPosicoes(r.data.posicoes || [])).catch(() => { }); if (id) carregarLinks(id); }, [API, id, carregarLinks]);
  const salvar = () => {
    if (!e.nome.trim()) return alert('Dê um nome ao evento.');
    const body = { ...e, patrocinavel: e.patrocinavel ? 1 : 0, no_trade: e.no_trade ? 1 : 0 };
    if (id) return API.put('/trademkt/portal/calendario/' + id, body).then(onSaved).catch(er => alert(er.response?.data?.erro || 'Erro.'));
    return API.post('/trademkt/portal/calendario', body).then(r => { setId(r.data.id); onSaved(); }).catch(er => alert(er.response?.data?.erro || 'Erro.'));
  };
  const addEspaco = pid => { const q = window.prompt('Quantidade desta posição:', '1'); if (q === null) return; API.post(`/trademkt/portal/calendario/${id}/espacos`, { espaco_id: pid, quantidade: Math.max(1, Number(q) || 1) }).then(() => carregarLinks(id)); };
  const rmEspaco = lid => API.delete(`/trademkt/portal/calendario/${id}/espacos/${lid}`).then(() => carregarLinks(id));
  const qtdEspaco = (lid, q) => API.put(`/trademkt/portal/calendario/${id}/espacos/${lid}`, { quantidade: Math.max(1, Number(q) || 1) }).then(() => carregarLinks(id));
  const [sell, setSell] = useState(null);
  const [slogTem, setSlogTem] = useState(!!(evento && evento.tem_slogan)); const [slogVer, setSlogVer] = useState(0);
  const subirSlogan = file => { if (!file) return; const r = new FileReader(); r.onload = () => API.post(`/trademkt/portal/calendario/${id}/slogan`, { foto: r.result, mime: file.type }).then(() => { setSlogTem(true); setSlogVer(v => v + 1); onSaved(); }); r.readAsDataURL(file); };
  const apurar = () => { setSell('...'); API.get(`/trademkt/portal/calendario/${id}/sellout`).then(r => setSell(r.data)).catch(() => setSell({ erro: true })); };
  const addRef = x => { if (!(e.escopo_ref || []).some(r => String(r.id) === String(x.id))) set('escopo_ref', [...(e.escopo_ref || []), x]); };
  const rmRef = i => set('escopo_ref', (e.escopo_ref || []).filter((_, k) => k !== i));
  const rec = e.recorrencia;
  return <div onClick={onClose} style={s.overlay}><div onClick={ev => ev.stopPropagation()} style={{ ...s.modal, maxWidth: 560 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><b style={{ fontSize: 15 }}>🗓️ {id ? 'Editar' : 'Novo'} evento</b><button onClick={onClose} style={s.btnMini}>✕</button></div>
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={s.lbl}>Nome<input value={e.nome} onChange={ev => set('nome', ev.target.value)} placeholder="ex.: Segunda do Suplemento" style={s.inp} /></label>
      {id && <div style={s.lbl}><span>🎨 Arte / slogan da ação <span style={{ fontWeight: 400, color: '#94a3b8' }}>(aparece no topo do mês no portal)</span></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          {slogTem ? <Anexo key={slogVer} API={API} direct={false} url={`/trademkt/portal/calendario/${id}/slogan`} mime="image/jpeg" /> : null}
          <label style={{ ...s.mv, cursor: 'pointer', color: '#2E5C9E' }}>🖼️ {slogTem ? 'trocar' : 'subir'} slogan<input type="file" accept="image/*" style={{ display: 'none' }} onChange={ev => subirSlogan(ev.target.files[0])} /></label>
        </div></div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={s.lbl}>Tipo<select value={e.tipo} onChange={ev => set('tipo', ev.target.value)} style={s.inp}><option value="tematico">Dia temático (recorrente)</option><option value="acao">Ação da rede (data)</option><option value="campanha">Campanha (período)</option></select></label>
        <label style={s.lbl}>Categoria<input value={e.categoria || ''} onChange={ev => set('categoria', ev.target.value)} placeholder="suplemento, beleza…" style={s.inp} /></label>
        <label style={s.lbl}>Cor<input type="color" value={e.cor || '#2E5C9E'} onChange={ev => set('cor', ev.target.value)} style={{ ...s.inp, width: 54, padding: 2 }} /></label>
      </div>
      {e.tipo === 'tematico' ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={s.lbl}>Recorrência<select value={rec} onChange={ev => set('recorrencia', ev.target.value)} style={s.inp}><option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option></select></label>
        {(rec === 'semanal' || rec === 'quinzenal') && <label style={s.lbl}>Dia da semana<select value={e.dia_semana} onChange={ev => set('dia_semana', Number(ev.target.value))} style={s.inp}>{DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></label>}
        {rec === 'mensal' && <label style={s.lbl}>Dia do mês<input type="number" min="1" max="31" value={e.dia_mes} onChange={ev => set('dia_mes', Number(ev.target.value))} style={{ ...s.inp, width: 80 }} /></label>}
      </div> : e.tipo === 'acao' ? <label style={s.lbl}>Data<input type="date" value={(e.data || '').slice(0, 10)} onChange={ev => set('data', ev.target.value)} style={s.inp} /></label>
        : <div style={{ display: 'flex', gap: 8 }}><label style={s.lbl}>Início<input type="date" value={(e.data_ini || '').slice(0, 10)} onChange={ev => set('data_ini', ev.target.value)} style={s.inp} /></label><label style={s.lbl}>Fim<input type="date" value={(e.data_fim || '').slice(0, 10)} onChange={ev => set('data_fim', ev.target.value)} style={s.inp} /></label></div>}
      {e.tipo === 'tematico' && <div style={{ display: 'flex', gap: 8 }}><label style={s.lbl}>Vale de<input type="date" value={(e.data_ini || '').slice(0, 10)} onChange={ev => set('data_ini', ev.target.value)} style={s.inp} /></label><label style={s.lbl}>até <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span><input type="date" value={(e.data_fim || '').slice(0, 10)} onChange={ev => set('data_fim', ev.target.value)} style={s.inp} /></label></div>}
      <label style={s.lbl}>Descrição<textarea value={e.descricao || ''} onChange={ev => set('descricao', ev.target.value)} rows={2} placeholder="o que é, o que a marca ganha patrocinando esse dia…" style={{ ...s.inp, resize: 'vertical' }} /></label>
      <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', background: e.no_trade ? '#E6F4EC' : '#f1f5f9', padding: '8px 10px', borderRadius: 8 }}><input type="checkbox" checked={!!e.no_trade} onChange={ev => set('no_trade', ev.target.checked)} /><b>Aparece no Trade</b> — pode ser comercializado (o fornecedor vê e patrocina)</label>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {e.no_trade && <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!e.patrocinavel} onChange={ev => set('patrocinavel', ev.target.checked)} />Patrocinável</label>}
        {e.no_trade && e.patrocinavel ? <label style={s.lbl}>Investimento sugerido R$<input type="number" step="0.01" value={e.preco || ''} onChange={ev => set('preco', ev.target.value)} placeholder="99,90" style={{ ...s.inp, width: 120 }} /></label> : null}
        <label style={s.lbl}>Status<select value={e.status || 'ativo'} onChange={ev => set('status', ev.target.value)} style={s.inp}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></label>
      </div>
      <button onClick={salvar} style={s.btn}>💾 Salvar evento</button>

      {/* posições vinculadas (o que é comercializável nessa ação) — só depois de salvar e se for de Trade */}
      {e.no_trade && (id ? <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🔗 O que é vinculado (comercializável) <span style={{ fontWeight: 400, color: '#94a3b8' }}>— ex.: Stories, TikTok, Tabloide, E-commerce</span></div>
        {espacos.map(x => <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '4px 0', borderTop: '1px solid #f5f5f5' }}><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="number" min="1" defaultValue={x.quantidade} onBlur={ev => Number(ev.target.value) !== x.quantidade && qtdEspaco(x.id, ev.target.value)} style={{ ...s.inp, width: 44, padding: '3px 4px' }} title="quantidade" /><span>× {x.espaco || '(removida)'} <span style={{ color: '#999' }}>· {x.loja_nome || '—'}</span></span></span><button onClick={() => rmEspaco(x.id)} style={s.mv}>✕</button></div>)}
        {!espacos.length && <div style={{ fontSize: 11.5, color: '#aaa' }}>Nada vinculado ainda.</div>}
        <div style={{ marginTop: 6, background: '#F7FAFF', border: '1px solid #E3ECF7', borderRadius: 8, padding: 8 }}>
          <input value={buscaPos} onChange={ev => setBuscaPos(ev.target.value)} placeholder="🔎 buscar posição por nome, espaço ou loja…" style={{ ...s.inp, width: '100%', marginBottom: 6 }} />
          {(() => {
            const jaTem = new Set(espacos.map(x => x.espaco_id));
            const q = buscaPos.trim().toLowerCase();
            const livreR = x => (x.livre_real != null ? x.livre_real : x.livres) || 0;
            const filtro = x => !jaTem.has(x.id) && livreR(x) > 0 && (!q || (`${x.espaco} ${x.local} ${x.segmento} ${x.area || ''}`).toLowerCase().includes(q));
            const fams = FAM_ORDEM.filter(fm => posicoes.some(x => familiaDe(x) === fm && filtro(x)));
            if (!fams.length) return <div style={{ fontSize: 12, color: '#aaa', padding: 6 }}>Nenhuma posição encontrada.</div>;
            return <div style={{ maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 6 }}>
              {fams.map(fm => <div key={fm}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#2E5C9E', margin: '2px 0' }}>{FAMN[fm] || fm}</div>
                {posicoes.filter(x => familiaDe(x) === fm && filtro(x)).map(x => <button key={x.id} onClick={() => addEspaco(x.id)} style={{ ...s.mv, width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                  <span>➕ <b>{x.espaco}</b> · {x.local}</span><span style={{ color: '#666', whiteSpace: 'nowrap' }}>{brl(x.preco_unit)} · <b style={{ color: livreR(x) > 0 ? '#1E874B' : '#B91C1C' }}>{livreR(x)}/{x.quantidade}</b> livres</span>
                </button>)}
              </div>)}
            </div>;
          })()}
        </div>
      </div> : <div style={{ fontSize: 11.5, color: '#94a3b8', borderTop: '1px solid #eee', paddingTop: 8 }}>💡 Salve o evento para vincular as posições comercializáveis (Stories, TikTok, Tabloide, E-commerce…).</div>)}

      {/* escopo do Alpha + sell-out da ação */}
      {id && <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📈 Produtos da ação (escopo) + sell-out</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={s.lbl}>Escopo<select value={e.escopo_tipo || ''} onChange={ev => { set('escopo_tipo', ev.target.value); set('escopo_ref', []); }} style={s.inp}><option value="">—</option><option value="produto">Produto</option><option value="laboratorio">Laboratório</option><option value="classificacao">Classificação</option><option value="fornecedor">Fornecedor</option><option value="caderno">Caderno de oferta</option><option value="pessoa">Pessoa</option><option value="grupo_preco">Grupo de preço</option><option value="grupo_remarcacao">Grupo de remarcação</option></select></label>
          {e.escopo_tipo && <div style={{ flex: 1, minWidth: 200 }}><EscopoBusca API={API} tipo={e.escopo_tipo} onPick={addRef} /></div>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{(e.escopo_ref || []).map((x, i) => <span key={i} style={{ ...s.chip }}>{x.nome}{x.ean ? ` · ${x.ean}` : ''} <span onClick={() => rmRef(i)} style={{ cursor: 'pointer', color: '#B91C1C' }}>×</span></span>)}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Salve o evento após escolher o escopo. Sell-out disponível para <b>produto / laboratório / classificação</b>.</div>
        <button onClick={apurar} style={{ ...s.btnMini, marginTop: 6 }}>🔄 Apurar sell-out no período</button>
        {sell === '...' && <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>Apurando…</div>}
        {sell && sell !== '...' && sell.ok && !sell.semEscopo && !sell.naoSuportado && <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 110, background: '#f8fafc', borderRadius: 10, padding: 10 }}><div style={{ fontSize: 11, color: '#64748b' }}>ANTES ({dBR(sell.anterior.ini)}–{dBR(sell.anterior.fim)})</div><div style={{ fontWeight: 700, fontSize: 16 }}>{brl(sell.antes.valor)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>{sell.antes.qtd} un</div></div>
          <div style={{ flex: 1, minWidth: 110, background: (sell.variacao > 0 ? '#eafaf1' : '#f8fafc'), borderRadius: 10, padding: 10 }}><div style={{ fontSize: 11, color: '#64748b' }}>AÇÃO ({dBR(sell.periodo.ini)}–{dBR(sell.periodo.fim)})</div><div style={{ fontWeight: 700, fontSize: 16 }}>{brl(sell.atual.valor)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>{sell.atual.qtd} un</div></div>
          <div style={{ flex: 1, minWidth: 90, background: '#f8fafc', borderRadius: 10, padding: 10 }}><div style={{ fontSize: 11, color: '#64748b' }}>VARIAÇÃO</div><div style={{ fontWeight: 800, fontSize: 18, color: sell.variacao > 0 ? '#1E874B' : sell.variacao < 0 ? '#C0392B' : '#999' }}>{sell.variacao == null ? '—' : (sell.variacao > 0 ? '+' : '') + sell.variacao + '%'}</div></div>
        </div>}
        {sell && sell !== '...' && (sell.semEscopo || sell.naoSuportado) && <div style={{ fontSize: 12, color: '#B45309', marginTop: 6 }}>{sell.semEscopo ? 'Defina o escopo e salve para apurar.' : 'Sell-out ainda não suportado para este tipo de escopo.'}</div>}
      </div>}

      {id && <button onClick={onClose} style={{ ...s.btn, background: '#fff', color: '#334', border: '1px solid #ddd' }}>Fechar</button>}
    </div>
  </div></div>;
}

function Vendas({ API, gestao }) {
  const [d, setD] = useState(null); const [busca, setBusca] = useState(''); const [edit, setEdit] = useState(null);
  const carregar = useCallback((b = '') => API.get('/trademkt/vendas', { params: { busca: b || undefined } }).then(r => setD(r.data)).catch(() => setD({ vendas: [] })), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!d) return <div style={s.card}>Carregando…</div>;
  const mover = (v, dir) => { const ids = COLS.map(c => c.id); const novo = ids[ids.indexOf(colDe(v.status)) + dir]; if (novo) API.post(`/trademkt/vendas/${v.id}/mover`, { status: novo }).then(() => carregar(busca)); };
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
          const itens = d.vendas.filter(v => colDe(v.status) === col.id && v.status !== 'cancelado' && v.status !== 'recusado');
          return (
            <div key={col.id} style={{ minWidth: 250, flex: '1 1 250px', maxHeight: 'calc(100vh - 250px)', minHeight: 240, overflowY: 'auto', overflowX: 'hidden' }}>
              <div style={{ ...s.colHead, background: col.cor }}>{col.nome} <span style={s.colN}>{itens.length}</span></div>
              <div style={s.colBody}>
                {itens.map(v => (
                  <div key={v.id} style={s.cardA}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}><span style={{ fontSize: 11.5, fontWeight: 700, color: col.cor }}>📐 {v.codigo}</span><span style={{ display: 'flex', gap: 3 }}>{(v.origem === 'portal' || v.origem === 'recompra') ? <span style={{ ...s.tag, background: '#E7F0FB', color: '#2E5C9E' }}>🌐 {v.origem === 'recompra' ? 'recompra' : 'portal'}</span> : null}{proxVencer(v) ? <span style={{ ...s.tag, background: '#FEF3C7', color: '#B45309' }}>⏰ vence</span> : null}{v.atrasado ? <span style={{ ...s.tag, background: '#FBEAEA', color: '#C0392B' }}>atraso</span> : null}</span></div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4 }}>{v.fornecedor_nome}</div>
                    <div style={{ fontSize: 11.5, color: '#666' }}>{v.espacos} espaço(s){v.tema_desc ? ` · ${v.tema_desc}` : ''}</div>
                    {(v.vigencia_ini || v.vigencia_fim) && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>🗓️ {dBR(v.vigencia_ini)}–{dBR(v.vigencia_fim)}</div>}
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E874B', marginTop: 4 }}>{brl(v.valor)}</div>
                    {v.aReceber > 0 && <div style={{ fontSize: 11, color: '#B7791F' }}>a receber {brl(v.aReceber)}</div>}
                    {gestao && <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      <button onClick={() => mover(v, -1)} disabled={colDe(v.status) === COLS[0].id} style={s.mv}>◀</button>
                      <button onClick={() => setEdit(v.id)} style={{ ...s.mv, flex: 1 }}>Abrir</button>
                      <button onClick={() => mover(v, 1)} disabled={colDe(v.status) === 'encerrado'} style={s.mv}>▶</button>
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
  const updParcela = (pid, obj) => API.put(`/trademkt/parcelas/${pid}`, obj).then(() => recarregar(id));
  const anexarParcela = (pid, file) => { if (!file) return; const r = new FileReader(); r.onload = () => API.post(`/trademkt/parcelas/${pid}/comprovante`, { foto: r.result, mime: file.type }).then(() => recarregar(id)); r.readAsDataURL(file); };
  const verSellout = () => API.get(`/trademkt/vendas/${id}/sellout`).then(r => setSell(r.data)).catch(e => setSell({ ok: false, motivo: e.response?.data?.erro || 'Erro' }));
  const precisaSalvar = !id;
  const ABAS = [['dados', '📄 Dados & Espaços'], ['material', '🎨 Material & briefing'], ['financeiro', '💳 Financeiro'], ['sellout', '📈 Sell-out (ERP)']];
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

      {aba === 'material' && id && <div style={{ display: 'grid', gap: 12 }}>
        <MaterialEspacos API={API} venda={v} onChange={() => recarregar(id)} />
        <div style={{ borderTop: '1px solid #eee', paddingTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>💬 Briefing <span style={{ fontWeight: 400, color: '#94a3b8' }}>— observações, anexos e comprovação da ação (o fornecedor vê e responde)</span></div>
          <BriefingThread API={API} listUrl={`/trademkt/portal/venda/${id}/briefing`} postUrl={`/trademkt/portal/venda/${id}/briefing`} anexoUrl={bid => `/trademkt/portal/briefing/${bid}/anexo`} podeComprovar={true} />
        </div>
      </div>}

      {aba === 'financeiro' && id && <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Parcelas / recebimentos</div>
        <GerarParcelas onGerar={gerarParcelas} />
        {(v.parcelas || []).length === 0 && <div style={s.vazio}>Sem parcelas. Gere acima ou o valor é à vista.</div>}
        {(v.parcelas || []).map(p => {
          const atras = !p.recebido && p.vencimento && p.vencimento < new Date().toISOString().slice(0, 10);
          const forma = p.forma || '';
          const precisaNF = forma === 'bonificacao';
          const precisaAnexo = forma === 'deposito' || forma === 'abatimento' || forma === 'desconto_boleto';
          const anexoRot = forma === 'deposito' ? 'comprovante do depósito' : (forma === 'abatimento' || forma === 'desconto_boleto') ? 'e-mail de autorização do abatimento' : 'anexo';
          return <div key={p.id} style={{ padding: '8px 0', borderTop: '1px solid #f2f2f2' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5 }}><span style={{ ...s.tag, background: p.recebido ? '#E7F5EC' : atras ? '#FBEAEA' : '#FCF3E2', color: p.recebido ? '#1E874B' : atras ? '#C0392B' : '#B7791F' }}>{p.recebido ? 'recebido' : atras ? 'atrasado' : 'a receber'}</span> parcela {p.numero}</span>
              <button onClick={() => baixar(p.id)} style={s.mv}>{p.recebido ? 'estornar' : 'dar baixa'}</button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, alignItems: 'flex-end' }}>
              <label style={s.lbl}>Forma<select value={forma} onChange={e => updParcela(p.id, { forma: e.target.value })} style={s.inp}><option value="">—</option><option value="bonificacao">Bonificação</option><option value="deposito">Depósito</option><option value="desconto_boleto">Desconto em boleto</option><option value="brindes">Brindes</option><option value="outros">Outros</option></select></label>
              <label style={s.lbl}>Vencimento<input type="date" defaultValue={(p.vencimento || '').slice(0, 10)} onBlur={e => e.target.value !== (p.vencimento || '').slice(0, 10) && updParcela(p.id, { vencimento: e.target.value })} style={s.inp} /></label>
              <label style={s.lbl}>Valor R$<input type="number" step="0.01" defaultValue={p.valor} onBlur={e => Number(e.target.value) !== p.valor && updParcela(p.id, { valor: Number(e.target.value) })} style={{ ...s.inp, width: 100 }} /></label>
            </div>
            {precisaNF && <div style={{ marginTop: 6, background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9A3412', marginBottom: 4 }}>NF da bonificação {!p.nf_numero && <span style={{ color: '#B91C1C' }}>· obrigatória</span>}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 180 }}><div style={{ fontSize: 11, color: '#64748b' }}>Buscar no Alpha {!v.fornecedor_id && '(vincule o fornecedor)'}</div><BuscaNota API={API} fornecedorId={v.fornecedor_id} onPick={n => updParcela(p.id, { nf_numero: n.numero, nf_data: n.data })} /></div>
                <label style={s.lbl}>Nº NF<input defaultValue={p.nf_numero || ''} onBlur={e => e.target.value !== (p.nf_numero || '') && updParcela(p.id, { nf_numero: e.target.value })} style={{ ...s.inp, width: 110 }} /></label>
                <label style={s.lbl}>Data<input type="date" defaultValue={(p.nf_data || '').slice(0, 10)} onBlur={e => e.target.value !== (p.nf_data || '').slice(0, 10) && updParcela(p.id, { nf_data: e.target.value })} style={s.inp} /></label>
                <label style={s.lbl}>Valor NF<input type="number" step="0.01" defaultValue={p.nf_valor || ''} onBlur={e => Number(e.target.value) !== (p.nf_valor || 0) && updParcela(p.id, { nf_valor: e.target.value })} style={{ ...s.inp, width: 100 }} /></label>
              </div>
            </div>}
            {(precisaAnexo || p.tem_comprovante) && <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {p.tem_comprovante ? <Anexo API={API} direct={false} url={`/trademkt/parcelas/${p.id}/comprovante`} mime={p.comprovante_mime} nome={anexoRot} /> : null}
              <label style={{ ...s.mv, cursor: 'pointer', color: '#2E5C9E' }}>📎 {p.tem_comprovante ? 'trocar' : 'anexar'} {anexoRot}<input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => anexarParcela(p.id, e.target.files[0])} /></label>
            </div>}
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

function Cobranca({ API, gestao }) {
  const [d, setD] = useState(null);
  const [cfg, setCfg] = useState(null);
  const carregar = useCallback(() => API.get('/trademkt/cobranca').then(r => setD(r.data)).catch(() => setD({ parcelas: [], resumo: {} })), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (gestao) API.get('/trademkt/cobranca/config').then(r => setCfg(r.data)).catch(() => {}); }, [API, gestao]);
  const salvarCfg = patch => { const novo = { ...cfg, ...patch }; setCfg(novo); API.post('/trademkt/cobranca/config', { auto: novo.auto, dias: novo.dias }).catch(() => {}); };
  if (!d) return <div style={s.card}>Carregando…</div>;
  const baixar = pid => API.post('/trademkt/parcelas/' + pid + '/baixa', {}).then(carregar);
  const cobrar = vid => API.post('/trademkt/cobranca/email', { venda_id: vid }).then(r => alert('E-mail de cobrança enviado para ' + r.data.enviado_para)).catch(e => alert(e.response?.data?.erro || 'Erro ao enviar.'));
  const abertas = (d.parcelas || []).filter(p => !p.recebido);
  const porVenda = {}; abertas.forEach(p => { (porVenda[p.venda_id] = porVenda[p.venda_id] || { codigo: p.codigo, fornecedor: p.fornecedor_nome, email: p.contato_email, parcelas: [] }).parcelas.push(p); });
  const r = d.resumo || {};
  return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
      {[['Total a receber', brl(r.total_aberto), '#B7791F'], ['Vencidas', r.vencido || 0, '#C0392B'], ['Valor vencido', brl(r.valor_vencido), '#C0392B'], ['Comprov. p/ conferir', r.com_comprovante_pendente || 0, '#2E5C9E']].map(([lab, val, cor]) =>
        <div key={lab} style={{ ...s.card, marginBottom: 0 }}><div style={{ fontSize: 20, fontWeight: 800, color: cor }}>{val}</div><div style={{ fontSize: 11.5, color: '#888' }}>{lab}</div></div>)}
    </div>
    {!d.smtp && <div style={{ ...s.card, background: '#FCF7EA', color: '#8A6D3B', fontSize: 12.5 }}>⚠️ SMTP não configurado no servidor — o e-mail de cobrança só funciona depois de preencher SMTP_* no .env.</div>}
    {gestao && cfg && <div style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: cfg.auto ? '#EEF7F0' : undefined }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
        <input type="checkbox" checked={!!cfg.auto} disabled={!d.smtp} onChange={e => salvarCfg({ auto: e.target.checked })} />
        🤖 Cobrança automática por e-mail
      </label>
      <span style={{ fontSize: 12.5, color: '#666' }}>reenviar a cada
        <input type="number" min="1" max="60" value={cfg.dias} onChange={e => salvarCfg({ dias: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} style={{ ...s.inp, width: 56, padding: '3px 6px', margin: '0 6px' }} />
        dia(s) enquanto a parcela estiver vencida em aberto</span>
      {cfg.auto && <span style={{ ...s.tag, background: '#D7EBDD', color: '#1E874B' }}>ligada</span>}
    </div>}
    {Object.keys(porVenda).length === 0 && <div style={s.card}>Nada a receber em aberto. 🎉</div>}
    {Object.entries(porVenda).map(([vid, v]) => { const tot = v.parcelas.reduce((a, p) => a + (Number(p.valor) || 0), 0);
      return <div key={vid} style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div><b>{v.codigo}</b> · {v.fornecedor} <span style={{ color: '#888', fontSize: 12 }}>{v.email || '(sem e-mail)'}</span></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><b style={{ color: '#B7791F' }}>{brl(tot)}</b>{gestao && <button onClick={() => cobrar(vid)} disabled={!v.email} style={{ ...s.btn, ...(v.email ? {} : { opacity: .5, cursor: 'not-allowed' }) }}>📧 Cobrar por e-mail</button>}</div>
        </div>
        <table style={{ width: '100%', fontSize: 12.5, marginTop: 8, borderCollapse: 'collapse' }}><tbody>
          {v.parcelas.map(p => <tr key={p.id} style={{ borderTop: '1px solid #f3f3f3' }}>
            <td style={{ padding: '4px 0' }}>Parcela {p.numero} · {dBR(p.vencimento)} · {p.forma || '—'}</td>
            <td>{p.situacao === 'vencido' ? <span style={{ ...s.tag, background: '#FBEAEA', color: '#C0392B' }}>vencida {p.dias_atraso}d</span> : <span style={s.tag}>a vencer</span>}{p.tem_comprovante ? <span style={{ ...s.tag, background: '#E7F0FB', color: '#2E5C9E', marginLeft: 4 }}>📎 comprovante</span> : null}</td>
            <td style={{ textAlign: 'right' }}>{brl(p.valor)}</td>
            <td style={{ textAlign: 'right' }}>{gestao && <button onClick={() => baixar(p.id)} style={s.mv}>dar baixa</button>}</td>
          </tr>)}
        </tbody></table>
      </div>;
    })}
  </div>;
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
      {k && k.vendidoTotal != null && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 12 }}>
        {[['Vendido (fechado)', brl(k.vendidoTotal), '#1E874B'], ['A receber', brl(k.aReceber), '#B7791F'], ['Recebido', brl(k.recebido), '#2E5C9E']].map(([lab, val, cor]) =>
          <div key={lab} style={{ ...s.card, marginBottom: 0 }}><div style={{ fontSize: 20, fontWeight: 800, color: cor }}>{val}</div><div style={{ fontSize: 11.5, color: '#888' }}>{lab}</div></div>)}
      </div>}
      {d?.pipeline && <div style={{ ...s.card }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Funil de negociações</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[['pedido', 'Pedido'], ['negociacao', 'Negociação'], ['confirmado', 'Confirmado'], ['briefing', 'Briefing'], ['aguardando', 'Aguardando'], ['vigente', 'Em veiculação'], ['encerrado', 'Encerrado']].map(([st, lab]) => { const p = d.pipeline[st] || { n: 0, valor: 0 }; return <div key={st} style={{ flex: '1 1 120px', minWidth: 110, background: '#f8fafc', borderRadius: 10, padding: 10 }}><div style={{ fontSize: 11, color: '#64748b' }}>{lab}</div><div style={{ fontWeight: 800, fontSize: 18 }}>{p.n}</div><div style={{ fontSize: 11, color: '#1E874B' }}>{brl(p.valor)}</div></div>; })}
        </div>
      </div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12, marginBottom: 12 }}>
        <div style={s.card}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Negociações recentes</div>
          {(d?.recentes || []).map(r => <div key={r.codigo} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderTop: '1px solid #f3f3f3' }}><span><b>{r.codigo}</b> · {r.fornecedor_nome} {r.origem === 'portal' ? '🌐' : ''}</span><span style={{ color: '#1E874B', fontWeight: 700 }}>{brl(r.valor)}</span></div>)}
          {!(d?.recentes || []).length && <div style={{ fontSize: 12, color: '#aaa' }}>Sem negociações.</div>}
        </div>
        <div style={s.card}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Top fornecedores <span style={{ fontWeight: 400, color: '#999' }}>· por valor fechado</span></div>
          {(d?.topForn || []).map(f => <div key={f.nome} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderTop: '1px solid #f3f3f3' }}><span>{f.nome} <span style={{ color: '#999' }}>· {f.n}</span></span><span style={{ color: '#1E874B', fontWeight: 700 }}>{brl(f.valor)}</span></div>)}
          {!(d?.topForn || []).length && <div style={{ fontSize: 12, color: '#aaa' }}>Sem dados.</div>}
        </div>
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
