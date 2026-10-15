import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

// Capacitação / T&D — cursos, avaliação trimestral (gerente→colaborador) e PDCA/PDI.
const LIDER = ['Gerente', 'Subgerente', 'Supervisor', 'RH', 'Gestor Geral', 'Diretor Geral'];
const dBR = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');
const hoje = new Date();
const triAtual = Math.floor(hoje.getMonth() / 3) + 1;

export default function Capacitacao() {
  const { usuario } = useAuth();
  const ehLider = LIDER.includes(usuario.funcao);
  const [aba, setAba] = useState('cursos');
  const abas = [['cursos', '📚 Cursos'], ['meu', '🎓 Meu desenvolvimento'], ...(ehLider ? [['avaliar', '📈 Avaliação & PDI'], ['relatorio', '📊 Relatório']] : [])];
  return (
    <div style={s.wrap}>
      <Banner emoji="🎓" titulo="Capacitação & Desenvolvimento" cor="verde" sub="Cursos, avaliação trimestral do colaborador e plano de desenvolvimento (PDCA) — porque acreditamos em desenvolver pessoas." />
      <div style={{ display: 'flex', gap: 6, margin: '2px 0 12px', flexWrap: 'wrap' }}>
        {abas.map(([v, l]) => <button key={v} onClick={() => setAba(v)} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}>{l}</button>)}
      </div>
      {aba === 'cursos' && <Cursos />}
      {aba === 'meu' && <MeuDesenvolvimento />}
      {aba === 'avaliar' && ehLider && <AvaliarEquipe />}
      {aba === 'relatorio' && ehLider && <RelatorioTD />}
    </div>
  );
}

