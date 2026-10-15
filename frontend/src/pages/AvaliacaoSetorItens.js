import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const NOTAS_C = [['bom', 'Bom', '#3B6D11', '#EAF3DE'], ['regular', 'Regular', '#854F0B', '#FAEEDA'], ['ruim', 'Ruim', '#993C1D', '#FCEBEB']];
const brlAv = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

// Lançar a diferença de caixa na própria avaliação (alimenta o ranking, igual à aba "Lançar")
export function LancarDiferenca({ a, API }) {
  const [sinal, setSinal] = useState('falta');
  const [valor, setValor] = useState('');
  const [turno, setTurno] = useState('Manhã');
  const [obs, setObs] = useState('');
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [existentes, setExistentes] = useState([]);

  const carregarExistentes = useCallback(() => {
    if (!a.loja_id || !a.avaliado_id) return;
    const [ano, mes] = a.data.split('-');
    API.get('/caixa', { params: { mes: Number(mes), ano: Number(ano), loja_id: a.loja_id } })
      .then(r => setExistentes((r.data.lancamentos || []).filter(l => l.colaborador_id === a.avaliado_id && l.data === a.data)))
      .catch(() => {});
  }, [API, a.loja_id, a.avaliado_id, a.data]);
  useEffect(() => { carregarExistentes(); }, [carregarExistentes]);

  async function registrar() {
    setMsg('');
    if (valor === '' || isNaN(Number(valor))) { setMsg('Informe o valor da diferença (0 se bateu).'); return; }
    const dif = sinal === 'sobra' ? Math.abs(Number(valor)) : -Math.abs(Number(valor));
    setSalvando(true);
    try {
      const r = await API.post('/caixa', { loja_id: a.loja_id, colaborador_id: a.avaliado_id, data: a.data, turno, diferenca: dif, observacao: obs });
      setMsg('✅ ' + r.data.mensagem + (r.data.precisa_justificar ? ' Gerou tarefa de justificativa (>R$5).' : ''));
      setValor(''); setObs(''); carregarExistentes();
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
    setSalvando(false);
  }

  return (
    <div style={{ marginTop: 8, padding: 10, background: '#F6F8FB', borderRadius: 8, border: '1px solid #E6F1FB' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#185FA5', marginBottom: 6 }}>💰 Diferença de caixa do dia</div>
      {existentes.length > 0 && (
        <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
          Já lançado hoje: {existentes.map((l, i) => <span key={l.id}>{i > 0 ? ' · ' : ''}{l.diferenca > 0 ? 'sobra' : l.diferenca < 0 ? 'falta' : 'bateu'} {brlAv(Math.abs(l.diferenca))}</span>)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <button onClick={() => setSinal('falta')} style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: '5px 0', borderRadius: 6, cursor: 'pointer', border: `1px solid ${sinal === 'falta' ? '#993C1D' : '#ddd'}`, background: sinal === 'falta' ? '#FCEBEB' : '#fff', color: sinal === 'falta' ? '#993C1D' : '#888' }}>Falta (−)</button>
        <button onClick={() => setSinal('sobra')} style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: '5px 0', borderRadius: 6, cursor: 'pointer', border: `1px solid ${sinal === 'sobra' ? '#3B6D11' : '#ddd'}`, background: sinal === 'sobra' ? '#EAF3DE' : '#fff', color: sinal === 'sobra' ? '#3B6D11' : '#888' }}>Sobra (+)</button>
        <select value={turno} onChange={e => setTurno(e.target.value)} style={{ fontSize: 11, padding: '5px 8px', border: '1px solid #ddd', borderRadius: 6 }}>
          <option>Manhã</option><option>Tarde</option><option>Noite</option>
        </select>
      </div>
      <input type="number" step="0.01" placeholder="Valor da diferença (0 se bateu)" value={valor} onChange={e => setValor(e.target.value)} style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box', marginBottom: 6 }} />
      <input placeholder="Observação (opcional)" value={obs} onChange={e => setObs(e.target.value)} style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box', marginBottom: 6 }} />
      {msg && <div style={{ fontSize: 11, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginBottom: 6 }}>{msg}</div>}
      <button onClick={registrar} disabled={salvando} style={{ fontSize: 12, fontWeight: 600, padding: '6px 16px', border: 'none', background: '#185FA5', color: '#fff', borderRadius: 8, cursor: 'pointer' }}>{salvando ? 'Lançando…' : 'Registrar diferença'}</button>
    </div>
  );
}

export function ChecklistConduta({ a, API, onSaved }) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState([]);
  const [marcas, setMarcas] = useState({});
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function abrir() {
    if (aberto) { setAberto(false); return; }
    setAberto(true);
    try {
      const r = await API.get(`/avaliacao-admin/${a.id}/itens`);
      const its = r.data.itens || [];
      setItens(its);
      const m = {}; its.forEach(i => { if (i.nota) m[i.texto] = i.nota; });
      setMarcas(m);
    } catch (e) { setMsg('Erro ao carregar itens.'); }
  }

  async function salvar() {
    if (itens.some(i => !marcas[i.texto])) { setMsg('Avalie todos os itens.'); return; }
    setCarregando(true); setMsg('');
    try {
      await API.post(`/avaliacao-admin/${a.id}`, { itens: itens.map(i => ({ texto: i.texto, nota: marcas[i.texto] })) });
      onSaved();
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
    setCarregando(false);
  }

  if (!aberto) return <button onClick={abrir} style={{ marginTop: 4, fontSize: 12, fontWeight: 600, padding: '6px 14px', border: '1px solid #185FA5', color: '#185FA5', background: 'none', borderRadius: 8, cursor: 'pointer' }}>Avaliar conduta ▾</button>;

  return (
    <div style={{ marginTop: 6 }}>
      {itens.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Sem itens de conduta cadastrados para esta função.</div>}
      {itens.map(i => (
        <div key={i.texto} style={{ padding: '5px 0', borderTop: '1px solid #f5f5f5' }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>{i.texto}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {NOTAS_C.map(([v, label, cor, bg]) => (
              <button key={v} onClick={() => setMarcas({ ...marcas, [i.texto]: v })}
                style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: '5px 0', borderRadius: 6, cursor: 'pointer', border: `1px solid ${marcas[i.texto] === v ? cor : '#ddd'}`, background: marcas[i.texto] === v ? bg : '#fff', color: marcas[i.texto] === v ? cor : '#888' }}>{label}</button>
            ))}
          </div>
        </div>
      ))}
      {msg && <div style={{ fontSize: 12, color: '#993C1D', margin: '6px 0' }}>{msg}</div>}
      {itens.length > 0 && <button onClick={salvar} disabled={carregando} style={{ marginTop: 8, fontSize: 12, fontWeight: 600, padding: '7px 16px', border: 'none', background: '#3B6D11', color: '#fff', borderRadius: 8, cursor: 'pointer' }}>{carregando ? 'Salvando…' : 'Salvar avaliação'}</button>}
    </div>
  );
}

// Avaliação de uma pessoa (conduta + diferença, se for caixa)
export function AvaliacaoPessoa({ a, API, onSaved }) {
  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid #f0f0f0' }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.avaliado_nome}{a.status === 'contestada' && <span style={{ fontSize: 10, color: '#854F0B', background: '#FAEEDA', padding: '2px 8px', borderRadius: 10, marginLeft: 8 }}>contestou — reavaliar</span>}</div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{a.funcao_nome}{a.loja_nome ? ` · ${a.loja_nome}` : ''}</div>
      {a.status === 'contestada' && a.reanalise_motivo && <div style={{ fontSize: 12, color: '#854F0B', background: '#FAEEDA', padding: '6px 8px', borderRadius: 8, marginBottom: 6 }}>Motivo: {a.reanalise_motivo}</div>}
      {a.funcao_id === 'func-caixa' && <LancarDiferenca a={a} API={API} />}
      <ChecklistConduta a={a} API={API} onSaved={onSaved} />
    </div>
  );
}

