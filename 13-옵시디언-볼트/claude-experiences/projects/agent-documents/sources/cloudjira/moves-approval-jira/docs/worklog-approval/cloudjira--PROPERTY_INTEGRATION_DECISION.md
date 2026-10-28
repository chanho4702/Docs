# Workforce–Approval 연동 방식 결정

## 1. 결론

Workforce와 Approval 사이의 기본 연동은 **서명된 Jira entity property**를 사용한다.

- 실제 승인 상태와 감사 이력은 Approval SQL에 보관한다.
- Entity property에는 상대 앱이 필요한 조직, 정책, 통제 규칙, 승인 결과만 복사해 전달한다.
- 받은 property는 `sig` 서명을 검증한 뒤에만 사용한다.
- 실시간 검색이나 대량 조회가 필요해지면 Forge App REST API를 추가로 검토한다.

즉, property는 **공유 DB가 아니라 두 앱 사이의 우편함**에 가깝다.

---

## 2. Property 방식을 선택한 이유

Workforce와 Approval은 서로 다른 Forge 앱이다. 각 앱의 Forge SQL과 KVS는 해당 앱만 접근할 수 있으므로 상대 앱의 DB를 직접 조회할 수 없다.

두 앱 모두 Jira 안에서 동작하기 때문에 Jira entity property를 공통 전달 지점으로 선택했다.

| 선택 이유 | 설명 |
|---|---|
| 별도 서버가 필요 없음 | Jira 안에서 문서를 교환하므로 연동 전용 서버와 DB를 운영하지 않아도 된다. |
| OAuth token 설정이 없음 | 고객이 API URL, access token, callback URL을 직접 설정할 필요가 없다. |
| 대상에 맞춰 저장 가능 | 사용자, 프로젝트, 이슈, Worklog 중 정보가 실제로 적용되는 대상에 저장할 수 있다. |
| 장애 후 복구가 쉬움 | 원본은 각 앱 DB에 있으므로 property가 삭제되거나 게시에 실패해도 다시 만들 수 있다. |
| 상대 앱 장애의 영향이 작음 | 상대 앱이 잠시 멈춰도 현재 앱의 승인과 기록 처리는 계속할 수 있다. |
| 데이터 신뢰 방법이 명확함 | 서명, 사이트, 대상, 유효 시간, revision을 확인한 값만 사용한다. |

승인과 잠금은 property 값으로 결정하지 않는다. Approval SQL이 원본이며 property는 상대 앱에 보내는 서명된 복사본이다.

---

## 3. Property 방식의 한계

| 한계 | 실제 영향 | 대응 방법 |
|---|---|---|
| Property 하나가 최대 32KB | 조직이나 승인 목록이 커지면 한 문서에 담을 수 없다. | 사용자·연도·월별 key로 나누고 건수와 크기 상한을 둔다. |
| 비밀 저장소가 아님 | Jira 접근 권한이 있는 다른 주체가 값을 보거나 바꿀 가능성이 있다. | token·개인키·민감한 원문을 넣지 않고 `sig` 검증 전에는 사용하지 않는다. |
| 즉시 반영이 보장되지 않음 | 발행과 수신 사이에 시간 차이가 생긴다. | `확인 중` 상태, 재시도, 일일 보정 작업을 둔다. |
| 변경 알림이 제한적임 | 사용자 property가 바뀌어도 Approval이 즉시 알지 못할 수 있다. | 승인 요청, 화면 조회, 관리자 재조회 시 다시 읽는다. |
| 마지막 저장값이 앞선 값을 덮을 수 있음 | 늦게 도착한 과거 문서가 최신 문서를 덮을 수 있다. | `rev`를 확인하고 이전 revision은 거부한다. |
| Jira entity와 수명이 연결됨 | 이슈나 Worklog를 삭제하면 그 entity의 property도 사라진다. | 승인과 감사 원장은 Approval SQL에 별도로 보관한다. |
| 검색과 대량 조회가 불편함 | 일반 DB처럼 조건 검색이나 자유로운 pagination을 하기 어렵다. | 필요한 값만 작은 문서로 전달하고, 대량 조회가 필요하면 API를 검토한다. |
| Jira 권한과 설치 상태에 의존함 | scope 부족이나 설치 미갱신으로 읽기·쓰기가 실패할 수 있다. | 실패 상태를 기록하고 설치 upgrade와 재시도 절차를 둔다. |

