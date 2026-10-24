import { openSettings } from "./helpers";
import { test, expect, type Page } from "@playwright/test";
import { EXAMPLE_MAPS } from "../../src/core/maps";
async function drag(page: Page, ctrl = false) {
  const c = page.getByLabel("맵 편집 캔버스"),
    b = (await c.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.65, b.y + b.height * 0.3);
  if (ctrl) await page.keyboard.down("Control");
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.65 + 60, b.y + b.height * 0.3 - 70, {
    steps: 10,
  });
  await page.mouse.up();
  if (ctrl) await page.keyboard.up("Control");
}
test("blank drag pans, Ctrl vertical drag zooms; sidebar size and collapsed state persist", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("./");
  const resize = page.getByRole("separator", { name: "사이드바 너비" });
  await resize.focus();
  await resize.press("ArrowRight");
  await expect(resize).toHaveAttribute("aria-valuenow", "232");
  await expect
    .poll(async () => (await page.locator(".sidebar").boundingBox())!.width)
    .toBeCloseTo(232, 0);
  const box = (await resize.boundingBox())!;
  await page.mouse.move(box.x + 2, 100);
  await page.mouse.down();
  await page.mouse.move(310, 100, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await page.locator(".sidebar").boundingBox())!.width)
    .toBeCloseTo(310, 0);
  await page.getByRole("button", { name: "메뉴", exact: true }).click();
  await expect(page.locator(".app")).toHaveClass(/nav-collapsed/);
  await page.reload();
  await expect(page.locator(".app")).toHaveClass(/nav-collapsed/);
  await page.getByRole("button", { name: "메뉴", exact: true }).click();
  await expect(resize).toHaveAttribute("aria-valuenow", "310");
  await page.getByRole("button", { name: "맵 편집", exact: true }).click();
  const c = page.getByLabel("맵 편집 캔버스");
  await drag(page);
  await expect(c).toHaveAttribute("data-zoom", "1.000");
  expect(await c.getAttribute("data-pan-x")).not.toBe("0.00");
  await drag(page, true);
  expect(Number(await c.getAttribute("data-zoom"))).toBeGreaterThan(1.5);
  await page.getByRole("button", { name: "메뉴", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "주요 메뉴" }),
  ).toBeVisible();
});
test("manual WASD separates steering, throttle and boost; bombs trigger retry without closing test", async ({
  page,
}) => {
  const map = {
    ...structuredClone(EXAMPLE_MAPS[0]),
    id: "manual-ux",
    name: "수동 조작 검증",
    environmentVersion: 3,
    checkpoints: [],
    objects: [{ id: "bomb", kind: "bomb", x: 210, y: 305, w: 30, h: 30 }],
  };
  await page.goto("./#maps");
  await page.locator('input[type="file"]').setInputFiles({
    name: "manual.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(map)),
  });
  await expect(page.locator('.toast[role="status"]')).toContainText(
    "가져왔습니다",
  );
  await page.getByRole("button", { name: "맵 에디터", exact: true }).click();
  await page.getByRole("button", { name: "테스트 실행", exact: true }).click();
  const c = page.getByLabel("맵 편집 캔버스");
  await page.keyboard.down("d");
  await expect
    .poll(async () => Math.abs(Number(await c.getAttribute("data-test-angle"))))
    .toBeGreaterThan(0.2);
  await page.keyboard.up("d");
  expect(
    Math.abs(Number(await c.getAttribute("data-test-angle"))),
  ).toBeGreaterThan(0.2);
  expect(Number(await c.getAttribute("data-test-speed"))).toBe(0);
  await page.keyboard.press("r");
  await page.keyboard.down("s");
  await expect
    .poll(async () => Number(await c.getAttribute("data-test-speed")))
    .toBeLessThan(0);
  await page.keyboard.up("s");
  expect(Number(await c.getAttribute("data-test-speed"))).toBeLessThan(0);
  await page.keyboard.press("r");
  const retries = Number(await c.getAttribute("data-test-respawns"));
  await page.keyboard.down("w");
  await expect
    .poll(async () => Number(await c.getAttribute("data-test-speed")))
    .toBeGreaterThan(20);
  const speed = Number(await c.getAttribute("data-test-speed"));
  await page.keyboard.down("Space");
  await expect
    .poll(async () => Number(await c.getAttribute("data-test-speed")))
    .toBeGreaterThan(speed + 20);
  await expect
    .poll(async () => Number(await c.getAttribute("data-test-respawns")))
    .toBeGreaterThan(retries);
  await page.keyboard.up("w");
  await page.keyboard.up("Space");
  await expect(
    page.getByRole("button", { name: "테스트 종료", exact: true }),
  ).toBeVisible();
});
test("training keeps its original map while an editable draft is saved for next or restarted now", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await page.getByLabel("학습 알고리즘").selectOption("GA");
  await openSettings(page);
  await page.getByLabel("개체군 크기", { exact: true }).fill("4");
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect(page.getByLabel("AI 시뮬레이션 캔버스")).toHaveAttribute(
    "data-live-count",
    "4",
  );
  await page.getByRole("button", { name: "맵 편집", exact: true }).click();
  await page.getByLabel("맵 이름", { exact: true }).fill("계속 학습할 편집본");
  await page
    .getByRole("region", { name: "맵 편집 작업 공간" })
    .getByRole("button", { name: "맵 저장", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "학습 중 편집본 저장" }),
  ).toBeVisible();
  await page.screenshot({ path: ".cache/ui-review/draft-save-choice.png" });
  await page.getByRole("button", { name: "저장 · 다음 세션부터 적용" }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText(
    "저장했습니다",
  );
  await page.getByRole("button", { name: "학습하기", exact: true }).click();
  await expect(page.getByLabel("현재 맵")).toHaveValue("r-straight");
  await expect(
    page.getByRole("button", { name: "학습 재개", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "맵 편집", exact: true }).click();
  await page.getByLabel("맵 이름", { exact: true }).fill("지금 반영할 편집본");
  await page
    .getByRole("region", { name: "맵 편집 작업 공간" })
    .getByRole("button", { name: "맵 저장", exact: true })
    .click();
  await page.getByRole("button", { name: "저장 · 지금 세션 재시작" }).click();
  await expect(page.getByLabel("현재 맵").locator("option:checked")).toHaveText(
    "지금 반영할 편집본",
  );
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
});
test("home demonstrates actual failure/retry and tutorials are grouped without deletion", async ({
  page,
}) => {
  await page.goto("./#home");
  const hero = page.getByLabel("실제 물리 기반 주행 데모");
  const initial = await hero.getAttribute("data-demo-x");
  await expect.poll(() => hero.getAttribute("data-demo-x")).not.toBe(initial);
  await expect
    .poll(() => hero.getAttribute("data-demo-outcome"), { timeout: 15000 })
    .toBe("success");
  await page.screenshot({ path: ".cache/ui-review/home-live-demo.png" });
  await page
    .getByRole("button", { name: "맵 라이브러리", exact: true })
    .click();
  const before = await page.locator(".map-card").count();
  await page.getByLabel("튜토리얼 맵도 보기", { exact: false }).check();
  await expect(page.locator(".map-card")).toHaveCount(before + 3);
});

