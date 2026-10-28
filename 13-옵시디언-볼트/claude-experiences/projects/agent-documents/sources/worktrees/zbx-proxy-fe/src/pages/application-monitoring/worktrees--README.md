# application-monitoring — 폴더 규칙

APM 화면 소스는 **사이드바 메뉴 단위**로 나눈다. 기술 레이어(components/·tabs/)가 아니라 **어느 메뉴에 속하느냐**가 1차 기준이다.

```
application-monitoring/
├── overview/       개요            /application-monitoring/overview
├── services/       서비스(목록·상세)  /application-monitoring/services[/:serviceUid]
│   └── detail/tabs/   상세 화면 탭 5개
├── service-map/    서비스 맵         /application-monitoring/service-map
│   ├── nodes/         React Flow 커스텀 노드 + 모양 규칙
│   └── apmServiceMapGraph.ts  계약 → RF 노드/엣지 + dagre 좌표(순수)
├── traces/         트레이스 탐색      /application-monitoring/traces[/:traceId]
├── errors/         에러 분석 본체     /application-monitoring/errors → /incidents?tab=errors 리다이렉트(2026-10-08)
├── incidents/      장애 및 에러       /application-monitoring/incidents     알람·요청 걸림·에러 분석 탭(사이드바, apm.view)
├── db/             DB 호출 분석      /application-monitoring/db-calls      (사이드바 비노출)
├── dependencies/   외부 호출 분석     /application-monitoring/dependencies  (사이드바 비노출)
├── synthetics/     합성 감시         (플레이스홀더)
├── collectors/     수집기           /application-monitoring/collectors
├── alert-rules/    알람 규칙         /setting/apm/alert-rules             (관리 콘솔, 규칙·Zabbix 탭만 — 이력·걸림은 incidents/)
├── planned/        P3~P4 미착수 3화면 (Messaging·Slo·Rum)
└── shared/         두 메뉴 이상이 쓰는 것만
```

**사이드바 비노출 화면(errors·db·dependencies)도 자기 폴더를 갖는다.** 진입 경로가 메뉴가
아니라 서비스 상세 탭·전역 검색일 뿐, 화면의 크기와 소유 관계는 노출 화면과 같다. 그리고 각
폴더의 `components/Apm*Explorer.tsx`가 **전용 화면과 서비스 상세 탭 양쪽의 본체**다 — 탭은
`fixedServiceUid`만 넘기는 3줄짜리 래퍼다(`services/detail/tabs/`).

```
```

각 메뉴 폴더의 내부 형태는 동일하다 — `Apm*Page.tsx`(라우트 진입점) · `components/`(그 메뉴 전용 UI) · `tabs/`(탭 화면) · `*.ts`(그 메뉴 전용 표시 유틸).

## 새 파일을 어디에 넣나 — 판정 기준 하나

> **두 개 이상의 메뉴가 import 하면 `shared/`, 한 메뉴만 쓰면 그 메뉴 폴더.**

추측하지 말고 실제 import 그래프로 판정한다. 한 메뉴 전용으로 만들었다가 나중에 다른 메뉴가 쓰기 시작하면 그때 `shared/`로 올린다(미리 올려두지 않는다).

`shared/`에 현재 있는 것과 그 근거:

| 파일 | 쓰는 메뉴 |
|---|---|
| `shared/components/ApmToolbar.tsx` | overview · services · collectors · alert-rules |
| `shared/components/ApmHelp.tsx` | overview · services · collectors · alert-rules (+ ApmChartCard) |
| `shared/components/ApmChartCard.tsx` | overview · services · collectors · alert-rules |
| `shared/components/ApmPlaceholder.tsx` | overview · services · service-map · traces · synthetics · planned |
| `shared/components/ApmOnboardingEmpty.tsx` | overview · services |
| `shared/apmDisplay.ts` | 전 메뉴 |
| `shared/apmChartTable.ts` | overview · services · collectors · alert-rules |
| `shared/useApmTableLabels.ts` | overview · services · collectors · alert-rules |
| `shared/apmAlertDisplay.ts` | alert-rules · overview(최근 알람 카드) |
| `shared/apmAggDisplay.ts` | service-map · errors · db · dependencies (백분위·경계 혼재·`__unrouted__` 표기) |
| `shared/components/ApmAggNotice.tsx` | service-map · errors · db · dependencies ("샘플 기준 · 집계 지연" 안내) |
| `shared/components/ApmCodeBlock.tsx` | errors(스택) · db(쿼리 전문) |

## 이 폴더 밖에 두는 것 (레포 전역 관례 — 여기로 옮기지 않는다)

| 종류 | 위치 |
|---|---|
| react-query 훅 | `src/hooks/useApm*.ts` |
| API 호출 | `src/services/apm.api.ts` |
| 타입 | `src/types/apm.ts` |
| ECharts 옵션 빌더 | `src/lib/echarts/apm*.ts` |
| 경로·상수 | `src/constants/apm.ts`, `src/constants/routes.ts` |
| 라우트 등록 | `src/routes/routes.tsx` |
| 테스트 | `src/__tests__/Apm*.test.tsx`, `apm*.test.ts` |

## 그 밖의 규칙

- **배럴(`index.ts`)을 만들지 않는다.** 이 레포는 페이지 폴더에 배럴을 쓰지 않는다(`src/pages/asset` 등 전부 직접 import).
- import 형태 — 같은 폴더 안이면 `./X`, 폴더를 넘으면 `@/pages/application-monitoring/<메뉴>/X`. 상대 경로 `../`로 메뉴 경계를 넘지 않는다(경계를 넘는 순간 눈에 보이게 하기 위함).
- `src/__tests__/apmHelpContent.test.ts`는 이 폴더의 `.tsx`를 **재귀로 전부** 훑어 `chart_help` 키를 대조한다 — 새 메뉴 폴더를 만들어도 자동으로 포함된다.
