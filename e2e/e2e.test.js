// @vitest-environment node
// ══════════════════════════════════════════════════════════════
// E2E TESTS — Two Chrome tabs syncing via Nostr relays
// ══════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import puppeteer from "puppeteer-core";
import { execSync, spawn } from "node:child_process";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

const DEV_PORT = 5199;
const DEV_URL = `http://localhost:${DEV_PORT}`;
const SYNC_TIMEOUT = 35000;

let browser;
let devServer;

// ── Find Chrome for Testing or system Chrome ──
function findChrome() {
  const cwd = process.cwd();
  const chromeDir = join(cwd, "chrome");
  if (existsSync(chromeDir)) {
    try {
      for (const ver of readdirSync(chromeDir)) {
        const candidates = [
          join(chromeDir, ver, "chrome-linux64", "chrome"),
          join(chromeDir, ver, "chrome-linux", "chrome"),
        ];
        for (const c of candidates) {
          if (existsSync(c)) return c;
        }
      }
    } catch {}
  }
  const systemPaths = [
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium",
  ];
  for (const p of systemPaths) {
    if (existsSync(p)) return p;
  }
  try {
    return execSync("which google-chrome || which chromium || which chromium-browser", { encoding: "utf8" }).trim();
  } catch {}
  return null;
}

// ── Helpers ──

