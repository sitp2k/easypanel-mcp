/**
 * Custom error classes
 */

// Validation error class - standalone to avoid circular dependency
export class ValidationError extends Error {
  public readonly field?: string;
  public readonly value?: string;

  constructor(message: string, field?: string, value?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}