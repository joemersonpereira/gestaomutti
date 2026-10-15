// receitas.js — o "roteiro" de cada portal: onde entrar, como chegar no relatório e como baixá-lo.
//
// Cada portal é diferente, então a receita descreve os passos em português mesmo. O robô tenta,
// nesta ordem, tudo o que a receita oferecer — e o que sobra vira instrução na tela para você
// completar. Ajustar uma receita não mexe no robô: é só editar este arquivo.
//
// Campos:
//   operadora   → nome EXATO como aparece na tela de Conciliação (define quem é quem no confronto)
//   url         → página de login / entrada do portal
//   periodo     → como o portal pede a data ('campos' = dois campos de/até, 'unico' = um campo só)
//   passos      → lista de ações após abrir a tela do relatório. Tipos aceitos:
//                 { tipo:'preencher', seletor, valor:'{DATA_INI}'|'{DATA_FIM}'|texto }
//                 { tipo:'clicar',    seletor }
//                 { tipo:'selecionar',seletor, valor }
//                 { tipo:'esperar',   seletor }  |  { tipo:'pausa', ms }
//                 { tipo:'baixar',    seletor }  ← o clique que gera o arquivo
//   loja        → id da loja no sistema, quando o arquivo não traz o CNPJ (Le Card, Nutricash...)
//                 use null quando o portal já separa por loja e o arquivo traz o CNPJ (Bracov).
//
// Os seletores abaixo estão como PLACEHOLDER — quem os preenche é o comando de mapeamento:
//   npm run gravar -- <operadora>      (loga uma vez e guarda a sessão + a tela do relatório)
// Depois me diga o que aparece na tela que eu completo os seletores certinhos.

// Os grupos/CNPJs que a mesma conta da Rede atende. O robô troca de estabelecimento e repete a
// coleta em cada um — sem isso, só sai o grupo que estiver selecionado na conta.
// (mapeados na tela em 23/08/2026; "todos desse grupo" já traz matriz + filiais)
const GRUPOS_REDE = [
  { numero: '48269786', nome: 'Grupo Mutti (matriz e filiais)' },   // Esplanada, Entre Rios 1 e 2, Rio Real
  { numero: '26100061', nome: 'Farma Rocha' },
  { numero: '15050262', nome: 'Farmácia Figueiredo (matriz e filiais)' },  // + 82721084 e 84696184
  { numero: '42619300', nome: 'Posto de Medicamentos' },
];

// Os CNPJs do seletor "Meus CNPJs" no portal da Alelo (lidos na tela em 24/08/2026).
// Farma Rocha já existe no cadastro de lojas; os três "Farmácia Rocha Figueiredo" ainda não —
// eles vão entrar como "estabelecimento sem loja" até serem cadastrados ou amarrados em Ajustes.
const CNPJS_ALELO = [
  { numero: '03.191.469/0001-43', nome: 'Farma Rocha Produtos Farmacêuticos', loja: 'loja-farmarocha' },
  // "Farmácia Figueiredo Limitada" é a razão social das lojas ULTRA (confirmado na tela: o CNPJ
  // 15.672.710/0001-35 é a Ultra Entre Rios no ERP; /0002-16 é a Ultra Esplanada).
  { numero: '15.672.710/0001-35', nome: 'Ultra Entre Rios (Farmácia Figueiredo)', loja: 'loja-ultraentrerios' },
  { numero: '15.672.710/0002-16', nome: 'Ultra Esplanada (Farmácia Figueiredo)', loja: 'loja-ultraesplanada' },
  // estes três ainda não têm loja no sistema — vão entrar como "estabelecimento sem loja"
  { numero: '08.645.213/0001-82', nome: 'Farmácia Rocha Figueiredo' },
  { numero: '08.645.213/0002-63', nome: 'Farmácia Rocha Figueiredo 2' },
  { numero: '08.645.213/0003-44', nome: 'Farmácia Rocha Figueiredo 3' },
];