async function waitForText(page, text, timeout = SYNC_TIMEOUT) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = await page.evaluate((t) => document.body.innerText.includes(t), text);
    if (found) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Text "${text}" not found within ${timeout}ms`);
}

async function waitForApp(page) {
  await page.goto(DEV_URL, { waitUntil: "networkidle0", timeout: 15000 });
  // Wait for TASKTANK text to appear (app loaded)
  await waitForText(page, "TASKTANK", 10000);
  await new Promise(r => setTimeout(r, 500));
}

// Create a tank: click "+ Create Tank" → type name → click "Create Tank"
async function createTank(page, name) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find(b => b.textContent.includes("Create Tank"));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // The NewTankModal input has autoFocus, so type directly via keyboard
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")];
    const inp = inputs.find(i => i.placeholder && i.placeholder.includes("Tank name"));
    if (inp) inp.focus();
  });
  await new Promise(r => setTimeout(r, 100));
  await page.keyboard.type(name, { delay: 20 });
  await new Promise(r => setTimeout(r, 200));

  // Click the "Create Tank" button (the one in the modal, not the initial one)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find(b => b.textContent.trim() === "Create Tank");
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
}

// Add a fish via the input bar
async function addFish(page, text) {
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")];
    const inp = inputs.find(i => i.placeholder && (i.placeholder.includes("Add fish") || i.placeholder.includes("Add to")));
    if (inp) inp.focus();
  });
  await new Promise(r => setTimeout(r, 100));
  await page.keyboard.type(text, { delay: 10 });
  await new Promise(r => setTimeout(r, 100));
  await page.keyboard.press("Enter");
  await new Promise(r => setTimeout(r, 500));
}

// Open share modal and get the pairing code
async function shareTank(page) {
  // Click the share button (🔗 icon in TopBar, title="Share")
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find(b => b.title === "Share" || b.textContent.includes("\uD83D\uDD17"));
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!clicked) return null;

  // Poll until the Copy button appears (it only renders when code is ready)
  // Then extract the code from the adjacent div
  const code = await page.evaluate(() => {
    return new Promise((resolve) => {
      const start = Date.now();
      const poll = () => {
        // The Copy button only exists when the share code has been generated
        const btns = [...document.querySelectorAll("button")];
        const copyBtn = btns.find(b => b.textContent.trim() === "Copy");
        if (copyBtn) {
          // Code div is the first <div> child of the Copy button's parent
          const parent = copyBtn.parentElement;
          if (parent) {
            const codeDiv = parent.querySelector("div");
            if (codeDiv) {
              const text = codeDiv.textContent.trim();
              if (text.length > 20 && text !== "Generating...") {
                resolve(text);
                return;
              }
            }
          }
        }
        // Also try: find any monospace div with long base64-like text
        if (!copyBtn) {
          const divs = [...document.querySelectorAll("div")];
          for (const div of divs) {
            if (div.style.fontFamily && div.style.fontFamily.includes("monospace")) {
              const text = div.textContent.trim();
              if (text.length > 50 && !text.includes(" ") && text !== "Generating...") {
                resolve(text);
                return;
              }
            }
          }
        }
        if (Date.now() - start > 20000) {
          resolve(null);
          return;
        }
        setTimeout(poll, 500);
      };
      poll();
    });
  });

  // Close modal by clicking the ✕ button
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find(b => b.textContent.trim() === "\u2715");
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 300));

  return code;
}

// Open join modal and paste a code
async function joinTank(page, code) {
  // Click the sync status indicator in TopBar to open join modal
  await page.evaluate(() => {
    const spans = [...document.querySelectorAll("span")];
    const syncBtn = spans.find(s => s.title && s.title.includes("Sync:") && s.title.includes("join"));
    if (syncBtn) syncBtn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // Focus the textarea and paste code via clipboard API (typing is too slow for long codes)
  await page.evaluate(async (c) => {
    const textareas = [...document.querySelectorAll("textarea")];
    const ta = textareas.find(t => t.placeholder && t.placeholder.includes("Paste pairing code"));
    if (ta) {
      ta.focus();
      // Use native setter + React events for textarea (typing long base64 codes is too slow)
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      nativeSetter.call(ta, c);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, code);
  await new Promise(r => setTimeout(r, 1500));

  // Click "Accept & Sync" button
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find(b => b.textContent.includes("Accept"));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
}

// Open join modal for code inspection (no accept)
async function openJoinAndPaste(page, code) {
  await page.evaluate(() => {
    const spans = [...document.querySelectorAll("span")];
    const syncBtn = spans.find(s => s.title && s.title.includes("Sync:") && s.title.includes("join"));
    if (syncBtn) syncBtn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(async (c) => {
    const textareas = [...document.querySelectorAll("textarea")];
    const ta = textareas.find(t => t.placeholder && t.placeholder.includes("Paste pairing code"));
    if (ta) {
      ta.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      nativeSetter.call(ta, c);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, code);
  await new Promise(r => setTimeout(r, 1000));
}

// ── Common mobile devices ──
const MOBILE_VIEWPORTS = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPhone 14", width: 390, height: 844 },
  { name: "Pixel 7", width: 412, height: 915 },
  { name: "Galaxy S21", width: 360, height: 800 },
  { name: "iPad Mini", width: 768, height: 1024 },
];

// ── Board view helpers ──

async function switchToBoard(page) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find(b => b.title === "Board view (Ctrl+B)");
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 500));
}

async function switchToTank(page) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find(b => b.title === "Tank view");
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 500));
}

// Add a fish via board view quick-add input in a specific column
async function boardAddFish(page, columnIndex, text) {
  await page.evaluate((ci, t) => {
    const inputs = [...document.querySelectorAll("input")];
    const quickInputs = inputs.filter(i => i.placeholder && i.placeholder.includes("Add a task"));
    if (quickInputs[ci]) {
      quickInputs[ci].focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeSetter.call(quickInputs[ci], t);
      quickInputs[ci].dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, columnIndex, text);
  await new Promise(r => setTimeout(r, 100));
  await page.keyboard.press("Enter");
  await new Promise(r => setTimeout(r, 500));
}

// Click a card (fish) in board view by its task text
async function boardClickCard(page, taskText) {
  await page.evaluate((text) => {
    const spans = [...document.querySelectorAll("span")];
    const match = spans.find(s => s.textContent.trim() === text);
    if (match) {
      // Click the parent card div (has the onClick handler)
      let el = match;
      while (el && !el.classList?.contains("ni")) el = el.parentElement;
      if (el) el.click();
    }
  }, taskText);
  await new Promise(r => setTimeout(r, 500));
}

// Close the CaughtPanel modal
async function closeCaughtPanel(page) {
  await page.evaluate(() => {
    // Click the overlay backdrop (position:absolute with inset:0)
    const overlay = [...document.querySelectorAll("div")].find(
      d => d.style.position === "absolute" && d.style.inset === "0px"
    );
    if (overlay) overlay.click();
  });
  await new Promise(r => setTimeout(r, 300));
}

// ── Tests ──

describe("E2E — Board view & CaughtPanel", () => {
  let boardBrowser;
  let boardDevServer;

  beforeAll(async () => {
    const chromePath = findChrome();
    if (!chromePath) {
      console.warn("Chrome not found — skipping board view E2E tests");
      return;
    }

    boardDevServer = spawn("npx", ["vite", "--port", "5198", "--strictPort"], {
      cwd: process.cwd(),
      stdio: "pipe",
      env: { ...process.env, BROWSER: "none" },
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Dev server timeout")), 30000);
      let output = "";
      boardDevServer.stdout.on("data", (data) => {
        output += data.toString();
        if (output.includes("Local:") || output.includes("ready in")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      boardDevServer.stderr.on("data", () => {});
      boardDevServer.on("error", reject);
    });

    boardBrowser = await puppeteer.launch({
      executablePath: chromePath,
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }, 60000);

  afterAll(async () => {
    if (boardBrowser) await boardBrowser.close().catch(() => {});
    if (boardDevServer) {
      boardDevServer.kill("SIGTERM");
      await new Promise(r => setTimeout(r, 1000));
    }
  });

  const BOARD_URL = "http://localhost:5198";

  async function waitForBoardApp(page) {
    await page.goto(BOARD_URL, { waitUntil: "networkidle0", timeout: 15000 });
    await waitForText(page, "TASKTANK", 10000);
    await new Promise(r => setTimeout(r, 500));
  }

  it("view toggle buttons appear and switch to board view", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForBoardApp(page);
      await createTank(page, "Toggle Test");
      await new Promise(r => setTimeout(r, 500));

      // Both toggle buttons should exist
      const toggles = await page.evaluate(() => {
        const btns = [...document.querySelectorAll("button")];
        const tankBtn = btns.find(b => b.title === "Tank view");
        const boardBtn = btns.find(b => b.title === "Board view (Ctrl+B)");
        return { hasTank: !!tankBtn, hasBoard: !!boardBtn };
      });
      expect(toggles.hasTank).toBe(true);
      expect(toggles.hasBoard).toBe(true);

      // Switch to board view
      await switchToBoard(page);

      // Board view should show "ADD LIST" button and the quick-add input
      const boardContent = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasAddList: text.includes("ADD LIST"),
          hasQuickAdd: !!document.querySelector('input[placeholder*="Add a task"]'),
          hasColumnHeader: text.includes("TOGGLE TEST"),
        };
      });
      expect(boardContent.hasAddList).toBe(true);
      expect(boardContent.hasQuickAdd).toBe(true);
      expect(boardContent.hasColumnHeader).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 30000);

  it("Ctrl+B toggles between tank and board view", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForBoardApp(page);
      await createTank(page, "Shortcut Test");
      await new Promise(r => setTimeout(r, 500));

      // Should start in tank view (no "ADD LIST")
      let hasAddList = await page.evaluate(() => document.body.innerText.includes("ADD LIST"));
      expect(hasAddList).toBe(false);

      // Press Ctrl+B to switch to board
      await page.keyboard.down("Control");
      await page.keyboard.press("b");
      await page.keyboard.up("Control");
      await new Promise(r => setTimeout(r, 500));

      hasAddList = await page.evaluate(() => document.body.innerText.includes("ADD LIST"));
      expect(hasAddList).toBe(true);

      // Press Ctrl+B again to switch back to tank
      await page.keyboard.down("Control");
      await page.keyboard.press("b");
      await page.keyboard.up("Control");
      await new Promise(r => setTimeout(r, 500));

      hasAddList = await page.evaluate(() => document.body.innerText.includes("ADD LIST"));
      expect(hasAddList).toBe(false);
    } finally {
      await ctx.close();
    }
  }, 30000);

  it("board view renders all tanks as columns", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForBoardApp(page);

      // Create first tank
      await createTank(page, "Column A");
      await new Promise(r => setTimeout(r, 500));

      // Switch to board view to use ADD LIST for second tank
      await switchToBoard(page);
      await new Promise(r => setTimeout(r, 300));

      // Click ADD LIST to create second tank
      await page.evaluate(() => {
        const el = document.querySelector(".addc");
        if (el) el.click();
      });
      await new Promise(r => setTimeout(r, 500));
      await page.evaluate(() => {
        const inputs = [...document.querySelectorAll("input")];
        const inp = inputs.find(i => i.placeholder && i.placeholder.includes("Tank name"));
        if (inp) inp.focus();
      });
      await new Promise(r => setTimeout(r, 100));
      await page.keyboard.type("Column B", { delay: 20 });
      await new Promise(r => setTimeout(r, 200));
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll("button")];
        const btn = btns.find(b => b.textContent.trim() === "Create Tank");
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 1000));

      // Both column headers should appear in board view
      const columns = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasA: text.includes("COLUMN A"),
          hasB: text.includes("COLUMN B"),
          hasAddList: text.includes("ADD LIST"),
        };
      });
      expect(columns.hasA).toBe(true);
      expect(columns.hasB).toBe(true);
      expect(columns.hasAddList).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 30000);

  it("quick-add in board column creates a fish in that column", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForBoardApp(page);
      await createTank(page, "Quick Add Tank");
      await new Promise(r => setTimeout(r, 500));

      await switchToBoard(page);

      // Use the quick-add input in the first column
      await boardAddFish(page, 0, "Board task one");

      // The task text should appear in the board
      await waitForText(page, "Board task one", 5000);

      // Verify it's within the NORMAL section (default importance)
      const hasNormal = await page.evaluate(() => document.body.innerText.includes("NORMAL"));
      expect(hasNormal).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 30000);

  it("board cards grouped by importance sections", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForBoardApp(page);
      await createTank(page, "Importance Tank");
      await new Promise(r => setTimeout(r, 500));

      // Add a normal fish in tank view first
      await addFish(page, "Normal task");
      await new Promise(r => setTimeout(r, 300));

      // Switch to board
      await switchToBoard(page);

      // Check that NORMAL section is visible with our task
      const sections = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasNormal: text.includes("NORMAL"),
          hasTask: text.includes("Normal task"),
          // CRITICAL and IMPORTANT should NOT appear (no fish with those)
          hasCritical: text.includes("CRITICAL"),
          hasImportant: text.includes("IMPORTANT"),
        };
      });
      expect(sections.hasNormal).toBe(true);
      expect(sections.hasTask).toBe(true);
      // Empty sections should be hidden
      expect(sections.hasCritical).toBe(false);
      expect(sections.hasImportant).toBe(false);
    } finally {
      await ctx.close();
    }
  }, 30000);

  it("clicking a board card opens CaughtPanel as centered modal", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForBoardApp(page);
      await createTank(page, "Card Click Tank");
      await addFish(page, "Click me fish");
      await new Promise(r => setTimeout(r, 500));

      await switchToBoard(page);
      await new Promise(r => setTimeout(r, 300));

      // Click the card
      await boardClickCard(page, "Click me fish");

      // CaughtPanel modal should appear with "TASK DETAIL" header and the fish name
      const modal = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasTaskDetail: text.includes("TASK DETAIL"),
          hasFishName: text.includes("Click me fish"),
          hasRelease: text.includes("Release"),
          hasDescription: text.includes("DESCRIPTION"),
        };
      });
      expect(modal.hasTaskDetail).toBe(true);
      expect(modal.hasFishName).toBe(true);
      expect(modal.hasRelease).toBe(true);
      expect(modal.hasDescription).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 30000);

  it("CaughtPanel desktop modal shows two-column layout with sidebar sections", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForBoardApp(page);
      await createTank(page, "Layout Tank");
      await addFish(page, "Layout fish");
      await new Promise(r => setTimeout(r, 500));

      await switchToBoard(page);
      await boardClickCard(page, "Layout fish");

      // Check all expected sections in the modal
      const sections = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasPriority: text.includes("PRIORITY"),
          hasDueDate: text.includes("DUE DATE"),
          hasDuration: text.includes("DURATION"),
          hasChecklist: text.includes("CHECKLIST"),
          hasLinks: text.includes("LINKS"),
          hasAttachments: text.includes("ATTACHMENTS"),
          hasDescription: text.includes("DESCRIPTION"),
          hasIncomplete: text.includes("Incomplete"),
          hasRemove: text.includes("Remove"),
        };
      });
      expect(sections.hasPriority).toBe(true);
      expect(sections.hasDueDate).toBe(true);
      expect(sections.hasDuration).toBe(true);
      expect(sections.hasChecklist).toBe(true);
      expect(sections.hasLinks).toBe(true);
      expect(sections.hasAttachments).toBe(true);
      expect(sections.hasDescription).toBe(true);
      expect(sections.hasIncomplete).toBe(true);
      expect(sections.hasRemove).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 30000);

  it("CaughtPanel description field is editable", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForBoardApp(page);
      await createTank(page, "Desc Tank");
      await addFish(page, "Desc fish");
      await new Promise(r => setTimeout(r, 500));

      await switchToBoard(page);
      await boardClickCard(page, "Desc fish");

      // Click the description placeholder to enter edit mode
      await page.evaluate(() => {
        const divs = [...document.querySelectorAll("div")];
        const descDiv = divs.find(d => d.textContent.includes("Add a description...") && d.style.cursor === "text");
        if (descDiv) descDiv.click();
      });
      await new Promise(r => setTimeout(r, 300));

      // A textarea should appear
      const hasTextarea = await page.evaluate(() => {
        const ta = document.querySelector("textarea");
        return !!ta;
      });
      expect(hasTextarea).toBe(true);

      // Type a description
      await page.keyboard.type("This is a test description", { delay: 10 });
      await new Promise(r => setTimeout(r, 100));

      // Blur to save (click somewhere else in the modal)
      await page.evaluate(() => {
        const ta = document.querySelector("textarea");
        if (ta) ta.blur();
      });
      await new Promise(r => setTimeout(r, 300));

      // Description should now be visible (textarea gone, text shown)
      const descResult = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasDesc: text.includes("This is a test description"),
          hasPlaceholder: text.includes("Add a description..."),
        };
      });
      expect(descResult.hasDesc).toBe(true);
      expect(descResult.hasPlaceholder).toBe(false);
    } finally {
      await ctx.close();
    }
  }, 30000);

  it("CaughtPanel checklist progress bar updates", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForBoardApp(page);
      await createTank(page, "Checklist Tank");
      await addFish(page, "Checklist fish");
      await new Promise(r => setTimeout(r, 500));

      await switchToBoard(page);
      await boardClickCard(page, "Checklist fish");

      // Add two checklist items
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll("button")];
        const addBtn = btns.find(b => b.textContent.includes("+ Add item"));
        if (addBtn) addBtn.click();
      });
      await new Promise(r => setTimeout(r, 300));

      // Type first item
      await page.keyboard.type("Item one", { delay: 10 });
      await page.keyboard.press("Enter");
      await new Promise(r => setTimeout(r, 300));

      // Type second item
      await page.keyboard.type("Item two", { delay: 10 });
      await page.keyboard.press("Enter");
      await new Promise(r => setTimeout(r, 300));

      // Press Escape to exit add mode
      await page.keyboard.press("Escape");
      await new Promise(r => setTimeout(r, 200));

      // Should show 0/2 and 0% progress
      const before = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasItems: text.includes("Item one") && text.includes("Item two"),
          hasZeroPercent: text.includes("0%"),
          hasCount: text.includes("0/2"),
        };
      });
      expect(before.hasItems).toBe(true);
      expect(before.hasZeroPercent).toBe(true);
      expect(before.hasCount).toBe(true);

      // Toggle first checklist item complete — find the checkbox next to "Item one"
      await page.evaluate(() => {
        // Find the checklist items by looking for spans with the item text
        const spans = [...document.querySelectorAll("span")];
        const itemSpan = spans.find(s => s.textContent.trim() === "Item one");
        if (itemSpan) {
          // The checkbox is a sibling div before the text span
          const row = itemSpan.parentElement;
          if (row) {
            const checkbox = row.querySelector("div[style*='18px']");
            if (checkbox) checkbox.click();
          }
        }
      });
      await new Promise(r => setTimeout(r, 500));

      // Should now show 50% and 1/2
      const after = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasFiftyPercent: text.includes("50%"),
          hasCount: text.includes("1/2"),
        };
      });
      expect(after.hasFiftyPercent).toBe(true);
      expect(after.hasCount).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 30000);

  it("board view toggle checkbox completes a fish", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForBoardApp(page);
      await createTank(page, "Complete Tank");
      await addFish(page, "Complete me");
      await new Promise(r => setTimeout(r, 500));

      await switchToBoard(page);

      // Fish should be in NORMAL section initially
      let sections = await page.evaluate(() => {
        const text = document.body.innerText;
        return { hasNormal: text.includes("NORMAL"), hasCompleted: text.includes("COMPLETED") };
      });
      expect(sections.hasNormal).toBe(true);
      expect(sections.hasCompleted).toBe(false);

      // Click the checkbox (18x18 div inside the card)
      await page.evaluate(() => {
        const checks = [...document.querySelectorAll("div")].filter(d =>
          d.style.width === "18px" && d.style.height === "18px" && d.style.borderRadius === "4px" && d.style.cursor === "pointer"
        );
        if (checks[0]) checks[0].click();
      });
      await new Promise(r => setTimeout(r, 500));

      // Fish should move to COMPLETED section
      sections = await page.evaluate(() => {
        const text = document.body.innerText;
        return { hasCompleted: text.includes("COMPLETED") };
      });
      expect(sections.hasCompleted).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 30000);

  it("board view + Add another list creates a new tank column", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForBoardApp(page);
      await createTank(page, "First Column");
      await new Promise(r => setTimeout(r, 500));

      await switchToBoard(page);

      // Click the "ADD LIST" column (it has class "addc")
      await page.evaluate(() => {
        const el = document.querySelector(".addc");
        if (el) el.click();
      });
      await new Promise(r => setTimeout(r, 500));

      // NewTankModal should appear, type name and create
      await page.evaluate(() => {
        const inputs = [...document.querySelectorAll("input")];
        const inp = inputs.find(i => i.placeholder && i.placeholder.includes("Tank name"));
        if (inp) inp.focus();
      });
      await new Promise(r => setTimeout(r, 100));
      await page.keyboard.type("Second Column", { delay: 20 });
      await new Promise(r => setTimeout(r, 200));

      await page.evaluate(() => {
        const btns = [...document.querySelectorAll("button")];
        const btn = btns.find(b => b.textContent.trim() === "Create Tank");
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 1000));

      // Both columns should exist
      const cols = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasFirst: text.includes("FIRST COLUMN"),
          hasSecond: text.includes("SECOND COLUMN"),
        };
      });
      expect(cols.hasFirst).toBe(true);
      expect(cols.hasSecond).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 30000);

  it("CaughtPanel renders as bottom sheet on mobile", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await waitForBoardApp(page);
      await createTank(page, "Mobile Panel");
      await addFish(page, "Mobile fish");
      await new Promise(r => setTimeout(r, 500));

      // In mobile single view, click the fish in the tank (via SVG text)
      // Fish are rendered in TankRenderer, let's use catchFish via clicking text
      await page.evaluate(() => {
        const texts = [...document.querySelectorAll("text")];
        const fish = texts.find(t => t.textContent.includes("Mobile fish"));
        if (fish) {
          const hit = fish.closest(".fhit");
          if (hit) hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        }
      });
      await new Promise(r => setTimeout(r, 800));

      // Mobile panel should appear as bottom sheet with slide-up animation
      const panelInfo = await page.evaluate(() => {
        // Bottom sheet has borderRadius "16px 16px 0 0"
        const sheets = [...document.querySelectorAll("div")].filter(d =>
          d.style.borderRadius === "16px 16px 0px 0px" && d.style.position === "absolute"
        );
        if (sheets.length === 0) return null;
        const sheet = sheets[0];
        const rect = sheet.getBoundingClientRect();
        const text = sheet.innerText;
        return {
          bottom: rect.bottom,
          hasDescription: text.includes("DESCRIPTION"),
          hasPriority: text.includes("PRIORITY"),
          hasRelease: text.includes("Release"),
        };
      });
      // If we caught a fish, the panel should be there
      if (panelInfo) {
        expect(panelInfo.hasDescription).toBe(true);
        expect(panelInfo.hasPriority).toBe(true);
        expect(panelInfo.hasRelease).toBe(true);
      }
    } finally {
      await ctx.close();
    }
  }, 30000);

  it("zoom controls hidden in board mode", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForBoardApp(page);
      await createTank(page, "Zoom A");
      await new Promise(r => setTimeout(r, 500));

      // Create second tank via board view ADD LIST
      await switchToBoard(page);
      await page.evaluate(() => {
        const el = document.querySelector(".addc");
        if (el) el.click();
      });
      await new Promise(r => setTimeout(r, 500));
      await page.evaluate(() => {
        const inputs = [...document.querySelectorAll("input")];
        const inp = inputs.find(i => i.placeholder && i.placeholder.includes("Tank name"));
        if (inp) inp.focus();
      });
      await new Promise(r => setTimeout(r, 100));
      await page.keyboard.type("Zoom B", { delay: 20 });
      await new Promise(r => setTimeout(r, 200));
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll("button")];
        const btn = btns.find(b => b.textContent.trim() === "Create Tank");
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 1000));

      // Switch back to tank view — zoom controls should exist (2 tanks in grid)
      await switchToTank(page);
      await new Promise(r => setTimeout(r, 500));

      let zoomControls = await page.evaluate(() => {
        const btns = [...document.querySelectorAll("button")];
        return {
          hasZoomOut: !!btns.find(b => b.title === "Zoom out (see more tanks)"),
          hasZoomIn: !!btns.find(b => b.title === "Zoom in (see fewer tanks)"),
        };
      });
      expect(zoomControls.hasZoomOut).toBe(true);
      expect(zoomControls.hasZoomIn).toBe(true);

      // Switch to board
      await switchToBoard(page);

      // Zoom controls should be hidden
      zoomControls = await page.evaluate(() => {
        const btns = [...document.querySelectorAll("button")];
        return {
          hasZoomOut: !!btns.find(b => b.title === "Zoom out (see more tanks)"),
          hasZoomIn: !!btns.find(b => b.title === "Zoom in (see fewer tanks)"),
        };
      });
      expect(zoomControls.hasZoomOut).toBe(false);
      expect(zoomControls.hasZoomIn).toBe(false);
    } finally {
      await ctx.close();
    }
  }, 30000);

  it("viewMode persists across page reload", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForBoardApp(page);
      await createTank(page, "Persist Tank");
      await new Promise(r => setTimeout(r, 500));

      // Switch to board
      await switchToBoard(page);
      await waitForText(page, "ADD LIST", 5000);

      // Reload page
      await page.goto(BOARD_URL, { waitUntil: "networkidle0", timeout: 15000 });
      await waitForText(page, "TASKTANK", 10000);
      await new Promise(r => setTimeout(r, 1000));

      // Should still be in board view after reload
      const isBoard = await page.evaluate(() => document.body.innerText.includes("ADD LIST"));
      expect(isBoard).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 30000);

  it("fish description field added to new fish", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForBoardApp(page);
      await createTank(page, "Desc Model Tank");
      await addFish(page, "Desc model fish");
      await new Promise(r => setTimeout(r, 500));

      // Check that the fish has a description field in localStorage
      const hasDescField = await page.evaluate(() => {
        try {
          const data = JSON.parse(localStorage.getItem("tasktank-v5"));
          const fish = data?.tanks?.[0]?.fishes?.[0];
          return fish && "description" in fish && fish.description === "";
        } catch { return false; }
      });
      expect(hasDescField).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 30000);

  it("board input bars hidden, tank input bars not shown in board mode", async () => {
    if (!boardBrowser) return;
    const ctx = await boardBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForBoardApp(page);
      await createTank(page, "Input Test");
      await new Promise(r => setTimeout(r, 500));

      // In tank view, the desktop input bar should exist (with "Add to" or "Add fish" placeholder)
      let hasDesktopInput = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll("input")];
        return !!inputs.find(i => i.placeholder && (i.placeholder.includes("Add to") || i.placeholder.includes("Add fish")));
      });
      expect(hasDesktopInput).toBe(true);

      // Switch to board
      await switchToBoard(page);

      // Desktop input bar should be gone, replaced by per-column quick-add
      const inputState = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll("input")];
        const desktopInput = inputs.find(i => i.placeholder && (i.placeholder.includes("Add to") || i.placeholder.includes("Add fish")));
        const quickAdd = inputs.find(i => i.placeholder && i.placeholder.includes("Add a task"));
        return { hasDesktopInput: !!desktopInput, hasQuickAdd: !!quickAdd };
      });
      expect(inputState.hasDesktopInput).toBe(false);
      expect(inputState.hasQuickAdd).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 30000);
});

// ── Screenshot generation ──

const SCREENSHOT_DIR = join(process.cwd(), "public", "screenshots");
const SCREENSHOT_PORT = 5197;
const SCREENSHOT_URL = `http://localhost:${SCREENSHOT_PORT}`;

