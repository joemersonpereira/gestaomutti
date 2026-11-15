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
  ['metas', '🎯 Metas'],
  ['cancelamentos', '🚫 Cancelamentos'],
  ['atendimento', '🧾 Atendimento do caixa'],
  ['indicadores', '📈 Meu Setor'],
  ['debitos', '💵 Débitos por caixa'],
  ['criterios', '🏅 Critérios (pontos)'],
  ['orcamento', '💰 Orçamento loja'],
  ['saldos', '🏦 Saldos (banco)'],
];

// Gestão/Financeiro vê tudo; o GERENTE (e subgerente) vê SÓ o Fechamento do dia — anexa as fotos e
// apenas VISUALIZA quem teve diferença; a apuração e o orçamento são da gestão (Joe 2026-11-11).
const GESTAO_TES = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Financeiro', 'Tesouraria', 'Supervisor'];

export default function TesourariaHub() {
  const { API, usuario } = useAuth();
  const ehGestao = GESTAO_TES.includes(usuario?.funcao);
  const abas = ehGestao ? ABAS : ABAS.filter(([k]) => k === 'fechamento');
  const [aba, setAba] = useState('fechamento');
  const [lateral, setLateral] = useState(() => { try { return localStorage.getItem('tes_lateral') !== '0'; } catch (e) { return true; } });
  const [wide, setWide] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1120 : true);
  useEffect(() => { const f = () => setWide(window.innerWidth >= 1120); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const setLat = v => { setLateral(v); try { localStorage.setItem('tes_lateral', v ? '1' : '0'); } catch (e) { } };
  const shift = ehGestao && lateral && wide ? 320 : 0;
  return (
    <div style={{ ...s.wrap, paddingRight: shift, transition: 'padding-right .18s' }}>
      <Banner emoji="🏦" titulo="Tesouraria" cor="roxo" sub={ehGestao ? 'Controle de caixa da gestão — fechamento do dia por loja junto com as apurações e o orçamento. Sem tarefa pro operador.' : 'Fechamento do dia — anexe os depósitos, despesas e recargas da sua loja e acompanhe os caixas e diferenças do dia.'} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 12px' }}>
        <button onClick={() => setAba('fechamento')} style={{ ...s.atalho, ...(aba === 'fechamento' ? { borderColor: '#0E7C5A', color: '#0E7C5A', fontWeight: 700 } : {}) }}>📎 Anexar depósito / despesa</button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('mutti-nav', { detail: 'meurh' }))} style={s.atalho} title="Operador vê as próprias diferenças de caixa em Meu RH">📉 Minhas diferenças de caixa</button>
      </div>
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
      {ehGestao && <LateralTesouraria API={API} onAba={setAba} usuario={usuario} abas={ABAS} aba={aba} aberto={lateral} setAberto={setLat} />}
    </div>
  );
}

