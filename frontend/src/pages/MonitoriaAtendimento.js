import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import MultiLojaSelect from '../components/MultiLojaSelect';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';

const COR = { verde: '#1E874B', amarelo: '#B7791F', vermelho: '#C0392B', azul: '#185FA5' };
const fmtTempo = seg => { const s = Number(seg) || 0; const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h${m % 60}m` : m > 0 ? `${m}min` : `${s}s`; };
const corNota = n => n == null ? '#bbb' : n >= 4 ? COR.verde : n >= 3 ? COR.amarelo : COR.vermelho;

export default function MonitoriaAtendimento() {
  const { API } = useAuth();
  const hoje = new Date().toISOString().slice(0, 10);
  const ha30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [loja, setLoja] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [de, setDe] = useState(ha30);
  const [ate, setAte] = useState(hoje);
  const [notaMax, setNotaMax] = useState('');
  const [busca, setBusca] = useState('');
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [status, setStatus] = useState(null);
  const [vendedores, setVendedores] = useState([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [conversaDe, setConversaDe] = useState(null);
  const [aba, setAba] = useState('atend');

  const carregar = useCallback(() => {
    setErro(''); setD(null);
    const params = { loja: loja || undefined, vendedor: vendedor || undefined, de, ate, notaMax: notaMax || undefined, busca: busca || undefined };
    API.get('/botvendas/atendimentos', { params }).then(r => setD(r.data)).catch(e => setErro(e.response?.data?.erro || 'Falha ao carregar.'));
  }, [API, loja, vendedor, de, ate, notaMax, busca]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    API.get('/botvendas/status').then(r => setStatus(r.data)).catch(() => {});
    API.get('/botvendas/vendedores').then(r => setVendedores(r.data.vendedores || [])).catch(() => {});
  }, [API]);

  const sincronizar = () => {
    setSincronizando(true);
    API.post('/botvendas/sincronizar').then(r => { carregar(); API.get('/botvendas/status').then(x => setStatus(x.data)); })
      .catch(e => setErro(e.response?.data?.erro || 'Falha na sincronização.')).finally(() => setSincronizando(false));
  };

  const R = d && d.resumo;
  const COLS_V = [
    { k: 'vendedor', label: 'Vendedor', tipo: 'txt', get: v => v.vendedor },
    { k: 'atendimentos', label: 'Atendimentos', tipo: 'num', right: true, get: v => v.atendimentos },
    { k: 'satisfacao', label: 'Satisfação', tipo: 'num', right: true, get: v => v.satisfacao || 0 },
    { k: 'tempoMedioSeg', label: 'Tempo médio', tipo: 'num', right: true, get: v => v.tempoMedioSeg },
    { k: 'ruins', label: 'Ruins (≤2)', tipo: 'num', right: true, get: v => v.ruins },
  ];
  const { linhas: vLinhas, ordem: vOrd, clicar: vClicar, seta: vSeta } = useOrdenavel(d?.vendedores || [], COLS_V, { col: 'atendimentos', dir: 'desc' });
  // Colunas ordenáveis da lista de atendimentos (clicar no cabeçalho ordena ↑/↓).
  const COLS_A = [
    { k: 'data', label: 'Data', tipo: 'num', get: l => (l.closed_at ? new Date(l.closed_at).getTime() : 0) },
    { k: 'cliente', label: 'Cliente', tipo: 'txt', get: l => l.cliente || '' },
    { k: 'vendedor', label: 'Vendedor', tipo: 'txt', get: l => l.vendedor_nome || '' },
    { k: 'canal', label: 'Canal', tipo: 'txt', get: l => l.canal || '' },
    { k: 'satisfacao', label: 'Satisfação', tipo: 'num', center: true, get: l => (l.score != null ? l.score : -1) },
    { k: 'monitoria', label: 'Monitoria IA', tipo: 'num', center: true, get: l => (l.nota_ia != null ? l.nota_ia : -1) },
    { k: 'tempo', label: 'Tempo', tipo: 'num', center: true, get: l => l.ta_seconds || 0 },
  ];
  const { linhas: aLinhas, ordem: aOrd, clicar: aClicar, seta: aSeta } = useOrdenavel(d?.linhas || [], COLS_A, { col: 'data', dir: 'desc' });

  return (
    <div style={s.wrap}>
      <Banner emoji="🎧" titulo="Monitoria de Atendimento" cor="roxo" sub="Atendimentos do WhatsApp (BotVendas) — satisfação, tempo, conversa e desempenho por vendedor." />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <MultiLojaSelect value={loja} onChange={setLoja} compact />
        <select value={vendedor} onChange={e => setVendedor(e.target.value)} style={s.inp}>
          <option value="">👤 Todos os vendedores</option>
          {vendedores.map((v, i) => <option key={i} value={v.vendedor_nome}>{v.vendedor_nome}</option>)}
        </select>
        <label style={{ fontSize: 12, color: '#666' }}>de <input type="date" value={de} onChange={e => setDe(e.target.value)} style={s.inp} /></label>
        <label style={{ fontSize: 12, color: '#666' }}>até <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={s.inp} /></label>
        <select value={notaMax} onChange={e => setNotaMax(e.target.value)} style={s.inp}>
          <option value="">Todas as notas</option>
          <option value="2">Só notas ruins (≤2)</option>
          <option value="3">≤3</option>
        </select>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 cliente/telefone" style={{ ...s.inp, width: 160 }} />
        <button onClick={sincronizar} disabled={sincronizando} style={{ ...s.btn, marginLeft: 'auto' }}>{sincronizando ? 'sincronizando…' : '🔄 Sincronizar'}</button>
      </div>
      {status && !status.habilitado && <div style={{ ...s.card, color: COR.vermelho }}>⚠️ BotVendas não configurado no servidor (.env BOTVENDAS_*).</div>}
      {status && status.ultimaSync && <div style={{ fontSize: 11, color: '#999', marginTop: -6, marginBottom: 8 }}>Última sincronização: {String(status.ultimaSync).replace('T', ' ').slice(0, 16)} · {status.atendimentos} atendimentos guardados</div>}

      {R && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <Kpi titulo="Atendimentos" valor={R.total} />
          <Kpi titulo="Satisfação média" valor={R.satisfacaoMedia != null ? R.satisfacaoMedia.toFixed(2) + ' ⭐' : '—'} cor={corNota(R.satisfacaoMedia)} />
          <Kpi titulo="Avaliados (CSAT)" valor={R.avaliados} />
          <Kpi titulo="Tempo médio" valor={fmtTempo(R.tempoMedioSeg)} />
          <Kpi titulo="Atendimentos ruins (≤2)" valor={R.ruins} cor={R.ruins > 0 ? COR.vermelho : COR.verde} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {[['atend', '💬 Atendimentos'], ['vend', '👥 Por vendedor'], ['operacao', '📈 Operação'], ['config', '⚙️ Critérios & IA']].map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>

      {erro && <div style={{ ...s.card, color: COR.vermelho }}>⚠️ {erro}</div>}
      {!d && !erro && <div style={s.card}>Carregando…</div>}

      {/* Aba: lista de atendimentos */}
      {d && aba === 'atend' && (
        <div style={s.card}>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tab}>
              <thead><tr>{COLS_A.map(c => <ThOrd key={c.k} c={c} ordem={aOrd} clicar={aClicar} seta={aSeta} base={s.th} />)}<th style={s.th}></th></tr></thead>
              <tbody>
                {aLinhas.map(l => (
                  <tr key={l.order_id} style={{ borderTop: '1px solid #f0f0f0', cursor: 'pointer' }} onClick={() => setConversaDe(l)}>
                    <td style={{ ...s.td, whiteSpace: 'nowrap', color: '#777', fontSize: 11.5 }}>{l.closed_at ? new Date(l.closed_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td style={s.td}>{l.cliente || '—'}<div style={{ fontSize: 10.5, color: '#aaa' }}>{l.telefone}</div></td>
                    <td style={s.td}>{l.vendedor_nome || '—'}</td>
                    <td style={{ ...s.td, fontSize: 11.5, color: '#777' }}>{l.canal === 'whatsapp' ? '🟢 WhatsApp' : (l.canal || '—')}</td>
                    <td style={{ ...s.td, textAlign: 'center', fontWeight: 700, color: corNota(l.score) }}>{l.score != null ? l.score.toFixed(1) + ' ⭐' : '—'}</td>
                    <td style={{ ...s.td, textAlign: 'center', fontWeight: 700, color: l.nota_ia == null ? '#ccc' : l.nota_ia >= 7 ? COR.verde : l.nota_ia >= 5 ? COR.amarelo : COR.vermelho }}>{l.nota_ia != null ? l.nota_ia + '/10' : (l.tem_conversa ? '—' : '·')}</td>
                    <td style={{ ...s.td, textAlign: 'center', color: '#555' }}>{fmtTempo(l.ta_seconds)}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}><span style={{ color: COR.azul, fontSize: 12 }}>ver ›</span></td>
                  </tr>
                ))}
                {d.linhas.length === 0 && <tr><td colSpan={8} style={{ ...s.td, color: '#aaa', textAlign: 'center', padding: 20 }}>Nenhum atendimento no filtro.</td></tr>}
              </tbody>
            </table>
          </div>
          {d.linhas.length >= 800 && <div style={{ fontSize: 11, color: '#B7791F', marginTop: 8 }}>Mostrando os 800 mais recentes — refine o período/filtro para ver o resto.</div>}
        </div>
      )}

      {/* Aba: por vendedor */}
      {d && aba === 'vend' && (
        <div style={s.card}>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tab}>
              <thead><tr>{COLS_V.map(c => <ThOrd key={c.k} c={c} ordem={vOrd} clicar={vClicar} seta={vSeta} base={s.th} />)}</tr></thead>
              <tbody>
                {vLinhas.map((v, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{v.vendedor}{!v.colaborador_id && <span title="vendedor não casado com colaborador do sistema" style={{ color: '#ccc', marginLeft: 4 }}>·</span>}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{v.atendimentos}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: corNota(v.satisfacao) }}>{v.satisfacao != null ? v.satisfacao.toFixed(2) + ' ⭐' : '—'}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#555' }}>{fmtTempo(v.tempoMedioSeg)}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: v.ruins > 0 ? COR.vermelho : '#ccc', fontWeight: v.ruins > 0 ? 700 : 400 }}>{v.ruins || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {d && aba === 'operacao' && <PainelOperacao API={API} filtros={{ loja, vendedor, de, ate }} />}
      {aba === 'config' && <ConfigMonitoria API={API} />}

      {conversaDe && <ConversaModal API={API} atendimento={conversaDe} onFechar={() => setConversaDe(null)} onAvaliou={carregar} />}
    </div>
  );
}

// Painel de OPERAÇÃO: TMA, tempo de resposta, volume, satisfação, por dia e por hora.
function PainelOperacao({ API, filtros }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    setD(null);
    API.get('/botvendas/operacao', { params: { loja: filtros.loja || undefined, vendedor: filtros.vendedor || undefined, de: filtros.de, ate: filtros.ate } })
      .then(r => setD(r.data)).catch(() => setD(false));
  }, [API, filtros]);
  if (!d) return <div style={s.card}>Carregando operação…</div>;
  const R = d.resumo;
  const maxDia = Math.max(1, ...d.porDia.map(x => x.n));
  const maxHora = Math.max(1, ...d.porHora.map(x => x.n));
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <Kpi titulo="Volume de atendimentos" valor={R.volume} />
        <Kpi titulo="TMA (tempo de atendimento)" valor={fmtTempo(R.tmaSeg)} />
        <Kpi titulo="Tempo de 1ª resposta" valor={R.tprSeg != null ? fmtTempo(R.tprSeg) : '—'} cor={R.tprSeg != null && R.tprSeg > 300 ? COR.vermelho : COR.verde} />
        <Kpi titulo="Satisfação média" valor={R.satisfacao != null ? R.satisfacao.toFixed(2) + ' ⭐' : '—'} cor={corNota(R.satisfacao)} />
        <Kpi titulo="Taxa de avaliação" valor={R.taxaAvaliacao + '%'} />
        <Kpi titulo="Finalizados" valor={R.finalizados} />
        <Kpi titulo="Ruins (≤2)" valor={R.ruins} cor={R.ruins > 0 ? COR.vermelho : COR.verde} />
      </div>
      {R.tprSeg != null && <div style={{ fontSize: 11, color: '#999', marginTop: -6, marginBottom: 10 }}>Tempo de 1ª resposta calculado das conversas já carregadas ({R.tprCobertura}% dos atendimentos). Cresce conforme a monitoria roda.</div>}

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📅 Atendimentos por dia</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, overflowX: 'auto' }}>
          {d.porDia.map(x => (
            <div key={x.dia} title={`${x.dia}: ${x.n} atend · TMA ${fmtTempo(x.tmaSeg)}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 26 }}>
              <div style={{ fontSize: 9, color: '#999' }}>{x.n}</div>
              <div style={{ width: 18, height: Math.round(x.n / maxDia * 90), background: COR.azul, borderRadius: 3 }} />
              <div style={{ fontSize: 8.5, color: '#aaa', whiteSpace: 'nowrap' }}>{x.dia.slice(8, 10)}/{x.dia.slice(5, 7)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>⏰ Horário de pico (atendimentos por hora)</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }}>
          {d.porHora.map(x => (
            <div key={x.hora} title={`${x.hora}h: ${x.n}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ width: '70%', height: Math.round(x.n / maxHora * 70), background: x.n === maxHora ? COR.verde : '#B9C7D6', borderRadius: 2 }} />
              <div style={{ fontSize: 8, color: '#aaa' }}>{x.hora}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Config: critérios treináveis, termos (negativos/evasivos/positivos), script de referência, auto.
function ConfigMonitoria({ API }) {
  const [crit, setCrit] = useState([]); const [termos, setTermos] = useState([]); const [cfg, setCfg] = useState(null);
  const [novoCrit, setNovoCrit] = useState(''); const [novoTermo, setNovoTermo] = useState(''); const [tipoTermo, setTipoTermo] = useState('negativa');
  const [msg, setMsg] = useState('');
  const carregar = () => {
    API.get('/botvendas/criterios').then(r => setCrit(r.data.criterios || [])).catch(() => {});
    API.get('/botvendas/termos').then(r => setTermos(r.data.termos || [])).catch(() => {});
    API.get('/botvendas/config').then(r => setCfg(r.data.config || {})).catch(() => {});
  };
  useEffect(carregar, [API]);
  const addCrit = () => { if (!novoCrit.trim()) return; API.post('/botvendas/criterios', { texto: novoCrit }).then(() => { setNovoCrit(''); carregar(); }); };
  const delCrit = id => API.delete('/botvendas/criterios/' + id).then(carregar);
  const addTermo = () => { if (!novoTermo.trim()) return; API.post('/botvendas/termos', { termo: novoTermo, tipo: tipoTermo }).then(() => { setNovoTermo(''); carregar(); }); };
  const delTermo = id => API.delete('/botvendas/termos/' + id).then(carregar);
  const salvarCfg = () => { API.put('/botvendas/config', cfg).then(() => { setMsg('✅ salvo'); setTimeout(() => setMsg(''), 1500); }); };
  if (!cfg) return <div style={s.card}>Carregando…</div>;
  const tipoCor = { negativa: COR.vermelho, evasivo: COR.amarelo, positivo: COR.verde };
  const tipoLabel = { negativa: 'proibido', evasivo: 'evasivo', positivo: 'positivo' };
  return (
    <div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>⚙️ Monitoria automática</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '6px 0' }}>
          <input type="checkbox" checked={!!cfg.auto} onChange={e => setCfg({ ...cfg, auto: e.target.checked ? 1 : 0 })} /> Avaliar automaticamente com IA assim que o atendimento fecha
        </label>
        <label style={{ fontSize: 13, color: '#666' }}>Nota mínima (abaixo dela abre tarefa de revisão pro gerente): <input type="number" min="0" max="10" value={cfg.nota_alerta || 6} onChange={e => setCfg({ ...cfg, nota_alerta: Number(e.target.value) })} style={{ ...s.inp, width: 70 }} /></label>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Script de referência (cole aqui o RAV / os scripts que o vendedor deve seguir — a IA valoriza quem usa esse estilo):</div>
          <textarea value={cfg.script_ref || ''} onChange={e => setCfg({ ...cfg, script_ref: e.target.value })} rows={6} placeholder="Cole aqui os scripts de atendimento…" style={{ width: '100%', padding: 8, fontSize: 12.5, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </div>
        <button onClick={salvarCfg} style={{ ...s.btn, marginTop: 8 }}>Salvar</button> {msg && <span style={{ color: COR.verde, fontSize: 12, marginLeft: 8 }}>{msg}</span>}
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>✅ Critérios avaliados pela IA</div>
        {crit.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #f2f2f2', fontSize: 13 }}>
            <span style={{ flex: 1 }}>{c.texto}</span>
            <button onClick={() => delCrit(c.id)} style={s.btnX}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input value={novoCrit} onChange={e => setNovoCrit(e.target.value)} placeholder="novo critério (ex.: confirmou o endereço de entrega)" style={{ ...s.inp, flex: 1 }} onKeyDown={e => e.key === 'Enter' && addCrit()} />
          <button onClick={addCrit} style={s.btn}>+ Adicionar</button>
        </div>
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🚫 Termos monitorados</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {termos.map(t => (
            <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, background: '#F5F5F5', border: `1px solid ${tipoCor[t.tipo]}44`, borderRadius: 14, padding: '3px 9px' }}>
              <span style={{ color: tipoCor[t.tipo], fontWeight: 700, fontSize: 10 }}>{tipoLabel[t.tipo]}</span> {t.termo}
              <button onClick={() => delTermo(t.id)} style={{ ...s.btnX, fontSize: 13 }}>✕</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={tipoTermo} onChange={e => setTipoTermo(e.target.value)} style={s.inp}>
            <option value="negativa">Proibido (ex.: não)</option>
            <option value="evasivo">Evasivo (ex.: talvez)</option>
            <option value="positivo">Positivo (frase boa)</option>
          </select>
          <input value={novoTermo} onChange={e => setNovoTermo(e.target.value)} placeholder="novo termo/expressão" style={{ ...s.inp, flex: 1 }} onKeyDown={e => e.key === 'Enter' && addTermo()} />
          <button onClick={addTermo} style={s.btn}>+ Adicionar</button>
        </div>
      </div>
    </div>
  );
}

function ConversaModal({ API, atendimento, onFechar, onAvaliou }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [avaliando, setAvaliando] = useState(false);
  const carregar = useCallback(() => {
    setD(null); setErro('');
    API.get(`/botvendas/atendimentos/${atendimento.order_id}/conversa`).then(r => setD(r.data)).catch(e => setErro(e.response?.data?.erro || 'Falha ao carregar conversa.'));
  }, [API, atendimento]);
  useEffect(() => { carregar(); }, [carregar]);
  const avaliar = () => {
    setAvaliando(true);
    API.post(`/botvendas/atendimentos/${atendimento.order_id}/avaliar`).then(() => { carregar(); onAvaliou && onAvaliou(); })
      .catch(e => setErro(e.response?.data?.erro || 'Falha ao avaliar.')).finally(() => setAvaliando(false));
  };
  const av = d && d.avaliacao;
  return (
    <div style={s.overlay} onClick={onFechar}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>💬 {atendimento.cliente || 'Cliente'}</div>
            <div style={{ fontSize: 12, color: '#666' }}>Atendente: <b>{atendimento.vendedor_nome || '—'}</b> · {atendimento.telefone} · {atendimento.score != null ? `satisfação ${atendimento.score.toFixed(1)}⭐` : 'sem nota'} · {fmtTempo(atendimento.ta_seconds)}</div>
          </div>
          <button onClick={onFechar} style={s.btnX}>✕</button>
        </div>

        {/* Avaliação da monitoria (IA) */}
        {d && (
          <div style={{ background: '#F3EFFA', border: '1px solid #E0D4F2', borderRadius: 10, padding: '9px 11px', marginBottom: 10 }}>
            {av ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>🎧 Monitoria IA:</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: av.nota >= 7 ? COR.verde : av.nota >= 5 ? COR.amarelo : COR.vermelho }}>{av.nota != null ? av.nota + '/10' : '—'}</span>
                  <button onClick={avaliar} disabled={avaliando} style={{ ...s.chip, marginLeft: 'auto', fontSize: 11 }}>{avaliando ? 'avaliando…' : '🔁 reavaliar'}</button>
                </div>
                {av.resumo && <div style={{ fontSize: 12, color: '#444', marginTop: 4 }}>{av.resumo}</div>}
                {(av.termos || []).length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                  {av.termos.map((t, i) => <span key={i} style={{ fontSize: 11, borderRadius: 10, padding: '2px 8px', background: t.tipo === 'positivo' ? '#E4F5EA' : t.tipo === 'evasivo' ? '#FCF3E2' : '#FBEAE7', color: t.tipo === 'positivo' ? COR.verde : t.tipo === 'evasivo' ? COR.amarelo : COR.vermelho }}>{t.tipo === 'positivo' ? '✓' : '⚠️'} {t.termo} ×{t.ocorrencias}</span>)}
                </div>}
                {(av.itens || []).length > 0 && <div style={{ marginTop: 6 }}>
                  {av.itens.map((it, i) => <div key={i} style={{ fontSize: 11.5, color: '#555', display: 'flex', gap: 6, padding: '2px 0' }}><span>{it.ok ? '✅' : '❌'}</span><span style={{ flex: 1 }}><b>{it.criterio}</b>{it.obs ? ` — ${it.obs}` : ''}</span></div>)}
                </div>}
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#666' }}>Ainda não avaliado pela IA.</span>
                <button onClick={avaliar} disabled={avaliando} style={{ ...s.btn, fontSize: 12, padding: '6px 12px' }}>{avaliando ? 'avaliando…' : '🤖 Avaliar com IA'}</button>
              </div>
            )}
          </div>
        )}

        {erro && <div style={{ color: COR.vermelho, fontSize: 12 }}>⚠️ {erro}</div>}
        {!d && !erro && <div style={{ fontSize: 12, color: '#999' }}>Carregando conversa…</div>}
        {d && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '62vh', overflowY: 'auto', padding: '4px 2px' }}>
            {d.mensagens.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Sem mensagens.</div>}
            {d.mensagens.map((m, i) => {
              if (m.tipo === 'note') return <div key={i} style={{ alignSelf: 'center', fontSize: 10.5, color: '#999', background: '#F3F3F3', borderRadius: 8, padding: '3px 10px' }}>{m.texto}</div>;
              const enviado = m.direcao === 'sent';
              return (
                <div key={i} style={{ alignSelf: enviado ? 'flex-end' : 'flex-start', maxWidth: '80%', background: enviado ? '#DCF3E4' : '#fff', border: `1px solid ${enviado ? '#BFE6CC' : '#eee'}`, borderRadius: 10, padding: '7px 10px' }}>
                  <div style={{ fontSize: 10.5, color: enviado ? '#1E874B' : '#888', fontWeight: 600, marginBottom: 2 }}>{enviado ? (m.remetente || 'Atendente') : (m.remetente || 'Cliente')} · {m.enviado_em || ''}</div>
                  <div style={{ fontSize: 13, color: '#222', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.texto || '—'}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ titulo, valor, cor }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '10px 14px', minWidth: 140 }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.03em', color: '#999' }}>{titulo}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: cor || '#222', marginTop: 2 }}>{valor}</div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1360, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 12 },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '6px 8px', fontSize: 13 },
  btn: { fontSize: 13, padding: '8px 14px', background: '#5B3E9E', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' },
  chip: { fontSize: 12.5, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  tab: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em', color: '#999', padding: '8px 10px', borderBottom: '2px solid #f0f0f0', whiteSpace: 'nowrap', textAlign: 'left' },
  td: { padding: '8px 10px', color: '#333' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { background: '#F7F8FA', borderRadius: 14, padding: '14px 16px', maxWidth: 640, width: '100%', maxHeight: '86vh', overflowY: 'auto' },
  btnX: { border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#999' },
};
