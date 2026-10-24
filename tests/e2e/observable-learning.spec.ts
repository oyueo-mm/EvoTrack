import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { EXAMPLE_MAPS } from "../../src/core/maps";
async function worldPoint(page: Page, x: number, y: number) {
  const c = page.getByLabel("맵 편집 캔버스"),
    b = (await c.boundingBox())!,
    z = Number(await c.getAttribute("data-zoom")),
    px = Number(await c.getAttribute("data-pan-x")),
    py = Number(await c.getAttribute("data-pan-y"));
  const s = Math.min(b.width / 1000, b.height / 640) * z;
  return {
    x: b.x + (b.width - 1000 * s) / 2 + (x + px) * s,
    y: b.y + (b.height - 640 * s) / 2 + (y + py) * s,
  };
}
async function mouseDrag(
  page: Page,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 20 });
  await page.mouse.up();
}
test("road drag builds real geometry in one Undo; click appends; camera stays fixed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("./");
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await page.getByRole("button", { name: "맵 편집", exact: true }).click();
  const c = page.getByLabel("맵 편집 캔버스"),
    before = await page.locator(".element-count").innerText();
  await page.getByRole("button", { name: "도로 그리기", exact: true }).click();
  await mouseDrag(
    page,
    await worldPoint(page, 200, 150),
    await worldPoint(page, 750, 190),
  );
  const after = await page.locator(".element-count").innerText();
  expect(after).not.toBe(before);
  expect(Number(after.match(/도로 (\d+)/)![1])).toBeGreaterThan(10);
  await expect(c).toHaveAttribute("data-zoom", "1.000");
  await expect(c).toHaveAttribute("data-pan-x", "0.00");
  await expect(c).toHaveAttribute("data-pan-y", "0.00");
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(page.locator(".element-count")).toHaveText(before);
  await page.getByRole("button", { name: "다시 실행", exact: true }).click();
  await expect(page.locator(".element-count")).toHaveText(after);
  const p = await worldPoint(page, 800, 220);
  await page.mouse.click(p.x, p.y);
  expect(
    Number(
      (await page.locator(".element-count").innerText()).match(
        /도로 (\d+)/,
      )![1],
    ),
  ).toBe(Number(after.match(/도로 (\d+)/)![1]) + 1);
  await page.screenshot({ path: ".cache/ui-review/road-drag.png" });
});
test("v1 rotation explains upgrade; real handle magnet snaps at 87 and rotates freely at 110; save restores", async ({
  page,
}) => {
  const map = {
    ...structuredClone(EXAMPLE_MAPS[0]),
    id: "rotation-legacy",
    name: "회전 원본",
    environmentVersion: 1,
    checkpoints: [],
    objects: [
      { id: "wall-rotate", kind: "wall", x: 400, y: 150, w: 80, h: 60 },
    ],
  };
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("./#maps");
  await page.locator('input[type="file"]').setInputFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(map)),
  });
  await expect(page.locator(".toast")).toContainText("가져왔습니다");
  await page.getByRole("button", { name: "맵 에디터", exact: true }).click();
  await expect(
    page.getByText("이 맵은 기존 물리 규칙을 사용합니다.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "확장 환경 v3 편집본 만들기" })
    .click();
  await page.getByRole("tab", { name: "레이어", exact: true }).click();
  await page.getByRole("button", { name: /레이어 선택 벽/ }).click();
  await page.getByRole("tab", { name: "속성", exact: true }).click();
  const c = page.getByLabel("맵 편집 캔버스"),
    b = (await c.boundingBox())!,
    scale = Math.min(b.width / 1000, b.height / 640);
  const center = await worldPoint(page, 440, 180),
    radius = 30 * scale + 28;
  const target = (degrees: number) => ({
    x: center.x + Math.cos(((degrees - 90) * Math.PI) / 180) * radius,
    y: center.y + Math.sin(((degrees - 90) * Math.PI) / 180) * radius,
  });
  await mouseDrag(page, target(0), target(87));
  await expect(page.getByLabel("객체 회전", { exact: true })).toHaveValue("90");
  await expect(c).toHaveAttribute("data-angle-snap", "90");
  await mouseDrag(page, target(90), target(110));
  await expect
    .poll(async () =>
      Number(await page.getByLabel("객체 회전", { exact: true }).inputValue()),
    )
    .toBeCloseTo(110, 0);
  await page.getByRole("button", { name: "맵 저장", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("저장했습니다");
  await page.goto("./#maps");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "회전 원본", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "회전 원본 · 확장 편집본 편집", exact: true })
    .click();
  await page.getByRole("tab", { name: "레이어", exact: true }).click();
  await page.getByRole("button", { name: /레이어 선택 벽/ }).click();
  await page.getByRole("tab", { name: "속성", exact: true }).click();
  await expect
    .poll(async () =>
      Number(await page.getByLabel("객체 회전", { exact: true }).inputValue()),
    )
    .toBeCloseTo(110, 0);
  await page.screenshot({ path: ".cache/ui-review/magnetic-rotation.png" });
});
test("PPO shows the exact recorded transition, freezes during optimization and pause, then updates policy", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("./?debug=1");
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await page.getByLabel("학습 알고리즘").selectOption("PPO");
  await page.getByText("고급 설정", { exact: true }).click();
  await page.getByLabel("Rollout 길이", { exact: true }).fill("64");
  await page.getByLabel("Epochs", { exact: true }).fill("4");
  await page.getByLabel("Minibatch", { exact: true }).fill("16");
  await page.getByLabel("상단 학습 배속").fill("2");
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  const c = page.getByLabel("AI 시뮬레이션 캔버스");
  await expect
    .poll(async () => Number(await c.getAttribute("data-training-samples")))
    .toBeGreaterThan(4);
  const initial = await c.getAttribute("data-policy-checksum");
  const metrics = await page.evaluate(async () => {
    const c = document.querySelector<HTMLCanvasElement>(
      '[aria-label="AI 시뮬레이션 캔버스"]',
    )!;
    const samples: any[] = [],
      gaps: number[] = [];
    let last = performance.now();
    const until = last + 2200;
    await new Promise<void>((resolve) => {
      const frame = (now: number) => {
        gaps.push(now - last);
        last = now;
        if (c.dataset.transition)
          samples.push({
            phase: c.dataset.trainingPhase,
            state: JSON.parse(c.dataset.trainingState!),
            transition: JSON.parse(c.dataset.transition!),
            environment: c.dataset.environmentId,
            updates: Number(c.dataset.updates),
            frameBytes: Number(c.dataset.frameBytes),
            sequence: Number(c.dataset.frameSequence),
            actualTicksPerSecond: Number(c.dataset.actualTps),
          });
        if (now < until) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    gaps.sort((a, b) => a - b);
    return {
      samples,
      p95FrameMs: gaps[Math.floor(gaps.length * 0.95)],
      frames: gaps.length,
    };
  });
  expect(metrics.samples.length).toBeGreaterThan(10);
  for (const sample of metrics.samples) {
    expect(sample.state).toEqual(sample.transition.state);
    expect(sample.environment).toBe(sample.transition.environmentId);
  }
  const optimizing = metrics.samples.filter((s) => s.phase === "OPTIMIZING");
  expect(optimizing.length).toBeGreaterThan(0);
  for (let i = 1; i < optimizing.length; i++)
    if (optimizing[i].updates === optimizing[i - 1].updates)
      expect(optimizing[i].transition.sample).toBe(
        optimizing[i - 1].transition.sample,
      );
  await expect
    .poll(() => c.getAttribute("data-policy-checksum"))
    .not.toBe(initial);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "학습 재개", exact: true }),
  ).toBeVisible();
  const paused = await c.getAttribute("data-training-state"),
    count = await c.getAttribute("data-training-samples"),
    updates = await c.getAttribute("data-updates");
  await page.waitForTimeout(250);
  await expect(c).toHaveAttribute("data-training-state", paused!);
  await expect(c).toHaveAttribute("data-training-samples", count!);
  await expect(c).toHaveAttribute("data-updates", updates!);
  await page.getByRole("button", { name: "학습 재개", exact: true }).click();
  await expect
    .poll(() => c.getAttribute("data-training-samples"))
    .not.toBe(count);
  await page.evaluate(() => {
    window.addEventListener(
      "pointerdown",
      (e) => {
        (window as any).__inputDelay = performance.now() - e.timeStamp;
      },
      { once: true, capture: true },
    );
  });
  await page.getByLabel("학습 진행 모드").click();
  await page.keyboard.press("Escape");
  const inputEventDelayMs = await page.evaluate(
    () => (window as any).__inputDelay as number,
  );
  expect(inputEventDelayMs).toBeLessThan(200);
  const inputStart = Date.now();
  await page.getByLabel("학습 진행 모드").selectOption("fast");
  const inputMs = Date.now() - inputStart;
  expect(inputMs).toBeLessThan(1000);
  await page.screenshot({ path: ".cache/ui-review/ppo-real-rollout.png" });
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
  mkdirSync(".cache", { recursive: true });
  writeFileSync(
    ".cache/ppo-observation-performance.json",
    JSON.stringify({ ...metrics, inputMs, inputEventDelayMs }, null, 2),
  );
  await info.attach("ppo-observation-performance", {
    body: JSON.stringify({ ...metrics, inputMs, inputEventDelayMs }),
    contentType: "application/json",
  });
});
test("both algorithms use separate real canvases; navigation and hidden tabs pause observation", async ({
  page,
  context,
}) => {
  await page.goto("./?debug=1");
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await page.getByLabel("개체군 크기", { exact: true }).fill("4");
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  const ga = page.getByLabel("AI 시뮬레이션 캔버스"),
    ppo = page.getByLabel("PPO 실제 학습 캔버스");
  await expect(ga).toHaveAttribute("data-live-count", "4");
  await page.getByLabel("선택 개체", { exact: true }).selectOption("1");
  await expect
    .poll(
      async () =>
        JSON.parse((await ga.getAttribute("data-live-traces")) ?? "[]")[1] ?? 0,
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        JSON.parse((await ga.getAttribute("data-live-traces")) ?? "[]").filter(
          (n: number, i: number) => i !== 1 && n > 0,
        ).length,
    )
    .toBe(0);
  await expect
    .poll(async () => Number(await ppo.getAttribute("data-training-samples")))
    .toBeGreaterThan(3);
  await page.getByRole("button", { name: "패널 접기", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".cache/ui-review/ga-ppo-live-split.png",
    fullPage: true,
  });
  const other = await context.newPage();
  await other.bringToFront();
  const realTabHidden = await page.evaluate(() => document.hidden);
  if (!realTabHidden)
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  await expect(
    page.getByRole("button", { name: "학습 재개", exact: true }),
  ).toBeVisible();
  const frozen = await ppo.getAttribute("data-training-samples");
  await page.waitForTimeout(200);
  await expect(ppo).toHaveAttribute("data-training-samples", frozen!);
  await other.close();
  await page.bringToFront();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.getByRole("button", { name: "학습 재개", exact: true }).click();
  await page.getByRole("button", { name: "맵 편집", exact: true }).click();
  await expect(page.getByLabel("맵 이름", { exact: true })).toHaveValue(
    /편집본/,
  );
  await page.getByRole("button", { name: "학습하기", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "학습 재개", exact: true }),
  ).toBeVisible();
});

