import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const TIPO_CERT = { conquista: '🏆', reconhecimento: '⭐', desenvolvimento: '📚' };

export default function MeuRH() {
  const { API } = useAuth();
  const [d, setD] = useState(null);
  const [aba, setAba] = useState('geral');
  const carregar = useCallback(() => { API.get('/meu-rh').then(r => setD(r.data)).catch(() => setD(false)); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  async function darCiencia(movId) {
    try { await API.post(`/colaboradores/${d.colaborador.id}/movimentacoes/${movId}/ciencia`); carregar(); } catch (e) { /* ignore */ }
  }
  if (d === null) return <div style={s.load}>Carregando…</div>;
  if (d === false) return <div style={s.card}>Não foi possível carregar.</div>;
  const { resumo, colaborador } = d;

  return (
    <div style={s.wrap}>
      <Banner emoji="👤" titulo="Meu RH" cor="azul" />
      <div style={s.sub}>{colaborador.nome} · {colaborador.funcao_nome} · {colaborador.loja_nome}</div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {[['geral', '📊 Visão geral'], ['ponto', '🕐 Meu Ponto'], ['documentos', '📄 Documentos'], ['dados', '👤 Meus dados'], ['beneficios', '🎁 Benefícios'], ['clima', '💬 Clima'], ['avaliacao', '🏅 Avaliação'], ['ferias', '🌴 Férias'], ['folgas', '🌙 Folgas'], ['atestado', '🩺 Atestado']].map(([v, l]) => (
          <button key={v} onClick={() => setAba(v)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 20, border: '1px solid ' + (aba === v ? '#111' : '#ddd'), background: aba === v ? '#111' : '#fff', color: aba === v ? '#fff' : '#666', cursor: 'pointer' }}>{l}</button>
        ))}
      </div>

      {aba === 'documentos' && <MeusDocumentosInline API={API} />}
      {aba === 'dados' && <MeusDadosInline API={API} />}
      {aba === 'beneficios' && <MeusBeneficiosInline API={API} />}
      {aba === 'clima' && <ClimaInline API={API} />}
      {aba === 'avaliacao' && <AvaliacaoInline API={API} />}
      {aba === 'ferias' && <MinhasFeriasInline API={API} />}
      {aba === 'folgas' && <MinhasFolgasInline API={API} />}
      {aba === 'atestado' && <MeusAtestadosInline API={API} />}
      {aba === 'ponto' && <MeuPontoInline API={API} />}

      {aba === 'geral' && (<>
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#666' }}>Pontuação atual</span>
          <span style={{ fontSize: 32, fontWeight: 800, color: resumo.pontuacao >= 80 ? '#3B6D11' : resumo.pontuacao >= 60 ? '#BA7517' : '#993C1D' }}>{resumo.pontuacao}<span style={{ fontSize: 14, color: '#999' }}>/100</span></span>
        </div>
      </div>
      <div style={s.metrics}>
        <M v={resumo.certificados} l="Certificados" c="#856404" />
        <M v={'+' + resumo.pontos_certificados} l="Pts ganhos" c="#3B6D11" />
        <M v={'-' + resumo.pontos_deduzidos} l="Pts perdidos" c="#993C1D" />
        <M v={resumo.tarefas_abertas} l="Tarefas" c="#185FA5" />
        <M v={resumo.ocorrencias_pendentes} l="Ocorr. pend." c={resumo.ocorrencias_pendentes ? '#993C1D' : '#3B6D11'} />
      </div>

      {d.comercial && (
        <Sec t="🛒 Desempenho comercial">
          <Row k="Vendido no mês" v={'R$ ' + Number(d.comercial.vendido).toLocaleString('pt-BR')} />
          <Row k="Indicadores avaliados" v={d.comercial.indicadores_avaliados} />
        </Sec>
      )}

      <Sec t={`⭐ Certificados (${d.certificados.length})`}>
        {d.certificados.length === 0 && <Vazio t="Nenhum certificado ainda." />}
        {d.certificados.map(c => (
          <div key={c.id} style={s.item}>
            <span style={{ fontSize: 18 }}>{TIPO_CERT[c.tipo] || '🎖️'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{c.titulo}</div>
              <div style={{ fontSize: 10, color: '#999' }}>{c.tipo}{c.fonte && c.fonte !== 'manual' ? ' · automática' : ''}{c.validado ? '' : ' · aguardando validação'}</div>
            </div>
            {c.pontos > 0 && <span style={s.tag}>+{c.pontos}</span>}
          </div>
        ))}
      </Sec>

      <Sec t={`📋 Tarefas atribuídas (${d.tarefas.length})`}>
        {d.tarefas.length === 0 && <Vazio t="Sem tarefas abertas. 🎉" />}
        {d.tarefas.map(t => (
          <div key={t.id} style={s.item}>
            {t.urgente ? <span style={{ color: '#993C1D' }}>🔴</span> : <span>⚪</span>}
            <div style={{ flex: 1, fontSize: 12 }}>{t.titulo}</div>
            <span style={{ fontSize: 10, color: '#999' }}>{t.prazo ? new Date(t.prazo.replace(' ', 'T')).toLocaleDateString('pt-BR') : ''}</span>
          </div>
        ))}
      </Sec>

      <Sec t={`⚖️ Ocorrências (${d.ocorrencias.length})`}>
        {d.ocorrencias.length === 0 && <Vazio t="Nenhuma ocorrência. 👏" />}
        {d.ocorrencias.map(o => (
          <div key={o.id} style={s.item}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12 }}>{o.tipo}</div>
              <div style={{ fontSize: 10, color: '#999' }}>{o.data_ocorrencia} · {o.status}</div>
            </div>
            {o.pontos_deduzidos > 0 && <span style={{ ...s.tag, background: '#FCEBEB', color: '#993C1D' }}>-{o.pontos_deduzidos}</span>}
          </div>
        ))}
      </Sec>

      {d.movimentacoes.length > 0 && (
        <Sec t={`🔄 Movimentações (${d.movimentacoes.length})`}>
          {d.movimentacoes.map(m => (
            <div key={m.id} style={s.item}>
              <div style={{ flex: 1, fontSize: 12 }}>{m.tipo} {m.origem ? `· ${m.origem} → ${m.destino || ''}` : ''}</div>
              {m.status === 'confirmado'
                ? <span style={{ fontSize: 10, color: '#3B6D11' }}>confirmado</span>
                : <button onClick={() => darCiencia(m.id)} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', border: '1px solid #185FA5', color: '#185FA5', background: 'none', borderRadius: 8, cursor: 'pointer' }}>Dar ciência</button>}
            </div>
          ))}
        </Sec>
      )}
      <MinhasAvaliacoesSetor API={API} />
      </>)}
    </div>
  );
}

// 📄 Meus documentos (holerites/informes) dentro do Meu RH
function MeusDocumentosInline({ API }) {
  const [docs, setDocs] = useState([]);
  const [aberto, setAberto] = useState(null);
  const [url, setUrl] = useState(null);
  const [vistos, setVistos] = useState({});
  const carregar = useCallback(() => API.get('/documentos/meus').then(r => setDocs(r.data.documentos || [])).catch(() => setDocs([])), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  async function ver(dc) {
    if (aberto === dc.id) { setAberto(null); if (url) URL.revokeObjectURL(url); setUrl(null); return; }
    const r = await API.get(`/documentos/${dc.id}/arquivo`, { responseType: 'blob' });
    if (url) URL.revokeObjectURL(url);
    setUrl(URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }))); setAberto(dc.id); setVistos(v => ({ ...v, [dc.id]: true }));
  }
  async function ciente(dc) { await API.post(`/documentos/${dc.id}/ciente`, {}); carregar(); }
  if (!docs.length) return <div style={s.card}>Nenhum documento disponível ainda.</div>;
  return docs.map(dc => (
    <div key={dc.id} style={{ ...s.card, borderLeft: '3px solid ' + (dc.status === 'ciente' ? '#3B6D11' : '#BA7517') }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{dc.titulo}</div><div style={{ fontSize: 11, color: '#999' }}>{dc.competencia} · {dc.paginas} pág.</div></div>
        <span style={{ fontSize: 11, fontWeight: 700, color: dc.status === 'ciente' ? '#3B6D11' : '#8A6D1D' }}>{dc.status === 'ciente' ? '✓ Ciente' : 'Pendente'}</span>
        <button onClick={() => ver(dc)} style={sBtn('#fff', '#185FA5')}>{aberto === dc.id ? 'Fechar' : '👁 Ver'}</button>
        {dc.status === 'pendente' && <button onClick={() => ciente(dc)} disabled={!vistos[dc.id]} style={{ ...sBtn('#111', '#fff'), opacity: vistos[dc.id] ? 1 : 0.5 }}>Estou ciente</button>}
      </div>
      {aberto === dc.id && url && <iframe title="doc" src={url} style={{ width: '100%', height: '65vh', border: '1px solid #eee', borderRadius: 8, marginTop: 10 }} />}
    </div>
  ));
}

