import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import crypto from 'crypto';



const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET + '-refresh';
const REFRESH_EXPIRES_IN = '7d';
const TWO_FA_ISSUER = process.env.TWO_FA_ISSUER || 'AIO-System';

interface TokenPayload {
  id: string;
  role: string;
  permissions: string[];
}

/** Parse the stored JSON permissions string into a string array. */
function parsePermissions(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function signAccessToken(payload: TokenPayload): string {
  const opts: SignOptions = { expiresIn: JWT_EXPIRES_IN as any };
  return jwt.sign(payload as object, JWT_SECRET, opts);
}

function signRefreshToken(payload: TokenPayload): string {
  const opts: SignOptions = { expiresIn: REFRESH_EXPIRES_IN as any };
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, REFRESH_SECRET, opts);
}

// Stored refresh tokens (in production, use Redis or DB table)
// Keyed by SHA-256 hash of the token to avoid collisions when JWTs are identical
const refreshTokens = new Map<string, { userId: string; tokenHash: string; expires: number }>();

export async function login(email: string, password: string, twoFactorToken?: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.warn('[AUTH] Login failed: user not found for email:', email);
    throw new Error('Invalid email or password.');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    console.warn('[AUTH] Login failed: password mismatch for email:', email, '| hash length:', user.passwordHash.length);
    throw new Error('Invalid email or password.');
  }

  // Status check
  if (user.status === 'inactive') throw new Error('Your account has been deactivated. Contact your administrator.');

  // 2FA check
  if (user.twoFactorEnabled) {
    if (!twoFactorToken) {
      return { requiresTwoFactor: true, userId: user.id };
    }
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: 'base32',
      token: twoFactorToken,
    });
    if (!verified) throw new Error('Invalid or expired authentication code');
  }

  const permissions = parsePermissions(user.permissions);
  const payload: TokenPayload = { id: user.id, role: user.role, permissions };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Store refresh token by its hash (not raw token) for rotation safety
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  refreshTokens.set(tokenHash, {
    userId: user.id,
    tokenHash,
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  // Update lastLogin
  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

  return {
    requiresTwoFactor: false,
    accessToken,
    refreshToken,
    mustChangePassword: user.mustChangePassword,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
      mustChangePassword: user.mustChangePassword,
      permissions,
    },
  };
}

export async function refreshToken(oldRefreshToken: string) {
  const oldHash = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');
  const stored = refreshTokens.get(oldHash);
  if (!stored) throw new Error('Invalid refresh token');

  if (Date.now() > stored.expires) {
    refreshTokens.delete(oldHash);
    throw new Error('Refresh token expired');
  }

  // Verify the JWT is still structurally valid
  const decoded = jwt.verify(oldRefreshToken, REFRESH_SECRET) as TokenPayload;

  // Verify user still exists — reload permissions from DB in case they changed
  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) throw new Error('User not found');

  // Rotate: invalidate old, issue new pair
  refreshTokens.delete(oldHash);

  const permissions = parsePermissions(user.permissions);
  const payload: TokenPayload = { id: user.id, role: user.role, permissions };
  const accessToken = signAccessToken(payload);
  const newRefreshToken = signRefreshToken(payload);

  const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
  refreshTokens.set(newHash, {
    userId: user.id,
    tokenHash: newHash,
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  return { accessToken, refreshToken: newRefreshToken };
}

export function logout(refreshToken: string) {
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  refreshTokens.delete(hash);
}

export async function setup2Fa(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');
  if (user.twoFactorEnabled) throw new Error('2FA already enabled');

  const secret = speakeasy.generateSecret({
    name: `${TWO_FA_ISSUER} (${user.email})`,
    length: 20,
  });

  // Temporarily store secret (not enabled yet)
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: secret.base32 },
  });

  return {
    secret: secret.base32,
    otpauthUrl: secret.otpauth_url,
  };
}

export async function verify2Fa(userId: string, token: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');
  if (!user.twoFactorSecret) throw new Error('2FA not set up');

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token,
  });

  if (!verified) throw new Error('Invalid TOTP token');

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true, backupCodes: JSON.stringify(generateBackupCodes()) },
  });

  return { enabled: true };
}

export async function validate2Fa(userId: string, token: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');
  if (!user.twoFactorEnabled || !user.twoFactorSecret) throw new Error('2FA not enabled');

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token,
  });

  if (!verified) throw new Error('Invalid or expired authentication code');

  return { valid: true };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      role: true,
      twoFactorEnabled: true,
      mustChangePassword: true,
      permissions: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) throw new Error('User not found');
  return {
    ...user,
    mustChangePassword: user.mustChangePassword,
    permissions: parsePermissions(user.permissions),
  };
}

/** In-memory store for password reset tokens. Keyed by token hash. */
const resetTokens = new Map<string, { userId: string; expires: number }>();

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { message: 'If that email exists, a reset link has been sent.' };
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  resetTokens.set(tokenHash, {
    userId: user.id,
    expires: Date.now() + 60 * 60 * 1000,
  });

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000/aio-system';
  const resetLink = `${clientUrl}/reset-password?token=${rawToken}`;

  const { sendEmail } = await import('./email.service');
  await sendEmail({
    to: user.email,
    subject: 'AIO System — Password Reset Request',
    text: `You requested a password reset.\n\nClick this link to reset your password (valid for 1 hour):\n${resetLink}\n\nIf you didn't request this, ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #012061; padding: 20px; text-align: center;">
          <h2 style="color: #f8931f; margin: 0;">AIO System</h2>
        </div>
        <div style="padding: 24px; background: #fff; border: 1px solid #e2e8f0;">
          <h3 style="color: #012061;">Password Reset Request</h3>
          <p style="color: #334155; font-size: 15px;">Click the button below to reset your password. This link is valid for 1 hour.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetLink}"
               style="display: inline-block; background: #f8931f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Reset Password
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 13px;">If you didn't request this, please ignore this email.</p>
        </div>
        <div style="padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
          Sent from AIO-System
        </div>
      </div>
    `,
  });

  return { message: 'If that email exists, a reset link has been sent.' };
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<{ message: string }> {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const stored = resetTokens.get(tokenHash);
  if (!stored) throw new Error('Invalid or expired reset token');

  if (Date.now() > stored.expires) {
    resetTokens.delete(tokenHash);
    throw new Error('Reset token has expired');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: stored.userId },
    data: { passwordHash, mustChangePassword: false },
  });

  resetTokens.delete(tokenHash);
  return { message: 'Password has been reset successfully.' };
}

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    codes.push(crypto.randomBytes(4).toString('hex'));
  }
  return codes;
}
