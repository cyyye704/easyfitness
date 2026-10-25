import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const projectRoot = resolve('.')
const entryFiles = readdirSync(resolve('api/ai'))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => `api/ai/${file}`)

const configPath = resolve('tsconfig.json')
const config = ts.readConfigFile(configPath, ts.sys.readFile)
assert.equal(config.error, undefined)
const parsed = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  projectRoot,
  undefined,
  configPath,
)
const program = ts.createProgram(
  entryFiles.map((file) => resolve(file)),
  {
    ...parsed.options,
    noEmit: true,
    skipLibCheck: true,
    allowJs: true,
    esModuleInterop: true,
  },
)

// Follow the actual dependency graph so newly imported helpers are checked too.
const serverGraphFiles = program.getSourceFiles().filter((file) => {
  const projectPath = relative(projectRoot, file.fileName)
  return !file.isDeclarationFile &&
    !program.isSourceFileFromExternalLibrary(file) &&
    !isAbsolute(projectPath) &&
    projectPath !== '..' &&
    !projectPath.startsWith('../')
})

test('Vercel function graph uses bundle-resolvable runtime imports', () => {
  for (const file of serverGraphFiles) {
    assert.doesNotMatch(
      file.text,
      /from\s+['"](?:\.\.?\/)[^'"]+(?<!\.js)['"]/,
      `${relative(projectRoot, file.fileName)} contains a relative runtime import without a .js extension`,
    )
  }
})

test('Vercel entry graph typechecks with the root tsconfig options', () => {
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)

  assert.equal(
    errors.length,
    0,
    ts.formatDiagnostics(errors, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => projectRoot,
      getNewLine: () => '\n',
    }),
  )
})

test('all AI functions have enough execution time for the upstream timeout', () => {
  const config = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'))
  for (const file of entryFiles) {
    assert.equal(config.functions[file]?.maxDuration, 30, file)
  }
})
