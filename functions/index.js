const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { z } = require("zod");

const { db, pool } = require("./db");
const schema = require("./shared/schema");
const { eq, sql, inArray, desc, and, gte, lte } = require("drizzle-orm");

// Set global options for Cloud Functions
setGlobalOptions({ maxInstances: 10, region: "asia-southeast1" });

const app = express();

// CORS configuration
app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session configuration (simplified for Cloud Functions - stateless)
app.use(session({
    secret: process.env.SESSION_SECRET || 'firebase-cloud-functions-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));

// Auth middleware
const isAuthenticated = (req, res, next) => {
    // For Cloud Functions, we'll use a simpler auth check
    // In production, consider using Firebase Auth
    if (req.session && req.session.userId) {
        return next();
    }
    res.status(401).json({ message: 'Unauthorized' });
};

// ===== AUTH ROUTES =====
app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        logger.info("Login attempt", { username });

        if (!username || !password) {
            return res.status(400).json({ message: "Username and password are required" });
        }

        const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));

        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        req.session.userId = user.id;
        res.json({ message: "Login successful", user: { id: user.id, username: user.username } });
    } catch (error) {
        logger.error("Login error", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: "Logout failed" });
        }
        res.json({ message: "Logout successful" });
    });
});

app.get("/api/user", (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ id: req.session.userId });
    } else {
        res.status(401).json({ message: "Not authenticated" });
    }
});

// ===== ACCOUNTS ROUTES =====
app.get("/api/accounts", async (req, res) => {
    try {
        const accounts = await db.select().from(schema.accounts);
        res.json(accounts);
    } catch (error) {
        logger.error("Get accounts error", error);
        res.status(500).json({ message: "Failed to fetch accounts" });
    }
});

app.get("/api/accounts/stats", async (req, res) => {
    try {
        const [stats] = await db
            .select({
                total: sql`count(*)`,
                active: sql`count(*) filter (where status = true)`,
                inactive: sql`count(*) filter (where status = false)`
            })
            .from(schema.accounts);

        res.json({
            total: Number(stats?.total) || 0,
            active: Number(stats?.active) || 0,
            inactive: Number(stats?.inactive) || 0,
        });
    } catch (error) {
        logger.error("Get account stats error", error);
        res.status(500).json({ message: "Failed to fetch account stats" });
    }
});

app.post("/api/accounts", async (req, res) => {
    try {
        const parsed = schema.insertAccountSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
        }

        const [account] = await db
            .insert(schema.accounts)
            .values({ ...parsed.data, lv: Number(parsed.data.lv ?? 0) })
            .returning();

        res.status(201).json(account);
    } catch (error) {
        logger.error("Create account error", error);
        const message = error.message || '';
        if (message.includes('unique') || message.includes('duplicate')) {
            return res.status(409).json({ message: "Account already exists" });
        }
        res.status(500).json({ message: "Failed to create account" });
    }
});

app.patch("/api/accounts/:id/status", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { status } = req.body;

        const [account] = await db
            .update(schema.accounts)
            .set({ status, updatedAt: new Date() })
            .where(eq(schema.accounts.id, id))
            .returning();

        if (!account) {
            return res.status(404).json({ message: "Account not found" });
        }

        res.json(account);
    } catch (error) {
        logger.error("Update account status error", error);
        res.status(500).json({ message: "Failed to update account status" });
    }
});

app.patch("/api/accounts/:id/tag", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { tag } = req.body;

        const [account] = await db
            .update(schema.accounts)
            .set({ tag, updatedAt: new Date() })
            .where(eq(schema.accounts.id, id))
            .returning();

        if (!account) {
            return res.status(404).json({ message: "Account not found" });
        }

        res.json(account);
    } catch (error) {
        logger.error("Update account tag error", error);
        res.status(500).json({ message: "Failed to update account tag" });
    }
});

