---
title: 클라우드 스냅샷 적재량 정리 — VPC 구간 적재와 수집 리전 범위 (ZM-151)
doc_type: feature
audience: [개발, QA, 운영, 기술 리더]
status: review
owner: MovesEye 팀
baseline: 2026-09-28
source_of_truth: moveseye-be-spring `db/migration/V64__cloud_vpc_snapshot_dedup.sql`·`aws/CloudSnapshotService`·`aws/CloudSnapshotQueryService`·`aws/CloudCollectionScope`·`aws/CloudSnapshotJob`·`aws/CloudSnapshotCleanupJob`·`aws/domain/CloudVpcSnapshot`·`aws/repository/CloudVpcSnapshotRepository`·`aws/CloudCostEstimateService`·`setting/dto/request/CloudInfraInfoDto`·`setting/SettingController`, moveseyee_fe `pages/setting/CloudInfraInfo.tsx`·`types/setting.ts`·`__tests__/CloudInfraCollectionScope.test.tsx`, 작업 보고 `C:/solutions/_workspace/features/cloud/snapshot/zm-151_cloud-snapshot-storage.md`, 런타임 증거 `C:/solutions/_workspace/planning/sprint-zm-151-156/zm-151-154_runtime-check.md`
reviewed_at: 2026-09-28
review_cycle: event-driven
deployment_scope: dev
be_commit: 3741f37 (master, `0c3d9e6` 포함 — ZM-151+ZM-153 한 커밋)
fe_commit: 3212e4c (master)
latest_flyway: V64
qa_evidence: BE 관련 단위·IT 208건(31개 클래스, 실제 PostgreSQL IT 5건 포함)·병합 전 BE 전체 4,248건(IT 포함, 09-21) + FE jest 5건 + 실데이터 마이그레이션 리허설 2회(롤백) + dev DB 런타임 확인(2026-09-28). 브라우저 화면 미실측
---

# 클라우드 스냅샷 적재량 정리 — VPC 구간 적재와 수집 리전 범위

> **이 문서로 답할 수 있는 질문**
> - VPC 스냅샷 테이블(`cloud_vpc_snapshot`)의 한 행은 이제 무엇을 뜻하며, 5분마다 행이 늘지 않는 이유는 무엇인가?
> - 왜 `cloud_instance_snapshot`은 그대로 회차마다 한 행인가? 중복을 걷으면 무엇이 깨지는가?
> - 설정 › 클라우드 인프라의 "수집 범위"(`collectionRegions`)는 어느 경로에 적용되고 어느 경로에는 적용되지 않는가?
> - 리전을 좁히면 빠진 리전의 스냅샷·자산은 어떻게 되는가?
> - 롤백된 이미지나 다른 브랜치의 BE가 같은 DB에 붙어도 안전한가(`last_seen_at` NULL 허용)?
> - V60이 아니라 V64인 이유, 옛 행 53,346개는 언제 사라지는가?

> 한 줄 요약 — **VPC 스냅샷은 "회차마다 한 행"에서 "상태가 바뀔 때만 한 행(구간)"으로 바꾸고, 백그라운드 수집이 도는 AWS 리전을 설정에서 고를 수 있게 했다.** 인스턴스 스냅샷은 회차행이 비용·추이 계산의 근거라 손대지 않았다. (Jira **ZM-151**)
>
> 🟢 **배포 상태** — BE·FE master에 병합됐고(미푸시), dev DB(도커 `dmove-postgres-test`, :5433)에 V64가 2026-09-22 적용되어 2026-09-28 런타임으로 구간 적재를 확인했다. 설정 화면(리전 선택)의 브라우저 실측과 `GET /settings/cloud-infra` 응답 본문 확인은 하지 않았다. 이 문서의 표에서 `현재`는 **master 소스에 구현되고 dev에서 확인됨**을 뜻하며, 화면 항목은 따로 표시한다.

이 문서는 내부 독자(개발·QA·운영)를 위한 것이다. 같은 커밋(`0c3d9e6`)에 들어간 **구성 정보 수집 주기 분리(ZM-153)** 는 [클라우드-스냅샷-수집-주기-분리.md](solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-%EC%8A%A4%EB%83%85%EC%83%B7-%EC%88%98%EC%A7%91-%EC%A3%BC%EA%B8%B0-%EB%B6%84%EB%A6%AC.md)가 정본이며, 이 문서는 주기 판정이 구간 적재와 맞물리는 지점만 언급한다.

## 1. 사용자 목표와 범위

- 해결하는 문제:
  - `cloud_snapshot` 배치가 5분마다 **활성 리전 전부**(표준 계정 약 17개)에 EC2 `Describe*`를 팬아웃했다. 리전 화이트리스트가 없어 서울 한 곳만 쓰는 고객도 17곳을 두드렸다(시간당 204회, 하루 약 4,900회. 과금은 0이지만 응답 대기·스레드·네트워크는 실제로 쓴다).
  - 그 결과를 **값이 하나도 안 바뀌어도 매번 새 행으로** 적었다. dev DB 23일치(2026-08-24~09-16) 실측에서 `cloud_vpc_snapshot`은 **29,665행·23MB**인데 서로 다른 구성은 **18개**뿐이었다. 리전마다 기본 VPC가 하나씩 있어 인스턴스 회차 수(1,745)의 정확히 17배였고, 한 행 약 812바이트 중 `findings` jsonb가 평균 547바이트라 같은 진단 결과를 2만 9천 번 복사한 셈이다. 운영(24시간 가동) 30일 보존으로 추산하면 약 147,000행·115MB다.
