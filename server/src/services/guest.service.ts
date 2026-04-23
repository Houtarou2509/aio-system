import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import rateLimit from 'express-rate-limit';

const prisma = new PrismaClient();

function generateToken(): string {
  return crypto.randomBytes(20).toString('base64').replace(/[+/=]/g, '').substring(0, 27);
}

export async function createGuestToken(assetId: string, expiresAt?: string, maxAccess?: number) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId, deletedAt: null } });
  if (!asset) throw new Error('Asset not found');

  const token = generateToken();
  const expires = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // default 7 days

  const guestToken = await prisma.guestToken.create({
    data: { assetId, token, expiresAt: expires, maxAccess: maxAccess || 10 },
  });

  return guestToken;
}

export async function getAssetByGuestToken(token: string, ipAddress?: string) {
  const guestToken = await prisma.guestToken.findUnique({ where: { token } });
  if (!guestToken) throw new Error('Token not found');
  if (guestToken.expiresAt < new Date()) throw new Error('Token expired');
  if (guestToken.maxAccess && guestToken.accessCount >= guestToken.maxAccess) throw new Error('Max access reached');

  // Increment access count
  await prisma.guestToken.update({
    where: { id: guestToken.id },
    data: { accessCount: { increment: 1 } },
  });

  const asset = await prisma.asset.findUnique({
    where: { id: guestToken.assetId, deletedAt: null },
    select: {
      id: true,
      name: true,
      type: true,
      manufacturer: true,
      status: true,
      location: true,
      imageUrl: true,
      createdAt: true,
      // Hide: purchasePrice, serialNumber
    },
  });

  if (!asset) throw new Error('Asset not found');

  return { ...asset, _accessCount: guestToken.accessCount + 1, _maxAccess: guestToken.maxAccess };
}

export async function listGuestTokens(assetId?: string) {
  const where = assetId ? { assetId } : {};
  return prisma.guestToken.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { asset: { select: { id: true, name: true } } },
  });
}

export async function revokeGuestToken(id: string) {
  const existing = await prisma.guestToken.findUnique({ where: { id } });
  if (!existing) throw new Error('Token not found');
  await prisma.guestToken.delete({ where: { id } });
  return { revoked: true };
}

// Rate limit for guest access: 10 req/min per IP
export const guestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, data: null, error: { message: 'Too many requests' }, meta: null },
  standardHeaders: true,
  legacyHeaders: false,
});