import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { SpedRepo } from './Contabilidade';
import { usePeriodo, CampoPeriodo } from '../components/Periodo';

// Acompanhamento: mercadoria que teve recebimento de transporte mas NÃO foi dada entrada —
// recebimento físico iniciado (status 'A' no ERP) e nunca concluído. Lê ao vivo do A7 (leitura).
export function RecebimentoAberto({ API }) {
  const [d, setD] = useState(null);
  const [loja, setLoja] = useState('');
  const [lojas, setLojas] = useState([]);
  const per = usePeriodo('todo');
  const [aberto, setAberto] = useState(true);
  const [pessoa, setPessoa] = useState(''); // drill-down: filtra as notas de quem iniciou
  const carregar = useCallback(() => {
    setD(null);
    API.get('/contabilidade/recebimento-aberto', { params: { loja, ...per.params } })
      .then(r => setD(r.data)).catch(() => setD({ itens: [], resumo: {}, erro: true }));
  }, [API, loja, per.params]);
  useEffect(() => { API.get('/contabilidade/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const cor = dias => dias > 7 ? '#A3372A' : dias > 2 ? '#B45309' : '#1E874B';
  const dBR = s => s ? String(s).split('-').reverse().join('/') : '—';
  return (
    <div style={{ background: '#fff', border: '1px solid #e9ecf1', borderRadius: 14, padding: 16, marginBottom: 20, boxShadow: '0 1px 3px rgba(16,24,40,.05)' }}>
      <div onClick={() => setAberto(a => !a)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>🚚 Recepção de transporte sem entrada <span style={{ color: '#0E7C5A' }}>{aberto ? '▲' : '▼'}</span></div>
        <div style={{ fontSize: 12, color: '#7a8a8c' }}>teve recepção de transporte (mercadoria chegou) mas NÃO deu entrada no ERP — recebimento iniciado e não concluído</div>
        {d?.resumo?.total != null && <span style={{ marginLeft: 'auto', fontSize: 12.5 }}><b>{d.resumo.total}</b> em aberto{d.resumo.criticos ? <> · <b style={{ color: '#A3372A' }}>{d.resumo.criticos}</b> há +2 dias</> : ''}</span>}
      </div>
      {aberto && <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <select value={loja} onChange={e => setLoja(e.target.value)} style={{ padding: '6px 8px', fontSize: 13, border: '1px solid #dfe3e8', borderRadius: 8, background: '#fff' }}>
            <option value="">Todas as lojas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          <CampoPeriodo {...per} comTodo diasOpc={[7, 15, 30, 60, 90]} />
          <button onClick={carregar} style={{ padding: '6px 12px', fontSize: 13, border: '1px solid #dfe3e8', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>🔄 Atualizar</button>
        </div>
        {!d && <div style={{ fontSize: 13, color: '#999', padding: 10 }}>Carregando do ERP…</div>}
        {d?.erro && <div style={{ fontSize: 13, color: '#A3372A', padding: 10 }}>ERP indisponível agora — tente novamente.</div>}
        {d && !d.erro && d.itens.length === 0 && <div style={{ fontSize: 13, color: '#1E874B', padding: 10 }}>✅ Nenhum recebimento em aberto. Tudo com entrada dada.</div>}
        {/* Ranking: quem iniciou recepção e deixou sem concluir (mais pendências primeiro). Clica p/ ver as notas. */}
        {d && d.itens && d.itens.length > 0 && (() => {
          const rk = {}; d.itens.forEach(r => { const k = r.iniciado_por || '—'; (rk[k] = rk[k] || { pessoa: k, qtd: 0, criticos: 0, maxDias: 0 }); rk[k].qtd++; if (r.dias > 2) rk[k].criticos++; rk[k].maxDias = Math.max(rk[k].maxDias, r.dias); });
          const ranking = Object.values(rk).sort((a, b) => b.qtd - a.qtd);
          const maxQtd = Math.max(1, ...ranking.map(p => p.qtd));
          const medalha = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
          return <div style={{ margin: '4px 0 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#334' }}>🏷️ Quem deixou recepção sem concluir</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>clique numa pessoa para ver as notas dela</div>
              {pessoa && <button onClick={() => setPessoa('')} style={{ marginLeft: 'auto', border: '1px solid #e3e8ea', background: '#fff', borderRadius: 7, color: '#64748b', cursor: 'pointer', fontSize: 11.5, padding: '3px 9px' }}>limpar filtro ✕</button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
              {ranking.map((p, i) => { const sel = pessoa === p.pessoa; return (
                <button key={i} onClick={() => setPessoa(sel ? '' : p.pessoa)} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid ' + (sel ? '#0E7C5A' : '#eef1f4'), background: sel ? '#eaf6ef' : '#fff', borderRadius: 11, padding: '8px 11px', cursor: 'pointer', textAlign: 'left', boxShadow: sel ? '0 0 0 1px #0E7C5A' : '0 1px 2px rgba(16,24,40,.04)' }}>
                  <span style={{ width: 26, textAlign: 'center', fontSize: medalha(i) ? 16 : 13, fontWeight: 800, color: '#94a3b8' }}>{medalha(i) || (i + 1 + 'º')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.pessoa}</div>
                    <div style={{ height: 5, background: '#f1f5f4', borderRadius: 3, marginTop: 4 }}><div style={{ width: Math.max(8, p.qtd / maxQtd * 100) + '%', height: '100%', background: p.criticos ? '#C0392B' : '#0E7C5A', borderRadius: 3 }} /></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: p.criticos ? '#C0392B' : '#0d6b5e', lineHeight: 1 }}>{p.qtd}</div>
                    {p.criticos > 0 && <div style={{ fontSize: 10, color: '#C0392B', fontWeight: 600 }}>⚠️ {p.criticos} +2d</div>}
                  </div>
                </button>); })}
            </div>
          </div>;
        })()}
        {pessoa && d && d.itens && d.itens.length > 0 && <div style={{ overflowX: 'auto' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#334', margin: '2px 0 6px' }}>📄 Notas de <span style={{ color: '#0E7C5A' }}>{pessoa}</span></div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: 'left', color: '#7a8a8c', borderBottom: '2px solid #eef1f4' }}>
              {['Loja', 'Recebimento', 'Iniciado', 'Dias em aberto', 'NF(s)', 'Itens', 'Quem iniciou'].map(h => <th key={h} style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{h}</th>)}
            </tr></thead>
            <tbody>{d.itens.filter(r => (r.iniciado_por || '—') === pessoa).map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f3f5f7' }}>
                <td style={{ padding: '7px 8px', fontWeight: 600 }}>{r.loja}</td>
                <td style={{ padding: '7px 8px' }}>#{r.codigo}</td>
                <td style={{ padding: '7px 8px', color: '#666', whiteSpace: 'nowrap' }}>{dBR(r.inicio)}</td>
                <td style={{ padding: '7px 8px', fontWeight: 700, color: cor(r.dias), whiteSpace: 'nowrap' }}>{r.dias} dia{r.dias === 1 ? '' : 's'}</td>
                <td style={{ padding: '7px 8px' }}>{r.nf || '—'}{r.nfs > 1 ? ` (+${r.nfs - 1})` : ''}</td>
                <td style={{ padding: '7px 8px' }}>{r.itens}</td>
                <td style={{ padding: '7px 8px', color: '#666' }}>{r.iniciado_por || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
      </div>}
    </div>
  );
}

// Menu Fiscal — acompanhamento de "recebido sem entrada" + o repositório de SPED/EFD, a conciliação
// NF × XML (SEFAZ × Alpha) e o BI de tempo de entrada (abas internas do SpedRepo).
// Obs.: as páginas pegam o API do contexto (useAuth), não por prop — o App renderiza <C /> sem props.
export default function Fiscal() {
  const { API } = useAuth();
  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '6px 0 12px', borderBottom: '1px solid var(--line,#ddd8cf)', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#1e293b' }}>📋 Fiscal</h1>
      </div>
      {/* "Recebido sem entrada" foi movido para o menu Suporte Loja (não duplicar aqui). */}
      <SpedRepo API={API} />
    </div>
  );
}
