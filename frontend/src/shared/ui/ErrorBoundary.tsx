'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert } from './Alert';

interface ErrorBoundaryProps {
  children: ReactNode;
  label: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Isolates a section so one broken widget cannot blank the whole page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    console.error(`[${this.props.label}]`, error);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <Alert tone="danger" title={`${this.props.label} could not be displayed`}>
          Please refresh the page. Your reservations are not affected.
        </Alert>
      );
    }
    return this.props.children;
  }
}
