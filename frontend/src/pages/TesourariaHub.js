import React, { useState, useEffect, useCallback } from 'react';
import Banner from '../components/Banner';
import TesourariaCaixa from './TesourariaCaixa';
import Tesouraria from './Tesouraria';
import { CartaoDespesas } from './Contabilidade';
import { useAuth } from '../context/AuthContext';

// Hub da Tesouraria (Joe 2026-11-11) — um menu só, controle da GESTÃO (Financeiro).
// Conjunto ÚNICO de abas: o Fechamento do dia fica JUNTO com as apurações (Joe: "o fechamento do dia
// tinha que estar junto com essas apurações de fechamento"). Sem tarefa/cobrança pro operador.
// As apurações reusam a página antiga Tesouraria.js com tabFixa (sem barra de abas própria).

const NATIVAS = ['fechamento', 'orcamento', 'criterios', 'ranking'];
const ABAS = [
  ['fechamento', '📎 Fechamento do dia'],
  ['ranking', '🏆 Caixa Destaque'],
  ['quebras', '💸 Diferenças'],
  ['conferencia', '✅ Conferência'],
  ['cancelamentos', '🚫 Cancelamentos'],
  ['atendimento', '🧾 Atendimento do caixa'],
  ['indicadores', '📈 Setor'],
  ['debitos', '💵 Débitos por caixa'],
  ['criterios', '🏅 Critérios (pontos)'],
  ['orcamento', '💰 Orçamento loja'],
];

// Gestão/Financeiro vê tudo; o GERENTE (e subgerente) vê SÓ o Fechamento do dia — anexa as fotos e
// apenas VISUALIZA quem teve diferença; a apuração e o orçamento são da gestão (Joe 2026-11-11).
const GESTAO_TES = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Financeiro', 'Tesouraria', 'Supervisor'];

export default function TesourariaHub() {
  const { API, usuario } = useAuth();
  const ehGestao = GESTAO_TES.includes(usuario?.funcao);
  const abas = ehGestao ? ABAS : ABAS.filter(([k]) => k === 'fechamento');
  const [aba, setAba] = useState('fechamento');
  return (
    <div style={s.wrap}>
      <Banner emoji="🏦" titulo="Tesouraria" cor="roxo" sub={ehGestao ? 'Controle de caixa da gestão — fechamento do dia por loja junto com as apurações e o orçamento. Sem tarefa pro operador.' : 'Fechamento do dia — anexe os depósitos, despesas e recargas da sua loja e acompanhe os caixas e diferenças do dia.'} />
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 320 }}>
      {abas.length > 1 && <div style={s.tabs}>
        {abas.map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)} style={{ ...s.tab, ...(aba === k ? s.tabOn : {}) }}>{l}</button>
        ))}
      </div>}
      <div style={{ marginTop: 14 }}>
        {aba === 'fechamento' && <TesourariaCaixa embed />}
        {aba === 'orcamento' && (
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <CartaoDespesas API={API} />
            <div style={{ height: 16 }} />
            <ConferenciaFiscalDespesas API={API} />
          </div>
        )}
        {aba === 'criterios' && ehGestao && <><CriteriosPontos API={API} /><div style={{ height: 14 }} /><HorarioMes API={API} /></>}
        {aba === 'ranking' && ehGestao && <CaixaDestaquePontos API={API} />}
        {!NATIVAS.includes(aba) && <Tesouraria embed soControle tabFixa={aba} />}
      </div>
      </div>
      {ehGestao && <LateralTesouraria API={API} onAba={setAba} />}
      </div>
    </div>
  );
}

