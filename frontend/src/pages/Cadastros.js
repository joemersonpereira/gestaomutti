import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';
import Indicadores from './Indicadores';
import RegrasSistema from './RegrasSistema';
import { abrirTermoCampanha } from './Premiacao';
import AutoCadastroRH from './AutoCadastroRH';
import { Contrato as ContratoEstagio } from './EstagioRH';
import { MODULOS_META } from '../App';

export default function Cadastros({ modo = 'tudo' }) {
  const { API, usuario } = useAuth();
  const podeLoja = ['Diretor Geral', 'Gestor Geral'].includes(usuario.funcao);
  // Abas por modo: colaborador (Gente & Gestão) · config (Configuração) · afastamentos (Gente & Gestão)
  const ABAS = {
    colaborador: ['colaboradores'],
    config: ['lojas'],
    afastamentos: ['rh'],
    tudo: ['colaboradores', 'lojas', 'empresas', 'premiacao', 'checklist', 'ocorrencias', 'indicadores', 'pilares', 'conquistas', 'regras-fonte', 'acessos', 'rh', 'campanhas', 'termos', 'funcoes'],
  };
  const visiveis = (ABAS[modo] || ABAS.tudo).filter(a => !['funcoes', 'acessos'].includes(a) || ['Diretor Geral', 'Gestor Geral'].includes(usuario.funcao));
  const [aba, setAba] = useState(visiveis[0] || 'colaboradores');
  const LABEL = { colaboradores: 'Colaboradores', lojas: 'Lojas', empresas: 'Empresas', 'estagio-escolas': '🏫 Escolas', 'estagio-empresas': '🏢 Empresas (estágio)', premiacao: 'Regra de premiação', checklist: 'Checklist', ocorrencias: 'Ocorrências', indicadores: 'Indicadores por função', pilares: 'Pilares da loja', conquistas: 'Conquistas', 'regras-fonte': '📋 Regras do sistema', acessos: '🔐 Acessos', rh: 'Afastamentos', campanhas: 'Campanhas', termos: 'Termos', funcoes: 'Funções' };
  const TITULO = { colaborador: '👤 Colaboradores', config: '🗂️ Parâmetros do sistema', afastamentos: '🌴 Afastamentos', tudo: '📝 Cadastros' };

  return (
    <div style={s.wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '6px 0 12px', borderBottom: '1px solid var(--line,#ddd8cf)', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--fg,#1c2a2e)' }}>{TITULO[modo] || TITULO.tudo}</h1>
        {visiveis.length > 1 && (
          <div style={{ ...s.tabs, margin: 0, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {visiveis.map(a => (
              <button key={a} onClick={() => setAba(a)} style={{ ...s.tab, ...(aba === a ? s.tabAtiva : {}) }}>{LABEL[a]}</button>
            ))}
          </div>
        )}
      </div>

      {aba === 'colaboradores' && <Colaboradores API={API} />}
      {aba === 'lojas' && <Lojas API={API} podeCriar={podeLoja} />}
      {aba === 'empresas' && <TerceirizadasCadastro API={API} />}
      {aba === 'premiacao' && <Premiacoes API={API} />}
      {aba === 'checklist' && <ChecklistCadastro API={API} />}
      {aba === 'ocorrencias' && <OcorrenciasCadastro API={API} />}
      {aba === 'indicadores' && <Indicadores />}
      {aba === 'regras-fonte' && <RegrasSistema />}
      {aba === 'acessos' && <AcessosConfig API={API} />}
      {aba === 'pilares' && <PilaresCadastro API={API} />}
      {aba === 'rh' && <RHMovimentacoes API={API} />}
      {aba === 'campanhas' && <CampanhasColaborador API={API} />}
      {aba === 'termos' && <ModelosTermo API={API} />}
      {aba === 'conquistas' && <ConquistasCadastro API={API} />}
      {aba === 'funcoes' && <FuncoesEscritorio API={API} />}
    </div>
  );
}

function SyncAlpha({ API, onAplicado }) {
  const [aberto, setAberto] = useState(false);
  const [prev, setPrev] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState('');
  const conferir = () => { setCarregando(true); setMsg(''); API.get('/colaboradores/sync-alpha').then(r => { setPrev(r.data); setAberto(true); }).catch(e => setMsg(e.response?.data?.erro || 'Erro.')).finally(() => setCarregando(false)); };
  const aplicar = () => { if (!window.confirm(`Desativar ${prev.aDesativar.length} colaborador(es) que estão inativos no Alpha 7?`)) return; API.post('/colaboradores/sync-alpha/aplicar', { reativar: false }).then(r => { setMsg(`✅ ${r.data.desativados} desativado(s).`); setPrev(null); setAberto(false); onAplicado && onAplicado(); }).catch(e => setMsg(e.response?.data?.erro || 'Erro.')); };
  return (
    <div style={{ ...s.card, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13 }}>🔄 Conferência com o Alpha 7</b>
        <span style={{ fontSize: 12, color: '#777' }}>mantém ativo só quem está ativo no ERP (vínculo por CPF)</span>
        <div style={{ flex: 1 }} />
        <button style={s.btn} onClick={conferir} disabled={carregando}>{carregando ? 'Conferindo…' : 'Conferir agora'}</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D' }}>{msg}</div>}
      {aberto && prev && (
        <div style={{ fontSize: 13, background: '#F6F7F9', borderRadius: 8, padding: 10 }}>
          <div>Ativos no Alpha: <b>{prev.matchAtivo}</b> · Inativos no Alpha: <b>{prev.matchInativo}</b> · Sem vínculo (não mexe): <b>{prev.semVinculo}</b></div>
          {prev.aDesativar.length ? <>
            <div style={{ margin: '8px 0 4px', color: '#993C1D', fontWeight: 600 }}>A desativar ({prev.aDesativar.length}):</div>
            <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 12 }}>{prev.aDesativar.map(c => <div key={c.id}>• {c.nome}</div>)}</div>
            <button style={{ ...s.btn, background: '#993C1D', marginTop: 8 }} onClick={aplicar}>Desativar {prev.aDesativar.length} no app</button>
          </> : <div style={{ color: '#3B6D11', marginTop: 6 }}>✓ Tudo em dia — ninguém a desativar.</div>}
        </div>
      )}
    </div>
  );
}

function Colaboradores({ API }) {
  const [lojas, setLojas] = useState([]);
  const [funcoes, setFuncoes] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState({ nome: '', email: '', cpf: '', funcao_id: '', loja_id: '', departamento: '', salario: '', admissao: '', inicio_loja: '', nascimento: '', chefe_setor: false, lideranca: false, conferente: false, is_estagiario: false, is_socio: false, lojas_extra: [], empresa_registro: '', empresa_atuacao: '', telefone: '', endereco: '', apelido: '', contato_emergencia_nome: '', contato_emergencia_telefone: '', foto: null, cep: '', endereco_numero: '', complemento: '', bairro: '', cidade: '', uf: '', num_calcado: '', tam_blusa: '', tam_calca: '', tam_jaleco: '', bio: '', presente_favorito: '', cores_favoritas: '', estilo_musical: '', hobbies: '', time_coracao: '', dependentes: [], lgpd: false });
  const [editId, setEditId] = useState(null);
  const [temFotoAtual, setTemFotoAtual] = useState(false);
  const [lgpdInfo, setLgpdInfo] = useState({ consentido: false, em: null });
  const [msg, setMsg] = useState(null);
  const [busca, setBusca] = useState('');
  const [filtroLoja, setFiltroLoja] = useState('');
  const [filtroPend, setFiltroPend] = useState('');
  const [filtroAtivo, setFiltroAtivo] = useState('ativo'); // ativo (padrão) | inativo | todos
  const [mostrarForm, setMostrarForm] = useState(false);
  const [desligarAlvo, setDesligarAlvo] = useState(null);
  useEffect(() => { const p = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('rh_pend_filtro'); if (p) { setFiltroPend(p); sessionStorage.removeItem('rh_pend_filtro'); } }, []);
  const lerImgFile = file => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  const [terceirizadas, setTerceirizadas] = useState([]);
  const [empresaPrincipal, setEmpresaPrincipal] = useState('');

  const carregar = useCallback(() => { API.get('/colaboradores').then(r => setLista(r.data.colaboradores || [])); }, [API]);
  useEffect(() => {
    carregar();
    API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || []));
    API.get('/referencias/funcoes').then(r => setFuncoes(r.data.funcoes || []));
    API.get('/referencias/departamentos').then(r => setDepartamentos(r.data.departamentos || []));
    API.get('/referencias/terceirizadas').then(r => { setTerceirizadas(r.data.terceirizadas || []); setEmpresaPrincipal(r.data.principal || ''); }).catch(() => {});
  }, [API, carregar]);

  async function toggleChefe(c) {
    await API.patch(`/colaboradores/${c.id}/chefe-setor`, { chefe_setor: !c.chefe_setor });
    carregar();
  }

  async function resetarSenha(c) {
    if (!window.confirm(`Resetar a senha de ${c.nome} para 12345? Ele terá que trocar no próximo acesso.`)) return;
    try {
      const r = await API.patch(`/colaboradores/${c.id}/resetar-senha`);
      window.alert(r.data.mensagem);
    } catch (e) {
      window.alert(e.response?.data?.erro || 'Erro ao resetar senha.');
    }
  }

  function editar(c) {
    setEditId(c.id);
    setMostrarForm(true);
    setTemFotoAtual(!!c.tem_foto);
    setForm({ nome: c.nome || '', email: c.email || '', cpf: c.cpf || '', funcao_id: c.funcao_id || '', loja_id: c.loja_id || '', departamento: c.departamento || '', salario: c.salario || '', admissao: c.admissao || '', inicio_loja: (c.inicio_loja || '').slice(0, 10), nascimento: c.nascimento || '', chefe_setor: !!c.chefe_setor, lideranca: !!c.lideranca, conferente: !!c.conferente, is_estagiario: !!c.is_estagiario, is_socio: !!c.is_socio, lojas_extra: c.lojas_extra ? c.lojas_extra.split(',') : [], empresa_registro: c.empresa_registro || '', empresa_atuacao: c.empresa_atuacao || '', telefone: c.telefone || '', endereco: c.endereco || '', apelido: c.apelido || '', contato_emergencia_nome: c.contato_emergencia_nome || '', contato_emergencia_telefone: c.contato_emergencia_telefone || '', foto: c.foto || null, cep: c.cep || '', endereco_numero: c.endereco_numero || '', complemento: c.complemento || '', bairro: c.bairro || '', cidade: c.cidade || '', uf: c.uf || '', num_calcado: c.num_calcado || '', tam_blusa: c.tam_blusa || '', tam_calca: c.tam_calca || '', tam_jaleco: c.tam_jaleco || '', bio: c.bio || '', presente_favorito: c.presente_favorito || '', cores_favoritas: c.cores_favoritas || '', estilo_musical: c.estilo_musical || '', hobbies: c.hobbies || '', time_coracao: c.time_coracao || '', dependentes: [], lgpd: !!c.lgpd_consentido, tangerino_id: c.tangerino_id || '', tangerino_nome: c.tangerino_nome || '' });
    setLgpdInfo({ consentido: !!c.lgpd_consentido, em: c.lgpd_consentido_em });
    setMsg(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function novoColaborador() { cancelarEdicao(); setMostrarForm(true); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function cancelarEdicao() {
    setEditId(null);
    setMostrarForm(false);
    setTemFotoAtual(false);
    setLgpdInfo({ consentido: false, em: null });
    setForm({ nome: '', email: '', cpf: '', funcao_id: '', loja_id: '', departamento: '', salario: '', admissao: '', inicio_loja: '', nascimento: '', chefe_setor: false, lideranca: false, conferente: false, is_estagiario: false, is_socio: false, lojas_extra: [], empresa_registro: '', empresa_atuacao: '', telefone: '', endereco: '', apelido: '', contato_emergencia_nome: '', contato_emergencia_telefone: '', foto: null, cep: '', endereco_numero: '', complemento: '', bairro: '', cidade: '', uf: '', num_calcado: '', tam_blusa: '', tam_calca: '', tam_jaleco: '', bio: '', presente_favorito: '', cores_favoritas: '', estilo_musical: '', hobbies: '', time_coracao: '', dependentes: [], lgpd: false });
    setMsg(null);
  }

  async function salvar() {
    setMsg(null);
    if (!form.nome || !form.email || !form.funcao_id || !form.loja_id) { setMsg({ erro: 'Nome, e-mail, função e loja são obrigatórios.' }); return; }
    try {
      const payload = { ...form, salario: Number(form.salario) || 0 };
      if (editId && !form.foto) delete payload.foto; // não reenvia foto se não trocou (preserva a atual)
      if (editId) {
        await API.patch(`/colaboradores/${editId}`, payload);
        if (form.lgpd && !lgpdInfo.consentido) { try { await API.post(`/colaboradores/${editId}/lgpd`); } catch { /* ignora */ } }
        setMsg({ ok: true, editado: true });
        cancelarEdicao();
        carregar();
      } else {
        const r = await API.post('/colaboradores', payload);
        if (form.lgpd && r.data.id) { try { await API.post(`/colaboradores/${r.data.id}/lgpd`); } catch { /* ignora */ } }
        setMsg({ ok: true, senha: r.data.senha_provisoria, email: form.email });
        setForm({ nome: '', email: '', cpf: '', funcao_id: '', loja_id: '', departamento: '', salario: '', admissao: '', inicio_loja: '', nascimento: '', chefe_setor: false, lideranca: false, conferente: false, is_estagiario: false, is_socio: false, lojas_extra: [], empresa_registro: '', empresa_atuacao: '', telefone: '', endereco: '', apelido: '', contato_emergencia_nome: '', contato_emergencia_telefone: '', foto: null, cep: '', endereco_numero: '', complemento: '', bairro: '', cidade: '', uf: '', num_calcado: '', tam_blusa: '', tam_calca: '', tam_jaleco: '', bio: '', presente_favorito: '', cores_favoritas: '', estilo_musical: '', hobbies: '', time_coracao: '', dependentes: [], lgpd: false });
        carregar();
      }
    } catch (e) {
      setMsg({ erro: e.response?.data?.erro || 'Erro ao salvar.' });
    }
  }

  const lojasLista = [...new Set(lista.map(c => c.loja).filter(Boolean))].sort();
  const PEND_L = { sem_cpf: 'sem CPF', sem_lgpd: 'sem consentimento LGPD', sem_foto: 'sem foto', sem_tamanhos: 'sem tamanhos de fardamento' };
  const pendMatch = c => !filtroPend
    || (filtroPend === 'sem_cpf' && !c.cpf)
    || (filtroPend === 'sem_lgpd' && !c.lgpd_consentido)
    || (filtroPend === 'sem_foto' && !c.tem_foto)
    || (filtroPend === 'sem_tamanhos' && !c.num_calcado && !c.tam_blusa && !c.tam_calca);
  const ativoMatch = c => filtroAtivo === 'todos' ? true : filtroAtivo === 'inativo' ? !c.ativo : !!c.ativo;
  const listaFiltrada = lista.filter(c =>
    (!busca || c.nome.toLowerCase().includes(busca.toLowerCase()) || (c.email || '').toLowerCase().includes(busca.toLowerCase())) &&
    (!filtroLoja || c.loja === filtroLoja) && pendMatch(c) && ativoMatch(c));

  return (
    <>
      <AutoCadastroRH />
      <SyncAlpha API={API} onAplicado={carregar} />

      {/* Toolbar: novo + busca + filtro por loja */}
      <div style={{ ...s.card, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 5 }}>
        {!mostrarForm && !editId && <button onClick={novoColaborador} style={{ ...s.btn, background: '#185FA5' }}>➕ Novo colaborador</button>}
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔎 Buscar por nome ou e-mail…" style={{ ...s.campo, flex: 1, minWidth: 200, marginBottom: 0 }} />
        <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value)} style={{ ...s.campo, width: 'auto', marginBottom: 0 }}>
          <option value="ativo">✓ Ativos</option>
          <option value="inativo">Inativos</option>
          <option value="todos">Todos</option>
        </select>
        <select value={filtroLoja} onChange={e => setFiltroLoja(e.target.value)} style={{ ...s.campo, width: 'auto', marginBottom: 0 }}>
          <option value="">Todas as lojas</option>
          {lojasLista.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        {filtroPend && <span style={{ fontSize: 12, fontWeight: 600, color: '#8A6D1D', background: '#FBF3DA', borderRadius: 16, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>⚠️ {PEND_L[filtroPend] || filtroPend}<button onClick={() => setFiltroPend('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A6D1D', fontWeight: 700 }}>✕</button></span>}
      </div>

      {(mostrarForm || editId) && (
      <div style={s.card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{editId ? '✏️ Editar colaborador' : '➕ Novo colaborador'}</div>

        {/* 1) IDENTIFICAÇÃO */}
        <Secao n="1" titulo="Identificação" />
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            {(form.foto || (temFotoAtual && editId))
              ? <img src={form.foto || `/api/mural/foto/${editId}`} alt="" style={{ width: 76, height: 76, borderRadius: '50%', objectFit: 'cover', border: '2px solid #eee' }} />
              : <div style={{ width: 76, height: 76, borderRadius: '50%', background: '#EAF3FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>👤</div>}
            <label style={{ display: 'block', fontSize: 11, color: '#185FA5', cursor: 'pointer', marginTop: 6, fontWeight: 600 }}>📷 {form.foto || temFotoAtual ? 'trocar' : 'foto'}
              <input type="file" accept="image/*" onChange={async e => { const f = e.target.files[0]; if (f) setForm({ ...form, foto: await lerImgFile(f) }); }} style={{ display: 'none' }} />
            </label>
            {form.foto && <button type="button" onClick={() => setForm({ ...form, foto: null })} style={{ fontSize: 10, color: '#993C1D', background: 'none', border: 'none', cursor: 'pointer' }}>remover</button>}
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontSize: 10, color: '#999' }}>Nome completo *</label>
            <input style={s.campo} placeholder="Nome completo" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
            <label style={{ fontSize: 10, color: '#999' }}>Como gostaria de ser chamado (apelido)</label>
            <input style={s.campo} placeholder="Apelido" value={form.apelido} onChange={e => setForm({ ...form, apelido: e.target.value })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: '#999' }}>CPF</label>
                <input style={{ ...s.campo, ...(editId && !form.cpf ? { border: '1px solid #E3B341', background: '#FFFBEB' } : {}) }} placeholder="000.000.000-00" value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: '#999' }}>Nascimento</label><input style={s.campo} type="date" value={form.nascimento} onChange={e => setForm({ ...form, nascimento: e.target.value })} /></div>
            </div>
            {editId && !form.cpf && <div style={{ fontSize: 11, color: '#B7791F', marginTop: -4, marginBottom: 6 }}>⚠️ Este colaborador está <strong>sem CPF</strong>. Informe para completar a ficha (usado nos documentos/holerites).</div>}
            {editId && (form.tangerino_id
              ? <div style={{ fontSize: 11, color: '#1E7A46', background: '#EAF7EF', border: '1px solid #BCE6CD', borderRadius: 6, padding: '5px 8px', marginBottom: 6 }}>🕐 <strong>Ponto vinculado</strong> ao Tangerino{form.tangerino_nome ? <> como <strong>{form.tangerino_nome}</strong></> : ''} (o vínculo é automático pelo CPF).</div>
              : <div style={{ fontSize: 11, color: '#8A6D3B', background: '#FFF8E6', border: '1px solid #F0E0B0', borderRadius: 6, padding: '5px 8px', marginBottom: 6 }}>🕐 <strong>Sem vínculo com o Ponto (Tangerino).</strong> {form.cpf ? 'Rode a vinculação por CPF em Ponto → Vínculos.' : 'Informe o CPF acima para vincular automaticamente.'}</div>)}
            <label style={{ fontSize: 10, color: '#999' }}>E-mail de acesso *</label>
            <input style={s.campo} type="email" placeholder="nome@farmaciasmutti.com.br" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            {!editId && <>
              <label style={{ fontSize: 10, color: '#999' }}>Senha de acesso (inicial)</label>
              <input style={s.campo} placeholder="deixe em branco para usar 12345" value={form.senha || ''} onChange={e => setForm({ ...form, senha: e.target.value })} />
              <div style={{ fontSize: 10, color: '#999', marginTop: -4, marginBottom: 4 }}>💡 Você define a senha inicial. O colaborador troca no 1º acesso.</div>
            </>}
          </div>
        </div>
        <div style={s.dica}>📸 Peça uma <strong>foto de rosto, sorrindo</strong> 😊. Ela é usada em <strong>ações internas</strong> (Comunidade, datas comemorativas).</div>

        {/* 2) CARGO E LOJA */}
        <Secao n="2" titulo="Cargo e loja" />
        <div style={{ display: 'flex', gap: 8 }}>
          <select style={s.campo} value={form.funcao_id} onChange={e => setForm({ ...form, funcao_id: e.target.value })}>
            <option value="">Função *</option>
            {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          <select style={s.campo} value={form.loja_id} onChange={e => setForm({ ...form, loja_id: e.target.value })}>
            <option value="">Loja *</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <select style={s.campo} value={form.departamento} onChange={e => setForm({ ...form, departamento: e.target.value })}>
          <option value="">Departamento (define a fila de tarefas)</option>
          {departamentos.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div style={{ margin: '2px 0 6px' }}>
          <div style={{ fontSize: 12, color: '#444', marginBottom: 4 }}>Também atua em (outras lojas)</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {lojas.filter(l => l.id !== form.loja_id).map(l => {
              const on = form.lojas_extra.includes(l.id);
              return (
                <button key={l.id} type="button"
                  onClick={() => setForm({ ...form, lojas_extra: on ? form.lojas_extra.filter(x => x !== l.id) : [...form.lojas_extra, l.id] })}
                  style={{ fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 16, cursor: 'pointer', border: `1px solid ${on ? '#185FA5' : '#ddd'}`, background: on ? '#E6F1FB' : '#fff', color: on ? '#185FA5' : '#888' }}>
                  {on ? '✓ ' : '+ '}{l.nome}
                </button>
              );
            })}
            {lojas.filter(l => l.id !== form.loja_id).length === 0 && <span style={{ fontSize: 11, color: '#aaa' }}>sem outras lojas</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
          {[['chefe_setor', 'Chefe do setor', 'recebe as avaliações administrativas da função'],
            ['lideranca', 'Liderança', 'substitui o gerente quando ele e o subgerente faltam'],
            ['conferente', 'É conferente', 'entra no checklist e na comissão de conferente'],
            ['is_estagiario', '🎓 É estagiário', 'cria/vincula a ficha no módulo Estágios (nome, CPF e loja) para completar lá'],
            ['is_socio', '🤝 É sócio', 'sócio da empresa — fica disponível para assinar os contratos de estágio']].map(([k, t, d]) => (
            <label key={k} title={d} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#444' }}>
              <input type="checkbox" checked={!!form[k]} onChange={e => setForm({ ...form, [k]: e.target.checked })} /> {t}
            </label>
          ))}
        </div>

        {/* 3) CONTRATO */}
        <Secao n="3" titulo="Contrato" />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: '#999' }}>Admissão</label><input style={s.campo} type="date" value={form.admissao} onChange={e => setForm({ ...form, admissao: e.target.value })} /></div>
          <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: '#999' }}>Início na loja 👋</label><input style={s.campo} type="date" value={form.inicio_loja} onChange={e => setForm({ ...form, inicio_loja: e.target.value })} /></div>
          <input style={s.campo} type="number" placeholder="Salário (R$)" value={form.salario} onChange={e => setForm({ ...form, salario: e.target.value })} />
        </div>
        <div style={{ fontSize: 10, color: '#999', marginTop: -4, marginBottom: 4 }}>💡 No dia do <strong>início na loja</strong>, a Comunidade posta um boas-vindas pedindo a galera pra receber a pessoa.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select style={s.campo} value={terceirizadas.some(t => t.nome === form.empresa_registro) || form.empresa_registro === '' ? form.empresa_registro : '__outra'}
            onChange={e => setForm({ ...form, empresa_registro: e.target.value === '__outra' ? ' ' : e.target.value })}>
            <option value="">Empresa de registro: {empresaPrincipal || 'própria empresa'}</option>
            {terceirizadas.map(t => <option key={t.id} value={t.nome}>{t.nome} (terceirizada)</option>)}
            <option value="__outra">Outra (digitar)…</option>
          </select>
          {!terceirizadas.some(t => t.nome === form.empresa_registro) && form.empresa_registro !== '' && (
            <input style={s.campo} placeholder="Nome da empresa de registro" value={form.empresa_registro.trim() === '' ? '' : form.empresa_registro} onChange={e => setForm({ ...form, empresa_registro: e.target.value })} />
          )}
          <input style={s.campo} placeholder="Empresa de atuação" value={form.empresa_atuacao} onChange={e => setForm({ ...form, empresa_atuacao: e.target.value })} />
        </div>
        <div style={{ fontSize: 10, color: '#999', marginTop: -4, marginBottom: 2 }}>A <strong>empresa de registro</strong> aparece nos termos (advertência/suspensão). Em branco = própria empresa.</div>

        {/* 4) CONTATO E ENDEREÇO */}
        <Secao n="4" titulo="Contato e endereço" />
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={s.campo} placeholder="Telefone" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} />
          <div style={{ display: 'flex', gap: 6, flex: 1 }}>
            <input style={s.campo} placeholder="CEP" value={form.cep} onChange={async e => {
              const v = e.target.value; setForm(f => ({ ...f, cep: v }));
              const num = v.replace(/\D/g, '');
              if (num.length === 8) { try { const r = await API.get(`/colaboradores/cep/${num}`); setForm(f => ({ ...f, endereco: r.data.endereco || f.endereco, bairro: r.data.bairro || f.bairro, cidade: r.data.cidade || f.cidade, uf: r.data.uf || f.uf })); } catch { /* ignora */ } }
            }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...s.campo, flex: 2 }} placeholder="Rua / logradouro" value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} />
          <input style={{ ...s.campo, flex: 0.6 }} placeholder="Nº" value={form.endereco_numero} onChange={e => setForm({ ...form, endereco_numero: e.target.value })} />
          <input style={{ ...s.campo, flex: 1 }} placeholder="Complemento" value={form.complemento} onChange={e => setForm({ ...form, complemento: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...s.campo, flex: 1.4 }} placeholder="Bairro" value={form.bairro} onChange={e => setForm({ ...form, bairro: e.target.value })} />
          <input style={{ ...s.campo, flex: 1.4 }} placeholder="Cidade" value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} />
          <input style={{ ...s.campo, flex: 0.5 }} placeholder="UF" maxLength={2} value={form.uf} onChange={e => setForm({ ...form, uf: e.target.value.toUpperCase() })} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={s.campo} placeholder="Contato de emergência (nome)" value={form.contato_emergencia_nome} onChange={e => setForm({ ...form, contato_emergencia_nome: e.target.value })} />
          <input style={s.campo} placeholder="Telefone de emergência" value={form.contato_emergencia_telefone} onChange={e => setForm({ ...form, contato_emergencia_telefone: e.target.value })} />
        </div>

        {/* 5) FARDAMENTO (TAMANHOS) */}
        <Secao n="5" titulo="Fardamento (tamanhos)" />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 90 }}><label style={{ fontSize: 10, color: '#999' }}>Calçado (nº)</label><input style={s.campo} placeholder="ex.: 40" value={form.num_calcado} onChange={e => setForm({ ...form, num_calcado: e.target.value })} /></div>
          <div style={{ flex: 1, minWidth: 90 }}><label style={{ fontSize: 10, color: '#999' }}>Blusa/camisa</label><input style={s.campo} placeholder="ex.: G" value={form.tam_blusa} onChange={e => setForm({ ...form, tam_blusa: e.target.value })} /></div>
          <div style={{ flex: 1, minWidth: 90 }}><label style={{ fontSize: 10, color: '#999' }}>Calça</label><input style={s.campo} placeholder="ex.: 42" value={form.tam_calca} onChange={e => setForm({ ...form, tam_calca: e.target.value })} /></div>
          <div style={{ flex: 1, minWidth: 90 }}><label style={{ fontSize: 10, color: '#999' }}>Jaleco</label><input style={s.campo} placeholder="ex.: M" value={form.tam_jaleco} onChange={e => setForm({ ...form, tam_jaleco: e.target.value })} /></div>
        </div>

        {/* 6) SOBRE MIM (Comunidade) */}
        <Secao n="6" titulo="Sobre mim (Comunidade)" />
        <textarea style={{ ...s.campo, minHeight: 54, resize: 'vertical' }} placeholder="Uma frase sobre você — aparece no seu perfil da Comunidade 💬" maxLength={500} value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={s.campo} placeholder="🎁 O que gosta de presente" value={form.presente_favorito} onChange={e => setForm({ ...form, presente_favorito: e.target.value })} />
          <input style={s.campo} placeholder="🎨 Cores favoritas" value={form.cores_favoritas} onChange={e => setForm({ ...form, cores_favoritas: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={s.campo} placeholder="🎵 Estilo musical" value={form.estilo_musical} onChange={e => setForm({ ...form, estilo_musical: e.target.value })} />
          <input style={s.campo} placeholder="⚽ Time do coração" value={form.time_coracao} onChange={e => setForm({ ...form, time_coracao: e.target.value })} />
        </div>
        <input style={s.campo} placeholder="🎯 Hobbies" value={form.hobbies} onChange={e => setForm({ ...form, hobbies: e.target.value })} />

        {/* 7) FAMÍLIA E PETS */}
        <Secao n="7" titulo="Família e pets" />
        <Dependentes API={API} editId={editId} lista={form.dependentes} onChange={deps => setForm({ ...form, dependentes: deps })} lerImgFile={lerImgFile} />

        {/* 8) LGPD */}
        <Secao n="8" titulo="Consentimento (LGPD)" />
        {lgpdInfo.consentido ? (
          <div style={{ fontSize: 12, color: '#3B6D11', background: '#E7F1DC', borderRadius: 8, padding: '8px 10px' }}>✅ Consentimento registrado{lgpdInfo.em ? ` em ${String(lgpdInfo.em).slice(0, 10).split('-').reverse().join('/')}` : ''}. O termo assinado está em <strong>Meus Documentos</strong> do colaborador.</div>
        ) : (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#444', background: '#F6F9FC', borderRadius: 8, padding: '10px 12px' }}>
            <input type="checkbox" checked={!!form.lgpd} onChange={e => setForm({ ...form, lgpd: e.target.checked })} style={{ marginTop: 2 }} />
            <span>O colaborador <strong>autoriza o compartilhamento interno</strong> dos seus dados e dos dependentes (nome, foto, datas) para ações internas (Comunidade e datas comemorativas), conforme a <strong>LGPD</strong>. Ao salvar, geramos um <strong>termo assinado</strong> em Meus Documentos.</span>
          </label>
        )}

        {msg?.erro && <div style={{ fontSize: 12, color: '#993C1D', margin: '10px 0 8px' }}>{msg.erro}</div>}
        {msg?.ok && msg.editado && <div style={s.senhaBox}>✅ Colaborador atualizado.</div>}
        {msg?.ok && !msg.editado && !msg.reset && (
          <div style={s.senhaBox}>
            ✅ Colaborador cadastrado!<br />
            <strong>Senha padrão: {msg.senha}</strong><br />
            <span style={{ fontSize: 11 }}>Informe a {msg.email}. No 1º acesso ele troca a senha.</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn} onClick={salvar}>{editId ? 'Salvar alterações' : 'Cadastrar colaborador'}</button>
          <button style={{ ...s.btn, background: '#999' }} onClick={cancelarEdicao}>{editId ? 'Fechar' : 'Cancelar'}</button>
        </div>
      </div>
      )}

      {editId && <FichaColaborador API={API} colaboradorId={editId} nome={form.nome} onDesligar={() => setDesligarAlvo({ id: editId, nome: form.nome })} />}
      {editId && <CampanhasDoColaborador API={API} colaboradorId={editId} />}
      {editId && form.is_estagiario && (
        <div style={{ ...s.card, marginTop: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🎓 Contrato de estágio</div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>Gera o contrato desta pessoa usando os dados da ficha de estágio (loja, bolsa, sócio que assina, etc.).</div>
          <ContratoEstagio API={API} colaboradorId={editId} />
        </div>
      )}

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Colaboradores <span style={{ color: '#999', fontWeight: 400 }}>({listaFiltrada.length}{listaFiltrada.length !== lista.length ? ` de ${lista.length}` : ''})</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
          {listaFiltrada.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid #eee', borderRadius: 10, padding: '10px 12px', background: c.ativo ? '#fff' : '#FBFBFB', opacity: c.ativo ? 1 : .7 }}>
              {c.tem_foto ? <img src={`/api/mural/foto/${c.id}`} alt="" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#EAF3FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#185FA5', flexShrink: 0 }}>{c.nome.split(' ').slice(0, 2).map(x => x[0]).join('')}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}
                  {c.chefe_setor ? <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 5, background: '#E6F1FB', color: '#185FA5', marginLeft: 4 }}>chefe</span> : null}
                  {c.conferente ? <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 5, background: '#EFEAF7', color: '#5B3B9E', marginLeft: 4 }}>conf.</span> : null}
                  {c.is_estagiario ? <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 5, background: '#E7F6EC', color: '#1E7E45', marginLeft: 4 }}>🎓 estágio</span> : null}
                </div>
                <div style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.funcao} · {c.loja}</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
                  <button onClick={() => editar(c)} style={s.acao}>✏️ Ficha</button>
                  <button onClick={() => resetarSenha(c)} style={s.acao}>🔑 Senha</button>
                  {c.ativo !== 0 && <button onClick={() => setDesligarAlvo({ id: c.id, nome: c.nome })} style={{ ...s.acao, color: '#993C1D' }}>🚪 Desligar</button>}
                </div>
              </div>
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 6, background: c.ativo ? '#EAF3DE' : '#FCEBEB', color: c.ativo ? '#3B6D11' : '#993C1D', height: 'fit-content', alignSelf: 'flex-start' }}>{c.ativo ? 'ativo' : 'inativo'}</span>
            </div>
          ))}
        </div>
        {listaFiltrada.length === 0 && <div style={{ fontSize: 12, color: '#999', padding: 10 }}>Nenhum colaborador encontrado.</div>}
      </div>

      {desligarAlvo && <ModalDesligar API={API} alvo={desligarAlvo} onClose={() => setDesligarAlvo(null)} onFeito={() => { setDesligarAlvo(null); carregar(); cancelarEdicao(); }} />}
    </>
  );
}

