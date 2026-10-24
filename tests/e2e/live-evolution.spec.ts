import { openSettings } from "./helpers";
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { objectWorld } from "../../src/core/geometry";
import { EXAMPLE_MAPS } from "../../src/core/maps";
import { DEFAULT_CONFIG } from "../../src/core/types";
import { createPolicy } from "../../src/learning/network";
import { Random } from "../../src/core/random";

test("legacy backups preserve originals; v1 inference/evaluation stays on v1 after an explicit upgrade copy", async ({
  page,
}) => {
  const map = structuredClone(EXAMPLE_MAPS[0]);
  delete map.environmentVersion;
  map.id = "legacy-map";
  map.name = "이전 맵";
  map.checkpoints = map.checkpoints.map(({ x, y }) => ({ x, y }));
  const model = {
    id: "legacy-model",
    name: "이전 정책",
    kind: "inference",
    algorithm: "GA",
    mode: "racing",
    schemas: { environment: 1, observation: 1, action: 1 },
    policy: createPolicy(12, 5, new Random(42)),
    config: { ...DEFAULT_CONFIG, population: 4, horizon: 60 },
    mapId: map.id,
    trainingMap: map,
    createdAt: map.createdAt,
    stats: {
      algorithm: "GA",
      iteration: 1,
      steps: 10,
      episodes: 4,
      elapsed: 1,
      best: 0,
      mean: 0,
      successRate: 0,
      completionTime: null,
      collisions: 0,
      progress: 0,
      fitness: [],
      policyLoss: 0,
      valueLoss: 0,
      entropy: 0,
      kl: 0,
      tensors: 0,
      bytes: 0,
      stepsPerSecond: 10,
    },
  };
  await page.goto("./");
  await page.getByRole("button", { name: "데이터 백업 · 이전" }).click();
  await page.getByLabel("작업 공간 JSON 파일").setInputFiles({
    name: "old-workspace.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "evotrack-workspace",
        version: 1,
        schemas: { environment: 1, observation: 1, action: 1 },
        maps: [map],
        models: [model],
        experiments: [],
      }),
    ),
  });
  await page.getByRole("button", { name: "확인한 자료 가져오기" }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText(
    "가져왔습니다",
  );
  await page.getByLabel("현재 맵").selectOption(map.id);
  await page.getByRole("button", { name: "맵 편집", exact: true }).click();
  await page.getByRole("button", { name: "새 환경 v2 편집본 만들기" }).click();
  await expect(page.getByLabel("맵 이름", { exact: true })).toHaveValue(
    "이전 맵 · 게이트 편집본",
  );
  await page.getByRole("button", { name: "맵 저장", exact: true }).click();
  await page.getByRole("button", { name: "학습하기", exact: true }).click();
  await page
    .getByRole("button", { name: "맵 라이브러리", exact: false })
    .click();
  await expect(
    page.locator(".map-card").filter({
      has: page.getByRole("heading", { name: "이전 맵", exact: true }),
    }),
  ).toHaveCount(1);
  await expect(
    page.locator(".map-card").filter({ hasText: "이전 맵 · 게이트 편집본" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "모델 라이브러리", exact: false })
    .click();
  await expect(page.locator(".model-compatibility")).toContainText("환경 v1");
  await page.getByRole("button", { name: "평가", exact: true }).click();
  await expect(
    page.getByLabel("평가 환경").locator('option[value="r-straight"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "3개 시드로 평가" }).click();
  await expect(page.locator(".evaluation-result")).toContainText("평균 보상");
  await page.getByRole("button", { name: "평가 닫기" }).click();
  await page
    .getByRole("button", { name: "가중치로 새 학습", exact: true })
    .click();
  await expect(page.getByLabel("현재 맵")).toHaveValue("legacy-map");
  await expect(page.getByLabel("AI 시뮬레이션 캔버스")).toHaveAttribute(
    "data-live-count",
    "4",
  );
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
});

async function position(page: Page, x: number, y: number) {
  const canvas = page.getByLabel("맵 편집 캔버스"),
    b = (await canvas.boundingBox())!;
  const zoom = Number(await canvas.getAttribute("data-zoom")),
    px = Number(await canvas.getAttribute("data-pan-x")),
    py = Number(await canvas.getAttribute("data-pan-y"));
  const scale = Math.min(b.width / 1000, b.height / 640) * zoom;
  return {
    x: b.x + (b.width - 1000 * scale) / 2 + (x + px) * scale,
    y: b.y + (b.height - 640 * scale) / 2 + (y + py) * scale,
  };
}
async function clickWorld(page: Page, x: number, y: number) {
  const p = await position(page, x, y);
  await page.mouse.click(p.x, p.y);
}
async function dragWorld(
  page: Page,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const first = await position(page, a.x, a.y),
    last = await position(page, b.x, b.y);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.mouse.move(last.x, last.y, { steps: 10 });
  await page.mouse.up();
}
test("placement selects existing objects; real resize/rotation, clipboard and floating undo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("./");
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await page.getByRole("button", { name: "맵 편집", exact: true }).click();
  const toolbar = page.getByRole("toolbar", { name: "맵 편집 도구" });
  await expect(
    toolbar.getByRole("button", { name: "실행 취소", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "벽", exact: true }).click();
  await clickWorld(page, 750, 120);
  await clickWorld(page, 767, 170);
  await expect(page.locator(".element-count")).toContainText("장애물 1개");
  await dragWorld(page, { x: 767, y: 170 }, { x: 817, y: 190 });
  await expect(page.getByLabel("위치 X", { exact: true })).toHaveValue("800");
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(page.locator(".element-count")).toContainText("장애물 2개");
  await page.keyboard.press("Control+d");
  await expect(page.locator(".element-count")).toContainText("장애물 3개");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".element-count")).toContainText("장애물 1개");
  await clickWorld(page, 817, 190);
  await page.getByLabel("객체 회전", { exact: true }).fill("45");
  const o = {
    id: "test",
    kind: "wall" as const,
    x: 800,
    y: 140,
    w: 35,
    h: 100,
    angle: Math.PI / 4,
  };
  await dragWorld(
    page,
    objectWorld(o, { x: o.w / 2, y: o.h / 2 }),
    objectWorld(o, { x: 50, y: 80 }),
  );
  await expect
    .poll(async () =>
      Number(await page.getByLabel("가로", { exact: true }).inputValue()),
    )
    .toBeGreaterThan(50);
  await toolbar.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(page.getByLabel("가로", { exact: true })).toHaveValue("35");
  // Rotation is a gesture with 15-degree snapping and a single undo entry.
  const scale = await page.getByLabel("맵 편집 캔버스").boundingBox();
  const unit = 1 / Math.min(scale!.width / 1000, scale!.height / 640);
  const rotation = objectWorld(o, { x: 0, y: -o.h / 2 - 28 * unit });
  await page.keyboard.down("Shift");
  await dragWorld(page, rotation, { x: 880, y: 190 });
  await page.keyboard.up("Shift");
  const angle = Number(
    await page.getByLabel("객체 회전", { exact: true }).inputValue(),
  );
  expect(angle % 15).toBe(0);
  await toolbar.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(page.getByLabel("객체 회전", { exact: true })).toHaveValue("45");
  await page.getByRole("button", { name: "체크포인트", exact: true }).click();
  await clickWorld(page, 450, 320);
  await clickWorld(page, 450, 320);
  await expect(page.locator(".element-count")).toContainText("체크포인트 4개");
  await page.getByLabel("게이트 각도", { exact: true }).fill("90");
  await page.getByLabel("게이트 너비", { exact: true }).fill("160");
  await clickWorld(page, 450, 320);
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(page.locator(".element-count")).toContainText("체크포인트 5개");
  await expect(page.getByLabel("게이트 각도", { exact: true })).toHaveValue(
    "90",
  );
  await page.keyboard.press("Control+x");
  await expect(page.locator(".element-count")).toContainText("체크포인트 4개");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".element-count")).toContainText("체크포인트 5개");
  await clickWorld(page, 450, 320);
  await dragWorld(page, { x: 370, y: 320 }, { x: 350, y: 320 });
  await expect(page.getByLabel("게이트 너비", { exact: true })).toHaveValue(
    "200",
  );
  await dragWorld(page, { x: 450, y: 320 + 35 * unit }, { x: 500, y: 320 });
  await expect(page.getByLabel("게이트 각도", { exact: true })).toHaveValue(
    "0",
  );
  await page.keyboard.press("Control+z");
  await expect(page.getByLabel("게이트 각도", { exact: true })).toHaveValue(
    "90",
  );
  // Text fields keep native clipboard semantics, rather than duplicating shapes.
  await page.getByLabel("맵 이름", { exact: true }).focus();
  await page.keyboard.press("Control+d");
  await expect(page.locator(".element-count")).toContainText("체크포인트 5개");
  await page.screenshot({
    path: ".cache/ui-review/transforms-and-gates.png",
    animations: "disabled",
  });
});

