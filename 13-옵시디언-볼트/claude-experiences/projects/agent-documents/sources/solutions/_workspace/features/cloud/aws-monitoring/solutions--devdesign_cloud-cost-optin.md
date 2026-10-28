# 설계 — 클라우드 비용 + 유료 API 옵트인 프레임

- 작성: 2026-08-25 · 상태: 확정(사용자 승인 — "고지 방식 + 설정으로 잠금") · 구현: Claude
- 선행: `devdesign_aws-status-timeline.md`(무과금 기반) · `reference_aws-api-cost.md`(과금 근거) · `devdesign_asset-cost.md`(자산 비용 탭, 감가상각)
- 결정 메모리: [[cloud-paid-api-optin]]

## 0. 원칙 (사용자 결정 2026-08-25)

1. **기본은 과금 0** — 표준 모드에서는 유료 API 코드 경로 자체가 닫혀 있다.
2. **유료는 항목별 옵트인** — 설정 > 클라우드 인프라의 토글. 켤 때 **예상 월 비용 고지 + 명시적 확인**(Modal). 고객 AWS 계정에 청구되는 돈이다.
3. 켜져도 **월 예산 가드**(cloud_api_budget 패턴) 적용 — "옵트인했으니 무한정"이 아니다.
4. 돈값 합의: 옵트인 대상은 **Cost Explorer(실청구액)** 와 **GetMetricData(플릿 지표)** 둘뿐. 메모리/디스크·알람·1분 해상도는 Zabbix agent·자체 판정으로 무료 대체(만들지 않음).

## 1. 저장 구조

`Setting(CLOUD).value`에 키 추가 (같은 화면·같은 정본 — 새 SettingType 만들지 않음):
```json
{ "username": "...", "password": "enc:v1:...", "type": "AWS",
  "paidFeatures": { "costExplorer": false, "fleetMetrics": false } }
```
- `CloudInfraInfoDto`에 boolean 2필드 추가(기본 false). 비밀값이 아니므로 "비우면 유지" 규칙 미적용 — 폼이 항상 명시 전송.
- BE 판독: `CloudPaidFeatures`(resolver) — `CloudCredentialsResolver`와 같은 자리. `CloudStatusDto`에 `paidFeatures` 노출(FE 렌더 분기용, 비밀 아님).

## 2. 단계

### P0 — 옵트인 프레임 (BE+FE)
- BE: DTO 확장 · `CloudPaidFeatures` 판독 · `GET /cloud-infras/status`에 노출.
- 유료 경로 게이트: 꺼져 있으면 **200 + `collection.state='disabled', reason='PAID_FEATURE_OFF'`** (강등 패턴 재사용 — 에러 아님).
- FE 설정 화면(CloudInfraInfo): "확장 기능(유료)" 섹션 — 토글 2개. 켜는 순간 Modal.confirm:
  - 예상 월 비용 표시. fleetMetrics는 **계산기**: 최근 스냅샷 인스턴스 수 × 지표 5 × 폴링 가정 → $ 환산. costExplorer는 고정 문구(일 2콜 배치 기준 월 $1 미만).
  - "이 기능은 고객사 AWS 계정에 과금됩니다" 고지 + AWS 요금 문서 링크.
- 저장 시 status 쿼리 무효화(기존 규칙).

### P1 — Cost Explorer 실청구액 (옵트인 뒤)
- 게이트웨이에 `ce:GetCostAndUsage` **단일 메서드**(유일한 CE 허용 — Javadoc 출처 필수).
- 🔴 화면에서 CE를 직접 부르지 않는다 — **일 1회 배치(`cloud_cost_sync`)가 적재**하고 화면은 DB만 읽는다.
  이유: (a) 요청당 $0.01이라 화면 조회마다 콜하면 비용 예측 불가 (b) CE는 느리다 (c) 예산이 일 2~3콜로 고정됨(월 <$1).
