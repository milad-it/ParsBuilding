import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/parsbuilding?schema=public'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').default('super-secret-jwt-token-key-with-at-least-32-characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters').default('super-secret-jwt-refresh-token-key-at-least-32-characters'),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:3000'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters').default('super-secret-cookie-signing-key-with-32-chars-long')
});

export const env = envSchema.parse(process.env);