- 주 사용자: AWS 자격증명을 등록하는 관리자(설정 화면), 클라우드 상태 이력(VPC 진단 추이·EC2 상태 밴드)을 보는 운영자, DB 용량을 관리하는 운영자.
- 포함:
  - `cloud_vpc_snapshot`의 **구간 적재** — `run_at`(처음 관측)·`last_seen_at`(마지막 관측)·`content_hash`(정렬 후 지문). 같은 상태가 이어지면 `last_seen_at`만 전진한다.
  - 조회(`GET /cloud-infras/vpcs/history`)를 구간 기반으로 바꾸되 **응답 계약 유지**, 새 값 `collection.lastObservedAt` 추가.
  - 보존 정리를 구간 끝(`last_seen_at`) 기준으로 변경.
  - **수집 리전 범위** `Setting(CLOUD).value.collectionRegions` — 스냅샷 배치·수동 자산 동기화·추정 비용에 적용. 설정 › 클라우드 인프라 화면에 리전 다중 선택 섹션.
- 제외:
  - **`cloud_instance_snapshot`의 중복 제거** — 하지 않았다. 이 테이블은 "회차당 한 행"이 계산 근거다: 추정 비용의 가동시간(`countRunningSince` — running 행 수 × 5분)과 플릿 추이(`countBySeverityPerRun` — 회차별 등급 대수). 중복을 걷으면 비용이 조용히 0에 가까워지고, 변화 없는 회차의 대수가 0으로 떨어진다. 게다가 이 테이블은 작다(dev 512KB). 명세(`tasks_backlog-2026-09-16.md` §I1)는 두 테이블 모두를 가정했지만 소비처 전수 조사 뒤 VPC만 바꿨다.
  - 옛 VPC 행의 **일괄 병합 마이그레이션** — 하지 않았다. 보존 30일이 지나면 자연히 새 구조만 남고, 병합 SQL의 오판 위험을 질 이유가 없다(V64 머리말). 옛 행은 기존 보존 정리 배치(`cloud_snapshot_cleanup`)가 지운다(§8).
  - 화면의 리전 목록(`GET /cloud-infras/regions`)·VPC/EC2 목록에 범위를 거는 것 — 의도적으로 제외(§3.3).
  - VPC 상세에 `lastObservedAt`("마지막 관측 N분 전") 표시 — BE는 내려주지만 화면은 아직 안 그린다(§10 열린 항목).

## 2. 현재 상태

`현재` — master 병합(미푸시), dev DB V64 적용·런타임 확인. 화면만 미실측.

| 영역 | 상태 | 근거 |
|---|---|---|
| V64 마이그레이션(`last_seen_at`·`content_hash`·인덱스) | 현재 | dev `flyway_schema_history` rank 65, version 64, success=t (2026-09-22 09:40:23) |
| VPC 구간 적재(같은 상태 → 끝만 전진) | 현재 | dev 09-28 실측: V64 이후 새 행 **17개뿐**(VPC 17개 × 1), 오늘 회차 새 행 0·`last_seen_at` 전진 |
| 인스턴스 스냅샷 회차행 유지 | 현재 | dev 3,477행 = 서로 다른 `run_at` 3,477개(회차당 1행), 스키마에 `last_seen_at`·`content_hash` 없음 |
| 조회 계약 유지 + `collection.lastObservedAt` | 현재 | `CloudSnapshotQueryService.vpcHistory`, `CloudSnapshotQueryServiceTest` |
| 보존 정리 구간 끝 기준 | 현재 | `CloudVpcSnapshotRepository.deleteByLastSeenAtBefore`, `CloudVpcSnapshotRepositoryIT.deleteUsesIntervalEnd` |
| `collectionRegions` 저장·판독·적용 | 현재 | `CloudInfraInfoDto`·`CloudCollectionScope`, 런타임 OpenAPI에 필드 존재. dev DB에는 키 **없음** = 전체 → 17리전 전부 수집됨(정합) |
| 설정 화면 리전 다중 선택 | 부분 | jest 5건 통과·Vite 변환 200. **브라우저 렌더·저장 왕복 미실측** |
| `GET /settings/cloud-infra` 응답의 `collectionRegions` | 부분 | 전용 계정 부재로 미인증 401만 확인, 본문 미확인 |

## 3. 데이터 원천과 소유권

| 데이터 | 원천 | 읽기 | 쓰기 | cache/동기화 |
|---|---|---|---|---|
| `cloud_vpc_snapshot`(VPC 상태 **구간**) | 스냅샷 배치가 AWS 무료 `Describe*`(VPC·서브넷·라우트테이블·보안그룹) 결과를 진단(`NetworkExposureScanner`)해 적재 | `CloudSnapshotQueryService.vpcHistory`(VPC 상세 진단 추이), `CloudSnapshotCadence.dueForConfig`(마지막 관측 시각) | `CloudSnapshotJob`(`cloud_snapshot`, 기본 5분) → `CloudSnapshotService.collect` → `writeVpcIntervals`. 삭제는 `CloudSnapshotCleanupJob`(`cloud_snapshot_cleanup`, 매일 01:00, 보존 30일) | 캐시 없음. 구성 정보 자체는 ZM-153 주기(기본 30분)에만 수집 |
| `cloud_instance_snapshot`(EC2 상태 **회차행**) | 같은 배치의 `DescribeInstances`·`DescribeInstanceStatus` | `stateHistory`(상태 밴드), `instanceStateTrend`(플릿 추이), `CloudCostEstimateService`(가동시간) | 같은 배치가 회차마다 `saveAll`. 삭제는 같은 정리 배치(`run_at` 기준) | 변경 없음(ZM-151 이전과 동일) |
| `setting`(type=`CLOUD`).`value.collectionRegions` | 관리자가 설정 › 클라우드 인프라에서 저장 | `CloudCollectionScope.configuredRegions()` — 배치·수동 동기화·추정 비용이 매 실행 시 DB에서 읽음 | `POST /settings/cloud-infra`(관리자 전용). 요청마다 값 맵 전체를 새로 만든다 | 캐시 없음(다음 실행부터 반영). 저장 시 플릿 지표 캐시를 커밋 뒤 비운다(기존 동작) |
| `scheduler_setting.cloud_snapshot`·`cloud_snapshot_cleanup` | V28 시드 | 스케줄러 | 설정 › 스케줄러 관리 | — |

