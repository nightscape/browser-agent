import { test, expect } from "@playwright/test";
import {
  SENSAI_SERVER,
  threadLocators,
  settingsButton,
  exportImportButton,
  expectThreadEmpty,
  expectComposerReady,
  dismissSettingsDialog,
} from "./fixtures";

test.describe("SensAI App (normal page)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${SENSAI_SERVER}/`);
    await page.waitForSelector("text=Data Product Lifecycle Assistant", { timeout: 10_000 });
    await dismissSettingsDialog(page);
  });

  test("page has correct title", async ({ page }) => {
    await expect(page).toHaveTitle("Data Product Lifecycle Assistant");
  });

  test("only request intake is a read-only audit record", async ({ page }) => {
    await page.evaluate(async () => {
      const modulePath = "/src/storage/request-conversations.ts";
      const { handOverDraftIntake } = await import(/* @vite-ignore */ modulePath);
      localStorage.setItem("dpl-request-intake-conversation:draft:intake-source", "Intake & Discovery");
      localStorage.setItem("dpl-request-conversation-messages:draft:intake-source", JSON.stringify({
        "Intake & Discovery": [{ role: "user", content: "Original submitted intake" }],
      }));
      handOverDraftIntake("C7", "intake-source");
      localStorage.setItem("dpl-request-conversation-messages:draft:intake-source", JSON.stringify({
        "Intake & Discovery": [{ role: "user", content: "Later draft change" }],
      }));
      handOverDraftIntake("C7", "intake-source");
    });
    await page.getByRole("button", { name: "Requests", exact: true }).click();
    await page.locator(".dpl-overview-request").filter({ hasText: "C7 Trading" }).click();
    const conversations = page.getByRole("region", { name: "Request conversations", exact: true });
    const intakeRow = conversations.locator(".dpl-request-conversation-row").filter({ hasText: "Intake & Discovery" });
    await expect(intakeRow.locator(".dpl-conversation-audit-label")).toHaveText("Audit record");
    await expect(intakeRow.locator(".dpl-conversation-shield")).toHaveCount(1);
    await expect(intakeRow.locator(".dpl-conversation-rename-button")).toHaveCount(0);
    for (const title of ["Business Jira Review", "STXAD Jira Ticket Preparation", "STXAD Review"]) {
      const row = conversations.locator(".dpl-request-conversation-row").filter({ hasText: title });
      await expect(row.locator(".dpl-conversation-open")).toHaveText(title);
      await expect(row.locator(".dpl-conversation-audit-label")).toHaveCount(0);
      await expect(row.locator(".dpl-conversation-shield")).toHaveCount(0);
    }
    await intakeRow.locator(".dpl-conversation-open").click();
    const intakeChat = page.getByRole("region", { name: "Intake & Discovery Conversation chat", exact: true });
    await expect(intakeChat.getByRole("textbox", { name: "Message", exact: true })).toHaveCount(0);
    await expect(intakeChat.getByText("Audit record · Read-only", { exact: true })).toBeVisible();
    await expect(intakeChat.getByText("Original submitted intake", { exact: true })).toBeVisible();
    await expect(intakeChat.getByText("Later draft change", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "All conversations", exact: true }).click();
    await page.getByRole("button", { name: "+ New conversation", exact: true }).click();
    const supportingChat = page.getByRole("region", { name: "Conversation 5 chat", exact: true });
    await supportingChat.getByRole("textbox", { name: "Message", exact: true }).fill("Supporting discussion");
    await supportingChat.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(supportingChat.getByText("Supporting discussion", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "All conversations", exact: true }).click();
    const supportingRow = conversations.locator(".dpl-request-conversation-row").filter({ hasText: "Conversation 5" });
    await expect(supportingRow.locator(".dpl-conversation-audit-label")).toHaveCount(0);
    await expect(supportingRow.locator(".dpl-conversation-shield")).toHaveCount(0);
    await expect(supportingRow.getByRole("button", { name: "Rename Conversation 5", exact: true })).toBeVisible();
  });

  test("Jira tabs show a read-only One Pager and independent requirements", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("dpl-business-case-draft:TRD-2024-001", JSON.stringify({ purpose: "Submitted business purpose" }));
    });
    await page.getByRole("button", { name: "Requests", exact: true }).click();
    await page.locator(".dpl-overview-request").filter({ hasText: "C7 Trading" }).click();
    await page.getByRole("button", { name: "Business Jira", exact: true }).click();
    const businessForm = page.getByRole("region", { name: "One Pager", exact: true });
    await businessForm.locator("summary").filter({ hasText: /^Purpose$/ }).click();
    const businessField = businessForm.getByRole("textbox", { name: "Purpose", exact: true });
    await expect(businessField).toHaveValue("Submitted business purpose");
    await expect(businessField).toBeDisabled();
    await expect(businessForm.getByRole("combobox", { name: "Request Type", exact: true })).toBeDisabled();
    await expect(businessForm.getByRole("button", { name: "Submit", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "STXAD Jira", exact: true }).click();
    const requirementsForm = page.getByRole("region", { name: "Business Requirements Jira template", exact: true });
    await expect(requirementsForm).toBeVisible();
    await expect(businessForm).toHaveCount(0);
    const requirementsField = requirementsForm.getByRole("textbox", { name: "DP Name (Business display name)", exact: true });
    await requirementsField.fill("Requirements draft regression");

    await page.getByRole("button", { name: "Business Jira", exact: true }).click();
    await businessForm.locator("summary").filter({ hasText: /^Purpose$/ }).click();
    await expect(businessField).toHaveValue("Submitted business purpose");
    await expect(businessField).toBeDisabled();
    await page.getByRole("button", { name: "STXAD Jira", exact: true }).click();
    await expect(requirementsField).toHaveValue("Requirements draft regression");
  });

  test("DPL lifecycle workspace renders", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Lifecycle Tracker" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "My Requests" })).toBeVisible();
  });

  test("recent chats sidebar has a new-thread button", async ({
    page,
  }) => {
    await expect(page.getByText("Recent Chats", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Chat" })).toBeVisible();
  });

  test("empty thread state shows welcome message", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Data Product Lifecycle Assistant" })).toBeVisible();
    await expect(page.getByText("Hi Natali! I'm your Data Product Lifecycle Assistant.")).toBeVisible();
  });

  test("opens the data product intake form", async ({ page }) => {
    await page.getByRole("button", { name: "Forms" }).click();
    await expect(page.getByRole("heading", { name: "Data Product Intake" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
  });

  test("composer is visible and editable", async ({ page }) => {
    const composer = page.getByRole("textbox", { name: "Ask a question or describe what you need..." });
    await expect(composer).toBeVisible();
    await expect(composer).toBeEditable();
  });

  test("settings button is visible", async ({ page }) => {
    await expect(settingsButton(page)).toBeVisible();
  });

  test("export/import button is visible", async ({ page }) => {
    await expect(exportImportButton(page)).toBeVisible();
  });

  test("settings dialog opens on click", async ({ page }) => {
    await settingsButton(page).click();
    await expect(page.getByText("Provider").first()).toBeVisible();
    await expect(page.locator('[aria-label="GitHub personal access token"]')).toBeVisible();
    await expect(page.locator('[aria-label="Atlassian API token"]')).toBeVisible();
  });

  test("can type in composer", async ({ page }) => {
    const composer = page.getByRole("textbox", { name: "Ask a question or describe what you need..." });
    await composer.fill("Hello world");
    await expect(composer).toHaveValue("Hello world");
  });
});

test.describe("SensAI Widget mode (iframe)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${SENSAI_SERVER}/?widget=1`);
    await page.waitForSelector("text=SensAI", { timeout: 10_000 });
    await dismissSettingsDialog(page);
  });

  test("widget header is visible instead of sidebar", async ({ page }) => {
    // No two-column grid in widget mode
    const grid = page.locator('[class*="grid-cols-"]');
    await expect(grid).toHaveCount(0);
    // Widget header bar exists
    await expect(page.locator('button[title="Conversations"]')).toBeVisible();
    await expect(page.locator('button[title="Open in new tab"]')).toBeVisible();
  });

  test("empty thread state shows welcome message", async ({ page }) => {
    await expectThreadEmpty(page);
  });

  test("composer is visible and editable", async ({ page }) => {
    await expectComposerReady(page);
  });

  test("no export/import button in widget mode", async ({ page }) => {
    await expect(exportImportButton(page)).toHaveCount(0);
  });
});
