// Concatenate widget/src/*.js (sorted) into one IIFE at public/widget.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'widget', 'src');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort();

let out = `/*! ${pkg.name} widget v${pkg.version} */\n(function () {\n'use strict';\nvar VERSION = ${JSON.stringify(pkg.version)};\n`;
for (const f of files) {
  out += `\n/* ---- ${f} ---- */\n` + fs.readFileSync(path.join(srcDir, f), 'utf8');
}
out += '\n})();\n';

fs.writeFileSync(path.join(root, 'public', 'widget.js'), out);
console.log(`[build] public/widget.js (${files.length} modules, ${(out.length / 1024).toFixed(1)} KB)`);
