import { config } from 'dotenv';

config();

export const env = {
    port: process.env.PORT || 3000,
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    dbport: process.env.DB_PORT,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    group1: process.env.GROUP_1
}