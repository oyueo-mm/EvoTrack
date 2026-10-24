import { test, expect, type Page } from "@playwright/test";
import { EXAMPLE_MAPS } from "../../src/core/maps";
import { chooseTool, openSettings } from "./helpers";
async function setup(page: Page, algorithm: "GA" | "PPO" | "both") {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("./?debug=1");
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await page.getByLabel("학습 알고리즘").selectOption(algorithm);
  await openSettings(page);
  if (algorithm !== "PPO")
    await page.getByLabel("개체군 크기", { exact: true }).fill("4");
  await page.getByLabel("에피소드 최대 스텝", { exact: true }).fill("30");
  if (algorithm !== "GA") {
    await page.getByText("고급 설정", { exact: true }).click();
    await page.getByLabel("Rollout 길이", { exact: true }).fill("16");
    await page.getByLabel("Epochs", { exact: true }).fill("1");
    await page.getByLabel("Minibatch", { exact: true }).fill("8");
  }
  await page.getByRole("button", { name: "패널 닫기", exact: true }).click();
  await page.getByLabel("상단 학습 배속").fill("10");
}
test("PPO stays single-agent; evaluated best policies can be replayed and saved after pause or stop", async ({
  page,
}) => {
  await setup(page, "PPO");
  const header = page.locator(".training-card-header");
  await expect(header.getByLabel("학습 알고리즘")).toBeVisible();
  await expect(
    header.getByRole("button", { name: "학습 시작", exact: true }),
  ).toBeVisible();
  expect(
    await page.locator(".experiment-context.training-controls").count(),
  ).toBe(0);
  await expect(page.getByLabel("PPO 에이전트 수", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  const c = page.getByLabel("AI 시뮬레이션 캔버스");
  await expect(c).toHaveAttribute("data-training-environments", "1");
  await expect
    .poll(async () => Number(await c.getAttribute("data-updates")))
    .toBeGreaterThanOrEqual(2);
  const environment = await c.getAttribute("data-environment-id");
  await header
    .getByRole("button", { name: "최고 모델 확인", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "최고 모델 확인",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("정책 평가 정보")).toHaveAttribute(
    "data-policy-source",
    "evaluation",
  );
  await expect(dialog.getByLabel("정책 평가 정보")).toContainText(
    "101, 202, 303",
  );
  const sample = await c.getAttribute("data-training-samples"),
    updates = await c.getAttribute("data-updates"),
    weights = await c.getAttribute("data-policy-checksum");
  const playback = page.getByLabel("최고 모델 평가 주행");
  await expect
    .poll(async () => Number(await playback.getAttribute("data-playback-step")))
    .toBeGreaterThan(5);
  const fixedWeights = await playback.getAttribute("data-policy-checksum");
  await page.waitForTimeout(250);
  await expect(c).toHaveAttribute("data-training-samples", sample!);
  await expect(c).toHaveAttribute("data-updates", updates!);
  await expect(c).toHaveAttribute("data-policy-checksum", weights!);
  await expect(playback).toHaveAttribute("data-policy-checksum", fixedWeights!);
  await dialog
    .getByRole("button", { name: "최고 정책 저장", exact: true })
    .click();
  await expect(page.locator(".toast")).toContainText("추론용");
  await page.screenshot({ path: ".cache/ui-review/ppo-best-inspection.png" });
  await dialog.getByRole("button", { name: "재실행", exact: true }).click();
  await dialog
    .getByRole("button", { name: "학습으로 돌아가기", exact: true })
    .click();
  await expect(
    header.getByRole("button", { name: "학습 재개", exact: true }),
  ).toBeVisible();
  await expect(c).toHaveAttribute("data-environment-id", environment!);
  await header.getByRole("button", { name: "학습 중지", exact: true }).click();
  await expect(
    header.getByRole("button", { name: "학습 시작", exact: true }),
  ).toBeVisible();
  await header
    .getByRole("button", { name: "최고 모델 확인", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "돌아가서 학습 재개", exact: true }),
  ).toHaveCount(0);
  await dialog.getByLabel("확인할 정책").selectOption("current");
  await dialog
    .getByRole("button", { name: "현재 정책 저장", exact: true })
    .click();
  await expect(page.locator(".toast")).toContainText("추론용");
  await dialog
    .getByRole("button", { name: "학습으로 돌아가기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "모델 라이브러리", exact: true })
    .click();
  await expect(page.locator(".model-card")).toHaveCount(2);
  await expect(page.locator(".policy-selection").first()).toContainText(
    "고정 시드 평가",
  );
  await page.reload();
  await expect(page.locator(".model-card")).toHaveCount(2);
});
test("GA stores the generation winner, resumes after inspection, and preserves best metadata in checkpoints", async ({
  page,
}) => {
  await setup(page, "both");
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  const c = page.getByLabel("AI 시뮬레이션 캔버스");
  await expect(c).toHaveAttribute("data-live-count", "4");
  await expect
    .poll(async () => Number(await c.getAttribute("data-generation")))
    .toBeGreaterThan(1);
  await page
    .getByRole("button", { name: "최고 모델 확인", exact: true })
    .click();
  const d = page.getByRole("dialog", { name: "최고 모델 확인", exact: true });
  await expect(d.getByLabel("정책 평가 정보")).toHaveAttribute(
    "data-policy-source",
    "generation",
  );
  await expect
    .poll(async () =>
      Number(
        await d.getByLabel("정책 평가 정보").getAttribute("data-iteration"),
      ),
    )
    .toBeGreaterThan(0);
  const ppo = page.getByLabel("PPO 실제 학습 캔버스");
  await expect(ppo).toHaveAttribute("data-training-environments", "1");
  const otherSamples = await ppo.getAttribute("data-training-samples");
  const otherWeights = await ppo.getAttribute("data-policy-checksum");
  const frozen = await c.getAttribute("data-live-positions");
  await page.waitForTimeout(220);
  await expect(c).toHaveAttribute("data-live-positions", frozen!);
  await expect(ppo).toHaveAttribute("data-training-samples", otherSamples!);
  await expect(ppo).toHaveAttribute("data-policy-checksum", otherWeights!);
  await d.getByRole("button", { name: "최고 정책 저장", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("추론용");
  await page.screenshot({ path: ".cache/ui-review/ga-best-inspection.png" });
  await d.getByLabel("확인할 정책").selectOption("current");
  await expect(d.getByLabel("정책 평가 정보")).toContainText(/진행 중|완료/);
  await d
    .getByRole("button", { name: "돌아가서 학습 재개", exact: true })
    .click();
  await expect
    .poll(() => c.getAttribute("data-live-positions"))
    .not.toBe(frozen);
  await page.getByRole("button", { name: "체크포인트", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("체크포인트");
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
  await page
    .getByRole("button", { name: "모델 라이브러리", exact: true })
    .click();
  await expect(page.locator(".model-card")).toHaveCount(2);
  const cp = page.locator(".model-card").filter({ hasText: "CHECKPOINT" });
  const download = page.waitForEvent("download");
  await cp.getByRole("button", { name: "모델 내보내기", exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const model = JSON.parse(Buffer.concat(chunks).toString());
  expect(model.bestPolicy.algorithm).toBe("GA");
  expect(model.checkpoint.bestGeneration).toBeGreaterThan(0);
  expect(model.kind).toBe("checkpoint");
  await cp.getByRole("button", { name: "재개", exact: true }).click();
  await expect(c).toHaveAttribute("data-live-count", "4");
  await page
    .getByRole("button", { name: "최고 모델 확인", exact: true })
    .click();
  await expect(d).toBeVisible();
  await expect(d.getByLabel("정책 평가 정보")).toHaveAttribute(
    "data-policy-source",
    "generation",
  );
});
test("v1/v2/v3/v4 open directly as concise v5 copies while original JSON remains unchanged", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  for (const version of [1, 2, 3, 4]) {
    const original = {
      ...structuredClone(EXAMPLE_MAPS[0]),
      id: "legacy-edit-" + version,
      name: "Legacy " + version,
      environmentVersion: version,
      checkpoints: [],
      objects: [],
    };
    await page.goto("./#maps");
    await page.locator('input[type="file"]').setInputFiles({
      name: "legacy.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(original)),
    });
    await expect(page.locator(".toast")).toContainText("가져왔습니다");
    await page.getByRole("button", { name: "맵 에디터", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "맵 편집 작업 공간" }),
    ).toHaveAttribute("data-environment-version", "5");
    await expect(page.getByLabel("맵 이름", { exact: true })).toHaveValue(
      `Legacy ${version} (v5)`,
    );
    await expect(
      page.getByRole("button", { name: /편집본 만들기/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "속도 벨트", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "맵 저장", exact: true }).click();
    await expect(page.locator(".toast")).toContainText("저장했습니다");
    await page
      .getByRole("button", { name: "맵 라이브러리", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: original.name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: `${original.name} (v5)`, exact: true }),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: `${original.name} 내보내기`, exact: true })
      .click();
    const stream = await (await download).createReadStream();
    const parts: Buffer[] = [];
    for await (const part of stream!) parts.push(Buffer.from(part));
    expect(JSON.parse(Buffer.concat(parts).toString())).toEqual(original);
    await page
      .getByRole("button", { name: `${original.name} 편집`, exact: true })
      .click();
    await expect(page.getByLabel("맵 이름", { exact: true })).toHaveValue(
      `${original.name} (v5)`,
    );
  }
});
test("tool icons are unique and mobile groups expose real descriptions without horizontal scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#editor");
  const toolbar = page.getByRole("toolbar", { name: "맵 편집 도구" });
  await expect(toolbar.locator("details")).toHaveCount(5);
  const icons = await toolbar
    .locator("[data-tool-icon]")
    .evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLElement).dataset.toolIcon),
    );
  expect(new Set(icons).size).toBe(icons.length);
  expect(
    await toolbar.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await chooseTool(page, "폭탄");
  await expect(page.locator(".editor-status")).toContainText("폭탄");
  await page.getByText("물리 요소", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "폭탄", exact: true }),
  ).toHaveAttribute("title", /접촉하면 폭발/);
  await chooseTool(page, "속도 벨트");
  await page.getByText("게임 요소", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "중간 보상", exact: true }),
  ).toHaveAttribute("title", /강화학습용 추가 보상/);
  await chooseTool(page, "중간 보상");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByText("게임 요소", { exact: true }).click();
  await page.screenshot({ path: ".cache/ui-review/grouped-mobile-tools.png" });
});
