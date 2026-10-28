---
tags: [moves-workforce, forge, permission, security, harness]
created: 2026-07-06
updated: 2026-07-06
---

# 권한관리 고도화 총정리 (2026-07-03 ~ 07-06)

> Moves RMS의 권한 체계를 "프론트 버튼 숨기기"에서 "서버가 전 함수를 검증하는 체계"로 전환.
> 산출물: `_workspace/permission-hardening/` (설계서 + BE/FE/검증 리포트 4종) · 커밋 전
> 관련: [[moves-workforce]] · [[harness-engineering]] · [[forge-migration-lifecycle]]

## 1. 배경 — As-Is 진단

기존: 권한 세트(Admin/Member/커스텀, KVS) × 페이지 단위 read/write. 사용자당 `permission_key` 1개, Jira ADMINISTER는 자동 Admin. **모델은 적절했으나 구현에 구멍 3개**:

| # | 문제 | 실증 |
|---|------|------|
| 1 | **서버사이드 enforcement 부재** — 권한 검사는 프론트 `canRead/canWrite`(버튼 숨김)뿐. 콘솔에서 `invoke()` 직접 호출 시 Member가 사용자 삭제·권한 변경 가능 | resolver 109개 중 검사 0개 |
| 2 | **fail-open** — 미수신 pageId를 프론트가 `{read:true, write:true}`로 채움 | `usePermissionStore.js:34` |
| 3 | **페이지 정의 5중 중복** — 프론트 상수 2곳 + 시드 2곳 + 테넌트 저장 데이터. 드리프트 실재(`PROJECT_GANTT` 프론트만 / `WORKLOG` 시드만) | `pages.jsx` vs `SeedData.js` |

**granularity 결정**: 페이지↔권한 키 1:1은 기각 (매트릭스 30행+ 폭발, 동기화 부담 비례 증가). "권한 경계(리소스)" 단위로 묶되 **분리 기준 3가지를 명문화** — (a) 민감도 상이 (b) 사용자군 상이 (c) write 의미 상이.

## 2. 확정 범위 4가지

1. **서버사이드 권한 가드** — resolver 전수 (리소스, read/write) 매핑 + 공통 가드
2. **fail-close 전환** — 백엔드가 완전한 카탈로그 응답, 프론트는 받은 대로만
3. **리소스 카탈로그 단일 소스화 + 마이그레이션** — 정의 1곳, 드리프트 정리
4. **프로젝트 데이터 범위 권한** (작업 중 추가) — 비관리자를 소속 프로젝트만 조회하게 설정 가능

## 3. 설계 핵심 결정

- **`req.context.accountId` 실증** — Forge resolver context가 accountId를 제공(기존 사용례 확인) → 가드마다 Jira `/myself` 호출 불필요. 성능 우려 해소의 열쇠.
- **가드 = `guardedDefine` 헬퍼** — `responseWrapper`를 내부 흡수해 등록부 일원화. 미매핑 함수는 **deny-by-default**(`PERMISSION_UNMAPPED`) + **jest 계약 테스트**가 "등록 함수 집합 ↔ 매핑 집합" 1:1을 CI에서 강제 → 새 resolver를 매핑 없이 추가하면 빌드가 깨짐.
- **OR-grant** — 공유 read(사용자 모달이 직무 목록 필요 등)는 배열 매핑으로 과차단 방지.
- **PrincipalResolver + L1 캐시** — admin=Jira 1회 / 비admin=Jira 1+SQL 1+KVS 1, 30초 TTL 인메모리 캐시로 warm 컨테이너 0회. `userPermissionCheckService`와 로직 공유(SSOT).
- **카탈로그 14키** (`src/permission/ResourceCatalog.js`) — `WORKLOG` 제거(본인 데이터 self-scope라 잠글 실익 없음), `PROJECT_GANTT` 정식 등재(migrateFrom PROJECT), `PROJECT_COST` 신규 분리(기준 (a) 민감도 — 인건비/단가, 시드 Member read=false).
- **④ projectScope = 권한 세트 필드** (`'ALL'|'MEMBER_ONLY'`) — 전역 설정 1개는 집단별 차등(내부=ALL, 외주=MEMBER_ONLY) 불가라 기각. 소속 = `projectusers` 인력 등록 기준(`INDEX(account_id)` 활용). 상세 조회=가드 소속 검증(`PERMISSION_PROJECT_SCOPE_DENIED`), 목록=서비스 `WHERE project_id IN` 필터(응답 shape 불변). admin 항상 ALL.
- **마이그레이션** — SEED_VERSION 5→6. Admin/Member는 카탈로그에서 결정적 재생성, 커스텀 세트는 누락 키 병합(migrateFrom으로 기존 접근 보존)·고아 키 정리·scope 'ALL' 주입. 전부 멱등.

