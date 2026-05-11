import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { sendEmail } from '../services/email.service';
import { success, error } from '../utils/response';

const router = Router();

// POST /api/settings/test-email — send test email to verify SMTP config
router.post('/test-email', authenticate, async (req: Request, res: Response) => {
  try {
    const { email: recipient } = req.body;
    if (!recipient || typeof recipient !== 'string') {
      return error(res, 'Email address is required', 400);
    }

    const ok = await sendEmail({
      to: recipient,
      subject: 'AIO System — Test Email',
      text: 'This is a test email from AIO System. Your SMTP configuration is working correctly.',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #012061; padding: 20px; text-align: center;">
            <h2 style="color: #f8931f; margin: 0;">AIO System</h2>
          </div>
          <div style="padding: 24px; background: #fff; border: 1px solid #e2e8f0;">
            <h3 style="color: #012061;">Test Email</h3>
            <p style="color: #334155; font-size: 15px;">Your SMTP configuration is working correctly.</p>
            <p style="color: #94a3b8; font-size: 13px;">If you received this, email alerts are properly configured.</p>
          </div>
        </div>
      `,
    });

    if (ok) {
      return success(res, { message: 'Test email sent successfully' });
    } else {
      return error(res, 'Failed to send test email. Check SMTP configuration.', 500);
    }
  } catch (err: any) {
    return error(res, err.message, 500);
  }
});

export default router;
