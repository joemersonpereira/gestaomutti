import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const hoje = new Date();
const corPts = p => (p >= 80 ? '#3B6D11' : p >= 60 ? '#BA7517' : '#993C1D');
const REGRAS = [
  ['Fechamento sem diferença', '+10'], ['Diferença até R$5,00', '+5'],
  ['Diferença R$5,01 a R$20,00', '-5'], ['Diferença R$20,01 a R$50,00', '-15'],
  ['Diferença acima de R$50,00', '-30'],
];

export default function Caixa() {
  const { API, usuario } = useAuth();
  const ehGestao = ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'Tesouraria'].includes(usuario.funcao);
  const ehCaixa = usuario.funcao === 'Caixa';
  const [aba, setAba] = useState('ranking');
  const [dados, setDados] = useState({ ranking: [], resumo: {} });
  const [det, setDet] = useState(null);

  const carregar = useCallback(() => { API.get('/caixa/ranking').then(r => setDados(r.data)).catch(() => {}); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  const abas = [['ranking', 'Ranking']];
  if (ehGestao || ehCaixa) abas.push(['lancar', 'Lançar']);
  abas.push(['regras', 'Regras']);
  if (ehCaixa) abas.push(['meu', 'Meu caixa']);

  return (
    <div style={s.wrap}>
      <Banner emoji="💰" titulo="Caixa Destaque" cor="roxo" sub="Ranking de caixas por pontos" />

      <div style={s.tabs}>
        {abas.map(([id, l]) => <button key={id} onClick={() => setAba(id)} style={{ ...s.tab, ...(aba === id ? s.tabAtiva : {}) }}>{l}</button>)}
      </div>

      {aba === 'ranking' && <Ranking dados={dados} det={det} setDet={setDet} />}
      {aba === 'lancar' && <Lancar API={API} dados={dados} ehGestao={ehGestao} usuario={usuario} onSaved={carregar} />}
      {aba === 'regras' && <Regras />}
      {aba === 'meu' && <Ranking dados={{ ...dados, ranking: dados.ranking.filter(r => r.colaborador_id === usuario.id) }} det={det} setDet={setDet} />}
    </div>
  );
}

function Ranking({ dados, det, setDet }) {
  const r = dados.resumo || {};
  return (
    <>
      <div style={s.metrics}>
        <M v={r.destaque ? r.destaque.split(' ')[0] : '—'} l="Destaque" c="#185FA5" />
        <M v={r.total_fechamentos ?? 0} l="Fechamentos" />
        <M v={r.acima_80 ?? 0} l="≥ 80 pts" c="#3B6D11" />
        <M v={r.total_conquistas ?? 0} l="Conquistas" c="#856404" />
      </div>
      {r.bonus_gerente > 0 && <div style={s.okBox}>🏆 Loja atingiu {r.total_conquistas} conquistas — gerente ganha +{r.bonus_gerente}pts no ranking trimestral!</div>}
      <div style={s.infoBox}>Conquistas da loja este mês: <strong>{r.total_conquistas ?? 0}/{r.meta_conquistas ?? 50}</strong></div>

      {dados.ranking.length === 0 && <div style={s.card}>Nenhum fechamento lançado neste mês.</div>}
      {dados.ranking.map((cx, i) => {
        const aberto = det === cx.colaborador_id;
        return (
          <div key={cx.colaborador_id} style={{ ...s.card, ...(i === 0 ? { border: '1.5px solid #FFD700' } : cx.tarefas > 0 ? { borderLeft: '3px solid #993C1D' } : {}), cursor: 'pointer' }}
            onClick={() => setDet(aberto ? null : cx.colaborador_id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16, width: 26, textAlign: 'center' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{cx.nome}</div>
                <div style={{ fontSize: 11, color: '#999' }}>Turno {cx.turno || '—'} · {cx.fechamentos} fechamentos</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: corPts(cx.pontos) }}>{cx.pontos}</div>
                <div style={{ fontSize: 10, color: '#999' }}>pontos</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ ...s.badge, ...(cx.pct >= 90 ? s.badgeOk : s.badgeWarn) }}>Acerto: {cx.pct}%</span>
              {cx.conquistas > 0 && <span style={{ ...s.badge, background: '#FFF3CD', color: '#856404' }}>⭐ {cx.conquistas} perfeitos</span>}
              {cx.tarefas > 0 && <span style={{ ...s.badge, background: '#FCEBEB', color: '#993C1D' }}>⚠️ {cx.tarefas} tarefa(s)</span>}
            </div>
            {aberto && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Histórico de fechamentos</div>
                {cx.dias.map((d, j) => (
                  <div key={j} style={s.diaRow}>
                    <span>{d.data?.slice(8, 10)}/{d.data?.slice(5, 7)}</span>
                    <span style={{ color: '#999' }}>Fat R$ {Number(d.faturamento).toFixed(2)}</span>
                    <span style={{ color: Number(d.diferenca) === 0 ? '#3B6D11' : '#993C1D' }}>
                      {Number(d.diferenca) === 0 ? 'sem dif (+10)' : `R$ ${Number(d.diferenca).toFixed(2)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function Lancar({ API, dados, ehGestao, usuario, onSaved }) {
  const [form, setForm] = useState({ colaborador_id: ehGestao ? '' : usuario.id, data: hoje.toISOString().slice(0, 10), turno: 'Manhã', faturamento: '', diferenca: '', observacao: '' });
  const [msg, setMsg] = useState('');
  async function salvar() {
    setMsg('');
    if (ehGestao && !form.colaborador_id) { setMsg('Selecione o caixa.'); return; }
    if (form.diferenca === '') { setMsg('Informe a diferença (0 se bateu).'); return; }
    try {
      const r = await API.post('/caixa', { ...form, faturamento: Number(form.faturamento) || 0, diferenca: Number(form.diferenca) });
      setMsg(`✅ Fechamento registrado (${r.data.pontos > 0 ? '+' : ''}${r.data.pontos} pts)` + (r.data.tarefa_gerada ? ' · ⚠️ diferença alta, tarefa gerada' : ''));
      setForm({ ...form, faturamento: '', diferenca: '', observacao: '' });
      onSaved();
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro ao registrar.'); }
  }
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Lançamento diário</div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>Diferenças acima de R$50 geram tarefa automática no Kanban.</div>
      {ehGestao && (
        <select style={s.campo} value={form.colaborador_id} onChange={e => setForm({ ...form, colaborador_id: e.target.value })}>
          <option value="">Selecione o caixa…</option>
          {dados.ranking.map(cx => <option key={cx.colaborador_id} value={cx.colaborador_id}>{cx.nome}</option>)}
        </select>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={s.campo} type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
        <select style={s.campo} value={form.turno} onChange={e => setForm({ ...form, turno: e.target.value })}>
          <option>Manhã</option><option>Tarde</option><option>Noite</option>
        </select>
      </div>
      <input style={s.campo} type="number" step="0.01" placeholder="Faturamento (R$)" value={form.faturamento} onChange={e => setForm({ ...form, faturamento: e.target.value })} />
      <input style={s.campo} type="number" step="0.01" placeholder="Diferença (R$) — 0 se bateu" value={form.diferenca} onChange={e => setForm({ ...form, diferenca: e.target.value })} />
      <input style={s.campo} placeholder="Observação (opcional)" value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} />
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginBottom: 8 }}>{msg}</div>}
      <button style={s.btn} onClick={salvar}>Salvar fechamento</button>
    </div>
  );
}

function Regras() {
  return (
    <>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>🎯 Sistema de pontos</div>
        {REGRAS.map(([d, p]) => (
          <div key={d} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
            <span>{d}</span><strong style={{ color: p.startsWith('+') ? '#3B6D11' : '#993C1D' }}>{p} pts</strong>
          </div>
        ))}
      </div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>🏆 Premiação trimestral</div>
        <div style={s.premRow}><span>🥇 1º lugar</span><strong>R$ 200 + folga + certificado</strong></div>
        <div style={s.premRow}><span>🥈 2º lugar</span><strong>R$ 150 + certificado</strong></div>
        <div style={s.premRow}><span>🥉 3º lugar</span><strong>R$ 75 + certificado</strong></div>
      </div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>⭐ Conquistas</div>
        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.7 }}>
          • Cada fechamento sem diferença conta como conquista.<br />
          • A cada 50 conquistas da loja, o gerente ganha +10 pts no ranking trimestral.
        </div>
      </div>
    </>
  );
}

const M = ({ v, l, c }) => <div style={s.metric}><div style={{ fontSize: 18, fontWeight: 700, color: c || '#111' }}>{v}</div><div style={{ fontSize: 11, color: '#666' }}>{l}</div></div>;

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  tabs: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  tab: { fontSize: 12, padding: '6px 14px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666' },
  tabAtiva: { background: '#111', color: '#fff', borderColor: '#111' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 },
  metric: { background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 10, textAlign: 'center' },
  campo: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', marginBottom: 8 },
  badge: { fontSize: 10, padding: '2px 8px', borderRadius: 6 },
  badgeOk: { background: '#EAF3DE', color: '#3B6D11' }, badgeWarn: { background: '#FAEEDA', color: '#854F0B' },
  okBox: { background: '#EAF3DE', borderLeft: '3px solid #3B6D11', borderRadius: '0 8px 8px 0', padding: '8px 12px', fontSize: 12, color: '#1A4D00', marginBottom: 10 },
  infoBox: { background: '#E6F1FB', borderLeft: '3px solid #185FA5', borderRadius: '0 8px 8px 0', padding: '8px 12px', fontSize: 12, color: '#185FA5', marginBottom: 10 },
  diaRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11, borderBottom: '1px solid #f7f7f7' },
  premRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
};
