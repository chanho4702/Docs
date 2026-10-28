# 프로젝트 구독(Project Subscription) 설계서 — v3

> RMS 프로젝트가 Jira **스페이스(프로젝트)** 를 구독하면,
> 그 스페이스에 추가되는 이슈가 자동으로 해당 RMS 프로젝트의 작업으로 편입된다.
>
> 작성 2026-08-03 · v2 = 코덱스 설계 검토 반영 · **v3 = 검증 리포트 대응 + 보드 제거 + 배포 확인**
> 관련 문서: `02_codex_review.md`(설계 검토), `_workspace/recent-rfc-review/rfc-171-review.md`(구현 검증)
>
> **상태: P1~P3 구현 완료 · development 배포·동작 확인 완료 · 운영 배포 미수행**

---

## 0. 사용자 확정 사항

| 항목 | 결정 |
|------|------|
| 구독 대상 | **스페이스 + 보드** 둘 다. 세부 옵션도 제공 |
| 조건 지정 | 사용자가 선택. **기본값은 스페이스 전체** |
| 기존 이슈 백필 | **사용자가 선택** (구독 생성 시 체크) |
| 이미 다른 RMS 프로젝트에 등록된 이슈 | **건너뛰기** |
| 구독 설정 진입점 | **작업등록 모달**(`IssueAddModal`) |

## 0-1. v3에서 바뀐 것 (구현·검증·배포를 거치며)

| # | 무엇이 | 왜 |
|---|--------|-----|
| **A** | **보드 구독 제거 — 스페이스만** | 이슈는 Jira 프로젝트 하나에만 속하므로 **스페이스끼리는 이슈가 겹치지 않는다.** 겹침의 유일한 경로가 "스페이스 A"와 "A 를 포함하는 보드"였고, 그 때문에 서로 다른 RMS 프로젝트가 같은 이슈 소유권을 두고 경쟁할 수 있었다(검증 리포트 P0-2, "release 최우선"). 보드를 빼면 claim 테이블 없이 그 경합이 사라진다. Agile scope 의존·필터+subQuery 결합·ORDER BY 파싱·최대 1시간 판정 지연도 함께 해소됐다. 보드 범위 구독은 `extraJql`(예: `sprint in openSprints()`)로 대체한다. |
| **B** | **커서를 쓰지 않는다** | APPLY 가 `IS EMPTY` 결과집합을 줄이므로 다음 invocation 에서 옛 `nextPageToken` 은 다른 위치를 가리킨다(영구 누락). 매번 첫 페이지부터 재스캔하되, 태깅분이 빠지며 앞부분이 짧아져 전진한다. |
| **C** | **미리보기를 `asUser` 로** | 소스 접근 검증 없이 `asApp` 으로 count·sample 을 조회해, RMS read 권한만으로 사용자가 볼 수 없는 스페이스의 이슈 키·요약이 노출됐다(P0-1). |
| **D** | **소량 백필은 큐 없이 즉시** | 50건 이하 + 스캔 완주면 그 자리에서 태깅한다. 앱 필드 write 1회(1초 미만)로 끝나는데 큐로 넘기면 사용자가 결과를 확인하러 새로고침해야 했다. |
| **E** | **수동 등록에 소속 표시·확인** | 작업 등록은 구독과 달리 `IS EMPTY` 를 보지 않아 **다른 프로젝트 이슈를 조용히 덮어썼다.** 목록에 소속을 표시하고 등록 전 확인을 받는다. |
| **F** | **이슈 타입 필터 UI / 기본 계획 작업량** | 전자는 백엔드만 있고 화면이 없었다. 후자는 신규(v017) — 편입 이슈의 예상 시간이 **비어 있을 때만** 채운다. |

---

## 0-2. v2에서 바뀐 핵심 결정 (설계 검토 반영)

| # | v1 | v2 | 이유 |
|---|----|----|------|
| A | 여러 RMS 프로젝트가 같은 소스를 구독 가능 | **소스 1개 = RMS 프로젝트 1개 (전역 배타)** | 태깅 경합에 compare-and-set이 없어 소유권 덮어쓰기가 구조적으로 발생 (BLOCKER 3) |
| B | 검색하며 페이지마다 태깅 | **SCAN(전량 수집) → APPLY(고정 목록 태깅)** 2단계 | 태깅이 `IS EMPTY` 결과집합을 바꿔 `nextPageToken`이 이슈를 건너뜀 (BLOCKER 1) |
| C | 리컨실 고정 7일 창 | **`subscribed_at` baseline + 성공 시에만 전진하는 watermark + overlap** | 백필 OFF가 무효화되고, 7일 이상 장애 시 영구 누락 (BLOCKER 2 / MAJOR 3) |
| D | PK = `(project_id, source_type, source_key)` | **PK = `(source_type, source_id)`**, key/name은 스냅샷 | Jira 프로젝트 키는 변경 가능(mutable). A(전역 배타)도 이 PK로 강제됨 (MAJOR 5) |
| E | 사용자가 보낸 `sourceName`·소스를 그대로 신뢰 | **소스 메타는 서버가 조달, 생성 시 `asUser`로 접근 권한 검증** | 사용자가 못 보는 스페이스를 구독해 `asApp`으로 긁어오는 confused-deputy (BLOCKER 4) |
| F | 보드 = `filter.jql` | **보드 = `(filter.jql) AND (configuration.subQuery)`** | 칸반의 subQuery(예: `status != Done`)를 빼면 보드보다 넓게 편입 (BLOCKER 5) |
| G | 스케줄러가 전 구독을 직접 스윕 | **실행 예산(요청수·잔여시간) + 커서 이어달리기**, 초과분은 다음 주기 | 200구독×2,000건 = 단일 invocation에 1만+ 요청 (BLOCKER 6) |

---

## 1. 현행 구조와 설계 제약

### 1-1. 이슈 ↔ RMS 프로젝트 매핑은 "물리 태깅"이다

```
Jira 이슈  ──[ moves_RMS_projectId = "<RMS project uuid>" ]──▶  RMS 프로젝트
```

- 필드: `manifest.yml` `jira:customField / projectIdField` — **type: string, readOnly: true**
- write 경로: `ProjectUsersService.js:248 updateCustomField()` → `asApp` + `PUT /rest/api/3/app/field/{fieldId}/value`
  (readOnly 앱 필드는 `PUT /issue` 로 못 씀 → 앱 필드 전용 엔드포인트가 유일한 경로)
- read 경로: **JQL 술어 `moves_RMS_projectId = "<uuid>"`** 가 백엔드·프론트 합쳐 20곳 이상에 흩어져 있다

### 1-2. 그래서 "조회 시점 가상 확장"은 채택하지 않는다 (기각안)

구독을 규칙으로만 두고 조회 JQL을 `moves_RMS_projectId = X OR project = "DWEB"` 로 넓히는 안은:
20곳 이상을 전부 고쳐야 하고, 한 곳이라도 빠지면 화면마다 이슈 집합이 달라지며, 진척·비용·MM·가동률이 서로 다른 모집단 위에서 계산된다.

→ **구독은 "규칙 저장 + 물리 태깅 자동화"로 구현한다.** 태깅이 끝나면 기존 20곳은 무변경으로 동작한다.

### 1-3. `updateCustomField` 는 그대로 재사용할 수 없다 (검토 MAJOR 1 — 정정)

```js
// ProjectUsersService.js:248 — 모듈 private, 템플릿 문자열에 값 삽입
const updateCustomField = async ({fieldIdOrKey, issueId, value}) => {
    const bodyData = `{"updates":[{"issueIds":[ ${issueId} ], "value": ${value}}]}`;
```

- **export 되지 않은 private 함수**다 → import 불가
- body 를 **JSON 문자열 템플릿**으로 조립한다. 배열을 넘기면 `Array.toString()` 이 `10001,10002` 를 만들어 **우연히** 동작하지만(현재 `IssueAddModal` 이 이 경로를 쓴다), 계약이 아니다
- `src/trigger/demoSeed.js:176` 는 같은 API 를 `JSON.stringify` 로 안전하게 조립한다 — 이쪽이 옳은 선례

→ **`src/api/jira/field/AppFieldValueApi.js` 로 공용 추출**한다.

```js
// 신규 — 유일한 앱 필드 write 경로
setAppFieldValues({ fieldIdOrKey, updates: [{ issueIds: number[], value: string }] })
//   body = JSON.stringify({ updates })   ← 문자열 템플릿 금지
//   4xx/5xx → ForgeAPIError 전파 (기존 정책 유지)
```

