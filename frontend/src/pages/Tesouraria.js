import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';

const hoje = new Date();
const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const hojeISO = () => new Date().toISOString().slice(0, 10);
const inicioMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const dBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
const pctf = n => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

export default function Tesouraria() {
  const { API, usuario } = useAuth();
  const ehTesouraria = ['Tesouraria', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const [aba, setAba] = useState('ranking');
  return (
    <div style={s.wrap}>
      <Banner emoji="🏦" titulo="Tesouraria" cor="roxo" sub="Diferenças de caixa — sobra (+) e falta (−). No ranking, tudo soma em módulo." />
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <Tab a="ranking" aba={aba} set={setAba}>Caixa Destaque</Tab>
        {ehTesouraria && <Tab a="quebras" aba={aba} set={setAba}>💸 Quebras (ERP)</Tab>}
        {ehTesouraria && <Tab a="indicadores" aba={aba} set={setAba}>📈 Setor</Tab>}
        {ehTesouraria && <Tab a="cancelamentos" aba={aba} set={setAba}>🚫 Cancelamentos</Tab>}
        {ehTesouraria && <Tab a="atendimento" aba={aba} set={setAba}>🧾 Atendimento do caixa</Tab>}
        {ehTesouraria && <Tab a="debitos" aba={aba} set={setAba}>💵 Débitos do operador</Tab>}
        {ehTesouraria && <Tab a="conferencia" aba={aba} set={setAba}>✅ Conferência</Tab>}
        {ehTesouraria && <Tab a="lancar" aba={aba} set={setAba}>Lançar</Tab>}
        <Tab a="justif" aba={aba} set={setAba}>{ehTesouraria ? 'Justificativas' : 'Minhas justificativas'}</Tab>
        <Tab a="criterios" aba={aba} set={setAba}>Critérios</Tab>
      </div>
      {aba === 'ranking' && <Ranking API={API} usuario={usuario} ehTesouraria={ehTesouraria} />}
      {aba === 'quebras' && ehTesouraria && <QuebrasErp API={API} />}
      {aba === 'indicadores' && ehTesouraria && <IndicadoresSetor API={API} />}
      {aba === 'cancelamentos' && ehTesouraria && <CancelamentosPonto API={API} />}
      {aba === 'atendimento' && ehTesouraria && <AtendimentoCaixa API={API} />}
      {aba === 'debitos' && ehTesouraria && <DebitosOperador API={API} />}
      {aba === 'conferencia' && ehTesouraria && <Conferencia API={API} />}
      {aba === 'lancar' && ehTesouraria && <Lancar API={API} usuario={usuario} ehTesouraria={ehTesouraria} />}
      {aba === 'justif' && <Justificativas API={API} />}
      {aba === 'criterios' && <CriteriosCaixa API={API} />}
    </div>
  );
}

function Tab({ a, aba, set, children }) {
  return <button onClick={() => set(a)} style={{ ...s.tab, ...(aba === a ? s.tabAtiva : {}) }}>{children}</button>;
}

function CriteriosCaixa({ API }) {
  const [regra, setRegra] = useState(null);
  const [escala, setEscala] = useState([]);
  const [msg, setMsg] = useState('');
  const btn = { fontSize: 12, padding: '7px 12px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
  useEffect(() => { API.get('/regras/premiacao', { params: { funcao_id: 'func-caixa' } }).then(r => setRegra(r.data.regra)).catch(() => {}); }, [API]);
  useEffect(() => { API.get('/tesouraria/config').then(r => setEscala(r.data.escalaNotaCaixa || [])).catch(() => {}); }, [API]);
  const ac = regra?.aceitavel ?? 90;
  const setRow = (i, campo, val) => setEscala(escala.map((f, idx) => idx === i ? { ...f, [campo]: val } : f));
  const salvarEscala = () => {
    const lim = escala.map(f => ({ ate: Number(f.ate) || 0, nota: Number(f.nota) || 0 }));
    API.post('/tesouraria/config', { escalaNotaCaixa: lim }).then(r => { setEscala(r.data.escalaNotaCaixa || lim); setMsg('✅ Escala salva.'); setTimeout(() => setMsg(''), 2500); }).catch(() => setMsg('Erro ao salvar.'));
  };
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Como o caixa é avaliado — escala da diferença (personalizável)</div>
      <div style={{ fontSize: 11.5, color: '#777', marginBottom: 10 }}>A diferença de caixa do dia vira uma nota por esta escala (era fixa no código, agora você ajusta). "Justificativa aceita" neutraliza o dia (volta a 100). No ranking as diferenças somam <strong>em módulo</strong>.</div>
      <div style={{ display: 'flex', gap: 8, fontSize: 10.5, color: '#999', fontWeight: 600, padding: '0 2px 4px' }}>
        <span style={{ width: 120 }}>Diferença até (R$)</span><span>Nota</span>
      </div>
      {escala.map((f, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5 }}>
          <input type="number" min="0" value={f.ate} onChange={e => setRow(i, 'ate', e.target.value)} style={{ ...s.inp, width: 120 }} />
          <span style={{ color: '#bbb' }}>→</span>
          <input type="number" min="0" max="100" value={f.nota} onChange={e => setRow(i, 'nota', e.target.value)} style={{ ...s.inp, width: 80 }} />
          <button onClick={() => setEscala(escala.filter((_, idx) => idx !== i))} style={{ ...btn, background: '#FCEBEB', color: '#993C1D' }}>✕</button>
        </div>
      ))}
      <div style={{ fontSize: 11, color: '#999', margin: '4px 0 8px' }}>Acima da última faixa → nota 0.</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => setEscala([...escala, { ate: '', nota: '' }])} style={{ ...btn, background: '#EEF2F7', color: '#334' }}>+ faixa</button>
        <button onClick={salvarEscala} style={{ ...btn, background: '#1E874B', color: '#fff' }}>Salvar escala</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 6 }}>{msg}</div>}
      {regra && (
        <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Premiação por desempenho</div>
          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.7 }}>
            <div>Nota 100: {brl(regra.faixa1_valor)}</div>
            <div>≥ {ac}%: {brl(regra.faixa2_valor)}</div>
            <div>{ac - 10}–{ac - 1}%: {brl(regra.faixa3_valor)}</div>
            <div>{ac - 20}–{ac - 11}%: {brl(regra.faixa4_valor)}</div>
            <div>Abaixo de {ac - 20}%: sem premiação</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Lancar({ API, usuario, ehTesouraria }) {
  const [lojas, setLojas] = useState([]);
  const [caixas, setCaixas] = useState([]);
  const [form, setForm] = useState({ loja_id: usuario.loja_id || '', colaborador_id: '', turno: 'Manhã', data: hoje.toISOString().slice(0, 10), sinal: 'falta', valor: '', observacao: '' });
  const [msg, setMsg] = useState('');
  const [liberado, setLiberado] = useState(null); // null=verificando, true/false=status do dia

  useEffect(() => {
    if (ehTesouraria) API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || []));
    API.get('/colaboradores').then(r => setCaixas((r.data.colaboradores || []).filter(c => c.funcao === 'Caixa')));
  }, [API, ehTesouraria]);

  const verificarLiberado = useCallback(() => {
    if (!form.loja_id || !form.data) { setLiberado(null); return; }
    setLiberado(null);
    API.get('/caixa/liberado', { params: { loja_id: form.loja_id, data: form.data } })
      .then(r => setLiberado(!!r.data.aberto)).catch(() => setLiberado(null));
  }, [API, form.loja_id, form.data]);
  useEffect(() => { verificarLiberado(); }, [verificarLiberado]);

  async function lancar() {
    setMsg('');
    if (ehTesouraria && !form.loja_id) { setMsg('Selecione a loja onde ocorreu.'); return; }
    if (ehTesouraria && !form.colaborador_id) { setMsg('Selecione o caixa (colaborador) a que a diferença pertence.'); return; }
    if (liberado === false) { setMsg(`🔒 O gerente ainda não abriu o Checklist Diário desta loja em ${form.data}. O lançamento libera depois disso.`); return; }
    if (form.valor === '' || isNaN(Number(form.valor))) { setMsg('Informe o valor da diferença (0 se bateu).'); return; }
    const dif = form.sinal === 'sobra' ? Math.abs(Number(form.valor)) : -Math.abs(Number(form.valor));
    try {
      const r = await API.post('/caixa', { ...form, diferenca: dif });
      setMsg('✅ ' + r.data.mensagem + (r.data.precisa_justificar ? ' Gerou tarefa de justificativa (>R$5).' : ''));
      setForm({ ...form, valor: '', observacao: '' });
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }

  return (
    <div style={s.card}>
      {ehTesouraria && (
        <>
          <select style={s.campo} value={form.loja_id} onChange={e => setForm({ ...form, loja_id: e.target.value })}>
            <option value="" disabled>Loja onde ocorreu…</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          <select style={s.campo} value={form.colaborador_id} onChange={e => setForm({ ...form, colaborador_id: e.target.value })}>
            <option value="" disabled>Selecione o caixa…</option>
            {caixas.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.loja}</option>)}
          </select>
        </>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={s.campo} type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
        <select style={s.campo} value={form.turno} onChange={e => setForm({ ...form, turno: e.target.value })}>
          <option>Manhã</option><option>Tarde</option><option>Noite</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button onClick={() => setForm({ ...form, sinal: 'falta' })} style={{ ...s.toggle, ...(form.sinal === 'falta' ? s.tBad : {}) }}>Falta (−)</button>
        <button onClick={() => setForm({ ...form, sinal: 'sobra' })} style={{ ...s.toggle, ...(form.sinal === 'sobra' ? s.tOk : {}) }}>Sobra (+)</button>
      </div>
      <input style={s.campo} type="number" step="0.01" placeholder="Valor da diferença (0 se bateu)" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} />
      <input style={s.campo} placeholder="Observação (opcional)" value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} />
      {liberado === false && form.loja_id && (
        <div style={{ fontSize: 12, color: '#993C1D', background: '#FBEAE5', border: '1px solid #F1C9BD', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
          🔒 O gerente ainda não abriu o Checklist Diário desta loja em {form.data}. O lançamento de diferença libera só depois disso.
        </div>
      )}
      {liberado === true && form.loja_id && (
        <div style={{ fontSize: 12, color: '#3B6D11', marginBottom: 8 }}>✅ Checklist do dia aberto — lançamento liberado.</div>
      )}
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginBottom: 8 }}>{msg}</div>}
      <button style={{ ...s.btn, ...(liberado === false ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }} onClick={lancar} disabled={liberado === false}>Registrar diferença</button>
      <div style={s.info}>💡 Diferença (sobra ou falta) acima de <strong>R$5</strong> gera uma tarefa para o colaborador justificar — e a Tesouraria aceita ou rejeita.</div>
    </div>
  );
}

