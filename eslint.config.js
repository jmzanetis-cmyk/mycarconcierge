const globals = require('globals');
const unicornPkg = require('eslint-plugin-unicorn');
const html = require('eslint-plugin-html');

const unicorn = unicornPkg.default || unicornPkg;

const sharedRules = {
  'unicorn/prefer-number-properties': 'warn',
  'unicorn/prefer-global-this': 'warn',
  'unicorn/prefer-string-replace-all': 'warn',
  'unicorn/prefer-class-fields': 'warn',
  'prefer-object-has-own': 'warn',
  'no-unused-vars': ['warn', {
    args: 'none',
    caughtErrors: 'none',
    varsIgnorePattern: '^_',
    ignoreRestSiblings: true,
  }],
  'no-negated-condition': 'warn',
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
      'rideshare-calculator/**',
      'outreach-runner/**',
      'electron/**',
      'supabase/**',
      'tools/**',
      'netlify/**',
      '.local/**',
      '.playwright/**',
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
