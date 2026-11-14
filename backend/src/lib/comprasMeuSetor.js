// Meu Setor de Compras — premiação por PILARES (igual Tesouraria, Joe 2026-11-12).
// Indicadores alocados em pilares (até 5). Nota do pilar = Σpeso batido ÷ Σpeso ativo × 100.
// Prêmio do pilar = nota × teto/100; bater 100% paga teto + bônus (padrão +50%). Premiação do comprador = Σ pilares.
// Indicadores "auto" vêm dos libs de compras; "manual" o gestor lança o realizado no mês.
const db = require('../db/connection');
const ind = require('./indicadoresCompraErp');
const acordosLib = require('./comprasAcordos');
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;

// pilar = em qual pilar o indicador entra (configurável). fonte: 'auto' | 'manual'.
const CATALOGO = [
  { chave: 'cmv', nome: 'CMV (%)', pilar: 'Resultado', peso: 10, meta: 64, direcao: 'menor', unidade: '%', fonte: 'auto', desc: 'Custo da mercadoria vendida sobre a venda. Meta: ficar no teto (≤).', calc: 'CMV% = custo da mercadoria vendida ÷ venda, só dos produtos dos grupos do comprador, no mês.', acesso: 'Automático do ERP (produtos dos grupos do comprador). Confira em Faturamento → CMV por grupo e na aba CMV por grupo do Compras.', mercado: 'Mercado farma: ~68–72% em drogaria independente; redes eficientes 62–66%.' },
  { chave: 'orcamento', nome: 'Orçamento de compras (%)', pilar: 'Resultado', peso: 10, meta: 100, direcao: 'menor', unidade: '%', fonte: 'auto', desc: 'Uso do orçamento de compra do mês. Meta: NÃO estourar (≤ 100%).', calc: '% = (entradas por NF + pedidos ainda não recebidos) ÷ orçamento do mês (venda projetada × CMV), dos grupos do comprador. ≤100% = dentro do orçamento; >100% = estourou.', acesso: 'Automático do ERP. Base p/ conferir: Compras → Orçamento de compra (Saldo de compra do mês).', mercado: 'Ideal usar o orçamento sem estourar; folga pequena no fim do mês é saudável.' },
  { chave: 'cobertura', nome: 'Cobertura de estoque (dias)', pilar: 'Estoque', peso: 10, meta: 75, direcao: 'menor', unidade: 'dias', fonte: 'auto', desc: 'Dias de estoque (valor ÷ custo/dia). Meta: ≤ 75 dias.', calc: 'Dias = valor do estoque a custo ÷ custo médio vendido por dia (dos grupos do comprador).', acesso: 'Automático do ERP. Veja o detalhe em Compras → Análise de estoque.', mercado: 'Mercado farma trabalha ~45–60 dias; acima de 75 já pesa no caixa.' },
  { chave: 'curva_d', nome: 'Redução de curva D (R$)', pilar: 'Estoque', peso: 10, meta: null, direcao: 'menor', unidade: 'R$', fonte: 'auto', desc: 'Valor a custo parado em curva D (sem giro em 90 dias). Meta: abaixo do teto (cadastre o alvo).', calc: 'Soma, a custo, dos itens classificados em curva D (sem venda nos últimos 90 dias).', acesso: 'Automático do ERP. Veja os itens em Compras → Análise de estoque / Análise de vencidos.', mercado: 'Referência: curva D/obsoleto abaixo de ~3–5% do estoque total.' },
  { chave: 'saldo_estoque', nome: 'Saldo de estoque (R$)', pilar: 'Estoque', peso: 10, meta: null, direcao: 'menor', unidade: 'R$', fonte: 'auto', desc: 'Valor do estoque a custo. Meta: ficar no teto (cadastre o alvo).', calc: 'Soma do estoque a custo dos grupos do comprador na data.', acesso: 'Automático do ERP. Veja em Compras → Análise de estoque.', mercado: 'Varia pelo porte/mix; acompanhe junto da cobertura (dias).' },
  { chave: 'conversao_novos', nome: 'Conversão de itens novos (%)', pilar: 'Abastecimento', peso: 10, meta: 70, direcao: 'maior', unidade: '%', fonte: 'auto', desc: 'Dos produtos NOVOS que entraram (1ª NF), % que já teve venda (maturação). Meta: ≥ 70%.', calc: '% = produtos novos (1ª entrada por NF) que já tiveram ao menos uma venda ÷ total de produtos novos.', acesso: 'Automático do ERP (entradas de NF × vendas). Base p/ conferir: Compras → Análise de estoque.', mercado: 'Bom quando ~60–70% dos itens novos giram nos primeiros meses.' },
  { chave: 'ruptura', nome: 'Ruptura aceitável (%)', pilar: 'Abastecimento', peso: 10, meta: 5, direcao: 'menor', unidade: '%', fonte: 'auto', desc: 'Produtos que venderam mas estão SEM estoque. Meta: ≤ 5%.', calc: '% = produtos com venda nos últimos 30 dias que hoje estão sem estoque ÷ produtos com venda (dos grupos do comprador).', acesso: 'Automático do ERP (venda 30d × estoque atual). Base p/ conferir: Compras → Análise de estoque.', mercado: 'Mercado farma aceita ~3–5% de ruptura; abaixo de 5% é bom.' },
  { chave: 'vencido', nome: 'Vencidos (%)', pilar: 'Perdas', peso: 10, meta: 0.2, direcao: 'menor', unidade: '%', fonte: 'auto', desc: '% de vencidos sobre o estoque. Meta: ≤ 0,2%.', calc: '% = valor BAIXADO por vencimento no mês (itens de baixa ligados a pré-vencido) ÷ valor do estoque (a custo), dos grupos do comprador.', acesso: 'Automático do ERP (baixa de estoque por vencimento). Base p/ conferir: Compras → Análise de vencidos.', mercado: 'Mercado: perda por vencido abaixo de ~0,5% do estoque; bom ≤ 0,2%.' },
  { chave: 'compras_simples', nome: 'Compra do Simples Nacional (%)', pilar: 'Perdas', peso: 10, meta: 10, direcao: 'menor', unidade: '%', fonte: 'auto', desc: 'Como a Mutti é Lucro Real, comprar de fornecedor do Simples/MEI dá menos crédito tributário (custo maior). Meta: ≤ 10%. Pode ser PERDOADO se o comprador comprovar desconto compensatório.', calc: '% = valor comprado de fornecedores do Simples/MEI (líquido dos perdões) ÷ total comprado no mês, dos grupos do comprador. Regime vem do cadastro (Regime tributário).', acesso: 'Compras → Compra do Simples (lista por fornecedor, com botão Perdoar). Base do regime: aba Regime tributário.', mercado: 'Quanto menor, melhor p/ quem é Lucro Real; quando comprar, negociar desconto que cubra a tributação a mais.' },
  { chave: 'acordos', nome: 'Acordos comerciais (qtd)', pilar: 'Negociação & Conciliação', peso: 10, meta: 5, direcao: 'maior', unidade: 'qtd', fonte: 'auto', desc: 'Acordos comerciais VALIDADOS pela diretoria no mês. Meta: ≥ 5.', calc: 'Quantidade de acordos do comprador com status VALIDADO pela diretoria no mês.', acesso: 'Automático. Vem do Kanban de Acordos comerciais (coluna validado).', mercado: 'Depende da carteira; o importante é a regularidade mês a mês.' },
  { chave: 'trade_rede', nome: 'Trade rede', pilar: 'Negociação & Conciliação', peso: 10, meta: null, direcao: 'maior', unidade: '', fonte: 'manual', desc: 'Indicador de trade da rede (defina a meta pra ativar).', ativoPadrao: false, calc: 'Definido pela gestão (meta e realizado lançados à mão).', acesso: 'Manual. Ative cadastrando a meta na aba Metas e lance o realizado em Meu Setor.', mercado: '' },
  // ── Conciliação Pedido × NF (todo comprador é obrigado a lançar o pedido p/ depois conferir com a NF) ──
  { chave: 'sem_pedido', nome: 'Compras sem pedido (%)', pilar: 'Negociação & Conciliação', peso: 10, meta: 5, direcao: 'menor', unidade: '%', fonte: 'auto', desc: 'Valor comprado por NF que NÃO tem pedido lançado no sistema (impede conciliar pedido × NF). Meta: ≤ 5%.', calc: '% = valor de NF de entrada sem vínculo de pedido (conciliação ou recebimento) ÷ total comprado, dos grupos do comprador. Bonificação não conta.', acesso: 'Compras → Conciliação Pedido × NF. Detalhe por comprador.', mercado: 'Todo comprador deve lançar o pedido; sem pedido não dá pra auditar preço/quantidade.' },
  { chave: 'conc_preco', nome: 'Fornecedor cobrou a mais (R$)', pilar: 'Negociação & Conciliação', peso: 10, meta: null, direcao: 'menor', unidade: 'R$', fonte: 'auto', desc: 'Quanto a NF veio mais CARA que o pedido (preço do fornecedor acima do combinado). Meta: abaixo do teto (cadastre).', calc: 'Soma de (preço NF − preço pedido) × quantidade, nos itens onde a NF veio >1% acima do pedido (via recebimento físico).', acesso: 'Compras → Conciliação Pedido × NF → divergência de preço.', mercado: 'Quanto menor, melhor; fornecedor cobrando acima do pedido precisa ser cobrado.' },
  { chave: 'conc_sobra_falta', nome: 'Divergências de quantidade (qtd)', pilar: 'Negociação & Conciliação', peso: 10, meta: null, direcao: 'menor', unidade: 'qtd', fonte: 'auto', desc: 'Itens em que a NF veio com quantidade diferente do pedido (fornecedor mandou mais ou menos). Meta: abaixo do teto.', calc: 'Contagem de itens pedido × NF (via recebimento físico) com quantidade da NF ≠ quantidade do pedido.', acesso: 'Compras → Conciliação Pedido × NF → sobra/falta.', mercado: 'Sobra = capital parado; falta = ruptura. Acompanhar e cobrar o fornecedor.' },
  { chave: 'pedidos_pendentes', nome: 'Pedidos atrasados sem NF (qtd)', pilar: 'Negociação & Conciliação', peso: 10, meta: 0, direcao: 'menor', unidade: 'qtd', fonte: 'auto', desc: 'Pedidos lançados, ainda SEM NF e com o prazo de entrega VENCIDO. Não é punição: é acompanhamento — ao atualizar o prazo (ou receber), sai da lista. Meta: 0.', calc: 'Contagem de pedidos de compra do comprador sem vínculo de NF (conciliação/recebimento) e com dataentregaprogramada < hoje.', acesso: 'Compras → Conciliação Pedido × NF → pedidos pendentes (atrasados em vermelho).', mercado: 'O comprador acompanha: se atrasou, atualiza o prazo no Alpha ou cobra o fornecedor.' },
  { chave: 'retorno_falteiro', nome: 'Retorno do falteiro (%)', pilar: 'Abastecimento', peso: 10, meta: 60, direcao: 'maior', unidade: '%', fonte: 'auto', desc: 'Das faltas do balcão (tela Falteiro), % que o comprador ATENDEU. Meta: ≥ 60%.', calc: '% = faltas do balcão que o comprador atendeu (comprou) ÷ total de faltas registradas no período.', acesso: 'Automático. Vem da Lista de Faltas (Falteiro) do Comercial.', mercado: 'Ideal atender > 60–70% das faltas sinalizadas pelo balcão.' },
  { chave: 'pedidos_transf', nome: 'Pedidos de transferência parados (qtd)', pilar: 'Abastecimento', peso: 10, meta: 0, direcao: 'menor', unidade: 'qtd', fonte: 'auto', desc: 'Pedidos de transferência do comprador ainda em aberto (Aberto/Em separação). Meta: o menor possível.', calc: 'Contagem de pedidos de transferência (pedidotransferencia, status A/B) que têm produtos do comprador.', acesso: 'Compras → Pedidos de Transferência.', mercado: 'Pedido parado = loja sem o produto; resolver rápido.' },
];
const PILARES_PADRAO = ['Resultado', 'Estoque', 'Abastecimento', 'Negociação & Conciliação', 'Perdas'];

