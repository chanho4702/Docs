---
title: MovesEye 공통 용어집
doc_type: reference
audience: [전체]
status: current
owner: MovesEye 팀
baseline: 2026-08-11
source_of_truth: product/domain code + Zabbix terminology
reviewed_at: 2026-08-11
review_cycle: quarterly
---

# MovesEye 공통 용어집

## 제품·사용자

| 용어 | 정의 |
|---|---|
| MovesEye / DMOVE | 여러 모니터링 데이터소스를 소스 중립 계약으로 정규화해 하나의 운영 화면으로 통합하는 종합 모니터링 제품. |
| 운영자 | 상태를 감시하고 장애를 조사·acknowledge하는 사용자. |
| Zabbix 관리자 | Host, Template, Item, Trigger와 연결 설정을 관리하는 사용자. |
| 자산 관리자 | 모니터링 대상의 자산 정보·비용·위치·맵을 관리하는 사용자. |

## 데이터소스·수집 엔진

| 용어 | 정의 |
|---|---|
| Data Source | 메트릭·인벤토리·알람을 수집하는 외부 시스템. Zabbix(구현), Prometheus·Datadog·Elasticsearch(계획). |
| Adapter | 특정 데이터소스를 중립 포트 계약에 맞게 구현한 모듈. 현재 `engine-zabbix` 1종. |
| Port | 데이터소스와 무관하게 정의한 조회·명령 계약. `MetricPort`·`InventoryPort`·`AlertPort`. |
| Capability | 소스가 제공하는 능력. `METRICS`·`INVENTORY`·`ALERTS`·`ALERT_ACK`·`LOGS`·`ZABBIX_ADMIN`. 화면 노출을 게이팅한다. |
| Data Source Registry | 등록된 소스와 그 capability를 관리하는 구성요소. 미지 소스는 `NOT_FOUND`, 미구현 포트는 `UNSUPPORTED`. |
| 정규화(Normalization) | 소스별 표현을 공통 도메인 모델로 옮기는 것. 범용 쿼리 패스스루와 대비되는 MovesEye의 접근 방식. |
| 소스 전용 계약 | 공통화가 불가능한 소스 고유 개념(Zabbix trigger expression, template link 등)의 계약. 중립 포트로 올리지 않는다. |
| Phase 1 / Phase 2 | Phase 1은 중립 계약 확립과 Zabbix 어댑터 전환(완료). Phase 2는 둘째 소스와 다중 소스 등록(예정). |

## Zabbix·모니터링

> Zabbix는 현재 유일하게 구현된 데이터소스다. 아래 용어 중 다수는 Zabbix 고유 개념이며, 다른 소스에서는 대응 개념이 다르거나 없을 수 있다.

| 용어 | 정의 |
|---|---|
| Host | Zabbix가 모니터링하는 서버·네트워크 장비 등의 대상. |
| Host Group | Host 묶음. MovesEye에서는 사용자 데이터 범위의 핵심 경계이기도 하다. |
| Template | 여러 Host에 재사용하는 Item·Trigger 구성 묶음. |
| Item | 측정 대상과 수집 방식을 정의한 항목. `key_`와 value type을 가진다. |
| History | Item의 비교적 짧은 기간 원시 시계열. |
| Trend | 장기 보존을 위한 시간 단위 집계값. avg/min/max/count 등을 가진다. |
| Trigger | Item 값을 평가해 이상 조건을 판정하는 규칙. |
| Problem | Trigger가 문제 상태가 되어 열린 활성 장애. |
| Event | Problem 발생·복구·상태 변화의 시점 기록. Problem과 동의어가 아니다. |
| Severity | 장애 중요도. 원천 Zabbix의 숫자/label 계약을 따른다. |
| Acknowledge | 운영자가 Problem을 확인하고 조치 상태나 메시지를 기록하는 행위. 해결 자체를 의미하지 않는다. |
| Interface | Host가 수집에 사용하는 IP/DNS, port, agent/SNMP 등의 접점. |
| Proxy | Zabbix Server 대신 일부 Host의 수집·전달을 담당하는 중계 구성요소. |
| `syncTime` | 응답이 가리키는 데이터 기준 시각. 모든 metric의 동시 측정을 보장하지 않는다. |
| Live Check | Host의 ping 또는 Agent interface availability를 즉시 확인하는 진단. 장기 상태나 모든 metric 정상 여부를 보장하지 않는다. |
| KPI | Key Performance Indicator. 화면에서 우선 확인할 상태·수치 요약. |
| Lens | 대량 Item·Trigger를 조건·page 기준으로 탐색하는 관리 화면. |

