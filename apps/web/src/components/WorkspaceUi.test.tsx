// @vitest-environment jsdom

import { useState, type FormEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Asset, AssetVersion, Campaign, GenerationRun } from "../api";
import { GeneratedContent } from "./GeneratedContent";
import {
  AssetCard,
  AppSidebar,
  CampaignDialog,
  CampaignForm,
  HistoryView,
  StrategyCard,
} from "./WorkspaceUi";

afterEach(cleanup);

const blankDraft = {
  name: "",
  brand: "",
  objective: "",
  audience: "",
  tone: "Confident",
  channels: ["LinkedIn"],
  keyMessage: "",
  constraints: "",
};

function CreationHarness({ fail = false }: { fail?: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(blankDraft);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (fail) {
      setError("Could not create campaign.");
      return;
    }
    setSelected({
      id: "new-campaign",
      ...value,
      createdAt: "2026-09-18T10:00:00.000Z",
    });
    setOpen(false);
  };
  return (
    <>
      <AppSidebar
        view="campaigns"
        onChange={vi.fn()}
        onNewCampaign={() => setOpen(true)}
        campaigns={selected ? [selected] : []}
        activeId={selected?.id}
        onOpenCampaign={vi.fn()}
        userName="Test user"
        userEmail="test@example.com"
        userButton={<span>User</span>}
      />
      <CampaignDialog
        open={open}
        value={value}
        creating={false}
        error={error}
        onChange={setValue}
        onSubmit={submit}
        onClose={() => setOpen(false)}
      />
      {selected && <p data-testid="selected-campaign">{selected.name}</p>}
    </>
  );
}

async function completeCampaignForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/Campaign name/), "Autumn launch");
  await user.type(screen.getByLabelText(/Brand \/ product/), "CreativeFlow");
  await user.type(screen.getByLabelText(/Campaign objective/), "Drive trials");
  await user.type(screen.getByLabelText(/Target audience/), "Creative teams");
  await user.clear(screen.getByLabelText(/Tone of voice/));
  await user.type(screen.getByLabelText(/Tone of voice/), "Direct");
  await user.type(screen.getByLabelText(/Key message/), "Create faster");
  return user;
}

const asset: Asset = {
  id: "asset-1",
  campaignId: "campaign-1",
  kind: "COPY",
  title: "Launch copy",
  status: "READY",
  createdAt: "2026-09-18T10:00:00.000Z",
};
const version: AssetVersion = {
  id: "version-1",
  assetId: asset.id,
  sequence: 1,
  content: "**Headline:**&#x20;Move faster\n\n- Clear\n- Confident",
  reviewStatus: "READY",
  createdAt: "2026-09-18T10:01:00.000Z",
};

describe("polished workspace components", () => {
  it("formats safe lightweight markdown and decodes visible entities", () => {
    const html = renderToStaticMarkup(
      <GeneratedContent content={version.content} />,
    );
    expect(html).toContain("<strong>Headline:</strong> Move faster");
    expect(html).toContain("<li>Clear</li>");
    expect(html).not.toContain("&amp;#x20;");
  });

  it("shows an explicit strategy loading state", () => {
    const html = renderToStaticMarkup(
      <StrategyCard strategy={null} loading disabled onGenerate={vi.fn()} />,
    );
    expect(html).toContain("Generating strategy…");
    expect(html).toContain('role="status"');
  });

  it("keeps campaign creation disabled until required fields are valid", () => {
    const html = renderToStaticMarkup(
      <CampaignForm
        value={{
          name: "",
          brand: "",
          objective: "",
          audience: "",
          tone: "Confident",
          channels: ["LinkedIn"],
          keyMessage: "",
          constraints: "",
        }}
        creating={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(html).toContain("Campaign name");
    expect(html).toContain("Target audience");
    expect(html).toContain("disabled");
  });

  it("renders review actions and intentional version hierarchy", () => {
    const html = renderToStaticMarkup(
      <AssetCard
        asset={asset}
        versions={[version]}
        expanded
        regenerating={false}
        reviewing={false}
        onToggle={vi.fn()}
        onRegenerate={vi.fn()}
        onReview={vi.fn()}
      />,
    );
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
    expect(html).toContain("Version history");
    expect(html).toContain("Latest");
  });

  it("renders provider model and unavailable metadata cleanly", () => {
    const run: GenerationRun = {
      id: "run-1",
      campaignId: "campaign-1",
      operation: "asset-copy",
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      status: "SUCCEEDED",
      latencyMs: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      errorCategory: null,
      createdAt: "2026-09-18T10:02:00.000Z",
    };
    const html = renderToStaticMarkup(
      <HistoryView loading={false} runs={[run]} />,
    );
    expect(html).toContain("gemini-3.5-flash-lite");
    expect(html).toContain("Not reported");
    expect(html).not.toContain("undefined");
  });
});

describe("campaign creation dialog", () => {
  it("opens from the primary New campaign action", async () => {
    render(<CreationHarness />);
    await userEvent.click(
      screen.getByRole("button", { name: /New campaign/i }),
    );
    expect(
      screen.getByRole("dialog", { name: "Create campaign" }),
    ).toBeTruthy();
  });

  it("closes with Cancel when submission is not active", async () => {
    render(<CreationHarness />);
    await userEvent.click(
      screen.getByRole("button", { name: /New campaign/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps submission disabled until every required field is valid", async () => {
    render(<CreationHarness />);
    await userEvent.click(
      screen.getByRole("button", { name: /New campaign/i }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Create campaign",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await completeCampaignForm();
    expect(
      (
        screen.getByRole("button", {
          name: "Create campaign",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("locks dismissal and shows the submission loading state", () => {
    const onClose = vi.fn();
    render(
      <CampaignDialog
        open
        value={{ ...blankDraft, name: "Launch" }}
        creating
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );
    expect(screen.getByText("Creating campaign…")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(
      (
        screen.getByRole("button", {
          name: /Close create campaign/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("closes and exposes the newly selected campaign after success", async () => {
    render(<CreationHarness />);
    await userEvent.click(
      screen.getByRole("button", { name: /New campaign/i }),
    );
    const user = await completeCampaignForm();
    await user.click(screen.getByRole("button", { name: "Create campaign" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("selected-campaign").textContent).toBe(
      "Autumn launch",
    );
  });

  it("keeps the dialog open with useful feedback after an error", async () => {
    render(<CreationHarness fail />);
    await userEvent.click(
      screen.getByRole("button", { name: /New campaign/i }),
    );
    const user = await completeCampaignForm();
    await user.click(screen.getByRole("button", { name: "Create campaign" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "Could not create campaign",
    );
  });
});