// Config dos indicadores (pilar/peso/meta/direção/ativo) — CADASTRÁVEL. `bloco` (legado) é mantido = pilar.
// Pilar/peso/direção/ativo são GLOBAIS (iguais p/ todos os compradores). A META/alvo é POR COMPRADOR
// (tabela compras_meusetor_meta); sem alvo específico, cai no alvo global e, por fim, no padrão do catálogo.
function config(emp, compradorId) {
  const ov = {};
  db.prepare('SELECT chave, pilar, bloco, peso, meta, direcao, ativo, mercado FROM compras_meusetor_indicador WHERE empresa_id=?').all(emp).forEach(r => { ov[r.chave] = r; });
  const mc = {};
  if (compradorId) db.prepare('SELECT chave, meta FROM compras_meusetor_meta WHERE empresa_id=? AND comprador_id=?').all(emp, compradorId).forEach(r => { mc[r.chave] = r.meta; });
  return CATALOGO.map(c => {
    const o = ov[c.chave] || {};
    const metaGlobal = (o.meta != null) ? Number(o.meta) : c.meta;
    const temComp = compradorId && mc[c.chave] != null;
    return {
      chave: c.chave, nome: c.nome, unidade: c.unidade, fonte: c.fonte, desc: c.desc, calc: c.calc, acesso: c.acesso,
      mercado: (o.mercado != null && o.mercado !== '') ? o.mercado : c.mercado, mercadoPadrao: c.mercado, mercadoEditado: !!(o.mercado != null && o.mercado !== ''),
      pilar: o.pilar || o.bloco || c.pilar,
      peso: o.peso != null ? Number(o.peso) : c.peso,
      meta: temComp ? Number(mc[c.chave]) : metaGlobal,
      metaGlobal, metaPorComprador: !!temComp,
      direcao: o.direcao || c.direcao,
      ativo: o.ativo != null ? o.ativo !== 0 : (c.ativoPadrao !== false),
    };
  });
}
function setConfig(emp, { chave, pilar, peso, meta, direcao, ativo, mercado, comprador_id } = {}) {
  if (!CATALOGO.find(c => c.chave === chave)) throw new Error('Indicador desconhecido.');
  const cur = config(emp, comprador_id).find(c => c.chave === chave);
  // META: com comprador_id → alvo ESPECÍFICO daquele comprador (não toca o global).
  if (meta !== undefined && comprador_id) {
    const mv = (meta === '' || meta == null) ? null : Number(meta);
    if (mv == null) db.prepare('DELETE FROM compras_meusetor_meta WHERE empresa_id=? AND comprador_id=? AND chave=?').run(emp, comprador_id, chave);
    else db.prepare(`INSERT INTO compras_meusetor_meta (empresa_id, comprador_id, chave, meta, atualizado_em) VALUES (?,?,?,?, datetime('now'))
      ON CONFLICT(empresa_id, comprador_id, chave) DO UPDATE SET meta=excluded.meta, atualizado_em=excluded.atualizado_em`).run(emp, comprador_id, chave, mv);
  }
  // Campos GLOBAIS + meta global (só quando NÃO veio comprador_id). Preserva metaGlobal nos demais casos.
  const p = pilar || cur.pilar;
  const metaGlobalNova = (meta !== undefined && !comprador_id) ? ((meta === '' || meta == null) ? null : Number(meta)) : cur.metaGlobal;
  const rawMercado = db.prepare('SELECT mercado FROM compras_meusetor_indicador WHERE empresa_id=? AND chave=?').get(emp, chave)?.mercado ?? null;
  const mercadoNova = mercado !== undefined ? ((mercado === '' || mercado == null) ? null : String(mercado).slice(0, 600)) : rawMercado;
  const v = { pilar: p, peso: peso != null && peso !== '' ? Number(peso) : cur.peso, meta: metaGlobalNova == null ? null : metaGlobalNova, direcao: direcao || cur.direcao, ativo: ativo === false ? 0 : 1 };
  db.prepare(`INSERT INTO compras_meusetor_indicador (empresa_id, chave, pilar, bloco, peso, meta, direcao, ativo, mercado) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(empresa_id, chave) DO UPDATE SET pilar=excluded.pilar, bloco=excluded.bloco, peso=excluded.peso, meta=excluded.meta, direcao=excluded.direcao, ativo=excluded.ativo, mercado=excluded.mercado`)
    .run(emp, chave, p, p, v.peso, v.meta, v.direcao, v.ativo, mercadoNova);
  return { ok: true };
}

