# Confluence Approval DC 진행 기록 — 2026-08-10 (2회차)

## 이 문서를 읽는 법

앞선 회차 문서와 같은 규칙을 따른다. **코드와 실행 결과로 확인한 것만** 적는다.
이번 회차는 이전과 달리 **실행 중인 Confluence 9.2 인스턴스에서 REST와 화면으로 확인한 항목이 있다.**
그래서 "빌드까지 확인"과 "실제로 동작 확인"을 구분해 적는다.

변경은 전부 `approval-domain`과 `approval-confluence9`에만 적용했다.
`approval-confluence10`은 손대지 않아 두 adapter의 간극이 더 벌어졌다.

## 검증 기준선

문서를 덮는 시점의 작업 트리 기준이다.

```text
approval-domain      : 44건 통과
approval-confluence9 : 48건 통과
BUILD SUCCESS
```

### 이 문서가 다루지 않는 변경

같은 작업 트리에 **cluster lock**(`ApprovalLockService`, `ApprovalLockNames`,
`ClusterApprovalLockService`)이 함께 들어와 있다. 이번 회차에서 한 작업이 아니므로
아래 절에서 다루지 않는다. 도메인 테스트 44건 중 3건이 그쪽 것이다.

→ 배경과 판단 근거는 **`progress-2026-08-10-3.md` 2항**("다중 node에서 승인이 유실되는 결함")에 있다.

두 회차의 변경은 같은 파일을 건드리지만 층이 다르다.
3회차는 `ApprovalWorkflowService`의 **상태 전이 진입점을 lock으로 감싸고**,
이번 회차는 그 안에서 도는 **`ApprovalRequest`의 단계 규칙**을 바꿨다.
합친 상태에서 도메인 44건·C9 48건이 모두 통과한다.

---

## 1. 장애 2건 복구

### AO 스키마 위반으로 앱 전체가 멈춰 있었다

`ApprovalNotificationEntity.getLastError()`에 `@StringLength(1000)`이 붙어 있었다.
AO는 **450 이하 또는 UNLIMITED**만 허용한다.

```text
ActiveObjectsConfigurationException:
  @StringLength must be <= 450 or UNLIMITED (...ApprovalNotificationEntity.getLastError)
```

AO는 플러그인의 모든 엔티티를 한 번에 마이그레이션하므로 **엔티티 하나가 걸리면
`ActiveObjects` 주입 자체가 실패한다.** 알림과 무관한 승인 업무함(`/mine`)과
`approval-region` 매크로가 같은 예외로 함께 죽어 있었다.

- 조치: `@StringLength(StringLength.UNLIMITED)`. 예외 메시지는 길이를 확정할 수 없고
  저장 시 truncate 로직도 없어 450으로 줄이지 않았다.
- 확인: `/mine` 500 → 200, 매크로 렌더링 오류 0건, `APR_NOTIF` 스키마 생성 성공.

### 업무함 화면이 500이었다 (별개 원인)

REST가 200이 된 뒤에도 `/plugins/servlet/approval-inbox`는 계속 500이었다.

```text
java.util.UnknownFormatConversionException: Conversion = ';'
  at String.formatted(String.java:4441)
  at ApprovalInboxServlet.render(ApprovalInboxServlet.java:276)
```

HTML 전체를 text block에 담고 `formatted(...)`로 채우는 구조라
CSS의 `table{width:100%;...}`를 Formatter가 지정자 `%;`로 읽었다.

- 1차 조치: `%` → `%%`.
- 최종 조치: 뒤에서 화면을 다시 만들 때 **토큰 치환으로 교체**했다(아래 7항).
  CSS를 늘릴 때마다 다시 밟을 함정이었다.

**두 건의 공통점**: 컴파일러가 볼 수 없는 문자열·애노테이션 값이 런타임 파서에서 터졌다.
`BUILD SUCCESS`와 단위 테스트 전건 통과가 아무것도 보장하지 못했다.

---

## 2. 순차 승인 도입 (설계 변경)

최소 승인 인원 방식을 걷어내고 **단계 순차 승인**으로 바꿨다.
지정한 순서가 곧 1·2·3단계이고, 앞 단계가 통과해야 다음 단계 차례가 된다.

### 도메인

- `ApprovalStep(order, approverKeys, requiredApprovals)` 신설.
- `ApprovalRequest`가 `List<ApprovalStep>`을 보유한다. `eligibleApproverKeys()`는 평탄화 결과다.
- `approve`/`reject` 모두 **현재 단계가 아니면 `APPROVER_STEP_NOT_REACHED`로 거부한다.**
  알림은 요청 시점에 전원에게 나가므로 차례가 아닌 승인자가 먼저 누르는 것은 정상 경로다.
