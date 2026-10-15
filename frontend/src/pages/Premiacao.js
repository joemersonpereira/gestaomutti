import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const hoje = new Date();
const APROV_COR = { aprovado: ['#EAF3DE', '#3B6D11'], pendente: ['#FAEEDA', '#854F0B'], correcao: ['#FCEBEB', '#993C1D'], auto: ['#EAF3DE', '#3B6D11'] };
const APROV_LBL = { aprovado: 'aprovada', pendente: 'aguardando diretor', correcao: 'em reanálise', auto: 'aprovada' };
const MESES = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const GRUPOS_VENDA = [
  { key: 'generico', label: 'Genérico' }, { key: 'similar', label: 'Similar' },
  { key: 'perfumaria', label: 'Perfumaria' }, { key: 'varejo', label: 'Varejo' },
  { key: 'conveniencia', label: 'Conveniência' }, { key: 'propagado', label: 'Propagado' },
  { key: 'vitaminas', label: 'Vitaminas e Suplementos' },
];

export default function Premiacao() {
  const { API, usuario } = useAuth();
  const ehDiretor = ['Diretor Geral', 'Gestor Geral'].includes(usuario.funcao);
  const ehLanca = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const [lojas, setLojas] = useState([]);
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState({ nome: '', loja_id: '', valor_meta: '', valor_super_meta: '', modo: 'geral', escopo: 'uma', grupos: {}, lojasMeta: {} });
  const [msg, setMsg] = useState('');
  const [aceiteAlvo, setAceiteAlvo] = useState(null);
  const [aba, setAba] = useState('campanhas');
  const [sugerindo, setSugerindo] = useState(false);

  // Sugerir a meta de TODAS as lojas pelo histórico do ERP (mesma base do modo "uma loja").
  async function sugerirTodas() {
    setSugerindo(true); setMsg('');
    const novo = {};
    await Promise.all(lojas.map(l => API.get('/metas/analise-vendas', { params: { loja_id: l.id, mes, ano } })
      .then(r => { const rec = r.data?.recomendada; if (rec?.valor) novo[l.id] = { valor_meta: String(rec.valor), valor_super_meta: rec.super ? String(rec.super) : '' }; })
      .catch(() => { /* loja sem histórico/ERP ocupado — deixa em branco */ })));
    setForm(f => ({ ...f, lojasMeta: { ...f.lojasMeta, ...novo } }));
    setSugerindo(false);
    setMsg(Object.keys(novo).length ? `✅ Metas sugeridas para ${Object.keys(novo).length} loja(s) pelo histórico. Ajuste o que quiser antes de lançar.` : '⚠️ Não foi possível sugerir (ERP indisponível).');
  }

  const carregar = useCallback(() => {
    API.get('/metas', { params: { mes, ano } }).then(r => setLista((r.data.metas || []).filter(m => !m.colaborador_id)));
  }, [API, mes, ano]);
  useEffect(() => { API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || [])); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  async function lancar() {
    setMsg('');
    if (!form.nome.trim()) { setMsg('Dê um nome à campanha (ex.: "Campanha Junho – Premiado").'); return; }
    if (form.escopo === 'todas') {
      const lojasMeta = lojas.map(l => ({ loja_id: l.id, valor_meta: Number(form.lojasMeta?.[l.id]?.valor_meta) || 0, valor_super_meta: Number(form.lojasMeta?.[l.id]?.valor_super_meta) || 0 })).filter(l => l.valor_meta > 0);
      if (!lojasMeta.length) { setMsg('Preencha a meta de ao menos uma loja.'); return; }
      try {
        const r = await API.post('/metas/lote', { nome: form.nome, mes, ano, lojas: lojasMeta });
        setMsg('✅ ' + r.data.mensagem);
        setForm({ nome: '', loja_id: '', valor_meta: '', valor_super_meta: '', modo: 'geral', escopo: 'uma', grupos: {}, lojasMeta: {} });
        carregar();
      } catch (e) { setMsg(e.response?.data?.erro || 'Erro ao lançar campanha.'); }
      return;
    }
    if (!form.loja_id) { setMsg('Selecione a loja.'); return; }
    let payload = { nome: form.nome, loja_id: form.loja_id, mes, ano, modo: form.modo };
    if (form.modo === 'grupo') {
      const grupos = GRUPOS_VENDA.map(g => ({ grupo: g.key, valor_meta: Number(form.grupos?.[g.key]?.valor_meta) || 0, valor_super: Number(form.grupos?.[g.key]?.valor_super) || 0 })).filter(g => g.valor_meta || g.valor_super);
      if (!grupos.length) { setMsg('Informe a meta de ao menos um grupo.'); return; }
      payload.grupos = grupos;
    } else {
      if (!form.valor_meta) { setMsg('Informe o valor da meta.'); return; }
      payload.valor_meta = Number(form.valor_meta);
      payload.valor_super_meta = form.valor_super_meta ? Number(form.valor_super_meta) : undefined;
    }
    try {
      const r = await API.post('/metas', payload);
      setMsg('✅ ' + r.data.mensagem);
      setForm({ nome: '', loja_id: '', valor_meta: '', valor_super_meta: '', modo: 'geral', escopo: 'uma', grupos: {}, lojasMeta: {} });
      carregar();
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro ao lançar campanha.'); }
  }
  async function decidir(id, decisao) {
    let comentario = '';
    if (decisao === 'correcao') { comentario = window.prompt('Comentário da reanálise (o que precisa ajustar?):') || ''; if (!comentario) return; }
    await API.post(`/metas/${id}/aprovar`, { decisao, comentario }); carregar();
  }
  async function replicar(id) {
    const m = window.prompt('Replicar para qual mês? (1-12)', String(hoje.getMonth() + 1)); if (!m) return;
    const a = window.prompt('Qual ano?', String(hoje.getFullYear())); if (!a) return;
    await API.post(`/metas/${id}/replicar`, { mes: Number(m), ano: Number(a) }); setMsg('✅ Campanha replicada.'); carregar();
  }

  return (
    <div style={s.wrap}>
      <Banner emoji="🏆" titulo="Campanhas" cor="verde" sub="Campanhas de premiação — toda meta que paga é uma campanha (nome + período)" />

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button onClick={() => setAba('campanhas')} style={{ ...s.tab, ...(aba === 'campanhas' ? s.tabAtiva : {}) }}>Campanhas</button>
        <button onClick={() => setAba('equipe')} style={{ ...s.tab, ...(aba === 'equipe' ? s.tabAtiva : {}) }}>Metas da equipe</button>
        <button onClick={() => setAba('indicadores')} style={{ ...s.tab, ...(aba === 'indicadores' ? s.tabAtiva : {}) }}>Indicadores</button>
        <button onClick={() => setAba('vitaminas')} style={{ ...s.tab, ...(aba === 'vitaminas' ? s.tabAtiva : {}) }}>Premiação vitaminas</button>
      </div>

      {aba === 'indicadores' && <MetasIndicadores API={API} usuario={usuario} lojas={lojas} mes={mes} ano={ano} setMes={setMes} />}
      {aba === 'vitaminas' && <PremiacaoVitaminas API={API} />}

      {aba === 'equipe' && <EquipeMetas API={API} usuario={usuario} lojas={lojas} mes={mes} ano={ano} setMes={setMes} setAno={setAno} />}

      {aba === 'campanhas' && (<>
      {ehLanca && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Nova campanha</div>
          <input style={s.campo} placeholder='Nome da campanha (ex.: "Campanha Junho – Premiado") *' value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            {[['uma', 'Uma loja'], ['todas', 'Várias lojas']].map(([v, l]) => (
              <button key={v} onClick={() => setForm({ ...form, escopo: v })}
                style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${form.escopo === v ? '#185FA5' : '#ddd'}`, background: form.escopo === v ? '#E6F1FB' : '#fff', color: form.escopo === v ? '#185FA5' : '#666' }}>
                {l}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={s.campo} value={mes} onChange={e => setMes(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}
            </select>
            <input style={s.campo} type="number" value={ano} onChange={e => setAno(Number(e.target.value))} />
          </div>

          {form.escopo === 'todas' ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: '#666' }}>Preencha a meta de cada loja (deixe em branco as que não entram). Super em branco = meta +5%.</div>
                <button type="button" onClick={sugerirTodas} disabled={sugerindo} style={{ fontSize: 11.5, fontWeight: 600, padding: '5px 11px', borderRadius: 8, border: '1px solid #185FA5', background: '#fff', color: '#185FA5', cursor: sugerindo ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                  {sugerindo ? 'analisando o histórico…' : '📊 Sugerir metas pelo histórico'}
                </button>
              </div>
              <div style={{ display: 'flex', fontSize: 10, color: '#999', fontWeight: 600, padding: '0 4px 4px' }}>
                <span style={{ flex: 1 }}>Loja</span><span style={{ width: 110 }}>Meta (R$)</span><span style={{ width: 110 }}>Super (R$)</span>
              </div>
              {lojas.map(l => (
                <div key={l.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ flex: 1, fontSize: 12, color: '#333' }}>{l.nome}</span>
                  <input style={{ ...s.campo, marginBottom: 0, width: 104 }} type="number" placeholder="Meta" value={form.lojasMeta?.[l.id]?.valor_meta ?? ''} onChange={e => setForm({ ...form, lojasMeta: { ...form.lojasMeta, [l.id]: { ...form.lojasMeta?.[l.id], valor_meta: e.target.value } } })} />
                  <input style={{ ...s.campo, marginBottom: 0, width: 104 }} type="number" placeholder="Super" value={form.lojasMeta?.[l.id]?.valor_super_meta ?? ''} onChange={e => setForm({ ...form, lojasMeta: { ...form.lojasMeta, [l.id]: { ...form.lojasMeta?.[l.id], valor_super_meta: e.target.value } } })} />
                </div>
              ))}
            </div>
          ) : (<>
          <select style={s.campo} value={form.loja_id} onChange={e => setForm({ ...form, loja_id: e.target.value })}>
            <option value="">Loja *</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          <AnaliseVendas API={API} lojaId={form.loja_id} mes={mes} ano={ano}
            onUsar={(meta, superM) => setForm(f => ({ ...f, modo: 'geral', valor_meta: String(meta), valor_super_meta: superM ? String(superM) : f.valor_super_meta }))}
            onUsarGrupos={(grupos) => setForm(f => ({ ...f, modo: 'grupo', grupos: Object.fromEntries(grupos.map(g => [g.grupo, { valor_meta: String(g.sugestao), valor_super: String(g.super) }])) }))} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            {['geral', 'grupo'].map(mo => (
              <button key={mo} onClick={() => setForm({ ...form, modo: mo })}
                style={{ fontSize: 11, padding: '4px 12px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${form.modo === mo ? '#111' : '#ddd'}`, background: form.modo === mo ? '#111' : '#fff', color: form.modo === mo ? '#fff' : '#666' }}>
                {mo === 'geral' ? 'Meta geral' : 'Por grupo'}
              </button>
            ))}
          </div>
          {form.modo === 'grupo' ? (
            <div style={{ marginBottom: 8 }}>
              {GRUPOS_VENDA.map(g => (
                <div key={g.key} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, width: 130, color: '#444' }}>{g.label}</span>
                  <input style={{ ...s.campo, marginBottom: 0 }} type="number" placeholder="Meta (R$)" value={form.grupos?.[g.key]?.valor_meta ?? ''} onChange={e => setForm({ ...form, grupos: { ...form.grupos, [g.key]: { ...form.grupos?.[g.key], valor_meta: e.target.value } } })} />
                  <input style={{ ...s.campo, marginBottom: 0 }} type="number" placeholder="Super (R$)" value={form.grupos?.[g.key]?.valor_super ?? ''} onChange={e => setForm({ ...form, grupos: { ...form.grupos, [g.key]: { ...form.grupos?.[g.key], valor_super: e.target.value } } })} />
                </div>
              ))}
            </div>
          ) : (
            <>
              <input style={s.campo} type="number" placeholder="Meta (R$) *" value={form.valor_meta} onChange={e => setForm({ ...form, valor_meta: e.target.value })} />
              <input style={s.campo} type="number" placeholder="Super meta (R$) — opcional, padrão +5%" value={form.valor_super_meta} onChange={e => setForm({ ...form, valor_super_meta: e.target.value })} />
            </>
          )}
          </>)}
          {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginBottom: 8 }}>{msg}</div>}
          <button style={s.btn} onClick={lancar}>{ehDiretor ? 'Lançar e liberar' : 'Lançar (vai p/ aprovação do Diretor)'}</button>
        </div>
      )}

      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Campanhas de {String(mes).padStart(2, '0')}/{ano} ({lista.length})</span>
          {!ehLanca && (
            <select style={{ ...s.campo, width: 'auto', marginBottom: 0 }} value={mes} onChange={e => setMes(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}
            </select>
          )}
        </div>
        {lista.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhuma campanha neste período.</div>}
        {lista.map(m => {
          const ac = APROV_COR[m.status_aprovacao] || ['#f0f0f0', '#666'];
          const aprovada = m.status_aprovacao === 'aprovado' || m.status_aprovacao === 'auto';
          return (
            <div key={m.id} style={s.item}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.nome_campanha || 'Campanha'}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{m.loja_nome} · Meta R$ {Number(m.valor_meta).toLocaleString('pt-BR')} · Super R$ {Number(m.valor_super_meta).toLocaleString('pt-BR')}</div>
                  {m.comentario_diretor ? <div style={{ fontSize: 11, color: '#993C1D' }}>Diretor: {m.comentario_diretor}</div> : null}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: ac[0], color: ac[1], display: 'block', marginBottom: 4 }}>{APROV_LBL[m.status_aprovacao] || m.status_aprovacao}</span>
                  {aprovada && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: m.status_aceite === 'aceito' ? '#EAF3DE' : '#E6F1FB', color: m.status_aceite === 'aceito' ? '#3B6D11' : '#185FA5' }}>{m.status_aceite === 'aceito' ? 'aceita ✓' : 'aguarda aceite'}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {ehDiretor && m.status_aprovacao === 'pendente' && (
                  <>
                    <button style={s.btnMini} onClick={() => decidir(m.id, 'aprovado')}>Aprovar</button>
                    <button style={{ ...s.btnMini, ...s.btnMiniBad }} onClick={() => decidir(m.id, 'correcao')}>Reanalisar</button>
                  </>
                )}
                {aprovada && m.status_aceite !== 'aceito' && (
                  <button style={{ ...s.btnMini, ...s.btnMiniOk }} onClick={() => setAceiteAlvo(m)}>Aceitar participação</button>
                )}
                {ehLanca && aprovada && <button style={s.btnMini} onClick={() => replicar(m.id)}>Replicar p/ outro mês</button>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={s.info}>
        💡 Toda premiação é uma <strong>campanha</strong> com nome e período (enquadramento legal). Quem lança é
        <strong> Supervisor ou Direção</strong>. O Diretor <strong>aprova</strong> ou pede <strong>reanálise</strong>.
        O responsável só passa a <strong>acompanhar depois de aceitar</strong> — e o aceite registra IP, selfie e gera o
        <strong> termo</strong> (prova de ciência de que é campanha, não comissão).
      </div>
      </>)}

      {aceiteAlvo && <ModalAceite API={API} usuario={usuario} meta={aceiteAlvo} onFechar={() => setAceiteAlvo(null)} onAceito={() => { setAceiteAlvo(null); carregar(); }} />}
    </div>
  );
}

