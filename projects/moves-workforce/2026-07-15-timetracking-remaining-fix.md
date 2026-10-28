---
tags: [moves-workforce, jira, timetracking, bugfix, diagnosis]
created: 2026-07-15
updated: 2026-07-15
status: 수정 완료 (FE 74 테스트·빌드 통과) · 커밋 전
---

# 계획 MD "시간 추적 꺼짐" 오안내 — 진짜 원인은 remaining 미동봉

> **증상**(사용자 보고): 계획 작업량(MD)이 **최초 입력은 되는데, 수정하면** "시간 추적 기능을 켜세요" 알럿.
> 시간 추적이 되는 팀 관리형 프로젝트(RFC 등)에서도 발생 → 안내가 앞뒤가 안 맞았음.

## 실측 진단 (dmove 프로덕션, 읽기 + 동일값 no-op write)

1. RFC(팀 관리형)에는 예상시간 저장된 이슈 다수 — 시간 추적이 실제로 동작하는 프로젝트. DWEB은 0건(진짜 꺼짐).
2. **RFC-143(worklog 5h 있음)에 originalEstimate만 PUT → 400** `errors.timetracking_remainingestimate: "남은 추정치에 대해 유효한 값을 지정하세요"` — "필드 편집 불가"가 아니라 **remaining 검증 오류**.
3. **originalEstimate + remainingEstimate(기존값) 동시 PUT → 성공.**
4. 메커니즘: 시간 추적 상태가 없는 이슈(최초 입력)는 original만 보내도 Jira가 remaining을 자동 세팅 → 성공. remaining/worklog가 생긴 뒤(수정)에는 remaining 동시 제출 요구 → 400.

## 두 가지 결함

1. **가드 오판**: `isTimeTrackingUnsupportedError`가 에러 문자열에 `timetracking` 포함 여부만 검사 →
   `timetracking_remainingestimate` 검증 400까지 "기능 꺼짐"으로 분류 → 엉뚱한 안내.
2. **안내 경로 오류**: 팀 관리형 안내가 "프로젝트 설정 > 기능에서 시간 추적을 켜라"였는데, 팀 관리형에 그런 토글은 없음.
   실제 경로 = **프로젝트 설정 > 이슈 유형 > (해당 유형) 필드에 '시간 추적' 추가** (이슈 유형별!).
   [Atlassian 문서](https://support.atlassian.com/jira-software-cloud/docs/customize-an-issues-fields-in-team-managed-projects/) — "Time tracking is always enabled in Jira Cloud", 필드 배치가 관건.

## 수정 (3파일 + i18n)

- `useJiraEditGuards.js`: ① 가드에서 `timetracking_*` 하위 검증 오류 제외 ② `buildTimetrackingPayload(original, remainingSeconds)` 헬퍼 신설 — remaining 있으면 분 단위로 동봉(기존 잔여치 보존, Jira UI와 동일 의미론)
- `ProjectIssueTable.updatePlannedMD`: 행의 `remainingEstimateSeconds` 전달(추가 호출 0)
- 간트 `useUpdatePlannedMd`: Task에 remaining이 없어 **단건 GET 1회 후 PUT** (편집 액션이라 허용)
- i18n(kr/en `projectDetail.json`): 팀 관리형 안내를 이슈 유형 필드 경로로 정정 + merge

## 교훈

- **에러 substring 매칭은 하위 검증 키를 오폭한다** — Jira 400의 `errors` 키(`timetracking` vs `timetracking_remainingestimate`)를 구분해야 함. 키는 언어 무관(메시지 본문은 로케일 번역됨 — 한국어 응답 실측).
- **"최초는 되고 수정만 실패"는 상태 의존 검증 신호** — 필드 자체 불가라면 최초도 실패했어야 함.
- editmeta는 여전히 신뢰 불가(RFC-155: editmeta에 timetracking 없는데 값 존재·편집 가능) — 응답 기반 판정 원칙 재확인.
- 진단 중 RFC-143에 동일값 no-op write 2회 수행(실패 1·성공 1, 데이터 변화 없음).

관련: [[2026-07-14-team-managed-implementation]] (같은 세션 흐름) · [[2026-06-11-analysis-review]]
