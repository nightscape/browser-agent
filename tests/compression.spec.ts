import { test, expect } from "@playwright/test";
import { SENSAI_SERVER } from "./fixtures";

async function ensureDialogDismissed(page: import("@playwright/test").Page) {
  // The settings dialog auto-opens when no API key is configured.
  // It has a "Cancel" button — click it if visible, otherwise click the backdrop.
  const cancelBtn = page.locator('button:has-text("Cancel")');
  if (await cancelBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await cancelBtn.click();
    await page.locator(".fixed.inset-0").waitFor({ state: "hidden", timeout: 3_000 }).catch(() => {});
    return;
  }
  const overlay = page.locator(".fixed.inset-0");
  if (await overlay.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await overlay.click({ position: { x: 5, y: 5 }, force: true });
    await overlay.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => {});
  }
}

const THREAD_ID = "__TEST_compression";
const TOOL_CALL_ID = "call_test_compression_001";
const RESULT_ID = "full-result-test-001";

const LARGE_RESULT = JSON.stringify({
  content: [
    {
      type: "text",
      text: "x".repeat(40_000),
    },
  ],
});

async function seedTestData(page: import("@playwright/test").Page) {
  await page.evaluate(
    ({ threadId, toolCallId, resultId, largeResult }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("sensai", 4);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(
            ["threads", "messages", "compressionState"],
            "readwrite",
          );

          tx.objectStore("threads").put({
            id: threadId,
            remoteId: threadId,
            status: "regular",
            title: "Compression Test Thread",
            createdAt: Date.now(),
          });

          // User message
          tx.objectStore("messages").put({
            threadId,
            messageId: "msg-user-1",
            parentId: null,
            format: "ai-sdk/v6",
            content: {
              role: "user",
              metadata: { custom: {} },
              parts: [{ type: "text", text: "Generate large text" }],
            },
            createdAt: Date.now() - 2000,
          });

          // Assistant message with tool call (ai-sdk/v6 UIMessage format)
          tx.objectStore("messages").put({
            threadId,
            messageId: "msg-assistant-1",
            parentId: "msg-user-1",
            format: "ai-sdk/v6",
            content: {
              role: "assistant",
              metadata: { custom: {} },
              parts: [
                { type: "step-start" },
                {
                  type: "tool-test__large_tool",
                  toolCallId,
                  state: "output-available",
                  input: {},
                  output: {
                    _summarized: true,
                    _resultId: resultId,
                    summary: "A large dataset with 1000 items.",
                    _schema: { type: "object" },
                    _hint: "Use _query_full_result",
                  },
                },
                { type: "step-start" },
                {
                  type: "text",
                  text: "I generated the data.",
                },
              ],
            },
            createdAt: Date.now() - 1000,
          });

          // Full tool result in IndexedDB
          tx.objectStore("messages").put({
            threadId,
            messageId: resultId,
            parentId: null,
            format: "full-tool-result",
            content: { text: largeResult, schema: { type: "object" } },
            createdAt: Date.now() - 1500,
          });

          // Compression state
          tx.objectStore("compressionState").put({
            threadId,
            toolCallId,
            resultId,
            state: "full",
            tokenEstimate: 10_000,
          });

          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    {
      threadId: THREAD_ID,
      toolCallId: TOOL_CALL_ID,
      resultId: RESULT_ID,
      largeResult: LARGE_RESULT,
    },
  );
}

async function cleanupTestData(page: import("@playwright/test").Page) {
  await page.evaluate(
    ({ threadId, toolCallId, resultId }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("sensai", 4);
        req.onsuccess = () => {
          const db = req.result;
          const stores = ["threads", "messages", "compressionState"];
          const tx = db.transaction(stores, "readwrite");
          tx.objectStore("threads").delete(threadId);
          tx.objectStore("messages").delete("msg-user-1");
          tx.objectStore("messages").delete("msg-assistant-1");
          tx.objectStore("messages").delete(resultId);
          tx.objectStore("compressionState").delete(toolCallId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    { threadId: THREAD_ID, toolCallId: TOOL_CALL_ID, resultId: RESULT_ID },
  );
}

test.describe("Tool Result Compression", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${SENSAI_SERVER}/`);
    await page.waitForSelector("text=SensAI", { timeout: 10_000 });
    await ensureDialogDismissed(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestData(page);
  });

  test("IndexedDB v4 has compressionState store", async ({ page }) => {
    const stores = await page.evaluate(() => {
      return new Promise<string[]>((resolve, reject) => {
        const req = indexedDB.open("sensai", 4);
        req.onsuccess = () =>
          resolve(Array.from(req.result.objectStoreNames));
        req.onerror = () => reject(req.error);
      });
    });
    expect(stores).toContain("compressionState");
    expect(stores).toContain("messages");
    expect(stores).toContain("threads");
  });

  test("tool result shows token count", async ({ page }) => {
    await seedTestData(page);
    await page.goto(`${SENSAI_SERVER}/?thread=${THREAD_ID}`);
    await ensureDialogDismissed(page);
    await page.waitForTimeout(500);

    const toolHeader = page.locator('[role="button"]').filter({
      hasText: "test__large_tool",
    });
    await expect(toolHeader).toBeVisible({ timeout: 10_000 });
    await expect(toolHeader).toContainText("~10,000 tok");
  });

  test("tool result shows Full compression toggle", async ({ page }) => {
    await seedTestData(page);
    await page.goto(`${SENSAI_SERVER}/?thread=${THREAD_ID}`);
    await ensureDialogDismissed(page);
    await page.waitForTimeout(500);

    const toggleBtn = page.locator('button[title="Change compression level"]');
    await expect(toggleBtn).toBeVisible({ timeout: 10_000 });
    await expect(toggleBtn).toContainText("Full");
  });

  test("dropdown allows direct state selection: Summarized -> Removed -> Full", async ({ page }) => {
    // Pre-seed with a summary already cached to avoid needing a live LLM
    await seedTestData(page);
    await page.evaluate(
      ({ toolCallId }) => {
        return new Promise<void>((resolve, reject) => {
          const req = indexedDB.open("sensai", 4);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("compressionState", "readwrite");
            const store = tx.objectStore("compressionState");
            const get = store.get(toolCallId);
            get.onsuccess = () => {
              const entry = get.result;
              entry.state = "summary";
              entry.summary = "This is a pre-cached summary for testing.";
              entry.schema = { type: "object" };
              store.put(entry);
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
        });
      },
      { toolCallId: TOOL_CALL_ID },
    );

    await page.goto(`${SENSAI_SERVER}/?thread=${THREAD_ID}`);
    await ensureDialogDismissed(page);
    await page.waitForTimeout(1000);
    await ensureDialogDismissed(page);

    const toggleBtn = page.locator('button[title="Change compression level"]');
    await expect(toggleBtn).toBeVisible({ timeout: 10_000 });
    await expect(toggleBtn).toContainText("Summarized");

    // Summarized -> Removed via dropdown
    await toggleBtn.click({ force: true });
    const removedOption = page.locator('button:has-text("Removed")').last();
    await removedOption.click({ force: true });
    await expect(toggleBtn).toContainText("Removed");

    // Removed -> Full via dropdown (reversibility)
    await toggleBtn.click({ force: true });
    const fullOption = page.locator('button:has-text("Full")').last();
    await fullOption.click({ force: true });
    await expect(toggleBtn).toContainText("Full");
  });

  test("compression state persists in IndexedDB after toggle", async ({ page }) => {
    // Pre-seed with summary cached
    await seedTestData(page);
    await page.evaluate(
      ({ toolCallId }) => {
        return new Promise<void>((resolve, reject) => {
          const req = indexedDB.open("sensai", 4);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("compressionState", "readwrite");
            const store = tx.objectStore("compressionState");
            const get = store.get(toolCallId);
            get.onsuccess = () => {
              const entry = get.result;
              entry.state = "summary";
              entry.summary = "Pre-cached summary.";
              entry.schema = { type: "object" };
              store.put(entry);
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
        });
      },
      { toolCallId: TOOL_CALL_ID },
    );

    await page.goto(`${SENSAI_SERVER}/?thread=${THREAD_ID}`);
    await ensureDialogDismissed(page);
    await page.waitForTimeout(1000);
    await ensureDialogDismissed(page);

    const toggleBtn = page.locator('button[title="Change compression level"]');
    await expect(toggleBtn).toBeVisible({ timeout: 10_000 });

    // Summarized -> Removed via dropdown
    await toggleBtn.click({ force: true });
    const removedOption = page.locator('button:has-text("Removed")').last();
    await removedOption.click({ force: true });
    await expect(toggleBtn).toContainText("Removed");

    // Verify IndexedDB state persisted
    const dbState = await page.evaluate((toolCallId) => {
      return new Promise<string>((resolve, reject) => {
        const req = indexedDB.open("sensai", 4);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("compressionState", "readonly");
          const get = tx.objectStore("compressionState").get(toolCallId);
          get.onsuccess = () => resolve(get.result?.state ?? "not found");
          get.onerror = () => reject(get.error);
        };
      });
    }, TOOL_CALL_ID);

    expect(dbState).toBe("removed");
  });

  test("old conversations without compression state show token count but no toggle", async ({
    page,
  }) => {
    // Seed a thread with a tool call but NO compression state entry
    await page.evaluate(
      ({ threadId }) => {
        return new Promise<void>((resolve, reject) => {
          const req = indexedDB.open("sensai", 4);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(["threads", "messages"], "readwrite");
            tx.objectStore("threads").put({
              id: threadId + "_old",
              remoteId: threadId + "_old",
              status: "regular",
              title: "Old Thread No Compression",
              createdAt: Date.now(),
            });
            tx.objectStore("messages").put({
              threadId: threadId + "_old",
              messageId: "msg-user-old",
              parentId: null,
              format: "ai-sdk/v6",
              content: {
                role: "user",
                metadata: { custom: {} },
                parts: [{ type: "text", text: "test" }],
              },
              createdAt: Date.now() - 2000,
            });
            tx.objectStore("messages").put({
              threadId: threadId + "_old",
              messageId: "msg-assistant-old",
              parentId: "msg-user-old",
              format: "ai-sdk/v6",
              content: {
                role: "assistant",
                metadata: { custom: {} },
                parts: [
                  { type: "step-start" },
                  {
                    type: "tool-old__tool",
                    toolCallId: "call_old_no_cs",
                    state: "output-available",
                    input: {},
                    output: { data: "small result" },
                  },
                  { type: "step-start" },
                  { type: "text", text: "Done." },
                ],
              },
              createdAt: Date.now() - 1000,
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
        });
      },
      { threadId: THREAD_ID },
    );

    await page.goto(`${SENSAI_SERVER}/?thread=${THREAD_ID}_old`);
    await ensureDialogDismissed(page);
    await page.waitForTimeout(500);

    const toolHeader = page.locator('[role="button"]').filter({
      hasText: "old__tool",
    });
    await expect(toolHeader).toBeVisible({ timeout: 10_000 });
    // Should show token count
    await expect(toolHeader).toContainText("tok");
    // Should NOT show compression toggle
    const toggleBtn = page.locator('button[title="Change compression level"]');
    await expect(toggleBtn).toHaveCount(0);

    // Cleanup
    await page.evaluate(
      ({ threadId }) => {
        return new Promise<void>((resolve, reject) => {
          const req = indexedDB.open("sensai", 4);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(
              ["threads", "messages"],
              "readwrite",
            );
            tx.objectStore("threads").delete(threadId + "_old");
            tx.objectStore("messages").delete("msg-user-old");
            tx.objectStore("messages").delete("msg-assistant-old");
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
        });
      },
      { threadId: THREAD_ID },
    );
  });
});
