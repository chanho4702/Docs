# Forge Web Trigger 정리

> 작성 2026-10-27 · 공식 문서 기준 + 우리 개발 사이트 실측(2026-10-19~20)

## 1. 무엇인가

Forge 앱 안의 함수를 **외부에서 HTTP로 호출할 수 있게 하는 URL**이다.

- `manifest.yml`에 `webtrigger` 모듈로 선언하고 함수(`function`)를 연결한다.
- URL은 설치(사이트)마다 다르다. 코드에서 `webTrigger.getUrl(key)`로 받거나 CLI `forge webtrigger create`로 만든다.
- 요청이 오면 연결된 함수가 실행되고, 함수가 돌려준 `statusCode`·`headers`·`body`가 HTTP 응답이 된다.

우리 쓰임: 승인 앱 ↔ 워크포스 앱 간 통신 채널(`approval-link-channel`). 요청·응답은 Ed25519 서명 봉투로 주고받는다.

## 2. 공식 문서

| 내용 | 링크 |
|---|---|
| 모듈(manifest) | https://developer.atlassian.com/platform/forge/manifest-reference/modules/web-trigger/ |
| 요청·응답 형식 | https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger/ |
| URL API(`getUrl`·`queryUrls`·`deleteUrl`) | https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger-api/ |
| 실행 한도(시간·메모리·호출 수) | https://developer.atlassian.com/platform/forge/limits-invocation/ |
| URL 발급·삭제 한도 | https://developer.atlassian.com/platform/forge/limits-web-trigger/ |
| 플랫폼 한도 전체 | https://developer.atlassian.com/platform/forge/platform-quotas-and-limits/ |

## 3. 종류

| 종류 | 응답 | Runs on Atlassian |
|---|---|---|
| static | manifest `outputs`에 미리 적은 응답 중 하나(함수는 `outputKey`만 돌려줌) | 자격 유지 |
| dynamic (기본값) | 함수가 만든 아무 응답 | **자격 잃음** |

`urlFormat`: `v1`(기본, 앱 기준 도메인 `*.hello.atlassian-dev.net`) / `v2`(설치 기준 도메인 `*.webtrigger.atlassian.app`, 새 트리거에 권장). 처음 정한 뒤 바꾸면 새로 만드는 URL만 바뀌고 기존 URL은 그대로 동작한다.

manifest 예:

```yaml
modules:
  webtrigger:
    - key: approval-link-channel
      function: channel
      response:
        type: dynamic
```

## 4. 요청·응답

- 요청 객체: `body`, `headers`, `method`, `path`, `userPath`(트리거 ID 뒤 경로), `queryParameters`
- 응답 객체: `statusCode`(필수), `headers`, `body`, `statusText`
- 응답 형식이 맞지 않으면 Forge가 **500**을 보낸다.
- 응답에 `X-Ratelimit-Limit`·`X-Ratelimit-Remaining`·`X-Ratelimit-Reset`(epoch 초) 헤더가 붙는다.

## 5. 제약사항

### 인증·사용자

- **Forge가 인증하지 않는다.** URL을 아는 누구나 호출할 수 있다. 인증은 앱이 직접 한다(서명·토큰 등).
- **사용자 정보가 없다.** `principal`이 없고 `asUser()`를 쓸 수 없다.
- 받는 쪽에는 사이트 정보(`installContext`)만 온다. 어느 앱이 불렀는지는 알 수 없다.

### 실행 한도

| 항목            | 한도                                                                         |
| ------------- | -------------------------------------------------------------------------- |
| 실행 시간         | **55초**. `timeoutSeconds`로 늘릴 수 없다(consumer·scheduledTrigger만 가능, 최대 900초) |
| 메모리           | 기본 512MB, 최대 1,024MB                                                       |
| 요청 본문         | 최대 5MB                                                                     |
| 호출 수          | 설치당 분당 7,000회·초당 300회 중 먼저 닿는 쪽. 사용자당 분당 1,200회. 넘으면 429                   |
| 외부 호출(egress) | 실행 1분당 100건, 앱 전체 분당 50,000건                                               |
| URL 조회        | 분당 1,000회 (앱·환경·컨텍스트당)                                                     |
| URL 생성        | 분당 500회 (앱·환경·컨텍스트당)                                                       |
| URL 삭제        | 분당 500회 (트리거 ID당)                                                          |

