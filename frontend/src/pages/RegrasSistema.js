import React from 'react';
import Banner from '../components/Banner';

const nav = id => window.dispatchEvent(new CustomEvent('mutti-nav', { detail: id }));

// Catálogo curado: o que o sistema decide, de onde vem o dado, e o que dá pra configurar.
// tipo: 'config' (você ajusta) · 'auto' (dado automático, você ajusta peso) · 'fonte' (ainda fixo no código)
const GRUPOS = [
  {
    titulo: '🧮 Como cada função é avaliada (nota da pessoa)',
    itens: [
      { nome: 'Vendedor — 5 indicadores', fonte: 'ERP + lançamento manual', config: 'nome, peso e % aceitável', onde: 'Parâmetros › Indicadores por função', tipo: 'config' },
      { nome: 'Conferente — Erros de entrada / Recepção de transporte', fonte: 'automático do ERP (recebimento)', config: 'peso e % aceitável (o valor é automático)', onde: 'Parâmetros › Indicadores por função', tipo: 'auto' },
      { nome: 'Conferente — Organização do estoque', fonte: 'automático do checklist do gerente', config: 'peso e % aceitável', onde: 'Parâmetros › Indicadores por função', tipo: 'auto' },
      { nome: 'Conferente — Devoluções', fonte: 'automático do módulo de Devoluções', config: 'peso e % aceitável', onde: 'Parâmetros › Indicadores por função', tipo: 'auto' },
      { nome: 'Farmacêutico / Estagiário — critérios', fonte: 'avaliação manual (gerente)', config: 'nome, peso e % aceitável', onde: 'Parâmetros › Indicadores por função', tipo: 'config' },
      { nome: 'Caixa — nota pela diferença de caixa', fonte: 'fórmula (escala diferença → nota)', config: 'a escala (faixas R$ → nota)', ir: 'caixa', onde: 'Tesouraria › Critérios', tipo: 'config' },
    ],
  },
  {
    titulo: '🏪 Nota da loja / gerente',
    itens: [
      { nome: 'Pilares da loja (compõem a nota do gerente)', fonte: 'indicadores por pilar (checklist, ocorrências, ERP)', config: 'pilares, indicadores e mínimos', onde: 'Parâmetros › Pilares da loja', tipo: 'config' },
    ],
  },
  {
    titulo: '💰 Premiação (quanto cada um recebe)',
    itens: [
      { nome: 'Premiação por função (faixas em R$)', fonte: 'você cadastra', config: 'valor R$ de cada faixa (nota 100 / ≥90% …)', onde: 'Parâmetros › Regra de premiação', tipo: 'config' },
      { nome: 'Premiação do VENDEDOR (% sobre a venda: super / meta / parcial)', fonte: 'você define os %', config: 'os 3 percentuais + nota mínima p/ o super', onde: 'Parâmetros › Regra de premiação › Premiação sobre vendas', tipo: 'config' },
      { nome: 'Premiação do GERENTE (% conforme a nota dos pilares)', fonte: 'você define os %', config: 'o % de cada faixa de nota', onde: 'Parâmetros › Regra de premiação › Premiação sobre vendas', tipo: 'config' },
    ],
  },
  {
    titulo: '🏦 Tesouraria / Caixa (pontos e cobranças)',
    itens: [
      { nome: 'Caixa zerado → ganha pontos', fonte: 'regra do sistema', config: 'quantos pontos (0 = desliga)', ir: 'caixa', onde: 'Tesouraria › Quebras', tipo: 'config' },
      { nome: 'Quebra de caixa → desconta pontos', fonte: 'regra do sistema', config: 'pontos descontados', ir: 'caixa', onde: 'Tesouraria › Quebras', tipo: 'config' },
      { nome: 'Operador destaque → prêmio em pontos', fonte: 'regra do sistema', config: 'pontos do prêmio', ir: 'caixa', onde: 'Tesouraria', tipo: 'config' },
      { nome: 'Limite p/ cobrar a quebra', fonte: 'regra do sistema', config: 'valor limite (R$)', ir: 'caixa', onde: 'Tesouraria › Quebras', tipo: 'config' },
    ],
  },
  {
    titulo: '📋 Ocorrências, Ponto e Escala',
    itens: [
      { nome: 'Ocorrência → impacto no indicador e/ou pontos', fonte: 'você cadastra o motivo', config: 'dedução %, zera, e pontos', onde: 'Parâmetros › Ocorrências', tipo: 'config' },
      { nome: 'Ponto pendente / falta → abre tarefa + penalidade', fonte: 'regra do sistema (Tangerino)', config: 'ligar/desligar e os pontos', ir: 'ponto', onde: 'Ponto › Configuração', tipo: 'config' },
      { nome: 'Não confirmar a escala → perde % em conduta', fonte: 'regra do sistema', config: 'o % de dedução', ir: 'calendario', onde: 'Feriados e Escala', tipo: 'config' },
    ],
  },
  {
    titulo: '🏅 Gamificação (#EuSouGrupoMutti)',
    itens: [
      { nome: 'Pontos por conquista (super meta, indicador, CMV, avaliação…)', fonte: 'regra do sistema', config: 'quantos pontos cada conquista vale', ir: 'loja-pontos', onde: 'Loja de pontos › Config', tipo: 'config' },
    ],
  },
];

