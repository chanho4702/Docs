# 검수 요청 — 유료 API 옵트인 프레임 + Cost Explorer 실청구액

- 작성: Claude, 2026-08-25 · 검수: Codex (COLLAB.md §8) · 미커밋 (BE `ZM-79` 트리 + FE `master` 트리)
- 설계 `devdesign_cloud-cost-optin.md` · 결정 메모리 [[cloud-paid-api-optin]] · 선행 검수 `review_aws-status-timeline.md`
- ⚠️ 같은 트리에 병행 세션의 aimonitor 작업(미커밋)이 공존한다 — 이 검수 범위는 **aws/·setting/·cloud-infra FE**만이다.

## 범위·의도

사용자 결정: "유료 AWS API는 기본 잠금, 설정에서 예상 비용 고지 후 항목별 옵트인."

**BE**
- `CloudPaidFeatures` — Setting(CLOUD).value.paidFeatures 판독. 🔴 키 없음/형식 오류 = 무조건 꺼짐(애매하면 과금 안 되는 쪽)
- `CloudInfraInfoDto`에 옵트인 2필드(비밀값 아님 — 항상 명시 전송, 미전송=false 저장)
- `CloudStatusDto.paidFeatures` 노출
- 게이트웨이 `ce:GetCostAndUsage` 단일 메서드(us-east-1 고정, Javadoc 출처) + gradle `costexplorer`
- V32 `cloud_cost_daily`(일자×서비스, TOTAL 행) + `cloud_cost_sync` 시드(매일 05:00, lookback 35일)
- `CloudCostSyncService` — CE를 부르는 **유일한** 코드. 옵트인 꺼짐/자격증명 없음 → "skipped". 호출 1건을 cloud_api_budget에 기록
- `CloudCostQueryService` + `GET /cloud-infras/costs` — **DB만 읽음**. 꺼짐 → 200 + `PAID_FEATURE_OFF` 강등(D3 문법)
- 테스트 4클래스 신설(핵심: "옵트인 꺼짐 = CE 호출 0"을 테스트로 고정)

**FE**
- 설정 > 클라우드 인프라: "확장 기능(유료)" 섹션 — Switch 2개, 켜는 순간 비용 고지 Modal(예상액 + **AWS 공식 요금 문서 링크**), 저장 시 명시 전송
- EC2 대시보드: 실청구액 카드 — 켜짐: MTD 누적 + 일별 바차트(로우데이터 뷰 포함) + 서비스별 top5 / 꺼짐: 잠금 카드 + 설정 링크
- locales kr/en `cloud_paid.*`·`cloud_cost.*` 정식 등록, queryKey `COSTS`, 타입·서비스 확장
- 설계 변경 1건: "useCloudStatus에 paidFeatures 노출" 항목은 **응답 주도로 대체** — 잠금 판정을 `/costs` 응답의 collection.state 하나로 통일(판정 복제 방지, D3)

## 불안한 지점

1. **CE 페이지네이션 미처리** — `getCostAndUsageDailyByService`가 nextPageToken을 안 따라간다. 35일×서비스 그룹이면 1페이지에 대부분 들어오지만, 서비스 수가 아주 많은 계정은 뒷장이 잘린다. 실측(dev)에서는 1페이지로 충분했음. 따라갈 경우 페이지당 $0.01 추가 — 상한 로직과 함께 결정 필요.
2. **옵트인 저장이 설정 화면 폼에 묶임** — env/IAM 자격증명만 쓰는(username 미저장) 설치본은 폼 저장이 username 필수라 옵트인만 따로 못 켠다. 의도된 제약인지 판단 바람.
3. **MTD 계산의 TZ** — FE 카드가 `new Date(item.date)`(UTC 자정)로 월 경계를 가른다. KST에서 1일 오전엔 전월 말일이 포함될 수 있는 ±1일 오차. CE 자체가 일 단위라 실해는 작다고 봤음.
4. **Modal.confirm 정적 컨텍스트** — antd v5의 정적 Modal은 ConfigProvider 테마를 못 받을 수 있다(App context 밖). 다크모드에서 확인 필요.

## 검증 완료 (런타임 — :3001 + dev 도커 DB)

