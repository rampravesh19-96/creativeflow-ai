import { useEffect, useRef, useState, type FormEvent } from "react";
import { SignInButton, UserButton, useAuth, useUser } from "@clerk/clerk-react";
import { Toaster, toast } from "react-hot-toast";
import {
  api,
  ApiError,
  AuthenticationError,
  type Asset,
  type AssetVersion,
  type Campaign,
  type GenerationRun,
  type Strategy,
  type UsageSummary,
} from "./api";
import {
  AppSidebar,
  AssetCard,
  CampaignDialog,
  HistoryView,
  LoadingScreen,
  PageHeader,
  StrategyCard,
  UsageView,
  WelcomeState,
  type CampaignDraft,
  type WorkspaceView,
} from "./components/WorkspaceUi";

const blank: CampaignDraft = {
  name: "",
  brand: "",
  objective: "",
  audience: "",
  tone: "Confident",
  channels: ["LinkedIn"],
  keyMessage: "",
  constraints: "",
};

const friendlyError = (error: unknown, fallback: string) => {
  if (error instanceof ApiError) {
    if (error.status === 429)
      return "AI generation is busy right now. Please try again shortly.";
    if (error.status >= 500)
      return "AI generation is temporarily unavailable. Please try again.";
  }
  return fallback;
};

