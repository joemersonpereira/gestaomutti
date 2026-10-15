import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

// Lançador de escala dentro do card de cobrança (origem='escala_pendente').
// referencia = "lojaId:YYYY-MM-DD". Permite ao gerente lançar a escala (horário + equipe).
export default function EscalaLancarInline({ referencia, concluido, onChange }) {
  const { API } = useAuth();
  const [lojaId, dataISO] = String(referencia || '').split(':');
  const [modo, setModo] = useState('negociar');
  const [turnos, setTurnos] = useState([{ nome: 'Turno 1', inicio: '', fim: '' }]);
  const [equipeLoja, setEquipeLoja] = useState([]);
  const [pendentes, setPendentes] = useState([]);
  const [novo, setNovo] = useState({ colaborador_id: '', turno_nome: '', horario_custom: '' });
  const [msg, setMsg] = useState('');
  const dia = (() => { try { return new Date(dataISO + 'T00:00:00').getDay(); } catch { return null; } })();
  const tipo = dia === 6 ? 'sabado' : dia === 0 ? 'domingo' : 'feriado';
  const updT = (i, k, v) => setTurnos(turnos.map((t, j) => j === i ? { ...t, [k]: v } : t));

  useEffect(() => { if (lojaId) API.get('/folgas/equipe', { params: { loja_id: lojaId } }).then(r => setEquipeLoja(r.data.equipe || [])).catch(() => {}); }, [API, lojaId]);
  const acha = id => equipeLoja.find(c => c.id === id);
  function addPendente() {
    if (!novo.colaborador_id) { setMsg('Escolha o colaborador.'); return; }
    if (pendentes.some(p => p.colaborador_id === novo.colaborador_id)) { setMsg('Já adicionado.'); return; }
    setPendentes([...pendentes, { ...novo, nome: acha(novo.colaborador_id)?.nome }]); setNovo({ colaborador_id: '', turno_nome: '', horario_custom: '' }); setMsg('');
  }
  const rmPendente = id => setPendentes(pendentes.filter(p => p.colaborador_id !== id));
  const turnoOpts = turnos.map(t => t.nome).filter(Boolean);

  async function enviar() {
    const ts = turnos.filter(t => t.nome && t.inicio && t.fim);
    if (!ts.length) { setMsg('Preencha ao menos um turno (nome, início e fim).'); return; }
    const equipe = pendentes.map(p => ({ colaborador_id: p.colaborador_id, turno_nome: p.turno_nome === '__custom' ? null : (p.turno_nome || null), horario_custom: p.turno_nome === '__custom' ? p.horario_custom : null }));
    try { const r = await API.post('/escala', { loja_id: lojaId, data: dataISO, tipo, modo, turnos: ts, equipe }); setMsg('✅ ' + (r.data.mensagem || 'Escala lançada.')); onChange?.(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }
  if (concluido) return null;

  return (
    <div style={s.box}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Lance a escala aqui mesmo:</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select value={modo} onChange={e => setModo(e.target.value)} style={s.sel}>
          <option value="negociar">Negociar (informar equipe)</option><option value="ciencia">Só ciência</option>
        </select>
      </div>
      <div style={{ fontSize: 11, color: '#888', fontWeight: 600, margin: '2px 0 4px' }}>HORÁRIO</div>
      {turnos.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <input style={{ ...s.sel, width: 100 }} placeholder="Turno" value={t.nome} onChange={e => updT(i, 'nome', e.target.value)} />
          <input style={{ ...s.sel, width: 80 }} placeholder="início" value={t.inicio} onChange={e => updT(i, 'inicio', e.target.value)} />
          <input style={{ ...s.sel, width: 80 }} placeholder="fim" value={t.fim} onChange={e => updT(i, 'fim', e.target.value)} />
          {turnos.length > 1 && <button style={s.ghost} onClick={() => setTurnos(turnos.filter((_, j) => j !== i))}>×</button>}
        </div>
      ))}
      <button style={s.ghost} onClick={() => setTurnos([...turnos, { nome: `Turno ${turnos.length + 1}`, inicio: '', fim: '' }])}>+ Turno</button>

      {modo === 'negociar' && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 4 }}>EQUIPE — QUEM VAI TRABALHAR</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={novo.colaborador_id} onChange={e => setNovo({ ...novo, colaborador_id: e.target.value })} style={s.sel}>
              <option value="">Colaborador…</option>
              {equipeLoja.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.funcao_nome}</option>)}
            </select>
            <select value={novo.turno_nome} onChange={e => setNovo({ ...novo, turno_nome: e.target.value, horario_custom: e.target.value === '__custom' ? novo.horario_custom : '' })} style={s.sel}>
              <option value="">Turno…</option>
              {turnoOpts.map(t => <option key={t} value={t}>{t}</option>)}
              <option value="__custom">Outro horário…</option>
            </select>
            {novo.turno_nome === '__custom' && <input placeholder="ex.: 13h-19h" value={novo.horario_custom} onChange={e => setNovo({ ...novo, horario_custom: e.target.value })} style={{ ...s.sel, width: 110 }} />}
            <button style={s.ghost} onClick={addPendente}>+ Adicionar</button>
          </div>
          {pendentes.length > 0 && <div style={{ marginTop: 6 }}>{pendentes.map(p => (
            <span key={p.colaborador_id} style={{ fontSize: 11, background: '#EEF2F7', borderRadius: 6, padding: '3px 8px', marginRight: 6, display: 'inline-flex', gap: 6 }}>
              {p.nome} {p.turno_nome === '__custom' ? `(${p.horario_custom})` : p.turno_nome ? `(${p.turno_nome})` : ''}<span style={{ cursor: 'pointer', color: '#993C1D' }} onClick={() => rmPendente(p.colaborador_id)}>×</span>
            </span>
          ))}</div>}
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>Se informar a equipe agora, a escala já vai à supervisão aprovar. Se deixar em branco, você informa a equipe depois no card da escala.</div>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <button style={s.btn} onClick={enviar}>Lançar escala</button>
      </div>
      {msg && <div style={{ fontSize: 11, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

const s = {
  box: { background: '#FFF9EE', border: '1px solid #F0E0C0', borderRadius: 10, padding: '10px 12px', marginTop: 8 },
  sel: { padding: '6px 8px', fontSize: 12, border: '1px solid #ddd', borderRadius: 6 },
  btn: { fontSize: 12, padding: '6px 12px', border: 'none', borderRadius: 8, background: '#111', color: '#fff', cursor: 'pointer' },
  ghost: { fontSize: 12, padding: '6px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'none', color: '#666', cursor: 'pointer' },
};