// ════════════ RELATÓRIO DE GAPS (norte do RH) ════════════
function RelatorioTD() {
  const { API } = useAuth();
  const [d, setD] = useState(null);
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  useEffect(() => { API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [API]);
  useEffect(() => { API.get('/capacitacao/relatorio', { params: loja ? { loja_id: loja } : {} }).then(r => setD(r.data)).catch(() => setD(false)); }, [API, loja]);
  const corN = n => n == null ? '#999' : n >= 4 ? '#1E8449' : n >= 3 ? '#BA7517' : '#C0392B';
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <select value={loja} onChange={e => setLoja(e.target.value)} style={{ ...s.inp, width: 'auto', marginBottom: 0 }}>
          <option value="">Toda a rede</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        {d && d.total_avaliados != null && <span style={{ fontSize: 12, color: '#666' }}>{d.trimestre}º tri/{d.ano} · <b>{d.total_avaliados}</b> avaliações concluídas</span>}
      </div>
      {d === false && <div style={{ ...s.card, color: '#999' }}>Sem permissão ou sem dados.</div>}
      {d && d.total_avaliados === 0 && <div style={{ ...s.card, textAlign: 'center', color: '#999' }}>Nenhuma avaliação concluída ainda neste recorte.</div>}
      {d && d.total_avaliados > 0 && (
        <>
          <div style={{ ...s.card }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>🧭 Onde investir em treino (competências mais baixas)</div>
            {d.competencias.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
                <span style={{ fontSize: 13, flex: 1 }}>{c.nome}</span>
                {c.baixas > 0 && <span style={{ fontSize: 10.5, color: '#C0392B' }}>{c.baixas} com nota ≤ 2</span>}
                <div style={{ width: 120, height: 8, background: '#eee', borderRadius: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: `${(c.media / 5) * 100}%`, background: corN(c.media) }} /></div>
                <span style={{ fontSize: 14, fontWeight: 800, color: corN(c.media), width: 34, textAlign: 'right' }}>{c.media}</span>
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: '#999', marginTop: 6 }}>As primeiras da lista são a prioridade de desenvolvimento do RH + gestão.</div>
          </div>
          <div style={{ ...s.card }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>👥 Quem mais precisa de desenvolvimento</div>
            {d.colaboradores.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, borderBottom: '1px solid #f8f8f8' }}>
                <span style={{ flex: 1 }}>{c.nome}{c.loja ? <span style={{ color: '#999' }}> · {c.loja}</span> : ''}</span>
                <span style={{ fontWeight: 700, color: corN(c.media) }}>{c.media}/5</span>
              </div>
            ))}
          </div>
          {d.cursos_obrigatorios.length > 0 && (
            <div style={{ ...s.card }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>📚 Cursos obrigatórios — adesão</div>
              {d.cursos_obrigatorios.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                  <span style={{ flex: 1 }}>{c.titulo}</span>
                  <span style={{ fontSize: 11, color: '#999' }}>{c.feito}/{c.total}</span>
                  <div style={{ width: 100, height: 8, background: '#eee', borderRadius: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: `${c.pct}%`, background: c.pct >= 80 ? '#1E8449' : c.pct >= 50 ? '#BA7517' : '#C0392B' }} /></div>
                  <span style={{ fontWeight: 700, width: 40, textAlign: 'right' }}>{c.pct}%</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ════════════ CURSOS ════════════
function Cursos() {
  const { API } = useAuth();
  const [d, setD] = useState({ cursos: [], gestao: false });
  const [funcoes, setFuncoes] = useState([]);
  const [ed, setEd] = useState(null);
  const carregar = useCallback(() => API.get('/capacitacao/cursos').then(r => setD(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/referencias/funcoes').then(r => setFuncoes(r.data.funcoes || [])).catch(() => {}); }, [API]);
  const concluir = (c) => { const cert = window.confirm(`Marcar "${c.titulo}" como concluído?\n\nOK = com certificado (vai para validação) · Cancelar = só marcar.`); API.post(`/capacitacao/cursos/${c.id}/concluir`, { com_certificado: cert }).then(carregar); };
  const desfazer = (c) => API.delete(`/capacitacao/cursos/${c.id}/concluir`).then(carregar);
  const salvar = () => { if (!ed.titulo?.trim()) return; const req = ed.id ? API.put(`/capacitacao/cursos/${ed.id}`, ed) : API.post('/capacitacao/cursos', ed); req.then(() => { setEd(null); carregar(); }); };
  const remover = (id) => { if (window.confirm('Remover curso?')) API.delete(`/capacitacao/cursos/${id}`).then(carregar); };

  return (
    <div>
      {d.gestao && !ed && <button onClick={() => setEd({ obrigatorio: 0, pontos: '', funcoes: [] })} style={{ ...s.btn, marginBottom: 12 }}>+ Novo curso</button>}
      {ed && (
        <div style={{ ...s.card, borderLeft: '4px solid #1E8449' }}>
          <input placeholder="Título do curso" value={ed.titulo || ''} onChange={e => setEd({ ...ed, titulo: e.target.value })} style={s.inp} />
          <textarea placeholder="Descrição / conteúdo" value={ed.descricao || ''} onChange={e => setEd({ ...ed, descricao: e.target.value })} style={{ ...s.inp, minHeight: 50 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input placeholder="Categoria" value={ed.categoria || ''} onChange={e => setEd({ ...ed, categoria: e.target.value })} style={{ ...s.inp, width: 150 }} />
            <input placeholder="Link (vídeo/PDF)" value={ed.link || ''} onChange={e => setEd({ ...ed, link: e.target.value })} style={{ ...s.inp, flex: 1, minWidth: 160 }} />
            <label style={s.lbl}>Carga (h)<input type="number" value={ed.carga_horaria || ''} onChange={e => setEd({ ...ed, carga_horaria: e.target.value })} style={{ ...s.inp, width: 80 }} /></label>
            <label style={s.lbl}>Pontos<input type="number" value={ed.pontos || ''} onChange={e => setEd({ ...ed, pontos: e.target.value })} style={{ ...s.inp, width: 80 }} /></label>
          </div>
          <label style={{ display: 'flex', gap: 6, fontSize: 12.5, marginBottom: 8 }}><input type="checkbox" checked={!!ed.obrigatorio} onChange={e => setEd({ ...ed, obrigatorio: e.target.checked ? 1 : 0 })} /> Curso obrigatório</label>
          <div style={{ fontSize: 11.5, color: '#666', marginBottom: 4 }}>Para quais funções? (nenhuma marcada = todos)</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
            {funcoes.map(f => { const on = (ed.funcoes || []).includes(f.id); return <button key={f.id} type="button" onClick={() => setEd(x => ({ ...x, funcoes: on ? x.funcoes.filter(i => i !== f.id) : [...(x.funcoes || []), f.id] }))} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 12, cursor: 'pointer', border: '1px solid ' + (on ? '#1E8449' : '#ddd'), background: on ? '#1E8449' : '#fff', color: on ? '#fff' : '#666' }}>{f.nome}</button>; })}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={s.lbl}>🎯 Trilha (opcional — agrupa em sequência)<input placeholder="ex.: Integração, Farmácia…" value={ed.trilha || ''} onChange={e => setEd({ ...ed, trilha: e.target.value })} style={{ ...s.inp, width: 220 }} /></label>
            <label style={s.lbl}>Ordem na trilha<input type="number" value={ed.trilha_ordem || ''} onChange={e => setEd({ ...ed, trilha_ordem: e.target.value })} style={{ ...s.inp, width: 90 }} /></label>
          </div>
          <div style={{ display: 'flex', gap: 6 }}><button onClick={salvar} style={s.btn}>Salvar</button><button onClick={() => setEd(null)} style={s.chip}>Cancelar</button></div>
        </div>
      )}
      {d.cursos.length === 0 && <div style={{ ...s.card, textAlign: 'center', color: '#999' }}>Nenhum curso cadastrado ainda.</div>}
      {(() => {
        const trilhas = {}; d.cursos.forEach(c => { if (c.trilha) (trilhas[c.trilha] = trilhas[c.trilha] || []).push(c); });
        return Object.entries(trilhas).sort((a, b) => a[0].localeCompare(b[0])).map(([nome, cs]) => {
          const ord = [...cs].sort((a, b) => (a.trilha_ordem || 0) - (b.trilha_ordem || 0));
          const feitos = ord.filter(c => c.concluido).length; const pct = Math.round(100 * feitos / ord.length);
          return (
            <div key={nome} style={{ background: '#F6FBF7', border: '1px solid #d8ecdd', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13.5, fontWeight: 800 }}>🎯 Trilha: {nome}</div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 90, height: 8, background: '#e3efe6', borderRadius: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#1E8449' : '#5aa576' }} /></div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1E8449' }}>{feitos}/{ord.length}</span>
                </div>
              </div>
              {ord.map((c, i) => <CursoCard key={c.id} c={c} idx={i + 1} d={d} setEd={setEd} remover={remover} concluir={concluir} desfazer={desfazer} compacto />)}
            </div>
          );
        });
      })()}
      {d.cursos.filter(c => !c.trilha).map(c => <CursoCard key={c.id} c={c} d={d} setEd={setEd} remover={remover} concluir={concluir} desfazer={desfazer} />)}
    </div>
  );
}

function CursoCard({ c, d, setEd, remover, concluir, desfazer, idx, compacto }) {
  return (
    <div style={{ ...s.card, ...(compacto ? { padding: '8px 10px', marginBottom: 6 } : {}), borderLeft: `4px solid ${c.concluido ? '#1E8449' : c.obrigatorio ? '#E0912F' : '#dfe6ea'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: compacto ? 13 : 14, fontWeight: 700 }}>{idx ? `${idx}. ` : ''}{c.titulo}</div>
        {c.obrigatorio ? <span style={{ fontSize: 10, color: '#fff', background: '#E0912F', borderRadius: 5, padding: '1px 7px' }}>obrigatório</span> : null}
        {c.concluido ? <span style={{ fontSize: 10, color: '#fff', background: '#1E8449', borderRadius: 5, padding: '1px 7px' }}>✓ concluído {dBR(c.concluido_em)}</span> : null}
        {c.pontos > 0 && <span style={{ fontSize: 11, color: '#7a3d9c' }}>🏅 {c.pontos} pts</span>}
        {d.gestao && <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}><button onClick={() => setEd({ ...c })} style={s.chip}>editar</button><button onClick={() => remover(c.id)} style={{ ...s.chip, color: '#993C1D' }}>remover</button></span>}
      </div>
      {!compacto && c.descricao && <div style={{ fontSize: 12.5, color: '#555', marginTop: 4 }}>{c.descricao}</div>}
      {!compacto && <div style={{ fontSize: 11.5, color: '#888', marginTop: 4 }}>{c.categoria ? `${c.categoria} · ` : ''}{c.carga_horaria ? `${c.carga_horaria}h · ` : ''}{d.gestao && c.concluintes != null ? `${c.concluintes} concluíram` : ''}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {c.link && <a href={c.link} target="_blank" rel="noreferrer" style={{ ...s.chip, textDecoration: 'none', color: '#185FA5' }}>▶ Abrir material</a>}
        {!c.concluido ? <button onClick={() => concluir(c)} style={{ ...s.btn, padding: '6px 14px' }}>Marcar concluído</button>
          : <button onClick={() => desfazer(c)} style={s.chip}>desfazer</button>}
      </div>
    </div>
  );
}

// ════════════ MEU DESENVOLVIMENTO (colaborador) ════════════
function MeuDesenvolvimento() {
  const { API, usuario } = useAuth();
  const [hist, setHist] = useState({ historico: [], norte: [] });
  const [pdi, setPdi] = useState([]);
  const [sug, setSug] = useState(null);
  const carregar = useCallback(() => {
    API.get(`/capacitacao/avaliacao/${usuario.id}/historico`).then(r => setHist(r.data)).catch(() => {});
    API.get('/capacitacao/pdi/meus').then(r => setPdi(r.data.pdi || [])).catch(() => {});
  }, [API, usuario.id]);
  useEffect(() => { carregar(); }, [carregar]);
  const enviarSug = () => { if (!sug.tema?.trim()) return; API.post('/capacitacao/pdi', { colaborador_id: usuario.id, origem: 'sugestao', tema: sug.tema, objetivo: sug.objetivo }).then(() => { setSug(null); carregar(); }); };
  const ult = hist.historico[0];
  return (
    <div>
      <div style={{ ...s.card }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>📋 Minha última avaliação</div>
        {!ult ? <div style={{ fontSize: 13, color: '#999' }}>Você ainda não tem avaliação concluída. Ela é trimestral, feita pelo seu gestor.</div> : (
          <>
            <div style={{ fontSize: 12, color: '#666' }}>{ult.trimestre}º trimestre/{ult.ano} · por {ult.avaliador_nome || '—'}</div>
            {ult.pontos_fortes && <div style={{ fontSize: 13, marginTop: 6 }}>💪 <b>Pontos fortes:</b> {ult.pontos_fortes}</div>}
            {ult.a_desenvolver && <div style={{ fontSize: 13, marginTop: 4 }}>🎯 <b>A desenvolver:</b> {ult.a_desenvolver}</div>}
            {hist.norte?.length > 0 && <div style={{ marginTop: 8, background: '#F3FBF6', borderRadius: 8, padding: '8px 11px' }}>
              <div style={{ fontSize: 11.5, color: '#1E8449', fontWeight: 700 }}>Onde focar (competências mais baixas):</div>
              {hist.norte.map((n, i) => <span key={i} style={{ fontSize: 12, marginRight: 8 }}>{n.nome} <b>({n.nota}/5)</b></span>)}
            </div>}
          </>
        )}
      </div>

      <div style={{ ...s.card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>🔄 Meu plano de desenvolvimento (PDCA)</div>
          {!sug && <button onClick={() => setSug({})} style={{ ...s.chip, marginLeft: 'auto' }}>💡 Sugerir melhoria</button>}
        </div>
        {sug && (
          <div style={{ background: '#FFFDF5', border: '1px solid #f0e6c8', borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <input placeholder="Tema / o que quero melhorar" value={sug.tema || ''} onChange={e => setSug({ ...sug, tema: e.target.value })} style={s.inp} />
            <input placeholder="Por que / objetivo (opcional)" value={sug.objetivo || ''} onChange={e => setSug({ ...sug, objetivo: e.target.value })} style={s.inp} />
            <div style={{ display: 'flex', gap: 6 }}><button onClick={enviarSug} style={s.btn}>Enviar sugestão</button><button onClick={() => setSug(null)} style={s.chip}>Cancelar</button></div>
          </div>
        )}
        {pdi.length === 0 && !sug && <div style={{ fontSize: 13, color: '#999' }}>Nenhum plano ainda. Você pode sugerir uma melhoria — o gestor/RH transforma em plano.</div>}
        {pdi.map(p => <PdiCard key={p.id} p={p} />)}
      </div>
    </div>
  );
}

const STATUS_PDI = { planejado: ['Planejado', '#888'], em_andamento: ['Em andamento', '#185FA5'], concluido: ['Concluído', '#1E8449'], cancelado: ['Cancelado', '#C0392B'] };
function PdiCard({ p, onEdit }) {
  const st = STATUS_PDI[p.status] || STATUS_PDI.planejado;
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 10, padding: '9px 11px', marginBottom: 8, borderLeft: `4px solid ${st[1]}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{p.tema}</span>
        <span style={{ fontSize: 10, color: '#fff', background: st[1], borderRadius: 5, padding: '1px 7px' }}>{st[0]}</span>
        {p.origem === 'sugestao' && <span style={{ fontSize: 10, color: '#8a6d3b', background: '#FCF8E3', borderRadius: 5, padding: '1px 7px' }}>💡 sugestão</span>}
        {p.origem === 'avaliacao' && <span style={{ fontSize: 10, color: '#31708f', background: '#EAF3FB', borderRadius: 5, padding: '1px 7px' }}>da avaliação</span>}
        {p.prazo && <span style={{ fontSize: 11, color: '#888', marginLeft: 'auto' }}>prazo {dBR(p.prazo)}</span>}
        {onEdit && <button onClick={() => onEdit(p)} style={{ ...s.chip, marginLeft: p.prazo ? 6 : 'auto' }}>editar</button>}
      </div>
      <div style={{ fontSize: 12, color: '#555', marginTop: 4, display: 'grid', gap: 2 }}>
        {p.objetivo && <div><b>P</b> · Objetivo: {p.objetivo}</div>}
        {p.acao && <div><b>P</b> · Ação: {p.acao}</div>}
        {p.resultado && <div><b>C</b> · Resultado: {p.resultado}</div>}
        {p.ajuste && <div><b>A</b> · Ajuste: {p.ajuste}</div>}
        {p.curso_titulo && <div style={{ color: '#1E8449' }}>📚 Curso: {p.curso_titulo}</div>}
      </div>
    </div>
  );
}

// Config do período de avaliação (só RH/gestão) — abre a tarefa sozinho a cada trimestre.
function ConfigAvaliacao({ API }) {
  const [c, setC] = useState(null); const [msg, setMsg] = useState('');
  useEffect(() => { API.get('/capacitacao/avaliacao-config').then(r => setC(r.data)).catch(() => {}); }, [API]);
  if (!c || !c.gestao) return null;
  const premio = c.premio || [];
  const setFaixa = (i, k, v) => setC({ ...c, premio: premio.map((f, j) => j === i ? { ...f, [k]: Number(v) || 0 } : f) });
  const salvar = () => API.put('/capacitacao/avaliacao-config', { ativo: c.ativo, dia: c.dia, premio }).then(r => { setC({ ...r.data, gestao: true }); setMsg('✅ salvo'); setTimeout(() => setMsg(''), 2000); });
  const abrirAgora = () => API.post('/capacitacao/avaliacao-config/abrir-agora').then(r => setMsg(r.data.ok ? `✅ ${r.data.criadas} tarefa(s) aberta(s)` : '⚠️ ' + (r.data.motivo || 'nada a abrir'))).then(() => setTimeout(() => setMsg(''), 3500));
  return (
    <div style={{ ...s.card, borderLeft: '4px solid #185FA5', background: '#F7FAFD' }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 2 }}>⚙️ Avaliação trimestral automática</div>
      <div style={{ fontSize: 11.5, color: '#666', marginBottom: 8 }}>No início de cada trimestre o sistema abre sozinho a tarefa de avaliar a equipe para o <b>gerente</b> e o <b>subgerente</b> de cada loja (definidos no cadastro da loja).</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 6, fontSize: 12.5, alignItems: 'center' }}><input type="checkbox" checked={!!c.ativo} onChange={e => setC({ ...c, ativo: e.target.checked ? 1 : 0 })} /> Abrir automaticamente</label>
        <label style={{ fontSize: 12, color: '#555', display: 'flex', gap: 4, alignItems: 'center' }}>a partir do dia <input type="number" min="1" max="28" value={c.dia} onChange={e => setC({ ...c, dia: Number(e.target.value) })} style={{ ...s.inp, width: 60, marginBottom: 0 }} /> do trimestre</label>
        <button onClick={salvar} style={{ ...s.chip, ...s.chipOn }}>Salvar</button>
        <button onClick={abrirAgora} style={s.chip}>▶ Abrir trimestre agora</button>
        {msg && <span style={{ fontSize: 12, color: '#1E8449', fontWeight: 700 }}>{msg}</span>}
      </div>
      {premio.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid #e6eef7', paddingTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>🏅 Prêmio em pontos por nota da avaliação (consolidada)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {premio.map((f, i) => (
              <div key={i} style={{ border: '1px solid #dbe6f2', borderRadius: 8, padding: '5px 8px', fontSize: 11.5, display: 'flex', gap: 3, alignItems: 'center' }}>
                nota ≥ <input type="number" step="0.1" min="0" max="5" value={f.min} onChange={e => setFaixa(i, 'min', e.target.value)} style={{ ...s.inp, width: 52, marginBottom: 0 }} /> → <input type="number" min="0" value={f.pontos} onChange={e => setFaixa(i, 'pontos', e.target.value)} style={{ ...s.inp, width: 60, marginBottom: 0 }} /> pts
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: '#999', marginTop: 4 }}>Ao concluir a avaliação, o colaborador ganha os pontos da faixa da nota média (as duas visões consolidadas).</div>
        </div>
      )}
    </div>
  );
}

// ════════════ AVALIAR EQUIPE (líder/RH) ════════════
function AvaliarEquipe() {
  const { API } = useAuth();
  const [colabs, setColabs] = useState([]);
  const [colab, setColab] = useState('');
  const [tri, setTri] = useState(triAtual);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [comps, setComps] = useState([]);
  const [av, setAv] = useState({ pontos_fortes: '', a_desenvolver: '', comentario: '' });
  const [notas, setNotas] = useState({});
  const [msg, setMsg] = useState('');
  const [pdi, setPdi] = useState([]);
  const [edPdi, setEdPdi] = useState(null);
  const [outras, setOutras] = useState([]);
  const [cursos, setCursos] = useState([]);

  useEffect(() => { API.get('/capacitacao/avaliacoes/colaboradores').then(r => setColabs(r.data.colaboradores || [])).catch(() => {}); }, [API]);
  useEffect(() => { API.get('/capacitacao/cursos').then(r => setCursos(r.data.cursos || [])).catch(() => {}); }, [API]);
  const carregar = useCallback(() => {
    if (!colab) return;
    API.get('/capacitacao/avaliacao', { params: { colaborador_id: colab, trimestre: tri, ano } }).then(r => {
      setComps(r.data.competencias || []);
      const nn = {}; (r.data.competencias || []).forEach(c => { if (c.nota != null) nn[c.id] = c.nota; }); setNotas(nn);
      setAv(r.data.avaliacao || { pontos_fortes: '', a_desenvolver: '', comentario: '' });
      setOutras(r.data.outras_visoes || []);
    }).catch(() => {});
    API.get('/capacitacao/pdi', { params: { colaborador_id: colab } }).then(r => setPdi(r.data.pdi || [])).catch(() => setPdi([]));
  }, [API, colab, tri, ano]);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = (status) => {
    const body = { colaborador_id: colab, trimestre: tri, ano, status, pontos_fortes: av.pontos_fortes, a_desenvolver: av.a_desenvolver, comentario: av.comentario, notas: Object.entries(notas).map(([competencia_id, nota]) => ({ competencia_id, nota })) };
    API.post('/capacitacao/avaliacao', body).then(r => {
      const p = r.data?.premio;
      setMsg(status === 'concluida' ? (p && p.pontos > 0 ? `✅ Concluída — colaborador ganhou ${p.pontos} pts (média ${p.media?.toFixed?.(1)})` : '✅ Avaliação concluída.') : '💾 Rascunho salvo.');
      setTimeout(() => setMsg(''), 3500); carregar();
    });
  };
  const salvarPdi = () => { if (!edPdi.tema?.trim()) return; const req = edPdi.id ? API.put(`/capacitacao/pdi/${edPdi.id}`, edPdi) : API.post('/capacitacao/pdi', { ...edPdi, colaborador_id: colab, origem: edPdi.origem || 'manual' }); req.then(() => { setEdPdi(null); carregar(); }); };
  const removerPdi = (id) => { if (window.confirm('Remover item do PDI?')) API.delete(`/capacitacao/pdi/${id}`).then(carregar); };

  const notaMedia = comps.length && Object.keys(notas).length ? (Object.values(notas).reduce((a, b) => a + Number(b), 0) / Object.values(notas).length).toFixed(1) : null;
  const baixas = comps.filter(c => notas[c.id] != null).sort((a, b) => notas[a.id] - notas[b.id]).slice(0, 3);

  return (
    <div>
      <ConfigAvaliacao API={API} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select value={colab} onChange={e => setColab(e.target.value)} style={{ ...s.inp, minWidth: 240 }}>
          <option value="">Selecione o colaborador…</option>
          {colabs.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.funcao}{c.loja ? ` · ${c.loja}` : ''}</option>)}
        </select>
        <select value={tri} onChange={e => setTri(Number(e.target.value))} style={{ ...s.inp, width: 'auto' }}>{[1, 2, 3, 4].map(t => <option key={t} value={t}>{t}º trimestre</option>)}</select>
        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...s.inp, width: 'auto' }}>{[0, 1].map(i => { const y = hoje.getFullYear() - i; return <option key={y} value={y}>{y}</option>; })}</select>
      </div>

      {!colab && <div style={{ ...s.card, textAlign: 'center', color: '#999' }}>Escolha um colaborador para avaliar e montar o plano de desenvolvimento.</div>}

      {colab && (
        <>
          <div style={{ ...s.card }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>📈 Minha avaliação — {tri}º tri/{ano}</div>
              {av?.status === 'concluida' && <span style={{ fontSize: 11, color: '#fff', background: '#1E8449', borderRadius: 5, padding: '1px 8px' }}>concluída</span>}
              {notaMedia && <span style={{ fontSize: 12, color: '#666', marginLeft: 'auto' }}>média <b>{notaMedia}</b>/5</span>}
            </div>
            {outras.length > 0 && <div style={{ fontSize: 11.5, color: '#31708f', background: '#EAF3FB', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>👥 Este colaborador também já foi avaliado por: <b>{outras.map(o => o.avaliador_nome).join(', ')}</b>. Cada líder faz a sua visão — dá pra comparar na ficha do colaborador.</div>}
            {comps.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #f5f5f5', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, flex: 1, minWidth: 160 }}>{c.nome}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setNotas({ ...notas, [c.id]: n })} style={{ width: 30, height: 30, borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: '1px solid ' + (notas[c.id] === n ? '#1E8449' : '#ddd'), background: notas[c.id] === n ? '#1E8449' : '#fff', color: notas[c.id] === n ? '#fff' : '#888' }}>{n}</button>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: '#999', margin: '4px 0 8px' }}>1 = precisa desenvolver muito · 5 = excelente</div>
            <textarea placeholder="💪 Pontos fortes" value={av.pontos_fortes || ''} onChange={e => setAv({ ...av, pontos_fortes: e.target.value })} style={{ ...s.inp, minHeight: 44 }} />
            <textarea placeholder="🎯 Pontos a desenvolver" value={av.a_desenvolver || ''} onChange={e => setAv({ ...av, a_desenvolver: e.target.value })} style={{ ...s.inp, minHeight: 44 }} />
            <textarea placeholder="Comentário geral (opcional)" value={av.comentario || ''} onChange={e => setAv({ ...av, comentario: e.target.value })} style={{ ...s.inp, minHeight: 40 }} />
            {baixas.length > 0 && <div style={{ background: '#FFF7F0', borderRadius: 8, padding: '8px 11px', marginBottom: 8, fontSize: 12 }}>
              🧭 <b>Norte do desenvolvimento</b> (mais baixas): {baixas.map(c => `${c.nome} (${notas[c.id]})`).join(' · ')} — vire cada uma num item do PDI abaixo.
            </div>}
            {msg && <div style={{ fontSize: 12, color: '#1E8449', marginBottom: 6 }}>{msg}</div>}
            <div style={{ display: 'flex', gap: 6 }}><button onClick={() => salvar('rascunho')} style={s.chip}>Salvar rascunho</button><button onClick={() => salvar('concluida')} style={s.btn}>Concluir avaliação</button></div>
          </div>

          <div style={{ ...s.card }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>🔄 Plano de desenvolvimento (PDCA)</div>
              {!edPdi && <button onClick={() => setEdPdi({ status: 'planejado', origem: 'manual' })} style={{ ...s.chip, marginLeft: 'auto' }}>+ Novo item</button>}
            </div>
            {edPdi && (
              <div style={{ background: '#F7FBF9', border: '1px solid #d7ecdf', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <input placeholder="Tema (ex.: Comunicação com o cliente)" value={edPdi.tema || ''} onChange={e => setEdPdi({ ...edPdi, tema: e.target.value })} style={s.inp} />
                <div style={{ fontSize: 11, color: '#1E8449', fontWeight: 700, margin: '2px 0' }}>PLAN — planejar</div>
                <input placeholder="Objetivo (o que se quer desenvolver)" value={edPdi.objetivo || ''} onChange={e => setEdPdi({ ...edPdi, objetivo: e.target.value })} style={s.inp} />
                <input placeholder="Ação (o que vamos fazer: curso, acompanhamento…)" value={edPdi.acao || ''} onChange={e => setEdPdi({ ...edPdi, acao: e.target.value })} style={s.inp} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <label style={s.lbl}>Status (DO)<select value={edPdi.status} onChange={e => setEdPdi({ ...edPdi, status: e.target.value })} style={{ ...s.inp, width: 150 }}>{Object.entries(STATUS_PDI).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select></label>
                  <label style={s.lbl}>Prazo<input type="date" value={edPdi.prazo || ''} onChange={e => setEdPdi({ ...edPdi, prazo: e.target.value })} style={{ ...s.inp, width: 150 }} /></label>
                </div>
                <label style={s.lbl}>📚 Curso vinculado (opcional)
                  <select value={edPdi.curso_id || ''} onChange={e => setEdPdi({ ...edPdi, curso_id: e.target.value })} style={s.inp}>
                    <option value="">— nenhum —</option>
                    {cursos.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                  </select>
                </label>
                <input placeholder="CHECK — resultado (como foi)" value={edPdi.resultado || ''} onChange={e => setEdPdi({ ...edPdi, resultado: e.target.value })} style={s.inp} />
                <input placeholder="ACT — ajuste / próximo passo" value={edPdi.ajuste || ''} onChange={e => setEdPdi({ ...edPdi, ajuste: e.target.value })} style={s.inp} />
                <div style={{ display: 'flex', gap: 6 }}><button onClick={salvarPdi} style={s.btn}>Salvar</button><button onClick={() => setEdPdi(null)} style={s.chip}>Cancelar</button>{edPdi.id && <button onClick={() => { removerPdi(edPdi.id); setEdPdi(null); }} style={{ ...s.chip, color: '#993C1D', marginLeft: 'auto' }}>remover</button>}</div>
              </div>
            )}
            {pdi.length === 0 && !edPdi && <div style={{ fontSize: 13, color: '#999' }}>Nenhum item ainda. Use o norte da avaliação para criar os primeiros.</div>}
            {pdi.map(p => <PdiCard key={p.id} p={p} onEdit={setEdPdi} />)}
          </div>
        </>
      )}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 900, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 12 },
  inp: { width: '100%', padding: '9px 11px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, marginBottom: 8, fontFamily: 'inherit', boxSizing: 'border-box' },
  lbl: { display: 'flex', flexDirection: 'column', fontSize: 11, color: '#666', gap: 2 },
  btn: { fontSize: 13, padding: '9px 16px', background: '#1E8449', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  chip: { fontSize: 12, padding: '6px 12px', border: '1px solid #ddd', borderRadius: 20, background: '#fff', cursor: 'pointer', color: '#555' },
  chipOn: { background: '#1E8449', color: '#fff', borderColor: '#1E8449' },
};
