export function getWarrantyStatus(warrantyExpiry: string | null): {
  status: 'none' | 'active' | 'expiring' | 'expired';
  daysUntilExpiry?: number;
} {
  if (!warrantyExpiry) return { status: 'none' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(warrantyExpiry);
  expiry.setHours(0, 0, 0, 0);
  const daysUntilExpiry = Math.ceil(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry < 0) {
    // Stop showing expired warning after 6 months (180 days)
    if (daysUntilExpiry < -180) return { status: 'none' };
    return { status: 'expired', daysUntilExpiry };
  }
  if (daysUntilExpiry <= 90) return { status: 'expiring', daysUntilExpiry };
  return { status: 'active', daysUntilExpiry };
}

export function formatWarrantyDate(date: string): string {
  return new Date(date).toLocaleDateString('en-GB');
}