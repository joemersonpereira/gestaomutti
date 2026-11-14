import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';
import MeuSetorArea from './MeuSetorArea';
import MinhaAreaLateral from '../components/MinhaAreaLateral';
import { CalendarioEmpresa } from './TradeMarketing';

const TIPOS = {
  postagem: ['📱', 'Postagem', '#2E5C9E'],
  acao: ['🎯', 'Ação', '#7A4FB0'],
  evento: ['🎪', 'Evento', '#C0392B'],
  campanha: ['📢', 'Campanha', '#1E8449'],
  acao_fornecedor: ['🤝', 'Ação c/ fornecedor', '#B7791F'],
  execucao: ['🏠', 'Execução (uso interno)', '#8A6D3B'],
};
const STATUS = ['ideia', 'planejado', 'producao', 'agendado', 'publicado', 'concluido', 'cancelado'];
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const onlyDigits = s => (s || '').replace(/\D/g, '');

export default function MarketingCalendario() {
  const { API, usuario } = useAuth();
  const gestao = ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Marketing'].includes(usuario.funcao);
  const [aba, setAba] = useState('calendario');
  const [ref, setRef] = useState(new Date());
  const [itens, setItens] = useState([]);
  const [influs, setInflus] = useState([]);
  const [edit, setEdit] = useState(null); // item ou {novo:data}
  const ano = ref.getFullYear(), mes = ref.getMonth();
  const carregar = useCallback(() => {
    const de = `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
    const ate = `${ano}-${String(mes + 1).padStart(2, '0')}-31`;
    API.get('/mkt/agenda', { params: { de, ate } }).then(r => setItens(r.data.itens || [])).catch(() => {});
    API.get('/mkt/influenciadores').then(r => setInflus(r.data.influenciadores || [])).catch(() => {});
  }, [API, ano, mes]);
  useEffect(() => { carregar(); }, [carregar]);
  // Veio do Trade: abre a MESMA FormAcao — nova (preenchida c/ fornecedor+venda) ou uma existente (por id).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('mkt_nova_acao');
      if (raw) { sessionStorage.removeItem('mkt_nova_acao'); setAba('calendario'); setEdit(JSON.parse(raw)); return; }
      const aid = sessionStorage.getItem('mkt_abrir_acao');
      if (aid) { sessionStorage.removeItem('mkt_abrir_acao'); setAba('calendario'); API.get('/mkt/agenda/' + aid).then(r => setEdit(r.data.item)).catch(() => {}); }
    } catch (e) {}
  }, [API]);

  // grade do mês
  const primeiro = new Date(ano, mes, 1);
  const inicioGrade = new Date(primeiro); inicioGrade.setDate(1 - primeiro.getDay());
  const dias = []; for (let i = 0; i < 42; i++) { const d = new Date(inicioGrade); d.setDate(inicioGrade.getDate() + i); dias.push(d); }
  const doDia = d => itens.filter(i => i.data_ini === iso(d));
  const verbaTotal = itens.filter(i => i.tipo === 'evento' || i.verba).reduce((a, i) => a + (Number(i.verba) || 0), 0);

  return (
    <div style={s.wrap}>
      <Banner emoji="📣" titulo="Marketing — Calendário" cor="laranja" sub="Programe postagens, ações, campanhas e eventos. Envolva influenciadores, funcionários e fornecedores." />
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['calendario', '🗓️ Calendário'], ['lista', '📋 Lista'], ['materiais', '📦 Materiais'], ['redes', '📱 Redes'], ['influ', '⭐ Influenciadores'], ['meu-setor', '🎯 Meu Setor'], ['metas', '⚙️ Metas']].map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
        {gestao && aba === 'lista' && <button onClick={() => setEdit({ novo: iso(new Date()) })} style={{ ...s.btn, marginLeft: 'auto' }}>+ Nova ação</button>}
      </div>

      {aba === 'lista' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button onClick={() => setRef(new Date(ano, mes - 1, 1))} style={s.nav}>‹</button>
          <div style={{ fontSize: 16, fontWeight: 700, minWidth: 170, textAlign: 'center' }}>{MES[mes]} {ano}</div>
          <button onClick={() => setRef(new Date(ano, mes + 1, 1))} style={s.nav}>›</button>
        </div>
      )}

      {aba === 'calendario' && (<>
        <div style={{ fontSize: 12.5, color: '#64748b', margin: '0 2px 8px' }}>📅 O <b>mesmo calendário da empresa</b> — as ações de marketing (📣) aparecem aqui junto dos eventos, feriados e programações. Para criar/editar uma ação com materiais, briefing e gastos, use <b>+ Nova ação</b> ou a aba <b>Lista</b>.</div>
        <CalendarioEmpresa API={API} gestao={gestao} onEvento={refId => {
          const realId = String(refId).split(':')[0]; // eventos mensais usam acaoId:AAAA-MM
          const it = itens.find(x => x.id === realId);
          if (it) return setEdit(it);
          API.get('/mkt/agenda/' + realId).then(r => setEdit(r.data.item)).catch(() => setAba('lista'));
        }} botaoExtra={gestao ? <button onClick={() => setEdit({ novo: iso(new Date()) })} style={{ ...s.btn, background: '#111' }}>+ Nova ação</button> : null} />
      </>)}

      {aba === 'lista' && (
        <div>
          {itens.length === 0 && <div style={s.card}>Nenhuma ação neste mês.</div>}
          {itens.map(it => { const [emoji, label, cor] = TIPOS[it.tipo] || ['•', it.tipo, '#666']; return (
            <div key={it.id} style={{ ...s.card, borderLeft: `4px solid ${cor}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{emoji} {it.titulo} <span style={{ ...s.badge, background: cor + '18', color: cor }}>{label}</span> <span style={{ ...s.badge, background: '#F0F0F0', color: '#666' }}>{it.status}</span></div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    📅 {it.data_ini.split('-').reverse().join('/')}{it.hora ? ' ' + it.hora : ''}{it.canal ? ' · ' + it.canal : ''}
                    {it.responsavel_nome ? ` · 🙋 ${it.responsavel_nome}` : ''}{(it.envolvidos || []).length ? ` · 👥 ${it.envolvidos.map(e => e.nome).join(', ')}` : ''}{it.verba ? ` · 💰 R$ ${Number(it.verba).toLocaleString('pt-BR')}` : ''}
                  </div>
                  {it.descricao && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{it.descricao}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(it.envolvidos || []).filter(e => e.contato).slice(0, 3).map((e, i) => <a key={i} href={`https://wa.me/55${onlyDigits(e.contato)}`} target="_blank" rel="noreferrer" style={{ ...s.btnMini, textDecoration: 'none', color: '#1E8449', borderColor: '#1E8449' }}>💬 {e.nome.split(' ')[0]}</a>)}
                  {gestao && <button onClick={() => setEdit(it)} style={s.btnMini}>Editar</button>}
                </div>
              </div>
            </div>
          ); })}
        </div>
      )}

      {aba === 'materiais' && <PainelMateriais API={API} gestao={gestao} />}
      {aba === 'redes' && <RedesSociais API={API} gestao={gestao} />}
      {aba === 'influ' && <Influenciadores API={API} gestao={gestao} influs={influs} onChange={carregar} />}
      {aba === 'meu-setor' && <MeuSetorArea area="marketing" embutido abaFixa="setor" />}
      {aba === 'metas' && <MeuSetorArea area="marketing" embutido abaFixa="metas" />}

      {edit && <FormAcao API={API} gestao={gestao} item={edit.novo ? { data_ini: edit.novo } : edit} influs={influs} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); carregar(); }} />}
      <MinhaAreaLateral area="marketing" titulo="Minha área" />
    </div>
  );
}

