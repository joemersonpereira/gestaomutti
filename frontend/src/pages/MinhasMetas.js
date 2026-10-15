import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { ModalAceite } from './Premiacao';

const MESES = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export default function MinhasMetas() {
  const { API, usuario } = useAuth();
  const [metas, setMetas] = useState([]);
  const [alvo, setAlvo] = useState(null);
  const [premio, setPremio] = useState(null);

  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const carregar = useCallback(() => {
    API.get('/metas/minhas').then(r => setMetas(r.data.metas || []));
    API.get('/vendas/meu-premio').then(r => setPremio(r.data)).catch(() => setPremio(null))
      .finally(() => setAtualizadoEm(new Date()));
  }, [API]);
  // Atualiza sozinho: ao abrir, a cada 2 min (alinhado ao cache do ERP) e ao voltar para a aba.
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 120000);
    const onVis = () => { if (document.visibilityState === 'visible') carregar(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [carregar]);

  return (
    <div style={s.wrap}>
      <Banner emoji="🎯" titulo="Minhas Metas" cor="verde" sub="Suas metas de premiação — você só acompanha depois de aceitar" />

      <MinhaPosicao API={API} />

      {premio && premio.tem && <PremioPrevisto p={premio} atualizadoEm={atualizadoEm} />}

      {metas.length === 0 && <div style={s.card}><div style={{ fontSize: 12, color: '#999' }}>Você ainda não tem metas lançadas.</div></div>}

      {metas.map(m => {
        const aceita = m.status_aceite === 'aceito';
        return (
          <div key={m.id} style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{m.campanha_nome || 'Meta individual'}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{MESES[m.mes]} de {m.ano} · {m.loja_nome}</div>
              </div>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: aceita ? '#EAF3DE' : '#E6F1FB', color: aceita ? '#3B6D11' : '#185FA5' }}>{aceita ? 'aceita ✓' : 'aguarda seu aceite'}</span>
            </div>
            {!aceita ? (
              <button style={s.btn} onClick={() => setAlvo(m)}>Aceitar minha meta</button>
            ) : m.progresso ? (
              <Progresso p={m.progresso} />
            ) : (
              <div style={{ fontSize: 12, color: '#3B6D11', marginTop: 8 }}>✓ Aceite registrado — acompanhamento liberado.</div>
            )}
          </div>
        );
      })}

      <div style={s.info}>
        💡 Ao aceitar, você confirma a ciência de que se trata de uma <strong>campanha de premiação</strong> (não comissão)
        e o registro guarda IP, selfie e um <strong>termo em PDF</strong>. Você acompanha o atingimento em <strong>%</strong>.
      </div>

      {alvo && <ModalAceite API={API} usuario={usuario} meta={{ ...alvo, nome_campanha: alvo.campanha_nome }} onFechar={() => setAlvo(null)} onAceito={() => { setAlvo(null); carregar(); }} />}
    </div>
  );
}

// Minha posição no mês (mesclado aqui — antes era um menu à parte). Só a própria colocação.
function MinhaPosicao({ API }) {
  const hoje = new Date();
  const [d, setD] = useState(null);
  useEffect(() => { API.get('/certificados/minha-posicao', { params: { mes: hoje.getMonth() + 1, ano: hoje.getFullYear() } }).then(r => setD(r.data)).catch(() => setD(false)); }, [API]);
  if (!d || !d.posicao) return null;
  const pos = d.posicao;
  const cor = pos === 1 ? '#8a6d00' : pos <= 3 ? '#185FA5' : '#3B6D11';
  const frase = pos === 1 ? 'Você lidera o mês! 🥇' : pos <= 3 ? 'Você está no pódio do mês 🏅' : `Faltam ${pos - 3} para o pódio. Bora subir! 🚀`;
  return (
    <div style={{ ...s.card, borderLeft: `4px solid ${cor}`, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ fontSize: 34, fontWeight: 800, color: cor, minWidth: 52, textAlign: 'center' }}>{pos}º</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Sua posição no mês</div>
        <div style={{ fontSize: 12, color: '#555' }}>{frase}</div>
        <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>Entre {d.total} no mês · você vê apenas a sua posição.</div>
      </div>
    </div>
  );
}

