---
name: marketplace-launch-status
description: Confluence 승인 앱 Marketplace 유료 출시 준비 상태(2026-10-20) — 남은 일과 사용자 결정
metadata:
  node_type: memory
  type: project
  originSessionId: 85c7fcd3-d4d7-45d2-b033-5cc48dcf683f
  modified: 2026-10-22T02:24:41.389Z
---

2026-10-20 기준 출시 전 감사의 코드 항목은 전부 끝났다. 커밋은 master 의 `d7d478e` 까지이고, 아직 push 하지 않았다. development 에는 2026-10-22 에 6.1.0 으로 배포했다(`86a7586` 재검토 수정분 포함, minor 라 install --upgrade 불필요).

**배포 흐름(2026-10-22, 워크포스 따라 함)**: develop → staging(dmove-staging.atlassian.net Confluence 에 설치됨, 수동 트리거 + install --upgrade), master → production(수동). develop 브랜치는 push 됨, master 는 아직 미push. production 배포는 사용자가 "조금 대기".
**Sentry 결정**: 워크포스와 섞지 않고 **별도 Sentry 프로젝트**. DSN 은 워크포스처럼 production 에만 `forge variables set --encrypt -e production SENTRY_DSN`. 프로젝트 생성·IP 저장 차단은 사용자 몫.

**Confluence 재게시 대기(2026-10-22)**: 원본은 `docs/guide/handbook`(게시 기록 `editorial/publication-queue.json`). 대상 10페이지 = ko/en × installation·admin-data·data-security·reviewer-guide·delegation. 렌더는 `publication.cjs` 의 `render`(NODE_PATH=static/ui/node_modules 필요), 검증은 `verify`. 첨부·이미지 0 확인. Chrome 미로그인이라 멈춤 — 사용자 로그인 후 진행. 법적 문서 초안은 `docs/guide/legal/{ko,en}/`(privacy-policy·eula·support, `[ ]` 미확정).

**남은 일**
- production 배포
- Sentry IP 저장 차단 설정
- 리스팅 자산, 개인정보처리방침, EULA
- Confluence 가이드 재게시: 사용자가 "나중에"라고 함
- 두 번째 계정으로 수동 QA
- 리스팅 후 `MARKETPLACE_URL` 교체

**문서 위치**
- 제출 문안: `docs/guide/marketplace-submission.md`(gitignore 대상)
- 상세 기록: Obsidian `projects/moves-approval/2026-10-20-marketplace-prelaunch-audit.md`

**Why:** 다음 세션에서 이어 갈 때 무엇이 끝났고 무엇이 사용자 판단 대기인지 알아야 한다.

**How to apply:** 출시 관련 요청이 오면 위 목록부터 확인한다. 사용자 결정은 다시 묻지 않는다.
- 미결제여도 영역 본문과 byline 상태는 보인다.
- 폐쇄 계정의 결재 기록 accountId 는 남긴다.

아직 미정인 것은 restrictAccess 가 켜졌을 때 미등록 사용자에게 영역 본문을 보일지다.
