import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const STATUS = { pendente: ['Pendente', '#854F0B', '#FAEEDA'], feito: ['Feito', '#3B6D11', '#EAF3DE'], adiado: ['Adiado', '#185FA5', '#E6F1FB'] };

// Ciclo diário do Checklist Operacional (abrir → marcar feito/adiar → fechar), por loja.
// Itens semanais/mensais pendentes do período entram pra conferir e travam ao fechar.
// compact=true: usado dentro do card do Kanban.
export default function ChecklistOperacionalInline({ compact = false, onChange }) {
  const { API } = useAuth();
  const [itens, setItens] = useState([]);
  const [dia, setDia] = useState({ aberto: false, fechado: 0, aberto_em: null, fechado_em: null });
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => {
    API.get('/operacional').then(r => {
      setItens(r.data.itens || []);
      setDia({ aberto: !!r.data.aberto, fechado: r.data.fechado ? 1 : 0, aberto_em: r.data.aberto_em, fechado_em: r.data.fechado_em });
    });
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  async function abrir() { try { const r = await API.post('/operacional/abrir', {}); setMsg('✅ ' + r.data.mensagem); carregar(); onChange?.(); } catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); } }
  async function fechar() { try { const r = await API.post('/operacional/fechar', {}); setMsg('✅ ' + (r.data.mensagem || 'Fechado.')); carregar(); onChange?.(); } catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); } }
  async function feito(id) { try { await API.post(`/operacional/${id}/feito`, {}); setMsg('✅ Marcado como feito.'); carregar(); } catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); } }
  async function adiar(id) {
    try { const r = await API.post(`/operacional/${id}/adiar`, {}); setMsg(r.data.ok ? `↪️ Adiado (limite ${r.data.limite}).` : `🔒 ${r.data.erro}`); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }

  const travado = !dia.aberto || !!dia.fechado;
  const grupos = [...new Set(itens.map(i => i.checklist_nome))];
  const PER = { diaria: 'diário', semanal: 'semanal', mensal: 'mensal' };
  return (
    <div>
      {!compact && <div style={s.sub}>Abra de manhã, confira ao longo do dia e feche no fim. Itens semanais e mensais entram no período pra conferir e travam ao fechar o dia.</div>}

      <div style={s.card}>
        <div style={{ fontSize: 12 }}>
          {!dia.aberto && <span style={{ color: '#854F0B' }}>não aberto</span>}
          {dia.aberto && !dia.fechado && <span style={{ color: '#185FA5' }}>aberto às {new Date(dia.aberto_em + 'Z').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
          {dia.fechado ? <span style={{ color: '#3B6D11' }}>✅ fechado{dia.fechado_em ? ' às ' + new Date(dia.fechado_em + 'Z').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span> : null}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {!dia.aberto && <button style={s.btnPrim} onClick={abrir}>🔓 Abrir checklist (manhã)</button>}
          {dia.aberto && !dia.fechado && <button style={s.btnSec} onClick={fechar}>Fechar o dia</button>}
        </div>
      </div>

      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') || msg.startsWith('↪️') ? '#3B6D11' : '#993C1D', marginBottom: 10 }}>{msg}</div>}

      {grupos.map(g => {
        const doGrupo = itens.filter(i => i.checklist_nome === g);
        if (!doGrupo.length) return null;
        return (
          <div key={g} style={{ marginBottom: 16 }}>
            <div style={s.grupoTit}>{g}</div>
            {doGrupo.map(i => {
              const st = STATUS[i.status] || STATUS.pendente;
              return (
                <div key={i.id} style={s.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{i.nome} <span style={{ fontWeight: 400, color: '#999', fontSize: 11 }}>· {PER[i.periodicidade]}</span></div>
                      <div style={{ fontSize: 11, color: '#999' }}>
                        {i.status === 'adiado' ? `previsto p/ ${i.data_prevista} · ` : ''}{i.adiamentos > 0 ? `adiado ${i.adiamentos}x · ` : ''}limite {i.data_limite}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: st[2], color: st[1] }}>{st[0]}</span>
                  </div>
                  {i.status !== 'feito' && !travado && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button style={s.btnOk} onClick={() => feito(i.id)}>✅ Feito</button>
                      {i.pode_adiar
                        ? <button style={s.btnSm} onClick={() => adiar(i.id)}>↪️ Adiar</button>
                        : <span style={{ fontSize: 11, color: '#993C1D', alignSelf: 'center' }}>{i.periodicidade === 'diaria' ? 'não adiável' : '🔒 trava (última semana)'}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {itens.length > 0 && travado && (
        <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{dia.fechado ? 'Dia fechado — reabra amanhã para continuar os itens pendentes do período.' : 'Abra o checklist do dia para marcar os itens.'}</div>
      )}
      {!itens.length && <div style={s.card}>Nenhuma tarefa operacional cadastrada.</div>}
    </div>
  );
}

const s = {
  sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  grupoTit: { fontSize: 12, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '0.8rem 1rem', marginBottom: 8 },
  btnPrim: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnSec: { fontSize: 13, padding: '8px 14px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnOk: { fontSize: 12, padding: '4px 12px', border: '1.5px solid #3B6D11', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#3B6D11', fontWeight: 500 },
  btnSm: { fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666' },
};