### 3.1 구간 모델(`cloud_vpc_snapshot`)

| 컬럼 | 뜻 | 비고 |
|---|---|---|
| `run_at` | 이 상태가 **처음** 관측된 회차(valid_from) | NOT NULL(기존) |
| `last_seen_at` | 이 상태가 **마지막으로** 관측된 회차. 같은 상태면 이 값만 전진 | **NULL 허용**. NULL = "한 회차짜리 구간" = `run_at` |
| `content_hash` | 비교용 지문(SHA-256 hex, `varchar(64)`) | NULL 허용. V64 이전 행은 NULL |

구간의 끝은 어디서나 `COALESCE(last_seen_at, run_at)`이다 — 엔티티는 `CloudVpcSnapshot.effectiveLastSeenAt()`, 쿼리(`findOverlapping`·`findLatestObservation`·`deleteByLastSeenAtBefore`)는 같은 COALESCE 식을 쓴다. 둘이 어긋나면 조회와 정리가 다른 구간을 보므로 **직접 `getLastSeenAt()`을 읽지 않는다.**

`last_seen_at`이 **"값이 안 변했다"와 "수집을 못 했다"를 가른다.** 배치가 멈춘 구간을 "계속 같은 상태였다"로 읽지 않기 위한 값이다. 이 값이 오래됐으면 배치가 멈췄거나 그 VPC가 수집 범위에서 빠진 것이다.

### 3.2 지문(`content_hash`) 규칙

`CloudSnapshotService.contentHash(name, subnetCount, instanceCount, criticalCount, warningCount, sortedFindings)`:

- **findings는 정렬한 뒤 넣는다.** AWS는 서브넷·보안그룹 목록 순서를 보장하지 않으므로 원문 순서로 해시하면 내용이 같아도 매번 달라져 **중복 제거가 조용히 무력화**된다. 정렬 키는 finding의 모든 필드를 키 이름 순으로 이은 문자열(`findingSortKey`)이라 필드가 늘어도 자동으로 비교에 들어간다.
- **저장도 같은 순서로 한다**(`sortFindings`의 정렬 사본을 `findings`에 넣는다) — 비교와 저장이 같은 모양이어야 "같은 상태"가 한 모양으로 남는다.
- Name 태그(`name`)도 지문에 넣는다. 바꾸면 화면 표기가 바뀌므로 새 구간이 맞다.

### 3.3 수집 리전 범위의 적용 경계

| 경로 | 범위 적용 | 이유 |
|---|---|---|
| 스냅샷 수집 배치(`collect`) | 적용 | 이 이슈의 본체 |
| 수동 자산 동기화(`fetchInstances`) | 적용 | 배치와 같아야 "제외 리전 자산이 수동 때만 갱신"되는 이상한 상태가 안 생긴다 |
| 추정 비용(`CloudCostEstimateService`) | 적용 | 가동시간이 스냅샷의 running 행을 세므로, 여기만 넓으면 수집 밖 인스턴스가 "가동 0분"으로 잡혀 비용이 0으로 보인다 |
| 화면 리전 목록(`AwsServiceImpl.getRegions` → `GET /cloud-infras/regions`), VPC·EC2 목록·개요 | **미적용** | 수집하지 않는 리전도 **둘러볼 수 있어야** 하고, 범위를 고르는 화면이 이 목록으로 선택지를 그린다. 걸면 한 번 좁힌 뒤 다시 넓힐 방법이 사라진다 |

세 적용 경로는 모두 `scope.filter(aws.enabledRegionNames())` 한 줄이다. 활성(옵트인) 리전 목록 위에 사용자 선택을 교집합으로 건다.

## 4. 사용자 흐름

### 4.1 정상 — 관리자가 수집 범위를 좁힌다

1. 설정 › 클라우드 인프라. 자격증명이 준비된 상태(`useCloudStatus().isReady`)면 "수집 범위" 섹션의 리전 다중 선택이 열리고, 선택지는 `GET /cloud-infras/regions`(활성 리전 전체)로 그린다.
2. 리전을 고르고 [저장]. FE는 `collectionRegions`를 **항상 명시 전송**한다(고르지 않았으면 `[]`). 유료 옵트인 두 스위치도 함께 실린다. 시크릿은 비었으면 보내지 않는다(기존 "비우면 유지").
3. BE는 형식·개수를 검증하고 정규화해 `setting.value`에 싣는다. 비어 있으면 키를 싣지 않는다(= 전체).
4. 다음 배치 회차부터 고른 리전만 팬아웃한다. 실행 요약 `regions=N`이 줄어든다.

