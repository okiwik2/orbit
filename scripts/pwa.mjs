// After `expo export -p web`: make dist/ an installable home-screen app and GitHub-Pages friendly.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const dist = 'dist';
const base = '/orbit/';

writeFileSync(`${dist}/manifest.json`, JSON.stringify({
  name: 'Orbit',
  short_name: 'Orbit',
  start_url: base,
  scope: base,
  display: 'standalone',
  background_color: '#0B0D12',
  theme_color: '#5B7CFA',
  icons: [{ src: `${base}icon-192.png`, sizes: '1024x1024', type: 'image/png', purpose: 'any maskable' }],
}, null, 2));
copyFileSync('assets/images/icon.png', `${dist}/icon-192.png`);

let html = readFileSync(`${dist}/index.html`, 'utf8');
html = html.replace('</head>', [
  `<link rel="manifest" href="${base}manifest.json">`,
  `<link rel="apple-touch-icon" href="${base}icon-192.png">`,
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="Orbit">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">',
  '</head>',
].join('\n'));
writeFileSync(`${dist}/index.html`, html);
// GitHub Pages serves 404.html for unknown paths, so deep links like /orbit/join/CODE still load the app
writeFileSync(`${dist}/404.html`, html);
writeFileSync(`${dist}/.nojekyll`, '');
console.log('PWA files written to dist/');
