/**
 * Vitest global setup — runs before any test file is imported.
 * Sets the env vars that src/config/env.ts validates at module-load time.
 */
process.env.BUCKET_NAME = "test-bucket";
process.env.ENV = "test";
process.env.ADMIN_USERNAME = "peter";
process.env.CLOUDFRONT_DOMAIN = "test.cloudfront.net";
