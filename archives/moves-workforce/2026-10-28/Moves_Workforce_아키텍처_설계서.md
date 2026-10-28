# Moves Workforce — 아키텍처 설계서

| 항목 | 내용 |
|------|------|
| 문서명 | 아키텍처 설계서 |
| 버전 | v1.3 |
| 작성일 | 2026-07-09 (최종 현행화 2026-08-06) |
| 대상 독자 | 개발/운영팀 · 기술 검토자 |
| 관련 문서 | 데이터 모델 정의서(ERD·KVS), 개발자 온보딩, 핵심 로직 정의서, 공통 용어집 |
| 기준 소스 | `manifest.yml`, `src/index.js`, `src/permission/*`, 각 도메인 Service |

---

## 1. 목적·범위

Moves Workforce의 **시스템 구조·데이터 흐름·핵심 설계 결정**을 정의한다. 상세 온보딩은 개발자 온보딩 문서를, 스키마는 데이터 모델 정의서를, 지표 산식은 핵심 로직 정의서를 참조한다.

### 1.1 2026-08-20 기준선

- 현재 UI는 React 18 + Atlaskit 기반 **Forge Custom UI**다. `manifest.yml`의 `resources.main.path=static/ui/build`이 실행 기준이다. 저장소의 UI Kit 전용 작업 지침과 충돌하므로 기존 Custom UI를 승인된 현행 architecture로 취급하며, migration은 별도 RFC에서만 수행한다.
- backend는 `CONTROLLER_REGISTRARS`의 **32개 registrar**를 중앙 등록한다. 팀 분석과 프로젝트 구독 controller까지 포함하며 목록 밖 직접 등록은 금지한다.
- 저장 모델은 Forge SQL **13 table**과 KVS Custom Entity **12개**다. `project_subscription`(v017 `default_estimate_seconds` 포함), 프로젝트 대시보드의 `filter_json`(v018), 포트폴리오 스냅샷의 `salary_policy`·`spaces_json`(v019), KVS `settings.salaryPolicy`, `level` 급여 밴드가 포함된다.
- 핵심 신규 경계는 ① 팀/자원관리의 범위 제한, ② 구독의 소스 전역 배타 소유와 이벤트+리컨실 이중 경로, ③ 급여정책에 따른 계산 원천·응답 shape 전환이다.
- 감사 보완의 세부 wire contract는 `_workspace/logical-design-audit/01_architect_design.md`를 SSOT로 한다.

---

## 2. 시스템 개요

### 2.1 한 줄 정의
Atlassian **Jira Cloud용 Forge 앱**. Jira 안에 설치되어 프로젝트의 인력·팀·배정·구독 규칙과 워크로그를 연결하고 공수(MM/가동률)·진척·인건비를 집계·분석한다. **외부 서버·외부 DB 없이 전부 Atlassian 인프라(Forge) 안에서 실행·저장**된다.

### 2.2 런타임 환경 (manifest 기준)
| 항목 | 값 | 설계 함의 |
|------|-----|-----------|
| 런타임 | nodejs22.x | — |
| 메모리 | **256 MB** | 실시간 전사 집계 불가 → 배치·캐시·전용 페처 설계의 근본 원인 |
| 아키텍처 | arm64 | — |
| UI 진입점 | `jira:globalPage` **1개** (key: `moves-rms`) | 프로젝트별 화면도 SPA 내부 라우팅으로 처리(jira:projectPage 없음) |
| 라이선싱 | enabled: true | 인앱 라이선스 가드 |

### 2.3 앱 권한 범위(scopes)
`storage:app`, `read:jira-user`, `read:jira-work`, `write:app-data:jira`, `write:jira-work`, `manage:jira-configuration`. 외부 통신은 **Sentry(오류 모니터링) 도메인 3종**뿐(analytics 카테고리).

---

## 3. 논리 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│  Jira Cloud  (이슈 · 워크로그 · 사용자 · 커스텀 필드)          │
└───────────────┬─────────────────────────────▲───────────────┘
                │ @forge/api requestJira        │ 커스텀필드/이슈링크 write
                │ (asUser 기본 / asApp 예외)     │
