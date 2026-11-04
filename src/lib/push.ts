import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

export type DadosFuncionarioPush = {
  id: number;
  nome: string;
  login: string;
  perfil: string;
};

/**
 * Registra este navegador/dispositivo no FCM e associa o token ao perfil
 * que está autenticado no login próprio do aplicativo.
 */
export async function registrarTokenPush(funcionario: DadosFuncionarioPush) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("Este navegador não oferece suporte a notificações push.");
  }

  if (!("Notification" in window) || Notification.permission !== "granted") {
    throw new Error("Permita as notificações no navegador ou celular primeiro.");
  }

  if (!vapidKey) {
    throw new Error(
      "Falta configurar VITE_FIREBASE_VAPID_KEY no ambiente de publicação."
    );
  }

  if (!(await isSupported())) {
    throw new Error("O Firebase Cloud Messaging não é compatível com este navegador.");
  }

  const registration =
    (await navigator.serviceWorker.getRegistration("/")) ??
    (await navigator.serviceWorker.register("/service-worker.js"));

  await registration.update();

  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error("O Firebase não conseguiu gerar o token deste dispositivo.");
  }

  // O cadastro é feito no servidor para não expor a coleção de tokens ao cliente.
  const functions = getFunctions(app, "southamerica-east1");
  const cadastrarDispositivo = httpsCallable(functions, "registrarDispositivoPush");
  await cadastrarDispositivo({
    token,
    perfil: funcionario.perfil,
    funcionarioId: funcionario.id,
    nome: funcionario.nome,
    login: funcionario.login,
    plataforma: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      ? "celular"
      : "computador",
  });

  return token;
}

export async function ouvirMensagensPush(
  aoReceber: (mensagem: { title?: string; body?: string }) => void
) {
  if (!(await isSupported())) return () => undefined;
  const messaging = getMessaging(app);
  return onMessage(messaging, (payload) => {
    aoReceber({
      title: payload.notification?.title,
      body: payload.notification?.body,
    });
  });
}
