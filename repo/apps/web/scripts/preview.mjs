import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

const port = Number(process.env.PORT || 4173);
const root = resolve(process.cwd(), 'dist/omnistock/browser');

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.json', 'application/json; charset=utf-8']
]);

async function resolveAssetPath(urlPath) {
  const requestPath = urlPath === '/' ? '/index.html' : urlPath;
  const directPath = join(root, requestPath);

  if (existsSync(directPath)) {
    const info = await stat(directPath);
    if (info.isFile()) {
      return directPath;
    }
  }

  return join(root, 'index.html');
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
    const assetPath = await resolveAssetPath(url.pathname);
    response.setHeader('Content-Type', contentTypes.get(extname(assetPath)) || 'text/plain; charset=utf-8');
    createReadStream(assetPath).pipe(response);
  } catch (error) {
    response.statusCode = 500;
    response.end(error instanceof Error ? error.message : 'preview server failed');
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Preview server listening on http://127.0.0.1:${port}\n`);
});
