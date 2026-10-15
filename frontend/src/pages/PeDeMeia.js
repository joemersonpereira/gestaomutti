import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TIPO = { deposito_pontos: ['🎯', 'Pontos convertidos'], deposito_vale: ['🎟️', 'Vale-compras'], saque: ['🏦', 'Saque anual'], ajuste: ['⚙️', 'Ajuste'] };

export default function PeDeMeia() {
  const { API } = useAuth();
  const [d, setD] = useState(null);
  const [pontos, setPontos] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/pedemeia').then(r => setD(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!d) return <div style={s.wrap}>Carregando…</div>;

  const converter = () => {
    const p = Math.floor(Number(pontos) || 0);
    API.post('/pedemeia/converter-pontos', { pontos: p }).then(r => { setMsg(`✅ ${r.data.pontos} pontos viraram ${brl(r.data.reais)}.`); setPontos(''); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  };
  const moverVale = () => API.post('/pedemeia/mover-vale').then(r => { setMsg(`✅ ${brl(r.data.movido)} de vale-compras movido para o Pé de Meia.`); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  const sacar = () => { if (!window.confirm('Confirmar o saque anual do Pé de Meia? Só pode ser feito 1 vez no ano.')) return; API.post('/pedemeia/sacar').then(r => { setMsg(`✅ Saque de ${brl(r.data.sacado)} registrado! O RH/financeiro fará o pagamento.`); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro'))); };

  const previaReais = Math.floor((Number(pontos) || 0) / d.pontosPorReal);
  return (
    <div style={s.wrap}>
      <Banner emoji="🐷" titulo="Pé de Meia" cor="verde" />
      <div style={s.sub}>Sua poupança: junte pontos e vale-compras o ano todo e saque no fim do ano. Cada <b>{d.pontosPorReal} pontos = R$ 1,00</b>.</div>

      <div style={s.saldoBox}>
        <div style={{ fontSize: 12, opacity: .9 }}>Saldo do Pé de Meia</div>
        <div style={{ fontSize: 40, fontWeight: 800 }}>{brl(d.saldo)}</div>
        <div style={{ fontSize: 12, opacity: .9 }}>Você tem <b>{d.saldoPontos}</b> pontos disponíveis{d.valeAberto > 0 ? ` e ${brl(d.valeAberto)} em vale-compras` : ''}.</div>
      </div>

      {msg && <div style={{ ...s.card, background: msg[0] === '✅' ? '#EAF3EC' : '#FBEAE7', color: msg[0] === '✅' ? '#2E6B45' : '#C0392B', fontSize: 13 }}>{msg}</div>}

      <div style={s.card}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>🎯 Converter pontos em dinheiro</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="number" value={pontos} onChange={e => setPontos(e.target.value)} placeholder="quantos pontos" style={{ ...s.inp, width: 150 }} />
          <span style={{ fontSize: 13, color: '#666' }}>= <b>{brl(previaReais)}</b></span>
          <button onClick={converter} disabled={previaReais <= 0} style={s.btn}>Converter</button>
          <button onClick={() => setPontos(String(d.saldoPontos - (d.saldoPontos % d.pontosPorReal)))} style={s.btnMini}>usar tudo</button>
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>Convertido em múltiplos de {d.pontosPorReal}. Os pontos saem do seu saldo da gamificação.</div>
      </div>

      {d.valeAberto > 0 && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div><b>🎟️ Mover vale-compras para o Pé de Meia</b><div style={{ fontSize: 12, color: '#666' }}>Você tem {brl(d.valeAberto)} em vale-compras em aberto.</div></div>
            <button onClick={moverVale} style={s.btn}>Mover {brl(d.valeAberto)}</button>
          </div>
        </div>
      )}

      <div style={{ ...s.card, background: d.podeSacar ? '#EAF3EC' : '#FAFAFA', borderColor: d.podeSacar ? '#CFE6D6' : '#eee' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <b>🏦 Saque anual</b>
            <div style={{ fontSize: 12, color: '#666' }}>{d.podeSacar ? `Você pode sacar ${brl(d.saldo)} agora.` : (d.motivoBloqueio || 'Saque libera no fim do ano.')}</div>
          </div>
          <button onClick={sacar} disabled={!d.podeSacar} style={{ ...s.btn, background: d.podeSacar ? '#1E874B' : '#bbb' }}>Sacar</button>
        </div>
      </div>

      {d.movimentos.length > 0 && (
        <div style={s.card}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Extrato</div>
          {d.movimentos.map((m, i) => {
            const [emoji, label] = TIPO[m.tipo] || ['•', m.tipo];
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderTop: i ? '1px solid #f2f2f2' : 'none' }}>
                <span>{emoji} {label}{m.pontos ? ` (${m.pontos} pts)` : ''} <span style={{ color: '#bbb' }}>· {new Date(m.criado_em + 'Z').toLocaleDateString('pt-BR')}</span></span>
                <span style={{ fontWeight: 700, color: m.valor >= 0 ? '#1E874B' : '#C0392B' }}>{m.valor >= 0 ? '+' : ''}{brl(m.valor)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 720, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 22, fontWeight: 800 }, sub: { fontSize: 12.5, color: '#666', marginBottom: 14 },
  saldoBox: { background: 'linear-gradient(135deg,#1E874B,#2E5C9E)', color: '#fff', borderRadius: 16, padding: '18px 20px', marginBottom: 12 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 10 },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 14 },
  btn: { fontSize: 13, padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 12, padding: '6px 10px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
};
