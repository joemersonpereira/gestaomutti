import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';

const ESCALA = { bom: 1, regular: 0.5, ruim: 0 };
const corNota = n => (n == null ? '#999' : n >= 85 ? '#3B6D11' : n >= 75 ? '#BA7517' : '#993C1D');
const AVAL = [['bom', 'Bom'], ['regular', 'Regular'], ['ruim', 'Ruim'], ['np', 'N/P']];

export default function Conferentes() {
  const { API, usuario } = useAuth();
  const ehGestao = ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'Suporte'].includes(usuario.funcao);
  const [aba, setAba] = useState('ranking');
  const [dados, setDados] = useState({ ranking: [], criterios: [] });

  const carregar = useCallback(() => {
    API.get('/avaliacoes/ranking/func-conferente').then(r => setDados(r.data)).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div style={s.wrap}>
      <Banner emoji="📦" titulo="Conferentes" cor="laranja" sub="Avaliação e ranking dos conferentes" />

      {ehGestao && <PendenciasRecebimento API={API} usuario={usuario} />}

      <div style={s.tabs}>
        <button onClick={() => setAba('ranking')} style={{ ...s.tab, ...(aba === 'ranking' ? s.tabAtiva : {}) }}>Ranking</button>
        {ehGestao && <button onClick={() => setAba('avaliar')} style={{ ...s.tab, ...(aba === 'avaliar' ? s.tabAtiva : {}) }}>Checklist</button>}
        <button onClick={() => setAba('justif')} style={{ ...s.tab, ...(aba === 'justif' ? s.tabAtiva : {}) }}>Justificativas</button>
        {ehGestao && <button onClick={() => setAba('recebimento')} style={{ ...s.tab, ...(aba === 'recebimento' ? s.tabAtiva : {}) }}>📥 Recebimento (ERP)</button>}
      </div>

      {aba === 'ranking' && <Ranking dados={dados} usuario={usuario} />}
      {aba === 'avaliar' && ehGestao && <Avaliar API={API} dados={dados} onSaved={carregar} />}
      {aba === 'justif' && <JustificativasConf API={API} dados={dados} />}
      {aba === 'recebimento' && ehGestao && <RecebimentoErp API={API} usuario={usuario} />}
    </div>
  );
}