test("inspector explains and persists launch properties; leaving dirty edits warns", async ({
  page,
}) => {
  const map = {
    ...structuredClone(EXAMPLE_MAPS[4]),
    id: "inspector-ux",
    name: "속성 검증",
    environmentVersion: 3,
    objects: [
      { id: "spring-ux", kind: "spring", x: 300, y: 400, w: 90, h: 20 },
      { id: "elastic-ux", kind: "elastic", x: 500, y: 400, w: 90, h: 20 },
    ],
  };
  await page.goto("./#maps");
  await page.locator('input[type="file"]').setInputFiles({
    name: "properties.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(map)),
  });
  await expect(page.locator('.toast[role="status"]')).toContainText(
    "가져왔습니다",
  );
  await page.getByRole("button", { name: "맵 에디터", exact: true }).click();
  await page.getByRole("tab", { name: "레이어", exact: true }).click();
  await page.getByRole("button", { name: /레이어 선택 점프대/ }).click();
  await page.getByRole("tab", { name: "속성", exact: true }).click();
  await expect(page.locator(".element-description")).toContainText("발사");
  await page.getByLabel("발사 세기", { exact: true }).fill("650");
  await page.getByLabel("상대 발사 방향", { exact: true }).fill("-60");
  await page.getByRole("tab", { name: "레이어", exact: true }).click();
  await page.getByRole("button", { name: /레이어 선택 탄성 발판/ }).click();
  await page.getByRole("tab", { name: "속성", exact: true }).click();
  await expect(page.locator(".element-description")).toContainText("계수");
  await page.getByLabel("탄성 계수", { exact: true }).fill("1.3");
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "메뉴", exact: true }).click();
  await page
    .getByRole("button", { name: "맵 라이브러리", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "맵 편집 작업 공간" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("region", { name: "맵 편집 작업 공간" })
    .getByRole("button", { name: "맵 저장", exact: true })
    .click();
  await expect(page.locator('.toast[role="status"]')).toContainText(
    "저장했습니다",
  );
  await page.goto("./#maps");
  await page.reload();
  await page
    .getByRole("button", { name: "속성 검증 (v5) 편집", exact: true })
    .click();
  await page.getByRole("tab", { name: "레이어", exact: true }).click();
  await page.getByRole("button", { name: /레이어 선택 탄성 발판/ }).click();
  await page.getByRole("tab", { name: "속성", exact: true }).click();
  await expect(page.getByLabel("탄성 계수", { exact: true })).toHaveValue(
    "1.3",
  );
  await page.getByRole("tab", { name: "레이어", exact: true }).click();
  await page.getByRole("button", { name: /레이어 선택 점프대/ }).click();
  await page.getByRole("tab", { name: "속성", exact: true }).click();
  await expect(page.getByLabel("발사 세기", { exact: true })).toHaveValue(
    "650",
  );
  await expect(page.getByLabel("상대 발사 방향", { exact: true })).toHaveValue(
    "-60",
  );
  await page.screenshot({
    path: ".cache/ui-review/inspector-launch-properties.png",
  });
});