// Prévia da premiação do colaborador: valor previsto (vendas 3/4/5% + vitaminas + unidades vendidas) + indicadores.
function PremioPrevisto({ p, atualizadoEm }) {
  const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cor = n => (n == null ? '#999' : n >= 95 ? '#3B6D11' : n >= 80 ? '#BA7517' : '#993C1D');
  const item = (label, val, sub) => (
    <div style={{ flex: 1, minWidth: 130, background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: '#666' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#3B6D11' }}>{brl(val)}</div>
      {sub && <div style={{ fontSize: 10, color: '#999' }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ ...s.card, borderLeft: '4px solid #3B6D11' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>💵 Premiação prevista no mês</div>
          <div style={{ fontSize: 11, color: '#999' }}>🔄 Atualiza sozinho conforme você vende{atualizadoEm ? ` · ${atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#3B6D11' }}>{brl(p.total_previsto)}</div>
          <div style={{ fontSize: 10, color: '#999' }}>total previsto</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {item('Premiação de vendas', p.premiacao_valor, `${p.premiacao_pct}% · meta ${p.pct_meta}% · super ${p.pct_super}%`)}
        {item('Vitaminas', p.vitaminas_valor, `${p.vitaminas_un} un`)}
        {item('Unidades vendidas', p.uv_valor, null)}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Seus indicadores <span style={{ fontWeight: 400, color: '#999' }}>(nota ≥ 95 libera 5% na super meta)</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 6 }}>
        {p.indicadores.map(i => (
          <div key={i.indicador} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '7px 9px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, color: '#444' }}>{i.label}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: cor(i.nota) }}>{i.nota == null ? '—' : i.nota}</span>
            </div>
            <div style={{ fontSize: 9, color: '#aaa' }}>{i.meta != null ? `feito ${Number(i.realizado).toLocaleString('pt-BR')} / meta ${Number(i.meta).toLocaleString('pt-BR')}` : 'sem meta definida'}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>A premiação de vendas ({p.premiacao_pct}%) incide sobre o líquido do plano <strong>Premiação</strong>.{p.nota_indicadores < 95 ? ` Seus indicadores estão em ${p.nota_indicadores}/100 — chegue a 95 para liberar 5% na super meta.` : ''}</div>
    </div>
  );
}

// Acompanhamento do colaborador: só % e quanto vender hoje. NUNCA o valor vendido acumulado.
function Progresso({ p }) {
  const cor = pct => (pct >= 100 ? '#3B6D11' : pct >= 90 ? '#BA7517' : '#993C1D');
  const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR');
  const Barra = ({ pct }) => (
    <div style={{ height: 8, background: '#eee', borderRadius: 5, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: cor(pct) }} />
    </div>
  );
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 11, color: '#666' }}>Meta</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: cor(p.pct_meta) }}>{p.pct_meta}%</span>
          </div>
          <Barra pct={p.pct_meta} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 11, color: '#666' }}>Super meta</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: cor(p.pct_super) }}>{p.pct_super}%</span>
          </div>
          <Barra pct={p.pct_super} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>Dia {p.dia_atual} de {p.dias_mes}</div>

      {!p.bateu_meta ? (
        <div style={{ background: '#FDF3F0', border: '1px solid #F3D9D0', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 12, color: '#993C1D' }}>Para bater a <strong>meta</strong>, você precisa vender hoje</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#993C1D' }}>{brl(p.precisa_hoje_meta)}</div>
        </div>
      ) : !p.bateu_super ? (
        <div style={{ background: '#FBF6E9', border: '1px solid #EBDCB6', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 12, color: '#3B6D11' }}>🎉 Meta batida! Para chegar na <strong>super meta</strong>, venda hoje</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#BA7517' }}>{brl(p.precisa_hoje_super)}</div>
        </div>
      ) : (
        <div style={{ background: '#EAF3DE', border: '1px solid #CFE3B8', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#3B6D11' }}>
          🏆 Super meta batida! Excelente trabalho.
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 820, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', marginTop: 10 },
  info: { background: '#E6F1FB', borderLeft: '3px solid #185FA5', borderRadius: '0 8px 8px 0', padding: '10px 12px', fontSize: 12, color: '#185FA5', lineHeight: 1.6 },
};
