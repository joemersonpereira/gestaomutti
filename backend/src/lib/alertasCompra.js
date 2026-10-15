// alertasCompra.js — transforma eventos de compra do ERP em tarefas/notificações do sistema.
// Regras: pedido > R$10k → Diretor (ciência); marca nova → Diretor + Supervisor;
//         item novo cadastrado → Marketing; comprado sem venda em ~1 mês → Comprador (apoio Diretor/Supervisor).
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { erpQuery, habilitado } = require('../db/erp');
const { filtroProdutosComprador, clausulaProdutos } = require('./comprasErp');

const LIMITE_PEDIDO = 10000;
const JANELA_DIAS = 7;       // eventos "novos" (pedido/marca/item) desta janela
const SEM_VENDA_MIN = 30;    // comprado há pelo menos 30 dias
const SEM_VENDA_MAX = 45;    // ...e no máximo 45 (janela p/ não repetir o backfill inteiro)

function unis(empresaId) {
  return db.prepare('SELECT erp_unidadenegocio_id u FROM lojas WHERE empresa_id=? AND erp_unidadenegocio_id IS NOT NULL')
    .all(empresaId).map(r => Number(r.u)).filter(Boolean);
}
function funcaoColab(empresaId, like) {
  const r = db.prepare(`SELECT c.id FROM colaboradores c JOIN funcoes f ON f.id=c.funcao_id
    WHERE c.empresa_id=? AND c.ativo=1 AND f.nome LIKE ? ORDER BY c.nome LIMIT 1`).get(empresaId, like);
  return r ? r.id : null;
}
// Coleta os eventos do ERP (sem gravar). Retorna { pedidos, marcas, itens, semVenda }.
async function coletar(empresaId) {
  const u = unis(empresaId);
  if (!habilitado() || !u.length) return null;

  // 1) Pedidos acima do limite (janela recente). Traz o COMPRADOR (usuario que fez o pedido).
  const pedidos = await erpQuery(`
    SELECT pc.id, pc.codigo, pc.datahora, pf.nome fornecedor, pcomp.nome comprador, SUM(ip.valortotal) valor
    FROM pedidocompra pc
    JOIN itempedidocompra ip ON ip.pedidocompraid = pc.id
    LEFT JOIN fornecedor fo ON fo.id = pc.fornecedorid
    LEFT JOIN pessoa pf ON pf.id = fo.pessoaid
    LEFT JOIN usuario us ON us.id = pc.usuarioid
    LEFT JOIN pessoa pcomp ON pcomp.id = us.pessoaid
    WHERE pc.unidadenegocioid = ANY($1::bigint[]) AND pc.status NOT IN ('C','I')
      AND pc.datahora >= now() - ($2 || ' days')::interval
    GROUP BY pc.id, pc.codigo, pc.datahora, pf.nome, pcomp.nome
    HAVING SUM(ip.valortotal) > $3
    ORDER BY valor DESC LIMIT 200`, [u, JANELA_DIAS, LIMITE_PEDIDO]);

  // 2) Marcas (fabricantes) novas: 1ª compra em pedido é desta janela.
  const marcas = await erpQuery(`
    WITH recentes AS (
      SELECT DISTINCT pr.fabricanteid fab
      FROM pedidocompra pc JOIN itempedidocompra ip ON ip.pedidocompraid=pc.id
        JOIN embalagem e ON e.id=ip.embalagemid JOIN produto pr ON pr.id=e.produtoid
      WHERE pc.unidadenegocioid = ANY($1::bigint[]) AND pc.datahora >= now() - ($2 || ' days')::interval
        AND pr.fabricanteid IS NOT NULL)
    SELECT r.fab, COALESCE(pf.nome, r.fab::text) nome
    FROM recentes r JOIN fabricante fb ON fb.id=r.fab LEFT JOIN pessoa pf ON pf.id=fb.pessoaid
    WHERE NOT EXISTS (
      SELECT 1 FROM pedidocompra pc2 JOIN itempedidocompra ip2 ON ip2.pedidocompraid=pc2.id
        JOIN embalagem e2 ON e2.id=ip2.embalagemid JOIN produto pr2 ON pr2.id=e2.produtoid
      WHERE pr2.fabricanteid = r.fab AND pc2.unidadenegocioid = ANY($1::bigint[])
        AND pc2.datahora < now() - ($2 || ' days')::interval)
    LIMIT 100`, [u, JANELA_DIAS]);

  // 3) Itens novos cadastrados (janela recente). + EAN (código de barras) + classificação.
  const itens = await erpQuery(`
    SELECT pr.id, pr.descricao, pf.nome fabricante, pr.datahorainclusao,
      (SELECT e.codigobarras FROM embalagem e WHERE e.produtoid=pr.id AND e.codigobarras IS NOT NULL ORDER BY length(e.codigobarras) DESC LIMIT 1) ean,
      (SELECT cl.nome FROM classificacaoproduto cp JOIN classificacao cl ON cl.id=cp.classificacaoid
         WHERE cp.produtoid=pr.id AND cl.principal=true ORDER BY cl.profundidade DESC LIMIT 1) classificacao
    FROM produto pr LEFT JOIN fabricante fb ON fb.id=pr.fabricanteid LEFT JOIN pessoa pf ON pf.id=fb.pessoaid
    WHERE pr.status='A' AND pr.datahorainclusao >= now() - ($1 || ' days')::interval
    ORDER BY pr.datahorainclusao DESC LIMIT 500`, [JANELA_DIAS]);

  // 4) Recebido FISICAMENTE na loja entre 30 e 45 dias e sem nenhuma venda desde então.
  // Usa a data do RECEBIMENTO FÍSICO (quando a mercadoria deu entrada na loja), não a data
  // lançada na nota — o "sem venda" conta a partir de quando o produto realmente chegou.
  const semVenda = await erpQuery(`
    WITH entradas AS (
      -- POR (LOJA, PRODUTO): quando a mercadoria deu entrada física em CADA loja
      SELECT rf.unidadenegocioid uni, em.produtoid, MIN(COALESCE(rf.datahorafinal, rf.datahora)) entrada
      FROM recebimentofisico rf
      JOIN itemrecebimentofisico irf ON irf.recebimentofisicoid = rf.id
      JOIN embalagem em ON em.id = irf.embalagemid
      WHERE rf.unidadenegocioid = ANY($1::bigint[])
        AND COALESCE(rf.datahorafinal, rf.datahora) BETWEEN now() - ($3 || ' days')::interval AND now() - ($2 || ' days')::interval
      GROUP BY rf.unidadenegocioid, em.produtoid)
    SELECT e.uni, e.produtoid, pr.descricao, e.entrada,
      (SELECT em2.codigobarras FROM embalagem em2 WHERE em2.produtoid=e.produtoid AND em2.codigobarras IS NOT NULL ORDER BY length(em2.codigobarras) DESC LIMIT 1) ean,
      (SELECT cl.nome FROM classificacaoproduto cp JOIN classificacao cl ON cl.id=cp.classificacaoid
         WHERE cp.produtoid=e.produtoid AND cl.principal=true ORDER BY cl.profundidade DESC LIMIT 1) classificacao,
      -- loja da REDE que MAIS vende esse produto (90d) — sugestão de remanejamento (se houver)
      (SELECT v2.unidadenegocioid FROM itemvenda iv2 JOIN venda v2 ON v2.id=iv2.vendaid JOIN embalagem em2 ON em2.id=iv2.embalagemid
         WHERE em2.produtoid=e.produtoid AND v2.status='F' AND v2.unidadenegocioid = ANY($1::bigint[]) AND v2.unidadenegocioid <> e.uni
           AND v2.datahorafechamento >= now() - interval '90 days'
         GROUP BY v2.unidadenegocioid ORDER BY sum(iv2.quantidade) DESC LIMIT 1) melhor_uni
    FROM entradas e JOIN produto pr ON pr.id = e.produtoid
    WHERE NOT EXISTS (
      -- SEM VENDA NESSA LOJA desde a entrada (mesmo que venda em outra loja)
      SELECT 1 FROM itemvenda iv JOIN venda v ON v.id=iv.vendaid JOIN embalagem em ON em.id=iv.embalagemid
      WHERE em.produtoid = e.produtoid AND v.unidadenegocioid = e.uni
        AND v.status='F' AND v.datahorafechamento >= e.entrada)
      -- ignora produtos de USO E CONSUMO (uso interno da loja — não são feitos para vender)
      AND NOT EXISTS (
        SELECT 1 FROM classificacaoproduto cpx JOIN classificacao clx ON clx.id=cpx.classificacaoid
        WHERE cpx.produtoid = e.produtoid AND lower(clx.caminho) LIKE 'principal > uso e consumo%')
    LIMIT 800`, [u, SEM_VENDA_MIN, SEM_VENDA_MAX]).catch(() => []);

  return { pedidos, marcas, itens, semVenda };
}

