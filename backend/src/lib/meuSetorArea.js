// meuSetorArea.js — Meu Setor por ÁREA (Online e Suporte Loja), Joe 2026-11-13/14. Mesmo padrão do Meu
// Setor de Compras/Caixas: pilares com indicadores, meta/peso/direção/TOLERÂNCIA CADASTRÁVEIS (a tolerância
// é a "faixa de valor" — a banda do amarelo em torno da meta → farol verde/amarelo/vermelho), apuração
// automática do realizado (das telas que já existem), nota por pilar + geral, e PREMIAÇÃO igual caixas:
// teto de R$ por pilar (nota 100 = teto) + bônus % na superação + pessoas vinculadas por fator.
const db = require('../db/connection');
const { atendimentoOnline } = require('./atendimentoOnlineLib');
const sup = require('./suporteLojaErp');
const api = require('./botvendasApi');
const { erpQuery, habilitado } = require('../db/erp');
const { unisEmpresa } = require('./escopoCompras');
const { faturamento } = require('./faturamentoErp');
const hd = require('./hoptodeskLib');
const { transferenciasPendentes } = require('./comprasErp');
const finErp = require('./financeiroErp');

const CATALOGO = {
  online: [
    { chave: 'tempo_resposta', nome: 'Tempo de 1ª resposta (min)', pilar: 'Atendimento', peso: 10, meta: 5, tol: 5, direcao: 'menor', unidade: 'min', desc: 'Quanto a loja demora pra dar a 1ª resposta ao cliente no WhatsApp. Meta: ≤ 5 min.', calc: 'Média, em minutos, do tempo entre a 1ª mensagem do cliente e a 1ª resposta do atendente.', acesso: 'Tela Online → Atendimento online (BotVendas).', mercado: 'Quanto mais rápido, maior a conversão; ideal responder em poucos minutos.' },
    { chave: 'tempo_atendimento', nome: 'Tempo de atendimento/conversa (min)', pilar: 'Atendimento', peso: 10, meta: 15, tol: 10, direcao: 'menor', unidade: 'min', desc: 'Duração média da conversa até finalizar. Meta: ≤ 15 min.', calc: 'Média, em minutos, do tempo total de atendimento (abertura → fechamento).', acesso: 'Tela Online → Atendimento online (BotVendas).', mercado: 'Atendimento ágil sem perder qualidade; varia pelo tipo de pedido.' },
    { chave: 'avaliacao', nome: 'Média de avaliação (CSAT)', pilar: 'Satisfação', peso: 10, meta: 4.5, tol: 0.5, direcao: 'maior', unidade: 'nota', desc: 'Nota que o cliente dá ao atendimento (1 a 5). Meta: ≥ 4,5.', calc: 'Média das notas 1-5 que os clientes deram na pesquisa de satisfação do BotVendas.', acesso: 'Tela Online → Média de avaliação. Avaliações ≤ 3 (de 3 a 0) precisam de justificativa.', mercado: 'Bom quando ≥ 4,5 de 5.' },
    { chave: 'conversao', nome: 'Taxa de conversão (%)', pilar: 'Conversão', peso: 10, meta: 40, tol: 15, direcao: 'maior', unidade: '%', desc: 'Dos atendimentos, % que virou venda. Meta: ≥ 40%.', calc: '% = atendimentos que fecharam venda ÷ total de atendimentos (relatório do BotVendas).', acesso: 'Tela Online → Taxa de conversão (ao vivo do relatório).', mercado: 'Depende do canal; acompanhar a evolução mês a mês.' },
    { chave: 'perdidas', nome: 'Vendas perdidas (qtd)', pilar: 'Conversão', peso: 10, meta: null, tol: 10, direcao: 'menor', unidade: 'qtd', desc: 'Atendimentos que NÃO viraram venda. Meta: abaixo do teto (cadastre).', calc: 'Atendimentos sem venda no período (total de atendimentos − vendas).', acesso: 'Tela Online → Vendas perdidas.', mercado: 'Quanto menor, melhor; analisar os motivos.' },
    { chave: 'venda', nome: 'Venda via bot (R$)', pilar: 'Venda', peso: 10, meta: null, tol: 0, direcao: 'maior', unidade: 'R$', desc: 'Valor vendido via WhatsApp/bot no período. Meta: ≥ alvo (cadastre).', calc: 'Soma do valor dos pedidos fechados como vendido (relatório do BotVendas).', acesso: 'Tela Online → Venda via bot / Por vendedor.', mercado: 'Acompanhar junto do ticket e da conversão.' },
    { chave: 'ticket', nome: 'Ticket médio (R$)', pilar: 'Venda', peso: 10, meta: null, tol: 0, direcao: 'maior', unidade: 'R$', desc: 'Valor médio por venda no bot. Meta: ≥ alvo (cadastre).', calc: 'Venda total ÷ nº de vendas fechadas.', acesso: 'Tela Online → Ticket médio.', mercado: 'Melhorar com cross-sell/combos.' },
  ],
  suporte: [
    { chave: 'recepcao_junto', nome: 'Recepção feita junto da conferência (%)', pilar: 'Recebimento', peso: 10, meta: 20, tol: 15, direcao: 'menor', unidade: '%', desc: '% dos recebimentos em que a recepção foi registrada junto com a conferência (não na chegada). Meta: ≤ 20%.', calc: '% = recebimentos com gap recepção→conferência < 15 min ÷ total de recebimentos concluídos.', acesso: 'Suporte Loja → Sem recepção de transporte → seção "recepção junto da conferência".', mercado: 'O correto é registrar a recepção na CHEGADA e conferir depois.' },
    { chave: 'transferencias_finalizar', nome: 'Transferências a finalizar (qtd)', pilar: 'Recebimento', peso: 10, meta: 0, tol: 5, direcao: 'menor', unidade: 'qtd', desc: 'Transferências (execução) ainda não finalizadas na loja (Aberta/Em separação/Em trânsito). Meta: zerar — a loja precisa finalizar.', calc: 'Contagem de transferências pendentes de execução (tabela transferencia, status A/S/E) da loja.', acesso: 'Suporte Loja → aba Transferências.', mercado: 'Transferência parada = mercadoria sem giro; finalizar rápido.' },
    { chave: 'sem_recepcao', nome: 'Entradas sem recepção (qtd)', pilar: 'Conferência', peso: 10, meta: null, tol: 5, direcao: 'menor', unidade: 'qtd', desc: 'NFs que deram entrada sem a recepção de transporte registrada. Meta: abaixo do teto (cadastre).', calc: 'Contagem de NFs de entrada sem recebimento físico vinculado (fora transferência e "sistema").', acesso: 'Suporte Loja → Sem recepção de transporte.', mercado: 'Quanto menor, melhor (processo correto).' },
    { chave: 'erros_entrada', nome: 'Erros de entrada (qtd)', pilar: 'Conferência', peso: 10, meta: null, tol: 5, direcao: 'menor', unidade: 'qtd', desc: 'Itens em que a quantidade bipada ≠ a quantidade do XML. Meta: abaixo do teto (cadastre).', calc: 'Contagem de itens com quantidade conferida diferente da quantidade original do XML/NF.', acesso: 'Suporte Loja → Erros de entrada.', mercado: 'Quanto menor, melhor; indica atenção na conferência.' },
    { chave: 'acuracidade', nome: 'Acuracidade de estoque (%)', pilar: 'Acuracidade', peso: 10, meta: 95, tol: 5, direcao: 'maior', unidade: '%', desc: 'Contagem física × sistema. Meta: ≥ 95%.', calc: '% = SKUs que bateram ÷ SKUs contados (padrão IRA).', acesso: 'Suporte Loja → Acuracidade.', mercado: '≥95% bom · 90-95% atenção · <90% ruim.' },
    { chave: 'xml_nao_lancado', nome: 'XMLs não lançados (qtd)', pilar: 'Fiscal', peso: 10, meta: null, tol: 5, direcao: 'menor', unidade: 'qtd', desc: 'NFe na SEFAZ não lançadas no ERP. Meta: abaixo do teto (cadastre).', calc: 'Contagem de XMLs recebidos da SEFAZ sem entrada no ERP.', acesso: 'Suporte Loja → XMLs não lançados.', mercado: 'Risco fiscal; quanto menor, melhor.' },
    { chave: 'sped_prazo', nome: 'SPED emitido no prazo (%)', pilar: 'Fiscal', peso: 10, meta: 100, tol: 10, direcao: 'maior', unidade: '%', desc: 'Arquivos do SPED da contabilidade emitidos até o DIA 5 do mês seguinte à competência. Meta: 100%.', calc: '% = arquivos SPED com upload até o dia 5 do mês seguinte ÷ total de arquivos no período.', acesso: 'Menu Suporte → Fiscal → repositório SPED.', mercado: 'Prazo legal — emitir sempre dentro do prazo (dia 5).' },
    { chave: 'sped_erros', nome: 'Erros no SPED (qtd)', pilar: 'Fiscal', peso: 10, meta: null, tol: 2, direcao: 'menor', unidade: 'qtd', desc: 'Erros de SPED identificados e ainda em aberto. Meta: o menor número possível (cadastre o teto, tende a zero).', calc: 'Contagem de erros de SPED com status em aberto no período.', acesso: 'Menu Suporte → Fiscal → erros de SPED (conciliação).', mercado: 'Quanto menos erros, melhor; ideal zerar.' },
    { chave: 'tempo_entrada', nome: 'Tempo de entrada (dias)', pilar: 'Entrega', peso: 10, meta: 3, tol: 3, direcao: 'menor', unidade: 'dias', desc: 'Dias entre a emissão da NF e a entrada no ERP. Meta: ≤ 3 dias.', calc: 'Média de dias entre emissão da NF (fornecedor) e a entrada no ERP.', acesso: 'Suporte Loja → Tempo de entrada.', mercado: 'Quanto mais rápido, melhor o giro e a disponibilidade.' },
    { chave: 'chamados_conclusao', nome: 'Conclusão de chamados (%)', pilar: 'Entrega', peso: 10, meta: 90, tol: 15, direcao: 'maior', unidade: '%', desc: 'Dos chamados do HopToDesk abertos no período, % que foi resolvido/fechado. Meta: ≥ 90%.', calc: '% = chamados resolvidos ou fechados ÷ total de chamados no período (HopToDesk).', acesso: 'Suporte Loja → aba Chamados.', mercado: 'Quanto mais chamados concluídos, melhor o atendimento ao time.' },
    { chave: 'chamados_abertos', nome: 'Chamados em aberto (fila)', pilar: 'Entrega', peso: 10, meta: 0, tol: 5, direcao: 'menor', unidade: 'qtd', desc: 'Chamados do HopToDesk ainda em aberto (fila atual). Meta: o menor número possível.', calc: 'Contagem de chamados com status aberto/em andamento/aguardando (fila atual).', acesso: 'Suporte Loja → aba Chamados.', mercado: 'Fila baixa = suporte em dia.' },
  ],
  marketing: [
    { chave: 'acoes_programadas', nome: 'Ações programadas (qtd)', pilar: 'Planejamento', peso: 10, meta: null, tol: 0, direcao: 'maior', unidade: 'qtd', desc: 'Ações/eventos/postagens programadas no período. Meta: ritmo de planejamento (cadastre o alvo).', calc: 'Contagem de ações do calendário com data no período.', acesso: 'Marketing → Calendário/Lista.', mercado: 'Marketing ativo planeja com antecedência.' },
    { chave: 'material_no_prazo', nome: 'Material no prazo (%)', pilar: 'Produção', peso: 10, meta: 90, tol: 10, direcao: 'maior', unidade: '%', desc: 'Dos materiais concluídos, % entregue ATÉ o prazo. Meta: ≥ 90%. (Sua dor: material atrasa.)', calc: '% = materiais entregues/veiculados com data de entrega ≤ prazo ÷ materiais concluídos (prazo no período).', acesso: 'Marketing → 📦 Materiais.', mercado: 'Material no prazo = loja organiza a tempo.' },
    { chave: 'material_atrasado', nome: 'Materiais atrasados (qtd)', pilar: 'Produção', peso: 10, meta: 0, tol: 2, direcao: 'menor', unidade: 'qtd', desc: 'Materiais com prazo vencido e ainda não entregues. Meta: 0.', calc: 'Contagem de materiais não entregues com prazo < hoje (prazo no período).', acesso: 'Marketing → 📦 Materiais (filtro Atrasados).', mercado: 'Zero atraso é o alvo.' },
    { chave: 'comprovacao_pct', nome: 'Comprovação da execução (%)', pilar: 'Execução', peso: 10, meta: 80, tol: 15, direcao: 'maior', unidade: '%', desc: 'Dos materiais, % com comprovação (evidência) anexada. Meta: ≥ 80%.', calc: '% = materiais com anexo de comprovação ÷ total de materiais (prazo no período).', acesso: 'Marketing → 📦 Materiais (coluna Comprovação).', mercado: 'Comprovar a execução dá rastreabilidade da ação.' },
    { chave: 'seguidores_instagram', nome: 'Seguidores no Instagram', pilar: 'Execução', peso: 10, meta: null, tol: 0, direcao: 'maior', unidade: 'qtd', ativoPadrao: false, desc: 'Seguidores da conta do Instagram (último dado). Meta: crescer (cadastre o alvo). Precisa conectar a conta.', calc: 'Último snapshot de seguidores da Graph API da Meta (Marketing → Redes sociais).', acesso: 'Marketing → 📱 Redes sociais (conectar Instagram).', mercado: 'Base de audiência que a marca alcança organicamente.' },
    { chave: 'caderno_no_prazo', nome: 'Caderno do comprador no prazo (%)', pilar: 'Ofertas', peso: 10, meta: 90, tol: 15, direcao: 'maior', unidade: '%', desc: 'Das ações com caderno de oferta pedido ao comprador, % respondido no prazo. Meta: ≥ 90%.', calc: '% = cadernos respondidos dentro do prazo ÷ cadernos respondidos (prazo no período).', acesso: 'Marketing → ação com comprador vinculado.', mercado: 'Caderno liberado a tempo = card produzido a tempo.' },
    { chave: 'custo_acao', nome: 'Custo das ações (R$)', pilar: 'Orçamento', peso: 10, meta: null, tol: 0, direcao: 'menor', unidade: 'R$', desc: 'Custo total das ações (verba + tráfego pago + tempo da equipe). Meta: abaixo do teto (cadastre).', calc: 'Soma dos gastos itemizados lançados nas ações do período (mkt_gasto).', acesso: 'Marketing → ação → seção 💸 Gastos.', mercado: 'Validar o custo da ação × retorno (sell-out).' },
  ],
  gerencial: [
    // Resultado líquido e CMV saíram das metas do Financeiro (Joe 2026-11-15) — ficam na Eficiência de loja.
    // Despesa sobre receita FICA (Joe pediu p/ manter).
    { chave: 'despesas_receita', nome: 'Despesas sobre receita (%)', pilar: 'Despesas', peso: 10, meta: 30, tol: 5, direcao: 'menor', unidade: '%', desc: 'Despesas operacionais sobre a receita bruta. Meta: ≤ 30%.', calc: 'Despesas operacionais (sem CMV) ÷ receita bruta do mês × 100.', acesso: 'Financeiro → DRE / Fluxo de caixa (Despesas).', mercado: 'Controlar as despesas é o que preserva o lucro.' },
    { chave: 'lanc_sem_plano', nome: 'Lançamentos sem plano de contas (qtd)', pilar: 'Lançamentos', peso: 10, meta: 0, tol: 5, direcao: 'menor', unidade: 'qtd', desc: 'Lançamentos financeiros no ERP sem plano de contas definido. Meta: 0 (tudo classificado).', calc: 'Contagem de lançamentos (contas a pagar) sem plano de contas no período.', acesso: 'Financeiro → 🧾 Lançamentos sem plano.', mercado: 'Sem classificação não dá pra analisar despesa; corrigir sempre.' },
    { chave: 'lanc_retroativo', nome: 'Lançamentos retroativos (qtd)', pilar: 'Lançamentos', peso: 10, meta: 0, tol: 5, direcao: 'menor', unidade: 'qtd', desc: 'Lançamentos com data retroativa além do limite configurado, sem motivo. Meta: 0.', calc: 'Contagem de lançamentos cuja data é anterior ao lançamento em mais de X dias (configurável).', acesso: 'Financeiro / Painel da Gestão → retroativos.', mercado: 'Retroativo distorce o fechamento; precisa de justificativa.' },
    { chave: 'titulos_aberto', nome: 'Títulos a pagar em aberto (qtd)', pilar: 'Contas a pagar', peso: 10, meta: 0, tol: 10, direcao: 'menor', unidade: 'qtd', desc: 'Títulos vencidos ainda em aberto (sem baixa). Meta: o menor possível — correr atrás do que é.', calc: 'Contagem de títulos de contas a pagar vencidos e não baixados.', acesso: 'Financeiro → 💳 Baixa de contas a pagar.', mercado: 'Título parado sem baixa = risco de juros/erro; tem que resolver.' },
    { chave: 'baixa_prazo', nome: 'Baixa de títulos no prazo (%)', pilar: 'Contas a pagar', peso: 10, meta: 95, tol: 10, direcao: 'maior', unidade: '%', desc: 'Dos títulos com vencimento no período, % baixado até o vencimento. Meta: ≥ 95%.', calc: '% = títulos baixados até a data de vencimento ÷ títulos vencidos no período.', acesso: 'Financeiro → 💳 Baixa de contas a pagar.', mercado: 'Pagar/baixar em dia evita juros e mantém o caixa confiável.' },
    { chave: 'devolucoes_aberto', nome: 'Devoluções em aberto (qtd)', pilar: 'Devoluções', peso: 10, meta: 0, tol: 5, direcao: 'menor', unidade: 'qtd', desc: 'Devoluções a fornecedor ainda não concluídas (valor parado). Meta: resolver — o menor possível.', calc: 'Contagem de devoluções em aberto no ERP (Alpha 7).', acesso: 'Financeiro → ↩️ Devoluções em aberto (do ERP).', mercado: 'Devolução parada = dinheiro/crédito preso com o fornecedor.' },
    { chave: 'orcamento_aderencia', nome: 'Aderência ao orçamento (%)', pilar: 'Contas a pagar', peso: 10, meta: 100, tol: 5, direcao: 'menor', unidade: '%', desc: 'Quanto do orçamento de despesas já foi consumido no acumulado do ano. Meta: ≤ 100% (dentro do orçado).', calc: 'Despesas realizadas (YTD, do DRE) ÷ despesas orçadas (YTD, cadastro do orçamento) × 100.', acesso: 'Financeiro → 📊 Orçamento (desvio de orçamento).', mercado: 'Gastar acima do orçado corrói o resultado planejado; ficar ≤100% é cumprir o plano.' },
    { chave: 'validacoes_pendentes', nome: 'Validações financeiras pendentes (qtd)', pilar: 'Contas a pagar', peso: 10, meta: 0, tol: 3, direcao: 'menor', unidade: 'qtd', desc: 'Comprovantes anexados (Trade/Devolução…) aguardando a confirmação do Financeiro. Meta: 0 (tudo confirmado).', calc: 'Contagem de itens em fin_validacao com comprovante anexado e status ainda pendente.', acesso: 'Contabilidade → ✅ Validação financeira (painel único).', mercado: 'Comprovante parado sem confirmação trava o acerto; confirmar rápido fecha o ciclo financeiro.' },
    { chave: 'sem_nota', nome: 'Sem nota — perda fiscal (R$)', pilar: 'Contas a pagar', peso: 10, meta: 0, tol: 0, direcao: 'menor', unidade: 'R$', desc: 'Despesa paga SEM nota fiscal e SEM justificativa de "não emite" (sócio/imposto/folha). É perda de crédito/custo fiscal a resolver. Meta: R$ 0.', calc: 'Valor das despesas (contas a pagar + despesas da Tesouraria) sem NF no ERP, descontando o que tem comprovante/é de fornecedor que não emite, no mês.', acesso: 'Contabilidade → 🧾 Sem nota (perda) — mesmo cálculo do BI.', mercado: 'Comprar sem nota perde crédito de ICMS/PIS/COFINS e infla o custo real; zerar protege a margem e o fisco.' },
    { chave: 'fluxo_caixa', nome: 'Fluxo de caixa do mês (R$)', pilar: 'Contas a pagar', peso: 10, meta: 0, tol: 0, direcao: 'maior', unidade: 'R$', desc: 'Entradas menos saídas de caixa no mês (realizado até agora). Meta: ≥ R$ 0 — não terminar o mês queimando caixa.', calc: 'Receitas recebidas − despesas pagas no mês (do Fluxo de caixa do ERP, por conta corrente).', acesso: 'Financeiro → 🗺️ Planejamento → Fluxo de caixa.', mercado: 'Lucro não paga conta — caixa paga. Fluxo positivo é o oxigênio do negócio.' },
  ],
};
const PILARES = {
  online: ['Atendimento', 'Satisfação', 'Conversão', 'Venda'],
  suporte: ['Recebimento', 'Conferência', 'Acuracidade', 'Fiscal', 'Entrega'],
  marketing: ['Planejamento', 'Produção', 'Execução', 'Ofertas', 'Orçamento'],
  gerencial: ['Despesas', 'Lançamentos', 'Contas a pagar', 'Devoluções'],
};

