# APM P4 RUM FE 검수 메모

브랜치: `p4-rum-fe`. 커밋·푸시·개발 서버·브라우저 실행 없음.
정본: `C:\solutions\_workspace\features\apm\core\contract_apm-p4.md` (2026-09-08 재확인).

## 계약 §🔄 전달 요청

작업 디렉터리 밖 쓰기 금지 지시에 따라 정본을 직접 수정하지 않고 요청을 이 worktree에 기록한다. 아래 항목은 정본 §🔄에 전달·반영해야 한다.

1. **페이지별 TTFB p75**: `PageRow`에는 LCP/INP/CLS만 있다. `ttfbP75Ms: number|null` 및 원본 `rum-pages.json`/`rum-detail.json` 갱신이 필요하다. 전체 페이지 TTFB를 행마다 복제하지 않는다. 현재 열은 미제공 안내와 `—`다.
2. **상세 p75 시계열**: `Detail.series`의 `Point`는 `ts/pv/sessions`만 있다. 버킷별 Web Vitals 배열(단위·p75·mixedBounds·rebucketed·exceedsTopBound 포함)과 시각을 가진 DTO/표본이 필요하다. 현재 전체 창 p75 카드와 PV·세션 추이를 표시하며 p75 추이를 만들지 않는다.
3. **페이지 p75 하한 여부**: `Vital.exceedsTopBound`는 있지만 `PageRow`의 개별 p75에는 해당 플래그가 없다. 페이지 목록에서도 상한 초과 p75를 정확하게 표시하려면 지표별 플래그가 필요하다. 상세 Vital 카드는 `≥`로 표시한다.
4. **표본 보완**: 현재 `rum-detail.json`에는 resource timing 한 건, null stack, 빈 traceIds만 있다. navigation timing/스택/실제 Browser→server 트레이스와 `rum-snippet.json`, 최근·이력 K8s 표본을 BE 직렬화 fixture로 제공하면 계약 게이트에 추가할 수 있다. 해당 UI 동작은 별도 단위 테스트로 검증한다.

## 구현 범위

- 메뉴 11 목록 및 `/rum/pages/:groupId` 상세. 경로 검색·환경 분류·선택 timing·기간은 URL 상태를 사용한다.
- 4개 Web Vitals 분포, 페이지 그룹 표, PV·세션 추이, browser/os/geo 도넛과 차트↔표 전환.
- 집계 평균 timing 워터폴은 C7 시간 좌표/막대 부품을 공유한다. 리소스 상위 표·JS 오류 스택 복사·실제 백엔드 trace 링크.
- 수집기의 브라우저(RUM) 탭: 공개 토큰 1회 모달, 목록·회수, 정확 origin allowlist 편집, 스니펫·CSP·동의·전파·공식 문서 링크.
- 트레이스 Browser 행의 계약 속성 식별·회색 표시. 서비스 맵 BROWSER는 계약상 제외.
- 인스턴스 K8s 파드/노드/네임스페이스·재시작 횟수·최근/이력 배지와 원 관측 시각 툴팁. Collector 생성/발급 옵션의 Kubernetes 구성 노출.
- kr/en은 텍스트 삽입만 수행했으며 기존 모든 키와 값이 보존됨을 대조했다.

## 주요 변경·신규 파일

| 구분 | 파일 |
|---|---|
| RUM 페이지·공통 표시 | `src/pages/application-monitoring/rum/` (신규 9개) |
| RUM API·타입·쿼리 | `src/types/apmRum.ts`, `src/services/apmRum.api.ts`, `src/hooks/useApmRum.ts`, `src/constants/apmRum.ts`, `src/constants/queryKey.ts` |
| 브라우저 수집 설정 | `collectors/tabs/ApmCollectorRumTab.tsx`, `collectors/components/ApmRumSnippetGuide.tsx` 신규; `ApmCollectorsPage.tsx`, `ApmTokenSecretModal.tsx` 수정 |
| K8s | `services/components/ApmKubernetesBadges.tsx` 신규; `services/detail/tabs/ApmServiceInstancesTab.tsx`, `ApmTokenIssueDrawer.tsx`, `ApmCollectorTokensTab.tsx`, `src/types/apm.ts` 수정 |
| Browser 스팬 | `traces/waterfall/ApmWaterfallBar.tsx` 신규; `ApmTraceWaterfall.tsx`, `apmWaterfall.ts` 수정 |
| 진입점·도움말 | `routes/routes.tsx`, `constants/{apm,routes,page-guide,breadcrumbSegments,navSearchEntries}.ts`, 데스크톱·모바일 SideNav, kr/en locale |
| 테스트·계약 표본 | `ApmRumScreens.test.tsx`, `apmRumContract.test.ts`, `fixtures/apmRumContractSample.ts`, `fixtures/apm-rum/*.json` 신규; 기존 라우트·권한·도움말·수집기 테스트 및 `fixtures/apmContractSample.ts` 수정 |

