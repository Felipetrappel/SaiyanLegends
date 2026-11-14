# Contas (nome + senha)

Como funciona: a pessoa escolhe **nome de usuário** (3 a 16: letras, números, `_` `.` `-`) e **senha** (mín. 5) → conta criada. Depois entra com nome + senha, em qualquer aparelho. O nome da conta é o nome que aparece nas salas. Não usa e-mail, então **não existe "esqueci a senha"** (quem perder a senha precisa criar outra conta).

> Enquanto você **não** colocar `REQUIRE_LOGIN=1` no Render, o jogo continua aberto como antes (sem login). A tela de conta fica em **Opções → Conta**.

## Onde ficam os dados (PostgreSQL do Render)
Contas **e progresso** (moedas, diamantes, XP/nível, personagens, personagem escolhido, missões, atributos/upgrades/formas/técnicas, som) ficam num **PostgreSQL**, escolhido pela variável **`DATABASE_URL`**. As tabelas (`players`, `sessions`, `player_progress`) são criadas sozinhas na primeira inicialização. Contas antigas de `data/users.json` ou do Supabase são **copiadas** para o Postgres automaticamente (sem apagar nada).

Passo a passo no painel do Render: ver a resposta final do assistente / abaixo.

1. Render → **New +** → **PostgreSQL** → nome `saiyan-legends-db`, região **a mesma do servidor**, plano **Free** ou pago → **Create Database**.
2. Quando estiver *Available*: copie a **Internal Database URL**.
3. Serviço do jogo → **Environment** → **Add Environment Variable**: `DATABASE_URL` = a URL copiada. (Recomendado também: `REQUIRE_LOGIN` = `1`.)
4. Em **Settings → Build Command** deixe `npm install` (instala o pacote `pg`). **Start Command**: `npm start`.
5. **Save**, e **Manual Deploy → Deploy latest commit**. No log deve aparecer `postgres: conectado, tabelas prontas`.
6. Teste: abra `https://SEU-SERVIDOR.onrender.com/api/auth/config` → deve mostrar `"store":"postgres"`.

> O Postgres **Free** do Render expira após 30 dias (os dados são apagados se não passar para um plano pago). Para guardar de verdade, use um plano pago (Basic).

## Como o progresso é salvo
Logado, o jogo baixa o progresso da conta ao abrir e envia cada mudança (em ~1 segundo e ao fechar/esconder a página). Sem conta ou sem conexão, continua salvando só no aparelho e sobe depois. Se a mesma conta mudar em dois aparelhos, vale o do servidor e o progresso local fica em `localStorage 'sl.profile.backup'`. Ao sair da conta, o progresso do aparelho é limpo (continua na conta). Rotas: `POST /api/auth/profile` e `POST /api/auth/save`.

## Testar sem Postgres
Sem `DATABASE_URL` e sem `STORE`, as contas ficam num arquivo (`data/users.json`). Serve para testar no computador; no Render elas somem quando o servidor reinicia.

## Segurança incluída
Senha guardada só como hash (scrypt) · tokens guardados só como hash · bloqueio após tentativas erradas · limite de cadastros por IP · nomes únicos sem diferenciar maiúsculas.

## Arquivos
`server/auth.js` (servidor) · `js/auth.js` e `js/auth-screens.js` (telas) · rotas `/api/auth/*`.
