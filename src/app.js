import { json } from "express";
import express from "express";
import path  from "path";
import routes from "./routes/index.js";
import cors from 'cors';

/* const ALLOWED_ORIGINS = [
  "https://latamtravel.online",
  "https://www.latamtravel.online",
]; */
const ALLOWED_ORIGINS = [
  "http://localhost:8000",
  "https://ofertasltamcol.com",
  "https://www.ofertasltamcol.com"
];

// --- 2) CORS robusto (maneja preflight correctamente)
const corsOptions = {
  origin(origin, cb) {
    // Permitir herramientas locales/healthchecks sin Origin
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"), false);
  },
  credentials: true,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400, // cache del preflight
};


const app = express();

/* app.use(cors({
    origin: ['https://removercuotaonline.com', 'https://www.removercuotaonline.com'], // tu frontend
    credentials: true
})); */
app.use(cors(corsOptions));

app.options("*", cors(corsOptions));


app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));


app.use((req, res, next) => { res.removeHeader('X-Powered-By'); next(); });

/* app.use((req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  const isBot = botUserAgents.some(pattern => pattern.test(userAgent));

  if (isBot) {
    console.warn('Bot detectado:', userAgent);
    return res.status(403).send('Acceso denegado');
  }

  next();
}); */

app.use((req, res, next) => {
  // Express + cors ya setea Access-Control-Allow-Origin correctamente (uno solo).
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");          // <-- nombre correcto
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(json());


// Routes
app.use("/api", routes);

app.use((err, req, res, next) => {
  console.error("Error middleware:", err?.stack || err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal Server Error" });
});

export default app;