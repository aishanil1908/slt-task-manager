// jest.config.js
// Place this file at the root of your backend project (same level as server.js)

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/backend/**/*.test.js'],
  collectCoverageFrom: [
    'backend/routes/**/*.js',
    'backend/middleware/**/*.js',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFiles: ['<rootDir>/tests/backend/setup.env.js'],
  testTimeout: 15000,
  verbose: true,
};
