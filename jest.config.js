module.exports = {
  testEnvironment: 'node',
  testMatch:       ['**/tests/api.test.js'],
  testTimeout:     20000,
  maxWorkers:      1,
  verbose:         true,
  clearMocks:      true,
};
