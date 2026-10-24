import { test, expect, type Page } from "@playwright/test";
import { EXAMPLE_MAPS } from "../../src/core/maps";
import { openSettings } from "./helpers";
async function selectObject(page: Page, label: string) {
  await page.getByRole("tab", { name: "레이어", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp("레이어 선택 " + label) })
    .click();
  await page.getByRole("tab", { name: "속성", exact: true }).click();
}
async function importExtended(page: Page) {
  const map = {
    ...structuredClone(EXAMPLE_MAPS[4]),
    id: "new-elements-ux",
    name: "새 요소 검증",
    environmentVersion: 4,
    objects: [
      { id: "floor", kind: "platform", x: 20, y: 550, w: 960, h: 40 },
      { id: "assist", kind: "elastic", x: 400, y: 430, w: 100, h: 20 },
      { id: "belt", kind: "belt", x: 50, y: 480, w: 230, h: 70 },
      {
        id: "reward",
        kind: "reward",
        x: 50,
        y: 480,
        w: 230,
        h: 70,
        rewardValue: 2,
      },
    ],
  };
  await page.goto("./#maps");
  await page.locator('input[type="file"]').setInputFiles({
    name: "v4.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(map)),
  });
  await expect(page.locator(".toast")).toContainText("가져왔습니다");
  await page.getByRole("button", { name: "맵 에디터", exact: true }).click();
}
test("elastic assist, belts and shaping properties persist and affect manual play", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await importExtended(page);
  await expect(
    page.getByRole("button", { name: "속도 벨트", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "중간 보상", exact: true }),
  ).toBeVisible();
  await selectObject(page, "탄성 발판");
  await expect(page.locator(".element-description")).toContainText(
    "점프를 보조",
  );
  await page.getByLabel("점프 보조", { exact: true }).fill("200");
  await page.getByLabel("최소 도약 속도", { exact: true }).fill("280");
  await page.getByLabel("최대 도약 속도", { exact: true }).fill("800");
  await page.getByLabel("탄성 계수", { exact: true }).fill("1.1");
  await selectObject(page, "속도 벨트");
  await page.getByLabel("벨트 타입", { exact: true }).selectOption("boost");
  await page.getByLabel("벨트 세기", { exact: true }).fill("550");
  await page.getByLabel("방향 기준", { exact: true }).selectOption("velocity");
  await selectObject(page, "중간 보상");
  await page.getByLabel("보상 이름", { exact: true }).fill("도약 보상");
  await page.getByLabel("보상값", { exact: true }).fill("3");
  await page.getByRole("button", { name: "맵 저장", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("저장했습니다");
  await page.goto("./#maps");
  await page.reload();
  await page
    .getByRole("button", { name: "새 요소 검증 (v5) 편집", exact: true })
    .click();
  await selectObject(page, "탄성 발판");
  await expect(page.getByLabel("점프 보조", { exact: true })).toHaveValue(
    "200",
  );
  await expect(page.getByLabel("최소 도약 속도", { exact: true })).toHaveValue(
    "280",
  );
  await expect(page.getByLabel("최대 도약 속도", { exact: true })).toHaveValue(
    "800",
  );
  await selectObject(page, "속도 벨트");
  await expect(page.getByLabel("벨트 세기", { exact: true })).toHaveValue(
    "550",
  );
  await selectObject(page, "중간 보상");
  await expect(page.getByLabel("보상 이름", { exact: true })).toHaveValue(
    "도약 보상",
  );
  await expect(page.getByLabel("보상값", { exact: true })).toHaveValue("3");
  await page.screenshot({ path: ".cache/ui-review/v4-element-inspector.png" });
  await page.getByRole("button", { name: "테스트 실행", exact: true }).click();
  await expect(page.getByLabel("중간 보상 누적")).toContainText("3.00");
  await expect
    .poll(async () =>
      Number(
        await page.getByLabel("맵 편집 캔버스").getAttribute("data-test-x"),
      ),
    )
    .toBeGreaterThan(100);
  await page.getByRole("button", { name: "테스트 종료", exact: true }).click();
  await page.getByRole("button", { name: "학습하기", exact: true }).click();
  await page.getByLabel("학습 알고리즘").selectOption("GA");
  await openSettings(page);
  await page.getByLabel("개체군 크기", { exact: true }).fill("4");
  await page.getByLabel("에피소드 최대 스텝", { exact: true }).fill("30");
  await page.getByRole("button", { name: "패널 닫기", exact: true }).click();
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        await page
          .getByLabel("AI 시뮬레이션 캔버스")
          .getAttribute("data-generation"),
      ),
    )
    .toBeGreaterThan(1);
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
  await page.getByRole("button", { name: "모델 저장", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("추론 모델");
  await page
    .getByRole("button", { name: "모델 라이브러리", exact: true })
    .click();
  await expect(page.locator(".model-compatibility")).toContainText("환경 v5");
});
test("test hints close, stay dismissed after reload, and can be restored", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("./#editor");
  await page.getByRole("button", { name: "테스트 실행", exact: true }).click();
  await expect(
    page.getByLabel("테스트 조작 안내", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("다시 보지 않기", { exact: true }).check();
  await page
    .getByRole("button", { name: "조작 안내 닫기", exact: true })
    .click();
  await expect(
    page.getByLabel("테스트 조작 안내", { exact: true }),
  ).toHaveCount(0);
  const beforeAngle = await page
    .getByLabel("맵 편집 캔버스")
    .getAttribute("data-test-angle");
  await page.keyboard.down("d");
  await expect
    .poll(() =>
      page.getByLabel("맵 편집 캔버스").getAttribute("data-test-angle"),
    )
    .not.toBe(beforeAngle);
  await page.keyboard.up("d");
  await page.getByRole("button", { name: "테스트 종료", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "테스트 실행", exact: true }).click();
  await expect(
    page.getByLabel("테스트 조작 안내", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("evotrack-test-help-never")),
  ).toBe("true");
  await page
    .getByRole("button", { name: "테스트 조작 안내 다시 켜기", exact: true })
    .click();
  await expect(
    page.getByLabel("테스트 조작 안내", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".cache/ui-review/compact-test-hints.png" });
});
test("desktop navigation pushes the editor; fullscreen works in lab/editor/library", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("./#editor");
  const canvas = page.getByLabel("맵 편집 캔버스");
  const expanded = (await canvas.boundingBox())!;
  await expect(page.locator(".nav-scrim")).toHaveCount(0);
  expect((await page.locator(".main-shell").boundingBox())!.x).toBeGreaterThan(
    190,
  );
  await page.getByRole("button", { name: "메뉴", exact: true }).click();
  await expect
    .poll(async () => (await page.locator(".main-shell").boundingBox())!.x)
    .toBeCloseTo(64, 0);
  await expect
    .poll(async () => (await canvas.boundingBox())!.width)
    .toBeGreaterThan(expanded.width + 100);
  await page.getByRole("button", { name: "전체 보기", exact: true }).click();
  await expect(page.locator(".app")).toHaveClass(/full-view/);
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".app")).not.toHaveClass(/full-view/);
  await page.getByRole("button", { name: "학습하기", exact: true }).click();
  await page.keyboard.press("Alt+Enter");
  await expect(page.locator(".app")).toHaveClass(/full-view/);
  await expect(page.locator(".metric-grid")).not.toBeVisible();
  expect(
    (await page.locator(".viewport").boundingBox())!.height,
  ).toBeGreaterThan(500);
  await page
    .getByRole("button", { name: "전체 보기 종료", exact: true })
    .click();
  await page
    .getByRole("button", { name: "맵 라이브러리", exact: true })
    .click();
  await page.getByRole("button", { name: "전체 보기", exact: true }).click();
  await expect(page.locator(".map-card").first()).toBeVisible();
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await page.keyboard.press("Escape");
});
test("floating settings keep the wide canvas; map and algorithm switches clean old Workers", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    const audit = { created: 0, terminated: 0, active: 0 };
    (window as any).__workers = audit;
    window.Worker = class extends Original {
      constructor(url: any, options?: any) {
        super(url, options);
        audit.created++;
        audit.active++;
      }
      terminate() {
        audit.terminated++;
        audit.active--;
        super.terminate();
      }
    } as any;
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("./?debug=1");
  await page.getByLabel("학습 알고리즘").selectOption("GA");
  const c = page.getByLabel("AI 시뮬레이션 캔버스");
  await expect(page.getByLabel("학습 설정 패널")).toHaveCount(0);
  const width = (await c.boundingBox())!.width;
  expect(width).toBeGreaterThan(1000);
  await openSettings(page);
  const panel = (await page.getByLabel("학습 설정 패널").boundingBox())!;
  expect(panel.x).toBeGreaterThan((await c.boundingBox())!.x);
  await page.screenshot({
    path: ".cache/ui-review/floating-training-settings.png",
  });
  await page.getByLabel("개체군 크기", { exact: true }).fill("4");
  await page.getByRole("button", { name: "패널 닫기", exact: true }).click();
  await expect(c).toBeVisible();
  expect((await c.boundingBox())!.width).toBeCloseTo(width, 0);
  await page.getByLabel("학습 알고리즘").selectOption("GA");
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect(c).toHaveAttribute("data-live-count", "4");
  const original = await c.getAttribute("data-environment-id");
  await page.getByLabel("학습 알고리즘").selectOption("PPO");
  await expect
    .poll(() => c.getAttribute("data-environment-id"))
    .not.toBe(original);
  await expect
    .poll(async () => Number(await c.getAttribute("data-training-samples")))
    .toBeGreaterThan(1);
  expect(await page.evaluate(() => (window as any).__workers.active)).toBe(1);
  await page.getByLabel("학습 알고리즘").selectOption("both");
  await expect(page.getByLabel("PPO 실제 학습 캔버스")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).__workers.active))
    .toBe(2);
  const beforeMap = await c.getAttribute("data-environment-id");
  await page.getByLabel("현재 맵").selectOption(EXAMPLE_MAPS[1].id);
  await expect
    .poll(() => c.getAttribute("data-environment-id"))
    .not.toBe(beforeMap);
  await page.getByRole("button", { name: "Bounce", exact: true }).click();
  await expect(page.getByLabel("현재 맵")).toHaveValue(EXAMPLE_MAPS[4].id);
  await page
    .getByRole("button", { name: "맵 라이브러리", exact: true })
    .click();
  await page
    .getByRole("button", { name: EXAMPLE_MAPS[0].name + " 열기", exact: true })
    .click();
  await expect(page.getByLabel("현재 맵")).toHaveValue("r-straight");
  await expect(c).toHaveAttribute("data-live-count", "4");
  await expect
    .poll(() => page.evaluate(() => (window as any).__workers.active))
    .toBe(2);
  expect(
    await page.evaluate(() => (window as any).__workers.terminated),
  ).toBeGreaterThanOrEqual(6);
  await page.screenshot({
    path: ".cache/ui-review/wide-learning-lab.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "학습 재개", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "학습 재개", exact: true }).click();
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
});
test("home removes draft notices and caption text; recommended previews really move", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("./");
  await page.getByLabel("학습 알고리즘").selectOption("GA");
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await page.getByRole("button", { name: "맵 편집", exact: true }).click();
  await page.getByRole("button", { name: "프로젝트", exact: true }).click();
  await expect(page.locator(".draft-session-banner")).toHaveCount(0);
  await expect(page.locator(".hero-demo-caption")).toHaveCount(0);
  await expect(page.getByText(/시도 \d ·/)).toHaveCount(0);
  const previews = page.locator('canvas[data-preview="true"]');
  await expect(previews).toHaveCount(4);
  const first = await previews.evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLElement).dataset.demoX),
  );
  await expect
    .poll(() =>
      previews.evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLElement).dataset.demoX),
      ),
    )
    .not.toEqual(first);
  await page.screenshot({
    path: ".cache/ui-review/animated-home.png",
    fullPage: true,
  });
});
