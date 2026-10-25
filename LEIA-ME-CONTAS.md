# Contas (nome + senha)

Como funciona: a pessoa escolhe **nome de usuário** (3 a 16: letras, números, `_` `.` `-`) e **senha** (mín. 5) → conta criada. Depois entra com nome + senha, em qualquer aparelho. O nome da conta é o nome que aparece nas salas. Não usa e-mail, então **não existe "esqueci a senha"** (quem perder a senha precisa criar outra conta).

> Enquanto você **não** colocar `REQUIRE_LOGIN=1` no Render, o jogo continua aberto como antes (sem login). A tela de conta fica em **Opções → Conta**.

## O que ligar no Render
O Render grátis **apaga arquivos quando reinicia**, então as contas precisam de um banco de dados grátis: **Supabase**.

### 1) Supabase
1. Crie conta em **supabase.com** e um **New project**.
2. Em **SQL Editor**, cole e rode (**Run**):
```sql
create table sl_users (id text primary key, data jsonb not null);
alter table sl_users enable row level security;
```
3. Em **Project Settings → API**, copie o **Project URL** e a chave **service_role** (secreta!).

### 2) Variáveis no Render (Environment → Add Environment Variable)
| Nome | Valor |
|---|---|
| `REQUIRE_LOGIN` | `1` |
| `STORE` | `supabase` |
| `SUPABASE_URL` | (Project URL) |
| `SUPABASE_KEY` | (service_role) |

Salve; o Render reinicia sozinho. **Nunca** coloque essas chaves no GitHub nem mande para ninguém.

## Testar sem Supabase
Sem `STORE`, as contas ficam num arquivo (`data/users.json`). Serve para testar no computador; no Render grátis elas somem quando o servidor reinicia.

## Segurança incluída
Senha guardada só como hash (scrypt) · tokens guardados só como hash · bloqueio após tentativas erradas · limite de cadastros por IP · nomes únicos sem diferenciar maiúsculas.

## Arquivos
`server/auth.js` (servidor) · `js/auth.js` e `js/auth-screens.js` (telas) · rotas `/api/auth/*`.
