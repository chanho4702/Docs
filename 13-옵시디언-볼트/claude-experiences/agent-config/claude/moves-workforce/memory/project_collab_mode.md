---
name: project-collab-mode
description: "프로젝트 「협업 모드」(2026-09-30 착수) — 켜면 연결 이슈·워크로그를 asApp으로 조회해 참여자 전원이 봄. 적용=작업관리·캘린더·대시보드, 켜는 사람=PROJECT write, 워크로그 포함. 경계 7개 강제가 핵심. 설계 진행 중"
metadata:
  node_type: memory
  type: project
  originSessionId: 09c47656-08b2-49ec-8804-446d6dba94d0
  modified: 2026-09-30T05:35:30.370Z
---

제품 소유자 요구(2026-09-30): 프로젝트 설정에 「협업 모드」를 두고, 켜면 그 프로젝트에 연결된 Jira 이슈를 **앱 자격(asApp)** 으로 조회해 다른 Jira 프로젝트를 볼 권한이 없는 참여 인원도 내용을 보게 한다. 사용자가 asApp을 예외로 명시 허용한 기능이다([[feedback-no-asapp]]의 예외 — 아키텍처 설계서 §4.4 허용 경로 ⑥으로 추가 예정).

확정(AskUserQuestion 답): 적용 화면 **작업관리(목록·트리·간트·이슈 맵)+캘린더+프로젝트 대시보드**, 켜는 사람 **PROJECT write**, **워크로그 포함**. 쓰기 동작은 본인 자격 그대로.

내가 세운 경계 7개(요구사항 파일에 고정): 연결 이슈만(서버가 JQL 조립, 클라이언트 JQL 금지) · 참여 인원만(서버 판정) · 켜져 있을 때만(fail-close, 설정은 서버가 읽음) · 응답 최소화 · 화면 표시 · 켠 사람·시각 기록 · 아키텍처 문서 갱신.

**상태(2026-09-30 저녁): 하네스 4단계+Codex+재검증 완료, 커밋·배포·E2E 전.** `develop` 워킹 트리(브랜치 번호 미정). Codex 2차까지 반영(coverage 사용자별 캐시 2분·요청 예산 공용 RequestBudget·페이지 즉시 축소). 백엔드 1,941·프론트 2,071 통과. resolver 9개(`src/resolver/projectCollab/`), 판정 `src/permission/CollabAccess.js`, 마이그레이션 v025, 제한 알림(coverage: 스페이스 권한·본인에게만 보이는 이슈), 배지 4곳(작업관리·캘린더·대시보드·칸반 모달). 워크로그 예산(20,000건/300요청), coverage 캐시 5분·요청 100 예산. **부수 발견·수정: 가드 `projectId ?? project_id` 키 불일치로 스코프 우회 가능하던 기존 구멍(모든 detail resolver 공통) → 가드에서 거부.** 배포 후 실측: 앱 계정 실제 가시 범위(권한 스킴·이슈 보안·워크로그 공개 범위), rate limit, v025.

**Why:** 다른 부서 스페이스 이슈가 참여자에게 안 보이는 것이 실사용 불편. asApp 없이는 불가.
**How to apply:** 구현·검증 때 경계 7개를 파일·함수 단위로 대조할 것. 공통 경로(`IssueApi`·`WorklogApi`·`jqlMaker`) 수정 대신 전용 resolver·페처([[feedback-worklog-fetch-isolation]]).
