/**
 * Input Validation Utilities
 * Provides consistent validation for all EasyPanel MCP inputs
 */

import { ValidationError } from './errors.js';

export { ValidationError } from './errors.js';

// Regex patterns
export const VALIDATION_PATTERNS = {
  // Project/Service name: lowercase alphanumeric, hyphens, underscores, 2-64 chars
  PROJECT_SERVICE_NAME: /^[a-z0-9][a-z0-9_-]{1,63}$/,

  // Docker image: registry/repo:tag
  // Examples: nginx:latest, ghcr.io/user/image:tag, registry.example.com:5000/repo:tag
  DOCKER_IMAGE: /^(?:(?:[a-zA-Z0-9.-]+(?:\:[0-9]+)?)\/)?(?:[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*)(?::(?:[\w][\w.-]{0,127}))?$/,

  // URL: http/https
  URL: /^https?:\/\/(?:[-\w.])+(?:\:[0-9]+)?(?:\/(?:[\w\/_.])*(?:\?(?:[\w&=%.])*)?(?:\#(?:[\w.])*)?)?$/,

  // Environment variable: KEY=VALUE format
  ENV_VAR: /^[A-Za-z_][A-Za-z0-9_]*=.*$/,

  // Email for SSL certificates
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  // Domain names
  DOMAIN: /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,

  // Git repository URL
  GIT_REPO: /^(https?:\/\/|git@|ssh:\/\/).+\.git$|^https:\/\/github\.com\/[^\/]+\/[^\/]+$/,
};

// Validation messages
export const VALIDATION_MESSAGES = {
  REQUIRED: (field: string) => `${field} is required`,
  INVALID_FORMAT: (field: string, value: string) => `Invalid ${field} format: "${value}"`,
  TOO_LONG: (field: string, max: number) => `${field} must be ${max} characters or less`,
  TOO_SHORT: (field: string, min: number) => `${field} must be at least ${min} characters`,
  INVALID_CHARS: (field: string, allowed: string) => `${field} contains invalid characters. Only ${allowed} are allowed`,

  PROJECT_NAME: 'Project name must be 2-64 characters, lowercase alphanumeric, hyphens, or underscores, and start with a letter or number',
  SERVICE_NAME: 'Service name must be 2-64 characters, lowercase alphanumeric, hyphens, or underscores, and start with a letter or number',
  DOCKER_IMAGE: 'Docker image must be in format: [registry/]repo[:tag] (e.g., nginx:latest, ghcr.io/user/image:tag)',
  URL: 'URL must start with http:// or https://',
  ENV_VAR: 'Environment variable must be in KEY=VALUE format (e.g., NODE_ENV=production)',
  EMAIL: 'Must be a valid email address',
  DOMAIN: 'Must be a valid domain name (e.g., example.com, sub.example.com)',
  GIT_REPO: 'Must be a valid Git repository URL ending with .git or a GitHub URL',
};

/**
 * Validate project or service name
 */
export function validateProjectServiceName(name: string, type: 'project' | 'service' = 'project'): void {
  if (!name) {
    throw new ValidationError(VALIDATION_MESSAGES.REQUIRED(type === 'project' ? 'Project name' : 'Service name'));
  }

  if (typeof name !== 'string') {
    throw new ValidationError(`${type === 'project' ? 'Project name' : 'Service name'} must be a string`);
  }

  if (name.length < 2) {
    throw new ValidationError(VALIDATION_MESSAGES.TOO_SHORT(type === 'project' ? 'Project name' : 'Service name', 2));
  }

  if (name.length > 64) {
    throw new ValidationError(VALIDATION_MESSAGES.TOO_LONG(type === 'project' ? 'Project name' : 'Service name', 64));
  }

  if (!VALIDATION_PATTERNS.PROJECT_SERVICE_NAME.test(name)) {
    throw new ValidationError(
      type === 'project' ? VALIDATION_MESSAGES.PROJECT_NAME : VALIDATION_MESSAGES.SERVICE_NAME
    );
  }
}

/**
 * Validate Docker image format
 */
export function validateDockerImage(image: string): void {
  if (!image) {
    throw new ValidationError(VALIDATION_MESSAGES.REQUIRED('Docker image'));
  }

  if (typeof image !== 'string') {
    throw new ValidationError('Docker image must be a string');
  }

  if (image.length > 255) {
    throw new ValidationError(VALIDATION_MESSAGES.TOO_LONG('Docker image', 255));
  }

  // Check if it matches Docker image pattern
  const match = image.match(VALIDATION_PATTERNS.DOCKER_IMAGE);
  if (!match) {
    throw new ValidationError(VALIDATION_MESSAGES.DOCKER_IMAGE);
  }

  // Additional validation for registry
  if (match.groups?.registry) {
    const registry = match.groups.registry;
    // Registry should not contain invalid characters
    if (!/^[a-zA-Z0-9.-]+(:[0-9]+)?$/.test(registry)) {
      throw new ValidationError('Invalid registry format in Docker image');
    }

    // Check port range if specified
    const portMatch = registry.match(/:(\d+)$/);
    if (portMatch) {
      const port = parseInt(portMatch[1], 10);
      if (port < 1 || port > 65535) {
        throw new ValidationError('Registry port must be between 1 and 65535');
      }
    }
  }

  // Tag validation
  if (match.groups?.tag) {
    const tag = match.groups.tag;
    // Tag should not be too long and have valid characters
    if (tag.length > 128) {
      throw new ValidationError(VALIDATION_MESSAGES.TOO_LONG('Docker image tag', 128));
    }
  }
}

/**
 * Validate URL format
 */
export function validateUrl(url: string): void {
  if (!url) {
    throw new ValidationError(VALIDATION_MESSAGES.REQUIRED('URL'));
  }

  if (typeof url !== 'string') {
    throw new ValidationError('URL must be a string');
  }

  if (url.length > 2048) {
    throw new ValidationError(VALIDATION_MESSAGES.TOO_LONG('URL', 2048));
  }

  if (!VALIDATION_PATTERNS.URL.test(url)) {
    throw new ValidationError(VALIDATION_MESSAGES.URL);
  }
}

/**
 * Validate Git repository URL
 */
export function validateGitRepo(repo: string): void {
  if (!repo) {
    throw new ValidationError(VALIDATION_MESSAGES.REQUIRED('Git repository URL'));
  }

  if (typeof repo !== 'string') {
    throw new ValidationError('Git repository URL must be a string');
  }

  if (repo.length > 2048) {
    throw new ValidationError(VALIDATION_MESSAGES.TOO_LONG('Git repository URL', 2048));
  }

  // Handle GitHub URLs that might not end with .git
  const githubUrlPattern = /^https:\/\/github\.com\/[^\/]+\/[^\/]+(?:\.git)?$/;
  if (githubUrlPattern.test(repo)) {
    return; // Valid GitHub URL
  }

  // Standard Git repo URLs
  if (!VALIDATION_PATTERNS.GIT_REPO.test(repo)) {
    throw new ValidationError(VALIDATION_MESSAGES.GIT_REPO);
  }
}

/**
 * Validate environment variable format
 */
export function validateEnvVar(env: string): void {
  if (!env) {
    throw new ValidationError(VALIDATION_MESSAGES.REQUIRED('Environment variable'));
  }

  if (typeof env !== 'string') {
    throw new ValidationError('Environment variable must be a string');
  }

  if (env.length > 4096) {
    throw new ValidationError(VALIDATION_MESSAGES.TOO_LONG('Environment variable', 4096));
  }

  if (!VALIDATION_PATTERNS.ENV_VAR.test(env)) {
    throw new ValidationError(VALIDATION_MESSAGES.ENV_VAR);
  }

  // Validate key part
  const [key] = env.split('=');
  if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new ValidationError('Environment variable key must start with letter/underscore and contain only letters, numbers, and underscores');
  }
}

/**
 * Parse and validate multiple environment variables
 */
export function parseAndValidateEnvVars(envString: string): Record<string, string> {
  if (!envString) {
    return {};
  }

  if (typeof envString !== 'string') {
    throw new ValidationError('Environment variables must be a string');
  }

  const envVars: Record<string, string> = {};
  const lines = envString.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    validateEnvVar(trimmed);

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('='); // Preserve = in values

    envVars[key] = value || '';
  }

  return envVars;
}

/**
 * Validate domain name
 */
export function validateDomain(domain: string): void {
  if (!domain) {
    throw new ValidationError(VALIDATION_MESSAGES.REQUIRED('Domain name'));
  }

  if (typeof domain !== 'string') {
    throw new ValidationError('Domain name must be a string');
  }

  if (domain.length > 253) {
    throw new ValidationError(VALIDATION_MESSAGES.TOO_LONG('Domain name', 253));
  }

  if (!VALIDATION_PATTERNS.DOMAIN.test(domain)) {
    throw new ValidationError(VALIDATION_MESSAGES.DOMAIN);
  }
}

/**
 * Validate email address
 */
export function validateEmail(email: string): void {
  if (!email) {
    throw new ValidationError(VALIDATION_MESSAGES.REQUIRED('Email address'));
  }

  if (typeof email !== 'string') {
    throw new ValidationError('Email address must be a string');
  }

  if (email.length > 254) {
    throw new ValidationError(VALIDATION_MESSAGES.TOO_LONG('Email address', 254));
  }

  if (!VALIDATION_PATTERNS.EMAIL.test(email)) {
    throw new ValidationError(VALIDATION_MESSAGES.EMAIL);
  }
}

/**
 * Validate numeric limits
 */
export function validateNumericLimits(
  value: number | string,
  fieldName: string,
  min?: number,
  max?: number,
  isInteger: boolean = false
): number {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    throw new ValidationError(`${fieldName} must be a valid number`);
  }

  if (isInteger && !Number.isInteger(numValue)) {
    throw new ValidationError(`${fieldName} must be an integer`);
  }

  if (min !== undefined && numValue < min) {
    throw new ValidationError(`${fieldName} must be at least ${min}`);
  }

  if (max !== undefined && numValue > max) {
    throw new ValidationError(`${fieldName} must be at most ${max}`);
  }

  return numValue;
}

