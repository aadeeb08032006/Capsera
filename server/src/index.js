import app from './app.js';
import { env } from './config/env.js';

const server = app.listen(env.port, () => {
  console.log(
    `[CAPSERA] Server running in ${env.nodeEnv} mode on http://localhost:${env.port}${env.apiPrefix}`,
  );
});

process.on('SIGINT', () => {
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});