// Indicadores do conferente vindos do ERP (recebimento físico).
function RecebimentoErp({ API, usuario }) {
  const ehRede = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState(usuario.loja_id || '');
  const [d, setD] = useState(null);
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  useEffect(() => { if (ehRede) API.get('/referencias/lojas').then(r => { const ls = r.data.lojas || []; setLojas(ls); setLojaId(id => id || (ls[0] && ls[0].id) || ''); }); }, [API, ehRede]);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => { if (lojaId) API.get('/recebimento/conferentes', { params: { loja_id: lojaId, mes, ano } }).then(r => setD(r.data)).catch(() => setD(false)); }, [API, lojaId, mes, ano]);
  useEffect(() => { carregar(); }, [carregar]);
  const importar = c => { setMsg('Criando cadastro…'); API.post('/recebimento/conferentes/importar', { usuarioid: c.usuarioid, nome: c.nome, loja_id: lojaId }).then(r => { setMsg(r.data.criado ? `✅ ${c.nome} cadastrado como conferente.` : r.data.vinculado ? `✅ ${c.nome} vinculado ao ERP.` : `${c.nome} já tinha cadastro.`); carregar(); setTimeout(() => setMsg(''), 3000); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro'))); };
  const cor = n => n == null ? '#999' : n >= 90 ? '#3B6D11' : n >= 75 ? '#BA7517' : '#993C1D';
  const COLS = [
    { k: 'nome', label: 'Conferente', get: c => c.nome || '', tipo: 'txt' },
    { k: 'total', label: 'Recebimentos', get: c => c.total || 0, tipo: 'num', center: true },
    { k: 'erros_entrada_nota', label: 'Erros de entrada', get: c => c.erros_entrada_nota ?? -1, tipo: 'num', center: true },
    { k: 'recepcao_nota', label: 'Recepção de transporte', get: c => c.recepcao_nota ?? -1, tipo: 'num', center: true },
    { k: 'org_estoque_nota', label: 'Org. estoque', get: c => c.org_estoque_nota ?? -1, tipo: 'num', center: true },
    { k: 'nota_geral', label: 'Nota geral', get: c => c.nota_geral ?? -1, tipo: 'num', center: true },
  ];
  const { linhas, ordem, clicar, seta } = useOrdenavel(d?.conferentes, COLS, { col: 'nota_geral', dir: 'desc' });
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        {ehRede && lojas.length > 0 && <select value={lojaId} onChange={e => setLojaId(e.target.value)} style={s.campo}>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>}
        <select value={mes} onChange={e => setMes(+e.target.value)} style={s.campo}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}</select>
        <select value={ano} onChange={e => setAno(+e.target.value)} style={s.campo}>{[2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}</select>
      </div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Direto do ERP · <strong>Erros de entrada</strong> = % sem divergência (conferência × NF) · <strong>Recepção de transporte</strong> = % feita na chegada (não junto com o recebimento físico; batida = &lt; {d?.gap_batida_min || 5} min). Crie o cadastro dos conferentes p/ eles entrarem no <b>ranking e premiação</b>.</div>
      {msg && <div style={{ fontSize: 12.5, color: msg.startsWith('⚠️') ? '#993C1D' : '#2E6B45', marginBottom: 8 }}>{msg}</div>}
      {d === false && <div style={{ color: '#993C1D' }}>Não foi possível carregar (ERP indisponível?).</div>}
      {d && d.conferentes && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f7f9fb' }}>
            {COLS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={th} />)}<th style={th}>Cadastro</th>
          </tr></thead>
          <tbody>
            {linhas.map(c => (
              <tr key={c.usuarioid} style={{ borderTop: '1px solid #f2f2f2', background: c.colaborador_id ? '#fff' : '#FFFCF5' }}>
                <td style={{ padding: '7px 6px' }}>{c.nome} <span style={{ color: '#bbb', fontSize: 11 }}>#{c.login}</span></td>
                <td style={tdc}>{c.total}</td>
                <td style={{ ...tdc, fontWeight: 700, color: cor(c.erros_entrada_nota) }}>{c.erros_entrada_nota == null ? '—' : c.erros_entrada_nota + '%'}</td>
                <td style={{ ...tdc, fontWeight: 700, color: cor(c.recepcao_nota) }} title={c.recepcao_nota != null ? `${c.batidas} de ${c.recep_total} batidas` : ''}>{c.recepcao_nota == null ? '—' : c.recepcao_nota + '%'}</td>
                <td style={{ ...tdc, fontWeight: 700, color: cor(c.org_estoque_nota) }}>{c.org_estoque_nota == null ? '—' : c.org_estoque_nota + '%'}</td>
                <td style={{ ...tdc, fontWeight: 800, color: cor(c.nota_geral) }}>{c.nota_geral == null ? '—' : c.nota_geral + '%'}</td>
                <td style={tdc}>{c.colaborador_id
                  ? <span style={{ color: '#3B6D11', fontWeight: 700, fontSize: 11.5 }}>✓ cadastrado{c.vinculadoPorNome ? '*' : ''}</span>
                  : <button onClick={() => importar(c)} style={{ fontSize: 11.5, padding: '4px 9px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>+ criar cadastro</button>}</td>
              </tr>
            ))}
            {!d.conferentes.length && <tr><td colSpan={7} style={{ padding: 12, color: '#999' }}>Sem recebimentos no período.</td></tr>}
          </tbody>
        </table>
      )}
      <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 6 }}>* vinculado por nome (sem erp_usuario_id gravado ainda). "Criar cadastro" gera o colaborador func-conferente com o vínculo do ERP; o RH completa CPF/dados depois em Colaboradores.</div>
    </div>
  );
}
const th = { padding: '8px 6px', fontSize: 11, color: '#777', textAlign: 'center' };
const tdc = { padding: '7px 6px', textAlign: 'center' };

