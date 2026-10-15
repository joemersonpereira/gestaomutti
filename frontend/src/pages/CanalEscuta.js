import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const TIPO = { sugestao: '💡 Sugestão', reclamacao: '⚠️ Reclamação', denuncia: '🚨 Denúncia', elogio: '👏 Elogio' };
const COR_STATUS = { aberto: '#BA7517', em_analise: '#185FA5', resolvido: '#3B6D11' };

export default function CanalEscuta() {
  const { API } = useAuth();
  const [msgs, setMsgs] = useState([]);
  const [filtro, setFiltro] = useState('todos');
  const [resp, setResp] = useState({}); // id -> texto de resposta

  const carregar = useCallback(() => { API.get('/mural/ouvidoria').then(r => setMsgs(r.data.mensagens || [])).catch(() => setMsgs([])); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  async function acao(id, patch) { await API.patch(`/mural/ouvidoria/${id}`, patch); carregar(); }

  const filtrados = msgs.filter(m => filtro === 'todos' ? true : filtro === 'abertos' ? m.status !== 'resolvido' : m.tipo === filtro);

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>📬 Canal de escuta</div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 14 }}>Denúncias, sugestões, reclamações e elogios enviados pela equipe. Cada nova mensagem também abre uma tarefa para o Diretor.</div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {[['todos', 'Todos'], ['abertos', 'Em aberto'], ['denuncia', '🚨 Denúncias'], ['reclamacao', '⚠️ Reclamações'], ['sugestao', '💡 Sugestões'], ['elogio', '👏 Elogios']].map(([v, l]) => (
          <button key={v} onClick={() => setFiltro(v)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20, border: '1px solid ' + (filtro === v ? '#111' : '#ddd'), background: filtro === v ? '#111' : '#fff', color: filtro === v ? '#fff' : '#666', cursor: 'pointer' }}>{l}</button>
        ))}
      </div>

      {filtrados.length === 0 && <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 20, color: '#999' }}>Nenhuma mensagem.</div>}
      {filtrados.map(m => (
        <div key={m.id} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '12px 16px', marginBottom: 10, borderLeft: `3px solid ${COR_STATUS[m.status] || '#ccc'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{TIPO[m.tipo] || m.tipo}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: COR_STATUS[m.status], background: (COR_STATUS[m.status] || '#999') + '18', padding: '2px 10px', borderRadius: 6 }}>{m.status === 'em_analise' ? 'em análise' : m.status}</span>
          </div>
          <div style={{ fontSize: 14, color: '#333', margin: '8px 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.texto}</div>
          <div style={{ fontSize: 11, color: '#999' }}>{m.anonimo ? '🕵️ Anônimo' : m.colaborador_nome} · {String(m.criado_em).slice(0, 10).split('-').reverse().join('/')}</div>
          {m.resposta && <div style={{ fontSize: 13, color: '#185FA5', background: '#F1F6FC', borderRadius: 8, padding: '8px 10px', marginTop: 8 }}><strong>Resposta:</strong> {m.resposta}</div>}
          {m.status !== 'resolvido' && (
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={resp[m.id] || ''} onChange={e => setResp({ ...resp, [m.id]: e.target.value })} placeholder="Escrever resposta (opcional)…"
                style={{ flex: 1, minWidth: 200, border: '1px solid #ddd', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
              {m.status === 'aberto' && <button onClick={() => acao(m.id, { status: 'em_analise' })} style={btn('#185FA5')}>Em análise</button>}
              <button onClick={() => acao(m.id, { status: 'resolvido', resposta: resp[m.id] || undefined })} style={btn('#3B6D11')}>Resolver</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
const btn = c => ({ fontSize: 12, padding: '7px 12px', background: c, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 });
