import js from '@eslint/js'
import ts from 'typescript-eslint'
import globals from 'globals'
export default ts.config({ ignores: ['lib/**', 'node_modules/**', '.verification/**'] }, js.configs.recommended, ...ts.configs.recommended, { languageOptions: { globals: { ...globals.node, ...globals.browser } }, rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } })
