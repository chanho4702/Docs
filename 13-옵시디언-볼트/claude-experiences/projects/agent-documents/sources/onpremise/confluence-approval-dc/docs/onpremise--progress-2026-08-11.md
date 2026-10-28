# Confluence Approval DC 진행 기록 — 2026-08-11

## 이 문서를 읽는 법

이 문서는 **코드와 빌드 로그로 확인한 상태만** 기록한다.

이번 회차의 모든 기능은 컴파일과 단위 테스트까지만 확인했다.
**브라우저나 실제 Confluence 데이터로 인수 검증한 항목은 하나도 없다.**
"구현 완료"는 코드가 존재하고 빌드가 통과한다는 뜻이지 화면에서 동작한다는 뜻이 아니다.
실제 동작 확인이 필요한 항목은 전부 `아직 인수 검증하지 않은 경로`에 있다.

이번 회차 변경은 전부 `approval-confluence9`와 `approval-domain`에만 적용했다.
`approval-confluence10`은 손대지 않았으므로 두 adapter는 현재 벌어져 있다.

## 검증 기준선

JDK 21 toolchain과 Maven 3.9.16으로 `mvn -B -pl approval-confluence9 -am verify` 실행:

```text
BUILD SUCCESS
approval-domain      : 21건
approval-confluence9 : 34건
```

C9 plugin JAR에 nested `approval-domain-0.1.0-SNAPSHOT.jar` 포함을 확인했다.

## 구현 완료 (빌드·단위 테스트까지)

### 승인 도메인

- `REJECTION_REASON_REQUIRED` 오류 코드와 반려 사유 필수 정책을 추가했다.
  사유가 없거나 공백뿐이면 상태를 `PENDING`으로 유지하고 감사 이벤트도 남기지 않는다.
  실패한 반려 시도는 기록 대상이 아니다.
- 기존 `reject(...)` 시그니처는 "사유 필수 아님"으로 위임하는 overload로 유지했다.
  기존 17건에 4건이 더해져 21건이다.

### 승인 업무함

- `내 승인 대기` / `내 요청` / `내가 처리한 건` 3-tab.
- 상단 summary metric 4개는 탭과 무관하게 전체 집계로 고정한다.
  페이지 로드 시 받은 목록을 캐시해 탭 전환은 재요청 없이 필터링한다.
- 표 컬럼: 대상(페이지 제목) / 상태 / 요청자 / 요청 시각 / 마감일 / Flow / 열기.
- 행 펼침 상세에 승인자별 결정(미결정자 포함)과 감사 타임라인을 표시한다.
- 모든 동적 DOM 삽입은 `textContent`와 DOM API로만 처리한다.
  이전에는 서버 데이터를 `innerHTML` 문자열 연결로 넣고 있었다.

### REST 응답

- 요청·수정·마감 시각, 요청자·승인자 표시 이름, 페이지 제목, Flow 식별자·이름,
  승인자별 결정, 감사 이벤트, 현재 사용자의 결정(`myDecision`), `dueSoon`을 반환한다.
- 문자열 조립 방식을 `ApprovalJson` writer로 통일했다.
  제어문자·유니코드 이스케이프를 포함한다.
- `/mine`, `/mine/requested`는 user key와 username 양쪽을 조회해 id 기준으로 dedupe하고
  `updatedAt` 내림차순으로 정렬한다.
- **VIEW 권한이 없는 페이지의 요청은 목록에서 제외한다.** 이전에는 권한 없는 페이지의
  요청도 그대로 반환하는 누수가 있었다.

### 승인 Flow

- 생성·수정·활성 토글·삭제 REST API. 모두 서버에서 관리자 권한을 검증한다.
- Flow를 삭제해도 이미 그 Flow로 만들어진 요청은 건드리지 않는다.
  요청의 `flowId`는 남고 `flowName`만 null이 된다. 감사 기록 보존이 우선이다.
