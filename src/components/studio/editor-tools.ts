import {
  MousePointer2,
  Pencil,
  Layers,
  MoveHorizontal,
  TriangleAlert,
  Bomb,
  ArrowUpFromLine,
  Waves,
  ChevronsRight,
  Play,
  Flag,
  MapPin,
  ScanLine,
  Gift,
  Square,
  Eraser,
  Hand,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Tool } from "../World";
import type { Mode } from "../../core/types";
export interface EditorTool {
  id: Tool;
  icon: LucideIcon;
  iconName: string;
  label: string;
  description: string;
  hint?: string;
  group: string;
  modes?: Mode[];
}
export const TOOL_GROUPS = [
  "기본 도구",
  "지형 제작",
  "물리 요소",
  "게임 요소",
  "편집 기록",
];
export const EDITOR_TOOLS: EditorTool[] = [
  {
    id: "select",
    icon: MousePointer2,
    iconName: "MousePointer2",
    label: "선택 / 이동",
    description: "요소를 선택하고 위치·크기·회전을 편집",
    hint: "V",
    group: "기본 도구",
  },
  {
    id: "pan",
    icon: Hand,
    iconName: "Hand",
    label: "화면 이동",
    description: "맵을 바꾸지 않고 카메라 이동",
    hint: "H",
    group: "기본 도구",
  },
  {
    id: "erase",
    icon: Eraser,
    iconName: "Eraser",
    label: "지우개",
    description: "지나간 범위의 요소 삭제",
    hint: "E",
    group: "기본 도구",
  },
  {
    id: "road",
    icon: Pencil,
    iconName: "Pencil",
    label: "도로 그리기",
    description: "클릭·드래그로 도로 제어점 추가",
    hint: "P",
    group: "지형 제작",
    modes: ["racing"],
  },
  {
    id: "platform",
    icon: Layers,
    iconName: "Layers",
    label: "고정 발판",
    description: "올라서거나 점프할 바닥 배치",
    hint: "P",
    group: "지형 제작",
    modes: ["bounce"],
  },
  {
    id: "moving",
    icon: MoveHorizontal,
    iconName: "MoveHorizontal",
    label: "이동 발판",
    description: "범위와 주기에 따라 움직이는 장애물/발판",
    group: "지형 제작",
  },
  {
    id: "wall",
    icon: Square,
    iconName: "Square",
    label: "벽",
    description: "통과할 수 없는 고정 장애물",
    hint: "W",
    group: "지형 제작",
  },
  {
    id: "spike",
    icon: TriangleAlert,
    iconName: "TriangleAlert",
    label: "가시",
    description: "접촉하면 즉시 실패하는 장애물",
    group: "물리 요소",
  },
  {
    id: "bomb",
    icon: Bomb,
    iconName: "Bomb",
    label: "폭탄",
    description: "접촉하면 폭발하는 장애물",
    group: "물리 요소",
  },
  {
    id: "spring",
    icon: ArrowUpFromLine,
    iconName: "ArrowUpFromLine",
    label: "점프대",
    description: "설정된 방향과 세기로 발사",
    group: "물리 요소",
    modes: ["bounce"],
  },
  {
    id: "elastic",
    icon: Waves,
    iconName: "Waves",
    label: "탄성 발판",
    description: "반발과 점프 보조력을 제공하는 발판",
    group: "물리 요소",
    modes: ["bounce"],
  },
  {
    id: "belt",
    icon: ChevronsRight,
    iconName: "ChevronsRight",
    label: "속도 벨트",
    description: "이동 속도를 높이거나 줄이는 구역",
    group: "물리 요소",
  },
  {
    id: "start",
    icon: Play,
    iconName: "Play",
    label: "시작점",
    description: "에이전트가 출발할 위치",
    hint: "S",
    group: "게임 요소",
  },
  {
    id: "goal",
    icon: Flag,
    iconName: "Flag",
    label: "결승점",
    description: "도달하면 완주하는 목표",
    hint: "G",
    group: "게임 요소",
  },
  {
    id: "respawn",
    icon: MapPin,
    iconName: "MapPin",
    label: "부활 지점",
    description: "수동 테스트의 다음 부활 위치",
    group: "게임 요소",
    modes: ["bounce"],
  },
  {
    id: "checkpoint",
    icon: ScanLine,
    iconName: "ScanLine",
    label: "체크포인트",
    description: "진행도와 보상을 판정하는 순서 게이트",
    hint: "C",
    group: "게임 요소",
    modes: ["racing"],
  },
  {
    id: "reward",
    icon: Gift,
    iconName: "Gift",
    label: "중간 보상",
    description: "강화학습용 추가 보상 지정",
    group: "게임 요소",
  },
];
export const toolsFor = (mode: Mode) =>
  EDITOR_TOOLS.filter((t) => !t.modes || t.modes.includes(mode)).map((t) =>
    t.id === "moving" && mode === "racing" ? { ...t, label: "이동 장애물" } : t,
  );
