# ZM-151 작업 보고 — 클라우드 스냅샷 적재량 정리 (중복 제거 + 리전 범위)

- 작성 2026-09-16 · 갱신 2026-09-22 · 상태 ✅ **완료 — BE·FE master 반영(미푸시)** · 정본 명세 [`../planning/tasks_backlog-2026-09-16.md`](../03-%EA%B8%B0%ED%9A%8D-%EB%B0%B1%EB%A1%9C%EA%B7%B8/%EB%B0%B1%EB%A1%9C%EA%B7%B8-%EC%9D%B4%EC%8A%88-%EB%93%B1%EB%A1%9D-%EB%AA%A9%EB%A1%9D-2026-09-16-%EC%A0%95%EB%A6%AC%EB%B6%84.md) §I1
- 커밋: BE master `0c3d9e6`(ZM-151+153 합침, 사용자 결정) · `3741f37`(마이그레이션 **V60 → V64** 재번호 — master가 V60~V63을 먼저 씀, 어느 DB에도 V60 미적용 확인) · FE master `3212e4c`
- 병합 전 검증(09-21): 관련 146건 + BE 전체 4,248건(IT 포함) 통과. 워크트리 제거됨
- 🔴 아래 본문의 **"V60"은 모두 V64로 읽는다**(작성 당시 번호)
- 남은 것: 런타임 종단 확인(병합된 BE로 재기동 후 — BE 재기동은 사용자 요청 시에만)
- 🔴 BE를 워크트리에서 한 이유: IntelliJ BE(:3000)가 master의 `build/classes`를 공유해서 돌고 있어, 거기서 빌드하면 실행 중인 JVM이 깨진다.

---

## 1. 한눈에

| | 내용 |
|---|---|
| **왜** | `cloud_vpc_snapshot`이 dev 23일치 **29,665행·23MB**인데 서로 다른 구성은 **18개**. 5분마다 같은 내용을 17개 리전에 대해 다시 적고 있었다 |
| **무엇을** | ① VPC 스냅샷을 "회차마다 한 행" → "상태가 바뀔 때만 한 행(구간)" ② 백그라운드 수집 리전을 설정에서 고르게 |
| **결과** | 운영 30일 기준 추산 **115MB → 1MB 미만**. 서울만 고르면 5분마다 나가던 호출이 **17곳 → 1곳** |
| **검증** | BE 관련 테스트 **208건 통과**(31개 클래스, 실제 PostgreSQL IT 5건 포함) · FE 테스트 5건 · tsc·eslint 0 · 실데이터 마이그레이션 리허설 2회(롤백) |

---

## 2. 착수 중 바뀐 결정 3가지 — 명세와 다르다

### 🔴 2-1. 인스턴스 스냅샷은 건드리지 않았다
명세는 두 테이블 모두 중복 제거를 가정했다. 소비처를 전수 조사하니 **`cloud_instance_snapshot`은 "회차당 한 행"이 계산 근거**였다.

| 소비처 | 계산 | 중복을 걷으면 |
|---|---|---|
| 추정 비용 `countRunningSince` | running 행 수 × 5분 = 가동시간 | **비용이 조용히 0에 가까워진다** |
| 플릿 추이 `countBySeverityPerRun` | 회차별 등급 대수 | 변화 없는 회차의 대수가 0으로 떨어진다 |

게다가 이 테이블은 작다(dev 512KB). 부풀어 있던 건 VPC 쪽(23MB)이라 **VPC만 바꿨다.**

### 🔴 2-2. `last_seen_at`을 NOT NULL로 두지 않았다
처음엔 NOT NULL로 만들었다가 되돌렸다. **이 컬럼을 모르는 옛 코드가 같은 DB에 붙는 경우**가 실제로 있다.
- 이미지 롤백 — Flyway는 V60을 되돌리지 않는다
- 같은 dev DB를 쓰는 다른 워크트리 BE(`p5-live` 등)

