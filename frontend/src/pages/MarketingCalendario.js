import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { useOrdenavel, ThOrd } from '../components/Ordenavel';

const TIPOS = {
  postagem: ['📱', 'Postagem', '#2E5C9E'],
  acao: ['🎯', 'Ação', '#7A4FB0'],
  evento: ['🎪', 'Evento', '#C0392B'],
  campanha: ['📢', 'Campanha', '#1E8449'],
  acao_fornecedor: ['🤝', 'Ação c/ fornecedor', '#B7791F'],
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
        {[['calendario', '🗓️ Calendário'], ['lista', '📋 Lista'], ['verba', '💰 Verba'], ['influ', '⭐ Influenciadores'], ['criar', '✨ Criar post (Rhia)']].map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
        {gestao && (aba === 'calendario' || aba === 'lista') && <button onClick={() => setEdit({ novo: iso(new Date()) })} style={{ ...s.btn, marginLeft: 'auto' }}>+ Nova ação</button>}
      </div>

      {(aba === 'calendario' || aba === 'lista') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button onClick={() => setRef(new Date(ano, mes - 1, 1))} style={s.nav}>‹</button>
          <div style={{ fontSize: 16, fontWeight: 700, minWidth: 170, textAlign: 'center' }}>{MES[mes]} {ano}</div>
          <button onClick={() => setRef(new Date(ano, mes + 1, 1))} style={s.nav}>›</button>
          {verbaTotal > 0 && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>💰 Verba do mês: <b>R$ {verbaTotal.toLocaleString('pt-BR')}</b></span>}
        </div>
      )}

      {aba === 'calendario' && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, minWidth: 780 }}>
            {DOW.map(d => <div key={d} style={{ fontSize: 11, fontWeight: 700, color: '#999', textAlign: 'center', padding: 4 }}>{d.toUpperCase()}</div>)}
            {dias.map((d, i) => {
              const fora = d.getMonth() !== mes; const hoje = iso(d) === iso(new Date());
              return (
                <div key={i} onClick={() => gestao && setEdit({ novo: iso(d) })} style={{ minHeight: 88, background: fora ? '#FAFAFA' : '#fff', border: hoje ? '2px solid #2E5C9E' : '1px solid #eee', borderRadius: 8, padding: 4, cursor: gestao ? 'pointer' : 'default' }}>
                  <div style={{ fontSize: 11, color: fora ? '#ccc' : '#888', textAlign: 'right' }}>{d.getDate()}</div>
                  {doDia(d).slice(0, 4).map(it => { const [emoji, , cor] = TIPOS[it.tipo] || ['•', '', '#666']; return (
                    <div key={it.id} onClick={e => { e.stopPropagation(); setEdit(it); }} title={it.titulo} style={{ fontSize: 10.5, background: cor + '18', color: cor, borderRadius: 5, padding: '2px 4px', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {emoji} {it.titulo}
                    </div>
                  ); })}
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {aba === 'verba' && <VerbaMarketing API={API} gestao={gestao} />}
      {aba === 'influ' && <Influenciadores API={API} gestao={gestao} influs={influs} onChange={carregar} />}
      {aba === 'criar' && <CriarPost API={API} gestao={gestao} />}

      {edit && <FormAcao API={API} item={edit.novo ? { data_ini: edit.novo } : edit} influs={influs} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); carregar(); }} />}
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

function FormAcao({ API, item, influs, onClose, onSaved }) {
  const novo = !item.id;
  const [f, setF] = useState({
    titulo: item.titulo || '', tipo: item.tipo || 'postagem', canal: item.canal || '', data_ini: item.data_ini || '', data_fim: item.data_fim || '',
    hora: item.hora || '', status: item.status || 'ideia', responsavel_id: item.responsavel_id || '', responsavel_nome: item.responsavel_nome || '', descricao: item.descricao || '',
    envolvido_tipo: '', envolvido_id: '', envolvido_nome: '', envolvido_contato: '', envolvido_email: '',
    envolvidos: item.envolvidos || [], verba: item.verba || '', patrocinador: item.patrocinador || '', patrocinio_valor: item.patrocinio_valor || '',
    comprador_id: item.comprador_id || '', comprador_prazo: item.comprador_prazo || '',
  });
  const [colabs, setColabs] = useState([]);
  useEffect(() => { API.get('/mkt/colaboradores').then(r => setColabs(r.data.colaboradores || [])).catch(() => {}); }, [API]);
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
            <input value={f.canal} onChange={e => set('canal', e.target.value)} placeholder="Canal (Instagram, Loja…)" style={{ ...s.inp, flex: 1 }} />
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
          <textarea value={f.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Descrição / briefing" style={{ ...s.inp, minHeight: 54, resize: 'vertical' }} />
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
