import { integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(), // Firebase UID
  email: text('email'),
  name: text('name'),
  picture: text('picture'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userTrackers = pgTable('user_trackers', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  language: text('language').notNull().default('ar'),
  dialect: text('dialect').notNull().default('egyptian'),
  userName: text('user_name'),
  actionsJson: jsonb('actions_json').notNull().default([]),
  logsJson: jsonb('logs_json').notNull().default({}),
  totalPoints: integer('total_points').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const focusGameScores = pgTable('focus_game_scores', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  score: integer('score').notNull(),
  wave: integer('wave').notNull().default(1),
  maxCombo: integer('max_combo').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
