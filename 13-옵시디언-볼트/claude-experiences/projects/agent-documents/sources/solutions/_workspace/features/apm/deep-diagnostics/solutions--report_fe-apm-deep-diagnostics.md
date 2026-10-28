# APM 심층 진단 FE 구현

2026-10-28. 작업 위치 `C:\worktrees\apm-deep-fe`. API 정본은 같은 폴더의 `contract_apm-deep-diagnostics.md` v1이다.

## 구현

- `types/apmDiagnostics.ts` → `services/apmDiagnostics.api.ts` → `hooks/useApmDiagnostics.ts` → 기존 trace 상세의 진단 탭을 연결했다. 새 메뉴는 없다.
- APM 조회 권한과 BE capability `queryEnabled`가 모두 참인 경우에만 탭을 노출한다. 조회는 활성 진단 탭에서만 실행하며 body 오류·동시 조회 제한에 자동 재시도하지 않는다.
- SERVER 후보는 BE 응답을 소비한다. 선택 이후에도 후보를 바꿀 수 있고 `diagnosticSpan`과 기존 waterfall의 `span`을 분리한다. 탭/대상/SQL 이동은 history를 남기며 비동기 다른 trace 복귀에 진단 대상을 추가 보존한다.
- 획득 구간은 별도 클릭 가능한 타임라인이다. 기존 waterfall/flame/critical path에 합치지 않는다. SQL/HTTP 구간은 기존 waterfall로 이동한다.
- 직접 관측/주변 정황, 자료 가용성/사유, summary 없음과 0회, 합집합 하한·누적 시간·상세 생략을 구분한다. runtime은 원래 60초 버킷·null을 유지하고 모든 카드에 프로세스 재시작 미분리와 요청별 CPU/GC가 아님을 표시한다.
- 조사 후보는 규칙 버전과 근거 이동을 제공한다. 사용할 수 없는 JFR/로그/DBM 버튼을 만들지 않는다. 한국어/영어 문구와 기존 APM 도움말/차트 컴포넌트를 재사용한다.

## 검증 현황

- 최종 증분 재검증: `zm157PermissionUi.test.tsx` + `apmDiagnostics.test.tsx` **2 suites / 41 tests 통과**. `APM_DIAG_DISABLED` 자체 안내와 일반 APM 403 권한 이벤트를 구분하는 회귀를 포함한다.

- 독립 `npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund` 완료. 실제 레포에 `yarn.lock`이 없고 `package-lock.json`만 있어 잠금파일을 유지했다. React 19와 기존 react-helmet-async의 peer 제약 때문에 legacy-peer-deps를 적용했다. 패키지/lock 변경 없음.
- 새 Jest 회귀: 실제 API service→query envelope 언랩, 대상별 query key, 직접 URL/대상 전환/뒤로가기/비동기 복귀, runtime 부분 실패, null/0, 429/게이트, 기존 trace 상호작용 회귀를 준비했다.
- `node --max-old-space-size=1024 node_modules/typescript/bin/tsc --noEmit`은 약 162초 후 heap 한도 초과로 종료됐다. root 자원 확인 후 승인한 2GiB 한도의 같은 전체 타입 검사는 통과했다.
- `npx --no-install jest --runInBand --runTestsByPath`로 새 진단 및 기존 trace/async **5개 스위트, 120개 테스트가 통과**했다(exit 0, 603.103초). 첫 독립 설치 뒤 변환/로딩 시간이 길었으며 실행 중 메모리 증가를 추적했다.
- 실행 대상: `apmDiagnostics.test.tsx`, `apmTraces.test.ts`, `apmTraceScreens.test.tsx`, `apmAsync.test.ts`, `ApmAsyncDetail.test.tsx`.
- 테스트 완료 후 BE의 마지막 계약 증분인 `ruleThresholds` 필수 타입/fixture와 `METRIC_SEMANTICS_UNVERIFIED` 한·영 문구를 추가했다. 이 증분은 화면 동작을 바꾸지 않으며 런타임 재검증은 후속 단계에서 수행한다.
- 원본 FE, 공유 FE5173/BE3000/DB/Collector, COLLAB 상태는 변경하지 않았다. 커밋/병합/푸시 없음.

## 잔여

1. 분리 BE3301 연결과 FE5271 strictPort에서 실제 브라우저 행위 검증. root의 Vite 기동 지시 대기 중이며 공유 포트는 사용하지 않는다.
2. BE 최종 runtime 슬롯/단위: CPU(%)/GC(ms)/pool(count) 6슬롯. FE는 BE가 반환한 series만 표시하고 값을 다시 변환하지 않는다. 메모리·스레드는 사유만 안내한다.
3. 최종 계약 증분을 포함한 경계면 QA. 운영 BE/FE에 아직 적용하지 않았으며 production bundle 빌드는 자원 조율로 실행하지 않았다.
