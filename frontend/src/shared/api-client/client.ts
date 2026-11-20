import type { ZodType, ZodTypeDef } from 'zod';
import { createUuid } from '../lib/uuid';
import { toApiError } from './envelope';
import { ContractError } from './errors';
import { createFetchTransport, type HttpMethod, type HttpRequest, type HttpResponse, type HttpTransport } from './transport';

export type QueryParamValue = string | number | boolean | null | undefined | string[];

export interface RequestOptions {
  query?: Record<string, QueryParamValue>;
  body?: unknown;
  idempotencyKey?: string;
  keepalive?: boolean;
  signal?: AbortSignal;
}

export interface ApiResponse<T> {
  status: number;
  data: T;
  headers: Headers;
}

type Schema<T> = ZodType<T, ZodTypeDef, unknown>;

export interface ApiClient {
  get<T>(path: string, schema: Schema<T>, options?: RequestOptions): Promise<ApiResponse<T>>;
  post<T>(path: string, schema: Schema<T>, options?: RequestOptions): Promise<ApiResponse<T>>;
  delete<T>(path: string, schema: Schema<T>, options?: RequestOptions): Promise<ApiResponse<T>>;
}

export interface ApiClientConfig {
  baseUrl: string;
  transport?: HttpTransport;
  createRequestId?: () => string;
}

function appendQuery(params: URLSearchParams, key: string, value: QueryParamValue): void {
  if (value === undefined || value === null || value === '') return;
  if (typeof value === 'object') {
    value.forEach((item) => params.append(key, item));
    return;
  }
  params.append(key, String(value));
}

export function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryParamValue>): string {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => appendQuery(params, key, value));
  const search = params.toString();
  return `${baseUrl}${path}${search ? `?${search}` : ''}`;
}

function buildHeaders(requestId: string, hasBody: boolean, idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Request-Id': requestId };
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  return headers;
}

function buildRequest(config: ApiClientConfig, method: HttpMethod, path: string, options: RequestOptions): HttpRequest {
  const hasBody = options.body !== undefined;
  const requestId = (config.createRequestId ?? createUuid)();
  return {
    method,
    url: buildUrl(config.baseUrl, path, options.query),
    headers: buildHeaders(requestId, hasBody, options.idempotencyKey),
    body: hasBody ? JSON.stringify(options.body) : undefined,
    keepalive: options.keepalive,
    signal: options.signal,
  };
}

function parseBody<T>(schema: Schema<T>, path: string, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ContractError(path, result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  return result.data;
}

function toResult<T>(response: HttpResponse, schema: Schema<T>, path: string): ApiResponse<T> {
  if (response.status < 200 || response.status >= 300) throw toApiError(response.status, response.body, response.headers);
  return { status: response.status, headers: response.headers, data: parseBody(schema, path, response.body) };
}

/** Adapter: typed success or typed ApiError/NetworkError/ContractError, never a raw Response. */
export function createApiClient(config: ApiClientConfig): ApiClient {
  const transport = config.transport ?? createFetchTransport();
  const execute =
    <T>(method: HttpMethod) =>
    async (path: string, schema: Schema<T>, options: RequestOptions = {}): Promise<ApiResponse<T>> =>
      toResult(await transport.send(buildRequest(config, method, path, options)), schema, path);
  return {
    get: execute('GET'),
    post: execute('POST'),
    delete: execute('DELETE'),
  };
}
