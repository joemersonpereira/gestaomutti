// Roda as migrações pendentes na ordem, SEM apagar dados.
// Uso (na pasta backend):  node src/db/migrar-pendentes.js
// Seguro de repetir: cada migração usa CREATE TABLE IF NOT EXISTS / ALTER protegido.
const PENDENTES = [
  './migrations/193_conc_loja_texto',
  './migrations/065_motivo_exige_termo',
  './migrations/066_empresas_terceirizadas',
  './migrations/067_tarefa_apoios',
  './migrations/068_tarefa_leitura',
  './migrations/069_erp_integracao',
  './migrations/070_premiacao_vitaminas',
  './migrations/071_indicador_pdv',
  './migrations/072_campanha_cadernos',
  './migrations/073_loja_farmacia_popular',
  './migrations/074_satisfacao_avaliacoes',
  './migrations/075_devolucoes',
  './migrations/076_colaborador_conferente',
  './migrations/077_documentos_pessoais',
  './migrations/078_satisfacao_cpf',
  './migrations/079_satisfacao_vendedor',
  './migrations/080_comunidade',
  './migrations/081_mural_ref',
  './migrations/082_mural_reacoes_institucional',
  './migrations/083_colaborador_nascimento',
  './migrations/084_mural_eventos',
  './migrations/085_mural_patrocinio',
  './migrations/086_mural_agendamento_ouvidoria',
  './migrations/087_lista_faltas',
  './migrations/088_autocadastro',
  './migrations/089_meu_rh',
  './migrations/090_meu_mercado',
  './migrations/204_ecomm_conversao',
  './migrations/205_ecomm_conversao_item',
  './migrations/206_estagio_ciclo',
  './migrations/207_estagio_pagto_ferias',
  './migrations/208_estagio_talentos',
  './migrations/209_estagio_bancarios',
  './migrations/210_estagio_modelos_doc',
  './migrations/211_estagio_documento',
  './migrations/212_estagio_mais_docs',
  './migrations/213_estagio_relatorio',
  './migrations/214_estagio_declaracao',
  './migrations/215_colaborador_estagiario',
  './migrations/216_contabil_emprestimo',
  './migrations/217_contabil_fundo_fixo',
  './migrations/218_loja_dados_contrato',
  './migrations/219_colaborador_socio',
  './migrations/220_loja_socio_assina',
  './migrations/221_candidato_tipo_vaga',
  './migrations/222_estagio_pagamento_aprovacoes',
  './migrations/223_funcao_contabilidade',
  './migrations/224_contabil_cartao_despesa',
  './migrations/225_despesa_nf_lida',
  './migrations/226_contabil_nf_contapagar',
  './migrations/227_contabil_config',
  './migrations/228_contabil_fornecedor',
  './migrations/229_contabil_nf_pasta_cache',
  './migrations/230_contabil_feriado',
  './migrations/231_drop_cartao_despesa',
  './migrations/232_loja_escritorio',
  './migrations/233_contabil_conta_sem_nf',
  './migrations/234_tesouraria_anexo',
  './migrations/235_tesouraria_arquivo_salvo',
  './migrations/236_tesouraria_plano',
  './migrations/237_estagio_compra_arquivo',
  './migrations/238_tesouraria_fiscal',
  './migrations/239_conc_repasse_banco_tratativa',
  './migrations/240_conc_taxa_contrato',
  './migrations/241_conc_banco_operadora_regra',
  './migrations/242_contabil_sped',
  './migrations/243_contabil_sped_hash',
  './migrations/244_contabil_sped_erro',
];

console.log('=== Rodando migrações pendentes (065–073) ===\n');
for (const m of PENDENTES) {
  try {
    require(m); // cada arquivo executa suas instruções ao ser carregado
  } catch (e) {
    console.error(`✗ Erro em ${m}:`, e.message);
    process.exit(1);
  }
}
console.log('\n=== Todas as migrações pendentes foram aplicadas. ===');
process.exit(0);
