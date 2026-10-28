# MovesEye 기능 문서 목록

| 항목 | 내용 |
|---|---|
| 대상 독자 | 기획, 개발, QA, 운영 |
| 문서 상태 | review |
| 관리 주체 | MovesEye 팀 |
| 기준일 | 2026-08-05 |
| 최종 검토 | 2026-08-05 |
| 검토 주기 | monthly |
| 정본 위치 | C:/solutions/moveseye-docs/features |

# 기능 문서 목록

완료된 기능의 “왜·경계·운영·검증”을 한곳에서 찾기 위한 디렉터리다. Controller와 component를 나열하는 문서가 아니라, 다음 질문에 답하는 문서만 둔다.

- 사용자가 달성하는 목표는 무엇인가?
- 원천 데이터와 편집 소유자는 누구인가?
- BE↔FE 요청·응답과 상태 전이는 무엇인가?
- 권한·실패·빈 데이터·동시성은 어떻게 처리하는가?
- 어떤 runtime evidence로 동작을 확인했는가?

새 문서는 **기능 문서 템플릿**을 복사한다.

현재 stable 영역으로 승격 완료된 기능 문서는 **0건**이다. 아래 `_workspace` 원천은 설계·계약·QA 증거이며 current 기능 문서를 대신하지 않는다.

## 승격 대기 목록

| 기능 | 기존 원천 | 우선순위 |
|---|---|---:|
| 자산 core | `_workspace/features/assets/assets-core/devdesign_assets-core.md`, `features/assets/assets-core/contract_assets-core.md` | 높음 |
| 비용 대시보드·CSV upload | `_workspace/features/assets/asset-cost/devdesign_asset-cost.md`, `features/assets/asset-cost/contract_asset-cost.md`, `e2e_cost-dashboard.md` | 높음 |
| 네트워크 맵 | `_workspace/features/maps/network-maps/devdesign_network-maps.md`, `features/maps/network-maps/contract_network-maps.md` | 높음 |
| 지리 맵 | `_workspace/features/maps/geo-maps/devdesign_geo-maps.md`, `features/maps/geo-maps/contract_geo-maps.md`, `e2e_geo-maps.md` | 높음 |
| Host 등록 | `_workspace/features/zabbix-config/host-registration/devdesign_host-registration.md`, `features/zabbix-config/host-registration/contract_host-registration.md` | 높음 |
| 수집 엔진 | `_workspace/features/platform/collector-engine/devdesign_collector-engine.md`, engine module README | 높음 |
| Zabbix Item/Trigger 관리 | 관련 design·contract·E2E | 중간 |
| Host Group 모니터링 | 관련 contract·E2E | 중간 |

## 문서명

`<domain>-<feature>.md` 형식을 사용한다. 예: `asset-cost-bulk-upload.md`, `zabbix-host-management.md`.