function ModalDesligar({ API, alvo, onClose, onFeito }) {
  const [f, setF] = useState({ tipo: 'voluntario', data_desligamento: '', motivo_rh: '', obs_rh: '' });
  const [link, setLink] = useState(null);
  const [msg, setMsg] = useState('');
  const registrar = () => {
    if (!window.confirm(`Registrar o desligamento de ${alvo.nome}? O colaborador será inativado.`)) return;
    API.post('/desligamentos', { colaborador_id: alvo.id, ...f }).then(r => setLink(window.location.origin + r.data.link)).catch(e => setMsg(e.response?.data?.erro || 'Erro.'));
  };
  const copiar = () => { navigator.clipboard?.writeText(link); setMsg('✅ Link copiado!'); };
  const inp = { width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginBottom: 8 };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🚪 Desligar — {alvo.nome}</div>
        {!link ? (<>
          <div style={{ fontSize: 12, color: '#8A94A6', marginBottom: 12 }}>Registra o desligamento (inativa o colaborador) e gera o link da pesquisa de saída pra enviar.</div>
          <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} style={inp}>
            {[['voluntario', 'Voluntário (pediu saída)'], ['involuntario', 'Involuntário (empresa)'], ['fim_contrato', 'Fim de contrato'], ['outro', 'Outro']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label style={{ fontSize: 11, color: '#888' }}>Data do desligamento</label>
          <input type="date" value={f.data_desligamento} onChange={e => setF({ ...f, data_desligamento: e.target.value })} style={inp} />
          <input value={f.motivo_rh} onChange={e => setF({ ...f, motivo_rh: e.target.value })} placeholder="Motivo (registro do RH)" style={inp} />
          <textarea value={f.obs_rh} onChange={e => setF({ ...f, obs_rh: e.target.value })} placeholder="Observações (opcional)" rows={2} style={{ ...inp, resize: 'vertical' }} />
          {msg && <div style={{ fontSize: 12, color: '#993C1D', marginBottom: 8 }}>{msg}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={registrar} style={{ ...s.btn, background: '#993C1D', flex: 1 }}>Registrar desligamento</button>
            <button onClick={onClose} style={{ ...s.btn, background: '#eee', color: '#666' }}>Cancelar</button>
          </div>
        </>) : (<>
          <div style={{ fontSize: 13, color: '#3B6D11', margin: '8px 0' }}>✅ Desligamento registrado. Envie a pesquisa de saída:</div>
          <div style={{ display: 'flex', gap: 6 }}><input readOnly value={link} style={{ ...inp, marginBottom: 0 }} /><button onClick={copiar} style={{ ...s.btn, background: '#185FA5' }}>Copiar</button></div>
          {msg && <div style={{ fontSize: 12, color: '#3B6D11', marginTop: 6 }}>{msg}</div>}
          <button onClick={onFeito} style={{ ...s.btn, width: '100%', marginTop: 12 }}>Concluir</button>
        </>)}
      </div>
    </div>
  );
}

function Lojas({ API, podeCriar }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState({ nome: '', apelido: '', razao_social: '', cnpj: '', endereco: '', cidade: '' });
  const [msg, setMsg] = useState('');
  const [colabs, setColabs] = useState([]);

  const carregar = useCallback(() => { API.get('/config/lojas').then(r => setLista(r.data.lojas || [])).catch(() => API.get('/referencias/lojas').then(r => setLista(r.data.lojas || []))); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { API.get('/colaboradores').then(r => setColabs(r.data.colaboradores || [])).catch(() => {}); }, [API]);
  const setGestor = (lojaId, campo, valor) => API.patch(`/config/lojas/${lojaId}`, { [campo]: valor || '' }).then(carregar);

  async function salvar() {
    setMsg('');
    if (!form.nome) { setMsg('Nome da loja obrigatório.'); return; }
    try {
      await API.post('/config/lojas', form);
      setMsg('✅ Loja cadastrada.');
      setForm({ nome: '', apelido: '', razao_social: '', cnpj: '', endereco: '', cidade: '' });
      carregar();
    } catch (e) {
      setMsg(e.response?.data?.erro || 'Erro ao cadastrar loja.');
    }
  }

  return (
    <>
      {podeCriar && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Nova loja</div>
          <input style={s.campo} placeholder="Nome da loja (apelido de uso) *" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
          <input style={s.campo} placeholder="Razão social (nome que sai nos contratos)" value={form.razao_social} onChange={e => setForm({ ...form, razao_social: e.target.value })} />
          <input style={s.campo} placeholder="CNPJ" value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} />
          <input style={s.campo} placeholder="Endereço completo" value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} />
          <input style={s.campo} placeholder="Cidade" value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} />
          <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>💡 Razão social, CNPJ e endereço alimentam o contrato do estagiário (empresa de registro/atuação).</div>
          {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginBottom: 8 }}>{msg}</div>}
          <button style={s.btn} onClick={salvar}>Cadastrar loja</button>
        </div>
      )}

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Lojas ({lista.length})</div>
        {lista.map(l => {
          const daLoja = colabs.filter(c => c.loja_id === l.id);
          return (
          <div key={l.id} style={{ ...s.item, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{l.nome}{l.apelido ? <span style={{ fontSize: 11, color: '#999', fontWeight: 400 }}> · {l.apelido}</span> : null}</div>
                <div style={{ fontSize: 11, color: '#999' }}>{l.razao_social ? l.razao_social : (l.cidade || 'sem cidade')}{l.cnpj ? ` · ${l.cnpj}` : ''}</div>
              </div>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: l.ativa ? '#EAF3DE' : '#FCEBEB', color: l.ativa ? '#3B6D11' : '#993C1D', height: 'fit-content' }}>{l.ativa ? 'ativa' : 'inativa'}</span>
            </div>
            {podeCriar && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ ...s.lbl, flex: 1.4, minWidth: 220 }}>🏢 Razão social (contrato)
                  <input defaultValue={l.razao_social || ''} placeholder="ex.: MUTTI COMÉRCIO DE MEDICAMENTOS LTDA" style={{ ...s.campo, marginBottom: 0 }}
                    onBlur={e => { if (e.target.value !== (l.razao_social || '')) setGestor(l.id, 'razao_social', e.target.value); }} />
                </label>
                <label style={{ ...s.lbl, flex: 0.7, minWidth: 150 }}>CNPJ
                  <input defaultValue={l.cnpj || ''} placeholder="00.000.000/0001-00" style={{ ...s.campo, marginBottom: 0 }}
                    onBlur={e => { if (e.target.value !== (l.cnpj || '')) setGestor(l.id, 'cnpj', e.target.value); }} />
                </label>
                <label style={{ ...s.lbl, flex: 1, minWidth: 180 }}>🏷️ Apelido (uso interno)
                  <input defaultValue={l.apelido || ''} placeholder="ex.: Multi Esplanada" style={{ ...s.campo, marginBottom: 0 }}
                    onBlur={e => { if (e.target.value !== (l.apelido || '')) setGestor(l.id, 'apelido', e.target.value); }} />
                </label>
                <label style={{ ...s.lbl, flex: 2, minWidth: 260 }}>📍 Endereço (contrato)
                  <input defaultValue={l.endereco || ''} placeholder="Rua, nº, bairro, cidade/UF" style={{ ...s.campo, marginBottom: 0 }}
                    onBlur={e => { if (e.target.value !== (l.endereco || '')) setGestor(l.id, 'endereco', e.target.value); }} />
                </label>
                <label style={{ ...s.lbl, flex: 1, minWidth: 180 }}>👔 Gerente
                  <select value={l.gerente_id || ''} onChange={e => setGestor(l.id, 'gerente_id', e.target.value)} style={{ ...s.campo, marginBottom: 0 }}>
                    <option value="">— sem gerente —</option>
                    {daLoja.map(c => <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ` (${c.funcao})` : ''}</option>)}
                  </select>
                </label>
                <label style={{ ...s.lbl, flex: 1, minWidth: 180 }}>🧑‍💼 Subgerente (opcional)
                  <select value={l.subgerente_id || ''} onChange={e => setGestor(l.id, 'subgerente_id', e.target.value)} style={{ ...s.campo, marginBottom: 0 }}>
                    <option value="">— sem subgerente —</option>
                    {daLoja.map(c => <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ` (${c.funcao})` : ''}</option>)}
                  </select>
                </label>
                <label style={{ ...s.lbl, flex: 1, minWidth: 200 }}>🤝 Sócio que assina o contrato
                  <select value={l.socio_assina_id || ''} onChange={e => setGestor(l.id, 'socio_assina_id', e.target.value)} style={{ ...s.campo, marginBottom: 0 }}>
                    <option value="">— escolher sócio —</option>
                    {colabs.filter(c => c.is_socio).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </>
  );
}

