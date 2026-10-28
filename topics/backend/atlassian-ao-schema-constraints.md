# Atlassian Active Objects 스키마 제약과 폭발 반경

> 2026-08-10, `C:\Onpremise\confluence-approval-dc` (Confluence DC 승인 앱) 장애에서 정리.

## 한 줄 교훈

**AO 엔티티 하나의 스키마 위반은 그 엔티티만 죽이지 않는다. 플러그인의 `ActiveObjects` 주입 전체가 실패해서, 그 저장소를 쓰는 모든 화면·API·매크로가 동시에 죽는다.**

## 무슨 일이 있었나

새로 추가한 알림 outbox 엔티티에 이렇게 썼다.

```java
@StringLength(1000)     // ← AO는 이 값을 허용하지 않는다
String getLastError();
```

증상은 서로 무관해 보이는 두 곳에서 동시에 나타났다.

- 승인 업무함 `GET /approvals/mine` → HTTP 500
- 페이지의 `approval-region` 매크로 → `Error rendering macro`

둘 다 알림 기능과 아무 상관이 없다. 그런데 같은 예외였다.

```text
com.atlassian.activeobjects.internal.ActiveObjectsInitException: bundle [...]
Caused by: net.java.ao.ActiveObjectsConfigurationException:
    @StringLength must be <= 450 or UNLIMITED (....ApprovalNotificationEntity.getLastError)
```

AO는 플러그인의 **모든** 엔티티를 한 번에 `SchemaGenerator.migrate()`로 훑는다.
하나가 파싱에서 터지면 마이그레이션 전체가 실패하고 `ActiveObjects` 빈이 만들어지지 않는다.
그래서 "알림 테이블 하나 잘못 선언" → "앱의 모든 저장소 접근 불가"가 된다.

## 규칙

- `@StringLength`는 **450 이하 또는 `StringLength.UNLIMITED`** 만 가능하다. 중간값(1000 등)은 없다.
  450은 여러 DB의 인덱스 가능한 VARCHAR 한계에 맞춘 값이다.
- 길이를 못 정하는 자유 텍스트(예외 메시지, 사유, 본문)는 그냥 `UNLIMITED`로 간다.
  어설프게 450으로 줄이면 저장 시 잘림/SQL 오류를 앱이 직접 막아야 한다.
- 단 `UNLIMITED`는 CLOB/TEXT라 **정렬·where 조건에 쓰지 말 것.** 조회 키로 쓸 컬럼은 450 이하로 설계한다.

## 진단 경로 (재사용 가능)

1. REST가 `{"statusCode":500, "message":"... referral number: <uuid>"}`를 주면 그 uuid로 로그를 찾는다. 스택이 통째로 붙어 있다.
2. AMPS `confluence-run.log`는 **UTF-16**이라 ripgrep/grep이 그냥은 안 먹는다.
   `Get-Content ... | Out-File -Encoding utf8` 로 변환하고 검색한다.
3. "서로 무관한 기능이 동시에 깨졌다"는 건 대개 **공유 인프라 1개**(AO, 설정, OSGi 서비스)가 죽었다는 신호다.
   기능별로 원인을 따로 찾지 말고 공통 의존부터 본다.

## 왜 빌드에서 못 잡았나

`@StringLength` 검증은 **컴파일이 아니라 런타임 스키마 마이그레이션 시점**에 일어난다.
단위 테스트가 AO를 fake로 대체하고 있으면 영원히 안 걸린다.
→ 실제 인스턴스에 배포해서 엔티티를 한 번 건드려 보기 전까지 "빌드 통과"는 이 계열 결함을 전혀 증명하지 못한다.
같은 결의 함정: [[2026-08-04-code-splitting-tradeoff]] (로컬 빌드 성공이 CI 성공이 아니었던 건).

## 형제 결함: text block + `formatted()`의 리터럴 `%`

같은 날 AO를 고치고 나니 업무함 **화면**(`/plugins/servlet/approval-inbox`)이 여전히 500이었다.
이번엔 완전히 다른 원인이었다.

```text
java.util.UnknownFormatConversionException: Conversion = ';'
    at java.lang.String.formatted(String.java:4441)
    at ...ApprovalInboxServlet.render(ApprovalInboxServlet.java:276)
```

HTML 전체를 text block에 넣고 `%s` 4개를 `formatted(...)`로 채우는 구조였는데,
CSS의 `table{width:100%;...}`를 Formatter가 포맷 지정자 `%;`로 읽었다.

- 고치는 법은 리터럴 `%` → `%%` 한 글자다. 문제는 **CSS/JS를 편집할 때마다 다시 밟는다**는 것.
- `%` 위험 지대: `width:100%`, `@media`, JS 나머지 연산자, `encodeURIComponent` 결과.
- 근본 대비는 **render()를 한 번 호출해보는 단위 테스트**다. private이면 package-private으로 낮추고
  같은 패키지에 테스트를 둔다. 포맷 오류·이스케이프 누락이 빌드에서 잡힌다.

## 이 두 건의 공통 교훈

둘 다 **컴파일러가 볼 수 없는 문자열/애노테이션 값**이 런타임에 파서를 만나 터졌다.
`BUILD SUCCESS`와 단위 테스트 전건 통과가 둘 다 아무것도 증명하지 못했다.
→ 이런 계열은 "실제로 한 번 실행하는 테스트"를 만들어야 빌드가 방어선이 된다.

또 하나: **증상 하나를 고쳤다고 장애가 끝난 게 아니다.**
AO 복구 후 REST(`/mine`)는 200이었지만 그 REST를 쓰는 화면은 별개 이유로 여전히 죽어 있었다.
API가 살았는지가 아니라 **사용자가 여는 URL**로 확인해야 한다.

## 관련

- [[nestjs-operations]] — 런타임에만 드러나는 배선 결함이라는 점에서 같은 부류
