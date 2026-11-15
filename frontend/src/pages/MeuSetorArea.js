import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import { UI, Kpi, KpiGrid, Tabs, FiltroBar, CORES } from '../components/ui';
import SetorObservacoes from '../components/SetorObservacoes';
import { usePeriodo, CampoPeriodo } from '../components/Periodo';

const num = v => (Number(v) || 0).toLocaleString('pt-BR');
const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
// Só Diretoria cadastra/edita meta e premiação (ninguém mexe na própria meta).
const GESTAO = ['Diretor Geral', 'Gestor Geral'];
const corFarol = f => f === 'verde' ? CORES.ok : f === 'amarelo' ? '#B45309' : f === 'vermelho' ? CORES.alerta : CORES.fraco;
const fmtVal = (v, u) => v == null ? '—' : u === 'R$' ? 'R$ ' + num(Math.round(v)) : u === '%' ? v + '%' : u === 'min' ? v + ' min' : u === 'dias' ? v + ' dias' : u === 'nota' ? v : num(v);
const AREAS = { online: { emoji: '🛒', titulo: 'Meu Setor — Online', sub: 'Pilares e metas do atendimento online (BotVendas): tempos, satisfação, conversão e venda.' },
  suporte: { emoji: '🛟', titulo: 'Meu Setor — Suporte Loja', sub: 'Pilares e metas do suporte às lojas: recebimento, conferência, acuracidade, fiscal e entrega.' } };

// FONTE: abstrai os endpoints + o seletor (loja ou comprador). Default = área (loja-scoped: online/suporte).
// Precificação usa a fonte comprador-scoped. Isso permite 1 componente servir todas as áreas.
export function fonteArea(area) {
  const m = AREAS[area] || AREAS.online;
  return { emoji: m.emoji, titulo: m.titulo, sub: m.sub,
    sel: { label: 'Loja', allLabel: 'Rede (todas)', listaUrl: '/meu-setor-area/lojas', listaKey: 'lojas', minWidth: 170 },
    apurar: (sel, params) => ({ url: `/meu-setor-area/${area}/apurar`, params: { loja: sel, ...params } }),
    configUrl: () => `/meu-setor-area/${area}/config`, premioUrl: () => `/meu-setor-area/${area}/premio`,
    pessoasUrl: () => `/meu-setor-area/${area}/pessoas`, obsBase: () => `/setor-obs/${area}` };
}
export function fontePrecificacao() {
  return { emoji: '🏷️', titulo: 'Meu Setor — Precificação', sub: 'Itens fora do preço por comprador (menor melhor): abaixo do custo, abaixo da margem, comprado mais caro.',
    sel: { label: 'Comprador', allLabel: null, listaUrl: '/precificacao/meu-setor/compradores', listaKey: 'compradores', minWidth: 220 },
    apurar: (sel, params) => ({ url: `/precificacao/meu-setor/${sel}/apurar`, params: { ...params } }),
    configUrl: (sel) => `/precificacao/meu-setor/${sel}/config`, premioUrl: () => `/precificacao/meu-setor/premio`,
    pessoasUrl: (sel) => `/precificacao/meu-setor/${sel}/pessoas`, obsBase: (sel) => `/setor-obs/precificacao-${sel}` };
}

