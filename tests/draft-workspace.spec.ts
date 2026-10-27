import { test, expect, type Page } from "@playwright/test";
import { SENSAI_SERVER, dismissSettingsDialog } from "./fixtures";

async function openDraft(page: Page, legacy = false) {
  await page.evaluate(async ({ legacy }) => {
    const modulePath = "/src/storage/threads.ts";
    const { putThread } = await import(modulePath);
    const threadId = "draft-workspace-regression";
    await putThread({ id: threadId, remoteId: threadId, title: "Shared draft", status: "regular", createdAt: Date.now() });
    localStorage.setItem("dpl-business-case-ids", JSON.stringify({ [threadId]: "business-case-regression" }));
    if (legacy) {
      localStorage.setItem(`dpl-request-conversations:draft:${threadId}`, JSON.stringify(["Renamed intake", "Earlier discussion"]));
      localStorage.setItem(`dpl-request-intake-conversation:draft:${threadId}`, "Renamed intake");
      localStorage.setItem(`dpl-request-conversation-messages:draft:${threadId}`, JSON.stringify({ "Renamed intake": ["Earlier intake message"] }));
      localStorage.setItem(`dpl-conversation-templates:draft:${threadId}`, JSON.stringify({ "Renamed intake": { intention: "Report Issue", id: "legacy-template" } }));
      localStorage.setItem("dpl-intent-template-draft:legacy-template", JSON.stringify({ "affected-data-product": "Existing product" }));
    }
    window.dispatchEvent(new CustomEvent("dpl-open-draft", { detail: { threadId } }));
  }, { legacy });
  const conversations = page.getByRole("region", { name: "Request conversations", exact: true });
  await expect(conversations).toBeVisible();
  await conversations.getByRole("button", { name: legacy ? "Renamed intake" : "Intake & Discovery Conversation", exact: true }).click();
  await expect(page.getByRole("region", { name: legacy ? "Renamed intake chat" : "Intake & Discovery Conversation chat", exact: true })).toBeVisible();
}

