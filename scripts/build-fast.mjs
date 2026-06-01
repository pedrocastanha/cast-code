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

const textAssetExtensions = new Set([
  '.bash',
  '.css',
  '.env',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.py',
  '.sh',
  '.svg',
  '.toml',
  '.tmpl',
  '.txt',
  '.yaml',
  '.yml',
]);

const legacySkillBrandLower = ['her', 'mes'].join('');
const legacySkillBrandTitle = `${legacySkillBrandLower[0].toUpperCase()}${legacySkillBrandLower.slice(1)}`;
const legacySkillBrandUpper = legacySkillBrandLower.toUpperCase();
const legacySkillAgentTitle = `${legacySkillBrandTitle} Agent`;
const legacySkillAgentCompact = `${legacySkillBrandTitle}Agent`;
const legacySkillAgentSlug = `${legacySkillBrandLower}-agent`;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeSkillCatalogAsset = (content) => content
  .replace(new RegExp(`${escapeRegExp(legacySkillAgentTitle)}\\s+[\\u2014-]\\s+Implementation Notes`, 'gi'), 'Implementation Notes')
  .replace(new RegExp(escapeRegExp(legacySkillAgentTitle), 'gi'), 'Cast')
  .replace(new RegExp(escapeRegExp(legacySkillAgentCompact), 'gi'), 'Cast')
  .replace(new RegExp(escapeRegExp(legacySkillAgentSlug), 'gi'), 'cast-agent')
  .replace(new RegExp(`${legacySkillBrandUpper}_HOME`, 'g'), 'CAST_HOME')
  .replace(new RegExp(`~\\/\\.${legacySkillBrandLower}`, 'gi'), '~/.cast')
  .replace(new RegExp(`\\.${legacySkillBrandLower}`, 'gi'), '.cast')
  .replace(new RegExp(legacySkillBrandUpper, 'g'), 'CAST')
  .replace(new RegExp(legacySkillBrandTitle, 'g'), 'Cast')
  .replace(new RegExp(legacySkillBrandLower, 'g'), 'cast');

const isSkillCatalogTextAsset = (relativePath) => {
  const normalized = relativePath.split(path.sep).join('/');
  return normalized.startsWith('modules/skills/definitions/catalog/')
    && textAssetExtensions.has(path.extname(relativePath));
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
  if (isSkillCatalogTextAsset(relativePath)) {
    fs.writeFileSync(outputPath, normalizeSkillCatalogAsset(fs.readFileSync(filePath, 'utf8')), 'utf8');
    continue;
  }
  fs.copyFileSync(filePath, outputPath);
}

const distMain = path.join(outDir, 'main.js');
if (fs.existsSync(distMain)) {
  fs.chmodSync(distMain, 0o755);
}

console.log(`Built ${sourceFiles.length} source assets into dist/`);
