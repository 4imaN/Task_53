import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function childEnv(extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  delete env.npm_lifecycle_event;
  delete env.npm_lifecycle_script;
  delete env.npm_command;
  return env;
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      env: childEnv(extraEnv)
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`
        )
      );
    });
  });
}

await run(npmCommand, ['run', 'build']);
await run('./node_modules/.bin/playwright', ['test']);
