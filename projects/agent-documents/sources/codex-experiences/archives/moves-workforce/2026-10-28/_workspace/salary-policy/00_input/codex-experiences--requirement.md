# 급여 정책 (Salary Policy) — 요구사항

RFC: **RFC-163**
작성일: 2026-08-03
슬러그: `salary-policy`
선행 기능: `_workspace/salary-management/` (2026-07-13, 백오피스 users.salary=연봉 / project_users.salary=투입급여 + salary_type)

---

## 1. 문제 (사용자 원문)

> "설정 인력관리에서 연봉이 그대로 노출된게 문제가 있을 수 있어. 그래서 사용자에게 선택지를 주려고 해.
> 등급에 매핑해서 범위로 설정하게 할지, 아님 인원별로 설정할 수 있게 할지 나눌 필요가 있어.
> UI UX 더럽지 않게 설정이 필요해."

현재 `백오피스 > 인력관리` 목록(`UserListPaging.jsx:73`)과 편집 모달(`UserEditModal.jsx:214~229`)에서
**개인 연봉 실수치가 그대로 표시**된다. 인사 정보 노출 리스크이며, 조직에 따라 개인 연봉을
앱에 입력하는 것 자체를 원치 않는 경우가 있다.

## 2. 해결 방향

전사 단위로 **급여 산정 정책(salaryPolicy)** 을 선택하게 한다.

| 모드 | 급여 원천 | 개인 연봉 |
|------|-----------|-----------|
| `INDIVIDUAL` (기존, 기본값) | `users.salary` (개인 연봉) | 입력·표시함 (현행 유지) |
| `LEVEL_BAND` (신규) | 등급(level)에 매핑된 급여 범위의 **대표값** | **저장은 보존, 화면·응답에서 완전 숨김** |

## 3. 확정된 설계 결정 (사용자 픽스, 2026-08-03)

### D1. 정책 단위 = **전사 단일 모드**
- 백오피스 설정에서 `LEVEL_BAND` / `INDIVIDUAL` 중 **하나만** 선택.
- 하이브리드(등급 기본값 + 개인 오버라이드)와 프로젝트별 선택은 **명시적으로 거부됨** —
  "이 사람 값이 어디서 왔나"를 매 화면에 표시해야 해서 UI가 복잡해지고, 전사 대시보드·
  포트폴리오 비용 합산 기준이 섞이기 때문.
- 따라서 화면·계산 경로는 항상 **한 가지**다. 분기는 정책 조회 1회로 끝난다.

### D2. 등급 값 형태 = **범위(min~max) + 대표값**
- 등급마다 `하한 / 상한`을 입력받고, **비용 계산에는 대표값**을 사용한다.
- 대표값 기본 = 중앙값 `(min+max)/2`, 관리자가 직접 수정 가능.
- 화면에는 `3,000~3,800만` 형태의 **범위로만** 노출 → 등급을 알아도 개인의 정확한 금액을
  역산할 수 없다(단일 표준단가 방식이 거부된 이유가 이것).

### D3. 기존 개인 연봉 = **보존 + 화면에서 완전 숨김**
- DB `users.salary` 값은 **삭제하지 않는다**(되돌리기 가능해야 함).
- `LEVEL_BAND` 모드에서는 **resolver 응답에 salary를 아예 싣지 않는다** — 프론트에서
  `display:none` 처리하는 수준이 아니라 **서버가 안 내려주는 것**이 요구사항이다.
  (권한자 예외 표시도 거부됨 — "노출된다"는 원래 문제가 남기 때문)
- `INDIVIDUAL`로 되돌리면 기존 값이 그대로 복구된다.

### D4. UI 배치 = **설정 페이지 '급여 정책' 카드 + 등급 페이지에 밴드 컬럼**
```
[백오피스 > 설정]
┌ 급여 정책 ─────────────────────────┐
│ ◉ 등급 기반   ○ 인원별              │
│   등급에 급여 범위를 매핑합니다.     │
│   개인 연봉은 저장·표시되지 않습니다.│
│                    [등급 밴드 설정 →]│
└────────────────────────────────────┘

[백오피스 > 등급]
등급   설명      급여 범위          대표값
L1    주니어    3,000~3,800만      3,400만
L2    미들      3,800~4,800만      4,300만
L3    시니어    4,800~6,500만      5,650만
```
- 정책 선택 = 설정 페이지 카드 1장 (기존 `EtcSetting.jsx` 옆에 형제 카드로 추가).
- 실제 금액 입력 = 기존 등급 관리 화면(`/backoffice/level`)에 컬럼 추가 — 설정 페이지 안에
  등급표를 인라인으로 넣는 안은 거부됨(등급 관리 화면과 중복 UI가 생김).
