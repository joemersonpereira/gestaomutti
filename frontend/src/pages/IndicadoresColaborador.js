import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

// Indicadores INDIVIDUAIS do escritório — a Direção/RH atribui metas por colaborador,
// com prêmio em R$ ou pontos por indicador, e apura o realizado do mês.
const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hoje = new Date();
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const UNIDADES = [['qtd', 'quantidade'], ['reais', 'R$'], ['percentual', '%'], ['dias', 'dias'], ['horas', 'horas']];

export default function IndicadoresColaborador() {
  const { API } = useAuth();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [colabs, setColabs] = useState([]);
  const [colab, setColab] = useState('');
  const [inds, setInds] = useState([]);
  const [novo, setNovo] = useState(null);
  const [msg, setMsg] = useState('');
  const [fontes, setFontes] = useState([]);
  const [lote, setLote] = useState([]); // colaboradores extras p/ aplicar em lote

  useEffect(() => { API.get('/colab-indicadores/colaboradores').then(r => setColabs(r.data.colaboradores || [])).catch(() => {}); }, [API]);
  useEffect(() => { API.get('/colab-indicadores/fontes').then(r => setFontes(r.data.fontes || [])).catch(() => {}); }, [API]);
  const carregar = useCallback(() => {
    if (!colab) { setInds([]); return; }
    API.get('/colab-indicadores', { params: { colaborador_id: colab, mes, ano } }).then(r => setInds(r.data.indicadores || [])).catch(() => setInds([]));
  }, [API, colab, mes, ano]);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvarNovo() {
    if (!novo.nome?.trim()) { setMsg('Informe o nome do indicador.'); return; }
    const ids = [colab, ...lote.filter(x => x !== colab)];
    await API.post('/colab-indicadores', { ...novo, colaborador_ids: ids });
    setNovo(null); setMsg(''); setLote([]); carregar();
  }
  const fonteAuto = novo && novo.fonte && novo.fonte !== 'manual';
  const apurar = (id, realizado) => API.post(`/colab-indicadores/${id}/apurar`, { mes, ano, realizado: Number(realizado) || 0 }).then(carregar);
  const remover = id => { if (window.confirm('Remover este indicador?')) API.delete(`/colab-indicadores/${id}`).then(carregar); };

  return (
    <div style={s.wrap}>
      <Banner emoji="🎯" titulo="Indicadores individuais" cor="roxo" sub="Metas por colaborador do escritório, com prêmio por indicador batido e apuração mensal." />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select value={colab} onChange={e => setColab(e.target.value)} style={{ ...s.inp, minWidth: 240 }}>
          <option value="">Selecione o colaborador…</option>
          {colabs.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.funcao}</option>)}
        </select>
        <select value={mes} onChange={e => setMes(Number(e.target.value))} style={{ ...s.inp, width: 'auto' }}>{MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...s.inp, width: 'auto' }}>{[0, 1].map(i => { const y = hoje.getFullYear() - i; return <option key={y} value={y}>{y}</option>; })}</select>
      </div>

      {!colab && <div style={{ ...s.card, textAlign: 'center', color: '#999' }}>Escolha um colaborador do escritório para atribuir e apurar os indicadores dele.</div>}

      {colab && (
        <>
          {!novo && <button onClick={() => setNovo({ unidade: 'qtd', sentido: 'maior', premio_tipo: 'reais', meta: '', premio_valor: '' })} style={{ ...s.btn, marginBottom: 12 }}>+ Novo indicador</button>}
          {novo && (
            <div style={{ ...s.card, borderLeft: '4px solid #7a3d9c' }}>
              <input placeholder="Nome do indicador (ex.: Conciliação em dia, Zerar pendências…)" value={novo.nome || ''} onChange={e => setNovo({ ...novo, nome: e.target.value })} style={s.inp} />
              <label style={s.lbl}>Fonte do realizado
                <select value={novo.fonte || 'manual'} onChange={e => {
                  const fo = fontes.find(x => x.id === e.target.value);
                  setNovo({ ...novo, fonte: e.target.value, ...(fo && fo.unidade ? { unidade: fo.unidade, sentido: fo.sentido } : {}) });
                }} style={s.inp}>{fontes.map(fo => <option key={fo.id} value={fo.id}>{fo.label}</option>)}</select>
              </label>
              {fonteAuto && <div style={{ fontSize: 11, color: '#7a3d9c', margin: '-4px 0 8px' }}>⚙️ O realizado é calculado automático das tarefas do colaborador — só defina a meta.</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label style={s.lbl}>Meta<input type="number" value={novo.meta} onChange={e => setNovo({ ...novo, meta: e.target.value })} style={{ ...s.inp, width: 110 }} /></label>
                <label style={s.lbl}>Unidade<select value={novo.unidade} disabled={fonteAuto} onChange={e => setNovo({ ...novo, unidade: e.target.value })} style={{ ...s.inp, width: 130, opacity: fonteAuto ? 0.6 : 1 }}>{UNIDADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                <label style={s.lbl}>Bate quando<select value={novo.sentido} disabled={fonteAuto} onChange={e => setNovo({ ...novo, sentido: e.target.value })} style={{ ...s.inp, width: 160, opacity: fonteAuto ? 0.6 : 1 }}><option value="maior">realizado ≥ meta</option><option value="menor">realizado ≤ meta</option></select></label>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={s.lbl}>Prêmio se bater<select value={novo.premio_tipo} onChange={e => setNovo({ ...novo, premio_tipo: e.target.value })} style={{ ...s.inp, width: 130 }}><option value="reais">R$</option><option value="pontos">pontos</option></select></label>
                <label style={s.lbl}>Valor do prêmio<input type="number" value={novo.premio_valor} onChange={e => setNovo({ ...novo, premio_valor: e.target.value })} style={{ ...s.inp, width: 120 }} /></label>
              </div>
              <input placeholder="Descrição / como medir (opcional)" value={novo.descricao || ''} onChange={e => setNovo({ ...novo, descricao: e.target.value })} style={s.inp} />
              <div style={{ background: '#FAF6FD', border: '1px solid #e6d9f2', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                <div style={{ fontSize: 11.5, color: '#6a3ab0', fontWeight: 700, marginBottom: 4 }}>Aplicar também a (opcional) — cria o mesmo indicador em lote</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {colabs.filter(c => c.id !== colab).map(c => {
                    const on = lote.includes(c.id);
                    return <button key={c.id} type="button" onClick={() => setLote(l => on ? l.filter(x => x !== c.id) : [...l, c.id])}
                      style={{ fontSize: 11, padding: '4px 9px', borderRadius: 14, cursor: 'pointer', border: '1px solid ' + (on ? '#6a3ab0' : '#ddd'), background: on ? '#6a3ab0' : '#fff', color: on ? '#fff' : '#666' }}>{c.nome.split(' ')[0]}{on ? ' ✓' : ''}</button>;
                  })}
                </div>
                {lote.length > 0 && <div style={{ fontSize: 10.5, color: '#6a3ab0', marginTop: 4 }}>Será criado para {1 + lote.length} colaboradores.</div>}
              </div>
              {msg && <div style={{ fontSize: 12, color: '#C0392B', marginBottom: 6 }}>{msg}</div>}
              <div style={{ display: 'flex', gap: 6 }}><button onClick={salvarNovo} style={s.btn}>Salvar{lote.length ? ` (${1 + lote.length})` : ''}</button><button onClick={() => { setNovo(null); setMsg(''); setLote([]); }} style={s.chip}>Cancelar</button></div>
            </div>
          )}

          {inds.length === 0 && !novo && <div style={{ ...s.card, textAlign: 'center', color: '#999' }}>Nenhum indicador para este colaborador ainda.</div>}
          {inds.map(ind => <LinhaIndicador key={ind.id} ind={ind} onApurar={apurar} onRemover={remover} />)}
        </>
      )}
    </div>
  );
}

function LinhaIndicador({ ind, onApurar, onRemover }) {
  const [real, setReal] = useState(ind.realizado != null ? String(ind.realizado) : '');
  useEffect(() => { setReal(ind.realizado != null ? String(ind.realizado) : ''); }, [ind.realizado, ind.id]);
  const uni = ind.unidade === 'reais' ? 'R$' : ind.unidade === 'percentual' ? '%' : ind.unidade === 'dias' ? 'dias' : ind.unidade === 'horas' ? 'h' : '';
  const premio = ind.premio_tipo === 'pontos' ? `${ind.premio_valor} pts` : brl(ind.premio_valor);
  return (
    <div style={{ ...s.card, borderLeft: `4px solid ${ind.batido === true ? '#1E824C' : ind.batido === false ? '#C0392B' : '#dfe6ea'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{ind.nome}</div>
        {ind.batido === true && <span style={{ fontSize: 11, color: '#fff', background: '#1E824C', borderRadius: 6, padding: '1px 8px' }}>bateu ✓ ganha {premio}</span>}
        {ind.batido === false && <span style={{ fontSize: 11, color: '#fff', background: '#C0392B', borderRadius: 6, padding: '1px 8px' }}>não bateu</span>}
        <button onClick={() => onRemover(ind.id)} style={{ ...s.chip, marginLeft: 'auto', color: '#993C1D', borderColor: '#f0d0d0' }}>remover</button>
      </div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>
        Meta: <b>{ind.sentido === 'menor' ? '≤' : '≥'} {ind.meta}{uni}</b> · Prêmio: <b>{premio}</b>{ind.auto ? ' · ⚙️ automático (tarefas)' : ''}{ind.descricao ? ` · ${ind.descricao}` : ''}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#555' }}>Realizado do mês:</span>
        {ind.auto ? (
          <span style={{ fontSize: 13, fontWeight: 700 }}>{ind.realizado != null ? `${ind.realizado}${uni}` : '—'} <span style={{ fontSize: 10.5, color: '#7a3d9c' }}>(automático)</span></span>
        ) : (
          <input type="number" value={real} onChange={e => setReal(e.target.value)} placeholder="—" style={{ ...s.inp, width: 110, marginBottom: 0 }} />
        )}
        <button onClick={() => onApurar(ind.id, ind.auto ? '' : real)} style={{ ...s.btn, marginBottom: 0 }}>{ind.auto ? 'Fechar mês' : 'Apurar'}</button>
        {ind.apurado && <span style={{ fontSize: 11.5, color: '#888' }}>lançado</span>}
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 860, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  inp: { width: '100%', padding: '9px 11px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, marginBottom: 8, fontFamily: 'inherit', boxSizing: 'border-box' },
  lbl: { display: 'flex', flexDirection: 'column', fontSize: 11, color: '#666', gap: 2 },
  btn: { fontSize: 13, padding: '9px 16px', background: '#7a3d9c', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  chip: { fontSize: 12, padding: '6px 12px', border: '1px solid #ddd', borderRadius: 20, background: '#fff', cursor: 'pointer', color: '#555' },
};