// Lateral da Tesouraria (Joe 2026-11-11) — pendências do dia pro responsável: lojas com caixa fechado
// que ainda não anexaram depósito/despesa. Dados ao vivo do /dia-geral de hoje.
function LateralTesouraria({ API, onAba }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [g, setG] = useState(null);
  useEffect(() => { API.get('/tesouraria/dia-geral?data=' + hoje).then(r => setG(r.data.lojas || [])).catch(() => setG(null)); }, [API, hoje]);
  if (!g) return null;
  const comCaixa = g.filter(x => x.total_caixas > 0);
  const fechadas = comCaixa.filter(x => x.todos_fechados);
  const faltaDeposito = fechadas.filter(x => x.n_depositos === 0);
  const faltaDespesa = fechadas.filter(x => x.n_despesas === 0);
  const comDif = comCaixa.filter(x => x.n_relevantes > 0);
  return (
    <div style={{ width: 280, flexShrink: 0 }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, position: 'sticky', top: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>🏦 Minha área</div>
        <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 10 }}>Hoje · {hoje.split('-').reverse().join('/')}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={lt.stat}><div style={lt.statN}>{fechadas.length}/{comCaixa.length}</div><div style={lt.statL}>lojas fechadas</div></div>
          <div style={lt.stat}><div style={{ ...lt.statN, color: comDif.length ? '#b91c1c' : '#15803d' }}>{comDif.length}</div><div style={lt.statL}>c/ dif. relevante</div></div>
        </div>
        {faltaDeposito.length > 0 && <div style={{ ...lt.alerta, cursor: 'pointer' }} onClick={() => onAba('fechamento')}>
          <b style={{ color: '#b45309' }}>⚠️ Falta depósito ({faltaDeposito.length})</b>
          {faltaDeposito.slice(0, 6).map(x => <div key={x.loja_id} style={lt.item}>{x.loja_nome}</div>)}
        </div>}
        {faltaDespesa.length > 0 && <div style={{ ...lt.alerta, background: '#fff7f5', borderColor: '#f1b4ab', cursor: 'pointer' }} onClick={() => onAba('fechamento')}>
          <b style={{ color: '#A3372A' }}>🧾 Sem despesa anexada ({faltaDespesa.length})</b>
          {faltaDespesa.slice(0, 6).map(x => <div key={x.loja_id} style={lt.item}>{x.loja_nome}</div>)}
        </div>}
        {faltaDeposito.length === 0 && faltaDespesa.length === 0 && <div style={{ fontSize: 12.5, color: '#15803d', fontWeight: 600 }}>✅ Anexos do dia em dia.</div>}
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>Metas de tempo (conferência, lançamento) entram quando o fluxo de conferência registrar os horários.</div>
      </div>
    </div>
  );
}
const lt = {
  stat: { flex: 1, background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 10, padding: '7px 9px', textAlign: 'center' },
  statN: { fontSize: 17, fontWeight: 800, color: '#0f172a' },
  statL: { fontSize: 10.5, color: '#64748b' },
  alerta: { border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 10, padding: '8px 10px', fontSize: 12, marginBottom: 8 },
  item: { fontSize: 11.5, color: '#475569', marginTop: 2 },
};

