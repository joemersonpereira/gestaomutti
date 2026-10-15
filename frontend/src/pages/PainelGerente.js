import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const corNota = n => (n == null ? '#999' : n >= 90 ? '#3B6D11' : n >= 75 ? '#BA7517' : '#993C1D');
const corPct = p => (p == null ? '#999' : p >= 100 ? '#3B6D11' : p >= 90 ? '#BA7517' : '#993C1D');
const brl = v => (v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR'));
const numBR = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR'));

// Visão inicial da loja (topo): total de vendas, quebra por grupo e informações do ERP.
function VisaoLojaCard({ loja, mes, ano, rv, grupos, iv }) {
  const g = grupos || {};
  const totalG = g.total || 0;
  const info = (val, label) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#334' }}>{val}</div>
      <div style={{ fontSize: 9, color: '#999' }}>{label}</div>
    </div>
  );
  return (
    <div style={{ ...s.card, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>🏪 Visão da loja — {loja}</div>
          <div style={{ fontSize: 11, color: '#999' }}>{String(mes).padStart(2, '0')}/{ano} · vendas ao vivo do ERP</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: corPct(rv && rv.pct) }}>{brl(rv && rv.vendido)}</div>
          <div style={{ fontSize: 11, color: '#666' }}>
            {rv && rv.pct != null && <span style={{ color: corPct(rv.pct), fontWeight: 600 }}>{rv.pct}% da meta</span>}
            {rv && rv.pct_super != null && <span> · {rv.pct_super}% da super</span>}
          </div>
        </div>
      </div>

      {/* Vendas por grupo (responsivo) */}
      {totalG > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(108px,1fr))', gap: 6, marginBottom: 10 }}>
          {Object.keys(GRUPOS_LABEL).filter(k => g[k] > 0).sort((a, b) => g[b] - g[a]).map(k => (
            <div key={k} style={{ background: '#F7FBFF', border: '1px solid #E6F1FB', borderRadius: 8, padding: '7px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#185FA5' }}>{brl(g[k])}</div>
              <div style={{ fontSize: 9, color: '#777' }}>{GRUPOS_LABEL[k]} · {Math.round((g[k] / totalG) * 100)}%</div>
            </div>
          ))}
        </div>
      )}

      {/* Informações da loja (não pontuam) */}
      {iv && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(96px,1fr))', gap: 6, borderTop: '1px dashed #eee', paddingTop: 8 }}>
          {info(numBR(iv.clientes), 'Nº clientes')}
          {info(brl(iv.ticket), 'Ticket médio')}
          {info(iv.cmv == null ? '—' : iv.cmv + '%', 'CMV')}
          {info(iv.rep_gensim == null ? '—' : iv.rep_gensim + '%', 'Rep. Gen/Sim')}
          {info(iv.rep_etico == null ? '—' : iv.rep_etico + '%', 'Rep. Ético')}
          {info(iv.identificacao == null ? '—' : iv.identificacao + '%', 'Identificação')}
          {info(iv.filipeta ? iv.filipeta.conversao + '%' : '—', 'Filipeta (conv.)')}
          {iv.filipeta && info(brl(iv.filipeta.totalVendido), 'Filipeta (vendas)')}
        </div>
      )}
    </div>
  );
}

const GRUPOS_LABEL = { generico: 'Genérico', similar: 'Similar', perfumaria: 'Perfumaria', varejo: 'Varejo', conveniencia: 'Conveniência', propagado: 'Propagado', vitaminas: 'Vitaminas', outros: 'Outros' };
const Chip = ({ label, val }) => (
  <span style={{ fontSize: 10, background: '#F0F4F8', border: '1px solid #E2E8F0', borderRadius: 6, padding: '2px 7px', color: '#334', whiteSpace: 'nowrap' }}>{label} <strong style={{ color: '#185FA5' }}>{val}</strong></span>
);
const INDIC_LABEL = { identificacao: 'Identif.', cadastro: 'Pdv+', pdv: 'Pdv+', pbm: 'PBM', vitaminas: 'Vitaminas', campanha: 'Campanhas', campanhas: 'Campanhas' };
// Valor formatado de um indicador do vendedor (% para identificação/pbm; un para o resto)
function valorInd(ind) {
  const v = ind.realizado == null ? 0 : ind.realizado;
  return ind.unidade === 'un' ? `${Number(v).toLocaleString('pt-BR')} un` : `${v}%`;
}

