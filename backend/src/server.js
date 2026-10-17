require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Rede de segurança: um erro assíncrono não tratado (ex.: ECONNRESET de IMAP/ERP) NÃO pode
// derrubar o sistema inteiro. Loga e segue — o servidor continua no ar.
process.on('uncaughtException', (e) => { console.error('[uncaughtException]', e && e.message ? e.message : e); });
process.on('unhandledRejection', (e) => { console.error('[unhandledRejection]', e && e.message ? e.message : e); });

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares globais
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE'] }));
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

// Log de requisições em desenvolvimento
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toLocaleTimeString('pt-BR')} ${req.method} ${req.path}`);
    next();
  });
}

// Rotas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tarefas', require('./routes/tarefas'));
app.use('/api/colaboradores', require('./routes/colaboradores'));
app.use('/api/folgas', require('./routes/folgas'));
app.use('/api/assinaturas', require('./routes/assinaturas'));
app.use('/api/escala', require('./routes/escala'));
app.use('/api/ocorrencias', require('./routes/ocorrencias'));
app.use('/api/operacional', require('./routes/operacional'));
app.use('/api/pilares', require('./routes/pilares'));
app.use('/api/referencias', require('./routes/referencias'));
app.use('/api/indicadores', require('./routes/indicadores'));
app.use('/api/regras', require('./routes/regras'));
app.use('/api/acessos', require('./routes/acessos'));
app.use('/api/colab-indicadores', require('./routes/colabIndicadores'));
app.use('/api/capacitacao', require('./routes/capacitacao'));
app.use('/api/caixa', require('./routes/caixa'));
app.use('/api/vendas', require('./routes/vendas'));
app.use('/api/metas', require('./routes/metas'));
app.use('/api/painel', require('./routes/painel'));
app.use('/api/checklist', require('./routes/checklist'));
app.use('/api/avaliacao-admin', require('./routes/avaliacaoAdmin'));
app.use('/api/auditoria', require('./routes/auditoria'));
app.use('/api/avaliacoes', require('./routes/avaliacoes'));
app.use('/api/marketing', require('./routes/marketing'));
app.use('/api/meu-rh', require('./routes/meurh'));
app.use('/api/aprovacoes', require('./routes/aprovacoes'));
app.use('/api/certificados', require('./routes/certificados'));
app.use('/api/relatorios', require('./routes/relatorios'));
app.use('/api/config', require('./routes/config'));
app.use('/api/satisfacao', require('./routes/satisfacao'));
app.use('/api/devolucoes', require('./routes/devolucoes'));
app.use('/api/recebimento', require('./routes/recebimento'));
app.use('/api/documentos', require('./routes/documentos'));
app.use('/api/mural', require('./routes/mural'));
app.use('/api/faltas', require('./routes/faltas'));
app.use('/api/autocadastro', require('./routes/autocadastro'));
app.use('/api/mercado', require('./routes/mercado'));
app.use('/api/beneficios', require('./routes/beneficios'));
app.use('/api/pontos', require('./routes/pontos'));
app.use('/api/desligamentos', require('./routes/desligamentos'));
app.use('/api/painel-rh', require('./routes/painelRh'));
app.use('/api/avisos', require('./routes/avisos'));
app.use('/api/clima', require('./routes/clima'));
app.use('/api/pesquisas', require('./routes/pesquisas'));
app.use('/api/kudos', require('./routes/kudos'));
app.use('/api/compras', require('./routes/compras'));
app.use('/api/financeiro', require('./routes/financeiro'));
app.use('/api/tesouraria', require('./routes/tesouraria'));
app.use('/api/contas-receber', require('./routes/contasReceber'));
app.use('/api/conciliacao-cartao', require('./routes/conciliacaoCartao'));
app.use('/api/entrega', require('./routes/entrega'));
app.use('/api/etiquetas', require('./routes/etiquetas'));
app.use('/api/mkt', require('./routes/mkt'));
app.use('/api/formulas', require('./routes/formulas'));
app.use('/api/patrimonio', require('./routes/patrimonio'));
app.use('/api/rhia', require('./routes/rhia'));
app.use('/api/pedemeia', require('./routes/pedemeia'));
app.use('/api/acordos', require('./routes/acordos'));
app.use('/api/trademkt', require('./routes/trademkt'));
app.use('/api/ponto', require('./routes/ponto'));
app.use('/api/pontorep', require('./routes/pontoRepp'));
app.use('/api/estagios', require('./routes/estagios'));
app.use('/api/estagio', require('./routes/estagioRh'));
app.use('/api/publico', require('./routes/publico'));
app.use('/api/suporte', require('./routes/suporte'));
app.use('/api/controladoria', require('./routes/controladoria'));
app.use('/api/contabilidade', require('./routes/contabilidade'));
app.use('/api/integracoes', require('./routes/integracoes'));
app.use('/api/servicos-farmaceuticos', require('./routes/servicosFarmaceuticos'));
app.use('/api/termos', require('./routes/termos'));
app.use('/api/email', require('./routes/email'));
app.use('/api/feiras', require('./routes/feiras'));
app.use('/api/botvendas', require('./routes/botvendas'));
app.use('/api/ecomm-conversao', require('./routes/ecommConversao'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', versao: '1.0.0', hora: new Date().toISOString() }));

// 404 apenas para rotas de API
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// ── Frontend em produção ──────────────────────────────────────────────
// Se existir o build do React, o backend serve a aplicação no mesmo endereço
// (serviço único). Qualquer rota que não seja /api devolve o index.html (SPA).
const path = require('path');
const fs = require('fs');
const buildDir = process.env.FRONTEND_BUILD_DIR || path.join(__dirname, '..', '..', 'frontend', 'build');
if (fs.existsSync(buildDir)) {
  // Assets com hash no nome podem ser cacheados forte; o index.html NUNCA (senão o navegador
  // fica preso numa versão velha da tela mesmo após novo build).
  app.use(express.static(buildDir, {
    setHeaders: (res, p) => { if (p.endsWith('index.html')) res.set('Cache-Control', 'no-cache, no-store, must-revalidate'); },
  }));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(buildDir, 'index.html'));
  });
  console.log(`🌐 Servindo frontend de: ${buildDir}`);
}

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`\n✅ Servidor Mutti rodando na porta ${PORT}`);
  console.log(`   http://localhost:${PORT}/api/health\n`);
});

