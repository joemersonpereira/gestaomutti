import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const OP = [['bom', 'Bom', '#3B6D11', '#EAF3DE'], ['regular', 'Regular', '#854F0B', '#FAEEDA'], ['ruim', 'Ruim', '#993C1D', '#FCEBEB']];

// Ciclo diário do checklist de limpeza: abrir (manhã) → conferir Bom/Regular/Ruim → fechar (fim do dia).
// compact=true: usado dentro do card do Kanban (sem seletor de data, texto enxuto).
export default function ChecklistLimpezaInline({ compact = false, onChange }) {
  const { API } = useAuth();
  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(hoje);
  const [estado, setEstado] = useState(null);
  const [marcas, setMarcas] = useState({});
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    API.get('/checklist/limpeza', { params: { data } }).then(r => {
      setEstado(r.data);
      const base = {};
      (r.data.itens || []).forEach(i => { base[i.id] = (r.data.respostas && r.data.respostas[i.id]) || 'bom'; });
      setMarcas(base);
    }).catch(() => {});
  }, [API, data]);
  useEffect(() => { carregar(); }, [carregar]);

  async function abrir() {
    try { const r = await API.post('/checklist/limpeza/abrir', { data }); setMsg('✅ ' + r.data.mensagem); carregar(); onChange?.(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }
  async function salvar() {
    try { await API.post('/checklist/limpeza/salvar', { data, respostas: marcas }); setMsg('✅ Progresso salvo.'); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }
  async function fechar() {
    try {
      const r = await API.post('/checklist/limpeza/fechar', { data, respostas: marcas });
      if (r.data.cedo_demais) { setMsg(`⏳ Precisa ficar aberto o tempo mínimo do checklist. Faltam ~${r.data.faltam_min} min.`); return; }
      setMsg(`✅ ${r.data.mensagem}` + (r.data.tarefa_gerada ? ' · tarefa de correção gerada' : '')); carregar(); onChange?.();
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }

  if (!estado) return <div style={s.card}>Carregando…</div>;
  if (!estado.modelo) return <div style={s.card}><div style={{ fontSize: 12, color: '#999' }}>Nenhum checklist de limpeza diário cadastrado.</div></div>;
  const travado = !estado.aberto || estado.fechado;

  return (
    <div style={s.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{estado.modelo.nome} <span style={s.tag}>diário</span></div>
        {!compact && <input type="date" value={data} onChange={e => setData(e.target.value)} style={s.dateInput} />}
      </div>
      <div style={{ fontSize: 12, margin: '6px 0' }}>
        {!estado.aberto && <span style={{ color: '#854F0B' }}>não aberto</span>}
        {estado.aberto && !estado.fechado && <span style={{ color: '#185FA5' }}>aberto às {new Date(estado.aberto_em + 'Z').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
        {estado.fechado ? <span style={{ color: '#3B6D11' }}>✅ fechado{estado.fechado_em ? ' às ' + new Date(estado.fechado_em + 'Z').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span> : null}
      </div>

      {!estado.aberto && <button style={s.btn} onClick={abrir}>🔓 Abrir checklist (manhã)</button>}

      {estado.aberto && estado.itens.map(i => (
        <div key={i.id} style={s.itemRow}>
          <span style={{ flex: 1, fontSize: 12 }}>{i.texto}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {OP.map(([v, label, cor, bg]) => (
              <button key={v} disabled={travado} onClick={() => setMarcas({ ...marcas, [i.id]: v })}
                style={{ ...s.op, fontWeight: 600, ...(marcas[i.id] === v ? { borderColor: cor, background: bg, color: cor } : { color: '#888' }), ...(travado ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}>{label}</button>
            ))}
          </div>
        </div>
      ))}

      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 8 }}>{msg}</div>}

      {estado.aberto && !estado.fechado && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button style={s.btn} onClick={salvar}>Salvar conferência</button>
          <button style={s.btnSec} onClick={fechar}>Fechar o dia</button>
        </div>
      )}

      {!compact && <div style={s.info}>💡 Abra de manhã e <strong>feche no fim do dia</strong>. O fechamento só libera após o <strong>tempo mínimo</strong> configurado para os checklists.</div>}
    </div>
  );
}

const s = {
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  tag: { fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#E6F1FB', color: '#185FA5' },
  itemRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #f5f5f5' },
  op: { fontSize: 14, padding: '3px 8px', border: '1px solid #ddd', borderRadius: 6, background: 'none', cursor: 'pointer' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnSec: { fontSize: 13, padding: '8px 14px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  dateInput: { padding: '7px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8 },
  info: { fontSize: 11, color: '#888', marginTop: 12, lineHeight: 1.5 },
};
