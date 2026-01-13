import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import { insertAccountSchema, updateAccountSchema, updateAccountTagSchema, insertUserSchema, insertAccLogSchema, updateAccLogSchema, insertLiveSessionSchema, updateAccountDetailsSchema, insertCloneRegSchema, updateCloneRegDetailsSchema } from "@shared/schema";
import { isAuthenticated } from "./auth";
import { authLimiter, ALLOWED_ORIGINS } from "./index";
import bcrypt from "bcrypt";
import multer from "multer";
import { z } from "zod";

// Account lockout tracking
const loginAttempts = new Map<string, { count: number; lastAttempt: Date }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const upload = multer({ storage: multer.memoryStorage() });

function normalizeLevelField<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => normalizeLevelField(item)) as unknown as T;
  }
  if (input && typeof input === "object") {
    const source = input as Record<string, unknown>;
    const hasLv = Object.prototype.hasOwnProperty.call(source, "lv");
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (key === "LV") {
        if (!hasLv) {
          normalized.lv = normalizeLevelField(value);
        }
        continue;
      }
      normalized[key] = normalizeLevelField(value);
    }
    return normalized as unknown as T;
  }
  return input;
}

function extractRecordsFromFile(fileContent: string) {
  const arrayMatch = fileContent.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    throw new Error('ARRAY_NOT_FOUND');
  }

  const jsonContent = arrayMatch[0]
    .replace(/(\w+):/g, '"$1":')
    .replace(/'/g, '"');

  return JSON.parse(jsonContent);
}

async function processImportRecords<T, I extends { username: string; password: string }>(
  records: unknown[],
  parseRecord: (record: unknown) => I,
  createRecord: (data: I) => Promise<T>,
  options?: { existingUsernames?: Set<string>; normalizeUsername?: (u: string) => string }
) {
  const createdRecords: T[] = [];
  const errors: Array<{ account: unknown; error: string }> = [];
  const seenUsernames = new Set<string>();
  const existing = options?.existingUsernames ?? new Set<string>();
  const normalize = options?.normalizeUsername ?? ((u: string) => u);

  for (const record of records) {
    try {
      const validated = parseRecord(record);
      const normalizedUsername = normalize(validated.username);

      // Skip if username already seen in this file
      if (seenUsernames.has(normalizedUsername)) {
        errors.push({ account: record, error: 'Tên tài khoản trùng lặp trong file' });
        continue;
      }
      // Skip if username already exists in database
      if (existing.has(normalizedUsername)) {
        errors.push({ account: record, error: 'Tên tài khoản đã tồn tại trong database' });
        continue;
      }
      seenUsernames.add(normalizedUsername);

      const created = await createRecord({ ...(validated as any), username: normalizedUsername });
      createdRecords.push(created);
      // Mark as existing to prevent duplicates within the same import session
      existing.add(normalizedUsername);
    } catch (error) {
      let errorMessage = 'Lỗi không xác định';
      if (error instanceof Error) {
        if (error.message.includes('unique')) {
          errorMessage = 'Tên tài khoản đã tồn tại trong database';
        } else {
          errorMessage = error.message;
        }
      }
      errors.push({ account: record, error: errorMessage });
    }
  }

  return { createdRecords, errors };
}

// Global Socket.IO instance - will be initialized in registerRoutes
let io: SocketIOServer | null = null;

export function getIO(): SocketIOServer | null {
  return io;
}

