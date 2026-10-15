import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';

const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const COR = { azul: '#185FA5', ok: '#3B6D11', warn: '#B8860B', bad: '#993C1D', roxo: '#3C3489' };
const STATUS_COR = {
  novo: '#185FA5', andamento: '#B8860B', analise_fornecedor: '#8A5A00', aguardando_solicitante: '#6b7280',
  coleta: '#0E7C86', reembolso: '#3B6D11', perdas: '#993C1D', concluido: '#3B6D11', cancelado: '#999',
};

export default function Devolucoes() {
  const { API, usuario } = useAuth();
  const ehGestao = ['Supervisor', 'Gestor Geral', 'Diretor Geral', 'Suporte'].includes(usuario.funcao);
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState(usuario.loja_id || '');
  const [dados, setDados] = useState(null);
  const [nova, setNova] = useState(false);
  const [abrirId, setAbrirId] = useState(null);
  const [motivosOpen, setMotivosOpen] = useState(false);
  const [indOpen, setIndOpen] = useState(false);

  useEffect(() => { if (ehGestao) API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || [])); }, [API, ehGestao]);
  const carregar = useCallback(() => {
    API.get('/devolucoes', { params: lojaId ? { loja_id: lojaId } : {} }).then(r => setDados(r.data)).catch(() => setDados(null));
  }, [API, lojaId]);
  useEffect(() => { carregar(); }, [carregar]);

  const resumo = dados?.resumo || {};
  const fluxo = dados?.status_fluxo || [];
  const cardStatus = ['andamento', 'analise_fornecedor', 'coleta', 'reembolso', 'concluido'];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>↩️ Controle de Devoluções</div>
          <div style={{ fontSize: 13, color: '#999' }}>Devolução de mercadorias aos fornecedores · valor parado por status</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {ehGestao && lojas.length > 0 && (
            <select value={lojaId} onChange={e => setLojaId(e.target.value)} style={{ fontSize: 13, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 8 }}>
              <option value="">Todas as lojas</option>
              {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          )}
          <button onClick={() => setIndOpen(true)} style={{ background: '#eef2f6', color: '#334', border: '1px solid #dde', borderRadius: 8, padding: '9px 14px', cursor: 'pointer' }}>📊 Indicadores</button>
          <button onClick={() => setMotivosOpen(true)} style={{ background: '#eef2f6', color: '#334', border: '1px solid #dde', borderRadius: 8, padding: '9px 14px', cursor: 'pointer' }}>⚙️ Motivos</button>
          <button onClick={() => setNova(true)} style={{ background: COR.azul, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' }}>+ Nova Devolução</button>
        </div>
      </div>

      {/* Dashboard por status (contagem + R$ parado) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, margin: '16px 0' }}>
        {cardStatus.map(s => (
          <div key={s} style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', borderLeft: `4px solid ${STATUS_COR[s]}`, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 12, color: '#666' }}>{resumo[s]?.label || s}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: STATUS_COR[s] }}>{resumo[s]?.n || 0}</div>
            <div style={{ fontSize: 11, color: '#999' }}>{brl(resumo[s]?.valor)}</div>
          </div>
        ))}
      </div>

      {/* Kanban */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
        {fluxo.map(col => {
          const items = (dados?.devolucoes || []).filter(d => d.status === col.id);
          return (
            <div key={col.id} style={{ minWidth: 240, flex: '1 1 240px', background: '#f4f5f7', borderRadius: 10, padding: 8, minHeight: '64vh', maxHeight: '74vh', overflowY: 'auto' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: STATUS_COR[col.id], padding: '4px 6px', display: 'flex', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#f4f5f7' }}>
                <span>{col.label}</span><span>{items.length}</span>
              </div>
              {items.map(d => (
                <div key={d.id} onClick={() => setAbrirId(d.id)} style={{ background: '#fff', borderRadius: 8, padding: 10, margin: '6px 0', cursor: 'pointer', border: d.atrasada ? '1px solid #F3B8AA' : '1px solid #eee' }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{d.codigo}</div>
                  <div style={{ fontSize: 11, color: '#555' }}>{d.fornecedor_nome}</div>
                  <div style={{ fontSize: 10, color: '#999' }}>{d.loja_nome} · NF {d.nf_numero || '—'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COR.azul }}>{brl(d.valor_total)}</span>
                    <span style={{ fontSize: 10, color: d.atrasada ? COR.bad : '#999' }}>{d.atrasada ? '⚠️ ' : ''}{d.horas_no_status}h</span>
                  </div>
                </div>
              ))}
              {!items.length && <div style={{ fontSize: 11, color: '#bbb', padding: 8, textAlign: 'center' }}>—</div>}
            </div>
          );
        })}
      </div>

      {nova && <NovaDevolucao API={API} usuario={usuario} lojas={lojas} onClose={() => setNova(false)} onCriada={id => { setNova(false); carregar(); setAbrirId(id); }} />}
      {abrirId && <Detalhe API={API} id={abrirId} onClose={() => { setAbrirId(null); carregar(); }} />}
      {motivosOpen && <MotivosManager API={API} onClose={() => setMotivosOpen(false)} />}
      {indOpen && <IndicadoresModal API={API} lojaId={lojaId} onClose={() => setIndOpen(false)} />}
    </div>
  );
}

// ─── NOVA DEVOLUÇÃO: fornecedor + NF → busca ERP → marca produtos ───
function NovaDevolucao({ API, usuario, lojas, onClose, onCriada }) {
  const [f, setF] = useState({ loja_id: usuario.loja_id || (lojas[0]?.id || ''), fornecedor_nome: '', nf_numero: '', serie: '', tipo: 'total', motivo: '', observacoes_loja: '' });
  const [buscando, setBuscando] = useState(false);
  const [itens, setItens] = useState(null); // itens da NF marcáveis
  const [msg, setMsg] = useState('');
  const [motivos, setMotivos] = useState([]);
  const [fornSug, setFornSug] = useState([]);
  useEffect(() => { API.get('/devolucoes/motivos').then(r => setMotivos((r.data.motivos || []).filter(m => m.ativo))); }, [API]);
  async function buscarForn(termo) {
    setF(s => ({ ...s, fornecedor_nome: termo }));
    if (termo.trim().length < 3) { setFornSug([]); return; }
    try { const r = await API.get('/devolucoes/fornecedores', { params: { q: termo } }); setFornSug(r.data.fornecedores || []); } catch { /* ignore */ }
  }

  async function buscarNF() {
    if (!f.nf_numero || !f.loja_id) { setMsg('Informe a loja e o número da NF.'); return; }
    setBuscando(true); setMsg('');
    try {
      const r = await API.get('/devolucoes/nf-erp', { params: { numero: f.nf_numero, serie: f.serie, loja_id: f.loja_id } });
      if (!r.data.encontrada) { setMsg('NF não encontrada no ERP para essa loja.'); setItens(null); }
      else {
        if (r.data.nf.fornecedor && !f.fornecedor_nome) setF(s => ({ ...s, fornecedor_nome: r.data.nf.fornecedor }));
        setItens(r.data.itens.map(i => ({ ...i, marcado: true, qtd_dev: i.quantidade_nf })));
      }
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro ao buscar NF.'); }
    finally { setBuscando(false); }
  }

  async function criar() {
    if (!f.fornecedor_nome) { setMsg('Informe o fornecedor.'); return; }
    if (!f.motivo) { setMsg('Selecione o motivo da devolução.'); return; }
    const r = await API.post('/devolucoes', f);
    const id = r.data.id;
    const marcados = (itens || []).filter(i => i.marcado && Number(i.qtd_dev) > 0)
      .map(i => ({ ean: i.ean, descricao: i.descricao, quantidade_nf: i.quantidade_nf, quantidade: Number(i.qtd_dev), valor_unit: i.valor_unit }));
    if (marcados.length) await API.post(`/devolucoes/${id}/itens-lote`, { itens: marcados });
    onCriada(id);
  }

  const totalDev = (itens || []).filter(i => i.marcado).reduce((a, i) => a + (Number(i.qtd_dev) || 0) * i.valor_unit, 0);
  const inp = { border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 14, width: '100%', boxSizing: 'border-box' };

  return (
    <Overlay onClose={onClose} titulo="Nova devolução">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><label style={lbl}>Loja *</label>
          <select value={f.loja_id} onChange={e => setF({ ...f, loja_id: e.target.value })} style={inp}>
            <option value="">Selecione</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            {!lojas.length && <option value={usuario.loja_id}>{usuario.loja}</option>}
          </select></div>
        <div style={{ position: 'relative' }}><label style={lbl}>Fornecedor * <span style={{ color: '#aaa' }}>(busca no ERP)</span></label>
          <input style={inp} value={f.fornecedor_nome} onChange={e => buscarForn(e.target.value)} placeholder="Nome ou CNPJ" />
          {fornSug.length > 0 && (
            <div style={{ position: 'absolute', zIndex: 5, background: '#fff', border: '1px solid #ddd', borderRadius: 8, width: '100%', maxHeight: 190, overflowY: 'auto', boxShadow: '0 6px 16px rgba(0,0,0,.14)' }}>
              {fornSug.map((s, i) => (
                <div key={i} onClick={() => { setF(x => ({ ...x, fornecedor_nome: s.nome, fornecedor_cnpj: s.documento || '' })); setFornSug([]); }}
                  style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f4f4f4' }}>
                  {s.nome}<div style={{ fontSize: 10, color: '#aaa' }}>{s.documento || 's/ documento'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div><label style={lbl}>Nº da nota fiscal *</label><input style={inp} value={f.nf_numero} onChange={e => setF({ ...f, nf_numero: e.target.value })} placeholder="Ex: 759" /></div>
        <div><label style={lbl}>Série</label><input style={inp} value={f.serie} onChange={e => setF({ ...f, serie: e.target.value })} placeholder="Ex: 2" /></div>
        <div><label style={lbl}>Tipo</label>
          <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} style={inp}><option value="total">Total</option><option value="parcial">Parcial</option></select></div>
        <div><label style={lbl}>Motivo *</label>
          <select style={inp} value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })}>
            <option value="">Selecione…</option>
            {motivos.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
          </select></div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button onClick={buscarNF} disabled={buscando} style={{ background: '#eef2f6', color: COR.azul, border: '1px solid #cdd', borderRadius: 8, padding: '9px 14px', fontWeight: 700, cursor: 'pointer' }}>
          {buscando ? 'Buscando…' : '🔎 Buscar NF no ERP'}
        </button>
        <span style={{ fontSize: 12, color: '#999', marginLeft: 10 }}>Traz os produtos da nota com o custo pra você marcar o que devolver.</span>
      </div>

      {itens && (
        <div style={{ marginTop: 12, border: '1px solid #eee', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f7f9fb' }}>
              <th style={th}></th><th style={{ ...th, textAlign: 'left' }}>Produto</th><th style={th}>Qtd NF</th><th style={th}>Custo un.</th><th style={th}>Qtd devolver</th><th style={th}>Valor</th>
            </tr></thead>
            <tbody>
              {itens.map((i, idx) => (
                <tr key={idx} style={{ borderTop: '1px solid #f2f2f2', opacity: i.marcado ? 1 : 0.5 }}>
                  <td style={td}><input type="checkbox" checked={i.marcado} onChange={e => setItens(a => a.map((x, j) => j === idx ? { ...x, marcado: e.target.checked } : x))} /></td>
                  <td style={{ ...td, textAlign: 'left' }}>{i.descricao}<div style={{ fontSize: 10, color: '#aaa' }}>{i.ean || 's/ código'}</div></td>
                  <td style={td}>{i.quantidade_nf}</td>
                  <td style={td}>{brl(i.valor_unit)}</td>
                  <td style={td}><input type="number" min="0" max={i.quantidade_nf} value={i.qtd_dev} disabled={!i.marcado}
                    onChange={e => setItens(a => a.map((x, j) => j === idx ? { ...x, qtd_dev: e.target.value } : x))}
                    style={{ width: 70, padding: 4, border: '1px solid #ddd', borderRadius: 6, textAlign: 'center' }} /></td>
                  <td style={{ ...td, fontWeight: 700, color: COR.azul }}>{brl((Number(i.qtd_dev) || 0) * i.valor_unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', padding: 10, fontWeight: 800, color: COR.azul }}>Total a devolver: {brl(totalDev)}</div>
        </div>
      )}

      {msg && <div style={{ fontSize: 13, color: COR.bad, marginTop: 8 }}>{msg}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button onClick={onClose} style={btnSec}>Cancelar</button>
        <button onClick={criar} style={btnPri}>Criar devolução</button>
      </div>
    </Overlay>
  );
}

// ─── DETALHE / fluxo ───
const FLUXO = [
  { id: 'andamento', label: 'Andamento' }, { id: 'analise_fornecedor', label: 'Análise Fornecedor' },
  { id: 'coleta', label: 'Coleta' }, { id: 'reembolso', label: 'Reembolso' }, { id: 'concluido', label: 'Concluído' },
];
function Detalhe({ API, id, onClose }) {
  const [d, setD] = useState(null);
  const [aba, setAba] = useState('produtos');
  const carregar = useCallback(() => { API.get(`/devolucoes/${id}`).then(r => setD(r.data)); }, [API, id]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!d) return <Overlay onClose={onClose} titulo="Devolução">Carregando…</Overlay>;

  return (
    <Overlay onClose={onClose} titulo={`${d.codigo} · ${d.fornecedor_nome}`} wide>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, background: STATUS_COR[d.status] + '22', color: STATUS_COR[d.status], borderRadius: 20, padding: '4px 12px', fontWeight: 700 }}>{d.status_label}</span>
        <span style={{ fontSize: 12, color: '#777' }}>{d.loja_nome} · NF {d.nf_numero || '—'} · {d.tipo}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 800, color: COR.azul }}>{brl(d.valor_total)} parado</span>
      </div>
      {/* Trilha visual do fluxo */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {FLUXO.map((s, i) => {
          const idx = FLUXO.findIndex(x => x.id === d.status);
          const ativo = d.status === s.id, passou = idx > i && d.status !== 'perdas';
          return <span key={s.id} style={{ fontSize: 11, borderRadius: 6, padding: '4px 9px', background: ativo ? STATUS_COR[s.id] : passou ? '#e7f0e2' : '#f0f0f0', color: ativo ? '#fff' : passou ? COR.ok : '#999', fontWeight: ativo ? 700 : 400 }}>{s.label}</span>;
        })}
        {d.status === 'perdas' && <span style={{ fontSize: 11, borderRadius: 6, padding: '4px 9px', background: COR.bad, color: '#fff', fontWeight: 700 }}>Perdas</span>}
      </div>
      <AcoesFluxo API={API} d={d} recarregar={carregar} />

      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #eee', marginBottom: 10 }}>
        {[['produtos', 'Produtos'], ['fornecedor', 'Fornecedor / NF'], ['reembolsos', 'Reembolsos'], ['historico', 'Histórico']].map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)} style={{ border: 'none', background: 'none', padding: '6px 10px', cursor: 'pointer', fontWeight: aba === k ? 700 : 400, color: aba === k ? COR.azul : '#666', borderBottom: aba === k ? `2px solid ${COR.azul}` : '2px solid transparent' }}>{l}</button>
        ))}
      </div>

      {aba === 'produtos' && <AbaProdutos API={API} d={d} recarregar={carregar} />}
      {aba === 'fornecedor' && <AbaFornecedor API={API} d={d} recarregar={carregar} />}
      {aba === 'reembolsos' && <AbaReembolsos API={API} d={d} recarregar={carregar} />}
      {aba === 'historico' && (
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {d.historico.map(h => (
            <div key={h.id} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
              <strong>{h.status ? (FLUXO.find(x => x.id === h.status)?.label || h.status) : '•'}</strong> — {h.texto} <span style={{ color: '#aaa' }}>· {h.autor_nome || 'Sistema'} · {new Date(h.criado_em + 'Z').toLocaleString('pt-BR')}</span>
            </div>
          ))}
        </div>
      )}
    </Overlay>
  );
}

// Ações contextuais do fluxo (dependem do status e da função)
function AcoesFluxo({ API, d, recarregar }) {
  const { usuario } = useAuth();
  const ehConf = usuario.funcao === 'Conferente'; // conferente só cria e registra a coleta
  const call = async (url, body) => { await API.post(url, body || {}); recarregar(); };
  const st = d.status;
  const B = (label, onClick, cor) => <button onClick={onClick} style={{ ...btnPri, background: cor || COR.azul }}>{label}</button>;
  const registrarColeta = () => {
    const data = window.prompt('Data da coleta (AAAA-MM-DD):', new Date().toISOString().slice(0, 10)); if (data === null) return;
    const url = window.prompt('Link do comprovante de recolhimento (opcional):') ?? '';
    call(`/devolucoes/${d.id}/registrar-coleta`, { data_coleta: data, url_comprovante_coleta: url });
  };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center', background: '#f7f9fb', borderRadius: 10, padding: 10 }}>
      {/* Conferente: só registra a coleta (quando é a vez dele) */}
      {ehConf && st === 'coleta' && B('📦 Registrar coleta + comprovante', registrarColeta, COR.ok)}
      {ehConf && st !== 'coleta' && <span style={{ fontSize: 12, color: '#999' }}>Aguardando o suporte no fluxo — você será avisado por tarefa quando for a coleta.</span>}

      {/* Suporte / escritório: conduzem o fluxo */}
      {!ehConf && <>
        {st === 'andamento' && B('➡️ Enviar p/ análise do fornecedor', () => call(`/devolucoes/${d.id}/analise`))}
        {st === 'analise_fornecedor' && <>
          {B('✅ Aceita — liberar coleta', () => {
            if (!d.reembolso_momento) { if (!window.confirm('Você não definiu se o reembolso é antes ou depois da coleta (aba Fornecedor/NF). Seguir mesmo assim? (será tratado como DEPOIS da coleta)')) return; }
            call(`/devolucoes/${d.id}/liberar-coleta`);
          }, COR.ok)}
          {B('🚫 Rejeitada (perda)', () => { const o = window.prompt('Motivo da rejeição (opcional):') ?? ''; call(`/devolucoes/${d.id}/rejeitar`, { obs: o }); }, COR.bad)}
        </>}
        {st === 'coleta' && B('📦 Registrar coleta + comprovante', registrarColeta, COR.ok)}
        {st === 'reembolso' && <>
          {d.reembolso_momento !== 'antes' && B('💸 Enviar reembolso ao financeiro', () => call(`/devolucoes/${d.id}/enviar-financeiro`))}
          {B('💰 Confirmar pagamento', () => call(`/devolucoes/${d.id}/confirmar-pagamento`), COR.ok)}
        </>}
        {st !== 'concluido' && st !== 'perdas' && (
          <button onClick={() => { const t = window.prompt('O que você precisa do conferente?'); if (t) call(`/devolucoes/${d.id}/solicitar-conferente`, { texto: t }); }} style={btnSec}>❓ Solicitar info ao conferente</button>
        )}
      </>}
      {st === 'concluido' && <span style={{ fontSize: 13, fontWeight: 800, color: d.pago ? COR.ok : COR.warn, marginLeft: 'auto' }}>{d.pago ? '✅ Reembolso PAGO' : '⏳ Reembolso em aberto'}</span>}
    </div>
  );
}

function AbaProdutos({ API, d, recarregar }) {
  async function remover(itemId) { await API.delete(`/devolucoes/${d.id}/itens/${itemId}`); recarregar(); }
  const COLS = [
    { k: 'descricao', label: 'Produto', get: i => i.descricao || '', tipo: 'txt' },
    { k: 'quantidade', label: 'Qtd', get: i => Number(i.quantidade) || 0, tipo: 'num', center: true },
    { k: 'valor_unit', label: 'Custo un.', get: i => Number(i.valor_unit) || 0, tipo: 'num', center: true },
    { k: 'valor_total', label: 'Valor', get: i => Number(i.valor_total) || 0, tipo: 'num', center: true },
  ];
  const { linhas, ordem, clicar, seta } = useOrdenavel(d.itens, COLS, { col: 'valor_total', dir: 'desc' });
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ background: '#f7f9fb' }}>{COLS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={th} />)}<th style={th}></th></tr></thead>
        <tbody>
          {linhas.map(i => (
            <tr key={i.id} style={{ borderTop: '1px solid #f2f2f2' }}>
              <td style={{ ...td, textAlign: 'left' }}>{i.descricao}<div style={{ fontSize: 10, color: '#aaa' }}>{i.ean || ''}</div></td>
              <td style={td}>{i.quantidade}{i.quantidade_nf ? <span style={{ color: '#bbb' }}>/{i.quantidade_nf}</span> : ''}</td>
              <td style={td}>{brl(i.valor_unit)}</td>
              <td style={{ ...td, fontWeight: 700, color: COR.azul }}>{brl(i.valor_total)}</td>
              <td style={td}><button onClick={() => remover(i.id)} style={{ border: 'none', background: 'none', color: COR.bad, cursor: 'pointer' }}>✕</button></td>
            </tr>
          ))}
          {!d.itens.length && <tr><td colSpan={5} style={{ ...td, color: '#999' }}>Nenhum item.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function AbaFornecedor({ API, d, recarregar }) {
  const [f, setF] = useState(d.fornecedor || {});
  const [msg, setMsg] = useState('');
  const campos = [['status_fornecedor', 'Status do fornecedor'], ['protocolo', 'Protocolo'], ['data_resposta', 'Data de resposta'], ['nf_devolucao_numero', 'Nº NF de devolução'], ['nf_devolucao_serie', 'Série'], ['nf_devolucao_emissao', 'Emissão'], ['previsao_coleta', 'Previsão de coleta'], ['data_coleta', 'Data da coleta']];
  async function salvar() { await API.put(`/devolucoes/${d.id}/fornecedor`, f); setMsg('✅ Salvo.'); recarregar(); }
  const inp = { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
  return (
    <div>
      <div style={{ marginBottom: 10, background: '#fff8ee', border: '1px solid #f0e2c0', borderRadius: 8, padding: 10 }}>
        <label style={lbl}>Quando o fornecedor libera o reembolso?</label>
        <select value={d.reembolso_momento || ''} onChange={async e => { await API.patch(`/devolucoes/${d.id}`, { reembolso_momento: e.target.value }); recarregar(); }} style={inp}>
          <option value="">— definir —</option>
          <option value="antes">Antes da coleta (informe o reembolso agora, na aba Reembolsos)</option>
          <option value="depois">Depois da coleta (informa após recolher)</option>
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {campos.map(([k, l]) => (
          <div key={k}><label style={lbl}>{l}</label><input style={inp} value={f[k] || ''} onChange={e => setF({ ...f, [k]: e.target.value })} /></div>
        ))}
      </div>
      <div><label style={lbl}>Observações do escritório</label><textarea style={{ ...inp, minHeight: 60 }} value={f.observacoes_escritorio || ''} onChange={e => setF({ ...f, observacoes_escritorio: e.target.value })} /></div>
      <div style={{ marginTop: 8 }}>{msg && <span style={{ color: COR.ok, fontSize: 12, marginRight: 8 }}>{msg}</span>}<button onClick={salvar} style={btnPri}>Salvar</button></div>
    </div>
  );
}

function AbaReembolsos({ API, d, recarregar }) {
  const [r, setR] = useState({ forma_pagamento: '', data: '', valor: '', credito: '', nota_fiscal: '' });
  const [boletos, setBoletos] = useState(null); const [nfs, setNfs] = useState(null); const [busca, setBusca] = useState(''); const [buscando, setBuscando] = useState(false);
  async function add() { await API.post(`/devolucoes/${d.id}/reembolsos`, r); setR({ forma_pagamento: '', data: '', valor: '', credito: '', nota_fiscal: '' }); setBoletos(null); setNfs(null); setBusca(''); recarregar(); }
  async function del(id) { await API.delete(`/devolucoes/${d.id}/reembolsos/${id}`); recarregar(); }
  const forma = (r.forma_pagamento || '').toLowerCase();
  const ehBoleto = forma.includes('boleto'), ehBrinde = forma.includes('brinde'), ehDeposito = forma.includes('deposito') || forma.includes('depósito');
  async function buscarBoletos() {
    if (!d.fornecedor_cnpj) { setBoletos([]); return; }
    setBuscando(true);
    try { const res = await API.get('/devolucoes/erp/boletos', { params: { cnpj: d.fornecedor_cnpj, q: busca } }); setBoletos(res.data.boletos || []); }
    catch { setBoletos([]); } finally { setBuscando(false); }
  }
  async function buscarNf() {
    if (!busca) return; setBuscando(true);
    try { const res = await API.get('/devolucoes/erp/nf', { params: { numero: busca } }); setNfs(res.data.nfs || []); }
    catch { setNfs([]); } finally { setBuscando(false); }
  }
  const total = d.reembolsos.reduce((a, x) => a + (x.valor || 0) + (x.credito || 0), 0);
  const inp = { border: '1px solid #ddd', borderRadius: 6, padding: '6px 8px', fontSize: 13 };
  const dBRr = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');
  return (
    <div>
      {d.reembolsos.map(x => (
        <div key={x.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
          <span style={{ flex: 1 }}>{x.forma_pagamento || '—'} · {x.data || ''} {x.nota_fiscal ? `· NF/doc ${x.nota_fiscal}` : ''}</span>
          <span>{brl(x.valor)} {x.credito ? `+ ${brl(x.credito)} créd.` : ''}</span>
          <button onClick={() => del(x.id)} style={{ border: 'none', background: 'none', color: COR.bad, cursor: 'pointer' }}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
        <select style={{ ...inp, width: 160 }} value={r.forma_pagamento} onChange={e => { setR({ ...r, forma_pagamento: e.target.value }); setBoletos(null); setNfs(null); }}><option value="">Forma pgto…</option>{['Boleto', 'Desconto em boleto', 'Depósito', 'Crédito em NF', 'Bonificação', 'Brinde', 'Cartão', 'PIX'].map(f => <option key={f}>{f}</option>)}</select>
        <input style={{ ...inp, width: 120 }} type="date" value={r.data} onChange={e => setR({ ...r, data: e.target.value })} />
        <input style={{ ...inp, width: 90 }} type="number" placeholder="Valor" value={r.valor} onChange={e => setR({ ...r, valor: e.target.value })} />
        <input style={{ ...inp, width: 90 }} type="number" placeholder="Crédito" value={r.credito} onChange={e => setR({ ...r, credito: e.target.value })} />
        <input style={{ ...inp, width: 100 }} placeholder="Nº NF/doc" value={r.nota_fiscal} onChange={e => setR({ ...r, nota_fiscal: e.target.value })} />
        <button onClick={add} style={btnPri}>+ Adicionar</button>
      </div>

      {/* Desconto em boleto → busca boletos em aberto do fornecedor no ERP */}
      {ehBoleto && (
        <div style={{ marginTop: 8, background: '#F7FAF3', border: '1px solid #dfe9cf', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 12, marginBottom: 6 }}>🧾 Boletos em aberto do fornecedor{d.fornecedor_cnpj ? '' : ' — cadastre o CNPJ do fornecedor (aba Fornecedor/NF) p/ buscar'}:</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="filtrar por nº do documento (opcional)" value={busca} onChange={e => setBusca(e.target.value)} />
            <button onClick={buscarBoletos} disabled={buscando || !d.fornecedor_cnpj} style={btnPri}>{buscando ? '…' : 'Buscar boletos'}</button>
          </div>
          {boletos && boletos.length === 0 && <div style={{ fontSize: 11.5, color: '#993C1D', marginTop: 6 }}>Nenhum boleto em aberto encontrado.</div>}
          {boletos && boletos.map((bo, i) => (
            <div key={i} onClick={() => setR({ ...r, nota_fiscal: bo.doc || '', valor: r.valor || bo.valor })} style={{ display: 'flex', gap: 10, padding: '5px 6px', cursor: 'pointer', borderRadius: 6, fontSize: 12.5 }}
              onMouseEnter={e => e.currentTarget.style.background = '#eef5e2'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ flex: 1 }}>doc <b>{bo.doc || '—'}</b> · venc {dBRr(bo.venc)}</span><span>{brl(bo.valor)}</span>
            </div>
          ))}
        </div>
      )}
      {/* Brinde → busca a NF onde vieram os brindes */}
      {ehBrinde && (
        <div style={{ marginTop: 8, background: '#FBF7F2', border: '1px solid #ecdcc8', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 12, marginBottom: 6 }}>🎁 NF de entrada dos brindes (opcional):</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="nº da NF" value={busca} onChange={e => setBusca(e.target.value)} />
            <button onClick={buscarNf} disabled={buscando} style={btnPri}>{buscando ? '…' : 'Buscar NF'}</button>
          </div>
          {nfs && nfs.map((nf, i) => (
            <div key={i} onClick={() => setR({ ...r, nota_fiscal: String(nf.numero) })} style={{ padding: '5px 6px', cursor: 'pointer', fontSize: 12.5, borderRadius: 6 }}
              onMouseEnter={e => e.currentTarget.style.background = '#f3e9dc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              NF <b>{nf.numero}</b>{nf.fornecedor ? ` · ${nf.fornecedor}` : ''}
            </div>
          ))}
        </div>
      )}
      {(ehBoleto || ehBrinde || ehDeposito) && (
        <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
          💡 Ao adicionar, o sistema abre a tarefa automática: {ehDeposito ? 'Financeiro confere o depósito' : ehBrinde ? 'lançar o brinde no Meu Mercado' : 'Financeiro abate no boleto do fornecedor'}.
        </div>
      )}
      <div style={{ textAlign: 'right', marginTop: 8, fontWeight: 800, color: COR.ok }}>Reembolsado: {brl(total)}</div>
    </div>
  );
}

// ─── INDICADORES de devolução ───
function IndicadoresModal({ API, lojaId, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { API.get('/devolucoes/indicadores', { params: lojaId ? { loja_id: lojaId } : {} }).then(r => setD(r.data)).catch(() => setD(false)); }, [API, lojaId]);
  if (!d) return <Overlay onClose={onClose} titulo="Indicadores de devolução">{d === false ? 'Erro ao carregar.' : 'Carregando…'}</Overlay>;
  const kpi = (label, obj, cor) => (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 12, borderLeft: `4px solid ${cor}` }}>
      <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor }}>{brl(obj?.v)}</div>
      <div style={{ fontSize: 11, color: '#999' }}>{obj?.n || 0} devoluç{(obj?.n || 0) === 1 ? 'ão' : 'ões'}</div>
    </div>
  );
  const tabela = (titulo, rows, mainFn) => (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{titulo}</div>
      {(!rows || !rows.length) && <div style={{ fontSize: 12, color: '#999' }}>—</div>}
      {(rows || []).map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
          <span>{r.k}</span><span>{mainFn ? mainFn(r) : <><strong>{brl(r.valor)}</strong> <span style={{ color: '#aaa' }}>· {r.n}</span></>}</span>
        </div>
      ))}
    </div>
  );
  const atrasoTxt = r => <span style={{ color: COR.bad }}>{r.atras} atrasada(s) <span style={{ color: '#aaa' }}>de {r.total}</span></span>;
  return (
    <Overlay onClose={onClose} titulo="Indicadores de devolução" wide>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
        {kpi('Valor parado (em aberto)', d.valor_parado, COR.azul)}
        {kpi('Atrasadas', d.atrasadas, COR.bad)}
        {kpi('Reembolso em aberto', d.reembolso_aberto, COR.warn)}
        {kpi('Reembolso pago', d.pago, COR.ok)}
        {kpi('Perdas', d.perdas, COR.bad)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
        <div>
          {tabela('🏬 Lojas com mais atrasos', d.lojas_atraso, atrasoTxt)}
          {tabela('⏰ Conferentes com mais atraso', d.conferentes_atraso, atrasoTxt)}
          {tabela('🏆 Conferentes — melhor resolução/entrega', d.conferentes_resolucao, r => <span style={{ color: COR.ok }}>{r.concluidas} concluída(s) <span style={{ color: '#aaa' }}>de {r.total}</span></span>)}
        </div>
        <div>
          {tabela('Por motivo', d.por_motivo)}
          {tabela('Por fornecedor (top 10)', d.por_fornecedor)}
          {tabela('Por status', d.por_status)}
        </div>
      </div>
    </Overlay>
  );
}

// ─── CADASTRO DE MOTIVOS (padrão, vira indicador por motivo) ───
function MotivosManager({ API, onClose }) {
  const [lista, setLista] = useState([]);
  const [novo, setNovo] = useState('');
  const carregar = useCallback(() => { API.get('/devolucoes/motivos').then(r => setLista(r.data.motivos || [])); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  async function add() { if (!novo.trim()) return; await API.post('/devolucoes/motivos', { nome: novo.trim() }); setNovo(''); carregar(); }
  async function toggle(m) { await API.patch(`/devolucoes/motivos/${m.id}`, { ativo: m.ativo ? 0 : 1 }); carregar(); }
  return (
    <Overlay onClose={onClose} titulo="Motivos de devolução">
      <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Padronize os motivos — depois viram indicador (devoluções e R$ por motivo).</div>
      {lista.map(m => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #f5f5f5', opacity: m.ativo ? 1 : 0.5 }}>
          <span style={{ flex: 1, fontSize: 14 }}>{m.nome}</span>
          <button onClick={() => toggle(m)} style={{ fontSize: 11, border: '1px solid #ddd', background: '#fff', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>{m.ativo ? 'Desativar' : 'Ativar'}</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input value={novo} onChange={e => setNovo(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Novo motivo…" style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 14 }} />
        <button onClick={add} style={btnPri}>+ Adicionar</button>
      </div>
    </Overlay>
  );
}

// ─── UI helpers ───
function Overlay({ titulo, children, onClose, wide }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 999, padding: 20, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: wide ? 780 : 620, marginTop: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{titulo}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
const lbl = { fontSize: 11, color: '#777', display: 'block', marginBottom: 2 };
const th = { padding: '8px 6px', fontSize: 11, color: '#777', textAlign: 'center' };
const td = { padding: '7px 6px', textAlign: 'center' };
const btnPri = { background: COR.azul, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' };
const btnSec = { background: '#eef2f6', color: '#334', border: '1px solid #dde', borderRadius: 8, padding: '9px 16px', cursor: 'pointer' };
