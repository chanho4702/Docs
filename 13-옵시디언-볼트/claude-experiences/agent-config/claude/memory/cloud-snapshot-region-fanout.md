---
name: cloud-snapshot-region-fanout
description: "cloud_snapshot 배치가 리전 화이트리스트 없이 활성 리전 전체(≈17)를 5분마다 호출 — 수정 필요로 기록(2026-09-16, 미착수)"
metadata: 
  node_type: memory
  type: project
  originSessionId: d71735bd-2e35-4d22-bdcc-f58ce828438f
  modified: 2026-09-16T04:52:51.675Z
---

2026-09-16 사용자 판단: **수정 필요.** 티켓 미발급, 설계 전. 정본 백로그 `_workspace/features/cloud/snapshot/backlog_cloud-snapshot-region-scope.md`.

**발견 경위**: 로컬 BE에 OTel 에이전트를 달아 APM 서비스 맵을 봤더니 `ec2.<region>.amazonaws.com` 노드가 **17개** 떴다. 로그로만 알던 외부 호출량이 맵에 드러난 사례.

**문제**: `cloud_snapshot`(V28 시드, `interval 5`·`enabled=TRUE`)이 `AwsReadOnlyGateway.enabledRegionNames()`로 **활성 리전 전부**를 병렬 호출한다. 리전 화이트리스트가 없어 서울 한 곳만 쓰는 고객도 17리전을 5분마다 긁는다 — 시간당 204회·하루 약 4,900회. 과금은 0(무료 `Describe*`)이지만 응답 대기·스레드는 실제로 쓴다(맵 엣지 p95 300~1,700ms).

🔴 **같은 문제를 반쯤 고친 이력이 있다** — `enabledRegionNames()` 주석의 2026-08-25 실측("34개 중 17개가 헛돌며 응답만 늦췄다")으로 미옵트인 리전만 걸러 34→17이 됐다. "안 쓰는 리전을 도는" 문제는 아직 절반 남았다.

**배치 자체는 유지한다** — CloudWatch에는 상태의 역사가 없고(VPC는 기본 지표 없음) CloudWatch 미사용 고객이 전제라, 무료 Describe 결과를 쌓아 과금 0 상태 시계열을 만드는 것이 V28의 목적이다([[aws-zero-cost-charting]]). 줄일 것은 팬아웃뿐.

**방향**: ① 리전 화이트리스트(17→1, 효과 큼) ② 인스턴스 5분 / VPC·SG·라우트테이블 30분~1시간으로 주기 분리 ③ 빈 리전 백오프(①의 대안). 착수 전 확인 4가지는 백로그 §4.

**당장의 회피**: 설정 › 스케줄러 관리에서 `cloud_snapshot` 끄기(개발 환경에서 AWS 자격증명이 있으면 지금도 나간다).

관련: [[aws-zero-cost-charting]] · [[cloud-aws-gating]] · [[cloud-paid-api-optin]] · [[apm-implementation-progress]]

**2026-10-06 재확인:** 수집 리전 범위 설정·VPC 구간 적재·구성 정보 30분 주기가 구현돼 이 항목의 팬아웃 문제는 해소됐다(ZM-151·153, 코드 대조). 남은 것은 인스턴스 스냅샷이 회차마다 대수만큼 쌓이는 구조 — [[feature-guides-bundle]]의 클라우드 문서 CLD-02.
