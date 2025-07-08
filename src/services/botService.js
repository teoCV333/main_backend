
const pendingDecisions = new Map();

export function waitForDecision(messageId) {
  return new Promise((resolve, reject) => {
    // Guarda el resolver en el map con la key messageId
    pendingDecisions.set(String(messageId), { resolve, reject });

    // Opcional: timeout para no esperar indefinidamente
    setTimeout(() => {
      if (pendingDecisions.has(messageId)) {
        pendingDecisions.delete(messageId);
        reject(new Error('Timeout esperando decisión'));
      }
    }, 10 * 60 * 1000); // 10 minutos por ejemplo
  });
}

export const sendTelegramAlert = async ({ groupId, text }) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const telegramApi = `https://api.telegram.org/bot${token}/sendMessage`;

  const response = await fetch(telegramApi, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: groupId,
      text,
      reply_markup: {
        inline_keyboard: [[
          { text: 'Continuar', callback_data: 'continue' },
          { text: 'Finalizar', callback_data: 'finalize' },
        ]],
      },
    }),
  });

  const result = await response.json();
  console.log(result)
  return result.result.message_id;
}

export async function respondToTelegramCallback(callback) {
  const messageId = String(callback.message.message_id);
  const decision = callback.data; // lo que envía el usuario: 'continuar' o 'finalizar', por ejemplo


  // Lógica para responder a Telegram, cerrar el callback_query:
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callback.id,
      text: `Has seleccionado: ${decision}`,
      show_alert: false,
    }),
  });

  // Si hay una promesa pendiente con ese messageId, resolverla con la decisión
  if (pendingDecisions.has(messageId)) {
    const { resolve } = pendingDecisions.get(messageId);
    resolve(decision); // Aquí se "desbloquea" el await de waitForDecision
    pendingDecisions.delete(messageId);
  }
}

// Enviar mensaje sin botones
export const sendSimpleTelegramMessage = async (chatId, text) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const data = await res.json();
  return data.result; // contiene message_id y demás
};

export const editTelegramMessage = async ({ chatId, messageId, text, reply_markup }) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML'
  };

  if (reply_markup) payload.reply_markup = reply_markup;

  const response = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  return result.result;
}