- V32: `cloud_cost_daily` (⚠️ V30·V31은 2026-08-25 병행 세션 aimonitor가 선점 — 착수 시 최신 번호 재확인)(date, service, amount, currency) + scheduler 시드(`cloud_cost_sync` daily, 옵트인 꺼짐/미설정 → "skipped" — cloud_snapshot과 같은 규칙).
- 조회 범위: 당월 MTD + 전월(비교용). 서비스별 분해. 리소스 단위는 14일 제약이 있어 **1차 제외**(자산별 배분은 P2 추정 엔진이 담당).
- 화면: 클라우드 개요에 "실청구액" 카드(월 누적·서비스별·전월 대비) + 자산>비용 탭에서 재사용. 옵트인 꺼짐 → 잠금 카드("설정에서 켜세요" + 예상 비용).

### P2 — 자산↔EC2 연동 + 무료 추정 엔진 (표준 모드 기본선)
- `AssetSyncService.cloudData` 채움(EC2 → 자산: 계정·리전·타입·상태·연결 볼륨).
- 추정: **Price List API(무료)** 단가 × **스냅샷 가동시간**(cloud_instance_snapshot — 5분 해상도로 running 시간 산출) = 인스턴스별 월 추정(온디맨드 기준 명시).
- 낭비 진단: 미부착 EBS · 미사용 EIP(안 쓰면 오히려 과금) · stopped 인스턴스의 EBS 잔존 비용.
- 자산 비용 탭: 온프렘=감가상각(기존 설계) / 클라우드=월 추정(+옵트인 시 실청구액 대조) 병렬 렌즈.
- 설치형: 폐쇄망용 단가 스냅샷 동봉 여부는 착수 시 결정(open question).

### P3 — GetMetricData 플릿 확장 (옵트인 뒤)
- overview `cpuTop`/`networkTop` 복원 + 인스턴스 비교. 예산 가드 필수. 규모 작으면(≤20대) 무료 GetMetricStatistics 팬아웃 폴백 검토.

## 3. 결정

| # | 결정 | 이유 |
|---|---|---|
| D1 | 옵트인 플래그는 Setting(CLOUD) jsonb | 자격증명과 같은 화면·같은 정본. 테이블/타입 신설은 과설계 |
| D2 | CE는 배치 적재, 화면은 DB만 | 비용 고정·응답 속도·예산 예측 가능 |
| D3 | 꺼짐 = 에러가 아니라 disabled 강등 | CLOUDWATCH_ACCESS_DENIED와 동일 문법 — FE 분기 일관 |
| D4 | 리소스 단위 CE는 1차 제외 | 14일 제약·비용 증가. 자산별 배분은 무료 추정이 담당 |
| D5 | 고지는 켜는 순간 Modal + 예상 비용 계산 | 저장 후 조용히 과금되는 구조 금지(사용자 지시) |
| D6 | **`fleetMetrics` 스위치는 CloudWatch 호출 전체의 전역 스위치**(2026-08-26) — 꺼짐이면 플릿 팬아웃뿐 아니라 상세 시계열(`/ec2/metrics`)도 `disabled/PAID_FEATURE_OFF`, 커버리지 배지는 `cloudwatch-off`. agent 소스는 무관 | 설정은 "무과금 모드"라는데 목록은 "CloudWatch"라 답하던 모순(사용자 지적). "껐다"의 뜻이 하나여야 문의가 안 생긴다. 설정 화면 명칭도 "플릿 지표 확장" → "CloudWatch 지표 수집" |

## 4. 구현 순서
P0 → P1 (이번 승인 범위 핵심) → P2 → P3. 각 단계 완료 시 검수 문서 갱신.

## 5. 진행 현황 (2026-08-25, 병행 세션 회피 모드)

⚠️ 병행 세션(aimonitor)이 BE·FE 공유 파일 작업 중이라 **겹치지 않는 파일만** 먼저 구현(사용자 지시).

**완료 (미커밋)**
- BE P0: `CloudPaidFeatures`(판독, 애매하면 꺼짐) · `CloudInfraInfoDto` paidFeatures · `CloudStatusDto/Service` 노출
- BE P1: gradle `costexplorer` · 게이트웨이 `getCostAndUsageDailyByService`(유일 CE 메서드) · V32(`cloud_cost_daily`+`cloud_cost_sync` 시드) · `CloudCostSyncService`(옵트인/자격증명 skip, TOTAL 행, 예산 기록) · `CloudCostQueryService`(DB만, 꺼짐=PAID_FEATURE_OFF 강등) · `CloudCostSyncJob` · `GET /cloud-infras/costs` · 테스트 4클래스(aws 스코프 35건 green)
- FE P0: `CloudInfraInfo` 확장 기능 섹션(Switch 2 + 비용 고지 Modal + 저장 시 명시 전송) · 타입 확장. tsc/eslint 0. i18n은 t() 폴백으로 우선 동작.

