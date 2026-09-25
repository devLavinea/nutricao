# Alterações do PWA — somente o que precisa mudar

Substitua/adicone apenas os arquivos abaixo:

### Substituir
- `index.html`
- `src/main.tsx`
- `public/manifest.webmanifest`
- `public/service-worker.js`

### Aplicar alteração pontual
- `src/App.tsx.patch` — aplique este patch no `src/App.tsx`; não é necessário substituir o App.tsx inteiro.

### Adicionar
- `public/icon-192.png`
- `public/icon-512.png`
- `public/apple-touch-icon.png`
- `public/favicon-32.png`

Os quatro ícones foram gerados a partir da `public/logo.png` que já existe no seu projeto.

No Android/Chrome, o botão usa `beforeinstallprompt` quando o navegador disponibiliza a instalação.
No iPhone/iPad, o botão orienta para Safari > Compartilhar > Adicionar à Tela de Início.
