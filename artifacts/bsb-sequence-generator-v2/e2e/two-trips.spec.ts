import { test, expect } from "@playwright/test";
test("both visits are required before Finish becomes available", async ({page}) => {
  await page.route("**/api/bsb-v2/**", route => route.fulfill({json:[]}));
  await page.goto("/workspace");
  await page.getByLabel("Company",{exact:true}).fill("Earli");
  await page.getByLabel("Sequence from ChatGPT",{exact:true}).fill("Email 1\nHello");
  const finish=page.getByRole("button",{name:"Finish sequence",exact:true});
  await expect(finish).toBeDisabled();
  for (const [title,date] of [["First visit","2027-01-12"],["Second visit","2027-01-26"]]) {
    await page.getByLabel(`${title} start date`).fill(date);
    await page.getByLabel(`${title} end date`).fill(date);
    await expect(finish).toBeDisabled();
    await page.getByRole("group",{name:title,exact:true}).getByRole("button",{name:"Morning",exact:true}).click();
    if(title==="First visit") await expect(finish).toBeDisabled();
  }
  await expect(finish).toBeEnabled();
  await page.getByLabel("Second visit end date").fill("");
  await expect(finish).toBeDisabled();
  await expect(page.getByText("Second visit (required)", {exact:false})).toBeVisible();
});
