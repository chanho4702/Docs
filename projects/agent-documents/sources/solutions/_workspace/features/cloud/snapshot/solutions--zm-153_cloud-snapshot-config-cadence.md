# ZM-153 작업 보고 — 클라우드 스냅샷 자원별 수집 주기 분리

- 작성 2026-09-16 · 갱신 2026-09-22 · 상태 ✅ **완료 — ZM-151과 한 커밋으로 BE·FE master 반영(미푸시)** · 정본 명세 [`../../../planning/sprint-zm-151-156/tasks_backlog-2026-09-16.md`](../../../planning/sprint-zm-151-156/tasks_backlog-2026-09-16.md) §I3
- 커밋: BE master `0c3d9e6`(ZM-151과 합침 — 사용자 결정, 아래 §6의 "두 커밋" 계획은 적용 안 함) · FE master `3212e4c`
- 선행: [ZM-151](solutions--zm-151_cloud-snapshot-storage.md) — 🔴 **같은 워크트리(`C:/worktrees/zm-151-be`)에 쌓았다.** ZM-151이 미커밋이라 git으로 브랜치를 쌓을 수 없었다. 커밋 순서는 §6.

---

## 1. 한눈에

| | 내용 |
|---|---|
| **왜** | 인스턴스 상태는 자주, VPC 구성은 드물게 바뀌는데 같은 5분 주기로 긁었다. 리전마다 VPC 1개에 **4콜**(VPC·서브넷·라우트·보안그룹)이라 인스턴스(2콜)의 두 배다 |
| **무엇을** | 스냅샷 배치는 5분 그대로, **구성 정보만 별도 주기(기본 30분)**로 긁는다 |
| **결과** | 리전 1개·VPC 1개 기준 한 시간 호출이 **72 → 32**(인스턴스 2×12 + 구성 4×2). 리전 범위(ZM-151)와 곱해진다 |
| **검증** | BE 관련 **262건 통과**(36개 클래스, 실제 PostgreSQL IT 포함) · FE 테스트 9건 · tsc·계약 타입검사·eslint 0 |

---

## 2. 설계 결정

### 배치를 둘로 쪼개지 않았다
VPC 스냅샷의 `instanceCount`는 **같은 회차의 인스턴스 목록**에서 센다. 배치를 나누면 구성 배치가 `DescribeInstances`를 한 번 더 불러야 해서 줄이려던 호출이 도로 는다. 한 배치 안에서 "이번 회차는 인스턴스만"을 고르게 했다.

### "N회마다"가 아니라 시각으로 판정한다
| 방식 | 문제 |
|---|---|
| 회차 수(N회마다) | 배치 간격을 바꾸면 뜻이 바뀐다(5분×6=30분이 10분×6=60분). 재기동하면 셈이 초기화된다 |
| **DB의 마지막 구성 관측 시각** ✅ | 둘 다 없다. 스케줄러 잠금이 동시 실행을 막으므로 여러 노드여도 같은 답이다 |

재료는 ZM-151이 만든 `last_seen_at`이다 — `MAX(COALESCE(last_seen_at, run_at))`.

### 🔴 발화 오차 1분을 봐준다
배치가 29분 59초에 뜨면 30분 주기를 "아직"으로 판정해 **한 회차(5분)를 더 기다린다.** 1분 여유를 두었다.

### 🔴 기본값 30분 — 제안 범위의 짧은 쪽
구성 주기가 길수록 **새로 열린 포트 같은 보안 노출을 늦게 안다**(전에는 5분 안, 이제 기본 30분 안). 명세의 착수 전 확인("`firstSeenAt` 정확도 저하를 받아들일 수 있나")에 대한 답을 사용자에게 받지 못해, 제안 범위(30분~1시간) 중 **보안 쪽으로 안전한 짧은 값**을 택했다. 화면에서 0(매 실행)~24시간으로 바꿀 수 있다.

### 미룬 회차의 실행 요약은 `vpcs=deferred`
`vpcs=0`으로 적으면 **VPC가 사라진 것으로 읽힌다.** 예: `regions=1 instances=1 vpcs=deferred(every 30m) failed=0`

### 🔴 옵션 범위는 읽을 때 자른다
스케줄러 설정 저장은 잡별 옵션을 검증하지 않고 통째로 바꾼다(ZM-156 설계 조사에서도 확인됨). 그래서 BE는 **읽을 때** 0~1440으로 자르고, 화면도 같은 범위로 읽는다. 프리셋에 없는 값이 저장돼 있으면 선택지에 끼워 넣어 셀렉트가 빈칸으로 보이지 않게 했다.

---

## 3. 바뀐 것

### BE (워크트리 `zm-151-be`)

| 파일 | 변경 |
|---|---|
| `aws/CloudSnapshotCadence.java` | **신규.** 이번 회차가 구성 차례인지 판정(`dueForConfig`), 범위 자르기(`clamp`) |
| `aws/CloudSnapshotService.java` | `collect(int)` 추가 — 차례가 아니면 VPC Describe를 **하나도** 부르지 않는다. 기존 `collect()`는 `collect(0)`(매 회차)으로 위임해 동작 유지 |
| `aws/CloudSnapshotJob.java` | 옵션 `configIntervalMinutes`(기본 30)를 넘긴다 |
| `aws/repository/CloudVpcSnapshotRepository.java` | `findLatestObservation()` 추가 |
| 테스트 | 신규 `CloudSnapshotCadenceTest`(7) · `CloudSnapshotJobTest`(2), `CloudSnapshotServiceTest`에 3건, IT에 1건, 리스너 테스트 생성자 수정 |

