---
title: 설계와 구현의 연결 지도
doc_type: guide
audience: [기획, 개발, 운영, QA]
status: review
owner: MovesEye 팀
baseline: 2026-10-05
source_of_truth: "현재 BE·FE 소스와 본문에 연결한 설계·계약·검증 자료"
reviewed_at: 2026-10-05
review_cycle: event-driven
deployment_scope: source
be_commit: 3637c77
fe_commit: 9dfcbe8
---

# 설계와 구현의 연결 지도

[읽기 안내](solutions--start-here.md) · 다음: [부족점 리포트](solutions--apm-gap-report.md)

이 문서는 **해결하려던 문제 → 설계 선택 → 실제 구현 위치 → 현재 한계**를 연결합니다. 모든 세션 문서를 읽기보다 관심 있는 기능의 한 줄에서 출발하세요.

## 1. 제품 전체의 역할 분담

```mermaid
flowchart TB
    FE["React 화면"] --> BE["Spring API와 업무 로직"]
    BE --> Ports["engine-api 계약"]
    Ports --> Z["engine-zabbix 구현"]
    Z --> Zabbix["Zabbix"]
    AWS["AWS 정보"] --> BE
    OTel["OTel Collector"] --> APM["APM 수신·집계"]
    APM --> DB[("PostgreSQL")]
    BE --> DB
    BE --> Redis["Redis 캐시·세션"]
    APM --> Live["실시간 메모리·SSE"]
    Live --> FE
```

Spring이 현재 BE 정본이며 구 NestJS는 참조용입니다. 수집 엔진 분리는 Zabbix 의존을 계약 뒤에 두는 작업입니다. APM은 OTel 수신 경로를 별도로 갖습니다. 기존 중립 포트가 있다는 사실만으로 Prometheus·Datadog의 전체 어댑터가 구현됐다고 볼 수는 없습니다.

근거: [BE 모듈 규약](../../moveseye-be-spring/solutions--AGENTS.md), [수집 엔진 설계](../../_workspace/features/platform/collector-engine/solutions--devdesign_collector-engine.md).

## 2. APM 설계와 구현

| 작업 | 설계의 핵심 | 구현의 중심 | 현재 상태 |
|---|---|---|---|
| 메트릭 | 허용된 지표를 정규화하고 여러 시간 해상도로 보관 | `collector/ingest`, `core/batch`, `overview` | 현재. 재전송 멱등성 보강 필요 |
| 트레이스 | 상세 span과 trace 요약·파생 집계를 나눔 | `trace/ingest`, `trace/query`, `trace/errors`, `trace/dbquery` | 현재. 저장된 표본의 분석 |
| 서비스 맵 | 관측된 호출을 서비스 간 관계로 집계 | `servicemap`, `trace`의 edge 집계 | 현재. 누락된 계측까지 복원하는 토폴로지는 아님 |
| SLO·합성 점검 | 목표 평가와 정기 점검을 운영 기능으로 연결 | `slo`, `synthetic`, `alert` | 현재. 알람 동시성·외부 I/O 경계 보강 필요 |
| RUM | 브라우저 수신과 보안·예산·집계를 별도 구성 | `rum`, `resources/apm/rum-snippet.js` | 부분. 수신·집계 구현, 브라우저 실패 복구·환경 검증 미완료 |
| 실시간 완료 요청 | 보존용 trace와 분기해 최근 기록을 메모리에 유지 | `collector/ingest/live`, `overview/live/spans` | 현재. 송신 용량·운영 환경 검증 필요 |
| 진행 중 요청 | 종료 전 상태를 Java 확장에서 직접 관측 | 별도 확장 폴더, `ActiveRequestListIngestor`, 걸림 감시기 | 부분. 검증된 Java 조합에 제한 |
| 화면 자기설명 | null·미수신·보존 만료·미지원의 이유를 전달 | 상태 DTO, 보존 Provider, 화면 도움말 | 현재. 모든 화면 일관성은 추가 확인 대상 |
| 내보내기 | 계획 단계에서 범위·보존·조건을 고정하고 다운로드 | APM export 및 FE 내보내기 UI | 현재. 과거 파일 복원과 별개 |
| 콜드 아카이브 | 삭제 전에 보관 확인, 공통 파일 기반과 소스 구현 분리 | 공통 `archive`, APM `archive`, retention gate | 현재. 복원은 보류, 배포 실증 부족 |

패키지 경로는 [BE APM 디렉터리](../../moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm) 아래 기준입니다. FE는 [APM 화면 디렉터리](../../moveseyee_fe/src/pages/application-monitoring)와 관리 콘솔의 데이터 아카이브 화면에 대응합니다.

