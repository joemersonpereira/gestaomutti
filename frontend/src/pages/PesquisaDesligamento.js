import React, { useEffect, useState } from 'react';

// Página PÚBLICA — pesquisa de desligamento (exit survey). Sem login.
const MOTIVOS = [
  ['melhor_oportunidade', 'Recebi uma oportunidade melhor'], ['salario', 'Salário / benefícios'],
  ['lideranca', 'Relação com a liderança'], ['ambiente', 'Ambiente / clima de trabalho'],
  ['crescimento', 'Falta de crescimento'], ['pessoal_familia', 'Motivos pessoais / família'],
  ['mudanca', 'Mudança de cidade'], ['insatisfacao', 'Insatisfação geral'], ['saude', 'Saúde'], ['outro', 'Outro'],
];
const DIMS = [
  ['s_geral', 'Satisfação geral com a empresa'], ['s_lideranca', 'Relacionamento com a liderança'],
  ['s_ambiente', 'Ambiente e clima de trabalho'], ['s_remuneracao', 'Remuneração e benefícios'],
  ['s_crescimento', 'Oportunidades de crescimento'], ['s_reconhecimento', 'Reconhecimento pelo trabalho'],
  ['s_carga', 'Carga de trabalho / equilíbrio'], ['s_ferramentas', 'Ferramentas e condições para trabalhar'],
];

export default function PesquisaDesligamento() {
  const token = new URLSearchParams(window.location.search).get('t');
  const [info, setInfo] = useState(null);
  const [erroLink, setErroLink] = useState(false);
  const [f, setF] = useState({ motivo_saida: '', voltaria: '', enps: null, comentario: '', sugestoes: '' });
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!token) { setErroLink(true); return; }
    fetch(`/api/desligamentos/pesquisa/${encodeURIComponent(token)}`).then(r => r.ok ? r.json() : Promise.reject()).then(setInfo).catch(() => setErroLink(true));
  }, [token]);

  async function enviar() {
    setErro(''); setEnviando(true);
    try {
      const r = await fetch(`/api/desligamentos/pesquisa/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      const data = await r.json();
      if (!r.ok) { setErro(data.erro || 'Não consegui enviar.'); return; }
      setOk(true);
    } catch { setErro('Não consegui enviar. Tente de novo.'); } finally { setEnviando(false); }
  }

  const wrap = { minHeight: '100vh', background: '#f0f4f8', padding: 16, fontFamily: 'system-ui, sans-serif' };
  const card = { maxWidth: 560, margin: '24px auto', background: '#fff', borderRadius: 16, padding: 22, boxShadow: '0 4px 20px rgba(0,0,0,.06)' };
  const lbl = { fontSize: 13, fontWeight: 600, color: '#333', display: 'block', margin: '14px 0 6px' };

  if (erroLink) return <div style={wrap}><div style={card}><h2>Link inválido</h2><p style={{ color: '#777' }}>Confira o link enviado pela empresa.</p></div></div>;
  if (!info) return <div style={wrap}><div style={card}>Carregando…</div></div>;
  if (info.ja_respondida || ok) return <div style={wrap}><div style={{ ...card, textAlign: 'center' }}><div style={{ fontSize: 44 }}>💚</div><h2>Obrigado!</h2><p style={{ color: '#555', fontSize: 15 }}>Sua resposta foi registrada e ajuda a <strong>{info.empresa}</strong> a melhorar. Desejamos muito sucesso na sua jornada!</p></div></div>;

  const Escala = ({ campo }) => (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => setF({ ...f, [campo]: n })}
          style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${f[campo] === n ? '#185FA5' : '#ddd'}`, background: f[campo] === n ? '#185FA5' : '#fff', color: f[campo] === n ? '#fff' : '#666', cursor: 'pointer', fontWeight: 700 }}>{n}</button>
      ))}
    </div>
  );

  return (
    <div style={wrap}>
      <div style={card}>
        <h2 style={{ margin: '0 0 4px' }}>📋 Pesquisa de desligamento</h2>
        <p style={{ color: '#777', fontSize: 13.5, margin: 0 }}>Olá{info.nome ? `, ${String(info.nome).split(' ')[0]}` : ''}! Sua opinião é muito importante para a <strong>{info.empresa}</strong>. Responda com sinceridade — leva 2 minutos. 💚</p>

        <label style={lbl}>Qual o principal motivo da sua saída?</label>
        <select style={{ width: '100%', boxSizing: 'border-box', padding: '10px', fontSize: 14, border: '1px solid #ddd', borderRadius: 10 }} value={f.motivo_saida} onChange={e => setF({ ...f, motivo_saida: e.target.value })}>
          <option value="">Selecione…</option>
          {MOTIVOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        <div style={{ fontSize: 12, color: '#999', margin: '18px 0 2px' }}>De 1 (muito ruim) a 5 (excelente), como você avalia:</div>
        {DIMS.map(([campo, label]) => (
          <div key={campo} style={{ margin: '10px 0' }}>
            <div style={{ fontSize: 13, color: '#444', marginBottom: 5 }}>{label}</div>
            <Escala campo={campo} />
          </div>
        ))}

        <label style={lbl}>De 0 a 10, o quanto você recomendaria a empresa para um amigo trabalhar?</label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
            <button key={n} type="button" onClick={() => setF({ ...f, enps: n })}
              style={{ width: 38, padding: '8px 0', borderRadius: 8, border: `1px solid ${f.enps === n ? '#185FA5' : '#ddd'}`, background: f.enps === n ? '#185FA5' : '#fff', color: f.enps === n ? '#fff' : '#666', cursor: 'pointer', fontWeight: 700 }}>{n}</button>
          ))}
        </div>

        <label style={lbl}>Você voltaria a trabalhar na empresa no futuro?</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['sim', '👍 Sim'], ['talvez', '🤔 Talvez'], ['nao', '👎 Não']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setF({ ...f, voltaria: v })}
              style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1px solid ${f.voltaria === v ? '#185FA5' : '#ddd'}`, background: f.voltaria === v ? '#E6F1FB' : '#fff', color: f.voltaria === v ? '#185FA5' : '#666', cursor: 'pointer', fontWeight: 600 }}>{l}</button>
          ))}
        </div>

        <label style={lbl}>O que a empresa poderia ter feito melhor? (opcional)</label>
        <textarea rows={3} style={{ width: '100%', boxSizing: 'border-box', padding: 10, fontSize: 14, border: '1px solid #ddd', borderRadius: 10, resize: 'vertical' }} value={f.comentario} onChange={e => setF({ ...f, comentario: e.target.value })} />

        <label style={lbl}>Deixe uma sugestão ou recado (opcional)</label>
        <textarea rows={2} style={{ width: '100%', boxSizing: 'border-box', padding: 10, fontSize: 14, border: '1px solid #ddd', borderRadius: 10, resize: 'vertical' }} value={f.sugestoes} onChange={e => setF({ ...f, sugestoes: e.target.value })} />

        {erro && <div style={{ color: '#993C1D', fontSize: 13, margin: '10px 0' }}>{erro}</div>}
        <button onClick={enviar} disabled={enviando} style={{ width: '100%', marginTop: 14, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: enviando ? .6 : 1 }}>
          {enviando ? 'Enviando…' : 'Enviar pesquisa'}
        </button>
      </div>
    </div>
  );
}
