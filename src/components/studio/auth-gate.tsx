import type { FormEvent, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { Branding } from "@/components/studio/hooks/use-studio-catalog";
import type { PublicUser } from "@/lib/types";

type AuthGateProps = {
  authLoading: boolean;
  currentUser: PublicUser | null;
  branding: Branding;
  brandMark: ReactNode;
  authMode: "login" | "register";
  authEmail: string;
  authPassword: string;
  authError: string;
  registrationOpen: boolean;
  onSubmitAuth: (event: FormEvent<HTMLFormElement>) => void;
  onAuthEmailChange: (value: string) => void;
  onAuthPasswordChange: (value: string) => void;
  onAuthModeChange: (mode: "login" | "register") => void;
  children: ReactNode;
};

export function AuthGate({
  authLoading,
  currentUser,
  branding,
  brandMark,
  authMode,
  authEmail,
  authPassword,
  authError,
  registrationOpen,
  onSubmitAuth,
  onAuthEmailChange,
  onAuthPasswordChange,
  onAuthModeChange,
  children
}: AuthGateProps) {
  if (authLoading) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <Loader2 className="spin" size={24} />
          <h1>{branding.siteTitle}</h1>
          <p>正在加载账户状态...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="auth-shell">
        <form className="auth-card" data-testid="auth-form" onSubmit={onSubmitAuth}>
          <div className="brand center-brand">
            {brandMark}
            <div>
              <p className="brand-title">{branding.siteTitle}</p>
              <p className="brand-subtitle">Multi-user image workspace</p>
            </div>
          </div>
          <h1>{authMode === "login" ? "登录" : "注册"}</h1>
          <label className="key-field">
            <span>邮箱</span>
            <input className="field" data-testid="auth-email" value={authEmail} onChange={(event) => onAuthEmailChange(event.target.value)} type="email" autoComplete="email" />
          </label>
          <label className="key-field">
            <span>密码</span>
            <input className="field" data-testid="auth-password" value={authPassword} onChange={(event) => onAuthPasswordChange(event.target.value)} type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} />
          </label>
          {authError && <div className="alert">{authError}</div>}
          <button className="primary-button" data-testid="auth-submit" type="submit">
            {authMode === "login" ? "登录" : "创建账号"}
          </button>
          <div className="auth-switch">
            <button className="text-button tiny" type="button" onClick={() => onAuthModeChange("login")}>登录</button>
            <button className="text-button tiny" type="button" disabled={!registrationOpen} onClick={() => onAuthModeChange("register")}>注册</button>
          </div>
          {!registrationOpen && <p className="settings-note">注册已关闭，请联系管理员创建账号。</p>}
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
