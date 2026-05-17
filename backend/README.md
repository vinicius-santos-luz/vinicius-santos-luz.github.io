# Backend do Cofre de Acessos

API local para usuarios, workspace da empresa, membros e credenciais privadas/compartilhadas.

## Rodar

```powershell
cd "C:\Users\ViniciusLuz\Documents\New project\backend"
$env:JWT_SECRET="troque-esta-chave"
node src/server.mjs
```

Por padrao a API abre em:

`http://localhost:8787`

## Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/workspaces`
- `GET /api/workspaces/:id/members`
- `POST /api/workspaces/:id/members`
- `GET /api/vault-items?scope=all|private|shared&workspaceId=...`
- `POST /api/vault-items`
- `GET /api/vault-items/:id`
- `PUT /api/vault-items/:id`
- `DELETE /api/vault-items/:id`
- `GET /api/audit-log`

## Modelo de seguranca

- Cada usuario tem login proprio.
- Credenciais privadas pertencem ao `ownerUserId`.
- Credenciais compartilhadas pertencem ao `workspaceId`.
- Membros podem ter papel `admin`, `editor` ou `viewer`.
- Senhas de login sao armazenadas com `scrypt`.
- Tokens sao assinados com HMAC SHA-256.

## Observacao importante

Este backend aceita `encryptedData` como envelope de dados. O ideal e o frontend criptografar as credenciais no navegador antes de enviar para a API, assim o servidor nunca recebe senha em texto puro.
