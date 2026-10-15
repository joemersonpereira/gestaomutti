import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { ModalAceite } from './Premiacao';
import { AvaliacaoTarefaInline } from './AvaliacaoSetorItens';
import ChecklistDiarioInline from './ChecklistDiarioInline';
import ChecklistLimpezaInline from './ChecklistLimpezaInline';
import ChecklistOperacionalInline from './ChecklistOperacionalInline';
import FolgaAprovacaoInline from './FolgaAprovacaoInline';
import CompradorOfertaInline from './CompradorOfertaInline';
import EmailRespostaInline from './EmailRespostaInline';
import AlertaItensInline from './AlertaItensInline';
import FolgaRejeitadaInline from './FolgaRejeitadaInline';
import AssinaturaInline from './AssinaturaInline';
import EscalaFeriadoInline from './EscalaFeriadoInline';
import CienciaGestaoInline from './CienciaGestaoInline';
import EscalaCienciaInline from './EscalaCienciaInline';
import EscalaLancarInline from './EscalaLancarInline';
import CampanhaComprovanteInline from './CampanhaComprovanteInline';
import OcorrenciaValidarInline from './OcorrenciaValidarInline';

const STATUS_LABEL = { aberto: 'Em aberto', andamento: 'Em andamento', concluido: 'Concluído', atrasado: 'Atrasado' };
const STATUS_COR = { aberto: '#666', andamento: '#185FA5', concluido: '#3B6D11', atrasado: '#993C1D', reanalise: '#854F0B' };
// Colunas do quadro (Reanálise é uma coluna entre Andamento e Atrasado).
// Concluído NÃO é coluna fixa — aparece só quando o filtro "Concluídas" é ligado (mais espaço p/ as demais).
const COLUNAS = [['aberto', 'Em aberto'], ['andamento', 'Em andamento'], ['reanalise', 'Reanálise'], ['atrasado', 'Atrasado']];
const COL_CONCLUIDO = ['concluido', 'Concluído'];
const ORIGEM_COR = {
  checklist: '#EAF3DE', auditoria: '#FAEEDA', rh: '#FCEBEB',
  acao: '#EEEDFE', encomenda: '#E6F1FB', campanha: '#FFF3CD',
  limpeza: '#f0f0f0', chamado: '#f0f0f0', avaliacao_ruim: '#FCEBEB',
};
const ORIGEM_TEXTO = {
  checklist: '#3B6D11', auditoria: '#854F0B', rh: '#A32D2D',
  acao: '#3C3489', encomenda: '#185FA5', campanha: '#856404',
  limpeza: '#444', chamado: '#444', avaliacao_ruim: '#A32D2D',
};
const ORIGEM_LABEL = {
  reposicao: 'Reposição', checklist_gerente: 'Checklist gerente', checklist: 'Checklist', checklist_diario: 'Checklist Diário', checklist_limpeza: 'Checklist Limpeza', checklist_operacional: 'Checklist Operacional', folga: 'Folga', folga_rejeitada: 'Folga recusada', folga_ciencia: 'Folga (ciência)', folga_substituto: 'Substituição (folga)', assinatura: 'Assinatura', feriado_escala: 'Escala de feriado', ciencia_gestao: 'Ciência', escala_ciencia: 'Escala (ciência)', escala_conversa: 'Escala — conversar', escala_pendente: 'Escala pendente',
  ocorrencia: 'Ocorrências', ocorrencia_validar: 'Ocorrências · validar (RH)', ocorrencia_reanalise: 'Ocorrências · reanálise', premiacao_aceite: 'Premiação', caixa_justificativa: 'Caixa',
  checklist_comercial: 'Compras (checklist)', checklist_suporte: 'Suporte (checklist)', checklist_reanalise: 'Checklist · reanálise',
  avaliacao_ruim: 'Avaliação', avaliacao_revisao: 'Revisar avaliação', auditoria: 'Auditoria', encomenda: 'Encomendas', campanha: 'Campanhas',
  post_social: 'Post social', ouvidoria: 'Ouvidoria', documento: 'Documentos', feira: 'Feira', feira_verba: 'Feira · verba',
};
const rotuloOrigem = o => ORIGEM_LABEL[o] || (o ? o.charAt(0).toUpperCase() + o.slice(1).replace(/_/g, ' ') : o);
// Origens internas que não viram aba de filtro
const ORIGENS_OCULTAS = ['reanalise', 'reanalise_resultado'];

