# Confluence Approval DC 진행 기록 — 2026-08-09 (페이지 승인 panel)

## 이 문서를 읽는 법

다른 회차 문서와 같은 규칙을 따른다. **코드와 실행 결과로 확인한 것만** 적는다.

이 회차는 페이지 전체 승인을 위한 `approval-page-panel`을 만들고, 실행 중인
Confluence 9.2.22 인스턴스에서 REST와 페이지 HTML로 확인한 기록이다.
문서는 회차 종료 시점 기준이며, 이후 회차(2026-08-10 이후)에서 순차 승인·그룹·Flow·
업무함 화면이 추가되면서 **이 문서의 일부 서술은 상위 버전으로 대체되었다.**
대체된 항목은 각 절 끝에 표시했다.

## 검증 기준선 (회차 종료 시점)

```text
approval-domain      : 15건 통과 (12 → 15)
approval-confluence9 : BUILD SUCCESS, bytecode major 61
approval-confluence10: BUILD SUCCESS, bytecode major 65
```

---

## 1. domain은 이미 PAGE를 지원하고 있었다

작업 전 확인 결과 `approval-domain`은 페이지 대상 승인을 이미 완전히 지원했다.

- `ApprovalResourceType.PAGE`, `ApprovalTarget.page(pageId, contentVersion)` 존재
- 승인·반려·최소 승인 인원·멱등성·페이지 version 만료·기한 만료가 PAGE에 동일 적용
- `POST /approvals?resourceType=PAGE...`도 이미 동작

부족했던 것은 상태 머신이 아니라 **"현재 페이지의 승인 상태를 찾는 조회 진입점"** 이었다.
그래서 상태 전이 규칙(`ApprovalRequest`)은 건드리지 않고 `ApprovalWorkflowService`에
조회 계열 3개만 추가했다.

| 메서드 | 용도 |
|---|---|
| `findLatestPageRequest(long pageId)` | 페이지 대상 최신 요청 + lazy expiration |
| `findOpenRequest(ApprovalTarget)` | 같은 대상의 열린 `PENDING` 확인 |
| `nextRevision(ApprovalTarget)` | 같은 대상의 다음 revision 계산 |

AGENTS 규약대로 adapter에 상태 전이를 중복 구현하지 않았다.

> 이후 회차에서 `ApprovalWorkflowService`에 lock(`ApprovalLockService`)과 순차 승인
> 생성 경로가 추가되면서 이 세 메서드의 내부 구현은 lock 구간 안으로 옮겨졌다.

## 2. web-panel 위치는 추측하지 않고 decorator에서 확인했다

`docs/architecture.md`에 적혀 있던 `atl.page.header`는 **실재하지 않는 location**이었다.

캐시된 `confluence-webapp-9.2.22.war`를 풀어 실제 렌더링 경로를 찾았다.

```text
decorators/page.vmd:21-23
  <content tag="page-metadata-banner">
      #webPanelForLocation("atl.page.metadata.banner", {"action": $action})

decorators/main.vmd:135
  $!sitemeshPage.getProperty("page.page-metadata-banner")   ← 페이지 제목 바로 위
```

그래서 `location="atl.page.metadata.banner"`를 선택했다. context에 `action`만 들어오므로
페이지 해석은 `page` → `content` → `action`(`PageAware`) 순으로 fallback하게 만들었다.

템플릿은 velocity/soy 리소스를 추가하지 않고 기존 `ApprovalRegionMacro`와 같은
Java 생성 HTML 방식으로 갔다. 구현 인터페이스는 `com.atlassian.plugin.web.model.WebPanel`이며,
webfragment-api **7.2.8(C9) / 8.0.9(C10) 모두 `getHtml`/`writeHtml` 시그니처가 동일**함을
javap로 확인한 뒤 선택했다.

module key는 두 adapter가 `approval-page-panel`로 같다. plugin key·macro key와 마찬가지로
UPM 업그레이드 연속성을 위해서다. `scripts/build.ps1`의 descriptor 검증에
panel key와 location assertion을 추가했다.

## 3. 서버 측 권한 검증

"UI 버튼만 숨기는 구현 금지" 규약에 따라 REST 경계에서 다시 검증한다.

| endpoint | 검증 |
|---|---|
| `POST /approvals` | 로그인 + 대상 페이지 `EDIT`, 동일 대상 `PENDING`이면 `409` |
| `GET /approvals/{id}` | 로그인 + 대상 페이지 `VIEW` |
| `approve` / `reject` | 로그인 + `VIEW` + `actorKey` == 본인 |
| `GET /approvals/mine` | 로그인 + `actorKey` == 본인 |
| `page/{id}/expire` | 로그인 + `EDIT` |

승인자 목록에는 user key와 username이 섞여 저장될 수 있어 panel과 REST 모두 두 값을 함께 본다.
미인증 `401`, 권한 없음 `403`, 페이지 없음 `404`.

---

## 4. 실행 중인 Confluence 9에서 확인한 것

브라우저 확장이 연결되지 않아 HTTP 로그인 후 **페이지 HTML을 직접 받아** 검증했다.
대상은 AMPS 인스턴스(`localhost:1990`), 페이지 `163841` / `163846`.

panel은 breadcrumb 아래·`#page-metadata-banner` 앞, 즉 제목 위 header 영역에 서버 렌더링된다.

| 상태 | 렌더링 결과 |
|---|---|
| 요청 없음 | `승인 요청 없음` + 요청 form (EDIT 권한자만) |
| `PENDING` | `승인 대기` / `승인 0 / 최소 1명` / 승인자 `미결정` / 승인·반려 버튼 |
| `APPROVED` | `승인 완료` / `승인 1 / 최소 1명` / 승인자 `승인` |
| `REJECTED` | `반려` / 승인자 `반려` |
| `EXPIRED` | `만료` (`page/{id}/expire` 호출 후) |

