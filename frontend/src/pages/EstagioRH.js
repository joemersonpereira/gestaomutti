import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// número com vírgula decimal (pro Excel pt-BR) e baixa CSV (separador ';', BOM UTF-8). cols=[{h,f}]
const numBR = x => x == null || x === '' ? '' : (Number(x) || 0).toFixed(2).replace('.', ',');
function baixarCSV(nome, cols, linhas) {
  const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const txt = [cols.map(c => esc(c.h)).join(';'), ...linhas.map(l => cols.map(c => esc(c.f(l))).join(';'))].join('\n');
  const blob = new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = (nome || 'export') + '.csv'; a.click(); URL.revokeObjectURL(a.href);
}

export default function EstagioRH() {
  const { API } = useAuth();
  const [aba, setAba] = useState('fichas');
  return (
    <div style={s.wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '6px 0 12px', borderBottom: '1px solid var(--line,#ddd8cf)', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--fg,#1c2a2e)' }}>🎓 Estágios</h1>
        <div style={{ ...s.tabs, margin: 0, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {[['fichas', '👤 Estagiários'], ['ranking', '🏅 Ranking'], ['modelos', '📄 Documentos'], ['avaliacoes', '📊 Avaliações'], ['renovacao', '🔄 Renovação'], ['pagamento', '💵 Pagamento'], ['ferias', '🌴 Férias/Rescisão'], ['instituicao', '🏫 Instituição de Ensino'], ['seguros', '🛡️ Seguros']].map(([k, l]) => (
            <button key={k} onClick={() => setAba(k)} style={{ ...s.tab, ...(aba === k ? s.tabAtiva : {}) }}>{l}</button>
          ))}
        </div>
      </div>
      {aba === 'fichas' && <Fichas API={API} />}
      {aba === 'talentos' && <Talentos API={API} />}
      {aba === 'ranking' && <Ranking2 API={API} />}
      {aba === 'modelos' && <ModelosDoc API={API} />}
      {aba === 'avaliacoes' && <Avaliacoes API={API} />}
      {aba === 'renovacao' && <Renovacao API={API} />}
      {aba === 'pagamento' && <Pagamento API={API} />}
      {aba === 'ferias' && <FeriasRescisao API={API} />}
      {aba === 'instituicao' && <Escolas API={API} />}
      {aba === 'seguros' && <Seguros API={API} />}
    </div>
  );
}

// ───────── Escolas ─────────
export function Escolas({ API }) {
  const vaziaE = { nome: '', cnpj: '', endereco: '', cidade: '', contato: '', telefone: '', representante: '' };
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(vaziaE);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/estagio/escola').then(r => setRows(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const salvar = () => API.post('/estagio/escola', { ...f, id: editId || undefined, ativo: 1 }).then(() => { setMsg(editId ? '✅ Instituição atualizada' : '✅ Instituição salva'); setF(vaziaE); setEditId(null); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  const remover = id => { if (window.confirm('Remover instituição de ensino?')) API.delete('/estagio/escola/' + id).then(carregar); };
  const editar = r => { setEditId(r.id); setF({ ...vaziaE, ...r }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <div>
      <div style={s.card}>
        <div style={s.cardT}>{editId ? 'Editar instituição de ensino' : 'Nova instituição de ensino (escola, faculdade ou curso técnico — interveniente do contrato)'}</div>
        <div style={s.grid}>
          <label style={s.lab}>Nome<input style={s.inp} value={f.nome} onChange={e => set('nome', e.target.value)} /></label>
          <label style={s.lab}>CNPJ<input style={s.inp} value={f.cnpj} onChange={e => set('cnpj', e.target.value)} /></label>
          <label style={s.lab}>Cidade<input style={s.inp} value={f.cidade} onChange={e => set('cidade', e.target.value)} /></label>
          <label style={{ ...s.lab, gridColumn: '1 / -1' }}>Endereço<input style={s.inp} value={f.endereco} onChange={e => set('endereco', e.target.value)} /></label>
          <label style={s.lab}>Contato<input style={s.inp} value={f.contato} onChange={e => set('contato', e.target.value)} /></label>
          <label style={s.lab}>Telefone<input style={s.inp} value={f.telefone} onChange={e => set('telefone', e.target.value)} /></label>
          <label style={{ ...s.lab, gridColumn: '1 / -1' }}>Representante (assina pela escola)<input style={s.inp} value={f.representante || ''} onChange={e => set('representante', e.target.value)} placeholder="nome de quem assina pela instituição de ensino" /></label>
        </div>
        <button style={{ ...s.btnP, marginTop: 10 }} onClick={salvar}>{editId ? 'Salvar alterações' : 'Cadastrar'}</button>
        {editId && <button style={{ ...s.btn, marginTop: 10, marginLeft: 8 }} onClick={() => { setEditId(null); setF(vaziaE); }}>Cancelar</button>}
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      <Tabela cols={[['nome', 'Instituição de Ensino'], ['cnpj', 'CNPJ'], ['cidade', 'Cidade'], ['endereco', 'Endereço'], ['telefone', 'Telefone']]} rows={rows} onDel={remover} onEdit={editar} />
    </div>
  );
}

// ───────── Empresas ─────────
export function Empresas({ API }) {
  const vaziaE = { nome: '', cnpj: '', tipo: 'ambos', endereco: '' };
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(vaziaE);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/estagio/empresa').then(r => setRows(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const salvar = () => API.post('/estagio/empresa', { ...f, id: editId || undefined, ativo: 1 }).then(() => { setMsg(editId ? '✅ Empresa atualizada' : '✅ Empresa salva'); setF(vaziaE); setEditId(null); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  const remover = id => { if (window.confirm('Remover empresa?')) API.delete('/estagio/empresa/' + id).then(carregar); };
  const editar = r => { setEditId(r.id); setF({ ...vaziaE, ...r }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const TIPO = { registro: 'Registro', atuacao: 'Atuação', ambos: 'Registro + Atuação' };
  return (
    <div>
      <div style={s.card}>
        <div style={s.cardT}>{editId ? 'Editar empresa' : 'Nova empresa'}</div>
        <div style={s.grid}>
          <label style={s.lab}>Nome / razão social<input style={s.inp} value={f.nome} onChange={e => set('nome', e.target.value)} /></label>
          <label style={s.lab}>CNPJ<input style={s.inp} value={f.cnpj} onChange={e => set('cnpj', e.target.value)} /></label>
          <label style={s.lab}>Tipo<select style={s.inp} value={f.tipo} onChange={e => set('tipo', e.target.value)}><option value="registro">Registro</option><option value="atuacao">Atuação</option><option value="ambos">Registro + Atuação</option></select></label>
          <label style={{ ...s.lab, gridColumn: '1 / -1' }}>Endereço<input style={s.inp} value={f.endereco} onChange={e => set('endereco', e.target.value)} /></label>
        </div>
        <button style={{ ...s.btnP, marginTop: 10 }} onClick={salvar}>{editId ? 'Salvar alterações' : 'Cadastrar'}</button>
        {editId && <button style={{ ...s.btn, marginTop: 10, marginLeft: 8 }} onClick={() => { setEditId(null); setF(vaziaE); }}>Cancelar</button>}
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      <Tabela cols={[['nome', 'Empresa'], ['cnpj', 'CNPJ'], ['tipo', 'Tipo', v => TIPO[v] || v], ['endereco', 'Endereço']]} rows={rows} onDel={remover} onEdit={editar} />
    </div>
  );
}

// ───────── Seguros ─────────
function Seguros({ API }) {
  const vaziaS = { seguradora: '', apolice: '', vigencia_ini: '', vigencia_fim: '', valor: '', cobertura: '' };
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(vaziaS);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/estagio/seguro').then(r => setRows(r.data)).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const salvar = () => API.post('/estagio/seguro', { ...f, id: editId || undefined, valor: Number(f.valor) || 0, ativo: 1 }).then(() => { setMsg(editId ? '✅ Seguro atualizado' : '✅ Seguro salvo'); setF(vaziaS); setEditId(null); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  const remover = id => { if (window.confirm('Remover seguro?')) API.delete('/estagio/seguro/' + id).then(carregar); };
  const editar = r => { setEditId(r.id); setF({ ...vaziaS, ...r }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <div>
      <div style={{ ...s.msg, background: '#eff6ff', color: '#1e40af', marginBottom: 12 }}>O seguro é <b>obrigatório por lei</b> (Lei 11.788) e precisa constar no contrato. Cadastre a apólice aqui para vincular na ficha do estagiário.</div>
      <div style={s.card}>
        <div style={s.cardT}>{editId ? 'Editar seguro' : 'Novo seguro'}</div>
        <div style={s.grid}>
          <label style={s.lab}>Seguradora<input style={s.inp} value={f.seguradora} onChange={e => set('seguradora', e.target.value)} /></label>
          <label style={s.lab}>Apólice<input style={s.inp} value={f.apolice} onChange={e => set('apolice', e.target.value)} /></label>
          <label style={s.lab}>Vigência início<input type="date" style={s.inp} value={f.vigencia_ini} onChange={e => set('vigencia_ini', e.target.value)} /></label>
          <label style={s.lab}>Vigência fim<input type="date" style={s.inp} value={f.vigencia_fim} onChange={e => set('vigencia_fim', e.target.value)} /></label>
          <label style={s.lab}>Valor (R$)<input type="number" style={s.inp} value={f.valor} onChange={e => set('valor', e.target.value)} /></label>
          <label style={{ ...s.lab, gridColumn: '1 / -1' }}>Cobertura<input style={s.inp} value={f.cobertura} onChange={e => set('cobertura', e.target.value)} placeholder="Ex.: morte acidental, invalidez…" /></label>
        </div>
        <button style={{ ...s.btnP, marginTop: 10 }} onClick={salvar}>{editId ? 'Salvar alterações' : 'Cadastrar'}</button>
        {editId && <button style={{ ...s.btn, marginTop: 10, marginLeft: 8 }} onClick={() => { setEditId(null); setF(vaziaS); }}>Cancelar</button>}
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      <Tabela cols={[['seguradora', 'Seguradora'], ['apolice', 'Apólice'], ['vigencia_ini', 'Início'], ['vigencia_fim', 'Fim'], ['valor', 'Valor', brl], ['cobertura', 'Cobertura']]} rows={rows} onDel={remover} onEdit={editar} />
    </div>
  );
}

// ───────── Ficha do estagiário ─────────
const vazia = { nome: '', cpf: '', rg: '', nascimento: '', endereco: '', telefone: '', email: '', escola_id: '', curso: '', serie: '', empresa_registro_id: '', empresa_atuacao_id: '', assinante_empresa_id: '', supervisor_id: '', loja: '', horario: '', horas_dia: '', horas_semana: '', valor_bolsa: '', vale_transporte: '', beneficios: '', seguro_id: '', resp_nome: '', resp_cpf: '', resp_telefone: '', resp_parentesco: '', data_inicio: '', data_fim: '', status: 'ativo', banco: '', agencia: '', conta: '', tipo_conta: '', pix: '' };
function Fichas({ API }) {
  const [rows, setRows] = useState([]);
  const [escolas, setEscolas] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [seguros, setSeguros] = useState([]);
  const [lojas, setLojas] = useState([]);
  const [colabs, setColabs] = useState([]);
  const [f, setF] = useState(vazia);
  const [editId, setEditId] = useState(null);
  const [gerarFid, setGerarFid] = useState(null); // ficha selecionada p/ gerar o contrato aqui mesmo
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/estagio/ficha').then(r => setRows(r.data)).catch(() => {}), [API]);
  useEffect(() => {
    carregar();
    API.get('/estagio/escola').then(r => setEscolas(r.data)).catch(() => {});
    API.get('/estagio/empresa').then(r => setEmpresas(r.data)).catch(() => {});
    API.get('/estagio/seguro').then(r => setSeguros(r.data)).catch(() => {});
    API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {});
    API.get('/colaboradores').then(r => setColabs(r.data.colaboradores || [])).catch(() => {});
  }, [API, carregar]);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const salvar = () => {
    const body = { ...f, id: editId || undefined, valor_bolsa: Number(f.valor_bolsa) || 0, vale_transporte: Number(f.vale_transporte) || 0, origem: 'manual' };
    API.post('/estagio/ficha', body).then(() => { setMsg('✅ Ficha salva'); setF(vazia); setEditId(null); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  };
  const editar = r => { setEditId(r.id); setF({ ...vazia, ...r }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const remover = id => { if (window.confirm('Remover ficha?')) API.delete('/estagio/ficha/' + id).then(carregar); };
  const linkBanco = id => { const url = (typeof window !== 'undefined' ? window.location.origin : '') + '/dados-bancarios.html?f=' + id; try { navigator.clipboard.writeText(url); } catch { /* ignore */ } window.open(url, '_blank'); };
  const nomeDe = (arr, id) => (arr.find(x => x.id === id) || {}).nome || (arr.find(x => x.id === id) || {}).seguradora || '—';
  const nomeAtuacao = id => { const e = empresas.find(x => x.id === id); if (e) return e.nome; const l = lojas.find(x => x.id === id); return l ? l.nome : '—'; };
  const ST = { ativo: '#15803d', inativo: '#6b7280', rescindido: '#b91c1c' };
  const empRegistro = empresas.filter(e => e.tipo === 'registro' || e.tipo === 'ambos');
  const empAtuacao = empresas.filter(e => e.tipo === 'atuacao' || e.tipo === 'ambos');
  const gerarContrato = r => { setGerarFid(r.id); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const nomeGerar = (rows.find(x => x.id === gerarFid) || {}).nome || '';
  return (
    <div>
      {gerarFid && (
        <div style={{ ...s.card, borderTop: '3px solid #185FA5' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={s.cardT}>📄 Documentos do estágio — {nomeGerar}</div>
            <button style={s.btn} onClick={() => setGerarFid(null)}>✖ Fechar</button>
          </div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Escolha em <b>Documento</b> o que vai emitir: contrato (TCE), renovação (aditivo), recibo de pagamento, recibo de recesso, rescisão, relatório, declaração ou o termo de ciência do Guia.</div>
          <Contrato API={API} fichaId={gerarFid} />
        </div>
      )}
      <div style={s.card}>
        <div style={s.cardT}>{editId ? 'Editar ficha' : 'Nova ficha de estagiário'}</div>
        <div style={s.grid}>
          <label style={{ ...s.lab, gridColumn: '1 / -1' }}>Nome<input style={s.inp} value={f.nome} onChange={e => set('nome', e.target.value)} /></label>
          <label style={s.lab}>CPF<input style={s.inp} value={f.cpf} onChange={e => set('cpf', e.target.value)} /></label>
          <label style={s.lab}>RG<input style={s.inp} value={f.rg || ''} onChange={e => set('rg', e.target.value)} /></label>
          <label style={s.lab}>Nascimento<input type="date" style={s.inp} value={f.nascimento || ''} onChange={e => set('nascimento', e.target.value)} /></label>
          <label style={{ ...s.lab, gridColumn: '1 / -1' }}>Endereço<input style={s.inp} value={f.endereco || ''} onChange={e => set('endereco', e.target.value)} placeholder="rua, nº, bairro, cidade/UF, CEP" /></label>
          <label style={s.lab}>Celular<input style={s.inp} value={f.telefone || ''} onChange={e => set('telefone', e.target.value)} /></label>
          <label style={s.lab}>E-mail<input style={s.inp} value={f.email || ''} onChange={e => set('email', e.target.value)} /></label>
          <label style={s.lab}>Instituição de Ensino<select style={s.inp} value={f.escola_id || ''} onChange={e => set('escola_id', e.target.value)}><option value="">—</option>{escolas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
          <label style={s.lab}>Curso<input style={s.inp} value={f.curso || ''} onChange={e => set('curso', e.target.value)} /></label>
          <label style={s.lab}>Série/Período<input style={s.inp} value={f.serie || ''} onChange={e => set('serie', e.target.value)} /></label>
          <label style={s.lab}>Empresa de registro<select style={s.inp} value={f.empresa_registro_id || ''} onChange={e => set('empresa_registro_id', e.target.value)}><option value="">—</option>{lojas.length ? <optgroup label="Lojas">{lojas.map(l => <option key={l.id} value={l.id}>🏪 {l.nome}</option>)}</optgroup> : null}{empRegistro.length ? <optgroup label="Empresas">{empRegistro.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</optgroup> : null}</select></label>
          <label style={s.lab}>Empresa de atuação<select style={s.inp} value={f.empresa_atuacao_id || ''} onChange={e => set('empresa_atuacao_id', e.target.value)}><option value="">—</option>{lojas.length ? <optgroup label="Lojas">{lojas.map(l => <option key={l.id} value={l.id}>🏪 {l.nome}</option>)}</optgroup> : null}{empAtuacao.length ? <optgroup label="Empresas">{empAtuacao.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</optgroup> : null}</select></label>
          <label style={s.lab}>Assina pela empresa<select style={s.inp} value={f.assinante_empresa_id || ''} onChange={e => set('assinante_empresa_id', e.target.value)}><option value="">Sócio padrão da loja</option>{colabs.map(c => <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ' · ' + c.funcao : ''}</option>)}</select></label>
          <label style={s.lab}>Supervisor do estágio<select style={s.inp} value={f.supervisor_id || ''} onChange={e => set('supervisor_id', e.target.value)}><option value="">— (usa o padrão)</option>{colabs.map(c => <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ' · ' + c.funcao : ''}</option>)}</select></label>
          <label style={s.lab}>Valor da bolsa (R$)<input type="number" style={s.inp} value={f.valor_bolsa} onChange={e => set('valor_bolsa', e.target.value)} /></label>
          <label style={s.lab}>Vale transporte (R$)<input type="number" style={s.inp} value={f.vale_transporte} onChange={e => set('vale_transporte', e.target.value)} /></label>
          <label style={s.lab}>Seguro<select style={s.inp} value={f.seguro_id || ''} onChange={e => set('seguro_id', e.target.value)}><option value="">—</option>{seguros.map(x => <option key={x.id} value={x.id}>{x.seguradora} {x.apolice ? '· ' + x.apolice : ''}</option>)}</select></label>
          <label style={{ ...s.lab, gridColumn: '1 / -1' }}>Benefícios<input style={s.inp} value={f.beneficios || ''} onChange={e => set('beneficios', e.target.value)} placeholder="Ex.: vale-refeição, plano…" /></label>
          <label style={{ ...s.lab, gridColumn: '1 / -1' }}>Horário do estágio<input style={s.inp} value={f.horario || ''} onChange={e => set('horario', e.target.value)} placeholder="Ex.: 13h às 18h, de segunda a sábado" /></label>
          <label style={s.lab}>Horas por dia<input style={s.inp} value={f.horas_dia || ''} onChange={e => set('horas_dia', e.target.value)} placeholder="Ex.: 05 (cinco)" /></label>
          <label style={s.lab}>Horas por semana<input style={s.inp} value={f.horas_semana || ''} onChange={e => set('horas_semana', e.target.value)} placeholder="Ex.: 30 (trinta)" /></label>
          <label style={s.lab}>Início<input type="date" style={s.inp} value={f.data_inicio || ''} onChange={e => set('data_inicio', e.target.value)} /></label>
          <label style={s.lab}>Fim (previsto)<input type="date" style={s.inp} value={f.data_fim || ''} onChange={e => set('data_fim', e.target.value)} /></label>
          <label style={s.lab}>Status<select style={s.inp} value={f.status} onChange={e => set('status', e.target.value)}><option value="ativo">Ativo</option><option value="inativo">Inativo</option><option value="rescindido">Rescindido</option></select></label>
        </div>
        <div style={{ ...s.cardT, marginTop: 10, fontSize: 13 }}>Responsável (assina pelo menor)</div>
        <div style={s.grid}>
          <label style={s.lab}>Nome<input style={s.inp} value={f.resp_nome || ''} onChange={e => set('resp_nome', e.target.value)} /></label>
          <label style={s.lab}>CPF<input style={s.inp} value={f.resp_cpf || ''} onChange={e => set('resp_cpf', e.target.value)} /></label>
          <label style={s.lab}>Telefone<input style={s.inp} value={f.resp_telefone || ''} onChange={e => set('resp_telefone', e.target.value)} /></label>
          <label style={s.lab}>Parentesco<input style={s.inp} value={f.resp_parentesco || ''} onChange={e => set('resp_parentesco', e.target.value)} /></label>
        </div>
        <div style={{ ...s.cardT, marginTop: 10, fontSize: 13 }}>Dados bancários (para o pagamento)</div>
        <div style={s.grid}>
          <label style={s.lab}>Banco<input style={s.inp} value={f.banco || ''} onChange={e => set('banco', e.target.value)} /></label>
          <label style={s.lab}>Agência<input style={s.inp} value={f.agencia || ''} onChange={e => set('agencia', e.target.value)} /></label>
          <label style={s.lab}>Conta<input style={s.inp} value={f.conta || ''} onChange={e => set('conta', e.target.value)} /></label>
          <label style={s.lab}>Tipo<select style={s.inp} value={f.tipo_conta || ''} onChange={e => set('tipo_conta', e.target.value)}><option value="">—</option><option>Corrente</option><option>Poupança</option></select></label>
          <label style={s.lab}>Chave PIX<input style={s.inp} value={f.pix || ''} onChange={e => set('pix', e.target.value)} /></label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button style={s.btnP} onClick={salvar}>{editId ? 'Salvar alterações' : 'Cadastrar ficha'}</button>
          {editId && <button style={s.btn} onClick={() => { setF(vazia); setEditId(null); }}>Cancelar</button>}
        </div>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      {/* Documentos do estagiário ficam em Colaboradores (unificado) — removido daqui a pedido do Joe. */}
      <div style={s.card}>
        <div style={s.cardT}>Estagiários ({rows.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Nome', 'Escola', 'Reg. / Atuação', 'Bolsa', 'VT', 'Seguro', 'Dados banc.', 'Status', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={s.td}>{r.nome}<div style={s.leg}>{r.cpf || ''}</div></td>
                  <td style={s.td}>{nomeDe(escolas, r.escola_id)}</td>
                  <td style={s.td}>{nomeAtuacao(r.empresa_registro_id)} / {nomeAtuacao(r.empresa_atuacao_id)}</td>
                  <td style={s.td}>{brl(r.valor_bolsa)}</td>
                  <td style={s.td}>{r.vale_transporte ? brl(r.vale_transporte) : '—'}</td>
                  <td style={s.td}>{r.seguro_id ? nomeDe(seguros, r.seguro_id) : <span style={{ color: '#b91c1c' }}>sem seguro</span>}</td>
                  <td style={s.td}>{r.dados_bancarios_em ? <span style={{ color: '#15803d' }}>{r.banco || 'banco'} {r.conta || ''}</span> : r.pix ? <span style={{ color: '#b45309' }}>PIX (pend.)</span> : <span style={{ color: '#b91c1c' }}>pendente</span>}</td>
                  <td style={s.td}><span style={{ ...s.pill, background: ST[r.status] || '#999' }}>{r.status}</span></td>
                  <td style={s.td}><button style={s.btnMini} onClick={() => gerarContrato(r)}>📄 documentos</button>{' '}<button style={s.btnMini} onClick={() => editar(r)}>editar</button>{' '}<button style={s.btnMini} onClick={() => linkBanco(r.id)}>🔗 banco</button>{' '}<button style={s.btnMini} onClick={() => remover(r.id)}>remover</button></td>
                </tr>
              ))}
              {!rows.length && <tr><td style={s.td} colSpan={8}>Nenhum estagiário cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const fmtD = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';

// ───────── Anexos (documentos) do estagiário ─────────
function Anexos({ API, fichaId }) {
  const [docs, setDocs] = useState([]);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/estagio/documentos/' + fichaId).then(r => setDocs(r.data)).catch(() => {}), [API, fichaId]);
  useEffect(() => { carregar(); }, [carregar]);
  const anexar = e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 8000000) { setMsg('Arquivo muito grande (máx 8MB).'); return; }
    const fr = new FileReader();
    fr.onload = () => API.post('/estagio/documento', { ficha_id: fichaId, nome: file.name, tipo: file.type, dados: fr.result }).then(() => { setMsg('✅ anexado'); carregar(); }).catch(() => setMsg('⚠️ erro'));
    fr.readAsDataURL(file);
  };
  const ver = id => API.get('/estagio/documento/' + id).then(r => { const w = window.open(); if (w) w.document.write('<iframe src="' + r.data.dados + '" style="border:0;width:100%;height:100vh"></iframe>'); }).catch(() => {});
  const remover = id => { if (window.confirm('Remover documento?')) API.delete('/estagio/documento/' + id).then(carregar); };
  return (
    <div style={s.card}>
      <div style={s.cardT}>📎 Documentos do estagiário</div>
      <label style={{ ...s.btn, display: 'inline-block', cursor: 'pointer' }}>📎 Anexar documento<input type="file" style={{ display: 'none' }} onChange={anexar} accept="image/*,application/pdf" /></label>
      {msg && <span style={{ marginLeft: 8, fontSize: 13 }}>{msg}</span>}
      <div style={{ marginTop: 10 }}>
        {docs.map(d => (
          <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
            <span style={{ flex: 1 }}>📄 {d.nome}</span>
            <button style={s.btnMini} onClick={() => ver(d.id)}>ver</button>
            <button style={s.btnMini} onClick={() => remover(d.id)}>remover</button>
          </div>
        ))}
        {!docs.length && <div style={s.leg}>Nenhum documento anexado. (RG, CPF, comprovante de matrícula, etc.)</div>}
      </div>
    </div>
  );
}

// ───────── Banco de Talentos (candidatos do link público + questões) ─────────
export function Talentos({ API }) {
  const [cands, setCands] = useState([]);
  const [qs, setQs] = useState([]);
  const [nova, setNova] = useState({ pergunta: '', a0: '', a1: '', a2: '', a3: '', correta: 0 });
  const [msg, setMsg] = useState('');
  const link = (typeof window !== 'undefined' ? window.location.origin : '') + '/talentos.html';
  const carregar = useCallback(() => {
    API.get('/estagio/candidato').then(r => setCands(r.data.sort((a, b) => (b.criado_em || '').localeCompare(a.criado_em || '')))).catch(() => {});
    API.get('/estagio/questao').then(r => setQs(r.data)).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const contratar = id => { if (window.confirm('Contratar este candidato? Cria a ficha de estagiário.')) API.post(`/estagio/candidato/${id}/contratar`).then(() => { setMsg('✅ Contratado — ficha criada na aba Estagiários.'); carregar(); }); };
  const mudarStatus = (c, status) => API.post('/estagio/candidato', { ...c, status }).then(carregar);
  const removerC = id => { if (window.confirm('Remover candidato?')) API.delete('/estagio/candidato/' + id).then(carregar); };
  const addQ = () => {
    if (!nova.pergunta) return setMsg('⚠️ Escreva a pergunta.');
    const alt = [nova.a0, nova.a1, nova.a2, nova.a3].filter(x => x.trim());
    if (alt.length < 2) return setMsg('⚠️ Pelo menos 2 alternativas.');
    API.post('/estagio/questao', { pergunta: nova.pergunta, alt_json: JSON.stringify(alt), correta: Number(nova.correta) || 0, ativo: 1 }).then(() => { setMsg('✅ Questão adicionada'); setNova({ pergunta: '', a0: '', a1: '', a2: '', a3: '', correta: 0 }); carregar(); });
  };
  const toggleQ = q => API.post('/estagio/questao', { ...q, ativo: q.ativo ? 0 : 1 }).then(carregar);
  const removerQ = id => { if (window.confirm('Remover questão?')) API.delete('/estagio/questao/' + id).then(carregar); };
  const copiar = () => { try { navigator.clipboard.writeText(link); setMsg('🔗 Link copiado!'); } catch { setMsg(link); } };
  const ST = { novo: '#1d4ed8', avaliado: '#b45309', contratado: '#15803d', descartado: '#b91c1c' };
  return (
    <div>
      <div style={{ ...s.card, background: '#ecfdf5' }}>
        <div style={s.cardT}>🔗 Link público de inscrição</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ background: '#fff', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, flex: 1, minWidth: 220 }}>{link}</code>
          <button style={s.btn} onClick={copiar}>Copiar</button>
          <a href={link} target="_blank" rel="noreferrer" style={{ ...s.btnP, textDecoration: 'none' }}>Abrir</a>
        </div>
        <div style={s.leg}>Divulgue esse link para os candidatos. Eles se cadastram e fazem o teste; aparecem aqui embaixo.</div>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      <div style={s.card}>
        <div style={s.cardT}>Candidatos ({cands.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Nome', 'Escola', 'Boletim', 'Freq.', 'Teste', 'Status', 'Ações'].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {cands.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={s.td}>{c.nome}<div style={s.leg}>{c.telefone || c.email || ''}</div></td>
                  <td style={s.td}>{c.escola || '—'}</td><td style={s.td}>{c.boletim ?? '—'}</td>
                  <td style={s.td}>{c.frequencia != null ? c.frequencia + '%' : '—'}</td>
                  <td style={s.td}><b>{c.teste_nota != null ? c.teste_nota + '%' : '—'}</b> <span style={s.leg}>{c.teste_total ? `(${c.teste_total}q)` : ''}</span></td>
                  <td style={s.td}><span style={{ ...s.pill, background: ST[c.status] || '#999' }}>{c.status}</span></td>
                  <td style={s.td}>
                    {c.status !== 'contratado' && <button style={s.btnMini} onClick={() => contratar(c.id)}>contratar</button>}{' '}
                    {c.status !== 'descartado' && <button style={s.btnMini} onClick={() => mudarStatus(c, 'descartado')}>descartar</button>}{' '}
                    <button style={s.btnMini} onClick={() => removerC(c.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {!cands.length && <tr><td style={s.td} colSpan={7}>Nenhum candidato ainda. Divulgue o link acima.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div style={s.card}>
        <div style={s.cardT}>Questões do teste ({qs.length})</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 10 }}>
          <input style={s.inp} placeholder="Pergunta" value={nova.pergunta} onChange={e => setNova({ ...nova, pergunta: e.target.value })} />
          <div style={s.grid}>
            {[0, 1, 2, 3].map(i => <input key={i} style={s.inp} placeholder={'Alternativa ' + (i + 1) + (i === 0 ? '' : ' (opcional)')} value={nova['a' + i]} onChange={e => setNova({ ...nova, ['a' + i]: e.target.value })} />)}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13 }}>Correta: <select value={nova.correta} onChange={e => setNova({ ...nova, correta: e.target.value })} style={{ ...s.inp, width: 120, display: 'inline-block' }}>{[0, 1, 2, 3].map(i => <option key={i} value={i}>Alternativa {i + 1}</option>)}</select></label>
            <button style={s.btnP} onClick={addQ}>Adicionar questão</button>
          </div>
        </div>
        {qs.map((q, i) => {
          let alt = []; try { alt = JSON.parse(q.alt_json || '[]'); } catch { alt = []; }
          return (
            <div key={q.id} style={{ borderTop: '1px solid #eee', padding: '8px 0', opacity: q.ativo ? 1 : 0.5 }}>
              <div style={{ fontWeight: 600 }}>{i + 1}. {q.pergunta} {!q.ativo && <span style={s.leg}>(inativa)</span>}</div>
              <div style={s.leg}>{alt.map((a, j) => (j === q.correta ? '✅ ' : '• ') + a).join('   ')}</div>
              <div style={{ marginTop: 4 }}><button style={s.btnMini} onClick={() => toggleQ(q)}>{q.ativo ? 'desativar' : 'ativar'}</button>{' '}<button style={s.btnMini} onClick={() => removerQ(q.id)}>remover</button></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────── Ranking de colocação ─────────
function Ranking2({ API }) {
  const [pesos, setPesos] = useState({ boletim: 30, frequencia: 20, teste: 50 });
  const [rank, setRank] = useState([]);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/estagio/ranking').then(r => { setRank(r.data.ranking || []); const p = r.data.pesos || {}; setPesos({ boletim: Math.round((p.boletim || 0) * 100), frequencia: Math.round((p.frequencia || 0) * 100), teste: Math.round((p.teste || 0) * 100) }); }).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const salvarPesos = () => {
    const soma = (Number(pesos.boletim) + Number(pesos.frequencia) + Number(pesos.teste)) || 1;
    const frac = { boletim: pesos.boletim / soma, frequencia: pesos.frequencia / soma, teste: pesos.teste / soma };
    API.put('/estagio/config/ranking_pesos', { valor: JSON.stringify(frac) }).then(() => { setMsg('✅ Pesos salvos (normalizados)'); carregar(); });
  };
  return (
    <div>
      <div style={{ ...s.msg, background: '#eff6ff', color: '#1e40af', marginBottom: 12 }}>O ranking classifica os candidatos por uma nota combinando <b>boletim</b>, <b>frequência</b> e <b>teste</b>, com os pesos que você definir.</div>
      <div style={s.card}>
        <div style={s.cardT}>Pesos (%)</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={s.lab}>Boletim<input type="number" style={{ ...s.inp, width: 90 }} value={pesos.boletim} onChange={e => setPesos({ ...pesos, boletim: Number(e.target.value) })} /></label>
          <label style={s.lab}>Frequência<input type="number" style={{ ...s.inp, width: 90 }} value={pesos.frequencia} onChange={e => setPesos({ ...pesos, frequencia: Number(e.target.value) })} /></label>
          <label style={s.lab}>Teste<input type="number" style={{ ...s.inp, width: 90 }} value={pesos.teste} onChange={e => setPesos({ ...pesos, teste: Number(e.target.value) })} /></label>
          <button style={s.btnP} onClick={salvarPesos}>Salvar pesos</button>
        </div>
        <div style={s.leg}>Soma atual: {Number(pesos.boletim) + Number(pesos.frequencia) + Number(pesos.teste)}% (normalizo automaticamente).</div>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      <div style={s.card}>
        <div style={s.cardT}>Classificação ({rank.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['#', 'Candidato', 'Escola', 'Boletim', 'Freq.', 'Teste', 'Nota final'].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {rank.map((c, i) => (
                <tr key={c.id} style={{ borderTop: '1px solid #eee', background: i < 3 ? '#f0fdf4' : '#fff' }}>
                  <td style={s.td}><b>{i + 1}º</b></td><td style={s.td}>{c.nome}</td><td style={s.td}>{c.escola || '—'}</td>
                  <td style={s.td}>{c.boletim ?? '—'}</td><td style={s.td}>{c.frequencia != null ? c.frequencia + '%' : '—'}</td><td style={s.td}>{c.teste_nota != null ? c.teste_nota + '%' : '—'}</td>
                  <td style={{ ...s.td, fontWeight: 700, color: '#0f766e' }}>{c.score}</td>
                </tr>
              ))}
              {!rank.length && <tr><td style={s.td} colSpan={7}>Sem candidatos para ranquear.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Impressão formatada do contrato: transforma o texto (modelo preenchido) em um documento A4
// com título, blocos de seção destacados, cláusulas em negrito e linhas de assinatura.
// O modelo continua sendo TEXTO editável — a formatação é aplicada só na hora de imprimir/gerar PDF.
// renderiza um documento (contrato ou termo de ciência) em HTML formatado: título, quadros de seção e blocos de assinatura
function docHtml(texto) {
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const linhas = String(texto || '').split('\n');
  const SECOES = ['INSTITUIÇÃO DE ENSINO', 'UNIDADE CONCEDENTE', 'ESTAGIÁRIO'];
  const ROTULOS = /^(CONCEDENTE|SUPERVISOR DO ESTÁGIO|INSTITUIÇÃO DE ENSINO|ESTAGIÁRIO|RESPONSÁVEL LEGAL)\b/;
  const out = []; let i = 0, assin = false, blk = null, sec = null;
  const flush = () => { if (blk) { out.push('<div class="assinblk">' + blk.join('') + '</div>'); blk = null; } };
  const flushSec = () => { if (sec) { out.push('<div class="secbox">' + sec.join('') + '</div>'); sec = null; } };
  while (i < linhas.length && !linhas[i].trim()) i++;
  const tit = []; while (i < linhas.length && linhas[i].trim()) { tit.push(linhas[i]); i++; }
  out.push('<h1>' + tit.map(esc).join('<br>') + '</h1>');
  for (; i < linhas.length; i++) {
    const t = linhas[i].trim();
    if (/^_{5,}/.test(t)) { flushSec(); flush(); assin = true; blk = ['<div class="assin"></div>']; continue; }
    if (assin && blk) { if (t) blk.push('<p class="sig' + (ROTULOS.test(t) ? ' b' : '') + '">' + esc(t) + '</p>'); continue; }
    if (SECOES.includes(t.toUpperCase())) { flushSec(); sec = ['<div class="sec">' + esc(t) + '</div>']; continue; }
    // dentro de um quadro de seção: acumula até começar o corpo (cláusulas / "As partes")
    const corpo = /^CLÁUSULA/.test(t) || /^As partes/i.test(t);
    if (sec && !corpo) { if (t) sec.push('<p>' + esc(t) + '</p>'); else sec.push('<div class="spx"></div>'); continue; }
    flushSec();
    if (!t) { out.push('<div class="sp"></div>'); continue; }
    if (/^CLÁUSULA/.test(t)) { out.push('<p class="cl">' + esc(t) + '</p>'); continue; }
    out.push('<p>' + esc(t) + '</p>');
  }
  flushSec(); flush();
  return out.join('');
}
function contratoHtml(texto, ciencia) {
  // o termo de ciência do Guia (quando houver) sai em página nova, junto com o contrato
  const corpo = docHtml(texto) + (ciencia ? '<div class="pb"></div>' + docHtml(ciencia) : '');
  return '<!doctype html><html><head><meta charset="utf-8"><title>Contrato de Estágio</title><style>'
    + '@page{size:A4;margin:2cm 2.2cm}body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;line-height:1.5;color:#111}'
    + 'h1{text-align:center;font-size:13pt;font-weight:800;text-transform:uppercase;margin:0 0 14px;padding-bottom:10px;border-bottom:2px solid #111;letter-spacing:.3px}'
    + '.secbox{border:1px solid #334155;border-radius:6px;margin:12px 0;overflow:hidden;break-inside:avoid;page-break-inside:avoid}'
    + '.secbox .sec{margin:0;border-bottom:1px solid #334155}'
    + '.secbox p{margin:4px 11px}.secbox .spx{height:3px}'
    + '.sec{font-weight:800;background:#eef2f7;padding:5px 9px;text-transform:uppercase;letter-spacing:.3px}'
    + 'p{margin:5px 0;text-align:justify}p.cl{font-weight:700;margin:11px 0 4px}.sp{height:7px}'
    + '.assinblk{break-inside:avoid;page-break-inside:avoid;margin-top:28px}'
    + '.assin{border-top:1px solid #111;width:60%;margin:0 auto 3px}p.sig{text-align:center;margin:1px 0}p.sig.b{font-weight:700}'
    + '.pb{break-before:page;page-break-before:always}'
    + '</style></head><body>' + corpo + '</body></html>';
}

// ───────── Documentos: SÓ os MODELOS (templates) ─────────
// A aba "Documentos" edita os modelos de contrato/aditivo/recibos/etc. A geração por
// estagiário (preencher a ficha, imprimir, controle de assinatura) fica na ficha do
// próprio colaborador (Cadastros › Colaborador › 🎓 Contrato de estágio). Pedido do Joe.
const PLACEHOLDERS_AJUDA = 'nome, cpf, rg, nascimento, endereco, telefone, email, escola, escola_cnpj, escola_endereco, escola_representante, empresa_registro, empresa_registro_cnpj, empresa_registro_endereco, empresa_atuacao_endereco, atividade, horario, horas_dia, horas_semana, horas, valor_bolsa, vale_transporte, beneficios, seguro, competencia, resp_nome, resp_cpf, resp_parentesco, data_inicio, data_fim, data_rescisao, obs_rescisao, socio_nome, socio_cpf, supervisor, supervisor_nome, supervisor_cargo, supervisor_email, cidade_data, assinatura_responsavel';
function ModelosDoc({ API }) {
  const [modelos, setModelos] = useState([
    { chave: 'modelo_contrato_18', nome: 'Contrato de Estágio — TCE (acima de 18 anos)' },
    { chave: 'modelo_contrato_16_17', nome: 'Contrato de Estágio — TCE (16 a 17 anos)' },
    { chave: 'modelo_aditivo', nome: 'Renovação — Termo Aditivo ao TCE' },
    { chave: 'modelo_ciencia_guia', nome: 'Termo de Ciência do Guia do Colaborador' },
  ]);
  const [chave, setChave] = useState('modelo_contrato_18');
  const [modelo, setModelo] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    API.get('/estagio/config/modelos_doc').then(r => {
      try {
        const l = JSON.parse(r.data.valor || '[]');
        // a ciência do Guia não está na lista do seletor (sai junto do contrato), mas é editável aqui
        if (l.length) setModelos([...l, { chave: 'modelo_ciencia_guia', nome: 'Termo de Ciência do Guia do Colaborador' }]);
      } catch { /* usa default */ }
    }).catch(() => {});
  }, [API]);
  useEffect(() => { API.get('/estagio/config/' + chave).then(r => setModelo(r.data.valor || '')).catch(() => setModelo('')); }, [API, chave]);
  const salvar = () => API.put('/estagio/config/' + chave, { valor: modelo }).then(() => setMsg('✅ Modelo salvo')).catch(() => setMsg('⚠️ erro ao salvar'));
  return (
    <div>
      <div style={{ ...s.msg, background: '#eff6ff', color: '#1e40af', marginBottom: 12 }}>
        Aqui você edita os <b>modelos</b> dos documentos (contrato, renovação, recibos, declaração…). Para <b>gerar e imprimir</b> o contrato de um estagiário, abra <b>Colaboradores › a pessoa › 🎓 Contrato de estágio</b> — lá os campos são preenchidos pela ficha. O <b>Termo de Ciência do Guia</b> e o <b>📘 Guia do Colaborador</b> saem automaticamente junto do contrato.
      </div>
      <div style={s.card}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={s.lab}>Documento<select style={{ ...s.inp, minWidth: 320 }} value={chave} onChange={e => { setChave(e.target.value); setMsg(''); }}>{modelos.map(m => <option key={m.chave} value={m.chave}>{m.nome}</option>)}</select></label>
          <button style={s.btnP} onClick={salvar}>💾 Salvar modelo</button>
          <button style={s.btn} onClick={() => window.open('/guia-colaborador.pdf', '_blank')} title="Guia do Colaborador (Código de Conduta + Regimento) — sai junto do contrato pro estagiário assinar">📘 Ver Guia do Colaborador</button>
        </div>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      <div style={s.card}>
        <div style={s.cardT}>Texto do modelo <span style={{ fontWeight: 400, color: '#64748b' }}>— use {'{{campo}}'}: {PLACEHOLDERS_AJUDA}</span></div>
        <textarea style={{ ...s.inp, width: '100%', minHeight: 420, fontFamily: 'monospace', fontSize: 12 }} value={modelo} onChange={e => setModelo(e.target.value)} />
      </div>
    </div>
  );
}

// ───────── Contrato (gera pelo modelo, preenchendo a ficha) ─────────
// Preenche pela ficha, imprime e controla a assinatura. A edição dos modelos fica na aba
// Documentos (ModelosDoc). Fixa a ficha por `fichaId` (aba Estagiários) ou por `colaboradorId`
// (ficha do colaborador); sem nenhum dos dois, mostra o seletor de estagiário.
export function Contrato({ API, colaboradorId, fichaId }) {
  const [fichas, setFichas] = useState([]);
  const [esc, setEsc] = useState([]); const [emp, setEmp] = useState([]); const [seg, setSeg] = useState([]); const [lojas, setLojas] = useState([]); const [colabs, setColabs] = useState([]);
  const [modelo, setModelo] = useState('');
  const [modelos, setModelos] = useState([{ chave: 'modelo_contrato_18', nome: 'Contrato (acima de 18 anos)' }, { chave: 'modelo_contrato_16_17', nome: 'Contrato (16 a 17 anos)' }]);
  const [chave, setChave] = useState('modelo_contrato_18');
  const [fid, setFid] = useState('');
  const [msg, setMsg] = useState('');
  const [sup, setSup] = useState({ nome: '', cargo: '', email: '' }); // supervisor do estágio (config)
  const [assinanteId, setAssinanteId] = useState(''); // colaborador que assina pela empresa ('' = sócio padrão da loja)
  const [docSt, setDocSt] = useState('pendente'); // controle de assinatura do documento
  const [ciencia, setCiencia] = useState(''); // termo de ciência do Guia do Colaborador (sai junto com o contrato)
  useEffect(() => {
    Promise.all(['supervisor_nome', 'supervisor_cargo', 'supervisor_email'].map(k => API.get('/estagio/config/' + k).then(r => r.data.valor || '').catch(() => '')))
      .then(([nome, cargo, email]) => setSup({ nome, cargo, email }));
    API.get('/estagio/ficha').then(r => setFichas(r.data)).catch(() => {});
    API.get('/estagio/escola').then(r => setEsc(r.data)).catch(() => {});
    API.get('/estagio/empresa').then(r => setEmp(r.data)).catch(() => {});
    API.get('/estagio/seguro').then(r => setSeg(r.data)).catch(() => {});
    API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {});
    API.get('/colaboradores').then(r => setColabs(r.data.colaboradores || [])).catch(() => {});
    API.get('/estagio/config/modelos_doc').then(r => { try { const l = JSON.parse(r.data.valor || '[]'); if (l.length) setModelos(l); } catch { /* usa default */ } }).catch(() => {});
    API.get('/estagio/config/modelo_ciencia_guia').then(r => setCiencia(r.data.valor || '')).catch(() => {});
  }, [API]);
  useEffect(() => { API.get('/estagio/config/' + chave).then(r => setModelo(r.data.valor || '')).catch(() => {}); }, [API, chave]);
  // Quando aberto pela ficha do colaborador, seleciona a ficha de estágio dele automaticamente.
  useEffect(() => { if (fichaId) { setFid(fichaId); return; } if (colaboradorId && fichas.length) { const f = fichas.find(x => x.colaborador_id === colaboradorId); if (f) setFid(f.id); } }, [fichaId, colaboradorId, fichas]);
  const nome = (arr, id, campo = 'nome') => (arr.find(x => x.id === id) || {})[campo] || '';
  // Para loja, o nome que vai no contrato é a RAZÃO SOCIAL (cai pro nome/apelido se não tiver).
  const nomeAtu = id => { const e = emp.find(x => x.id === id); if (e) return e.nome || ''; const l = lojas.find(x => x.id === id); return l ? (l.razao_social || l.nome || '') : ''; };
  const campoEmp = (id, campo) => {
    const e = emp.find(x => x.id === id); if (e) return e[campo] || '';
    const l = lojas.find(x => x.id === id); if (!l) return '';
    if (campo === 'endereco') return [l.endereco, l.cidade].filter(Boolean).join(', ');
    if (campo === 'cnpj') return l.cnpj || '';
    return l[campo] || '';
  };
  // Sócio que assina: vem da loja (socio_assina_id) escolhida como registro (ou atuação).
  const socioDaLoja = (...ids) => {
    for (const id of ids) {
      const l = lojas.find(x => x.id === id);
      if (l && l.socio_assina_id) { const c = colabs.find(x => x.id === l.socio_assina_id); if (c) return c; }
    }
    return null;
  };
  // monta o dicionário de {{campos}} da ficha selecionada (usado pelo contrato e pelo termo de ciência do Guia)
  const montarMap = () => {
    const f = fichas.find(x => x.id === fid); if (!f) return null;
    const sg = seg.find(x => x.id === f.seguro_id);
    const socio = socioDaLoja(f.empresa_registro_id, f.empresa_atuacao_id);
    const assina = assinanteId ? colabs.find(x => x.id === assinanteId) : null; // quem foi escolhido p/ assinar pela empresa
    const superv = f.supervisor_id ? colabs.find(x => x.id === f.supervisor_id) : null; // supervisor vinculado (colaborador)
    const seguroTxt = sg ? `${sg.seguradora}${sg.apolice ? ' — apólice ' + sg.apolice : ''}${sg.vigencia_fim ? ' (vigência até ' + fmtD(sg.vigencia_fim) + ')' : ''}` : '(seguro não vinculado)';
    const map = {
      nome: f.nome || '', cpf: f.cpf || '', rg: f.rg || '', nascimento: fmtD(f.nascimento), endereco: f.endereco || '', telefone: f.telefone || '', email: f.email || '',
      escola: nome(esc, f.escola_id), curso: f.curso || '', serie: f.serie || '',
      empresa_atuacao: nomeAtu(f.empresa_atuacao_id), empresa_registro: nomeAtu(f.empresa_registro_id), loja: f.loja || '',
      empresa_registro_cnpj: campoEmp(f.empresa_registro_id, 'cnpj'), empresa_registro_endereco: campoEmp(f.empresa_registro_id, 'endereco'),
      empresa_atuacao_cnpj: campoEmp(f.empresa_atuacao_id, 'cnpj'), empresa_atuacao_endereco: campoEmp(f.empresa_atuacao_id, 'endereco'),
      escola_cnpj: nome(esc, f.escola_id, 'cnpj'), escola_endereco: nome(esc, f.escola_id, 'endereco'), escola_representante: nome(esc, f.escola_id, 'representante') || '(representante da escola)',
      atividade: f.curso || 'Auxiliar no Atendimento ao Cliente',
      horario: f.horario || '(horário a combinar)', horas_dia: f.horas_dia || '', horas_semana: f.horas_semana || '',
      valor_bolsa: brl(f.valor_bolsa), vale_transporte: brl(f.vale_transporte), beneficios: f.beneficios || '—',
      seguro: seguroTxt, resp_nome: f.resp_nome || '', resp_cpf: f.resp_cpf || '', resp_parentesco: f.resp_parentesco || '',
      data_inicio: fmtD(f.data_inicio), data_fim: fmtD(f.data_fim),
      socio_nome: assina ? assina.nome : (socio ? socio.nome : ''),
      socio_cpf: assina ? (assina.cpf || '') : (socio ? (socio.cpf || '') : ''),
      supervisor_nome: superv ? superv.nome : (sup.nome || '(supervisor)'), supervisor_cargo: superv ? (superv.funcao || '') : (sup.cargo || ''), supervisor_email: superv ? (superv.email || '') : (sup.email || ''),
      // supervisor (nome puro) — usado no relatório e na declaração
      supervisor: superv ? superv.nome : (sup.nome || '(supervisor)'),
      // carga horária por extenso — usada no relatório
      horas: [f.horas_dia && (f.horas_dia + ' horas/dia'), f.horas_semana && (f.horas_semana + ' horas/semana')].filter(Boolean).join(' · ') || (f.horario || ''),
      // competência do recibo: mês/ano corrente (o recibo com valores reais do mês sai na aba Pagamento)
      competencia: (() => { const d = new Date(); return String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); })(),
      // rescisão: por padrão usa o fim previsto do estágio; o RH ajusta o texto se precisar
      data_rescisao: fmtD(f.data_fim), obs_rescisao: '',
      // bloco de assinatura do responsável — só aparece quando a ficha tem responsável (menor de 18)
      assinatura_responsavel: f.resp_nome ? ('\n_______________________________________\nRESPONSÁVEL LEGAL (assina pelo menor)\n' + f.resp_nome + (f.resp_cpf ? '    CPF: ' + f.resp_cpf : '') + (f.resp_parentesco ? '    (' + f.resp_parentesco + ')' : '')) : '',
      cidade_data: 'Entre Rios, ' + new Date().toLocaleDateString('pt-BR'),
    };
    return map;
  };
  const aplicar = tpl => { const map = montarMap(); return map ? tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (map[k] != null ? map[k] : '')) : ''; };
  const preencher = () => aplicar(modelo);
  const texto = fid ? preencher() : '';
  // o termo de ciência do Guia só acompanha o CONTRATO/aditivo — não vai em recibo, rescisão, declaração, etc.
  const ehContrato = ['modelo_contrato_18', 'modelo_contrato_16_17', 'modelo_aditivo'].includes(chave);
  const cienciaTxt = fid && ciencia && ehContrato ? aplicar(ciencia) : ''; // termo de ciência do Guia, já preenchido
  const imprimir = () => {
    const w = window.open('', '_blank');
    // o contrato e o termo de ciência do Guia saem juntos (o Guia é mencionado em cláusula e assinado pelo estagiário)
    w.document.write(contratoHtml(texto, cienciaTxt));
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  // controle de assinatura do documento (onde ele está)
  const DOC_LABELS = [['pendente', '📝 Pendente'], ['enviado_loja', '📦 Enviado pra loja'], ['com_estagiario', '🧑‍🎓 Com o estagiário'], ['assinado', '✅ Assinado (devolvido)']];
  useEffect(() => { const fx = fichas.find(x => x.id === fid) || {}; setDocSt(fx.doc_status || 'pendente'); setAssinanteId(fx.assinante_empresa_id || ''); }, [fid, fichas]);
  const mudarStatus = (st) => API.put('/estagio/ficha/' + fid + '/doc-status', { status: st }).then(() => { setDocSt(st); setFichas(fs => fs.map(x => x.id === fid ? { ...x, doc_status: st } : x)); }).catch(() => {});
  return (
    <div>
      <div style={s.card}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={s.lab}>Documento<select style={{ ...s.inp, minWidth: 260 }} value={chave} onChange={e => setChave(e.target.value)}>{modelos.map(m => <option key={m.chave} value={m.chave}>{m.nome}</option>)}</select></label>
          {!colaboradorId && !fichaId && <label style={s.lab}>Estagiário<select style={{ ...s.inp, minWidth: 220 }} value={fid} onChange={e => setFid(e.target.value)}><option value="">— selecione —</option>{fichas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>}
          <label style={s.lab}>Assina pela empresa<select style={{ ...s.inp, minWidth: 220 }} value={assinanteId} onChange={e => setAssinanteId(e.target.value)}><option value="">Sócio padrão da loja</option>{colabs.map(c => <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ' · ' + c.funcao : ''}</option>)}</select></label>
          {colaboradorId && !fid && <span style={{ ...s.lab, color: '#b45309' }}>Sem ficha de estágio vinculada a este colaborador ainda.</span>}
          {fid && <button style={s.btnP} onClick={imprimir}>🖨️ Imprimir / PDF</button>}
          <button style={s.btn} onClick={() => window.open('/guia-colaborador.pdf', '_blank')} title="Guia do Colaborador (Código de Conduta + Regimento) — vai junto do contrato pro estagiário assinar">📘 Guia do Colaborador</button>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>Para alterar o texto do modelo, use <b>Estágios › 📄 Documentos</b>.</div>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      {fid && <div style={s.card}>
        <div style={s.cardT}>Controle de assinatura</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DOC_LABELS.map(([v, l]) => <button key={v} onClick={() => mudarStatus(v)} style={docSt === v ? s.btnP : s.btn}>{l}</button>)}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Status atual: <b>{(DOC_LABELS.find(x => x[0] === docSt) || [])[1] || docSt}</b> — acompanhe o contrato do envio até voltar assinado.</div>
      </div>}
      {fid && <div style={s.card}><div style={s.cardT}>Prévia do contrato</div><div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 }}>{texto}</div></div>}
      {fid && cienciaTxt && <div style={s.card}><div style={s.cardT}>Prévia — Termo de ciência do Guia do Colaborador <span style={{ fontWeight: 400, color: '#64748b' }}>(sai em página própria, junto do contrato)</span></div><div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 }}>{cienciaTxt}</div></div>}
    </div>
  );
}

// ───────── Avaliação mensal ─────────
function Avaliacoes({ API }) {
  const [fichas, setFichas] = useState([]);
  const [fid, setFid] = useState('');
  const [lista, setLista] = useState([]);
  const [indice, setIndice] = useState(null);
  const hoje = new Date().toISOString().slice(0, 7);
  const [f, setF] = useState({ competencia: hoje, nota: '', supervisor: '', comentario: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => { API.get('/estagio/ficha').then(r => setFichas(r.data)).catch(() => {}); }, [API]);
  const carregar = useCallback((id) => {
    if (!id) { setLista([]); setIndice(null); return; }
    API.get('/estagio/avaliacao').then(r => setLista(r.data.filter(a => a.ficha_id === id).sort((a, b) => (b.competencia || '').localeCompare(a.competencia || '')))).catch(() => {});
    API.get('/estagio/indice/' + id).then(r => setIndice(r.data)).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(fid); }, [fid, carregar]);
  const salvar = () => {
    if (!fid) return setMsg('⚠️ Escolha o estagiário.');
    const nota = Math.max(0, Math.min(100, Number(f.nota) || 0));
    API.post('/estagio/avaliacao', { id: fid + '__' + f.competencia, ficha_id: fid, competencia: f.competencia, nota, supervisor: f.supervisor, comentario: f.comentario })
      .then(() => { setMsg('✅ Avaliação salva'); setF({ ...f, nota: '', comentario: '' }); carregar(fid); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  };
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <div>
      <div style={{ ...s.msg, background: '#eff6ff', color: '#1e40af', marginBottom: 12 }}>O estagiário é avaliado todo mês (0 a 100) e a média vira o <b>índice de aprovação</b> usado na renovação. ✅ <b>Integrado ao checklist do gerente:</b> quando o gerente/supervisor avalia o estagiário na avaliação mensal da função, a nota entra aqui automaticamente (competência = mês/ano, uma por mês). O lançamento manual abaixo continua disponível e sobrescreve a do mês.</div>
      <div style={s.card}>
        <label style={s.lab}>Estagiário<select style={{ ...s.inp, maxWidth: 320 }} value={fid} onChange={e => setFid(e.target.value)}><option value="">—</option>{fichas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
        {fid && indice && <div style={{ marginTop: 10, fontSize: 14 }}>Índice de aprovação: <b style={{ color: indice.indice >= 90 ? '#15803d' : indice.indice != null ? '#b45309' : '#64748b', fontSize: 20 }}>{indice.indice != null ? indice.indice + '%' : '—'}</b> <span style={s.leg}>({indice.avaliacoes} avaliação(ões))</span></div>}
      </div>
      {fid && <>
        <div style={s.card}>
          <div style={s.cardT}>Nova avaliação</div>
          <div style={s.grid}>
            <label style={s.lab}>Competência<input type="month" style={s.inp} value={f.competencia} onChange={e => set('competencia', e.target.value)} /></label>
            <label style={s.lab}>Nota (0–100)<input type="number" min="0" max="100" style={s.inp} value={f.nota} onChange={e => set('nota', e.target.value)} /></label>
            <label style={s.lab}>Supervisor<input style={s.inp} value={f.supervisor} onChange={e => set('supervisor', e.target.value)} /></label>
            <label style={{ ...s.lab, gridColumn: '1 / -1' }}>Comentário<input style={s.inp} value={f.comentario} onChange={e => set('comentario', e.target.value)} /></label>
          </div>
          <button style={{ ...s.btnP, marginTop: 10 }} onClick={salvar}>Salvar avaliação</button>
          {msg && <div style={s.msg}>{msg}</div>}
        </div>
        <div style={s.card}>
          <div style={s.cardT}>Avaliações ({lista.length})</div>
          <table style={s.tbl}><thead><tr>{['Competência', 'Nota', 'Supervisor', 'Comentário'].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>{lista.map(a => <tr key={a.id} style={{ borderTop: '1px solid #eee' }}><td style={s.td}>{a.competencia}</td><td style={s.td}><b>{a.nota}</b></td><td style={s.td}>{a.supervisor || '—'}</td><td style={s.td}>{a.comentario || '—'}</td></tr>)}
              {!lista.length && <tr><td style={s.td} colSpan={4}>Sem avaliações.</td></tr>}</tbody></table>
        </div>
      </>}
    </div>
  );
}

// ───────── Renovação (índice → gerente/RH) ─────────
function Renovacao({ API }) {
  const [fichas, setFichas] = useState([]);
  const [rows, setRows] = useState([]);
  const [fid, setFid] = useState('');
  const [ini, setIni] = useState(''); const [fim, setFim] = useState(''); // novo período a renovar
  const [ed, setEd] = useState({}); // edição inline do período por linha {id:{ini,fim}}
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/estagio/renovacoes').then(r => setRows(r.data)).catch(() => {}), [API]);
  useEffect(() => { API.get('/estagio/ficha').then(r => setFichas(r.data.filter(f => f.status === 'ativo'))).catch(() => {}); carregar(); }, [API, carregar]);
  const abrir = () => {
    if (!fid) return setMsg('⚠️ Escolha o estagiário.');
    if (!ini || !fim) return setMsg('⚠️ Informe o novo período (início e fim) que será renovado.');
    API.post('/estagio/renovacao/abrir/' + fid, { periodo_inicio: ini, periodo_fim: fim })
      .then(r => { setMsg(`Índice ${r.data.indice ?? '—'}% → ${r.data.status === 'pendente_gerente' ? 'direto ao gerente' : 'RH avalia primeiro'}`); setFid(''); setIni(''); setFim(''); carregar(); })
      .catch(() => setMsg('⚠️ erro ao abrir renovação'));
  };
  const salvarPeriodo = (id) => { const e = ed[id] || {}; API.put(`/estagio/renovacao/${id}/periodo`, { periodo_inicio: e.ini, periodo_fim: e.fim }).then(() => { setEd(p => { const n = { ...p }; delete n[id]; return n; }); carregar(); }).catch(() => setMsg('⚠️ erro')); };
  const rhOk = (id) => { const p = window.prompt('Parecer do RH:') || ''; API.post(`/estagio/renovacao/${id}/rh`, { parecer: p }).then(carregar); };
  const decidir = (id, status) => API.post(`/estagio/renovacao/${id}/decidir`, { status }).then(() => { if (status === 'aprovada') setMsg('✅ Aprovada — a vigência da ficha virou o novo período. Gere o Termo Aditivo na ficha do colaborador.'); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'erro')));
  const ST = { pendente_rh: ['#b45309', 'RH avaliando'], pendente_gerente: ['#1d4ed8', 'Com o gerente'], aprovada: ['#15803d', 'Aprovada'], recusada: ['#b91c1c', 'Recusada'] };
  const per = r => (r.periodo_inicio || r.periodo_fim) ? `${r.periodo_inicio ? fmtD(r.periodo_inicio) : '?'} → ${r.periodo_fim ? fmtD(r.periodo_fim) : '?'}` : '—';
  return (
    <div>
      <div style={{ ...s.msg, background: '#eff6ff', color: '#1e40af', marginBottom: 12 }}>Perto do fim do contrato, abra a renovação e informe o <b>novo período</b> do estágio: <b>índice ≥ 90%</b> vai direto pro <b>gerente</b> decidir; <b>abaixo de 90%</b> o <b>RH avalia primeiro</b> e depois encaminha. Ao <b>aprovar</b>, a vigência da ficha passa a ser o novo período e você gera o <b>Termo Aditivo</b> na ficha do colaborador (Colaboradores › 🎓 Contrato de estágio, modelo "Renovação — Termo Aditivo").</div>
      <div style={s.card}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={s.lab}>Abrir renovação para<select style={{ ...s.inp, minWidth: 240 }} value={fid} onChange={e => setFid(e.target.value)}><option value="">— estagiário —</option>{fichas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
          <label style={s.lab}>Novo início<input type="date" style={s.inp} value={ini} onChange={e => setIni(e.target.value)} /></label>
          <label style={s.lab}>Novo fim<input type="date" style={s.inp} value={fim} onChange={e => setFim(e.target.value)} /></label>
          <button style={s.btnP} onClick={abrir}>Abrir renovação</button>
        </div>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      <div style={s.card}>
        <div style={s.cardT}>Renovações ({rows.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Estagiário', 'Índice', 'Novo período', 'Status', 'Parecer RH', 'Ação'].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => {
                const editavel = r.status === 'pendente_rh' || r.status === 'pendente_gerente';
                const e = ed[r.id];
                return (
                <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={s.td}>{r.ficha_nome}</td>
                  <td style={s.td}><b style={{ color: r.indice >= 90 ? '#15803d' : '#b45309' }}>{r.indice != null ? r.indice + '%' : '—'}</b></td>
                  <td style={s.td}>
                    {e ? (
                      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        <input type="date" style={{ ...s.inp, padding: '2px 4px' }} value={e.ini || ''} onChange={ev => setEd(p => ({ ...p, [r.id]: { ...e, ini: ev.target.value } }))} />
                        <input type="date" style={{ ...s.inp, padding: '2px 4px' }} value={e.fim || ''} onChange={ev => setEd(p => ({ ...p, [r.id]: { ...e, fim: ev.target.value } }))} />
                        <button style={s.btnMini} onClick={() => salvarPeriodo(r.id)}>ok</button>
                      </span>
                    ) : (
                      <span>{per(r)}{editavel && <button style={{ ...s.btnMini, marginLeft: 6 }} onClick={() => setEd(p => ({ ...p, [r.id]: { ini: r.periodo_inicio || '', fim: r.periodo_fim || '' } }))}>✏️</button>}</span>
                    )}
                  </td>
                  <td style={s.td}><span style={{ ...s.pill, background: (ST[r.status] || ['#999'])[0] }}>{(ST[r.status] || ['', r.status])[1]}</span></td>
                  <td style={s.td}>{r.rh_parecer || '—'}</td>
                  <td style={s.td}>
                    {r.status === 'pendente_rh' && <button style={s.btnMini} onClick={() => rhOk(r.id)}>RH → gerente</button>}
                    {r.status === 'pendente_gerente' && <><button style={s.btnMini} onClick={() => decidir(r.id, 'aprovada')}>aprovar</button>{' '}<button style={s.btnMini} onClick={() => decidir(r.id, 'recusada')}>recusar</button></>}
                    {r.status === 'aprovada' && <span style={s.leg}>📄 gere o aditivo na ficha do colaborador</span>}
                  </td>
                </tr>
                );
              })}
              {!rows.length && <tr><td style={s.td} colSpan={6}>Nenhuma renovação aberta.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ───────── Fechamento mensal / Pagamento ─────────
function ResumoMes({ r, comp }) {
  const cards = [
    ['Total do mês', brl(r.total), '#0f766e'],
    ['Recorrente (só BOLSA)', brl(r.recorrente_bolsa), '#15803d'],
    ['Eventual (rescisão + férias)', brl(r.eventual), '#64748b'],
    ['A pagar sem conta cadastrada', brl(r.a_pagar_sem_conta), '#b91c1c'],
    ['A pagar por PIX', brl(r.a_pagar_pix), '#b45309'],
    ['Lançamentos com valor', r.lancamentos_com_valor, '#0f172a'],
    ['Nomes na lista / ativos hoje', `${r.nomes_na_lista} / ${r.ativos_hoje}`, '#0f172a'],
    ['Inativos ainda na lista', r.inativos_na_lista, r.inativos_na_lista ? '#b91c1c' : '#64748b'],
  ];
  const Tab = ({ titulo, dados, col1 }) => (
    <div style={{ flex: '1 1 240px', minWidth: 230 }}>
      <div style={{ fontWeight: 700, fontSize: 13, margin: '6px 0' }}>{titulo}</div>
      <table style={{ ...s.tbl, fontSize: 12 }}>
        <thead><tr>{[col1, 'QTD', 'VALOR'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
        <tbody>{dados.map((d, i) => <tr key={i}><td style={s.td}>{d.chave}</td><td style={s.td}>{d.qtd}</td><td style={s.td}>{brl(d.valor)}</td></tr>)}
          {!dados.length && <tr><td style={s.td} colSpan={3}>—</td></tr>}</tbody>
      </table>
    </div>
  );
  return (
    <div style={s.card}>
      <div style={s.cardT}>📊 Resumo de {comp}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
        {cards.map(([l, v, c], i) => <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px' }}><div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: .5 }}>{l}</div><div style={{ fontSize: 19, fontWeight: 700, color: c, marginTop: 3 }}>{v}</div></div>)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
        <Tab titulo="Por tipo" dados={r.por_tipo} col1="TIPO" />
        <Tab titulo="Por conta cadastrada" dados={r.por_conta} col1="CONTA" />
        <Tab titulo="Por banco" dados={r.por_banco} col1="BANCO" />
        <Tab titulo="Por loja" dados={r.por_loja} col1="LOJA" />
      </div>
    </div>
  );
}

function Pagamento({ API }) {
  const hoje = new Date().toISOString().slice(0, 7);
  const [comp, setComp] = useState(hoje);
  const [rows, setRows] = useState([]);
  const [ed, setEd] = useState({});
  const [msg, setMsg] = useState('');
  const [resumo, setResumo] = useState(null);
  const carregar = useCallback(() => {
    API.get('/estagio/pagamentos?competencia=' + comp).then(r => { setRows(r.data); setEd({}); }).catch(() => {});
    API.get('/estagio/pagamento/resumo/' + comp).then(r => setResumo(r.data)).catch(() => setResumo(null));
  }, [API, comp]);
  useEffect(() => { carregar(); }, [carregar]);
  const gerar = () => API.post('/estagio/pagamento/gerar/' + comp).then(r => { setMsg(`✅ ${r.data.gerados} lançamento(s) gerado(s).`); carregar(); }).catch(() => setMsg('⚠️ erro'));
  const liberar = () => { if (window.confirm('Liberar a lista do mês para pagamento?')) API.post('/estagio/pagamento/liberar/' + comp).then(r => { setMsg(`✅ ${r.data.liberados} liberado(s).`); carregar(); }); };
  // Planilha (CSV/Excel) de todos os pagamentos do mês, pro Financeiro executar: quem, quanto e como pagar.
  const planilhaFinanceiro = () => {
    if (!rows.length) return setMsg('⚠️ Nada gerado. Clique em "Gerar folha do mês" primeiro.');
    const forma = p => p.dados_bancarios_em ? 'Conta bancária' : p.pix ? 'PIX' : 'Sem dados';
    const situacao = p => p.fin_ok ? 'Pago' : p.tes_ok ? 'Liberado (aguarda Financeiro)' : p.rh_ok ? 'Aguarda Tesouraria' : 'Aguarda RH';
    const cols = [
      { h: 'Estagiário', f: p => p.ficha_nome || '' }, { h: 'CPF', f: p => p.cpf || '' }, { h: 'Loja', f: p => p.loja || '' },
      { h: 'Forma de pagamento', f: forma }, { h: 'Banco', f: p => p.banco || '' }, { h: 'Agência', f: p => p.agencia || '' },
      { h: 'Conta', f: p => p.conta || '' }, { h: 'Chave PIX', f: p => p.pix || '' },
      { h: 'Bolsa', f: p => numBR(p.bolsa) }, { h: 'VT', f: p => numBR(p.vt) }, { h: 'Desconto', f: p => numBR(p.desconto) },
      { h: 'Obs. desconto', f: p => p.desconto_obs || '' }, { h: 'Líquido a pagar', f: p => numBR(p.liquido) },
      { h: 'Competência', f: () => comp }, { h: 'Situação', f: situacao },
    ];
    baixarCSV('pagamento-estagio-' + comp, cols, rows);
    setMsg(`📊 Planilha de ${rows.length} pagamento(s) baixada (total líquido ${brl(tot.liq)}).`);
  };
  const salvarDesc = (p) => { const e = ed[p.id] || {}; API.put('/estagio/pagamento/' + p.id, { desconto: Number(e.desconto ?? p.desconto) || 0, desconto_obs: e.desconto_obs ?? p.desconto_obs }).then(carregar).catch(() => setMsg('⚠️ erro')); };
  const setL = (id, k, v) => setEd(p => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));
  const etapa = (p, et, ok) => API.post('/estagio/pagamento/' + p.id + '/etapa', { etapa: et, ok }).then(carregar).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'erro')));
  // Recibo de bolsa-auxílio de estágio (imprime/PDF). Usa os dados do pagamento + a ficha.
  const recibo = (p) => {
    const compBR = comp ? comp.split('-').reverse().join('/') : '';
    const pagoEm = p.fin_em ? String(p.fin_em).slice(0, 10).split('-').reverse().join('/') : new Date().toLocaleDateString('pt-BR');
    const via = p.pix ? `PIX: ${p.pix}` : (p.banco ? `${p.banco} — ag. ${p.agencia || '—'} / c. ${p.conta || '—'}` : '—');
    const linha = (lab, v) => `<tr><td style="padding:4px 10px">${lab}</td><td style="padding:4px 10px;text-align:right;font-variant-numeric:tabular-nums">${v}</td></tr>`;
    const html = `<html><head><title>Recibo de Estágio — ${p.ficha_nome || ''}</title>
      <style>body{font-family:Arial;padding:48px;color:#111;font-size:13px;line-height:1.7}h1{font-size:17px;text-align:center;margin:0 0 4px}.sub{text-align:center;color:#555;margin-bottom:24px}table{border-collapse:collapse;width:100%;margin:14px 0;border:1px solid #ccc}td{border-bottom:1px solid #eee}.tot td{font-weight:700;border-top:2px solid #999}.ass{margin-top:60px;text-align:center}.ass .l{border-top:1px solid #333;width:300px;margin:0 auto;padding-top:6px}</style></head><body>
      <h1>RECIBO DE BOLSA-AUXÍLIO DE ESTÁGIO</h1>
      <div class="sub">Competência ${compBR}</div>
      <p>Recebi de <b>${p.loja || 'empresa concedente'}</b> a importância líquida de <b>${brl(p.liquido)}</b>, referente à bolsa-auxílio de estágio da competência <b>${compBR}</b>, conforme discriminado abaixo, dando plena e geral quitação.</p>
      <table>
        ${linha('Bolsa-auxílio', brl(p.bolsa))}
        ${linha('Auxílio-transporte', brl(p.vt))}
        ${linha('Descontos' + (p.desconto_obs ? ' (' + p.desconto_obs + ')' : ''), '- ' + brl(p.desconto))}
        <tr class="tot">${'<td style="padding:6px 10px">Valor líquido recebido</td><td style="padding:6px 10px;text-align:right">' + brl(p.liquido) + '</td>'}</tr>
      </table>
      <p>Forma de pagamento: ${via}<br>Data do pagamento: ${pagoEm}</p>
      <div class="ass"><div class="l">${p.ficha_nome || ''}${p.cpf ? '<br>CPF: ' + p.cpf : ''}</div></div>
      </body></html>`;
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  const LAB = { rh: ['RH', 'validar saldo da bolsa'], tesouraria: ['Tesouraria', 'validar descontos'], financeiro: ['Financeiro', 'marcar como pago'] };
  const COL = { rh: 'rh', tesouraria: 'tes', financeiro: 'fin' };
  const proximo = p => !p.rh_ok ? 'rh' : !p.tes_ok ? 'tesouraria' : !p.fin_ok ? 'financeiro' : null;
  const ultimoFeito = p => p.fin_ok ? 'financeiro' : p.tes_ok ? 'tesouraria' : p.rh_ok ? 'rh' : null;
  // Progresso visual: RH › Tesouraria › Financeiro (feito=verde, atual=azul, pendente=cinza).
  const Progresso = ({ p }) => {
    const prox = proximo(p);
    return <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {['rh', 'tesouraria', 'financeiro'].map((et, i) => {
        const c = COL[et], feito = p[c + '_ok'], atual = prox === et;
        const quem = feito ? `${p[c + '_por'] || ''}${p[c + '_em'] ? ' · ' + String(p[c + '_em']).slice(0, 10) : ''}` : '';
        return <React.Fragment key={et}>
          <span title={quem} style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 12, background: feito ? '#dcfce7' : atual ? '#dbeafe' : '#f1f5f9', color: feito ? '#15803d' : atual ? '#1d4ed8' : '#94a3b8' }}>{feito ? '✓ ' : (i + 1) + '. '}{LAB[et][0]}</span>
          {i < 2 && <span style={{ color: '#cbd5e1' }}>›</span>}
        </React.Fragment>;
      })}
    </div>;
  };
  // Ação: um único botão com o próximo passo (+ desfazer a última etapa).
  const Acao = ({ p }) => {
    const prox = proximo(p), ult = ultimoFeito(p);
    return <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {prox
        ? <button style={{ ...s.btnP, padding: '6px 11px', fontSize: 12 }} onClick={() => etapa(p, prox, true)}>✓ {LAB[prox][0]}: {LAB[prox][1]}</button>
        : <span style={{ color: '#0f766e', fontWeight: 700, fontSize: 13 }}>✅ Pago</span>}
      {ult && <button title={'desfazer ' + LAB[ult][0]} style={{ ...s.btn, padding: '5px 8px', fontSize: 12 }} onClick={() => etapa(p, ult, false)}>↩</button>}
      {!p.fin_ok && ed[p.id] && <button style={s.btnMini} onClick={() => salvarDesc(p)}>salvar desconto</button>}
      <button title="Recibo (imprimir/PDF)" style={{ ...s.btn, padding: '5px 8px', fontSize: 12 }} onClick={() => recibo(p)}>🧾</button>
    </div>;
  };
  const tot = rows.reduce((a, p) => ({ bolsa: a.bolsa + (p.bolsa || 0), vt: a.vt + (p.vt || 0), desc: a.desc + (p.desconto || 0), liq: a.liq + (p.liquido || 0) }), { bolsa: 0, vt: 0, desc: 0, liq: 0 });
  const ST = { aberto: '#b45309', liberado: '#15803d', pago: '#0f766e' };
  return (
    <div>
      <div style={s.card}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={s.lab}>Competência<input type="month" style={s.inp} value={comp} onChange={e => setComp(e.target.value)} /></label>
          <button style={s.btn} onClick={gerar}>Gerar folha do mês</button>
          <button style={s.btnP} onClick={liberar}>Liberar lista p/ pagamento</button>
          <button style={s.btn} onClick={planilhaFinanceiro} title="Baixa a planilha (Excel) com todos os pagamentos do mês — nome, CPF, forma de pagamento, dados bancários/PIX e valor líquido — pro Financeiro executar">📊 Planilha p/ Financeiro</button>
        </div>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      {resumo && <ResumoMes r={resumo} comp={comp} />}
      <div style={s.card}>
        <div style={s.cardT}>Pagamentos de {comp} ({rows.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tbl}>
            <thead><tr>{['Estagiário', 'Loja', 'Bolsa', 'VT', 'Desconto', 'Obs. desconto', 'Líquido', 'Pagar via', 'Etapa', 'Ação'].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={s.td}>{p.ficha_nome}</td><td style={s.td}>{p.loja || '—'}</td>
                  <td style={s.td}>{brl(p.bolsa)}</td><td style={s.td}>{brl(p.vt)}</td>
                  <td style={s.td}>{!p.tes_ok ? <input type="number" style={{ ...s.inp, width: 90 }} value={(ed[p.id]?.desconto) ?? p.desconto ?? 0} onChange={e => setL(p.id, 'desconto', e.target.value)} /> : brl(p.desconto)}</td>
                  <td style={s.td}>{!p.tes_ok ? <input style={{ ...s.inp, width: 150 }} value={(ed[p.id]?.desconto_obs) ?? p.desconto_obs ?? ''} onChange={e => setL(p.id, 'desconto_obs', e.target.value)} /> : (p.desconto_obs || '—')}</td>
                  <td style={{ ...s.td, fontWeight: 700 }}>{brl(p.liquido)}</td>
                  <td style={s.td}>{p.dados_bancarios_em ? <span>{p.banco || 'banco'} ag {p.agencia || '—'} c/ {p.conta || '—'}</span> : p.pix ? <span style={{ color: '#b45309' }}>PIX: {p.pix}</span> : <span style={{ color: '#b91c1c' }}>sem dados</span>}</td>
                  <td style={s.td}><Progresso p={p} /></td>
                  <td style={s.td}><Acao p={p} /></td>
                </tr>
              ))}
              {!rows.length && <tr><td style={s.td} colSpan={9}>Nada gerado. Clique em "Gerar folha do mês".</td></tr>}
            </tbody>
            {rows.length ? <tfoot><tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700 }}><td style={s.td} colSpan={2}>Total</td><td style={s.td}>{brl(tot.bolsa)}</td><td style={s.td}>{brl(tot.vt)}</td><td style={s.td}>{brl(tot.desc)}</td><td style={s.td}></td><td style={s.td}>{brl(tot.liq)}</td><td style={s.td} colSpan={3}></td></tr></tfoot> : null}
          </table>
        </div>
      </div>
    </div>
  );
}

// ───────── Férias + Rescisão ─────────
function FeriasRescisao({ API }) {
  const [fichas, setFichas] = useState([]);
  const [ferias, setFerias] = useState([]);
  const [f, setF] = useState({ ficha_id: '', data_ini: '', data_fim: '', obs: '', status: 'programada' });
  const [resc, setResc] = useState({ ficha_id: '', data: new Date().toISOString().slice(0, 10), motivo: '' });
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => {
    API.get('/estagio/ficha').then(r => setFichas(r.data)).catch(() => {});
    API.get('/estagio/ferias').then(r => setFerias(r.data)).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const nomeDe = id => (fichas.find(x => x.id === id) || {}).nome || '—';
  const dias = (a, b) => (a && b) ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 864e5) + 1) : 0;
  const salvarFerias = () => {
    if (!f.ficha_id || !f.data_ini) return setMsg('⚠️ Escolha o estagiário e a data.');
    API.post('/estagio/ferias', { ...f, dias: dias(f.data_ini, f.data_fim) }).then(() => { setMsg('✅ Férias salvas'); setF({ ficha_id: '', data_ini: '', data_fim: '', obs: '', status: 'programada' }); carregar(); }).catch(() => setMsg('⚠️ erro'));
  };
  const lancar = id => API.post('/estagio/ferias', { ...ferias.find(x => x.id === id), status: 'lancada' }).then(carregar);
  const removerF = id => { if (window.confirm('Remover?')) API.delete('/estagio/ferias/' + id).then(carregar); };
  const rescindir = () => {
    if (!resc.ficha_id) return setMsg('⚠️ Escolha o estagiário.');
    if (!window.confirm('Confirmar rescisão? O estagiário fica como rescindido.')) return;
    API.post('/estagio/rescisao/' + resc.ficha_id, { data: resc.data, motivo: resc.motivo }).then(() => { setMsg('✅ Rescisão registrada'); setResc({ ficha_id: '', data: new Date().toISOString().slice(0, 10), motivo: '' }); carregar(); }).catch(() => setMsg('⚠️ erro'));
  };
  const ativos = fichas.filter(x => x.status === 'ativo');
  return (
    <div>
      <div style={{ ...s.msg, background: '#eff6ff', color: '#1e40af', marginBottom: 12 }}>Recesso/férias do estagiário (Lei 11.788: 30 dias após 12 meses, preferencialmente nas férias escolares). Programe e depois lance.</div>
      <div style={s.card}>
        <div style={s.cardT}>Programar férias</div>
        <div style={s.grid}>
          <label style={s.lab}>Estagiário<select style={s.inp} value={f.ficha_id} onChange={e => setF({ ...f, ficha_id: e.target.value })}><option value="">—</option>{ativos.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
          <label style={s.lab}>Início<input type="date" style={s.inp} value={f.data_ini} onChange={e => setF({ ...f, data_ini: e.target.value })} /></label>
          <label style={s.lab}>Fim<input type="date" style={s.inp} value={f.data_fim} onChange={e => setF({ ...f, data_fim: e.target.value })} /></label>
          <label style={s.lab}>Dias<input style={{ ...s.inp, background: '#f8fafc' }} value={dias(f.data_ini, f.data_fim)} readOnly /></label>
          <label style={{ ...s.lab, gridColumn: '1 / -1' }}>Observação<input style={s.inp} value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></label>
        </div>
        <button style={{ ...s.btnP, marginTop: 10 }} onClick={salvarFerias}>Programar</button>
        {msg && <div style={s.msg}>{msg}</div>}
      </div>
      <div style={s.card}>
        <div style={s.cardT}>Férias ({ferias.length})</div>
        <table style={s.tbl}><thead><tr>{['Estagiário', 'Início', 'Fim', 'Dias', 'Status', ''].map(c => <th key={c} style={s.th}>{c}</th>)}</tr></thead>
          <tbody>{ferias.map(x => (
            <tr key={x.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={s.td}>{nomeDe(x.ficha_id)}</td><td style={s.td}>{fmtD(x.data_ini)}</td><td style={s.td}>{fmtD(x.data_fim)}</td><td style={s.td}>{x.dias || '—'}</td>
              <td style={s.td}><span style={{ ...s.pill, background: x.status === 'lancada' ? '#15803d' : '#b45309' }}>{x.status}</span></td>
              <td style={s.td}>{x.status === 'programada' && <button style={s.btnMini} onClick={() => lancar(x.id)}>lançar</button>}{' '}<button style={s.btnMini} onClick={() => removerF(x.id)}>remover</button></td>
            </tr>))}
            {!ferias.length && <tr><td style={s.td} colSpan={6}>Nenhuma férias.</td></tr>}</tbody></table>
      </div>
      <div style={{ ...s.card, background: '#fff7ed' }}>
        <div style={s.cardT}>Rescisão</div>
        <div style={s.grid}>
          <label style={s.lab}>Estagiário<select style={s.inp} value={resc.ficha_id} onChange={e => setResc({ ...resc, ficha_id: e.target.value })}><option value="">—</option>{ativos.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
          <label style={s.lab}>Data<input type="date" style={s.inp} value={resc.data} onChange={e => setResc({ ...resc, data: e.target.value })} /></label>
          <label style={{ ...s.lab, gridColumn: '1 / -1' }}>Motivo<input style={s.inp} value={resc.motivo} onChange={e => setResc({ ...resc, motivo: e.target.value })} /></label>
        </div>
        <button style={{ ...s.btnP, marginTop: 10, background: '#b91c1c' }} onClick={rescindir}>Registrar rescisão</button>
      </div>
    </div>
  );
}

function Tabela({ cols, rows, onDel, onEdit }) {
  return (
    <div style={s.card}>
      <div style={s.cardT}>{rows.length} cadastrado(s)</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={s.tbl}>
          <thead><tr>{cols.map(c => <th key={c[0]} style={s.th}>{c[1]}</th>)}<th style={s.th}></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                {cols.map(c => <td key={c[0]} style={s.td}>{c[2] ? c[2](r[c[0]]) : (r[c[0]] || '—')}</td>)}
                <td style={s.td}>{onEdit && <button style={s.btnMini} onClick={() => onEdit(r)}>editar</button>}{onEdit ? ' ' : ''}<button style={s.btnMini} onClick={() => onDel(r.id)}>remover</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td style={s.td} colSpan={cols.length + 1}>Nenhum cadastro.</td></tr>}
          </tbody>
        </table>
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
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 },
  lab: { display: 'flex', flexDirection: 'column', fontSize: 12, color: '#475569', gap: 4 },
  inp: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14 },
  btn: { padding: '9px 14px', border: '1px solid #0f172a', background: '#fff', color: '#0f172a', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  btnP: { padding: '9px 14px', border: 'none', background: '#0f766e', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700 },
  btnMini: { padding: '5px 10px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12 },
  msg: { marginTop: 10, padding: '8px 12px', background: '#f1f5f9', borderRadius: 8, fontSize: 14 },
  leg: { fontSize: 11, color: '#64748b' },
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 10px', color: '#64748b', fontSize: 12, borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' },
  td: { padding: '8px 10px', verticalAlign: 'top' },
  pill: { color: '#fff', padding: '2px 8px', borderRadius: 999, fontSize: 11 },
};