## 3. 원본 문서는 무엇을 골라 읽어야 하나

| 주제 | 설계와 결정 | 개발 계약·현재 설명 |
|---|---|---|
| APM 기본 구조 | [APM 기본 설계](../../_workspace/features/apm/core/solutions--devdesign_apm.md) | [수신·저장 계약](../../_workspace/features/apm/core/solutions--contract_apm.md), [읽기 API](../../_workspace/features/apm/core/solutions--contract_apm-read-api.md) |
| 실시간 완료 요청 | [실시간 설계](../../_workspace/features/apm/realtime/solutions--devdesign_apm-realtime.md), [화면 설계](../../_workspace/features/apm/realtime/solutions--devdesign_apm-realtime-ux.md) | [P5 계약](../../_workspace/features/apm/realtime/solutions--contract_apm-p5-live.md) |
| 진행 중 요청 | [Java 확장 설계](../../_workspace/features/apm/realtime/solutions--devdesign_apm-live-active-extension.md) | [확장 README](../../moveseye-otel-extension/solutions--README.md), [실측 기록](../../_workspace/features/apm/realtime/solutions--r-p5-3b-extension-poc.md) |
| SLO·합성·메시징·배치 | [기본 설계](../../_workspace/features/apm/core/solutions--devdesign_apm.md) | [P3 계약](../../_workspace/features/apm/core/solutions--contract_apm-p3.md) |
| RUM·K8s | [기본 설계](../../_workspace/features/apm/core/solutions--devdesign_apm.md) | [P4 계약](../../_workspace/features/apm/core/solutions--contract_apm-p4.md) |
| 수집 장애 대응 | [회복력 설계](../../_workspace/features/apm/ingest-resilience/solutions--devdesign_apm-ingest-resilience.md) | [Collector 설정 해설](../../_workspace/guides/solutions--apm-collector-config-explained.md) |
| 대시보드 | [위젯 설계](../../_workspace/features/apm/dashboards/solutions--devdesign_apm-dashboards.md) | [위젯 계약](../../_workspace/features/apm/dashboards/solutions--contract_apm-dashboards.md) |
| 내보내기 | [내보내기 설계](../../_workspace/features/apm/data-export/solutions--devdesign_apm-data-export.md) | [현재 기능 설명](../features/solutions--APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0.md) |
| 콜드 아카이브 | [아카이브 설계](../../_workspace/features/apm/cold-archive/solutions--devdesign_apm-cold-archive.md) | [현재 기능 설명](../features/solutions--APM-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C.md), [계약](../../_workspace/features/apm/cold-archive/solutions--contract_apm-cold-archive.md) |
| 장기 상세 분석·복원 | [보존 정책 설계](../../_workspace/features/apm/retention/solutions--devdesign_apm-retention-policy.md) | [보류 상태](../../_workspace/features/apm/retention/solutions--deferred_apm-retention-policy.md) |

과거 계약에 현재 코드와 차이가 있다는 기록이 있습니다. 구현 시에는 관련 Controller·DTO와 FE 타입을 함께 대조해야 합니다. 이 표는 원문을 찾는 지도이며, 원문의 모든 줄을 최신으로 보증하지 않습니다.

## 4. 실제로 어떻게 개발했는가

작업 기록에서 반복되는 개발 순서는 다음과 같습니다.

1. **설계와 범위를 정함.** 무엇을 저장하고 무엇을 버릴지, 보존·권한·용량 제약을 정했습니다.
2. **위험한 가정을 먼저 시험함.** Collector 전송·재시도, 샘플링, 마스킹, 데이터량을 실제 또는 격리 환경에서 확인했습니다.
3. **BE와 DB를 구현함.** 수신, 정규화, 저장, 배치, 조회 API를 나누고 Flyway로 스키마를 관리했습니다.
4. **API 계약으로 FE를 연결함.** 응답 shape, null, 상태, 실패 사유를 문서화하고 화면·훅·타입을 연결했습니다.
5. **코드 검수와 행위 검증을 반복함.** 정적 검사 외에 DB 동시성, HTTP, 브라우저, 실제 Collector 경로를 검증했습니다. 단계별 미실시 항목도 남아 있습니다.

좋았던 선택은 “데이터가 존재한다”와 “어떻게 해석해야 하는가”를 함께 다룬 것입니다. 부족했던 부분은 전체 과정을 통과한 기준선이 여러 문서와 커밋에 흩어졌다는 점입니다.

## 5. 저장 설계의 핵심 결정

