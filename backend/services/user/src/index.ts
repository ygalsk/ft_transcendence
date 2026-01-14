import { buildApp } from './app';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';

const initializeAvatarStorage = (logger: any) => {
  const AVATAR_DIR = process.env.UPLOADS_DIR || '/usr/src/app/data/avatars';
  const DEFAULT_AVATAR_PATH = join(AVATAR_DIR, 'default.png');

  //ensure upload dir exist
  if (!existsSync(AVATAR_DIR)) {
    mkdirSync(AVATAR_DIR, {recursive: true});
    logger.log.info(`Created uploads dir: ${AVATAR_DIR}`);
  }

  // Copy default avatar from assets if not already in uploads dir
  if (!existsSync(DEFAULT_AVATAR_PATH)) {
    const assetDefaultPath = join(__dirname, '../../assets/default.png');
    if (existsSync(assetDefaultPath)) {
      try {
        copyFileSync(assetDefaultPath, DEFAULT_AVATAR_PATH);
        logger. log.info('Copied default avatar to uploads directory');
      } catch (error) {
        logger.log.error({ error }, 'Failed to copy default avatar');
      }
    }
  }
};

const start = async () => {
  const app = buildApp();

  initializeAvatarStorage(app.log);
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
