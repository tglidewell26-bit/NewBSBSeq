import { test, expect } from "@playwright/test";
import { selectTwoTrips } from "./two-trip-helper";

test("separate resource browsers filter, select, and preserve selections when saving", async ({
  page,
}) => {
  const assets = [
    {
      id: "image-c",
      displayName: "Cell segmentation",
      instrument: "CellScape",
      fileKind: "image",
      assetType: "Images",
    },
    {
      id: "image-g",
      displayName: "Tumor regions",
      instrument: "GeoMx",
      fileKind: "image",
      assetType: "Images",
    },
    {
      id: "paper",
      displayName: "Immune publication",
      instrument: "GeoMx",
      fileKind: "document",
      assetType: "Publications",
    },
    {
      id: "poster",
      displayName: "Immune poster",
      instrument: "GeoMx",
      fileKind: "document",
      assetType: "Publications",
    },
    {
      id: "tech",
      displayName: "Workflow guide",
      instrument: "CosMx",
      fileKind: "document",
      assetType: "Tech notes",
    },
    {
      id: "link",
      displayName: "Product overview",
      instrument: "GeoMx",
      fileKind: "link",
      assetType: "Other resources",
      sourceUrl: "https://example.com",
    },
  ].map((a) => ({
    fileName: a.id,
    description: "Tissue biology",
    keywords: ["spatial"],
    ...a,
  }));
  let saved: any;
  await page.route("**/api/bsb-v2/**", async (route) => {
    const path = new URL(route.request().url()).pathname.split("/bsb-v2/")[1];
    let data: any = [];
    if (path === "assets") data = assets;
    if (path === "finish")
      data = {
        messages: [
          {
            id: "m1",
            title: "Email 1",
            subject: "Question",
            body: "Hello",
            resourceNote: "",
            selectedAssetIds: [],
          },
        ],
        resources: assets,
        suggestions: [
          {
            messageId: "m1",
            assetId: "paper",
            relevance: "direct",
            reason: "Relevant science",
          },
        ],
        warnings: [],
      };
    if (path === "finished" && route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      data = {
        ...saved,
        id: "saved",
        resources: assets,
        suggestions: [],
        warnings: [],
        createdAt: "2026-10-10",
        updatedAt: "2026-10-10",
      };
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/workspace");
  await page.getByLabel("Company", { exact: true }).fill("Astellas");
  await page
    .getByLabel("Sequence from ChatGPT", { exact: true })
    .fill("Email 1\nHello");
  await selectTwoTrips(page);
  await page
    .getByRole("button", { name: "Finish sequence", exact: true })
    .click();
  const images = page.getByRole("region", {
    name: "Email 1 Images",
    exact: true,
  });
  const docs = page.getByRole("region", {
    name: "Email 1 Documents",
    exact: true,
  });
  await images
    .getByText("Browse Knowledge Base images", { exact: true })
    .click();
  await docs
    .getByText("Browse Knowledge Base documents", { exact: true })
    .click();
  await expect(images.getByRole("button", { name: /^Add / })).toHaveCount(2);
  await expect(docs.getByRole("button", { name: /^Add / })).toHaveCount(4);
  await images.getByLabel("Email 1 images instrument").selectOption("GeoMx");
  await expect(images.getByRole("button", { name: /^Add / })).toHaveCount(1);
  await images.getByLabel("Search images for Email 1").fill("no-match");
  await expect(images.getByText(/No matching images/)).toBeVisible();
  await images.getByRole("button", { name: "Clear filters" }).click();
  await images.getByLabel("Search images for Email 1").fill("segmentation");
  await images
    .getByRole("button", { name: "Add Cell segmentation to Email 1" })
    .click();
  await expect(
    images.getByRole("checkbox", { name: "Use Cell segmentation for Email 1" }),
  ).toBeChecked();
  await docs.getByLabel("Email 1 documents instrument").selectOption("GeoMx");
  await docs.getByLabel("Email 1 document type").selectOption("Posters");
  await expect(docs.getByRole("button", { name: /^Add / })).toHaveCount(1);
  await docs
    .getByRole("button", { name: "Add Immune poster to Email 1" })
    .click();
  await expect(
    docs.getByRole("button", { name: "Add Immune poster to Email 1" }),
  ).toBeDisabled();
  await docs.getByLabel("Email 1 document type").selectOption("Tech notes");
  await expect(docs.getByText(/No matching documents/)).toBeVisible();
  await docs.getByLabel("Email 1 documents instrument").selectOption("CosMx");
  await expect(
    docs.getByRole("button", { name: "Add Workflow guide to Email 1" }),
  ).toBeVisible();
  await expect(
    docs.getByRole("checkbox", { name: "Use Immune publication for Email 1" }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Save to History", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Saved to History");
  expect(saved.messages[0].selectedAssetIds).toEqual([
    "paper",
    "image-c",
    "poster",
  ]);
});
