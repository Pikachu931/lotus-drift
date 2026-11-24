import { defineConfig } from 'vite';

const previewHost = process.env.PREVIEW_HOST;

const server = {
  host: '0.0.0.0',
  port: 3000,
  strictPort: true,
};

// The cloud preview is served from a per-workspace hostname; allow exactly
// that host (and nothing wildcarded) when one is supplied.
if (previewHost) {
  server.allowedHosts = previewHost
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
}

export default defineConfig({
  base: './',
  server,
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
