---
name: approval-app-distribution-not-sharing
description: "승인 앱은 개발자 콘솔 배포 상태 \"Not sharing\"·기여자 1명(Tom Kim)·마켓 미등록이라 다른 사용자는 \"You don't have access to this app\" — 워크포스는 Sharing·Public"
metadata:
  node_type: memory
  type: project
  originSessionId: 4b2db3b4-8d9f-459e-a8ae-6678a2d27fe8
  modified: 2026-10-14T06:18:56.429Z
---

2026-10-14 실측(개발자 콘솔):
- **승인 앱**(1bd06760-…): Distribution **Not sharing**, Contributors 1(Tom Kim), Marketplace 미등록, development 만 배포. → 기여자가 아닌 Jira 사용자는 Work log 탭에서 "You don't have access to this app. This application is in development - only the owner…" 로 막힌다. 이것은 환경(development) 문제가 아니라 **배포 상태** 문제다.
- **워크포스**(f8962f17-…): Distribution **Sharing**, Marketplace **Public**, Contributors 2(Rax Yang 소유자·Tom Kim), development·staging·production 배포. → 다른 사용자가 쓸 수 있다.
- 승인 앱은 manifest `licensing.enabled: true` 라 설치 링크 공유(Sharing)가 막힌다(유료 앱은 Marketplace 설치만). 테스트 계정은 **기여자로 추가**하는 것이 현실적 경로, 고객 배포는 Marketplace 등록.

**How to apply:** 다른 계정으로 승인 앱을 못 쓴다는 보고가 오면 먼저 콘솔 배포 상태·기여자 목록을 본다. "staging 으로 올리면 된다"고 답하지 않는다(2026-10-14 에 그렇게 잘못 답했다가 정정함).