// Pilares configuráveis (nome + teto R$). Sem config → padrão (4 pilares, teto 100 cada).
function pilaresConfig(emp) {
  const rows = db.prepare('SELECT pilar, teto, ordem FROM compras_pilar WHERE empresa_id=? AND ativo=1 ORDER BY ordem, pilar').all(emp);
  if (rows.length) return rows.map(r => ({ pilar: r.pilar, teto: Number(r.teto) || 0, ordem: r.ordem }));
  return PILARES_PADRAO.map((p, i) => ({ pilar: p, teto: 100, ordem: i }));
}
function setPilar(emp, { pilar, teto, ordem, ativo } = {}) {
  if (!pilar) throw new Error('Pilar não informado.');
  db.prepare(`INSERT INTO compras_pilar (empresa_id, pilar, teto, ordem, ativo) VALUES (?,?,?,?,?)
    ON CONFLICT(empresa_id, pilar) DO UPDATE SET teto=excluded.teto, ordem=excluded.ordem, ativo=excluded.ativo`)
    .run(emp, pilar, teto != null && teto !== '' ? Number(teto) : 100, Number(ordem) || 0, ativo === false ? 0 : 1);
  return { ok: true };
}
function removerPilar(emp, pilar) { db.prepare('DELETE FROM compras_pilar WHERE empresa_id=? AND pilar=?').run(emp, pilar); return { ok: true }; }
function premioConfig(emp) {
  const r = db.prepare('SELECT bonus_pct FROM compras_premio_config WHERE empresa_id=?').get(emp);
  return { bonus_pct: r && r.bonus_pct != null ? Number(r.bonus_pct) : 50 };
}
function setPremioConfig(emp, { bonus_pct } = {}) {
  db.prepare(`INSERT INTO compras_premio_config (empresa_id, bonus_pct) VALUES (?,?)
    ON CONFLICT(empresa_id) DO UPDATE SET bonus_pct=excluded.bonus_pct`).run(emp, bonus_pct != null && bonus_pct !== '' ? Number(bonus_pct) : 50);
  return { ok: true };
}

