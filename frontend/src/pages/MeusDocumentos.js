import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const TIPO_LABEL = { holerite: 'Holerite', informe: 'Informe de rendimento' };

export default function MeusDocumentos() {
  const { API } = useAuth();
  const [docs, setDocs] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(null);   // id do doc com PDF aberto
  const [urlPdf, setUrlPdf] = useState(null);
  const [vistos, setVistos] = useState({});      // ids já abertos (habilita ciência)
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    setCarregando(true);
    API.get('/documentos/meus').then(r => setDocs(r.data.documentos || [])).finally(() => setCarregando(false));
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  async function verPdf(d) {
    setMsg('');
    if (aberto === d.id) { setAberto(null); if (urlPdf) URL.revokeObjectURL(urlPdf); setUrlPdf(null); return; }
    try {
      const r = await API.get(`/documentos/${d.id}/arquivo`, { responseType: 'blob' });
      if (urlPdf) URL.revokeObjectURL(urlPdf);
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      setUrlPdf(url); setAberto(d.id); setVistos(v => ({ ...v, [d.id]: true }));
    } catch (e) { setMsg('Não foi possível abrir o documento.'); }
  }

  async function darCiencia(d) {
    try {
      const r = await API.post(`/documentos/${d.id}/ciente`, {});
      setMsg('✅ ' + (r.data.mensagem || 'Ciência registrada.'));
      carregar();
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro ao registrar ciência.'); }
  }

  const pendentes = docs.filter(d => d.status === 'pendente');

  return (
    <div style={s.wrap}>
      <Banner emoji="📄" titulo="Meus documentos" cor="azul" sub="Holerites e informes de rendimento. Abra o documento e marque ciência." />
      {pendentes.length > 0 && <div style={s.alerta}>Você tem {pendentes.length} documento(s) aguardando sua ciência.</div>}
      {msg && <div style={{ fontSize: 13, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', margin: '6px 0' }}>{msg}</div>}

      {carregando && <div style={{ color: '#999' }}>Carregando…</div>}
      {!carregando && docs.length === 0 && <div style={s.card}>Nenhum documento disponível ainda.</div>}

      {docs.map(d => (
        <div key={d.id} style={{ ...s.card, borderLeft: d.status === 'pendente' ? '3px solid #BA7517' : '3px solid #3B6D11' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{d.titulo || TIPO_LABEL[d.tipo]}</div>
              <div style={{ fontSize: 11, color: '#999' }}>{TIPO_LABEL[d.tipo]} · {d.competencia} · {d.paginas} pág.</div>
            </div>
            {d.status === 'ciente'
              ? <span style={{ fontSize: 11, fontWeight: 700, color: '#3B6D11', background: '#EAF3DE', padding: '3px 10px', borderRadius: 6 }}>✓ Ciente em {String(d.ciente_em).slice(0, 10).split('-').reverse().join('/')}</span>
              : <span style={{ fontSize: 11, fontWeight: 700, color: '#8A6D1D', background: '#FBF0DA', padding: '3px 10px', borderRadius: 6 }}>Aguardando ciência</span>}
            <button style={s.btnSec} onClick={() => verPdf(d)}>{aberto === d.id ? 'Fechar' : '👁 Ver documento'}</button>
            {d.status === 'pendente' && (
              <button style={{ ...s.btn, ...(vistos[d.id] ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }} disabled={!vistos[d.id]}
                onClick={() => darCiencia(d)} title={vistos[d.id] ? '' : 'Abra o documento antes de dar ciência'}>Estou ciente</button>
            )}
          </div>
          {aberto === d.id && urlPdf && (
            <div style={{ marginTop: 10 }}>
              <iframe title="documento" src={urlPdf} style={{ width: '100%', height: '70vh', border: '1px solid #eee', borderRadius: 8 }} />
              {d.status === 'pendente' && <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Confira que os dados são seus e clique em “Estou ciente”.</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1120, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 10 },
  alerta: { fontSize: 12, color: '#8A6D1D', background: '#FBF0DA', border: '1px solid #F0DCB0', borderRadius: 8, padding: '8px 10px', marginBottom: 10 },
  btn: { fontSize: 12, padding: '7px 12px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnSec: { fontSize: 12, padding: '7px 12px', background: '#fff', color: '#185FA5', border: '1px solid #cdddEE', borderRadius: 8, cursor: 'pointer' },
};
