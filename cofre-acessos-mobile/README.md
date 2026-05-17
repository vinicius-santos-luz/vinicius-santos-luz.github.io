# Cofre de Acessos

Aplicativo web local para armazenar emails, senhas, bancos, agencias, contas e acessos de aplicativos.

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
