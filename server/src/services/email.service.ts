import * as nodemailer from 'nodemailer';

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER && process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    tls: { rejectUnauthorized: false },
  });
}

/**
 * Send an email to one or more recipients.
 * Returns true if accepted, false on error (logs error).
 */
export async function sendEmail(options: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  if (!process.env.SMTP_HOST) {
    console.warn('[Email] SMTP_HOST not configured — skipping email');
    return false;
  }

  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'AIO-System <noreply@localhost>',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    console.log('[Email] Sent:', info.messageId);
    return true;
  } catch (err: any) {
    console.error('[Email] Failed:', err.message);
    return false;
  }
}

/**
 * Notify ADMIN/STAFF_ADMIN users about system alerts
 * (warranty expiry, maintenance overdue, etc.)
 */
export async function sendSystemAlert(subject: string, message: string): Promise<number> {
  // If no SMTP configured, silently skip
  if (!process.env.SMTP_HOST) return 0;

  const { prisma } = await import('../lib/prisma');
  const admins = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'STAFF_ADMIN'] },
      status: 'active',
    },
    select: { email: true },
  });

  if (admins.length === 0) return 0;

  const recipients = admins.map(u => u.email).filter(Boolean) as string[];
  if (recipients.length === 0) return 0;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #012061; padding: 20px; text-align: center;">
        <h2 style="color: #fff; margin: 0;">AIO-System Alert</h2>
      </div>
      <div style="padding: 24px; background: #fff; border: 1px solid #e2e8f0;">
        <p style="color: #334155; font-size: 15px; line-height: 1.6;">${message.replace(/\n/g, '<br>')}</p>
      </div>
      <div style="padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
        Sent from AIO-System
      </div>
    </div>
  `;

  const ok = await sendEmail({
    to: recipients,
    subject,
    text: message,
    html,
  });

  return ok ? recipients.length : 0;
}
