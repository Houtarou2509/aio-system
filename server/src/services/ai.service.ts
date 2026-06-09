import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const AI_URL = process.env.AI_API_URL || '';
const AI_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

interface Suggestion {
  type?: string;
  manufacturer?: string;
  usefulLifeYears?: number;
  warrantyYears?: number;
  confidence?: 'high' | 'medium' | 'low';
  // Extended fields from historical assets
  purchasePrice?: number | null;
  purchaseDate?: string | null;
  owner?: string | null;
  location?: string | null;
  supplierId?: string | null;
  status?: string | null;
  remarks?: string | null;
  // Source tracking
  source: 'history' | 'ai' | 'local';
  matchCount?: number;
  exactMatch?: boolean;
}

// Lookup tables for asset metadata based on keyword match
const USEFUL_LIFE_MAP: Record<string, number> = {
  laptop: 5,
  tablet: 5,
  desktop: 7,
  server: 7,
  printer: 10,
  monitor: 7,
};

const WARRANTY_YEARS_MAP: Record<string, number> = {
  laptop: 3,
  tablet: 3,
  desktop: 3,
  server: 3,
  printer: 2,
  monitor: 3,
};

const DEFAULT_USEFUL_LIFE = 5;
const DEFAULT_WARRANTY_YEARS = 1;

function getAssetMetadata(assetName: string): { usefulLifeYears: number; warrantyYears: number; confidence: 'high' | 'low' } {
  const lower = assetName.toLowerCase();
  for (const keyword of Object.keys(USEFUL_LIFE_MAP)) {
    if (lower.includes(keyword)) {
      return {
        usefulLifeYears: USEFUL_LIFE_MAP[keyword],
        warrantyYears: WARRANTY_YEARS_MAP[keyword] ?? DEFAULT_WARRANTY_YEARS,
        confidence: 'high',
      };
    }
  }
  return { usefulLifeYears: DEFAULT_USEFUL_LIFE, warrantyYears: DEFAULT_WARRANTY_YEARS, confidence: 'low' };
}

const TYPE_SUGGESTIONS: Record<string, { type: string; manufacturer: string }[]> = {
  laptop: [
    { type: 'LAPTOP', manufacturer: 'Dell' },
    { type: 'LAPTOP', manufacturer: 'Lenovo' },
    { type: 'LAPTOP', manufacturer: 'HP' },
    { type: 'LAPTOP', manufacturer: 'Apple' },
    { type: 'LAPTOP', manufacturer: 'ASUS' },
  ],
  monitor: [
    { type: 'EQUIPMENT', manufacturer: 'Dell' },
    { type: 'EQUIPMENT', manufacturer: 'LG' },
    { type: 'EQUIPMENT', manufacturer: 'Samsung' },
    { type: 'EQUIPMENT', manufacturer: 'BenQ' },
  ],
  desktop: [
    { type: 'DESKTOP', manufacturer: 'Dell' },
    { type: 'DESKTOP', manufacturer: 'HP' },
    { type: 'DESKTOP', manufacturer: 'Lenovo' },
  ],
  printer: [
    { type: 'EQUIPMENT', manufacturer: 'HP' },
    { type: 'EQUIPMENT', manufacturer: 'Canon' },
    { type: 'EQUIPMENT', manufacturer: 'Brother' },
    { type: 'EQUIPMENT', manufacturer: 'Epson' },
  ],
  chair: [
    { type: 'FURNITURE', manufacturer: 'Herman Miller' },
    { type: 'FURNITURE', manufacturer: 'Steelcase' },
    { type: 'FURNITURE', manufacturer: 'IKEA' },
  ],
  desk: [
    { type: 'FURNITURE', manufacturer: 'IKEA' },
    { type: 'FURNITURE', manufacturer: 'Steelcase' },
  ],
  keyboard: [
    { type: 'PERIPHERAL', manufacturer: 'Logitech' },
    { type: 'PERIPHERAL', manufacturer: 'Corsair' },
    { type: 'PERIPHERAL', manufacturer: 'Razer' },
  ],
  mouse: [
    { type: 'PERIPHERAL', manufacturer: 'Logitech' },
    { type: 'PERIPHERAL', manufacturer: 'Microsoft' },
  ],
  router: [
    { type: 'EQUIPMENT', manufacturer: 'Cisco' },
    { type: 'EQUIPMENT', manufacturer: 'TP-Link' },
  ],
  phone: [
    { type: 'EQUIPMENT', manufacturer: 'Cisco' },
    { type: 'EQUIPMENT', manufacturer: 'Yealink' },
  ],
  projector: [
    { type: 'EQUIPMENT', manufacturer: 'Epson' },
    { type: 'EQUIPMENT', manufacturer: 'BenQ' },
  ],
  scanner: [
    { type: 'EQUIPMENT', manufacturer: 'Fujitsu' },
    { type: 'EQUIPMENT', manufacturer: 'Epson' },
  ],
  tablet: [
    { type: 'LAPTOP', manufacturer: 'Apple' },
    { type: 'LAPTOP', manufacturer: 'Samsung' },
  ],
  server: [
    { type: 'DESKTOP', manufacturer: 'Dell' },
    { type: 'DESKTOP', manufacturer: 'HP' },
    { type: 'DESKTOP', manufacturer: 'Lenovo' },
  ],
  ups: [
    { type: 'EQUIPMENT', manufacturer: 'APC' },
    { type: 'EQUIPMENT', manufacturer: 'CyberPower' },
  ],
};

