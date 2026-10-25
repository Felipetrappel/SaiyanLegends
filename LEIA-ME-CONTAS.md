# Contas (cadastro pelo Gmail com código)

Como funciona: a pessoa digita o **Gmail** → o jogo envia um **código de 6 dígitos** → ela confirma, escolhe **apelido e senha** → pronto. Depois entra com Gmail + senha. Tem **"Esqueci a senha"** (também por código). A conta vale em qualquer aparelho e o apelido da conta é o nome que aparece nas salas.

> Enquanto você **não** colocar `REQUIRE_LOGIN=1` no Render, o jogo continua aberto como antes (sem login). A tela de conta existe em **Opções → Conta**.

## O que você precisa (2 coisas, as duas grátis)
O Render grátis **não deixa enviar e-mail por SMTP (Gmail direto)** e **apaga arquivos quando reinicia**. Por isso:
1. Um **serviço de envio de e-mail** → **Brevo** (grátis, ~300 e-mails/dia)
2. Um **banco de dados** para guardar as contas → **Supabase** (grátis)

### 1) Brevo (envia o código)
1. Crie conta em **brevo.com**.
2. Vá em **Senders, Domains & Dedicated IPs → Senders → Add a sender**. Coloque o **seu Gmail** (o que vai aparecer como remetente) e confirme pelo e-mail que o Brevo mandar.
3. Vá em **SMTP & API → API Keys → Generate a new API key**. Copie a chave (começa com `xkeysib-`).
> Aviso: e-mails enviados por serviço em nome de um endereço @gmail.com podem cair no **Spam**. Funciona, mas peça para a pessoa olhar o Spam. O ideal (mais pra frente) é ter um domínio próprio.

### 2) Supabase (guarda as contas)
1. Crie conta em **supabase.com** e um **New project** (anote a senha do banco; não será usada aqui).
2. No menu **SQL Editor**, cole e rode (**Run**):
```sql
create table sl_users (id text primary key, data jsonb not null);
alter table sl_users enable row level security;
```
3. Em **Project Settings → API**, copie:
   - **Project URL** (algo como `https://abcd.supabase.co`)
   - a chave **service_role** (secreta!)

### 3) Colocar tudo no Render
No seu serviço do Render: **Environment → Add Environment Variable** e crie estas:

| Nome | Valor |
|---|---|
| `REQUIRE_LOGIN` | `1` |
| `MAIL` | `brevo` |
| `BREVO_API_KEY` | (chave do Brevo) |
| `MAIL_FROM` | (seu Gmail, o mesmo que confirmou no Brevo) |
| `STORE` | `supabase` |
| `SUPABASE_URL` | (Project URL) |
| `SUPABASE_KEY` | (service_role) |

Salve; o Render reinicia sozinho. **Nunca** coloque essas chaves no GitHub nem mande para ninguém.

## Alternativa: mandar direto pelo seu Gmail (SMTP)
Só funciona fora do Render grátis (Render pago ou outro servidor).
1. No Google: **Conta → Segurança → Verificação em duas etapas** (ligue) → **Senhas de app** → crie uma (16 letras).
2. Variáveis: `MAIL=smtp`, `SMTP_USER=seu@gmail.com`, `SMTP_PASS=senha-de-app`.

## Testar sem e-mail de verdade
`MAIL=console` (padrão) só escreve o código no **log** do servidor. Serve para testar; não use para jogadores reais.

## Regras de segurança já incluídas
Senha guardada só como hash (scrypt) · código vale 10 min, 5 tentativas · 1 código por minuto por Gmail · limite por IP · bloqueio de tentativas de senha · só `@gmail.com` · `fe.lipe+x@gmail.com` e `felipe@gmail.com` contam como a mesma conta.

## Arquivos
`server/auth.js` (servidor) · `js/auth.js` e `js/auth-screens.js` (telas) · rotas `/api/auth/*`.
