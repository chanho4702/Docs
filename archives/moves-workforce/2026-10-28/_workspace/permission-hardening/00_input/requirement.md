# 권한관리 고도화 — 요구사항

작성일: 2026-07-03 | 브랜치: RFC-134 계열 (신규 RFC 번호는 사용자 확정 전) | 슬러그: permission-hardening

## 배경 (As-Is)

- 권한 세트는 KVS `permission` 엔티티: `{ id, name, edit, pages: [{ pageId, value: { read, write } }] }`
- 시드 `Admin`/`Member` (edit:false, `src/seed/SeedData.js`), 백오피스에서 커스텀 세트 CRUD (`src/resolver/backoffice/permission/`)
- 사용자(users 테이블)당 `permission_key` 1개. Jira ADMINISTER 보유자는 자동 Admin (`userPermissionCheckService`)
- 프론트 `usePermissionStore.canRead/canWrite(pageId)`로 탭·버튼 노출 제어 (27개 파일 사용)

## 확정된 문제점 (이번 범위의 근거)

1. **서버사이드 enforcement 부재**: `userPermissionCheck` 외 모든 resolver가 호출자 권한을 검사하지 않음. 브라우저 콘솔에서 `invoke()` 직접 호출 시 Member가 사용자 삭제·권한 변경 가능. 마켓플레이스 보안 심사 리스크.
2. **fail-open 기본값**: 프론트 `usePermissionStore.js:34` — 권한이 안 내려온 pageId는 `{read:true, write:true}`. 백엔드(미등록 사용자 전부 false)와 비대칭.
3. **페이지 정의 중복/드리프트**: 페이지 정의가 ①프론트 `PAGE_IDS`(constants/pages.jsx) ②`getPages` ③시드 Admin ④시드 Member ⑤기존 설치 테넌트의 저장된 커스텀 권한 세트 — 5곳에 흩어짐. 실제 드리프트 발생 중: `PROJECT_GANTT`는 PAGE_IDS에만 있고 시드에 없음, `WORKLOG`는 시드에 있고 PAGE_IDS/getPages에 없음.

## 이번 범위 (4가지)

### ① 서버사이드 권한 가드
- resolver 레벨 공통 가드 도입. 각 resolver 함수에 필요한 `(resourceKey, action)` — action은 `read`/`write` — 을 선언하고, 호출 시 검증. 미충족 시 표준 에러(`{success:false, error:{code:...}}`) 반환 — `responseWrapper`/커스텀 에러 체계(`src/error/`, `ErrorCodes`)와 일관되게.
- 기존 `responseWrapper` 합성 형태 권장 (예: `resolver.define('x', responseWrapper(permissionGuard('PROJECT','write')(handler)))` 또는 wrapper 옵션 인자).
- **성능 설계 필수**: 매 호출마다 권한 조회가 붙음. 힌트 — Forge resolver `req.context.accountId`가 제공되므로 `getCurrentUserApi()` 호출 불필요할 수 있음(확인 필요). ADMINISTER 체크·user DB 조회·KVS permission 조회의 호출 횟수/캐싱 전략을 설계에 명시할 것. (asApp 사용은 지양 — 사용자 컨텍스트 requestJira 우선, 마켓플레이스 심사 부담)
- **적용 범위 전수 매핑**: `src/index.js`에 등록된 모든 resolver 함수 → 요구 (resourceKey, action) 매핑 표를 설계서에 포함. 권한 불요 함수(예: userPermissionCheck 자신, i18n 등)는 `PUBLIC` 명시.

### ② fail-close 전환
- 프론트 미정의 pageId 기본값을 `{read:false, write:false}`로 전환.
- 단, 원래 fail-open을 둔 이유(설치/업데이트 직후 권한 데이터 미비)가 있으므로: **백엔드가 항상 완전한 페이지 목록을 내려주도록** 보강 — `userPermissionCheckService`가 저장된 권한 세트에 없는 신규 resourceKey를 카탈로그 기본값으로 병합해 응답. 프론트는 받은 대로만 사용(자체 기본값 로직 제거 또는 false 폴백만 유지).
- 백엔드 가드도 동일 원칙: 매핑에 없는 resolver 함수는 기본 거부(deny-by-default)로 할지, 등록 시 강제(가드 미선언 함수 검출)로 할지 설계에서 결정.

