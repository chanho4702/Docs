---
title: 클라우드 스냅샷 자원별 수집 주기 분리 — 구성 정보 기본 30분 (ZM-153)
doc_type: feature
audience: [개발, QA, 운영, 기술 리더]
status: review
owner: MovesEye 팀
baseline: 2026-09-28
source_of_truth: moveseye-be-spring `aws/CloudSnapshotCadence`·`aws/CloudSnapshotService#collect(int)`·`aws/CloudSnapshotJob`·`aws/repository/CloudVpcSnapshotRepository#findLatestObservation`·`scheduler/SchedulerSettingService`·`scheduler/SchedulerSettingController`·`scheduler/domain/SchedulerSetting#optionInt`, moveseyee_fe `constants/scheduler.ts`·`pages/setting/scheduler/schedulerConfigInterval.ts`·`SchedulerEditModal.tsx`·`SchedulerManagement.tsx`, 보고 `C:/solutions/_workspace/features/cloud/snapshot/zm-153_cloud-snapshot-config-cadence.md`, 런타임 증거 `C:/solutions/_workspace/planning/sprint-zm-151-156/zm-151-154_runtime-check.md` §2
reviewed_at: 2026-09-28
review_cycle: event-driven
deployment_scope: dev
be_commit: 0c3d9e6 (master, ZM-151과 한 커밋)
fe_commit: 3212e4c (master, ZM-151과 한 커밋)
latest_flyway: 없음 — ZM-153 자체 마이그레이션은 없다. 판정 재료 `cloud_vpc_snapshot.last_seen_at`은 ZM-151(V60·V64)이 만든다
qa_evidence: BE 관련 테스트 262건(36클래스, 실제 PostgreSQL IT 포함)·FE jest 9건·tsc·`typecheck:contract`·eslint 0(2026-09-16), dev 런타임 실측(2026-09-28 09:24~09:55, 결함 0). 브라우저 미실시
---

# 클라우드 스냅샷 자원별 수집 주기 분리

> **이 문서로 답할 수 있는 질문** — 클라우드 스냅샷 배치가 5분마다 도는데 VPC·서브넷·보안그룹·라우트테이블은 왜 30분에 한 번만 읽히나? 그 주기는 어디서 바꾸고 어떤 값이 허용되나? 재기동하면 셈이 초기화되나? 주기를 늘리면 무엇을 잃나? 로그에서 "이번 회차는 구성 정보를 건너뛰었다"를 어떻게 확인하나? (Jira **ZM-153**)

> 한 줄 요약 — **`cloud_snapshot` 배치는 5분마다 인스턴스 상태를 읽고, 구성 정보(VPC·서브넷·보안그룹·라우트테이블)는 별도 주기(기본 30분, 화면에서 0~24시간)로만 읽는다.** 차례 판정은 회차 수가 아니라 DB에 남은 마지막 구성 관측 시각으로 한다.
>
> 🔴 **배포 상태** — BE·FE 모두 master에 병합됐고(미푸시) dev 런타임(:3000, 도커 DB :5433)에서 30분 주기·1분 여유가 실측으로 확인됐다. 설정 화면의 브라우저 렌더와 설정 API 응답 본문은 확인하지 않았다(§9).

이 문서는 내부 독자(개발·QA·운영)용이다. 배치 화면의 일반 사용법은 [관리자 가이드 §5](../guides/solutions--%EA%B4%80%EB%A6%AC%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md), 스케줄러 API 개요는 [API 카탈로그 §3-9](../technical/solutions--API-%EC%B9%B4%ED%83%88%EB%A1%9C%EA%B7%B8.md)에 있다. 이 기능의 판정 재료(`last_seen_at`)와 수집 리전 범위는 선행 기능 [클라우드 스냅샷 적재량 정리(ZM-151)](solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-%EC%8A%A4%EB%83%85%EC%83%B7-%EC%A0%81%EC%9E%AC%EB%9F%89-%EC%A0%95%EB%A6%AC.md)가 정본이다.

