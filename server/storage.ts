import { accounts, users, type Account, type InsertAccount, type User } from "@shared/schema";
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
  getUserByUsername(username: string): Promise<User | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getAllAccounts(): Promise<Account[]> {
    try {
      const result = await db.select().from(accounts);
      return result;
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
        .set({ status })
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