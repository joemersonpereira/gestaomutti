import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

// CRM — cuidar dos clientes com os dados do Trivio (api.triv.io, via backend /api/crm).
// Abas vivas: Campanhas (+ drill quem comprou), Envios & Respostas, Retenção. Joe 2026-11-15.
const ABAS = [
  ['campanhas', '🚀 Campanhas'],
  ['envios', '📨 Envios & Respostas'],
  ['retencao', '🔄 Retenção'],
  ['filipeta', '🏷️ Filipetas'],
  ['sugestao', '🧾 Análise de sugestão'],
  ['rfv', '📊 Análise RFV'],
  ['fidelizacao', '💙 Fidelização'],
];
const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const n0 = v => (Number(v) || 0).toLocaleString('pt-BR');
const dataBr = s => { if (!s) return '—'; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
const soData = s => { if (!s) return '—'; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleDateString('pt-BR'); };
// Cores dos perfis RFV (iguais ao Trivio)
const RFV_COR = { 'Campeão': '#15803d', 'Fidelizado': '#2E8B9E', 'Potencial para ser fidelizado': '#0079C1', 'Recente': '#8CB63C', 'Promissor': '#9b87c4', 'Precisa de atenção': '#E05E7B', 'Em risco': '#E0A43C', 'Quase hibernando': '#E08A3C', 'Hibernando': '#94a3b8', 'Não pode perder': '#C77', 'Perdido': '#C0392B' };
const rfvPill = t => t ? <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', background: RFV_COR[t] || '#94a3b8', borderRadius: 10, padding: '2px 8px', whiteSpace: 'nowrap' }}>{t}</span> : <span style={{ color: '#cbd5e1' }}>—</span>;
const inp = { border: '1px solid #e3e8ea', borderRadius: 8, padding: '7px 9px', fontSize: 13 };

export default function CRM() {
  const [aba, setAba] = useState('campanhas');
  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <Banner emoji="💙" titulo="CRM — Clientes" cor="verde" sub="Acompanhe suas campanhas de ponta a ponta e a saúde da base — dados vivos do Trivio." />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 14px' }}>
        {ABAS.map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)} style={{
            border: '1px solid ' + (aba === k ? 'transparent' : '#e3e8ea'), borderRadius: 9, padding: '7px 13px',
            background: aba === k ? 'linear-gradient(95deg,#0E7C5A,#0b6e59)' : '#f3f7f6', color: aba === k ? '#fff' : '#334',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>{l}</button>
        ))}
      </div>
      {aba === 'campanhas' && <Campanhas />}
      {aba === 'envios' && <Envios />}
      {aba === 'retencao' && <Retencao />}
      {aba === 'filipeta' && <Filipetas />}
      {aba === 'sugestao' && <Sugestao />}
      {aba === 'rfv' && <EmBreve titulo="Análise RFV" desc="Segmentação da base por Recência/Frequência/Valor: Campeão, Fidelizado, Em risco, Hibernando, Perdido… com quantidade, % e valor de cada segmento. (O endpoint da segmentação completa dos 11 segmentos não está na integração atual — fica como próxima fatia; por ora use a aba Fidelização.)" />}
      {aba === 'fidelizacao' && <Fidelizacao />}
    </div>
  );
}

// ── filtro de período compartilhado ──
function usePeriodo() {
  const hoje = new Date(); const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fmt = d => d.toISOString().slice(0, 10);
  const [de, setDe] = useState(fmt(ini)); const [ate, setAte] = useState(fmt(hoje));
  return { de, setDe, ate, setAte };
}
function BarraPeriodo({ de, setDe, ate, setAte, onBuscar, extra }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: '#64748b' }}>De<br /><input type="date" value={de} onChange={e => setDe(e.target.value)} style={inp} /></label>
      <label style={{ fontSize: 12, color: '#64748b' }}>Até<br /><input type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp} /></label>
      {extra}
      <button onClick={onBuscar} style={{ background: '#0d6b5e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>🔍 Buscar</button>
    </div>
  );
}
const offline = <div style={{ background: '#fff', border: '1px dashed #cdeadd', borderRadius: 12, padding: 20, color: '#64748b' }}>Integração do Trivio não configurada neste ambiente (<code>TRIVIO_EMAIL/SENHA</code> no .env).</div>;
const erroBox = <div style={{ background: '#fbeaea', border: '1px solid #f0c9c4', borderRadius: 12, padding: 16, color: '#C0392B' }}>Não foi possível carregar do Trivio.</div>;

