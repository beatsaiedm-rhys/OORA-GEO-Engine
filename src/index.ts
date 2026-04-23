export type GeoAuditInput = {
  url: string;
  brandName?: string;
  markets?: string[];
  contentSignals?: string[];
};

export type GeoAuditResult = {
  url: string;
  visibilityScore: number;
  entityClarityScore: number;
  citationReadinessScore: number;
  recommendations: string[];
  nextActions: string[];
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const hasUrlStructure = (url: string) => /^https?:\/\/[^\s.]+\.[^\s]+/.test(url.trim());

export function runGeoAudit(input: GeoAuditInput): GeoAuditResult {
  const signals = input.contentSignals || [];
  const marketDepth = input.markets?.length || 0;
  const base = hasUrlStructure(input.url) ? 42 : 18;
  const visibilityScore = clamp(base + signals.length * 7 + marketDepth * 4 + (input.brandName ? 8 : 0));
  const entityClarityScore = clamp(30 + (input.brandName ? 25 : 0) + signals.filter((signal) => /about|schema|faq|case|proof/i.test(signal)).length * 10);
  const citationReadinessScore = clamp(24 + signals.filter((signal) => /source|reference|stat|author|date/i.test(signal)).length * 13 + marketDepth * 3);

  return {
    url: input.url,
    visibilityScore,
    entityClarityScore,
    citationReadinessScore,
    recommendations: [
      'Create a concise entity profile for brand, products, authorship, and service scope.',
      'Add answer-ready sections with direct claims, structured proof, and source timestamps.',
      'Publish supporting references that AI retrieval systems can cite consistently.',
    ],
    nextActions: [
      'Map target queries to answer blocks.',
      'Add schema and page-level entity signals.',
      'Re-run GEO scoring after content deployment.',
    ],
  };
}
