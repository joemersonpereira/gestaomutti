import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import EscalaHorario from '../components/EscalaHorario';

const hoje = new Date();

export default function Calendario() {
  const { API, usuario } = useAuth();
  const ehSupervisao = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const [aba, setAba] = useState('feriados');
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState('');
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [dias, setDias] = useState([]);
  const [novoDia, setNovoDia] = useState('');
  const [tipo, setTipo] = useState('feriado');
  const [escData, setEscData] = useState('');
  const [escTipo, setEscTipo] = useState('feriado');
  const [escModo, setEscModo] = useState('negociar');
  const [escTurnos, setEscTurnos] = useState([{ nome: 'Turno 1', inicio: '', fim: '' }]);
  const [escalas, setEscalas] = useState([]);
  const [escMsg, setEscMsg] = useState('');
  const [escDeducao, setEscDeducao] = useState('5');
  const [escEquipeLoja, setEscEquipeLoja] = useState([]);
  const [escPendentes, setEscPendentes] = useState([]);
  const [escSel, setEscSel] = useState([]);        // vários colaboradores de uma vez
  const [escTurnoSel, setEscTurnoSel] = useState('');
  const [escH, setEscH] = useState({ e1: '', s1: '', e2: '', s2: '' }); // entrada, saída almoço, volta, saída
  const updT = (i, k, v) => setEscTurnos(escTurnos.map((t, j) => j === i ? { ...t, [k]: v } : t));

  useEffect(() => { API.get('/referencias/lojas').then(r => { const l = r.data.lojas || []; setLojas(l); if (!lojaId && l.length) setLojaId(l[0].id); }); }, [API, lojaId]);

  const carregar = useCallback(() => {
    if (!lojaId) return;
    API.get('/vendas/calendario', { params: { loja_id: lojaId, mes, ano } }).then(r => setDias(r.data.dias || []));
    API.get('/escala', { params: { loja_id: lojaId, mes, ano } }).then(r => setEscalas(r.data.escalas || [])).catch(() => {});
  }, [API, lojaId, mes, ano]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/escala/config').then(r => setEscDeducao(String(r.data.deducao))).catch(() => {}); }, [API]);
  useEffect(() => { if (lojaId) API.get('/folgas/equipe', { params: { loja_id: lojaId } }).then(r => setEscEquipeLoja(r.data.equipe || [])).catch(() => {}); }, [API, lojaId]);

  // Compõe os até 4 horários num texto: "08:00–12:00 · 13:00–18:00" (2º turno é opcional).
  function comporHorario() {
    const p1 = escH.e1 && escH.s1 ? `${escH.e1}–${escH.s1}` : '';
    const p2 = escH.e2 && escH.s2 ? `${escH.e2}–${escH.s2}` : '';
    return [p1, p2].filter(Boolean).join(' · ');
  }
  function addEscPendente() {
    if (!escSel.length) { setEscMsg('Selecione ao menos um colaborador.'); return; }
    const custom = escTurnoSel === '__custom';
    const horario = custom ? comporHorario() : null;
    if (custom && !horario) { setEscMsg('Preencha ao menos entrada e saída.'); return; }
    const novos = escSel
      .filter(id => !escPendentes.some(p => p.colaborador_id === id))
      .map(id => ({ colaborador_id: id, nome: escEquipeLoja.find(x => x.id === id)?.nome, turno_nome: escTurnoSel || '', horario_custom: horario }));
    if (!novos.length) { setEscMsg('Selecionados já estão na lista.'); return; }
    setEscPendentes([...escPendentes, ...novos]);
    setEscSel([]); setEscTurnoSel(''); setEscH({ e1: '', s1: '', e2: '', s2: '' }); setEscMsg('');
  }
  const toggleSel = id => setEscSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const rmEscPendente = id => setEscPendentes(escPendentes.filter(p => p.colaborador_id !== id));

  async function salvarDeducao() {
    try { const r = await API.post('/escala/config', { deducao: Number(escDeducao) || 0 }); setEscDeducao(String(r.data.deducao)); setEscMsg('✅ % salvo.'); }
    catch (e) { setEscMsg(e.response?.data?.erro || 'Erro.'); }
  }

  async function enviarEscala() {
    if (!escData) { setEscMsg('Escolha a data.'); return; }
    const turnos = escTurnos.filter(t => t.nome && t.inicio && t.fim);
    if (!turnos.length) { setEscMsg('Preencha ao menos um turno (nome, início e fim).'); return; }
    const equipe = escPendentes.map(p => ({ colaborador_id: p.colaborador_id, turno_nome: p.turno_nome === '__custom' ? null : (p.turno_nome || null), horario_custom: p.turno_nome === '__custom' ? p.horario_custom : null }));
    try {
      const r = await API.post('/escala', { loja_id: lojaId, data: escData, tipo: escTipo, modo: escModo, turnos, equipe });
      setEscMsg('✅ ' + (r.data.mensagem || 'Escala enviada.')); setEscData(''); setEscTurnos([{ nome: 'Turno 1', inicio: '', fim: '' }]); setEscPendentes([]); carregar();
    } catch (e) { setEscMsg(e.response?.data?.erro || 'Erro.'); }
  }

  async function adicionar() {
    if (!novoDia) return;
    await API.post('/vendas/calendario', { loja_id: lojaId, data: novoDia, tipo });
    setNovoDia(''); carregar();
  }
  async function remover(id) { await API.delete(`/vendas/calendario/${id}`); carregar(); }

  return (
    <div style={s.wrap}>
      <Banner emoji="📅" titulo="Feriados e escala" cor="azul" />
      <div style={s.sub}>Duas coisas aqui: (1) marcar <strong>feriados e dias fechados</strong> e (2) montar a <strong>escala de feriado/fim de semana</strong> (quem trabalha e em qual turno).</div>

      <div style={s.tabs}>
        <button onClick={() => setAba('feriados')} style={{ ...s.tab, ...(aba === 'feriados' ? s.tabAtiva : {}) }}>📌 Feriados e dias fechados</button>
        <button onClick={() => setAba('escala')} style={{ ...s.tab, ...(aba === 'escala' ? s.tabAtiva : {}) }}>🗓️ Escala de feriado/FDS</button>
        <button onClick={() => setAba('horario')} style={{ ...s.tab, ...(aba === 'horario' ? s.tabAtiva : {}) }}>🕐 Escala semanal (horário)</button>
      </div>

      {aba === 'horario' && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🕐 Escala semanal — horário previsto de entrada</div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Defina o horário de cada dia da semana por colaborador. É cruzado com a batida do ponto (orientação: chegar 5 min antes) e vira peso no ranking Caixa Destaque.</div>
          <EscalaHorario API={API} lojaFixa={ehSupervisao ? undefined : (usuario.loja_id || '')} />
        </div>
      )}

      {aba === 'feriados' && (
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>📌 Feriados e dias fechados</div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Escolha a loja e o mês. {ehSupervisao ? 'Marque os feriados/dias fechados abaixo.' : 'A supervisão marca os feriados; aqui você consulta.'}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <select style={{ ...s.campo, width: 'auto', marginBottom: 0 }} value={lojaId} onChange={e => setLojaId(e.target.value)}>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          <select style={{ ...s.campo, width: 'auto', marginBottom: 0 }} value={mes} onChange={e => setMes(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}
          </select>
          <input style={{ ...s.campo, width: 90, marginBottom: 0 }} type="number" value={ano} onChange={e => setAno(Number(e.target.value))} />
        </div>
        {ehSupervisao && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ ...s.campo, width: 'auto', marginBottom: 0 }} type="date" value={novoDia} onChange={e => setNovoDia(e.target.value)} />
          <select style={{ ...s.campo, width: 'auto', marginBottom: 0 }} value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="feriado">Feriado</option>
            <option value="fechado">Fechado</option>
          </select>
          <button style={s.btn} onClick={adicionar}>+ Marcar</button>
        </div>
        )}
      </div>
      )}

      {aba === 'escala' && (
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🗓️ Escala de feriado / fim de semana</div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Defina o horário (turnos) e envie ao gerente. Ele dá de acordo e informa a equipe, ou pede reanálise. No modo "só ciência", o gerente apenas confirma.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input style={{ ...s.campo, width: 'auto', marginBottom: 0 }} type="date" value={escData} onChange={e => setEscData(e.target.value)} />
          <select style={{ ...s.campo, width: 'auto', marginBottom: 0 }} value={escTipo} onChange={e => setEscTipo(e.target.value)}>
            <option value="feriado">Feriado</option><option value="sabado">Sábado</option><option value="domingo">Domingo</option>
          </select>
          <select style={{ ...s.campo, width: 'auto', marginBottom: 0 }} value={escModo} onChange={e => setEscModo(e.target.value)}>
            <option value="negociar">Negociar (gerente informa equipe)</option><option value="ciencia">Só ciência</option>
          </select>
        </div>
        {escTurnos.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <input style={{ ...s.campo, width: 110, marginBottom: 0 }} placeholder="Turno" value={t.nome} onChange={e => updT(i, 'nome', e.target.value)} />
            <input style={{ ...s.campo, width: 90, marginBottom: 0 }} placeholder="início (8h)" value={t.inicio} onChange={e => updT(i, 'inicio', e.target.value)} />
            <input style={{ ...s.campo, width: 90, marginBottom: 0 }} placeholder="fim (14h)" value={t.fim} onChange={e => updT(i, 'fim', e.target.value)} />
            {escTurnos.length > 1 && <button style={s.rem} onClick={() => setEscTurnos(escTurnos.filter((_, j) => j !== i))}>×</button>}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button style={s.rem} onClick={() => setEscTurnos([...escTurnos, { nome: `Turno ${escTurnos.length + 1}`, inicio: '', fim: '' }])}>+ Turno</button>
        </div>
        {escModo === 'negociar' && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 4 }}>EQUIPE — QUEM VAI TRABALHAR (marque um ou vários)</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {escEquipeLoja.map(c => {
                const on = escSel.includes(c.id);
                const ja = escPendentes.some(p => p.colaborador_id === c.id);
                return (
                  <button key={c.id} onClick={() => !ja && toggleSel(c.id)} disabled={ja} title={c.funcao_nome}
                    style={{ fontSize: 12, padding: '5px 10px', borderRadius: 20, cursor: ja ? 'default' : 'pointer',
                      border: '1px solid ' + (on ? '#185FA5' : '#ddd'), background: ja ? '#EEF2F7' : on ? '#185FA5' : '#fff',
                      color: ja ? '#aaa' : on ? '#fff' : '#444' }}>
                    {on ? '✓ ' : ''}{c.nome}{ja ? ' (na lista)' : ''}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={escTurnoSel} onChange={e => setEscTurnoSel(e.target.value)} style={{ ...s.campo, width: 'auto', marginBottom: 0 }}>
                <option value="">Turno…</option>
                {escTurnos.map(t => t.nome).filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
                <option value="__custom">Outro horário…</option>
              </select>
              {escTurnoSel === '__custom' && (
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="time" title="Entrada" value={escH.e1} onChange={e => setEscH({ ...escH, e1: e.target.value })} style={{ ...s.campo, width: 108, marginBottom: 0 }} />
                  <span style={{ color: '#bbb' }}>–</span>
                  <input type="time" title="Saída p/ almoço" value={escH.s1} onChange={e => setEscH({ ...escH, s1: e.target.value })} style={{ ...s.campo, width: 108, marginBottom: 0 }} />
                  <span style={{ color: '#ccc', fontSize: 11 }}>almoço</span>
                  <input type="time" title="Volta do almoço" value={escH.e2} onChange={e => setEscH({ ...escH, e2: e.target.value })} style={{ ...s.campo, width: 108, marginBottom: 0 }} />
                  <span style={{ color: '#bbb' }}>–</span>
                  <input type="time" title="Saída (fim do turno)" value={escH.s2} onChange={e => setEscH({ ...escH, s2: e.target.value })} style={{ ...s.campo, width: 108, marginBottom: 0 }} />
                </div>
              )}
              <button style={s.rem} onClick={addEscPendente}>+ Adicionar {escSel.length > 1 ? `(${escSel.length})` : ''}</button>
            </div>
            {escTurnoSel === '__custom' && <div style={{ fontSize: 10, color: '#aaa', marginTop: 3 }}>Preencha os 4 horários para quem sai e volta do almoço. Sem almoço separado, use só os dois primeiros.</div>}
            {escPendentes.length > 0 && <div style={{ marginTop: 6 }}>{escPendentes.map(p => (
              <span key={p.colaborador_id} style={{ fontSize: 11, background: '#EEF2F7', borderRadius: 6, padding: '3px 8px', marginRight: 6, display: 'inline-flex', gap: 6 }}>
                {p.nome} {p.turno_nome === '__custom' ? `(${p.horario_custom})` : p.turno_nome ? `(${p.turno_nome})` : ''}<span style={{ cursor: 'pointer', color: '#993C1D' }} onClick={() => rmEscPendente(p.colaborador_id)}>×</span>
              </span>
            ))}</div>}
            <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>Informando a equipe agora, a escala vai direto à supervisão aprovar. Em branco, o gerente informa depois no card da escala.</div>
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <button style={s.btn} onClick={enviarEscala}>Enviar escala</button>
        </div>
        {escMsg && <div style={{ fontSize: 12, color: escMsg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 8 }}>{escMsg}</div>}
        {ehSupervisao && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid #f3f3f3' }}>
          <span style={{ fontSize: 12, color: '#666' }}>Quem não confirmar a escala perde</span>
          <input style={{ ...s.campo, width: 60, marginBottom: 0 }} type="number" min="0" max="100" value={escDeducao} onChange={e => setEscDeducao(e.target.value)} />
          <span style={{ fontSize: 12, color: '#666' }}>% em conduta</span>
          <button style={s.rem} onClick={salvarDeducao}>Salvar %</button>
        </div>
        )}
        {escalas.length > 0 && <div style={{ marginTop: 12 }}>
          {escalas.map(es => <div key={es.id} style={{ fontSize: 12, padding: '4px 0', borderTop: '1px solid #f3f3f3' }}>{new Date(es.data + 'T12:00').toLocaleDateString('pt-BR')} · {es.tipo} · <span style={{ color: '#185FA5' }}>{es.status}</span></div>)}
        </div>}
      </div>
      )}

      {aba === 'feriados' && (
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Dias não úteis em {String(mes).padStart(2, '0')}/{ano}</div>
        {dias.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhum dia marcado (todos contam normalmente).</div>}
        {dias.map(d => (
          <div key={d.id} style={s.linha}>
            <span style={{ fontSize: 13 }}>{new Date(d.data + 'T12:00').toLocaleDateString('pt-BR')} · <span style={{ color: '#993C1D' }}>{d.tipo}</span></span>
            {ehSupervisao && <button style={s.rem} onClick={() => remover(d.id)}>remover</button>}
          </div>
        ))}
      </div>
      )}
      <div style={s.info}>💡 Pesos dos dias: Seg–Sáb = 1, Domingo = 0,7. Feriado/fechado = 0 (a meta é redistribuída nos outros dias).</div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 820, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  tabs: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  tab: { fontSize: 12, padding: '6px 14px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666' },
  tabAtiva: { background: '#111', color: '#fff', borderColor: '#111' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  campo: { padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8 },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  linha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f5f5f5' },
  rem: { fontSize: 11, padding: '3px 8px', background: '#FCEBEB', color: '#993C1D', border: 'none', borderRadius: 5, cursor: 'pointer' },
  info: { background: '#E6F1FB', borderLeft: '3px solid #185FA5', borderRadius: '0 8px 8px 0', padding: '10px 12px', fontSize: 12, color: '#185FA5', lineHeight: 1.6 },
};
