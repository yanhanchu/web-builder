import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  // PGlite 是 in-browser 的,drizzle-kit 只是拿來"產生 SQL 檔",
  // 不會真的連線,所以這裡的 url 只是佔位、跑 generate 時用不到。
  dbCredentials: {
    url: 'postgres://placeholder:placeholder@localhost:5432/placeholder',
  },
});
