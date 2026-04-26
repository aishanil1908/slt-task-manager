// tests/backend/setup.env.js
// Set test environment variables BEFORE server.js is imported

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'slt-test-jwt-secret-do-not-use-in-prod';
process.env.JWT_EXPIRY = '1h';
process.env.PILOT_MODE = 'true';   // most login tests run in pilot mode
process.env.PORT       = '0';       // let supertest pick a random port
