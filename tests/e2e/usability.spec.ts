import { openSettings, chooseTool } from "./helpers";
import { test, expect, type Page } from "@playwright/test";
import { EXAMPLE_MAPS } from "../../src/core/maps";
import { DEFAULT_CONFIG } from "../../src/core/types";
const url = "./";
async function worldClick(page: Page, x: number, y: number) {
  const canvas = page.getByLabel("맵 편집 캔버스"),
    r = (await canvas.boundingBox())!,
    z = Number(await canvas.getAttribute("data-zoom")),
    px = Number(await canvas.getAttribute("data-pan-x")),
    py = Number(await canvas.getAttribute("data-pan-y")),
    scale = Math.min(r.width / 1000, r.height / 640) * z;
  await canvas.click({
    position: {
      x: (r.width - 1000 * scale) / 2 + (x + px) * scale,
      y: (r.height - 640 * scale) / 2 + (y + py) * scale,
    },
  });
}
test("fractional speed, defaults and session reset have distinct effects", async ({
  page,
}) => {
  await page.goto(url);
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await openSettings(page);
  const slider = page.getByRole("slider", { name: "학습 배속", exact: true });
  await expect(slider).toHaveAttribute("min", "0.5");
  await expect(slider).toHaveAttribute("max", "10");
  await slider.focus();
  await slider.press("Home");
  for (let i = 0; i < 18; i++) await slider.press("ArrowRight");
  await expect(page.getByLabel("학습 배속 현재 값")).toHaveText("2.3×");
  await openSettings(page);
  await page
    .getByRole("button", { name: "Genetic Algorithm", exact: false })
    .click();
  await openSettings(page);
  await page.getByLabel("개체군 크기", { exact: true }).fill("4");
  await openSettings(page);
  await page.getByLabel("에피소드 최대 스텝", { exact: true }).fill("30");
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect
    .poll(() => page.locator(".metric-card").first().innerText())
    .not.toContain("—");
  await slider.focus();
  await slider.press("Home");
  await expect(page.getByLabel("학습 배속 현재 값")).toHaveText("0.5×");
  await slider.press("End");
  await expect(page.getByLabel("학습 배속 현재 값")).toHaveText("10.0×");
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "학습 시작", exact: true }),
  ).toBeVisible();
  const iteration = await page
    .locator(".metric-card")
    .first()
    .locator("strong")
    .innerText();
  await page
    .getByRole("button", { name: "설정 기본값 복원", exact: true })
    .click();
  await expect(slider).toHaveValue("2");
  await expect(page.getByLabel("개체군 크기", { exact: true })).toHaveValue(
    "32",
  );
  expect(
    await page.locator(".metric-card").first().locator("strong").innerText(),
  ).toBe(iteration);
  await page.getByRole("button", { name: "세션 초기화", exact: true }).click();
  await expect(
    page.locator(".metric-card").first().locator("strong"),
  ).toHaveText("—");
  await expect(page.getByLabel("현재 맵")).toHaveValue("r-straight");
});
test("editor width, semantic eraser, gesture undo, cursor zoom and pan", async ({
  page,
}) => {
  await page.goto(url);
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await page.getByRole("button", { name: "맵 편집", exact: true }).click();
  await page.getByLabel("도로 두께 직접 입력", { exact: true }).fill("180");
  await expect(
    page.getByRole("slider", { name: "도로 두께", exact: true }),
  ).toHaveValue("180");
  await worldClick(page, 350, 320);
  await expect(
    page.getByRole("heading", { name: "체크포인트", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "선택 요소 삭제", exact: true })
    .click();
  await expect(page.locator(".element-count")).toContainText("체크포인트 2개");
  await chooseTool(page, "실행 취소");
  await expect(page.locator(".element-count")).toContainText("체크포인트 3개");
  await chooseTool(page, "벽");
  await worldClick(page, 750, 100);
  await expect(page.locator(".element-count")).toContainText("장애물 1개");
  await chooseTool(page, "지우개");
  await worldClick(page, 755, 105);
  await expect(page.locator(".element-count")).toContainText("장애물 0개");
  await worldClick(page, 470, 320);
  await expect(page.locator(".validation-message")).toContainText(
    "도로가 끊어져",
  );
  await chooseTool(page, "실행 취소");
  await expect(page.locator(".valid-message")).toBeVisible();
  await worldClick(page, 110, 320);
  await expect(page.locator(".validation-message")).toContainText(
    "시작점이 없습니다",
  );
  await page.getByRole("button", { name: "맵 저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("시작점이 없습니다");
  await chooseTool(page, "실행 취소");
  await worldClick(page, 880, 320);
  await expect(page.locator(".validation-message")).toContainText(
    "결승점이 없습니다",
  );
  await chooseTool(page, "실행 취소");
  const canvas = page.getByLabel("맵 편집 캔버스");
  await canvas.scrollIntoViewIfNeeded();
  let r = (await canvas.boundingBox())!;
  const anchor = {
    x: Math.round(r.x + r.width * 0.62) - r.x,
    y: Math.round(r.y + r.height * 0.4) - r.y,
  };
  const worldAt = async () => {
    const z = Number(await canvas.getAttribute("data-zoom")),
      px = Number(await canvas.getAttribute("data-pan-x")),
      py = Number(await canvas.getAttribute("data-pan-y")),
      scale = Math.min(r.width / 1000, r.height / 640) * z;
    return {
      x: (anchor.x - (r.width - 1000 * scale) / 2) / scale - px,
      y: (anchor.y - (r.height - 640 * scale) / 2) / scale - py,
    };
  };
  const before = await worldAt();
  await page.mouse.move(r.x + anchor.x, r.y + anchor.y);
  await page.mouse.wheel(0, -330);
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-zoom")))
    .toBeGreaterThan(1);
  const after = await worldAt();
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
  const oldPan = await canvas.getAttribute("data-pan-x");
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(r.x + anchor.x + 60, r.y + anchor.y + 25, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  expect(await canvas.getAttribute("data-pan-x")).not.toBe(oldPan);
  await page.getByRole("button", { name: "화면 맞춤", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-zoom", "1.000");
  await expect(canvas).toHaveAttribute("data-pan-x", "0.00");
  await page
    .getByRole("button", { name: "미니맵에서 위치 이동" })
    .click({ position: { x: 125, y: 30 } });
  await expect.poll(() => canvas.getAttribute("data-pan-x")).not.toBe("0.00");
  await page.getByRole("button", { name: "화면 맞춤", exact: true }).click();
  await chooseTool(page, "도로 그리기");
  await page.getByLabel("경로 제작 방식").selectOption("replace");
  await canvas.scrollIntoViewIfNeeded();
  r = (await canvas.boundingBox())!;
  const p = (x: number, y: number) => {
    const scale = Math.min(r.width / 1000, r.height / 640);
    return {
      x: r.x + (r.width - 1000 * scale) / 2 + x * scale,
      y: r.y + (r.height - 640 * scale) / 2 + y * scale,
    };
  };
  const start = p(130, 150);
  await page.mouse.click(start.x, start.y);
  await expect(page.locator(".element-count")).not.toContainText("도로 4점");
  await chooseTool(page, "실행 취소");
  await expect(page.locator(".element-count")).toContainText("도로 4점");
  await expect(
    page.getByRole("slider", { name: "도로 두께", exact: true }),
  ).toHaveValue("180");
  await page.screenshot({
    path: ".cache/ui-review/editor.png",
    fullPage: true,
  });
});
test("map test uses real physics and remains separate from training", async ({
  page,
}) => {
  await page.goto(url);
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await page.getByRole("button", { name: "맵 편집", exact: true }).click();
  await page.getByRole("button", { name: "테스트 실행", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "테스트 종료", exact: true }),
  ).toBeVisible();
  await page.keyboard.down("ArrowUp");
  await expect
    .poll(() => page.getByLabel("테스트 에이전트 위치").innerText())
    .not.toContain("x 110 ");
  await page.keyboard.up("ArrowUp");
  await page.getByRole("button", { name: "테스트 종료", exact: true }).click();
  await page.getByRole("button", { name: "학습하기", exact: true }).click();
  await expect(
    page.locator(".metric-card").first().locator("strong"),
  ).toHaveText("—");
});
test("speed changes actual Worker throughput at a fixed physics timestep", async ({
  page,
}) => {
  test.skip(
    !!process.env.EVOTRACK_BASE_URL,
    "Source-level scheduling test runs locally; deployed speed controls are covered by UI.",
  );
  await page.goto(url);
  const measured = await page.evaluate(
    async ({ map, config }) => {
      const worker = new Worker(
        new URL("src/workers/trainer.worker.ts", location.href),
        { type: "module" },
      );
      const replies: any[] = [];
      worker.onmessage = (e) => replies.push(e.data);
      let id = 0;
      const command = async (
        type: string,
        extra: Record<string, unknown> = {},
      ) => {
        const requestId = ++id;
        worker.postMessage({
          type,
          session: "speed-test",
          requestId,
          algorithm: "GA",
          ...extra,
        });
        const end = Date.now() + 15000;
        while (Date.now() < end) {
          const r = replies.find((r) => r.requestId === requestId);
          if (r) {
            if (r.type === "ERROR") throw Error(r.error);
            return r;
          }
          await new Promise((r) => setTimeout(r, 15));
        }
        throw Error("Worker timeout");
      };
      try {
        await command("START", { map, config });
        await new Promise((r) => setTimeout(r, 400));
        const sample = async (speed: number) => {
          await command("UPDATE_CONFIG", { config: { ...config, speed } });
          const before = await command("REQUEST_SNAPSHOT");
          await new Promise((r) => setTimeout(r, 900));
          const after = await command("REQUEST_SNAPSHOT");
          return {
            iterations:
              after.snapshot.stats.iteration - before.snapshot.stats.iteration,
            steps: after.snapshot.stats.steps - before.snapshot.stats.steps,
          };
        };
        const slow = await sample(0.5),
          fast = await sample(10);
        return { slow, fast };
      } finally {
        worker.terminate();
      }
    },
    {
      map: EXAMPLE_MAPS[0],
      config: {
        ...DEFAULT_CONFIG,
        population: 4,
        horizon: 30,
        speed: 0.5,
        trainingMode: "fast",
      },
    },
  );
  expect(measured.fast.iterations).toBeGreaterThan(measured.slow.iterations);
  expect(measured.fast.steps).toBeGreaterThan(measured.slow.steps);
  await test.info().attach("measured-scheduling", {
    body: JSON.stringify(measured),
    contentType: "application/json",
  });
});

test("touch pinch, mobile properties sheet and navigation are usable", async ({
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
    await page.getByRole("button", { name: "맵 편집", exact: true }).click();
    await chooseTool(page, "화면 이동");
    const canvas = page.getByLabel("맵 편집 캔버스");
    await canvas.scrollIntoViewIfNeeded();
    const r = (await canvas.boundingBox())!;
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: Math.round(r.x + 90), y: Math.round(r.y + 110), id: 0 },
        { x: Math.round(r.x + 210), y: Math.round(r.y + 110), id: 1 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: Math.round(r.x + 55), y: Math.round(r.y + 110), id: 0 },
        { x: Math.round(r.x + 250), y: Math.round(r.y + 110), id: 1 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-zoom")))
      .toBeGreaterThan(1.4);
    await page.getByRole("button", { name: "화면 맞춤", exact: true }).click();
    await page.getByRole("button", { name: "속성 열기", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "요소와 속성", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "맵 설정", exact: true }).click();
    await page
      .getByLabel("맵 이름 (설정)", { exact: true })
      .fill("모바일 편집");
    await page.getByRole("button", { name: "패널 닫기", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "속성 열기", exact: true }),
    ).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "학습하기", exact: true }).click();
    await page.getByRole("button", { name: "메뉴", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "메뉴 닫기", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "메뉴 닫기", exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".cache/ui-review/mobile-touch.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
