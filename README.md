# EvoTrack

[![Pages deployment](https://github.com/oyueo-mm/EvoTrack/actions/workflows/pages.yml/badge.svg)](https://github.com/oyueo-mm/EvoTrack/actions/workflows/pages.yml)

- 웹사이트: [oyueo-mm.github.io/EvoTrack](https://oyueo-mm.github.io/EvoTrack/)
- 저장소: [oyueo-mm/EvoTrack](https://github.com/oyueo-mm/EvoTrack)

브라우저 내부에서 Racing/Bounce 환경의 신경망을 학습하는 로컬 우선 실험실. React, TypeScript, Vite, Tailwind CSS, Canvas 2D, TensorFlow.js, Web Workers, IndexedDB를 사용합니다. 백엔드나 학습 API가 없습니다.

새 맵 요소는 **환경 v4**에서 사용합니다. 탄성 발판의 점프 보조·최소/최대 도약 속도, 속도 방향 기반 가속/감속 벨트, 1회/반복/쿨다운 보상 영역·게이트를 제공합니다. 기존 v1/v2/v3 맵은 원래 물리로 실행되며, 편집에 들어가면 새 ID의 **v4 편집본**을 자동 생성하여 원본을 보존합니다. 이름은 `맵 이름 (v4)`로 정리합니다.

학습 제어는 시뮬레이션 카드 오른쪽 위에 모았습니다. **최고 모델 확인**은 모든 학습을 일시정지하고 별도 환경에서 고정 정책을 재생하며, 중지 후에도 저장된 최고/현재 정책을 확인할 수 있습니다. PPO는 정확히 1개의 학습 환경을 사용하며, 최고 정책은 고정 시드 101/202/303의 동일 조건 평가로 선정합니다. 도구는 고유 Lucide 아이콘과 5개 반응형 그룹을 사용합니다. [구현·검증 보고서](docs/best-policy-v4-editor.md)를 참고하세요.

학습 설정은 기본 닫힘의 플로팅 패널이며, 맵·알고리즘·환경을 학습 중 바꾸면 이전 Worker를 정리하고 새 세션으로 즉시 전환합니다. 데스크톱 메뉴는 에디터에서도 본문을 미는 도킹형입니다. 학습·편집·라이브러리·비교 화면에서 **전체 보기** 또는 `Alt+Enter`를 사용하고 `Esc`로 복귀하세요. 테스트 안내는 닫기·다시 보지 않기·Inspector에서 복원을 지원합니다. 홈 추천은 실제 Canvas 애니메이션 프리뷰입니다. [학습 UX·새 요소 개편 보고서](docs/learning-ux-elements.md)를 확인하세요.

기본 **실시간 관찰** 모드에서는 캔버스가 실제 학습 상태를 그린 뒤 Worker의 다음 작업을 승인합니다. GA는 실제 개체군을, PPO는 실제 Rollout을 보여주며 GA + PPO는 왼쪽 GA/오른쪽 PPO로 함께 표시합니다. 숨겨진 대표 정책 재생은 사용하지 않습니다. **빠른 학습**은 중간 프레임 생략을 허용하지만 같은 실제 환경 상태를 표시합니다. 요청 배속·실제 배속·공통 ticks/s와 개체별 환경 상호작용 스텝을 구분합니다. 관찰 모드에서 탭 숨김이나 실험실 이탈은 자동 일시정지하며, 돌아오면 직접 재개합니다. [편집 버그와 실제 학습 동기화 보고서](docs/observable-learning.md)를 참고하세요.

GA는 한 세대의 모든 개체가 독립적인 환경에서 같은 물리 스텝으로 동시에 주행합니다. 학습 실험실 상단에서 맵·알고리즘·배속과 실행을 제어하고, 생존/충돌/완주 수와 실제 처리량을 관찰하세요. 수동 방향 게이트, 장애물 리사이즈·회전 핸들, Ctrl/Cmd+C/V/X/D, 난이도별 새 맵 8개를 제공합니다. 구현·성능·기존 데이터 호환성과 제한은 [실시간 진화 및 편집 고도화 보고서](docs/live-evolution.md)를 확인하세요.

새 UX는 빈 공간 팬, Ctrl+세로 드래그 줌, 기본 ±7° 자석 스냅(±10°에서 해제, Alt 임시 해제), 전역 메뉴 접기·너비 저장, 요소별 설명과 발사/탄성 계수, 테스트 자동 부활을 제공합니다. Racing 4개·Bounce 3개 고난도 코스를 추가하고 기존 Bounce 튜토리얼 3개는 별도 필터로 보존했습니다. v1/v2 물리는 유지하고 새 폭탄·부활 표식·계수는 명시적 v3 편집본에서 사용합니다. [편집·플레이 개선 보고서](docs/editor-play-workflow.md)를 확인하세요.

```sh
npm install
npm run dev
```

Windows에서 Node가 PATH에 없다면:

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

실험실에서 환경과 예제 맵을 선택하고 GA, PPO 또는 GA + PPO를 실행하세요. 맵 에디터는 도로 그리기, 객체 배치·이동·속성 수정, 시작/결승/체크포인트, 실행 취소·다시 실행, 확대와 화면 이동을 제공합니다. 학습 중 맵 에디터에 들어가면 원본 세션을 보존한 채 편집본으로 분기하며(기본 관찰 모드에서는 일시정지),, 저장할 때 다음 세션 적용 또는 지금 재시작을 선택합니다. 설정 패널에서 표시 옵션과 학습 설정을 변경할 수 있습니다.

UI/UX 개선: 학습 배속은 **0.5×~10× 슬라이더**와 1/2/5× 프리셋으로 조절합니다. `설정 기본값 복원`은 입력값만, `세션 초기화`는 중지된 학습의 결과만 비웁니다. 저장된 맵·모델은 유지합니다.

에디터에서 도로 두께(30~300px)를 조절하고, 반경 조절 지우개로 도로·체크포인트·시작·결승점·장애물을 삭제할 수 있습니다. 휠/핀치로 확대·축소, 빈 공간 드래그로 이동하고 Ctrl+세로 드래그로 확대·축소합니다. 도로 도구에서는 클릭·드래그로 제어점을 이어 그립니다. Space+드래그 또는 손 도구로도 이동하고 미니맵에서 전체 위치를 확인하세요. `테스트 실행`은 실제 물리 환경을 WASD/방향키/Space/터치 버튼으로 조작하고 R로 즉시 재시도하며 학습 가중치를 변경하지 않습니다. 삭제 후 미완성 맵은 실행·저장 전에 이유를 표시합니다. 자세한 변경 내용은 [UI/UX 개선 보고서](docs/UI_UX_REDESIGN.md)를 확인하세요.

추론용 모델은 가중치만 저장합니다. 체크포인트는 GA 개체군/RNG 또는 PPO actor/critic/Adam/RNG를 포함합니다. **PPO는 완료된 rollout 업데이트 경계에서 저장하고 새 에피소드로 재개합니다. 중간 rollout 복원은 지원하지 않습니다.** 단순 가중치로 새 학습을 시작하는 기능과 구분되어 있습니다. 같은 맵의 체크포인트를 재개하고, 다른 맵은 모델 라이브러리의 평가로 실행하세요. 평가는 Worker에서 정책을 고정한 채 3개 시드를 사용합니다.

맵·모델·실험은 이 브라우저의 IndexedDB에 저장됩니다. **데이터 백업 · 이전**에서 전체 작업 공간 JSON을 내보내고 다른 노트북에서 일괄 복원할 수 있습니다. 가져오기 전 자료 개수와 중복 ID를 확인하고, 중복을 건너뛰거나 덮어쓰세요. 손상된 파일은 거부하며 쓰기 실패 시 전체 복원을 롤백합니다. 기존 v0.1 백업과 저장 형식도 지원합니다. 브라우저 데이터를 지우면 로컬 기록도 삭제됩니다.

맵 에디터는 캔버스 위 플로팅 도구 모음과 오른쪽 속성·레이어·맵 설정 Inspector를 사용하는 전체 화면 작업 공간입니다. 우클릭 드래그로 임시 이동하고, `F`/`1`로 화면을 맞춥니다. 도로 제어점 추가·곡선 다듬기, 레이어 표시·잠금, 모바일 속성 시트를 제공합니다. 라이트·다크 테마를 지원하며 자세한 구현·검증·이전 안내는 [맵 에디터 개편 보고서](docs/editor-redesign.md)를 확인하세요.

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run validate:learning
node scripts/verify-static.mjs
node scripts/verify-static.mjs --screenshots
```

개발 서버에서 출력되는 `/EvoTrack/` 주소를 열어 사용하세요. E2E는 전용 포트 5187을 사용합니다. `docs/results/learning-validation.json`은 공개 가능한 검증용 지표이며 개인 학습 모델이나 체크포인트를 포함하지 않습니다. 단일 학습 시드와 간단한 맵의 결과이며, 일반화나 모든 코스의 완주를 보장하지 않습니다. 세부 구현 상태와 제한은 [PROGRESS.md](PROGRESS.md), 설계는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)를 확인하세요.

GitHub Pages: Vite의 base는 `/EvoTrack/`로 고정되어 있고 hash navigation으로 화면을 전환합니다. `main`에 push하면 `.github/workflows/pages.yml`이 단위·브라우저 테스트, TypeScript 검사와 정적 빌드를 거쳐 `dist/`를 공개 배포합니다. 이어지는 `verify` job은 실제 Pages URL에서 브라우저 테스트를 실행하며, HTTP 오류·Worker 자산·브라우저 오류 보고서를 Actions artifact로 7일간 보관합니다. 수동 workflow 실행도 지원합니다. 최신 배포 결과는 위 Actions 배지에서 확인할 수 있습니다.

공개 사이트를 직접 검증하려면 다음 명령을 사용합니다. 이 설정은 로컬 서버를 시작하지 않습니다. 개발 소스 전용 Worker 프로토콜·처리량 테스트 3개는 배포 검사에서 제외되며, 실제 Worker 실행·일시정지·저장·재개는 UI 테스트로 확인합니다.

```powershell
$env:EVOTRACK_BASE_URL = 'https://oyueo-mm.github.io/EvoTrack/'
npm run test:e2e
```

테스트는 별도 Chromium 컨텍스트에서 생성한 자료만 사용하고 사용자의 실제 브라우저 프로필은 열지 않습니다. 로컬 및 공개 사이트의 IndexedDB는 서로 다른 origin에 저장됩니다. `.env`, 인증 키, 캐시, 테스트 결과, 개인 exports/checkpoints/training-data는 Git에서 제외합니다.