function config(emp, area) {
  const ov = {};
  db.prepare('SELECT chave, meta, peso, direcao, tol, ativo FROM meu_setor_area_meta WHERE empresa_id=? AND area=?').all(emp, area).forEach(r => { ov[r.chave] = r; });
  return (CATALOGO[area] || []).map(c => { const o = ov[c.chave] || {};
    return { chave: c.chave, nome: c.nome, pilar: c.pilar, unidade: c.unidade, desc: c.desc, calc: c.calc, acesso: c.acesso, mercado: c.mercado,
      meta: o.meta != null ? Number(o.meta) : c.meta, peso: o.peso != null ? Number(o.peso) : (c.peso || 10),
      tol: o.tol != null ? Number(o.tol) : (c.tol != null ? c.tol : 0),
      direcao: o.direcao || c.direcao, ativo: o.ativo != null ? o.ativo !== 0 : (c.ativoPadrao !== false) };
  });
}
function setConfig(emp, area, { chave, meta, peso, direcao, tol, ativo } = {}) {
  if (!(CATALOGO[area] || []).find(c => c.chave === chave)) throw new Error('Indicador desconhecido.');
  const cur = config(emp, area).find(c => c.chave === chave);
  db.prepare(`INSERT INTO meu_setor_area_meta (empresa_id, area, chave, meta, peso, direcao, tol, ativo, atualizado_em)
    VALUES (?,?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(empresa_id, area, chave) DO UPDATE SET meta=excluded.meta, peso=excluded.peso, direcao=excluded.direcao, tol=excluded.tol, ativo=excluded.ativo, atualizado_em=excluded.atualizado_em`)
    .run(emp, area, chave, meta === '' || meta == null ? null : Number(meta), peso != null && peso !== '' ? Number(peso) : cur.peso,
      direcao || cur.direcao, tol === '' || tol == null ? (cur.tol || 0) : Number(tol), ativo === false ? 0 : 1);
  return { ok: true };
}

