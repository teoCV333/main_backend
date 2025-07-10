import app from "./app.js";
import { env } from "./config/env.js";
import { Server } from "socket.io";
import bodyParser from "body-parser";
import http from "http";
import { setSocketIO } from "./controllers/botController.js";

// Crear servidor HTTP a partir de la app de Express
const server = http.createServer(app);

// Instanciar socket.io con CORS
const io = new Server(server, {
  cors: {
    origin: 'https://eliminacuotaonline.lat',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Pasar socket a controlador si lo necesitas
setSocketIO(io);

// Middleware JSON
app.use(bodyParser.json());

// Eventos de conexión socket.io
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
});

// ✅ Inicia el servidor correcto (¡no app.listen!)
server.listen(env.port, () => {
  console.log(`Servidor corriendo en http://localhost:${env.port}`);
});
