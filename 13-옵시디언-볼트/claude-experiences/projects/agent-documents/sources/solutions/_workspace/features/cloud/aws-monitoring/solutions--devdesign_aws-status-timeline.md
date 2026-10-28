# 설계 — AWS 상태 차트화 "통합 타임라인" (과금 0)

- 작성일: 2026-08-24 · 상태: 확정(사용자 승인) · 구현: Claude (SOLO-CLAUDE)
- 과금 근거 정본: `_workspace/features/cloud/aws-monitoring/reference_aws-api-cost.md` · 선행 계약: `features/cloud/aws-monitoring/contract_aws-zero-cost.md`

## 0. 하드 제약 (사용자 지시)

1. 🔴 **과금 절대 금지.** 프리티어 초과 포함. 유료 API는 `AwsReadOnlyGateway`에 메서드를 만들지 않는다.
2. 🔴 **CloudWatch를 안 쓰는 고객이 있다** (IAM에 cloudwatch 권한 없음/정책상 미사용).
   → CloudWatch는 **선택적 강화**일 뿐, 없어도 기능이 성립해야 한다. **기본선은 자체 스냅샷**.

## 1. 목표 — 운영자의 질문에 시간 축으로 답한다

지금 화면은 전부 "현재 스냅샷"이고, 운영자의 질문("언제부터? 왜? 누가?")은 전부 시간이 낀 질문이다.
세 재료를 한 타임라인에 겹친다:

| 재료 | 내용 | 출처 | 없을 수 있나 |
|---|---|---|---|
| **B. 상태 시계열** | 인스턴스 상태·StatusCheck·위험등급, VPC 진단 결과의 이력 | 무료 `Describe*` 결과를 **우리 DB에 적재** | ❌ 항상 있음 (기본선) |
| A. 성능 시계열 | CPU·네트워크·디스크 | `GetMetricStatistics` (프리티어) | ✅ 권한 없으면 강등 |
| C. 원인 마커 | 그 시점에 누가 무슨 API를 쳤나 | CloudTrail `LookupEvents` (기존 EP 재사용) | ✅ 없으면 마커만 생략 |

## 2. 단계

### Phase 1 — 스냅샷 수집기 (재료 B) ← 이번 구현
- **V28**: `cloud_instance_snapshot`(run_at, region, instance_id, name, state, status_check, severity)
  + `cloud_vpc_snapshot`(run_at, region, vpc_id, counts, findings jsonb)
  + scheduler_setting 시드 2행: `cloud_snapshot`(interval 5분) · `cloud_snapshot_cleanup`(daily, 보존 30일)
- `CloudSnapshotJob`(SchedulerJob): 자격증명 미설정이면 **예외가 아니라 "skipped: unconfigured" 요약** —
  정상 상태다(클라우드 안 쓰는 설치본). 설정돼 있으면 리전 팬아웃해 `DescribeInstances`+`DescribeInstanceStatus`
  (+`DescribeVpcs`·SG 진단)를 적재. overview의 위험 판정 로직을 **재사용**(복제 금지 — 게이팅 때 확립한 원칙).
- cleanup job은 `requiresActiveLicense=false`(정리 계열 규칙), 수집 job은 기본 true 유지.
- 호출 비용: EC2 API는 무과금이므로 5분 주기 팬아웃 자체가 0원.

### Phase 2 — API (재료 B 소비 + 재료 A)
- `GET /cloud-infras/ec2/state-history?instanceId&region&from&to` — 상태 밴드용 (스냅샷 DB만, AWS 미호출)
- `GET /cloud-infras/overview`의 `trends.instanceStates` 채움 — 시간별 정상/경고/위험/중지 대수 (스냅샷 집계)
- `GET /cloud-infras/vpcs/detail`에 `history` 추가 — 진단 결과 추이 ("22번 개방이 언제 생겼나")
- `GET /cloud-infras/ec2/metrics?instanceId&region&range` — `GetMetricStatistics` 시계열. 단:
  - **권한 프로브**: AccessDenied → `collection.state='unavailable', reason='CLOUDWATCH_ACCESS_DENIED'` 캐시(TTL)
    후 재시도 억제. 에러 응답이 아니라 200 + 빈 series (FE는 성능 차트 숨김).
  - **월 예산 가드**: 월 호출 카운터(DB), 상한 기본 500,000(프리티어의 50% — 고객이 CloudWatch를 다른 용도로
    쓸 수 있으니 절반만 우리 몫으로). 초과 시 호출 중단 + `reason='BUDGET_EXHAUSTED'`. 이 가드 없이는 배포 금지.
  - Period 자동 산정: 조회 범위가 15일 이내=300s(기본 모니터링 해상도), 15~63일=300s, 63일+=3600s.
    호출당 1,440 포인트 제한 준수.
  - SDK 의존성 `software.amazon.awssdk:cloudwatch` 복원 — 단 게이트웨이에 `getMetricStatistics`만 만든다.
    (`features/cloud/aws-monitoring/contract_aws-zero-cost.md` §원칙 갱신 필요: 금지는 GetMetricData·GetMetricWidgetImage·GetInsightRuleReport)

### Phase 3 — FE
- EC2 상세: 통합 타임라인 — 성능 라인차트(A, 있을 때만) + 상태 배경 밴드(B) + CloudTrail 마커(C, 기존
  events EP를 resourceId로 필터). CloudWatch 강등 시 밴드+마커만으로 성립.
- Overview: `trends.instanceStates` 스택 영역 차트.
- VPC 상세: 진단 추이(발견 시각 표시) + SG 변경 이벤트.

## 3. 결정 사항

| # | 결정 | 이유 |
|---|---|---|
| D1 | 상태 이력은 CloudWatch가 아니라 자체 적재 | CloudWatch엔 상태의 역사가 없고, VPC는 기본 지표 자체가 없음. 그리고 제약 2 |
| D2 | 스냅샷은 per-instance/per-vpc 행 (jsonb 뭉치 아님) | 차트 질의가 리소스 단위 — 인덱스 (instance_id, run_at) |
| D3 | 예산 상한 기본 50% (500k) | 프리티어는 계정 전체 공유 — 고객의 다른 도구 몫을 남긴다 |
| D4 | CloudWatch 불가는 에러가 아니라 강등 | 제약 2. "안 쓰는 고객"은 정상 상태 |
| D5 | 수집 주기 5분 | EC2 기본 모니터링 해상도와 일치. 더 촘촘해도 새 정보 없음 |
| D6 | 보존 30일 + cleanup 배치 | 100 인스턴스 기준 ~86만 행. 표준 정리 배치 패턴(report_cleanup) 재사용 |

## 4. 검증 계획
- 단위: 위험 판정 재사용 경로·Period 산정·예산 가드 경계(잔여 0)·AccessDenied 강등.
- 런타임: dev에서 job 수동 실행 → 스냅샷 적재 확인 → state-history 응답 → FE 차트.
- 과금 검증: 게이트웨이 메서드 목록 대조(`reference_aws-api-cost.md` §1·§2만) — 리뷰 체크리스트에 포함.
