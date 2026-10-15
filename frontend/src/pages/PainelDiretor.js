import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

function timer(h) {
  if (h == null) return { txt: 'sem prazo', cor: '#999' };
  if (h < 0) return { txt: `vencido há ${Math.abs(h)}h`, cor: '#993C1D' };
  if (h <= 24) return { txt: `${h}h restantes`, cor: '#BA7517' };
  return { txt: `${h}h restantes`, cor: '#3B6D11' };
}

export default function PainelDiretor() {
  const { API } = useAuth();
  const [d, setD] = useState(null);
  const [meta, setMeta] = useState(null);
  const [coment, setComent] = useState('');

  const carregar = useCallback(() => { API.get('/aprovacoes').then(r => setD(r.data)).catch(() => setD(false)); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  if (d === null) return <div style={s.load}>Carregando fila…</div>;
  if (d === false) return <div style={s.card}>Sem acesso à fila de aprovações.</div>;

  async function decidirMeta(id, decisao) {
    await API.post(`/metas/${id}/aprovar`, { decisao, comentario: coment });
    setMeta(null); setComent(''); carregar();
  }
  async function decidirCert(id, aprovado) {
    await API.post(`/aprovacoes/certificado/${id}`, { aprovado }); carregar();
  }

  return (
    <div style={s.wrap}>
      <Banner emoji="🎯" titulo="Painel do Diretor" cor="azul" sub="Fila de aprovações" />

      <div style={s.metrics}>
        <M v={d.resumo.metas_pendentes} l="Metas" c="#185FA5" />
        <M v={d.resumo.certificados_pendentes} l="Certificados" c="#856404" />
        <M v={d.resumo.vencendo_24h} l="Vencem 24h" c="#BA7517" />
        <M v={d.resumo.vencidos} l="Vencidos" c="#993C1D" />
      </div>

      {d.fila.length === 0 && <div style={s.card}>✅ Nada pendente. Tudo em dia!</div>}

      {d.fila.map(item => {
        const t = timer(item.horas_restantes);
        const aberto = meta === item.ref_id;
        return (
          <div key={item.tipo + item.ref_id} style={s.itemCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{item.titulo}</div>
                <div style={{ fontSize: 11, color: '#666' }}>{item.detalhe}</div>
              </div>
              <span style={{ ...s.timer, color: t.cor, borderColor: t.cor }}>⏱ {t.txt}</span>
            </div>

            {item.tipo === 'meta' && (
              <div style={{ marginTop: 8 }}>
                {!aberto ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={s.btnOk} onClick={() => decidirMeta(item.ref_id, 'aprovado')}>✓ Aprovar</button>
                    <button style={s.btnBad} onClick={() => setMeta(item.ref_id)}>✎ Solicitar correção</button>
                  </div>
                ) : (
                  <div>
                    <textarea style={s.input} placeholder="Comentário da correção…" value={coment} onChange={e => setComent(e.target.value)} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button style={s.btnBad} onClick={() => decidirMeta(item.ref_id, 'correcao')}>Enviar correção</button>
                      <button style={s.btnGhost} onClick={() => { setMeta(null); setComent(''); }}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {item.tipo === 'certificado' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button style={s.btnOk} onClick={() => decidirCert(item.ref_id, true)}>✓ Validar</button>
                <button style={s.btnBad} onClick={() => decidirCert(item.ref_id, false)}>✕ Recusar</button>
              </div>
            )}
          </div>
        );
      })}

    </div>
  );
}

const M = ({ v, l, c }) => <div style={s.metric}><div style={{ fontSize: 22, fontWeight: 700, color: c }}>{v}</div><div style={{ fontSize: 11, color: '#666' }}>{l}</div></div>;

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  load: { padding: 30, textAlign: 'center', color: '#666' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 },
  metric: { background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 10, textAlign: 'center' },
  itemCard: { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14, marginBottom: 8 },
  timer: { fontSize: 10, padding: '2px 8px', border: '1px solid', borderRadius: 6, whiteSpace: 'nowrap' },
  input: { width: '100%', padding: 8, fontSize: 12, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', minHeight: 50 },
  btnOk: { fontSize: 12, padding: '6px 12px', background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnBad: { fontSize: 12, padding: '6px 12px', background: '#993C1D', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnGhost: { fontSize: 12, padding: '6px 12px', background: 'none', color: '#666', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' },
};
