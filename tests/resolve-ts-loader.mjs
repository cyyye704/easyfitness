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
