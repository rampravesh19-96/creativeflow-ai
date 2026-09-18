import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Image,
  LayoutGrid,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import type {
  Asset,
  AssetVersion,
  Campaign,
  GenerationRun,
  Strategy,
  UsageSummary,
} from "../api";
import { GeneratedContent } from "./GeneratedContent";

export type WorkspaceView = "campaigns" | "history" | "usage";
export interface CampaignDraft {
  name: string;
  brand: string;
  objective: string;
  audience: string;
  tone: string;
  channels: string[];
  keyMessage: string;
  constraints: string;
}

const when = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const latency = (value: number | null) =>
  value === null ? "Not reported" : `${value.toLocaleString()} ms`;
const titleCase = (value: string) =>
  value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (x) => x.toUpperCase());

export function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="loading-screen" role="status">
      <div className="brand-mark">CF</div>
      <span className="spinner dark" />
      <p>{label}</p>
    </main>
  );
}

export function AppSidebar({
  view,
  onChange,
  onNewCampaign,
  campaigns,
  activeId,
  onOpenCampaign,
  userName,
  userEmail,
  userButton,
}: {
  view: WorkspaceView;
  onChange: (view: WorkspaceView) => void;
  onNewCampaign: () => void;
  campaigns: Campaign[];
  activeId?: string;
  onOpenCampaign: (campaign: Campaign) => void;
  userName: string;
  userEmail: string;
  userButton: ReactNode;
}) {
  const nav = [
    ["campaigns", "Campaigns", LayoutGrid],
    ["history", "Generation history", Activity],
    ["usage", "Usage", BarChart3],
  ] as const;
  return (
    <aside className="sidebar" aria-label="Workspace navigation">
      <div className="brand-lockup">
        <span className="brand-mark">CF</span>
        <span>
          <strong>CreativeFlow</strong>
          <small>AI workspace</small>
        </span>
      </div>
      <button className="new-campaign-button" onClick={onNewCampaign}>
        <Plus size={17} aria-hidden="true" />
        <span>New campaign</span>
      </button>
      <p className="nav-label">Workspace</p>
      <nav>
        {nav.map(([id, label, Icon]) => (
          <button
            key={id}
            className={`nav-item ${view === id ? "active" : ""}`}
            aria-current={view === id ? "page" : undefined}
            onClick={() => onChange(id)}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {campaigns.length > 0 && (
        <div className="sidebar-campaigns" aria-label="Campaign library">
          <p className="nav-label">Campaigns</p>
          {campaigns.map((campaign) => (
            <button
              key={campaign.id}
              className={activeId === campaign.id ? "selected" : ""}
              aria-current={activeId === campaign.id ? "true" : undefined}
              onClick={() => onOpenCampaign(campaign)}
            >
              <span>{campaign.brand.slice(0, 2).toUpperCase()}</span>
              <span>
                <strong>{campaign.name}</strong>
                <small>{campaign.brand}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="sidebar-note">
        <Sparkles size={16} aria-hidden="true" />
        <div>
          <strong>Human-led AI</strong>
          <small>Every asset stays reviewable.</small>
        </div>
      </div>
      <div className="account-card">
        {userButton}
        <div>
          <strong>{userName}</strong>
          <small title={userEmail}>{userEmail}</small>
        </div>
      </div>
    </aside>
  );
}

export function PageHeader({ view }: { view: WorkspaceView }) {
  const copy = {
    campaigns: [
      "Campaign studio",
      "Build review-ready creative from a structured brief.",
    ],
    history: [
      "Generation history",
      "Trace provider activity, latency, and usage metadata.",
    ],
    usage: [
      "Usage overview",
      "Understand how your AI production workspace is being used.",
    ],
  }[view];
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">CREATIVEFLOW AI</p>
        <h1>{copy[0]}</h1>
        <p>{copy[1]}</p>
      </div>
      <span className="environment-badge">
        <span /> Production workflow
      </span>
    </header>
  );
}

export function WelcomeState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="welcome-state">
      <div className="welcome-copy">
        <p className="eyebrow">AI CREATIVE PRODUCTION WORKSPACE</p>
        <h2>Turn a campaign brief into review-ready creative assets.</h2>
        <p>
          Move from strategy to approved copy and visuals while keeping
          versions, decisions, and generation metadata in one place.
        </p>
        <button className="button button-large" onClick={onCreate}>
          Create campaign
        </button>
      </div>
      <ol className="workflow-steps" aria-label="CreativeFlow workflow">
        {[
          ["01", "Brief", "Define the campaign outcome."],
          ["02", "Generate", "Create strategy and assets."],
          ["03", "Review", "Compare versions with context."],
          ["04", "Approve", "Keep humans in control."],
        ].map(([n, title, text]) => (
          <li key={n}>
            <span>{n}</span>
            <div>
              <strong>{title}</strong>
              <small>{text}</small>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const fields = [
  ["name", "Campaign name", "Q4 product launch"],
  ["brand", "Brand / product", "NovaFlow"],
  ["objective", "Campaign objective", "Launch our productivity platform"],
  ["audience", "Target audience", "Startup founders and product teams"],
  ["tone", "Tone of voice", "Confident, clear, optimistic"],
  ["keyMessage", "Key message", "Turn ideas into campaigns faster"],
] as const;

export function CampaignForm({
  value,
  creating,
  error,
  onCancel,
  onChange,
  onSubmit,
}: {
  value: CampaignDraft;
  creating: boolean;
  error?: string;
  onCancel?: () => void;
  onChange: (value: CampaignDraft) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const valid = fields.every(([key]) => value[key].trim().length >= 2);
  return (
    <section className="campaign-form-panel">
      <form onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          {fields.map(([key, label, placeholder]) => (
            <label
              key={key}
              className={
                key === "objective" || key === "keyMessage" ? "wide" : ""
              }
            >
              <span>
                {label}
                <b aria-hidden="true">*</b>
              </span>
              {key === "objective" || key === "keyMessage" ? (
                <textarea
                  required
                  minLength={2}
                  rows={3}
                  placeholder={placeholder}
                  value={value[key]}
                  onChange={(e) =>
                    onChange({ ...value, [key]: e.target.value })
                  }
                />
              ) : (
                <input
                  required
                  minLength={2}
                  placeholder={placeholder}
                  value={value[key]}
                  onChange={(e) =>
                    onChange({ ...value, [key]: e.target.value })
                  }
                />
              )}
              {value[key].length > 0 && value[key].trim().length < 2 && (
                <small className="field-error">
                  Enter at least 2 characters.
                </small>
              )}
            </label>
          ))}
        </div>
        {error && (
          <div className="inline-alert" role="alert">
            {error}
          </div>
        )}
        <div className="dialog-footer">
          <button
            className="button button-quiet"
            type="button"
            disabled={creating}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button className="button button-large" disabled={!valid || creating}>
            {creating && <span className="spinner" />}
            {creating ? "Creating campaign…" : "Create campaign"}
          </button>
        </div>
      </form>
    </section>
  );
}

export function CampaignDialog({
  open,
  value,
  creating,
  error,
  onChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  value: CampaignDraft;
  creating: boolean;
  error?: string;
  onChange: (value: CampaignDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const creatingRef = useRef(creating);
  onCloseRef.current = onClose;
  creatingRef.current = creating;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !creatingRef.current) onCloseRef.current();
      if (event.key === "Tab") {
        const focusable = dialog.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), textarea:not([disabled])",
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !creating) onClose();
      }}
    >
      <section
        ref={dialog}
        className="campaign-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-dialog-title"
        aria-describedby="campaign-dialog-description"
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">NEW BRIEF</p>
            <h2 id="campaign-dialog-title">Create campaign</h2>
            <p id="campaign-dialog-description">
              Set the brief CreativeFlow will use to generate your campaign
              strategy and assets.
            </p>
          </div>
          <button
            className="dialog-close"
            aria-label="Close create campaign dialog"
            disabled={creating}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <CampaignForm
          value={value}
          creating={creating}
          error={error}
          onChange={onChange}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      </section>
    </div>
  );
}

export function StrategyCard({
  strategy,
  loading,
  disabled,
  onGenerate,
}: {
  strategy: Strategy | null;
  loading: boolean;
  disabled: boolean;
  onGenerate: () => void;
}) {
  return (
    <section className="surface strategy-card">
      <div className="section-heading">
        <div>
          <span className="ai-label">
            <Sparkles size={13} /> AI strategy
          </span>
          <h2>Creative direction</h2>
          <p>A structured foundation for every generated asset.</p>
        </div>
        <button
          className="button"
          disabled={disabled || loading}
          onClick={onGenerate}
        >
          {loading && <span className="spinner" />}
          {loading
            ? "Generating strategy…"
            : strategy
              ? "Regenerate strategy"
              : "Generate strategy"}
        </button>
      </div>
      {loading ? (
        <StrategySkeleton />
      ) : !strategy ? (
        <div className="empty-card">
          <Target aria-hidden="true" />
          <h3>No strategy generated yet</h3>
          <p>
            Generate a structured direction before producing campaign assets.
          </p>
        </div>
      ) : (
        <div className="strategy-layout">
          <article className="strategy-summary">
            <span>Strategy summary</span>
            <h3>{strategy.summary}</h3>
            <p>{strategy.audienceInsight}</p>
          </article>
          <article>
            <span>Headline concepts</span>
            <ul>
              {strategy.headlineVariants.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article>
            <span>Visual directions</span>
            <ul>
              {strategy.visualConcepts.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      )}
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <span />
      {status}
    </span>
  );
}

export function AssetCard({
  asset,
  versions,
  expanded,
  regenerating,
  reviewing,
  onToggle,
  onRegenerate,
  onReview,
}: {
  asset: Asset;
  versions: AssetVersion[];
  expanded: boolean;
  regenerating: boolean;
  reviewing: boolean;
  onToggle: () => void;
  onRegenerate: () => void;
  onReview: (status: "APPROVED" | "REJECTED") => void;
}) {
  const latest = versions.at(-1);
  const Icon = asset.kind === "IMAGE" ? Image : FileText;
  return (
    <article className="asset-card">
      <header className="asset-header">
        <div className="asset-heading">
          <span className="asset-icon">
            <Icon size={18} />
          </span>
          <div>
            <small>{titleCase(asset.kind)}</small>
            <h3>{asset.title}</h3>
          </div>
        </div>
        <StatusBadge status={asset.status} />
      </header>
      <div className="asset-version-line">
        <span>
          {latest ? `Version ${latest.sequence}` : "No completed version"}
        </span>
        {latest && (
          <time dateTime={latest.createdAt}>{when(latest.createdAt)}</time>
        )}
      </div>
      <div
        className={`asset-preview ${asset.kind === "IMAGE" ? "visual-preview" : ""}`}
      >
        {latest ? (
          asset.kind === "IMAGE" ? (
            <img
              src={latest.content}
              alt={`${asset.title} generated campaign visual`}
            />
          ) : (
            <GeneratedContent content={latest.content} />
          )
        ) : (
          <p className="muted">
            Generation did not produce a reviewable version.
          </p>
        )}
      </div>
      <footer className="asset-actions">
        <button
          className="icon-button"
          onClick={onRegenerate}
          disabled={regenerating}
        >
          {regenerating ? (
            <span className="spinner dark" />
          ) : (
            <RefreshCw size={15} />
          )}
          {regenerating ? "Regenerating…" : "Regenerate"}
        </button>
        {versions.length > 0 && (
          <button
            className="icon-button"
            onClick={onToggle}
            aria-expanded={expanded}
          >
            <Clock3 size={15} />
            Version history
            <ChevronDown className={expanded ? "rotated" : ""} size={14} />
          </button>
        )}
        {asset.status === "READY" && (
          <div className="review-actions">
            <button
              className="review-button reject"
              disabled={reviewing}
              onClick={() => onReview("REJECTED")}
            >
              <X size={15} />
              Reject
            </button>
            <button
              className="review-button approve"
              disabled={reviewing}
              onClick={() => onReview("APPROVED")}
            >
              <Check size={15} />
              Approve
            </button>
          </div>
        )}
      </footer>
      {expanded && (
        <div className="version-drawer">
          <div className="drawer-title">
            <strong>Version history</strong>
            <small>
              {versions.length} saved{" "}
              {versions.length === 1 ? "version" : "versions"}
            </small>
          </div>
          {[...versions].reverse().map((version, index) => (
            <article className="version-item" key={version.id}>
              <div>
                <strong>v{version.sequence}</strong>
                {index === 0 && <span>Latest</span>}
                <time>{when(version.createdAt)}</time>
              </div>
              {asset.kind === "IMAGE" ? (
                <img
                  src={version.content}
                  alt={`${asset.title} version ${version.sequence}`}
                />
              ) : (
                <GeneratedContent content={version.content} />
              )}
            </article>
          ))}
        </div>
      )}
    </article>
  );
}

export function HistoryView({
  loading,
  runs,
}: {
  loading: boolean;
  runs: GenerationRun[];
}) {
  return (
    <section className="surface data-view">
      <div className="data-view-header">
        <div>
          <p className="eyebrow">OBSERVABILITY</p>
          <h2>Generation activity</h2>
        </div>
        <span>{runs.length} recent runs</span>
      </div>
      {loading ? (
        <SkeletonRows />
      ) : runs.length === 0 ? (
        <div className="empty-card">
          <Activity />
          <h3>No generations yet</h3>
          <p>
            Strategy and asset runs will appear here with provider metadata.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Operation</th>
                <th>Status</th>
                <th>Provider / model</th>
                <th>Latency</th>
                <th>Tokens</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const tokens =
                  run.inputTokens === null && run.outputTokens === null
                    ? "Not reported"
                    : (
                        (run.inputTokens ?? 0) + (run.outputTokens ?? 0)
                      ).toLocaleString();
                return (
                  <tr key={run.id}>
                    <td>
                      <strong>{titleCase(run.operation)}</strong>
                      <small>
                        {run.errorCategory
                          ? titleCase(run.errorCategory)
                          : "Generation run"}
                      </small>
                    </td>
                    <td>
                      <StatusBadge status={run.status} />
                    </td>
                    <td>
                      {run.provider}
                      <small>{run.model ?? "Model not reported"}</small>
                    </td>
                    <td>{latency(run.latencyMs)}</td>
                    <td>{tokens}</td>
                    <td>{when(run.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function UsageView({
  loading,
  usage,
}: {
  loading: boolean;
  usage: UsageSummary | null;
}) {
  if (loading)
    return (
      <section className="surface data-view">
        <SkeletonRows />
      </section>
    );
  if (!usage || usage.totalRuns === 0)
    return (
      <section className="surface data-view">
        <div className="empty-card">
          <BarChart3 />
          <h3>No usage recorded yet</h3>
          <p>Metrics will appear after your first generation.</p>
        </div>
      </section>
    );
  const metrics = [
    ["Total generations", usage.totalRuns],
    ["Successful", usage.successfulRuns],
    ["Failed", usage.failedRuns],
    ["Average latency", latency(usage.averageLatencyMs)],
    ["Text generations", usage.textGenerations],
    ["Image generations", usage.imageGenerations],
    [
      "Output tokens",
      usage.tokens > 0 ? usage.tokens.toLocaleString() : "Not reported",
    ],
    [
      "Recorded cost",
      usage.costUsd === null ? "Not reported" : `$${usage.costUsd.toFixed(4)}`,
    ],
  ];
  return (
    <section className="usage-view">
      <div className="metric-grid">
        {metrics.map(([label, value]) => (
          <article className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <section className="surface recent-operations">
        <div className="panel-title">
          <div>
            <p className="eyebrow">RECENT</p>
            <h2>Provider activity</h2>
          </div>
        </div>
        {usage.recent.length === 0 ? (
          <p className="muted">No recent operations.</p>
        ) : (
          usage.recent.map((run) => (
            <div className="recent-row" key={run.id}>
              <span className="operation-icon">
                <Activity size={15} />
              </span>
              <div>
                <strong>{titleCase(run.operation)}</strong>
                <small>
                  {run.provider}
                  {run.model ? ` · ${run.model}` : ""}
                </small>
              </div>
              <StatusBadge status={run.status} />
              <time>{when(run.createdAt)}</time>
            </div>
          ))
        )}
      </section>
    </section>
  );
}

function SkeletonRows() {
  return (
    <div className="skeleton-rows" role="status" aria-label="Loading">
      <span />
      <span />
      <span />
    </div>
  );
}
function StrategySkeleton() {
  return (
    <div className="strategy-skeleton" role="status">
      <span className="skeleton wide" />
      <span className="skeleton" />
      <span className="skeleton short" />
    </div>
  );
}