NOT NULL이면 그 코드의 INSERT가 5분마다 실패한다. 그래서 **NULL 허용 + 읽을 때 `COALESCE(last_seen_at, run_at)`**로 바꿨다. NULL은 "한 회차짜리 구간"이라는 뜻이라 옛 행이 **틀린 값 없이** 섞여 산다. 실데이터에서 V60 적용 후 옛 형태 INSERT가 성공하고 올바르게 읽히는 것을 확인했다(§5).

### 2-3. 리전 범위는 화면의 리전 목록에는 걸지 않았다
범위를 거는 곳과 안 거는 곳을 나눴다.

| 경로 | 범위 적용 | 이유 |
|---|---|---|
| 스냅샷 수집 배치 | ✅ | 이 이슈의 본체 |
| 수동 자산 동기화 | ✅ | 배치와 같아야 "제외 리전 자산이 수동 때만 갱신"되는 이상한 상태가 안 생긴다 |
| 추정 비용 | ✅ | 🔴 가동시간이 스냅샷 행을 세므로, 여기만 넓으면 수집 밖 인스턴스가 "가동 0분"으로 잡힌다 |
| 화면 리전 목록(`getRegions`) | ❌ | 수집하지 않는 리전도 **둘러볼 수 있어야** 하고, 범위를 고르는 화면이 이 목록으로 선택지를 그린다. 걸면 한 번 좁힌 뒤 다시 넓힐 방법이 사라진다 |

---

## 3. 바뀐 것

### BE (워크트리 `zm-151-be`)

| 파일 | 변경 |
|---|---|
| `db/migration/V64__cloud_vpc_snapshot_dedup.sql` | 신규(처음엔 V60이었으나 master의 V60~V63과 겹쳐 09-21 V64로 재번호 후 master 병합). `last_seen_at`(NULL 허용)·`content_hash` 추가, 기존 행 채우기, 최신 구간 조회 인덱스 |
| `aws/domain/CloudVpcSnapshot.java` | 두 필드 + null 안전 접근자 `effectiveLastSeenAt()` |
| `aws/repository/CloudVpcSnapshotRepository.java` | `findOverlapping`(창과 겹치는 구간) · `findLatestPerVpc`(네이티브 `DISTINCT ON`) · `touchLastSeenAt`(끝 전진) · `deleteByLastSeenAtBefore`(끝 기준 삭제). 옛 `BETWEEN` 조회·`run_at` 기준 삭제 제거 |
| `aws/CloudSnapshotService.java` | 구간 적재(`writeVpcIntervals`) · 정렬 후 지문(`contentHash`·`sortFindings`) · 범위 적용 · 끝 기준 정리 · 실행 요약에 `new=/unchanged=` 추가 |
| `aws/CloudSnapshotQueryService.java` | `vpcHistory`를 구간 기반으로. **응답 계약은 유지**(아래 §4) |
| `aws/CloudCollectionScope.java` | 신규. `Setting(CLOUD).value.collectionRegions` 판독 |
| `aws/CloudCostEstimateService.java` | 같은 범위 적용 |
| `setting/dto/request/CloudInfraInfoDto.java` | `collectionRegions` 필드·검증(리전 이름 형식, 최대 64)·정규화 |
| 테스트 | 기존 3개 수정 + 신규 3개(`CloudCollectionScopeTest` · `CloudInfraInfoDtoTest` · `CloudVpcSnapshotRepositoryIT`) |

### FE (`moveseyee_fe` master)

| 파일 | 변경 |
|---|---|
| `pages/setting/CloudInfraInfo.tsx` | 설정 › 클라우드 인프라에 **수집 범위** 섹션(리전 다중 선택). 저장된 값 되불러오기, 저장 시 항상 명시 전송, 자격증명 준비 전엔 목록 요청 안 함·선택 잠금 |
| `types/setting.ts` | `collectionRegions` 타입 |
| `locales/kr.json`·`en.json` | `cloud_infra.collection_*` 6개 키 |
| `__tests__/CloudInfraCollectionScope.test.tsx` | 신규 5건 |

⚠️ **번역 파일 두 개는 ZM-152 작업과 같은 파일을 함께 고쳤다.** 커밋할 때 ZM-151 부분(`cloud_infra.collection_*` 6줄씩)만 골라 담아야 한다.