// Painel embutido na tarefa do Kanban: lista as pessoas da tarefa e deixa avaliar ali mesmo.
// A tarefa de avaliação tem referencia_id = "lojaId:data:funcaoId".
export function AvaliacaoTarefaInline({ task, onRecarregar }) {
  const { API } = useAuth();
  const [lista, setLista] = useState([]);
  const [carregado, setCarregado] = useState(false);
  const parts = (task.referencia_id || '').split(':');
  const lojaId = parts[0], data = parts[1], funcaoId = parts[2];
  const valido = parts.length === 3 && parts[0] !== 'contesta';

  const carregar = useCallback(() => {
    if (!valido) { setCarregado(true); return; }
    API.get('/avaliacao-admin', { params: { data } })
      .then(r => { setLista((r.data.avaliacoes || []).filter(a => a.funcao_id === funcaoId && a.loja_id === lojaId)); setCarregado(true); })
      .catch(() => setCarregado(true));
  }, [API, data, funcaoId, lojaId, valido]);
  useEffect(() => { carregar(); }, [carregar]);

  const onSaved = () => { carregar(); if (onRecarregar) onRecarregar(); };

  if (!valido) return null;
  const pendentes = lista.filter(a => a.status === 'pendente' || a.status === 'contestada');
  const feitas = lista.filter(a => a.status === 'avaliada');

  return (
    <div style={{ marginTop: 10, padding: 10, background: '#FAFBFD', border: '1px solid #E6F1FB', borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#185FA5', marginBottom: 4 }}>⭐ Avaliar aqui mesmo{carregado ? ` · ${pendentes.length} pendente${pendentes.length === 1 ? '' : 's'}` : ''}</div>
      {!carregado && <div style={{ fontSize: 12, color: '#999' }}>Carregando…</div>}
      {carregado && pendentes.length === 0 && <div style={{ fontSize: 12, color: '#3B6D11' }}>✅ Tudo avaliado por aqui.</div>}
      {pendentes.map(a => <AvaliacaoPessoa key={a.id} a={a} API={API} onSaved={onSaved} />)}
      {feitas.length > 0 && <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>{feitas.length} já avaliada(s).</div>}
    </div>
  );
}
