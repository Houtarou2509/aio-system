import { Router, Request, Response } from 'express';
import * as aiService from '../services/ai.service';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { success, error } from '../utils/response';
import { suggestSchema } from './ai.schema';

const router = Router();

router.use(authenticate);

// POST /api/ai/suggest
router.post('/suggest', authorize(['ADMIN', 'STAFF_ADMIN', 'STAFF']), validate(suggestSchema), async (req: Request, res: Response) => {
  try {
    const { assetName } = req.body;
    const result = await aiService.suggestAsset(assetName);
    return success(res, result, 200);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

export default router;