// ── Campanhas: resumo + drill "quem comprou" ──
function Campanhas() {
  const { API } = useAuth();
  const { de, setDe, ate, setAte } = usePeriodo();
  const [d, setD] = useState(null); const [est, setEst] = useState('idle');
  const [drill, setDrill] = useState(null); // {id, nome}
  const carregar = useCallback(() => {
    setEst('carregando');
    API.get('/crm/campanhas', { params: { de, ate } })
      .then(r => { setD(r.data); setEst(r.data && r.data.erp === false ? 'offline' : 'ok'); })
      .catch(() => setEst('erro'));
  }, [API, de, ate]);
  useEffect(() => { carregar(); }, [carregar]);
  const s = d && d.summary; const linhas = (d && d.data) || [];
  const roiCor = r => r >= 150 ? '#15803d' : r >= 80 ? '#B7791F' : '#C0392B';
  const Kpi = ({ lab, val }) => (
    <div style={{ background: '#0E7C5A', borderRadius: 10, padding: '10px 14px', color: '#fff', minWidth: 118, flex: '1 1 118px' }}>
      <div style={{ fontSize: 11, opacity: .85 }}>{lab}</div><div style={{ fontSize: 18, fontWeight: 800 }}>{val}</div>
    </div>
  );
  return (
    <div>
      <BarraPeriodo {...{ de, setDe, ate, setAte }} onBuscar={carregar} />
      {est === 'offline' && offline}{est === 'erro' && erroBox}{est === 'carregando' && <div style={{ color: '#94a3b8', padding: 16 }}>carregando…</div>}
      {est === 'ok' && <>
        {s && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <Kpi lab="Clientes que compraram" val={n0(s.customersPurchased)} />
          <Kpi lab="Respostas" val={n0(s.respostas)} />
          <Kpi lab="Total vendas" val={brl(s.totalAmount)} />
          <Kpi lab="Total monitorado" val={brl(s.targetTotalValue)} />
          <Kpi lab="Custo envios" val={brl(s.messageCosts)} />
          <Kpi lab="ROI geral" val={(s.roi || 0) + '%'} />
        </div>}
        <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>Clique numa campanha pra ver <b>quem comprou</b> e como o RFV evoluiu.</div>
        <div style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc' }}>{['Campanha', 'Enviados', 'Respostas', 'Compraram', 'Vendas (R$)', 'Ticket', 'ROI'].map(h => <th key={h} style={{ padding: '9px 10px', fontWeight: 700 }}>{h}</th>)}</tr></thead>
            <tbody>{linhas.map(c => (
              <tr key={c.id} onClick={() => setDrill({ id: c.id, nome: c.campaignName })} style={{ borderTop: '1px solid #f1f3f5', cursor: 'pointer' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600, color: '#0d6b5e' }}>{c.campaignName}</td>
                <td style={{ padding: '8px 10px' }}>{n0(c.shipments)}</td>
                <td style={{ padding: '8px 10px', color: c.respostas ? '#185FA5' : '#cbd5e1', fontWeight: c.respostas ? 700 : 400 }}>{n0(c.respostas)}</td>
                <td style={{ padding: '8px 10px' }}>{n0(c.customersPurchased)} <span style={{ color: '#94a3b8' }}>({c.customersPurchasedPercentage}%)</span></td>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0d6b5e' }}>{brl(c.valueAmount)}</td>
                <td style={{ padding: '8px 10px', color: '#64748b' }}>{brl(c.averageTicket)}</td>
                <td style={{ padding: '8px 10px', fontWeight: 800, color: roiCor(c.roi) }}>{(c.roi || 0)}%</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      </>}
      {drill && <DrillVendas id={drill.id} nome={drill.nome} de={de} ate={ate} onFechar={() => setDrill(null)} />}
    </div>
  );
}

// ── Drill: quem comprou pela campanha (RFV anterior → posterior) ──
function DrillVendas({ id, nome, de, ate, onFechar }) {
  const { API } = useAuth();
  const [d, setD] = useState(null); const [est, setEst] = useState('carregando');
  useEffect(() => {
    API.get(`/crm/campanhas/${id}/vendas`, { params: { de, ate, size: 300 } })
      .then(r => { setD(r.data); setEst('ok'); }).catch(() => setEst('erro'));
  }, [API, id, de, ate]);
  const s = d && d.summary; const rows = (d && d.data) || [];
  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,30,25,.45)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 12px', overflow: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, maxWidth: 1050, width: '100%', boxShadow: '0 12px 40px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #eef1f4' }}>
          <div><div style={{ fontWeight: 800, fontSize: 15 }}>🧾 Quem comprou — {nome}</div>
            {s && <div style={{ fontSize: 12, color: '#64748b' }}>{n0(s.totalRows)} clientes · {brl(s.totalAmount)} em vendas · {brl(s.targetTotalValue)} monitorado</div>}</div>
          <button onClick={onFechar} style={{ marginLeft: 'auto', border: 'none', background: '#f1f5f9', borderRadius: 8, padding: '6px 12px', fontWeight: 700, cursor: 'pointer' }}>Fechar ✕</button>
        </div>
        <div style={{ padding: 14 }}>
          {est === 'carregando' && <div style={{ color: '#94a3b8', padding: 10 }}>carregando…</div>}
          {est === 'erro' && erroBox}
          {est === 'ok' && <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc' }}>{['Cliente', 'Sem venda desde', 'Mensagem', '1ª venda', 'RFV anterior', '→', 'RFV posterior', 'Vendas (R$)'].map(h => <th key={h} style={{ padding: '7px 9px', fontWeight: 700 }}>{h}</th>)}</tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #f1f3f5' }}>
                <td style={{ padding: '6px 9px', fontWeight: 600 }}>{r.customerName}</td>
                <td style={{ padding: '6px 9px', color: '#64748b' }}>{soData(r.previousPurchaseAt)}</td>
                <td style={{ padding: '6px 9px', color: '#94a3b8' }}>{soData(r.messageSentDate)}</td>
                <td style={{ padding: '6px 9px', color: '#64748b' }}>{soData(r.initialPurchaseAt)}</td>
                <td style={{ padding: '6px 9px' }}>{rfvPill(r.rfmTagPrevious)}</td>
                <td style={{ padding: '6px 2px', color: '#cbd5e1' }}>→</td>
                <td style={{ padding: '6px 9px' }}>{rfvPill(r.rfmTagAfter)}</td>
                <td style={{ padding: '6px 9px', fontWeight: 700, color: '#0d6b5e' }}>{brl(r.totalAmount)}</td>
              </tr>
            ))}</tbody>
          </table></div>}
        </div>
      </div>
    </div>
  );
}