## 1. 사용자 목표와 범위

- 해결하는 문제: `cloud_snapshot` 배치가 **5분마다 수집 대상 리전 전부**에 인스턴스와 구성 정보를 같은 주기로 읽었다. 구성 정보는 리전의 VPC 1개당 Describe **4콜**(VPC·서브넷·라우트테이블·보안그룹)이라 인스턴스(리전당 2콜)의 두 배인데, 실제로는 드물게 바뀐다. 리전 1개·VPC 1개 기준 시간당 호출이 72회였다.
- 주 사용자: AWS 자격증명을 등록해 클라우드 상태 수집을 켠 설치본의 관리자(스케줄러 설정 편집자), 그 호출량·보안 노출 지연을 감수하는 운영자.
- 포함:
  - 구성 정보(VPC·서브넷·보안그룹·라우트테이블)만 별도 주기로 수집. 기본 30분.
  - 설정 > 스케줄러 > `cloud_snapshot` 편집 모달의 "구성 정보 수집 주기" 칸(0=매 실행 ~ 24시간)과 목록 표의 태그.
  - 차례가 아닌 회차의 실행 요약 `vpcs=deferred(every Nm)`.
- 제외:
  - 인스턴스·인스턴스 상태 수집 주기 — 배치 간격(V28 시드 5분) 그대로.
  - 수집 리전 범위(`collectionRegions`)·VPC 구간 적재 — ZM-151.
  - 배치를 두 개(`cloud_snapshot`/`cloud_snapshot_config`)로 나누는 것 — §10 기각.
  - 스케줄러 옵션의 저장 시 검증 — §10 열린 항목.

효과(보고서 §1, 코드 호출 수 기준 계산): 리전 1개·VPC 1개에서 시간당 호출 **72 → 32**(인스턴스 2×12 + 구성 4×2). 리전 수와 곱해진다.

## 2. 현재 상태

`현재` — master 병합 완료(BE `0c3d9e6`·FE `3212e4c`, 미푸시). dev 런타임에서 옵션 미설정 상태의 기본 30분 동작을 실측했다(§9). 배포 환경(qa·production)에는 나가지 않았다.

| 영역 | 상태 | 근거 |
|---|---|---|
| 차례 판정(`CloudSnapshotCadence`) | 현재 | 코드·`CloudSnapshotCadenceTest` 7건·dev 실측 |
| 미룬 회차에 VPC Describe 미호출 | 현재 | `CloudSnapshotService#collectRegion`의 `withConfig=false` 분기·`CloudSnapshotServiceTest` |
| 잡 옵션 전달(`CloudSnapshotJob`) | 현재 | `CloudSnapshotJobTest` 2건 |
| FE 편집 칸·목록 태그 | 현재(소스) | `SchedulerCloudConfigInterval.test.tsx` 9건. 브라우저 렌더 미실측 |
| 성공 회차의 실행 이력 기록 | 부분 | 정책 기본이 실패만 기록이라 `deferred` 요약이 DB에 남지 않는다(§8) |
| 저장 시 옵션 범위 검증 | 계획 | 읽을 때만 절단(§3) |

## 3. 데이터 원천과 소유권

| 데이터 | 원천 | 읽기 | 쓰기 | cache/동기화 |
|---|---|---|---|---|
| 구성 수집 주기(분) | `scheduler_setting.options` jsonb, 잡 `cloud_snapshot`, 키 **`configIntervalMinutes`** | BE `SchedulerSetting#optionInt(key, 30)` → `CloudSnapshotCadence#clamp`(0~1440). FE `toConfigIntervalMinutes`(같은 범위로 절단) | `PUT /settings/schedulers/cloud_snapshot`의 `options`(관리자). 옵션 본문은 검증 없이 통째로 저장 | 저장 즉시 `SchedulerManager#reschedule`. 값은 매 회차 `run(setting)`에서 읽는다 |
| 마지막 구성 관측 시각 | `cloud_vpc_snapshot` — `MAX(COALESCE(last_seen_at, run_at))` 전 리전 통틀어 1개 | `CloudVpcSnapshotRepository#findLatestObservation` | 구성을 읽은 회차의 구간 적재(ZM-151)가 `last_seen_at`을 전진시키거나 새 구간을 만든다 | 캐시 없음. 매 회차 DB 조회 |
| 인스턴스 스냅샷 | `cloud_instance_snapshot` | — | 매 회차 1행씩(ZM-153 영향 없음) | — |
| 배치 간격(5분) | `scheduler_setting.interval_minutes`(V28 시드 5) | — | 같은 편집 모달의 "실행 주기" 칸 | — |