// ── Premiação (igual caixas): teto R$ por pilar (nota 100 = teto) + bônus % na superação ──
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
function premioPilar(emp, area) {
  try { const r = db.prepare("SELECT valor FROM meu_setor_area_config WHERE empresa_id=? AND area=? AND chave='premio_pilar_valor'").get(emp, area); const v = Number(r && r.valor); return isFinite(v) && v > 0 ? v : 100; } catch (e) { return 100; }
}
function premioBonusPct(emp, area) {
  try { const r = db.prepare("SELECT valor FROM meu_setor_area_config WHERE empresa_id=? AND area=? AND chave='premio_bonus_pct'").get(emp, area); const v = Number(r && r.valor); return isFinite(v) && v >= 0 ? v : 0.5; } catch (e) { return 0.5; }
}
function setPremio(emp, area, { valor, bonusPct } = {}) {
  const up = (chave, v) => db.prepare(`INSERT INTO meu_setor_area_config (empresa_id, area, chave, valor, atualizado_em) VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(empresa_id, area, chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em`).run(emp, area, chave, v);
  if (valor != null && isFinite(Number(valor)) && Number(valor) > 0) up('premio_pilar_valor', Number(valor));
  if (bonusPct != null && isFinite(Number(bonusPct)) && Number(bonusPct) >= 0) up('premio_bonus_pct', Number(bonusPct));
  return { ok: true, premioValor: premioPilar(emp, area), bonusPct: premioBonusPct(emp, area) };
}
// Pessoas vinculadas às FAIXAS do prêmio: cada colaborador recebe premioTotalChefe × fator (1 cheio, 0,5 metade).
function listPessoas(emp, area) {
  try {
    return db.prepare(`SELECT pp.colaborador_id, pp.fator, c.nome FROM meu_setor_area_premio_pessoa pp
      LEFT JOIN colaboradores c ON c.id = pp.colaborador_id
      WHERE pp.empresa_id=? AND pp.area=? AND pp.ativo=1 ORDER BY pp.fator DESC, c.nome`).all(emp, area);
  } catch (e) { return []; }
}
function addPessoa(emp, area, { colaborador_id, fator } = {}) {
  db.prepare(`INSERT INTO meu_setor_area_premio_pessoa (empresa_id, area, colaborador_id, fator, ativo, criado_em) VALUES (?,?,?,?,1, datetime('now'))
    ON CONFLICT(empresa_id, area, colaborador_id) DO UPDATE SET fator=excluded.fator, ativo=1`).run(emp, area, String(colaborador_id), Number(fator) || 0);
  return { ok: true };
}
function rmPessoa(emp, area, colaborador_id) {
  db.prepare('UPDATE meu_setor_area_premio_pessoa SET ativo=0 WHERE empresa_id=? AND area=? AND colaborador_id=?').run(emp, area, String(colaborador_id));
  return { ok: true };
}

