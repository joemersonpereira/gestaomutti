import React, { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import Banner, { bannerBtn } from '../components/Banner';

const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const hoje = new Date();
const LGPD = 'Autorizo o registro dos meus dados e do serviço realizado para fins de atendimento e histórico farmacêutico, conforme a LGPD. Os dados são usados apenas internamente para o meu cuidado.';

export default function ServicosFarmaceuticos() {
  const { API, usuario } = useAuth();
  const [aba, setAba] = useState('registro');
  const [gestao, setGestao] = useState(false);
  useEffect(() => { API.get('/servicos-farmaceuticos').then(r => setGestao(!!r.data.gestao)).catch(() => {}); }, [API]);
  return (
    <div style={s.wrap}>
      <Banner emoji="🩺" titulo="Cuidado Farmacêutico" cor="ciano" sub="Atendimento, anamnese, agenda e histórico do paciente — com intercorrências, termo e LGPD." />
      <div style={{ display: 'flex', gap: 6, margin: '2px 0 12px', flexWrap: 'wrap' }}>
        {[['registro', '📋 Atendimento & histórico'], ['agenda', '📅 Agenda'], ['pacientes', '🧑‍⚕️ Pacientes'], ...(gestao ? [['catalogo', '🗂️ Catálogo']] : [])].map(([v, l]) => (
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>
        ))}
      </div>
      {aba === 'registro' && <Registro API={API} usuario={usuario} gestao={gestao} />}
      {aba === 'agenda' && <Agenda API={API} gestao={gestao} />}
      {aba === 'pacientes' && <Pacientes API={API} />}
      {aba === 'catalogo' && gestao && <Catalogo API={API} />}
    </div>
  );
}

// ── Busca de produto no ERP (identifica o item; lote/validade seguem manuais) ──
function BuscaProdutoErp({ API, onPick }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState([]); const [busy, setBusy] = useState(false); const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      try { const r = await API.get('/servicos-farmaceuticos/erp/produtos?q=' + encodeURIComponent(q.trim())); setRes(r.data.produtos || []); setAberto(true); }
      catch { setRes([]); } finally { setBusy(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q, API]);
  return (
    <div style={{ position: 'relative', marginBottom: 8 }}>
      <input placeholder="🔎 Buscar produto no ERP (nome ou código de barras)" value={q} onChange={e => setQ(e.target.value)} onFocus={() => res.length && setAberto(true)} style={s.inp} />
      {busy && <div style={{ fontSize: 10.5, color: '#999', marginTop: -4 }}>buscando…</div>}
      {aberto && res.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 20, top: 40, left: 0, right: 0, background: '#fff', border: '1px solid #cfe4e8', borderRadius: 8, maxHeight: 220, overflowY: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,.12)' }}>
          {res.map((p, i) => (
            <div key={i} onClick={() => { onPick(p); setQ(''); setRes([]); setAberto(false); }} style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: 12.5 }}
              onMouseEnter={e => e.currentTarget.style.background = '#F2FAFB'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              <div style={{ fontWeight: 600 }}>{p.descricao}</div>
              <div style={{ fontSize: 10.5, color: '#888' }}>{p.ean ? `EAN ${p.ean}` : ''}{p.marca ? ` · ${p.marca}` : ''}{p.precovenda ? ` · ${brl(p.precovenda)}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Busca da venda pelo COO do cupom → mostra os itens p/ escolher o produto ───
function BuscaCoo({ API, lojaId, onPick }) {
  const [coo, setCoo] = useState(''); const [vendas, setVendas] = useState(null); const [busy, setBusy] = useState(false);
  async function buscar() {
    const c = (coo || '').replace(/\D/g, ''); if (!c) return;
    setBusy(true);
    try { const r = await API.get('/servicos-farmaceuticos/erp/venda-coo?coo=' + c + (lojaId ? '&loja_id=' + lojaId : '')); setVendas(r.data.vendas || []); }
    catch { setVendas([]); } finally { setBusy(false); }
  }
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input placeholder="Nº do COO do cupom" value={coo} onChange={e => setCoo(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), buscar())} style={{ ...s.inp, flex: 1, marginBottom: 0 }} />
        <button type="button" onClick={buscar} disabled={busy} style={{ ...s.chip, ...s.chipOn, marginBottom: 0 }}>{busy ? '…' : 'Buscar cupom'}</button>
      </div>
      {vendas && vendas.length === 0 && <div style={{ fontSize: 11, color: '#B4571A', marginTop: 5 }}>Nenhum cupom com esse COO nesta loja.</div>}
      {vendas && vendas.map((v, i) => (
        <div key={i} style={{ marginTop: 6, border: '1px solid #d7ecef', borderRadius: 8, padding: '7px 10px', background: '#fff' }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Cupom COO {v.coo} · {dBR(v.data)} · {brl(v.valor)} — clique no item aplicado:</div>
          {v.itens.map((it, j) => (
            <div key={j} onClick={() => onPick(v.coo, it)} style={{ padding: '4px 6px', cursor: 'pointer', borderRadius: 6, fontSize: 12 }}
              onMouseEnter={e => e.currentTarget.style.background = '#F2FAFB'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              💉 <b>{it.descricao}</b> <span style={{ color: '#888' }}>× {it.quantidade} · {brl(it.valor)}</span>
            </div>
          ))}
          <div onClick={() => onPick(v.coo, null)} style={{ padding: '4px 6px', cursor: 'pointer', fontSize: 11, color: '#0E7C86' }}
            onMouseEnter={e => e.currentTarget.style.background = '#F2FAFB'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            ↳ só vincular o COO (sem escolher item)
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Busca de cliente no ERP para importar como paciente ──────────────────────
function BuscaClienteErp({ API, onPick }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState([]); const [busy, setBusy] = useState(false); const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (q.trim().length < 3) { setRes([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      try { const r = await API.get('/servicos-farmaceuticos/erp/clientes?q=' + encodeURIComponent(q.trim())); setRes(r.data.clientes || []); setAberto(true); }
      catch { setRes([]); } finally { setBusy(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [q, API]);
  return (
    <div style={{ position: 'relative', marginBottom: 8 }}>
      <input placeholder="📇 Importar cliente do ERP (nome ou CPF)" value={q} onChange={e => setQ(e.target.value)} onFocus={() => res.length && setAberto(true)} style={{ ...s.inp, marginBottom: 0, borderColor: '#cbb6e0', background: '#FCFAFF' }} />
      {busy && <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>buscando…</div>}
      {aberto && res.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 20, top: 40, left: 0, right: 0, background: '#fff', border: '1px solid #d9c9ec', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,.12)' }}>
          {res.map((c, i) => (
            <div key={i} onClick={() => { onPick(c); setQ(''); setRes([]); setAberto(false); }} style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: 12.5 }}
              onMouseEnter={e => e.currentTarget.style.background = '#FAF6FD'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              <div style={{ fontWeight: 600 }}>{c.nome}</div>
              <div style={{ fontSize: 10.5, color: '#888' }}>{c.cpf ? `CPF ${c.cpf}` : ''}{c.telefone ? ` · ${c.telefone}` : ''}{c.nascimento ? ` · ${dBR(c.nascimento)}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Monta um link wa.me a partir de um telefone brasileiro (adiciona DDI 55 se faltar).
function waLink(telefone, texto) {
  let d = (telefone || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}

// ── Cartão pós-registro: QR/link para o paciente avaliar o atendimento ────────
function QrAvaliacao({ salvo, onClose }) {
  const [copiado, setCopiado] = useState(false);
  const link = `${window.location.origin}/avaliar-atendimento?s=${salvo.id}`;
  const wa = waLink(salvo.telefone, `Olá${salvo.nome ? ' ' + salvo.nome.split(' ')[0] : ''}! Como foi seu atendimento hoje? Avalie aqui, leva 10 segundos: ${link}`);
  function copiar() { navigator.clipboard?.writeText(link).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }); }
  return (
    <div style={{ ...s.card, borderLeft: '4px solid #1E824C', background: '#F3FBF6', textAlign: 'center' }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1E824C' }}>✓ Atendimento registrado!</div>
      <div style={{ fontSize: 11.5, color: '#555', margin: '2px 0 10px' }}>Peça ao paciente para avaliar — aponte a câmera no QR ou envie o link.</div>
      <div style={{ background: '#fff', display: 'inline-block', padding: 10, borderRadius: 10, border: '1px solid #dfeee6' }}>
        <QRCodeSVG value={link} size={132} />
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginTop: 10 }}>
        <button onClick={copiar} style={{ ...s.chip, ...s.chipOn }}>{copiado ? '✓ Link copiado' : '📋 Copiar link'}</button>
        {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ ...s.chip, background: '#25D366', color: '#fff', border: 'none', textDecoration: 'none' }}>💬 Enviar no WhatsApp</a>}
        <button onClick={onClose} style={s.chip}>Fechar</button>
      </div>
    </div>
  );
}

// ── Registro de serviço (com paciente + anamnese + termo) ────────────────────
function Registro({ API, usuario, gestao }) {
  const [d, setD] = useState(null);
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [tipos, setTipos] = useState([]);
  const [reg, setReg] = useState(false);
  const [lojas, setLojas] = useState([]); const [colabs, setColabs] = useState([]);
  const [pac, setPac] = useState(null); // paciente selecionado
  const [ciente, setCiente] = useState(false); // deu ciência dos alertas do paciente
  const [maisClinico, setMaisClinico] = useState(false);
  const [salvo, setSalvo] = useState(null); // { id, telefone, nome } → cartão do QR de avaliação
  const [form, setForm] = useState({ tipo: '', valor: '', comentario: '', obs: '', intercorrencia: '', retorno: '', resultado: '', produto: '', lote: '', validade: '', coo: '', crm: '', receita_data: '', receita_anexo: '', data: hoje.toISOString().slice(0, 10), colaborador_id: '', loja_id: '', termo_aceito: false });
  useEffect(() => { setCiente(false); }, [pac?.id]);
  const idade = pac?.nascimento ? Math.floor((Date.now() - new Date(pac.nascimento).getTime()) / (365.25 * 864e5)) : null;
  function anexarReceita(e) { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setForm(v => ({ ...v, receita_anexo: r.result })); r.readAsDataURL(f); }
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/servicos-farmaceuticos', { params: { mes, ano } }).then(r => setD(r.data)).catch(() => setD({ servicos: [], resumo: {} })), [API, mes, ano]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/servicos-farmaceuticos/tipos').then(r => setTipos(r.data.tipos || [])).catch(() => {}); }, [API]);
  useEffect(() => { if (!gestao) return; API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || [])); API.get('/colaboradores').then(r => setColabs(r.data.colaboradores || [])); }, [API, gestao]);

  const tipoSel = tipos.find(t => t.nome === form.tipo);
  function escolherTipo(nome) { const t = tipos.find(x => x.nome === nome); setForm({ ...form, tipo: nome, valor: t && t.valor_padrao ? String(t.valor_padrao) : form.valor, termo_aceito: false }); }
  async function salvar(e) {
    e.preventDefault();
    if (!form.tipo) { setMsg('Escolha o serviço.'); return; }
    if (tipoSel?.exige_termo && !form.termo_aceito) { setMsg('É preciso aceitar o termo de responsabilidade deste serviço.'); return; }
    const r = await API.post('/servicos-farmaceuticos', { ...form, paciente_id: pac?.id || null, cliente: pac?.nome || undefined });
    const pacInfo = { telefone: pac?.telefone || '', nome: pac?.nome || '' };
    setForm({ tipo: '', valor: '', comentario: '', obs: '', intercorrencia: '', retorno: '', resultado: '', produto: '', lote: '', validade: '', coo: '', crm: '', receita_data: '', receita_anexo: '', data: hoje.toISOString().slice(0, 10), colaborador_id: '', loja_id: '', termo_aceito: false });
    setPac(null); setCiente(false); setMaisClinico(false); setReg(false); setMsg('');
    if (r.data?.id) setSalvo({ id: r.data.id, ...pacInfo });
    carregar();
  }
  async function remover(id) { await API.delete(`/servicos-farmaceuticos/${id}`); carregar(); }
  const R = d?.resumo || {};

  return (
    <>
      {salvo && <QrAvaliacao salvo={salvo} onClose={() => setSalvo(null)} />}
      <button onClick={() => setReg(v => !v)} style={{ ...s.btn, marginBottom: 12 }}>{reg ? '✕ Cancelar' : '+ Novo atendimento'}</button>

      {reg && (
        <form onSubmit={salvar} style={{ ...s.card, borderLeft: '4px solid #0E7C86' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>1. Paciente</div>
          <PacientePicker API={API} pac={pac} onPick={setPac} />

          {pac?._historico?.length > 0 && (
            <div style={{ background: '#F7F9FB', border: '1px solid #eef1f4', borderRadius: 8, padding: '8px 11px', margin: '8px 0' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>📚 Histórico de {pac.nome} ({pac._historico.length})</div>
              {pac._historico.slice(0, 5).map(h => (
                <div key={h.id} style={{ fontSize: 11.5, color: '#555', padding: '2px 0', borderTop: '1px solid #f2f2f2' }}>💉 {h.tipo} · {dBR(h.data)}{h.resultado ? <span style={{ color: '#0E5C33', fontWeight: 600 }}> · 📊 {h.resultado}</span> : ''}{h.intercorrencia ? <span style={{ color: '#C0392B', fontWeight: 600 }}> · ⚠️ {h.intercorrencia}</span> : ''}</div>
              ))}
              {pac._historico.length > 5 && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>+ {pac._historico.length - 5} anteriores — ver todos na aba Pacientes</div>}
            </div>
          )}

          {pac && !ciente && (
            <div style={{ background: '#FFF3F0', border: '2px solid #E24B4A', borderRadius: 10, padding: '12px 14px', margin: '12px 0' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#C0392B' }}>🚨 Antes de atender — confira os alertas do paciente</div>
              <div style={{ fontSize: 13, color: '#333', lineHeight: 1.8, marginTop: 6 }}>
                {idade != null && <div>🎂 Idade: <b>{idade} anos</b>{(idade < 12 || idade >= 60) ? ' — atenção especial' : ''}</div>}
                {pac.alergias ? <div style={{ color: '#C0392B', fontWeight: 700 }}>⚠️ Alergias: {pac.alergias}</div> : <div style={{ color: '#999' }}>Sem alergias registradas.</div>}
                {pac.condicoes && <div>🩺 Condições: {pac.condicoes}</div>}
                {pac.medicamentos && <div>💊 Medicamentos em uso: {pac.medicamentos}</div>}
                {pac._alertas?.length > 0 && <div style={{ color: '#C0392B' }}>🚨 Intercorrências anteriores: {pac._alertas.map(a => `${a.texto} (${a.tipo})`).join(' · ')}</div>}
              </div>
              <button type="button" onClick={() => setCiente(true)} style={{ ...s.btn, background: '#C0392B', marginTop: 10 }}>✓ Estou ciente — seguir o atendimento</button>
            </div>
          )}

          {(!pac || ciente) && (<>
          <div style={{ fontSize: 14, fontWeight: 700, margin: '14px 0 8px' }}>2. Serviço</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={form.tipo} onChange={e => escolherTipo(e.target.value)} style={{ ...s.inp, flex: 1, minWidth: 180 }}>
              <option value="">Escolha o serviço…</option>
              {tipos.map(t => <option key={t.id} value={t.nome}>{t.nome}{t.valor_padrao > 0 ? ` · ${brl(t.valor_padrao)}` : ''}</option>)}
            </select>
            <input type="number" step="0.01" placeholder="Valor (R$)" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} style={{ ...s.inp, width: 130 }} />
            <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} style={{ ...s.inp, width: 150 }} />
          </div>
          {gestao && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={form.colaborador_id} onChange={e => setForm({ ...form, colaborador_id: e.target.value })} style={{ ...s.inp, flex: 1, minWidth: 180 }}>
                <option value="">Quem realizou (padrão: você)…</option>
                {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ` · ${c.funcao}` : ''}</option>)}
              </select>
              <select value={form.loja_id} onChange={e => setForm({ ...form, loja_id: e.target.value })} style={{ ...s.inp, flex: 1, minWidth: 150 }}>
                <option value="">Loja (padrão: a do colaborador)…</option>
                {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
          )}
          <textarea placeholder="Comentário do atendimento (o que foi feito, observações clínicas…)" value={form.comentario} onChange={e => setForm({ ...form, comentario: e.target.value })} style={{ ...s.inp, minHeight: 60, resize: 'vertical' }} />
          <input placeholder="⚠️ Intercorrência / alerta importante (ex.: teve vômitos, reação, tontura…) — opcional" value={form.intercorrencia} onChange={e => setForm({ ...form, intercorrencia: e.target.value })} style={{ ...s.inp, borderColor: form.intercorrencia ? '#E24B4A' : '#ddd' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: '#666' }}>📅 Marcar retorno para:</label>
            <input type="date" value={form.retorno} onChange={e => setForm({ ...form, retorno: e.target.value })} style={{ ...s.inp, width: 160, marginBottom: 0 }} />
            <span style={{ fontSize: 11, color: '#999' }}>(entra na Agenda)</span>
          </div>
          <input placeholder="Resultado (ex.: 120/80 mmHg · glicemia 90 mg/dL) — para acompanhamento" value={form.resultado} onChange={e => setForm({ ...form, resultado: e.target.value })} style={s.inp} />
          <button type="button" onClick={() => setMaisClinico(v => !v)} style={{ ...s.chip, marginBottom: 8 }}>{maisClinico ? '− menos' : '+ Produto aplicado / COO / receita'}</button>
          {maisClinico && (
            <div style={{ background: '#F7FBFC', border: '1px solid #d7ecef', borderRadius: 8, padding: '8px 11px', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Produto aplicado (injetáveis)</div>
              <BuscaProdutoErp API={API} onPick={p => setForm(f => ({ ...f, produto: p.descricao }))} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input placeholder="Produto" value={form.produto} onChange={e => setForm({ ...form, produto: e.target.value })} style={{ ...s.inp, flex: 1, minWidth: 160 }} />
                <input placeholder="Lote" value={form.lote} onChange={e => setForm({ ...form, lote: e.target.value })} style={{ ...s.inp, width: 120 }} />
                <input type="date" title="Validade" value={form.validade} onChange={e => setForm({ ...form, validade: e.target.value })} style={{ ...s.inp, width: 150 }} />
              </div>
              <div style={{ fontSize: 10.5, color: '#999', margin: '2px 0 8px' }}>Lote e validade você lê da embalagem física e digita — o resto o ERP preenche.</div>
              <div style={{ fontSize: 12, fontWeight: 700, margin: '6px 0' }}>Vincular à venda pelo COO do cupom fiscal</div>
              <BuscaCoo API={API} lojaId={form.loja_id} onPick={(coo, item) => setForm(f => ({ ...f, coo, produto: item ? item.descricao : f.produto }))} />
              <input placeholder="COO do cupom fiscal — vínculo com a venda" value={form.coo} onChange={e => setForm({ ...form, coo: e.target.value })} style={s.inp} />
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Receita (se houver)</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input placeholder="CRM do médico" value={form.crm} onChange={e => setForm({ ...form, crm: e.target.value })} style={{ ...s.inp, flex: 1, minWidth: 140 }} />
                <input type="date" title="Data da receita" value={form.receita_data} onChange={e => setForm({ ...form, receita_data: e.target.value })} style={{ ...s.inp, width: 150 }} />
              </div>
              <label style={{ fontSize: 12, color: '#185FA5', cursor: 'pointer' }}>📎 Anexar cópia da receita<input type="file" accept="image/*,application/pdf" onChange={anexarReceita} style={{ display: 'none' }} /></label>
              {form.receita_anexo && <span style={{ fontSize: 11, color: '#3B6D11', marginLeft: 8 }}>✓ receita anexada</span>}
            </div>
          )}

          {tipoSel?.exige_termo && (
            <div style={{ background: '#FBF3E0', border: '1px solid #F0E0B8', borderRadius: 8, padding: '8px 11px', marginBottom: 8 }}>
              <div style={{ fontSize: 11.5, color: '#7a5307', whiteSpace: 'pre-wrap', marginBottom: 6 }}>📄 <b>Termo de responsabilidade:</b> {tipoSel.termo_texto || 'Serviço realizado por profissional habilitado, mediante autorização do paciente.'}</div>
              <label style={{ display: 'flex', gap: 6, fontSize: 12, alignItems: 'center' }}><input type="checkbox" checked={form.termo_aceito} onChange={e => setForm({ ...form, termo_aceito: e.target.checked })} /> Aceite presencial (o atendente confirma que informou e o paciente concordou).</label>
              <div style={{ fontSize: 11, color: '#7a5307', margin: '6px 0 4px' }}>— ou colher a <b>assinatura do paciente</b> online:</div>
              <AssinaturaOnline API={API} paciente={pac} tipo={form.tipo} termoTexto={tipoSel.termo_texto || 'Serviço realizado por profissional habilitado, mediante autorização do paciente.'} onAssinado={() => setForm(f => ({ ...f, termo_aceito: true }))} />
            </div>
          )}
          <div style={{ fontSize: 10.5, color: '#999', marginBottom: 8 }}>ℹ️ Todo atendimento registra o consentimento LGPD do paciente (uso interno dos dados para o cuidado).</div>
          {msg && <div style={{ fontSize: 12, color: '#C0392B', marginBottom: 6 }}>{msg}</div>}
          <button style={s.btn}>Registrar atendimento</button>
          </>)}
        </form>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '2px 2px 12px', flexWrap: 'wrap' }}>
        <select value={mes} onChange={e => setMes(Number(e.target.value))} style={{ ...s.inp, width: 'auto', marginBottom: 0 }}>
          {['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...s.inp, width: 'auto', marginBottom: 0 }}>{[0, 1].map(i => { const y = hoje.getFullYear() - i; return <option key={y} value={y}>{y}</option>; })}</select>
        {d && <span style={{ fontSize: 12, color: '#666', marginLeft: 'auto' }}><b>{R.total || 0}</b> atendimentos · {brl(R.valorTotal || 0)}{R.satisfacao?.avaliados ? <> · ⭐ <b>{R.satisfacao.media}</b>/5 ({R.satisfacao.avaliados} avaliaç{R.satisfacao.avaliados > 1 ? 'ões' : 'ão'})</> : ''}</span>}
      </div>

      {d && (R.porColaborador?.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10, marginBottom: 12 }}>
          <div style={s.card}><div style={s.h}>Por profissional</div>{(R.porColaborador || []).map(c => <div key={c.nome} style={s.row}><span>{c.nome}</span><span><b>{c.qtd}</b>{c.valor > 0 ? ` · ${brl(c.valor)}` : ''}</span></div>)}</div>
          <div style={s.card}><div style={s.h}>Por tipo</div>{(R.porTipo || []).map(t => <div key={t.tipo} style={s.row}><span>{t.tipo}</span><b>{t.qtd}</b></div>)}</div>
        </div>
      )}

      {d && d.servicos.length === 0 && <div style={{ ...s.card, textAlign: 'center', color: '#999' }}>Nenhum atendimento neste mês.</div>}
      {d && d.servicos.map(sv => (
        <div key={sv.id} style={{ ...s.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 14px' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>💉 {sv.tipo}{sv.valor > 0 ? <span style={{ fontSize: 11.5, color: '#1E874B', fontWeight: 600 }}> · {brl(sv.valor)}</span> : ''}{sv.termo_aceito ? <span style={{ fontSize: 10, color: '#7a5307', background: '#FBF0DA', borderRadius: 5, padding: '1px 6px', marginLeft: 6 }}>📄 termo ok</span> : ''}{sv.nota_avaliacao ? <span style={{ fontSize: 10, color: '#946c00', background: '#FEF6D8', borderRadius: 5, padding: '1px 6px', marginLeft: 6 }}>⭐ {sv.nota_avaliacao}/5</span> : ''}</div>
            <div style={{ fontSize: 11.5, color: '#999', marginTop: 2 }}>{sv.paciente_nome ? `👤 ${sv.paciente_nome} · ` : ''}{sv.colaborador_nome}{sv.loja_nome ? ` · ${sv.loja_nome}` : ''} · {dBR(sv.data)}{sv.comentario ? ` · ${sv.comentario}` : ''}</div>
            {sv.intercorrencia && <div style={{ fontSize: 11.5, color: '#C0392B', fontWeight: 600, marginTop: 2 }}>⚠️ {sv.intercorrencia}</div>}
          </div>
          {(gestao || sv.colaborador_id === usuario.id) && <button onClick={() => remover(sv.id)} style={s.del}>remover</button>}
        </div>
      ))}
    </>
  );
}

// ── Seletor/criador de paciente com anamnese ─────────────────────────────────
function PacientePicker({ API, pac, onPick }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState([]); const [novo, setNovo] = useState(null);
  const buscar = v => { setQ(v); if (v.trim().length >= 2) API.get('/servicos-farmaceuticos/pacientes', { params: { q: v } }).then(r => setRes(r.data.pacientes || [])); else setRes([]); };
  async function salvarNovo() {
    if (!novo.nome?.trim()) return;
    const r = await API.post('/servicos-farmaceuticos/pacientes', { ...novo, consent_lgpd: novo.consent_lgpd ? 1 : 0 });
    onPick({ ...novo, id: r.data.id }); setNovo(null); setQ(''); setRes([]);
  }
  if (pac) return (
    <div style={{ background: '#EAF7F0', border: '1px solid #B7E3D4', borderRadius: 8, padding: '8px 11px', marginBottom: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>👤 {pac.nome} <button type="button" onClick={() => onPick(null)} style={{ ...s.del, marginLeft: 6 }}>trocar</button></div>
      {(pac.alergias || pac.medicamentos || pac.condicoes) && <div style={{ fontSize: 11, color: '#0F766E', marginTop: 2 }}>{pac.alergias ? `⚠️ Alergias: ${pac.alergias}. ` : ''}{pac.medicamentos ? `💊 Uso: ${pac.medicamentos}. ` : ''}{pac.condicoes ? `🩺 ${pac.condicoes}.` : ''}</div>}
      {pac._alertas?.length > 0 && <div style={{ fontSize: 11, color: '#C0392B', fontWeight: 600, marginTop: 2 }}>🚨 Intercorrências anteriores: {pac._alertas.map(a => `${a.texto} (${a.tipo}, ${dBR(a.data)})`).join(' · ')}</div>}
      <div style={{ fontSize: 10.5, color: '#0F766E', marginTop: 2 }}>Anamnese salva — não precisa preencher de novo nas próximas visitas.</div>
    </div>
  );
  if (novo) return (
    <div style={{ ...s.card, marginBottom: 4, background: '#FbFdFf' }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Novo paciente + anamnese</div>
      <BuscaClienteErp API={API} onPick={c => setNovo(n => ({ ...n, nome: c.nome, cpf: c.cpf || n.cpf, telefone: c.telefone || n.telefone, nascimento: c.nascimento || n.nascimento }))} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Nome *" value={novo.nome || ''} onChange={e => setNovo({ ...novo, nome: e.target.value })} style={{ ...s.inp, flex: 1, minWidth: 160 }} />
        <input placeholder="CPF" value={novo.cpf || ''} onChange={e => setNovo({ ...novo, cpf: e.target.value })} style={{ ...s.inp, width: 140 }} />
        <input placeholder="Telefone" value={novo.telefone || ''} onChange={e => setNovo({ ...novo, telefone: e.target.value })} style={{ ...s.inp, width: 140 }} />
        <input type="date" title="Nascimento" value={novo.nascimento || ''} onChange={e => setNovo({ ...novo, nascimento: e.target.value })} style={{ ...s.inp, width: 150 }} />
      </div>
      <input placeholder="Alergias" value={novo.alergias || ''} onChange={e => setNovo({ ...novo, alergias: e.target.value })} style={s.inp} />
      <input placeholder="Medicamentos em uso" value={novo.medicamentos || ''} onChange={e => setNovo({ ...novo, medicamentos: e.target.value })} style={s.inp} />
      <input placeholder="Condições / comorbidades (diabetes, hipertensão…)" value={novo.condicoes || ''} onChange={e => setNovo({ ...novo, condicoes: e.target.value })} style={s.inp} />
      <label style={{ display: 'flex', gap: 6, fontSize: 11.5, alignItems: 'flex-start', marginBottom: 8 }}><input type="checkbox" checked={!!novo.consent_lgpd} onChange={e => setNovo({ ...novo, consent_lgpd: e.target.checked })} style={{ marginTop: 2 }} /> <span>{LGPD}</span></label>
      <div style={{ display: 'flex', gap: 6 }}><button type="button" onClick={salvarNovo} style={s.btn}>Salvar paciente</button><button type="button" onClick={() => setNovo(null)} style={s.chip}>Cancelar</button></div>
    </div>
  );
  return (
    <div style={{ position: 'relative', marginBottom: 4 }}>
      <input placeholder="🔎 buscar paciente por nome / CPF / telefone…" value={q} onChange={e => buscar(e.target.value)} style={s.inp} />
      {res.length > 0 && <div style={{ position: 'absolute', zIndex: 6, background: '#fff', border: '1px solid #eee', borderRadius: 8, width: '100%', maxHeight: 180, overflowY: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,.12)' }}>
        {res.map(p => <div key={p.id} onClick={() => { API.get(`/servicos-farmaceuticos/pacientes/${p.id}`).then(r => onPick({ ...r.data.paciente, _alertas: r.data.alertas, _historico: r.data.historico })); setRes([]); setQ(''); }} style={{ padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}>{p.nome}{p.cpf ? ` · ${p.cpf}` : ''}{p.telefone ? ` · ${p.telefone}` : ''}</div>)}
      </div>}
      <button type="button" onClick={() => setNovo({})} style={{ ...s.chip, marginTop: 6 }}>+ Novo paciente</button>
      <span style={{ fontSize: 11, color: '#999', marginLeft: 8 }}>ou registre sem paciente (atendimento avulso)</span>
    </div>
  );
}

// ── Aba Pacientes: busca + ficha (anamnese) + histórico ──────────────────────
function Pacientes({ API }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState([]); const [sel, setSel] = useState(null);
  const buscar = v => { setQ(v); if (v.trim().length >= 2) API.get('/servicos-farmaceuticos/pacientes', { params: { q: v } }).then(r => setRes(r.data.pacientes || [])); else setRes([]); };
  const abrir = id => API.get(`/servicos-farmaceuticos/pacientes/${id}`).then(r => setSel(r.data));
  const [edit, setEdit] = useState(null);
  async function salvar() { await API.post('/servicos-farmaceuticos/pacientes', edit); abrir(edit.id); setEdit(null); }
  return (
    <div>
      <div style={s.card}>
        <input placeholder="🔎 buscar paciente…" value={q} onChange={e => buscar(e.target.value)} style={{ ...s.inp, marginBottom: res.length ? 8 : 0 }} />
        {res.map(p => <div key={p.id} onClick={() => abrir(p.id)} style={{ padding: '7px 4px', fontSize: 12.5, cursor: 'pointer', borderTop: '1px solid #f5f5f5' }}>{p.nome}{p.cpf ? ` · ${p.cpf}` : ''}{p.telefone ? ` · ${p.telefone}` : ''}</div>)}
      </div>
      {sel && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>👤 {sel.paciente.nome}</div>
            {!edit && <button onClick={() => setEdit({ ...sel.paciente })} style={s.chip}>✏️ editar anamnese</button>}
          </div>
          {!edit ? (
            <div style={{ fontSize: 12.5, color: '#555', lineHeight: 1.8, marginTop: 6 }}>
              {sel.paciente.cpf && <div>CPF: {sel.paciente.cpf} · {sel.paciente.telefone || ''}</div>}
              {sel.paciente.alergias && <div>⚠️ <b>Alergias:</b> {sel.paciente.alergias}</div>}
              {sel.paciente.medicamentos && <div>💊 <b>Medicamentos:</b> {sel.paciente.medicamentos}</div>}
              {sel.paciente.condicoes && <div>🩺 <b>Condições:</b> {sel.paciente.condicoes}</div>}
              {sel.paciente.obs && <div>📝 {sel.paciente.obs}</div>}
              <div style={{ fontSize: 11, color: sel.paciente.consent_lgpd ? '#3B6D11' : '#993C1D' }}>{sel.paciente.consent_lgpd ? '✅ Consentimento LGPD registrado' : '⚠️ Sem consentimento LGPD'}</div>
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              {[['telefone', 'Telefone'], ['alergias', 'Alergias'], ['medicamentos', 'Medicamentos em uso'], ['condicoes', 'Condições / comorbidades'], ['obs', 'Observações']].map(([k, l]) => (
                <input key={k} placeholder={l} value={edit[k] || ''} onChange={e => setEdit({ ...edit, [k]: e.target.value })} style={s.inp} />
              ))}
              <div style={{ display: 'flex', gap: 6 }}><button onClick={salvar} style={s.btn}>Salvar</button><button onClick={() => setEdit(null)} style={s.chip}>Cancelar</button></div>
            </div>
          )}
          <div style={{ fontSize: 13, fontWeight: 700, margin: '12px 0 6px', borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>Histórico de atendimentos</div>
          {(sel.historico || []).length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhum atendimento ainda.</div>}
          {(sel.historico || []).map(h => (
            <div key={h.id} style={{ fontSize: 12, padding: '6px 0', borderTop: '1px solid #f6f6f6' }}>
              <div>💉 <b>{h.tipo}</b> · {dBR(h.data)} · {h.colaborador_nome}{h.valor > 0 ? ` · ${brl(h.valor)}` : ''}{h.resultado ? <span style={{ color: '#0E5C33', fontWeight: 700 }}> · 📊 {h.resultado}</span> : ''}</div>
              {(h.produto || h.coo || h.crm) && <div style={{ fontSize: 11, color: '#777' }}>{h.produto ? `💉 ${h.produto}${h.lote ? ` (lote ${h.lote})` : ''}` : ''}{h.coo ? ` · COO ${h.coo}` : ''}{h.crm ? ` · CRM ${h.crm}` : ''}</div>}
              {h.comentario && <div style={{ fontSize: 11, color: '#888' }}>{h.comentario}</div>}
              {h.intercorrencia && <div style={{ fontSize: 11, color: '#C0392B', fontWeight: 600 }}>⚠️ {h.intercorrencia}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Aba Catálogo: serviços cadastráveis (com valor e termo) ──────────────────
function Catalogo({ API }) {
  const [tipos, setTipos] = useState([]); const [ed, setEd] = useState(null); const [msg, setMsg] = useState('');
  const [meta, setMeta] = useState(null); const [metaEd, setMetaEd] = useState(''); const [metaMsg, setMetaMsg] = useState('');
  const carregar = useCallback(() => API.get('/servicos-farmaceuticos/tipos').then(r => setTipos(r.data.tipos || [])), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/servicos-farmaceuticos/config').then(r => { setMeta(r.data.meta_atendimentos); setMetaEd(String(r.data.meta_atendimentos)); }).catch(() => {}); }, [API]);
  async function salvar() { if (!ed.nome?.trim()) { setMsg('Informe o nome.'); return; } await API.post('/servicos-farmaceuticos/tipos', ed); setEd(null); setMsg(''); carregar(); }
  async function remover(id) { await API.delete(`/servicos-farmaceuticos/tipos/${id}`); carregar(); }
  async function salvarMeta() { const r = await API.put('/servicos-farmaceuticos/config', { meta_atendimentos: metaEd }); setMeta(r.data.meta_atendimentos); setMetaEd(String(r.data.meta_atendimentos)); setMetaMsg('✓ Meta salva'); setTimeout(() => setMetaMsg(''), 2500); }
  return (
    <div>
      <div style={{ ...s.card, borderLeft: '4px solid #7a3d9c', background: '#FAF6FD' }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>🎯 Indicador do farmacêutico — meta de atendimentos/mês</div>
        <div style={{ fontSize: 11.5, color: '#666', marginBottom: 8 }}>Nº de atendimentos registrados no mês que vale <b>nota 100</b>. A nota entra na avaliação/premiação do farmacêutico (defina o <b>peso</b> em Configurações → Indicadores por função).</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="number" min="1" value={metaEd} onChange={e => setMetaEd(e.target.value)} style={{ ...s.inp, width: 110, marginBottom: 0 }} />
          <span style={{ fontSize: 12, color: '#666' }}>atendimentos/mês = 100%</span>
          <button onClick={salvarMeta} style={{ ...s.btn, marginBottom: 0 }}>Salvar meta</button>
          {metaMsg && <span style={{ fontSize: 12, color: '#1E824C', fontWeight: 700 }}>{metaMsg}</span>}
        </div>
      </div>
      <button onClick={() => setEd({ exige_termo: 0 })} style={{ ...s.btn, marginBottom: 12 }}>+ Novo serviço</button>
      {ed && (
        <div style={{ ...s.card, borderLeft: '4px solid #0E7C86' }}>
          <input placeholder="Nome do serviço" value={ed.nome || ''} onChange={e => setEd({ ...ed, nome: e.target.value })} style={s.inp} />
          <input type="number" step="0.01" placeholder="Valor padrão (R$, 0 = grátis)" value={ed.valor_padrao ?? ''} onChange={e => setEd({ ...ed, valor_padrao: e.target.value })} style={s.inp} />
          <label style={{ display: 'flex', gap: 6, fontSize: 12.5, marginBottom: 8 }}><input type="checkbox" checked={!!ed.exige_termo} onChange={e => setEd({ ...ed, exige_termo: e.target.checked ? 1 : 0 })} /> Exige termo de responsabilidade (ex.: injetável)</label>
          {!!ed.exige_termo && <textarea placeholder="Texto do termo de responsabilidade" value={ed.termo_texto || ''} onChange={e => setEd({ ...ed, termo_texto: e.target.value })} style={{ ...s.inp, minHeight: 70 }} />}
          {msg && <div style={{ fontSize: 12, color: '#C0392B', marginBottom: 6 }}>{msg}</div>}
          <div style={{ display: 'flex', gap: 6 }}><button onClick={salvar} style={s.btn}>Salvar</button><button onClick={() => setEd(null)} style={s.chip}>Cancelar</button></div>
        </div>
      )}
      {tipos.map(t => (
        <div key={t.id} style={{ ...s.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}>
          <div><div style={{ fontSize: 13, fontWeight: 700 }}>{t.nome}{t.valor_padrao > 0 ? ` · ${brl(t.valor_padrao)}` : ' · grátis'}</div>{!!t.exige_termo && <div style={{ fontSize: 10.5, color: '#7a5307' }}>📄 exige termo</div>}</div>
          <div style={{ display: 'flex', gap: 6 }}><button onClick={() => setEd({ ...t })} style={s.chip}>editar</button><button onClick={() => remover(t.id)} style={s.del}>remover</button></div>
        </div>
      ))}
    </div>
  );
}

// ── Assinatura online do termo (gera QR/link, o paciente assina no celular) ──
function AssinaturaOnline({ API, paciente, tipo, termoTexto, onAssinado }) {
  const [req, setReq] = useState(null); const [status, setStatus] = useState('pendente'); const [erro, setErro] = useState('');
  async function criar() {
    setErro('');
    try { const r = await API.post('/termos', { paciente_id: paciente?.id || null, paciente_nome: paciente?.nome, tipo, termo_texto: termoTexto }); setReq(r.data); }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao gerar link.'); }
  }
  useEffect(() => {
    if (!req || status === 'assinado') return;
    const t = setInterval(() => API.get(`/termos/${req.id}`).then(r => { if (r.data.status === 'assinado') { setStatus('assinado'); onAssinado && onAssinado(); } }).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [req, status]); // eslint-disable-line
  if (!req) return (
    <><button type="button" onClick={criar} style={{ fontSize: 12, padding: '6px 11px', background: '#0E7C86', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>🖊️ Coletar assinatura online (QR/link)</button>{erro && <span style={{ fontSize: 11, color: '#C0392B', marginLeft: 6 }}>{erro}</span>}</>
  );
  const url = `${window.location.origin}/assinar-termo?t=${req.token}`;
  async function baixarPdf() {
    try {
      const r = await API.get(`/termos/${req.id}/pdf`, { responseType: 'blob' });
      const u = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = u; a.download = `termo-${req.id.slice(0, 8)}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    } catch { /* ignora */ }
  }
  if (status === 'assinado') return (
    <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, color: '#1E874B', fontWeight: 700 }}>✅ Termo assinado pelo paciente!</span>
      <button type="button" onClick={baixarPdf} style={{ ...s.chip, ...s.chipOn }}>📄 Baixar PDF</button>
    </div>
  );
  return (
    <div style={{ marginTop: 6, background: '#fff', border: '1px solid #d7ecef', borderRadius: 8, padding: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <QRCodeSVG value={url} size={120} level="M" includeMargin />
      <div style={{ flex: 1, minWidth: 150 }}>
        <div style={{ fontSize: 12, marginBottom: 4 }}>Peça o paciente <b>escanear e assinar no celular</b> — ou abra o link neste aparelho:</div>
        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: '#185FA5', wordBreak: 'break-all' }}>{url}</a>
        <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>⏳ aguardando assinatura…</div>
      </div>
    </div>
  );
}

// ── Agenda de atendimentos (marcar + retorno) ───────────────────────────────
function Agenda({ API }) {
  const [ags, setAgs] = useState([]); const [novo, setNovo] = useState(false); const [pac, setPac] = useState(null); const [tipos, setTipos] = useState([]);
  const [form, setForm] = useState({ tipo: '', data: hoje.toISOString().slice(0, 10), hora: '', obs: '' });
  const carregar = useCallback(() => API.get('/servicos-farmaceuticos/agenda', { params: { status: 'agendado' } }).then(r => setAgs(r.data.agendamentos || [])).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/servicos-farmaceuticos/tipos').then(r => setTipos(r.data.tipos || [])).catch(() => {}); }, [API]);
  async function salvar(e) { e.preventDefault(); if (!form.data) return; await API.post('/servicos-farmaceuticos/agenda', { ...form, paciente_id: pac?.id || null, paciente_nome: pac?.nome }); setForm({ tipo: '', data: hoje.toISOString().slice(0, 10), hora: '', obs: '' }); setPac(null); setNovo(false); carregar(); }
  const setStatus = (id, st) => API.patch(`/servicos-farmaceuticos/agenda/${id}`, { status: st }).then(carregar);
  return (
    <>
      <button onClick={() => setNovo(v => !v)} style={{ ...s.btn, marginBottom: 12 }}>{novo ? '✕ Cancelar' : '+ Marcar atendimento'}</button>
      {novo && (
        <form onSubmit={salvar} style={{ ...s.card, borderLeft: '4px solid #0E7C86' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Paciente</div>
          <PacientePicker API={API} pac={pac} onPick={setPac} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} style={{ ...s.inp, flex: 1, minWidth: 180 }}>
              <option value="">Escolha o serviço…</option>
              {tipos.map(t => <option key={t.id} value={t.nome}>{t.nome}</option>)}
            </select>
            <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} style={{ ...s.inp, width: 150 }} />
            <input type="time" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} style={{ ...s.inp, width: 110 }} />
          </div>
          <input placeholder="Observação (opcional)" value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} style={s.inp} />
          <button style={s.btn}>Agendar</button>
        </form>
      )}
      {ags.length === 0 && <div style={{ ...s.card, textAlign: 'center', color: '#999' }}>Nenhum atendimento agendado.</div>}
      {ags.map(a => {
        const hojeStr = new Date().toISOString().slice(0, 10);
        const atrasado = a.data < hojeStr, ehHoje = a.data === hojeStr;
        const wa = waLink(a.telefone, `Olá${a.paciente_nome ? ' ' + a.paciente_nome.split(' ')[0] : ''}! Passando para lembrar do seu retorno de ${a.tipo || 'atendimento'} no dia ${dBR(a.data)}${a.hora ? ' às ' + a.hora : ''}. Podemos confirmar?`);
        return (
        <div key={a.id} style={{ ...s.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 14px', borderLeft: `4px solid ${atrasado ? '#E24B4A' : ehHoje ? '#E0912F' : '#dfe6ea'}` }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>📅 {dBR(a.data)}{a.hora ? ` · ${a.hora}` : ''} — {a.tipo || 'atendimento'}
              {atrasado ? <span style={{ fontSize: 10, color: '#fff', background: '#E24B4A', borderRadius: 5, padding: '1px 6px', marginLeft: 6 }}>atrasado</span>
                : ehHoje ? <span style={{ fontSize: 10, color: '#fff', background: '#E0912F', borderRadius: 5, padding: '1px 6px', marginLeft: 6 }}>hoje</span> : ''}</div>
            <div style={{ fontSize: 11.5, color: '#999', marginTop: 2 }}>{a.paciente_nome ? `👤 ${a.paciente_nome}` : 'sem paciente'}{a.telefone ? ` · ${a.telefone}` : ''}{a.loja_nome ? ` · ${a.loja_nome}` : ''}{a.obs ? ` · ${a.obs}` : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ ...s.chip, background: '#25D366', color: '#fff', border: 'none', textDecoration: 'none' }}>💬 Lembrar</a>}
            <button onClick={() => setStatus(a.id, 'realizado')} style={{ ...s.chip, background: '#EAF3E9', color: '#0E5C33', borderColor: '#cfe6cf' }}>✓ realizado</button>
            <button onClick={() => setStatus(a.id, 'cancelado')} style={s.del}>cancelar</button>
          </div>
        </div>
      ); })}
      <div style={s.info}>💡 O botão <b>💬 Lembrar</b> abre o WhatsApp do paciente com a mensagem pronta — você confere e envia. (Precisa que o paciente tenha telefone cadastrado.) Retornos <b style={{ color: '#E24B4A' }}>atrasados</b> e de <b style={{ color: '#E0912F' }}>hoje</b> ficam destacados.</div>
    </>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 900, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  info: { background: '#E6F1FB', borderLeft: '3px solid #185FA5', borderRadius: '0 8px 8px 0', padding: '10px 12px', fontSize: 12, color: '#185FA5', lineHeight: 1.6, marginTop: 4 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  inp: { width: '100%', padding: '9px 11px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, marginBottom: 8, fontFamily: 'inherit', boxSizing: 'border-box' },
  btn: { fontSize: 13, padding: '9px 16px', background: '#0E7C86', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  del: { fontSize: 11.5, padding: '4px 10px', background: '#fff', color: '#993C1D', border: '1px solid #f0d0d0', borderRadius: 7, cursor: 'pointer' },
  chip: { fontSize: 12, padding: '6px 12px', border: '1px solid #ddd', borderRadius: 20, background: '#fff', cursor: 'pointer', color: '#555' },
  chipOn: { background: '#0E7C86', color: '#fff', borderColor: '#0E7C86' },
  h: { fontSize: 13, fontWeight: 700, marginBottom: 8 },
  row: { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderTop: '1px solid #f5f5f5' },
};