// Critérios de PONTOS do Caixa Destaque (Joe 2026-11-11) — substitui a escala de nota + premiação R$250.
// Mostra claramente o que é AUTOMÁTICO (sai do ERP/ponto) e o que é AVULSO (lançado pela gestão).
// Valores configuráveis. Apuração TRIMESTRAL: o destaque de pontos do trimestre ganha (>= mínimo).
function CriteriosPontos({ API }) {
  const [regras, setRegras] = useState([]);
  const [minimo, setMinimo] = useState(30);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => {
    API.get('/tesouraria/pontos/regras').then(r => { setRegras(r.data.regras || []); if (r.data.minimo != null) setMinimo(r.data.minimo); }).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const setPt = (chave, v) => setRegras(rs => rs.map(r => r.chave === chave ? { ...r, pontos: v } : r));
  const setAtivo = (chave, v) => setRegras(rs => rs.map(r => r.chave === chave ? { ...r, ativo: v ? 1 : 0 } : r));
  const salvar = () => API.put('/tesouraria/pontos/regras', { regras: regras.map(r => ({ chave: r.chave, pontos: Number(r.pontos) || 0, desclassifica: r.desclassifica, ativo: r.ativo !== 0 })), minimo: Number(minimo) || 0 })
    .then(() => { setMsg('✅ Critérios salvos.'); setTimeout(() => setMsg(''), 2500); carregar(); }).catch(() => { setMsg('⚠️ Erro ao salvar.'); setTimeout(() => setMsg(''), 3000); });
  const AUTO = { bg: '#eaf4ff', cor: '#1d4ed8', txt: '⚙️ Automático' };
  const MAN = { bg: '#fdf0e6', cor: '#b45309', txt: '✍️ Avulso' };
  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>🏅 Critérios de pontos — Caixa Destaque</div>
        <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 6px' }}>
          Cada critério vale X pontos (você ajusta). <b style={{ color: '#1d4ed8' }}>⚙️ Automático</b> = o sistema calcula (ERP/ponto do Tangerino). <b style={{ color: '#b45309' }}>✍️ Avulso</b> = lançado pela gestão. A apuração é <b>trimestral</b>: o destaque de pontos do trimestre ganha.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 12px', fontSize: 13 }}>
          <span style={{ fontWeight: 700 }}>Ganha só com no mínimo</span>
          <input type="number" value={minimo} onChange={e => setMinimo(e.target.value)} style={{ width: 70, border: '1px solid #cbd5e1', borderRadius: 7, padding: '6px 8px', fontSize: 13 }} />
          <span style={{ color: '#64748b' }}>pontos no trimestre.</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '2px solid #eef1f4' }}>
              {['Critério', 'Como é apurado', 'Pontos', 'Ativo'].map(h => <th key={h} style={{ padding: '7px 8px' }}>{h}</th>)}
            </tr></thead>
            <tbody>{regras.map(r => { const b = r.tipo === 'auto' ? AUTO : MAN; return (
              <tr key={r.chave} style={{ borderTop: '1px solid #f2f2f2', opacity: r.ativo === 0 ? 0.5 : 1 }}>
                <td style={{ padding: '7px 8px', fontWeight: 600 }}>{r.label}</td>
                <td style={{ padding: '7px 8px' }}><span style={{ background: b.bg, color: b.cor, fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>{b.txt}</span></td>
                <td style={{ padding: '7px 8px' }}>
                  {r.desclassifica
                    ? <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: 12 }}>DESCLASSIFICA</span>
                    : <input type="number" value={r.pontos} onChange={e => setPt(r.chave, e.target.value)} style={{ width: 64, border: '1px solid #cbd5e1', borderRadius: 7, padding: '5px 7px', fontSize: 13, color: Number(r.pontos) < 0 ? '#b91c1c' : '#15803d', fontWeight: 700 }} />}
                </td>
                <td style={{ padding: '7px 8px' }}><input type="checkbox" checked={r.ativo !== 0} onChange={e => setAtivo(r.chave, e.target.checked)} /></td>
              </tr>
            ); })}</tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button onClick={salvar} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0d6b5e', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>💾 Salvar critérios</button>
          {msg && <span style={{ fontSize: 13, fontWeight: 600, color: msg.startsWith('⚠️') ? '#b91c1c' : '#15803d' }}>{msg}</span>}
        </div>
        <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 10 }}>Em breve: ranking por pontos do trimestre (com o critério que gerou cada ponto), lançamento avulso de pontos e de diferenças, e a apuração do destaque.</p>
      </div>
    </div>
  );
}

