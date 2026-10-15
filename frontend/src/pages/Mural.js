import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

const GESTAO = ['Gerente', 'Subgerente', 'Supervisor', 'Gestor Geral', 'Diretor Geral', 'RH'];
const iniciais = n => String(n || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
function tempo(iso) {
  const d = new Date((iso || '').replace(' ', 'T') + 'Z'); const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'agora'; if (s < 3600) return `${Math.floor(s / 60)} min`; if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 604800) return `${Math.floor(s / 86400)} d`; return d.toLocaleDateString('pt-BR');
}
function saudacao() { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }

// Ilustração de pessoas no banner (dá vida de rede social)
function BannerPessoas() {
  return (
    <div style={{ position: 'absolute', right: 8, bottom: 0, top: 0, width: 250, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', pointerEvents: 'none' }} aria-hidden>
      <svg width="250" height="150" viewBox="0 0 250 150" xmlns="http://www.w3.org/2000/svg">
        <rect x="140" y="12" width="60" height="32" rx="12" fill="#ffffff" opacity="0.95" />
        <path d="M156 44 l-7 12 l15 -6 z" fill="#ffffff" opacity="0.95" />
        <circle cx="158" cy="28" r="3.4" fill="#7C3AED" /><circle cx="170" cy="28" r="3.4" fill="#F59E0B" /><circle cx="182" cy="28" r="3.4" fill="#10B981" />
        <path d="M224 24 c-3-6-12-4-12 3 c0 6 12 12 12 12 c0 0 12-6 12-12 c0-7-9-9-12-3z" fill="#F472B6" />
        <g transform="translate(26,44)">
          <path d="M-18 74 q0 -34 22 -34 q22 0 22 34 z" fill="#F59E0B" />
          <circle cx="4" cy="20" r="18" fill="#F1C39B" />
          <path d="M-14 16 a18 18 0 0 1 36 0 q-6 -11 -18 -11 q-12 0 -18 11z" fill="#3B2A1A" />
          <circle cx="-3" cy="20" r="2" fill="#3B2A1A" /><circle cx="11" cy="20" r="2" fill="#3B2A1A" />
          <path d="M-4 27 q8 6 16 0" stroke="#8A5A3B" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
        <g transform="translate(146,46)">
          <path d="M-18 72 q0 -34 22 -34 q22 0 22 34 z" fill="#3B82F6" />
          <circle cx="4" cy="20" r="18" fill="#E8B48C" />
          <path d="M-14 15 a18 18 0 0 1 36 0 q-4 -12 -18 -12 q-14 0 -18 12z" fill="#5B3A1E" />
          <circle cx="-3" cy="20" r="2" fill="#3B2A1A" /><circle cx="11" cy="20" r="2" fill="#3B2A1A" />
          <path d="M-4 27 q8 6 16 0" stroke="#9B6B45" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
        <g transform="translate(88,56)">
          <path d="M-22 70 q0 -38 26 -38 q26 0 26 38 z" fill="#10B981" />
          <circle cx="4" cy="18" r="21" fill="#F7CBA4" />
          <path d="M-17 14 a21 21 0 0 1 42 0 q-6 -13 -21 -13 q-15 0 -21 13z" fill="#1F2937" />
          <circle cx="-4" cy="18" r="2.3" fill="#1F2937" /><circle cx="12" cy="18" r="2.3" fill="#1F2937" />
          <path d="M-5 26 q9 7 18 0" stroke="#B57A50" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

export default function Mural() {
  const { API, usuario } = useAuth();
  const ehGestao = GESTAO.includes(usuario.funcao);
  const [posts, setPosts] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(() => {
    API.get('/mural/feed').then(r => setPosts(r.data.posts || [])).finally(() => setCarregando(false));
  }, [API]);
  useEffect(() => { carregar(); }, [carregar]);

  const [painel, setPainel] = useState(false);
  const [doc, setDoc] = useState(null); // 'regimento' | 'conduta'
  const [escuta, setEscuta] = useState(false);
  const [cel, setCel] = useState(null);
  const [editarPerfil, setEditarPerfil] = useState(false);
  const [kudos, setKudos] = useState(false);
  const [perfil, setPerfil] = useState({ bio: usuario.bio || '', presente_favorito: usuario.presente_favorito || '', cores_favoritas: usuario.cores_favoritas || '', estilo_musical: usuario.estilo_musical || '', hobbies: usuario.hobbies || '', time_coracao: usuario.time_coracao || '' });
  useEffect(() => { API.get('/mural/celebracoes').then(r => setCel(r.data)).catch(() => setCel(null)); }, [API]);
  const primeiroNome = usuario.apelido || String(usuario.nome || '').split(' ')[0];
  const tempoCasa = cel?.eu && (cel.eu.anos > 0 || cel.eu.meses > 0)
    ? `${cel.eu.anos > 0 ? `${cel.eu.anos} ano${cel.eu.anos > 1 ? 's' : ''}` : ''}${cel.eu.anos > 0 && cel.eu.meses > 0 ? ' e ' : ''}${cel.eu.meses > 0 ? `${cel.eu.meses} m` : ''} de casa`
    : null;

  return (
    <div style={s.wrap}>
      <style>{`
        @keyframes muttiBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes muttiPop { 0%{transform:scale(.9);opacity:.6} 100%{transform:scale(1);opacity:1} }
        @keyframes muttiShine { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .mBounce{ display:inline-block; animation:muttiBounce 1.6s ease-in-out infinite }
        .mPop{ animation:muttiPop .3s ease-out }
      `}</style>
      {/* Cover / boas-vindas — largura total, com ilustração de pessoas */}
      <div style={s.banner}>
        <div style={{ position: 'relative', zIndex: 1, maxWidth: '62%' }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{saudacao()}, {primeiroNome}! 👋</div>
          <div style={{ fontSize: 13.5, opacity: 0.94, marginTop: 3 }}>Essa é a nossa Comunidade — poste, reaja, comente e faça parte de tudo que acontece. 💚</div>
        </div>
        <BannerPessoas />
      </div>

      <LojaPontosBanner API={API} />

      {editarPerfil && <EditarPerfil API={API} usuario={usuario} perfil={perfil} onSalvo={p => { setPerfil(p); setEditarPerfil(false); }} onClose={() => setEditarPerfil(false)} />}
      {doc && <Institucional API={API} chave={doc} ehGestao={ehGestao} onClose={() => setDoc(null)} />}
      {escuta && <Ouvidoria API={API} onClose={() => setEscuta(false)} />}
      {kudos && <KudosModal API={API} usuario={usuario} onClose={() => setKudos(false)} onEnviado={() => { setKudos(false); carregar(); }} />}
      {ehGestao && painel && <PainelEngajamento API={API} usuario={usuario} onClose={() => setPainel(false)} />}

      <div style={s.colunas}>
        {/* ESQUERDA — perfil + gamificação + atalhos */}
        <aside style={s.lateral}>
          <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
            <div style={{ height: 42, background: 'linear-gradient(120deg,#2E7BC4,#0E3E6E)' }} />
            <div style={{ padding: '0 14px 14px', marginTop: -22 }}>
              {usuario.foto
                ? <img src={usuario.foto} alt="" style={{ ...s.avatar, width: 46, height: 46, border: '3px solid #fff', objectFit: 'cover', padding: 0 }} />
                : <div style={{ ...s.avatar, width: 46, height: 46, fontSize: 16, border: '3px solid #fff', background: '#EAF3FB' }}>{iniciais(usuario.nome)}</div>}
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>{usuario.nome}{usuario.apelido ? <span style={{ fontSize: 11, fontWeight: 400, color: '#8A94A6' }}> · "{usuario.apelido}"</span> : ''}</div>
              <div style={{ fontSize: 11, color: '#8A94A6' }}>{usuario.funcao}{usuario.loja ? ` · ${usuario.loja}` : ''}</div>
              {tempoCasa && <div style={{ display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 600, color: '#185FA5', background: '#EAF3FB', borderRadius: 20, padding: '3px 10px' }}>🎗️ {tempoCasa}</div>}
              {(perfil.bio || perfil.presente_favorito || perfil.estilo_musical || perfil.cores_favoritas || perfil.hobbies || perfil.time_coracao) && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: '#556', lineHeight: 1.5 }}>
                  {perfil.bio && <div style={{ fontStyle: 'italic', marginBottom: 4 }}>“{perfil.bio}”</div>}
                  {perfil.presente_favorito && <div>🎁 {perfil.presente_favorito}</div>}
                  {perfil.cores_favoritas && <div>🎨 {perfil.cores_favoritas}</div>}
                  {perfil.estilo_musical && <div>🎵 {perfil.estilo_musical}</div>}
                  {perfil.time_coracao && <div>⚽ {perfil.time_coracao}</div>}
                  {perfil.hobbies && <div>🎯 {perfil.hobbies}</div>}
                </div>
              )}
              <button onClick={() => setEditarPerfil(true)} style={{ ...s.linkBtn, marginTop: 8, fontWeight: 600 }}>✏️ editar meu perfil</button>
            </div>
          </div>
          <Gamificacao API={API} />
          <div style={{ ...s.card, padding: 6 }}>
            <button onClick={() => setKudos(true)} style={s.linkItem}><span style={s.linkIco}>🙌</span> Reconhecer um colega</button>
            <button onClick={() => setEscuta(true)} style={s.linkItem}><span style={s.linkIco}>🗣️</span> Fale com a gente</button>
            <button onClick={() => setDoc('regimento')} style={s.linkItem}><span style={s.linkIco}>📋</span> Regimento Interno</button>
            <button onClick={() => setDoc('conduta')} style={s.linkItem}><span style={s.linkIco}>📜</span> Código de Conduta</button>
            {ehGestao && <button onClick={() => setPainel(true)} style={s.linkItem}><span style={s.linkIco}>📊</span> Engajamento (gestão)</button>}
          </div>
        </aside>

        {/* CENTRO — feed */}
        <main style={s.centro}>
          <Compositor API={API} usuario={usuario} ehGestao={ehGestao} onPost={carregar} />
          {carregando && <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>Carregando…</div>}
          {!carregando && posts.length === 0 && <div style={s.card}>Ainda não há publicações. Seja o primeiro a dar um {saudacao().toLowerCase()}! 🌞</div>}
          {posts.map(p => <Post key={p.id} p={p} API={API} usuario={usuario} ehGestao={ehGestao} onChange={carregar} />)}
        </main>

        {/* DIREITA — Agenda, celebrações, patrocinado */}
        <aside style={s.lateralDir}>
          <QuemOnline API={API} />
          <AgendaEventos API={API} ehGestao={ehGestao} />
          <CardAniversario d={cel} />
          <CardFolga d={cel} />
          <CardFerias d={cel} />
          <CardEquipe d={cel} />
          <Patrocinado API={API} ehGestao={ehGestao} />
        </aside>
      </div>
    </div>
  );
}

const primeiro = n => String(n || '').split(' ').slice(0, 2).join(' ');
const fmtDiaMes = iso => { if (!iso) return ''; const p = String(iso).slice(0, 10).split('-'); return `${p[2]}/${p[1]}`; };

// 🎂 Card de aniversariantes — bem animado/colorido
function CardAniversario({ d }) {
  if (!d) return null;
  const hoje = d.aniversariantes_hoje || [], mes = d.aniversariantes_mes || [];
  if (!hoje.length && !mes.length) return null;
  const mesSemHoje = mes.filter(m => !hoje.some(h => h.nome === m.nome));
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 14, boxShadow: '0 2px 10px rgba(234,88,12,.14)' }}>
      <div style={{ background: 'linear-gradient(120deg,#FDBA74,#F97316 55%,#EA580C)', color: '#fff', padding: '12px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}><span className="mBounce">🎂</span> Aniversariantes</div>
        {hoje.length > 0 && (
          <div className="mPop" style={{ marginTop: 8, background: 'rgba(255,255,255,.18)', borderRadius: 12, padding: '10px 12px', backdropFilter: 'blur(2px)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>🎉 HOJE É DIA DE FESTA! 🎉</div>
            {hoje.map((a, i) => <div key={i} style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{a.nome}</div>)}
            <div style={{ fontSize: 12, marginTop: 3, opacity: 0.95 }}>Corre dar um parabéns! 🥳🎈🎁</div>
          </div>
        )}
      </div>
      {mesSemHoje.length > 0 && (
        <div style={{ background: '#FFF7ED', padding: '8px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#C2410C', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>Ainda esse mês</div>
          {mesSemHoje.map((a, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}>
              <span style={{ fontWeight: 600, color: '#7C2D12' }}>🎈 {primeiro(a.nome)}</span>
              <span style={{ fontSize: 11, color: '#C2853F', fontWeight: 700 }}>dia {a.dia}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 🌴 Card separado de férias
function CardFolga({ d }) {
  if (!d || !(d.folgas || []).length) return null;
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 14, boxShadow: '0 2px 10px rgba(184,127,23,.14)' }}>
      <div style={{ background: 'linear-gradient(120deg,#F59E0B,#D97706)', color: '#fff', padding: '10px 14px', fontSize: 14, fontWeight: 800 }}>😎 De folga hoje</div>
      <div style={{ background: '#FFFBEB', padding: '8px 12px' }}>
        {d.folgas.map((a, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12.5, padding: '4px 0', borderBottom: i < d.folgas.length - 1 ? '1px solid #FDEBC8' : 'none' }}>
            <span style={{ fontWeight: 600, color: '#92400E' }}>🏡 {primeiro(a.nome)}{a.loja ? <span style={{ fontWeight: 400, color: '#B7791F' }}> · {a.loja}</span> : ''}</span>
            {a.turno && <span style={{ fontSize: 11, color: '#B45309', fontWeight: 700 }}>{a.turno}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function CardFerias({ d }) {
  if (!d || !(d.ferias || []).length) return null;
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 14, boxShadow: '0 2px 10px rgba(13,148,136,.14)' }}>
      <div style={{ background: 'linear-gradient(120deg,#2DD4BF,#0D9488)', color: '#fff', padding: '10px 14px', fontSize: 14, fontWeight: 800 }}>🌴 De férias</div>
      <div style={{ background: '#F0FDFA', padding: '8px 12px' }}>
        {d.ferias.map((a, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12.5, padding: '4px 0', borderBottom: i < d.ferias.length - 1 ? '1px solid #D9F2EC' : 'none' }}>
            <span style={{ fontWeight: 600, color: '#115E59' }}>🏖️ {primeiro(a.nome)}</span>
            {a.data_fim && <span style={{ fontSize: 11, color: '#0D9488', fontWeight: 700 }}>volta {fmtDiaMes(a.data_fim)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Caixinha colorida genérica (mesmo estilo do card de férias)
function CardBox({ grad, sombra, titulo, itens, corSub }) {
  if (!itens.length) return null;
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 14, boxShadow: sombra }}>
      <div style={{ background: grad, color: '#fff', padding: '10px 14px', fontSize: 14, fontWeight: 800 }}>{titulo}</div>
      <div style={{ background: '#fff', border: '1px solid #eceef2', borderTop: 'none', borderRadius: '0 0 16px 16px', padding: '8px 12px' }}>
        {itens.map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12.5, padding: '4px 0', borderBottom: i < itens.length - 1 ? '1px solid #f4f4f4' : 'none' }}>
            <span style={{ fontWeight: 600, color: '#2B3648' }}>{it.ico} {primeiro(it.nome)}</span>
            {it.sub && <span style={{ fontSize: 11, color: corSub, fontWeight: 700 }}>{it.sub}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// 🥂 Anos de Mutti (tempo de casa) + 👋 novos colaboradores — em caixinhas
function CardEquipe({ d }) {
  if (!d) return null;
  const casa = (d.tempo_casa || []).map(a => ({ ico: '🥂', nome: a.nome, sub: `${a.anos} ano${a.anos > 1 ? 's' : ''}` }));
  const novos = (d.novos || []).map(a => ({ ico: '🌟', nome: a.nome, sub: a.loja || '' }));
  return (
    <>
      <CardBox grad="linear-gradient(120deg,#60A5FA,#2563EB)" sombra="0 2px 10px rgba(37,99,235,.14)" titulo="🥂 Anos de Mutti" itens={casa} corSub="#2563EB" />
      <CardBox grad="linear-gradient(120deg,#86EFAC,#16A34A)" sombra="0 2px 10px rgba(22,163,74,.14)" titulo="👋 Chegando agora" itens={novos} corSub="#16A34A" />
    </>
  );
}

function AgendaEventos({ API, ehGestao }) {
  const [d, setD] = useState(null);
  const [novo, setNovo] = useState(false);
  const [f, setF] = useState({ titulo: '', data: '', hora: '', local: '', descricao: '' });
  const carregar = useCallback(() => { API.get('/mural/eventos').then(r => setD(r.data)).catch(() => setD(null)); }, [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const partes = iso => { const p = String(iso).slice(0, 10).split('-'); return { dia: p[2], mes: MES[(+p[1] || 1) - 1] }; };
  async function salvar() {
    if (!f.titulo.trim() || !f.data) return;
    await API.post('/mural/eventos', f);
    setF({ titulo: '', data: '', hora: '', local: '', descricao: '' }); setNovo(false); carregar();
  }
  async function excluir(id) { if (!window.confirm('Excluir este evento?')) return; await API.delete(`/mural/eventos/${id}`); carregar(); }
  if (!d) return null;
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 14, boxShadow: '0 2px 10px rgba(124,58,161,.14)' }}>
      <div style={{ background: 'linear-gradient(120deg,#A78BFA,#7C3AED 60%,#6D28D9)', color: '#fff', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>📅 Agenda de eventos</div>
        {d.pode_criar && <button onClick={() => setNovo(v => !v)} style={{ ...s.linkBtn, color: '#fff', fontWeight: 700 }}>{novo ? 'fechar' : '+ evento'}</button>}
      </div>
      <div style={{ background: '#fff', border: '1px solid #eceef2', borderTop: 'none', borderRadius: '0 0 16px 16px', padding: '10px 14px' }}>
      {novo && (
        <div style={{ background: '#F6F9FC', border: '1px solid #e3ebf3', borderRadius: 10, padding: 10, marginBottom: 10 }}>
          <input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Título do evento" style={{ ...s.input, marginBottom: 6 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} style={{ ...s.input, marginBottom: 6 }} />
            <input type="time" value={f.hora} onChange={e => setF({ ...f, hora: e.target.value })} style={{ ...s.input, marginBottom: 6, width: 110 }} />
          </div>
          <input value={f.local} onChange={e => setF({ ...f, local: e.target.value })} placeholder="Local (opcional)" style={{ ...s.input, marginBottom: 6 }} />
          <textarea value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} placeholder="Detalhes (opcional)" rows={2} style={{ ...s.input, marginBottom: 6, resize: 'vertical' }} />
          <button onClick={salvar} style={{ ...s.btn, width: '100%' }}>Salvar evento</button>
        </div>
      )}
      {d.eventos.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Nenhum evento agendado.</div>}
      {d.eventos.map(ev => {
        const { dia, mes } = partes(ev.data);
        return (
          <div key={ev.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: '1px solid #f2f2f2', alignItems: 'flex-start' }}>
            <div style={{ textAlign: 'center', background: '#EAF3FB', borderRadius: 8, padding: '4px 8px', minWidth: 40 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#185FA5', lineHeight: 1 }}>{dia}</div>
              <div style={{ fontSize: 9, color: '#185FA5', textTransform: 'uppercase' }}>{mes}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{ev.titulo}</div>
              <div style={{ fontSize: 11, color: '#999' }}>{ev.hora ? `${ev.hora}h` : ''}{ev.hora && ev.local ? ' · ' : ''}{ev.local || ''}</div>
              {ev.descricao && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{ev.descricao}</div>}
            </div>
            {ehGestao && <button onClick={() => excluir(ev.id)} title="Excluir" style={s.xBtn}>✕</button>}
          </div>
        );
      })}
      </div>
    </div>
  );
}

// 🏆 Gamificação pública — ranking + regras de pontos (todos veem)
// 🟢 Quem está online agora
function QuemOnline({ API }) {
  const [d, setD] = useState({ online: [], total: 0 });
  useEffect(() => {
    const carregar = () => API.get('/mural/online').then(r => setD(r.data)).catch(() => {});
    carregar(); const t = setInterval(carregar, 60000); return () => clearInterval(t);
  }, [API]);
  if (!d.total) return null;
  return (
    <div style={s.card}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} /> Online agora <span style={{ color: '#9AA3B2', fontWeight: 400 }}>({d.total})</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {d.online.map(o => (
          <div key={o.id} title={`${o.apelido || o.nome}${o.loja ? ' · ' + o.loja : ''}`} style={{ position: 'relative' }}>
            {o.tem_foto
              ? <img src={`/api/mural/foto/${o.id}`} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
              : <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#EAF3FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#185FA5' }}>{iniciais(o.nome)}</div>}
            <span style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: '#22C55E', border: '2px solid #fff' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// 🙌 Dar um kudos a um colega
function KudosModal({ API, usuario, onClose, onEnviado }) {
  const [colegas, setColegas] = useState([]);
  const [cats, setCats] = useState([]);
  const [f, setF] = useState({ para_id: '', categoria: '', mensagem: '' });
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    API.get('/colaboradores').then(r => setColegas((r.data.colaboradores || r.data || []).filter(c => c.id !== usuario.id && c.ativo !== 0))).catch(() => {});
    API.get('/kudos/categorias').then(r => { setCats(r.data.categorias || []); setF(x => ({ ...x, categoria: r.data.categorias?.[0] || '' })); }).catch(() => {});
  }, [API, usuario.id]);
  const enviar = () => {
    if (!f.para_id) return setMsg('Escolha o colega.');
    setEnviando(true);
    API.post('/kudos', f).then(r => { setMsg(`✅ Kudos enviado! ${r.data.restantes >= 0 ? `Você ainda pode dar ${r.data.restantes} hoje.` : ''}`); setTimeout(onEnviado, 1200); })
      .catch(e => { setMsg(e.response?.data?.erro || 'Erro'); setEnviando(false); });
  };
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.modal, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🙌 Reconhecer um colega</div>
        <div style={{ fontSize: 12, color: '#8A94A6', marginBottom: 12 }}>Mande aquele "mandou bem!" — aparece no mural e ainda dá pontos pra pessoa. 💚</div>
        <label style={{ fontSize: 11, color: '#888' }}>Colega</label>
        <select value={f.para_id} onChange={e => setF({ ...f, para_id: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginBottom: 8 }}>
          <option value="">Escolha…</option>
          {colegas.map(c => <option key={c.id} value={c.id}>{c.nome}{c.loja ? ` · ${c.loja}` : ''}</option>)}
        </select>
        <label style={{ fontSize: 11, color: '#888' }}>Por quê?</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {cats.map(cat => <button key={cat} onClick={() => setF({ ...f, categoria: cat })} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 16, cursor: 'pointer', border: `1px solid ${f.categoria === cat ? '#B45309' : '#ddd'}`, background: f.categoria === cat ? '#FFF7ED' : '#fff', color: f.categoria === cat ? '#B45309' : '#666', fontWeight: 600 }}>{cat}</button>)}
        </div>
        <textarea value={f.mensagem} onChange={e => setF({ ...f, mensagem: e.target.value })} placeholder="Escreva um recado (opcional)" rows={2} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 8, padding: 10, fontSize: 13, resize: 'vertical', marginBottom: 8 }} />
        {msg && <div style={{ fontSize: 12, marginBottom: 8, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D' }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={enviar} disabled={enviando} style={{ ...s.btn, background: '#B45309', flex: 1 }}>Enviar kudos 🙌</button>
          <button onClick={onClose} style={{ ...s.btn, background: '#eee', color: '#666' }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ✏️ Editar meu perfil (sobre mim) — o próprio colaborador
function EditarPerfil({ API, usuario, perfil, onSalvo, onClose }) {
  const [f, setF] = useState(perfil);
  const [salvando, setSalvando] = useState(false);
  const salvar = () => { setSalvando(true); API.patch(`/colaboradores/${usuario.id}/perfil`, f).then(() => onSalvo(f)).finally(() => setSalvando(false)); };
  const campo = (k, ph) => <input value={f[k] || ''} onChange={e => setF({ ...f, [k]: e.target.value })} placeholder={ph} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginBottom: 8 }} />;
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.modal, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>✏️ Meu perfil</div>
        <div style={{ fontSize: 12, color: '#8A94A6', marginBottom: 12 }}>Conta pra galera um pouco de você — aparece no seu perfil da Comunidade. 💬</div>
        <textarea value={f.bio || ''} onChange={e => setF({ ...f, bio: e.target.value })} placeholder="Uma frase sobre mim…" maxLength={500} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginBottom: 8, minHeight: 56, resize: 'vertical' }} />
        {campo('presente_favorito', '🎁 O que gosto de presente')}
        {campo('cores_favoritas', '🎨 Cores favoritas')}
        {campo('estilo_musical', '🎵 Estilo musical')}
        {campo('time_coracao', '⚽ Time do coração')}
        {campo('hobbies', '🎯 Hobbies')}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={salvar} disabled={salvando} style={{ ...s.btn, flex: 1 }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          <button onClick={onClose} style={{ ...s.btn, background: '#eee', color: '#666' }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// 🏅 Banner "Juntou, trocou" — chama pra Loja de pontos (#EuSouGrupoMutti)
function LojaPontosBanner({ API }) {
  const [saldo, setSaldo] = useState(null);
  useEffect(() => { API.get('/pontos/saldo').then(r => setSaldo(r.data.saldo)).catch(() => setSaldo(null)); }, [API]);
  const ir = () => window.dispatchEvent(new CustomEvent('mutti-nav', { detail: 'loja-pontos' }));
  return (
    <div onClick={ir} style={{
      display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', marginBottom: 14,
      background: 'linear-gradient(120deg,#5B3E86,#7A5AA8 55%,#2E7BC4)', color: '#fff',
      borderRadius: 14, padding: '14px 18px', boxShadow: '0 6px 18px rgba(91,62,134,.28)', flexWrap: 'wrap',
    }}>
      <div style={{ fontSize: 34 }}>🏅</div>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: .2 }}>Juntou, trocou! <span style={{ fontWeight: 400, opacity: .85, fontSize: 12 }}>#EuSouGrupoMutti</span></div>
        <div style={{ fontSize: 12.5, opacity: .92 }}>Acesse a loja virtual e troque seus pontos por brindes.</div>
      </div>
      <div style={{ textAlign: 'center', background: 'rgba(255,255,255,.15)', borderRadius: 12, padding: '8px 14px' }}>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{saldo ?? '—'}</div>
        <div style={{ fontSize: 10, opacity: .9 }}>pontos</div>
      </div>
      <button onClick={e => { e.stopPropagation(); ir(); }} style={{ background: '#fff', color: '#5B3E86', border: 'none', borderRadius: 20, padding: '9px 18px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Trocar pontos →</button>
    </div>
  );
}

function Gamificacao({ API }) {
  const [d, setD] = useState(null);
  const [regras, setRegras] = useState(false);
  useEffect(() => { API.get('/mural/ranking').then(r => setD(r.data)).catch(() => setD(null)); }, [API]);
  if (!d) return null;
  const medalha = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}º`;
  return (
    <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
      <div style={{ background: 'linear-gradient(120deg,#FBBF24,#F59E0B)', color: '#fff', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>🏆 Ranking do mês</div>
        <button onClick={() => setRegras(v => !v)} style={{ ...s.linkBtn, color: '#fff', fontWeight: 700 }}>como pontuar?</button>
      </div>
      <div style={{ padding: '8px 12px' }}>
        {regras && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: 11.5 }}>
            <div style={{ fontWeight: 700, color: '#92400E', marginBottom: 4 }}>Como ganhar pontos 👇</div>
            {d.regras.map((r, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', color: '#78350F', padding: '1px 0' }}><span>{r.acao}</span><span style={{ fontWeight: 800 }}>+{r.pts}</span></div>)}
          </div>
        )}
        {d.ranking.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Ninguém pontuou ainda. Bora participar? 🙌</div>}
        {d.ranking.slice(0, 8).map((v, i) => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
            <span style={{ width: 24, textAlign: 'center', fontSize: 13 }}>{medalha(i)}</span>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: '#2B3648' }}>{primeiro(v.nome)}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#B45309' }}>{v.pontos}</span>
          </div>
        ))}
        {d.minha_posicao && <div style={{ fontSize: 11, color: '#92400E', marginTop: 8, textAlign: 'center', fontWeight: 600 }}>Você: {d.minha_posicao}º · {d.meus_pontos} pts 💪</div>}
      </div>
    </div>
  );
}

// 🗣️ Canal de escuta — envio (todos)
function Ouvidoria({ API, onClose }) {
  const [tipo, setTipo] = useState('sugestao');
  const [texto, setTexto] = useState('');
  const [anonimo, setAnonimo] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState('');
  async function enviar() {
    if (!texto.trim()) { setErro('Escreva sua mensagem.'); return; }
    try { await API.post('/mural/ouvidoria', { tipo, texto, anonimo }); setOk(true); } catch (e) { setErro(e.response?.data?.erro || 'Erro ao enviar.'); }
  }
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>🗣️ Fale com a gente</div>
          <button onClick={onClose} style={s.xBtn}>✕</button>
        </div>
        {ok ? <div style={{ padding: 24, textAlign: 'center', color: '#3B6D11', fontSize: 14 }}>💚 Recebido! Obrigado por falar com a gente.</div> : (
          <>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Denúncia, sugestão, reclamação ou elogio — sua voz importa.</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {[['sugestao', '💡 Sugestão'], ['reclamacao', '⚠️ Reclamação'], ['denuncia', '🚨 Denúncia'], ['elogio', '👏 Elogio']].map(([v, l]) => (
                <button key={v} onClick={() => setTipo(v)} style={{ ...s.chip, ...(tipo === v ? s.chipOn : {}) }}>{l}</button>
              ))}
            </div>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5} placeholder="Escreva aqui…" style={{ ...s.input, resize: 'vertical' }} />
            <label style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}><input type="checkbox" checked={anonimo} onChange={e => setAnonimo(e.target.checked)} /> Enviar de forma anônima 🕵️</label>
            {erro && <div style={{ fontSize: 12, color: '#993C1D', marginBottom: 8 }}>{erro}</div>}
            <button onClick={enviar} style={{ ...s.btn, width: '100%' }}>Enviar</button>
          </>
        )}
      </div>
    </div>
  );
}

// 📬 Caixa da ouvidoria (gestão/RH/ouvidoria)
function OuvidoriaInbox({ API, onClose }) {
  const [msgs, setMsgs] = useState([]);
  const carregar = useCallback(() => API.get('/mural/ouvidoria').then(r => setMsgs(r.data.mensagens || [])).catch(() => {}), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const TIPO = { sugestao: '💡 Sugestão', reclamacao: '⚠️ Reclamação', denuncia: '🚨 Denúncia', elogio: '👏 Elogio' };
  async function resolver(id) { await API.patch(`/mural/ouvidoria/${id}`, { status: 'resolvido' }); carregar(); }
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>📬 Canal de escuta</div>
          <button onClick={onClose} style={s.xBtn}>✕</button>
        </div>
        {msgs.length === 0 && <div style={{ color: '#999', fontSize: 13 }}>Nenhuma mensagem por enquanto.</div>}
        {msgs.map(m => (
          <div key={m.id} style={{ borderTop: '1px solid #f2f2f2', padding: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ fontWeight: 700 }}>{TIPO[m.tipo] || m.tipo}</span>
              <span style={{ color: m.status === 'resolvido' ? '#3B6D11' : '#BA7517', fontWeight: 600 }}>{m.status}</span>
            </div>
            <div style={{ fontSize: 13, color: '#333', margin: '4px 0', whiteSpace: 'pre-wrap' }}>{m.texto}</div>
            <div style={{ fontSize: 11, color: '#999' }}>{m.anonimo ? '🕵️ Anônimo' : m.colaborador_nome} · {String(m.criado_em).slice(0, 10).split('-').reverse().join('/')}</div>
            {m.status !== 'resolvido' && <button onClick={() => resolver(m.id)} style={{ ...s.linkBtn, marginTop: 4 }}>marcar como resolvido</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// 💼 Patrocinado (marcas parceiras)
function Patrocinado({ API, ehGestao }) {
  const [d, setD] = useState(null);
  const [novo, setNovo] = useState(false);
  const [f, setF] = useState({ titulo: '', link: '', imagem: null });
  const carregar = useCallback(() => API.get('/mural/patrocinios').then(r => setD(r.data)).catch(() => setD(null)), [API]);
  useEffect(() => { carregar(); }, [carregar]);
  const lerImg = file => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  async function salvar() { if (!f.titulo && !f.imagem) return; await API.post('/mural/patrocinios', f); setF({ titulo: '', link: '', imagem: null }); setNovo(false); carregar(); }
  async function excluir(id) { if (!window.confirm('Remover este patrocínio?')) return; await API.delete(`/mural/patrocinios/${id}`); carregar(); }
  if (!d || (!d.patrocinios.length && !d.pode_gerenciar)) return null;
  return (
    <div style={s.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#9AA3B2', textTransform: 'uppercase', letterSpacing: 0.6 }}>Patrocinado</div>
        {d.pode_gerenciar && <button onClick={() => setNovo(v => !v)} style={s.linkBtn}>{novo ? 'fechar' : '+ marca'}</button>}
      </div>
      {novo && (
        <div style={{ background: '#F6F9FC', borderRadius: 8, padding: 8, marginBottom: 8 }}>
          <input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Nome da marca" style={{ ...s.input, marginBottom: 6 }} />
          <input value={f.link} onChange={e => setF({ ...f, link: e.target.value })} placeholder="Link (opcional)" style={{ ...s.input, marginBottom: 6 }} />
          <label style={s.linkBtn}>📷 Logo/banner<input type="file" accept="image/*" onChange={async e => { const file = e.target.files[0]; if (file) setF({ ...f, imagem: await lerImg(file) }); }} style={{ display: 'none' }} /></label>
          {f.imagem && <img src={f.imagem} alt="" style={{ maxWidth: '100%', borderRadius: 8, margin: '6px 0' }} />}
          <button onClick={salvar} style={{ ...s.btn, width: '100%' }}>Salvar</button>
        </div>
      )}
      {d.patrocinios.length === 0 && d.pode_gerenciar && <div style={{ fontSize: 11, color: '#bbb' }}>Espaço reservado para marcas parceiras. 💼</div>}
      {d.patrocinios.map(p => (
        <div key={p.id} style={{ position: 'relative', marginBottom: 8 }}>
          <a href={p.link || undefined} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
            {p.tem_imagem ? <img src={`/api/mural/patrocinios/${p.id}/imagem`} alt={p.titulo || ''} style={{ width: '100%', borderRadius: 8, display: 'block' }} />
              : <div style={{ background: '#F1F5F9', borderRadius: 8, padding: '14px 10px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>{p.titulo}</div>}
          </a>
          {ehGestao && <button onClick={() => excluir(p.id)} style={{ ...s.rmImg, top: 4, right: 4 }}>✕</button>}
        </div>
      ))}
    </div>
  );
}

function Institucional({ API, chave, ehGestao, onClose }) {
  const [doc, setDoc] = useState(null);
  const [edit, setEdit] = useState(false);
  const [texto, setTexto] = useState('');
  useEffect(() => {
    API.get('/mural/institucional').then(r => {
      const d = (r.data.documentos || []).find(x => x.chave === chave) || { titulo: chave, conteudo: '' };
      setDoc(d); setTexto(d.conteudo || '');
    });
  }, [API, chave]);
  async function salvar() { await API.put(`/mural/institucional/${chave}`, { titulo: doc.titulo, conteudo: texto }); setDoc({ ...doc, conteudo: texto }); setEdit(false); }
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{chave === 'regimento' ? '📋 Regimento Interno' : '📜 Código de Conduta'}</div>
          <button onClick={onClose} style={s.xBtn}>✕</button>
        </div>
        {!doc ? <div style={{ color: '#999' }}>Carregando…</div> : edit ? (
          <>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={16} style={{ ...s.input, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Escreva o conteúdo…" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEdit(false)} style={{ ...s.btn, background: '#eee', color: '#555' }}>Cancelar</button>
              <button onClick={salvar} style={s.btn}>Salvar</button>
            </div>
          </>
        ) : (
          <>
            {doc.conteudo ? <div style={{ fontSize: 14, color: '#333', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: '60vh', overflowY: 'auto' }}>{doc.conteudo}</div>
              : <div style={{ color: '#999', fontSize: 13 }}>Ainda não preenchido.{ehGestao ? ' Clique em “Editar” para adicionar.' : ''}</div>}
            {ehGestao && <div style={{ marginTop: 12, textAlign: 'right' }}><button onClick={() => setEdit(true)} style={s.btn}>✏️ Editar</button></div>}
          </>
        )}
      </div>
    </div>
  );
}

function PainelEngajamento({ API, usuario, onClose }) {
  const ehRede = ['Supervisor', 'Gestor Geral', 'Diretor Geral'].includes(usuario.funcao);
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState(ehRede ? 'todas' : (usuario.loja_id || ''));
  const [d, setD] = useState(null);
  useEffect(() => { if (ehRede) API.get('/referencias/lojas').then(r => setLojas(r.data.lojas || [])).catch(() => {}); }, [ehRede, API]);
  useEffect(() => { API.get('/mural/engajamento', { params: ehRede ? { loja_id: lojaId } : {} }).then(r => setD(r.data)).catch(() => setD(null)); }, [API, lojaId, ehRede]);
  const medalha = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}`;

  return (
    <div style={s.overlay} onClick={onClose}>
    <div style={s.modal} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>📊 Engajamento na comunidade × tarefas <span style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>· mês atual</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {ehRede && lojas.length > 0 && (
            <select value={lojaId} onChange={e => setLojaId(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', border: '1px solid #ddd', borderRadius: 8 }}>
              <option value="todas">Todas as lojas</option>
              {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          )}
          <button onClick={onClose} style={s.xBtn}>✕</button>
        </div>
      </div>
      {!d ? <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>Carregando…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14, marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#3B6D11', marginBottom: 6 }}>🏅 Mais engajados</div>
            {d.engajamento.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>Ninguém participou ainda este mês.</div>}
            {d.engajamento.slice(0, 10).map((v, i) => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #f2f2f2' }}>
                <span style={{ width: 22, textAlign: 'center', fontSize: 13 }}>{medalha(i)}</span>
                <div style={{ flex: 1, fontSize: 12 }}>{v.nome}<div style={{ fontSize: 10, color: '#aaa' }}>{v.posts}p · {v.comentarios}c · {v.curtidas}❤ · {v.conquistas}🏆</div></div>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#3B6D11' }}>{v.pontos}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#993C1D', marginBottom: 6 }}>⚠️ Precisam de atenção</div>
            {d.atrasos.length === 0 && <div style={{ fontSize: 12, color: '#3B6D11' }}>🎉 Ninguém pendente — tudo em dia!</div>}
            {d.atrasos.slice(0, 12).map(v => {
              const sinais = [];
              if (v.tarefas_atrasadas) sinais.push(`${v.tarefas_atrasadas} tarefa${v.tarefas_atrasadas > 1 ? 's' : ''} atrasada${v.tarefas_atrasadas > 1 ? 's' : ''}`);
              if (v.ciencia_pendente) sinais.push(`${v.ciencia_pendente} sem ciência`);
              if (v.encomendas) sinais.push(`${v.encomendas} encomenda${v.encomendas > 1 ? 's' : ''}`);
              if (v.ocorrencias) sinais.push(`${v.ocorrencias} ocorrência${v.ocorrencias > 1 ? 's' : ''}`);
              return (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #f2f2f2' }}>
                  <div style={{ flex: 1, fontSize: 12 }}>{v.nome}<div style={{ fontSize: 10, color: '#aaa' }}>{sinais.join(' · ')}{v.pontualidade != null ? ` · pontual. ${v.pontualidade}%` : ''}</div></div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#993C1D', background: '#FCEBEB', padding: '2px 8px', borderRadius: 6 }} title="Índice de atenção">{v.atencao}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ fontSize: 10, color: '#aaa', marginTop: 8 }}>Engajamento: post 5 · comentário 2 · curtida/leitura/voto 1 · conquista 10. Atenção: ocorrência 10 · tarefa atrasada 5 · sem ciência 3 · encomenda 2.</div>
    </div>
    </div>
  );
}

function Compositor({ API, usuario, ehGestao, onPost }) {
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState('post');
  const [titulo, setTitulo] = useState('');
  const [imagem, setImagem] = useState(null);
  const [exigeLeitura, setExigeLeitura] = useState(false);
  const [opcoes, setOpcoes] = useState(['', '']);
  const [enquete, setEnquete] = useState(false);   // enquete é um formato do post
  const [agendarEm, setAgendarEm] = useState('');   // marketing/gestão pode agendar
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const fileRef = useRef();
  const ehComunicado = tipo === 'comunicado';
  const podeAg = ehGestao || usuario.funcao === 'Marketing';

  const lerImg = f => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(f); });
  async function escolherImg(e) { const f = e.target.files[0]; if (!f) return; if (f.size > 5_000_000) { setErro('Imagem muito grande (máx 5MB).'); return; } setImagem(await lerImg(f)); }

  async function publicar() {
    setErro('');
    // Enquete é um formato: se tiver opções, o post vira uma enquete.
    const tipoFinal = enquete ? 'enquete' : tipo;
    const body = { tipo: tipoFinal, texto, titulo, imagem };
    if (enquete) body.opcoes = opcoes.filter(o => o.trim());
    if (ehComunicado) body.exige_leitura = exigeLeitura;
    if (podeAg && agendarEm) body.publicar_em = agendarEm;
    setEnviando(true);
    try {
      const r = await API.post('/mural/posts', body);
      setTexto(''); setTitulo(''); setImagem(null); setOpcoes(['', '']); setEnquete(false); setExigeLeitura(false); setTipo('post'); setAgendarEm('');
      if (fileRef.current) fileRef.current.value = '';
      if (r.data.agendado) setErro('✅ Post agendado! Aparece na data marcada.');
      onPost();
    } catch (e) { setErro(e.response?.data?.erro || 'Não consegui publicar.'); }
    finally { setEnviando(false); }
  }

  return (
    <div style={s.card}>
      <div style={{ display: 'flex', gap: 10 }}>
        {usuario.foto ? <img src={usuario.foto} alt="" style={{ ...s.avatar, objectFit: 'cover', padding: 0 }} /> : <div style={s.avatar}>{iniciais(usuario.nome)}</div>}
        <div style={{ flex: 1 }}>
          {ehGestao && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {[['post', '💬 Post'], ['comunicado', '📢 Comunicado']].map(([v, l]) => (
                <button key={v} onClick={() => setTipo(v)} style={{ ...s.chip, ...(tipo === v ? s.chipOn : {}) }}>{l}</button>
              ))}
            </div>
          )}
          {ehComunicado && <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título do comunicado" style={s.input} />}
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={ehComunicado ? 3 : 2}
            placeholder={enquete ? 'Faça sua pergunta…' : ehComunicado ? 'Escreva o comunicado' : `Escreva algo… (que tal um "${saudacao()}, equipe!"?)`}
            style={{ ...s.input, resize: 'vertical' }} />

          {enquete && (
            <div style={{ margin: '2px 0 8px', background: '#F7F4FC', border: '1px solid #E6DDF3', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#7A5AA8', marginBottom: 6 }}>📊 Opções da enquete</div>
              {opcoes.map((o, i) => (
                <input key={i} value={o} onChange={e => setOpcoes(opcoes.map((x, j) => j === i ? e.target.value : x))} placeholder={`Opção ${i + 1}`} style={{ ...s.input, marginBottom: 4 }} />
              ))}
              {opcoes.length < 5 && <button onClick={() => setOpcoes([...opcoes, ''])} style={s.linkBtn}>+ opção</button>}
            </div>
          )}
          {imagem && <div style={{ position: 'relative', marginBottom: 8 }}><img src={imagem} alt="" style={{ maxWidth: '100%', borderRadius: 10, maxHeight: 260 }} /><button onClick={() => setImagem(null)} style={s.rmImg}>✕</button></div>}
          {podeAg && agendarEm !== null && agendarEm !== undefined && agendarEm !== '' && (
            <div style={{ fontSize: 11, color: '#7C3AED', marginBottom: 6 }}>🕐 Agendado para {String(agendarEm).replace('T', ' ')}</div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={s.linkBtn}>📷 Foto<input ref={fileRef} type="file" accept="image/*" onChange={escolherImg} style={{ display: 'none' }} /></label>
            {ehGestao && <button onClick={() => setEnquete(v => !v)} style={{ ...s.linkBtn, fontWeight: enquete ? 700 : 400, color: enquete ? '#7A5AA8' : '#185FA5' }}>📊 Enquete{enquete ? ' ✓' : ''}</button>}
            {ehComunicado && <label style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={exigeLeitura} onChange={e => setExigeLeitura(e.target.checked)} /> confirmar leitura</label>}
            {podeAg && <label style={s.linkBtn} title="Agendar publicação">🕐 <input type="datetime-local" value={agendarEm} onChange={e => setAgendarEm(e.target.value)} style={{ fontSize: 11, border: '1px solid #ddd', borderRadius: 6, padding: '2px 4px' }} /></label>}
            <div style={{ flex: 1 }} />
            {erro && <span style={{ fontSize: 12, color: erro.startsWith('✅') ? '#3B6D11' : '#993C1D' }}>{erro}</span>}
            <button onClick={publicar} disabled={enviando} style={s.btn}>{enviando ? 'Publicando…' : (agendarEm ? 'Agendar' : 'Publicar')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const EMOJIS = ['❤️', '👏', '😂', '🎉', '😮', '😢', '🙏', '👍'];
function Post({ p, API, usuario, ehGestao, onChange }) {
  const [reacoes, setReacoes] = useState(p.reacoes || []);
  const [minhaR, setMinhaR] = useState(p.minha_reacao);
  const [nCurt, setNCurt] = useState(p.curtidas);
  const [picker, setPicker] = useState(false);
  const [coments, setComents] = useState(p.comentarios || []);
  const [nComent, setNComent] = useState(p.n_comentarios);
  const [txtComent, setTxtComent] = useState('');
  const [imgComent, setImgComent] = useState(null);
  const [abrirComent, setAbrirComent] = useState(false);
  const [li, setLi] = useState(p.li);
  const [enq, setEnq] = useState(p.enquete);
  const fileRef = useRef();

  const COR = { comunicado: '#185FA5', enquete: '#7A5AA8', conquista: '#3B6D11', aniversario: '#DB2777', kudos: '#B45309', post: '#555' };
  const TAG = { comunicado: '📢 Comunicado', enquete: '📊 Enquete', conquista: '🏆 Conquista', aniversario: '🎉 Comemoração', kudos: '🙌 Kudos', post: null };
  const festa = p.tipo === 'aniversario';

  async function reagir(emoji) {
    setPicker(false);
    const r = await API.post(`/mural/posts/${p.id}/curtir`, { emoji });
    setReacoes(r.data.reacoes); setMinhaR(r.data.minha_reacao); setNCurt(r.data.curtidas);
  }
  const lerImg = f => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(f); });
  async function escolherImgComent(e) { const f = e.target.files[0]; if (!f) return; if (f.size > 5_000_000) return; setImgComent(await lerImg(f)); }
  async function comentar() {
    if (!txtComent.trim() && !imgComent) return;
    await API.post(`/mural/posts/${p.id}/comentar`, { texto: txtComent, imagem: imgComent });
    const r = await API.get(`/mural/posts/${p.id}/comentarios`);
    setComents(r.data.comentarios); setNComent(r.data.comentarios.length); setTxtComent(''); setImgComent(null);
    if (fileRef.current) fileRef.current.value = '';
    setAbrirComent(true);
  }
  async function verTodosComent() { const r = await API.get(`/mural/posts/${p.id}/comentarios`); setComents(r.data.comentarios); setAbrirComent(true); }
  async function confirmarLeitura() { await API.post(`/mural/posts/${p.id}/li`, {}); setLi(true); }
  async function votar(opId) { try { await API.post(`/mural/posts/${p.id}/votar`, { opcao_id: opId }); const r = await API.get('/mural/feed'); const np = (r.data.posts || []).find(x => x.id === p.id); if (np) setEnq(np.enquete); } catch { /* já votou */ } }
  async function excluir() { if (!window.confirm('Excluir esta publicação?')) return; await API.delete(`/mural/posts/${p.id}`); onChange(); }

  const totVotos = enq ? enq.total_votos : 0;

  return (
    <div style={{ ...s.card, ...(festa ? { border: '1.5px solid #F9A8D4', background: 'linear-gradient(180deg,#FFF5FA,#ffffff 60%)' } : p.fixado ? { border: '1.5px solid #BBD3EC' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {p.autor_tem_foto && p.autor_id
            ? <img src={`/api/mural/foto/${p.autor_id}`} alt="" style={{ ...s.avatar, objectFit: 'cover', padding: 0 }} />
            : <div style={{ ...s.avatar, background: festa ? '#FCE7F3' : p.tipo === 'conquista' ? '#EAF3DE' : '#EAF3FB', color: festa ? '#DB2777' : p.tipo === 'conquista' ? '#3B6D11' : '#185FA5' }}>{p.tipo === 'conquista' && !festa ? '🏆' : iniciais(p.autor_nome)}</div>}
          {festa && <span className="mBounce" style={{ position: 'absolute', bottom: -3, right: -4, fontSize: 16 }}>{p.titulo ? [...p.titulo][0] : '🎉'}</span>}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{p.autor_nome || 'Mutti'}{p.autor_loja ? <span style={{ fontSize: 10, fontWeight: 600, color: '#185FA5', background: '#EAF3FB', borderRadius: 10, padding: '1px 7px', marginLeft: 6 }}>🏪 {p.autor_loja}</span> : null}{p.fixado ? <span style={{ fontSize: 10, color: '#185FA5', marginLeft: 6 }}>📌 fixado</span> : null}</div>
          <div style={{ fontSize: 11, color: '#999' }}>{tempo(p.criado_em)}{TAG[p.tipo] ? <span style={{ color: COR[p.tipo], marginLeft: 6, fontWeight: 600 }}>{TAG[p.tipo]}</span> : null}{p.loja_id ? ' · só sua loja' : ''}</div>
        </div>
        {(p.eh_meu || ehGestao) && <button onClick={excluir} title="Excluir" style={s.xBtn}>✕</button>}
      </div>

      {p.titulo && <div style={{ fontSize: 15, fontWeight: 700, margin: '10px 0 2px', color: COR[p.tipo] }}>{p.titulo}</div>}
      {p.texto && <div style={{ fontSize: 14, color: '#333', whiteSpace: 'pre-wrap', marginTop: 8, lineHeight: 1.5 }}>{p.texto}</div>}
      {p.tem_imagem && <img src={`/api/mural/posts/${p.id}/imagem`} alt="" style={{ maxWidth: '100%', borderRadius: 10, marginTop: 10, maxHeight: 420 }} />}

      {enq && (
        <div style={{ marginTop: 10 }}>
          {enq.opcoes.map(o => {
            const pct = totVotos ? Math.round((o.votos / totVotos) * 100) : 0;
            const votou = !!enq.meu_voto, meu = enq.meu_voto === o.id;
            return (
              <button key={o.id} onClick={() => !votou && votar(o.id)} disabled={votou}
                style={{ position: 'relative', width: '100%', textAlign: 'left', border: `1px solid ${meu ? '#7A5AA8' : '#e5e5e5'}`, background: '#fff', borderRadius: 10, padding: '9px 12px', margin: '4px 0', cursor: votou ? 'default' : 'pointer', overflow: 'hidden' }}>
                {votou && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: meu ? '#EFE8F7' : '#f2f2f2' }} />}
                <span style={{ position: 'relative', fontSize: 13, fontWeight: meu ? 700 : 400 }}>{o.texto}</span>
                {votou && <span style={{ position: 'relative', float: 'right', fontSize: 12, color: '#666' }}>{pct}% ({o.votos})</span>}
              </button>
            );
          })}
          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{totVotos} voto{totVotos !== 1 ? 's' : ''}{enq.meu_voto ? ' · você votou' : ''}</div>
        </div>
      )}

      {p.exige_leitura && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          {li ? <span style={{ fontSize: 12, color: '#3B6D11', fontWeight: 600 }}>✓ Leitura confirmada</span>
            : <button onClick={confirmarLeitura} style={{ ...s.btn, background: '#185FA5' }}>✓ Confirmar leitura</button>}
          {ehGestao && <span style={{ fontSize: 11, color: '#999' }}>{p.total_leram} confirmaram</span>}
        </div>
      )}

      {reacoes.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: 13, color: '#777' }}>
          {reacoes.slice(0, 4).map(r => <span key={r.emoji}>{r.emoji}</span>)}
          <span style={{ marginLeft: 2 }}>{nCurt}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, marginTop: 10, borderTop: '1px solid #f2f2f2', paddingTop: 10, position: 'relative' }}>
        <button onClick={() => (minhaR ? reagir(minhaR) : setPicker(v => !v))} style={{ ...s.acao, color: minhaR ? '#E0245E' : '#666', fontWeight: minhaR ? 700 : 400 }}>
          {minhaR || '🙂'} {minhaR ? 'Reagiu' : 'Reagir'}
        </button>
        <button onClick={() => (abrirComent ? setAbrirComent(false) : verTodosComent())} style={s.acao}>💬 {nComent > 0 ? nComent : ''} Comentar</button>
        {picker && (
          <div style={{ position: 'absolute', bottom: 34, left: 0, background: '#fff', border: '1px solid #eee', borderRadius: 24, padding: '6px 8px', boxShadow: '0 4px 16px rgba(0,0,0,.12)', display: 'flex', gap: 4, zIndex: 5 }}>
            {EMOJIS.map(e => <button key={e} onClick={() => reagir(e)} style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>{e}</button>)}
          </div>
        )}
      </div>

      {(coments.length > 0 || abrirComent) && (
        <div style={{ marginTop: 8 }}>
          {!abrirComent && nComent > coments.length && <button onClick={verTodosComent} style={s.linkBtn}>ver todos os {nComent} comentários</button>}
          {coments.map((c, i) => (
            <div key={c.id || i} style={{ fontSize: 13, padding: '4px 0' }}>
              <div><strong>{c.autor_nome}</strong>{c.autor_loja ? <span style={{ color: '#185FA5', fontSize: 10, fontWeight: 600 }}> 🏪 {c.autor_loja}</span> : null} {c.texto && <span style={{ color: '#333' }}>{c.texto}</span>} <span style={{ color: '#bbb', fontSize: 11 }}>· {tempo(c.criado_em)}</span></div>
              {c.tem_imagem && <img src={`/api/mural/comentarios/${c.id}/imagem`} alt="" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, marginTop: 4 }} />}
            </div>
          ))}
        </div>
      )}
      {imgComent && <div style={{ position: 'relative', display: 'inline-block', marginTop: 8 }}><img src={imgComent} alt="" style={{ maxHeight: 120, borderRadius: 8 }} /><button onClick={() => setImgComent(null)} style={s.rmImg}>✕</button></div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
        <label style={{ ...s.acao, cursor: 'pointer', fontSize: 18 }} title="Comentar com foto">📷<input ref={fileRef} type="file" accept="image/*" onChange={escolherImgComent} style={{ display: 'none' }} /></label>
        <input value={txtComent} onChange={e => setTxtComent(e.target.value)} onKeyDown={e => e.key === 'Enter' && comentar()} placeholder="Escreva um comentário…" style={{ ...s.input, marginBottom: 0 }} />
        <button onClick={comentar} style={{ ...s.btn, background: '#eef2f6', color: '#185FA5' }}>Enviar</button>
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 1320, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  titulo: { fontSize: 20, fontWeight: 700 }, sub: { fontSize: 12, color: '#666', marginBottom: 14 },
  banner: { background: 'linear-gradient(120deg,#2E7BC4 0%,#185FA5 45%,#0E3E6E 100%)', color: '#fff', borderRadius: 18, padding: '24px 26px', marginBottom: 16, position: 'relative', overflow: 'hidden', boxShadow: '0 6px 22px rgba(14,62,110,.28)' },
  bannerArt: { position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', fontSize: 84, opacity: 0.16, lineHeight: 1 },
  colunas: { display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  lateral: { flex: '1 1 200px', maxWidth: 250, display: 'flex', flexDirection: 'column', gap: 14 },
  centro: { flex: '2 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column' },
  lateralDir: { flex: '1 1 240px', maxWidth: 330 },
  linkItem: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: 8, padding: '9px 10px', fontSize: 13, color: '#333', cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: 18, width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto' },
  card: { background: '#fff', border: '1px solid #eceef2', borderRadius: 14, padding: '14px 16px', marginBottom: 14, boxShadow: '0 1px 2px rgba(16,40,80,.04)' },
  avatar: { width: 40, height: 40, borderRadius: '50%', background: '#EAF3FB', color: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 },
  linkIco: { display: 'inline-block', width: 20, textAlign: 'center', marginRight: 4 },
  input: { width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 10, padding: '9px 11px', fontSize: 14, marginBottom: 8, fontFamily: 'inherit' },
  btn: { fontSize: 13, padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 },
  chip: { fontSize: 12, padding: '5px 10px', border: '1px solid #ddd', borderRadius: 20, background: '#fff', cursor: 'pointer', color: '#666' },
  chipOn: { background: '#111', color: '#fff', borderColor: '#111' },
  linkBtn: { fontSize: 12, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  acao: { fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: '#666' },
  rmImg: { position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer' },
  xBtn: { background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 14 },
};