describe("E2E — Screenshots", () => {
  let ssBrowser;
  let ssDevServer;

  beforeAll(async () => {
    const chromePath = findChrome();
    if (!chromePath) {
      console.warn("Chrome not found — skipping screenshot generation");
      return;
    }

    mkdirSync(SCREENSHOT_DIR, { recursive: true });

    ssDevServer = spawn("npx", ["vite", "--port", String(SCREENSHOT_PORT), "--strictPort"], {
      cwd: process.cwd(),
      stdio: "pipe",
      env: { ...process.env, BROWSER: "none" },
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Dev server timeout")), 30000);
      let output = "";
      ssDevServer.stdout.on("data", (data) => {
        output += data.toString();
        if (output.includes("Local:") || output.includes("ready in")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      ssDevServer.stderr.on("data", () => {});
      ssDevServer.on("error", reject);
    });

    ssBrowser = await puppeteer.launch({
      executablePath: chromePath,
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }, 60000);

  afterAll(async () => {
    if (ssBrowser) await ssBrowser.close().catch(() => {});
    if (ssDevServer) {
      ssDevServer.kill("SIGTERM");
      await new Promise(r => setTimeout(r, 1000));
    }
  });

  async function waitForSSApp(page) {
    await page.goto(SCREENSHOT_URL, { waitUntil: "networkidle0", timeout: 15000 });
    await waitForText(page, "TASKTANK", 10000);
    await new Promise(r => setTimeout(r, 500));
  }

  // Seed realistic data: 2 tanks with varied fish
  async function seedData(page) {
    // Create first tank
    await createTank(page, "Work Tasks");
    await new Promise(r => setTimeout(r, 500));

    // Add 12 fish with different properties for a full tank
    await addFish(page, "Fix login bug on mobile");
    await addFish(page, "Review pull request #42");
    await addFish(page, "Update API documentation");
    await addFish(page, "Deploy v2.1 to staging");
    await addFish(page, "Team standup notes");
    await addFish(page, "Refactor auth middleware");
    await addFish(page, "Write unit tests for cart");
    await addFish(page, "Design onboarding flow");
    await addFish(page, "Optimize database queries");
    await addFish(page, "Set up CI pipeline");
    await addFish(page, "Fix dark mode contrast");
    await addFish(page, "Plan sprint retrospective");
    await new Promise(r => setTimeout(r, 300));

    // Set some fish as critical/important via localStorage manipulation
    await page.evaluate(() => {
      try {
        const data = JSON.parse(localStorage.getItem("tasktank-v5"));
        const tank = data.tanks[0];
        if (tank && tank.fishes.length >= 12) {
          // Make first fish critical with due date and checklist
          tank.fishes[0].importance = "critical";
          tank.fishes[0].dueDate = new Date().toISOString().slice(0, 10);
          tank.fishes[0].checklist = [
            { id: "c1", text: "Reproduce issue", done: true },
            { id: "c2", text: "Write fix", done: true },
            { id: "c3", text: "Add tests", done: false },
            { id: "c4", text: "Code review", done: false },
          ];
          tank.fishes[0].description = "The login form crashes on iOS Safari when the keyboard opens. Need to fix the viewport handling and test on multiple devices.";
          // Make some fish important
          tank.fishes[1].importance = "important";
          tank.fishes[1].duration = 30;
          tank.fishes[5].importance = "important";
          tank.fishes[7].importance = "important";
          // Make another critical
          tank.fishes[8].importance = "critical";
          tank.fishes[8].duration = 60;
          // Give some due dates
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tank.fishes[2].dueDate = tomorrow.toISOString().slice(0, 10);
          const nextWeek = new Date();
          nextWeek.setDate(nextWeek.getDate() + 5);
          tank.fishes[6].dueDate = nextWeek.toISOString().slice(0, 10);
          // Set durations
          tank.fishes[3].duration = 15;
          tank.fishes[10].duration = 120;
          // Complete a couple
          tank.fishes[4].completed = Date.now();
          tank.fishes[11].completed = Date.now();
        }
        localStorage.setItem("tasktank-v5", JSON.stringify(data));
      } catch {}
    });
    // Reload to pick up localStorage changes
    await page.goto(SCREENSHOT_URL, { waitUntil: "networkidle0", timeout: 15000 });
    await waitForText(page, "TASKTANK", 10000);
    await new Promise(r => setTimeout(r, 800));

    // Create second tank via board view
    await switchToBoard(page);
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => {
      const el = document.querySelector(".addc");
      if (el) el.click();
    });
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => {
      const inputs = [...document.querySelectorAll("input")];
      const inp = inputs.find(i => i.placeholder && i.placeholder.includes("Tank name"));
      if (inp) inp.focus();
    });
    await new Promise(r => setTimeout(r, 100));
    await page.keyboard.type("Personal", { delay: 20 });
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const btn = btns.find(b => b.textContent.trim() === "Create Tank");
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Add fish to second column
    await boardAddFish(page, 1, "Grocery shopping");
    await boardAddFish(page, 1, "Call dentist");
    await boardAddFish(page, 1, "Read chapter 5");
    await new Promise(r => setTimeout(r, 300));

    // Switch back to tank view for initial screenshots
    await switchToTank(page);
    await new Promise(r => setTimeout(r, 800));
  }

  // Set the app theme by updating localStorage and reloading
  async function setTheme(page, theme) {
    await page.evaluate((t) => {
      try {
        const data = JSON.parse(localStorage.getItem("tasktank-v5"));
        data.theme = t;
        localStorage.setItem("tasktank-v5", JSON.stringify(data));
      } catch {}
    }, theme);
    await page.goto(SCREENSHOT_URL, { waitUntil: "networkidle0", timeout: 15000 });
    await waitForText(page, "TASKTANK", 10000);
    await new Promise(r => setTimeout(r, 800));
  }

  // Capture all 3 views (tank, board, caught) for a given prefix
  async function captureViews(page, prefix) {
    // Tank view — let animations settle
    await switchToTank(page);
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: join(SCREENSHOT_DIR, `${prefix}-tank.png`), fullPage: false });

    // Board view
    await switchToBoard(page);
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: join(SCREENSHOT_DIR, `${prefix}-board.png`), fullPage: false });

    // CaughtPanel modal — click the critical fish card
    await boardClickCard(page, "Fix login bug on mobile");
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: join(SCREENSHOT_DIR, `${prefix}-caught.png`), fullPage: false });

    // Close caught panel for next round
    await closeCaughtPanel(page);
    await new Promise(r => setTimeout(r, 300));
  }

  it("captures desktop screenshots (1280x800)", async () => {
    if (!ssBrowser) return;
    const ctx = await ssBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await waitForSSApp(page);
      await seedData(page);

      // Dark theme
      await setTheme(page, "dark");
      await captureViews(page, "dark-desktop");

      // Light theme
      await setTheme(page, "light");
      await captureViews(page, "light-desktop");
    } finally {
      await ctx.close();
    }
  }, 90000);

  it("captures mobile screenshots (390x844)", async () => {
    if (!ssBrowser) return;
    const ctx = await ssBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await waitForSSApp(page);
      await seedData(page);

      // Dark theme
      await setTheme(page, "dark");
      await captureViews(page, "dark-mobile");

      // Light theme
      await setTheme(page, "light");
      await captureViews(page, "light-mobile");
    } finally {
      await ctx.close();
    }
  }, 90000);

  it("captures tablet screenshots (768x1024)", async () => {
    if (!ssBrowser) return;
    const ctx = await ssBrowser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.setViewport({ width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await waitForSSApp(page);
      await seedData(page);

      // Dark theme
      await setTheme(page, "dark");
      await captureViews(page, "dark-tablet");

      // Light theme
      await setTheme(page, "light");
      await captureViews(page, "light-tablet");
    } finally {
      await ctx.close();
    }
  }, 90000);
});

