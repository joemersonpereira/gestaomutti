import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Kanban from './pages/Kanban';
import PainelGerente from './pages/PainelGerente';
import MeuRH from './pages/MeuRH';
import Ocorrencias from './pages/Ocorrencias';
import Cadastros from './pages/Cadastros';
import Calendario from './pages/Calendario';
import Premiacao from './pages/Premiacao';
import MinhasMetas from './pages/MinhasMetas';
import MeuSetor from './pages/MeuSetor';
import IndicadoresColaborador from './pages/IndicadoresColaborador';
import Capacitacao from './pages/Capacitacao';
import Visao360 from './pages/Visao360';
import ChecklistGerente from './pages/ChecklistGerente';
import Conferentes from './pages/Conferentes';
import Checklist from './pages/Checklist';
import Auditoria from './pages/Auditoria';
import Avaliacoes from './pages/Avaliacoes'; // eslint-disable-line no-unused-vars
import AvaliacaoAdmin from './pages/AvaliacaoAdmin';
import Marketing from './pages/Marketing';
import PainelSupervisor from './pages/PainelSupervisor';
import PainelDiretoria from './pages/PainelDiretoria';
import PremiacaoEquipe from './pages/PremiacaoEquipe';
import Ranking from './pages/Ranking';
import Relatorios from './pages/Relatorios';
import Folgas from './pages/Folgas';
import Satisfacao from './pages/Satisfacao';
import AvaliarLoja from './pages/AvaliarLoja';
import AvaliarVendedor from './pages/AvaliarVendedor';
import AvaliarAtendimento from './pages/AvaliarAtendimento';
import AutoCadastro from './pages/AutoCadastro';
import AssinarTermo from './pages/AssinarTermo';
import PesquisaDesligamento from './pages/PesquisaDesligamento';
import Desligamentos from './pages/Desligamentos';
import PainelRH from './pages/PainelRH';
import Clima from './pages/Clima';
import PainelCompras from './pages/PainelCompras';
import Financeiro from './pages/Financeiro';
import ContasReceber from './pages/ContasReceber';
import ConciliacaoCartoes from './pages/ConciliacaoCartoes';
import Entrega from './pages/Entrega';
import Etiquetas from './pages/Etiquetas';
import MarketingCalendario from './pages/MarketingCalendario';
import Formulas from './pages/Formulas';
import Patrimonio from './pages/Patrimonio';
import Rhia from './pages/Rhia';
import PeDeMeia from './pages/PeDeMeia';
import Acordos from './pages/Acordos';
import TradeMarketing from './pages/TradeMarketing';
import Ponto from './pages/Ponto';
import PontoRepp from './pages/PontoRepp';
import Devolucoes from './pages/Devolucoes';
import DocumentosRH from './pages/DocumentosRH';
import Mural from './pages/Mural';
import CanalEscuta from './pages/CanalEscuta';
import Faltas from './pages/Faltas';
import Mercado from './pages/Mercado';
import Beneficios from './pages/Beneficios';
import LojaPontos from './pages/LojaPontos';
import Controladoria from './pages/Controladoria';
import Integracoes from './pages/Integracoes';
import EmailTarefas from './pages/EmailTarefas';
import ServicosFarmaceuticos from './pages/ServicosFarmaceuticos';
import EstagiosFaturas from './pages/EstagiosFaturas';
import EstagioRH from './pages/EstagioRH';
import Contabilidade from './pages/Contabilidade';
import Fiscal from './pages/Fiscal';
import BancoTalentos from './pages/BancoTalentos';
import Fornecedores from './pages/Fornecedores';
import AuditoriaContabil from './pages/AuditoriaContabil';
import TesourariaCaixa from './pages/TesourariaCaixa';

