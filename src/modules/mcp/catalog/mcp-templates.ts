import { McpConfig } from '../types';

export type McpCategory = 'dev' | 'design' | 'data' | 'search' | 'marketing' | 'cloud' | 'productivity' | 'payments' | 'browser' | 'filesystem';
export type McpRisk = 'low' | 'medium' | 'high';
export type McpAuth = 'none' | 'env' | 'oauth';
export type McpMutationPolicy = 'read-only' | 'approval-required' | 'blocked-by-default';
export interface McpTemplateCapabilities {
  tools: boolean;
  resources: boolean;
  prompts: boolean;
}

export interface McpTemplate {
  id: string;
  name: string;
  description: string;
  category: McpCategory;
  risk: McpRisk;
  environments: string[];
  capabilities: McpTemplateCapabilities;
  auth: McpAuth;
  mutationPolicy: McpMutationPolicy;
  readiness?: string;
  config: McpConfig;
  credentials: {
    name: string;
    envVar: string;
    placeholder: string;
    required: boolean;
    isArg?: boolean;
  }[];
}

type LegacyMcpRisk = 'read' | 'write' | 'external' | 'account' | 'spend';
type RawMcpTemplate = Omit<McpTemplate, 'risk' | 'environments' | 'capabilities' | 'auth' | 'mutationPolicy'> & {
  risk?: McpRisk | LegacyMcpRisk;
  environments?: string[];
  capabilities?: Partial<McpTemplateCapabilities>;
  auth?: McpAuth;
  mutationPolicy?: McpMutationPolicy;
};

function normalizeRisk(risk: RawMcpTemplate['risk']): McpRisk {
  switch (risk) {
  case 'low':
  case 'medium':
  case 'high':
    return risk;
  case 'read':
    return 'low';
  case 'account':
  case 'spend':
    return 'high';
  case 'write':
  case 'external':
  default:
    return 'medium';
  }
}

function defaultMutationPolicy(risk: McpRisk, legacyRisk: RawMcpTemplate['risk']): McpMutationPolicy {
  if (legacyRisk === 'read' || risk === 'low') return 'read-only';
  if (risk === 'high') return 'blocked-by-default';
  return 'approval-required';
}

function defaultAuth(template: RawMcpTemplate): McpAuth {
  if (template.credentials.some((cred) => cred.required && !cred.isArg)) return 'env';
  if (template.config.type === 'http' && template.config.endpoint && !template.config.endpoint.includes('127.0.0.1')) return 'oauth';
  return 'none';
}

function normalizeTemplate(template: RawMcpTemplate): McpTemplate {
  const risk = normalizeRisk(template.risk);
  return {
    ...template,
    risk,
    environments: template.environments?.length ? template.environments : ['engineering'],
    capabilities: {
      tools: template.capabilities?.tools ?? true,
      resources: template.capabilities?.resources ?? false,
      prompts: template.capabilities?.prompts ?? false,
    },
    auth: template.auth ?? defaultAuth(template),
    mutationPolicy: template.mutationPolicy ?? defaultMutationPolicy(risk, template.risk),
  };
}

function normalizeTemplates(templates: Record<string, RawMcpTemplate>): Record<string, McpTemplate> {
  return Object.fromEntries(
    Object.entries(templates).map(([id, template]) => [id, normalizeTemplate(template)]),
  );
}

