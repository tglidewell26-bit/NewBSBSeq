import { test, expect } from "@playwright/test";
import { finishText } from "../../api-server/src/lib/finisher";
const titles = [
  "Email 1",
  "Email 2",
  "LinkedIn Connection Request",
  "LinkedIn Message 1",
  "Email 3",
  "Email 4",
  "Email 5",
  "LinkedIn Message 2",
  "Email 6",
];
const opening =
  "Sorry I missed you last time. As a reminder, my name is Tim Glidewell and I am your Spatial Regional Account Manager with Bruker Spatial Biology.";
for (const legacy of [false, true]) {
  test(`LinkedIn labels, no Subject, and Email 4 opening (${legacy ? "legacy" : "new"} handoff)`, async ({
    page,
  }) => {
    const source = titles
      .map((t) => {
        const heading = legacy
          ? t
              .replace("LinkedIn Connection Request", "LinkedIn 1")
              .replace("LinkedIn Message 1", "LinkedIn 2")
              .replace("LinkedIn Message 2", "LinkedIn 3")
          : t;
        return `${heading}\nSubject: An email subject\nHi {{first_name}},\n\n${t === "Email 4" ? opening : "A useful message."}`;
      })
      .join("\n\n");
    const result = finishText({ company: "Earli", source });
    await page.route("**/api/bsb-v2/**", (route) =>
      route.fulfill({
        json: route.request().url().endsWith("/finish")
          ? { ...result, resources: [], suggestions: [] }
          : [],
      }),
    );
    await page.goto("/workspace");
    await page.getByLabel("Company", { exact: true }).fill("Earli");
    await page
      .getByLabel("Sequence from ChatGPT", { exact: true })
      .fill(source);
    await page
      .getByRole("button", { name: "Finish sequence", exact: true })
      .click();
    await expect(page.locator("article h3")).toHaveText(titles);
    await expect(page.getByLabel("Subject", { exact: true })).toHaveCount(6);
    for (const title of titles.filter((t) => t.startsWith("LinkedIn"))) {
      const article = page
        .locator("article")
        .filter({
          has: page.getByRole("heading", { name: title, exact: true }),
        });
      await expect(article.getByLabel("Subject", { exact: true })).toHaveCount(
        0,
      );
    }
    await expect(page.getByLabel("Email 4 formatted preview")).toContainText(
      opening,
    );
    await expect(
      page.getByRole("button", { name: "Copy sequence", exact: true }),
    ).toBeEnabled();
  });
}
