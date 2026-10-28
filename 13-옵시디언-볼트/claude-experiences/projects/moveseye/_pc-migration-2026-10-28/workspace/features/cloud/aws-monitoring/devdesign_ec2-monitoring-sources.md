# 설계 — EC2 모니터링 소스 매트릭스 (Zabbix agent × CloudWatch)

- 작성: 2026-08-26 · 상태: **검토 중(구현 보류 — 사용자 지시)** · 선행: devdesign_aws-status-timeline.md · devdesign_cloud-cost-optin.md

## 0. 문제

현재 EC2 성능 시계열은 "CloudWatch(GetMetricStatistics) 아니면 없음" 단일 축이다. 실제로는
**인스턴스마다** 상황이 다르다: Zabbix agent가 깔린 EC2도 있고(이미 우리 파이프라인에 시계열이
들어오는데 EC2 화면은 모름), CloudWatch 권한이 없는 계정도 있다. 소스를 분리하고 우선순위를 정한다.

## 1. 매트릭스 (🔴 판정 단위는 계정이 아니라 "인스턴스"다)

|  | CloudWatch 가용 | CloudWatch 불가 (권한없음·예산소진) |
|---|---|---|
| **agent 있음** | **A1** — agent 1차, CW는 안 부름 | **A2 (이상형)** — agent 단독, AWS 지표 호출 0 |
| **agent 없음** | **B1 (현행)** — CW 5지표. 메모리·디스크 사용률은 없음 | **B2 (최소)** — 상태 밴드 + CloudTrail만 |

- 어느 칸이든 **상태 밴드(스냅샷)·CloudTrail 마커는 항상 동작**(이미 구현) — 이 매트릭스는 성능 시계열 소스만 가른다.
- CW축은 실제로 3값(무료 GMS / 유료 GMD 옵트인 / 불가)이지만 소스 선택엔 가용/불가 2값으로 충분 — 유료 여부는 B1 안의 문제다.

## 2. 소스 우선순위 (결정 제안 D11)

**zabbix-agent > cloudwatch > 없음(밴드만)**

이유: agent가 상위호환이다 — ① 메모리·디스크 **사용률** 포함(CW 기본지표엔 없음) ② 수집 해상도·이력 보존이 온프렘과 동급 ③ AWS 지표 호출 0(프리티어 절약) ④ 제품 본류(Zabbix)와 파이프라인 단일화.
- agent 매칭 시 **CW를 병행 조회하지 않는다**(프리티어 절약 + 소스 단일 표기). "두 소스 비교" 니즈가 실재하면 그때 토글로.
- CW 고유값(StatusCheck)은 이미 스냅샷 축이 커버하므로 손실 없음.
- 응답 계약: `collection.source = 'zabbix-agent' | 'cloudwatch'` + 기존 강등 사유 체계 유지. FE는 소스 배지를 항상 표시 — "이 차트가 어디서 온 값인가"를 숨기지 않는다.

## 3. 매칭 — "이 EC2가 어느 Zabbix 호스트인가"

| 순서 | 방법 | 비고 |
|---|---|---|
| 1차 | **IP 매칭** — `InventoryPort.listHosts`의 interfaces 주소 ↔ EC2 privateIp/publicIp | 포트 경유 가능(확인 2026-08-26). 앱→엔진 원칙 준수 |
| 2차 | 호스트명 완전 일치 — Zabbix host name == instanceId 또는 Name 태그 | 보조 신호 |
| 실패 | **매칭 포기 + 화면에 "미연결" 표시** | 🔴 사설 IP는 VPC 간 중복 가능 — **다중 매칭이면 연결하지 않는다**(오연결이 미연결보다 나쁘다) |

- 매칭 결과는 5분 캐시(호스트 목록 조회 비용·스냅샷 주기와 일치).
- 수동 연결(오버라이드)은 **2차 과제** — 자산의 linked_hostid 축과 정합이 필요해서 감가상각 엔진(자산 통합) 때 함께 설계한다.

## 4. 화면 동작

- **EC2 상세 타임라인**: 소스 배지(agent/CloudWatch). agent면 차트 확장 — CPU + **메모리 사용률 + 디스크 사용률** + 네트워크(Zabbix 시계열). 헤더에 "Zabbix 호스트 상세로 이동" 링크.
- **EC2 목록**: "모니터링" 컬럼 3값 — `agent` / `CloudWatch` / `미관측`.
- **개요**: 커버리지 카드 — "agent N대 · CloudWatch-only M대 · 무관측 K대" + 안내 문구("에이전트를 설치하면 메모리·디스크 사용률까지 무료로 수집됩니다") — 제품 본류 유도이자 비용 절감 안내.
- **비용 화면 시너지**: agent 커버리지가 높을수록 유료 fleetMetrics(P3)의 가치가 떨어진다 — 옵트인 설명·P3 우선순위 판단에 반영.

## 5. 비용·전략 관점

- **A2가 목표 상태**: AWS 지표 호출 0 — 프리티어는 스냅샷·연결테스트 몫만 남는다.
- 판매 스토리: "에이전트 없이도 기본 모니터링이 되고, 에이전트를 깔면 온프렘 서버와 동급이 된다" — 설치 유도가 곧 고객의 CloudWatch 비용 절감이다.
- P3(유료 GetMetricData)는 **agent 미설치 대규모 플릿**에서만 실가치 — 이 설계 이후로 우선순위 재평가 권장.

