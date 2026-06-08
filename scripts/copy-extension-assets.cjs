const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const copyTargets = [
  'icons',
  'src/application/background',
  'src/application/content'
];

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

for (const target of copyTargets) {
  copyRecursive(path.join(root, target), path.join(dist, target));
}

fs.writeFileSync(
  path.join(root, 'EXTENSION_LOAD_INSTRUCTIONS.txt'),
  [
    'RecordEasy — Chrome extension load instructions',
    '==============================================',
    '',
    '1. Run: npm run build',
    '2. Open chrome://extensions',
    '3. Enable Developer mode',
    '4. Load unpacked → select THIS project root folder:',
    `   ${root}`,
    '',
    'Do NOT load the dist/ subfolder alone.',
    'manifest.json points to built files under dist/.',
    '',
    'After code changes: npm run build → Reload extension',
    ''
  ].join('\n'),
  'utf8'
);

console.log('Extension build complete.');
console.log('Load unpacked from project ROOT:', root);