export default function MeuSetorArea({ area = 'online', fonte = null, embutido = false, abaFixa = null }) {
  const { API, usuario } = useAuth();
  const gestao = GESTAO.includes(usuario?.funcao);
  const F = fonte || fonteArea(area);
  const selObrig = F.sel.allLabel == null; // comprador: precisa escolher
  const [lista, setLista] = useState([]); const [sel, setSel] = useState('');
  const per = usePeriodo('30');
  const [abaState, setAba] = useState('setor'); const aba = abaFixa || abaState; const [d, setD] = useState(null); const [cfg, setCfg] = useState(null);
  const [modal, setModal] = useState(null); const [pilarAberto, setPilarAberto] = useState(null);
  useEffect(() => { API.get(F.sel.listaUrl).then(r => { const xs = r.data[F.sel.listaKey] || []; setLista(xs); if (selObrig && xs[0]) setSel(xs[0].id); }).catch(() => {}); }, [API, F.sel.listaUrl]); // eslint-disable-line
  const carregar = useCallback(() => { if (!per.params || (selObrig && !sel)) return; const { url, params } = F.apurar(sel, per.params); API.get(url, { params }).then(r => setD(r.data)).catch(() => setD(null)); }, [API, sel, per.periodo, per.ini, per.fim]); // eslint-disable-line
  useEffect(() => { carregar(); }, [carregar]);
  const carregarCfg = useCallback(() => { if (selObrig && !sel) { setCfg(null); return; } API.get(F.configUrl(sel)).then(r => setCfg(r.data)).catch(() => setCfg(null)); }, [API, sel]); // eslint-disable-line
  useEffect(() => { if (aba === 'metas') carregarCfg(); }, [aba, carregarCfg]);
  const salvarMeta = (chave, patch) => API.post(F.configUrl(sel), { chave, ...patch }).then(() => { carregarCfg(); carregar(); }).catch(() => {});
  const minhaPremio = (d?.pessoas || []).find(p => p.colaborador_id === usuario?.id);

  const Wrap = embutido ? 'div' : 'div';
  return (
    <Wrap style={embutido ? {} : UI.page}>
      {!embutido && <Banner emoji={F.emoji} titulo={F.titulo} cor="verde" sub={F.sub} />}
      {(aba !== 'metas' || selObrig) && <FiltroBar>
        <label style={UI.fld}>{F.sel.label}<select value={sel} onChange={e => setSel(e.target.value)} style={{ ...UI.inp, minWidth: F.sel.minWidth || 170 }}>{F.sel.allLabel != null && <option value="">{F.sel.allLabel}</option>}{lista.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        {aba !== 'metas' && <CampoPeriodo {...per} />}
      </FiltroBar>}
      {!abaFixa && <Tabs itens={[['setor', '🎯 Meu Setor'], ...(gestao ? [['metas', '⚙️ Metas & Premiações']] : [])]} ativa={aba} onChange={setAba} />}

      {aba === 'setor' && (!d ? <div style={UI.card}>⏳ Carregando…</div> : d.erro ? <div style={UI.card}>⚠️ {d.erro}</div> : <>
        <div style={{ fontSize: 12.5, color: CORES.suave, marginBottom: 10 }}>Nota geral do setor: <b style={{ color: corFarol(d.notaGeral == null ? 'sem' : d.notaGeral >= 80 ? 'verde' : d.notaGeral >= 50 ? 'amarelo' : 'vermelho') }}>{d.notaGeral != null ? d.notaGeral + '/100' : '—'}</b> — média das notas dos pilares. Clique num pilar pra ver os indicadores.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
          {(d.pilares || []).map(p => (
            <div key={p.pilar} onClick={() => setPilarAberto(pilarAberto === p.pilar ? null : p.pilar)} title="clique para ver os indicadores deste pilar"
              style={{ background: '#fff', border: '2px solid ' + (pilarAberto === p.pilar ? corFarol(p.farol) : CORES.borda), borderRadius: 12, padding: '10px 12px', cursor: 'pointer' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334' }}>{p.pilar}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: corFarol(p.farol), lineHeight: 1.15 }}>{p.nota == null ? '—' : p.nota}<span style={{ fontSize: 12, color: CORES.fraco, fontWeight: 600 }}>/100</span></div>
              <div style={{ fontSize: 11 }}><span style={{ color: CORES.ok }}>🟢{p.verde}</span> <span style={{ color: CORES.alerta }}>🔴{(p.indicadores || []).filter(i => i.farol === 'vermelho').length}</span></div>
              <div style={{ fontSize: 12, fontWeight: 800, color: CORES.marca, marginTop: 3 }}>{brl(p.premio)}{p.bonus && <span title="bateu 100% — teto + bônus" style={{ fontSize: 10, color: '#B7791F' }}> ★</span>}</div>
            </div>
          ))}
        </div>
        {pilarAberto && <div style={{ fontSize: 12.5, color: CORES.suave, marginBottom: 6 }}>Indicadores do pilar <b>{pilarAberto}</b>. <button onClick={() => setPilarAberto(null)} style={{ background: 'none', border: 'none', color: CORES.marca, cursor: 'pointer', fontWeight: 600 }}>fechar</button></div>}
        {!pilarAberto ? <div style={{ ...UI.card, color: CORES.fraco, textAlign: 'center' }}>👆 Clique num pilar acima para ver os indicadores dele.</div> :
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, marginBottom: 12 }}>
            {((d.pilares || []).find(p => p.pilar === pilarAberto)?.indicadores || []).map(i => (
              <div key={i.chave} onClick={() => setModal(i)} title="clique para entender o indicador"
                style={{ background: '#fff', border: '1px solid ' + corFarol(i.farol) + '55', borderLeft: '4px solid ' + corFarol(i.farol), borderRadius: 12, padding: '11px 14px', cursor: 'pointer' }}>
                <div style={{ fontSize: 11.5, color: CORES.suave, fontWeight: 600, minHeight: 30 }}>{i.nome} <span style={{ color: corFarol(i.farol) }}>ⓘ</span></div>
                <div style={{ fontSize: 26, fontWeight: 800, color: i.semMeta ? CORES.texto : corFarol(i.farol), margin: '2px 0', lineHeight: 1.1 }}>{fmtVal(i.realizado, i.unidade)}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
                  <span style={{ color: '#777' }}>{i.meta != null ? 'Meta ' + (i.direcao === 'menor' ? '≤ ' : '≥ ') + fmtVal(i.meta, i.unidade) : 'sem meta'}</span>
                  <b style={{ color: corFarol(i.farol) }}>{i.semDados ? 'sem dados' : i.semMeta ? '—' : i.hit ? 'no alvo' : 'fora'}</b>
                </div>
                {i.mercado && <div style={{ fontSize: 10, color: '#2563eb', marginTop: 4, whiteSpace: 'normal', lineHeight: 1.3 }}>📈 {i.mercado}</div>}
                <div style={{ fontSize: 9.5, color: '#bbb', marginTop: 3, textTransform: 'uppercase', letterSpacing: .3 }}>⚙️ automático · ⓘ detalhes</div>
              </div>
            ))}
          </div>}

        <SetorObservacoes API={API} base={F.obsBase(sel)} />
      </>)}

      {aba === 'metas' && gestao && (!cfg ? <div style={UI.card}>⏳ Carregando…</div> : <>
        <div style={{ ...UI.card, padding: 0, overflowX: 'auto' }}>
          <table style={UI.tabela}><thead><tr>{['Indicador', 'Pilar', 'Meta', 'Bate quando', 'Tolerância (faixa)', 'Peso', 'Ativo'].map(h => <th key={h} style={UI.th}>{h}</th>)}</tr></thead>
            <tbody>{cfg.indicadores.map(i => <tr key={i.chave}>
              <td style={{ ...UI.td, fontWeight: 600 }}>{i.nome}</td>
              <td style={UI.td}>{i.pilar}</td>
              <td style={UI.td}><input type="number" step="any" defaultValue={i.meta ?? ''} onBlur={e => salvarMeta(i.chave, { meta: e.target.value, peso: i.peso, direcao: i.direcao, tol: i.tol, ativo: i.ativo })} style={{ ...UI.inp, width: 90 }} /> <span style={{ fontSize: 10, color: CORES.fraco }}>{i.unidade}</span></td>
              <td style={UI.td}><select defaultValue={i.direcao} onChange={e => salvarMeta(i.chave, { meta: i.meta, peso: i.peso, direcao: e.target.value, tol: i.tol, ativo: i.ativo })} style={UI.inp}><option value="maior">≥ meta</option><option value="menor">≤ meta</option></select></td>
              <td style={UI.td}><input type="number" step="any" defaultValue={i.tol ?? 0} onBlur={e => salvarMeta(i.chave, { meta: i.meta, peso: i.peso, direcao: i.direcao, tol: e.target.value, ativo: i.ativo })} style={{ ...UI.inp, width: 80 }} title="banda do amarelo em torno da meta" /></td>
              <td style={UI.td}><input type="number" defaultValue={i.peso} onBlur={e => salvarMeta(i.chave, { meta: i.meta, peso: e.target.value, direcao: i.direcao, tol: i.tol, ativo: i.ativo })} style={{ ...UI.inp, width: 60 }} /></td>
              <td style={UI.td}><input type="checkbox" checked={i.ativo} onChange={e => salvarMeta(i.chave, { meta: i.meta, peso: i.peso, direcao: i.direcao, tol: i.tol, ativo: e.target.checked })} /></td>
            </tr>)}</tbody></table>
          <p style={{ fontSize: 11.5, color: CORES.suave, padding: '8px 12px' }}>💡 <b>Faixa de valor</b>: a tolerância é a banda do amarelo em torno da meta — dentro dela o indicador fica 🟡 (meio ponto), fora 🔴. A nota do pilar = média dos faróis (🟢100/🟡50/🔴0) ponderada pelo peso.</p>
        </div>
        <FaixasPremio API={API} premioUrl={F.premioUrl()} d={d} gestao={gestao} onSaved={() => { carregarCfg(); carregar(); }} />
        <PessoasPremio API={API} pessoasUrl={F.pessoasUrl(sel)} d={d} gestao={gestao} onSaved={carregar} />
      </>)}

      {modal && (() => {
        const val = fmtVal(modal.realizado, modal.unidade);
        const alvo = modal.meta != null ? (modal.direcao === 'menor' ? '≤ ' : '≥ ') + fmtVal(modal.meta, modal.unidade) : 'sem meta cadastrada';
        const statusTxt = modal.semDados ? '⚪ Sem dados' : modal.semMeta ? '⚪ Sem meta' : modal.hit ? '✅ No alvo' : modal.farol === 'amarelo' ? '🟡 Na tolerância' : '🔴 Fora do alvo';
        const significa = modal.realizado == null ? 'Ainda não há dado no período para medir este indicador.'
          : modal.meta == null ? `O realizado no período é ${val}. Cadastre uma meta pra virar farol.`
            : modal.hit ? `Está no alvo: o realizado (${val}) está ${modal.direcao === 'menor' ? 'dentro do limite' : 'no mínimo exigido'} da meta (${alvo}).`
              : `Fora do alvo: o realizado (${val}) ${modal.direcao === 'menor' ? 'passou do limite' : 'ficou abaixo do piso'} da meta (${alvo})${modal.tol ? `, com tolerância de ±${modal.tol}` : ''}.`;
        const Bloco = ({ t, children }) => <div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, fontWeight: 700, color: CORES.suave, textTransform: 'uppercase', letterSpacing: .3, marginBottom: 2 }}>{t}</div><div style={{ fontSize: 13, color: CORES.texto, lineHeight: 1.45 }}>{children}</div></div>;
        return <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(16,40,45,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 22, maxWidth: 560, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1c2a2e' }}>{modal.nome}</div>
            <div style={{ fontSize: 12, color: CORES.fraco, marginBottom: 10 }}>{modal.pilar} · ⚙️ automático do sistema</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: modal.semMeta ? CORES.texto : corFarol(modal.farol) }}>{val}</div>
              <div style={{ fontSize: 13, color: '#555' }}>Meta {alvo}<br /><b style={{ color: corFarol(modal.farol) }}>{statusTxt}</b></div>
            </div>
            <Bloco t="O que significa">{significa}</Bloco>
            {modal.desc && <Bloco t="Como é medido">{modal.desc}</Bloco>}
            {modal.calc && <Bloco t="Como é calculado">{modal.calc}</Bloco>}
            {modal.acesso && <Bloco t="Onde acessar / de onde vem">{modal.acesso}</Bloco>}
            {modal.mercado && <Bloco t="Referência de mercado">{modal.mercado}</Bloco>}
            <div style={{ textAlign: 'right', marginTop: 6 }}><button onClick={() => setModal(null)} style={{ background: CORES.marca, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>Fechar</button></div>
          </div>
        </div>;
      })()}
    </Wrap>
  );
}

