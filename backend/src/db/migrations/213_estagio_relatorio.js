// 213_estagio_relatorio.js — modelo de Relatório de Estágio (plano de atividades + avaliação). Idempotente.
const db = require('../connection');
const EMP = 'empresa-mutti-001';
db.prepare(`INSERT OR IGNORE INTO estagio_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))`)
  .run(EMP, 'modelo_relatorio', `RELATÓRIO DE ESTÁGIO
(Lei nº 11.788/2008)

Estagiário(a): {{nome}}
Setor/Atividade: {{atividade}}
Supervisor de Estágio: {{supervisor}}
Início do estágio: {{data_inicio}}    Término: {{data_fim}}
Nº total de horas: {{horas}}

PLANO DE ATIVIDADES
O estagiário(a) aprenderá atividades relacionadas ao registro de entradas e saídas de mercadorias, reposição em gôndolas e atendimento ao cliente na loja e no caixa, desenvolvendo:
1. Boa comunicação, organização e técnicas de agilidade.
2. Compreensão do processo logístico, da chegada à saída do produto.
3. Raciocínio lógico e noções de unidades de medida no registro de mercadorias.
4. Boas práticas de armazenagem e identificação correta dos produtos.
5. Operações básicas e meios de pagamento no atendimento de caixa.
6. Visão da importância de cada etapa do processo.

AVALIAÇÃO (4 = Muito Bom · 3 = Bom · 2 = Regular · 1 = Insatisfatório)
( ) Adaptação à equipe e a novas tarefas
( ) Capacitação técnica
( ) Aprendizagem prática
( ) Qualidade do trabalho
( ) Assiduidade e pontualidade
( ) Relacionamento interpessoal

{{cidade_data}}

_____________________________________   Supervisor(a) de Estágio
_____________________________________   {{nome}} — Estagiário(a)
`);

db.prepare(`INSERT INTO estagio_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))
  ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em`)
  .run(EMP, 'modelos_doc', JSON.stringify([
    { chave: 'modelo_contrato_18', nome: 'Contrato de Estágio (acima de 18 anos)' },
    { chave: 'modelo_contrato_16_17', nome: 'Contrato de Estágio (16 a 17 anos)' },
    { chave: 'modelo_aditivo', nome: 'Aditivo (renovação/prorrogação)' },
    { chave: 'modelo_recibo_pagamento', nome: 'Recibo de Pagamento (bolsa + VT)' },
    { chave: 'modelo_recibo_recesso', nome: 'Recibo de Recesso (recesso/férias)' },
    { chave: 'modelo_rescisao', nome: 'Rescisão do Termo de Compromisso' },
    { chave: 'modelo_relatorio', nome: 'Relatório de Estágio (atividades + avaliação)' },
  ]));
console.log('✅ migration 213: modelo_relatorio + lista atualizada (7 modelos)');
