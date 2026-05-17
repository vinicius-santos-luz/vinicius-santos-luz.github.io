# Cofre de Acessos

Aplicativo web local para armazenar emails, senhas, bancos, agencias, contas e acessos de aplicativos.

## Cofre privado e compartilhado

O app tem dois modos:

- Privado: credenciais pessoais do usuario.
- Compartilhado: credenciais que podem ser usadas pela equipe.

Em uma credencial privada, use **Compartilhar** para criar uma copia no cofre compartilhado com sincronizacao automatica.

Enquanto a sincronizacao estiver ativa:

- editar e salvar a credencial privada atualiza a copia compartilhada;
- a copia compartilhada fica visivel no modo Compartilhado;
- **Parar sync** interrompe novas atualizacoes e mantem a copia compartilhada como item independente.

Esta versao ainda salva tudo no navegador atual. Para varios funcionarios acessarem o mesmo cofre compartilhado em dispositivos diferentes, sera necessario conectar um backend com login, banco de dados, permissoes e sincronizacao online.

## Backend

O backend inicial esta em `backend/`.

Ele inclui:

- cadastro e login de usuarios;
- workspace da empresa;
- membros com papel `admin`, `editor` ou `viewer`;
- credenciais privadas por usuario;
- credenciais compartilhadas por workspace;
- auditoria basica;
- armazenamento em JSON local para desenvolvimento.

Para rodar:

```powershell
cd "C:\Users\ViniciusLuz\Documents\New project\backend"
.\start-backend.ps1
```

API local:

`http://localhost:8787/api/health`

## Frontend conectado a API

A tela inicial agora usa login/cadastro online.

Campos:

- API: use `http://127.0.0.1:8787` no PC, ou `http://IP-DO-PC:8787` no celular dentro da mesma rede.
- Email: usuario da empresa.
- Senha mestra: usada para login e para criptografar/descriptografar os itens antes de enviar para a API.

No cadastro, o primeiro usuario cria o workspace da empresa e vira `admin`.

Para compartilhar itens entre funcionarios, todos precisam conseguir descriptografar o cofre compartilhado. Nesta versao MVP isso significa usar a mesma senha mestra para os itens compartilhados do workspace. A proxima evolucao correta e implementar chaves por usuario/convite, para cada funcionario poder ter senha propria sem perder acesso ao compartilhado.

Para producao, troque o `JWT_SECRET`, use HTTPS e substitua o JSON local por um banco como PostgreSQL/Supabase.

## Abrir no computador

```powershell
cd "C:\Users\ViniciusLuz\Documents\New project"
python -m http.server 4177 --bind 127.0.0.1
```

Depois abra `http://127.0.0.1:4177`.

## Usar no celular como app

Para instalar como app offline, abra uma vez pelo celular usando a rede local:

```powershell
cd "C:\Users\ViniciusLuz\Documents\New project"
python -m http.server 4177 --bind 0.0.0.0
```

No celular, abra `http://IP-DO-COMPUTADOR:4177`.

Depois use a opcao do navegador:

- Android/Chrome: menu de tres pontos > Adicionar a tela inicial ou Instalar app.
- iPhone/Safari: compartilhar > Adicionar a Tela de Inicio.

Depois de instalado, o app abre independente do PC e funciona offline.

## Transferir por arquivo

Voce tambem pode copiar a pasta, o arquivo `cofre-acessos-mobile.zip`, ou o arquivo unico `cofre-offline.html` para o celular.

Para abrir sem PC, prefira `cofre-offline.html`.

Nesse modo ele abre como uma pagina local, nao como app instalado. Alguns navegadores podem limitar instalacao, service worker ou criptografia quando o arquivo e aberto direto do armazenamento.

## Observacao sobre offline

O modo app instalado offline depende de service worker, e service worker em celular normalmente exige HTTPS. Acesso por `http://192.168...` abre a pagina, mas pode nao instalar/cachear offline.

Para app instalado de verdade, publique estes arquivos em um endereco HTTPS, como GitHub Pages, Netlify, Vercel ou outro host estatico. Depois abra esse HTTPS no celular e use Adicionar a tela inicial/Instalar app.

O cofre do celular fica separado do cofre do computador, porque os dados sao salvos no navegador. Use Exportar e Importar para transferir.

## Segurança

- Os dados ficam no `localStorage` do navegador.
- O conteudo e criptografado com AES-GCM.
- A chave e derivada da senha mestra com PBKDF2-SHA256.
- A senha mestra nao e salva.
- O cofre bloqueia sozinho depois de 5 minutos.

Se esquecer a senha mestra, nao ha recuperacao dos dados.
