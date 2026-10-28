---
title: MovesEye 기능 문서 목록
doc_type: hub
audience: [기획, 개발, QA, 운영]
status: review
owner: MovesEye 팀
baseline: 2026-08-05
source_of_truth: C:/solutions/moveseye-docs/features
reviewed_at: 2026-10-19
review_cycle: monthly
---

# 기능 문서 목록

최근 기능의 전체 흐름은 [최근 작업 설명](../overview/solutions--recent-work.md), 설계와 코드 연결은 [설계·구현 지도](../overview/solutions--design-implementation-map.md), APM의 미완료 과제는 [부족점 리포트](../overview/solutions--apm-gap-report.md)를 먼저 읽습니다(2026-10-05 소스 기준).

영역 단위로 현재 동작과 문제점을 보려면 [기능별 상세 가이드](../guides/features/solutions--README.md)(2026-10-06 소스 기준, 13개 영역)를 읽습니다. 이 디렉터리는 이슈 단위 기능 문서를, 그쪽은 영역 전체의 동작 원리와 보완점을 다룹니다.

완료된 기능의 “왜·경계·운영·검증”을 한곳에서 찾기 위한 디렉터리다. Controller와 component를 나열하는 문서가 아니라, 다음 질문에 답하는 문서만 둔다.

- 사용자가 달성하는 목표는 무엇인가?
- 원천 데이터와 편집 소유자는 누구인가?
- BE↔FE 요청·응답과 상태 전이는 무엇인가?
- 권한·실패·빈 데이터·동시성은 어떻게 처리하는가?
- 어떤 runtime evidence로 동작을 확인했는가?

새 문서는 [기능 문서 템플릿](../templates/solutions--%EA%B8%B0%EB%8A%A5-%EB%AC%B8%EC%84%9C-%ED%85%9C%ED%94%8C%EB%A6%BF.md)을 복사한다.

현재 stable 영역으로 승격 완료된 기능 문서는 **0건**이다. 아래 `_workspace` 원천은 설계·계약·QA 증거이며 current 기능 문서를 대신하지 않는다.

## 검토 중 기능 문서

| 기능 | 문서 | 상태 |
|---|---|---|
| 역할 권한 BE 강제와 세션·토큰 회수(ZM-157) | [권한-강제와-세션-회수.md](solutions--%EA%B6%8C%ED%95%9C-%EA%B0%95%EC%A0%9C%EC%99%80-%EC%84%B8%EC%85%98-%ED%9A%8C%EC%88%98.md) | review — 소스 기준, 미병합·런타임 미검증 |
| 클라우드 스냅샷 적재량 정리 — VPC 구간 적재·수집 리전 범위(ZM-151) | [클라우드-스냅샷-적재량-정리.md](solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-%EC%8A%A4%EB%83%85%EC%83%B7-%EC%A0%81%EC%9E%AC%EB%9F%89-%EC%A0%95%EB%A6%AC.md) | review — master 병합(미푸시), dev DB V64·런타임 확인(2026-09-28), 화면 미실측 |
| APM 화면 자기설명 — 빈 값 이유·보존 안내·지표 뜻(ZM-152) | [APM-화면-자기설명.md](solutions--APM-%ED%99%94%EB%A9%B4-%EC%9E%90%EA%B8%B0%EC%84%A4%EB%AA%85.md) | review — master 병합(미푸시), 코덱스 승인, 런타임 미검증(BE 재기동 전) |
| 클라우드 스냅샷 수집 주기 분리 — 구성 정보 기본 30분(ZM-153) | [클라우드-스냅샷-수집-주기-분리.md](solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-%EC%8A%A4%EB%83%85%EC%83%B7-%EC%88%98%EC%A7%91-%EC%A3%BC%EA%B8%B0-%EB%B6%84%EB%A6%AC.md) | review — master 병합(미푸시), dev 런타임 확인(2026-09-28), 화면 미실측 |
| APM 데이터 기간 지정 내보내기 — 계획·다운로드·planToken(ZM-154) | [APM-데이터-내보내기.md](solutions--APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0.md) | review — master 병합(미푸시), 코덱스 승인, v1 BE EP curl 실측(09-22)·v2 런타임 미검증 |
| APM 콜드 아카이브 — 보존 만료 전 파일 보관·DROP 게이트·공통 아카이브 기반(ZM-156) | [APM-콜드-아카이브.md](solutions--APM-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C.md) | review — master 병합(미푸시, V69), 코덱스 BE v5·FE v3 승인, 런타임·NFS·리눅스 미검증 |
| APM 커스텀 지표 허용목록 — 폐기 통계에서 받기·규칙 관리·서비스당 상한 원장(ZM-155) | [APM-커스텀-지표-허용목록.md](solutions--APM-%EC%BB%A4%EC%8A%A4%ED%85%80-%EC%A7%80%ED%91%9C-%ED%97%88%EC%9A%A9%EB%AA%A9%EB%A1%9D.md) | review — master 병합(미푸시, V81), 코덱스 BE v5·FE v5 승인, 런타임·다중 노드 미검증 |

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