같이 확인한 것.

- `data-approval-page-id` / `-content-version` / `-request-id` / `-actor-key` 값이 모두 정확
- CSS·JS가 `atl.general` contextbatch 안에 포함되어 서빙됨
- **비로그인 상태로 같은 페이지를 받으면 panel이 아예 출력되지 않음**
- 중복 요청 `409`, 타인 `actorKey` 승인 `403`, 동일 승인자 재승인 멱등(`approvalCount` 유지)
- `revision` 자동 계산이 1 → 2 → 3으로 증가

> 이후 회차에서 panel은 순차 승인 단계 표시(`n / m단계 진행 중`)로 바뀌었고,
> 요청 생성은 panel 내부 form이 아니라 페이지 상단 액션의 모달로 옮겨졌다.

## 5. 실행해야만 나온 버그 — `@Consumes`로 인한 415

REST 클래스에 `@Consumes(MediaType.APPLICATION_JSON)`이 붙어 있었다.
모든 endpoint가 query/path parameter만 쓰고 body를 읽지 않는데도,
**Content-Type 없는 POST가 415로 거부**됐다.

panel JS의 `fetch`가 정확히 body·Content-Type 없는 POST라,
브라우저에서 승인·반려·요청 버튼을 눌러도 전부 실패하는 상태였다.

```text
Content-Type 없음            → 415
Content-Type: application/json → 201
```

- 조치: 두 adapter에서 `@Consumes` 제거. body를 읽는 endpoint가 하나도 없어
  media type을 제한할 이유가 없다. JS에 헤더를 추가하는 쪽은 curl·문서 예시가
  똑같이 걸리므로 택하지 않았다.
- 재확인: 생성 `201`, 승인 `200 APPROVED`, 반려 `200 REJECTED` — 전부 Content-Type 없이.
- README에 "body/Content-Type 불필요" 문구 추가.

`BUILD SUCCESS`와 단위 테스트 전건 통과가 이 결함을 전혀 잡지 못했다.

## 6. 사고 기록 — 반대 adapter 빌드가 실행 중 인스턴스를 죽인다

`@Consumes` 수정을 확인하려고 `approval-confluence10`을 빌드했더니
**C9 인스턴스에서 panel·macro·REST가 한꺼번에 사라졌다.**

QuickReload가 `approval-confluence10/target/*.jar`를 감지해 설치했고,
두 adapter가 plugin key(`kr.dmove.confluence.approval`)를 공유하므로 교체가 성립했다.
그런데 C10 JAR의 `application-version`은 `10.2.x`라 9.2.22에서는 플러그인 전체가 비활성화된다.

```text
enabled=False   name=DMOVE Approvals for Confluence 10
  approval-page-panel  enabled=False
  approval-region      enabled=False
  approval-rest        enabled=False
```

에러 화면 없이 조용히 사라지는 형태라 증상만 보면 "아무것도 안 보임"이다.

- 진단: `GET /rest/plugins/1.0/kr.dmove.confluence.approval-key`
  (`Accept: application/vnd.atl.plugins.plugin+json`)에서 `name`과 `enabled` 확인
- 복구: 해당 인스턴스에 맞는 adapter를 다시 빌드하면 QuickReload가 되돌린다
- README "로컬 Confluence 실행"에 경고·진단·복구 절차 추가

plugin key 공유는 UPM 업그레이드 연속성을 위해 의도한 것이므로 key를 나누지 않고
운영 주의사항으로 남겼다.

---

## 7. 확인하지 못한 것

- **시각적 확인 없음.** 브라우저 확장이 연결되지 않아 HTML·REST 레벨까지만 봤다.
  CSS가 실제로 어떻게 보이는지, 버튼 클릭이 정말 동작하는지는 확인하지 못했다.
  JS가 만드는 요청과 동일한 형태를 직접 호출해 서버 응답만 대조했다.
- **C10 런타임 미검증.** `.m2`에 `confluence-webapp` 10.2.14가 없어
  `atl.page.metadata.banner`가 10.2에도 있는지는 9.2.22 decorator로만 간접 확인했다.
- **Spring wiring.** 이 회차 종료 시점에는 Spring Scanner가 연결되지 않은 상태여서
  `@Inject` 주입은 컴파일·패키징까지만 확인했다.
  (이후 회차에서 spring-scanner와 `PluginScopedOsgiServiceLocator`로 해결됨)

## 8. 테스트 인스턴스에 남긴 데이터

`pageId=163841`에 검증용 승인 요청 3건(revision 1~3, 최종 `REJECTED`)이 남아 있다.
삭제 API가 없어 그대로 뒀다. 정리하려면 AO 테이블(`APR_REQ`, `APR_APV`)에서 지워야 한다.

## 9. 이 회차 이후 바뀐 것

회차 종료 시점에 이 앱에는 **앱 전용 화면이 없었다.** descriptor의 모듈은
`xhtml-macro` / `web-panel` / `rest` / `ao` / `web-resource`가 전부였고,
`web-item`도 `servlet`도 없어 앱으로 들어가는 입구 자체가 없었다.
`/approvals/mine`은 있었지만 그것을 보여줄 화면이 없었다.

이후 회차에서 `approval-inbox`, `approval-settings` servlet이 추가되어 해소되었다.
현재 상태는 `docs/progress-2026-08-10-2.md`와 `docs/approval-flow-settings.md`를 본다.