// ── Pessoas na premiação (por fator) — igual Compras/Caixas ──
function PessoasPremio({ API, pessoasUrl, d, gestao, onSaved }) {
  const [cols, setCols] = useState([]); const [sel, setSel] = useState(''); const [fator, setFator] = useState(100); const [msg, setMsg] = useState('');
  const pessoas = d?.pessoas || [];
  useEffect(() => { if (gestao) API.get('/colaboradores').then(r => setCols(r.data.colaboradores || [])).catch(() => {}); }, [API, gestao]);
  const jaTem = new Set(pessoas.map(p => p.colaborador_id));
  const vincular = () => { if (!sel) { setMsg('Selecione um colaborador.'); setTimeout(() => setMsg(''), 2500); return; }
    if (!pessoasUrl) { setMsg('Selecione o escopo primeiro.'); setTimeout(() => setMsg(''), 2500); return; }
    API.post(pessoasUrl, { colaborador_id: sel, fator: (Number(fator) || 0) / 100 })
      .then(() => { setSel(''); setFator(100); onSaved && onSaved(); }).catch(e => { setMsg(e.response?.data?.erro || 'Erro.'); setTimeout(() => setMsg(''), 3000); }); };
  const remover = cid => API.delete(`${pessoasUrl}/${cid}`).then(() => onSaved && onSaved()).catch(() => {});
  return (
    <div style={UI.card}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>🧑‍🤝‍🧑 Pessoas na premiação deste setor</div>
      <div style={{ fontSize: 12, color: CORES.suave, marginBottom: 10 }}>Cada pessoa recebe a premiação do setor <b>× o fator</b> dela (100% = cheio, 50% = metade). Ex.: titular 100% + auxiliar 50%. No período, o setor faz <b style={{ color: CORES.marca }}>{brl(d?.premioTotalChefe || 0)}</b>.</div>
      {pessoas.length > 0 ? <div style={{ overflowX: 'auto', marginBottom: 10 }}><table style={UI.tabela}>
        <thead><tr>{['Pessoa', 'Fator', 'Prêmio no período', ''].map(h => <th key={h} style={UI.th}>{h}</th>)}</tr></thead>
        <tbody>{pessoas.map(p => <tr key={p.colaborador_id}>
          <td style={{ ...UI.td, fontWeight: 600 }}>{p.nome || p.colaborador_id}</td>
          <td style={UI.td}>{Math.round((p.fator || 0) * 100)}%</td>
          <td style={{ ...UI.td, fontWeight: 700, color: CORES.marca }}>{brl(p.premioTotal)}</td>
          <td style={UI.td}>{gestao && <button onClick={() => remover(p.colaborador_id)} style={{ ...UI.btn, color: CORES.alerta, padding: '3px 10px', fontSize: 11.5 }}>remover</button>}</td>
        </tr>)}</tbody></table></div>
        : <div style={{ fontSize: 12.5, color: CORES.fraco, marginBottom: 10 }}>Ninguém vinculado ainda — a premiação vai inteira para o responsável do setor.</div>}
      {gestao && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{ ...UI.inp, minWidth: 220 }}>
          <option value="">Selecione o colaborador…</option>
          {cols.filter(c => !jaTem.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ' · ' + c.funcao : ''}</option>)}
        </select>
        <label style={{ fontSize: 12, color: CORES.suave, display: 'inline-flex', alignItems: 'center', gap: 4 }}>Fator<input type="number" value={fator} onChange={e => setFator(e.target.value)} style={{ ...UI.inp, width: 64 }} />%</label>
        <button onClick={vincular} style={{ ...UI.btn, background: CORES.marca, color: '#fff', borderColor: 'transparent' }}>+ Vincular</button>
        {msg && <span style={{ fontSize: 12, color: '#b45309' }}>{msg}</span>}
      </div>}
    </div>
  );
}