┌───────────────▼─────────────────────────────┴───────────────┐
│  Forge 백엔드 (Node.js 22, 256MB)                             │
│  index.js → [guardedDefine] Controller → Service → Repository │
│                                    │                          │
│        ┌───────────────┬───────────┴────────┐                │
│        ▼               ▼                    ▼                 │
│   Forge SQL(TiDB)   Forge KVS          @forge/events 큐        │
│   (프로젝트·인력·    (설정·마스터·        (업로드·포트폴리오·      │
│    팀·스냅샷·간트·   캐시·잡)             구독 백필)              │
│    구독)                                                     │
│        ▲                                                      │
│        │ 일일 배치(scheduledTrigger: portfolio-snapshot)       │
└────────┼─────────────────────────────────────────────────────┘
         │ invoke('fn', params) → { success, content, error }
┌────────▼─────────────────────────────────────────────────────┐
│  React 18 Custom UI (SPA, MemoryRouter, Atlaskit)             │
│  Zustand(권한·i18n·잡) + TanStack Query(서버상태)              │
│  분석 리포트 · 진척도 · 대시보드 · 칸반 · 간트(SVAR)            │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. 백엔드 아키텍처

### 4.1 계층
`src/index.js(등록) → Controller → Service → (Repository) → DB`. 도메인별로 `src/resolver/{도메인}/`에 묶는다. 현재 `CONTROLLER_REGISTRARS`에 **32개 registrar**가 등록된다. 목록 밖 직접 등록은 금지한다.

- **Controller** — resolver 함수 등록만(`registerXxxController(resolver)`).
- **Service** — 비즈니스 로직·계산.
- **Repository** — DB 접근(선택). 없으면 Service가 `rdb/query/`를 직접 사용.

### 4.2 표준 등록 — `guardedDefine`
모든 resolver는 `guardedDefine`으로 등록되어 **권한 가드 + 응답 표준화**가 자동 적용된다. `getSentryDSN`도 `SentryConfig` registrar 안에서 같은 표준을 사용하며 목록 밖 raw `resolver.define` 등록은 허용하지 않는다.
- 응답은 항상 `responseWrapper` 형태: 성공 `{ success: true, ...result }`, 실패 `{ success: false, error: {name, code, message, cause} }`.
- 데이터는 대개 `{ content: {...} }` 한 겹에 담아 반환(최상위 success/error와 이름 충돌 방지).
- 프론트 소비 패턴 단일화: `result.success` 분기 → `result.content` 추출.

### 4.3 데이터 저장 전략
"쌓이고 검색하면 SQL, 유한한 설정성이면 KVS." 상세는 **데이터 모델 정의서** 참조.
- **Forge SQL**: project, users, projectusers, user_schedule, project_dashboard, portfolio_project_snapshot, gantt_folder 계열(3), skill 매핑(2), project_team, **project_subscription**.
- **Forge KVS**: role/team/level/skill/permission/status/status_link/settings/holiday/job 계열(3) + 캐시 직접 키. `level`은 급여 밴드, `settings`는 급여정책을 포함한다.
- **워크로그는 저장 안 함** — Jira 원본, KVS 단기 캐시(TTL 10분)만.

### 4.4 Jira 연동 — asUser 기본, asApp 명시적 허용 경로
- **기본 asUser**: 화면을 보는 사용자 권한으로 호출 → 사용자가 못 보는 이슈는 앱도 안 보임, 마켓 심사 부담↓.
- **asApp 허용 경로**: ① 사용자 context가 없는 portfolio/구독 scheduled trigger·queue·이슈 생성 trigger, ② app custom field 전용 write, ③ `movesRms` issue entity property read/merge/write, ④ License API self-query, ⑤ 앱 설정용 field/time-tracking metadata 조회, **⑥ 프로젝트 협업 모드 열람** — 프로젝트 쓰기 권한자가 프로젝트별로 켜는 설정(기본 꺼짐, 켠 사람·시각 기록)이며, 켜진 프로젝트에서 **그 프로젝트 참여 인원에게만**, **그 프로젝트에 연결된 이슈와 워크로그를** 작업관리·캘린더·프로젝트 대시보드 **조회**에 한해 앱 자격으로 읽는다. JQL 은 서버가 조립하고 프로젝트 술어를 항상 붙이며, 응답은 화면 필드만 담는다. 쓰기(이슈 편집·워크로그·연결 변경)는 본인 자격 그대로다. 판정 단일 출처 `src/permission/CollabAccess.js`. 앱 자격으로도 못 보는 범위(앱 역할이 빠진 스페이스, 본인에게만 보이는 이슈)는 `getProjectCollabCoverage` 로 켜기 전 확인 창과 화면 배지에 알린다. 구독 생성 시에는 먼저 asUser로 소스 접근을 검증하고 메타데이터를 서버가 조달한다. **⑦ 승인 앱 인증 문서 읽기(원가 전용, 2026-10-11)** — 사용자 프로퍼티 `movesApproval.cert.{YYYY-MM}` GET 을 `getProjectCostSummary` 안에서만 앱 자격으로 하고, 서명 검증을 통과한 문서만 원가 계산에 쓴다. 원문·건별 인증 값은 응답에 싣지 않는다(원가가 조회자마다 달라지지 않게). 건별 배지는 asUser.
  - 마켓 심사 사유(⑥): "프로젝트 설정으로 쓰기 권한자가 켜는 열람 기능, 대상은 연결 이슈·참여 인원으로 한정".
