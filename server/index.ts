import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db"; 
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// Log để kiểm tra biến môi trường
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '***[HIDDEN]***' : 'Not set');

const app = express();

// Trust the first proxy
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session configuration
const usePgSessionStore = process.env.NODE_ENV === 'production' || process.env.USE_PG_SESSION_STORE === 'true';
let sessionStore: session.Store;

if (usePgSessionStore) {
  const PgStore = connectPgSimple(session);
  try {
    const pgStoreInstance = new PgStore({
      pool,
      tableName: 'user_sessions',
      createTableIfMissing: true,
    });

    pgStoreInstance.on('error', (error) => {
      console.error('Session store error:', error);
    });

    sessionStore = pgStoreInstance;
  } catch (error) {
    console.error('Failed to initialize Postgres session store, falling back to MemoryStore:', error);
    sessionStore = new session.MemoryStore();
  }
} else {
  console.warn('Using in-memory session store. Set USE_PG_SESSION_STORE=true to enable Postgres-backed sessions.');
  sessionStore = new session.MemoryStore();
}

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'a-default-secret-for-development',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Global error handler:', err);
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Always return JSON, never HTML
    if (!res.headersSent) {
      res.status(status).json({ 
        message,
        error: err.name || 'Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    }
  });

  // Add a catch-all error handler for API routes before vite setup
  app.use("/api/*", (err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('API route error:', err);
    if (!res.headersSent) {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ 
        message,
        error: err.name || 'Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