export default function App() {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const { user } = useUser();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [active, setActive] = useState<Campaign | null>(null);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [versions, setVersions] = useState<Record<string, AssetVersion[]>>({});
  const [form, setForm] = useState<CampaignDraft>(blank);
  const [view, setView] = useState<WorkspaceView>("campaigns");
  const [history, setHistory] = useState<GenerationRun[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [generating, setGenerating] = useState<
    "strategy" | "copy" | "visual" | null
  >(null);
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<Set<string>>(new Set());
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
    new Set(),
  );
  const [authLost, setAuthLost] = useState(false);
  const authLostRef = useRef(false);

  const handleApiError = async (error: unknown) => {
    if (!(error instanceof AuthenticationError)) return false;
    if (authLostRef.current) return true;
    authLostRef.current = true;
    setAuthLost(true);
    setCampaigns([]);
    setActive(null);
    setStrategy(null);
    setAssets([]);
    setVersions({});
    setUsage(null);
    setHistory([]);
    setLoading(false);
    await signOut();
    return true;
  };

  const openCampaign = async (campaign: Campaign) => {
    if (authLostRef.current) return;
    const token = await getToken();
    if (!token) return;
    setActive(campaign);
    setOpening(true);
    try {
      const detail = await api.detail(campaign.id, token);
      const assetVersions = await Promise.all(
        detail.assets.map(
          async (asset) =>
            [asset.id, await api.versions(asset.id, token)] as const,
        ),
      );
      setStrategy(detail.strategy);
      setAssets(detail.assets);
      setVersions(Object.fromEntries(assetVersions));
    } catch (error) {
      if (await handleApiError(error)) return;
      toast.error("Unable to open this campaign. Please try again.");
    } finally {
      setOpening(false);
    }
  };

  const loadCampaigns = async () => {
    if (authLostRef.current) return;
    const token = await getToken({ skipCache: true });
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.campaigns(token);
      setCampaigns(data);
      if (data[0]) await openCampaign(data[0]);
    } catch (error) {
      if (await handleApiError(error)) return;
      toast.error("Unable to load campaigns. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      authLostRef.current = false;
      setAuthLost(false);
      void loadCampaigns();
    }
    if (isLoaded && !isSignedIn) setLoading(false);
  }, [isLoaded, isSignedIn]);

  const changeView = async (next: WorkspaceView) => {
    setView(next);
    setViewError("");
    if (next === "campaigns" || authLostRef.current) return;
    const token = await getToken();
    if (!token) return;
    setViewLoading(true);
    try {
      if (next === "history") setHistory(await api.history(token));
      else setUsage(await api.usage(token));
    } catch (error) {
      if (await handleApiError(error)) return;
      setViewError("Unable to load workspace data. Please try again.");
    } finally {
      setViewLoading(false);
    }
  };

  const createCampaign = async (event: FormEvent) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const token = await getToken();
      if (!token) return;
      const campaign = await api.create(form, token);
      setCampaigns((current) => [campaign, ...current]);
      await openCampaign(campaign);
      setForm(blank);
      setCreateOpen(false);
      setView("campaigns");
      toast.success("Campaign created");
    } catch (error) {
      if (await handleApiError(error)) return;
      const message = friendlyError(error, "Could not create campaign.");
      setCreateError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const generateStrategy = async () => {
    if (!active || generating) return;
    setGenerating("strategy");
    try {
      const token = await getToken();
      if (!token) return;
      setStrategy(await api.strategy(active.id, token));
      toast.success("Strategy generated");
    } catch (error) {
      if (await handleApiError(error)) return;
      toast.error(friendlyError(error, "Strategy generation failed."));
    } finally {
      setGenerating(null);
    }
  };

  const generateAsset = async (kind: "COPY" | "IMAGE") => {
    if (!active || generating) return;
    const mode = kind === "IMAGE" ? "visual" : "copy";
    setGenerating(mode);
    try {
      const token = await getToken();
      if (!token) return;
      const generated = await api.asset(
        active.id,
        {
          kind,
          title: kind === "IMAGE" ? "Campaign visual" : "Campaign copy",
          instruction:
            kind === "IMAGE"
              ? `${active.keyMessage}. Brand: ${active.brand}. Tone: ${active.tone}.`
              : active.keyMessage,
        },
        token,
      );
      setAssets((current) => [generated.asset, ...current]);
      setVersions((current) => ({
        ...current,
        [generated.asset.id]: [generated.version],
      }));
      toast.success(
        kind === "IMAGE" ? "Visual asset generated" : "Copy asset generated",
      );
    } catch (error) {
      if (await handleApiError(error)) return;
      toast.error(
        kind === "IMAGE"
          ? "Image generation failed. Your existing assets were not changed."
          : friendlyError(error, "Copy generation failed."),
      );
    } finally {
      setGenerating(null);
    }
  };

  const regenerate = async (asset: Asset) => {
    if (regenerating.has(asset.id)) return;
    setRegenerating((current) => new Set(current).add(asset.id));
    try {
      const token = await getToken();
      if (!token) return;
      const generated = await api.regenerate(asset.id, asset.title, token);
      setAssets((current) =>
        current.map((item) => (item.id === asset.id ? generated.asset : item)),
      );
      setVersions((current) => ({
        ...current,
        [asset.id]: [...(current[asset.id] ?? []), generated.version],
      }));
      setExpandedVersions((current) => new Set(current).add(asset.id));
      toast.success("New version generated");
    } catch (error) {
      if (await handleApiError(error)) return;
      toast.error(friendlyError(error, "Asset regeneration failed."));
    } finally {
      setRegenerating((current) => {
        const next = new Set(current);
        next.delete(asset.id);
        return next;
      });
    }
  };

  const review = async (id: string, status: "APPROVED" | "REJECTED") => {
    if (!active || reviewing.has(id)) return;
    setReviewing((current) => new Set(current).add(id));
    try {
      const token = await getToken();
      if (!token) return;
      const updated = await api.review(id, status, token);
      setAssets((current) =>
        current.map((asset) => (asset.id === id ? updated : asset)),
      );
      setVersions((current) => ({
        ...current,
        [id]: (current[id] ?? []).map((version, index, all) =>
          index === all.length - 1
            ? { ...version, reviewStatus: status }
            : version,
        ),
      }));
      toast.success(
        status === "APPROVED" ? "Asset approved" : "Asset rejected",
      );
    } catch (error) {
      if (await handleApiError(error)) return;
      toast.error("Could not update the review. Please try again.");
    } finally {
      setReviewing((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const toggleVersions = (id: string) =>
    setExpandedVersions((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!isLoaded) return <LoadingScreen label="Loading your workspace…" />;

  if (!isSignedIn || authLost)
    return (
      <main className="auth-page">
        <div className="auth-mark" aria-hidden="true">
          CF
        </div>
        <section className="auth-card">
          <p className="eyebrow">AI CREATIVE PRODUCTION WORKSPACE</p>
          <h1>Bring every campaign from brief to approval.</h1>
          <p>
            Plan strategy, generate creative assets, and keep human review in
            control—all in one focused workspace.
          </p>
          <SignInButton mode="modal">
            <button className="button button-large">
              Sign in to workspace
            </button>
          </SignInButton>
        </section>
      </main>
    );

  return (
    <main className="app-shell">
      <Toaster
        position="top-right"
        toastOptions={{ duration: 4200, className: "app-toast" }}
      />
      <AppSidebar
        view={view}
        onChange={(next) => void changeView(next)}
        onNewCampaign={() => {
          setCreateError("");
          setCreateOpen(true);
        }}
        campaigns={campaigns}
        activeId={active?.id}
        onOpenCampaign={(campaign) => {
          setView("campaigns");
          void openCampaign(campaign);
        }}
        userName={user?.fullName ?? user?.firstName ?? "Creative workspace"}
        userEmail={user?.primaryEmailAddress?.emailAddress ?? ""}
        userButton={<UserButton />}
      />
      <section className="main-content">
        <PageHeader view={view} />
        {viewError && (
          <div className="inline-alert" role="alert">
            {viewError}
          </div>
        )}
        {view === "history" && (
          <HistoryView loading={viewLoading} runs={history} />
        )}
        {view === "usage" && <UsageView loading={viewLoading} usage={usage} />}
        {view === "campaigns" && (
          <>
            {!active && !loading ? (
              <WelcomeState onCreate={() => setCreateOpen(true)} />
            ) : (
              active && (
                <section className="campaign-workspace" aria-busy={opening}>
                  <div className="campaign-hero">
                    <div>
                      <div className="campaign-kicker">
                        <span>Active campaign</span>
                        <span className="live-dot">Persisted workspace</span>
                      </div>
                      <h2>{active.name}</h2>
                      <p>{active.keyMessage}</p>
                    </div>
                    <dl className="campaign-meta">
                      <div>
                        <dt>Brand</dt>
                        <dd>{active.brand}</dd>
                      </div>
                      <div>
                        <dt>Audience</dt>
                        <dd>{active.audience}</dd>
                      </div>
                      <div>
                        <dt>Tone</dt>
                        <dd>{active.tone}</dd>
                      </div>
                      <div>
                        <dt>Objective</dt>
                        <dd>{active.objective}</dd>
                      </div>
                    </dl>
                  </div>

                  <StrategyCard
                    strategy={strategy}
                    loading={generating === "strategy" || opening}
                    disabled={Boolean(generating)}
                    onGenerate={() => void generateStrategy()}
                  />

                  <section className="section-block">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">PRODUCTION</p>
                        <h2>Creative assets</h2>
                        <p>
                          Generate, review, and iterate without losing prior
                          versions.
                        </p>
                      </div>
                      <div className="generate-area">
                        <span>Generate assets</span>
                        <div className="action-group">
                          <button
                            className="button button-secondary"
                            disabled={Boolean(generating)}
                            onClick={() => void generateAsset("COPY")}
                          >
                            {generating === "copy" && (
                              <span className="spinner" />
                            )}
                            {generating === "copy"
                              ? "Generating copy…"
                              : "Generate copy"}
                          </button>
                          <button
                            className="button"
                            disabled={Boolean(generating)}
                            onClick={() => void generateAsset("IMAGE")}
                          >
                            {generating === "visual" && (
                              <span className="spinner" />
                            )}
                            {generating === "visual"
                              ? "Generating visual…"
                              : "Generate visual"}
                          </button>
                        </div>
                      </div>
                    </div>
                    {generating && generating !== "strategy" && (
                      <div className="generation-placeholder" role="status">
                        <span className="skeleton skeleton-square" />
                        <span>
                          <strong>AI production in progress</strong>
                          <small>
                            Your existing assets remain unchanged while this
                            completes.
                          </small>
                        </span>
                      </div>
                    )}
                    {assets.length === 0 && !generating ? (
                      <div className="empty-card compact">
                        <h3>No creative assets yet</h3>
                        <p>
                          Generate campaign copy or a visual when your strategy
                          is ready.
                        </p>
                      </div>
                    ) : (
                      <div className="asset-grid">
                        {assets.map((asset) => (
                          <AssetCard
                            key={asset.id}
                            asset={asset}
                            versions={versions[asset.id] ?? []}
                            expanded={expandedVersions.has(asset.id)}
                            regenerating={regenerating.has(asset.id)}
                            reviewing={reviewing.has(asset.id)}
                            onToggle={() => toggleVersions(asset.id)}
                            onRegenerate={() => void regenerate(asset)}
                            onReview={(status) => void review(asset.id, status)}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                </section>
              )
            )}
          </>
        )}
      </section>
      <CampaignDialog
        open={createOpen}
        value={form}
        creating={creating}
        error={createError}
        onChange={setForm}
        onSubmit={(event) => void createCampaign(event)}
        onClose={() => {
          if (!creating) setCreateOpen(false);
        }}
      />
    </main>
  );
}