/**
 * Validate memory limits (in MB)
 */
export function validateMemoryLimit(value: number | string, fieldName: string = 'Memory limit'): number {
  const numMB = validateNumericLimits(value, fieldName, 64, 1024 * 1024, true); // 64MB to 1TB

  // Common memory limits check
  if (numMB < 64) {
    throw new ValidationError(`${fieldName} must be at least 64MB`);
  }

  return numMB;
}

/**
 * Validate CPU limits (in cores)
 */
export function validateCpuLimit(value: number | string, fieldName: string = 'CPU limit'): number {
  const numCores = validateNumericLimits(value, fieldName, 0.1, 64); // 0.1 to 64 cores

  return numCores;
}

/**
 * Validate timeout/duration (in milliseconds)
 */
export function validateTimeout(value: number | string, fieldName: string = 'Timeout'): number {
  const numMs = validateNumericLimits(value, fieldName, 1000, 60 * 60 * 1000, true); // 1s to 1 hour

  return numMs;
}

/**
 * Validate string length
 */
export function validateStringLength(
  value: string,
  fieldName: string,
  minLength: number = 1,
  maxLength: number = 255
): void {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }

  if (value.length < minLength) {
    throw new ValidationError(VALIDATION_MESSAGES.TOO_SHORT(fieldName, minLength));
  }

  if (value.length > maxLength) {
    throw new ValidationError(VALIDATION_MESSAGES.TOO_LONG(fieldName, maxLength));
  }
}