### 3.1 옵션 읽기 규칙

| 저장된 값 | BE가 쓰는 값 | FE가 보여 주는 값 |
|---|---|---|
| 키 없음(기존 설치본, dev `options={}`) | 30 | 30 |
| 숫자 45 | 45 | 45 |
| 문자열 `"45"` | 45(`Integer.parseInt`) | 45 |
| 숫자 아님(`"abc"`) | 30 | 30 |
| 음수 `-5` | 0(매 회차) | 0 |
| `99999` | 1440(24시간) | 1440 |
| 소수 `30.7` | 30(`intValue`) | 30(`Math.trunc`) |

🔴 **기본값 30은 FE `CLOUD_SNAPSHOT_CONFIG_INTERVAL_DEFAULT`에 BE `CloudSnapshotCadence.DEFAULT_MINUTES`의 사본으로 있다.** BE는 `GET /settings/schedulers` 응답의 `options`에 이 옵션의 기본값을 채워 주지 않는다(`SchedulerSettingDto.options = optionsOrEmpty()`). 한쪽만 바꾸면 화면이 틀린 값을 보여 준다. 로그 정책(`logSuccess`·`logKeep`)은 응답에 유효값이 실리지만 이 옵션은 아니다.

## 4. 사용자 흐름

### 4.1 정상 흐름 — 주기 변경

1. 관리자가 관리 콘솔(⚙) > 운영 > **스케줄러**(`/setting/schedulers`)로 간다. 항목은 `adminOnly`다.
2. 목록 표의 `cloud_snapshot` 행(표시명 "클라우드 상태 수집")의 옵션 열에 태그 **"구성 30분"**(기본)이 보인다. 열 폭이 110px이라 짧은 표기다(`formatConfigIntervalTag`). 0이면 "구성 매회", 60의 배수면 "구성 N시간".
3. 편집을 열면 `cloud_snapshot`에만 **"구성 정보 수집 주기"** 셀렉트가 나온다. 선택지는 프리셋 `0, 15, 30, 60, 120, 360, 1440`분이고, 표기는 "매 실행마다"·"N분마다"·"N시간마다"다. 안내문: "VPC·서브넷·보안그룹·라우트테이블을 이 주기마다 읽습니다. 인스턴스 상태는 위 실행 주기마다 읽습니다. 길게 잡을수록 AWS 호출이 줄지만, 새로 열린 포트 같은 구성 변화를 늦게 알게 됩니다."
4. 저장하면 FE가 **기존 `options`를 펼친 뒤** `logSuccess`·`logKeep`·`configIntervalMinutes`를 덮어 `PUT`한다(`mode` 등 다른 잡의 옵션 관례와 같은 병합 저장). BE는 옵션을 통째로 교체하고 스케줄을 재등록한다.
5. 다음 회차부터 `CloudSnapshotJob#run`이 새 값을 읽는다. 재기동은 필요 없다.

### 4.2 프리셋 밖 값이 저장돼 있을 때

API·DB로 프리셋에 없는 값(예: 45)이 들어 있으면 `configIntervalOptions`가 그 값을 선택지에 끼워 넣어 정렬한다. 셀렉트가 빈칸으로 보이지 않고 "45분마다"가 선택된 채 열린다. 범위 밖 값(예: 99999)은 FE도 1440으로 잘라 "24시간마다"로 보인다.

### 4.3 권한 없음

