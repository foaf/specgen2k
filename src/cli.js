#!/usr/bin/env node

import { generateSpec } from './spec-generator.js';
import { readFile, writeFile } from 'fs/promises';

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: specgen2k <rdf-file> <template> [options]');
  console.error('');
  console.error('Options:');
  console.error('  --doc-dir <dir>                    Directory with .en doc fragments');
  console.error('  --output <file>                    Output file (default: stdout)');
  console.error('  --replicate-ancient-bugs <json>    Apply ordering/bug overrides from config');
  console.error('  --extra-rdf <name>=<path>          Additional RDF file (repeatable)');
  console.error('');
  console.error('Examples:');
  console.error('  specgen2k ../third_party/xmlns-foaf/xmlns-foaf-rdf.xml templates/foaf.njk --doc-dir ../third_party/xmlns-foaf/doc --output foaf.html');
  console.error('  specgen2k ../third_party/xmlns-foaf/xmlns-foaf-rdf.xml templates/foaf.njk --doc-dir ../third_party/xmlns-foaf/doc --replicate-ancient-bugs templates/foaf.ancient-bugs.json');
  process.exit(1);
}

const rdfPath = args[0];
const templatePath = args[1];

let docDir = null;
let outputPath = null;
let ancientBugsPath = null;
const extraRdf = []; // { name, path }

for (let i = 2; i < args.length; i++) {
  if (args[i] === '--doc-dir' && args[i + 1]) docDir = args[++i];
  if (args[i] === '--output' && args[i + 1]) outputPath = args[++i];
  if (args[i] === '--replicate-ancient-bugs' && args[i + 1]) ancientBugsPath = args[++i];
  if (args[i] === '--extra-rdf' && args[i + 1]) {
    const arg = args[++i];
    const eq = arg.indexOf('=');
    if (eq === -1) { console.error('--extra-rdf requires name=path format'); process.exit(1); }
    extraRdf.push({ name: arg.slice(0, eq), path: arg.slice(eq + 1) });
  }
}

let ancientBugs = null;
if (ancientBugsPath) {
  const raw = await readFile(ancientBugsPath, 'utf-8');
  ancientBugs = JSON.parse(raw);
}

try {
  const html = await generateSpec({ rdfPath, templatePath, docDir, ancientBugs, extraRdf });
  if (outputPath) {
    await writeFile(outputPath, html);
    console.error(`Written to ${outputPath}`);
  } else {
    process.stdout.write(html);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