// Popula as tarefas de encomendas pendentes logo após o boot (não bloqueia).
// Depois disso, o Painel do Gerente re-sincroniza sozinho (throttled a cada 15 min).
setTimeout(() => {
  try {
    const db = require('./db/connection');
    const { sincronizarEncomendas } = require('./lib/encomendasSync');
    const empresas = [...new Set(db.prepare('SELECT empresa_id FROM lojas').all().map(r => r.empresa_id))];
    empresas.forEach(eid => sincronizarEncomendas(eid, true)
      .then(r => { if (r && r.ok) console.log(`[encomendas] ${eid}: ${r.criadas} criada(s), ${r.fechadas} encerrada(s), ${r.pendentes} pendente(s)`); })
      .catch(() => {}));
  } catch { /* ignora */ }
}, 8000);

// Pendências de ponto (Tangerino): cria tarefa p/ o colaborador corrigir e desconta pontos a cada 24h sem correção.
// Roda no boot (após 20s) e a cada 1h.
function rodarPendenciasPonto() {
  try {
    const db = require('./db/connection');
    const { processar } = require('./lib/pontoPendencias');
    const empresas = [...new Set(db.prepare('SELECT empresa_id FROM lojas').all().map(r => r.empresa_id))];
    empresas.forEach(eid => processar(eid)
      .then(r => { if (r && r.ok && (r.criadas || r.descontos)) console.log(`[ponto] ${eid}: ${r.criadas} tarefa(s), ${r.descontos} desconto(s) (${r.pontosDescontados} pts)`); })
      .catch(() => {}));
  } catch { /* ignora */ }
}
setTimeout(rodarPendenciasPonto, 20000);
setInterval(rodarPendenciasPonto, 3600 * 1000);

// Avaliação trimestral T&D: no início de cada trimestre abre a tarefa p/ gerente e subgerente.
// Roda no boot (após 30s) e a cada 12h (idempotente por trimestre/avaliador).
function rodarAvaliacaoTrimestral() {
  try {
    const db = require('./db/connection');
    const { abrirTrimestre } = require('./lib/avaliacaoTrimestral');
    const empresas = [...new Set(db.prepare('SELECT empresa_id FROM lojas').all().map(r => r.empresa_id))];
    empresas.forEach(eid => { const r = abrirTrimestre(eid); if (r && r.ok && r.criadas) console.log(`[avaliacao-td] ${eid}: ${r.criadas} tarefa(s) de avaliação abertas (${r.trimestre}º tri/${r.ano})`); });
  } catch { /* ignora */ }
}
setTimeout(rodarAvaliacaoTrimestral, 30000);
setInterval(rodarAvaliacaoTrimestral, 12 * 3600 * 1000);

