import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Load .env for local development
import 'dotenv/config';

export default defineConfig({
  schema: path.join(__dirname, 'prisma/schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL as string,
  },
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
});