### 4.2 정상 — 배치 1회(구간 적재)

1. 자격증명 없음 → `"skipped: unconfigured"`로 끝난다(실패 아님).
2. `scope.filter(enabledRegionNames())`로 리전 확정. **교집합이 비면** `"skipped: no collection region"`(전체로 되돌리지 않는다, §6).
3. 구성 정보 차례인지 판정(ZM-153). 차례가 아니면 인스턴스만 긁고 `vpcs=deferred(every Nm)`.
4. 리전별 병렬 수집(최대 8) → 인스턴스는 `saveAll`(회차행), VPC는 `writeVpcIntervals`:
   - 이번 회차 리전 묶음의 VPC별 최신 구간을 `findLatestPerVpc`(네이티브 `DISTINCT ON`)로 한 번에 읽는다.
   - 지문이 같으면 그 구간 id를 모아 `touchLastSeenAt`(벌크 UPDATE, 끝만 전진). 다르거나 직전 구간이 없거나 직전 지문이 NULL(V64 이전 행)이면 새 행.
5. 실행 요약 `regions=%d instances=%d vpcs=%d(new=%d unchanged=%d) failed=%d`. dev 09-28 실측 패턴: VPC 17개 모두 `unchanged`, 새 행 0.

### 4.3 정상 — VPC 상세 진단 추이 조회

`GET /cloud-infras/vpcs/history?vpcId&region&from&to`. 화면(`VPCDetail.tsx`)은 `items`를 `step: "end"` 계단선으로 그린다. BE는 창과 **겹치는** 구간을 찾아(창 시작 전부터 이어진 상태 포함) 구간마다 시작점 하나(`max(run_at, from)`)와 **마지막 구간을 닫는 점 하나**(`min(끝, to)`)를 싣는다. 사흘 이어진 상태가 예전엔 점 864개였고 지금은 2개지만 그림은 같다. FE는 이 화면을 수정하지 않았다.

### 4.4 권한 없음

- 설정 조회·저장(`/settings/cloud-infra`)은 `AdminAccessChecker.requireAdmin` — 비관리자는 HTTP 200 + body `code: 403`(제품 공통 계약).
- 이력 조회(`/cloud-infras/vpcs/history`)는 `cloudInfraMonitoring.awsResources.view` + 자격증명 구성 확인(`requireConfigured`, 미구성이면 `CLOUD_NOT_CONFIGURED`).

### 4.5 빈 데이터

- 자격증명 준비 전: 리전 선택 비활성, 목록 요청 자체를 만들지 않는다(BE가 미설정이면 거절하므로). 안내 문구 `cloud_infra.collection_regions_unavailable`.
- 설정 키가 없거나 형식이 틀림: **전체**로 판독(§6).
- 고른 리전이 전부 활성 목록에서 빠짐(옵트인 해제 등): **빈 목록 → 수집 skip**. 매칭 색인도 콜드로 비운다.
- 창 안에 구간이 하나도 없는 VPC: `items` 빈 배열, `collection.lastObservedAt = null`.

### 4.6 외부 시스템 오류

- 일부 리전 실패: 성공 리전만 적재한다. 실패 리전의 VPC는 이번 행이 없으므로 **건드리지 않는다** — 그 구간의 `last_seen_at`이 멈춰 있는 것이 "그 사이 관측하지 못했다"는 사실 그대로다. EC2 주소 역색인은 부분 실패 시 비운다(IP 매칭 오판 방지, 기존 규칙). 자산 동기화의 사라짐 판정도 실패 리전은 제외한다.
- 전 리전 실패: `IllegalStateException`을 던져 스케줄러 이력에 실패로 남긴다(자격증명 폐기·네트워크 단절).

## 5. API 계약

| Method | Path | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| GET | `/settings/cloud-infra` | — | `SettingResponseDto{ id, type: "CLOUD", value: { username, type, paidFeatures, collectionRegions? }, createdAt, updatedAt }`. 비밀값은 응답에서 제거(ZM-100). `collectionRegions`는 저장된 경우에만 있다 | 관리자(`requireAdmin`) |
| **POST** | `/settings/cloud-infra` | `CloudInfraInfoDto{ username, password?, type, costExplorerEnabled?, fleetMetricsEnabled?, collectionRegions?: string[] }` | 저장된 `SettingResponseDto` | 관리자 |
| GET | `/cloud-infras/vpcs/history` | `vpcId, region, from, to`(epoch seconds, 0이면 최근 7일) | `{ items: [{runAt, criticalCount, warningCount, subnetCount, instanceCount}], findingsFirstSeen: [...], collection: { state, source: "snapshot", cloudWatchUsed: false, lastObservedAt } }` | `awsResources.view` + 자격증명 구성 |
| GET | `/cloud-infras/regions` | — | 활성 리전 전체(수집 범위 **미적용**) | `awsResources.view` + 자격증명 구성 |

> 저장 EP는 `POST`다(`SettingController.storageCloudInfraInfo`, FE `SettingService.updateCloudInfraInformation`도 `API.post`). `PUT`이 아니다.

`collectionRegions`의 불변식(`CloudInfraInfoDto`):