- **커스텀 필드 6종**: projectId·coworkers·assignedDate·assignedBy·**wbsParent**(WBS 계층)·**predecessors**(선후행 JSON). 대부분 readOnly.
- **issue entity property**: 팀 관리형 프로젝트 호환을 위해 `movesRms={coworkers,assignedAt,assignedAtIso,assignedById,wbsParent}`를 REST API로 관리한다. manifest에는 JQL 검색 대상 3개만 alias로 선언한다.

---

## 5. 권한 아키텍처

이중 집행: **프론트**(canRead/canWrite로 메뉴·버튼 숨김, UX) + **서버**(모든 resolver 가드, 실제 보안 경계).

### 5.1 서버 가드 흐름
`guardedDefine` 등록 → 요청 시 `PrincipalResolver`가 `req.context.accountId`(Forge 신뢰값)로 권한 세트 해석(30초 인메모리 캐시) → `PermissionMap`의 (리소스 키, read/write) 대조 → 통과 시에만 핸들러 실행.

### 5.2 안전장치
1. **deny-by-default** — 매핑 없는 함수는 무조건 거부(`PERMISSION_UNMAPPED`). "깜빡하면 잠긴다".
2. **jest 계약 테스트** — "등록 함수 = 매핑 함수" CI 강제. 가드 누락이 배포까지 못 감.
3. **fail-close** — 백엔드가 완전한 권한 카탈로그 응답, 프론트는 받은 값만 사용(허용 기본값 없음).
4. **신원은 서버가 강제** — SELF 함수는 클라이언트 accountId를 무시하고 `context.accountId`를 사용한다. update/delete는 SQL `WHERE ... AND account_id=?`까지 소유자를 강제하며 0행은 `SCHEDULE_NOT_FOUND_OR_FORBIDDEN`으로 통일한다.

### 5.3 데이터 범위 — projectScope·팀장 축
권한 세트 필드 `projectScope: ALL | MEMBER_ONLY | TEAM_ONLY`. MEMBER_ONLY는 본인 소속 프로젝트다. TEAM_ONLY의 scope team은 `(본인 소속 팀+후손) ∪ (본인이 리드하는 모든 팀+각 후손)`이며, 이 팀 소속 인원의 참여 프로젝트와 `project_team` 담당 프로젝트의 합집합이다. 유효 팀이 없거나 팀 인덱스 조회가 실패하면 빈 범위로 fail-close한다. 상세는 가드가 거부하고 목록은 `scopedProjectIds(principal)`로 축소한다. 팀장 권한은 permission set이 아니라 `team.leaderAccountId` 관계에서 파생되는 `teamLead` OR 축이며 대상 allowlist를 적용한다. 민감 정보(인건비)는 별도 `PROJECT_COST` 권한으로 분리한다.

raw 리소스 카탈로그는 **17개 키**다. 이 중 `PROJECT_GANTT`는 compatibility용 dead key라 권한 관리 UI에서 숨기며, Gantt 프론트와 서버 resolver는 모두 `PROJECT` read/write를 사용한다. 따라서 운영자가 설정하는 유효 항목은 16개다. 신규 축은 `RESOURCE_MANAGEMENT`, `TEAM_MANAGEMENT`, `SKILL_MANAGEMENT`이며 신규 커스텀 세트에는 기본 거부로 병합한다. PM/PMO/Team Lead/Team Member 프리셋은 최초 1회만 생성하고 프로비저닝 원장으로 삭제 후 부활을 막는다. 팀 분석 가시 범위는 `ALL | LEADING | NONE`으로 별도 판정하며 `REPORT`만으로 전 팀을 열지 않는다.

