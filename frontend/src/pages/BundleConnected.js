import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle } from "lucide-react";

export default function BundleConnected() {
  const [params] = useSearchParams();
  const error = params.get("error");

  useEffect(() => {
    if (window.opener && !error) {
      window.opener.postMessage({ type: "BUNDLE_AUTH", success: true }, window.location.origin);
      setTimeout(() => window.close(), 1800);
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center space-y-4 px-6">
        {error ? (
          <>
            <div className="text-red-400 font-semibold">Connection failed</div>
            <p className="text-zinc-400 text-xs font-mono max-w-xs">{error}</p>
          </>
        ) : (
          <>
            <CheckCircle size={40} className="text-emerald-400 mx-auto" />
            <div className="text-white font-semibold">Instagram Connected!</div>
            <p className="text-zinc-400 text-sm font-mono max-w-xs">
              You're all set — your content will start publishing automatically.
            </p>
            <p className="text-zinc-600 text-xs font-mono">This window will close automatically...</p>
          </>
        )}
      </div>
    </div>
  );
}