경로가 축약된 화면 파일은 `src/pages/application-monitoring/`, 테스트는 `src/__tests__/` 기준이다.

## 검증 결과

- `npm.cmd run typecheck:contract`: 통과.
- BE JSON 원문 10개: byte 단위 동일성 확인.
- `tsc --noEmit`: 통과.
- 신규 TS/TSX 전체 ESLint: 오류·경고 0건.
- kr/en: 각 189줄 삽입, 기존 줄 삭제 0. 신규 leaf key 133개 대칭, 기존 모든 값 보존, 중복 키 없음.
- 관련 9 suites의 **최종 결과: 248개 전부 통과**. 신규 RUM 테스트 2 suites의 51개를 포함한다. 전체 실행에서 통과한 관련 스위트와 실패 후 재실행한 스위트의 최신 결과를 합산했다.
- 전체 Jest 1회: **236 suites / 2,711 tests, 231 suites·2,701 tests 통과, 5 suites·10 tests 실패**, 1,713.951초. 옵션은 `--silent --maxWorkers=2`다.
- 전체 실행의 APM 도움말·권한 기대 목록/개수, Windows 줄바꿈 비교 실패는 수정 후 통과했다. 도움말 재실행에서 발견한 설명 4줄 규약도 신규 문구만 보완하여 통과했다.
- 전체 실행의 RUM 원문 모달 테스트 1건은 20초 타임아웃이었으며, **시간 제한을 늘리지 않고** 별도 재실행에서 통과했다. 대규모 병렬 실행에서는 부하에 따른 재발 가능성이 있다.
- 남은 선재 실패: `TriggerFormDrawer` 1건(API 오류 원문 대신 `api_error.default`), `AiAssistantPage` 1건(새 대화의 `?c=c-new` URL 반영). 두 구현은 수정하지 않았다.
- `git diff --check`: 통과. 커밋·푸시·개발 서버·브라우저 실행 없음.

최종 관련 스위트별 결과:

| 스위트 | 통과 | 최종 보고서 |
|---|---:|---|
| `ApmCollectorTokensTab` | 43 | `jest-full.json` |
| `ApmCollectorsPage` | 43 | `jest-full.json` |
| `ApmRumScreens` | 20 | `jest-related-final.json` |
| `ApmServiceInstancesTab` | 13 | `jest-full.json` |
| `apmAdminGating` | 24 | `jest-related-final.json` |
| `apmHelpContent` | 16 | `jest-help-final.json` |
| `apmRoutes` | 39 | `jest-full.json` |
| `apmRumContract` | 31 | `jest-help-final.json` |
| `apmTraceScreens` | 19 | `jest-full.json` |

보고서와 동일 이름의 `.log`는 `C:\Users\DMOVE\AppData\Local\Temp\claude\C--solutions\73f0e76e-73ad-4f5f-b22e-ed7729545a96\scratchpad\codex-p4\fe\`에 있다. 전체 재실행은 하지 않았다.

## 통합 검증 필요

- 사용자 지시에 따라 실브라우저/CORS/CSP/동의 철회/실 K8s 클러스터는 실행하지 않았다.
- BE 스니펫의 정확한 SDK 버전 조합·브라우저 번들은 계약에도 미검증으로 명시되어 있다.
- 일부 요청은 조회 상한으로 절단될 수 있다. 화면에 partial 배지와 실제 집계 창을 표시한다.