---

## 6. 비동기 · 배치 · 생명주기

### 6.1 함수·트리거 (manifest)
| 함수 | 트리거 | 용도 |
|------|--------|------|
| `resolver` | invoke | 일반 요청 처리(index.handler) |
| `runMigration` | scheduledTrigger `init-db`(**hourly**) + onInstall | DB 스키마 마이그레이션 |
| `portfolioSnapshot` | scheduledTrigger `portfolio-snapshot`(**daily**) | 전사 대시보드 스냅샷 배치(timeout 600s) |
| `uploadUsers` | consumer `upload-users-queue` | 엑셀 대량 업로드(timeout 600s) |
| `aggregatePortfolio` | consumer `portfolio-aggregation-queue` | 프로젝트별 포트폴리오 배치 집계(timeout 600s) |
| `backfillSubscription` | consumer `subscription-backfill-queue` | 구독 기존 이슈 고정 목록 배치 편입(timeout 600s) |
| `onInstall` | trigger `installed:app` + `upgraded:app` | 설치/업그레이드 시 마이그레이션+시드 |
| `onIssueCreated` | trigger `avi:jira:created:issue` | 스페이스 구독의 새 이슈 빠른 편입(실패 비전파) |
| `subscriptionReconcile` | scheduledTrigger `subscription-reconcile`(**hourly**) | 이벤트 유실·보드 조건·이슈 이동 정합성 회복 |

### 6.2 설치/업그레이드 시퀀스 (`onInstall`)
`runMigration()`(스키마 즉시 생성, 시간 트리거 대기 안 함) → `seed_version` 비교 → 낮으면 `runSeed()`(permission 프리셋/status/settings 등 기본 데이터) → `seed_version` 갱신(현재 **9**). SEED_VERSION 멱등이라 실패 시 다음 실행에서 자동 재시도.

> 스키마 마이그레이션을 스케줄만 의존하지 않는 이유: "설치했는데 첫 스케줄 전까지 테이블 없음" 공백 방지 → onInstall 선행 필수.

### 6.3 대용량 업로드 파이프라인
엑셀 사용자 업로드 → `@forge/events` 큐(`uploadUsers`) → 배치 처리, 진행 상태는 KVS `job`/`job_batch`/`job_fail` 엔티티에 적재 → 프론트가 폴링으로 진행률 표시. 즉시 응답엔 작업 ID만.

---

## 7. 성능 설계 (256MB 제약 대응)

| 문제 | 설계 |
|------|------|
| 워크로그 N+1 | **프로젝트 단위 1회 페치 + p-limit 병렬 + KVS 캐시(TTL 10분) + 프론트 슬라이스**. 공통 모듈이 아니라 **기능별 전용 페처**로 blast-radius 격리 |
| 전사 실시간 집계 불가 | **일일 배치 스냅샷 + 프론트 재집계**. 배치가 프로젝트별 raw(members_json 등) 적재, 필터별 분포·합산은 프론트 `useMemo` |
| 전사 가동률(합집합 분모) | 프론트에서 복원 불가 → **배치에서 계산**해 KVS 롤업에 저장(유일한 배치 산출 지표) |
| 진척도·비용 반복 계산 | KVS 캐시(진척 `ProjectProgress:{pid}` TTL 10분, 비용 `ProjectCost:{pid}`) |
| 권한 조회 빈발 | PrincipalResolver 30초 인메모리 캐시 |
| 구독 검색 중 결과집합 축소·건너뜀 | 한 invocation 안에서는 **SCAN→APPLY** 순서를 지킨다. 다만 미완주 분량을 cursor로 재개할 때는 이전 APPLY로 후보 집합이 줄어 cursor skip 위험이 남아 있어, 현재 구현을 무누락 보장으로 간주할 수 없다 |
| 구독 대량 백필 | `MAX_BACKFILL_ISSUES=5,000` 안전 상한이 있으나 공용 `MAX_SCAN_ISSUES=2,000`이 먼저 적용되어 현재 생성 요청당 최대 2,000건을 고정 배치로 queue push. 배치마다 generation/isActive/소유 프로젝트 재검증 |

---

## 8. 프론트엔드 아키텍처