- 관리자 화면에 인라인 편집, 활성 토글, 5초 뒤 원복되는 2단계 삭제 확인을 붙였다.
- 요청이 어떤 Flow로 만들어졌는지 AO `APR_REQ.FLOW_ID`에 저장한다.
  adapter 데이터이므로 domain aggregate와 `ApprovalRequestRepository` 인터페이스에는 넣지 않았다.

### 그룹 승인자

- 직접 요청과 Flow 양쪽에서 Confluence 그룹을 승인자로 지정할 수 있다.
- **그룹은 요청 생성 시점에 활성 구성원을 Confluence user key로 펼쳐 snapshot한다.**
  요청 생성 후 그룹 구성원이 바뀌어도 기존 요청의 승인자는 바뀌지 않는다.
  승인 자격이 사후에 변하면 감사 기록이 무의미해지기 때문이다.
- 비활성 사용자는 제외한다. 존재하지 않는 그룹은 `400`으로 막는다.
- 그룹 출처를 `APR_APV.VIA_GROUP`에 보존하고 응답 `decisions[].viaGroup`으로 노출한다.
  `save(request)`가 `APR_APV` 행을 매번 지우고 다시 만들므로,
  기존 `VIA_GROUP`을 읽어두고 재생성 시 복원한다. 승인·반려를 반복해도 유실되지 않는다.
- 그룹만 지정된 Flow는 저장 시점에 최종 승인자 수를 확정할 수 없다.
  따라서 저장 시에는 `minimumApprovals >= 1`만 검증하고,
  **요청 생성 시점에** 펼친 결과로 최소 인원을 검증한다.
  사용자만 지정된 Flow는 기존대로 저장 시점에 함께 검증한다.

### 앱 전역 설정

SAL `PluginSettingsFactory` 기반. 값이 없거나 파싱에 실패하거나 범위를 벗어나면
읽는 시점에 기본값으로 대체하고 예외를 던지지 않는다.

| 설정 | 기본값 |
|---|---|
| 기본 마감일 (`defaultDeadlineDays`) | 0 (마감일 없음) |
| 만료 sweep 주기 (`expirySweepIntervalMinutes`) | 10분 |
| 마감 임박 기준 (`dueSoonThresholdHours`) | 24시간 |
| 반려 사유 필수 (`rejectionReasonRequired`) | false |
| 상태 표시명 4종 | 승인 대기 / 승인 완료 / 반려 / 만료 |

- 마감일 우선순위: 명시적 `expiresAt` > Flow의 `defaultDeadlineDays` > 전역 설정 > 없음.
- `GET /approvals/settings`는 로그인 사용자면 읽을 수 있다(표시용 값).
  `POST`는 관리자만 가능하다.
- 상태 표시명은 관리자가 입력한 문자열이 `<script>` 블록에 주입되는 경로이므로
  `ApprovalJson.escapeForScript()`로 `<`, `>`, `&`를 유니코드 이스케이프한다.

### 마감 만료 scheduler

- `ExpirySweepScheduler`가 주기적으로 domain의 `ApprovalWorkflowService.expireDueAll()`만 호출한다.
  만료 전이와 `EXPIRED` 감사 이벤트는 domain이 처리하며 adapter에서 재구현하지 않는다.
- **`RunMode.RUN_ONCE_PER_CLUSTER`.** Data Center에서 node마다 실행되면
  같은 요청을 여러 node가 동시에 만료시켜 중복 감사 이벤트가 생긴다.
- `JobId`·`JobRunnerKey`를 상수로 고정하고 등록 전에 `unscheduleJob`을 호출한다.
  `@PreDestroy`에서 job과 runner를 모두 해제한다. Quick Reload를 반복해도 job이 쌓이지 않는다.
- 초기화는 `@PostConstruct`에서 하고 실패해도 예외를 밖으로 던지지 않는다.
  생성자에서 외부 서비스를 잡으면 컴포넌트 생성 자체가 실패해 연쇄로 번진다.