// Helper function to emit account status updates
function emitAccountStatusUpdate(accountIds: number[], status: boolean, entityType: "accounts" | "acclogs" = "accounts") {
  if (!io) {
    console.warn(`[Socket.IO] Cannot emit account-status-updated: Socket.IO not initialized yet`);
    return;
  }

  const connectedClients = io.sockets.sockets.size;
  console.log(`[Socket.IO] Emitting account-status-updated: ${entityType}, ids: ${accountIds.join(", ")}, status: ${status}, connected clients: ${connectedClients}`);

  io.emit("account-status-updated", {
    entityType,
    accountIds,
    status,
    timestamp: new Date().toISOString(),
  });

  console.log(`[Socket.IO] Successfully emitted account-status-updated event`);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint - for keeping Render alive
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      message: "Server is running"
    });
  });

  // Simple ping endpoint for cron jobs
  app.get("/ping", (_req, res) => {
    res.send("pong");
  });

  // Auth routes with rate limiting and account lockout
  app.post("/api/login", authLimiter, async (req, res) => {
    try {
      const { username, password } = insertUserSchema.parse(req.body);

      // Check for account lockout
      const attemptKey = username.toLowerCase();
      const attempts = loginAttempts.get(attemptKey);
      if (attempts) {
        const timeSinceLast = Date.now() - attempts.lastAttempt.getTime();
        if (attempts.count >= MAX_LOGIN_ATTEMPTS && timeSinceLast < LOCKOUT_DURATION_MS) {
          const remainingMinutes = Math.ceil((LOCKOUT_DURATION_MS - timeSinceLast) / 60000);
          return res.status(429).json({
            message: `Tài khoản bị khóa tạm thời. Vui lòng thử lại sau ${remainingMinutes} phút`
          });
        }
        // Reset if lockout period has passed
        if (timeSinceLast >= LOCKOUT_DURATION_MS) {
          loginAttempts.delete(attemptKey);
        }
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        // Track failed attempt
        const current = loginAttempts.get(attemptKey) || { count: 0, lastAttempt: new Date() };
        loginAttempts.set(attemptKey, { count: current.count + 1, lastAttempt: new Date() });
        return res.status(401).json({ message: "Tên đăng nhập hoặc mật khẩu không đúng" });
      }

      const isPasswordMatch = await bcrypt.compare(password, user.password);
      if (!isPasswordMatch) {
        // Track failed attempt
        const current = loginAttempts.get(attemptKey) || { count: 0, lastAttempt: new Date() };
        loginAttempts.set(attemptKey, { count: current.count + 1, lastAttempt: new Date() });
        return res.status(401).json({ message: "Tên đăng nhập hoặc mật khẩu không đúng" });
      }

      // Clear failed attempts on successful login
      loginAttempts.delete(attemptKey);

      req.session.userId = user.id;
      res.json({ id: user.id, username: user.username });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: "Lỗi máy chủ nội bộ" });
    }
  });

  // Update all account statuses
  app.patch("/api/accounts/status-all", isAuthenticated, async (req, res) => {
    try {
      const body = z.object({ status: z.boolean() }).parse(req.body);

      // Get current accounts to check previous status
      const allAccounts = await storage.getAllAccounts();

      const updatedCount = await storage.updateAllAccountStatuses(body.status);

      // Emit real-time update
      const allAccountIds = allAccounts.map(acc => acc.id);
      emitAccountStatusUpdate(allAccountIds, body.status, "accounts");

      // Track revenue when accounts change from ON to OFF (accounts đã được sử dụng xong)
      if (body.status === false) {
        try {
          const activeSession = await storage.getActiveLiveSession();
          if (activeSession) {
            // Get accounts that were ON before update (they will be turned OFF)
            const accountsThatChangedFromOnToOff = allAccounts.filter(
              (acc) => acc.status === true // Was ON before update
            );

            console.log(`[Revenue] Updating ${accountsThatChangedFromOnToOff.length} accounts from ON to OFF, session ${activeSession.id}, price ${activeSession.pricePerAccount}`);

            for (const account of accountsThatChangedFromOnToOff) {
              const revenueRecord = await storage.createRevenueRecord({
                sessionId: activeSession.id,
                accountId: account.id,
                pricePerAccount: activeSession.pricePerAccount,
                revenue: activeSession.pricePerAccount,
              });
              console.log(`[Revenue] Created revenue record for account ${account.id}:`, revenueRecord);
            }
          } else {
            console.log(`[Revenue] No active session found for bulk update`);
          }
        } catch (revenueError) {
          console.error('[Revenue] Error tracking revenue:', revenueError);
          // Don't fail the request if revenue tracking fails
        }
      }

      res.json({ updated: updatedCount, status: body.status });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update all account statuses" });
      }
    }
  });
  app.patch("/api/accounts/status", isAuthenticated, async (req, res) => {
    try {
      const body = z
        .object({
          ids: z.array(z.number().int().positive()).min(1),
          status: z.boolean(),
        })
        .parse(req.body);

      // Get current accounts to check previous status
      const allAccounts = await storage.getAllAccounts();
      const accountsToUpdate = allAccounts.filter((acc) => body.ids.includes(acc.id));

      const updatedCount = await storage.updateSelectedAccountStatuses(body.ids, body.status);

      // Emit real-time update
      emitAccountStatusUpdate(body.ids, body.status, "accounts");

      // Track revenue when accounts change from ON to OFF (accounts đã được sử dụng xong)
      if (body.status === false) {
        try {
          const activeSession = await storage.getActiveLiveSession();
          if (activeSession) {
            const accountsThatChangedFromOnToOff = accountsToUpdate.filter(
              (acc) => acc.status && !body.status
            );

            console.log(`[Revenue] Updating ${accountsThatChangedFromOnToOff.length} selected accounts from ON to OFF, session ${activeSession.id}, price ${activeSession.pricePerAccount}`);

            for (const account of accountsThatChangedFromOnToOff) {
              const revenueRecord = await storage.createRevenueRecord({
                sessionId: activeSession.id,
                accountId: account.id,
                pricePerAccount: activeSession.pricePerAccount,
                revenue: activeSession.pricePerAccount,
              });
              console.log(`[Revenue] Created revenue record for account ${account.id}:`, revenueRecord);
            }
          } else {
            console.log(`[Revenue] No active session found for selected update`);
          }
        } catch (revenueError) {
          console.error('[Revenue] Error tracking revenue:', revenueError);
          // Don't fail the request if revenue tracking fails
        }
      }

      res.json({ updated: updatedCount, status: body.status });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update account statuses" });
      }
    }
  });


  app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Không thể đăng xuất" });
      }
      res.clearCookie('connect.sid'); // Tên cookie mặc định của express-session
      res.status(200).json({ message: "Đăng xuất thành công" });
    });
  });

  app.get("/api/auth/status", (req, res) => {
    if (req.session.userId) {
      res.json({ loggedIn: true });
    } else {
      res.json({ loggedIn: false });
    }
  });
  // Get all accounts
  app.get("/api/accounts", isAuthenticated, async (req, res) => {
    try {
      const accounts = await storage.getAllAccounts();
      res.json(accounts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch accounts" });
    }
  });

  // Create new account
  app.post("/api/accounts", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertAccountSchema.parse(normalizeLevelField(req.body));
      const account = await storage.createAccount(validatedData);
      res.status(201).json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create account" });
      }
    }
  });

  // Update account details (username/password/lv/champion/skins)
  app.put("/api/accounts/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid account id" });
      }
      const body = updateAccountDetailsSchema.parse(normalizeLevelField(req.body));
      const updated = await storage.updateAccountDetails(id, body);
      if (!updated) {
        return res.status(404).json({ message: "Account not found" });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update account details" });
      }
    }
  });

  // CloneReg manual CRUD
  app.get("/api/cloneregs", isAuthenticated, async (req, res) => {
    try {
      const rows = await storage.getAllCloneRegs();
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch clonereg" });
    }
  });

  app.post("/api/cloneregs", isAuthenticated, async (req, res) => {
    try {
      const body = insertCloneRegSchema.parse(normalizeLevelField(req.body));
      const row = await storage.createCloneReg(body);
      res.status(201).json(row);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create clonereg" });
      }
    }
  });

  app.put("/api/cloneregs/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid id" });
      }
      const body = updateCloneRegDetailsSchema.parse(normalizeLevelField(req.body));
      const updated = await storage.updateCloneRegDetails(id, body);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update clonereg" });
      }
    }
  });

  app.delete("/api/cloneregs/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ok = await storage.deleteCloneReg(id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ message: "Deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete clonereg" });
    }
  });

  // Update account status
  app.patch("/api/accounts/:id/status", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = updateAccountSchema.parse(req.body);

      // Get current account to check previous status
      const accounts = await storage.getAllAccounts();
      const currentAccount = accounts.find((acc) => acc.id === id);

      if (!currentAccount) {
        return res.status(404).json({ message: "Account not found" });
      }

      const previousStatus = currentAccount.status;
      const account = await storage.updateAccountStatus(id, status!);

      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      // Emit real-time update
      emitAccountStatusUpdate([id], status!, "accounts");

      // Track revenue when account changes from ON to OFF (account đã được sử dụng xong)
      if (previousStatus && !status) {
        try {
          const activeSession = await storage.getActiveLiveSession();
          if (activeSession) {
            console.log(`[Revenue] Creating revenue record for account ${account.id}, session ${activeSession.id}, price ${activeSession.pricePerAccount}`);
            const revenueRecord = await storage.createRevenueRecord({
              sessionId: activeSession.id,
              accountId: account.id,
              pricePerAccount: activeSession.pricePerAccount,
              revenue: activeSession.pricePerAccount,
            });
            console.log(`[Revenue] Created revenue record:`, revenueRecord);
          } else {
            console.log(`[Revenue] No active session found for account ${account.id}`);
          }
        } catch (revenueError) {
          console.error('[Revenue] Error tracking revenue:', revenueError);
          // Don't fail the request if revenue tracking fails
        }
      }

      res.json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update account" });
      }
    }
  });
  // Update account tag
  app.patch("/api/accounts/:id/tag", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { tag } = updateAccountTagSchema.parse(req.body);
      const normalizedTag = typeof tag === 'string' && tag.length > 0 ? tag : null;
      const account = await storage.updateAccountTag(id, normalizedTag);

      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      res.json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update account tag" });
      }
    }
  });

  // Update account tags in bulk
  app.patch("/api/accounts/tag", isAuthenticated, async (req, res) => {
    try {
      const { ids, tag } = z.object({
        ids: z.array(z.number().int().positive()).min(1).optional(),
        tag: updateAccountTagSchema.shape.tag,
      }).parse(req.body);

      const normalizedTag = typeof tag === 'string' && tag.length > 0 ? tag : null;
      const updatedCount = await storage.updateMultipleAccountTags(normalizedTag, ids);

      res.json({ updated: updatedCount, tag: normalizedTag });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update account tags" });
      }
    }
  });



  // Delete account
  app.delete("/api/accounts/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteAccount(id);

      if (!success) {
        return res.status(404).json({ message: "Account not found" });
      }

      res.json({ message: "Account deleted." });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // Delete multiple or all accounts
  app.delete("/api/accounts", isAuthenticated, async (req, res) => {
    try {
      const { ids } = req.body;
      if (ids && Array.isArray(ids) && ids.length > 0) {
        // Delete multiple accounts
        const deletedCount = await storage.deleteMultipleAccounts(ids);
        res.json({ message: `Đã xóa ${deletedCount} tài khoản.` });
      } else {
        // Delete all accounts
        const deletedCount = await storage.deleteAllAccounts();
        res.json({ message: `Đã xóa tất cả ${deletedCount} tài khoản.` });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete accounts" });
    }
  });

  // Import accounts from file
  app.post("/api/accounts/import", isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Không có file được cung cấp" });
      }

      if (req.file.size > 1024 * 1024) {
        return res.status(400).json({ message: "File quá lớn. Giới hạn 1MB" });
      }

      const fileContent = req.file.buffer.toString('utf-8');

      let records: unknown[];
      try {
        const parsed = extractRecordsFromFile(fileContent);
        if (!Array.isArray(parsed)) {
          return res.status(400).json({ message: "File phải chứa một mảng tài khoản" });
        }
        records = parsed;
      } catch (parseError) {
        const message =
          parseError instanceof Error && parseError.message === 'ARRAY_NOT_FOUND'
            ? 'File phải chứa một mảng JSON. Format: [{"username": "user", "password": "pass"}]'
            : 'Format file không hợp lệ. Sử dụng format JSON: [{"username": "user", "password": "pass"}]';
        return res.status(400).json({ message });
      }

      if (records.length > 1000) {
        return res.status(400).json({ message: "Quá nhiều tài khoản. Giới hạn 1000 tài khoản mỗi lần import" });
      }

      // Prefetch existing usernames to avoid repeated duplicate errors
      const existingAccounts = await storage.getAllAccounts();
      const existingSet = new Set(existingAccounts.map((a) => (a.username ?? '').trim()));

      const { createdRecords, errors } = await processImportRecords(
        records,
        (record) => insertAccountSchema.parse(normalizeLevelField(record)),
        (data) => storage.createAccount(data),
        {
          existingUsernames: existingSet,
          normalizeUsername: (u) => (u ?? '').trim(),
        }
      );

      res.json({
        imported: createdRecords.length,
        errors: errors.length,
        accounts: createdRecords,
        errorDetails: errors,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to import accounts" });
    }
  });


  // Import accounts from normalized payload
  app.post("/api/accounts/import-batch", isAuthenticated, async (req, res) => {
    try {
      const { records, sourceName } = z.object({
        records: z.array(insertAccountSchema),
        sourceName: z.string().min(1).max(160).optional(),
      }).parse(normalizeLevelField(req.body));

      if (records.length === 0) {
        return res.status(400).json({ message: "Khong co ban ghi de import" });
      }

      // Prefetch existing usernames to avoid repeated duplicate errors
      const existingAccounts = await storage.getAllAccounts();
      const existingSet = new Set(existingAccounts.map((a) => (a.username ?? '').trim()));

      // Process in chunks when there are more than 1000 records
      if (records.length > 1000) {
        const MAX_BATCH_SIZE = 1000;
        const allCreated: unknown[] = [];
        const allErrors: Array<{ account: unknown; error: string }> = [];

        for (let i = 0; i < records.length; i += MAX_BATCH_SIZE) {
          const batch = records.slice(i, i + MAX_BATCH_SIZE);
          const { createdRecords, errors } = await processImportRecords(
            batch,
            (record) => insertAccountSchema.parse(normalizeLevelField(record)),
            (data) => storage.createAccount(data),
            {
              existingUsernames: existingSet,
              normalizeUsername: (u) => (u ?? '').trim(),
            }
          );
          allCreated.push(...createdRecords);
          allErrors.push(...errors);
        }

        return res.json({
          imported: allCreated.length,
          errors: allErrors.length,
          accounts: allCreated,
          errorDetails: allErrors,
          sourceName: sourceName ?? null,
        });
      }

      if (false && records.length > 1000) {
        return res.status(400).json({ message: "Qua nhieu tài khoản. Gioi han 1000 tài khoản moi lan import" });
      }

      const { createdRecords, errors } = await processImportRecords(
        records,
        (record) => insertAccountSchema.parse(normalizeLevelField(record)),
        (data) => storage.createAccount(data),
        {
          existingUsernames: existingSet,
          normalizeUsername: (u) => (u ?? '').trim(),
        }
      );

      res.json({
        imported: createdRecords.length,
        errors: errors.length,
        accounts: createdRecords,
        errorDetails: errors,
        sourceName: sourceName ?? null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Du lieu khong hop le", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to import accounts" });
      }
    }
  });

  // Import accounts from text format: user|pass|lv or user:pass:lv (one per line)
  app.post("/api/accounts/import-text", isAuthenticated, async (req, res) => {
    try {
      const { text } = z.object({
        text: z.string().min(1),
      }).parse(req.body);

      // Parse text format: user|pass|lv or user:pass:lv (lv is optional)
      const lines = text.split('\n').map((line: string) => line.trim()).filter((line: string) => line.length > 0);

      if (lines.length === 0) {
        return res.status(400).json({ message: "Không có dữ liệu để import" });
      }

      if (lines.length > 1000) {
        return res.status(400).json({ message: "Quá nhiều tài khoản. Giới hạn 1000 tài khoản mỗi lần import" });
      }

      const records: Array<{ username: string; password: string; lv: number }> = [];
      const parseErrors: Array<{ line: number; content: string; error: string }> = [];

      lines.forEach((line: string, index: number) => {
        // Support both | and : as delimiters
        const parts = line.split(/[|:]/).map((p: string) => p.trim());

        if (parts.length < 2) {
          parseErrors.push({ line: index + 1, content: line, error: "Định dạng không hợp lệ (cần ít nhất user|pass hoặc user:pass)" });
          return;
        }

        const username = parts[0];
        const password = parts[1];
        let lv = 0;

        if (parts.length >= 3) {
          // Parse level: lv10, LV10, 10, etc.
          const lvString = parts[2].toLowerCase().replace(/^lv/, '').trim();
          const parsedLv = parseInt(lvString, 10);
          if (!isNaN(parsedLv) && parsedLv >= 0) {
            lv = parsedLv;
          }
        }

        if (!username) {
          parseErrors.push({ line: index + 1, content: line, error: "Thiếu username" });
          return;
        }

        if (!password || password.length < 4) {
          parseErrors.push({ line: index + 1, content: line, error: "Password quá ngắn (tối thiểu 4 ký tự)" });
          return;
        }

        records.push({ username, password, lv });
      });

      if (records.length === 0) {
        return res.status(400).json({
          message: "Không có dữ liệu hợp lệ để import",
          parseErrors
        });
      }

      // Prefetch existing usernames to avoid repeated duplicate errors
      const existingAccounts = await storage.getAllAccounts();
      const existingSet = new Set(existingAccounts.map((a) => (a.username ?? '').trim()));

      const { createdRecords, errors } = await processImportRecords(
        records,
        (record) => insertAccountSchema.parse(normalizeLevelField(record)),
        (data) => storage.createAccount(data),
        {
          existingUsernames: existingSet,
          normalizeUsername: (u) => (u ?? '').trim(),
        }
      );

      res.json({
        imported: createdRecords.length,
        errors: errors.length + parseErrors.length,
        accounts: createdRecords,
        errorDetails: errors,
        parseErrors,
        sourceName: "Text Import",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to import accounts" });
      }
    }
  });

  // Get account statistics
  app.get("/api/accounts/stats", isAuthenticated, async (req, res) => {
    try {
      const stats = await storage.getAccountStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch statistics" });
    }
  });

  // Update all accLog statuses
  app.patch("/api/acclogs/status-all", isAuthenticated, async (req, res) => {
    try {
      const body = z.object({ status: z.boolean() }).parse(req.body);
      const allLogs = await storage.getAllAccLogs();
      const updatedCount = await storage.updateAllAccLogStatuses(body.status);

      // Emit real-time update
      const allLogIds = allLogs.map(log => log.id);
      emitAccountStatusUpdate(allLogIds, body.status, "acclogs");

      res.json({ updated: updatedCount, status: body.status });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update all accLog statuses" });
      }
    }
  });
  app.patch("/api/acclogs/status", isAuthenticated, async (req, res) => {
    try {
      const body = z
        .object({
          ids: z.array(z.number().int().positive()).min(1),
          status: z.boolean(),
        })
        .parse(req.body);
      const updatedCount = await storage.updateSelectedAccLogStatuses(body.ids, body.status);

      // Emit real-time update
      emitAccountStatusUpdate(body.ids, body.status, "acclogs");

      res.json({ updated: updatedCount, status: body.status });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update accLog statuses" });
      }
    }
  });


  // Get all accLogs
  app.get("/api/acclogs", isAuthenticated, async (req, res) => {
    try {
      const logs = await storage.getAllAccLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch accLogs" });
    }
  });

  // Create new accLog
  app.post("/api/acclogs", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertAccLogSchema.parse(normalizeLevelField(req.body));
      const log = await storage.createAccLog(validatedData);
      res.status(201).json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create accLog" });
      }
    }
  });

  // Update accLog status
  app.patch("/api/acclogs/:id/status", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = updateAccLogSchema.parse(req.body);
      const log = await storage.updateAccLogStatus(id, status!);

      if (!log) {
        return res.status(404).json({ message: "AccLog not found" });
      }

      // Emit real-time update
      emitAccountStatusUpdate([id], status!, "acclogs");

      res.json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update accLog" });
      }
    }
  });

  // Delete accLog
  app.delete("/api/acclogs/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteAccLog(id);

      if (!success) {
        return res.status(404).json({ message: "AccLog not found" });
      }

      res.json({ message: "Acc log deleted." });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete accLog" });
    }
  });

  // Delete multiple or all accLogs
  app.delete("/api/acclogs", isAuthenticated, async (req, res) => {
    try {
      const { ids } = req.body;
      if (ids && Array.isArray(ids) && ids.length > 0) {
        const deletedCount = await storage.deleteMultipleAccLogs(ids);
        res.json({ message: `Đã xóa ${deletedCount} accLog.` });
      } else {
        const deletedCount = await storage.deleteAllAccLogs();
        res.json({ message: `Đã xóa tất cả ${deletedCount} accLog.` });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete accLogs" });
    }
  });

  // Import accLogs from file
  app.post("/api/acclogs/import", isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Không có file được cung cấp" });
      }

      if (req.file.size > 1024 * 1024) {
        return res.status(400).json({ message: "File quá lớn. Giới hạn 1MB" });
      }

      const fileContent = req.file.buffer.toString('utf-8');

      let records: unknown[];
      try {
        const parsed = extractRecordsFromFile(fileContent);
        if (!Array.isArray(parsed)) {
          return res.status(400).json({ message: "File phải chứa một mảng dữ liệu" });
        }
        records = parsed;
      } catch (parseError) {
        const message =
          parseError instanceof Error && parseError.message === 'ARRAY_NOT_FOUND'
            ? 'File phải chứa một mảng JSON. Format: [{"username": "user", "password": "pass"}]'
            : 'Format file không hợp lệ. Sử dụng format JSON: [{"username": "user", "password": "pass"}]';
        return res.status(400).json({ message });
      }

      if (records.length > 1000) {
        return res.status(400).json({ message: "Quá nhiều bản ghi. Giới hạn 1000 mỗi lần import" });
      }

      const { createdRecords, errors } = await processImportRecords(
        records,
        (record) => insertAccLogSchema.parse(normalizeLevelField(record)),
        (data) => storage.createAccLog(data)
      );

      res.json({
        imported: createdRecords.length,
        errors: errors.length,
        accLogs: createdRecords,
        errorDetails: errors,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to import accLogs" });
    }
  });


  // Import accLogs from normalized payload
  app.post("/api/acclogs/import-batch", isAuthenticated, async (req, res) => {
    try {
      const { records, sourceName } = z.object({
        records: z.array(insertAccLogSchema),
        sourceName: z.string().min(1).max(160).optional(),
      }).parse(normalizeLevelField(req.body));

      if (records.length === 0) {
        return res.status(400).json({ message: "Khong co ban ghi de import" });
      }

      // Process in chunks when there are more than 1000 records
      if (records.length > 1000) {
        const MAX_BATCH_SIZE = 1000;
        const allCreated: unknown[] = [];
        const allErrors: Array<{ account: unknown; error: string }> = [];

        for (let i = 0; i < records.length; i += MAX_BATCH_SIZE) {
          const batch = records.slice(i, i + MAX_BATCH_SIZE);
          const { createdRecords, errors } = await processImportRecords(
            batch,
            (record) => insertAccLogSchema.parse(normalizeLevelField(record)),
            (data) => storage.createAccLog(data)
          );
          allCreated.push(...createdRecords);
          allErrors.push(...errors);
        }

        return res.json({
          imported: allCreated.length,
          errors: allErrors.length,
          accLogs: allCreated,
          errorDetails: allErrors,
          sourceName: sourceName ?? null,
        });
      }

      if (false && records.length > 1000) {
        return res.status(400).json({ message: "Qua nhieu ban ghi. Gioi han 1000 moi lan import" });
      }

      const { createdRecords, errors } = await processImportRecords(
        records,
        (record) => insertAccLogSchema.parse(normalizeLevelField(record)),
        (data) => storage.createAccLog(data)
      );

      res.json({
        imported: createdRecords.length,
        errors: errors.length,
        accLogs: createdRecords,
        errorDetails: errors,
        sourceName: sourceName ?? null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Du lieu khong hop le", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to import accLogs" });
      }
    }
  });

  // Get accLog statistics
  app.get("/api/acclogs/stats", isAuthenticated, async (req, res) => {
    try {
      const stats = await storage.getAccLogStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch accLog statistics" });
    }
  });

  // Revenue tracking routes
  app.post("/api/revenue/set-price", isAuthenticated, async (req, res) => {
    try {
      console.log('POST /api/revenue/set-price - Request body:', req.body);
      const body = insertLiveSessionSchema.parse(req.body);
      console.log('Parsed body:', body);
      const session = await storage.createLiveSession(body);
      console.log('Created session:', session);
      return res.status(201).json(session);
    } catch (error) {
      console.error('Error in /api/revenue/set-price:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');

      // Ensure we always return JSON
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid data",
          errors: error.errors,
          details: error.message
        });
      }

      const errorMessage = error instanceof Error ? error.message : "Failed to create live session";
      const errorDetails = error instanceof Error ? error.stack : undefined;

      return res.status(500).json({
        message: errorMessage,
        details: errorDetails
      });
    }
  });

  app.get("/api/revenue/sessions", isAuthenticated, async (req, res) => {
    try {
      const sessions = await storage.getAllLiveSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch live sessions" });
    }
  });

  app.get("/api/revenue/active-session", isAuthenticated, async (req, res) => {
    try {
      const session = await storage.getActiveLiveSession();
      res.json(session || null);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch active session" });
    }
  });

  app.get("/api/revenue/stats", isAuthenticated, async (req, res) => {
    try {
      const { startDate, endDate } = z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).parse(req.query);

      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days ago
      const end = endDate ? new Date(endDate) : new Date();

      const stats = await storage.getRevenueStatsByDate(start, end);
      res.json(stats);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to fetch revenue stats" });
      }
    }
  });

  app.get("/api/revenue/current-session", isAuthenticated, async (req, res) => {
    try {
      const session = await storage.getActiveLiveSession();
      if (!session) {
        console.log('[Revenue] No active session found');
        return res.json({ session: null, revenue: { totalRevenue: 0, accountCount: 0 } });
      }

      const revenue = await storage.getCurrentSessionRevenue(session.id);
      console.log(`[Revenue] Current session revenue for session ${session.id} (${session.sessionName}):`, revenue);
      console.log(`[Revenue] Session details:`, { id: session.id, sessionName: session.sessionName, pricePerAccount: session.pricePerAccount });

      // Ensure we return the correct structure
      const response = {
        session: {
          id: session.id,
          sessionName: session.sessionName,
          pricePerAccount: session.pricePerAccount,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
        revenue: {
          totalRevenue: revenue.totalRevenue || 0,
          accountCount: revenue.accountCount || 0,
        }
      };

      console.log(`[Revenue] Response:`, response);
      res.json(response);
    } catch (error) {
      console.error('[Revenue] Error in /api/revenue/current-session:', error);
      res.status(500).json({ message: "Failed to fetch current session revenue" });
    }
  });

  const httpServer = createServer(app);

  // Initialize Socket.IO
  console.log(`[Socket.IO] Initializing Socket.IO server...`);
  const isProduction = process.env.NODE_ENV === 'production';

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: isProduction ? ALLOWED_ORIGINS : true, // Restrict origins in production
      methods: ["GET", "POST"],
      credentials: true,
    },
    allowEIO3: true, // Support older Socket.IO clients
    path: "/socket.io/", // Explicit path
    // Important for production with reverse proxy (like Render)
    transports: ["websocket", "polling"],
    pingTimeout: 60000,
    pingInterval: 25000,
    // Enable compatibility with reverse proxies
    allowUpgrades: true,
    // For Render and other cloud platforms - disable cookie for Socket.IO
    cookie: false,
  });

  console.log(`[Socket.IO] Socket.IO server initialized successfully`);

  // Socket.IO connection handling
  io.on("connection", (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}, total clients: ${io?.sockets.sockets.size || 0}`);

    socket.on("disconnect", (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}, reason: ${reason}, remaining clients: ${io?.sockets.sockets.size || 0}`);
    });

    socket.on("error", (error) => {
      console.error(`[Socket.IO] Socket error for ${socket.id}:`, error);
    });
  });

  io.engine.on("connection_error", (err) => {
    console.error(`[Socket.IO] Connection error:`, err);
  });

  return httpServer;
}
