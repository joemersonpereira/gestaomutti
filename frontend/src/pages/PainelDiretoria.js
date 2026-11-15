import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

const COR = { verde: '#1E874B', amarelo: '#B7791F', vermelho: '#C0392B', neutro: '#334' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const slug = t => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const quando = iso => { if (!iso) return ''; const d = new Date(iso.replace(' ', 'T') + 'Z'); const dif = (Date.now() - d.getTime()) / 1000; if (dif < 60) return 'agora'; if (dif < 3600) return Math.floor(dif / 60) + 'min'; if (dif < 86400) return Math.floor(dif / 3600) + 'h'; return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); };

function pior(a) {
  if (a.erro) return '#B7791F';
  const st = (a.kpis || []).map(k => k.status);
  if (st.includes('vermelho')) return COR.vermelho;
  if (st.includes('amarelo')) return COR.amarelo;
  if (st.includes('verde')) return COR.verde;
  return '#ccd';
}

export default function PainelGestao() {
  const { API, usuario } = useAuth();
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano] = useState(hoje.getFullYear());
  const [d, setD] = useState(null);
  const [carreg, setCarreg] = useState(false);
  const [cont, setCont] = useState({});
  const [pessoas, setPessoas] = useState([]);
  const [destaquesOpen, setDestaquesOpen] = useState(() => { try { return localStorage.getItem('painel_destaques') !== '0'; } catch { return true; } });
  const toggleDestaques = () => setDestaquesOpen(o => { const n = !o; try { localStorage.setItem('painel_destaques', n ? '1' : '0'); } catch {} return n; });
  const podeEditar = ['Diretor Geral', 'Gestor Geral'].includes(usuario.funcao);
  const carregar = useCallback(() => {
    setCarreg(true);
    API.get('/painel/diretoria', { params: { mes, ano } }).then(r => setD(r.data)).catch(() => setD(false)).finally(() => setCarreg(false));
    API.get('/painel/comentarios/contagem').then(r => setCont(r.data.contagem || {})).catch(() => {});
  }, [API, mes, ano]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/painel/pessoas').then(r => setPessoas(r.data.pessoas || [])).catch(() => {}); }, [API]);

  const areas = (d && d.areas) || [];

  return (
    <div style={s.wrap}>
      <div style={s.banner}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🎯 Painel da Gestão</div>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>Visão de todos os setores — a gestão comenta, combina e cobra aqui mesmo.</div>
        </div>
        <div style={s.bannerArt}>📊</div>
        <label style={{ position: 'absolute', top: 16, right: 18, zIndex: 2, fontSize: 11, color: '#fff', opacity: 0.95 }}>
          <select value={mes} onChange={e => setMes(Number(e.target.value))} style={{ background: 'rgba(255,255,255,.2)', color: '#fff', border: '1px solid rgba(255,255,255,.4)', borderRadius: 8, padding: '5px 8px', fontSize: 12 }}>
            {MESES.map((m, i) => <option key={i} value={i + 1} style={{ color: '#333' }}>{m}/{ano}</option>)}
          </select>
        </label>
      </div>

      {carreg && !d && <div style={{ ...s.card, textAlign: 'center', color: '#888' }}>Reunindo os indicadores de todos os setores…</div>}
      {d === false && <div style={s.card}>Sem acesso.</div>}
      {d && d.areas && (
        <div style={s.colunas}>
          <div style={s.centro}>
            {podeEditar && <NumerosDia API={API} />}
            {podeEditar && <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 16 }}>
              <div style={{ flex: '3 1 420px', minWidth: 0 }}><VendasCmvAno API={API} /></div>
              <div style={{ flex: '1 1 280px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 12 }}><PodioDias API={API} /><EficienciaEmpresa setores={d.setores} compact /></div>
            </div>}
            {podeEditar && <AprovacoesArrasto API={API} />}
            {podeEditar && <AcordosValidar API={API} />}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, alignItems: 'stretch' }}>
              {(d.setores || []).map(sx => {
                const doSetor = areas.filter(a => a.setor === sx.key);
                return <SetorGrupo key={sx.key} sx={sx} areas={doSetor} API={API} cont={cont} pessoas={pessoas} onComentou={carregar} />;
              })}
            </div>
          </div>
          {podeEditar && (destaquesOpen
            ? <aside style={s.lateral}>
                <button onClick={toggleDestaques} title="Recolher" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#64748b' }}>🏆 Destaques</span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>recolher ✕</span>
                </button>
                <PodiosAno API={API} />
                <RankingsTrimestre API={API} />
              </aside>
            : <button onClick={toggleDestaques} title="Mostrar destaques" style={{ flex: '0 0 auto', alignSelf: 'flex-start', position: 'sticky', top: 10, writingMode: 'vertical-rl', background: '#fff', border: '1px solid #eef1f4', borderRadius: 10, padding: '12px 8px', cursor: 'pointer', fontSize: 12.5, fontWeight: 800, color: '#64748b' }}>🏆 Destaques ›</button>
          )}
        </div>
      )}
    </div>
  );
}

