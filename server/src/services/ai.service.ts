const AI_URL = process.env.AI_API_URL || '';
const AI_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

interface Suggestion {
  type: string;
  manufacturer: string;
  confidence: number;
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
      return suggestions.map((s, i) => ({ ...s, confidence: 0.9 - i * 0.15 }));
    }
  }
  return [];
}

export async function suggestAsset(assetName: string): Promise<{ suggestions: Suggestion[]; source: string }> {
  // Try AI endpoint first
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
              content: 'You are an asset classification assistant. Given an asset name, suggest the most likely type and manufacturer. Respond ONLY with a JSON array of objects with fields: type (one of: DESKTOP, LAPTOP, FURNITURE, EQUIPMENT, PERIPHERAL, OTHER), manufacturer (string), confidence (0-1). Max 3 suggestions.',
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
            return { suggestions: parsed.slice(0, 3), source: 'ai' };
          }
        }
      }
    } catch {
      // Fallback to local
    }
  }

  // Local fallback
  return { suggestions: localSuggest(assetName), source: 'local' };
}