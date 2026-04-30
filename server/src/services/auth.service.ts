import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import crypto from 'crypto';

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET + '-refresh';
const REFRESH_EXPIRES_IN = '7d';
const TWO_FA_ISSUER = process.env.TWO_FA_ISSUER || 'AIO-System';

interface TokenPayload {
  id: string;
  role: string;
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
    throw new Error('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    console.warn('[AUTH] Login failed: password mismatch for email:', email, '| hash length:', user.passwordHash.length);
    throw new Error('Invalid credentials');
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
    if (!verified) throw new Error('Invalid 2FA token');
  }

  const payload: TokenPayload = { id: user.id, role: user.role };
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
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
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

  // Verify user still exists
  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) throw new Error('User not found');

  // Rotate: invalidate old, issue new pair
  refreshTokens.delete(oldHash);

  const payload: TokenPayload = { id: user.id, role: user.role };
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

  if (!verified) throw new Error('Invalid 2FA token');

  return { valid: true };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      twoFactorEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) throw new Error('User not found');
  return user;
}

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    codes.push(crypto.randomBytes(4).toString('hex'));
  }
  return codes;
}