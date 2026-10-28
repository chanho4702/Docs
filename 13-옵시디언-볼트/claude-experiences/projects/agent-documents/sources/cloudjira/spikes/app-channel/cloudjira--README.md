# 앱 간 통신 채널 스파이크 (2026-10-19)

approval ↔ workforce 를 entity property 대신 REST 로 바꿀 때 쓸 채널 실측.
- callee: webtrigger(`spike-wt`) + apiRoute(`/v1/echo`, scope `read:spike-echo:custom`)
- caller: webtrigger(`spike-kick`) — 호출되면 **caller 백엔드(사용자 컨텍스트 없음)** 에서 callee 를 fetch 하고 결과를 그대로 돌려준다.

실제 앱(approval·workforce)은 건드리지 않는다. 결과는 RESULTS.md.
