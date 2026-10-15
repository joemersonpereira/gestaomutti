import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Banner from '../components/Banner';

const GESTAO_LOJA = ['Gerente', 'Subgerente'];
const SUPER = ['Supervisor', 'Diretor Geral', 'Gestor Geral', 'RH'];
const ST = {
  pendente: ['Pendente', '#854F0B', '#FAEEDA'],
  aprovada: ['Aprovada', '#3B6D11', '#EAF3DE'],
  rejeitada: ['Rejeitada', '#993C1D', '#FCEBEB'],
};
const hojeStr = new Date().toISOString().slice(0, 10);
const fmt = d => { try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };

export default function Folgas() {
  const { API, usuario } = useAuth();
  const podeLancar = GESTAO_LOJA.includes(usuario.funcao) || SUPER.includes(usuario.funcao);
  const isSuper = SUPER.includes(usuario.funcao);
  const [vista, setVista] = useState('minha');

  const [minhas, setMinhas] = useState([]);
  const [pendentes, setPendentes] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [lojas, setLojas] = useState([]);
  const [lojaFiltro, setLojaFiltro] = useState('');
  const [msg, setMsg] = useState('');

  // formulário "pedir pra mim"
  const [minhaData, setMinhaData] = useState(hojeStr);
  const [minhaDatas, setMinhaDatas] = useState([]);
  const [minhaMotivo, setMinhaMotivo] = useState('');

  // formulário "lançar equipe"
  const [eqLinhas, setEqLinhas] = useState([{ colaborador_id: '', substituto_id: '', turno: '' }]);
  const [eqData, setEqData] = useState(hojeStr);
  const [eqDatas, setEqDatas] = useState([]);
  const [eqMotivo, setEqMotivo] = useState('');
  const [eqCiencia, setEqCiencia] = useState(false);

  // pedido de substituto pendente: { contexto, lideres, onConfirma(substitutoId) }
  const [subPrompt, setSubPrompt] = useState(null);
  const [subEscolhido, setSubEscolhido] = useState('');

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const carregar = useCallback(() => {
    API.get('/folgas/minhas').then(r => setMinhas(r.data.folgas || [])).catch(() => {});
    API.get('/folgas/pendentes').then(r => setPendentes(r.data.pendentes || [])).catch(() => {});
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!podeLancar) return;
    if (isSuper) API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {});
  }, [API, podeLancar, isSuper]);

  const carregarEquipe = useCallback(() => {
    if (!podeLancar) return;
    const params = isSuper && lojaFiltro ? { loja_id: lojaFiltro } : {};
    API.get('/folgas/equipe', { params }).then(r => setEquipe(r.data.equipe || [])).catch(() => {});
  }, [API, podeLancar, isSuper, lojaFiltro]);
  useEffect(() => { carregarEquipe(); }, [carregarEquipe]);

  // Envia uma folga; trata o caso de precisar designar substituto.
  async function enviarFolga(payload, msgOk) {
    try {
      const r = await API.post('/folgas', payload);
      if (r.data.multi) {
        const falhas = r.data.resultados.filter(x => !x.ok);
        let m = `✅ ${r.data.mensagem}`;
        if (falhas.length) m += ` · não registrados: ${falhas.map(f => fmt(f.data)).join(', ')}`;
        flash(m);
      } else {
        const fila = r.data.fila_total > 1 ? ` · ${r.data.fila_posicao}º na fila de ${r.data.fila_total} pedido(s) nesse dia` : '';
        flash(`✅ ${r.data.mensagem}${fila}`);
      }
      setSubPrompt(null); setSubEscolhido('');
      carregar();
      return true;
    } catch (e) {
      const d = e.response?.data;
      if (d?.precisa_substituto) {
        setSubPrompt({ lideres: d.lideres || [], payload, tipo: 'lancar' });
        setSubEscolhido('');
        flash('⚠️ ' + d.erro);
      } else {
        flash(d?.erro || 'Erro ao enviar.');
      }
      return false;
    }
  }

  async function pedirMinha() {
    const lista = minhaDatas.length ? minhaDatas : (minhaData ? [minhaData] : []);
    if (!lista.length) return flash('Escolha ao menos uma data.');
    const ok = await enviarFolga({ datas: lista, motivo: minhaMotivo }, '');
    if (ok) { setMinhaMotivo(''); setMinhaDatas([]); }
  }

  async function lancarEquipe() {
    const pessoas = eqLinhas.filter(l => l.colaborador_id).map(l => ({ colaborador_id: l.colaborador_id, substituto_id: l.substituto_id || undefined, turno: l.turno || undefined }));
    if (!pessoas.length) return flash('Escolha ao menos um colaborador.');
    const lista = eqDatas.length ? eqDatas : (eqData ? [eqData] : []);
    if (!lista.length) return flash('Escolha ao menos uma data.');
    const ok = await enviarFolga({ lancamentos: pessoas, datas: lista, motivo: eqMotivo, ciencia: eqCiencia }, '');
    if (ok) { setEqLinhas([{ colaborador_id: '', substituto_id: '', turno: '' }]); setEqMotivo(''); setEqDatas([]); setEqCiencia(false); }
  }
  const setLinha = (i, campo, val) => setEqLinhas(eqLinhas.map((l, idx) => idx === i ? { ...l, [campo]: val } : l));

  const addData = (d, lista, setLista) => { if (d && !lista.includes(d)) setLista([...lista, d].sort()); };
  const noMesAtual = d => d && d >= hojeStr && d.slice(0, 7) === hojeStr.slice(0, 7);
  const Chips = ({ lista, setLista }) => lista.length ? (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
      {lista.map(d => (
        <span key={d} style={{ fontSize: 11, background: '#EEF2F7', borderRadius: 6, padding: '3px 8px', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {fmt(d)}<span style={{ cursor: 'pointer', color: '#993C1D' }} onClick={() => setLista(lista.filter(x => x !== d))}>×</span>
        </span>
      ))}
    </div>
  ) : null;

  async function confirmarSubstituto() {
    if (!subEscolhido) return flash('Escolha quem vai substituir.');
    if (subPrompt.tipo === 'lancar') {
      await enviarFolga({ ...subPrompt.payload, substituto_id: subEscolhido });
    } else if (subPrompt.tipo === 'aprovar') {
      await aprovar(subPrompt.folgaId, subEscolhido);
    }
  }

  async function aprovar(id, substituto_id) {
    try {
      await API.post(`/folgas/${id}/aprovar`, substituto_id ? { substituto_id } : {});
      flash('✅ Folga aprovada.'); setSubPrompt(null); setSubEscolhido(''); carregar();
    } catch (e) {
      const d = e.response?.data;
      if (d?.precisa_substituto) {
        setSubPrompt({ lideres: d.lideres || [], folgaId: id, tipo: 'aprovar' });
        setSubEscolhido(''); flash('⚠️ ' + d.erro);
      } else flash(d?.erro || 'Erro.');
    }
  }
  async function rejeitar(id) {
    try { await API.post(`/folgas/${id}/rejeitar`, {}); flash('Folga rejeitada.'); carregar(); }
    catch (e) { flash(e.response?.data?.erro || 'Erro.'); }
  }
  async function cancelar(id) {
    try { await API.delete(`/folgas/${id}`); flash('Folga cancelada.'); carregar(); }
    catch (e) { flash(e.response?.data?.erro || 'Erro.'); }
  }

  const tag = st => { const c = ST[st] || ST.pendente; return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: c[2], color: c[1], fontWeight: 600 }}>{c[0]}</span>; };

  return (
    <div style={s.wrap}>
      <Banner emoji="🌴" titulo="Folgas" cor="verde" />
      <div style={s.sub}>{podeLancar ? 'Peça a sua folga ou lance a folga da equipe (gestão).' : 'Peça a sua folga. A gestão aprova.'}</div>

      {podeLancar && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[['minha', 'Minha folga'], ['equipe', 'Folga da equipe']].map(([v, l]) => (
            <button key={v} onClick={() => setVista(v)} style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: '8px 0', borderRadius: 8, cursor: 'pointer', border: `1px solid ${vista === v ? '#185FA5' : '#ddd'}`, background: vista === v ? '#E6F1FB' : '#fff', color: vista === v ? '#185FA5' : '#666' }}>{l}</button>
          ))}
        </div>
      )}

      {msg && <div style={{ ...s.card, color: msg.startsWith('✅') ? '#3B6D11' : msg.startsWith('⚠️') ? '#854F0B' : '#993C1D', fontSize: 13 }}>{msg}</div>}

      {/* Designação de substituto (quando gerente e subgerente ficam ambos ausentes) */}
      {subPrompt && (
        <div style={{ ...s.card, border: '1.5px solid #854F0B', background: '#FFFBF3' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Quem vai substituir na loja?</div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Gerente e subgerente ausentes nesse dia. Escolha um responsável (cadastrado como Liderança).</div>
          {subPrompt.lideres.length === 0
            ? <div style={{ fontSize: 12, color: '#993C1D' }}>Nenhum colaborador marcado como <strong>Liderança</strong> nessa loja. Cadastre um em Cadastros para poder cobrir.</div>
            : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={subEscolhido} onChange={e => setSubEscolhido(e.target.value)} style={{ ...s.campo, marginBottom: 0, width: 'auto' }}>
                  <option value="">Escolha o substituto…</option>
                  {subPrompt.lideres.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
                <button style={s.btn} onClick={confirmarSubstituto}>Confirmar</button>
                <button style={s.btnGhost} onClick={() => { setSubPrompt(null); setSubEscolhido(''); }}>Cancelar</button>
              </div>
            )}
        </div>
      )}

      {/* Pendentes de aprovação */}
      {(vista === 'equipe' || !podeLancar) && pendentes.length > 0 && (
        <div style={s.card}>
          <div style={s.secao}>Pendentes da sua aprovação ({pendentes.length})</div>
          {pendentes.map(p => (
            <div key={p.id} style={s.linha}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.colaborador_nome} <span style={{ fontWeight: 400, color: '#999', fontSize: 11 }}>· {p.funcao_nome}{p.loja_nome ? ' · ' + p.loja_nome : ''}</span></div>
                <div style={{ fontSize: 11, color: '#777' }}>
                  {fmt(p.data)}{p.fila_total > 1 ? ` · ${p.fila_posicao}º de ${p.fila_total} na fila` : ''}{p.solicitado_por_nome ? ` · pedido por ${p.solicitado_por_nome}` : ''}
                  {p.motivo ? ` · ${p.motivo}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={s.btnOk} onClick={() => aprovar(p.id)}>✅ Aprovar</button>
                <button style={s.btnNo} onClick={() => rejeitar(p.id)}>Rejeitar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pedir minha folga */}
      {(vista === 'minha' || !podeLancar) && (
      <div style={s.card}>
        <div style={s.secao}>Pedir minha folga</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" min={hojeStr} value={minhaData} onChange={e => setMinhaData(e.target.value)} style={{ ...s.campo, marginBottom: 0, width: 'auto' }} />
          <button style={s.btnGhost} onClick={() => addData(minhaData, minhaDatas, setMinhaDatas)}>+ Adicionar dia</button>
          <input placeholder="Motivo (opcional)" value={minhaMotivo} onChange={e => setMinhaMotivo(e.target.value)} style={{ ...s.campo, marginBottom: 0, flex: 1, minWidth: 160 }} />
          <button style={s.btn} onClick={pedirMinha}>Pedir folga</button>
        </div>
        <Chips lista={minhaDatas} setLista={setMinhaDatas} />
        {(noMesAtual(minhaData) || minhaDatas.some(noMesAtual)) && <div style={{ fontSize: 11, color: '#854F0B', marginTop: 4 }}>⚠️ Há data no mês atual: o pedido é liberado, mas o índice de reprovação é alto (a regra é pedir até o último dia do mês para o mês seguinte).</div>}
        <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Dá pra pedir vários dias de uma vez: vá adicionando e clique em Pedir folga. Sem adicionar nenhum, pede só a data escolhida.</div>
      </div>
      )}

      {/* Lançar folga da equipe (gestão/supervisão) */}
      {podeLancar && vista === 'equipe' && (
        <div style={s.card}>
          <div style={s.secao}>Lançar folga da equipe</div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Você pode lançar para <strong>várias pessoas</strong> de uma vez (mesmas datas). Informe o substituto e o turno — ele recebe uma ciência com a loja e o turno.</div>
          {isSuper && (
            <select value={lojaFiltro} onChange={e => setLojaFiltro(e.target.value)} style={{ ...s.campo, width: 'auto' }}>
              <option value="">Escolha a loja…</option>
              {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          )}
          {eqLinhas.map((ln, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
              <select value={ln.colaborador_id} onChange={e => setLinha(i, 'colaborador_id', e.target.value)} style={{ ...s.campo, marginBottom: 0, width: 'auto', minWidth: 160 }}>
                <option value="">Colaborador…</option>
                {equipe.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.funcao_nome}</option>)}
              </select>
              <select value={ln.substituto_id} onChange={e => setLinha(i, 'substituto_id', e.target.value)} style={{ ...s.campo, marginBottom: 0, width: 'auto', minWidth: 150 }}>
                <option value="">Substituto…</option>
                {equipe.filter(c => c.id !== ln.colaborador_id).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <input placeholder="Turno (ex.: 08h–14h)" value={ln.turno} onChange={e => setLinha(i, 'turno', e.target.value)} style={{ ...s.campo, marginBottom: 0, width: 140 }} />
              {eqLinhas.length > 1 && <button style={s.btnGhost} onClick={() => setEqLinhas(eqLinhas.filter((_, idx) => idx !== i))}>✕</button>}
            </div>
          ))}
          <button style={s.btnGhost} onClick={() => setEqLinhas([...eqLinhas, { colaborador_id: '', substituto_id: '', turno: '' }])}>+ Adicionar pessoa</button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <input type="date" min={hojeStr} value={eqData} onChange={e => setEqData(e.target.value)} style={{ ...s.campo, marginBottom: 0, width: 'auto' }} />
            <button style={s.btnGhost} onClick={() => addData(eqData, eqDatas, setEqDatas)}>+ Adicionar dia</button>
            <input placeholder="Motivo (opcional)" value={eqMotivo} onChange={e => setEqMotivo(e.target.value)} style={{ ...s.campo, marginBottom: 0, flex: 1, minWidth: 140 }} />
            <button style={s.btn} onClick={lancarEquipe}>Lançar</button>
          </div>
          <Chips lista={eqDatas} setLista={setEqDatas} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#444', marginTop: 6 }}>
            <input type="checkbox" checked={eqCiencia} onChange={e => setEqCiencia(e.target.checked)} />
            Só para ciência (o colaborador confirma que está sabendo; não pode recusar)
          </label>
        </div>
      )}

      {/* Minhas folgas */}
      {(vista === 'minha' || !podeLancar) && (
      <div style={s.card}>
        <div style={s.secao}>Minhas folgas</div>
        {minhas.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhuma folga registrada.</div>}
        {minhas.map(f => (
          <div key={f.id} style={s.linha}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(f.data)} {tag(f.status)}</div>
              <div style={{ fontSize: 11, color: '#777' }}>
                {f.motivo ? f.motivo + ' · ' : ''}
                {f.status === 'aprovada' && f.aprovado_por_nome ? `aprovada por ${f.aprovado_por_nome}` : ''}
                {f.substituto_nome ? ` · substituto: ${f.substituto_nome}` : ''}
              </div>
            </div>
            {f.status !== 'rejeitada' && f.data >= hojeStr && <button style={s.btnGhost} onClick={() => cancelar(f.id)}>Cancelar</button>}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 },
  sub: { fontSize: 12, color: '#666', marginBottom: 14, lineHeight: 1.5 },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  secao: { fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 10 },
  linha: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f5f5f5' },
  campo: { padding: '8px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, marginBottom: 8 },
  btn: { fontSize: 13, padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnOk: { fontSize: 12, padding: '5px 12px', border: '1.5px solid #3B6D11', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#3B6D11', fontWeight: 600 },
  btnNo: { fontSize: 12, padding: '5px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#993C1D' },
  btnGhost: { fontSize: 12, padding: '5px 12px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666' },
};
