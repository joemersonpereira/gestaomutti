import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const WEB = 'https://web.hoptodesk.com/';
const fmtData = s => { if (!s) return '—'; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

export default function AcessoRemoto() {
  const { API } = useAuth();
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos'); // todos | online | offline
  const [msg, setMsg] = useState('');
  const [novoId, setNovoId] = useState(''); const [novoNome, setNovoNome] = useState('');
  const [editId, setEditId] = useState(null); const [editNome, setEditNome] = useState('');
  const flash = (m, erro) => { setMsg((erro ? '⚠️ ' : '✅ ') + m); setTimeout(() => setMsg(''), 2500); };
  const carregar = useCallback(() => { API.get('/hoptodesk/dispositivos').then(r => setLista(r.data.dispositivos || [])).catch(() => setLista([])); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  const conectar = (dev) => {
    const id = dev.device_id;
    try { navigator.clipboard && navigator.clipboard.writeText(id); } catch (e) { /* */ }
    window.open(WEB, '_blank', 'noopener');
    flash(`ID ${id} copiado — cole no HopToDesk e conecte.`);
  };
  const copiarId = (id) => { try { navigator.clipboard.writeText(id); flash('ID copiado.'); } catch (e) { flash('não consegui copiar', true); } };
  const adicionar = () => {
    const id = (novoId || '').replace(/\s+/g, '').trim(); if (!id) return;
    API.post('/hoptodesk/dispositivos', { device_id: id, nome: novoNome.trim() })
      .then(r => { setLista(r.data.dispositivos || []); setNovoId(''); setNovoNome(''); flash('Dispositivo salvo.'); })
      .catch(() => flash('erro ao salvar', true));
  };
  const salvarNome = (dev) => {
    API.put(`/hoptodesk/dispositivos/${dev.device_id}`, { nome: editNome.trim() })
      .then(r => { setLista(r.data.dispositivos || []); setEditId(null); flash('Nome atualizado.'); })
      .catch(() => flash('erro ao renomear', true));
  };
  const remover = (dev) => { if (!window.confirm(`Remover ${dev.nome || dev.device_id} da lista?`)) return; API.delete(`/hoptodesk/dispositivos/${dev.device_id}`).then(r => { setLista(r.data.dispositivos || []); flash('Removido.'); }).catch(() => {}); };
  const importarCsv = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { API.post('/hoptodesk/dispositivos/importar', { csv: rd.result }).then(r => { setLista(r.data.dispositivos || []); flash(`${r.data.importados} dispositivos importados.`); }).catch(err => flash(err.response?.data?.erro || 'erro ao importar', true)); };
    rd.readAsText(f); e.target.value = '';
  };

  const devs = (lista || []).filter(d => (filtro === 'todos' || (filtro === 'online' ? d.status === 'online' : d.status !== 'online'))
    && (!busca.trim() || `${d.nome} ${d.device_id} ${d.computer_name} ${d.grupo}`.toLowerCase().includes(busca.toLowerCase())));
  const nOnline = (lista || []).filter(d => d.status === 'online').length;
  const stPill = st => st === 'online'
    ? <span style={{ fontSize: 10.5, fontWeight: 700, color: '#15803d', background: '#eafaf0', borderRadius: 10, padding: '1px 8px' }}>● online</span>
    : <span style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', background: '#f1f5f9', borderRadius: 10, padding: '1px 8px' }}>○ offline</span>;
  const btn = (bg) => ({ border: 'none', background: bg, color: '#fff', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' });
  const inp = { border: '1px solid #e3e8ea', borderRadius: 8, padding: '7px 9px', fontSize: 13 };

  return (
    <div style={{ padding: 16, maxWidth: 1000, margin: '0 auto' }}>
      <Banner emoji="🖥️" titulo="Acesso remoto" cor="verde" sub="Computadores das lojas (HopToDesk) — conecte com um clique ou digite um ID. Os chamados continuam no Suporte Loja." />

      <div style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>⚡ Conectar por ID</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={novoId} onChange={e => setNovoId(e.target.value)} onKeyDown={e => e.key === 'Enter' && adicionar()} placeholder="ID do dispositivo (ex.: 156275929)" style={{ ...inp, width: 230 }} />
          <input value={novoNome} onChange={e => setNovoNome(e.target.value)} onKeyDown={e => e.key === 'Enter' && adicionar()} placeholder="Nome (opcional)" style={{ ...inp, width: 180 }} />
          <button onClick={adicionar} style={btn('#185FA5')} disabled={!novoId.trim()}>💾 Salvar na lista</button>
          <button onClick={() => { if (!novoId.trim()) return; conectar({ device_id: novoId.replace(/\s+/g, '').trim() }); }} style={btn('#0d6b5e')} disabled={!novoId.trim()}>🔗 Conectar</button>
          <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Ao digitar um ID novo ele <b>fica salvo</b> pra próxima.</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔎 buscar nome, ID, computador…" style={{ ...inp, width: 260 }} />
        {['todos', 'online', 'offline'].map(f => <button key={f} onClick={() => setFiltro(f)} style={{ ...btn(filtro === f ? '#0d6b5e' : '#fff'), color: filtro === f ? '#fff' : '#64748b', border: '1px solid ' + (filtro === f ? '#0d6b5e' : '#e3e8ea') }}>{f === 'todos' ? 'Todos' : f === 'online' ? `Online (${nOnline})` : 'Offline'}</button>)}
        <button onClick={carregar} style={{ ...btn('#fff'), color: '#64748b', border: '1px solid #e3e8ea' }}>🔄 Atualizar</button>
        <label style={{ ...btn('#fff'), color: '#185FA5', border: '1px solid #185FA5', cursor: 'pointer' }}>⬆️ Importar CSV do dashboard
          <input type="file" accept=".csv,text/csv" onChange={importarCsv} style={{ display: 'none' }} />
        </label>
        {msg && <span style={{ fontSize: 12, fontWeight: 600, color: msg.startsWith('⚠️') ? '#C0392B' : '#15803d' }}>{msg}</span>}
      </div>

      <div style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 12, overflow: 'hidden' }}>
        {lista === null ? <div style={{ padding: 16, color: '#999' }}>carregando…</div> :
          !devs.length ? <div style={{ padding: 16, color: '#94a3b8' }}>Nenhum dispositivo. Importe o CSV do dashboard do HopToDesk ou adicione um ID acima.</div> :
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead><tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc' }}>{['Dispositivo', 'ID', 'Status', 'Computador', 'Último acesso', 'Ações'].map(h => <th key={h} style={{ padding: '8px 10px', fontWeight: 700 }}>{h}</th>)}</tr></thead>
                <tbody>{devs.map(d => (
                  <tr key={d.device_id} style={{ borderTop: '1px solid #f1f3f5' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 600 }}>
                      {editId === d.device_id
                        ? <span style={{ display: 'inline-flex', gap: 4 }}><input autoFocus value={editNome} onChange={e => setEditNome(e.target.value)} onKeyDown={e => e.key === 'Enter' && salvarNome(d)} style={{ ...inp, padding: '3px 6px', width: 150 }} /><button onClick={() => salvarNome(d)} style={btn('#0d6b5e')}>ok</button></span>
                        : <span>{d.nome || <span style={{ color: '#aab' }}>(sem nome)</span>}{d.grupo ? <span style={{ color: '#94a3b8', fontSize: 11 }}> · {d.grupo}</span> : ''} <button onClick={() => { setEditId(d.device_id); setEditNome(d.nome || ''); }} title="renomear" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, opacity: 0.6 }}>✏️</button></span>}
                    </td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#475569' }}>{d.device_id} <button onClick={() => copiarId(d.device_id)} title="copiar ID" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11 }}>📋</button></td>
                    <td style={{ padding: '7px 10px' }}>{stPill(d.status)}</td>
                    <td style={{ padding: '7px 10px', color: '#64748b' }}>{d.computer_name || '—'}</td>
                    <td style={{ padding: '7px 10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtData(d.last_seen)}</td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => conectar(d)} style={btn('#0d6b5e')}>🔗 Conectar</button>
                      <button onClick={() => remover(d)} title="remover" style={{ ...btn('#fff'), color: '#C0392B', border: '1px solid #f0c9c4', marginLeft: 6 }}>✕</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>🔗 <b>Conectar</b> abre o HopToDesk web ({WEB}) e copia o ID pra você colar. A lista vem do CSV exportado do dashboard (reimporte quando mudar) + os IDs que você digitar aqui.</p>
    </div>
  );
}
