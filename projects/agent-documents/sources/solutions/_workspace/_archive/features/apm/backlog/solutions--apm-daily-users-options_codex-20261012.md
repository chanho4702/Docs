# 결론

**보여 줄 수는 있지만, 현재 데이터로는 “오늘 사용자 수”라고 부르면 안 됩니다.** 가장 현실적인 권장안은 RUM 기반의 **`오늘 방문 세션 (KST)`**이며, 사람 수가 아니라 브라우저 방문 세션 수임을 명시해야 합니다.

다만 현 상태 그대로는 다음 두 문제가 있습니다.

1. 현재 `session.id`는 30분 방문 세션이 아니라 **스니펫을 초기화할 때마다 메모리에 생성되는 UUID**입니다. 새로고침·새 탭·재초기화마다 다시 셀 수 있습니다. 생성은 `rum-snippet.js:20`, 스팬 주입은 `:115`, Web Vital 주입은 `:135`입니다.
2. 화면의 `sessions`는 5분·페이지·browser·OS·country별 distinct를 **다시 합산한 값**입니다. “오늘 전체 고유 세션”이 아닙니다. 스키마도 이를 명시합니다.  
   `src/main/resources/db/migration/V57__apm_rum_kubernetes.sql:59-64`  
   `src/main/java/.../rum/page/RumQueryService.java:225-250`

“요청 세션을 체크하면 되지 않나?”에 대한 답은 **가능하지만 현재 APM 파이프라인에는 그 값이 없습니다.** HTTP 요청 헤더 수집은 기본적으로 비어 있는 opt-in 설정이고, 현재 Collector는 모든 요청 헤더와 `client.address`, `user_agent.original`을 삭제합니다. 이후 BE도 `enduser.id`를 폐기합니다.