// 📊 Números do dia + oportunidade de marketing (estoque parado = valor que não vende → promover).
function NumerosDia({ API }) {
  const [d, setD] = useState(null);
  const [est, setEst] = useState(null);
  useEffect(() => { API.get('/painel/resumo-dia').then(r => setD(r.data)).catch(() => setD(false)); }, [API]);
  useEffect(() => { API.get('/financeiro/eficiencia-estoque').then(r => setEst(r.data.lojas || [])).catch(() => setEst([])); }, [API]);
  const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const ls = (est || []).filter(l => l.erp && l.posicoes > 0);
  const valorEstoque = ls.reduce((a, l) => a + (l.valor_estoque || 0), 0);
  // Valor de estoque em cada curva ABC (ponderado pelo estoque de cada loja). D = sem venda (parado).
  const abcVal = k => ls.reduce((a, l) => a + (l.valor_estoque || 0) * (l['abc_' + k + '_pct'] || 0) / 100, 0);
  const CURVAS = [
    { k: 'a', nome: 'A', cor: '#0E7C5A', desc: 'giro alto' },
    { k: 'b', nome: 'B', cor: '#2E8B9E', desc: 'giro médio' },
    { k: 'c', nome: 'C', cor: '#B7791F', desc: 'giro baixo' },
    { k: 'd', nome: 'D', cor: '#B23A48', desc: 'sem venda (parado)' },
  ].map(c => ({ ...c, valor: abcVal(c.k) }));
  const totAbc = CURVAS.reduce((a, c) => a + c.valor, 0) || 1;
  const Card = ({ lab, val, cor, sub }) => (
    <div style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 10, padding: '10px 14px', flex: '1 1 150px' }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{lab}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: cor || '#1c2a2e' }}>{val}</div>
      {sub && <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Card lab="Venda de hoje" val={d && d.erp ? brl(d.venda_hoje) : '—'} cor="#0E7C5A" sub={d && d.erp ? `${(d.cup_hoje || 0).toLocaleString('pt-BR')} cupons` : ''} />
        <Card lab="Venda do mês" val={d && d.erp ? brl(d.venda_mes) : '—'} sub={d && d.erp ? `${(d.cup_mes || 0).toLocaleString('pt-BR')} cupons` : ''} />
        <Card lab="Ticket médio (mês)" val={d && d.erp ? 'R$ ' + (d.ticket_mes || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'} />
        <Card lab="Identificação (mês)" val={d && d.erp && d.ident_mes != null ? d.ident_mes + '%' : '—'} sub="cupons com cliente no ERP" />
        <Card lab="Entregas (mês)" val={d && d.erp && d.entregas_mes != null ? (d.entregas_mes).toLocaleString('pt-BR') : '—'} sub="delivery finalizado" />
      </div>
      {/* 📦 Estoque por curva ABC — valor de estoque junto da % representativa de cada curva (Joe). */}
      <div style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 10, padding: '12px 14px', marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#1c2a2e' }}>📦 Estoque por curva de venda <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: 11.5 }}>· ABC (giro): A gira mais → D sem venda</span></span>
          <span style={{ fontSize: 12, color: '#64748b' }}>valor em estoque <b style={{ fontSize: 16, color: '#1c2a2e' }}>{est === null ? '…' : brl(valorEstoque)}</b></span>
        </div>
        {est === null ? <div style={{ fontSize: 12, color: '#999' }}>carregando…</div> : !ls.length ? <div style={{ fontSize: 12, color: '#aaa' }}>Sem dados de estoque.</div> : <>
          <div style={{ display: 'flex', height: 18, borderRadius: 6, overflow: 'hidden', border: '1px solid #eef1f4' }}>
            {CURVAS.map(c => { const w = c.valor / totAbc * 100; return w > 0 ? <div key={c.k} title={`Curva ${c.nome} (${c.desc}): ${brl(c.valor)} · ${Math.round(w * 10) / 10}%`} style={{ width: w + '%', background: c.cor }} /> : null; })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 8 }}>
            {CURVAS.map(c => { const w = Math.round(c.valor / totAbc * 1000) / 10; return (
              <div key={c.k} title={`Curva ${c.nome} (${c.desc}): ${brl(c.valor)} · ${w}%`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, minWidth: 0 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c.cor, flexShrink: 0 }} />
                <span style={{ color: '#334', fontWeight: 700, whiteSpace: 'nowrap' }}>Curva {c.nome} {w}%</span>
                <span style={{ color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{brl(c.valor)}</span>
              </div>
            ); })}
          </div>
        </>}
      </div>
    </div>
  );
}

// ⚡ Eficiência da empresa — nota de cada setor (média dos pilares com nota) num só gráfico, + índice geral.
function EficienciaEmpresa({ setores, compact }) {
  const fc = n => n == null ? '#cbd5e1' : n >= 80 ? COR.verde : n >= 60 ? COR.amarelo : COR.vermelho;
  const linhas = (setores || []).map(sx => {
    const notas = (sx.pilares || []).map(p => p.nota).filter(n => n != null);
    const nota = notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null;
    return { key: sx.key, nome: (sx.nome || '').replace(/\s*\(.*\)/, ''), emoji: sx.emoji, nota };
  }).filter(l => l.nota != null).sort((a, b) => b.nota - a.nota);
  const geral = linhas.length ? Math.round(linhas.reduce((a, l) => a + l.nota, 0) / linhas.length) : null;
  const lblW = compact ? 92 : 130;
  return (
    <div style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 10, padding: compact ? 12 : 14, marginBottom: compact ? 0 : 16, height: compact ? '100%' : undefined, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: compact ? 13 : 14, fontWeight: 800 }}>⚡ Eficiência da empresa{compact ? '' : <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: 12 }}> · média dos indicadores de cada setor</span>}</span>
        {geral != null && <span style={{ fontSize: 12, color: '#64748b' }}>índice <b style={{ fontSize: compact ? 18 : 20, color: fc(geral) }}>{geral}</b><span style={{ fontSize: 12, color: '#94a3b8' }}>/100</span></span>}
      </div>
      {!linhas.length ? <div style={{ fontSize: 12, color: '#aaa' }}>Sem setores apurados ainda.</div> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 7, flex: 1, justifyContent: 'center' }}>
          {linhas.map(l => (
            <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: compact ? 7 : 10 }}>
              <span style={{ width: lblW, fontSize: compact ? 11 : 12, color: '#334', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={l.nome}>{l.emoji} {l.nome}</span>
              <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 6, height: compact ? 13 : 16, position: 'relative', overflow: 'hidden' }}>
                <div style={{ width: l.nota + '%', height: '100%', background: fc(l.nota), borderRadius: 6, transition: 'width .4s' }} />
              </div>
              <span style={{ width: 28, textAlign: 'right', fontSize: compact ? 12 : 13, fontWeight: 800, color: fc(l.nota) }}>{l.nota}</span>
            </div>
          ))}
        </div>}
      {!compact && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 9 }}>Cada barra é a média das notas dos pilares do setor (🟢100 / 🟡50 / 🔴0 por indicador). O índice geral é a média dos setores — a eficiência do grupo num número.</div>}
    </div>
  );
}