| 항목 | 규칙 |
|---|---|
| 원소 형식 | `^[a-z]{2}(-[a-z]+)+-\d+$` — AWS 리전 이름(`ap-northeast-2`, `us-gov-west-1`). 어긋나면 400 검증 오류 |
| 개수 상한 | `@Size(max = 64)` — 현존 리전 수(약 36)에 여유를 둔 값 |
| 정규화 | 공백 제거·중복 제거·입력 순서 유지(`normalizedRegions`) |
| 빈 값 | 정규화 후 비면 **키를 싣지 않는다** = 전체. 빈 배열을 저장하지 않는 이유는 "아무 리전도 안 긁는다"로 읽힐 여지 때문 |
| 미전송(`null`) | 전체로 저장된다 — **"비우면 유지" 규칙을 적용하지 않는다.** 비밀값이 아니고, 비움 자체가 "전체로 되돌림"이라는 뜻 있는 선택이다 |
| 활성 여부 | 저장 시 확인하지 않는다. 옵트인은 저장 후에도 바뀌고, 수집 시점에 활성 목록과 교집합을 뜨므로 없는 리전은 조용히 빠진다 |

🔴 따라서 **FE는 저장할 때마다 현재 값을 되불러 와 실어 보내야 한다.** BE는 요청마다 `value` 맵을 새로 만들므로(`toValue`), 화면이 빠뜨리면 좁혀 둔 범위가 다음 저장에서 조용히 전체로 풀린다. `CloudInfraCollectionScope.test.tsx`의 첫 케이스가 이 왕복을 고정한다.

`vpcHistory`의 특이 계약:

- `items`는 여전히 `runAt`을 가진 점의 배열이다(계약 유지). 시작과 끝이 같은 구간(한 회차짜리·V64 이전 행)은 닫는 점을 싣지 않는다.
- `findingsFirstSeen[].seenFromStart = true`면 창 시작 시점에 이미 있었다는 뜻 — 발생 시각으로 단정하면 안 된다.
- `collection.lastObservedAt`(신규): 마지막 구간의 끝. 값이 안 바뀐 것과 관측을 못 한 것을 가른다.

## 6. 상태·동시성·실패

- 상태 전이(구간): `새 구간 생성(run_at = last_seen_at = 회차)` → 같은 지문 재관측마다 `last_seen_at` 전진 → 다른 지문이면 새 구간(이전 구간의 끝은 마지막 관측 시각에서 멈춤) → 끝이 보존 기간을 넘으면 삭제.
- **`@Modifying` + `@Transactional`**: `touchLastSeenAt`·`deleteByLastSeenAtBefore`는 리포지토리 메서드에 `@Transactional`을 단다. 호출부 `collect()`는 트랜잭션이 없고 수정 쿼리는 트랜잭션 밖에서 실행되지 않는다. 서비스의 private 메서드에 달면 자기호출이라 프록시를 우회해 효과가 없다. **이 애노테이션을 빼면 운영에서 5분마다 수집이 예외로 죽는다** — 구현 중 실제로 빼고 IT를 돌려 `Executing an update/delete query`로 정확히 그 테스트(`touchAdvancesLastSeenWithoutCallerTransaction`)가 실패하는 것을 확인했다. mock 테스트로는 잡히지 않는 결함이다.
- idempotency: 같은 회차를 두 번 적재하면 두 번째는 지문이 같아 `last_seen_at`만 같은 값으로 다시 쓴다(행이 늘지 않는다). 인스턴스 스냅샷은 회차행이라 두 번 적재되면 두 행이다(스케줄러 잠금이 동시 실행을 막는 것에 의존).
- 동시 실행: 스케줄러 잠금이 같은 잡의 동시 실행을 막는다. `writeVpcIntervals`는 **한 트랜잭션으로 묶지 않는다**(기존 `saveAll`도 묶지 않았다). 중간에 끊겨도 최악은 "끝을 한 회차 덜 전진" 또는 "같은 구간이 한 번 더 생김"이고 둘 다 다음 회차가 바로잡는다.
- **옛 코드와의 공존(`last_seen_at` NULL 허용)**: 처음엔 NOT NULL로 만들었다가 되돌렸다. 이 컬럼을 모르는 옛 코드가 같은 DB에 붙는 경우가 실제로 있다 — 이미지 롤백(Flyway는 V64를 되돌리지 않는다), 같은 dev DB를 쓰는 다른 워크트리 BE. NOT NULL이면 그 코드의 INSERT가 5분마다 실패한다. NULL 허용 + `COALESCE`면 그 행은 예전 뜻 그대로(한 회차 = 한 행) 읽혀 틀린 값 없이 섞여 산다. 실데이터 리허설에서 V64 적용 후 옛 형태 INSERT(컬럼 모름)가 성공하고 한 회차 구간으로 읽히는 것을 확인했다. 트리거로 채우는 방법은 이 레포에 선례가 없어 택하지 않았다.
- 판독 실패는 "전체"로 기운다: `collectionRegions` 키가 없거나 `List`가 아니거나 원소가 문자열이 아니면 필터를 걸지 않는다. 이 설정은 V64 이전 설치본에 없고, "잘못 읽어서 아무 리전도 안 긁는다"는 조용한 수집 중단이 된다. 유료 옵트인(`CloudPaidFeatures`)은 반대로 "꺼짐"으로 기운다 — 거기는 애매하면 돈이 안 나가는 쪽, 여기는 애매하면 수집이 멈추지 않는 쪽이 맞다. **단, 고른 리전이 전부 활성 목록에서 빠지면 전체로 되돌리지 않고 빈 목록(skip)이다** — 사용자가 좁힌 의도를 뒤집어 17곳을 다시 긁는 것보다 화면에서 드러나는 편이 고치기 쉽다(`CloudCollectionScopeTest.disjointChoiceYieldsEmptyNotAll`).
- retry/timeout: 배치 자체의 재시도는 없다(다음 회차). AWS 호출 타임아웃은 `AwsReadOnlyGateway` 기존 설정을 따른다(이번 변경 없음).
- partial failure: §4.6. 실패 리전의 구간은 그대로 두고, 성공 리전만 비교·적재한다.
- 첫 회차(1회성): V64는 기존 행에 `last_seen_at = run_at`을 채우고 `content_hash`는 NULL로 둔다. 배포 후 첫 구성 수집 회차는 `equals(null)`이 false라 모든 VPC가 새 구간을 한 번 쓴다. dev 실측: 17행, 전부 `run_at = 2026-09-22 09:46:19`(V64 직후 첫 회차).

