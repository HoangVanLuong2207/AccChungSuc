import { Store, SessionData } from "express-session";
import { db } from "./db";
import { sessions } from "@shared/schema";
import { eq, lt, sql } from "drizzle-orm";

/**
 * Custom session store for Turso/libSQL database.
 * Sessions are stored in the 'sessions' table with columns:
 * - sid: session ID (primary key)
 * - sess: JSON stringified session data
 * - expire: Unix timestamp when session expires
 */
export class TursoSessionStore extends Store {
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;
    private ready: Promise<void>;

    constructor() {
        super();
        // Initialize sessions table
        this.ready = this.ensureTable();
        // Cleanup expired sessions every 15 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanup().catch(console.error);
        }, 15 * 60 * 1000);
    }

    private async ensureTable(): Promise<void> {
        try {
            await db.run(sql`
        CREATE TABLE IF NOT EXISTS sessions (
          sid TEXT PRIMARY KEY,
          sess TEXT NOT NULL,
          expire INTEGER NOT NULL
        )
      `);
            // Create index for faster cleanup queries
            await db.run(sql`
        CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions(expire)
      `);
            console.log('✅ Sessions table created/verified');
        } catch (error) {
            console.error('Error creating sessions table:', error);
        }
    }

    private async cleanup(): Promise<void> {
        try {
            const now = Math.floor(Date.now() / 1000);
            await db.delete(sessions).where(lt(sessions.expire, now));
        } catch (error) {
            console.error('Error cleaning up expired sessions:', error);
        }
    }

    async get(
        sid: string,
        callback: (err: any, session?: SessionData | null) => void
    ): Promise<void> {
        try {
            await this.ready;
            const now = Math.floor(Date.now() / 1000);
            const [row] = await db
                .select()
                .from(sessions)
                .where(eq(sessions.sid, sid));

            if (!row) {
                return callback(null, null);
            }

            // Check if expired
            if (row.expire < now) {
                await this.destroy(sid, () => { });
                return callback(null, null);
            }

            const sess = JSON.parse(row.sess);
            callback(null, sess);
        } catch (error) {
            console.error('Session get error:', error);
            callback(error);
        }
    }

    async set(
        sid: string,
        session: SessionData,
        callback?: (err?: any) => void
    ): Promise<void> {
        try {
            await this.ready;
            const maxAge = session.cookie?.maxAge ?? 86400000; // Default 1 day
            const expire = Math.floor((Date.now() + maxAge) / 1000);
            const sess = JSON.stringify(session);

            // Upsert: insert or replace
            await db.run(sql`
        INSERT OR REPLACE INTO sessions (sid, sess, expire)
        VALUES (${sid}, ${sess}, ${expire})
      `);

            callback?.();
        } catch (error) {
            console.error('Session set error:', error);
            callback?.(error);
        }
    }

    async destroy(sid: string, callback?: (err?: any) => void): Promise<void> {
        try {
            await this.ready;
            await db.delete(sessions).where(eq(sessions.sid, sid));
            callback?.();
        } catch (error) {
            console.error('Session destroy error:', error);
            callback?.(error);
        }
    }

    async touch(
        sid: string,
        session: SessionData,
        callback?: (err?: any) => void
    ): Promise<void> {
        try {
            await this.ready;
            const maxAge = session.cookie?.maxAge ?? 86400000;
            const expire = Math.floor((Date.now() + maxAge) / 1000);

            await db
                .update(sessions)
                .set({ expire })
                .where(eq(sessions.sid, sid));

            callback?.();
        } catch (error) {
            console.error('Session touch error:', error);
            callback?.(error);
        }
    }

    async clear(callback?: (err?: any) => void): Promise<void> {
        try {
            await this.ready;
            await db.delete(sessions);
            callback?.();
        } catch (error) {
            console.error('Session clear error:', error);
            callback?.(error);
        }
    }

    async length(callback: (err: any, length?: number) => void): Promise<void> {
        try {
            await this.ready;
            const now = Math.floor(Date.now() / 1000);
            const [row] = await db
                .select({ count: sql<number>`count(*)` })
                .from(sessions)
                .where(sql`expire >= ${now}`);
            callback(null, row?.count ?? 0);
        } catch (error) {
            console.error('Session length error:', error);
            callback(error);
        }
    }

    close(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}
