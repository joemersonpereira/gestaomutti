import React, { useState, useEffect, useCallback } from 'react';
import Banner from '../components/Banner';
import TesourariaCaixa from './TesourariaCaixa';
import Tesouraria from './Tesouraria';
import { CartaoDespesas } from './Contabilidade';
import { useAuth } from '../context/AuthContext';

// Hub da Tesouraria (Joe 2026-11-11) — um menu só, controle da GESTÃO (Financeiro).
// Conjunto ÚNICO de abas: o Fechamento do dia fica JUNTO com as apurações (Joe: "o fechamento do dia
// tinha que estar junto com essas apurações de fechamento"). Sem tarefa/cobrança pro operador.
// As apurações reusam a página antiga Tesouraria.js com tabFixa (sem barra de abas própria).

const NATIVAS = ['fechamento', 'orcamento', 'criterios'];
const ABAS = [
  ['fechamento', '📎 Fechamento do dia'],
  ['ranking', '🏆 Caixa Destaque'],
  ['quebras', '💸 Diferenças'],
  ['conferencia', '✅ Conferência'],
  ['cancelamentos', '🚫 Cancelamentos'],
  ['atendimento', '🧾 Atendimento do caixa'],
  ['indicadores', '📈 Setor'],
  ['debitos', '💵 Débitos por caixa'],
  ['criterios', '🏅 Critérios (pontos)'],
  ['orcamento', '💰 Orçamento loja'],
];

// Gestão/Financeiro vê tudo; o GERENTE (e subgerente) vê SÓ o Fechamento do dia — anexa as fotos e
// apenas VISUALIZA quem teve diferença; a apuração e o orçamento são da gestão (Joe 2026-11-11).
const GESTAO_TES = ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Financeiro', 'Tesouraria', 'Supervisor'];

export default function TesourariaHub() {
  const { API, usuario } = useAuth();
  const ehGestao = GESTAO_TES.includes(usuario?.funcao);
  const abas = ehGestao ? ABAS : ABAS.filter(([k]) => k === 'fechamento');
  const [aba, setAba] = useState('fechamento');
  return (
    <div style={s.wrap}>
      <Banner emoji="🏦" titulo="Tesouraria" cor="roxo" sub={ehGestao ? 'Controle de caixa da gestão — fechamento do dia por loja junto com as apurações e o orçamento. Sem tarefa pro operador.' : 'Fechamento do dia — anexe os depósitos, despesas e recargas da sua loja e acompanhe os caixas e diferenças do dia.'} />
      {abas.length > 1 && <div style={s.tabs}>
        {abas.map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)} style={{ ...s.tab, ...(aba === k ? s.tabOn : {}) }}>{l}</button>
        ))}
      </div>}
      <div style={{ marginTop: 14 }}>
        {aba === 'fechamento' && <TesourariaCaixa embed />}
        {aba === 'orcamento' && (
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <CartaoDespesas API={API} />
          </div>
        )}
        {aba === 'criterios' && ehGestao && <CriteriosPontos API={API} />}
        {!NATIVAS.includes(aba) && <Tesouraria embed soControle tabFixa={aba} />}
      </div>
    </div>
  );
}