## 7. 권한과 보안

- 기능 permission: 설정 조회·저장은 관리자 전용(`AdminAccessChecker.requireAdmin`). 역할 칸 `settings.cloudInfraInfo`는 BE 판정에 쓰이지 않는다(관리자 전용, [권한 강제 §5](solutions--%EA%B6%8C%ED%95%9C-%EA%B0%95%EC%A0%9C%EC%99%80-%EC%84%B8%EC%85%98-%ED%9A%8C%EC%88%98.md) 참조). 이력 조회는 `cloudInfraMonitoring.awsResources.view`.
- 데이터 범위: 스냅샷·설정은 설치 단위 1벌(사용자별 범위 없음).
- 감사 로그: 설정 변경(`collectionRegions`) 감사 로그는 **미확인**(이번 변경에서 추가하지 않았고, 기존 설정 저장 경로의 감사 기록 여부는 이 문서 작성 시 확인하지 않았다).
- secret/개인정보: `collectionRegions`는 비밀값이 아니다. 같은 요청의 `password`(시크릿 키)는 기존 규칙대로 비어 있으면 유지·응답에서 제거·저장 직전 암호화. 스냅샷 행에는 자격증명이 없다.

## 8. 운영

- 설정·환경변수:
  - `setting(CLOUD).value.collectionRegions` — 화면 저장. 환경변수 경로 없음.
  - `scheduler_setting.cloud_snapshot`(V28 시드: interval 5분, enabled) · `cloud_snapshot_cleanup`(daily 01:00, `options.retentionDays = 30`, 코드 기본값도 30).
  - 구성 정보 수집 주기 `options.configIntervalMinutes`(ZM-153, 기본 30)는 `last_seen_at`이 전진하는 간격이기도 하다. "관측이 끊겼다"를 판정하는 쪽은 이 주기보다 넉넉한 기준을 써야 한다.
- metric/log:
  - 배치 실행 요약: `regions=N instances=N vpcs=N(new=N unchanged=N) failed=N` 또는 `vpcs=deferred(every Nm)`. `new`·`unchanged`가 중복 제거가 실제로 먹는지 보여준다.
  - 🔴 `cloud_snapshot`은 성공 기록 정책이 정의되지 않아 기본값(실패만, 30건)이다(`SchedulerRunLogPolicy.DEFAULT`). 성공 회차의 요약은 `scheduler_run_log`에 남지 않으므로 **정상 동작은 행 시각(`max(last_seen_at)`, `run_at`)으로만 확인할 수 있다.** 필요하면 `options.logSuccess = true`로 켠다.
  - 조회 응답의 `collection.lastObservedAt`이 관측 중단의 신호다(아직 화면 미표시).
- 장애 증상과 복구:
  - **VPC 이력이 오른쪽 끝까지 이어지지 않는다** → 닫는 점 누락 의심(`vpcHistory`). 또는 `lastObservedAt`이 오래됐다면 배치 정지·범위 제외.
  - **좁혀 둔 범위가 저장 후 전체로 풀린다** → 옛 FE가 `collectionRegions`를 보내지 않는 경우. 🔴 **FE와 BE를 같이 배포**해야 한다.
  - **배치가 `skipped: no collection region`** → 고른 리전이 전부 활성 목록에서 빠짐. 설정에서 리전을 다시 고른다.
  - **매 회차 새 행이 생긴다(`new`가 VPC 수와 같음)** → 지문 불안정 의심(findings 정렬·저장 순서 불일치). 첫 회차 1회는 정상.
  - **수집 시 `Executing an update/delete query` 예외** → `touchLastSeenAt`의 `@Transactional` 유실.