// Painel operacional ao vivo: NFs pendentes de recepção de transporte + conferências em aberto.
function PendenciasRecebimento({ API, usuario }) {
  const ehRede = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState(ehRede ? 'todas' : (usuario.loja_id || ''));
  const [d, setD] = useState(null);
  useEffect(() => { if (ehRede) API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API, ehRede]);
  useEffect(() => {
    const params = ehRede ? { loja_id: lojaId } : {};
    API.get('/recebimento/pendencias', { params }).then(r => setD(r.data)).catch(() => setD(false));
  }, [API, lojaId, ehRede]);
  const COLS_LOJAS = [
    { k: 'loja', label: 'Loja', get: l => l.loja_nome || '', tipo: 'txt' },
    { k: 'sem_recepcao', label: 'Sem recepção', get: l => l.sem_recepcao || 0, tipo: 'num', center: true },
    { k: 'valor', label: 'Valor', get: l => l.valor_recepcao || 0, tipo: 'num', center: true },
    { k: 'conf_abertos', label: 'Conf. em aberto', get: l => l.conf_abertos || 0, tipo: 'num', center: true },
  ];
  const { linhas: linhasLojas, ordem: ordemLojas, clicar: clicarLojas, seta: setaLojas } = useOrdenavel(d?.lojas, COLS_LOJAS, { col: 'sem_recepcao', dir: 'desc' });
  if (d === false) return null;
  const t = d?.total;
  const fmtBrl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const rede = d?.escopo === 'rede';
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>📥 Pendências de recebimento <span style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>· ao vivo do ERP · últimos {d?.dias || 30} dias</span></div>
        {ehRede && (
          <select value={lojaId} onChange={e => setLojaId(e.target.value)} style={s.campo}>
            <option value="todas">Todas as lojas</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
        <div style={{ background: '#FDF3F0', border: '1px solid #F3D8CF', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: '#993C1D', fontWeight: 600 }}>Sem recepção de transporte</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#993C1D' }}>{t ? t.sem_recepcao : '—'}</div>
          <div style={{ fontSize: 10, color: '#B06A55' }}>notas · {fmtBrl(t?.valor_recepcao)} em mercadoria</div>
        </div>
        <div style={{ background: '#FFF8EC', border: '1px solid #F0E0C0', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: '#8A6D1D', fontWeight: 600 }}>Conferência em aberto</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#8A6D1D' }}>{t ? t.conf_abertos : '—'}</div>
          <div style={{ fontSize: 10, color: '#A08A4A' }}>recebimentos iniciados e não finalizados</div>
        </div>
      </div>
      {rede && d.lojas && d.lojas.length > 1 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 10 }}>
          <thead><tr style={{ background: '#f7f9fb' }}>
            {COLS_LOJAS.map(c => <ThOrd key={c.k} c={c} ordem={ordemLojas} clicar={clicarLojas} seta={setaLojas} base={th} />)}
          </tr></thead>
          <tbody>
            {linhasLojas.map(l => (
              <tr key={l.loja_id} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={{ padding: '6px' }}>{l.loja_nome}</td>
                <td style={{ ...tdc, fontWeight: 700, color: l.sem_recepcao > 0 ? '#993C1D' : '#3B6D11' }}>{l.sem_recepcao}</td>
                <td style={tdc}>{fmtBrl(l.valor_recepcao)}</td>
                <td style={{ ...tdc, fontWeight: 700, color: l.conf_abertos > 0 ? '#8A6D1D' : '#3B6D11' }}>{l.conf_abertos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ fontSize: 10, color: '#999', marginTop: 8 }}>Recepção de transporte = dar entrada da chegada da mercadoria na hora que o transportador entrega (tela "Recepção de Transporte"). Conferência em aberto = recebimento físico iniciado e ainda não finalizado.</div>
    </div>
  );
}

const INDIC_COR = pct => (pct == null ? '#999' : pct >= 90 ? '#3B6D11' : pct >= 75 ? '#BA7517' : '#993C1D');
const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Ranking({ dados, usuario }) {
  const [aberto, setAberto] = useState(null);
  const avaliados = dados.ranking.filter(r => r.avaliado);
  const media = avaliados.length ? Math.round(avaliados.reduce((a, r) => a + r.nota, 0) / avaliados.length) : null;
  const ac = dados.regra?.aceitavel ?? 90;
  return (
    <>
      <div style={s.metrics}>
        <M v={dados.ranking.length} l="Conferentes" />
        <M v={media ?? '—'} l="Nota média" c={corNota(media)} />
        <M v={dados.ranking.filter(r => r.nota != null && r.nota < 75).length} l="Com tarefa" c="#993C1D" />
      </div>
      <div style={{ fontSize: 11, color: '#666', margin: '0 0 8px 2px' }}>Checklist automático (ERP + gerente + devoluções) · clique no conferente para ver os indicadores, a premiação e as tarefas · premiação máxima a partir de <strong>{ac}%</strong>{dados.regra?.faixa1_valor ? ` (R$ ${dados.regra.faixa1_valor} / ${dados.regra.faixa2_valor} / ${dados.regra.faixa3_valor})` : ' — cadastre a regra em Cadastros › Premiação'}</div>
      {dados.ranking.length === 0 && <div style={s.card}>Nenhum conferente cadastrado.</div>}
      {dados.ranking.map((r, i) => {
        const ehVoce = r.colaborador_id === usuario?.id;
        const exp = aberto === r.colaborador_id;
        const inds = r.indicadores || [];
        return (
        <div key={r.colaborador_id} style={{ ...s.card, padding: 0, overflow: 'hidden', ...(ehVoce ? { border: '1.5px solid #185FA5' } : i === 0 && r.avaliado ? { border: '1.5px solid #FFD700' } : r.nota != null && r.nota < 75 ? { borderLeft: '3px solid #993C1D' } : {}) }}>
          <div onClick={() => setAberto(exp ? null : r.colaborador_id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}>
            <span style={{ fontSize: 16, width: 26, textAlign: 'center' }}>{i === 0 && r.avaliado ? '🥇' : i + 1}</span>
            <div style={{ width: 150, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.nome}{ehVoce ? ' (você)' : ''}</div>
              <div style={{ fontSize: 11, color: '#999' }}>{r.loja}</div>
            </div>
            {/* chips dos indicadores + tarefas (some em telas estreitas) */}
            <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {inds.map(ind => <Chip key={ind.indicador} label={ind.label} pct={ind.pct} manual={!!ind.avaliacao} />)}
              {r.tarefas_abertas > 0 && (
                <span style={{ fontSize: 10, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap', fontWeight: 700,
                  background: r.tarefas_atrasadas > 0 ? '#FDE7E2' : '#FFF6E5',
                  border: '1px solid ' + (r.tarefas_atrasadas > 0 ? '#F3B8AA' : '#F0DCB0'),
                  color: r.tarefas_atrasadas > 0 ? '#993C1D' : '#8A6D1D' }}>
                  📋 {r.tarefas_abertas}{r.tarefas_atrasadas > 0 ? ` · ${r.tarefas_atrasadas} atrasada${r.tarefas_atrasadas > 1 ? 's' : ''}` : ''}
                </span>
              )}
              <span style={{ fontSize: 10, color: '#aaa' }}>{exp ? '▲ fechar' : '▾ detalhes'}</span>
            </div>
            <div style={{ textAlign: 'right', minWidth: 96, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#3B6D11' }}>{brl(r.premiacao_total ?? r.premiacao)}</div>
              <div style={{ fontSize: 9, color: '#999' }}>premiação{r.comissao_itens_pct > 0 ? ` · +${r.comissao_itens_pct}% vendas` : ''}</div>
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: corNota(r.nota), minWidth: 40, textAlign: 'right' }}>{r.nota ?? '—'}</span>
          </div>
          {exp && (
            <div style={{ padding: '4px 14px 14px 48px', background: '#FAFBFC', borderTop: '1px solid #f0f0f0' }}>
              {/* Indicadores detalhados */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8, margin: '10px 0' }}>
                {inds.map(ind => (
                  <div key={ind.indicador} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#777', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{ind.label}</span><span style={{ color: '#bbb' }}>{ind.peso}pts</span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: INDIC_COR(ind.pct) }}>{ind.pct == null ? '—' : ind.pct + '%'}</div>
                    <div style={{ fontSize: 9, color: ind.avaliacao ? '#854F0B' : '#999' }}>{ind.avaliacao ? 'manual (override)' : ind.automatico ? 'automático' : 'manual'}</div>
                  </div>
                ))}
              </div>
              {/* Premiação */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '6px 12px', minWidth: 96 }}>
                  <div style={{ fontSize: 10, color: '#777' }}>Nota final</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: corNota(r.nota) }}>{r.nota ?? '—'}/100</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '6px 12px', minWidth: 96 }}>
                  <div style={{ fontSize: 10, color: '#777' }}>Premiação checklist</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#185FA5' }}>{brl(r.premiacao)}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '6px 12px', minWidth: 120 }} title={r.comissao_itens_base ? `${r.comissao_itens_pct}% sobre ${brl(r.comissao_itens_base)} de vendas` : 'Sem vendas no período'}>
                  <div style={{ fontSize: 10, color: '#777' }}>Comissão vendas {r.comissao_itens_pct > 0 ? `(${r.comissao_itens_pct}%)` : ''}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#185FA5' }}>{brl(r.comissao_itens_valor)}</div>
                  <div style={{ fontSize: 9, color: '#aaa' }}>{r.comissao_itens_base ? `base ${brl(r.comissao_itens_base)}` : (r.nota >= 80 ? 'sem vendas no mês' : 'nota < 80% → sem comissão')}</div>
                </div>
                <div style={{ background: '#EEF6E8', border: '1px solid #CBE3B8', borderRadius: 8, padding: '6px 12px', minWidth: 96 }}>
                  <div style={{ fontSize: 10, color: '#777' }}>Total</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#3B6D11' }}>{brl(r.premiacao_total ?? r.premiacao)}</div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#999', marginBottom: 8 }}>💡 Comissão de vendas escalona pela nota do checklist: 100% → 5% · ≥90% → 4% · ≥80% → 3% · abaixo → 0%. Incentiva o conferente a atender e crescer.</div>
              {/* Tarefas pendentes */}
              {r.tarefas_abertas > 0 ? (
                <div style={{ background: r.tarefas_atrasadas > 0 ? '#FDF3F0' : '#FFFBF2', border: '1px solid ' + (r.tarefas_atrasadas > 0 ? '#F3D8CF' : '#F0E6CC'), borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: r.tarefas_atrasadas > 0 ? '#993C1D' : '#8A6D1D', marginBottom: 4 }}>
                    📋 {r.tarefas_abertas} tarefa{r.tarefas_abertas > 1 ? 's' : ''} em aberto{r.tarefas_atrasadas > 0 ? ` · ${r.tarefas_atrasadas} atrasada${r.tarefas_atrasadas > 1 ? 's' : ''}` : ''}
                  </div>
                  {(r.tarefas_titulos || []).map((t, k) => <div key={k} style={{ fontSize: 11, color: '#555', padding: '1px 0' }}>• {t}</div>)}
                  {r.tarefas_abertas > (r.tarefas_titulos || []).length && <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>+ {r.tarefas_abertas - r.tarefas_titulos.length} outra(s)</div>}
                </div>
              ) : <div style={{ fontSize: 11, color: '#3B6D11' }}>✅ Sem tarefas pendentes.</div>}
              {r.nota != null && r.nota < 75 && <div style={s.tarefaBox}>⚠️ Abaixo de 75 — tarefa de desenvolvimento gerada para conferente + gerente.</div>}
              {r.nota >= 95 && <div style={s.conqBox}>⭐ Excelência — conquista automática!</div>}
            </div>
          )}
        </div>
        );
      })}
    </>
  );
}