// Registro de módulos. perfis '*' = todos; senão lista de funções que enxergam.
const GESTAO = ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'];
const MODULOS = [
  { id: 'tarefas', label: '✅ Tarefas', C: Kanban, perfis: '*' },
  { id: 'comunidade', label: '💬 Comunidade', C: Mural, perfis: '*' },
  { id: 'loja-pontos', label: '🏅 Loja de pontos', C: LojaPontos, perfis: '*' },
  { id: 'metas', label: '🏆 Premiação & Metas', C: Premiacao, perfis: ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'] },
  { id: 'minhasmetas', label: '🎯 Minhas Metas', C: MinhasMetas, perfis: '*' },
  { id: 'meu-setor', label: '🎯 Meu Setor', C: MeuSetor, perfis: ['Gerente', 'Subgerente', 'Supervisor', 'Comercial', 'Comprador Beleza', 'Comprador Bem-estar', 'Marketing', 'RH', 'Controladoria', 'Financeiro', 'Tesouraria', 'Suporte', 'Devolução', 'Ouvidoria', 'Gestor Geral', 'Diretor Geral'] },
  { id: 'indicadores-colab', label: '🎯 Indicadores individuais', C: IndicadoresColaborador, perfis: ['RH', 'Controladoria', 'Gestor Geral', 'Diretor Geral'] },
  { id: 'capacitacao', label: '🎓 Capacitação (T&D)', C: Capacitacao, perfis: '*' },
  { id: 'visao360', label: '🧭 Visão 360', C: Visao360, perfis: ['Gerente', 'Subgerente', 'Supervisor', 'RH', 'Controladoria', 'Financeiro', 'Gestor Geral', 'Diretor Geral'] },
  { id: 'cadastros', label: '👤 Colaboradores', C: () => <Cadastros modo="colaborador" />, perfis: ['RH', 'Supervisor', 'Gestor Geral', 'Diretor Geral'] },
  { id: 'afastamentos', label: '🌴 Afastamentos', C: () => <Cadastros modo="afastamentos" />, perfis: ['RH', 'Gestor Geral', 'Diretor Geral'] },
  { id: 'parametros', label: '🗂️ Parâmetros', C: () => <Cadastros modo="config" />, perfis: ['RH', 'Supervisor', 'Gestor Geral', 'Diretor Geral'] },
  { id: 'calendario', label: '📅 Feriados e Escala', C: Calendario, perfis: ['Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'] },
  { id: 'meurh', label: '👤 Meu RH', C: MeuRH, perfis: '*' },
  { id: 'canal-escuta', label: '📬 Canal de escuta', C: CanalEscuta, perfis: ['RH', 'Ouvidoria', 'Supervisor', 'Gestor Geral', 'Diretor Geral'] },
  { id: 'documentos-rh', label: '📄 Holerites (RH)', C: DocumentosRH, perfis: ['RH', 'Gestor Geral', 'Diretor Geral'] },
  { id: 'beneficios', label: '🎁 Benefícios', C: Beneficios, perfis: ['RH', 'Gestor Geral', 'Diretor Geral', 'Controladoria'] },
  { id: 'painel-rh', label: '🧭 Painel RH', C: PainelRH, perfis: ['RH', 'Gestor Geral', 'Diretor Geral', 'Supervisor'] },
  { id: 'clima', label: '📊 Pesquisas de Clima', C: Clima, perfis: ['RH', 'Gestor Geral', 'Diretor Geral'] },
  { id: 'desligamentos', label: '🚪 Desligamentos', C: Desligamentos, perfis: ['RH', 'Gestor Geral', 'Diretor Geral'] },
  { id: 'folgas', label: '🌴 Folgas', C: Folgas, perfis: '*' },
  { id: 'ocorrencias', label: '⚠️ Ocorrências', C: Ocorrencias, perfis: '*' },
  { id: 'mercado', label: '🏬 Meu Mercado', C: () => <Mercado modo="comprar" />, perfis: ['Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'Vendedor', 'Caixa', 'Balconista', 'Farmacêutico'] },
  { id: 'almoxarifado', label: '📦 Almoxarifado', C: () => <Mercado modo="gestao" />, perfis: ['Suporte', 'Gestor Geral', 'Diretor Geral', 'Controladoria'] },
  { id: 'conferentes', label: '📦 Conferentes', C: Conferentes, perfis: ['Conferente', 'Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'Suporte', 'Devolução'] },
  { id: 'devolucoes', label: '↩️ Devoluções', C: Devolucoes, perfis: ['Conferente', 'Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'Suporte', 'Devolução'] },
  { id: 'gerente', label: '📊 Painel Gerente', C: PainelGerente, perfis: GESTAO },
  { id: 'satisfacao', label: '⭐ Satisfação (QR)', C: Satisfacao, perfis: GESTAO },
  { id: 'checklist', label: '🧹 Checklist de Limpeza', C: Checklist, perfis: '*' },
  { id: 'checklist-gerente', label: '✅ Checklist Diário', C: ChecklistGerente, perfis: ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'] },
  { id: 'auditoria', label: '🔎 Checklist de Supervisão', C: Auditoria, perfis: [...GESTAO] },
  { id: 'avaliacao-admin', label: '⭐ Avaliações do setor', C: AvaliacaoAdmin, perfis: ['Suporte', 'Tesouraria', ...GESTAO] },
  { id: 'marketing', label: '📣 Marketing', C: Marketing, perfis: ['Marketing', 'Gestor Geral', 'Diretor Geral', 'Gerente', 'Vendedor', 'Caixa'] },
  { id: 'faltas', label: '📝 Lista de faltas', C: Faltas, perfis: ['Vendedor', 'Gerente', 'Subgerente', 'Supervisor', 'Comprador Beleza', 'Comprador Bem-estar', 'Suporte', 'Gestor Geral', 'Diretor Geral', 'Operador de Loja'] },
  { id: 'painel-compras', label: '🧮 Painel de Compras', C: PainelCompras, perfis: ['Comprador Beleza', 'Comprador Bem-estar', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'Controladoria', 'Gerente', 'Subgerente'] },
  { id: 'acordos', label: '🤝 Acordos e Negociações', C: Acordos, perfis: ['Comprador Beleza', 'Comprador Bem-estar', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'Controladoria', 'Marketing'] },
  { id: 'trademkt', label: '📐 Trade Marketing', C: TradeMarketing, perfis: ['Comprador Beleza', 'Comprador Bem-estar', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'Controladoria', 'Marketing'] },
  { id: 'financeiro', label: '💼 Financeiro', C: Financeiro, perfis: ['Diretor Geral', 'Gestor Geral', 'Controladoria'] },
  { id: 'contas-receber', label: '📥 Contas a Receber', C: ContasReceber, perfis: ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Tesouraria', 'Financeiro'] },
  { id: 'conciliacao-cartao', label: '💳 Conciliação de Cartões', C: ConciliacaoCartoes, perfis: ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Tesouraria', 'Financeiro', 'Contabilidade'] },
  { id: 'estagios', label: '🧾 Faturas', C: EstagiosFaturas, perfis: ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Financeiro', 'RH'] },
  { id: 'estagio-rh', label: '🎓 Estágios', C: EstagioRH, perfis: ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'RH', 'Supervisor'] },
  { id: 'banco-talentos', label: '📝 Banco de Talentos', C: BancoTalentos, perfis: ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'RH', 'Supervisor'] },
  { id: 'entrega', label: '📱 Atendimento Online', C: Entrega, perfis: ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Gerente', 'Subgerente'] },
  { id: 'formulas', label: '💊 Fórmulas', C: Formulas, perfis: ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Gerente', 'Subgerente', 'Balconista', 'Farmacêutico'] },
  { id: 'servicos-farmaceuticos', label: '🩺 Cuidado Farmacêutico', C: ServicosFarmaceuticos, perfis: ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Controladoria', 'Gerente', 'Subgerente', 'Balconista', 'Farmacêutico', 'Vendedor'] },
  { id: 'patrimonio', label: '🗄️ Patrimônio', C: Patrimonio, perfis: '*' },
  { id: 'ponto', label: '🕐 Ponto', C: Ponto, perfis: ['RH', 'Gestor Geral', 'Diretor Geral', 'Supervisor', 'Controladoria'] },
  { id: 'ponto-repp', label: '🕐 Ponto — Escala & Jornada', C: PontoRepp, perfis: ['RH', 'Gestor Geral', 'Diretor Geral', 'Supervisor', 'Controladoria', 'Gerente', 'Subgerente'] },
  { id: 'rhia', label: '🤖 Rhia (IA do grupo)', C: Rhia, perfis: '*' },
  { id: 'pedemeia', label: '🐷 Pé de Meia', C: PeDeMeia, perfis: '*' },
  { id: 'etiquetas', label: '🏷️ Etiquetas de Preço', C: Etiquetas, perfis: ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Marketing', 'Gerente', 'Subgerente', 'Balconista', 'Farmacêutico'] },
  { id: 'mkt-calendario', label: '🗓️ Calendário de Ações', C: MarketingCalendario, perfis: ['Diretor Geral', 'Gestor Geral', 'Supervisor', 'Marketing'] },
  { id: 'supervisor', label: '🌐 Supervisor', C: PainelSupervisor, perfis: ['Supervisor', 'Gestor Geral', 'Diretor Geral'] },
  { id: 'diretoria', label: '🎯 Painel da Gestão', C: PainelDiretoria, perfis: ['Diretor Geral', 'Gestor Geral'] },
  { id: 'premiacao-equipe', label: '💵 Premiação da equipe', C: PremiacaoEquipe, perfis: ['Gerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral'] },
  { id: 'ranking', label: '🏆 Ranking trimestral', C: Ranking, perfis: ['Diretor Geral'] },
  { id: 'relatorios', label: '📑 Relatórios', C: Relatorios, perfis: [...GESTAO, 'RH', 'Marketing', 'Financeiro', 'Controladoria'] },
  { id: 'controladoria', label: '🔍 Controladoria', C: Controladoria, perfis: ['Diretor Geral', 'Gestor Geral', 'Controladoria'] },
  { id: 'contabilidade', label: '🧮 Contabilidade', C: Contabilidade, perfis: ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Contabilidade'] },
  { id: 'fiscal', label: '📋 Fiscal', C: Fiscal, perfis: ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Contabilidade'] },
  { id: 'fornecedores', label: '🏭 Fornecedores', C: Fornecedores, perfis: ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Contabilidade', 'Financeiro'] },
  { id: 'auditoria-contabil', label: '🔎 Auditoria', C: AuditoriaContabil, perfis: ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Contabilidade'] },
  { id: 'tesouraria', label: '🏦 Tesouraria', C: TesourariaCaixa, perfis: ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Tesouraria', 'Supervisor', 'Gerente', 'Subgerente'] },
  { id: 'integracoes', label: '🔌 Status de Integrações', C: Integracoes, perfis: ['Diretor Geral', 'Gestor Geral', 'Suporte', 'Controladoria'] },
  { id: 'email-tarefas', label: '📧 E-mail → Tarefa', C: EmailTarefas, perfis: ['Diretor Geral', 'Gestor Geral', 'Controladoria', 'Financeiro'] },
];

// Menus retirados do Pulsy (2026-10 — pedido do Joe). Ficam fora do menu e da config de Acessos,
// mas as telas continuam no código: para trazer de volta, basta remover o id desta lista.
const REMOVIDOS = new Set([
  // Meu dia (camada inteira)
  'comunidade', 'tarefas', 'minhasmetas', 'meu-setor', 'meurh', 'folgas', 'loja-pontos', 'pedemeia', 'rhia',
  // Operacional (inteiro)
  'gerente', 'checklist-gerente', 'checklist', 'satisfacao', 'calendario', 'formulas', 'servicos-farmaceuticos', 'etiquetas', 'faltas', 'mercado', 'patrimonio',
  // Marketing (inteiro)
  'marketing', 'mkt-calendario',
  // Administrativo (mantém só Conciliação de Cartões)
  'financeiro', 'contas-receber', 'controladoria',
  // Gente & Gestão (RH) — subconjunto
  'visao360', 'capacitacao', 'documentos-rh', 'ocorrencias', 'beneficios', 'clima', 'desligamentos', 'canal-escuta', 'painel-rh',
  // Gestão
  'relatorios', 'avaliacao-admin', 'diretoria', 'ranking',
  // Supervisão (inteira) + Atendimento Online
  'supervisor', 'auditoria', 'premiacao-equipe', 'metas', 'entrega',
  // Comercial — Trade & Fornecedores (Trade Marketing voltou ao menu 2026-10-16 — pedido do Joe)
  'acordos',
  // Logística / Configurações
  'conferentes', 'almoxarifado', 'integracoes', 'email-tarefas',
  // Gente & Gestão — restantes
  'indicadores-colab', 'afastamentos',
  // Ponto antigo (Tangerino) — fica só o Ponto — Escala & Jornada (REP-P)
  'ponto',
  // Removidos a pedido (2026-10-04): Painel de Compras + Logística (Devoluções)
  'painel-compras', 'devolucoes',
]);

// Catálogo leve dos módulos (id + rótulo) para a tela de Acessos (função → menu).
export const MODULOS_META = MODULOS.filter(m => !REMOVIDOS.has(m.id)).map(m => ({ id: m.id, label: m.label }));

// Núcleo que nunca é bloqueado (todos precisam) e a config que nunca tranca a gestão.
const ACESSO_NUCLEO = new Set(['comunidade', 'tarefas', 'minhasmetas', 'meurh']);
// podeVer aplica o override configurável (Cadastros › Acessos) sobre o padrão do código,
// com travas: Diretor Geral vê tudo; Gestor Geral nunca perde Parâmetros/Acessos.
function podeVer(m, funcao, overrides) {
  if (funcao === 'Diretor Geral') return true;
  if (funcao === 'Gestor Geral' && (m.id === 'parametros' || m.id === 'acessos')) return true;
  const ov = overrides && overrides[m.id];
  if (ov === true) return true;
  if (ov === false && !ACESSO_NUCLEO.has(m.id)) return false;
  return m.perfis === '*' || m.perfis.includes(funcao);
}

// Reorganização de menus V3 — 3 camadas (Meu dia · Departamentos · Gestão) com submenus.
// Cada pessoa vê só o que o perfil permite; a estrutura organiza o que ela vê.
const NAV = [
  { camada: 'Meu dia', grupos: [
    { nome: 'Meu dia', itens: ['comunidade', 'tarefas', 'minhasmetas', 'meu-setor', 'meurh', 'folgas', 'loja-pontos', 'pedemeia', 'rhia'] },
  ] },
  { camada: 'Departamentos', grupos: [
    { nome: 'Operacional', itens: ['gerente', 'checklist-gerente', 'checklist', 'satisfacao', 'calendario', 'formulas', 'servicos-farmaceuticos', 'etiquetas', 'faltas', 'mercado', 'patrimonio'] },
    { nome: 'Comercial', itens: ['painel-compras'], subs: [
      { nome: 'Trade & Fornecedores', itens: ['acordos', 'trademkt'] },
    ] },
    { nome: 'Marketing', itens: ['marketing', 'mkt-calendario'] },
    { nome: 'Gente & Gestão', itens: ['cadastros', 'visao360', 'capacitacao', 'indicadores-colab', 'afastamentos', 'ponto', 'ponto-repp', 'ocorrencias', 'documentos-rh', 'beneficios', 'clima', 'desligamentos', 'canal-escuta', 'painel-rh'] },
    { nome: 'Administrativo', itens: ['financeiro', 'contas-receber', 'conciliacao-cartao', 'tesouraria', 'estagio-rh', 'banco-talentos', 'estagios'], subs: [
      { nome: 'Controladoria', itens: ['controladoria'] },
      { nome: 'Contabilidade', itens: ['contabilidade', 'fornecedores', 'auditoria-contabil'] },
      { nome: 'Fiscal', itens: ['fiscal'] },
    ] },
    { nome: 'Logística', itens: ['conferentes', 'devolucoes', 'almoxarifado'] },
  ] },
  { camada: 'Gestão', grupos: [
    { nome: 'Supervisão', itens: ['supervisor', 'auditoria', 'premiacao-equipe', 'metas'], subs: [
      { nome: 'Atendimento Online', itens: ['entrega'] },
    ] },
    { nome: 'Direção', itens: ['diretoria', 'avaliacao-admin', 'ranking'] },
    { nome: 'Relatórios', itens: ['relatorios'] },
    { nome: 'Configurações', itens: ['parametros', 'integracoes', 'email-tarefas'] },
  ] },
];
// Todos os ids já posicionados (para pescar módulos órfãos e nunca sumir um).
const POSICIONADOS = new Set(NAV.flatMap(c => c.grupos.flatMap(g => [...g.itens, ...(g.subs || []).flatMap(s => s.itens)])));

function AppInner() {
  const { usuario, logout, carregando, API } = useAuth();
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [acessos, setAcessos] = useState(null);
  useEffect(() => {
    if (usuario && API) API.get('/acessos/meus').then(r => setAcessos(r.data.overrides || {})).catch(() => setAcessos({}));
  }, [usuario, API]);

  const visiveis = usuario ? MODULOS.filter(m => !REMOVIDOS.has(m.id) && podeVer(m, usuario.funcao, acessos)) : [];
  const [paginaAtual, setPaginaAtual] = useState('painel-compras');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  const [menuOpen, setMenuOpen] = useState(false);
  // Menu recolhido no desktop (persiste — recolhe uma vez e continua assim).
  const [navCollapsed, setNavCollapsed] = useState(() => typeof window !== 'undefined' && localStorage.getItem('navCollapsed') === '1');
  const toggleNav = () => setNavCollapsed(v => { try { localStorage.setItem('navCollapsed', v ? '0' : '1'); } catch { /* ignore */ } return !v; });
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Navegação entre telas disparada por componentes (ex.: banner da Comunidade → Loja de pontos).
  useEffect(() => {
    const onNav = e => { if (e.detail) { setPaginaAtual(e.detail); setMenuOpen(false); } };
    window.addEventListener('mutti-nav', onNav);
    return () => window.removeEventListener('mutti-nav', onNav);
  }, []);

  if (carregando) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <div style={{ fontSize: 16, color: '#666' }}>Carregando...</div>
      </div>
    );
  }
  if (!usuario) return <Login onLogin={() => {}} />;
  if (usuario.senha_provisoria && !trocandoSenha) return <TrocarSenha onConcluido={() => setTrocandoSenha(true)} />;

  const atual = visiveis.find(m => m.id === paginaAtual) || visiveis[0];
  const Pagina = atual ? atual.C : Kanban;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f3ef', display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>
      {/* Botões flutuantes (Rhia / Chat da Gestão) removidos a pedido do Joe. */}
      {isMobile && (
        <div style={navStyles.topbar}>
          <button onClick={() => setMenuOpen(true)} style={navStyles.hamburger} aria-label="Abrir menu">☰</button>
          <div style={navStyles.marcaMobile}>🏪 Mutti</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><NotificationBell /><button onClick={logout} style={navStyles.btnLogout}>Sair</button></div>
        </div>
      )}
      {isMobile && menuOpen && <div style={navStyles.overlay} onClick={() => setMenuOpen(false)} />}
      {/* colapso só vale no desktop */}
      {(() => { const col = !isMobile && navCollapsed; return (
      <nav style={isMobile ? { ...navStyles.nav, ...navStyles.navMobile, ...(menuOpen ? navStyles.navMobileOpen : {}) } : { ...navStyles.nav, ...(col ? navStyles.navCol : {}) }}>
        <div style={{ ...navStyles.marca, display: 'flex', alignItems: 'center', justifyContent: col ? 'center' : 'space-between', gap: 6 }}>
          {!col && <span>🏪 Mutti</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {!col && !isMobile && <NotificationBell />}
            {!isMobile && (
              <button onClick={toggleNav} title={col ? 'Expandir menu' : 'Recolher menu'} style={navStyles.colBtn}>{col ? '»' : '«'}</button>
            )}
          </div>
        </div>
        <div style={navStyles.menu}>
          {(() => {
            const visById = new Map(visiveis.map(m => [m.id, m]));
            const btn = m => (
              <button key={m.id} title={m.label}
                style={{ ...navStyles.btn, ...(col ? navStyles.btnCol : {}), ...(atual && atual.id === m.id ? navStyles.btnAtivo : {}) }}
                onClick={() => { setPaginaAtual(m.id); setMenuOpen(false); }}>
                {col ? (m.label.split(' ')[0]) : m.label}
              </button>
            );
            const nodes = [];
            NAV.forEach(camada => {
              const gruposVis = camada.grupos.map(g => ({
                nome: g.nome,
                itens: g.itens.map(id => visById.get(id)).filter(Boolean),
                subs: (g.subs || []).map(sub => ({ nome: sub.nome, itens: sub.itens.map(id => visById.get(id)).filter(Boolean) })).filter(sub => sub.itens.length),
              })).filter(g => g.itens.length || g.subs.length);
              if (!gruposVis.length) return;
              if (!col) nodes.push(<div key={'cam-' + camada.camada} style={navStyles.camadaLabel}>{camada.camada}</div>);
              gruposVis.forEach(g => nodes.push(
                <div key={camada.camada + '-' + g.nome} style={navStyles.grupo}>
                  {!col && <span style={navStyles.grupoLabel}>{g.nome}</span>}
                  {g.itens.map(btn)}
                  {g.subs.map(sub => (
                    <div key={sub.nome} style={col ? navStyles.grupo : navStyles.sub}>
                      {!col && <span style={navStyles.subLabel}>{sub.nome}</span>}
                      {sub.itens.map(btn)}
                    </div>
                  ))}
                </div>
              ));
            });
            const orfaos = visiveis.filter(m => !POSICIONADOS.has(m.id));
            if (orfaos.length) {
              if (!col) nodes.push(<div key="cam-outros" style={navStyles.camadaLabel}>Outros</div>);
              nodes.push(<div key="grp-outros" style={navStyles.grupo}>{orfaos.map(btn)}</div>);
            }
            return nodes;
          })()}
        </div>
        <div style={{ ...navStyles.usuario, alignItems: col ? 'center' : 'stretch' }}>
          {!col && <span style={navStyles.nomeUsuario}>{usuario.nome.split(' ')[0]}</span>}
          <button onClick={logout} title="Sair" style={navStyles.btnLogout}>{col ? '⎋' : 'Sair'}</button>
        </div>
      </nav>
      ); })()}
      <main style={{ flex: 1, minWidth: 0, paddingTop: isMobile ? 52 : 0 }}><Pagina /></main>
      <AvaliacoesPendentesGate />
    </div>
  );
}

function AvaliacoesPendentesGate() {
  const { API } = useAuth();
  const [lista, setLista] = useState([]);
  const [nota, setNota] = useState(0);
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const carregar = () => API.get('/tarefas/avaliacoes-pendentes').then(r => setLista(r.data.pendentes || [])).catch(() => {});
  useEffect(() => { carregar(); const t = setInterval(carregar, 60000); return () => clearInterval(t); }, []); // eslint-disable-line

  if (!lista.length) return null;
  const atual = lista[0];
  async function enviar() {
    if (!nota) { setMsg('Dê uma nota de 1 a 5.'); return; }
    setEnviando(true); setMsg('');
    try { await API.post(`/tarefas/${atual.id}/avaliar-atendimento`, { nota }); setNota(0); await carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro ao avaliar.'); }
    setEnviando(false);
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '1.5rem', maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>⭐</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Avalie antes de continuar</div>
        <div style={{ fontSize: 13, color: '#666', margin: '8px 0 4px' }}>A tarefa <strong>"{atual.titulo}"</strong> foi concluída por <strong>{atual.outro_nome}</strong>. Avalie o atendimento para liberar o sistema.</div>
        {lista.length > 1 && <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>Faltam {lista.length} avaliação(ões).</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '12px 0' }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setNota(n)} style={{ width: 44, height: 44, borderRadius: 10, border: '1px solid #ddd', cursor: 'pointer', fontSize: 18, background: nota >= n ? '#FAEEDA' : '#fff', color: nota >= n ? '#854F0B' : '#bbb' }}>★</button>
          ))}
        </div>
        {msg && <div style={{ fontSize: 12, color: '#993C1D', marginBottom: 8 }}>{msg}</div>}
        <button onClick={enviar} disabled={enviando} style={{ background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: enviando ? 0.6 : 1 }}>
          {enviando ? 'enviando…' : 'Enviar avaliação'}
        </button>
      </div>
    </div>
  );
}

function TrocarSenha({ onConcluido }) {
  const { trocarSenha } = useAuth();
  const [form, setForm] = useState({ atual: '', nova: '', confirmar: '' });
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  async function handleSubmit(e) {
    e.preventDefault(); setErro('');
    if (form.nova.length < 8) { setErro('Nova senha deve ter ao menos 8 caracteres.'); return; }
    if (form.nova !== form.confirmar) { setErro('Senhas não conferem.'); return; }
    setCarregando(true);
    try { await trocarSenha(form.atual, form.nova); onConcluido(); }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao trocar senha.'); }
    finally { setCarregando(false); }
  }
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '2rem 1.5rem', maxWidth: 400, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔐</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Primeiro acesso</div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Crie sua senha pessoal para continuar</div>
        </div>
        <form onSubmit={handleSubmit}>
          {erro && <div style={{ background: '#FCEBEB', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: '#993C1D' }}>{erro}</div>}
          {[
            { key: 'atual', label: 'Senha provisória (recebida por e-mail)' },
            { key: 'nova', label: 'Nova senha (mín. 8 caracteres)' },
            { key: 'confirmar', label: 'Confirmar nova senha' },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>{f.label}</label>
              <input type="password"
                style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: '1px solid #ddd', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }}
                value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} required />
            </div>
          ))}
          <button type="submit"
            style={{ width: '100%', padding: 10, background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: carregando ? 0.7 : 1 }}
            disabled={carregando}>{carregando ? 'Salvando...' : 'Salvar e entrar'}</button>
        </form>
      </div>
    </div>
  );
}

const navStyles = {
  nav: { background: '#14201c', color: '#fff', padding: '0.75rem 0.5rem', display: 'flex', flexDirection: 'column', width: 196, flexShrink: 0, height: '100vh', position: 'sticky', top: 0, overflowY: 'auto', gap: 6, fontFamily: "'Archivo', system-ui, sans-serif" },
  marca: { fontSize: 16, fontWeight: 700, padding: '4px 8px 10px' },
  menu: { display: 'flex', flexDirection: 'column', gap: 8, flex: 1 },
  grupo: { display: 'flex', flexDirection: 'column', gap: 1 },
  grupoLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, color: 'rgba(255,255,255,0.35)', padding: '2px 8px' },
  camadaLabel: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.5)', padding: '9px 8px 1px', marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.09)' },
  sub: { display: 'flex', flexDirection: 'column', gap: 1, marginLeft: 9, paddingLeft: 6, borderLeft: '1px solid rgba(255,255,255,0.13)' },
  subLabel: { fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.4, color: 'rgba(255,255,255,0.3)', padding: '3px 8px 1px' },
  btn: { fontSize: 13, padding: '7px 10px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', borderRadius: 6, textAlign: 'left', width: '100%' },
  btnAtivo: { background: '#0d6b5e', color: '#fff' },
  // --- Desktop recolhido (rail só com ícones) ---
  navCol: { width: 56, padding: '0.75rem 0.25rem', alignItems: 'center' },
  btnCol: { textAlign: 'center', padding: '9px 0', fontSize: 18 },
  colBtn: { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '3px 7px' },
  usuario: { display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.12)' },
  nomeUsuario: { fontSize: 13, color: '#fff', padding: '0 8px' },
  btnLogout: { fontSize: 12, padding: '6px 10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: '#fff', cursor: 'pointer' },
  // --- Mobile ---
  topbar: { position: 'fixed', top: 0, left: 0, right: 0, height: 52, background: '#14201c', color: '#fff', display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', zIndex: 1500, boxShadow: '0 1px 6px rgba(0,0,0,0.2)' },
  hamburger: { background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: 4 },
  marcaMobile: { fontSize: 16, fontWeight: 700, flex: 1 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1600 },
  navMobile: { position: 'fixed', top: 0, left: 0, height: '100vh', width: 240, transform: 'translateX(-100%)', transition: 'transform 0.2s ease', zIndex: 1700 },
  navMobileOpen: { transform: 'translateX(0)' },
};

// 🔔 Central de notificações
function NotificationBell({ escuro }) {
  const { API } = useAuth();
  const [d, setD] = useState({ total: 0, itens: [] });
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    const carregar = () => API.get('/avisos').then(r => setD(r.data)).catch(() => {});
    carregar();
    const t = setInterval(carregar, 60000);
    const onVis = () => { if (document.visibilityState === 'visible') carregar(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [API]);
  const ir = destino => { setAberto(false); window.dispatchEvent(new CustomEvent('mutti-nav', { detail: destino })); };
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button onClick={() => setAberto(v => !v)} title="Avisos" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, position: 'relative', lineHeight: 1, padding: 2 }}>
        🔔
        {d.total > 0 && <span style={{ position: 'absolute', top: -3, right: -5, background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '0 5px', minWidth: 15, textAlign: 'center' }}>{d.total > 99 ? '99+' : d.total}</span>}
      </button>
      {aberto && (<>
        <div onClick={() => setAberto(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
        <div style={{ position: 'absolute', right: 0, top: 30, width: 288, background: '#fff', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,.18)', zIndex: 100, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #eee', fontWeight: 700, fontSize: 13, color: '#333' }}>🔔 Avisos</div>
          {d.itens.length === 0 && <div style={{ padding: 18, fontSize: 12.5, color: '#999', textAlign: 'center' }}>Tudo em dia! 🎉</div>}
          {d.itens.filter(it => it.tipo !== 'atrasadas').concat(d.itens.filter(it => it.tipo === 'atrasadas')).map((it, i) => (
            <button key={i} onClick={() => ir(it.destino)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #f4f4f4', padding: '10px 14px', cursor: 'pointer' }}>
              <span style={{ fontSize: 18 }}>{it.icone}</span>
              <span style={{ flex: 1, fontSize: 12.5, color: it.urgente ? '#993C1D' : '#333', fontWeight: it.urgente ? 700 : 500 }}>{it.titulo}</span>
              <span style={{ fontSize: 12, fontWeight: 700, background: it.urgente ? '#FCEBE6' : '#EAF3FB', color: it.urgente ? '#993C1D' : '#185FA5', borderRadius: 10, padding: '1px 8px' }}>{it.count}</span>
            </button>
          ))}
        </div>
      </>)}
    </div>
  );
}

export default function App() {
  // Páginas públicas de avaliação (QR do cliente) — não passam pelo login.
  if (window.location.pathname.startsWith('/avaliar-vendedor')) return <AvaliarVendedor />;
  if (window.location.pathname.startsWith('/avaliar-atendimento')) return <AvaliarAtendimento />;
  if (window.location.pathname.startsWith('/avaliar')) return <AvaliarLoja />;
  if (window.location.pathname.startsWith('/assinar-termo')) return <AssinarTermo />;
  if (window.location.pathname.startsWith('/autocadastro')) return <AutoCadastro />;
  if (window.location.pathname.startsWith('/pesquisa-desligamento')) return <PesquisaDesligamento />;
  return (<AuthProvider><AppInner /></AuthProvider>);
}