// Critérios de PONTOS do Caixa Destaque (Joe 2026-11-11) — substitui a escala de nota + premiação R$250.
// Mostra claramente o que é AUTOMÁTICO (sai do ERP/ponto) e o que é AVULSO (lançado pela gestão).
// Valores configuráveis. Apuração TRIMESTRAL: o destaque de pontos do trimestre ganha (>= mínimo).
function CriteriosPontos({ API }) {
  const [regras, setRegras] = useState([]);
  const [minimo, setMinimo] = useState(30);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => {
    API.get('/tesouraria/pontos/regras').then(r => { setRegras(r.data.regras || []); if (r.data.minimo != null) setMinimo(r.data.minimo); }).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const setPt = (chave, v) => setRegras(rs => rs.map(r => r.chave === chave ? { ...r, pontos: v } : r));
  const setAtivo = (chave, v) => setRegras(rs => rs.map(r => r.chave === chave ? { ...r, ativo: v ? 1 : 0 } : r));
  const salvar = () => API.put('/tesouraria/pontos/regras', { regras: regras.map(r => ({ chave: r.chave, pontos: Number(r.pontos) || 0, desclassifica: r.desclassifica, ativo: r.ativo !== 0 })), minimo: Number(minimo) || 0 })
    .then(() => { setMsg('✅ Critérios salvos.'); setTimeout(() => setMsg(''), 2500); carregar(); }).catch(() => { setMsg('⚠️ Erro ao salvar.'); setTimeout(() => setMsg(''), 3000); });
  const AUTO = { bg: '#eaf4ff', cor: '#1d4ed8', txt: '⚙️ Automático' };
  const MAN = { bg: '#fdf0e6', cor: '#b45309', txt: '✍️ Avulso' };
  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>🏅 Critérios de pontos — Caixa Destaque</div>
        <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 6px' }}>
          Cada critério vale X pontos (você ajusta). <b style={{ color: '#1d4ed8' }}>⚙️ Automático</b> = o sistema calcula (ERP/ponto do Tangerino). <b style={{ color: '#b45309' }}>✍️ Avulso</b> = lançado pela gestão. A apuração é <b>trimestral</b>: o destaque de pontos do trimestre ganha.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 12px', fontSize: 13 }}>
          <span style={{ fontWeight: 700 }}>Ganha só com no mínimo</span>
          <input type="number" value={minimo} onChange={e => setMinimo(e.target.value)} style={{ width: 70, border: '1px solid #cbd5e1', borderRadius: 7, padding: '6px 8px', fontSize: 13 }} />
          <span style={{ color: '#64748b' }}>pontos no trimestre.</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '2px solid #eef1f4' }}>
              {['Critério', 'Como é apurado', 'Pontos', 'Ativo'].map(h => <th key={h} style={{ padding: '7px 8px' }}>{h}</th>)}
            </tr></thead>
            <tbody>{regras.map(r => { const b = r.tipo === 'auto' ? AUTO : MAN; return (
              <tr key={r.chave} style={{ borderTop: '1px solid #f2f2f2', opacity: r.ativo === 0 ? 0.5 : 1 }}>
                <td style={{ padding: '7px 8px', fontWeight: 600 }}>{r.label}</td>
                <td style={{ padding: '7px 8px' }}><span style={{ background: b.bg, color: b.cor, fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>{b.txt}</span></td>
                <td style={{ padding: '7px 8px' }}>
                  {r.desclassifica
                    ? <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: 12 }}>DESCLASSIFICA</span>
                    : <input type="number" value={r.pontos} onChange={e => setPt(r.chave, e.target.value)} style={{ width: 64, border: '1px solid #cbd5e1', borderRadius: 7, padding: '5px 7px', fontSize: 13, color: Number(r.pontos) < 0 ? '#b91c1c' : '#15803d', fontWeight: 700 }} />}
                </td>
                <td style={{ padding: '7px 8px' }}><input type="checkbox" checked={r.ativo !== 0} onChange={e => setAtivo(r.chave, e.target.checked)} /></td>
              </tr>
            ); })}</tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button onClick={salvar} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0d6b5e', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>💾 Salvar critérios</button>
          {msg && <span style={{ fontSize: 13, fontWeight: 600, color: msg.startsWith('⚠️') ? '#b91c1c' : '#15803d' }}>{msg}</span>}
        </div>
        <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 10 }}>Em breve: ranking por pontos do trimestre (com o critério que gerou cada ponto), lançamento avulso de pontos e de diferenças, e a apuração do destaque.</p>
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '18px 20px', maxWidth: 1180, margin: '0 auto' },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  tab: { padding: '8px 14px', borderRadius: 9, border: '1px solid #e3e8ea', background: '#f3f7f6', color: '#334', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  tabOn: { background: 'linear-gradient(95deg,#0E7C5A,#0b6e59)', color: '#fff', borderColor: 'transparent' },
};
