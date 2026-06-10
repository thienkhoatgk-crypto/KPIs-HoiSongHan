import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-red-600 bg-red-50 rounded-lg m-4">
          <h2 className="text-xl font-bold mb-4">Đã xảy ra lỗi hệ thống!</h2>
          <p className="mb-2 text-sm font-semibold">{this.state.error && this.state.error.toString()}</p>
          <details className="whitespace-pre-wrap text-xs bg-white p-4 rounded border border-red-200 mt-4 overflow-auto max-h-[400px]">
            {this.state.errorInfo?.componentStack || this.state.error?.stack}
          </details>
          <button 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            onClick={() => window.location.reload()}
          >
            Tải lại trang
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
