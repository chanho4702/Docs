---
# 2026-09-22 추가: "하위 작업 포함" 의미 = **선택 타입 이슈의 하위 이슈**(프로젝트 전체 하위 작업 아님, 사용자 확정).
# develop e9ff3bb(다른 세션)가 `OR subTaskIssueTypes()`로 틀리게 구현 → RFC-202 worktree 커밋 656d0e9(#RFC-180 태그)에서
# 부모 집합 JQL + `parent in (키 50청크)` 재귀 확장(깊이 5)으로 수정. JQL엔 "부모 타입 X인 하위" 문법이 없다.
# develop cherry-pick은 RFC-202의 onIssueCreated/Sweeper 변경에 의존해 충돌 → RFC-202 머지 때 함께 들어감.
name: project-subscription
description: "프로젝트 구독(스페이스/보드 구독 → 이슈 자동 편입) 기능, RFC-171 브랜치, 설계 v2 완료·구현 미착수"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8a675a42-9592-4a71-a6bd-abed62aabc9b
  modified: 2026-09-22T08:58:04.574Z
---

**RFC-171**. RMS 프로젝트가 Jira **스페이스**를 구독하면 그 스페이스에 추가되는 이슈가 자동으로 해당 RMS 프로젝트 작업으로 편입되는 기능. 진입점은 작업등록 모달(`IssueAddModal`)의 '구독 설정' 탭.

2026-08-04 기준 **설계 v3 · P1~P6 구현 완료 · development 배포·동작 확인 완료**. 운영 배포·develop 머지 미수행.
설계서 `_workspace/project-subscription/01_architect_design.md`(v3), 검토 원문 `02_codex_review.md`·`_workspace/recent-rfc-review/rfc-171-review.md`.
경험 노트: `claude-experiences/projects/moves-workforce/2026-08-04-project-subscription.md`

**보드 구독은 제거했다(스페이스만)** — 이슈는 Jira 프로젝트 하나에만 속해 스페이스끼리는 겹치지 않는다. 겹침의 유일한 경로가 보드였고, 그 때문에 두 RMS 프로젝트가 같은 이슈 소유권을 두고 경쟁할 수 있었다(검증 P0). 보드를 빼자 claim 테이블 없이 해소되고 Agile scope 문제도 함께 사라졌다. DB `source_type` 컬럼은 유지.

남은 것: **같은 스페이스 중복 구독 허용**(PK 를 project 포함으로 바꾸고 이벤트 판정이 N건 중 하나를 고르게), 보류한 검증 지적(sweep lease·큐 부분 실패·prefix starvation).

**작업 위치**: 2026-08-04 이후 **develop 에서 직접 작업**한다(3f0e73a 로 머지 후 전용 워크트리 제거). RFC-171 브랜치는 그 시점 상태로 남아 있어 develop 보다 뒤처져 있으므로 **참조하지 말 것** — 최신은 develop 이다.

머지 시 `migrate.js` 충돌 — RFC-163 과 v015 를 동시 선점해 구독을 **v016 으로 재번호**했다. migrationRunner 는 이름으로 판정해 번호가 겹쳐도 둘 다 실행되지만 순번이 깨지면 최신 파악이 불가하다. 배포 전이라 이름 변경이 안전했다.

세션마다 워크트리를 분리하는 것이 이 프로젝트 관행 — 메인에서 브랜치를 바꾸면 동시 작업 중인 다른 세션이 끌려간다. `_workspace/`는 gitignore라 워크트리 간 문서는 수동 복사해야 한다(제거 전 반드시 메인으로 복사).

**핵심 설계 결정 (되풀이 논의 방지)**
- 조회 시점 JQL 확장은 **기각** — `moves_RMS_projectId` JQL 술어가 20곳 이상에 흩어져 있어 화면마다 모집단이 갈라진다. 구독은 "규칙 저장 + 물리 태깅 자동화"로만 구현한다.
- 정확성의 원천은 **시간별 리컨실 스윕**, 생성 이벤트 트리거는 체감속도용 보조. 보드는 필터 기반이라 생성 이벤트로 판정 불가.
- **소스 1개 = RMS 프로젝트 1개 (전역 배타, DB PK로 강제)** — 이슈 단위 claim 테이블은 Forge SQL 1GiB 예산 압박이라 기각. 대신 같은 스페이스를 두 프로젝트가 나눠 쓰는 것은 불가.
- 태깅은 **SCAN(전량 수집) → APPLY(고정 목록)** 2단계. 검색하며 태깅하면 `IS EMPTY` 결과집합이 줄어 커서가 이슈를 건너뛴다.
- 편입 후 소스를 이탈한 이슈는 **되돌리지 않는다** — 과거 집계가 소급 변동하기 때문.

