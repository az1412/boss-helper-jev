import { defineConfig } from 'oxfmt'

export default defineConfig({
  semi: false,
  singleQuote: true,
  sortImports: {
    partitionByComment: true,
  },
  ignorePatterns: ['*.min.js', '/packages', '/.claude'],
})