- 설정 저장 시 job을 재등록한다. 재등록에 실패해도 **설정 저장은 `200`으로 응답**하고
  응답의 `sweepRescheduled: false`와 관리자 화면 안내로 알린다.
  저장은 성공했는데 500이 나가면 관리자가 저장 실패로 오해한다.
- 마감 임박(`dueSoon`)은 응답 시점에 계산하는 파생 값이며 저장하지 않는다.
  AO 컬럼으로 두면 시간이 지나면서 값이 썩는다.

### 콘텐츠 영역 macro

- macro parameter `key`로 `regionKey`를 명시적으로 지정한다.
- `key`가 없으면 본문만 렌더링하고 승인 UI를 그리지 않으며 작성자에게 안내를 표시한다.
- 같은 페이지에 같은 `key`가 둘 이상이면 경고를 표시한다.
  방치하면 두 영역이 같은 승인을 공유하게 된다.
- 영역별로 상태, 승인자별 결정, 최소 인원, 마감일, 감사 타임라인을 렌더링한다.
  상태 표시명은 전역 설정에서 읽는다.
- **렌더링은 저장소를 변경하지 않는다.** `findOpenRequest`는 lazy expiration으로
  저장을 일으킬 수 있어 렌더링 경로에서 쓰지 않고, 읽기 전용 조회를 따로 만들었다.
  그 조회는 요청·승인자·감사 이벤트를 각 한 번씩 총 세 번 읽는다.
- 한 페이지 렌더링 안에서 전역 설정은 한 번만 읽는다.
  `ConversionContext` property로 macro 인스턴스 간에 공유한다.
  전역 TTL 캐시는 쓰지 않았다 — 여러 node에서 설정 반영이 어긋나는 문제가 생긴다.
- 페이지 content version이 오르면 `expireForPageVersion`이 해당 페이지의 모든 요청을
  순회하므로 영역 요청도 함께 만료된다.

### 알림 outbox

감사 이벤트를 알림의 원장으로 쓴다. `APR_EVT`는 이미 append-only이고 고유 `EVENT_ID`를
가지므로, 알림 행을 `(EVENT_ID, RECIPIENT_KEY, CHANNEL)`로 유일하게 만들면
적재가 여러 번 실행돼도 중복 발송이 없다. 상태 변경과 알림 적재를 따로 쓰는 방식은
그 사이에서 프로세스가 죽으면 알림이 사라지거나 유령 알림이 남으므로 쓰지 않았다.

- AO `APR_NOTIF`: 이벤트 id, 요청 id, 수신자, 채널, 상태, 시도 횟수,
  다음 시도 시각, 마지막 오류, 읽음 시각.
- 수신자 규칙: `REQUESTED` → 모든 승인자, `APPROVED` → 요청자,
  `REJECTED`·`EXPIRED` → 요청자 + 아직 결정하지 않은 승인자.
  **행위자 본인은 항상 제외한다.** 자기가 누른 승인을 자기에게 알리지 않는다.
- `NotificationDrainScheduler`가 `PENDING` 행을 최대 50건씩 발송한다.
  실패하면 지수 백오프(상한 1시간)로 미루고, 5회에 도달하면 `FAILED`로 안착시킨다.
  영원히 재시도하는 큐는 장애 시 시스템을 망친다.
- 한 건의 실패가 같은 batch의 나머지를 막지 않도록 행마다 개별 처리한다.
- **알림 적재 실패가 승인·반려를 실패시키지 않는다.** `enqueueSafely`로 감싸
  로그만 남기고 정상 응답한다. 알림이 안 가는 것보다 승인이 실패하는 게 더 나쁘다.
- drain job도 `RUN_ONCE_PER_CLUSTER`다. node마다 돌면 같은 알림이 중복 발송된다.

### 알림 채널

- **in-app**: `GET /approvals/notifications`는 **로그인 사용자 본인 것만** 반환한다.
  파라미터로 남의 알림을 읽을 수 없다. VIEW 권한이 없는 페이지의 알림은 응답에서 제외한다.
  알림을 통해 접근 권한 없는 페이지의 존재가 드러나면 안 된다.
  업무함에 읽지 않은 개수와 목록을 표시하고 읽음 처리를 지원한다.
