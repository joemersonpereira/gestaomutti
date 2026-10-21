// 309_estagio_tce_v2.js — ajustes do TCE que vieram DEPOIS do 304 já ter rodado em produção
// (não dá pra editar o 304: ele já está anotado na schema_migracoes e não roda de novo). Aqui
// re-UPSERTa os modelos do contrato e da ciência do Guia com o texto novo:
//   • Horário do estágio agora traz {{horario}} (faixa de horas) + {{horas_dia}}/{{horas_semana}}
//     vindos da ficha (editável por estagiário: 5 ou 6h/dia). Não "cozinha" mais as horas no modelo.
//   • CLÁUSULA 9ª menciona o GUIA DO COLABORADOR DO GRUPO MUTTI (ele integra o TCE).
//   • Termo de ciência do Guia reescrito pra espelhar a última página do Guia (autorizações, LGPD,
//     MP 2.200-2/2001) e sai JUNTO do contrato na impressão — por isso NÃO entra no seletor de docs.
// Idempotente (UPSERT por chave). Edições posteriores do RH pela tela continuam valendo (roda 1x).
const db = require('../connection');
const EMP = 'empresa-mutti-001';

const up = db.prepare(`INSERT INTO estagio_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))
  ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em`);

const CORPO = `INSTITUIÇÃO DE ENSINO
Razão Social: {{escola}} (denominada Instituição de Ensino)
CNPJ: {{escola_cnpj}}    Endereço: {{escola_endereco}}
Representada por {{escola_representante}}, identificado(a) pela assinatura ao final deste documento.

UNIDADE CONCEDENTE
Razão Social: {{empresa_registro}} (denominada Concedente)
CNPJ: {{empresa_registro_cnpj}}
Endereço: {{empresa_registro_endereco}}
Endereço do Estágio: {{empresa_atuacao_endereco}}
Representante: {{socio_nome}}    CPF: {{socio_cpf}}
Supervisor do Estágio: {{supervisor_nome}}    Cargo: {{supervisor_cargo}}    E-mail: {{supervisor_email}}

ESTAGIÁRIO
Nome: {{nome}} (doravante denominado Estagiário)
Curso: {{curso}}    Série/Período: {{serie}}
RG: {{rg}}    CPF: {{cpf}}    Data de nascimento: {{nascimento}}
Endereço: {{endereco}}
Cel: {{telefone}}    E-mail: {{email}}

Vigência do estágio de: {{data_inicio}} até {{data_fim}}.
Horário do estágio: {{horario}}, totalizando {{horas_dia}} horas diárias e {{horas_semana}} horas semanais.
Apólice de Seguro / Seguradora: {{seguro}}
Bolsa Auxílio: {{valor_bolsa}}
Modalidade do Estágio: Não Obrigatório
Auxílio-transporte: {{vale_transporte}}

As partes supracitadas celebram o presente Termo de Compromisso de Estágio − TCE, que se vincula ao Convênio de Concessão de Estágio firmado com a Instituição de Ensino, nos termos da Lei 11.788/08, em conformidade com os regulamentos aplicáveis, conforme as seguintes cláusulas:

CLÁUSULA 1ª – No PLANO DE ATIVIDADES DO ESTAGIÁRIO serão registradas as atividades que serão exercidas e os conhecimentos ou habilidades que serão adquiridos pelo Estagiário (parágrafo único do art. 7º da Lei 11.788/08), incorporado neste TCE por meio da condição a seguir discriminada:
Atividades Programadas (especificar/descrever todas as atividades que serão realizadas): {{atividade}}
Parágrafo Único − Estágios com duração superior a 6 (seis) meses devem considerar atividades diferentes (novas) e/ou com maior grau de complexidade, entre um período e outro. Em caso de Termo Aditivo, as atividades indicadas devem se diferenciar das atividades já estagiadas.

CLÁUSULA 2ª − A duração do estágio tem limite de 24 meses, contado o período de eventual e futuro termo aditivo, sendo que qualquer das partes poderá denunciar o presente TCE, por escrito, com 7 (sete) dias de antecedência. O estagiário não terá vínculo empregatício com a Concedente desde que observados os requisitos do art. 3º da lei supracitada.

CLÁUSULA 3ª − O horário de estágio será definido, desde que observado o limite legal de 6 (seis) horas diárias e 30 (trinta) horas semanais, de acordo com as conveniências mútuas, ressalvadas as horas de aulas, de provas e de outros trabalhos escolares e as limitações dos meios de transporte, não conflitando com nenhum horário de atividade acadêmica.
Parágrafo Único − A jornada de estágio será reduzida em pelo menos 50% (cinquenta por cento), nos períodos comprovadamente de avaliação do estagiário.

CLÁUSULA 4ª − A Concedente designará Supervisor de Estágio, necessariamente funcionário de seu quadro de pessoal, com formação ou experiência profissional na área de conhecimento desenvolvida pelo estagiário, que deverá especificar as atividades práticas programadas e os respectivos conhecimentos decorrentes no Plano de Atividades do Estagiário.

CLÁUSULA 5ª – A Instituição de Ensino indicará Professor Orientador responsável pelo acompanhamento e avaliação das atividades do estagiário. A Empresa Concedente compromete-se a enviar à Instituição de Ensino, ao menos a cada 6 (seis) meses, Relatório das Atividades realizadas com prévio conhecimento do estagiário.

CLÁUSULA 6ª – Na hipótese de estágio obrigatório será facultativa a concessão de bolsa ou outra forma de contraprestação, e compulsória, na realização de estágio não-obrigatório, bem como do auxílio-transporte.

CLÁUSULA 7ª − O estagiário, no caso em que o estágio tiver duração igual ou superior a 1 (um) ano, fará jus a um recesso de 30 (trinta) dias, ou de forma proporcional ao tempo de estágio, a ser gozado, preferencialmente, durante suas férias escolares, sendo remunerado quando receber bolsa ou outra forma de contraprestação.

CLÁUSULA 8ª – Cabe à Empresa Concedente a contratação de seguro contra acidentes pessoais em favor do estagiário, cuja apólice deve contemplar valor de cobertura compatível com o mercado e com as atividades desenvolvidas.

CLÁUSULA 9ª – O estagiário se obriga a cumprir integralmente o Plano de Atividades do Estagiário, as normas e os regulamentos internos da Concedente e da Instituição de Ensino — inclusive o GUIA DO COLABORADOR DO GRUPO MUTTI (Código de Conduta e Regimento Interno), do qual declara ter recebido cópia e que integra este TCE para todos os fins —, respondendo por sua inobservância por perdas e danos materiais e morais, quando constatados, resultando na rescisão do presente TCE.

CLÁUSULA 10ª – O estagiário deverá informar de imediato e por escrito, à Concedente, qualquer fato que interrompa, suspenda ou cancele sua matrícula na Instituição de Ensino, bem como reconhece ser responsável por quaisquer despesas e consequências causadas pela falta desta informação.

CLÁUSULA 11ª − As partes, atentas às disposições da Lei nº 12.846/2013, declaram possuir códigos de conduta e programas de compliance que estabelecem regras para a condução e supervisão de suas atividades e para coibir a prática de infrações à referida Lei.

CLÁUSULA 12ª – As partes se comprometem a cumprir as leis de proteção de dados, especialmente a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, "LGPD"), não colocando as partes em situação de violação, seja por ação ou omissão.

CLÁUSULA 13ª – Fica eleito o foro da comarca de Entre Rios – BA para dirimir quaisquer dúvidas oriundas deste TCE que não puderem ser resolvidas diretamente pelas partes.

E, por estarem inteiramente de acordo com as cláusulas estipuladas, as partes assinam este TCE de forma eletrônica.

{{cidade_data}}


_______________________________________
CONCEDENTE — Representante da Empresa
{{socio_nome}}    CPF: {{socio_cpf}}

_______________________________________
SUPERVISOR DO ESTÁGIO
{{supervisor_nome}}    Cargo: {{supervisor_cargo}}

_______________________________________
INSTITUIÇÃO DE ENSINO
{{escola}}

_______________________________________
ESTAGIÁRIO
{{nome}}    CPF: {{cpf}}
{{assinatura_responsavel}}`;