- 설정 카드에서 등급 페이지로 가는 **바로가기 링크** 제공.
- `INDIVIDUAL` 모드일 때 등급 페이지의 밴드 컬럼은 숨기거나 비활성 처리 (설계에서 결정).

### D5~D8. 설계 검토 후 추가 확정 (사용자 픽스, 2026-08-03)

| # | 항목 | 결정 | 근거 |
|---|------|------|------|
| D5 | LEVEL_BAND 에서 프로젝트별 투입급여·계산모드 편집 | **서버가 거부**(`updateProjectMemberSalary` → `LogicalError`). 급여 관리 탭은 읽기 전용 밴드 뷰 | 계산에 쓰이지 않는 값을 편집하게 두면 "왜 숫자가 안 바뀌나"가 발생. 대안(편집 허용/프로젝트별 대표값 오버라이드) 거부 |
| D6 | 기존 결함 `getSummaryData.total_salary` 비용 게이트 누락 | **별건 RFC로 분리.** RFC-163 은 LEVEL_BAND 에서 키 제거만 하고 INDIVIDUAL 동작은 손대지 않는다 | 무회귀 검증을 깨끗하게 유지. 권한 변경은 별도 검증 필요 |
| D7 | 구현 범위 | **P0 + P1**(설계서 §11). P2 는 제외 | P0만으로는 대시보드 `total_salary`·급여 차트가 LEVEL_BAND 에서 남아 노출이 지속됨. P2 는 무관한 회귀 리스크 |
| **D8** | `portfolio_snapshot` 배치 지연 대응 (정책 전환 후 다음 집계까지 옛 정책 숫자가 남는 문제) | **A안 — 정책 불일치 스냅샷은 비용축 마스킹.** 스냅샷에 집계 당시 정책(`salary_policy` 컬럼)을 저장하고, 현재 정책과 다르면 서버가 `costMasked=true` + `costMaskedReason='SNAPSHOT_STALE_POLICY'` 로 내린다 (설계서 §4-7-1, A-1~A-7) | 기존 `costMasked` 신호를 포트폴리오(`costGating.js`)·팀 분석(`useTeamAnalyticsData.js`)이 **이미 전부 존중**하므로 **프론트 무수정으로 20여 개 렌더 지점이 한 번에 가려진다**. B(큐 재집계 트리거)는 배치 경로 신설로 작업량·리스크가 늘고 실패 시 결국 A 의 방어가 또 필요. C(배너만)는 노출이 배치 주기만큼 지속돼 요구사항 위반 |

## 4. 영향 범위 (사전 조사 결과)

### 백엔드
- `src/rdb/schema/ddl/users.sql.js` — `users.salary` 스키마 변경 **없음**(보존)
- KVS `level` 엔티티 — 현재 `id / name / description`뿐. **급여 밴드 속성 신규 추가 필요**
  → `manifest.yml`의 `level` attributes 선언 필수 (미선언 시 저장 422 semantic error).
    스키마 반영에 `forge deploy` 필요.
    ⚠ KVS는 **빈 문자열 저장 거부** — 미입력 밴드는 속성 자체를 생략할 것.
- KVS `settings` 엔티티 — `salaryPolicy` 필드 추가 (`getSettingData` / `updateSetting` 경로)
- `src/resolver/projectCost/EffectiveSalary.js` — `computeEffectiveSalary`의 `annualSalary`
  입력 원천이 정책에 따라 분기(개인 연봉 ↔ 등급 대표값). **환산식(월할) 자체는 불변.**
- `resolveMemberSalaries` 소비처 전수 확인 필요:
  `ProjectCostService`, `PortfolioAggregator`, `ProjectDashboardService`,
  `MyTeamAnalysisService`, `ResourceManagementService`, `ProjectTeamService`
