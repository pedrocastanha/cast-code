import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const projectRoot = process.cwd();
const srcDir = path.join(projectRoot, 'src');
const outDir = path.join(projectRoot, 'dist');
const tsconfigPath = path.join(projectRoot, 'tsconfig.build.json');

const readTsConfig = () => {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext([configFile.error], formatHost));
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    projectRoot,
    undefined,
    tsconfigPath,
  );

  if (parsed.errors.length > 0) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, formatHost));
  }

  return parsed.options;
};

const formatHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => projectRoot,
  getNewLine: () => '\n',
};

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
};

const ensureDir = (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

const compilerOptions = {
  ...readTsConfig(),
  incremental: false,
  noEmit: false,
  declaration: false,
};

fs.rmSync(outDir, { recursive: true, force: true });

const sourceFiles = walk(srcDir);

for (const filePath of sourceFiles) {
  const relativePath = path.relative(srcDir, filePath);

  if (filePath.endsWith('.spec.ts') || filePath.endsWith('.d.ts')) {
    continue;
  }

  if (filePath.endsWith('.ts')) {
    const source = fs.readFileSync(filePath, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions,
      fileName: filePath,
      reportDiagnostics: false,
    });

    const outputPath = path.join(outDir, relativePath.replace(/\.ts$/, '.js'));
    ensureDir(outputPath);
    fs.writeFileSync(outputPath, transpiled.outputText, 'utf8');

    if (transpiled.sourceMapText) {
      fs.writeFileSync(`${outputPath}.map`, transpiled.sourceMapText, 'utf8');
    }

    continue;
  }

  const outputPath = path.join(outDir, relativePath);
  ensureDir(outputPath);
  fs.copyFileSync(filePath, outputPath);
}

const distMain = path.join(outDir, 'main.js');
if (fs.existsSync(distMain)) {
  fs.chmodSync(distMain, 0o755);
}

console.log(`Built ${sourceFiles.length} source assets into dist/`);
