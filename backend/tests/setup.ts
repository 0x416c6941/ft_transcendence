/**
 * Test setup file
 * This file runs before all tests
 */

// Mock environment variables for testing
process.env.BACKEND_FASTIFY_SSL_KEY_PATH = './test-key.pem';
process.env.BACKEND_FASTIFY_SSL_CRT_PATH = './test-cert.pem';
process.env.BACKEND_CONTAINER_DB_VOL_PATH = ':memory:';
process.env.BACKEND_SQLITE_DB_NAME = '';
process.env.BACKEND_FASTIFY_PORT = '3000';