// 📈 Vendas × CMV × Sobrou (resultado) por mês no ano — resumo na tela da Gestão.
function VendasCmvAno({ API }) {
  const [d, setD] = useState(null);
  useEffect(() => { API.get('/painel/vendas-cmv-ano').then(r => setD(r.data)).catch(() => setD(false)); }, [API]);
  const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const meses = (d && d.meses) || [];
  return (
    <div style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 10, padding: 14, height: '100%', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>📈 Vendas × CMV no ano {d && d.total && <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: 12 }}>· total {brl(d.total.venda)} · CMV {d.total.cmv_pct}% · sobrou {brl(d.total.resultado)}</span>}</div>
      {!d ? <div style={{ fontSize: 12, color: '#999' }}>carregando…</div> : d === false || d.erp === false ? <div style={{ fontSize: 12, color: '#aaa' }}>Sem dados.</div> :
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: 'left', color: '#94a3b8' }}>{['Mês', 'Venda', 'CMV', 'Sobrou'].map(h => <th key={h} style={{ padding: '3px 8px', fontWeight: 600, textAlign: h === 'Mês' ? 'left' : 'right' }}>{h}</th>)}</tr></thead>
            <tbody>{meses.map(m => <tr key={m.mes} style={{ borderTop: '1px solid #f4f6f8' }}>
              <td style={{ padding: '3px 8px', fontWeight: 700, textTransform: 'capitalize' }}>{m.mes}/{String(d.ano).slice(2)}</td>
              <td style={{ padding: '3px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{brl(m.venda)}</td>
              <td style={{ padding: '3px 8px', textAlign: 'right', color: '#B45309', fontWeight: 600 }}>{m.cmv_pct != null ? m.cmv_pct + '%' : '—'}</td>
              <td style={{ padding: '3px 8px', textAlign: 'right', color: m.resultado < 0 ? COR.vermelho : COR.verde, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{brl(m.resultado)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </div>
  );
}

// 🏆 Pódios do ANO por função: vendedor, caixa, entregador.
function PodiosAno({ API }) {
  const ano = new Date().getFullYear();
  const [vend, setVend] = useState(null);
  const [caixa, setCaixa] = useState(null);
  const [entr, setEntr] = useState(null);
  const ini = `${ano}-01-01`, fim = `${ano}-12-31`;
  useEffect(() => {
    API.get('/financeiro/venda-colaborador', { params: { ano } }).then(r => { const all = []; (r.data.lojas || []).forEach(l => (l.vendedores || []).forEach(v => all.push({ nome: v.nome, val: v.venda }))); all.sort((a, b) => b.val - a.val); setVend(all); }).catch(() => setVend([]));
    API.get('/tesouraria/cupons-operador', { params: { ini, fim } }).then(r => { const a = (r.data.operadores || []).map(o => ({ nome: o.nome || o.operador, val: o.cupons || 0 })).sort((x, y) => y.val - x.val); setCaixa(a); }).catch(() => setCaixa([]));
    API.get('/entrega/entregadores', { params: { ini, fim } }).then(r => { const a = (r.data.entregadores || []).map(o => ({ nome: o.entregador, val: o.finalizadas ?? o.entregas ?? 0 })).sort((x, y) => y.val - x.val); setEntr(a); }).catch(() => setEntr([]));
  }, [API]); // eslint-disable-line
  const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const num = v => (Number(v) || 0).toLocaleString('pt-BR');
  const box = { background: '#fff', border: '1px solid #eef1f4', borderRadius: 10, padding: 12, flex: '1 1 260px' };
  const bloco = (titulo, lista, fmt) => (
    <div style={box}>
      <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>{titulo} <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: 11.5 }}>· {ano}</span></div>
      {lista === null ? <div style={{ fontSize: 12, color: '#999' }}>carregando…</div> : !lista.length ? <div style={{ fontSize: 12, color: '#aaa' }}>Sem dados.</div> : <Podio top3={lista.slice(0, 3).map(x => ({ nome: x.nome, val: fmt(x.val) }))} />}
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      {bloco('🛍️ Vendedor do ano', vend, brl)}
      {bloco('💳 Caixa do ano', caixa, v => num(v) + ' cup')}
      {bloco('🛵 Entregador do ano', entr, v => num(v) + ' entr')}
    </div>
  );
}

// 🏆 Pódio dos 3 dias com mais venda do ano.
function PodioDias({ API }) {
  const [dias, setDias] = useState(null);
  const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  useEffect(() => { API.get('/faturamento/top-dias').then(r => setDias(r.data.dias || [])).catch(() => setDias([])); }, [API]);
  const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const top3 = (dias || []).slice(0, 3).map(x => ({ nome: x.dia.split('-').reverse().join('/').slice(0, 5) + ' ' + DOW[x.dow], val: brl(x.total) }));
  return (
    <div style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 10, padding: 12, height: '100%', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>🏆 Dias campeões de venda <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: 11.5 }}>· no ano</span></div>
      {dias === null ? <div style={{ fontSize: 12, color: '#999' }}>carregando…</div> : !top3.length ? <div style={{ fontSize: 12, color: '#aaa' }}>Sem dados.</div> : <Podio top3={top3} />}
    </div>
  );
}

// 👥 Quadro de pessoal por loja — funcionários × estágio num gráfico compacto (barras lado a lado).
function QuadroPessoal({ API, embutido }) {
  const [d, setD] = useState(null);
  useEffect(() => { API.get('/painel/quadro-pessoal').then(r => setD(r.data)).catch(() => setD(false)); }, [API]);
  const nomeCurto = n => (n || '').replace(/^Mutti\s*-\s*/i, '').replace(/^Ultra\s*-\s*/i, 'Ultra ').replace(/Posto de Medicamentos/i, 'Posto').trim();
  const ls = (d && d.lojas) || [];
  return (
    <div style={embutido ? {} : { background: '#fff', border: '1px solid #eef1f4', borderRadius: 10, padding: 12, marginTop: 12 }}>
      {!d ? <div style={{ fontSize: 12, color: '#999' }}>carregando…</div> : d === false || !ls.length ? <div style={{ fontSize: 12, color: '#aaa' }}>Sem dados.</div> :
        <div>
          <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .2, paddingBottom: 3, marginBottom: 2, borderBottom: '1px solid #f0f2f5' }}>
            <span style={{ color: '#2E5C9E' }}>Func.</span> · <span style={{ color: '#0E7C5A' }}>Estág.</span> por loja
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 1 }}>
            {ls.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, padding: '2px 0', gap: 6 }}>
                <span style={{ color: '#334', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={l.loja}>{nomeCurto(l.loja)}</span>
                <span style={{ whiteSpace: 'nowrap', fontWeight: 700 }}><span style={{ color: '#2E5C9E' }}>{l.func}</span><span style={{ color: '#cbd5e1' }}>·</span><span style={{ color: '#0E7C5A' }}>{l.estag}</span></span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '5px 0 0', borderTop: '2px solid #eef1f4', marginTop: 4, fontWeight: 800 }}>
            <span style={{ color: '#1c2a2e' }}>Total do grupo</span>
            <span style={{ whiteSpace: 'nowrap' }}><span style={{ color: '#2E5C9E' }}>{d.totalFunc}</span> func <span style={{ color: '#cbd5e1' }}>·</span> <span style={{ color: '#0E7C5A' }}>{d.totalEstag}</span> estag</span>
          </div>
        </div>}
    </div>
  );
}

