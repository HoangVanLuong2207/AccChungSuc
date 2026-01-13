import { accounts, accLogs, users, liveSessions, revenueRecords, cloneRegs, type Account, type InsertAccount, type User, type AccLog, type InsertAccLog, type LiveSession, type InsertLiveSession, type RevenueRecord, type InsertRevenueRecord, type UpdateAccountDetails, type CloneReg, type InsertCloneReg, type UpdateCloneRegDetails } from "@shared/schema";
import { db } from "./db";
import { randomUUID } from "crypto";
import { eq, sql, inArray, desc, and, gte, lte } from "drizzle-orm";

// Initialize tables for SQLite/Turso
const ensureTablesPromise = (async () => {
  try {
    // Create accounts table
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        lv INTEGER NOT NULL DEFAULT 0,
        status INTEGER NOT NULL DEFAULT 1,
        tag TEXT,
        champion TEXT,
        skins TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create acclogs table
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS acclogs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        lv INTEGER NOT NULL DEFAULT 0,
        status INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create users table
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      )
    `);

    // Create clonereg table
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS clonereg (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        champion TEXT,
        champions TEXT NOT NULL DEFAULT '[]',
        skins TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create live_sessions table
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS live_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_name TEXT NOT NULL,
        price_per_account INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create revenue_records table
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS revenue_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER REFERENCES live_sessions(id),
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        price_per_account INTEGER NOT NULL,
        revenue INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    console.log('✅ All SQLite tables created/verified');
  } catch (error) {
    console.error('Error ensuring SQLite tables:', error);
  }
})();

// Helper to parse JSON fields from SQLite text
function parseJsonField<T>(value: unknown, defaultValue: T): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  }
  if (Array.isArray(value)) return value as T;
  return defaultValue;
}

// Helper to get ISO datetime string
function nowIso(): string {
  return new Date().toISOString();
}

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
    const skinsValue = typeof insertAccount.skins === 'string'
      ? insertAccount.skins
      : JSON.stringify(insertAccount.skins ?? []);
    const account: Account = {
      id: this.accountIdCounter++,
      username: insertAccount.username,
      password: insertAccount.password,
      lv: Number(insertAccount.lv ?? 0),
      status: true,
      tag: insertAccount.tag ?? null,
      champion: insertAccount.champion ?? null,
      skins: skinsValue,
      updatedAt: nowIso(),
    };
    if (this.accountsData.some((a) => (a.username ?? '').trim() === (account.username ?? '').trim())) {
      throw new Error('unique_violation');
    }
    this.accountsData.push(account);
    return account;
  }

  async updateAccountStatus(id: number, status: boolean): Promise<Account | undefined> {
    const account = this.accountsData.find((item) => item.id === id);
    if (!account) return undefined;
    account.status = status;
    account.updatedAt = nowIso();
    return account;
  }

  async updateAccountDetails(id: number, updates: UpdateAccountDetails): Promise<Account | undefined> {
    const account = this.accountsData.find((item) => item.id === id);
    if (!account) return undefined;
    if (updates.username !== undefined) account.username = updates.username;
    if (updates.password !== undefined) account.password = updates.password;
    if (updates.lv !== undefined) account.lv = Number(updates.lv);
    if (Object.prototype.hasOwnProperty.call(updates, 'champion')) account.champion = updates.champion ?? null;
    if (updates.skins !== undefined) {
      account.skins = typeof updates.skins === 'string' ? updates.skins : JSON.stringify(updates.skins);
    }
    account.updatedAt = nowIso();
    return account;
  }

  async updateAccountTag(id: number, tag: string | null): Promise<Account | undefined> {
    const account = this.accountsData.find((item) => item.id === id);
    if (!account) return undefined;
    account.tag = tag;
    account.updatedAt = nowIso();
    return account;
  }

  async updateMultipleAccountTags(tag: string | null, ids?: number[]): Promise<number> {
    if (ids && ids.length > 0) {
      let updated = 0;
      this.accountsData.forEach((account) => {
        if (ids.includes(account.id)) {
          account.tag = tag;
          account.updatedAt = nowIso();
          updated += 1;
        }
      });
      return updated;
    }
    this.accountsData.forEach((account) => {
      account.tag = tag;
      account.updatedAt = nowIso();
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
    return { total, active, inactive: total - active };
  }

  async updateAllAccountStatuses(status: boolean): Promise<number> {
    this.accountsData.forEach((item) => {
      item.status = status;
      item.updatedAt = nowIso();
    });
    return this.accountsData.length;
  }

  async updateSelectedAccountStatuses(ids: number[], status: boolean): Promise<number> {
    const targetIds = new Set(ids);
    let updated = 0;
    this.accountsData.forEach((item) => {
      if (targetIds.has(item.id)) {
        item.status = status;
        item.updatedAt = nowIso();
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
      updatedAt: nowIso(),
    };
    this.accLogsData.push(log);
    return log;
  }

  async updateAccLogStatus(id: number, status: boolean): Promise<AccLog | undefined> {
    const log = this.accLogsData.find((item) => item.id === id);
    if (!log) return undefined;
    log.status = status;
    log.updatedAt = nowIso();
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
    return { total, active, inactive: total - active };
  }

  async updateAllAccLogStatuses(status: boolean): Promise<number> {
    this.accLogsData.forEach((item) => {
      item.status = status;
      item.updatedAt = nowIso();
    });
    return this.accLogsData.length;
  }

  async updateSelectedAccLogStatuses(ids: number[], status: boolean): Promise<number> {
    const targetIds = new Set(ids);
    let updated = 0;
    this.accLogsData.forEach((item) => {
      if (targetIds.has(item.id)) {
        item.status = status;
        item.updatedAt = nowIso();
        updated += 1;
      }
    });
    return updated;
  }

  async getAllCloneRegs(): Promise<CloneReg[]> {
    return [...this.cloneRegsData];
  }

  async createCloneReg(insertCloneReg: InsertCloneReg): Promise<CloneReg> {
    const championsValue = typeof insertCloneReg.champions === 'string'
      ? insertCloneReg.champions
      : JSON.stringify(insertCloneReg.champions ?? []);
    const skinsValue = typeof insertCloneReg.skins === 'string'
      ? insertCloneReg.skins
      : JSON.stringify(insertCloneReg.skins ?? []);
    const record: CloneReg = {
      id: this.cloneRegIdCounter++,
      username: insertCloneReg.username,
      password: insertCloneReg.password,
      champion: insertCloneReg.champion ?? null,
      champions: championsValue,
      skins: skinsValue,
      updatedAt: nowIso(),
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
    if (updates.champions !== undefined) {
      record.champions = typeof updates.champions === 'string' ? updates.champions : JSON.stringify(updates.champions);
    }
    if (updates.skins !== undefined) {
      record.skins = typeof updates.skins === 'string' ? updates.skins : JSON.stringify(updates.skins);
    }
    record.updatedAt = nowIso();
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
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.liveSessionsData.push(liveSession);
    return liveSession;
  }

  async getActiveLiveSession(): Promise<LiveSession | undefined> {
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
      createdAt: nowIso(),
    };
    this.revenueRecordsData.push(revenueRecord);
    return revenueRecord;
  }

  async getRevenueStatsByDate(startDate: Date, endDate: Date): Promise<Array<{ date: string; revenue: number; accountCount: number }>> {
    const filtered = this.revenueRecordsData.filter(
      (record) => new Date(record.createdAt) >= startDate && new Date(record.createdAt) <= endDate
    );
    const statsByDate = new Map<string, { revenue: number; accountCount: number }>();
    filtered.forEach((record) => {
      const dateKey = new Date(record.createdAt).toISOString().split('T')[0];
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
    const filtered = this.revenueRecordsData.filter((record) => record.sessionId === sessionId);
    return {
      totalRevenue: filtered.reduce((sum, record) => sum + record.revenue, 0),
      accountCount: filtered.length,
    };
  }
}


export class DatabaseStorage implements IStorage {
  private readonly schemaReady = ensureTablesPromise;

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
      const skinsValue = typeof insertAccount.skins === 'string'
        ? insertAccount.skins
        : JSON.stringify(insertAccount.skins ?? []);
      const result = await db
        .insert(accounts)
        .values({
          ...insertAccount,
          lv: Number(insertAccount.lv ?? 0),
          skins: skinsValue,
          updatedAt: nowIso(),
        })
        .returning();
      return result[0];
    } catch (error) {
      console.error('Error in createAccount:', error);
      const err = error as any;
      const message = (err && (err.message || err.toString())) || '';
      if (/UNIQUE constraint failed|unique/i.test(message)) {
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
        .set({ status, updatedAt: nowIso() })
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
        .set({ tag, updatedAt: nowIso() })
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
      const patch: Record<string, unknown> = { updatedAt: nowIso() };
      if (updates.username !== undefined) patch.username = updates.username;
      if (updates.password !== undefined) patch.password = updates.password;
      if (updates.lv !== undefined) patch.lv = Number(updates.lv);
      if (Object.prototype.hasOwnProperty.call(updates, 'champion')) patch.champion = updates.champion ?? null;
      if (updates.skins !== undefined) {
        patch.skins = typeof updates.skins === 'string' ? updates.skins : JSON.stringify(updates.skins);
      }

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
          .set({ tag, updatedAt: nowIso() })
          .where(inArray(accounts.id, ids));
        return (result as any).rowsAffected ?? ids.length;
      }
      const result = await db.update(accounts).set({ tag, updatedAt: nowIso() });
      return (result as any).rowsAffected ?? 0;
    } catch (error) {
      console.error('Error in updateMultipleAccountTags:', error);
      throw new Error('Failed to update account tags in database');
    }
  }

  async deleteAccount(id: number): Promise<boolean> {
    await this.ensureSchema();
    try {
      const result = await db.delete(accounts).where(eq(accounts.id, id));
      return ((result as any).rowsAffected ?? 0) > 0;
    } catch (error) {
      console.error('Error in deleteAccount:', error);
      throw new Error('Failed to delete account from database');
    }
  }

  async deleteMultipleAccounts(ids: number[]): Promise<number> {
    await this.ensureSchema();
    if (ids.length === 0) return 0;
    try {
      const result = await db.delete(accounts).where(inArray(accounts.id, ids));
      return (result as any).rowsAffected ?? 0;
    } catch (error) {
      console.error('Error in deleteMultipleAccounts:', error);
      throw new Error('Failed to delete multiple accounts from database');
    }
  }

  async deleteAllAccounts(): Promise<number> {
    await this.ensureSchema();
    try {
      const result = await db.delete(accounts);
      return (result as any).rowsAffected ?? 0;
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
          active: sql<number>`sum(case when status = 1 then 1 else 0 end)`,
          inactive: sql<number>`sum(case when status = 0 then 1 else 0 end)`
        })
        .from(accounts);
      return {
        total: Number(stats?.total) || 0,
        active: Number(stats?.active) || 0,
        inactive: Number(stats?.inactive) || 0,
      };
    } catch (error) {
      console.error('Error in getAccountStats:', error);
      return { total: 0, active: 0, inactive: 0 };
    }
  }

  async updateAllAccountStatuses(status: boolean): Promise<number> {
    await this.ensureSchema();
    try {
      await db.update(accounts).set({ status, updatedAt: nowIso() });
      const [row] = await db.select({ count: sql<number>`count(*)` }).from(accounts);
      return row?.count ?? 0;
    } catch (error) {
      console.error('Error in updateAllAccountStatuses:', error);
      throw new Error('Failed to update all account statuses');
    }
  }

  async updateSelectedAccountStatuses(ids: number[], status: boolean): Promise<number> {
    await this.ensureSchema();
    if (ids.length === 0) return 0;
    try {
      const result = await db
        .update(accounts)
        .set({ status, updatedAt: nowIso() })
        .where(inArray(accounts.id, ids));
      return (result as any).rowsAffected ?? ids.length;
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
        .values({ ...insertAccLog, lv: Number(insertAccLog.lv ?? 0), updatedAt: nowIso() })
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
        .set({ status, updatedAt: nowIso() })
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
      const result = await db.delete(accLogs).where(eq(accLogs.id, id));
      return ((result as any).rowsAffected ?? 0) > 0;
    } catch (error) {
      console.error('Error in deleteAccLog:', error);
      throw new Error('Failed to delete acc log from database');
    }
  }

  async deleteMultipleAccLogs(ids: number[]): Promise<number> {
    await this.ensureSchema();
    if (ids.length === 0) return 0;
    try {
      const result = await db.delete(accLogs).where(inArray(accLogs.id, ids));
      return (result as any).rowsAffected ?? 0;
    } catch (error) {
      console.error('Error in deleteMultipleAccLogs:', error);
      throw new Error('Failed to delete multiple acc logs from database');
    }
  }

  async deleteAllAccLogs(): Promise<number> {
    await this.ensureSchema();
    try {
      const result = await db.delete(accLogs);
      return (result as any).rowsAffected ?? 0;
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
          active: sql<number>`sum(case when status = 1 then 1 else 0 end)`,
          inactive: sql<number>`sum(case when status = 0 then 1 else 0 end)`
        })
        .from(accLogs);
      return {
        total: Number(stats?.total) || 0,
        active: Number(stats?.active) || 0,
        inactive: Number(stats?.inactive) || 0,
      };
    } catch (error) {
      console.error('Error in getAccLogStats:', error);
      return { total: 0, active: 0, inactive: 0 };
    }
  }

  async updateAllAccLogStatuses(status: boolean): Promise<number> {
    await this.ensureSchema();
    try {
      await db.update(accLogs).set({ status, updatedAt: nowIso() });
      const [row] = await db.select({ count: sql<number>`count(*)` }).from(accLogs);
      return row?.count ?? 0;
    } catch (error) {
      console.error('Error in updateAllAccLogStatuses:', error);
      throw new Error('Failed to update all acc log statuses');
    }
  }

  async updateSelectedAccLogStatuses(ids: number[], status: boolean): Promise<number> {
    await this.ensureSchema();
    if (ids.length === 0) return 0;
    try {
      const result = await db
        .update(accLogs)
        .set({ status, updatedAt: nowIso() })
        .where(inArray(accLogs.id, ids));
      return (result as any).rowsAffected ?? ids.length;
    } catch (error) {
      console.error('Error in updateSelectedAccLogStatuses:', error);
      throw new Error('Failed to update selected acc log statuses');
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.ensureSchema();
    try {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user;
    } catch (error) {
      console.error('Error in getUserByUsername:', error);
      throw new Error('Failed to fetch user from database');
    }
  }

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
      const championsValue = typeof insertCloneReg.champions === 'string'
        ? insertCloneReg.champions
        : JSON.stringify(insertCloneReg.champions ?? []);
      const skinsValue = typeof insertCloneReg.skins === 'string'
        ? insertCloneReg.skins
        : JSON.stringify(insertCloneReg.skins ?? []);
      const [row] = await db.insert(cloneRegs).values({
        username: insertCloneReg.username,
        password: insertCloneReg.password,
        champion: insertCloneReg.champion ?? null,
        champions: championsValue,
        skins: skinsValue,
        updatedAt: nowIso(),
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
      const patch: Record<string, unknown> = { updatedAt: nowIso() };
      if (updates.username !== undefined) patch.username = updates.username;
      if (updates.password !== undefined) patch.password = updates.password;
      if (Object.prototype.hasOwnProperty.call(updates, 'champion')) patch.champion = updates.champion ?? null;
      if (updates.champions !== undefined) {
        patch.champions = typeof updates.champions === 'string' ? updates.champions : JSON.stringify(updates.champions);
      }
      if (updates.skins !== undefined) {
        patch.skins = typeof updates.skins === 'string' ? updates.skins : JSON.stringify(updates.skins);
      }
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
      return ((result as any).rowsAffected ?? 0) > 0;
    } catch (error) {
      console.error('Error in deleteCloneReg:', error);
      throw new Error('Failed to delete clonereg from database');
    }
  }

  async createLiveSession(session: InsertLiveSession): Promise<LiveSession> {
    await this.ensureSchema();
    try {
      const [liveSession] = await db
        .insert(liveSessions)
        .values({
          sessionName: session.sessionName,
          pricePerAccount: session.pricePerAccount,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        })
        .returning();
      return liveSession;
    } catch (error) {
      console.error('Error in createLiveSession:', error);
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
      return await db.select().from(liveSessions).orderBy(desc(liveSessions.createdAt));
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
        .values({ ...record, createdAt: nowIso() })
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
          date: sql<string>`date(${revenueRecords.createdAt})`,
          revenue: sql<number>`sum(${revenueRecords.revenue})`,
          accountCount: sql<number>`count(*)`,
        })
        .from(revenueRecords)
        .where(
          and(
            gte(revenueRecords.createdAt, startDate.toISOString()),
            lte(revenueRecords.createdAt, endDate.toISOString())
          )
        )
        .groupBy(sql`date(${revenueRecords.createdAt})`)
        .orderBy(sql`date(${revenueRecords.createdAt})`);
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
          totalRevenue: sql<number>`coalesce(sum(${revenueRecords.revenue}), 0)`,
          accountCount: sql<number>`count(*)`,
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
  console.warn('Using in-memory storage. Set USE_DATABASE_STORAGE=true to enable Turso-backed storage.');
  storageInstance = new MemoryStorage();
}

export const storage = storageInstance;