function localSuggest(assetName: string): Suggestion[] {
  const lower = assetName.toLowerCase();
  for (const [keyword, suggestions] of Object.entries(TYPE_SUGGESTIONS)) {
    if (lower.includes(keyword)) {
      const meta = getAssetMetadata(assetName);
      return suggestions.map((s) => ({
        ...s,
        usefulLifeYears: meta.usefulLifeYears,
        warrantyYears: meta.warrantyYears,
        confidence: meta.confidence,
        source: 'local' as const,
      }));
    }
  }
  return [];
}

// ── Historical asset matching ──
// Query the database for assets with matching name and aggregate reusable fields.
// Never copy unique identifiers (serialNumber, propertyNumber).

interface HistoricalAggregate {
  type: string | null;
  manufacturer: string | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  owner: string | null;
  location: string | null;
  supplierId: string | null;
  status: string | null;
  remarks: string | null;
  usefulLifeYears: number | null;
  warrantyYears: number | null;
}

function mostCommon<T>(values: (T | null | undefined)[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) {
    if (v != null && v !== '') {
      counts.set(v, (counts.get(v) || 0) + 1);
    }
  }
  let best: T | null = null;
  let bestCount = 0;
  counts.forEach((count, val) => {
    if (count > bestCount) {
      best = val;
      bestCount = count;
    }
  });
  return best;
}

async function getHistoricalSuggestion(assetName: string): Promise<{ suggestion: Suggestion; matchCount: number; exactMatch: boolean } | null> {
  // Try exact match first
  const exactMatches = await prisma.asset.findMany({
    where: { name: assetName, deletedAt: null },
    select: {
      type: true,
      manufacturer: true,
      purchasePrice: true,
      purchaseDate: true,
      owner: true,
      location: true,
      supplierId: true,
      status: true,
      remarks: true,
      usefulLifeYears: true,
      warrantyExpiry: true,
    },
  });

  let matches = exactMatches;
  let exactMatch = true;

  // If no exact matches, try case-insensitive partial match
  if (matches.length === 0) {
    matches = await prisma.asset.findMany({
      where: {
        name: { contains: assetName, mode: 'insensitive' },
        deletedAt: null,
      },
      select: {
        type: true,
        manufacturer: true,
        purchasePrice: true,
        purchaseDate: true,
        owner: true,
        location: true,
        supplierId: true,
        status: true,
        remarks: true,
        usefulLifeYears: true,
        warrantyExpiry: true,
      },
    });
    exactMatch = false;
  }

  if (matches.length === 0) return null;

  // Aggregate: find most common value for each field
  const types = matches.map(m => m.type);
  const manufacturers = matches.map(m => m.manufacturer);
  const prices = matches.map(m => m.purchasePrice ? Number(m.purchasePrice) : null);
  const dates = matches.map(m => m.purchaseDate ? m.purchaseDate.toISOString().split('T')[0] : null);
  const owners = matches.map(m => m.owner);
  const locations = matches.map(m => m.location);
  const supplierIds = matches.map(m => m.supplierId);
  const statuses = matches.map(m => m.status);
  const remarksArr = matches.map(m => m.remarks);
  const usefulLives = matches.map(m => m.usefulLifeYears);

  // Compute warranty years from warrantyExpiry and purchaseDate
  const warrantyYearsArr: (number | null)[] = matches.map(m => {
    if (m.warrantyExpiry && m.purchaseDate) {
      const diffMs = new Date(m.warrantyExpiry).getTime() - new Date(m.purchaseDate).getTime();
      const years = Math.round(diffMs / (365.25 * 24 * 60 * 60 * 1000) * 10) / 10;
      return years > 0 ? years : null;
    }
    return null;
  });

  const mostCommonType = mostCommon(types);
  const mostCommonMfg = mostCommon(manufacturers);
  const mostCommonPrice = mostCommon(prices);
  const mostCommonDate = mostCommon(dates);
  const mostCommonOwner = mostCommon(owners);
  const mostCommonLocation = mostCommon(locations);
  const mostCommonSupplier = mostCommon(supplierIds);
  const mostCommonStatus = mostCommon(statuses);
  const mostCommonRemarks = mostCommon(remarksArr);
  const mostCommonUsefulLife = mostCommon(usefulLives);
  const mostCommonWarranty = mostCommon(warrantyYearsArr);

  const suggestion: Suggestion = {
    source: 'history',
    exactMatch,
    matchCount: matches.length,
    confidence: exactMatch && matches.length >= 2 ? 'high' : exactMatch ? 'high' : 'medium',
  };

  // Only include fields that have values
  if (mostCommonType) suggestion.type = mostCommonType;
  if (mostCommonMfg) suggestion.manufacturer = mostCommonMfg;
  if (mostCommonUsefulLife) suggestion.usefulLifeYears = mostCommonUsefulLife;
  if (mostCommonWarranty) suggestion.warrantyYears = mostCommonWarranty;
  if (mostCommonPrice) suggestion.purchasePrice = mostCommonPrice;
  if (mostCommonDate) suggestion.purchaseDate = mostCommonDate;
  if (mostCommonOwner) suggestion.owner = mostCommonOwner;
  if (mostCommonLocation) suggestion.location = mostCommonLocation;
  if (mostCommonSupplier) suggestion.supplierId = mostCommonSupplier;
  // Only suggest AVAILABLE status for new assets; don't suggest RETIRED/LOST/etc.
  if (mostCommonStatus && mostCommonStatus === 'AVAILABLE') suggestion.status = mostCommonStatus;
  if (mostCommonRemarks) suggestion.remarks = mostCommonRemarks;

  // If we got historical data but no specific fields matched, still return with low confidence
  if (!suggestion.type && !suggestion.manufacturer && suggestion.usefulLifeYears == null) {
    suggestion.confidence = 'low';
  }

  return { suggestion, matchCount: matches.length, exactMatch };
}