- 앞 단계에 이미 나온 승인자는 뒤 단계에서 제거한다. 한 사람이 두 번 결정하면
  그 승인이 어느 단계의 것인지 감사 기록이 말할 수 없다.
- `minimumApprovals()`는 `sum(requiredApprovals)`로 재정의했다. 단계마다 한 명이면 곧 단계 수다.

### 기존 데이터 호환

최소 승인 인원으로 만들어진 요청은 **"전원이 든 단일 단계 + required = 최소 인원"** 으로 복원한다.
`APR_APV.STEP_ORDER`가 0인 행이 그 표식이다. 저장 시에도 단계가 하나이면서 두 명 이상을
요구하는 요청은 순서를 붙이지 않고 0으로 남긴다. 순서를 붙이면 다음 복원 때
"한 명만 승인하면 통과"로 읽혀 **통과 조건이 조용히 느슨해진다.**

### 저장소

- `APR_APV.STEP_ORDER`, `APR_APV.STEP_REQUIRED` 추가.
- 승인자 조회에 `order("STEP_ORDER ASC, ID ASC")`를 넣었다.
  **이전에는 정렬 없이 읽어 순서 보장이 아예 없었다.** 순차 승인에는 치명적이다.
- `APR_FLOW_P.STEP_ORDER` 추가. Flow도 순서를 저장한다.

### REST 계약

```text
POST /approvals?...&steps=user:alice;group:leads;user:bob
POST /approvals/flows?name=...&steps=user:alice;group:leads&defaultDeadlineDays=3
```

세미콜론 하나가 단계 하나다. 접두사 없는 토큰은 사용자로 본다(`ApprovalStepSpec`).
응답에 `steps[]`, `stepCount`, `currentStepOrder`, `myStepOrder`, `myTurn`,
`decisions[].stepOrder`를 추가했다.

`minimumApprovals`/`approverKeys`/`approverGroups` 파라미터는 하위 호환으로 남아 있고,
`steps`가 오면 무시된다. 단계 순서가 없는 기존 Flow는 최소 인원 경로를 그대로 탄다.

### 실제 인스턴스 확인

| 확인 | 결과 |
|---|---|
| 2단계 요청 생성 | `stepCount:2, currentStepOrder:1, myTurn:true` |
| 1단계 승인 | `PENDING` 유지, `currentStepOrder:2`, 1단계 `passed:true` |
| 차례 아닌 승인자 승인 | 409 `"아직 2단계 차례가 아닙니다. 현재는 1단계입니다."` |
| 차례 아닌 승인자 반려 | 409 (동일 차단) |
| 그룹 단계 | 구성원 1명 승인 → 다음 단계로 전진 |
| 순차 Flow 적용 | `sequential:true`, 마감일 3일 자동 적용 |

---

## 3. 승인 요청 UI: 상단 버튼 + 모달

- 페이지 상단 액션(`system.content.button`, 편집 버튼과 같은 섹션)에 `승인 요청` web-item 추가.
  처음 `system.content.action/primary`에 넣었는데 그건 **`···` 더보기 메뉴 안**이었다.
- 요청 form을 패널 인라인에서 모달로 옮겼다. 상태 박스는 유지하고 단계 진행을 표시한다.
- 모달은 **탭 2개**: `승인자 직접 지정` / `승인 Flow 사용`.
  제출은 **보고 있는 탭 기준**으로만 값을 보낸다.
- Flow를 고르면 그 Flow의 단계와 담당자를 미리 보여준다.
- 진행 중인 요청이 있어도 버튼과 모달을 렌더링하고 "이미 진행 중" 안내를 띄운다.
  버튼이 조용히 사라지면 왜 못 만드는지 알 길이 없다.
- 패널이 승인자를 user key 대신 표시 이름으로 보여준다. 캐시는 렌더링 1회 범위로만 둔다
  (panel은 싱글턴이라 필드에 담으면 이름이 썩는다).

---

## 4. 콘텐츠 영역 macro의 `key`를 선택 사항으로

`key`를 적지 않으면 그 페이지의 `default` 영역을 쓴다.

`regionKey`는 `pageId`와 짝으로만 의미가 있어 페이지가 다르면 충돌하지 않고,
페이지를 복사해도 새 페이지의 기본 영역이 될 뿐이다. 본문 해시나 macro instance id처럼
편집·복사 때 값이 바뀌어 승인 기록을 고아로 만드는 문제가 없다.
한 페이지에 기본 영역을 둘 이상 두면 기존 중복 경고가 잡는다.

---

## 5. 편집 정책: 알림과 승인 버전

편집을 **막지 않고 승인을 무효화하는** 현재 방식을 유지하기로 했다(옵션 설계는 6항).
대신 무슨 일이 일어났는지 드러나게 했다.

