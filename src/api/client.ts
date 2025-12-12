/**
 * EasyPanel API Client
 * Handles authentication and all tRPC API calls
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { promisify } from 'util';
import { exec } from 'child_process';
import dns from 'dns';
import os from 'os';
import {
  AuthResponse,
  TRPCRequest,
  TRPCResponse,
  TRPCError,
  TimeoutConfig,
  RetryConfig,
  BuildStatus,
  DeployResponse,
  ContainerLog,
  LogOptions,
  LogStreamResponse,
  LogSearchResult,
  Domain,
  DomainConfiguration,
  DomainValidationResult,
  SLCertificate,
  UserInfo,
  LicensePayload,
  LicenseActivationRequest,
  LicenseActivationResponse,
} from '../types/easypanel.js';
import { getPlanDetector } from '../utils/planDetection.js';
import { UpgradeTipFormatter } from '../utils/upgradeTips.js';
import {
  validateProjectServiceName,
  validateDockerImage,
  validateUrl,
  validateGitRepo,
  validateEnvVar,
  parseAndValidateEnvVars,
  validateDomain,
  validateEmail,
  validateMemoryLimit,
  validateCpuLimit,
  validateDockerfilePath,
  validateGitRef,
} from '../utils/validation.js';
import { ValidationError } from '../utils/errors.js';

const execAsync = promisify(exec);

// Global type declarations for browser environment
interface GlobalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

interface GlobalThisExtended {
  window?: {
    localStorage: GlobalStorage;
    sessionStorage: GlobalStorage;
  };
}

declare const globalThis: GlobalThisExtended;

declare const window: {
  localStorage: GlobalStorage;
  sessionStorage: GlobalStorage;
} | undefined;

// Error categories
export enum ErrorCategory {
  TIMEOUT = 'TIMEOUT',
  AUTHENTICATION = 'AUTHENTICATION',
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  EASYPANEL_API = 'EASYPANEL_API',
  UNKNOWN = 'UNKNOWN',
}

// EasyPanel specific error class
export class EasyPanelError extends Error {
  public readonly category: ErrorCategory;
  public readonly operation?: string;
  public readonly suggestions: string[];
  public readonly originalError?: Error;
  public readonly statusCode?: number;
  public readonly retryable: boolean;
  public readonly cacheHints?: string[];

  constructor({
    message,
    category,
    operation,
    suggestions = [],
    originalError,
    statusCode,
    retryable = false,
    cacheHints,
  }: {
    message: string;
    category: ErrorCategory;
    operation?: string;
    suggestions?: string[];
    originalError?: Error;
    statusCode?: number;
    retryable?: boolean;
    cacheHints?: string[];
  }) {
    super(message);
    this.name = 'EasyPanelError';
    this.category = category;
    this.operation = operation;
    this.suggestions = suggestions;
    this.originalError = originalError;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.cacheHints = cacheHints;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EasyPanelError);
    }
  }

  /**
   * Get formatted error message with suggestions
   */
  getFormattedMessage(): string {
    let message = this.message;

    if (this.operation) {
      message = `[${this.operation}] ${message}`;
    }

    if (this.suggestions.length > 0) {
      message += '\n\nSuggestions:';
      this.suggestions.forEach((suggestion, index) => {
        message += `\n  ${index + 1}. ${suggestion}`;
      });
    }

    if (this.cacheHints && this.cacheHints.length > 0) {
      message += '\n\nCache hints:';
      this.cacheHints.forEach(hint => {
        message += `\n  - ${hint}`;
      });
    }

    return message;
  }

  /**
   * Check if error is network-related
   */
  isNetworkError(): boolean {
    return this.category === ErrorCategory.NETWORK || this.category === ErrorCategory.TIMEOUT;
  }

  /**
   * Check if error is auth-related
   */
  isAuthError(): boolean {
    return this.category === ErrorCategory.AUTHENTICATION;
  }

  /**
   * Check if error is validation-related
   */
  isValidationError(): boolean {
    return this.category === ErrorCategory.VALIDATION;
  }
}

// Cache entry interface
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// Cache statistics interface
interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  totalSize: number;
}

export class EasyPanelClient {
  private client: AxiosInstance;
  private token: string | null = null;
  private baseUrl: string;
  private email: string;
  private password: string;
  private planDetector = getPlanDetector();

  // ==================== ERROR HANDLING ====================