// 🏆 Rankings trimestrais no Painel da Gestão: Caixa Destaque + Fechamento do setor (dev. trimestral).
function RankingsTrimestre({ API }) {
  const hoje = new Date();
  const triAtual = Math.floor(hoje.getMonth() / 3) + 1;
  const [caixa, setCaixa] = useState(null);
  const [fech, setFech] = useState(null);
  const [setor, setSetor] = useState('tesouraria');
  const [setores, setSetores] = useState([]);
  useEffect(() => { API.get('/tesouraria/pontos/ranking', { params: { ano: hoje.getFullYear(), tri: triAtual } }).then(r => setCaixa(r.data.ranking || [])).catch(() => setCaixa([])); }, [API]); // eslint-disable-line
  useEffect(() => { API.get('/diretoria/rank-trimestral', { params: { ano: hoje.getFullYear(), tri: triAtual, setor } }).then(r => { setFech(r.data.linhas || []); if (r.data.setores) setSetores(r.data.setores); }).catch(() => setFech([])); }, [API, setor]); // eslint-disable-line
  const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR');
  const box = { background: '#fff', border: '1px solid #eef1f4', borderRadius: 10, padding: 12, flex: '1 1 300px' };
  const caixaTop = (caixa || []).filter(o => !o.desclassificado).slice(0, 3).map(o => ({ nome: o.operador || o.nome, val: (o.total ?? 0) + ' pts' }));
  const fechTop = (fech || []).slice(0, 3).map(l => ({ nome: l.nome, val: brl(l.premioTri) }));
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <div style={box}>
        <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>🏆 Caixa Destaque <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: 11.5 }}>· {triAtual}º tri</span></div>
        {caixa === null ? <div style={{ fontSize: 12, color: '#999' }}>carregando…</div> : !caixaTop.length ? <div style={{ fontSize: 12, color: '#aaa' }}>Sem dados no trimestre.</div> : <Podio top3={caixaTop} />}
      </div>
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 800 }}>📋 Fechamento do setor <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: 11.5 }}>· {triAtual}º tri</span></span>
          <select value={setor} onChange={e => setSetor(e.target.value)} style={{ marginLeft: 'auto', fontSize: 11.5, padding: '3px 6px', border: '1px solid #ddd', borderRadius: 6 }}>
            {(setores.length ? setores : [{ id: 'tesouraria', nome: 'Tesouraria' }]).map(st => <option key={st.id} value={st.id}>{st.nome}</option>)}
          </select>
        </div>
        {fech === null ? <div style={{ fontSize: 12, color: '#999' }}>carregando…</div> : !fechTop.length ? <div style={{ fontSize: 12, color: '#aaa' }}>Sem dados no trimestre.</div> : <Podio top3={fechTop} />}
      </div>
    </div>
  );
}