`ProjectUsersService.updateCustomField` 도 이 공용 함수를 호출하도록 교체한다(동작 동일, 회귀 없음).
**배치 크기 상한은 공식 문서에 명시가 없다** → 초기값 50, §13 배포검증 대상.

---

## 2. 아키텍처 — 소유권 · 2계층 편입

### 2-1. 소유권 모델: 소스는 배타적으로 소유된다 (v2 핵심)

```
Jira 스페이스 DWEB  ──(구독)──▶  RMS 프로젝트 A       ← 유일
                     ✗ RMS 프로젝트 B 는 DWEB 를 구독할 수 없다
```

- DB 제약 `PRIMARY KEY (source_type, source_id)` 가 **전역 유일성**을 강제한다.
- 이로써 "누가 이 이슈를 가져가는가"의 경합이 **애초에 발생하지 않는다.**
  같은 프로젝트의 event / reconcile / backfill 이 동시에 같은 이슈를 태깅하는 것은 **같은 값을 쓰므로 멱등**이다.
- 이미 다른 프로젝트가 구독 중인 소스를 고르면 `SUBSCRIPTION_SOURCE_TAKEN` + **어느 프로젝트가 소유 중인지** 응답에 담아 안내한다.

> **왜 claim 테이블(issue_id UNIQUE)을 안 쓰는가**: 이슈 단위 claim 은 이슈 수만큼 행이 늘어 Forge SQL 1GiB 예산([[reference_forge_storage_limits]])을 직접 압박한다. 소스 단위 배타는 행 수가 구독 수(수십)에 머물면서 같은 안전성을 준다.
> **수동 등록과의 관계**: 수동 등록된 이슈는 `IS EMPTY` 가 아니므로 구독이 건드리지 않는다. 반대로 구독이 태깅한 이슈를 사용자가 수동으로 다른 프로젝트에 등록하는 것은 **명시적 사용자 행위**라 허용한다(현행 동작 유지).

### 2-2. 2계층 편입 경로

```
 [빠른 경로]  avi:jira:created:issue        → 페이로드만으로 판정 가능한 SPACE 규칙 즉시 태깅
                        │  (유실·지연·판정불가는 아래가 흡수)
 [정확성]     scheduledTrigger (hourly)     → 예산 내에서 구독별 SCAN→APPLY, watermark 전진
 [1회성]      subscription-backfill-queue   → 구독 생성 시 사용자가 선택하면 과거분 태깅
```

**이벤트만으로는 안 되는 이유**

| 상황 | 생성 이벤트 | 리컨실이 필요한 이유 |
|------|-----------|---------------------|
| 스페이스 신규 이슈 | O | — |
| **보드 구독** | **X** | 보드 = 필터 기반 뷰. 스프린트 배정·에픽 연결은 **생성 이후** 발생이 정상 |
| 타 스페이스에서 **이동(move)** | X | `updated` 기준 스윕으로 흡수 |
| `extraJql` 조건 | 조건부 | 생성 직후 검색 인덱스 미반영([[project_jira_search_index_lag]]) |
| 트리거 유실·재배포 중 | X | at-least-once 보장이라 유실 가능 |

→ **이벤트 없이 리컨실만으로 기능이 완결된다.** P1 = 리컨실, P2 = 이벤트.

### 2-3. 충돌 처리 매트릭스 (한 곳에 모음)

구독은 **자동으로 남의 데이터를 건드리는** 기능이라 충돌 경로가 여러 갈래다. 처리 방식이 설계 곳곳에 흩어지면 누락되므로 여기에 전부 모은다.

| # | 충돌 | 언제 | 처리 | 사용자에게 보이는 것 | 근거 |
|---|------|------|------|---------------------|------|
| C1 | **이슈가 이미 다른 RMS 프로젝트 소속** | 편입 대상 선정 시 | JQL `AND moves_RMS_projectId IS EMPTY` 로 **후보에서 제외**. 코드 분기가 아니라 쿼리 술어라 모든 경로(이벤트/리컨실/백필/미리보기)에 자동 적용 | 미리보기 `건너뜀 12건(다른 프로젝트 소속)` | §3-2, §6-③ |
| C2 | **소스를 다른 RMS 프로젝트가 이미 구독 중** | 구독 생성 시 | PK `(source_type, source_id)` 로 **DB가 거부**. 앱 레벨 체크에만 의존하지 않는다 | 셀렉트에서 비활성 + `'차세대 포털'이 이미 구독 중`. 저장 실패로 알게 하지 않음 | §2-1, §6-② `takenBy` |
| C3 | **여러 경로가 같은 이슈를 동시 태깅** (이벤트·리컨실·백필) | 상시 | 소스가 배타 소유되므로 **경쟁자가 항상 같은 프로젝트** → 같은 값 write = 멱등. compare-and-set 불필요 | 없음(무해) | §2-1 |
| C4 | **규칙 변경/해제 vs 진행 중인 백필** | 백필 실행 중 수정·삭제 | batch 소비 시 `generation`·`is_active` **재검증 → 불일치 batch 폐기**. 낡은 규칙으로 태깅되지 않음 | 진행률이 중단으로 표시 | §5-5, §8-1 |
| C5 | **수동 등록 vs 구독** | 상시 | 수동 등록된 이슈는 `IS EMPTY` 가 아니라 구독이 안 건드림. 반대로 구독이 태깅한 이슈를 사용자가 수동 이동하는 것은 **명시적 행위라 허용** | 없음(현행 동작 유지) | §2-1 |
| C6 | **소스 삭제·권한 상실·JSW 미설치** | 스윕 시 | 상태를 뭉개지 않고 `SOURCE_MISSING` / `SOURCE_FORBIDDEN` / `AGILE_UNAVAILABLE` 로 **구분 저장**. 구독은 지우지 않고 비정상 표시만 | 구독 카드에 사유별 문구 | §3-3, §6-① |
| C7 | **편입된 이슈가 소스를 이탈** | 이슈가 타 Jira 프로젝트로 move / 보드 필터 변경으로 보드에서 빠짐 | **되돌리지 않는다**(아래) | 없음 — 이슈 탭에서 수동 해제 가능 | §12-8 |

**C7 을 되돌리지 않는 이유**
이미 편입된 기간 동안 그 이슈의 워크로그·공수·비용이 해당 RMS 프로젝트 집계에 반영됐다. 소스를 떠났다고 자동 회수하면 **과거 집계가 소급해 바뀐다**(진척률·비용이 이유 없이 변동). 구독 해제를 소급하지 않는 정책(§12-5)과 같은 원칙이다. 필요하면 이슈 탭에서 `deleteProjectIssue` 로 개별 해제한다.

> **한 프로젝트가 SPACE 와 그 SPACE 기반 BOARD 를 동시 구독**하면 같은 이슈를 두 구독이 매칭한다. 값이 같아 태깅은 멱등이지만 `lifetime_tagged` 가 이중 계상된다 — 누적 통계의 알려진 오차로 수용한다(정확한 현재 소속 수는 JQL count 로 조회, §4-1).

---

## 3. 구독 규칙과 실효 JQL

### 3-1. 규칙 모델

```js
{
  sourceType: 'SPACE' | 'BOARD',
  sourceId,                         // ★ PK. SPACE=Jira 프로젝트 numeric id / BOARD=보드 id (immutable)
  sourceKey, sourceName,            // 표시용 스냅샷 (서버가 조달, mutable)
  projectId,                        // 소유 RMS 프로젝트 (BINARY(16))
  issueTypeIds: string[] | null,    // null = 전체
  includeSubtasks: boolean,         // 기본 true
  extraJql: string | null,
  isActive: boolean,
  subscribedAt,                     // 구독 시각(정보)
  baselineAt,                       // ★ 이 시각 이후 **생성분만** 편입. null = 제한 없음(백필 함)
  watermark,                        // ★ 완주한 스윕의 기준 시각. null = 아직 전체를 훑지 않음
  cursor,                           // ★ 진행 중 스윕의 이어달리기 지점
  generation                        // ★ 규칙 변경 시 +1 — 낡은 큐 이벤트 무효화
}
```