---

## 4. 대체 방안 비교

### 용량 제한에 대한 현재 대응

Atlassian 문서상 entity 하나에 붙일 수 있는 entity property의 **개수는 무제한**이다. 다만 key는 최대 255바이트, property 값 하나는 최대 32,768바이트다. 따라서 큰 데이터를 key 하나에 계속 추가하는 방식은 사용할 수 없다.

현재 설계는 다음과 같이 대응한다.

| 데이터 | 현재 처리 |
|---|---|
| 승인·잠금·변경 이력 원장 | Entity property에 저장하지 않고 Approval SQL에 저장한다. |
| 월별 승인 결과 | `movesApproval.cert.{YYYY-MM}`로 사용자·월 단위로 나눈다. |
| 문서 크기 | Jira 제한보다 작은 30,000바이트를 내부 상한으로 사용한다. |
| Worklog 건별 목록 | 최대 1,000건이며, 30,000바이트를 넘으면 들어가는 범위까지만 싣는다. |
| 잘림 표시 | `wt: true`와 `approval.truncated: true`로 목록이 불완전함을 표시한다. |
| 잘린 목록의 판정 | 목록에 없는 Worklog를 승인 또는 미승인으로 추정하지 않고 `NOT_OBSERVED`로 처리한다. |
| 월 합계 | 건별 목록이 잘려도 `cs`, `cn`, `mn`, `dn` 등 합계는 전체 DB 기준으로 계산한다. |

이 방식은 Approval의 잠금과 감사에는 문제가 없다. 해당 기능은 property가 아니라 Approval SQL을 기준으로 처리하기 때문이다. 다만 Workforce가 개별 Worklog별 승인 상태나 프로젝트별 원가를 완전하게 계산해야 한다면, 잘린 목록만으로는 부족하다.

### 목록이 30KB를 넘을 때의 개선안

완전한 건별 목록이 필요하면 다음 두 방식 중 하나를 선택한다.

**1안: Property 분할**

```text
movesApproval.cert.2026-10.meta
movesApproval.cert.2026-10.000
movesApproval.cert.2026-10.001
```

- 각 조각을 30,000바이트 이하로 만든다.
- 모든 조각에 같은 `generation`, `rev`, `chunkCount`를 넣고 각각 서명한다.
- 조각을 먼저 게시한 뒤 `meta` 문서를 마지막에 게시한다.
- 수신 앱은 모든 조각의 개수·서명·generation이 맞을 때만 새 버전으로 교체한다.
- 게시 도중 실패하면 기존 완전한 버전을 유지하고, 새 불완전 버전을 사용하지 않는다.
- 오래된 generation의 조각은 새 버전 확인 후 정리한다.

Property 개수 자체는 제한되지 않지만 조각 수만큼 Jira REST 호출과 rate limit 부담이 증가한다. 월별 Worklog가 몇천 건 정도이고 실시간 검색이 필요하지 않을 때 적합하다.

**2안: Forge App REST API**

- Property에는 합계, revision, 마지막 갱신 시각처럼 작은 요약만 둔다.
- 건별 목록은 API에서 cursor pagination으로 조회한다.
- 큰 조직이나 대량 승인 결과를 안정적으로 조회할 수 있다.
- 대신 3LO 동의, token 갱신, scope, 장애 대응과 고객별 연결 설정이 필요하다.

현재 MVP는 30KB 상한과 `truncated` 처리를 유지할 수 있다. 고객 요구가 “월 합계 확인”이면 충분하다. **개별 Worklog가 하나도 빠지면 안 되는 원가·정산 용도라면 Property 분할 또는 API pagination 중 하나를 구현해야 한다.**

| 방식 | 적합한 경우 | 장점 | 부담과 한계 |
|---|---|---|---|
| 서명된 entity property | 같은 Jira 사이트에서 작은 상태를 비동기로 전달 | 별도 서버와 token 운영이 필요 없음 | 32KB 제한, 반영 지연, 검색 제약 |
| Forge App REST API | 최신 데이터의 즉시 조회, 검색, pagination이 필요 | 요청 시점의 최신 값을 받을 수 있음 | Preview 기능, 3LO 동의, token·scope·장애 운영 필요 |
| 외부 공용 backend | 여러 사이트·제품의 대량 데이터를 한곳에서 처리 | 자유로운 검색, 통합 처리 가능 | 서버 운영, 보안, 개인정보, 데이터 레지던시, 비용 부담 |
| Web trigger | 변경 사실을 상대 앱에 빠르게 알리는 단순 이벤트 | 구조가 단순하고 push 방식 가능 | 자체 인증·재전송·위변조 방지가 필요해 승인 조회 API에는 부적합 |