- **email**: Confluence `MailQueue`/`SingleMailQueueItem`으로만 큐잉한다.
  직접 SMTP를 열지 않는다. 관리자가 제어할 수 없는 발송 경로를 만들지 않기 위해서다.
  본문은 plain text이고 Confluence base URL 기반 절대 페이지 URL을 포함한다.
  이메일 주소가 없거나 비활성인 사용자는 **적재 단계에서 제외한다.**
  행을 만들어놓고 매번 실패시키면 재시도만 쌓인다.
- in-app과 email은 별개 행이므로 한쪽 실패가 다른 쪽에 영향을 주지 않는다.
- **큐 적재 성공은 실제 도달 보장이 아니다.** `SENT`는 "메일 큐에 넣었다"는 뜻이다.

### 마감 임박 알림

- 만료 sweep과 같은 cluster 단일 실행 job에서 처리한다.
- 대상은 `PENDING`이고 마감이 `dueSoonThresholdHours` 이내인 요청,
  수신자는 **아직 결정하지 않은 승인자**와 요청자다.
- 마감 임박은 감사 이벤트가 없어서 `EVENT_ID` 기반 멱등 장치가 그대로 통하지 않는다.
  sweep이 1분마다 돌면 마감 24시간 전부터 1440번 나갈 수 있다.
  그래서 `due-soon:<requestId>:<expiresAt epoch>` 결정적 합성 키를 쓴다.
  마감일이 변경되면 키도 바뀌어 자연스럽게 다시 알린다.
- `ApprovalEventType`에 "임박" 타입을 추가하지 않았다. 상태 전이가 아니라
  시간에 따라 변하는 파생 조건이고, 감사 로그는 사실 기록이기 때문이다.

### 알림 설정

| 설정 | 기본값 |
|---|---|
| 알림 사용 (`notificationsEnabled`) | true — 상위 스위치 |
| email 알림 (`emailNotificationsEnabled`) | **false** |
| 마감 임박 알림 (`dueSoonNotificationsEnabled`) | true |
| drain 주기 (`notificationDrainIntervalMinutes`) | 1분 |
| 최대 재시도 (`notificationMaxAttempts`) | 5 |

- email 기본값이 `false`인 이유: 메일 설정이 안 된 서버에서 앱을 켰을 때
  실패 알림이 쌓이지 않게 한다. 관리자가 명시적으로 켜야 한다.
  관리자 화면에서 켤 때 SMTP 미설정이면 경고를 표시한다.
- `notificationsEnabled`가 `false`면 새 알림을 적재하지 않고 drain도 멈춘다.
  이미 적재된 `PENDING` 행은 남겨둔다. 설정을 되돌리면 밀린 알림이 나가는 편이
  조용히 버리는 것보다 낫다.

## 남은 작업

- **승인자 편집 권한을 적용하는 API** — 설정 항목만 만들면 governing할 기능이 없어
  죽은 config가 되므로, 승인자 변경 API와 함께 구현해야 한다
- **Confluence 10 adapter 동등 구현 및 호환성 검증** — 이번 회차 변경이 전부 C9에만
  들어가 두 adapter가 벌어져 있다. C9 기능이 안정된 뒤 한 번에 이식하는 편이
  같은 포팅을 반복하지 않는다.
  **이식 작업에는 C10 빌드가 필요하고, 그 위험이 대부분 컴파일 단계에 있다.**
  그런데 C9 개발 서버가 떠 있으면 C10 빌드를 Quick Reload가 집어들 수 있고,
  두 adapter는 plugin key가 `kr.dmove.confluence.approval`로 같아서
  실행 중인 C9 인스턴스가 C10 빌드로 교체될 수 있다.
  **C10 작업은 반드시 C9 서버를 내린 상태에서 시작한다.**