> **⚠ v2 초안 수정 (구현 중 발견)** — 원래는 `subscribedAt` 하나로 baseline 을 겸하려 했으나 두 곳에서 깨졌다:
> 1. **리컨실은 `updated` 기준으로 훑는다.** "구독 전에 생성됐지만 최근 수정된" 이슈가 백필 OFF 구독에 그대로 새어 들어온다 → `baselineAt`(created 하한)을 별도 축으로 분리했다.
> 2. **백필 ON 인데 watermark 를 구독 시각으로 채우면** 첫 스윕이 과거를 못 훑어 백필이 조용히 무효화된다 → `watermark = null` 을 "아직 전체를 훑은 적 없음"으로 정의하고, null 이면 `updated` 하한을 **아예 넣지 않는다**.
>
> 두 컬럼은 생성 시 **함께** 정해진다:
> | 백필 선택 | `baseline_at` | `watermark` | 첫 스윕 동작 |
> |---|---|---|---|
> | 함 (ON) | `NULL` | `NULL` | 소스 전체를 훑는다 |
> | 안 함 (OFF) | `now` | `now` | 증분만, 그중 `created >= now` 만 |

### 3-2. 실효 JQL — 단일 진실 `SubscriptionJqlBuilder.js`

이벤트·리컨실·백필·미리보기가 **모두 이 함수 하나**를 쓴다. 갈라지면 "미리보기 12건인데 실제 8건" 불일치가 생긴다.

```js
buildSubscriptionJql(sub, { mode })   // mode: 'PREVIEW' | 'BACKFILL' | 'RECONCILE'
```

| 구성요소 | SPACE | BOARD |
|----------|-------|-------|
| 소스 술어 | `project = 10001` (numeric id — 키 변경 내성) | `(<filter.jql>) AND (<configuration.subQuery>)` ※ §3-3 |
| 미소속 | `AND moves_RMS_projectId IS EMPTY` (충돌 건너뛰기) | 동일 |
| 이슈타입 | `AND issuetype in (10001,10002)` | 동일 |
| 하위작업 | `includeSubtasks=false` → `AND issuetype not in subTaskIssueTypes()` | 동일 |
| 추가조건 | `AND (<extraJql>)` | 동일 |
| **baseline** | `baselineAt` 있으면 `AND created >= "<baselineAt - 26h>"` (PREVIEW 제외) | 동일 |
| **창(RECONCILE)** | `watermark` 있으면 `AND updated >= "<watermark - 26h>"` | 동일 |
| 창(BACKFILL/PREVIEW) | 없음(전체) | 동일 |
| 정렬 | `ORDER BY updated ASC` (커서 이어달리기용 — 안정 정렬) | 동일 |

**baseline 의 의미 (BLOCKER 2 해소)**
`backfill=false` = **"구독 이후 새로 생성된 이슈만"**. `baselineAt` 이 이를 보장하며 **RECONCILE 에도 적용된다**(적용하지 않으면 §3-1 의 1번 구멍이 열린다).
→ 한계: 구독 전에 생성됐지만 나중에 보드 조건을 충족하게 된 이슈는 편입되지 않는다. §12-3 에 명시하고 UI 문구로도 밝힌다.

**watermark 의 의미 (MAJOR 3 해소)**
- `watermark` = "여기까지는 완주해서 확인했다". **null 이면 하한을 두지 않는다**(= 전체를 훑는다).
- **스윕이 완주했을 때만** 전진한다. 실패·예산 소진 시 전진하지 않으므로 장애가 며칠 이어져도 복구 시 그 구간을 다시 훑는다.
- 전진값은 **스캔 종료 시각이 아니라 스윕 시작 시각**이다. 스캔 도중 갱신된 이슈를 다음 주기가 다시 보게 해야 경계에서 유실되지 않는다(중복은 `IS EMPTY` 가 흡수).

**⚠ 타임존 (구현 중 확정)**
JQL 날짜 리터럴은 **Jira 인스턴스 타임존**으로 해석되는데 저장값은 UTC ISO 다 — 그대로 비교하면 최대 ±14시간 어긋난다.
→ JQL 의 날짜 술어는 **스캔량을 줄이는 느슨한 하한**(여유 26h)으로만 쓰고, "구독 이후 생성분만"의 **정밀 판정은 애플리케이션에서** `created` 를 ISO 로 비교한다(`filterByBaseline`). JQL 만으로 정밀 경계를 만들려 하지 않는다.

### 3-3. 보드 구독은 제거됐다 (v3)

v2 까지는 보드도 소스로 삼아 `filter.jql AND subQuery` 를 조달했다. **제거했다**(§0-1 A).
남은 소스 타입은 `SPACE` 뿐이며 `SOURCE_TYPES` 도 그렇게 좁혔다. DB `source_type` 컬럼은
되살릴 여지를 위해 유지한다(값 제한만).

---

## 4. DB 설계

### 4-1. `project_subscription` (MySQL)

```sql
CREATE TABLE IF NOT EXISTS project_subscription (
    source_type       VARCHAR(10)  NOT NULL,   -- 'SPACE' | 'BOARD'
    source_id         VARCHAR(50)  NOT NULL,   -- ★ immutable (Jira project id / board id)
    project_id        BINARY(16)   NOT NULL,   -- 소유 RMS 프로젝트
    source_key        VARCHAR(100),            -- 스냅샷 (mutable — 표시용)
    source_name       VARCHAR(255),            -- 스냅샷 (서버 조달)
    issue_type_ids    TEXT,                    -- JSON 배열. NULL = 전체
    include_subtasks  TINYINT(1)   NOT NULL DEFAULT 1,
    extra_jql         VARCHAR(1000),
    is_active         TINYINT(1)   NOT NULL DEFAULT 1,
    generation        INT          NOT NULL DEFAULT 1,   -- 규칙 변경 시 +1

    subscribed_at     TIMESTAMP    NOT NULL,             -- 구독 시각(정보)
    baseline_at       TIMESTAMP    NULL,                 -- created 하한. NULL = 백필 함
    watermark         TIMESTAMP    NULL,                 -- 완주 시에만 전진. NULL = 전체 미주사
    sweep_cursor      VARCHAR(500),                      -- 진행 중 nextPageToken
    last_synced_at    TIMESTAMP    NULL,
    last_sync_status  VARCHAR(24),  -- OK|PARTIAL|AGILE_UNAVAILABLE|SOURCE_FORBIDDEN|SOURCE_MISSING|ERROR
    last_error        VARCHAR(500),
    last_run_tagged   INT          NOT NULL DEFAULT 0,   -- 직전 실행 편입 수
    lifetime_tagged   INT          NOT NULL DEFAULT 0,   -- 누적 편입 수(감소하지 않음)

    created_id VARCHAR(100), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_id VARCHAR(100), updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (source_type, source_id),          -- ★ 전역 배타 소유 (§2-1)
    INDEX idx_project (project_id),                -- 프로젝트별 구독 목록
    INDEX idx_sweep (is_active, last_synced_at)    -- 스케줄러: 오래된 것부터 (복합)
);
```

- `lifetime_tagged` / `last_run_tagged` 분리 — v1 의 `tagged_count` 는 "현재 소속 수"인지 "누적"인지 모호했다(MINOR 5).
  **현재 소속 수는 저장하지 않는다** — 이슈 삭제·수동 해제로 즉시 낡기 때문. 필요하면 JQL count 로 조회한다.
- `issue_type_ids` 는 CSV 대신 **JSON 배열 TEXT** (MAJOR 5).
- `is_active` 단독 인덱스 제거, `(is_active, last_synced_at)` 복합으로 스케줄러 정렬까지 커버.

### 4-2. 파일 배치 및 절차 (MAJOR 6 — 정정)

| 파일 | 내용 |
|------|------|
| `src/rdb/schema/ddl/projectSubscription.sql.js` | `CREATE_PROJECT_SUBSCRIPTION_TABLE` |
| `src/rdb/schema/ddl/index.js` | export 추가 |
| `src/rdb/schema/migrate.js` | `.enqueue('v015_create_project_subscription_table', …)` |
| `src/rdb/query/ProjectSubscriptionQuery.js` | CRUD / `findBySource` / `findByProject` / `findSweepBatch` |
| `src/resolver/project/ProjectService.js:91` | **프로젝트 삭제 cascade 목록에 `project_subscription` 추가** (MAJOR 5) |

> ⚠ **`TableReadiness.js` 는 "등재"하는 registry 가 아니다.** `isTableReady(tableName)` 로 프로브하는 범용 헬퍼다.
> → Repository 에 상수 `PROJECT_SUBSCRIPTION_TABLE = 'project_subscription'` 을 두고,
> **read 경로는 미준비 시 빈 목록(안전)**, **write·스윕 경로는 미준비 시 fail-close(실행 안 함)** 로 각각 게이팅한다.

