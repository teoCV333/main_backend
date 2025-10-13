import { json } from "express";
import express from "express";
import path  from "path";
import routes from "./routes/index.js";
import cors from 'cors';

const app = express();

/* app.use(cors({
    origin: ['https://removercuotaonline.com', 'https://www.removercuotaonline.com'], // tu frontend
    credentials: true
})); */
app.use(cors({
    origin: ['https://latamtravel.online', 'https://www.latamtravel.online'], // tu frontend
    credentials: true
}));

const botUserAgents = [
  /bot/i, /crawl/i, /slurp/i, /spider/i, /Yandex/i, /Bingbot/i, /Googlebot/i
];

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
  res.header("Access-Control-Allow-Origin", ['https://latamtravel.online', 'https://www.latamtravel.online']);
  res.header("X-Content-Type-Options", "nosniff");
  res.header("X-Frame-opts", "DENY");
  res.header("X-XSS-Protection", "1; mode=block");
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(json());


// Routes
app.use("/api", routes);

export default app;