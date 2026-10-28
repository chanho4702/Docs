# Workforce API 외부 노출 — 실측 조사 결과

> 조사일: 2026-09-16 · 대상 환경: `moves-rms`(DEV) / `tom-chkim-dev.atlassian.net`
> Forge CLI 13.4.0 · `@forge/api` 7.0.2 · Node 22.22.0
> 이 문서에서 **「실측」 표시 항목은 이 환경에서 직접 확인**한 것이고, 「미검증」은 아직 확인하지 못한 것이다.

---

## 1. 결론 요약

| 질문 | 답 |
|------|-----|
| 외부로 API를 열 수 있는가 | **가능**. `core:apiRoute` 모듈로 앱 자체 REST 엔드포인트를 선언한다 |
| 마켓플레이스 심사를 다시 받는가 | **아니다**. 등록된 Forge 앱의 새 버전에 Atlassian의 수동 심사는 없다 |
| 그럼 무엇이 바뀌는가 | **메이저 버전이 올라가고 고객사 관리자가 업데이트를 승인**해야 한다 |
| Runs on Atlassian 배지는 | **유지된다** (실측) |
| 인증은 우리가 만드는가 | **아니다**. 전부 Atlassian OAuth 2.0(3LO)가 처리한다 (실측) |
| 우리 권한 체계는 자동 적용되는가 | **아니다. 전부 우회된다** — 이 조사의 핵심 리스크다 |

---

## 2. 선택지 두 가지

### 2-1. `apiRoute` — 권장

