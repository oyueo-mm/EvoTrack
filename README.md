# EvoTrack

[![Pages deployment](https://github.com/oyueo-mm/EvoTrack/actions/workflows/pages.yml/badge.svg)](https://github.com/oyueo-mm/EvoTrack/actions/workflows/pages.yml)

- 웹사이트: [oyueo-mm.github.io/EvoTrack](https://oyueo-mm.github.io/EvoTrack/)
- 저장소: [oyueo-mm/EvoTrack](https://github.com/oyueo-mm/EvoTrack)

브라우저 내부에서 Racing/Bounce 환경의 신경망을 학습하는 로컬 우선 실험실. React, TypeScript, Vite, Tailwind CSS, Canvas 2D, TensorFlow.js, Web Workers, IndexedDB를 사용합니다. 백엔드나 학습 API가 없습니다.

```sh
npm install
npm run dev
```

Windows에서 Node가 PATH에 없다면:

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

실험실에서 환경과 예제 맵을 선택하고 GA, PPO 또는 GA + PPO를 실행하세요. 맵 에디터는 도로 그리기, 객체 배치·이동·속성 수정, 시작/결승/체크포인트, 실행 취소·다시 실행, 확대와 화면 이동을 제공합니다. 학습 중 맵 변경은 제한됩니다. 설정 패널에서 표시 옵션과 학습 설정을 변경할 수 있습니다.

UI/UX 개선: 학습 배속은 **0.5×~10× 슬라이더**와 1/2/5× 프리셋으로 조절합니다. `설정 기본값 복원`은 입력값만, `세션 초기화`는 중지된 학습의 결과만 비웁니다. 저장된 맵·모델은 유지합니다.

에디터에서 도로 두께(30~300px)를 조절하고, 반경 조절 지우개로 도로·체크포인트·시작·결승점·장애물을 삭제할 수 있습니다. 휠/핀치로 확대·축소, Space+드래그 또는 손 도구로 이동하고 미니맵에서 전체 위치를 확인하세요. `테스트 실행`은 실제 물리 환경을 방향키/Space/터치 버튼으로 조작하며 학습 가중치를 변경하지 않습니다. 삭제 후 미완성 맵은 실행·저장 전에 이유를 표시합니다. 자세한 변경 내용은 [UI/UX 개선 보고서](docs/UI_UX_REDESIGN.md)를 확인하세요.

추론용 모델은 가중치만 저장합니다. 체크포인트는 GA 개체군/RNG 또는 PPO actor/critic/Adam/RNG를 포함합니다. **PPO는 rollout 종료 후 다음 에피소드 경계에서 재개하며, 중간 에피소드 복원은 지원하지 않습니다.** 단순 가중치로 새 학습을 시작하는 기능과 구분되어 있습니다. 같은 맵의 체크포인트를 재개하고, 다른 맵은 모델 라이브러리의 평가로 실행하세요. 평가는 Worker에서 정책을 고정한 채 3개 시드를 사용합니다.

맵·모델·실험은 이 브라우저의 IndexedDB에 저장됩니다. 중요한 데이터는 개별 JSON 내보내기로 보관하세요. 데이터 백업은 전체 보관용 JSON이며 전체 백업의 일괄 복원은 아직 제공하지 않습니다. 브라우저 데이터를 지우면 로컬 기록도 삭제됩니다.

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

공개 사이트를 직접 검증하려면 다음 명령을 사용합니다. 이 설정은 로컬 서버를 시작하지 않습니다. 개발 소스 전용 Worker 프로토콜 테스트 1개는 배포 검사에서 제외되며, 실제 Worker 실행·일시정지·저장·재개는 UI 테스트로 확인합니다.

```powershell
$env:EVOTRACK_BASE_URL = 'https://oyueo-mm.github.io/EvoTrack/'
npm run test:e2e
```

테스트는 별도 Chromium 컨텍스트에서 생성한 자료만 사용하고 사용자의 실제 브라우저 프로필은 열지 않습니다. 로컬 및 공개 사이트의 IndexedDB는 서로 다른 origin에 저장됩니다. `.env`, 인증 키, 캐시, 테스트 결과, 개인 exports/checkpoints/training-data는 Git에서 제외합니다.
