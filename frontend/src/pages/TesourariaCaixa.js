import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

// Tesouraria — Fechamento do dia: quando os caixas da loja fecham, anexar os DEPÓSITOS (PDF/foto)
// e as DESPESAS (foto pela câmera ou puxando da pasta da nuvem onde o gerente subiu).
// Não trata de quebra/sobra-falta de caixa (isso é outro assunto).

const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hojeStr = new Date().toISOString().slice(0, 10);
const hora = dh => { if (!dh) return '—'; const d = new Date(dh); return isNaN(d) ? '—' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };

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
const ind = {
  box: { border: '1px solid #eef2f0', borderRadius: 10, padding: '9px 11px', background: '#f8fafc' },
  lab: { fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 2 },
  val: { fontSize: 18, fontWeight: 800, color: '#0f172a' },
  sub: { fontSize: 12, fontWeight: 600, color: '#64748b' },
};

export default function TesourariaCaixa({ embed } = {}) {
  const { API } = useAuth();
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  const [data, setData] = useState(hojeStr);
  const [dia, setDia] = useState(null);
  const [geral, setGeral] = useState(null); // visão de todas as lojas do dia (caixas + diferenças + anexos)
  const [painel, setPainel] = useState(null); // indicadores do dia da loja selecionada (cancel/estorno/cartão/atendimento)
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
  const [aberto, setAberto] = useState({}); // seções recolhíveis (Depósitos/Recargas/Despesas)

  useEffect(() => { API.get('/tesouraria/lojas').then(r => { setLojas(r.data.lojas || []); }).catch(() => {}); /* eslint-disable-next-line */ }, [API]);
  useEffect(() => { API.get('/tesouraria/pasta-config').then(r => { setBase(r.data.base || ''); setSalvarBase(r.data.salvarBase || ''); setDepositoBase(r.data.depositoBase || ''); }).catch(() => {}); }, [API]);
  useEffect(() => { API.get('/tesouraria/planos').then(r => setPlanos(r.data.planos || [])).catch(() => {}); }, [API]);

  const carregar = useCallback(() => {
    API.get(`/tesouraria/dia-geral?data=${data}`).then(r => setGeral(r.data.lojas || [])).catch(() => setGeral(null));
    if (!loja) { setPainel(null); return; }
    API.get(`/tesouraria/dia?loja=${loja}&data=${data}`).then(r => setDia(r.data)).catch(() => setDia(null));
    API.get(`/tesouraria/anexos?loja=${loja}&data=${data}`).then(r => setAnexos(r.data.anexos || [])).catch(() => setAnexos([]));
    API.get(`/tesouraria/loja-painel?loja=${loja}&data=${data}`).then(r => setPainel(r.data)).catch(() => setPainel(null));
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
    const open = !!aberto[tipo];
    return (
      <div style={s.card}>
        <div onClick={() => setAberto(a => ({ ...a, [tipo]: !a[tipo] }))} style={{ fontWeight: 700, marginBottom: open ? 10 : 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, userSelect: 'none' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{open ? '▾' : '▸'}</span>{titulo} <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 12 }}>({lista.length}{lista.length ? ' · ' + brl(soma(lista)) : ''})</span>{!open && lista.length > 0 && <span style={{ color: '#15803d', fontSize: 11, fontWeight: 600 }}> ✓ anexado</span>}
        </div>
        {open && (<>
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
        </>)}
      </div>
    );
  };

  return (
    <div style={s.wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: embed ? '0 0 10px' : '6px 0 12px', borderBottom: '1px solid var(--line,#ddd8cf)', marginBottom: 16 }}>
        {!embed && <h1 style={s.h1}>🏦 Tesouraria</h1>}
        {embed && <div style={{ fontWeight: 800, fontSize: 15 }}>📎 Fechamento do dia</div>}
        <div style={{ flex: 1 }} />
        <button style={s.btn} onClick={() => setCfg(v => !v)}>⚙️ Pasta da nuvem</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--fg-soft,#64748b)', margin: '0 0 16px' }}>Entre na loja e veja os <b>caixas do dia</b>; quando fecham, anexe aqui os <b>depósitos</b> (PDF/foto do comprovante), as <b>despesas</b> (foto pela câmera ou da pasta da nuvem) e as <b>recargas</b>.</p>

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
        <label style={s.lab}>Loja<select style={{ ...s.inp, minWidth: 180 }} value={loja} onChange={e => setLoja(e.target.value)}><option value="">Todas as lojas</option>{lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        <label style={s.lab}>Dia<input type="date" style={s.inp} value={data} onChange={e => setData(e.target.value)} /></label>
        <button style={s.btn} onClick={carregar}>🔄 Atualizar</button>
        {msg && <span style={{ color: msg.startsWith('⚠️') ? '#b91c1c' : '#15803d', fontSize: 13, fontWeight: 600 }}>{msg}</span>}
      </div>

      {/* Visão de TODAS as lojas do dia, lado a lado: caixas + diferenças (só visualizar) + anexos. Clique numa loja p/ anexar. */}
      {geral && geral.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 10, marginBottom: 16 }}>
          {geral.filter(g => !loja || g.loja_id === loja).map(g => {
            const sel = g.loja_id === loja;
            const okFech = g.todos_fechados;
            return (
              <div key={g.loja_id} onClick={() => setLoja(g.loja_id)} title="Clique para anexar nesta loja"
                style={{ cursor: 'pointer', border: '1px solid ' + (sel ? '#0d6b5e' : '#e5e7eb'), borderRadius: 12, padding: 12, background: sel ? '#f0fdf9' : '#fff', boxShadow: sel ? '0 0 0 2px #0d6b5e22' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <b style={{ fontSize: 13.5 }}>{g.loja_nome}</b>
                  <span style={{ fontSize: 11, fontWeight: 700, color: g.total_caixas === 0 ? '#94a3b8' : okFech ? '#15803d' : '#b45309' }}>
                    {g.total_caixas === 0 ? 'sem caixa' : okFech ? '✅ fechados' : `⏳ ${g.fechados}/${g.total_caixas}`}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', margin: '3px 0 7px' }}>💰 {g.n_depositos} · 🧾 {g.n_despesas} · 📱 {g.n_recargas}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: g.n_diferencas ? '#b91c1c' : '#15803d', marginBottom: g.n_diferencas ? 4 : 0 }}>
                  {g.n_diferencas ? `⚠️ ${g.n_diferencas} diferença(s)${g.n_relevantes ? ` · ${g.n_relevantes} acima do limite` : ''}` : '✅ sem diferença'}
                </div>
                {(g.diferencas || []).slice(0, 6).map((d, i) => (
                  <div key={i} style={{ fontSize: 11.5, display: 'flex', justifyContent: 'space-between', gap: 8, color: d.relevante ? '#b91c1c' : '#475569' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.operador || '—'}{d.login ? ` · ${d.login}` : ''}</span>
                    <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{d.tipo === 'falta' ? '▼' : '▲'} {brl(Math.abs(d.valor))}</span>
                  </div>
                ))}
                {(g.diferencas || []).length > 6 && <div style={{ fontSize: 11, color: '#94a3b8' }}>+{g.diferencas.length - 6} mais…</div>}
              </div>
            );
          })}
        </div>
      )}

      {loja && dia && (
        <div style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: dia.todos_fechados ? '#f0fdf4' : '#fffbeb', borderColor: dia.todos_fechados ? '#bbf7d0' : '#fde68a' }}>
          <div style={{ fontSize: 22 }}>{dia.todos_fechados ? '✅' : '⏳'}</div>
          <div>
            <div style={{ fontWeight: 700 }}>{dia.total_caixas === 0 ? 'Nenhum caixa aberto neste dia' : dia.todos_fechados ? 'Todos os caixas fechados — hora de anexar depósitos e despesas' : `${dia.fechados} de ${dia.total_caixas} caixa(s) fechado(s)`}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{dia.n_depositos} depósito(s) · {dia.n_despesas} despesa(s) · {dia.n_recargas || 0} recarga(s) anexada(s)</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {dia && (dia.sessoes || []).length > 0 && (
        <div style={{ ...s.card, flex: '1 1 360px', marginBottom: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>🧰 Caixas do dia</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '2px solid #eef1f4' }}>
                {['Caixa', 'Operador', 'Abertura', 'Fechamento', 'Situação'].map(h => <th key={h} style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{h}</th>)}
              </tr></thead>
              <tbody>{(dia.sessoes || []).map(sx => (
                <tr key={sx.id} style={{ borderTop: '1px solid #f2f2f2' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>#{sx.caixa || sx.pdv || '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{sx.operador || '—'}{sx.login ? <span style={{ color: '#aaa' }}> · {sx.login}</span> : ''}</td>
                  <td style={{ padding: '6px 8px', color: '#475569' }}>{hora(sx.inicio)}</td>
                  <td style={{ padding: '6px 8px', color: '#475569' }}>{sx.fechado ? hora(sx.fim) : '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{sx.fechado
                    ? <span style={{ color: '#15803d', fontWeight: 700 }}>✅ fechado</span>
                    : <span style={{ color: '#b45309', fontWeight: 700 }}>⏳ aberto</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {loja && painel && (
        <div style={{ ...s.card, flex: '1 1 320px', marginBottom: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>📊 Indicadores do dia <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 12 }}>— {lojas.find(l => l.id === loja)?.nome || ''}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>
            <div style={ind.box}><div style={ind.lab}>🚫 Cancelamentos</div><div style={ind.val}>{painel.cancelamentos.qtd}{painel.cancelamentos.taxa != null ? <span style={ind.sub}> · {painel.cancelamentos.taxa}%</span> : ''}</div>{painel.cancelamentos.fora > 0 && <div style={{ fontSize: 11.5, color: '#b91c1c', fontWeight: 700 }}>⏰ {painel.cancelamentos.fora} fora do horário{painel.cancelamentos.valorFora ? ` · ${brl(painel.cancelamentos.valorFora)}` : ''}</div>}</div>
            <div style={ind.box}><div style={ind.lab}>↩️ Estornos</div><div style={ind.val}>{painel.estornos.qtd}{painel.estornos.taxa != null ? <span style={ind.sub}> · {painel.estornos.taxa}%</span> : ''}</div></div>
            <div style={ind.box}><div style={ind.lab}>💳 Erros de cartão</div><div style={ind.val}>{painel.cartaoErros.qtd}</div>{painel.cartaoErros.trocaDeForma > 0 && <div style={{ fontSize: 11.5, color: '#b45309' }}>{painel.cartaoErros.trocaDeForma} troca de forma</div>}</div>
            <div style={ind.box}><div style={ind.lab}>🏅 Atendimento (top)</div>{painel.atendimento ? <><div style={{ fontWeight: 700, fontSize: 13 }}>{painel.atendimento.operador}</div><div style={{ fontSize: 11.5, color: '#475569' }}>{painel.atendimento.cupons} cupons · {brl(painel.atendimento.valor)}</div></> : <div style={{ color: '#94a3b8', fontSize: 12 }}>—</div>}</div>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Cancelamentos/estornos e erros de cartão são só para acompanhamento da gestão. O detalhe fica nas abas Cancelamentos, Diferenças e Atendimento do caixa.</div>
        </div>
      )}
      </div>

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