- migration/rollback:
  - **V64 `cloud_vpc_snapshot_dedup`**: `last_seen_at timestamp`(NULL 허용)·`content_hash varchar(64)` 추가 → 기존 행 `last_seen_at = run_at` 채우기 → 인덱스 `idx_cloud_vpc_snapshot_latest (region, vpc_id, run_at DESC)`. 전부 `IF NOT EXISTS`.
  - **재번호 사유**: 처음 V60으로 만들었으나(09-16) master가 그 사이 V60~V63(APM 서비스 수집·사용자 잠금·수집 일시정지·이벤트 동기화 범위)을 먼저 썼다. 어느 DB에도 V60(이 내용)이 미적용임을 확인하고 09-21 커밋 `3741f37`로 V64로 옮겨 병합했다. 다른 워크트리·브랜치가 같은 번호를 잡을 위험은 병합 전까지 계속 있으므로, **병합 직전에 번호를 다시 확인**한다.
  - **리허설**: dev DB 실데이터로 2회, 전부 `ROLLBACK`. 29,733행 채우기·인덱스 생성 정상(NULL 0·불일치 0), V64 후 옛 형태 INSERT 성공, 중복 제거 후 남을 행 18행, 최신 구간 조회 약 30ms(전환기 순차 스캔), 롤백 후 스키마 원상태.
  - **롤백**: 안전. Flyway는 되돌리지 않지만 옛 코드도 V64 스키마에서 INSERT·조회가 된다(NULL 허용, §6). 코드만 되돌리면 그때부터 다시 회차마다 행이 쌓인다(옛 동작).
  - **전환기 비용**: 옛 행이 남아 있는 최대 30일 동안 `findLatestPerVpc`가 순차 스캔을 고를 수 있다(dev 약 30ms). 5분 배치라 무시할 수준이고 옛 행이 빠지면 사라진다.
  - **보존 정리와의 관계(옛 행 53,346개)**: 정리 경로는 코드로 확인된다 — `cloud_snapshot_cleanup`(매일 01:00) → `CloudSnapshotService.cleanup(30)` → `deleteByLastSeenAtBefore(cutoff)`가 `COALESCE(last_seen_at, run_at) < cutoff`로 지운다. V64가 옛 행의 `last_seen_at`을 `run_at`으로 채웠으므로 옛 행은 각자 `run_at` + 30일에 삭제 대상이 된다. 다만 dev DB에서 09-28 시점에 53,346행(가장 오래된 것은 08-24 이후)이 남아 있는데, **정리 배치가 dev에서 실제로 돌았는지는 미확인**(dev BE는 24시간 기동이 아니라 01:00 발화를 놓칠 수 있다). 운영에서는 매일 돈다는 전제로 약 30일 뒤 새 구조만 남는다.
  - **리전을 좁힌 뒤 기존 리전 데이터**: 삭제하지 않는다. VPC 구간은 갱신만 멈추고(비교 대상이 이번 회차 리전뿐이라 손대지 않음) 마지막 관측 + 30일에 정리된다. 인스턴스 회차행도 새 행이 없고 `run_at` + 30일에 정리된다. 자산은 사라짐 판정(`CloudAssetSyncService.markMissing`)이 **이번 회차에 수집한 리전만** 보므로 그대로 남는다. 화면의 리전·VPC·EC2 목록은 범위 미적용이라 계속 볼 수 있지만 **"수집 중지됨" 표시는 없다**(§10).
  - 배포 순서: FE·BE 동시. 마이그레이션은 기동 시 자동.

운영 절차 전반은 [운영자 런북](../operations/solutions--%EC%9A%B4%EC%98%81%EC%9E%90-%EB%9F%B0%EB%B6%81.md)에 있다(이 기능의 별도 절은 아직 없다).

## 9. 검증 근거

| 종류 | 증거 | 결과 |
|---|---|---|
| 단위·IT(BE) | `aws.*` + `setting.*` + `asset.cloud.*` + 아키텍처 + 마이그레이션 관련 31개 클래스. 신규 `CloudCollectionScopeTest`(6건)·`CloudInfraInfoDtoTest`(6건)·`CloudVpcSnapshotRepositoryIT`(실제 PostgreSQL, 6개 메서드 — 최신 구간·트랜잭션 없는 호출부의 끝 전진·겹침 조회·구간 끝 기준 삭제·옛 행 한 회차 구간·마지막 관측), 기존 `CloudSnapshotServiceTest`·`CloudSnapshotQueryServiceTest`·`CloudCostEstimateServiceTest` 확장 | **208건 통과**, skip 0 (09-16). 커밋 메시지 기준 관련 262건(ZM-153 포함) |
| 병합 전 전체(BE) | 관련 146건 + BE 전체 4,248건(IT 포함) | 통과 (09-21) |
| 음성 대조 | `touchLastSeenAt`의 `@Transactional` 제거 | 해당 IT만 `Executing an update/delete query`로 실패 → 복구 후 통과 |
| 단위(FE) | `CloudInfraCollectionScope.test.tsx` 5건(왕복·빈 배열 명시·기존 필드 동반·준비 전 잠금·준비 후 열림) | 통과. tsc·eslint(변경 파일) 0 |
| 마이그레이션 리허설 | dev DB 실데이터, 2회, `ROLLBACK` | §8 표대로 정상 |
| runtime(DB) | dev :5433, 2026-09-28 09:20~09:56, functional-qa. `flyway_schema_history`·컬럼·인덱스·행 수·회차 시각 실측 | V64 success=t(09-22 09:40). V64 이후 새 행 17개(VPC 17 × 1, 전부 첫 회차). 오늘 회차 09:24:13·09:54:45에 새 행 0·17행 `last_seen_at` 전진. 인스턴스 3,477행 = 회차 3,477개. 옛 행 53,346개 전부 `last_seen_at = run_at`. `setting(CLOUD)`에 `collectionRegions` 없음 = 전체 → 17리전 전부 갱신(정합) |
| runtime(API) | `GET /v3/api-docs`의 `CloudInfraInfoDto` | `collectionRegions` 필드 존재. `GET /settings/cloud-infra` 본문은 전용 계정 부재로 **미확인**(미인증 401만) |
| 브라우저 | — | **미실시**(설정 화면 렌더·저장 왕복·VPC 상세 계단선). `CloudInfraInfo.tsx` Vite 변환 200만 확인 |

증거 원천:

- 작업 보고: `C:/solutions/_workspace/features/cloud/snapshot/zm-151_cloud-snapshot-storage.md`
- 런타임 확인: `C:/solutions/_workspace/planning/sprint-zm-151-156/zm-151-154_runtime-check.md` §2
- 배경·실측: `C:/solutions/_workspace/features/cloud/snapshot/backlog_cloud-snapshot-region-scope.md`, `tasks_backlog-2026-09-16.md` §I1

