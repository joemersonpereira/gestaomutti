// lib/pilaresSeed.js — SEMENTE pura (sem dependência de banco) dos pilares/indicadores do Gerente.
// Usada pelo setup.js (para popular as tabelas) e pelo lib/pilares.js (fallback).
const DEFAULT_PILARES = [
  { id: 'resultado', nome: 'Resultado', cor: '#185FA5', peso: 30, indicadores: [
    { id: 'meta_vendas', nome: 'Meta de vendas atingida', min: 90, fonte: 'live', acao: 'Meta não atingida — elaborar plano de ação com a equipe de vendas.' },
    { id: 'metas_equipe', nome: 'Metas da equipe (90% batem)', min: 90, fonte: 'live', acao: 'Menos de 90% da equipe bateu a meta — acompanhar individualmente.' },
    { id: 'vitaminas', nome: 'Vitaminas vendidas', min: 80, fonte: 'live', acao: null },
    { id: 'pbm', nome: 'PBM — identificação', min: 75, fonte: 'live', acao: null },
    { id: 'pdvplus', nome: 'Pdv+ (conversão)', min: 80, fonte: 'live', acao: 'Conversão de sugestões PDV+ baixa — treinar a equipe no oferecimento.' },
    { id: 'encomendas', nome: 'Encomendas (<5 pendentes)', min: 80, fonte: 'live', acao: 'Encomendas pendentes — contatar clientes.' },
    { id: 'campanhas_cumpridas', nome: 'Campanhas', min: 80, fonte: 'live', acao: null },
  ] },
  { id: 'performance', nome: 'Performance', cor: '#3B6D11', peso: 30, indicadores: [
    { id: 'auditoria', nome: 'Auditoria supervisor (≥95%)', min: 95, fonte: 'live', acao: 'Auditoria abaixo de 95% — revisar itens reprovados.' },
    { id: 'nps', nome: 'Pesquisa de satisfação (≥85)', min: 85, fonte: 'live', acao: 'Satisfação abaixo do mínimo — revisar atendimento e organização da loja.' },
    { id: 'checklist', nome: 'Checklist diário (≥95%)', min: 95, fonte: 'live', acao: 'Checklist abaixo do mínimo — verificar itens recorrentes.' },
    { id: 'tarefas_prazo', nome: 'Tarefas no prazo', min: 80, fonte: 'live', acao: 'Tarefas atrasadas — priorizar pendências.' },
  ] },
  { id: 'qualidade', nome: 'Qualidade', cor: '#856404', peso: 25, indicadores: [
    { id: 'ocorrencias_rh', nome: 'Ocorrências RH zeradas', min: 80, fonte: 'live', acao: 'Ocorrências pendentes — acompanhar resolução.' },
    { id: 'conferencia', nome: 'Conferência mercadorias (≥90%)', min: 90, fonte: 'live', acao: null },
    { id: 'caixa', nome: 'Caixa Destaque', min: 85, fonte: 'live', acao: null },
    { id: 'acoes_loja', nome: 'Ações de loja cumpridas', min: 80, fonte: 'live', acao: null },
    { id: 'campanhas_ciencia', nome: 'Campanhas com ciência', min: 90, fonte: 'live', acao: null },
  ] },
  { id: 'organizacao', nome: 'Organização', cor: '#3C3489', peso: 15, indicadores: [
    { id: 'limpeza', nome: 'Limpeza mensal (≥90)', min: 90, fonte: 'live', acao: 'Limpeza abaixo do mínimo — verificar itens pendentes.' },
    { id: 'disciplina', nome: 'Disciplina operacional', min: 80, fonte: 'live', acao: 'Colaborador com 3+ faltas de reposição no mês — premiação base do gerente cai para 3%.' },
  ] },
];

module.exports = { DEFAULT_PILARES };
