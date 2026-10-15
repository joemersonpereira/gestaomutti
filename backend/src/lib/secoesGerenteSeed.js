// lib/secoesGerenteSeed.js — SEMENTE pura (sem banco) das seções do Checklist Diário do gerente.
// Usada pelo setup.js (popular tabelas) e pelo checklist.js (fallback).
const SECOES_GERENTE = [
  { secao: 'Precificação e Arrumação', peso: 30, itens: ['Atualização preço do dia', 'Pontas de Gôndola Precificadas', 'Seção de vencidos identificados', 'Seção Beleza sem buraco', 'Seção Bem estar sem buraco', 'Pontas de Gôndola Beleza Cheia', 'Paletes de ofertas Cheios', 'Cestões organizados e cheios'] },
  { secao: 'Organização', peso: 20, itens: ['Estoque arrumado', 'Copa', 'Sala de descanso', 'Sala Administrativo', 'Sala de Conferência de mercadorias', 'Área de devolução'] },
  { secao: 'Colaborador', peso: 20, itens: ['Apresentação/uniforme', 'Pontualidade da equipe', 'Postura com o cliente', 'Postura com a equipe', 'Impressão de Filipetas', 'Segunda da Cultura realizada'] },
  { secao: 'Gestão de Loja', peso: 30, itens: ['Metas acompanhadas', 'Conversa diária com colaborador', 'Encomendas em dia', 'Campanhas ativas divulgadas', 'Segurança da loja', 'Equipamentos funcionando', 'Relatórios do dia'] },
];

module.exports = { SECOES_GERENTE };