// E-mail → Tarefa: lê a caixa (IMAP) e cria tarefa p/ remetentes cadastrados. Roda no boot (após 40s) e a cada 5 min.
function rodarEmailInbox() {
  try {
    const { habilitado, sincronizar, sincronizarContas } = require('./lib/emailInbox');
    const db = require('./db/connection');
    const empresas = [...new Set(db.prepare('SELECT empresa_id FROM lojas').all().map(r => r.empresa_id))];
    // Conta padrão do grupo: cria tarefas de remetentes cadastrados + encadeia threads.
    if (habilitado()) {
      empresas.forEach(eid => sincronizar(eid)
        .then(r => { if (r && r.ok && r.criadas) console.log(`[email] ${eid}: ${r.criadas} tarefa(s) de e-mail criada(s) (${r.verificados} verificados)`); })
        .catch(() => {}));
    }
    // Contas próprias dos colaboradores: a RESPOSTA que volta na caixa deles cai na mesma tarefa.
    empresas.forEach(eid => sincronizarContas(eid)
      .then(r => { if (r && r.ok && r.anexadas) console.log(`[email] ${eid}: ${r.anexadas} resposta(s) anexada(s) de ${r.contas} conta(s) própria(s)`); })
      .catch(() => {}));
  } catch { /* ignora */ }
}
setTimeout(rodarEmailInbox, 40000);
setInterval(rodarEmailInbox, 3 * 60 * 1000);

// Foto MENSAL dos indicadores de compra (ruptura/cobertura/excesso/vencendo) por comprador.
// Sobrescreve o mês corrente a cada rodada; quando o mês vira, a última foto fica congelada.
function rodarSnapshotCompras() {
  try {
    const { capturarSnapshot } = require('./lib/eficienciaCompradorErp');
    const { habilitado } = require('./db/erp');
    if (!habilitado()) return;
    const db = require('./db/connection');
    const empresas = [...new Set(db.prepare('SELECT empresa_id FROM lojas').all().map(r => r.empresa_id))];
    empresas.forEach(eid => capturarSnapshot(eid)
      .then(r => { if (r && r.ok) console.log(`[snapshot-compras] ${eid}: ${r.capturados} comprador(es) capturado(s) p/ ${r.mes}/${r.ano}`); })
      .catch(() => {}));
  } catch { /* ignora */ }
}
setTimeout(rodarSnapshotCompras, 90000);              // no boot (após 90s)
setInterval(rodarSnapshotCompras, 12 * 60 * 60 * 1000); // 2x/dia

// PONTO REP-P: apura o mês corrente sozinho (batida × escala → atraso/HE/banco/inconsistências).
function rodarApuracaoPonto() {
  try {
    const { apurarPeriodo } = require('./lib/pontorepColeta');
    const db = require('./db/connection');
    const empresas = [...new Set(db.prepare('SELECT empresa_id FROM lojas').all().map(r => r.empresa_id))];
    const hoje = new Date().toISOString().slice(0, 10);
    const ini = hoje.slice(0, 8) + '01';
    let tot = 0;
    empresas.forEach(eid => { try { const r = apurarPeriodo(eid, { dataIni: ini, dataFim: hoje }); tot += r.diasApurados || 0; } catch (e) { /* ignora */ } });
    if (tot) console.log(`[apuracao-ponto] mês corrente apurado (${tot} dia-colaborador)`);
  } catch { /* ignora */ }
}
setTimeout(rodarApuracaoPonto, 100000);              // no boot (após 100s)
setInterval(rodarApuracaoPonto, 6 * 60 * 60 * 1000);  // a cada 6h