test("Worker observation requires frame credits and freezes after pause ACK", async ({
  page,
}) => {
  test.skip(
    !!process.env.EVOTRACK_BASE_URL,
    "Source protocol test; public UI verifies the bundled Worker.",
  );
  await page.goto("./");
  const result = await page.evaluate(
    async ({ map, config }) => {
      const worker = new Worker(
        new URL("src/workers/trainer.worker.ts", location.href),
        { type: "module" },
      );
      const replies: any[] = [];
      worker.onmessage = (e) => replies.push(e.data);
      const wait = async (predicate: (x: any) => boolean) => {
        const end = Date.now() + 15000;
        while (Date.now() < end) {
          const r = replies.find(predicate);
          if (r) return r;
          await new Promise((r) => setTimeout(r, 10));
        }
        throw Error("credit protocol timeout");
      };
      const send = (type: string, id: number, extra: any = {}) =>
        worker.postMessage({
          type,
          session: "credit-session",
          requestId: id,
          algorithm: "PPO",
          ...extra,
        });
      try {
        send("START", 1, { map, config });
        await wait((r) => r.type === "ACK" && r.requestId === 1);
        const first = await wait((r) => r.type === "SNAPSHOT");
        await new Promise((r) => setTimeout(r, 200));
        send("REQUEST_SNAPSHOT", 2);
        const still = await wait((r) => r.requestId === 2);
        send("FRAME_ACK", 0, { sequence: first.snapshot.sequence });
        const moved = await wait(
          (r) =>
            r.type === "SNAPSHOT" &&
            r.requestId === 0 &&
            r.snapshot.sequence > first.snapshot.sequence,
        );
        send("PAUSE", 3);
        await wait((r) => r.type === "ACK" && r.requestId === 3);
        send("REQUEST_SNAPSHOT", 4);
        const paused = await wait((r) => r.requestId === 4);
        await new Promise((r) => setTimeout(r, 120));
        send("REQUEST_SNAPSHOT", 5);
        const frozen = await wait((r) => r.requestId === 5);
        return {
          first: first.snapshot.runtime.sample,
          still: still.snapshot.runtime.sample,
          moved: moved.snapshot.runtime.sample,
          paused: paused.snapshot,
          frozen: frozen.snapshot,
        };
      } finally {
        worker.terminate();
      }
    },
    {
      map: EXAMPLE_MAPS[0],
      config: {
        seed: 42,
        population: 4,
        elite: 0.125,
        crossover: 0.8,
        mutation: 0.12,
        sigma: 0.2,
        horizon: 60,
        rollout: 16,
        epochs: 1,
        minibatch: 8,
        learningRate: 0.001,
        gamma: 0.99,
        lambda: 0.95,
        clip: 0.2,
        entropy: 0.01,
        speed: 2,
      },
    },
  );
  expect(result.first).toBe(0);
  expect(result.still).toBe(0);
  expect(result.moved).toBeGreaterThan(0);
  expect(result.moved).toBeLessThanOrEqual(4);
  expect(result.paused).toEqual(result.frozen);
});
