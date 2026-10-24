export const ELEMENT_INFO = {
  wall: {
    name: "벽",
    description:
      "통과할 수 없는 고정 장애물입니다. Racing에서는 접촉하면 실패합니다.",
  },
  platform: {
    name: "고정 발판",
    description: "Bounce 에이전트가 올라서거나 점프할 수 있는 바닥입니다.",
  },
  moving: {
    name: "이동 장애물 / 발판",
    description:
      "이동 범위와 주기에 따라 왕복합니다. Bounce에서는 올라탈 수 있습니다.",
  },
  spike: {
    name: "가시",
    description:
      "접촉하면 즉시 실패합니다. 테스트에서는 마지막 부활 지점으로 돌아갑니다.",
  },
  bomb: {
    name: "폭탄",
    description:
      "접촉 즉시 폭발 판정으로 실패합니다. AI 에피소드는 종료되고 테스트는 자동 재시도합니다.",
  },
  spring: {
    name: "점프대",
    description:
      "접촉하면 설정한 방향과 세기로 즉시 발사합니다. 발사 방향은 요소 회전에 상대적인 각도입니다.",
  },
  elastic: {
    name: "탄성 발판",
    description:
      "탄성 발판은 접촉 시 반발과 함께 점프를 보조합니다. 보조 계수는 환경 v4에서 사용합니다.",
  },
  respawn: {
    name: "부활 지점",
    description:
      "통과하면 테스트의 다음 부활 위치가 됩니다. 학습에서 실패를 취소하거나 게이트 보상을 주지 않습니다.",
  },
  belt: {
    name: "속도 벨트",
    description:
      "현재 속도 방향으로 가속하거나 감속하는 비고체 구역입니다. 정지 시 벨트 방향을 사용합니다.",
  },
  reward: {
    name: "중간 보상",
    description:
      "중간 보상은 강화학습을 위해 특정 구간/영역에 추가 보상을 부여합니다. 기본은 에피소드당 1회입니다.",
  },
  checkpoint: {
    name: "체크포인트",
    description:
      "진행도·보상·경로 유도를 위한 순서 게이트입니다. 부활 지점과 별개이며, Racing은 게이트 0개로도 실행할 수 있습니다.",
  },
};