// ── Envios & Respostas: auditoria ──
function Envios() {
  const { API } = useAuth();
  const { de, setDe, ate, setAte } = usePeriodo();
  const [busca, setBusca] = useState(''); const [falhas, setFalhas] = useState(false);
  const [d, setD] = useState(null); const [est, setEst] = useState('idle');
  const carregar = useCallback(() => {
    setEst('carregando');
    API.get('/crm/envios', { params: { de, ate, busca: busca || undefined, falhas: falhas ? 1 : undefined, size: 200 } })
      .then(r => { setD(r.data); setEst(r.data && r.data.erp === false ? 'offline' : 'ok'); })
      .catch(() => setEst('erro'));
  }, [API, de, ate, busca, falhas]);
  useEffect(() => { carregar(); }, [de, ate, falhas]); // eslint-disable-line
  const rows = (d && d.data) || [];
  const stCor = s => s === 2 ? { c: '#15803d', b: '#eafaf0' } : s === 1 ? { c: '#B7791F', b: '#fcf7ea' } : { c: '#C0392B', b: '#fbeaea' };
  return (
    <div>
      <BarraPeriodo {...{ de, setDe, ate, setAte }} onBuscar={carregar}
        extra={<>
          <label style={{ fontSize: 12, color: '#64748b' }}>Buscar<br /><input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && carregar()} placeholder="nome, CPF, celular…" style={{ ...inp, width: 190 }} /></label>
          <label style={{ fontSize: 12.5, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5, paddingBottom: 8 }}><input type="checkbox" checked={falhas} onChange={e => setFalhas(e.target.checked)} /> só falhas</label>
        </>} />
      <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 8 }}>Esta auditoria traz o <b>status de entrega</b> (Entregue / Enviado / Falha). O <b>número de respostas</b> de cada campanha aparece na aba <b>🚀 Campanhas</b> (coluna Respostas). A lista por cliente de <b>quem respondeu</b> entra assim que eu ligar a fonte de respostas.</div>
      {est === 'offline' && offline}{est === 'erro' && erroBox}{est === 'carregando' && <div style={{ color: '#94a3b8', padding: 16 }}>carregando…</div>}
      {est === 'ok' && <div style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #f1f3f5' }}>{n0(rows.length)} envio(s){(d.page && d.page.total) ? ` de ${n0(d.page.total)}` : ''}</div>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc' }}>{['Cliente', 'CPF/CNPJ', 'Celular', 'Campanha', 'Enviado em', 'Canal', 'Status'].map(h => <th key={h} style={{ padding: '8px 10px', fontWeight: 700 }}>{h}</th>)}</tr></thead>
          <tbody>{rows.length === 0 && <tr><td colSpan={7} style={{ padding: 14, color: '#94a3b8' }}>Nenhum envio no período.</td></tr>}
            {rows.map((r, i) => { const c = stCor(r.messageStatus); return (
            <tr key={r.messageConsolidationId || i} style={{ borderTop: '1px solid #f1f3f5' }}>
              <td style={{ padding: '7px 10px', fontWeight: 600 }}>{r.name}</td>
              <td style={{ padding: '7px 10px', color: '#64748b' }}>{r.document || '—'}</td>
              <td style={{ padding: '7px 10px', color: '#64748b' }}>{r.cellphone || r.email || '—'}</td>
              <td style={{ padding: '7px 10px', color: '#475569' }}>{r.campaign}</td>
              <td style={{ padding: '7px 10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{dataBr(r.sentDate)}</td>
              <td style={{ padding: '7px 10px', color: '#64748b' }}>{r.messageTypeLabel || r.messageTypeString}</td>
              <td style={{ padding: '7px 10px' }}><span style={{ fontSize: 10.5, fontWeight: 700, color: c.c, background: c.b, borderRadius: 10, padding: '2px 9px' }}>{r.messageStatusLabel || (r.messageStatus === 2 ? 'Entregue' : r.messageStatus === 1 ? 'Enviado' : 'Falha')}</span></td>
            </tr>); })}</tbody>
        </table></div>
      </div>}
    </div>
  );
}

