import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { readStudioModules } from './studios.js';

const root = new URL('../', import.meta.url);
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', mp3: 'audio/mpeg' };
const port = Number(process.env.ISLAND_PORT || 8080);
let studioRead;

function studioModules() {
  // Share concurrent reads for a page load, then regenerate from disk on the next request.
  return studioRead ??= readStudioModules().finally(() => { studioRead = undefined; });
}

createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const generated = /^\/studio\/([a-z]+)\.js$/.exec(path);
    const studioKey = path === '/studio/ui.css' ? 'uiCss' : generated?.[1];
    if (studioKey) {
      const modules = await studioModules();
      if (!Object.hasOwn(modules, studioKey)) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': studioKey === 'uiCss' ? types.css : types.js,
        'Cache-Control': 'no-cache',
      });
      response.end(modules[studioKey]);
      return;
    }

    const file = path === '/' ? 'index.html' : path.slice(1);
    if (!/^(index\.html|game\.css|src\/[a-z-]+\.js|assets\/music\/[a-z-]+\.mp3)$/.test(file)) {
      response.writeHead(404).end();
      return;
    }
    const url = new URL(file, root);
    const { size } = await stat(url);
    const type = types[file.split('.').at(-1)];
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
    if (range && type === types.mp3) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end) {
        response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
        return;
      }
      response.writeHead(206, {
        'Content-Type': type, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1,
      });
      createReadStream(url, { start, end }).pipe(response);
      return;
    }
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': size });
    createReadStream(url).pipe(response);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 400).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Island sandbox: http://localhost:${port}`));
