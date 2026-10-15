import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const brl = v => (v == null ? '—' : (v < 0 ? '-' : '') + 'R$ ' + Math.abs(Math.round(v)).toLocaleString('pt-BR'));
const corRes = v => (v > 0 ? '#1E874B' : v < 0 ? '#C0392B' : '#7A8794');
const nav = id => window.dispatchEvent(new CustomEvent('mutti-nav', { detail: id }));

const dtBR = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');
// Checklist de fechamento mensal (controladoria) — validação com ciência + tarefa de análise.
const CHECKS = [
  { k: 'dre', l: 'DRE do mês fechada e conferida', ir: 'financeiro' },
  { k: 'orcado', l: 'Orçado × realizado revisado (desvios justificados)', ir: 'financeiro' },
  { k: 'quebras', l: 'Quebras de caixa conferidas e cobradas', ir: 'caixa' },
  { k: 'inadimplencia', l: 'Inadimplência / aging revisado', ir: 'contas-receber' },
  { k: 'compras', l: 'Orçamento de compras dentro do fluxo de caixa', ir: 'painel-compras' },
  { k: 'conciliacao', l: 'Conciliação de cartões e recebíveis', ir: 'conciliacao-cartao' },
];

export default function Controladoria() {
  const { API } = useAuth();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const compet = `${ano}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const [fech, setFech] = useState({});

  const carregar = useCallback(() => {
    setD(null); setErro('');
    API.get('/financeiro/confronto', { params: { ano } })
      .then(r => { if (r.data.ok) setD(r.data); else setErro(r.data.erro || 'ERP indisponível.'); })
      .catch(e => setErro(e.response?.data?.erro || 'Falha ao carregar.'));
  }, [API, ano]);
  useEffect(() => { carregar(); }, [carregar]);

  const carregarFech = useCallback(() => {
    API.get('/controladoria/fechamento', { params: { competencia: compet } }).then(r => setFech(r.data.itens || {})).catch(() => setFech({}));
  }, [API, compet]);
  useEffect(() => { carregarFech(); }, [carregarFech]);

  const validar = (k, v) => API.post('/controladoria/fechamento/validar', { competencia: compet, item_key: k, validar: v }).then(carregarFech).catch(() => {});
  const gerarTarefa = (k, titulo) => API.post('/controladoria/fechamento/tarefa', { competencia: compet, item_key: k, titulo }).then(carregarFech).catch(() => {});

  const dre = d?.dre?.resultado || [];
  const dfc = d?.dfc?.resultado || [];
  const dif = d?.diferenca || [];
  const soma = a => (a || []).reduce((x, v) => x + (v || 0), 0);
  const mesAtual = hoje.getMonth();
  const feitos = CHECKS.filter(c => fech[c.k]?.validado_em).length;

  return (
    <div style={s.wrap}>
      <Banner emoji="🔍" titulo="Controladoria" cor="azul"
        sub="Fechamento e auditoria de números: resultado (competência) × caixa (DFC), desvios e checklist do mês." >
        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ fontSize: 13, padding: '6px 10px', border: '1px solid rgba(255,255,255,.5)', borderRadius: 8, background: 'rgba(255,255,255,.15)', color: '#fff' }}>
          {[0, 1, 2].map(i => { const y = hoje.getFullYear() - i; return <option key={y} value={y} style={{ color: '#333' }}>{y}</option>; })}
        </select>
      </Banner>

      {erro && <div style={{ ...s.card, background: '#FCEBEB', borderColor: '#F09999', color: '#8f2a2a' }}>⚠️ {erro}</div>}

      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 12 }}>
            {[['Resultado (DRE)', soma(dre), 'lucro do ano, competência'], ['Caixa (DFC)', soma(dfc), 'entrou − saiu no ano'], ['Diferença', soma(dif), 'competência − caixa']].map(([l, v, sub]) => (
              <div key={l} style={s.tile}>
                <div style={{ fontSize: 11.5, color: '#888' }}>{l}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: corRes(v) }}>{brl(v)}</div>
                <div style={{ fontSize: 10.5, color: '#aaa' }}>{sub}</div>
              </div>
            ))}
          </div>

          <div style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Resultado × Caixa por mês</div>
            <div className="tabela-rolavel">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead><tr>
                  <th style={s.th}>Mês</th><th style={{ ...s.th, textAlign: 'right' }}>Resultado (DRE)</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Caixa (DFC)</th><th style={{ ...s.th, textAlign: 'right' }}>Diferença</th>
                </tr></thead>
                <tbody>
                  {MESES.map((m, i) => (
                    <tr key={m} style={i === mesAtual ? { background: '#E6F1FB' } : undefined}>
                      <td style={s.td}>{m}{i === mesAtual ? ' ●' : ''}</td>
                      <td style={{ ...s.td, textAlign: 'right', color: corRes(dre[i] || 0), fontWeight: 600 }}>{brl(dre[i] || 0)}</td>
                      <td style={{ ...s.td, textAlign: 'right', color: corRes(dfc[i] || 0) }}>{brl(dfc[i] || 0)}</td>
                      <td style={{ ...s.td, textAlign: 'right', color: corRes(dif[i] || 0) }}>{brl(dif[i] || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>Diferença positiva = lucro que ainda não virou caixa (recebíveis a entrar). Negativa = caixa consumido além do resultado (pagamentos/estoque).</div>
          </div>
        </>
      )}

      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>✅ Checklist de fechamento — {MESES[hoje.getMonth()]}/{ano}</div>
          <span style={{ fontSize: 12, fontWeight: 700, color: feitos === CHECKS.length ? '#1E874B' : '#BA7517' }}>{feitos}/{CHECKS.length}</span>
        </div>
        {CHECKS.map(c => {
          const st = fech[c.k] || {};
          const validado = !!st.validado_em;
          const temTarefa = !!st.tarefa_id;
          const tarefaAberta = temTarefa && st.tarefa_status !== 'concluido';
          return (
            <div key={c.k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #f5f5f5', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15 }}>{validado ? '✅' : tarefaAberta ? '📋' : '⬜'}</span>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 13, color: validado ? '#777' : '#333' }}>{c.l}</div>
                {validado ? <div style={{ fontSize: 11, color: '#1E874B' }}>validado por {st.validado_por} · {dtBR(st.validado_em)}</div>
                  : tarefaAberta ? <div style={{ fontSize: 11, color: '#BA7517' }}>análise em aberto no painel de Tarefas</div> : null}
              </div>
              <button onClick={() => nav(c.ir)} style={s.link}>abrir ↗</button>
              {!validado && !temTarefa && <button onClick={() => gerarTarefa(c.k, `Fechamento ${compet} — ${c.l}`)} style={s.link}>📋 gerar análise</button>}
              {validado
                ? <button onClick={() => validar(c.k, false)} style={s.link}>reabrir</button>
                : <button onClick={() => validar(c.k, true)} style={s.btnValidar}>✓ Validar</button>}
            </div>
          );
        })}
        <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>Competência {compet}. <b>Validar</b> registra a ciência (quem + quando) e conclui a tarefa de análise, se houver. <b>Gerar análise</b> cria uma tarefa no painel de Tarefas.</div>
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 900, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  tile: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px' },
  th: { textAlign: 'left', fontSize: 11, color: '#888', padding: '6px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', borderBottom: '1px solid #f5f5f5' },
  link: { fontSize: 11.5, padding: '4px 9px', border: '1px solid #ddd', borderRadius: 7, background: '#fff', color: '#185FA5', cursor: 'pointer', fontWeight: 600 },
  btnValidar: { fontSize: 11.5, padding: '4px 11px', border: 'none', borderRadius: 7, background: '#1E874B', color: '#fff', cursor: 'pointer', fontWeight: 700 },
};
