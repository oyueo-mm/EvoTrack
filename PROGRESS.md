# EvoTrack 작업 보고 · 2026-10-23

로컬에서 실제 학습·저장·복원·평가가 가능한 v0.1을 구현하고 검증했습니다. 아래의 검증 범위와 남은 항목을 구분합니다. 초기 구현 결과에 이어 사용자가 GitHub 업로드와 공개 Pages 배포를 명시적으로 승인했으며, 배포용 경로·자동 워크플로·실제 사이트 테스트를 추가했습니다. 최신 배포 성공 여부와 실행 SHA는 [Pages Actions 기록](https://github.com/oyueo-mm/EvoTrack/actions/workflows/pages.yml)에서 확인합니다.

## 1. 구현 및 단계별 검증

| 단계    | 구현                                                                                                                                            | 실행한 검증                                                                                                           | 상태                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Phase 1 | React/TypeScript/Vite/Tailwind 셸, 7개 화면, 공통 환경 계약, 시드 RNG, 버전 스키마                                                              | 타입 검사, RNG/스키마 테스트                                                                                          | 검증됨                                                |
| Phase 2 | Racing 가속·조향·제동·마찰·속도 제한, 거리 센서, 순차 체크포인트, 자유곡선 도로·벽·시작/결승 편집                                               | 직선 완주, 경계 충돌, 체크포인트 건너뛰기 방지, 브라우저 맵 저장                                                      | 검증됨; 임의 맵의 완주 가능성 증명은 제외             |
| Phase 3 | Bounce 중력·점프·공중 제어, 발판·이동 발판·가시·점프대·탄성 발판·벽, 삭제로 낙하 구역 구성, 그리드·객체 속성·복제·undo/redo                     | 중력/접지/점프/벽/시드 결정성, 모바일 편집·학습                                                                       | 기본 동작 검증됨; 복합 이동 발판 스트레스 검증은 남음 |
| Phase 4 | 12→24→action tanh 신경망, 독립 개체군, 토너먼트·교차·가우시안 변이·엘리트·최고 보존                                                             | 변이/엘리트, 정확한 다음 세대 복원, 두 환경 실제 학습                                                                 | 검증됨                                                |
| Phase 5 | TF.js actor/critic, categorical sampling, rollout, GAE, truncation bootstrap, PPO clipping, value/entropy, minibatch Adam, global norm clipping | 확률/로그 확률, GAE 종료 처리, clipping 양·음 advantage, 실제 가중치 변화, Adam 복원 일치, 반복 업데이트 텐서 수 유지 | CPU 경로 검증됨                                       |
| Phase 6 | 알고리즘별 Worker, session/request ID, 9개 명령 구현, 배속에 따른 처리 주기, 150ms 이상 스냅샷 간격                                             | 단독/동시 학습, pause 스텝 불변, resume/stop, UPDATE_CONFIG, REQUEST_SNAPSHOT, RESET, 오래된 세션 차단                | 주요 흐름 검증됨                                      |
| Phase 7 | IndexedDB 맵/모델/실험, 개별 JSON 가져오기·내보내기, 추론/체크포인트 구분, 학습 맵 사본, GA/PPO 상태·RNG 복원                                   | 맵/모델 round-trip, 손상 파일·스키마 차단, 새로고침 후 모델 유지, PPO 브라우저 체크포인트 재개                        | 주요 경로 검증됨                                      |
| Phase 8 | GA/PPO 분할 비교, 실제 스텝 축 그래프, 적합도 분포, 독립 평가 Worker, 새 맵 선택·3개 시드 고정 정책 평가, 실험 기록                             | 가중치 불변 평가 단위 테스트, 브라우저 새 맵 평가                                                                     | 기본 흐름 검증됨; 여러 학습 시드 일반화 실험은 남음   |
| Phase 9 | 반응형 UI, 독립적인 실제 정책 재생(60Hz physics/30fps drawing), 정적 빌드, Pages 수동 workflow                                                  | Vitest 18개, Playwright 4개, /EvoTrack/ 정적 경로 검증                                                                | 로컬 검증됨; 실제 공개 배포는 미실행                  |

## 2. 미완성 또는 미검증 범위

- WebGL/WebGPU 학습 가속은 구현하지 않았습니다. Worker에서 CPU backend를 명시적으로 사용합니다. GPU 부재와 무관하게 동작합니다.
- PPO 중간 에피소드와 rollout 일부를 복원하지 않습니다. 현재 trainer는 각 rollout을 새 에피소드에서 시작하며, 경계의 actor/critic/Adam/RNG 복원은 테스트했습니다. 추론 모델의 가중치 로드는 새 학습으로 표시합니다.
- 임의 Bounce 퍼즐이 물리적으로 완주 가능한지 자동 증명하지 않습니다. 맵 크기, 시작점 충돌, 도로 안 목표/체크포인트 등 구조적 오류만 사전에 검사합니다.
- 여러 시드·복잡한 코스의 장기 학습 및 일반화 성능은 측정하지 않았습니다. 모든 예제의 완주를 보장하지 않습니다.
- 이동 발판의 극한 배치, 매우 얇고 겹친 객체, 최대 설정·저사양 모바일의 장시간 메모리/전력, 브라우저 quota 실패 주입은 미검증입니다.
- JSON export/import 전체 브라우저 왕복, undo/redo/자유곡선의 전수 E2E는 후속 범위입니다.
- 전체 백업 JSON 일괄 복원은 없습니다. 개별 맵·모델 import/export를 사용합니다.
- 현재 비교 차트·실험 저장은 최근 300개 스냅샷을 보관합니다. GA 전체 개체 표시는 평가 종료 상태이며, 대표 정책만 별도 시뮬레이터에서 재생합니다.
- 초기 구현 때에는 공개 배포·원격 연결·Git 커밋을 수행하지 않았습니다. 이후 승인된 배포 작업은 아래 8·9번에 구분해 기록합니다.

## 3. 주요 결정

- 고정 1/60초 headless physics를 학습·평가·렌더러가 공유합니다. Racing 5개, Bounce 6개 이산 행동과 모드별 12차원 관측은 GA/PPO에서 동일합니다.
- GA의 CPU MLP 추론은 숫자 배열로 수행하고, PPO만 TF.js autodiff를 사용합니다. 동일한 가중치 배열 레이아웃으로 저장·추론합니다.
- PPO는 terminal과 time-limit truncation을 구분하여 GAE bootstrap을 계산합니다. NaN loss를 차단하고 optimizer gradient global norm을 0.5로 제한합니다.
- 각 알고리즘은 독립 Worker/환경/RNG/모델을 소유합니다. pause/stop ACK는 완성된 generation/rollout 경계에서 도착합니다. 큰 설정은 ACK 지연이 커질 수 있습니다.
- 학습 지표와 캔버스 정책 재생을 분리합니다. 시각화 재생은 학습 스텝 수를 증가시키지 않습니다. 비교 스텝 수는 학습 상호작용 수이며, 별도 평가 상호작용은 포함하지 않습니다.
- 체크포인트는 학습 당시 맵 사본을 포함하고 재개 시 그 사본을 복원합니다. 이후 같은 ID의 맵을 편집했어도 원래 환경을 유지합니다.
- 배포 단계에서 Vite base를 `/EvoTrack/`로 고정했습니다. hash navigation을 사용하고 `main` push 또는 수동 실행으로 테스트·빌드·Pages 배포·공개 사이트 검증을 진행합니다.

## 4. 테스트 실행 결과

- `npm test`: **3개 파일, 18개 테스트 통과**.
- `npm run build`: **TypeScript 오류 0, Vite production build 성공**. 브라우저 trainer Worker는 TF.js를 포함하여 약 1.61 MB(압축 전)입니다.
- `npm run test:e2e`: **Chromium 4개 테스트 통과, 22.2초**. 편집·저장, 단독/동시 학습, pause/resume/stop, 추론 모델·PPO 체크포인트 저장, 새로고침 복원, 다른 맵 평가, 체크포인트 재개, 손상 import 차단, 390px 모바일 가로 넘침 없음. 직접 Worker 테스트로 속도 변경, snapshot 요청, RESET 후 빈 snapshot 오류, 오래된 session 명령 차단을 확인했습니다.
- `node scripts/verify-static.mjs`: **PASS**. `dist`를 `/EvoTrack/`에 마운트하고 상대 자산, bundled GA Worker 학습, hash route 새로고침, 9개 예제 맵, 외부 요청 0·브라우저 오류 0을 확인했습니다.
- 실제 화면: `docs/results/desktop.png`, `docs/results/mobile.png`. 스크린샷은 테스트 실행 중 실제 데이터입니다.

## 5. 실제 학습 측정

`npm run validate:learning` 실행 결과. 학습 시드 42, GA 24개체·12세대, PPO 256-step rollout·30업데이트, horizon 420. 평가는 101/202/303 시드에서 greedy 정책을 고정하여 실행했습니다. Racing은 직선 예제, Bounce는 첫 예제에서 장애물을 제거한 평지 기준 코스입니다. 시드 변화가 Racing의 정적 지형을 바꾸지는 않습니다.

| 환경        | 알고리즘 | 초기 평균 보상 | 최종 평균 보상 | 최종 성공률 | 학습 상호작용 수 | 측정 시간 |
| ----------- | -------- | -------------: | -------------: | ----------: | ---------------: | --------: |
| Racing 직선 | GA       |         -2.520 |         58.879 |         3/3 |           76,394 |    23.12s |
| Racing 직선 | PPO      |         -2.520 |         58.880 |         3/3 |            7,680 |    10.24s |
| Bounce 평지 | GA       |         20.205 |         51.163 |         3/3 |           95,567 |     1.60s |
| Bounce 평지 | PPO      |         20.205 |         50.078 |         3/3 |            7,680 |     8.25s |

원본은 `docs/results/learning-validation.json`입니다. 시간은 해당 기기의 순수 JS/TF.js CPU 경로 측정이며 보편적인 성능 수치가 아닙니다. 알고리즘 간 동일한 계산 예산 실험도 아닙니다. 작은 기준 문제에서 실제 개선을 확인했으며 일반화 성능의 증거로 해석하지 않습니다.

## 6. 발견하여 수정한 문제

- PATH에 Node/Git이 없어 Program Files의 실행 파일로 실행했습니다.
- npm 다운로드 및 esbuild 상위 디렉터리 탐색이 샌드박스에서 차단되어 해당 설치·검증 명령을 승인된 확장 실행으로 수행했습니다.
- 기본 개발 포트 5173은 다른 프로젝트가 사용 중이었습니다. 이를 종료하지 않고 E2E 전용 5187로 분리했습니다.
- 최초 Worker 학습 시 Vite의 TF.js 지연 의존성 최적화가 전체 화면을 새로고침했습니다. TF.js 사전 번들링으로 수정한 뒤 전체 E2E가 통과했습니다.
- 체크포인트 재개가 현재 맵 선택에 의존하던 문제를 학습 맵 사본 저장·자동 복원으로 해결했습니다.
- 맵 전환 후 이전 학습 결과가 새 맵에 겹치던 상태를 제거했습니다. 이전 세션 Worker 응답은 새 세션에 적용하지 않습니다.

## 7. 다음 개발 단계

1. quota/손상 optimizer 상태 주입, JSON 브라우저 왕복, 복합 moving-platform 충돌 테스트를 확장합니다.
2. 여러 학습 시드와 held-out 곡선·장애물 맵에서 학습량을 맞춘 장기 실험을 수행합니다.
3. 긴 generation/rollout을 작은 작업 단위로 분할하여 큰 설정에서도 pause 지연을 줄입니다.
4. GPU backend와 저사양 모바일 장시간 프로파일링, 전체 백업 복원 UX를 보완합니다.
5. 승인된 `oyueo-mm/EvoTrack` 공개 배포를 진행하고 실제 Pages URL에서 동일한 UI 검증을 수행합니다.

## 8. Git 상태

초기 폴더에는 저장소가 없어 로컬 `git init`을 수행했습니다. 배포 전 원격 `https://github.com/oyueo-mm/EvoTrack.git`의 브랜치·커밋이 비어 있음을 확인했습니다. 기존 로컬 저장소를 사용하고 `main`에 첫 커밋 `feat: release EvoTrack v0.1`을 생성하여 일반 push로 업로드합니다. force push는 사용하지 않습니다. 커밋 후보는 소스·설정·문서·공개 검증 지표와 문서 스크린샷으로 한정하며, 의존성·빌드물·개인 파일·인증 정보·임시 학습 자료는 제외합니다. 샌드박스 소유권 차이는 명령 한정 `safe.directory`로 처리하고 글로벌 Git 설정은 변경하지 않습니다.

## 9. 배포 상태

배포 대상은 [https://oyueo-mm.github.io/EvoTrack/](https://oyueo-mm.github.io/EvoTrack/)입니다. GitHub Pages source는 GitHub Actions(`workflow`)를 사용합니다. `build` job은 단위·E2E 테스트와 타입 검사·정적 빌드를 실행하고, `deploy` job은 Pages에 배포하며, `verify` job은 공개 URL에서 UI 테스트를 실행합니다. 배포 브라우저 결과와 자산 로딩 기록은 `pages-browser-verification` Actions artifact에 남깁니다. 로컬 보고서는 `.cache/deployment-qa/`에 저장하고 커밋하지 않습니다.

### 배포 검증 확장

배포 전 재실행 결과: 독립 TypeScript 검사 통과, Vitest 18개 통과, Playwright 5개 통과(36.3초), `/EvoTrack/` production build 성공(21.93초). 기존 기록의 E2E 4개에 GA 저장·복원·JSON 왕복 검증을 1개 추가했습니다. 커밋 후보 비밀 패턴 검사에서 토큰·개인 키·금지 경로가 발견되지 않았습니다.

- 개발·정적·공개 실행 경로를 `/EvoTrack/`로 일치시켰습니다.
- Pages에서도 사용할 수 있도록 Playwright의 `EVOTRACK_BASE_URL`을 추가했습니다.
- 기존 테스트에 GA 추론 모델 JSON export/import, 새로고침 후 맵 불러오기, GA 체크포인트의 저장된 맵·스텝 복원을 추가했습니다.
- 공개 검증에서는 개발 소스 전용 RPC 테스트 1개를 명시적으로 skip합니다. Worker와 TensorFlow.js 동작은 GA·PPO·동시 학습과 PPO/GA 체크포인트 재개로 검증합니다.
- `/EvoTrack/assets/`의 HTTP 실패, 요청 실패, 브라우저 예외를 모든 브라우저 테스트에서 수집하고 실패로 처리합니다.
