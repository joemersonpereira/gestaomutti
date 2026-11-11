import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

// Convênio (menu Financeiro, Joe 2026-11-11): empresas conveniadas — os funcionários compram fiado e a
// gente FATURA a empresa (emite NF) no fechamento. Aqui a gente ALOCA quais crediários do ERP são empresas
// a faturar, com data de fechamento, e controla a NF por competência (emitida/enviada/paga + anexo).
// Enviar na data certa vira meta do responsável.
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const compAtual = new Date().toISOString().slice(0, 7);
const dBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';

export default function Convenio() {
  const { API } = useAuth();
  const [convs, setConvs] = useState([]);
  const [comp, setComp] = useState(compAtual);
  const [soEmpresa, setSoEmpresa] = useState(true);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState(null);
  const [metas, setMetas] = useState(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    API.get('/convenio/convenios').then(r => setConvs(r.data.convenios || [])).catch(() => setConvs([])).finally(() => setCarregando(false));
    API.get('/convenio/metas?ano=' + comp.slice(0, 4)).then(r => setMetas(r.data)).catch(() => setMetas(null));
  }, [API, comp]);
  useEffect(() => { carregar(); }, [carregar]);

  const toggleEmpresa = (c, v) => API.put('/convenio/convenios/' + c.erp_crediario_id, { ...c, nome: c.nome, is_empresa: v }).then(carregar);
  const lista = convs.filter(c => (!soEmpresa || c.is_empresa) && (!busca.trim() || c.nome.toLowerCase().includes(busca.trim().toLowerCase())));

  return (
    <div style={s.wrap}>
      <Banner emoji="🏢" titulo="Convênio" cor="azul" sub="Empresas conveniadas — consumo dos funcionários, fechamento e emissão de NF por mês. Enviar na data certa é meta." />

      <div style={s.filtros}>
        <label style={s.lab}>Competência<input type="month" value={comp} onChange={e => setComp(e.target.value)} style={s.inp} /></label>
        <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={soEmpresa} onChange={e => setSoEmpresa(e.target.checked)} /> só empresas a faturar</label>
        <label style={s.lab}>🔍 Buscar<input value={busca} onChange={e => setBusca(e.target.value)} placeholder="nome do convênio" style={{ ...s.inp, minWidth: 180 }} /></label>
        <div style={{ flex: 1 }} />
        {metas && <div style={s.metaBox}><div style={{ fontSize: 11, color: '#64748b' }}>NF no prazo ({comp.slice(0, 4)})</div><div style={{ fontSize: 18, fontWeight: 800, color: metas.pctNoPrazo == null ? '#94a3b8' : metas.pctNoPrazo >= 80 ? '#15803d' : '#b45309' }}>{metas.pctNoPrazo == null ? '—' : metas.pctNoPrazo + '%'}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>{metas.noPrazo}/{metas.enviados} enviadas</div></div>}
      </div>

      <div style={s.card}>
        {carregando ? <div style={s.vazio}>carregando…</div> : !lista.length ? <div style={s.vazio}>{soEmpresa ? 'Nenhum convênio marcado como empresa a faturar. Desmarque "só empresas" e marque os que são empresas.' : 'Nenhum convênio.'}</div> :
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '2px solid #eef1f4' }}>
              {['Empresa?', 'Convênio', 'Clientes', 'Em aberto', 'Fechamento', ''].map(h => <th key={h} style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>{h}</th>)}
            </tr></thead>
            <tbody>{lista.map(c => (
              <tr key={c.erp_crediario_id} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={{ padding: '7px 8px' }}><input type="checkbox" checked={!!c.is_empresa} onChange={e => toggleEmpresa(c, e.target.checked)} title="marcar como empresa a faturar (emite NF)" /></td>
                <td style={{ padding: '7px 8px', fontWeight: 600 }}>{c.nome}{c.cnpj ? <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 11 }}> · {c.cnpj}</span> : ''}</td>
                <td style={{ padding: '7px 8px', color: '#475569' }}>{c.clientes}</td>
                <td style={{ padding: '7px 8px', fontWeight: 600 }}>{brl(c.aberto)}</td>
                <td style={{ padding: '7px 8px', color: '#64748b' }}>{c.dia_fechamento ? 'dia ' + c.dia_fechamento : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                <td style={{ padding: '7px 8px' }}><button style={s.btnMini} onClick={() => setSel(c)}>abrir ›</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
      </div>

      {sel && <DetalheConvenio API={API} conv={sel} comp={comp} onClose={() => setSel(null)} onSaved={carregar} />}
    </div>
  );
}