- 비관리자는 관리 콘솔에 항목이 보이지 않고, 주소 직접 진입은 `PageWrapper adminOnly`가 막는다.
- API를 직접 부르면 `AdminAccessChecker.requireAdmin`이 거부한다(200 + body `code: 403`, [API 카탈로그 §1-1](../technical/solutions--API-%EC%B9%B4%ED%83%88%EB%A1%9C%EA%B7%B8.md) 관례). 미인증은 HTTP 401(런타임 실측: `INVALID_TOKEN`).

### 4.4 빈 데이터·외부 시스템

- **AWS 자격증명이 없으면** 배치는 `skipped: unconfigured`로 끝난다. 주기 옵션은 읽히지 않는다.
- **수집 리전이 0개**(`collectionRegions` 교집합이 빔)면 `skipped: no collection region`. 판정 전에 끝난다.
- **VPC 행이 한 건도 없으면**(첫 설치, 보존 정리 뒤) `findLatestObservation()`이 null → 이번 회차에 바로 구성을 읽는다.
- 화면은 옵션 키가 없어도 30을 보여 준다(§3.1).

## 5. API 계약

| Method | Path | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| GET | `/settings/schedulers` | — | `SchedulerSettingDto[]` — `options`는 **저장된 값 그대로**(키 없으면 `{}`) | 관리자 |
| PUT | `/settings/schedulers/{jobKey}` | `UpdateSchedulerReqDto` — `enabled`·`scheduleType`·주기 필드·`options` | 저장 후 DTO(재등록 완료 상태) | 관리자 |
| GET | `/settings/schedulers/{jobKey}/logs?limit=` | — | 실행 이력(성공을 안 남기는 잡은 실패만) | 관리자 |
| POST | `/settings/schedulers/{jobKey}/run` | — | 즉시 응답(실행 접수) | 관리자 |

불변식과 특이 계약:

- **`options`는 검증하지 않는다.** `SchedulerSettingService#update`가 검증하는 것은 `scheduleType`, `intervalMinutes ≥ 1`, `atHour/atMinute/dayOfWeek/dayOfMonth` 범위뿐이다. `normalizeOptions`는 `logKeep`만 상한으로 접고, `configIntervalMinutes`는 어떤 값이든 그대로 저장된다. 범위는 읽을 때 자른다(§3.1).
- **`options`가 null이면 기존 값 유지, 비어 있지 않으면 통째로 교체**(`SchedulerSetting#apply`). 키 하나만 바꾸려 해도 전체를 보내야 하며, 빠뜨린 키는 삭제된다. FE는 그래서 병합해 보낸다.
- `PUT`은 저장과 `SchedulerManager#reschedule`을 한 트랜잭션 흐름에 둔다. 저장만 되고 스케줄이 옛 주기로 남는 상태는 없다.
- 카탈로그 이름 노출 조건: FE `SCHEDULER_JOB_CATALOG`에 `cloud_snapshot`이 등록돼 있어 목록에 "클라우드 상태 수집"(`scheduler.job.cloud_snapshot`)으로 뜬다. 카탈로그에 없는 `jobKey`는 키 문자열 그대로 보인다. 표시 순서도 카탈로그 순이다. 이 EP는 ZM-153에서 바뀌지 않았다.
- OpenAPI: `GET /v3/api-docs`(런타임 실측으로 `SchedulerSettingDto`·`UpdateSchedulerReqDto` 존재 확인 — 09-28).

## 6. 상태·동시성·실패

