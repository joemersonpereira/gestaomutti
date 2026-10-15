import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const ST = {
  pendente: ['Pendente', '#854F0B', '#FAEEDA'],
  aprovada: ['Aprovada', '#3B6D11', '#EAF3DE'],
  rejeitada: ['Rejeitada', '#993C1D', '#FCEBEB'],
};
const fmt = d => { try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };

// Bloco de aprovação de folga dentro do card do Kanban (origem='folga').
export default function FolgaAprovacaoInline({ folgaId, onChange }) {
  const { API } = useAuth();
  const [fo, setFo] = useState(null);
  const [sub, setSub] = useState('');
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    API.get(`/folgas/${folgaId}`).then(r => setFo(r.data)).catch(() => setFo(false));
  }, [API, folgaId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function aprovar() {
    if (fo.exige_substituto && !sub) { setMsg('Escolha quem vai substituir.'); return; }
    try { await API.post(`/folgas/${folgaId}/aprovar`, sub ? { substituto_id: sub } : {}); setMsg('✅ Aprovada.'); onChange?.(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }
  async function rejeitar() {
    try { await API.post(`/folgas/${folgaId}/rejeitar`, {}); setMsg('Rejeitada.'); onChange?.(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }

  if (fo === null) return <div style={s.box}>Carregando…</div>;
  if (fo === false) return null;
  const st = ST[fo.status] || ST.pendente;

  return (
    <div style={s.box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{fo.colaborador_nome} · {fmt(fo.data)}</div>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: st[2], color: st[1], fontWeight: 600 }}>{st[0]}</span>
      </div>
      <div style={{ fontSize: 11, color: '#777', margin: '4px 0' }}>
        {fo.funcao_nome}{fo.solicitado_por_nome ? ` · pedido por ${fo.solicitado_por_nome}` : ''}
        {fo.fila_total > 1 ? ` · ${fo.fila_posicao}º de ${fo.fila_total} na fila desse dia` : ''}
        {fo.motivo ? ` · ${fo.motivo}` : ''}
      </div>
      {fo.fora_prazo && fo.status === 'pendente' && <div style={{ fontSize: 11, color: '#854F0B', marginBottom: 6 }}>⚠️ Pedida dentro do mês (fora do prazo) — índice de reprovação alto. Se aprovar, RH e supervisão entram para ciência.</div>}

      {fo.status === 'pendente' && fo.pode_aprovar && (
        <>
          {fo.exige_substituto && (
            <div style={{ margin: '8px 0' }}>
              <div style={{ fontSize: 11, color: '#854F0B', marginBottom: 4 }}>
                {fo.precisa_substituto
                  ? 'Gerente e subgerente ausentes — escolha o substituto (Liderança):'
                  : 'Escolha quem vai cobrir / substituir no dia (obrigatório para aprovar):'}
              </div>
              {(fo.substitutos || []).length === 0
                ? <div style={{ fontSize: 11, color: '#993C1D' }}>Nenhum colega disponível para substituir nessa loja.</div>
                : <select value={sub} onChange={e => setSub(e.target.value)} style={s.sel}>
                    <option value="">Substituto…</option>
                    {fo.substitutos.map(l => <option key={l.id} value={l.id}>{l.nome}{l.funcao ? ` · ${l.funcao}` : ''}</option>)}
                  </select>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button style={s.ok} onClick={aprovar}>✅ Aprovar</button>
            <button style={s.no} onClick={rejeitar}>Rejeitar</button>
          </div>
        </>
      )}
      {fo.status === 'pendente' && !fo.pode_aprovar && <div style={{ fontSize: 11, color: '#999' }}>Aguardando aprovação de quem tem alçada.</div>}
      {fo.status !== 'pendente' && fo.aprovado_por_nome && <div style={{ fontSize: 11, color: '#777' }}>{fo.status === 'aprovada' ? 'Aprovada' : 'Rejeitada'} por {fo.aprovado_por_nome}{fo.substituto_nome ? ` · substituto: ${fo.substituto_nome}` : ''}</div>}
      {msg && <div style={{ fontSize: 11, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

const s = {
  box: { background: '#fafafa', border: '1px solid #eee', borderRadius: 10, padding: '10px 12px', marginTop: 8 },
  sel: { padding: '6px 8px', fontSize: 12, border: '1px solid #ddd', borderRadius: 6, width: '100%' },
  ok: { fontSize: 12, padding: '5px 12px', border: '1.5px solid #3B6D11', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#3B6D11', fontWeight: 600 },
  no: { fontSize: 12, padding: '5px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#993C1D' },
};