function Ranking({ API, usuario, ehTesouraria }) {
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano] = useState(hoje.getFullYear());
  const [colab, setColab] = useState('');
  const [caixas, setCaixas] = useState([]);
  const [data, setData] = useState(null);
  const [czPts, setCzPts] = useState(100);

  useEffect(() => { API.get('/colaboradores').then(r => setCaixas((r.data.colaboradores || []).filter(c => c.funcao === 'Caixa'))); }, [API]);
  useEffect(() => { API.get('/tesouraria/config').then(r => { if (r.data.pontosCaixaZerado != null) setCzPts(r.data.pontosCaixaZerado); }).catch(() => {}); }, [API]);
  const carregar = useCallback(() => {
    API.get('/caixa/ranking', { params: { mes, ano, colaborador_id: colab || undefined } }).then(r => setData(r.data));
  }, [API, mes, ano, colab]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!data) return <div style={s.card}>Carregando…</div>;

  return (
    <>
      <div style={s.card}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ ...s.campo, width: 'auto', marginBottom: 0 }} value={mes} onChange={e => setMes(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}
          </select>
          {ehTesouraria && (
            <select style={{ ...s.campo, width: 'auto', marginBottom: 0 }} value={colab} onChange={e => setColab(e.target.value)}>
              <option value="">Todos os caixas</option>
              {caixas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          )}
        </div>
      </div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Ranking — Caixa Destaque (maior nota = melhor)</div>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>Nota = precisão do caixa {data.pontualidadeOk ? '+ peso de pontualidade (chegou 5 min antes)' : ''}. {czPts > 0 ? `Quem zera o caixa ganha ${czPts} pontos na loja de pontos.` : 'Prêmio por caixa zerado está desligado (0 pontos).'}</div>
        {data.ranking.filter(r => r.fechamentos > 0).length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Sem lançamentos no período.</div>}
        {data.ranking.filter(r => r.fechamentos > 0).map((r, i) => (
          <div key={r.colaborador_id} style={{ ...s.linha, ...(r.colaborador_id === usuario.id ? { background: '#FFF3CD', borderRadius: 8, padding: '6px 8px' } : {}) }}>
            <div><span style={{ fontWeight: 700, color: i === 0 ? '#856404' : '#999' }}>{i + 1}º</span> <strong style={{ fontSize: 13 }}>{r.nome}{r.colaborador_id === usuario.id ? ' (você)' : ''}</strong>
              <div style={{ fontSize: 11, color: '#999' }}>{r.fechamentos} fechamentos · {r.perfeitos} perfeitos · dif. em módulo {brl(r.modulo_total)}{r.pct_pontualidade != null ? ` · pontualidade ${r.pct_pontualidade}%` : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {(() => { const nota = r.pct_final != null ? r.pct_final : r.pct; return <div style={{ fontWeight: 700, fontSize: 18, color: nota >= 90 ? '#3B6D11' : nota >= 70 ? '#BA7517' : '#993C1D' }}>{nota != null ? nota + '%' : '—'}</div>; })()}
              {r.bonus_pontualidade > 0 && <div style={{ fontSize: 10.5, color: '#3B6D11' }}>+{r.bonus_pontualidade} pontualidade</div>}
              {r.premiacao > 0 && <div style={{ fontSize: 11, color: '#856404' }}>{brl(r.premiacao)}</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Justificativas({ API }) {
  const [lista, setLista] = useState([]);
  const carregar = useCallback(() => { API.get('/caixa/justificativas').then(r => setLista(r.data.justificativas || [])); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  const STATUS = {
    enviada: ['Enviada — aguardando decisão', '#854F0B', '#FAEEDA'],
    pendente: ['Aguardando o caixa justificar', '#185FA5', '#E6F1FB'],
    aceita: ['Aceita', '#3B6D11', '#EAF3DE'],
    rejeitada: ['Rejeitada', '#993C1D', '#FCEBEB'],
  };

  return (
    <div style={s.card}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Histórico de justificativas de diferença de caixa.</div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>O aceite, rejeição ou pedido de reanálise é feito no <strong>Kanban (Tarefas)</strong>. Aqui é só consulta.</div>
      {!lista.length && <div style={{ fontSize: 12, color: '#999' }}>Nenhuma justificativa registrada.</div>}
      {lista.map(j => {
        const st = STATUS[j.justif_status] || [j.justif_status, '#666', '#f0f0f0'];
        return (
          <div key={j.id} style={{ padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{j.colaborador_nome} · {j.diferenca > 0 ? 'sobra' : 'falta'} {brl(Math.abs(j.diferenca))}</div>
            <div style={{ fontSize: 11, color: '#999' }}>{new Date(j.data + 'T12:00').toLocaleDateString('pt-BR')} · {j.loja_nome}</div>
            {j.justificativa && <div style={{ fontSize: 12, color: '#444', margin: '4px 0', background: '#f8f8f8', padding: 8, borderRadius: 6 }}>"{j.justificativa}"</div>}
            <span style={{ fontSize: 11, fontWeight: 600, color: st[1], background: st[2], padding: '2px 8px', borderRadius: 10 }}>{st[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Helpers das abas novas ──────────────────────────────────────────────────
// ── Aba: Débitos do operador (quebras cobradas em aberto) ───────────────────
function DebitosOperador({ API }) {
  const lojas = useLojasTes(API);
  const [loja, setLoja] = useState(''); const [incluirPagos, setIncluirPagos] = useState(false);
  const [d, setD] = useState(null); const [msg, setMsg] = useState('');
  const carregar = useCallback(() => {
    API.get('/tesouraria/debitos', { params: { loja, incluirPagos: incluirPagos ? 1 : 0 } }).then(r => setD(r.data)).catch(e => setD({ ok: false, erro: e.response?.data?.erro || e.message }));
  }, [API, loja, incluirPagos]);
  useEffect(() => { carregar(); }, [carregar]);
  const pagar = (id, pago) => API.post(`/tesouraria/debitos/${id}/pagar`, { pago }).then(() => { setMsg(pago ? 'Débito quitado.' : 'Reaberto.'); carregar(); setTimeout(() => setMsg(''), 2000); });
  const COLS = [
    { k: 'data', label: 'Data', tipo: 'txt', get: it => it.data || '' },
    { k: 'operador', label: 'Operador', tipo: 'txt', get: it => it.operador || '' },
    { k: 'loja', label: 'Loja', tipo: 'txt', get: it => it.loja || '' },
    { k: 'quebra', label: 'Quebra', tipo: 'num', get: it => Math.abs(it.valor || 0) },
    { k: 'valorCobrado', label: 'A pagar', tipo: 'num', right: true, get: it => it.valorCobrado || 0 },
    { k: 'situacao', label: 'Situação', tipo: 'num', get: it => (it.pago ? 1 : 0) },
  ];
  const { linhas, ordem, clicar, seta } = useOrdenavel(d?.itens, COLS, { col: 'valorCobrado', dir: 'desc' });
  return (
    <>
      <div style={{ ...s.card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={s.fld}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}><option value="">Todas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        <label style={{ ...s.fld, flexDirection: 'row', alignItems: 'center', gap: 5 }}><input type="checkbox" checked={incluirPagos} onChange={e => setIncluirPagos(e.target.checked)} /> mostrar já pagos</label>
        {d?.ok && <div style={{ marginLeft: 'auto', textAlign: 'right' }}><div style={{ fontSize: 20, fontWeight: 800, color: '#C0392B' }}>{brl(d.totalAberto)}</div><div style={{ fontSize: 11, color: '#888' }}>{d.qtdAberto} cobrança(s) em aberto</div></div>}
        {msg && <span style={{ fontSize: 12, color: '#1E874B' }}>{msg}</span>}
      </div>
      {d && !d.ok && <div style={s.erroBox}>⚠️ {d.erro}</div>}
      {d?.ok && d.operadores?.length > 0 && <div style={s.card}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#666', marginBottom: 8 }}>Quem deve (em aberto)</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {d.operadores.map((o, i) => <span key={i} style={{ fontSize: 12.5, background: '#FBEAEA', border: '1px solid #F0C7C7', borderRadius: 20, padding: '4px 12px' }}>{o.operador} <b style={{ color: '#C0392B' }}>{brl(o.total)}</b> <span style={{ color: '#aaa' }}>({o.qtd})</span></span>)}
        </div>
      </div>}
      <div style={s.card}>
        {!d ? <div style={s.vazio}>carregando…</div> : !d.itens?.length ? <div style={s.vazio}>Nenhum débito {incluirPagos ? '' : 'em aberto'}.</div> :
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{COLS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />)}<th style={s.th}>Ação</th></tr></thead>
            <tbody>{linhas.map(it => (
              <tr key={it.id} style={{ borderTop: '1px solid #f2f2f2', background: it.pago ? '#F4FBF6' : '#fff' }}>
                <td style={s.td}>{dBR(it.data)}</td>
                <td style={{ ...s.td, fontWeight: 600 }}>{it.operador}</td>
                <td style={{ ...s.td, color: '#666' }}>{it.loja}</td>
                <td style={{ ...s.td, color: '#C0392B' }}>{brl(Math.abs(it.valor))}{it.observacao ? <span style={{ color: '#aaa', fontWeight: 400 }} title={it.observacao}> · obs</span> : ''}</td>
                <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>{brl(it.valorCobrado)}</td>
                <td style={s.td}>{it.pago ? <span style={{ color: '#1E874B', fontWeight: 600 }}>✓ pago {it.pagoEm ? dBR(it.pagoEm) : ''}</span> : <span style={{ color: '#B7791F', fontWeight: 600 }}>em aberto</span>}</td>
                <td style={s.td}>{it.pago ? <button onClick={() => pagar(it.id, false)} style={s.actGray}>reabrir</button> : <button onClick={() => pagar(it.id, true)} style={s.actGreen}>marcar pago</button>}</td>
              </tr>))}</tbody>
          </table>
        </div>}
      </div>
      <div style={s.nota}>💡 Vêm das quebras marcadas como <b>cobrado</b> na aba Quebras. É a "conta a receber do operador": quando ele quitar, marque como pago aqui. (O desconto de <b>pontos</b> é separado — acontece no "só pontuar".)</div>
    </>
  );
}

function PeriodoTes({ ini, setIni, fim, setFim, loja, setLoja, lojas, children }) {
  return (
    <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label style={s.fld}>De<input type="date" value={ini} onChange={e => setIni(e.target.value)} style={s.inp} /></label>
      <label style={s.fld}>Até<input type="date" value={fim} onChange={e => setFim(e.target.value)} style={s.inp} /></label>
      <label style={s.fld}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}><option value="">Todas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
      {children}
    </div>
  );
}
function StatTes({ n, l, cor = '#111', bg = '#F6F7F9', sub }) {
  return <div style={{ background: bg, borderRadius: 10, padding: '10px 14px', minWidth: 118 }}>
    <div style={{ fontSize: 19, fontWeight: 700, color: cor }}>{n}</div>
    <div style={{ fontSize: 11, color: '#777' }}>{l}</div>
    {sub != null && <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>{sub}</div>}
  </div>;
}
function useLojasTes(API) {
  const [lojas, setLojas] = useState([]);
  useEffect(() => { API.get('/tesouraria/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  return lojas;
}

// ── Aba: Quebras de caixa do ERP + cobrança do operador ─────────────────────
const ST_COBR = { pendente: ['#B7791F', 'pendente'], cobrado: ['#1E874B', 'cobrado'], perdoado: ['#2E5C9E', 'perdoado'], pontuado: ['#7A4FB0', 'só pontuado'] };
function QuebrasErp({ API }) {
  const lojas = useLojasTes(API);
  const [ini, setIni] = useState(inicioMes()); const [fim, setFim] = useState(hojeISO());
  const [loja, setLoja] = useState(''); const [d, setD] = useState(null); const [carreg, setCarreg] = useState(false);
  const [limiar, setLimiar] = useState(5); const [soRel, setSoRel] = useState(false);
  const [pontosQuebra, setPontosQuebra] = useState(0); const [czCfg, setCzCfg] = useState(100); const [msg, setMsg] = useState('');
  const carregar = useCallback(() => {
    setCarreg(true);
    API.get('/tesouraria/quebras', { params: { ini, fim, loja } })
      .then(r => { setD(r.data); if (r.data.limiar != null) setLimiar(r.data.limiar); })
      .catch(e => setD({ erro: e.response?.data?.erro || e.message })).finally(() => setCarreg(false));
  }, [API, ini, fim, loja]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/tesouraria/config').then(r => { setPontosQuebra(r.data.pontosDescontoQuebra || 0); if (r.data.pontosCaixaZerado != null) setCzCfg(r.data.pontosCaixaZerado); }).catch(() => {}); }, [API]);
  const salvarLimiar = () => API.post('/tesouraria/config', { limiar }).then(carregar);
  const salvarPontos = () => API.post('/tesouraria/config', { pontosDescontoQuebra: pontosQuebra }).then(() => setMsg('Pontos salvos.')).then(() => setTimeout(() => setMsg(''), 2500));
  const salvarCz = () => API.post('/tesouraria/config', { pontosCaixaZerado: czCfg }).then(() => setMsg('Pontos do caixa zerado salvos.')).then(() => setTimeout(() => setMsg(''), 2500));
  const marcar = (q, status) => API.post('/tesouraria/quebras/cobranca', { quebra: q, status, valorCobrado: status === 'cobrado' ? Math.abs(q.valor) : 0 })
    .then(r => { const p = r.data?.pontos; if (p?.descontado) setMsg(`−${p.descontado} pts de ${p.colaborador}.`); else if (p?.removido) setMsg('Desconto de pontos revertido.'); else if (p?.semColaborador && status === 'pontuado') setMsg('⚠️ Operador sem colaborador vinculado por CPF — pontos não descontados.'); if (p?.descontado || p?.removido || p?.semColaborador) setTimeout(() => setMsg(''), 3500); return carregar(); });
  const R = d?.resumo;
  const linhas = (d?.quebras || []).filter(q => !soRel || q.relevante);
  const COLS = [
    { k: 'data', label: 'Data', tipo: 'txt', get: q => q.data || '' },
    { k: 'operador', label: 'Operador', tipo: 'txt', get: q => q.operador || '' },
    { k: 'loja', label: 'Loja', tipo: 'txt', get: q => q.loja || '' },
    { k: 'diferenca', label: 'Diferença', tipo: 'num', get: q => Number(q.valor) || 0 },
    { k: 'cobranca', label: 'Cobrança', tipo: 'txt', get: q => q.cobranca?.status || 'pendente' },
    { k: 'obs', label: 'Obs.', tipo: 'txt', get: q => q.observacao || '' },
  ];
  const { linhas: linhasOrd, ordem, clicar, seta } = useOrdenavel(linhas, COLS, { col: 'data', dir: 'desc' });
  return (
    <>
      <PeriodoTes {...{ ini, setIni, fim, setFim, loja, setLoja, lojas }}>
        <label style={s.fld}>Limiar cobrança
          <span style={{ display: 'flex', gap: 4 }}>
            <input type="number" step="0.5" value={limiar} onChange={e => setLimiar(e.target.value)} style={{ ...s.inp, width: 68 }} />
            <button onClick={salvarLimiar} style={s.btnMini}>salvar</button>
          </span>
        </label>
        <label style={s.fld}>Pontos −/quebra (só pontuar)
          <span style={{ display: 'flex', gap: 4 }}>
            <input type="number" min="0" value={pontosQuebra} onChange={e => setPontosQuebra(e.target.value)} style={{ ...s.inp, width: 68 }} title="Pontos da gamificação descontados do operador quando a quebra é marcada como 'só pontuar'" />
            <button onClick={salvarPontos} style={s.btnMini}>salvar</button>
          </span>
        </label>
        <label style={s.fld}>Pontos +/caixa zerado
          <span style={{ display: 'flex', gap: 4 }}>
            <input type="number" min="0" value={czCfg} onChange={e => setCzCfg(e.target.value)} style={{ ...s.inp, width: 68 }} title="Pontos ganhos pelo operador quando fecha o caixa com diferença zero (0 = desliga). Padrão 100." />
            <button onClick={salvarCz} style={s.btnMini}>salvar</button>
          </span>
        </label>
        <label style={{ ...s.fld, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <input type="checkbox" checked={soRel} onChange={e => setSoRel(e.target.checked)} /> só relevantes (&gt; R${limiar})
        </label>
      </PeriodoTes>
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('⚠️') ? '#C0392B' : '#7A4FB0', margin: '0 0 8px' }}>{msg}</div>}
      {d?.erro && <div style={s.erroBox}>⚠️ {d.erro}</div>}
      {R && <div style={{ ...s.card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatTes n={R.faltas} l="Faltas" cor="#C0392B" bg="#FBEAEA" sub={brl(R.valorFalta)} />
        <StatTes n={R.sobras} l="Sobras" cor="#1E874B" bg="#EAF7EF" sub={brl(R.valorSobra)} />
        <StatTes n={R.acobrar} l={`Faltas a cobrar (>R$${d.limiar})`} cor="#8A2E2E" bg="#FBEAEA" sub={brl(R.valorAcobrar)} />
        <StatTes n={R.pendentes} l="Cobranças pendentes" cor="#B7791F" bg="#FCF7EA" />
        <StatTes n={R.sobrasRelevantes} l={`Sobras relevantes (>R$${d.limiar})`} cor="#2E5C9E" bg="#EEF3FB" />
      </div>}
      <div style={s.card}>
        {carreg ? <div style={s.vazio}>carregando…</div> : !linhas.length ? <div style={s.vazio}>Nenhuma quebra no período.</div> :
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{COLS.map((c, i) => (<React.Fragment key={c.k}><ThOrd c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />{i === 4 && <th style={s.th}>Ação</th>}</React.Fragment>))}</tr></thead>
          <tbody>{linhasOrd.map(q => { const [cor, lab] = ST_COBR[q.cobranca?.status] || ST_COBR.pendente;
            return (
            <tr key={q.id} style={{ borderTop: '1px solid #f2f2f2', background: q.acobrar && q.cobranca?.status === 'pendente' ? '#FFFCF5' : '#fff' }}>
              <td style={s.td}>{dBR(q.data)}</td>
              <td style={{ ...s.td, fontWeight: 600 }}>{q.operador}{q.login ? <span style={{ color: '#aaa', fontWeight: 400 }}> · {q.login}</span> : ''}</td>
              <td style={{ ...s.td, color: '#666' }}>{q.loja}</td>
              <td style={{ ...s.td, fontWeight: 700, color: q.tipo === 'falta' ? '#C0392B' : '#1E874B' }}>
                {q.tipo === 'falta' ? '▼ falta ' : '▲ sobra '}{brl(Math.abs(q.valor))}{q.relevante ? <span style={{ fontSize: 10, marginLeft: 4, color: '#B7791F' }}>●</span> : ''}
              </td>
              <td style={s.td}><span style={{ color: cor, fontWeight: 700, fontSize: 11.5 }}>{lab}</span>{q.cobranca?.valorCobrado > 0 ? <span style={{ color: '#888' }}> · {brl(q.cobranca.valorCobrado)}</span> : ''}</td>
              <td style={s.td}>
                {q.cobranca?.status === 'pendente'
                  ? <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {q.tipo === 'falta' && <button onClick={() => marcar(q, 'cobrado')} style={s.actGreen}>cobrar {brl(Math.abs(q.valor))}</button>}
                      <button onClick={() => marcar(q, 'pontuado')} style={s.actGray}>só pontuar</button>
                      <button onClick={() => marcar(q, 'perdoado')} style={s.actGray}>perdoar</button>
                    </span>
                  : <button onClick={() => marcar(q, 'pendente')} style={s.actGray}>reabrir</button>}
              </td>
              <td style={{ ...s.td, color: '#999', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.observacao}>{q.observacao}</td>
            </tr>); })}</tbody>
        </table></div>}
      </div>
      <div style={s.nota}>💡 Quebras vêm direto do ERP (fechamento de caixa). Faltas acima do limiar entram para <b>cobrança do operador</b> — <b>além</b> da pontuação no Caixa Destaque. Sobras relevantes (●) exigem justificativa.</div>
    </>
  );
}

// ── Aba: Indicadores do setor ───────────────────────────────────────────────
function IndicadoresSetor({ API }) {
  const lojas = useLojasTes(API);
  const [ini, setIni] = useState(inicioMes()); const [fim, setFim] = useState(hojeISO());
  const [loja, setLoja] = useState(''); const [d, setD] = useState(null); const [carreg, setCarreg] = useState(false);
  useEffect(() => {
    setCarreg(true);
    API.get('/tesouraria/indicadores', { params: { ini, fim, loja } })
      .then(r => setD(r.data)).catch(e => setD({ erro: e.response?.data?.erro || e.message })).finally(() => setCarreg(false));
  }, [API, ini, fim, loja]);
  return (
    <>
      <PeriodoTes {...{ ini, setIni, fim, setFim, loja, setLoja, lojas }} />
      {d?.erro && <div style={s.erroBox}>⚠️ {d.erro}</div>}
      {carreg && <div style={s.vazio}>carregando…</div>}
      {d?.ok && <>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <PainelTes titulo="🚫 Cancelamentos" valor={pctf(d.cancelamentos.taxa)} cor="#C0392B"
            linhas={[['Vendas canceladas', d.cancelamentos.qtd], ['Base (vendas)', d.cancelamentos.base.toLocaleString('pt-BR')]]}
            dica="Vendas canceladas sobre o total de vendas do período." />
          <PainelTes titulo="↩️ Estornos" valor={pctf(d.estornos.taxa)} cor="#B7791F"
            linhas={[['Estornos', d.estornos.qtd], ['Base (vendas fechadas)', d.estornos.base.toLocaleString('pt-BR')]]}
            dica="Estornos de pagamento (envolvem a conciliação de cartão)." />
          <PainelTes titulo="🔗 Conciliação" valor={pctf(d.conciliacao.indice)} cor="#2E5C9E"
            linhas={[['Conciliados', `${d.conciliacao.conciliados.toLocaleString('pt-BR')} / ${d.conciliacao.itens.toLocaleString('pt-BR')}`], ['Pendentes', d.conciliacao.pendentes.toLocaleString('pt-BR')]]}
            dica="% de transações de cartão já conciliadas (baixadas)." />
          <PainelTes titulo="⏱️ Conciliação no prazo" valor={pctf(d.conciliacao.indiceNoPrazo)} cor="#1E874B"
            linhas={[['No prazo', d.conciliacao.noPrazo.toLocaleString('pt-BR')], ['Sobre conciliados', d.conciliacao.conciliados.toLocaleString('pt-BR')]]}
            dica="Dos conciliados, quantos foram baixados até o vencimento." />
        </div>
        <div style={s.nota}>💡 Indicadores do <b>setor de tesouraria</b> (chefe) — não dos operadores de caixa.</div>
      </>}
    </>
  );
}

// ── Aba: Atendimento do caixa (cupons baixados por operador) ─────────────────
function AtendimentoCaixa({ API }) {
  const lojas = useLojasTes(API);
  const [ini, setIni] = useState(inicioMes()); const [fim, setFim] = useState(hojeISO());
  const [loja, setLoja] = useState(''); const [d, setD] = useState(null); const [carreg, setCarreg] = useState(false);
  const [pontos, setPontos] = useState(0); const [msg, setMsg] = useState('');
  const carregar = useCallback(() => {
    setCarreg(true);
    API.get('/tesouraria/cupons-operador', { params: { ini, fim, loja } })
      .then(r => { setD(r.data); if (r.data.pontosTop != null) setPontos(r.data.pontosTop); })
      .catch(e => setD({ erro: e.response?.data?.erro || e.message })).finally(() => setCarreg(false));
  }, [API, ini, fim, loja]);
  useEffect(() => { carregar(); }, [carregar]);
  const salvarPontos = () => API.post('/tesouraria/config', { pontosTopOperador: pontos }).then(() => setMsg('Pontos salvos.')).then(() => setTimeout(() => setMsg(''), 2500));
  const premiar = () => {
    const [ano, mes] = ini.slice(0, 7).split('-').map(Number);
    setMsg('Premiando…');
    API.post('/tesouraria/cupons-operador/premiar', { ano, mes, loja })
      .then(r => setMsg(r.data.ok ? (r.data.jaExistia ? `Já premiado: ${r.data.top.operador}.` : `✅ ${r.data.colaborador} premiado com +${r.data.pontos} pts (${r.data.top.cupons} cupons).`) : `⚠️ ${r.data.erro}`))
      .catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || e.message)));
  };
  const ops = d?.operadores || [];
  const totalValor = ops.reduce((a, o) => a + (o.valor || 0), 0);
  const max = ops[0]?.cupons || 1;
  const COLS = [
    { k: 'operador', label: 'Operador', tipo: 'txt', get: o => o.operador || '' },
    { k: 'cupons', label: 'Cupons', tipo: 'num', right: true, get: o => o.cupons || 0 },
    { k: 'valor', label: 'Valor atendido', tipo: 'num', right: true, get: o => o.valor || 0 },
    { k: 'ticket', label: 'Ticket médio', tipo: 'num', right: true, get: o => o.ticket || 0 },
    { k: 'lojas', label: 'Lojas', tipo: 'num', right: true, get: o => Number(o.lojas) || 0 },
  ];
  const { linhas, ordem, clicar, seta } = useOrdenavel(ops, COLS, { col: 'cupons', dir: 'desc' });
  return (
    <>
      <PeriodoTes {...{ ini, setIni, fim, setFim, loja, setLoja, lojas }}>
        <label style={s.fld}>Pontos p/ operador destaque do mês
          <span style={{ display: 'flex', gap: 4 }}>
            <input type="number" min="0" value={pontos} onChange={e => setPontos(e.target.value)} style={{ ...s.inp, width: 78 }} />
            <button onClick={salvarPontos} style={s.btnMini}>salvar</button>
          </span>
        </label>
      </PeriodoTes>
      {d?.erro && <div style={s.erroBox}>⚠️ {d.erro}</div>}
      {d?.ok && <div style={{ ...s.card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <StatTes n={ops.length} l="Operadores" cor="#2E5C9E" bg="#EEF3FB" />
        <StatTes n={(d.total || 0).toLocaleString('pt-BR')} l="Cupons no período" cor="#111" />
        <StatTes n={brl(totalValor)} l="Valor atendido" cor="#1E874B" bg="#EAF7EF" />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('⚠️') ? '#C0392B' : '#1E874B' }}>{msg}</span>}
          <button onClick={premiar} style={{ ...s.btn, ...(Number(pontos) > 0 ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }} disabled={!(Number(pontos) > 0)} title="Premia o operador nº 1 do mês selecionado (idempotente)">🏆 Premiar operador destaque</button>
        </div>
      </div>}
      <div style={s.card}>
        {carreg ? <div style={s.vazio}>carregando…</div> : !ops.length ? <div style={s.vazio}>Nenhum cupom no período.</div> :
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>
            <th style={{ ...s.th, textAlign: 'left' }}>#</th>
            <ThOrd c={COLS[0]} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />
            <ThOrd c={COLS[1]} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />
            <th style={{ ...s.th, textAlign: 'left' }}></th>
            <ThOrd c={COLS[2]} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />
            <ThOrd c={COLS[3]} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />
            <ThOrd c={COLS[4]} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />
          </tr></thead>
          <tbody>{linhas.map((o, i) => (
            <tr key={o.operadorId || i} style={{ borderTop: '1px solid #f2f2f2', background: i === 0 ? '#FFFDF3' : '#fff' }}>
              <td style={{ ...s.td, fontWeight: 700, color: '#999' }}>{i === 0 ? '🏆' : i + 1}</td>
              <td style={{ ...s.td, fontWeight: 600 }}>{o.operador}</td>
              <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>{o.cupons.toLocaleString('pt-BR')}</td>
              <td style={{ ...s.td, width: 130 }}><div style={{ background: '#EEF3FB', borderRadius: 5, height: 8, overflow: 'hidden' }}><div style={{ width: `${Math.round(100 * o.cupons / max)}%`, height: '100%', background: i === 0 ? '#B7791F' : '#2E5C9E' }} /></div></td>
              <td style={{ ...s.td, textAlign: 'right', color: '#1E874B', fontWeight: 600 }}>{brl(o.valor)}</td>
              <td style={{ ...s.td, textAlign: 'right', color: '#666' }}>{brl(o.ticket)}</td>
              <td style={{ ...s.td, textAlign: 'right', color: '#999' }}>{o.lojas}</td>
            </tr>))}</tbody>
        </table></div>}
      </div>
      <div style={s.nota}>💡 Cupons baixados por operador de caixa (venda fechada no ERP). Filtre por <b>filial ou todas</b> para avaliar o desempenho no atendimento. O <b>nº 1 do mês</b> recebe os pontos configurados (uma vez por mês).</div>
    </>
  );
}
function PainelTes({ titulo, valor, cor, linhas, dica }) {
  return <div style={{ ...s.card, flex: '1 1 230px', minWidth: 230 }}>
    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{titulo}</div>
    <div style={{ fontSize: 30, fontWeight: 800, color: cor, lineHeight: 1 }}>{valor}</div>
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {linhas.map(([l, v], i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: '#888' }}>{l}</span><b>{v}</b></div>)}
    </div>
    <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 8 }}>{dica}</div>
  </div>;
}

// ── Aba: Cancelamentos × ponto ──────────────────────────────────────────────
const SIT_CANC = { dentro: ['#1E874B', 'dentro do horário'], fora: ['#C0392B', 'FORA do horário'], sem_vinculo: ['#999', 'sem vínculo p/ conferir'] };
function CancelamentosPonto({ API }) {
  const lojas = useLojasTes(API);
  const [ini, setIni] = useState(inicioMes()); const [fim, setFim] = useState(hojeISO());
  const [loja, setLoja] = useState(''); const [d, setD] = useState(null); const [carreg, setCarreg] = useState(false);
  const [filtro, setFiltro] = useState('todos');
  useEffect(() => {
    setCarreg(true);
    API.get('/tesouraria/cancelamentos', { params: { ini, fim, loja } })
      .then(r => setD(r.data)).catch(e => setD({ erro: e.response?.data?.erro || e.message })).finally(() => setCarreg(false));
  }, [API, ini, fim, loja]);
  const R = d?.resumo;
  const linhas = (d?.cancelamentos || []).filter(c => filtro === 'todos' || c.situacao === filtro);
  const COLS = [
    { k: 'data', label: 'Data/hora', tipo: 'txt', get: c => c.data || '' },
    { k: 'gerente', label: 'Cancelado por (gerente)', tipo: 'txt', get: c => c.gerente || '' },
    { k: 'caixa', label: 'Caixa', tipo: 'txt', get: c => c.caixa || '' },
    { k: 'loja', label: 'Loja', tipo: 'txt', get: c => c.loja || '' },
    { k: 'valor', label: 'Valor', tipo: 'num', get: c => Number(c.valor) || 0 },
    { k: 'ponto', label: 'Ponto', tipo: 'txt', get: c => c.situacao || '' },
  ];
  const { linhas: linhasOrd, ordem, clicar, seta } = useOrdenavel(linhas, COLS, { col: 'data', dir: 'desc' });
  return (
    <>
      <PeriodoTes {...{ ini, setIni, fim, setFim, loja, setLoja, lojas }} />
      {d?.erro && <div style={s.erroBox}>⚠️ {d.erro}</div>}
      {d && d.pontoOk === false && <div style={s.erroBox}>⚠️ Tangerino indisponível — não deu pra cruzar com o ponto (mostrando só os cancelamentos).</div>}
      {R && <div style={{ ...s.card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatTes n={R.total} l="Cancelamentos" sub={brl(R.valor)} />
        <StatTes n={R.dentro} l="Dentro do horário" cor="#1E874B" bg="#EAF7EF" />
        <StatTes n={R.fora} l="FORA do horário" cor="#C0392B" bg="#FBEAEA" sub={brl(R.valorFora)} />
        <StatTes n={R.semVinculo} l="Sem vínculo" cor="#999" />
      </div>}
      <div style={{ ...s.card, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[['todos', 'Todos'], ['fora', '🚩 Fora do horário'], ['dentro', 'Dentro'], ['sem_vinculo', 'Sem vínculo']].map(([v, l]) =>
          <button key={v} onClick={() => setFiltro(v)} style={{ ...s.chip, ...(filtro === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      <div style={s.card}>
        {carreg ? <div style={s.vazio}>carregando…</div> : !linhas.length ? <div style={s.vazio}>Nenhum cancelamento.</div> :
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{COLS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />)}</tr></thead>
          <tbody>{linhasOrd.map(c => { const [cor, lab] = SIT_CANC[c.situacao] || SIT_CANC.sem_vinculo;
            return (
            <tr key={c.id} style={{ borderTop: '1px solid #f2f2f2', background: c.situacao === 'fora' ? '#FFF7F6' : '#fff' }}>
              <td style={s.td}>{dBR(c.data)} <span style={{ color: '#999' }}>{String(c.data).slice(11, 16)}</span></td>
              <td style={{ ...s.td, fontWeight: 600 }}>{c.gerente}{c.login ? <span style={{ color: '#aaa', fontWeight: 400 }}> · {c.login}</span> : ''}</td>
              <td style={{ ...s.td, color: '#888', fontSize: 11.5 }}>{c.caixa || '—'}</td>
              <td style={{ ...s.td, color: '#666' }}>{c.loja}</td>
              <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>{brl(c.valor)}</td>
              <td style={s.td}><span style={{ color: cor, fontWeight: 700, fontSize: 11.5 }}>{c.situacao === 'fora' ? '🚩 ' : ''}{lab}</span></td>
            </tr>); })}</tbody>
        </table></div>}
      </div>
      <div style={s.nota}>💡 O cancelamento no caixa é autorizado pelo <b>gerente</b> (senha de liberação) — é o ponto dele que cruzamos. "Fora do horário" = o cancelamento ocorreu quando o gerente <b>não tinha batida de ponto aberta</b> no Tangerino (tolerância 5 min). "Sem vínculo" = usuário do ERP sem CPF casando com colaborador vinculado ao Tangerino.</div>
    </>
  );
}

// ── Aba: Conferência de caixas (sessões x checklist) ────────────────────────
function Conferencia({ API }) {
  const lojas = useLojasTes(API);
  const [data, setData] = useState(hojeISO()); const [loja, setLoja] = useState('');
  const [d, setD] = useState(null); const [carreg, setCarreg] = useState(false);
  useEffect(() => {
    setCarreg(true);
    API.get('/tesouraria/sessoes', { params: { data, loja } })
      .then(r => setD(r.data)).catch(e => setD({ erro: e.response?.data?.erro || e.message })).finally(() => setCarreg(false));
  }, [API, data, loja]);
  const sess = d?.sessoes || [];
  const abertos = sess.filter(x => !x.fechado).length;
  const R = d?.resumo;
  const semSessao = d?.informadosSemSessao || [];
  const ST = { ok: ['#1E874B', '#EAF7EF', '✓ informado'], nao_informado: ['#C0392B', '#FBEAEA', '⚠ NÃO informado'], sem_vinculo: ['#B7791F', '#FCF7EA', '? sem vínculo'] };
  const COLS = [
    { k: 'operador', label: 'Operador', tipo: 'txt', get: x => x.operador || '' },
    { k: 'loja', label: 'Loja', tipo: 'txt', get: x => x.loja || '' },
    { k: 'pdv', label: 'PDV', tipo: 'txt', get: x => x.pdv || '' },
    { k: 'inicio', label: 'Abertura', tipo: 'txt', get: x => x.inicio || '' },
    { k: 'fim', label: 'Fechamento', tipo: 'txt', get: x => x.fim || '' },
    { k: 'fechado', label: 'Caixa', tipo: 'num', get: x => (x.fechado ? 1 : 0) },
    { k: 'status', label: 'Checklist do gerente', tipo: 'txt', get: x => x.status || '' },
  ];
  const { linhas, ordem, clicar, seta } = useOrdenavel(sess, COLS, { col: 'operador', dir: 'asc' });
  return (
    <>
      <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={s.fld}>Dia<input type="date" value={data} onChange={e => setData(e.target.value)} style={s.inp} /></label>
        <label style={s.fld}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}><option value="">Todas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
      </div>
      {d?.erro && <div style={s.erroBox}>⚠️ {d.erro}</div>}
      {d?.sessoes && <div style={{ ...s.card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatTes n={sess.length} l="Sessões de caixa" />
        <StatTes n={sess.length - abertos} l="Fechadas" cor="#1E874B" bg="#EAF7EF" />
        <StatTes n={abertos} l="Ainda abertas" cor={abertos ? '#C0392B' : '#1E874B'} bg={abertos ? '#FBEAEA' : '#EAF7EF'} />
        <StatTes n={R?.naoInformado || 0} l="Operou SEM ser informado" cor={R?.naoInformado ? '#C0392B' : '#1E874B'} bg={R?.naoInformado ? '#FBEAEA' : '#EAF7EF'} />
        <StatTes n={R?.informadosSemSessao || 0} l="Informado SEM operar" cor={R?.informadosSemSessao ? '#B7791F' : '#1E874B'} bg={R?.informadosSemSessao ? '#FCF7EA' : '#EAF7EF'} />
      </div>}
      {semSessao.length > 0 && <div style={{ ...s.card, background: '#FCF7EA', border: '1px solid #F0E7C8' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#8A6D1F', marginBottom: 5 }}>⚠️ Informados pelo gerente mas SEM sessão no ERP (lançou diferença de quem não operou?)</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{semSessao.map((i, k) => <span key={k} style={{ fontSize: 12, background: '#fff', border: '1px solid #E7D9A8', borderRadius: 20, padding: '3px 10px' }}>{i.nome}{i.loja ? ` · ${i.loja}` : ''}</span>)}</div>
      </div>}
      <div style={s.card}>
        {carreg ? <div style={s.vazio}>carregando…</div> : !sess.length ? <div style={s.vazio}>Nenhuma sessão de caixa neste dia.</div> :
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{COLS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />)}</tr></thead>
          <tbody>{linhas.map(x => { const [cor, bg, lab] = ST[x.status] || ST.sem_vinculo; return (
            <tr key={x.id} style={{ borderTop: '1px solid #f2f2f2', background: x.status === 'nao_informado' ? '#FFFCFB' : '#fff' }}>
              <td style={{ ...s.td, fontWeight: 600 }}>{x.operador}{x.login ? <span style={{ color: '#aaa', fontWeight: 400 }}> · {x.login}</span> : ''}</td>
              <td style={{ ...s.td, color: '#666' }}>{x.loja}</td>
              <td style={{ ...s.td, color: '#999' }}>{x.pdv}</td>
              <td style={s.td}>{x.inicio ? new Date(x.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
              <td style={s.td}>{x.fim ? new Date(x.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
              <td style={s.td}>{x.fechado ? <span style={{ color: '#1E874B', fontWeight: 700 }}>fechado</span> : <span style={{ color: '#C0392B', fontWeight: 700 }}>ABERTO</span>}</td>
              <td style={s.td}><span style={{ color: cor, background: bg, fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 6 }}>{lab}</span></td>
            </tr>); })}</tbody>
        </table></div>}
      </div>
      <div style={s.nota}>💡 Cruzamento automático: cada sessão do ERP × os operadores que o gerente lançou no dia. <b>NÃO informado</b> = caixa operado por quem o gerente não contabilizou. <b>Sem vínculo</b> = operador do ERP sem colaborador casado por CPF (cadastre p/ conferir). <b>Informado sem operar</b> = gerente lançou diferença de quem não abriu sessão.</div>
    </>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1150, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  campo: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', marginBottom: 8 },
  campoSm: { width: 90, padding: '6px 8px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, textAlign: 'right' },
  lbl: { fontSize: 12, color: '#666', display: 'block', marginBottom: 3 },
  faixa: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 13, borderBottom: '1px solid #f5f5f5' },
  tab: { fontSize: 12, padding: '6px 14px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666' },
  tabAtiva: { background: '#111', color: '#fff', borderColor: '#111' },
  linha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f5f5' },
  toggle: { fontSize: 12, padding: '6px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#666' },
  tOk: { background: '#EAF3DE', color: '#3B6D11', borderColor: '#3B6D11' },
  tBad: { background: '#FCEBEB', color: '#993C1D', borderColor: '#993C1D' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  info: { background: '#E6F1FB', borderLeft: '3px solid #185FA5', borderRadius: '0 8px 8px 0', padding: '10px 12px', fontSize: 12, color: '#185FA5', lineHeight: 1.6, marginTop: 8 },
  // abas novas (Quebras ERP / Setor / Conferência)
  fld: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#888' },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  btnMini: { fontSize: 12, padding: '7px 12px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
  actGreen: { fontSize: 11, padding: '4px 9px', background: '#1E874B', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  actGray: { fontSize: 11, padding: '4px 9px', background: '#fff', color: '#555', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer' },
  th: { textAlign: 'left', fontSize: 11, color: '#888', padding: '5px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  td: { textAlign: 'left', padding: '6px 8px' },
  vazio: { fontSize: 12.5, color: '#aaa', textAlign: 'center', padding: 14 },
  nota: { fontSize: 11.5, color: '#888', background: '#F6F7F9', borderRadius: 8, padding: '8px 10px', marginBottom: 10 },
  erroBox: { background: '#FBEAEA', border: '1px solid #F0C7C7', color: '#8A2E2E', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, marginBottom: 10 },
};