test("32 and 64 live cars expose successive real Worker positions and responsive UI", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("./");
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await page.getByLabel("학습 알고리즘").selectOption("GA");
  const reports = [];
  for (const population of [32, 64]) {
    await openSettings(page);
    await page
      .getByLabel("개체군 크기", { exact: true })
      .fill(String(population));
    await openSettings(page);
    await page.getByLabel("에피소드 최대 스텝", { exact: true }).fill("180");
    await page.getByLabel("상단 학습 배속").fill("2");
    await page.evaluate(() => window.scrollTo(0, 0));
    const start = page.getByRole("button", { name: "학습 시작", exact: true });
    expect((await start.boundingBox())!.y).toBeLessThan(600);
    await start.click();
    const canvas = page.getByLabel("AI 시뮬레이션 캔버스");
    await expect(canvas).toHaveAttribute("data-live-count", String(population));
    const measured = await page.evaluate(async () => {
      const c = document.querySelector<HTMLCanvasElement>(
        '[aria-label="AI 시뮬레이션 캔버스"]',
      )!;
      const samples: { generation: number; tick: number; positions: string }[] =
        [];
      const gaps: number[] = [];
      let previous = performance.now(),
        lastSample = 0;
      const until = performance.now() + 2200;
      await new Promise<void>((resolve) => {
        const frame = (now: number) => {
          gaps.push(now - previous);
          previous = now;
          if (now - lastSample > 90) {
            samples.push({
              generation: Number(c.dataset.generation),
              tick: Number(c.dataset.liveTick),
              positions: c.dataset.livePositions!,
            });
            lastSample = now;
          }
          if (now < until) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
      gaps.sort((a, b) => a - b);
      return {
        samples,
        frames: gaps.length,
        p95FrameMs: gaps[Math.floor(gaps.length * 0.95)],
        maxFrameMs: gaps.at(-1),
      };
    });
    expect(measured.samples.length).toBeGreaterThan(10);
    expect(
      new Set(measured.samples.map((s) => s.positions)).size,
    ).toBeGreaterThan(5);
    expect(
      measured.samples.some(
        (s) =>
          s.positions.split(";").filter((p) => Number(p.split(",")[2]) > 0)
            .length === population,
      ),
    ).toBe(true);
    const active = measured.samples.filter((s) => s.tick > 0);
    for (const sample of active) {
      const live = sample.positions
        .split(";")
        .map((p) => p.split(",").map(Number))
        .filter((p) => !p[3]);
      expect(live.every((p) => p[2] === sample.tick)).toBe(true);
    }
    expect(measured.p95FrameMs).toBeLessThan(150);
    const status = await page.getByLabel("실시간 개체군 상태").innerText();
    await page.getByLabel("선택 개체", { exact: true }).selectOption("1");
    const actionStart = Date.now();
    await page.getByLabel("개체 표시").selectOption("alive");
    const uiResponseMs = Date.now() - actionStart;
    expect(uiResponseMs).toBeLessThan(1000);
    await page.getByLabel("개체 표시").selectOption("all");
    await page.screenshot({
      path: `.cache/ui-review/ga-live-${population}.png`,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "일시정지", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "학습 재개", exact: true }),
    ).toBeVisible();
    const paused = await canvas.getAttribute("data-live-positions");
    await page.waitForTimeout(180);
    await expect(canvas).toHaveAttribute("data-live-positions", paused!);
    await page.getByRole("button", { name: "학습 재개", exact: true }).click();
    await expect
      .poll(() => canvas.getAttribute("data-live-positions"))
      .not.toBe(paused);
    await page.getByRole("button", { name: "학습 중지", exact: true }).click();
    reports.push({
      population,
      ...measured,
      status,
      uiResponseMs,
      frameBytes: Number(await canvas.getAttribute("data-frame-bytes")),
      actualTicksPerSecond: Number(
        await canvas.getAttribute("data-actual-tps"),
      ),
    });
  }
  const body = JSON.stringify(reports, null, 2);
  mkdirSync(".cache", { recursive: true });
  writeFileSync(".cache/live-population-performance.json", body);
  await info.attach("live-population-performance", {
    body,
    contentType: "application/json",
  });
});

test("difficulty filters expose new physically validated maps", async ({
  page,
}) => {
  await page.goto("./#maps");
  await page.getByLabel("맵 난이도").selectOption("Hard");
  await expect(page.locator(".map-card")).toHaveCount(
    EXAMPLE_MAPS.filter((m) => m.difficulty === "Hard").length,
  );
  await expect(
    page.locator(".map-card").filter({ hasText: "연속 헤어핀" }).first(),
  ).toBeVisible();
  await page.getByLabel("맵 난이도").selectOption("Medium");
  await expect(page.locator(".map-card")).toHaveCount(4);
});
