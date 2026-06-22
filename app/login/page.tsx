"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import Script from "next/script";
import { Sparkles, Shield, Cpu, Info, AlertTriangle, CheckCircle } from "lucide-react";

// Helper to decode JWT from Google Sign-In
function decodeJwt(token: string) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Failed to decode JWT:", error);
    return null;
  }
}

export default function LoginPage() {
  const { login } = useAuth();
  const [clientId, setClientId] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Default fallback client ID for local demonstration
  const defaultClientId = "1029384756-fakeclientid.apps.googleusercontent.com";

  // Watch document theme mode
  useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains("dark");
      setIsDarkMode(isDark);
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Check if user has saved a custom Google Client ID
    const savedId = localStorage.getItem("preceptaai_google_client_id");
    if (savedId) {
      setClientId(savedId);
    } else {
      setClientId(defaultClientId);
    }
  }, []);

  const initializeGoogleSignIn = () => {
    const activeId = clientId || defaultClientId;
    if (typeof window !== "undefined" && (window as any).google) {
      try {
        (window as any).google.accounts.id.initialize({
          client_id: activeId,
          callback: (response: any) => {
            const credential = response.credential;
            const decoded = decodeJwt(credential);
            if (decoded && decoded.email) {
              login({
                name: decoded.name || decoded.email.split("@")[0],
                email: decoded.email,
                picture: decoded.picture || "/favicon.svg",
              });
            } else {
              setErrorMsg("Invalid token received from Google authentication.");
            }
          },
        });

        const btnTheme = isDarkMode ? "filled_dark" : "outline";

        (window as any).google.accounts.id.renderButton(
          document.getElementById("google-signin-button"),
          {
            theme: btnTheme,
            size: "large",
            text: "signin_with",
            shape: "pill",
            width: "320",
          }
        );
      } catch (e) {
        console.error("Error initializing Google Sign-In SDK:", e);
      }
    }
  };

  useEffect(() => {
    // Initialize whenever clientId or theme mode changes
    initializeGoogleSignIn();
  }, [clientId, isDarkMode]);

  const saveClientId = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("preceptaai_google_client_id", clientId);
    setShowConfig(false);
    setErrorMsg("");
    setTimeout(initializeGoogleSignIn, 100);
  };

  const handleSimulateLogin = () => {
    login({
      name: "Guest Explorer",
      email: "guest@preceptaai.com",
      picture: "/favicon.svg",
    });
  };

  const isDefaultClientId = clientId === defaultClientId;

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        onLoad={initializeGoogleSignIn}
        strategy="lazyOnload"
      />

      <div className="min-h-screen bg-gray-50 dark:bg-[#0F1117] text-gray-900 dark:text-white flex flex-col items-center justify-center relative overflow-hidden font-sans transition-colors duration-200">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/[0.05] dark:bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-emerald-600/[0.02] dark:bg-emerald-600/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="z-10 w-full max-w-md px-6">
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center p-3 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 dark:from-indigo-500/10 dark:to-purple-500/10 border border-indigo-500/10 dark:border-indigo-500/20 rounded-2xl shadow-sm mb-4">
              <img src="/favicon.svg" alt="PreceptaAI Logo" className="h-12 w-12" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-900 via-gray-700 to-indigo-900 dark:from-white dark:via-gray-200 dark:to-indigo-200">
              PreceptaAI
            </h1>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2 font-bold tracking-widest uppercase">
              YOUR PRIVATE AI BUSINESS HUB
            </p>
          </div>

          {/* Main Card */}
          <div className="bg-white dark:bg-[#161B22] border border-gray-200 dark:border-[#30363D] rounded-3xl p-8 shadow-xl dark:shadow-black/50 relative">
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Welcome to the Console</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Please log in to manage your local-first agent workflows, nodes, and storage vaults.
                </p>
              </div>

              {errorMsg && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/30 text-red-750 dark:text-red-400 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {errorMsg}
                </div>
              )}

              {/* Google Sign-in Button */}
              <div className="flex flex-col items-center justify-center py-2">
                <div id="google-signin-button" className="min-h-[44px]" />
                <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-3 flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Secure SSL OAuth 2.0 Endpoint
                </span>
              </div>

              {/* Configuration Notice Helper */}
              {isDefaultClientId && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 p-3.5 rounded-2xl text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Google Credentials Required
                  </div>
                  <p className="text-[11px] leading-relaxed text-gray-600 dark:text-amber-200/80">
                    To use Google Sign-In, please configure a client ID registered to your domain (<code className="font-mono bg-amber-100/60 dark:bg-amber-950/50 px-1 py-0.5 rounded text-[10px]">https://console.preceptaai.com</code>). 
                    Otherwise, click the demo mode option below.
                  </p>
                </div>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="h-[1px] bg-gray-200 dark:bg-gray-800 flex-1" />
                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-bold">Or</span>
                <div className="h-[1px] bg-gray-200 dark:bg-gray-800 flex-1" />
              </div>

              {/* Simulation Option */}
              <div className="space-y-3">
                <button
                  onClick={handleSimulateLogin}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold bg-gray-50 hover:bg-gray-100 dark:bg-[#1C2128] dark:hover:bg-gray-800 border border-gray-200 dark:border-[#30363D] text-gray-700 dark:text-gray-300 transition flex items-center justify-center gap-2"
                >
                  <Cpu className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Explore Console (Demo Mode)
                </button>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center leading-relaxed">
                  Bypass Google Sign-In for evaluating client features and local dashboard widgets.
                </p>
              </div>
            </div>

            {/* Custom Client ID Toggle Button */}
            <div className="mt-8 border-t border-gray-150 dark:border-gray-800 pt-4 flex justify-between items-center text-[10px] text-gray-400 dark:text-gray-500">
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="hover:text-indigo-600 dark:hover:text-indigo-400 font-bold transition flex items-center gap-1"
              >
                <Info className="h-3.5 w-3.5" />
                Configure Google Client ID
              </button>
              <span>v1.0.0</span>
            </div>

            {/* Custom Client ID Configuration Panel */}
            {showConfig && (
              <form onSubmit={saveClientId} className="mt-4 p-4 bg-gray-50 dark:bg-black/60 rounded-2xl border border-gray-200 dark:border-gray-800 space-y-3 text-xs">
                <div>
                  <label className="block text-gray-500 dark:text-gray-400 font-bold mb-1 text-[10px]">Google Client ID</label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="Enter Client ID from Google Cloud Console"
                    className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-gray-900 dark:text-white font-mono text-[10px] focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setClientId(defaultClientId);
                      localStorage.removeItem("preceptaai_google_client_id");
                      setShowConfig(false);
                      setTimeout(initializeGoogleSignIn, 100);
                    }}
                    className="flex-1 py-1.5 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-850 border border-gray-250 dark:border-gray-800 text-[10px] text-gray-500 dark:text-gray-400 font-bold transition"
                  >
                    Reset Default
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-[10px] text-white font-bold transition"
                  >
                    Apply Client ID
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Footer Features */}
          <div className="grid grid-cols-3 gap-4 mt-8 text-center text-gray-400 dark:text-gray-500 text-[10px]">
            <div className="flex flex-col items-center">
              <div className="h-7 w-7 rounded-lg bg-white dark:bg-[#161B22] border border-gray-200 dark:border-gray-800 flex items-center justify-center mb-1.5">
                <Shield className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span>Self-Hosted</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-7 w-7 rounded-lg bg-white dark:bg-[#161B22] border border-gray-200 dark:border-gray-800 flex items-center justify-center mb-1.5">
                <Cpu className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span>Local Inference</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-7 w-7 rounded-lg bg-white dark:bg-[#161B22] border border-gray-200 dark:border-gray-800 flex items-center justify-center mb-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span>Private Vaults</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
