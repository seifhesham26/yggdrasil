"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

export class ViewerErrorBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The UI shows a recoverable error without exposing loader internals.
  }

  render() {
    if (this.state.failed) {
      return <div className="viewer-failure" role="alert"><strong>The model could not be displayed</strong><p>The source is still safe in your library. Try the preview again or check the model files.</p><button type="button" onClick={this.props.onRetry}>Retry preview</button></div>;
    }
    return this.props.children;
  }
}
