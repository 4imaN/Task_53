import { buildServer } from '../server.js';
import { SchedulerService } from '../services/scheduler.service.js';
import { logProcessError } from '../utils/error-logging.js';

const run = async () => {
  const server = await buildServer();
  await server.ready();

  try {
    const scheduler = new SchedulerService(server);
    const result = await scheduler.runNightlyJobs(new Date());
    console.log(JSON.stringify({
      periodStart: result.periodStart.toISOString(),
      periodEnd: result.periodEnd.toISOString(),
      metricsSummary: result.metricsSummary,
      archivalSummary: result.archivalSummary
    }, null, 2));
  } finally {
    await server.close();
  }
};

run().catch((error) => {
  logProcessError('run_nightly_jobs', error);
  process.exitCode = 1;
});
