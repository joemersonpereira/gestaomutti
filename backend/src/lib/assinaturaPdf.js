// Gera o PDF do documento assinado (contrato ou termo de veiculação) com pdfkit.
// Inclui: papel timbrado (cedente), o corpo do documento, o bloco de evidências (assinante, CPF, IP,
// data, aceite da MP 2.200-2/2001) e as imagens (assinatura, selfie, foto do documento).
const PDFDocument = require('pdfkit');

function imgBuf(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl || ''));
  return m ? Buffer.from(m[2], 'base64') : null;
}

// dados: { titulo, codigo, corpo, cedente:{nome,cnpj,endereco}, assinante_nome, assinante_doc, ip,
//          assinado_em, assinatura_img, selfie_img, documento_img }
// retorna Promise<Buffer>
function gerarPdfAssinado(dados) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 56 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      const ced = dados.cedente || {};
      const verde = '#0E7C5A';
      // Papel timbrado
      doc.fillColor(verde).font('Helvetica-Bold').fontSize(14).text(ced.nome || 'FARMÁCIA MUTTI LTDA');
      doc.fillColor('#555').font('Helvetica').fontSize(9)
        .text(`CNPJ ${ced.cnpj || ''}  ·  ${ced.endereco || ''}`);
      doc.moveTo(doc.x, doc.y + 4).lineTo(539, doc.y + 4).strokeColor(verde).lineWidth(2).stroke();
      doc.moveDown(1.2);
      // Corpo do contrato/termo
      doc.fillColor('#1a1a1a').font('Helvetica').fontSize(10.5).text(String(dados.corpo || ''), { align: 'justify', lineGap: 2 });
      doc.moveDown(1);
      // Bloco de evidências
      const y0 = doc.y + 6;
      doc.rect(56, y0, 483, 2).fill('#cfe7dc');
      doc.moveDown(0.6);
      doc.fillColor(verde).font('Helvetica-Bold').fontSize(11).text('EVIDÊNCIAS DA ASSINATURA ELETRÔNICA');
      doc.fillColor('#1a1a1a').font('Helvetica').fontSize(10).moveDown(0.3);
      doc.text(`Assinante: ${dados.assinante_nome || '—'}` + (dados.assinante_doc ? `  ·  CPF ${dados.assinante_doc}` : ''));
      doc.text(`Data/hora: ${(dados.assinado_em || '').replace('T', ' ').slice(0, 19)}`);
      doc.text(`Endereço IP: ${dados.ip || '—'}`);
      doc.fillColor('#0b6147').fontSize(9).text('Assinado digitalmente nos termos da MP nº 2.200-2/2001, com reconhecimento do inteiro teor do documento.');
      doc.moveDown(0.8);
      // Imagens: assinatura, selfie, documento
      const sig = imgBuf(dados.assinatura_img), self = imgBuf(dados.selfie_img), docimg = imgBuf(dados.documento_img);
      let yImg = doc.y;
      const cap = (x, t) => doc.fillColor('#555').font('Helvetica').fontSize(8).text(t, x, yImg + 92, { width: 150 });
      try {
        if (sig) { doc.image(sig, 56, yImg, { fit: [150, 80] }); cap(56, 'Assinatura'); }
        if (self) { doc.image(self, 220, yImg, { fit: [100, 80] }); cap(220, 'Selfie'); }
        if (docimg) { doc.image(docimg, 340, yImg, { fit: [150, 80] }); cap(340, 'Documento'); }
      } catch (e) { /* imagem invalida: ignora */ }
      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { gerarPdfAssinado };