- 상태 전이(회차 1회, `CloudSnapshotService#collect(int)`):
  1. 자격증명 없음 → `skipped: unconfigured`. 리전 0 → `skipped: no collection region`.
  2. `runAt = LocalDateTime.now()` 고정 → `cadence.dueForConfig(runAt, 옵션)`으로 `withConfig` 결정.
  3. 리전별 병렬 `collectRegion(runAt, region, withConfig)`. `withConfig=false`면 인스턴스 2콜 뒤 **VPC Describe를 하나도 부르지 않고** 빈 VPC 목록으로 돌아온다.
  4. 인스턴스 행 저장 → VPC 구간 적재(`withConfig=true`일 때만 행이 있음) → IP 색인·리스너 통지(ZM-153과 무관, 그대로).
  5. 요약: `regions=N instances=N vpcs=N(new=N unchanged=N) failed=N` 또는 `regions=N instances=N vpcs=deferred(every 30m) failed=N`. `vpcs=0`으로 적지 않는 이유는 "VPC가 사라졌다"로 읽히기 때문이다.
- 차례 판정(`CloudSnapshotCadence#dueForConfig`):
  - `clamp(옵션)`이 0이면 **DB를 보지 않고 true**(ZM-153 이전 동작).
  - `findLatestObservation()`이 null이면 true.
  - `elapsed = runAt − last`, **`elapsed + 1분 ≥ 주기`면 true.** 예: 주기 30분에 28분 경과면 미룸, 29분 40초 경과면 차례. 여유가 없으면 29분 59초에 뜬 회차가 "아직"으로 판정돼 한 회차(5분)를 더 기다린다.
  - 판정은 **전 리전 통틀어 하나**다. 리전을 새로 추가해도 그 리전의 구성은 다음 차례에 처음 들어온다.
- idempotency: 같은 회차를 두 번 실행하면 인스턴스 행이 한 번 더 쌓인다(ZM-151 설계상 회차별 1행). 구성은 지문이 같으면 `last_seen_at`만 전진하므로 중복 구간이 생기지 않는다.
- 동시 실행: `SchedulerLeaseService`(V21, 조건부 UPDATE 잠금, TTL 30분)가 인스턴스 간 겹침을 막는다. 잠금은 `finally`에서 반납한다. 이 잠금 덕분에 여러 노드가 같은 DB 시각으로 같은 판정을 낸다.
- 재기동 후 첫 실행(코드 확인):
  - interval 잡의 트리거는 `PeriodicTrigger(fixedRate=false, initialDelay=period)`라 기동 **5분 뒤** 첫 회차가 돈다(런타임: 09:18 기동 → 09:24:13 첫 회차).
  - 판정은 메모리 셈이 아니라 DB의 `last_seen_at`이므로 **재기동해도 초기화되지 않는다.** 마지막 관측에서 30분이 지났으면 첫 회차에 구성을 읽고(런타임: 전날 15:40 관측 → 09:24 차례), 안 지났으면 미룬다.
- retry/timeout: 재시도 없음. 다음 회차가 곧 재시도다.
- partial failure:
  - 일부 리전 실패: 성공 리전의 인스턴스·구성만 저장하고 `failed=N`으로 요약. 실패 리전의 VPC 구간은 건드리지 않아 그 리전의 `last_seen_at`이 멈춘다. 그러나 판정은 전 리전 MAX이므로 **실패 리전의 구성은 다음 주기(기본 30분)까지 다시 읽지 않는다.**
  - 전 리전 실패: `IllegalStateException` → 실행 이력에 실패로 남고 색인은 콜드. 구성 관측 시각이 전진하지 않으므로 다음 회차는 차례다.
  - 인스턴스 저장 뒤 VPC 적재 중 끊김: 트랜잭션으로 묶지 않아 "끝을 한 회차 덜 전진" 또는 "같은 구간 한 번 더"가 최악이고 다음 차례가 바로잡는다(ZM-151 설계).

## 7. 권한과 보안