function DetalheConvenio({ API, conv, comp, onClose, onSaved }) {
  const [dados, setDados] = useState({ ...conv });
  const [consumo, setConsumo] = useState(null);
  const [fechs, setFechs] = useState([]);
  const [fechComp, setFechComp] = useState(comp);
  const [f, setF] = useState({ nf_numero: '', nf_emitida_em: '', enviada_em: '', paga_em: '', prazo_data: '', obs: '' });
  const [anexo, setAnexo] = useState(null);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    API.get(`/convenio/convenios/${conv.erp_crediario_id}/consumo?comp=${fechComp}`).then(r => setConsumo(r.data)).catch(() => setConsumo(null));
    API.get(`/convenio/convenios/${conv.erp_crediario_id}/fechamentos`).then(r => setFechs(r.data.fechamentos || [])).catch(() => setFechs([]));
  }, [API, conv.erp_crediario_id, fechComp]);
  useEffect(() => { carregar(); }, [carregar]);
  // prazo sugerido = dia de fechamento no mês seguinte à competência
  useEffect(() => {
    if (!dados.dia_fechamento) return;
    const [y, m] = fechComp.split('-').map(Number); const prox = new Date(y, m, Math.min(dados.dia_fechamento, 28));
    setF(x => ({ ...x, prazo_data: x.prazo_data || prox.toISOString().slice(0, 10) }));
  }, [fechComp, dados.dia_fechamento]);

  const salvarDados = () => API.put('/convenio/convenios/' + conv.erp_crediario_id, { ...dados, nome: conv.nome }).then(() => { setMsg('✅ Dados salvos.'); onSaved(); setTimeout(() => setMsg(''), 2000); }).catch(() => setMsg('⚠️ Erro.'));
  const pegarAnexo = file => { if (!file) return; const r = new FileReader(); r.onload = () => setAnexo({ b64: r.result, mime: file.type }); r.readAsDataURL(file); };
  const salvarFech = () => {
    const body = { competencia: fechComp, valor: consumo ? consumo.consumo : null, ...f, nf_anexo: anexo ? anexo.b64 : undefined, nf_mime: anexo ? anexo.mime : undefined };
    API.post(`/convenio/convenios/${conv.erp_crediario_id}/fechamento`, body).then(() => { setMsg('✅ Fechamento salvo.'); setAnexo(null); carregar(); onSaved(); setTimeout(() => setMsg(''), 2000); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro.')));
  };
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const setD = (k, v) => setDados(x => ({ ...x, [k]: v }));

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}><b style={{ fontSize: 16 }}>🏢 {conv.nome}</b><button style={{ ...s.btnMini, marginLeft: 'auto' }} onClick={onClose}>✕</button></div>

        <div style={s.sec}>
          <div style={s.secTit}>Dados da empresa (prevalecem sobre o ERP, usados p/ cobrança/NF)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={!!dados.is_empresa} onChange={e => setD('is_empresa', e.target.checked)} /> é empresa a faturar</label>
            <label style={s.lab}>Dia de fechamento<input type="number" min="1" max="31" value={dados.dia_fechamento || ''} onChange={e => setD('dia_fechamento', e.target.value)} style={{ ...s.inp, width: 90 }} /></label>
            <label style={s.lab}>CNPJ<input value={dados.cnpj || ''} onChange={e => setD('cnpj', e.target.value)} style={{ ...s.inp, minWidth: 150 }} /></label>
            <label style={s.lab}>E-mail<input value={dados.email || ''} onChange={e => setD('email', e.target.value)} style={{ ...s.inp, minWidth: 180 }} /></label>
            <label style={s.lab}>Telefone<input value={dados.telefone || ''} onChange={e => setD('telefone', e.target.value)} style={{ ...s.inp, width: 130 }} /></label>
            <button style={s.btnG} onClick={salvarDados}>💾 Salvar dados</button>
          </div>
        </div>

        <div style={s.sec}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={s.secTit}>Fechamento do mês</div>
            <label style={s.lab}>Competência<input type="month" value={fechComp} onChange={e => setFechComp(e.target.value)} style={s.inp} /></label>
            {consumo && <div style={s.consumoBox}><div style={{ fontSize: 11, color: '#64748b' }}>Consumo no mês</div><div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{brl(consumo.consumo)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>{consumo.titulos} título(s)</div></div>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
            <label style={s.lab}>Nº da NF<input value={f.nf_numero} onChange={e => set('nf_numero', e.target.value)} style={{ ...s.inp, width: 120 }} /></label>
            <label style={s.lab}>NF emitida em<input type="date" value={f.nf_emitida_em} onChange={e => set('nf_emitida_em', e.target.value)} style={s.inp} /></label>
            <label style={s.lab}>Prazo de envio<input type="date" value={f.prazo_data} onChange={e => set('prazo_data', e.target.value)} style={s.inp} /></label>
            <label style={s.lab}>Enviada em<input type="date" value={f.enviada_em} onChange={e => set('enviada_em', e.target.value)} style={s.inp} /></label>
            <label style={s.lab}>Paga em<input type="date" value={f.paga_em} onChange={e => set('paga_em', e.target.value)} style={s.inp} /></label>
            <label style={{ ...s.btn, cursor: 'pointer' }}>📎 Anexar NF<input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={e => pegarAnexo(e.target.files[0])} /></label>
            {anexo && <span style={{ fontSize: 11, color: '#15803d' }}>✓ NF anexada</span>}
            <label style={{ ...s.lab, flex: 1 }}>Obs.<input value={f.obs} onChange={e => set('obs', e.target.value)} style={{ ...s.inp, width: '100%' }} /></label>
            <button style={s.btnG} onClick={salvarFech}>💾 Salvar fechamento</button>
          </div>
          {f.enviada_em && f.prazo_data && <div style={{ fontSize: 12, marginTop: 6, fontWeight: 600, color: f.enviada_em <= f.prazo_data ? '#15803d' : '#b91c1c' }}>{f.enviada_em <= f.prazo_data ? '✅ dentro do prazo' : '⚠️ enviada fora do prazo'}</div>}
          {msg && <div style={{ fontSize: 13, fontWeight: 600, color: msg.startsWith('⚠️') ? '#b91c1c' : '#15803d', marginTop: 6 }}>{msg}</div>}
        </div>

        {fechs.length > 0 && <div style={s.sec}>
          <div style={s.secTit}>Histórico de fechamentos</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #eef1f4' }}>{['Competência', 'Valor', 'NF', 'Emitida', 'Enviada', 'Paga', 'Prazo', 'Anexo'].map(h => <th key={h} style={{ padding: '5px 7px', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>{fechs.map(x => (
                <tr key={x.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '5px 7px', fontWeight: 600 }}>{x.competencia}</td>
                  <td style={{ padding: '5px 7px' }}>{brl(x.valor)}</td>
                  <td style={{ padding: '5px 7px' }}>{x.nf_numero || '—'}</td>
                  <td style={{ padding: '5px 7px' }}>{dBR(x.nf_emitida_em) || '—'}</td>
                  <td style={{ padding: '5px 7px', color: x.no_prazo === 0 ? '#b91c1c' : '#15803d' }}>{dBR(x.enviada_em) || '—'}{x.enviada_em ? (x.no_prazo === 0 ? ' ⚠️' : ' ✅') : ''}</td>
                  <td style={{ padding: '5px 7px', color: x.paga_em ? '#15803d' : '#b45309' }}>{dBR(x.paga_em) || 'em aberto'}</td>
                  <td style={{ padding: '5px 7px', color: '#64748b' }}>{dBR(x.prazo_data) || '—'}</td>
                  <td style={{ padding: '5px 7px' }}>{x.tem_anexo ? <a href={`/api/convenio/fechamento/${x.id}/anexo`} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>ver NF</a> : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>}
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: 20, maxWidth: 1180, margin: '0 auto' },
  filtros: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 },
  lab: { display: 'flex', flexDirection: 'column', fontSize: 11, color: '#64748b', gap: 3, fontWeight: 600 },
  inp: { border: '1px solid #cbd5e1', borderRadius: 7, padding: '7px 9px', fontSize: 13 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 },
  vazio: { fontSize: 13, color: '#94a3b8', padding: 10 },
  btnMini: { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#334' },
  btn: { padding: '8px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#334155' },
  btnG: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0d6b5e', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 700 },
  metaBox: { textAlign: 'right', background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 10, padding: '6px 12px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: 18, width: 'min(880px,96vw)', maxHeight: '88vh', overflowY: 'auto' },
  sec: { border: '1px solid #eef2f0', borderRadius: 10, padding: 12, marginBottom: 12 },
  secTit: { fontWeight: 700, fontSize: 13, marginBottom: 8 },
  consumoBox: { background: '#f0fdf9', border: '1px solid #bbf7d0', borderRadius: 10, padding: '6px 12px' },
};
