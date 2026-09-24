import { z } from "zod";

const emptyAsUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalUrl = z.preprocess(emptyAsUndefined, z.string().url().optional());
const optionalSecret = z.preprocess(emptyAsUndefined, z.string().min(1).optional());

export const apiEnvironmentSchema = z.object({
  COLLECTION_MODE: z.enum(["demand", "worker"]).default("demand"),
  COLLECTOR_RUN_RETENTION_DAYS: z.coerce.number().int().min(7).max(365).default(30),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  HOMEBASE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().optional(),
  DOCKER_PROXY_URL: optionalUrl,
  DOCKER_EXPECTED_DOWN_NAMES: z.string().default(""),
  DOCKER_RESTART_WARNING_COUNT: z.coerce.number().int().positive().default(5),
  UPTIME_KUMA_BASE_URL: optionalUrl,
  UPTIME_KUMA_API_KEY: optionalSecret,
  SERVICE_REFRESH_SECONDS: z.coerce.number().int().min(15).max(3600).default(60),
  PIHOLE_BASE_URL: optionalUrl,
  PIHOLE_APP_PASSWORD: optionalSecret,
  PLEX_BASE_URL: optionalUrl,
  PLEX_TOKEN: optionalSecret,
  PLEX_REFRESH_SECONDS: z.coerce.number().int().min(5).max(300).default(15),
  HOME_ASSISTANT_BASE_URL: optionalUrl,
  HOME_ASSISTANT_TOKEN: optionalSecret,
  HOMEBASE_TIMEZONE: z.string().default("America/New_York"),
  FAMILY_CALENDAR_DAYS: z.coerce.number().int().min(1).max(366).default(92),
  FAMILY_REFRESH_SECONDS: z.coerce.number().int().min(60).max(3600).default(120),
  TAILSCALE_STATUS_URL: optionalUrl,
  HOME_SYSTEM_REFRESH_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
  CISA_KEV_URL: z
    .string()
    .url()
    .default("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"),
  NVD_CVE_URL: z.string().url().default("https://services.nvd.nist.gov/rest/json/cves/2.0"),
  NVD_API_KEY: optionalSecret,
  SECURITY_LOOKBACK_DAYS: z.coerce.number().int().min(1).max(120).default(30),
  SECURITY_MAX_ADVISORIES: z.coerce.number().int().min(10).max(500).default(100),
  SECURITY_REFRESH_SECONDS: z.coerce.number().int().min(900).max(86400).default(21600),
  CAREER_JSEARCH_API_KEY: optionalSecret,
  CAREER_GREENHOUSE_BOARDS: z
    .string()
    .default("gitlab:GitLab,cloudflare:Cloudflare,canonical:Canonical,datadog:Datadog,elastic:Elastic"),
  CAREER_LEVER_BOARDS: z.string().default("spotify:Spotify,wealthsimple:Wealthsimple,palantir:Palantir"),
  CAREER_ASHBY_BOARDS: z.string().default("vanta:Vanta,ramp:Ramp,notion:Notion"),
  CAREER_MOCK_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  CAREER_MAX_JOBS: z.coerce.number().int().min(10).max(500).default(150),
  CAREER_REFRESH_SECONDS: z.coerce.number().int().min(900).max(86400).default(21600),
  GAMES_LEAGUE_URL: z
    .preprocess(emptyAsUndefined, z.string().url().optional())
    .default("https://www.leagueoflegends.com/en-us/news/tags/patch-notes/"),
  GAMES_LEAGUE_COMMUNITY_URL: z
    .preprocess(emptyAsUndefined, z.string().url().optional())
    .default("https://www.reddit.com/r/summonerschool/"),
  GAMES_DEADLOCK_URL: z
    .preprocess(emptyAsUndefined, z.string().url().optional())
    .default("https://forums.playdeadlock.com/forums/changelog.10/"),
  GAMES_REFRESH_SECONDS: z.coerce.number().int().min(900).max(86400).default(21600),
  PROXMOX_BASE_URL: optionalUrl,
  PROXMOX_TOKEN_ID: optionalSecret,
  PROXMOX_TOKEN_SECRET: optionalSecret,
  PROXMOX_TLS_VERIFY: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  PROXMOX_STORAGE_WARNING_PERCENT: z.coerce.number().min(1).max(100).default(80),
  PROXMOX_CPU_WARNING_PERCENT: z.coerce.number().min(1).max(100).default(90),
  PROXMOX_MEMORY_WARNING_PERCENT: z.coerce.number().min(1).max(100).default(90),
  PROXMOX_EXPECTED_DOWN_IDS: z.string().default(""),
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
