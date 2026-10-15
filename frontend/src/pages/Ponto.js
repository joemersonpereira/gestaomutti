import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import EscalaHorario from '../components/EscalaHorario';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';

const hojeISO = () => new Date().toISOString().slice(0, 10);
const inicioMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const dBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
const hhmm = ms => ms ? new Date(Number(ms)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
const lista = r => Array.isArray(r) ? r : (r?.content || r?.data || r?.result || r?.items || []);

export default function Ponto() {
  const { API } = useAuth();
  const [status, setStatus] = useState(null);
  const [aba, setAba] = useState('resumo');
  const [cfgOpen, setCfgOpen] = useState(false);
  useEffect(() => { API.get('/ponto/status').then(r => setStatus(r.data)).catch(() => setStatus({ habilitado: false })); }, [API]);

  return (
    <div style={s.wrap}>
      <Banner emoji="🕐" titulo="Ponto (Tangerino)" cor="ciano" sub="Batidas, atrasos e espelho integrados ao Tangerino, confrontados com folgas e afastamentos do RH." />
      {status && !status.habilitado
        ? <div style={{ ...s.card, background: '#FCF7EA', borderColor: '#F0E0BE', color: '#8A6D3B', fontSize: 13 }}>⚠️ Integração não configurada. Cole o <b>TANGERINO_TOKEN</b> no <code>backend/.env</code> e reinicie.</div>
        : <>
          <div style={{ display: 'flex', gap: 6, margin: '10px 0 14px', flexWrap: 'wrap', alignItems: 'center' }}>
            {[['resumo', '📊 Resumo RH'], ['escala', '🗓️ Escala'], ['faltas', '⛔ Faltas'], ['batidas', '🕐 Batidas'], ['vinculos', '🔗 Vínculos'], ['correcoes', '✏️ Correções'], ['atestados', '🩺 Atestados']].map(([v, l]) =>
              <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
            <button onClick={() => setCfgOpen(true)} style={{ ...s.btnMini, marginLeft: 'auto' }}>⚙️ Penalidade</button>
          </div>
          {cfgOpen && <ConfigPenalidade API={API} onClose={() => setCfgOpen(false)} />}
          {status && status.prazoAberto === false && <div style={{ ...s.card, background: '#FBEAEA', borderColor: '#F0C7C7', color: '#8A2E2E', fontSize: 12.5 }}>🔒 Prazo de correção de ponto <b>encerrado</b> este mês (era até o dia {status.prazoDia}). Reabre no próximo mês.</div>}
          {aba === 'resumo' && <ResumoRH API={API} status={status} />}
          {aba === 'escala' && <EscalaHorario API={API} />}
          {aba === 'faltas' && <Faltas2 API={API} />}
          {aba === 'batidas' && <Batidas API={API} />}
          {aba === 'vinculos' && <Vinculos API={API} />}
          {aba === 'correcoes' && <Correcoes API={API} />}
          {aba === 'atestados' && <Atestados API={API} />}
        </>}
    </div>
  );
}

function PeriodoLoja({ ini, setIni, fim, setFim, loja, setLoja, lojas, children }) {
  return (
    <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label style={s.lbl}>De<input type="date" value={ini} onChange={e => setIni(e.target.value)} style={s.inp} /></label>
      <label style={s.lbl}>Até<input type="date" value={fim} onChange={e => setFim(e.target.value)} style={s.inp} /></label>
      {setLoja && <label style={s.lbl}>Loja<select value={loja} onChange={e => setLoja(e.target.value)} style={s.inp}><option value="">Todas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>}
      {children}
    </div>
  );
}

const SIT = {
  ok: ['#1E874B', 'trabalhou'], pendente: ['#B7791F', 'punção incompleta'], falta: ['#C0392B', 'FALTA'],
  folga: ['#2E5C9E', 'folga'], afastado: ['#7A4FB0', 'afastado'],
};

function ResumoRH({ API, status }) {
  const [ini, setIni] = useState(inicioMes()); const [fim, setFim] = useState(hojeISO());
  const [loja, setLoja] = useState(''); const [lojas, setLojas] = useState([]);
  const [d, setD] = useState(null); const [msg, setMsg] = useState(''); const [aberto, setAberto] = useState({});
  useEffect(() => { API.get('/compras/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  const buscar = () => { setMsg('Apurando…'); setD(null); API.get('/ponto/resumo', { params: { ini, fim, loja: loja || undefined } }).then(r => { setD(r.data); setMsg(r.data.aviso || ''); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Falha.'))); };
  return (
    <div>
      <PeriodoLoja {...{ ini, setIni, fim, setFim, loja, setLoja, lojas }}><button onClick={buscar} style={s.btn}>📊 Apurar</button></PeriodoLoja>
      {msg && <div style={{ ...s.card, fontSize: 12.5, color: msg[0] === '⚠' ? '#C0392B' : '#666' }}>{msg}</div>}
      {d?.colaboradores?.map(c => {
        const alerta = c.faltas + c.pendencias;
        return (
          <div key={c.id} style={{ ...s.card, borderLeft: `4px solid ${alerta ? '#C0392B' : '#1E874B'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, cursor: 'pointer' }} onClick={() => setAberto(a => ({ ...a, [c.id]: !a[c.id] }))}>
              <div><b>{c.nome}</b> <span style={{ color: '#999', fontSize: 12 }}>{c.loja || ''}</span></div>
              <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                {c.faltas > 0 && <span style={{ color: '#C0392B', fontWeight: 700 }}>{c.faltas} falta(s)</span>}
                {c.pendencias > 0 && <span style={{ color: '#B7791F', fontWeight: 700 }}>{c.pendencias} incompleta(s)</span>}
                <span style={{ color: '#1E874B' }}>{c.trabalhados} dia(s)</span>
                {c.folga > 0 && <span style={{ color: '#2E5C9E' }}>{c.folga} folga(s)</span>}
                {c.afastado > 0 && <span style={{ color: '#7A4FB0' }}>{c.afastado} afast.</span>}
                <span style={{ color: '#bbb' }}>{aberto[c.id] ? '▲' : '▼'}</span>
              </div>
            </div>
            {aberto[c.id] && <div style={{ marginTop: 8, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr>{['Data', 'Situação', 'Marcações do dia', 'Qtd', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>{c.dias.map(x => { const [cor, lab] = SIT[x.situacao] || ['#666', x.situacao]; const marcs = x.marcacoes || []; const q = x.qtd || 0;
                  return (
                  <tr key={x.data} style={{ borderTop: '1px solid #f2f2f2' }}>
                    <td style={s.td}>{dBR(x.data)}</td>
                    <td style={s.td}><span style={{ color: cor, fontWeight: 700 }}>{lab}</span>{x.motivo && x.situacao === 'pendente' ? <span style={{ color: '#8A6D3B', fontWeight: 400, fontSize: 11 }}> · {x.motivo}</span> : null}</td>
                    <td style={s.td}>{marcs.length ? marcs.map((m, i) => <span key={i}>{i ? ' · ' : ''}<b style={{ color: i % 2 ? '#C0392B' : '#1E874B' }}>{hhmm(m)}</b></span>) : '—'}</td>
                    <td style={{ ...s.td, color: q && q !== 4 && q % 2 === 0 ? '#B7791F' : q % 2 ? '#C0392B' : '#666', fontWeight: q === 4 ? 400 : 700 }}>{q ? q + (q % 2 ? ' (aberta)' : q < 4 ? ' (s/ almoço?)' : '') : '—'}</td>
                    <td style={s.td}>{(x.situacao === 'falta' || x.situacao === 'pendente') && <PedirCorrecao API={API} colabId={c.id} data={x.data} prazoAberto={status?.prazoAberto !== false} prazoDia={status?.prazoDia} />}</td>
                  </tr>); })}</tbody>
              </table>
              <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 4 }}>Dia completo = 4 marcações (entrada · saída almoço · volta · saída). Verde = entradas, vermelho = saídas.</div>
            </div>}
          </div>
        );
      })}
      {d?.colaboradores?.length === 0 && !d.aviso && <div style={s.card}>Sem faltas/pendências no período. 👏</div>}
      {d?.semRegistros?.length > 0 && <div style={{ ...s.card, fontSize: 12, color: '#8A6D3B', background: '#FCF7EA', borderColor: '#F0E0BE' }}>
        ⚪ {d.semRegistros.length} vinculado(s) sem <b>nenhuma</b> batida no período (cargo que não pica ponto, férias não lançadas ou vínculo a conferir): {d.semRegistros.slice(0, 12).map(c => c.nome).join(', ')}{d.semRegistros.length > 12 ? '…' : ''}
      </div>}
    </div>
  );
}

function PedirCorrecao({ API, colabId, data, prazoAberto = true, prazoDia }) {
  const [aberto, setAberto] = useState(false); const [f, setF] = useState({ tipo: 'entrada', horario: '', motivo: '' }); const [ok, setOk] = useState(false); const [err, setErr] = useState('');
  const enviar = () => API.post('/ponto/correcoes', { colaborador_id: colabId, data, ...f }).then(() => { setOk(true); setAberto(false); }).catch(e => setErr(e.response?.data?.erro || 'Falha.'));
  if (ok) return <span style={{ fontSize: 11, color: '#1E874B' }}>✔ solicitada</span>;
  if (!prazoAberto) return <span style={{ fontSize: 10.5, color: '#B7791F' }} title={`Correções só até dia ${prazoDia || 26}`}>🔒 prazo encerrado</span>;
  if (err) return <span style={{ fontSize: 10.5, color: '#C0392B' }}>{err}</span>;
  if (!aberto) return <button onClick={() => setAberto(true)} style={s.mv}>pedir correção</button>;
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      <select value={f.tipo} onChange={e => setF(x => ({ ...x, tipo: e.target.value }))} style={{ ...s.inp, padding: '3px 5px' }}>{['entrada', 'saida', 'falta', 'abono'].map(t => <option key={t}>{t}</option>)}</select>
      <input type="time" value={f.horario} onChange={e => setF(x => ({ ...x, horario: e.target.value }))} style={{ ...s.inp, padding: '3px 5px' }} />
      <input placeholder="motivo" value={f.motivo} onChange={e => setF(x => ({ ...x, motivo: e.target.value }))} style={{ ...s.inp, padding: '3px 5px', width: 110 }} />
      <button onClick={enviar} style={s.mv}>enviar</button>
    </span>
  );
}

function Batidas({ API }) {
  const [ini, setIni] = useState(inicioMes()); const [fim, setFim] = useState(hojeISO());
  const [colabs, setColabs] = useState([]); const [emp, setEmp] = useState(''); const [batidas, setBatidas] = useState(null); const [msg, setMsg] = useState('');
  useEffect(() => { API.get('/ponto/colaboradores', { params: { size: 300 } }).then(r => setColabs(lista(r.data))).catch(() => {}); }, [API]);
  const buscar = () => { setMsg('Buscando…'); setBatidas(null); API.get('/ponto/batidas', { params: { ini, fim, employeeId: emp || undefined } }).then(r => { setBatidas(lista(r.data)); setMsg(''); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Falha.'))); };
  const espelho = () => { setMsg('Gerando espelho…'); API.get('/ponto/espelho', { params: { ini, fim, employeeId: emp || undefined } }).then(r => { const b64 = r.data?.base64FileContent; if (!b64) { setMsg('⚠️ Espelho vazio.'); return; } const a = document.createElement('a'); a.href = 'data:application/pdf;base64,' + b64; a.download = r.data?.fileName || 'espelho.pdf'; a.click(); setMsg('✅ Espelho baixado.'); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Falha.'))); };
  const COLS = [
    { k: 'colaborador', label: 'Colaborador', get: b => b.employeeName || `#${b.employeeId}`, tipo: 'txt' },
    { k: 'data', label: 'Data', get: b => b.date || '', tipo: 'txt' },
    { k: 'entrada', label: 'Entrada', get: b => Number(b.dateIn) || 0, tipo: 'num' },
    { k: 'saida', label: 'Saída', get: b => Number(b.dateOut) || 0, tipo: 'num' },
    { k: 'plataforma', label: 'Plataforma', get: b => b.plataform || '', tipo: 'txt' },
  ];
  const { linhas, ordem, clicar, seta } = useOrdenavel(batidas, COLS, { col: 'colaborador', dir: 'asc' });
  return (
    <div>
      <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={s.lbl}>Colaborador<select value={emp} onChange={e => setEmp(e.target.value)} style={s.inp}><option value="">Todos</option>{colabs.map(c => <option key={c.id} value={c.id}>{c.name || c.nome}</option>)}</select></label>
        <label style={s.lbl}>De<input type="date" value={ini} onChange={e => setIni(e.target.value)} style={s.inp} /></label>
        <label style={s.lbl}>Até<input type="date" value={fim} onChange={e => setFim(e.target.value)} style={s.inp} /></label>
        <button onClick={buscar} style={s.btn}>🔎 Buscar</button>
        <button onClick={espelho} style={s.btnMini}>📄 Espelho (PDF)</button>
      </div>
      {msg && <div style={{ ...s.card, fontSize: 13, color: msg[0] === '✅' ? '#1E874B' : '#B7791F' }}>{msg}</div>}
      {batidas && (!batidas.length ? <div style={s.card}>Nenhuma batida.</div> : <div style={{ ...s.card, overflowX: 'auto' }}>
        <div style={{ fontSize: 12.5, color: '#666', marginBottom: 6 }}>{batidas.length} marcação(ões)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{COLS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />)}</tr></thead>
          <tbody>{linhas.map((b, i) => (
            <tr key={b.id || i} style={{ borderTop: '1px solid #f0f0f0' }}>
              <td style={s.td}>{b.employeeName || `#${b.employeeId}`}</td><td style={s.td}>{dBR(b.date)}</td>
              <td style={s.td}>{hhmm(b.dateIn)}</td><td style={s.td}>{hhmm(b.dateOut)}</td>
              <td style={{ ...s.td, color: '#888' }}>{b.plataform || '—'}{(b.edited || b.editedIn || b.editedOut) ? ' ✏️' : ''}</td>
            </tr>))}</tbody>
        </table>
      </div>)}
    </div>
  );
}

function Vinculos({ API }) {
  const [d, setD] = useState(null); const [msg, setMsg] = useState(''); const [busca, setBusca] = useState('');
  const carregar = useCallback(() => API.get('/ponto/vinculos').then(r => setD(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const auto = () => { setMsg('Casando por CPF…'); API.post('/ponto/vincular-cpf').then(r => { setMsg(`✅ ${r.data.vinculados} vinculado(s) por CPF (${r.data.tangerinoTotal} no Tangerino; ${r.data.semCpf} sem CPF no Mutti).`); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Falha.'))); };
  const desvincular = id => API.post(`/ponto/vincular/${id}`, { tangerino_id: '', tangerino_nome: '' }).then(carregar);
  const rows = (d?.vinculos || []).filter(v => !busca || v.nome.toLowerCase().includes(busca.toLowerCase()));
  return (
    <div>
      <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={auto} style={s.btn}>🔗 Vincular automaticamente por CPF</button>
        {d && <span style={{ fontSize: 12.5, color: '#666' }}>{d.vinculados}/{d.total} vinculados</span>}
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔎 colaborador…" style={{ ...s.inp, marginLeft: 'auto', width: 200 }} />
      </div>
      {msg && <div style={{ ...s.card, fontSize: 12.5, color: msg[0] === '✅' ? '#1E874B' : '#B7791F' }}>{msg}</div>}
      <div style={s.card}>
        <div style={{ fontSize: 11.5, color: '#999', marginBottom: 6 }}>O vínculo é por CPF. Também aparece no cadastro do colaborador. Sem vínculo, o Resumo RH não traz as batidas dele.</div>
        {rows.map(v => (
          <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '6px 0', borderTop: '1px solid #f2f2f2' }}>
            <span>{v.tangerino_id ? '🟢' : '⚪'} <b>{v.nome}</b> <span style={{ color: '#aaa' }}>CPF {v.cpf || '—'}</span></span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {v.tangerino_id ? <><span style={{ color: '#1E874B', fontSize: 11.5 }}>Tangerino: {v.tangerino_nome || v.tangerino_id}</span><button onClick={() => desvincular(v.id)} style={s.mv}>desvincular</button></>
                : <span style={{ color: '#C0392B', fontSize: 11.5 }}>sem vínculo</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Correcoes({ API }) {
  const [d, setD] = useState(null); const [listas, setListas] = useState({ justificativas: [], motivos: [] });
  const carregar = useCallback(() => API.get('/ponto/correcoes').then(r => setD(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); API.get('/ponto/justificativas').then(r => setListas(r.data)).catch(() => {}); }, [API, carregar]);
  const cor = st => st === 'aprovada' ? '#1E874B' : st === 'rejeitada' ? '#C0392B' : '#B7791F';
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Solicitações de correção de ponto</div>
      <div style={{ fontSize: 11.5, color: '#999', marginBottom: 8 }}>Pedidas no Resumo RH ("pedir correção" em faltas/pendências). Ao <b>aprovar</b>, o RH escolhe a justificativa/motivo e o sistema <b>empurra a correção direto para o Tangerino</b>.</div>
      {d && d.correcoes.length === 0 && <div style={s.vazio}>Nenhuma correção solicitada.</div>}
      {d?.correcoes?.map(co => (
        <div key={co.id} style={{ fontSize: 12.5, padding: '8px 0', borderTop: '1px solid #f2f2f2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span><span style={{ color: cor(co.status), fontWeight: 700 }}>{co.status}</span> · <b>{co.colaborador}</b> · {dBR(co.data)} · {co.tipo}{co.horario ? ` ${co.horario}` : ''}{co.motivo ? ` — ${co.motivo}` : ''}</span>
            {d.gestor && co.status === 'pendente' && <AprovarCorrecao API={API} co={co} listas={listas} onDone={carregar} />}
          </div>
          {co.resposta && <div style={{ fontSize: 11, color: co.resposta.includes('FALHOU') ? '#C0392B' : '#1E874B', marginTop: 2 }}>{co.resposta}</div>}
        </div>
      ))}
    </div>
  );
}

function AprovarCorrecao({ API, co, listas, onDone }) {
  const [abrir, setAbrir] = useState(false); const [sel, setSel] = useState(''); const [msg, setMsg] = useState('');
  const usaJustificativa = co.tipo === 'entrada' || co.tipo === 'saida';
  const opcoes = usaJustificativa ? (listas.justificativas || []) : (listas.motivos || []);
  const semLista = opcoes.length === 0; // ex.: justificativas de edição manual não listadas
  const aprovar = () => {
    const body = { status: 'aprovada' };
    if (sel) { if (usaJustificativa) body.justificationId = sel; else body.reasonId = sel; }
    setMsg('Enviando…');
    API.post(`/ponto/correcoes/${co.id}/resolver`, body).then(() => { setMsg(''); onDone(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Falha.')));
  };
  const rejeitar = () => API.post(`/ponto/correcoes/${co.id}/resolver`, { status: 'rejeitada' }).then(onDone);
  if (!abrir) return <span style={{ display: 'flex', gap: 6 }}>
    <button onClick={() => setAbrir(true)} style={{ ...s.mv, color: '#1E874B' }}>aprovar</button>
    <button onClick={rejeitar} style={{ ...s.mv, color: '#C0392B' }}>rejeitar</button>
  </span>;
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {semLista
        ? <span style={{ fontSize: 11, color: '#B7791F' }}>{usaJustificativa ? 'sem justificativa listada — aprova no sistema (lançar batida manual no Tangerino)' : 'sem motivos'}</span>
        : <select value={sel} onChange={e => setSel(e.target.value)} style={{ ...s.inp, padding: '4px 6px' }}>
          <option value="">{usaJustificativa ? 'justificativa…' : 'motivo do abono…'}</option>
          {opcoes.map(o => <option key={o.id} value={o.id}>{o.descricao}</option>)}
        </select>}
      <button onClick={aprovar} disabled={!semLista && !sel} style={{ ...s.mv, color: '#1E874B', opacity: (semLista || sel) ? 1 : .5 }}>confirmar</button>
      <button onClick={() => setAbrir(false)} style={s.mv}>✕</button>
      {msg && <span style={{ fontSize: 11, color: '#B7791F' }}>{msg}</span>}
    </span>
  );
}

function ConfigPenalidade({ API, onClose }) {
  const [c, setC] = useState(null); const [msg, setMsg] = useState('');
  useEffect(() => { API.get('/ponto/config').then(r => setC(r.data)).catch(() => {}); }, [API]);
  const set = (k, v) => setC(x => ({ ...x, [k]: v }));
  const salvar = () => { setMsg('Salvando…'); API.post('/ponto/config', c).then(r => { setC(r.data); setMsg('✅ Salvo.'); setTimeout(() => setMsg(''), 2000); }).catch(() => setMsg('⚠️ falha')); };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 18, width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><b style={{ fontSize: 15 }}>⚙️ Penalidade de ponto</b><button onClick={onClose} style={s.btnMini}>✕</button></div>
        {!c && <div style={s.card}>Carregando…</div>}
        {c && <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={c.jobAtivo} onChange={e => set('jobAtivo', e.target.checked)} /> <b>Monitorar ponto</b> — gerar tarefas de pendência/falta (recomendado)
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={c.penalidade} onChange={e => set('penalidade', e.target.checked)} /> <b>Descontar pontos</b> na gamificação
          </label>
          {c.penalidade && <div style={{ background: '#FCF7EA', border: '1px solid #F0E0BE', borderRadius: 8, padding: 10, fontSize: 12, color: '#8A6D3B' }}>⚠️ Com isso ligado, o sistema desconta pontos automaticamente. Avise a equipe antes.</div>}
          <div style={{ display: 'flex', gap: 10, opacity: c.penalidade ? 1 : .5 }}>
            <label style={{ ...s.lbl, flex: 1 }}>Ponto incompleto: pts por 24h<input type="number" value={c.ptsIncompleto} onChange={e => set('ptsIncompleto', Number(e.target.value))} disabled={!c.penalidade} style={s.inp} /></label>
            <label style={{ ...s.lbl, flex: 1 }}>Falta confirmada: pts<input type="number" value={c.ptsFalta} onChange={e => set('ptsFalta', Number(e.target.value))} disabled={!c.penalidade} style={s.inp} /></label>
          </div>
          <label style={{ ...s.lbl }}>📅 Prazo p/ pedir correção — até o dia<input type="number" min="1" max="28" value={c.prazoDia || 26} onChange={e => set('prazoDia', Number(e.target.value))} style={{ ...s.inp, width: 90 }} /><span style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>de cada mês (depois, trava)</span></label>
          <div style={{ fontSize: 11, color: '#999' }}>Padrão: monitorar ligado, desconto <b>desligado</b>. Ligue o desconto só quando a regra estiver combinada com o time.</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><button onClick={salvar} style={s.btn}>Salvar</button>{msg && <span style={{ fontSize: 12, color: '#666' }}>{msg}</span>}</div>
        </div>}
      </div>
    </div>
  );
}

function Faltas2({ API }) {
  const [d, setD] = useState(null); const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/ponto/faltas').then(r => setD(r.data.faltas || [])).catch(() => setD([])), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const confirmar = id => { setMsg('Confirmando falta (−50 pts)…'); API.post(`/ponto/faltas/${id}/confirmar`).then(() => { setMsg(''); carregar(); }).catch(() => setMsg('⚠️ falha')); };
  const folga = id => API.post(`/ponto/faltas/${id}/folga`).then(carregar);
  const pend = (d || []).filter(f => !f.confirmada);
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>⛔ Faltas a confirmar</div>
      <div style={{ fontSize: 11.5, color: '#999', marginBottom: 8 }}>Dias em que a loja operou e o colaborador não bateu ponto (sem folga registrada). <b>Você decide</b>: foi falta (−50 pts) ou era folga (justifica, sem desconto). Isso evita punir folga não lançada.</div>
      {msg && <div style={{ fontSize: 12, color: '#B7791F', marginBottom: 6 }}>{msg}</div>}
      {d && pend.length === 0 && <div style={s.vazio}>Nenhuma falta a confirmar. 👍</div>}
      {pend.map(f => (
        <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, padding: '7px 0', borderTop: '1px solid #f2f2f2' }}>
          <span><b>{f.colaborador}</b> <span style={{ color: '#999' }}>{f.loja || ''}</span> · {dBR(f.data)}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => confirmar(f.id)} style={{ ...s.mv, color: '#C0392B' }}>⛔ Falta (−50)</button>
            <button onClick={() => folga(f.id)} style={{ ...s.mv, color: '#2E5C9E' }}>🌴 Era folga</button>
          </span>
        </div>
      ))}
    </div>
  );
}

function Atestados({ API }) {
  const [d, setD] = useState(null); const [ver, setVer] = useState(null);
  const carregar = useCallback(() => API.get('/ponto/atestados').then(r => setD(r.data.atestados || [])).catch(() => setD([])), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const resolver = (id, status) => API.post(`/ponto/atestados/${id}/resolver`, { status }).then(carregar);
  const badge = st => ({ pendente: ['#B7791F', 'em análise'], aprovado: ['#1E874B', 'aprovado'], rejeitado: ['#C0392B', 'rejeitado'] }[st] || ['#666', st]);
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🩺 Atestados enviados pelos colaboradores</div>
      <div style={{ fontSize: 11.5, color: '#999', marginBottom: 8 }}>Ao <b>aprovar</b>, o abono (ATESTADO MÉDICO) é lançado no Tangerino para o colaborador vinculado.</div>
      {d && d.length === 0 && <div style={s.vazio}>Nenhum atestado.</div>}
      {d?.map(a => { const [cor, lab] = badge(a.status); return (
        <div key={a.id} style={{ padding: '8px 0', borderTop: '1px solid #f2f2f2', fontSize: 12.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span><span style={{ color: cor, fontWeight: 700 }}>{lab}</span> · <b>{a.colaborador}</b> · {dBR(a.data_inicio)}{a.data_fim && a.data_fim !== a.data_inicio ? ' a ' + dBR(a.data_fim) : ''}{a.motivo ? ` · ${a.motivo}` : ''}{!a.tangerino_id ? ' · ⚠️ sem vínculo Tangerino' : ''}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              {a.anexo_url && <button onClick={() => setVer(ver === a.id ? null : a.id)} style={s.mv}>{ver === a.id ? 'ocultar' : 'ver anexo'}</button>}
              {a.status === 'pendente' && <>
                <button onClick={() => resolver(a.id, 'aprovado')} style={{ ...s.mv, color: '#1E874B' }}>aprovar</button>
                <button onClick={() => resolver(a.id, 'rejeitado')} style={{ ...s.mv, color: '#C0392B' }}>rejeitar</button>
              </>}
            </span>
          </div>
          {ver === a.id && a.anexo_url && (String(a.anexo_url).startsWith('data:application/pdf')
            ? <iframe title="atestado" src={a.anexo_url} style={{ width: '100%', height: 400, border: '1px solid #eee', borderRadius: 8, marginTop: 6 }} />
            : <img alt="atestado" src={a.anexo_url} style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8, marginTop: 6 }} />)}
        </div>); })}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1150, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 12 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 10 },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  btn: { fontSize: 13, padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 12, padding: '7px 12px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
  mv: { fontSize: 11.5, padding: '3px 8px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer' },
  lbl: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#888' },
  chip: { fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  vazio: { fontSize: 12.5, color: '#aaa', textAlign: 'center', padding: 14 },
  th: { textAlign: 'left', fontSize: 11, color: '#888', padding: '5px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  td: { textAlign: 'left', padding: '5px 8px' },
};
