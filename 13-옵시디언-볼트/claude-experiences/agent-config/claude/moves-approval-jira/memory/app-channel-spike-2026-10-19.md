---
name: app-channel-spike-2026-10-19
description: "approval↔workforce REST 전환 스파이크 결과 — webtrigger·apiRoute(3LO) 둘 다 Forge 백엔드끼리 호출됨, 3LO 는 sns 파라미터 필요"
metadata:
  node_type: memory
  type: project
  originSessionId: 328d2874-254c-466a-8cc6-dd177a2cc219
  modified: 2026-10-19T01:30:09.395Z
---

2026-10-19 사용자가 "프로퍼티 연동을 걷어내고 apiRoute REST 로 재설계"를 요청 → 먼저 스파이크로 실측. 스파이크 앱·결과·캡처 가이드는 `C:\CloudJira\spikes\app-channel\`(RESULTS.md, GUIDE.md), Developer Space `forge-sample-test-251229`.

- webtrigger: caller 백엔드(principal null) → callee 200, 약 0.2초, Node crypto Ed25519 동작, URL 재배포 후 유지, `webTrigger.getUrl` = CLI URL.
- apiRoute: 토큰 없으면 401. 3LO 토큰이면 Forge 백엔드에서도 200(약 1.8초), callee principal = 토큰 발급자. **동의 URL 에 `sns={appId}.{envId}` 가 없으면 custom scope 미부여(403)** — 튜토리얼에 없고 Console 의 Authorization URL generator 에만 있음. refresh token 회전 강제.
- 아직 사용자 결정 전: 어느 채널로 갈지, 프로퍼티 코드 철거 순서. 정리 대기: OAuth 앱 `spike-app-channel-3lo` secret 이 대화에 노출됨(재발급/삭제 필요), 스파이크 앱 2개 제거.

**Why:** 커뮤니티의 "apiRoute 앱 간 401" 보고는 토큰·scope 문제로 보이며, 실제 선택 기준은 고객 설치 절차·토큰 주인 의존성·지연이다.
**How to apply:** 재설계 설계서(feature-architect)에 이 실측을 근거로 넣고, 미측정(production webtrigger 도메인, HMAC webtrigger, 한도)은 미검증으로 표시. [[linked-mode-decisions-2026-10-14]]

2026-10-20 워크포스 apiRoute 정식 검증 완료(보고서 `_workspace/workforce-channel-rest/06_apiroute_verification_report.md`, 증거 `evidence/apiroute/`). 검증용 OAuth 앱 `moves-workforce-api-verify`(Resource-level), 로컬 도우미 `C:\CloudJira\spikes\wf-apiroute\`(.client·.token*.json — 정리 대상). 권한 없는 사용자 거부(김찬호 chanho9611, Member 세트)는 사용자가 "나중에"로 보류 — 시크릿 창 동의 필요, Not sharing 앱이라 막힐 수 있음. Git Bash 에서 `/v1/...` 인자는 `MSYS_NO_PATHCONV=1` 필수.
2026-10-20 채널 기능 실측(F01~F07)으로 결함 2건 발견·수정·dev 배포(워크포스 10.2.0, 승인 5.5.0, 미커밋): 채널 안 asUser(가드 /mypermissions·/user/bulk), KVS batchGet KEY_NOT_FOUND. 종합 보고서 `_workspace/workforce-channel-rest/07_feasibility_verification.md`. 남은 실측: 결재자(Rax Yang 추정) 승인 → change.notify CERT → 워크포스 배지, 워크포스 ORG 변경 알림. 측정 기법: 브라우저 top window 의 fetch 를 가로채 invokeExtension 응답을 본다(forge logs 는 늦거나 비어 있음).