const RAW_MCP_TEMPLATES: Record<string, RawMcpTemplate> = {
  // ===== DEV TOOLS =====
  github: {
    id: 'github',
    name: 'GitHub',
    description: 'Acesse repos, issues, PRs',
    category: 'dev',
    environments: ['engineering'],
    risk: 'write',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {},
    },
    credentials: [
      {
        name: 'GitHub Token',
        envVar: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        placeholder: 'ghp_...',
        required: true,
      },
    ],
  },

  linear: {
    id: 'linear',
    name: 'Linear',
    description: 'Gerencie issues e projetos',
    category: 'dev',
    environments: ['engineering'],
    risk: 'write',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@larryhudson/linear-mcp-server'],
      env: {},
    },
    credentials: [
      {
        name: 'Linear API Key',
        envVar: 'LINEAR_API_KEY',
        placeholder: 'lin_api_...',
        required: true,
      },
    ],
  },

  jira: {
    id: 'jira',
    name: 'Jira',
    description: 'Gerencie issues e sprints',
    category: 'dev',
    environments: ['engineering'],
    risk: 'write',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@aashari/mcp-server-atlassian-jira'],
      env: {},
    },
    credentials: [
      {
        name: 'Jira Host',
        envVar: 'JIRA_HOST',
        placeholder: 'empresa.atlassian.net',
        required: true,
      },
      {
        name: 'Jira Email',
        envVar: 'JIRA_EMAIL',
        placeholder: 'você@empresa.com',
        required: true,
      },
      {
        name: 'Jira API Token',
        envVar: 'JIRA_API_TOKEN',
        placeholder: 'ATATT...',
        required: true,
      },
    ],
  },

  sentry: {
    id: 'sentry',
    name: 'Sentry',
    description: 'Monitore erros e performance',
    category: 'dev',
    environments: ['engineering'],
    risk: 'external',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@sentry/mcp-server'],
      env: {
        EMBEDDED_AGENT_PROVIDER: 'anthropic',
      },
    },
    credentials: [
      {
        name: 'Sentry Access Token',
        envVar: 'SENTRY_ACCESS_TOKEN',
        placeholder: 'sntrys_...',
        required: true,
      },
    ],
  },

  docker: {
    id: 'docker',
    name: 'Docker',
    description: 'Gerencie containers e images',
    category: 'dev',
    environments: ['engineering'],
    risk: 'write',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@0xshariq/docker-mcp-server'],
      env: {},
    },
    credentials: [],
  },

  // ===== DESIGN =====
  figma: {
    id: 'figma',
    name: 'Figma Desktop',
    description: 'Acesse designs via app desktop local (sem OAuth)',
    category: 'design',
    environments: ['design'],
    risk: 'low',
    capabilities: { tools: true, resources: true, prompts: true },
    auth: 'none',
    mutationPolicy: 'approval-required',
    readiness: 'Requires Figma Desktop with Dev Mode and the local MCP server enabled at http://127.0.0.1:3845/mcp. Write-to-canvas actions require approval.',
    config: {
      type: 'http',
      endpoint: 'http://127.0.0.1:3845/mcp',
    },
    credentials: [],
  },

  'figma-remote': {
    id: 'figma-remote',
    name: 'Figma Remote (OAuth)',
    description: 'Servidor remoto Figma — requer cliente pré-aprovado',
    category: 'design',
    environments: ['design'],
    risk: 'medium',
    capabilities: { tools: true, resources: true, prompts: true },
    auth: 'oauth',
    mutationPolicy: 'approval-required',
    readiness: 'Requires Figma OAuth client approval or an approved remote MCP proxy. Write-to-canvas actions require approval.',
    config: {
      type: 'http',
      endpoint: 'https://mcp.figma.com/mcp',
    },
    credentials: [],
  },

  // ===== DATA =====
  postgres: {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Consulte bancos de dados',
    category: 'data',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
      env: {},
    },
    credentials: [
      {
        name: 'Database URL',
        envVar: '',
        placeholder: 'postgresql://user:pass@host/db',
        required: true,
        isArg: true,
      },
    ],
  },

  mongodb: {
    id: 'mongodb',
    name: 'MongoDB',
    description: 'Consulte coleções e documentos',
    category: 'data',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@mongodb-js/mongodb-mcp-server'],
      env: {},
    },
    credentials: [
      {
        name: 'Connection String',
        envVar: 'MDB_MCP_CONNECTION_STRING',
        placeholder: 'mongodb+srv://...',
        required: true,
      },
    ],
  },

  redis: {
    id: 'redis',
    name: 'Redis',
    description: 'Cache e key-value store',
    category: 'data',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-redis'],
      env: {},
    },
    credentials: [
      {
        name: 'Redis URL',
        envVar: 'REDIS_URL',
        placeholder: 'redis://localhost:6379',
        required: true,
      },
    ],
  },

  supabase: {
    id: 'supabase',
    name: 'Supabase',
    description: 'Banco de dados e backend',
    category: 'data',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@cloud9-labs/mcp-supabase'],
      env: {},
    },
    credentials: [
      {
        name: 'Supabase URL',
        envVar: 'SUPABASE_URL',
        placeholder: 'https://xyz.supabase.co',
        required: true,
      },
      {
        name: 'Service Key',
        envVar: 'SUPABASE_SERVICE_KEY',
        placeholder: 'eyJ...',
        required: true,
      },
    ],
  },

  // ===== SEARCH =====
  'brave-search': {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Busca na web',
    category: 'search',
    environments: ['marketing'],
    risk: 'external',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: {},
    },
    credentials: [
      {
        name: 'Brave API Key',
        envVar: 'BRAVE_API_KEY',
        placeholder: 'BSA...',
        required: true,
      },
    ],
  },

  exa: {
    id: 'exa',
    name: 'Exa Search',
    description: 'Busca semântica na web',
    category: 'search',
    environments: ['marketing'],
    risk: 'external',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'exa-mcp-server'],
      env: {},
    },
    credentials: [
      {
        name: 'Exa API Key',
        envVar: 'EXA_API_KEY',
        placeholder: 'exa_...',
        required: true,
      },
    ],
  },

  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'Busca com IA',
    category: 'search',
    environments: ['marketing'],
    risk: 'external',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@perplexity-ai/mcp-server'],
      env: {},
    },
    credentials: [
      {
        name: 'Perplexity API Key',
        envVar: 'PERPLEXITY_API_KEY',
        placeholder: 'pplx-...',
        required: true,
      },
    ],
  },

  'meta-ads': {
    id: 'meta-ads',
    name: 'Meta Ads',
    description: 'Analise e gerencie campanhas Meta Ads via Marketing API',
    category: 'marketing',
    environments: ['marketing'],
    risk: 'high',
    capabilities: { tools: true, resources: false, prompts: false },
    auth: 'env',
    mutationPolicy: 'blocked-by-default',
    readiness: 'Configure Meta credentials through environment-backed MCP config. Read-only list/get/insights tools are allowed; create/update/publish/delete/archive actions are blocked by default.',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'meta-ads-mcp'],
      env: {},
    },
    credentials: [
      {
        name: 'Meta Access Token',
        envVar: 'META_ACCESS_TOKEN',
        placeholder: 'EAAB...',
        required: true,
      },
      {
        name: 'Meta App Secret',
        envVar: 'META_APP_SECRET',
        placeholder: 'optional',
        required: false,
      },
    ],
  },

  context7: {
    id: 'context7',
    name: 'Context7',
    description: 'Busca em documentações técnicas',
    category: 'search',
    environments: ['engineering'],
    risk: 'read',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      env: {},
    },
    credentials: [],
  },

  // ===== CLOUD =====
  vercel: {
    id: 'vercel',
    name: 'Vercel',
    description: 'Deploy e gerenciamento',
    category: 'cloud',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@vercel/mcp-adapter'],
      env: {},
    },
    credentials: [],
  },

  cloudflare: {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Workers, KV, R2',
    category: 'cloud',
    config: {
      type: 'http',
      endpoint: 'https://mcp.cloudflare.com',
    },
    credentials: [],
  },

  'aws-s3': {
    id: 'aws-s3',
    name: 'AWS S3',
    description: 'Armazenamento de objetos',
    category: 'cloud',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'aws-s3-mcp'],
      env: {},
    },
    credentials: [
      {
        name: 'Access Key ID',
        envVar: 'AWS_ACCESS_KEY_ID',
        placeholder: 'AKIA...',
        required: true,
      },
      {
        name: 'Secret Access Key',
        envVar: 'AWS_SECRET_ACCESS_KEY',
        placeholder: 'xxx',
        required: true,
      },
      {
        name: 'Region',
        envVar: 'AWS_REGION',
        placeholder: 'us-east-1',
        required: true,
      },
    ],
  },

  // ===== PRODUCTIVITY =====
  slack: {
    id: 'slack',
    name: 'Slack',
    description: 'Envie mensagens e gerencie canais',
    category: 'productivity',
    environments: ['marketing'],
    risk: 'external',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'slack-mcp-server@latest', '--transport', 'stdio'],
      env: {},
    },
    credentials: [
      {
        name: 'Slack Bot Token',
        envVar: 'SLACK_BOT_TOKEN',
        placeholder: 'xoxb-...',
        required: true,
      },
      {
        name: 'Team ID',
        envVar: 'SLACK_TEAM_ID',
        placeholder: 'T...',
        required: true,
      },
    ],
  },

  notion: {
    id: 'notion',
    name: 'Notion',
    description: 'Gerencie páginas e databases',
    category: 'productivity',
    environments: ['marketing'],
    risk: 'write',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
      env: {},
    },
    credentials: [
      {
        name: 'Notion Token',
        envVar: 'NOTION_TOKEN',
        placeholder: 'secret_...',
        required: true,
      },
    ],
  },

  'google-drive': {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Acesse arquivos e pastas (OAuth)',
    category: 'productivity',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-gdrive'],
      env: {},
    },
    credentials: [],
  },

  'google-maps': {
    id: 'google-maps',
    name: 'Google Maps',
    description: 'Geocoding e rotas',
    category: 'productivity',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@googlemaps/code-assist-mcp@latest'],
      env: {},
    },
    credentials: [],
  },

  // ===== PAYMENTS =====
  stripe: {
    id: 'stripe',
    name: 'Stripe',
    description: 'Pagamentos e assinaturas',
    category: 'payments',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@stripe/mcp', '--tools=all'],
      env: {},
    },
    credentials: [
      {
        name: 'Stripe Secret Key',
        envVar: 'STRIPE_SECRET_KEY',
        placeholder: 'sk_test_... ou rk_...',
        required: true,
      },
    ],
  },

  twilio: {
    id: 'twilio',
    name: 'Twilio',
    description: 'SMS e chamadas',
    category: 'payments',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@twilio-alpha/mcp'],
      env: {},
    },
    credentials: [
      {
        name: 'Account SID',
        envVar: '',
        placeholder: 'AC...',
        required: true,
        isArg: true,
      },
      {
        name: 'API Key:Secret',
        envVar: '',
        placeholder: 'SK...:...',
        required: true,
        isArg: true,
      },
    ],
  },

  // ===== BROWSER =====
  puppeteer: {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Automação de browser',
    category: 'browser',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
      env: {},
    },
    credentials: [],
  },

  // ===== FILESYSTEM =====
  filesystem: {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Acesse arquivos locais',
    category: 'filesystem',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      env: {},
    },
    credentials: [
      {
        name: 'Diretório permitido',
        envVar: '',
        placeholder: '/caminho/para/diretório',
        required: true,
        isArg: true,
      },
    ],
  },
};

export const MCP_TEMPLATES: Record<string, McpTemplate> = normalizeTemplates(RAW_MCP_TEMPLATES);

export function getTemplatesByCategory(category: McpCategory): McpTemplate[] {
  return Object.values(MCP_TEMPLATES).filter(t => t.category === category);
}

export function getAllTemplates(): McpTemplate[] {
  return Object.values(MCP_TEMPLATES);
}

export function getTemplate(id: string): McpTemplate | undefined {
  return MCP_TEMPLATES[id];
}