---

## 4. 설계 요점

### 행 = 구간
| 컬럼 | 뜻 |
|---|---|
| `run_at` | 이 상태가 **처음** 관측된 회차 |
| `last_seen_at` | **마지막으로** 관측된 회차. 같은 상태면 이것만 전진. NULL = 한 회차짜리 |
| `content_hash` | 비교용 지문 |

수집 1회: 리전 묶음의 VPC별 최신 구간을 한 번에 읽고 → 지문이 같으면 `last_seen_at`만 벌크 UPDATE, 다르면 새 행.

### 🔴 지문은 정렬 후에 만든다
AWS는 보안그룹·서브넷 목록 순서를 보장하지 않는다. 원문 순서로 해시하면 **내용이 같아도 매번 달라져 중복 제거가 조용히 무력화**된다. finding의 모든 필드를 키 이름 순으로 이은 문자열로 정렬한 뒤 해시하고, **저장도 같은 순서로** 한다. Name 태그도 지문에 넣는다(바뀌면 화면 표기가 바뀐다).

### 🔴 조회 응답 계약은 그대로다
화면(`VPCDetail.tsx`)은 `items`를 `step: "end"` 계단선으로 그린다. 그래서 FE는 수정하지 않았다.
- 구간마다 시작점 하나(`max(run_at, from)`)
- **마지막에 닫는 점 하나**(`min(끝, to)`) — 없으면 선이 마지막 변화 시점에서 끊긴다
- 창 전에 시작한 구간도 찾는다 — 시작 시각만 보면 **열흘째 안 바뀐 VPC의 이력이 통째로 비어 보인다**

사흘 이어진 상태의 점이 864개에서 2개가 됐고, 그림은 같다.

### 새로 내려주는 값
`collection.lastObservedAt` — 마지막 관측 시각. **"값이 안 바뀐 것"과 "관측을 못 한 것"을 가르는 값**이다. 이게 오래됐으면 배치가 멈췄거나 그 VPC가 수집 범위에서 빠진 것이다. (화면 표시는 아직 안 붙였다 — §7)

### 제외된 리전의 자산
삭제되지 않고 갱신만 멈춘다. 자산 동기화의 사라짐 판정(`CloudAssetSyncService.markMissing`)이 **이번 회차에 수집한 리전만** 보기 때문에 따로 막을 필요가 없었다.

### 판독이 애매하면 "전체"
범위 키가 없거나 형식이 틀리면 필터를 걸지 않는다. 유료 옵트인은 반대로 "꺼짐"으로 기운다 — 거기는 애매하면 돈이 안 나가는 쪽, 여기는 애매하면 **수집이 멈추지 않는** 쪽이 맞다.
단, 고른 리전이 전부 비활성이면 전체로 되돌리지 않고 **빈 목록**(수집 skip)이다. 좁힌 의도를 뒤집어 17곳을 다시 긁는 것보다 화면에서 드러나는 편이 고치기 쉽다.

---

## 5. 검증

### 테스트
| 범위 | 결과 |
|---|---|
| BE `aws.*` + `setting.*` + `asset.cloud.*` + 아키텍처 + 마이그레이션 | **31개 클래스 · 208건 통과**, skip 0 |
| 그중 실제 PostgreSQL IT(`CloudVpcSnapshotRepositoryIT`) | 5건 통과 |
| FE `CloudInfraCollectionScope.test.tsx` | 5건 통과 |
| FE tsc · eslint(변경 파일) | 0 · 0 |

### 🔴 검출력 실증
`touchLastSeenAt`의 `@Transactional`을 잠시 빼고 IT를 돌리니 **정확히 그 테스트가 `Executing an update/delete query`로 실패**했다. 호출부(`collect()`)에 트랜잭션이 없어서, 이게 빠지면 **운영에서 5분마다 수집이 예외로 죽는다.** 목(mock) 테스트로는 통과했을 결함이다. 복구 후 통과 확인.

