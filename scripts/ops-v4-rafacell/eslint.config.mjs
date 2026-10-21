// The repository's React hook rules are scoped to TS/TSX. CI scripts run in Node.
export default [{
  files: ['**/*.mjs', '**/*.cjs'],
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    globals: { console: 'readonly', process: 'readonly', URL: 'readonly', globalThis: 'readonly' },
  },
  rules: {
    'constructor-super': 'error', 'no-unreachable': 'error', 'no-unexpected-multiline': 'error',
    'no-constant-condition': 'error', 'no-undef': 'error', 'no-unused-vars': 'error',
  },
}, {
  files: ['**/*.cjs'],
  languageOptions: { sourceType: 'commonjs', globals: { require: 'readonly' } },
}];