- Collector 삭제: `src/main/resources/apm/collector-template.yaml:41-49`
- BE 거부 목록: `src/main/java/.../trace/ingest/ApmSpanAttrAllowlist.java:53-74`
- 설치 가이드에도 Cookie/session 헤더 수집 설정이 없음: `src/main/java/.../collector/install/ApmInstallGuideService.java:657-729`
- OpenTelemetry Java agent의 서버 요청 헤더 캡처 기본값은 empty이며 별도 설정이 필요합니다. [공식 HTTP instrumentation 설정](https://opentelemetry.io/docs/zero-code/java/agent/instrumentation/http/)

아래 BE 근거는 최신 APM 워크트리 `C:\worktrees\apm-c05-followup`, FE 근거는 `C:\solutions\moveseyee_fe` 기준입니다.

## 1. 측정 방법 비교

정확도·개인정보 위험 평가는 코드 사실이 아닌 **설계 판단·추정**입니다.

| 방법 | 실제로 세는 대상 | 사람 수 정확도 | 고객 측 작업 | 개인정보 위험 | 우리 쪽 구현 비용 |
|---|---|---:|---:|---:|---|
| **현재 RUM `session_hash`** | 스니펫 실행 세션 | 낮음. 사람·기기가 아니라 런타임 세션 | RUM 미설치 고객은 스니펫·동의 연동 필요. 이미 설치했으면 추가 작업 없음 | 낮음~중간. 랜덤 UUID이나 한 세션 내 연결 가능 | **중간**. 전체/page 기준은 새 쿼리와 인덱스. 서비스 기준은 매핑·스키마 필요 |
| **30분 만료 RUM 방문 세션** | 일반적인 웹 방문 세션 | 중간. 웹 분석의 세션에 가까움 | 스니펫 업데이트·재배포 필요 | 중간. 브라우저 저장소의 추적 식별자 | **중간**. 스니펫 정책, 일 단위 distinct 테이블, API 필요 |
| **지속형 익명 visitor/device ID** | 브라우저 프로필 | 낮음~중간. 기기보다 브라우저 프로필 수 | cookie/localStorage 및 동의 연동 | 중간~높음. 여러 날 연결 가능한 가명 ID | **중간~높음**. visitor 스키마·보존·삭제 정책 필요 |
| **RUM `enduser.id`** | 로그인 계정 | 높음. 단 공유 계정·다중 계정 오차 | 고객 프론트에서 안정적인 ID 제공 필요 | **높음**. OTel도 `enduser.id`와 가명 ID를 민감정보로 분류 | **높음**. keyed HMAC, 전용 일 집계 테이블 필요 |
| **서버 세션 Cookie/세션 ID 해시** | HTTP/인증 세션 | 중간. 세션 수이지 사람 수는 아님 | 고객 애플리케이션 또는 agent extension에서 **원문이 아닌 해시** 생성 필요 | 중간~높음. 원문 Cookie 수집은 매우 위험 | **높음**. attr 허용목록·수신·일 집계·보존·인덱스 모두 신규 |
| **서버 `enduser.id`** | 로그인 계정 | 높음 | 인증 미들웨어에서 span에 ID 또는 가명 ID 설정 필요 | **높음** | **높음**. 현재 Collector가 해시해도 BE가 폐기하므로 파이프라인 변경 필요 |
| **`client IP + UA` 일별 해시** | 네트워크+브라우저 지문 | 낮음. NAT는 과소, VPN·IPv6·UA 변화는 과다 | reverse proxy의 신뢰 IP 설정, Collector 업데이트 필요 | **높음**. IP 및 fingerprinting | **중간~높음**. 일별 salt/HMAC, bot 제외, 신규 집계 필요 |
| **고객이 계산한 DAU/session metric** | 고객이 정의한 계정·사용자·세션 | 정의에 따라 가장 높음 | **높음**. 고객 DB/인증 시스템에서 집계·전송 | 집계 숫자만 받으면 낮음 | 우리 쪽은 **낮음~중간**. metric 허용·조회·카드 추가 |
| 요청 수·trace 수 | 요청 | 사용자와 무관 | 없음 | 낮음 | 낮지만 **사용자 지표로 사용 불가** |
| 홈 `현재 접속` | MovesEye 관제 앱 로그인 세션 | 고객 서비스와 무관 | 없음 | 낮음 | 이미 존재하지만 목적이 다름 |

현재 RUM은 동의가 승인된 뒤에만 UUID를 생성합니다. `rum-snippet.js:12-20`. 서버는 `session.id`를 `tokenId + 값`으로 SHA-256 처리합니다. `RumParser.java:105-125`, `RumSanitizer.java:54-61`.

RUM `enduser.id`는 고객이 보내기만 하면 현재도 RUM 스팬의 attrs에는 해시되어 들어갈 수 있습니다. 하지만 기본 스니펫은 보내지 않고, 해당 스팬의 보존도 7일뿐입니다. JSON distinct 쿼리도 비쌉니다.

- RUM 사용자 ID 해시: `RumSanitizer.java:136-143`
- RUM 스팬 스키마: `V57__apm_rum_kubernetes.sql:84-92`
- RUM 스팬 7일 보존: `ApmRetentionService.java:63-71`

반면 서버 트레이스의 `enduser.id`는 Collector에서 해시한 뒤에도 BE가 “이미 해시됐는지 확신할 수 없다”는 이유로 버립니다. `ApmSpanAttrAllowlist.java:53-69`.

## 2. RUM으로 “오늘 고유 세션”을 셀 때

### 현재 집계가 과다한 이유

`apm_rum_session_5m`의 PK는 다음과 같습니다.

```text
(group_id, browser, os, country, bucket, session_hash)
```

근거: `V57__apm_rum_kubernetes.sql:60-64`.

같은 세션도 다음 경우 여러 행이 됩니다.

- 다른 페이지로 이동
- 다른 5분 버킷까지 머무름
- browser·OS·country 차원이 바뀜

`RumStore`는 이 PK에서 신규 행일 때마다 `apm_rum_page_5m.sessions`를 1 증가시킵니다. `RumStore.java:123-165`, `:364-370`.

그 후 조회 서비스는 다시 모든 행의 `sessions`를 더합니다. `RumQueryService.java:225-250`. 따라서 기존 화면 값은 타입에 적힌 그대로 `DISTINCT_PER_PAGE_DIMENSION_5M_SUM`입니다. `RumQueryService.java:25`, FE `src/types/apmRum.ts:6`.

### 정확한 전체 distinct

최소 구현은 다음 쿼리입니다.

```sql
SELECT COUNT(DISTINCT session_hash)
FROM apm_rum_session_5m
WHERE bucket >= :kst_midnight
  AND bucket < :current_bucket_end;
```

이 쿼리는 페이지·차원·5분 버킷 중복을 제거합니다.

다만 기존 PK는 `session_hash`가 마지막이고 `group_id`가 첫 컬럼이므로, 전체 조회에서는 효율적인 distinct 인덱스가 아닙니다. 일 파티션 pruning은 되지만 해당 날짜 행을 거의 모두 읽어야 합니다.

최소 인덱스 후보는 다음입니다.

```sql
CREATE INDEX ... ON apm_rum_session_5m(bucket, session_hash);
```

그래도 정확한 `COUNT(DISTINCT)`는 O(오늘 저장 행 수)입니다. 대규모 고객까지 고려하면 일 단위 dedupe 테이블이 낫습니다.

```text
apm_rum_session_day
- day_kst
- token_id 또는 rum_app_id
- session_hash
- first_seen_at
- last_seen_at
PK(day_kst, token_id, session_hash)
```

이 테이블에는 한 세션이 하루에 한 번만 들어가므로 쿼리는 훨씬 작아집니다.

### 페이지 그룹·서비스별·전체

여기서 중요한 정정이 있습니다.

현재 RUM의 `group_id`는 **APM 서비스 그룹이 아니라 페이지 그룹**입니다.

```java
groupId = hash(tokenId, normalizedPagePath)
```

근거: `RumSanitizer.java:54-62`.

따라서:

- 페이지 그룹별: `WHERE group_id=?`로 정확한 distinct 가능
- 전체 RUM: 전체 `COUNT(DISTINCT session_hash)` 가능
- RUM token/site별: 현재 `session_5m`에 `token_id`가 없으므로 `apm_rum_page_5m`과 전체 PK 축으로 join해야 함
- APM backend service별: **현재는 직접 불가능**

`apm_rum_page_5m`에는 `token_id`가 있지만 `apm_rum_session_5m`에는 없습니다. `V57__apm_rum_kubernetes.sql:35-39`, `:60-64`.

더구나 RUM token 자체도 서비스 UID를 받지 않습니다. 발급 입력은 label·origin·상한뿐입니다. `RumTokenCreateDto.java:5-10`, `RumTokenService.java:48-61`.

서비스별 집계를 원한다면 다음 중 하나가 필요합니다.

- `RUM token → RUM application/service` 명시적 매핑
- `token_id`를 세션 테이블에 추가
- backend microservice가 아니라 “고객 웹 애플리케이션”을 별도 집계 단위로 정의

브라우저 한 세션이 여러 microservice를 호출할 수 있으므로, trace 연결로 특정 backend service에 사용자를 귀속시키는 방식은 의미도 불명확하고 권장하지 않습니다.

### 보존 기간과 다운샘플

코드상 RUM 5분 집계·세션 해시는 **30일 고정**이며 관리자 설정 대상도 아닙니다.

- 상수: `ApmRetentionDays.java:22-23`, `:98-103`
- 실제 삭제 계획: `ApmRetentionService.java:63-71`

다만 파티션 삭제는 `오늘 - 30일`보다 **이전 날짜만** 삭제합니다. 따라서 실제로는 오늘 포함 최대 31개 날짜 파티션이 남을 수 있습니다. `ApmPartitionService.java:249-280`.

RUM에는 1시간·일 단위 다운샘플 테이블이 없습니다. `apm_rum_page_5m`은 `sessions` 숫자만 보존하고 해시는 유지하지 않습니다. 파티션 목록에도 RUM 1h 테이블이 없습니다. `ApmPartitionService.java:96-102`.

아카이브도 RUM은 아직 “2차 범위”로 미구현입니다. `ApmArchiveDataset.java:21-23`.

따라서 **세션 해시가 삭제된 뒤에는 과거의 정확한 unique를 재계산할 수 없습니다.** 장기 추세가 필요하면 해시는 30일 후 버리되 `day_kst + scope + exact_count`만 장기 보존하는 것이 낫습니다.

### KST 자정

현재 APM의 DB `timestamp` 변환은 UTC 고정이 아니라 JVM `ZoneId.systemDefault()`를 사용합니다. `ApmTimeRange.java:16-25`, `:175-193`. RUM 버킷도 이 변환을 사용합니다. `RumStore.java:54-56`.

새 API에서는 브라우저나 서버 기본 시간대에 맡기지 말고 명시적으로:

```text
ZoneId.of("Asia/Seoul")
[오늘 00:00 KST, 현재 시각)
```

을 계산해야 합니다. 기존 RUM 조회는 5분 경계로 시작을 내리고 끝을 올립니다. `RumQueryService.java:60-68`. KST 자정은 5분 경계이므로 시작은 문제없지만, API가 반환하는 `from/to`는 실제 확장된 범위임을 유지해야 합니다.

### 현재 세션 수명

현재 정책에는 만료 시간이 없습니다.

- 초기화할 때 `crypto.randomUUID()`: `rum-snippet.js:20`
- memory-only라는 주석: 같은 줄
- 새로고침·새 탭·재초기화: 새 ID
- 한 SPA 실행 중 페이지 이동: 같은 ID

따라서 현 값은 “방문 세션”보다 **“RUM 실행 세션”**에 가깝습니다. OpenTelemetry의 세션 정의도 일반적으로 inactivity 또는 session timeout 후 새 ID를 발급하는 모델입니다. [OpenTelemetry session semantic conventions](https://opentelemetry.io/docs/specs/semconv/general/session/)

## 3. 권장안과 화면 위치

### 권장안 하나

**RUM에 30분 inactivity 기반의 익명 방문 세션을 도입하고, KST 일 단위 exact distinct를 저장합니다.**

- 동의 이후에만 random UUID 생성
- first-party 저장소에 `id + lastSeen` 저장
- 30분 미활동 시 새 ID, 필요하면 24시간 hard cap
- 동의 철회 시 즉시 삭제
- BE에서는 HMAC 또는 고엔트로피 UUID 해시만 저장
- `apm_rum_session_day(day_kst, rum_app_id, session_hash)`로 일 dedupe
- 원본 해시는 30일 보존, 일별 숫자는 더 길게 보존
- RUM token을 backend microservice가 아니라 명시적인 `RUM application`에 연결

### 위치

**APM 개요 상단 KPI 카드**가 가장 적절합니다.

- 홈의 사용자 위젯은 MovesEye 계정과 Redis 로그인 세션을 보여 줍니다. `HomeSystemStatusService.java:97-118`, `HomeSystemStatusDto.java:41-50`
- 실시간 관제는 기본 15분 메모리 창이라 “오늘 누적”과 시간 범위가 맞지 않습니다. `ApmLiveProperties.java:70-71`, `:147-149`
- APM 개요에는 이미 KPI 카드용 widget 구조가 있습니다. FE `src/pages/application-monitoring/overview/widgets/registry.tsx:29-38`, `:138-148`
- 숨겨진 RUM 화면은 상세 drill-down 링크로 계속 사용할 수 있습니다. 사이드바만 제거됐고 화면·라우트는 유지됩니다. FE `src/layouts/app/SideNav.tsx:415-419`, `src/routes/routes.tsx:772-791`

권장 문구:

> **오늘 방문 세션 (KST)**  
> 오늘 00:00 KST 이후 RUM이 관측한 고유 브라우저 방문 세션입니다. 사람·계정·기기 수가 아니며, 30분 미활동 후 새 세션으로 계산됩니다.

현 스니펫 정책을 바꾸지 않는다면 라벨은 반드시 **`오늘 RUM 실행 세션`** 정도로 낮춰야 합니다.

## 4. 이미 이 숫자를 내는 API가 있는가

**정확한 “오늘 고유 세션” API는 없습니다.**

가장 가까운 API는 다음입니다.

- `GET /apm/rum/pages`  
  `ApmRumController.java:35-41`
- `GET /apm/rum/series`  
  `ApmRumController.java:63-69`

하지만 둘 다 `apm_rum_session_5m`에서 distinct하지 않고 `apm_rum_page_5m.sessions`를 합산합니다.

- 조회 대상 테이블: `RumQueryService.java:71-90`
- 페이지 합산: `RumQueryService.java:225-241`
- 시계열 합산: `RumQueryService.java:244-253`
- 응답이 스스로 밝히는 모드: `RumQueryService.java:25`

즉 `from=오늘 KST 자정`, `to=현재`로 기존 API를 호출해도 **오늘 고유 세션이 아니라 페이지·차원·5분 버킷별 distinct의 합**입니다. 신규 exact API 또는 일 단위 dedupe 테이블이 필요합니다.
