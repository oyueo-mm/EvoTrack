import type { Page } from "@playwright/test";
export async function openSettings(page: Page) {
  const button = page.getByRole("button", { name: "학습 설정", exact: true });
  if (await button.isVisible()) await button.click();
}

export async function chooseTool(page: Page, label: string) {
  const groups: Record<string, string> = {
    "선택 / 이동": "기본 도구",
    "화면 이동": "기본 도구",
    지우개: "기본 도구",
    "도로 그리기": "지형 제작",
    "고정 발판": "지형 제작",
    "이동 발판": "지형 제작",
    "이동 장애물": "지형 제작",
    벽: "지형 제작",
    가시: "물리 요소",
    폭탄: "물리 요소",
    점프대: "물리 요소",
    "탄성 발판": "물리 요소",
    "속도 벨트": "물리 요소",
    시작점: "게임 요소",
    결승점: "게임 요소",
    체크포인트: "게임 요소",
    "부활 지점": "게임 요소",
    "중간 보상": "게임 요소",
    "실행 취소": "편집 기록",
    "다시 실행": "편집 기록",
  };
  const button = page.getByRole("button", { name: label, exact: true });
  if (!(await button.isVisible()))
    await page.getByText(groups[label], { exact: true }).click();
  await button.click();
}
