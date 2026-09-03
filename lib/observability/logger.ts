/**
 * Centralized logging infrastructure for Viatik.
 *
 * Provides a consistent, environment-aware logging interface with:
 * - Structured log format
 * - Environment-aware log levels
 * - Production-safe logging (no sensitive data)
 * - Support for info, warn, error, debug levels
 */

export type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private isProduction: boolean;
  private isDevelopment: boolean;
  private minLevel: LogLevel;

  constructor() {
    this.isProduction = process.env.NODE_ENV === "production";
    this.isDevelopment = process.env.NODE_ENV === "development";
    this.minLevel = this.isProduction ? "info" : "debug";
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!context) return undefined;

    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = [
      "password",
      "token",
      "secret",
      "apiKey",
      "auth",
      "session",
      "credential",
      "private",
      "key",
    ];

    for (const [key, value] of Object.entries(context)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "string" && value.length > 500) {
        // Truncate long strings to avoid log bloat
        sanitized[key] = value.substring(0, 500) + "... [TRUNCATED]";
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private formatLog(entry: LogEntry): string {
    const { level, message, timestamp, context, error } = entry;
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    const errorStr = error ? ` ${error.name}: ${error.message}` : "";
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}${errorStr}`;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: this.sanitizeContext(context),
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: this.isDevelopment ? error.stack : undefined,
          }
        : undefined,
    };

    const formatted = this.formatLog(entry);

    switch (level) {
      case "debug":
        if (this.isDevelopment) console.debug(formatted);
        break;
      case "info":
        console.info(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
        console.error(formatted);
        break;
    }

    // In production, you might want to send logs to a service here
    // e.g., Sentry, DataDog, CloudWatch, etc.
    if (this.isProduction && level === "error") {
      this.sendToErrorTracking();
    }
  }

  private sendToErrorTracking(): void {
    // Placeholder for error tracking integration
    // This could be extended to send errors to Sentry, DataDog, etc.
    // For now, we'll just ensure errors are logged to console
    // Future implementation could include:
    // - Sentry.captureException(entry.error)
    // - DataDog logs
    // - Custom webhook
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log("error", message, context, error);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }
}

// Singleton instance
export const logger = new Logger();

// Convenience exports
export const logInfo = (message: string, context?: Record<string, unknown>) =>
  logger.info(message, context);

export const logWarn = (message: string, context?: Record<string, unknown>) =>
  logger.warn(message, context);

export const logError = (message: string, error?: Error, context?: Record<string, unknown>) =>
  logger.error(message, error, context);

export const logDebug = (message: string, context?: Record<string, unknown>) =>
  logger.debug(message, context);