- **라우팅**: `App.jsx`의 MemoryRouter. **i18n 초기화 + 권한 로드 완료 후** 렌더. 라이선스 미활성 시 `LicenseGuidePage`, 평가 만료 배너.
- **상태**: Zustand(권한·i18n `t()`·잡 추적) + TanStack Query(서버 상태). 신규·수정 코드는 팩토리(`utils/queryKey/`)만 사용한다. 2026-08-03 감사 시 직접 배열 74건이 남아 있어 점진 이관 대상이다.
- **주요 화면**: `/myWork`(기본)·`/my-page`·`/project`·`/project/:id`(대시보드·인력/급여/배정·작업 목록/트리/간트·캘린더·분석)·`/resource`(인력/조직/팀/배정)·`/dashboard`(전사)·`/backoffice/*`.
- **시각화**: ECharts·ApexCharts·FullCalendar·`@svar-ui/react-gantt`(간트)·`@xyflow/react`(상태 플로우)·react-grid-layout(대시보드)·react-kanban-kit.
- **간트 편집**: 낙관적 업데이트 + 부분 패치(전체 재조회 안 함 — Jira 검색 인덱스 지연 회피). SVAR 이벤트 가로채기(서버 권위), 폴더 간 이슈 이동 시 WBS 해제 보상과 프로젝트 범위 검증을 적용한다.

---

## 9. i18n

소스 `locales/kr·en/{기능}.json` → `npm run merge` → 산출물 `ko-KR.json`/`en-US.json`(직접 수정 금지). 팀 분석·구독·급여정책도 기능별 원본 JSON을 사용한다. UI는 `t()`로만, 변수 치환은 `tFormat` 헬퍼(Forge `t()`가 치환 미지원).

---

## 10. Forge 제약과 대응 (요약)

| 제약 | 대응 |
|------|------|
| TiDB FK 미강제·CASCADE·트랜잭션 없음 | cascade = 앱 레벨 자식→부모 순차 멱등 DELETE. 유일성=PK 설계. 무결성=앱 검증 |
| KVS 값 240 KiB 한도 | 길이 자라는 배열은 KVS 금지(SQL 테이블). 문제이슈 TOP50은 롤업이되 고정 크기 |
| 256 MB 메모리 | §7 성능 설계 전반 |
| 스케줄엔 사용자 컨텍스트 없음 | 배치는 asApp |
| 앱 readOnly 커스텀필드 write | 전용 엔드포인트(asApp), 그 전에 네이티브 구조 우선 검토 |
| 앱 필드 write에 compare-and-set 없음 | 구독 소스의 `(source_type, source_id)` 전역 PK로 단일 소유 강제 |

### 10.1 SQL·license 경계 계약

- `@forge/sql` DML raw 영향 행 수는 `result.rows.affectedRows`다. `executeQuery`가 raw `rows`를 보존하고 안정 alias `rowsAffected`를 추가한다. SELECT의 `rows` 배열은 변경하지 않는다.
- 일반 `ResourcePersonDTO`에는 `salary`를 포함하지 않는다. 프로젝트 급여·비용 DTO는 `PROJECT_COST`로 보호하지만, 백오피스 사용자 목록의 개인 연봉은 `USER_MANAGEMENT` 경계에서 `INDIVIDUAL` 정책일 때 반환된다.
- 명시적인 context license의 `active:true/false`를 환경보다 우선해 `ACTIVE/INACTIVE`로 판정한다. license가 없을 때만 development/staging을 `NOT_APPLICABLE`로 허용한다. production에서는 License API로 재확인한다.
- **차단은 `INACTIVE` 하나뿐이다(2026-08-10).** 판정 불가(`UNAVAILABLE`)는 통과시킨다 — 이 가드는 `responseWrapper`를 통해 **모든 resolver**를 감싸므로, 판정 불가를 차단으로 다루면 상류 5xx 한 번이 60초 캐시와 맞물려 앱 전면 정지가 된다(권한 부트스트랩까지 막힌다).
- 단, **"호출 실패"와 "라이선스 없음"은 구분한다.** License API가 200으로 응답했는데 활성 라이선스가 없으면 그것은 판정 불가가 아니라 `INACTIVE`(차단)다. License API는 라이선스 부재를 `active:false`가 아니라 빈 데이터가 담긴 200으로 답할 수 있어, 뭉뚱그려 통과시키면 미결제·만료 설치가 전부 통과한다.
- 프론트(`licenseDecision.js`)도 **같은 경계**여야 한다. 한쪽만 닫으면 서버는 응답하는데 화면만 가이드 페이지에 고정된다.
- job polling은 `{success:true,content:{job}}`를 소비한다. transport/wrapper 실패 시 server job을 삭제하지 않는다.