const RECEITAS = {
  // REDE — recebimentos (o repasse). O download é ASSÍNCRONO: o portal gera o arquivo em segundo
  // plano ("1/3 gerando arquivos…") e só depois libera o "baixar". Por isso a receita espera o
  // link aparecer antes de clicar. O arquivo fica disponível por 12h, então dá para repetir.
  rede: {
    operadora: 'Rede',
    destino: 'repasse',                                   // vai para a conferência de repasses
    url: 'https://meu.userede.com.br/i/relatorio/recebimentos/#/',
    periodo: 'campos',
    loja: null,                                            // o arquivo traz o estabelecimento
    estabelecimentos: GRUPOS_REDE,                         // roda uma volta em cada grupo
    passos: [
      { tipo: 'periodo_rede' },                                  // chip de datas (calendário em shadow DOM)
      { tipo: 'pausa', ms: 6000 },                               // a tela recarrega os depósitos
      { tipo: 'clicar', seletor: 'role=tab[name="recebidos"]' },
      { tipo: 'pausa', ms: 1500 },
      { tipo: 'clicar', seletor: 'role=button[name="Excel"]' },
      { tipo: 'esperar', seletor: 'text=escolha a opção desejada' },
      { tipo: 'clicar', seletor: 'text=relatório detalhado' },    // é o que traz parcela a parcela
      { tipo: 'clicar', seletor: 'text=gerar arquivo para baixar' },
      // a geração é assíncrona ("1/3 gerando arquivos…") e o arquivo fica disponível por 12h
      { tipo: 'esperar', seletor: 'text=/seu arquivo está pronto|100% Completo/', ms: 300000 },
      { tipo: 'pausa', ms: 2000 },
      { tipo: 'baixar', seletor: 'text=baixar' },
    ],
    // Mapeado ao vivo no portal (23/08/2026): o calendário é um web component com shadow DOM
    // (rede-datepicker → range-datepicker-calendar#firstDatePicker/#lastDatePicker →
    // range-datepicker-cell). O Playwright atravessa shadow aberto, então os locators CSS funcionam.
    observacao: 'Período grande é aceito: 01/07 a 23/08 devolveu 992 depósitos num arquivo só.',
  },

  // REDE — vendas do dia (camada 1, o confronto com o ERP).
  // A tela de vendas exporta direto em Excel; se abrir a janela de opções, os passos opcionais
  // dão conta. O filtro de período é o chip do topo — o seletor exato sai no primeiro `--ver`.
  rede_vendas: {
    operadora: 'Rede',
    destino: 'vendas',
    url: 'https://meu.userede.com.br/i/relatorio/vendas',
    periodo: 'campos',
    loja: null,                                            // o arquivo traz CNPJ e estabelecimento
    estabelecimentos: GRUPOS_REDE,
    passos: [
      { tipo: 'periodo_rede' },
      { tipo: 'pausa', ms: 8000 },                               // a tela recarrega a lista de vendas
      { tipo: 'clicar', seletor: 'role=button[name="Excel"]' },
      { tipo: 'esperar', seletor: 'text=escolha a opção desejada' },
      // aqui "relatório detalhado" (venda a venda) JÁ VEM MARCADO; as outras duas opções do
      // menu de vendas só aceitam 15 dias e apenas crédito/débito — não servem para nós
      { tipo: 'clicar_opcional', seletor: 'text=relatório detalhado' },
      { tipo: 'clicar', seletor: 'text=gerar arquivo para baixar' },
      { tipo: 'esperar', seletor: 'text=/seu arquivo está pronto|100% Completo/', ms: 600000 },
      { tipo: 'pausa', ms: 2000 },
      { tipo: 'baixar', seletor: 'text=baixar' },
    ],
    // Mapeado ao vivo (23/08/2026): 01/07 a 23/08 = 43.620 vendas num arquivo só; a geração é
    // assíncrona e passa por "1/3 gerando arquivos" → "2/3 preparando" → "seu arquivo está pronto".
    observacao: 'Cobre Visa, Master, Elo, Amex, Diners e também Alelo, Lecard e Nutricash (passam na maquininha da Rede).',
  },

  // ALELO — extrato de VENDAS (mapeado na tela em 24/08/2026).
  // Portal: meuestabelecimento.alelo.com.br · menu Extrato → aba "Vendas".
  // Filtros: Período Exibido (de → até), Operado por, Cartões; depois FILTRAR e EXPORTAR.
  // O CNPJ fica num seletor no topo ("Meus CNPJs") — é por ele que se troca de loja.
  alelo: {
    operadora: 'Alelo',
    destino: 'vendas',
    url: 'https://meuestabelecimento.alelo.com.br/extrato',
    periodo: 'campos',
    loja: null,                                    // o CNPJ da tela identifica a loja
    estabelecimentos: CNPJS_ALELO,
    passos: [
      { tipo: 'clicar_opcional', seletor: 'text=Vendas' },
      { tipo: 'pausa', ms: 1500 },
      { tipo: 'periodo_alelo' },                   // preenche "Período Exibido"
      { tipo: 'clicar', seletor: 'text=FILTRAR' },
      { tipo: 'pausa', ms: 6000 },
      { tipo: 'baixar', seletor: 'text=EXPORTAR' },
    ],
    observacao: 'Falta o leitor do arquivo — assim que vier o primeiro export, eu escrevo o parser.',
  },

  // ALELO — recebimentos (o repasse). Mapeado na tela em 24/08/2026.
  // A tela é um CALENDÁRIO POR MÊS (setas ‹ Ago/2026 ›), cada dia mostra o previsto/recebido,
  // e há um EXPORTAR do mês inteiro. A URL leva a data no caminho: /recebimentos/DDMMAAAA.
  alelo_repasse: {
    operadora: 'Alelo',
    destino: 'repasse',
    url: 'https://meuestabelecimento.alelo.com.br/recebimentos',
    periodo: 'mes',                                // aqui é mês, não intervalo livre
    loja: null,
    estabelecimentos: CNPJS_ALELO,
    passos: [
      { tipo: 'pausa', ms: 4000 },
      { tipo: 'baixar', seletor: 'text=EXPORTAR' },
    ],
    observacao: 'Exporta o mês inteiro. Para meses anteriores, navegar com a seta ‹ antes de exportar.',
  },

  // LE CARD — portal do lojista (mesma base do Uze: ASP.NET da Algorix).
  // ⚠️ A tela de login tem CLOUDFLARE. Se o robô for barrado por lá, a saída é gravar a sessão
  // (npm run gravar) e deixá-la viva — o desafio só aparece no login, não na navegação seguinte.
  lecard: {
    operadora: 'Le Card',
    destino: 'vendas',
    url: 'https://cartao.lecard.com.br/lecard/',
    periodo: 'campos',
    loja: null,                                     // o arquivo não traz CNPJ → COLETOR_LOJA_LECARD
    passos: [],                                     // ⚠️ falta ver o menu depois do login
    observacao: 'No ERP: 08-LE CARD, ~400 títulos e R$ 18 a 22 mil por mês — é o 2º maior convênio.',
  },

  // NUTRICASH — portal do credenciado (mapeado na tela em 24/08/2026).
  // Relatórios → "Relatório Fechamento Credenciado": Credenciado (ex.: 53114 FARMACIA MUTTI),
  // Período Inicial, Período Final, Produto (obrigatório) e o formato de saída ao lado do botão.
  // O login já identifica a loja (o CNPJ aparece no topo: 18681698000202 = Mutti Entre Rios 2).
  nutricash: {
    operadora: 'Nutricash',
    destino: 'repasse',                            // é relatório de FECHAMENTO (o que foi pago)
    url: 'https://gis.nutricash.com.br/credenciado/',
    periodo: 'campos',
    loja: null,                                    // COLETOR_LOJA_NUTRICASH, se o arquivo não trouxer CNPJ
    passos: [
      { tipo: 'clicar', seletor: 'text=Credenciado' },
      { tipo: 'pausa', ms: 1200 },
      { tipo: 'clicar', seletor: 'text=Consulta fechamentos' },
      { tipo: 'esperar', seletor: 'text=Período' },
      { tipo: 'preencher', seletor: 'input[id*="periodo" i], input[name*="periodo" i]', valor: '{DATA_INI} - {DATA_FIM}' },
      { tipo: 'clicar', seletor: 'button[title*="Pesquisar" i], .fa-search' },
      { tipo: 'pausa', ms: 4000 },
      // o ícone de disquete abre o menu de exportação: Excel | CSV | PDF — sempre Excel
      { tipo: 'clicar', seletor: '.fa-save, [title*="Exportar" i]' },
      { tipo: 'esperar', seletor: 'text=Excel' },
      { tipo: 'baixar', seletor: 'text=Excel' },
    ],
    // Mapeado na tela (24/08/2026): Credenciado → Consulta fechamentos, filtro de Período,
    // e exportação em Excel/CSV/PDF. "Consulta transações" (mesmo menu) é o lado das VENDAS.
    observacao: 'Fechamento de junho: 1 resultado, R$ 60,57 líquido, pago em 28/07. Volume baixíssimo.',
  },

  // UZE / MULTI MAIS — portal do lojista (mapeado em 24/08/2026).
  // É o "07-REDE UZE/MULTI MAIS" do ERP. Login em cartao.algorix.com/redeuze;
  // o topo tem o agrupamento ("Agrupamento Fcia Mutti") e o menu Cliente | Autorização |
  // Relatórios | Alterar Senha. O que interessa está em Relatórios.
  // Menu Relatórios do Uze: Compras (as vendas) · Movimento (extrato) · Repasse (o pagamento).
  uze: {
    operadora: 'Multi Mais / Uze',
    destino: 'vendas',
    url: 'https://cartao.algorix.com/redeuze/',
    periodo: 'campos',
    loja: null,
    passos: [
      { tipo: 'clicar', seletor: 'text=Relatórios' },
      { tipo: 'pausa', ms: 1000 },
      { tipo: 'clicar', seletor: 'text=Compras' },
      { tipo: 'pausa', ms: 2500 },
      // ⚠️ falta ver os filtros e o botão de exportar da tela de Compras
    ],
    observacao: 'No ERP: 07-REDE UZE/MULTI MAIS, ~49 títulos e R$ 2.680 em 30 dias.',
  },

  uze_repasse: {
    operadora: 'Multi Mais / Uze',
    destino: 'repasse',
    url: 'https://cartao.algorix.com/redeuze/',
    periodo: 'campos',
    loja: null,
    passos: [
      { tipo: 'clicar', seletor: 'text=Relatórios' },
      { tipo: 'pausa', ms: 1000 },
      { tipo: 'clicar', seletor: 'text=Repasse' },
      { tipo: 'pausa', ms: 800 },
      // submenu: Previsão de pagamento | Pagamentos efetuados | Resumo Pagamentos
      { tipo: 'clicar', seletor: 'text=Pagamentos efetuados' },
      { tipo: 'esperar', seletor: 'text=Pagamentos Efetuados' },
      // filtros da tela (Empresa fica em "Todas Empresas", que já traz todas as lojas)
      { tipo: 'preencher', seletor: 'input[id*="PagamentoDe" i], input[name*="pagamentoDe" i]', valor: '{DATA_INI}' },
      { tipo: 'preencher', seletor: 'input[id*="PagamentoAte" i], input[name*="pagamentoAte" i]', valor: '{DATA_FIM}' },
      { tipo: 'selecionar', seletor: 'select[id*="Formato" i], select[id*="RelatorioEm" i]', valor: 'Excel' },
      { tipo: 'baixar', seletor: 'text=Gerar' },
    ],
    // Tela mapeada em 24/08/2026 (RelRepassePagamentosEfetuados.aspx). O relatório detalha, sob
    // cada crédito, as parcelas de compras que o formaram (com vencimento, valor e cartão), e o
    // cabeçalho de cada empresa traz CNPJ e a conta de depósito.
    observacao: '"Previsão de pagamento" é a agenda; "Pagamentos efetuados" é o que já caiu. Sai em PDF por padrão — trocar para Excel no campo "Relatório em".',
  },


  // BRASIL CARD — portal do lojista (mapeado na tela em 24/08/2026), integrado com "BOLT".
  // Login lojista > Relatório vendas. A MESMA tela serve para venda e para repasse: o que muda
  // é o radio VENDA / PGTO. Com "INCLUIR FILIAIS" marcado o arquivo ganha as colunas PDV e CNPJ,
  // que é o que permite ratear por loja — sempre marcar.
  brasilcard: {
    operadora: 'Brasil Card',
    destino: 'vendas',
    url: 'https://brasilcard.net/bca/lojista/relatoriovenda/index',
    periodo: 'campos',
    loja: null,                                     // o arquivo traz CNPJ por linha → loja automática
    passos: [
      { tipo: 'clicar_opcional', seletor: 'text=Login lojista' },
      { tipo: 'clicar_opcional', seletor: 'text=Relatório vendas' },
      { tipo: 'esperar', seletor: 'text=INCLUIR FILIAIS' },
      { tipo: 'marcar', seletor: 'input[type=checkbox]' },          // INCLUIR FILIAIS
      { tipo: 'clicar_opcional', seletor: 'text=VENDA' },           // radio VENDA (padrão)
      { tipo: 'preencher', seletor: 'input[type=date]:nth-of-type(1), input[name*="inicio" i]', valor: '{DATA_INI}' },
      { tipo: 'preencher', seletor: 'input[type=date]:nth-of-type(2), input[name*="fim" i]', valor: '{DATA_FIM}' },
      { tipo: 'selecionar', seletor: 'select', valor: 'Relatório de vendas analítico' },
      { tipo: 'clicar', seletor: 'text=Pesquisar' },
      { tipo: 'pausa', ms: 6000 },                                  // passa pelo Cloudflare
      { tipo: 'baixar', seletor: 'text=Exportar' },
    ],
    // Taxa lida dos dados reais de 01 a 06/08: 1x 2,99% · 2x 3,49% · 3x ou mais 3,99%.
    observacao: 'É o maior convênio (R$ 78 mil/mês). O relatório sai com 6 lojas: Mutti Rio Real, Entre Rios 1 e 2, Farma Rocha e as duas Ultra.',
  },

  brasilcard_repasse: {
    operadora: 'Brasil Card',
    destino: 'repasse',
    url: 'https://brasilcard.net/bca/lojista/relatoriovenda/index',
    periodo: 'campos',
    loja: null,
    passos: [
      { tipo: 'clicar_opcional', seletor: 'text=Login lojista' },
      { tipo: 'clicar_opcional', seletor: 'text=Relatório vendas' },
      { tipo: 'esperar', seletor: 'text=INCLUIR FILIAIS' },
      { tipo: 'marcar', seletor: 'input[type=checkbox]' },
      { tipo: 'clicar', seletor: 'text=PGTO' },                     // <- a única diferença
      { tipo: 'preencher', seletor: 'input[type=date]:nth-of-type(1), input[name*="inicio" i]', valor: '{DATA_INI}' },
      { tipo: 'preencher', seletor: 'input[type=date]:nth-of-type(2), input[name*="fim" i]', valor: '{DATA_FIM}' },
      { tipo: 'selecionar', seletor: 'select', valor: 'Relatório de vendas analítico' },
      { tipo: 'clicar', seletor: 'text=Pesquisar' },
      { tipo: 'pausa', ms: 6000 },
      { tipo: 'baixar', seletor: 'text=Exportar' },
    ],
    observacao: 'Mesma tela das vendas, com o radio em PGTO: aí a data filtra pelo PAGAMENTO, não pela venda. O sintético traz Data de Pagamento / Qtd de tickets / Valor da venda / Valor líquido.',
  },

  // MULVI PAY (BANESE CARD) — mulvipay.com.br, login por e-mail e senha, e um seletor de CNPJ
  // no topo (uma loja por vez). Mapeado na tela em 24/08/2026.
  // Minhas vendas ▸ Vendas realizadas = as vendas · Minhas vendas ▸ Meus recebimentos = o repasse.
  // Nas duas telas: aba DETALHADO, período, e dois ícones de export à direita (PDF e Excel).
  mulvi: {
    operadora: 'Banese / Mulvi',
    destino: 'vendas',
    url: 'https://mulvipay.com.br/portal/minhas-vendas/vendas-realizadas',
    periodo: 'campos',
    loja: null,                                     // não vem no arquivo → COLETOR_LOJA_MULVI ou o CNPJ do seletor
    passos: [
      { tipo: 'esperar', seletor: 'text=VENDAS REALIZADAS' },
      { tipo: 'clicar', seletor: 'text=DETALHADO' },
      { tipo: 'preencher', seletor: 'input[placeholder*="/" ], input[name*="periodo" i]', valor: '{DATA_INI} - {DATA_FIM}' },
      { tipo: 'pausa', ms: 3000 },
      { tipo: 'baixar', seletor: '[title*="Excel" i], .icon-excel, button:has(svg[data-icon="file-excel"])' },
    ],
    observacao: 'Arquivo "Movimento de Vendas do Lojista - Analítica": Data_Transacao (com hora), Nsu, Bandeira, Modalidade, Quantidade_Parcela, Cartao, Valor_Bruto, Valor_Liquido. Taxa dos dados reais: débito 1,80% · rotativo ~4,2% · parcelado ~4,70%.',
  },

  mulvi_repasse: {
    operadora: 'Banese / Mulvi',
    destino: 'repasse',
    url: 'https://mulvipay.com.br/portal/minhas-vendas/meus-recebimentos',
    periodo: 'campos',
    loja: null,
    passos: [
      { tipo: 'esperar', seletor: 'text=MEUS RECEBIMENTOS' },
      { tipo: 'clicar', seletor: 'text=DETALHADO' },
      { tipo: 'preencher', seletor: 'input[placeholder*="/" ], input[name*="periodo" i]', valor: '{DATA_INI} - {DATA_FIM}' },
      { tipo: 'pausa', ms: 3000 },
      { tipo: 'baixar', seletor: '[title*="Excel" i], .icon-excel, button:has(svg[data-icon="file-excel"])' },
    ],
    // "Movimento Financeiro Analitico": Data_Lançamento, Data_Transação, Bandeira, Tipo_Transação,
    // NSU, Parcela (4/6), ValorBruto, ValorLiquido — dá para casar venda a venda, como na Rede.
    observacao: 'Cuidado com a antecipação: o próprio portal avisa que, se houver antecipação, o valor certo está em Antecipações efetivadas.',
  },

  // BRACOV / BRASIL CONVÊNIOS — "Sistema de Gestão de Cartões (Módulo Credenciado)" da Telenet.
  // Login por Código Credenciado (ex.: 468270) + Senha de Acesso WEB.
  bracov: {
    operadora: 'Bracov',
    destino: 'vendas',
    url: 'https://www1.tln.com.br/ConsultaWeb/home/credenciado/brasilconvenios',
    periodo: 'campos',
    loja: null,                                     // o arquivo traz CNPJ → o sistema acha a loja sozinho
    passos: [
      // duas abas no topo: CARTÃO PÓS PAGO (crédito) e CARTÃO PRÉ PAGO (débito)
      { tipo: 'clicar_opcional', seletor: 'text=CARTÃO PÓS PAGO' },
      { tipo: 'clicar', seletor: 'text=Relatórios' },
      { tipo: 'pausa', ms: 1000 },
      { tipo: 'clicar', seletor: 'text=Movimento Diario Vendas' },
      { tipo: 'pausa', ms: 2500 },
      // ⚠️ falta ver os filtros e a exportação desta tela
    ],
    // ⚠️ A SESSÃO EXPIRA EM 30 MINUTOS (a tela mostra o contador). A sessão gravada vai precisar
    // ser refeita com frequência aqui — ou o robô roda logo depois de alguém entrar no portal.
    observacao: 'Vendas em Relatórios > Movimento Diario Vendas; repasse em Consultas > Movimento de lotes fechados (botão Planilha), com CNPJ por credenciado e taxa de 4% + R$ 3 por lote. No ERP: 09-BRACOV, 4 a 6 títulos e ~R$ 500/mês, o menor volume de todos.',
  },

  bracov_repasse: {
    operadora: 'Bracov',
    destino: 'repasse',
    url: 'https://www1.tln.com.br/ConsultaWeb/home/credenciado/brasilconvenios',
    periodo: 'campos',
    loja: null,                                     // a planilha traz o CNPJ de cada credenciado
    passos: [
      { tipo: 'clicar', seletor: 'text=Consultas' },
      { tipo: 'pausa', ms: 1000 },
      { tipo: 'clicar', seletor: 'text=Movimento de lotes fechados' },
      { tipo: 'pausa', ms: 2500 },
      { tipo: 'baixar', seletor: 'text=Planilha' },
    ],
    // Colunas: VALOR · QUANT · TAXA · VALTAXA · VAL_LIQ · INICIO · FIM · N_FEC · DT_FECH · DT_PGTO ·
    // CREDENCIADO · NOME_CREDENCIADO · CNPJ. Data com ano de 2 dígitos (17/08/26).
    observacao: 'Taxa 4% + R$ 3 fixos por lote. Fecha a cada 15 dias e paga ~45 dias depois. A SESSÃO EXPIRA EM 30 MINUTOS.',
  },
};

module.exports = { RECEITAS };