- 만료 사유를 셋으로 구분: `CONTENT_VERSION`(승인 중 수정) /
  `CONTENT_VERSION_AFTER_APPROVAL`(승인 후 수정) / `DEADLINE`.
- `approvedContentVersion()` — 승인이 완성된 시점의 content version.
  만료된 뒤에도 남는다. "어느 버전이 승인됐다가 무효가 됐는지"를 말할 수 있어야 한다.
- **편집으로 무효가 되면 이미 승인한 사람도 알림을 받는다.** 자기가 찍은 결재가 사라졌다.
  기존에는 미결정자에게만 갔다.
- 이메일 본문에 **"반려 사유: CONTENT_VERSION"** 이 찍히던 결함을 고쳤다.
  만료 사유와 반려 사유는 다른 값이고 문장도 다르다.
- 업무함·패널·매크로에 `v3 기준 승인`, `승인 후 수정됨 · 재승인 필요`를 표시한다.

실제 확인: 승인 완료 시 `approvedContentVersion:1`, 화면에 `v1 기준 승인` 렌더링.

---

## 6. 편집 잠금 설계 (문서만, 구현 없음)

`docs/approval-edit-policy.md`에 정리했다. 요약하면:

- `PageUpdateEvent`는 **사후 이벤트라 저장을 취소할 수 없다.** 막으려면
  `ContentPermissionManager`로 사전에 편집 제한을 걸어야 한다.
- Confluence 편집 제한은 **허용 목록**이라 "아무도 편집 못 함"을 표현할 수 없고,
  **관리자는 제한을 우회한다.** 잠금은 1차 방어, 만료는 최후 방어인 계층 구조여야 한다.
- 편집 제한은 페이지 단위뿐이라 **영역 승인과 맞지 않는다**(한 영역 때문에 페이지 전체가 잠긴다).
- 진짜 위험은 **해제 실패**다. `APR_LOCK` 원장에 원래 제한을 스냅샷으로 남기고
  재시도 job과 관리자 수동 해제를 함께 만들어야 한다.
- `LOCKED_FOR_ALL`을 쓰려면 **요청 취소(회수) 기능이 선행되어야 한다.** 지금은 없다.

---

## 7. 업무함·설정 화면 재작성

두 화면을 같은 디자인 체계로 다시 만들었다.

- 32px 괘선 배경, 모노스페이스 숫자(`tabular-nums`), 상태는 테두리 있는 도장형 배지,
  타임라인은 좌측 선 + 이벤트별 색 점.
- `prefers-color-scheme: dark` 대응. 웹폰트는 쓰지 않는다(온프레미스 DC는 외부 폰트 로딩이 막힐 수 있다).
- 업무함 헤더 우측에 **Confluence 이동 / 승인 설정** 아이콘 버튼. 설정 화면에는 반대로 **업무함** 버튼.
- 설정 화면을 **승인 설정 / Flow 설정 / 그룹 설정** 3개 메뉴로 분리.
- 업무함의 `String.formatted`를 **토큰 치환**으로 교체했다. 한 번의 정규식 순회로 바꾸므로
  사용자 이름에 토큰 문자열이 들어와도 재치환되지 않는다(테스트로 고정).

---

## 8. 승인 그룹을 1급 개념으로

`APR_GROUP` 엔티티 신설. 관리자가 등록한 그룹만 결재선에 올릴 수 있다.
Confluence 그룹 전체를 열어두면 검색 결과가 무의미해지고 의도하지 않은 그룹이 승인자가 된다.

| 항목 | 동작 |
|---|---|
| 등록/해제 | 등록 해제해도 **기존 요청은 영향 없음** (생성 시점에 구성원을 펼쳐 저장) |
| 전원 승인 | 그룹별 스위치. 켜면 그 단계는 구성원 전원이 승인해야 통과 |
| 표시 이름 | `confluence-users` → `전체 사용자`. 모달·패널·업무함에 공통 적용 |
| 구성원 미리보기 | 활성 구성원이 없으면 "결재선에 올려도 승인자가 만들어지지 않습니다" 경고 |

- `GET /approvals/groups` — 등록 그룹만 (일반 사용자)
- `GET /approvals/groups/directory` — Confluence 그룹 검색 (관리자, 등록 대상 고르기용)
- `GET|POST|DELETE /approvals/groups/registered` — 등록 관리 (관리자)
- `GET /approvals/groups/registered/{name}/members` — 구성원 미리보기

---

## 9. 미해결: Spring 컴포넌트가 생성되지 않는다

**`@Named`만 붙은 컴포넌트 세 개가 한 번도 인스턴스화된 적이 없다.**

