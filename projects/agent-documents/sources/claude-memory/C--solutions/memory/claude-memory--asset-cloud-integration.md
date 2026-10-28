---
name: asset-cloud-integration
description: "자산 관리 × 클라우드 통합(ZM-119) — EC2를 source=cloud 자산으로 자동 등록(D6 번복) + 클라우드 비용 화면을 자산 비용 Cloud 탭으로 완전 이동. 2026-08-27 커밋 완료(BE 81c1999·FE 1e841b3, 미푸시·미리베이스, worktree zm-119 유지). 설계 features/assets/asset-cloud/devdesign_asset-cloud.md"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2e70ea6a-09df-4f5c-8a78-5575dcb760e3
  modified: 2026-08-26T07:05:56.926Z
---

**상태(2026-08-27)**: **로컬 병합 완료** — 리베이스 후 FE master `c397c10`·BE ZM-79 `b865e54`(원 커밋 `1e841b3`/`81c1999`), 미푸시. worktree zm-119 제거·브랜치 보존. 정적 QA 38 PASS/8 FAIL→전건 조치, 런타임 QA 12/12+재검증 8/8, 코덱스 검수 BE 🔴4/🟡2·FE 🟡4 전건 반영(V37 낙관적 잠금 추가). 잔여: 리베이스(메인 3커밋 앞섬)·병합·푸시·worktree 정리는 사용자 지시 대기. 검수 문서 `_workspace/features/assets/asset-cloud/review_asset-cloud.md`. 🔴 코덱스가 잡은 4결함은 전부 '규칙을 한 경로만 지킨 것'(lifecycle 강제값/사용자값 구분 표식·PATCH↔배치 lost update·전체 리전 실패 사유·HW 단건 EP fallback).

**사용자 결정**: U1 클라우드 비용 화면 **완전 이동**(`/asset/cost?tab=cloud` 유일, 구 경로 리다이렉트, 클라우드 인프라 메뉴에서 제거, EC2 개요 실청구 카드는 유지) · U2 EC2 자산 **자동 upsert(5분 스냅샷 배치에 얹음) + 수동 동기화 AWS 옵션** — 기존 D6("자동 생성 안 함") 번복(근거: 기획 정본이 원래 Cloud+On-prem 통합, 파급은 편집 소유권 규칙으로 흡수) · U3 실청구(CE) 인스턴스 귀속 **제외**(무료 추정만, 실청구는 서비스 단위 대조) · U4 기존 설계 토대.

**핵심 규칙**(설계 §7): upsert 키 `cloud_resource_id`(instanceId, V36 partial unique) · `cloud_data`는 동기화 소유, 사용자 필드(owner/notes/custom/cost_data/분류/생애주기) 불가침 · 변경 없으면 저장·이력 없음(5분 배치가 updated_at 흔들면 안 됨) · missing은 성공 리전만 · **매치 실패 ≠ 연결 해제**(INSTANCE_ID_EXACT로 다른 호스트 확정 시만 교체, `link_basis` 저장) · custom 자산에 같은 resource_id 있으면 skip+이력 · 🔴 **결정 #11 개정: HW 비용 모집단 = source≠cloud**, cloud 자산 cost_data 쓰기 거부 · 🔴 KRW·USD 합산 금지(대시보드 나란히) · 패키지 방향 aws ← asset ← cost, 스냅샷→자산 통지는 `aws/spi/InstanceSnapshotListener`로 역전(aws가 asset import 금지).

**실측 전제**: aws↔asset/cost 패키지 참조 0 · EC2↔Zabbix 매칭 결과는 메모리 캐시뿐(자산 linked_hostid가 유일한 영속) · `cloud_data.resource_id` 생산자 없어 platform은 항상 hw였음 · CE는 SERVICE 차원만 · dev 5433에 AWS 자격증명 있음(인스턴스 1대 스냅샷 적재 중).

관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--asset-dashboard-feature|asset-dashboard-feature]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--asset-cost-design|asset-cost-design]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--assets-core-devdesign|assets-core-devdesign]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--cloud-paid-api-optin|cloud-paid-api-optin]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--aws-zero-cost-charting|aws-zero-cost-charting]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--ec2-monitoring-sources|ec2-monitoring-sources]]
