# 검증 리포트 — my-page-revamp

> **추가분 (2차): 워크로그 엑셀 추출 · KPI 상태 통합 · 스킬 직군별 정리** — §6 참조.


## 1. 경계면 교차 검증 (resolver 응답 shape ↔ 프론트 소비 경로)

`guardedDefine` → `responseWrapper` 가 `{ success:true, ...result }` 로 스프레드하므로
서비스 반환값의 최상위 키가 그대로 응답 최상위에 노출된다. 이 전제로 7개 함수를 양쪽 동시 확인.

| resolver | PermissionMap | 서비스 반환 | 응답(래핑 후) | 프론트 소비 | 판정 |
|---|---|---|---|---|---|
| `getMyProjectList` | SELF ✔ | `{success:true, data}` | `{success, data}` | `res.success && Array.isArray(res.data)` (useMyPageProjects) | ✅ |
| `getMyIssueList` | SELF ✔ | `{data: issues}` | `{success:true, data}` | `res.success && res.data` (useMyPageIssues) | ✅ |
| `getMyCalendarWorklog` | SELF ✔ | `{data: chunks}` | `{success:true, data}` | `res.success && res.data` (useMyPageWorklogs) | ✅ |
| `getMySkills` | SELF ✔ | `{data:{accountId, skillIds}}` | `{success, data}` | `res.data.skillIds` (useMySkills, 무변경) | ✅ |
| `setMySkills` | SELF ✔ | `{data:{accountId, count}}` | `{success, data}` | `res.success` 체크 (useMySkills, 무변경) | ✅ |
| `getPermissionCatalog` | PUBLIC ✔ | `{sections:[...]}` | `{success:true, sections}` | `res.sections` (useMyPermissionMatrix) | ✅ |
| `getSettingData` | PUBLIC ✔ | `{hourRate, ...}` | `{success:true, hourRate}` | `settingData?.hourRate` (MyPage) | ✅ |

`userPermissionCheck` (PUBLIC)는 앱 부팅 시 `usePermissionStore` 가 이미 소비 중.
이번 변경은 응답의 `name` 필드를 `roleName` 으로 **저장만 추가** — 기존 `permissions`/`projectScope`/`isUser`
필드와 `canRead`/`canWrite`/`getProjectScope` API는 불변이므로 다른 소비처 영향 없음.

## 2. 서비스 내부 소비자 확인 (CLAUDE.md 2026-07-13 항목)

이번 작업은 **백엔드 서비스/응답 계약을 하나도 바꾸지 않았다**(신규 resolver 0, 시그니처 변경 0).
따라서 백엔드 내부 import/호출 지점 회귀 위험 없음. 프론트 공용 변경은 `usePermissionStore` 1건이며
필드 추가(순증)라 기존 소비처 3곳(App.jsx, 탭 게이팅, 페이지 가드) 모두 무영향.

## 3. 테스트 / 빌드

| 항목 | 결과 |
|---|---|
| `npm test` (루트, jest) | **229 tests passed** / 22 suites FAIL |
| ↳ FAIL 원인 | 전부 `.claude/worktrees/RFC-168/` 사본 파일의 ESM 파싱 오류. 실 소스(`src/`, `static/ui/src/`) 스위트는 전부 PASS. **이번 변경과 무관한 기존 잔재** |
| `static/ui` jest | **74 tests / 8 suites passed**, snapshot 1 passed |
| `static/ui` `npm run build` | **성공**. myPage 관련 경고 0 (남은 경고는 node_modules 소스맵 누락 기존 이슈) |
| i18n merge | `npm run merge` 성공 → `ko-KR.json`/`en-US.json` 갱신 |
| i18n 키 전수 검증 | myPage 17개 파일의 모든 `t('...')` 키가 ko/en 양쪽에 문자열로 존재 — **누락 0** |

## 4. 발견 및 수정한 결함