| 컴포넌트 | 그동안 |
|---|---|
| `ApprovalPageUpdateListener` | 페이지를 편집해도 승인이 만료되지 않음 |
| `ExpirySweepScheduler` | 마감일이 지나도 자동 만료 안 됨 |
| `NotificationDrainScheduler` | **알림이 발송되지 않음** (outbox에 쌓이기만) |

- 원인: Atlassian Spring Scanner의 컴포넌트는 **lazy**다. 주입받는 곳이 없으면 생성되지 않는다.
  `META-INF/plugin-components/component`에 이름이 적혀 있어도 그건 "스캔됐다"는 뜻일 뿐이다.
- `atlassian-plugin.xml`에 `<component>`로 선언하는 길은 막혀 있다.
  `Atlassian-Plugin-Key`가 있으면 `contains a definition of component. This is not allowed`로 빌드가 실패한다.
- 조치: 세 클래스에 **`@ExportAsService`** 추가.
- **아직 검증되지 않았다.** QuickReload 반복 배포 중 아래 경고가 나온다.

```text
Ignoring the bean container that was just created for plugin kr.dmove.confluence.approval.
The plugin is in an invalid state, DISABLED ... Most likely, it was disabled due to a timeout.
```

플러그인은 결국 ENABLED가 되지만 그 사이 만들어진 빈 컨테이너가 폐기되어,
descriptor 모듈만 살아 있고 Spring 빈은 없는 **반쪽 상태**가 된다.
플러그인 disable→enable로도 풀리지 않았다.

→ **서버를 재시작해서 확인해야 한다.** 재시작 후에도 안 되면 `@ExportAsService`로는 부족하다는 뜻이므로
   리스너를 다른 등록 방식으로 옮겨야 한다.

---

## 아직 인수 검증하지 않은 경로

### 재시작 후 가장 먼저 볼 것

- [ ] 페이지 편집 → 진행 중 요청이 `EXPIRED`가 되고 사유가 `CONTENT_VERSION`인지
- [ ] 승인 완료된 요청을 편집 → 사유가 `CONTENT_VERSION_AFTER_APPROVAL`이고
      **이미 승인한 사람에게도** 알림이 가는지
- [ ] 알림 outbox가 실제로 drain되어 `SENT`가 되는지 (지금은 `PENDING`으로만 쌓인다)
- [ ] 마감일이 지난 요청이 sweep으로 만료되는지

### 브라우저로 확인할 것

- [ ] 모달 탭 전환, 승인자 추가·순서 변경(↑↓)·삭제, 그룹 검색 드롭다운 위치
- [ ] Flow 선택 시 단계·담당자 미리보기
- [ ] 업무함 3탭, 알림 목록, 행 펼침 상세, 다크 모드
- [ ] 설정 화면 3메뉴, 그룹 등록·구성원 미리보기·등록 해제

### 다인 계정이 필요한 것

- [ ] 그룹 **전원 승인**이 실제로 전원을 요구하는지 (현재 인스턴스는 계정이 admin 하나뿐이라
      전원 승인과 1명 승인이 구분되지 않는다. 도메인 단위 테스트로만 고정되어 있다)
- [ ] 2단계 승인자가 자기 차례에 실제로 승인할 수 있는지 (차단은 실측했으나 통과는 미실측)

### 그 밖에

- [ ] 최소 승인 인원으로 만든 **기존 요청**이 그대로 동작하는지 (실데이터가 없어 미실측)
- [ ] email 발송 (SMTP 미설정)
- [ ] `approval-confluence10` 이식 — 이번 회차 변경이 전부 C9에만 들어갔다

---

## 이번 회차에서 얻은 주의사항

- **AMPS는 의존 모듈 클래스를 `target/classes`에 풀어 둔다.** `.m2`가 최신이어도
  거기 남은 옛 클래스가 먼저 잡혀 "classpath는 맞는데 심볼이 없다"가 된다.
  서버가 떠 있으면 `clean`이 실패하므로 **그 패키지 디렉터리만 지운다.**
- **web-item의 `<link>`는 Velocity로 렌더링된다.** `#`은 지시자 시작 문자라
  페이지마다 `InfrastructureException`이 쌓인다. 실제 URL을 두고 JS가 가로채는 편이 안전하다.
- **XML 문자열로만 참조되는 클래스는 `Import-Package`에 직접 적어야 한다.**
  bnd는 바이트코드를 스캔하므로 web-item condition을 잡지 못한다.
  빠지면 모듈 하나 때문에 **플러그인 전체가 비활성화**된다.
- AMPS 로그(`target/confluence-run.log`)는 **UTF-16**이다. 검색 전에 변환한다.
- **"API가 200"이 "화면이 정상"은 아니다.** 이번에 REST만 보고 화면이 죽은 걸 놓쳤다.
  검증은 사용자가 여는 URL로 한다.