// 👤 Meus dados (ver + atualizar contato + anexar documentos)
function MeusDadosInline({ API }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState({});
  const [novoDep, setNovoDep] = useState(null);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/meu-rh/dados').then(r => {
    setD(r.data);
    setF({ telefone: r.data.telefone || '', email: r.data.email || '', nascimento: (r.data.nascimento || '').slice(0, 10), apelido: r.data.apelido || '',
      contato_emergencia_nome: r.data.contato_emergencia_nome || '', contato_emergencia_telefone: r.data.contato_emergencia_telefone || '',
      cep: r.data.cep || '', endereco: r.data.endereco || '', endereco_numero: r.data.endereco_numero || '', complemento: r.data.complemento || '', bairro: r.data.bairro || '', cidade: r.data.cidade || '', uf: r.data.uf || '',
      num_calcado: r.data.num_calcado || '', tam_blusa: r.data.tam_blusa || '', tam_calca: r.data.tam_calca || '', tam_jaleco: r.data.tam_jaleco || '', foto: undefined });
  }), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const lerArq = file => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  async function salvar() { await API.patch('/meu-rh/dados', f); setMsg('✅ Dados atualizados.'); setTimeout(() => setMsg(''), 2500); carregar(); }
  async function anexar(e) { const file = e.target.files[0]; if (!file) return; if (file.size > 8_000_000) { setMsg('Arquivo muito grande.'); return; } await API.post('/meu-rh/dados/docs', { nome: file.name, mime: file.type, dados: await lerArq(file) }); e.target.value = ''; carregar(); }
  async function buscarCep(v) { const num = String(v).replace(/\D/g, ''); if (num.length !== 8) return; try { const r = await API.get(`/colaboradores/cep/${num}`); setF(x => ({ ...x, endereco: r.data.endereco || x.endereco, bairro: r.data.bairro || x.bairro, cidade: r.data.cidade || x.cidade, uf: r.data.uf || x.uf })); } catch { /* ignora */ } }
  async function addDep() { if (!String(novoDep.nome || '').trim()) return; await API.post('/meu-rh/dados/dependentes', novoDep); setNovoDep(null); carregar(); }
  async function rmDep(id) { await API.delete(`/meu-rh/dados/dependentes/${id}`); carregar(); }
  async function consentir() { await API.post('/meu-rh/dados/lgpd'); setMsg('✅ Consentimento registrado. Termo em Meus Documentos.'); carregar(); }
  if (!d) return <div style={s.card}>Carregando…</div>;
  const inp = { width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginBottom: 8 };
  const sec = t => <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: .4, margin: '12px 0 6px' }}>{t}</div>;
  const ico = dep => dep.tipo === 'pet' ? (dep.especie === 'gato' ? '🐱' : dep.especie === 'cachorro' ? '🐶' : '🐾') : '🧒';
  return (
    <div style={s.card}>
      <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>Nome <strong style={{ color: '#333' }}>{d.nome}</strong> · CPF <strong style={{ color: '#333' }}>{d.cpf}</strong> · {d.funcao} · {d.loja}{d.admissao ? ` · desde ${String(d.admissao).slice(0, 10).split('-').reverse().join('/')}` : ''}</div>

      {sec('Foto e identificação')}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        {(f.foto || d.tem_foto) ? <img src={f.foto || `/api/mural/foto/${d.id}`} alt="" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: '2px solid #eee' }} /> : <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#EAF3FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>👤</div>}
        <label style={{ fontSize: 12, color: '#185FA5', cursor: 'pointer', fontWeight: 600 }}>📷 {f.foto || d.tem_foto ? 'trocar foto' : 'colocar foto'}<input type="file" accept="image/*" onChange={async e => { const file = e.target.files[0]; if (file) setF({ ...f, foto: await lerArq(file) }); }} style={{ display: 'none' }} /></label>
      </div>
      <div style={{ fontSize: 11, color: '#7A5AA8', background: '#F6F2FB', borderRadius: 8, padding: '6px 9px', marginBottom: 8 }}>📸 Foto de rosto, sorrindo 😊 — usada em ações internas (Comunidade, datas comemorativas).</div>
      <input style={inp} placeholder="Como gostaria de ser chamado (apelido)" value={f.apelido} onChange={e => setF({ ...f, apelido: e.target.value })} />

      {sec('Contato')}
      <div style={{ display: 'flex', gap: 8 }}><input style={inp} placeholder="Telefone" value={f.telefone} onChange={e => setF({ ...f, telefone: e.target.value })} /><input style={inp} placeholder="E-mail" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
      <label style={{ fontSize: 11, color: '#888' }}>Data de nascimento</label><input type="date" style={inp} value={f.nascimento} onChange={e => setF({ ...f, nascimento: e.target.value })} />
      <div style={{ display: 'flex', gap: 8 }}><input style={inp} placeholder="Contato de emergência (nome)" value={f.contato_emergencia_nome} onChange={e => setF({ ...f, contato_emergencia_nome: e.target.value })} /><input style={inp} placeholder="Telefone de emergência" value={f.contato_emergencia_telefone} onChange={e => setF({ ...f, contato_emergencia_telefone: e.target.value })} /></div>

      {sec('Endereço')}
      <input style={{ ...inp, maxWidth: 160 }} placeholder="CEP" value={f.cep} onChange={e => { setF({ ...f, cep: e.target.value }); buscarCep(e.target.value); }} />
      <div style={{ display: 'flex', gap: 8 }}><input style={{ ...inp, flex: 2 }} placeholder="Rua" value={f.endereco} onChange={e => setF({ ...f, endereco: e.target.value })} /><input style={{ ...inp, flex: 0.5 }} placeholder="Nº" value={f.endereco_numero} onChange={e => setF({ ...f, endereco_numero: e.target.value })} /></div>
      <div style={{ display: 'flex', gap: 8 }}><input style={inp} placeholder="Complemento" value={f.complemento} onChange={e => setF({ ...f, complemento: e.target.value })} /><input style={inp} placeholder="Bairro" value={f.bairro} onChange={e => setF({ ...f, bairro: e.target.value })} /></div>
      <div style={{ display: 'flex', gap: 8 }}><input style={{ ...inp, flex: 2 }} placeholder="Cidade" value={f.cidade} onChange={e => setF({ ...f, cidade: e.target.value })} /><input style={{ ...inp, flex: 0.5 }} placeholder="UF" maxLength={2} value={f.uf} onChange={e => setF({ ...f, uf: e.target.value.toUpperCase() })} /></div>

      {sec('Fardamento (tamanhos)')}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ ...inp, flex: 1, minWidth: 80 }} placeholder="Calçado" value={f.num_calcado} onChange={e => setF({ ...f, num_calcado: e.target.value })} />
        <input style={{ ...inp, flex: 1, minWidth: 80 }} placeholder="Blusa" value={f.tam_blusa} onChange={e => setF({ ...f, tam_blusa: e.target.value })} />
        <input style={{ ...inp, flex: 1, minWidth: 80 }} placeholder="Calça" value={f.tam_calca} onChange={e => setF({ ...f, tam_calca: e.target.value })} />
        <input style={{ ...inp, flex: 1, minWidth: 80 }} placeholder="Jaleco" value={f.tam_jaleco} onChange={e => setF({ ...f, tam_jaleco: e.target.value })} />
      </div>
      {msg && <div style={{ fontSize: 12, color: '#3B6D11', margin: '4px 0 6px' }}>{msg}</div>}
      <button onClick={salvar} style={sBtn('#111', '#fff')}>Salvar meus dados</button>

      {sec('Minha família e pets')}
      {(d.dependentes || []).map(dep => (
        <div key={dep.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
          {dep.tem_foto ? <img src={`/api/colaboradores/dependente/${dep.id}/foto`} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#F3F0FB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ico(dep)}</div>}
          <div style={{ flex: 1, fontSize: 13 }}>{ico(dep)} {dep.apelido || dep.nome} <span style={{ fontSize: 11, color: '#999' }}>· {dep.tipo === 'pet' ? (dep.especie || 'pet') : 'filho(a)'}{dep.nascimento ? ` · ${String(dep.nascimento).slice(0, 10).split('-').reverse().join('/')}` : ''}</span></div>
          <button onClick={() => rmDep(dep.id)} style={{ fontSize: 12, color: '#993C1D', background: 'none', border: 'none', cursor: 'pointer' }}>remover</button>
        </div>
      ))}
      {novoDep ? (
        <div style={{ background: '#FAFAFB', borderRadius: 10, padding: 10, marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {[['filho', '🧒 Filho(a)'], ['pet', '🐾 Pet']].map(([v, l]) => <button key={v} onClick={() => setNovoDep({ ...novoDep, tipo: v })} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 16, cursor: 'pointer', border: `1px solid ${novoDep.tipo === v ? '#185FA5' : '#ddd'}`, background: novoDep.tipo === v ? '#E6F1FB' : '#fff', color: novoDep.tipo === v ? '#185FA5' : '#888', fontWeight: 600 }}>{l}</button>)}
            {novoDep.tipo === 'pet' && <select value={novoDep.especie} onChange={e => setNovoDep({ ...novoDep, especie: e.target.value })} style={{ ...inp, width: 'auto', marginBottom: 0 }}>{[['cachorro', '🐶 Cachorro'], ['gato', '🐱 Gato'], ['outro', '🐾 Outro']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}><input style={inp} placeholder="Nome" value={novoDep.nome} onChange={e => setNovoDep({ ...novoDep, nome: e.target.value })} /><input style={inp} placeholder="Apelido" value={novoDep.apelido} onChange={e => setNovoDep({ ...novoDep, apelido: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: '#999' }}>Nascimento</label><input type="date" style={inp} value={novoDep.nascimento} onChange={e => setNovoDep({ ...novoDep, nascimento: e.target.value })} /></div>
            {novoDep.foto && <img src={novoDep.foto} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />}
            <label style={{ fontSize: 11, color: '#185FA5', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>📷 foto<input type="file" accept="image/*" onChange={async e => { const file = e.target.files[0]; if (file) setNovoDep({ ...novoDep, foto: await lerArq(file) }); }} style={{ display: 'none' }} /></label>
          </div>
          <div style={{ fontSize: 11, color: '#7A5AA8', margin: '2px 0 8px' }}>📸 Foto sorrindo 😊 — usada nas datas comemorativas.</div>
          <div style={{ display: 'flex', gap: 6 }}><button onClick={addDep} style={sBtn('#185FA5', '#fff')}>Adicionar</button><button onClick={() => setNovoDep(null)} style={sBtn('#eee', '#666')}>Cancelar</button></div>
        </div>
      ) : <button onClick={() => setNovoDep({ tipo: 'filho', especie: 'cachorro', nome: '', apelido: '', nascimento: '', foto: null })} style={{ fontSize: 12, color: '#185FA5', background: '#EAF3FB', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, marginTop: 6 }}>+ filho ou pet</button>}

      {sec('Consentimento (LGPD)')}
      {d.lgpd_consentido
        ? <div style={{ fontSize: 12, color: '#3B6D11', background: '#E7F1DC', borderRadius: 8, padding: '8px 10px' }}>✅ Você autorizou o compartilhamento{d.lgpd_consentido_em ? ` em ${String(d.lgpd_consentido_em).slice(0, 10).split('-').reverse().join('/')}` : ''}. O termo está em Meus Documentos.</div>
        : <div style={{ fontSize: 12, color: '#444', background: '#F6F9FC', borderRadius: 8, padding: '10px 12px' }}>
            Autorizo o compartilhamento interno dos meus dados e dos meus dependentes (nome, foto, datas) para ações internas (Comunidade e datas comemorativas), conforme a LGPD.
            <div style={{ marginTop: 8 }}><button onClick={consentir} style={sBtn('#185FA5', '#fff')}>Autorizo e assino</button></div>
          </div>}

      <div style={{ borderTop: '1px solid #eee', marginTop: 14, paddingTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Meus documentos</div>
        <label style={{ display: 'inline-block', fontSize: 12, color: '#185FA5', cursor: 'pointer', marginBottom: 6 }}>📎 Anexar documento<input type="file" accept="image/*,application/pdf" onChange={anexar} style={{ display: 'none' }} /></label>
        {d.documentos.map(doc => (
          <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, background: '#f5f7fa', borderRadius: 8, padding: '6px 10px', marginBottom: 4 }}>
            <a href={`/api/meu-rh/dados/docs/${doc.id}`} target="_blank" rel="noreferrer" style={{ color: '#185FA5', textDecoration: 'none' }}>📄 {doc.nome}</a>
            <button onClick={() => API.delete(`/meu-rh/dados/docs/${doc.id}`).then(carregar)} style={{ background: 'none', border: 'none', color: '#993C1D', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// 🎁 Meus benefícios
const BTIPO = { vale_pontos: '🏅 Vale-pontos', brinde: '🎁 Brinde', day_off: '🌴 Day off', vale_compras: '🛍️ Vale-compras', outro: '🎗️ Outro' };
const BST = { a_receber: { l: 'A receber', c: '#8A6D1D', bg: '#FBF3DA' }, entregue: { l: 'Entregue', c: '#185FA5', bg: '#E4EEF8' }, usado: { l: 'Usado', c: '#3B6D11', bg: '#E7F1DC' }, cancelado: { l: 'Cancelado', c: '#993C1D', bg: '#F5E2DB' } };
function MeusBeneficiosInline({ API }) {
  const [b, setB] = useState(null);
  const [saldo, setSaldo] = useState(null);
  useEffect(() => {
    API.get('/beneficios/meus').then(r => setB(r.data.beneficios || [])).catch(() => setB([]));
    API.get('/pontos/saldo').then(r => setSaldo(r.data.saldo)).catch(() => {});
  }, [API]);
  if (!b) return <div style={s.card}>Carregando…</div>;
  const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dt = x => x ? String(x).slice(0, 10).split('-').reverse().join('/') : '';
  return (
    <div>
      {saldo != null && (
        <div style={{ ...s.card, background: 'linear-gradient(135deg,#7A5AA8,#5B3E86)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontSize: 12, opacity: .85 }}>Saldo de pontos</div><div style={{ fontSize: 28, fontWeight: 800 }}>{saldo} pts</div></div>
          <div style={{ fontSize: 12, opacity: .9, textAlign: 'right' }}>Troque na<br /><strong>Loja de pontos</strong> 🏅</div>
        </div>
      )}
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Meus benefícios</div>
        {b.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Você ainda não tem benefícios concedidos.</div>}
        {b.map(x => { const st = BST[x.status] || BST.a_receber; return (
          <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '8px 0', borderTop: '1px solid #f4f4f4' }}>
            <span>{BTIPO[x.tipo] || x.tipo}{x.produto_nome ? ` · ${x.produto_nome}` : ''}{x.valor > 0 && x.tipo === 'vale_compras' ? ` · ${brl(x.valor)}` : ''} <span style={{ color: '#aaa' }}>· {dt(x.concedido_em)}</span></span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, color: st.c, background: st.bg }}>{st.l}</span>
          </div>
        ); })}
      </div>
    </div>
  );
}

// 💬 Pesquisa de clima (o colaborador responde, anônimo)
const CLIMA_DIMS = [
  ['s_geral', 'Satisfação geral com a empresa'], ['s_lideranca', 'Relacionamento com a liderança'],
  ['s_ambiente', 'Ambiente e clima de trabalho'], ['s_remuneracao', 'Remuneração e benefícios'],
  ['s_crescimento', 'Oportunidades de crescimento'], ['s_reconhecimento', 'Reconhecimento pelo trabalho'],
  ['s_carga', 'Carga de trabalho / equilíbrio'], ['s_ferramentas', 'Ferramentas e condições p/ trabalhar'],
];
function ClimaInline({ API }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ comentario: '', enps: null });
  const [ok, setOk] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { API.get('/clima/ativa').then(r => setD(r.data)).catch(() => setD(false)); }, [API]);
  if (d === null) return <div style={s.card}>Carregando…</div>;
  if (d === false || !d.campanha) return <div style={s.card}><div style={{ fontSize: 13, color: '#999' }}>Nenhuma pesquisa de clima aberta no momento.</div></div>;
  if (d.respondi || ok) return <div style={{ ...s.card, textAlign: 'center' }}><div style={{ fontSize: 40 }}>💚</div><div style={{ fontSize: 14, fontWeight: 600 }}>Obrigado por responder!</div><div style={{ fontSize: 12, color: '#666' }}>Sua resposta é <strong>anônima</strong> e ajuda a melhorar o Grupo Mutti.</div></div>;
  const enviar = () => { API.post('/clima/ativa/responder', f).then(() => setOk(true)).catch(e => setMsg(e.response?.data?.erro || 'Erro')); };
  const Escala = ({ campo }) => <div style={{ display: 'flex', gap: 6 }}>{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setF({ ...f, [campo]: n })} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: `1px solid ${f[campo] === n ? '#185FA5' : '#ddd'}`, background: f[campo] === n ? '#185FA5' : '#fff', color: f[campo] === n ? '#fff' : '#666', cursor: 'pointer', fontWeight: 700 }}>{n}</button>)}</div>;
  return (
    <div style={s.card}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>💬 {d.campanha.titulo}</div>
      <div style={{ fontSize: 12, color: '#8A94A6', marginBottom: 12 }}>Sua resposta é <strong>anônima</strong> 🔒. Seja sincero — leva 2 minutos e ajuda muito. De 1 (ruim) a 5 (excelente):</div>
      {CLIMA_DIMS.map(([campo, label]) => (
        <div key={campo} style={{ margin: '10px 0' }}><div style={{ fontSize: 13, color: '#444', marginBottom: 5 }}>{label}</div><Escala campo={campo} /></div>
      ))}
      <div style={{ fontSize: 13, color: '#444', margin: '14px 0 5px' }}>De 0 a 10, o quanto você recomendaria a empresa para um amigo trabalhar?</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <button key={n} onClick={() => setF({ ...f, enps: n })} style={{ width: 36, padding: '7px 0', borderRadius: 8, border: `1px solid ${f.enps === n ? '#185FA5' : '#ddd'}`, background: f.enps === n ? '#185FA5' : '#fff', color: f.enps === n ? '#fff' : '#666', cursor: 'pointer', fontWeight: 700 }}>{n}</button>)}</div>
      <div style={{ fontSize: 13, color: '#444', margin: '14px 0 5px' }}>Quer deixar um comentário? (opcional)</div>
      <textarea rows={3} value={f.comentario} onChange={e => setF({ ...f, comentario: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 8, padding: 10, fontSize: 13, resize: 'vertical' }} />
      {msg && <div style={{ fontSize: 12, color: '#993C1D', margin: '8px 0' }}>{msg}</div>}
      <button onClick={enviar} style={{ ...sBtn('#185FA5', '#fff'), marginTop: 12, padding: '10px 18px', fontSize: 14 }}>Enviar (anônimo)</button>
    </div>
  );
}

// 🏅 Avaliação de setores & gerência (o colaborador responde e ganha pontos)
function AvaliacaoInline({ API }) {
  const [d, setD] = useState(null);
  const [notas, setNotas] = useState({});   // `${alvoId}|${perguntaId}` -> 1..5
  const [coms, setComs] = useState({});      // alvoId -> texto
  const [res, setRes] = useState(null);      // {ok, mensagem}
  const [msg, setMsg] = useState('');
  useEffect(() => { API.get('/pesquisas/ativa').then(r => setD(r.data)).catch(() => setD(false)); }, [API]);
  if (d === null) return <div style={s.card}>Carregando…</div>;
  if (d === false || !d.pesquisa) return <div style={s.card}><div style={{ fontSize: 13, color: '#999' }}>Nenhuma pesquisa de avaliação aberta no momento.</div></div>;
  if (d.respondi || res) return <div style={{ ...s.card, textAlign: 'center' }}><div style={{ fontSize: 40 }}>🏅</div><div style={{ fontSize: 14, fontWeight: 600 }}>{res?.mensagem || 'Você já respondeu esta avaliação. Obrigado!'}</div><div style={{ fontSize: 12, color: '#666' }}>Sua resposta é <strong>anônima</strong>.</div></div>;
  const perguntasDe = tipo => (d.perguntas || []).filter(q => q.tipo === tipo);
  const enviar = () => {
    const respostas = [];
    for (const a of d.alvos) {
      for (const q of perguntasDe(a.tipo)) {
        const n = notas[`${a.id}|${q.id}`];
        if (n) respostas.push({ alvoId: a.id, perguntaId: q.id, nota: n });
      }
      if (coms[a.id]) respostas.push({ alvoId: a.id, comentario: coms[a.id] });
    }
    if (!respostas.some(r => r.nota)) { setMsg('Dê ao menos uma nota antes de enviar.'); return; }
    API.post('/pesquisas/ativa/responder', { respostas }).then(r => setRes(r.data)).catch(e => setMsg(e.response?.data?.erro || 'Erro'));
  };
  const setores = d.alvos.filter(a => a.tipo === 'setor');
  const gerencia = d.alvos.filter(a => a.tipo === 'gerencia');
  const Escala = ({ k }) => <div style={{ display: 'flex', gap: 5 }}>{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setNotas({ ...notas, [k]: n })} style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: `1px solid ${notas[k] === n ? '#185FA5' : '#ddd'}`, background: notas[k] === n ? '#185FA5' : '#fff', color: notas[k] === n ? '#fff' : '#666', cursor: 'pointer', fontWeight: 700, fontSize: 12.5 }}>{n}</button>)}</div>;
  const Item = ({ a }) => (
    <div style={{ margin: '10px 0', padding: '10px 0', borderBottom: '1px solid #eef1f4' }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#222', marginBottom: 6 }}>{a.nome}</div>
      {perguntasDe(a.tipo).map(q => (
        <div key={q.id} style={{ margin: '7px 0' }}>
          <div style={{ fontSize: 12.5, color: '#555', marginBottom: 4 }}>{q.texto}</div>
          <Escala k={`${a.id}|${q.id}`} />
        </div>
      ))}
      <input value={coms[a.id] || ''} onChange={e => setComs({ ...coms, [a.id]: e.target.value })} placeholder="Comentário sobre este (opcional)" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #eee', borderRadius: 8, padding: '7px 9px', fontSize: 12.5, marginTop: 6 }} />
    </div>
  );
  return (
    <div style={s.card}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>🏅 {d.pesquisa.titulo}</div>
      <div style={{ fontSize: 12, color: '#8A94A6', marginBottom: 6 }}>Sua resposta é <strong>anônima</strong> 🔒. Dê uma nota de 1 (ruim) a 5 (excelente) para cada pergunta.{d.pesquisa.pontos > 0 ? <> Ao enviar, você ganha <strong style={{ color: '#185FA5' }}>+{d.pesquisa.pontos} pontos</strong>. 🎁</> : ''}</div>
      {setores.length > 0 && <><div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginTop: 10 }}>🏢 Setores</div>{setores.map(a => <Item key={a.id} a={a} />)}</>}
      {gerencia.length > 0 && <><div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginTop: 10 }}>👔 Gerência</div>{gerencia.map(a => <Item key={a.id} a={a} />)}</>}
      {msg && <div style={{ fontSize: 12, color: '#993C1D', margin: '8px 0' }}>{msg}</div>}
      <button onClick={enviar} style={{ ...sBtn('#185FA5', '#fff'), marginTop: 12, padding: '10px 18px', fontSize: 14 }}>Enviar avaliação</button>
    </div>
  );
}

