import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  status: boolean("status").notNull().default(true),
  tag: text("tag"),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertAccountSchema = createInsertSchema(accounts).pick({
  username: true,
  password: true,
  tag: true,
});

export const updateAccountSchema = createInsertSchema(accounts).pick({
  status: true,
});

export const updateAccountTagSchema = z.object({
  tag: z.union([z.string().trim().max(64), z.null()]),
});

export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type UpdateAccount = z.infer<typeof updateAccountSchema>;
export type UpdateAccountTag = z.infer<typeof updateAccountTagSchema>;
export type Account = typeof accounts.$inferSelect;

export const accLogs = pgTable("acclogs", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  status: boolean("status").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertAccLogSchema = createInsertSchema(accLogs).pick({
  username: true,
  password: true,
});

export const updateAccLogSchema = createInsertSchema(accLogs).pick({
  status: true,
});

export type InsertAccLog = z.infer<typeof insertAccLogSchema>;
export type UpdateAccLog = z.infer<typeof updateAccLogSchema>;
export type AccLog = typeof accLogs.$inferSelect;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