---

## 5. 백엔드 설계

### 5-1. 신규 도메인 `src/resolver/projectSubscription/`

| 파일 | 책임 |
|------|------|
| `ProjectSubscriptionController.js` | `registerProjectSubscriptionController(resolver)` |
| `ProjectSubscriptionService.js` | CRUD / 미리보기 / 수동 동기화 |
| `ProjectSubscriptionRepository.js` | Query 래핑 + 테이블 준비 게이팅 |
| `SubscriptionJqlBuilder.js` | **실효 JQL 단일 진실** (순수함수) |
| `SubscriptionSourceApi.js` | 스페이스·보드 목록, 보드 filter+subQuery, **소스 접근 권한 검증** |
| `SubscriptionSweeper.js` | **SCAN → APPLY** 실행기 + 예산 관리 |
| `__test__/SubscriptionJqlBuilder.test.js` | JQL 조립 × 인젝션 × baseline/watermark 조합 |
| `__test__/SubscriptionSweeper.test.js` | SCAN/APPLY 분리, 예산 소진 시 cursor 보존 |

**등록**: `src/index.js` 의 `CONTROLLER_REGISTRARS` 배열에 추가(계약 테스트가 자동 대조).
**공용**: `src/api/jira/field/AppFieldValueApi.js` (§1-3)

### 5-2. `SubscriptionSweeper` — SCAN → APPLY (BLOCKER 1 해소)

```js
sweepSubscription(sub, { mode, budget })
  → { scanned, tagged, skipped, cursor, completed, status }
```

```
1) SCAN   — buildSubscriptionJql(mode) 로 검색, fields 최소, nextPageToken 페이징
            결과를 **issueId 배열로 전량 수집만** 한다 (write 없음 → 결과집합 불변)
            budget 소진 시 cursor 를 반환하고 중단 (completed=false)
2) APPLY  — 수집된 **고정 목록**을 50건씩 setAppFieldValues 로 write
            p-limit(2) · 실패 배치는 격리 후 errors 에 수집
3) 결과   — completed=true 일 때만 watermark 전진, cursor 는 null 로 정리
```

- **검색과 write 를 절대 교차하지 않는다.** v1 의 교차 방식은 `IS EMPTY` 결과가 write 로 줄어들어 커서가 이슈를 건너뛰었다.
- `budget = { maxRequests, deadlineAt }` — 요청 수와 **잔여 실행시간** 양쪽으로 제한.

### 5-3. 리컨실 스케줄러 `src/trigger/subscriptionReconcile.js` (P1 · 주 경로)

```js
export const runSubscriptionReconcile = async () => {
  1. isLicenseBlocked() → skip
  2. 테이블 준비 확인(fail-close)
  3. findSweepBatch({ orderBy: 'last_synced_at ASC', limit: N })   // 라운드로빈
  4. 전역 예산: maxRequests=600, deadlineAt=now+480s (함수 600s 중 여유 확보)
  5. 구독별 sweepSubscription — 예산은 남은 만큼 나눠 배분, 소진되면 즉시 중단
  6. 결과 기록: completed → watermark 전진 / 미완주 → cursor·PARTIAL 저장
}
```

- **예산이 소진되면 처리 못 한 구독은 다음 주기로 넘긴다.** `last_synced_at ASC` 정렬이 기아(starvation)를 막는다.
- Jira 429 대응: `Retry-After` 준수 + 지수 백오프 + jitter. 429 는 예산을 즉시 소진 처리하고 다음 주기로 미룬다.
- manifest: `interval: hour`, `timeoutSeconds: 600`

> 구독 수가 수백 규모로 커지면 스케줄러를 **디스패처로만** 두고 구독별 처리를 큐로 넘기는 확장이 필요하다(P4).
> P1 규모(프로젝트당 최대 10, 전체 수십)에서는 예산+라운드로빈으로 충분하다.

### 5-4. 이벤트 트리거 `src/trigger/onIssueCreated.js` (P2)

```js
1. isLicenseBlocked() → return
2. findBySource('SPACE', event.issue.fields.project.id, active)   // 최대 1건 (전역 배타)
3. 없으면 즉시 return (핫패스 비용 최소화)
4. 페이로드만으로 판정: issueTypeIds / subtask 여부
   - extraJql 이 있으면 **즉시 판정하지 않고 리컨실에 위임** (인덱스 지연 회피)
5. setAppFieldValues 로 단건 태깅. 실패는 로그만, throw 금지 (재시도 폭주 방지 — 리컨실이 재포착)
```

- **BOARD 구독은 이 경로에서 처리하지 않는다** (§2-2 표).
- manifest: `trigger: events: [avi:jira:created:issue]`

### 5-5. 백필 큐 `subscription-backfill-queue` (P3, MAJOR 7 해소)

v1 의 "커서 자기재귀"는 기존 `job/job_batch` 완료 판정(`totalBatches` 고정 전제, `consumer.js:125`)과 맞지 않는다.

```
1. 생성 시 SCAN 만 먼저 수행(write 없음) → issueId 전량 확보 → totalBatches 확정
2. 고정 batch 목록을 큐에 push (기존 upload-users 패턴 그대로 재사용)
3. consumer 는 batch 마다:
     - 구독 존재·is_active·generation 재확인 → 불일치면 **그 batch 를 폐기**(MAJOR 4)
     - setAppFieldValues 로 APPLY
4. 진행률: 기존 job/job_batch KVS + 프론트 JobPollingManager 재사용
```

- SCAN 자체가 큰 경우(수만 건)를 대비해 SCAN 상한 5,000건 — 초과분은 리컨실이 이후 주기에 흡수하고 UI 에 명시.

### 5-6. 권한 (`src/permission/PermissionMap.js`)

```js
getProjectSubscriptions:       R('PROJECT', 'detail'),
getSubscriptionSourceOptions:  R('PROJECT', 'detail'),   // ★ payload 에 projectId 필수 (아래 주의)
previewSubscriptionMatches:    R('PROJECT', 'detail'),
createProjectSubscription:     W('PROJECT', 'detail'),
updateProjectSubscription:     W('PROJECT', 'detail'),
deleteProjectSubscription:     W('PROJECT', 'detail'),
runSubscriptionSyncNow:        W('PROJECT', 'detail'),
```

> ⚠ **`permissionGuard.enforceProjectScope` 는 `if (pid && …)` 이다** — payload 에 `projectId` 가 없으면 스코프 검증을 **조용히 건너뛴다**(`permissionGuard.js:39`). 따라서 `'detail'` 로 지정한 7개 함수는 **전부 payload 에 `projectId` 를 반드시 포함**해야 한다. v1 의 `getSubscriptionSourceOptions` 는 `projectId` 가 없어 사실상 무검증이었다(MAJOR 2). 계약(§6-②)에 추가했다.

### 5-7. 소스 접근 권한 검증 (BLOCKER 4 해소)

구독은 **저장된 규칙이 나중에 `asApp` 으로 실행**된다. 사용자가 볼 수 없는 소스를 구독하면 앱 권한으로 데이터를 끌어오는 confused-deputy 가 된다.

`createProjectSubscription` / `updateProjectSubscription` 은 순서대로:

1. `sourceId` 형식 검증 — 숫자만(`^\d+$`). 프로젝트 키 문자열은 받지 않는다(mutable 이므로 애초에 식별자로 안 씀)
2. **`asUser` 로 소스 조회** (`GET /rest/api/3/project/{id}` 또는 `GET /rest/agile/1.0/board/{id}`)
   → 실패 시 `SUBSCRIPTION_SOURCE_FORBIDDEN`. **사용자가 볼 수 없는 소스는 구독할 수 없다.**
3. **`asApp` 으로도 접근 가능한지 확인** → 실패 시 `SUBSCRIPTION_APP_NO_ACCESS`("앱에 프로젝트 접근 권한이 필요합니다")
4. `sourceKey` / `sourceName` 은 **2단계 응답에서 서버가 채운다.** 클라이언트가 보낸 값은 무시한다
5. `issueTypeIds` 는 해당 소스의 실제 이슈타입 id 집합과 대조해 화이트리스트 검증
6. 조립된 **전체 JQL** 을 `/rest/api/3/jql/parse` 로 검증(§8-3)

### 5-8. 검색 요청 형태 (MAJOR 8 — 정정)