// Tela padrão de cadastro de SLA (prazo em horas) por tipo de tarefa. Padrão geral + por origem.
function SlaConfigModal({ API, onFechar }) {
  const [dados, setDados] = useState(null);
  const [edit, setEdit] = useState({}); // origem -> horas (string) sendo editado
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    API.get('/tarefas/sla/config').then(r => {
      setDados(r.data);
      const e = { _padrao: String(r.data.padrao || '') };
      Object.values(r.data.config || {}).forEach(c => { if (c.origem !== '_padrao') e[c.origem] = String(c.horas || ''); });
      setEdit(e);
    }).catch(() => setDados(false));
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = (origem, rotulo) => {
    const horas = edit[origem];
    setMsg('');
    API.put('/tarefas/sla/config', { origem, horas: horas === '' ? 0 : Number(horas), rotulo })
      .then(() => { setMsg(`✅ ${rotulo} salvo`); setTimeout(() => setMsg(''), 1800); carregar(); })
      .catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'falha ao salvar')));
  };
  const fmtHoras = h => { const n = Number(h); if (!n) return ''; if (n % 24 === 0) return `${n}h = ${n / 24}d`; return `${n}h`; };

  if (!dados) return null;
  const padraoNum = Number(edit._padrao) || dados.padrao || 48;
  // Origens usadas + as já configuradas (fora o padrão), únicas e ordenadas.
  const origens = [...new Set([...(dados.origens || []), ...Object.keys(dados.config || {}).filter(o => o !== '_padrao')])].sort();

  return (
    <div style={styles.bloqueioOverlay} onClick={onFechar}>
      <div style={{ ...styles.avalCard, maxWidth: 560, width: '100%', textAlign: 'left', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>⏱️ SLA das tarefas</div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 14 }}>Prazo (em horas) para realizar cada tipo de tarefa. Ao criar uma tarefa, o prazo é calculado por aqui — nada fica chumbado no código.</div>

        {/* Padrão geral */}
        <div style={{ background: '#F4F7FB', border: '1px solid #DCE7F3', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Padrão geral (vale para todas as tarefas sem SLA próprio)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="number" min="1" value={edit._padrao || ''} onChange={e => setEdit(x => ({ ...x, _padrao: e.target.value }))} style={{ ...styles.campo, marginBottom: 0, width: 110 }} />
            <span style={{ fontSize: 12, color: '#888' }}>horas {fmtHoras(edit._padrao) && `(${fmtHoras(edit._padrao)})`}</span>
            <button style={styles.btnOk} onClick={() => salvar('_padrao', 'Padrão geral')}>Salvar</button>
          </div>
        </div>

        {/* Por tipo de tarefa (origem) */}
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Por tipo de tarefa</div>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>Deixe em branco para herdar o padrão de {padraoNum}h.</div>
        {origens.length === 0 && <div style={{ fontSize: 12, color: '#aaa' }}>Nenhum tipo de tarefa registrado ainda.</div>}
        {origens.map(o => (
          <div key={o} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f2f2f2' }}>
            <span style={{ flex: 1, fontSize: 13 }}>{rotuloOrigem(o)}</span>
            <input type="number" min="0" placeholder={`padrão (${padraoNum})`} value={edit[o] ?? ''} onChange={e => setEdit(x => ({ ...x, [o]: e.target.value }))} style={{ ...styles.campo, marginBottom: 0, width: 120 }} />
            <span style={{ fontSize: 11, color: '#888', width: 74 }}>{fmtHoras(edit[o]) || 'h'}</span>
            <button style={styles.btnSm} onClick={() => salvar(o, rotuloOrigem(o))}>Salvar</button>
          </div>
        ))}

        {msg && <div style={{ fontSize: 12.5, marginTop: 10, color: msg.startsWith('✅') ? '#1E8449' : '#C0392B' }}>{msg}</div>}
        <button style={{ ...styles.btnSecundario, marginTop: 16 }} onClick={onFechar}>Fechar</button>
      </div>
    </div>
  );
}

export default function Kanban() {
  const { API, usuario } = useAuth();
  const [tarefas, setTarefas] = useState([]);
  const [aceiteMeta, setAceiteMeta] = useState(null);
  const [metricas, setMetricas] = useState({});
  const [filtro, setFiltro] = useState('todos');
  const [filtroSetor, setFiltroSetor] = useState('');
  const [filtroLoja, setFiltroLoja] = useState('');
  const [filtroResp, setFiltroResp] = useState('');
  const [filtroPrazo, setFiltroPrazo] = useState('');
  const [mostrarConcluido, setMostrarConcluido] = useState(false); // coluna Concluído só quando ligada
  const [slaModal, setSlaModal] = useState(false);
  const [busca, setBusca] = useState('');
  const gestao = ['Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario?.funcao);
  const [det, setDet] = useState(null);
  const [bloqueado, setBloqueado] = useState(null);

  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState('');
  const [novaTarefa, setNovaTarefa] = useState(false);
  const [avaliarModal, setAvaliarModal] = useState(null);
  const [notaModal, setNotaModal] = useState(0);
  const [colabs, setColabs] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [motivosOc, setMotivosOc] = useState([]);
  const [formTarefa, setFormTarefa] = useState({ titulo: '', descricao: '', departamento: '', responsavel_id: '', sla_horas: '', urgente: false });

  const [novaRespEmail, setNovaRespEmail] = useState(() => new Set());
  const carregar = useCallback(async () => {
    try {
      const [resT, resB] = await Promise.all([
        API.get('/tarefas'),
        API.get('/tarefas/status/bloqueio'),
      ]);
      setTarefas(resT.data.tarefas);
      setMetricas(resT.data.metricas);
      setBloqueado(resB.data.bloqueado ? resB.data.notificacao : null);
      API.get('/tarefas/email/nova-resposta').then(r => setNovaRespEmail(new Set(r.data.ids || []))).catch(() => {});
    } catch (e) {
      console.error(e);
    } finally {
      setCarregando(false);
    }
  }, [API]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    API.get('/ocorrencias/motivos').then(r => setMotivosOc(r.data.motivos || [])).catch(() => {});
  }, [API]);

  async function moverStatus(id, status) {
    try {
      await API.patch(`/tarefas/${id}/status`, { status });
      if (status === 'concluido') {
        try {
          const r = await API.get(`/tarefas/${id}/atendimento`);
          if (r.data.sou_parte && !r.data.ja_avaliei) { setAvaliarModal({ id, outro_nome: r.data.outro_nome }); setNotaModal(0); }
        } catch { /* sem avaliação aplicável */ }
      }
      carregar();
    } catch (e) {
      setMsg(e.response?.data?.erro || 'Erro ao atualizar.');
    }
  }

  async function revisarAval(id, decisao) {
    try {
      const r = await API.post(`/tarefas/${id}/revisar-avaliacao`, { decisao });
      setMsg(r.data.mensagem);
      carregar();
    } catch (e) {
      setMsg(e.response?.data?.erro || 'Erro ao decidir.');
    }
  }

  async function reanalisar(id, decisao) {
    try {
      const r = await API.post(`/tarefas/${id}/reanalisar`, { decisao });
      setMsg(r.data.mensagem || (decisao === 'aceita' ? 'Reanálise aceita.' : 'Reanálise rejeitada.'));
      carregar();
    } catch (e) {
      setMsg(e.response?.data?.erro || 'Erro ao decidir reanálise.');
    }
  }

  async function garantirColabs() {
    if (colabs.length) return;
    const ehGestao = ['Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
    const params = ehGestao ? {} : { loja_id: usuario.loja_id };
    try { const r = await API.get('/colaboradores', { params }); setColabs(r.data.colaboradores || []); } catch (e) { /* segue */ }
  }
  async function transferir(id, novoResp) {
    try { const r = await API.patch(`/tarefas/${id}/transferir`, { responsavel_id: novoResp }); setMsg(r.data.mensagem); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro ao transferir.'); }
  }
  async function definirApoio(id, apoioId) {
    try { const r = await API.patch(`/tarefas/${id}/apoio`, { apoio_id: apoioId || null }); setMsg(r.data.mensagem); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro ao definir apoio.'); }
  }
  async function adicionarApoio(id, colabId) {
    if (!colabId) return;
    try { const r = await API.post(`/tarefas/${id}/apoios`, { colaborador_id: colabId }); setMsg(r.data.mensagem); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro ao adicionar apoio.'); }
  }
  async function removerApoio(id, colabId) {
    try { const r = await API.delete(`/tarefas/${id}/apoios/${colabId}`); setMsg(r.data.mensagem); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro ao remover apoio.'); }
  }

  async function abrirNovaTarefa() {
    setFormTarefa({ titulo: '', descricao: '', departamento: '', responsavel_id: '', apoio_id: '', sla_horas: '', urgente: false });
    setNovaTarefa(true);
    if (!colabs.length) {
      try {
        const r = await API.get('/colaboradores', { params: { loja_id: usuario.loja_id } });
        setColabs(r.data.colaboradores || []);
      } catch (e) { /* segue */ }
    }
    if (!departamentos.length) {
      try {
        const r = await API.get('/referencias/departamentos');
        setDepartamentos(r.data.departamentos || []);
      } catch (e) { /* segue */ }
    }
  }

  async function criarTarefa() {
    if (!formTarefa.titulo.trim()) return;
    try {
      await API.post('/tarefas', {
        tipo: 'tarefa',
        origem: formTarefa.departamento ? `dept:${formTarefa.departamento}` : 'manual',
        titulo: formTarefa.titulo.trim(),
        descricao: formTarefa.descricao.trim(),
        responsavel_id: formTarefa.responsavel_id,
        apoio_id: formTarefa.apoio_id || null,
        urgente: formTarefa.urgente ? 1 : 0,
        sla_horas: formTarefa.sla_horas ? Number(formTarefa.sla_horas) : null,
      });
      setNovaTarefa(false);
      setMsg('✅ Tarefa criada.');
      carregar();
    } catch (e) {
      setMsg(e.response?.data?.erro || 'Erro ao criar tarefa.');
    }
  }

  async function confirmarCiencia(id) {
    try {
      await API.post(`/tarefas/${id}/ciencia`);
      setBloqueado(null);
      carregar();
    } catch (e) {
      setMsg(e.response?.data?.erro || 'Erro.');
    }
  }

  async function reanaliseChecklist(id) {
    const texto = window.prompt('Pedir reanálise — explique (ex.: o produto foi comprado / está na loja):') || '';
    try { await API.post(`/checklist/tarefa/${id}/reanalise`, { texto }); setMsg('Reanálise enviada.'); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }

  async function lancarOcorrenciaTarefa(colaboradorId, motivoId, obs) {
    try { await API.post('/ocorrencias', { colaborador_id: colaboradorId, motivo_id: motivoId, obs }); setMsg('✅ Ocorrência enviada ao RH para validação. Veja o card "Validar ocorrência" no quadro.'); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro ao lançar ocorrência.'); }
  }

  async function confirmarUrgencia(id, confirma) {
    try { const r = await API.post(`/tarefas/${id}/confirmar-urgencia`, { confirma }); setMsg(r.data.mensagem || 'OK'); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }

  async function abrirAceite(referenciaId) {
    try {
      const r = await API.get(`/metas/${referenciaId}`);
      const m = r.data.meta;
      setAceiteMeta({ ...m, nome_campanha: m.campanha_nome || m.nome_campanha });
    } catch (e) { setMsg('Não consegui abrir o aceite desta meta.'); }
  }

  const listaFiltrada = tarefas.filter(t => {
    const passaEtiqueta = filtro === 'todos' ? true
      : filtro === 'tarefas' ? t.tipo === 'tarefa'
        : filtro === 'notificacoes' ? t.tipo === 'notificacao'
          : t.origem === filtro;
    const passaSetor = !filtroSetor || t.setor === filtroSetor;
    const passaLoja = !filtroLoja || t.loja_nome === filtroLoja;
    const passaResp = !filtroResp || t.responsavel_nome === filtroResp;
    const hojeStr = new Date().toDateString();
    const passaPrazo = !filtroPrazo
      || (filtroPrazo === 'atrasadas' && t.status === 'atrasado')
      || (filtroPrazo === 'sem_prazo' && !t.prazo)
      || (filtroPrazo === 'vence_hoje' && t.prazo && new Date(t.prazo).toDateString() === hojeStr && t.status !== 'concluido');
    const passaBusca = !busca.trim() || `${t.titulo || ''} ${t.descricao || ''} ${t.responsavel_nome || ''}`.toLowerCase().includes(busca.trim().toLowerCase());
    return passaEtiqueta && passaSetor && passaLoja && passaResp && passaPrazo && passaBusca;
  });

  const origens = [...new Set(tarefas.map(t => t.origem))].filter(o => !ORIGENS_OCULTAS.includes(o));
  const setores = [...new Set(tarefas.map(t => t.setor).filter(Boolean))].sort();
  const lojasDisp = [...new Set(tarefas.map(t => t.loja_nome).filter(Boolean))].sort();
  const responsaveis = [...new Set(tarefas.map(t => t.responsavel_nome).filter(Boolean))].sort();
  const filtrosGestaoAtivos = filtroLoja || filtroResp || filtroPrazo || filtroSetor;

  if (carregando) return <div style={styles.loading}>Carregando tarefas...</div>;

  return (
    <div style={styles.wrap}>
      {/* Overlay de bloqueio */}
      {bloqueado && (
        <div style={styles.bloqueioOverlay}>
          <div style={styles.bloqueioCard}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
            <div style={styles.bloqueioTitulo}>Acesso bloqueado</div>
            <div style={styles.bloqueioSub}>Notificação com prazo vencido. Confirme a ciência para continuar.</div>
            <div style={styles.bloqueioItem}>
              <strong>{bloqueado.titulo}</strong>
              <div style={{ fontSize: 12, marginTop: 4 }}>{bloqueado.descricao}</div>
            </div>
            <button style={styles.btnPrimario} onClick={() => confirmarCiencia(bloqueado.id)}>
              ✅ Confirmar ciência agora
            </button>
          </div>
        </div>
      )}

      {/* Avaliação de atendimento ao concluir */}
      {avaliarModal && (
        <div style={styles.bloqueioOverlay}>
          <div style={styles.avalCard}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>⭐ Avalie o atendimento</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 14 }}>Como foi o atendimento de <strong>{avaliarModal.outro_nome}</strong> nesta tarefa?</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setNotaModal(n)} style={{ ...styles.btnEstrela, opacity: notaModal >= n ? 1 : 0.3 }}>⭐</button>
              ))}
            </div>
            <button style={{ ...styles.btnPrimario, opacity: notaModal ? 1 : 0.5 }} onClick={async () => {
              if (!notaModal) return;
              try { await API.post(`/tarefas/${avaliarModal.id}/avaliar-atendimento`, { nota: notaModal }); } catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
              setAvaliarModal(null); carregar();
            }}>Enviar avaliação</button>
            <button style={{ ...styles.btnSecundario, marginTop: 8 }} onClick={() => setAvaliarModal(null)}>Depois</button>
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div style={{ ...styles.header, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={styles.titulo}>✅ Kanban de Tarefas</div>
          <div style={styles.subtitulo}>{usuario?.nome} · {usuario?.loja}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {gestao && <button style={styles.btnSecundarioHdr} onClick={() => setSlaModal(true)}>⏱️ SLA</button>}
          <button style={styles.btnNova} onClick={abrirNovaTarefa}>+ Nova Tarefa</button>
        </div>
      </div>

      {slaModal && <SlaConfigModal API={API} onFechar={() => setSlaModal(false)} />}

      {novaTarefa && (
        <div style={styles.bloqueioOverlay} onClick={() => setNovaTarefa(false)}>
          <div style={styles.avalCard} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Nova Tarefa</div>
            <input style={styles.campo} placeholder="Título da tarefa *" value={formTarefa.titulo}
              onChange={e => setFormTarefa({ ...formTarefa, titulo: e.target.value })} />
            <textarea style={{ ...styles.campo, minHeight: 64 }} placeholder="Descrição (opcional)" value={formTarefa.descricao}
              onChange={e => setFormTarefa({ ...formTarefa, descricao: e.target.value })} />
            <label style={styles.rotulo}>Departamento</label>
            <select style={styles.campo} value={formTarefa.departamento}
              onChange={e => setFormTarefa({ ...formTarefa, departamento: e.target.value, responsavel_id: '' })}>
              <option value="">Selecione o departamento…</option>
              {departamentos.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <label style={styles.rotulo}>Responsável (pessoa do departamento)</label>
            <select style={styles.campo} value={formTarefa.responsavel_id}
              onChange={e => setFormTarefa({ ...formTarefa, responsavel_id: e.target.value })}
              disabled={!formTarefa.departamento}>
              <option value="">{formTarefa.departamento ? 'Escolha a pessoa…' : 'Escolha o departamento primeiro'}</option>
              {colabs.filter(c => (c.departamento || 'Atendimento') === formTarefa.departamento).map(c => (
                <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ` — ${c.funcao}` : ''}</option>
              ))}
              {formTarefa.departamento === (usuario.departamento || 'Atendimento') && (
                <option value={usuario.id}>Eu ({usuario.nome})</option>
              )}
            </select>
            {usuario.escritorio && (<>
              <label style={styles.rotulo}>Apoio (opcional) — outra pessoa junto na tarefa</label>
              <select style={styles.campo} value={formTarefa.apoio_id}
                onChange={e => setFormTarefa({ ...formTarefa, apoio_id: e.target.value })}>
                <option value="">Sem apoio</option>
                {colabs.filter(c => c.id !== formTarefa.responsavel_id).map(c => (
                  <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ` — ${c.funcao}` : ''}{c.loja ? ` · ${c.loja}` : ''}</option>
                ))}
              </select>
            </>)}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0', fontSize: 13 }}>
              <input type="checkbox" checked={formTarefa.urgente}
                onChange={e => setFormTarefa({ ...formTarefa, urgente: e.target.checked })} />
              Marcar como urgente 🔴
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={{ ...styles.btnPrimario, opacity: (formTarefa.titulo.trim() && formTarefa.responsavel_id) ? 1 : 0.5 }}
                onClick={criarTarefa} disabled={!formTarefa.titulo.trim() || !formTarefa.responsavel_id}>Criar tarefa</button>
              <button style={styles.btnSecundario} onClick={() => setNovaTarefa(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Métricas */}
      <div style={styles.metricas}>
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <div key={k} style={styles.metrica}>
            <div style={{ ...styles.metricaVal, color: STATUS_COR[k] }}>{metricas[k] || 0}</div>
            <div style={styles.metricaLabel}>{v}</div>
          </div>
        ))}
        {metricas.notificacoes_pendentes > 0 && (
          <div style={styles.metrica}>
            <div style={{ ...styles.metricaVal, color: '#3C3489' }}>{metricas.notificacoes_pendentes}</div>
            <div style={styles.metricaLabel}>Notificações</div>
          </div>
        )}
      </div>

      {msg && <div style={styles.msgFlutuante}>{msg}</div>}

      {/* Busca por título/descrição (ex.: digite "amor" e vê todo chamado com esse nome) */}
      <div style={{ marginBottom: 10, position: 'relative', maxWidth: 420 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar por descrição, título ou responsável…"
          style={{ width: '100%', padding: '8px 32px 8px 12px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box' }} />
        {busca && <button onClick={() => setBusca('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#999', fontSize: 15 }}>✕</button>}
      </div>

      {/* Filtros */}
      <div style={styles.filtros}>
        {['todos', 'tarefas', 'notificacoes', ...origens].map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            style={{ ...styles.filtroBtn, ...(filtro === f ? styles.filtroBtnAtivo : {}) }}
          >
            {f === 'todos' ? 'Todos' : f === 'tarefas' ? 'Tarefas' : f === 'notificacoes' ? 'Notificações' : rotuloOrigem(f)}
          </button>
        ))}
        {setores.length > 0 && (
          <select value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}
            style={{ ...styles.filtroBtn, ...(filtroSetor ? styles.filtroBtnAtivo : {}), cursor: 'pointer' }}>
            <option value="">Setor: todos</option>
            {setores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {/* Filtros de gestão: por loja, responsável e prazo */}
        {gestao && lojasDisp.length > 1 && (
          <select value={filtroLoja} onChange={e => setFiltroLoja(e.target.value)}
            style={{ ...styles.filtroBtn, ...(filtroLoja ? styles.filtroBtnAtivo : {}), cursor: 'pointer' }}>
            <option value="">Loja: todas</option>
            {lojasDisp.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        {gestao && responsaveis.length > 0 && (
          <select value={filtroResp} onChange={e => setFiltroResp(e.target.value)}
            style={{ ...styles.filtroBtn, ...(filtroResp ? styles.filtroBtnAtivo : {}), cursor: 'pointer', maxWidth: 200 }}>
            <option value="">Responsável: todos</option>
            {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {gestao && (
          <select value={filtroPrazo} onChange={e => setFiltroPrazo(e.target.value)}
            style={{ ...styles.filtroBtn, ...(filtroPrazo ? styles.filtroBtnAtivo : {}), cursor: 'pointer' }}>
            <option value="">Prazo: todos</option>
            <option value="atrasadas">Atrasadas</option>
            <option value="vence_hoje">Vence hoje</option>
            <option value="sem_prazo">Sem prazo</option>
          </select>
        )}
        {gestao && filtrosGestaoAtivos && (
          <button onClick={() => { setFiltroLoja(''); setFiltroResp(''); setFiltroPrazo(''); setFiltroSetor(''); }}
            style={{ ...styles.filtroBtn, cursor: 'pointer', color: '#993C1D' }}>✕ Limpar filtros</button>
        )}
        {/* Concluídas: o quadro mostra só as ativas; ligue para ver a coluna Concluído. */}
        <button onClick={() => setMostrarConcluido(v => !v)}
          style={{ ...styles.filtroBtn, cursor: 'pointer', ...(mostrarConcluido ? { background: '#3B6D11', color: '#fff', borderColor: '#3B6D11' } : {}) }}>
          {mostrarConcluido ? '✓ Concluídas (ocultar)' : 'Concluídas'}
        </button>
      </div>

      {/* Colunas do Kanban */}
      <div style={styles.colunas}>
        {(mostrarConcluido ? [...COLUNAS, COL_CONCLUIDO] : COLUNAS).map(([status, label]) => {
          const items = status === 'reanalise'
            ? listaFiltrada.filter(t => t.reanalise_status === 'pendente')
            : listaFiltrada.filter(t => t.status === status && t.reanalise_status !== 'pendente');
          return (
            <div key={status} style={styles.coluna}>
              <div style={styles.colunaHeader}>
                <span style={{ color: STATUS_COR[status], fontWeight: 600 }}>{label}</span>
                <span style={styles.count}>{items.length}</span>
              </div>
              {items.length === 0 && (
                <div style={styles.vazio}>Nenhuma tarefa</div>
              )}
              {items.map(t => (
                <TarefaCard
                  key={t.id}
                  tarefa={t}
                  expandido={det === t.id}
                  onToggle={() => setDet(det === t.id ? null : t.id)}
                  onMover={moverStatus}
                  onRevisarAval={revisarAval}
                  onReanalisar={reanalisar}
                  onTransferir={transferir}
                  onDefinirApoio={definirApoio}
                  onAddApoio={adicionarApoio}
                  onRemoveApoio={removerApoio}
                  onGarantirColabs={garantirColabs}
                  colabs={colabs}
                  onCiencia={confirmarCiencia}
                  onReanaliseChecklist={reanaliseChecklist}
                  onLancarOcorrencia={lancarOcorrenciaTarefa}
                  onConfirmarUrgencia={confirmarUrgencia}
                  motivosOc={motivosOc}
                  onAceitar={abrirAceite}
                  onRecarregar={carregar}
                  temNovaResposta={novaRespEmail.has(t.id)}
                  usuario={usuario}
                />
              ))}
            </div>
          );
        })}
      </div>
      {aceiteMeta && <ModalAceite API={API} usuario={usuario} meta={aceiteMeta} onFechar={() => setAceiteMeta(null)} onAceito={() => { setAceiteMeta(null); carregar(); }} />}
    </div>
  );
}

function TarefaCard({ tarefa: t, expandido, onToggle, onMover, onRevisarAval, onReanalisar, onTransferir, onDefinirApoio, onAddApoio, onRemoveApoio, onGarantirColabs, colabs = [], onCiencia, onReanaliseChecklist, onLancarOcorrencia, onConfirmarUrgencia, motivosOc = [], onAceitar, onRecarregar, temNovaResposta, usuario }) {
  const [ocOpen, setOcOpen] = useState(false);
  const [ocMotivo, setOcMotivo] = useState('');
  const [ocObs, setOcObs] = useState('');
  const podeLancarOc = ['Supervisor', 'Gerente', 'Subgerente', 'Gestor Geral', 'Diretor Geral', 'RH', 'Suporte', 'Tesouraria', 'Marketing', 'Comercial'].includes(usuario.funcao);
  // A confirmação de urgência policia gerente que marca tarefa de trabalho como urgente sem necessidade.
  // Não se aplica a cards disciplinares (ocorrências): o colaborador não julga a urgência da própria advertência.
  const urgConfirmavel = !/^ocorrencia/.test(t.origem || '');
  const precisaConfirmarUrg = !!(urgConfirmavel && t.urgente && !t.urgente_confirmado && t.urgente_por && t.urgente_por !== t.responsavel_id && t.responsavel_id === usuario.id);
  const isNotif = t.tipo === 'notificacao';
  const ehCriadorCard = t.criado_por === usuario.id || ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const reanalisePendente = t.reanalise_status === 'pendente';
  const ehGestaoCard = !!usuario.escritorio;
  const [transfOpen, setTransfOpen] = useState(false);
  const [transfAlvo, setTransfAlvo] = useState('');
  const [apoioOpen, setApoioOpen] = useState(false);
  const [apoioAlvo, setApoioAlvo] = useState('');
  const bgOrigem = ORIGEM_COR[t.origem] || '#f0f0f0';
  const txtOrigem = ORIGEM_TEXTO[t.origem] || '#444';

  return (
    <div
      onClick={onToggle}
      style={{
        ...styles.card,
        borderLeft: isNotif ? '3px solid #3C3489' : t.status === 'atrasado' ? '3px solid #993C1D' : undefined,
        borderTop: t.urgente ? '2px solid #993C1D' : undefined,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {isNotif
          ? <span style={{ ...styles.tag, background: '#EEEDFE', color: '#3C3489' }}>🔔 {rotuloOrigem(t.origem)}</span>
          : <span style={{ ...styles.tag, background: bgOrigem, color: txtOrigem }}>{rotuloOrigem(t.origem)}</span>}
        {t.urgente ? <span style={{ ...styles.tag, background: '#FCEBEB', color: '#993C1D' }}>Urgente</span> : null}
        {t.reanalise_status === 'encerrada_auto' && <span style={{ ...styles.tag, background: '#EEE', color: '#777' }}>Encerrada (não feita)</span>}
        {t.comentarios_novos > 0 && <span style={{ ...styles.tag, background: '#E7F0FF', color: '#1D4ED8' }}>💬 {t.comentarios_novos} novo{t.comentarios_novos > 1 ? 's' : ''}</span>}
        {temNovaResposta && <span style={{ ...styles.tag, background: '#E7F5EC', color: '#1E7A46', fontWeight: 700 }}>📨 respondeu — nova resposta</span>}
      </div>
      <div style={styles.cardTitulo}>{t.titulo}</div>
      <div style={styles.cardSub}>Responsável: {t.responsavel_nome}{t.setor ? ' · ' + t.setor : ''} · {t.loja_nome}</div>
      {t.criado_por_nome && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Aberta por: {t.criado_por_nome}</div>}
      {t.prazo && (
        <div style={{ fontSize: 11, color: new Date(t.prazo) < new Date() ? '#993C1D' : '#666', marginTop: 4 }}>
          Prazo: {new Date(t.prazo).toLocaleString('pt-BR')}
        </div>
      )}

      {/* Ações rápidas no card (sem abrir): Iniciar · Concluir · Transferir */}
      {!isNotif && !expandido && t.status !== 'concluido' && (t.responsavel_id === usuario.id || ehGestaoCard) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }} onClick={e => e.stopPropagation()}>
          {t.status === 'aberto' && <button style={styles.btnSm} onClick={() => onMover(t.id, 'andamento')}>▶ Iniciar</button>}
          <button style={styles.btnOk} onClick={() => onMover(t.id, 'concluido')}>✅ Concluir</button>
          {(t.responsavel_id === usuario.id || ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao)) && (
            transfOpen
              ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={transfAlvo} onChange={e => setTransfAlvo(e.target.value)} style={{ ...styles.campo, marginBottom: 0, fontSize: 12, minWidth: 150 }}>
                    <option value="">transferir para…</option>
                    {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ` · ${c.funcao}` : ''}</option>)}
                  </select>
                  <button style={styles.btnOk} disabled={!transfAlvo} onClick={() => { onTransferir(t.id, transfAlvo); setTransfOpen(false); setTransfAlvo(''); }}>OK</button>
                  <button style={styles.btnSm} onClick={() => setTransfOpen(false)}>✕</button>
                </span>
              : <button style={styles.btnSm} onClick={() => { setTransfOpen(true); onGarantirColabs(); }}>↗ Transferir</button>
          )}
        </div>
      )}

      {/* Notificação: confirmar ciência sem precisar abrir o card */}
      {isNotif && !expandido && t.status !== 'concluido' && !reanalisePendente && t.origem !== 'ciencia_gestao' && t.origem !== 'escala_ciencia' && (
        <div style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}>
          <button style={styles.btnOk} onClick={() => onCiencia(t.id)}>✅ Confirmar ciência</button>
        </div>
      )}

      {expandido && (
        <div style={styles.det} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 1.5 }}>{t.descricao}</div>
          {precisaConfirmarUrg && (
            <div style={{ background: '#FCEBEB', border: '1px solid #C0392B', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: '#922', marginBottom: 6 }}>⚠️ Esta tarefa foi marcada como <strong>urgente</strong> por {t.urgente_por_nome || 'outra pessoa'}. É realmente urgente?</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={styles.btnOk} onClick={() => onConfirmarUrgencia(t.id, true)}>Sim, é urgente</button>
                <button style={styles.btnBad} onClick={() => onConfirmarUrgencia(t.id, false)}>Não é urgente</button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {podeLancarOc && t.criado_por && t.criado_por !== usuario.id && (
              ocOpen ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
                  <select value={ocMotivo} onChange={e => setOcMotivo(e.target.value)} style={{ ...styles.campo, marginBottom: 0, flex: 1, minWidth: 150, fontSize: 12 }}>
                    <option value="">motivo da ocorrência…</option>
                    {motivosOc.map(m => <option key={m.id} value={m.id}>{m.categoria} · {m.motivo} ({m.zera ? 'zera' : `-${m.deducao}%`})</option>)}
                  </select>
                  <input value={ocObs} onChange={e => setOcObs(e.target.value)} placeholder="observação" style={{ ...styles.campo, marginBottom: 0, flex: 1, minWidth: 120, fontSize: 12 }} />
                  <button style={styles.btnOk} disabled={!ocMotivo} onClick={() => { onLancarOcorrencia(t.criado_por, ocMotivo, ocObs); setOcOpen(false); setOcMotivo(''); setOcObs(''); }}>Enviar ao RH</button>
                  <button style={styles.btnSm} onClick={() => setOcOpen(false)}>cancelar</button>
                </div>
              ) : (
                <button style={styles.btnSm} onClick={() => setOcOpen(true)}>⚠️ Lançar ocorrência</button>
              )
            )}
            {t.origem === 'premiacao_aceite' && t.status !== 'concluido' && t.referencia_id && (
              <button style={styles.btnOk} onClick={() => onAceitar(t.referencia_id)}>🏆 Aceitar participação</button>
            )}
            {['checklist_comercial', 'checklist_suporte'].includes(t.origem) && t.status !== 'concluido' && (
              <button style={styles.btnSm} onClick={() => onReanaliseChecklist(t.id)}>🔁 Pedir reanálise</button>
            )}
            {isNotif && t.status !== 'concluido' && !reanalisePendente && t.origem !== 'ciencia_gestao' && t.origem !== 'escala_ciencia' && (
              <button style={styles.btnOk} onClick={() => onCiencia(t.id)}>✅ Confirmar ciência</button>
            )}
            {reanalisePendente && ehCriadorCard && (
              <>
                <button style={styles.btnOk} onClick={() => onReanalisar(t.id, 'aceita')}>✅ Aceitar reanálise</button>
                <button style={styles.btnBad} onClick={() => onReanalisar(t.id, 'rejeitada')}>❌ Rejeitar</button>
              </>
            )}
            {!isNotif && (t.responsavel_id === usuario.id || ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao)) && t.status !== 'concluido' && (
              transfOpen ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
                  <select value={transfAlvo} onChange={e => setTransfAlvo(e.target.value)} style={{ ...styles.campo, marginBottom: 0, flex: 1, minWidth: 130, fontSize: 12 }}>
                    <option value="">transferir para…</option>
                    {colabs.filter(c => c.id !== t.responsavel_id).map(c => (
                      <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ` — ${c.funcao}` : ''}</option>
                    ))}
                  </select>
                  <button style={styles.btnOk} disabled={!transfAlvo} onClick={() => { onTransferir(t.id, transfAlvo); setTransfOpen(false); setTransfAlvo(''); }}>OK</button>
                  <button style={styles.btnSm} onClick={() => setTransfOpen(false)}>cancelar</button>
                </div>
              ) : (
                <button style={styles.btnSm} onClick={() => { setTransfOpen(true); onGarantirColabs(); }}>↗ Transferir</button>
              )
            )}
            {!isNotif && ehGestaoCard && t.status !== 'concluido' && (
              <div style={{ width: '100%' }}>
                {(t.apoios && t.apoios.length > 0) && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    {t.apoios.map(a => (
                      <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, background: '#EEF2FF', color: '#3730A3', borderRadius: 12, padding: '2px 8px' }}>
                        👥 {a.nome}
                        <button title="remover apoio" style={{ border: 'none', background: 'none', color: '#993C1D', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }} onClick={() => onRemoveApoio(t.id, a.id)}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
                {apoioOpen ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
                    <select value={apoioAlvo} onChange={e => setApoioAlvo(e.target.value)} style={{ ...styles.campo, marginBottom: 0, flex: 1, minWidth: 130, fontSize: 12 }}>
                      <option value="">adicionar apoio…</option>
                      {colabs.filter(c => c.id !== t.responsavel_id && !(t.apoios || []).some(a => a.id === c.id)).map(c => (
                        <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ` — ${c.funcao}` : ''}</option>
                      ))}
                    </select>
                    <button style={styles.btnOk} disabled={!apoioAlvo} onClick={() => { onAddApoio(t.id, apoioAlvo); setApoioOpen(false); setApoioAlvo(''); }}>Adicionar</button>
                    <button style={styles.btnSm} onClick={() => setApoioOpen(false)}>cancelar</button>
                  </div>
                ) : (
                  <button style={styles.btnSm} onClick={() => { setApoioOpen(true); onGarantirColabs(); }}>👥 + Apoio</button>
                )}
              </div>
            )}
            {!isNotif && t.origem === 'avaliacao_revisao' && t.responsavel_id === usuario.id && t.status !== 'concluido' && (
              <>
                <button style={styles.btnOk} onClick={() => onRevisarAval(t.id, 'aceita')}>✅ Aceitar avaliação</button>
                <button style={styles.btnBad} onClick={() => onRevisarAval(t.id, 'rejeitada')}>❌ Rejeitar (não conta)</button>
              </>
            )}
            {!isNotif && t.origem !== 'avaliacao_revisao' && (t.status === 'aberto' || t.status === 'andamento') && t.reanalise_status !== 'pendente' && (
              <>
                {t.status === 'aberto' && <button style={styles.btnSm} onClick={() => onMover(t.id, 'andamento')}>▶ Iniciar</button>}
                <button style={styles.btnOk} onClick={() => onMover(t.id, 'concluido')}>✅ Concluir</button>
              </>
            )}
          </div>
          {t.status === 'atrasado' && (
            <div style={{ ...styles.alerta, marginTop: 8 }}>⚠️ Tarefa atrasada — impacto no indicador</div>
          )}
          {isNotif && t.status === 'atrasado' && (
            <div style={{ ...styles.alerta, marginTop: 8 }}>🔒 Prazo vencido — sistema bloqueado até confirmar ciência</div>
          )}
          {!isNotif && t.origem === 'avaliacao_admin' && t.status !== 'concluido' && (
            <AvaliacaoTarefaInline task={t} onRecarregar={onRecarregar} />
          )}
          {!isNotif && t.origem === 'checklist_diario' && t.status !== 'concluido' && (
            <ChecklistDiarioInline compact onChange={onRecarregar} />
          )}
          {!isNotif && t.origem === 'checklist_limpeza' && t.status !== 'concluido' && (
            <ChecklistLimpezaInline compact onChange={onRecarregar} />
          )}
          {!isNotif && t.origem === 'checklist_operacional' && t.status !== 'concluido' && (
            <ChecklistOperacionalInline compact onChange={onRecarregar} />
          )}
          {!isNotif && t.origem === 'folga' && t.referencia_id && (
            <FolgaAprovacaoInline folgaId={t.referencia_id} onChange={onRecarregar} />
          )}
          {t.origem === 'mkt_comprador' && t.referencia_id && (
            <CompradorOfertaInline agendaId={String(t.referencia_id).replace('mktcomp:', '')} onChange={onRecarregar} />
          )}
          {t.origem === 'compras' && /^(itensnovos|semvenda):/.test(t.referencia_id || '') && (
            <AlertaItensInline refId={t.referencia_id} />
          )}
          {t.origem === 'email' && <EmailRespostaInline tarefaId={t.id} />}
          {!isNotif && t.origem === 'folga_rejeitada' && t.referencia_id && t.status !== 'concluido' && (
            <FolgaRejeitadaInline folgaId={t.referencia_id} onChange={onRecarregar} />
          )}
          {!isNotif && t.origem === 'assinatura' && t.referencia_id && (
            <AssinaturaInline assinaturaId={t.referencia_id} onChange={onRecarregar} />
          )}
          {!isNotif && t.origem === 'feriado_escala' && t.referencia_id && (
            <EscalaFeriadoInline escalaId={t.referencia_id} onChange={onRecarregar} />
          )}
          {t.origem === 'ciencia_gestao' && t.referencia_id && (
            <CienciaGestaoInline assinaturaId={t.referencia_id} concluido={t.status === 'concluido'} onChange={onRecarregar} />
          )}
          {t.origem === 'escala_ciencia' && t.referencia_id && (
            <EscalaCienciaInline escalaId={t.referencia_id} concluido={t.status === 'concluido'} onChange={onRecarregar} />
          )}
          {!isNotif && t.origem === 'escala_pendente' && t.referencia_id && (
            <EscalaLancarInline referencia={t.referencia_id} concluido={t.status === 'concluido'} onChange={onRecarregar} />
          )}
          {t.origem === 'campanha' && t.referencia_id && (
            <CampanhaComprovanteInline tarefa={t} usuario={usuario} onChange={onRecarregar} />
          )}
          {t.origem === 'ocorrencia_validar' && t.referencia_id && ['RH', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao) && (
            <OcorrenciaValidarInline ocorrenciaId={t.referencia_id} onChange={onRecarregar} />
          )}
          <Comentarios t={t} usuario={usuario} onRecarregar={onRecarregar} />
          <Anexos t={t} usuario={usuario} onRecarregar={onRecarregar} />
          {t.status === 'concluido' && t.tipo === 'tarefa' && t.reanalise_status !== 'encerrada_auto' && <AvaliacaoAtendimento t={t} usuario={usuario} />}
        </div>
      )}
    </div>
  );
}

function Comentarios({ t, usuario, onRecarregar }) {
  const { API } = useAuth();
  const [lista, setLista] = useState([]);
  const [texto, setTexto] = useState('');
  const [interno, setInterno] = useState(false);
  const [podeInterno, setPodeInterno] = useState(false);
  const [msg, setMsg] = useState('');
  const carregar = () => API.get(`/tarefas/${t.id}/comentarios`).then(r => { setLista(r.data.comentarios || []); setPodeInterno(!!r.data.pode_interno); }).catch(() => {});
  useEffect(() => { carregar(); if (t.comentarios_novos > 0 && onRecarregar) { const id = setTimeout(onRecarregar, 600); return () => clearTimeout(id); } }, []); // eslint-disable-line

  const ehResponsavel = t.responsavel_id === usuario.id;
  const pendente = t.reanalise_status === 'pendente';

  async function acao(fn, okMsg) {
    try { await fn(); setTexto(''); setMsg(okMsg); carregar(); onRecarregar?.(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }
  const comentar = () => texto.trim() && acao(() => API.post(`/tarefas/${t.id}/comentar`, { texto, interno: interno ? 1 : 0 }), interno ? 'Comentário interno adicionado.' : 'Comentário adicionado.');
  const justificar = () => texto.trim() ? acao(() => API.post(`/tarefas/${t.id}/justificar`, { texto }), 'Enviado para reanálise.') : setMsg('Escreva a justificativa.');

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 6 }}>Comentários</div>
      {lista.length === 0 && <div style={{ fontSize: 11, color: '#aaa', marginBottom: 6 }}>Sem comentários ainda.</div>}
      {lista.map((c, i) => (
        <div key={i} style={{ fontSize: 11, marginBottom: 5, background: c.interno ? '#EDE9FB' : c.tipo === 'justificativa' ? '#FAEEDA' : '#f8f8f8', borderRadius: 6, padding: '5px 8px', border: c.interno ? '1px dashed #3C3489' : 'none' }}>
          {c.interno ? <span style={{ color: '#3C3489', fontWeight: 600 }}>🔒 interno · </span> : null}<strong>{c.autor_nome}</strong>{c.tipo === 'justificativa' ? ' · justificativa' : ''}: {c.texto}
        </div>
      ))}
      {pendente && <div style={{ fontSize: 11, color: '#854F0B', margin: '4px 0' }}>⏳ Aguardando reanálise de quem abriu a tarefa</div>}
      {t.reanalise_status === 'aceita' && <div style={{ fontSize: 11, color: '#3B6D11' }}>✓ Justificativa aceita</div>}
      {t.reanalise_status === 'rejeitada' && <div style={{ fontSize: 11, color: '#993C1D' }}>✗ Justificativa rejeitada</div>}
      <textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escreva um comentário ou justificativa…"
        style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box', minHeight: 46, marginTop: 4 }} />
      {podeInterno && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#3C3489', margin: '4px 0' }}>
          <input type="checkbox" checked={interno} onChange={e => setInterno(e.target.checked)} />
          🔒 Comentário interno (não aparece para quem abriu a tarefa)
        </label>
      )}
      {msg && <div style={{ fontSize: 11, color: '#3B6D11', margin: '4px 0' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        <button style={styles.btnSm} onClick={comentar}>Comentar</button>
        {ehResponsavel && t.status !== 'concluido' && !pendente && t.origem !== 'reanalise_resultado' && <button style={styles.btnSm} onClick={justificar}>Justificar (pedir reanálise)</button>}
      </div>
    </div>
  );
}

function Anexos({ t, usuario, onRecarregar }) {
  const { API } = useAuth();
  const [lista, setLista] = useState([]);
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [exigeAss, setExigeAss] = useState(false);
  const [colabs, setColabs] = useState([]);
  const [selSigs, setSelSigs] = useState([]);
  const [assinando, setAssinando] = useState(null);
  const [aberto, setAberto] = useState({});
  const carregar = () => API.get(`/tarefas/${t.id}/anexos`).then(r => setLista(r.data.anexos || [])).catch(() => {});
  useEffect(() => { carregar(); }, []); // eslint-disable-line

  async function ativarAssinatura(on) {
    setExigeAss(on); if (!on) { setSelSigs([]); return; }
    if (!colabs.length) { try { const r = await API.get('/colaboradores'); setColabs(r.data.colaboradores || []); } catch (e) { /* segue */ } }
  }
  const toggleSig = id => setSelSigs(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  async function enviarArquivo(file) {
    if (!file) return;
    if (exigeAss && !selSigs.length) { setMsg('Escolha quem precisa assinar.'); return; }
    setEnviando(true); setMsg('');
    try {
      const dados = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
      await API.post(`/tarefas/${t.id}/anexos`, { nome: file.name, mime: file.type, dados, signatarios: exigeAss ? selSigs : [] });
      setMsg('✅ Anexo enviado.'); setExigeAss(false); setSelSigs([]); carregar(); onRecarregar?.();
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro ao enviar (arquivo grande demais?).'); }
    setEnviando(false);
  }
  async function ver(a) {
    if (aberto[a.id]) { setAberto({ ...aberto, [a.id]: null }); return; }
    try { const r = await API.get(`/tarefas/${t.id}/anexos/${a.id}`); setAberto({ ...aberto, [a.id]: r.data }); }
    catch (e) { setMsg('Erro ao abrir o anexo.'); }
  }
  function baixar(a, d) {
    const link = document.createElement('a'); link.href = `data:${d.mime};base64,${d.dados}`; link.download = a.nome; link.click();
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 6 }}>Anexos</div>
      {lista.length === 0 && <div style={{ fontSize: 11, color: '#aaa', marginBottom: 6 }}>Sem anexos.</div>}
      {lista.map(a => (
        <div key={a.id} style={{ fontSize: 11, marginBottom: 5, background: '#f8f8f8', borderRadius: 6, padding: '5px 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
            <span style={{ overflowWrap: 'anywhere' }}>{a.tipo === 'imagem' ? '🖼️' : a.tipo === 'audio' ? '🎧' : '📄'} {a.nome} <span style={{ color: '#aaa' }}>· {a.autor_nome}</span></span>
            <button style={styles.btnSm} onClick={() => ver(a)}>{aberto[a.id] ? 'fechar' : 'abrir'}</button>
          </div>
          {a.exige_assinatura ? (
            <div style={{ marginTop: 3 }}>
              {(a.signatarios || []).map(sg => (
                <div key={sg.signatario_id} style={{ fontSize: 10, color: sg.assinado ? '#3B6D11' : '#854F0B', marginTop: 2 }}>
                  {sg.assinado ? '✍️ assinado e ciente' : '⏳ aguardando'} · {sg.signatario_nome}
                  {sg.assinado ? ` · IP ${sg.ip || '—'} · ${sg.assinado_em ? new Date(sg.assinado_em + 'Z').toLocaleString('pt-BR') : ''}` : ''}
                  {!sg.assinado && sg.signatario_id === usuario.id && (
                    <button style={{ ...styles.btnSm, marginLeft: 6, fontSize: 10, padding: '2px 8px' }} onClick={() => setAssinando(a)}>✍️ Assinar (selfie)</button>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          {aberto[a.id] && (
            <div style={{ marginTop: 6 }}>
              {a.tipo === 'imagem' && <img src={`data:${aberto[a.id].mime};base64,${aberto[a.id].dados}`} alt={a.nome} style={{ maxWidth: '100%', borderRadius: 6 }} />}
              {a.tipo === 'audio' && <audio controls src={`data:${aberto[a.id].mime};base64,${aberto[a.id].dados}`} style={{ width: '100%' }} />}
              <div><button style={{ ...styles.btnSm, marginTop: 4 }} onClick={() => baixar(a, aberto[a.id])}>⬇ baixar</button></div>
            </div>
          )}
        </div>
      ))}
      {t.status !== 'concluido' && (
        <div style={{ marginTop: 4 }}>
          {usuario.escritorio && (
          <div style={{ marginBottom: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666' }}>
              <input type="checkbox" checked={exigeAss} onChange={e => ativarAssinatura(e.target.checked)} />
              Exigir assinatura (selfie + ciente + IP + horário)
            </label>
            {exigeAss && (
              <div style={{ marginTop: 4, maxHeight: 130, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 6 }}>
                <div style={{ fontSize: 10, color: '#999', marginBottom: 4 }}>Quem precisa assinar (pode ser mais de um):</div>
                {colabs.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '2px 0' }}>
                    <input type="checkbox" checked={selSigs.includes(c.id)} onChange={() => toggleSig(c.id)} />
                    {c.nome}{c.funcao ? ` — ${c.funcao}` : ''}
                  </label>
                ))}
                {!colabs.length && <div style={{ fontSize: 10, color: '#aaa' }}>Carregando pessoas…</div>}
                {selSigs.length > 0 && <div style={{ fontSize: 10, color: '#185FA5', marginTop: 6 }}>Agora anexe o documento abaixo — ele será enviado para essas pessoas assinarem.</div>}
              </div>
            )}
          </div>
          )}
          <label style={{ ...styles.btnSm, display: 'inline-block', cursor: 'pointer', ...(exigeAss && selSigs.length ? { background: '#EAF3DE', borderColor: '#3B6D11', color: '#3B6D11' } : {}) }}>
            {enviando ? 'enviando…' : (exigeAss && selSigs.length ? '📎 Anexar documento e enviar p/ assinatura' : '📎 Anexar arquivo / imagem / áudio')}
            <input type="file" style={{ display: 'none' }} disabled={enviando} onChange={e => enviarArquivo(e.target.files[0])} />
          </label>
        </div>
      )}
      {msg && <div style={{ fontSize: 11, color: '#3B6D11', marginTop: 4 }}>{msg}</div>}
      {assinando && <AssinaturaModal t={t} anexo={assinando} onClose={() => setAssinando(null)} onAssinado={() => { setAssinando(null); setMsg('✍️ Documento assinado.'); carregar(); onRecarregar?.(); }} />}
    </div>
  );
}

function AssinaturaModal({ t, anexo, onClose, onAssinado }) {
  const { API } = useAuth();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [msg, setMsg] = useState('Permita o acesso à câmera…');
  const [enviando, setEnviando] = useState(false);
  const [ciente, setCiente] = useState(false);

  useEffect(() => {
    let cancel = false;
    if (!navigator.mediaDevices?.getUserMedia) { setMsg('Câmera indisponível neste dispositivo/navegador.'); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then(s => { if (cancel) { s.getTracks().forEach(tk => tk.stop()); return; } streamRef.current = s; if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); } setMsg(''); })
      .catch(() => setMsg('Não foi possível acessar a câmera. Verifique a permissão.'));
    return () => { cancel = true; streamRef.current?.getTracks().forEach(tk => tk.stop()); };
  }, []); // eslint-disable-line

  async function capturar() {
    const v = videoRef.current; if (!v) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth || 320; canvas.height = v.videoHeight || 240;
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
    const selfie = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
    setEnviando(true); setMsg('');
    try {
      await API.post(`/tarefas/${t.id}/anexos/${anexo.id}/assinar`, { selfie, ciente: 1 });
      streamRef.current?.getTracks().forEach(tk => tk.stop());
      onAssinado();
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro ao assinar.'); setEnviando(false); }
  }

  return (
    <div style={styles.bloqueioOverlay} onClick={onClose}>
      <div style={{ ...styles.avalCard, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Assinar: {anexo.nome}</div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Tire uma selfie para registrar a assinatura. Ficam gravados sua foto, IP e horário.</div>
        <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 8, background: '#000' }} />
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#111', textAlign: 'left', margin: '10px 0' }}>
          <input type="checkbox" checked={ciente} onChange={e => setCiente(e.target.checked)} style={{ marginTop: 2 }} />
          <span>Declaro que <strong>li e estou ciente</strong> do conteúdo deste documento.</span>
        </label>
        {msg && <div style={{ fontSize: 12, color: '#854F0B', margin: '8px 0' }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
          <button style={{ ...styles.btnOk, opacity: (enviando || !ciente) ? 0.5 : 1 }} disabled={enviando || !ciente} onClick={capturar}>{enviando ? 'assinando…' : '📸 Capturar e assinar'}</button>
          <button style={styles.btnSm} onClick={onClose}>cancelar</button>
        </div>
      </div>
    </div>
  );
}

function AvaliacaoAtendimento({ t, usuario }) {
  const { API } = useAuth();
  const [info, setInfo] = useState(null);
  const [nota, setNota] = useState(0);
  const [msg, setMsg] = useState('');
  useEffect(() => { API.get(`/tarefas/${t.id}/atendimento`).then(r => setInfo(r.data)).catch(() => {}); }, []); // eslint-disable-line
  if (!info || !info.sou_parte) return null;
  if (info.ja_avaliei) return <div style={{ fontSize: 11, color: '#3B6D11', marginTop: 8 }}>✓ Você já avaliou o atendimento de {info.outro_nome}.</div>;
  async function enviar() {
    if (!nota) { setMsg('Dê uma nota de 1 a 5.'); return; }
    try { const r = await API.post(`/tarefas/${t.id}/avaliar-atendimento`, { nota }); setMsg(r.data.gerou_alerta ? '✅ Registrado. Nota baixa → enviada ao Diretor para revisão.' : '✅ Avaliação registrada.'); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 4 }}>⭐ Avalie o atendimento de {info.outro_nome}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setNota(n)} style={{ ...styles.btnEstrela, opacity: nota >= n ? 1 : 0.3 }}>⭐</button>)}
      </div>
      {msg && <div style={{ fontSize: 11, color: '#3B6D11', margin: '4px 0' }}>{msg}</div>}
      <button style={{ ...styles.btnSm, marginTop: 4 }} onClick={enviar}>Enviar avaliação</button>
    </div>
  );
}

const styles = {
  wrap: { padding: '1rem', maxWidth: 1440, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  loading: { padding: 40, textAlign: 'center', color: '#666' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 },
  titulo: { fontSize: 20, fontWeight: 700, color: '#111' },
  subtitulo: { fontSize: 12, color: '#666', marginTop: 2 },
  metricas: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginBottom: 16 },
  metrica: { background: '#f8f8f8', borderRadius: 8, padding: '10px', textAlign: 'center' },
  metricaVal: { fontSize: 22, fontWeight: 700 },
  metricaLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  filtros: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 },
  filtroBtn: { fontSize: 11, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666' },
  filtroBtnAtivo: { background: '#111', color: '#fff', borderColor: '#111' },
  colunas: { display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, paddingRight: 16, WebkitOverflowScrolling: 'touch', alignItems: 'flex-start' },
  // Cada coluna rola por dentro (não precisa da rolagem do Windows); o cabeçalho fica fixo no topo dela.
  coluna: { flex: '1 1 260px', minWidth: 260, maxHeight: 'calc(100vh - 250px)', minHeight: 240, overflowY: 'auto', overflowX: 'hidden' },
  colunaHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '6px 0', position: 'sticky', top: 0, background: '#fff', zIndex: 2 },
  count: { fontSize: 11, padding: '2px 8px', background: '#f0f0f0', borderRadius: 6, color: '#666' },
  vazio: { fontSize: 12, color: '#aaa', textAlign: 'center', padding: '12px 0' },
  card: { background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '12px', marginBottom: 8, overflowWrap: 'anywhere' },
  cardTitulo: { fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 4, overflowWrap: 'anywhere' },
  cardSub: { fontSize: 11, color: '#666', overflowWrap: 'anywhere' },
  tag: { fontSize: 10, padding: '2px 7px', borderRadius: 4 },
  det: { marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' },
  btnSm: { fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer' },
  btnOk: { fontSize: 12, padding: '4px 12px', border: '1.5px solid #3B6D11', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#3B6D11', fontWeight: 500 },
  btnBad: { fontSize: 12, padding: '4px 12px', border: '1.5px solid #993C1D', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#993C1D', fontWeight: 500 },
  alerta: { fontSize: 12, background: '#FCEBEB', borderRadius: 8, padding: '6px 10px', color: '#993C1D' },
  bloqueioOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.88)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  bloqueioCard: { background: '#fff', borderRadius: 14, padding: '1.5rem', maxWidth: 360, width: '100%', textAlign: 'center' },
  bloqueioTitulo: { fontSize: 17, fontWeight: 700, marginBottom: 6 },
  bloqueioSub: { fontSize: 13, color: '#666', marginBottom: 16 },
  bloqueioItem: { background: '#FCEBEB', borderRadius: 8, padding: '8px 12px', marginBottom: 14, textAlign: 'left', fontSize: 13, color: '#993C1D' },
  avalCard: { background: '#fff', borderRadius: 14, padding: '1.5rem', maxWidth: 360, width: '100%' },
  btnEstrela: { fontSize: 22, background: 'none', border: 'none', cursor: 'pointer' },
  btnPrimario: { width: '100%', padding: 10, background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  btnSecundario: { width: '100%', padding: 10, background: 'none', color: '#666', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
  btnNova: { padding: '8px 14px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecundarioHdr: { padding: '8px 14px', background: '#fff', color: '#185FA5', border: '1.5px solid #185FA5', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  campo: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, boxSizing: 'border-box', marginBottom: 8 },
  rotulo: { display: 'block', fontSize: 12, color: '#666', marginBottom: 3 },
  msgFlutuante: { background: '#EAF3DE', border: '1px solid #3B6D11', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#3B6D11' },
};
