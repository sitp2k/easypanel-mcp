/**
 * EasyPanel API Types
 */

export interface AuthResponse {
  token: string;
}

export interface Project {
  name: string;
  createdAt?: string;
}

export interface AppService {
  type: 'app';
  projectName: string;
  name: string;
  enabled: boolean;
  env?: string;
  image?: string;
  domains?: Domain[];
}

export interface RedisService {
  type: 'redis';
  projectName: string;
  name: string;
  image: string;
  enabled: boolean;
  exposedPort: number;
  password: string;
  env?: string;
  command?: string;
}

export interface MySQLService {
  type: 'mysql';
  projectName: string;
  name: string;
  image: string;
  databaseName: string;
  user: string;
  password: string;
  rootPassword: string;
}

export interface PostgresService {
  type: 'postgres';
  projectName: string;
  name: string;
  image: string;
  databaseName: string;
  user: string;
  password: string;
}

export interface Domain {
  host: string;
  id?: string;
  https?: boolean;
  port?: number;
  sslCertificate?: SLCertificate;
  createdAt?: string;
}

export interface DomainConfiguration {
  host: string;
  port: number;
  https: boolean;
  sslCertificate?: SLCertificate;
  customHeaders?: Record<string, string>;
  path?: string;
  domain?: string;
  sslEmail?: string;
}

export interface SLCertificate {
  id: string;
  domain: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  status: 'active' | 'expired' | 'pending' | 'failed';
  autoRenew: boolean;
  type: 'letsencrypt' | 'custom';
  createdAt?: string;
}

export interface DomainValidationResult {
  domain: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  dnsRecords?: DNSRecord[];
}

export interface DNSRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV';
  name: string;
  value: string;
  ttl?: number;
  priority?: number;
}

export interface ServiceStats {
  cpu: {
    percent: number;
  };
  memory: {
    usage: number;
    percent: number;
  };
  network: {
    in: number;
    out: number;
  };
}

export interface ProjectWithServices {
  project: Project;
  services: (AppService | RedisService | MySQLService | PostgresService)[];
}

export type ServiceType = 'app' | 'redis' | 'mysql' | 'postgres' | 'mongo' | 'mariadb';

export interface TRPCRequest<T = unknown> {
  json: T;
}

export interface TRPCResponse<T = unknown> {
  result: {
    data: {
      json: T;
    };
  };
}

export interface TRPCError {
  error: {
    code: string;
    message: string;
    httpStatus: number;
    path: string;
  };
}

// Timeout configurations per operation type
export interface TimeoutConfig {
  deploy: number; // 5 minutes for deploy operations
  create: number; // 2 minutes for create operations
  default: number; // 30 seconds for other operations
}

// Retry configuration
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // Base delay in milliseconds
  maxDelay: number; // Maximum delay in milliseconds
  backoffFactor: number; // Exponential backoff factor
}

// Build status for async deploy
export interface BuildStatus {
  id: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  startTime?: string;
  endTime?: string;
  logs?: string[];
  error?: string;
}

// Deploy response
export interface DeployResponse {
  buildId: string;
  message: string;
  status: BuildStatus['status'];
}

// ==================== LOG TYPES ====================

export interface ContainerLog {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  container?: string;
  service?: string;
  stream?: 'stdout' | 'stderr';
}

export interface LogOptions {
  since?: string | Date;  // ISO string or Date object
  until?: string | Date;  // ISO string or Date object
  lines?: number;         // Number of lines to retrieve (default: 100)
  follow?: boolean;       // Follow log stream (for streaming)
  timestamps?: boolean;   // Include timestamps (default: true)
  filters?: {
    level?: ContainerLog['level'][];
    search?: string;     // Search term in messages
  };
}

export interface LogStreamResponse {
  service: string | any;
  logs: ContainerLog[];
  hasMore: boolean;
  cursor?: string;
  websocketUrl?: string;
  message?: string;
  totalMatches?: number;
  query?: string;
  instructions?: any;
  error?: string;
}

export interface LogSearchResult {
  service: string;
  totalMatches: number;
  logs: ContainerLog[];
  query: string;
}

// License and User types
export interface UserInfo {
  id: string;
  email: string;
  name?: string;
  role: 'admin' | 'user';
  createdAt: string;
  lastLogin?: string;
  plan?: string;
  permissions?: string[];
  isSubscribed?: boolean;
  subscription?: any;
  projectCount?: number;
  isAtProjectLimit?: boolean;
  planType?: string;
  needsUpgrade?: boolean;
  projects?: any[];
  fallback?: boolean;
  error?: string;
}

export interface LicensePayload {
  type: string;
  status: 'active' | 'inactive' | 'expired' | 'trial' | 'premium';
  expiresAt?: string;
  features: string[];
  limits?: {
    projects?: number;
    services?: number;
    domains?: number;
    bandwidth?: string;
    storage?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface LicenseActivationRequest {
  type: string;
  key?: string;
  token?: string;
  metadata?: Record<string, unknown>;
}

export interface LicenseActivationResponse {
  success: boolean;
  license?: LicensePayload;
  message?: string;
  error?: string;
}
