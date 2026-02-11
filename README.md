# whats-bot-base

## Logins padrão (dashboard)

Na primeira execução, se `data/users.json` não existir, o sistema cria automaticamente usando `users.example.json`.

Credenciais padrão:

- **Admin**
  - usuário: `admin`
  - senha: `admin123`
  - painel: `/admin.html`

- **Agente EFCOL**
  - usuário: `efcol.at1`
  - senha: `123`
  - painel: `/dashboard.html`

- **Agente ALEF**
  - usuário: `alef.at1`
  - senha: `123`
  - painel: `/dashboard.html`

- **Agente Seja Profeta**
  - usuário: `seja.at1`
  - senha: `123`
  - painel: `/dashboard.html`

## Como esconder / proteger credenciais (produção)

1. **Nunca versionar credenciais reais**
   - mantenha apenas `users.example.json` no repositório
   - use `data/users.json` somente local/servidor (já está ignorado no git)

2. **Trocar senhas padrão imediatamente**
   - edite `data/users.json`
   - use senhas longas (12+ caracteres)

3. **Restringir acesso ao arquivo** (Linux)
   - `chmod 600 data/users.json`

4. **Sessão/cookie**
   - em produção HTTPS, evoluir para cookie com `Secure` e assinatura/HMAC do cookie

5. **Próximo passo recomendado**
   - migrar de senha em texto puro para hash (`bcrypt`/`argon2`) no `users.json`

## Inicialização

```bash
npm install
npm run dev
```

API sobe por padrão em `http://localhost:3334`.
