import React, { useEffect, useState } from 'react';

// Página PÚBLICA — o colaborador preenche os próprios dados e anexa documentos.
// URL: /autocadastro?t=<token>
export default function AutoCadastro() {
  const token = new URLSearchParams(window.location.search).get('t') || '';
  const [info, setInfo] = useState(null);
  const [erroLink, setErroLink] = useState(false);
  const [f, setF] = useState({ nome: '', cpf: '', rg: '', nascimento: '', telefone: '', email: '', endereco: '', apelido: '', foto: null,
    contato_emergencia_nome: '', contato_emergencia_telefone: '', cep: '', endereco_numero: '', complemento: '', bairro: '', cidade: '', uf: '',
    num_calcado: '', tam_blusa: '', tam_calca: '', tam_jaleco: '', bio: '', presente_favorito: '', cores_favoritas: '', estilo_musical: '', hobbies: '', time_coracao: '',
    dependentes: [], lgpd: false });
  const [novoDep, setNovoDep] = useState(null);
  const [docs, setDocs] = useState([]); // {nome, mime, dados}
  async function buscarCep(v) { const num = String(v).replace(/\D/g, ''); if (num.length !== 8) return; try { const r = await fetch(`https://viacep.com.br/ws/${num}/json/`); const d = await r.json(); if (!d.erro) setF(x => ({ ...x, endereco: d.logradouro || x.endereco, bairro: d.bairro || x.bairro, cidade: d.localidade || x.cidade, uf: d.uf || x.uf })); } catch { /* ignora */ } }
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!token) { setErroLink(true); return; }
    fetch(`/api/autocadastro/publico/${encodeURIComponent(token)}`).then(r => r.ok ? r.json() : Promise.reject()).then(setInfo).catch(() => setErroLink(true));
  }, [token]);

  const mascaraCpf = v => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  const lerArq = file => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  async function anexar(e, tipo) {
    const arqs = [...e.target.files];
    for (const file of arqs) {
      if (file.size > 8_000_000) { setErro(`${file.name} é muito grande (máx 8MB).`); continue; }
      const dados = await lerArq(file);
      setDocs(d => [...d, { tipo, nome: file.name, mime: file.type, dados }]);
    }
    e.target.value = '';
  }
  async function enviar() {
    setErro('');
    if (!f.nome.trim()) { setErro('Informe seu nome completo.'); return; }
    if (f.cpf.replace(/\D/g, '').length !== 11) { setErro('Informe um CPF válido.'); return; }
    setEnviando(true);
    try {
      const r = await fetch(`/api/autocadastro/publico/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, cpf: f.cpf.replace(/\D/g, ''), documentos: docs }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(data.erro || 'Não consegui enviar.'); return; }
      setOk(true);
    } catch { setErro('Não consegui enviar. Tente de novo.'); }
    finally { setEnviando(false); }
  }

  const wrap = { minHeight: '100vh', background: 'linear-gradient(160deg,#185FA5,#0E3E6E)', padding: 20, fontFamily: 'system-ui, sans-serif', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' };
  const card = { background: '#fff', borderRadius: 18, padding: '26px 22px', width: '100%', maxWidth: 460, boxShadow: '0 12px 40px rgba(0,0,0,.25)', margin: '20px 0' };
  const inp = { width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 10, padding: '10px 12px', fontSize: 14, marginBottom: 10, fontFamily: 'inherit' };
  const lbl = { fontSize: 11, color: '#888', display: 'block', marginBottom: 2 };

  if (erroLink) return <div style={wrap}><div style={card}><div style={{ fontSize: 40, textAlign: 'center' }}>🔗</div><h2 style={{ textAlign: 'center' }}>Link inválido</h2><p style={{ color: '#666', textAlign: 'center' }}>Peça um novo link ao RH.</p></div></div>;
  if (!info) return <div style={wrap}><div style={card}>Carregando…</div></div>;
  if (ok || info.ja_enviado) return (
    <div style={wrap}><div style={{ ...card, textAlign: 'center' }}>
      <div style={{ fontSize: 60 }}>✅</div>
      <h2 style={{ color: '#185FA5' }}>Cadastro enviado!</h2>
      <p style={{ color: '#555', fontSize: 15 }}>Obrigado! O RH da <strong>{info.empresa}</strong> vai conferir seus dados e documentos. 💚</p>
    </div></div>
  );

  return (
    <div style={wrap}><div style={card}>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 34 }}>🧾</div>
        <h2 style={{ color: '#185FA5', margin: '4px 0 2px' }}>Seu cadastro — {info.empresa}</h2>
        <p style={{ color: '#777', fontSize: 13, margin: 0 }}>Preencha seus dados e anexe seus documentos. É rápido!</p>
      </div>

      <label style={lbl}>Nome completo *</label>
      <input style={inp} value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Seu nome completo" />
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}><label style={lbl}>CPF *</label><input style={inp} value={f.cpf} onChange={e => setF({ ...f, cpf: mascaraCpf(e.target.value) })} inputMode="numeric" placeholder="000.000.000-00" /></div>
        <div style={{ flex: 1 }}><label style={lbl}>RG</label><input style={inp} value={f.rg} onChange={e => setF({ ...f, rg: e.target.value })} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}><label style={lbl}>Nascimento</label><input style={inp} type="date" value={f.nascimento} onChange={e => setF({ ...f, nascimento: e.target.value })} /></div>
        <div style={{ flex: 1 }}><label style={lbl}>Telefone</label><input style={inp} value={f.telefone} onChange={e => setF({ ...f, telefone: e.target.value })} placeholder="(00) 00000-0000" /></div>
      </div>
      <label style={lbl}>E-mail</label>
      <input style={inp} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="seu@email.com" inputMode="email" />
      <label style={lbl}>Foto (rosto, sorrindo 😊)</label>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        {f.foto ? <img src={f.foto} alt="" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#EAF3FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>👤</div>}
        <label style={{ fontSize: 13, color: '#185FA5', cursor: 'pointer', fontWeight: 600 }}>📷 {f.foto ? 'trocar' : 'colocar foto'}<input type="file" accept="image/*" onChange={async e => { const file = e.target.files[0]; if (file) setF({ ...f, foto: await lerArq(file) }); }} style={{ display: 'none' }} /></label>
      </div>
      <div style={{ fontSize: 11, color: '#7A5AA8', background: '#F6F2FB', borderRadius: 8, padding: '6px 9px', marginBottom: 8 }}>Usada em ações internas (mural da equipe, datas comemorativas).</div>

      <label style={lbl}>Como gostaria de ser chamado</label>
      <input style={inp} value={f.apelido} onChange={e => setF({ ...f, apelido: e.target.value })} placeholder="Apelido" />

      <label style={lbl}>Endereço</label>
      <input style={{ ...inp, maxWidth: 160 }} value={f.cep} onChange={e => { setF({ ...f, cep: e.target.value }); buscarCep(e.target.value); }} placeholder="CEP" inputMode="numeric" />
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ ...inp, flex: 2 }} value={f.endereco} onChange={e => setF({ ...f, endereco: e.target.value })} placeholder="Rua" />
        <input style={{ ...inp, flex: 0.5 }} value={f.endereco_numero} onChange={e => setF({ ...f, endereco_numero: e.target.value })} placeholder="Nº" />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={inp} value={f.complemento} onChange={e => setF({ ...f, complemento: e.target.value })} placeholder="Complemento" />
        <input style={inp} value={f.bairro} onChange={e => setF({ ...f, bairro: e.target.value })} placeholder="Bairro" />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ ...inp, flex: 2 }} value={f.cidade} onChange={e => setF({ ...f, cidade: e.target.value })} placeholder="Cidade" />
        <input style={{ ...inp, flex: 0.5 }} maxLength={2} value={f.uf} onChange={e => setF({ ...f, uf: e.target.value.toUpperCase() })} placeholder="UF" />
      </div>

      <label style={lbl}>Contato de emergência</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={inp} value={f.contato_emergencia_nome} onChange={e => setF({ ...f, contato_emergencia_nome: e.target.value })} placeholder="Nome" />
        <input style={inp} value={f.contato_emergencia_telefone} onChange={e => setF({ ...f, contato_emergencia_telefone: e.target.value })} placeholder="Telefone" />
      </div>

      <label style={lbl}>Tamanhos de fardamento</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ ...inp, flex: 1, minWidth: 70 }} value={f.num_calcado} onChange={e => setF({ ...f, num_calcado: e.target.value })} placeholder="Calçado" />
        <input style={{ ...inp, flex: 1, minWidth: 70 }} value={f.tam_blusa} onChange={e => setF({ ...f, tam_blusa: e.target.value })} placeholder="Blusa" />
        <input style={{ ...inp, flex: 1, minWidth: 70 }} value={f.tam_calca} onChange={e => setF({ ...f, tam_calca: e.target.value })} placeholder="Calça" />
        <input style={{ ...inp, flex: 1, minWidth: 70 }} value={f.tam_jaleco} onChange={e => setF({ ...f, tam_jaleco: e.target.value })} placeholder="Jaleco" />
      </div>

      <label style={lbl}>Sobre você (aparece no mural da equipe)</label>
      <input style={inp} value={f.bio} onChange={e => setF({ ...f, bio: e.target.value })} placeholder="Uma frase sobre você 💬" />
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={inp} value={f.presente_favorito} onChange={e => setF({ ...f, presente_favorito: e.target.value })} placeholder="🎁 Presente favorito" />
        <input style={inp} value={f.estilo_musical} onChange={e => setF({ ...f, estilo_musical: e.target.value })} placeholder="🎵 Estilo musical" />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={inp} value={f.cores_favoritas} onChange={e => setF({ ...f, cores_favoritas: e.target.value })} placeholder="🎨 Cores favoritas" />
        <input style={inp} value={f.time_coracao} onChange={e => setF({ ...f, time_coracao: e.target.value })} placeholder="⚽ Time do coração" />
      </div>

      <label style={lbl}>Família e pets 🧒🐶🐱</label>
      {f.dependentes.map((dep, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, background: '#f5f7fa', borderRadius: 8, padding: '6px 10px', marginBottom: 4 }}>
          <span>{dep.tipo === 'pet' ? '🐾' : '🧒'} {dep.apelido || dep.nome} · {dep.tipo === 'pet' ? (dep.especie || 'pet') : 'filho(a)'}{dep.nascimento ? ` · ${dep.nascimento.split('-').reverse().join('/')}` : ''}</span>
          <button onClick={() => setF({ ...f, dependentes: f.dependentes.filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', color: '#993C1D', cursor: 'pointer' }}>✕</button>
        </div>
      ))}
      {novoDep ? (
        <div style={{ background: '#FAFAFB', borderRadius: 10, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {[['filho', '🧒 Filho(a)'], ['pet', '🐾 Pet']].map(([v, l]) => <button key={v} onClick={() => setNovoDep({ ...novoDep, tipo: v })} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 16, cursor: 'pointer', border: `1px solid ${novoDep.tipo === v ? '#185FA5' : '#ddd'}`, background: novoDep.tipo === v ? '#E6F1FB' : '#fff', color: novoDep.tipo === v ? '#185FA5' : '#888', fontWeight: 600 }}>{l}</button>)}
            {novoDep.tipo === 'pet' && <select value={novoDep.especie} onChange={e => setNovoDep({ ...novoDep, especie: e.target.value })} style={{ ...inp, width: 'auto', marginBottom: 0 }}>{[['cachorro', '🐶 Cachorro'], ['gato', '🐱 Gato'], ['outro', '🐾 Outro']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}><input style={inp} value={novoDep.nome} onChange={e => setNovoDep({ ...novoDep, nome: e.target.value })} placeholder="Nome" /><input style={inp} value={novoDep.apelido} onChange={e => setNovoDep({ ...novoDep, apelido: e.target.value })} placeholder="Apelido" /></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ flex: 1 }}><label style={lbl}>Nascimento</label><input type="date" style={inp} value={novoDep.nascimento} onChange={e => setNovoDep({ ...novoDep, nascimento: e.target.value })} /></div>
            {novoDep.foto && <img src={novoDep.foto} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />}
            <label style={{ fontSize: 12, color: '#185FA5', cursor: 'pointer', fontWeight: 600 }}>📷 foto<input type="file" accept="image/*" onChange={async e => { const file = e.target.files[0]; if (file) setNovoDep({ ...novoDep, foto: await lerArq(file) }); }} style={{ display: 'none' }} /></label>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button onClick={() => { if (String(novoDep.nome || '').trim()) { setF({ ...f, dependentes: [...f.dependentes, novoDep] }); setNovoDep(null); } }} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}>Adicionar</button>
            <button onClick={() => setNovoDep(null)} style={{ background: '#eee', color: '#666', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      ) : <button onClick={() => setNovoDep({ tipo: 'filho', especie: 'cachorro', nome: '', apelido: '', nascimento: '', foto: null })} style={{ fontSize: 12, color: '#185FA5', background: '#EAF3FB', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, marginBottom: 8 }}>+ filho ou pet</button>}

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#444', background: '#F6F9FC', borderRadius: 8, padding: '10px 12px', margin: '8px 0' }}>
        <input type="checkbox" checked={f.lgpd} onChange={e => setF({ ...f, lgpd: e.target.checked })} style={{ marginTop: 2 }} />
        <span>Autorizo o compartilhamento interno dos meus dados e dos meus dependentes (nome, foto, datas) para ações internas (mural da equipe e datas comemorativas), conforme a <strong>LGPD</strong>.</span>
      </label>

      <label style={lbl}>Documentos (anexe foto ou PDF de cada um)</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {['CPF', 'RG', 'Comprovante de residência', 'Certidão de casamento', 'Certidão de nascimento (filho)', 'Carteira de trabalho', 'Título de eleitor', 'Foto 3x4', 'Outro'].map(t => {
          const tem = docs.filter(d => d.tipo === t).length;
          return (
            <label key={t} style={{ fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 16, cursor: 'pointer', border: `1px solid ${tem ? '#3B6D11' : '#bcd'}`, background: tem ? '#EAF3DE' : '#fff', color: tem ? '#3B6D11' : '#185FA5' }}>
              {tem ? '✓ ' : '📎 '}{t}{tem > 1 ? ` (${tem})` : ''}
              <input type="file" accept="image/*,application/pdf" onChange={e => anexar(e, t)} style={{ display: 'none' }} />
            </label>
          );
        })}
      </div>
      {docs.map((d, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, background: '#f5f7fa', borderRadius: 8, padding: '6px 10px', marginBottom: 4 }}>
          <span>📄 <strong>{d.tipo || 'Documento'}</strong> · {d.nome}</span><button onClick={() => setDocs(docs.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#993C1D', cursor: 'pointer' }}>✕</button>
        </div>
      ))}

      {erro && <div style={{ color: '#993C1D', fontSize: 13, margin: '8px 0' }}>{erro}</div>}
      <button onClick={enviar} disabled={enviando} style={{ width: '100%', marginTop: 10, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: enviando ? 0.6 : 1 }}>
        {enviando ? 'Enviando…' : 'Enviar cadastro'}
      </button>
    </div></div>
  );
}
