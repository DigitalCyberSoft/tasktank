// @vitest-environment node
// ══════════════════════════════════════════════════════════════
// E2E TESTS — Two Chrome tabs syncing via Nostr relays
// ══════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import puppeteer from "puppeteer-core";
import { execSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
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

// ── Tests ──

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
