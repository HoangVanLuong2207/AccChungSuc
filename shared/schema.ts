import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  lv: integer("lv").notNull().default(0),
  status: integer("status", { mode: "boolean" }).notNull().default(true),
  tag: text("tag"),
  champion: text("champion"),
  // Store skins as JSON string
  skins: text("skins").notNull().default("[]"),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const insertAccountSchema = createInsertSchema(accounts).pick({
  username: true,
  password: true,
  tag: true,
  lv: true,
  champion: true,
  skins: true,
}).extend({
  username: z.string().trim().min(1).max(160),
  password: z.string().trim().min(1).max(160),
  lv: z.coerce.number().int().min(0).default(0),
  // Accept string or null; normalize empty string to null
  champion: z
    .union([z.string().trim().max(128), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null)),
  skins: z
    .array(z.string().trim())
    .max(200)
    .default([])
    .transform((arr) => JSON.stringify(arr)),
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
  // Allow explicit null or non-empty string; normalize empty to null
  champion: z
    .union([z.string().trim().max(128), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null)),
  skins: z.array(z.string().trim()).max(200).optional()
    .transform((arr) => arr ? JSON.stringify(arr) : undefined),
});

export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type UpdateAccount = z.infer<typeof updateAccountSchema>;
export type UpdateAccountTag = z.infer<typeof updateAccountTagSchema>;
export type UpdateAccountDetails = z.infer<typeof updateAccountDetailsSchema>;
export type Account = typeof accounts.$inferSelect;

// CloneReg table for manual registry management screen
export const cloneRegs = sqliteTable("clonereg", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  champion: text("champion"),
  // New: support multiple champions as JSON string
  champions: text("champions").notNull().default("[]"),
  skins: text("skins").notNull().default("[]"),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const insertCloneRegSchema = createInsertSchema(cloneRegs).pick({
  username: true,
  password: true,
  champion: true,
  champions: true,
  skins: true,
}).extend({
  username: z.string().trim().min(1).max(160),
  password: z.string().trim().min(1).max(160),
  // Accept string or null for champion in CloneReg too
  champion: z
    .union([z.string().trim().max(128), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null)),
  // Multiple champions support
  champions: z.array(z.string().trim()).max(200).default([])
    .transform((arr) => JSON.stringify(arr)),
  skins: z.array(z.string().trim()).max(200).default([])
    .transform((arr) => JSON.stringify(arr)),
});

export const updateCloneRegDetailsSchema = z.object({
  username: z.string().trim().min(1).max(160).optional(),
  password: z.string().trim().min(1).max(160).optional(),
  // Allow explicit null or non-empty string; normalize empty to null
  champion: z
    .union([z.string().trim().max(128), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null)),
  champions: z.array(z.string().trim()).max(200).optional()
    .transform((arr) => arr ? JSON.stringify(arr) : undefined),
  skins: z.array(z.string().trim()).max(200).optional()
    .transform((arr) => arr ? JSON.stringify(arr) : undefined),
});

export type InsertCloneReg = z.infer<typeof insertCloneRegSchema>;
export type UpdateCloneRegDetails = z.infer<typeof updateCloneRegDetailsSchema>;
export type CloneReg = typeof cloneRegs.$inferSelect;

export const accLogs = sqliteTable("acclogs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  lv: integer("lv").notNull().default(0),
  status: integer("status", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
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

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const liveSessions = sqliteTable("live_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionName: text("session_name").notNull(),
  pricePerAccount: integer("price_per_account").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const insertLiveSessionSchema = createInsertSchema(liveSessions).pick({
  sessionName: true,
  pricePerAccount: true,
}).extend({
  pricePerAccount: z.coerce.number().int().min(0),
});

export type InsertLiveSession = z.infer<typeof insertLiveSessionSchema>;
export type LiveSession = typeof liveSessions.$inferSelect;

export const revenueRecords = sqliteTable("revenue_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").references(() => liveSessions.id),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  pricePerAccount: integer("price_per_account").notNull(),
  revenue: integer("revenue").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
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
