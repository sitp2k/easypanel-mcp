/**
 * Progress reporting utilities for long-running operations
 */

export interface ProgressUpdate {
  toolName: string;
  progress: number;
  message: string;
  data?: any;
  timestamp: Date;
}

export class ProgressReporter {
  private sessionId?: string;
  private updateCallback?: (update: ProgressUpdate) => void;

  constructor(sessionId?: string, updateCallback?: (update: ProgressUpdate) => void) {
    this.sessionId = sessionId;
    this.updateCallback = updateCallback;
  }

  update(toolName: string, progress: number, message: string, data?: any) {
    const update: ProgressUpdate = {
      toolName,
      progress,
      message,
      data,
      timestamp: new Date()
    };

    // Always log to stderr (MCP standard)
    console.error(`[Progress] ${toolName}: ${progress}% - ${message}`);

    // Send to callback if available (for SSE streaming)
    if (this.updateCallback) {
      this.updateCallback(update);
    }
  }

  static async withProgress<T>(
    sessionId: string | undefined,
    updateCallback: ((update: ProgressUpdate) => void) | undefined,
    toolName: string,
    operation: (report: ProgressReporter) => Promise<T>
  ): Promise<T> {
    const reporter = new ProgressReporter(sessionId, updateCallback);

    try {
      const result = await operation(reporter);
      reporter.update(toolName, 100, 'Operation completed successfully');
      return result;
    } catch (error) {
      reporter.update(toolName, -1, `Operation failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  step(toolName: string, current: number, total: number, message: string, data?: any) {
    const progress = Math.round((current / total) * 100);
    this.update(toolName, progress, message, data);
  }
}

// Global progress registry for HTTP transport
const progressCallbacks = new Map<string, (update: ProgressUpdate) => void>();

export function registerProgressCallback(sessionId: string, callback: (update: ProgressUpdate) => void) {
  progressCallbacks.set(sessionId, callback);
}

export function unregisterProgressCallback(sessionId: string) {
  progressCallbacks.delete(sessionId);
}

export function getProgressCallback(sessionId: string): ((update: ProgressUpdate) => void) | undefined {
  return progressCallbacks.get(sessionId);
}

// Helper function to run operations with progress
export async function runWithProgress<T>(
  sessionId: string | undefined,
  toolName: string,
  operation: (report: (progress: number, message: string, data?: any) => void) => Promise<T>
): Promise<T> {
  const updateCallback = sessionId ? getProgressCallback(sessionId) : undefined;

  return ProgressReporter.withProgress(sessionId, updateCallback, toolName, async (reporter) => {
    return await operation((progress, message, data) => {
      reporter.update(toolName, progress, message, data);
    });
  });
}

export default ProgressReporter;