---
name: cloud-forge-twin-project
description: 승인 앱에는 DC판(이 저장소)과 Cloud Forge판(C:\CloudJira\moves-approval)이 따로 있다
metadata:
  type: project
---

승인 앱은 두 갈래로 개발된다. 이 저장소(`C:\Onpremise\confluence-approval-dc`)는 Confluence **DC**용
(Java, atlassian-plugin.xml). Confluence **Cloud**용은 별도 Forge 프로젝트
`C:\CloudJira\moves-approval` (manifest.yml, `confluence:pageBanner` / `contentBylineItem` /
`contentAction` / `globalPage` 모듈, 자체 CLAUDE.md·AGENTS.md 보유). Cloud 앱 표시 이름은
"Moves Approval", 개발 배포에서는 화면에 "Moves Approval (Development)"로 나온다.

**Why:** 사용자가 Cloud 화면(tom-chkim-dev.atlassian.net)을 근거로 "승인 요청이 안 나간다",
"버튼 위치" 같은 요청을 하는 경우가 있는데, 증상만 들으면 DC 앱 이야기로 오해하기 쉽다.
2026-08-31 세션에서 실제로 DC 인스턴스를 띄워 재현하려다 대상이 Cloud Forge 앱임을 뒤늦게 확인했다.

**How to apply:** 승인 앱 이슈를 받으면 먼저 대상이 DC인지 Cloud인지 확정한다. atlassian.net URL,
"(Development)" 표기, byline/••• 메뉴 언급은 Cloud 신호다. Cloud 작업은 이 세션에서 하지 말고
`C:\CloudJira\moves-approval`에서 새 세션을 연다 (그쪽 하네스·지침이 로드되어야 함).
DC 파이프라인은 [[projects/agent-documents/sources/claude-memory/C--Onpremise-confluence-approval-dc/memory/claude-memory--harness-approval-dev|harness-approval-dev]] 참조.