**주의**: 앱 필드 write는 asApp 필수([[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-workforce/memory/claude-memory--feedback_no_asapp|feedback_no_asapp]]의 예외 — readOnly 커스텀필드는 `/app/field/{id}/value` 외 경로가 없음, [[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-workforce/memory/claude-memory--project_forge_readonly_field_write|project_forge_readonly_field_write]]). 대신 구독 생성 시 소스 접근을 asUser로 검증해 confused-deputy를 막는다.

배포해야 확정되는 미검증 항목 6건은 설계서 §13 — 특히 보드 configuration(`subQuery` 포함) 조회에 필요한 Agile scope 조합.

**프로덕션 403 장애(2026-08-11 진단 → 2026-08-13 조치 완료)**: dmove.atlassian.net 백필이 `APP_FIELD_WRITE_403`으로 실패 — 원인은 `findAppFieldIdByName`(FieldApi.js)의 **이름 매칭**이 과거 설치했다 제거한 환경의 고아 `moves_RMS_projectId` 필드를 잡은 것(dev/prod 공존 아님). 조치: ① 고아 필드 삭제 + 배포는 **사용자가 직접 수행**(2026-08-13) ② 재발 방지 커밋 `9144aa2`(#RFC-171 [FIX]) — 매칭을 필드 key의 `{앱ID}__{환경}__{필드키}` 자기 소유 기준으로 교체(`matchOwnAppField`), 이름 매칭 폐지, 미소유 시 null(호출부 5곳 전부 fail-safe 확인), `getCoworkerFieldIdApi`도 동일 경로 통일, 회귀 테스트 7건. 앱 ID `f8962f17-…`는 프론트 `constants/customField.js`와 동일 상수.

**구독 편입 등록이력(2026-08-11 완료, 커밋 720fe31)**: 구독 4경로(백필 큐/즉시/onIssueCreated/스위퍼) 태깅 성공 후 movesRms에 `assignedAt`+`assignedVia:'subscription'` 기록(assignedById 없음), 작업 이력 등록자 컬럼에 "구독" 배지. 기존 assignedAt 있으면 skip, best-effort 비차단, 예산 공유 경로는 applyDefaultEstimate가 먼저 소비. 기존 편입분 소급 없음. 감사 결함 P1 4건(job 영구 RUNNING·죽은 retryCondition·IS EMPTY 미재확인·예상시간 200건 절단)은 `_workspace/subscription-audit/AUDIT_2026-08-11.md`에 기록, 수정 미착수.

**RFC-209 사후 편입(2026-09-30, 커밋 24222b8·배포 전)**: 스윕은 `IS EMPTY` 부모 집합에서만 자식을 확장하므로 **이미 편입된 에픽 밑으로 나중에 옮겨진 이슈·최상위로 만들었다가 하위 작업으로 전환한 이슈**(DS-15)는 생성 이벤트(그때는 조건 밖 → 조용한 거부)도 스윕도 영영 못 잡았다. 앱은 `created:issue`만 구독한다. 수정: `scanSubscription`에 RECONCILE 전용 2단계 `collectReparentedChildren` — 자식 쪽 후보(`IS EMPTY AND parent is not EMPTY AND issuetype not in (선택)` + baseline/watermark 하한)를 뽑고 부모를 `moves_RMS_projectId = "<projectId>" AND key in (...)`로 편입 확인, 자손은 기존 확장 재사용. 비용은 최근 활동량 비례. Codex 보류 2건: 고정 예산에서 후보 페이지 재시도 진행성(1단계도 같은 성질·태깅되면 결과집합이 줄어 전진), baseline 이전 생성 이슈의 사후 편입 차단(제품 의미 = 백필 안 함, filterByBaseline이 어차피 거른다). 진단 팁: 이슈 changelog의 `IssueParentAssociation`·`issuetype` 항목 + `forge logs -e production -n 2000 --since <ISO>`(기본 100줄). production 로그의 매시 19분 "license inactive"는 dmove가 아닌 다른 설치.