const Chip = ({ label, pct, manual }) => (
  <span style={{ fontSize: 10, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap', background: '#F3F5F7', border: '1px solid #e6e9ec' }}>
    {label} <strong style={{ color: INDIC_COR(pct) }}>{pct == null ? '—' : pct + '%'}</strong>{manual ? ' ✎' : ''}
  </span>
);

function Avaliar({ API, dados, onSaved }) {
  const [sel, setSel] = useState('');
  const [resp, setResp] = useState({});      // override manual (só quando o chefe marca)
  const [info, setInfo] = useState({});      // { indicador: { auto, automatico } }
  const [msg, setMsg] = useState('');
  const criterios = dados.criterios || [];

  function escolher(id) {
    setSel(id); setMsg('');
    if (!id) { setResp({}); setInfo({}); return; }
    API.get(`/avaliacoes/${id}`, { params: { funcao: 'func-conferente' } }).then(r => {
      const e = {}, inf = {};
      r.data.indicadores.forEach(i => { e[i.indicador] = i.avaliacao || null; inf[i.indicador] = { auto: i.auto, automatico: i.automatico }; });
      setResp(e); setInfo(inf);
    });
  }
  // Ratio efetivo por critério: override manual se marcado; senão o % automático; senão sem dado (N/P).
  const ratioDe = c => {
    if (resp[c.indicador]) return ESCALA[resp[c.indicador]] ?? 0;
    const a = info[c.indicador]?.auto;
    return a != null ? a / 100 : null;
  };
  // Renormaliza: critério sem dado sai do denominador (não penaliza).
  let soma = 0, pesoPresente = 0;
  criterios.forEach(c => { const r = ratioDe(c); if (r != null) { soma += c.peso * r; pesoPresente += c.peso; } });
  const notaR = pesoPresente ? Math.round((soma / pesoPresente) * 100) : 0;
  const premio = notaR >= 95 ? 50 : notaR >= 85 ? 30 : notaR >= 75 ? 15 : 0;

  async function salvar() {
    if (!sel) { setMsg('Selecione o conferente.'); return; }
    // Só envia os overrides manuais que o chefe marcou (o resto fica automático)
    const manuais = {}; Object.entries(resp).forEach(([k, v]) => { if (v) manuais[k] = v; });
    const r = await API.post(`/avaliacoes/${sel}`, { avaliacoes: manuais, funcao: 'func-conferente' });
    setMsg(`✅ Salvo · nota ${r.data.nota}/100 · prêmio R$ ${r.data.premiacao},00` + (r.data.conquista ? ' · ⭐ conquista!' : '') + (r.data.tarefa_gerada ? ' · tarefa gerada' : ''));
    onSaved(); escolher(sel);
  }

  return (
    <div style={s.card}>
      <div style={{ fontSize: 11, color: '#666', background: '#F1F6EC', border: '1px solid #DCE8CE', borderRadius: 8, padding: '7px 10px', marginBottom: 10 }}>
        ⚙️ Checklist do conferente é <strong>100% automático</strong> — erros de entrada e recepção de transporte vêm do ERP, organização do estoque vem do Checklist Diário do gerente e devoluções do módulo de Devoluções. Marque manualmente só para <strong>sobrescrever</strong> um critério.
      </div>
      <div style={s.escalaInfo}>
        <span style={{ ...s.escItem, background: '#EAF3DE', color: '#3B6D11' }}>Bom = 100%</span>
        <span style={{ ...s.escItem, background: '#FAEEDA', color: '#854F0B' }}>Regular = 50%</span>
        <span style={{ ...s.escItem, background: '#FCEBEB', color: '#993C1D' }}>Ruim = 0%</span>
      </div>
      <select style={s.campo} value={sel} onChange={e => escolher(e.target.value)}>
        <option value="">Selecione o conferente…</option>
        {dados.ranking.map(r => <option key={r.colaborador_id} value={r.colaborador_id}>{r.nome} — {r.loja}</option>)}
      </select>

      {sel && criterios.map(c => {
        const nf = info[c.indicador] || {};
        const temAuto = nf.auto != null;
        const overridden = !!resp[c.indicador];
        return (
          <div key={c.indicador} style={s.critRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{c.label}</span>
              {nf.automatico && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: temAuto ? '#EAF3DE' : '#F0F0F0', color: temAuto ? '#3B6D11' : '#999' }}>
                  {temAuto ? `AUTO · ${nf.auto}%` : 'AUTO · sem dado'}
                </span>
              )}
              {overridden && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: '#FAEEDA', color: '#854F0B' }}>MANUAL</span>}
            </div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>{c.peso} pts</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {AVAL.map(([v, l]) => (
                <button key={v} onClick={() => setResp({ ...resp, [c.indicador]: v })}
                  style={{ ...s.opt, ...(resp[c.indicador] === v ? s[`sel_${v}`] : {}) }}>{l}</button>
              ))}
              {overridden && <button onClick={() => setResp({ ...resp, [c.indicador]: null })} title="Voltar ao automático" style={{ ...s.opt, color: '#993C1D' }}>↺ auto</button>}
            </div>
          </div>
        );
      })}

      {sel && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 8px' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Nota</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: corNota(notaR) }}>{notaR}/100 → R$ {premio},00</span>
          </div>
          {notaR < 75 && <div style={s.tarefaBox}>⚠️ Abaixo de 75 — vai gerar tarefa pro conferente + gerente.</div>}
          {notaR >= 95 && <div style={s.conqBox}>⭐ Excelente! Conquista automática.</div>}
          {msg && <div style={{ fontSize: 12, color: '#3B6D11', margin: '8px 0' }}>{msg}</div>}
          <button style={s.btn} onClick={salvar}>Salvar avaliação</button>
        </>
      )}
    </div>
  );
}

