---
type: project
tags: [project, forge, jira, rms, overview, onboarding]
created: 2026-05-30
updated: 2026-05-30
status: active
---

# Moves RMS — 프로젝트 개요 (2관점 온보딩)

> 프로젝트를 **처음 이해할 때** 보는 문서. 두 관점으로 정리 — ① 어떤 서비스인가, ② 개발 규칙·구조는 어떤가.
> 경험·결정·타임라인은 [[moves-workforce]], 코드 작업용 상세 레퍼런스는 프로젝트 내 `CLAUDE.md`.
> 로컬: `C:\CloudJira\moves-workforce` · 메인 `master` · 기능 브랜치 `RFC-NNN`

---

# 관점 ① 어떤 서비스인가

## 한 줄 정의
**Atlassian Jira Cloud용 Forge 앱 (Moves RMS).** Jira 안에 설치되어, 프로젝트의 **인력(Resource)·워크로그·공수(MM)·진척도**를 관리·분석하는 RMS(Resource Management System).

## 누구를 위한, 무엇을 푸는 도구인가
- **PM / 관리자**: 프로젝트에 누가 얼마나 투입됐고(가동률·MM), 얼마나 진척됐는지(완성도·일정)를 본다.
- **실무자**: 자기 워크로그를 기록·확인한다.
- 해결하는 문제: Jira 기본 기능엔 "프로젝트가 인력·공수 관점에서 어떤 상태인가"를 보여주는 화면이 없다 → 이 앱이 워크로그·이슈·인력 데이터를 모아 **분석 리포트와 진척도**로 가공.

## 핵심 개념 (도메인 용어)
| 용어 | 의미 |
|------|------|
| **워크로그(Worklog)** | Jira 이슈에 기록된 작업 시간. 모든 공수 계산의 원천 데이터. |
| **공수 (MD)** | Man-Day. 워크로그를 일 단위로 환산한 투입량. |
| **MM (Man-Month)** | Man-Month. `1MM = 그 달 실제 근무일(평일−공휴일)` 기준. → [[2026-05-27-mm-redesign]] |
| **가동률** | 상대 지표 = `투입MD / 가용MD`. MM(절대공수)과 **분리**해서 산출. |
| **진척도 3층** | 공수(소진율) ≠ 완성(진척) ≠ 일정(달력). 한 숫자로 합치지 않음. → [[2026-05-29-progress-page]] |

## 주요 기능 영역 (화면 기준)
- **내 워크로그** (`/myWork`) — 기본 진입. 개인 워크로그.
- **프로젝트 목록 + 칸반** (`/project`) — 프로젝트 일람, 칸반 보드.
- **프로젝트 상세** (`/project/:id`) — 탭 구성:
  - 대시보드(위젯형) · 인력 · 이슈 · 캘린더
  - 분석 리포트: **이슈 분석** / **인력(Resource) 분석**
  - **진척도(Progress)** — 공수·완성·일정 3층 + 지연 진단
- **백오피스** (`/backoffice/*`) — 사용자·권한·역할·레벨·프로젝트상태·설정·공휴일 관리.

## 데이터 흐름 (큰 그림)
```
Jira (이슈·워크로그·사용자)
   │  ← @forge/api requestJira / 커스텀 필드(projectId, coworker)
   ▼
Forge 백엔드 (resolver: 집계·MM/가동률/진척 계산)
   │  ← MySQL(프로젝트/사용자/워크로그) + KVS(설정성 데이터)
   ▼
React UI (분석 리포트·진척도·대시보드·칸반)
```

---

# 관점 ② 개발 규칙·구조

## 기술 스택
- **런타임**: Forge (Node.js 24, arm64, **256MB 제약** — 성능 설계에 직결)
- **프론트**: React 18 · React Router 7(MemoryRouter) · Zustand 5 · TanStack Query 5 · Atlaskit + `@compiled/react`
- **시각화**: ECharts · ApexCharts · FullCalendar · `@xyflow/react`(상태 플로우) · `react-grid-layout`(대시보드) · `react-kanban-kit`
- **DB**: Forge SQL(MySQL) + Forge KVS(NoSQL)
- **백엔드**: `@forge/api`·`@forge/sql`·`@forge/kvs`·`@forge/events`(큐)·`@forge/resolver` · `exceljs` · `p-limit`(동시성)
- **빌드/운영**: CRA(react-scripts) · Sentry 모니터링

