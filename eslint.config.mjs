import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', '.playwright-cli/**/*', 'public/**/*'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
