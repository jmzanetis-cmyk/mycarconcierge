const globals = require('globals');
const unicornPkg = require('eslint-plugin-unicorn');
const html = require('eslint-plugin-html');

const unicorn = unicornPkg.default || unicornPkg;

const sharedRules = {
  'unicorn/prefer-number-properties': 'error',
  'unicorn/prefer-global-this': 'error',
  'unicorn/prefer-string-replace-all': 'error',
  'unicorn/prefer-class-fields': 'error',
  'prefer-object-has-own': 'error',
  'no-unused-vars': ['error', {
    args: 'none',
    caughtErrors: 'none',
    varsIgnorePattern: '^_',
    ignoreRestSiblings: true,
  }],
  'no-negated-condition': 'error',
};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'www/**',
      'android/**',
      'ios/**',
      'dist/**',
      '.netlify/**',
      '.netlify-deploy/**',
      '.cache/**',
      'attached_assets/**',
      'test-results/**',
      'playwright-report/**',
      '**/*.min.js',
    ],
  },
  {
    files: ['**/*.js'],
    plugins: { unicorn },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    rules: sharedRules,
  },
  {
    files: ['**/*.html'],
    plugins: { unicorn, html },
    settings: {
      'html/javascript-mime-types': ['text/javascript', 'application/javascript', 'module'],
      'html/indent': '+2',
      'html/report-bad-indent': 'off',
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
    rules: sharedRules,
  },
];