## 6. 미결 (사용자 결정 대기)

| # | 질문 | 권장 |
|---|---|---|
| Q1 | 수동 연결 UI를 1차에 포함? | **2차로** (자산 축과 함께) |
| Q2 | agent 매칭 시 CW 병행 조회? | **안 함** (§2) |
| Q3 | 커버리지 표시 범위 — 개요 카드만? 목록 컬럼까지? | **둘 다** (판단 근거가 목록에 있어야 설치 유도가 됨) |
| Q4 | 구현 순서 | 매칭+소스 선택(BE) → 상세 타임라인 소스 분기(FE) → 커버리지 카드/컬럼 |

## 7. 구현 스케치 (착수 시 — 현재 보류)

- BE: `Ec2ZabbixMatcher`(InventoryPort 기반, 5분 캐시) → `/ec2/metrics`가 매칭 시 MetricPort 시계열로 응답(`items`에 memoryUsage·diskUsage 키 추가, source='zabbix-agent') / 미매칭 시 현행 CW 경로. `/ec2s` 목록·overview에 `monitoredBy` 필드.
- FE: 타임라인 소스 배지·차트 확장, 목록 컬럼, 개요 커버리지 카드.
- 계약 문서: features/cloud/aws-monitoring/contract_aws-status-timeline.md 개정.

## 8. 코덱스 설계 검토 반영 (2026-08-26, codex exec 읽기 전용 — 총평 "보완 후 진행 가능")

원문: scratchpad/codex_opinion.txt. 지적을 수용해 §2·§3·§4를 다음과 같이 개정한다.

### D11 개정 — "매칭되면 CW 중단"이 아니라 "품질 확인 후 중단"
- agent 매칭만으로 CW를 끊으면 관측 공백: agent는 붙어 있는데 필수 item이 없거나 stale일 수 있고, Zabbix 장애·수집 지연도 있다.
- **개정**: 매칭된 agent의 필수 지표(CPU·메모리·디스크) 존재 + freshness 판정 → 충족 시 agent 단독, 미충족/Zabbix 불가 시 **CW 명시적 fallback**. 응답에 `source`·`fallbackUsed`·`observedAt` 보존.

### 매칭 규칙 강화 (§3 개정)
- EC2 후보 주소는 primary private/public만이 아니라 **ENI 전체(secondary IP·EIP 포함)**.
- Zabbix 쪽은 **AGENT 인터페이스만** 후보(SNMP/IPMI/JMX 제외). ⚠️ useip=0(DNS 접속) 호스트는 현 InventoryPort 모델(ip만)로는 매칭 누락 — 알려진 한계로 명시.
- Name 태그 == 호스트명 매칭은 **자동 연결 근거로 쓰지 않는다**(중복·변경 흔함). 대신 instance ID 완전 일치 또는 Zabbix 태그 명시 식별자(`aws.instanceId` 등)를 2차 신호로.
- 매칭 근거를 보존한다: `IP_EXACT` | `INSTANCE_ID_EXACT` (판정 시각 포함) — 화면·디버깅이 "왜 연결됐나"에 답할 수 있게.

### 캐시·권한 (§3 추가 — 🔴 코덱스가 잡은 핵심 리스크)
- InventoryPort는 CallerContext로 Zabbix 세션을 해석한다 — **사용자별 결과를 전역 캐시에 섞으면 권한 누출**.
- **개정**: 매칭은 이 기능 전용 **시스템 컨텍스트**(CallerContext.system() — 기존 존재)로 수행하고 전역 캐시. 사용자 세션 경유 금지.
- 판정 시점은 원안대로 요청 시 + 5분 캐시(스냅샷 저장 반대 — 연결은 가변 메타데이터라 이력에 박으면 정합성 문제). 목록/개요도 같은 매처 캐시 사용.

### 커버리지 표시 5값 (§4 개정, 2026-08-26 `cloudwatch-off` 추가)
`zabbix-agent`(필수 지표 fresh) / `cloudwatch-off`(설정의 CloudWatch 스위치 꺼짐 — 의도적 미수집, devdesign_cloud-cost-optin D6) / `cloudwatch`(CW 가용) / `unavailable`(권한 거부·예산 소진·수집 실패) / `unmonitored`.
🔴 처음엔 4값이었고 스위치를 안 봐서, 설정은 "무과금 모드"인데 목록은 "CloudWatch"라 답했다(사용자 지적) → 스위치를 CW 전역 스위치로 통일하면서 값 추가.

### 기타 수용
- CW 접근거부 캐시(deniedUntil)를 전역 → **리전 단위 분리** (기존 검수 불안 ①과 동일 지적 — 이번에 함께 해소).
- API 내부 모델은 **지표별 source 확장 여지**를 남긴다(1차 정책은 인스턴스 단일 source 유지).
- P3는 하향하되 폐기 금지 — CW-only 인스턴스 수·차트 요청량 데이터를 보고 재평가.
