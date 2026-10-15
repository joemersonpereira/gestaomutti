import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';

const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const corPct = p => (p >= 100 ? '#3B6D11' : p >= 90 ? '#BA7517' : '#993C1D');
const corNota = n => (n == null ? '#999' : n >= 95 ? '#3B6D11' : n >= 80 ? '#BA7517' : '#993C1D');

// Premiação da equipe (supervisão): premiação prevista de todos os vendedores + acumulado.
export default function PremiacaoEquipe() {
  const { API, usuario } = useAuth();
  const ehGestao = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const hoje = new Date();
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState(ehGestao ? '' : (usuario.loja_id || ''));
  const [funcao, setFuncao] = useState('');
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [d, setD] = useState(null);

  useEffect(() => { if (ehGestao) API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || [])); }, [API, ehGestao]);
  const carregar = useCallback(() => {
    API.get('/vendas/premiacao-equipe', { params: { loja_id: lojaId || undefined, funcao: funcao || undefined, mes } })
      .then(r => setD(r.data)).catch(() => setD({ linhas: [] }));
  }, [API, lojaId, funcao, mes]);
  useEffect(() => { carregar(); const t = setInterval(carregar, 120000); return () => clearInterval(t); }, [carregar]);

  const rede = d && d.escopo === 'rede';
  const COLS = [
    { k: 'nome', label: 'Vendedor', get: l => l.nome || '', tipo: 'txt' },
    ...(rede ? [{ k: 'loja', label: 'Loja', get: l => l.loja || '', tipo: 'txt' }] : []),
    { k: 'pct_meta', label: '% meta', get: l => l.pct_meta || 0, tipo: 'num', right: true },
    { k: 'pct_super', label: '% super', get: l => l.pct_super || 0, tipo: 'num', right: true },
    { k: 'nota_indicadores', label: 'Indic.', get: l => l.nota_indicadores || 0, tipo: 'num', right: true },
    { k: 'premiacao_valor', label: 'Vendas', get: l => l.premiacao_valor || 0, tipo: 'num', right: true },
    { k: 'vitaminas_valor', label: 'Vitaminas', get: l => l.vitaminas_valor || 0, tipo: 'num', right: true },
    { k: 'uv_valor', label: 'Un. vend.', get: l => l.uv_valor || 0, tipo: 'num', right: true },
    { k: 'total', label: 'Total', get: l => l.total || 0, tipo: 'num', right: true },
  ];
  const { linhas, ordem, clicar, seta } = useOrdenavel(d && d.linhas, COLS, { col: 'total', dir: 'desc' });
  return (
    <div style={s.wrap}>
      <Banner emoji="💵" titulo="Premiação da equipe" cor="verde" sub="Prévia ao vivo da premiação dos vendedores — atualiza sozinho." />

      <div style={s.card}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {ehGestao && (
            <select style={s.campo} value={lojaId} onChange={e => setLojaId(e.target.value)}>
              <option value="">Todas as lojas</option>
              {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          )}
          <select style={s.campo} value={funcao} onChange={e => setFuncao(e.target.value)}>
            <option value="">Todas as funções</option>
            {(d?.funcoes || ['Vendedor']).map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select style={s.campo} value={mes} onChange={e => setMes(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}
          </select>
        </div>
      </div>

      {d && (
        <div style={{ ...s.card, borderLeft: '4px solid #3B6D11' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Premiação acumulada {rede ? '(rede)' : '(loja)'}</div>
              <div style={{ fontSize: 11, color: '#999' }}>{(d.linhas || []).length} vendedor(es) · {String(d.mes).padStart(2, '0')}/{d.ano}</div>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#3B6D11' }}>{brl(d.total_acumulado)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <Bloco label="Premiação de vendas" val={d.premiacao_total} />
            <Bloco label="Vitaminas" val={d.vitaminas_total} />
            <Bloco label="Unidades vendidas" val={d.uv_total} />
          </div>
        </div>
      )}

      <div style={s.card}>
        {!d && <div style={{ fontSize: 12, color: '#999' }}>Carregando…</div>}
        {d && (d.linhas || []).length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhum vendedor no filtro.</div>}
        {d && (d.linhas || []).length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#666' }}>
                  {COLS.map(c => <ThOrd key={c.k} c={c} ordem={ordem} clicar={clicar} seta={seta} base={s.th} />)}
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.colaborador_id + l.loja_id} style={{ borderTop: '1px solid #f5f5f5' }}>
                    <td style={s.td}>{l.nome}</td>{rede && <td style={{ ...s.td, color: '#888', fontWeight: 400 }}>{l.loja}</td>}
                    <td style={{ ...s.tdR, color: corPct(l.pct_meta), fontWeight: 700 }}>{l.pct_meta}%</td>
                    <td style={{ ...s.tdR, color: corPct(l.pct_super) }}>{l.pct_super}%</td>
                    <td style={{ ...s.tdR, color: corNota(l.nota_indicadores) }}>{l.nota_indicadores}</td>
                    <td style={s.tdR}>{brl(l.premiacao_valor)}<div style={{ fontSize: 9, color: '#aaa' }}>{l.premiacao_pct}%</div></td>
                    <td style={s.tdR}>{brl(l.vitaminas_valor)}</td>
                    <td style={s.tdR}>{brl(l.uv_valor)}</td>
                    <td style={{ ...s.tdR, fontWeight: 800, color: '#3B6D11' }}>{brl(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const Bloco = ({ label, val }) => (
  <div style={{ flex: 1, minWidth: 130, background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '8px 12px' }}>
    <div style={{ fontSize: 11, color: '#666' }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 800, color: '#3B6D11' }}>{brl(val)}</div>
  </div>
);
const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  campo: { fontSize: 13, padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, width: 'auto' },
  th: { padding: '6px 8px' }, thR: { padding: '6px 8px', textAlign: 'right' },
  td: { padding: '7px 8px', fontWeight: 600 }, tdR: { padding: '7px 8px', textAlign: 'right' },
};
