import { accounts, accLogs, users, liveSessions, revenueRecords, cloneRegs, type Account, type InsertAccount, type User, type AccLog, type InsertAccLog, type LiveSession, type InsertLiveSession, type RevenueRecord, type InsertRevenueRecord, type UpdateAccountDetails, type CloneReg, type InsertCloneReg, type UpdateCloneRegDetails } from "@shared/schema";
import { db } from "./db";
import { randomUUID } from "crypto";
import { eq, sql, inArray, desc, and, gte, lte } from "drizzle-orm";

const ensureLevelColumnsPromise = (async () => {
  try {
    await db.execute(sql`ALTER TABLE acclogs ADD COLUMN IF NOT EXISTS "lv" integer`);
    await db.execute(sql`ALTER TABLE acclogs ALTER COLUMN "lv" SET DEFAULT 0`);
    await db.execute(sql`UPDATE acclogs SET "lv" = 0 WHERE "lv" IS NULL`);
    await db.execute(sql`ALTER TABLE acclogs ALTER COLUMN "lv" SET NOT NULL`);
  } catch (error) {
    console.error('Error ensuring lv column on acclogs:', error);
  }

  try {
    await db.execute(sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS "lv" integer`);
    await db.execute(sql`ALTER TABLE accounts ALTER COLUMN "lv" SET DEFAULT 0`);
    await db.execute(sql`UPDATE accounts SET "lv" = 0 WHERE "lv" IS NULL`);
    await db.execute(sql`ALTER TABLE accounts ALTER COLUMN "lv" SET NOT NULL`);
  } catch (error) {
    console.error('Error ensuring lv column on accounts:', error);
  }

  // Add champion and skins columns for accounts
  try {
    await db.execute(sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS "champion" text`);
  } catch (error) {
    console.error('Error ensuring champion column on accounts:', error);
  }

  try {
    await db.execute(sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS "skins" jsonb`);
    await db.execute(sql`UPDATE accounts SET "skins" = '[]'::jsonb WHERE "skins" IS NULL`);
    await db.execute(sql`ALTER TABLE accounts ALTER COLUMN "skins" SET NOT NULL`);
  } catch (error) {
    console.error('Error ensuring skins column on accounts:', error);
  }

  // Create clonereg table if not exists
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS clonereg (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        champion TEXT,
        champions JSONB NOT NULL DEFAULT '[]'::jsonb,
        skins JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  } catch (error) {
    console.error('Error ensuring clonereg table:', error);
  }

  // Ensure champions column exists for clonereg and is not null with default
  try {
    await db.execute(sql`ALTER TABLE clonereg ADD COLUMN IF NOT EXISTS "champions" jsonb`);
    await db.execute(sql`UPDATE clonereg SET "champions" = '[]'::jsonb WHERE "champions" IS NULL`);
    // Backfill champions from single champion field if present
    await db.execute(sql`
      UPDATE clonereg 
      SET champions = CASE 
        WHEN champions = '[]'::jsonb AND champion IS NOT NULL AND length(trim(champion)) > 0 
        THEN jsonb_build_array(trim(champion)) 
        ELSE champions 
      END
    `);
    await db.execute(sql`ALTER TABLE clonereg ALTER COLUMN "champions" SET NOT NULL`);
  } catch (error) {
    console.error('Error ensuring champions column on clonereg:', error);
  }

  // Create live_sessions table if not exists
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS live_sessions (
        id SERIAL PRIMARY KEY,
        session_name TEXT NOT NULL,
        price_per_account INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  } catch (error) {
    console.error('Error ensuring live_sessions table:', error);
  }

  // Create revenue_records table if not exists
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS revenue_records (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES live_sessions(id),
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        price_per_account INTEGER NOT NULL,
        revenue INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  } catch (error) {
    console.error('Error ensuring revenue_records table:', error);
  }
})();

interface IStorage {
  getAllAccounts(): Promise<Account[]>;
  createAccount(insertAccount: InsertAccount): Promise<Account>;
  updateAccountStatus(id: number, status: boolean): Promise<Account | undefined>;
  updateAccountTag(id: number, tag: string | null): Promise<Account | undefined>;
  updateAccountDetails(id: number, updates: UpdateAccountDetails): Promise<Account | undefined>;
  updateMultipleAccountTags(tag: string | null, ids?: number[]): Promise<number>;
  deleteAccount(id: number): Promise<boolean>;
  deleteMultipleAccounts(ids: number[]): Promise<number>;
  deleteAllAccounts(): Promise<number>;
  getAccountStats(): Promise<{ total: number; active: number; inactive: number }>;
  updateAllAccountStatuses(status: boolean): Promise<number>;
  updateSelectedAccountStatuses(ids: number[], status: boolean): Promise<number>;

  getAllAccLogs(): Promise<AccLog[]>;
  createAccLog(insertAccLog: InsertAccLog): Promise<AccLog>;
  updateAccLogStatus(id: number, status: boolean): Promise<AccLog | undefined>;
  deleteAccLog(id: number): Promise<boolean>;
  deleteMultipleAccLogs(ids: number[]): Promise<number>;
  deleteAllAccLogs(): Promise<number>;
  getAccLogStats(): Promise<{ total: number; active: number; inactive: number }>;
  updateAllAccLogStatuses(status: boolean): Promise<number>;
  updateSelectedAccLogStatuses(ids: number[], status: boolean): Promise<number>;

  getUserByUsername(username: string): Promise<User | undefined>;

  // CloneReg manual table
  getAllCloneRegs(): Promise<CloneReg[]>;
  createCloneReg(insertCloneReg: InsertCloneReg): Promise<CloneReg>;
  updateCloneRegDetails(id: number, updates: UpdateCloneRegDetails): Promise<CloneReg | undefined>;
  deleteCloneReg(id: number): Promise<boolean>;

  // Revenue tracking methods
  createLiveSession(session: InsertLiveSession): Promise<LiveSession>;
  getActiveLiveSession(): Promise<LiveSession | undefined>;
  getAllLiveSessions(): Promise<LiveSession[]>;
  createRevenueRecord(record: InsertRevenueRecord): Promise<RevenueRecord>;
  getRevenueStatsByDate(startDate: Date, endDate: Date): Promise<Array<{ date: string; revenue: number; accountCount: number }>>;
  getCurrentSessionRevenue(sessionId: number): Promise<{ totalRevenue: number; accountCount: number }>;
}

export class MemoryStorage implements IStorage {
  private accountsData: Account[] = [];
  private accLogsData: AccLog[] = [];
  private usersData: User[] = [];
  private cloneRegsData: CloneReg[] = [];
  private liveSessionsData: LiveSession[] = [];
  private revenueRecordsData: RevenueRecord[] = [];
  private accountIdCounter = 1;
  private accLogIdCounter = 1;
  private cloneRegIdCounter = 1;
  private liveSessionIdCounter = 1;
  private revenueRecordIdCounter = 1;

  constructor() {
    const defaultPasswordHash = process.env.DEFAULT_DEV_PASSWORD_HASH || "$2b$10$ffqH24cGGzdQktYCPpquTuethITLFKoR33KCH36Si9f4q/r6/IMcG";
    this.usersData.push({
      id: randomUUID(),
      username: process.env.DEFAULT_DEV_USERNAME || 'admin',
      password: defaultPasswordHash,
    });
  }

  async getAllAccounts(): Promise<Account[]> {
    return [...this.accountsData];
  }

  async createAccount(insertAccount: InsertAccount): Promise<Account> {
    const account: Account = {
      id: this.accountIdCounter++,
      username: insertAccount.username,
      password: insertAccount.password,
      lv: Number(insertAccount.lv ?? 0),
      status: true,
      tag: insertAccount.tag ?? null,
      champion: insertAccount.champion ?? null,
      skins: Array.isArray(insertAccount.skins) ? insertAccount.skins : [],
      updatedAt: new Date(),
    };
    // Enforce unique username in memory mode for consistency
    if (this.accountsData.some((a) => (a.username ?? '').trim() === (account.username ?? '').trim())) {
      throw new Error('unique_violation');
    }
    this.accountsData.push(account);
    return account;
  }

  async updateAccountStatus(id: number, status: boolean): Promise<Account | undefined> {
    const account = this.accountsData.find((item) => item.id === id);
    if (!account) {
      return undefined;
    }
    account.status = status;
    account.updatedAt = new Date();
    return account;
  }

  async updateAccountDetails(id: number, updates: UpdateAccountDetails): Promise<Account | undefined> {
    const account = this.accountsData.find((item) => item.id === id);
    if (!account) {
      return undefined;
    }
    if (updates.username !== undefined) account.username = updates.username;
    if (updates.password !== undefined) account.password = updates.password;
    if (updates.lv !== undefined) account.lv = Number(updates.lv);
    if (Object.prototype.hasOwnProperty.call(updates, 'champion')) account.champion = updates.champion ?? null;
    if (updates.skins !== undefined) account.skins = Array.isArray(updates.skins) ? updates.skins : [];
    account.updatedAt = new Date();
    return account;
  }

  async updateAccountTag(id: number, tag: string | null): Promise<Account | undefined> {
    const account = this.accountsData.find((item) => item.id === id);
    if (!account) {
      return undefined;
    }
    account.tag = tag;
    account.updatedAt = new Date();
    return account;
  }

  async updateMultipleAccountTags(tag: string | null, ids?: number[]): Promise<number> {
    if (ids && ids.length > 0) {
      let updated = 0;
      this.accountsData.forEach((account) => {
        if (ids.includes(account.id)) {
          account.tag = tag;
          account.updatedAt = new Date();
          updated += 1;
        }
      });
      return updated;
    }

    this.accountsData.forEach((account) => {
      account.tag = tag;
      account.updatedAt = new Date();
    });
    return this.accountsData.length;
  }

  async deleteAccount(id: number): Promise<boolean> {
    const initialLength = this.accountsData.length;
    this.accountsData = this.accountsData.filter((item) => item.id !== id);
    return this.accountsData.length < initialLength;
  }

  async deleteMultipleAccounts(ids: number[]): Promise<number> {
    const initialLength = this.accountsData.length;
    this.accountsData = this.accountsData.filter((item) => !ids.includes(item.id));
    return initialLength - this.accountsData.length;
  }

  async deleteAllAccounts(): Promise<number> {
    const deletedCount = this.accountsData.length;
    this.accountsData = [];
    return deletedCount;
  }

  async getAccountStats(): Promise<{ total: number; active: number; inactive: number }> {
    const total = this.accountsData.length;
    const active = this.accountsData.filter((item) => item.status).length;
    const inactive = total - active;
    return { total, active, inactive };
  }

  async updateAllAccountStatuses(status: boolean): Promise<number> {
    this.accountsData.forEach((item) => {
      item.status = status;
      item.updatedAt = new Date();
    });
    return this.accountsData.length;
  }

  async updateSelectedAccountStatuses(ids: number[], status: boolean): Promise<number> {
    const targetIds = new Set(ids);
    let updated = 0;
    this.accountsData.forEach((item) => {
      if (targetIds.has(item.id)) {
        item.status = status;
        item.updatedAt = new Date();
        updated += 1;
      }
    });
    return updated;
  }

  async getAllAccLogs(): Promise<AccLog[]> {
    return [...this.accLogsData];
  }

  async createAccLog(insertAccLog: InsertAccLog): Promise<AccLog> {
    const log: AccLog = {
      id: this.accLogIdCounter++,
      username: insertAccLog.username,
      password: insertAccLog.password,
      lv: Number(insertAccLog.lv ?? 0),
      status: true,
      updatedAt: new Date(),
    };
    this.accLogsData.push(log);
    return log;
  }

  async updateAccLogStatus(id: number, status: boolean): Promise<AccLog | undefined> {
    const log = this.accLogsData.find((item) => item.id === id);
    if (!log) {
      return undefined;
    }
    log.status = status;
    log.updatedAt = new Date();
    return log;
  }

  async deleteAccLog(id: number): Promise<boolean> {
    const initialLength = this.accLogsData.length;
    this.accLogsData = this.accLogsData.filter((item) => item.id !== id);
    return this.accLogsData.length < initialLength;
  }

  async deleteMultipleAccLogs(ids: number[]): Promise<number> {
    const initialLength = this.accLogsData.length;
    this.accLogsData = this.accLogsData.filter((item) => !ids.includes(item.id));
    return initialLength - this.accLogsData.length;
  }

  async deleteAllAccLogs(): Promise<number> {
    const deletedCount = this.accLogsData.length;
    this.accLogsData = [];
    return deletedCount;
  }

  async getAccLogStats(): Promise<{ total: number; active: number; inactive: number }> {
    const total = this.accLogsData.length;
    const active = this.accLogsData.filter((item) => item.status).length;
    const inactive = total - active;
    return { total, active, inactive };
  }

  async updateAllAccLogStatuses(status: boolean): Promise<number> {
    this.accLogsData.forEach((item) => {
      item.status = status;
      item.updatedAt = new Date();
    });
    return this.accLogsData.length;
  }

  async updateSelectedAccLogStatuses(ids: number[], status: boolean): Promise<number> {
    const targetIds = new Set(ids);
    let updated = 0;
    this.accLogsData.forEach((item) => {
      if (targetIds.has(item.id)) {
        item.status = status;
        item.updatedAt = new Date();
        updated += 1;
      }
    });
    return updated;
  }

  // CloneReg (manual) implementations
  async getAllCloneRegs(): Promise<CloneReg[]> {
    return [...this.cloneRegsData];
  }

  async createCloneReg(insertCloneReg: InsertCloneReg): Promise<CloneReg> {
    const record: CloneReg = {
      id: this.cloneRegIdCounter++,
      username: insertCloneReg.username,
      password: insertCloneReg.password,
      champion: insertCloneReg.champion ?? null,
      champions: Array.isArray((insertCloneReg as any).champions)
        ? ((insertCloneReg as any).champions as string[])
        : (insertCloneReg.champion && String(insertCloneReg.champion).trim().length > 0
            ? [String(insertCloneReg.champion).trim()]
            : []),
      skins: Array.isArray(insertCloneReg.skins) ? insertCloneReg.skins : [],
      updatedAt: new Date(),
    };
    this.cloneRegsData.push(record);
    return record;
  }

  async updateCloneRegDetails(id: number, updates: UpdateCloneRegDetails): Promise<CloneReg | undefined> {
    const record = this.cloneRegsData.find((r) => r.id === id);
    if (!record) return undefined;
    if (updates.username !== undefined) record.username = updates.username;
    if (updates.password !== undefined) record.password = updates.password;
    if (Object.prototype.hasOwnProperty.call(updates, 'champion')) record.champion = updates.champion ?? null;
    if ((updates as any).champions !== undefined) {
      const champs = (updates as any).champions as unknown;
      record.champions = Array.isArray(champs) ? champs.map((c) => String(c).trim()).filter(Boolean) : record.champions;
    }
    if (updates.skins !== undefined) record.skins = Array.isArray(updates.skins) ? updates.skins : [];
    record.updatedAt = new Date();
    return record;
  }

  async deleteCloneReg(id: number): Promise<boolean> {
    const initial = this.cloneRegsData.length;
    this.cloneRegsData = this.cloneRegsData.filter((r) => r.id !== id);
    return this.cloneRegsData.length < initial;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.usersData.find((user) => user.username === username);
  }

  async createLiveSession(session: InsertLiveSession): Promise<LiveSession> {
    const liveSession: LiveSession = {
      id: this.liveSessionIdCounter++,
      sessionName: session.sessionName,
      pricePerAccount: session.pricePerAccount,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.liveSessionsData.push(liveSession);
    return liveSession;
  }

  async getActiveLiveSession(): Promise<LiveSession | undefined> {
    // Get the most recent session
    return this.liveSessionsData.length > 0
      ? this.liveSessionsData[this.liveSessionsData.length - 1]
      : undefined;
  }

  async getAllLiveSessions(): Promise<LiveSession[]> {
    return [...this.liveSessionsData];
  }

  async createRevenueRecord(record: InsertRevenueRecord): Promise<RevenueRecord> {
    const revenueRecord: RevenueRecord = {
      id: this.revenueRecordIdCounter++,
      sessionId: record.sessionId,
      accountId: record.accountId,
      pricePerAccount: record.pricePerAccount,
      revenue: record.revenue,
      createdAt: new Date(),
    };
    this.revenueRecordsData.push(revenueRecord);
    return revenueRecord;
  }

  async getRevenueStatsByDate(startDate: Date, endDate: Date): Promise<Array<{ date: string; revenue: number; accountCount: number }>> {
    const filtered = this.revenueRecordsData.filter(
      (record) => record.createdAt >= startDate && record.createdAt <= endDate
    );

    const statsByDate = new Map<string, { revenue: number; accountCount: number }>();

    filtered.forEach((record) => {
      const dateKey = record.createdAt.toISOString().split('T')[0];
      const existing = statsByDate.get(dateKey) || { revenue: 0, accountCount: 0 };
      statsByDate.set(dateKey, {
        revenue: existing.revenue + record.revenue,
        accountCount: existing.accountCount + 1,
      });
    });

    return Array.from(statsByDate.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getCurrentSessionRevenue(sessionId: number): Promise<{ totalRevenue: number; accountCount: number }> {
    const filtered = this.revenueRecordsData.filter(
      (record) => record.sessionId === sessionId
    );

    const totalRevenue = filtered.reduce((sum, record) => sum + record.revenue, 0);
    const accountCount = filtered.length;

    return { totalRevenue, accountCount };
  }
}


export class DatabaseStorage implements IStorage {
  private readonly schemaReady = ensureLevelColumnsPromise;

  private async ensureSchema() {
    await this.schemaReady;
  }

  async getAllAccounts(): Promise<Account[]> {
    await this.ensureSchema();
    try {
      return await db.select().from(accounts);
    } catch (error) {
      console.error('Error in getAllAccounts:', error);
      throw new Error('Failed to fetch accounts from database');
    }
  }

  async createAccount(insertAccount: InsertAccount): Promise<Account> {
    await this.ensureSchema();
    try {
      const [account] = await db
        .insert(accounts)
        .values({ ...insertAccount, lv: Number(insertAccount.lv ?? 0) })
        .returning();
      return account;
    } catch (error) {
      console.error('Error in createAccount:', error);
      const err = error as any;
      const message = (err && (err.message || err.toString())) || '';
      const code = err?.code || err?.severity;
      // Map Postgres unique constraint violations or similar to a recognizable token
      if (code === '23505' || /duplicate key value|unique/i.test(message)) {
        throw new Error('unique_violation');
      }
      throw new Error(message || 'Failed to create account');
    }
  }

  async updateAccountStatus(id: number, status: boolean): Promise<Account | undefined> {
    await this.ensureSchema();
    try {
      const [account] = await db
        .update(accounts)
        .set({ status, updatedAt: new Date() })
        .where(eq(accounts.id, id))
        .returning();
      return account || undefined;
    } catch (error) {
      console.error('Error in updateAccountStatus:', error);
      throw new Error('Failed to update account status in database');
    }
  }

  async updateAccountTag(id: number, tag: string | null): Promise<Account | undefined> {
    await this.ensureSchema();
    try {
      const [account] = await db
        .update(accounts)
        .set({ tag, updatedAt: new Date() })
        .where(eq(accounts.id, id))
        .returning();
      return account || undefined;
    } catch (error) {
      console.error('Error in updateAccountTag:', error);
      throw new Error('Failed to update account tag in database');
    }
  }

  async updateAccountDetails(id: number, updates: UpdateAccountDetails): Promise<Account | undefined> {
    await this.ensureSchema();
    try {
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.username !== undefined) patch.username = updates.username;
      if (updates.password !== undefined) patch.password = updates.password;
      if (updates.lv !== undefined) patch.lv = Number(updates.lv);
      if (Object.prototype.hasOwnProperty.call(updates, 'champion')) patch.champion = updates.champion ?? null;
      if (updates.skins !== undefined) patch.skins = Array.isArray(updates.skins) ? updates.skins : [];

      const [account] = await db
        .update(accounts)
        .set(patch as any)
        .where(eq(accounts.id, id))
        .returning();
      return account || undefined;
    } catch (error) {
      console.error('Error in updateAccountDetails:', error);
      throw new Error('Failed to update account details in database');
    }
  }

  async updateMultipleAccountTags(tag: string | null, ids?: number[]): Promise<number> {
    await this.ensureSchema();
    try {
      if (ids && ids.length > 0) {
        const result = await db
          .update(accounts)
          .set({ tag, updatedAt: new Date() })
          .where(inArray(accounts.id, ids));
        return result.rowCount ?? 0;
      }

      const result = await db
        .update(accounts)
        .set({ tag, updatedAt: new Date() });
      return result.rowCount ?? 0;
    } catch (error) {
      console.error('Error in updateMultipleAccountTags:', error);
      throw new Error('Failed to update account tags in database');
    }
  }

  async deleteAccount(id: number): Promise<boolean> {
    await this.ensureSchema();
    try {
      const result = await db
        .delete(accounts)
        .where(eq(accounts.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error('Error in deleteAccount:', error);
      throw new Error('Failed to delete account from database');
    }
  }

  async deleteMultipleAccounts(ids: number[]): Promise<number> {
    await this.ensureSchema();
    if (ids.length === 0) {
      return 0;
    }
    try {
      const result = await db
        .delete(accounts)
        .where(inArray(accounts.id, ids));
      return result.rowCount ?? 0;
    } catch (error) {
      console.error('Error in deleteMultipleAccounts:', error);
      throw new Error('Failed to delete multiple accounts from database');
    }
  }

  async deleteAllAccounts(): Promise<number> {
    await this.ensureSchema();
    try {
      const result = await db.delete(accounts);
      return result.rowCount ?? 0;
    } catch (error) {
      console.error('Error in deleteAllAccounts:', error);
      throw new Error('Failed to delete all accounts from database');
    }
  }

  async getAccountStats(): Promise<{ total: number; active: number; inactive: number }> {
    await this.ensureSchema();
    try {
      const [stats] = await db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`count(*) filter (where status = true)`,
          inactive: sql<number>`count(*) filter (where status = false)`
        })
        .from(accounts);

      if (!stats) {
        return { total: 0, active: 0, inactive: 0 };
      }

      return {
        total: Number(stats.total) || 0,
        active: Number(stats.active) || 0,
        inactive: Number(stats.inactive) || 0,
      };
    } catch (error) {
      console.error('Error in getAccountStats:', error);
      return { total: 0, active: 0, inactive: 0 };
    }
  }

  async updateAllAccountStatuses(status: boolean): Promise<number> {
    await this.ensureSchema();
    try {
      await db.update(accounts).set({ status, updatedAt: new Date() });
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(accounts)
        .where(eq(accounts.status, status));
      return row?.count ?? 0;
    } catch (error) {
      console.error('Error in updateAllAccountStatuses:', error);
      throw new Error('Failed to update all account statuses');
    }
  }

  async updateSelectedAccountStatuses(ids: number[], status: boolean): Promise<number> {
    await this.ensureSchema();
    if (ids.length === 0) {
      return 0;
    }
    try {
      const result = await db
        .update(accounts)
        .set({ status, updatedAt: new Date() })
        .where(inArray(accounts.id, ids));
      return result.rowCount ?? 0;
    } catch (error) {
      console.error('Error in updateSelectedAccountStatuses:', error);
      throw new Error('Failed to update selected account statuses');
    }
  }

  async getAllAccLogs(): Promise<AccLog[]> {
    await this.ensureSchema();
    try {
      return await db.select().from(accLogs);
    } catch (error) {
      console.error('Error in getAllAccLogs:', error);
      throw new Error('Failed to fetch acc logs from database');
    }
  }

  async createAccLog(insertAccLog: InsertAccLog): Promise<AccLog> {
    await this.ensureSchema();
    try {
      const [log] = await db
        .insert(accLogs)
        .values({ ...insertAccLog, lv: Number(insertAccLog.lv ?? 0) })
        .returning();
      return log;
    } catch (error) {
      console.error('Error in createAccLog:', error);
      throw new Error('Failed to create acc log in database');
    }
  }

  async updateAccLogStatus(id: number, status: boolean): Promise<AccLog | undefined> {
    await this.ensureSchema();
    try {
      const [log] = await db
        .update(accLogs)
        .set({ status, updatedAt: new Date() })
        .where(eq(accLogs.id, id))
        .returning();
      return log || undefined;
    } catch (error) {
      console.error('Error in updateAccLogStatus:', error);
      throw new Error('Failed to update acc log status in database');
    }
  }

  async deleteAccLog(id: number): Promise<boolean> {
    await this.ensureSchema();
    try {
      const result = await db
        .delete(accLogs)
        .where(eq(accLogs.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error('Error in deleteAccLog:', error);
      throw new Error('Failed to delete acc log from database');
    }
  }

  async deleteMultipleAccLogs(ids: number[]): Promise<number> {
    await this.ensureSchema();
    if (ids.length === 0) {
      return 0;
    }
    try {
      const result = await db
        .delete(accLogs)
        .where(inArray(accLogs.id, ids));
      return result.rowCount ?? 0;
    } catch (error) {
      console.error('Error in deleteMultipleAccLogs:', error);
      throw new Error('Failed to delete multiple acc logs from database');
    }
  }

  async deleteAllAccLogs(): Promise<number> {
    await this.ensureSchema();
    try {
      const result = await db.delete(accLogs);
      return result.rowCount ?? 0;
    } catch (error) {
      console.error('Error in deleteAllAccLogs:', error);
      throw new Error('Failed to delete all acc logs from database');
    }
  }

  async getAccLogStats(): Promise<{ total: number; active: number; inactive: number }> {
    await this.ensureSchema();
    try {
      const [stats] = await db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`count(*) filter (where status = true)`,
          inactive: sql<number>`count(*) filter (where status = false)`
        })
        .from(accLogs);

      if (!stats) {
        return { total: 0, active: 0, inactive: 0 };
      }

      return {
        total: Number(stats.total) || 0,
        active: Number(stats.active) || 0,
        inactive: Number(stats.inactive) || 0,
      };
    } catch (error) {
      console.error('Error in getAccLogStats:', error);
      return { total: 0, active: 0, inactive: 0 };
    }
  }

  async updateAllAccLogStatuses(status: boolean): Promise<number> {
    await this.ensureSchema();
    try {
      await db.update(accLogs).set({ status, updatedAt: new Date() });
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(accLogs)
        .where(eq(accLogs.status, status));
      return row?.count ?? 0;
    } catch (error) {
      console.error('Error in updateAllAccLogStatuses:', error);
      throw new Error('Failed to update all acc log statuses');
    }
  }

  async updateSelectedAccLogStatuses(ids: number[], status: boolean): Promise<number> {
    await this.ensureSchema();
    if (ids.length === 0) {
      return 0;
    }
    try {
      const result = await db
        .update(accLogs)
        .set({ status, updatedAt: new Date() })
        .where(inArray(accLogs.id, ids));
      return result.rowCount ?? 0;
    } catch (error) {
      console.error('Error in updateSelectedAccLogStatuses:', error);
      throw new Error('Failed to update selected acc log statuses');
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.ensureSchema();
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
      return user;
    } catch (error) {
      console.error('Error in getUserByUsername:', error);
      throw new Error('Failed to fetch user from database');
    }
  }

  // CloneReg (manual) DB implementations
  async getAllCloneRegs(): Promise<CloneReg[]> {
    await this.ensureSchema();
    try {
      return await db.select().from(cloneRegs);
    } catch (error) {
      console.error('Error in getAllCloneRegs:', error);
      throw new Error('Failed to fetch clonereg from database');
    }
  }

  async createCloneReg(insertCloneReg: InsertCloneReg): Promise<CloneReg> {
    await this.ensureSchema();
    try {
      const championsArray = Array.isArray((insertCloneReg as any).champions)
        ? ((insertCloneReg as any).champions as string[])
        : (insertCloneReg.champion && String(insertCloneReg.champion).trim().length > 0
            ? [String(insertCloneReg.champion).trim()]
            : []);

      const [row] = await db.insert(cloneRegs).values({
        username: insertCloneReg.username,
        password: insertCloneReg.password,
        champion: insertCloneReg.champion ?? null,
        champions: championsArray,
        skins: Array.isArray(insertCloneReg.skins) ? insertCloneReg.skins : [],
      }).returning();
      return row;
    } catch (error) {
      console.error('Error in createCloneReg:', error);
      throw new Error('Failed to create clonereg in database');
    }
  }

  async updateCloneRegDetails(id: number, updates: UpdateCloneRegDetails): Promise<CloneReg | undefined> {
    await this.ensureSchema();
    try {
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.username !== undefined) patch.username = updates.username;
      if (updates.password !== undefined) patch.password = updates.password;
      if (Object.prototype.hasOwnProperty.call(updates, 'champion')) patch.champion = updates.champion ?? null;
      if (Object.prototype.hasOwnProperty.call(updates as any, 'champions')) {
        const champs = (updates as any).champions as unknown;
        patch.champions = Array.isArray(champs) ? champs.map((c) => String(c).trim()).filter(Boolean) : [];
      }
      if (updates.skins !== undefined) patch.skins = Array.isArray(updates.skins) ? updates.skins : [];
      const [row] = await db.update(cloneRegs).set(patch as any).where(eq(cloneRegs.id, id)).returning();
      return row || undefined;
    } catch (error) {
      console.error('Error in updateCloneRegDetails:', error);
      throw new Error('Failed to update clonereg in database');
    }
  }

  async deleteCloneReg(id: number): Promise<boolean> {
    await this.ensureSchema();
    try {
      const result = await db.delete(cloneRegs).where(eq(cloneRegs.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error('Error in deleteCloneReg:', error);
      throw new Error('Failed to delete clonereg from database');
    }
  }

  async createLiveSession(session: InsertLiveSession): Promise<LiveSession> {
    await this.ensureSchema();
    try {
      console.log('Creating live session with data:', session);
      const [liveSession] = await db
        .insert(liveSessions)
        .values({
          sessionName: session.sessionName,
          pricePerAccount: session.pricePerAccount,
          updatedAt: new Date(),
        })
        .returning();
      console.log('Created live session:', liveSession);
      return liveSession;
    } catch (error) {
      console.error('Error in createLiveSession:', error);
      console.error('Error details:', error instanceof Error ? error.stack : error);
      
      // Check if it's a table doesn't exist error
      if (error instanceof Error && error.message.includes('does not exist')) {
        throw new Error('Database table chưa được tạo. Vui lòng restart server để tạo tables tự động.');
      }
      
      throw new Error(`Failed to create live session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getActiveLiveSession(): Promise<LiveSession | undefined> {
    await this.ensureSchema();
    try {
      const [session] = await db
        .select()
        .from(liveSessions)
        .orderBy(desc(liveSessions.createdAt))
        .limit(1);
      return session;
    } catch (error) {
      console.error('Error in getActiveLiveSession:', error);
      throw new Error('Failed to fetch active live session from database');
    }
  }

  async getAllLiveSessions(): Promise<LiveSession[]> {
    await this.ensureSchema();
    try {
      return await db
        .select()
        .from(liveSessions)
        .orderBy(desc(liveSessions.createdAt));
    } catch (error) {
      console.error('Error in getAllLiveSessions:', error);
      throw new Error('Failed to fetch live sessions from database');
    }
  }

  async createRevenueRecord(record: InsertRevenueRecord): Promise<RevenueRecord> {
    await this.ensureSchema();
    try {
      const [revenueRecord] = await db
        .insert(revenueRecords)
        .values(record)
        .returning();
      return revenueRecord;
    } catch (error) {
      console.error('Error in createRevenueRecord:', error);
      throw new Error('Failed to create revenue record in database');
    }
  }

  async getRevenueStatsByDate(startDate: Date, endDate: Date): Promise<Array<{ date: string; revenue: number; accountCount: number }>> {
    await this.ensureSchema();
    try {
      const results = await db
        .select({
          date: sql<string>`DATE(${revenueRecords.createdAt})`,
          revenue: sql<number>`SUM(${revenueRecords.revenue})`,
          accountCount: sql<number>`COUNT(*)`,
        })
        .from(revenueRecords)
        .where(
          and(
            gte(revenueRecords.createdAt, startDate),
            lte(revenueRecords.createdAt, endDate)
          )
        )
        .groupBy(sql`DATE(${revenueRecords.createdAt})`)
        .orderBy(sql`DATE(${revenueRecords.createdAt})`);

      return results.map((row) => ({
        date: row.date,
        revenue: Number(row.revenue) || 0,
        accountCount: Number(row.accountCount) || 0,
      }));
    } catch (error) {
      console.error('Error in getRevenueStatsByDate:', error);
      throw new Error('Failed to fetch revenue stats from database');
    }
  }

  async getCurrentSessionRevenue(sessionId: number): Promise<{ totalRevenue: number; accountCount: number }> {
    await this.ensureSchema();
    try {
      const [result] = await db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${revenueRecords.revenue}), 0)`,
          accountCount: sql<number>`COUNT(*)`,
        })
        .from(revenueRecords)
        .where(eq(revenueRecords.sessionId, sessionId));

      return {
        totalRevenue: Number(result?.totalRevenue) || 0,
        accountCount: Number(result?.accountCount) || 0,
      };
    } catch (error) {
      console.error('Error in getCurrentSessionRevenue:', error);
      throw new Error('Failed to fetch current session revenue from database');
    }
  }
}

const useDatabaseStorage = process.env.NODE_ENV === 'production' || process.env.USE_DATABASE_STORAGE === 'true';

let storageInstance: IStorage;

if (useDatabaseStorage) {
  storageInstance = new DatabaseStorage();
} else {
  console.warn('Using in-memory storage. Set USE_DATABASE_STORAGE=true to enable PostgreSQL-backed storage.');
  storageInstance = new MemoryStorage();
}

export const storage = storageInstance;