- 현행 페이징 패턴은 `search/jql` + `nextPageToken` (`IssueApi.js:399`). 동일하게 따른다.
- **`fields=` 빈 문자열은 현행에 없는 패턴이다.** SCAN 은 id/key 만 필요하므로 `fields=id` 로 최소 요청한다(응답에 `id`,`key`는 항상 포함).
- **`responseWrapper` 는 `{success:true, ...result}` 스프레드일 뿐 `content` 를 만들지 않는다**(`ResponseWrapper.js:3`).
  → 7개 서비스 전부 **명시적으로 `{ content: {...} }` 를 반환**해야 한다. 계약 테스트로 강제한다.

---

## 6. 경계면 계약 (★)

프론트가 받는 실제 형태는 `{ success: true, content: <아래> }` — **서비스가 `{content:…}` 를 반환**해야 성립한다(§5-8).

### ① `getProjectSubscriptions`  — in `{ projectId }`

```js
content: {
  subscriptions: [{
    sourceType: 'SPACE',
    sourceId: '10001',
    sourceKey: 'DWEB',              // 스냅샷 — 실제와 다를 수 있음
    sourceName: '디무브 웹',
    sourceAvatarUrl: null,
    issueTypeIds: ['10001'],        // null = 전체
    issueTypeNames: ['작업'],        // 조달 실패 시 []
    includeSubtasks: true,
    extraJql: null,
    isActive: true,
    subscribedAt: '2026-08-01T02:00:00.000Z',
    lastSyncedAt: '2026-08-03T04:00:00.000Z',   // 미실행 null
    lastSyncStatus: 'OK',           // OK|PARTIAL|AGILE_UNAVAILABLE|SOURCE_FORBIDDEN|SOURCE_MISSING|ERROR
    lastError: null,
    lastRunTagged: 3,
    lifetimeTagged: 128
  }]
}
```

### ② `getSubscriptionSourceOptions` — in `{ projectId, sourceType, query?, cursor?, maxResults? }`

> `projectId` 는 **권한 스코프 검증을 위해 필수**다(§5-6).

```js
content: {
  sourceType: 'BOARD',
  options: [{
    sourceId: '42', sourceKey: 'DWEB', name: 'DWEB Scrum Board',
    avatarUrl: null, boardType: 'scrum',          // SPACE 면 null
    takenBy: null                                  // 다른 RMS 프로젝트가 구독 중이면 { projectId, projectName }
  }],
  nextCursor: 'startAt=50',   // 없으면 null
  isLast: false,
  unavailable: false,
  unavailableReason: null     // 'AGILE_UNAVAILABLE' | 'FORBIDDEN'
}
```

> `takenBy` 로 배타 소유(§2-1)를 **선택 시점에** 보여준다. 저장 실패로 알게 하지 않는다.
> `unavailable` 을 두는 이유 — 보드 목록 실패를 빈 배열로 뭉개면 UI 가 "보드가 없음"으로 오표기한다.

### ③ `previewSubscriptionMatches` — in `{ projectId, sourceType, sourceId, issueTypeIds?, includeSubtasks?, extraJql?, backfill }`

```js
content: {
  jql: 'project = 10001 AND moves_RMS_projectId IS EMPTY …',  // 사용자에게 그대로 노출
  matchCount: 87,        // backfill 값에 따라 baseline 술어가 반영된 결과
  conflictCount: 12,     // 이미 다른 RMS 프로젝트 소속 → 건너뜀
  alreadyMineCount: 40,  // 이 프로젝트에 이미 등록됨
  sample: [{ issueId: '10101', issueKey: 'DWEB-12', summary: '…', issueTypeName: '작업' }],  // ≤10
  isCountCapped: false   // 카운트 상한(1000) 초과 → "87+" 표기
}
```

> `backfill` 을 **입력에 포함**한다. 백필 ON/OFF 로 baseline 술어가 달라져 건수가 바뀌기 때문 — v1 은 이를 반영하지 않아 미리보기와 실제가 어긋났다.

### ④ `createProjectSubscription`
in `{ projectId, sourceType, sourceId, issueTypeIds?, includeSubtasks?, extraJql?, backfill: boolean }`
※ `sourceKey`/`sourceName` 은 **받지 않는다**(서버 조달, §5-7)

```js
content: {
  subscription: { …①의 1건과 동일 shape… },
  backfill: { enqueued: true, appJobId: 'job-uuid', totalIssues: 87, isScanCapped: false }
  // backfill=false → { enqueued:false, appJobId:null, totalIssues:0, isScanCapped:false }
}
```

### ⑤ `updateProjectSubscription`
in `{ projectId, sourceType, sourceId, patch: { issueTypeIds?, includeSubtasks?, extraJql?, isActive? } }`
out `content: { subscription: {…} }` — 규칙이 바뀌면 `generation` 이 +1 되어 진행 중 백필 batch 가 폐기된다(§5-5)

### ⑥ `deleteProjectSubscription`
in `{ projectId, sourceType, sourceId }` → out `content: { deleted: true, sourceId: '10001' }`

> **이미 태깅된 이슈는 되돌리지 않는다.** 구독 해제 = "앞으로 안 가져옴". 되돌리기는 기존 `deleteProjectIssue` 로 개별 수행. UI 확인 문구에 명시.

### ⑦ `runSubscriptionSyncNow`
in `{ projectId, sourceType?, sourceId? }` (생략 시 그 프로젝트 전체 구독)

```js
content: { scanned: 210, tagged: 87, skipped: 123, completed: true, status: 'OK', syncedAt: '…' }
```

---

## 7. 프론트엔드 설계

### 7-1. 진입점 — 작업등록 모달 (MAJOR 9 반영)

요청대로 진입 동선은 작업등록 그대로 두되, `CommonModal` 이 **body 전체를 단일 `<Form>` + 단일 footer 로 감싸는 구조**(`CommonModal.jsx:31`)라 탭마다 다른 submit 을 그냥 얹을 수 없다.

**해법**: `IssueAddModal` 이 `activeTab` 을 들고 **footer 와 `onSubmit` 을 탭에 따라 교체**한다. `CommonModal` 은 이미 `footer` 를 render-prop 으로 받으므로 수정 없이 가능하다.

- `activeTab='issues'` → 현행 submit(`updateProjectIdField`) · 현행 footer
- `activeTab='subscription'` → 구독 탭은 **자체 액션 버튼**(구독 추가/해제)을 본문에 두고, 모달 footer 는 `[닫기]` 만 노출

```
┌─ 작업 등록 ───────────────────────────────────────────┐
│ [ 이슈 선택 ] [ 구독 설정 ]                            │
├───────────────────────────────────────────────────────┤
│ (구독 설정 탭)                                         │
│  구독 중인 소스                                        │
│   ● DWEB 스페이스   작업·스토리   누적 128건  [해제]    │
│     마지막 동기화 5분 전 · 정상                         │
│   ● DWEB Scrum Board  전체        누적 12건   [해제]    │
│     ⚠ 보드를 찾을 수 없습니다                           │
│                                                       │
│  ＋ 구독 추가                                          │
│    대상  ( ● 스페이스  ○ 보드 )                        │
│    소스  [ DWEB — 디무브 웹            ▾ ]             │
│           └ 이미 '차세대 포털'이 구독 중 → 선택 불가     │
│    ▸ 세부 조건 (선택)      ← 기본 접힘 = "스페이스 전체" │
│    ─────────────────────────────────────────          │
│    [ ] 기존 이슈도 지금 가져오기                        │
│    미리보기: 편입 87건 · 건너뜀 12건(다른 프로젝트 소속) │
│                                      [ 구독 추가 ]     │
└───────────────────────────────────────────────────────┘
```

- 세부 조건 **기본 접힘** = 사용자 결정("기본은 스페이스 전체")의 UI 직결
- 미리보기가 저장 **전에** 뜬다 — 자동으로 데이터를 바꾸는 기능이므로 결과를 먼저 보여준다
- 백필 체크박스를 **미리보기 위에** 둔다 — 체크 여부가 건수를 바꾸기 때문(§6-③)
- `takenBy` 소스는 셀렉트에서 비활성 + 소유 프로젝트명 표시

### 7-2. 파일 구조

```
static/ui/src/pages/projectDetail/issue/
  IssueAddModal.jsx                (수정) activeTab + footer/onSubmit 교체
  subscription/
    SubscriptionTab.jsx            SubscriptionList.jsx    SubscriptionForm.jsx
    SourceSelect.jsx               useSubscriptions.js     useSubscriptionPreview.js
    normalizeSubscriptionRule.js   (쿼리키 서명 정규화)
```

