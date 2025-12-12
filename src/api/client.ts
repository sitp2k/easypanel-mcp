/**
 * EasyPanel API Client
 * Handles authentication and all tRPC API calls
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
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