---

## 5. API 방식은 어떻게 동작하나

Property 대신 API를 사용한다면 Forge App REST API가 우선 대안이다.

```mermaid
flowchart LR
    A[대상 앱이 apiRoute 공개] --> B[custom scope 등록]
    B --> C[사이트 관리자가 API 활성화]
    C --> D[OAuth 2.0 3LO 동의]
    D --> E[access token 발급]
    E --> F[호출 앱이 API 요청]
    F --> G[대상 앱이 사용자·사이트·업무 권한 확인]
    G --> H[필요한 데이터만 응답]
```

두 앱에 같은 token 문자열을 넣는 것만으로는 통신할 수 없다.

1. API를 제공할 앱이 `manifest.yml`에 `apiRoute`와 handler를 등록한다.
2. API별 custom scope를 만들고 Forge 환경에 등록한다.
3. 고객 사이트 관리자가 Connected apps에서 App REST API를 활성화한다.
4. OAuth 2.0(3LO) integration에서 대상 사이트·앱·환경·scope를 선택한다.
5. 사용자의 동의를 거쳐 access token과 갱신 수단을 확보한다.
6. 호출 앱이 Bearer token으로 API를 호출한다.
7. API handler가 `principal.accountId`, 사이트, 팀 범위, 이슈 열람 권한을 다시 확인한다.

Forge의 scope와 3LO 인증은 **API에 들어올 수 있는 권한**을 확인한다. 팀장인지, 해당 팀원의 데이터를 볼 수 있는지 같은 업무 권한은 API 내부에서 다시 검사해야 한다.

---

## 6. 현재 구현 상태

현재 Approval의 `manifest.yml`에는 `apiRoute`가 없다. 과거에 다음 API를 검토했지만, 내부 연동 방식을 entity property로 확정하면서 활성 manifest와 설정 화면에서 제거했다.

- Worklog 승인 상태 조회
- Worklog 변경 이력 조회
- Workforce 조직 조회

현재는 Workforce base URL이나 3LO access token을 입력하는 설정도 제공하지 않는다. API 방식으로 전환하려면 기존 token을 다시 사용하는 작업이 아니라 **신규 연동 기능으로 재설계하고 배포하는 작업**이 필요하다.

---

## 7. API 방식 도입 전에 확인할 사항

### 플랫폼과 고객 동의

| 확인 항목 | 확인할 내용 |
|---|---|
| Preview 사용 여부 | Forge App REST API는 현재 Preview다. 고객이 변경 가능성과 짧은 변경 예고 기간을 수용하는지 확인한다. |
| 사이트별 활성화 | 각 고객 사이트에서 관리자가 App REST API를 켤 수 있는지 확인한다. |
| 설치 환경 | production, staging, development의 `appId`와 `envId`를 구분할 수 있어야 한다. |
| Runs on Atlassian | API 공개와 상대 API 호출을 추가한 뒤 eligibility를 다시 확인한다. |

### 인증과 token 운영

| 확인 항목 | 확인할 내용 |
|---|---|
| 동의 계정 | 누가 3LO 동의를 수행하고 연결을 소유할지 정한다. |
| 계정 변경 | 담당자 퇴사, 비활성화, 사이트 탈퇴 시 token이 어떻게 되는지 시험한다. |
| token 갱신 | access token 만료와 refresh token 갱신·회전 절차를 구현한다. |
| token 폐기 | 관리자가 연동을 해제했을 때 token과 저장된 연결 정보를 즉시 삭제한다. |
| secret 저장 | token 원문은 secret 저장소에 두고 화면, 응답, 로그에 노출하지 않는다. |
| 사이트 대조 | token의 사이트와 현재 `cloudId`가 일치하는지 확인한다. 다른 고객 사이트 token을 거부한다. |

### 권한

