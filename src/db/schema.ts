import { pgTable, serial, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// AI agents: this is THE source of truth for the database schema.
// Add/change tables here, then run `npx drizzle-kit generate` to produce a new
// migration file under src/db/migrations/ — never hand-write migration SQL.
// See README.md "The golden workflow: adding a new feature/table" for the full steps.

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Posts table (demonstrates a relation to users)
export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  published: boolean('published').default(false).notNull(),
  authorId: integer('author_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relation definitions (these enable Drizzle's relational query API,
// e.g. `db.query.users.findFirst({ with: { posts: true } })`).
// If you add a new table that references another one, add its relations() too.
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));

// Exported types shared by the main thread and the worker.
// When you add a table, export its Select/Insert types the same way.
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
