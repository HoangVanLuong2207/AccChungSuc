import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// Validate SESSION_SECRET in production
const sessionSecret = process.env.SESSION_SECRET || 'a-default-secret-for-development';
if (process.env.NODE_ENV === 'production') {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || process.env.SESSION_SECRET.includes('default')) {
    console.error('FATAL: SESSION_SECRET must be at least 32 characters and not contain "default" in production!');
    process.exit(1);
  }
}

// Log để kiểm tra biến môi trường
console.log('TURSO_DATABASE_URL:', process.env.TURSO_DATABASE_URL ? '***[HIDDEN]***' : 'Not set');


const app = express();

// Trust the first proxy (important for Render and other cloud platforms)
app.set('trust proxy', 1);

// Security headers with helmet
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
  crossOriginEmbedderPolicy: false, // Required for Socket.IO
}));

// Global rate limiter - 1000 requests per 15 minutes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { message: "Quá nhiều request, vui lòng thử lại sau" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Auth rate limiter - exported for use in routes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 login attempts per 15 minutes
  message: { message: "Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút" },
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS configuration for cross-origin requests (Firebase -> Render)
export const ALLOWED_ORIGINS = [
  'https://accchungsuc.web.app',
  'https://accchungsuc.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:5000',
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session configuration - using MemoryStore (simpler for Turso setup)
// Note: Sessions will be lost on server restart. For production persistence,
// consider using a compatible session store like Redis.
console.log('Using in-memory session store');
const sessionStore = new session.MemoryStore();

app.use(session({
  store: sessionStore,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' for cross-domain
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

  // Ensure unmatched API routes return JSON 404 (not index.html)
  app.all("/api/*", (req: Request, res: Response) => {
    if (!res.headersSent) {
      res.status(404).json({ message: `API route not found: ${req.method} ${req.path}` });
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
  // Use localhost for dev (Node 24 compatibility), 0.0.0.0 for production
  const host = process.env.NODE_ENV === 'production' ? "0.0.0.0" : "localhost";
  server.listen(port, host, () => {
    log(`serving on http://${host}:${port}`);
  });
})();
