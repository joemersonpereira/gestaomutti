# Guia de Deploy — Sistema Mutti

Objetivo: colocar o sistema no ar com um **link de verdade** (ex.: `mutti-sistema.onrender.com`),
acessível de qualquer celular ou computador, **sem instalar nada na sua máquina**.

Vamos usar duas ferramentas gratuitas:
- **GitHub** — onde o código fica guardado (como um "Google Drive de código").
- **Render** — onde o sistema roda e ganha o link.

Tempo estimado: ~20 minutos na primeira vez.

> ⚠️ **Sobre os dados (importante):** no plano gratuito, o banco de dados é **reiniciado a cada
> atualização** do sistema (volta aos dados de exemplo). Isso é ótimo para **demonstrar e testar**.
> Quando quiser guardar dados de verdade de forma permanente, veja a seção "Indo para produção" no fim.

---

## Parte 1 — Subir o código para o GitHub (sem terminal)

A forma mais fácil sem usar comandos é com o programa **GitHub Desktop**.

1. Crie uma conta gratuita em **https://github.com** (se ainda não tiver).
2. Baixe e instale o **GitHub Desktop**: https://desktop.github.com
3. Descompacte o arquivo `mutti-sistema-12-modulos.zip` numa pasta (ex.: `Documentos/mutti-sistema`).
4. Abra o GitHub Desktop → **File → Add Local Repository** → escolha essa pasta.
   - Se ele disser que "não é um repositório", clique em **"create a repository"** (criar um) e confirme.
5. Clique em **Publish repository** (publicar). Pode deixar marcado "Keep this code private" (privado).

Pronto — seu código está no GitHub.

---

## Parte 2 — Publicar na Render

1. Crie uma conta gratuita em **https://render.com** (dá pra entrar com a própria conta do GitHub).
2. No painel, clique em **New +** → **Blueprint**.
3. Conecte/selecione o repositório `mutti-sistema` que você acabou de publicar.
4. A Render vai **ler o arquivo `render.yaml`** que já vem no projeto e preencher tudo sozinha
   (build, banco, segredos). É só conferir e clicar em **Apply** / **Create**.
5. Aguarde o deploy (alguns minutos na primeira vez — ele instala, compila o frontend e cria o banco).

Quando terminar, a Render mostra o link no topo, algo como:
```
https://mutti-sistema.onrender.com
```
Esse é o seu sistema no ar. Abra no navegador ou no celular.

---

## Login para testar

- **Diretor:** `carlos@grupomutti.com.br` / `Mutti@2026`
- **Gerente:** `renato@grupomutti.com.br` / `Mutti123`

---

## Atualizar o sistema depois

Sempre que o desenvolvedor mexer no código:
1. No GitHub Desktop, clique em **Commit** (escreva uma frase do que mudou) e depois **Push**.
2. A Render detecta sozinha e republica em 1–2 minutos. O link continua o mesmo.

---

## Perguntas comuns

**O link fica lento na primeira vez que abro.**
No plano gratuito da Render, o sistema "dorme" após um tempo sem uso e leva ~30s para acordar no
primeiro acesso. Depois fica normal. Planos pagos não dormem.

**Apareceu "Application failed to respond" / erro no deploy.**
Quase sempre é o build ainda rodando — espere terminar. Se persistir, abra a aba **Logs** na Render;
a mensagem de erro costuma indicar o que faltou.

**Posso usar Railway, Fly.io ou uma VPS em vez da Render?**
Pode. O projeto está preparado como **serviço único** (o backend serve o frontend), então funciona
em qualquer hospedagem Node. Comandos equivalentes:
- Build: `cd frontend && npm install && npm run build && cd ../backend && npm install && node src/db/setup.js`
- Start: `cd backend && npm start`
- Variáveis: `NODE_ENV=production`, `DB_PATH=./db/mutti.db`, `JWT_SECRET=<um segredo forte>`

---

## Indo para produção (guardar dados de verdade)

O SQLite atual guarda tudo num arquivo, que some quando o serviço reinicia no plano grátis.
Para dados permanentes, há dois caminhos (tarefa para o desenvolvedor):

1. **Disco persistente** (mais simples): na Render, adicionar um *Persistent Disk* (plano pago) e
   apontar `DB_PATH` para uma pasta nesse disco. O código não muda — só o caminho do banco.
2. **Trocar para um banco gerenciado** (mais robusto): migrar de SQLite para **PostgreSQL**
   (a Render oferece Postgres gerenciado). Exige ajuste na camada de acesso a dados.

Para uma rede de farmácias em uso real, a opção 2 é a recomendada a médio prazo.
