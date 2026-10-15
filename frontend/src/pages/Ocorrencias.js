import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const STATUS = {
  aguardando_rh: ['Aguardando RH', '#185FA5', '#E6F1FB'], ativa: ['Ativa', '#993C1D', '#FCEBEB'],
  reanalise: ['Reanálise pedida', '#854F0B', '#FAEEDA'], revertida: ['Revertida', '#3B6D11', '#EAF3DE'],
  rejeitada: ['Rejeitada pelo RH', '#666', '#eee'], contestada: ['Contestada', '#854F0B', '#FAEEDA'],
};

// Ocorrências de advertência/suspensão geram um termo (documento editável pelo RH)
const ehAdvertencia = o => !!(o.exige_termo || /advert|suspens/i.test(`${o.categoria || ''} ${o.motivo || ''}`));
const tipoTermo = o => (o.termo_tipo === 'suspensao' || /suspens/i.test(`${o.categoria || ''} ${o.motivo || ''}`)) ? 'SUSPENSÃO' : 'ADVERTÊNCIA';

const DEF_ADVERT = `TERMO DE ADVERTÊNCIA

Colaborador(a): {COLABORADOR}
Empresa (registro): {EMPRESA_REGISTRO}
Local de trabalho: {LOCAL_TRABALHO}
Data: {DATA}
Motivo: {MOTIVO}

Prezado(a) colaborador(a),

Pela presente, comunicamos a aplicação de advertência em razão dos fatos descritos a seguir:

{OBS}

Esclarecemos que a reincidência poderá ensejar a aplicação de penalidades mais severas, inclusive a rescisão por justa causa, nos termos do art. 482 da CLT.

Solicitamos a leitura, ciência e assinatura deste documento.

Local e data: ______________________________

_______________________________      _______________________________
   Assinatura do(a) colaborador(a)              Assinatura da empresa`;

function modeloTermo(o, tpl) {
  const ehSusp = o.termo_tipo === 'suspensao' || /suspens/i.test(`${o.categoria || ''} ${o.motivo || ''}`);
  const base = (ehSusp ? tpl?.suspensao : tpl?.advertencia) || DEF_ADVERT;
  return base
    .replace(/\{COLABORADOR\}/g, o.colaborador_nome || '')
    .replace(/\{DATA\}/g, o.data || '')
    .replace(/\{MOTIVO\}/g, o.motivo || '')
    .replace(/\{OBS\}/g, o.obs || '[Descreva detalhadamente os fatos, data, horário e local da ocorrência.]')
    .replace(/\{EMPRESA_REGISTRO\}/g, o.empresa_registro || '')
    .replace(/\{LOCAL_TRABALHO\}/g, o.loja_nome || o.loja || '');
}