const TAG = {
  config: { l: 'Configurável', c: '#0E5C33', bg: '#EAF3E9' },
  auto: { l: 'Automático (dado)', c: '#0C447C', bg: '#E7F0FA' },
  fonte: { l: 'No código-fonte', c: '#7a5307', bg: '#FBF0DA' },
};

export default function RegrasSistema() {
  const totalFonte = GRUPOS.flatMap(g => g.itens).filter(i => i.tipo === 'fonte').length;
  return (
    <div style={s.wrap}>
      <Banner emoji="📋" titulo="Regras do sistema (fonte)" cor="roxo" sub="O raio-x do que o sistema decide sozinho: o que é, de onde vem o dado, e o que você pode configurar." />

      <div style={s.legenda}>
        <span style={{ ...s.tag, background: TAG.config.bg, color: TAG.config.c }}>Configurável</span> você ajusta na tela indicada ·
        <span style={{ ...s.tag, background: TAG.auto.bg, color: TAG.auto.c, marginLeft: 6 }}>Automático</span> o valor vem sozinho (ERP/checklist); você ajusta o peso ·
        <span style={{ ...s.tag, background: TAG.fonte.bg, color: TAG.fonte.c, marginLeft: 6 }}>No código-fonte</span> ainda fixo (a migrar)
      </div>
      {totalFonte > 0 && <div style={{ ...s.card, background: '#FBF0DA', borderColor: '#F0E0B8', fontSize: 12.5, color: '#7a5307' }}>⚠️ {totalFonte} regra(s) ainda estão fixas no código (a premiação % do vendedor e do gerente). Já está proposto torná-las configuráveis — é só pedir.</div>}

      {GRUPOS.map(g => (
        <div key={g.titulo} style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{g.titulo}</div>
          {g.itens.map((i, idx) => {
            const t = TAG[i.tipo];
            return (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderTop: idx ? '1px solid #f5f5f5' : 'none', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{i.nome}</div>
                  <div style={{ fontSize: 11.5, color: '#777', marginTop: 2 }}>📥 <b>Fonte:</b> {i.fonte} · ⚙️ <b>Você configura:</b> {i.config}{i.onde ? ` · 📍 ${i.onde}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ ...s.tag, background: t.bg, color: t.c, whiteSpace: 'nowrap' }}>{t.l}</span>
                  {i.ir && <button onClick={() => nav(i.ir)} style={s.ir}>abrir ↗</button>}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div style={s.info}>💡 Ideia: tudo o que hoje está <b>no código-fonte</b> a gente vai migrando pra <b>configurável</b>, e este catálogo mostra o progresso. Quando algo novo for criado "por código", entra aqui — assim você sempre sabe o que o sistema decide sozinho.</div>
    </div>
  );
}

const s = {
  wrap: { padding: '1rem', maxWidth: 960, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  card: { background: '#fff', border: '1px solid #edf0f4', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.05)', padding: '1rem', marginBottom: 10 },
  legenda: { fontSize: 11.5, color: '#666', margin: '2px 2px 12px', lineHeight: 1.9 },
  tag: { fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20 },
  ir: { fontSize: 11.5, padding: '4px 10px', background: '#fff', color: '#6A3AB0', border: '1px solid #d8c9ee', borderRadius: 7, cursor: 'pointer', fontWeight: 600 },
  info: { background: '#F3EFFA', borderLeft: '3px solid #6A3AB0', borderRadius: '0 8px 8px 0', padding: '10px 12px', fontSize: 12, color: '#4b2f7a', lineHeight: 1.6, marginTop: 4 },
};
