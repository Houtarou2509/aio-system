import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { success, error } from '../utils/response';
import { globalSearch } from '../services/search.service';

const router = Router();

// GET /api/search?q=term
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    const results = await globalSearch(q);
    return success(res, results);
  } catch (err: any) {
    return error(res, err.message || 'Search failed', 500);
  }
});

export default router;
