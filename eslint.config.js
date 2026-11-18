// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'supabase/*'],
  },
  {
    rules: {
      // apostrophes in plain text are fine in React Native
      'react/no-unescaped-entities': 'off',
      // false positive: expo-notifications re-exports enums from a types file
      'import/namespace': 'off',
      // data-loading effects are intentional here
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