// Ranking do Caixa Destaque por PONTOS (trimestral) + lançamento avulso (Joe 2026-11-11).
function CaixaDestaquePontos({ API }) {
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [tri, setTri] = useState(Math.floor(agora.getMonth() / 3) + 1);
  const [d, setD] = useState(null);
  const [regras, setRegras] = useState([]);
  const [lanc, setLanc] = useState([]);
  const [f, setF] = useState({ operador_nome: '', regra_chave: 'avulso', pontos: '', data: new Date().toISOString().slice(0, 10), obs: '' });
  const [msg, setMsg] = useState('');
  const [exp, setExp] = useState(null);
  const carregar = useCallback(() => {
    API.get(`/tesouraria/pontos/ranking?ano=${ano}&tri=${tri}`).then(r => setD(r.data)).catch(() => setD(null));
    API.get(`/tesouraria/pontos/lancamentos?ano=${ano}&tri=${tri}`).then(r => setLanc(r.data.lancamentos || [])).catch(() => setLanc([]));
  }, [API, ano, tri]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/tesouraria/pontos/regras').then(r => setRegras(r.data.regras || [])).catch(() => {}); }, [API]);
  const setFF = (k, v) => setF(x => { const n = { ...x, [k]: v }; if (k === 'regra_chave') { const rg = regras.find(r => r.chave === v); n.pontos = rg ? rg.pontos : ''; } return n; });
  const lancar = () => {
    if (!f.operador_nome.trim()) { setMsg('⚠️ Informe o operador.'); setTimeout(() => setMsg(''), 2500); return; }
    API.post('/tesouraria/pontos/lancamento', { operador_nome: f.operador_nome, regra_chave: f.regra_chave, pontos: Number(f.pontos) || 0, data: f.data, obs: f.obs })
      .then(() => { setMsg('✅ Lançado.'); setF(x => ({ ...x, operador_nome: '', obs: '', pontos: f.regra_chave === 'avulso' ? '' : f.pontos })); carregar(); setTimeout(() => setMsg(''), 2000); })
      .catch(e => { setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro.')); setTimeout(() => setMsg(''), 3000); });
  };
  const remover = (id) => { if (!window.confirm('Remover este lançamento?')) return; API.delete('/tesouraria/pontos/lancamento/' + id).then(carregar); };
  const rk = d?.ranking || [];
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
        <label style={cd.lab}>Ano<input type="number" value={ano} onChange={e => setAno(e.target.value)} style={{ ...cd.inp, width: 90 }} /></label>
        <label style={cd.lab}>Trimestre<select value={tri} onChange={e => setTri(Number(e.target.value))} style={cd.inp}>{[1, 2, 3, 4].map(q => <option key={q} value={q}>{q}º tri</option>)}</select></label>
        {d && <span style={{ fontSize: 12, color: '#64748b' }}>Período {d.periodo?.ini} a {d.periodo?.fim} · ganha com ≥ <b>{d.minimo}</b> pts</span>}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>🏆 Ranking do trimestre</div>
        <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '0 0 8px' }}>Automático (ERP): diferença de caixa, erro de sangria e modalidade errada. Os positivos (agilidade, pontualidade na conferência etc.) entram por lançamento avulso abaixo. Clique no operador p/ ver o critério de cada ponto.</p>
        {!rk.length ? <div style={{ color: '#94a3b8', fontSize: 13, padding: 8 }}>Sem pontos no período.</div> :
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '2px solid #eef1f4' }}>
              {['#', 'Operador', 'Pontos', 'Situação'].map(h => <th key={h} style={{ padding: '7px 8px' }}>{h}</th>)}
            </tr></thead>
            <tbody>{rk.map((o, i) => (
              <React.Fragment key={o.operador}>
                <tr onClick={() => setExp(exp === o.operador ? null : o.operador)} style={{ borderTop: '1px solid #f2f2f2', cursor: 'pointer', background: o.elegivel ? '#f0fdf9' : '#fff' }}>
                  <td style={{ padding: '7px 8px', color: '#94a3b8' }}>{i + 1}</td>
                  <td style={{ padding: '7px 8px', fontWeight: 600 }}>{o.operador}</td>
                  <td style={{ padding: '7px 8px', fontWeight: 800, color: o.total >= 0 ? '#15803d' : '#b91c1c' }}>{o.total}</td>
                  <td style={{ padding: '7px 8px' }}>{o.desclassificado ? <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: 12 }}>DESCLASSIFICADO</span> : o.elegivel ? <span style={{ color: '#15803d', fontWeight: 700, fontSize: 12 }}>✅ elegível</span> : <span style={{ color: '#94a3b8', fontSize: 12 }}>abaixo do mínimo</span>}</td>
                </tr>
                {exp === o.operador && <tr><td colSpan={4} style={{ padding: '4px 8px 10px 32px', background: '#fafbfc' }}>
                  {o.criterios.map(c => <span key={c.chave} style={{ display: 'inline-block', margin: '3px 6px 3px 0', fontSize: 11.5, background: c.pontos < 0 ? '#fdecea' : '#eaf7ef', color: c.pontos < 0 ? '#b91c1c' : '#15803d', borderRadius: 999, padding: '2px 9px', fontWeight: 600 }}>{c.label}: {c.pontos > 0 ? '+' : ''}{c.pontos}{c.n > 1 ? ` (${c.n}×)` : ''}</span>)}
                </td></tr>}
              </React.Fragment>
            ))}</tbody>
          </table>
        </div>}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>✍️ Lançamento avulso de pontos</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={cd.lab}>Operador<input value={f.operador_nome} onChange={e => setFF('operador_nome', e.target.value)} style={{ ...cd.inp, minWidth: 200 }} placeholder="nome do operador" /></label>
          <label style={cd.lab}>Critério<select value={f.regra_chave} onChange={e => setFF('regra_chave', e.target.value)} style={{ ...cd.inp, minWidth: 180 }}><option value="avulso">Avulso (livre)</option>{regras.map(r => <option key={r.chave} value={r.chave}>{r.label}</option>)}</select></label>
          <label style={cd.lab}>Pontos<input type="number" value={f.pontos} onChange={e => setFF('pontos', e.target.value)} style={{ ...cd.inp, width: 80 }} /></label>
          <label style={cd.lab}>Data<input type="date" value={f.data} onChange={e => setFF('data', e.target.value)} style={cd.inp} /></label>
          <label style={cd.lab}>Obs.<input value={f.obs} onChange={e => setFF('obs', e.target.value)} style={{ ...cd.inp, minWidth: 160 }} /></label>
          <button onClick={lancar} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0d6b5e', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Lançar</button>
          {msg && <span style={{ fontSize: 13, fontWeight: 600, color: msg.startsWith('⚠️') ? '#b91c1c' : '#15803d' }}>{msg}</span>}
        </div>
        {lanc.length > 0 && <div style={{ marginTop: 10 }}>
          {lanc.map(l => <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0', borderTop: '1px solid #f3f4f6' }}>
            <span style={{ color: '#64748b', width: 82 }}>{(l.data || '').slice(0, 10).split('-').reverse().join('/')}</span>
            <b style={{ flex: 1 }}>{l.operador_nome}</b>
            <span style={{ color: '#64748b' }}>{l.regra_chave}</span>
            <span style={{ fontWeight: 700, color: l.pontos < 0 ? '#b91c1c' : '#15803d', width: 44, textAlign: 'right' }}>{l.pontos > 0 ? '+' : ''}{l.pontos}</span>
            <button onClick={() => remover(l.id)} style={{ border: 'none', background: 'none', color: '#b91c1c', cursor: 'pointer' }}>🗑</button>
          </div>)}
        </div>}
      </div>
    </div>
  );
}
const cd = {
  lab: { display: 'flex', flexDirection: 'column', fontSize: 11, color: '#64748b', gap: 3, fontWeight: 600 },
  inp: { border: '1px solid #cbd5e1', borderRadius: 7, padding: '7px 9px', fontSize: 13 },
};