### 7-3. 쿼리 키 (`utils/queryKey/projectKeys.js` 확장, MINOR 3 반영)

```js
export const subscriptionKeys = {
    all:     ['projectSubscription'],
    scope:   (projectId) => ['projectSubscription', projectId],
    list:    (projectId) => ['projectSubscription', projectId, 'list'],
    sources: (projectId, sourceType, query) => ['projectSubscription', projectId, 'sources', sourceType, query ?? ''],
    preview: (projectId, ruleSignature)     => ['projectSubscription', projectId, 'preview', ruleSignature],
};
```

`ruleSignature` = `normalizeSubscriptionRule()` 결과 — **issueTypeIds 정렬·중복 제거, extraJql trim/공백 정규화, backfill 포함**.
정규화 없이는 같은 규칙이 서로 다른 캐시 엔트리가 된다. 미리보기 훅은 300ms 디바운스(`useDebounce` 재사용).

### 7-4. 캐시 무효화 (MAJOR 10 반영)

구독 편입은 **프론트 캐시만으로 정합되지 않는다.** 두 겹이 더 있다:

1. **백엔드 KVS 캐시** — 진척(`ProjectProgressService.js:58`)·비용은 서버에서 캐시된다.
   → `runSubscriptionSyncNow` / 백필 완료 시 **서버가 해당 프로젝트의 캐시 키를 명시적으로 무효화**한다. 프론트 invalidate 만으로는 낡은 값이 그대로 온다.
2. **Jira 검색 인덱스 지연**([[project_jira_search_index_lag]]) — 태깅 직후 JQL 재조회는 옛 결과를 줄 수 있다.
   → v1 의 "1.5초 후 무효화" 같은 **고정 지연은 보장이 아니다.** 대신:
   - 응답의 `tagged` 건수를 토스트로 즉시 알린다(사용자는 결과를 안다)
   - 목록은 **"반영 중" 상태를 표시**하고, 기대 건수에 도달하거나 최대 3회(2s/5s/10s) 재조회 후 종료하는 bounded polling 을 쓴다

```js
queryClient.invalidateQueries({ queryKey: subscriptionKeys.scope(projectId) });
queryClient.invalidateQueries({ queryKey: workListKeys.scope(projectId) });
queryClient.invalidateQueries({ queryKey: projectKeys.taskHistory(projectId) });
queryClient.invalidateQueries({ queryKey: projectKeys.progress(projectId) });
queryClient.invalidateQueries({ queryKey: projectKeys.cost(projectId) });
```

### 7-5. 권한 게이팅

`usePermissionStore.canWrite('PROJECT')` 가 false → 구독 탭은 **읽기 전용**(목록만, 추가/해제 숨김).
탭 자체를 숨기지 않는 이유: 구독 상태는 "왜 이 이슈가 여기 있는지"의 설명이라 읽기 권한자에게도 정보 가치가 있다.
단, 작업등록 모달은 write 권한자에게만 열리므로 **읽기 전용 사용자를 위한 구독 목록은 이슈 탭 상단 배지**로 별도 노출한다.

---

## 8. 검증·안전 설계

### 8-1. 실패 정책

| 경로 | 처리 |
|------|------|
| 이벤트 트리거 | 로그만, throw 금지(재시도 폭주 방지 — 리컨실이 재포착) |
| 리컨실 | 구독 단위 격리(`allSettled`). 1건 실패가 전체 스윕을 죽이지 않음. 상태 코드별로 기록 |
| 백필 큐 | batch 단위 재시도(기존 `job_fail` 패턴). generation 불일치 batch 는 폐기 |
| 수동 동기화 | 사용자 액션 → **실패를 그대로 전파**(토스트) |

### 8-2. 상한

- 스윕 1회: `maxRequests` 예산 + `deadlineAt` (§5-3)
- 백필 SCAN: 5,000건
- RMS 프로젝트당 구독: **10개**
- **상한으로 잘린 사실을 숨기지 않는다** — `PARTIAL` / `isScanCapped` / `isCountCapped` 로 항상 노출

### 8-3. `extraJql` 검증

- 길이 1,000자, `ORDER BY` 포함 시 거부
- **조립된 전체 JQL** 을 `/rest/api/3/jql/parse` 로 검증(조각만 검증하면 조립 후 문법이 깨질 수 있다)
- 저장 시 `(...)` 로 감싸 `A OR B` 가 소스 술어를 뚫지 못하게 한다
- `currentUser()` 등 **실행 문맥 의존 함수는 거부**한다(MINOR 1). preview 는 `asUser`, 스윕은 `asApp` 이라 같은 JQL 이 다른 결과를 낸다 — 예측 불가능한 편입의 원인이 된다
- `sourceId` 는 `^\d+$`, `projectId` 는 UUID 형식 검증

### 8-4. 에러 코드 (`ErrorCodes.js` 추가)

```
SUBSCRIPTION_PROJECT_ID_REQUIRED     SUBSCRIPTION_SOURCE_REQUIRED
SUBSCRIPTION_INVALID_SOURCE_TYPE     SUBSCRIPTION_INVALID_SOURCE_ID
SUBSCRIPTION_INVALID_JQL             SUBSCRIPTION_JQL_CONTEXT_FUNCTION
SUBSCRIPTION_SOURCE_TAKEN            SUBSCRIPTION_SOURCE_FORBIDDEN
SUBSCRIPTION_APP_NO_ACCESS           SUBSCRIPTION_AGILE_UNAVAILABLE
SUBSCRIPTION_LIMIT_EXCEEDED          SUBSCRIPTION_NOT_FOUND
```

---

## 9. manifest.yml / 의존성 변경

```yaml
function:
  - key: onIssueCreated                 # P2
    handler: trigger/onIssueCreated.onIssueCreated
  - key: subscriptionReconcile          # P1
    handler: index.runSubscriptionReconcile
    timeoutSeconds: 600
  - key: backfillSubscription           # P3
    handler: queue/consumer.backfillSubscription
    timeoutSeconds: 600

consumer:                                # P3
  - key: subscription-backfill-consumer
    queue: subscription-backfill-queue
    function: backfillSubscription

scheduledTrigger:                        # P1
  - key: subscription-reconcile
    function: subscriptionReconcile
    interval: hour

trigger:                                 # P2
  - key: on-issue-created
    function: onIssueCreated
    events: [ avi:jira:created:issue ]

permissions:
  scopes:
    # 기존 유지 + 보드 구독용 — ⚠ 실제 필요 조합은 §13-1 배포검증
    - read:board-scope.admin:jira-software
    - read:project:jira
    - read:filter:jira
```

- `src/index.js` 에 `export { runSubscriptionReconcile } from './trigger/subscriptionReconcile';`
- **루트 `package.json` 에 `p-limit` 직접 추가** — 현재 `static/ui/package.json` 에만 있고 루트에는 없다(MINOR 4). 백엔드에서 쓰려면 직접 의존성으로 선언해야 한다.

---

## 10. i18n

**신규** `locales/kr/subscription.json` + `locales/en/subscription.json` → `cd static/ui && npm run merge`
(`ko-KR.json`/`en-US.json` 직접 수정 금지, `locales/script/*.json` 은 빈 스텁이라 반영 안 됨)