## 4. 사용자 확정 정책 (제품 결정)

| 항목 | 결정 |
|---|---|
| 비용 탭 | 시드 Member 숨김 (커스텀 세트는 REPORT 값 상속으로 보존) |
| MEMBER_ONLY write | read/write 공통 — 소속 프로젝트만 수정 가능 |
| 전사 포트폴리오 | 전면 차단 대신 소속 프로젝트 집계로 축소 |
| "소속" 정의 | projectusers 인력 등록 기준 (담당자/coworker 확장은 로드맵) |
| 시드 세트 scope | **토글만 편집 허용** — Member는 scope 변경 가능(전용 resolver `updatePermissionScope`), Admin은 항상 ALL 거부. 시드 재생성 시 Member scope 보존 |

## 5. 검증 루프에서 잡은 보안 구멍 3건

1. **(설계 단계)** myWork/mySchedule이 `payload.accountId` 신뢰 → 타인 워크로그 열람 가능 → SELF 함수는 서버가 `context.accountId`로 강제 덮어쓰기.
2. **(1차 검증)** `getIssueWorklogDetail`이 projectId를 payload로 안 받아 스코프 검증 no-op → 서버가 issueKey에서 프로젝트를 **JQL 역산** 검증 (payload 조작 원천 차단, issueKey 정규식으로 인젝션 방어).
3. **(2차 검증)** 기존 `updatePermission` direct-invoke로 시드 세트 잠금 해제·Admin scope 고정 우회 가능 → `edit:false` 세트는 `PERMISSION_SEED_IMMUTABLE` 거부.

> 교훈: 전용 경로(`updatePermissionScope`)에 가드를 만들면 **기존 범용 경로(`updatePermission`)가 우회로가 된다**. 새 제약을 넣을 땐 같은 리소스를 만지는 모든 경로를 전수 점검할 것.

## 6. 운영 함정 (트러블슈팅)

- **KVS custom entity 422** — `projectScope` 필드 추가 후 시드 저장이 `UNPROCESSABLE_ENTITY: semantic errors`로 전멸. 원인: KVS custom entity는 **manifest.yml `storage.entities` attributes에 선언된 필드만 저장 가능**. manifest에 속성 추가 + `forge deploy` 필요(tunnel만으론 미반영). 시드는 seed_version bump 전 실패라 자동 재시도됨(멱등 설계 덕).

## 7. 최종 상태

- **검증**: verifier 통과 9 / 실패 0 / **미검증 1(런타임 E2E)** — 배포 후 MEMBER_ONLY 실사용 확인 필요 (프로젝트 목록 축소·비소속 상세 거부·비용 탭 숨김·시드 direct-invoke 차단).
- **테스트**: 백엔드 12 suites/165, 프론트 6 suites/58, 빌드 정상. 기존 27개 `canRead/canWrite` 호출부 무수정.
- **에러 코드 신설**: `PERMISSION_DENIED` / `PERMISSION_UNMAPPED` / `PERMISSION_PRINCIPAL_UNRESOLVED` / `PERMISSION_PROJECT_SCOPE_DENIED` / `PERMISSION_SCOPE_ADMIN_IMMUTABLE` / `PERMISSION_SEED_IMMUTABLE` / `PERMISSION_SET_NOT_FOUND`
- **로드맵(범위 외 기록)**: 액션 세분화(value에 delete/export 키 추가로 하위호환 확장), 소속 정의 확장(담당자/coworker), inherited 자식키 write 완전 차단, Jira 그룹 매핑, 감사 로그, 캐시 즉시 무효화.

## 8. 발표용 PPT 생성 프롬프트

아래를 PPT 생성 AI(Gamma/Copilot/Claude 등)에 붙여넣어 사용:

