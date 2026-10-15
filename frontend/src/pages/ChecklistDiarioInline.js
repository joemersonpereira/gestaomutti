import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const AVS = [['bom', 'Bom', '#3B6D11', '#EAF3DE'], ['regular', 'Regular', '#854F0B', '#FAEEDA'], ['ruim', 'Ruim', '#993C1D', '#FCEBEB'], ['np', 'N/P', '#666', '#eee']];
// Itens que, em Regular/Ruim, abrem tarefa para Compras (o gerente escolhe a área)
const GRUPO_COMERCIAL = ['Seção Beleza sem buraco', 'Seção Bem estar sem buraco', 'Pontas de Gôndola Beleza Cheia', 'Paletes de ofertas Cheios', 'Cestões organizados e cheios'];
const areaPadrao = item => /beleza/i.test(item) ? 'Beleza' : /bem.?estar/i.test(item) ? 'Bem-estar' : 'Beleza';

// Ciclo do Checklist Diário do gerente (abrir → conferir Bom/Regular/Ruim → fechar).
// compact=true: usado dentro do card do Kanban (sem seletor de data, texto enxuto).
// onChange: chamado após salvar/abrir/fechar (pro Kanban recarregar o quadro).
export default function ChecklistDiarioInline({ compact = false, onChange }) {
  const { API } = useAuth();
  const [senhaResp, setSenhaResp] = useState(null); // null=não perguntou, 'sim'/'nao'
  const [senhas, setSenhas] = useState([]);
  async function trocarSenhaSim() {
    setSenhaResp('sim');
    try { const r = await API.get('/checklist/senha-do-dia'); setSenhas(r.data.pessoas || []); } catch { setSenhas([]); }
  }
  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(hoje);
  const [areas, setAreas] = useState({});
  const [dados, setDados] = useState(null);
  const [marcas, setMarcas] = useState({});
  const [msg, setMsg] = useState('');
  const [limpezaPrompt, setLimpezaPrompt] = useState(null);
  const [roster, setRoster] = useState([]);
  const [caixas, setCaixas] = useState([]);
  const [conferentes, setConferentes] = useState([]);
  const [farmaceuticos, setFarmaceuticos] = useState([]);
  const [estagiarios, setEstagiarios] = useState([]);
  const [selCx, setSelCx] = useState('');
  const [selCf, setSelCf] = useState('');
  const [selFa, setSelFa] = useState('');
  const [selEs, setSelEs] = useState('');
  const [msgAt, setMsgAt] = useState('');

  const carregar = useCallback(() => {
    API.get('/checklist/gerente', { params: { data } }).then(r => { setDados(r.data); setMarcas({ ...(r.data.avaliacoes || {}) }); });
    API.get('/checklist/atuacao', { params: { data } }).then(r => {
      setRoster(r.data.roster || []); setCaixas(r.data.caixas || []); setConferentes(r.data.conferentes || []);
      setFarmaceuticos(r.data.farmaceuticos || []); setEstagiarios(r.data.estagiarios || []);
    }).catch(() => {});
  }, [API, data]);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvarAtuacao() {
    try { const r = await API.post('/checklist/atuacao', { data, caixas, conferentes, farmaceuticos, estagiarios }); setMsgAt('✅ ' + r.data.mensagem); onChange?.(); }
    catch (e) { setMsgAt(e.response?.data?.erro || 'Erro.'); }
  }

  async function abrir() { const r = await API.post('/checklist/gerente/abrir', { data }); setMsg('✅ ' + r.data.mensagem); carregar(); onChange?.(); }
  async function salvar() {
    const avaliacoes = Object.entries(marcas).map(([k, v]) => { const [secao, item] = k.split('__'); return { secao, item, avaliacao: v, area: areas[k] || areaPadrao(item) }; });
    try { const r = await API.post('/checklist/gerente', { data, avaliacoes }); setMsg(`✅ Salvo. ${r.data.tarefas_geradas} tarefa(s) de correção.`); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }
  async function fechar(acao, motivo) {
    const r = await API.post('/checklist/gerente/fechar', { data, acao, motivo });
    if (r.data.cedo_demais) { setMsg(`⏳ O checklist precisa ficar aberto pelo menos 4h. Faltam ~${r.data.faltam_min} min.`); return; }
    if (r.data.precisa_reposicao) { setMsg('🔄 Registre a Reposição do dia (aba Reposição) antes de fechar.'); return; }
    if (r.data.precisa_limpeza) { setLimpezaPrompt(r.data.limpeza_colaborador || 'colaborador da limpeza'); return; }
    setLimpezaPrompt(null); setMsg('✅ ' + r.data.mensagem); carregar(); onChange?.();
  }

  if (!dados) return <div style={s.card}>Carregando…</div>;
  const marcar = (secao, item, av) => setMarcas({ ...marcas, [`${secao}__${item}`]: av });
  const travado = !dados.aberto || dados.fechado;

  return (
    <div style={compact ? { marginTop: 4 } : undefined}>
      <div style={s.card}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {!compact && <input style={{ ...s.campo, width: 'auto', marginBottom: 0 }} type="date" value={data} onChange={e => setData(e.target.value)} />}
          <div style={{ fontSize: 12 }}>
            {!dados.aberto && <span style={{ color: '#854F0B' }}>não aberto</span>}
            {dados.aberto && !dados.fechado && <span style={{ color: '#185FA5' }}>aberto às {new Date(dados.aberto_em + 'Z').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
            {dados.fechado ? (
              dados.pend_admin > 0
                ? <span style={{ color: '#854F0B' }}>fechado · ⏳ pendente ({dados.pend_admin} avaliação(ões) do setor){dados.limpeza_status && dados.limpeza_status !== 'ok' ? ` · limpeza ${dados.limpeza_status}` : ''}</span>
                : <span style={{ color: '#3B6D11' }}>✅ finalizado{dados.limpeza_status && dados.limpeza_status !== 'ok' ? ` · limpeza ${dados.limpeza_status}` : ''}</span>
            ) : null}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 13, alignItems: 'center' }}>
          <span>Nota: <strong style={{ color: dados.validado ? '#3B6D11' : '#854F0B' }}>{dados.score.nota}</strong>{dados.validado ? ' ✓ validado' : ''}</span>
          <span style={{ color: '#999', fontSize: 11 }}>{dados.score.avaliados}/{dados.score.total_itens} itens</span>
        </div>
        {!dados.aberto && <button style={{ ...s.btn, marginTop: 10 }} onClick={abrir}>🔓 Abrir checklist (manhã)</button>}
      </div>

      {dados.aberto && !dados.fechado && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: senhaResp === 'sim' ? 8 : 4 }}>🔐 Trocar senha do dia?</div>
          {senhaResp === null && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={s.btn} onClick={trocarSenhaSim}>Sim</button>
              <button style={{ ...s.btn, background: 'none', color: '#666', border: '1px solid #ddd' }} onClick={() => setSenhaResp('nao')}>Não</button>
            </div>
          )}
          {senhaResp === 'nao' && <div style={{ fontSize: 12, color: '#999' }}>Tudo bem — sem troca hoje.</div>}
          {senhaResp === 'sim' && (
            <div>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Use o PIN sugerido de hoje (muda todo dia). Cada pessoa tem o seu — troquem a senha de vocês para esse número.</div>
              {senhas.length === 0 ? <div style={{ fontSize: 12, color: '#999' }}>Sem sugestão disponível.</div> : senhas.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#F4F7FB', borderRadius: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12 }}>{p.nome} <span style={{ color: '#999' }}>· {p.funcao}</span></span>
                  <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2, fontFamily: 'monospace' }}>{p.pin}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Quem atuou hoje</div>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Informe quem trabalhou hoje. <strong>Caixa</strong> e <strong>conferente</strong> vão para o chefe de setor avaliar (Tesouraria e Suporte). O <strong>farmacêutico</strong> e o <strong>estagiário</strong> você informa e avalia nas seções próprias, mais abaixo. {travado && <strong style={{ color: '#854F0B' }}>Dia fechado — não é mais possível alterar.</strong>}</div>
        <Picker titulo="Caixas de hoje" sel={selCx} setSel={setSelCx} ids={caixas} setIds={setCaixas} roster={roster} travado={travado} />
        <Picker titulo="Conferentes de hoje" sel={selCf} setSel={setSelCf} ids={conferentes} setIds={setConferentes} roster={roster} travado={travado} />
        {msgAt && <div style={{ fontSize: 11, color: msgAt.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 6 }}>{msgAt}</div>}
        {!travado && <button style={{ ...s.btn, marginTop: 8 }} onClick={salvarAtuacao}>Salvar atuação e liberar avaliações</button>}
      </div>

      {dados.secoes.map(sec => (
        <div key={sec.secao} style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{sec.secao} <span style={{ color: '#999', fontWeight: 400 }}>· {sec.peso} pts</span></div>
          {sec.itens.map(item => (
            <div key={item} style={s.linha}>
              <span style={{ fontSize: 12, flex: 1 }}>{item}</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {AVS.map(([val, lbl, cor, bg]) => (
                  <button key={val} disabled={travado} onClick={() => marcar(sec.secao, item, val)}
                    style={{ ...s.av, ...(marcas[`${sec.secao}__${item}`] === val ? { background: bg, color: cor, borderColor: cor } : {}), ...(travado ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}>{lbl}</button>
                ))}
                {GRUPO_COMERCIAL.includes(item) && ['regular', 'ruim'].includes(marcas[`${sec.secao}__${item}`]) && (
                  <select disabled={travado} value={areas[`${sec.secao}__${item}`] || areaPadrao(item)}
                    onChange={e => setAreas({ ...areas, [`${sec.secao}__${item}`]: e.target.value })}
                    style={{ fontSize: 10, padding: '3px 4px', border: '1px solid #BA7517', borderRadius: 5, color: '#854F0B' }} title="Abrir tarefa para Compras da área">
                    <option value="Beleza">→ Compras Beleza</option>
                    <option value="Bem-estar">→ Compras Bem-estar</option>
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Seções avaliadas por pessoa: o gerente informa quem é e avalia; a média entra no score */}
      {[
        { titulo: 'Farmacêutico', funcao: 'func-farmaceutico', ids: farmaceuticos, setIds: setFarmaceuticos, sel: selFa, setSel: setSelFa },
        { titulo: 'Estagiário', funcao: 'func-estagiario', ids: estagiarios, setIds: setEstagiarios, sel: selEs, setSel: setSelEs },
      ].map(secf => (
        <div key={secf.titulo} style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{secf.titulo} <span style={{ color: '#999', fontWeight: 400 }}>· 10 pts</span></div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Informe quem atuou como {secf.titulo.toLowerCase()} hoje e avalie cada um. A <strong>média</strong> dessas avaliações entra como seção no score do checklist.{travado && <strong style={{ color: '#854F0B' }}> Dia fechado — somente leitura.</strong>}</div>
          <Picker titulo={`Quem foi o ${secf.titulo.toLowerCase()} hoje`} sel={secf.sel} setSel={secf.setSel} ids={secf.ids} setIds={secf.setIds} roster={roster} travado={travado} />
          {!travado && <button style={{ ...s.btn, margin: '8px 0' }} onClick={salvarAtuacao}>Salvar e liberar avaliação</button>}
          {secf.ids.length === 0
            ? <div style={{ fontSize: 11, color: '#aaa' }}>Ninguém informado ainda.</div>
            : secf.ids.map(id => { const c = roster.find(x => x.id === id); return <AvaliacaoFuncaoInline key={id} id={id} nome={c ? c.nome : id} funcao={secf.funcao} API={API} travado={travado} />; })}
        </div>
      ))}
      {msg && <div style={{ fontSize: 12, color: '#3B6D11', marginBottom: 8 }}>{msg}</div>}
      {dados.aberto && !dados.fechado && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn} onClick={salvar}>Salvar conferência</button>
          <button style={s.btnSec} onClick={() => fechar()}>Fechar o dia</button>
        </div>
      )}

      {limpezaPrompt && (
        <div style={s.alerta}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>⚠️ Limpeza não finalizada</div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>O checklist de limpeza ({limpezaPrompt}) não foi concluído. Para fechar o dia, justifique a ausência ou registre penalização (que impacta o indicador do colaborador da limpeza, não o seu).</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={s.btnSec} onClick={() => { const m = window.prompt('Justificativa da ausência:') || ''; fechar('justificar', m); }}>Justificar ausência</button>
            <button style={{ ...s.btn, background: '#993C1D' }} onClick={() => { const m = window.prompt('Motivo da penalização:') || ''; fechar('penalizar', m); }}>Registrar penalização</button>
          </div>
        </div>
      )}
      {!compact && <div style={s.info}>💡 Abra o checklist de manhã e <strong>feche no fim do dia</strong> — só é possível fechar <strong>4h</strong> após a abertura. Para fechar é preciso ter registrado a <strong>Reposição</strong> do dia e a <strong>limpeza</strong> finalizada (ou justificada/penalizada). As avaliações dos chefes de setor <strong>não travam o fechamento</strong>: o dia fecha como <strong>⏳ pendente</strong> e vira <strong>✅ finalizado</strong> sozinho quando os chefes avaliarem. Item "Ruim" gera tarefa de correção (24h); o dia valida com nota ≥95.</div>}
    </div>
  );
}

// Avaliação por indicadores da função (farmacêutico/estagiário), feita pelo gerente dentro do Diário.
// Reaproveita o fluxo existente (/avaliacoes), que alimenta o indicador da pessoa no mês.
function AvaliacaoFuncaoInline({ id, nome, API, travado, funcao }) {
  const hoje = new Date();
  const mes = hoje.getMonth() + 1, ano = hoje.getFullYear();
  const [inds, setInds] = useState(null);
  const [marcas, setMarcas] = useState({});
  const [nota, setNota] = useState(null);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    API.get(`/avaliacoes/${id}`, { params: { mes, ano, funcao } }).then(r => {
      setInds(r.data.indicadores || []);
      const m = {}; (r.data.indicadores || []).forEach(i => { if (i.avaliacao) m[i.indicador] = i.avaliacao; });
      setMarcas(m); setNota(r.data.nota);
    }).catch(() => setInds([]));
  }, [API, id, mes, ano, funcao]);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    try { const r = await API.post(`/avaliacoes/${id}`, { mes, ano, avaliacoes: marcas, funcao }); setNota(r.data.nota); setMsg(`✅ Salvo (nota ${r.data.nota}).`); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }

  if (!inds) return <div style={{ fontSize: 12, color: '#999', padding: '6px 0' }}>Carregando {nome}…</div>;
  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid #f0f0f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{nome}</div>
        {nota != null && <span style={{ fontSize: 11, color: '#666' }}>nota {nota}</span>}
      </div>
      {inds.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Sem indicadores configurados para esta função.</div>}
      {inds.map(i => (
        <div key={i.indicador} style={{ padding: '4px 0' }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>{i.label}{i.peso ? <span style={{ color: '#aaa' }}> · {i.peso}%</span> : null}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {AVS.map(([v, lbl, cor, bg]) => (
              <button key={v} disabled={travado} onClick={() => setMarcas({ ...marcas, [i.indicador]: v })}
                style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: '5px 0', borderRadius: 6, cursor: travado ? 'not-allowed' : 'pointer', border: `1px solid ${marcas[i.indicador] === v ? cor : '#ddd'}`, background: marcas[i.indicador] === v ? bg : '#fff', color: marcas[i.indicador] === v ? cor : '#888', opacity: travado && marcas[i.indicador] !== v ? 0.5 : 1 }}>{lbl}</button>
            ))}
          </div>
        </div>
      ))}
      {msg && <div style={{ fontSize: 11, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 4 }}>{msg}</div>}
      {!travado && inds.length > 0 && <button onClick={salvar} style={{ marginTop: 8, fontSize: 12, fontWeight: 600, padding: '6px 14px', border: 'none', background: '#3B6D11', color: '#fff', borderRadius: 8, cursor: 'pointer' }}>Salvar avaliação</button>}
    </div>
  );
}

// Seletor de pessoas (adicionar/remover) para a atuação do dia
function Picker({ titulo, sel, setSel, ids, setIds, roster, travado }) {
  const disp = roster.filter(c => !ids.includes(c.id));
  const acha = id => roster.find(c => c.id === id);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 4 }}>{titulo}</div>
      {!travado && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          <select value={sel} onChange={e => setSel(e.target.value)} style={{ flex: 1, minWidth: 150, padding: '7px 9px', fontSize: 12, border: '1px solid #ddd', borderRadius: 8 }}>
            <option value="">+ adicionar…</option>
            {disp.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.funcao}</option>)}
          </select>
          <button disabled={!sel} onClick={() => { if (sel && !ids.includes(sel)) { setIds([...ids, sel]); setSel(''); } }}
            style={{ fontSize: 12, padding: '7px 12px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Add</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ids.length === 0 && <span style={{ fontSize: 11, color: '#aaa' }}>ninguém</span>}
        {ids.map(id => { const c = acha(id); return (
          <span key={id} style={{ fontSize: 11, background: '#EAF3DE', color: '#3B6D11', padding: '4px 8px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {c ? c.nome : id}{!travado && <button onClick={() => setIds(ids.filter(x => x !== id))} style={{ border: 'none', background: 'none', color: '#3B6D11', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>}
          </span>
        ); })}
      </div>
    </div>
  );
}

const s = {
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  campo: { padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8 },
  linha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f5f5f5', gap: 8 },
  av: { fontSize: 10, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 5, background: '#fff', cursor: 'pointer', color: '#999' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnSec: { fontSize: 13, padding: '8px 14px', background: 'none', color: '#666', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' },
  alerta: { background: '#FAEEDA', border: '1px solid #BA7517', borderRadius: 10, padding: '12px', marginTop: 10 },
  info: { background: '#E6F1FB', borderLeft: '3px solid #185FA5', borderRadius: '0 8px 8px 0', padding: '10px 12px', fontSize: 12, color: '#185FA5', lineHeight: 1.6, marginTop: 10 },
};