app.patch("/api/accounts/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const parsed = schema.updateAccountDetailsSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
        }

        const patch = { updatedAt: new Date(), ...parsed.data };
        if (parsed.data.lv !== undefined) patch.lv = Number(parsed.data.lv);

        const [account] = await db
            .update(schema.accounts)
            .set(patch)
            .where(eq(schema.accounts.id, id))
            .returning();

        if (!account) {
            return res.status(404).json({ message: "Account not found" });
        }

        res.json(account);
    } catch (error) {
        logger.error("Update account details error", error);
        res.status(500).json({ message: "Failed to update account details" });
    }
});

app.delete("/api/accounts/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const result = await db.delete(schema.accounts).where(eq(schema.accounts.id, id));

        if ((result.rowCount ?? 0) === 0) {
            return res.status(404).json({ message: "Account not found" });
        }

        res.json({ message: "Account deleted successfully" });
    } catch (error) {
        logger.error("Delete account error", error);
        res.status(500).json({ message: "Failed to delete account" });
    }
});

app.post("/api/accounts/delete-multiple", async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: "Invalid ids array" });
        }

        const result = await db.delete(schema.accounts).where(inArray(schema.accounts.id, ids));
        res.json({ deleted: result.rowCount ?? 0 });
    } catch (error) {
        logger.error("Delete multiple accounts error", error);
        res.status(500).json({ message: "Failed to delete accounts" });
    }
});

app.delete("/api/accounts", async (req, res) => {
    try {
        const result = await db.delete(schema.accounts);
        res.json({ deleted: result.rowCount ?? 0 });
    } catch (error) {
        logger.error("Delete all accounts error", error);
        res.status(500).json({ message: "Failed to delete all accounts" });
    }
});

app.post("/api/accounts/update-status", async (req, res) => {
    try {
        const { status, ids } = req.body;

        if (ids && Array.isArray(ids) && ids.length > 0) {
            const result = await db
                .update(schema.accounts)
                .set({ status, updatedAt: new Date() })
                .where(inArray(schema.accounts.id, ids));
            return res.json({ updated: result.rowCount ?? 0 });
        }

        await db.update(schema.accounts).set({ status, updatedAt: new Date() });
        const [row] = await db.select({ count: sql`count(*)` }).from(schema.accounts).where(eq(schema.accounts.status, status));
        res.json({ updated: row?.count ?? 0 });
    } catch (error) {
        logger.error("Update accounts status error", error);
        res.status(500).json({ message: "Failed to update account statuses" });
    }
});

app.post("/api/accounts/update-tags", async (req, res) => {
    try {
        const { tag, ids } = req.body;

        if (ids && Array.isArray(ids) && ids.length > 0) {
            const result = await db
                .update(schema.accounts)
                .set({ tag, updatedAt: new Date() })
                .where(inArray(schema.accounts.id, ids));
            return res.json({ updated: result.rowCount ?? 0 });
        }

        const result = await db.update(schema.accounts).set({ tag, updatedAt: new Date() });
        res.json({ updated: result.rowCount ?? 0 });
    } catch (error) {
        logger.error("Update accounts tags error", error);
        res.status(500).json({ message: "Failed to update account tags" });
    }
});

// ===== ACCLOGS ROUTES =====
app.get("/api/acclogs", async (req, res) => {
    try {
        const logs = await db.select().from(schema.accLogs);
        res.json(logs);
    } catch (error) {
        logger.error("Get acc logs error", error);
        res.status(500).json({ message: "Failed to fetch acc logs" });
    }
});

app.get("/api/acclogs/stats", async (req, res) => {
    try {
        const [stats] = await db
            .select({
                total: sql`count(*)`,
                active: sql`count(*) filter (where status = true)`,
                inactive: sql`count(*) filter (where status = false)`
            })
            .from(schema.accLogs);

        res.json({
            total: Number(stats?.total) || 0,
            active: Number(stats?.active) || 0,
            inactive: Number(stats?.inactive) || 0,
        });
    } catch (error) {
        logger.error("Get acc log stats error", error);
        res.status(500).json({ message: "Failed to fetch acc log stats" });
    }
});