export function ModalAceite({ API, usuario, meta, onFechar, onAceito }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [selfie, setSelfie] = useState(null);
  const [concordo, setConcordo] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState(null);
  const [camOk, setCamOk] = useState(false);

  const declaracao = `Declaro estar ciente de que "${meta.nome_campanha || 'esta campanha'}" é uma CAMPANHA DE PREMIAÇÃO de caráter eventual e por tempo determinado (período ${String(meta.mes).padStart(2, '0')}/${meta.ano}), que NÃO constitui comissão, salário ou verba de natureza salarial. Aceito participar voluntariamente.`;

  useEffect(() => {
    let ativo = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' } })
      .then(stream => { if (!ativo) { stream.getTracks().forEach(t => t.stop()); return; } streamRef.current = stream; if (videoRef.current) videoRef.current.srcObject = stream; setCamOk(true); })
      .catch(() => setErro('Não consegui acessar a câmera. Você pode aceitar sem a selfie, mas o ideal é permitir a câmera.'));
    return () => { ativo = false; streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  function tirarSelfie() {
    const v = videoRef.current; if (!v) return;
    const c = document.createElement('canvas'); c.width = 320; c.height = 240;
    c.getContext('2d').drawImage(v, 0, 0, 320, 240);
    setSelfie(c.toDataURL('image/jpeg', 0.6));
  }

  async function confirmar() {
    setErro('');
    if (!concordo) { setErro('Marque que leu e concorda com o termo.'); return; }
    try {
      const r = await API.post(`/metas/${meta.id}/aceitar`, { selfie, user_agent: navigator.userAgent });
      streamRef.current?.getTracks().forEach(t => t.stop());
      setResultado({ ...r.data, selfie });
    } catch (e) { setErro(e.response?.data?.erro || 'Erro ao registrar aceite.'); }
  }

  return (
    <div style={s.overlay} onClick={onFechar}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        {!resultado ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Aceitar participação</div>
            <div style={{ fontSize: 12, color: '#444', background: '#f4f4f4', padding: 10, borderRadius: 8, marginBottom: 10, lineHeight: 1.5 }}>{declaracao}</div>

            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              {selfie ? <img src={selfie} alt="selfie" style={{ width: 200, borderRadius: 8 }} />
                : <video ref={videoRef} autoPlay playsInline muted style={{ width: 200, borderRadius: 8, background: '#000' }} />}
            </div>
            {camOk && !selfie && <button style={s.btnMini} onClick={tirarSelfie}>📸 Tirar selfie</button>}
            {selfie && <button style={s.btnMini} onClick={() => setSelfie(null)}>↺ Refazer selfie</button>}

            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '12px 0', fontSize: 12 }}>
              <input type="checkbox" checked={concordo} onChange={e => setConcordo(e.target.checked)} />
              Li e concordo: entendo que é uma campanha de premiação (não comissão) e aceito participar.
            </label>
            {erro && <div style={{ fontSize: 12, color: '#993C1D', marginBottom: 8 }}>{erro}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...s.btn, opacity: concordo ? 1 : 0.5 }} onClick={confirmar} disabled={!concordo}>Confirmar aceite</button>
              <button style={s.btnSec} onClick={onFechar}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#3B6D11', marginBottom: 8 }}>✅ Aceite registrado!</div>
            <div style={{ fontSize: 12, color: '#444', lineHeight: 1.7, marginBottom: 12 }}>
              <strong>Campanha:</strong> {meta.nome_campanha}<br />
              <strong>Data:</strong> {new Date(resultado.aceito_em).toLocaleString('pt-BR')}<br />
              <strong>IP:</strong> {resultado.ip || '—'}<br />
              {selfie && <img src={selfie} alt="selfie" style={{ width: 120, borderRadius: 8, marginTop: 6 }} />}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={s.btn} onClick={onAceito}>Fechar</button>
            </div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>✓ Assinado. O termo fica registrado no seu cadastro.</div>
          </>
        )}
      </div>
    </div>
  );
}