const TITULO_INICIAL = `TCE − TERMO DE COMPROMISSO DE ESTÁGIO e Plano de Atividades do Estagiário\n\n`;
const TITULO_RENOV = `TERMO ADITIVO DE RENOVAÇÃO AO TCE − TERMO DE COMPROMISSO DE ESTÁGIO\n(Renovação / prorrogação do estágio — Plano de Atividades do novo período)\n\n`;

up.run(EMP, 'modelo_contrato_18', TITULO_INICIAL + CORPO);
up.run(EMP, 'modelo_contrato_16_17', TITULO_INICIAL + CORPO);
up.run(EMP, 'modelo_aditivo', TITULO_RENOV + CORPO);

// Termo de ciência do Guia do Colaborador — SAI JUNTO do contrato (anexado na impressão), auto-preenchido
// com o estagiário e, quando menor, com o responsável. Texto espelha a última página do Guia.
const CIENCIA_GUIA = `TERMO DE CIÊNCIA DO GUIA DO COLABORADOR

Eu, {{nome}}, CPF {{cpf}}, declaro que recebi o Guia do Colaborador do Grupo Mutti, conversei com meu líder sobre os principais pontos e tive a chance de tirar dúvidas. Entendi o conteúdo e me comprometo a cumprir.

Declaro também que li o Aviso de privacidade do colaborador e fui informado sobre como meus dados pessoais são tratados.

Assumo o compromisso de sigilo descrito na seção "O que é confidencial": não usar nem revelar informações da empresa, de clientes ou de colegas, durante e depois do meu contrato, sem autorização por escrito. Sei que, se eu descumprir, respondo pelos danos que causar, nos termos do guia e da lei.

Autorizações separadas, que posso retirar a qualquer momento (marque se concordar):
( ) Uso da minha imagem em campanhas, materiais e redes sociais do Grupo Mutti.
( ) Análise de crédito para o convênio da farmácia e de empresas do Grupo.

Sei que posso consultar o guia sempre que precisar, que devo comunicar dúvidas e possíveis violações ao meu líder ou pelo canal de denúncias, e que o descumprimento pode levar às medidas descritas no guia.

Este termo pode ser assinado eletronicamente, nos termos do art. 10, § 2º, da MP 2.200-2/2001.

{{cidade_data}}


_______________________________________
ESTAGIÁRIO
{{nome}}    CPF: {{cpf}}
{{assinatura_responsavel}}`;
up.run(EMP, 'modelo_ciencia_guia', CIENCIA_GUIA);

// lista de documentos do seletor (a ciência do Guia NÃO entra aqui — sai junto do contrato).
up.run(EMP, 'modelos_doc', JSON.stringify([
  { chave: 'modelo_contrato_18', nome: 'Contrato de Estágio — TCE (acima de 18 anos)' },
  { chave: 'modelo_contrato_16_17', nome: 'Contrato de Estágio — TCE (16 a 17 anos)' },
  { chave: 'modelo_aditivo', nome: 'Renovação — Termo Aditivo ao TCE' },
  { chave: 'modelo_recibo_pagamento', nome: 'Recibo de Pagamento (bolsa + VT)' },
  { chave: 'modelo_recibo_recesso', nome: 'Recibo de Recesso (recesso/férias)' },
  { chave: 'modelo_rescisao', nome: 'Rescisão do Termo de Compromisso' },
  { chave: 'modelo_relatorio', nome: 'Relatório de Estágio (atividades + avaliação)' },
  { chave: 'modelo_declaracao', nome: 'Declaração de Realização de Estágio' },
]));

console.log('✅ migration 309: TCE v2 (horário da ficha + Guia na cláusula 9ª + ciência do Guia reescrita)');
