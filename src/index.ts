export type GeoMarket = 'global' | 'north-america' | 'europe' | 'apac' | 'mena' | 'latam';

export type GeoAuditInput = {
  url: string;
  html?: string;
  text?: string;
  brandName?: string;
  markets?: GeoMarket[];
  targetQuestions?: string[];
  knownCompetitors?: string[];
};

export type ExtractedGeoSignals = {
  title: string;
  metaDescription: string;
  headings: string[];
  jsonLdTypes: string[];
  externalLinkCount: number;
  datedReferenceCount: number;
  answerBlockCount: number;
  faqSignalCount: number;
  productSignalCount: number;
  proofSignalCount: number;
  textLength: number;
};

export type GeoAuditIssue = {
  severity: 'low' | 'medium' | 'high';
  code: string;
  message: string;
  fix: string;
};

export type GeoAuditResult = {
  url: string;
  normalizedUrl: string;
  overallScore: number;
  visibilityScore: number;
  entityClarityScore: number;
  citationReadinessScore: number;
  answerCoverageScore: number;
  technicalReadinessScore: number;
  extractedSignals: ExtractedGeoSignals;
  issues: GeoAuditIssue[];
  recommendations: string[];
  nextActions: string[];
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchFirst(source: string, pattern: RegExp): string {
  return source.match(pattern)?.[1]?.replace(/\s+/g, ' ').trim() || '';
}

function matchAll(source: string, pattern: RegExp): string[] {
  return Array.from(source.matchAll(pattern))
    .map((match) => (match[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function normalizeUrl(url: string): string {
  const value = url.trim();
  if (!value) throw new Error('A URL is required.');
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const parsed = new URL(withProtocol);
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

export function extractGeoSignals(htmlOrText: string): ExtractedGeoSignals {
  const hasHtml = /<html|<head|<body|<h1|<script/i.test(htmlOrText);
  const html = hasHtml ? htmlOrText : '';
  const text = hasHtml ? stripTags(htmlOrText) : htmlOrText.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const jsonLdBlocks = matchAll(html, /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const jsonLdTypes = jsonLdBlocks.flatMap((block) => {
    try {
      const payload = JSON.parse(block);
      const items = Array.isArray(payload) ? payload : [payload];
      return items.flatMap((item) => {
        const type = item?.['@type'];
        return Array.isArray(type) ? type : type ? [String(type)] : [];
      });
    } catch {
      return [];
    }
  });

  return {
    title: matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    metaDescription: matchFirst(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i),
    headings: matchAll(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi),
    jsonLdTypes: Array.from(new Set(jsonLdTypes)),
    externalLinkCount: matchAll(html, /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>/gi).length,
    datedReferenceCount: (text.match(/\b(20\d{2}|19\d{2})\b/g) || []).length,
    answerBlockCount: (lower.match(/\b(what|why|how|when|where|who|which|answer|guide|steps|benefits)\b/g) || []).length,
    faqSignalCount: (lower.match(/\b(faq|frequently asked|questions|q&a)\b/g) || []).length,
    productSignalCount: (lower.match(/\b(product|service|pricing|feature|case study|customer|integration)\b/g) || []).length,
    proofSignalCount: (lower.match(/\b(source|reference|evidence|report|study|author|updated|verified|metric)\b/g) || []).length,
    textLength: text.length,
  };
}

function coverageForQuestions(questions: string[], content: string): number {
  if (!questions.length) return 55;
  const lower = content.toLowerCase();
  const covered = questions.filter((question) => {
    const keywords = question
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3);
    return keywords.length > 0 && keywords.filter((word) => lower.includes(word)).length / keywords.length >= 0.4;
  }).length;
  return clamp((covered / questions.length) * 100);
}

function buildIssues(input: GeoAuditInput, signals: ExtractedGeoSignals, scores: Record<string, number>): GeoAuditIssue[] {
  const issues: GeoAuditIssue[] = [];
  if (!signals.title) issues.push({ severity: 'high', code: 'missing_title', message: 'The page has no clear title.', fix: 'Add a concise title containing brand, category, and primary value proposition.' });
  if (!signals.metaDescription) issues.push({ severity: 'medium', code: 'missing_description', message: 'The page has no meta description.', fix: 'Add a direct description that AI systems can summarize and cite.' });
  if (!signals.jsonLdTypes.length) issues.push({ severity: 'high', code: 'missing_schema', message: 'No JSON-LD entity schema was detected.', fix: 'Add Organization, Product, FAQPage, Article, or Service schema where relevant.' });
  if (signals.externalLinkCount < 2) issues.push({ severity: 'medium', code: 'thin_references', message: 'The page has limited external reference signals.', fix: 'Add credible source links, partner references, or supporting proof pages.' });
  if (signals.answerBlockCount < 4) issues.push({ severity: 'high', code: 'weak_answer_surface', message: 'The content does not expose enough answer-ready blocks.', fix: 'Add direct Q&A sections for the questions buyers and AI agents will ask.' });
  if (scores.answerCoverageScore < 50 && input.targetQuestions?.length) issues.push({ severity: 'high', code: 'target_question_gap', message: 'Target questions are not sufficiently covered.', fix: 'Create one answer block per target question and include product proof.' });
  return issues;
}

export function runGeoAudit(input: GeoAuditInput): GeoAuditResult {
  const normalizedUrl = normalizeUrl(input.url);
  const source = input.html || input.text || '';
  const signals = extractGeoSignals(source);
  const content = source ? stripTags(source) : `${input.brandName || ''} ${(input.targetQuestions || []).join(' ')}`;
  const marketDepth = input.markets?.length || 0;

  const entityClarityScore = clamp(
    22 +
      (input.brandName ? 14 : 0) +
      (signals.title ? 10 : 0) +
      (signals.metaDescription ? 10 : 0) +
      signals.jsonLdTypes.length * 9 +
      signals.productSignalCount * 2,
  );
  const citationReadinessScore = clamp(18 + signals.externalLinkCount * 5 + signals.datedReferenceCount * 4 + signals.proofSignalCount * 6);
  const answerCoverageScore = clamp(coverageForQuestions(input.targetQuestions || [], content) * 0.65 + signals.answerBlockCount * 4 + signals.faqSignalCount * 6);
  const technicalReadinessScore = clamp(35 + (normalizedUrl.startsWith('https://') ? 12 : 0) + signals.jsonLdTypes.length * 10 + (signals.textLength > 1200 ? 16 : 0));
  const visibilityScore = clamp(25 + entityClarityScore * 0.3 + citationReadinessScore * 0.25 + answerCoverageScore * 0.3 + marketDepth * 3);
  const overallScore = clamp(visibilityScore * 0.28 + entityClarityScore * 0.22 + citationReadinessScore * 0.18 + answerCoverageScore * 0.22 + technicalReadinessScore * 0.1);
  const scores = { entityClarityScore, citationReadinessScore, answerCoverageScore, technicalReadinessScore, visibilityScore };
  const issues = buildIssues(input, signals, scores);

  return {
    url: input.url,
    normalizedUrl,
    overallScore,
    visibilityScore,
    entityClarityScore,
    citationReadinessScore,
    answerCoverageScore,
    technicalReadinessScore,
    extractedSignals: signals,
    issues,
    recommendations: [
      'Create a canonical entity profile that names the brand, products, service lanes, proof, and target markets.',
      'Turn priority buyer questions into short answer blocks with facts, citations, and next-step CTAs.',
      'Add JSON-LD schema for Organization, Product, FAQPage, Article, and Service pages where appropriate.',
      'Publish supporting proof pages that AI retrieval systems can cite consistently.',
    ],
    nextActions: issues.slice(0, 5).map((issue) => issue.fix),
  };
}

export function compareGeoAudits(current: GeoAuditResult, previous: GeoAuditResult): {
  delta: number;
  improved: boolean;
  changedScores: Record<string, number>;
} {
  const changedScores = {
    overallScore: current.overallScore - previous.overallScore,
    visibilityScore: current.visibilityScore - previous.visibilityScore,
    entityClarityScore: current.entityClarityScore - previous.entityClarityScore,
    citationReadinessScore: current.citationReadinessScore - previous.citationReadinessScore,
    answerCoverageScore: current.answerCoverageScore - previous.answerCoverageScore,
  };
  return {
    delta: changedScores.overallScore,
    improved: changedScores.overallScore > 0,
    changedScores,
  };
}