## 디렉토리 맵
```
moves-workforce/
├─ src/                      # 백엔드
│  ├─ index.js               # 모든 컨트롤러 등록 지점 (★ 새 컨트롤러는 여기 등록 필수)
│  ├─ resolver/{도메인}/      # Controller/Service/(Repository) 묶음
│  ├─ rdb/                   # MySQL: query/(Query 클래스), schema/(ddl·migrate)
│  ├─ nosql/query/           # KVS: CustomEntityManager.js
│  ├─ api/jira/              # Jira REST 래퍼 (User/Issue/Worklog/TimeTracking)
│  ├─ error/ · utils/errors/ # 커스텀 에러 + ErrorCodes
│  ├─ queue/consumer.js      # 대용량 업로드 큐 소비자
│  └─ trigger/onInstall.js   # 설치 시 시드 초기화
├─ static/ui/                # 프론트 (React)
│  └─ src/
│     ├─ App.jsx             # MemoryRouter, i18n+권한 로드 후 렌더
│     ├─ pages/ · backoffice/page/
│     ├─ stores/             # Zustand (useI18nStore/usePermissionStore/useJobStore)
│     ├─ utils/queryKey/     # React Query 쿼리키 팩토리
│     └─ utils/jiraApi/      # 프론트에서 Jira 직접 호출 (jqlMaker)
├─ locales/                  # i18n (kr/·en/ 소스 → ko-KR·en-US 생성물)
└─ manifest.yml              # Forge 앱 정의
```

## 백엔드 아키텍처
계층: `index.js → Controller → Service → (Repository) → DB`. 도메인별 `src/resolver/{도메인}/`에 묶음.
- **Controller** `registerXxxController(resolver)` — resolver 함수 등록
- **Service** — 비즈니스 로직 / **Repository** — DB 접근(선택, 없으면 Service가 `rdb/query/` 직접)
- 일부 도메인은 `.jsx` 확장자(`myWork`, `mySchedule`)

## 프론트 아키텍처
- **라우팅**: `App.jsx`의 MemoryRouter. **i18n 초기화 + 권한 로드가 끝나야** 화면 렌더.
- **상태**: Zustand(`t()`·권한·잡추적) + React Query(서버 상태).
- **백엔드 호출**: `invoke('fnName', params)` → `{ success, content, error }`. `result.content`에서 데이터 추출, `result.success`로 분기.

## ★ 불변 개발 규칙 (이것만은 지킨다)
1. **responseWrapper 필수** — 모든 resolver는 `src/utils/ResponseWrapper.js`로 감싼다. 성공 `{success:true, ...result}` / 실패는 커스텀 에러 throw.
2. **컨트롤러 등록 필수** — 새 컨트롤러는 `src/index.js`에 import + 등록 호출. (네이밍 비일관 주의: 대부분 `registerXxxController`, 단 `projectStatusController`·`SentryConfig`는 예외)
3. **에러는 커스텀 클래스로** — `src/error/` throw, 코드는 `ErrorCodes.js`.
4. **DB 저장소 선택** — 프로젝트/사용자/워크로그 → **MySQL**(`rdb/query/`), 설정성(role/level/permission/status/settings/holiday/job) → **KVS**.
5. **쿼리키는 팩토리로** — `static/ui/src/utils/queryKey/` 팩토리 함수만 사용. 인라인 키 배열 금지.
6. **i18n 직접 수정 금지** — `ko-KR.json`·`en-US.json`은 **생성물**. 키는 `locales/kr/*`·`locales/en/*`에 추가 → `npm run merge`. UI는 `t()`로만. + Forge `t()`는 치환 미지원 → `tFormat` 헬퍼. → [[forge-i18n]]
7. **성능 (256MB)** — 워크로그 다건 조회는 **공통 페치 경로 수정 금지**, 기능별 **전용 병렬 페처 + `p-limit`**. 분석류는 프로젝트 단위 1회 페치 + **KVS 캐시**. → [[forge-worklog-performance]]

## 주요 커맨드
```bash
npm test                          # 백엔드 jest (루트)
cd static/ui && npm start         # 프론트 개발 서버
cd static/ui && npm test          # 프론트 테스트
cd static/ui && npm run build     # 빌드 (prebuild가 merge 자동 실행)
cd static/ui && npm run merge     # 번역 병합 (locales/script/merge.js)
forge deploy                      # 배포 (manifest.yml)
forge tunnel                      # 로컬 개발 터널
```

## Forge 앱 특이사항
- **manifest.yml**: Global Page · 커스텀 필드(projectId, coworker) · Scheduled Trigger · SQL · Storage 정의.
- **설치 트리거** `src/trigger/onInstall.js`: SEED_VERSION 관리, KVS 기본 데이터 시드(`src/seed/SeedData.js`).
- **큐 업로드** `src/queue/consumer.js`: 대용량 사용자 업로드는 `@forge/events` 큐. 즉시 응답엔 작업 ID만, 최종 결과는 프론트 `JobPollingManager.jsx` 폴링.
- **DB 마이그레이션** `src/rdb/schema/migrate.js` → `runMigration`(manifest 등록).

---

## 관련 노트
- [[moves-workforce]] — 경험·결정·타임라인 (이 개요의 짝 노트)
- [[2026-05-26-resource-perf]] · [[2026-05-27-mm-redesign]] · [[2026-05-29-progress-page]] — 주요 작업 기록
- [[forge-i18n]] · [[forge-worklog-performance]] — 핵심 기술 주제
- [[harness-engineering]] · [[claude-code-basics]] — 이 프로젝트에 깔린 하네스 사용/구축
