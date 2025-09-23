import { accounts, accLogs, users, type Account, type InsertAccount, type User, type AccLog, type InsertAccLog } from "@shared/schema";
import { db } from "./db";
import { randomUUID } from "crypto";
import { eq, sql, inArray } from "drizzle-orm";

interface IStorage {
  getAllAccounts(): Promise<Account[]>;
  createAccount(insertAccount: InsertAccount): Promise<Account>;
  updateAccountStatus(id: number, status: boolean): Promise<Account | undefined>;
  deleteAccount(id: number): Promise<boolean>;
  deleteMultipleAccounts(ids: number[]): Promise<number>;
  deleteAllAccounts(): Promise<number>;
  getAccountStats(): Promise<{ total: number; active: number; inactive: number }>;
  updateAllAccountStatuses(status: boolean): Promise<number>;

  getAllAccLogs(): Promise<AccLog[]>;
  createAccLog(insertAccLog: InsertAccLog): Promise<AccLog>;
  updateAccLogStatus(id: number, status: boolean): Promise<AccLog | undefined>;
  deleteAccLog(id: number): Promise<boolean>;
  deleteMultipleAccLogs(ids: number[]): Promise<number>;
  deleteAllAccLogs(): Promise<number>;
  getAccLogStats(): Promise<{ total: number; active: number; inactive: number }>;
  updateAllAccLogStatuses(status: boolean): Promise<number>;

  getUserByUsername(username: string): Promise<User | undefined>;
}

export class MemoryStorage implements IStorage {
  private accountsData: Account[] = [];
  private accLogsData: AccLog[] = [];
  private usersData: User[] = [];
  private accountIdCounter = 1;
  private accLogIdCounter = 1;

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
      status: true,
      updatedAt: new Date(),
    };
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

  async getAllAccLogs(): Promise<AccLog[]> {
    return [...this.accLogsData];
  }

  async createAccLog(insertAccLog: InsertAccLog): Promise<AccLog> {
    const log: AccLog = {
      id: this.accLogIdCounter++,
      username: insertAccLog.username,
      password: insertAccLog.password,
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

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.usersData.find((user) => user.username === username);
  }
}


export class DatabaseStorage implements IStorage {
  async getAllAccounts(): Promise<Account[]> {
    try {
      return await db.select().from(accounts);
    } catch (error) {
      console.error('Error in getAllAccounts:', error);
      throw new Error('Failed to fetch accounts from database');
    }
  }

  async createAccount(insertAccount: InsertAccount): Promise<Account> {
    try {
      const [account] = await db
        .insert(accounts)
        .values(insertAccount)
        .returning();
      return account;
    } catch (error) {
      console.error('Error in createAccount:', error);
      throw new Error('Failed to create account in database');
    }
  }

  async updateAccountStatus(id: number, status: boolean): Promise<Account | undefined> {
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

  async deleteAccount(id: number): Promise<boolean> {
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
    try {
      const result = await db.delete(accounts);
      return result.rowCount ?? 0;
    } catch (error) {
      console.error('Error in deleteAllAccounts:', error);
      throw new Error('Failed to delete all accounts from database');
    }
  }

  async getAccountStats(): Promise<{ total: number; active: number; inactive: number }> {
    try {
      const [stats] = await db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`count(*) filter (where status = true)`,
          inactive: sql<number>`count(*) filter (where status = false)`
        })
        .from(accounts);

      return stats || { total: 0, active: 0, inactive: 0 };
    } catch (error) {
      console.error('Error in getAccountStats:', error);
      return { total: 0, active: 0, inactive: 0 };
    }
  }

  async updateAllAccountStatuses(status: boolean): Promise<number> {
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

  async getAllAccLogs(): Promise<AccLog[]> {
    try {
      return await db.select().from(accLogs);
    } catch (error) {
      console.error('Error in getAllAccLogs:', error);
      throw new Error('Failed to fetch acc logs from database');
    }
  }

  async createAccLog(insertAccLog: InsertAccLog): Promise<AccLog> {
    try {
      const [log] = await db
        .insert(accLogs)
        .values(insertAccLog)
        .returning();
      return log;
    } catch (error) {
      console.error('Error in createAccLog:', error);
      throw new Error('Failed to create acc log in database');
    }
  }

  async updateAccLogStatus(id: number, status: boolean): Promise<AccLog | undefined> {
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
    try {
      const result = await db.delete(accLogs);
      return result.rowCount ?? 0;
    } catch (error) {
      console.error('Error in deleteAllAccLogs:', error);
      throw new Error('Failed to delete all acc logs from database');
    }
  }

  async getAccLogStats(): Promise<{ total: number; active: number; inactive: number }> {
    try {
      const [stats] = await db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`count(*) filter (where status = true)`,
          inactive: sql<number>`count(*) filter (where status = false)`
        })
        .from(accLogs);

      return stats || { total: 0, active: 0, inactive: 0 };
    } catch (error) {
      console.error('Error in getAccLogStats:', error);
      return { total: 0, active: 0, inactive: 0 };
    }
  }

  async updateAllAccLogStatuses(status: boolean): Promise<number> {
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

  async getUserByUsername(username: string): Promise<User | undefined> {
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