app.post("/api/acclogs", async (req, res) => {
    try {
        const parsed = schema.insertAccLogSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
        }

        const [log] = await db
            .insert(schema.accLogs)
            .values({ ...parsed.data, lv: Number(parsed.data.lv ?? 0) })
            .returning();

        res.status(201).json(log);
    } catch (error) {
        logger.error("Create acc log error", error);
        res.status(500).json({ message: "Failed to create acc log" });
    }
});

app.patch("/api/acclogs/:id/status", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { status } = req.body;

        const [log] = await db
            .update(schema.accLogs)
            .set({ status, updatedAt: new Date() })
            .where(eq(schema.accLogs.id, id))
            .returning();

        if (!log) {
            return res.status(404).json({ message: "Acc log not found" });
        }

        res.json(log);
    } catch (error) {
        logger.error("Update acc log status error", error);
        res.status(500).json({ message: "Failed to update acc log status" });
    }
});

app.delete("/api/acclogs/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const result = await db.delete(schema.accLogs).where(eq(schema.accLogs.id, id));

        if ((result.rowCount ?? 0) === 0) {
            return res.status(404).json({ message: "Acc log not found" });
        }

        res.json({ message: "Acc log deleted successfully" });
    } catch (error) {
        logger.error("Delete acc log error", error);
        res.status(500).json({ message: "Failed to delete acc log" });
    }
});

app.post("/api/acclogs/delete-multiple", async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: "Invalid ids array" });
        }

        const result = await db.delete(schema.accLogs).where(inArray(schema.accLogs.id, ids));
        res.json({ deleted: result.rowCount ?? 0 });
    } catch (error) {
        logger.error("Delete multiple acc logs error", error);
        res.status(500).json({ message: "Failed to delete acc logs" });
    }
});

app.delete("/api/acclogs", async (req, res) => {
    try {
        const result = await db.delete(schema.accLogs);
        res.json({ deleted: result.rowCount ?? 0 });
    } catch (error) {
        logger.error("Delete all acc logs error", error);
        res.status(500).json({ message: "Failed to delete all acc logs" });
    }
});

app.post("/api/acclogs/update-status", async (req, res) => {
    try {
        const { status, ids } = req.body;

        if (ids && Array.isArray(ids) && ids.length > 0) {
            const result = await db
                .update(schema.accLogs)
                .set({ status, updatedAt: new Date() })
                .where(inArray(schema.accLogs.id, ids));
            return res.json({ updated: result.rowCount ?? 0 });
        }

        await db.update(schema.accLogs).set({ status, updatedAt: new Date() });
        const [row] = await db.select({ count: sql`count(*)` }).from(schema.accLogs).where(eq(schema.accLogs.status, status));
        res.json({ updated: row?.count ?? 0 });
    } catch (error) {
        logger.error("Update acc logs status error", error);
        res.status(500).json({ message: "Failed to update acc log statuses" });
    }
});

// ===== CLONEREG ROUTES =====
app.get("/api/clonereg", async (req, res) => {
    try {
        const records = await db.select().from(schema.cloneRegs);
        res.json(records);
    } catch (error) {
        logger.error("Get clone regs error", error);
        res.status(500).json({ message: "Failed to fetch clone regs" });
    }
});

app.post("/api/clonereg", async (req, res) => {
    try {
        const parsed = schema.insertCloneRegSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
        }

        const [record] = await db
            .insert(schema.cloneRegs)
            .values(parsed.data)
            .returning();

        res.status(201).json(record);
    } catch (error) {
        logger.error("Create clone reg error", error);
        res.status(500).json({ message: "Failed to create clone reg" });
    }
});

app.patch("/api/clonereg/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const parsed = schema.updateCloneRegDetailsSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
        }

        const [record] = await db
            .update(schema.cloneRegs)
            .set({ ...parsed.data, updatedAt: new Date() })
            .where(eq(schema.cloneRegs.id, id))
            .returning();

        if (!record) {
            return res.status(404).json({ message: "Clone reg not found" });
        }

        res.json(record);
    } catch (error) {
        logger.error("Update clone reg error", error);
        res.status(500).json({ message: "Failed to update clone reg" });
    }
});