function realizadoMap(emp, compradorId, ano, mes) {
  const m = {};
  db.prepare('SELECT chave, valor FROM compras_meusetor_realizado WHERE empresa_id=? AND comprador_id=? AND ano=? AND mes=?').all(emp, compradorId, ano, mes).forEach(r => { m[r.chave] = r.valor; });
  return m;
}
function setRealizado(emp, { comprador_id, ano, mes, chave, valor } = {}, usuario) {
  if (!comprador_id) throw new Error('Comprador não informado.');
  const v = (valor === '' || valor == null) ? null : Number(valor);
  db.prepare(`INSERT INTO compras_meusetor_realizado (empresa_id, comprador_id, ano, mes, chave, valor, por, atualizado_em)
    VALUES (?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(empresa_id, comprador_id, ano, mes, chave) DO UPDATE SET valor=excluded.valor, por=excluded.por, atualizado_em=excluded.atualizado_em`)
    .run(emp, comprador_id, Number(ano), Number(mes), chave, v, usuario?.nome || null);
  return { ok: true };
}
async function fonteAuto(emp, compradorId, { ano, mes } = {}) {
  const base = {};
  try {
    const r = await ind.indicadoresEstoque(emp, { compradorId });
    if (r && r.erp !== false && !r.semComprador) {
      base.cobertura = r.cobertura ? r.cobertura.dias : null;
      base.saldo_estoque = r.estoque ? r.estoque.valor : null;
      base.curva_d = (r.curvaABC && r.curvaABC.D) ? r.curvaABC.D.valor : null;
      base.conversao_novos = r.produtosNovos ? r.produtosNovos.pct : null;
      base.ruptura = r.ruptura ? r.ruptura.pct : null;
    }
  } catch (e) { }
  try {
    const f = await ind.retornoFalteiro(emp, { compradorId });
    if (f && f.erp !== false && !f.semComprador) base.retorno_falteiro = f.taxa;
  } catch (e) { }
  // CMV% do comprador no mês (custo ÷ venda dos produtos dos grupos dele) — automático.
  try {
    const cv = await ind.cmvComprador(emp, { compradorId, ano, mes });
    if (cv && cv.erp !== false && !cv.semComprador) base.cmv = cv.cmv;
  } catch (e) { }
  // Vencidos (%): valor baixado por vencimento no mês ÷ valor do estoque (a custo) — automático.
  try {
    const vc = await ind.vencidoComprador(emp, { compradorId, ano, mes });
    if (vc && vc.erp !== false && !vc.semComprador && base.saldo_estoque > 0) {
      base.vencido = Math.round(vc.custo / base.saldo_estoque * 1000) / 10;
    }
  } catch (e) { }
  // Orçamento de compras (%): execução = comprado no mês ÷ orçamento do mês — do módulo de Orçamento.
  try {
    const oc = require('./orcamentoCompraErp');
    const o = await oc.orcamentoCompra(emp, { compradorId, ano, mes });
    if (o && o.erp !== false && !o.semComprador && o.mesCorrente && o.mesCorrente.orcamento > 0) {
      // "não estourar": compromisso do mês (entradas + pedidos não recebidos) ÷ orçamento do mês.
      const mc = o.mesCorrente;
      base.orcamento = Math.round((mc.comprado + (mc.pendentes || 0)) / mc.orcamento * 1000) / 10;
    }
  } catch (e) { }
  // Pedidos de transferência parados do comprador (pedidotransferencia A/B com produtos dele).
  try {
    const { pedidosTransferenciaPendentes } = require('./comprasErp');
    const pt = await pedidosTransferenciaPendentes(7, null, { empresaId: emp, compradorId });
    if (pt && pt.erp !== false) base.pedidos_transf = pt.resumo ? pt.resumo.pendentes : 0;
  } catch (e) { }
  // Conciliação Pedido × NF do comprador: sem pedido, fornecedor mais caro, sobra/falta, pedidos atrasados.
  try {
    const { conciliacaoComprador } = require('./eficienciaCompradorErp');
    const cc = await conciliacaoComprador(emp, { compradorId, ano, mes });
    if (cc && cc.erp !== false && !cc.semComprador) {
      base.sem_pedido = cc.semPedidoPct;
      base.conc_preco = cc.impactoPreco;
      base.conc_sobra_falta = cc.sobraFalta;
      base.pedidos_pendentes = cc.pedidosAtrasados; // acompanhamento: só o atrasado conta
    }
  } catch (e) { }
  // Compra do Simples Nacional (%): Lucro Real comprando do Simples = tributação maior. Líquido de perdão.
  try {
    const { comprasSimplesComprador } = require('./comprasSimplesErp');
    const cs = await comprasSimplesComprador(emp, { compradorId, ano, mes });
    if (cs && cs.erp !== false && !cs.semComprador) base.compras_simples = cs.simplesPct;
  } catch (e) { }
  return base;
}

