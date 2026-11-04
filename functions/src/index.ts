import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

initializeApp();

const db = getFirestore();

/**
 * Recebe o token FCM do dispositivo e valida o cadastro do funcionário
 * antes de armazená-lo. O cliente não recebe permissão de leitura da coleção.
 */
export const registrarDispositivoPush = onCall(
  { region: "southamerica-east1" },
  async (request) => {
    const dados = request.data ?? {};
    const token = String(dados.token ?? "").trim();
    const funcionarioId = Number(dados.funcionarioId);
    const login = String(dados.login ?? "").trim();
    const perfil = String(dados.perfil ?? "").trim().toLowerCase();

    if (!token || token.length < 40 || token.length > 4096) {
      throw new HttpsError("invalid-argument", "Token de notificação inválido.");
    }

    if (!Number.isFinite(funcionarioId) || !login || !perfil) {
      throw new HttpsError("invalid-argument", "Dados do funcionário incompletos.");
    }

    const funcionarioSnapshot = await db
      .collection("funcionarios")
      .where("id", "==", funcionarioId)
      .limit(1)
      .get();

    if (funcionarioSnapshot.empty) {
      throw new HttpsError("permission-denied", "Funcionário não encontrado.");
    }

    const funcionario = funcionarioSnapshot.docs[0].data();
    const normalizar = (valor: unknown) =>
      String(valor ?? "")
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .trim()
        .toLowerCase();

    if (normalizar(funcionario.login) !== normalizar(login)) {
      throw new HttpsError("permission-denied", "Cadastro do funcionário não confere.");
    }

    const loginNormalizado = normalizar(funcionario.login);
    if (
      perfil === "cozinha" &&
      !/(cozinheir|cozinha|alimentacao)/.test(loginNormalizado)
    ) {
      throw new HttpsError("permission-denied", "Este cadastro não pertence à cozinha.");
    }

    const tokenId = encodeURIComponent(token);
    await db.collection("push_tokens").doc(tokenId).set({
      token,
      perfil,
      funcionarioId,
      nome: String(funcionario.nome ?? dados.nome ?? "").trim(),
      login: String(funcionario.login ?? login).trim(),
      plataforma: String(dados.plataforma ?? "desconhecida"),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { ok: true };
  }
);


/**
 * Envia o lembrete da cozinha de segunda a sexta-feira às 07h20
 * no fuso horário de Brasília.
 *
 * Os dispositivos são cadastrados na coleção push_tokens pelo aplicativo.
 * Somente documentos com perfil === "cozinha" recebem este aviso.
 */
export const notificarCozinhaDeManha = onSchedule(
  {
    schedule: "20 7 * * 1-5",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
    retryCount: 1,
  },
  async () => {
    const snapshot = await db
      .collection("push_tokens")
      .where("perfil", "==", "cozinha")
      .get();

    if (snapshot.empty) {
      logger.info("Nenhum dispositivo da cozinha cadastrado para receber o aviso.");
      return;
    }

    const docs = snapshot.docs;
    const tokens = docs
      .map((doc) => String(doc.get("token") || "").trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      logger.info("Nenhum token FCM válido foi encontrado para a cozinha.");
      return;
    }

    let enviados = 0;
    let falhas = 0;

    for (let inicio = 0; inicio < tokens.length; inicio += 500) {
      const lote = tokens.slice(inicio, inicio + 500);
      const resposta = await getMessaging().sendEachForMulticast({
        tokens: lote,
        notification: {
          title: "Lembrete da cozinha 🍽️",
          body:
            "Verifique as refeições disponíveis no cardápio e registre apenas aquelas que não foram realizadas conforme o planejamento ou que sofreram alterações.",
        },
        webpush: {
          notification: {
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag: "lembrete-cozinha-0720",
            renotify: false,
          },
          fcmOptions: { link: "/" },
        },
        data: {
          url: "/",
          tag: "lembrete-cozinha-0720",
          tipo: "lembrete-cozinha",
        },
      });

      enviados += resposta.successCount;
      falhas += resposta.failureCount;

      const tokensInvalidos: string[] = [];
      resposta.responses.forEach((resultado, indice) => {
        if (
          !resultado.success &&
          (resultado.error?.code === "messaging/registration-token-not-registered" ||
            resultado.error?.code === "messaging/invalid-registration-token")
        ) {
          tokensInvalidos.push(lote[indice]);
        }
      });

      if (tokensInvalidos.length > 0) {
        const invalidos = new Set(tokensInvalidos);
        const batch = db.batch();
        docs.forEach((doc) => {
          if (invalidos.has(String(doc.get("token") || ""))) batch.delete(doc.ref);
        });
        await batch.commit();
      }
    }

    logger.info("Disparo de lembrete da cozinha concluído.", {
      dispositivos: tokens.length,
      enviados,
      falhas,
    });
  }
);
