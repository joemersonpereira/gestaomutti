import React, { useState, useEffect, useCallback } from 'react';

// Observações do "Meu Setor" — bloco que a equipe vai acumulando. Usado em Tesouraria e Retail.
// base = endpoint (ex.: '/tesouraria/observacoes' ou '/trademkt/observacoes').
export default function SetorObservacoes({ API, base, titulo = '📝 Observações do setor' }) {
  const [itens, setItens] = useState([]); const [txt, setTxt] = useState(''); const [msg, setMsg] = useState('');
  const carregar = useCallback(() => { API.get(base).then(r => setItens(r.data.itens || [])).catch(() => {}); }, [API, base]);
  useEffect(() => { carregar(); }, [carregar]);
  const add = () => {
    const t = txt.trim(); if (!t) return;
    API.post(base, { texto: t }).then(() => { setTxt(''); carregar(); }).catch(e => { setMsg(e.response?.data?.erro || 'Erro'); setTimeout(() => setMsg(''), 2500); });
  };
  const del = id => API.delete(`${base}/${id}`).then(carregar).catch(() => {});
  const data = s => { if (!s) return ''; const d = String(s).replace('T', ' ').slice(0, 16); const [dia, hora] = d.split(' '); return (dia ? dia.split('-').reverse().join('/') : '') + (hora ? ' ' + hora : ''); };
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>{titulo}</div>
      <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 10px' }}>Registre o que estiver acontecendo com as metas do setor (contexto, combinados, pendências). Fica salvo pra todo mundo da área ver.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <textarea value={txt} onChange={e => setTxt(e.target.value)} placeholder="Escreva uma observação…" rows={2}
          style={{ flex: 1, minWidth: 260, border: '1px solid #e3e8ea', borderRadius: 10, padding: '8px 10px', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
        <button onClick={add} style={{ alignSelf: 'flex-start', background: 'linear-gradient(95deg,#0E7C5A,#0b6e59)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' }}>Adicionar</button>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: '#b91c1c', marginBottom: 8 }}>{msg}</div>}
      {itens.length === 0 ? <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Nenhuma observação ainda.</div> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {itens.map(i => (
            <div key={i.id} style={{ border: '1px solid #eef1f4', borderRadius: 10, padding: '9px 11px', background: '#fafbfc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>{i.autor_nome || 'Colaborador'} · {data(i.criado_em)}</span>
                <button onClick={() => del(i.id)} title="Apagar" style={{ border: 'none', background: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
              <div style={{ fontSize: 13, color: '#334', whiteSpace: 'pre-wrap' }}>{i.texto}</div>
            </div>
          ))}
        </div>}
    </div>
  );
}