## 10. 결정과 열린 항목

- 결정:
  - **ZM-151과 ZM-153을 한 커밋(`0c3d9e6`)으로** — 사용자 결정. ZM-153은 이 브랜치 위에 쌓였고, 중복 제거로 "자주 긁어도 행이 안 는다"가 되어 주기 분리의 급함이 줄었다.
  - **인스턴스 스냅샷은 중복 제거하지 않는다** — 회차행이 추정 비용·플릿 추이의 계산 근거(§1 제외).
  - **`last_seen_at` NULL 허용 + `COALESCE`** — 옛 코드 공존(§6).
  - **마이그레이션 V64** — master가 V60~V63을 먼저 씀(§8).
  - **범위는 배치·수동 동기화·추정 비용 셋에 같이, 화면 목록에는 안 건다**(§3.3).
  - **판독이 애매하면 전체, 교집합이 비면 빈 목록(skip)**(§6).
  - 지문은 정렬 후 SHA-256, 저장도 같은 순서(§3.2).
  - 옛 행 일괄 병합 마이그레이션 없음 — 보존 정리에 맡긴다.
- 기각 대안:
  - 방식 ②(직전 행과 같으면 INSERT 건너뛰기, 구조 유지) — "값이 안 변했다"와 "수집을 못 했다"를 가를 수 없어 `last_seen_at`을 둔 방식 ①을 택했다.
  - `findings` jsonb 통째 비교 — AWS 목록 순서가 흔들리면 매번 "변함"이라 정렬 후 지문으로 대체.
  - `last_seen_at` NOT NULL — 옛 코드 INSERT가 5분마다 실패.
  - 트리거로 `last_seen_at` 채우기 — 레포 선례 없음.
  - 교집합이 비면 전체로 되돌리기 — 사용자가 좁힌 의도를 뒤집음.
  - 빈 리전 백오프 — 리전 화이트리스트의 대안이지 병행 과제가 아니라 채택 안 함.
  - 저장 위치 `scheduler_setting.options.regions` — `Setting(CLOUD)`에 유료 옵트인과 같은 자리·같은 화면으로 통일.
- 열린 항목:

| 항목 | 상태 |
|---|---|
| 설정 화면(리전 선택) 브라우저 실측, `GET /settings/cloud-infra` 본문 확인 — 관리자 역할 임시 계정 필요 | 계획 |
| VPC 상세에 `collection.lastObservedAt` 표시("마지막 관측 N분 전") — BE는 내려준다. ZM-152(화면 자기설명)와 성격이 같아 어디에 붙일지 결정 필요 | 계획 |
| 제외 리전의 화면에 "수집 중지됨" 표시(백로그 §4-2) | 계획 |
| 옛 VPC 행 53,346개 — dev에서 정리 배치가 실제로 돌았는지 확인. 운영은 30일 뒤 자연 소멸 전제 | 미확인 |
| 리전 화이트리스트 **기본값** — 미설정이면 활성 리전 전체(현행 유지). 첫 저장 전 "쓰는 리전만 고르세요" 안내는 화면 `extra` 문구로만 있음. dev 프로필 기본 `enabled=false` 여부는 별도 조치 안 함 | 보류 |
| `cloud_snapshot` 성공 회차 기록(`logSuccess`) 기본 켬 여부 — 켜지 않으면 `new=/unchanged=` 요약을 DB로 볼 수 없다 | 보류 |
| 설정 변경 감사 로그 | 미확인 |

- Obsidian 관련 노트: `claude-experiences` 인덱스 기준 이 기능 전용 노트 없음(작성 시점). 자동 메모리 `zm-151-156-backlog-sprint.md`·`cloud-snapshot-region-fanout.md`가 진행 기록을 담는다.
- 관련 문서: [클라우드 스냅샷 수집 주기 분리(ZM-153)](solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-%EC%8A%A4%EB%83%85%EC%83%B7-%EC%88%98%EC%A7%91-%EC%A3%BC%EA%B8%B0-%EB%B6%84%EB%A6%AC.md), [권한 강제와 세션 회수 §5](solutions--%EA%B6%8C%ED%95%9C-%EA%B0%95%EC%A0%9C%EC%99%80-%EC%84%B8%EC%85%98-%ED%9A%8C%EC%88%98.md), [기능 문서 목록](solutions--README.md), [운영자 런북](../operations/solutions--%EC%9A%B4%EC%98%81%EC%9E%90-%EB%9F%B0%EB%B6%81.md), [릴리스 노트](../releases/solutions--%EB%A6%B4%EB%A6%AC%EC%8A%A4-%EB%85%B8%ED%8A%B8.md)

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-16 | 구현. BE 브랜치 `ZM-151` 커밋 `0c3d9e6`(ZM-151+ZM-153, 당시 마이그레이션 V60)·FE master `3212e4c`. 관련 테스트 208건·실데이터 리허설 2회 |
| 2026-09-21 | 마이그레이션 V60 → **V64** 재번호(`3741f37`) 후 BE master 병합. 병합 전 관련 146건 + 전체 4,248건 통과 |
| 2026-09-28 | dev DB(:5433) 런타임 확인 — V64 적용(09-22), VPC 새 행 17개만·오늘 회차 새 행 0·`last_seen_at` 전진, 인스턴스 회차행 유지, `collectionRegions` 미설정 = 전체. 이 문서 최초 작성 |