| # | 내용 | 수정 |
|---|---|---|
| 1 | `@atlaskit/lozenge` 미설치인데 3개 파일에서 import → 빌드 실패 | Atlaskit 토큰 기반 로컬 `MiniBadge` 로 대체(다크모드 자동 대응) |
| 2 | i18n 키를 `"summary.loggedTime.calc"` 처럼 dot-in-key 로 작성 — 프로젝트 관례(완전 중첩)와 불일치, `t()` 해석 불확실 | 전부 중첩 구조로 변환(`loggedTime: { label, calc, tip, value }`) + JSX 참조 동기화 |
| 3 | 프로젝트 선택 해제 시 `enabled:false` + `keepPreviousData` 로 직전 응답이 화면에 남음 | `hasSelection` false면 고정 참조 `EMPTY_LIST` 로 강제 |
| 4 | 차트 tooltip 이 `ordered[dataIndex]` 를 널체크 없이 역참조 | `if (!item) return ""` 방어 |
| 5 | 미사용 `t`/`useI18nStore` import (MyPage.jsx) | 제거 |

## 5. 미검증 (남은 리스크)

- **E2E 미수행.** Forge 배포 전이라 실 데이터 화면 확인 불가. 특히:
  - 팀 관리형 프로젝트에서 coworker 프로퍼티 누락 시 "내 역할" 배지가 전부 협업자로 보일 가능성 [[team-managed-field-gap]]
  - `getMyCalendarWorklog` 기간을 최근 3개월로 넓혔을 때의 응답량/지연 (프로젝트·이슈 수에 비례)
- 기간 92일 초과 시 일별 차트가 sparse 모드로 전환되는 동작은 코드상 보장되나 실측 미확인.

---

# 6. 2차 추가분 검증

## 6-1. 워크로그 엑셀 추출 (신규 resolver 1)

| 항목 | 내용 |
|---|---|
| resolver | `downloadMyWorklogExcel` (`MyPageController.jsx`) |
| PermissionMap | `'SELF'` 등록 — **계약 테스트 통과**(등록↔매핑 양방향 대조 4 tests) |
| 서비스 | `src/resolver/myPage/MyPageService.jsx` (신규) — ExcelJS |
| 응답 shape | `{success:true, filename, fileBase64, total}` → 프론트 `downloadExcelUtil(res.fileBase64, res.filename)` (기존 UserSearchFilter/IssueAnalysisTable 관례와 동일) |
| 시트 | 요약 / 워크로그 / 작업별 합계 (byIssue 없으면 3번째 시트 생략) |

**설계 판단 — 서버 재조회 대신 화면 행 전송.**
IssueAnalysis 엑셀은 서버가 Jira 를 재조회하지만, 워크로그는 사용자가 화면에서 건 필터(프로젝트 선택·기간·검색어)를
서버가 알 수 없다. 재조회하면 "보이는 것 ≠ 받은 파일" 이 되므로, 프론트가 필터링된 행을 그대로 넘기고
서버는 포매팅만 한다. 대신 입력을 신뢰하지 않는다:

- 행 수 상한 20,000 (`WORKLOG_EXPORT_LIMIT_EXCEEDED`)
- 셀 텍스트 500자 절단
- **수식 인젝션 방어** — `= + - @ tab CR` 선행 문자에 `'` prefix
- 0건이면 `NO_WORKLOG_DATA` 로 거부 + 프론트 버튼 비활성

저장소를 전혀 읽지 않는 순수 변환이므로, 조작된 payload 로 타인 데이터에 도달할 경로가 없다.

**신규 유닛 테스트 9건 전부 통과** (`src/resolver/myPage/__test__/MyPageService.test.js`):
생성된 base64 를 ExcelJS 로 **다시 읽어** 시트 구성·합계(7h/0.9MD/2일/3.5h)·라벨 반영·수식 방어·
hourRate 0 폴백·byIssue 생략까지 실측 검증.

## 6-2. KPI 상태 통합

`할당된 작업` 타일 하나에 총계 + 할일/진행중/완료를 함께 표시(기존 진행중·완료 개별 타일 제거, 8→6 타일).
상태 카운트 표기는 자원관리 현황 컬럼과 동일 포맷을 쓰도록 `AssignedIssueCell` 재사용 — 신규 라벨 키 0.
타일 폭 확보를 위해 grid minmax 170px → 210px.

## 6-3. 스킬 직군별 정리

보기 모드(직군별 그룹 칩) / 편집 모드(기존 `SkillMultiSelect`) 분리. 칩은 `SkillChip`(SkillTags) 재사용.
스킬 메타는 `backofficeKeys.skills()` — SkillMultiSelect 와 **동일 쿼리키**라 캐시 공유(추가 요청 0).
직군이 2개 이상일 때만 직군 필터 노출, 미분류는 항상 마지막, 카탈로그에서 사라진 skillId 는 id 로 표시해 유실 은폐 방지.

