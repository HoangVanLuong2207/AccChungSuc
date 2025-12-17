import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  lv: integer("lv").notNull().default(0),
  status: boolean("status").notNull().default(true),
  tag: text("tag"),
  champion: text("champion"),
  // Store skins as JSONB array of strings for flexibility
  skins: jsonb("skins").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertAccountSchema = createInsertSchema(accounts).pick({
  username: true,
  password: true,
  tag: true,
  lv: true,
  champion: true,
  skins: true,
}).extend({
  lv: z.coerce.number().int().min(0).default(0),
  champion: z.string().trim().max(128).optional().transform((v) => (v && v.length > 0 ? v : null)),
  skins: z
    .array(z.string().trim())
    .max(200)
    .default([]),
});

export const updateAccountSchema = createInsertSchema(accounts).pick({
  status: true,
});

export const updateAccountTagSchema = z.object({
  tag: z.union([z.string().trim().max(64), z.null()]),
});

// Update details: allow partial updates for editable fields
export const updateAccountDetailsSchema = z.object({
  username: z.string().trim().min(1).max(160).optional(),
  password: z.string().trim().min(1).max(160).optional(),
  lv: z.coerce.number().int().min(0).optional(),
  champion: z
    .string()
    .trim()
    .max(128)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  skins: z.array(z.string().trim()).max(200).optional(),
});

export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type UpdateAccount = z.infer<typeof updateAccountSchema>;
export type UpdateAccountTag = z.infer<typeof updateAccountTagSchema>;
export type UpdateAccountDetails = z.infer<typeof updateAccountDetailsSchema>;
export type Account = typeof accounts.$inferSelect;

// CloneReg table for manual registry management screen
export const cloneRegs = pgTable("clonereg", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  champion: text("champion"),
  skins: jsonb("skins").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertCloneRegSchema = createInsertSchema(cloneRegs).pick({
  username: true,
  password: true,
  champion: true,
  skins: true,
}).extend({
  champion: z.string().trim().max(128).optional().transform((v) => (v && v.length > 0 ? v : null)),
  skins: z.array(z.string().trim()).max(200).default([]),
});

export const updateCloneRegDetailsSchema = z.object({
  username: z.string().trim().min(1).max(160).optional(),
  password: z.string().trim().min(1).max(160).optional(),
  champion: z.string().trim().max(128).optional().transform((v) => (v && v.length > 0 ? v : null)),
  skins: z.array(z.string().trim()).max(200).optional(),
});

export type InsertCloneReg = z.infer<typeof insertCloneRegSchema>;
export type UpdateCloneRegDetails = z.infer<typeof updateCloneRegDetailsSchema>;
export type CloneReg = typeof cloneRegs.$inferSelect;

export const accLogs = pgTable("acclogs", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  lv: integer("lv").notNull().default(0),
  status: boolean("status").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertAccLogSchema = createInsertSchema(accLogs).pick({
  username: true,
  password: true,
  lv: true,
}).extend({
  lv: z.coerce.number().int().min(0).default(0),
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

export const liveSessions = pgTable("live_sessions", {
  id: serial("id").primaryKey(),
  sessionName: text("session_name").notNull(),
  pricePerAccount: integer("price_per_account").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertLiveSessionSchema = createInsertSchema(liveSessions).pick({
  sessionName: true,
  pricePerAccount: true,
}).extend({
  pricePerAccount: z.coerce.number().int().min(0),
});

export type InsertLiveSession = z.infer<typeof insertLiveSessionSchema>;
export type LiveSession = typeof liveSessions.$inferSelect;

export const revenueRecords = pgTable("revenue_records", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveSessions.id),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  pricePerAccount: integer("price_per_account").notNull(),
  revenue: integer("revenue").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertRevenueRecordSchema = createInsertSchema(revenueRecords).pick({
  sessionId: true,
  accountId: true,
  pricePerAccount: true,
  revenue: true,
}).extend({
  sessionId: z.number().int().positive().nullable(),
  accountId: z.number().int().positive(),
  pricePerAccount: z.coerce.number().int().min(0),
  revenue: z.coerce.number().int().min(0),
});

export type InsertRevenueRecord = z.infer<typeof insertRevenueRecordSchema>;
export type RevenueRecord = typeof revenueRecords.$inferSelect;
