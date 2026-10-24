import type { Page } from "@playwright/test";
export async function openSettings(page: Page) {
  const button = page.getByRole("button", { name: "학습 설정", exact: true });
  if (await button.isVisible()) await button.click();
}
