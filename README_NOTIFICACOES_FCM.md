# Notificações push (FCM) — Gestão Alimentar

Este projeto foi preparado para enviar notificações push às funcionárias da cozinha
de segunda a sexta-feira, às **07h20 (horário de Brasília)**.

## O que foi implementado

- Cadastro do token FCM por uma Cloud Function que valida o cadastro do funcionário.
- O navegador não lê a coleção `push_tokens`; a gravação é feita pelo Firebase Admin SDK no servidor.
- Associação do token ao perfil que entrou no sistema.
- Botão para ativar notificações tanto na tela de login quanto dentro do sistema.
- Tratamento das mensagens recebidas com o Service Worker existente.
- Cloud Function agendada para enviar o lembrete às 07h20, de segunda a sexta.
- O envio é feito somente aos documentos de `push_tokens` com `perfil: "cozinha"`.

## 1. Obter a chave VAPID pública

No Firebase Console do projeto `gestao-alimentar-mariaantonia`:

1. Abra **Configurações do projeto**.
2. Entre em **Cloud Messaging**.
3. Localize **Configuração de Web Push** / **Certificados Web Push**.
4. Gere ou copie a chave pública VAPID.
5. Configure essa chave como `VITE_FIREBASE_VAPID_KEY` nas variáveis de ambiente do serviço onde o site é publicado.

No desenvolvimento local, crie `.env` a partir de `.env.example` e preencha a chave:

```env
VITE_FIREBASE_VAPID_KEY=SUA_CHAVE_PUBLICA_VAPID
```

No Vercel, adicione a mesma variável em **Settings > Environment Variables** e faça um novo deploy.
Não coloque a chave privada VAPID no frontend. O aplicativo usa somente a chave pública.

## 2. Ativar o plano necessário para o agendamento

O projeto Firebase está no plano **Spark**. O envio FCM é gratuito, mas uma função agendada com Cloud Scheduler exige que o projeto esteja no plano **Blaze** (faturamento ativado).

Antes de publicar a função:
1. No Firebase Console, abra **Uso e faturamento**.
2. Faça upgrade para **Blaze** e associe uma forma de pagamento.
3. Configure alertas de orçamento no Google Cloud Billing.

O upgrade não significa uma cobrança fixa automática, mas serviços de agendamento e execução podem gerar custos conforme o uso e a tabela vigente do Google Cloud.

## 3. Instalar e publicar a função agendada

Tenha Node.js 20 ou superior e Firebase CLI instalados. Na pasta raiz do projeto:

```bash
npm install
cd functions
npm install
npm run build
cd ..
firebase login
firebase use gestao-alimentar-mariaantonia
firebase deploy --only functions
```

A função publicada se chama `notificarCozinhaDeManha`.
O agendamento configurado é `20 7 * * 1-5`, no fuso `America/Sao_Paulo`.

## 4. Configurar as regras do Firestore

O aplicativo grava os tokens na coleção `push_tokens`. As regras atuais do Firestore não vieram no ZIP,
portanto não foram alteradas automaticamente.

Antes de liberar a funcionalidade, revise as regras para permitir o cadastro/atualização dos tokens
sem permitir que usuários não autorizados leiam tokens de outros dispositivos ou alterem registros
de funcionários. Como o login atual do aplicativo é próprio e não usa Firebase Authentication,
não copie regras genéricas abertas (`allow read, write: if true`) para produção.

A função agendada lê os tokens no servidor usando a conta de serviço do Firebase Admin SDK.
O cliente não precisa ler a coleção `push_tokens`.

## 5. Como ativar em cada celular

1. Abra o site em HTTPS.
2. Entre no sistema com o login da funcionária.
3. Toque em **Ativar notificações** e permita o envio no navegador.
4. Se estiver usando iPhone/iPad, adicione o site à Tela de Início e abra o aplicativo instalado
   antes de ativar as notificações (requisito do iOS para notificações web).
5. Repita o procedimento em cada dispositivo que deverá receber o aviso.

Depois do cadastro, a função envia o lembrete mesmo quando o site estiver fechado, desde que
o navegador/sistema operacional permita notificações e o dispositivo tenha conexão.

## Texto enviado

**Lembrete da cozinha 🍽️**

Verifique as refeições disponíveis no cardápio e registre apenas aquelas que não foram realizadas
conforme o planejamento ou que sofreram alterações.

## Importante

- A notificação não está ativa apenas por baixar o código. É necessário configurar a chave VAPID,
  publicar o site e a Cloud Function, ativar as permissões nos celulares e cadastrar cada dispositivo.
- Se uma funcionária trocar de navegador, limpar os dados do site ou trocar de celular, precisará
  ativar novamente as notificações nesse dispositivo.
- Se a mesma pessoa usar vários dispositivos, cada dispositivo deverá ser ativado separadamente.
- O lembrete não depende de o usuário estar logado no horário do envio, pois o token fica salvo
  no Firestore até ser removido ou invalidado.
