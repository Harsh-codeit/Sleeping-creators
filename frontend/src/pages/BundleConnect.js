import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader, ExternalLink } from "lucide-react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function BundleConnect() {
  const { clientId } = useParams();
  const [blocked, setBlocked] = useState(false);
  const [portalUrl, setPortalUrl] = useState(null);
  const [error, setError] = useState("");

  const openPortal = (url) => {
    const popup = window.open(
      url,
      "bundle_connect",
      "width=600,height=700,top=100,left=200,resizable=yes,scrollbars=yes"
    );
    if (!popup) setBlocked(true);
  };

  useEffect(() => {
    const token = localStorage.getItem("sc_token") || localStorage.getItem("token");
    axios
      .get(`${API}/bundle/connect/${clientId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .then(({ data }) => {
        if (data.already_connected) {
          setError(`Instagram already connected as @${data.instagram_username || "your account"}.`);
          return;
        }
        const url = data.url;
        setPortalUrl(url);
        openPortal(url);
      })
      .catch((e) => {
        setError(e.response?.data?.detail || "Could not load connection link. Please try again.");
      });
  }, [clientId]);

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-4 px-6 max-w-sm">
          <ExternalLink size={40} className="text-zinc-400 mx-auto" />
          <div className="text-white font-semibold">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center space-y-4 px-6">
        {blocked ? (
          <>
            <ExternalLink size={40} className="text-zinc-400 mx-auto" />
            <div className="text-white font-semibold">Popup was blocked</div>
            <p className="text-zinc-400 text-sm font-mono max-w-xs">
              Your browser blocked the popup. Click below to connect your Instagram.
            </p>
            {portalUrl && (
              <button
                onClick={() => openPortal(portalUrl)}
                className="mt-2 px-6 py-3 bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors duration-150"
              >
                Connect your Instagram
              </button>
            )}
          </>
        ) : (
          <>
            <Loader size={40} className="text-zinc-400 animate-spin mx-auto" />
            <p className="text-zinc-400 text-sm font-mono">Opening connection window...</p>
          </>
        )}
      </div>
    </div>
  );
}
