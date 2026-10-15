import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { useOrdenavel } from '../components/Ordenavel';

const COR = { ok: '#3B6D11', warn: '#BA7517', bad: '#993C1D', info: '#185FA5' };
const corPct = p => (p >= 90 ? COR.ok : p >= 75 ? COR.warn : COR.bad);
const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR');

export default function Vendas() {
  const { usuario } = useAuth();
  const ehVendedor = usuario.funcao === 'Vendedor';
  const ehGestao = ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);

  const abas = [];
  if (ehVendedor) abas.push({ id: 'meu', l: '📊 Meu painel' });
  abas.push({ id: 'ranking', l: '🏆 Ranking' });
  if (ehGestao) abas.push({ id: 'indicadores', l: '⭐ Indicadores' });

  const [aba, setAba] = useState(abas[0].id);

  return (
    <div style={s.wrap}>
      <Banner emoji="🛒" titulo="Vendas e Metas" cor="verde" sub={`${usuario.nome} · ${usuario.loja || ''}`} />
      <div style={s.tabs}>
        {abas.map(a => (
          <button key={a.id} onClick={() => setAba(a.id)} style={{ ...s.tab, ...(aba === a.id ? s.tabAtiva : {}) }}>{a.l}</button>
        ))}
      </div>
      {aba === 'meu' && <MeuPainel />}
      {aba === 'ranking' && <Ranking ehVendedor={ehVendedor} />}
      {aba === 'indicadores' && <Indicadores />}
    </div>
  );
}

function ProgBar({ pct }) {
  return (
    <div style={s.track}><div style={{ ...s.fill, width: Math.min(100, pct) + '%', background: corPct(pct) }} /></div>
  );
}

function MeuPainel() {
  const { API } = useAuth();
  const [p, setP] = useState(null);
  useEffect(() => { API.get('/vendas/meu-painel').then(r => setP(r.data.painel)).catch(() => setP(false)); }, [API]);
  if (p === null) return <div style={s.load}>Carregando…</div>;
  if (p === false) return <div style={s.card}>Você ainda não tem meta neste período.</div>;
  return (
    <div>
      <div style={s.card}>
        <div style={s.cardT}>Meta — dia {p.dia_atual}/{p.dias_mes}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: corPct(p.pct_meta) }}>{p.pct_meta}%</span>
          <span style={{ fontSize: 12, color: '#666' }}>da meta</span>
        </div>
        <ProgBar pct={p.pct_meta} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10 }}>
          <span style={{ fontSize: 20, fontWeight: 600, color: COR.info }}>{p.pct_super}%</span>
          <span style={{ fontSize: 12, color: '#666' }}>da super meta</span>
        </div>
        <ProgBar pct={p.pct_super} />
      </div>
      <div style={s.card}>
        <div style={s.cardT}>Valor a vender hoje</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div><div style={{ fontSize: 24, fontWeight: 700, color: COR.ok }}>{brl(p.ritmo_meta_dia)}</div><div style={{ fontSize: 11, color: '#666' }}>para fechar a meta</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 18, fontWeight: 600, color: COR.info }}>{brl(p.ritmo_super_dia)}</div><div style={{ fontSize: 11, color: '#666' }}>para a super meta</div></div>
        </div>
      </div>
      <div style={s.metrics}>
        <Metric val={p.nota_indicadores + '/100'} label="Indicadores" cor={corPct(p.nota_indicadores)} />
        <Metric val={p.premiacao_pct + '%'} label="Premiação vendas" cor={p.premiacao_pct > 0 ? COR.ok : COR.bad} />
        <Metric val={p.vitaminas_unidades + ' un'} label="Vitaminas" cor={COR.info} />
        <Metric val={'R$ ' + p.premiacao_vitamina_un} label="R$/un vitamina" cor={p.premiacao_vitamina_un > 0 ? COR.ok : COR.bad} />
        <Metric val={'⭐ ' + p.conquistas} label="Conquistas" cor={COR.warn} />
      </div>
      <div style={s.infoBox}>Você vê o percentual da sua meta e super meta. Os valores totais ficam com a gestão.</div>
      {p.nota_indicadores < 95 && <div style={{ ...s.infoBox, background: '#FCEBEB', color: COR.bad }}>⚠️ Seus indicadores estão em {p.nota_indicadores}/100. Para receber <strong>5%</strong> na super meta é preciso chegar a <strong>95</strong> ou mais nos indicadores — abaixo disso o teto é <strong>4%</strong>. (Bateu a meta = 4% · abaixo da meta = 3%.)</div>}
    </div>
  );
}