- BE 전체 스위트 green(병행 aimonitor 테스트 포함) · FE jest 1,226/1,227(실패 1=선재 AiAssistantPage) · tsc/eslint 0
- V32 적용·시드 확인. 기본 상태: `paidFeatures 전부 false` → `/costs`가 `PAID_FEATURE_OFF` 강등 ✓
- **옵트인 round-trip 실측**: 설정 저장(costExplorerEnabled=true) → status 반영 → `cloud_cost_sync` 수동 실행 → **실 CE 호출 성공** — `cloud_cost_daily` 144행(7/21~8/25), `/costs`가 실청구액 반환(당월 EC2 $8.58 · VPC $2.83 · Tax $1.20…), 예산 카운터 기록 ✓
- 검증 후 옵트인 **꺼짐 복원**(강등 재확인) — dev는 기본 상태다. 검증에 실 CE 1콜($0.01) 사용.

## 미검증
- FE 브라우저 렌더(설정 토글·고지 Modal·실청구액 카드/잠금 카드) — 실화면 1회 확인 필요
- CE 페이지네이션 경계(위 ①) · IAM에 `ce:GetCostAndUsage` 없는 계정의 실패 로그 모양
- P2(자산↔EC2 연동+추정 엔진)·P3(GetMetricData 소비 화면)는 **미착수 범위**

---

## 추가분 (2026-08-25 오후) — P2: 추정 비용 엔진 + 클라우드 비용 화면

**BE**
- gradle `pricing`(무료) · 게이트웨이 신규 4메서드: `getProducts`(Pricing, us-east-1) · `describeVolumes`(리전 전체) · `describeAddresses` · `enabledRegionNames`
- 🔴 **런타임 실측으로 잡은 결함**: `describeRegions(allRegions=true)`가 미옵트인 리전까지 반환 → 팬아웃 34개 중 17개가 인증 실패로 헛돌았음. `enabledRegionNames()`(optInStatus 필터) 신설, 스냅샷 수집·추정 팬아웃 교체. 수정 후 failedRegions 17→0, 응답 15.6s→6.2s
- V35 `cloud_price` 단가 캐시(TTL 30일, 실패 시 낡은 캐시 폴백 — "낡은 단가가 단가 없음보다 낫다")
- `CloudPriceService`(PriceList JSON 파싱: terms.OnDemand→priceDimensions→pricePerUnit.USD) · `CloudCostEstimateService`(컴퓨트=시간단가×스냅샷 가동시간, EBS=GB×월단가, 낭비 3종) · `GET /cloud-infras/cost-estimate`
- EIP 낭비 단가는 상수 $0.005/h(2024-02 전 리전 단일가 — Javadoc에 출처·사유)
- 테스트: CloudPriceServiceTest 3(캐시 적중/미스 파싱/폐쇄망 폴백) · CloudCostEstimateServiceTest 2(산식+낭비 3종 검출 / partial 강등)

**FE**
- 신설 페이지 **클라우드 인프라 > 비용**(`/cloud-infra-monitoring/cost`): 요약 3카드(MTD 추정·월말 예상·월 낭비) + 온디맨드 기준 고지 Alert(D9) + 인스턴스별 추정 표(상세 링크) + 낭비 진단 표 + 실청구액 카드
- `CloudBillingCard` 공용 추출(대시보드·비용 페이지 공유), SideNav 메뉴(DollarOutlined)·라우트·i18n `cloud_estimate.*`

**검증**: BE aws 스코프 green · FE tsc/eslint 0 · jest 1,232/1,233(실패 1=선재 AiAssistantPage) · **:3000 런타임 실측** — ec2-tokyo t2.micro 실단가 $0.0152/h(Pricing API 실호출→캐시), 가동 20.17h, MTD $0.31, 월 예상 $11.86(컴퓨트 $11.09+EBS $0.77 — AWS 공시가와 합치), 낭비 0건(깨끗한 계정), state=ok
**미검증**: 브라우저 렌더(비용 페이지·메뉴) · Windows 인스턴스 단가 경로 · 낭비 3종의 실검출(계정에 낭비 리소스 없음 — 단위 테스트로만) · 대규모 계정(인스턴스 수백 대)의 응답 시간
**불안한 지점 추가**: ⑤ 추정 EP가 요청마다 리전 팬아웃(무료지만 ~6초) — 캐시/스냅샷 기반 전환 여지 ⑥ EIP 상수 단가는 요금 개정 시 수동 갱신 필요