// ── Retenção: janela móvel (2 períodos) com indicadores ──
function Retencao() {
  const { API } = useAuth();
  const [d, setD] = useState(null); const [est, setEst] = useState('carregando');
  useEffect(() => {
    API.get('/crm/retencao').then(r => { setD(r.data); setEst(r.data && r.data.erp === false ? 'offline' : 'ok'); }).catch(() => setEst('erro'));
  }, [API]);
  const periodos = (d && d.customerRetentionIndicators) || [];
  const valFmt = v => { if (!v) return '—'; if (v.valueType === 1) return (Math.round(v.value * 1000) / 10) + '%'; if (v.valueType === 2) return brl(v.value); return n0(v.value); };
  const varFmt = v => { if (!v || v.value == null) return null; const p = Math.round(v.value * 1000) / 10; return <span style={{ fontSize: 11, color: p >= 0 ? '#15803d' : '#C0392B' }}> {p >= 0 ? '▲' : '▼'}{Math.abs(p)}%</span>; };
  return (
    <div>
      {est === 'offline' && offline}{est === 'erro' && erroBox}{est === 'carregando' && <div style={{ color: '#94a3b8', padding: 16 }}>carregando…</div>}
      {est === 'ok' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
        {periodos.map((p, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: '#f8fafc', padding: '10px 14px', fontWeight: 800, fontSize: 13.5, borderBottom: '1px solid #eef1f4' }}>{p.period}</div>
            <div style={{ padding: '6px 14px 14px' }}>
              {(p.indicators || []).map((g, gi) => (
                <div key={gi} style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', margin: '4px 0' }}>{g.title}</div>
                  <table style={{ width: '100%', fontSize: 12.5 }}><tbody>
                    {(g.data || []).map((it, di) => (
                      <tr key={di} style={{ borderTop: '1px solid #f4f6f7', fontWeight: it.isTotal ? 700 : 400 }}>
                        <td style={{ padding: '5px 0', color: '#475569' }}>{it.description}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>{valFmt(it.value)}</td>
                        <td style={{ padding: '5px 0', textAlign: 'right', color: '#94a3b8', width: 62 }}>{it.percent && it.percent.value != null ? (Math.round(it.percent.value * 1000) / 10) + '%' : ''}</td>
                        <td style={{ padding: '5px 0', textAlign: 'right', width: 58 }}>{varFmt(it.variation)}</td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>}
    </div>
  );
}

// seletor mês/ano
function useMesAno() {
  const h = new Date(); const [mes, setMes] = useState(h.getMonth() + 1); const [ano, setAno] = useState(h.getFullYear());
  return { mes, setMes, ano, setAno };
}
const MESNOME = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
function BarraMesAno({ mes, setMes, ano, setAno, onBuscar }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: '#64748b' }}>Mês<br /><select value={mes} onChange={e => setMes(Number(e.target.value))} style={inp}>{MESNOME.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}</select></label>
      <label style={{ fontSize: 12, color: '#64748b' }}>Ano<br /><select value={ano} onChange={e => setAno(Number(e.target.value))} style={inp}>{[2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}</select></label>
      <button onClick={onBuscar} style={{ background: '#0d6b5e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>🔍 Buscar</button>
    </div>
  );
}

// ── Filipetas (encartes): total + por loja ──
function Filipetas() {
  const { API } = useAuth(); const { mes, setMes, ano, setAno } = useMesAno();
  const [d, setD] = useState(null); const [est, setEst] = useState('idle');
  const carregar = useCallback(() => { setEst('carregando'); API.get('/crm/filipetas', { params: { mes, ano } }).then(r => { setD(r.data); setEst(r.data && r.data.erp === false ? 'offline' : 'ok'); }).catch(() => setEst('erro')); }, [API, mes, ano]);
  useEffect(() => { carregar(); }, [carregar]);
  const t = d && d.total; const lojas = (d && d.lojas) || [];
  const Kpi = ({ lab, val }) => <div style={{ background: '#0E7C5A', borderRadius: 10, padding: '10px 14px', color: '#fff', minWidth: 120, flex: '1 1 120px' }}><div style={{ fontSize: 11, opacity: .85 }}>{lab}</div><div style={{ fontSize: 18, fontWeight: 800 }}>{val}</div></div>;
  return (
    <div>
      <BarraMesAno {...{ mes, setMes, ano, setAno }} onBuscar={carregar} />
      {est === 'offline' && offline}{est === 'erro' && erroBox}{est === 'carregando' && <div style={{ color: '#94a3b8', padding: 16 }}>carregando…</div>}
      {est === 'ok' && <>
        {t && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <Kpi lab="Filipetas impressas" val={n0(t.impressas)} />
          <Kpi lab="Convertidas" val={n0(t.convertidas)} />
          <Kpi lab="Conversão" val={(t.conversao || 0) + '%'} />
          <Kpi lab="Itens vendidos" val={n0(t.itens)} />
          <Kpi lab="Total vendido" val={brl(t.totalVendido)} />
        </div>}
        <div style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc' }}>{['Loja', 'Impressas', 'Convertidas', 'Conversão', 'Itens', 'Total vendido'].map(h => <th key={h} style={{ padding: '9px 10px', fontWeight: 700 }}>{h}</th>)}</tr></thead>
            <tbody>{lojas.map((l, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f1f3f5' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{l.loja}</td>
                <td style={{ padding: '8px 10px' }}>{n0(l.impressas)}</td>
                <td style={{ padding: '8px 10px' }}>{n0(l.convertidas)}</td>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: l.conversao >= 1 ? '#15803d' : '#B7791F' }}>{l.conversao}%</td>
                <td style={{ padding: '8px 10px', color: '#64748b' }}>{n0(l.itens)}</td>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0d6b5e' }}>{brl(l.totalVendido)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      </>}
    </div>
  );
}

// ── Análise de sugestão (PDV+): conversão por vendedor ──
function Sugestao() {
  const { API } = useAuth(); const { mes, setMes, ano, setAno } = useMesAno();
  const [d, setD] = useState(null); const [est, setEst] = useState('idle');
  const carregar = useCallback(() => { setEst('carregando'); API.get('/crm/sugestao', { params: { mes, ano } }).then(r => { setD(r.data); setEst(r.data && r.data.erp === false ? 'offline' : 'ok'); }).catch(() => setEst('erro')); }, [API, mes, ano]);
  useEffect(() => { carregar(); }, [carregar]);
  const vend = ((d && d.vendedores) || []).slice().sort((a, b) => (b.taxa || 0) - (a.taxa || 0));
  return (
    <div>
      <BarraMesAno {...{ mes, setMes, ano, setAno }} onBuscar={carregar} />
      {est === 'offline' && offline}{est === 'erro' && erroBox}{est === 'carregando' && <div style={{ color: '#94a3b8', padding: 16 }}>carregando…</div>}
      {est === 'ok' && <div style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #f1f3f5' }}>Taxa de conversão das sugestões do PDV+ por vendedor · {n0(vend.length)} vendedores</div>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc' }}>{['#', 'Vendedor', 'Loja', 'Exibidas', 'Convertidas', 'Conversão'].map(h => <th key={h} style={{ padding: '9px 10px', fontWeight: 700 }}>{h}</th>)}</tr></thead>
          <tbody>{vend.map((v, i) => { const pct = Math.round((v.taxa || 0) * 1000) / 10; return (
            <tr key={i} style={{ borderTop: '1px solid #f1f3f5' }}>
              <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{i + 1}</td>
              <td style={{ padding: '7px 10px', fontWeight: 600 }}>{v.balconista}</td>
              <td style={{ padding: '7px 10px', color: '#64748b' }}>{String(v.loja || '').replace(/\s*\([^)]*\)\s*$/, '')}</td>
              <td style={{ padding: '7px 10px' }}>{n0(v.exibidas)}</td>
              <td style={{ padding: '7px 10px' }}>{n0(v.convertidas)}</td>
              <td style={{ padding: '7px 10px', fontWeight: 800, color: pct >= 10 ? '#15803d' : pct >= 5 ? '#B7791F' : '#C0392B' }}>{pct}%</td>
            </tr>); })}</tbody>
        </table></div>
      </div>}
    </div>
  );
}

// ── Fidelização: Fiel / Potencial / Ocasional ao longo do tempo ──
function Fidelizacao() {
  const { API } = useAuth();
  const { de, setDe, ate, setAte } = usePeriodo();
  const [d, setD] = useState(null); const [est, setEst] = useState('idle');
  const carregar = useCallback(() => { setEst('carregando'); API.get('/crm/fidelizacao', { params: { de, ate } }).then(r => { setD(r.data); setEst(r.data && r.data.erp === false ? 'offline' : 'ok'); }).catch(() => setEst('erro')); }, [API, de, ate]);
  useEffect(() => { carregar(); }, [carregar]);
  const segs = (d && d.segmentations) || [];
  const ult = segs[segs.length - 1];
  const COR = { Fiel: '#01619A', Potencial: '#0079C1', Ocasional: '#DEDEDE' };
  return (
    <div>
      <BarraPeriodo {...{ de, setDe, ate, setAte }} onBuscar={carregar} />
      {est === 'offline' && offline}{est === 'erro' && erroBox}{est === 'carregando' && <div style={{ color: '#94a3b8', padding: 16 }}>carregando…</div>}
      {est === 'ok' && <>
        {ult && <div style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Perfil da base — {new Date(ult.referenceDate).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</div>
          {ult.items.map(it => (
            <div key={it.profile} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                <span style={{ fontWeight: 700 }}>{it.profile}</span>
                <span style={{ color: '#64748b' }}>{n0(it.customerAmount)} clientes · {it.customerRate}%</span>
              </div>
              <div style={{ height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}><div style={{ width: it.customerRate + '%', height: '100%', background: it.color || COR[it.profile] || '#94a3b8' }} /></div>
            </div>
          ))}
        </div>}
        <div style={{ background: '#fff', border: '1px solid #eef1f4', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #f1f3f5' }}>Evolução mês a mês</div>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc' }}>{['Mês', 'Fiel', 'Potencial', 'Ocasional'].map(h => <th key={h} style={{ padding: '8px 10px', fontWeight: 700 }}>{h}</th>)}</tr></thead>
            <tbody>{segs.slice().reverse().map((sg, i) => { const g = p => (sg.items.find(x => x.profile === p) || {}); return (
              <tr key={i} style={{ borderTop: '1px solid #f1f3f5' }}>
                <td style={{ padding: '7px 10px', fontWeight: 600 }}>{new Date(sg.referenceDate).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}</td>
                {['Fiel', 'Potencial', 'Ocasional'].map(p => { const x = g(p); return <td key={p} style={{ padding: '7px 10px' }}>{x.customerAmount != null ? n0(x.customerAmount) + ' ' : '— '}<span style={{ color: '#94a3b8', fontSize: 11 }}>{x.customerRate != null ? '(' + x.customerRate + '%)' : ''}</span></td>; })}
              </tr>); })}</tbody>
          </table></div>
        </div>
      </>}
    </div>
  );
}

function EmBreve({ titulo, desc }) {
  return (
    <div style={{ background: '#fff', border: '1px dashed #cdeadd', borderRadius: 12, padding: 22 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>{titulo} <span style={{ fontSize: 11, fontWeight: 700, color: '#0d6b5e', background: '#eef7f2', borderRadius: 8, padding: '2px 8px' }}>em construção</span></div>
      <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.55, maxWidth: 720 }}>{desc}</div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>Os dados vêm da integração do Trivio — já validada. Entra na próxima fatia.</div>
    </div>
  );
}