function Premiacoes({ API }) {
  const [funcoes, setFuncoes] = useState([]);
  const [funcaoId, setFuncaoId] = useState('');
  const [regra, setRegra] = useState({ faixa1_valor: 0, faixa2_valor: 0, faixa3_valor: 0, faixa4_valor: 0 });
  const [max, setMax] = useState('');
  const [msg, setMsg] = useState('');
  const [todas, setTodas] = useState([]);

  const carregarTodas = () => API.get('/regras/premiacao-todas').then(r => setTodas(r.data.funcoes || []));
  useEffect(() => { carregarTodas(); }, []); // eslint-disable-line

  useEffect(() => { API.get('/referencias/funcoes').then(r => { const f = r.data.funcoes || []; setFuncoes(f); if (f.length && !funcaoId) setFuncaoId(f[0].id); }); }, [API]); // eslint-disable-line
  useEffect(() => {
    if (!funcaoId) return; setMsg('');
    API.get('/regras/premiacao', { params: { funcao_id: funcaoId } }).then(r => { setRegra(r.data.regra); setMax(r.data.regra.faixa1_valor || ''); });
  }, [API, funcaoId]);

  function aplicarPesos(v) {
    const n = Number(v) || 0; setMax(v);
    const f50 = x => Math.floor(x / 50) * 50;
    setRegra({ ...regra, faixa1_valor: n, faixa2_valor: f50(n * 0.75), faixa3_valor: f50(n * 0.5), faixa4_valor: f50(n * 0.25) });
  }
  async function salvar() {
    await API.post('/regras/premiacao', { funcao_id: funcaoId, ...regra });
    setMsg('✅ Regra salva para esta função.'); carregarTodas();
  }

  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Regra de premiação por função</div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Digite <strong>o valor em R$ de cada faixa</strong> de desempenho. É o que o colaborador recebe conforme a nota dele nos indicadores da função. <strong>O topo (100%) só com nota 100.</strong></div>
      <label style={s.rotulo}>Função</label>
      <select style={s.campo} value={funcaoId} onChange={e => setFuncaoId(e.target.value)}>
        {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
      </select>
      <label style={s.rotulo}>% aceitável (nota a partir da qual vale a faixa cheia)</label>
      <input style={s.campo} type="number" value={regra.aceitavel ?? 90} onChange={e => setRegra({ ...regra, aceitavel: Number(e.target.value) })} />

      <label style={s.rotulo}>Valor de cada faixa (R$)</label>
      {[
        ['faixa1_valor', 'Nota 100', 'prêmio cheio', '#3B6D11'],
        ['faixa2_valor', `≥ ${regra.aceitavel ?? 90}%`, 'dentro do aceitável', '#3B6D11'],
        ['faixa3_valor', `${(regra.aceitavel ?? 90) - 10}–${(regra.aceitavel ?? 90) - 1}%`, 'um pouco abaixo', '#BA7517'],
        ['faixa4_valor', `${(regra.aceitavel ?? 90) - 20}–${(regra.aceitavel ?? 90) - 11}%`, 'bem abaixo', '#993C1D'],
      ].map(([campo, faixaLbl, desc, cor]) => (
        <div key={campo} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f5f5f5' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: cor }}>{faixaLbl}</div>
            <div style={{ fontSize: 10, color: '#999' }}>{desc}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#999' }}>R$</span>
            <input style={{ ...s.campoSm, width: 110, fontWeight: 700 }} type="number" min="0" step="1" value={regra[campo] || ''} placeholder="0"
              onChange={e => setRegra({ ...regra, [campo]: Number(e.target.value) || 0 })} />
          </div>
        </div>
      ))}
      <div style={{ fontSize: 11, color: '#999', margin: '6px 0 10px' }}>Abaixo de {(regra.aceitavel ?? 90) - 20}% = sem premiação (R$ 0).</div>

      <details style={{ marginBottom: 10 }}>
        <summary style={{ fontSize: 11, color: '#185FA5', cursor: 'pointer' }}>Preencher automático a partir de um teto</summary>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: '#666' }}>Teto (nota 100): R$</span>
          <input style={{ ...s.campoSm, width: 110 }} type="number" placeholder="ex.: 200" value={max} onChange={e => setMax(e.target.value)} />
          <button type="button" style={{ ...s.btn, padding: '6px 12px', fontSize: 12 }} onClick={() => aplicarPesos(max)}>Dividir ~100/75/50/25%</button>
        </div>
      </details>

      {msg && <div style={{ fontSize: 12, color: '#3B6D11', margin: '8px 0' }}>{msg}</div>}
      <button style={s.btn} onClick={salvar}>Salvar regra</button>

      <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Regras já cadastradas</div>
        {todas.filter(f => f.regra).length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhuma regra cadastrada ainda.</div>}
        {todas.filter(f => f.regra).map(f => (
          <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
            <span>{f.nome}</span>
            <span style={{ color: '#666' }}>≥{f.regra.aceitavel}% · R$ {f.regra.faixa1_valor} / {f.regra.faixa2_valor} / {f.regra.faixa3_valor} / {f.regra.faixa4_valor}</span>
          </div>
        ))}
      </div>

      <PremiacaoPct API={API} />
    </div>
  );
}