## 아직 인수 검증하지 않은 경로

Quick Reload 후 확인해야 할 항목이다. 위 "구현 완료"는 전부 빌드까지만 확인한 상태다.

### 업무함·목록·권한

- [ ] 세 탭의 목록, summary metric 고정, 로컬 시간 포맷, 마감 강조, 상세 펼침, 빈 상태
- [ ] `/mine`, `/mine/requested`, 단건 조회의 VIEW 권한 필터를 실제 계정·페이지 권한으로 확인
- [ ] 표시 이름·페이지 제목·반려 사유에 HTML을 넣어도 업무함에서 실행되지 않는지
- [ ] 기존에 username으로 저장된 승인자 행이 있어도 표시 이름이 정상인지
      (user key / username 양쪽 해석 fallback)

### Flow·그룹

- [ ] Flow로 요청 생성 후 `flowId`/`flowName` 표시, 비활성화, 수정, 삭제 후 기존 요청 보존
- [ ] 비관리자 계정으로 Flow 관리 API가 모두 403인지
- [ ] 그룹을 승인자로 지정해 요청 생성 시 활성 구성원만 user key로 펼쳐지는지
- [ ] 요청 생성 후 그룹 구성원을 변경해도 기존 요청의 승인자가 그대로인지 (snapshot 검증)
- [ ] 승인·반려를 반복해도 `VIA_GROUP`이 유실되지 않는지
- [ ] 그룹 포함 Flow에서 최소 인원 검증이 요청 생성 시점에 동작하는지

### 전역 설정

- [ ] 관리자 화면에서 설정을 저장하고 다시 열었을 때 보존되는지
- [ ] 비관리자 `POST /approvals/settings`가 403인지, 범위 밖 값이 400인지
- [ ] 마감일 우선순위(명시 > Flow > 전역 > 없음)가 실제 페이지에서 맞는지
- [ ] 반려 사유 필수 설정에서 빈 사유 반려가 400이고 사유 있는 반려는 정상인지
- [ ] 업무함과 페이지 패널이 설정한 상태 표시명을 쓰는지
- [ ] 상태 표시명에 `</script>`를 넣어도 페이지가 깨지지 않는지

### scheduler

- [ ] cluster에서 만료 sweep이 한 node에서만 실행되는지
- [ ] plugin disable/uninstall 후 job이 남지 않고, Quick Reload를 반복해도 누적되지 않는지
- [ ] 주기 설정을 바꾸면 서버 재기동 없이 새 주기가 적용되는지
- [ ] scheduler가 초기화되지 않은 상태에서 설정을 저장하면 `200`과 함께 안내가 뜨는지

### 콘텐츠 영역 macro

- [ ] `key` 없는 macro가 본문과 안내만 렌더링하고 승인 UI를 안 그리는지
- [ ] 같은 페이지 같은 `key`에 경고가 뜨고, 다른 `key`는 독립 요청을 만드는지
- [ ] 같은 `regionKey`의 진행 중 요청이 409이고 다른 `regionKey`는 독립인지
- [ ] 영역에서 승인자·그룹·Flow를 선택해 요청·승인·반려가 되는지
- [ ] VIEW 권한 없는 계정에 영역 승인 정보가 렌더링되지 않는지
- [ ] 페이지 편집으로 content version이 오르면 영역 요청도 `EXPIRED`가 되고
      감사 이벤트가 남는지
- [ ] 영역 macro를 여러 개 배치했을 때 설정 조회가 렌더링당 한 번인지

### 알림