// 📈 Análise de vendas + sugestão de meta (loja). Puxa histórico do ERP.
function AnaliseVendas({ API, lojaId, mes, ano, onUsar, onUsarGrupos }) {
  const [aberto, setAberto] = useState(true);
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [periodo, setPeriodo] = useState(null);
  const carregar = useCallback(() => {
    if (!lojaId) return;
    setD(null); setErro('');
    API.get('/metas/analise-vendas', { params: { loja_id: lojaId, mes, ano } })
      .then(r => setD(r.data)).catch(() => setErro('Não foi possível analisar (ERP indisponível).'));
  }, [API, lojaId, mes, ano]);
  useEffect(() => { if (aberto) carregar(); }, [aberto, carregar]);

  async function calcPeriodo() {
    if (!de || !ate) return;
    const r = await API.get('/metas/analise-vendas', { params: { loja_id: lojaId, mes, ano, de, ate } });
    setPeriodo(r.data.periodo);
  }
  const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR');
  const nomeMes = m => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][m - 1];
  if (!lojaId) return null;
  const serie = d?.serie || [];
  const maxV = Math.max(1, ...serie.map(s => s.total));

  return (
    <div style={{ border: '1px solid #E6F1FB', background: '#F7FBFF', borderRadius: 10, padding: 10, marginBottom: 8 }}>
      <button type="button" onClick={() => setAberto(a => !a)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#185FA5', padding: 0 }}>
        📈 Análise de vendas e sugestão de meta {aberto ? '▲' : '▼'}
      </button>
      {aberto && (
        <div style={{ marginTop: 8 }}>
          {erro && <div style={{ fontSize: 12, color: '#993C1D' }}>{erro}</div>}
          {!d && !erro && <div style={{ fontSize: 12, color: '#999' }}>Analisando o histórico do ERP…</div>}
          {d && (<>
            {/* Histórico mensal (barras) */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 90, marginBottom: 6 }}>
              {serie.slice(-12).map(s => (
                <div key={`${s.ano}-${s.mes}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} title={brl(s.total)}>
                  <div style={{ width: '80%', background: '#3E7BB6', borderRadius: '3px 3px 0 0', height: `${Math.round((s.total / maxV) * 70)}px` }} />
                  <div style={{ fontSize: 8, color: '#888', marginTop: 2 }}>{nomeMes(s.mes)}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>Média 3m: <strong>{brl(d.media3)}</strong></span>
              <span>Mês anterior: <strong>{brl(d.mes_passado)}</strong></span>
              <span>Tendência: <strong>{d.crescimento_mensal}%/mês</strong></span>
              {d.mes_alvo_parcial ? <span>{String(mes).padStart(2, '0')}/{ano} até agora: <strong>{brl(d.mes_alvo_parcial)}</strong></span> : null}
            </div>

            {/* Sugestões (meta + super) */}
            <div style={{ fontSize: 11, fontWeight: 600, color: '#444', marginBottom: 4 }}>Sugestões de meta — clique para preencher meta + super (a super é o alvo de esforço maior):</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {d.recomendada && (
                <button type="button" onClick={() => onUsar(d.recomendada.valor, d.recomendada.super)}
                  style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', border: '1px solid #3B6D11', background: '#EAF3E0', color: '#3B6D11', fontWeight: 700, textAlign: 'left' }}>
                  ⭐ Recomendada: {brl(d.recomendada.valor)}<br /><span style={{ fontSize: 10, fontWeight: 400 }}>super {brl(d.recomendada.super)}</span>
                </button>
              )}
              {d.sugestoes.map(sg => (
                <button key={sg.chave} type="button" onClick={() => onUsar(sg.valor, sg.super)}
                  style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', border: '1px solid #ccd', background: '#fff', color: '#333', textAlign: 'left' }}
                  title={`${sg.label} · super ${brl(sg.super)}`}>
                  {sg.label}: <strong>{brl(sg.valor)}</strong><br /><span style={{ fontSize: 10, color: '#999' }}>super {brl(sg.super)}</span>
                </button>
              ))}
            </div>

            {/* Sugestão por grupo de produto */}
            {d.por_grupo && d.por_grupo.length > 0 && (
              <div style={{ borderTop: '1px dashed #cddbe8', paddingTop: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#444' }}>Sugestão por grupo (média dos últimos 3 meses):</span>
                  <button type="button" onClick={() => onUsarGrupos(d.por_grupo)}
                    style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid #185FA5', background: '#fff', color: '#185FA5', fontWeight: 600 }}>
                    Usar metas por grupo →
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {d.por_grupo.map(g => (
                    <span key={g.grupo} style={{ fontSize: 11, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '4px 8px' }}>
                      {g.label}: <strong>{brl(g.sugestao)}</strong> <span style={{ color: '#999' }}>· super {brl(g.super)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Análise por período livre */}
            <div style={{ borderTop: '1px dashed #cddbe8', paddingTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#666' }}>Vendas entre</span>
              <input type="date" value={de} onChange={e => setDe(e.target.value)} style={{ fontSize: 12, padding: 4, border: '1px solid #ddd', borderRadius: 6 }} />
              <span style={{ fontSize: 11, color: '#666' }}>e</span>
              <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={{ fontSize: 12, padding: 4, border: '1px solid #ddd', borderRadius: 6 }} />
              <button type="button" onClick={calcPeriodo} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid #185FA5', background: '#fff', color: '#185FA5' }}>Calcular</button>
              {periodo && <span style={{ fontSize: 12, color: '#111' }}>= <strong>{brl(periodo.total)}</strong>{periodo.clientes ? ` · ${periodo.clientes.toLocaleString('pt-BR')} clientes` : ''}</span>}
            </div>
          </>)}
        </div>
      )}
    </div>
  );
}

// Cadastro das faixas de premiação de VITAMINAS (R$/unidade por faixa de quantidade).
function PremiacaoVitaminas({ API }) {
  const [faixas, setFaixas] = useState([]);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => { API.get('/regras/vitaminas').then(r => setFaixas(r.data.faixas || [])); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  const set = (i, campo, v) => setFaixas(fs => fs.map((f, j) => j === i ? { ...f, [campo]: v } : f));
  const add = () => setFaixas(fs => [...fs, { min_un: '', valor: '' }]);
  const rem = i => setFaixas(fs => fs.filter((_, j) => j !== i));
  async function salvar() {
    const lista = faixas.map(f => ({ min_un: parseInt(f.min_un, 10) || 0, valor: Number(f.valor) || 0 }));
    const r = await API.post('/regras/vitaminas', { faixas: lista });
    setFaixas(r.data.faixas || []); setMsg('✅ Faixas salvas.'); setTimeout(() => setMsg(''), 3000);
  }
  const fmtFaixa = (f, i, arr) => {
    const min = parseInt(f.min_un, 10) || 0;
    const prox = arr[i + 1] ? (parseInt(arr[i + 1].min_un, 10) || 0) : null;
    if (min === 0) return prox ? `Até ${prox - 1} un` : 'Qualquer quantidade';
    return prox ? `De ${min} a ${prox - 1} un` : `Acima de ${min} un (${min}+)`;
  };
  const ordenadas = [...faixas].sort((a, b) => (parseInt(a.min_un, 10) || 0) - (parseInt(b.min_un, 10) || 0));

  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>💊 Premiação de vitaminas por faixa</div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 12 }}>Defina o R$ <strong>por unidade</strong> vendida conforme a quantidade de vitaminas no mês. "A partir de" = vale daquela quantidade até a próxima faixa.</div>
      <div style={{ display: 'flex', fontSize: 10, color: '#999', fontWeight: 600, padding: '0 4px 6px' }}>
        <span style={{ width: 150 }}>A partir de (un)</span><span style={{ width: 130 }}>R$ / unidade</span><span style={{ flex: 1 }}>Faixa</span>
      </div>
      {ordenadas.map((f, i, arr) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <input type="number" style={{ ...s.campo, marginBottom: 0, width: 140 }} value={f.min_un} onChange={e => set(faixas.indexOf(f), 'min_un', e.target.value)} placeholder="ex.: 10" />
          <input type="number" step="0.01" style={{ ...s.campo, marginBottom: 0, width: 120 }} value={f.valor} onChange={e => set(faixas.indexOf(f), 'valor', e.target.value)} placeholder="ex.: 5,00" />
          <span style={{ flex: 1, fontSize: 12, color: '#555' }}>{fmtFaixa(f, i, arr)} → <strong>R$ {(Number(f.valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/un</strong></span>
          <button onClick={() => rem(faixas.indexOf(f))} style={{ border: 'none', background: 'none', color: '#993C1D', cursor: 'pointer', fontSize: 16 }} title="Remover">✕</button>
        </div>
      ))}
      <button onClick={add} style={{ ...s.btnMini, marginTop: 6 }}>+ adicionar faixa</button>
      <div style={{ marginTop: 12 }}>
        <button style={s.btn} onClick={salvar}>Salvar faixas</button>
        {msg && <span style={{ marginLeft: 10, fontSize: 12, color: '#3B6D11' }}>{msg}</span>}
      </div>
      <div style={{ ...s.info, marginTop: 12 }}>💡 A premiação de vitaminas é <strong>R$ por unidade</strong>: se o vendedor fez 35 unidades e a faixa "30+" paga R$7/un, ele ganha 35 × R$7 = R$245. As unidades vêm automáticas do ERP.</div>
    </div>
  );
}

// Seletor dos cadernos de oferta que alimentam o indicador "Campanhas".
function CadernosCampanha({ API }) {
  const [lista, setLista] = useState([]);
  const [sel, setSel] = useState({}); // caderno_id -> nome
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    API.get('/vendas/campanha-cadernos').then(r => { const s = {}; (r.data.selecionados || []).forEach(c => { s[c.caderno_id] = c.nome; }); setSel(s); });
  }, [API]);
  function abrir() {
    setAberto(a => !a);
    if (!lista.length) API.get('/vendas/cadernos-oferta').then(r => setLista(r.data.cadernos || []));
  }
  function toggle(c) { setSel(s => { const n = { ...s }; if (n[c.id]) delete n[c.id]; else n[c.id] = c.nome; return n; }); }
  async function salvar() {
    const cadernos = Object.entries(sel).map(([id, nome]) => ({ id, nome }));
    await API.post('/vendas/campanha-cadernos', { cadernos });
    setMsg(`✅ ${cadernos.length} caderno(s) salvos.`); setTimeout(() => setMsg(''), 3000);
  }
  const selCount = Object.keys(sel).length;
  const filtrados = lista.filter(c => (c.nome || '').toLowerCase().includes(busca.toLowerCase()));
  return (
    <div style={{ ...s.card, borderLeft: '3px solid #185FA5' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>📕 Cadernos de oferta do indicador “Campanhas”</div>
          <div style={{ fontSize: 11, color: '#999' }}>O realizado de Campanhas por vendedor = <strong>unidades vendidas dos itens destes cadernos</strong> (automático do ERP). {selCount} selecionado(s).</div>
        </div>
        <button style={s.btnMini} onClick={abrir}>{aberto ? 'Fechar' : 'Selecionar cadernos'}</button>
      </div>
      {selCount > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {Object.entries(sel).map(([id, nome]) => <span key={id} style={{ fontSize: 11, background: '#EAF3DE', border: '1px solid #CFE3B8', borderRadius: 6, padding: '3px 8px', color: '#3B6D11' }}>{nome || id}</span>)}
        </div>
      )}
      {aberto && (
        <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 10 }}>
          <input style={s.campo} placeholder="Buscar caderno pelo nome…" value={busca} onChange={e => setBusca(e.target.value)} />
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
            {lista.length === 0 && <div style={{ fontSize: 12, color: '#999', padding: 10 }}>Carregando cadernos do ERP…</div>}
            {filtrados.map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!sel[c.id]} onChange={() => toggle(c)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{c.nome}</div>
                  <div style={{ fontSize: 10, color: '#999' }}>{c.ini} a {c.fim} · {c.itens} itens</div>
                </div>
              </label>
            ))}
          </div>
          <button style={{ ...s.btn, marginTop: 10 }} onClick={salvar}>Salvar cadernos</button>
          {msg && <span style={{ marginLeft: 10, fontSize: 12, color: '#3B6D11' }}>{msg}</span>}
        </div>
      )}
    </div>
  );
}

function MetasIndicadores({ API, usuario, lojas, mes, ano, setMes }) {
  const ehGestao = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const [lojaId, setLojaId] = useState(usuario.loja_id || '');
  const [inds, setInds] = useState([]);
  const [edits, setEdits] = useState({});
  const [msg, setMsg] = useState('');
  const [temFp, setTemFp] = useState(true);

  useEffect(() => { if (ehGestao && !lojaId && lojas.length) setLojaId(lojas[0].id); }, [ehGestao, lojas, lojaId]);
  const carregar = useCallback(() => {
    if (!lojaId) return;
    API.get('/vendas/indicador-metas', { params: { loja_id: lojaId, mes, ano } }).then(r => {
      setInds(r.data.indicadores || []);
      const e = {}; (r.data.indicadores || []).forEach(i => { e[i.indicador] = { meta_loja: i.meta_loja ?? '', meta_colaborador: i.meta_colaborador ?? '', unidade: i.unidade || 'percentual' }; });
      setEdits(e);
    });
    API.get('/vendas/loja-config', { params: { loja_id: lojaId } }).then(r => setTemFp(!!r.data.tem_farmacia_popular));
  }, [API, lojaId, mes, ano]);
  useEffect(() => { carregar(); }, [carregar]);
  async function toggleFp(v) { setTemFp(v); await API.post('/vendas/loja-config', { loja_id: lojaId, tem_farmacia_popular: v }); setMsg('✅ Farmácia Popular da loja atualizada — o PBM já reflete.'); }

  async function salvar(ind) {
    const ed = edits[ind] || {};
    await API.post('/vendas/indicador-metas', { loja_id: lojaId, mes, ano, indicador: ind, unidade: ed.unidade, meta_loja: ed.meta_loja === '' ? undefined : ed.meta_loja, meta_colaborador: ed.meta_colaborador === '' ? undefined : ed.meta_colaborador });
    setMsg('✅ Meta do indicador salva.'); carregar();
  }
  async function salvarTodas() {
    for (const i of inds) {
      const ed = edits[i.indicador] || {};
      if (ed.meta_loja === '' && ed.meta_colaborador === '') continue;
      await API.post('/vendas/indicador-metas', { loja_id: lojaId, mes, ano, indicador: i.indicador, unidade: ed.unidade, meta_loja: ed.meta_loja === '' ? undefined : ed.meta_loja, meta_colaborador: ed.meta_colaborador === '' ? undefined : ed.meta_colaborador });
    }
    setMsg('✅ Metas dos indicadores salvas.'); carregar();
  }
  function set(ind, campo, v) { setEdits({ ...edits, [ind]: { ...edits[ind], [campo]: v } }); }

  return (
    <>
      <div style={s.card}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {ehGestao && (
            <select style={{ ...s.campo, width: 'auto', marginBottom: 0 }} value={lojaId} onChange={e => setLojaId(e.target.value)}>
              {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          )}
          <select style={{ ...s.campo, width: 'auto', marginBottom: 0 }} value={mes} onChange={e => setMes(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#444', cursor: 'pointer', marginLeft: 'auto' }} title="Se a loja não tem Farmácia Popular, os itens de Farmácia Popular não entram no cálculo do PBM.">
            <input type="checkbox" checked={temFp} onChange={e => toggleFp(e.target.checked)} /> Loja tem Farmácia Popular
          </label>
        </div>
      </div>

      <CadernosCampanha API={API} />

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Metas dos indicadores comerciais</div>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>Defina a meta da loja e a meta de cada colaborador (igual para todos). A unidade pode ser % , unidade ou R$. Ao lançar o realizado em Vendas, o sistema avalia automaticamente (realizado ÷ meta do colaborador).</div>
        {inds.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhum indicador comercial ativo.</div>}
        {inds.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#666' }}>
                  <th style={{ padding: '6px 8px' }}>Indicador</th>
                  <th style={{ padding: '6px 8px' }}>Unidade</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Meta da loja</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Meta do colaborador</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {inds.map(i => {
                  const ed = edits[i.indicador] || {};
                  return (
                    <tr key={i.indicador} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{i.label} <span style={{ fontSize: 10, color: '#aaa', fontWeight: 400 }}>· peso {i.peso}</span></td>
                      <td style={{ padding: '4px 8px' }}>
                        <select style={{ fontSize: 11, padding: '4px 6px', border: '1px solid #ddd', borderRadius: 6 }} value={ed.unidade || 'percentual'} onChange={e => set(i.indicador, 'unidade', e.target.value)}>
                          <option value="percentual">%</option>
                          <option value="unidade">Unidade</option>
                          <option value="reais">R$</option>
                        </select>
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}><input style={{ ...s.campo, marginBottom: 0, width: 100 }} type="number" placeholder="—" value={ed.meta_loja ?? ''} onChange={e => set(i.indicador, 'meta_loja', e.target.value)} /></td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}><input style={{ ...s.campo, marginBottom: 0, width: 100 }} type="number" placeholder="—" value={ed.meta_colaborador ?? ''} onChange={e => set(i.indicador, 'meta_colaborador', e.target.value)} /></td>
                      <td style={{ padding: '4px 8px' }}><button style={s.btnMini} onClick={() => salvar(i.indicador)}>Salvar</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {inds.length > 0 && <button style={{ ...s.btn, marginTop: 10 }} onClick={salvarTodas}>Salvar todas</button>}
        {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 8 }}>{msg}</div>}
      </div>
    </>
  );
}

function EquipeMetas({ API, usuario, lojas, mes, ano, setMes, setAno }) {
  const ehGestao = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const [lojaId, setLojaId] = useState(usuario.loja_id || '');
  const [dados, setDados] = useState({ equipe: [], roster: [], loja_meta: null, loja_super: null, pct: 0, atingiram: 0, total_com_meta: 0, positiva_gerente: false });
  const [lista, setLista] = useState([]);
  const [edits, setEdits] = useState({});
  const [incluirId, setIncluirId] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => { if (ehGestao && !lojaId && lojas.length) setLojaId(lojas[0].id); }, [ehGestao, lojas, lojaId]);

  const carregar = useCallback(() => {
    if (!lojaId) return;
    API.get('/metas/equipe', { params: { loja_id: lojaId, mes, ano } }).then(r => {
      setDados(r.data);
      setLista(r.data.equipe || []);
      const e = {}; (r.data.equipe || []).forEach(v => {
        const gmap = {}; (v.grupos || []).forEach(g => { gmap[g.grupo] = { valor_meta: g.valor_meta ?? '', valor_super: g.valor_super ?? '' }; });
        e[v.colaborador_id] = { modo: v.modo || 'geral', valor_meta: v.valor_meta ?? '', valor_super_meta: v.valor_super_meta ?? '', grupos: gmap };
      });
      setEdits(e);
    });
  }, [API, lojaId, mes, ano]);
  useEffect(() => { carregar(); }, [carregar]);

  function payloadMeta(colaborador_id) {
    const ed = edits[colaborador_id] || {};
    if (ed.modo === 'grupo') {
      const grupos = (dados.grupos_disponiveis || []).map(g => ({ grupo: g.key, valor_meta: Number(ed.grupos?.[g.key]?.valor_meta) || 0, valor_super: Number(ed.grupos?.[g.key]?.valor_super) || 0 })).filter(g => g.valor_meta || g.valor_super);
      if (!grupos.length) return null;
      return { colaborador_id, mes, ano, modo: 'grupo', grupos };
    }
    if (!ed.valor_meta) return null;
    return { colaborador_id, mes, ano, modo: 'geral', valor_meta: Number(ed.valor_meta), valor_super_meta: ed.valor_super_meta ? Number(ed.valor_super_meta) : undefined };
  }
  async function salvar(colaborador_id) {
    const p = payloadMeta(colaborador_id);
    if (!p) { setMsg('Informe a meta (geral ou de ao menos um grupo).'); return; }
    await API.post('/metas/colaborador', p);
    setMsg('✅ Meta salva.'); carregar();
  }
  async function salvarTodos() {
    const payloads = lista.map(v => payloadMeta(v.colaborador_id)).filter(Boolean);
    if (!payloads.length) { setMsg('Nenhuma meta preenchida para salvar.'); return; }
    for (const p of payloads) await API.post('/metas/colaborador', p);
    setMsg(`✅ ${payloads.length} meta(s) salva(s).`); carregar();
  }
  async function copiarAnterior() {
    const deMes = mes === 1 ? 12 : mes - 1, deAno = mes === 1 ? ano - 1 : ano;
    await API.post('/metas/replicar-equipe', { loja_id: lojaId, de_mes: deMes, de_ano: deAno, mes, ano });
    setMsg(`✅ Copiado de ${String(deMes).padStart(2, '0')}/${deAno}.`); carregar();
  }
  function dividir() {
    if (!lista.length) { setMsg('Inclua pessoas primeiro.'); return; }
    const metaL = Number(dados.loja_meta) || 0, superL = Number(dados.loja_super) || 0;
    if (!metaL) { setMsg('Esta loja não tem meta cadastrada no período (lance na aba Campanhas).'); return; }
    const n = lista.length;
    const m = Math.round(metaL / n), su = Math.round(superL / n);
    const e = { ...edits };
    lista.forEach(v => { const prev = e[v.colaborador_id] || {}; e[v.colaborador_id] = { ...prev, modo: prev.modo || 'geral', valor_meta: String(m), valor_super_meta: superL ? String(su) : (prev.valor_super_meta ?? '') }; });
    setEdits(e); setMsg(`Dividido R$ ${metaL.toLocaleString('pt-BR')} entre ${n}. Ajuste à vontade e salve (não precisa bater com o total). Quem estiver "por grupo" não é alterado.`);
  }
  async function sugerirHistorico() {
    if (!lista.length) { setMsg('Inclua pessoas primeiro.'); return; }
    try {
      const r = await API.get('/metas/analise-vendedores', { params: { loja_id: lojaId, mes, ano } });
      const map = {}; (r.data.vendedores || []).forEach(v => { map[v.colaborador_id] = v; });
      const e = { ...edits }; let n = 0;
      lista.forEach(v => {
        const sug = map[v.colaborador_id];
        if (sug && sug.sugestao > 0) {
          const prev = e[v.colaborador_id] || {};
          e[v.colaborador_id] = { ...prev, modo: prev.modo || 'geral', valor_meta: String(sug.sugestao), valor_super_meta: prev.valor_super_meta || String(Math.round(sug.sugestao * 1.05)) };
          n++;
        }
      });
      setEdits(e);
      setMsg(n ? `📈 Sugeri metas de ${n} vendedor(es) pela média dos últimos meses (ERP). Ajuste e salve.` : 'Sem histórico suficiente para sugerir.');
    } catch { setMsg('Não foi possível analisar (ERP indisponível).'); }
  }
  function incluir() {
    if (!incluirId) return;
    const p = (dados.roster || []).find(r => r.id === incluirId);
    if (!p || lista.some(v => v.colaborador_id === p.id)) { setIncluirId(''); return; }
    setLista([...lista, { colaborador_id: p.id, nome: p.nome, funcao: p.funcao, tem_meta: false, atingida: 0, status_aceite: null, meta_id: null, modo: 'geral', grupos: [] }].sort((a, b) => a.nome.localeCompare(b.nome)));
    setEdits({ ...edits, [p.id]: { modo: 'geral', valor_meta: '', valor_super_meta: '', grupos: {} } });
    setIncluirId('');
  }
  async function remover(v) {
    if (v.tem_meta) {
      if (!window.confirm(`Remover a meta de ${v.nome}?`)) return;
      await API.delete(`/metas/colaborador/${v.colaborador_id}`, { params: { mes, ano } });
    }
    setLista(lista.filter(x => x.colaborador_id !== v.colaborador_id));
  }

  const rosterDisp = (dados.roster || []).filter(r => !lista.some(v => v.colaborador_id === r.id));

  return (
    <>
      <div style={s.card}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {ehGestao && (
            <select style={{ ...s.campo, width: 'auto', marginBottom: 0 }} value={lojaId} onChange={e => setLojaId(e.target.value)}>
              {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          )}
          <select style={{ ...s.campo, width: 'auto', marginBottom: 0 }} value={mes} onChange={e => setMes(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}
          </select>
          <button style={s.btnMini} onClick={copiarAnterior}>Copiar metas do mês anterior</button>
        </div>
      </div>

      <div style={{ ...s.card, ...(dados.positiva_gerente ? { borderLeft: '4px solid #3B6D11' } : dados.total_com_meta ? { borderLeft: '4px solid #BA7517' } : {}) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Regra dos 90%</div>
            <div style={{ fontSize: 11, color: '#999' }}>{dados.atingiram}/{dados.total_com_meta} bateram a meta</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: dados.positiva_gerente ? '#3B6D11' : '#BA7517' }}>{dados.pct}%</div>
            <div style={{ fontSize: 10, color: dados.positiva_gerente ? '#3B6D11' : '#993C1D' }}>{dados.total_com_meta === 0 ? 'sem metas' : dados.positiva_gerente ? 'gerente positivado ✓' : 'abaixo de 90%'}</div>
          </div>
        </div>
      </div>

      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Meta da loja no período</div>
            <div style={{ fontSize: 11, color: '#999' }}>
              {dados.loja_meta ? <>Meta R$ {Number(dados.loja_meta).toLocaleString('pt-BR')}{dados.loja_super ? ` · Super R$ ${Number(dados.loja_super).toLocaleString('pt-BR')}` : ''}</> : 'Nenhuma meta de loja cadastrada (lance na aba Campanhas).'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={s.btnMini} onClick={sugerirHistorico}>📈 Sugerir pelo histórico</button>
            <button style={s.btnMini} onClick={dividir}>Dividir entre a equipe</button>
          </div>
        </div>
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Metas dos colaboradores</div>
        {rosterDisp.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <select style={{ ...s.campo, marginBottom: 0, flex: 1 }} value={incluirId} onChange={e => setIncluirId(e.target.value)}>
              <option value="">+ incluir colaborador…</option>
              {rosterDisp.map(r => <option key={r.id} value={r.id}>{r.nome} · {r.funcao}{r.loja_nome ? ` · ${r.loja_nome}` : ''}</option>)}
            </select>
            <button style={s.btnMini} onClick={incluir} disabled={!incluirId}>Incluir</button>
          </div>
        )}
        {lista.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhum colaborador. Inclua alguém acima.</div>}
        {lista.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#666' }}>
                  <th style={{ padding: '6px 8px' }}>Colaborador</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Meta (R$)</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Super (R$)</th>
                  <th style={{ padding: '6px 8px' }}>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map(v => {
                  const ed = edits[v.colaborador_id] || {};
                  const modo = ed.modo || 'geral';
                  return (
                    <React.Fragment key={v.colaborador_id}>
                      <tr style={{ borderTop: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <div style={{ fontWeight: 600 }}>{v.nome} <span style={{ fontSize: 10, color: '#aaa', fontWeight: 400 }}>· {v.funcao}</span></div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                            {['geral', 'grupo'].map(mo => (
                              <button key={mo} onClick={() => setEdits({ ...edits, [v.colaborador_id]: { ...ed, modo: mo } })}
                                style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${modo === mo ? '#111' : '#ddd'}`, background: modo === mo ? '#111' : '#fff', color: modo === mo ? '#fff' : '#666' }}>{mo === 'geral' ? 'Geral' : 'Por grupo'}</button>
                            ))}
                          </div>
                        </td>
                        {modo === 'grupo' ? (
                          <td colSpan={2} style={{ padding: '4px 8px', color: '#999', fontStyle: 'italic' }}>por grupo (abaixo)</td>
                        ) : (<>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}><input style={{ ...s.campo, marginBottom: 0, width: 100 }} type="number" placeholder="Meta" value={ed.valor_meta ?? ''} onChange={e => setEdits({ ...edits, [v.colaborador_id]: { ...ed, valor_meta: e.target.value } })} /></td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}><input style={{ ...s.campo, marginBottom: 0, width: 100 }} type="number" placeholder="Super" value={ed.valor_super_meta ?? ''} onChange={e => setEdits({ ...edits, [v.colaborador_id]: { ...ed, valor_super_meta: e.target.value } })} /></td>
                        </>)}
                        <td style={{ padding: '4px 8px' }}>
                          {v.tem_meta && v.status_aceite !== 'aceito' && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: '#E6F1FB', color: '#185FA5' }}>aguarda aceite</span>}
                          {v.tem_meta && v.status_aceite === 'aceito' && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: '#EAF3DE', color: '#3B6D11' }}>aceita ✓</span>}
                          {v.tem_meta && <span title={`Vendido R$ ${Number(v.vendido || 0).toLocaleString('pt-BR')} / Meta R$ ${Number(v.valor_meta || 0).toLocaleString('pt-BR')}`} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, marginLeft: 4, background: v.atingida ? '#EAF3DE' : '#FAEEDA', color: v.atingida ? '#3B6D11' : '#854F0B' }}>{v.atingida ? '✓ bateu' : 'abaixo'}</span>}
                        </td>
                        <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                          <button style={s.btnMini} onClick={() => salvar(v.colaborador_id)}>Salvar</button>
                          <button onClick={() => remover(v)} title="Remover" style={{ marginLeft: 6, border: 'none', background: 'none', color: '#993C1D', cursor: 'pointer' }}>✕</button>
                        </td>
                      </tr>
                      {modo === 'grupo' && (
                        <tr><td colSpan={5} style={{ padding: '4px 8px 10px', background: '#fafafa' }}>
                          {(dados.grupos_disponiveis || []).map(g => (
                            <div key={g.key} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 11, width: 130, color: '#444' }}>{g.label}</span>
                              <input style={{ ...s.campo, marginBottom: 0, width: 110 }} type="number" placeholder="Meta (R$)" value={ed.grupos?.[g.key]?.valor_meta ?? ''} onChange={e => setEdits({ ...edits, [v.colaborador_id]: { ...ed, grupos: { ...ed.grupos, [g.key]: { ...ed.grupos?.[g.key], valor_meta: e.target.value } } } })} />
                              <input style={{ ...s.campo, marginBottom: 0, width: 110 }} type="number" placeholder="Super (R$)" value={ed.grupos?.[g.key]?.valor_super ?? ''} onChange={e => setEdits({ ...edits, [v.colaborador_id]: { ...ed, grupos: { ...ed.grupos, [g.key]: { ...ed.grupos?.[g.key], valor_super: e.target.value } } } })} />
                            </div>
                          ))}
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {lista.length > 0 && <button style={{ ...s.btn, marginTop: 10 }} onClick={salvarTodos}>Salvar todas as metas</button>}
        {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 8 }}>{msg}</div>}
      </div>
      <div style={s.info}>💡 A lista traz os colaboradores ativos da loja; você pode incluir ou remover quem quiser (e qualquer função precisa dar o aceite da meta). Use "Dividir entre a equipe" para repartir a meta/super da loja igualmente — depois ajuste cada valor (não precisa bater com o total da loja). O <strong>"bateu a meta" é automático</strong>: marca sozinho quando o vendido do mês alcança a meta. Se <strong>≥90%</strong> baterem, o indicador <strong>"Metas da equipe"</strong> do gerente fica positivo. O colaborador vê só a % de atingimento, nunca o valor.</div>
    </>
  );
}

