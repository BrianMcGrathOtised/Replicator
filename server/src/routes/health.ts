import { Router, Request, Response } from 'express';

const router = Router();

// Health check endpoint
router.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Database connectivity check (placeholder)
router.get('/db', (_req: Request, res: Response) => {
  // TODO: Implement actual database connectivity check
  res.json({
    success: true,
    message: 'Database connectivity check',
    databases: {
      sqlite: 'available',
      sqlserver: 'configurable'
    }
  });
});

export { router as healthRoutes }; 