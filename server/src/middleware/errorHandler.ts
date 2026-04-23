import { Request, Response, NextFunction } from 'express';
import { error } from '../utils/response';

export function globalErrorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('[Error]', err.message);

  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(422).json({
      success: false,
      data: null,
      error: { message: 'Validation failed', details: (err as any).flatten?.() || err.message },
      meta: null,
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      data: null,
      error: { message: err.message },
      meta: null,
    });
  }

  // Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    return res.status(400).json({
      success: false,
      data: null,
      error: { message: 'Database error', details: err.message },
      meta: null,
    });
  }

  // Default
  const status = (err as any).status || 500;
  return res.status(status).json({
    success: false,
    data: null,
    error: { message: status === 500 ? 'Internal server error' : err.message },
    meta: null,
  });
}