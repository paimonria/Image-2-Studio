import { Check, Loader2, Trash2, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { PublicUser } from "@/lib/types";
import type { AdminOverview } from "@/components/studio/hooks/use-admin-panel";
import { DEFAULT_SITE_TITLE } from "@/components/studio/utils/generation-options";
import { formatDate, formatMilliseconds, formatPercent } from "@/components/studio/utils/format";

type AdminDrawerProps = {
  open: boolean;
  adminOverview: AdminOverview | null;
  adminMessage: string;
  currentUser: PublicUser | null;
  newUserEmail: string;
  newUserPassword: string;
  deletingUserId: string;
  platformOpenaiKey: string;
  platformOpenaiBaseUrl: string;
  platformOpenaiModel: string;
  t: (key: string) => string;
  onClose: () => void;
  onAdminOverviewChange: Dispatch<SetStateAction<AdminOverview | null>>;
  onSaveAdminSettings: (next?: Partial<AdminOverview["settings"]>) => void;
  onPlatformOpenaiKeyChange: (value: string) => void;
  onPlatformOpenaiBaseUrlChange: (value: string) => void;
  onPlatformOpenaiModelChange: (value: string) => void;
  onSavePlatformProvider: () => void;
  onNewUserEmailChange: (value: string) => void;
  onNewUserPasswordChange: (value: string) => void;
  onCreateAdminUser: () => void;
  onToggleUserDisabled: (user: PublicUser) => void;
  onDeleteAdminUser: (user: PublicUser) => void;
};

export function AdminDrawer({
  open,
  adminOverview,
  adminMessage,
  currentUser,
  newUserEmail,
  newUserPassword,
  deletingUserId,
  platformOpenaiKey,
  platformOpenaiBaseUrl,
  platformOpenaiModel,
  t,
  onClose,
  onAdminOverviewChange,
  onSaveAdminSettings,
  onPlatformOpenaiKeyChange,
  onPlatformOpenaiBaseUrlChange,
  onPlatformOpenaiModelChange,
  onSavePlatformProvider,
  onNewUserEmailChange,
  onNewUserPasswordChange,
  onCreateAdminUser,
  onToggleUserDisabled,
  onDeleteAdminUser
}: AdminDrawerProps) {
  return (
    <aside className={`settings-drawer admin-drawer ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <div className="drawer-head">
        <div>
          <p className="section-label">Admin</p>
          <h2>管理后台</h2>
        </div>
        <button className="icon-button" type="button" title={t("closePreview")} onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {adminOverview ? (
        <>
          <section className="drawer-section">
            <p className="section-label">站点设置</p>
            <label className="key-field">
              <span>站点标题</span>
              <input
                className="field"
                maxLength={80}
                placeholder={DEFAULT_SITE_TITLE}
                value={adminOverview.settings.siteTitle ?? ""}
                onChange={(event) => onAdminOverviewChange((current) => current ? {
                  ...current,
                  settings: { ...current.settings, siteTitle: event.target.value }
                } : current)}
              />
            </label>
            <label className="key-field">
              <span>浏览器小图标 URL</span>
              <input
                className="field"
                maxLength={500}
                placeholder="/favicon.ico"
                value={adminOverview.settings.faviconUrl ?? ""}
                onChange={(event) => onAdminOverviewChange((current) => current ? {
                  ...current,
                  settings: { ...current.settings, faviconUrl: event.target.value }
                } : current)}
              />
            </label>
            <label className="key-field">
              <span>品牌 Logo URL</span>
              <input
                className="field"
                maxLength={500}
                placeholder="/logo.png"
                value={adminOverview.settings.logoUrl ?? ""}
                onChange={(event) => onAdminOverviewChange((current) => current ? {
                  ...current,
                  settings: { ...current.settings, logoUrl: event.target.value }
                } : current)}
              />
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={adminOverview.settings.registrationOpen}
                onChange={(event) => onSaveAdminSettings({ registrationOpen: event.target.checked })}
              />
              <span>允许个人自行注册</span>
            </label>
            <label className="key-field">
              <span>平台 key 每日额度</span>
              <input
                className="field"
                type="number"
                min="0"
                value={adminOverview.settings.dailyPlatformQuota}
                onChange={(event) => onAdminOverviewChange((current) => current ? {
                  ...current,
                  settings: { ...current.settings, dailyPlatformQuota: Number(event.target.value) }
                } : current)}
              />
            </label>
            <button className="text-button" type="button" onClick={() => onSaveAdminSettings()}>
              <Check size={16} />
              保存站点设置
            </button>
          </section>

          <section className="drawer-section">
            <p className="section-label">平台供应商</p>
            <div className="filter-stack">
              <label className="field-label">
                <span>
                  OpenAI platform key
                  {adminOverview.platformProvider?.keys?.openai?.configured ? "（已配置；输入新 key 替换）" : ""}
                </span>
                <input className="field" type="password" placeholder="留空不清除旧 key" value={platformOpenaiKey} onChange={(event) => onPlatformOpenaiKeyChange(event.target.value)} />
              </label>
              <label className="field-label">
                <span>OpenAI Base URL（留空使用官方 OpenAI）</span>
                <input className="field" placeholder="https://api.example.com/v1" value={platformOpenaiBaseUrl} onChange={(event) => onPlatformOpenaiBaseUrlChange(event.target.value)} />
              </label>
              <label className="field-label">
                <span>OpenAI model override（留空使用默认模型）</span>
                <input className="field" placeholder="gpt-image-2" value={platformOpenaiModel} onChange={(event) => onPlatformOpenaiModelChange(event.target.value)} />
              </label>
              <button className="primary-button drawer-save" type="button" onClick={onSavePlatformProvider}>
                <Check size={17} />
                保存平台配置
              </button>
            </div>
          </section>

          <section className="drawer-section">
            <p className="section-label">Job queue</p>
            <div className="admin-list">
              <div className="admin-row">
                <div>
                  <strong>{adminOverview.jobQueue.active} / {adminOverview.jobQueue.concurrency}</strong>
                  <span>web inline active / limit</span>
                </div>
                <span>user {adminOverview.jobQueue.userConcurrency}</span>
              </div>
              <div className="admin-row">
                <div>
                  <strong>{adminOverview.jobQueue.pending}</strong>
                  <span>DB pending jobs</span>
                </div>
                <span>DB running {adminOverview.jobQueue.running}</span>
              </div>
              {adminOverview.jobQueue.bullmq && (
                <div className="admin-row">
                  <div>
                    <strong>{adminOverview.jobQueue.bullmq.waiting} / {adminOverview.jobQueue.bullmq.active}</strong>
                    <span>BullMQ waiting / active</span>
                  </div>
                  <span>delayed {adminOverview.jobQueue.bullmq.delayed}</span>
                </div>
              )}
              <div className="admin-row">
                <div>
                  <strong>{adminOverview.jobQueue.recentSucceeded}</strong>
                  <span>succeeded in 1h</span>
                </div>
                <span>failed {adminOverview.jobQueue.recentFailed}</span>
              </div>
              <div className="admin-row">
                <div>
                  <strong>{formatMilliseconds(adminOverview.jobQueue.recent.averageQueueWaitMs)}</strong>
                  <span>avg queue</span>
                </div>
                <span>run {formatMilliseconds(adminOverview.jobQueue.recent.averageExecutionMs)}</span>
              </div>
              <div className="admin-row">
                <div>
                  <strong>{adminOverview.jobQueue.recent.inspected}</strong>
                  <span>recent inspected / failure rate</span>
                </div>
                <span>{formatPercent(adminOverview.jobQueue.recent.inspected > 0 ? (adminOverview.jobQueue.recentFailed / adminOverview.jobQueue.recent.inspected) * 100 : null)}</span>
              </div>
              <div className="admin-row">
                <div>
                  <strong>{formatMilliseconds(adminOverview.jobQueue.recent.averageUpstreamMs)}</strong>
                  <span>avg upstream</span>
                </div>
                <span>save {formatMilliseconds(adminOverview.jobQueue.recent.averageFileSaveMs)}</span>
              </div>
            </div>

            <div className="admin-subsection">
              <p className="section-label">Provider health</p>
              {adminOverview.jobQueue.providerHealth.length > 0 ? (
                <div className="admin-list">
                  {adminOverview.jobQueue.providerHealth.map((item) => (
                    <div className={`admin-row admin-row-status is-${item.status}`} key={item.provider}>
                      <div>
                        <strong>{item.provider}</strong>
                        <span>{item.succeeded} ok / {item.failed} failed / {item.total} total</span>
                      </div>
                      <span>{item.status} {formatPercent(item.failureRate)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="admin-empty">No recent provider jobs.</p>
              )}
            </div>

            <div className="admin-subsection">
              <p className="section-label">Model usage</p>
              {adminOverview.jobQueue.modelUsage.length > 0 ? (
                <div className="admin-list">
                  {adminOverview.jobQueue.modelUsage.map((item) => (
                    <div className="admin-row" key={`${item.provider}:${item.model}`}>
                      <div>
                        <strong>{item.model}</strong>
                        <span>{item.provider} / {item.succeeded} ok / {item.failed} failed</span>
                      </div>
                      <span>{item.total} / {formatMilliseconds(item.averageExecutionMs)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="admin-empty">No recent model usage.</p>
              )}
            </div>

            <div className="admin-subsection">
              <p className="section-label">Failure reasons</p>
              {adminOverview.jobQueue.failureReasons.length > 0 ? (
                <div className="admin-list">
                  {adminOverview.jobQueue.failureReasons.map((item) => (
                    <div className="admin-row admin-row-multiline" key={item.reason}>
                      <div>
                        <strong>{item.reason}</strong>
                        <span>{item.sample}</span>
                      </div>
                      <span>{item.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="admin-empty">No recent failures.</p>
              )}
            </div>
          </section>

          <section className="drawer-section">
            <p className="section-label">创建用户</p>
            <div className="filter-stack">
              <input className="field" type="email" placeholder="user@example.com" value={newUserEmail} onChange={(event) => onNewUserEmailChange(event.target.value)} />
              <input className="field" type="password" placeholder="至少 8 位密码" value={newUserPassword} onChange={(event) => onNewUserPasswordChange(event.target.value)} />
              <button className="text-button" type="button" onClick={onCreateAdminUser}>
                <Check size={16} />
                创建用户
              </button>
            </div>
          </section>

          <section className="drawer-section">
            <p className="section-label">用户</p>
            <div className="admin-list">
              {adminOverview.users.map((user) => (
                <div className="admin-row" key={user.id}>
                  <div>
                    <strong>{user.email}</strong>
                    <span>{user.role}{user.disabled ? " / disabled" : ""}</span>
                  </div>
                  <div className="admin-row-actions">
                    <button className="text-button tiny" type="button" disabled={Boolean(deletingUserId)} onClick={() => onToggleUserDisabled(user)}>
                      {user.disabled ? "启用" : "禁用"}
                    </button>
                    <button
                      className="text-button tiny danger-button"
                      type="button"
                      disabled={Boolean(deletingUserId) || user.id === currentUser?.id}
                      onClick={() => onDeleteAdminUser(user)}
                    >
                      {deletingUserId === user.id ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="drawer-section">
            <p className="section-label">用量</p>
            <div className="admin-list">
              {adminOverview.usage.slice(0, 12).map((item) => (
                <div className="admin-row" key={item.id}>
                  <div>
                    <strong>{item.userEmail}</strong>
                    <span>{item.date}</span>
                  </div>
                  <span>{item.platformUses}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="drawer-section">
            <p className="section-label">最近历史</p>
            <div className="admin-list">
              {adminOverview.images.slice(0, 12).map((item) => (
                <div className="admin-row" key={item.id}>
                  <div>
                    <strong>{item.userEmail}</strong>
                    <span>{item.provider} / {item.model}</span>
                  </div>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="composer-status">
          <Loader2 className="spin" size={17} />
          <span>加载管理数据...</span>
        </div>
      )}
      {adminMessage && <p className="settings-message">{adminMessage}</p>}
    </aside>
  );
}
