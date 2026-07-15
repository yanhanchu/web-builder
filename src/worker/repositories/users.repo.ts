import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { users, type NewUser } from '../../db/schema';
import * as schema from '../../db/schema';

// AI agents: this layer simulates a backend "service/repository" layer.
// The main thread has no idea SQL runs here — it only ever calls the async
// functions exposed via Comlink in worker.ts, which feels just like calling a
// REST API. When adding a new table, copy this file's pattern: a factory
// function `createXRepo(db)` returning an object of async CRUD methods.
export function createUsersRepo(db: PgliteDatabase<typeof schema>) {
  return {
    async list() {
      return db.query.users.findMany({
        orderBy: (u, { desc }) => [desc(u.createdAt)],
      });
    },

    async getById(id: number) {
      return db.query.users.findFirst({
        where: eq(users.id, id),
        with: { posts: true }, // example of a relational query (join via Drizzle's `with`)
      });
    },

    async create(input: NewUser) {
      const [row] = await db.insert(users).values(input).returning();
      return row;
    },

    async update(id: number, input: Partial<NewUser>) {
      const [row] = await db
        .update(users)
        .set(input)
        .where(eq(users.id, id))
        .returning();
      return row;
    },

    async remove(id: number) {
      await db.delete(users).where(eq(users.id, id));
      return { success: true };
    },
  };
}

export type UsersRepo = ReturnType<typeof createUsersRepo>;
