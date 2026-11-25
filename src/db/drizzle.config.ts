import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.SQL_HOST ?? '127.0.0.1',
    database: process.env.SQL_DB_NAME ?? '',
    user: process.env.SQL_ADMIN_USER ?? process.env.SQL_USER ?? '',
    password: process.env.SQL_ADMIN_PASSWORD ?? process.env.SQL_PASSWORD ?? '',
    ssl: false,
  },
});