- [ ] Quick Reload 후 `APR_NOTIF` schema가 생성되는지
- [ ] 요청·승인·반려·만료에서 알림이 적재되고, **행위자 본인에게는 가지 않는지**
- [ ] 같은 이벤트로 적재가 여러 번 실행돼도 알림이 하나인지 (멱등)
- [ ] 업무함의 읽지 않은 개수, 목록, 읽음 처리
- [ ] 다른 사용자의 알림을 조회할 수 없는지
- [ ] VIEW 권한 없는 페이지의 알림이 목록에서 제외되는지
- [ ] 발송 실패 시 백오프로 재시도하고, 5회 후 `FAILED`로 멈추는지
- [ ] 한 건의 실패가 같은 batch의 다른 알림 발송을 막지 않는지
- [ ] `notificationsEnabled = false`로 적재와 drain이 모두 멈추는지,
      다시 켜면 밀린 `PENDING`이 나가는지
- [ ] SMTP 미설정 상태에서 email을 켤 때 관리자 화면 경고가 뜨는지
- [ ] 이메일 주소가 없거나 비활성인 사용자에게 email 행이 적재되지 않는지
- [ ] 메일 본문의 절대 URL이 실제 base URL로 생성되는지
- [ ] 마감 임박 알림이 **수신자별로 한 번만** 나가는지 (sweep 반복 실행)
- [ ] 마감일을 변경하면 마감 임박 알림이 다시 나가는지
- [ ] 이미 결정한 승인자에게 마감 임박 알림이 가지 않는지
- [ ] cluster에서 drain과 마감 임박 sweep이 한 node에서만 실행되는지

### 빌드

- [ ] `scripts/build.ps1 -Target confluence9`은 실행 중인 Confluence가
      `target/container`의 JAR을 잠가 `clean` 단계에서 실패한다.
      서버를 내린 상태에서 스크립트 전체 성공을 재확인

## 최근 주의사항

### 식별자

- `/approvals/users`의 `key`는 username이 아니라 **Confluence user key**여야 한다.
  한 번 username을 반환하도록 회귀했다가 되돌렸다. 승인자는 username, `requesterKey`는
  user key로 저장되어 식별자가 섞이고 표시 이름이 깨지는 문제였다.
- `APR_APV.ACTOR_KEY`에 username과 user key가 섞여 있을 수 있으므로
  `displayName` 조회는 `getUserByKey` → `getUserByName` 양쪽 fallback을 유지한다.
- 그룹을 펼칠 때도 반드시 user key로 펼친다.

### 설계 경계

- 상태 전이와 검증 규칙은 `approval-domain`에서만 바꾼다. adapter에서 재구현하지 않는다.
- Flow 연결(`FLOW_ID`)과 그룹 출처(`VIA_GROUP`)는 adapter AO 데이터다.
  domain aggregate나 `ApprovalRequestRepository` 인터페이스에 넣지 않았다.
- 영역 `regionKey`는 body 내용·macro 위치·macro instance id에서 유도하지 않는다.
  본문 해시는 편집마다 바뀌고 instance id는 페이지 복사 시 재발급되어
  이전 승인 요청과 감사 기록을 고아로 만든다. 작성자가 지정한 `key`만 쓴다.
- 감사 이벤트는 append-only다. "마감 임박"은 시간에 따라 변하는 파생 조건이므로
  이벤트 타입으로 추가하지 않았다.

### 빌드·개발

- C9 Maven 실행은 JDK 21 toolchain을 써야 한다. Java 17은 enforcer가 막는다.
- 실행 중인 Confluence가 `target/container` 파일을 점유하면 `clean`이 실패한다.
  `clean` 없이 `verify`로 검증한다.
- C9 서버 실행 중에 C10 artifact를 빌드하면 Quick Reload가 C10 JAR을 집어들 수 있다.
  C10 빌드는 분리한다.
- Java 파일은 개별 import, statement 한 줄, 제어문 중괄호, 4칸 들여쓰기를 유지한다.
  구현 도중 파일이 한 줄로 압축되어 재포맷한 이력이 있다.
- 테스트에 Mockito를 쓰지 않는다. 좁은 인터페이스의 fake 구현을 직접 작성한다.
  JAX-RS `Response` 검증용 Jersey는 test scope로만 들어 있다.
- 기존 `C:\Onpremise\addon`은 별도 Jira 플러그인이므로 수정하지 않는다.
