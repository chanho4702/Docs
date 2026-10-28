# 2026-09-03 권한 시스템 감사 + RFC-198 (세트 배정 승격·스코프 fail-open 2건)

프로젝트: [[moves-workforce]] · 브랜치 RFC-198 · 직접 구현(하네스 미사용, 백엔드 중심 소규모) · 코덱스 검토 · 선행: [[2026-07-06-permission-hardening]]

## 무엇을 했나
사용자가 "우리 권한 시스템 지적해줘"로 시작. `src/permission/` 전체 + 소비 서비스 + 프론트 스토어를 읽고 가설을 실제 payload·서비스 코드로 검증한 뒤, 사용자가 확정한 3건을 RFC-198 로 수정.

**감사에서 나온 것(우선순위순)**
1. **USER_MANAGEMENT write 하나로 자기에게 Admin 세트 배정 가능.** `updateUserService`가 permissionKey 를 검증 없이 저장하고, 편집 모달은 세트 목록 전체(Admin 포함)를 옵션으로 냈다. TEAM_MANAGEMENT write 도 `team.permissionKey` 로 같은 일이 가능. → "세트를 정의하는 권한"과 "배정하는 권한"이 분리돼 있는데 배정이 정의보다 셌다.
2. **`scopedProjectIds(undefined) === null`(=전체) — principal 누락이 fail-open.** CLAUDE.md 는 fail-close 라고 적혀 있었고, 형제 함수 `assertProjectIdWritable` 은 실제로 fail-close 라 규약이 갈려 있었다.
3. **detail 스코프 검증이 `if (pid && ...)` — payload 에서 projectId 만 빼면 검증이 사라진다.** `searchRegisteredJiraUsers` 는 detail 로 선언됐지만 payload 가 `{keyword}` 라 검증이 한 번도 안 돌았다.
4. 구조적: 프로젝트 단위 역할(PM vs 팀원) 부재 · grant OR 확장 누적으로 키 의미 흐려짐 · 세트 참조 무결성 없음 · `clearPrincipalCache` 호출처 0 · PermissionMap 주석 stale(updateIssueCoworkers 는 이미 닫혀 있었음).

**사용자가 의도로 확정한 것(결함 아님)**
- 전사 대시보드 집계가 `asApp` 배치인 것 — "Jira 권한이 없어서 못 봐도 차트는 일관적이어야 한다". 부작용: 프로젝트 상세 탭은 asUser 실시간이라 Jira 권한 제한 사용자는 두 화면 숫자가 어긋날 수 있음. 문의 오면 이게 원인.