앱이 자체 HTTP 엔드포인트를 선언하고, 외부는 Atlassian이 발급한 OAuth 2.0(3LO) 액세스 토큰으로 호출한다.
→ [Forge app REST APIs (Preview)](https://developer.atlassian.com/platform/forge/app-rest-apis/)

- 인증·토큰 발급·갱신을 전부 Atlassian이 맡는다. 우리가 API 키를 만들고 관리할 일이 없다.
- 권한은 두 겹이다. Atlassian 제품 스코프 + 우리가 정의한 커스텀 스코프(`read:...:custom`).
- 기본 비활성이며 **사이트 관리자가 설치본 단위로 켜야** 열린다.
- Jira·Confluence 앱만 지원하고 **Preview** 단계다. 폐기 유예가 짧을 수 있다.

### 2-2. `webtrigger` — 부적합

이미 `manifest.yml`에 시연용으로 주석 처리돼 있는 그 모듈이다.
→ [Web triggers 런타임 레퍼런스](https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger/) · [web trigger 모듈 레퍼런스](https://developer.atlassian.com/platform/forge/manifest-reference/modules/web-trigger/)

- 플랫폼 인증이 **전혀 없다**. URL만 알면 누구나 호출되므로 키 검증을 직접 구현해야 한다.
- 호출자 사용자 컨텍스트가 없어 **전부 `asApp`으로 동작**한다. `principal` 기반 판정을 태울 수 없고, 마켓플레이스 심사 부담 때문에 `asApp`을 지양해 온 방침과 정면으로 충돌한다.
- Runs on Atlassian 관점에서도 `dynamic` 웹트리거는 실격 사유다(static은 허용).

→ **데이터 조회 API 용도로는 `apiRoute` 하나만 고려한다.**

---

## 3. 실측으로 확인한 것

### 3-1. 배포는 메이저 버전을 강제한다 (실측)

`forge lint`가 배포를 막고 명시적 승인을 요구한다.

```
0:0  approval  This deployment triggers a major version upgrade in the moves-rms environment
               because: Change due to usage of core:apiRoute module   MAJOR_VERSION_RULE
```

`forge deploy --approve MAJOR_VERSION_RULE` 로 통과시켜야 하며, 앱 버전이 **4 에서 5.0.0** 으로 올라갔다.
기존 설치본은 `forge install --upgrade`(고객사에서는 관리자의 업데이트 승인)를 거쳐야 새 버전이 적용된다.

중요한 점은 트리거가 **스코프 증가가 아니라 `core:apiRoute` 모듈 사용 그 자체**라는 것이다. 라우트를 몇 개 열든 첫 도입에서 한 번 메이저가 올라간다.

> **문서와 실제가 다르다.** [메이저 버전 업그레이드 공식 목록](https://developer.atlassian.com/platform/forge/versions/#major-version-upgrades)에는 스코프 변경·CSP·egress·웹트리거·providers·remotes·라이선싱만 열거돼 있고 **`apiRoute`는 이름이 없다.** 그런데 CLI는 `Change due to usage of core:apiRoute module` 을 사유로 명시하며 실제로 막는다. 목록을 믿고 "메이저가 아니겠지" 하고 계획하면 안 된다.

같은 문서가 설치본 처리도 규정한다. 메이저 업그레이드는 설치에 즉시 적용되지 않으며, 사이트 관리자가 앱 관리 화면에서 승인하거나 개발자가 `forge install --upgrade`를 실행해야 한다.

### 3-2. 커스텀 스코프는 배포 전에 따로 등록해야 한다 (실측)

매니페스트에 쓰는 것만으로는 배포가 실패한다.

```
Error: Deployment failed due to missing scopes. Contact your admin to register the missing scopes, then try again.
```

절차는 별도 파일 + CLI다.
→ [Expose Forge app REST APIs (튜토리얼)](https://developer.atlassian.com/platform/forge/expose-forge-app-rest-apis/)

```yaml
# custom-scopes.yaml
version: 1
scopes:
  read:probe:custom:
    displayName: Probe temporary      # 패턴 ^[a-zA-Z0-9\s:_\-.]+$ — 괄호 불가 (실측)
    description: >-
      ...
```

```bash
forge custom-scopes create -e <env> -f custom-scopes.yaml
forge custom-scopes list   -e <env>
```

**제약이 강하다.**

- 스코프는 **환경당 20개**가 상한이다.
- 한 번 등록하면 **삭제도 이름 변경도 불가능**하다.
- 환경별로 따로 등록해야 한다. 운영에 올릴 때 다시 등록해야 한다.

→ 이름 체계를 먼저 확정하고 등록할 것. 시험 삼아 만든 이름이 영구히 남는다.

### 3-3. 매니페스트 계약 (CLI 스키마에서 확인)

→ [API route 모듈 레퍼런스](https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/)
(아래 표의 `path` 와일드카드 규칙은 문서에 없고, CLI 13.4.0의 `@forge/manifest` JSON 스키마에서 직접 읽은 것이다.)

| 속성 | 값 |
|------|-----|
| `path` | 와일드카드 지원 — `/a/b`, `/a/*`, `/a/**` |
| `operation` | `GET` `POST` `PUT` `DELETE` `PATCH` |
| `accept` | **`application/json` 만** |
| `scopes` | 1~20개, 전부 `:custom` 접미사 필수 |

핸들러는 `statusCode`를 포함한 객체를 반환해야 한다.

### 3-4. 관리자가 설치본 단위로 켠다 (실측)

→ [Access REST APIs exposed by a Forge app](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/)

Atlassian 관리 → 사이트 설정 → **연결된 앱** → 해당 앱(환경별로 항목이 따로 있다) → 세부 사항 하단 **「앱 REST API」**.

- 기본값은 **사용 중지**다.
- 켜면 그 자리에서 기본 URL이 노출된다.
  `https://api.atlassian.com/svc/jira/<cloudId>/apps/<appId>_<envId>/<path>`
- 화면의 안내문에 주의할 대목이 있다. **연동을 만들 수 있는 사람이 관리자로 한정되지 않는다.**

  > 이 API에 액세스하는 통합은 조직의 확인된 Atlassian 계정에서만 만들 수 있습니다. 확인된 Atlassian 계정이 있는 조직의 모든 사용자가 이 통합을 만들 수 있습니다.

  즉 관리자는 **문을 열지 말지만** 정하고, 문이 열린 뒤 토큰을 만드는 것은 조직 구성원 누구나 할 수 있다. 응답 내용을 좁히는 책임은 전적으로 우리 코드에 있다.

### 3-5. 게이트웨이가 우리 코드 앞에서 막는다 (실측)

REST API를 켠 상태에서 토큰 없이 호출해 봤다.

| 호출 | 결과 |
|------|------|
| 토큰 없음 | `401 {"code":401,"message":"Unauthorized"}` |
| 엉터리 Bearer 토큰 | `401` 동일 |
| 선언하지 않은 경로 | `401` 동일 |

셋 다 우리 함수가 실행되지 않는다. 존재하지 않는 경로도 404가 아니라 401이므로 **경로 존재 여부조차 밖으로 새지 않는다.**

### 3-6. Runs on Atlassian 배지는 유지된다 (실측)

```
ℹ The version of your app [5.1.0] that's deployed to [DEV moves-rms]
  is eligible for the Runs on Atlassian program.
```

`forge deploy`와 `forge eligibility` 양쪽이 동일하게 보고했고, 관리 콘솔의 앱 상세에도 「Atlassian에서 실행」 배지가 그대로 붙어 있다.
현재 매니페스트의 Sentry 외부 fetch는 `category: analytics`로 선언돼 있어 배지에 영향이 없다. 반면 `remotes` 추가와 `dynamic` 웹트리거는 실격 사유이므로 앞으로도 넣지 않는다.

→ [Build Runs on Atlassian apps (적격 기준)](https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/) · [프로그램 개요](https://developer.atlassian.com/platform/marketplace/runs-on-atlassian/) · [`forge eligibility` 커맨드](https://developer.atlassian.com/platform/forge/cli-reference/eligibility/)
공식 문서도 `apiRoute`를 쓴 앱이 나머지 요건을 충족하면 적격이라고 명시한다.

---

## 4. ⚠ 가장 중요한 결함: 기존 권한 체계가 전부 우회된다

`apiRoute`는 **`src/index.js`의 resolver와 완전히 별개인 진입점**이다. 다음이 **하나도 실행되지 않는다.**

| 우회되는 것 | 위치 | 원래 역할 |
|-------------|------|-----------|
| `guardedDefine` | `src/permission/permissionGuard.js` | 권한 가드 + 응답 표준화 |
| `PermissionMap` deny-by-default | `src/permission/PermissionMap.js` | 미선언 함수 원천 거부 |
| `resolvePrincipal` | `src/permission/PrincipalResolver.js` | `context.accountId` 로부터 principal 구성 |
| 라이선스 검사 | `src/utils/ResponseWrapper.js` | `assertLicenseAllowed` |

즉 **resolver에 걸어 둔 모든 방어가 이 경로에는 자동으로 붙지 않는다.**
`CLAUDE.md`에 적어 둔 "가드 통과 = 데이터 범위 확정이 아니다" 원칙이 여기서는 한 단계 더 나아간다. **가드 자체가 없다.**

실제 기능을 노출한다면 핸들러마다 다음 순서를 **직접** 통과시켜야 한다.

1. 호출자 신원 확정 (→ 5장, 아직 미검증)
2. RMS 작업별 권한 판정
3. 프로젝트·팀 스코프 적용 (`ALL` / `MEMBER_ONLY` / `TEAM_ONLY`)
4. 급여·원가 가시성 정책 (`CostAccess.canReadCost` 등)
5. 라이선스 검사

**절대 하면 안 되는 것**: 요청 body나 query의 `accountId`를 principal로 신뢰하는 것. `resolvePrincipal`은 넘겨받은 ID의 DB 정보와 실행 컨텍스트의 관리자 판정을 결합하므로, 그 ID가 실제 호출자와 같다는 보장 없이 재사용하면 **임의 사용자 사칭**이 된다. 신원이 확정되지 않으면 거부해야 한다(fail-close).

또한 `CLAUDE.md`의 "한 화면만 막으면 형제 resolver로 우회된다" 교훈이 그대로 적용된다. 같은 데이터를 내주는 경로가 resolver와 REST 둘로 늘어나므로, **판정 로직을 공용 함수로 뽑아 두 경로가 같은 것을 보게** 해야 한다.

---

## 5. 미검증으로 남은 것 — 호출자 신원

**핵심 질문**: `apiRoute` 핸들러가 호출자의 `accountId`를 받는가? 그리고 핸들러 안에서 `asUser()`가 호출자 자격으로 동작하는가?

공식 문서에 핸들러 인자 계약이 **명시돼 있지 않다.** [튜토리얼](https://developer.atlassian.com/platform/forge/expose-forge-app-rest-apis/) 예제도 `req`를 그대로 문자열로 찍을 뿐 필드를 설명하지 않고, [모듈 레퍼런스](https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/)도 `statusCode`를 반환하라는 것 외에 인자를 다루지 않는다.

이 답에 따라 설계가 갈린다.

| 결과 | 의미 |
|------|------|
| `accountId`가 들어오고 `asUser()`가 호출자로 동작 | 기존 `resolvePrincipal` → `PermissionMap` 판정을 **거의 그대로 재사용** 가능 |
| 신원이 안 들어옴 | 외부 호출 전용 권한 모델을 **새로 설계**해야 한다. 커스텀 스코프만으로 범위를 가르게 되며, 스코프는 조직 구성원 누구나 동의로 얻을 수 있으므로 **스코프 설계 = 권한 설계**가 된다 |

### 확인 방법 (남은 단계)

프로브는 이미 배포돼 있다(`moves-rms`, v5.1.0). 사이트 관리자 활성화도 끝났다.
남은 것은 **OAuth 연동 생성 한 단계**뿐이며, 계정에 영구 자격증명을 만드는 작업이라 자동으로 진행하지 않았다.
절차 원문: [Access REST APIs exposed by a Forge app](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/) · 토큰 교환은 [OAuth 2.0 (3LO) 표준 플로우](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)를 따른다.

1. <https://developer.atlassian.com/console/myapps/> → **Create → OAuth 2.0 integration**
2. 이름 입력 후 생성. **Access type은 Resource-level**(특정 사이트로 제한)
3. 좌측 **Permissions** 또는 Forge app 항목에서 설치 사이트(`tom-chkim-dev`)와 앱(`Moves Workforce for Jira`, 환경 `moves-rms`)을 연결
4. 스코프에 `read:probe:custom` 과 `read:forge-app:jira` 선택
5. **Authorization**에서 콜백 URL 지정 후 생성된 authorization URL 방문 → 동의 → `code` 수신
6. `code`를 액세스 토큰으로 교환
7. 호출:

```bash
curl -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Accept: application/json" \
  "https://api.atlassian.com/svc/jira/119d766c-47d4-4c52-9b89-72646f2bbc53/apps/f8962f17-9f12-43d0-91f5-7f3a626c1bbf_6a429133-1034-43cc-8201-71fd054b1497/probe"
```

응답의 `accountIdCandidates`가 비어 있지 않으면 신원이 들어오는 것이고, `identity.asUser.accountId`가 호출한 본인이면 `asUser()`가 호출자 자격으로 동작하는 것이다.

---

## 6. 마켓플레이스 영향 정리

- **Atlassian의 수동 재심사는 없다.** 운영 환경에 배포하면 마켓플레이스가 몇 분 안에 자동 감지해 새 버전을 게시한다.
- **고객사 관리자 승인이 필요하다.** 메이저 버전이므로 관리자가 업데이트를 승인하기 전까지 기존 고객은 구버전에 머문다.
- **그 위에 관리자 스위치가 하나 더 있다.** 업데이트를 승인해도 「앱 REST API」를 켜지 않으면 엔드포인트는 열리지 않는다. 즉 고객이 모르는 사이에 문이 열리는 일은 없다.
- **배지는 유지된다.** 다만 운영 배포 전 `forge eligibility`로 매번 확인하는 편이 안전하다.

---

## 7. 현재 남겨 둔 상태 (정리 대상)

조사를 위해 만든 것들이다. 실기능 설계로 넘어가기 전에 정리 여부를 정해야 한다.

| 항목 | 위치 | 되돌릴 수 있나 |
|------|------|----------------|
| 프로브 핸들러 | `src/apiProbe/ApiProbeHandler.js` | 파일 삭제 |
| 라우트·함수 선언 | `manifest.yml` (`apiRoute`, `function: apiProbe`) | 블록 삭제 |
| 스코프 정의 파일 | `custom-scopes.yaml` | 파일 삭제 |
| **등록된 커스텀 스코프** `read:probe:custom` | `moves-rms` 환경 | **불가**. 영구히 남고 20개 한도를 1칸 차지한다 |
| 환경변수 `PROBE_ENABLED=true` | `moves-rms` 환경 | `forge variables unset` |
| 앱 REST API 활성화 | `tom-chkim-dev` 사이트 | 관리 콘솔에서 「앱 REST API 사용 중지」 |
| 앱 버전 5.1.0 | `moves-rms`(DEV) | DEV 전용. 운영·스테이징은 건드리지 않았다 |

**운영 유입 방지 장치**: 프로브 핸들러는 Forge 환경변수 `PROBE_ENABLED=true`인 환경에서만 응답하고, 그 외에는 404를 반환한다. 이 변수는 `moves-rms`에만 설정했으므로 운영·스테이징에 실수로 배포돼도 열리지 않는다. 다만 **매니페스트에는 남아 있으므로**, 운영 배포 시에는 `apiRoute` 블록을 빼는 편이 확실하다.

또한 프로브는 인자의 **값이 아니라 형태(키 이름·타입·문자열 길이)만** 반환한다. 런타임이 인자에 토큰을 실어 보낼 경우 그대로 외부로 나가는 것을 막기 위해서다. 예외는 `accountId` 계열뿐이며, 이는 호출자 본인의 식별자이고 조사의 대상이다.

---

## 8. 다음 단계 제안

1. **5장 신원 확인을 먼저 끝낸다.** 여기서 권한 설계 전체가 갈리므로 다른 결정을 앞세울 이유가 없다.
2. 그 결과로 **무엇을 열지** 정한다. 외부가 실제로 원할 만한 것은 프로젝트·인력 배정·워크로그 집계 정도이며, **급여·원가는 기본적으로 제외**하고 시작하는 편이 안전하다.
3. 스코프 이름 체계를 확정한다. 되돌릴 수 없으므로 한 번에 정한다. 읽기/쓰기와 도메인을 축으로 잡되 20개 한도를 염두에 둔다.
4. 판정 로직을 **resolver와 REST가 공유**하도록 뽑아낸다. 두 경로가 갈라지는 순간 한쪽만 막히는 사고가 난다.
5. 그 다음에 RFC를 연다.

---

## 참고 문서

### apiRoute 자체

| 문서 | 무엇을 담고 있나 |
|------|------------------|
| [Forge app REST APIs (Preview)](https://developer.atlassian.com/platform/forge/app-rest-apis/) | 개념·보안 모델 개요. 관리자 활성화가 필수라는 점, Runs on Atlassian 적격이라는 점의 근거 |
| [Expose Forge app REST APIs](https://developer.atlassian.com/platform/forge/expose-forge-app-rest-apis/) | **실제 구현 절차.** `custom-scopes.yaml` 형식, `forge custom-scopes create/list`, 핸들러 예제, 엔드포인트 URL 패턴 |
| [API route 모듈 레퍼런스](https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/) | 매니페스트 속성 표(`path`·`operation`·`function`·`accept`·`scopes`) |
| [Access REST APIs exposed by a Forge app](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/) | **호출하는 쪽 절차.** 관리자 활성화, 3LO 연동 생성, 스코프 선택, URL 두 형태 |
| [OAuth 2.0 (3LO) apps](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) | authorization code → access token 교환의 표준 플로우 |

### 버전·심사

| 문서 | 무엇을 담고 있나 |
|------|------------------|
| [App versions — major version upgrades](https://developer.atlassian.com/platform/forge/versions/#major-version-upgrades) | 메이저 트리거 목록과 설치본 승인 규칙. **단, `apiRoute`는 이 목록에 없는데 CLI는 막는다**(3-1 참조) |
| [Upgrade and version cloud apps](https://developer.atlassian.com/platform/marketplace/upgrading-and-versioning-cloud-apps/) | 등록된 Forge 앱의 새 버전은 **자동 감지·자동 게시**이며 Atlassian 수동 심사가 없다는 근거 |
| [Security for Forge apps on the Marketplace](https://developer.atlassian.com/platform/forge/security/) | 스코프·권한·egress를 늘리려면 사이트 관리자 재승인이 필요하다는 근거 |

### Runs on Atlassian

| 문서 | 무엇을 담고 있나 |
|------|------------------|
| [Build Runs on Atlassian apps](https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/) | 적격·실격 기준 전체. `remotes`·`dynamic` 웹트리거·providers·Connect 모듈이 실격 |
| [Runs on Atlassian (프로그램 개요)](https://developer.atlassian.com/platform/marketplace/runs-on-atlassian/) | 프로그램 취지와 고객 관점 의미 |
| [`forge eligibility`](https://developer.atlassian.com/platform/forge/cli-reference/eligibility/) | 배포 전 적격성 확인 커맨드 |

### 비교 대상(웹트리거)

| 문서 | 무엇을 담고 있나 |
|------|------------------|
| [Web triggers (런타임)](https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger/) | **URL에 인증이 없다**는 명시. 직접 토큰 검증을 구현하라는 안내 |
| [web trigger 모듈 레퍼런스](https://developer.atlassian.com/platform/forge/manifest-reference/modules/web-trigger/) | static/dynamic 구분 |
