import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { posts, type NewPost } from '../../db/schema';
import * as schema from '../../db/schema';

export function createPostsRepo(db: PgliteDatabase<typeof schema>) {
  return {
    async list() {
      return db.query.posts.findMany({
        with: { author: true },
        orderBy: (p, { desc }) => [desc(p.createdAt)],
      });
    },

    async create(input: NewPost) {
      const [row] = await db.insert(posts).values(input).returning();
      return row;
    },

    async togglePublish(id: number) {
      const existing = await db.query.posts.findFirst({
        where: eq(posts.id, id),
      });
      if (!existing) throw new Error(`Post ${id} not found`);

      const [row] = await db
        .update(posts)
        .set({ published: !existing.published })
        .where(eq(posts.id, id))
        .returning();
      return row;
    },

    async remove(id: number) {
      await db.delete(posts).where(eq(posts.id, id));
      return { success: true };
    },
  };
}

export type PostsRepo = ReturnType<typeof createPostsRepo>;