**메트릭은 시간 해상도를 나눕니다.** 최근은 자세히, 오래된 것은 요약해서 저장량과 조회 비용을 줄입니다. 요약이 남아 있어도 예전 개별 요청이나 인스턴스 상세가 남는다는 뜻은 아닙니다.

**트레이스는 span 원본과 파생 자료를 구분합니다.** 워터폴에는 원본 구간이 필요하고, 오류 빈도·DB 그룹·서비스 관계는 별도 집계로 빠르게 조회합니다.

**라이브는 메모리의 최근 창을 씁니다.** 낮은 지연을 얻는 대신 재시작과 노드 분산 시 별도 고려가 필요합니다. SSE는 이 메모리 상태를 화면으로 보내는 길입니다.

**아카이브는 파일과 원장을 함께 관리합니다.** 파일이 있다고 완료로 간주하지 않고, 어떤 날짜·데이터셋을 어떻게 보관했는지 상태를 남깁니다. 다만 복원·재검색은 후속 단계입니다.

## 6. APM 이외의 설계 지도

| 주제 | 현재 설명·지도 | 상세 설계 |
|---|---|---|
| 자빅스 성능·증분 조회 | [작업군 지도](../../_workspace/features/events/zabbix-load-relief/solutions--INDEX_zabbix-performance.md) | 지도에서 이슈별 설계·검증 연결 |
| 권한·세션 | [기능 설명](../features/solutions--%EA%B6%8C%ED%95%9C-%EA%B0%95%EC%A0%9C%EC%99%80-%EC%84%B8%EC%85%98-%ED%9A%8C%EC%88%98.md) | [작업군 지도](../../_workspace/features/auth-license/zm-157-permission/solutions--INDEX_zm-157-permission.md) |
| 자산·비용 | [자산 화면 안내](../guides/pages/%EC%9E%90%EC%82%B0-%EA%B4%80%EB%A6%AC/solutions--%EC%9E%90%EC%82%B0-%EB%AA%A9%EB%A1%9D.md), [비용 안내](../guides/pages/%EC%9E%90%EC%82%B0-%EA%B4%80%EB%A6%AC/solutions--%EB%B9%84%EC%9A%A9.md) | [자산 설계](../../_workspace/features/assets/assets-design/solutions--design_assets-management.md), [비용 설계](../../_workspace/features/assets/asset-cost/solutions--devdesign_asset-cost.md) |
| 네트워크·지리 맵 | [네트워크 맵](../guides/pages/%EC%9E%90%EC%82%B0-%EA%B4%80%EB%A6%AC/solutions--%EB%84%A4%ED%8A%B8%EC%9B%8C%ED%81%AC-%EB%A7%B5.md), [지리 맵](../guides/pages/%EC%9E%90%EC%82%B0-%EA%B4%80%EB%A6%AC/solutions--%EC%A7%80%EB%A6%AC-%EB%A7%B5.md) | [네트워크 설계](../../_workspace/features/maps/network-maps/solutions--devdesign_network-maps.md), [지리 설계](../../_workspace/features/maps/geo-maps/solutions--devdesign_geo-maps.md) |
| 클라우드 | [수집 주기 설명](../features/solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-%EC%8A%A4%EB%83%85%EC%83%B7-%EC%88%98%EC%A7%91-%EC%A3%BC%EA%B8%B0-%EB%B6%84%EB%A6%AC.md) | [재구성 설계](../../_workspace/features/cloud/aws-monitoring/solutions--devdesign_cloud-monitoring-rebuild.md) |
| GPU | [후속 상태](../../_workspace/features/premium/gpu-monitoring/solutions--deferred_gpu-monitoring.md) | [수집 경로 설계](../../_workspace/features/premium/gpu-monitoring/solutions--devdesign_gpu-collection-paths.md) |

이 표의 자산·맵·클라우드 영역은 기존 기능 설명과 설계의 연결을 정리한 것입니다. 이번에 각 영역의 전체 구현을 재검수한 것은 아닙니다.

## 7. 앞으로 문서를 늘리지 않고 유지하는 방법

기능 변경 때마다 설명 문서를 새로 만들기보다 해당 기능 문서를 갱신하고, 이 지도에는 상태와 링크만 갱신합니다. 검수 회차별 기록은 증거로 남기되 독자에게 필독으로 요구하지 않습니다.

각 기능 문서 첫 화면에는 네 가지만 둡니다. **사용자에게 달라진 점, 현재 구현 범위, 미완료 범위, 코드·검증 기준선**입니다. 세부 API와 과거 논의는 뒤에서 연결합니다.
