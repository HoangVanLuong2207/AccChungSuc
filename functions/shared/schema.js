const { sql } = require("drizzle-orm");
const { pgTable, text, varchar, boolean, serial, timestamp, integer, jsonb } = require("drizzle-orm/pg-core");
const { createInsertSchema } = require("drizzle-zod");
const { z } = require("zod");

const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  lv: integer("lv").notNull().default(0),
  status: boolean("status").notNull().default(true),
  tag: text("tag"),
  champion: text("champion"),
  skins: jsonb("skins").$type().notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

const insertAccountSchema = createInsertSchema(accounts).pick({
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
  champion: z
    .union([z.string().trim().max(128), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null)),
  skins: z
    .array(z.string().trim())
    .max(200)
    .default([]),
});

const updateAccountSchema = createInsertSchema(accounts).pick({
  status: true,
});

const updateAccountTagSchema = z.object({
  tag: z.union([z.string().trim().max(64), z.null()]),
});

const updateAccountDetailsSchema = z.object({
  username: z.string().trim().min(1).max(160).optional(),
  password: z.string().trim().min(1).max(160).optional(),
  lv: z.coerce.number().int().min(0).optional(),
  champion: z
    .union([z.string().trim().max(128), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null)),
  skins: z.array(z.string().trim()).max(200).optional(),
});

const cloneRegs = pgTable("clonereg", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  champion: text("champion"),
  champions: jsonb("champions").$type().notNull().default(sql`'[]'::jsonb`),
  skins: jsonb("skins").$type().notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

const insertCloneRegSchema = createInsertSchema(cloneRegs).pick({
  username: true,
  password: true,
  champion: true,
  champions: true,
  skins: true,
}).extend({
  username: z.string().trim().min(1).max(160),
  password: z.string().trim().min(1).max(160),
  champion: z
    .union([z.string().trim().max(128), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null)),
  champions: z.array(z.string().trim()).max(200).default([]),
  skins: z.array(z.string().trim()).max(200).default([]),
});

const updateCloneRegDetailsSchema = z.object({
  username: z.string().trim().min(1).max(160).optional(),
  password: z.string().trim().min(1).max(160).optional(),
  champion: z
    .union([z.string().trim().max(128), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null)),
  champions: z.array(z.string().trim()).max(200).optional(),
  skins: z.array(z.string().trim()).max(200).optional(),
});

const accLogs = pgTable("acclogs", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  lv: integer("lv").notNull().default(0),
  status: boolean("status").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

const insertAccLogSchema = createInsertSchema(accLogs).pick({
  username: true,
  password: true,
  lv: true,
}).extend({
  lv: z.coerce.number().int().min(0).default(0),
});

const updateAccLogSchema = createInsertSchema(accLogs).pick({
  status: true,
});

const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

const liveSessions = pgTable("live_sessions", {
  id: serial("id").primaryKey(),
  sessionName: text("session_name").notNull(),
  pricePerAccount: integer("price_per_account").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

const insertLiveSessionSchema = createInsertSchema(liveSessions).pick({
  sessionName: true,
  pricePerAccount: true,
}).extend({
  pricePerAccount: z.coerce.number().int().min(0),
});

const revenueRecords = pgTable("revenue_records", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveSessions.id),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  pricePerAccount: integer("price_per_account").notNull(),
  revenue: integer("revenue").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

const insertRevenueRecordSchema = createInsertSchema(revenueRecords).pick({
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

module.exports = {
  accounts,
  insertAccountSchema,
  updateAccountSchema,
  updateAccountTagSchema,
  updateAccountDetailsSchema,
  cloneRegs,
  insertCloneRegSchema,
  updateCloneRegDetailsSchema,
  accLogs,
  insertAccLogSchema,
  updateAccLogSchema,
  users,
  insertUserSchema,
  liveSessions,
  insertLiveSessionSchema,
  revenueRecords,
  insertRevenueRecordSchema,
};