- 기능 permission: 스케줄러 설정 EP 4개 전부 `AdminAccessChecker.requireAdmin`(`userRole ∈ {ADMIN, SUPER_ADMIN}`). 역할 JSON의 `settings.*` 칸은 판정에 쓰지 않는다([권한 강제 문서 §5](solutions--%EA%B6%8C%ED%95%9C-%EA%B0%95%EC%A0%9C%EC%99%80-%EC%84%B8%EC%85%98-%ED%9A%8C%EC%88%98.md)의 "관리자 전용" 행과 같은 축). FE는 `PageWrapper adminOnly`·`adminConsole.tsx`의 `adminOnly: true`로 같은 기준을 쓴다.
- 데이터 범위: 설정은 설치본 전역 1건(`scheduler_setting.job_key='cloud_snapshot'`). 사용자별 값이 없다.
- 감사 로그: `scheduler_setting.updated_by`에 `ActorResolver`가 푼 사용자 이름이 남는다(`SchedulerSettingDto.updatedBy`). 옵션 값 변경 전후는 기록하지 않는다.
- secret/개인정보: 없음. AWS 자격증명은 `Setting(CLOUD)`에 있고 이 기능은 읽지 않는다.
- 보안 영향: 주기를 늘리면 **새로 열린 보안그룹 포트·라우트 변경의 발견이 최대 그 주기만큼 늦어진다**(§8). 이것이 기본값을 제안 범위의 짧은 쪽(30분)에 둔 이유다.

## 8. 운영

- 설정·환경변수: 환경변수 없음. 값은 DB `scheduler_setting.options.configIntervalMinutes`(분)뿐이다. V28 시드는 `options='{}'`라 기존 설치본은 배포 직후 기본 30분으로 돈다. 이전 동작(매 회차)으로 되돌리려면 화면에서 "매 실행마다"(0)를 고른다.
- metric/log:
  - 회차마다 `SchedulerManager`가 INFO로 `Scheduler 'cloud_snapshot' done in Nms (regions=… vpcs=deferred(every 30m) failed=…)`를 남긴다(코드 확인). **미룬 회차인지는 이 로그의 `vpcs=deferred`로 본다.**
  - 🔴 성공 회차는 **실행 이력(`scheduler_run_log`)에 남지 않는다.** `SchedulerRunLogPolicy`에 `cloud_snapshot` 정책이 없어 기본(실패만, 30건)이 적용되고, `recordSuccess`는 `logSuccess=false`면 저장하지 않는다. 따라서 화면 "로그"와 DB로는 `deferred` 요약을 볼 수 없다(런타임 실측으로 확인). 필요하면 편집 모달의 "성공 실행도 기록"(`logSuccess`)을 켠다 — 그러면 `recordSuccess`가 요약을 저장한다(코드 확인, 런타임 미검증).
  - 로그 없이 확인하는 법(런타임 실측에 쓴 질의): `cloud_instance_snapshot`의 `run_at`이 5분마다 늘고, `cloud_vpc_snapshot`의 `MAX(last_seen_at)`이 주기마다만 전진하면 정상이다.
- 장애 증상과 복구:
  - "구성 정보가 갱신 안 된다": 옵션 값이 1440까지 잘렸는지(`options` 확인), 자격증명·리전 범위로 `skipped`가 되는지, 전 리전 실패가 이력에 남았는지 순으로 본다. 주기 0으로 바꾸고 "지금 실행"(`POST …/run`)을 하면 즉시 읽는다.
  - "새 포트가 열렸는데 화면에 없다": 주기 안이면 정상이다. 최대 지연 = 주기 + 배치 간격 + 1분 여유 미만. 기본값에서 최악 약 35분.
  - `firstSeenAt`(VPC 상세의 "언제 생겼나", `CloudSnapshotQueryService`)는 그 발견을 담은 **첫 구간의 `run_at`**이므로 해상도가 배치 간격(5분)이 아니라 이 주기(기본 30분)로 거칠어진다.
  - "관측 끊김" 판정을 다른 화면·경보에서 `last_seen_at` 나이로 한다면 기준을 **이 주기보다 넉넉하게** 잡아야 한다. 5분 기준이면 정상 회차마다 끊김으로 오판한다.
- migration/rollback:
  - 마이그레이션 없음. 코드만 되돌리면 옵션 키는 DB에 남지만 아무도 읽지 않아 무해하다.
  - 옵션 키를 지우면(`options`에서 제거해 `PUT`, 또는 DB 직접 수정) 기본 30분으로 돌아간다. 화면은 저장 시 항상 이 키를 실으므로 화면만으로는 키를 지울 수 없다.
  - ZM-151 이전 코드(`last_seen_at` 없음)와의 혼합 배포에서는 `COALESCE(last_seen_at, run_at)`로 판정하므로 여전히 동작한다.

