import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * App-wide error boundary. React unmounts the whole tree on an uncaught render
 * error; without a boundary that means a blank white page. This catches it and
 * shows a recoverable panel instead, keeping the surrounding chrome (sidebar)
 * alive so the user can navigate away.
 *
 * Pass `resetKey` (e.g. the current pathname) so navigating to another route
 * clears a previously-caught error automatically.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface it for debugging; replace with a real reporter (Sentry, etc.) later.
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex flex-1 items-center justify-center p-8" data-testid="error-boundary">
        <div className="max-w-lg w-full bg-zinc-900 border border-zinc-800 p-6">
          <div className="flex items-center gap-2.5 mb-3">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
            <h2 className="text-sm font-semibold text-white">Something went wrong on this page</h2>
          </div>
          <p className="text-xs font-mono text-zinc-500 mb-4">
            The page hit an unexpected error and couldn't render. Your data is safe — try again or
            switch to another section from the sidebar.
          </p>
          {error?.message && (
            <pre className="text-[11px] font-mono text-red-300/80 bg-zinc-950 border border-zinc-800 p-3 mb-4 overflow-x-auto whitespace-pre-wrap">
              {String(error.message)}
            </pre>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="flex items-center gap-1.5 px-4 py-2 bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors duration-150"
            >
              <RefreshCw size={13} /> Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors duration-150"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
