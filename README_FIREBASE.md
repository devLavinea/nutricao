# Gestão Alimentar — Firebase

Este projeto foi migrado do Supabase para o Cloud Firestore do projeto
`gestao-alimentar-mariaantonia`.

## 1. Instalar dependência

```bash
npm install
```

Se o npm informar que o lockfile precisa ser atualizado, execute:

```bash
npm install firebase
```

## 2. Configurar o Firebase

No Firebase Console, abra:

Configurações do projeto → Seus apps → Web → Configuração do SDK.

Copie os valores para `.env`:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

O `projectId` deste projeto é `gestao-alimentar-mariaantonia`.

## 3. Coleções usadas pelo sistema

O código usa estas coleções do Firestore:

- `funcionarios`
- `grupos`
- `cardapio`
- `registro_refeicoes`
- `avaliacoes_alimentacao`

Os nomes dos campos foram mantidos iguais aos usados anteriormente no Supabase,
para que a lógica do aplicativo continue praticamente igual.

## 4. Regras do Firestore

Antes de colocar o sistema em produção, configure as regras do Firestore.
Não deixe regras abertas permanentemente.

## 5. Fotos

Nesta primeira migração, os campos de foto continuam sendo tratados como dados
do próprio registro. Para fotos maiores, o ideal é usar o Firebase Storage e
salvar no Firestore apenas a URL da imagem.
