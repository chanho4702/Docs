---
name: project-my-page
description: "마이페이지(/my-page) 개인 종합 대시보드, RFC-168 신설·RFC-160 병합 → 2026-07-22 전면 개편(2분할·차트·권한가시화)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f9fd8c5-77c1-4b7c-bfbe-65206946737e
  modified: 2026-07-22T06:29:41.584Z
---

마이페이지(My Page) — 사용자 개인 종합 대시보드. RFC-168에서 신설·RFC-160 병합(2026-07-21, a50341e) → **2026-07-22 전면 개편(my-page-revamp)**.

## v2 개편 (2026-07-22) — 프론트 전용, 백엔드 신규 0

레이아웃: 헤더(프로필·권한배지·기간필터) → KPI 8 → **[좌 내 프로젝트(선택형) | 우 내 작업]** → 차트 3종 → 내 워크로그 → [내 권한 | 내 스킬]

- **단일 스코프 원칙**: 좌측 `selectedProjectIds` 가 작업·차트·워크로그 전부의 스코프(myWork UX와 동일). 초기값=진행중 프로젝트, 0개면 조회 안 걸고 안내(JQL 폭주 방지). enabled:false + keepPreviousData 조합이 직전 응답을 남기므로 화면단에서 `EMPTY_LIST` 로 강제.
- **권한 가시화**: 신규 API 없이 `getPermissionCatalog`(구조) × `usePermissionStore`(값) 병합 → `useMyPermissionMatrix`. store에 `roleName` 필드만 추가(userPermissionCheck의 `name`을 그동안 버리고 있었음). 라벨은 `common.pages.*`/`permission.desc.*` 재사용.
- **차트 3종**: 상태분포(도넛)·일별 투입시간(바)·작업별 투입 TOP8(가로바). ECharts 직접 사용 + `useColorMode`.
- **필터**: 헤더 기간프리셋(주/월/3개월/직접) · 프로젝트(검색·진행중만·전체선택) · 작업(검색·상태·내역할·마감) · 워크로그(검색·평면/이슈별) · 권한(검색·수준).

## v2 추가분 (같은 날 2차)
- **워크로그 엑셀 추출**: `downloadMyWorklogExcel`(SELF, MyPageService.jsx 신규) — 유일한 신규 resolver. **서버 재조회 안 함**, 프론트가 화면 필터 적용된 rows를 보내고 서버는 ExcelJS 포매팅만(시트 3: 요약/워크로그/작업별). 이유: 서버는 사용자가 건 필터를 모르므로 재조회하면 "보이는 것≠받은 파일". 대신 입력 불신 방어(20000행 상한·500자 절단·수식 인젝션 `'` prefix·0건 거부). 시트 라벨은 프론트가 t()로 만들어 전송(서버에 i18n 사전 없음). 유닛테스트 9건(생성 base64를 ExcelJS로 재파싱해 실측).
- **KPI 통합**: 할당작업 타일 하나에 총계+할일/진행중/완료(`AssignedIssueCell` 재사용, 8→6 타일).
- **스킬 직군별 정리**: 보기(직군 그룹 칩, `SkillChip` 재사용)/편집(SkillMultiSelect) 모드 분리, `backofficeKeys.skills()` 동일 쿼리키로 캐시 공유.

## 산출 불가로 판정한 것 (재시도 금지)
- **프로젝트(RMS)별 투입시간 분해 불가**: 백엔드 JQL이 `fieldsByKeys` 없이 `moves_RMS_projectId`를 요청해 이슈 응답에 RMS 프로젝트 식별자가 안 실린다 [[project-forge-field-key-fieldsbykeys]]. → 이슈별 집계로 대체, 프로젝트별로 보려면 좌측 단일 선택.
- **팀 대비 기여율 불가**: SELF 스코프라 타인 워크로그 조회 불가. 기여도는 내 투입시간/처리율/작업량으로만 표현(InfoTip에 한계 명시).
- 이슈 fields에 `priority`/`timetracking` 없음 → 우선순위·잔여추정 지표 불가.

## 유지되는 v1 결정
- "할당" 판정 = assignee **또는** coworker 프로퍼티(`movesRmsCoworkers`) — 화면에 "담당/협업" 배지로 구분 표시.
- 처리율 = 이슈 **건수** 기준(`statusCategory.key==='done'`), 프론트 useMemo 집계(전용 API 없음).
- 신규 백엔드는 스킬 SELF 2종(`getMySkills`/`setMySkills`)뿐, `getSkillList`는 PUBLIC 완화. [[project-permission-hardening]]

## 상태
- v2 구현 + 검증 완료: 프론트 빌드 성공, 프론트 74 테스트·백엔드 238 테스트(신규 9 포함) 통과, resolver 8종 경계면 shape 교차확인, 권한 계약 테스트 통과, t() 키 전수 검증.
- **E2E 미수행** (forge deploy 후 화면 확인 필요).
- 산출물: `_workspace/my-page-revamp/` (v1은 `_workspace/my-page/`).