## 제품 데이터·권한

| 용어 | 정의 |
|---|---|
| Role | 기능 permission의 묶음. 무엇을 할 수 있는지를 통제한다. |
| User Group | 사용자의 묶음. Host Group과 연결돼 어떤 데이터를 볼 수 있는지 통제한다. |
| Permission Schema | 서버와 FE가 공유하는 기능 권한 식별자와 정책. |
| Asset | Zabbix Host 또는 custom 입력에서 유래한 관리 대상 snapshot과 보강 정보. |
| `source` | Asset의 원천. 대표적으로 `zabbix`, `custom`. |
| `excluded` | 동기화된 Asset을 다시 만들지 않도록 숨기는 soft-delete 상태. |
| `linked_hostid` | custom Asset과 Zabbix Host의 선택적 연결. |
| Device Classification | 장비 분류 code·표시명·순서와 비용 정책의 기준 정보. |
| Network Architecture | node·edge 문서로 저장한 논리 네트워크 구성도. |
| Geo Cluster | 지도에서 Host를 묶는 위치 단위. Host 좌표의 원천은 Zabbix inventory다. |
| 관리자(userRole) | MovesEye 사용자 유형이 `ADMIN` 또는 `SUPER_ADMIN`인 계정. 역할 권한과 무관하게 모든 기능을 쓴다. Zabbix 쪽 역할(Super admin 등)은 이 판정에 쓰지 않는다. |
| 기능 칸(permission key) | 역할 편집 화면의 모듈 아래 한 줄. `view`·`edit`·`delete`·`download` 플래그를 갖는다. 서버 판정은 `view`와 `edit`만 쓴다. |
| 사용처 없음(칸) | 역할 편집 화면에 있지만 서버·화면 어디에서도 판정에 쓰지 않는 기능 칸. 체크해도 동작이 바뀌지 않는다. |
| 미연동 계정 | Zabbix 사용자와 연결되지 않은 MovesEye 계정(`zabbix_userid` 없음). 비관리자면 Zabbix 경유 요청이 HTTP 200 + `code: 403`(`FORBIDDEN`)으로 거부된다. |
| 공유 EP | 여러 화면이나 앱 부팅 경로가 함께 쓰는 API. 홈·전역 검색·알림 벨·SSE 등. 막으면 사이드바·홈이 깨지므로 역할 칸을 적용하지 않는다. |
| 대상 가시성 | 요청한 호스트를 그 사용자가 Zabbix 권한으로 볼 수 있는지 여부. 기능 권한과 별개로 확인한다(`HostVisibilityChecker`). |
| 세션 세대(generation) | 사용자별 refresh 토큰 세대 번호. 올리면 그 사용자의 모든 기기 로그인이 무효가 된다. Redis `REFRESH_GEN:<userId>`. |
| 로그인 계열(family) | 로그인 한 번에서 회전으로 이어지는 refresh 토큰 사슬. 로그아웃은 그 계열만 무효로 한다. |
| 파괴 작업 등급(DESTRUCTIVE) | AI 툴 위험 등급 중 영구 삭제 계열. MCP에서는 기본 차단되고, 입력(예: 템플릿 해제의 `clear=true`)에 따라 등급이 올라갈 수 있다. |
| 확인 카드 | AI 어시스턴트가 쓰기·삭제 전에 띄우는 승인 카드. 요약·대상 표·등급을 보여 주며 한 요청에 5장까지다. |

