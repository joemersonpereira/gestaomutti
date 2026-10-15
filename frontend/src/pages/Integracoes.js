import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const dt = s => (s ? new Date(s).toLocaleString('pt-BR') : '');

export default function Integracoes() {
  const { API } = useAuth();
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [carreg, setCarreg] = useState(false);
  const carregar = useCallback(() => {
    setCarreg(true); setErro('');
    API.get('/integracoes/status').then(r => setD(r.data)).catch(e => setErro(e.response?.status === 403 ? 'Sem permissão para ver as integrações.' : 'Não foi possível verificar agora (o ERP pode estar lento). Tente de novo.')).finally(() => setCarreg(false));
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  const list = d?.integracoes || [];
  const rodando = list.filter(i => i.ok).length;

  return (
    <div style={s.wrap}>
      <Banner emoji="🔌" titulo="Status de Integrações" cor="ciano" sub="Saiba se cada integração está rodando ou travada.">
        <button onClick={carregar} style={{ fontSize: 12, padding: '6px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,.55)', background: 'rgba(255,255,255,.15)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>{carreg ? 'verificando…' : '↻ Verificar agora'}</button>
      </Banner>

      {erro && <div style={{ ...s.card, background: '#FCEBEB', borderColor: '#F09999', color: '#8f2a2a' }}>⚠️ {erro}</div>}
      {d && <div style={{ fontSize: 12, color: '#666', margin: '2px 2px 10px' }}>{rodando}/{list.length} rodando · verificado {dt(d.verificadoEm)}</div>}
      {!d && !erro && <div style={s.card}>Verificando integrações…</div>}

      {list.map(i => (
        <div key={i.chave} style={{ ...s.card, borderLeft: `4px solid ${i.ok ? '#1E874B' : i.configurado ? '#C0392B' : '#B7791F'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: i.ok ? '#1E874B' : i.configurado ? '#C0392B' : '#C9CDD2', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{i.nome}</div>
              <div style={{ fontSize: 12, color: '#777' }}>{i.detalhe}</div>
            </div>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: i.ok ? '#EAF3E9' : i.configurado ? '#FCEBEB' : '#F6F0E0', color: i.ok ? '#0E5C33' : i.configurado ? '#8f2a2a' : '#7a5307' }}>
            {i.ok ? '● Rodando' : i.configurado ? '● Com erro' : '○ Não configurada'}
          </span>
        </div>
      ))}

      <div style={s.info}>💡 <b>Rodando</b> = conectada e respondendo. <b>Com erro</b> = configurada mas falhando (ex.: ERP fora do ar) — chame o suporte/TI. <b>Não configurada</b> = falta credencial no servidor (.env). O ERP é testado de verdade a cada verificação; as demais mostram se estão ligadas.</div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 820, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 10 },
  info: { background: '#E6F1FB', borderLeft: '3px solid #185FA5', borderRadius: '0 8px 8px 0', padding: '10px 12px', fontSize: 12, color: '#185FA5', lineHeight: 1.6, marginTop: 4 },
};
