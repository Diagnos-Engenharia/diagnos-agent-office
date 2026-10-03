import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'server/github.ts');
const outputPath = resolve(root, 'server/github.js');
const source = await readFile(sourcePath, 'utf8');
const result = ts.transpileModule(source, {
  fileName: sourcePath,
  reportDiagnostics: true,
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2023,
    verbatimModuleSyntax: true,
  },
});
const errors = (result.diagnostics ?? []).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
if (errors.length) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCurrentDirectory: () => root,
    getCanonicalFileName: file => file,
    getNewLine: () => '\n',
  }));
}
await writeFile(outputPath, result.outputText, 'utf8');
