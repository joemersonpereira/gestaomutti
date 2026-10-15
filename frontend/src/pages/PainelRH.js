import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const TIPO_L = { voluntario: 'Voluntário', involuntario: 'Involuntário', fim_contrato: 'Fim de contrato', outro: 'Outro' };
const MOTIVO_L = { melhor_oportunidade: 'Melhor oportunidade', salario: 'Salário/benefícios', lideranca: 'Liderança', ambiente: 'Ambiente/clima', crescimento: 'Falta de crescimento', pessoal_familia: 'Pessoal/família', mudanca: 'Mudança', insatisfacao: 'Insatisfação', saude: 'Saúde', outro: 'Outro' };
const prim = n => String(n || '').split(' ').slice(0, 2).join(' ');
const dm = iso => { if (!iso) return ''; const p = String(iso).slice(0, 10).split('-'); return `${p[2]}/${p[1]}`; };

export default function PainelRH() {
  const { API } = useAuth();
  const [d, setD] = useState(null);
  const [ponto, setPonto] = useState(null); // resumo de ponto do mês
  useEffect(() => { API.get('/painel-rh').then(r => setD(r.data)).catch(() => setD(false)); }, [API]);
  useEffect(() => {
    const h = new Date(); const ini = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
    API.get('/ponto/resumo', { params: { ini, fim: h.toISOString().slice(0, 10) } }).then(r => setPonto(r.data)).catch(() => setPonto({ ok: false }));
  }, [API]);
  if (d === null) return <div style={s.wrap}><div style={s.card}>Carregando…</div></div>;
  if (d === false) return <div style={s.wrap}><div style={s.card}>Não foi possível carregar.</div></div>;
  const { headcount: hc, pendencias: p, celebracoes: c, desligamentos: dl } = d;
  const enpsCor = dl.enps == null ? '#999' : dl.enps >= 50 ? '#3B6D11' : dl.enps >= 0 ? '#BA7517' : '#993C1D';

  return (
    <div style={s.wrap}>
      <Banner emoji="🧭" titulo="Painel de Gente & Gestão" cor="azul" sub="Visão consolidada da equipe: quadro, movimento, pendências e desligamentos." />

      {/* KPIs */}
      <div style={s.kpis}>
        <Kpi t="Colaboradores ativos" v={hc.ativos} cor="#185FA5" bg="#EAF3FB" />
        <Kpi t="Desligamentos no ano" v={dl.ano} sub={`${dl.mes} no mês`} cor="#993C1D" bg="#FCEBE6" />
        <Kpi t="eNPS de saída" v={dl.enps == null ? '—' : dl.enps} sub="recomendaria a empresa" cor={enpsCor} bg="#F6F2FB" />
        <Kpi t="Pendências de cadastro" v={p.sem_cpf + p.sem_lgpd} sub={`${p.sem_cpf} s/ CPF · ${p.sem_lgpd} s/ LGPD`} cor="#8A6D1D" bg="#FBF3DA" />
      </div>

      <div style={s.grid}>
        {/* Movimento */}
        <Card t="🔄 Movimento da equipe">
          <Linha titulo="🌟 Novos (últimos 30 dias)" itens={c.novos} render={x => `${prim(x.nome)} · ${x.loja || ''} · admissão ${dm(x.admissao)}`} vazio="ninguém novo" />
          <Linha titulo="👋 Começam nos próximos 7 dias" itens={c.inicio_proximos} render={x => `${prim(x.nome)} · ${x.loja || ''} · ${dm(x.inicio_loja)}`} vazio="ninguém agendado" />
          <Linha titulo="😎 De folga hoje" itens={c.folgas_hoje} render={x => `${prim(x.nome)}${x.loja ? ' · ' + x.loja : ''}`} vazio="ninguém de folga" />
          <Linha titulo="🌴 De férias" itens={c.ferias_hoje} render={x => `${prim(x.nome)}${x.data_fim ? ' · volta ' + dm(x.data_fim) : ''}`} vazio="ninguém de férias" />
        </Card>

        {/* Ponto do mês */}
        <Card t="🕐 Ponto do mês">
          {!ponto && <div style={{ fontSize: 12, color: '#aaa' }}>Carregando…</div>}
          {ponto && !ponto.ok && <div style={{ fontSize: 12, color: '#aaa' }}>{ponto.aviso || 'Integração de ponto não configurada.'}</div>}
          {ponto && ponto.ok && (() => {
            const cols = ponto.colaboradores || [];
            const faltas = cols.reduce((a, x) => a + x.faltas, 0), pend = cols.reduce((a, x) => a + x.pendencias, 0);
            const top = [...cols].filter(x => x.faltas || x.pendencias).sort((a, b) => (b.faltas + b.pendencias) - (a.faltas + a.pendencias)).slice(0, 6);
            return (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <MiniStat n={faltas} l="faltas a confirmar" cor="#C0392B" bg="#FBEAEA" />
                  <MiniStat n={pend} l="pontos incompletos" cor="#B7791F" bg="#FCF7EA" />
                </div>
                {top.length === 0 && <div style={{ fontSize: 12, color: '#3B6D11' }}>Sem faltas/pendências. 👏</div>}
                {top.map(x => <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderTop: '1px solid #f2f2f2' }}>
                  <span>{prim(x.nome)} <span style={{ color: '#aaa' }}>{x.loja || ''}</span></span>
                  <span>{x.faltas ? <b style={{ color: '#C0392B' }}>{x.faltas} falta(s)</b> : ''}{x.faltas && x.pendencias ? ' · ' : ''}{x.pendencias ? <b style={{ color: '#B7791F' }}>{x.pendencias} inc.</b> : ''}</span>
                </div>)}
                <button onClick={() => window.dispatchEvent(new CustomEvent('mutti-nav', { detail: 'ponto' }))} style={{ marginTop: 8, fontSize: 12, padding: '6px 10px', background: '#fff', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' }}>Abrir Ponto →</button>
              </div>
            );
          })()}
        </Card>

        {/* Aniversariantes */}
        <Card t="🎂 Aniversariantes do mês">
          {(c.aniversariantes || []).length === 0 && <div style={s.vazio}>ninguém faz aniversário este mês</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(c.aniversariantes || []).map((a, i) => <span key={i} style={s.chipInfo}>🎉 dia {a.dia} · {prim(a.nome)}</span>)}
          </div>
        </Card>

        {/* Pendências */}
        <Card t="⚠️ Pendências de cadastro">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 8 }}>
            <PendBox n={p.sem_cpf} l="sem CPF" k="sem_cpf" />
            <PendBox n={p.sem_lgpd} l="sem consentimento LGPD" k="sem_lgpd" />
            <PendBox n={p.sem_foto} l="sem foto" k="sem_foto" />
            <PendBox n={p.sem_tamanhos} l="sem tamanhos de fardamento" k="sem_tamanhos" />
          </div>
          <div style={{ fontSize: 11, color: '#999' }}>👆 clique numa pendência para abrir a lista filtrada em Colaboradores.</div>
        </Card>

        {/* Desligamentos */}
        <Card t="🚪 Desligamentos (turnover)">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {Object.entries(dl.por_tipo || {}).map(([k, n]) => <span key={k} style={s.chipInfo}>{TIPO_L[k] || k}: <b>{n}</b></span>)}
            {dl.total === 0 && <span style={s.vazio}>nenhum desligamento registrado</span>}
          </div>
          {dl.motivo_top && <div style={{ fontSize: 12, color: '#555' }}>Motivo mais citado na saída: <strong>{MOTIVO_L[dl.motivo_top.motivo] || dl.motivo_top.motivo}</strong> ({dl.motivo_top.n})</div>}
          {dl.pendentes > 0 && <div style={{ fontSize: 12, color: '#8A6D1D', marginTop: 4 }}>⏳ {dl.pendentes} pesquisa(s) de saída ainda não respondida(s)</div>}
        </Card>

        {/* Headcount por loja */}
        <Card t="🏪 Quadro por loja">
          {hc.por_loja.map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ width: 130, fontSize: 12, color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.loja}</span>
              <div style={{ flex: 1, height: 8, background: '#eee', borderRadius: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: `${(l.n / hc.ativos) * 100}%`, background: '#185FA5' }} /></div>
              <span style={{ width: 26, fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{l.n}</span>
            </div>
          ))}
        </Card>

        {/* Headcount por função */}
        <Card t="👔 Quadro por função">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {hc.por_funcao.map((f, i) => <span key={i} style={s.chipInfo}>{f.funcao}: <b>{f.n}</b></span>)}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ t, v, sub, cor, bg }) {
  return <div style={{ background: bg, borderRadius: 12, padding: '14px 16px' }}>
    <div style={{ fontSize: 11, color: cor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .3 }}>{t}</div>
    <div style={{ fontSize: 28, fontWeight: 800, color: cor, marginTop: 2 }}>{v}</div>
    {sub && <div style={{ fontSize: 11, color: cor, opacity: .8 }}>{sub}</div>}
  </div>;
}
function Card({ t, children }) { return <div style={s.card}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t}</div>{children}</div>; }
function MiniStat({ n, l, cor, bg }) { return <div style={{ flex: 1, background: bg, borderRadius: 8, padding: '8px 10px' }}><div style={{ fontSize: 18, fontWeight: 800, color: cor, lineHeight: 1 }}>{n}</div><div style={{ fontSize: 10.5, color: cor }}>{l}</div></div>; }
function Linha({ titulo, itens, render, vazio }) {
  return <div style={{ marginBottom: 8 }}>
    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#666', marginBottom: 3 }}>{titulo} <span style={{ color: '#bbb' }}>({(itens || []).length})</span></div>
    {(itens || []).length === 0 ? <div style={s.vazio}>{vazio}</div> : (itens || []).slice(0, 6).map((x, i) => <div key={i} style={{ fontSize: 12, color: '#444', padding: '1px 0' }}>• {render(x)}</div>)}
  </div>;
}
function PendBox({ n, l, k }) {
  const abrir = () => { if (!n) return; try { sessionStorage.setItem('rh_pend_filtro', k); } catch { /* ignora */ } window.dispatchEvent(new CustomEvent('mutti-nav', { detail: 'cadastros' })); };
  return <div onClick={abrir} style={{ background: n > 0 ? '#FBF3DA' : '#EAF3DE', borderRadius: 8, padding: '8px 10px', cursor: n > 0 ? 'pointer' : 'default' }}>
    <div style={{ fontSize: 20, fontWeight: 800, color: n > 0 ? '#8A6D1D' : '#3B6D11' }}>{n}</div>
    <div style={{ fontSize: 10.5, color: n > 0 ? '#8A6D1D' : '#3B6D11' }}>{l}{n > 0 ? ' →' : ''}</div>
  </div>;
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px' },
  chipInfo: { fontSize: 11.5, background: '#F0F3F7', borderRadius: 16, padding: '4px 10px', color: '#444' },
  vazio: { fontSize: 12, color: '#bbb' },
};