## 결정과 이유
1. **배정 상한 규칙 = "자기가 가진 것까지만 줄 수 있다."** Admin 세트만 특별 취급하면 커스텀 강세트로 우회된다. Jira admin·PERMISSION_MANAGEMENT write 는 상한 없음(세트를 정의할 수 있으면 배정도 할 수 있어야 한다). projectScope 는 ALL > TEAM_ONLY > MEMBER_ONLY 순으로 본다.
2. **직접 배정과 팀 상속을 같은 함수로.** 사용자 편집(permissionKey·teamKey 이동), 팀 생성/수정(permissionKey·parentTeamKey 변경), 팀 소속 이동 — 5개 경로 전부 `assertCanAssignPermissionSet` 하나를 통과. 한 경로만 막으면 "Admin 상속 팀으로 나를 옮기기"로 우회된다.
3. **"바뀔 때만" 검사.** 직무만 고치는 저장이 과거 배정 때문에 막히면 안 된다. 실효 세트(직접 → 없으면 상속)가 바뀔 때만 검사.
4. **배치는 `SYSTEM_PRINCIPAL` 명시.** `getActiveProjectsService()` 를 PortfolioAggregator·SchedulerService 가 principal 없이 부르고 있었다 — fail-close 로 바꾸면 이 둘이 0건이 된다. "누락"과 "의도적 전체"를 구분하는 값이 필요.
5. **`searchRegisteredJiraUsers` 는 detail → none.** 스코프 사용자에게 projectId 가 필수가 되면 이 resolver 는 항상 거부된다. 실제 의미(프로젝트 컨텍스트 없는 검색)대로 선언.
6. **시드 `permission-Member` 는 상한 면제.** 코덱스 지적 — 엄격 규칙대로면 USER_MANAGEMENT 만 가진 관리자가 신규 사용자를 못 만든다(기본값이 Member 인데 Member 가 여는 WORKFORCE read 를 본인이 다 갖고 있어야 함). 엑셀 일괄 등록은 어차피 Member 를 무검사 배정하고, 시드는 edit:false 라 승격 도구가 못 된다. 면제 조건은 **시드 id + edit:false** 둘 다.
7. **코덱스 지적 중 보류한 것**: `assignUsersToTeam` 이 직접 세트 보유자만 옮길 때도 팀 세트를 검사(과차단, users 조회 추가 필요) · `searchRegisteredJiraUsers` none 은 기존 노출을 정직하게 선언한 것 · 부모 팀 변경이 손자까지 바꾸는 건 위임 모델대로 · 엑셀 경로는 서버가 Member 고정이라 우회 아님.
8. **커밋은 하지 않음.** 사용자가 "작업해줘"만 했고, 커밋 트레일러 정책이 사용자 지시(Co-Author 금지)와 하네스 기본값이 충돌해 사용자 결정으로 남김.

## 겪은 문제
- 새 검사가 기존 테스트 2개를 깼다(UpdateUserMerge·SalaryPolicyLeak — principal 없이 서비스 호출). 관심사가 다른 테스트라 `PermissionAssignment` 를 jest.mock 으로 통과시켰다. **fail-close 를 추가하면 "principal 없이 서비스를 직접 부르는" 기존 테스트는 반드시 깨진다** — 깨지는 게 맞고, 그 테스트의 관심사에 따라 mock 할지 principal 을 줄지 정한다.
- 로케일 JSON 은 CRLF + 4칸 들여쓰기 — `json.dump` 로 다시 쓰면 파일 전체가 diff 된다. 텍스트 삽입으로 처리.
- Bash 도구 heredoc 안의 Python 문자열에서 `\\n` 이 실제 개행으로 바뀌어 SyntaxError. 패치 스크립트는 Write 도구로 파일을 만들고 실행하는 편이 안전.

## 교훈
- **권한 감사는 "가드 바깥"을 봐야 한다.** 가드(guardedDefine·deny-by-default·allowlist)는 튼튼했고, 구멍은 전부 (a) 출입증 발급(세트 배정) (b) 가드가 서비스에 위임한 스코프 필터 (c) 가드가 관례(payload 키 이름)에 의존한 지점에 있었다.
- **"fail-close" 는 함수마다 확인한다.** 같은 디렉터리의 두 함수가 principal 누락에 반대로 동작하고 있었고, 문서는 한쪽만 적고 있었다.
- **`detail` 선언과 실제 payload 를 대조하라.** 선언만 보면 안전해 보이는 resolver 가 실제로는 검증 0회일 수 있다. 계약 테스트(mode 값 유효성)로는 안 잡힌다.
- **사용자 의도를 먼저 묻고 결함을 분류하라.** asApp 집계는 결함처럼 보였지만 "차트 일관성"이라는 명확한 의도였다. 쉽게 설명해 달라는 요청 뒤에 의도가 나왔다.

## 남은 것
- 프로젝트 단위 역할(PM/팀원) — 별도 RFC 규모.
- grant OR 확장 정리, 세트 삭제 시 team.permissionKey 참조 검사, `clearPrincipalCache` 배선, `getSettingData` PUBLIC 범위.
- 프론트: 편집 모달의 세트 셀렉트에서 배정 불가 세트를 미리 비활성화(서버 거부는 되지만 UX).
- 배포·E2E 미수행.
