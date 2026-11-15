// 408 — limpa o cache velho do Painel da Gestão. Joe 2026-11-15.
// O erp_cache (serve-stale) congelava a RESPOSTA inteira do /painel/diretoria, inclusive os NOMES
// dos setores (que vêm do SETORES_BASE, constante do código). Quando os setores foram reestruturados,
// a produção continuou servindo o payload velho (ex.: "Operacional / Administrativo / Logística &
// Suporte") porque o cache nunca expira sozinho. Isto apaga só as linhas do painel → no 1º acesso
// recalcula com os nomes atuais (Retail & Ads, Compras, Marketing, Tesouraria, Financeiro, Gente &
// Gestão). Não mexe no cache dos outros relatórios (meses fechados seguem instantâneos).
// Idempotente: rodar de novo só apaga de novo (e recria no próximo acesso).
module.exports = function (db) {
  try {
    const r = db.prepare("DELETE FROM erp_cache WHERE chave LIKE 'painel:%'").run();
    if (r && r.changes) console.log(`  408: ${r.changes} linha(s) de cache do painel limpa(s).`);
  } catch (e) { /* tabela erp_cache pode não existir em base nova — ignora */ }
};

/* === Caminho técnico v2.0 (Postgres) ===
DELETE FROM erp_cache WHERE chave LIKE 'painel:%';
-- Lição estrutural p/ a v2.0: NÃO congelar no cache do ERP a parte ESTÁTICA da resposta (nomes/estrutura
-- de setor que vêm de constante do código). Cachear só os números que dependem do ERP; montar os nomes
-- de setor a cada request a partir do SETORES_BASE, por cima do payload cacheado.
*/
