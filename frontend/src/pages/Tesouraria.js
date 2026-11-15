import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';
import SetorObservacoes from '../components/SetorObservacoes';

const hoje = new Date();
const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const hojeISO = () => new Date().toISOString().slice(0, 10);
const inicioMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const dBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
const hm = v => v ? String(v).slice(11, 16) : '';

// embed: sem Banner (renderizada dentro do hub da Tesouraria).
// soControle: modo "controle da gestão" — mostra só o que é leitura/monitoramento; esconde o que
// abre tarefa/cobrança pro operador (débitos, lançar diferença, justificativas) e a cobrança na tela
// de Quebras. Pedido do Joe 2026-11-11: "é só um controle pra gestão, sem abrir tarefa pro operador".
// embed: sem Banner. soControle: modo controle da gestão. tabFixa: renderiza SÓ aquela aba sem a
// barra de abas (o hub da Tesouraria dirige as abas num conjunto único — Joe 2026-11-11: fechamento
// do dia junto com as apurações).
export default function Tesouraria({ embed, soControle, tabFixa } = {}) {
  const { API, usuario } = useAuth();
  const ehTesouraria = ['Tesouraria', 'Financeiro', 'Controladoria', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const diretoria = ['Diretor Geral', 'Gestor Geral'].includes(usuario.funcao); // só Diretoria edita meta/critério
  const [abaState, setAba] = useState('ranking');
  const aba = tabFixa || abaState;
  return (
    <div style={s.wrap}>
      {!embed && <Banner emoji="🏦" titulo="Tesouraria" cor="roxo" sub="Diferenças de caixa — sobra (+) e falta (−). No ranking, tudo soma em módulo." />}
      {!tabFixa && <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <Tab a="ranking" aba={aba} set={setAba}>🏆 Caixa Destaque</Tab>
        {ehTesouraria && <Tab a="quebras" aba={aba} set={setAba}>💸 Diferenças (ERP)</Tab>}
        {ehTesouraria && <Tab a="indicadores" aba={aba} set={setAba}>📈 Setor</Tab>}
        {ehTesouraria && <Tab a="cancelamentos" aba={aba} set={setAba}>🚫 Cancelamentos</Tab>}
        {ehTesouraria && <Tab a="atendimento" aba={aba} set={setAba}>🧾 Atendimento do caixa</Tab>}
        {ehTesouraria && <Tab a="conferencia" aba={aba} set={setAba}>✅ Conferência</Tab>}
        {ehTesouraria && <Tab a="debitos" aba={aba} set={setAba}>💵 Débitos por caixa</Tab>}
        {ehTesouraria && <Tab a="exclusoes" aba={aba} set={setAba}>🗑️ Exclusões</Tab>}
        {!soControle && ehTesouraria && <Tab a="lancar" aba={aba} set={setAba}>Lançar</Tab>}
        {!soControle && <Tab a="justif" aba={aba} set={setAba}>{ehTesouraria ? 'Justificativas' : 'Minhas justificativas'}</Tab>}
        {!soControle && <Tab a="criterios" aba={aba} set={setAba}>Critérios</Tab>}
      </div>}
      {aba === 'ranking' && <Ranking API={API} usuario={usuario} ehTesouraria={ehTesouraria} />}
      {aba === 'quebras' && ehTesouraria && <QuebrasErp API={API} soControle={soControle} />}
      {aba === 'indicadores' && ehTesouraria && <IndicadoresSetor API={API} />}
      {aba === 'metas' && ehTesouraria && <MetasSetorTab API={API} diretoria={diretoria} />}
      {aba === 'exclusoes' && ehTesouraria && <ExclusoesDepositos API={API} />}
      {aba === 'saldos' && ehTesouraria && <SaldosBanco API={API} />}
      {aba === 'cancelamentos' && ehTesouraria && <CancelamentosPonto API={API} />}
      {aba === 'atendimento' && ehTesouraria && <AtendimentoCaixa API={API} />}
      {aba === 'debitos' && ehTesouraria && <FaltasPorCaixa API={API} />}
      {aba === 'conferencia' && ehTesouraria && <Conferencia API={API} />}
      {aba === 'lancar' && !soControle && ehTesouraria && <Lancar API={API} usuario={usuario} ehTesouraria={ehTesouraria} />}
      {aba === 'justif' && !soControle && <Justificativas API={API} />}
      {aba === 'criterios' && !soControle && <CriteriosCaixa API={API} diretoria={diretoria} />}
    </div>
  );
}

function Tab({ a, aba, set, children }) {
  return <button onClick={() => set(a)} style={{ ...s.tab, ...(aba === a ? s.tabAtiva : {}) }}>{children}</button>;
}

function CriteriosCaixa({ API, diretoria = false }) {
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
          <input type="number" min="0" value={f.ate} readOnly={!diretoria} onChange={e => setRow(i, 'ate', e.target.value)} style={{ ...s.inp, width: 120 }} />
          <span style={{ color: '#bbb' }}>→</span>
          <input type="number" min="0" max="100" value={f.nota} readOnly={!diretoria} onChange={e => setRow(i, 'nota', e.target.value)} style={{ ...s.inp, width: 80 }} />
          {diretoria && <button onClick={() => setEscala(escala.filter((_, idx) => idx !== i))} style={{ ...btn, background: '#FCEBEB', color: '#993C1D' }}>✕</button>}
        </div>
      ))}
      <div style={{ fontSize: 11, color: '#999', margin: '4px 0 8px' }}>Acima da última faixa → nota 0.</div>
      {diretoria ? <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => setEscala([...escala, { ate: '', nota: '' }])} style={{ ...btn, background: '#EEF2F7', color: '#334' }}>+ faixa</button>
        <button onClick={salvarEscala} style={{ ...btn, background: '#1E874B', color: '#fff' }}>Salvar escala</button>
      </div> : <div style={{ fontSize: 11, color: '#999' }}>🔒 Só a Diretoria edita os critérios de avaliação.</div>}
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