function Ranking({ ehVendedor }) {
  const { API } = useAuth();
  const [data, setData] = useState(null);
  const [det, setDet] = useState(null);
  useEffect(() => { API.get('/vendas/ranking').then(r => setData(r.data)).catch(() => setData(false)); }, [API]);
  const COLS_RANK = [
    { k: 'nome', label: 'Nome', get: v => v.nome || '', tipo: 'txt' },
    { k: 'vendido', label: 'Vendido', get: v => v.vendido || 0, tipo: 'num' },
    { k: 'pct_meta', label: '% meta', get: v => v.pct_meta || 0, tipo: 'num' },
    { k: 'premiacao_pct', label: 'Premiação', get: v => v.premiacao_pct || 0, tipo: 'num' },
    { k: 'nota_indicadores', label: 'Indicadores', get: v => v.nota_indicadores || 0, tipo: 'num' },
    { k: 'conquistas', label: 'Conquistas', get: v => v.conquistas || 0, tipo: 'num' },
  ];
  const { linhas: rankOrd, ordem: ordemR, clicar: clicarR, seta: setaR } = useOrdenavel(data && data.ranking, COLS_RANK, { col: 'vendido', dir: 'desc' });
  if (data === null) return <div style={s.load}>Carregando…</div>;
  if (data === false) return <div style={s.card}>Nada para exibir.</div>;
  const { loja } = data;
  return (
    <div>
      <div style={s.card}>
        <div style={s.cardT}>Meta da loja — {String(data.mes).padStart(2, '0')}/{data.ano} · dia {loja.dia_atual}/{loja.dias_mes}</div>
        {!ehVendedor && <div style={{ fontSize: 22, fontWeight: 700 }}>{brl(loja.vendido)}</div>}
        <span style={{ ...s.badge, background: corPct(loja.pct_meta) + '22', color: corPct(loja.pct_meta) }}>{loja.pct_meta}% da meta</span>
        {!ehVendedor && <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>Meta: {brl(loja.meta)}</span>}
        <ProgBar pct={loja.pct_meta} />
        <div style={s.metrics}>
          <Metric val={loja.total_vendedores} label="Vendedores" cor="#111" />
          <Metric val={loja.na_meta} label="Na meta" cor={COR.ok} />
          <Metric val={loja.abaixo} label="Abaixo" cor={COR.bad} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 8px' }}>
        <span style={{ fontSize: 11, color: '#666' }}>Ordenar por:</span>
        {COLS_RANK.map(c => (
          <button key={c.k} onClick={() => clicarR(c.k)} style={{ ...s.opt, ...(ordemR.col === c.k ? { borderColor: '#111', color: '#111', fontWeight: 600 } : {}) }}>{c.label}{setaR(c.k)}</button>
        ))}
      </div>
      {rankOrd.map((v, i) => {
        const aberto = det === v.colaborador_id;
        return (
          <div key={v.colaborador_id} style={{ ...s.vend, ...(i === 0 ? s.lider : {}) }} onClick={() => setDet(aberto ? null : v.colaborador_id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{v.nome}</div>
                {!v.valores_ocultos && <div style={{ fontSize: 11, color: '#666' }}>{brl(v.vendido)} vendido</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: corPct(v.pct_meta) }}>{v.pct_meta}%</div>
                <div style={{ fontSize: 10, color: '#666' }}>da meta</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ ...s.badge, background: v.premiacao_pct > 0 ? '#EAF3DE' : '#FCEBEB', color: v.premiacao_pct > 0 ? COR.ok : COR.bad }}>{v.premiacao_pct}% premiação</span>
              <span style={{ ...s.badge, background: corPct(v.nota_indicadores) + '22', color: corPct(v.nota_indicadores) }}>Ind: {v.nota_indicadores}/100</span>
              <span style={{ ...s.badge, background: '#FFF3CD', color: '#856404' }}>⭐ {v.conquistas}</span>
            </div>
            {aberto && !v.valores_ocultos && (
              <div style={s.det} onClick={e => e.stopPropagation()}>
                <Row k="Meta individual" v={brl(v.meta)} />
                <Row k="Vendido até hoje" v={brl(v.vendido)} />
                <Row k="Falta para meta" v={brl(v.falta_meta)} />
                <Row k="Ritmo p/ meta" v={brl(v.ritmo_meta_dia) + '/dia'} />
                <Row k="Vitaminas" v={`${v.vitaminas_unidades} un · R$ ${v.premiacao_vitamina_un}/un`} />
                <Row k="Premiação vitaminas" v={brl(v.premiacao_vitamina_total)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Lancar() {
  const { API, usuario } = useAuth();
  const ehGestao = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const hoje = new Date().toISOString().slice(0, 10);
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState(usuario.loja_id || '');
  const [dados, setDados] = useState({ colaboradores: [], grupos_disponiveis: [] });
  const [ini, setIni] = useState(hoje);
  const [fim, setFim] = useState(hoje);
  const [vals, setVals] = useState({});
  const [msg, setMsg] = useState('');

  useEffect(() => { if (ehGestao) API.get('/referencias/lojas').then(r => { const ls = r.data.lojas || []; setLojas(ls); if (!lojaId && ls.length) setLojaId(ls[0].id); }); }, [API, ehGestao]);
  useEffect(() => {
    if (!lojaId) return;
    API.get('/vendas/metas-grupos', { params: { loja_id: lojaId } }).then(r => setDados(r.data));
  }, [API, lojaId]);

  async function salvar() {
    const posts = [];
    dados.colaboradores.forEach(c => {
      if (c.modo === 'grupo') {
        (c.grupos || []).forEach(g => {
          const v = vals[`${c.colaborador_id}:${g}`];
          if (v && Number(v) > 0) posts.push({ colaborador_id: c.colaborador_id, valor: parseFloat(v), data_venda: ini, loja_id: lojaId, grupo: g });
        });
      } else {
        const v = vals[c.colaborador_id];
        if (v && Number(v) > 0) posts.push({ colaborador_id: c.colaborador_id, valor: parseFloat(v), data_venda: ini, loja_id: lojaId });
      }
    });
    if (!posts.length) { setMsg('Informe ao menos um valor.'); return; }
    try {
      for (const p of posts) await API.post('/vendas', p);
      setMsg(`✅ ${posts.length} lançamento(s) de venda registrados.`); setVals({});
      setTimeout(() => setMsg(''), 3000);
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }

  return (
    <div style={s.card}>
      <div style={s.cardT}>Lançar vendas do período</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {ehGestao && (
          <select style={{ ...s.input, width: 'auto' }} value={lojaId} onChange={e => setLojaId(e.target.value)}>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        )}
        <div><div style={{ fontSize: 11, color: '#666' }}>De</div><input type="date" style={{ ...s.input, width: 'auto' }} value={ini} onChange={e => setIni(e.target.value)} /></div>
        <div><div style={{ fontSize: 11, color: '#666' }}>Até</div><input type="date" style={{ ...s.input, width: 'auto' }} value={fim} onChange={e => setFim(e.target.value)} /></div>
      </div>
      {dados.colaboradores.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhum vendedor ativo nesta loja.</div>}
      {dados.colaboradores.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#666' }}>
                <th style={{ padding: '6px 8px', position: 'sticky', left: 0, background: '#fff' }}>Vendedor</th>
                {dados.grupos_disponiveis.map(g => <th key={g.key} style={{ padding: '6px 8px', whiteSpace: 'nowrap', textAlign: 'right' }}>{g.label}</th>)}
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total (geral)</th>
              </tr>
            </thead>
            <tbody>
              {dados.colaboradores.map(c => (
                <tr key={c.colaborador_id} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600, position: 'sticky', left: 0, background: '#fff', whiteSpace: 'nowrap' }}>{c.nome}</td>
                  {dados.grupos_disponiveis.map(g => (
                    <td key={g.key} style={{ padding: '4px 8px', textAlign: 'right' }}>
                      {c.modo === 'grupo' && (c.grupos || []).includes(g.key)
                        ? <input type="number" placeholder="R$" style={{ ...s.input, width: 90 }} value={vals[`${c.colaborador_id}:${g.key}`] ?? ''} onChange={e => setVals({ ...vals, [`${c.colaborador_id}:${g.key}`]: e.target.value })} />
                        : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                  ))}
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                    {c.modo === 'grupo'
                      ? <span style={{ color: '#ccc' }}>—</span>
                      : <input type="number" placeholder="R$" style={{ ...s.input, width: 110 }} value={vals[c.colaborador_id] ?? ''} onChange={e => setVals({ ...vals, [c.colaborador_id]: e.target.value })} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? COR.ok : COR.bad, margin: '8px 0' }}>{msg}</div>}
      {dados.colaboradores.length > 0 && <button style={{ ...s.btn, marginTop: 10 }} onClick={salvar}>Lançar vendas</button>}
      <div style={{ ...s.infoBox, marginTop: 10 }}>💡 Quem tem meta "por grupo" lança o valor de cada grupo; os demais lançam o total. Tudo entra no acumulado do mês. O modo (geral/por grupo) é definido por pessoa na tela de Metas.</div>
    </div>
  );
}

const UNI = { percentual: '%', unidade: 'un', reais: 'R$' };
function fmtMeta(v, u) { if (v === null || v === undefined || v === '') return '—'; return u === 'reais' ? `R$ ${Number(v).toLocaleString('pt-BR')}` : `${Number(v).toLocaleString('pt-BR')}${u === 'percentual' ? '%' : ' un'}`; }

function Indicadores() {
  const { API, usuario } = useAuth();
  const ehGestao = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const hoje = new Date().toISOString().slice(0, 10);
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState(usuario.loja_id || '');
  const [dados, setDados] = useState({ indicadores: [], colaboradores: [] });
  const [ini, setIni] = useState(hoje);
  const [fim, setFim] = useState(hoje);
  const [vals, setVals] = useState({}); // { `${colab}:${ind}`: valor }
  const [msg, setMsg] = useState('');
  const [erp, setErp] = useState(null); // indicadores da loja ao vivo do ERP

  useEffect(() => { if (ehGestao) API.get('/referencias/lojas').then(r => { const ls = r.data.lojas || []; setLojas(ls); if (!lojaId && ls.length) setLojaId(ls[0].id); }); }, [API, ehGestao]);
  const carregar = useCallback(() => {
    if (!lojaId) return;
    API.get('/vendas/indicador-realizado', { params: { loja_id: lojaId } }).then(r => setDados(r.data));
    setErp(null);
    API.get('/vendas/indicadores-loja', { params: { loja_id: lojaId } }).then(r => setErp(r.data)).catch(() => setErp({ disponivel: false }));
  }, [API, lojaId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    const lancamentos = [];
    dados.colaboradores.forEach(c => dados.indicadores.forEach(i => {
      if (i.auto_erp) return; // vitaminas/identificação vêm do ERP, não se lança manual
      const k = `${c.colaborador_id}:${i.indicador}`;
      if (vals[k] !== undefined && vals[k] !== '' && Number(vals[k]) !== 0) lancamentos.push({ colaborador_id: c.colaborador_id, indicador: i.indicador, valor: Number(vals[k]) });
    }));
    if (!lancamentos.length) { setMsg('Informe ao menos um valor.'); return; }
    try {
      const r = await API.post('/vendas/indicador-lancamentos', { loja_id: lojaId, data_inicio: ini, data_fim: fim, lancamentos });
      setMsg(`✅ ${r.data.lancados} resultado(s) lançados — nota recalculada automaticamente.`); setVals({}); carregar();
      setTimeout(() => setMsg(''), 3500);
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }

  const semMeta = dados.indicadores.some(i => i.meta_colaborador === null);
  const iv = erp && erp.indicadores;
  const brl = v => v == null ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const num = v => v == null ? '—' : Number(v).toLocaleString('pt-BR');

  return (
    <>
    <div style={s.card}>
      <div style={s.cardT}>ℹ️ Informações da loja — ao vivo do ERP <span style={{ fontWeight: 400, color: '#aaa', fontSize: 11 }}>(não pontuam)</span></div>
      {!erp && <div style={{ fontSize: 12, color: '#999' }}>Carregando do ERP…</div>}
      {erp && !erp.disponivel && <div style={{ fontSize: 12, color: '#999' }}>Sem dados do ERP para esta loja/período (ERP indisponível ou loja não vinculada).</div>}
      {iv && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
          <Metric val={num(iv.clientes)} label="Nº clientes" cor={COR.info} />
          <Metric val={brl(iv.ticket)} label="Ticket médio" cor={COR.info} />
          <Metric val={num(iv.vitaminas)} label="Vitaminas (un)" cor={COR.ok} />
          <Metric val={num(iv.kits)} label="Kits (un)" cor={COR.ok} />
          <Metric val={iv.rep_gensim == null ? '—' : iv.rep_gensim + '%'} label="Rep. Gen/Sim" cor={COR.info} />
          <Metric val={iv.rep_etico == null ? '—' : iv.rep_etico + '%'} label="Rep. Ético" cor={COR.info} />
          <Metric val={iv.cmv == null ? '—' : iv.cmv + '%'} label="CMV" cor={COR.warn} />
        </div>
      )}
    </div>
    <div style={s.card}>
      <div style={s.cardT}>Lançar resultados dos indicadores</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {ehGestao && (
          <select style={{ ...s.input, width: 'auto' }} value={lojaId} onChange={e => setLojaId(e.target.value)}>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        )}
        <div><div style={{ fontSize: 11, color: '#666' }}>De</div><input type="date" style={{ ...s.input, width: 'auto' }} value={ini} onChange={e => setIni(e.target.value)} /></div>
        <div><div style={{ fontSize: 11, color: '#666' }}>Até</div><input type="date" style={{ ...s.input, width: 'auto' }} value={fim} onChange={e => setFim(e.target.value)} /></div>
      </div>

      <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Metas (por colaborador):{' '}
        {dados.indicadores.map(i => <span key={i.indicador} style={{ marginRight: 10 }}>{i.label}: <strong>{fmtMeta(i.meta_colaborador, i.unidade)}</strong></span>)}
      </div>
      {semMeta && <div style={{ ...s.infoBox, marginBottom: 10, background: '#FAEEDA', color: '#854F0B', borderColor: '#BA7517' }}>⚠ Há indicadores sem meta definida. Defina as metas na tela <strong>Metas → Indicadores</strong> para o sistema avaliar automaticamente.</div>}

      {dados.colaboradores.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhum vendedor ativo nesta loja.</div>}
      {dados.colaboradores.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #eee', position: 'sticky', left: 0, background: '#fff' }}>Colaborador</th>
                {dados.indicadores.map(i => (
                  <th key={i.indicador} style={{ padding: '6px 8px', borderBottom: '2px solid #eee', minWidth: 110, fontWeight: 600 }}>
                    {i.label}{i.auto_erp && <span style={{ fontSize: 9, color: '#185FA5', background: '#E6F1FB', borderRadius: 4, padding: '1px 4px', marginLeft: 4 }}>⚡{i.auto_fonte || 'ERP'}</span>}
                    <div style={{ fontSize: 10, color: '#999', fontWeight: 400 }}>meta {fmtMeta(i.meta_colaborador, i.unidade)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dados.colaboradores.map(c => (
                <tr key={c.colaborador_id}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f5f5f5', fontWeight: 600, position: 'sticky', left: 0, background: '#fff', whiteSpace: 'nowrap' }}>{c.nome}</td>
                  {dados.indicadores.map(i => {
                    const cur = c.valores[i.indicador] || { realizado: 0, nota: null };
                    return (
                      <td key={i.indicador} style={{ padding: '4px 6px', borderBottom: '1px solid #f5f5f5', textAlign: 'center' }}>
                        {i.auto_erp ? (
                          <div style={{ background: '#F7FBFF', border: '1px solid #E6F1FB', borderRadius: 6, padding: '6px 4px' }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#185FA5' }}>{Number(cur.realizado).toLocaleString('pt-BR')}{['identificacao', 'pbm', 'cadastro'].includes(i.indicador) ? '%' : ' un'}</div>
                            <div style={{ fontSize: 9, color: '#999' }}>{cur.nota !== null ? `nota ${cur.nota}` : `do ${i.auto_fonte || 'ERP'}`}</div>
                          </div>
                        ) : (<>
                          <input type="number" placeholder={`+ ${UNI[i.unidade] || ''}`} style={{ ...s.input, width: 90, textAlign: 'center', padding: '6px' }} value={vals[`${c.colaborador_id}:${i.indicador}`] ?? ''} onChange={e => setVals({ ...vals, [`${c.colaborador_id}:${i.indicador}`]: e.target.value })} />
                          <div style={{ fontSize: 9, color: '#999', marginTop: 2 }}>{Number(cur.realizado).toLocaleString('pt-BR')}{cur.nota !== null ? ` · n${cur.nota}` : ''}</div>
                        </>)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? COR.ok : COR.bad, margin: '8px 0' }}>{msg}</div>}
      {dados.colaboradores.length > 0 && <button style={{ ...s.btn, marginTop: 10 }} onClick={salvar}>Lançar resultados do período</button>}
      <div style={{ ...s.infoBox, marginTop: 10 }}>💡 <strong>Identificação</strong>, <strong>Vitaminas</strong>, <strong>PBM</strong> e <strong>Campanhas</strong> vêm automáticos do ERP e o <strong>Pdv+</strong> (Taxa de Conversão) vem da <strong>Trivio</strong> (marcados ⚡, não editáveis). Onde não houver fonte automática, você lança aqui; o sistema calcula a nota proporcional (realizado ÷ meta).</div>
    </div>
    </>
  );
}

const Metric = ({ val, label, cor }) => (
  <div style={s.metric}><div style={{ fontSize: 18, fontWeight: 700, color: cor }}>{val}</div><div style={s.metricL}>{label}</div></div>
);
const Row = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}><span style={{ color: '#666' }}>{k}</span><strong>{v}</strong></div>
);
const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 },
  sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 },
  tab: { fontSize: 12, padding: '5px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666' },
  tabAtiva: { background: '#111', color: '#fff', borderColor: '#111' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  cardT: { fontSize: 13, fontWeight: 600, marginBottom: 10 },
  load: { padding: 30, textAlign: 'center', color: '#666' },
  track: { height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden', margin: '6px 0' },
  fill: { height: '100%', borderRadius: 4 },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginTop: 10 },
  metric: { background: '#f8f8f8', borderRadius: 8, padding: 10, textAlign: 'center' },
  metricL: { fontSize: 11, color: '#666', marginTop: 2 },
  badge: { fontSize: 11, padding: '2px 8px', borderRadius: 6 },
  vend: { border: '1px solid #eee', borderRadius: 12, padding: 14, marginBottom: 8, cursor: 'pointer', background: '#fff' },
  lider: { border: '1.5px solid #FFD700', background: '#FFFEF5' },
  det: { marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f0f0' },
  infoBox: { background: '#E6F1FB', borderLeft: '3px solid #185FA5', borderRadius: '0 8px 8px 0', padding: '8px 12px', fontSize: 12, color: '#185FA5' },
  input: { width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: '#fff' },
  btn: { fontSize: 13, padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 },
  indRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid #f5f5f5' },
  opt: { fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd', background: 'none', cursor: 'pointer', color: '#666' },
};
