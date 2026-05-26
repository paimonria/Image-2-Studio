import { FormEvent, useEffect, useState } from "react";
import type { PublicUser } from "@/lib/types";

type UseAuthSessionOptions = {
  onAuthenticated?: () => void;
  onLoggedOut?: () => void;
};

export function useAuthSession({ onAuthenticated, onLoggedOut }: UseAuthSessionOptions = {}) {
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  async function loadSession() {
    setAuthLoading(true);
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const body = (await response.json()) as { user: PublicUser | null; registrationOpen: boolean };
      setCurrentUser(body.user);
      setRegistrationOpen(body.registrationOpen);
    } finally {
      setAuthLoading(false);
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");

    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: authEmail, password: authPassword })
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string; user?: PublicUser };

    if (!response.ok || !body.user) {
      setAuthError(body.error ?? "Authentication failed.");
      return;
    }

    setCurrentUser(body.user);
    setAuthPassword("");
    onAuthenticated?.();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    onLoggedOut?.();
  }

  async function changePassword(input: { currentPassword: string; newPassword: string }) {
    setChangingPassword(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; user?: PublicUser };

      if (!response.ok || !body.user) {
        return {
          ok: false,
          error: body.error ?? "Password could not be changed."
        };
      }

      setCurrentUser(body.user);
      return { ok: true };
    } finally {
      setChangingPassword(false);
    }
  }

  function resetAuthSession(message?: string) {
    setCurrentUser(null);
    if (message) {
      setAuthError(message);
    }
  }

  useEffect(() => {
    void loadSession().catch(() => {
      setAuthLoading(false);
      setAuthError("Session could not be loaded.");
    });
  }, []);

  return {
    authLoading,
    authMode,
    currentUser,
    registrationOpen,
    authEmail,
    authPassword,
    authError,
    changingPassword,
    setAuthMode,
    setAuthEmail,
    setAuthPassword,
    setAuthError,
    setCurrentUser,
    loadSession,
    submitAuth,
    logout,
    changePassword,
    resetAuthSession
  };
}