## 9. 검증 근거

| 종류 | 증거 | 결과 |
|---|---|---|
| 단위(BE) | `aws.*`·`setting.*`·`asset.cloud.*`·`scheduler.*`·아키텍처·마이그레이션 36클래스, 실제 PostgreSQL IT 포함(2026-09-16). 핵심: `CloudSnapshotCadenceTest` 7건(0=매 회차·첫 관측·미룸·차례·1분 여유 안·여유 밖·절단), `CloudSnapshotJobTest` 2건(옵션 전달·기본값), `CloudSnapshotServiceTest`에 "미룬 회차에 VPC Describe 4종 미호출·인스턴스는 적재·리스너 통지 유지·옛 `collect()`는 매 회차" 3건, IT `findLatestObservation` 1건 | **262건 통과**, skip 0 |
| 단위(FE) | `__tests__/SchedulerCloudConfigInterval.test.tsx` — 도우미 6건(기본값·절단·표기·짧은 태그·프리셋 밖 값 삽입·프리셋 값은 증가 없음) + 모달 3건(`cloud_snapshot`에만 칸·기존 옵션 병합 저장·다른 잡은 미전송) | 9건 통과 |
| 정적(FE) | `tsc`·`npm run typecheck:contract`·eslint(2026-09-16) | 0·0·0 |
| runtime(dev, 2026-09-28 09:24~09:55) | BE :3000(IntelliJ 기동, HEAD `3f731d5`에 `0c3d9e6` 포함)·도커 DB :5433. `scheduler_setting.cloud_snapshot` `interval 5`, `options={}`(옵션 미설정). 인스턴스 스냅샷 09:24:13·09:29:28·09:34:32·09:39:35·09:44:38·09:49:42·09:54:45 **7회 각 +1행**(간격 5분 3~15초). VPC 17행 `last_seen_at`은 **09:24:13·09:54:45 두 번만** 전진(새 행 0), 중간 5회는 미룸. 09:49:42 회차는 경과 25분 29초 + 1분 < 30분으로 미룸, 09:54:45 회차는 30분 32초로 차례 — 1분 여유 계산과 일치. 전날 이력(09-23 15:40 관측 → 15:45~16:05 미갱신)도 같은 패턴 | 통과, 결함 0 |
| runtime(미실시) | `GET /settings/schedulers` 응답(카탈로그 이름·`options`), `PUT` 저장, 설정 화면 렌더·셀렉트 동작, `vpcs=deferred` BE 로그 줄 확인, `logSuccess` 켠 뒤 이력 기록 | 검증 전용 계정 부재로 미실시(admin 로그인 금지 지시). 브라우저 확인 없음 |

증거 원천: `C:/solutions/_workspace/features/cloud/snapshot/zm-153_cloud-snapshot-config-cadence.md`(구현·설계 결정), `C:/solutions/_workspace/planning/sprint-zm-151-156/zm-151-154_runtime-check.md` §2(런타임 실측·재현 질의).

## 10. 결정과 열린 항목