function farol(meta, realizado, direcao, tol) {
  if (realizado == null || meta == null) return 'sem_dados';
  const t = Number(tol) || 0;
  if (direcao === 'maior') return realizado >= meta ? 'verde' : (realizado >= meta - t ? 'amarelo' : 'vermelho');
  return realizado <= meta ? 'verde' : (realizado <= meta + t ? 'amarelo' : 'vermelho');
}

const ymd = d => d.toISOString().slice(0, 10);
async function realizadoAuto(emp, area, { dias = 30, ini = '', fim = '', lojaId = '' } = {}) {
  if (area === 'online') {
    const at = atendimentoOnline(emp, { dias, ini, fim, lojaId });
    // VENDA e TICKET vêm do ERP (canal entrega) — o número do BotVendas é furado em janelas largas.
    let vendaTotal = null, ticket = null;
    try {
      const f = await faturamento(emp, { lojaId, dias, ini, fim, canal: 'entrega' });
      if (f && f.totais) { vendaTotal = Math.round(Number(f.totais.venda) || 0); ticket = f.totais.ticket != null ? f.totais.ticket : null; }
    } catch (e) { }
    // CONVERSÃO e VENDAS PERDIDAS seguem do BotVendas (o ERP não tem "atendimento"); toleram falha.
    let conversao = null, perdidas = null;
    try {
      const iniDate = ini || ymd(new Date(Date.now() - dias * 864e5)); const endDate = fim || ymd(new Date());
      const linhas = await api.vendasPorVendedor({ iniDate, endDate, origins: [1] }); // só WhatsApp (ver routes/faturamento.js)
      const n = v => Number(v) || 0;
      const atd = linhas.reduce((a, s) => a + n(s.attendance_count), 0), vd = linhas.reduce((a, s) => a + n(s.closed_count), 0);
      conversao = atd ? Math.round(vd / atd * 1000) / 10 : null; perdidas = atd ? Math.max(0, atd - vd) : null;
    } catch (e) { }
    return { tempo_resposta: at.respMin, tempo_atendimento: at.taMin, avaliacao: at.score != null ? at.score : at.scoreGeral,
      conversao, perdidas, venda: vendaTotal, ticket };
  }
  if (area === 'suporte') {
    const acurArg = (ini && fim) ? { lojaId, ini, fim } : { lojaId, dias: Math.max(dias, 180) };
    const [rc, esr, ee, xml, acur] = await Promise.all([
      sup.recepcaoJuntoConferencia(emp, { lojaId, dias, ini, fim }).catch(() => ({})),
      sup.entradaSemRecepcao(emp, { lojaId, dias, ini, fim }).catch(() => ({})),
      sup.errosEntrada(emp, { lojaId, dias, ini, fim }).catch(() => ({})),
      sup.nfXmlSemEntrada(emp, { lojaId, dias, ini, fim }).catch(() => ({})),
      sup.acuracidadeEstoque(emp, acurArg).catch(() => ({})),
    ]);
    let tempoEntrada = null;
    try {
      if (habilitado()) {
        const unis = unisEmpresa(emp, lojaId);
        if (unis.length) {
          const janelaSQL = (ini && fim)
            ? { c: 'datahoraentrada >= $2::timestamp AND datahoraentrada < ($3::date + interval \'1 day\')', p: [ini, fim] }
            : { c: 'datahoraentrada >= now() - ($2 || \' days\')::interval', p: [String(dias)] };
          const r = await erpQuery(`SELECT round(avg(EXTRACT(EPOCH FROM (datahoraentrada - datahoraemissao))/86400.0)::numeric,1) m
            FROM notafiscal WHERE unidadenegocioid = ANY($1::bigint[]) AND fornecedorid IS NOT NULL
              AND ${janelaSQL.c} AND datahoraemissao IS NOT NULL AND datahoraentrada >= datahoraemissao`, [unis, ...janelaSQL.p]);
          tempoEntrada = r[0] && r[0].m != null ? Number(r[0].m) : null;
        }
      }
    } catch (e) { }
    // SPED (banco do app): prazo de emissão (até dia 5 do mês seguinte) e erros em aberto.
    let spedPrazo = null, spedErros = null;
    try {
      const fl = lojaId ? ' AND loja_id=?' : '';
      // Janela: por datas (ini..fim) ou últimos N dias.
      const janSql = (ini && fim) ? "date(criado_em) BETWEEN ? AND ?" : "date(criado_em) >= date('now','localtime','-'||?||' day')";
      const janPar = (ini && fim) ? [ini, fim] : [dias];
      const pp = lojaId ? [emp, ...janPar, lojaId] : [emp, ...janPar];
      const sp = db.prepare(`SELECT count(*) total, sum(CASE WHEN date(criado_em) <= date(competencia||'-01','+1 month','+4 day') THEN 1 ELSE 0 END) ok
        FROM contabil_sped WHERE empresa_id=? AND ${janSql}${fl}`).get(...pp);
      if (sp && sp.total) spedPrazo = Math.round(sp.ok / sp.total * 1000) / 10;
      const se = db.prepare(`SELECT count(*) n FROM contabil_sped_erro WHERE empresa_id=? AND status='aberto' AND ${janSql}${fl}`).get(...pp);
      spedErros = se ? se.n : null;
    } catch (e) { }
    // Chamados do HopToDesk (banco do app): % de conclusão no período + fila atual.
    let chamadosConclusao = null, chamadosAbertos = null;
    try { const rc2 = hd.resumo({ dias }); if (rc2 && rc2.configurado) { chamadosConclusao = rc2.pctConclusao; chamadosAbertos = rc2.abertosAgora; } } catch (e) { }
    // Transferências (execução) pendentes de finalização na loja.
    let transfFinalizar = null;
    try { const unis = unisEmpresa(emp, lojaId); const tp = await transferenciasPendentes(7, unis.length ? unis : null, { empresaId: emp }); if (tp && tp.erp !== false) transfFinalizar = tp.resumo ? tp.resumo.pendentes : 0; } catch (e) { }
    return { recepcao_junto: rc.resumo ? rc.resumo.pct : null, sem_recepcao: esr.resumo ? esr.resumo.total : null,
      erros_entrada: ee.resumo ? ee.resumo.itens : null, xml_nao_lancado: xml.resumo ? xml.resumo.total : null,
      acuracidade: acur.resumo ? acur.resumo.acuracidadeMedia : null, tempo_entrada: tempoEntrada,
      sped_prazo: spedPrazo, sped_erros: spedErros, chamados_conclusao: chamadosConclusao, chamados_abertos: chamadosAbertos,
      transferencias_finalizar: transfFinalizar };
  }
  if (area === 'marketing') {
    // Tudo do app DB (mkt_material / mkt_agenda). Marketing é central (não por loja).
    const hoje = new Date();
    const de = ini || ymd(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (Number(dias) || 30)));
    const ate = fim || ymd(hoje); const hojeStr = ymd(hoje);
    const mats = db.prepare(`SELECT status, prazo, entregue_em, comprovacao FROM mkt_material WHERE empresa_id=? AND prazo>=? AND prazo<=? AND status<>'cancelado'`).all(emp, de, ate);
    const concl = mats.filter(m => ['entregue', 'veiculado'].includes(m.status));
    const noPrazo = concl.filter(m => m.prazo && m.entregue_em && String(m.entregue_em).slice(0, 10) <= m.prazo);
    const atrasados = mats.filter(m => !['entregue', 'veiculado'].includes(m.status) && m.prazo && m.prazo < hojeStr).length;
    const comComprov = mats.filter(m => m.comprovacao).length;
    const acoes = db.prepare(`SELECT status FROM mkt_agenda WHERE empresa_id=? AND data_ini>=? AND data_ini<=?`).all(emp, de, ate);
    const concluidas = acoes.filter(a => ['publicado', 'concluido', 'executado', 'veiculado'].includes(String(a.status || '').toLowerCase())).length;
    let cad = [];
    try { cad = db.prepare(`SELECT comprador_no_prazo, comprador_status FROM mkt_agenda WHERE empresa_id=? AND comprador_id IS NOT NULL AND comprador_prazo IS NOT NULL AND substr(comprador_prazo,1,10)>=? AND substr(comprador_prazo,1,10)<=?`).all(emp, de, ate); } catch (e) { }
    const respond = cad.filter(c => c.comprador_status === 'respondido');
    const cadNoPrazo = respond.filter(c => c.comprador_no_prazo === 1).length;
    let custo = 0;
    try { custo = db.prepare(`SELECT COALESCE(SUM(g.valor),0) v FROM mkt_gasto g JOIN mkt_agenda a ON a.id=g.agenda_id WHERE g.empresa_id=? AND a.data_ini>=? AND a.data_ini<=?`).get(emp, de, ate).v; } catch (e) { }
    let seguidores = null;
    try { const ig = db.prepare("SELECT seguidores FROM mkt_social_conta WHERE empresa_id=? AND rede='instagram'").get(emp); if (ig && ig.seguidores != null) seguidores = Number(ig.seguidores); } catch (e) { }
    return {
      acoes_programadas: acoes.length,
      custo_acao: Math.round(Number(custo) || 0),
      seguidores_instagram: seguidores,
      material_no_prazo: concl.length ? Math.round(noPrazo.length / concl.length * 1000) / 10 : null,
      material_atrasado: atrasados,
      comprovacao_pct: mats.length ? Math.round(comComprov / mats.length * 1000) / 10 : null,
      caderno_no_prazo: respond.length ? Math.round(cadNoPrazo / respond.length * 1000) / 10 : null,
      acoes_concluidas: concluidas, // (sem catálogo próprio ainda; disponível)
    };
  }
  if (area === 'gerencial') {
    // Resultado/Despesas/CMV vêm do DRE (ERP). Os demais (sem plano, retroativo, títulos, devoluções)
    // ainda são manuais/cadastráveis — serão ligados ao ERP numa próxima fatia.
    const base = fim ? new Date(fim + 'T00:00:00') : new Date();
    const ano = base.getFullYear(), i = base.getMonth();
    let resultado_liquido = null, despesas_receita = null, cmv_pct = null, dreData = null;
    try {
      const d = await finErp.dre(emp, { ano, lojaId: lojaId || undefined });
      dreData = d;
      if (d && d.ok !== false && Array.isArray(d.receitaBruta)) {
        const rec = d.receitaBruta[i] || 0;
        resultado_liquido = Array.isArray(d.margem) && d.margem[i] != null ? d.margem[i] : null;
        if (rec) {
          despesas_receita = Math.round(((d.despOperTotal || [])[i] || 0) / rec * 1000) / 10;
          cmv_pct = Math.round(((d.cmv || [])[i] || 0) / rec * 1000) / 10;
        }
      }
    } catch (e) { /* ERP indisponível → ficam manuais */ }
    // Contas a pagar / devoluções do ERP (Alpha 7)
    let lanc_sem_plano = null, titulos_aberto = null, baixa_prazo = null, devolucoes_aberto = null;
    if (habilitado()) {
      try {
        const unis = unisEmpresa(emp, lojaId || undefined);
        const mm = String(i + 1).padStart(2, '0');
        const de = `${ano}-${mm}-01`;
        const ateExcl = i === 11 ? `${ano + 1}-01-01` : `${ano}-${String(i + 2).padStart(2, '0')}-01`;
        const hoje = new Date().toISOString().slice(0, 10);
        const sp = (await erpQuery(`SELECT COUNT(*)::int n FROM contapagar WHERE unidadenegocioid = ANY($1::bigint[]) AND status <> 'C' AND planocontasid IS NULL AND datavencimento >= $2::date AND datavencimento < $3::date`, [unis, de, ateExcl]))[0];
        lanc_sem_plano = sp ? sp.n : null;
        const ta = (await erpQuery(`SELECT COUNT(*)::int n FROM contapagar WHERE unidadenegocioid = ANY($1::bigint[]) AND status='A' AND datavencimento < $2::date`, [unis, hoje]))[0];
        titulos_aberto = ta ? ta.n : null;
        const bp = (await erpQuery(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE pg.datahora::date <= cp.datavencimento)::int noprazo FROM contapagar cp JOIN pgtocontapagar pg ON pg.id=cp.pgtocontapagarid WHERE cp.unidadenegocioid = ANY($1::bigint[]) AND cp.status='B' AND cp.datavencimento >= $2::date AND cp.datavencimento < $3::date`, [unis, de, ateExcl]))[0];
        baixa_prazo = bp && bp.total ? Math.round(bp.noprazo / bp.total * 1000) / 10 : null;
        const dv = (await erpQuery(`SELECT COUNT(*)::int n FROM devolucaocompra WHERE unidadenegocioid = ANY($1::bigint[]) AND status NOT IN ('F','C')`, [unis]))[0];
        devolucoes_aberto = dv ? dv.n : null;
      } catch (e) { /* ERP indisponível */ }
    }
    // Aderência ao orçamento (YTD): realizado ÷ orçado das despesas × 100. ≤100% = dentro do orçamento.
    // Leve: orçado vem da tabela LOCAL; realizado reaproveita o DRE já buscado (sem recalcular o orçamento inteiro).
    let orcamento_aderencia = null;
    try {
      const mesesN = i + 1; // acumulado do ano até o mês-base
      const orcRow = lojaId
        ? db.prepare("SELECT COALESCE(SUM(valor),0) v FROM orcamento_financeiro WHERE empresa_id=? AND ano=? AND tipo='despesa' AND mes<=? AND loja_id=?").get(emp, ano, mesesN, lojaId)
        : db.prepare("SELECT COALESCE(SUM(valor),0) v FROM orcamento_financeiro WHERE empresa_id=? AND ano=? AND tipo='despesa' AND mes<=?").get(emp, ano, mesesN);
      const orcado = orcRow ? Number(orcRow.v) : 0;
      let realizado = 0;
      if (dreData && Array.isArray(dreData.despOperTotal)) for (let k = 0; k < mesesN; k++) realizado += Number(dreData.despOperTotal[k] || 0);
      orcamento_aderencia = orcado ? Math.round(realizado / orcado * 1000) / 10 : null;
    } catch (e) { /* sem orçamento */ }
    // Validações financeiras pendentes (comprovante anexado aguardando confirmação do Financeiro) — fonte local.
    let validacoes_pendentes = null;
    try {
      const vp = db.prepare("SELECT COUNT(*) n FROM fin_validacao WHERE empresa_id=? AND status='pendente' AND comprovante IS NOT NULL").get(emp);
      validacoes_pendentes = vp ? vp.n : 0;
    } catch (e) { /* tabela pode não existir nesta base */ }
    // Sem nota (perda fiscal) do mês: despesa sem NF e sem justificativa de "não emite" (reaproveita o BI da Contabilidade).
    let sem_nota = null;
    if (habilitado()) {
      try {
        const unis = unisEmpresa(emp, lojaId || undefined);
        if (unis.length) {
          const mm = String(i + 1).padStart(2, '0');
          const ultimo = new Date(ano, i + 1, 0).getDate();
          const bi = await require('../routes/contabilidade').biSemNota(emp, unis, { de: `${ano}-${mm}-01`, ate: `${ano}-${mm}-${String(ultimo).padStart(2, '0')}`, lojaQuery: lojaId || undefined });
          sem_nota = bi && bi.total ? Math.round(bi.total.sem_valor || 0) : null;
        }
      } catch (e) { /* BI indisponível */ }
    }
    // Fluxo de caixa do mês (realizado = entradas − saídas). Meta: ≥ 0 (não queimar caixa no mês).
    let fluxo_caixa = null;
    if (habilitado()) {
      try {
        const fc = await finErp.fluxoCaixa(emp, { lojaId: lojaId || undefined, granularidade: 'mes', nHist: 3, nProj: 0 });
        if (fc && fc.erp !== false && Array.isArray(fc.periodos) && Array.isArray(fc.saldo)) {
          const mm = String(i + 1).padStart(2, '0');
          const idx = fc.periodos.findIndex(p => String(p.ini || '').startsWith(`${ano}-${mm}`));
          if (idx >= 0) fluxo_caixa = Math.round(fc.saldo[idx] || 0);
        }
      } catch (e) { /* ERP indisponível */ }
    }
    return { resultado_liquido, despesas_receita, cmv_pct, orcamento_aderencia, validacoes_pendentes, sem_nota, fluxo_caixa,
      lanc_sem_plano, lanc_retroativo: null, titulos_aberto, baixa_prazo, devolucoes_aberto };
  }
  return {};
}

// Nota do pilar = média (ponderada pelo peso) do farol de cada indicador: 🟢100 / 🟡50 / 🔴0.
const notaFarol = f => f === 'verde' ? 100 : f === 'amarelo' ? 50 : f === 'vermelho' ? 0 : null;
async function apurar(emp, area, { dias = 30, ini = '', fim = '', lojaId = '' } = {}) {
  if (!PILARES[area]) return { erro: 'Área inválida.' };
  const cfg = config(emp, area).filter(c => c.ativo);
  const real = await realizadoAuto(emp, area, { dias, ini, fim, lojaId });
  const premioValor = premioPilar(emp, area);
  const bonusPct = premioBonusPct(emp, area);
  const inds = cfg.map(c => {
    const v = real[c.chave];
    const fr = farol(c.meta, v, c.direcao, c.tol);
    const hit = fr === 'sem_dados' ? null : fr === 'verde';
    return { ...c, realizado: v != null ? v : null, farol: fr, hit, semMeta: c.meta == null, semDados: v == null };
  });
  const pilares = PILARES[area].map(p => {
    const ms = inds.filter(i => i.pilar === p);
    const comp = ms.filter(i => i.farol !== 'sem_dados');
    const pesoTot = comp.reduce((a, i) => a + (i.peso || 0), 0);
    const notaPond = pesoTot ? comp.reduce((a, i) => a + notaFarol(i.farol) * (i.peso || 0), 0) / pesoTot : null;
    const nota = notaPond == null ? null : Math.round(notaPond);
    const pf = nota == null ? 'sem_dados' : nota >= 80 ? 'verde' : nota >= 50 ? 'amarelo' : 'vermelho';
    const bonus = nota === 100;
    const premio = nota == null ? 0 : r2(nota / 100 * premioValor + (bonus ? premioValor * bonusPct : 0));
    return { pilar: p, nota, farol: pf, premio, premioMax: premioValor, bonus,
      verde: ms.filter(i => i.farol === 'verde').length, de: comp.length, indicadores: ms };
  });
  const notas = pilares.map(p => p.nota).filter(x => x != null);
  const notaGeral = notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null;
  const premioTotalChefe = r2(pilares.reduce((a, p) => a + (p.premio || 0), 0));
  const premioMaxTotal = r2(premioValor * (1 + bonusPct) * PILARES[area].length);
  const pessoas = listPessoas(emp, area).map(x => ({ ...x, premioTotal: r2(premioTotalChefe * (Number(x.fator) || 0)) }));
  // Resumo (farol) + lista plana de metas, p/ o painel "Minha área" mostrar as piores.
  const metas = inds.map(i => ({ chave: i.chave, label: i.nome, pilar: i.pilar, unidade: i.unidade, meta: i.meta, realizado: i.realizado, farol: i.farol }));
  const resumo = { verde: inds.filter(i => i.farol === 'verde').length, amarelo: inds.filter(i => i.farol === 'amarelo').length,
    vermelho: inds.filter(i => i.farol === 'vermelho').length, sem: inds.filter(i => i.farol === 'sem_dados').length };
  return { ok: true, area, dias, notaGeral, pilares, premioValor, bonusPct, premioTotalChefe, premioMaxTotal, pessoas, resumo, metas };
}

module.exports = { CATALOGO, PILARES, config, setConfig, apurar,
  premioPilar, premioBonusPct, setPremio, listPessoas, addPessoa, rmPessoa };
