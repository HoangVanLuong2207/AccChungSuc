import type { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.session.userId) {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized' });
};
