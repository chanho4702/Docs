# Confluence 앱(P2/OSGi) 개발에서 반복해서 밟는 함정

> 2026-08-10, `C:\Onpremise\confluence-approval-dc` 순차 승인 기능 구현 중 정리.
> AO 스키마 쪽 함정은 [[atlassian-ao-schema-constraints]] 참고.

## 1. XML 문자열로만 참조되는 클래스는 `Import-Package`에 직접 써야 한다

`atlassian-plugin.xml`에 web-item 조건을 넣었더니 **플러그인 전체가 비활성화**됐다.

```text
PluginParseException: Unable to load the module's display conditions:
ClassNotFoundException: com.atlassian.confluence.plugin.descriptor.web.conditions.HasPageCondition
    not found by kr.dmove.confluence.approval.confluence9
```

pom의 `Import-Package`에 `*`가 있어도 소용없다. bnd는 **바이트코드를 스캔**해서 import를 만드는데,
condition 클래스는 XML 안에 문자열로만 있으니 참조로 잡히지 않는다. 직접 적어야 한다.

```xml
<Import-Package>
    com.atlassian.confluence.plugin.descriptor.web.conditions,
    ...
    *
</Import-Package>
```

같은 부류: `<context-provider class="...">`, descriptor의 `class=` 속성 전반.

**증상 인식법**: 모듈 하나가 잘못돼도 플러그인 전체가 `enabled:false`가 된다.
`rest/plugins/1.0/<key>-key`로 확인하고, 로그에서 `There was an error loading the descriptor '<모듈 이름>'`을 찾는다.

## 2. web-item의 `<link>`는 Velocity로 렌더링된다 — `#`을 쓰면 안 된다

JS로만 동작하는 버튼이라 `<link>#</link>`로 뒀더니:

```text
ERROR [web.model.ConfluenceWebLink] getDisplayableUrl
    Error getting displayable url from weblink dmove-approval-request-action
Caused by: InfrastructureException: Error occurred rendering template content
```

`#`은 Velocity 지시자의 시작 문자다. 페이지를 열 때마다 스택이 쌓인다.
링크에는 실제 URL을 두고 JS가 `preventDefault()`로 가로채는 편이 안전하다.

```xml
<link linkId="...">/pages/viewpage.action?pageId=$helper.page.id</link>
```

부수 효과로 JS가 죽어도 같은 페이지로 이동할 뿐이라 동작이 망가지지 않는다.

## 3. AMPS는 의존 모듈 클래스를 `target/classes`에 풀어 둔다 — stale 컴파일의 원인

멀티모듈에서 domain 모듈에 메서드를 추가했는데 adapter가 계속 "cannot find symbol"을 냈다.
`.m2`의 JAR에도, `dependency:build-classpath` 결과에도 새 메서드가 **있는데도** 실패했다.

원인은 `approval-confluence9/target/classes/kr/.../domain/` 에 **이전 빌드의 domain 클래스가 unpack**되어 있었고,
`target/classes`가 classpath 앞에 오기 때문이었다. (`Embed-Dependency`로 넣는 구조라 생긴 부산물)

- 정석은 `clean`인데, 개발 서버가 떠 있으면 `target/container`를 잠가 `clean`이 실패한다.
- 그래서 **그 디렉터리만 지운다**: `Remove-Item -Recurse target/classes/<의존모듈 패키지>`
- 교훈: "classpath는 맞는데 심볼이 없다"면 `target/classes` 안에 같은 패키지가 있는지 먼저 본다.

## 4. Spring Scanner 컴포넌트는 기본이 lazy — 아무도 안 쓰면 생기지도 않는다

이벤트 리스너와 스케줄러에 `@Named`만 붙여 두었더니 **한 번도 인스턴스화되지 않았다.**
생성자에서 `eventPublisher.register(this)`를, `@PostConstruct`에서 job 등록을 하는데
빈 자체가 안 만들어지니 페이지 편집 만료도, 마감 sweep도, 알림 발송도 조용히 동작하지 않았다.

- 원인: Atlassian Spring Scanner의 컴포넌트는 **lazy**다. 다른 빈이 주입받지 않으면 생성되지 않는다.
  descriptor에 `class=`로 걸린 panel·macro·servlet은 멀쩡히 동작해서 더 눈치채기 어렵다.
- `atlassian-plugin.xml`에 `<component>`로 선언하는 방법은 **막혀 있다**:
  `Atlassian-Plugin-Key`가 설정돼 있으면 `atlassian-plugin.xml contains a definition of component.
  This is not allowed`로 빌드가 실패한다. Scanner 방식과 배타적이다.
- 해결은 `@ExportAsService`를 함께 붙이는 것. export 대상이 되면서 즉시 생성된다.

**증상 인식법**: "이 기능이 아예 안 도는데 로그에 에러도 없다" — 애초에 코드가 실행되지 않는 경우를 의심한다.
`META-INF/plugin-components/component`에 클래스가 적혀 있어도 그건 "스캔됐다"는 뜻일 뿐
"생성됐다"는 뜻이 아니다.

### 곁다리: QuickReload 반복 배포는 Spring 컨테이너를 통째로 버릴 수 있다

```text
Ignoring the bean container that was just created for plugin ...
The plugin is in an invalid state, DISABLED, that doesn't support a transition to enabled.
Most likely, it was disabled due to a timeout.
```

플러그인은 결국 ENABLED가 되지만 그 사이 만들어진 빈 컨테이너는 폐기된다.
descriptor 모듈만 살아 있고 Spring 빈은 없는 **반쪽 상태**가 된다.
→ Spring 빈 관련 수정은 QuickReload 결과만 보고 판단하지 말고 **서버를 재시작해서 확인**한다.

## 5. 개발 편의 체크리스트

- 로컬 AMPS 로그(`target/confluence-run.log`)는 **UTF-16**이다. 검색 전에 UTF-8로 변환한다.
- `mvn verify`는 서버가 떠 있어도 되지만 `clean`은 실패한다. QuickReload가 새 JAR을 자동 반영한다.
- 반영 확인은 로그의 `Plugin ... immediately ENABLED`와 `rest/plugins/1.0/<key>-key`의 `enabled`.
- 검증은 **사용자가 여는 URL**로 한다. REST 200이 화면 정상을 뜻하지 않는다.

## 관련

- [[atlassian-ao-schema-constraints]] — 같은 앱에서 나온 AO 스키마 함정과 진단 경로
