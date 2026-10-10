import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { finishText } from "../../api-server/src/lib/finisher";

const draft =
  "Email 1\nSubject: Meeting\nHi {{first_name}},\nCosMx, CellScape, GeoMx and Bruker Spatial Biology.\nI'll be in Palo Alto {{TRIP_1_DATES}}, and I have the following dates and times available:\n{{TRIP_1_AVAILABILITY}}\nWould any of those times work?\nResource note: private guidance\n\nLinkedIn 1\nI'll be in Palo Alto {{TRIP_1_DATES}}:\n{{TRIP_1_AVAILABILITY}}\nCould we meet?";
const updatedDraft = draft.replaceAll("LinkedIn 1", "LinkedIn Message 1");
const result = finishText(
  {
    company: "Earli",
    source: updatedDraft,
    trip1: [{ date: "2026-10-27", start: "13:00", end: "16:00" }],
  },
  new Date("2026-10-08T18:00:00Z"),
);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).copied = {};
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: async (items: ClipboardItem[]) => {
          if ((window as any).rejectRich)
            throw new Error("Unsupported rich clipboard");
          const item = items[0];
          (window as any).copied = {
            html: await (await item.getType("text/html")).text(),
            text: await (await item.getType("text/plain")).text(),
          };
        },
        writeText: async (text: string) => {
          (window as any).copied = { text };
        },
      },
    });
  });
  await page.route("**/api/bsb-v2/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.endsWith("/finish")
        ? {
            messages: result.messages,
            warnings: [],
            resources: [],
            suggestions: [],
          }
        : [],
    });
  });
  await page.goto("/workspace");
  await page.getByLabel("Company", { exact: true }).fill("Earli");
  await page.getByLabel("Sequence from ChatGPT", { exact: true }).fill(draft);
  await page
    .getByRole("button", { name: "Finish sequence", exact: true })
    .click();
});

test("formatted preview, rich copy, plain download and live edits", async ({
  page,
}) => {
  const preview = page.getByLabel("Email 1 formatted preview");
  await expect(page.getByLabel("Message", { exact: true })).toHaveCount(0);
  await expect(preview.getByRole("link")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Copy sequence", exact: true }),
  ).toBeEnabled();
  await expect(preview.locator("strong").first()).toHaveText("October 27");
  await expect(preview.locator("li strong")).toHaveText(
    "Tuesday, October 27, 2026, 1 PM–4 PM PDT",
  );
  const linkedIn = page.getByLabel("LinkedIn Message 1 formatted preview");
  await expect(linkedIn.locator("strong")).toHaveCount(2);
  await expect(linkedIn).toContainText("Tuesday, October 27");
  await page
    .getByRole("button", { name: "Copy message", exact: true })
    .first()
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).copied.html))
    .toContain("<li><strong>");
  let copied = await page.evaluate(() => (window as any).copied);
  expect(copied.text).toContain("{{first_name}}");
  expect(copied.html).toContain('href="https://brukerspatialbiology.com/"');
  expect(copied.html.match(/<a href=/g)).toHaveLength(4);
  expect(copied.text).toContain("\n- Tuesday");
  expect(copied.text).not.toContain("**");
  expect(copied.html + copied.text).not.toContain("private guidance");
  await page
    .getByRole("button", { name: "Copy message", exact: true })
    .nth(1)
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).copied.html))
    .toContain("<strong>");
  await page
    .getByRole("button", { name: "Copy sequence", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).copied.text))
    .toContain("LinkedIn Message 1");
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download text", exact: true })
    .click();
  const download = await downloadEvent;
  const text = await readFile((await download.path())!, "utf8");
  expect(text).toContain("- Tuesday, October 27");
  expect(text).not.toContain("**");
  expect(text).not.toContain("private guidance");
  await page
    .getByRole("button", { name: "Edit message", exact: true })
    .first()
    .click();
  await expect(preview).toHaveCount(0);
  await page
    .getByLabel("Message", { exact: true })
    .first()
    .fill("Edited **availability**\n\n- **New window**");
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await expect(page.getByLabel("Message", { exact: true })).toHaveCount(0);
  await expect(preview.locator("li strong")).toHaveText("New window");
});

test("rich clipboard rejection falls back to clean plain text", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).rejectRich = true;
  });
  await page
    .getByRole("button", { name: "Copy message", exact: true })
    .first()
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).copied.text))
    .toContain("\n- Tuesday");
  const copied = await page.evaluate(() => (window as any).copied);
  expect(copied.html).toBeUndefined();
  expect(copied.text).not.toContain("**");
  await expect(page.getByRole("status")).toContainText("Copied plain");
});
