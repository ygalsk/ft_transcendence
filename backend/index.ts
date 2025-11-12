import dotenv from 'dotenv';
import { buildApp } from "./src/app";

dotenv.config({ path: '../.env' });
const app = buildApp();

const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}; 

start()