// Lateral da Tesouraria (Joe 2026-11-11) — MESMO padrão da lateral do Retail: recolhível (lembra a
// escolha), grade de botões das abas + cards de status (pendências de anexo do dia).
function LateralTesouraria({ API, onAba, usuario, abas, aba, aberto, setAberto }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [g, setG] = useState(null); const [metas, setMetas] = useState(null);
  useEffect(() => { if (aberto) {
    API.get('/tesouraria/dia-geral?data=' + hoje).then(r => setG(r.data.lojas || [])).catch(() => setG(null));
    API.get('/tesouraria/ciclos-fechamento?n=1').then(r => { const c = (r.data.ciclos || [])[0]; return API.get('/tesouraria/metas', { params: c ? { ini: c.ini, fim: c.fim } : {} }); }).then(r => setMetas(r.data)).catch(() => setMetas(null));
  } }, [API, hoje, aberto]);
  if (!aberto) return (
    <button onClick={() => setAberto(true)} style={{ position: 'fixed', right: 14, bottom: 18, zIndex: 41, display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(95deg,#0E7C5A,#0b6e59)', color: '#fff', border: 'none', borderRadius: 999, padding: '11px 18px', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,.25)' }}>🏦 Minha área</button>
  );
  const comCaixa = (g || []).filter(x => x.total_caixas > 0);
  const fechadas = comCaixa.filter(x => x.todos_fechados);
  const faltaDeposito = fechadas.filter(x => x.n_depositos === 0);
  const faltaDespesa = fechadas.filter(x => x.n_despesas === 0);
  const comDif = comCaixa.filter(x => x.n_relevantes > 0);
  return (
    <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 312, maxWidth: '92vw', overflowY: 'auto', zIndex: 41, background: '#fff', borderLeft: '1px solid #e3e8ea', boxShadow: '-6px 0 26px rgba(16,40,45,.10)', padding: 14 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div><div style={{ fontWeight: 800, fontSize: 14 }}>🏦 Minha área</div><div style={{ fontSize: 11.5, color: '#94a3b8' }}>Hoje · {hoje.split('-').reverse().join('/')}</div></div>
          <button onClick={() => setAberto(false)} title="Recolher" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18 }}>⟩</button>
        </div>
        {abas && abas.length > 1 && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 12 }}>
          {abas.map(([k, l]) => (
            <button key={k} onClick={() => onAba(k)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 9px', borderRadius: 10, border: '1px solid ' + (aba === k ? 'transparent' : '#e8edf0'), background: aba === k ? 'linear-gradient(95deg,#0E7C5A,#0b6e59)' : '#f7f9fa', color: aba === k ? '#fff' : '#334', fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>{l}</button>
          ))}
        </div>}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={lt.stat}><div style={lt.statN}>{fechadas.length}/{comCaixa.length}</div><div style={lt.statL}>lojas fechadas</div></div>
          <div style={lt.stat}><div style={{ ...lt.statN, color: comDif.length ? '#b91c1c' : '#15803d' }}>{comDif.length}</div><div style={lt.statL}>c/ dif. relevante</div></div>
        </div>
        {faltaDeposito.length > 0 && <div style={{ ...lt.alerta, cursor: 'pointer' }} onClick={() => onAba('fechamento')}>
          <b style={{ color: '#b45309' }}>⚠️ Falta depósito ({faltaDeposito.length})</b>
          {faltaDeposito.slice(0, 5).map(x => <div key={x.loja_id} style={lt.item}>{x.loja_nome}</div>)}
        </div>}
        {faltaDespesa.length > 0 && <div style={{ ...lt.alerta, background: '#fff7f5', borderColor: '#f1b4ab', cursor: 'pointer' }} onClick={() => onAba('fechamento')}>
          <b style={{ color: '#A3372A' }}>🧾 Sem despesa anexada ({faltaDespesa.length})</b>
          {faltaDespesa.slice(0, 5).map(x => <div key={x.loja_id} style={lt.item}>{x.loja_nome}</div>)}
        </div>}
        {g && faltaDeposito.length === 0 && faltaDespesa.length === 0 && <div style={{ fontSize: 12.5, color: '#15803d', fontWeight: 600 }}>✅ Anexos do dia em dia.</div>}

        {metas && metas.notaGeral != null && (() => {
          const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
          const minha = (metas.pessoas || []).find(p => p.colaborador_id === usuario?.id);
          return <div onClick={() => onAba('metas')} style={{ cursor: 'pointer', background: 'linear-gradient(135deg,#0E7C5A,#0b6e59)', color: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 12, opacity: .9 }}>🏆 {minha ? `Seu prêmio no ciclo` : 'Premiação do setor (ciclo)'}</div>
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{brl(minha ? minha.premioTotal : metas.premioTotalChefe)}</div>
            <div style={{ fontSize: 11.5, opacity: .9 }}>{minha ? `fator ${Math.round((minha.fator || 0) * 100)}% · ` : 'prêmio cheio (chefe) · '}nota geral {metas.notaGeral}/100</div>
          </div>;
        })()}

        {metas?.resumo && <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eef1f4' }}>
          <div onClick={() => onAba('metas')} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 6 }}>
            <b style={{ fontSize: 13 }}>🎯 Metas do setor</b>
            <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700 }}><span style={{ color: '#15803d' }}>🟢{metas.resumo.verde}</span> <span style={{ color: '#B7791F' }}>🟡{metas.resumo.amarelo}</span> <span style={{ color: '#C0392B' }}>🔴{metas.resumo.vermelho}</span></span>
          </div>
          {(metas.metas || []).filter(m => m.farol === 'vermelho').slice(0, 4).map(m => (
            <div key={m.chave} onClick={() => onAba('metas')} style={{ ...lt.item, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ color: '#C0392B' }}>🔴 {m.label}</span>
              <b style={{ color: '#C0392B' }}>{m.realizado == null ? '—' : (m.unidade === '%' ? m.realizado + '%' : m.realizado)}</b>
            </div>
          ))}
          {metas.resumo.vermelho === 0 && <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>✅ Metas no alvo.</div>}
          <div onClick={() => onAba('metas')} style={{ fontSize: 11, color: '#0d6b5e', cursor: 'pointer', marginTop: 4, fontWeight: 600 }}>ver todas →</div>
        </div>}
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
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  const [busca, setBusca] = useState('');
  const [nomes, setNomes] = useState([]);
  const [ciclo, setCiclo] = useState({ meses: 3, diaCorte: 1, periodos: 4 });
  const [cicloEdit, setCicloEdit] = useState(false); const [carreg, setCarreg] = useState(false);
  const [exp, setExp] = useState(null);
  const [f, setF] = useState({ operador_nome: '', regra_chave: 'avulso', pontos: '', data: new Date().toISOString().slice(0, 10), obs: '' });
  const [msg, setMsg] = useState('');
  const carregar = useCallback((forcar) => {
    setCarreg(true);
    API.get(`/tesouraria/pontos/ranking?ano=${ano}&tri=${tri}` + (loja ? `&loja=${loja}` : '') + (forcar ? '&forcar=1' : '')).then(r => setD(r.data)).catch(() => setD(null)).finally(() => setCarreg(false));
    API.get(`/tesouraria/pontos/lancamentos?ano=${ano}&tri=${tri}`).then(r => setLanc(r.data.lancamentos || [])).catch(() => setLanc([]));
  }, [API, ano, tri, loja]);
  useEffect(() => { carregar(); }, [carregar]);
  const atualizar = () => carregar(true);
  const carregarCiclo = useCallback(() => API.get('/tesouraria/pontos/ciclo').then(r => { setCiclo(r.data); if (r.data.atual) { setAno(r.data.atual.ano); setTri(r.data.atual.periodo); } }).catch(() => {}), [API]);
  useEffect(() => {
    API.get('/tesouraria/pontos/regras').then(r => setRegras(r.data.regras || [])).catch(() => {});
    API.get('/tesouraria/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {});
    API.get('/tesouraria/colaboradores-nomes').then(r => setNomes(r.data.nomes || [])).catch(() => {});
    carregarCiclo();
  }, [API, carregarCiclo]);
  const salvarCiclo = (meses, diaCorte) => API.put('/tesouraria/pontos/ciclo', { meses, diaCorte }).then(() => { setCicloEdit(false); carregarCiclo(); });
  const setFF = (k, v) => setF(x => { const n = { ...x, [k]: v }; if (k === 'regra_chave') { const rg = regras.find(r => r.chave === v); n.pontos = rg ? rg.pontos : ''; } return n; });
  const lancar = () => {
    if (!f.operador_nome.trim()) { setMsg('⚠️ Informe o operador.'); setTimeout(() => setMsg(''), 2500); return; }
    API.post('/tesouraria/pontos/lancamento', { operador_nome: f.operador_nome, regra_chave: f.regra_chave, pontos: Number(f.pontos) || 0, data: f.data, obs: f.obs })
      .then(() => { setMsg('✅ Lançado. Clique 🔄 Atualizar p/ refletir no ranking.'); setF(x => ({ ...x, operador_nome: '', obs: '', pontos: f.regra_chave === 'avulso' ? '' : f.pontos })); carregar(); setTimeout(() => setMsg(''), 3500); })
      .catch(e => { setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro.')); setTimeout(() => setMsg(''), 3000); });
  };
  const remover = (id) => { if (!window.confirm('Remover este lançamento?')) return; API.delete('/tesouraria/pontos/lancamento/' + id).then(carregar); };
  const rk = (d?.ranking || []).filter(o => !busca.trim() || (o.operador || '').toLowerCase().includes(busca.trim().toLowerCase()));
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
        <label style={cd.lab}>Ano<input type="number" value={ano} onChange={e => setAno(e.target.value)} style={{ ...cd.inp, width: 90 }} /></label>
        <label style={cd.lab}>Período<select value={tri} onChange={e => setTri(Number(e.target.value))} style={cd.inp}>{Array.from({ length: ciclo.periodos || 4 }, (_, i) => i + 1).map(q => <option key={q} value={q}>{q}º{ciclo.meses === 3 ? ' tri' : ciclo.meses === 1 ? ' mês' : ciclo.meses === 6 ? ' sem' : ciclo.meses === 12 ? ' (ano)' : ''}</option>)}</select></label>
        <label style={cd.lab}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={cd.inp}><option value="">Todas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        <label style={cd.lab}>🔍 Buscar nome<input value={busca} onChange={e => setBusca(e.target.value)} style={{ ...cd.inp, minWidth: 180 }} placeholder="operador" /></label>
        {d?.ciclo && <span style={{ fontSize: 12, color: '#64748b' }}>Apuração <b>{d.ciclo.label}</b> · ganha com ≥ <b>{d.minimo}</b> pts</span>}
        <button onClick={() => setCicloEdit(v => !v)} style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 10px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>⚙️ Ciclo</button>
      </div>
      {cicloEdit && <CicloDestaque ciclo={ciclo} onSalvar={salvarCiclo} onCancelar={() => setCicloEdit(false)} />}

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>✍️ Lançamento avulso de pontos</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={cd.lab}>Operador<input list="cdColabsDL" value={f.operador_nome} onChange={e => setFF('operador_nome', e.target.value)} style={{ ...cd.inp, minWidth: 220 }} placeholder="buscar na base…" /></label>
          <label style={cd.lab}>Critério<select value={f.regra_chave} onChange={e => setFF('regra_chave', e.target.value)} style={{ ...cd.inp, minWidth: 180 }}><option value="avulso">Avulso (livre)</option>{regras.map(r => <option key={r.chave} value={r.chave}>{r.label}</option>)}</select></label>
          <label style={cd.lab}>Pontos<input type="number" value={f.pontos} onChange={e => setFF('pontos', e.target.value)} style={{ ...cd.inp, width: 80 }} /></label>
          <label style={cd.lab}>Data<input type="date" value={f.data} onChange={e => setFF('data', e.target.value)} style={cd.inp} /></label>
          <label style={cd.lab}>Obs.<input value={f.obs} onChange={e => setFF('obs', e.target.value)} style={{ ...cd.inp, minWidth: 140 }} /></label>
          <button onClick={lancar} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0d6b5e', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Lançar</button>
          {msg && <span style={{ fontSize: 13, fontWeight: 600, color: msg.startsWith('⚠️') ? '#b91c1c' : '#15803d' }}>{msg}</span>}
        </div>
        <datalist id="cdColabsDL">{nomes.map(n => <option key={n} value={n} />)}</datalist>
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

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 2 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>🏆 Ranking do período</div>
          {d?.cache?.atualizado_em && <span style={{ fontSize: 11.5, color: '#94a3b8' }}>salvo em {String(d.cache.atualizado_em).slice(0, 16).replace('T', ' ')}</span>}
          <button onClick={atualizar} disabled={carreg} style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 12px', borderRadius: 7, border: '1px solid #0d6b5e', background: '#fff', color: '#0d6b5e', fontWeight: 700, cursor: carreg ? 'wait' : 'pointer' }}>{carreg ? '⏳ calculando…' : '🔄 Atualizar'}</button>
        </div>
        <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '0 0 8px' }}>Considera TODOS os critérios do período: diferença de caixa (faixas), erro de sangria, modalidade errada, venda/entrega na tela sem baixar, acerto de caixa (zero), pontualidade (Tangerino), agilidade (contato de desconto) e os lançamentos avulsos. Cada operador mostra o detalhe de onde vieram os pontos. Fica <b>salvo</b> — só recalcula no 🔄 Atualizar.</p>
        {carreg && !d ? <div style={{ color: '#94a3b8', fontSize: 13, padding: 8 }}>⏳ Calculando o ranking… (puxa do ERP/Tangerino, pode levar alguns segundos)</div> : !rk.length ? <div style={{ color: '#94a3b8', fontSize: 13, padding: 8 }}>Sem pontos no período.</div> :
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '2px solid #eef1f4' }}>
              {['#', 'Operador', 'Pontos', 'Situação'].map(h => <th key={h} style={{ padding: '7px 8px' }}>{h}</th>)}
            </tr></thead>
            <tbody>{rk.map((o, i) => (
              <React.Fragment key={o.operador}>
                <tr onClick={() => setExp(exp === o.operador ? null : o.operador)} style={{ borderTop: '1px solid #f2f2f2', cursor: 'pointer', background: o.elegivel ? '#f0fdf9' : '#fff' }}>
                  <td style={{ padding: '7px 8px', color: '#94a3b8' }}>{i + 1}</td>
                  <td style={{ padding: '7px 8px', fontWeight: 600 }}><span style={{ color: '#cbd5e1', marginRight: 4 }}>{exp === o.operador ? '▾' : '▸'}</span>{o.operador}</td>
                  <td style={{ padding: '7px 8px', fontWeight: 800, color: o.total >= 0 ? '#15803d' : '#b91c1c' }}>{o.total}</td>
                  <td style={{ padding: '7px 8px' }}>{o.desclassificado ? <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: 12 }}>DESCLASSIFICADO</span> : o.elegivel ? <span style={{ color: '#15803d', fontWeight: 700, fontSize: 12 }}>✅ elegível</span> : <span style={{ color: '#94a3b8', fontSize: 12 }}>abaixo do mínimo</span>}</td>
                </tr>
                {exp === o.operador && <tr><td colSpan={4} style={{ padding: '0 8px 10px 32px', background: '#fafbfc' }}>
                  {o.criterios.length ? o.criterios.map(c => <span key={c.chave} style={{ display: 'inline-block', margin: '3px 6px 3px 0', fontSize: 11.5, background: c.pontos < 0 ? '#fdecea' : '#eaf7ef', color: c.pontos < 0 ? '#b91c1c' : '#15803d', borderRadius: 999, padding: '2px 9px', fontWeight: 600 }}>{c.label}: {c.pontos > 0 ? '+' : ''}{c.pontos}{c.n > 1 ? ` (${c.n}×)` : ''}</span>) : <span style={{ fontSize: 11, color: '#cbd5e1' }}>sem critérios no período</span>}
                </td></tr>}
              </React.Fragment>
            ))}</tbody>
          </table>
        </div>}
      </div>
    </div>
  );
}
function CicloDestaque({ ciclo, onSalvar, onCancelar }) {
  const [meses, setMeses] = useState(ciclo.meses || 3);
  const [dia, setDia] = useState(ciclo.diaCorte || 1);
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ fontSize: 12.5, color: '#334', fontWeight: 600, width: '100%' }}>⚙️ Ciclo de apuração — define a janela que conta os lançamentos e quando o período fecha.</div>
      <label style={cd.lab}>Fecha a cada<select value={meses} onChange={e => setMeses(Number(e.target.value))} style={cd.inp}>{[[1, '1 mês'], [2, '2 meses'], [3, '3 meses (trimestre)'], [4, '4 meses'], [6, '6 meses (semestre)'], [12, '12 meses (ano)']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label style={cd.lab}>Dia de corte<input type="number" min={1} max={28} value={dia} onChange={e => setDia(e.target.value)} style={{ ...cd.inp, width: 90 }} /></label>
      <button onClick={() => onSalvar(Number(meses), Number(dia))} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0d6b5e', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>💾 Salvar ciclo</button>
      <button onClick={onCancelar} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
      <div style={{ fontSize: 11.5, color: '#94a3b8', width: '100%' }}>Ex.: a cada 3 meses fechando no dia 25 → o período vai de 25 de um mês a 24 três meses depois. (Vale também p/ o Débitos por caixa.)</div>
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
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>🧾 Conferência fiscal dos gastos do orçamento</div>
      <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 10px' }}>Os gastos do orçamento que o gerente lançou (no Fechamento do dia, com plano de contas/anexo). O escritório marca <b>fiscal</b> ou <b>não fiscal</b>, e o sistema <b>cruza com o Alpha 7</b> (se o valor já foi lançado na conta Orçamento da loja).</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <label style={cd.lab}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={cd.inp}><option value="">Todas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        <label style={cd.lab}>De<input type="date" value={de} onChange={e => setDe(e.target.value)} style={cd.inp} /></label>
        <label style={cd.lab}>Até<input type="date" value={ate} onChange={e => setAte(e.target.value)} style={cd.inp} /></label>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={fc.box}><div style={fc.lab}>📄 Fiscais</div><div style={{ ...fc.val, color: '#15803d' }}>{_brl(t.vFiscal)}</div><div style={fc.sub}>{t.fiscal || 0} nota(s)</div></div>
        <div style={fc.box}><div style={fc.lab}>⚠️ Não fiscais</div><div style={{ ...fc.val, color: '#b45309' }}>{_brl(t.vNaoFiscal)}</div><div style={fc.sub}>{t.nao_fiscal || 0} recibo(s)</div></div>
        <div style={fc.box}><div style={fc.lab}>⏳ A conferir</div><div style={{ ...fc.val, color: '#64748b' }}>{_brl(t.vPendente)}</div><div style={fc.sub}>{t.pendente || 0} pendente(s)</div></div>
        {d?.alphaOk && <div style={fc.box}><div style={fc.lab}>🔴 Não lançado no Alpha</div><div style={{ ...fc.val, color: '#b91c1c' }}>{_brl(t.vNaoLancado)}</div><div style={fc.sub}>{t.naoLancadoAlpha || 0} despesa(s) · {t.lancadoAlpha || 0} já lançada(s)</div></div>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '2px solid #eef1f4' }}>{['Data', 'Loja', 'Descrição', 'Plano de contas', 'Valor', 'Alpha 7', 'Conferência'].map(h => <th key={h} style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>{(d?.despesas || []).map(x => (
            <tr key={x.id} style={{ borderTop: '1px solid #f3f4f6' }}>
              <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{String(x.data).slice(0, 10).split('-').reverse().join('/')}</td>
              <td style={{ padding: '6px 8px', color: '#64748b' }}>{x.loja}</td>
              <td style={{ padding: '6px 8px' }}>{x.descricao || '—'}{x.fiscal != null && <span style={{ fontSize: 10, color: '#94a3b8' }}> · OCR: {x.fiscal ? 'NF' : 'recibo'}</span>}</td>
              <td style={{ padding: '6px 8px', color: '#64748b' }}>{x.plano_contas || '—'}</td>
              <td style={{ padding: '6px 8px', fontWeight: 600 }}>{_brl(x.valor)}</td>
              <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{!d?.alphaOk ? <span style={{ color: '#cbd5e1' }}>—</span> : x.alpha?.lancado
                ? <span style={{ color: '#15803d', fontWeight: 700 }} title={(x.alpha.plano ? 'Plano Alpha: ' + x.alpha.plano : '') + (x.alpha.dias ? ' · ' + x.alpha.dias + 'd' : '')}>✅ lançado {x.alpha.data ? String(x.alpha.data).slice(8, 10) + '/' + String(x.alpha.data).slice(5, 7) : ''}</span>
                : <span style={{ color: '#b91c1c', fontWeight: 700 }}>🔴 não lançado</span>}</td>
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
  const [colab, setColab] = useState(''); const [loja, setLoja] = useState('');
  const [colabs, setColabs] = useState([]); const [lojas, setLojas] = useState([]);
  const [h, setH] = useState({ entrada: '', saida_almoco: '', volta_almoco: '', saida: '', tolerancia_min: 5 });
  const [lista, setLista] = useState([]); const [msg, setMsg] = useState('');
  useEffect(() => { API.get('/tesouraria/colaboradores-nomes').then(r => setColabs(r.data.colaboradores || [])).catch(() => {}); API.get('/tesouraria/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  const carregarLista = useCallback(() => API.get(`/tesouraria/horarios-mes?ano=${ano}&mes=${mes}`).then(r => setLista(r.data.horarios || [])).catch(() => {}), [API, ano, mes]);
  const carregar = useCallback(() => {
    API.get(`/tesouraria/horario-mes?ano=${ano}&mes=${mes}&loja=${loja}&colaborador=${colab}`).then(r => setH({ entrada: r.data.entrada || '', saida_almoco: r.data.saida_almoco || '', volta_almoco: r.data.volta_almoco || '', saida: r.data.saida || '', tolerancia_min: r.data.tolerancia_min != null ? r.data.tolerancia_min : 5 })).catch(() => {});
  }, [API, ano, mes, loja, colab]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { carregarLista(); }, [carregarLista]);
  const set = (k, v) => setH(x => ({ ...x, [k]: v }));
  const salvar = () => API.put('/tesouraria/horario-mes', { ano, mes, loja, colaborador: colab, ...h }).then(() => { setMsg('✅ Horário salvo.'); setTimeout(() => setMsg(''), 2500); carregarLista(); }).catch(() => { setMsg('⚠️ Erro.'); setTimeout(() => setMsg(''), 3000); });
  const remover = (id) => { if (!window.confirm('Remover este horário?')) return; API.delete(`/tesouraria/horario-mes/${id}`).then(carregarLista); };
  const hhmm = v => v ? String(v).slice(0, 5) : '—';
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>🕐 Horário do mês (seg–sex) — por operador</div>
        <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 10px' }}>Base da <b>pontualidade</b>: o sistema compara a 1ª batida do Tangerino com o horário <b>daquele operador</b>. Deixe o operador em <b>“Padrão da loja”</b> para valer pra todos sem horário próprio. Cadastre no começo do mês.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={cd.lab}>Mês<select value={mes} onChange={e => setMes(Number(e.target.value))} style={cd.inp}>{MESES_N.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></label>
          <label style={cd.lab}>Ano<input type="number" value={ano} onChange={e => setAno(e.target.value)} style={{ ...cd.inp, width: 90 }} /></label>
          <label style={cd.lab}>Operador<select value={colab} onChange={e => setColab(e.target.value)} style={{ ...cd.inp, minWidth: 190 }}><option value="">— Padrão da loja —</option>{colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          <label style={cd.lab}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={cd.inp}><option value="">Todas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
          <label style={cd.lab}>Entrada<input type="time" value={h.entrada} onChange={e => set('entrada', e.target.value)} style={cd.inp} /></label>
          <label style={cd.lab}>Saída almoço<input type="time" value={h.saida_almoco} onChange={e => set('saida_almoco', e.target.value)} style={cd.inp} /></label>
          <label style={cd.lab}>Volta almoço<input type="time" value={h.volta_almoco} onChange={e => set('volta_almoco', e.target.value)} style={cd.inp} /></label>
          <label style={cd.lab}>Saída<input type="time" value={h.saida} onChange={e => set('saida', e.target.value)} style={cd.inp} /></label>
          <label style={cd.lab}>Tolerância (min)<input type="number" min="0" value={h.tolerancia_min} onChange={e => set('tolerancia_min', e.target.value)} style={{ ...cd.inp, width: 90 }} /></label>
          <button onClick={salvar} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0d6b5e', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>💾 Salvar</button>
          {msg && <span style={{ fontSize: 13, fontWeight: 600, color: msg.startsWith('⚠️') ? '#b91c1c' : '#15803d' }}>{msg}</span>}
        </div>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Horários cadastrados — {MESES_N[mes - 1]}/{ano}</div>
        {!lista.length ? <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Nenhum horário cadastrado neste mês.</div> :
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '2px solid #eef1f4' }}>{['Operador', 'Loja', 'Entrada', 'S. almoço', 'V. almoço', 'Saída', 'Tol.', ''].map(hh => <th key={hh} style={{ padding: '6px 8px' }}>{hh}</th>)}</tr></thead>
            <tbody>{lista.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{r.colaborador_id ? (r.colaborador_nome || '—') : <span style={{ color: '#2563eb' }}>Padrão da loja</span>}</td>
                <td style={{ padding: '6px 8px', color: '#666' }}>{r.loja_nome || (r.loja_id ? r.loja_id : 'Todas')}</td>
                <td style={{ padding: '6px 8px' }}>{hhmm(r.entrada)}</td>
                <td style={{ padding: '6px 8px' }}>{hhmm(r.saida_almoco)}</td>
                <td style={{ padding: '6px 8px' }}>{hhmm(r.volta_almoco)}</td>
                <td style={{ padding: '6px 8px' }}>{hhmm(r.saida)}</td>
                <td style={{ padding: '6px 8px' }}>{r.tolerancia_min}min</td>
                <td style={{ padding: '6px 8px' }}><button onClick={() => remover(r.id)} style={{ fontSize: 11, padding: '3px 7px', background: '#fff', color: '#888', border: '1px solid #e2e2e2', borderRadius: 6, cursor: 'pointer' }}>✕</button></td>
              </tr>))}</tbody>
          </table>
        </div>}
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '18px 20px' },
  atalho: { padding: '7px 13px', borderRadius: 9, border: '1px solid #d8e0e3', background: '#fff', color: '#334', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  tab: { padding: '8px 14px', borderRadius: 9, border: '1px solid #e3e8ea', background: '#f3f7f6', color: '#334', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  tabOn: { background: 'linear-gradient(95deg,#0E7C5A,#0b6e59)', color: '#fff', borderColor: 'transparent' },
};
