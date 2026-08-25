import { useEffect, useRef, useState } from "react";

import { googleClientId } from "@/components/auth/googleIdentityConfig";

type CredentialResponse = { credential: string };

type GoogleIdentityApi = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: CredentialResponse) => void;
        ux_mode?: "popup";
      }) => void;
      renderButton: (
        container: HTMLElement,
        options: {
          type: "standard";
          theme: "outline";
          size: "large";
          text: "signin_with";
          shape: "pill";
          logo_alignment: "left";
          locale: string;
          width: number;
        },
      ) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

const GOOGLE_SCRIPT_ID = "google-identity-services";
let initializedGoogleClientId: string | null = null;
let activeCredentialCallback: ((credential: string) => void) | null = null;

export default function GoogleSignInButton({
  disabled = false,
  onCredential,
  onLoadError,
}: {
  disabled?: boolean;
  onCredential: (credential: string) => void;
  onLoadError: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!googleClientId || !containerRef.current) return;
    let disposed = false;
    const renderButton = () => {
      if (disposed || !containerRef.current || !window.google) return;
      const container = containerRef.current;
      container.replaceChildren();
      activeCredentialCallback = (credential) => callbackRef.current(credential);
      // GSI configuration is page-global. React Strict Mode can mount this
      // component twice in development; re-initialising causes Google's own
      // warning and adds avoidable work before the popup opens.
      if (initializedGoogleClientId !== googleClientId) {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (response) => activeCredentialCallback?.(response.credential),
          ux_mode: "popup",
        });
        initializedGoogleClientId = googleClientId;
      }
      window.google.accounts.id.renderButton(container, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "pill",
        logo_alignment: "left",
        locale: "vi",
        // Google exposes a fixed 40px "large" button. Render it at a smaller
        // layout width, then scale uniformly so it aligns with Timi's 48px
        // secondary button without stretching the Google mark or text.
        width: Math.floor(container.clientWidth),
      });
      setIsReady(true);
    };

    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (window.google) {
      renderButton();
    } else if (existingScript) {
      existingScript.addEventListener("load", renderButton, { once: true });
      existingScript.addEventListener(
        "error",
        () => onLoadError("Không thể tải đăng nhập Google. Hãy kiểm tra kết nối rồi thử lại."),
        { once: true },
      );
    } else {
      const script = document.createElement("script");
      script.id = GOOGLE_SCRIPT_ID;
      script.src = "https://accounts.google.com/gsi/client?hl=vi";
      script.async = true;
      script.defer = true;
      script.onload = renderButton;
      script.onerror = () => onLoadError("Không thể tải đăng nhập Google. Hãy kiểm tra kết nối rồi thử lại.");
      document.head.appendChild(script);
    }

    return () => {
      disposed = true;
    };
  }, [onLoadError]);

  if (!googleClientId) return null;

  return (
    <div className={`relative flex min-h-12 items-center overflow-hidden rounded-2xl ${disabled ? "pointer-events-none opacity-60" : ""}`}>
      <div
        ref={containerRef}
        className="mx-auto flex h-10 w-5/6 origin-center scale-[1.2] items-center justify-center"
      />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-slate-100 bg-white text-sm font-medium text-slate-500">
          Đang chuẩn bị đăng nhập Google…
        </div>
      )}
    </div>
  );
}