export async function suggestAsset(assetName: string): Promise<{ suggestions: Suggestion[]; source: string }> {
  // 1. First check historical asset data (highest priority)
  const historical = await getHistoricalSuggestion(assetName);
  if (historical && historical.suggestion.confidence !== 'low') {
    // If we have a strong historical match, use it as primary suggestion
    // but also enrich with local/AI metadata for usefulLifeYears if missing
    const meta = getAssetMetadata(assetName);

    const suggestion = { ...historical.suggestion };

    // Fill in usefulLifeYears/warrantyYears from keyword map if not available from history
    if (suggestion.usefulLifeYears == null && meta.usefulLifeYears) {
      suggestion.usefulLifeYears = meta.usefulLifeYears;
    }
    if (suggestion.warrantyYears == null && meta.warrantyYears) {
      suggestion.warrantyYears = meta.warrantyYears;
    }

    // Also get alternate suggestions from local/AI for comparison
    const localResults = localSuggest(assetName);
    const combined = [suggestion, ...localResults.filter(s =>
      s.type !== suggestion.type || s.manufacturer !== suggestion.manufacturer
    )];

    // Try AI endpoint for additional alternatives
    if (AI_URL && AI_KEY) {
      try {
        const res = await fetch(AI_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AI_KEY}`,
          },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [
              {
                role: 'system',
                content: 'You are an asset classification assistant. Given an asset name, suggest the most likely type and manufacturer. Respond ONLY with a JSON array of objects with fields: type (one of: DESKTOP, LAPTOP, FURNITURE, EQUIPMENT, PERIPHERAL, OTHER), manufacturer (string). Max 3 suggestions.',
              },
              { role: 'user', content: `Asset name: "${assetName}"` },
            ],
            temperature: 0.3,
            max_tokens: 200,
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          const data: any = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
              const aiMeta = getAssetMetadata(assetName);
              const aiSuggestions: Suggestion[] = parsed.slice(0, 3).map((s: any) => ({
                type: s.type || 'OTHER',
                manufacturer: s.manufacturer || '',
                usefulLifeYears: aiMeta.usefulLifeYears,
                warrantyYears: aiMeta.warrantyYears,
                confidence: aiMeta.confidence,
                source: 'ai' as const,
              }));
              // Add unique AI suggestions not already in combined
              for (const aiS of aiSuggestions) {
                if (!combined.some(c => c.type === aiS.type && c.manufacturer === aiS.manufacturer)) {
                  combined.push(aiS);
                }
              }
            }
          }
        }
      } catch {
        // AI unavailable, that's fine
      }
    }

    return { suggestions: combined, source: 'history' };
  }

  // 2. No strong historical match — Try AI endpoint
  if (AI_URL && AI_KEY) {
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_KEY}`,
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are an asset classification assistant. Given an asset name, suggest the most likely type and manufacturer. Respond ONLY with a JSON array of objects with fields: type (one of: DESKTOP, LAPTOP, FURNITURE, EQUIPMENT, PERIPHERAL, OTHER), manufacturer (string). Max 3 suggestions.',
            },
            { role: 'user', content: `Asset name: "${assetName}"` },
          ],
          temperature: 0.3,
          max_tokens: 200,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data: any = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            const meta = getAssetMetadata(assetName);
            return {
              suggestions: parsed.slice(0, 3).map((s: any) => ({
                type: s.type || 'OTHER',
                manufacturer: s.manufacturer || '',
                usefulLifeYears: meta.usefulLifeYears,
                warrantyYears: meta.warrantyYears,
                confidence: meta.confidence,
                source: 'ai',
              })),
              source: 'ai',
            };
          }
        }
      }
    } catch {
      // Fallback to local
    }
  }

  // 3. If we had a low-confidence historical match, still return it alongside local suggestions
  if (historical) {
    const localResults = localSuggest(assetName);
    return {
      suggestions: [historical.suggestion, ...localResults],
      source: 'local',
    };
  }

  // 4. Local fallback
  return { suggestions: localSuggest(assetName), source: 'local' };
}