```json
{
  "subscription": {
    "tab": "구독 설정",
    "list": { "title": "구독 중인 소스", "empty": "구독 중인 소스가 없습니다.",
              "lifetimeTagged": "누적 {count}건", "lastSynced": "마지막 동기화 {time}",
              "never": "아직 동기화되지 않음", "unsubscribe": "해제" },
    "status": { "OK": "정상", "PARTIAL": "일부 반영 — 다음 동기화에서 이어집니다",
                "AGILE_UNAVAILABLE": "이 사이트에서는 보드를 사용할 수 없습니다",
                "SOURCE_FORBIDDEN": "소스에 접근할 권한이 없습니다",
                "SOURCE_MISSING": "소스를 찾을 수 없습니다(삭제되었을 수 있습니다)",
                "ERROR": "동기화 오류" },
    "add": { "title": "구독 추가", "sourceType": "대상", "space": "스페이스", "board": "보드",
             "source": "소스", "sourcePlaceholder": "스페이스를 선택하세요",
             "taken": "'{projectName}'이(가) 이미 구독 중입니다",
             "advanced": "세부 조건 (선택)", "issueType": "이슈 타입", "issueTypeAll": "전체",
             "includeSubtasks": "하위 작업 포함", "extraJql": "추가 JQL",
             "extraJqlHelp": "고급 — 예: labels = release", "submit": "구독 추가" },
    "preview": { "match": "편입 {count}건", "conflict": "건너뜀 {count}건 (다른 프로젝트 소속)",
                 "alreadyMine": "이미 등록됨 {count}건", "capped": "{count}건 이상",
                 "loading": "미리보기 계산 중…" },
    "backfill": { "label": "기존 이슈도 지금 가져오기",
                  "help": "체크하지 않으면 구독 이후 생성된 이슈부터 가져옵니다.",
                  "running": "기존 이슈를 가져오는 중…", "done": "{count}건을 가져왔습니다.",
                  "capped": "대상이 많아 일부만 즉시 반영됩니다. 나머지는 자동 동기화로 채워집니다." },
    "sync": { "now": "지금 동기화", "result": "{count}건이 편입되었습니다.",
              "applying": "반영 중…" },
    "confirm": { "unsubscribeTitle": "구독을 해제할까요?",
                 "unsubscribeBody": "앞으로 새 이슈를 가져오지 않습니다. 이미 편입된 이슈는 그대로 남습니다." },
    "error": { "taken": "다른 프로젝트가 구독 중인 소스입니다.",
               "forbidden": "접근할 수 없는 소스입니다.",
               "appNoAccess": "앱에 이 프로젝트 접근 권한이 필요합니다.",
               "limit": "구독은 최대 10개까지 추가할 수 있습니다.",
               "invalidJql": "JQL 문법이 올바르지 않습니다.",
               "contextFunction": "currentUser() 같은 사용자 기준 함수는 사용할 수 없습니다." }
  }
}
```

---

## 11. 단계 분해

### P1 — 구독 규칙 + 리컨실 (기능 완결 최소 단위)
- [ ] `AppFieldValueApi.js` 공용 추출 + `ProjectUsersService.updateCustomField` 교체(회귀 확인)
- [ ] DDL `projectSubscription.sql.js` + `ddl/index.js` + `migrate.js v015` + `ProjectService` 삭제 cascade
- [ ] `ProjectSubscriptionQuery.js` + Repository(테이블 준비 게이팅: read=안전, write=fail-close)
- [ ] `SubscriptionJqlBuilder.js` + 단위테스트 (SPACE/BOARD × baseline/watermark × 인젝션)
- [ ] `SubscriptionSourceApi.js` (목록·보드 filter+subQuery·**asUser/asApp 접근 검증**)
- [ ] `SubscriptionSweeper.js` **SCAN→APPLY** + 예산 + 단위테스트
- [ ] Service/Controller — resolver ①~⑦ (전부 `{content:…}` 반환) + 계약 테스트
- [ ] `PermissionMap` 7키 + `ErrorCodes` 12개 + `index.js` 등록 + 루트 `p-limit` 추가
- [ ] `trigger/subscriptionReconcile.js` + manifest scheduledTrigger
- [ ] 프론트: 탭 전환(footer/onSubmit 교체) + 구독 탭 4종 + 쿼리키·정규화 + i18n

### P2 — 이벤트 즉시 편입 ✅ 완료
- [x] `IssueEventMatcher.js` — 페이로드 판정을 **순수함수로 분리**(트리거 본체는 테스트가 어렵지만 위험한 건 판정 로직)
- [x] `trigger/onIssueCreated.js` + manifest trigger/function
- [x] 단위테스트 18개 — 특히 **"모르면 defer"**(보드/타입미상/subtask미상/extraJql)를 명시적으로 고정
- 설계 대비 보강: 이벤트 태깅도 `lifetime_tagged` 에 반영(`INCREMENT_TAGGED`).
  단 **watermark 는 전진시키지 않는다** — 이벤트는 이슈 1건만 보므로 "여기까지 확인했다"는 근거가 없다.

### P3 — 백필 큐 ✅ 완료
- [x] `SubscriptionBackfill.js` — SCAN 선행으로 대상 고정 → `totalBatches` 확정 → 큐 push
- [x] `queue/consumer.js backfillSubscription` + manifest consumer/queue/function
- [x] 매 배치 `generation`·`isActive`·소유 프로젝트 재검증 → 불일치 batch 폐기
- [x] 기존 `job`/`job_batch` KVS 진행률 모델 그대로 재사용
- [ ] (미착수) 프론트 진행률 UI — 현재는 토스트로 "가져오는 중 {n}건" 안내만. `JobPollingManager` 연결은 후속

### P4 — 운영 가시성 / 확장 ✅ 대부분 완료
- [x] 상태별 오류 안내, `지금 동기화` 버튼(작업관리 배너 + 구독 탭)
- [x] 작업관리 상단 구독 소스 칩 바(클릭 시 스페이스 필터), 1시간 주기 안내
- [x] 구독 조건 인라인 수정(타입 필터 / 하위작업 / 추가 JQL / 일시 중지)
- [ ] 구독 수 증가 시 스케줄러 → 큐 디스패처 전환 (미착수)

### P5 — 검증 리포트 대응 + 보드 제거 ✅ 완료 (v3)
- [x] P0-1 미리보기 권한 우회 — `assertSourceAccessible` + 전 조회 `asUser`
- [x] P1-1 `baseline_at` projection 누락 — 세 SELECT 를 공통 fragment 로 통합 + parity 테스트
- [x] P1-2 커서 재사용 — 저장/사용하지 않고 매번 첫 페이지부터
- [x] P1-7 update 권한 재검증 (단, **비활성화만 하는 요청은 면제**)
- [x] P1-5 완화 — resolver 예산 축소(백필 8s / 수동 12s)
- [x] P2-9 프론트 필터 — 프로젝트 전환 시 초기화, 보드 칩 제거
- [x] 보드 지원 제거 → **P0-2(겹치는 소스 소유권 경합) 구조적 해소**

### P6 — 기능 확충 ✅ 완료 (v3)
- [x] 수동 등록 소속 표시 + 가져오기 확인 (`getIssueOwnershipHints`)
- [x] 소량 백필 즉시 처리(50건 이하 + 스캔 완주)
- [x] 이슈 타입 필터 UI (`getSourceIssueTypes`)
- [x] 구독별 기본 계획 작업량 (v017, `DefaultEstimateApplier`)

### 미착수
- [ ] **같은 스페이스 중복 구독 허용 + 경고** — PK 를 `(project_id, source_type, source_id)` 로 바꾸고
      이벤트 판정이 N건 중 하나를 고르도록 해야 한다(현재는 단건 전제)
- [ ] 백필 진행률 UI — 소량 즉시 처리로 **필요성이 낮아졌다**(대량 구독에서만 의미)

---

## 12. 알려진 한계 (수용, UI 문구로 명시)

1. **이슈는 RMS 프로젝트 1곳에만 소속된다** — `moves_RMS_projectId` 가 단일 문자열이기 때문.
2. **소스는 한 RMS 프로젝트만 구독할 수 있다** — 1의 귀결이자 소유권 경합 제거를 위한 설계 결정(§2-1). 같은 스페이스를 두 프로젝트가 나눠 쓰려면 `extraJql` 로 분할하는 대신, **현재 설계로는 불가**하다.
3. **백필 OFF = "구독 이후 생성된 이슈만"** — 구독 전에 생성됐다가 나중에 보드 조건을 충족하는 이슈는 편입되지 않는다.
4. **보드 구독은 실시간이 아니다** — 최대 1시간(리컨실 주기) 지연. 보드 조건이 생성 이후 충족되는 특성상 불가피.
5. **구독 해제는 소급되지 않는다** — 이미 편입된 이슈는 남는다.
6. **팀 관리형 프로젝트** — `moves_RMS_projectId` 는 write·JQL 인덱싱이 동작하므로 구독도 동작한다. fields 응답 누락 갭([[project_team_managed_field_gap]])은 이 기능과 무관하게 유지.
7. **dev/prod 앱 공존 사이트** — 같은 이름 필드가 2벌 생겨 JQL 이름 매칭이 모호해진다([[project_forge_env_field_duplication]]). 운영 사이트 단일 환경 전제 유지.
8. **컬럼을 추가하는 배포는 최대 1시간 동안 그 기능을 깨뜨린다** — 실제로 겪었다(2026-08-04).
   `isTableReady` 는 **테이블 존재만** 확인하고 컬럼은 보지 않는다. 그래서 `v017`(컬럼 추가)이
   아직 안 돈 상태에서 그 컬럼을 읽는 SELECT 가 그대로 실행돼 오류가 화면까지 올라왔다.
   마이그레이션 실행 경로가 `init-db`(시간별)·`onInstall`·`ensureSeed` 뿐이고,
   **재배포만으로는 `onInstall` 이 발동하지 않는다**("이미 최신 버전"). 구독만의 문제가 아니라
   이 앱 전체에 해당한다 → 별도 과제.