async function apurar(emp, compradorId, { ano, mes } = {}) {
  const now = new Date();
  ano = Number(ano) || now.getFullYear(); mes = Number(mes) || (now.getMonth() + 1);
  const cfg = config(emp, compradorId).filter(c => c.ativo);
  const auto = await fonteAuto(emp, compradorId, { ano, mes });
  auto.acordos = acordosLib.countValidados(emp, compradorId, ano, mes);
  const man = realizadoMap(emp, compradorId, ano, mes);
  const brlInt = n => 'R$ ' + Math.round(Number(n) || 0).toLocaleString('pt-BR');
  // Colchão de FEIRA: nos meses que uma feira abastece, o estoque extra é compra ANTECIPADA planejada —
  // então saldo de estoque e cobertura NÃO penalizam nesse período (é esperado estar mais cheio).
  const feiraCobre = (() => {
    try {
      const rows = db.prepare('SELECT data_ini, meses_cobertura FROM feiras WHERE empresa_id=? AND verba_planejada IS NOT NULL').all(emp);
      const alvo = ano * 12 + (mes - 1);
      for (const f of rows) {
        const dt = String(f.data_ini || ''); if (dt.length < 7) continue;
        const fm = Number(dt.slice(0, 4)) * 12 + (Number(dt.slice(5, 7)) - 1);
        const N = Math.max(1, Number(f.meses_cobertura) || 3);
        if (alvo >= fm && alvo <= fm + N - 1) return true;
      }
    } catch (e) { /* sem feiras */ }
    return false;
  })();
  const COLCHAO_FEIRA = new Set(['saldo_estoque', 'cobertura']);
  const metas = cfg.map(c => {
    const realizado = c.fonte === 'auto' ? (auto[c.chave] != null ? auto[c.chave] : null) : (man[c.chave] != null ? man[c.chave] : null);
    let hit = (realizado != null && c.meta != null) ? (c.direcao === 'menor' ? realizado <= c.meta : realizado >= c.meta) : false;
    let farol = realizado == null ? 'sem_dados' : hit ? 'verde' : 'vermelho';
    let feiraAjuste = false;
    if (feiraCobre && COLCHAO_FEIRA.has(c.chave) && realizado != null && !hit) { hit = true; farol = 'verde'; feiraAjuste = true; }
    // Referência de mercado DINÂMICA pelo giro do comprador (quando o gestor não editou o texto):
    // saldo de estoque ideal = dias de cobertura × custo/dia — reflete o porte/faturamento de cada um.
    let mercado = c.mercado;
    if (!c.mercadoEditado && c.chave === 'saldo_estoque' && realizado != null && auto.cobertura > 0) {
      const ideal = Math.round(realizado * 60 / auto.cobertura);
      mercado = `Pelo seu giro, ~${brlInt(ideal)} mantêm 60 dias de cobertura (hoje ${Math.round(auto.cobertura)} dias). Saudável girar entre 45 e 60 dias.`;
    }
    if (feiraAjuste) mercado = '🎪 Ajustado pela feira: o estoque extra é compra antecipada planejada, então não penaliza neste período. ' + (mercado || '');
    return { ...c, mercado, realizado, hit, farol, feiraAjuste, pontos: hit ? c.peso : 0 };
  });
  const pil = pilaresConfig(emp);
  const bonusPct = premioConfig(emp).bonus_pct;
  const pilares = pil.map(p => {
    const ms = metas.filter(m => (m.pilar || '') === p.pilar);
    const pesoTot = ms.reduce((a, m) => a + (Number(m.peso) || 0), 0);
    const pesoHit = ms.filter(m => m.hit).reduce((a, m) => a + (Number(m.peso) || 0), 0);
    const nota = pesoTot ? Math.round(pesoHit / pesoTot * 100) : null;
    const cheio = nota === 100;
    const premio = nota == null ? 0 : r2(p.teto * nota / 100 * (cheio ? (1 + bonusPct / 100) : 1));
    const verde = ms.filter(m => m.hit).length;
    const vermelho = ms.filter(m => !m.hit && m.realizado != null).length;
    const semDados = ms.filter(m => m.realizado == null).length;
    const farol = nota == null ? 'sem_dados' : nota >= 80 ? 'verde' : nota >= 50 ? 'amarelo' : 'vermelho';
    return { pilar: p.pilar, teto: p.teto, nota, premio, bonus: cheio, bateu: verde, de: ms.length, verde, amarelo: 0, vermelho, semDados, farol, indicadores: ms };
  });
  const notas = pilares.map(p => p.nota).filter(x => x != null);
  const notaGeral = notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null;
  const premioTotal = r2(pilares.reduce((a, p) => a + (p.premio || 0), 0));
  const premioMax = r2(pil.reduce((a, p) => a + p.teto * (1 + bonusPct / 100), 0));
  const pessoas = listPremioPessoas(emp, compradorId).map(p => ({ ...p, premio: r2(premioTotal * (Number(p.fator) || 0)) }));
  return { ok: true, compradorId, ano, mes, metas, pilares, notaGeral, bonusPct, premioTotal, premioMax, pessoas };
}