- `src/resolver/backoffice/user/UserService.js` — 목록/상세 응답에서 salary 필드 게이팅
- 엑셀 업로드(`exceljs`) 경로의 `Salary` 헤더 처리 — `LEVEL_BAND`에서의 동작 결정 필요

### 프론트
- `backoffice/page/setting/` — '급여 정책' 카드 신규
- `backoffice/page/level/` — 목록/등록/수정 모달에 밴드 입력 추가
- `backoffice/page/user/UserListPaging.jsx`, `modal/edit/UserEditModal.jsx` — 정책별 분기
- 프로젝트 상세 급여 관리 탭 — `ANNUAL` 모드 표시가 정책에 따라 달라짐
- 정책 값을 읽는 공통 훅/스토어 필요 (매 컴포넌트가 settings를 각자 invoke하지 않도록)

### i18n
- `locales/kr|en/setting.json`, `level.json`, `user.json`, `cost.json` 키 추가
- `cd static/ui && npm run merge` 필수

## 5. 제약·주의

- **하위호환:** 기존 설치는 `salaryPolicy` 미설정 상태 → `INDIVIDUAL`로 폴백해야 기존 동작 불변.
- **비용 계산 무회귀:** `INDIVIDUAL` 모드에서 기존 모든 비용 수치가 **한 자리도 바뀌면 안 된다.**
- **권한:** 신규 카탈로그 키를 만들지 말고 기존 키 재사용 검토
  (설정=`SETTING`, 등급=`LEVEL`, 인력=`USER_MANAGEMENT`, 비용=`PROJECT_COST`).
- **fail-close:** 정책 조회 실패 시 salary를 노출하는 쪽으로 폴백하지 말 것.
- 등급 미지정(`level_key = null`) 인원이 `LEVEL_BAND` 모드일 때의 처리 정의 필요
  (비용 0 처리 + 화면 경고 등).

## 6. 진행 상태

| 단계 | 상태 |
|------|------|
| Phase 2 설계 | **완료** — `01_architect_design.md` r3 (미확정 사항 0건). D1~D8 전제 |
| Phase 3 백엔드 | **완료** — `02_backend_report.md` (§2 가 실제 응답 shape). 62 suites / 995 tests |
| Phase 4 프론트 | **완료** — `02_frontend_report.md`. 62 suites / 1061 tests, 빌드 성공 |
| Phase 5 검증 | **완료** — `03_verify_report.md` (2회: 최초 + F1·F2 수정 후 재검증). **잔존 실패 없음** |

**커밋 `1cfc9bf`** (2026-08-04, 브랜치 `RFC-163` → `develop` fast-forward 머지 완료).
작업에 쓴 worktree `C:\CloudJira\moves-workforce-rfc-163` 은 정리했고, 산출물은 이 디렉토리로 옮겨 보존.

### 남은 일 — 배포 검증 (코드로는 검증 불가, `03_verify_report.md` §4)
1. **`manifest.yml` 과 코드를 같은 커밋으로 `forge deploy`** — 선언 없이 밴드 저장 시 KVS 422. `forge tunnel` 은 스키마 미갱신
2. **v015 마이그레이션** 실행 확인 (`portfolio_project_snapshot.salary_policy`, 멱등 ALTER)
3. LEVEL_BAND 전환 후 **재집계 전 비용축이 비는 것은 의도된 동작**(A안 대가) — "권한 없음"이 아니라 "재집계 필요"로 보이는지
4. `unpricedMemberCount === null`(배포 후 10분 레거시 캐시) 구간에서 **경고가 안 뜨는지**
5. CostPage 신규 UI 실물 렌더 (경고 / 정책 미확정 시 `CostPolicyBasis` 미렌더 / Card 헤더 레이아웃)

### 별건 백로그 (이번 RFC 범위 밖, 발견만)
- `getSummaryData.total_salary` 비용 게이트 누락 (D6 — INDIVIDUAL 에서 1인 프로젝트면 개인 급여 그대로)
- `PortfolioSalaryByProject.jsx` — 미참조 고아 위젯인데 `costGating` 미경유. 부활 시 게이팅 없이 금액 렌더
- P2 미착수: 인라인 `['getSettingData']` 15곳 → `settingKeys.detail()` 통일, `LevelList.jsx:9` `loading`↔`isLoading` 버그