/**
 * Validate required fields in an object
 */
export function validateRequiredFields(obj: Record<string, any>, requiredFields: string[]): void {
  const missing = requiredFields.filter(field => {
    const value = obj[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    throw new ValidationError(
      `Required fields missing: ${missing.join(', ')}`,
      missing.join(', ')
    );
  }
}

/**
 * Validate Dockerfile path
 */
export function validateDockerfilePath(path: string): void {
  if (!path) {
    throw new ValidationError(VALIDATION_MESSAGES.REQUIRED('Dockerfile path'));
  }

  if (typeof path !== 'string') {
    throw new ValidationError('Dockerfile path must be a string');
  }

  // Should not contain .. for security
  if (path.includes('..')) {
    throw new ValidationError('Dockerfile path cannot contain ".." for security reasons');
  }

  // Should be relative path
  if (path.startsWith('/')) {
    throw new ValidationError('Dockerfile path must be relative (not starting with /)');
  }

  // Check valid characters
  if (!/^[a-zA-Z0-9._/-]+$/.test(path)) {
    throw new ValidationError('Dockerfile path contains invalid characters');
  }

  // Must end with Dockerfile
  if (!path.endsWith('Dockerfile')) {
    throw new ValidationError('Dockerfile path must end with "Dockerfile"');
  }
}

/**
 * Validate Git reference (branch or tag)
 */
export function validateGitRef(ref: string): void {
  if (!ref) {
    throw new ValidationError(VALIDATION_MESSAGES.REQUIRED('Git reference'));
  }

  if (typeof ref !== 'string') {
    throw new ValidationError('Git reference must be a string');
  }

  // Git refs can't contain spaces or certain special characters
  if (!/^[a-zA-Z0-9._/-]+$/.test(ref)) {
    throw new ValidationError('Git reference contains invalid characters');
  }

  if (ref.length > 255) {
    throw new ValidationError(VALIDATION_MESSAGES.TOO_LONG('Git reference', 255));
  }
}

/**
 * Batch validation helper
 */
export function validateBatch(validations: Array<{ validate: () => void; field?: string }>): void {
  const errors: Array<{ field?: string; error: Error }> = [];

  for (const { validate, field } of validations) {
    try {
      validate();
    } catch (error) {
      errors.push({ field, error: error as Error });
    }
  }

  if (errors.length > 0) {
    const message = errors.map(e => e.field ? `${e.field}: ${e.error.message}` : e.error.message).join('; ');
    throw new ValidationError(`Validation failed: ${message}`);
  }
}

/**
 * Zod refinement for project/service name validation
 * Allows lowercase alphanumeric, hyphens, and underscores
 */
export function validateProjectServiceNameWithRefine(type: 'project' | 'service' = 'project') {
  return (value: string) => {
    try {
      validateProjectServiceName(value, type);
      return true;
    } catch (error) {
      if (error instanceof ValidationError) {
        return false;
      }
      throw error;
    }
  };
}

// Export all patterns for reuse
export { VALIDATION_PATTERNS as PATTERNS };
export { VALIDATION_MESSAGES as MESSAGES };