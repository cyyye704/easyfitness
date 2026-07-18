import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const serverGraphFiles = [
  'api/ai/parse-daily-log.ts',
  'api/ai/parse-profile.ts',
  'api/ai/summarize-period.ts',
  'api/_lib/deepseek.ts',
  'api/_lib/deepseekPrompt.ts',
  'api/_lib/http.ts',
  'api/_lib/periodSummary.ts',
  'api/_lib/periodSummaryHttp.ts',
  'api/_lib/periodSummaryPrompt.ts',
  'api/_lib/profile.ts',
  'api/_lib/profilePrompt.ts',
  'src/ai/validation.ts',
  'src/ai/types.ts',
  'src/periodSummary/calculatePeriodSummary.ts',
  'src/periodSummary/types.ts',
  'src/periodSummary/validation.ts',
  'src/profile/types.ts',
  'src/profile/validation.ts',
  'src/utils.ts',
  'src/types.ts',
]

test('Vercel function graph uses bundle-resolvable runtime imports', () => {
  for (const file of serverGraphFiles) {
    const source = readFileSync(resolve(file), 'utf8')
    assert.doesNotMatch(
      source,
      /from\s+['"](?:\.\.?\/)[^'"]+(?<!\.js)['"]/,
      `${file} contains a relative runtime import without a .js extension`,
    )
  }
})

test('Vercel entry graph typechecks with the root tsconfig options', () => {
  const configPath = resolve('tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  assert.equal(config.error, undefined)

  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    resolve('.'),
    undefined,
    configPath,
  )
  const program = ts.createProgram(
    [
      resolve('api/ai/parse-daily-log.ts'),
      resolve('api/ai/parse-profile.ts'),
      resolve('api/ai/summarize-period.ts'),
    ],
    {
      ...parsed.options,
      noEmit: true,
      skipLibCheck: true,
      allowJs: true,
      esModuleInterop: true,
    },
  )
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)

  assert.equal(
    errors.length,
    0,
    ts.formatDiagnostics(errors, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => resolve('.'),
      getNewLine: () => '\n',
    }),
  )
})