const _brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// Conferência fiscal das despesas anexadas (Joe 2026-11-11) — o escritório valida fiscal × não-fiscal
// dentro do Orçamento loja, amarrando a despesa fotografada pelo gerente (com plano de contas) ao orçamento.
function ConferenciaFiscalDespesas({ API }) {
  const iniMes = new Date().toISOString().slice(0, 8) + '01';
  const hojeS = new Date().toISOString().slice(0, 10);
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  const [de, setDe] = useState(iniMes);
  const [ate, setAte] = useState(hojeS);
  const [d, setD] = useState(null);
  useEffect(() => { API.get('/tesouraria/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  const carregar = useCallback(() => {
    const qs = `de=${de}&ate=${ate}` + (loja ? `&loja=${loja}` : '');
    API.get('/tesouraria/despesas-fiscal?' + qs).then(r => setD(r.data)).catch(() => setD(null));
  }, [API, de, ate, loja]);
  useEffect(() => { carregar(); }, [carregar]);
  const validar = (id, fiscal) => API.post(`/tesouraria/anexos/${id}/fiscal`, { fiscal }).then(carregar).catch(() => {});
  const t = d?.total || {};
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>🧾 Conferência fiscal das despesas</div>
      <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 10px' }}>As despesas que o gerente anexou (com plano de contas). O escritório marca <b>fiscal</b> ou <b>não fiscal</b> aqui.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <label style={cd.lab}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={cd.inp}><option value="">Todas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        <label style={cd.lab}>De<input type="date" value={de} onChange={e => setDe(e.target.value)} style={cd.inp} /></label>
        <label style={cd.lab}>Até<input type="date" value={ate} onChange={e => setAte(e.target.value)} style={cd.inp} /></label>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={fc.box}><div style={fc.lab}>📄 Fiscais</div><div style={{ ...fc.val, color: '#15803d' }}>{_brl(t.vFiscal)}</div><div style={fc.sub}>{t.fiscal || 0} nota(s)</div></div>
        <div style={fc.box}><div style={fc.lab}>⚠️ Não fiscais</div><div style={{ ...fc.val, color: '#b45309' }}>{_brl(t.vNaoFiscal)}</div><div style={fc.sub}>{t.nao_fiscal || 0} recibo(s)</div></div>
        <div style={fc.box}><div style={fc.lab}>⏳ A conferir</div><div style={{ ...fc.val, color: '#64748b' }}>{_brl(t.vPendente)}</div><div style={fc.sub}>{t.pendente || 0} pendente(s)</div></div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '2px solid #eef1f4' }}>{['Data', 'Loja', 'Descrição', 'Plano de contas', 'Valor', 'Conferência'].map(h => <th key={h} style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>{(d?.despesas || []).map(x => (
            <tr key={x.id} style={{ borderTop: '1px solid #f3f4f6' }}>
              <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{String(x.data).slice(0, 10).split('-').reverse().join('/')}</td>
              <td style={{ padding: '6px 8px', color: '#64748b' }}>{x.loja}</td>
              <td style={{ padding: '6px 8px' }}>{x.descricao || '—'}{x.fiscal != null && <span style={{ fontSize: 10, color: '#94a3b8' }}> · OCR: {x.fiscal ? 'NF' : 'recibo'}</span>}</td>
              <td style={{ padding: '6px 8px', color: '#64748b' }}>{x.plano_contas || '—'}</td>
              <td style={{ padding: '6px 8px', fontWeight: 600 }}>{_brl(x.valor)}</td>
              <td style={{ padding: '6px 8px' }}>{x.fiscal_conf != null
                ? <span style={{ fontWeight: 700, color: x.fiscal_conf ? '#15803d' : '#b45309' }}>{x.fiscal_conf ? '✅ fiscal' : '❌ não fiscal'} <button onClick={() => validar(x.id, null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}>↺</button></span>
                : <span style={{ display: 'inline-flex', gap: 4 }}><button onClick={() => validar(x.id, true)} style={fc.btnF}>fiscal</button><button onClick={() => validar(x.id, false)} style={fc.btnN}>não fiscal</button></span>}</td>
            </tr>
          ))}</tbody>
        </table>
        {!(d?.despesas || []).length && <div style={{ fontSize: 13, color: '#94a3b8', padding: 8 }}>Nenhuma despesa anexada no período.</div>}
      </div>
    </div>
  );
}
const fc = {
  box: { flex: 1, minWidth: 150, background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 10, padding: '8px 11px' },
  lab: { fontSize: 11, color: '#64748b', fontWeight: 600 }, val: { fontSize: 17, fontWeight: 800 }, sub: { fontSize: 11, color: '#94a3b8' },
  btnF: { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 7, padding: '3px 8px', fontSize: 11, color: '#15803d', fontWeight: 600, cursor: 'pointer' },
  btnN: { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 7, padding: '3px 8px', fontSize: 11, color: '#b45309', fontWeight: 600, cursor: 'pointer' },
};

const MESES_N = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
// Horário padrão do mês (seg-sex) — base da pontualidade (cruza com o Tangerino).
function HorarioMes({ API }) {
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [h, setH] = useState({ entrada: '', saida_almoco: '', volta_almoco: '', saida: '', tolerancia_min: 5 });
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => {
    API.get(`/tesouraria/horario-mes?ano=${ano}&mes=${mes}`).then(r => setH({ entrada: r.data.entrada || '', saida_almoco: r.data.saida_almoco || '', volta_almoco: r.data.volta_almoco || '', saida: r.data.saida || '', tolerancia_min: r.data.tolerancia_min != null ? r.data.tolerancia_min : 5 })).catch(() => {});
  }, [API, ano, mes]);
  useEffect(() => { carregar(); }, [carregar]);
  const set = (k, v) => setH(x => ({ ...x, [k]: v }));
  const salvar = () => API.put('/tesouraria/horario-mes', { ano, mes, ...h }).then(() => { setMsg('✅ Horário salvo.'); setTimeout(() => setMsg(''), 2500); }).catch(() => { setMsg('⚠️ Erro.'); setTimeout(() => setMsg(''), 3000); });
  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>🕐 Horário padrão do mês (seg–sex)</div>
        <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 10px' }}>Base da <b>pontualidade</b>: o sistema compara a 1ª batida do Tangerino com este horário. Cadastre no começo do mês. Atraso de 10–15 min, 16–30 min e acima de 30 min seguem a pontuação dos Critérios.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={cd.lab}>Mês<select value={mes} onChange={e => setMes(Number(e.target.value))} style={cd.inp}>{MESES_N.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></label>
          <label style={cd.lab}>Ano<input type="number" value={ano} onChange={e => setAno(e.target.value)} style={{ ...cd.inp, width: 90 }} /></label>
          <label style={cd.lab}>Entrada<input type="time" value={h.entrada} onChange={e => set('entrada', e.target.value)} style={cd.inp} /></label>
          <label style={cd.lab}>Saída almoço<input type="time" value={h.saida_almoco} onChange={e => set('saida_almoco', e.target.value)} style={cd.inp} /></label>
          <label style={cd.lab}>Volta almoço<input type="time" value={h.volta_almoco} onChange={e => set('volta_almoco', e.target.value)} style={cd.inp} /></label>
          <label style={cd.lab}>Saída<input type="time" value={h.saida} onChange={e => set('saida', e.target.value)} style={cd.inp} /></label>
          <label style={cd.lab}>Tolerância (min)<input type="number" min="0" value={h.tolerancia_min} onChange={e => set('tolerancia_min', e.target.value)} style={{ ...cd.inp, width: 90 }} /></label>
          <button onClick={salvar} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0d6b5e', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>💾 Salvar</button>
          {msg && <span style={{ fontSize: 13, fontWeight: 600, color: msg.startsWith('⚠️') ? '#b91c1c' : '#15803d' }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '18px 20px', maxWidth: 1180, margin: '0 auto' },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  tab: { padding: '8px 14px', borderRadius: 9, border: '1px solid #e3e8ea', background: '#f3f7f6', color: '#334', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  tabOn: { background: 'linear-gradient(95deg,#0E7C5A,#0b6e59)', color: '#fff', borderColor: 'transparent' },
};
