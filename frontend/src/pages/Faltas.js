import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const STATUS = {
  aberta: { l: 'Aberta', c: '#8A6D1D', bg: '#FBF0DA' },
  em_pedido: { l: 'Em pedido', c: '#185FA5', bg: '#E6F1FB' },
  entregue: { l: 'Entregue', c: '#3B6D11', bg: '#EAF3DE' },
  cancelada: { l: 'Cancelada', c: '#993C1D', bg: '#FCEBEB' },
};

export default function Faltas() {
  const { API, usuario } = useAuth();
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [dados, setDados] = useState(null);
  const [status, setStatus] = useState('aberta');
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState('');
  const [msg, setMsg] = useState('');
  const debounce = useRef();

  const ehComprador = ['Comprador Beleza', 'Comprador Bem-estar', 'Gestor Geral', 'Diretor Geral', 'Suporte'].includes(usuario.funcao);

  const carregar = useCallback(() => {
    const params = { status };
    if (ehComprador) params.loja_id = lojaId || 'todas';
    API.get('/faltas', { params }).then(r => setDados(r.data)).catch(() => setDados(null));
  }, [API, status, lojaId, ehComprador]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (ehComprador) API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API, ehComprador]);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (q.trim().length < 2) { setResultados([]); return; }
    setBuscando(true);
    debounce.current = setTimeout(() => {
      API.get('/faltas/produtos', { params: { q } }).then(r => setResultados(r.data.produtos || [])).catch(() => setResultados([])).finally(() => setBuscando(false));
    }, 350);
    return () => clearTimeout(debounce.current);
  }, [q, API]);

  async function lancar(p, quantidade) {
    try {
      await API.post('/faltas', { embalagem_id: p.embalagem_id, produto_id: p.produto_id, ean: p.ean, descricao: p.descricao, marca: p.marca, quantidade });
      setMsg(`✅ ${p.descricao} adicionado à lista.`); setQ(''); setResultados([]); carregar();
      setTimeout(() => setMsg(''), 2500);
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro ao lançar.'); }
  }
  async function mudar(id, novo) { await API.patch(`/faltas/${id}`, { status: novo }); carregar(); }
  async function excluir(id) { if (!window.confirm('Remover este item da lista?')) return; await API.delete(`/faltas/${id}`); carregar(); }

  return (
    <div style={s.wrap}>
      <Banner emoji="📝" titulo="Lista de faltas" cor="laranja" sub="Lançou faltou? Busque pelo código de barras ou nome, informe a quantidade e o comprador recebe organizado por marca." />

      {/* Busca / lançamento */}
      <div style={s.card}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Código de barras ou descrição do produto…" style={s.busca} />
        {buscando && <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>Buscando no ERP…</div>}
        {resultados.length > 0 && (
          <div style={{ marginTop: 8, border: '1px solid #eee', borderRadius: 10, overflow: 'hidden' }}>
            {resultados.map(p => <LinhaBusca key={p.embalagem_id} p={p} onAdd={lancar} />)}
          </div>
        )}
        {msg && <div style={{ fontSize: 13, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 8 }}>{msg}</div>}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 12px' }}>
        {['aberta', 'em_pedido', 'entregue'].map(st => (
          <button key={st} onClick={() => setStatus(st)} style={{ ...s.chip, ...(status === st ? s.chipOn : {}) }}>{STATUS[st].l}</button>
        ))}
        {ehComprador && lojas.length > 0 && (
          <select value={lojaId} onChange={e => setLojaId(e.target.value)} style={s.sel}>
            <option value="todas">Todas as lojas</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        )}
        <div style={{ flex: 1 }} />
        {dados && <span style={{ fontSize: 12, color: '#999' }}>{dados.total} item(ns)</span>}
      </div>

      {!dados ? <div style={{ color: '#999' }}>Carregando…</div> : dados.marcas.length === 0 ? (
        <div style={s.card}>Nenhuma falta {STATUS[status].l.toLowerCase()} por aqui. 🙂</div>
      ) : dados.marcas.map(g => (
        <div key={g.marca} style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#185FA5', marginBottom: 6 }}>🏷️ {g.marca} <span style={{ color: '#bbb', fontWeight: 400 }}>· {g.itens.length}</span></div>
          {g.itens.map(it => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #f4f4f4', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{it.descricao}</div>
                <div style={{ fontSize: 11, color: '#999' }}>
                  {it.ean ? `${it.ean} · ` : ''}por {it.colaborador_nome}{dados.escopo === 'rede' ? ` · ${it.loja_nome}` : ''}
                </div>
                {it.confronto && it.confronto.pedido_pendente && it.status !== 'entregue' && (
                  <div style={{ fontSize: 11, marginTop: 3, fontWeight: 600, color: '#185FA5' }}>
                    🔗 Pedido {it.confronto.pedido_codigo || ''} no ERP{it.confronto.entrega ? ` · entrega ${it.confronto.entrega}` : ''}{it.confronto.falta_receber ? ` · faltam ${it.confronto.falta_receber}` : ''}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, minWidth: 40, textAlign: 'center' }}>{it.quantidade}<span style={{ fontSize: 10, color: '#aaa' }}> un</span></div>
              <span style={{ fontSize: 11, fontWeight: 700, color: STATUS[it.status].c, background: STATUS[it.status].bg, padding: '2px 8px', borderRadius: 6 }}>{STATUS[it.status].l}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {dados.pode_comprar && it.status === 'aberta' && <button onClick={() => mudar(it.id, 'em_pedido')} style={s.btnA('#185FA5')}>Pedir</button>}
                {dados.pode_comprar && it.status === 'em_pedido' && <button onClick={() => mudar(it.id, 'entregue')} style={s.btnA('#3B6D11')}>Entregue</button>}
                <button onClick={() => excluir(it.id)} title="Remover" style={{ ...s.btnA('#eee'), color: '#993C1D' }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function LinhaBusca({ p, onAdd }) {
  const [qt, setQt] = useState(1);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #f4f4f4' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{p.descricao}</div>
        <div style={{ fontSize: 11, color: '#999' }}>{p.marca}{p.ean ? ` · ${p.ean}` : ''} · R$ {p.preco.toFixed(2)}</div>
      </div>
      <input type="number" min="1" value={qt} onChange={e => setQt(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: 52, border: '1px solid #ddd', borderRadius: 6, padding: '5px', fontSize: 13, textAlign: 'center' }} />
      <button onClick={() => onAdd(p, qt)} style={{ fontSize: 12, background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 600 }}>+ Lançar</button>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1120, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '14px 16px', marginBottom: 12 },
  busca: { width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 10, padding: '10px 12px', fontSize: 14 },
  chip: { fontSize: 12, padding: '5px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  sel: { fontSize: 12, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 8 },
  btnA: c => ({ fontSize: 11, padding: '5px 9px', background: c, color: c === '#eee' ? '#993C1D' : '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }),
};
