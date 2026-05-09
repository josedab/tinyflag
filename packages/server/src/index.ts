import { createTinyFlagServer } from './runtime.js';

const app = createTinyFlagServer({
  port: parseInteger(process.env.PORT, 3939),
  maxConnections: parseInteger(process.env.MAX_CONNECTIONS, 1000),
  rateLimit: parseInteger(process.env.RATE_LIMIT, 100),
  gitRepoPath: process.env.GIT_REPO_PATH,
  gitBranch: process.env.GIT_BRANCH,
  gitPollInterval: parseInteger(process.env.GIT_POLL_INTERVAL, 30_000),
  flagsFile: process.env.FLAGS_FILE,
  gitAutoPull: process.env.GIT_AUTO_PULL === 'true',
  corsOrigin: process.env.CORS_ORIGIN,
  token: process.env.TINYFLAG_TOKEN,
  multiTenant: process.env.MULTI_TENANT === 'true',
  logFormat: process.env.LOG_FORMAT === 'json' ? 'json' : 'text',
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

void app.listen();

function shutdown(signal: string): void {
  app.shutdown(signal);
  setTimeout(() => {
    console.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

function parseInteger(value: string | undefined, fallback: number): number {
  return value === undefined ? fallback : parseInt(value, 10);
}