// Percentuais de premiação SOBRE VENDAS (antes fixos no código): vendedor e gerente.
function PremiacaoPct({ API }) {
  const [vend, setVend] = useState(null); const [ger, setGer] = useState([]); const [msg, setMsg] = useState('');
  useEffect(() => { API.get('/regras/premiacao-pct').then(r => { setVend(r.data.vendedor); setGer(r.data.gerente || []); }).catch(() => {}); }, [API]);
  async function salvar() { const r = await API.put('/regras/premiacao-pct', { vendedor: vend, gerente: ger }); setVend(r.data.vendedor); setGer(r.data.gerente || ger); setMsg('✅ Percentuais salvos.'); setTimeout(() => setMsg(''), 2500); }
  if (!vend) return null;
  const setG = (i, k, v) => setGer(ger.map((f, j) => j === i ? { ...f, [k]: Number(v) || 0 } : f));
  return (
    <div style={{ marginTop: 16, borderTop: '2px solid #eee', paddingTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Premiação sobre vendas (%)</div>
      <div style={{ fontSize: 11.5, color: '#666', marginBottom: 10 }}>Antes fixo no código. Aqui você define o percentual que <b>vendedor</b> e <b>gerente</b> ganham sobre as vendas.</div>

      <div style={{ fontSize: 12, fontWeight: 700, color: '#185FA5', marginBottom: 6 }}>Vendedor — % sobre a venda dele</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        {[['sup', 'Bateu a super meta', '#3B6D11'], ['meta', 'Bateu a meta', '#185FA5'], ['parcial', 'Abaixo da meta', '#BA7517']].map(([k, lbl, cor]) => (
          <div key={k}>
            <div style={{ fontSize: 10.5, color: cor, fontWeight: 600 }}>{lbl}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <input type="number" min="0" step="0.5" value={vend[k]} onChange={e => setVend({ ...vend, [k]: Number(e.target.value) || 0 })} style={{ ...s.campoSm, width: 70, fontWeight: 700 }} /><span style={{ fontSize: 12, color: '#999' }}>%</span>
            </div>
          </div>
        ))}
        <div>
          <div style={{ fontSize: 10.5, color: '#666', fontWeight: 600 }}>Nota mín. p/ o super %</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <input type="number" min="0" max="100" value={vend.limiar} onChange={e => setVend({ ...vend, limiar: Number(e.target.value) || 0 })} style={{ ...s.campoSm, width: 70 }} /><span style={{ fontSize: 12, color: '#999' }}>%</span>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: '#999', marginBottom: 12 }}>Ex.: só ganha o super % se bater a super meta E tiver nota dos indicadores ≥ {vend.limiar}%.</div>

      <div style={{ fontSize: 12, fontWeight: 700, color: '#185FA5', marginBottom: 6 }}>Gerente — % conforme a nota geral dos pilares</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {ger.map((f, i) => (
          <div key={i} style={{ border: '1px solid #eee', borderRadius: 8, padding: '6px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>nota ≥ <input type="number" min="0" max="100" value={f.min} onChange={e => setG(i, 'min', e.target.value)} style={{ ...s.campoSm, width: 56 }} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, marginTop: 3 }}>ganha <input type="number" min="0" step="0.5" value={f.pct} onChange={e => setG(i, 'pct', e.target.value)} style={{ ...s.campoSm, width: 56, fontWeight: 700 }} />%</div>
          </div>
        ))}
      </div>

      {msg && <div style={{ fontSize: 12, color: '#3B6D11', margin: '10px 0 0' }}>{msg}</div>}
      <button style={{ ...s.btn, marginTop: 12 }} onClick={salvar}>Salvar percentuais</button>
    </div>
  );
}

// 🔐 Acessos — quais funções veem quais menus. Guarda só os desvios do padrão do sistema.
// Trava: Diretor Geral vê tudo (não editável); Gestor Geral nunca perde Parâmetros/Acessos.
function AcessosConfig({ API }) {
  const [funcoes, setFuncoes] = useState([]); const [overrides, setOverrides] = useState({});
  const [protegidos, setProtegidos] = useState([]); const [semOverride, setSemOverride] = useState([]);
  const [funcao, setFuncao] = useState(''); const [msg, setMsg] = useState(''); const [busca, setBusca] = useState('');
  // remove dos overrides as chaves de módulos que não existem mais (ex.: devolucoes) — limpa a config.
  const podar = (mp) => {
    const validos = new Set(MODULOS_META.map(m => m.id));
    const out = {};
    for (const [f, mods] of Object.entries(mp || {})) {
      const limpo = {};
      for (const [id, v] of Object.entries(mods || {})) if (validos.has(id)) limpo[id] = v;
      if (Object.keys(limpo).length) out[f] = limpo;
    }
    return out;
  };
  useEffect(() => {
    API.get('/acessos/config').then(r => {
      setFuncoes(r.data.funcoes || []); setOverrides(podar(r.data.overrides || {}));
      setProtegidos(r.data.protegidos || []); setSemOverride(r.data.sempreLiberado || []);
      setFuncao((r.data.funcoes || []).find(f => !((r.data.sempreLiberado || []).includes(f))) || '');
    }).catch(() => {});
  }, [API]);
  const ovF = overrides[funcao] || {};
  // estado tri: 'padrao' | 'liberado' (true) | 'bloqueado' (false)
  const estado = id => (ovF[id] === true ? 'liberado' : ovF[id] === false ? 'bloqueado' : 'padrao');
  function setEstado(id, novo) {
    setOverrides(prev => {
      const mp = { ...(prev[funcao] || {}) };
      if (novo === 'padrao') delete mp[id]; else mp[id] = (novo === 'liberado');
      return { ...prev, [funcao]: mp };
    });
  }
  async function salvar() { const r = await API.put('/acessos/config', { overrides: podar(overrides) }); setOverrides(podar(r.data.overrides || {})); setMsg('✅ Acessos salvos.'); setTimeout(() => setMsg(''), 2500); }
  const bloqueiaProtegido = id => protegidos.includes(id) && funcao === 'Gestor Geral';
  const travada = semOverride.includes(funcao);
  const mods = MODULOS_META.filter(m => !busca.trim() || m.label.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>🔐 Acessos por função</div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Escolha a função e defina o que ela vê. <b>Padrão</b> = regra do sistema; <b>Liberar</b> força mostrar; <b>Bloquear</b> esconde. Só ajuste o que quiser mudar.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <select value={funcao} onChange={e => setFuncao(e.target.value)} style={{ ...s.campo, width: 'auto', marginBottom: 0 }}>
          {funcoes.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <input placeholder="🔎 filtrar menu…" value={busca} onChange={e => setBusca(e.target.value)} style={{ ...s.campo, width: 180, marginBottom: 0 }} />
      </div>

      {travada ? (
        <div style={{ fontSize: 12.5, color: '#185FA5', background: '#EAF3FB', borderRadius: 8, padding: 12 }}>👑 <b>{funcao}</b> tem acesso total garantido (trava de segurança). Não é possível bloquear menus para essa função.</div>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
          {mods.map((m, i) => {
            const est = estado(m.id); const prot = bloqueiaProtegido(m.id);
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderTop: i ? '1px solid #f3f3f3' : 'none', background: est === 'bloqueado' ? '#FCF3F2' : est === 'liberado' ? '#F1FAF3' : '#fff' }}>
                <div style={{ flex: 1, fontSize: 12.5 }}>{m.label}{prot ? <span style={{ fontSize: 10, color: '#185FA5', marginLeft: 6 }}>(protegido)</span> : ''}</div>
                {[['padrao', 'Padrão', '#888'], ['liberado', 'Liberar', '#1E824C'], ['bloqueado', 'Bloquear', '#C0392B']].map(([v, lbl, cor]) => (
                  <button key={v} disabled={prot && v === 'bloqueado'} onClick={() => setEstado(m.id, v)}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 14, cursor: prot && v === 'bloqueado' ? 'not-allowed' : 'pointer', border: '1px solid ' + (est === v ? cor : '#ddd'), background: est === v ? cor : '#fff', color: est === v ? '#fff' : '#666', opacity: prot && v === 'bloqueado' ? 0.4 : 1 }}>{lbl}</button>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {msg && <div style={{ fontSize: 12, color: '#3B6D11', margin: '10px 0 0' }}>{msg}</div>}
      {!travada && <button style={{ ...s.btn, marginTop: 12 }} onClick={salvar}>Salvar acessos</button>}
    </div>
  );
}

function PilaresCadastro({ API }) {
  const [pilares, setPilares] = useState([]);
  const [totalPeso, setTotalPeso] = useState(0);
  const [msg, setMsg] = useState('');
  const [novoPilar, setNovoPilar] = useState({ nome: '', peso: '', cor: '#185FA5' });
  const [novoInd, setNovoInd] = useState({});

  const carregar = useCallback(() => {
    API.get('/pilares').then(r => { setPilares(r.data.pilares || []); setTotalPeso(r.data.total_peso || 0); });
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  async function salvarPilar(p, campo, valor) {
    try { await API.patch(`/pilares/${p.id}`, { [campo]: valor }); carregar(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); }
  }
  async function salvarInd(i, campo, valor) {
    try { await API.patch(`/pilares/indicadores/${i.id}`, { [campo]: valor }); carregar(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); }
  }
  async function addPilar() {
    if (!novoPilar.nome.trim()) { flash('Nome do pilar.'); return; }
    try { await API.post('/pilares', { ...novoPilar, peso: Number(novoPilar.peso) || 0 }); setNovoPilar({ nome: '', peso: '', cor: '#185FA5' }); carregar(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); }
  }
  async function addInd(pid) {
    const ni = novoInd[pid] || {};
    if (!ni.nome?.trim()) { flash('Nome do indicador.'); return; }
    try { await API.post('/pilares/indicadores', { pilar_id: pid, nome: ni.nome, min: Number(ni.min) || 0 }); setNovoInd({ ...novoInd, [pid]: { nome: '', min: '' } }); carregar(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); }
  }

  return (
    <div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>🏬 Pilares da loja — nota do gerente</div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Estes são os 4 pilares que compõem a <strong>nota da loja/gerente</strong>. Cada pilar tem indicadores; a nota do pilar é a média dos indicadores, e a nota do gerente é a média ponderada dos pilares (pesos somam 100). Não confunda com "Indicadores por função", que avalia <strong>cada pessoa</strong>.</div>
        <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>🔵 <strong>automático</strong> = o sistema calcula (vendas, checklist, auditoria, avaliações…). ✏️ <strong>manual</strong> = você lança a nota aqui embaixo. Ex.: o <strong>Checklist diário</strong> alimenta sozinho o indicador de mesmo nome no pilar Performance.</div>
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: totalPeso === 100 ? '#3B6D11' : '#854F0B' }}>
          Soma dos pesos: {totalPeso}{totalPeso !== 100 ? ' (ajuste para 100)' : ' ✓'}
        </div>
        {msg && <div style={{ fontSize: 12, color: '#854F0B', marginTop: 6 }}>{msg}</div>}
      </div>

      {pilares.map(p => (
        <div key={p.id} style={{ ...s.card, opacity: p.ativo ? 1 : 0.5, borderLeft: `4px solid ${p.cor || '#ccc'}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input defaultValue={p.nome} onBlur={e => e.target.value !== p.nome && salvarPilar(p, 'nome', e.target.value)}
              style={{ ...s.campo, marginBottom: 0, flex: 1, fontWeight: 600 }} />
            <div>
              <label style={{ fontSize: 10, color: '#999', display: 'block' }}>peso</label>
              <input type="number" defaultValue={p.peso} onBlur={e => Number(e.target.value) !== p.peso && salvarPilar(p, 'peso', Number(e.target.value))}
                style={{ ...s.campo, marginBottom: 0, width: 56 }} />
            </div>
            <button onClick={() => salvarPilar(p, 'ativo', !p.ativo)} style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6, background: 'none', cursor: 'pointer' }}>
              {p.ativo ? 'Desativar' : 'Ativar'}
            </button>
          </div>

          {p.indicadores.map(i => (
            <div key={i.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', borderTop: '1px solid #f5f5f5', opacity: i.ativo ? 1 : 0.45 }}>
              <span title={(i.fonte || 'manual') === 'manual' ? 'Você lança a nota' : 'O sistema calcula automaticamente'} style={{ fontSize: 11 }}>{(i.fonte || 'manual') === 'manual' ? '✏️' : '🔵'}</span>
              <input defaultValue={i.nome} onBlur={e => e.target.value !== i.nome && salvarInd(i, 'nome', e.target.value)}
                style={{ ...s.campo, marginBottom: 0, flex: 1, fontSize: 12 }} />
              <div>
                <label style={{ fontSize: 9, color: '#999', display: 'block' }}>mín</label>
                <input type="number" defaultValue={i.min} onBlur={e => Number(e.target.value) !== i.min && salvarInd(i, 'min', Number(e.target.value))}
                  style={{ ...s.campo, marginBottom: 0, width: 48, fontSize: 12 }} />
              </div>
              <select value={i.fonte || 'manual'} onChange={e => salvarInd(i, 'fonte', e.target.value)}
                title="Fonte da nota" style={{ fontSize: 10, padding: '3px 4px', border: '1px solid #ddd', borderRadius: 6, width: 86 }}>
                <option value="manual">manual</option>
                <option value="checklist">checklist</option>
                <option value="ocorrencia">ocorrência</option>
                <option value="vendas">vendas</option>
                <option value="tesouraria">tesouraria</option>
                <option value="avaliacao">avaliação</option>
              </select>
              <button onClick={() => salvarInd(i, 'ativo', !i.ativo)} style={{ fontSize: 10, padding: '3px 6px', border: '1px solid #ddd', borderRadius: 6, background: 'none', cursor: 'pointer' }}>
                {i.ativo ? '×' : '✓'}
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input placeholder="novo indicador" value={novoInd[p.id]?.nome || ''} onChange={e => setNovoInd({ ...novoInd, [p.id]: { ...novoInd[p.id], nome: e.target.value } })}
              style={{ ...s.campo, marginBottom: 0, flex: 1, fontSize: 12 }} />
            <input type="number" placeholder="mín" value={novoInd[p.id]?.min || ''} onChange={e => setNovoInd({ ...novoInd, [p.id]: { ...novoInd[p.id], min: e.target.value } })}
              style={{ ...s.campo, marginBottom: 0, width: 48, fontSize: 12 }} />
            <button onClick={() => addInd(p.id)} style={{ ...s.btn, width: 'auto', padding: '4px 10px', fontSize: 12 }}>+</button>
          </div>
        </div>
      ))}

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Novo pilar</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Nome do pilar" value={novoPilar.nome} onChange={e => setNovoPilar({ ...novoPilar, nome: e.target.value })} style={{ ...s.campo, marginBottom: 0, flex: 1 }} />
          <input type="number" placeholder="peso" value={novoPilar.peso} onChange={e => setNovoPilar({ ...novoPilar, peso: e.target.value })} style={{ ...s.campo, marginBottom: 0, width: 64 }} />
          <input type="color" value={novoPilar.cor} onChange={e => setNovoPilar({ ...novoPilar, cor: e.target.value })} style={{ width: 40, height: 36, border: 'none', background: 'none' }} />
        </div>
        <button style={{ ...s.btn, marginTop: 8 }} onClick={addPilar}>Criar pilar</button>
        <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>Indicador novo entra como <strong>manual</strong>. Escolha a fonte de cada indicador acima: <strong>checklist</strong>/<strong>ocorrência</strong> se ligam quando você aponta um checklist ou uma ocorrência para ele; <strong>manual</strong> você lança a nota aqui embaixo.</div>
      </div>

      <NotasManuaisLancar API={API} />
    </div>
  );
}

function NotasManuaisLancar({ API }) {
  const hoje = new Date();
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState('');
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [inds, setInds] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => { API.get('/config/lojas').then(r => { const ls = r.data.lojas || []; setLojas(ls); if (ls[0]) setLojaId(ls[0].id); }).catch(() => {}); }, [API]);
  const carregar = useCallback(() => {
    if (!lojaId) return;
    API.get('/pilares/notas-manuais', { params: { loja_id: lojaId, mes, ano } }).then(r => setInds(r.data.indicadores || [])).catch(() => {});
  }, [API, lojaId, mes, ano]);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(indId, nota) {
    try { await API.post('/pilares/notas-manuais', { loja_id: lojaId, mes, ano, indicador_id: indId, nota: Number(nota) }); setMsg('✅ Nota lançada.'); setTimeout(() => setMsg(''), 2000); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }

  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Lançar notas manuais</div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>Para os indicadores de fonte <strong>manual</strong>. Nota de 0 a 100, por loja e mês.</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <select value={lojaId} onChange={e => setLojaId(e.target.value)} style={{ ...s.campo, marginBottom: 0, flex: 1, minWidth: 120 }}>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        <select value={mes} onChange={e => setMes(Number(e.target.value))} style={{ ...s.campo, marginBottom: 0, width: 70 }}>
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}
        </select>
        <input type="number" value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...s.campo, marginBottom: 0, width: 70 }} />
      </div>
      {msg && <div style={{ fontSize: 12, color: '#3B6D11', marginBottom: 6 }}>{msg}</div>}
      {inds.length === 0 && <div style={{ fontSize: 12, color: '#aaa' }}>Nenhum indicador de fonte manual. Marque a fonte de um indicador como "manual" acima.</div>}
      {inds.map(i => (
        <div key={i.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '5px 0', borderTop: '1px solid #f5f5f5' }}>
          <div style={{ flex: 1, fontSize: 12 }}>{i.nome} <span style={{ color: '#bbb', fontSize: 10 }}>· {i.pilar_nome}</span></div>
          <input type="number" min="0" max="100" defaultValue={i.nota != null ? i.nota : ''} placeholder="—"
            onBlur={e => e.target.value !== '' && Number(e.target.value) !== i.nota && salvar(i.id, e.target.value)}
            style={{ ...s.campo, marginBottom: 0, width: 64, fontSize: 12, textAlign: 'center' }} />
        </div>
      ))}
    </div>
  );
}

function ConquistasCadastro({ API }) {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano] = useState(hoje.getFullYear());
  const [pontos, setPontos] = useState(10);
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function conceder() {
    setMsg(''); setCarregando(true);
    try {
      const r = await API.post('/certificados/auto/caixa-sem-erro', { mes, ano, pontos: Number(pontos) || 0 });
      setMsg(r.data.mensagem);
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
    setCarregando(false);
  }

  return (
    <div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Conquistas por outras fontes</div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Além dos certificados, as conquistas podem ser concedidas automaticamente a partir do desempenho. A primeira fonte automática é o <strong>caixa sem erros no mês</strong>.</div>
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>🏦 Caixa sem erros no mês</div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Concede a conquista aos caixas que tiveram fechamentos no mês e <strong>nenhuma diferença</strong> (nem sobra, nem falta). Não duplica se já concedida.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div>
            <label style={s.rotulo}>Mês</label>
            <select style={{ ...s.campo, width: 'auto' }} value={mes} onChange={e => setMes(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}/{ano}</option>)}
            </select>
          </div>
          <div>
            <label style={s.rotulo}>Pontos</label>
            <input style={{ ...s.campo, width: 70 }} type="number" value={pontos} onChange={e => setPontos(e.target.value)} />
          </div>
        </div>
        {msg && <div style={{ fontSize: 12, color: msg.toLowerCase().includes('nenhum') ? '#854F0B' : '#3B6D11', marginBottom: 8 }}>{msg}</div>}
        <button style={s.btn} onClick={conceder} disabled={carregando}>{carregando ? 'Concedendo…' : 'Conceder conquistas'}</button>
      </div>
    </div>
  );
}

function OcorrenciasCadastro({ API }) {
  const [motivos, setMotivos] = useState([]);
  const [indicadores, setIndicadores] = useState([]);
  const vazio = { categoria: 'RH', motivo: '', deducao: '', zera: false, indicador_alvo: 'conduta', indicador_gerente: '', exige_termo: false, termo_tipo: 'advertencia', pontos: '' };
  const [form, setForm] = useState(vazio);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState('');

  const carregar = () => API.get('/ocorrencias/motivos').then(r => setMotivos(r.data.motivos || []));
  useEffect(() => { carregar(); API.get('/operacional/indicadores').then(r => setIndicadores(r.data.indicadores || [])); }, []); // eslint-disable-line
  const nomeInd = id => indicadores.find(i => i.id === id)?.nome || id;

  function editar(mo) {
    setEditId(mo.id);
    setForm({ categoria: mo.categoria || 'RH', motivo: mo.motivo || '', deducao: mo.zera ? '' : (mo.deducao ?? ''), zera: !!mo.zera, indicador_alvo: mo.indicador_alvo || 'conduta', indicador_gerente: mo.indicador_gerente || '', exige_termo: !!mo.exige_termo, termo_tipo: mo.termo_tipo || 'advertencia', pontos: mo.pontos ?? '' });
    setMsg('');
  }
  function cancelarEdicao() { setEditId(null); setForm(vazio); setMsg(''); }

  async function salvar() {
    if (!form.motivo.trim()) { setMsg('Descreva o motivo.'); return; }
    if (!form.indicador_alvo.trim()) { setMsg('Informe o indicador do colaborador.'); return; }
    try {
      const corpo = { ...form, deducao: Number(form.deducao) || 0, pontos: Math.trunc(Number(form.pontos) || 0) };
      if (editId) {
        await API.put(`/ocorrencias/motivos/${editId}`, corpo);
        setMsg('✅ Motivo atualizado.'); setEditId(null); setForm(vazio);
      } else {
        await API.post('/ocorrencias/motivos', corpo);
        setMsg('✅ Motivo cadastrado.'); setForm({ ...form, motivo: '', deducao: '', zera: false, indicador_gerente: '', pontos: '' });
      }
      carregar();
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }

  async function excluir(mo) {
    if (!window.confirm(`Excluir o motivo "${mo.motivo}"? As ocorrências já lançadas com ele continuam intactas.`)) return;
    try {
      await API.delete(`/ocorrencias/motivos/${mo.id}`);
      if (editId === mo.id) cancelarEdicao();
      setMsg('✅ Motivo excluído.'); carregar();
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro ao excluir.'); }
  }

  return (
    <div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{editId ? '✏️ Editar motivo de ocorrência' : 'Novo motivo de ocorrência'}</div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>A ocorrência pode impactar dois indicadores: o do <strong>colaborador</strong> (ex.: conduta) e o do <strong>gerente</strong> (no painel da loja).</div>
        <label style={s.rotulo}>Categoria</label>
        <input style={s.campo} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: RH, Operacional…" />
        <label style={s.rotulo}>Motivo</label>
        <input style={s.campo} value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} placeholder="Ex.: Atraso" />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <label style={s.rotulo}>Dedução (%)</label>
            <input style={s.campo} type="number" value={form.deducao} onChange={e => setForm({ ...form, deducao: e.target.value })} disabled={form.zera} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 14 }}>
            <input type="checkbox" checked={form.zera} onChange={e => setForm({ ...form, zera: e.target.checked })} /> Zera o indicador
          </label>
        </div>
        <label style={s.rotulo}>Impacto em pontos no colaborador (gamificação)</label>
        <input style={s.campo} type="number" value={form.pontos} onChange={e => setForm({ ...form, pontos: e.target.value })} placeholder="Ex.: -20 (desconta) · 0 = não mexe nos pontos" />
        <div style={{ fontSize: 11, color: '#999', marginTop: -6, marginBottom: 8 }}>Aplicado quando o RH autoriza a ocorrência. Ex.: um atraso pode impactar o indicador do gerente e ainda descontar pontos do colaborador. Negativo desconta, positivo dá.</div>
        <label style={s.rotulo}>Indicador do colaborador</label>
        <select style={s.campo}
          value={(form.indicador_alvo === 'conduta' || indicadores.some(i => i.id === form.indicador_alvo)) ? form.indicador_alvo : '__outro'}
          onChange={e => setForm({ ...form, indicador_alvo: e.target.value === '__outro' ? '' : e.target.value })}>
          <option value="conduta">Conduta (padrão RH)</option>
          {indicadores.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.pilar})</option>)}
          <option value="__outro">Outro (digitar)…</option>
        </select>
        {!(form.indicador_alvo === 'conduta' || indicadores.some(i => i.id === form.indicador_alvo)) && (
          <input style={s.campo} placeholder="Chave do indicador (ex.: conduta)" value={form.indicador_alvo} onChange={e => setForm({ ...form, indicador_alvo: e.target.value })} />
        )}
        <label style={s.rotulo}>Indicador do gerente (painel da loja) — opcional</label>
        <select style={s.campo} value={form.indicador_gerente} onChange={e => setForm({ ...form, indicador_gerente: e.target.value })}>
          <option value="">— nenhum —</option>
          {indicadores.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.pilar})</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, margin: '8px 0 4px' }}>
          <input type="checkbox" checked={form.exige_termo} onChange={e => setForm({ ...form, exige_termo: e.target.checked })} /> Exige termo/texto (advertência ou suspensão)
        </label>
        {form.exige_termo && (
          <select style={s.campo} value={form.termo_tipo} onChange={e => setForm({ ...form, termo_tipo: e.target.value })}>
            <option value="advertencia">Modelo: Advertência</option>
            <option value="suspensao">Modelo: Suspensão</option>
          </select>
        )}
        {msg && <div style={{ fontSize: 12, color: '#3B6D11', marginBottom: 8 }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn} onClick={salvar}>{editId ? 'Salvar alteração' : 'Cadastrar motivo'}</button>
          {editId && <button style={{ ...s.btn, background: 'none', color: '#666', border: '1px solid #ddd' }} onClick={cancelarEdicao}>Cancelar</button>}
        </div>
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Motivos cadastrados ({motivos.length})</div>
        {motivos.map(mo => (
          <div key={mo.id} style={{ fontSize: 12, padding: '5px 0', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, background: editId === mo.id ? '#FAF6E9' : 'none' }}>
            <div style={{ flex: 1 }}>
              <strong>{mo.motivo}</strong> <span style={{ color: '#999' }}>· {mo.categoria} · {mo.zera ? 'zera' : `-${mo.deducao}%`}</span>{mo.pontos ? <span style={{ fontSize: 10, fontWeight: 700, color: mo.pontos < 0 ? '#993C1D' : '#3B6D11', background: mo.pontos < 0 ? '#FCEBEB' : '#EAF3E9', borderRadius: 5, padding: '1px 6px', marginLeft: 6 }}>{mo.pontos > 0 ? '+' : ''}{mo.pontos} pts</span> : null}{mo.exige_termo ? <span style={{ fontSize: 10, color: '#854F0B', background: '#FAEEDA', borderRadius: 5, padding: '1px 6px', marginLeft: 6 }}>📄 termo: {mo.termo_tipo === 'suspensao' ? 'suspensão' : 'advertência'}</span> : null}
              <div style={{ fontSize: 11, color: '#999' }}>colaborador: {nomeInd(mo.indicador_alvo)}{mo.indicador_gerente ? ` · gerente: ${nomeInd(mo.indicador_gerente)}` : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button onClick={() => editar(mo)} style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #ddd', borderRadius: 6, background: 'none', cursor: 'pointer', color: '#333' }}>✏️ editar</button>
              <button onClick={() => excluir(mo)} style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #F1C9BD', borderRadius: 6, background: '#FBEAE5', color: '#993C1D', cursor: 'pointer' }}>🗑️ excluir</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Cadastro de empresas terceirizadas (usado no campo "Empresa de registro" do colaborador)
function TerceirizadasCadastro({ API }) {
  const [lista, setLista] = useState([]);
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = () => API.get('/referencias/terceirizadas').then(r => setLista(r.data.terceirizadas || [])).catch(() => {});
  useEffect(() => { carregar(); }, []); // eslint-disable-line
  async function add() {
    if (!nome.trim()) { setMsg('Informe o nome.'); return; }
    try { await API.post('/referencias/terceirizadas', { nome, cnpj }); setNome(''); setCnpj(''); setMsg('✅ Cadastrada.'); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }
  async function remover(id) { try { await API.delete(`/referencias/terceirizadas/${id}`); carregar(); } catch (e) { /* */ } }
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Empresas terceirizadas</div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Cadastre as empresas terceirizadas para selecionar como <strong>empresa de registro</strong> do colaborador (aparece no termo de advertência/suspensão).</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...s.campo, flex: 1, minWidth: 160, marginBottom: 0 }} placeholder="Nome da empresa" value={nome} onChange={e => setNome(e.target.value)} />
        <input style={{ ...s.campo, width: 160, marginBottom: 0 }} placeholder="CNPJ (opcional)" value={cnpj} onChange={e => setCnpj(e.target.value)} />
        <button style={s.btn} onClick={add}>+ Adicionar</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', margin: '6px 0' }}>{msg}</div>}
      {lista.length > 0 && <div style={{ marginTop: 8 }}>
        {lista.map(t => (
          <div key={t.id} style={{ fontSize: 12, padding: '5px 0', borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'center' }}>
            <span style={{ flex: 1 }}><strong>{t.nome}</strong>{t.cnpj ? <span style={{ color: '#999' }}> · {t.cnpj}</span> : null}</span>
            <button style={{ border: 'none', background: 'none', color: '#993C1D', cursor: 'pointer', fontSize: 12 }} onClick={() => remover(t.id)}>remover</button>
          </div>
        ))}
      </div>}
    </div>
  );
}

function RHMovimentacoes({ API }) {
  const [colabs, setColabs] = useState([]);
  const [lojas, setLojas] = useState([]);
  const [cid, setCid] = useState('');
  const [movs, setMovs] = useState([]);
  const [afs, setAfs] = useState([]);
  const [msg, setMsg] = useState('');
  const hoje = new Date().toISOString().slice(0, 10);
  const [transf, setTransf] = useState({ loja_destino_id: '', data_inicio: hoje, motivo: '' });
  const [afast, setAfast] = useState({ tipo: 'ferias', data_inicio: hoje, data_fim: '', motivo: '', substituto_id: '' });
  const [afastCands, setAfastCands] = useState(null);
  const [loteAf, setLoteAf] = useState({ tipo: 'ferias', data_inicio: hoje, data_fim: '', motivo: '' });
  const [loteLinhas, setLoteLinhas] = useState([{ colaborador_id: '', substituto_id: '', turno: '' }]);
  const setLinhaLote = (i, campo, val) => setLoteLinhas(loteLinhas.map((l, idx) => idx === i ? { ...l, [campo]: val } : l));

  useEffect(() => {
    API.get('/colaboradores').then(r => setColabs(r.data.colaboradores || r.data || [])).catch(() => {});
    API.get('/config/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {});
  }, [API]);

  const carregarHist = useCallback(() => {
    if (!cid) { setMovs([]); setAfs([]); return; }
    API.get(`/colaboradores/${cid}/movimentacoes`).then(r => setMovs(r.data.movimentacoes || [])).catch(() => setMovs([]));
    API.get(`/colaboradores/${cid}/afastamentos`).then(r => setAfs(r.data.afastamentos || [])).catch(() => setAfs([]));
  }, [API, cid]);
  useEffect(() => { carregarHist(); }, [carregarHist]);

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 3000); };
  const colabSel = colabs.find(c => c.id === cid);

  async function lancarTransf() {
    if (!cid) { flash('Escolha o colaborador.'); return; }
    if (!transf.loja_destino_id) { flash('Escolha a loja destino.'); return; }
    try {
      await API.post(`/colaboradores/${cid}/movimentacoes`, { tipo: 'transferencia', loja_origem_id: colabSel?.loja_id || null, loja_destino_id: transf.loja_destino_id, data_inicio: transf.data_inicio, tipo_transferencia: 'definitiva', motivo: transf.motivo });
      flash('✅ Transferência lançada. O colaborador muda de loja ao dar ciência.'); setTransf({ loja_destino_id: '', data_inicio: hoje, motivo: '' }); carregarHist();
    } catch (e) { flash(e.response?.data?.erro || 'Erro.'); }
  }
  async function lancarAfast() {
    if (!cid) { flash('Escolha o colaborador.'); return; }
    try {
      await API.post(`/colaboradores/${cid}/afastamentos`, afast);
      flash('✅ Registrado e colaborador avisado.'); setAfast({ tipo: 'ferias', data_inicio: hoje, data_fim: '', motivo: '', substituto_id: '' }); setAfastCands(null); carregarHist();
    } catch (e) {
      const d = e.response?.data;
      if (d?.precisa_substituto) { setAfastCands(d.candidatos || []); flash('⚠️ ' + d.erro); }
      else flash(d?.erro || 'Erro.');
    }
  }
  async function lancarLoteAf() {
    const pessoas = loteLinhas.filter(l => l.colaborador_id).map(l => ({ colaborador_id: l.colaborador_id, substituto_id: l.substituto_id || undefined, turno: l.turno || undefined }));
    if (!pessoas.length) { flash('Escolha ao menos uma pessoa.'); return; }
    if (!loteAf.data_inicio) { flash('Informe a data de início.'); return; }
    try {
      const r = await API.post('/colaboradores/afastamentos/lote', { ...loteAf, pessoas });
      flash('✅ ' + r.data.mensagem); setLoteLinhas([{ colaborador_id: '', substituto_id: '', turno: '' }]); setLoteAf({ tipo: 'ferias', data_inicio: hoje, data_fim: '', motivo: '' }); carregarHist();
    } catch (e) { flash(e.response?.data?.erro || 'Erro.'); }
  }
  async function removerAfast(afId) {
    if (!window.confirm('Remover este registro?')) return;
    try { await API.delete(`/colaboradores/${cid}/afastamentos/${afId}`); carregarHist(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); }
  }

  return (
    <div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>RH — Transferência e histórico do colaborador</div>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>Férias e afastamentos são lançados no bloco em lote abaixo (uma ou várias pessoas).</div>
        <select value={cid} onChange={e => setCid(e.target.value)} style={{ ...s.campo, marginBottom: 0 }}>
          <option value="">Escolha o colaborador…</option>
          {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}{c.loja ? ` · ${c.loja}` : ''}</option>)}
        </select>
        {msg && <div style={{ fontSize: 12, color: '#185FA5', marginTop: 8 }}>{msg}</div>}
      </div>

      {cid && (
        <>
          <div style={s.card}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>🧳 Transferência de loja</div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>Ao dar ciência, o colaborador passa para a nova loja (e vale as metas de lá).</div>
            <select value={transf.loja_destino_id} onChange={e => setTransf({ ...transf, loja_destino_id: e.target.value })} style={s.campo}>
              <option value="">Loja destino…</option>
              {lojas.filter(l => l.id !== colabSel?.loja_id).map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
            <input type="date" value={transf.data_inicio} onChange={e => setTransf({ ...transf, data_inicio: e.target.value })} style={s.campo} />
            <input placeholder="Motivo (opcional)" value={transf.motivo} onChange={e => setTransf({ ...transf, motivo: e.target.value })} style={s.campo} />
            <button style={s.btn} onClick={lancarTransf}>Lançar transferência</button>
          </div>

          <div style={s.card}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Histórico</div>
            {movs.length === 0 && afs.length === 0 && <div style={{ fontSize: 12, color: '#aaa' }}>Nada registrado.</div>}
            {afs.map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid #f5f5f5' }}>
                <div style={{ fontSize: 12 }}>{a.tipo === 'ferias' ? '🌴 Férias' : '🩺 Afastamento'} · {a.data_inicio}{a.data_fim ? ` a ${a.data_fim}` : ' (em aberto)'}{a.substituto_nome ? ` · substituto: ${a.substituto_nome}` : ''}{a.motivo ? ` · ${a.motivo}` : ''}</div>
                <button onClick={() => removerAfast(a.id)} style={{ fontSize: 11, color: '#993C1D', border: 'none', background: 'none', cursor: 'pointer' }}>remover</button>
              </div>
            ))}
            {movs.map(m => (
              <div key={m.id} style={{ fontSize: 12, padding: '6px 0', borderTop: '1px solid #f5f5f5' }}>
                🧳 {m.tipo === 'transferencia' ? 'Transferência' : 'Troca de turno'}{m.loja_destino_nome ? ` → ${m.loja_destino_nome}` : ''} · {m.data_inicio} · <span style={{ color: m.status === 'confirmado' ? '#3B6D11' : '#854F0B' }}>{m.status === 'confirmado' ? 'confirmado' : 'aguardando ciência'}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>🌴 Lançar férias/afastamento em lote</div>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>Independente do colaborador acima — várias pessoas de uma vez (mesmo período). Informe o substituto e o turno; ele recebe ciência com a loja e o turno.</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          {[['ferias', 'Férias'], ['afastamento', 'Afastamento']].map(([v, l]) => (
            <button key={v} onClick={() => setLoteAf({ ...loteAf, tipo: v })} style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: '6px 0', borderRadius: 8, cursor: 'pointer', border: `1px solid ${loteAf.tipo === v ? '#185FA5' : '#ddd'}`, background: loteAf.tipo === v ? '#E6F1FB' : '#fff', color: loteAf.tipo === v ? '#185FA5' : '#666' }}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: '#999' }}>Início</label><input type="date" value={loteAf.data_inicio} onChange={e => setLoteAf({ ...loteAf, data_inicio: e.target.value })} style={s.campo} /></div>
          <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: '#999' }}>Fim</label><input type="date" value={loteAf.data_fim} onChange={e => setLoteAf({ ...loteAf, data_fim: e.target.value })} style={s.campo} /></div>
        </div>
        <input placeholder="Motivo (opcional)" value={loteAf.motivo} onChange={e => setLoteAf({ ...loteAf, motivo: e.target.value })} style={s.campo} />
        {loteLinhas.map((ln, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
            <select value={ln.colaborador_id} onChange={e => setLinhaLote(i, 'colaborador_id', e.target.value)} style={{ ...s.campo, marginBottom: 0, width: 'auto', minWidth: 150 }}>
              <option value="">Pessoa…</option>
              {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}{c.loja ? ` · ${c.loja}` : ''}</option>)}
            </select>
            <select value={ln.substituto_id} onChange={e => setLinhaLote(i, 'substituto_id', e.target.value)} style={{ ...s.campo, marginBottom: 0, width: 'auto', minWidth: 140 }}>
              <option value="">Substituto…</option>
              {colabs.filter(c => c.id !== ln.colaborador_id).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <input placeholder="Turno (ex.: 08h–14h)" value={ln.turno} onChange={e => setLinhaLote(i, 'turno', e.target.value)} style={{ ...s.campo, marginBottom: 0, width: 130 }} />
            {loteLinhas.length > 1 && <button style={{ ...s.btn, background: '#999', padding: '6px 10px' }} onClick={() => setLoteLinhas(loteLinhas.filter((_, idx) => idx !== i))}>✕</button>}
          </div>
        ))}
        <button style={{ ...s.btn, background: '#fff', color: '#185FA5', border: '1px solid #185FA5', marginRight: 8 }} onClick={() => setLoteLinhas([...loteLinhas, { colaborador_id: '', substituto_id: '', turno: '' }])}>+ Adicionar pessoa</button>
        <button style={s.btn} onClick={lancarLoteAf}>Lançar em lote</button>
      </div>
    </div>
  );
}

function Recolhivel({ titulo, subtitulo, children }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div style={s.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setAberto(a => !a)}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{titulo}</div>
          {subtitulo && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{subtitulo}</div>}
        </div>
        <button onClick={e => { e.stopPropagation(); setAberto(a => !a); }}
          style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: 'none', cursor: 'pointer', color: '#185FA5', whiteSpace: 'nowrap' }}>
          {aberto ? 'fechar ▴' : '✏️ editar'}
        </button>
      </div>
      {aberto && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}

function CondutaItensEditor({ API }) {
  const FUNCOES = [['func-caixa', 'Caixa'], ['func-conferente', 'Conferente']];
  const [fid, setFid] = useState('func-caixa');
  const [itens, setItens] = useState([]);
  const [novo, setNovo] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => { API.get('/avaliacao-admin/modelo', { params: { funcao_id: fid } }).then(r => setItens(r.data.itens || [])); }, [API, fid]);
  useEffect(() => { carregar(); }, [carregar]);
  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  const salvar = async (i, campo, valor) => { try { await API.patch(`/avaliacao-admin/modelo/${i.id}`, { [campo]: valor }); carregar(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); } };
  async function add() { if (!novo.trim()) { flash('Escreva o item.'); return; } try { await API.post('/avaliacao-admin/modelo', { funcao_id: fid, texto: novo.trim() }); setNovo(''); carregar(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); } }

  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>🧾 Itens de conduta — avaliação do setor</div>
      <div style={{ fontSize: 11, color: '#999', margin: '2px 0 8px' }}>O chefe do setor avalia cada caixa/conferente nestes pontos (Bom/Regular/Ruim). A média entra na nota do gerente. A diferença de caixa continua separada, com os critérios atuais.</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {FUNCOES.map(([v, l]) => (
          <button key={v} onClick={() => setFid(v)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${fid === v ? '#185FA5' : '#ddd'}`, background: fid === v ? '#E6F1FB' : '#fff', color: fid === v ? '#185FA5' : '#666', fontWeight: 600 }}>{l}</button>
        ))}
      </div>
      {msg && <div style={{ fontSize: 12, color: '#854F0B', marginBottom: 6 }}>{msg}</div>}
      {itens.map(i => (
        <div key={i.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', borderTop: '1px solid #f5f5f5', opacity: i.ativo ? 1 : 0.45 }}>
          <input defaultValue={i.texto} onBlur={e => e.target.value !== i.texto && salvar(i, 'texto', e.target.value)} style={{ ...s.campo, marginBottom: 0, flex: 1, fontSize: 12 }} />
          <button onClick={() => salvar(i, 'ativo', !i.ativo)} style={{ fontSize: 10, padding: '3px 8px', border: '1px solid #ddd', borderRadius: 6, background: 'none', cursor: 'pointer' }}>{i.ativo ? 'Desativar' : 'Ativar'}</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input placeholder="novo item de conduta" value={novo} onChange={e => setNovo(e.target.value)} style={{ ...s.campo, marginBottom: 0, flex: 1, fontSize: 12 }} />
        <button onClick={add} style={{ ...s.btn, width: 'auto', padding: '4px 12px', fontSize: 12 }}>+</button>
      </div>
    </div>
  );
}

function ChecklistSupervisaoEditor({ API }) {
  const [itens, setItens] = useState([]);
  const [novo, setNovo] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => { API.get('/auditoria/modelo').then(r => setItens(r.data.itens || [])); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  const salvar = async (i, campo, valor) => { try { await API.patch(`/auditoria/modelo/${i.id}`, { [campo]: valor }); carregar(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); } };
  async function add() { if (!novo.trim()) { flash('Escreva o item.'); return; } try { await API.post('/auditoria/modelo', { texto: novo.trim() }); setNovo(''); carregar(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); } }

  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>🔍 Editar o Checklist de Supervisão</div>
      <div style={{ fontSize: 11, color: '#999', margin: '2px 0 8px' }}>Itens que o supervisor avalia na auditoria de loja (Bom/Regular/Ruim).</div>
      {msg && <div style={{ fontSize: 12, color: '#854F0B', marginBottom: 6 }}>{msg}</div>}
      {itens.map(i => (
        <div key={i.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', borderTop: '1px solid #f5f5f5', opacity: i.ativo ? 1 : 0.45 }}>
          <input defaultValue={i.texto} onBlur={e => e.target.value !== i.texto && salvar(i, 'texto', e.target.value)} style={{ ...s.campo, marginBottom: 0, flex: 1, fontSize: 12 }} />
          <button onClick={() => salvar(i, 'ativo', !i.ativo)} style={{ fontSize: 10, padding: '3px 8px', border: '1px solid #ddd', borderRadius: 6, background: 'none', cursor: 'pointer' }}>{i.ativo ? 'Desativar' : 'Ativar'}</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input placeholder="novo item de auditoria" value={novo} onChange={e => setNovo(e.target.value)} style={{ ...s.campo, marginBottom: 0, flex: 1, fontSize: 12 }} />
        <button onClick={add} style={{ ...s.btn, width: 'auto', padding: '4px 12px', fontSize: 12 }}>+</button>
      </div>
    </div>
  );
}

function ChecklistLimpezaEditor({ API }) {
  const [itens, setItens] = useState([]);
  const [nomeModelo, setNomeModelo] = useState('');
  const [novo, setNovo] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => { API.get('/checklist/limpeza-modelo').then(r => { setItens(r.data.itens || []); setNomeModelo(r.data.modelo?.nome || ''); }); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  const salvar = async (i, texto) => { try { await API.patch(`/checklist/limpeza-itens/${i.id}`, { texto }); carregar(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); } };
  const remover = async (i) => { if (!window.confirm(`Remover "${i.texto}"?`)) return; try { await API.delete(`/checklist/limpeza-itens/${i.id}`); carregar(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); } };
  async function add() { if (!novo.trim()) { flash('Escreva o item.'); return; } try { await API.post('/checklist/limpeza-modelo/itens', { texto: novo.trim() }); setNovo(''); carregar(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); } }

  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>🧹 Editar o Checklist de Limpeza</div>
      <div style={{ fontSize: 11, color: '#999', margin: '2px 0 8px' }}>Itens que o colaborador da limpeza confere no ciclo diário (abre de manhã, fecha no fim).{nomeModelo ? ` Modelo: ${nomeModelo}.` : ''}</div>
      {msg && <div style={{ fontSize: 12, color: '#854F0B', marginBottom: 6 }}>{msg}</div>}
      {itens.map(i => (
        <div key={i.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', borderTop: '1px solid #f5f5f5' }}>
          <input defaultValue={i.texto} onBlur={e => e.target.value.trim() && e.target.value !== i.texto && salvar(i, e.target.value.trim())} style={{ ...s.campo, marginBottom: 0, flex: 1, fontSize: 12 }} />
          <button onClick={() => remover(i)} style={{ fontSize: 10, padding: '3px 8px', border: '1px solid #F1C9BD', borderRadius: 6, background: '#FBEAE5', color: '#993C1D', cursor: 'pointer' }}>excluir</button>
        </div>
      ))}
      {itens.length === 0 && <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>Nenhum item de limpeza ainda.</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input placeholder="novo item de limpeza" value={novo} onChange={e => setNovo(e.target.value)} style={{ ...s.campo, marginBottom: 0, flex: 1, fontSize: 12 }} />
        <button onClick={add} style={{ ...s.btn, width: 'auto', padding: '4px 12px', fontSize: 12 }}>+</button>
      </div>
    </div>
  );
}

function ChecklistDiarioEditor({ API }) {
  const [secoes, setSecoes] = useState([]);
  const [totalPeso, setTotalPeso] = useState(0);
  const [novaSec, setNovaSec] = useState({ nome: '', peso: '' });
  const [novoItem, setNovoItem] = useState({});
  const [minMin, setMinMin] = useState('');
  const [agDiario, setAgDiario] = useState({ mode: 'semana', dias: [0, 1, 2, 3, 4, 5, 6] });
  const [agLimpeza, setAgLimpeza] = useState({ mode: 'semana', dias: [0, 1, 2, 3, 4, 5, 6] });
  const [agOperacional, setAgOperacional] = useState({ mode: 'semana', dias: [0, 1, 2, 3, 4, 5, 6] });
  const hojeStr = new Date().toISOString().slice(0, 10);
  const DOW = [[0, 'Dom'], [1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb']];
  const [funcoes, setFuncoes] = useState([]);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => { API.get('/checklist/gerente-secoes').then(r => { setSecoes(r.data.secoes || []); setTotalPeso(r.data.total_peso || 0); }); }, [API]);
  useEffect(() => { carregar(); API.get('/checklist/config').then(r => { setMinMin(String(r.data.checklist_min_min)); if (r.data.diario_agenda) setAgDiario(r.data.diario_agenda); if (r.data.limpeza_agenda) setAgLimpeza(r.data.limpeza_agenda); if (r.data.operacional_agenda) setAgOperacional(r.data.operacional_agenda); }).catch(() => {}); API.get('/referencias/funcoes').then(r => setFuncoes(r.data.funcoes || [])).catch(() => {}); }, [carregar]); // eslint-disable-line
  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  async function salvarMin() { try { const r = await API.post('/checklist/config', { checklist_min_min: Number(minMin) || 0 }); setMinMin(String(r.data.checklist_min_min)); flash('✅ Tempo mínimo salvo.'); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); } }
  async function salvarAgenda(tipo, agenda) { try { await API.post('/checklist/config/agenda', { tipo, agenda }); flash('✅ Agenda salva.'); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); } }

  const salvarSec = async (s, campo, valor) => { try { await API.patch(`/checklist/gerente-secoes/${s.id}`, { [campo]: valor }); carregar(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); } };
  const salvarItem = async (i, campo, valor) => { try { await API.patch(`/checklist/gerente-itens/${i.id}`, { [campo]: valor }); carregar(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); } };
  async function addSec() { if (!novaSec.nome.trim()) { flash('Nome da seção.'); return; } try { await API.post('/checklist/gerente-secoes', { ...novaSec, peso: Number(novaSec.peso) || 0 }); setNovaSec({ nome: '', peso: '' }); carregar(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); } }
  async function addItem(sid) { const n = (novoItem[sid] || '').trim(); if (!n) { flash('Nome do item.'); return; } try { await API.post(`/checklist/gerente-secoes/${sid}/itens`, { nome: n }); setNovoItem({ ...novoItem, [sid]: '' }); carregar(); } catch (e) { flash(e.response?.data?.erro || 'Erro.'); } }

  return (
    <div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Tempo mínimo para fechar o dia</div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Minutos que o Checklist Diário precisa ficar aberto antes de poder fechar (evita conferir "de uma vez"). Use <strong>0</strong> para testar sem espera. Padrão: 240 (4h).</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="number" min="0" value={minMin} onChange={e => setMinMin(e.target.value)} style={{ ...s.campo, marginBottom: 0, width: 90 }} />
          <span style={{ fontSize: 12, color: '#999' }}>minutos</span>
          <button style={{ ...s.btn, width: 'auto', padding: '6px 14px' }} onClick={salvarMin}>Salvar</button>
        </div>
      </div>

      <AgendaEditor titulo="Agenda do Checklist Diário" agenda={agDiario} setAgenda={setAgDiario} onSalvar={() => salvarAgenda('diario', agDiario)} hojeStr={hojeStr} DOW={DOW} />
      <AgendaEditor titulo="Agenda do Checklist de Limpeza" agenda={agLimpeza} setAgenda={setAgLimpeza} onSalvar={() => salvarAgenda('limpeza', agLimpeza)} hojeStr={hojeStr} DOW={DOW} />
      <AgendaEditor titulo="Agenda do Checklist Operacional" agenda={agOperacional} setAgenda={setAgOperacional} onSalvar={() => salvarAgenda('operacional', agOperacional)} hojeStr={hojeStr} DOW={DOW} />

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Seções do Checklist Diário</div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Edite as seções e itens que o gerente confere todo dia. A soma dos pesos deve dar 100.</div>
        <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: totalPeso === 100 ? '#3B6D11' : '#854F0B' }}>Soma dos pesos: {totalPeso}{totalPeso !== 100 ? ' (ajuste para 100)' : ' ✓'}</div>
        {msg && <div style={{ fontSize: 12, color: '#854F0B', marginTop: 6 }}>{msg}</div>}
      </div>

      {secoes.map(sec => (
        <div key={sec.id} style={{ ...s.card, opacity: sec.ativo ? 1 : 0.5 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input defaultValue={sec.nome} onBlur={e => e.target.value !== sec.nome && salvarSec(sec, 'nome', e.target.value)} style={{ ...s.campo, marginBottom: 0, flex: 1, fontWeight: 600 }} />
            <div><label style={{ fontSize: 10, color: '#999', display: 'block' }}>peso</label>
              <input type="number" defaultValue={sec.peso} onBlur={e => Number(e.target.value) !== sec.peso && salvarSec(sec, 'peso', Number(e.target.value))} style={{ ...s.campo, marginBottom: 0, width: 56 }} /></div>
            <button onClick={() => salvarSec(sec, 'ativo', !sec.ativo)} style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6, background: 'none', cursor: 'pointer' }}>{sec.ativo ? 'Desativar' : 'Ativar'}</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: '#999', whiteSpace: 'nowrap' }}>Pendência da seção →</span>
            <select value={sec.responsavel_pendencia || ''} onChange={e => salvarSec(sec, 'responsavel_pendencia', e.target.value)} style={{ ...s.campo, marginBottom: 0, fontSize: 11, flex: 1, padding: '4px 6px' }}>
              <option value="">Gerente da loja (padrão)</option>
              {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          {sec.itens.map(i => (
            <div key={i.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', borderTop: '1px solid #f5f5f5', opacity: i.ativo ? 1 : 0.45 }}>
              <input defaultValue={i.nome} onBlur={e => e.target.value !== i.nome && salvarItem(i, 'nome', e.target.value)} style={{ ...s.campo, marginBottom: 0, flex: 1, fontSize: 12 }} />
              <select value={i.responsavel_pendencia || ''} onChange={e => salvarItem(i, 'responsavel_pendencia', e.target.value)} title="Responsável da pendência deste item" style={{ ...s.campo, marginBottom: 0, fontSize: 10, width: 124, padding: '3px 4px' }}>
                <option value="">herda da seção</option>
                {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
              <button onClick={() => salvarItem(i, 'ativo', !i.ativo)} style={{ fontSize: 10, padding: '3px 6px', border: '1px solid #ddd', borderRadius: 6, background: 'none', cursor: 'pointer' }}>{i.ativo ? '×' : '✓'}</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input placeholder="novo item" value={novoItem[sec.id] || ''} onChange={e => setNovoItem({ ...novoItem, [sec.id]: e.target.value })} style={{ ...s.campo, marginBottom: 0, flex: 1, fontSize: 12 }} />
            <button onClick={() => addItem(sec.id)} style={{ ...s.btn, width: 'auto', padding: '4px 10px', fontSize: 12 }}>+</button>
          </div>
        </div>
      ))}

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Nova seção</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Nome da seção" value={novaSec.nome} onChange={e => setNovaSec({ ...novaSec, nome: e.target.value })} style={{ ...s.campo, marginBottom: 0, flex: 1 }} />
          <input type="number" placeholder="peso" value={novaSec.peso} onChange={e => setNovaSec({ ...novaSec, peso: e.target.value })} style={{ ...s.campo, marginBottom: 0, width: 64 }} />
        </div>
        <button style={{ ...s.btn, marginTop: 8 }} onClick={addSec}>Criar seção</button>
      </div>
    </div>
  );
}

function ChecklistCadastro({ API }) {
  const [checklists, setChecklists] = useState([]);
  const [indicadores, setIndicadores] = useState([]);
  const [funcoes, setFuncoes] = useState([]);
  const [novo, setNovo] = useState({ nome: '', destino: 'operacional', modo: 'inteiro', indicador_alvo: '' });
  const [item, setItem] = useState({});
  const [secao, setSecao] = useState({});
  const [editSistema, setEditSistema] = useState(null);
  const [editChk, setEditChk] = useState(null);
  const [msg, setMsg] = useState('');
  const DESTINOS = [['operacional', 'Operacional'], ['gerente', 'Gerente'], ['limpeza', 'Limpeza'], ['conferente', 'Conferente']];
  const PERIODOS = [['diaria', 'Diário'], ['semanal', 'Semanal'], ['mensal', 'Mensal']];

  const carregar = () => API.get('/operacional/checklists').then(r => setChecklists(r.data.checklists || []));
  useEffect(() => { carregar(); API.get('/operacional/indicadores').then(r => setIndicadores(r.data.indicadores || [])); API.get('/referencias/funcoes').then(r => setFuncoes(r.data.funcoes || [])); }, []); // eslint-disable-line
  const nomeInd = id => indicadores.find(i => i.id === id)?.nome || id;
  const nomeResp = r => r === 'gerente' || !r ? 'Gerente' : (funcoes.find(f => f.id === r)?.nome || r);

  async function criar() {
    if (!novo.nome.trim()) { setMsg('Dê um nome ao checklist.'); return; }
    if (novo.modo === 'inteiro' && !novo.indicador_alvo) { setMsg('Escolha o indicador que o checklist alimenta.'); return; }
    await API.post('/operacional/checklists', novo); setNovo({ nome: '', destino: 'operacional', modo: 'inteiro', indicador_alvo: '' }); setMsg('✅ Checklist criado.'); carregar();
  }
  async function addSecao(chkId) {
    const sx = secao[chkId] || {};
    if (!sx.nome?.trim()) { setMsg('Nome da seção.'); return; }
    await API.post(`/operacional/checklists/${chkId}/secoes`, { nome: sx.nome, peso: sx.peso || 0, indicador_alvo: sx.indicador_alvo || null, responsavel: sx.responsavel || 'gerente' });
    setSecao({ ...secao, [chkId]: { nome: '', peso: '', indicador_alvo: '', responsavel: 'gerente' } }); carregar();
  }
  async function addItem(chkId) {
    const it = item[chkId] || {};
    if (!it.nome?.trim()) { setMsg('Escreva a pergunta.'); return; }
    await API.post(`/operacional/checklists/${chkId}/itens`, { nome: it.nome, periodicidade: it.periodicidade || 'diaria', secao_id: it.secao_id || null });
    setItem({ ...item, [chkId]: { nome: '', periodicidade: 'diaria', secao_id: it.secao_id || '' } }); carregar();
  }
  async function excluirChk(chk) {
    if (!window.confirm(`Excluir o checklist "${chk.nome}"? Esta ação não pode ser desfeita.`)) return;
    try { await API.delete(`/operacional/checklists/${chk.id}`); if (editChk === chk.id) setEditChk(null); setMsg('✅ Checklist excluído.'); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro ao excluir.'); }
  }

  const editorDeChecklist = (chk) => (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '2px solid #E6F1FB' }}>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>
        destino: {(DESTINOS.find(d => d[0] === chk.destino) || [, chk.destino])[1]}
        {chk.modo === 'secao' ? ' · por seção' : (chk.indicador_alvo ? ` · alimenta ${nomeInd(chk.indicador_alvo)}` : '')}
        {' · '}{(chk.itens || []).length} itens
      </div>

      {chk.modo === 'secao' && (
        <div style={{ margin: '8px 0', padding: 8, background: '#f8f8f8', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 4 }}>Seções</div>
          {(chk.secoes || []).map(sx => (
            <div key={sx.id} style={{ fontSize: 12, padding: '3px 0' }}>• {sx.nome} <span style={{ color: '#999' }}>(peso {sx.peso} · → {nomeInd(sx.indicador_alvo)} · avalia: {nomeResp(sx.responsavel)})</span></div>
          ))}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            <input style={{ ...s.campo, marginBottom: 0, flex: 1, minWidth: 110 }} placeholder="Nome da seção" value={secao[chk.id]?.nome || ''} onChange={e => setSecao({ ...secao, [chk.id]: { ...secao[chk.id], nome: e.target.value } })} />
            <input style={{ ...s.campo, marginBottom: 0, width: 70 }} type="number" placeholder="peso" value={secao[chk.id]?.peso || ''} onChange={e => setSecao({ ...secao, [chk.id]: { ...secao[chk.id], peso: e.target.value } })} />
            <select style={{ ...s.campo, marginBottom: 0, width: 'auto' }} value={secao[chk.id]?.indicador_alvo || ''} onChange={e => setSecao({ ...secao, [chk.id]: { ...secao[chk.id], indicador_alvo: e.target.value } })}>
              <option value="">indicador…</option>
              {indicadores.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </select>
            <select style={{ ...s.campo, marginBottom: 0, width: 'auto' }} value={secao[chk.id]?.responsavel || 'gerente'} onChange={e => setSecao({ ...secao, [chk.id]: { ...secao[chk.id], responsavel: e.target.value } })}>
              <option value="gerente">avalia: Gerente</option>
              {funcoes.map(f => <option key={f.id} value={f.id}>avalia: chefe {f.nome}</option>)}
            </select>
            <button style={s.btn} onClick={() => addSecao(chk.id)}>+ Seção</button>
          </div>
        </div>
      )}

      <div style={{ margin: '8px 0' }}>
        {(chk.itens || []).length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Sem perguntas ainda.</div>}
        {(chk.itens || []).map(i => {
          const sx = (chk.secoes || []).find(z => z.id === i.secao_id);
          return (
            <div key={i.id} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between' }}>
              <span>{i.nome}{sx ? <span style={{ color: '#bbb' }}> · {sx.nome}</span> : ''}</span>
              <span style={{ color: '#666', fontSize: 11 }}>{PERIODOS.find(p => p[0] === i.periodicidade)?.[1]}</span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input style={{ ...s.campo, flex: 1, marginBottom: 0, minWidth: 130 }} placeholder="Nova pergunta"
          value={item[chk.id]?.nome || ''} onChange={e => setItem({ ...item, [chk.id]: { ...item[chk.id], nome: e.target.value } })} />
        {chk.modo === 'secao' && (
          <select style={{ ...s.campo, width: 'auto', marginBottom: 0 }} value={item[chk.id]?.secao_id || ''} onChange={e => setItem({ ...item, [chk.id]: { ...item[chk.id], secao_id: e.target.value } })}>
            <option value="">seção…</option>
            {(chk.secoes || []).map(sx => <option key={sx.id} value={sx.id}>{sx.nome}</option>)}
          </select>
        )}
        <select style={{ ...s.campo, width: 'auto', marginBottom: 0 }} value={item[chk.id]?.periodicidade || 'diaria'}
          onChange={e => setItem({ ...item, [chk.id]: { ...item[chk.id], periodicidade: e.target.value } })}>
          {PERIODOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button style={s.btn} onClick={() => addItem(chk.id)}>+ Pergunta</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Checklists ativos</div>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>Do sistema (fixos):</div>
        {[['🔎 Checklist de Supervisão', 'Supervisão', 'supervisao'], ['✅ Checklist Diário', 'Gerente', 'diario'], ['🧹 Checklist de Limpeza', 'Limpeza', 'limpeza']].map(([nome, area, key]) => (
          <div key={nome} style={{ fontSize: 12, padding: '6px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f7f7f7' }}>
            <span>{nome}</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#999' }}>{area}</span>
              <button onClick={() => setEditSistema(editSistema === key ? null : key)} style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #ddd', borderRadius: 6, background: editSistema === key ? '#E6F1FB' : 'none', color: '#185FA5', cursor: 'pointer' }}>{editSistema === key ? 'fechar ▴' : '✏️ editar'}</button>
            </span>
          </div>
        ))}
        <div style={{ fontSize: 10, color: '#aaa', marginTop: 6 }}>Os checklists criados no cadastro aparecem logo abaixo — cada um com "✏️ editar".</div>
        {['supervisao', 'diario', 'limpeza'].includes(editSistema) && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '2px solid #E6F1FB' }}>
            {editSistema === 'diario' && <ChecklistDiarioEditor API={API} />}
            {editSistema === 'supervisao' && <ChecklistSupervisaoEditor API={API} />}
            {editSistema === 'limpeza' && <ChecklistLimpezaEditor API={API} />}
          </div>
        )}
        {checklists.length > 0 && <div style={{ fontSize: 11, color: '#999', margin: '8px 0 4px' }}>Criados no cadastro:</div>}
        {checklists.map(chk => (
          <div key={chk.id} style={{ borderTop: '1px solid #f7f7f7' }}>
            <div style={{ fontSize: 12, padding: '6px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📋 {chk.nome}</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: '#999' }}>{(DESTINOS.find(d => d[0] === chk.destino) || [, chk.destino])[1]} · {chk.itens?.length || 0} itens</span>
                <button onClick={() => setEditChk(editChk === chk.id ? null : chk.id)} style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #ddd', borderRadius: 6, background: editChk === chk.id ? '#E6F1FB' : 'none', color: '#185FA5', cursor: 'pointer', whiteSpace: 'nowrap' }}>{editChk === chk.id ? 'fechar ▴' : '✏️ editar'}</button>
                <button onClick={() => excluirChk(chk)} style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #F1C9BD', borderRadius: 6, background: '#FBEAE5', color: '#993C1D', cursor: 'pointer', whiteSpace: 'nowrap' }}>🗑️ excluir</button>
              </span>
            </div>
            {editChk === chk.id && editorDeChecklist(chk)}
          </div>
        ))}
        {checklists.length === 0 && <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>Nenhum checklist criado no cadastro ainda.</div>}
      </div>

      <Recolhivel titulo="🧾 Itens de conduta — avaliação do setor" subtitulo="Caixa e conferente (Bom/Regular/Ruim)">
        <CondutaItensEditor API={API} />
      </Recolhivel>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Novo checklist</div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Executado diariamente. Cada pergunta tem periodicidade — diário no dia; semanal até sexta; mensal até dia 30 (trava na última semana). A nota alimenta o(s) indicador(es) automaticamente.</div>
        <label style={s.rotulo}>Nome</label>
        <input style={s.campo} value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: Checklist de abertura" />
        <label style={s.rotulo}>Destino (qual menu/área)</label>
        <select style={s.campo} value={novo.destino} onChange={e => setNovo({ ...novo, destino: e.target.value })}>
          {DESTINOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label style={s.rotulo}>Como liga aos indicadores?</label>
        <select style={s.campo} value={novo.modo} onChange={e => setNovo({ ...novo, modo: e.target.value })}>
          <option value="inteiro">Checklist inteiro → 1 indicador</option>
          <option value="secao">Por seção → 1 indicador por seção</option>
        </select>
        {novo.modo === 'inteiro' && (
          <>
            <label style={s.rotulo}>Indicador alimentado</label>
            <select style={s.campo} value={novo.indicador_alvo} onChange={e => setNovo({ ...novo, indicador_alvo: e.target.value })}>
              <option value="">— selecione —</option>
              {indicadores.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.pilar})</option>)}
            </select>
          </>
        )}
        {msg && <div style={{ fontSize: 12, color: '#3B6D11', marginBottom: 8 }}>{msg}</div>}
        <button style={s.btn} onClick={criar}>Criar checklist</button>
      </div>
    </div>
  );
}
function ModelosTermo({ API }) {
  const [adv, setAdv] = useState('');
  const [sus, setSus] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { API.get('/ocorrencias/modelos-termo').then(r => { setAdv(r.data.advertencia || ''); setSus(r.data.suspensao || ''); }).catch(() => {}); }, [API]);
  async function salvar() {
    try { await API.post('/ocorrencias/modelos-termo', { advertencia: adv, suspensao: sus }); setMsg('✅ Modelos salvos.'); setTimeout(() => setMsg(''), 3000); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>📄 Modelos de termo (advertência / suspensão)</div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>Texto-padrão usado quando o RH gera o termo na ocorrência. Use os campos: <code>{'{COLABORADOR}'}</code>, <code>{'{DATA}'}</code>, <code>{'{MOTIVO}'}</code>, <code>{'{OBS}'}</code>, <code>{'{EMPRESA_REGISTRO}'}</code> — eles são preenchidos automaticamente.</div>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#444' }}>Termo de advertência</label>
      <textarea style={{ ...s.campo, minHeight: 220, fontFamily: 'monospace', fontSize: 12 }} value={adv} onChange={e => setAdv(e.target.value)} />
      <label style={{ fontSize: 12, fontWeight: 600, color: '#444' }}>Termo de suspensão</label>
      <textarea style={{ ...s.campo, minHeight: 220, fontFamily: 'monospace', fontSize: 12 }} value={sus} onChange={e => setSus(e.target.value)} />
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginBottom: 8 }}>{msg}</div>}
      <button style={s.btn} onClick={salvar}>Salvar modelos</button>
    </div>
  );
}

function CampanhasDoColaborador({ API, colaboradorId }) {
  const [aceites, setAceites] = useState([]);
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    if (!colaboradorId) { setAceites([]); return; }
    setCarregando(true);
    API.get('/metas/aceites', { params: { colaborador_id: colaboradorId } }).then(r => setAceites(r.data.aceites || [])).catch(() => setAceites([])).finally(() => setCarregando(false));
  }, [API, colaboradorId]);
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>📄 Campanhas do colaborador</div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>Termos de aceite de campanha assinados (IP + selfie + termo). Baixe o PDF de cada um.</div>
      {carregando && <div style={{ fontSize: 12, color: '#999' }}>Carregando…</div>}
      {!carregando && aceites.length === 0 && <div style={{ fontSize: 12, color: '#aaa' }}>Nenhum termo de campanha assinado.</div>}
      {aceites.map(a => (
        <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #f5f5f5' }}>
          <div style={{ fontSize: 12 }}>
            <strong>{a.mes ? `${String(a.mes).padStart(2, '0')}/${a.ano}` : '—'}</strong> · {a.campanha_nome || 'Campanha'}
            <div style={{ fontSize: 11, color: '#999' }}>assinado em {a.aceito_em ? new Date(a.aceito_em.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '—'}{a.ip ? ` · IP ${a.ip}` : ''}</div>
          </div>
          <button style={{ fontSize: 11, padding: '5px 10px', background: '#fff', color: '#185FA5', border: '1px solid #185FA5', borderRadius: 6, cursor: 'pointer' }} onClick={() => abrirTermoCampanha(a)}>📄 Baixar PDF</button>
        </div>
      ))}
    </div>
  );
}

function CampanhasColaborador({ API }) {
  const [colabs, setColabs] = useState([]);
  const [cid, setCid] = useState('');
  const [aceites, setAceites] = useState([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => { API.get('/colaboradores').then(r => setColabs(r.data.colaboradores || r.data || [])).catch(() => {}); }, [API]);
  useEffect(() => {
    if (!cid) { setAceites([]); return; }
    setCarregando(true);
    API.get('/metas/aceites', { params: { colaborador_id: cid } }).then(r => setAceites(r.data.aceites || [])).catch(() => setAceites([])).finally(() => setCarregando(false));
  }, [API, cid]);

  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>📄 Campanhas — termos de aceite</div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>Termos de aceite de campanha assinados pelo colaborador (IP + selfie + termo). Aqui você baixa o PDF de cada um.</div>
      <select value={cid} onChange={e => setCid(e.target.value)} style={{ ...s.campo, marginBottom: 10 }}>
        <option value="">Escolha o colaborador…</option>
        {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}{c.loja ? ` · ${c.loja}` : ''}</option>)}
      </select>
      {cid && carregando && <div style={{ fontSize: 12, color: '#999' }}>Carregando…</div>}
      {cid && !carregando && aceites.length === 0 && <div style={{ fontSize: 12, color: '#aaa' }}>Nenhum termo de campanha assinado.</div>}
      {aceites.map(a => (
        <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #f5f5f5' }}>
          <div style={{ fontSize: 12 }}>
            <strong>{a.mes ? `${String(a.mes).padStart(2, '0')}/${a.ano}` : '—'}</strong> · {a.campanha_nome || 'Campanha'}
            <div style={{ fontSize: 11, color: '#999' }}>assinado em {a.aceito_em ? new Date(a.aceito_em.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '—'}{a.ip ? ` · IP ${a.ip}` : ''}</div>
          </div>
          <button style={{ fontSize: 11, padding: '5px 10px', background: '#fff', color: '#185FA5', border: '1px solid #185FA5', borderRadius: 6, cursor: 'pointer' }} onClick={() => abrirTermoCampanha(a)}>📄 Baixar PDF</button>
        </div>
      ))}
    </div>
  );
}

function FuncoesEscritorio({ API }) {
  const [funcoes, setFuncoes] = useState([]);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    API.get('/config/funcoes').then(r => setFuncoes(r.data.funcoes || [])).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  async function alternar(f, valor) {
    setFuncoes(fs => fs.map(x => x.id === f.id ? { ...x, escritorio: valor ? 1 : 0 } : x));
    try {
      await API.patch(`/config/funcoes/${f.id}`, { escritorio: valor ? 1 : 0 });
      setMsg(`${f.nome} → ${valor ? 'Escritório' : 'Atendimento'} (a pessoa precisa sair e entrar de novo para valer)`);
      setTimeout(() => setMsg(''), 4000);
    } catch {
      setMsg('Erro ao salvar.'); carregar();
    }
  }

  return (
    <div style={s.card}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>🏢 Escritório × 🏬 Atendimento</div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 12, lineHeight: 1.5 }}>
        <b>Escritório</b> = pessoal do escritório central (diretoria, gestão, RH, suporte, tesouraria, marketing…). Pode <b>pedir apoio</b> e <b>exigir assinatura</b> nas tarefas.<br />
        <b>Atendimento</b> = pessoal das lojas. Não pede apoio nem exige assinatura.
      </div>
      {funcoes.map(f => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: 13 }}>{f.nome}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => alternar(f, true)} style={{ ...fpill, ...(f.escritorio ? fpillEsc : {}) }}>🏢 Escritório</button>
            <button onClick={() => alternar(f, false)} style={{ ...fpill, ...(!f.escritorio ? fpillAtd : {}) }}>🏬 Atendimento</button>
          </div>
        </div>
      ))}
      {!funcoes.length && <div style={{ fontSize: 12, color: '#aaa' }}>Carregando funções…</div>}
      {msg && <div style={{ fontSize: 12, color: '#3B6D11', marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
const fpill = { fontSize: 11, padding: '5px 10px', border: '1px solid #ddd', borderRadius: 999, background: '#fff', cursor: 'pointer', color: '#888' };
const fpillEsc = { background: '#E6F1FB', borderColor: '#185FA5', color: '#185FA5', fontWeight: 700 };
const fpillAtd = { background: '#FAEEDA', borderColor: '#854F0B', color: '#854F0B', fontWeight: 700 };

// Editor de agenda de um checklist (dias da semana ou a cada N dias)
function AgendaEditor({ titulo, agenda, setAgenda, onSalvar, hojeStr, DOW }) {
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{titulo}</div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Em quais dias o card aparece no Kanban. Em dia fora da agenda o card <strong>não é gerado</strong> (e não penaliza). Ex.: loja que não abre domingo → use Seg–Sáb.</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button onClick={() => setAgenda({ mode: 'semana', dias: agenda.dias || [0, 1, 2, 3, 4, 5, 6] })}
          style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${agenda.mode !== 'cada_n' ? '#111' : '#ddd'}`, background: agenda.mode !== 'cada_n' ? '#111' : '#fff', color: agenda.mode !== 'cada_n' ? '#fff' : '#666' }}>Dias da semana</button>
        <button onClick={() => setAgenda({ mode: 'cada_n', n: agenda.n || 3, base: agenda.base || hojeStr })}
          style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${agenda.mode === 'cada_n' ? '#111' : '#ddd'}`, background: agenda.mode === 'cada_n' ? '#111' : '#fff', color: agenda.mode === 'cada_n' ? '#fff' : '#666' }}>A cada N dias</button>
      </div>
      {agenda.mode !== 'cada_n' ? (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {[['Seg–Sex', [1, 2, 3, 4, 5]], ['Seg–Sáb', [1, 2, 3, 4, 5, 6]], ['Todos', [0, 1, 2, 3, 4, 5, 6]]].map(([lbl, dias]) => (
              <button key={lbl} onClick={() => setAgenda({ mode: 'semana', dias })} style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#666' }}>{lbl}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {DOW.map(([n, lbl]) => {
              const on = (agenda.dias || []).includes(n);
              return (
                <button key={n} onClick={() => { const set = new Set(agenda.dias || []); on ? set.delete(n) : set.add(n); setAgenda({ mode: 'semana', dias: [...set].sort((a, b) => a - b) }); }}
                  style={{ fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${on ? '#3B6D11' : '#ddd'}`, background: on ? '#EAF3DE' : '#fff', color: on ? '#3B6D11' : '#999' }}>{lbl}</button>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12 }}>A cada</span>
          <input type="number" min="1" value={agenda.n || 3} onChange={e => setAgenda({ ...agenda, mode: 'cada_n', n: Math.max(1, Number(e.target.value) || 1) })} style={{ ...s.campo, marginBottom: 0, width: 60 }} />
          <span style={{ fontSize: 12 }}>dias, a partir de</span>
          <input type="date" value={agenda.base || hojeStr} onChange={e => setAgenda({ ...agenda, mode: 'cada_n', base: e.target.value })} style={{ ...s.campo, marginBottom: 0, width: 'auto' }} />
        </div>
      )}
      <button style={{ ...s.btn, width: 'auto', padding: '6px 14px', marginTop: 12 }} onClick={onSalvar}>Salvar agenda</button>
    </div>
  );
}

const DOC_TIPOS = ['CPF', 'RG', 'Comprovante de residência', 'Certidão de casamento', 'Certidão de nascimento (filho)', 'Carteira de trabalho', 'Título de eleitor', 'PIS/PASEP', 'Foto 3x4', 'Comprovante de escolaridade', 'Outro'];

// 🧭 Visão 360 do colaborador — tudo numa tela só (histórico, desempenho, desenvolvimento, documentos).
// `documentos` controla a aba Documentos (só RH/gestão); `semTitulo` esconde o cabeçalho quando já há um.
export function FichaColaborador({ API, colaboradorId, nome, onDesligar, documentos = true, semTitulo = false }) {
  const [aba, setAba] = useState('historico');
  const abas = [['historico', '🕓 Histórico'], ['desempenho', '📈 Desempenho'], ['desenvolvimento', '🎓 Desenvolvimento'], ...(documentos ? [['documentos', '📎 Documentos']] : [])];
  return (
    <div style={{ ...s.card, borderTop: '3px solid #185FA5' }}>
      {!semTitulo && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>🧭 Visão 360 — {nome}</div>
          {onDesligar && <button onClick={onDesligar} style={{ fontSize: 12, padding: '5px 12px', border: '1px solid #E3C9C0', borderRadius: 8, background: '#FCEBE6', color: '#993C1D', cursor: 'pointer', fontWeight: 600 }}>🚪 Desligar / enviar pesquisa</button>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {abas.map(([v, l]) =>
          <button key={v} onClick={() => setAba(v)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid ' + (aba === v ? '#185FA5' : '#ddd'), background: aba === v ? '#185FA5' : '#fff', color: aba === v ? '#fff' : '#666', cursor: 'pointer' }}>{l}</button>)}
      </div>
      {aba === 'desempenho' && <FichaDesempenho API={API} id={colaboradorId} />}
      {aba === 'desenvolvimento' && <FichaDesenvolvimento API={API} id={colaboradorId} />}
      {aba === 'documentos' && documentos && <FichaDocumentos API={API} id={colaboradorId} />}
      {aba === 'historico' && <FichaHistorico API={API} id={colaboradorId} />}
    </div>
  );
}

function FichaDesempenho({ API, id }) {
  const [d, setD] = useState(null);
  useEffect(() => { API.get(`/colaboradores/${id}/desempenho`).then(r => setD(r.data)).catch(() => setD(false)); }, [API, id]);
  if (d === null) return <div style={{ fontSize: 12, color: '#999' }}>Carregando…</div>;
  if (d === false) return <div style={{ fontSize: 12, color: '#999' }}>Sem dados de desempenho.</div>;
  const cor = pct => pct == null ? '#999' : pct >= 100 ? '#3B6D11' : pct >= 90 ? '#BA7517' : '#993C1D';
  const Barra = ({ label, pct }) => (
    <div style={{ flex: 1, minWidth: 130 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 11, color: '#666' }}>{label}</span><span style={{ fontSize: 20, fontWeight: 800, color: cor(pct) }}>{pct == null ? '—' : pct + '%'}</span></div>
      <div style={{ height: 7, background: '#eee', borderRadius: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(100, pct || 0)}%`, background: cor(pct) }} /></div>
    </div>
  );
  const v = d.vendedor, lm = d.loja_meta;
  return (
    <div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>{d.funcao}{d.loja ? ` · ${d.loja}` : ''} · mês {String(d.mes).padStart(2, '0')}/{d.ano}</div>
      {d.erro_erp && <div style={{ fontSize: 12, color: '#993C1D' }}>Não consegui buscar as vendas ao vivo do ERP agora.</div>}
      {v && (<>
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}><Barra label="Meta" pct={v.pct_meta} /><Barra label="Super meta" pct={v.pct_super} /></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
          <span style={{ ...tag(v.bateu_meta ? '#E7F1DC' : '#F5E2DB', v.bateu_meta ? '#3B6D11' : '#993C1D') }}>{v.bateu_meta ? '✅ bateu a meta' : '❌ não bateu a meta'}</span>
          {v.bateu_super && <span style={tag('#EAF3FB', '#185FA5')}>🚀 bateu a super</span>}
          {v.nota_indicadores != null && <span style={tag('#F6F2FB', '#7A5AA8')}>Indicadores: {v.nota_indicadores}/100</span>}
          {v.premiacao_pct != null && <span style={tag('#FBF3DA', '#8A6D1D')}>Premiação: {v.premiacao_pct}%</span>}
          {v.vitaminas != null && <span style={tag('#F0F0F3', '#555')}>Vitaminas: {v.vitaminas}</span>}
        </div>
      </>)}
      {lm && (<>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Meta da loja (gestão)</div>
        <div style={{ display: 'flex', gap: 16 }}><Barra label="Meta loja" pct={lm.pct_meta} /><Barra label="Super loja" pct={lm.pct_super} /></div>
        <div style={{ marginTop: 6 }}><span style={{ ...tag(lm.bateu_meta ? '#E7F1DC' : '#F5E2DB', lm.bateu_meta ? '#3B6D11' : '#993C1D') }}>{lm.bateu_meta ? '✅ loja bateu a meta' : '❌ loja não bateu a meta'}</span></div>
      </>)}
      {!v && !lm && !d.erro_erp && <div style={{ fontSize: 12, color: '#999' }}>Sem meta lançada para este colaborador no mês.</div>}
    </div>
  );
}

function FichaDesenvolvimento({ API, id }) {
  const [d, setD] = useState(null);
  useEffect(() => { API.get(`/capacitacao/colaborador/${id}`).then(r => setD(r.data)).catch(() => setD(false)); }, [API, id]);
  if (d === null) return <div style={{ fontSize: 12, color: '#999' }}>Carregando…</div>;
  if (d === false) return <div style={{ fontSize: 12, color: '#999' }}>Sem dados de desenvolvimento.</div>;
  const dBRf = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');
  const stPdi = { planejado: ['Planejado', '#888'], em_andamento: ['Em andamento', '#185FA5'], concluido: ['Concluído', '#3B6D11'], cancelado: ['Cancelado', '#C0392B'] };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Cursos */}
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>📚 Cursos — {d.cursos.total} concluído{d.cursos.total !== 1 ? 's' : ''}</div>
        {d.cursos.obrigatorios_pendentes.length > 0 && <div style={{ fontSize: 11.5, color: '#993C1D', marginBottom: 4 }}>⚠️ Obrigatórios pendentes: {d.cursos.obrigatorios_pendentes.join(', ')}</div>}
        {d.cursos.concluidos.length === 0 ? <div style={{ fontSize: 12, color: '#999' }}>Nenhum curso concluído ainda.</div> :
          d.cursos.concluidos.slice(0, 8).map((c, i) => <div key={i} style={{ fontSize: 12, color: '#555', padding: '2px 0' }}>✓ {c.titulo}{c.categoria ? ` · ${c.categoria}` : ''} <span style={{ color: '#999' }}>({dBRf(c.concluido_em)})</span></div>)}
      </div>
      {/* Avaliação trimestral — visão de cada avaliador (gerente/subgerente) */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>📈 Última avaliação{(d.avaliacoes || []).length > 1 ? ` — ${d.avaliacoes.length} visões (compare)` : ''}</div>
        {d.consolidada && (
          <div style={{ fontSize: 12, background: '#EEF6FF', border: '1px solid #d4e6fb', borderRadius: 8, padding: '7px 10px', marginBottom: 8 }}>
            <b>🧮 Consolidado ({d.consolidada.avaliadores} visões)</b> · média <b>{d.consolidada.nota_media}/5</b>
            {d.consolidada.norte?.length > 0 && <span> · 🧭 focar: {d.consolidada.norte.map(n => `${n.nome} (${n.media})`).join(' · ')}</span>}
          </div>
        )}
        {(!d.avaliacoes || d.avaliacoes.length === 0) ? <div style={{ fontSize: 12, color: '#999' }}>Ainda não avaliado. Use a tela Capacitação → Avaliação & PDI.</div> :
          d.avaliacoes.map((av, i) => (
            <div key={i} style={{ fontSize: 12, color: '#555', marginBottom: 8, ...(d.avaliacoes.length > 1 ? { borderLeft: '3px solid #dfe6ea', paddingLeft: 8 } : {}) }}>
              <div><b>{av.avaliador_nome || 'avaliador'}</b> · {av.trimestre}º tri/{av.ano}{av.nota_media != null ? ` · média ${av.nota_media}/5` : ''}</div>
              {av.pontos_fortes && <div style={{ marginTop: 2 }}>💪 <b>Fortes:</b> {av.pontos_fortes}</div>}
              {av.a_desenvolver && <div style={{ marginTop: 2 }}>🎯 <b>A desenvolver:</b> {av.a_desenvolver}</div>}
              {av.norte?.length > 0 && <div style={{ marginTop: 3, background: '#F3FBF6', borderRadius: 8, padding: '5px 9px' }}>🧭 <b>Norte:</b> {av.norte.map(n => `${n.nome} (${n.nota}/5)`).join(' · ')}</div>}
            </div>
          ))}
        {(d.avaliacoes || []).length > 1 && <div style={{ fontSize: 10.5, color: '#999' }}>💡 Duas visões ajudam a validar se gerente e subgerente enxergam o mesmo.</div>}
      </div>
      {/* PDI */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>🔄 Plano de desenvolvimento (PDCA)</div>
        {d.pdi.length === 0 ? <div style={{ fontSize: 12, color: '#999' }}>Nenhum item de plano.</div> :
          d.pdi.map((p, i) => { const st = stPdi[p.status] || stPdi.planejado; return (
            <div key={i} style={{ fontSize: 12, color: '#555', padding: '3px 0', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>{p.tema}</span>
              <span style={{ fontSize: 10, color: '#fff', background: st[1], borderRadius: 5, padding: '0 6px' }}>{st[0]}</span>
              {p.origem === 'sugestao' && <span style={{ fontSize: 10, color: '#8a6d3b' }}>💡</span>}
              {p.prazo && <span style={{ color: '#999' }}>· prazo {dBRf(p.prazo)}</span>}
            </div>
          ); })}
      </div>
    </div>
  );
}

function FichaDocumentos({ API, id }) {
  const [docs, setDocs] = useState([]);
  const [tipo, setTipo] = useState('CPF');
  const carregar = useCallback(() => API.get(`/colaboradores/${id}/docs`).then(r => setDocs(r.data.documentos || [])).catch(() => setDocs([])), [API, id]);
  useEffect(() => { carregar(); }, [carregar]);
  const lerArq = file => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  async function anexar(e) { const file = e.target.files[0]; if (!file) return; if (file.size > 8_000_000) return alert('Arquivo muito grande (máx 8MB).'); await API.post(`/colaboradores/${id}/docs`, { tipo, nome: file.name, mime: file.type, dados: await lerArq(file) }); e.target.value = ''; carregar(); }
  const faltando = DOC_TIPOS.filter(t => t !== 'Outro' && !docs.some(d => d.tipo === t));
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...s.campo, width: 'auto', marginBottom: 0 }}>{DOC_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select>
        <label style={{ fontSize: 12, color: '#fff', background: '#185FA5', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 600 }}>📎 Anexar {tipo}<input type="file" accept="image/*,application/pdf" onChange={anexar} style={{ display: 'none' }} /></label>
      </div>
      {faltando.length > 0 && <div style={{ fontSize: 11, color: '#B7791F', background: '#FFFBEB', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>Faltam: {faltando.join(', ')}</div>}
      {docs.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhum documento anexado.</div>}
      {docs.map(doc => (
        <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, background: '#f5f7fa', borderRadius: 8, padding: '7px 10px', marginBottom: 4 }}>
          <a href={`/api/colaboradores/${id}/docs/${doc.id}`} target="_blank" rel="noreferrer" style={{ color: '#185FA5', textDecoration: 'none' }}>📄 <strong>{doc.tipo || 'Documento'}</strong> · {doc.nome}</a>
          <button onClick={() => API.delete(`/colaboradores/${id}/docs/${doc.id}`).then(carregar)} style={{ background: 'none', border: 'none', color: '#993C1D', cursor: 'pointer' }}>✕</button>
        </div>
      ))}
    </div>
  );
}

function FichaHistorico({ API, id }) {
  const [d, setD] = useState(null);
  useEffect(() => { API.get(`/colaboradores/${id}/historico`).then(r => setD(r.data)).catch(() => setD(false)); }, [API, id]);
  if (d === null) return <div style={{ fontSize: 12, color: '#999' }}>Carregando…</div>;
  if (d === false) return <div style={{ fontSize: 12, color: '#999' }}>Sem histórico.</div>;
  const COR = { positivo: { b: '#E7F1DC', c: '#3B6D11' }, negativo: { b: '#F5E2DB', c: '#993C1D' }, neutro: { b: '#EEF1F5', c: '#555' } };
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={tag('#E7F1DC', '#3B6D11')}>👍 {d.resumo.positivos} positivos</span>
        <span style={tag('#F5E2DB', '#993C1D')}>👎 {d.resumo.negativos} negativos</span>
        {d.resumo.advertencias > 0 && <span style={tag('#FBF3DA', '#8A6D1D')}>⚠️ {d.resumo.advertencias} advertência(s)</span>}
        {d.resumo.suspensoes > 0 && <span style={tag('#F5E2DB', '#993C1D')}>⛔ {d.resumo.suspensoes} suspensão(ões)</span>}
      </div>
      {d.historico.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhum registro no histórico.</div>}
      {d.historico.map((h, i) => { const cc = COR[h.categoria] || COR.neutro; return (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid #f4f4f4' }}>
          <div style={{ width: 4, borderRadius: 2, background: cc.c, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: cc.c }}>{h.titulo}{h.pontos != null && <span style={{ marginLeft: 6, fontWeight: 700 }}>{h.pontos > 0 ? '+' : ''}{h.pontos} pts</span>}</div>
            {h.detalhe && <div style={{ fontSize: 12, color: '#555' }}>{h.detalhe}</div>}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', whiteSpace: 'nowrap' }}>{String(h.data).slice(0, 10).split('-').reverse().join('/')}</div>
        </div>
      ); })}
    </div>
  );
}
const tag = (bg, cor) => ({ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: bg, color: cor });

// Cabeçalho de seção do formulário
function Secao({ n, titulo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 10px' }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#111', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: .5 }}>{titulo}</span>
      <span style={{ flex: 1, height: 1, background: '#eee' }} />
    </div>
  );
}

const ESPECIES = [['cachorro', '🐶 Cachorro'], ['gato', '🐱 Gato'], ['outro', '🐾 Outro']];
// Filhos e pets. No cadastro NOVO guarda em memória (vai junto no POST); na EDIÇÃO usa a API.
function Dependentes({ API, editId, lista, onChange, lerImgFile }) {
  const [remoto, setRemoto] = React.useState([]);
  const [novo, setNovo] = React.useState(null); // {tipo,especie,nome,apelido,nascimento,foto}
  const carregar = React.useCallback(() => { if (editId) API.get(`/colaboradores/${editId}/dependentes`).then(r => setRemoto(r.data.dependentes || [])).catch(() => {}); }, [API, editId]);
  React.useEffect(() => { carregar(); }, [carregar]);
  const itens = editId ? remoto : (lista || []);

  const novoVazio = () => setNovo({ tipo: 'filho', especie: 'cachorro', nome: '', apelido: '', nascimento: '', foto: null });
  const salvarNovo = async () => {
    if (!String(novo.nome || '').trim()) return;
    if (editId) { await API.post(`/colaboradores/${editId}/dependentes`, novo); setNovo(null); carregar(); }
    else { onChange([...(lista || []), novo]); setNovo(null); }
  };
  const remover = async (dep, i) => {
    if (editId) { await API.delete(`/colaboradores/dependente/${dep.id}`); carregar(); }
    else onChange((lista || []).filter((_, j) => j !== i));
  };
  const fotoSrc = dep => dep.foto ? dep.foto : (dep.tem_foto && dep.id ? `/api/colaboradores/dependente/${dep.id}/foto` : null);
  const ico = dep => dep.tipo === 'pet' ? (dep.especie === 'gato' ? '🐱' : dep.especie === 'cachorro' ? '🐶' : '🐾') : '🧒';

  return (
    <div>
      {itens.length === 0 && !novo && <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>Nenhum filho ou pet cadastrado.</div>}
      {itens.map((dep, i) => (
        <div key={dep.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
          {fotoSrc(dep) ? <img src={fotoSrc(dep)} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#F3F0FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{ico(dep)}</div>}
          <div style={{ flex: 1, fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>{ico(dep)} {dep.apelido || dep.nome} <span style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>· {dep.tipo === 'pet' ? (dep.especie || 'pet') : 'filho(a)'}</span></div>
            {dep.nascimento && <div style={{ fontSize: 11, color: '#aaa' }}>🎂 {String(dep.nascimento).slice(0, 10).split('-').reverse().join('/')}</div>}
          </div>
          <button type="button" onClick={() => remover(dep, i)} style={{ fontSize: 12, color: '#993C1D', background: 'none', border: 'none', cursor: 'pointer' }}>remover</button>
        </div>
      ))}

      {novo ? (
        <div style={{ background: '#FAFAFB', borderRadius: 10, padding: 10, marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {[['filho', '🧒 Filho(a)'], ['pet', '🐾 Pet']].map(([v, l]) =>
              <button key={v} type="button" onClick={() => setNovo({ ...novo, tipo: v })} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 16, cursor: 'pointer', border: `1px solid ${novo.tipo === v ? '#185FA5' : '#ddd'}`, background: novo.tipo === v ? '#E6F1FB' : '#fff', color: novo.tipo === v ? '#185FA5' : '#888', fontWeight: 600 }}>{l}</button>)}
            {novo.tipo === 'pet' && <select value={novo.especie} onChange={e => setNovo({ ...novo, especie: e.target.value })} style={s.campo}>{ESPECIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={s.campo} placeholder="Nome" value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} />
            <input style={s.campo} placeholder="Apelido (opcional)" value={novo.apelido} onChange={e => setNovo({ ...novo, apelido: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: '#999' }}>Nascimento</label><input style={s.campo} type="date" value={novo.nascimento} onChange={e => setNovo({ ...novo, nascimento: e.target.value })} /></div>
            {novo.foto ? <img src={novo.foto} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} /> : null}
            <label style={{ fontSize: 11, color: '#185FA5', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>📷 foto<input type="file" accept="image/*" onChange={async e => { const f = e.target.files[0]; if (f) setNovo({ ...novo, foto: await lerImgFile(f) }); }} style={{ display: 'none' }} /></label>
          </div>
          <div style={s.dica}>📸 Foto <strong>sorrindo</strong> 😊 — usada só em ações internas nas datas comemorativas.</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button type="button" onClick={salvarNovo} style={{ ...s.btn, padding: '6px 14px' }}>Adicionar</button>
            <button type="button" onClick={() => setNovo(null)} style={{ ...s.btn, padding: '6px 14px', background: '#999' }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={novoVazio} style={{ fontSize: 12, color: '#185FA5', background: '#EAF3FB', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, marginTop: 6 }}>+ filho ou pet</button>
      )}
    </div>
  );
}

const s = {
  rotulo: { fontSize: 12, color: '#666', display: 'block', marginBottom: 3 },
  dica: { fontSize: 11, color: '#7A5AA8', background: '#F6F2FB', borderRadius: 8, padding: '7px 10px', margin: '4px 0 6px' },
  faixa: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 13, borderBottom: '1px solid #f5f5f5' },
  campoSm: { width: 90, padding: '6px 8px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, textAlign: 'right' },
  wrap: { padding: '1rem', maxWidth: 1320, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  acao: { fontSize: 11, padding: 0, border: 'none', background: 'none', cursor: 'pointer', color: '#185FA5', fontWeight: 600 },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  tabs: { display: 'flex', gap: 6, marginBottom: 12 },
  tab: { fontSize: 12, padding: '6px 14px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666' },
  tabAtiva: { background: '#e6f3f0', color: '#0d6b5e', borderColor: '#0d6b5e', fontWeight: 600 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  campo: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', marginBottom: 8 },
  item: { display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid #f5f5f5' },
  senhaBox: { background: '#EAF3DE', border: '1px solid #3B6D11', borderRadius: 8, padding: 10, fontSize: 13, color: '#2f5e0e', marginBottom: 8, lineHeight: 1.5 },
  btn: { fontSize: 13, padding: '8px 14px', background: '#0d6b5e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
};
