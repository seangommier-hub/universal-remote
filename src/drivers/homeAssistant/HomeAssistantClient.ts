import { fetchWithTimeout } from "../../core/network/fetchWithTimeout";

const DEFAULT_HOME_ASSISTANT_PORT = 8123;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const HOST_HAS_PORT_PATTERN = /^[^/]+:\d+(\/|$)/;

export interface HomeAssistantConfig {
  baseUrl: string;
  token: string;
}

/** One entity as returned by GET /api/states. */
export interface HomeAssistantEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

/** A Home Assistant request that failed; `status` is 0 when no HTTP response arrived. */
export class HomeAssistantApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "HomeAssistantApiError";
  }
}

/** Turns what a person typed ("homeassistant.local", "192.168.1.5:8123/") into a base URL with a scheme and port. */
export function normalizeHomeAssistantUrl(input: string): string {
  let url = input.trim();
  if (!SCHEME_PATTERN.test(url)) {
    url = `http://${HOST_HAS_PORT_PATTERN.test(url) ? url : `${url.replace(/\/+$/, "")}:${DEFAULT_HOME_ASSISTANT_PORT}`}`;
  }
  return url.replace(/\/+$/, "").replace(/\/api$/i, "");
}

function describeFailure(status: number, path: string): string {
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) return "Home Assistant rejected the access token. Create a new long-lived access token and try again.";
  if (status === HTTP_NOT_FOUND) return `Home Assistant does not know ${path}`;
  return `Home Assistant returned ${status}`;
}

/** Thin REST client for one Home Assistant server; the token is only ever placed in the Authorization header, never in a URL or log. */
export class HomeAssistantClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: HomeAssistantConfig) {
    this.baseUrl = normalizeHomeAssistantUrl(config.baseUrl);
    this.token = config.token;
  }

  /** Every entity Home Assistant currently knows about. */
  async getStates(): Promise<HomeAssistantEntity[]> {
    return this.request<HomeAssistantEntity[]>("/api/states");
  }

  /** The current state of one entity. */
  async getEntity(entityId: string): Promise<HomeAssistantEntity> {
    return this.request<HomeAssistantEntity>(`/api/states/${encodeURIComponent(entityId)}`);
  }

  /** Calls POST /api/services/<domain>/<service> with the given service data. */
  async callService(domain: string, service: string, data: Record<string, unknown>): Promise<void> {
    await this.request(`/api/services/${domain}/${service}`, { method: "POST", body: JSON.stringify(data) });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" };
    const response = await fetchWithTimeout(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) throw new HomeAssistantApiError(describeFailure(response.status, path), response.status);
    return (await response.json()) as T;
  }
}
