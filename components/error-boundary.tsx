"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

import { logger } from "@/lib/observability/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary component to catch JavaScript errors in component trees,
 * log those errors, and display a fallback UI instead of crashing the entire app.
 *
 * Place this at strategic boundaries:
 * - Around the entire app (in layout.tsx)
 * - Around major feature sections
 * - Around complex components that are prone to errors
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error to our centralized logger
    logger.error("React Error Boundary caught an error", error, {
      componentStack: errorInfo.componentStack,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided, otherwise use default
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-black">
          <div className="max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              Something went wrong
            </h2>
            <p className="mb-4 text-zinc-600 dark:text-zinc-400">
              We apologize for the inconvenience. The error has been logged and our team will look into it.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Reload page
              </button>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Try again
              </button>
            </div>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Error details (development only)
                </summary>
                <pre className="mt-2 overflow-auto rounded bg-zinc-100 p-3 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  {this.state.error.toString()}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * A simpler error boundary for non-critical UI sections that can degrade
 * gracefully without showing a full-page error.
 */
interface GracefulErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function GracefulErrorBoundary({
  children,
  fallback,
}: GracefulErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={
        fallback || (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            This section could not be loaded. Please refresh the page.
          </div>
        )
      }
      onError={(error) => {
        logger.warn("Graceful error boundary caught non-critical error", {
          message: error.message,
        });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}