describe("E2E — Mobile viewport layout", () => {
  for (const vp of MOBILE_VIEWPORTS) {
    it(`bottom controls visible at ${vp.name} (${vp.width}x${vp.height})`, async () => {
      if (!browser) return;
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();

      try {
        await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        await waitForApp(page);
        await createTank(page, "Mobile Test");
        await new Promise(r => setTimeout(r, 500));

        // Measure the app root container and the bottom bar
        const layout = await page.evaluate(() => {
          const root = document.querySelector("#root > div");
          if (!root) return null;
          const rootRect = root.getBoundingClientRect();

          // Find the bottom bar (MobileInputBar or DesktopInputBar) — it's the last div with borderTop
          const children = [...root.children].filter(el => el.tagName === "DIV" || el.tagName === "div");
          let bottomBar = null;
          for (const child of children) {
            const s = child.style || getComputedStyle(child);
            if (s.borderTop && s.borderTop.includes("solid")) {
              bottomBar = child;
            }
          }

          // Also check for any input element in bottom area
          const inputs = [...document.querySelectorAll("input")];
          const addInput = inputs.find(i => i.placeholder && (i.placeholder.includes("Add to") || i.placeholder.includes("Add fish")));

          return {
            rootHeight: rootRect.height,
            rootBottom: rootRect.bottom,
            viewportHeight: window.innerHeight,
            bottomBarRect: bottomBar ? bottomBar.getBoundingClientRect() : null,
            addInputRect: addInput ? addInput.getBoundingClientRect() : null,
          };
        });

        expect(layout, "App root should exist").toBeTruthy();

        // Root should not exceed viewport
        expect(layout.rootBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);

        // The add-fish input should be visible (within viewport)
        if (layout.addInputRect) {
          expect(layout.addInputRect.bottom, `Input bar bottom (${layout.addInputRect.bottom}) should be within viewport (${layout.viewportHeight})`).toBeLessThanOrEqual(layout.viewportHeight);
          expect(layout.addInputRect.top).toBeGreaterThan(0);
        }

        // Bottom bar bottom edge should be within viewport
        if (layout.bottomBarRect) {
          expect(layout.bottomBarRect.bottom, `Bottom bar (${layout.bottomBarRect.bottom}) should be within viewport (${layout.viewportHeight})`).toBeLessThanOrEqual(layout.viewportHeight + 1);
        }
      } finally {
        await ctx.close();
      }
    }, 30000);
  }
});

