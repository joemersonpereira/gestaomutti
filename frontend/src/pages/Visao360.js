import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { FichaColaborador } from './Cadastros';

// Visão 360 do colaborador — o líder/RH seleciona alguém da equipe e vê tudo (histórico,
// desempenho, desenvolvimento) sem precisar abrir o cadastro (que é da RH).
const RH = ['RH', 'Gestor Geral', 'Diretor Geral'];

export default function Visao360() {
  const { API, usuario } = useAuth();
  const [colabs, setColabs] = useState([]);
  const [sel, setSel] = useState('');
  const podeDocs = RH.includes(usuario.funcao);

  useEffect(() => { API.get('/capacitacao/avaliacoes/colaboradores').then(r => setColabs(r.data.colaboradores || [])).catch(() => {}); }, [API]);
  const atual = colabs.find(c => c.id === sel);

  return (
    <div style={{ padding: '1rem', maxWidth: 900, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <Banner emoji="🧭" titulo="Visão 360 do colaborador" cor="azul" sub="Histórico, desempenho e desenvolvimento de cada pessoa da equipe — num lugar só." />
      <select value={sel} onChange={e => setSel(e.target.value)} style={{ width: '100%', maxWidth: 380, padding: '10px 12px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, marginBottom: 14 }}>
        <option value="">Selecione o colaborador…</option>
        {colabs.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.funcao}{c.loja ? ` · ${c.loja}` : ''}</option>)}
      </select>
      {!sel && <div style={{ background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, padding: '2rem', textAlign: 'center', color: '#999' }}>Escolha um colaborador para ver a visão 360 completa dele.</div>}
      {sel && atual && <FichaColaborador API={API} colaboradorId={sel} nome={atual.nome} documentos={podeDocs} />}
    </div>
  );
}