// Varredura Colaboradores × Alpha 7: 1x/dia desativa no app quem está INATIVO no ERP (por CPF).
// Só desativa (reativar=false); quem não tem vínculo no ERP é deixado. Roda no boot (após 2 min) e a cada 24h.
function rodarSyncAlpha() {
  try {
    const { habilitado } = require('./db/erp');
    if (!habilitado()) return;
    const syncErp = require('./lib/syncColaboradoresErp');
    const db = require('./db/connection');
    const empresas = [...new Set(db.prepare('SELECT empresa_id FROM lojas').all().map(r => r.empresa_id))];
    empresas.forEach(eid => Promise.resolve(syncErp.aplicar(eid, { reativar: false }))
      .then(r => { if (r && r.desativados) console.log(`[sync-alpha] ${eid}: ${r.desativados} colaborador(es) desativado(s) (inativos no Alpha)`); })
      .catch(() => {}));
  } catch { /* ignora */ }
}
setTimeout(rodarSyncAlpha, 120000);            // no boot (após 2 min)
setInterval(rodarSyncAlpha, 24 * 60 * 60 * 1000); // 1x/dia

// Feiras: tarefa "faltam N dias — segure a compra p/ a feira" p/ compradores + Diretor. Boot (50s) + a cada 12h.
function rodarTarefasFeira() {
  try {
    const db = require('./db/connection');
    const { gerarTarefasFeira } = require('./routes/feiras');
    const empresas = [...new Set(db.prepare('SELECT empresa_id FROM lojas').all().map(r => r.empresa_id))];
    empresas.forEach(eid => { const r = gerarTarefasFeira(eid); if (r && r.criadas) console.log(`[feiras] ${eid}: ${r.criadas} tarefa(s) de feira criadas`); });
  } catch { /* ignora */ }
}
setTimeout(rodarTarefasFeira, 50000);
setInterval(rodarTarefasFeira, 12 * 3600 * 1000);

// Conversão Giro/E-commerce × ERP: 1x/dia no horário configurado (padrão 18:00) cruza os checkouts
// pendentes com as vendas do A7 (cliente por telefone/nome + mesmo produto ou variação) e registra
// as vendas na API do e-commerce. Checa a cada 5 min; se o servidor subir depois do horário, roda no mesmo dia.
function rodarConversaoEcomm() {
  try {
    const { talvezExecutar, setConfig } = require('./lib/ecommConversao');
    const db = require('./db/connection');
    const empresas = db.prepare('SELECT DISTINCT empresa_id FROM ecomm_conversao_config').all().map(r => r.empresa_id);
    empresas.forEach(eid => talvezExecutar(eid)
      .then(r => {
        if (!r) return;
        if (!r.ok) { setConfig(eid, 'ultima_execucao', ''); console.error(`[conversao-ecomm] ${eid}: ${r.motivo}`); return; }
        const s = r.resumo;
        console.log(`[conversao-ecomm] ${eid}: ${r.analisados} checkout(s) — ${s.registrada} venda(s) registrada(s), ${s.apontada} apontada(s), ${s.visita} visita(s), ${s.erro} erro(s)`);
      })
      .catch(e => { setConfig(eid, 'ultima_execucao', ''); console.error(`[conversao-ecomm] ${eid}:`, e.message); }));
  } catch { /* tabela ainda não criada (migration 204) */ }
}
setTimeout(rodarConversaoEcomm, 60000);
setInterval(rodarConversaoEcomm, 5 * 60 * 1000);

// Trade Marketing — cobrança automática (opt-in por empresa): reenvia e-mail das parcelas vencidas
// em aberto que não foram cobradas na janela configurada. Boot (90s) + 1x/dia. Só roda onde a gestão ligou.
function rodarCobrancaTrade() {
  try {
    const { rodarCobrancaAuto } = require('./lib/cobranca');
    rodarCobrancaAuto().catch(e => console.error('[cobrancaAuto]', e.message));
  } catch { /* lib ou tabela ainda não disponível */ }
}
setTimeout(rodarCobrancaTrade, 90000);
setInterval(rodarCobrancaTrade, 24 * 60 * 60 * 1000); // 1x/dia

// CRM proativo de Trade: X dias antes de cada ação, avisa as marcas vinculadas (e-mail)
function rodarOutreachTrade() {
  try {
    const { rodarOutreachAuto } = require('./lib/trade-outreach');
    rodarOutreachAuto().catch(e => console.error('[outreachAuto]', e.message));
  } catch { /* lib ou tabela ainda não disponível */ }
}
setTimeout(rodarOutreachTrade, 110000);
setInterval(rodarOutreachTrade, 24 * 60 * 60 * 1000); // 1x/dia
