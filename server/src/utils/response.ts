import { Response } from 'express';

interface ApiResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export function success<T>(res: Response, data: T, status = 200, meta?: ApiResponseMeta) {
  return res.status(status).json({ success: true, data, error: null, meta: meta ?? null });
}

export function error(res: Response, message: string, status = 400, details?: unknown) {
  return res.status(status).json({ success: false, data: null, error: { message, details }, meta: null });
}