## 기술·문서

| 용어 | 정의 |
|---|---|
| `app` | Spring Boot 부팅, REST, Security, JPA를 가진 root module. |
| `engine-api` | 데이터소스 중립 port와 소스 전용 계약을 제공하는 compile dependency. Spring에 의존하지 않는다. |
| `engine-zabbix` | Zabbix JSON-RPC adapter 구현. app에는 runtimeOnly로 연결된다. |
| `ApiResult<T>` | `status`, `code`, `errorCode`, `message`, `data`를 갖는 기본 응답 envelope. |
| Flyway baseline | 기존 schema를 특정 version까지 적용된 것으로 인정하고 이후 migration을 관리하는 방식. |
| OpenAPI | REST 요청·응답 계약을 기계가 읽을 수 있게 표현한 문서. dev profile에서 확인한다. |
| MOC | Map of Content. Obsidian에서 관련 노트와 정본 문서를 연결하는 탐색 허브. |
| ADR | Architecture Decision Record. 하나의 중요한 결정과 대안·근거·영향을 기록한다. |
| SSOT | Single Source of Truth. 특정 사실을 최종 판단하는 정본. |
| baseline | 문서가 설명하는 코드·schema·제품의 기준 시점 또는 version. |
| Origin | scheme, host, port의 조합. credential cookie를 쓰는 CORS 정책의 허용 단위. |
| Refresh | 만료된 access token을 새로 발급받는 session 갱신 흐름. |
| `SameSite` | browser가 cross-site 요청에 cookie를 보낼 조건을 제한하는 속성. |
| Data Scope | 사용자가 조회·변경할 수 있는 데이터 범위. MovesEye에서는 User Group–Host Group 연결이 핵심이다. |
| fail-closed | 권한이나 정책을 판단할 수 없을 때 허용하지 않는 기본 동작. |
| current job | 같은 요청자가 현재 실행 중인 비동기 upload 작업. |
| heartbeat | 비동기 작업이 살아 있음을 나타내는 최종 갱신 시각. |
| active unique constraint | 같은 범위에서 실행 중 작업을 하나만 허용하는 DB unique 조건. |
| immutable artifact | 배포 뒤 내용이 바뀌지 않고 같은 ID로 재현 가능한 build 산출물. |
| forward-fix | 이전 schema를 되돌리지 않고 다음 migration·code 변경으로 문제를 수정하는 방식. |
| RTO | Recovery Time Objective. 장애 후 서비스를 복구해야 하는 목표 시간. |
| RPO | Recovery Point Objective. 복구 시 허용할 수 있는 최대 데이터 손실 시점. |
| break-glass | 비상시에만 승인·감사 조건으로 사용하는 고권한 접근 절차. |

## 표기 규칙

- Zabbix `Problem`, `Event`, `Trigger`는 번역으로 뭉개지 않고 필요 시 English identifier를 함께 쓴다.
- `Host Group`은 화면명과 DB 접근 범위 문맥을 구분해 설명한다.
- “0”과 “데이터 없음”을 같은 값으로 쓰지 않는다.
- 계획 기능은 `현재`라고 표현하지 않는다.

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-05 | 최초 공통 용어 기준선 작성 |
| 2026-08-11 | 데이터소스·수집 엔진 용어 8종 신설, 제품 정의를 다중 데이터소스 기준으로 갱신 |
| 2026-09-17 | 권한·세션 용어 10종 추가(ZM-157, 소스 기준) — 관리자(userRole), 기능 칸, 사용처 없음, 미연동 계정, 공유 EP, 대상 가시성, 세션 세대, 로그인 계열, 파괴 작업 등급, 확인 카드 |
