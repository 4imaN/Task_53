import { spawn } from 'node:child_process';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function waitFor(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  await run('npm', ['run', 'test:unit']);

  const devServer = spawn('npm', ['start', '--', '--host', '127.0.0.1', '--port', '4200'], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  const stopServer = () => {
    if (!devServer.killed) {
      devServer.kill('SIGTERM');
    }
  };

  process.on('exit', stopServer);
  process.on('SIGINT', () => {
    stopServer();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    stopServer();
    process.exit(143);
  });

  try {
    await waitFor('http://127.0.0.1:4200');
    await run('npx', ['playwright', 'test'], {
      env: {
        ...process.env,
        PLAYWRIGHT_SKIP_WEBSERVER: '1',
        PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:4200'
      }
    });
  } finally {
    stopServer();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