### FE (`moveseyee_fe` master)

| 파일 | 변경 |
|---|---|
| `constants/scheduler.ts` | 옵션 키·기본값(30)·프리셋 |
| `pages/setting/scheduler/schedulerConfigInterval.ts` | **신규.** 읽기(범위 자르기)·표기·선택지 도우미 — 컴포넌트 파일에서 떼어 Fast Refresh 규칙을 지킨다 |
| `pages/setting/scheduler/SchedulerEditModal.tsx` | `cloud_snapshot` 편집에 "구성 정보 수집 주기" 칸. 기존 옵션은 지우지 않고 병합해 저장 |
| `pages/setting/scheduler/SchedulerManagement.tsx` | 목록 표 옵션 열에 "구성 30분" 태그. 🔴 옵션 열이 110px(같은 날 다른 커밋 `406f861`이 표 폭을 재배분)이라 "구성 30분마다"는 넘쳐서 **짧은 표기를 따로 뒀다** |
| `locales/kr.json`·`en.json` | `scheduler.config_interval_*` 8개 키(편집 칸 5 + 목록 태그용 짧은 표기 3) |
| `__tests__/SchedulerCloudConfigInterval.test.tsx` | 신규 9건 |

⚠️ 번역 파일은 ZM-151·ZM-152와 **같은 파일**을 함께 고쳤다. 커밋할 때 이 이슈의 8줄씩만 골라 담아야 한다.

⚠️ 스케줄러 표는 같은 날 다른 세션이 `406f861`로 레이아웃을 고쳤다. 그 커밋은 이미 이력에 있고 이 작업의 변경은 **순수 추가**라 충돌은 없다(확인함).

---

## 4. 검증

| 범위 | 결과 |
|---|---|
| BE `aws.*`·`setting.*`·`asset.cloud.*`·`scheduler.*`·아키텍처·마이그레이션 | **36개 클래스 · 262건 통과**, skip 0 |
| 그중 핵심 | 미룬 회차에 VPC Describe 4종이 **한 번도 안 불린다** · 인스턴스는 그대로 적재 · 자산 동기화 통지와 IP 색인 갱신은 계속 · 옛 `collect()`는 매 회차 구성 수집 |
| IT `findLatestObservation` | 실제 PostgreSQL에서 구간 끝 기준 최대값, 끝 없는 행은 시작으로 |
| FE 테스트 | 9건 통과 |
| FE tsc · `typecheck:contract` · eslint | 0 · 0 · 0 |

**하지 못한 것**: 런타임 종단 확인(병합·재기동 후), 브라우저 확인.

---

## 5. ⚠️ 알고 쓸 한계

| 한계 | 내용 |
|---|---|
| 보안 노출 발견 지연 | 새로 열린 포트는 최대 한 주기(기본 30분) 뒤에 잡힌다. VPC 상세의 "언제 생겼나"도 그만큼 거칠어진다 |
| 판정은 전 리전 통틀어 하나 | 수집 범위에 리전을 새로 추가하면 그 리전 구성은 다음 주기에 처음 들어온다. 일부 리전만 실패한 회차도 다음 주기까지 기다린다 |
| "관측 끊김" 기준 | VPC 구간의 끝(`last_seen_at`)이 이 주기마다 전진하므로, 끊김을 판정하는 쪽은 **주기보다 넉넉한** 기준을 써야 한다 |
| 🔴 FE 기본값 사본 | 화면의 30은 BE `CloudSnapshotCadence.DEFAULT_MINUTES`의 사본이다. BE가 이 옵션의 기본값을 응답에 채우지 않아서다. 한쪽만 바꾸면 화면이 틀린 값을 보여 준다(ZM-152 보고서의 BE 요청 #3과 같은 종류) |

---

## 6. 커밋 계획 (승인 대기)

ZM-151과 **같은 파일**(`CloudSnapshotService.java`·리포지토리·서비스 테스트·IT)을 고쳤다. 두 커밋으로 나누려면 부분 선택이 필요하다.

| 순서 | 커밋 | 담을 것 |
|---|---|---|
| 1 | `#ZM-151 [PERF] 클라우드 스냅샷 적재량 정리 — VPC 구간 적재 + 수집 리전 범위` | V60, 구간 적재, 범위, 추정 비용, DTO, FE 수집 범위 |
| 2 | `#ZM-153 [PERF] 클라우드 스냅샷 구성 정보 수집 주기 분리` | `CloudSnapshotCadence`, `collect(int)`, 잡 옵션, `findLatestObservation`, FE 스케줄러 칸 |

부분 선택이 번거로우면 **한 커밋으로 합치는 선택지**도 있다(두 이슈 번호를 제목에 함께). 결정 필요.

---

**근거 위치**: BE `aws/CloudSnapshotCadence`·`CloudSnapshotService#collect(int)`·`CloudSnapshotJob` · `scheduler/SchedulerSettingService`(옵션 무검증 저장) · FE `pages/setting/scheduler/*` · 백로그 [`./backlog_cloud-snapshot-region-scope.md`](backlog_cloud-snapshot-region-scope.md) §B