app.delete("/api/clonereg/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const result = await db.delete(schema.cloneRegs).where(eq(schema.cloneRegs.id, id));

        if ((result.rowCount ?? 0) === 0) {
            return res.status(404).json({ message: "Clone reg not found" });
        }

        res.json({ message: "Clone reg deleted successfully" });
    } catch (error) {
        logger.error("Delete clone reg error", error);
        res.status(500).json({ message: "Failed to delete clone reg" });
    }
});

// ===== LIVE SESSIONS & REVENUE ROUTES =====
app.get("/api/live-sessions", async (req, res) => {
    try {
        const sessions = await db.select().from(schema.liveSessions).orderBy(desc(schema.liveSessions.createdAt));
        res.json(sessions);
    } catch (error) {
        logger.error("Get live sessions error", error);
        res.status(500).json({ message: "Failed to fetch live sessions" });
    }
});

app.get("/api/live-sessions/active", async (req, res) => {
    try {
        const [session] = await db
            .select()
            .from(schema.liveSessions)
            .orderBy(desc(schema.liveSessions.createdAt))
            .limit(1);

        res.json(session || null);
    } catch (error) {
        logger.error("Get active live session error", error);
        res.status(500).json({ message: "Failed to fetch active live session" });
    }
});

app.post("/api/live-sessions", async (req, res) => {
    try {
        const parsed = schema.insertLiveSessionSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
        }

        const [session] = await db
            .insert(schema.liveSessions)
            .values(parsed.data)
            .returning();

        res.status(201).json(session);
    } catch (error) {
        logger.error("Create live session error", error);
        res.status(500).json({ message: "Failed to create live session" });
    }
});

app.post("/api/revenue-records", async (req, res) => {
    try {
        const parsed = schema.insertRevenueRecordSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
        }

        const [record] = await db
            .insert(schema.revenueRecords)
            .values(parsed.data)
            .returning();

        res.status(201).json(record);
    } catch (error) {
        logger.error("Create revenue record error", error);
        res.status(500).json({ message: "Failed to create revenue record" });
    }
});

app.get("/api/revenue-stats", async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        const result = await db
            .select({
                date: sql`date(created_at)`,
                revenue: sql`sum(revenue)`,
                accountCount: sql`count(*)`
            })
            .from(schema.revenueRecords)
            .where(and(gte(schema.revenueRecords.createdAt, start), lte(schema.revenueRecords.createdAt, end)))
            .groupBy(sql`date(created_at)`)
            .orderBy(sql`date(created_at)`);

        res.json(result.map(row => ({
            date: row.date,
            revenue: Number(row.revenue) || 0,
            accountCount: Number(row.accountCount) || 0
        })));
    } catch (error) {
        logger.error("Get revenue stats error", error);
        res.status(500).json({ message: "Failed to fetch revenue stats" });
    }
});

app.get("/api/sessions/:sessionId/revenue", async (req, res) => {
    try {
        const sessionId = parseInt(req.params.sessionId, 10);

        const [result] = await db
            .select({
                totalRevenue: sql`COALESCE(sum(revenue), 0)`,
                accountCount: sql`count(*)`
            })
            .from(schema.revenueRecords)
            .where(eq(schema.revenueRecords.sessionId, sessionId));

        res.json({
            totalRevenue: Number(result?.totalRevenue) || 0,
            accountCount: Number(result?.accountCount) || 0
        });
    } catch (error) {
        logger.error("Get session revenue error", error);
        res.status(500).json({ message: "Failed to fetch session revenue" });
    }
});

// Health check
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
    logger.error("Unhandled error", err);
    res.status(500).json({ message: "Internal server error" });
});

// Export the Express app as a Firebase Cloud Function
exports.api = onRequest(app);