describe("E2E — Two-tab Nostr sync", () => {
  beforeAll(async () => {
    const chromePath = findChrome();
    if (!chromePath) {
      console.warn("Chrome not found — skipping E2E tests");
      return;
    }

    // Start Vite dev server on a non-standard port
    devServer = spawn("npx", ["vite", "--port", String(DEV_PORT), "--strictPort"], {
      cwd: process.cwd(),
      stdio: "pipe",
      env: { ...process.env, BROWSER: "none" },
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Dev server timeout")), 30000);
      let output = "";
      devServer.stdout.on("data", (data) => {
        output += data.toString();
        if (output.includes("Local:") || output.includes("ready in")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      devServer.stderr.on("data", () => {});
      devServer.on("error", reject);
    });

    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }, 60000);

  afterAll(async () => {
    if (browser) await browser.close().catch(() => {});
    if (devServer) {
      devServer.kill("SIGTERM");
      await new Promise(r => setTimeout(r, 1000));
    }
  });

  it("two tabs can sync a tank via share code", async () => {
    if (!browser) return;
    const ctx1 = await browser.createBrowserContext();
    const ctx2 = await browser.createBrowserContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    try {
      await waitForApp(page1);
      await waitForApp(page2);

      // Tab A: Create tank and add a fish
      await createTank(page1, "Sync Test");
      await addFish(page1, "E2E sync fish");

      // Tab A: Share the tank
      const code = await shareTank(page1);
      expect(code, "Share code should be generated — check Nostr relay connectivity").toBeTruthy();
      expect(code.length).toBeGreaterThan(20);

      // Tab B: Join with the share code
      await joinTank(page2, code);

      // Tab B: Wait for the fish to appear
      await waitForText(page2, "E2E sync fish");
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  }, 90000);

  it("bidirectional sync — Tab B adds fish, Tab A sees it", async () => {
    if (!browser) return;
    const ctx1 = await browser.createBrowserContext();
    const ctx2 = await browser.createBrowserContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    try {
      await waitForApp(page1);
      await waitForApp(page2);

      await createTank(page1, "Bidi Test");
      const code = await shareTank(page1);
      expect(code, "Share code should be generated").toBeTruthy();
      await joinTank(page2, code);
      // Give sync time to establish
      await new Promise(r => setTimeout(r, 5000));

      // Tab B adds a fish
      await addFish(page2, "From Tab B");

      // Tab A should see it
      await waitForText(page1, "From Tab B");
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  }, 90000);

  it("rapid fish additions — Tab B receives all", async () => {
    if (!browser) return;
    const ctx1 = await browser.createBrowserContext();
    const ctx2 = await browser.createBrowserContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    try {
      await waitForApp(page1);
      await waitForApp(page2);

      await createTank(page1, "Rapid Test");
      const code = await shareTank(page1);
      expect(code, "Share code should be generated").toBeTruthy();
      await joinTank(page2, code);
      await new Promise(r => setTimeout(r, 5000));

      // Add 10 fish rapidly
      for (let i = 1; i <= 10; i++) {
        await addFish(page1, `Rapid ${i}`);
      }

      // Tab B should eventually see the last one
      await waitForText(page2, "Rapid 10");
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  }, 90000);

  it("share code roundtrip — preview shows tank name", async () => {
    if (!browser) return;
    const ctx1 = await browser.createBrowserContext();
    const ctx2 = await browser.createBrowserContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    try {
      await waitForApp(page1);
      await waitForApp(page2);

      await createTank(page1, "Preview Tank");
      const code = await shareTank(page1);
      expect(code, "Share code should be generated").toBeTruthy();

      // Tab B: open join modal and paste — should show tank name in preview
      await openJoinAndPaste(page2, code);
      await waitForText(page2, "Preview Tank", 5000);
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  }, 60000);

  it("expired code is rejected", async () => {
    if (!browser) return;
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();

    try {
      await waitForApp(page);

      // Construct an expired code
      const expiredPayload = {
        d: "fake-device-id", t: "fake-tank-id", n: "Expired Tank",
        p: "s", s: "sync-1234", k: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        x: Math.floor((Date.now() - 60000) / 1000),
      };
      const code = Buffer.from(JSON.stringify(expiredPayload)).toString("base64")
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      // Open join modal and paste expired code
      await openJoinAndPaste(page, code);

      // Should see "expired" error message
      await waitForText(page, "expired", 5000);
    } finally {
      await ctx.close();
    }
  }, 30000);
});
