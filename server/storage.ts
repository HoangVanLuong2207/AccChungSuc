import { accounts, accLogs, users, type Account, type InsertAccount, type User, type AccLog, type InsertAccLog } from "@shared/schema";
import { db } from "./db";
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

export const storage = new DatabaseStorage();
