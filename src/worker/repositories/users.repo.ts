import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { users, type NewUser } from '../../db/schema';
import * as schema from '../../db/schema';

// 這一層模擬「後端的 service/repository」:
// 前端 (主執行緒) 完全不知道這裡在跑 SQL,
// 它只會呼叫 comlink 暴露出去的 async function,感覺就像呼叫 REST API。
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
        with: { posts: true }, // 示範關聯查詢
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
