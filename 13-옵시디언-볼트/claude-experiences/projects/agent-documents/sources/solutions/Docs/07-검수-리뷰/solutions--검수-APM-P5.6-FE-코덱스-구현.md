## 구현 완료

`p56-async` / `ac84fa0`를 유지하고 **파일만 수정**했습니다. 본 트리·`_workspace`·BE 표본 JSON은 변경하지 않았습니다.

### 구현 내용

| 항목 | 구현 |
|---|---|
| 링크 탐색 | 행 팝오버와 상세 패널에서 공통 목록 사용. 같은 trace 이동 시 조상 펼침·가시 행 스크롤·포커스·1.5초 강조. 선택한 관계선 하나만 표시 |
| 부모 종료 이후 표시 | `> parentEnd + 1ms` 판정, 정확한 해칭 길이, 부모 종료선·`⇢`·툴팁 |
| 관련 스팬 필터 | `?asyncOnly=1`, 관련 스팬과 조상 유지. 해제 시 기존 선택·스크롤·접힘 복원, 탭 왕복 지원 |
| 요약·복귀·오류 | 응답 기준 링크 개수·잘림·빈 상태, `from*` 복귀, 미발견/403/기타 오류 분기 |
| kind 자기 시간 | 선택 항목 구현. DTO `selfMs` 합산, 표시된 스팬 기준 비율, 합계 0 처리 |
| 메시징 연결 | 실제 경로·`msgDest/msgSystem/msgService`·시간 범위 전달, lagCount 도움말 보완 |
| 순수 함수 | `apmAsyncMarks`, `apmAsyncSummary` 및 결정적 fixture 테스트 |
| 도움말·접근성 | 링크 상한·속성 제한·관측 한계 안내, 키보드 탐색·다크 모드·reduced-motion 확인 |

## 변경 파일

경로는 worktree 기준입니다.

**수정 12개**

- `src/constants/apm.ts`
- `src/locales/{kr,en}.json`
- `src/pages/application-monitoring/shared/components/ApmHelp.tsx`
- `src/pages/application-monitoring/traces/ApmTraceDetailPage.tsx`
- `src/pages/application-monitoring/traces/waterfall/`
  - `ApmSpanDetailPanel.tsx`
  - `ApmTraceWaterfall.tsx`
  - `ApmWaterfallBar.tsx`
  - `apmWaterfall.ts`
- `src/__tests__/`
  - `apmHelpContent.test.ts`
  - `apmCollectorHooks.test.ts`
  - `ApmAlertRulesPage.test.tsx`

**신규 9개**

- `src/pages/application-monitoring/traces/waterfall/`
  - `apmAsync.ts`
  - `useApmAsyncNavigation.ts`
  - `ApmSpanLinks.tsx`
  - `ApmAsyncKindShare.tsx`
  - `apm-async.scss`
- `src/pages/application-monitoring/traces/__tests__/`
  - `asyncFixture.ts`
  - `apmAsync.test.ts`
  - `ApmAsyncWaterfall.test.tsx`
  - `ApmAsyncDetail.test.tsx`

## 구현 판단·정본 보완점

- DTO에 없는 trace 식별자·불확실성 플래그는 상위 detail에서 투영했습니다. DTO 변경은 없습니다.
- `rootMissing`·`cycleBroken` 응답은 부모 종료 비교를 보수적으로 제외합니다.
- 필터 밖 링크 대상으로 이동하면 대상과 조상을 임시 표시하고 이유를 안내합니다.
- 메시징 식별값이 부족하면 집계 이동 대신 안내를 표시합니다.
- 회귀 검증 중 기존 테스트도 보완했습니다: 도움말 키 등록, 기준 커밋부터 존재한 설치 경로 쿼리 키 기대값 추가, 알림 검증 메시지 대기 1→5초. 제품의 알림·수집기 로직은 변경하지 않았습니다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| `jest src/pages/application-monitoring/traces` | **3 스위트 / 40개 통과** |
| `jest src/pages/application-monitoring` | **3 스위트 / 40개 통과** |
| 기존 트레이스·도움말·수집기 훅 | **5 스위트 / 120개 통과** |
| RUM 색상·알림 경계 선별 재검증 | **4개 통과** |
| `npx tsc --noEmit` | 통과 |
| `npm run typecheck:contract` | 통과 |
| 변경 TypeScript 파일 ESLint | **18개 / 0 warnings** |
| `git diff --check` | 통과 |
| locales | 언어별 문자열 **27개 추가·5개 수정**, 기존 구조·순서 보존 |

**확장 APM 회귀:** 51개 스위트·1,152개 테스트를 실행했습니다. 최초 결과는 **1,145개 통과·7개 실패**였으며, 수정 후 실패 범위를 재검증해 **최신 결과 합산 1,152개 모두 통과**했습니다. 이는 전체 실행과 부분 재검증의 합산이며, 단일 전체 재실행 결과는 아닙니다.

확장 실행은 기본 20초에서 Collector timeout이 발생해 `--testTimeout=60000`으로 완주했습니다. 요청 경로 검사와 최종 부분 재검증은 기본 20초 조건입니다.

## 보류·검수 위험

- **P5.6b는 미구현**입니다.
- **출시 게이트 R-P5.6은 미완료**입니다. Collector→BE→DB→API 보존 경로와 자동계측 생성 여부는 이번 FE 작업에서 검증하지 않았습니다.
- 최적화된 FE fixture의 5,000스팬·160,000링크 측정: 조작 최대 **157.2ms**, 최장 UI 작업 **210ms**, 최초 전환 **239.5ms**. 최초 전환은 잠정 200ms 기준을 넘었습니다.
- 라이트·다크·키보드·가상 스크롤은 브라우저에서 확인했습니다. 해칭 대비의 정량 검수와 실제 앱 연결 검수는 남았습니다.
- `TriggerFormDrawer`·`AiAssistantPage`는 수정하거나 재검증하지 않았습니다.