- 결정:
  - **기본 30분.** 명세(`tasks_backlog-2026-09-16.md` §I3)의 착수 전 확인 "`firstSeenAt` 정확도 저하를 받아들일 수 있나"에 사용자 확답이 없어, 제안 범위(30분~1시간) 중 **보안 노출 발견 지연이 작은 쪽**을 골랐다. 화면에서 바꿀 수 있으니 되돌리기 쉽다.
  - **배치를 쪼개지 않고 한 배치 안에서 회차마다 "구성 차례인가"를 고른다.** VPC 스냅샷의 `instanceCount`가 같은 회차의 인스턴스 목록에서 나오므로, 배치를 나누면 구성 배치가 `DescribeInstances`를 한 번 더 불러 줄이려던 호출이 도로 는다.
  - **"N회마다"가 아니라 마지막 관측 시각으로 판정.** 회차 수는 배치 간격을 바꾸면 뜻이 바뀌고(5분×6=30분이 10분×6=60분) 재기동하면 초기화된다.
  - **1분 여유.** 스케줄러 발화 오차로 한 회차를 헛기다리는 것을 막는다.
  - **범위는 저장이 아니라 읽을 때 절단.** 스케줄러 설정 저장이 잡별 옵션을 검증하지 않는 기존 구조를 이번에 바꾸지 않았다.
  - **ZM-151과 한 커밋**(`0c3d9e6`·`3212e4c`). 같은 파일(`CloudSnapshotService`·리포지토리·테스트·IT)을 고쳐 부분 선택이 번거로웠고, 사용자가 합치기를 택했다.
- 기각 대안:
  - 기본 1시간 — 호출은 더 줄지만 새 포트 발견이 최대 1시간 늦어진다. 사용자 확답 전에는 안전한 쪽을 택했다.
  - 저장 시 옵션 검증 추가 — 스케줄러 설정 서비스 전반의 옵션 검증 부재(ZM-156 설계 조사에서도 확인)를 이 이슈에서 손대면 범위가 커진다.
  - 별도 배치 `cloud_snapshot_config` — 위 결정의 이유로 기각.
- 열린 항목:

| 항목 | 상태 |
|---|---|
| 기본값 30분의 적정성 — `firstSeenAt` 정확도 저하 수용 여부는 **사용자 결정 대기** | 보류 |
| `cloud_snapshot` 성공 회차의 실행 이력 기록(정책 기본 `logSuccess=true` 여부) — 현재는 `deferred` 요약을 화면·DB에서 볼 수 없다 | 계획 |
| 스케줄러 옵션의 저장 시 검증(`configIntervalMinutes` 포함) | 계획 |
| BE가 응답 `options`에 이 옵션의 유효값(기본 30)을 채워 FE 기본값 사본을 없애기(ZM-152 보고서 BE 요청 #3과 같은 종류) | 계획 |
| 설정 화면·API의 런타임 확인(전용 관리자 계정 발급 후) | 계획 |

- 관련 문서: [클라우드 스냅샷 적재량 정리(ZM-151)](solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-%EC%8A%A4%EB%83%85%EC%83%B7-%EC%A0%81%EC%9E%AC%EB%9F%89-%EC%A0%95%EB%A6%AC.md), [관리자 가이드 §5](../guides/solutions--%EA%B4%80%EB%A6%AC%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md), [API 카탈로그 §3-9](../technical/solutions--API-%EC%B9%B4%ED%83%88%EB%A1%9C%EA%B7%B8.md), [FAQ §10](../guides/solutions--%EC%9E%90%EC%A3%BC-%EB%AC%BB%EB%8A%94-%EC%A7%88%EB%AC%B8.md), [기능 문서 목록](solutions--README.md)
- Obsidian 관련 노트: `claude-experiences/projects/moveseye/` — `[[2026-09-22-zm151-156-backlog-sprint]]`(스프린트 기록·교훈). 배경 백로그는 `C:/solutions/_workspace/features/cloud/snapshot/backlog_cloud-snapshot-region-scope.md` §B, 명세는 `C:/solutions/_workspace/planning/sprint-zm-151-156/tasks_backlog-2026-09-16.md` §I3.

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-16 | 구현 — BE `CloudSnapshotCadence`·`collect(int)`·잡 옵션·`findLatestObservation`, FE 편집 칸·목록 태그·도우미. 테스트 BE 262건·FE 9건 통과 |
| 2026-09-21 | BE master 병합(`0c3d9e6`, ZM-151과 한 커밋). FE는 `3212e4c`로 master 직접 커밋(09-16) |
| 2026-09-28 | dev 런타임 확인(09:24~09:55) — 기본 30분·1분 여유 실측 통과. 이 문서 최초 작성 |