  /**
   * Extract operation name from axios config
   */
  private extractOperationFromConfig(config?: any): string | undefined {
    if (!config) return undefined;

    // Extract from URL
    if (config.url) {
      const match = config.url.match(/\/api\/trpc\/(.+?)(\?|$)/);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Create enhanced EasyPanelError from axios error
   */
  private createError(
    error: AxiosError<TRPCError>,
    category?: ErrorCategory,
    operation?: string
  ): EasyPanelError {
    const status = error.response?.status;
    const errorData = error.response?.data;
    const originalMessage = errorData?.error?.message || error.message;

    // Determine category if not provided
    if (!category) {
      category = this.categorizeError(error, status);
    }

    // Build context-aware suggestions
    const suggestions = this.buildSuggestions(category, status, operation, originalMessage);

    // Build cache hints if relevant
    const cacheHints = this.buildCacheHints(category, operation);

    // Build descriptive message
    const message = this.buildErrorMessage(category, originalMessage, status, operation);

    return new EasyPanelError({
      message,
      category,
      operation,
      suggestions,
      originalError: error,
      statusCode: status,
      retryable: this.isRetryableError(category, status),
      cacheHints,
    });
  }

  /**
   * Categorize error based on type and status
   */
  private categorizeError(error: AxiosError<TRPCError>, status?: number): ErrorCategory {
    // Timeout errors
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return ErrorCategory.TIMEOUT;
    }

    // Network errors
    if (!error.response && error.code !== 'ECONNABORTED') {
      return ErrorCategory.NETWORK;
    }

    // HTTP status based categorization
    if (status) {
      if (status === 401 || status === 403) {
        return ErrorCategory.AUTHENTICATION;
      }
      if (status >= 400 && status < 500) {
        if (status === 422 || status === 400) {
          return ErrorCategory.VALIDATION;
        }
        return ErrorCategory.EASYPANEL_API;
      }
      if (status >= 500) {
        return ErrorCategory.EASYPANEL_API;
      }
    }

    // tRPC specific errors
    if (error.response?.data?.error) {
      return ErrorCategory.EASYPANEL_API;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Build suggestions based on error type and context
   */
  private buildSuggestions(category: ErrorCategory, status?: number, operation?: string, originalError?: string): string[] {
    const suggestions: string[] = [];

    // Add upgrade suggestion for limit-related errors
    const plan = this.planDetector.detectPlan();
    if (plan.isFree && plan.confidence > 50 && this.isLimitRelatedError(category, status)) {
      const contextualMessage = UpgradeTipFormatter.createContextualMessage(operation || '', {
        error: originalError,
        projectCount: this.planDetector.getUsage().projectsCreated
      });
      if (contextualMessage) {
        suggestions.push(contextualMessage);
        suggestions.push(`🚀 Upgrade to Premium: https://easypanel.io?aff=7GNAmD`);
      }
    }

    switch (category) {
      case ErrorCategory.TIMEOUT:
        suggestions.push(
          'Check your internet connection',
          'Try increasing the timeout configuration',
          'Large deployments may take longer - consider using waitForDeploy()',
          'Check if the EasyPanel server is responsive'
        );
        break;

      case ErrorCategory.NETWORK:
        suggestions.push(
          'Check your internet connection',
          'Verify the EASYPANEL_URL is correct',
          'Check if the EasyPanel server is running',
          'Try again in a few moments'
        );
        break;

      case ErrorCategory.AUTHENTICATION:
        suggestions.push(
          'Verify EASYPANEL_EMAIL and EASYPANEL_PASSWORD are correct',
          'Check if the token is expired',
          'Ensure the user has sufficient permissions',
          'Try re-authenticating with fresh credentials'
        );
        break;

      case ErrorCategory.VALIDATION:
        suggestions.push(
          'Check the input parameters',
          'Verify project and service names are valid',
          'Ensure required fields are provided',
          'Check for special characters that might need escaping'
        );
        break;

      case ErrorCategory.EASYPANEL_API:
        if (status === 429) {
          suggestions.push(
            'Rate limit exceeded - wait before trying again',
            'Reduce the frequency of requests'
          );
        } else if (status && status >= 500) {
          suggestions.push(
            'EasyPanel server error - check server logs',
            'The issue might be temporary - try again later',
            'Contact EasyPanel support if issue persists'
          );
        } else {
          suggestions.push(
            'Check the EasyPanel API documentation',
            'Verify the operation is supported',
            'Check for recent API changes'
          );
        }
        break;

      default:
        suggestions.push(
          'Check the error message for details',
          'Try the operation again',
          'Contact support if the issue persists'
        );
    }

    // Add operation-specific suggestions
    if (operation) {
      if (operation.includes('deploy')) {
        suggestions.push(
          'Check if the service exists',
          'Verify the deployment source (image, git repo, etc.)',
          'Check build logs for specific errors'
        );
      } else if (operation.includes('domain')) {
        suggestions.push(
          'Verify domain ownership',
          'Check DNS configuration',
          'Ensure SSL certificates are properly configured'
        );
      }
    }

    return suggestions;
  }

  /**
   * Build cache hints for relevant operations
   */
  private buildCacheHints(category: ErrorCategory, operation?: string): string[] | undefined {
    const hints: string[] = [];

    // Only provide cache hints for certain operations
    if (!operation) return undefined;

    // Cache invalidation hints for mutations
    if (operation.includes('create') || operation.includes('update') || operation.includes('destroy')) {
      hints.push('Related cache entries have been invalidated');
      if (operation.includes('project')) {
        hints.push('Project list cache cleared');
      }
      if (operation.includes('deploy')) {
        hints.push('Build status cache will be updated');
      }
    }

    // Cache refresh hints for errors
    if (category === ErrorCategory.NETWORK || category === ErrorCategory.TIMEOUT) {
      hints.push('Cache may contain stale data - consider clearing if needed');
    }

    return hints.length > 0 ? hints : undefined;
  }

  /**
   * Build descriptive error message
   */
  private buildErrorMessage(
    category: ErrorCategory,
    originalMessage: string,
    status?: number,
    operation?: string
  ): string {
    let message = '';

    // Add category-specific prefix
    switch (category) {
      case ErrorCategory.TIMEOUT:
        message = 'Request timed out';
        if (operation?.includes('deploy')) {
          message += ' during deployment';
        }
        break;

      case ErrorCategory.NETWORK:
        message = 'Network connection failed';
        break;

      case ErrorCategory.AUTHENTICATION:
        message = 'Authentication failed';
        if (status === 401) {
          message += ' (unauthorized)';
        } else if (status === 403) {
          message += ' (forbidden)';
        }
        break;

      case ErrorCategory.VALIDATION:
        message = 'Invalid input or parameters';
        break;

      case ErrorCategory.EASYPANEL_API:
        if (status === 429) {
          message = 'Too many requests (rate limited)';
        } else if (status && status >= 500) {
          message = 'EasyPanel server error';
        } else {
          message = 'EasyPanel API error';
        }
        break;

      default:
        message = 'Unexpected error';
    }

    // Add original error message
    if (originalMessage && originalMessage !== message) {
      message += `: ${originalMessage}`;
    }

    return message;
  }

  /**
   * Determine if error is retryable
   */
  private isRetryableError(category: ErrorCategory, status?: number): boolean {
    switch (category) {
      case ErrorCategory.TIMEOUT:
      case ErrorCategory.NETWORK:
        return true;

      case ErrorCategory.EASYPANEL_API:
        return status === 429 || (status !== undefined && status >= 500);

      default:
        return false;
    }
  }

  /**
   * Check if error is likely plan/limit-related
   */
  private isLimitRelatedError(category: ErrorCategory, status?: number): boolean {
    return status === 402 || // Payment Required
           status === 403; // Forbidden (often for premium features)
  }

  /**
   * Log and handle errors consistently
   */
  public handleError(error: unknown, context?: string): void {
    if (error instanceof EasyPanelError) {
      console.error(`[EasyPanel Error] ${error.category}: ${error.getFormattedMessage()}`);
      if (context) {
        console.error(`[Context] ${context}`);
      }
    } else if (error instanceof Error) {
      console.error(`[EasyPanel] Unexpected error: ${error.message}`);
      if (context) {
        console.error(`[Context] ${context}`);
      }
    } else {
      console.error(`[EasyPanel] Unknown error:`, error);
      if (context) {
        console.error(`[Context] ${context}`);
      }
    }
  }

  /**
   * Check if an error requires cache invalidation
   */
  public shouldInvalidateCache(error: unknown): boolean {
    if (error instanceof EasyPanelError) {
      return error.category === ErrorCategory.EASYPANEL_API &&
             (error.statusCode === 401 || error.statusCode === 403);
    }
    return false;
  }

  // Cache configuration
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private defaultTTL: number = 30 * 1000; // 30 seconds
  private cacheStats: CacheStats = {
    hits: 0,
    misses: 0,
    entries: 0,
    totalSize: 0,
  };
  private cacheEnabled: boolean = true;
  private persistentCache: boolean = false;
  private storageKey: string = 'easypanel-cache';
  private isBrowser: boolean = typeof globalThis !== 'undefined' && globalThis.window !== undefined;

  // Timeout configurations (in milliseconds)
  private timeouts: TimeoutConfig = {
    deploy: 5 * 60 * 1000, // 5 minutes
    create: 2 * 60 * 1000, // 2 minutes
    default: 30 * 1000,    // 30 seconds
  };

  // Retry configuration
  private retryConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000,      // 1 second
    maxDelay: 4000,       // 4 seconds maximum
    backoffFactor: 2,     // Double the delay each retry
  };

  constructor() {
    this.baseUrl = process.env.EASYPANEL_URL || '';
    this.email = process.env.EASYPANEL_EMAIL || '';
    this.password = process.env.EASYPANEL_PASSWORD || '';
    this.token = process.env.EASYPANEL_TOKEN || null;

    if (!this.baseUrl) {
      throw new EasyPanelError({
        message: 'EASYPANEL_URL environment variable is required',
        category: ErrorCategory.VALIDATION,
        operation: 'initialization',
        suggestions: [
          'Set the EASYPANEL_URL environment variable',
          'Example: export EASYPANEL_URL="https://your-easypanel.com"',
          'Ensure the URL includes the protocol (http:// or https://)'
        ]
      });
    }

    this.client = axios.create({
      baseURL: `${this.baseUrl}/api/trpc`,
      timeout: this.timeouts.default,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers['Authorization'] = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for enhanced error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<TRPCError>) => {
        const status = error.response?.status;
        const errorData = error.response?.data;
        const operation = this.extractOperationFromConfig(error.config);

        // Handle authentication errors
        if (status === 401 && this.email && this.password) {
          try {
            console.error('[EasyPanel] Token expired, re-authenticating...');
            await this.authenticate();

            // Retry the original request
            const originalRequest = error.config;
            if (originalRequest) {
              originalRequest.headers['Authorization'] = `Bearer ${this.token}`;
              return this.client.request(originalRequest);
            }
          } catch (authError) {
            throw this.createError(error, ErrorCategory.AUTHENTICATION, operation);
          }
        }

        // Convert to EasyPanelError
        throw this.createError(error, undefined, operation);
      }
    );
  }

  /**
   * Authenticate with EasyPanel and get session token
   */
  async authenticate(): Promise<void> {
    if (!this.email || !this.password) {
      if (this.token) {
        console.error('[EasyPanel] Using pre-configured token');
        return;
      }
      throw new EasyPanelError({
        message: 'EASYPANEL_EMAIL and EASYPANEL_PASSWORD are required for authentication',
        category: ErrorCategory.AUTHENTICATION,
        operation: 'auth',
        suggestions: [
          'Set the EASYPANEL_EMAIL environment variable',
          'Set the EASYPANEL_PASSWORD environment variable',
          'Alternatively, set EASYPANEL_TOKEN if you have a pre-generated token',
          'Example: export EASYPANEL_EMAIL="admin@example.com"',
          'Example: export EASYPANEL_PASSWORD="your-password"'
        ]
      });
    }

    try {
      const response = await axios.post<TRPCResponse<AuthResponse>>(
        `${this.baseUrl}/api/trpc/auth.login`,
        {
          json: {
            email: this.email,
            password: this.password,
          },
        } as TRPCRequest
      );

      this.token = response.data.result.data.json.token;
      console.error('[EasyPanel] Authentication successful');
    } catch (error) {
      if (error instanceof AxiosError) {
        throw this.createError(error, ErrorCategory.AUTHENTICATION, 'auth.login');
      }
      throw error;
    }
  }

  /**
   * Ensure we have a valid token before making requests
   */
  async ensureAuthenticated(): Promise<void> {
    if (!this.token) {
      await this.authenticate();
    }
  }

  // ==================== CACHE MANAGEMENT ====================

  /**
   * Generate cache key based on operation and parameters
   */
  private generateCacheKey(procedure: string, input?: unknown): string {
    const parts = [procedure];

    // Extract project and service from input if present
    if (input && typeof input === 'object') {
      const inputObj = input as Record<string, unknown>;
      if (inputObj.projectName) {
        parts.push(inputObj.projectName as string);
      }
      if (inputObj.serviceName) {
        parts.push(inputObj.serviceName as string);
      }
    }

    return parts.join(':');
  }

  /**
   * Check if cache entry is valid (not expired)
   */
  private isCacheValid<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  /**
   * Get data from cache if valid
   */
  private getFromCache<T>(key: string): T | null {
    if (!this.cacheEnabled) {
      return null;
    }

    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this.cacheStats.misses++;
      return null;
    }

    if (!this.isCacheValid(entry)) {
      this.cache.delete(key);
      this.cacheStats.misses++;
      return null;
    }

    this.cacheStats.hits++;
    console.error(`[EasyPanel] Cache hit for key: ${key}`);
    return entry.data;
  }

  /**
   * Store data in cache with TTL
   */
  private setCache<T>(key: string, data: T, ttl?: number): void {
    if (!this.cacheEnabled) {
      return;
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    };

    this.cache.set(key, entry);
    this.updateCacheStats();

    // Save to persistent storage if enabled
    if (this.persistentCache) {
      this.savePersistedCache();
    }

    console.error(`[EasyPanel] Cached data for key: ${key} (TTL: ${entry.ttl}ms)`);
  }

  /**
   * Update cache statistics
   */
  private updateCacheStats(): void {
    this.cacheStats.entries = this.cache.size;
    this.cacheStats.totalSize = Array.from(this.cache.values()).reduce(
      (total, entry) => total + JSON.stringify(entry.data).length,
      0
    );
  }

  /**
   * Clear cache entries
   */
  clearCache(pattern?: string): void {
    if (pattern) {
      // Clear entries matching pattern
      this.cache.forEach((_, key) => {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      });
    } else {
      // Clear all cache
      this.cache.clear();
    }

    // Reset stats
    this.cacheStats = {
      hits: 0,
      misses: 0,
      entries: this.cache.size,
      totalSize: 0,
    };

    // Update persistent storage if enabled
    if (this.persistentCache) {
      if (pattern) {
        // Save filtered cache back to storage
        this.savePersistedCache();
      } else {
        // Clear persisted cache completely
        if (globalThis.window) {
          globalThis.window.localStorage.removeItem(this.storageKey);
          globalThis.window.sessionStorage.removeItem(this.storageKey);
        }
      }
    }

    console.error(`[EasyPanel] Cache cleared${pattern ? ` (pattern: ${pattern})` : ''}`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats & { hitRate: number } {
    const totalRequests = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = totalRequests > 0 ? (this.cacheStats.hits / totalRequests) * 100 : 0;

    return {
      ...this.cacheStats,
      hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimal places
    };
  }

  /**
   * Enable/disable cache
   */
  setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = enabled;
    if (!enabled) {
      this.clearCache();
    }
    console.error(`[EasyPanel] Cache ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set default TTL for cache entries
   */
  setCacheTTL(ttl: number): void {
    this.defaultTTL = ttl;
    console.error(`[EasyPanel] Cache TTL set to ${ttl}ms`);
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp >= entry.ttl) {
        this.cache.delete(key);
      }
    });
    this.updateCacheStats();
  }

  /**
   * Load cache from persistent storage (localStorage/sessionStorage)
   */
  private loadPersistedCache(): void {
    if (!this.persistentCache || !globalThis.window) return;

    try {
      const stored = globalThis.window.localStorage.getItem(this.storageKey) ||
                   globalThis.window.sessionStorage.getItem(this.storageKey);

      if (stored) {
        const data = JSON.parse(stored);
        const now = Date.now();

        // Only restore valid entries
        Object.keys(data).forEach(key => {
          const entry = data[key];
          if (now - entry.timestamp < entry.ttl) {
            this.cache.set(key, entry);
          }
        });

        this.updateCacheStats();
        console.error(`[EasyPanel] Loaded ${this.cache.size} entries from persistent cache`);
      }
    } catch (error) {
      console.error('[EasyPanel] Failed to load persistent cache:', error);
    }
  }

  /**
   * Save cache to persistent storage
   */
  private savePersistedCache(): void {
    if (!this.persistentCache || !globalThis.window) return;

    try {
      const data = Object.fromEntries(this.cache.entries());
      const serialized = JSON.stringify(data);

      // Try localStorage first, fallback to sessionStorage
      try {
        globalThis.window.localStorage.setItem(this.storageKey, serialized);
      } catch (e) {
        // localStorage might be full, try sessionStorage
        globalThis.window.sessionStorage.setItem(this.storageKey, serialized);
      }

      console.error(`[EasyPanel] Saved ${this.cache.size} entries to persistent cache`);
    } catch (error) {
      console.error('[EasyPanel] Failed to save persistent cache:', error);
    }
  }

  /**
   * Enable/disable persistent cache storage
   */
  setPersistentCache(enabled: boolean, storageKey: string = 'easypanel-cache'): void {
    this.persistentCache = enabled;
    this.storageKey = storageKey;

    if (enabled) {
      this.loadPersistedCache();
    } else {
      // Clear persisted cache
      if (globalThis.window) {
        globalThis.window.localStorage.removeItem(this.storageKey);
        globalThis.window.sessionStorage.removeItem(this.storageKey);
      }
    }

    console.error(`[EasyPanel] Persistent cache ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Make a tRPC query (GET request)
   */
  async query<T>(procedure: string, input?: unknown, options?: { useCache?: boolean; ttl?: number }): Promise<T> {
    await this.ensureAuthenticated();

    // Check cache first (if enabled for this query)
    const useCache = options?.useCache !== false && this.shouldUseCache(procedure);
    if (useCache) {
      this.cleanupExpiredEntries(); // Clean up expired entries first
      const cacheKey = this.generateCacheKey(procedure, input);
      const cachedData = this.getFromCache<T>(cacheKey);
      if (cachedData !== null) {
        return cachedData;
      }
    }

    let result: T;
    let error: Error | undefined;

    try {
      // EasyPanel requires input parameter even for queries without input
      const inputData = input !== undefined ? { json: input } : { json: null };
      const params = `?input=${encodeURIComponent(JSON.stringify(inputData))}`;
      const response = await this.client.get<TRPCResponse<T>>(`/${procedure}${params}`);
      result = response.data.result.data.json;

      // Track successful operation
      this.planDetector.trackUsage(procedure, result);
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
      // Track failed operation
      this.planDetector.trackUsage(procedure, null, error);
      throw error;
    }

    // Store in cache if applicable
    if (useCache && result) {
      const cacheKey = this.generateCacheKey(procedure, input);
      this.setCache(cacheKey, result, options?.ttl);
    }

    return result;
  }

  /**
   * Determine if a procedure should use cache
   */
  private shouldUseCache(procedure: string): boolean {
    // Only cache read operations
    const cacheableProcedures = [
      'projects.listProjectsAndServices',
      'projects.inspectProject',
      'services.redis.inspectService',
      'monitor.getServiceStats',
      'monitor.getAdvancedStats',
      'monitor.getSystemStats',
      'monitor.getDockerTaskStats',
      'monitor.getMonitorTableData',
      'services.app.listDomains',
      'services.app.validateDomain',
      'services.app.getSSLCertificate',
      'services.app.getBuildStatus',
      'auth.getUser',
      'license.getPayload',
    ];

    return cacheableProcedures.includes(procedure);
  }

  /**
   * Make a tRPC mutation (POST request)
   */
  async mutate<T>(procedure: string, input: unknown): Promise<T> {
    await this.ensureAuthenticated();

    // Invalidate relevant cache entries before mutation
    this.invalidateCacheForMutation(procedure, input);

    let result: T;
    let error: Error | undefined;

    try {
      const response = await this.client.post<TRPCResponse<T>>(
        `/${procedure}`,
        { json: input } as TRPCRequest
      );
      result = response.data.result.data.json;

      // Track successful operation
      this.planDetector.trackUsage(procedure, result);
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
      // Track failed operation
      this.planDetector.trackUsage(procedure, null, error);
      throw error;
    }

    return result;
  }

  /**
   * Explicit mapping of procedures to their cache invalidation rules
   */
  private readonly invalidationMap: Record<string, {
    global?: string[];
    project?: string[];
    service?: string[];
    projectWide?: boolean;
    allServices?: boolean;
  }> = {
    // Project operations
    'projects.createProject': {
      global: ['projects.listProjectsAndServices'],
      project: ['projects.inspectProject']
    },
    'projects.destroyProject': {
      global: ['projects.listProjectsAndServices'],
      project: ['projects.inspectProject'],
      allServices: true
    },

    // App service operations
    'services.app.createService': {
      global: ['projects.listProjectsAndServices'],
      project: ['projects.inspectProject']
    },
    'services.app.destroyService': {
      global: ['projects.listProjectsAndServices'],
      project: ['projects.inspectProject'],
      service: [
        'monitor.getServiceStats',
        'services.redis.inspectService',
        'services.app.listDomains',
        'services.app.getBuildStatus'
      ]
    },
    'services.app.startService': {
      service: [
        'monitor.getServiceStats',
        'services.app.getBuildStatus'
      ]
    },
    'services.app.stopService': {
      service: [
        'monitor.getServiceStats',
        'services.app.getBuildStatus'
      ]
    },
    'services.app.restartService': {
      service: [
        'monitor.getServiceStats',
        'services.app.getBuildStatus'
      ],
      projectWide: true
    },

    // Deployment operations
    'services.app.deployService': {
      service: [
        'services.app.getBuildStatus',
        'monitor.getServiceStats'
      ]
    },
    'services.app.updateSourceImage': {
      service: [
        'services.app.getBuildStatus',
        'monitor.getServiceStats'
      ],
      projectWide: true
    },
    'services.app.updateSourceGit': {
      service: [
        'services.app.getBuildStatus',
        'monitor.getServiceStats'
      ],
      projectWide: true
    },
    'services.app.updateSourceDockerfile': {
      service: [
        'services.app.getBuildStatus',
        'monitor.getServiceStats'
      ],
      projectWide: true
    },

    // Configuration operations
    'services.app.updateEnv': {
      service: [
        'monitor.getServiceStats',
        'services.app.getBuildStatus'
      ],
      projectWide: true
    },
    'services.app.updateResources': {
      service: ['monitor.getServiceStats'],
      projectWide: true
    },

    // Domain operations
    'services.app.addDomain': {
      global: [
        'services.app.listDomains',
        'services.app.validateDomain'
      ],
      service: [
        'services.app.listDomains',
        'services.app.getSSLCertificate'
      ],
      projectWide: true
    },
    'services.app.removeDomain': {
      global: [
        'services.app.listDomains',
        'services.app.getSSLCertificate'
      ],
      service: [
        'services.app.listDomains',
        'services.app.getSSLCertificate'
      ],
      projectWide: true
    },
    'services.app.requestSSLCertificate': {
      global: [
        'services.app.getSSLCertificate',
        'services.app.validateDomain'
      ],
      service: [
        'services.app.getSSLCertificate',
        'services.app.listDomains'
      ]
    },
    'services.app.renewSSLCertificate': {
      global: [
        'services.app.getSSLCertificate'
      ],
      service: [
        'services.app.getSSLCertificate',
        'services.app.listDomains'
      ]
    },

    // Redis operations
    'services.redis.createService': {
      global: ['projects.listProjectsAndServices'],
      project: ['projects.inspectProject']
    },
    'services.redis.destroyService': {
      global: ['projects.listProjectsAndServices'],
      project: ['projects.inspectProject'],
      service: [
        'monitor.getServiceStats',
        'services.redis.inspectService'
      ]
    },
    'services.redis.updatePassword': {
      service: [
        'services.redis.inspectService'
      ]
    },

    // MySQL operations
    'services.mysql.createService': {
      global: ['projects.listProjectsAndServices'],
      project: ['projects.inspectProject']
    },
    'services.mysql.destroyService': {
      global: ['projects.listProjectsAndServices'],
      project: ['projects.inspectProject'],
      service: [
        'monitor.getServiceStats'
      ]
    },

    // PostgreSQL operations
    'services.postgres.createService': {
      global: ['projects.listProjectsAndServices'],
      project: ['projects.inspectProject']
    },
    'services.postgres.destroyService': {
      global: ['projects.listProjectsAndServices'],
      project: ['projects.inspectProject'],
      service: [
        'monitor.getServiceStats'
      ]
    },

    // License operations
    'license.activate': {
      global: ['license.getPayload', 'auth.getUser']
    }
  };

  /**
   * Invalidate cache entries affected by a mutation using explicit mapping
   */
  private invalidateCacheForMutation(procedure: string, input: unknown): void {
    if (!this.cacheEnabled) return;

    const inputObj = input as Record<string, unknown>;
    const projectName = inputObj.projectName as string;
    const serviceName = inputObj.serviceName as string;

    // Get invalidation rules for this procedure
    const rules = this.invalidationMap[procedure as keyof typeof this.invalidationMap];
    if (!rules) {
      console.error(`[EasyPanel] No invalidation rules found for procedure: ${procedure}`);
      return;
    }

    // Invalidate global cache entries
    if (rules.global) {
      rules.global.forEach(key => {
        this.clearCache(key);
      });
    }

    // Invalidate project-specific cache entries
    if (rules.project && projectName) {
      rules.project.forEach(key => {
        this.clearCache(`${key}:${projectName}`);
      });
    }

    // Invalidate service-specific cache entries
    if (rules.service && projectName && serviceName) {
      rules.service.forEach(key => {
        this.clearCache(`${key}:${projectName}:${serviceName}`);
      });
    }

    // Project-wide invalidation (all services within project)
    if (rules.projectWide && projectName) {
      this.clearCache(projectName);
      // Also clear any cached data for all services in this project
      this.cache.forEach((_, key) => {
        if (key.startsWith(`monitor.getServiceStats:${projectName}:`) ||
            key.startsWith(`services.redis.inspectService:${projectName}:`) ||
            key.startsWith(`services.app.listDomains:${projectName}:`) ||
            key.startsWith(`services.app.getBuildStatus:${projectName}:`)) {
          this.cache.delete(key);
        }
      });
    }

    // All services in project (for project destruction)
    if (rules.allServices && projectName) {
      this.cache.forEach((_, key) => {
        if (key.includes(projectName)) {
          this.cache.delete(key);
        }
      });
    }

    console.error(`[EasyPanel] Cache invalidated for procedure: ${procedure}`, {
      projectName,
      serviceName,
      rules
    });
  }

  // ==================== PROJECT OPERATIONS ====================

  /**
   * List all projects with their services
   */
  async listProjects(): Promise<unknown[]> {
    // Use cache with longer TTL since project list changes infrequently
    return this.query('projects.listProjectsAndServices', undefined, {
      useCache: true,
      ttl: 60000 // 1 minute
    });
  }

  /**
   * Create a new project
   */
  async createProject(projectName: string): Promise<unknown> {
    // Validate project name
    validateProjectServiceName(projectName, 'project');
    return this.mutate('projects.createProject', { projectName });
  }

  /**
   * Inspect a project
   */
  async inspectProject(projectName: string): Promise<unknown> {
    // Use cache with medium TTL for project inspection
    return this.query('projects.inspectProject', { projectName }, {
      useCache: true,
      ttl: 45000 // 45 seconds
    });
  }

  /**
   * Destroy a project (deletes all services!)
   */
  async destroyProject(projectName: string): Promise<unknown> {
    return this.mutate('projects.destroyProject', { projectName });
  }

  // ==================== APP SERVICE OPERATIONS ====================

  /**
   * Create an app service
   */
  async createAppService(projectName: string, serviceName: string): Promise<unknown> {
    // Validate inputs
    validateProjectServiceName(projectName, 'project');
    validateProjectServiceName(serviceName, 'service');
    return this.mutate('services.app.createService', { projectName, serviceName });
  }

  /**
   * Deploy from Docker image
   */
  async deployFromImage(
    projectName: string,
    serviceName: string,
    image: string,
    username?: string,
    password?: string
  ): Promise<unknown> {
    // Validate inputs
    validateProjectServiceName(projectName, 'project');
    validateProjectServiceName(serviceName, 'service');
    validateDockerImage(image);
    // Username and password are optional, validate if provided
    if (username && typeof username !== 'string') {
      throw new ValidationError('Docker registry username must be a string');
    }
    if (password && typeof password !== 'string') {
      throw new ValidationError('Docker registry password must be a string');
    }

    return this.mutate('services.app.updateSourceImage', {
      projectName,
      serviceName,
      image,
      username,
      password,
    });
  }

  /**
   * Deploy from Git repository
   */
  async deployFromGit(
    projectName: string,
    serviceName: string,
    repo: string,
    ref: string = 'main',
    path: string = '/'
  ): Promise<unknown> {
    // Validate inputs
    validateProjectServiceName(projectName, 'project');
    validateProjectServiceName(serviceName, 'service');
    validateGitRepo(repo);
    validateGitRef(ref);
    // Path validation
    if (typeof path !== 'string') {
      throw new ValidationError('Git path must be a string');
    }
    if (path !== '/' && !path.startsWith('/')) {
      throw new ValidationError('Git path must start with / or be /');
    }
    if (path.length > 1024) {
      throw new ValidationError('Git path must be 1024 characters or less');
    }

    return this.mutate('services.app.updateSourceGit', {
      projectName,
      serviceName,
      repo,
      ref,
      path,
    });
  }

  /**
   * Deploy from Dockerfile
   */
  async deployFromDockerfile(
    projectName: string,
    serviceName: string,
    repo: string,
    ref: string = 'main',
    path: string = '/',
    dockerfilePath: string = './Dockerfile'
  ): Promise<unknown> {
    // Validate inputs
    validateProjectServiceName(projectName, 'project');
    validateProjectServiceName(serviceName, 'service');
    validateGitRepo(repo);
    validateGitRef(ref);
    // Path validation
    if (typeof path !== 'string') {
      throw new ValidationError('Git path must be a string');
    }
    if (path !== '/' && !path.startsWith('/')) {
      throw new ValidationError('Git path must start with / or be /');
    }
    if (path.length > 1024) {
      throw new ValidationError('Git path must be 1024 characters or less');
    }
    // Dockerfile path validation
    validateDockerfilePath(dockerfilePath);

    return this.mutate('services.app.updateSourceDockerfile', {
      projectName,
      serviceName,
      repo,
      ref,
      path,
      dockerfilePath,
    });
  }

  /**
   * Update environment variables
   */
  async updateEnv(projectName: string, serviceName: string, env: string): Promise<unknown> {
    // Validate inputs
    validateProjectServiceName(projectName, 'project');
    validateProjectServiceName(serviceName, 'service');
    if (typeof env !== 'string') {
      throw new ValidationError('Environment variables must be a string');
    }
    // Parse and validate each environment variable
    parseAndValidateEnvVars(env);

    return this.mutate('services.app.updateEnv', {
      projectName,
      serviceName,
      env,
    });
  }

  /**
   * Update resource limits
   */
  async updateResources(
    projectName: string,
    serviceName: string,
    memoryReservation?: number,
    memoryLimit?: number,
    cpuReservation?: number,
    cpuLimit?: number
  ): Promise<unknown> {
    // Validate inputs
    validateProjectServiceName(projectName, 'project');
    validateProjectServiceName(serviceName, 'service');
    // Validate resource limits if provided
    if (memoryReservation !== undefined) {
      validateMemoryLimit(memoryReservation, 'Memory reservation');
    }
    if (memoryLimit !== undefined) {
      validateMemoryLimit(memoryLimit, 'Memory limit');
    }
    if (cpuReservation !== undefined) {
      validateCpuLimit(cpuReservation, 'CPU reservation');
    }
    if (cpuLimit !== undefined) {
      validateCpuLimit(cpuLimit, 'CPU limit');
    }

    return this.mutate('services.app.updateResources', {
      projectName,
      serviceName,
      memoryReservation,
      memoryLimit,
      cpuReservation,
      cpuLimit,
    });
  }

  /**
   * Start a service
   */
  async startService(projectName: string, serviceName: string): Promise<unknown> {
    return this.mutate('services.app.startService', { projectName, serviceName });
  }

  /**
   * Stop a service
   */
  async stopService(projectName: string, serviceName: string): Promise<unknown> {
    return this.mutate('services.app.stopService', { projectName, serviceName });
  }

  /**
   * Restart a service
   */
  async restartService(projectName: string, serviceName: string): Promise<unknown> {
    return this.mutate('services.app.restartService', { projectName, serviceName });
  }

  /**
   * Trigger deployment
   */
  async deployService(projectName: string, serviceName: string): Promise<unknown> {
    return this.mutate('services.app.deployService', { projectName, serviceName });
  }

  /**
   * Destroy a service
   */
  async destroyAppService(projectName: string, serviceName: string): Promise<unknown> {
    return this.mutate('services.app.destroyService', { projectName, serviceName });
  }

  // ==================== REDIS OPERATIONS ====================

  /**
   * Create Redis service
   */
  async createRedis(
    projectName: string,
    serviceName: string,
    password: string,
    image: string = 'redis:7'
  ): Promise<unknown> {
    return this.mutate('services.redis.createService', {
      projectName,
      serviceName,
      password,
      image,
    });
  }

  /**
   * Inspect Redis service
   */
  async inspectRedis(projectName: string, serviceName: string): Promise<unknown> {
    // Use cache with short TTL for service inspection (services change more frequently)
    return this.query('services.redis.inspectService', { projectName, serviceName }, {
      useCache: true,
      ttl: 15000 // 15 seconds
    });
  }

  /**
   * Destroy a database service (Redis, MySQL, PostgreSQL)
   */
  async destroyDBService(
    projectName: string,
    serviceName: string,
    type: 'redis' | 'mysql' | 'postgres'
  ): Promise<unknown> {
    // Validate inputs
    validateProjectServiceName(projectName, 'project');
    validateProjectServiceName(serviceName, 'service');
    if (!['redis', 'mysql', 'postgres'].includes(type)) {
      throw new ValidationError('Database type must be one of: redis, mysql, postgres');
    }

    // Map service type to tRPC procedure
    const procedureMap = {
      redis: 'services.redis.destroyService',
      mysql: 'services.mysql.destroyService',
      postgres: 'services.postgres.destroyService'
    };

    const procedure = procedureMap[type];
    if (!procedure) {
      throw new ValidationError(`Unsupported database type: ${type}`);
    }

    return this.mutate(procedure, { projectName, serviceName });
  }

  /**
   * Update Redis password
   */
  async updateRedisPassword(
    projectName: string,
    serviceName: string,
    password: string
  ): Promise<unknown> {
    // Validate inputs
    validateProjectServiceName(projectName, 'project');
    validateProjectServiceName(serviceName, 'service');
    if (!password || typeof password !== 'string') {
      throw new ValidationError('Password is required and must be a string');
    }
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }
    if (password.length > 256) {
      throw new ValidationError('Password must be 256 characters or less');
    }

    return this.mutate('services.redis.updatePassword', {
      projectName,
      serviceName,
      password,
    });
  }

  // ==================== MYSQL OPERATIONS ====================

  /**
   * Create MySQL service
   */
  async createMySQL(
    projectName: string,
    serviceName: string,
    databaseName: string,
    user: string,
    password: string,
    rootPassword: string,
    image: string = 'mysql:8.0'
  ): Promise<unknown> {
    return this.mutate('services.mysql.createService', {
      projectName,
      serviceName,
      databaseName,
      user,
      password,
      rootPassword,
      image,
    });
  }

  // ==================== POSTGRES OPERATIONS ====================

  /**
   * Create PostgreSQL service
   */
  async createPostgres(
    projectName: string,
    serviceName: string,
    databaseName: string,
    user: string,
    password: string,
    image: string = 'postgres:15'
  ): Promise<unknown> {
    return this.mutate('services.postgres.createService', {
      projectName,
      serviceName,
      databaseName,
      user,
      password,
      image,
    });
  }

  // ==================== MONITORING ====================

  /**
   * Get service statistics
   */
  async getServiceStats(projectName: string, serviceName: string): Promise<unknown> {
    // Use cache with very short TTL for stats (change frequently)
    return this.query('monitor.getServiceStats', { projectName, serviceName }, {
      useCache: true,
      ttl: 10000 // 10 seconds
    });
  }

  /**
   * Get advanced system-wide statistics
   */
  async getAdvancedStats(): Promise<unknown> {
    // Use cache with medium TTL for system-wide stats
    return this.query('monitor.getAdvancedStats', undefined, {
      useCache: true,
      ttl: 60000 // 1 minute
    });
  }

  /**
   * Get system resource statistics (CPU, memory, disk)
   */
  async getSystemStats(): Promise<unknown> {
    // Use cache with short TTL for system stats
    return this.query('monitor.getSystemStats', undefined, {
      useCache: true,
      ttl: 30000 // 30 seconds
    });
  }

  /**
   * Get Docker container task statistics
   */
  async getDockerTaskStats(): Promise<unknown> {
    // Use cache with short TTL for Docker stats (change frequently)
    return this.query('monitor.getDockerTaskStats', undefined, {
      useCache: true,
      ttl: 30000 // 30 seconds
    });
  }

  /**
   * Get formatted monitoring table data
   */
  async getMonitorTableData(): Promise<unknown> {
    // Use cache with short TTL for aggregated monitoring data
    return this.query('monitor.getMonitorTableData', undefined, {
      useCache: true,
      ttl: 45000 // 45 seconds
    });
  }

  /**
   * Get WebSocket URL for log streaming
   */
  getLogStreamUrl(projectName: string, serviceName: string): string {
    return `${this.baseUrl.replace('http', 'ws')}/ws/serviceLogs?token=${this.token}&service=${projectName}_${serviceName}&compose=false`;
  }

  /**
   * Get service logs with filtering options
   */
  async getServiceLogs(projectName: string, serviceName: string, options?: LogOptions): Promise<LogStreamResponse> {
    // Try different potential endpoints that EasyPanel might use
    try {
      // First try the dedicated logs endpoint
      const result = await this.query('services.getLogs', {
        projectName,
        serviceName,
        ...this.formatLogOptions(options),
      });
      return result as LogStreamResponse;
    } catch (error) {
      // Fallback to Docker container logs endpoint
      try {
        const result = await this.query('docker.getContainerLogs', {
          container: `${projectName}_${serviceName}`,
          ...this.formatLogOptions(options),
        });
        return result as LogStreamResponse;
      } catch (fallbackError) {
        // Last resort: try monitor endpoint
        const result = await this.query('monitor.getServiceLogs', {
          projectName,
          serviceName,
          ...this.formatLogOptions(options),
        });
        return result as LogStreamResponse;
      }
    }
  }

  /**
   * Stream service logs via WebSocket (returns WebSocket URL)
   */
  getLogStreamUrlWithOptions(projectName: string, serviceName: string, options?: LogOptions): string {
    const baseUrl = this.baseUrl.replace('http', 'ws');
    const queryParams = new URLSearchParams({
      token: this.token || '',
      service: `${projectName}_${serviceName}`,
      compose: 'false',
      ...this.formatLogOptionsForQuery(options),
    });
    return `${baseUrl}/ws/serviceLogs?${queryParams.toString()}`;
  }

  /**
   * Search logs with specific query
   */
  async searchLogs(projectName: string, serviceName: string, query: string, options?: LogOptions): Promise<LogSearchResult> {
    try {
      const result = await this.query('services.searchLogs', {
        projectName,
        serviceName,
        query,
        ...this.formatLogOptions(options),
      });
      return result as LogSearchResult;
    } catch (error) {
      // If dedicated search endpoint doesn't exist, use getLogs and filter client-side
      const logsResponse = await this.getServiceLogs(projectName, serviceName, options);
      const filteredLogs = this.filterLogs(logsResponse.logs, query, options?.filters);
      return {
        service: `${projectName}_${serviceName}`,
        totalMatches: filteredLogs.length,
        logs: filteredLogs,
        query,
      };
    }
  }

  /**
   * Helper method to format LogOptions for API calls
   */
  private formatLogOptions(options?: LogOptions): Record<string, unknown> {
    if (!options) return {};

    const formatted: Record<string, unknown> = {};

    if (options.since) {
      formatted.since = options.since instanceof Date ? options.since.toISOString() : options.since;
    }

    if (options.until) {
      formatted.until = options.until instanceof Date ? options.until.toISOString() : options.until;
    }

    if (options.lines) {
      formatted.lines = options.lines;
    }

    if (options.follow !== undefined) {
      formatted.follow = options.follow;
    }

    if (options.timestamps !== undefined) {
      formatted.timestamps = options.timestamps;
    }

    if (options.filters) {
      if (options.filters.level) {
        formatted.levels = options.filters.level;
      }
      if (options.filters.search) {
        formatted.search = options.filters.search;
      }
    }

    return formatted;
  }

  /**
   * Helper method to format LogOptions for query strings
   */
  private formatLogOptionsForQuery(options?: LogOptions): Record<string, string> {
    const formatted: Record<string, string> = {};

    if (!options) return formatted;

    if (options.since) {
      formatted.since = options.since instanceof Date ? options.since.toISOString() : options.since;
    }

    if (options.until) {
      formatted.until = options.until instanceof Date ? options.until.toISOString() : options.until;
    }

    if (options.lines) {
      formatted.lines = options.lines.toString();
    }

    if (options.follow !== undefined) {
      formatted.follow = options.follow.toString();
    }

    if (options.timestamps !== undefined) {
      formatted.timestamps = options.timestamps.toString();
    }

    if (options.filters) {
      if (options.filters.level) {
        formatted.levels = options.filters.level.join(',');
      }
      if (options.filters.search) {
        formatted.search = options.filters.search;
      }
    }

    return formatted;
  }

  /**
   * Helper method to filter logs client-side
   */
  private filterLogs(logs: ContainerLog[], query?: string, filters?: LogOptions['filters']): ContainerLog[] {
    let filtered = logs;

    if (filters?.level && filters.level.length > 0) {
      filtered = filtered.filter(log => filters.level!.includes(log.level));
    }

    if (filters?.search || query) {
      const searchTerm = (filters?.search || query || '').toLowerCase();
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(searchTerm) ||
        log.container?.toLowerCase().includes(searchTerm) ||
        log.service?.toLowerCase().includes(searchTerm)
      );
    }

    return filtered;
  }

  /**
   * Get build status for deployment
   */
  async getBuildStatus(projectName: string, serviceName: string, buildId?: string): Promise<BuildStatus> {
    // Use cache with very short TTL for build status (changes frequently during builds)
    return this.query('services.app.getBuildStatus', { projectName, serviceName, buildId }, {
      useCache: true,
      ttl: 5000 // 5 seconds
    });
  }

  /**
   * Wait for deployment to complete
   */
  async waitForDeploy(
    projectName: string,
    serviceName: string,
    buildId?: string,
    maxWaitMs: number = 10 * 60 * 1000 // 10 minutes
  ): Promise<BuildStatus> {
    const startTime = Date.now();
    const pollIntervalMs = 5000; // Poll every 5 seconds

    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.getBuildStatus(projectName, serviceName, buildId);

      if (status.status === 'success' || status.status === 'failed' || status.status === 'cancelled') {
        return status;
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new EasyPanelError({
      message: `Deployment timeout after ${maxWaitMs}ms`,
      category: ErrorCategory.TIMEOUT,
      operation: 'waitForDeploy',
      suggestions: [
        `Increase the maxWaitMs parameter (current: ${maxWaitMs}ms)`,
        'Check if the build is still in progress',
        'Consider checking build logs for any errors',
        'Large applications may require more time',
        `Current polling interval: ${pollIntervalMs}ms`
      ],
      retryable: true
    });
  }

  /**
   * Add a domain to a service
   */
  async addDomain(
    projectName: string,
    serviceName: string,
    domainConfig: DomainConfiguration
  ): Promise<unknown> {
    // Validate inputs
    validateProjectServiceName(projectName, 'project');
    validateProjectServiceName(serviceName, 'service');
    // Validate domain configuration
    if (!domainConfig || typeof domainConfig !== 'object') {
      throw new ValidationError('Domain configuration must be an object');
    }
    if (domainConfig.domain) {
      validateDomain(domainConfig.domain);
    }
    if (domainConfig.sslEmail) {
      validateEmail(domainConfig.sslEmail);
    }

    return this.mutate('services.app.addDomain', {
      projectName,
      serviceName,
      domainConfig,
    });
  }

  /**
   * Remove a domain from a service
   */
  async removeDomain(
    projectName: string,
    serviceName: string,
    domainId: string
  ): Promise<unknown> {
    return this.mutate('services.app.removeDomain', {
      projectName,
      serviceName,
      domainId,
    });
  }

  /**
   * List all domains for a service
   */
  async listDomains(projectName: string, serviceName: string): Promise<Domain[]> {
    // Use cache with medium TTL for domain lists
    return this.query('services.app.listDomains', { projectName, serviceName }, {
      useCache: true,
      ttl: 30000 // 30 seconds
    });
  }

  /**
   * Validate domain configuration
   */
  async validateDomain(
    projectName: string,
    serviceName: string,
    domainConfig: DomainConfiguration
  ): Promise<DomainValidationResult> {
    // Use cache with short TTL for domain validation
    return this.query('services.app.validateDomain', {
      projectName,
      serviceName,
      domainConfig,
    }, {
      useCache: true,
      ttl: 20000 // 20 seconds
    });
  }

  /**
   * Get SSL certificate details
   */
  async getSSLCertificate(
    projectName: string,
    serviceName: string,
    domain: string
  ): Promise<SLCertificate> {
    // Use cache with longer TTL for SSL certificates (change infrequently)
    return this.query('services.app.getSSLCertificate', {
      projectName,
      serviceName,
      domain,
    }, {
      useCache: true,
      ttl: 120000 // 2 minutes
    });
  }

  /**
   * Request SSL certificate
   */
  async requestSSLCertificate(
    projectName: string,
    serviceName: string,
    domain: string,
    email?: string
  ): Promise<SLCertificate> {
    // Validate inputs
    validateProjectServiceName(projectName, 'project');
    validateProjectServiceName(serviceName, 'service');
    validateDomain(domain);
    if (email) {
      validateEmail(email);
    }

    return this.mutate('services.app.requestSSLCertificate', {
      projectName,
      serviceName,
      domain,
      email,
    });
  }

  /**
   * Renew SSL certificate
   */
  async renewSSLCertificate(
    projectName: string,
    serviceName: string,
    domainId: string
  ): Promise<SLCertificate> {
    return this.mutate('services.app.renewSSLCertificate', {
      projectName,
      serviceName,
      domainId,
    });
  }

  /**
   * Get upgrade suggestion if applicable
   */
  getUpgradeSuggestion(context?: string): { message: string; url: string } | null {
    // Try to check license status first for more accurate detection
    this.checkLicenseStatusIfNecessary();

    return this.planDetector.getUpgradeSuggestion(context);
  }

  /**
   * Check license status if enough time has passed
   */
  private async checkLicenseStatusIfNecessary(): Promise<void> {
    try {
      // Only check if we haven't checked recently and we're authenticated
      if (this.token) {
        // Fire and forget - don't await to avoid blocking
        this.planDetector.checkLicenseStatus(this).catch(() => {
          // Ignore errors - we'll fallback to usage tracking
        });
      }
    } catch (error) {
      // Ignore errors - continue with usage-based detection
    }
  }

  /**
   * Get current plan info
   */
  getPlanInfo() {
    return this.planDetector.detectPlan();
  }

  // ==================== LICENSE & USER OPERATIONS ====================

  /**
   * Get current user information
   */
  async getUser(): Promise<UserInfo> {
    // Use cache with medium TTL for user info
    return this.query('auth.getUser', undefined, {
      useCache: true,
      ttl: 60000 // 1 minute
    });
  }

  /**
   * Get license payload for a specific license type
   */
  async getLicensePayload(type: string): Promise<LicensePayload> {
    // Validate license type
    if (!type || typeof type !== 'string') {
      throw new ValidationError('License type is required and must be a string');
    }
    if (type.length > 100) {
      throw new ValidationError('License type must be 100 characters or less');
    }

    // Use cache with short TTL for license info (may change frequently)
    return this.query('license.getPayload', { type }, {
      useCache: true,
      ttl: 30000 // 30 seconds
    });
  }

  /**
   * Activate a license
   */
  async activateLicense(type: string, key?: string, token?: string, metadata?: Record<string, unknown>): Promise<LicenseActivationResponse> {
    // Validate inputs
    if (!type || typeof type !== 'string') {
      throw new ValidationError('License type is required and must be a string');
    }
    if (type.length > 100) {
      throw new ValidationError('License type must be 100 characters or less');
    }
    if (key && typeof key !== 'string') {
      throw new ValidationError('License key must be a string');
    }
    if (token && typeof token !== 'string') {
      throw new ValidationError('License token must be a string');
    }
    if (metadata && typeof metadata !== 'object') {
      throw new ValidationError('License metadata must be an object');
    }

    const request: LicenseActivationRequest = {
      type,
      key,
      token,
      metadata,
    };

    // Invalidate any cached license data after activation
    this.clearCache('license.getPayload');
    this.clearCache('auth.getUser');

    return this.mutate('license.activate', request);
  }

  // ==================== DOCKER CLEANUP METHODS ====================

  /**
   * Clean up unused Docker images
   */
  async dockerImageCleanup(force: boolean = false): Promise<{
    freedSpace: string;
    imagesRemoved: number;
    warnings: string[];
  }> {
    await this.ensureAuthenticated();
    return this.query('docker.cleanup.images', { force });
  }

  /**
   * Prune Docker builder cache
   */
  async dockerBuilderCachePrune(all: boolean = false): Promise<{
    freedSpace: string;
    cacheId: string;
    warnings: string[];
  }> {
    await this.ensureAuthenticated();
    return this.query('docker.prune.builder', { all });
  }

  /**
   * Clean up stopped containers
   */
  async dockerContainerCleanup(force: boolean = false): Promise<{
    containersRemoved: number;
    freedSpace: string;
    warnings: string[];
  }> {
    await this.ensureAuthenticated();
    return this.query('docker.cleanup.containers', { force });
  }

  /**
   * Clean up orphaned volumes
   */
  async dockerVolumeCleanup(force: boolean = false): Promise<{
    volumesRemoved: number;
    freedSpace: string;
    warnings: string[];
  }> {
    await this.ensureAuthenticated();
    return this.query('docker.cleanup.volumes', { force });
  }

  /**
   * Comprehensive Docker system cleanup
   */
  async dockerSystemPrune(force: boolean = false, all: boolean = false): Promise<{
    totalReclaimedSpace: string;
    containersRemoved: number;
    imagesRemoved: number;
    volumesRemoved: number;
    networksRemoved: number;
    buildCacheReclaimed: string;
    warnings: string[];
  }> {
    await this.ensureAuthenticated();
    return this.query('docker.system.prune', { force, all });
  }

  /**
   * Clean Docker resources for a specific project
   */
  async dockerProjectCleanup(
    projectName: string,
    cleanupVolumes: boolean = false,
    cleanupImages: boolean = false
  ): Promise<{
    containersRemoved: number;
    volumesRemoved: number;
    imagesRemoved: number;
    freedSpace: string;
    warnings: string[];
  }> {
    await this.ensureAuthenticated();
    return this.query('docker.cleanup.project', {
      projectName,
      volumes: cleanupVolumes,
      images: cleanupImages,
    });
  }

  // ==================== SYSTEM SERVICE MANAGEMENT ====================

  /**
   * Restart EasyPanel daemon service
   */
  async restartEasyPanelService(): Promise<{
    success: boolean;
    message: string;
    duration: number;
    previousState: string;
    newState: string;
  }> {
    await this.ensureAuthenticated();

    const startTime = Date.now();

    try {
      // Get previous state before restart
      const statusBefore = await this.getServiceHealthStatus('easypanel');

      // Restart the service
      const result = await this.mutate('system.restartService', {
        serviceName: 'easypanel',
        force: true,
      });

      // Get new state after restart
      const statusAfter = await this.getServiceHealthStatus('easypanel');
      const duration = Date.now() - startTime;

      return {
        success: true,
        message: 'EasyPanel service restarted successfully',
        duration,
        previousState: statusBefore.status,
        newState: statusAfter.status,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      throw new EasyPanelError({
        message: `Failed to restart EasyPanel service after ${duration}ms`,
        category: ErrorCategory.EASYPANEL_API,
        operation: 'restartEasyPanelService',
        originalError: error as Error,
        suggestions: [
          'Check if EasyPanel has sufficient permissions to manage system services',
          'Verify the service exists and is properly configured',
          'Check system logs for more details',
          'Try restarting manually if the issue persists',
        ],
        retryable: true,
      });
    }
  }

  /**
   * Restart Traefik proxy service
   */
  async restartTraefikService(): Promise<{
    success: boolean;
    message: string;
    duration: number;
    previousState: string;
    newState: string;
  }> {
    await this.ensureAuthenticated();

    const startTime = Date.now();

    try {
      // Get previous state before restart
      const statusBefore = await this.getServiceHealthStatus('traefik');

      // Restart the service
      const result = await this.mutate('system.restartService', {
        serviceName: 'traefik',
        force: true,
      });

      // Get new state after restart
      const statusAfter = await this.getServiceHealthStatus('traefik');
      const duration = Date.now() - startTime;

      return {
        success: true,
        message: 'Traefik service restarted successfully',
        duration,
        previousState: statusBefore.status,
        newState: statusAfter.status,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      throw new EasyPanelError({
        message: `Failed to restart Traefik service after ${duration}ms`,
        category: ErrorCategory.EASYPANEL_API,
        operation: 'restartTraefikService',
        originalError: error as Error,
        suggestions: [
          'Check if Traefik has sufficient permissions to manage system services',
          'Verify the service exists and is properly configured',
          'Check if there are any configuration errors in Traefik',
          'Verify Docker is running and accessible',
        ],
        retryable: true,
      });
    }
  }

  /**
   * Get service health status
   */
  async getServiceStatus(serviceName: string): Promise<{
    status: 'running' | 'stopped' | 'error' | 'unknown';
    uptime?: number;
    memory?: {
      usage: number;
      percent: number;
    };
    cpu?: {
      percent: number;
    };
    lastRestart?: string;
    health: 'healthy' | 'unhealthy' | 'unknown';
  }> {
    await this.ensureAuthenticated();

    try {
      // Try the dedicated system service status endpoint first
      const result = await this.query('system.getServiceStatus', { serviceName });
      return result as {
        status: 'running' | 'stopped' | 'error' | 'unknown';
        uptime?: number;
        memory?: {
          usage: number;
          percent: number;
        };
        cpu?: {
          percent: number;
        };
        lastRestart?: string;
        health: 'healthy' | 'unhealthy' | 'unknown';
      };
    } catch (error) {
      // Fallback to Docker container status if it's a containerized service
      try {
        const containerName = this.mapServiceToContainer(serviceName);
        if (containerName) {
          const dockerStats = await this.query('monitor.getServiceStats', {
            projectName: 'system',
            serviceName: containerName,
          }) as any;

          return {
            status: dockerStats.enabled ? 'running' : 'stopped',
            memory: dockerStats.memory,
            cpu: dockerStats.cpu,
            health: dockerStats.enabled ? 'healthy' : 'unhealthy',
          };
        }
      } catch (dockerError) {
        // If both fail, return unknown status
      }

      // Last resort: try system monitoring endpoint
      try {
        const systemStats = await this.getSystemStats();
        // Extract service info from system stats if available
        return {
          status: 'unknown',
          health: 'unknown',
        };
      } catch (systemError) {
        throw new EasyPanelError({
          message: `Unable to get status for service: ${serviceName}`,
          category: ErrorCategory.EASYPANEL_API,
          operation: 'getServiceStatus',
          originalError: error as Error,
          suggestions: [
            'Verify the service name is correct (easypanel, traefik, docker, nginx)',
            'Check if the service is installed and running',
            'Try using system commands to check service status manually',
          ],
        });
      }
    }
  }

  /**
   * Get system service logs
   */
  async getSystemServiceLogs(
    serviceName: string,
    options?: {
      lines?: number;
      follow?: boolean;
      since?: string;
      until?: string;
    }
  ): Promise<string[]> {
    await this.ensureAuthenticated();

    try {
      // Try the dedicated system logs endpoint first
      const result = await this.query('system.getServiceLogs', {
        serviceName,
        lines: options?.lines || 100,
        follow: options?.follow || false,
        since: options?.since,
        until: options?.until,
      });

      return (result as any).logs || [];
    } catch (error) {
      // Fallback to Docker container logs if it's a containerized service
      try {
        const containerName = this.mapServiceToContainer(serviceName);
        if (containerName) {
          const logOptions = {
            lines: options?.lines || 100,
            timestamps: true,
            ...options,
          };

          const containerLogs = await this.getServiceLogs('system', containerName, logOptions);
          return containerLogs.logs.map(log =>
            `${log.timestamp} [${log.level.toUpperCase()}] ${log.message}`
          );
        }
      } catch (dockerError) {
        // If Docker approach fails too
      }

      throw new EasyPanelError({
        message: `Unable to fetch logs for service: ${serviceName}`,
        category: ErrorCategory.EASYPANEL_API,
        operation: 'getSystemServiceLogs',
        originalError: error as Error,
        suggestions: [
          'Verify the service name is correct',
          'Check if you have sufficient permissions to access service logs',
          'Try using journalctl or docker logs commands directly',
        ],
      });
    }
  }

  /**
   * Helper method to map service names to container names
   */
  private mapServiceToContainer(serviceName: string): string | null {
    const serviceToContainerMap: Record<string, string> = {
      'easypanel': 'easypanel',
      'traefik': 'traefik',
      'nginx': 'nginx-proxy',
    };

    return serviceToContainerMap[serviceName] || null;
  }

  /**
   * Helper method to get service health status (used internally)
   */
  private async getServiceHealthStatus(serviceName: string): Promise<{
    status: string;
    health: 'healthy' | 'unhealthy' | 'unknown';
  }> {
    try {
      const status = await this.getServiceStatus(serviceName);
      return {
        status: status.status,
        health: status.health,
      };
    } catch (error) {
      return {
        status: 'unknown',
        health: 'unknown',
      };
    }
  }

  // ==================== SYSTEM DETECTION & MONITORING ====================

  /**
   * Get server IP address(es)
   */
  async getServerIPAddress(
    includePrivate: boolean = true,
    includeIPv6: boolean = false,
    publicOnly: boolean = false
  ): Promise<Array<{
    address: string;
    family: 'IPv4' | 'IPv6';
    type: 'public' | 'private';
    interface?: string;
    isPrimary: boolean;
  }>> {
    await this.ensureAuthenticated();

    try {
      // Try EasyPanel's system info endpoint first
      const systemInfo = await this.query('system.getServerIPs', {
        includePrivate,
        includeIPv6,
        publicOnly,
      }).catch(() => null) as any;

      if (systemInfo?.addresses) {
        return systemInfo.addresses;
      }

      // Fallback to manual detection
      const interfaces = os.networkInterfaces();
      const addresses: Array<{
        address: string;
        family: 'IPv4' | 'IPv6';
        type: 'public' | 'private';
        interface?: string;
        isPrimary: boolean;
      }> = [];

      let publicIP: string | null = null;
      let primaryInterface: string | null = null;

      // Get public IP via external service
      try {
        const publicIPResponse = await fetch('https://api.ipify.org?format=json', {
          signal: AbortSignal.timeout(5000),
        });
        const publicData = await publicIPResponse.json() as { ip: string };
        publicIP = publicData?.ip;
      } catch (error) {
        console.error('[EasyPanel] Failed to fetch public IP:', error);
      }

      // Process network interfaces
      for (const [ifaceName, ifaceInfo] of Object.entries(interfaces)) {
        if (!ifaceInfo) continue;

        for (const info of ifaceInfo) {
          if (info.family === 'IPv6' && !includeIPv6) continue;
          if (info.internal) continue;

          const isPrivate = this.isPrivateIP(info.address);
          if (publicOnly && isPrivate) continue;
          if (!includePrivate && isPrivate) continue;

          addresses.push({
            address: info.address,
            family: info.family as 'IPv4' | 'IPv6',
            type: isPrivate ? 'private' : 'public',
            interface: ifaceName,
            isPrimary: false,
          });

          // Mark primary interface and primary IP
          if (!primaryInterface && !isPrivate) {
            primaryInterface = ifaceName;
          }
        }
      }

      // Mark primary IP
      addresses.forEach(addr => {
        if (addr.address === publicIP || (addr.interface === primaryInterface && addr.type === 'public')) {
          addr.isPrimary = true;
        }
      });

      // Sort addresses: public first, then primary, then by interface
      addresses.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'public' ? -1 : 1;
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return (a.interface || '').localeCompare(b.interface || '');
      });

      return addresses;
    } catch (error) {
      throw new EasyPanelError({
        message: 'Failed to get server IP addresses',
        category: ErrorCategory.EASYPANEL_API,
        operation: 'getServerIPAddress',
        originalError: error as Error,
        suggestions: [
          'Check network connectivity',
          'Verify permissions for network interface access',
          'Ensure the server has network interfaces configured',
        ],
      });
    }
  }

  /**
   * Get EasyPanel panel domain URL
   */
  async getPanelDomain(
    includeDefaultPort: boolean = false,
    checkSSL: boolean = true
  ): Promise<{
    primaryDomain: string;
    allDomains: Array<{
      domain: string;
      type: 'panel' | 'service' | 'custom';
      ssl: boolean;
      sslStatus?: 'valid' | 'expired' | 'invalid' | 'none';
      expiresAt?: string;
    }>;
    panelUrl: string;
    serverUrl: string;
    detectedFrom: 'config' | 'interface' | 'ip' | 'fallback';
  }> {
    await this.ensureAuthenticated();

    try {
      // Try to get from EasyPanel's domain configuration
      let domainInfo: any = null;
      let detectedFrom: 'config' | 'interface' | 'ip' | 'fallback' = 'fallback';

      try {
        domainInfo = await this.query('system.getPanelDomain');
        detectedFrom = 'config';
      } catch (error) {
        // If failed, try to detect from network interface
        const ips = await this.getServerIPAddress(true, false, false);
        const publicIP = ips.find(ip => ip.type === 'public')?.address;

        if (publicIP) {
          // Assume panel runs on standard ports
          domainInfo = {
            primaryDomain: publicIP,
            domains: [
              {
                domain: publicIP,
                type: 'panel',
                ssl: false,
                sslStatus: 'none',
              }
            ]
          };
          detectedFrom = 'ip';
        } else {
          // Last resort: use localhost
          domainInfo = {
            primaryDomain: 'localhost',
            domains: [
              {
                domain: 'localhost',
                type: 'panel',
                ssl: false,
                sslStatus: 'none',
              }
            ]
          };
          detectedFrom = 'fallback';
        }
      }

      // Process domains and check SSL if requested
      const allDomains = await Promise.all(
        domainInfo.domains.map(async (domain: any) => {
          const result = { ...domain };

          if (checkSSL && domain.ssl) {
            try {
              const sslInfo = await this.checkSSLCertificate(domain.domain);
              result.sslStatus = sslInfo.status;
              result.expiresAt = sslInfo.expiresAt;
            } catch (error) {
              result.sslStatus = 'invalid';
            }
          } else if (!domain.ssl) {
            result.sslStatus = 'none';
          }

          return result;
        })
      );

      // Build URLs
      const protocol = domainInfo.primaryDomain.includes('localhost') || !allDomains.find(d => d.sslStatus === 'valid')
        ? 'http'
        : 'https';

      let primaryDomain = domainInfo.primaryDomain;
      const port = process.env.EASYPANEL_PORT || '3000';

      // Add port if non-standard and requested
      if (includeDefaultPort || (port !== '80' && port !== '443' && port !== '3000')) {
        // Add port only if not already in domain
        if (!primaryDomain.includes(':')) {
          primaryDomain += `:${port}`;
        }
      }

      const panelUrl = `${protocol}://${primaryDomain}`;
      const serverUrl = this.baseUrl || `${protocol}://${primaryDomain}`;

      return {
        primaryDomain: domainInfo.primaryDomain,
        allDomains,
        panelUrl,
        serverUrl,
        detectedFrom,
      };
    } catch (error) {
      throw new EasyPanelError({
        message: 'Failed to detect panel domain',
        category: ErrorCategory.EASYPANEL_API,
        operation: 'getPanelDomain',
        originalError: error as Error,
        suggestions: [
          'Check EasyPanel configuration for domain settings',
          'Verify DNS resolution for configured domains',
          'Ensure SSL certificates are properly configured',
          'Check if EasyPanel is running on expected ports',
        ],
      });
    }
  }

  /**
   * Get comprehensive system information
   */
  async getSystemInfo(
    includeDocker: boolean = true,
    includeNetwork: boolean = true,
    includeServices: boolean = true
  ): Promise<{
    hostname: string;
    platform: string;
    arch: string;
    os: {
      type: string;
      release: string;
      uptime: number;
      loadAverage: number[];
    };
    cpu: {
      model: string;
      cores: number;
      speed: number;
      usage: {
        user: number;
        system: number;
        idle: number;
        total: number;
      };
    };
    memory: {
      total: number;
      free: number;
      used: number;
      cached: number;
      buffers: number;
      swap: {
        total: number;
        used: number;
        free: number;
      };
    };
    disk: Array<{
      mountpoint: string;
      total: number;
      used: number;
      free: number;
      usagePercent: number;
      filesystem: string;
    }>;
    network?: Array<{
      interface: string;
      type: string;
      speed: number;
      mtu: number;
      rx: {
        bytes: number;
        packets: number;
        errors: number;
      };
      tx: {
        bytes: number;
        packets: number;
        errors: number;
      };
    }>;
    docker?: {
      version: string;
      containers: {
        total: number;
        running: number;
        stopped: number;
        paused: number;
      };
      images: {
        total: number;
        size: number;
      };
      volumes: {
        total: number;
        size: number;
      };
      system: {
        'Docker Root Dir': string;
        'Index Server Address': string;
        'Registry Mirrors': string[];
      };
    };
    services?: Array<{
      name: string;
      status: 'running' | 'stopped' | 'error';
      enabled: boolean;
      uptime?: number;
      pid?: number;
      memory?: {
        rss: number;
        vms: number;
      };
      cpu?: {
        percent: number;
      };
    }>;
    timestamp: string;
  }> {
    await this.ensureAuthenticated();

    try {
      // Try to get system info from EasyPanel
      let systemInfo: any = null;

      try {
        systemInfo = await this.query('system.getSystemInfo', {
          includeDocker,
          includeNetwork,
          includeServices,
        });
      } catch (error) {
        // Fallback to OS module
        systemInfo = await this.getFallbackSystemInfo(includeDocker, includeServices);
      }

      // Add timestamp
      systemInfo.timestamp = new Date().toISOString();

      return systemInfo;
    } catch (error) {
      throw new EasyPanelError({
        message: 'Failed to get system information',
        category: ErrorCategory.EASYPANEL_API,
        operation: 'getSystemInfo',
        originalError: error as Error,
        suggestions: [
          'Check if system monitoring tools are installed',
          'Ensure sufficient permissions to read system metrics',
          'Verify Docker daemon is running (if Docker info requested)',
          'Check system resource availability',
        ],
      });
    }
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(
    checks?: Array<'disk' | 'memory' | 'cpu' | 'docker' | 'services' | 'network' | 'ssl'>,
    verbose: boolean = false,
    thresholdWarning: number = 80,
    thresholdCritical: number = 95
  ): Promise<{
    overall: 'healthy' | 'warning' | 'critical' | 'error';
    checks: {
      disk?: {
        status: 'healthy' | 'warning' | 'critical';
        usagePercent: number;
        thresholds: { warning: number; critical: number };
        details: any;
      };
      memory?: {
        status: 'healthy' | 'warning' | 'critical';
        usagePercent: number;
        thresholds: { warning: number; critical: number };
        details: any;
      };
      cpu?: {
        status: 'healthy' | 'warning' | 'critical';
        usagePercent: number;
        thresholds: { warning: number; critical: number };
        details: any;
      };
      docker?: {
        status: 'healthy' | 'unhealthy' | 'error';
        details: any;
        issues: string[];
      };
      services?: {
        status: 'healthy' | 'warning' | 'critical';
        services: Array<{
          name: string;
          status: 'running' | 'stopped' | 'error';
          critical: boolean;
        }>;
        failedCount: number;
      };
      network?: {
        status: 'healthy' | 'warning' | 'critical';
        connectivity: {
          internet: boolean;
          dns: boolean;
          docker: boolean;
        };
        details: any;
      };
      ssl?: {
        status: 'healthy' | 'warning' | 'critical';
        certificates: Array<{
          domain: string;
          status: 'valid' | 'expired' | 'expiring' | 'invalid';
          daysToExpiry?: number;
        }>;
      };
    };
    warnings: string[];
    criticals: string[];
    errors: string[];
    summary: {
      totalChecks: number;
      passed: number;
      warnings: number;
      critical: number;
      errors: number;
    };
  }> {
    await this.ensureAuthenticated();

    try {
      // Default to all checks if not specified
      const checksToRun = checks || ['disk', 'memory', 'cpu', 'docker', 'services', 'network', 'ssl'];
      const warningThreshold = Math.min(thresholdWarning, 95);
      const criticalThreshold = Math.min(Math.max(thresholdWarning, thresholdCritical), 99);

      // Initialize result
      const healthCheckResult: any = {
        overall: 'healthy',
        checks: {},
        warnings: [],
        criticals: [],
        errors: [],
        summary: {
          totalChecks: checksToRun.length,
          passed: 0,
          warnings: 0,
          critical: 0,
          errors: 0,
        },
      };

      // Get system info once to use across checks
      const systemInfo = await this.getSystemInfo(true, true, true);

      // Disk health check
      if (checksToRun.includes('disk')) {
        const diskCheck = await this.checkDiskHealth(systemInfo.disk, warningThreshold, criticalThreshold, verbose);
        healthCheckResult.checks.disk = diskCheck;
        if (diskCheck.status === 'warning') healthCheckResult.warnings.push('Disk usage high');
        if (diskCheck.status === 'critical') healthCheckResult.criticals.push('Disk usage critical');
      }

      // Memory health check
      if (checksToRun.includes('memory')) {
        const memoryCheck = await this.checkMemoryHealth(systemInfo.memory, warningThreshold, criticalThreshold, verbose);
        healthCheckResult.checks.memory = memoryCheck;
        if (memoryCheck.status === 'warning') healthCheckResult.warnings.push('Memory usage high');
        if (memoryCheck.status === 'critical') healthCheckResult.criticals.push('Memory usage critical');
      }

      // CPU health check
      if (checksToRun.includes('cpu')) {
        const cpuCheck = await this.checkCpuHealth(systemInfo.cpu, warningThreshold, criticalThreshold, verbose);
        healthCheckResult.checks.cpu = cpuCheck;
        if (cpuCheck.status === 'warning') healthCheckResult.warnings.push('CPU usage high');
        if (cpuCheck.status === 'critical') healthCheckResult.criticals.push('CPU usage critical');
      }

      // Docker health check
      if (checksToRun.includes('docker') && systemInfo.docker) {
        const dockerCheck = await this.checkDockerHealth(systemInfo.docker, verbose);
        healthCheckResult.checks.docker = dockerCheck;
        if (dockerCheck.status !== 'healthy') healthCheckResult.errors.push('Docker service issues');
      }

      // Services health check
      if (checksToRun.includes('services') && systemInfo.services) {
        const servicesCheck = await this.checkServicesHealth(systemInfo.services, verbose);
        healthCheckResult.checks.services = servicesCheck;
        if (servicesCheck.status === 'warning') healthCheckResult.warnings.push('Some services issues');
        if (servicesCheck.status === 'critical') healthCheckResult.criticals.push('Critical services failing');
      }

      // Network health check
      if (checksToRun.includes('network')) {
        const networkCheck = await this.checkNetworkHealth(verbose);
        healthCheckResult.checks.network = networkCheck;
        if (networkCheck.status === 'warning') healthCheckResult.warnings.push('Network issues detected');
        if (networkCheck.status === 'critical') healthCheckResult.criticals.push('Network connectivity issues');
      }

      // SSL certificate check
      if (checksToRun.includes('ssl')) {
        const sslCheck = await this.checkSSLHealth(verbose);
        healthCheckResult.checks.ssl = sslCheck;
        if (sslCheck.status === 'warning') healthCheckResult.warnings.push('SSL certificates expiring soon');
        if (sslCheck.status === 'critical') healthCheckResult.criticals.push('SSL certificate issues');
      }

      // Calculate overall status
      if (healthCheckResult.errors.length > 0) {
        healthCheckResult.overall = 'error';
      } else if (healthCheckResult.criticals.length > 0) {
        healthCheckResult.overall = 'critical';
      } else if (healthCheckResult.warnings.length > 0) {
        healthCheckResult.overall = 'warning';
      }

      // Update summary
      healthCheckResult.summary.warnings = healthCheckResult.warnings.length;
      healthCheckResult.summary.critical = healthCheckResult.criticals.length;
      healthCheckResult.summary.errors = healthCheckResult.errors.length;
      healthCheckResult.summary.passed = healthCheckResult.summary.totalChecks -
        healthCheckResult.summary.warnings -
        healthCheckResult.summary.critical -
        healthCheckResult.summary.errors;

      return healthCheckResult;
    } catch (error) {
      throw new EasyPanelError({
        message: 'Failed to perform health check',
        category: ErrorCategory.EASYPANEL_API,
        operation: 'performHealthCheck',
        originalError: error as Error,
        suggestions: [
          'Check system monitoring permissions',
          'Ensure all required services are accessible',
          'Verify network connectivity for external checks',
          'Check Docker daemon status (if Docker checks enabled)',
        ],
      });
    }
  }

  // ==================== HELPER METHODS ====================

  /**
   * Check if IP address is private
   */
  private isPrivateIP(ip: string): boolean {
    // IPv4 private ranges
    const ipv4PrivateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2\d|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./, // Link-local
    ];

    // IPv6 private ranges
    const ipv6PrivateRanges = [
      /^fc00:/, // Unique local
      /^fe80:/, // Link-local
      /^::1/,    // Loopback
    ];

    if (ip.includes(':')) {
      // IPv6
      return ipv6PrivateRanges.some(range => range.test(ip));
    } else {
      // IPv4
      return ipv4PrivateRanges.some(range => range.test(ip));
    }
  }

  /**
   * Check SSL certificate details
   */
  private async checkSSLCertificate(domain: string): Promise<{
    status: 'valid' | 'expired' | 'invalid' | 'none';
    expiresAt?: string;
    daysToExpiry?: number;
  }> {
    try {
      // Node.js TLS check
      const tls = await import('tls');

      return new Promise((resolve) => {
        const socket = tls.connect(443, domain, { timeout: 5000 }, () => {
          const cert = socket.getPeerCertificate();
          socket.destroy();

          if (!cert || Object.keys(cert).length === 0) {
            resolve({ status: 'none' });
            return;
          }

          const now = new Date();
          const expires = new Date(cert.valid_to);
          const daysToExpiry = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          let status: 'valid' | 'expired' | 'invalid';
          if (now > expires) {
            status = 'expired';
          } else if (daysToExpiry < 7) {
            status = 'invalid'; // Will expire soon
          } else {
            status = 'valid';
          }

          resolve({
            status,
            expiresAt: cert.valid_to,
            daysToExpiry,
          });
        });

        socket.on('error', () => {
          resolve({ status: 'none' });
        });

        socket.setTimeout(5000, () => {
          socket.destroy();
          resolve({ status: 'invalid' });
        });
      });
    } catch (error) {
      return { status: 'invalid' };
    }
  }

  /**
   * Get fallback system information using Node.js modules
   */
  private async getFallbackSystemInfo(includeDocker: boolean, includeServices: boolean): Promise<any> {
    const systemInfo: any = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      os: {
        type: os.type(),
        release: os.release(),
        uptime: os.uptime(),
        loadAverage: os.loadavg(),
      },
      cpu: {
        model: os.cpus()[0]?.model || 'Unknown',
        cores: os.cpus().length,
        speed: os.cpus()[0]?.speed || 0,
        usage: { user: 0, system: 0, idle: 100, total: 100 },
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        cached: 0,
        buffers: 0,
        swap: { total: 0, used: 0, free: 0 },
      },
      disk: [],
      network: [], // Would need additional dependencies for full network stats
    };

    // Add disk info
    try {
      const { stdout } = await execAsync('df -h | grep -E "^/dev/"');
      const lines = stdout.split('\n').filter(line => line);

      systemInfo.disk = lines.map(line => {
        const parts = line.trim().split(/\s+/);
        return {
          mountpoint: parts[5],
          total: this.parseSize(parts[1]),
          used: this.parseSize(parts[2]),
          free: this.parseSize(parts[3]),
          usagePercent: parseFloat(parts[4]),
          filesystem: parts[0],
        };
      });
    } catch (error) {
      // Disk info unavailable
    }

    // Add Docker info
    if (includeDocker) {
      try {
        const { stdout } = await execAsync('docker version --format "{{.Server.Version}}"');
        const { stdout: dockerInfo } = await execAsync('docker system df --format "{{.Type}}\t{{.Size}}\t{{.Count}}"');

        systemInfo.docker = {
          version: stdout.trim(),
          containers: { total: 0, running: 0, stopped: 0, paused: 0 },
          images: { total: 0, size: 0 },
          volumes: { total: 0, size: 0 },
          system: {
            'Docker Root Dir': '/var/lib/docker',
            'Index Server Address': 'https://index.docker.io/v1/',
            'Registry Mirrors': [],
          },
        };
      } catch (error) {
        // Docker info unavailable
      }
    }

    // Add services info
    if (includeServices) {
      try {
        const services = ['easypanel', 'traefik', 'docker', 'nginx'];
        systemInfo.services = await Promise.all(
          services.map(async name => {
            try {
              const { stdout } = await execAsync(`systemctl is-active ${name}`);
              const { stdout: enabled } = await execAsync(`systemctl is-enabled ${name}`);

              return {
                name,
                status: stdout.trim() === 'active' ? 'running' : 'stopped',
                enabled: enabled.trim() === 'enabled',
              };
            } catch (error) {
              return {
                name,
                status: 'error' as const,
                enabled: false,
              };
            }
          })
        );
      } catch (error) {
        // Services info unavailable
      }
    }

    return systemInfo;
  }

  /**
   * Parse size string (e.g., "10G", "500M") to bytes
   */
  private parseSize(sizeStr: string): number {
    const units: { [key: string]: number } = {
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024,
      'T': 1024 * 1024 * 1024 * 1024,
    };

    const match = sizeStr.match(/^(\d+)([KMGT]?)$/);
    if (!match) return 0;

    const [, numStr, unit] = match;
    const num = parseInt(numStr, 10);
    return num * (units[unit] || 1);
  }

  /**
   * Check disk health
   */
  private async checkDiskHealth(
    disks: any[],
    warningThreshold: number,
    criticalThreshold: number,
    verbose: boolean
  ): Promise<any> {
    let overallUsage = 0;
    let maxUsage = 0;
    const criticalMounts: string[] = [];

    for (const disk of disks) {
      overallUsage += disk.usagePercent;
      maxUsage = Math.max(maxUsage, disk.usagePercent);
      if (disk.usagePercent >= criticalThreshold) {
        criticalMounts.push(disk.mountpoint);
      }
    }

    const avgUsage = disks.length > 0 ? overallUsage / disks.length : 0;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (maxUsage >= criticalThreshold) {
      status = 'critical';
    } else if (maxUsage >= warningThreshold) {
      status = 'warning';
    }

    return {
      status,
      usagePercent: maxUsage,
      thresholds: { warning: warningThreshold, critical: criticalThreshold },
      details: verbose ? {
        disks,
        average: avgUsage,
        criticalMounts,
      } : { maxUsage, criticalMounts: criticalMounts.length },
    };
  }

  /**
   * Check memory health
   */
  private async checkMemoryHealth(
    memory: any,
    warningThreshold: number,
    criticalThreshold: number,
    verbose: boolean
  ): Promise<any> {
    const usagePercent = (memory.used / memory.total) * 100;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (usagePercent >= criticalThreshold) {
      status = 'critical';
    } else if (usagePercent >= warningThreshold) {
      status = 'warning';
    }

    return {
      status,
      usagePercent: Math.round(usagePercent * 100) / 100,
      thresholds: { warning: warningThreshold, critical: criticalThreshold },
      details: verbose ? memory : {
        total: memory.total,
        used: memory.used,
        free: memory.free,
      },
    };
  }

  /**
   * Check CPU health
   */
  private async checkCpuHealth(
    cpu: any,
    warningThreshold: number,
    criticalThreshold: number,
    verbose: boolean
  ): Promise<any> {
    // Simplified CPU usage (would need more sophisticated monitoring)
    const loadAverage = os.loadavg()[0];
    const usagePercent = Math.min((loadAverage / cpu.cores) * 100, 100);

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (usagePercent >= criticalThreshold) {
      status = 'critical';
    } else if (usagePercent >= warningThreshold) {
      status = 'warning';
    }

    return {
      status,
      usagePercent: Math.round(usagePercent * 100) / 100,
      thresholds: { warning: warningThreshold, critical: criticalThreshold },
      details: verbose ? {
        ...cpu,
        loadAverage: os.loadavg(),
      } : {
        cores: cpu.cores,
        loadAverage: loadAverage,
      },
    };
  }

  /**
   * Check Docker health
   */
  private async checkDockerHealth(docker: any, verbose: boolean): Promise<any> {
    const issues: string[] = [];
    let status: 'healthy' | 'unhealthy' | 'error' = 'healthy';

    if (!docker.version) {
      issues.push('Docker daemon not responding');
      status = 'error';
    }

    if (docker.containers && docker.containers.total > 100) {
      issues.push('High number of containers');
      if (status === 'healthy') status = 'unhealthy';
    }

    if (docker.images && docker.images.size > 50 * 1024 * 1024 * 1024) { // 50GB
      issues.push('Large Docker image cache');
      if (status === 'healthy') status = 'unhealthy';
    }

    return {
      status,
      details: verbose ? docker : {
        containerCount: docker.containers?.total || 0,
        imageCount: docker.images?.total || 0,
      },
      issues,
    };
  }

  /**
   * Check services health
   */
  private async checkServicesHealth(services: any[], verbose: boolean): Promise<any> {
    const failedCount = services.filter(s => s.status !== 'running').length;
    const criticalFailures = services.filter(s => s.status !== 'running' && (s.name === 'easypanel' || s.name === 'docker')).length;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalFailures > 0) {
      status = 'critical';
    } else if (failedCount > 0) {
      status = 'warning';
    }

    return {
      status,
      services,
      failedCount,
    };
  }

  /**
   * Check network health
   */
  private async checkNetworkHealth(verbose: boolean): Promise<any> {
    const checks = {
      internet: false,
      dns: false,
      docker: false,
    };

    // Check internet connectivity
    try {
      await execAsync('curl -s --max-time 3 https://google.com > /dev/null');
      checks.internet = true;
    } catch (error) {
      // No internet
    }

    // Check DNS resolution
    try {
      await new Promise((resolve, reject) => {
        dns.resolve('google.com', (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });
      checks.dns = true;
    } catch (error) {
      // DNS issue
    }

    // Check Docker network
    try {
      const { stdout } = await execAsync('docker network ls --format "{{.Name}}" | head -1');
      checks.docker = stdout.trim().length > 0;
    } catch (error) {
      // Docker network issue
    }

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (passedChecks === 0) {
      status = 'critical';
    } else if (passedChecks < totalChecks) {
      status = 'warning';
    }

    return {
      status,
      connectivity: checks,
      details: verbose ? {
        passed: passedChecks,
        total: totalChecks,
      } : undefined,
    };
  }

  /**
   * Check SSL certificate health
   */
  private async checkSSLHealth(verbose: boolean): Promise<any> {
    const certs = [];
    let status: 'healthy' | 'warning' | 'critical' | 'error' = 'healthy';

    try {
      const domainInfo = await this.getPanelDomain(false, true);

      for (const domain of domainInfo.allDomains) {
        if (!domain.ssl || domain.type === 'panel') continue;

        const sslInfo = await this.checkSSLCertificate(domain.domain);
        certs.push({
          domain: domain.domain,
          status: sslInfo.status,
          daysToExpiry: sslInfo.daysToExpiry,
        });

        if (sslInfo.status === 'expired') {
          status = 'critical';
        } else if (sslInfo.status === 'invalid' && (sslInfo.daysToExpiry || 0) < 30 && status !== 'critical') {
          status = 'warning';
        }
      }
    } catch (error) {
      // SSL check failed
      status = 'error';
    }

    return {
      status,
      certificates: certs,
    };
  }
}

// Singleton instance
let clientInstance: EasyPanelClient | null = null;

export function getClient(): EasyPanelClient {
  if (!clientInstance) {
    clientInstance = new EasyPanelClient();
  }
  return clientInstance;
}

// Export error-related utilities for consumers
export function isEasyPanelError(error: unknown): error is EasyPanelError {
  return error instanceof EasyPanelError;
}

export function createErrorFormatter(options: {
  includeSuggestions?: boolean;
  includeCacheHints?: boolean;
  maxSuggestions?: number;
} = {}) {
  return (error: unknown): string => {
    if (error instanceof EasyPanelError) {
      let formatted = `[${error.category}] ${error.message}`;

      if (error.operation) {
        formatted = `[${error.operation}] ${formatted}`;
      }

      if (options.includeSuggestions !== false && error.suggestions.length > 0) {
        const maxSuggestions = options.maxSuggestions || 3;
        const suggestions = error.suggestions.slice(0, maxSuggestions);
        formatted += '\n\nSuggestions:';
        suggestions.forEach((suggestion, index) => {
          formatted += `\n  ${index + 1}. ${suggestion}`;
        });
      }

      if (options.includeCacheHints && error.cacheHints && error.cacheHints.length > 0) {
        formatted += '\n\nCache hints:';
        error.cacheHints.forEach(hint => {
          formatted += `\n  - ${hint}`;
        });
      }

      return formatted;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  };
}