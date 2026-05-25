import type { ReactNode } from "react";

type StudioShellProps = {
  settingsOpen: boolean;
  adminOpen: boolean;
  mainClassName: string;
  closeLabel: string;
  settingsDrawer: ReactNode;
  adminDrawer: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
  lightbox: ReactNode;
  onCloseDrawers: () => void;
};

export function StudioShell({
  settingsOpen,
  adminOpen,
  mainClassName,
  closeLabel,
  settingsDrawer,
  adminDrawer,
  topbar,
  children,
  lightbox,
  onCloseDrawers
}: StudioShellProps) {
  return (
    <div className="studio-shell">
      {(settingsOpen || adminOpen) && (
        <button className="drawer-scrim" aria-label={closeLabel} type="button" onClick={onCloseDrawers} />
      )}

      {settingsDrawer}
      {adminDrawer}

      <main className={mainClassName}>
        {topbar}
        {children}
      </main>

      {lightbox}
    </div>
  );
}
