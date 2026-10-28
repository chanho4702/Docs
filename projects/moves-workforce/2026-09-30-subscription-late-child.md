# 구독 사후 편입 — 편입된 부모 밑으로 나중에 들어온 자식 (RFC-209)

- 날짜: 2026-09-30
- 프로젝트: moves-workforce (Jira Forge)
- 관련: [[2026-08-04-project-subscription]]
- 커밋: `24222b8` (RFC-209, 배포 전)

## 증상
같은 에픽(DS-13) 밑의 하위 작업 두 건 중 DS-17은 구독으로 자동 편입됐고 DS-15는 안 됐다.

## 원인
DS-15는 **최상위 스토리로 만들어졌다가 75초 뒤 하위 작업으로 전환 + 부모 지정**됐다(changelog의 `issuetype`·`IssueParentAssociation`).
- 생성 이벤트: 그 시점엔 "선택 타입 아님 + 부모 없음" → `ISSUE_TYPE_EXCLUDED` 확정 거부. 로그도 없다.
- 앱은 `avi:jira:created:issue`만 구독. 수정 이벤트 없음.
- 시간별 스윕: `issuetype in (선택) AND moves_RMS_projectId IS EMPTY` 부모 집합에서만 자식 확장. DS-13은 이미 편입돼 집합에 없음 → 자식 영구 누락.

## 수정
스윕에 RECONCILE 전용 2단계 추가. **자식 쪽**에서 출발한다 — 부모를 바꿔도 부모의 `updated`는 안 움직이지만 자식의 `updated`는 움직인다.
1. `IS EMPTY AND parent is not EMPTY AND issuetype not in (선택)` + baseline/watermark 하한
2. 부모 키를 `moves_RMS_projectId = "<projectId>" AND key in (...)`로 편입 확인
3. 편입된 부모의 자식만 담고 자손은 기존 `collectDescendantIssues` 재사용

비용은 프로젝트 크기가 아니라 최근 활동량에 비례(조용하면 시간당 1요청).

## 교훈
- "부모 집합 → 자식 확장" 구조는 **부모가 먼저 편입된 뒤 생긴 자식**을 구조적으로 못 본다. 편입 상태가 바뀌는 집합을 출발점으로 쓰면 이런 구멍이 생긴다.
- 조용한 거부(defer 아님)는 로그가 없어 진단이 어렵다. 이슈 changelog + `forge logs -n 2000 --since <ISO>`로 시간대를 맞춰 봐야 한다(기본 100줄).
- `forge logs -e production`은 **모든 설치**를 합쳐 보여준다. 매시 19분 "license inactive"는 dmove가 아닌 다른 사이트였다.
- Jira changelog는 이슈 프로퍼티 변경을 기록하지 않는다. `movesRms` 흔적은 프로퍼티를 직접 읽어야 한다.

## 보류 (Codex 지적)
- 고정 예산에서 후보 페이지 재시도 진행성 — 1단계도 같은 성질이고, 태깅되면 결과집합이 줄어 매 회 전진한다.
- baseline 이전 생성 이슈의 사후 편입 차단 — 제품 의미가 "백필 안 함"이고 `filterByBaseline`이 어차피 거른다.