9. **편입된 이슈가 소스를 이탈해도 되돌리지 않는다**(C7) — 타 Jira 프로젝트로 이동하거나 보드 필터 변경으로 보드에서 빠져도 RMS 프로젝트 소속은 유지된다. 자동 회수하면 과거 집계가 소급 변동하기 때문. 수동 해제는 이슈 탭에서 가능.

---

## 13. 배포 검증 결과 (2026-08-04, development)

`tom-chkim-dev.atlassian.net` 에 배포해 실제로 화면을 열어 확인했다.

| 항목 | 결과 |
|------|------|
| `forge lint` | ✅ 통과 (v2 시점 "확인 못 함"으로 남았던 항목) |
| manifest 모듈 등록(트리거·컨슈머·스케줄러) | ✅ 검증 통과 |
| 마이그레이션 `v016`(테이블) | ✅ 실행됨 |
| 마이그레이션 `v017`(컬럼) | ⚠️ 지연 — §12-8 참조 |
| 구독 생성·미리보기·목록 | ✅ 동작 |
| 이슈 생성 즉시 편입(이벤트 페이로드) | ✅ 동작 |
| 앱 필드 배치 write | ✅ 동작 |
| Agile scope | — **해당 없음**(보드 제거로 소멸) |

### 배포해서야 드러난 결함 3건

1. **작업 등록 모달이 열리지 않음(TDZ)** — `rows` 를 상태에서 파생 계산으로 바꾸며 선언이
   사용처(`head`) 아래로 내려갔다. 문법상 유효해 **컴파일·테스트·빌드 모두 통과**하고
   그 컴포넌트를 렌더할 때만 `ReferenceError` 로 터진다.
2. **기본 계획 작업량이 적용되지 않음** — 편입 경로가 4개인데 리컨실 스윕 한 곳에만 붙였다.
   정작 사용자가 확인한 이벤트 즉시 편입 경로에는 없었다.
3. **"다른 프로젝트가 구독 중"의 의미 불명** — `takenBy` 가 `projectId` 만 담아
   "우리가 구독한 건가 남이 한 건가"로 읽혔다. 이름과 `isMine` 을 함께 내려 문구를 갈랐다.

> **교훈**: 백엔드 1,066 테스트와 프론트 빌드가 모두 통과해도 "화면이 뜬다"는 보장은 아니다.
> 특히 ①렌더 시점에만 터지는 TDZ, ②같은 기능을 여러 경로에 붙일 때의 누락은
> 정적 검증이 잡지 못한다. 후자는 `baseline_at`(SELECT 3개 중 1개 누락)과 같은 계열이다.

## 14. 검토 대응 이력 (코덱스 v1 검토 → v2)

| 지적 | 심각도 | 처리 |
|------|--------|------|
| mutable pagination 중 태깅 → 누락 | BLOCKER | **반영** — SCAN→APPLY 분리(§5-2) |
| `backfill=false` 가 리컨실 7일 창에 무효화 | BLOCKER | **반영** — `subscribed_at` baseline(§3-2) |
| first-wins 가 원자적이지 않음 | BLOCKER | **반영(대안)** — claim 테이블 대신 **소스 전역 배타 PK**(§2-1). 이슈 단위 claim 은 Forge SQL 용량 압박 |
| 사용자 입력 + `asApp` confused-deputy | BLOCKER | **반영** — `asUser` 접근 검증 + 서버 메타 조달(§5-7) |
| BOARD scope 오류 / `subQuery` 누락 | BLOCKER | **반영** — `(filter.jql) AND (subQuery)`, scope 수정(§3-3, §9). scope 조합은 §13-1 검증 |
| 시간별 리컨실 fan-out 초과 | BLOCKER | **반영** — 예산+커서 이어달리기+라운드로빈(§5-3). 큐 디스패처는 P4 |
| `updateCustomField` 재사용 전제 오류 | MAJOR | **반영** — 공용 `AppFieldValueApi` 추출(§1-3) |
| `getSubscriptionSourceOptions` 스코프 우회 | MAJOR | **반영** — `projectId` 필수화(§5-6, §6-②) |
| 7일 고정창은 정확성의 원천이 못 됨 | MAJOR | **반영** — watermark + overlap(§3-2) |
| 큐 이벤트와 구독 lifecycle 불일치 | MAJOR | **반영** — `generation` 재검증(§5-5) |
| DB identity/lifecycle 불완전 | MAJOR | **반영** — `source_id` PK, JSON 타입, 복합 인덱스, 삭제 cascade(§4) |
| `TableReadiness` 등재 절차 없음 | MAJOR | **반영(사실정정)** — 프로브 헬퍼로 게이팅(§4-2) |
| job/job_batch 와 커서 재귀 비호환 | MAJOR | **반영** — SCAN 선행으로 batch 고정(§5-5) |
| `fields=` 빈 값 / `responseWrapper` 오해 | MAJOR | **반영(사실정정)** — `fields=id`, 서비스가 `{content}` 반환(§5-8) |
| 모달 단일 form 구조 충돌 | MAJOR | **반영** — footer/onSubmit 탭별 교체(§7-1) |
| 프론트 invalidate 만으로 부족 | MAJOR | **반영** — 백엔드 캐시 무효화 + bounded polling(§7-4) |
| JQL 실행 문맥 함수 | MINOR | **반영** — `currentUser()` 계열 거부(§8-3) |
| source options 페이징 없음 | MINOR | **반영** — `cursor/isLast`(§6-②) |
| 쿼리키 정규화 부족 | MINOR | **반영** — `normalizeSubscriptionRule`(§7-3) |
| `p-limit` 루트 미선언 | MINOR | **반영** — 루트 의존성 추가(§9) |
| 통계 컬럼 의미 모호 | MINOR | **반영** — `last_run_tagged`/`lifetime_tagged` 분리(§4-1) |

### 14-1. P1 구현 중 추가로 발견·수정한 것 (검토에도 없던 항목)

| 발견 | 내용 | 처리 |
|------|------|------|
| **baseline 이 리컨실에서 무력화** | `subscribed_at` 하나로는 부족. 리컨실은 `updated` 기준이라 "구독 전 생성 + 최근 수정" 이슈가 백필 OFF 구독에 새어 들어온다 | `baseline_at` 컬럼 분리, RECONCILE 에도 적용(§3-1) |
| **백필 ON 이 조용히 무효화** | `watermark` 를 구독 시각으로 채우면 첫 스윕이 과거를 못 훑는다 | `watermark = NULL` = "전체 미주사"로 정의, null 이면 `updated` 하한 미적용 |
| **JQL 날짜 ↔ UTC 타임존 불일치** | JQL 리터럴은 인스턴스 타임존 해석, 저장값은 UTC ISO → 최대 ±14h 오차 | JQL 은 느슨한 하한(26h 여유)만, 정밀 판정은 `filterByBaseline` 로 앱에서 |
| **watermark 전진값** | 스캔 *종료* 시각을 쓰면 스캔 도중 갱신된 이슈를 다음 주기가 놓친다 | 스윕 **시작** 시각으로 전진(중복은 `IS EMPTY` 가 흡수) |
| **`useDebounce` 무한 리셋** | deps 가 value 참조라 매 렌더 새 객체를 넘기면 타이머가 영원히 리셋된다 | 규칙을 문자열로 직렬화해 디바운스 후 파싱(§7-3) |
| **granular/classic scope 혼용 위험** | Agile scope 를 그냥 추가하면 classic 세트와 섞여 **배포 자체가 거부**될 수 있다 | scope 추가를 보류하고 classic `read:jira-work` 로 실호출 검증 후 결정(§13-1) |
| **`p-limit` 루트 미선언 (검토 MINOR 4 확인)** | 백엔드 **8개 파일**이 이미 transitive 의존으로 쓰고 있었다 | 루트 `package.json` 에 `p-limit@3.1.0` 직접 선언 |
