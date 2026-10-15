// Grupos de venda da farmácia (lista fixa)
const GRUPOS_VENDA = [
  { key: 'generico', label: 'Genérico' },
  { key: 'similar', label: 'Similar' },
  { key: 'perfumaria', label: 'Perfumaria' },
  { key: 'varejo', label: 'Varejo' },
  { key: 'conveniencia', label: 'Conveniência' },
  { key: 'propagado', label: 'Propagado' },
  { key: 'vitaminas', label: 'Vitaminas e Suplementos' },
];
const GRUPO_KEYS = GRUPOS_VENDA.map(g => g.key);
module.exports = { GRUPOS_VENDA, GRUPO_KEYS };
