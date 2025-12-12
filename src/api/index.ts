/**
 * EasyPanel API Module
 *
 * This module provides the main exports for the EasyPanel API client,
 * including error handling utilities.
 */

export {
  // Main client class
  EasyPanelClient,

  // Error handling
  EasyPanelError,
  ErrorCategory,
  isEasyPanelError,
  createErrorFormatter,

  // Client factory
  getClient
} from './client.js';

// Re-export types for convenience
export type {
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
} from '../types/easypanel.js';