// ── Faixas do prêmio por pilar (igual Caixas): chips de faixa + teto/bônus + quanto o chefe faria ──
function FaixasPremio({ API, premioUrl, d, gestao, onSaved }) {
  const [valor, setValor] = useState(''); const [bonus, setBonus] = useState(''); const [msg, setMsg] = useState('');
  useEffect(() => { API.get(premioUrl).then(r => { setValor(r.data.premioValor); setBonus(Math.round((r.data.bonusPct || 0) * 100)); }).catch(() => {}); }, [API, premioUrl]);
  const salvar = () => API.put(premioUrl, { valor: Number(valor) || 0, bonusPct: (Number(bonus) || 0) / 100 })
    .then(() => { setMsg('✅ Premiação salva.'); setTimeout(() => setMsg(''), 2500); onSaved && onSaved(); }).catch(() => { setMsg('⚠️ Erro.'); setTimeout(() => setMsg(''), 3000); });
  const nP = (d?.pilares || []).length || 0;
  const teto = Number(valor) || 0; const bpct = (Number(bonus) || 0) / 100;
  const faixas = [
    { nota: '0%', v: 0 }, { nota: '50%', v: teto * 0.5 }, { nota: '75%', v: teto * 0.75 },
    { nota: '100% ★', v: teto * (1 + bpct), dest: true }, { nota: `máx (${nP} pilares)`, v: teto * (1 + bpct) * nP, max: true },
  ];
  return (
    <div style={UI.card}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>🏆 Faixas do prêmio por pilar</div>
      <div style={{ fontSize: 12, color: CORES.suave, marginBottom: 10 }}>Cada um dos <b>{nP} pilares</b> vale até <b>{brl(teto)}</b> e paga <b>proporcional à nota</b>. Como a nota não passa de 100, <b>bater 100% paga o teto + {Math.round(bpct * 100)}% de bônus</b>. Some os pilares — esse é o prêmio do <b>chefe</b>. Cada pessoa vinculada recebe esse total <b>× o fator</b> dela.</div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          {faixas.map(f => <div key={f.nota} style={{ border: '1px solid ' + (f.max ? 'transparent' : f.dest ? '#cdeadd' : CORES.borda), background: f.max ? 'linear-gradient(95deg,#0E7C5A,#0b6e59)' : f.dest ? '#eef7f2' : '#fff', color: f.max ? '#fff' : CORES.texto, borderRadius: 10, padding: '8px 12px', textAlign: 'center', minWidth: 92 }}>
            <div style={{ fontSize: 11, color: f.max ? 'rgba(255,255,255,.85)' : CORES.fraco, fontWeight: 700 }}>{f.nota}</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{brl(f.v)}</div>
          </div>)}
        </div>
        {gestao && <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11.5, color: CORES.suave, display: 'flex', flexDirection: 'column', gap: 3 }}>Teto R$/pilar<input type="number" value={valor} onChange={e => setValor(e.target.value)} style={{ ...UI.inp, width: 90 }} /></label>
          <label style={{ fontSize: 11.5, color: CORES.suave, display: 'flex', flexDirection: 'column', gap: 3 }}>Bônus 100% (%)<input type="number" value={bonus} onChange={e => setBonus(e.target.value)} style={{ ...UI.inp, width: 70 }} /></label>
          <button onClick={salvar} style={{ ...UI.btn, background: CORES.marca, color: '#fff', borderColor: 'transparent' }}>Salvar</button>
        </div>}
      </div>
      {d?.premioTotalChefe != null && <div style={{ fontSize: 12.5, color: CORES.suave }}>No período o chefe faria <b style={{ color: CORES.marca }}>{brl(d.premioTotalChefe)}</b> (nota geral {d.notaGeral}/100).</div>}
      {msg && <span style={{ fontSize: 12, fontWeight: 600, color: msg.startsWith('⚠️') ? CORES.alerta : CORES.ok }}>{msg}</span>}
    </div>
  );
}
