const pendingDecisions = new Map();

export function waitForDecision(decisionId) {
  return new Promise((resolve, reject) => {
    pendingDecisions.set(decisionId, { resolve, reject });

    setTimeout(() => {
      if (pendingDecisions.has(decisionId)) {
        pendingDecisions.delete(decisionId);
        reject(new Error('Timeout esperando decisión'));
      }
    }, 10 * 60 * 1000); // 10 minutos
  });
}

export const sendTelegramAlert = async ({ groupId, text, decisionId }) => {
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
          { text: 'Continuar', callback_data: `continue:${decisionId}` },
          { text: 'Finalizar', callback_data: `finalize:${decisionId}` },
        ]],
      },
    }),
  });

  const result = await response.json();
  if (!result.ok) {
    console.error('Telegram error:', result);
    return { message_id: null };
  }

  return {
    message_id: result.result.message_id,
    decisionId
  };
};

export async function respondToTelegramCallback(callback) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const [decision, decisionId] = callback.data.split(':');

  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  }
}

export const sendSimpleTelegramMessage = async (chatId, text) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const data = await res.json();
  return data.result;
};

export const editTelegramMessage = async ({ chatId, messageId, text, reply_markup }) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
  };

  if (reply_markup) {
    payload.reply_markup = reply_markup;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  return result.result;
};
