import React from "react";

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("BriefInk renderer error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fatalScreen">
          <h1>BriefInk could not render</h1>
          <p>{this.state.error.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}