### 10.2 프로젝트 구독 경계

- 규칙은 SQL `project_subscription`에 저장하고 기존 모든 소비 경로는 물리 태깅된 `moves_RMS_projectId`만 본다. 조회 시점 JQL 확장으로 모집단을 이중화하지 않는다.
- Service는 RMS 프로젝트당 최대 10개 소스를 허용한다. 이는 count→INSERT 순서의 application-level 상한이라 동시 생성에 대한 DB hard constraint는 아니다. `(source_type, source_id)` PK만 한 소스의 전역 단일 소유를 DB에서 강제한다.
- 구독 생성은 asUser 소스 접근 검증 → 규칙/JQL 검증 → 전역 PK 선점 → 선택 시 백필 큐 순서다.
- 스페이스 이슈 생성 이벤트는 확정 가능한 경우만 즉시 편입한다. 이슈타입/하위작업 미상·추가 JQL은 `defer`하고 watermark를 전진시키지 않는다. BOARD 구독은 이벤트 조회 대상에 넣지 않고 시간별 reconcile만 처리한다.
- 시간별 리컨실이 이벤트 누락을 보완한다. `baseline_at/created` 경계는 느슨한 JQL 하한 후 ISO 정밀 비교로 보정한다. `watermark/updated`는 느슨한 JQL 하한만 적용하며, 완주했을 때만 watermark를 전진시킨다.
- **Known limitation:** 부분 스윕은 수집분을 APPLY한 뒤 남은 cursor를 저장한다. 다음 실행의 JQL 후보 집합은 이미 축소됐으므로 이전 cursor가 미조회 이슈를 건너뛸 수 있다. cursor가 원래 결과집합과 독립적인 계약으로 바뀌거나 부분 실행에서 write를 유예하는 방식으로 고치고 재개 회귀 테스트를 추가하기 전에는 대규모 구독의 무누락을 보장하지 않는다.
- 해제는 규칙만 삭제하며 이미 태깅된 이슈는 유지한다.

### 10.3 급여 정책 경계

- `INDIVIDUAL`은 기존 `PROJECT`/`ANNUAL` 계산 경로를 유지한다. `LEVEL_BAND`는 급여 원천만 등급 대표값으로 교체하고 동일한 월할식에 태운다.
- 표시 경로는 정책 조회 실패 시 개인 금액을 숨기고, 계산 경로는 예외를 전파해 거짓 비용을 만들지 않는다.
- 개인 금액은 `LEVEL_BAND` 응답에서 키째 제거한다. 전환 전에 존재한 DB 값은 보존하지만, 이 정책 중 신규 등록된 사용자의 `users.salary`는 NULL일 수 있어 `INDIVIDUAL` 복귀 시 자동 복원할 값이 없을 수 있다. 일반 자원 DTO에는 정책과 무관하게 급여를 싣지 않는다.
- 포트폴리오 스냅샷의 `salary_policy`와 현재 정책이 다르면 비용 축을 마스킹해 혼합 정책 비교를 막는다.

---

## 11. 용어 정의

이 문서의 용어는 [공통 용어집]을 따른다.

## 12. 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| v1.0 | 2026-07-09 | 최초 작성(manifest·index·permission 실측 기준) |
| v1.1 | 2026-08-03 | Custom UI·30 registrar·SQL/KVS 12종·team/TEAM_ONLY/entity property/asApp/license/DML/DTO 경계 현행화 |
| v1.2 | 2026-08-04 | 32 registrar·SQL 13종·팀 분석 scope·구독 event/reconcile/backfill·급여정책 응답/계산 경계 현행화 |
| v1.3 | 2026-08-06 | 비동기 포트폴리오 재집계 완료 폴링·trigger 환경 판별 폴백·v017 구독 스키마 반영 |
| v1.4 | 2026-08-20 | v018 대시보드 필터·v019 스페이스 롤업, 전사/프로젝트 대시보드 확장 및 간트 폴더 이동 보상 반영 |