**보류 — 병행 세션 종료 후 (공유 파일)**
- [x] locales kr/en 정식 등록 완료
- [x] queryKey COSTS 추가 완료
- [x] EC2 대시보드 실청구액 카드 완료(켜짐: MTD+바차트+top5 / 꺼짐: 잠금 카드)
- [x] 응답 주도로 대체 — 잠금 판정은 /costs의 collection.state 하나로(판정 복제 방지)
- [x] BE 전체 green + 런타임 round-trip 실측 완료(실 CE 1콜, 144행 적재, 이후 꺼짐 복원)
- [x] 검수 요청서 작성(review_cloud-cost-optin.md) — 코덱스 검증 대기

**P2(자산↔EC2+추정 엔진)·P3(GetMetricData 소비 화면)는 미착수.**

## 6. P2 상세 설계 (2026-08-25 확정 — "B로 가자")

**목표**: "인스턴스별 한 달에 얼마 + 어디서 새는가"를 과금 0으로. 신설 화면 **클라우드 인프라 > 비용**.

### 결정
| # | 결정 | 이유 |
|---|---|---|
| D6 | EC2를 자산으로 **자동 생성하지 않는다** | Asset.source(zabbix/custom) 축과 편집 소유권·동기화 로직 전반에 파급. cloudData의 원 설계 의도도 "기존 자산에 AWS 메타 부착"이다. 자산 통합은 감가상각 엔진(devdesign_asset-cost.md) 구현 때 재론 |
| D7 | 단가는 **Price List API(무료)** + DB 캐시(V35 `cloud_price`, TTL 30일) | Pricing 콜은 무료지만 느리다(수백ms+). 폐쇄망은 캐시 미스 → `PRICING_UNAVAILABLE` 강등(낭비 진단 목록은 금액 없이 유지) |
| D8 | 가동시간은 **자체 스냅샷**(cloud_instance_snapshot MTD running 수 × 5분) | CloudWatch 불필요(제약 2). 추정 = 시간단가 × 실가동시간 — stopped 시간 자동 제외 |
| D9 | 추정은 **온디맨드 기준 명시** — RI/SP·데이터전송 미반영 문구 필수 | 청구서와 다르다는 문의 방지. 옵트인 시 실청구액과 나란히 대조 |
| D10 | 낭비 진단 3종: 미부착 EBS · 미사용 EIP · stopped 인스턴스의 EBS | 전부 무료 Describe*로 판정. EIP는 미사용이 오히려 과금되는 리소스 |

### BE
- gradle `pricing` + 게이트웨이 무료 메서드 3종: `getProducts`(pricing, us-east-1 고정) · `describeVolumes(region)` 전체 · `describeAddresses(region)`
- V35 `cloud_price`(region, resource_key, unit, usd, fetched_at) — resource_key = 인스턴스타입 or `ebs:gp3`
- `CloudPriceService`: 캐시 우선, 미스 시 Pricing API 1콜 후 적재. OS는 platformDetails로 Linux/Windows 분기
- `CloudCostEstimateService` + `GET /cloud-infras/cost-estimate`:
  `{ summary:{estimatedMtdUsd, projectedMonthUsd}, instances:[{instanceId,name,region,type,state,runningHours,computeUsd,ebsGb,ebsUsd,totalUsd}], waste:[{kind,resourceId,region,detail,monthlyUsd}], collection }`
- AWS 호출은 화면 요청 시 리전 팬아웃(무료 Describe*) — 스냅샷과 동일 원칙

### FE
- 신설 페이지 `클라우드 인프라 > 비용`: ① 요약(추정 MTD·월말 예상·옵트인 시 실청구액 대조) ② 인스턴스별 추정 표 ③ 낭비 진단 표(월 낭비액 합계) ④ CE 일별/서비스별(기존 카드 이전·확장)
- ⚠️ SideNav·routes는 병행 세션 공유 파일 — 추가형 최소 편집
