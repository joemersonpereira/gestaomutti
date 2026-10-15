import React, { useState, useEffect, useCallback } from 'react';

// Escala de horário semanal (horário previsto de entrada por dia da semana), por colaborador/mês.
// Usada no Ponto (RH/gestão) e no "Feriados e Escala" (gerente). Backend: /ponto/escala/*.
const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function EscalaHorario({ API, lojaFixa }) {
  const [lojas, setLojas] = useState([]); const [loja, setLoja] = useState(lojaFixa || '');
  const [colabs, setColabs] = useState([]); const [colab, setColab] = useState('');
  const [ano, setAno] = useState(new Date().getFullYear()); const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [dias, setDias] = useState(() => DIAS_SEM.map((_, i) => ({ dia_semana: i, entrada: '', saida: '', folga: i === 0 })));
  const [msg, setMsg] = useState('');
  useEffect(() => { if (!lojaFixa) API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API, lojaFixa]);
  useEffect(() => { setLoja(lojaFixa || ''); }, [lojaFixa]);
  useEffect(() => {
    API.get('/ponto/escala/colaboradores', { params: { loja } }).then(r => setColabs(r.data.colaboradores || [])).catch(() => setColabs([]));
  }, [API, loja]);
  const carregar = useCallback(() => {
    if (!colab) return;
    API.get('/ponto/escala', { params: { colaborador: colab, ano, mes } }).then(r => {
      const base = DIAS_SEM.map((_, i) => ({ dia_semana: i, entrada: '', saida: '', folga: false }));
      (r.data.semanal || []).forEach(x => { const d = base[x.dia_semana]; if (d) { d.entrada = x.entrada || ''; d.saida = x.saida || ''; d.folga = !!x.folga; } });
      setDias(base);
    }).catch(() => {});
  }, [API, colab, ano, mes]);
  useEffect(() => { carregar(); }, [carregar]);

  const setDia = (i, patch) => setDias(ds => ds.map((d, j) => j === i ? { ...d, ...patch } : d));
  const copiarParaTodos = () => { const base = dias[1]; setDias(ds => ds.map((d, i) => i === 0 ? d : { ...d, entrada: base.entrada, saida: base.saida, folga: base.folga })); };
  const salvar = () => {
    if (!colab) { setMsg('Selecione o colaborador.'); return; }
    API.post('/ponto/escala/semanal', { lojaId: loja || undefined, colaboradorId: colab, ano, mes, dias })
      .then(() => setMsg('✅ Escala salva.')).catch(e => setMsg(e.response?.data?.erro || 'Erro.'));
    setTimeout(() => setMsg(''), 3000);
  };
  return (
    <>
      <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {!lojaFixa && <label style={s.lbl}>Loja<select value={loja} onChange={e => { setLoja(e.target.value); setColab(''); }} style={s.inp}><option value="">Todas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>}
        <label style={s.lbl}>Colaborador<select value={colab} onChange={e => setColab(e.target.value)} style={{ ...s.inp, minWidth: 200 }}><option value="">Selecione…</option>{colabs.map(c => <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ` · ${c.funcao}` : ''}</option>)}</select></label>
        <label style={s.lbl}>Mês<select value={mes} onChange={e => setMes(Number(e.target.value))} style={s.inp}>{MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></label>
        <label style={s.lbl}>Ano<input type="number" value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...s.inp, width: 80 }} /></label>
      </div>
      {!colab ? <div style={s.vazio}>Selecione um colaborador para lançar a escala do mês.</div> :
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Escala semanal — horário previsto de entrada</div>
          <button onClick={copiarParaTodos} style={s.btnMini}>copiar Seg → todos os dias</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>{['Dia', 'Entrada', 'Saída (opc.)', 'Folga'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>{dias.map((d, i) => (
            <tr key={i} style={{ borderTop: '1px solid #f2f2f2' }}>
              <td style={{ ...s.td, fontWeight: 600, width: 60 }}>{DIAS_SEM[i]}</td>
              <td style={s.td}><input type="time" value={d.entrada} disabled={d.folga} onChange={e => setDia(i, { entrada: e.target.value })} style={{ ...s.inp, opacity: d.folga ? 0.4 : 1 }} /></td>
              <td style={s.td}><input type="time" value={d.saida} disabled={d.folga} onChange={e => setDia(i, { saida: e.target.value })} style={{ ...s.inp, opacity: d.folga ? 0.4 : 1 }} /></td>
              <td style={s.td}><label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#666' }}><input type="checkbox" checked={d.folga} onChange={e => setDia(i, { folga: e.target.checked })} /> folga</label></td>
            </tr>))}</tbody>
        </table>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
          <button onClick={salvar} style={s.btn}>Salvar escala de {MESES[mes - 1]}/{ano}</button>
          {msg && <span style={{ fontSize: 12.5, color: msg.startsWith('✅') ? '#1E874B' : '#C0392B' }}>{msg}</span>}
        </div>
        <div style={{ background: '#F6F7F9', borderRadius: 8, marginTop: 10, padding: '8px 10px', fontSize: 11.5, color: '#888' }}>💡 A orientação é <b>chegar 5 minutos antes</b>. Este horário é cruzado com a 1ª batida do Tangerino: quem chega até 5 min antes ganha peso extra no ranking Caixa Destaque.</div>
      </div>}
    </>
  );
}

const s = {
  card: { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '12px 14px', marginBottom: 10 },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  lbl: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#888' },
  btn: { fontSize: 13, padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 12, padding: '7px 12px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
  vazio: { fontSize: 12.5, color: '#aaa', textAlign: 'center', padding: 14 },
  th: { textAlign: 'left', fontSize: 11, color: '#888', padding: '5px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  td: { textAlign: 'left', padding: '6px 8px' },
};
