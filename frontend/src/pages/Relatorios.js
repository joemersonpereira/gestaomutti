import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

export default function Relatorios() {
  const { API } = useAuth();
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [msg, setMsg] = useState('');

  async function baixar(rota, nome, params) {
    setMsg('Gerando…');
    try {
      const r = await API.get(rota, { params, responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a'); a.href = url; a.download = nome; a.click();
      URL.revokeObjectURL(url); setMsg('✅ Download iniciado.');
    } catch (e) { setMsg('Erro ao gerar relatório.'); }
  }

  return (
    <div style={s.wrap}>
      <Banner emoji="📑" titulo="Relatórios" cor="ciano" sub="Exportação de dados" />

      <div style={s.card}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="number" style={s.input} value={mes} onChange={e => setMes(e.target.value)} placeholder="Mês" />
          <input type="number" style={s.input} value={ano} onChange={e => setAno(e.target.value)} placeholder="Ano" />
        </div>
        {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#666', marginBottom: 8 }}>{msg}</div>}
        <button style={s.btn} onClick={() => baixar('/relatorios/vendas.csv', `vendas-${mes}-${ano}.csv`, { mes, ano })}>⬇ Vendas (CSV)</button>
        <button style={s.btn} onClick={() => baixar('/relatorios/ocorrencias.csv', 'ocorrencias.csv', {})}>⬇ Ocorrências (CSV)</button>
        <button style={s.btn} onClick={() => baixar('/relatorios/vendas.xlsx', `vendas-${mes}-${ano}.xlsx`, { mes, ano })}>⬇ Vendas (Excel)</button>
        <button style={s.btnGhost} onClick={() => window.open(`/api/relatorios/painel.html?mes=${mes}&ano=${ano}`, '_blank')}>🖨 Relatório imprimível (PDF)</button>
      </div>
      <div style={s.info}>Os arquivos CSV abrem direto no Excel. O relatório imprimível abre no navegador — use “Imprimir → Salvar como PDF”. O Excel (.xlsx) requer a dependência <code>xlsx</code> instalada no servidor.</div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  input: { flex: 1, padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box' },
  btn: { fontSize: 13, padding: '10px 14px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left' },
  btnGhost: { fontSize: 13, padding: '10px 14px', background: 'none', color: '#333', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', textAlign: 'left' },
  info: { fontSize: 11, color: '#777', lineHeight: 1.5 },
};
