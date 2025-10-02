import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAccountSchema, updateAccountSchema, updateAccountTagSchema, insertUserSchema, insertAccLogSchema, updateAccLogSchema } from "@shared/schema";
import { isAuthenticated } from "./auth";
import bcrypt from "bcrypt";
import multer from "multer";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

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

async function processImportRecords<T>(
  records: unknown[],
  parseRecord: (record: unknown) => { username: string; password: string },
  createRecord: (data: { username: string; password: string }) => Promise<T>
) {
  const createdRecords: T[] = [];
  const errors: Array<{ account: unknown; error: string }> = [];
  const seenUsernames = new Set<string>();

  for (const record of records) {
    try {
      const validated = parseRecord(record);

      if (seenUsernames.has(validated.username)) {
        errors.push({ account: record, error: 'Tên tài khoản trùng lặp trong file' });
        continue;
      }
      seenUsernames.add(validated.username);

      const created = await createRecord(validated);
      createdRecords.push(created);
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth routes
  app.post("/api/login", async (req, res) => {
    console.log('--- Login Request Received ---');
    try {
      const { username, password } = insertUserSchema.parse(req.body);
      console.log(`Attempting login for user: ${username}`);

      const user = await storage.getUserByUsername(username);
      if (!user) {
        console.log(`User not found: ${username}`);
        return res.status(401).json({ message: "Tên đăng nhập hoặc mật khẩu không đúng" });
      }
      console.log(`User found: ${user.username}`);

      const isPasswordMatch = await bcrypt.compare(password, user.password);
      if (!isPasswordMatch) {
        console.log(`Password mismatch for user: ${username}`);
        return res.status(401).json({ message: "Tên đăng nhập hoặc mật khẩu không đúng" });
      }
      console.log(`Password match for user: ${username}`);

      req.session.userId = user.id;
      console.log(`Session created for user ID: ${user.id}`);
      res.json({ id: user.id, username: user.username });

    } catch (error) {
      console.error('!!! SERVER LOGIN ERROR !!!:', error);
      res.status(500).json({ message: "Lỗi máy chủ nội bộ" });
    }
  });

  // Update all account statuses
  app.patch("/api/accounts/status-all", isAuthenticated, async (req, res) => {
    try {
      const body = z.object({ status: z.boolean() }).parse(req.body);
      const updatedCount = await storage.updateAllAccountStatuses(body.status);
      res.json({ updated: updatedCount, status: body.status });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update all account statuses" });
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
      const validatedData = insertAccountSchema.parse(req.body);
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

  // Update account status
  app.patch("/api/accounts/:id/status", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = updateAccountSchema.parse(req.body);
      const account = await storage.updateAccountStatus(id, status!);
      
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
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
      
      res.status(204).send();
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

      const { createdRecords, errors } = await processImportRecords(
        records,
        (record) => insertAccountSchema.parse(record),
        (data) => storage.createAccount(data)
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
      }).parse(req.body);

      if (records.length === 0) {
        return res.status(400).json({ message: "Khong co ban ghi de import" });
      }

      if (records.length > 1000) {
        return res.status(400).json({ message: "Qua nhieu tài khoản. Gioi han 1000 tài khoản moi lan import" });
      }

      const { createdRecords, errors } = await processImportRecords(
        records,
        (record) => insertAccountSchema.parse(record),
        (data) => storage.createAccount(data)
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
      const updatedCount = await storage.updateAllAccLogStatuses(body.status);
      res.json({ updated: updatedCount, status: body.status });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update all accLog statuses" });
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
      const validatedData = insertAccLogSchema.parse(req.body);
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

      res.status(204).send();
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
        (record) => insertAccLogSchema.parse(record),
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
      }).parse(req.body);

      if (records.length === 0) {
        return res.status(400).json({ message: "Khong co ban ghi de import" });
      }

      if (records.length > 1000) {
        return res.status(400).json({ message: "Qua nhieu ban ghi. Gioi han 1000 moi lan import" });
      }

      const { createdRecords, errors } = await processImportRecords(
        records,
        (record) => insertAccLogSchema.parse(record),
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

  const httpServer = createServer(app);
  return httpServer;
}


