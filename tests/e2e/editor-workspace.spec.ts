import { test, expect } from "@playwright/test";
import { EXAMPLE_MAPS } from "../../src/core/maps";

test("touch pinch cancels pending road and object placement without dirtying the map", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.goto(baseURL! + "#editor");
    const canvas = page.getByLabel("맵 편집 캔버스");
    const r = (await canvas.boundingBox())!;
    const cdp = await context.newCDPSession(page);
    for (const name of ["도로 그리기", "벽"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: Math.round(r.x + 120), y: Math.round(r.y + 250), id: 0 },
          { x: Math.round(r.x + 240), y: Math.round(r.y + 250), id: 1 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: Math.round(r.x + 80), y: Math.round(r.y + 250), id: 0 },
          { x: Math.round(r.x + 280), y: Math.round(r.y + 250), id: 1 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect(page.locator(".save-state")).toHaveText("저장됨");
      await expect(
        page.getByRole("button", { name: "실행 취소", exact: true }),
      ).toBeDisabled();
      await expect
        .poll(async () => Number(await canvas.getAttribute("data-zoom")))
        .toBeGreaterThan(1.4);
      await page
        .getByRole("button", { name: "화면 맞춤", exact: true })
        .click();
    }
  } finally {
    await context.close();
  }
});

test("shared light and dark surfaces across project, libraries and training", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 960 });
  for (const target of [
    "home",
    "compare",
    "maps",
    "models",
    "experiments",
    "lab",
    "editor",
  ]) {
    await page.goto("./#" + target);
    if (target === "editor")
      await expect(
        page.getByRole("toolbar", { name: "맵 편집 도구" }),
      ).toBeVisible();
    else await expect(page.locator("h1")).toBeVisible();
    await page.screenshot({
      path: `.cache/ui-review/${target}-overview-desktop.png`,
      animations: "disabled",
    });
  }
  expect(errors).toEqual([]);
});

test("right-button pan preserves tool and geometry; cancellation, middle pan, layers and viewport layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await page.getByRole("button", { name: "맵 편집", exact: true }).click();
  const canvas = page.getByLabel("맵 편집 캔버스");
  const road = page.getByRole("button", { name: "도로 그리기", exact: true });
  await road.click();
  const count = await page.locator(".element-count").innerText();
  const box = (await canvas.boundingBox())!;
  const pan = await canvas.getAttribute("data-pan-x");
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(
    box.x + box.width * 0.45 + 90,
    box.y + box.height * 0.5 + 40,
    { steps: 12 },
  );
  await page.mouse.up({ button: "right" });
  expect(await canvas.getAttribute("data-pan-x")).not.toBe(pan);
  await expect(road).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".element-count")).toHaveText(count);
  await expect(canvas).not.toHaveClass(/panning/);
  // Pointer capture retains the right-button gesture even outside the canvas.
  await page.mouse.down({ button: "right" });
  await page.mouse.move(1430, 20, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await expect(canvas).not.toHaveClass(/panning/);
  await page.getByRole("button", { name: "화면 맞춤", exact: true }).click();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(
    box.x + box.width * 0.5 + 60,
    box.y + box.height * 0.5,
    { steps: 6 },
  );
  await page.mouse.up({ button: "middle" });
  expect(await canvas.getAttribute("data-pan-x")).not.toBe("0.00");
  await page.mouse.down({ button: "right" });
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(canvas).not.toHaveClass(/panning/);
  await page.mouse.up({ button: "right" });
  await page.getByRole("button", { name: "화면 맞춤", exact: true }).click();
  // Left click after right pan is still a road edit, and one undo restores it.
  await canvas.click({ position: { x: box.width * 0.8, y: box.height * 0.6 } });
  await expect(page.locator(".element-count")).not.toHaveText(count);
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(page.locator(".element-count")).toHaveText(count);
  await page.getByRole("tab", { name: "레이어", exact: true }).click();
  await page
    .getByRole("button", { name: "레이어 선택 체크포인트 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "체크포인트 1 잠금", exact: true })
    .click();
  await page.getByRole("tab", { name: "속성", exact: true }).click();
  await expect(page.getByLabel("위치 X", { exact: true })).toBeDisabled();
  await page.getByRole("tab", { name: "레이어", exact: true }).click();
  await page
    .getByRole("button", { name: "체크포인트 1 숨기기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "체크포인트 1 표시", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const beforeZoom = await canvas.getAttribute("data-zoom");
  await page.locator(".inspector-content").hover();
  await page.mouse.wheel(0, 400);
  await expect(canvas).toHaveAttribute("data-zoom", beforeZoom!);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "속성", exact: true }).click();
  await page.getByRole("button", { name: "선택 / 이동", exact: true }).click();
  await page.screenshot({ path: ".cache/ui-review/editor-desktop-light.png" });
  await page.getByRole("button", { name: "테마 전환", exact: true }).click();
  await page.screenshot({
    path: ".cache/ui-review/editor-desktop-dark.png",
    animations: "disabled",
  });
  for (const size of [
    { width: 1024, height: 600 },
    { width: 1440, height: 720 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("toolbar", { name: "맵 편집 도구" }),
    ).toBeVisible();
  }
});

test("workspace import previews counts, conflicts, exports and survives reload; legacy format", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "맵 저장", exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText(
    "저장했습니다",
  );
  await page.getByRole("button", { name: "데이터 백업 · 이전" }).click();
  const input = page.getByLabel("작업 공간 JSON 파일");
  const payload = {
    maps: [{ ...EXAMPLE_MAPS[2], name: "복원한 맵" }],
    models: [],
    experiments: [],
  };
  await input.setInputFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  const row = page.locator(".transfer-table tbody tr").first();
  await expect(row).toContainText("맵");
  await expect(row.locator("td").nth(2)).toHaveText("1");
  await expect(row.locator("td").nth(3)).toHaveText("0");
  await page.getByLabel("중복 ID 처리").selectOption("overwrite");
  await expect(row.locator("td").nth(3)).toHaveText("1");
  await page.getByRole("button", { name: "확인한 자료 가져오기" }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText(
    "가져왔습니다",
  );
  await page.reload();
  await expect(page.getByLabel("현재 맵").locator("option:checked")).toHaveText(
    "복원한 맵",
  );
  await page.getByRole("button", { name: "데이터 백업 · 이전" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 JSON 내보내기" }).click();
  const stream = await (await downloaded).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.version).toBe(1);
  expect(exported.maps[0].name).toBe("복원한 맵");
  await input.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ ...payload, models: [{ id: "bad" }] }),
    ),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "확인한 자료 가져오기" }),
  ).toHaveCount(0);
});

test("mobile editor is a viewport workspace with a scrollable toolbar and property sheet", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.goto(baseURL!);
    await page.getByRole("button", { name: /Bounce/ }).click();
    await page.getByRole("button", { name: "맵 편집", exact: true }).click();
    await expect(page.getByLabel("맵 편집 캔버스")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: ".cache/ui-review/editor-mobile.png" });
    await page.getByRole("button", { name: "속성 열기", exact: true }).click();
    await page.getByRole("tab", { name: "맵 설정", exact: true }).click();
    await expect(page.getByLabel("맵 가로", { exact: true })).toBeVisible();
    await page.screenshot({
      path: ".cache/ui-review/editor-mobile-inspector.png",
    });
  } finally {
    await context.close();
  }
});