function JustificativasConf({ API, dados }) {
  const [lista, setLista] = useState([]);
  const ids = (dados.ranking || []).map(r => r.colaborador_id);
  useEffect(() => {
    API.get('/ocorrencias').then(r => {
      const oc = (r.data.ocorrencias || []).filter(o => ids.includes(o.colaborador_id) && o.status === 'contestada');
      setLista(oc);
    }).catch(() => {});
  }, [API]); // eslint-disable-line

  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Justificativas / contestações dos conferentes</div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>Quando um conferente contesta uma ocorrência, ela aparece aqui para o chefe do setor analisar (a decisão é feita na tela Ocorrências).</div>
      {lista.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Sem justificativas pendentes.</div>}
      {lista.map(o => (
        <div key={o.id} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
          <strong>{o.colaborador_nome}</strong> · {o.motivo} <span style={{ color: '#854F0B' }}>· contestada</span>
          {o.obs && <div style={{ fontSize: 11, color: '#999' }}>{o.obs}</div>}
        </div>
      ))}
    </div>
  );
}

const M = ({ v, l, c }) => <div style={s.metric}><div style={{ fontSize: 20, fontWeight: 700, color: c || '#111' }}>{v}</div><div style={{ fontSize: 11, color: '#666' }}>{l}</div></div>;

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  tabs: { display: 'flex', gap: 6, marginBottom: 12 },
  tab: { fontSize: 12, padding: '6px 14px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666' },
  tabAtiva: { background: '#111', color: '#fff', borderColor: '#111' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 },
  metric: { background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 10, textAlign: 'center' },
  campo: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', marginBottom: 8 },
  escalaInfo: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 12, textAlign: 'center' },
  escItem: { fontSize: 10, padding: '4px', borderRadius: 6 },
  critRow: { padding: '10px 0', borderBottom: '1px solid #f5f5f5' },
  opt: { flex: 1, fontSize: 11, padding: '5px 8px', border: '1px solid #ddd', borderRadius: 6, background: 'none', cursor: 'pointer', color: '#666' },
  sel_bom: { background: '#EAF3DE', color: '#3B6D11', borderColor: '#3B6D11' },
  sel_regular: { background: '#FAEEDA', color: '#854F0B', borderColor: '#BA7517' },
  sel_ruim: { background: '#FCEBEB', color: '#993C1D', borderColor: '#993C1D' },
  tarefaBox: { background: '#FAEEDA', borderLeft: '3px solid #BA7517', borderRadius: '0 6px 6px 0', padding: '6px 10px', marginTop: 6, fontSize: 11, color: '#633806' },
  conqBox: { background: '#EAF3DE', borderLeft: '3px solid #3B6D11', borderRadius: '0 6px 6px 0', padding: '6px 10px', marginTop: 6, fontSize: 11, color: '#1A4D00' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
};
