import path from 'node:path'

/** Check before any IO, including when the requested path is the repository root itself. */
export function privatePathOutsideRepository(privateRoot, repositoryRoot) {
  const resolved = path.resolve(privateRoot), repository = path.resolve(repositoryRoot)
  const fold = value => process.platform === 'win32' ? value.toLowerCase() : value
  if (fold(resolved) === fold(repository) || fold(resolved).startsWith(fold(repository) + path.sep)) {
    throw new Error('PRIVATE_STATE_OUTSIDE_REPOSITORY_REQUIRED')
  }
  return resolved
}