| 확인 항목 | 확인할 내용 |
|---|---|
| Custom scope | 조회와 변경 scope를 분리하고 필요한 scope만 발급한다. Scope 이름은 `:custom`으로 끝나야 한다. |
| Forge product scope | Jira 호출에 필요한 `read:forge-app:jira` 등의 scope를 확인한다. |
| 업무 권한 | scope 통과 후에도 팀장 범위, 작성자, 관리자 권한을 서버에서 다시 검사한다. |
| 이슈 열람 권한 | Worklog나 이력을 반환하기 전에 호출자가 현재 이슈를 볼 수 있는지 확인한다. |
| 라이선스 | 라이선스 비활성 상태에서 허용할 API와 차단할 API를 정한다. |

### 통신과 장애 대응

| 확인 항목 | 확인할 내용 |
|---|---|
| Egress | 호출 앱의 `external.fetch.backend` 허용 대상과 설치 upgrade 필요 여부를 확인한다. |
| URL 제한 | `api.atlassian.com`의 정확한 `cloudId`, `appId`, `envId` 형식만 허용한다. 임의 URL과 redirect를 차단한다. |
| Timeout | 호출 시간을 제한하고 상대 앱 지연이 현재 앱 전체를 멈추지 않게 한다. |
| 오류 구분 | `401`, `403`, `429`, `5xx`, timeout을 나눠 기록하고 각각 다르게 처리한다. |
| 재시도 | 일시 오류만 backoff로 재시도하고 인증 오류는 무한 재시도하지 않는다. |
| 중복 방지 | 변경 API에는 idempotency key를 사용해 재전송 시 중복 승인이 생기지 않게 한다. |
| 장애 시 동작 | API가 끊겼을 때 차단할지, 마지막 검증값을 잠시 사용할지, property로 fallback할지 정한다. |

### 데이터와 API 계약

| 확인 항목 | 확인할 내용 |
|---|---|
| 조회 범위 | 전체 조직·전체 이력을 한 번에 주지 않고 기간과 대상을 제한한다. |
| Pagination | page 크기, cursor 또는 offset, 최대 조회 건수를 정한다. |
| 응답 크기 | 큰 응답을 차단하고 필요한 필드만 반환한다. |
| API version | `/v1` 같은 버전과 구버전 지원 기간을 정한다. |
| 개인정보 | 사용자 accountId, 설명, 감사 이력의 제공 범위와 보관 정책을 확인한다. |
| 감사 기록 | 누가 언제 어떤 API로 어떤 범위를 조회·변경했는지 남긴다. Token과 원문 개인정보는 로그에서 제외한다. |

---

## 8. 권장 방향

현재 요구사항은 조직, 정책, 통제 설정, 월별 승인 결과처럼 크기가 작은 상태를 두 앱이 주고받는 것이다. 따라서 현재 단계에서는 다음 구성이 적합하다.

1. Approval SQL과 Workforce DB를 각 앱의 원본으로 유지한다.
2. 상대 앱에 필요한 작은 결과만 서명된 entity property로 게시한다.
3. 서명 검증, revision 확인, 재시도와 일일 보정을 유지한다.
4. 실제로 실시간 검색이나 대량 조회 요구가 확인되면 읽기 전용 Forge App REST API부터 추가한다.
5. API가 안정된 뒤에도 승인 원장과 감사 이력을 상대 앱 DB에 직접 의존시키지 않는다.

API 전환 여부는 기술적으로 가능하다는 이유만으로 결정하지 않는다. 다음 질문 중 하나라도 명확하게 “예”일 때 API 도입 가치가 있다.

- 승인 결과를 수초 안에 반드시 조회해야 하는가?
- 32KB를 넘는 조직 또는 승인 데이터를 자주 교환하는가?
- 조건 검색과 pagination이 반드시 필요한가?
- 고객이 3LO 동의와 token 운영을 수용하는가?
- API 장애와 token 만료를 운영할 담당자와 절차가 있는가?

위 조건이 없다면 property 방식이 구현과 운영 모두 단순하다.

## 공식 참고 문서

- [Forge App REST APIs](https://developer.atlassian.com/platform/forge/app-rest-apis/)
- [Forge App REST API 호출 및 3LO 설정](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/)
- [Forge permissions와 scope](https://developer.atlassian.com/platform/forge/manifest-reference/permissions/)
- [Jira entity properties](https://developer.atlassian.com/cloud/jira/platform/jira-entity-properties/)
