import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

// Cores por nível de alerta de legislação
const NIVEL = {
  bloqueio: { cor: '#7f1d1d', bg: '#fee2e2', label: '⛔ Bloqueio (a lei proíbe)' },
  critico: { cor: '#b91c1c', bg: '#fee2e2', label: '🔴 Crítico' },
  atencao: { cor: '#b45309', bg: '#fef3c7', label: '🟡 Atenção' },
  informativo: { cor: '#1d4ed8', bg: '#dbeafe', label: '🔵 Informativo' },
};
const STATUS = {
  rascunho: ['#6b7280', 'Rascunho'], pendente_autorizacao: ['#b45309', '⏳ Aguarda RH'],
  autorizada: ['#15803d', '✓ Autorizada'], publicada: ['#0f766e', '📣 Publicada'],
};
const h = m => `${Math.floor((m || 0) / 60)}h${String((m || 0) % 60).padStart(2, '0')}`;

// Impressão da Folha de Ponto (layout oficial) — reutilizada pelo espelho e pelos relatórios
function printFolha(esp) {
  const hm = m => `${String(Math.floor(Math.abs(m || 0) / 60)).padStart(2, '0')}:${String(Math.abs(m || 0) % 60).padStart(2, '0')}`;
  const sSaldo = m => (m < 0 ? '-' : '') + hm(m);
  const dow = d => ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][new Date(d + 'T00:00:00').getDay()];
  const c = esp.colaborador || {}, e = esp.empregador || {};
  const linhas = esp.dias.map(d => {
    const pontos = d.folga ? '-' : (d.status === 'falta' ? 'FALTA NAO JUSTIFICADA' : (d.batidas_horas || '-'));
    return `<tr><td>${d.data.slice(8, 10)}/${d.data.slice(5, 7)}</td><td>${dow(d.data)}</td><td>${pontos}</td>
      <td class=r>${d.folga ? '' : hm(d.trabalhado_min)}</td><td class=r>${d.abono_min ? hm(d.abono_min) : ''}</td>
      <td class=r>${d.folga ? '' : hm(d.previsto_min)}</td><td class=r>${d.folga ? '' : sSaldo(d.saldo_min)}</td></tr>`;
  }).join('');
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Folha de Ponto</title><style>
    body{font-family:Arial,sans-serif;padding:22px;color:#111;font-size:11px}
    h1{font-size:20px;margin:0 0 2px} .per{color:#555;font-size:11px;margin-bottom:8px}
    .sec{background:#e9e9ee;font-weight:bold;padding:3px 6px;margin-top:10px;font-size:11px}
    .row{display:flex;flex-wrap:wrap;gap:24px;padding:5px 6px} .row div{font-size:11px} .row b{font-weight:normal;color:#555}
    table{width:100%;border-collapse:collapse;margin-top:6px} th,td{border:1px solid #ccc;padding:3px 6px;text-align:left}
    th{background:#f0f0f4} .r{text-align:right} tfoot td{font-weight:bold;background:#faf7ee}
    .ass{margin-top:50px;display:flex;justify-content:space-around;text-align:center;font-size:11px} .leg{margin-top:14px;color:#666;font-size:10px}
  </style></head><body>
    <h1>Folha de Ponto</h1><div class=per>${esp.periodo.ini.split('-').reverse().join('/')} a ${esp.periodo.fim.split('-').reverse().join('/')}</div>
    <div class=sec>DADOS DO EMPREGADOR</div>
    <div class=row><div><b>Nome:</b> ${e.razao_social || '—'}</div><div><b>CNPJ:</b> ${e.cnpj || '—'}</div><div><b>Local:</b> ${e.local || '—'}</div></div>
    <div class=sec>DADOS DO COLABORADOR</div>
    <div class=row><div><b>Nome:</b> ${c.nome || '—'}</div><div><b>CPF:</b> ${c.cpf || '—'}</div><div><b>Cargo:</b> ${c.cargo || '—'}</div><div><b>Admissão:</b> ${c.admissao ? String(c.admissao).slice(0, 10).split('-').reverse().join('/') : '—'}</div></div>
    <table><thead><tr><th>Dia</th><th>Sem.</th><th>Pontos</th><th class=r>Trabalhadas</th><th class=r>Abono</th><th class=r>Previstas</th><th class=r>Saldo</th></tr></thead>
    <tbody>${linhas}</tbody>
    <tfoot><tr><td colspan=3>Total</td><td class=r>${hm(esp.totais.trab)}</td><td class=r>${hm(esp.totais.abono || 0)}</td><td class=r>${hm(esp.totais.prev)}</td><td class=r>${sSaldo(esp.totais.saldo)}</td></tr></tfoot></table>
    <div class=row style="margin-top:8px"><div><b>Horas extras totais:</b> ${hm(esp.totais.extra)}</div><div><b>Atrasos:</b> ${hm(esp.totais.atraso)}</div><div><b>Horas noturnas:</b> ${hm(esp.totais.noturno || 0)}</div><div><b>Dias faltosos:</b> ${esp.totais.faltas}</div></div>
    <p style="margin-top:16px">Reconheço a exatidão e confirmo a frequência constante deste cartão.</p>
    <div class=ass><span>_____________________________<br>${c.nome || 'Colaborador'}</span><span>_____________________________<br>${e.razao_social || 'Empresa'}</span></div>
    <div class=leg>* Batidas marcadas com (m) foram alteradas manualmente. * Atrasos/Faltas reprovados serão descontados em folha.</div>
    </body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

export default function PontoRepp() {
  const { API, usuario } = useAuth();
  const [aba, setAba] = useState('escalas');
  const podeAutorizar = ['RH', 'Gestor Geral', 'Diretor Geral'].includes(usuario?.funcao);

  return (
    <div style={s.wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '6px 0 12px', borderBottom: '1px solid var(--line,#ddd8cf)', marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--fg,#1c2a2e)' }}>🕐 Ponto — Escala & Jornada</h1>
        <div style={{ ...s.tabs, margin: 0, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {[['inteligente', '✨ Escala Inteligente'], ['batidas', '🟢 Bater ponto'], ['apropriacao', '🛠️ Apropriação (RH)'], ['pendentes', '⚠️ Pontos suspeitos'], ['banco', '🏦 Banco de horas'], ['escalas', '📅 Escalas'], ['regras', '📋 Regras de Ponto'], ['colaborador', '👤 Colaborador (regra & HE)'], ['necessidade', '👥 Necessidade (loja/turno)'], ['fechamento', '🔒 Fechamento'], ['acompanhamento', '📊 Acompanhamento'], ['ferias', '🏖️ Férias'], ['relatorios', '📑 Relatórios (folha)'], ['fiscal', '📄 Arquivos fiscais'], ['feriados', '📆 Feriados'], ['modelos', '🗂️ Modelos de escala'], ['afastamentos', '🌴 Motivos de afastamento'], ['justificativas', '📝 Justificativas de atraso'], ['config', '⚙️ Configurações'], ['parametros', '⚙️ Parâmetros legais']].map(([k, l]) => (
            <button key={k} onClick={() => setAba(k)} style={{ ...s.tab, ...(aba === k ? s.tabAtiva : {}) }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={s.sub}>Registrador de ponto próprio (REP-P). Monte escalas com <b>validação da legislação em tempo real</b>: o sistema deixa criar, mas alerta quando fere a lei e exige <b>autorização de um superior do RH</b>.</div>


      {aba === 'inteligente' && <Inteligente API={API} />}
      {aba === 'batidas' && <Batidas API={API} />}
      {aba === 'apropriacao' && <Apropriacao API={API} podeAutorizar={podeAutorizar} />}
      {aba === 'pendentes' && <Pendentes API={API} podeAutorizar={podeAutorizar} />}
      {aba === 'banco' && <BancoHoras API={API} />}
      {aba === 'escalas' && <Escalas API={API} podeAutorizar={podeAutorizar} />}
      {aba === 'regras' && <RegrasPonto API={API} podeAutorizar={podeAutorizar} />}
      {aba === 'colaborador' && <ColaboradorCfg API={API} podeAutorizar={podeAutorizar} />}
      {aba === 'necessidade' && <Necessidade API={API} />}
      {aba === 'fechamento' && <Fechamento API={API} podeAutorizar={podeAutorizar} />}
      {aba === 'acompanhamento' && <Acompanhamento API={API} podeAutorizar={podeAutorizar} />}
      {aba === 'ferias' && <Ferias API={API} podeAutorizar={podeAutorizar} />}
      {aba === 'relatorios' && <Relatorios API={API} />}
      {aba === 'fiscal' && <Fiscal API={API} />}
      {aba === 'feriados' && <Feriados API={API} />}
      {aba === 'modelos' && <Lista API={API} url="/pontorep/modelos" cols={[['codigo', 'Código'], ['nome', 'Modelo'], ['base_legal', 'Base legal'], ['jornada_diaria_min', 'Jornada/dia', v => h(v)], ['dias_trabalha', 'Trab.'], ['dias_folga', 'Folga'], ['doc_exigido', 'Doc. p/ ativar'], ['observacao', 'Observação']]} />}
      {aba === 'afastamentos' && <Motivos API={API} podeAutorizar={podeAutorizar} />}
      {aba === 'justificativas' && <Justificativas API={API} podeAutorizar={podeAutorizar} />}
      {aba === 'config' && <Configuracoes API={API} podeAutorizar={podeAutorizar} />}
      {aba === 'parametros' && <Parametros API={API} />}
    </div>
  );
}

// ───────── Escalas: criar (com validação) + lista + autorização do RH ─────────
function Escalas({ API, podeAutorizar }) {
  const [modelos, setModelos] = useState([]);
  const [colabs, setColabs] = useState([]);
  const [escalas, setEscalas] = useState([]);
  const [f, setF] = useState({ modeloId: '', dataIni: '', dataFim: '', entrada: '08:00', saida: '16:20', intervalo: 60 });
  const [colabSel, setColabSel] = useState([]);
  const [previa, setPrevia] = useState(null);
  const [msg, setMsg] = useState('');
  const [sel, setSel] = useState(null);

  const carregar = useCallback(() => {
    API.get('/pontorep/escalas').then(r => setEscalas(r.data)).catch(() => {});
  }, [API]);
  useEffect(() => {
    API.get('/pontorep/modelos').then(r => setModelos(r.data)).catch(() => {});
    API.get('/pontorep/colaboradores').then(r => setColabs(r.data)).catch(() => {});
    carregar();
  }, [API, carregar]);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const validar = () => {
    setMsg(''); setPrevia(null);
    API.post('/pontorep/escala/validar', { ...f, colaboradorId: colabSel[0] }).then(r => setPrevia(r.data)).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro ao validar')));
  };
  const criar = () => {
    setMsg('');
    if (!colabSel.length) return setMsg('⚠️ Selecione ao menos um colaborador.');
    if (colabSel.length === 1) {
      API.post('/pontorep/escala', { ...f, colaboradorId: colabSel[0] }).then(r => {
        setMsg(r.data.precisaAutorizacao
          ? '⏳ Escala criada, mas com alertas de legislação — está AGUARDANDO autorização de um superior do RH.'
          : '✅ Escala criada e autorizada (sem conflitos de legislação).');
        setPrevia(null); carregar();
      }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro ao criar')));
    } else {
      API.post('/pontorep/escala/lote', { ...f, colaboradorIds: colabSel }).then(r => {
        const pend = r.data.resultados.filter(x => x.precisaAutorizacao).length;
        setMsg(`✅ ${r.data.criadas}/${r.data.total} escalas criadas${pend ? ` — ${pend} aguardam autorização do RH` : ''}.`);
        setPrevia(null); carregar();
      }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro ao criar em lote')));
    }
  };

  const trabalho = previa ? previa.dias.filter(d => !d.folga) : [];

  return (
    <div>
      {/* formulário */}
      <div style={s.card}>
        <div style={s.cardT}>Nova escala</div>
        <div style={s.grid}>
          <label style={{ ...s.lab, gridColumn: '1 / -1' }}>Colaboradores — segure Ctrl/⌘ para escolher vários ({colabSel.length} selecionado{colabSel.length === 1 ? '' : 's'})
            <select multiple style={{ ...s.inp, minHeight: 120 }} value={colabSel} onChange={e => setColabSel(Array.from(e.target.selectedOptions).map(o => o.value))}>
              {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select></label>
          <label style={s.lab}>Modelo de escala
            <select style={s.inp} value={f.modeloId} onChange={e => set('modeloId', e.target.value)}>
              <option value="">— selecione —</option>
              {modelos.map(m => <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>)}
            </select></label>
          <label style={s.lab}>Início<input type="date" style={s.inp} value={f.dataIni} onChange={e => set('dataIni', e.target.value)} /></label>
          <label style={s.lab}>Fim<input type="date" style={s.inp} value={f.dataFim} onChange={e => set('dataFim', e.target.value)} /></label>
          <label style={s.lab}>Entrada<input type="time" style={s.inp} value={f.entrada} onChange={e => set('entrada', e.target.value)} /></label>
          <label style={s.lab}>Saída<input type="time" style={s.inp} value={f.saida} onChange={e => set('saida', e.target.value)} /></label>
          <label style={s.lab}>Intervalo (min)<input type="number" style={s.inp} value={f.intervalo} onChange={e => set('intervalo', e.target.value)} /></label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button style={s.btn} onClick={validar}>🔍 Validar legislação</button>
          <button style={s.btnP} onClick={criar}>Criar escala</button>
        </div>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>

      {/* prévia da validação */}
      {previa && (
        <div style={s.card}>
          <div style={s.cardT}>Prévia — {previa.modelo.codigo} · {trabalho.length} dias de trabalho · {previa.dias.filter(d => d.folga).length} folgas</div>
          {previa.alertas.length === 0
            ? <div style={{ ...s.alerta, background: '#dcfce7', color: '#15803d' }}>✅ Sem conflitos de legislação — pode criar direto.</div>
            : <>
              <div style={{ margin: '6px 0', fontWeight: 600, color: previa.precisaAutorizacao ? '#b45309' : '#1d4ed8' }}>
                {previa.precisaAutorizacao ? '⚠️ Esta escala fere a legislação — se criar, vai precisar de autorização do RH:' : 'Observações:'}
              </div>
              {previa.alertas.map((a, i) => (
                <div key={i} style={{ ...s.alerta, background: NIVEL[a.nivel].bg, color: NIVEL[a.nivel].cor }}>
                  <b>{NIVEL[a.nivel].label}</b> · {a.mensagem} <span style={s.leg}>({a.base_legal})</span>
                </div>
              ))}
            </>}
        </div>
      )}

      {/* lista de escalas */}
      <div style={s.card}>
        <div style={s.cardT}>Escalas ({escalas.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Colaborador', 'Modelo', 'Período', 'Status', 'Alertas', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {escalas.map(e => (
                <tr key={e.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={s.td}>{e.colaborador_nome || '—'}</td>
                  <td style={s.td}>{e.modelo_codigo}</td>
                  <td style={s.td}>{e.data_ini} → {e.data_fim}</td>
                  <td style={s.td}><span style={{ ...s.pill, background: (STATUS[e.status] || ['#999'])[0] }}>{(STATUS[e.status] || ['', e.status])[1]}</span></td>
                  <td style={s.td}>{e.pendentes > 0 ? <b style={{ color: '#b45309' }}>{e.pendentes} pendente(s)</b> : (e.excecoes || 0) ? `${e.excecoes} ok` : '—'}</td>
                  <td style={s.td}><button style={s.btnMini} onClick={() => API.get('/pontorep/escala/' + e.id).then(r => setSel(r.data))}>abrir</button></td>
                </tr>
              ))}
              {!escalas.length && <tr><td style={s.td} colSpan={6}>Nenhuma escala ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {sel && <Detalhe API={API} escala={sel} onClose={() => setSel(null)} onChange={() => { carregar(); API.get('/pontorep/escala/' + sel.id).then(r => setSel(r.data)); }} podeAutorizar={podeAutorizar} />}
    </div>
  );
}

// ───────── Detalhe + autorização do RH ─────────
function Detalhe({ API, escala, onClose, onChange, podeAutorizar }) {
  const [just, setJust] = useState('');
  const [msg, setMsg] = useState('');
  const pendentes = (escala.alertas || []).filter(a => a.status === 'pendente');

  const autorizar = () => {
    setMsg('');
    API.post(`/pontorep/escala/${escala.id}/autorizar`, { justificativa: just })
      .then(() => { setMsg('✅ Exceções autorizadas e registradas com sua ciência.'); setJust(''); onChange(); })
      .catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  };
  const publicar = () => API.post(`/pontorep/escala/${escala.id}/publicar`).then(() => { setMsg('📣 Escala publicada.'); onChange(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));

  return (
    <div style={s.modalBg} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={s.cardT}>{escala.colaborador_nome} · {escala.modelo_codigo} · {escala.data_ini} → {escala.data_fim}</div>
          <button style={s.btnMini} onClick={onClose}>fechar ✕</button>
        </div>
        <div><span style={{ ...s.pill, background: (STATUS[escala.status] || ['#999'])[0] }}>{(STATUS[escala.status] || ['', escala.status])[1]}</span></div>

        {(escala.alertas || []).length > 0 && <>
          <div style={{ ...s.cardT, marginTop: 12 }}>Alertas de legislação</div>
          {escala.alertas.map(a => (
            <div key={a.id} style={{ ...s.alerta, background: NIVEL[a.nivel].bg, color: NIVEL[a.nivel].cor }}>
              <b>{NIVEL[a.nivel].label}</b> · {a.mensagem} <span style={s.leg}>({a.base_legal})</span>
              {a.status === 'autorizada' && <div style={s.legOk}>✓ liberado{a.justificativa ? ` — "${a.justificativa}"` : ''}</div>}
            </div>
          ))}
        </>}

        {pendentes.length > 0 && (
          podeAutorizar ? (
            <div style={{ ...s.card, marginTop: 12, background: '#fffbeb' }}>
              <div style={s.cardT}>Autorizar exceções ({pendentes.length}) — superior do RH</div>
              <div style={s.legOk}>Declaro estar ciente de que esta liberação contraria a regra citada, que os valores devidos (hora extra, adicional, indenização) serão calculados mesmo assim, e que fica registrada com meu nome.</div>
              <textarea style={{ ...s.inp, minHeight: 70, width: '100%' }} placeholder="Justificativa (mín. 20 caracteres): cobertura de falta, força maior, inventário, erro de cadastro…" value={just} onChange={e => setJust(e.target.value)} />
              <button style={s.btnP} onClick={autorizar}>Autorizar com ciência</button>
            </div>
          ) : <div style={{ ...s.msg, background: '#fef3c7' }}>⏳ Há {pendentes.length} exceção(ões) aguardando autorização de um superior do RH.</div>
        )}

        {escala.status === 'autorizada' && <button style={{ ...s.btnP, marginTop: 10 }} onClick={publicar}>📣 Publicar escala</button>}
        {msg && <div style={s.msg}>{msg}</div>}

        <div style={{ ...s.cardT, marginTop: 12 }}>Dias previstos</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Data', 'Folga', 'Entrada', 'Saída', 'Interv.', 'Jornada'].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {(escala.dias || []).map(d => (
                <tr key={d.id} style={{ borderTop: '1px solid #eee', background: d.folga ? '#f8fafc' : '#fff' }}>
                  <td style={s.td}>{d.data}</td><td style={s.td}>{d.folga ? '🌴' : ''}</td>
                  <td style={s.td}>{d.entrada || '—'}</td><td style={s.td}>{d.saida || '—'}</td>
                  <td style={s.td}>{d.intervalo_min || 0}m</td><td style={s.td}>{d.folga ? '—' : h(d.jornada_min)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ───────── Motivos de afastamento (com flags editáveis) ─────────
function Motivos({ API, podeAutorizar }) {
  const [rows, setRows] = useState([]);
  const [novo, setNovo] = useState(null);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/pontorep/motivos').then(r => setRows(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const flag = (m, k) => { const b = { ...m, [k]: m[k] ? 0 : 1 }; API.put('/pontorep/motivos/' + m.id, b).then(carregar).catch(() => {}); };
  const criar = () => API.post('/pontorep/motivos', novo).then(() => { setMsg('✅ Motivo criado'); setNovo(null); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  const Chk = ({ m, k }) => <input type="checkbox" checked={!!m[k]} disabled={!podeAutorizar} onChange={() => flag(m, k)} />;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={s.sub}>Marque como cada motivo se comporta na apuração. Semeados com base na CLT (art. 473) + INSS.</div>
        {podeAutorizar && <button style={s.btnP} onClick={() => setNovo({ nome: '', abona: 1, hab_gestores: 1 })}>+ Novo motivo</button>}
      </div>
      {novo && (
        <div style={s.card}>
          <div style={s.cardT}>Novo motivo</div>
          <div style={s.grid}>
            <label style={s.lab}>Nome<input style={s.inp} value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} /></label>
            <label style={s.lab}>Base legal<input style={s.inp} value={novo.base_legal || ''} onChange={e => setNovo({ ...novo, base_legal: e.target.value })} /></label>
            <label style={s.lab}>Regra (dias)<input style={s.inp} value={novo.dias_regra || ''} onChange={e => setNovo({ ...novo, dias_regra: e.target.value })} /></label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button style={s.btnP} onClick={criar}>Salvar</button><button style={s.btn} onClick={() => setNovo(null)}>Cancelar</button></div>
        </div>
      )}
      {msg && <div style={s.msg}>{msg}</div>}
      <div style={s.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Motivo', 'Base legal', 'Regra', 'Abona', 'Falta', 'Absenteísmo', 'Gestores', 'Colaboradores', 'Ativo'].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={s.td}><b>{m.nome}</b></td><td style={s.td}>{m.base_legal || '—'}</td><td style={s.td}>{m.dias_regra || '—'}</td>
                  <td style={s.td}><Chk m={m} k="abona" /></td><td style={s.td}><Chk m={m} k="conta_falta" /></td><td style={s.td}><Chk m={m} k="absenteismo" /></td>
                  <td style={s.td}><Chk m={m} k="hab_gestores" /></td><td style={s.td}><Chk m={m} k="hab_colaboradores" /></td><td style={s.td}><Chk m={m} k="ativo" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ───────── Justificativas de atraso (catálogo) ─────────
function Justificativas({ API, podeAutorizar }) {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ descricao: '', anexo_obrigatorio: 0, obs_obrigatoria: 1, hab_gestores: 1, hab_colaboradores: 1 });
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/pontorep/justificativas').then(r => setRows(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const criar = () => { if (!f.descricao) return setMsg('⚠️ Informe a descrição.'); API.post('/pontorep/justificativas', f).then(() => { setMsg('✅ Justificativa salva'); setF({ descricao: '', anexo_obrigatorio: 0, obs_obrigatoria: 1, hab_gestores: 1, hab_colaboradores: 1 }); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro'))); };
  const remover = id => { if (window.confirm('Remover?')) API.delete('/pontorep/justificativas/' + id).then(carregar); };
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <div>
      <div style={{ ...s.msg, background: '#eff6ff', color: '#1e40af', marginBottom: 12 }}>Motivos que o colaborador/gestor escolhe ao justificar um atraso ou ponto pendente.</div>
      {podeAutorizar && (
        <div style={s.card}>
          <div style={s.cardT}>Nova justificativa</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ ...s.lab, flex: 1, minWidth: 180 }}>Descrição<input style={s.inp} value={f.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Ex.: Consulta médica" /></label>
            <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={!!f.anexo_obrigatorio} onChange={e => set('anexo_obrigatorio', e.target.checked ? 1 : 0)} /> Anexo obrigatório</label>
            <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={!!f.obs_obrigatoria} onChange={e => set('obs_obrigatoria', e.target.checked ? 1 : 0)} /> Observação obrigatória</label>
            <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={!!f.hab_gestores} onChange={e => set('hab_gestores', e.target.checked ? 1 : 0)} /> Gestores</label>
            <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={!!f.hab_colaboradores} onChange={e => set('hab_colaboradores', e.target.checked ? 1 : 0)} /> Colaboradores</label>
            <button style={s.btnP} onClick={criar}>Adicionar</button>
          </div>
          {msg && <div style={s.msg}>{msg}</div>}
        </div>
      )}
      <div style={s.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Descrição', 'Anexo obrig.', 'Obs. obrig.', 'Gestores', 'Colaboradores', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={s.td}><b>{r.descricao}</b></td><td style={s.td}>{r.anexo_obrigatorio ? 'Sim' : 'Não'}</td><td style={s.td}>{r.obs_obrigatoria ? 'Sim' : 'Não'}</td>
                  <td style={s.td}>{r.hab_gestores ? 'Sim' : 'Não'}</td><td style={s.td}>{r.hab_colaboradores ? 'Sim' : 'Não'}</td>
                  <td style={s.td}>{podeAutorizar && <button style={s.btnMini} onClick={() => remover(r.id)}>remover</button>}</td>
                </tr>
              ))}
              {!rows.length && <tr><td style={s.td} colSpan={6}>Nenhuma justificativa.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ───────── listas simples (modelos, motivos) ─────────
function Lista({ API, url, cols }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { API.get(url).then(r => setRows(r.data)).catch(() => {}); }, [API, url]);
  return (
    <div style={s.card}>
      <div style={s.cardT}>{rows.length} itens (padrão do sistema — editáveis pelo RH na v2.0)</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={s.tbl}>
          <thead><tr>{cols.map(c => <th key={c[0]} style={s.th}>{c[1]}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i} style={{ borderTop: '1px solid #eee' }}>
                {cols.map(c => <td key={c[0]} style={s.td}>{c[2] ? c[2](r[c[0]]) : (r[c[0]] ?? '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────── Configurações (Geral / Web / Mobile / Inconsistências) ─────────
function Configuracoes({ API, podeAutorizar }) {
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/pontorep/config').then(r => setRows(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const salvar = (chave, valor) => API.put('/pontorep/config/' + chave, { valor }).then(() => { setMsg('✅ ' + chave); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  const GRUPOS = { geral: '⚙️ Geral', web: '🌐 Registro Web', mobile: '📱 Registro Mobile', inconsistencia: '🚨 Inconsistências (alertas da apuração)' };
  const porGrupo = g => rows.filter(r => r.grupo === g);
  return (
    <div>
      <div style={{ ...s.msg, background: '#eff6ff', color: '#1e40af', marginBottom: 12 }}>As <b>Inconsistências</b> ligadas aqui viram alertas automáticos na apuração de cada dia (aparecem na Apropriação).</div>
      {Object.keys(GRUPOS).map(g => (
        <div key={g} style={s.card}>
          <div style={s.cardT}>{GRUPOS[g]}</div>
          {porGrupo(g).map(r => (
            <div key={r.chave} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
              <div style={{ flex: 1, fontSize: 13 }}>{r.label}<div style={s.leg}>{r.chave}</div></div>
              {r.tipo === 'bool'
                ? <input type="checkbox" checked={r.valor === '1'} disabled={!podeAutorizar} onChange={e => salvar(r.chave, e.target.checked ? '1' : '0')} />
                : r.tipo === 'opcao'
                  ? <select style={{ ...s.inp, width: 150 }} value={r.valor} disabled={!podeAutorizar} onChange={e => salvar(r.chave, e.target.value)}><option value="qualquer">Qualquer</option><option value="autorizados">Só autorizados</option><option value="nao">Não permitir</option></select>
                  : <ConfigNum r={r} onSalvar={salvar} podeAutorizar={podeAutorizar} />}
            </div>
          ))}
        </div>
      ))}
      {msg && <div style={s.msg}>{msg}</div>}
    </div>
  );
}
function ConfigNum({ r, onSalvar, podeAutorizar }) {
  const [v, setV] = useState(r.valor);
  return <div style={{ display: 'flex', gap: 6 }}>
    <input type="number" style={{ ...s.inp, width: 90 }} value={v} disabled={!podeAutorizar} onChange={e => setV(e.target.value)} />
    {podeAutorizar && v !== r.valor && <button style={s.btnMini} onClick={() => onSalvar(r.chave, v)}>salvar</button>}
  </div>;
}

// ───────── parâmetros legais editáveis ─────────
function Parametros({ API }) {
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/pontorep/parametros').then(r => setRows(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const salvar = (chave, valor) => API.put('/pontorep/parametros/' + chave, { valor }).then(() => { setMsg('✅ ' + chave + ' atualizado'); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  return (
    <div style={s.card}>
      <div style={s.cardT}>Parâmetros legais (nada fixo no código — quando a lei/convenção mudar, ajuste aqui)</div>
      {msg && <div style={s.msg}>{msg}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={s.tbl}>
          <thead><tr>{['Parâmetro', 'Valor', 'Un.', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => <ParamLinha key={r.chave} r={r} onSalvar={salvar} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function ParamLinha({ r, onSalvar }) {
  const [v, setV] = useState(r.valor);
  return (
    <tr style={{ borderTop: '1px solid #eee' }}>
      <td style={s.td}>{r.descricao}<div style={s.leg}>{r.chave}</div></td>
      <td style={s.td}><input style={{ ...s.inp, width: 110 }} value={v} onChange={e => setV(e.target.value)} /></td>
      <td style={s.td}>{r.unidade}</td>
      <td style={s.td}>{v !== r.valor && <button style={s.btnMini} onClick={() => onSalvar(r.chave, v)}>salvar</button>}</td>
    </tr>
  );
}

// ───────── Bater ponto (kiosk) + apuração + espelho ─────────
function Batidas({ API }) {
  const [lojas, setLojas] = useState([]);
  const [colabs, setColabs] = useState([]);
  const [lojaId, setLojaId] = useState('');
  const [colabId, setColabId] = useState('');
  const [facialFalhou, setFacialFalhou] = useState(false);
  const [msg, setMsg] = useState('');
  const [ap, setAp] = useState({ dataIni: new Date().toISOString().slice(0, 10), dataFim: new Date().toISOString().slice(0, 10) });
  const [esp, setEsp] = useState(null);
  const [espColab, setEspColab] = useState('');
  useEffect(() => {
    API.get('/pontorep/lojas').then(r => setLojas(r.data)).catch(() => {});
    API.get('/pontorep/colaboradores').then(r => setColabs(r.data)).catch(() => {});
  }, [API]);
  const bater = () => {
    if (!lojaId || !colabId) return setMsg('⚠️ Escolha loja e colaborador.');
    API.post('/pontorep/bater', { colaboradorId: colabId, lojaId, tipoIdent: 'P', origem: 'W', facialOk: !facialFalhou })
      .then(r => setMsg(`🟢 Ponto registrado! NSR ${r.data.nsr} às ${r.data.dh.slice(11, 16)} (hash ${r.data.hash}).${r.data.pendente ? ' ⚠️ Marcado como PENDENTE (vai pra revisão do RH).' : ' Batida imutável.'}`))
      .catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  };
  const apurar = () => API.post('/pontorep/apurar', ap).then(r => setMsg(`✅ Apuração concluída: ${r.data.colaboradores} colaboradores, ${r.data.diasApurados} dias.`)).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  const verEspelho = () => { if (!espColab) return; API.get(`/pontorep/espelho?colaborador=${espColab}&ini=${ap.dataIni}&fim=${ap.dataFim}`).then(r => setEsp(r.data)).catch(() => {}); };
  const imprimir = () => { if (esp) printFolha(esp); };
  const h = m => `${Math.floor((m || 0) / 60)}h${String(Math.abs(m || 0) % 60).padStart(2, '0')}`;
  const ST = { ok: '#15803d', extra: '#b45309', atraso: '#b91c1c', falta: '#7f1d1d', incompleto: '#b45309', folga: '#6b7280' };

  return (
    <div>
      {/* KIOSK */}
      <div style={{ ...s.card, textAlign: 'center' }}>
        <div style={s.cardT}>Registrar ponto (kiosk)</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <select style={{ ...s.inp, maxWidth: 220 }} value={lojaId} onChange={e => setLojaId(e.target.value)}>
            <option value="">— loja —</option>{lojas.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select style={{ ...s.inp, maxWidth: 260 }} value={colabId} onChange={e => setColabId(e.target.value)}>
            <option value="">— colaborador —</option>{colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <button style={{ ...s.btnP, fontSize: 18, padding: '16px 40px' }} onClick={bater}>🟢 BATER PONTO</button>
        <label style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          <input type="checkbox" checked={facialFalhou} onChange={e => setFacialFalhou(e.target.checked)} /> simular falha no reconhecimento facial (teste)
        </label>
        {msg && <div style={s.msg}>{msg}</div>}
        <div style={{ ...s.leg, marginTop: 8 }}>Cada batida grava NSR sequencial + hash encadeado e é <b>imutável</b> (Portaria 671). Correções nunca alteram a original — viram camada por cima.</div>
      </div>

      {/* APURAÇÃO + ESPELHO */}
      <div style={s.card}>
        <div style={s.cardT}>Apurar (batida × escala prevista)</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={s.lab}>De<input type="date" style={s.inp} value={ap.dataIni} onChange={e => setAp({ ...ap, dataIni: e.target.value })} /></label>
          <label style={s.lab}>Até<input type="date" style={s.inp} value={ap.dataFim} onChange={e => setAp({ ...ap, dataFim: e.target.value })} /></label>
          <button style={s.btnP} onClick={apurar}>Apurar período</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
          <label style={s.lab}>Espelho de<select style={{ ...s.inp, maxWidth: 260 }} value={espColab} onChange={e => setEspColab(e.target.value)}>
            <option value="">— colaborador —</option>{colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select></label>
          <button style={s.btn} onClick={verEspelho}>Ver espelho</button>
        </div>
      </div>

      {esp && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={s.cardT}>Espelho de ponto</div>
            <button style={s.btnMini} onClick={imprimir}>🖨️ Imprimir / PDF</button>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8, fontSize: 13 }}>
            <span>Previsto: <b>{h(esp.totais.prev)}</b></span><span>Trabalhado: <b>{h(esp.totais.trab)}</b></span>
            <span>Atrasos: <b style={{ color: '#b91c1c' }}>{h(esp.totais.atraso)}</b></span><span>Extras: <b style={{ color: '#b45309' }}>{h(esp.totais.extra)}</b></span>
            <span>Saldo (banco): <b style={{ color: esp.totais.saldo < 0 ? '#b91c1c' : '#15803d' }}>{esp.totais.saldo < 0 ? '-' : '+'}{h(esp.totais.saldo)}</b></span>
            <span>Faltas: <b>{esp.totais.faltas}</b></span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tbl}>
              <thead><tr>{['Data', 'Batidas', 'Previsto', 'Trabalhado', 'Atraso', 'Extra', 'Saldo', 'Status'].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
              <tbody>
                {esp.dias.map(d => (
                  <tr key={d.data} style={{ borderTop: '1px solid #eee' }}>
                    <td style={s.td}>{d.data}</td><td style={s.td}>{d.batidas_horas || '—'}</td>
                    <td style={s.td}>{d.folga ? '🌴' : h(d.previsto_min)}</td><td style={s.td}>{h(d.trabalhado_min)}</td>
                    <td style={s.td}>{d.atraso_min ? h(d.atraso_min) : '—'}</td><td style={s.td}>{d.extra_min ? h(d.extra_min) : '—'}</td>
                    <td style={{ ...s.td, color: d.saldo_min < 0 ? '#b91c1c' : '#15803d' }}>{d.saldo_min ? (d.saldo_min < 0 ? '-' : '+') + h(d.saldo_min) : '—'}</td>
                    <td style={s.td}><span style={{ ...s.pill, background: ST[d.status] || '#999' }}>{d.status}</span></td>
                  </tr>
                ))}
                {!esp.dias.length && <tr><td style={s.td} colSpan={8}>Sem apuração no período (rode "Apurar período").</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────── Banco de horas (FIFO, com vencimento) ─────────
function BancoHoras({ API }) {
  const [colabs, setColabs] = useState([]);
  const [cid, setCid] = useState('');
  const [d, setD] = useState(null);
  useEffect(() => { API.get('/pontorep/colaboradores').then(r => setColabs(r.data)).catch(() => {}); }, [API]);
  useEffect(() => { if (cid) API.get('/pontorep/banco?colaborador=' + cid).then(r => setD(r.data)).catch(() => {}); else setD(null); }, [API, cid]);
  const hm = m => `${m < 0 ? '-' : ''}${Math.floor(Math.abs(m || 0) / 60)}h${String(Math.abs(m || 0) % 60).padStart(2, '0')}`;
  return (
    <div>
      <div style={s.card}>
        <label style={s.lab}>Colaborador<select style={{ ...s.inp, maxWidth: 320 }} value={cid} onChange={e => setCid(e.target.value)}><option value="">—</option>{colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      </div>
      {d && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 14 }}>
          <div style={{ ...s.card, textAlign: 'center' }}><div style={s.leg}>Saldo atual</div><div style={{ fontSize: 24, fontWeight: 700, color: d.saldoAtual < 0 ? '#b91c1c' : '#15803d' }}>{hm(d.saldoAtual)}</div></div>
          <div style={{ ...s.card, textAlign: 'center' }}><div style={s.leg}>Validade dos lotes</div><div style={{ fontSize: 24, fontWeight: 700 }}>{d.validade}<span style={{ fontSize: 13 }}> meses</span></div></div>
          <div style={{ ...s.card, textAlign: 'center' }}><div style={s.leg}>Vencido (vira HE a pagar)</div><div style={{ fontSize: 24, fontWeight: 700, color: d.vencidoTotal ? '#b45309' : '#111' }}>{hm(d.vencidoTotal)}</div></div>
        </div>
        <div style={{ ...s.msg, background: '#f8fafc' }}>Acréscimo ao creditar: útil {d.acrescimos?.util || 0}% · sáb {d.acrescimos?.sabado || 0}% · dom {d.acrescimos?.domingo || 0}% · feriado {d.acrescimos?.feriado || 0}%{d.limiteMensal ? ` · teto mensal ${hm(d.limiteMensal)}` : ''} (configurável na Regra de Ponto)</div>
        <div style={s.card}>
          <div style={s.cardT}>Lotes a vencer (FIFO — os mais antigos são consumidos/vencem primeiro)</div>
          <table style={s.tbl}><thead><tr>{['Competência do crédito', 'Restante', 'Vence em'].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>{d.aVencer.map((l, i) => <tr key={i} style={{ borderTop: '1px solid #eee' }}><td style={s.td}>{l.comp}</td><td style={s.td}>{hm(l.restante)}</td><td style={s.td}>{l.venc}</td></tr>)}
              {!d.aVencer.length && <tr><td style={s.td} colSpan={3}>Sem lotes de crédito a vencer.</td></tr>}</tbody></table>
        </div>
        <div style={s.card}>
          <div style={s.cardT}>Histórico mensal (saldo do mês)</div>
          <table style={s.tbl}><thead><tr>{['Mês', 'Saldo'].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>{d.historico.map((h, i) => <tr key={i} style={{ borderTop: '1px solid #eee' }}><td style={s.td}>{h.comp}</td><td style={{ ...s.td, color: h.saldo < 0 ? '#b91c1c' : '#15803d' }}>{hm(h.saldo)}</td></tr>)}
              {!d.historico.length && <tr><td style={s.td} colSpan={2}>Sem apuração ainda.</td></tr>}</tbody></table>
        </div>
      </>}
    </div>
  );
}

// ───────── Pontos suspeitos/pendentes: revisão do RH ─────────
function Pendentes({ API, podeAutorizar }) {
  const [rows, setRows] = useState([]);
  const [todas, setTodas] = useState(false);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/pontorep/pendentes' + (todas ? '?todas=1' : '')).then(r => setRows(r.data)).catch(() => {}), [API, todas]);
  useEffect(() => { carregar(); }, [carregar]);
  const revisar = (id, status) => {
    const motivo = status === 'rejeitada' ? (window.prompt('Motivo da rejeição:') || '') : '';
    API.post(`/pontorep/pendentes/${id}/revisar`, { status, motivo }).then(() => { setMsg(`✅ Batida ${status}.`); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  };
  const RS = { aprovada: '#15803d', rejeitada: '#b91c1c' };
  return (
    <div>
      <div style={{ ...s.msg, background: '#fef2f2', color: '#991b1b', marginBottom: 12 }}>Batidas registradas com <b>suspeita</b> (reconhecimento facial falhou, GPS desativado, fake GPS). A batida <b>entra assim mesmo</b> (Portaria 671 não deixa impedir), mas fica <b>pendente</b> para o RH revisar — a revisão não altera a batida original.</div>
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={s.cardT}>Pontos suspeitos ({rows.length})</div>
          <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={todas} onChange={e => setTodas(e.target.checked)} /> incluir já revisadas</label>
        </div>
        {msg && <div style={s.msg}>{msg}</div>}
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Colaborador', 'Loja', 'Data/hora', 'Suspeita', 'Revisão', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={s.td}>{r.colaborador_nome}</td><td style={s.td}>{r.loja_id || '—'}</td>
                  <td style={s.td}>{String(r.data_hora).slice(8, 10)}/{String(r.data_hora).slice(5, 7)} {String(r.data_hora).slice(11, 16)}</td>
                  <td style={{ ...s.td, color: '#b91c1c' }}>{r.motivo_pendencia || '—'}</td>
                  <td style={s.td}>{r.revisao_status ? <span style={{ ...s.pill, background: RS[r.revisao_status] || '#999' }}>{r.revisao_status}</span> : <span style={s.leg}>pendente</span>}</td>
                  <td style={s.td}>{podeAutorizar && !r.revisao_status && <><button style={s.btnMini} onClick={() => revisar(r.id, 'aprovada')}>aprovar</button>{' '}<button style={s.btnMini} onClick={() => revisar(r.id, 'rejeitada')}>rejeitar</button></>}</td>
                </tr>
              ))}
              {!rows.length && <tr><td style={s.td} colSpan={6}>Nenhuma batida suspeita 🎉</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ───────── Apropriação de Horas: RH ajusta correções (camada sobre a batida imutável) ─────────
function Apropriacao({ API, podeAutorizar }) {
  const [colabs, setColabs] = useState([]);
  const [cid, setCid] = useState('');
  const hoje = new Date().toISOString().slice(0, 10);
  const [per, setPer] = useState({ ini: hoje.slice(0, 8) + '01', fim: hoje });
  const [dias, setDias] = useState(null);
  const [edit, setEdit] = useState({}); // {data: {horarios, motivo}}
  const [msg, setMsg] = useState('');
  useEffect(() => { API.get('/pontorep/colaboradores').then(r => setColabs(r.data)).catch(() => {}); }, [API]);
  const carregar = () => { if (!cid) return; API.get(`/pontorep/apropriacao?colaborador=${cid}&ini=${per.ini}&fim=${per.fim}`).then(r => { setDias(r.data); setEdit({}); }).catch(() => {}); };
  const hm = m => `${Math.floor(Math.abs(m || 0) / 60)}h${String(Math.abs(m || 0) % 60).padStart(2, '0')}`;
  const setLinha = (data, k, v) => setEdit(p => ({ ...p, [data]: { ...(p[data] || {}), [k]: v } }));
  const salvar = (d) => {
    const e = edit[d.data] || {};
    const horarios = e.horarios != null ? e.horarios : d.horarios.join(' ');
    API.post('/pontorep/apropriacao/tratar', { colaboradorId: cid, data: d.data, horarios, motivo: e.motivo || '' })
      .then(() => { setMsg(`✅ ${d.data.split('-').reverse().join('/')} ajustado.`); carregar(); }).catch(er => setMsg('⚠️ ' + (er.response?.data?.erro || 'Erro')));
  };
  const limpar = (d) => API.delete(`/pontorep/apropriacao/tratar?colaborador=${cid}&data=${d.data}`).then(() => { setMsg('↩️ Voltou à batida original.'); carregar(); });
  const ST = { ok: '#15803d', extra: '#b45309', atraso: '#b91c1c', falta: '#7f1d1d', incompleto: '#b45309', folga: '#6b7280' };

  return (
    <div>
      <div style={{ ...s.msg, background: '#eef2ff', color: '#3730a3', marginBottom: 12 }}>O RH ajusta os horários por dia (ex.: bateu errado, esqueceu). A <b>batida original é imutável</b> — o ajuste vira uma <b>camada de tratamento</b> por cima e re-apura o dia na hora. Dias tratados saem com <b>(m)</b> na folha.</div>
      <div style={s.card}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={s.lab}>Colaborador<select style={{ ...s.inp, minWidth: 220 }} value={cid} onChange={e => setCid(e.target.value)}><option value="">—</option>{colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          <label style={s.lab}>De<input type="date" style={s.inp} value={per.ini} onChange={e => setPer({ ...per, ini: e.target.value })} /></label>
          <label style={s.lab}>Até<input type="date" style={s.inp} value={per.fim} onChange={e => setPer({ ...per, fim: e.target.value })} /></label>
          <button style={s.btnP} onClick={carregar}>Consultar</button>
        </div>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>

      {dias && (
        <div style={s.card}>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tbl}>
              <thead><tr>{['Dia', 'Original', 'Horários (efetivos)', 'Motivo', 'Trab.', 'Prev.', 'Saldo', 'Status', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
              <tbody>
                {dias.map(d => {
                  const e = edit[d.data] || {};
                  const val = e.horarios != null ? e.horarios : d.horarios.join(' ');
                  return (
                    <tr key={d.data} style={{ borderTop: '1px solid #eee', background: d.manual ? '#fffbeb' : d.folga ? '#f8fafc' : '#fff' }}>
                      <td style={s.td}>{d.data.slice(8, 10)}/{d.data.slice(5, 7)}{d.manual ? ' (m)' : ''}</td>
                      <td style={{ ...s.td, color: '#94a3b8' }}>{d.originais.join(' ') || (d.folga ? '🌴' : '—')}</td>
                      <td style={s.td}>{podeAutorizar ? <input style={{ ...s.inp, width: 160 }} value={val} placeholder="08:00 12:00 13:00 17:00" onChange={ev => setLinha(d.data, 'horarios', ev.target.value)} /> : (d.horarios.join(' ') || '—')}</td>
                      <td style={s.td}>{podeAutorizar ? <input style={{ ...s.inp, width: 140 }} value={e.motivo ?? d.motivo} placeholder="motivo" onChange={ev => setLinha(d.data, 'motivo', ev.target.value)} /> : d.motivo}</td>
                      <td style={s.td}>{hm(d.trabalhado_min)}</td><td style={s.td}>{d.folga ? '🌴' : hm(d.previsto_min)}</td>
                      <td style={{ ...s.td, color: d.saldo_min < 0 ? '#b91c1c' : '#15803d' }}>{d.saldo_min ? (d.saldo_min < 0 ? '-' : '+') + hm(d.saldo_min) : '—'}</td>
                      <td style={s.td}><span style={{ ...s.pill, background: ST[d.status] || '#999' }}>{d.status || '—'}</span>
                        {(d.inconsistencias || []).length > 0 && <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 2 }} title={d.inconsistencias.join(' · ')}>⚠️ {d.inconsistencias.join(' · ')}</div>}</td>
                      <td style={s.td}>{podeAutorizar && <>
                        <button style={s.btnMini} onClick={() => salvar(d)}>salvar</button>{' '}
                        {d.manual && <button style={s.btnMini} onClick={() => limpar(d)}>↩️</button>}
                      </>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ ...s.leg, marginTop: 8 }}>Digite os horários do dia separados por espaço (pares entrada/saída). Ex.: <b>08:00 12:00 13:00 17:00</b>. Salvar re-apura o dia na hora.</div>
        </div>
      )}
    </div>
  );
}

// ───────── Escala Inteligente: dimensionamento + pico de vendas do ERP ─────────
function Inteligente({ API }) {
  const [lojas, setLojas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [f, setF] = useState({ lojaId: '', modeloId: '', dataIni: '', dataFim: '', entrada: '08:00', saida: '16:20', intervalo: 60 });
  const [sug, setSug] = useState(null);
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    API.get('/pontorep/lojas').then(r => setLojas(r.data)).catch(() => {});
    API.get('/pontorep/modelos').then(r => setModelos(r.data)).catch(() => {});
  }, [API]);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const gerar = () => {
    setMsg(''); setSug(null); setCarregando(true);
    API.post('/pontorep/inteligente/sugerir', f).then(r => setSug(r.data)).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro'))).finally(() => setCarregando(false));
  };
  const aplicar = () => {
    if (!sug) return;
    if (!window.confirm(`Criar a escala de ${sug.sugestoes.length} colaboradores? As que ferirem a lei ficam aguardando autorização do RH.`)) return;
    API.post('/pontorep/inteligente/aplicar', { ...f, colaboradorIds: sug.sugestoes.map(s => s.colaboradorId) })
      .then(r => setMsg(`✅ ${r.data.criadas}/${r.data.total} escalas criadas${r.data.resultados.filter(x => x.precisaAutorizacao).length ? ` — ${r.data.resultados.filter(x => x.precisaAutorizacao).length} aguardam RH` : ''}.`))
      .catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  };
  const maxV = sug && sug.picos.horas.length ? Math.max(...sug.picos.horas.map(h => h.vendas)) : 1;

  return (
    <div>
      <div style={{ ...s.msg, background: '#eef2ff', color: '#3730a3', marginBottom: 12 }}>Diga a <b>loja</b>, o <b>modelo</b> e o <b>período</b>: o sistema sugere a escala de toda a equipe (folgas espalhadas), cruza com a <b>necessidade cadastrada</b> e o <b>pico de vendas do ERP</b>, e aponta os <b>gargalos</b>. Depois é só <b>Aplicar</b> — o que ferir a lei vai pra autorização do RH.</div>
      <div style={s.card}>
        <div style={s.grid}>
          <label style={s.lab}>Loja
            <select style={s.inp} value={f.lojaId} onChange={e => set('lojaId', e.target.value)}>
              <option value="">— selecione —</option>{lojas.map(l => <option key={l} value={l}>{l}</option>)}
            </select></label>
          <label style={s.lab}>Modelo
            <select style={s.inp} value={f.modeloId} onChange={e => set('modeloId', e.target.value)}>
              <option value="">— selecione —</option>{modelos.map(m => <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>)}
            </select></label>
          <label style={s.lab}>Início<input type="date" style={s.inp} value={f.dataIni} onChange={e => set('dataIni', e.target.value)} /></label>
          <label style={s.lab}>Fim<input type="date" style={s.inp} value={f.dataFim} onChange={e => set('dataFim', e.target.value)} /></label>
          <label style={s.lab}>Entrada<input type="time" style={s.inp} value={f.entrada} onChange={e => set('entrada', e.target.value)} /></label>
          <label style={s.lab}>Saída<input type="time" style={s.inp} value={f.saida} onChange={e => set('saida', e.target.value)} /></label>
          <label style={s.lab}>Intervalo (min)<input type="number" style={s.inp} value={f.intervalo} onChange={e => set('intervalo', e.target.value)} /></label>
        </div>
        <button style={{ ...s.btnP, marginTop: 10 }} onClick={gerar} disabled={carregando}>{carregando ? 'Analisando…' : '✨ Gerar sugestão'}</button>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>

      {sug && <>
        {/* gargalos */}
        <div style={s.card}>
          <div style={s.cardT}>Gargalos ({sug.gargalos.length}) — {sug.colaboradores} colaboradores na loja</div>
          {!sug.gargalos.length ? <div style={{ ...s.alerta, background: '#dcfce7', color: '#15803d' }}>✅ Dimensionamento ok para o período.</div>
            : sug.gargalos.map((g, i) => (
              <div key={i} style={{ ...s.alerta, background: NIVEL[g.nivel]?.bg || '#fef3c7', color: NIVEL[g.nivel]?.cor || '#b45309' }}>
                {g.tipo === 'pico' ? '📈 ' : g.tipo === 'cobertura' ? '⚠️ ' : '•️ '}{g.msg}
              </div>
            ))}
        </div>

        {/* pico de vendas */}
        {sug.picos.horas.length > 0 && (
          <div style={s.card}>
            <div style={s.cardT}>📈 Pico de vendas por hora (últimos 90 dias · média {sug.picos.media}/h)</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120, overflowX: 'auto', paddingTop: 8 }}>
              {sug.picos.horas.map(h => (
                <div key={h.hora} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 26 }}>
                  <div title={`${h.vendas} vendas`} style={{ width: 18, height: Math.max(3, h.vendas / maxV * 90), background: h.pico ? '#dc2626' : '#93c5fd', borderRadius: 3 }} />
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{h.hora}</div>
                </div>
              ))}
            </div>
            <div style={s.leg}>Barras vermelhas = horário de pico (30%+ acima da média) — priorize equipe nessas faixas.</div>
          </div>
        )}

        {/* cobertura por dia */}
        <div style={s.card}>
          <div style={s.cardT}>Cobertura sugerida por dia</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tbl}>
              <thead><tr>{['Data', 'Na escala', 'Necessário', 'Saldo'].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
              <tbody>
                {sug.cobertura.map(c => (
                  <tr key={c.data} style={{ borderTop: '1px solid #eee', background: c.necessario > 0 && c.gap < 0 ? '#fef2f2' : '#fff' }}>
                    <td style={s.td}>{c.data}</td><td style={s.td}>{c.trabalhando}</td>
                    <td style={s.td}>{c.necessario || '—'}</td>
                    <td style={{ ...s.td, color: c.gap < 0 ? '#b91c1c' : '#15803d', fontWeight: 600 }}>{c.necessario ? (c.gap >= 0 ? '+' + c.gap : c.gap) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <button style={s.btnP} onClick={aplicar}>Aplicar sugestão ({sug.sugestoes.length} colaboradores)</button>
      </>}
    </div>
  );
}

// ───────── Regras de Ponto (N regras, padrão, colaboradores em lote) ─────────
function RegrasPonto({ API, podeAutorizar }) {
  const [regras, setRegras] = useState([]);
  const [ed, setEd] = useState(null);       // regra em edição
  const [colabView, setColabView] = useState(null); // {regra, lista}
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/pontorep/regras').then(r => setRegras(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const nova = () => setEd({ nome: '', descricao: '', padrao: 0, tipo_controle: 'banco', controle_atraso: 'flexivel', tolerancia_min: 10, dia_fechamento: 25, noturno_ini: '22:00', noturno_fim: '05:00', noturno_estendida: 0, he: { tipo1_pct: 50, tipo2_pct: 100, tipo3_pct: 0, tipo4_pct: 0 }, banco: { validade_meses: 12, descontar_faltas: 1 } });
  const editar = id => API.get('/pontorep/regra/' + id).then(r => setEd(r.data)).catch(() => {});
  const salvar = () => API.post('/pontorep/regra', ed).then(() => { setMsg('✅ Regra salva'); setEd(null); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  const remover = id => { if (window.confirm('Remover regra?')) API.delete('/pontorep/regra/' + id).then(carregar).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro'))); };
  const padrao = id => API.post(`/pontorep/regra/${id}/padrao`).then(carregar);
  const abrirColabs = rg => API.get(`/pontorep/regra/${rg.id}/colaboradores`).then(r => setColabView({ regra: rg, lista: r.data })).catch(() => {});

  if (colabView) return <RegraColaboradores API={API} regra={colabView.regra} lista={colabView.lista} podeAutorizar={podeAutorizar} onClose={() => { setColabView(null); carregar(); }} onReload={() => abrirColabs(colabView.regra)} />;

  if (ed) {
    const setE = (k, v) => setEd(p => ({ ...p, [k]: v }));
    const setHE = (k, v) => setEd(p => ({ ...p, he: { ...p.he, [k]: v } }));
    const setBanco = (k, v) => setEd(p => ({ ...p, banco: { ...p.banco, [k]: v } }));
    return (
      <div style={s.card}>
        <div style={s.cardT}>{ed.id ? 'Editar regra' : 'Nova regra de ponto'}</div>
        <div style={s.grid}>
          <label style={{ ...s.lab, gridColumn: '1 / -1' }}>Descrição (nome)<input style={s.inp} value={ed.nome} onChange={e => setE('nome', e.target.value)} placeholder="Ex.: Regra MUTTI/VENDEDOR" /></label>
          <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={!!ed.padrao} onChange={e => setE('padrao', e.target.checked ? 1 : 0)} /> Regra padrão</label>
          <label style={s.lab}>Tipo de controle
            <select style={s.inp} value={ed.tipo_controle} onChange={e => setE('tipo_controle', e.target.value)}><option value="banco">Banco de horas</option><option value="extra">Hora extra</option></select></label>
          <label style={s.lab}>Controle de atrasos
            <select style={s.inp} value={ed.controle_atraso} onChange={e => setE('controle_atraso', e.target.value)}><option value="flexivel">Horário flexível</option><option value="rigido">Horário rígido</option></select></label>
          <label style={s.lab}>Tolerância (min)<input type="number" style={s.inp} value={ed.tolerancia_min} onChange={e => setE('tolerancia_min', e.target.value)} /></label>
          <label style={s.lab}>Dia do fechamento<input type="number" style={s.inp} value={ed.dia_fechamento} onChange={e => setE('dia_fechamento', e.target.value)} /></label>
          <label style={s.lab}>Início noturno<input type="time" style={s.inp} value={ed.noturno_ini} onChange={e => setE('noturno_ini', e.target.value)} /></label>
          <label style={s.lab}>Fim noturno<input type="time" style={s.inp} value={ed.noturno_fim} onChange={e => setE('noturno_fim', e.target.value)} /></label>
        </div>
        <div style={{ ...s.cardT, marginTop: 12, fontSize: 13 }}>Horas extras — percentuais por tipo</div>
        <div style={s.grid}>
          {[['tipo1_pct', 'Tipo 1 (%)'], ['tipo2_pct', 'Tipo 2 (%)'], ['tipo3_pct', 'Tipo 3 (%)'], ['tipo4_pct', 'Tipo 4 (%)']].map(([k, l]) => (
            <label key={k} style={s.lab}>{l}<input type="number" style={s.inp} value={ed.he?.[k] ?? ''} onChange={e => setHE(k, Number(e.target.value))} /></label>
          ))}
        </div>
        <div style={{ ...s.cardT, marginTop: 12, fontSize: 13 }}>Fases de hora extra (duração de cada faixa + tipo de hora aplicado)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Dia', '1ª fase (dur / tipo)', '2ª fase (dur / tipo)', 'Excedente (tipo)'].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {[['util', 'Dias úteis'], ['sabado', 'Sábados'], ['domingo', 'Domingos'], ['feriado', 'Feriados']].map(([dk, dl]) => {
                const fs = (ed.he?.fases || {})[dk] || {};
                const setFase = (fase, campo, v) => setEd(p => { const he = { ...(p.he || {}) }; const fases = { ...(he.fases || {}) }; const dia = { ...(fases[dk] || {}) }; dia[fase] = { ...(dia[fase] || {}), [campo]: v }; fases[dk] = dia; he.fases = fases; return { ...p, he }; });
                const tipoSel = (fase) => <select style={{ ...s.inp, width: 70 }} value={(fs[fase] || {}).tipo || 1} onChange={e => setFase(fase, 'tipo', Number(e.target.value))}>{[1, 2, 3, 4].map(t => <option key={t} value={t}>{t}</option>)}</select>;
                const durInp = (fase) => <input type="time" style={{ ...s.inp, width: 90 }} value={(fs[fase] || {}).dur || ''} onChange={e => setFase(fase, 'dur', e.target.value)} />;
                return (
                  <tr key={dk} style={{ borderTop: '1px solid #eee' }}>
                    <td style={s.td}>{dl}</td>
                    <td style={s.td}><div style={{ display: 'flex', gap: 4 }}>{durInp('f1')}{tipoSel('f1')}</div></td>
                    <td style={s.td}><div style={{ display: 'flex', gap: 4 }}>{durInp('f2')}{tipoSel('f2')}</div></td>
                    <td style={s.td}>{tipoSel('exc')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={s.leg}>Ex.: 1ª fase 01:00 no Tipo 1 (50%), 2ª fase 00:00 no Tipo 2 (100%), excedente Tipo 3. Os % de cada tipo vêm da tabela acima.</div>
        <div style={{ ...s.cardT, marginTop: 12, fontSize: 13 }}>Banco de horas</div>
        <div style={s.grid}>
          <label style={s.lab}>Validade (meses)<input type="number" style={s.inp} value={ed.banco?.validade_meses ?? ''} onChange={e => setBanco('validade_meses', Number(e.target.value))} /></label>
          <label style={s.lab}>Teto mensal de crédito (min)<input type="number" style={s.inp} value={ed.banco?.limite_mensal_min ?? ''} placeholder="0 = sem teto" onChange={e => setBanco('limite_mensal_min', Number(e.target.value))} /></label>
          <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={!!ed.banco?.descontar_faltas} onChange={e => setBanco('descontar_faltas', e.target.checked ? 1 : 0)} /> Descontar faltas no banco</label>
        </div>
        <div style={{ ...s.leg, margin: '6px 0' }}>Acréscimo % ao creditar hora no banco, por tipo de dia:</div>
        <div style={s.grid}>
          {[['acr_util', 'Dias úteis (%)'], ['acr_sabado', 'Sábados (%)'], ['acr_domingo', 'Domingos (%)'], ['acr_feriado', 'Feriados (%)']].map(([k, l]) => (
            <label key={k} style={s.lab}>{l}<input type="number" style={s.inp} value={ed.banco?.[k] ?? ''} placeholder="0" onChange={e => setBanco(k, Number(e.target.value))} /></label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button style={s.btnP} onClick={salvar}>Salvar</button>
          <button style={s.btn} onClick={() => setEd(null)}>Cancelar</button>
        </div>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={s.sub}>Cadastre <b>quantas regras precisar</b> (jornadas/sindicatos diferentes). Para manter o histórico, crie novas em vez de alterar as em uso.</div>
        {podeAutorizar && <button style={s.btnP} onClick={nova}>+ Nova regra</button>}
      </div>
      <div style={s.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Regra', 'Padrão', 'Controle', 'Tolerância', 'Colaboradores', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {regras.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={s.td}><b>{r.nome}</b>{r.descricao ? <div style={s.leg}>{r.descricao}</div> : null}</td>
                  <td style={s.td}>{r.padrao ? <span style={{ ...s.pill, background: '#0f766e' }}>padrão</span> : (podeAutorizar && <button style={s.btnMini} onClick={() => padrao(r.id)}>tornar padrão</button>)}</td>
                  <td style={s.td}>{r.tipo_controle === 'banco' ? 'Banco' : 'Hora extra'} · {r.controle_atraso === 'rigido' ? 'rígido' : 'flexível'}</td>
                  <td style={s.td}>{r.tolerancia_min}min</td>
                  <td style={s.td}><button style={s.btnMini} onClick={() => abrirColabs(r)}>👥 {r.colaboradores}</button></td>
                  <td style={s.td}>{podeAutorizar && <><button style={s.btnMini} onClick={() => editar(r.id)}>editar</button>{' '}<button style={s.btnMini} onClick={() => remover(r.id)}>remover</button></>}</td>
                </tr>
              ))}
              {!regras.length && <tr><td style={s.td} colSpan={6}>Nenhuma regra cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// colaboradores de uma regra — multi-seleção com vigência
function RegraColaboradores({ API, regra, lista, podeAutorizar, onClose, onReload }) {
  const [colabs, setColabs] = useState([]);
  const [sel, setSel] = useState([]);
  const [vig, setVig] = useState(new Date().toISOString().slice(0, 10));
  const [busca, setBusca] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { API.get('/pontorep/colaboradores').then(r => setColabs(r.data)).catch(() => {}); }, [API]);
  const adicionar = () => {
    if (!sel.length) return setMsg('⚠️ Selecione ao menos um colaborador.');
    API.post(`/pontorep/regra/${regra.id}/colaboradores`, { colaboradorIds: sel, vigenciaIni: vig })
      .then(r => { setMsg(`✅ ${r.data.adicionados} colaborador(es) vinculado(s).`); setSel([]); onReload(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  };
  const remover = id => API.delete('/pontorep/regra/colaborador/' + id).then(onReload);
  const filtrados = colabs.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={s.cardT}>Colaboradores · {regra.nome}</div>
        <button style={s.btnMini} onClick={onClose}>← voltar</button>
      </div>
      {podeAutorizar && (
        <div style={s.card}>
          <div style={s.cardT}>Adicionar colaboradores (vários de uma vez)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
            <label style={s.lab}>Vigência (início)<input type="date" style={s.inp} value={vig} onChange={e => setVig(e.target.value)} /></label>
            <input style={{ ...s.inp, flex: 1, minWidth: 160 }} placeholder="🔎 buscar colaborador…" value={busca} onChange={e => setBusca(e.target.value)} />
            <button style={s.btnP} onClick={adicionar}>Adicionar {sel.length ? `(${sel.length})` : ''}</button>
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
            {filtrados.map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={sel.includes(c.id)} onChange={e => setSel(p => e.target.checked ? [...p, c.id] : p.filter(x => x !== c.id))} />
                {c.nome} <span style={s.leg}>{c.loja_id || ''}</span>
              </label>
            ))}
          </div>
          {msg && <div style={s.msg}>{msg}</div>}
        </div>
      )}
      <div style={s.card}>
        <div style={s.cardT}>Vinculados ({lista.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Colaborador', 'Início', 'Fim', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {lista.map(l => (
                <tr key={l.id} style={{ borderTop: '1px solid #eee', background: l.vigencia_fim ? '#f8fafc' : '#fff' }}>
                  <td style={s.td}>{l.colaborador_nome}</td><td style={s.td}>{l.vigencia_ini}</td>
                  <td style={s.td}>{l.vigencia_fim || <b style={{ color: '#15803d' }}>Regra vigente</b>}</td>
                  <td style={s.td}>{podeAutorizar && <button style={s.btnMini} onClick={() => remover(l.id)}>✕</button>}</td>
                </tr>
              ))}
              {!lista.length && <tr><td style={s.td} colSpan={4}>Nenhum colaborador vinculado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ───────── Colaborador: travar HE + regra de ponto com vigência versionada ─────────
function ColaboradorCfg({ API, podeAutorizar }) {
  const [colabs, setColabs] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [cid, setCid] = useState('');
  const [cfg, setCfg] = useState(null);
  const [regras, setRegras] = useState([]);
  const [nova, setNova] = useState({ modeloId: '', vigenciaIni: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    API.get('/pontorep/colaboradores').then(r => setColabs(r.data)).catch(() => {});
    API.get('/pontorep/modelos').then(r => setModelos(r.data)).catch(() => {});
  }, [API]);
  const carregar = useCallback((id) => {
    if (!id) { setCfg(null); setRegras([]); return; }
    API.get(`/pontorep/colaborador/${id}/config`).then(r => setCfg(r.data)).catch(() => {});
    API.get(`/pontorep/colaborador/${id}/regras`).then(r => setRegras(r.data)).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(cid); }, [cid, carregar]);

  const salvarCfg = () => API.put(`/pontorep/colaborador/${cid}/config`, cfg).then(() => setMsg('✅ Configuração salva')).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  const trocarRegra = () => {
    if (!nova.modeloId || !nova.vigenciaIni) return setMsg('⚠️ Escolha a regra e a data de início da vigência.');
    API.post(`/pontorep/colaborador/${cid}/regras`, nova).then(() => { setMsg('✅ Nova regra registrada — passa a valer a partir da vigência; a anterior fica no histórico.'); setNova({ modeloId: '', vigenciaIni: '' }); carregar(cid); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  };
  const remover = id => { if (window.confirm('Remover esta linha do histórico?')) API.delete('/pontorep/colaborador/regras/' + id).then(() => carregar(cid)); };

  return (
    <div>
      <div style={s.card}>
        <label style={s.lab}>Colaborador
          <select style={{ ...s.inp, maxWidth: 360 }} value={cid} onChange={e => { setCid(e.target.value); setMsg(''); }}>
            <option value="">— selecione —</option>
            {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select></label>
      </div>

      {cid && cfg && <>
        <div style={s.card}>
          <div style={s.cardT}>Hora extra</div>
          <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={!!cfg.bloqueia_he} onChange={e => setCfg({ ...cfg, bloqueia_he: e.target.checked ? 1 : 0 })} disabled={!podeAutorizar} />
            <b>Travar hora extra</b> — este colaborador não pode fazer HE (a escala/apuração alertam “encerrar o ponto”).
          </label>
          <label style={{ ...s.lab, marginTop: 8 }}>Tolerância p/ alertar “encerrar o ponto” (min além da jornada)
            <input type="number" style={{ ...s.inp, maxWidth: 160 }} value={cfg.tol_encerrar_min ?? ''} placeholder="padrão: 10" onChange={e => setCfg({ ...cfg, tol_encerrar_min: e.target.value })} disabled={!podeAutorizar} />
          </label>
          {podeAutorizar
            ? <button style={{ ...s.btnP, marginTop: 10 }} onClick={salvarCfg}>Salvar</button>
            : <div style={s.leg}>Só um superior do RH pode alterar.</div>}
        </div>

        <div style={s.card}>
          <div style={s.cardT}>Regra de ponto (histórico por vigência)</div>
          <div style={{ ...s.leg, marginBottom: 8 }}>Trocar a regra <b>não apaga</b> a anterior: ela é encerrada no dia anterior à nova vigência e fica no histórico. Cada mês usa a regra que valia na época.</div>
          {podeAutorizar && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
              <label style={s.lab}>Regra de ponto
                <select style={s.inp} value={nova.modeloId} onChange={e => setNova({ ...nova, modeloId: e.target.value })}>
                  <option value="">— selecione —</option>
                  {modelos.map(m => <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>)}
                </select></label>
              <label style={s.lab}>Início da vigência<input type="date" style={s.inp} value={nova.vigenciaIni} onChange={e => setNova({ ...nova, vigenciaIni: e.target.value })} /></label>
              <button style={s.btnP} onClick={trocarRegra}>Adicionar</button>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tbl}>
              <thead><tr>{['Regra de ponto', 'Início de vigência', 'Fim', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
              <tbody>
                {regras.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid #eee', background: r.vigencia_fim ? '#f8fafc' : '#ecfdf5' }}>
                    <td style={s.td}>{r.modelo_codigo} — {r.modelo_nome}</td>
                    <td style={s.td}>{r.vigencia_ini}</td>
                    <td style={s.td}>{r.vigencia_fim || <b style={{ color: '#15803d' }}>vigente</b>}</td>
                    <td style={s.td}>{podeAutorizar && <button style={s.btnMini} onClick={() => remover(r.id)}>remover</button>}</td>
                  </tr>
                ))}
                {!regras.length && <tr><td style={s.td} colSpan={4}>Nenhuma regra registrada ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        {msg && <div style={s.msg}>{msg}</div>}
      </>}
    </div>
  );
}

// ───────── Fechamento: config + fechar competência + espelhos + correções ─────────
function Fechamento({ API, podeAutorizar }) {
  const [cfg, setCfg] = useState(null);
  const [fechs, setFechs] = useState([]);
  const [comp, setComp] = useState(new Date().toISOString().slice(0, 7));
  const [espelhos, setEspelhos] = useState(null);
  const [correcoes, setCorrecoes] = useState([]);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    API.get('/pontorep/fechamento/config').then(r => setCfg(r.data)).catch(() => {});
    API.get('/pontorep/fechamentos').then(r => setFechs(r.data)).catch(() => {});
    API.get('/pontorep/correcoes?status=pendente').then(r => setCorrecoes(r.data)).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  const salvarCfg = () => API.put('/pontorep/fechamento/config', cfg).then(() => setMsg('✅ Regra de fechamento salva')).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  const fechar = () => { if (window.confirm(`Fechar a competência ${comp}? Isso trava as correções e gera os espelhos.`)) API.post(`/pontorep/fechamento/${comp}/fechar`).then(r => { setMsg(`🔒 Competência ${comp} fechada — ${r.data.espelhos} espelhos gerados.`); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro'))); };
  const reabrir = c => { if (window.confirm(`Reabrir ${c}?`)) API.post(`/pontorep/fechamento/${c}/reabrir`).then(() => { setMsg(`🔓 ${c} reaberta`); carregar(); }); };
  const verEspelhos = c => API.get('/pontorep/espelhos/' + c).then(r => setEspelhos({ comp: c, lista: r.data })).catch(() => {});
  const enviar = c => API.post(`/pontorep/espelhos/${c}/enviar`).then(() => { setMsg('📤 Espelhos enviados para assinatura'); verEspelhos(c); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  const responder = (id, status) => API.post(`/pontorep/correcao/${id}/responder`, { status }).then(carregar);

  if (!cfg) return <div style={s.card}>Carregando…</div>;
  const ESP = { gerado: '#6b7280', enviado: '#1d4ed8', assinado: '#15803d', contestado: '#b91c1c' };
  return (
    <div>
      <div style={s.card}>
        <div style={s.cardT}>Regra de fechamento</div>
        <div style={s.grid}>
          <label style={s.lab}>Dia do fechamento<input type="number" min="1" max="31" style={s.inp} value={cfg.dia_fechamento} onChange={e => setCfg({ ...cfg, dia_fechamento: e.target.value })} disabled={!podeAutorizar} /></label>
          <label style={s.lab}>Prazo p/ correção (dias após o ponto)<input type="number" min="0" style={s.inp} value={cfg.correcao_prazo_dias} onChange={e => setCfg({ ...cfg, correcao_prazo_dias: e.target.value })} disabled={!podeAutorizar} /></label>
          <label style={s.lab}>Hora limite<input type="time" style={s.inp} value={cfg.correcao_hora_limite} onChange={e => setCfg({ ...cfg, correcao_hora_limite: e.target.value })} disabled={!podeAutorizar} /></label>
        </div>
        <div style={{ ...s.leg, marginTop: 6 }}>Ex.: fechamento dia {cfg.dia_fechamento} · o ponto de um dia só pode ter correção pedida até <b>{cfg.correcao_prazo_dias} dia(s) depois</b> às <b>{cfg.correcao_hora_limite}</b>. Depois disso o sistema <b>trava</b> o pedido do colaborador.</div>
        {podeAutorizar && <button style={{ ...s.btnP, marginTop: 10 }} onClick={salvarCfg}>Salvar regra</button>}
      </div>

      <div style={s.card}>
        <div style={s.cardT}>Fechar competência</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={s.lab}>Competência<input type="month" style={s.inp} value={comp} onChange={e => setComp(e.target.value)} /></label>
          {podeAutorizar && <button style={s.btnP} onClick={fechar}>🔒 Fechar e gerar espelhos</button>}
        </div>
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={s.tbl}>
            <thead><tr>{['Competência', 'Status', 'Espelhos', 'Assinados', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {fechs.map(f => (
                <tr key={f.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={s.td}>{f.competencia}</td>
                  <td style={s.td}><span style={{ ...s.pill, background: f.status === 'fechado' ? '#0f766e' : '#6b7280' }}>{f.status}</span></td>
                  <td style={s.td}>{f.espelhos}</td><td style={s.td}>{f.assinados}</td>
                  <td style={s.td}>
                    <button style={s.btnMini} onClick={() => verEspelhos(f.competencia)}>espelhos</button>{' '}
                    {podeAutorizar && f.status === 'fechado' && <button style={s.btnMini} onClick={() => reabrir(f.competencia)}>reabrir</button>}
                  </td>
                </tr>
              ))}
              {!fechs.length && <tr><td style={s.td} colSpan={5}>Nenhuma competência fechada ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {espelhos && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={s.cardT}>Espelhos {espelhos.comp} ({espelhos.lista.length})</div>
            <div>{podeAutorizar && <button style={s.btnMini} onClick={() => enviar(espelhos.comp)}>📤 enviar p/ assinatura</button>}{' '}<button style={s.btnMini} onClick={() => setEspelhos(null)}>fechar ✕</button></div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tbl}>
              <thead><tr>{['Colaborador', 'Status', 'Enviado', 'Assinado'].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
              <tbody>
                {espelhos.lista.map(e => (
                  <tr key={e.id} style={{ borderTop: '1px solid #eee' }}>
                    <td style={s.td}>{e.colaborador_nome}</td>
                    <td style={s.td}><span style={{ ...s.pill, background: ESP[e.status] || '#999' }}>{e.status}</span></td>
                    <td style={s.td}>{e.enviado_em ? e.enviado_em.slice(0, 10) : '—'}</td>
                    <td style={s.td}>{e.assinado_em ? e.assinado_em.slice(0, 10) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={s.card}>
        <div style={s.cardT}>Correções pendentes ({correcoes.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Colaborador', 'Dia', 'Tipo', 'Descrição', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {correcoes.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={s.td}>{c.colaborador_nome}</td><td style={s.td}>{c.data_ref}</td>
                  <td style={s.td}>{c.tipo}</td><td style={s.td}>{c.descricao || '—'}{c.horario_sugerido ? ` (${c.horario_sugerido})` : ''}</td>
                  <td style={s.td}><button style={s.btnMini} onClick={() => responder(c.id, 'aprovada')}>aprovar</button>{' '}<button style={s.btnMini} onClick={() => responder(c.id, 'recusada')}>recusar</button></td>
                </tr>
              ))}
              {!correcoes.length && <tr><td style={s.td} colSpan={5}>Nenhuma correção pendente.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {msg && <div style={s.msg}>{msg}</div>}
    </div>
  );
}

// ───────── Acompanhamento: afastamentos + ranking de atestados ─────────
function Acompanhamento({ API, podeAutorizar }) {
  const [colabs, setColabs] = useState([]);
  const [motivos, setMotivos] = useState([]);
  const [dados, setDados] = useState(null);
  const [af, setAf] = useState([]);
  const [f, setF] = useState({ colaboradorId: '', motivoId: '', dataIni: '', dataFim: '', observacao: '' });
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => {
    API.get('/pontorep/acompanhamento').then(r => setDados(r.data)).catch(() => {});
    API.get('/pontorep/afastamentos').then(r => setAf(r.data)).catch(() => {});
  }, [API]);
  useEffect(() => {
    API.get('/pontorep/colaboradores').then(r => setColabs(r.data)).catch(() => {});
    API.get('/pontorep/motivos').then(r => setMotivos(r.data)).catch(() => {});
    carregar();
  }, [API, carregar]);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const lancar = () => API.post('/pontorep/afastamentos', f).then(() => { setMsg('✅ Afastamento lançado'); setF({ colaboradorId: '', motivoId: '', dataIni: '', dataFim: '', observacao: '' }); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));

  return (
    <div>
      <div style={{ ...s.msg, background: '#eff6ff', color: '#1e40af', marginBottom: 12 }}>Atestados vêm dos afastamentos lançados. <b>Atrasos, horas extras e banco de horas</b> vêm da <b>apuração das batidas</b> (rode em “Bater ponto → Apurar período”).{dados && !dados.temApuracao ? ' Ainda não há apuração registrada.' : ''}</div>

      {podeAutorizar && (
        <div style={s.card}>
          <div style={s.cardT}>Lançar afastamento</div>
          <div style={s.grid}>
            <label style={s.lab}>Colaborador
              <select style={s.inp} value={f.colaboradorId} onChange={e => set('colaboradorId', e.target.value)}>
                <option value="">—</option>{colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select></label>
            <label style={s.lab}>Motivo
              <select style={s.inp} value={f.motivoId} onChange={e => set('motivoId', e.target.value)}>
                <option value="">—</option>{motivos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select></label>
            <label style={s.lab}>Início<input type="date" style={s.inp} value={f.dataIni} onChange={e => set('dataIni', e.target.value)} /></label>
            <label style={s.lab}>Fim<input type="date" style={s.inp} value={f.dataFim} onChange={e => set('dataFim', e.target.value)} /></label>
            <label style={{ ...s.lab, gridColumn: '1 / -1' }}>Observação<input style={s.inp} value={f.observacao} onChange={e => set('observacao', e.target.value)} /></label>
          </div>
          <button style={{ ...s.btnP, marginTop: 10 }} onClick={lancar}>Lançar</button>
          {msg && <div style={s.msg}>{msg}</div>}
        </div>
      )}

      <div style={s.card}>
        <div style={s.cardT}>🩺 Mais atestados (últimos 12 meses)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Colaborador', 'Atestados', 'Dias'].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {(dados?.atestados || []).map(a => (
                <tr key={a.colaborador_id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={s.td}>{a.nome}</td><td style={s.td}><b>{a.qtd}</b></td><td style={s.td}>{a.dias}</td>
                </tr>
              ))}
              {!(dados?.atestados || []).length && <tr><td style={s.td} colSpan={3}>Nenhum atestado lançado ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {dados?.temApuracao && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
          {[['⏰ Mais atrasos', dados.atrasos, r => `${r.dias} dia(s) · ${Math.floor(r.min / 60)}h${String(r.min % 60).padStart(2, '0')}`],
          ['💰 Mais horas extras', dados.horasExtras, r => `${Math.floor(r.min / 60)}h${String(r.min % 60).padStart(2, '0')}`],
          ['🏦 Banco de horas (saldo)', dados.bancoHoras, r => `${r.min < 0 ? '-' : '+'}${Math.floor(Math.abs(r.min) / 60)}h${String(Math.abs(r.min) % 60).padStart(2, '0')}`]].map(([titulo, lista, fmt]) => (
            <div key={titulo} style={s.card}>
              <div style={s.cardT}>{titulo}</div>
              <table style={s.tbl}><tbody>
                {(lista || []).slice(0, 12).map(r => (
                  <tr key={r.colaborador_id} style={{ borderTop: '1px solid #eee' }}>
                    <td style={s.td}>{r.nome}</td><td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{fmt(r)}</td>
                  </tr>
                ))}
                {!(lista || []).length && <tr><td style={s.td}>—</td></tr>}
              </tbody></table>
            </div>
          ))}
        </div>
      )}

      <div style={s.card}>
        <div style={s.cardT}>Afastamentos lançados ({af.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Colaborador', 'Motivo', 'Início', 'Fim', 'Dias'].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {af.map(a => (
                <tr key={a.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={s.td}>{a.colaborador_nome}</td><td style={s.td}>{a.motivo_nome}</td>
                  <td style={s.td}>{a.data_ini}</td><td style={s.td}>{a.data_fim || '—'}</td><td style={s.td}>{a.dias}</td>
                </tr>
              ))}
              {!af.length && <tr><td style={s.td} colSpan={5}>Nenhum afastamento lançado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ───────── Relatórios de Folha de Ponto (consolidado + folha individual) ─────────
function Relatorios({ API }) {
  const [lojas, setLojas] = useState([]);
  const [funcoes, setFuncoes] = useState([]);
  const hoje = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ loja: '', funcao: '', ini: hoje.slice(0, 8) + '01', fim: hoje });
  const [rel, setRel] = useState(null);
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    API.get('/pontorep/lojas').then(r => setLojas(r.data)).catch(() => {});
    API.get('/pontorep/funcoes').then(r => setFuncoes(r.data)).catch(() => {});
  }, [API]);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const gerar = () => { setMsg(''); setCarregando(true); API.get(`/pontorep/relatorio/folha?loja=${f.loja}&funcao=${f.funcao}&ini=${f.ini}&fim=${f.fim}`).then(r => setRel(r.data)).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro'))).finally(() => setCarregando(false)); };
  const folha = (cid) => API.get(`/pontorep/espelho?colaborador=${cid}&ini=${f.ini}&fim=${f.fim}`).then(r => printFolha(r.data)).catch(() => {});
  const enviarEmail = (cid, nome) => {
    const para = window.prompt(`Enviar a Folha de Ponto de ${nome} por e-mail para:\n(deixe em branco para usar o e-mail cadastrado do colaborador)`, '');
    if (para === null) return;
    setMsg('Enviando…');
    API.post('/pontorep/relatorio/enviar-email', { colaborador: cid, ini: f.ini, fim: f.fim, para: para || undefined })
      .then(r => setMsg(`✅ Folha enviada para ${r.data.para}.`)).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro ao enviar')));
  };
  const hm = m => `${String(Math.floor(Math.abs(m || 0) / 60)).padStart(2, '0')}:${String(Math.abs(m || 0) % 60).padStart(2, '0')}`;
  const sSaldo = m => (m < 0 ? '-' : '+') + hm(m);
  const imprimirConsolidado = () => {
    if (!rel) return;
    const linhas = rel.linhas.map(l => `<tr><td>${l.nome}</td><td class=r>${hm(l.trab)}</td><td class=r>${hm(l.prev)}</td><td class=r>${hm(l.atraso)}</td><td class=r>${hm(l.extra)}</td><td class=r>${sSaldo(l.saldo)}</td><td class=r>${l.faltas}</td></tr>`).join('');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Relatório de Folha de Ponto</title><style>body{font-family:Arial;padding:20px;font-size:11px}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #ccc;padding:4px 7px;text-align:left}th{background:#f0f0f4}.r{text-align:right}</style></head><body><h1>Relatório de Folha de Ponto</h1><div>${f.ini.split('-').reverse().join('/')} a ${f.fim.split('-').reverse().join('/')}</div><table><thead><tr><th>Colaborador</th><th class=r>Trabalhadas</th><th class=r>Previstas</th><th class=r>Atrasos</th><th class=r>Extras</th><th class=r>Saldo</th><th class=r>Faltas</th></tr></thead><tbody>${linhas}</tbody></table></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  return (
    <div>
      <div style={s.card}>
        <div style={s.cardT}>Relatório de Folha de Ponto</div>
        <div style={s.grid}>
          <label style={s.lab}>Loja<select style={s.inp} value={f.loja} onChange={e => set('loja', e.target.value)}><option value="">Todas</option>{lojas.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
          <label style={s.lab}>Cargo/função<select style={s.inp} value={f.funcao} onChange={e => set('funcao', e.target.value)}><option value="">Todos</option>{funcoes.map(fn => <option key={fn.id} value={fn.id}>{fn.nome}</option>)}</select></label>
          <label style={s.lab}>De<input type="date" style={s.inp} value={f.ini} onChange={e => set('ini', e.target.value)} /></label>
          <label style={s.lab}>Até<input type="date" style={s.inp} value={f.fim} onChange={e => set('fim', e.target.value)} /></label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button style={s.btnP} onClick={gerar} disabled={carregando}>{carregando ? 'Apurando…' : 'Gerar relatório'}</button>
          {rel && <button style={s.btn} onClick={imprimirConsolidado}>🖨️ Imprimir consolidado</button>}
        </div>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      {rel && (
        <div style={s.card}>
          <div style={s.cardT}>{rel.linhas.length} colaboradores</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tbl}>
              <thead><tr>{['Colaborador', 'Trab.', 'Prev.', 'Atrasos', 'Extras', 'Saldo', 'Faltas', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
              <tbody>
                {rel.linhas.map(l => (
                  <tr key={l.id} style={{ borderTop: '1px solid #eee' }}>
                    <td style={s.td}>{l.nome}</td><td style={s.td}>{hm(l.trab)}</td><td style={s.td}>{hm(l.prev)}</td>
                    <td style={{ ...s.td, color: l.atraso ? '#b91c1c' : '#111' }}>{hm(l.atraso)}</td>
                    <td style={{ ...s.td, color: l.extra ? '#b45309' : '#111' }}>{hm(l.extra)}</td>
                    <td style={{ ...s.td, color: l.saldo < 0 ? '#b91c1c' : '#15803d' }}>{sSaldo(l.saldo)}</td>
                    <td style={s.td}>{l.faltas || '—'}</td>
                    <td style={s.td}><button style={s.btnMini} onClick={() => folha(l.id)}>🖨️ folha</button>{' '}<button style={s.btnMini} onClick={() => enviarEmail(l.id, l.nome)}>✉️ e-mail</button></td>
                  </tr>
                ))}
                {!rel.linhas.length && <tr><td style={s.td} colSpan={8}>Nenhum colaborador no filtro.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ ...s.leg, marginTop: 8 }}>“🖨️ folha” gera a Folha de Ponto individual (layout oficial); “✉️ e-mail” envia ao colaborador via SMTP do sistema. Envio por WhatsApp: próxima fase.</div>
        </div>
      )}
    </div>
  );
}

// ───────── Arquivos fiscais (AFD / AEJ) ─────────
function Fiscal({ API }) {
  const [lojas, setLojas] = useState([]);
  const [f, setF] = useState({ loja: '', ini: '', fim: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => { API.get('/pontorep/lojas').then(r => setLojas(r.data)).catch(() => {}); }, [API]);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const baixar = (tipo) => {
    if (!f.loja || !f.ini || !f.fim) return setMsg('⚠️ Escolha loja e período.');
    setMsg('Gerando…');
    API.get(`/pontorep/fiscal/${tipo}?loja=${f.loja}&ini=${f.ini}&fim=${f.fim}`).then(r => {
      const blob = new Blob([r.data.conteudo], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = r.data.nome; a.click();
      setMsg(`✅ ${r.data.nome} gerado (${r.data.registros ?? r.data.linhas} registros).`);
    }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  };
  return (
    <div>
      <div style={{ ...s.msg, background: '#fef9c3', color: '#854d0e', marginBottom: 12 }}>⚠️ <b>Leiaute base</b> (tipos de registro e ordem de campos conforme a Portaria 671). A largura fixa exata de cada campo e a assinatura digital devem ser conferidas na <b>homologação/certificação</b> do REP-P.</div>
      <div style={s.card}>
        <div style={s.cardT}>Gerar AFD / AEJ</div>
        <div style={s.grid}>
          <label style={s.lab}>Loja (estabelecimento)
            <select style={s.inp} value={f.loja} onChange={e => set('loja', e.target.value)}>
              <option value="">— selecione —</option>{lojas.map(l => <option key={l} value={l}>{l}</option>)}
            </select></label>
          <label style={s.lab}>De<input type="date" style={s.inp} value={f.ini} onChange={e => set('ini', e.target.value)} /></label>
          <label style={s.lab}>Até<input type="date" style={s.inp} value={f.fim} onChange={e => set('fim', e.target.value)} /></label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button style={s.btnP} onClick={() => baixar('afd')}>⬇️ Baixar AFD (marcações)</button>
          <button style={s.btn} onClick={() => baixar('aej')}>⬇️ Baixar AEJ (jornada)</button>
        </div>
        {msg && <div style={s.msg}>{msg}</div>}
        <div style={{ ...s.leg, marginTop: 8 }}><b>AFD</b> = todas as batidas originais (imutáveis) do estabelecimento. <b>AEJ</b> = jornada contratual + marcações tratadas + ausências.</div>
      </div>
    </div>
  );
}

// ───────── Férias (regras CLT) ─────────
function Ferias({ API, podeAutorizar }) {
  const [colabs, setColabs] = useState([]);
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ colaboradorId: '', dataIni: '', dias: 30, abonoDias: 0, aquisitivoFim: '' });
  const [previa, setPrevia] = useState(null);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/pontorep/ferias').then(r => setRows(r.data)).catch(() => {}), [API]);
  useEffect(() => { API.get('/pontorep/colaboradores').then(r => setColabs(r.data)).catch(() => {}); carregar(); }, [API, carregar]);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const validar = () => { setMsg(''); API.post('/pontorep/ferias/validar', f).then(r => setPrevia(r.data.alertas)).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro'))); };
  const solicitar = () => API.post('/pontorep/ferias', f).then(r => { setMsg(r.data.alertas.length ? '⏳ Férias registradas com alertas — RH decide.' : '✅ Férias registradas.'); setPrevia(null); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  const decidir = (id, status) => API.post(`/pontorep/ferias/${id}/decidir`, { status }).then(carregar);

  return (
    <div>
      <div style={s.card}>
        <div style={s.cardT}>Programar férias</div>
        <div style={s.grid}>
          <label style={s.lab}>Colaborador
            <select style={s.inp} value={f.colaboradorId} onChange={e => set('colaboradorId', e.target.value)}>
              <option value="">—</option>{colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select></label>
          <label style={s.lab}>Início<input type="date" style={s.inp} value={f.dataIni} onChange={e => set('dataIni', e.target.value)} /></label>
          <label style={s.lab}>Dias<input type="number" style={s.inp} value={f.dias} onChange={e => set('dias', e.target.value)} /></label>
          <label style={s.lab}>Abono (vender)<input type="number" style={s.inp} value={f.abonoDias} onChange={e => set('abonoDias', e.target.value)} /></label>
          <label style={s.lab}>Fim do aquisitivo (opcional)<input type="date" style={s.inp} value={f.aquisitivoFim} onChange={e => set('aquisitivoFim', e.target.value)} /></label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button style={s.btn} onClick={validar}>🔍 Validar regras</button>
          <button style={s.btnP} onClick={solicitar}>Registrar</button>
        </div>
        {previa && (previa.length
          ? previa.map((a, i) => <div key={i} style={{ ...s.alerta, background: NIVEL[a.nivel].bg, color: NIVEL[a.nivel].cor }}><b>{NIVEL[a.nivel].label}</b> · {a.mensagem} <span style={s.leg}>({a.base_legal})</span></div>)
          : <div style={{ ...s.alerta, background: '#dcfce7', color: '#15803d' }}>✅ Sem conflitos com a legislação.</div>)}
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      <div style={s.card}>
        <div style={s.cardT}>Férias ({rows.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Colaborador', 'Início', 'Dias', 'Abono', 'Alertas', 'Status', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => {
                const al = (() => { try { return JSON.parse(r.alertas_json || '[]'); } catch { return []; } })();
                const crit = al.filter(a => a.nivel === 'critico').length;
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                    <td style={s.td}>{r.colaborador_nome}</td><td style={s.td}>{r.data_ini}</td>
                    <td style={s.td}>{r.dias}</td><td style={s.td}>{r.abono_dias || '—'}</td>
                    <td style={s.td}>{al.length ? <span style={{ color: crit ? '#b91c1c' : '#b45309' }}>{crit ? `🔴 ${crit}` : `🟡 ${al.length}`}</span> : '✓'}</td>
                    <td style={s.td}><span style={{ ...s.pill, background: r.status === 'aprovada' ? '#15803d' : r.status === 'recusada' ? '#b91c1c' : '#b45309' }}>{r.status}</span></td>
                    <td style={s.td}>{podeAutorizar && r.status === 'solicitada' && <><button style={s.btnMini} onClick={() => decidir(r.id, 'aprovada')}>aprovar</button>{' '}<button style={s.btnMini} onClick={() => decidir(r.id, 'recusada')}>recusar</button></>}</td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td style={s.td} colSpan={7}>Nenhuma férias registrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ───────── Feriados (para a falta ser considerada) ─────────
function Feriados({ API }) {
  const [rows, setRows] = useState([]);
  const [lojas, setLojas] = useState([]);
  const [f, setF] = useState({ data: '', nome: '', tipo: 'municipal', lojaId: '', recorrente: true, trabalha: false });
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/pontorep/feriados').then(r => setRows(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); API.get('/pontorep/lojas').then(r => setLojas(r.data)).catch(() => {}); }, [API, carregar]);
  const criar = () => API.post('/pontorep/feriados', f).then(() => { setMsg('✅ Feriado cadastrado'); setF({ data: '', nome: '', tipo: 'municipal', lojaId: '', recorrente: true, trabalha: false }); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  const remover = id => { if (window.confirm('Remover feriado?')) API.delete('/pontorep/feriados/' + id).then(carregar); };
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <div>
      <div style={s.card}>
        <div style={s.cardT}>Novo feriado</div>
        <div style={s.grid}>
          <label style={s.lab}>Data<input type="date" style={s.inp} value={f.data} onChange={e => set('data', e.target.value)} /></label>
          <label style={s.lab}>Nome<input style={s.inp} value={f.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex.: Padroeira da cidade" /></label>
          <label style={s.lab}>Tipo
            <select style={s.inp} value={f.tipo} onChange={e => set('tipo', e.target.value)}>
              {['nacional', 'estadual', 'municipal', 'ponto_facultativo'].map(t => <option key={t} value={t}>{t}</option>)}
            </select></label>
          <label style={s.lab}>Loja
            <select style={s.inp} value={f.lojaId} onChange={e => set('lojaId', e.target.value)}>
              <option value="">Todas as lojas</option>
              {lojas.map(l => <option key={l} value={l}>{l}</option>)}
            </select></label>
          <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={f.recorrente} onChange={e => set('recorrente', e.target.checked)} /> Repete todo ano</label>
          <label style={{ ...s.lab, flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={f.trabalha} onChange={e => set('trabalha', e.target.checked)} /> Loja abre (gera dobro/folga)</label>
        </div>
        <button style={{ ...s.btnP, marginTop: 10 }} onClick={criar}>Cadastrar feriado</button>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      <div style={s.card}>
        <div style={s.cardT}>{rows.length} feriados — usados p/ considerar falta e para a regra de férias (não iniciar 2 dias antes de feriado/DSR)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Data', 'Nome', 'Tipo', 'Loja', 'Repete', 'Abre?', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={s.td}>{r.recorrente ? r.data.slice(5) : r.data}</td>
                  <td style={s.td}>{r.nome}</td><td style={s.td}>{r.tipo}</td>
                  <td style={s.td}>{r.loja_id || 'Todas'}</td>
                  <td style={s.td}>{r.recorrente ? '🔁 anual' : 'única'}</td>
                  <td style={s.td}>{r.trabalha ? 'Sim' : 'Não'}</td>
                  <td style={s.td}><button style={s.btnMini} onClick={() => remover(r.id)}>remover</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ───────── Necessidade de equipe por loja/turno (base da Escala Inteligente) ─────────
function Necessidade({ API }) {
  const [rows, setRows] = useState([]);
  const [lojas, setLojas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [f, setF] = useState({ lojaId: '', turno: '', faixaIni: '', faixaFim: '', modeloId: '', diaSemana: '', qtdMin: 1, funcao: '' });
  const [msg, setMsg] = useState('');
  const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const carregar = useCallback(() => API.get('/pontorep/necessidades').then(r => setRows(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); API.get('/pontorep/lojas').then(r => setLojas(r.data)).catch(() => {}); API.get('/pontorep/modelos').then(r => setModelos(r.data)).catch(() => {}); }, [API, carregar]);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const criar = () => API.post('/pontorep/necessidades', f).then(() => { setMsg('✅ Necessidade cadastrada'); setF({ lojaId: f.lojaId, turno: '', faixaIni: '', faixaFim: '', modeloId: '', diaSemana: '', qtdMin: 1, funcao: '' }); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  const remover = id => { if (window.confirm('Remover?')) API.delete('/pontorep/necessidades/' + id).then(carregar); };
  return (
    <div>
      <div style={{ ...s.msg, background: '#eff6ff', color: '#1e40af', marginBottom: 12 }}>Diga <b>quantos colaboradores</b> cada loja precisa por <b>turno/faixa de horário</b>. A <b>Escala Inteligente</b> (próxima fase) vai usar isto + banco de horas + o horário de pico de vendas do ERP para sugerir a escala e apontar os gargalos.</div>
      <div style={s.card}>
        <div style={s.cardT}>Nova necessidade</div>
        <div style={s.grid}>
          <label style={s.lab}>Loja
            <select style={s.inp} value={f.lojaId} onChange={e => set('lojaId', e.target.value)}>
              <option value="">— selecione —</option>{lojas.map(l => <option key={l} value={l}>{l}</option>)}
            </select></label>
          <label style={s.lab}>Turno<input style={s.inp} value={f.turno} onChange={e => set('turno', e.target.value)} placeholder="Manhã / Tarde / Noite" /></label>
          <label style={s.lab}>Faixa início<input type="time" style={s.inp} value={f.faixaIni} onChange={e => set('faixaIni', e.target.value)} /></label>
          <label style={s.lab}>Faixa fim<input type="time" style={s.inp} value={f.faixaFim} onChange={e => set('faixaFim', e.target.value)} /></label>
          <label style={s.lab}>Modelo sugerido
            <select style={s.inp} value={f.modeloId} onChange={e => set('modeloId', e.target.value)}>
              <option value="">—</option>{modelos.map(m => <option key={m.id} value={m.id}>{m.codigo}</option>)}
            </select></label>
          <label style={s.lab}>Dia da semana
            <select style={s.inp} value={f.diaSemana} onChange={e => set('diaSemana', e.target.value)}>
              <option value="">Todos</option>{DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select></label>
          <label style={s.lab}>Qtd. mínima<input type="number" style={s.inp} value={f.qtdMin} onChange={e => set('qtdMin', e.target.value)} /></label>
          <label style={s.lab}>Função (opcional)<input style={s.inp} value={f.funcao} onChange={e => set('funcao', e.target.value)} placeholder="Ex.: Farmacêutico" /></label>
        </div>
        <button style={{ ...s.btnP, marginTop: 10 }} onClick={criar}>Cadastrar</button>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      <div style={s.card}>
        <div style={s.cardT}>{rows.length} necessidades cadastradas</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Loja', 'Turno', 'Faixa', 'Dia', 'Modelo', 'Qtd', 'Função', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={s.td}>{r.loja_id}</td><td style={s.td}>{r.turno}</td>
                  <td style={s.td}>{r.faixa_ini || '—'}{r.faixa_fim ? `–${r.faixa_fim}` : ''}</td>
                  <td style={s.td}>{r.dia_semana == null ? 'Todos' : DIAS[r.dia_semana]}</td>
                  <td style={s.td}>{r.modelo_codigo || '—'}</td>
                  <td style={s.td}><b>{r.qtd_min}</b></td>
                  <td style={s.td}>{r.funcao || '—'}</td>
                  <td style={s.td}><button style={s.btnMini} onClick={() => remover(r.id)}>remover</button></td>
                </tr>
              ))}
              {!rows.length && <tr><td style={s.td} colSpan={8}>Nenhuma necessidade cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: 16, maxWidth: 1100, margin: '0 auto' },
  sub: { color: '#475569', fontSize: 14, margin: '8px 0 14px' },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  tab: { padding: '8px 12px', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  tabAtiva: { background: '#e6f3f0', color: '#0d6b5e', borderColor: '#0d6b5e', fontWeight: 600 },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 14 },
  cardT: { fontWeight: 700, marginBottom: 8, color: '#0f172a' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 },
  lab: { display: 'flex', flexDirection: 'column', fontSize: 12, color: '#475569', gap: 4 },
  inp: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14 },
  btn: { padding: '9px 14px', border: '1px solid #0f172a', background: '#fff', color: '#0f172a', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnP: { padding: '9px 14px', border: 'none', background: '#0f766e', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700 },
  btnMini: { padding: '5px 10px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12 },
  msg: { marginTop: 10, padding: '8px 12px', background: '#f1f5f9', borderRadius: 8, fontSize: 14 },
  alerta: { padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 6 },
  leg: { fontSize: 11, color: '#64748b' },
  legOk: { fontSize: 12, color: '#334155', margin: '4px 0' },
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 10px', color: '#64748b', fontSize: 12, borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' },
  td: { padding: '8px 10px', verticalAlign: 'top' },
  pill: { color: '#fff', padding: '2px 8px', borderRadius: 999, fontSize: 11, whiteSpace: 'nowrap' },
  modalBg: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, zIndex: 50, overflowY: 'auto' },
  modal: { background: '#fff', borderRadius: 12, padding: 16, maxWidth: 820, width: '100%', marginTop: 30 },
};
