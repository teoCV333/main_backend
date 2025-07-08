import { json } from "express";
import express from "express";
import path  from "path";
import routes from "./routes/index.js";
import cors from 'cors';

const app = express();

app.use(cors({
    origin: 'https://eliminacuotaonline.lat', // tu frontend
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://eliminacuotaonline.lat ");
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