async function sincronizarAlertas(empresaId, { dryRun = false } = {}) {
  const ev = await coletar(empresaId);
  if (!ev) return { ok: false, erro: 'ERP indisponível ou sem lojas.' };

  const diretor = funcaoColab(empresaId, 'Diretor Geral');
  const supervisor = funcaoColab(empresaId, 'Supervisor');
  const marketing = funcaoColab(empresaId, '%Marketing%') || diretor;
  const comprador = funcaoColab(empresaId, 'Comprador%') || diretor;

  // Dedup diário: só alerta produtos que AINDA NÃO foram alertados (por tipo). Assim a tarefa de
  // cada dia mostra apenas o que é novo, e não repete os mesmos itens dia após dia.
  const jaVisto = db.prepare('SELECT 1 FROM compras_alerta_visto WHERE empresa_id=? AND tipo=? AND ref=?');
  const itensNovos = ev.itens.filter(x => !jaVisto.get(empresaId, 'itemnovo', String(x.id)));
  // "sem venda" agora é POR (produto, loja): nome da loja + sugestão de remanejamento; dedup por produto:loja.
  const nomeLoja = {};
  for (const r of db.prepare('SELECT erp_unidadenegocio_id u, nome FROM lojas WHERE empresa_id=? AND erp_unidadenegocio_id IS NOT NULL').all(empresaId)) nomeLoja[String(r.u)] = r.nome;
  ev.semVenda.forEach(x => {
    x.loja = nomeLoja[String(x.uni)] || ('Loja ' + x.uni);
    x.melhorLoja = x.melhor_uni ? (nomeLoja[String(x.melhor_uni)] || ('Loja ' + x.melhor_uni)) : null;
    x.sugestao = x.melhorLoja ? `remanejar p/ ${x.melhorLoja} (vende lá)` : 'sem venda na rede';
  });
  const semVendaNovos = ev.semVenda.filter(x => !jaVisto.get(empresaId, 'semvenda', x.produtoid + ':' + x.uni));

  const contagem = {
    pedido10k: ev.pedidos.length, marcaNova: ev.marcas.length,
    itemNovo: itensNovos.length, semVenda: semVendaNovos.length,
    itemNovoTotal: ev.itens.length, semVendaTotal: ev.semVenda.length,
  };
  if (dryRun) return { ok: true, dryRun: true, contagem };

  const existe = db.prepare(`SELECT 1 FROM tarefas WHERE empresa_id=? AND origem='compras' AND referencia_id=?`);
  const ins = db.prepare(`INSERT INTO tarefas (id,empresa_id,tipo,origem,referencia_id,titulo,descricao,responsavel_id,apoio_id,status,criado_em,atualizado_em)
    VALUES (?,?,?,'compras',?,?,?,?,?,'aberto',datetime('now'),datetime('now'))`);
  const brl = n => 'R$ ' + Math.round(Number(n) || 0).toLocaleString('pt-BR');
  let criadas = 0;
  const criar = (ref, tipo, titulo, desc, resp, apoio) => {
    if (existe.get(empresaId, ref)) return;
    ins.run(uuidv4(), empresaId, tipo, ref, titulo.slice(0, 140), desc, resp || null, apoio || null);
    criadas++;
  };
  const hoje = new Date().toISOString().slice(0, 10);
  const lista = (arr, campo, n = 15) => arr.slice(0, n).map(x => '• ' + x[campo]).join('\n') + (arr.length > n ? `\n…e mais ${arr.length - n}.` : '');
  const tx = db.transaction(() => {
    // Pedido acima do limite → 1 notificação por pedido (poucos, alto valor).
    for (const p of ev.pedidos)
      criar(`ped10k:${p.id}`, 'notificacao', `Pedido de compra ${brl(p.valor)} — ${p.fornecedor || 'fornecedor'}`,
        `Pedido #${p.codigo || p.id} de ${brl(p.valor)} (acima de ${brl(LIMITE_PEDIDO)})${p.comprador ? ` · comprador: ${p.comprador}` : ''}. Ciência da diretoria.`, diretor, null);
    // Marca nova → 1 tarefa por marca (poucas).
    for (const m of ev.marcas)
      criar(`marcanova:${m.fab}`, 'tarefa', `Marca nova em compra — ${m.nome}`,
        `Primeira compra da marca "${m.nome}". Validar cadastro, política comercial e posicionamento. Diretor + Supervisor.`, diretor, supervisor);
    // Itens novos → 1 tarefa consolidada por dia (só os que ainda não foram alertados).
    if (itensNovos.length)
      criar(`itensnovos:${hoje}`, 'tarefa', `${itensNovos.length} itens novos cadastrados — criar divulgação`,
        `Produtos cadastrados nos últimos ${JANELA_DIAS} dias (novos desde o último aviso):\n${lista(itensNovos, 'descricao')}`, marketing, null);
    // Comprado sem venda em ~1 mês → 1 tarefa consolidada por dia (só os que ainda não foram alertados).
    if (semVendaNovos.length)
      criar(`semvenda:${hoje}`, 'tarefa', `${semVendaNovos.length} itens comprados há ~1 mês sem venda na loja`,
        `Recebidos há 30–45 dias e ainda SEM VENDA na loja indicada (novos desde o último aviso). Rever exposição/preço; se vende em outra loja, remanejar:\n`
        + semVendaNovos.slice(0, 15).map(x => `• ${x.descricao} — sem venda em ${x.loja}${x.melhorLoja ? ` · ${x.sugestao}` : ''}`).join('\n')
        + (semVendaNovos.length > 15 ? `\n…e mais ${semVendaNovos.length - 15}.` : ''), comprador, diretor);
  });
  tx();

  // Marca como já alertados os itens que entraram na tarefa de hoje (não repetem amanhã).
  const marcarVisto = db.prepare("INSERT OR IGNORE INTO compras_alerta_visto (empresa_id,tipo,ref,visto_em) VALUES (?,?,?,datetime('now'))");
  db.transaction(() => {
    itensNovos.forEach(x => marcarVisto.run(empresaId, 'itemnovo', String(x.id)));
    semVendaNovos.forEach(x => marcarVisto.run(empresaId, 'semvenda', x.produtoid + ':' + x.uni));
  })();

  // Guarda a lista COMPLETA (nome + EAN) de cada alerta com itens, p/ a tarefa expandir e mostrar tudo.
  const salvarItens = (ref, arr, extraFn) => {
    db.prepare('DELETE FROM compras_alerta_itens WHERE empresa_id=? AND referencia_id=?').run(empresaId, ref);
    const ins2 = db.prepare('INSERT INTO compras_alerta_itens (empresa_id, referencia_id, descricao, ean, classificacao, extra, ordem) VALUES (?,?,?,?,?,?,?)');
    arr.forEach((x, i) => ins2.run(empresaId, ref, x.descricao || '', x.ean || null, (x.classificacao || '').trim() || null, extraFn ? extraFn(x) : null, i));
  };
  const dfmt = d => { try { const t = new Date(d); return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`; } catch { return ''; } };
  const txItens = db.transaction(() => {
    if (itensNovos.length) salvarItens(`itensnovos:${hoje}`, itensNovos, x => x.fabricante || null);
    if (semVendaNovos.length) salvarItens(`semvenda:${hoje}`, semVendaNovos, x => [`sem venda em ${x.loja}`, x.melhorLoja ? x.sugestao : null, x.entrada ? ('entrada ' + dfmt(x.entrada)) : null].filter(Boolean).join(' · '));
  });
  txItens();
  return { ok: true, criadas, contagem };
}

// Itens completos (nome + EAN) de um alerta, pela referencia_id da tarefa.
function itensAlerta(empresaId, referenciaId) {
  return db.prepare('SELECT descricao, ean, classificacao, extra FROM compras_alerta_itens WHERE empresa_id=? AND referencia_id=? ORDER BY ordem').all(empresaId, referenciaId);
}

module.exports = { sincronizarAlertas, LIMITE_PEDIDO, itensAlerta };