test.describe("Shared draft intake", () => {
  test("shows unavailable Jira buttons in draft lifecycle stages", async ({ page }) => {
    await openDraft(page);
    const tracker = page.getByRole("region", { name: "Selected request", exact: true });
    await tracker.getByRole("button", { name: /Inception.*Scoping/ }).click();
    await expect(tracker.getByRole("button", { name: "Business Jira", exact: true })).toBeVisible();
    await expect(tracker.getByRole("button", { name: "Business Jira", exact: true })).toBeDisabled();
    await tracker.getByRole("button", { name: /Analysis.*Design/ }).click();
    await expect(tracker.getByRole("button", { name: "STXAD Jira", exact: true })).toBeVisible();
    await expect(tracker.getByRole("button", { name: "STXAD Jira", exact: true })).toBeDisabled();
  });

  test("enables Template only after intent selection and opens the selected template", async ({ page }) => {
    await openDraft(page);
    const templateButton = page.getByRole("button", { name: "Template", exact: true });
    await expect(templateButton).toBeDisabled();
    await page.getByRole("button", { name: "Choose type", exact: true }).click();
    await page.getByRole("button", { name: "Report Issue", exact: true }).click();
    const template = page.getByRole("region", { name: "Data Product Issue Report template", exact: true });
    await expect(template).toBeVisible();
    await expect(template.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
    await expect(template.getByRole("button", { name: "Submit", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Back to Lifecycle Tracker", exact: true }).click();
    await expect(templateButton).toBeEnabled();
    await templateButton.click();
    await expect(template).toBeVisible();
    await expect(page.getByLabel("Request types", { exact: true })).toHaveCount(0);
  });

  for (const intention of ["Create Regular IT Data Product", "Report Issue"]) {
    test(`submits beside Review and submit for ${intention}`, async ({ page }) => {
      await openDraft(page);
      await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Choose type", exact: true }).click();
      await page.getByRole("button", { name: intention, exact: true }).click();
      await page.getByRole("button", { name: "Back to Lifecycle Tracker", exact: true }).click();
      const reviewRow = page.locator("li").filter({ has: page.getByText("Review and submit", { exact: true }) });
      const submit = reviewRow.getByRole("button", { name: "Submit", exact: true });
      await expect(submit).toBeDisabled();
      await page.getByRole("button", { name: "Template", exact: true }).click();
      const requiredFields = intention === "Report Issue"
        ? ["Affected Data Product", "Issue Summary", "Business Impact", "Evidence or Example", "Severity"]
        : ["Ownership", "Purpose", "Contents", "Benefits", "Primary Consumers", "Business Sponsor"];
      for (const label of requiredFields) {
        const field = page.getByLabel(label, { exact: true });
        const section = page.locator("details").filter({ has: field });
        if (await section.getAttribute("open") === null) await section.locator("summary").click();
        if (label === "Ownership") await field.selectOption({ index: 1 });
        else await field.fill(`Completed ${label}`);
      }
      await page.getByRole("button", { name: "Back to Lifecycle Tracker", exact: true }).click();
      await expect(submit).toBeEnabled();
      const submitBounds = await submit.boundingBox();
      const templateBounds = await page.getByRole("button", { name: "Template", exact: true }).boundingBox();
      expect(submitBounds).not.toBeNull();
      expect(templateBounds).not.toBeNull();
      expect(Math.abs(submitBounds!.x + submitBounds!.width - templateBounds!.x - templateBounds!.width)).toBeLessThan(3);
      await submit.click();
      const confirmation = page.getByRole("dialog");
      await expect(confirmation).toBeVisible();
      await confirmation.getByRole("button", { name: "Keep editing", exact: true }).click();
      await expect(confirmation).not.toBeVisible();
      await submit.click();
      await confirmation.getByRole("button", { name: "Confirm submission", exact: true }).click();
      await expect(reviewRow.getByRole("alert")).toContainText("Your draft is saved; no Jira ticket has been created");
    });
  }

  test("updates submission readiness from intent to review without submitting", async ({ page }) => {
    await openDraft(page);
    const readiness = page.getByRole("region", { name: "Submission readiness", exact: true });
    await expect(readiness.getByText("Needs request type", { exact: true })).toBeVisible();
    await expect(readiness.locator("ol > li")).toHaveCount(5);
    await page.getByRole("button", { name: "Template", exact: true }).click();
    await page.getByRole("button", { name: "Report Issue", exact: true }).click();
    await page.getByRole("button", { name: "Draft Progress", exact: true }).click();
    await expect(readiness.getByText("Needs information", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Template", exact: true }).click();
    for (const label of ["Affected Data Product", "Issue Summary", "Business Impact", "Evidence or Example", "Severity"]) {
      const field = page.locator(`textarea[aria-label="${label}"]`);
      const section = page.locator("details").filter({ has: field });
      if (await section.getAttribute("open") === null) await section.locator("summary").click();
      await field.fill(`Completed ${label}`);
    }
    await page.getByRole("button", { name: "Draft Progress", exact: true }).click();
    await expect(readiness.getByText("Ready for review", { exact: true })).toBeVisible();
    await expect(readiness.getByText("Submit request: Not submitted", { exact: true })).toBeVisible();
    await expect(readiness.getByText("Official request created: Pending", { exact: true })).toBeVisible();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${SENSAI_SERVER}/`);
    await page.waitForSelector("text=Data Product Lifecycle Assistant");
    await dismissSettingsDialog(page);
  });

  test("creates multiple independent drafts and preserves them after reload", async ({ page }) => {
    for (const title of ["First independent draft", "Second independent draft"]) {
      await page.getByRole("button", { name: "New request", exact: true }).click();
      const dialog = page.getByRole("form", { name: "Create new request", exact: true });
      await dialog.getByRole("textbox", { name: "Request name", exact: true }).fill(title);
      await dialog.getByRole("button", { name: "Create draft", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Request conversations", exact: true })).toBeVisible();
      await expect(page.locator(".dpl-request-chat:visible")).toHaveCount(0);
    }
    await page.reload();
    await dismissSettingsDialog(page);
    const drafts = await page.evaluate(async () => {
      const modulePath = "/src/storage/threads.ts";
      const { listThreads } = await import(modulePath);
      const threads = await listThreads() as Array<{ id: string; title?: string }>;
      const ids = JSON.parse(localStorage.getItem("dpl-business-case-ids") ?? "{}") as Record<string, string>;
      return threads.filter((thread) => ["First independent draft", "Second independent draft"].includes(thread.title ?? ""))
        .map((thread) => ({ ...thread, templateId: ids[thread.id] }));
    });
    expect(drafts).toHaveLength(2);
    expect(new Set(drafts.map((draft) => draft.id)).size).toBe(2);
    expect(drafts.every((draft) => Boolean(draft.templateId))).toBe(true);
    expect(new Set(drafts.map((draft) => draft.templateId)).size).toBe(2);
    for (const draft of drafts) {
      await page.evaluate((threadId) => {
        window.dispatchEvent(new CustomEvent("dpl-open-draft", { detail: { threadId } }));
      }, draft.id);
      await expect(page.getByRole("region", { name: "Request conversations", exact: true })).toBeVisible();
      await expect(page.locator(".dpl-request-chat:visible")).toHaveCount(0);
      await expect(page.getByLabel("Request types", { exact: true })).toBeVisible();
    }
  });

  test("new request opens only a dialog and cancel preserves the workspace", async ({ page }) => {
    await openDraft(page);
    await page.getByRole("button", { name: "Report Issue", exact: true }).click();
    await page.getByRole("textbox", { name: "Affected Data Product", exact: true }).fill("Existing draft product");
    await page.getByRole("button", { name: "New request", exact: true }).click();
    const dialog = page.getByRole("form", { name: "Create new request", exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Draft template editor", exact: true })).toBeVisible();
    await expect(page.locator(".dpl-request-home:visible")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Affected Data Product", exact: true })).toHaveValue("Existing draft product");
  });

  test("shows one draft-level template shared by all conversations", async ({ page }) => {
    await openDraft(page);
    await page.getByRole("button", { name: "Create Regular IT Data Product", exact: true }).click();
    const editor = page.getByRole("complementary", { name: "Draft template editor", exact: true });
    await expect(editor.getByRole("combobox", { name: "Request Type", exact: true })).toHaveValue("Create Regular IT Data Product");
    await expect(editor.getByRole("combobox", { name: "Request Type", exact: true })).toBeDisabled();
    await editor.locator("summary").filter({ hasText: /^Purpose$/ }).click();
    await editor.getByRole("textbox", { name: "Purpose", exact: true }).fill("One shared purpose");

    await page.getByRole("button", { name: "All conversations", exact: true }).click();
    await expect(page.getByRole("button", { name: "Delete Intake & Discovery", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rename Intake & Discovery", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "+ New conversation", exact: true }).click();
    await expect(page.getByRole("region", { name: "Conversation 2 chat", exact: true })).toBeVisible();
    await expect(page.getByLabel("Request types", { exact: true })).toHaveCount(0);
    await expect(editor).toBeVisible();
    await expect(page.getByRole("button", { name: "Show editor", exact: true })).toHaveCount(0);
    await expect(editor).toHaveCount(1);
    const chatBounds = await page.getByRole("region", { name: "Conversation 2 chat", exact: true }).boundingBox();
    const editorBounds = await editor.boundingBox();
    expect(chatBounds).not.toBeNull();
    expect(editorBounds).not.toBeNull();
    expect(editorBounds!.x).toBeGreaterThanOrEqual(chatBounds!.x + chatBounds!.width);
    await expect(editor.getByRole("textbox", { name: "Purpose", exact: true })).toHaveValue("One shared purpose");
    await expect(page.getByRole("button", { name: "Submit", exact: true })).toHaveCount(1);

    await expect(page.getByRole("region", { name: "Conversation 2 chat", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "All conversations", exact: true }).click();
    await page.getByRole("button", { name: "Delete Conversation 2", exact: true }).click();
    await page.getByRole("button", { name: "Delete conversation", exact: true }).click();
    await expect(editor.getByRole("textbox", { name: "Purpose", exact: true })).toHaveValue("One shared purpose");

    await page.reload();
    await dismissSettingsDialog(page);
    await openDraft(page);
    await expect(page.getByLabel("Request types", { exact: true })).toHaveCount(0);
    await editor.locator("summary").filter({ hasText: /^Purpose$/ }).click();
    await expect(editor.getByRole("textbox", { name: "Purpose", exact: true })).toHaveValue("One shared purpose");
  });
  test("deletes draft intake without restoring it on reload or losing the template", async ({ page }) => {
    await openDraft(page);
    await page.getByRole("button", { name: "Report Issue", exact: true }).click();
    await page.getByRole("textbox", { name: "Affected Data Product", exact: true }).fill("Retained template");
    await page.getByRole("button", { name: "All conversations", exact: true }).click();
    await page.getByRole("button", { name: "Delete Intake & Discovery", exact: true }).click();
    await page.getByRole("button", { name: "Delete conversation", exact: true }).click();
    await expect(page.locator(".dpl-conversation-open")).toHaveCount(0);
    await page.reload();
    await dismissSettingsDialog(page);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("dpl-open-draft", { detail: { threadId: "draft-workspace-regression" } })));
    await expect(page.getByRole("region", { name: "Request conversations", exact: true })).toBeVisible();
    await expect(page.locator(".dpl-conversation-open")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Affected Data Product", exact: true })).toHaveValue("Retained template");
    await page.getByRole("button", { name: "+ New conversation", exact: true }).click();
    await expect(page.getByRole("region", { name: "Intake & Discovery Conversation chat", exact: true })).toBeVisible();
  });

  test("selects intent once in the right panel outside conversations", async ({ page }) => {
    await openDraft(page);
    const picker = page.getByRole("complementary", { name: "Draft intent selection", exact: true });
    await expect(picker.getByRole("heading", { name: "Template", exact: true })).toBeVisible();
    await expect(picker.getByLabel("Request types", { exact: true })).toBeVisible();
    const bodyBounds = await picker.locator(".dpl-draft-intent-picker-body").boundingBox();
    const choicesBounds = await picker.getByLabel("Request types", { exact: true }).boundingBox();
    expect(Math.abs(choicesBounds!.y + choicesBounds!.height / 2 - bodyBounds!.y - bodyBounds!.height / 2)).toBeLessThan(3);
    const chat = page.getByRole("region", { name: "Intake & Discovery Conversation chat", exact: true });
    await expect(chat.getByLabel("Request types", { exact: true })).toHaveCount(0);
    const chatBounds = await chat.boundingBox();
    const pickerBounds = await picker.boundingBox();
    expect(pickerBounds!.x).toBeGreaterThanOrEqual(chatBounds!.x + chatBounds!.width);
    await page.getByRole("button", { name: "All conversations", exact: true }).click();
    await page.getByRole("button", { name: "+ New conversation", exact: true }).click();
    await expect(page.getByLabel("Request types", { exact: true })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Draft template editor", exact: true })).toHaveCount(0);
    await picker.getByRole("button", { name: "Report Issue", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Draft template editor", exact: true }).getByRole("heading", { name: "Template", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Data Product Issue Report template", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "All conversations", exact: true }).click();
    await page.getByRole("button", { name: "Intake & Discovery Conversation", exact: true }).click();
    await expect(page.getByLabel("Request types", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Data Product Issue Report template", exact: true })).toBeVisible();
  });

  test("requires confirmation of an AI-proposed intent", async ({ page }) => {
    await page.route("**/api/draft-intake", async (route) => {
      expect(route.request().postDataJSON().isIntake).toBe(true);
      await route.fulfill({ json: { reply: "This sounds like an issue affecting an existing product. I recommend Report Issue.", proposedIntention: "Report Issue" } });
    });
    await openDraft(page);
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Our existing product has missing records.");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("button", { name: "Confirm request type", exact: true })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Draft template editor", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Confirm request type", exact: true }).click();
    await expect(page.getByRole("button", { name: "Confirm request type", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Request types", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Data Product Issue Report template", exact: true })).toBeVisible();
  });

  test("preserves the template and messages of a renamed legacy intake", async ({ page }) => {
    await openDraft(page, true);
    await expect(page.getByText("Earlier intake message", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Affected Data Product", exact: true })).toHaveValue("Existing product");
    await page.getByRole("button", { name: "All conversations", exact: true }).click();
    await expect(page.getByRole("button", { name: "Renamed intake", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Earlier discussion", exact: true })).toBeVisible();
  });
});