### URL

- 모듈 키·앱·사이트·제품·환경이 같으면 URL이 바뀌지 않는다. 재배포해도 유지된다.
- development와 production 환경은 URL이 다르다.
- 삭제한 URL은 다시 쓸 수 없다.

### 버전·배포

| 변경 | 버전 |
|---|---|
| dynamic 트리거를 처음 추가(egress 변경) | **major** |
| static → dynamic 변경 | **major** |
| static 트리거 추가 | minor |

- 다른 앱의 web trigger를 부르려면 부르는 쪽에 egress(`external.fetch.backend`) 선언이 필요하다. egress가 있으면 **부르는 앱도 Runs on Atlassian 자격을 잃는다.**

## 6. 우리 실측 (개발 사이트, 2026-10-19~20)

| 항목 | 결과 |
|---|---|
| 앱 백엔드 → 상대 dynamic web trigger | 200, 0.12~0.4초. 콜드 0.5~1.9초 (apiRoute 경유는 약 1.8초) |
| Ed25519 서명 | Node `crypto`로 서명·검증 가능, 본문 1바이트 변조 감지, 200KB 본문 OK |
| URL 유지 | 재배포 후 유지, major 업그레이드 + `install --upgrade` 후에도 유지. 재설치는 미측정 |
| URL 교체 | `getUrl(key, true)`로 새 URL을 받아도 옛 URL은 `deleteUrl` 전까지 200, 삭제 직후 404 → "새 URL 알림·확인 → 옛 URL 삭제" 2단계로 한다 |
| 응답 헤더 | dynamic 응답의 사용자 헤더(예: `x-moves-link-sig`)가 호출자에게 그대로 전달된다 |
| KVS secret | web trigger 함수에서 `kvs.setSecret`·`getSecret` 동작 |
| `timeoutSeconds` | web trigger 함수에 지정하면 lint 오류 → 핸들러 예산을 코드로 둔다(우리는 6초) |
| `api.asUser(accountId)` | 그 사용자가 **이 앱에 동의한 적이 있을 때만** 동작. 미동의 401 `MISSING_USER_CONSENT`, 비활성·없는 계정 401 `MISSING_OR_INELIGIBLE_USER` |
| 다른 사용자 권한 확인 | asApp `permissions/check`(accountId 지정)는 403. asApp `user/permission/search`·`user/viewissue/search`는 동의와 무관하게 200(0.4~0.6초) |
| 기존 서비스 재사용 | 핸들러가 부른 기존 서비스 안의 `asUser` 호출이 예외를 던져 권한 거부처럼 보였다 → 채널로 여는 서비스는 asUser 호출 지점을 먼저 정리한다 |

### 아직 측정하지 않은 것

- production 환경의 web trigger 도메인
- egress에 와일드카드 호스트를 넣었을 때 심사·동작
- web trigger 안의 `context.license`
- 권한 없는 활성 계정에 대한 `user/permission/search` 응답

## 7. 정리 — 쓸 때 지킬 것

1. 요청마다 직접 인증한다(우리: 서명·사이트·연결 ID·방향·작업 허용 목록·iat ±120초·응답 nonce 결속을 DB 접근 전에 확인).
2. 사용자 권한이 필요하면 요청에 담긴 행위자(actor)를 asApp 조회로 다시 확인한다. `asUser`에 기대지 않는다.
3. 55초 안에 끝나게 하고, 오래 걸리는 일은 큐(async events)로 넘긴다.
4. URL은 비밀로 다룬다(KVS secret에 저장). 교체는 2단계로 한다.
5. dynamic + egress를 쓰면 Runs on Atlassian 자격은 포기한다.