### ③ 페이지(리소스) 정의 단일 소스화 + 마이그레이션
- **리소스 카탈로그를 백엔드 한 곳에 정의** (예: `src/permission/ResourceCatalog.js`): 각 resourceKey에 대해 { key, 섹션, 커버하는 페이지/탭 목록, Admin 기본값, Member 기본값, 신규 키 추가 시 커스텀 세트 기본값 }.
- 프론트는 `userPermissionCheck` 응답(이미 pages 배열 수신)만 신뢰. `PAGE_IDS` 하드코딩 제거 또는 카탈로그에서 파생. 권한 설정 화면(`PermissionSettingPage`)의 페이지 목록도 백엔드 카탈로그 기반으로 조회하도록(신규 resolver 필요 시 추가).
- **기존 테넌트 마이그레이션**: SEED_VERSION 상향 + `ensureSeed` 경로에서 기존 저장 권한 세트(시드+커스텀 전부)에 카탈로그의 신규 키를 기본값으로 병합, 카탈로그에 없는 고아 키 정리. 멱등하게.
- 현행 드리프트 정리: `PROJECT_GANTT` 시드/카탈로그 등재, `WORKLOG` 처리 방침 결정(getPages 주석 처리된 상태 — 카탈로그에서 제외할지 복원할지 설계에서 판단·명시).

### ④ 프로젝트 데이터 범위 권한 (2026-07-03 사용자 추가 요청)
- **비관리자(일반 사용자)는 본인이 속한 프로젝트의 정보만 볼 수 있도록 "설정 가능"하게** 한다.
- "설정 가능" = 관리자가 켜고 끌 수 있어야 함. 저장 위치는 설계에서 결정 (권장 검토: 권한 세트 단위 scope 필드 `projectScope: 'ALL' | 'MEMBER_ONLY'` — 기존 모델·권한 설정 UI와 일관. 전역 설정 1개 방식과 비교 후 채택 근거 명시).
- **enforcement는 서버사이드** (①과 동일 원칙): 프로젝트 목록/상세/칸반/대시보드/리포트/간트/캘린더/비용/진척 등 프로젝트 데이터를 반환하는 resolver가 소속 여부로 필터링. 프론트 숨김만으로는 불가.
- 소속 판정 소스: 프로젝트 인력 테이블(project_users 계열)의 accountId 매칭 — 실제 스키마/쿼리 확인 후 설계에 명시.
- Jira ADMINISTER(=principal.isAdmin)는 항상 ALL. 
- 설계에 포함할 것: scope 적용 대상 resolver 목록(②-B 매핑 표에 scope 열 추가 또는 별도 표), 상세 페이지 직접 접근(findProjectById로 비소속 프로젝트 id 호출) 시 거부 동작·에러 코드, 목록성 조회의 쿼리 레벨 필터 방식, 프론트 UI(권한 설정 화면 scope 토글 + 비소속 상세 접근 시 처리), 마이그레이션(기존 세트의 scope 기본값 = 'ALL'로 현행 동작 보존).

## 권한 키 granularity 방침 (사용자 확정)

- 페이지와 권한 키의 1:1 매핑은 **하지 않는다**. 권한 키는 "권한 경계(리소스)" 단위로 묶는다.
- 키 분리 기준 3가지(카탈로그 문서에 명기): (a) 민감도가 다름 (b) 대상 사용자군이 다름 (c) write 의미가 다름. 해당 없으면 상위 키에 묶음.
- 현행 13개 키 골격 유지. 분리 후보로 `PROJECT_COST`(비용 탭, 민감도 사유) 검토 — 설계에서 채택 여부와 기본값 제안.

## 범위 외 (로드맵 기록만)

- 액션 단위 세분화(delete/export 등) — 스키마가 `value`에 키 추가로 하위호환 확장 가능함만 설계서에 명기
- Jira 그룹 매핑, 감사 로그
- ~~프로젝트 단위 데이터 범위 권한~~ → ④로 범위 편입 (2026-07-03)

## 제약/규칙

- Forge SQL(TiDB): FK 미강제·트랜잭션 미지원. KVS: 값 240KiB 한도.
- Jira API asApp 지양(사용자 컨텍스트 우선).
- i18n: `locales/kr/*.json`+`locales/en/*.json`에 추가 후 `npm run merge` (ko-KR/en-US 직접 수정 금지).
- 모든 resolver는 `responseWrapper` 경유, 에러는 `src/error/` 커스텀 클래스 + `ErrorCodes`.
- 기존 27개 프론트 파일의 `canRead/canWrite` 호출부는 시그니처 유지(스토어 내부만 교체)가 바람직 — 대규모 호출부 수정 지양.
