import { readFile } from 'node:fs/promises'
import { transpileModule, ModuleKind, ScriptTarget, JsxEmit } from 'typescript'

const isExtensionlessRelativeImport = (specifier) =>
  (specifier.startsWith('./') || specifier.startsWith('../')) &&
  !/\.[a-z0-9]+$/i.test(specifier)

const isJavaScriptRelativeImport = (specifier) =>
  (specifier.startsWith('./') || specifier.startsWith('../')) &&
  specifier.endsWith('.js')

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (
      error?.code === 'ERR_MODULE_NOT_FOUND' &&
      (isExtensionlessRelativeImport(specifier) ||
        isJavaScriptRelativeImport(specifier))
    ) {
      const typescriptSpecifier = isJavaScriptRelativeImport(specifier)
        ? `${specifier.slice(0, -3)}.ts`
        : `${specifier}.ts`
      return nextResolve(typescriptSpecifier, context)
    }

    throw error
  }
}

// Render real TSX components in regression tests without a browser or new dependency.
export async function load(url, context, nextLoad) {
  if (url.endsWith('.tsx')) {
    const source = await readFile(new URL(url), 'utf8')
    const { outputText } = transpileModule(source, {
      fileName: new URL(url).pathname,
      compilerOptions: {
        module: ModuleKind.ESNext,
        target: ScriptTarget.ES2022,
        jsx: JsxEmit.ReactJSX,
      },
    })
    return { format: 'module', source: outputText, shortCircuit: true }
  }
  return nextLoad(url, context)
}
