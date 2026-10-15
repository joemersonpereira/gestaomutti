// importar-rede.js — importa os relatórios da Rede que estão na pasta Downloads.
// Serve para carga histórica: o arquivo de 2 meses passa de 10 MB e não caberia no upload da tela
// (limite de 12 MB do corpo da requisição), então aqui a leitura é direta do disco.
//
//   node importar-rede.js                       → varre o Downloads
//   node importar-rede.js "C:\caminho\arq.xlsx" → um arquivo específico
const fs = require('fs');
const path = require('path');
const cc = require('./src/lib/conciliacaoCartao');
const rp = require('./src/lib/repasseCartao');

const EMPRESA = process.env.EMPRESA_ID || 'empresa-mutti-001';
const DOWNLOADS = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Downloads') : '.';
const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

(async () => {
  const alvo = process.argv[2];
  const arquivos = alvo ? [alvo] : fs.readdirSync(DOWNLOADS)
    .filter(f => /^Rede_Rel_(Vendas|Recebimentos)/i.test(f) && /\.(xlsx|xls|csv)$/i.test(f))
    .map(f => path.join(DOWNLOADS, f));

  if (!arquivos.length) { console.log('Nenhum relatório da Rede encontrado em', DOWNLOADS); process.exit(0); }
  console.log(arquivos.length, 'arquivo(s) para importar\n');

  for (const arq of arquivos) {
    const nome = path.basename(arq);
    const tamanho = (fs.statSync(arq).size / 1048576).toFixed(1);
    const ehRepasse = /Recebimentos/i.test(nome);
    console.log('──', nome, `(${tamanho} MB, ${ehRepasse ? 'repasse' : 'vendas'})`);
    const t0 = Date.now();
    try {
      const b64 = fs.readFileSync(arq).toString('base64');
      const r = ehRepasse
        ? await rp.importar(EMPRESA, { conteudoBase64: b64, nomeArquivo: nome, usuarioId: 'carga' })
        : await cc.importar(EMPRESA, { conteudoBase64: b64, nomeArquivo: nome, usuarioId: 'carga' });
      const seg = ((Date.now() - t0) / 1000).toFixed(1);
      if (!r.ok) { console.log('   ✗', r.erro, `(${seg}s)\n`); continue; }
      if (ehRepasse) {
        const s = r.resumo || {};
        console.log(`   ✅ ${r.qtdDepositos} depósitos · ${r.qtdParcelas} parcelas · ${brl(r.valorTotal)} (${seg}s)`);
        console.log(`      não fecham: ${s.naoFecham} · casadas com venda minha: ${s.parcelasConciliadas}/${s.parcelasPagas}`);
        (s.porLoja || []).forEach(l => console.log(`      ${l.nome.padEnd(24)} ${brl(l.valor)}`));
      } else {
        const s = r.resumo || {};
        console.log(`   ✅ ${r.linhas} transações · ${brl(r.valorTotal)} (${seg}s)`);
        console.log(`      casaram com o ERP: ${s.casados}/${s.linhasOperadora} (${s.pctCasado}%) · divergências: ${s.divergencias}`);
        (s.porTipo || []).forEach(t => console.log(`      ${t.rotulo.padEnd(30)} ${t.n} · ${brl(t.valor)}`));
      }
      (r.avisos || []).forEach(a => console.log('      💡', a));
      console.log('');
    } catch (e) {
      console.log('   ✗ erro:', e.message, '\n');
    }
  }
  process.exit(0);
})();