## 6-4. 2차 테스트/빌드 결과

| 항목 | 결과 |
|---|---|
| 백엔드 `npm test` | **238 tests passed** (기존 229 + 신규 9), 실 소스 FAIL 0 |
| 권한 계약 테스트 | 통과 — 신규 resolver 매핑 누락 없음 |
| 프론트 jest | 74 passed |
| 프론트 build | 성공, myPage 경고 0 |
| i18n 전수 검증 | 18개 파일 모든 `t()` 키 ko/en 존재 — 누락 0 |

## 6-5. 2차 미검증

- 엑셀 **다운로드 자체는 E2E 미확인**. Forge Custom UI 는 iframe(sandbox) 안이라 `a.click()` 다운로드가
  브라우저/설정에 따라 차단될 여지가 있다. 다만 동일 방식이 이미 인력 엑셀·이슈분석 엑셀에서 운영 중이므로
  회귀 위험은 낮다(신규 경로가 아님).
- 대량(수천 건) payload 전송 시 invoke 크기/지연 실측 미확인. 상한 20,000 은 방어선일 뿐 성능 실측치가 아니다.

---

# 7. 3차 — 엑셀 서식

디무브 브랜드 팔레트(틸 스케일)를 적용해 3개 시트 전부에 서식을 넣었다.
색은 임의값이 아니라 팔레트 단계에서 고른다: PRIMARY 500(#21ADAD) 헤더, 700(#14756E) 강조선, 50(#E9F7F4) 라벨 틴트.

| 요소 | 적용 |
|---|---|
| 헤더 | 배경 `#21ADAD` + 흰색 볼드 + 가운데 정렬, 행 높이 22, 하단 `medium` 강조선 `#14756E` |
| 틀 고정 | 목록 2개 시트 `ySplit:1` — 스크롤해도 컬럼명 유지 |
| 구분선 | 전 데이터 셀 4면 `thin` `#DDE3E3` |
| 줄무늬 | 짝수 데이터 행 `#F7FBFA` (행 추적용) |
| 정렬 | 날짜·이슈키·표기·건수 가운데, 시간·MD 우측, 요약·코멘트 좌측 |
| 숫자 서식 | 시간/MD `0.0` (소수 1자리 고정) |
| 자동필터 | 워크로그·작업별 합계 시트 |
| 요약 시트 | 라벨 열 틴트 배경 + 볼드(subtle 색), 값 열 볼드, 행 높이 20. 헤더 라벨(`항목`/`값`)도 i18n 전달값 사용 |

## 7-1. 검증

- **서식 유닛 테스트 6건 추가** → myPage 스위트 **16 tests 전부 통과**. 생성된 base64 를 재파싱해
  fill argb, font color/bold, border style, `views[0].ySplit`, `numFmt`, `autoFilter` 를 직접 단언.
- **실제 파일 생성 후 덤프 검사**: 샘플 워크북(요약/워크로그/작업별, 10행)을 만들어 셀별
  배경·글자색·볼드·정렬·숫자서식·행높이·컬럼폭·틀고정·필터를 눈으로 대조 — 전 항목 의도대로 적용 확인.
  (검사용 임시 테스트는 확인 후 삭제, 리포지토리에 잔존물 없음)
- 기존 값 검증 테스트 10건 모두 그대로 통과 → **서식 추가가 데이터를 훼손하지 않음**.

## 7-2. 3차 전체 결과

| 항목 | 결과 |
|---|---|
| 백엔드 `npm test` | **245 tests passed** (2차 238 + 서식 6 + 요약헤더 1), 실 소스 FAIL 0 |
| 프론트 build | 성공 |
| i18n 전수 검증 | 누락 0 (`export.item`/`export.value` 추가) |

## 7-3. 수정한 테스트 기대

`plain.fill` 을 `toBeUndefined()` 로 단언했으나 ExcelJS 는 xlsx 재파싱 시 채움 없는 셀에도
`{pattern:'none'}` 을 채운다 → `fill?.pattern !== 'solid'` 로 정정. 코드 결함이 아니라 기대값 오류였다.