// Pódio 2-1-3 (top 3) — 1º no centro mais alto.
function Podio({ top3 }) {
  const ordem = [top3[1], top3[0], top3[2]]; // exibe 2º · 1º · 3º
  const alt = [68, 96, 50]; const pos = [2, 1, 3]; const medal = ['🥈', '🥇', '🥉'];
  const bg = ['#F6D878', '#F2C01E', '#F6D878'];
  const firstName = n => (n || '').split(' ')[0];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8, marginTop: 6 }}>
      {ordem.map((p, i) => (
        <div key={i} style={{ flex: 1, maxWidth: 120, textAlign: 'center' }}>
          {p ? <>
            <div style={{ fontSize: 16 }}>{medal[i]}</div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#334', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.nome}>{firstName(p.nome)}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#8A6D3B', marginBottom: 3 }}>{p.val}</div>
            <div style={{ height: alt[i], background: bg[i], borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 8, color: '#fff', fontWeight: 800, fontSize: 24, boxShadow: 'inset 0 -3px 0 rgba(0,0,0,.06)' }}>{pos[i]}</div>
          </> : <div style={{ height: alt[i], background: '#f1f5f9', borderRadius: '8px 8px 0 0' }} />}
        </div>
      ))}
    </div>
  );
}

// 💰 Arrasto (empurra) do orçamento de Compras pendente de aprovação — compacto, só quando há pendência.
function AprovacoesArrasto({ API }) {
  const [d, setD] = useState(null);
  const MESN = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR');
  const carregar = useCallback(() => { API.get('/compras/orcamento/carry-pendentes').then(r => setD(r.data)).catch(() => setD({ pendentes: [] })); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const aprovar = (p) => API.post('/compras/orcamento/carry', { ano: p.ano, mes: p.mesNum, valor: p.valor, aprovado: true }).then(carregar).catch(e => alert(e.response?.data?.erro || 'Erro ao aprovar.'));
  const pend = (d && d.pendentes) || [];
  if (!pend.length) return null;
  return (
    <div style={{ ...s.card, borderLeft: `4px solid ${COR.amarelo}`, marginBottom: 14, padding: '10px 14px' }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>💰 Arrasto de orçamento de Compras a aprovar ({pend.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {pend.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#FCF7EA', border: '1px solid #F0E0BE', borderRadius: 9, padding: '7px 11px' }}>
            <b style={{ color: '#8A6D3B', minWidth: 72 }}>{MESN[p.mesNum]}/{String(p.ano).slice(2)}</b>
            <span style={{ fontSize: 13 }}>Arrasto <b style={{ color: COR.vermelho }}>{brl(p.valor)}</b></span>
            <span style={{ fontSize: 11, color: '#999' }}>orç. {brl(p.orcamento)} · compr. {brl(p.comprometido)}</span>
            <button onClick={() => aprovar(p)} style={{ marginLeft: 'auto', background: '#B7791F', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Aprovar</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// 🤝 Acordos comerciais pendentes de validação da Diretoria (o comprador registra, a diretoria valida).
function AcordosValidar({ API }) {
  const [itens, setItens] = useState(null);
  const carregar = useCallback(() => API.get('/compras/acordos', { params: { status: 'pendente' } }).then(r => setItens(r.data.itens || [])).catch(() => setItens([])), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const brl = v => v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const verEvidencia = (id) => API.get(`/compras/acordos/${id}/evidencia`, { responseType: 'blob' }).then(r => { const u = URL.createObjectURL(r.data); window.open(u, '_blank'); }).catch(() => alert('Sem evidência anexada.'));
  const decidir = (id, status) => { const obs = status === 'recusado' ? (window.prompt('Motivo da recusa (opcional):') || '') : ''; API.put(`/compras/acordos/${id}/validar`, { status, obs }).then(carregar).catch(e => alert(e.response?.data?.erro || 'Erro.')); };
  if (!itens || !itens.length) return null;
  return (
    <div style={{ ...s.card, borderLeft: `4px solid ${COR.amarelo}`, marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 2 }}>🤝 Acordos comerciais a validar ({itens.length})</div>
      <div style={{ fontSize: 11.5, color: '#888', marginBottom: 8 }}>O comprador registrou com evidência — valide para contar no indicador de Compras, ou recuse.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {itens.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#FCF7EA', border: '1px solid #F0E0BE', borderRadius: 10, padding: '8px 12px' }}>
            <div style={{ fontSize: 13 }}><b>{a.fornecedor}</b> · {brl(a.valor)}<div style={{ fontSize: 11, color: '#999' }}>{a.comprador_nome || a.comprador_id} · {String(a.mes).padStart(2, '0')}/{a.ano}{a.descricao ? ' · ' + a.descricao : ''}</div></div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {a.tem_evidencia ? <button onClick={() => verEvidencia(a.id)} style={{ ...s.comentarBtn2 }}>📎 evidência</button> : <span style={{ fontSize: 11, color: '#C0392B' }}>sem evidência</span>}
              <button onClick={() => decidir(a.id, 'validado')} style={{ background: '#1E874B', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Validar</button>
              <button onClick={() => decidir(a.id, 'recusado')} style={{ background: '#fff', color: '#C0392B', border: '1px solid #f1b4ab', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Recusar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// Grupo de um departamento: cabeçalho (dono + meta editáveis + semáforo consolidado) + suas áreas.
// Thread de comentários de um pilar (comentar + responder; direcionar abre tarefa p/ o responsável ver e responder).
function ComentarioThread({ API, pk, nComInit = 0, pessoas, onComentou }) {
  const [aberto, setAberto] = useState(false);
  const [coments, setComents] = useState(null);
  const [texto, setTexto] = useState('');
  const [dir, setDir] = useState('');
  const [aviso, setAviso] = useState('');
  const n = coments ? coments.length : nComInit;
  const recarregar = () => API.get('/painel/comentarios', { params: { key: pk } }).then(r => setComents(r.data.comentarios || []));
  const abrir = () => { const nv = !aberto; setAberto(nv); if (nv && !coments) recarregar().catch(() => setComents([])); };
  const enviar = () => {
    const t = texto.trim(); if (!t) return;
    API.post('/painel/comentarios', { key: pk, texto: t, direcionar_id: dir || undefined }).then(r => {
      setTexto('');
      if (r.data?.tarefa_id) { const p = (pessoas || []).find(x => x.id === dir); setAviso('✅ Tarefa aberta para ' + (p?.nome || 'a pessoa') + '.'); setTimeout(() => setAviso(''), 4000); }
      setDir(''); recarregar(); onComentou && onComentou();
    });
  };
  const apagar = id => API.delete(`/painel/comentarios/${id}`).then(() => { setComents(c => (c || []).filter(x => x.id !== id)); onComentou && onComentou(); }).catch(() => {});
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={abrir} style={s.comentarBtn}>💬 {n ? `${n} comentário${n > 1 ? 's' : ''} · responder` : 'Comentar / cobrar neste pilar'} {aberto ? '▲' : '▼'}</button>
      {aberto && <div style={{ marginTop: 8, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
        {coments === null ? <div style={{ fontSize: 12, color: '#999' }}>carregando…</div> :
          coments.length === 0 ? <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>Sem comentários. Deixe a primeira nota — direcione ao responsável e ele responde no Meu Setor.</div> :
            coments.map(c => (
              <div key={c.id} style={{ padding: '5px 0', borderTop: '1px solid #f6f6f6' }}>
                <div style={{ fontSize: 11.5 }}><b>{c.autor_nome}</b> <span style={{ color: '#bbb' }}>{c.autor_funcao ? `· ${c.autor_funcao} ` : ''}· {quando(c.criado_em)}</span>
                  <button onClick={() => apagar(c.id)} title="Apagar" style={{ float: 'right', border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
                <div style={{ fontSize: 12.5, color: '#444', whiteSpace: 'pre-wrap' }}>{c.texto}</div>
              </div>
            ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} placeholder="Escreva uma nota, cobrança, resposta…" style={{ flex: 1, minWidth: 150, border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 12.5 }} />
          <select value={dir} onChange={e => setDir(e.target.value)} title="Direcionar ao responsável (abre tarefa; ele vê e responde)" style={{ border: '1px solid #ddd', borderRadius: 8, padding: '7px 6px', fontSize: 11.5, maxWidth: 150, color: dir ? '#185FA5' : '#888' }}>
            <option value="">↗ Direcionar…</option>
            {(pessoas || []).map(p => <option key={p.id} value={p.id}>{p.nome}{p.funcao ? ` · ${p.funcao}` : ''}</option>)}
          </select>
          <button onClick={enviar} style={s.enviar}>{dir ? 'Enviar + tarefa' : 'Enviar'}</button>
        </div>
        {aviso && <div style={{ fontSize: 11, color: '#1E874B', marginTop: 4 }}>{aviso}</div>}
      </div>}
    </div>
  );
}

// Modal de detalhe do indicador (igual Meu Setor): o que significa, como é medido/calculado, referência.
function IndicadorModal({ ind, onClose }) {
  const fc = f => f === 'verde' ? COR.verde : f === 'amarelo' ? COR.amarelo : f === 'vermelho' ? COR.vermelho : '#64748b';
  const fmt = (v, u) => v == null ? '—' : (u === '%' ? (Math.round(v * 10) / 10) + '%' : u === 'dias' ? (Math.round(v * 10) / 10) + ' dias' : u === 'R$' || u === 'reais' ? 'R$ ' + Math.round(v).toLocaleString('pt-BR') : (Math.round(v * 10) / 10).toLocaleString('pt-BR'));
  const val = fmt(ind.realizado, ind.unidade);
  const alvo = ind.meta != null ? (ind.direcao === 'menor' ? '≤ ' : '≥ ') + fmt(ind.meta, ind.unidade) : 'sem meta cadastrada';
  const statusTxt = ind.semDados ? '⚪ Sem dados' : ind.semMeta || ind.meta == null ? '⚪ Sem meta' : ind.hit ? '✅ No alvo' : ind.farol === 'amarelo' ? '🟡 Na tolerância' : '🔴 Fora do alvo';
  const significa = ind.realizado == null ? 'Ainda não há dado no período para medir este indicador.'
    : ind.meta == null ? `O realizado no período é ${val}. Cadastre uma meta pra virar farol.`
      : ind.hit ? `Está no alvo: o realizado (${val}) está ${ind.direcao === 'menor' ? 'dentro do limite' : 'no mínimo exigido'} da meta (${alvo}).`
        : `Fora do alvo: o realizado (${val}) ${ind.direcao === 'menor' ? 'passou do limite' : 'ficou abaixo do piso'} da meta (${alvo})${ind.tol ? `, com tolerância de ±${ind.tol}` : ''}.`;
  const Bloco = ({ t, children }) => <div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .3, marginBottom: 2 }}>{t}</div><div style={{ fontSize: 13, color: '#334', lineHeight: 1.45 }}>{children}</div></div>;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(16,40,45,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 22, maxWidth: 560, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#1c2a2e' }}>{ind.nome}</div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>{ind.pilar || ''} · ⚙️ automático do sistema</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: ind.meta == null ? '#334' : fc(ind.farol) }}>{val}</div>
          <div style={{ fontSize: 13, color: '#555' }}>Meta {alvo}<br /><b style={{ color: fc(ind.farol) }}>{statusTxt}</b></div>
        </div>
        <Bloco t="O que significa">{significa}</Bloco>
        {ind.desc && <Bloco t="Como é medido">{ind.desc}</Bloco>}
        {ind.calc && <Bloco t="Como é calculado">{ind.calc}</Bloco>}
        {ind.acesso && <Bloco t="Onde acessar / de onde vem">{ind.acesso}</Bloco>}
        {ind.mercado && <Bloco t="Referência de mercado">{ind.mercado}</Bloco>}
        <div style={{ textAlign: 'right', marginTop: 6 }}><button onClick={onClose} style={{ background: '#0E7C5A', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>Fechar</button></div>
      </div>
    </div>
  );
}

// Card de um pilar — clica pra abrir os indicadores + comentar/cobrar/responder.
function PilarCard({ sx, p, API, cont, pessoas, onComentou }) {
  const [open, setOpen] = useState(false); // grid compacto: clica no pilar p/ abrir os indicadores (Joe)
  const [modalInd, setModalInd] = useState(null);
  const fc = f => f === 'verde' ? COR.verde : f === 'amarelo' ? COR.amarelo : f === 'vermelho' ? COR.vermelho : '#bbb';
  const c = fc(p.farol);
  const pk = `diretoria:${sx.key}:pilar:${slug(p.pilar)}`;
  const nCom = cont[pk]?.n || 0;
  return (
    <div style={{ background: '#fff', border: '1px solid #eef1f4', borderLeft: `3px solid ${c}`, borderRadius: 9, padding: '7px 9px' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{open ? '▾' : '▸'} {p.pilar}{nCom ? <span style={{ fontSize: 10, color: '#888', fontWeight: 600, marginLeft: 4 }}>💬{nCom}</span> : null}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: c }}>{p.nota != null ? p.nota : '—'}</span>
      </button>
      {open && <div style={{ marginTop: 8 }}>
        {(p.indicadores || []).length ? (p.indicadores || []).map((ind, j) => { const ci = fc(ind.farol); return (
          <div key={j} onClick={() => setModalInd(ind)} title="Ver explicação do indicador" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '4px 0', borderTop: '1px solid #f6f7f9', cursor: 'pointer' }}>
            <span style={{ color: '#556' }}>{ind.nome} <span style={{ color: '#c8d0d8', fontSize: 10 }}>ⓘ</span></span>
            <span style={{ fontWeight: 700, color: ci, whiteSpace: 'nowrap' }}>{ind.realizado != null ? ind.realizado : '—'}{ind.unidade === '%' ? '%' : ''}{ind.meta != null ? <span style={{ color: '#aab', fontWeight: 400 }}> / meta {ind.meta}{ind.unidade === '%' ? '%' : ''}</span> : null}</span>
          </div>
        ); }) : <div style={{ fontSize: 11.5, color: '#b0b7c0' }}>Sem indicadores apurados.</div>}
        <ComentarioThread API={API} pk={pk} nComInit={nCom} pessoas={pessoas} onComentou={onComentou} />
      </div>}
      {modalInd && <IndicadorModal ind={modalInd} onClose={() => setModalInd(null)} />}
    </div>
  );
}

function SetorGrupo({ sx, areas, API, cont, pessoas, onComentou }) {
  const cores = areas.map(pior);
  const rollup = cores.includes(COR.vermelho) ? COR.vermelho : cores.includes(COR.amarelo) ? COR.amarelo : cores.includes(COR.verde) ? COR.verde : '#ccd';
  return (
    <div style={{ background: '#fff', border: '1px solid #eef1f4', borderTop: `3px solid ${rollup}`, borderRadius: 10, padding: '9px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: rollup, flexShrink: 0 }} />
        <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sx.emoji} {sx.nome}</div>
      </div>
      {sx.key === 'gente' ? <QuadroPessoal API={API} embutido /> : (sx.pilares || []).length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sx.pilares.map((p, i) => <PilarCard key={i} sx={sx} p={p} API={API} cont={cont} pessoas={pessoas} onComentou={onComentou} />)}
        </div>
      ) : <div style={{ fontSize: 11.5, color: '#aab' }}>Sem pilares apurados neste mês.</div>}
    </div>
  );
}


// Chat do escritório (sala única da gestão) — poll a cada 8s
function ChatGestao({ API }) {
  const [msgs, setMsgs] = useState(null);
  const [eu, setEu] = useState(null);
  const [texto, setTexto] = useState('');
  const fimRef = useRef(null);
  const carregar = useCallback(() => API.get('/painel/chat').then(r => { setMsgs(r.data.mensagens || []); setEu(r.data.eu); }).catch(() => setMsgs([])), [API]);
  useEffect(() => { carregar(); const t = setInterval(carregar, 8000); return () => clearInterval(t); }, [carregar]);
  useEffect(() => { fimRef.current && fimRef.current.scrollIntoView(); }, [msgs]);
  const enviar = () => { const t = texto.trim(); if (!t) return; setTexto(''); API.post('/painel/chat', { texto: t }).then(carregar); };
  return (
    <div style={{ ...s.card, display: 'flex', flexDirection: 'column', maxHeight: 460 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#666', marginBottom: 6 }}>💬 Chat da Gestão <span style={{ fontWeight: 400, color: '#aaa' }}>· escritório</span></div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 180, background: '#F7F9FB', borderRadius: 10, padding: 8 }}>
        {msgs === null ? <div style={{ fontSize: 12, color: '#999' }}>carregando…</div> :
          !msgs.length ? <div style={{ fontSize: 12, color: '#aaa' }}>Comece a conversa do escritório aqui. 👋</div> :
            msgs.map(m => { const meu = m.autor_id === eu; return (
              <div key={m.id} style={{ marginBottom: 7, textAlign: meu ? 'right' : 'left' }}>
                <div style={{ display: 'inline-block', maxWidth: '88%', background: meu ? '#185FA5' : '#fff', color: meu ? '#fff' : '#333', border: meu ? 'none' : '1px solid #e6e9ee', borderRadius: 12, padding: '6px 10px', textAlign: 'left' }}>
                  {!meu && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#185FA5' }}>{m.autor_nome}</div>}
                  <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{m.texto}</div>
                  <div style={{ fontSize: 9.5, opacity: 0.6, textAlign: 'right', marginTop: 1 }}>{quando(m.criado_em)}</div>
                </div>
              </div>
            ); })}
        <div ref={fimRef} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} placeholder="Mensagem…" style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 12.5 }} />
        <button onClick={enviar} style={s.enviar}>➤</button>
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1320, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  banner: { background: 'linear-gradient(120deg,#3A7BD5 0%,#185FA5 45%,#0E3E6E 100%)', color: '#fff', borderRadius: 18, padding: '22px 24px', marginBottom: 16, position: 'relative', overflow: 'hidden', boxShadow: '0 6px 22px rgba(14,62,110,.28)' },
  bannerArt: { position: 'absolute', right: 20, bottom: -10, fontSize: 120, opacity: 0.14, lineHeight: 1 },
  colunas: { display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  lateral: { flex: '1 1 250px', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 10 },
  centro: { flex: '2 1 460px', minWidth: 320 },
  lateralDir: { flex: '1 1 250px', maxWidth: 320, position: 'sticky', top: 10 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 0 },
  ir: { fontSize: 11.5, padding: '4px 10px', background: '#fff', color: '#2E5C9E', border: '1px solid #cdddef', borderRadius: 7, cursor: 'pointer' },
  comentarBtn: { fontSize: 12, padding: '5px 10px', background: '#F4F6F8', color: '#555', border: '1px solid #e6e9ee', borderRadius: 8, cursor: 'pointer', width: '100%', textAlign: 'left' },
  enviar: { fontSize: 12.5, padding: '7px 12px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  editar: { fontSize: 11, padding: '3px 9px', background: '#fff', color: '#666', border: '1px solid #dde3ea', borderRadius: 7, cursor: 'pointer', marginLeft: 4 },
  cfgInp: { width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 12.5, fontFamily: 'inherit' },
  comentarBtn2: { fontSize: 12.5, padding: '7px 12px', background: '#F4F6F8', color: '#555', border: '1px solid #e6e9ee', borderRadius: 8, cursor: 'pointer' },
};
