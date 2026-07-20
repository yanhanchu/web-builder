import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { users, type NewUser } from '../../db/schema';
import * as schema from '../../db/schema';

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
        with: { posts: true },
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
