import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { SpedRepo } from './Contabilidade';

// Acompanhamento: mercadoria que teve recebimento de transporte mas NÃO foi dada entrada —
// recebimento físico iniciado (status 'A' no ERP) e nunca concluído. Lê ao vivo do A7 (leitura).
function RecebimentoAberto({ API }) {
  const [d, setD] = useState(null);
  const [loja, setLoja] = useState('');
  const [lojas, setLojas] = useState([]);
  const [aberto, setAberto] = useState(true);
  const carregar = useCallback(() => {
    setD(null);
    API.get('/contabilidade/recebimento-aberto', { params: { loja } })
      .then(r => setD(r.data)).catch(() => setD({ itens: [], resumo: {}, erro: true }));
  }, [API, loja]);
  useEffect(() => { API.get('/contabilidade/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const cor = dias => dias > 7 ? '#A3372A' : dias > 2 ? '#B45309' : '#1E874B';
  const dBR = s => s ? String(s).split('-').reverse().join('/') : '—';
  return (
    <div style={{ background: '#fff', border: '1px solid #e9ecf1', borderRadius: 14, padding: 16, marginBottom: 20, boxShadow: '0 1px 3px rgba(16,24,40,.05)' }}>
      <div onClick={() => setAberto(a => !a)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>🚚 Recebido sem entrada <span style={{ color: '#0E7C5A' }}>{aberto ? '▲' : '▼'}</span></div>
        <div style={{ fontSize: 12, color: '#7a8a8c' }}>recebimento de transporte iniciado e não concluído no ERP</div>
        {d?.resumo?.total != null && <span style={{ marginLeft: 'auto', fontSize: 12.5 }}><b>{d.resumo.total}</b> em aberto{d.resumo.criticos ? <> · <b style={{ color: '#A3372A' }}>{d.resumo.criticos}</b> há +2 dias</> : ''}</span>}
      </div>
      {aberto && <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <select value={loja} onChange={e => setLoja(e.target.value)} style={{ padding: '6px 8px', fontSize: 13, border: '1px solid #dfe3e8', borderRadius: 8, background: '#fff' }}>
            <option value="">Todas as lojas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          <button onClick={carregar} style={{ padding: '6px 12px', fontSize: 13, border: '1px solid #dfe3e8', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>🔄 Atualizar</button>
        </div>
        {!d && <div style={{ fontSize: 13, color: '#999', padding: 10 }}>Carregando do ERP…</div>}
        {d?.erro && <div style={{ fontSize: 13, color: '#A3372A', padding: 10 }}>ERP indisponível agora — tente novamente.</div>}
        {d && !d.erro && d.itens.length === 0 && <div style={{ fontSize: 13, color: '#1E874B', padding: 10 }}>✅ Nenhum recebimento em aberto. Tudo com entrada dada.</div>}
        {d && d.itens && d.itens.length > 0 && <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: 'left', color: '#7a8a8c', borderBottom: '2px solid #eef1f4' }}>
              {['Loja', 'Recebimento', 'Iniciado', 'Dias em aberto', 'NF(s)', 'Itens', 'Quem iniciou'].map(h => <th key={h} style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{h}</th>)}
            </tr></thead>
            <tbody>{d.itens.map((r, i) => (
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
      <RecebimentoAberto API={API} />
      <SpedRepo API={API} />
    </div>
  );
}