function imprimirTermo(o, texto) {
  const w = window.open('', '_blank'); if (!w) return;
  const corpo = (texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  w.document.write(`<html><head><title>Termo de ${tipoTermo(o)} — ${o.colaborador_nome || ''}</title></head>
    <body style="font-family:system-ui;max-width:640px;margin:32px auto;color:#222;line-height:1.6">
    <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px">${corpo}</pre>
    ${o.assinado_em ? `<p style="margin-top:16px;font-size:12px;color:#3B6D11">Assinado eletronicamente em ${new Date(o.assinado_em.replace(' ', 'T') + 'Z').toLocaleString('pt-BR')}.</p>` : ''}
    <p style="margin-top:24px;font-size:11px;color:#666">Documento gerado pelo Sistema Mutti.</p>
    </body></html>`);
  w.document.close(); setTimeout(() => w.print(), 300);
}

export default function Ocorrencias() {
  const { usuario } = useAuth();
  const podeLancar = ['RH', 'Supervisor', 'Gerente', 'Subgerente', 'Gestor Geral', 'Diretor Geral', 'Suporte', 'Tesouraria', 'Marketing', 'Comercial'].includes(usuario.funcao);
  const podeValidar = ['RH', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const podeGerir = podeLancar || podeValidar;
  const [aba, setAba] = useState(podeLancar ? 'lancar' : 'historico');
  return (
    <div style={s.wrap}>
      <Banner emoji="⚠️" titulo="Ocorrências" cor="vermelho" sub="Toda ocorrência passa pelo RH antes de chegar ao colaborador. O RH valida (autoriza ou rejeita) e, se preciso, solicita assinatura." />
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {podeLancar && <button onClick={() => setAba('lancar')} style={{ ...s.tab, ...(aba === 'lancar' ? s.tabAtiva : {}) }}>Lançar</button>}
        <button onClick={() => setAba('historico')} style={{ ...s.tab, ...(aba === 'historico' ? s.tabAtiva : {}) }}>{podeValidar ? 'Validação / Histórico' : 'Histórico'}</button>
      </div>
      {aba === 'lancar' && podeLancar ? <Lancar usuario={usuario} /> : <Historico usuario={usuario} podeGerir={podeGerir} podeValidar={podeValidar} />}
    </div>
  );
}

function Lancar({ usuario }) {
  const { API } = useAuth();
  const ehAtendimentoOnly = ['Gerente', 'Subgerente'].includes(usuario.funcao);
  const [colabs, setColabs] = useState([]);
  const [motivos, setMotivos] = useState([]);
  const [form, setForm] = useState({ colaborador_id: '', motivo_id: '', obs: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const params = ehAtendimentoOnly ? { loja_id: usuario.loja_id } : {};
    API.get('/colaboradores', { params }).then(r => {
      let cs = r.data.colaboradores || [];
      if (ehAtendimentoOnly) cs = cs.filter(c => ['func-vendedor', 'func-caixa', 'func-conferente', 'func-farmaceutico', 'func-estagiario', 'func-subgerente'].includes(c.funcao_id));
      setColabs(cs);
    });
    API.get('/ocorrencias/motivos').then(r => setMotivos(r.data.motivos || []));
  }, [API, ehAtendimentoOnly, usuario.loja_id]);
  async function salvar() {
    if (!form.colaborador_id || !form.motivo_id) { setMsg('Escolha colaborador e motivo.'); return; }
    try { await API.post('/ocorrencias', form); setMsg('✅ Ocorrência enviada ao RH para validação. O colaborador só será notificado após o RH autorizar.'); setForm({ colaborador_id: '', motivo_id: '', obs: '' }); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }
  const m = motivos.find(x => x.id === form.motivo_id);
  return (
    <div style={s.card}>
      {ehAtendimentoOnly && <div style={{ fontSize: 11, color: '#185FA5', background: '#E6F1FB', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>Você lança ocorrências apenas para a equipe de <strong>Atendimento</strong> da sua loja.</div>}
      <label style={s.rotulo}>Colaborador</label>
      <select style={s.campo} value={form.colaborador_id} onChange={e => setForm({ ...form, colaborador_id: e.target.value })}>
        <option value="">Selecione…</option>
        {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <label style={s.rotulo}>Motivo</label>
      <select style={s.campo} value={form.motivo_id} onChange={e => setForm({ ...form, motivo_id: e.target.value })}>
        <option value="">Selecione…</option>
        {motivos.map(mo => <option key={mo.id} value={mo.id}>{mo.categoria} · {mo.motivo} ({mo.zera ? 'zera' : `-${mo.deducao}%`})</option>)}
      </select>
      {m && <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Impacto: {m.zera ? 'zera o indicador' : `-${m.deducao}% no indicador "${m.indicador_alvo}"`}.</div>}
      <label style={s.rotulo}>Observação (opcional)</label>
      <textarea style={{ ...s.campo, minHeight: 50 }} value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} />
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginBottom: 8 }}>{msg}</div>}
      <button style={s.btn} onClick={salvar}>Enviar ao RH</button>
    </div>
  );
}

function Historico({ usuario, podeGerir, podeValidar }) {
  const { API } = useAuth();
  const [lista, setLista] = useState([]);
  const [msg, setMsg] = useState('');
  const [exigeAss, setExigeAss] = useState({});
  const [docs, setDocs] = useState({});
  const [templates, setTemplates] = useState(null);
  useEffect(() => { API.get('/ocorrencias/modelos-termo').then(r => setTemplates(r.data)).catch(() => {}); }, [API]);
  const carregar = useCallback(() => {
    const params = podeGerir ? {} : { colaborador_id: usuario.id };
    API.get('/ocorrencias', { params }).then(r => setLista(r.data.ocorrencias || []));
  }, [API, podeGerir, usuario.id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function validar(o, decisao) {
    const ass = decisao === 'autorizar' ? (exigeAss[o.id] ?? ehAdvertencia(o)) : false;
    const documento = ehAdvertencia(o) ? (docs[o.id] ?? o.documento ?? modeloTermo(o, templates)) : undefined;
    await API.post(`/ocorrencias/${o.id}/validar`, { decisao, exige_assinatura: ass, documento });
    setMsg(decisao === 'autorizar' ? '✅ Autorizada e enviada ao colaborador.' : 'Rejeitada — não chega ao colaborador.'); carregar();
  }
  async function decidirReanalise(o, decisao) {
    await API.post(`/ocorrencias/${o.id}/decidir-reanalise`, { decisao });
    setMsg(decisao === 'aceita' ? 'Reanálise aceita — revertida.' : 'Reanálise mantida.'); carregar();
  }
  async function pedirReanalise(o) { const t = window.prompt('Por que você discorda? (reanálise pelo RH)') || ''; await API.post(`/ocorrencias/${o.id}/reanalise`, { texto: t }); setMsg('Reanálise enviada ao RH.'); carregar(); }
  async function assinar(o) { await API.post(`/ocorrencias/${o.id}/assinar`, {}); setMsg('Termo assinado.'); carregar(); }

  if (!lista.length) return <div style={s.card}>Nenhuma ocorrência.</div>;
  return (
    <>
      {msg && <div style={{ fontSize: 12, color: '#3B6D11', marginBottom: 8 }}>{msg}</div>}
      {lista.map(o => {
        const st = STATUS[o.status] || ['—', '#666', '#eee'];
        const meu = o.colaborador_id === usuario.id;
        return (
          <div key={o.id} style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{o.motivo}</div>
                <div style={{ fontSize: 11, color: '#999' }}>{o.colaborador_nome} · {o.data} · {o.zera ? 'zera' : `-${o.deducao}%`} ({o.indicador_alvo})</div>
              </div>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: st[2], color: st[1] }}>{st[0]}</span>
            </div>
            {o.obs && <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>{o.obs}</div>}
            {o.reanalise && <div style={{ fontSize: 11, color: '#854F0B', marginTop: 4 }}>Reanálise: {o.reanalise}</div>}
            {o.exige_assinatura ? <div style={{ fontSize: 10, color: o.assinado_em ? '#3B6D11' : '#854F0B', marginTop: 4 }}>{o.assinado_em ? '✓ termo assinado' : '✍ assinatura solicitada'}</div> : null}

            {podeValidar && o.status === 'aguardando_rh' && ehAdvertencia(o) && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#444', marginBottom: 4 }}>📄 Termo de {tipoTermo(o).toLowerCase()} (edite as informações)</div>
                <textarea style={{ ...s.campo, minHeight: 240, fontFamily: 'inherit', lineHeight: 1.5 }} value={docs[o.id] ?? o.documento ?? modeloTermo(o, templates)} onChange={e => setDocs({ ...docs, [o.id]: e.target.value })} />
                <button style={s.btnSm} onClick={() => imprimirTermo(o, docs[o.id] ?? o.documento ?? modeloTermo(o, templates))}>🖨 Pré-visualizar / imprimir</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {podeValidar && o.status === 'aguardando_rh' && <>
                <label style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center', color: '#666' }}>
                  <input type="checkbox" checked={exigeAss[o.id] ?? ehAdvertencia(o)} onChange={e => setExigeAss({ ...exigeAss, [o.id]: e.target.checked })} /> exigir assinatura
                </label>
                <button style={s.btnOk} onClick={() => validar(o, 'autorizar')}>Autorizar</button>
                <button style={{ ...s.btnSm, color: '#993C1D', borderColor: '#993C1D' }} onClick={() => validar(o, 'rejeitar')}>Rejeitar</button>
              </>}
              {podeValidar && o.status === 'reanalise' && <>
                <button style={s.btnOk} onClick={() => decidirReanalise(o, 'aceita')}>Aceitar (reverter)</button>
                <button style={{ ...s.btnSm, color: '#993C1D', borderColor: '#993C1D' }} onClick={() => decidirReanalise(o, 'manter')}>Manter</button>
              </>}
              {o.documento && o.status !== 'aguardando_rh' && <button style={s.btnSm} onClick={() => imprimirTermo(o, o.documento)}>🖨 Termo (PDF)</button>}
              {meu && o.status === 'ativa' && <button style={s.btnSm} onClick={() => pedirReanalise(o)}>Pedir reanálise</button>}
              {meu && o.status === 'ativa' && o.exige_assinatura && !o.assinado_em && <button style={s.btnOk} onClick={() => assinar(o)}>✍ Assinar termo</button>}
            </div>
          </div>
        );
      })}
    </>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 940, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  campo: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', marginBottom: 8 },
  rotulo: { display: 'block', fontSize: 12, color: '#666', marginBottom: 3 },
  tab: { fontSize: 12, padding: '6px 14px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666' },
  tabAtiva: { background: '#111', color: '#fff', borderColor: '#111' },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnSm: { fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer' },
  btnOk: { fontSize: 12, padding: '4px 12px', border: '1.5px solid #3B6D11', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#3B6D11', fontWeight: 500 },
};
