import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

// Meu Setor — o responsável vê (só leitura) o que a direção espera dele + as cobranças
// que a direção direcionou a ele. O cadastro (dono/meta/expectativas) fica na Direção.
const dBR = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');

const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MeuSetor() {
  const { API } = useAuth();
  const [d, setD] = useState(null);
  const [ind, setInd] = useState(null);
  useEffect(() => { API.get('/painel/meu-setor').then(r => setD(r.data)).catch(() => setD({ setores: [], cobrancas: [] })); }, [API]);
  useEffect(() => { API.get('/colab-indicadores/meus').then(r => setInd(r.data)).catch(() => setInd({ indicadores: [] })); }, [API]);

  const abertas = (d?.cobrancas || []).filter(c => c.status !== 'concluido');
  const feitas = (d?.cobrancas || []).filter(c => c.status === 'concluido');

  return (
    <div style={s.wrap}>
      <Banner emoji="🎯" titulo="Meu Setor" cor="azul" sub="O que a direção espera do seu setor e as cobranças direcionadas a você." />

      {!d && <div style={{ ...s.card, textAlign: 'center', color: '#999' }}>Carregando…</div>}

      {d && !d.temSetor && !ind?.temIndicadores && (
        <div style={{ ...s.card, textAlign: 'center', color: '#777' }}>
          <div style={{ fontSize: 34 }}>🧭</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Você ainda não tem setor nem indicadores</div>
          <div style={{ fontSize: 13 }}>Quando a direção definir você como dono de um setor ou atribuir indicadores, eles aparecem aqui.</div>
        </div>
      )}

      {ind?.temIndicadores && (
        <div style={{ ...s.card, borderLeft: '4px solid #7a3d9c' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>🎯 Meus indicadores do mês</div>
            {(ind.premio.reais > 0 || ind.premio.pontos > 0) && (
              <span style={{ fontSize: 12, color: '#1E824C', fontWeight: 700, marginLeft: 'auto' }}>
                💰 a receber: {ind.premio.reais > 0 ? brl(ind.premio.reais) : ''}{ind.premio.reais > 0 && ind.premio.pontos > 0 ? ' + ' : ''}{ind.premio.pontos > 0 ? `${ind.premio.pontos} pts` : ''}
              </span>
            )}
          </div>
          {ind.indicadores.map(x => {
            const uni = x.unidade === 'reais' ? 'R$' : x.unidade === 'percentual' ? '%' : x.unidade === 'dias' ? 'dias' : x.unidade === 'horas' ? 'h' : '';
            const premio = x.premio_tipo === 'pontos' ? `${x.premio_valor} pts` : brl(x.premio_valor);
            return (
              <div key={x.id} style={{ padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{x.nome}</span>
                  {x.batido === true && <span style={{ fontSize: 10, color: '#fff', background: '#1E824C', borderRadius: 5, padding: '1px 7px' }}>bateu ✓ +{premio}</span>}
                  {x.batido === false && <span style={{ fontSize: 10, color: '#fff', background: '#C0392B', borderRadius: 5, padding: '1px 7px' }}>não bateu</span>}
                  {x.batido === null && <span style={{ fontSize: 10, color: '#888', background: '#eee', borderRadius: 5, padding: '1px 7px' }}>aguardando apuração</span>}
                </div>
                <div style={{ fontSize: 11.5, color: '#777', marginTop: 2 }}>
                  Meta {x.sentido === 'menor' ? '≤' : '≥'} <b>{x.meta}{uni}</b>{x.realizado != null ? ` · realizado: ${x.realizado}${uni}` : ''} · prêmio {premio}{x.descricao ? ` · ${x.descricao}` : ''}
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 10.5, color: '#999', marginTop: 6 }}>Os indicadores e a apuração são definidos pela Direção/RH.</div>
        </div>
      )}

      {d?.setores?.map(st => (
        <div key={st.key} style={{ ...s.card, borderLeft: '4px solid #185FA5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{st.emoji} {st.nome}</div>
            <span style={{ fontSize: 12, color: '#666', marginLeft: 'auto' }}>Responsável: <b>{st.dono}</b></span>
          </div>
          {st.meta && (
            <div style={{ marginTop: 8, background: '#EAF3FB', borderRadius: 8, padding: '8px 11px' }}>
              <div style={{ fontSize: 11, color: '#185FA5', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .3 }}>Meta do setor</div>
              <div style={{ fontSize: 13.5 }}>{st.meta}</div>
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .3, marginBottom: 4 }}>
              📋 O que se espera de você{st.expectativas_padrao ? <span style={{ fontWeight: 400, textTransform: 'none', color: '#aaa' }}> · sugestão da direção</span> : ''}
            </div>
            {st.expectativas.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, fontSize: 13, padding: '3px 0', alignItems: 'flex-start' }}>
                <span style={{ color: '#185FA5' }}>•</span><span>{e}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {d?.temSetor && (
        <div style={{ ...s.card, borderLeft: '4px solid #BA7517' }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>📌 Cobranças direcionadas a você {abertas.length > 0 && <span style={{ fontSize: 12, color: '#fff', background: '#E24B4A', borderRadius: 10, padding: '1px 8px' }}>{abertas.length}</span>}</div>
          {abertas.length === 0 && feitas.length === 0 && <div style={{ fontSize: 13, color: '#999' }}>Nenhuma cobrança da direção no momento. 👏</div>}
          {abertas.map(c => {
            const atrasada = c.prazo && c.prazo.slice(0, 10) < new Date().toISOString().slice(0, 10);
            return (
              <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.titulo}{atrasada ? <span style={{ fontSize: 10, color: '#fff', background: '#E24B4A', borderRadius: 5, padding: '1px 6px', marginLeft: 6 }}>atrasada</span> : ''}</div>
                {c.descricao && <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{c.descricao}</div>}
                <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{c.prazo ? `prazo ${dBR(c.prazo)} · ` : ''}aberta em {dBR(c.criado_em)} — trate no painel de Tarefas</div>
              </div>
            );
          })}
          {feitas.length > 0 && <div style={{ fontSize: 11.5, color: '#3B6D11', marginTop: 8 }}>✓ {feitas.length} já concluída{feitas.length > 1 ? 's' : ''}</div>}
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 860, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 12 },
};