// ── Pessoas vinculadas à premiação de um COMPRADOR (por fator) ──
function listPremioPessoas(emp, compradorId) {
  if (!compradorId) return [];
  try {
    return db.prepare(`SELECT pp.colaborador_id, pp.fator, c.nome
      FROM compras_premio_pessoa pp LEFT JOIN colaboradores c ON c.id=pp.colaborador_id
      WHERE pp.empresa_id=? AND pp.comprador_id=? AND pp.ativo=1 ORDER BY pp.fator DESC, c.nome`).all(emp, compradorId)
      .map(r => ({ colaborador_id: r.colaborador_id, nome: r.nome || '(colaborador)', fator: Number(r.fator) || 0 }));
  } catch (e) { return []; }
}
function setPremioPessoa(emp, { comprador_id, colaborador_id, fator } = {}) {
  if (!comprador_id) throw new Error('Comprador não informado.');
  if (!colaborador_id) throw new Error('Selecione o colaborador.');
  const f = Math.min(5, Math.max(0, Number(fator))); if (!isFinite(f)) throw new Error('Fator inválido.');
  db.prepare(`INSERT INTO compras_premio_pessoa (empresa_id, comprador_id, colaborador_id, fator, ativo, criado_em) VALUES (?,?,?,?,1, datetime('now'))
    ON CONFLICT(empresa_id, comprador_id, colaborador_id) DO UPDATE SET fator=excluded.fator, ativo=1`).run(emp, String(comprador_id), String(colaborador_id), f);
  return { ok: true };
}
function removePremioPessoa(emp, comprador_id, colaborador_id) {
  db.prepare('UPDATE compras_premio_pessoa SET ativo=0 WHERE empresa_id=? AND comprador_id=? AND colaborador_id=?').run(emp, String(comprador_id), String(colaborador_id));
  return { ok: true };
}

module.exports = { CATALOGO, config, setConfig, pilaresConfig, setPilar, removerPilar, premioConfig, setPremioConfig, realizadoMap, setRealizado, apurar, listPremioPessoas, setPremioPessoa, removePremioPessoa };
