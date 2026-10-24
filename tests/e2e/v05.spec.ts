import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { V05_MAPS } from "../../src/core/v05-maps";
import { EXAMPLE_MAPS } from "../../src/core/maps";
import { DEFAULT_CONFIG } from "../../src/core/types";
import { openSettings, chooseTool } from "./helpers";
test("isolated Worker compares actual CPU/WebGL PPO updates and reports unsupported WebGPU", async ({
  page,
}) => {
  test.skip(
    !!process.env.EVOTRACK_BASE_URL,
    "Source-only isolated Worker benchmark; deployed UI exercises CPU fallback separately.",
  );
  await page.goto("./");
  const results = await page.evaluate(
    async ({ map, config }) => {
      const worker = new Worker(
        new URL("./src/workers/trainer.worker.ts", document.baseURI),
        { type: "module" },
      );
      try {
        return await new Promise<Record<string, any>>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(Error("backend benchmark timeout")),
            75000,
          );
          worker.onmessage = (e) => {
            if (e.data.type === "BACKENDS") {
              clearTimeout(timer);
              resolve(e.data.backends);
            } else if (e.data.type === "ERROR") {
              clearTimeout(timer);
              reject(Error(e.data.error));
            }
          };
          worker.onerror = (e) => reject(Error(e.message));
          worker.postMessage({
            type: "BENCHMARK_BACKENDS",
            session: "isolated-benchmark",
            requestId: 1,
            algorithm: "PPO",
            map,
            config,
          });
        });
      } finally {
        worker.terminate();
      }
    },
    { map: EXAMPLE_MAPS[0], config: DEFAULT_CONFIG },
  );
  expect(results.cpu.policyFinite).toBe(true);
  expect(results.cpu.transitionsPerSecond).toBeGreaterThan(0);
  expect(results.webgpu.supported).toBe(false);
  mkdirSync(".cache", { recursive: true });
  writeFileSync(
    ".cache/v05-backend-benchmark.json",
    JSON.stringify(results, null, 2),
  );
});
async function training(
  page: Page,
  method: "GA" | "PPO" | "both",
  map = "r-straight",
) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("./?debug=1");
  if (map.startsWith("b-"))
    await page.getByRole("button", { name: "Bounce", exact: true }).click();
  await page.getByLabel("현재 맵").selectOption(map);
  await page.getByLabel("학습 알고리즘").selectOption(method);
  await openSettings(page);
  if (method !== "PPO")
    await page.getByLabel("개체군 크기", { exact: true }).fill("4");
  await page.getByLabel("에피소드 최대 스텝", { exact: true }).fill("120");
  if (method !== "GA") {
    await page.getByText("고급 설정", { exact: true }).click();
    await page.getByLabel("Rollout 길이", { exact: true }).fill("32");
    await page.getByLabel("Epochs", { exact: true }).fill("1");
    await page.getByLabel("Minibatch", { exact: true }).fill("16");
  }
  await page.getByRole("button", { name: "패널 닫기", exact: true }).click();
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
}
test("PPO accepts actual touch pinch in solo and split views", async ({
  browser,
  baseURL,
}) => {
  for (const method of ["PPO", "both"] as const) {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      baseURL,
    });
    const page = await context.newPage();
    try {
      await training(page, method);
      await page.setViewportSize({ width: 390, height: 844 });
      const c = page.getByLabel(
        method === "both" ? "PPO 실제 학습 캔버스" : "AI 시뮬레이션 캔버스",
      );
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveAttribute("data-training-environments", "1");
      const r = (await c.boundingBox())!,
        cdp = await context.newCDPSession(page);
      const y = Math.round(r.y + r.height * 0.5);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: Math.round(r.x + r.width * 0.35), y, id: 0 },
          { x: Math.round(r.x + r.width * 0.65), y, id: 1 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: Math.round(r.x + r.width * 0.2), y, id: 0 },
          { x: Math.round(r.x + r.width * 0.8), y, id: 1 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect
        .poll(async () => Number(await c.getAttribute("data-zoom")))
        .toBeGreaterThan(1.5);
    } finally {
      await context.close();
    }
  }
});
test("GA and PPO keep independent cameras through real wheel, pan, button, follow and algorithm switches", async ({
  page,
}) => {
  await training(page, "both");
  const ga = page.getByLabel("AI 시뮬레이션 캔버스"),
    ppo = page.getByLabel("PPO 실제 학습 캔버스");
  await expect(ga).toHaveAttribute("data-live-count", "4");
  await expect(ppo).toHaveAttribute("data-training-environments", "1");
  await ga.hover();
  await page.mouse.wheel(0, -300);
  await expect
    .poll(async () => Number(await ga.getAttribute("data-zoom")))
    .toBeGreaterThan(1);
  const gaz = await ga.getAttribute("data-zoom");
  await expect(ppo).toHaveAttribute("data-zoom", "1.000");
  await ppo.hover();
  await page.mouse.wheel(0, -300);
  await expect
    .poll(async () => Number(await ppo.getAttribute("data-zoom")))
    .toBeGreaterThan(1);
  await expect(ga).toHaveAttribute("data-zoom", gaz!);
  const before = await ppo.getAttribute("data-zoom");
  await page.getByRole("button", { name: "확대", exact: true }).click();
  await expect.poll(() => ppo.getAttribute("data-zoom")).not.toBe(before);
  const zoomed = await ppo.getAttribute("data-zoom");
  await page
    .getByRole("button", { name: "에이전트 추적", exact: true })
    .click();
  await page.getByRole("button", { name: "확대", exact: true }).click();
  await expect
    .poll(async () => Number(await ppo.getAttribute("data-zoom")))
    .toBeGreaterThan(Number(zoomed));
  await page.getByRole("button", { name: "화면 맞춤", exact: true }).click();
  await expect(ppo).toHaveAttribute("data-zoom", "1.000");
  await expect(ga).toHaveAttribute("data-zoom", gaz!);
  const box = (await ppo.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.55);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.65, {
    steps: 8,
  });
  await page.mouse.up({ button: "right" });
  await expect(ppo).not.toHaveAttribute("data-pan-x", "0.00");
  await page.getByRole("button", { name: "PPO", exact: true }).click();
  await page.getByRole("button", { name: "축소", exact: true }).click();
  const saved = await ppo.getAttribute("data-zoom");
  await page.getByRole("button", { name: "GA", exact: true }).click();
  await page.getByRole("button", { name: "PPO", exact: true }).click();
  await expect(ppo).toHaveAttribute("data-zoom", saved!);
  await page.screenshot({ path: ".cache/ui-review/v05-split-cameras.png" });
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
  await page.getByLabel("학습 알고리즘").selectOption("PPO");
  const solo = page.getByLabel("AI 시뮬레이션 캔버스");
  await expect(solo).toHaveAttribute("data-zoom", saved!);
  await solo.hover();
  await page.mouse.wheel(0, -200);
  await expect
    .poll(async () => Number(await solo.getAttribute("data-zoom")))
    .toBeGreaterThan(Number(saved));
  await page.getByRole("button", { name: "화면 맞춤", exact: true }).click();
  await expect(solo).toHaveAttribute("data-zoom", "1.000");
});
test("v5 editor persists movement direction, collapse settings and complete backup without changing original maps", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const map = {
    ...structuredClone(V05_MAPS.find((m) => m.id === "b-v5-elevator")!),
    id: "v05-editor-fixture",
    name: "V05 Inspector",
  };
  await page.goto("./#maps");
  await page.locator("input[type=file]").setInputFiles({
    name: "map.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(map)),
  });
  await expect(page.locator(".toast")).toContainText("가져왔습니다");
  await page.getByRole("button", { name: "맵 에디터", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "맵 편집 작업 공간" }),
  ).toHaveAttribute("data-environment-version", "5");
  await chooseTool(page, "일회용 발판");
  const c = page.getByLabel("맵 편집 캔버스"),
    r = (await c.boundingBox())!;
  await c.click({ position: { x: r.width * 0.6, y: r.height * 0.4 } });
  await page.getByLabel("붕괴 지연", { exact: true }).fill(".65");
  await page.getByLabel("에피소드 중 발판 복원", { exact: true }).check();
  await page.getByLabel("복원 대기 시간", { exact: true }).fill("1.5");
  await page.screenshot({ path: ".cache/ui-review/v05-editor.png" });
  await expect(
    page
      .getByText(
        "한 번 밟으면 일정 시간 뒤 무너지는 발판입니다. 다음 시도에서 복원됩니다.",
      )
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "맵 저장", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("저장했습니다");
  await page
    .getByRole("button", { name: "맵 라이브러리", exact: true })
    .click();
  const dl = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "V05 Inspector 내보내기", exact: true })
    .click();
  const chunks: Buffer[] = [];
  for await (const chunk of (await (await dl).createReadStream())!)
    chunks.push(Buffer.from(chunk));
  const saved = JSON.parse(Buffer.concat(chunks).toString());
  expect(saved.objects.find((o: any) => o.kind === "crumble")).toMatchObject({
    collapseDelay: 0.65,
    regenerate: true,
    restoreDelay: 1.5,
  });
  expect(saved.objects.find((o: any) => o.id === "lift").moveAxis).toBe(
    "vertical",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "V05 Inspector", exact: true }),
  ).toBeVisible();
});
test("home cycles real recordings and labelled physical demonstrations; reduced motion and offscreen states stop work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("./#home");
  const hero = page.getByLabel("실제 물리 기반 주행 데모");
  await expect(hero).toHaveAttribute("data-demo-source", "recorded-ga");
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    seen.add((await hero.getAttribute("data-demo-map"))!);
    await page.getByRole("button", { name: "다음 환경", exact: true }).click();
    await expect
      .poll(() => hero.getAttribute("data-demo-map"))
      .not.toBe([...seen].at(-1));
  }
  expect(seen.size).toBe(6);
  await expect(hero).toHaveAttribute("data-demo-source", "scripted-physics");
  await expect(hero).toHaveAttribute(
    "aria-description",
    /실시간 학습하지 않습니다/,
  );
  await page.screenshot({ path: ".cache/ui-review/v05-home.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.getByRole("button", { name: "데모 재생", exact: true }),
  ).toBeVisible();
  const step = await hero.getAttribute("data-demo-steps");
  await page.waitForTimeout(250);
  await expect(hero).toHaveAttribute("data-demo-steps", step!);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "데모 재생", exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const paused = await hero.getAttribute("data-demo-steps");
  await page.waitForTimeout(250);
  await expect(hero).toHaveAttribute("data-demo-steps", paused!);
});
test("library exposes recommended, variant, skill and mode filters without removing IDs", async ({
  page,
}) => {
  await page.goto("./#maps");
  await page.getByLabel("맵 모음", { exact: true }).selectOption("recommended");
  await expect(page.locator(".map-card")).toHaveCount(16);
  await page.getByLabel("맵 모드", { exact: true }).selectOption("bounce");
  await expect(page.locator(".map-card")).toHaveCount(8);
  await page
    .getByLabel("학습 목표", { exact: true })
    .selectOption("일회용 발판");
  await expect(page.locator(".map-card")).toHaveCount(2);
  await page.getByLabel("맵 모드", { exact: true }).selectOption("all");
  await page.getByLabel("학습 목표", { exact: true }).selectOption("all");
  await page.getByLabel("맵 모음", { exact: true }).selectOption("variants");
  await expect(page.locator(".map-card")).toHaveCount(7);
  await page.getByLabel("맵 모음", { exact: true }).selectOption("all");
  await expect(
    page.getByRole("button", { name: "10 / 한 번의 게이트 편집", exact: true }),
  ).toBeVisible();
});
test("single PPO supports curriculum, real diagnostics, backend fallback and frozen best-policy inspection", async ({
  page,
}) => {
  await training(page, "PPO", "b-v5-mixed");
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
  await openSettings(page);
  await page.getByLabel("PPO 커리큘럼 (v5 Bounce)", { exact: true }).check();
  await page.getByRole("button", { name: "패널 닫기", exact: true }).click();
  await page.getByLabel("학습 진행 모드").selectOption("fast");
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  const c = page.getByLabel("AI 시뮬레이션 캔버스");
  await expect(c).toHaveAttribute("data-training-environments", "1");
  await expect(c).toHaveAttribute("data-policy-input", "18");
  await expect(c).toHaveAttribute("data-backend", "cpu");
  await expect(page.getByLabel("커리큘럼 진행")).toContainText("첫 걸음");
  await expect
    .poll(async () => Number(await c.getAttribute("data-updates")))
    .toBeGreaterThan(2);
  await page
    .getByRole("button", { name: "최고 모델 확인", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "최고 모델 확인", exact: true }),
  ).toBeVisible();
  const sample = await c.getAttribute("data-training-samples");
  await page.waitForTimeout(200);
  await expect(c).toHaveAttribute("data-training-samples", sample!);
  await expect(
    page.getByRole("dialog", { name: "최고 모델 확인", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "학습으로 돌아가기", exact: true })
    .click();
  await page.getByText("PPO 진단", { exact: true }).click();
  await expect(page.locator(".ppo-diagnostics pre")).toContainText(
    "gradientNorm",
  );
  mkdirSync(".cache", { recursive: true });
  writeFileSync(
    ".cache/v05-worker-backends.json",
    (await c.getAttribute("data-backend-support")) ?? "{}",
  );
  await page.screenshot({ path: ".cache/ui-review/v05-ppo-diagnostics.png" });
});
