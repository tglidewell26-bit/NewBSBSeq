import { test, expect } from "@playwright/test";
const asset = {
  id: "panel",
  displayName: "VistaPlex Spatial Immune Profiling",
  fileName: "panel.pdf",
  fileKind: "document",
  instrument: "CellScape",
  description: "An immune panel.",
  keywords: ["immune"],
  assetType: "Panels and Brochures",
};
test.beforeEach(async ({ page }) => {
  let saved: any;
  await page.route("**/api/bsb-v2/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace("/api/bsb-v2/", "");
    let data: any = [];
    if (path === "assets") data = [asset];
    else if (path === "assets/analysis/config") data = { enabled: false };
    else if (path === "finish")
      data = {
        messages: [
          {
            id: "message-1",
            title: "Email 1",
            subject: "Immune profiling",
            body: "Hi there,\nCould immune profiling help?\nI’m available Tuesday, November 10, 2026, 10 AM–1 PM PST.",
            resourceNote: "A related immune panel.",
            selectedAssetIds: [],
          },
        ],
        resources: [asset],
        suggestions: [
          {
            messageId: "message-1",
            assetId: asset.id,
            relevance: "related",
            reason: "A related immune panel.",
          },
        ],
        warnings: [],
      };
    else if (path === "finished" && req.method() === "POST") {
      saved = {
        ...req.postDataJSON(),
        id: "saved-1",
        resources: [asset],
        suggestions: [],
        warnings: [],
        createdAt: "2026-10-08T18:00:00Z",
        updatedAt: "2026-10-08T18:00:00Z",
      };
      data = saved;
    } else if (path === "finished")
      data = saved
        ? [
            {
              id: saved.id,
              company: saved.input.company,
              updatedAt: saved.updatedAt,
              messageCount: 1,
            },
          ]
        : [];
    else if (path === "finished/saved-1" && req.method() === "DELETE") {
      saved = undefined;
      data = { deleted: true };
    } else if (path === "finished/saved-1") data = saved;
    await route.fulfill({ json: data });
  });
});
test("paste, finish, save, reopen and delete", async ({ page }) => {
  await page.goto("/workspace");
  await page.getByLabel("Company", { exact: true }).fill("Earli");
  await page
    .getByLabel("Sequence from ChatGPT", { exact: true })
    .fill(
      "Instrument: CellScape\nEmail 1\nHi there,\nCould immune profiling help?\nI’m available {{TRIP_1_AVAILABILITY}}.\nResource note: A related immune panel.",
    );
  await page.getByLabel("First visit start date").fill("2026-11-10");
  await page.getByLabel("First visit end date").fill("2026-11-10");
  await page.getByRole("button", { name: "Morning", exact: true }).click();
  await page
    .getByRole("button", { name: "Finish sequence", exact: true })
    .click();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    /Tuesday, November 10/,
  );
  await expect(page.getByLabel("Message", { exact: true })).not.toHaveValue(
    /Resource note/,
  );
  await expect(
    page.getByRole("checkbox", {
      name: "Use VistaPlex Spatial Immune Profiling for Email 1",
    }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Save to History", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Saved to History");
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page.getByRole("link", { name: "Earli", exact: true }).click();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    /Could immune profiling help/,
  );
  await page.getByRole("link", { name: "History", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByText("No saved sequences yet.", { exact: false }),
  ).toBeVisible();
});
test("tabs preserve drafts; changed dates cannot silently reuse an old result", async ({
  page,
}) => {
  await page.goto("/workspace");
  await page.getByLabel("Company", { exact: true }).fill("Astellas");
  await page
    .getByLabel("Sequence from ChatGPT", { exact: true })
    .fill("Email 1\nHello, this is my draft.");
  await page.getByRole("link", { name: "Knowledge Base", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Knowledge Base", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Finish Sequence", exact: true })
    .click();
  await expect(page.getByLabel("Company", { exact: true })).toHaveValue(
    "Astellas",
  );
  await page
    .getByRole("button", { name: "Finish sequence", exact: true })
    .click();
  await page
    .getByLabel("Visit location", { exact: false })
    .fill("San Francisco");
  await expect(
    page.getByRole("button", { name: "Copy sequence", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save to History", exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