```
Jira Cloud용 Forge 앱 "Moves RMS"의 권한관리 고도화 프로젝트 발표 자료를 만들어줘.

[청중] 사내 개발팀 + 제품 관계자 (기술 배경 있음, 이 앱 코드는 모름)
[분량] 슬라이드 12장 내외, 한국어, 다크 톤의 깔끔한 기술 발표 스타일
[스토리라인] "버튼만 숨기던 권한"을 "서버가 모든 요청을 검증하는 체계"로 바꾼 여정

슬라이드 구성:
1. 표지 — "권한관리 고도화: 화면 숨김에서 서버 검증으로" + 한 줄 요약
2. 배경 — 기존 체계(권한 세트 × 페이지 read/write)와 잘 동작하던 점
3. 문제 3가지 — ①서버 검증 부재(콘솔 invoke로 Member가 사용자 삭제 가능 데모 시나리오) ②fail-open 기본값(권한 미정의 페이지가 전원에게 열림) ③권한 정의가 5곳에 중복되어 드리프트 발생. "보안 구멍은 모델이 아니라 구현에 있었다"는 메시지
4. 설계 원칙 — 페이지:권한 1:1 대신 "권한 경계" 묶음 + 분리 기준 3가지(민감도/사용자군/write 의미), deny-by-default, 기존 사용자 동작 보존(마이그레이션)
5. 아키텍처 — invoke → guardedDefine(가드) → PrincipalResolver(신원+권한 해석, 30초 캐시) → handler 흐름도. resolver 109개 전수 매핑, 미매핑=자동 거부
6. 회귀 방지 장치 — jest 계약 테스트가 "등록된 함수 ↔ 권한 매핑" 1:1을 CI에서 강제 (새 기능이 매핑 없이 배포되면 빌드 실패)
7. 리소스 카탈로그 — 14개 권한 키 단일 소스, 비용(PROJECT_COST) 민감도 분리, 시드/기존 테넌트 자동 마이그레이션(멱등)
8. 프로젝트 스코프 — 권한 세트별 "소속 프로젝트만 조회"(ALL/MEMBER_ONLY) 토글. 목록=쿼리 필터, 상세=가드 검증, 관리자는 항상 전체. 내부직원/외주 차등 운영 시나리오
9. 검증에서 잡은 보안 구멍 3건 — ①타인 워크로그 열람(payload accountId 신뢰) ②이슈 상세 스코프 우회(서버 JQL 역산으로 차단) ③시드 권한 세트 오염(범용 update 경로가 우회로). "새 가드를 만들면 옛 경로가 우회로가 된다" 교훈 강조
10. 성능 — 가드 추가 비용: admin은 Jira 1회, 캐시 히트 시 0회. 사용자 화면 영향 없음(기존 27개 호출부 무수정)
11. 결과 — 테스트 223개 통과(BE 165/FE 58), 검증 9/9, 남은 것은 배포 후 실사용 E2E 1건
12. 로드맵 — 액션 단위 세분화(삭제/내보내기), 소속 정의 확장, 감사 로그

작성 지침: 각 슬라이드는 핵심 메시지 1문장 + 불릿 3~4개 이내. 3번/9번은 공격 시나리오를 Before/After로 대비. 5번은 흐름 다이어그램, 8번은 표(세트별 scope) 사용. 코드는 guardedDefine 등록 예시 1줄만.
```

## 9. 하네스 운영 메모

feature-harness 순차 파이프라인(architect → backend → frontend → verifier)으로 완주. 이번 세션의 특징:
- **설계 중 범위 추가**(④ 스코프)를 architect `SendMessage` 재호출로 흡수 — 새 에이전트 없이 컨텍스트 유지 확장이 잘 동작.
- **수정 루프 3회** 전부 SendMessage 재호출: backend gap 수정 → verifier 재검증 → backend 시드 방어 → verifier 최종. 컨텍스트 유지 덕에 각 수정이 10분 내 완료.
- verifier에게 "방어가 없으면 실패로 보고하라"고 **공격 시나리오를 명시**한 것이 §5-3 발견으로 직결 — 검증 항목은 추상적("정합 확인")보다 구체적 우회 시나리오로 줄 것.