// Card de metas dos vendedores (meta + super da loja e de cada vendedor; indicadores + grupos ao clicar)
function MetasCard({ rv, mes, ano }) {
  const { API } = useAuth();
  const [aberto, setAberto] = useState(null);
  const [grupos, setGrupos] = useState({}); // colaborador_id -> {grupos} | 'loading'
  if (!rv) return null;

  function abrir(id) {
    if (aberto === id) { setAberto(null); return; }
    setAberto(id);
    if (grupos[id] === undefined) {
      setGrupos(g => ({ ...g, [id]: 'loading' }));
      API.get('/painel/vendedor-grupos', { params: { colaborador_id: id, mes, ano } })
        .then(r => setGrupos(g => ({ ...g, [id]: r.data.grupos })))
        .catch(() => setGrupos(g => ({ ...g, [id]: null })));
    }
  }

  return (
    <div style={s.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>🎯 Metas dos vendedores</div>
          <div style={{ fontSize: 11, color: '#999' }}>Vendido {brl(rv.vendido)} · Meta {brl(rv.meta)}{rv.super_meta ? ` · Super ${brl(rv.super_meta)}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 14, textAlign: 'right' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: corPct(rv.pct) }}>{rv.pct == null ? '—' : rv.pct + '%'}</div>
            <div style={{ fontSize: 10, color: '#999' }}>da meta</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: corPct(rv.pct_super) }}>{rv.pct_super == null ? '—' : rv.pct_super + '%'}</div>
            <div style={{ fontSize: 10, color: '#999' }}>da super</div>
          </div>
        </div>
      </div>
      {rv.pct != null && (
        <div style={{ height: 8, background: '#eee', borderRadius: 5, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ height: '100%', width: `${Math.min(100, rv.pct)}%`, background: corPct(rv.pct) }} />
        </div>
      )}

      {(rv.vendedores || []).length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhum vendedor com vendas neste período.</div>}
      {(rv.vendedores || []).length > 0 && !rv.total_vendedores_com_meta && <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>Sem meta individual lançada — listando a equipe pelas vendas. (Lance metas em Premiação &amp; Metas.)</div>}
      {rv.abaixo_count > 0 && <div style={{ fontSize: 11, color: '#993C1D', marginBottom: 6 }}>⚠️ {rv.abaixo_count} de {rv.total_vendedores_com_meta} abaixo da meta · clique num vendedor para ver as vendas por grupo</div>}
      {rv.total_vendedores_com_meta > 0 && rv.abaixo_count === 0 && <div style={{ fontSize: 12, color: '#3B6D11', marginBottom: 6 }}>🎉 Todos na meta! · clique num vendedor para ver as vendas por grupo</div>}

      {(rv.vendedores || []).map(v => {
        const exp = aberto === v.colaborador_id;
        const g = grupos[v.colaborador_id];
        return (
          <div key={v.colaborador_id} style={{ margin: '0 -8px', borderBottom: '1px solid #f5f5f5', background: v.abaixo ? '#FDF3F0' : 'transparent', borderRadius: 6 }}>
            <div onClick={() => !v.extra && abrir(v.colaborador_id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', cursor: v.extra ? 'default' : 'pointer' }}>
              <span style={{ fontSize: 13 }}>{v.extra ? '🧾' : v.meta > 0 ? (v.abaixo ? '🔻' : '✅') : '•'}</span>
              <div style={{ width: 190, flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{v.nome}</div>
                <div style={{ fontSize: 10, color: '#999' }}>{v.meta > 0 ? `${brl(v.vendido)} de ${brl(v.meta)}${v.super_meta ? ` · super ${brl(v.super_meta)}` : ''}` : v.extra ? `${brl(v.vendido)} · ${v.semVinculo ? 'venda no ERP (não vinculado ao cadastro)' : 'venda no ERP (fora da função vendedor)'}` : `${brl(v.vendido)} · sem meta individual`}</div>
              </div>
              {/* espaço do meio: TODOS os indicadores da pessoa (ERP + manual) */}
              <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {(v.indicadores && v.indicadores.length)
                  ? v.indicadores.map(ind => <Chip key={ind.indicador} label={INDIC_LABEL[ind.indicador] || ind.label} val={valorInd(ind)} />)
                  : (<>
                      {v.identificacao != null && <Chip label="Identif." val={v.identificacao + '%'} />}
                      {v.vitaminas != null && <Chip label="Vitaminas" val={v.vitaminas + ' un'} />}
                    </>)}
                {v.tarefas_abertas > 0 && (
                  <span style={{ fontSize: 10, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap', fontWeight: 700,
                    background: v.tarefas_atrasadas > 0 ? '#FDE7E2' : '#FFF6E5',
                    border: '1px solid ' + (v.tarefas_atrasadas > 0 ? '#F3B8AA' : '#F0DCB0'),
                    color: v.tarefas_atrasadas > 0 ? '#993C1D' : '#8A6D1D' }}>
                    📋 {v.tarefas_abertas} tarefa{v.tarefas_abertas > 1 ? 's' : ''}{v.tarefas_atrasadas > 0 ? ` · ${v.tarefas_atrasadas} atrasada${v.tarefas_atrasadas > 1 ? 's' : ''}` : ''}
                  </span>
                )}
                <span style={{ fontSize: 10, color: '#aaa' }}>{exp ? '▲ fechar' : '▾ grupos'}</span>
              </div>
              {/* premiação acumulada do colaborador */}
              <div style={{ textAlign: 'right', minWidth: 96, flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#3B6D11' }}>{brl(v.premiacao_total)}</div>
                <div style={{ fontSize: 9, color: '#999' }}>premiação{v.premiacao_pct != null ? ` · ${v.premiacao_pct}%` : ''}</div>
              </div>
              <div style={{ width: 70, height: 6, background: '#eee', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ height: '100%', width: `${Math.min(100, v.pct)}%`, background: corPct(v.pct) }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: corPct(v.pct), minWidth: 44, textAlign: 'right', flexShrink: 0 }}>{v.pct}%</span>
            </div>
            {exp && (
              <div style={{ padding: '4px 12px 12px 34px' }}>
                {/* Detalhe da premiação prevista do colaborador */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {[['Vendas', v.premiacao_valor, `${v.premiacao_pct}%`], ['Vitaminas', v.vitaminas_valor, `${v.vitaminas || 0} un`], ['Unid. vendidas', v.uv_valor, null], ['Total', v.premiacao_total, v.nota_indicadores != null ? `nota ${v.nota_indicadores}` : null]].map(([lab, val, sub], i) => (
                    <div key={i} style={{ background: i === 3 ? '#EEF6E8' : '#fff', border: '1px solid ' + (i === 3 ? '#CBE3B8' : '#eee'), borderRadius: 8, padding: '6px 10px', minWidth: 110 }}>
                      <div style={{ fontSize: 10, color: '#777' }}>{lab}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: i === 3 ? '#3B6D11' : '#185FA5' }}>{brl(val)}</div>
                      {sub && <div style={{ fontSize: 9, color: '#aaa' }}>{sub}</div>}
                    </div>
                  ))}
                </div>
                {v.tarefas_abertas > 0 && (
                  <div style={{ background: v.tarefas_atrasadas > 0 ? '#FDF3F0' : '#FFFBF2', border: '1px solid ' + (v.tarefas_atrasadas > 0 ? '#F3D8CF' : '#F0E6CC'), borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: v.tarefas_atrasadas > 0 ? '#993C1D' : '#8A6D1D', marginBottom: 4 }}>
                      📋 {v.tarefas_abertas} tarefa{v.tarefas_abertas > 1 ? 's' : ''} em aberto{v.tarefas_atrasadas > 0 ? ` · ${v.tarefas_atrasadas} atrasada${v.tarefas_atrasadas > 1 ? 's' : ''}` : ''}
                    </div>
                    {(v.tarefas_titulos || []).map((t, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#555', padding: '1px 0' }}>• {t}</div>
                    ))}
                    {v.tarefas_abertas > (v.tarefas_titulos || []).length && <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>+ {v.tarefas_abertas - v.tarefas_titulos.length} outra(s)</div>}
                  </div>
                )}
                {g === 'loading' && <div style={{ fontSize: 11, color: '#999' }}>Carregando vendas por grupo…</div>}
                {g === null && <div style={{ fontSize: 11, color: '#999' }}>Sem dados do ERP.</div>}
                {g && g !== 'loading' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 6 }}>
                    {Object.keys(GRUPOS_LABEL).filter(k => g[k] > 0).sort((a, b) => g[b] - g[a]).map(k => (
                      <div key={k} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 6, padding: '6px 8px' }}>
                        <div style={{ fontSize: 10, color: '#777' }}>{GRUPOS_LABEL[k]}</div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{brl(g[k])}</div>
                        <div style={{ fontSize: 9, color: '#aaa' }}>{g.total ? Math.round((g[k] / g.total) * 100) : 0}%</div>
                      </div>
                    ))}
                    {(!g.total) && <div style={{ fontSize: 11, color: '#999' }}>Sem vendas no período.</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PainelGerente({ lojaIdInicial, embutido } = {}) {
  const { API, usuario } = useAuth();
  const ehGestao = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const [d, setD] = useState(null);
  const [pilarAberto, setPilarAberto] = useState(null); // pilar expandido (mostra os indicadores dentro)
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState(lojaIdInicial || '');
  useEffect(() => { if (ehGestao && !embutido) API.get('/referencias/lojas').then(r => { const ls = r.data.lojas || []; setLojas(ls); setLojaId(id => id || (ls[0] && ls[0].id) || ''); }); }, [API, ehGestao, embutido]);
  const carregar = useCallback(() => {
    API.get('/painel/gerente', { params: lojaId ? { loja_id: lojaId } : {} }).then(r => setD(r.data)).catch(() => setD(false));
  }, [API, lojaId]);
  useEffect(() => { carregar(); }, [carregar]);
  if (d === null) return <div style={s.load}>Carregando painel…</div>;
  if (d === false) return <div style={s.card}>Não foi possível carregar o painel.</div>;

  return (
    <div style={embutido ? { fontFamily: 'system-ui, sans-serif' } : s.wrap}>
      {!embutido && <Banner emoji="📊" titulo="Painel do Gerente" cor="verde" sub={`${d.loja} · ${String(d.mes).padStart(2, '0')}/${d.ano}${ehGestao ? ' · você está vendo como o gerente desta loja' : ''}`}>
        {ehGestao && lojas.length > 0 && (
          <select value={lojaId} onChange={e => setLojaId(e.target.value)} style={{ fontSize: 13, padding: '6px 10px', border: '1px solid rgba(255,255,255,.5)', borderRadius: 8, background: 'rgba(255,255,255,.15)', color: '#fff' }}>
            {lojas.map(l => <option key={l.id} value={l.id} style={{ color: '#333' }}>{l.nome}</option>)}
          </select>
        )}
      </Banner>}

      {/* Visão inicial da loja: total + por grupo + informações (topo) */}
      <VisaoLojaCard loja={d.loja} mes={d.mes} ano={d.ano} rv={d.resumo_vendas} grupos={d.vendas_grupos_loja} iv={d.indicadores_erp} />

      <div style={s.notaGeral}>
        <div>
          <div style={{ fontSize: 12, opacity: .7 }}>Nota geral</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: corNota(d.nota_geral) }}>{d.nota_geral}<span style={{ fontSize: 16, color: '#999' }}>/100</span></div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, opacity: .7 }}>Premiação</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: d.premio_pct > 0 ? '#3B6D11' : '#993C1D' }}>{d.premio_pct}%</div>
          <div style={{ fontSize: 11, color: '#999' }}>do salário</div>
        </div>
      </div>
      {d.indicadores_abaixo > 0 && (
        <div style={s.alerta}>⚠️ {d.indicadores_abaixo} indicador(es) abaixo do mínimo — tarefas de correção geradas no Kanban.</div>
      )}
      {d.ferias?.length > 0 && (
        <div style={{ background: '#FFF9EE', border: '1px solid #F0E0C0', borderRadius: 12, padding: '0.8rem 1rem', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>🌴 Fora hoje (férias / afastamento)</div>
          {d.ferias.map((f, i) => (
            <div key={i} style={{ fontSize: 12, color: '#555', padding: '2px 0' }}>
              {f.tipo === 'ferias' ? '🌴' : '🩺'} <strong>{f.nome}</strong> · {f.data_inicio}{f.data_fim ? ` a ${f.data_fim}` : ' (em aberto)'}
              {f.substituto_nome ? ` · substituto: ${f.substituto_nome}` : ''}
            </div>
          ))}
        </div>
      )}

      {/* Pilares clicáveis — clicar abre os indicadores daquele pilar logo abaixo */}
      <div style={{ fontSize: 11, color: '#999', margin: '2px 2px 6px' }}>Clique num pilar para ver seus indicadores.</div>
      <div style={s.pilarGrid}>
        {d.pilares.map(p => {
          const sel = pilarAberto === p.id;
          return (
            <div key={p.id} onClick={() => setPilarAberto(sel ? null : p.id)}
              style={{ ...s.pilarCard, borderTop: `3px solid ${p.cor}`, cursor: 'pointer', boxShadow: sel ? `0 0 0 2px ${p.cor}` : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{p.nome}</span>
                <span style={{ fontSize: 11, color: '#999' }}>{p.peso}%</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: corNota(p.nota) }}>{p.nota ?? '—'}</div>
              <div style={{ fontSize: 10, color: sel ? p.cor : '#999' }}>
                {sel ? '▲ fechar' : '▾ ver indicadores'}{p.sem_dado > 0 ? ` · ${p.sem_dado} estimado(s)` : ''}
              </div>
            </div>
          );
        })}
      </div>

      {/* Indicadores do pilar selecionado (layout responsivo) */}
      {pilarAberto && (() => {
        const p = d.pilares.find(x => x.id === pilarAberto);
        if (!p) return null;
        return (
          <div style={{ ...s.card, borderLeft: `4px solid ${p.cor}`, marginTop: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: p.cor, marginBottom: 8 }}>{p.nome} · {p.peso}% — indicadores</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8 }}>
              {p.indicadores.map(i => (
                <div key={i.id} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '9px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: corNota(i.nota) }}>{i.nota ?? '—'}</span>
                    <span style={{ fontSize: 13 }}>{i.ok === true ? '✅' : i.ok === false ? '⚠️' : '➖'}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#444' }}>{i.nome}</div>
                  <div style={{ fontSize: 9, color: '#aaa' }}>mín. {i.min}{i.fonte === 'estimado' ? ' · estimado' : ''}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div style={{ marginTop: 10 }}>
        <MetasCard rv={d.resumo_vendas} mes={d.mes} ano={d.ano} />
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  load: { padding: 30, textAlign: 'center', color: '#666' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  notaGeral: { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1rem', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  alerta: { background: '#FAEEDA', borderLeft: '3px solid #BA7517', borderRadius: '0 8px 8px 0', padding: '8px 12px', fontSize: 12, color: '#854F0B', marginBottom: 10 },
  tabs: { display: 'flex', gap: 6, marginBottom: 12 },
  tab: { fontSize: 12, padding: '5px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666' },
  tabAtiva: { background: '#111', color: '#fff', borderColor: '#111' },
  pilarGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 },
  pilarCard: { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '1rem' },
  indRow: { display: 'flex', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f5f5f5' },
};
