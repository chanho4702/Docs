**반영 완료: 🔴 2건·🟡 12건. 요청한 검증을 모두 통과했습니다.**

## 항목별 반영

| 항목 | 반영 내용·근거 |
|---|---|
| 🔴-1 | 메시징 이동을 Router `Link`로 변경. 클릭의 `preventDefault`·history push·뒤로가기를 검증했습니다. [구현:121](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/waterfall/ApmSpanDetailPanel.tsx:121), [테스트:153](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/__tests__/ApmAsyncDetail.test.tsx:153) |
| 🔴-2 | 부모가 누락·절단된 스팬만 제외하고 정상 자식은 판정합니다. `불확실` 배지·툴팁, `판정 안 함 N`, 빈 상태 보충 문구를 추가했습니다. [판정:58](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/waterfall/apmAsync.ts:58), [요약:256](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/waterfall/ApmTraceWaterfall.tsx:256), [배지:630](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/waterfall/ApmTraceWaterfall.tsx:630), [테스트:110](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/__tests__/apmAsync.test.ts:110) |
| Y-1 | 실제 막대 기하에 맞춰 해칭 위치·폭 계산. 최소 폭·좌측 당김과 **50% 비포화 기대값**을 검증합니다. [구현:26](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/waterfall/ApmWaterfallBar.tsx:26), [테스트:220](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/__tests__/ApmAsyncWaterfall.test.tsx:220) |
| Y-2 | 필터·다른 trace는 push, span 선택은 replace 유지. 기존 옵션을 사용하며 뒤로·앞으로 복원을 검증했습니다. [구현:294](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/ApmTraceDetailPage.tsx:294), [테스트:190](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/__tests__/ApmAsyncDetail.test.tsx:190) |
| Y-3 | jsdom CSS 삽입·모션 비용, 불필요한 비동기 대기와 중복 검증을 줄였습니다. 실제 Router·패널·워터폴은 유지했습니다. [테스트 설정:117](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/__tests__/ApmAsyncDetail.test.tsx:117) |
| Y-4 | 상세 본문을 `trace_async_marks`로 통합. 나머지는 요약·참조로 변경하고 계약 상수 중복을 제거했습니다. [kr:719](/C:/solutions/moveseyee_fe-p56/src/locales/kr.json:719), [en:719](/C:/solutions/moveseyee_fe-p56/src/locales/en.json:719) |
| Y-5 | `{{count}}` → `{{limit}}`. [ApmSpanLinks:41](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/waterfall/ApmSpanLinks.tsx:41) |
| Y-6 | `missingTarget`·관계 행·전체 시간 범위 memo, 관계 없음 조기 반환, 스크롤 rAF throttle·취소 처리. [스크롤:59](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/waterfall/useApmAsyncNavigation.ts:59), [관계 행:176](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/waterfall/ApmTraceWaterfall.tsx:176) |
| Y-7 | 관계선 SVG를 viewport 높이로 제한하고 y를 상대 좌표로 변경. [워터폴:378](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/waterfall/ApmTraceWaterfall.tsx:378) |
| Y-8 | `⇢`에 `role="img"` 추가. [워터폴:535](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/waterfall/ApmTraceWaterfall.tsx:535) |
| Y-10 | 복귀 필터가 꺼져 있으면 `asyncOnly` 생략. [apmAsync:168](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/waterfall/apmAsync.ts:168) |
| Y-11 | 관련 0건 체크박스 disabled·툴팁. [워터폴:278](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/waterfall/ApmTraceWaterfall.tsx:278) |
| Y-12 | 행 선택 시 누락 대상 안내 해제. [navigation:87](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/waterfall/useApmAsyncNavigation.ts:87) |
| Y-13 | 링크 key를 `traceId/spanId`로 변경. [ApmSpanLinks:50](/C:/solutions/moveseyee_fe-p56/src/pages/application-monitoring/traces/waterfall/ApmSpanLinks.tsx:50) |

**미반영:** Y-9 포맷 분리는 지시대로 Claude 병합 작업에 남겼습니다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| 지정 Jest 단독 (`--runInBand`) | **5 스위트·89개 통과**, 32.410초 — 명령 전체 34.298초 |
| 지정 Jest 기본 병렬 | **5 스위트·89개 통과**, 23.165초 — 명령 전체 24.840초 |
| `ApmAsyncDetail` | 단독 **11.401초**, 병렬 **18.234초**; 병렬 케이스 평균 0.702초·최대 2.185초 |
| `npx tsc --noEmit` | 통과, 38.75초 |
| `npm run typecheck:contract` | 통과, 38.52초 |
| 변경 TypeScript 파일 ESLint | **18개, 오류·경고 0건** |
| `git diff --check` | 통과 |

`--testTimeout` 및 timeout 설정 변경은 없습니다.

## Y-6 재측정

Production build, Chromium 148, 1440×1000, **5,000스팬·160,000링크** 기준입니다.

| 측정 | 결과 |
|---|---:|
| 최초 전환 | **77.0ms** |
| 필터 켜기·끄기 최대 | **56.2 / 31.3ms** |
| 스크롤 최대 | **49.7ms** |
| 링크 점프 최대 | **46.6ms** |
| 최장 main-thread 작업 | **64.0ms** |
| 렌더된 행 / 브라우저 오류 | **26행 / 0건** |

필터·점프 각 10회, 스크롤 20회 측정했습니다. 격리된 FE fixture 결과이며 R-P5.6 전체 출시 게이트 판정을 대체하지 않습니다.

`p56-async`를 유지했고 금지된 Git 명령은 실행하지 않았습니다. 임시 산출물은 `%TEMP%`에만 두었습니다.
