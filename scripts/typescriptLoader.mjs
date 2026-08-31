export const resolve = async (specifier, context, nextResolve) => {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      (specifier.startsWith('.') || specifier.startsWith('/')) &&
      !specifier.match(/\.[cm]?[jt]s$/)
    )
      return nextResolve(`${specifier}.ts`, context);
    throw error;
  }
};