// Gera o termo de aceite de campanha (janela de impressão/PDF) a partir dos dados salvos.
export function abrirTermoCampanha(a) {
  const declaracao = `Declaro estar ciente de que "${a.campanha_nome || 'esta campanha'}" é uma CAMPANHA DE PREMIAÇÃO de caráter eventual e por tempo determinado (período ${String(a.mes || '').padStart(2, '0')}/${a.ano || ''}), que NÃO constitui comissão, salário ou verba de natureza salarial. Aceito participar voluntariamente.`;
  const w = window.open('', '_blank'); if (!w) return;
  w.document.write(`<html><head><title>Termo de Aceite — ${a.campanha_nome || ''}</title></head>
    <body style="font-family:system-ui;max-width:600px;margin:24px auto;color:#222;line-height:1.6">
    <h2>Termo de Aceite de Campanha de Premiação</h2>
    <p><strong>Campanha:</strong> ${a.campanha_nome || ''}<br>
    <strong>Período:</strong> ${String(a.mes || '').padStart(2, '0')}/${a.ano || ''} · <strong>Loja:</strong> ${a.loja_nome || ''}<br>
    <strong>Colaborador:</strong> ${a.colaborador_nome || ''}<br>
    <strong>Data/hora do aceite:</strong> ${a.aceito_em ? new Date(a.aceito_em.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '—'}<br>
    <strong>IP de origem:</strong> ${a.ip || '—'}</p>
    <p style="background:#f4f4f4;padding:12px;border-radius:8px">${declaracao}</p>
    ${a.selfie ? `<p><strong>Registro fotográfico:</strong><br><img src="${a.selfie}" width="240" style="border-radius:8px;margin-top:6px"></p>` : '<p><em>Sem registro fotográfico.</em></p>'}
    <p style="margin-top:24px;font-size:12px;color:#666">Documento gerado eletronicamente pelo Sistema Mutti como comprovação de ciência e aceite voluntário.</p>
    </body></html>`);
  w.document.close(); setTimeout(() => w.print(), 300);
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  campo: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', marginBottom: 8 },
  item: { padding: '10px 0', borderBottom: '1px solid #f5f5f5' },
  tab: { fontSize: 12, padding: '6px 14px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666' },
  tabAtiva: { background: '#111', color: '#fff', borderColor: '#111' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnSec: { fontSize: 13, padding: '8px 14px', background: 'none', color: '#666', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' },
  btnMini: { fontSize: 11, padding: '5px 10px', background: '#fff', color: '#185FA5', border: '1px solid #185FA5', borderRadius: 6, cursor: 'pointer' },
  btnMiniOk: { color: '#3B6D11', borderColor: '#3B6D11' }, btnMiniBad: { color: '#993C1D', borderColor: '#993C1D' },
  info: { background: '#E6F1FB', borderLeft: '3px solid #185FA5', borderRadius: '0 8px 8px 0', padding: '10px 12px', fontSize: 12, color: '#185FA5', lineHeight: 1.6 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: '1.25rem', maxWidth: 360, width: '100%', maxHeight: '90vh', overflowY: 'auto' },
};
