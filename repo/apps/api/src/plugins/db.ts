import fp from 'fastify-plugin';
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export default fp(async (fastify) => {
  const pool = new Pool({ connectionString: config.databaseUrl });
  fastify.decorate('db', pool);

  fastify.addHook('onClose', async () => {
    await pool.end();
  });
});
