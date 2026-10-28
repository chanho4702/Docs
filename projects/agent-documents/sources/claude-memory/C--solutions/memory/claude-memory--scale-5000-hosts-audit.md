---
name: scale-5000-hosts-audit
description: "09-16 호스트 5천·아이템 1천만 전수 감사 완료(수정 0) — 🔴36·🟠87, 보안 4건·규모무관 결함 11건. 정본 _workspace/features/infra/scale-call-guard/audit_scale-5000-hosts.md"
metadata: 
  node_type: memory
  type: project
  originSessionId: 537eb029-8b26-4fc6-925c-18e829e04eb2
  modified: 2026-09-16T10:06:13.770Z
---

2026-09-16 사용자 질문("5천대·1천만 아이템 버티나, 자빅스가 병목이라 상관없나")에서 시작한 **대용량 전수 감사**. 코드 수정 0건, 부하 시험 미실시.

- 정본: `_workspace/features/infra/scale-call-guard/audit_scale-5000-hosts.md` · 티켓 초안 `_workspace/features/infra/scale-call-guard/tickets_scale-hardening.md`(T-A 알람 1만 상한, T-B AWS 매처) · Jira 미발급
- 결론: ZM-123은 "접속자↔자빅스"만 분리했고 "호스트·아이템 수↔1회 호출 크기"는 무통제. 공통 뿌리 = 자빅스 청크 유틸 부재·조용한 절단·전량 후 앱 페이징·사용자별 캐시 키·기본 풀(DB 10·자빅스 10·스케줄러 4)·N+1·노드 로컬 상태
- 🔴 규모 무관 즉시 대상: CallerContexts가 자빅스 미연결 사용자를 system 토큰으로 매핑(보안) · 그룹 추이 캐시 키 사용자 무구분 · 구성 현황 OverviewCallExecutor 중첩 제출 교착 · FE 네트워크 증분 병합 키 type만 · EC2 DescribeInstanceStatus ID 100 초과 실패 · BE 다중 시 APM 수치 N배
- 🔴 정정 이력: 1만 건 상한은 "해소 오판"이 아니다(되짚기는 복구 이벤트 확인 후에만 해소). 실제 위험은 잘린 장기 장애가 updated_at 2일 좀비 정리로 **삭제**되는 것
- 사용자 방향: DB 직접 조회는 보류 권고(API 약속·스키마 변동·권한 재현) — 순서는 호출 방식 수정 → 사본 확대 → 부하 시험 → ZM-134 커넥터 → 필요 시 복제 DB 옵션

**Why:** dev가 호스트 76대라 대용량 결함이 드러나지 않았다. 사용자는 "대용량 고려가 부족하다"고 판단.
**How to apply:** 새 BE/FE 기능은 "호스트 5천·아이템 1천만에서 1회 호출 크기"를 검수 항목에 넣는다. 착수 시 감사 문서의 로드맵 0단계부터. 관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zabbix-load-relief|zabbix-load-relief]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--collector-engine-direction|collector-engine-direction]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--cloud-snapshot-region-fanout|cloud-snapshot-region-fanout]]
