import { buildApp } from './app';

const start = async () => {
  const app = buildApp();

  try {
    const port = Number(process.env.PORT) || 5000;
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    app.log.info(`User service listening on ${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
