import { config } from './config.js';
import { buildServer } from './server.js';
import { SchedulerService } from './services/scheduler.service.js';

const start = async () => {
  const server = await buildServer();
  const scheduler = new SchedulerService(server);
  server.addHook('onClose', async () => {
    scheduler.stop();
  });
  await server.listen({ host: '0.0.0.0', port: config.appPort });
  scheduler.start();
};

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
