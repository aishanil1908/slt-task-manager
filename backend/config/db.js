// config/db.js
// PostgreSQL connection pool
// All database queries go through this pool

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'slt_taskmanager',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD,
  // Connection pool settings
  max:              10,   // max 10 simultaneous connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('   Check your .env DB_PASSWORD and ensure PostgreSQL is running');
    process.exit(1);
  }
  release();
  console.log('✅ Database connected — slt_taskmanager');
});

// Helper: run a query with automatic error logging
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log(`   DB query (${duration}ms): ${text.slice(0, 60)}...`);
    }
    return result;
  } catch (err) {
    console.error('❌ Query error:', err.message);
    console.error('   Query:', text);
    console.error('   Params:', params);
    throw err;
  }
};

module.exports = { pool, query };
