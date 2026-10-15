import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

// Tesouraria — Fechamento do dia: quando os caixas da loja fecham, anexar os DEPÓSITOS (PDF/foto)
// e as DESPESAS (foto pela câmera ou puxando da pasta da nuvem onde o gerente subiu).
// Não trata de quebra/sobra-falta de caixa (isso é outro assunto).

const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hojeStr = new Date().toISOString().slice(0, 10);

const s = {
  wrap: { padding: 20, maxWidth: 1100, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, margin: 0, color: '#1e293b' },
  filtros: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 },
  lab: { display: 'flex', flexDirection: 'column', fontSize: 11, color: '#64748b', gap: 3 },
  inp: { border: '1px solid #cbd5e1', borderRadius: 7, padding: '7px 9px', fontSize: 13 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 14 },
  btn: { padding: '8px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#334155' },
  btnG: { padding: '8px 12px', borderRadius: 7, border: '1px solid #0d6b5e', background: '#0d6b5e', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  lanc: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13 },
};

const lerArq = file => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });

export default function TesourariaCaixa() {
  const { API } = useAuth();
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  const [data, setData] = useState(hojeStr);
  const [dia, setDia] = useState(null);
  const [anexos, setAnexos] = useState([]);
  const [msg, setMsg] = useState('');
  const [cfg, setCfg] = useState(false);
  const [base, setBase] = useState('');
  const [salvarBase, setSalvarBase] = useState('');
  const [depositoBase, setDepositoBase] = useState('');
  const [pasta, setPasta] = useState(null); // {arquivos} quando aberto o seletor da nuvem
  const [pastaTipo, setPastaTipo] = useState('despesa');
  const [planos, setPlanos] = useState([]);
  const [form, setForm] = useState({ deposito: { valor: '', desc: '' }, despesa: { valor: '', desc: '', plano: '' }, recarga: { valor: '', desc: '' } });
  const setF = (tipo, k, v) => setForm(f => ({ ...f, [tipo]: { ...f[tipo], [k]: v } }));
  const [pend, setPend] = useState({}); // arquivo escolhido (ainda não salvo) por tipo
  const [lendo, setLendo] = useState(''); // tipo que está lendo o valor (OCR)

  useEffect(() => { API.get('/tesouraria/lojas').then(r => { const ls = r.data.lojas || []; setLojas(ls); if (ls.length && !loja) setLoja(ls[0].id); }).catch(() => {}); /* eslint-disable-next-line */ }, [API]);
  useEffect(() => { API.get('/tesouraria/pasta-config').then(r => { setBase(r.data.base || ''); setSalvarBase(r.data.salvarBase || ''); setDepositoBase(r.data.depositoBase || ''); }).catch(() => {}); }, [API]);
  useEffect(() => { API.get('/tesouraria/planos').then(r => setPlanos(r.data.planos || [])).catch(() => {}); }, [API]);

  const carregar = useCallback(() => {
    if (!loja) return;
    API.get(`/tesouraria/dia?loja=${loja}&data=${data}`).then(r => setDia(r.data)).catch(() => setDia(null));
    API.get(`/tesouraria/anexos?loja=${loja}&data=${data}`).then(r => setAnexos(r.data.anexos || [])).catch(() => setAnexos([]));
  }, [API, loja, data]);
  useEffect(() => { carregar(); }, [carregar]);

  // Escolher arquivo/foto: guarda (não envia ainda) e já lê o valor pelo OCR.
  const escolher = async (tipo, file, origem) => {
    if (!file) return;
    const dados = await lerArq(file);
    setPend(p => ({ ...p, [tipo]: { nome: file.name || 'foto.jpg', mime: file.type, dados, origem } }));
    setLendo(tipo);
    try {
      const r = await API.post('/tesouraria/ler-valor', { dados, tipo_mime: file.type });
      if (r.data.ok) {
        // guarda se é nota fiscal (p/ despesa) no item pendente
        setPend(p => ({ ...p, [tipo]: { ...(p[tipo] || {}), fiscal: r.data.ehNf, tipoDoc: r.data.tipoDoc } }));
        if (r.data.valor != null) {
          const jaTinha = form[tipo].valor !== '';
          setForm(f => ({ ...f, [tipo]: { ...f[tipo], valor: (f[tipo].valor === '' ? String(r.data.valor) : f[tipo].valor) } }));
          const det = (r.data.n_valores > 1) ? ` (somei ${r.data.n_valores}: ${r.data.valores.map(brl).join(' + ')})` : '';
          const fisc = tipo === 'despesa' ? (r.data.ehNf ? ' · 📄 nota fiscal' : ' · ⚠️ recibo (não é NF)') : '';
          setMsg('✅ Valor lido: ' + brl(r.data.valor) + det + fisc + (jaTinha ? ' — mantive o que você digitou' : ''));
          setTimeout(() => setMsg(''), 6000);
        }
      }
    } catch (e) { /* OCR é opcional */ } finally { setLendo(''); }
  };
  const salvarPend = async (tipo) => {
    const p = pend[tipo]; if (!p) return;
    const ff = form[tipo] || {};
    const body = { loja_id: loja, data, tipo, descricao: ff.desc || '', valor: ff.valor !== '' ? Number(ff.valor) : null, plano_contas: ff.plano || null, nome: p.nome, tipo_mime: p.mime, dados: p.dados, origem: p.origem, fiscal: p.fiscal, tipo_doc: p.tipoDoc };
    try {
      await API.post('/tesouraria/anexos', body);
      setPend(x => ({ ...x, [tipo]: null }));
      setForm(f => ({ ...f, [tipo]: tipo === 'despesa' ? { valor: '', desc: '', plano: '' } : { valor: '', desc: '' } }));
      setMsg('✅ Anexado.'); carregar(); setTimeout(() => setMsg(''), 2500);
    } catch (e) { setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro ao anexar.')); setTimeout(() => setMsg(''), 6000); }
  };
  const remover = (a) => { if (!window.confirm('Remover este anexo?')) return; API.delete(`/tesouraria/anexos/${a.id}`).then(carregar).catch(() => {}); };
  const ver = (a) => API.get(`/tesouraria/anexo/${a.id}`).then(r => { const w = window.open(); if (w) w.document.write(`<iframe src="${r.data.dados}" style="width:100%;height:100vh;border:0"></iframe>`); }).catch(() => {});
  const salvarCfg = () => API.put('/tesouraria/pasta-config', { base, salvarBase, depositoBase }).then(() => { setMsg('✅ Pastas salvas.'); setTimeout(() => setMsg(''), 2500); }).catch(() => {});
  const abrirPasta = (tipo) => { setPastaTipo(tipo); API.get('/tesouraria/pasta/listar').then(r => setPasta(r.data)).catch(e => { setPasta({ arquivos: [], erro: e.response?.data?.erro || 'Erro' }); }); };
  const importar = (arq) => { const ff = form.despesa || {}; API.post('/tesouraria/pasta/importar', { caminho: arq.caminho, loja_id: loja, data, tipo: pastaTipo, descricao: ff.desc || arq.arquivo, plano_contas: ff.plano || null, valor: ff.valor !== '' ? Number(ff.valor) : null }).then(() => { setMsg('✅ Importado da pasta.'); setPasta(null); carregar(); setTimeout(() => setMsg(''), 2500); }).catch(e => { setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro ao importar.')); setTimeout(() => setMsg(''), 6000); }); };

  const depositos = anexos.filter(a => a.tipo === 'deposito');
  const despesas = anexos.filter(a => a.tipo === 'despesa');
  const recargas = anexos.filter(a => a.tipo === 'recarga');
  const soma = lista => lista.reduce((a, x) => a + (Number(x.valor) || 0), 0);

  const Secao = ({ titulo, tipo, lista, deposito, temPlano }) => {
    const ff = form[tipo] || {};
    const p = pend[tipo];
    return (
      <div style={s.card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>{titulo} <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 12 }}>({lista.length}{lista.length ? ' · ' + brl(soma(lista)) : ''})</span></div>
        {/* 1) escolhe a foto/PDF → lê o valor (OCR). 2) confere valor/plano. 3) salva. */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10, background: '#f8fafc', border: '1px solid #eef2f0', borderRadius: 8, padding: 10 }}>
          <label style={s.lab}>Valor (R$){lendo === tipo && <span style={{ color: '#0d6b5e' }}> · lendo…</span>}<input type="number" step="0.01" style={{ ...s.inp, width: 120 }} value={ff.valor} onChange={e => setF(tipo, 'valor', e.target.value)} placeholder="0,00" /></label>
          {temPlano && <label style={s.lab}>Plano de contas<input list="planosTesDL" style={{ ...s.inp, minWidth: 220 }} value={ff.plano} onChange={e => setF(tipo, 'plano', e.target.value)} placeholder="escolher…" /></label>}
          <label style={s.lab}>Descrição (opcional)<input style={{ ...s.inp, minWidth: 160 }} value={ff.desc} onChange={e => setF(tipo, 'desc', e.target.value)} /></label>
          <div style={{ flex: 1 }} />
          {!p && <>
            <label style={{ ...s.btn, cursor: 'pointer' }}>📎 Anexar<input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={e => escolher(tipo, e.target.files[0], 'anexo')} /></label>
            <label style={{ ...s.btnG, cursor: 'pointer' }}>📷 Foto<input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => escolher(tipo, e.target.files[0], 'foto')} /></label>
            {temPlano && <button style={s.btn} onClick={() => abrirPasta('despesa')}>☁️ Da pasta</button>}
          </>}
          {p && <>
            <span style={{ fontSize: 12, color: '#334155', background: '#eef2f0', borderRadius: 6, padding: '6px 10px' }}>📎 {p.nome.length > 22 ? p.nome.slice(0, 20) + '…' : p.nome}</span>
            <button style={s.btnG} onClick={() => salvarPend(tipo)} disabled={lendo === tipo}>💾 Salvar</button>
            <button style={s.btn} onClick={() => setPend(x => ({ ...x, [tipo]: null }))}>✕</button>
          </>}
        </div>
        {lista.map(a => (
          <div key={a.id} style={s.lanc}>
            <span>{a.tipo_mime === 'application/pdf' ? '📄' : '🖼️'}</span>
            <span style={{ flex: 1 }}>{a.descricao || a.nome}
              {tipo === 'despesa' && a.fiscal != null && <span style={{ fontSize: 11, fontWeight: 600, color: a.fiscal ? '#15803d' : '#b45309' }}> · {a.fiscal ? ('📄 ' + (a.tipo_doc || 'nota fiscal')) : ('⚠️ ' + (a.tipo_doc || 'recibo'))}</span>}
              {a.plano_contas && <span style={{ color: '#64748b', fontSize: 11 }}> · {a.plano_contas}</span>}
              {a.origem === 'pasta' && <span style={{ color: '#0d6b5e', fontSize: 11 }}> · da pasta</span>}
              {a.origem === 'foto' && <span style={{ color: '#b45309', fontSize: 11 }}> · foto</span>}
              {a.arquivo_salvo && <span title={a.arquivo_salvo} style={{ color: '#15803d', fontSize: 11 }}> · 📁 salvo na pasta</span>}</span>
            {a.valor != null && <span style={{ fontWeight: 600 }}>{brl(a.valor)}</span>}
            <button style={{ ...s.btn, padding: '3px 8px', fontSize: 12 }} onClick={() => ver(a)}>ver</button>
            <button style={{ ...s.btn, padding: '3px 8px', fontSize: 12, color: '#b91c1c' }} onClick={() => remover(a)}>🗑</button>
          </div>
        ))}
        {!lista.length && <div style={{ fontSize: 12, color: '#94a3b8', padding: '6px 2px' }}>Nada anexado ainda.</div>}
      </div>
    );
  };

  return (
    <div style={s.wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '6px 0 12px', borderBottom: '1px solid var(--line,#ddd8cf)', marginBottom: 16 }}>
        <h1 style={s.h1}>🏦 Tesouraria</h1>
        <div style={{ flex: 1 }} />
        <button style={s.btn} onClick={() => setCfg(v => !v)}>⚙️ Pasta da nuvem</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--fg-soft,#64748b)', margin: '0 0 16px' }}>Quando os caixas da loja fecham, anexe aqui os <b>depósitos</b> (PDF/foto do comprovante) e as <b>despesas</b> do dia (foto pela câmera ou puxando da pasta da nuvem onde o gerente subiu).</p>

      {cfg && (
        <div style={s.card}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Pasta da nuvem de onde o gerente sobe as fotos de despesa (pra puxar)</div>
          <input style={{ ...s.inp, width: '100%', marginBottom: 10 }} value={base} onChange={e => setBase(e.target.value)} placeholder="C:/Users/.../OneDrive/Despesas Lojas" />
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Pasta das <b>DESPESAS do orçamento</b> (cria <code>ano/mês/loja</code> dentro)</div>
          <input style={{ ...s.inp, width: '100%', marginBottom: 10 }} value={salvarBase} onChange={e => setSalvarBase(e.target.value)} placeholder="C:/Users/.../Notas Fiscais - Orçamento" />
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Pasta dos <b>DEPÓSITOS e RECARGAS</b> (cria <code>ano/mês/loja</code> dentro)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input style={{ ...s.inp, flex: 1, minWidth: 300 }} value={depositoBase} onChange={e => setDepositoBase(e.target.value)} placeholder="C:/Users/.../Controle de Caixa/Depositos" />
            <button style={s.btnG} onClick={salvarCfg}>Salvar</button>
          </div>
        </div>
      )}

      <div style={s.filtros}>
        <label style={s.lab}>Loja<select style={{ ...s.inp, minWidth: 180 }} value={loja} onChange={e => setLoja(e.target.value)}>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        <label style={s.lab}>Dia<input type="date" style={s.inp} value={data} onChange={e => setData(e.target.value)} /></label>
        <button style={s.btn} onClick={carregar}>🔄 Atualizar</button>
        {msg && <span style={{ color: msg.startsWith('⚠️') ? '#b91c1c' : '#15803d', fontSize: 13, fontWeight: 600 }}>{msg}</span>}
      </div>

      {dia && (
        <div style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: dia.todos_fechados ? '#f0fdf4' : '#fffbeb', borderColor: dia.todos_fechados ? '#bbf7d0' : '#fde68a' }}>
          <div style={{ fontSize: 22 }}>{dia.todos_fechados ? '✅' : '⏳'}</div>
          <div>
            <div style={{ fontWeight: 700 }}>{dia.total_caixas === 0 ? 'Nenhum caixa aberto neste dia' : dia.todos_fechados ? 'Todos os caixas fechados — hora de anexar depósitos e despesas' : `${dia.fechados} de ${dia.total_caixas} caixa(s) fechado(s)`}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{dia.n_depositos} depósito(s) · {dia.n_despesas} despesa(s) anexada(s)</div>
          </div>
        </div>
      )}

      <Secao titulo="💰 Depósitos" tipo="deposito" lista={depositos} deposito />
      <Secao titulo="📱 Recargas" tipo="recarga" lista={recargas} />
      <Secao titulo="🧾 Despesas" tipo="despesa" lista={despesas} temPlano />
      <datalist id="planosTesDL">{planos.map(p => <option key={p.id} value={p.nome} />)}</datalist>

      {pasta && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setPasta(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 18, width: 'min(560px,92vw)', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}><b>☁️ Escolher da pasta da nuvem</b><button style={{ ...s.btn, marginLeft: 'auto', padding: '3px 8px' }} onClick={() => setPasta(null)}>✕</button></div>
            {pasta.erro && <div style={{ color: '#b91c1c', fontSize: 13 }}>{pasta.erro} — configure em ⚙️ Pasta da nuvem.</div>}
            {(pasta.arquivos || []).map((f, i) => (
              <div key={i} style={s.lanc}>
                <span>{/\.pdf$/i.test(f.arquivo) ? '📄' : '🖼️'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.pasta + '/' + f.arquivo}>{f.arquivo}</span>
                <button style={s.btnG} onClick={() => importar(f)}>importar</button>
              </div>
            ))}
            {!pasta.erro && !(pasta.arquivos || []).length && <div style={{ fontSize: 13, color: '#94a3b8' }}>Nenhum arquivo na pasta.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
