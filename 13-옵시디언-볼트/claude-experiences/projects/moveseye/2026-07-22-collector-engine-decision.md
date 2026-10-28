---
tags: [moveseye, architecture, multi-datasource, decision]
updated: 2026-08-10
---

# 2026-07-22 — 다중 데이터소스 전환 방향 확정 (수집 엔진 레이어)

## 결정

moveseye를 Zabbix 단일 소스 → **다중 데이터소스**(Zabbix + Prometheus + Datadog + Elasticsearch, Grafana류)로 전환하기로 확정. 아키텍처 논쟁 끝에 합의된 구조:

1. **논리 분리는 지금**: 서비스↔수집 레이어를 capability 포트 4개로 분리 — `MetricPort` / `InventoryPort` / `AlertPort` + `ZabbixAdminPort`(관리·IdP는 추상화 제외, Zabbix 전용 존치). Gradle 멀티모듈 `engine-api` / `engine-zabbix` / `app` in-process.
2. **물리 분리(별도 엔진 서버 + gRPC)는 유예**: 사용자가 처음 원했던 안. "책임 분리 = 서버 분리가 아니다"로 설득 — 코드 경계는 모듈+컴파일러로 달성되고, 1인 운영에서 서버 2대는 관리가 늘어나는 것. 승격 조건(고객사 망 내 수집기 배치 / 폴링 부하 / 폴리글랏 / 팀 분리)을 명시하고, 계약을 proto 호환 규칙으로 설계해 승격 비용만 선지불.
3. Grafana 방식(소스별 쿼리 패스스루)이 아니라 **도메인 정규화 방식** 채택 — DMOVE는 화면이 고정된 오피니언 대시보드이므로.

## 근거 (실측)

- Java 504파일 중 225개(45%)가 zabbix 참조, zabbix 패키지 밖 88파일이 hostid/itemid/triggerid 직접 사용, 아이템 키 리터럴이 도메인 서비스·DTO까지 침투. → **진짜 비용은 통신 계층이 아니라 도메인 모델 추상화.**
- 도메인이 4군집으로 깨끗하게 갈림: A 메트릭 읽기(item+history+trend) / B 인벤토리·알람 읽기(raw Map) / C 관리 쓰기(trigger expression DSL이 FE까지 노출 → 추상화 불가) / D 아이덴티티(Zabbix=IdP).
- 분리의 두 병목: ① `authToken`이 모든 서비스 첫 파라미터로 관통(JwtAuthFilter→Redis 토큰 해시) ② `ZabbixClient`→`SettingRepository`(JPA) 의존.

## 산출물·다음 단계

- 설계서 정본: `C:\solutions\_workspace\devdesign_collector-engine.md` (포트 시그니처·모듈 구조·proto 규칙·스트랭글러 7스텝).
- 마이그레이션: 멀티모듈 골격 → 포트+키 매핑 → A군 파일럿(memory→cpu) → A군 잔여 → B군(HostService 2000줄 최후) → C·D 이동 → Prometheus 어댑터(추상화 실검증). Phase 1은 REST 불변·FE 무변경이라 기존 E2E가 안전망.
- Elastic은 메트릭 소스가 아니라 **로그 신규 도메인** — 별도 설계 예정. 크로스 소스 엔티티 아이덴티티·인증 탈-Zabbix는 명시적 유예.

## 교훈

- "관리·책임 측면에서 서버 분리가 맞지 않냐"는 직관에는 **책임 분리의 실체를 분해해서** 답하는 게 유효했다: 코드 소유권(모듈로 해결) / 장애 격리(프로세스 분리의 실익이나 부분 장애라는 새 비용 동반) / 배포 독립성(부하가 요구할 때) / 운영 책임(팀이 나뉘어야 의미).
- 아키텍처 제안을 평가할 땐 먼저 결합도를 실측하라 — "45% 파일이 zabbix 참조"라는 숫자가 논의를 전송 계층에서 도메인 모델로 옮겼다.

관련: [[moveseye-overview]], [[zabbix-api-reference]], [[2026-06-10-spring-conversion]]

---

## FE provider workspace 후속 결정 (2026-08-10)

다중 데이터소스의 FE는 **공통 진입점과 공급자 고유 관리 모델을 분리**했다.

- `/setting/integrations`: 연결 현황·credential profile·runtime adapter 설치 여부만 공통으로 제공한다.
- `/setting/integrations/:provider`: Zabbix·Prometheus·Elasticsearch·Datadog 각각의 고유 운영 용어를 유지하는 workspace다.
- Zabbix workspace는 이미 존재하는 Host·Template·Item Lens·Trigger Lens 실제 화면으로 연결한다.
- Prometheus는 Targets·Service Discovery·Rule Groups·Labels, Elasticsearch는 Indices·Pipelines·Log Streams·Query, Datadog은 Integrations·Monitors·Hosts·Tags를 UI preview로만 보여 준다.
- 미구현 provider는 버튼을 비활성화하고 `UI preview`·`Adapter required`를 명시한다. 가짜 데이터·가짜 연결 성공·저장 동작은 만들지 않는다.

핵심 교훈: **도메인 읽기 결과는 공통화할 수 있지만 관리 콘솔의 쓰기 모델까지 공통화하면 각 공급자의 핵심 개념이 사라진다.** 제품 차원의 일관성은 메뉴·상태 표현·진입 경험에서 만들고, 공급자 고유 object model은 전용 workspace에 보존한다.
