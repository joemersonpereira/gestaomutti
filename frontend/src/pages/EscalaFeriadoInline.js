import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const fmt = d => { try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };
const STLABEL = {
  aguardando_gerente: 'Com o gerente', reanalise_horario: 'Reanálise de horário (supervisão)',
  aguardando_supervisor: 'Com a supervisão', reanalise_inclusao: 'Ciência de inclusão (gerente)', concluido: 'Concluída',
};

// Card da escala de feriado/fim de semana: negociação supervisor↔gerente (horário + turnos + equipe).
export default function EscalaFeriadoInline({ escalaId, onChange }) {
  const { API, usuario } = useAuth();
  const [e, setE] = useState(null);
  const [equipeLoja, setEquipeLoja] = useState([]);
  const [msg, setMsg] = useState('');
  // builders
  const [novo, setNovo] = useState({ colaborador_id: '', turno_nome: '', horario_custom: '' });
  const [pendentes, setPendentes] = useState([]); // equipe sendo montada pelo gerente / incluída pelo supervisor
  const [obs, setObs] = useState('');
  const [turnosEdit, setTurnosEdit] = useState([]);

  const carregar = useCallback(() => {
    API.get(`/escala/${escalaId}`).then(r => { setE(r.data); setTurnosEdit(r.data.turnos || []); }).catch(() => setE(false));
  }, [API, escalaId]);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!e || e === false) return;
    if (e.sou_gestao || e.sou_supervisor) {
      const params = e.sou_supervisor ? { loja_id: e.loja_id } : {};
      API.get('/folgas/equipe', { params }).then(r => setEquipeLoja(r.data.equipe || [])).catch(() => {});
    }
  }, [API, e]);

  const acha = id => equipeLoja.find(c => c.id === id);
  function addPendente() {
    if (!novo.colaborador_id) { setMsg('Escolha o colaborador.'); return; }
    if (pendentes.some(p => p.colaborador_id === novo.colaborador_id)) { setMsg('Já adicionado.'); return; }
    setPendentes([...pendentes, { ...novo, nome: acha(novo.colaborador_id)?.nome }]);
    setNovo({ colaborador_id: '', turno_nome: '', horario_custom: '' });
  }
  const rmPendente = id => setPendentes(pendentes.filter(p => p.colaborador_id !== id));

  async function post(url, body, okMsg) {
    try { const r = await API.post(url, body); setMsg('✅ ' + (r.data.mensagem || okMsg || 'Feito.')); setPendentes([]); setObs(''); onChange?.(); carregar(); }
    catch (err) { setMsg(err.response?.data?.erro || 'Erro.'); }
  }

  if (e === null) return <div style={s.box}>Carregando…</div>;
  if (e === false) return null;

  const turnoOpts = (e.turnos || []).map(t => t.nome).filter(Boolean);

  return (
    <div style={s.box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Escala {e.tipo} · {fmt(e.data)}</div>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: '#EEF2F7', color: '#555' }}>{STLABEL[e.status] || e.status}</span>
      </div>

      {/* Horário/turnos */}
      <div style={{ margin: '8px 0' }}>
        <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>HORÁRIO</div>
        {(e.turnos || []).map((t, i) => <div key={i} style={{ fontSize: 12 }}>• {t.nome}: {t.inicio}–{t.fim}</div>)}
      </div>

      {/* Equipe definida */}
      {e.equipe?.length > 0 && (
        <div style={{ margin: '8px 0' }}>
          <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>EQUIPE {e.status === 'concluido' ? '· CIÊNCIA' : ''}</div>
          {e.equipe.map(m => (
            <div key={m.id} style={{ fontSize: 12 }}>
              • {m.colaborador_nome} <span style={{ color: '#999' }}>· {m.horario_custom || m.turno_nome || 'turno —'}{m.incluido_por === 'supervisor' ? ' · incluído pela supervisão' : ''}</span>
              {e.status === 'concluido' && (m.ciencia
                ? <span style={{ color: '#3B6D11' }}> · ✓ ciente</span>
                : <span style={{ color: '#854F0B' }}> · ⏳ aguardando ciência</span>)}
            </div>
          ))}
        </div>
      )}
      {e.gerente_obs ? <div style={{ fontSize: 11, color: '#777' }}>Obs. gerente: {e.gerente_obs}</div> : null}
      {e.supervisor_obs ? <div style={{ fontSize: 11, color: '#777' }}>Obs. supervisão: {e.supervisor_obs}</div> : null}

      {/* Construtor de equipe (gerente em aguardando_gerente negociar; supervisor ao incluir) */}
      {((e.status === 'aguardando_gerente' && e.sou_gestao && e.modo === 'negociar') || (e.status === 'aguardando_supervisor' && e.sou_supervisor)) && (
        <div style={{ marginTop: 10, padding: 8, background: '#fff', borderRadius: 8, border: '1px solid #eee' }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>{e.sou_supervisor ? 'Incluir colaborador (opcional):' : 'Quem vai trabalhar:'}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={novo.colaborador_id} onChange={ev => setNovo({ ...novo, colaborador_id: ev.target.value })} style={s.sel}>
              <option value="">Colaborador…</option>
              {equipeLoja.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.funcao_nome}</option>)}
            </select>
            <select value={novo.turno_nome} onChange={ev => setNovo({ ...novo, turno_nome: ev.target.value, horario_custom: ev.target.value === '__custom' ? novo.horario_custom : '' })} style={s.sel}>
              <option value="">Turno…</option>
              {turnoOpts.map(t => <option key={t} value={t}>{t}</option>)}
              <option value="__custom">Outro horário…</option>
            </select>
            {novo.turno_nome === '__custom' && <input placeholder="ex.: 13h–19h" value={novo.horario_custom} onChange={ev => setNovo({ ...novo, horario_custom: ev.target.value })} style={{ ...s.sel, width: 110 }} />}
            <button style={s.ghost} onClick={addPendente}>+ Adicionar</button>
          </div>
          {pendentes.length > 0 && <div style={{ marginTop: 6 }}>{pendentes.map(p => (
            <span key={p.colaborador_id} style={{ fontSize: 11, background: '#EEF2F7', borderRadius: 6, padding: '3px 8px', marginRight: 6, display: 'inline-flex', gap: 6 }}>
              {p.nome} {p.turno_nome === '__custom' ? `(${p.horario_custom})` : p.turno_nome ? `(${p.turno_nome})` : ''}<span style={{ cursor: 'pointer', color: '#993C1D' }} onClick={() => rmPendente(p.colaborador_id)}>×</span>
            </span>
          ))}</div>}
        </div>
      )}

      {/* Ações por estado/papel */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {e.status === 'aguardando_gerente' && e.sou_gestao && e.modo === 'ciencia' && (
          <button style={s.btn} onClick={() => post(`/escala/${escalaId}/gerente`, { acao: 'de_acordo' }, 'Ciência registrada.')}>✅ Dar ciência</button>
        )}
        {e.status === 'aguardando_gerente' && e.sou_gestao && e.modo === 'negociar' && (
          <>
            <input placeholder="Observação (opcional)" value={obs} onChange={ev => setObs(ev.target.value)} style={{ ...s.sel, flex: 1, minWidth: 120 }} />
            <button style={s.btn} onClick={() => post(`/escala/${escalaId}/gerente`, { acao: 'de_acordo', equipe: normaliza(pendentes), obs })}>De acordo + enviar equipe</button>
            <button style={s.ghost} onClick={() => post(`/escala/${escalaId}/gerente`, { acao: 'reanalise', obs })}>Pedir reanálise</button>
          </>
        )}
        {e.status === 'aguardando_supervisor' && e.sou_supervisor && (
          <>
            <input placeholder="Observação (opcional)" value={obs} onChange={ev => setObs(ev.target.value)} style={{ ...s.sel, flex: 1, minWidth: 120 }} />
            <button style={s.btn} onClick={() => post(`/escala/${escalaId}/supervisor`, { acao: 'aprovar' })}>Aprovar</button>
            {pendentes.length > 0 && <button style={s.btn} onClick={() => post(`/escala/${escalaId}/supervisor`, { acao: 'incluir', incluir: normaliza(pendentes), obs })}>Incluir e devolver</button>}
            <button style={s.ghost} onClick={() => post(`/escala/${escalaId}/supervisor`, { acao: 'rejeitar', obs })}>Rejeitar</button>
          </>
        )}
        {e.status === 'reanalise_horario' && e.sou_supervisor && (
          <div style={{ width: '100%' }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Ajuste o horário e reenvie:</div>
            {turnosEdit.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <input value={t.nome} onChange={ev => upd(turnosEdit, setTurnosEdit, i, 'nome', ev.target.value)} placeholder="Turno" style={{ ...s.sel, width: 90 }} />
                <input value={t.inicio} onChange={ev => upd(turnosEdit, setTurnosEdit, i, 'inicio', ev.target.value)} placeholder="início" style={{ ...s.sel, width: 70 }} />
                <input value={t.fim} onChange={ev => upd(turnosEdit, setTurnosEdit, i, 'fim', ev.target.value)} placeholder="fim" style={{ ...s.sel, width: 70 }} />
                <button style={s.ghost} onClick={() => setTurnosEdit(turnosEdit.filter((_, k) => k !== i))}>×</button>
              </div>
            ))}
            <button style={s.ghost} onClick={() => setTurnosEdit([...turnosEdit, { nome: `Turno ${turnosEdit.length + 1}`, inicio: '', fim: '' }])}>+ Turno</button>
            <input placeholder="Observação (opcional)" value={obs} onChange={ev => setObs(ev.target.value)} style={{ ...s.sel, width: '100%', margin: '6px 0' }} />
            <button style={s.btn} onClick={() => post(`/escala/${escalaId}/supervisor`, { turnos: turnosEdit, obs })}>Reenviar horário</button>
          </div>
        )}
        {e.status === 'reanalise_inclusao' && e.sou_gestao && (
          <button style={s.btn} onClick={() => post(`/escala/${escalaId}/gerente-ciencia`, {})}>✅ Dar ciência da inclusão</button>
        )}
      </div>

      {msg && <div style={{ fontSize: 11, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

function normaliza(lista) { return lista.map(p => ({ colaborador_id: p.colaborador_id, turno_nome: p.turno_nome === '__custom' ? null : (p.turno_nome || null), horario_custom: p.turno_nome === '__custom' ? p.horario_custom : null })); }
function upd(arr, set, i, k, v) { const c = arr.slice(); c[i] = { ...c[i], [k]: v }; set(c); }

const s = {
  box: { background: '#FFF9EE', border: '1px solid #F0E0C0', borderRadius: 10, padding: '10px 12px', marginTop: 8 },
  sel: { padding: '6px 8px', fontSize: 12, border: '1px solid #ddd', borderRadius: 6 },
  btn: { fontSize: 12, padding: '6px 12px', border: 'none', borderRadius: 8, background: '#111', color: '#fff', cursor: 'pointer' },
  ghost: { fontSize: 12, padding: '6px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'none', color: '#666', cursor: 'pointer' },
};
