---
type: topic
tags: [forge, jira-api, custom-field, topic]
created: 2026-07-02
updated: 2026-07-02
---

# Forge readOnly 앱 커스텀필드는 PUT /issue로 못 쓴다

> 발견: [[2026-07-02-issue-link-gantt]] (moves-workforce 간트 M3 관계편집 — "선이 저장 안 됨" 근본 원인)

## 증상
manifest에 `readOnly: true`로 정의된 Forge 커스텀필드를 표준 이슈 API로 쓰면:
```
PUT /rest/api/3/issue/{key}  →  400 "Field does not support update 'customfield_XXXXX'"
```
읽기는 정상이라 "왜 저장만 안 되지"로 헤매기 쉽다.

## 해결 — 전용 앱필드 엔드포인트
```
PUT /rest/api/3/app/field/{fieldIdOrKey}/value
Body: { "updates": [ { "issueIds": [10001], "value": ... } ] }
```
- **asApp 필수** (asUser 불가 — 앱 소유 필드의 값 설정 경로).
- `issueIds`는 **숫자 이슈 ID** (이슈 키 아님) → key→id 맵 선조립 필요.
- moves-workforce 구현: `IssueApi.updateAppCustomFieldValue({fieldIdOrKey, issueId, value})`.

## 판단 기준 — 그 전에 네이티브로 풀리는지 먼저
readOnly 앱필드 write가 필요해 보일 때 순서:
1. **Jira 네이티브 구조로 대체 가능한가?** — 간트 선후행은 커스텀필드 대신 **네이티브 이슈 링크("Blocks")**로 전환해 표준 API(asUser) write + Jira 이슈 화면 자동 연동을 얻었다. asApp 최소화 원칙(마켓플레이스 심사 부담) 관점에서도 우선.
2. 네이티브가 구조적으로 안 되면(예: 임의 깊이 계층 — 네이티브 parent는 3레벨+인접만) 그때 app/field/value + asApp.
3. 이미 배포된 manifest의 필드 제거는 **기존 설치 파괴 위험** — 미사용 존치가 안전, 제거는 별도 검토.

## 관련
- [[2026-07-02-issue-link-gantt]] — 발견 맥락 + 네이티브 링크 전환 전말
- asApp 지양 원칙(마켓플레이스 심사 부담, 사용자 컨텍스트 우선) — 이 엔드포인트가 유일 예외 케이스