### 실데이터 마이그레이션 리허설 (dev DB, 전부 `ROLLBACK`)
| 확인 | 결과 |
|---|---|
| V60 적용 | 29,733행 채우기·인덱스 생성 정상, NULL 0·불일치 0 |
| 🔴 V60 이후 **옛 코드 형태 INSERT**(컬럼 모름) | 성공. `last_seen_at` NULL → `COALESCE`로 한 회차 구간으로 읽힘 |
| 중복 제거 후 남을 행 수 | **18행** (현재 29,733) |
| 최신 구간 조회 비용(전환기) | 약 30ms, 순차 스캔. 옛 행이 빠지면 사라지는 비용 |
| 롤백 후 스키마 | 원상태(추가 컬럼 0) |

### 하지 못한 것
- **런타임 종단 확인**(실제 BE가 AWS를 부르고 구간을 쌓는 것). 공유 dev DB에 V60을 적용하려면 master에 병합하고 BE를 재기동해야 한다. 지금 그 DB에는 V60을 모르는 BE가 붙어 있어, 먼저 적용하는 것 자체는 안전하지만(§2-2) 새 코드가 없으니 확인할 것도 없다.
- **브라우저 확인**(설정 화면의 리전 선택).

---

## 6. 배포 시 주의

| | |
|---|---|
| 🔴 마이그레이션 번호 | **V60**을 잡았다. `p5-live` 워크트리도 V59가 최신이라 **V60 충돌 가능성**이 있다 — 먼저 병합되는 쪽이 V60, 다른 쪽은 올려야 한다 |
| 첫 회차 | 옛 행은 지문이 없어 모든 VPC가 새 구간을 한 번씩 쓴다(1회성) |
| 전환기 | 옛 행(최대 30일치)이 보존 정리로 빠질 때까지 테이블이 크다. 기능상 문제 없음 |
| 롤백 | 안전. 옛 코드도 V60 스키마에서 INSERT·조회가 된다 |
| 설정 저장 | 🔴 FE와 BE를 **같이** 배포해야 한다. 옛 FE는 `collectionRegions`를 모르므로 저장할 때마다 **범위가 "전체"로 풀린다**(값을 안 보내면 BE가 키를 싣지 않는다) |

---

## 7. 남은 것 · 판단 필요

| # | 항목 | 비고 |
|---|---|---|
| 1 | 런타임 종단·브라우저 확인 | 병합·재기동 후 |
| 2 | VPC 상세에 `lastObservedAt` 표시 | "마지막 관측 3분 전". BE는 이미 내려준다. ZM-152(화면 자기설명)와 성격이 같아 그쪽에 붙일지 결정 필요 |
| 3 | dev 기본값 | 로컬에 AWS 자격증명이 있으면 지금도 5분마다 나간다. 이제 범위로 줄일 수 있으니 별도 조치 안 함 |
| 4 | 커밋 | 승인 대기. BE는 브랜치 `ZM-151`, FE는 master(번역 파일은 부분 선택 필요) |
| 5 | ZM-153(주기 분리) | 이 브랜치 위에 쌓는다. 중복 제거로 "자주 긁어도 행이 안 는다"가 되어 급함이 줄었다 |

---

**근거 위치**: BE `aws/CloudSnapshotService`·`CloudSnapshotQueryService`·`CloudCollectionScope`·`repository/CloudVpcSnapshotRepository` · `asset/cloud/CloudAssetSyncService#markMissing`(제외 리전 안전 근거) · FE `pages/setting/CloudInfraInfo.tsx`·`pages/cloud-infra-monitoring/aws-resources/VPCDetail.tsx`(계단선 소비처) · 백로그 [`../planning/backlog_cloud-snapshot-region-scope.md`](../03-%EA%B8%B0%ED%9A%8D-%EB%B0%B1%EB%A1%9C%EA%B7%B8/%EB%B0%B1%EB%A1%9C%EA%B7%B8-%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-%EC%8A%A4%EB%83%85%EC%83%B7-%EB%B0%B0%EC%B9%98%EC%9D%98-%EB%A6%AC%EC%A0%84-%ED%8C%AC%EC%95%84%EC%9B%83-%EC%A3%BC%EA%B8%B0-%EC%9E%AC%EA%B2%80%ED%86%A0.md)
