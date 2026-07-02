interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Diffbot MCP — Knowledge Graph company enrichment + web content extraction (diffbot.com)
 *
 * Tools:
 * - diffbot_company: enrich a company from the Diffbot Knowledge Graph (employees, revenue, industry).
 * - diffbot_extract: extract structured content (title, text, author) from any URL.
 *
 * Auth: BYO Diffbot token. Pass _apiKey — sent as the `token` query param on every request.
 * Free tier is 10,000 credits (no card) at diffbot.com.
 */


const KG_ENHANCE_URL = 'https://kg.diffbot.com/kg/v3/enhance';
const ANALYZE_URL = 'https://api.diffbot.com/v3/analyze';

const tools: McpToolExport['tools'] = [
  {
    name: 'diffbot_company',
    description:
      'Look up company details (employees, revenue, industry) for <name> — enrich a company from the Diffbot Knowledge Graph. Returns description, homepage, employee count, revenue, industries, founding date, HQ location, CEO, and Twitter. Example: diffbot_company({ name: "Stripe", _apiKey: "your-token" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Company name to enrich, e.g. "Stripe". Required unless `url` is given.',
        },
        url: {
          type: 'string',
          description: 'Optional company homepage URL to disambiguate the match, e.g. "https://stripe.com"',
        },
        _apiKey: {
          type: 'string',
          description: 'Diffbot API token (free 10,000-credit tier, no card, at diffbot.com)',
        },
      },
      required: ['_apiKey'],
    },
  },
  {
    name: 'diffbot_extract',
    description:
      'Extract the structured content (title, text, author) from <url> — Diffbot analyzes any web page and returns its type, title, cleaned body text, author, publish date, site name, and language. Example: diffbot_extract({ url: "https://example.com/article", _apiKey: "your-token" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The URL to extract structured content from, e.g. "https://example.com/article"',
        },
        _apiKey: {
          type: 'string',
          description: 'Diffbot API token (free 10,000-credit tier, no card, at diffbot.com)',
        },
      },
      required: ['url', '_apiKey'],
    },
  },
];

/**
 * Shared GET helper. Builds URLSearchParams with token + params, fetches, and
 * normalizes Diffbot's two failure modes:
 *  - non-2xx HTTP  → `Diffbot <tool> error: HTTP <status>`
 *  - 2xx with an `error`/`errorCode` field in the JSON body → `Diffbot <tool>: <error>`
 */
async function diffbotGet(
  baseUrl: string,
  params: Record<string, string>,
  apiKey: string,
  tool: string,
): Promise<Record<string, unknown>> {
  const search = new URLSearchParams({ token: apiKey, ...params });
  const res = await fetch(`${baseUrl}?${search}`);
  if (!res.ok) {
    throw new Error(`Diffbot ${tool} error: HTTP ${res.status}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  if (data.error || data.errorCode) {
    throw new Error(`Diffbot ${tool}: ${data.error ?? data.errorCode}`);
  }
  return data;
}

function requireKey(apiKey: string | undefined): string {
  if (!apiKey) {
    throw new Error(
      'Diffbot requires an API token. Pass your Diffbot token via _apiKey — the free tier gives 10,000 credits with no card at diffbot.com.',
    );
  }
  return apiKey;
}

function truncate(text: unknown, max: number): string | null {
  if (typeof text !== 'string' || !text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Diffbot represents linked entities (ceo, etc.) as objects carrying a `name`.
function displayName(v: unknown): string | null {
  if (typeof v === 'string') return v || null;
  if (v && typeof v === 'object') {
    const name = (v as Record<string, unknown>).name;
    if (typeof name === 'string') return name || null;
  }
  return null;
}

async function companyEnrich(args: Record<string, unknown>, apiKey: string) {
  const name = args.name as string | undefined;
  const url = args.url as string | undefined;
  if (!name && !url) {
    throw new Error('diffbot_company requires a `name` (e.g. "Stripe") or a company `url`.');
  }

  const params: Record<string, string> = { type: 'Organization' };
  if (name) params.name = name;
  if (url) params.url = url;

  const data = await diffbotGet(KG_ENHANCE_URL, params, apiKey, 'diffbot_company');

  // Enhance returns `data` = array of match candidates; each wraps the matched
  // record under `.entity`. We take the top candidate's entity and map it, with
  // every nested field guarded (Diffbot omits most fields for smaller orgs).
  const candidates = Array.isArray(data.data) ? (data.data as Array<Record<string, unknown>>) : [];
  if (candidates.length === 0) {
    return { query: name ?? url, match: null, note: 'No Knowledge Graph match found.' };
  }

  const entity = (candidates[0]?.entity ?? {}) as Record<string, unknown>;
  const revenue = (entity.revenue ?? {}) as Record<string, unknown>;
  const location = (entity.location ?? {}) as Record<string, unknown>;
  const city = (location.city ?? {}) as Record<string, unknown>;
  const founding = entity.foundingDate as Record<string, unknown> | string | undefined;

  return {
    query: name ?? url,
    match: {
      name: (entity.name as string) ?? null,
      description: truncate(entity.description, 400),
      homepage: (entity.homepageUri as string) ?? null,
      nbEmployees: (entity.nbEmployees as number) ?? null,
      revenue: (revenue.value as number) ?? null,
      industries: Array.isArray(entity.industries) ? entity.industries : null,
      foundingDate:
        founding && typeof founding === 'object'
          ? ((founding as Record<string, unknown>).str as string) ?? null
          : (founding as string) ?? null,
      location: (city.name as string) ?? (location.name as string) ?? null,
      ceo: displayName(entity.ceo),
      twitterUri: (entity.twitterUri as string) ?? null,
    },
  };
}

async function extract(args: Record<string, unknown>, apiKey: string) {
  const url = args.url as string | undefined;
  if (!url) {
    throw new Error('diffbot_extract requires a `url` to analyze (e.g. "https://example.com/article").');
  }

  const data = await diffbotGet(ANALYZE_URL, { url }, apiKey, 'diffbot_extract');

  const objects = Array.isArray(data.objects) ? (data.objects as Array<Record<string, unknown>>) : [];
  if (objects.length === 0) {
    return { url, content: null, note: 'Diffbot returned no extractable objects for this URL.' };
  }

  const obj = objects[0];
  return {
    url,
    content: {
      type: (obj.type as string) ?? null,
      title: (obj.title as string) ?? null,
      text: truncate(obj.text, 1000),
      author: (obj.author as string) ?? null,
      date: (obj.date as string) ?? null,
      siteName: (obj.siteName as string) ?? null,
      pageUrl: (obj.pageUrl as string) ?? null,
      humanLanguage: (obj.humanLanguage as string) ?? null,
    },
  };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = requireKey(args._apiKey as string | undefined);
  delete args._apiKey;

  switch (name) {
    case 'diffbot_company':
      return companyEnrich(args, apiKey);
    case 'diffbot_extract':
      return extract(args, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
