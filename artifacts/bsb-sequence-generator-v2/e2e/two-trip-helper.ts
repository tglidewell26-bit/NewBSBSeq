import { expect, type Page } from "@playwright/test";
export async function selectTwoTrips(page: Page) {
  for (const [title, date] of [["First visit", "2027-01-12"], ["Second visit", "2027-01-26"]]) {
    await page.getByLabel(`${title} start date`).fill(date);
    await page.getByLabel(`${title} end date`).fill(date);
    await page.getByRole("group", { name: title, exact: true }).getByRole("button", {name:"Morning", exact:true}).click();
  }
  await expect(page.getByRole("button", {name:"Finish sequence", exact:true})).toBeEnabled();
}