// 🗑️ Exclusões de anexos (depósitos em destaque) — a Diretoria revê quem excluiu o quê (fila #8).
function ExclusoesDepositos({ API }) {
  const [ini, setIni] = useState(inicioMes());
  const [fim, setFim] = useState(hojeISO());
  const [tipo, setTipo] = useState('deposito');
  const [d, setD] = useState(null);
  const [carreg, setCarreg] = useState(false);
  const carregar = useCallback(() => {
    setCarreg(true);
    const params = { ini, fim }; if (tipo) params.tipo = tipo;
    API.get('/tesouraria/exclusoes', { params }).then(r => setD(r.data)).catch(() => setD(null)).finally(() => setCarreg(false));
  }, [API, ini, fim, tipo]);
  useEffect(() => { carregar(); }, [carregar]);
  const rows = d?.exclusoes || [];
  const TIPO_LBL = { deposito: '💰 Depósito', despesa: '🧾 Despesa', recarga: '📲 Recarga', orcamento: '📊 Orçamento' };
  return (
    <div style={s.card}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>🗑️ Exclusões de anexos</div>
        <label style={s.fld}>De<input type="date" value={ini} onChange={e => setIni(e.target.value)} style={s.inp} /></label>
        <label style={s.fld}>Até<input type="date" value={fim} onChange={e => setFim(e.target.value)} style={s.inp} /></label>
        <label style={s.fld}>Tipo<select value={tipo} onChange={e => setTipo(e.target.value)} style={s.inp}>
          <option value="">Todos</option>
          <option value="deposito">Depósito</option>
          <option value="despesa">Despesa</option>
          <option value="recarga">Recarga</option>
          <option value="orcamento">Orçamento</option>
        </select></label>
        <button onClick={carregar} disabled={carreg} style={{ ...s.actGray, color: '#0d6b5e', borderColor: '#0d6b5e' }}>{carreg ? '⏳' : '🔄 Atualizar'}</button>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 10, padding: '8px 14px' }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>Exclusões</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{d?.total ?? '—'}</div>
        </div>
        <div style={{ background: '#FBEAEA', border: '1px solid #f3c9c9', borderRadius: 10, padding: '8px 14px' }}>
          <div style={{ fontSize: 11, color: '#991b1b', fontWeight: 700 }}>Depósitos excluídos</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#991b1b' }}>{d?.qtdDepositos ?? 0} · {brl(d?.totalDepositos || 0)}</div>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: 'left', color: '#7a8a8c', borderBottom: '2px solid #eef1f4' }}>
            {['Excluído em', 'Por', 'Tipo', 'Loja', 'Data do caixa', 'Valor', 'Descrição', 'Arquivo', 'Motivo'].map(h => <th key={h} style={s.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{String(r.excluido_em || '').slice(0, 16).replace('T', ' ')}</td>
                <td style={s.td}><b>{r.excluido_por || '—'}</b></td>
                <td style={s.td}>{TIPO_LBL[r.tipo] || r.tipo}</td>
                <td style={s.td}>{r.loja_nome || r.loja_id || '—'}</td>
                <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{r.data || '—'}</td>
                <td style={{ ...s.td, fontWeight: 700, color: r.tipo === 'deposito' ? '#991b1b' : '#334' }}>{r.valor != null ? brl(r.valor) : '—'}</td>
                <td style={{ ...s.td, maxWidth: 220, whiteSpace: 'normal' }}>{r.descricao || '—'}</td>
                <td style={{ ...s.td, maxWidth: 140, whiteSpace: 'normal', color: '#64748b' }}>{r.nome_arquivo || '—'}</td>
                <td style={{ ...s.td, maxWidth: 180, whiteSpace: 'normal' }}>{r.motivo || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} style={{ ...s.td, color: '#94a3b8', textAlign: 'center', padding: 20 }}>Nenhuma exclusão no período.</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 10 }}>Toda vez que um anexo é excluído, o sistema guarda a lápide (quem, quando, qual, valor). Depósitos aparecem em vermelho — é o que a Diretoria acompanha.</p>
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
// "Débitos por caixa" sem cobrança (Joe 2026-11-11): faltas e sobras agregadas por operador no período,
// só leitura (quem teve diferença e quanto). Substitui o antigo DebitosOperador (que dependia da cobrança).
function FaltasPorCaixa({ API }) {
  const lojas = useLojasTes(API);
  const [ini, setIni] = useState(inicioMes()); const [fim, setFim] = useState(hojeISO());
  const [loja, setLoja] = useState(''); const [d, setD] = useState(null); const [busca, setBusca] = useState(''); const [carreg, setCarreg] = useState(false); const [exp, setExp] = useState(null);
  const [ap, setAp] = useState(null); const [apForm, setApForm] = useState(null); const [apMsg, setApMsg] = useState(''); const [cfgEdit, setCfgEdit] = useState(false);
  const carregar = useCallback(() => { setCarreg(true); API.get('/tesouraria/quebras', { params: { ini, fim, loja } }).then(r => setD(r.data)).catch(e => setD({ erro: e.response?.data?.erro || e.message })).finally(() => setCarreg(false)); }, [API, ini, fim, loja]);
  const carregarAp = useCallback(() => API.get('/tesouraria/apagar', { params: { status: 'todos' } }).then(r => setAp(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { carregarAp(); }, [carregarAp]);
  const abrirApagar = (o) => { setApForm({ operador: o.operador, loja_id: loja || '', valor: Number(o.vFalta || 0).toFixed(2), de: ini, ate: fim, contato_em: '', retorno_em: '', obs: '' }); };
  const salvarApagar = () => {
    const f = apForm; if (!f) return;
    API.post('/tesouraria/apagar', { operador: f.operador, loja_id: f.loja_id || null, de: f.de, ate: f.ate, valor: Number(String(f.valor).replace(',', '.')), obs: f.obs, contato_em: f.contato_em || null, retorno_em: f.retorno_em || null })
      .then(r => { setApMsg(r.data.no_prazo === 1 ? '✅ Lançado — retorno no prazo (ganha Agilidade).' : r.data.no_prazo === 0 ? '✅ Lançado — retorno fora do prazo (sem Agilidade).' : '✅ Lançado a pagar.'); setApForm(null); carregarAp(); setTimeout(() => setApMsg(''), 4000); })
      .catch(e => setApMsg('⚠️ ' + (e.response?.data?.erro || 'Falha.')));
  };
  const quitar = (id) => { if (!window.confirm('Marcar este desconto como quitado?')) return; API.post(`/tesouraria/apagar/${id}/quitar`, {}).then(carregarAp); };
  const quitarTodos = () => { if (!window.confirm('Quitar TODOS os descontos em aberto de uma vez?')) return; API.post('/tesouraria/apagar/quitar-todos', {}).then(carregarAp); };
  const removerAp = (id) => { if (!window.confirm('Remover este lançamento a pagar?')) return; API.delete(`/tesouraria/apagar/${id}`).then(carregarAp); };
  const salvarCfg = (diaCorte, slaHoras) => API.put('/tesouraria/apagar-config', { diaCorte, slaHoras }).then(() => { setCfgEdit(false); carregarAp(); });
  const mapa = {};
  (d?.quebras || []).forEach(q => {
    const k = (q.operador || '—').trim(); if (!mapa[k]) mapa[k] = { operador: k, login: q.login, nFalta: 0, vFalta: 0, nSobra: 0, vSobra: 0 };
    const v = Number(q.valor) || 0;
    if (q.tipo === 'falta') { mapa[k].nFalta++; mapa[k].vFalta += Math.abs(v); } else { mapa[k].nSobra++; mapa[k].vSobra += v; }
  });
  let linhas = Object.values(mapa).map(o => ({ ...o, saldo: o.vSobra - o.vFalta }));
  linhas = linhas.filter(o => !busca.trim() || o.operador.toLowerCase().includes(busca.trim().toLowerCase())).sort((a, b) => b.vFalta - a.vFalta);
  return (
    <>
      <PeriodoTes {...{ ini, setIni, fim, setFim, loja, setLoja, lojas }}>
        <label style={s.fld}>🔍 Pessoa<input value={busca} onChange={e => setBusca(e.target.value)} style={{ ...s.inp, minWidth: 150 }} placeholder="operador" /></label>
      </PeriodoTes>
      <div style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px' }}>💡 Faltas e sobras por operador no período (só leitura). Não cobra o operador — é acompanhamento da gestão. Para apurar/perdoar, use a aba <b>Diferenças</b>.</div>

      {apMsg && <div style={{ ...s.card, fontSize: 12.5, color: apMsg[0] === '✅' ? '#1E874B' : '#B7791F' }}>{apMsg}</div>}
      {/* Seção: A pagar / desconto — no topo da tela */}
      {ap && <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>💸 A pagar / desconto</div>
          <span style={{ fontSize: 11.5, color: '#64748b' }}>Ciclo de desconto: dia <b>{ap.diaCorte}</b> → {ap.diaCorte} · SLA agilidade <b>{ap.slaHoras}h</b> <button onClick={() => setCfgEdit(v => !v)} style={{ ...s.mv, marginLeft: 4 }}>ajustar</button></span>
          <div style={{ marginLeft: 'auto', fontSize: 13 }}>Em aberto: <b style={{ color: '#C0392B' }}>{brl(ap.abertoTotal)}</b></div>
          {ap.abertoTotal > 0 && <button onClick={quitarTodos} style={s.actGreen}>✓ quitar todos</button>}
        </div>
        {cfgEdit && <CfgDesconto ap={ap} onSalvar={salvarCfg} onCancelar={() => setCfgEdit(false)} />}
        {!ap.itens?.length ? <div style={s.vazio}>Nenhum desconto lançado.</div> :
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ textAlign: 'left', color: '#7a8a8c' }}>{['Operador', 'Período', 'Valor', 'Contato → retorno', 'Agilidade', 'Status', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>{ap.itens.map(it => (
              <tr key={it.id} style={{ borderTop: '1px solid #f2f2f2', background: it.status === 'pago' ? '#F4FBF6' : '#fff' }}>
                <td style={{ ...s.td, fontWeight: 600 }}>{it.operador}{it.loja_nome ? <span style={{ color: '#aaa', fontWeight: 400 }}> · {it.loja_nome}</span> : ''}{it.obs ? <span style={{ color: '#aaa', fontWeight: 400 }} title={it.obs}> · obs</span> : ''}</td>
                <td style={{ ...s.td, color: '#666' }}>{it.de ? dBR(it.de) : ''}{it.ate && it.ate !== it.de ? '–' + dBR(it.ate) : ''}</td>
                <td style={{ ...s.td, color: '#C0392B', fontWeight: 700 }}>{brl(it.valor)}</td>
                <td style={{ ...s.td, color: '#666' }}>{it.contato_em ? `${hm(it.contato_em)} → ${it.retorno_em ? hm(it.retorno_em) : '—'}` : <span style={{ color: '#bbb' }}>—</span>}</td>
                <td style={s.td}>{it.no_prazo === 1 ? <span style={{ color: '#1E874B', fontWeight: 700 }}>no prazo ✓</span> : it.no_prazo === 0 ? <span style={{ color: '#C0392B', fontWeight: 700 }}>fora ✕</span> : <span style={{ color: '#bbb' }}>—</span>}</td>
                <td style={s.td}>{it.status === 'pago' ? <span style={{ color: '#1E874B', fontWeight: 600 }}>✓ quitado {it.pago_em ? dBR(it.pago_em) : ''}{it.origem_quitacao === 'estagio' ? ' (estágio)' : ''}</span> : <span style={{ color: '#B7791F', fontWeight: 600 }}>em aberto</span>}</td>
                <td style={s.td}>{it.status === 'aberto' ? <span style={{ display: 'flex', gap: 6 }}><button onClick={() => quitar(it.id)} style={s.actGreen}>quitar</button><button onClick={() => removerAp(it.id)} style={s.mv}>✕</button></span> : <button onClick={() => removerAp(it.id)} style={s.mv}>✕</button>}</td>
              </tr>))}</tbody>
          </table>
        </div>}
        <div style={s.nota}>💡 Vira desconto no ciclo (dia {ap.diaCorte}). Ao enviar p/ a folha de estágio, marque como quitado. O <b>contato</b> alimenta a <b>Agilidade</b> do Caixa Destaque (retorno dentro do SLA de {ap.slaHoras}h = ponto positivo).</div>
      </div>}

      {d?.erro && <div style={s.erroBox}>⚠️ {d.erro}</div>}
      <div style={s.card}>
        {carreg ? <div style={s.vazio}>carregando…</div> : !linhas.length ? <div style={s.vazio}>Nenhuma diferença no período.</div> :
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: 'left', color: '#7a8a8c', borderBottom: '2px solid #eef1f4' }}>{['Operador', 'Faltas', 'Total falta', 'Sobras', 'Total sobra', 'Saldo', 'Ação'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>{linhas.map(o => {
              const difs = (d?.quebras || []).filter(q => (q.operador || '').trim() === o.operador);
              return (
              <React.Fragment key={o.operador}>
              <tr onClick={() => setExp(exp === o.operador ? null : o.operador)} style={{ borderTop: '1px solid #f2f2f2', cursor: 'pointer', background: exp === o.operador ? '#f8fafc' : '#fff' }}>
                <td style={{ ...s.td, fontWeight: 600 }}><span style={{ color: '#94a3b8', marginRight: 4 }}>{exp === o.operador ? '▾' : '▸'}</span>{o.operador}{o.login ? <span style={{ color: '#aaa', fontWeight: 400 }}> · {o.login}</span> : ''}</td>
                <td style={s.td}>{o.nFalta}</td>
                <td style={{ ...s.td, color: '#C0392B', fontWeight: 700 }}>{brl(o.vFalta)}</td>
                <td style={s.td}>{o.nSobra}</td>
                <td style={{ ...s.td, color: '#1E874B' }}>{brl(o.vSobra)}</td>
                <td style={{ ...s.td, fontWeight: 700, color: o.saldo < 0 ? '#C0392B' : '#1E874B' }}>{brl(o.saldo)}</td>
                <td style={s.td}>{o.vFalta > 0 && <button onClick={e => { e.stopPropagation(); abrirApagar(o); }} style={{ ...s.actGreen, background: '#fff', color: '#b45309', border: '1px solid #f0c27a' }}>💰 a pagar</button>}</td>
              </tr>
              {exp === o.operador && <tr><td colSpan={7} style={{ padding: '2px 8px 10px 28px', background: '#fafbfc' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead><tr style={{ textAlign: 'left', color: '#94a3b8' }}>{['Data', 'Loja', 'Tipo', 'Valor', 'Origem', 'Observação'].map(h => <th key={h} style={{ padding: '3px 6px' }}>{h}</th>)}</tr></thead>
                  <tbody>{difs.map(q => (
                    <tr key={q.id}>
                      <td style={{ padding: '3px 6px' }}>{dBR(q.data)}</td>
                      <td style={{ padding: '3px 6px', color: '#666' }}>{q.loja}</td>
                      <td style={{ padding: '3px 6px', color: q.tipo === 'falta' ? '#C0392B' : '#1E874B' }}>{q.tipo === 'falta' ? '▼ falta' : '▲ sobra'}</td>
                      <td style={{ padding: '3px 6px', fontWeight: 600 }}>{brl(Math.abs(q.valor))}</td>
                      <td style={{ padding: '3px 6px', color: '#7c3aed' }}>{q.origem === 'correcao_cartao' ? '💳 cartão' : q.origem === 'sangria' ? '💸 sangria' : q.origem === 'avulso' ? '✍️ avulso' : ''}</td>
                      <td style={{ padding: '3px 6px', color: '#999' }}>{q.observacao || q.justificativaErp || ''}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </td></tr>}
              </React.Fragment>
              );
            })}</tbody>
          </table>
        </div>}
      </div>

      {/* Formulário: lançar a pagar + registrar o contato (agilidade) */}
      {apForm && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={() => setApForm(null)}>
      <div onClick={e => e.stopPropagation()} style={{ ...s.card, border: '1px solid #f0c27a', background: '#fffdf7', maxWidth: 560, width: '100%', margin: 0, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#b45309' }}>💰 A pagar — {apForm.operador}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={s.fld}>Valor (R$)<input value={apForm.valor} onChange={e => setApForm({ ...apForm, valor: e.target.value })} style={{ ...s.inp, width: 110 }} /></label>
          <label style={s.fld}>De<input type="date" value={apForm.de} onChange={e => setApForm({ ...apForm, de: e.target.value })} style={s.inp} /></label>
          <label style={s.fld}>Até<input type="date" value={apForm.ate} onChange={e => setApForm({ ...apForm, ate: e.target.value })} style={s.inp} /></label>
          <label style={s.fld}>Obs.<input value={apForm.obs} onChange={e => setApForm({ ...apForm, obs: e.target.value })} style={{ ...s.inp, minWidth: 160 }} placeholder="opcional" /></label>
        </div>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #f0c27a' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>🕐 Contato com o colaborador (mede a <b>Agilidade</b> — SLA {ap?.slaHoras || 4}h)</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={s.fld}>Entrei em contato às<input type="datetime-local" value={apForm.contato_em} onChange={e => setApForm({ ...apForm, contato_em: e.target.value })} style={s.inp} /></label>
            <label style={s.fld}>Me respondeu às<input type="datetime-local" value={apForm.retorno_em} onChange={e => setApForm({ ...apForm, retorno_em: e.target.value })} style={s.inp} /></label>
            {apForm.contato_em && apForm.retorno_em && (() => { const h = (new Date(apForm.retorno_em) - new Date(apForm.contato_em)) / 3600000; const ok = h >= 0 && h <= (ap?.slaHoras || 4); return <span style={{ fontSize: 12, fontWeight: 700, color: ok ? '#1E874B' : '#C0392B' }}>{h >= 0 ? `${h.toFixed(1)}h → ${ok ? 'no prazo ✓' : 'fora do prazo ✕'}` : 'retorno antes do contato?'}</span>; })()}
          </div>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button onClick={salvarApagar} style={s.actGreen}>Lançar a pagar</button>
          <button onClick={() => setApForm(null)} style={s.actGray}>Cancelar</button>
        </div>
      </div></div>}

    </>
  );
}

function CfgDesconto({ ap, onSalvar, onCancelar }) {
  const [dia, setDia] = useState(ap.diaCorte); const [sla, setSla] = useState(ap.slaHoras);
  return (
    <div style={{ ...s.card, background: '#f8fafc', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label style={s.fld}>Dia de corte do ciclo<input type="number" min={1} max={28} value={dia} onChange={e => setDia(e.target.value)} style={{ ...s.inp, width: 80 }} /></label>
      <label style={s.fld}>SLA de retorno (horas)<input type="number" min={1} value={sla} onChange={e => setSla(e.target.value)} style={{ ...s.inp, width: 90 }} /></label>
      <button onClick={() => onSalvar(Number(dia), Number(sla))} style={s.actGreen}>Salvar</button>
      <button onClick={onCancelar} style={s.actGray}>Cancelar</button>
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
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
function QuebrasErp({ API, soControle }) {
  const lojas = useLojasTes(API);
  const [ini, setIni] = useState(inicioMes()); const [fim, setFim] = useState(hojeISO());
  const [loja, setLoja] = useState(''); const [d, setD] = useState(null); const [carreg, setCarreg] = useState(false);
  const [limiar, setLimiar] = useState(5); const [soRel, setSoRel] = useState(false); const [soPend, setSoPend] = useState(false); const [busca, setBusca] = useState('');
  const [nomesAv, setNomesAv] = useState([]); const [avAberto, setAvAberto] = useState(false);
  const [avF, setAvF] = useState({ operador: '', valor: '', tipo: 'falta', data: hojeISO(), obs: '' });
  useEffect(() => { API.get('/tesouraria/colaboradores-nomes').then(r => setNomesAv(r.data.nomes || [])).catch(() => {}); }, [API]);
  const setAv = (k, v) => setAvF(x => ({ ...x, [k]: v }));
  const addAvulso = () => {
    if (!avF.operador.trim() || avF.valor === '' || Number(avF.valor) === 0) return;
    API.post('/tesouraria/diferenca-avulsa', { operador: avF.operador, valor: avF.valor, tipo: avF.tipo, data: avF.data, loja_id: loja || null, obs: avF.obs })
      .then(() => { setAvF(x => ({ ...x, operador: '', valor: '', obs: '' })); carregar(); });
  };
  const removerAv = (q) => { if (!window.confirm('Remover esta diferença avulsa?')) return; API.delete('/tesouraria/diferenca-avulsa/' + String(q.id).replace('av:', '')).then(carregar); };
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
  const marcar = (q, status, observacao) => API.post('/tesouraria/quebras/cobranca', { quebra: q, status, valorCobrado: status === 'cobrado' ? Math.abs(q.valor) : 0, observacao: observacao || undefined })
    .then(r => { const p = r.data?.pontos; if (p?.descontado) setMsg(`−${p.descontado} pts de ${p.colaborador}.`); else if (p?.removido) setMsg('Desconto de pontos revertido.'); else if (p?.semColaborador && status === 'pontuado') setMsg('⚠️ Operador sem colaborador vinculado por CPF — pontos não descontados.'); if (p?.descontado || p?.removido || p?.semColaborador) setTimeout(() => setMsg(''), 3500); return carregar(); });
  // Perdoar exige justificativa + decidir se CONSIDERA os pontos (Joe 2026-11-11): às vezes a diferença
  // não foi culpa do caixa (mexeram nele) — aí perdoa SEM descontar pontos. A justificativa e a decisão
  // ficam guardadas na apuração (a engine de pontos respeita o "sem pontos").
  const perdoar = (q) => {
    const j = (window.prompt('Justificativa para perdoar esta diferença:') || '').trim();
    if (!j) return;
    const comPontos = window.confirm('A diferença foi do CAIXA (operador)?\n\nOK = SIM — perdoar mas MANTER o desconto de pontos.\nCancelar = NÃO (ex.: mexeram no caixa) — perdoar SEM descontar pontos.');
    marcar(q, 'perdoado', (comPontos ? '[com pontos] ' : '[sem pontos] ') + j);
  };
  // A pagar + contato (Agilidade): registra que a gestão falou com o operador (às X) e ele retornou (às Y).
  const [apForm, setApForm] = useState(null); const [apMsg, setApMsg] = useState(''); const [slaH, setSlaH] = useState(4);
  useEffect(() => { API.get('/tesouraria/apagar-config').then(r => setSlaH(r.data.slaHoras || 4)).catch(() => {}); }, [API]);
  const ajustarSla = () => { const v = window.prompt('SLA de retorno da Agilidade (horas) — tempo máx. pro operador responder no contato de desconto:', slaH); if (v == null) return; const n = Math.max(1, Number(v) || 4); API.put('/tesouraria/apagar-config', { slaHoras: n }).then(() => setSlaH(n)).catch(() => {}); };
  const abrirApagar = (q) => setApForm({ operador: q.operador, loja_id: loja || '', valor: Math.abs(Number(q.valor) || 0).toFixed(2), de: q.data, ate: q.data, contato_em: '', retorno_em: '', obs: '' });
  const salvarApagar = () => {
    const f = apForm; if (!f) return;
    API.post('/tesouraria/apagar', { operador: f.operador, loja_id: f.loja_id || null, de: f.de, ate: f.ate, valor: Number(String(f.valor).replace(',', '.')), obs: f.obs, contato_em: f.contato_em || null, retorno_em: f.retorno_em || null })
      .then(r => { setApMsg(r.data.no_prazo === 1 ? '✅ Lançado — retorno no prazo (ganha Agilidade).' : r.data.no_prazo === 0 ? '✅ Lançado — retorno fora do prazo (sem Agilidade).' : '✅ Lançado a pagar.'); setApForm(null); setTimeout(() => setApMsg(''), 4000); })
      .catch(e => setApMsg('⚠️ ' + (e.response?.data?.erro || 'Falha.')));
  };
  const R = d?.resumo;
  const linhas = (d?.quebras || []).filter(q => !soRel || q.relevante).filter(q => !soPend || (q.relevante && q.cobranca?.status !== 'perdoado')).filter(q => !busca.trim() || (q.operador || '').toLowerCase().includes(busca.trim().toLowerCase()) || (q.login || '').toLowerCase().includes(busca.trim().toLowerCase()));
  const COLS = [
    { k: 'data', label: 'Data', tipo: 'txt', get: q => q.data || '' },
    { k: 'operador', label: 'Operador', tipo: 'txt', get: q => q.operador || '' },
    { k: 'loja', label: 'Loja', tipo: 'txt', get: q => q.loja || '' },
    { k: 'diferenca', label: 'Diferença', tipo: 'num', get: q => Number(q.valor) || 0 },
    { k: 'cobranca', label: soControle ? 'Apuração' : 'Cobrança', tipo: 'txt', get: q => soControle ? (q.cobranca?.status === 'perdoado' ? 'perdoado' : '—') : (q.cobranca?.status || 'pendente') },
    { k: 'obs', label: 'Obs.', tipo: 'txt', get: q => q.observacao || '' },
  ];
  const { linhas: linhasOrd, ordem, clicar, seta } = useOrdenavel(linhas, COLS, { col: 'data', dir: 'desc' });
  return (
    <>
      <PeriodoTes {...{ ini, setIni, fim, setFim, loja, setLoja, lojas }}>
        {!soControle && <label style={s.fld}>Limiar cobrança
          <span style={{ display: 'flex', gap: 4 }}>
            <input type="number" step="0.5" value={limiar} onChange={e => setLimiar(e.target.value)} style={{ ...s.inp, width: 68 }} />
            <button onClick={salvarLimiar} style={s.btnMini}>salvar</button>
          </span>
        </label>}
        {!soControle && <label style={s.fld}>Pontos −/quebra (só pontuar)
          <span style={{ display: 'flex', gap: 4 }}>
            <input type="number" min="0" value={pontosQuebra} onChange={e => setPontosQuebra(e.target.value)} style={{ ...s.inp, width: 68 }} title="Pontos da gamificação descontados do operador quando a quebra é marcada como 'só pontuar'" />
            <button onClick={salvarPontos} style={s.btnMini}>salvar</button>
          </span>
        </label>}
        {!soControle && <label style={s.fld}>Pontos +/caixa zerado
          <span style={{ display: 'flex', gap: 4 }}>
            <input type="number" min="0" value={czCfg} onChange={e => setCzCfg(e.target.value)} style={{ ...s.inp, width: 68 }} title="Pontos ganhos pelo operador quando fecha o caixa com diferença zero (0 = desliga). Padrão 100." />
            <button onClick={salvarCz} style={s.btnMini}>salvar</button>
          </span>
        </label>}
        <label style={{ ...s.fld, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <input type="checkbox" checked={soRel} onChange={e => setSoRel(e.target.checked)} /> só relevantes (&gt; R${limiar})
        </label>
        {soControle && <label style={{ ...s.fld, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <input type="checkbox" checked={soPend} onChange={e => setSoPend(e.target.checked)} /> só ação pendente
        </label>}
        <label style={s.fld}>🔍 Pessoa<input value={busca} onChange={e => setBusca(e.target.value)} placeholder="nome do operador" style={{ ...s.inp, minWidth: 160 }} /></label>
      </PeriodoTes>
      {soControle && <div style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: '#64748b', padding: '8px 12px' }}>
        🕐 <b style={{ color: '#334' }}>SLA de agilidade:</b> <b style={{ color: '#0d6b5e' }}>{slaH}h</b>
        <button onClick={ajustarSla} style={s.mv}>ajustar</button>
        <span style={{ color: '#94a3b8' }}>— tempo máximo pro operador responder no <b>contato</b> do "a pagar"; dentro do prazo = ponto de Agilidade no Caixa Destaque.</span>
      </div>}
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('⚠️') ? '#C0392B' : '#7A4FB0', margin: '0 0 8px' }}>{msg}</div>}
      {d?.erro && <div style={s.erroBox}>⚠️ {d.erro}</div>}
      {R && <div style={{ ...s.card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatTes n={R.faltas} l="Faltas" cor="#C0392B" bg="#FBEAEA" sub={brl(R.valorFalta)} />
        <StatTes n={R.sobras} l="Sobras" cor="#1E874B" bg="#EAF7EF" sub={brl(R.valorSobra)} />
        {!soControle && <StatTes n={R.acobrar} l={`Faltas a cobrar (>R$${d.limiar})`} cor="#8A2E2E" bg="#FBEAEA" sub={brl(R.valorAcobrar)} />}
        {!soControle && <StatTes n={R.pendentes} l="Cobranças pendentes" cor="#B7791F" bg="#FCF7EA" />}
        <StatTes n={R.sobrasRelevantes} l={`Sobras relevantes (>R$${d.limiar})`} cor="#2E5C9E" bg="#EEF3FB" />
      </div>}
      <div style={{ ...s.card, padding: '10px 12px' }}>
        <button onClick={() => setAvAberto(v => !v)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, color: '#0d6b5e', fontSize: 13 }}>{avAberto ? '▾' : '▸'} ➕ Lançar diferença avulsa (falta/sobra)</button>
        {avAberto && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
          <label style={s.fld}>Operador<input list="avColabsDL" value={avF.operador} onChange={e => setAv('operador', e.target.value)} style={{ ...s.inp, minWidth: 200 }} placeholder="buscar na base…" /></label>
          <label style={s.fld}>Tipo<select value={avF.tipo} onChange={e => setAv('tipo', e.target.value)} style={s.inp}><option value="falta">Falta (−)</option><option value="sobra">Sobra (+)</option></select></label>
          <label style={s.fld}>Valor (R$)<input type="number" step="0.01" value={avF.valor} onChange={e => setAv('valor', e.target.value)} style={{ ...s.inp, width: 110 }} placeholder="0,00" /></label>
          <label style={s.fld}>Data<input type="date" value={avF.data} onChange={e => setAv('data', e.target.value)} style={s.inp} /></label>
          <label style={s.fld}>Obs.<input value={avF.obs} onChange={e => setAv('obs', e.target.value)} style={{ ...s.inp, minWidth: 140 }} /></label>
          <button onClick={addAvulso} style={s.actGreen}>+ Lançar</button>
          <datalist id="avColabsDL">{nomesAv.map(n => <option key={n} value={n} />)}</datalist>
        </div>}
      </div>
      <div style={s.card}>
        {carreg ? <div style={s.vazio}>carregando…</div> : !linhas.length ? <div style={s.vazio}>Nenhuma quebra no período.</div> :
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{COLS.map((c) => (<React.Fragment key={c.k}><ThOrd c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />{c.k === 'cobranca' && <th style={s.th}>Ação</th>}</React.Fragment>))}</tr></thead>
          <tbody>{linhasOrd.map(q => { const [cor, lab] = ST_COBR[q.cobranca?.status] || ST_COBR.pendente;
            return (
            <tr key={q.id} style={{ borderTop: '1px solid #f2f2f2', background: q.acobrar && q.cobranca?.status === 'pendente' ? '#FFFCF5' : '#fff' }}>
              <td style={s.td}>{dBR(q.data)}</td>
              <td style={{ ...s.td, fontWeight: 600 }}>{q.operador}{q.login ? <span style={{ color: '#aaa', fontWeight: 400 }}> · {q.login}</span> : ''}{q.origem === 'correcao_cartao' && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#f3e8ff', borderRadius: 999, padding: '1px 7px' }}>💳 correção de cartão</span>}{q.origem === 'sangria' && <span title={q.justificativaErp || ''} style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#b45309', background: '#fdf0e6', borderRadius: 999, padding: '1px 7px' }}>💸 erro de sangria{q.depositoCorrecao > 0 ? ' · dep. ' + brl(q.depositoCorrecao) : ''}</span>}{q.origem === 'avulso' && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#0d6b5e', background: '#e6f4ef', borderRadius: 999, padding: '1px 7px' }}>✍️ avulso</span>}</td>
              <td style={{ ...s.td, color: '#666' }}>{q.loja}</td>
              <td style={{ ...s.td, fontWeight: 700, color: q.tipo === 'falta' ? '#C0392B' : '#1E874B' }}>
                {q.tipo === 'falta' ? '▼ falta ' : '▲ sobra '}{brl(Math.abs(q.valor))}{q.relevante ? <span style={{ fontSize: 10, marginLeft: 4, color: '#B7791F' }}>●</span> : ''}
              </td>
              <td style={s.td}>{soControle
                ? (q.cobranca?.status === 'perdoado'
                    ? (() => { const obs = q.cobranca?.observacao || ''; const semP = obs.startsWith('[sem pontos]'); const comP = obs.startsWith('[com pontos]'); const just = obs.replace(/^\[(sem|com) pontos\]\s*/, ''); const dt = q.cobranca?.resolvidoEm ? String(q.cobranca.resolvidoEm).slice(0, 10) : ''; return <span style={{ color: '#15803d', fontWeight: 700, fontSize: 11.5 }} title={just}>✅ perdoado{semP ? ' · s/ pontos' : comP ? ' · c/ pontos' : ''}{dt ? ' · ' + dBR(dt) : ''}{just ? ' ⓘ' : ''}</span>; })()
                    : <span style={{ color: '#bbb' }}>—</span>)
                : <><span style={{ color: cor, fontWeight: 700, fontSize: 11.5 }}>{lab}</span>{q.cobranca?.valorCobrado > 0 ? <span style={{ color: '#888' }}> · {brl(q.cobranca.valorCobrado)}</span> : ''}</>}</td>
              <td style={s.td}>{q.avulso
                ? <button onClick={() => removerAv(q)} style={{ ...s.actGray, color: '#b91c1c' }}>🗑 remover</button>
                : soControle
                ? (q.relevante
                    ? (q.cobranca?.status === 'perdoado'
                        ? <button onClick={() => marcar(q, 'pendente')} style={s.actGray}>reabrir</button>
                        : <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}><button onClick={() => perdoar(q)} style={s.actGray}>perdoar</button>{q.tipo === 'falta' && <button onClick={() => abrirApagar(q)} style={{ ...s.actGreen, background: '#fff', color: '#b45309', border: '1px solid #f0c27a' }}>💰 a pagar</button>}</span>)
                    : <span style={{ color: '#bbb' }}>—</span>)
                : (q.cobranca?.status === 'pendente'
                  ? <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {q.tipo === 'falta' && <button onClick={() => marcar(q, 'cobrado')} style={s.actGreen}>cobrar {brl(Math.abs(q.valor))}</button>}
                      <button onClick={() => marcar(q, 'pontuado')} style={s.actGray}>só pontuar</button>
                      <button onClick={() => perdoar(q)} style={s.actGray}>perdoar</button>
                    </span>
                  : <button onClick={() => marcar(q, 'pendente')} style={s.actGray}>reabrir</button>)}
              </td>
              <td style={{ ...s.td, color: '#999', fontSize: 11, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.observacao || q.justificativaErp || ''}>{q.observacao || q.justificativaErp || ''}</td>
            </tr>); })}</tbody>
        </table></div>}
      </div>
      {apMsg && <div style={{ ...s.card, fontSize: 12.5, color: apMsg[0] === '✅' ? '#1E874B' : '#B7791F' }}>{apMsg}</div>}
      {apForm && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={() => setApForm(null)}>
      <div onClick={e => e.stopPropagation()} style={{ ...s.card, border: '1px solid #f0c27a', background: '#fffdf7', maxWidth: 560, width: '100%', margin: 0, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#b45309' }}>💰 A pagar — {apForm.operador}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={s.fld}>Valor (R$)<input value={apForm.valor} onChange={e => setApForm({ ...apForm, valor: e.target.value })} style={{ ...s.inp, width: 110 }} /></label>
          <label style={s.fld}>Data<input type="date" value={apForm.de} onChange={e => setApForm({ ...apForm, de: e.target.value, ate: e.target.value })} style={s.inp} /></label>
          <label style={s.fld}>Obs.<input value={apForm.obs} onChange={e => setApForm({ ...apForm, obs: e.target.value })} style={{ ...s.inp, minWidth: 160 }} placeholder="opcional" /></label>
        </div>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #f0c27a' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>🕐 Contato com o colaborador (mede a <b>Agilidade</b> — SLA {slaH}h)</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={s.fld}>Entrei em contato às<input type="datetime-local" value={apForm.contato_em} onChange={e => setApForm({ ...apForm, contato_em: e.target.value })} style={s.inp} /></label>
            <label style={s.fld}>Me respondeu às<input type="datetime-local" value={apForm.retorno_em} onChange={e => setApForm({ ...apForm, retorno_em: e.target.value })} style={s.inp} /></label>
            {apForm.contato_em && apForm.retorno_em && (() => { const h = (new Date(apForm.retorno_em) - new Date(apForm.contato_em)) / 3600000; const ok = h >= 0 && h <= slaH; return <span style={{ fontSize: 12, fontWeight: 700, color: ok ? '#1E874B' : '#C0392B' }}>{h >= 0 ? `${h.toFixed(1)}h → ${ok ? 'no prazo ✓' : 'fora do prazo ✕'}` : 'retorno antes do contato?'}</span>; })()}
          </div>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button onClick={salvarApagar} style={s.actGreen}>Lançar a pagar</button>
          <button onClick={() => setApForm(null)} style={s.actGray}>Cancelar</button>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>O desconto aparece/gerencia na aba <b>Débitos por caixa</b> (quitar, quitar todos, ciclo). Aqui você só lança e registra o contato.</div>
      </div></div>}
      <div style={s.nota}>💡 Quebras vêm direto do ERP (fechamento de caixa). Faltas acima do limiar entram para <b>cobrança do operador</b> — <b>além</b> da pontuação no Caixa Destaque. Sobras relevantes (●) exigem justificativa.</div>
    </>
  );
}

// ── Aba: Indicadores do setor ───────────────────────────────────────────────
// Aba Saldos (banco): o financeiro anota, por conta, a data da última conciliação e o saldo (substitui a planilha).
function SaldosBanco({ API }) {
  const [d, setD] = useState(null); const [msg, setMsg] = useState(''); const [ed, setEd] = useState({});
  const [busca, setBusca] = useState(''); const [obsOpen, setObsOpen] = useState({});
  const carregar = useCallback(() => API.get('/tesouraria/saldos-banco').then(r => setD(r.data.contas || [])).catch(() => setD([])), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const setF = (id, k, v) => setEd(e => ({ ...e, [id]: { ...(e[id] || {}), [k]: v } }));
  const salvar = (c) => {
    const f = ed[c.conta_id] || {};
    API.put('/tesouraria/saldos-banco', { conta_id: c.conta_id, conta_nome: c.conta_nome, loja_erp: c.loja_erp, data_conciliacao: f.data != null ? f.data : c.data_conciliacao, saldo: f.saldo != null ? f.saldo : c.saldo, obs: f.obs != null ? f.obs : c.obs })
      .then(() => { setMsg('✅ Salvo: ' + c.conta_nome); setEd(e => { const n = { ...e }; delete n[c.conta_id]; return n; }); carregar(); setTimeout(() => setMsg(''), 2500); })
      .catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Falha.')));
  };
  const dBRs = x => x ? String(x).slice(0, 10).split('-').reverse().join('/') : '—';
  const atrasoDias = x => x ? Math.round((Date.now() - new Date(x + 'T12:00:00').getTime()) / 86400000) : null;
  const toggleObs = id => setObsOpen(o => ({ ...o, [id]: !o[id] }));
  const lista = (d || []).filter(c => !busca.trim() || (c.conta_nome || '').toLowerCase().includes(busca.trim().toLowerCase()));
  return (
    <>
      <div style={{ ...s.card, fontSize: 12.5, color: '#64748b' }}>💡 Controle de saldo bancário (substitui a planilha): o financeiro anota, por conta, a <b>data da última conciliação</b> e o <b>saldo</b> conferido naquela data. A coluna <b>Sistema</b> mostra até quando o extrato já foi conciliado, pra comparar.</div>
      <div style={{ ...s.card, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔎 Buscar conta / banco…" style={{ ...s.inp, minWidth: 280 }} />
        {d && <span style={{ fontSize: 12, color: '#888' }}>{lista.length}/{d.length} contas</span>}
      </div>
      {msg && <div style={{ ...s.card, fontSize: 12.5, color: msg[0] === '✅' ? '#1E874B' : '#B7791F' }}>{msg}</div>}
      <div style={s.card}>
        {!d ? <div style={s.vazio}>carregando…</div> : !lista.length ? <div style={s.vazio}>Nenhuma conta encontrada.</div> :
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: 'left', color: '#7a8a8c', borderBottom: '2px solid #eef1f4' }}>{['Conta / Banco', 'Data última conciliação', 'Saldo (R$)', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>{lista.map(c => { const f = ed[c.conta_id] || {}; const dataVal = f.data != null ? f.data : (c.data_conciliacao || ''); const atr = atrasoDias(dataVal); const obsVal = f.obs != null ? f.obs : (c.obs || '');
              return (
              <React.Fragment key={c.conta_id}>
              <tr style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={{ ...s.td, fontWeight: 700, fontSize: 13.5, width: '100%' }}>{c.conta_nome}</td>
                <td style={{ ...s.td, verticalAlign: 'top' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}><input type="date" value={dataVal} onChange={e => setF(c.conta_id, 'data', e.target.value)} style={{ ...s.inp, padding: '5px 7px' }} />{atr != null && <span style={{ fontSize: 10.5, color: atr > 7 ? '#C0392B' : '#15803d' }}>{atr}d</span>}</span>
                  <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 3, whiteSpace: 'nowrap' }}>Sistema: {dBRs(c.conciliado_ate_sistema)}{c.pendentes > 0 ? <span style={{ color: '#b45309' }}> · {c.pendentes} pend.</span> : ''}</div>
                </td>
                <td style={{ ...s.td, verticalAlign: 'top' }}><input type="number" step="0.01" value={f.saldo != null ? f.saldo : (c.saldo != null ? c.saldo : '')} onChange={e => setF(c.conta_id, 'saldo', e.target.value)} style={{ ...s.inp, width: 130, padding: '5px 7px' }} placeholder="0,00" /></td>
                <td style={{ ...s.td, verticalAlign: 'top' }}><span style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}><button onClick={() => salvar(c)} style={s.actGreen}>salvar</button><button onClick={() => toggleObs(c.conta_id)} title="observação" style={{ ...s.mv, color: obsVal ? '#0d6b5e' : '#888' }}>📝{obsVal ? ' •' : ''}</button></span></td>
              </tr>
              {obsOpen[c.conta_id] && <tr><td colSpan={4} style={{ padding: '0 8px 10px 8px' }}><input value={obsVal} onChange={e => setF(c.conta_id, 'obs', e.target.value)} placeholder="Observação…" style={{ ...s.inp, width: '100%', padding: '6px 9px' }} /></td></tr>}
              </React.Fragment>);
            })}</tbody>
          </table>
        </div>}
      </div>
    </>
  );
}

// Aba Metas: seletor de CICLO DE FECHAMENTO (ou período livre) + painel de metas.
function MetasSetorTab({ API, diretoria = false }) {
  const lojas = useLojasTes(API);
  const [ini, setIni] = useState(inicioMes()); const [fim, setFim] = useState(hojeISO()); const [loja, setLoja] = useState('');
  const [ciclos, setCiclos] = useState([]); const [selCiclo, setSelCiclo] = useState('');
  useEffect(() => { API.get('/tesouraria/ciclos-fechamento?n=6').then(r => { const cs = r.data.ciclos || []; setCiclos(cs); if (cs[0]) { setSelCiclo(cs[0].ano + '-' + cs[0].periodo); setIni(cs[0].ini); setFim(cs[0].fim); } }).catch(() => {}); }, [API]);
  const escolherCiclo = (val) => { setSelCiclo(val); const c = ciclos.find(x => (x.ano + '-' + x.periodo) === val); if (c) { setIni(c.ini); setFim(c.fim); } };
  const manIni = v => { setSelCiclo(''); setIni(v); }; const manFim = v => { setSelCiclo(''); setFim(v); };
  return (
    <>
      <div style={{ ...s.card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={s.fld}>Ciclo de fechamento<select value={selCiclo} onChange={e => escolherCiclo(e.target.value)} style={{ ...s.inp, minWidth: 210 }}>
          <option value="">Personalizado (De/Até)</option>
          {ciclos.map(c => <option key={c.ano + '-' + c.periodo} value={c.ano + '-' + c.periodo}>{c.label}{c.atual ? ' — atual' : ''}</option>)}
        </select></label>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>O ciclo (a cada N meses, dia de corte) é configurado no <b>Caixa Destaque → ⚙️ Ciclo</b>.</span>
      </div>
      <PeriodoTes ini={ini} setIni={manIni} fim={fim} setFim={manFim} loja={loja} setLoja={setLoja} lojas={lojas} />
      <MetasSetor API={API} ini={ini} fim={fim} loja={loja} diretoria={diretoria} />
      <FaixasPremio API={API} ini={ini} fim={fim} diretoria={diretoria} />
    </>
  );
}

// Faixas do prêmio por pilar (Joe 2026-11-11): cada pilar vale até R$ teto; paga proporcional à nota,
// e 100% paga teto + 50% (bônus, já que a nota não passa de 100). O valor é do CHEFE (fator 1); cada
// pessoa vinculada recebe o total × o fator dela (estagiária 0,5 = metade). Cada um vê o seu na Minha área.
function FaixasPremio({ API, ini, fim, diretoria = false }) {
  const [cfg, setCfg] = useState(null); const [ap, setAp] = useState(null); const [cols, setCols] = useState([]);
  const [teto, setTeto] = useState(''); const [bonus, setBonus] = useState(''); const [novo, setNovo] = useState({ colaborador_id: '', fator: 100 }); const [msg, setMsg] = useState('');
  const carregar = useCallback(() => {
    API.get('/tesouraria/premio').then(r => { setCfg(r.data); setTeto(r.data.premioValor); setBonus(r.data.bonusPct != null ? Math.round(r.data.bonusPct * 100) : 50); }).catch(() => {});
    API.get('/tesouraria/metas', { params: { ini, fim } }).then(r => setAp(r.data)).catch(() => {});
  }, [API, ini, fim]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/tesouraria/colaboradores-nomes').then(r => setCols(r.data.colaboradores || [])).catch(() => {}); }, [API]);
  const flash = t => { setMsg(t); setTimeout(() => setMsg(''), 2500); };
  const salvarTeto = () => API.put('/tesouraria/premio', { valor: Number(teto), bonusPct: Number(bonus) / 100 }).then(() => { flash('✅ Salvo.'); carregar(); }).catch(() => flash('⚠️ Erro.'));
  const addPessoa = () => { if (!novo.colaborador_id) return flash('⚠️ Escolha o colaborador.'); API.post('/tesouraria/premio/pessoa', { colaborador_id: novo.colaborador_id, fator: Number(novo.fator) / 100 }).then(() => { setNovo({ colaborador_id: '', fator: 100 }); carregar(); }).catch(e => flash('⚠️ ' + (e.response?.data?.erro || 'erro'))); };
  const remover = id => API.delete('/tesouraria/premio/pessoa/' + id).then(carregar).catch(() => {});
  const premioDe = cid => { const x = (ap?.pessoas || []).find(y => y.colaborador_id === cid); return x ? x.premioTotal : null; };
  const teto1 = Number(cfg?.premioValor) || 100; const bpct = cfg?.bonusPct != null ? Number(cfg.bonusPct) : 0.5; const tetoMax = teto1 * (1 + bpct);
  const jaTem = new Set((cfg?.pessoas || []).map(p => p.colaborador_id));
  const disp = cols.filter(c => !jaTem.has(c.id));
  return (
    <div style={{ ...s.card, marginTop: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>🏆 Faixas do prêmio por pilar</div>
      <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 10px' }}>Cada um dos <b>5 pilares</b> vale até <b>R$ {teto1.toLocaleString('pt-BR')}</b> e paga <b>proporcional à nota</b>. Como a nota não passa de 100, <b>bater 100% paga o teto + {Math.round(bpct * 100)}% de bônus</b>. Some os 5 pilares — esse é o prêmio do <b>chefe</b>. Cada pessoa vinculada recebe esse total <b>× o fator</b> dela.</p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[[0, 0], [50, teto1 * .5], [75, teto1 * .75], [100, tetoMax]].map(([pct, v]) => (
            <div key={pct} style={{ textAlign: 'center', background: pct === 100 ? '#eef7f2' : '#f8fafc', border: '1px solid ' + (pct === 100 ? '#cdeadd' : '#eef2f0'), borderRadius: 10, padding: '7px 12px', minWidth: 72 }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{pct}%{pct === 100 ? ' ★' : ''}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0d6b5e' }}>{brl(v)}</div>
            </div>
          ))}
          <div style={{ textAlign: 'center', background: '#0d6b5e', color: '#fff', borderRadius: 10, padding: '7px 12px', minWidth: 90 }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: .85 }}>máx (5 pilares)</div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{brl(tetoMax * 5)}</div>
          </div>
        </div>
        {diretoria && <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginLeft: 'auto' }}>
          <label style={s.fld}>Teto R$/pilar<input type="number" value={teto} onChange={e => setTeto(e.target.value)} style={{ ...s.inp, width: 90 }} /></label>
          <label style={s.fld}>Bônus 100% (%)<input type="number" min={0} value={bonus} onChange={e => setBonus(e.target.value)} style={{ ...s.inp, width: 80 }} title="Quanto paga a mais ao bater 100% no pilar" /></label>
          <button onClick={salvarTeto} style={s.actGreen}>Salvar</button>
        </div>}
      </div>
      {ap?.premioTotalChefe != null && <div style={{ fontSize: 12.5, color: '#334', marginBottom: 8 }}>No ciclo selecionado o chefe faria <b style={{ color: '#0d6b5e' }}>{brl(ap.premioTotalChefe)}</b> (nota geral {ap.notaGeral ?? '—'}/100).</div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ textAlign: 'left', color: '#7a8a8c', borderBottom: '2px solid #eef1f4' }}>{['Pessoa', 'Fator', 'Prêmio no ciclo', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {(cfg?.pessoas || []).map(p => (
              <tr key={p.colaborador_id} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={s.td}><b>{p.nome}</b></td>
                <td style={s.td}>{Math.round(p.fator * 100)}%</td>
                <td style={{ ...s.td, fontWeight: 700, color: '#0d6b5e' }}>{premioDe(p.colaborador_id) == null ? '—' : brl(premioDe(p.colaborador_id))}</td>
                <td style={s.td}>{diretoria && <button onClick={() => remover(p.colaborador_id)} style={{ ...s.mv, color: '#C0392B', borderColor: '#f1b4ab' }}>remover</button>}</td>
              </tr>
            ))}
            {!(cfg?.pessoas || []).length && <tr><td colSpan={4} style={{ ...s.td, color: '#94a3b8' }}>Ninguém vinculado ainda. Adicione o chefe (100%) e o estagiário (50%).</td></tr>}
          </tbody>
        </table>
      </div>
      {diretoria && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e5e7eb' }}>
        <label style={s.fld}>Colaborador<select value={novo.colaborador_id} onChange={e => setNovo(n => ({ ...n, colaborador_id: e.target.value }))} style={{ ...s.inp, minWidth: 220 }}>
          <option value="">Selecione…</option>
          {disp.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select></label>
        <label style={s.fld}>Fator (%)<input type="number" min={0} max={500} value={novo.fator} onChange={e => setNovo(n => ({ ...n, fator: e.target.value }))} style={{ ...s.inp, width: 90 }} /></label>
        <button onClick={addPessoa} style={s.actGreen}>+ Vincular</button>
        {msg && <span style={{ fontSize: 12.5, fontWeight: 600, color: msg.startsWith('⚠️') ? '#b91c1c' : '#15803d' }}>{msg}</span>}
      </div>}
      {!diretoria && <div style={{ fontSize: 11, color: '#999', marginTop: 10 }}>🔒 Só a Diretoria edita metas e premiação.</div>}
    </div>
  );
}
// Metas do setor Tesouraria — alvo cadastrável + realizado automático + farol (Joe 2026-11-11).
function MetasSetor({ API, ini, fim, loja, diretoria = false }) {
  const [d, setD] = useState(null); const [carreg, setCarreg] = useState(false); const [edit, setEdit] = useState(false);
  const [sug, setSug] = useState(null); const [red, setRed] = useState(10); const [sugCarreg, setSugCarreg] = useState(false);
  const carregar = useCallback((forcar) => { setCarreg(true); API.get('/tesouraria/metas', { params: { ini, fim, loja, ...(forcar ? { forcar: 1 } : {}) } }).then(r => setD(r.data)).catch(() => setD(null)).finally(() => setCarreg(false)); }, [API, ini, fim, loja]);
  useEffect(() => { carregar(); }, [carregar]);
  const salvarMeta = (chave, v) => API.put('/tesouraria/metas/config', { chave, meta_valor: v }).then(() => carregar(true)).catch(() => {});
  const pedirSugestao = () => { setSugCarreg(true); setSug(null); API.get('/tesouraria/metas/sugerir', { params: { reducao: red, ciclos: 3 } }).then(r => setSug(r.data)).catch(() => setSug(null)).finally(() => setSugCarreg(false)); };
  const aplicarSug = () => { if (!sug) return; API.post('/tesouraria/metas/aplicar-sugestoes', { sugestoes: sug.sugestoes }).then(() => { setSug(null); carregar(true); }).catch(() => {}); };
  const COR = { verde: '#15803d', amarelo: '#B7791F', vermelho: '#C0392B', sem_dados: '#94a3b8' };
  const ICON = { verde: '🟢', amarelo: '🟡', vermelho: '🔴', sem_dados: '⚪' };
  const nf = (v, u) => v == null ? '—' : (u === '%' ? (Math.round(v * 10) / 10) + '%' : (Math.round(v * 10) / 10));
  const R = d?.resumo || {};
  return (
    <div style={s.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>🎯 Metas do setor</div>
        {d?.cache?.atualizado_em && <span style={{ fontSize: 11, color: '#94a3b8' }}>salvo em {String(d.cache.atualizado_em).slice(0, 16).replace('T', ' ')}</span>}
        {d && <span style={{ display: 'flex', gap: 8, fontSize: 12.5 }}><b style={{ color: COR.verde }}>🟢 {R.verde || 0}</b><b style={{ color: COR.amarelo }}>🟡 {R.amarelo || 0}</b><b style={{ color: COR.vermelho }}>🔴 {R.vermelho || 0}</b>{R.sem ? <span style={{ color: COR.sem_dados }}>⚪ {R.sem}</span> : null}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {diretoria && <button onClick={() => setEdit(v => !v)} style={s.mv}>{edit ? 'fechar' : '⚙️ metas'}</button>}
          <button onClick={() => carregar(true)} disabled={carreg} style={{ ...s.actGray, color: '#0d6b5e', borderColor: '#0d6b5e' }}>{carreg ? '⏳' : '🔄 Atualizar'}</button>
        </div>
      </div>
      {!d ? <div style={s.vazio}>{carreg ? '⏳ Calculando as metas… (puxa do ERP, pode levar alguns segundos)' : 'Sem dados.'}</div> :
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: 'left', color: '#7a8a8c', borderBottom: '2px solid #eef1f4' }}>{['', 'Indicador', 'Meta', 'Realizado', 'Status'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>{(d.metas || []).map(m => (
            <tr key={m.chave} style={{ borderTop: '1px solid #f2f2f2' }}>
              <td style={{ ...s.td, fontSize: 15 }} title={m.farol}>{ICON[m.farol]}</td>
              <td style={s.td}><b>{m.label}</b><div style={{ fontSize: 10.5, color: '#94a3b8' }}>{m.grupo} · {m.desc}</div></td>
              <td style={s.td}>{edit
                ? <input type="number" defaultValue={m.meta} onBlur={e => { if (Number(e.target.value) !== m.meta) salvarMeta(m.chave, e.target.value); }} style={{ ...s.inp, width: 80, padding: '4px 6px' }} />
                : <span style={{ color: '#64748b' }}>{m.direcao === 'menor' ? '≤ ' : '≥ '}{nf(m.meta, m.unidade)}</span>}</td>
              <td style={{ ...s.td, fontWeight: 700, color: COR[m.farol] }}>{nf(m.realizado, m.unidade)}{m.detalhe && <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>{m.detalhe}</div>}</td>
              <td style={{ ...s.td, fontWeight: 700, color: COR[m.farol] }}>{m.farol === 'verde' ? 'no alvo' : m.farol === 'amarelo' ? 'atenção' : m.farol === 'vermelho' ? 'fora' : 'sem dados'}</td>
            </tr>))}</tbody>
        </table>
      </div>}
      {edit && <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e5e7eb' }}>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>Edite o alvo e saia do campo pra salvar. “≥” = quanto maior melhor; “≤” = quanto menor melhor. O realizado é calculado do sistema no período selecionado.</div>
        <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334' }}>✨ Sugerir alvos pela base histórica</div>
            <label style={s.fld}>Melhorar em (%)<input type="number" min={0} value={red} onChange={e => setRed(e.target.value)} style={{ ...s.inp, width: 80 }} /></label>
            <button onClick={pedirSugestao} disabled={sugCarreg} style={s.actGreen}>{sugCarreg ? '⏳ calculando…' : 'Sugerir pela média dos últimos 3 ciclos'}</button>
            {sug && <button onClick={aplicarSug} style={{ ...s.actGreen, background: '#0d6b5e' }}>✓ Aplicar todas</button>}
          </div>
          {sug && <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Base: média de {sug.ciclos?.map(c => c.label).join(' · ')}. Sugestão = base {sug.reducao}% melhor.</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ textAlign: 'left', color: '#7a8a8c' }}>{['Indicador', 'Média histórica', 'Alvo atual', 'Sugerido'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>{(sug.sugestoes || []).map(x => (
                <tr key={x.chave} style={{ borderTop: '1px solid #f2f2f2' }}>
                  <td style={s.td}>{x.label}</td>
                  <td style={{ ...s.td, color: '#64748b' }}>{x.baseline == null ? '—' : (x.unidade === '%' ? x.baseline + '%' : x.baseline)}</td>
                  <td style={{ ...s.td, color: '#94a3b8' }}>{x.direcao === 'menor' ? '≤ ' : '≥ '}{x.unidade === '%' ? x.metaAtual + '%' : x.metaAtual}</td>
                  <td style={{ ...s.td, fontWeight: 700, color: '#0d6b5e' }}>{x.sugerido == null ? '—' : (x.direcao === 'menor' ? '≤ ' : '≥ ') + (x.unidade === '%' ? x.sugerido + '%' : x.sugerido)}</td>
                </tr>))}</tbody>
            </table>
          </div>}
        </div>
      </div>}
    </div>
  );
}

// Metas do setor em CARDS (número grande + cor do farol) — mesmo estilo dos indicadores do Setor.
export function MetasCards({ API, ini, fim, loja, endpoint = '/tesouraria/metas' }) {
  const [d, setD] = useState(null); const [carreg, setCarreg] = useState(false); const [det, setDet] = useState(null); const [pilarSel, setPilarSel] = useState(null);
  const carregar = useCallback((forcar) => { setCarreg(true); API.get(endpoint, { params: { ini, fim, loja, ...(forcar ? { forcar: 1 } : {}) } }).then(r => setD(r.data)).catch(() => setD(null)).finally(() => setCarreg(false)); }, [API, ini, fim, loja, endpoint]);
  useEffect(() => { carregar(); }, [carregar]);
  const COR = { verde: '#15803d', amarelo: '#B7791F', vermelho: '#C0392B', sem_dados: '#94a3b8' };
  const BG = { verde: '#EAF7EF', amarelo: '#FCF7EA', vermelho: '#FBEAEA', sem_dados: '#F6F7F9' };
  const nf = (v, u) => v == null ? '—' : (u === '%' ? (Math.round(v * 10) / 10) + '%' : (Math.round(v * 10) / 10) + (u === 'dias' ? 'd' : ''));
  const notaCor = n => n == null ? COR.sem_dados : n >= 80 ? COR.verde : n >= 50 ? COR.amarelo : COR.vermelho;
  const metasShow = pilarSel ? (d?.metas || []).filter(m => m.grupo === pilarSel) : [];
  return (
    <div style={s.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>🎯 Metas do setor</div>
        {d?.notaGeral != null && <span style={{ fontSize: 13 }}>Nota geral: <b style={{ color: notaCor(d.notaGeral), fontSize: 17 }}>{d.notaGeral}</b><span style={{ color: '#999' }}>/100</span></span>}
        {d?.premioTotalChefe != null && <span style={{ fontSize: 12.5, background: '#eef7f2', border: '1px solid #cdeadd', color: '#0d6b5e', borderRadius: 999, padding: '3px 10px', fontWeight: 700 }} title="Prêmio do CHEFE (fator 1) no ciclo. Estagiário recebe pela fração dele.">🏆 Prêmio: {brl(d.premioTotalChefe)}</span>}
        <button onClick={() => carregar(true)} disabled={carreg} style={{ ...s.actGray, marginLeft: 'auto', color: '#0d6b5e', borderColor: '#0d6b5e' }}>{carreg ? '⏳' : '🔄 Atualizar'}</button>
      </div>
      {d?.pilares && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
        {d.pilares.map(p => (
          <div key={p.pilar} onClick={() => setPilarSel(pilarSel === p.pilar ? null : p.pilar)} style={{ background: BG[p.farol], border: '2px solid ' + (pilarSel === p.pilar ? COR[p.farol] : 'transparent'), borderRadius: 12, padding: '10px 12px', cursor: 'pointer' }} title="clique para ver só este pilar">
            <div style={{ fontSize: 12, fontWeight: 700, color: '#334' }}>{p.pilar}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: notaCor(p.nota), lineHeight: 1.15 }}>{p.nota == null ? '—' : p.nota}<span style={{ fontSize: 12, color: '#999', fontWeight: 600 }}>/100</span></div>
            <div style={{ fontSize: 11 }}><span style={{ color: COR.verde }}>🟢{p.verde}</span> <span style={{ color: COR.amarelo }}>🟡{p.amarelo}</span> <span style={{ color: COR.vermelho }}>🔴{p.vermelho}</span></div>
            {p.premio != null && <div style={{ fontSize: 12, fontWeight: 800, color: '#0d6b5e', marginTop: 3 }}>{brl(p.premio)}{p.bonus && <span title="100% = teto + 50% de bônus" style={{ fontSize: 10, color: '#B7791F' }}> ★</span>}</div>}
          </div>
        ))}
      </div>}
      {pilarSel && <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 8 }}>Indicadores do pilar <b>{pilarSel}</b>. <button onClick={() => setPilarSel(null)} style={s.mv}>fechar</button></div>}
      {!d ? <div style={s.vazio}>{carreg ? '⏳ Calculando as metas…' : 'Sem dados.'}</div> : !pilarSel ? <div style={{ fontSize: 12.5, color: '#94a3b8', padding: '10px 2px', textAlign: 'center' }}>👆 Clique num pilar acima para ver os indicadores dele.</div> :
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
        {metasShow.map(m => (
          <div key={m.chave} onClick={() => setDet(m)} style={{ background: BG[m.farol], border: '1px solid ' + COR[m.farol] + '44', borderRadius: 12, padding: '11px 14px', cursor: 'pointer' }} title="clique para entender">
            <div style={{ fontSize: 11.5, color: '#555', fontWeight: 600, minHeight: 30 }}>{m.label} <span style={{ color: COR[m.farol] }}>ⓘ</span></div>
            <div style={{ fontSize: 27, fontWeight: 800, color: COR[m.farol], margin: '2px 0', lineHeight: 1.1 }}>{nf(m.realizado, m.unidade)}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
              <span style={{ color: '#777' }}>Meta {m.direcao === 'menor' ? '≤' : '≥'} {nf(m.meta, m.unidade)}</span>
              <b style={{ color: COR[m.farol] }}>{m.farol === 'verde' ? 'no alvo' : m.farol === 'amarelo' ? 'atenção' : m.farol === 'vermelho' ? 'fora' : '—'}</b>
            </div>
            {m.detalhe && <div style={{ fontSize: 10, color: '#999', marginTop: 3 }}>{m.detalhe}</div>}
            <div style={{ fontSize: 9.5, color: '#bbb', marginTop: 2, textTransform: 'uppercase', letterSpacing: .3 }}>{m.grupo}</div>
          </div>
        ))}
      </div>}
      {det && <MetaModal m={det} onClose={() => setDet(null)} />}
    </div>
  );
}

function BlocoMeta({ t, children }) {
  return <div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: .3, marginBottom: 2 }}>{t}</div><div style={{ fontSize: 13, color: '#334', lineHeight: 1.45 }}>{children}</div></div>;
}
function MetaModal({ m, onClose }) {
  const COR = { verde: '#15803d', amarelo: '#B7791F', vermelho: '#C0392B', sem_dados: '#94a3b8' };
  const nf = (v, u) => v == null ? '—' : (u === '%' ? (Math.round(v * 10) / 10) + '%' : (Math.round(v * 10) / 10) + (u === 'dias' ? ' dias' : ''));
  const statusTxt = { verde: '✅ No alvo', amarelo: '🟡 Atenção', vermelho: '🔴 Fora do alvo', sem_dados: '⚪ Sem dados' }[m.farol];
  const ACAO = {
    'Conciliação': 'Concilie/importe os EXTRATOS e relatórios de cartão pendentes MAIS ANTIGOS — é a partir deles que o saldo deixa de bater. Atraso de centenas de dias = linha/item órfão antigo (limpeza pontual). Registre a data e o saldo conferido na aba Saldos (banco).',
    'Fechamento': 'Garanta o anexo do depósito/despesa de cada loja no fechamento do dia.',
    'Diferenças': 'Trate as diferenças relevantes (apurar/perdoar/cobrar) na aba Diferenças, quite os débitos no ciclo e registre o contato de desconto dentro do SLA.',
    'Orçamento': 'Confira os gastos de orçamento (fiscal × Alpha 7) e acompanhe a verba das lojas.',
    'Risco': 'Acompanhe cancelamentos/estornos/erros por operador e trate quem está fora do padrão.',
  }[m.grupo] || 'Acompanhe e trate os itens fora do padrão.';
  // COMO O NÚMERO É CALCULADO (a mecânica real, por meta) — pedido do Joe: "não tá claro como é feita a análise".
  const CALCULO = {
    fechamento_completo: 'Conta as lojas operacionais no dia e vê quantas já têm pelo menos 1 depósito anexado. Número = lojas com depósito ÷ lojas operacionais × 100.',
    dif_pendentes: 'Varre as faltas de caixa do período acima do limiar e conta as que ainda não foram apuradas, perdoadas nem cobradas. Número = quantidade dessas pendentes.',
    reducao_faltas: 'Soma o valor das faltas do período e compara com o período anterior de mesmo tamanho. Número = variação % (negativo = caiu).',
    agilidade_sla: 'Dos contatos de desconto com "entrei em contato" e "me respondeu" preenchidos, vê em quantos o retorno veio dentro do SLA. Número = no prazo ÷ respondidos × 100.',
    conferencia_pendente: 'Conta os gastos de orçamento anexados no período que o escritório ainda não marcou como fiscal/não fiscal. Número = quantidade pendente.',
    alpha_nao_lancado: 'Para cada gasto de orçamento anexado, procura no Alpha 7 (movimento da conta Orçamento da loja) um lançamento do mesmo valor. Número = % dos gastos sem par no Alpha 7.',
    verba_estourada: 'Compara o consumido com a verba de cada loja no período. Número = quantas lojas ficaram com saldo de orçamento negativo.',
    cancelamentos: 'Conta as vendas canceladas (status C) no ERP e divide pelo total de vendas fechadas (status F) do período. Número = %.',
    estornos: 'Conta os estornos de venda do período no ERP e divide pelo total de vendas fechadas. Número = %.',
    erros_cartao: 'Conta as correções de modalidade (troca de forma de pagamento) feitas no ERP e divide pelo total de vendas fechadas. Número = %.',
    conc_banco_contas: 'Para cada conta ativa, acha no ERP o extrato mais antigo ainda SEM conciliação (desde out/2026) e conta os dias até hoje. Número = o da PIOR conta (não é média).',
    conc_banco_import: 'Nas contas de movimento diário, compara a data do extrato com a data em que o arquivo entrou no sistema (localização). Número = o maior atraso entre essas contas.',
    cartao_alpha_atraso: 'No ERP (Nexxera/Alpha 7), acha o item de cartão já vencido e ainda sem baixa mais antigo (desde out/2026). Número = dias desde o vencimento dele.',
    cartao_nosso_casado: 'Confronta linha a linha o relatório das credenciadoras — a conferência automática (EDI) + os relatórios que a gente sobe — contra o ERP. Número = casados ÷ total de linhas × 100 (média ponderada das duas fontes).',
    saldo_conferido: 'Pega as contas em uso (com movimento nos últimos 60 dias) e verifica, na aba Saldos, se o financeiro anotou o saldo com data igual ou posterior à última conciliação do sistema. Número = quantas contas estão sem esse saldo em dia.',
    // Retail (Meu Setor do trade)
    prosp_mes: 'Conta as prospecções que você abriu no funil no mês corrente (tmkt_prospeccao) e compara com a sua meta efetiva do mês.',
    contatos_mes: 'Conta os contatos (ligações/visitas) que você registrou nas prospecções no mês e compara com a meta de contatos.',
    fech_mes: 'Conta as prospecções que viraram "ganho" no mês (fechamento) e compara com a sua meta de fechamentos.',
    espacos_mes: 'Soma os espaços de contratos assinados no mês que contam pra premiação (informativo, sem meta fixa).',
    tarefas_atraso: 'Conta as suas tarefas de trade ainda abertas com prazo vencido.',
    cobrancas_venc: 'Conta as suas prospecções (não ganhas/perdidas) com o próximo contato marcado para uma data já vencida.',
  }[m.chave];
  const alvo = (m.direcao === 'menor' ? '≤ ' : '≥ ') + nf(m.meta, m.unidade);
  const explica = m.farol === 'verde' ? `Está no alvo: o realizado (${nf(m.realizado, m.unidade)}) está ${m.direcao === 'menor' ? 'dentro do limite' : 'acima do mínimo'} da meta (${alvo}).`
    : m.farol === 'sem_dados' ? 'Não há dados suficientes no período selecionado para calcular este indicador.'
      : `${m.farol === 'amarelo' ? 'Perto do limite' : 'Fora do alvo'}: o realizado é ${nf(m.realizado, m.unidade)} e a meta é ${alvo}.`;
  const ehAtrasoDias = m.unidade === 'dias' && m.direcao === 'menor';
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 20, width: 'min(520px,94vw)', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{m.label}</div>
        <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 12 }}>{m.grupo}</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', marginBottom: 12 }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: COR[m.farol], lineHeight: 1 }}>{nf(m.realizado, m.unidade)}</div>
          <div style={{ fontSize: 13, color: '#555' }}>Meta {alvo}<br /><b style={{ color: COR[m.farol] }}>{statusTxt}</b></div>
        </div>
        <BlocoMeta t="O que significa">{explica}{ehAtrasoDias && ' É o item MAIS ANTIGO pendente (não é média) — por isso um único item velho já joga o número lá pra cima.'}</BlocoMeta>
        <BlocoMeta t="Como é medido">{m.desc}</BlocoMeta>
        {CALCULO && <BlocoMeta t="Como é calculado">{CALCULO}</BlocoMeta>}
        {m.detalhe && <BlocoMeta t="Situação atual">{m.detalhe}</BlocoMeta>}
        {m.farol !== 'verde' && m.farol !== 'sem_dados' && <BlocoMeta t="O que fazer">{ACAO}</BlocoMeta>}
        <div style={{ textAlign: 'right', marginTop: 14 }}><button onClick={onClose} style={s.actGray}>Fechar</button></div>
      </div>
    </div>
  );
}

function IndicadoresSetor({ API }) {
  const lojas = useLojasTes(API);
  const [ini, setIni] = useState(inicioMes()); const [fim, setFim] = useState(hojeISO());
  const [loja, setLoja] = useState('');
  return (
    <>
      <PeriodoTes {...{ ini, setIni, fim, setFim, loja, setLoja, lojas }} />
      <MetasCards API={API} ini={ini} fim={fim} loja={loja} />
      <div style={s.nota}>💡 Metas do <b>setor de tesouraria</b> (chefe) — não dos operadores de caixa. Clique num card pra entender a situação e o que fazer.</div>
      <SetorObservacoes API={API} base="/tesouraria/observacoes" />
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
  mv: { fontSize: 11, padding: '3px 7px', background: '#fff', color: '#888', border: '1px solid #e2e2e2', borderRadius: 6, cursor: 'pointer' },
  th: { textAlign: 'left', fontSize: 11, color: '#888', padding: '5px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  td: { textAlign: 'left', padding: '6px 8px' },
  vazio: { fontSize: 12.5, color: '#aaa', textAlign: 'center', padding: 14 },
  nota: { fontSize: 11.5, color: '#888', background: '#F6F7F9', borderRadius: 8, padding: '8px 10px', marginBottom: 10 },
  erroBox: { background: '#FBEAEA', border: '1px solid #F0C7C7', color: '#8A2E2E', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, marginBottom: 10 },
};