// 🌴 Minhas férias
function MinhasFolgasInline({ API }) {
  const [folgas, setFolgas] = useState(null);
  useEffect(() => { API.get('/folgas/minhas').then(r => setFolgas(r.data.folgas || [])).catch(() => setFolgas([])); }, [API]);
  const fmt = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
  const ST = { aprovada: ['Aprovada', '#1E8449', '#E7F4EC'], pendente: ['Pendente', '#B7791F', '#FBF3E0'], recusada: ['Recusada', '#C0392B', '#FBEAE7'], cancelada: ['Cancelada', '#888', '#F0F0F0'] };
  if (!folgas) return <div style={s.card}>Carregando…</div>;
  const hoje = new Date().toISOString().slice(0, 10);
  const proximas = folgas.filter(f => f.data >= hoje);
  return (
    <div style={s.card}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🌙 Minhas folgas</div>
      {folgas.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhuma folga registrada. As folgas são lançadas pela sua liderança.</div>}
      {proximas.length > 0 && <div style={{ fontSize: 11.5, color: '#0F766E', background: '#E1F5EE', border: '1px solid #B7E3D4', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>Próxima folga: <b>{fmt(proximas[proximas.length - 1].data)}</b>{proximas.length > 1 ? ` (+${proximas.length - 1} agendada${proximas.length > 2 ? 's' : ''})` : ''}</div>}
      {folgas.map((f, i) => {
        const st = ST[f.status] || ST.pendente;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '7px 0', borderTop: i ? '1px solid #f4f4f4' : 'none' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>🌙 {fmt(f.data)}</span>
            {f.turno && <span style={{ fontSize: 11, color: '#666' }}>· {f.turno}</span>}
            <span style={{ fontSize: 10, color: st[1], background: st[2], borderRadius: 5, padding: '1px 7px' }}>{st[0]}</span>
            {f.substituto_nome && <span style={{ fontSize: 11.5, color: '#777' }}>cobre: {f.substituto_nome}</span>}
            {f.motivo && <span style={{ fontSize: 11.5, color: '#999', marginLeft: 'auto' }}>{f.motivo}</span>}
          </div>
        );
      })}
    </div>
  );
}

function MinhasFeriasInline({ API }) {
  const [d, setD] = useState(null);
  const [sol, setSol] = useState({ data_inicio: '', data_fim: '', obs: '' });
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => API.get('/meu-rh/ferias').then(r => setD(r.data)).catch(() => setD({ ferias: [] })), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const fmt = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
  async function solicitar() { if (!sol.data_inicio) { setMsg('Escolha a data.'); return; } const r = await API.post('/meu-rh/ferias/solicitar', sol); setMsg('✅ ' + r.data.mensagem); setSol({ data_inicio: '', data_fim: '', obs: '' }); }
  if (!d) return <div style={s.card}>Carregando…</div>;
  const inp = { border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 13 };
  return (
    <>
      {d.em_ferias && <div style={{ ...s.card, background: '#E1F5EE', border: '1px solid #B7E3D4', color: '#0F766E', fontWeight: 600 }}>🏖️ Você está de férias agora. Bom descanso!</div>}
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Minhas férias</div>
        {d.ferias.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhuma férias registrada ainda.</div>}
        {d.ferias.map((f, i) => <div key={i} style={{ fontSize: 13, padding: '4px 0', borderTop: i ? '1px solid #f4f4f4' : 'none' }}>🌴 {fmt(f.data_inicio)} {f.data_fim ? `a ${fmt(f.data_fim)}` : ''}</div>)}
      </div>
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Solicitar férias</div>
        <div style={{ fontSize: 11.5, color: '#8a6d1d', background: '#FBF3E0', border: '1px solid #F0E0B8', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>📋 Isto é uma <b>solicitação</b>: passa por análise do gestor/RH antes de ser aprovada. Você recebe a resposta por aqui.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <div><label style={{ fontSize: 11, color: '#888', display: 'block' }}>A partir de</label><input type="date" style={inp} value={sol.data_inicio} onChange={e => setSol({ ...sol, data_inicio: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#888', display: 'block' }}>Até (opcional)</label><input type="date" style={inp} value={sol.data_fim} onChange={e => setSol({ ...sol, data_fim: e.target.value })} /></div>
        </div>
        <textarea rows={2} placeholder="Observação (opcional)" value={sol.obs} onChange={e => setSol({ ...sol, obs: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', ...inp, marginBottom: 8, resize: 'vertical' }} />
        {msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginBottom: 6 }}>{msg}</div>}
        <button onClick={solicitar} style={sBtn('#111', '#fff')}>Enviar solicitação</button>
      </div>
    </>
  );
}
const sBtn = (bg, c) => ({ fontSize: 12, padding: '8px 12px', background: bg, color: c, border: bg === '#fff' ? '1px solid #cdddEE' : 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 });

function MinhasAvaliacoesSetor({ API }) {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [lista, setLista] = useState([]);
  const [msg, setMsg] = useState('');
  const NOTAS = { bom: ['Bom', '#3B6D11', '#EAF3DE'], regular: ['Regular', '#854F0B', '#FAEEDA'], ruim: ['Ruim', '#993C1D', '#FCEBEB'] };

  const carregar = () => API.get('/avaliacao-admin/minhas', { params: { data } }).then(r => setLista(r.data.avaliacoes || [])).catch(() => setLista([]));
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [data]);

  async function contestar(id) {
    const motivo = window.prompt('Por que você discorda desta nota? (será enviado ao chefe do setor)');
    if (!motivo || !motivo.trim()) return;
    try { const r = await API.post(`/avaliacao-admin/${id}/contestar`, { motivo: motivo.trim() }); setMsg(r.data.mensagem); carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }

  if (!lista.length) return null;
  return (
    <div style={s.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Minhas avaliações do setor</div>
        <input type="date" value={data} onChange={e => setData(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', border: '1px solid #ddd', borderRadius: 6 }} />
      </div>
      {msg && <div style={{ fontSize: 12, color: '#185FA5', marginBottom: 6 }}>{msg}</div>}
      {lista.map(a => {
        const n = NOTAS[a.nota];
        return (
          <div key={a.id} style={{ padding: '8px 0', borderTop: '1px solid #f5f5f5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: '#666' }}>Avaliada por {a.chefe_nome || 'chefe do setor'}</div>
              {n ? <span style={{ fontSize: 11, fontWeight: 600, color: n[1], background: n[2], padding: '3px 10px', borderRadius: 10 }}>{n[0]}</span>
                : <span style={{ fontSize: 11, color: '#999' }}>aguardando nota</span>}
            </div>
            {a.status === 'contestada' && <div style={{ fontSize: 11, color: '#854F0B', marginTop: 4 }}>⏳ Contestação enviada — aguardando o chefe reavaliar.</div>}
            {a.status === 'avaliada' && !a.reanalisada && (
              <button onClick={() => contestar(a.id)} style={{ marginTop: 6, fontSize: 12, padding: '5px 12px', border: '1px solid #993C1D', color: '#993C1D', background: 'none', borderRadius: 8, cursor: 'pointer' }}>Discordo / contestar</button>
            )}
            {a.reanalisada && a.status === 'avaliada' && <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Já reavaliada (contestação usada).</div>}
          </div>
        );
      })}
    </div>
  );
}

const M = ({ v, l, c }) => <div style={s.metric}><div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div><div style={{ fontSize: 11, color: '#666' }}>{l}</div></div>;
const Sec = ({ t, children }) => <div style={s.card}><div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t}</div>{children}</div>;
const Row = ({ k, v }) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, borderBottom: '1px solid #f5f5f5' }}><span style={{ color: '#666' }}>{k}</span><strong>{v}</strong></div>;
const Vazio = ({ t }) => <div style={{ fontSize: 12, color: '#999', padding: '6px 0' }}>{t}</div>;

function MeusAtestadosInline({ API }) {
  const [f, setF] = useState({ data_inicio: '', data_fim: '', motivo: '', anexo_url: '' });
  const [lista, setLista] = useState([]); const [msg, setMsg] = useState('');
  const carregar = () => API.get('/ponto/meus-atestados').then(r => setLista(r.data.atestados || [])).catch(() => {});
  useEffect(() => { carregar(); }, []); // eslint-disable-line
  const anexar = e => { const file = e.target.files[0]; if (!file) return; if (file.size > 8_000_000) { setMsg('Arquivo muito grande (máx 8MB).'); return; } const fr = new FileReader(); fr.onload = () => setF(x => ({ ...x, anexo_url: fr.result })); fr.readAsDataURL(file); };
  const enviar = () => { if (!f.data_inicio) { setMsg('Informe a data.'); return; } API.post('/ponto/atestado', f).then(() => { setMsg('✅ Atestado enviado — o RH vai validar.'); setF({ data_inicio: '', data_fim: '', motivo: '', anexo_url: '' }); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Falha.'))); };
  const badge = st => ({ pendente: ['#B7791F', 'em análise'], aprovado: ['#1E874B', 'aprovado'], rejeitado: ['#C0392B', 'rejeitado'] }[st] || ['#666', st]);
  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>🩺 Enviar atestado</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: '#888', display: 'flex', flexDirection: 'column', gap: 3 }}>Início<input type="date" value={f.data_inicio} onChange={e => setF(x => ({ ...x, data_inicio: e.target.value }))} style={inp} /></label>
          <label style={{ fontSize: 11, color: '#888', display: 'flex', flexDirection: 'column', gap: 3 }}>Fim<input type="date" value={f.data_fim} onChange={e => setF(x => ({ ...x, data_fim: e.target.value }))} style={inp} /></label>
        </div>
        <input placeholder="Motivo / CID (opcional)" value={f.motivo} onChange={e => setF(x => ({ ...x, motivo: e.target.value }))} style={{ ...inp, width: '100%', marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, padding: '7px 12px', background: '#fff', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>📎 Anexar foto/PDF do atestado<input type="file" accept="image/*,application/pdf" onChange={anexar} style={{ display: 'none' }} /></label>
          {f.anexo_url && <span style={{ fontSize: 12, color: '#1E874B' }}>anexado ✓</span>}
          <button onClick={enviar} style={{ fontSize: 13, padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, marginLeft: 'auto' }}>Enviar</button>
        </div>
        {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg[0] === '✅' ? '#1E874B' : '#B7791F' }}>{msg}</div>}
        <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>O RH valida o atestado. Ao aprovar, o abono é lançado automaticamente no ponto (Tangerino).</div>
      </div>
      {lista.map(a => { const [cor, lab] = badge(a.status); return (
        <div key={a.id} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '8px 12px', marginBottom: 6, fontSize: 12.5 }}>
          <b style={{ color: cor }}>{lab}</b> · {String(a.data_inicio).slice(0, 10).split('-').reverse().join('/')}{a.data_fim && a.data_fim !== a.data_inicio ? ' a ' + String(a.data_fim).slice(0, 10).split('-').reverse().join('/') : ''}{a.motivo ? ` · ${a.motivo}` : ''}
        </div>); })}
      {lista.length === 0 && <div style={{ fontSize: 12.5, color: '#aaa', textAlign: 'center', padding: 14 }}>Nenhum atestado enviado.</div>}
    </div>
  );
}
function MeuPontoInline({ API }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const ini = hoje.slice(0, 8) + '01';
  const [esp, setEsp] = useState(null);
  const [minhas, setMinhas] = useState([]);
  const [sel, setSel] = useState(null); // dataRef selecionada
  const [janela, setJanela] = useState(null);
  const [f, setF] = useState({ tipo: 'ajuste', descricao: '', horarioSugerido: '' });
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => {
    API.get(`/pontorep/meu-espelho?ini=${ini}&fim=${hoje}`).then(r => setEsp(r.data)).catch(() => setEsp({ dias: [], totais: {} }));
    API.get('/pontorep/minhas-correcoes').then(r => setMinhas(r.data)).catch(() => {});
  }, [API, ini, hoje]);
  useEffect(() => { carregar(); }, [carregar]);
  const abrir = (data) => {
    setSel(data); setMsg(''); setF({ tipo: 'ajuste', descricao: '', horarioSugerido: '' });
    API.get(`/pontorep/correcao/janela?data=${data}`).then(r => setJanela(r.data)).catch(() => setJanela(null));
  };
  const enviar = () => {
    if (!f.descricao.trim()) return setMsg('⚠️ Descreva o que precisa corrigir.');
    API.post('/pontorep/correcao', { dataRef: sel, ...f }).then(() => { setMsg('✅ Pedido enviado ao RH.'); setSel(null); carregar(); }).catch(e => setMsg('⚠️ ' + (e.response?.data?.erro || 'Erro')));
  };
  const hm = m => `${Math.floor((m || 0) / 60)}h${String(Math.abs(m || 0) % 60).padStart(2, '0')}`;
  const ST = { ok: '#1E874B', extra: '#B7791F', atraso: '#C0392B', falta: '#7f1d1d', incompleto: '#B7791F', folga: '#888' };
  const badge = st => ({ pendente: ['#B7791F', 'em análise'], aprovada: ['#1E874B', 'aprovada'], recusada: ['#C0392B', 'recusada'] }[st] || ['#666', st]);
  if (!esp) return <div style={{ padding: 20, color: '#888' }}>Carregando…</div>;
  return (
    <div>
      <div style={{ fontSize: 12.5, color: '#666', marginBottom: 10 }}>Seu ponto do mês. Clique em <b>pedir correção</b> num dia — o pedido vai pro RH e só é possível <b>dentro do prazo</b> de correção.</div>
      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 12, marginBottom: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{['Dia', 'Batidas', 'Previsto', 'Trabalhado', 'Situação', ''].map(c => <th key={c} style={{ textAlign: 'left', padding: '6px 8px', color: '#888', borderBottom: '2px solid #eee' }}>{c}</th>)}</tr></thead>
          <tbody>
            {esp.dias.map(d => (
              <tr key={d.data} style={{ borderBottom: '1px solid #f5f5f5' }}>
                <td style={{ padding: '6px 8px' }}>{d.data.slice(8, 10)}/{d.data.slice(5, 7)}</td>
                <td style={{ padding: '6px 8px' }}>{d.batidas_horas || '—'}</td>
                <td style={{ padding: '6px 8px' }}>{d.folga ? '🌴' : hm(d.previsto_min)}</td>
                <td style={{ padding: '6px 8px' }}>{hm(d.trabalhado_min)}</td>
                <td style={{ padding: '6px 8px' }}><span style={{ color: ST[d.status] || '#666', fontWeight: 600 }}>{d.status}</span></td>
                <td style={{ padding: '6px 8px' }}><button onClick={() => abrir(d.data)} style={{ fontSize: 11, padding: '4px 9px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>pedir correção</button></td>
              </tr>
            ))}
            {!esp.dias.length && <tr><td colSpan={6} style={{ padding: 14, color: '#aaa', textAlign: 'center' }}>Sem apuração no mês ainda.</td></tr>}
          </tbody>
        </table>
      </div>

      {sel && (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Pedir correção — {sel.split('-').reverse().join('/')}</div>
          {janela && !janela.aberta
            ? <div style={{ background: '#fde8e8', color: '#C0392B', padding: '8px 12px', borderRadius: 8, fontSize: 12.5 }}>⛔ {janela.competenciaFechada ? 'Competência já fechada.' : `Prazo de correção encerrado (limite ${janela.deadline}).`} Não é mais possível pedir.</div>
            : <>
              {janela && <div style={{ fontSize: 11.5, color: '#1E874B', marginBottom: 8 }}>✓ Dentro do prazo (até {janela.deadline}).</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} style={inp}>
                  <option value="esquecida">Esqueci de bater</option><option value="ajuste">Ajuste de horário</option><option value="abono">Abono/justificativa</option>
                </select>
                <input placeholder="Horário certo (ex.: 08:00)" value={f.horarioSugerido} onChange={e => setF({ ...f, horarioSugerido: e.target.value })} style={inp} />
              </div>
              <textarea placeholder="Explique o que aconteceu…" value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} style={{ ...inp, width: '100%', minHeight: 60, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={enviar} style={{ fontSize: 13, padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Enviar pedido</button>
                <button onClick={() => setSel(null)} style={{ fontSize: 13, padding: '8px 16px', background: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>Cancelar</button>
              </div>
            </>}
          {msg && <div style={{ fontSize: 12.5, marginTop: 8 }}>{msg}</div>}
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, margin: '4px 0 8px' }}>Meus pedidos de correção</div>
      {minhas.map(c => { const [cor, lab] = badge(c.status); return (
        <div key={c.id} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '8px 12px', marginBottom: 6, fontSize: 12.5 }}>
          <b style={{ color: cor }}>{lab}</b> · {c.data_ref.split('-').reverse().join('/')} · {c.tipo}{c.descricao ? ` — ${c.descricao}` : ''}{c.resposta ? ` · RH: ${c.resposta}` : ''}
        </div>); })}
      {!minhas.length && <div style={{ fontSize: 12.5, color: '#aaa', textAlign: 'center', padding: 10 }}>Nenhum pedido ainda.</div>}
    </div>
  );
}

const inp = { border: '1px solid #ddd', borderRadius: 8, padding: '7px 9px', fontSize: 13 };

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  load: { padding: 30, textAlign: 'center', color: '#666' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(80px,1fr))', gap: 8, marginBottom: 10 },
  metric: { background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 10, textAlign: 'center' },
  item: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #f5f5f5' },
  tag: { fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#EAF3DE', color: '#3B6D11', fontWeight: 600 },
};