// Busca de envolvido no ERP (pessoa / fornecedor / laboratório) → preenche nome+contato.
function EnvolvidoErp({ API, tipo, onPick }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState([]); const [busy, setBusy] = useState(false); const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      try { const r = await API.get('/mkt/erp/envolvidos', { params: { tipo, q: q.trim() } }); setRes(r.data.itens || []); setAberto(true); }
      catch { setRes([]); } finally { setBusy(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q, tipo, API]);
  const ph = tipo === 'fornecedor' ? '🔎 buscar fornecedor no ERP' : tipo === 'laboratorio' ? '🔎 buscar laboratório no ERP' : '🔎 buscar pessoa no ERP (nome/CPF)';
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
      <input placeholder={ph} value={q} onChange={e => setQ(e.target.value)} onFocus={() => res.length && setAberto(true)} style={{ ...s.inp, width: '100%' }} />
      {busy && <div style={{ fontSize: 10.5, color: '#999' }}>buscando…</div>}
      {aberto && res.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 30, top: 38, left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,.12)' }}>
          {res.map((it, i) => (
            <div key={i} onClick={() => { onPick(it); setQ(it.nome); setRes([]); setAberto(false); }} style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: 12.5 }}
              onMouseEnter={e => e.currentTarget.style.background = '#F5F8FF'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              <div style={{ fontWeight: 600 }}>{it.nome}</div>
              {(it.contato || it.email) && <div style={{ fontSize: 10.5, color: '#888' }}>{it.contato}{it.contato && it.email ? ' · ' : ''}{it.email}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FormAcao({ API, gestao, item, influs, onClose, onSaved }) {
  const novo = !item.id;
  const [f, setF] = useState({
    titulo: item.titulo || '', tipo: item.tipo || 'postagem', canal: item.canal || '', data_ini: item.data_ini || '', data_fim: item.data_fim || '',
    hora: item.hora || '', status: item.status || 'ideia', responsavel_id: item.responsavel_id || '', responsavel_nome: item.responsavel_nome || '', descricao: item.descricao || '',
    envolvido_tipo: '', envolvido_id: '', envolvido_nome: '', envolvido_contato: '', envolvido_email: '',
    envolvidos: item.envolvidos || [], verba: item.verba || '', patrocinador: item.patrocinador || '', patrocinio_valor: item.patrocinio_valor || '',
    comprador_id: item.comprador_id || '', comprador_prazo: item.comprador_prazo || '',
    pauta: item.pauta || '', briefing: item.briefing || '', ideias: item.ideias || '',
    programacao_id: item.programacao_id || '', tmkt_venda_id: item.tmkt_venda_id || '',
  });
  const [colabs, setColabs] = useState([]);
  const [progs, setProgs] = useState([]);
  const [canais, setCanais] = useState([]);
  useEffect(() => { API.get('/mkt/colaboradores').then(r => setColabs(r.data.colaboradores || [])).catch(() => {}); }, [API]);
  useEffect(() => { API.get('/mkt/programacoes').then(r => setProgs(r.data.programacoes || [])).catch(() => {}); }, [API]);
  // Canais padrão = espaços do Trade (Stories, TikTok, Tabloide, E-commerce, ponta de gôndola…) + canais comuns.
  useEffect(() => { API.get('/trademkt/portal/posicoes').then(r => {
    const esp = [...new Set((r.data.posicoes || []).map(p => (p.espaco || '').trim()).filter(Boolean))];
    setCanais([...new Set(['Instagram', 'Instagram Stories', 'TikTok', 'Facebook', 'WhatsApp', 'Loja', 'Rádio', 'Monitor/TV', 'Tabloide', 'E-commerce', 'Site', ...esp])]);
  }).catch(() => setCanais(['Instagram', 'Instagram Stories', 'TikTok', 'Facebook', 'WhatsApp', 'Loja', 'Rádio', 'Monitor/TV', 'Tabloide', 'E-commerce', 'Site'])); }, [API]);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const pickInflu = id => { const inf = influs.find(i => i.id === id); if (inf) setF(x => ({ ...x, envolvido_tipo: 'influencer', envolvido_id: inf.id, envolvido_nome: inf.nome, envolvido_contato: inf.contato || '', envolvido_email: inf.email || '' })); };
  const addEnvolvido = () => {
    if (!f.envolvido_nome.trim()) return;
    setF(x => ({ ...x, envolvidos: [...x.envolvidos, { tipo: x.envolvido_tipo || null, ref_id: x.envolvido_id || null, nome: x.envolvido_nome.trim(), contato: x.envolvido_contato, email: x.envolvido_email }],
      envolvido_tipo: '', envolvido_id: '', envolvido_nome: '', envolvido_contato: '', envolvido_email: '' }));
  };
  const rmEnvolvido = i => setF(x => ({ ...x, envolvidos: x.envolvidos.filter((_, j) => j !== i) }));
  const salvar = () => {
    if (!f.titulo || !f.data_ini) return;
    // inclui um envolvido em edição (digitado mas não adicionado) para não perder
    const envolvidos = [...f.envolvidos, ...(f.envolvido_nome.trim() ? [{ tipo: f.envolvido_tipo || null, ref_id: f.envolvido_id || null, nome: f.envolvido_nome.trim(), contato: f.envolvido_contato, email: f.envolvido_email }] : [])];
    const payload = { ...f, envolvidos };
    const req = novo ? API.post('/mkt/agenda', payload) : API.put(`/mkt/agenda/${item.id}`, payload);
    req.then(onSaved);
  };
  const gerarAtividade = () => API.post(`/mkt/agenda/${item.id}/atividade`).then(() => onSaved());
  const excluir = () => API.delete(`/mkt/agenda/${item.id}`).then(onSaved);

  return (
    <div onClick={onClose} style={s.overlay}>
      <div onClick={e => e.stopPropagation()} style={s.modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{novo ? 'Nova ação' : 'Editar ação'}</div>
          <button onClick={onClose} style={s.btnMini}>✕</button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <input value={f.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Título da ação" style={s.inp} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={f.tipo} onChange={e => set('tipo', e.target.value)} style={s.inp}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v[0]} {v[1]}</option>)}</select>
            <input value={f.canal} onChange={e => set('canal', e.target.value)} list="mkt-canais" placeholder="Canal / espaço do Trade" style={{ ...s.inp, flex: 1 }} />
            <datalist id="mkt-canais">{canais.map(c => <option key={c} value={c} />)}</datalist>
            <select value={f.status} onChange={e => set('status', e.target.value)} style={s.inp}>{STATUS.map(x => <option key={x} value={x}>{x}</option>)}</select>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={s.lbl}>Data<input type="date" value={f.data_ini} onChange={e => set('data_ini', e.target.value)} style={s.inp} /></label>
            <label style={s.lbl}>Até (opc.)<input type="date" value={f.data_fim} onChange={e => set('data_fim', e.target.value)} style={s.inp} /></label>
            <label style={s.lbl}>Hora<input type="time" value={f.hora} onChange={e => set('hora', e.target.value)} style={s.inp} /></label>
            <label style={{ ...s.lbl, flex: 1, minWidth: 200 }}>Responsável
              <select value={f.responsavel_id || ''} onChange={e => { const c = colabs.find(x => x.id === e.target.value); setF(x => ({ ...x, responsavel_id: e.target.value, responsavel_nome: c ? c.nome : (e.target.value ? x.responsavel_nome : '') })); }} style={s.inp}>
                <option value="">{f.responsavel_nome && !f.responsavel_id ? f.responsavel_nome + ' (manual)' : 'Selecione o colaborador…'}</option>
                {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ` — ${c.funcao}` : ''}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ ...s.lbl, flex: 1, minWidth: 220 }}>📌 Programação (tema do calendário)
              <select value={f.programacao_id || ''} onChange={e => set('programacao_id', e.target.value)} style={s.inp}>
                <option value="">— nenhuma —</option>
                {progs.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
            {f.tmkt_venda_id && <span style={{ fontSize: 11.5, color: '#8A6D3B', background: '#FBF0DA', border: '1px solid #ecd9ad', borderRadius: 8, padding: '6px 10px' }}>🔗 vinculada à venda do Trade</span>}
          </div>
          <textarea value={f.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Descrição" style={{ ...s.inp, minHeight: 44, resize: 'vertical' }} />
          <div style={{ borderTop: '1px solid #eee', paddingTop: 8, fontSize: 12, color: '#888' }}>📝 Pauta & briefing</div>
          <textarea value={f.pauta} onChange={e => set('pauta', e.target.value)} placeholder="Pauta — qual é o foco/objetivo da ação" style={{ ...s.inp, minHeight: 40, resize: 'vertical' }} />
          <textarea value={f.briefing} onChange={e => set('briefing', e.target.value)} placeholder="Briefing — detalhes p/ quem vai produzir (tom, mensagem, peças, público…)" style={{ ...s.inp, minHeight: 54, resize: 'vertical' }} />
          <textarea value={f.ideias} onChange={e => set('ideias', e.target.value)} placeholder="Ideias — anotações livres, referências" style={{ ...s.inp, minHeight: 40, resize: 'vertical' }} />
          <div style={{ borderTop: '1px solid #eee', paddingTop: 8, fontSize: 12, color: '#888' }}>Envolvidos na ação (pode adicionar vários)</div>
          {f.envolvidos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {f.envolvidos.map((e, i) => {
                const ico = e.tipo === 'influencer' ? '⭐' : e.tipo === 'fornecedor' ? '🏭' : e.tipo === 'laboratorio' ? '🧪' : '👤';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F5F8FF', border: '1px solid #dde6f5', borderRadius: 8, padding: '5px 10px' }}>
                    <span style={{ fontSize: 12.5, flex: 1 }}>{ico} <b>{e.nome}</b>{e.contato ? ` · ${e.contato}` : ''}{e.email ? ` · ${e.email}` : ''}</span>
                    <button type="button" onClick={() => rmEnvolvido(i)} style={{ ...s.btnMini, color: '#C0392B', borderColor: '#f0d0d0' }}>remover</button>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={f.envolvido_tipo || ''} onChange={e => setF(x => ({ ...x, envolvido_tipo: e.target.value, envolvido_id: '', ...(e.target.value ? {} : { envolvido_nome: '', envolvido_contato: '', envolvido_email: '' }) }))} style={{ ...s.inp, width: 190 }}>
              <option value="">Tipo do envolvido…</option>
              <option value="influencer">⭐ Influenciador</option>
              <option value="pessoa">👤 Pessoa (ERP)</option>
              <option value="fornecedor">🏭 Fornecedor (ERP)</option>
              <option value="laboratorio">🧪 Laboratório (ERP)</option>
            </select>
            {f.envolvido_tipo === 'influencer' ? (
              <select value={f.envolvido_id} onChange={e => pickInflu(e.target.value)} style={{ ...s.inp, flex: 1 }}>
                <option value="">Influenciador cadastrado…</option>
                {influs.map(i => <option key={i.id} value={i.id}>{i.nome} {i.arroba ? '(' + i.arroba + ')' : ''}</option>)}
              </select>
            ) : ['pessoa', 'fornecedor', 'laboratorio'].includes(f.envolvido_tipo) ? (
              <EnvolvidoErp API={API} tipo={f.envolvido_tipo} onPick={it => setF(x => ({ ...x, envolvido_id: it.id, envolvido_nome: it.nome, envolvido_contato: it.contato || x.envolvido_contato, envolvido_email: it.email || x.envolvido_email }))} />
            ) : (
              <div style={{ flex: 1, fontSize: 11.5, color: '#aaa', alignSelf: 'center' }}>escolha o tipo p/ buscar, ou digite o nome abaixo</div>
            )}
          </div>
          <input value={f.envolvido_nome} onChange={e => set('envolvido_nome', e.target.value)} placeholder="Nome do envolvido (ou digite manualmente)" style={s.inp} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={f.envolvido_contato} onChange={e => set('envolvido_contato', e.target.value)} placeholder="WhatsApp/telefone" style={{ ...s.inp, flex: 1 }} />
            <input value={f.envolvido_email} onChange={e => set('envolvido_email', e.target.value)} placeholder="e-mail" style={{ ...s.inp, flex: 1 }} />
            <button type="button" onClick={addEnvolvido} disabled={!f.envolvido_nome.trim()} style={{ ...s.btn, opacity: f.envolvido_nome.trim() ? 1 : 0.5 }}>+ Adicionar</button>
          </div>
          <div style={{ borderTop: '1px solid #eee', paddingTop: 8, fontSize: 12, color: '#888' }}>💰 Verba (entra no orçamento do mês)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={s.lbl}>Verba / custo (R$)<input type="number" value={f.verba} onChange={e => set('verba', e.target.value)} placeholder="0,00" style={s.inp} /></label>
            <label style={{ ...s.lbl, flex: 1 }}>Patrocinador (se houver)<input value={f.patrocinador} onChange={e => set('patrocinador', e.target.value)} style={s.inp} /></label>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={s.lbl}>Patrocínio recebido (R$)<input type="number" value={f.patrocinio_valor} onChange={e => set('patrocinio_valor', e.target.value)} placeholder="0,00" style={s.inp} /></label>
            <div style={{ flex: 1, fontSize: 11, color: '#1E8449', alignSelf: 'flex-end', paddingBottom: 8 }}>
              {(Number(f.verba) > 0 || Number(f.patrocinio_valor) > 0) && <>Custo líquido: <b>R$ {(Math.max(0, (Number(f.verba) || 0) - (Number(f.patrocinio_valor) || 0))).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b> (o patrocínio abate a verba)</>}
            </div>
          </div>
          <div style={{ borderTop: '1px solid #eee', paddingTop: 8, fontSize: 12, color: '#888' }}>🛒 Vincular comprador (lista de produtos em oferta)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={f.comprador_id} onChange={e => set('comprador_id', e.target.value)} style={{ ...s.inp, flex: 1, minWidth: 200 }}>
              <option value="">Sem comprador vinculado</option>
              {colabs.filter(c => /Comprador/i.test(c.funcao || '')).map(c => <option key={c.id} value={c.id}>{c.nome} — {c.funcao}</option>)}
            </select>
            {f.comprador_id && <label style={s.lbl}>Prazo p/ enviar a lista<input type="date" value={f.comprador_prazo} onChange={e => set('comprador_prazo', e.target.value)} style={s.inp} /></label>}
          </div>
          {f.comprador_id && <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>Ao salvar, abre a tarefa pro comprador enviar a lista. Se ele não responder até o prazo, conta no indicador dele (premiação).</div>}
          {!novo && item.comprador_id && (
            <div style={{ fontSize: 12, background: item.comprador_status === 'respondido' ? '#F3FBF6' : item.comprador_atrasada ? '#FCEDEC' : '#FFF9EC', borderRadius: 8, padding: '7px 10px', marginBottom: 6 }}>
              {item.comprador_status === 'respondido'
                ? <><b>✅ Respondido</b>{item.comprador_no_prazo === 0 ? ' (fora do prazo)' : ' (no prazo)'} por {item.comprador_nome}<div style={{ color: '#555', marginTop: 3 }}>📕 Caderno: <b>{item.comprador_caderno_nome || '—'}</b>{item.comprador_resposta ? ` · ${item.comprador_resposta}` : ''}</div></>
                : <><b>{item.comprador_atrasada ? '⏰ Atrasado' : '⏳ Aguardando'}</b> a lista de {item.comprador_nome}{item.comprador_prazo ? ` · prazo ${String(item.comprador_prazo).split('-').reverse().join('/')}` : ''}</>}
            </div>
          )}
          {!novo && <DetalheAcao API={API} gestao={gestao} agendaId={item.id} temCaderno={!!item.comprador_caderno_id} />}
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button onClick={salvar} style={s.btn}>Salvar</button>
            {!novo && <button onClick={gerarAtividade} style={{ ...s.btn, background: '#B7791F' }}>📌 Gerar atividade (tarefa)</button>}
            {!novo && f.envolvido_contato && <a href={`https://wa.me/55${onlyDigits(f.envolvido_contato)}`} target="_blank" rel="noreferrer" style={{ ...s.btn, background: '#1E8449', textDecoration: 'none' }}>WhatsApp</a>}
            {!novo && <button onClick={excluir} style={{ ...s.btn, background: '#C0392B', marginLeft: 'auto' }}>Excluir</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Influenciadores({ API, gestao, influs, onChange }) {
  const [novo, setNovo] = useState(null);
  const salvar = () => { if (!novo.nome) return; API.post('/mkt/influenciadores', novo).then(() => { setNovo(null); onChange(); }); };
  return (
    <div>
      {gestao && <button onClick={() => setNovo({ nome: '', rede: 'Instagram' })} style={{ ...s.btn, marginBottom: 10 }}>+ Novo influenciador</button>}
      {novo && (
        <div style={{ ...s.card, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input placeholder="Nome" value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} style={{ ...s.inp, flex: 1 }} />
            <input placeholder="@arroba" value={novo.arroba || ''} onChange={e => setNovo({ ...novo, arroba: e.target.value })} style={s.inp} />
            <input placeholder="Rede" value={novo.rede || ''} onChange={e => setNovo({ ...novo, rede: e.target.value })} style={s.inp} />
            <input placeholder="Seguidores" type="number" value={novo.seguidores || ''} onChange={e => setNovo({ ...novo, seguidores: e.target.value })} style={{ ...s.inp, width: 110 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input placeholder="WhatsApp" value={novo.contato || ''} onChange={e => setNovo({ ...novo, contato: e.target.value })} style={s.inp} />
            <input placeholder="E-mail" value={novo.email || ''} onChange={e => setNovo({ ...novo, email: e.target.value })} style={{ ...s.inp, flex: 1 }} />
            <input placeholder="Cachê R$" type="number" value={novo.cache || ''} onChange={e => setNovo({ ...novo, cache: e.target.value })} style={{ ...s.inp, width: 110 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}><button onClick={salvar} style={s.btn}>Salvar</button><button onClick={() => setNovo(null)} style={{ ...s.btn, background: '#999' }}>Cancelar</button></div>
        </div>
      )}
      {influs.length === 0 && <div style={s.card}>Nenhum influenciador cadastrado.</div>}
      {influs.map(i => (
        <div key={i.id} style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>⭐ {i.nome} {i.arroba && <span style={{ fontSize: 12, color: '#2E5C9E' }}>{i.arroba}</span>}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{i.rede || '—'}{i.seguidores ? ` · ${Number(i.seguidores).toLocaleString('pt-BR')} seguidores` : ''}{i.cachê ? ` · cachê R$ ${Number(i.cachê).toLocaleString('pt-BR')}` : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {i.contato && <a href={`https://wa.me/55${onlyDigits(i.contato)}`} target="_blank" rel="noreferrer" style={{ ...s.btnMini, color: '#1E8449', borderColor: '#1E8449', textDecoration: 'none' }}>WhatsApp</a>}
              {i.email && <a href={`mailto:${i.email}`} style={{ ...s.btnMini, textDecoration: 'none' }}>E-mail</a>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ✨ Criar post com a Rhia (gera legendas, hashtags, ideia de criativo e campanha)
function CriarPost({ API, gestao }) {
  const [f, setF] = useState({ objetivo: '', canal: 'Instagram (feed)', tom: '', data: '', extra: '' });
  const [produtos, setProdutos] = useState([{ nome: '', de: '', por: '', validade: '' }]);
  const [cadernos, setCadernos] = useState([]);
  const [caderno, setCaderno] = useState('');
  const [res, setRes] = useState(null);
  const [carreg, setCarreg] = useState(false);
  const [msg, setMsg] = useState('');
  const [copiado, setCopiado] = useState('');
  useEffect(() => { API.get('/etiquetas/cadernos').then(r => setCadernos(r.data.cadernos || [])).catch(() => {}); }, [API]);
  const set = (k, v) => setF({ ...f, [k]: v });
  const setProd = (i, k, v) => setProdutos(produtos.map((p, j) => j === i ? { ...p, [k]: v } : p));
  const addProd = () => setProdutos([...produtos, { nome: '', de: '', por: '', validade: '' }]);
  const delProd = i => setProdutos(produtos.filter((_, j) => j !== i));
  const puxarCaderno = id => {
    setCaderno(id); if (!id) return;
    API.get(`/etiquetas/caderno/${id}`).then(r => {
      const itens = (r.data.itens || r.data || []).slice(0, 8).map(it => ({ nome: it.descricao || it.nome || '', de: it.de || '', por: it.por || it.precooferta || '', validade: '' }));
      if (itens.length) setProdutos(itens);
    }).catch(() => {});
  };
  const gerar = () => {
    setCarreg(true); setMsg(''); setRes(null);
    const prods = produtos.filter(p => p.nome && p.nome.trim());
    API.post('/mkt/gerar', { ...f, produtos: prods })
      .then(r => { if (r.data.ok === false) setMsg('⚠️ ' + (r.data.erro || 'Erro')); else setRes(r.data); })
      .catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || e.message))).finally(() => setCarreg(false));
  };
  const copiar = (txt, tag) => { navigator.clipboard?.writeText(txt); setCopiado(tag); setTimeout(() => setCopiado(''), 1500); };
  if (!gestao) return <div style={s.card}><div style={{ fontSize: 13, color: '#999' }}>Área da equipe de marketing.</div></div>;
  return (
    <div>
      <div style={s.card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>✨ Criar post com a Rhia</div>
        <div style={{ fontSize: 12, color: '#8A94A6', marginBottom: 10 }}>Descreva a oferta/ideia e a Rhia escreve as legendas, hashtags, o criativo e a campanha — pronto pra postar.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <label style={s.fld}>Objetivo / tema<input value={f.objetivo} onChange={e => set('objetivo', e.target.value)} placeholder="Ex.: promoção de protetor solar p/ o verão" style={{ ...s.inp, width: 320 }} /></label>
          <label style={s.fld}>Canal<select value={f.canal} onChange={e => set('canal', e.target.value)} style={s.inp}>{['Instagram (feed)', 'Instagram (story)', 'WhatsApp status', 'Facebook', 'Tabloide impresso'].map(c => <option key={c}>{c}</option>)}</select></label>
          <label style={s.fld}>Tom<input value={f.tom} onChange={e => set('tom', e.target.value)} placeholder="alegre, sério, urgente…" style={{ ...s.inp, width: 140 }} /></label>
          <label style={s.fld}>Data/ocasião<input value={f.data} onChange={e => set('data', e.target.value)} placeholder="Dia das Mães, verão…" style={{ ...s.inp, width: 150 }} /></label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#666' }}>Produtos / ofertas</div>
          {cadernos.length > 0 && <label style={{ fontSize: 11, color: '#888' }}>puxar do caderno:
            <select value={caderno} onChange={e => puxarCaderno(e.target.value)} style={{ ...s.inp, marginLeft: 4, padding: '4px 6px', fontSize: 12 }}>
              <option value="">—</option>{cadernos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select></label>}
        </div>
        {produtos.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
            <input value={p.nome} onChange={e => setProd(i, 'nome', e.target.value)} placeholder="Produto" style={{ ...s.inp, flex: 1, minWidth: 180 }} />
            <input value={p.de} onChange={e => setProd(i, 'de', e.target.value)} placeholder="De R$" style={{ ...s.inp, width: 80 }} />
            <input value={p.por} onChange={e => setProd(i, 'por', e.target.value)} placeholder="Por R$" style={{ ...s.inp, width: 80 }} />
            <input value={p.validade} onChange={e => setProd(i, 'validade', e.target.value)} placeholder="Validade" style={{ ...s.inp, width: 90 }} />
            {produtos.length > 1 && <button onClick={() => delProd(i)} style={{ ...s.btnMini, color: '#C0392B' }}>✕</button>}
          </div>
        ))}
        <button onClick={addProd} style={{ ...s.btnMini, marginTop: 2 }}>+ produto</button>
        <textarea value={f.extra} onChange={e => set('extra', e.target.value)} rows={2} placeholder="Observações (opcional): destaque, público, evitar…" style={{ ...s.inp, width: '100%', boxSizing: 'border-box', marginTop: 8, resize: 'vertical' }} />
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={gerar} disabled={carreg} style={{ ...s.btn, ...(carreg ? { opacity: 0.6 } : {}) }}>{carreg ? '✨ Gerando…' : '✨ Gerar com a Rhia'}</button>
          {msg && <span style={{ fontSize: 12, color: '#C0392B' }}>{msg}</span>}
        </div>
      </div>

      {res && <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📝 Legendas <span style={{ fontWeight: 400, color: '#999', fontSize: 11 }}>(clique para copiar)</span></div>
        {(res.legendas || []).map((l, i) => (
          <div key={i} onClick={() => copiar(l, 'leg' + i)} style={{ background: '#F7F9FB', border: '1px solid #eef1f4', borderRadius: 8, padding: '9px 11px', marginBottom: 7, fontSize: 13, cursor: 'pointer', position: 'relative' }}>
            {l}<span style={{ position: 'absolute', top: 6, right: 8, fontSize: 10.5, color: copiado === 'leg' + i ? '#1E8449' : '#bbb' }}>{copiado === 'leg' + i ? '✓ copiado' : '📋'}</span>
          </div>
        ))}
        {res.hashtags?.length > 0 && <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 4 }}># Hashtags</div>
          <div onClick={() => copiar(res.hashtags.join(' '), 'tags')} style={{ fontSize: 12.5, color: '#2E5C9E', cursor: 'pointer', background: '#EEF3FB', borderRadius: 8, padding: '7px 10px' }}>{res.hashtags.join(' ')} <span style={{ fontSize: 10.5, color: copiado === 'tags' ? '#1E8449' : '#99a' }}>{copiado === 'tags' ? '✓' : '📋'}</span></div>
        </div>}
        {res.ideiaCriativo && <div style={{ marginTop: 10 }}><div style={{ fontSize: 12, fontWeight: 700, color: '#666' }}>🎨 Ideia do criativo</div><div style={{ fontSize: 12.5, color: '#555' }}>{res.ideiaCriativo}</div></div>}
        {res.sugestaoCampanha && <div style={{ marginTop: 8 }}><div style={{ fontSize: 12, fontWeight: 700, color: '#666' }}>📅 Campanha</div><div style={{ fontSize: 12.5, color: '#555' }}>{res.sugestaoCampanha}</div></div>}
        {res.dica && <div style={{ marginTop: 8, fontSize: 12, color: '#B7791F', background: '#FCF7EA', borderRadius: 8, padding: '7px 10px' }}>💡 {res.dica}</div>}
      </div>}
    </div>
  );
}

// 💰 Verba / orçamento do Marketing — orçado × gasto por mês
function VerbaMarketing({ API, gestao }) {
  const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState({}); // mes -> valor sendo editado
  const [anoTodo, setAnoTodo] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/mkt/orcamento', { params: { ano } }).then(r => setD(r.data)).catch(() => setD(false)), [API, ano]);
  useEffect(() => { carregar(); }, [carregar]);
  const salvarMes = (mes) => { const valor = edit[mes]; if (valor == null) return; API.put('/mkt/orcamento', { ano, mes, valor: Number(valor) }).then(() => { setEdit(e => { const n = { ...e }; delete n[mes]; return n; }); carregar(); }); };
  const aplicarAno = () => { if (anoTodo === '') return; API.put('/mkt/orcamento', { ano, valor: Number(anoTodo), aplicarAno: true }).then(() => { setAnoTodo(''); setMsg('✅ Aplicado a todos os meses.'); carregar(); setTimeout(() => setMsg(''), 2500); }); };
  const cor = (m) => m.pct >= 100 ? '#C0392B' : m.pct >= 85 ? '#B7791F' : '#1E874B';
  const COLS_LANC = [
    { k: 'data_ini', label: 'Data', get: it => it.data_ini || '', tipo: 'txt' },
    { k: 'titulo', label: 'Ação', get: it => it.titulo || '', tipo: 'txt' },
    { k: 'tipo', label: 'Tipo', get: it => (TIPOS[it.tipo]?.[1] || it.tipo || ''), tipo: 'txt' },
    { k: 'status', label: 'Status', get: it => it.status || '', tipo: 'txt' },
    { k: 'patrocinador', label: 'Patrocinador', get: it => it.patrocinador || '', tipo: 'txt' },
    { k: 'verba', label: 'Verba', get: it => Number(it.verba) || 0, tipo: 'num', right: true },
    { k: 'patrocinio_valor', label: 'Patrocínio', get: it => Number(it.patrocinio_valor) || 0, tipo: 'num', right: true },
  ];
  const { linhas: linhasLanc, ordem: ordemLanc, clicar: clicarLanc, seta: setaLanc } = useOrdenavel(d && d.itens, COLS_LANC, { col: 'data_ini', dir: 'asc' });
  if (!d) return <div style={s.card}>Carregando…</div>;
  if (d === false) return <div style={s.card}>Sem acesso.</div>;
  const T = d.total;
  return (
    <div>
      <div style={{ ...s.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 11, color: '#888' }}>Orçado {ano}</div><div style={{ fontSize: 22, fontWeight: 800, color: '#334' }}>{brl(T.orcado)}</div></div>
          <div><div style={{ fontSize: 11, color: '#888' }}>Comprometido</div><div style={{ fontSize: 22, fontWeight: 800, color: '#334' }}>{brl(T.comprometido)}</div></div>
          {T.patrocinio > 0 && <div><div style={{ fontSize: 11, color: '#888' }}>Patrocínio recebido</div><div style={{ fontSize: 22, fontWeight: 800, color: '#1E8449' }}>− {brl(T.patrocinio)}</div></div>}
          <div><div style={{ fontSize: 11, color: '#888' }}>Custo líquido</div><div style={{ fontSize: 22, fontWeight: 800, color: cor(T) }}>{brl(T.liquido != null ? T.liquido : T.comprometido)}</div></div>
          <div><div style={{ fontSize: 11, color: '#888' }}>Já realizado</div><div style={{ fontSize: 22, fontWeight: 800, color: '#1E874B' }}>{brl(T.realizado)}</div></div>
          <div><div style={{ fontSize: 11, color: '#888' }}>Saldo</div><div style={{ fontSize: 22, fontWeight: 800, color: T.saldo < 0 ? '#C0392B' : '#334' }}>{brl(T.saldo)}</div></div>
        </div>
        <label style={{ fontSize: 11, color: '#888' }}>Ano <select value={ano} onChange={e => setAno(Number(e.target.value))} style={s.inp}>{[anoAtual - 1, anoAtual, anoAtual + 1].map(a => <option key={a} value={a}>{a}</option>)}</select></label>
      </div>

      {T.orcado > 0 && <div style={{ ...s.card }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginBottom: 4 }}><span>Consumo do orçamento anual</span><b style={{ color: cor(T) }}>{T.pct === 999 ? '∞' : T.pct + '%'}</b></div>
        <div style={{ height: 14, background: '#F1F3F5', borderRadius: 7, overflow: 'hidden' }}><div style={{ width: Math.min(100, T.pct) + '%', height: '100%', background: cor(T) }} /></div>
      </div>}

      {gestao && <div style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: '#555' }}>Definir a verba de <b>todos os meses</b> de {ano}:</span>
        <input type="number" value={anoTodo} onChange={e => setAnoTodo(e.target.value)} placeholder="R$ por mês" style={{ ...s.inp, width: 130 }} />
        <button onClick={aplicarAno} style={s.btn}>Aplicar ao ano</button>
        {msg && <span style={{ fontSize: 12, color: '#1E874B' }}>{msg}</span>}
      </div>}

      <div style={s.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{['Mês', 'Orçado', 'Comprometido', 'Patrocínio', 'Líquido', 'Realizado', 'Saldo', '%', gestao ? '' : null].filter(x => x != null).map((h, i) => <th key={i} style={{ ...s.th, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>)}</tr></thead>
            <tbody>{d.meses.map(m => (
              <tr key={m.mes} style={{ borderTop: '1px solid #f2f2f2', background: m.comprometido === 0 && m.orcado === 0 ? '#fff' : (m.pct >= 100 ? '#FDF3F2' : '#fff') }}>
                <td style={{ ...s.td, fontWeight: 600 }}>{MES[m.mes - 1]}</td>
                <td style={{ ...s.td, textAlign: 'right' }}>
                  {gestao ? <input type="number" value={edit[m.mes] ?? m.orcado} onChange={e => setEdit({ ...edit, [m.mes]: e.target.value })} onBlur={() => salvarMes(m.mes)} onKeyDown={e => e.key === 'Enter' && salvarMes(m.mes)} style={{ ...s.inp, width: 100, textAlign: 'right', padding: '4px 6px' }} /> : brl(m.orcado)}
                </td>
                <td style={{ ...s.td, textAlign: 'right', color: '#334', fontWeight: 600 }}>{brl(m.comprometido)}</td>
                <td style={{ ...s.td, textAlign: 'right', color: m.patrocinio > 0 ? '#1E8449' : '#bbb' }}>{m.patrocinio > 0 ? '− ' + brl(m.patrocinio) : '—'}</td>
                <td style={{ ...s.td, textAlign: 'right', color: cor(m), fontWeight: 600 }}>{brl(m.liquido != null ? m.liquido : m.comprometido)}</td>
                <td style={{ ...s.td, textAlign: 'right', color: '#1E874B' }}>{brl(m.realizado)}</td>
                <td style={{ ...s.td, textAlign: 'right', color: m.saldo < 0 ? '#C0392B' : '#666' }}>{brl(m.saldo)}</td>
                <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: cor(m) }}>{m.orcado ? (m.pct === 999 ? '∞' : m.pct + '%') : '—'}</td>
                {gestao && <td />}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>💡 O <b>comprometido</b> soma a verba das ações do mês; o <b>patrocínio recebido</b> abate e gera o <b>custo líquido</b> (é o que consome o orçado); o <b>realizado</b> conta só as publicadas/concluídas. Edite o Orçado e clique fora para salvar.</div>
      </div>

      {d.porTipo?.length > 0 && <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Gasto por tipo de ação</div>
        {(() => { const mx = Math.max(1, ...d.porTipo.map(t => t.total)); return d.porTipo.map(t => { const [emoji, label] = TIPOS[t.tipo] || ['•', t.tipo]; return (
          <div key={t.tipo} style={{ display: 'grid', gridTemplateColumns: '190px 1fr 120px', gap: 8, alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 12.5 }}>{emoji} {label} <span style={{ color: '#bbb' }}>({t.n})</span></span>
            <div style={{ background: '#F1F3F5', borderRadius: 5, height: 12 }}><div style={{ width: (100 * t.total / mx) + '%', height: '100%', background: '#7A4FB0', borderRadius: 5 }} /></div>
            <span style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right' }}>{brl(t.total)}</span>
          </div>); }); })()}
      </div>}

      {d.itens?.length > 0 && <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Lançamentos de verba ({ano})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr>{COLS_LANC.map(c => <ThOrd key={c.k} c={c} ordem={ordemLanc} clicar={clicarLanc} seta={setaLanc} base={s.th} />)}</tr></thead>
            <tbody>{linhasLanc.map(it => { const [emoji, label] = TIPOS[it.tipo] || ['•', it.tipo]; return (
              <tr key={it.id} style={{ borderTop: '1px solid #f2f2f2' }}>
                <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{it.data_ini.split('-').reverse().join('/')}</td>
                <td style={{ ...s.td, fontWeight: 600 }}>{it.titulo}</td>
                <td style={{ ...s.td, color: '#666' }}>{emoji} {label}</td>
                <td style={{ ...s.td, color: it.status === 'cancelado' ? '#C0392B' : '#888' }}>{it.status}</td>
                <td style={{ ...s.td, color: '#666' }}>{it.patrocinador || '—'}</td>
                <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{brl(it.verba)}</td>
                <td style={{ ...s.td, textAlign: 'right', color: it.patrocinio_valor > 0 ? '#1E8449' : '#bbb' }}>{it.patrocinio_valor > 0 ? '− ' + brl(it.patrocinio_valor) : '—'}</td>
              </tr>); })}</tbody>
          </table>
        </div>
      </div>}
    </div>
  );
}

// ── 📦 Painel de Materiais: desenvolvimento com PRAZO + comprovação (dor do Joe: material atrasa) ──
const MAT_ST = { a_fazer: ['A fazer', '#64748b'], producao: ['Em produção', '#B7791F'], entregue: ['Entregue', '#1E874B'], veiculado: ['Veiculado', '#0E7C5A'], cancelado: ['Cancelado', '#94a3b8'] };
const TIPOS_MAT = ['card_oferta', 'post_ig', 'story_ig', 'radio', 'monitor', 'tabloide', 'banner', 'trafego_pago', 'outro'];
function PainelMateriais({ API, gestao }) {
  const hojeMes = new Date().toISOString().slice(0, 7);
  const [filtro, setFiltro] = useState('abertos');
  const [mes, setMes] = useState('');
  const [d, setD] = useState(null);
  const [acoes, setAcoes] = useState([]);
  const [colabs, setColabs] = useState([]);
  const [diasAntes, setDiasAntes] = useState(2);
  const [novo, setNovo] = useState({ agenda_id: '', tipo: 'card_oferta', descricao: '', responsavel_id: '' });
  const carregar = useCallback(() => {
    const p = {}; if (filtro === 'abertos') p.status = 'abertos'; else if (filtro !== 'todos') p.status = filtro;
    if (mes) p.mes = mes;
    API.get('/mkt/materiais', { params: p }).then(r => setD(r.data)).catch(() => setD({ materiais: [], resumo: {} }));
  }, [API, filtro, mes]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const hoje = new Date(); const de = iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)); const ate = iso(new Date(hoje.getFullYear(), hoje.getMonth() + 3, 0));
    API.get('/mkt/agenda', { params: { de, ate } }).then(r => setAcoes(r.data.itens || [])).catch(() => {});
    API.get('/mkt/colaboradores').then(r => setColabs(r.data.colaboradores || [])).catch(() => {});
    API.get('/mkt/material-config').then(r => setDiasAntes(r.data.diasAntes)).catch(() => {});
  }, [API]);
  const salvarDias = v => { setDiasAntes(v); API.put('/mkt/material-config', { diasAntes: v }).catch(() => {}); };
  const addMaterial = () => {
    if (!novo.agenda_id) return alert('Escolha a ação.');
    const resp = colabs.find(c => c.id === novo.responsavel_id);
    API.post(`/mkt/agenda/${novo.agenda_id}/materiais`, { tipo: novo.tipo, descricao: novo.descricao, responsavel_id: novo.responsavel_id || null, responsavel_nome: resp ? resp.nome : null })
      .then(() => { setNovo({ agenda_id: '', tipo: 'card_oferta', descricao: '', responsavel_id: '' }); carregar(); }).catch(e => alert(e.response?.data?.erro || 'Falha.'));
  };
  const setStatus = (m, status) => API.put('/mkt/materiais/' + m.id, { status }).then(carregar).catch(() => {});
  const upComprov = (m, file) => { const rd = new FileReader(); rd.onload = () => { API.post(`/mkt/materiais/${m.id}/comprovacao`, { dados: rd.result, mime: file.type, nome: file.name }).then(carregar).catch(() => {}); }; rd.readAsDataURL(file); };
  const verComprov = (m) => API.get('/mkt/materiais/' + m.id + '/comprovacao').then(r => { const w = window.open(); if (w) w.document.write(`<iframe src="${r.data.dados}" style="border:0;width:100%;height:100%"></iframe>`); }).catch(() => {});
  const delMaterial = (m) => { if (window.confirm('Remover este material?')) API.delete('/mkt/materiais/' + m.id).then(carregar).catch(() => {}); };
  const r = d?.resumo || {}; const its = d?.materiais || [];
  const fmtD = x => x ? String(x).slice(0, 10).split('-').reverse().join('/') : '—';
  return (
    <div>
      <div style={{ ...s.card, background: '#fff7ed', border: '1px solid #fed7aa', fontSize: 12.5 }}>
        📦 <b>Materiais da ação</b> — o marketing desenvolve cada material (card de oferta, post, rádio, monitor…) com <b>prazo de entrega</b>. Prazo padrão = <b>data da ação − {gestao ? <input type="number" min="0" value={diasAntes} onChange={e => salvarDias(Number(e.target.value) || 0)} style={{ ...s.inp, width: 48, padding: '2px 6px' }} /> : diasAntes} dias</b> (pras lojas terem tempo de organizar). Atrasado = prazo vencido e não entregue.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <Card titulo="Abertos" valor={r.abertos || 0} cor={(r.abertos || 0) ? '#B7791F' : '#1E874B'} />
        <Card titulo="⚠️ Atrasados" valor={r.atrasados || 0} cor={(r.atrasados || 0) ? '#C0392B' : '#1E874B'} />
        <Card titulo="No filtro" valor={r.total || 0} cor="#334" />
      </div>
      {gestao && <div style={{ ...s.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={s.fld}>Ação<select value={novo.agenda_id} onChange={e => setNovo(n => ({ ...n, agenda_id: e.target.value }))} style={{ ...s.inp, minWidth: 200 }}><option value="">— escolher —</option>{acoes.map(a => <option key={a.id} value={a.id}>{fmtD(a.data_ini)} · {a.titulo}</option>)}</select></label>
        <label style={s.fld}>Tipo<select value={novo.tipo} onChange={e => setNovo(n => ({ ...n, tipo: e.target.value }))} style={s.inp}>{TIPOS_MAT.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></label>
        <label style={{ ...s.fld, flex: 1, minWidth: 160 }}>Descrição<input value={novo.descricao} onChange={e => setNovo(n => ({ ...n, descricao: e.target.value }))} style={s.inp} placeholder="ex.: card de oferta p/ as lojas" /></label>
        <label style={s.fld}>Responsável<select value={novo.responsavel_id} onChange={e => setNovo(n => ({ ...n, responsavel_id: e.target.value }))} style={s.inp}><option value="">—</option>{colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
        <button onClick={addMaterial} style={s.btn}>+ Material</button>
      </div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        {[['abertos', 'Abertos'], ['atrasados', 'Atrasados'], ['todos', 'Todos'], ['entregue', 'Entregues'], ['veiculado', 'Veiculados']].map(([v, l]) => <button key={v} onClick={() => setFiltro(v)} style={{ ...s.chip, ...(filtro === v ? s.chipOn : {}) }}>{l}</button>)}
        <input type="month" value={mes} onChange={e => setMes(e.target.value)} style={{ ...s.inp, marginLeft: 'auto' }} title="filtrar por mês do prazo" />
        {mes && <button onClick={() => setMes('')} style={s.btnMini}>limpar mês</button>}
      </div>
      <div style={{ ...s.card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>{['Ação', 'Material', 'Responsável', 'Prazo', 'Status', 'Comprovação', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {its.length === 0 && <tr><td colSpan={7} style={{ ...s.td, color: '#1E874B', padding: 14 }}>✅ Nenhum material {filtro === 'abertos' ? 'aberto' : filtro === 'atrasados' ? 'atrasado' : ''} no filtro.</td></tr>}
            {its.map(m => <tr key={m.id} style={{ borderTop: '1px solid #f2f2f2', background: m.atrasado ? '#FDF3F2' : '#fff' }}>
              <td style={{ ...s.td }}><b>{m.acao_titulo}</b><div style={{ fontSize: 10.5, color: '#999' }}>{fmtD(m.acao_data)}</div></td>
              <td style={s.td}>{(m.tipo || '—').replace(/_/g, ' ')}{m.descricao ? <div style={{ fontSize: 10.5, color: '#999' }}>{m.descricao}</div> : null}</td>
              <td style={s.td}>{m.responsavel_nome || '—'}</td>
              <td style={{ ...s.td, color: m.atrasado ? '#C0392B' : '#444', fontWeight: m.atrasado ? 700 : 400, whiteSpace: 'nowrap' }}>{fmtD(m.prazo)}{m.atrasado ? ' ⚠️' : m.diasRestantes != null && m.diasRestantes >= 0 && !['entregue', 'veiculado', 'cancelado'].includes(m.status) ? <span style={{ fontSize: 10, color: '#999' }}> ({m.diasRestantes}d)</span> : ''}</td>
              <td style={s.td}>{gestao ? <select value={m.status} onChange={e => setStatus(m, e.target.value)} style={{ ...s.inp, padding: '3px 6px', color: MAT_ST[m.status]?.[1] }}>{Object.entries(MAT_ST).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select> : <span style={{ color: MAT_ST[m.status]?.[1], fontWeight: 600 }}>{MAT_ST[m.status]?.[0]}</span>}</td>
              <td style={s.td}>{m.temComprovacao ? <button onClick={() => verComprov(m)} style={s.btnMini}>👁 ver</button> : gestao ? <label style={{ ...s.btnMini, cursor: 'pointer' }}>📎 anexar<input type="file" style={{ display: 'none' }} onChange={e => e.target.files[0] && upComprov(m, e.target.files[0])} /></label> : <span style={{ color: '#bbb' }}>—</span>}</td>
              <td style={s.td}>{gestao && <button onClick={() => delMaterial(m)} style={{ ...s.btnMini, color: '#C0392B' }}>×</button>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Card({ titulo, valor, cor }) {
  return <div style={{ background: '#fff', border: '1px solid #edf0f4', borderRadius: 12, padding: '10px 16px', minWidth: 120 }}><div style={{ fontSize: 11.5, color: '#888' }}>{titulo}</div><div style={{ fontSize: 24, fontWeight: 800, color: cor }}>{valor}</div></div>;
}

// 📱 Redes sociais — conectar Instagram (Graph API da Meta) e acompanhar seguidores/alcance (vira meta).
function RedesSociais({ API, gestao }) {
  const [contas, setContas] = useState([]); const [hist, setHist] = useState([]);
  const [tok, setTok] = useState(''); const [cid, setCid] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [segMan, setSegMan] = useState('');
  const carregar = useCallback(() => {
    API.get('/mkt/social').then(r => setContas(r.data.contas || [])).catch(() => {});
    API.get('/mkt/social/instagram/historico').then(r => setHist(r.data.historico || [])).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const ig = contas.find(c => c.rede === 'instagram');
  const conectar = () => { if (!tok || !cid) return setMsg('⚠️ Cole o token e o ID da conta.'); API.put('/mkt/social/instagram', { token: tok, conta_id: cid }).then(() => { setTok(''); setMsg('✅ Salvo. Clique em Atualizar métricas.'); carregar(); }).catch(() => setMsg('⚠️ Falha ao salvar.')); };
  const atualizar = () => { setBusy(true); setMsg(''); API.post('/mkt/social/instagram/atualizar').then(r => { setMsg('✅ ' + (r.data.username ? '@' + r.data.username + ' · ' : '') + (r.data.seguidores || 0).toLocaleString('pt-BR') + ' seguidores'); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'falha'))).finally(() => setBusy(false)); };
  const desconectar = () => { if (window.confirm('Desconectar o Instagram?')) API.delete('/mkt/social/instagram').then(carregar).catch(() => {}); };
  const salvarManual = () => { const n = parseInt(segMan, 10); if (!Number.isFinite(n) || n < 0) return setMsg('⚠️ Digite o nº de seguidores.'); API.put('/mkt/social/instagram/manual', { seguidores: n }).then(() => { setSegMan(''); setMsg('✅ Seguidores salvos: ' + n.toLocaleString('pt-BR')); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'falha'))); };
  const fmtDt = x => x ? new Date(String(x).replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '—';
  return (<div>
    <div style={s.card}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>📸 Instagram {ig && ig.conectado ? <span style={{ fontSize: 12, color: '#1E874B', fontWeight: 600 }}>· conectado{ig.username ? ' @' + ig.username : ''}</span> : <span style={{ fontSize: 12, color: '#B7791F', fontWeight: 600 }}>· não conectado</span>}</div>
      {ig && (ig.conectado || ig.seguidores != null) && <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        <Card titulo="Seguidores" valor={(ig.seguidores || 0).toLocaleString('pt-BR')} cor="#0E7C5A" />
        <div style={{ fontSize: 11.5, color: '#888' }}>Atualizado: {fmtDt(ig.atualizado_em)}{!ig.conectado && ig.seguidores != null ? ' · manual' : ''}</div>
      </div>}
      {ig && ig.erro && <div style={{ fontSize: 12, color: '#C0392B', marginBottom: 6 }}>⚠️ {ig.erro}</div>}
      {gestao && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={s.fld}>Token de acesso<input value={tok} onChange={e => setTok(e.target.value)} placeholder="cole o token da Meta" style={{ ...s.inp, width: 260 }} /></label>
        <label style={s.fld}>ID da conta do Instagram<input value={cid} onChange={e => setCid(e.target.value)} placeholder="instagram_business_account.id" style={{ ...s.inp, width: 210 }} /></label>
        <button onClick={conectar} style={s.btn}>Salvar conexão</button>
        {ig && ig.conectado && <button onClick={atualizar} disabled={busy} style={{ ...s.btn, background: '#0E7C5A' }}>{busy ? '⏳' : '🔄 Atualizar métricas'}</button>}
        {ig && ig.conectado && <button onClick={desconectar} style={{ ...s.btnMini, color: '#C0392B' }}>desconectar</button>}
      </div>}
      {gestao && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8, paddingTop: 8, borderTop: '1px dashed #e0e0e0' }}>
        <label style={s.fld}>Seguidores (manual)<input value={segMan} onChange={e => setSegMan(e.target.value.replace(/\D/g, ''))} placeholder="ex: 12400" style={{ ...s.inp, width: 120 }} /></label>
        <button onClick={salvarManual} style={{ ...s.btn, background: '#6b7280' }}>Salvar manual</button>
        <span style={{ fontSize: 11.5, color: '#999' }}>Enquanto a API não conecta, digite o nº de seguidores (olhe no Instagram). O indicador de Marketing já usa.</span>
      </div>}
      {msg && <div style={{ fontSize: 12.5, marginTop: 6, color: msg.startsWith('⚠️') ? '#C0392B' : '#15803d' }}>{msg}</div>}
    </div>
    {hist.length > 0 && <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📈 Histórico</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}><thead><tr>{['Data', 'Seguidores', 'Alcance (28d)'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
        <tbody>{hist.map((x, i) => <tr key={i}><td style={s.td}>{String(x.data).split('-').reverse().join('/')}</td><td style={s.td}>{(x.seguidores || 0).toLocaleString('pt-BR')}</td><td style={s.td}>{x.alcance != null ? x.alcance.toLocaleString('pt-BR') : '—'}</td></tr>)}</tbody></table>
    </div>}
    <div style={{ ...s.card, background: '#f7f9fb', fontSize: 12, color: '#555' }}>
      <b>Como pegar o token (app tipo "Instagram API with Instagram Login"):</b>
      <ol style={{ margin: '6px 0 0 18px', lineHeight: 1.6 }}>
        <li>A conta precisa ser <b>Profissional</b> (Comercial/Criador) e o produto <b>Instagram Business Login</b> configurado no app (Redirect URI + conta como testadora).</li>
        <li>No app da Meta → <b>Ferramentas → Explorador da API Graph</b>. No domínio escolha <code>.instagram.com/</code>.</li>
        <li>Em permissões adicione <code>instagram_business_basic</code> e <code>instagram_business_manage_insights</code> → <b>Generate Instagram Access Token</b> → login do <b>Instagram</b> → autorizar.</li>
        <li>Teste com <code>me?fields=user_id,username,followers_count</code>. Cole o <b>token longo</b> acima (o campo ID pode ficar vazio) → Salvar → Atualizar métricas.</li>
      </ol>
      <b style={{ color: '#6b7280' }}>Sem API?</b> Use o campo <b>Seguidores (manual)</b> acima — o indicador funciona do mesmo jeito.
    </div>
  </div>);
}

// Detalhe da ação (no form): 📈 sell-out do caderno vinculado + 💬 comentários da equipe.
const GASTO_LBL = { verba: 'Verba', trafego: 'Tráfego pago', tempo_equipe: 'Tempo da equipe', material: 'Material', outro: 'Outro' };
function DetalheAcao({ API, agendaId, temCaderno, gestao }) {
  const [coments, setComents] = useState([]); const [meuId, setMeuId] = useState(null);
  const [txt, setTxt] = useState(''); const [so, setSo] = useState(null);
  const [gastos, setGastos] = useState(null); const [vh, setVh] = useState(0);
  const [ng, setNg] = useState({ tipo: 'trafego', descricao: '', valor: '', horas: '', valor_hora: '' });
  const carregar = useCallback(() => { API.get(`/mkt/agenda/${agendaId}/comentarios`).then(r => { setComents(r.data.comentarios || []); setMeuId(r.data.meuId); }).catch(() => {}); }, [API, agendaId]);
  const carregarGastos = useCallback(() => { API.get(`/mkt/agenda/${agendaId}/gastos`).then(r => setGastos(r.data)).catch(() => {}); }, [API, agendaId]);
  useEffect(() => { carregar(); carregarGastos(); API.get('/mkt/material-config').then(r => { setVh(r.data.valorHora || 0); setNg(n => ({ ...n, valor_hora: r.data.valorHora || '' })); }).catch(() => {}); if (temCaderno) API.get(`/mkt/agenda/${agendaId}/sellout`).then(r => setSo(r.data)).catch(() => setSo(null)); }, [carregar, carregarGastos, temCaderno, API, agendaId]);
  const addGasto = () => {
    const b = ng.tipo === 'tempo_equipe' ? { tipo: ng.tipo, descricao: ng.descricao, horas: Number(ng.horas) || 0, valor_hora: Number(ng.valor_hora) || 0 } : { tipo: ng.tipo, descricao: ng.descricao, valor: Number(ng.valor) || 0 };
    API.post(`/mkt/agenda/${agendaId}/gastos`, b).then(() => { setNg({ tipo: 'trafego', descricao: '', valor: '', horas: '', valor_hora: vh || '' }); carregarGastos(); }).catch(() => {});
  };
  const delGasto = id => API.delete('/mkt/gastos/' + id).then(carregarGastos).catch(() => {});
  const add = () => { const t = txt.trim(); if (!t) return; API.post(`/mkt/agenda/${agendaId}/comentarios`, { texto: t }).then(() => { setTxt(''); carregar(); }).catch(() => {}); };
  const del = id => API.delete(`/mkt/comentarios/${id}`).then(carregar).catch(() => {});
  const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const fmtDt = x => { try { return new Date(String(x).replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  return (<>
    <div style={{ borderTop: '1px solid #eee', paddingTop: 8, fontSize: 12, color: '#888' }}>💸 Gastos da ação (verba, tráfego pago, tempo da equipe…)</div>
    {gastos && <>
      {(gastos.gastos || []).length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {gastos.gastos.map(g => <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, background: '#FAFAFA', border: '1px solid #eee', borderRadius: 7, padding: '4px 9px' }}>
          <span style={{ fontWeight: 600, minWidth: 110 }}>{GASTO_LBL[g.tipo] || g.tipo}</span>
          <span style={{ flex: 1, color: '#666' }}>{g.descricao || (g.tipo === 'tempo_equipe' && g.horas ? `${g.horas}h × R$ ${Number(g.valor_hora || 0).toLocaleString('pt-BR')}` : '')}</span>
          <b>{brl(g.valor)}</b>
          {gestao && <button onClick={() => delGasto(g.id)} style={{ border: 'none', background: 'none', color: '#C0392B', cursor: 'pointer' }}>×</button>}
        </div>)}
      </div>}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, marginTop: 4 }}>
        <span>Total: <b>{brl(gastos.total)}</b></span>
        {gastos.patrocinio > 0 && <span>Patrocínio: <b style={{ color: '#1E8449' }}>−{brl(gastos.patrocinio)}</b></span>}
        <span>Custo líquido: <b style={{ color: '#C0392B' }}>{brl(gastos.liquido)}</b></span>
      </div>
      {gestao && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 4 }}>
        <select value={ng.tipo} onChange={e => setNg(n => ({ ...n, tipo: e.target.value }))} style={{ ...s.inp, width: 150 }}>{Object.entries(GASTO_LBL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input value={ng.descricao} onChange={e => setNg(n => ({ ...n, descricao: e.target.value }))} placeholder="descrição" style={{ ...s.inp, flex: 1, minWidth: 120 }} />
        {ng.tipo === 'tempo_equipe' ? <>
          <input type="number" value={ng.horas} onChange={e => setNg(n => ({ ...n, horas: e.target.value }))} placeholder="horas" style={{ ...s.inp, width: 72 }} />
          <input type="number" value={ng.valor_hora} onChange={e => setNg(n => ({ ...n, valor_hora: e.target.value }))} placeholder="R$/h" style={{ ...s.inp, width: 80 }} />
          <span style={{ fontSize: 11, color: '#888', alignSelf: 'center' }}>= {brl((Number(ng.horas) || 0) * (Number(ng.valor_hora) || 0))}</span>
        </> : <input type="number" value={ng.valor} onChange={e => setNg(n => ({ ...n, valor: e.target.value }))} placeholder="R$" style={{ ...s.inp, width: 100 }} />}
        <button onClick={addGasto} style={s.btn}>+ Gasto</button>
      </div>}
    </>}
    {temCaderno && <>
      <div style={{ borderTop: '1px solid #eee', paddingTop: 8, fontSize: 12, color: '#888' }}>📈 Sell-out da ação (vendas do caderno vinculado)</div>
      {!so ? <div style={{ fontSize: 12, color: '#999' }}>carregando…</div> : so.erp === false ? <div style={{ fontSize: 12, color: '#999' }}>ERP indisponível.</div> :
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', background: '#F3FBF6', border: '1px solid #cdebd8', borderRadius: 8, padding: '8px 12px' }}>
          <div><div style={{ fontSize: 10.5, color: '#888' }}>Venda</div><b style={{ fontSize: 16, color: '#0E7C5A' }}>{brl(so.venda)}</b></div>
          <div><div style={{ fontSize: 10.5, color: '#888' }}>Unidades</div><b style={{ fontSize: 16 }}>{(so.unidades || 0).toLocaleString('pt-BR')}</b></div>
          <div><div style={{ fontSize: 10.5, color: '#888' }}>Produtos</div><b style={{ fontSize: 16 }}>{so.produtos || 0}</b></div>
          <div style={{ fontSize: 10.5, color: '#999', alignSelf: 'center' }}>📕 {so.caderno || 'caderno'}{so.periodo ? ` · ${so.periodo.de}→${so.periodo.ate}` : ''}</div>
        </div>}
    </>}
    <div style={{ borderTop: '1px solid #eee', paddingTop: 8, fontSize: 12, color: '#888' }}>💬 Comentários</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 180, overflowY: 'auto' }}>
      {coments.length === 0 && <div style={{ fontSize: 12, color: '#aaa' }}>Sem comentários ainda.</div>}
      {coments.map(c => <div key={c.id} style={{ background: '#f7f8fa', borderRadius: 8, padding: '6px 10px', fontSize: 12.5 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><b>{c.autor_nome || '—'}</b><span style={{ color: '#aaa', fontSize: 10.5 }}>{fmtDt(c.criado_em)}</span>{c.autor_id === meuId && <button onClick={() => del(c.id)} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#C0392B', cursor: 'pointer', fontSize: 11 }}>×</button>}</div>
        <div style={{ color: '#334', marginTop: 2, whiteSpace: 'pre-wrap' }}>{c.texto}</div>
      </div>)}
    </div>
    <div style={{ display: 'flex', gap: 6 }}>
      <input value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Escreva um comentário / ideia…" style={{ ...s.inp, flex: 1 }} />
      <button onClick={add} style={s.btn}>Enviar</button>
    </div>
  </>);
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '12px 14px', marginBottom: 12 },
  chip: { fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnMini: { fontSize: 12, padding: '5px 10px', background: '#fff', color: '#444', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
  nav: { fontSize: 18, width: 34, height: 34, borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' },
  inp: { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 },
  fld: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#888' },
  lbl: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#888' },
  badge: { fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 10, marginLeft: 4 },
  th: { textAlign: 'left', fontSize: 11, color: '#888', padding: '5px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  td: { textAlign: 'left', padding: '6px 8px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: 18, width: '100%', maxWidth: 620, maxHeight: '88vh', overflowY: 'auto' },
};
