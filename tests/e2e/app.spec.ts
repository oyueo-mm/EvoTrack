import { test, expect } from "@playwright/test";
import { EXAMPLE_MAPS } from "../../src/core/maps";
import { DEFAULT_CONFIG } from "../../src/core/types";
import type { Command, WorkerReply } from "../../src/core/types";

test.beforeEach(async ({ page }, info) => {
  const failures: string[] = [];
  const resources: { url: string; status: number; type: string }[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.includes("/EvoTrack/assets/")) {
      resources.push({
        url: response.url(),
        status: response.status(),
        type: response.headers()["content-type"] ?? "",
      });
      if (response.status() >= 400)
        failures.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname.includes("/EvoTrack/assets/"))
      failures.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  page.on("pageerror", (error) => failures.push(error.message));
  info.annotations.push({
    type: "target",
    description: process.env.EVOTRACK_BASE_URL ?? "local /EvoTrack/",
  });
  // The after hook runs before the page fixture closes.
  (
    page as typeof page & {
      qa: { failures: string[]; resources: typeof resources };
    }
  ).qa = { failures, resources };
});
test.afterEach(async ({ page }, info) => {
  const qa = (
    page as typeof page & { qa?: { failures: string[]; resources: unknown[] } }
  ).qa;
  if (qa) {
    await info.attach("assets-and-browser-errors", {
      body: JSON.stringify(qa, null, 2),
      contentType: "application/json",
    });
    expect(qa.failures).toEqual([]);
  }
});
test("editor, GA/PPO workers, pause/resume, storage, checkpoint and evaluation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "학습 실험실" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "맵 편집", exact: true }).click();
  await page.getByLabel("맵 이름", { exact: true }).fill("E2E circuit");
  await page.getByRole("button", { name: "벽", exact: true }).click();
  const canvas = page.getByLabel("맵 편집 캔버스");
  const box = await canvas.boundingBox();
  await canvas.click({
    position: { x: box!.width * 0.75, y: box!.height * 0.15 },
  });
  await page.getByRole("button", { name: "맵 저장", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("저장했습니다");
  await page.reload();
  await page.getByRole("button", { name: "학습하기", exact: true }).click();
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await page.getByLabel("개체군 크기", { exact: true }).fill("8");
  await page.getByLabel("에피소드 최대 스텝", { exact: true }).fill("300");
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect
    .poll(() => page.locator(".metric-card").first().innerText(), {
      timeout: 60000,
    })
    .not.toContain("—");
  await page.getByRole("button", { name: "PPO", exact: true }).click();
  await expect
    .poll(() => page.locator(".metric-card").first().innerText(), {
      timeout: 60000,
    })
    .not.toContain("—");
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "학습 재개", exact: true }),
  ).toBeVisible();
  const steps = await page.locator(".metric-card").nth(1).innerText();
  await page.waitForTimeout(1000);
  expect(await page.locator(".metric-card").nth(1).innerText()).toBe(steps);
  await page.getByRole("button", { name: "모델 저장", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("추론 모델");
  await page.getByRole("button", { name: "체크포인트", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("체크포인트");
  await page.getByRole("button", { name: "학습 재개", exact: true }).click();
  await expect
    .poll(() => page.locator(".metric-card").nth(1).innerText())
    .not.toBe(steps);
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
  await page
    .getByRole("button", { name: "모델 라이브러리", exact: false })
    .click();
  await expect(page.locator(".model-card")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".model-card")).toHaveCount(2);
  await page
    .locator(".model-card")
    .first()
    .getByRole("button", { name: "평가", exact: true })
    .click();
  await page
    .getByRole("button", { name: "3개 시드로 평가", exact: true })
    .click();
  await expect(page.locator(".evaluation-result")).toContainText("평균 보상");
  await page.getByRole("button", { name: "평가 닫기" }).click();
  await page
    .locator(".model-card")
    .filter({ hasText: "CHECKPOINT" })
    .getByRole("button", { name: "재개", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "학습 실험실" }),
  ).toBeVisible();
  await expect
    .poll(() => page.locator(".metric-card").first().innerText())
    .not.toContain("—");
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
  await page.screenshot({
    path: `.cache/${process.env.EVOTRACK_BASE_URL ? "deployment-qa" : "local-qa"}/desktop.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("GA only and PPO only execute and reject broken imports", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await page.getByLabel("개체군 크기", { exact: true }).fill("4");
  await page.getByLabel("에피소드 최대 스텝", { exact: true }).fill("60");
  for (const name of ["Genetic Algorithm", "Proximal Policy Opt."]) {
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: "학습 시작", exact: true }).click();
    await expect
      .poll(() => page.locator(".metric-card").first().innerText())
      .not.toContain("—");
    await page.getByRole("button", { name: "학습 중지", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "학습 시작", exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "맵 라이브러리", exact: false })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":9}'),
  });
  await expect(page.getByRole("alert")).toContainText("지원하지 않는");
});
test("mobile layout, Bounce editing and training remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: /Bounce/ }).click();
  await page.getByRole("button", { name: "맵 편집", exact: true }).click();
  await page.getByRole("button", { name: "가시", exact: true }).click();
  await page
    .getByLabel("맵 편집 캔버스")
    .click({ position: { x: 180, y: 120 } });
  await page.getByRole("button", { name: "맵 저장", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("저장했습니다");
  await page.getByRole("button", { name: "학습하기", exact: true }).click();
  await page.getByLabel("개체군 크기", { exact: true }).fill("4");
  await page.getByLabel("에피소드 최대 스텝", { exact: true }).fill("60");
  await page
    .getByRole("button", { name: "Genetic Algorithm", exact: false })
    .click();
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect
    .poll(() => page.locator(".metric-card").first().innerText())
    .not.toContain("—");
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `.cache/${process.env.EVOTRACK_BASE_URL ? "deployment-qa" : "local-qa"}/mobile.png`,
    fullPage: true,
  });
});

test("Worker protocol isolates sessions, updates speed, resets and rejects empty snapshots", async ({
  page,
}) => {
  test.skip(
    !!process.env.EVOTRACK_BASE_URL,
    "Direct source-module protocol checks run in development; deployed Worker behavior is exercised through the UI.",
  );
  await page.goto("./");
  const result = await page.evaluate(
    async ({ map, config }) => {
      const worker = new Worker(
        new URL("src/workers/trainer.worker.ts", location.href),
        {
          type: "module",
        },
      );
      const replies: WorkerReply[] = [];
      worker.onmessage = (e) => replies.push(e.data);
      const wait = async (predicate: (r: WorkerReply) => boolean) => {
        const until = Date.now() + 15000;
        while (Date.now() < until) {
          const reply = replies.find(predicate);
          if (reply) return reply;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw Error("Worker protocol timed out");
      };
      const send = (
        type: Command["type"],
        requestId: number,
        session = "session-a",
        extra: Partial<Command> = {},
      ) =>
        worker.postMessage({
          type,
          requestId,
          session,
          algorithm: "GA",
          ...extra,
        });
      const ack = (id: number) =>
        wait((r) => r.type === "ACK" && r.requestId === id);
      try {
        send("START", 1, "session-a", { map, config });
        await ack(1);
        await wait((r) => r.type === "SNAPSHOT");
        send("PAUSE", 2);
        await ack(2);
        send("REQUEST_SNAPSHOT", 3);
        const paused = await wait(
          (r) => r.type === "SNAPSHOT" && r.requestId === 3,
        );
        send("UPDATE_CONFIG", 4, "session-a", {
          config: { ...config, speed: 5 },
        });
        const updated = await ack(4);
        await new Promise((resolve) => setTimeout(resolve, 220));
        send("REQUEST_SNAPSHOT", 5);
        const still = await wait(
          (r) => r.type === "SNAPSHOT" && r.requestId === 5,
        );
        send("RESET", 6);
        const reset = await ack(6);
        send("REQUEST_SNAPSHOT", 7);
        const empty = await wait(
          (r) => r.type === "ERROR" && r.requestId === 7,
        );
        send("START", 8, "session-b", { map, config });
        await ack(8);
        send("PAUSE", 9, "session-a");
        await wait((r) => r.type === "SNAPSHOT" && r.session === "session-b");
        send("STOP", 10, "session-b");
        const stopped = await ack(10);
        return {
          paused: paused.snapshot!.stats.steps,
          still: still.snapshot!.stats.steps,
          updated: updated.status,
          reset: reset.status,
          empty: empty.error,
          staleApplied: replies.some((r) => r.requestId === 9),
          stopped: stopped.status,
        };
      } finally {
        worker.terminate();
      }
    },
    {
      map: EXAMPLE_MAPS[0],
      config: { ...DEFAULT_CONFIG, population: 4, horizon: 30 },
    },
  );
  expect(result.still).toBe(result.paused);
  expect(result.updated).toBe("paused");
  expect(result.reset).toBe("stopped");
  expect(result.empty).toContain("스냅샷");
  expect(result.staleApplied).toBe(false);
  expect(result.stopped).toBe("stopped");
});

test("saved map, GA checkpoint and exported model survive reload and restore", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await page.getByRole("button", { name: "맵 편집", exact: true }).click();
  await page
    .getByLabel("맵 이름", { exact: true })
    .fill("Release verification circuit");
  await page.getByRole("button", { name: "맵 저장", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("저장했습니다");
  await page.reload();
  await page.getByRole("button", { name: "학습하기", exact: true }).click();
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await expect(page.getByLabel("현재 맵").locator("option:checked")).toHaveText(
    "Release verification circuit",
  );
  await page
    .getByRole("button", { name: "Genetic Algorithm", exact: false })
    .click();
  await page.getByLabel("개체군 크기", { exact: true }).fill("4");
  await page.getByLabel("에피소드 최대 스텝", { exact: true }).fill("60");
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect
    .poll(() => page.locator(".metric-card").first().innerText())
    .not.toContain("—");
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "학습 재개", exact: true }),
  ).toBeVisible();
  const savedSteps = Number(
    (
      await page.locator(".metric-card").nth(1).locator("strong").innerText()
    ).replaceAll(",", ""),
  );
  await page.getByRole("button", { name: "모델 저장", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("추론 모델");
  await page.getByRole("button", { name: "체크포인트", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("체크포인트");
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
  await page
    .getByRole("button", { name: "모델 라이브러리", exact: false })
    .click();
  await expect(page.locator(".model-card")).toHaveCount(2);
  const inference = page
    .locator(".model-card")
    .filter({ hasText: "INFERENCE POLICY" });
  const downloaded = page.waitForEvent("download");
  await inference
    .getByRole("button", { name: "모델 내보내기", exact: true })
    .click();
  const file = await downloaded;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "roundtrip-model.json",
      mimeType: "application/json",
      buffer: Buffer.concat(chunks),
    });
  await expect(page.getByRole("status")).toContainText("모델을 가져왔습니다");
  await page.reload();
  await expect(page.locator(".model-card")).toHaveCount(2);
  await page
    .locator(".model-card")
    .filter({ hasText: "INFERENCE POLICY" })
    .getByRole("button", { name: "가중치로 새 학습", exact: true })
    .click();
  await expect
    .poll(() => page.locator(".metric-card").first().innerText())
    .not.toContain("—");
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
  await page
    .getByRole("button", { name: "모델 라이브러리", exact: false })
    .click();
  await page
    .locator(".model-card")
    .filter({ hasText: "CHECKPOINT" })
    .getByRole("button", { name: "재개", exact: true })
    .click();
  await expect(page.getByLabel("현재 맵").locator("option:checked")).toHaveText(
    "Release verification circuit",
  );
  await expect
    .poll(async () =>
      Number(
        (
          await page
            .locator(".metric-card")
            .nth(1)
            .locator("strong")
            .innerText()
        ).replaceAll(",", ""),
      ),
    )
    .toBeGreaterThan(savedSteps);
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
});
