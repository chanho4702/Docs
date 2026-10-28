# 워크포스 연동 서명 키 — 왜 필요하고, 어떻게 설정하나

> 대상: 우리 개발·운영 담당자. **고객은 이 작업을 하지 않는다.**
> 작성: 2026-10-12. 승인 앱(moves-approval-jira)과 워크포스(moves-workforce) 두 리포에 걸친 작업이다.
> 이 문서만 보고 처음부터 끝까지 따라 할 수 있게 썼다. 막히는 곳이 있으면 맨 뒤 "문제가 생겼을 때"를 본다.

---

## 1. 한 줄 요약

두 앱이 Jira 에 붙여 주고받는 문서가 **진짜 그 앱이 만든 것인지 확인하는 도장**이다. 도장을 찍는 비밀 키와 확인하는 공개 키를 앱마다 한 쌍씩 만들어 등록해야 연동이 켜진다. 지금은 두 앱 모두 키가 없어서 **연동 기능 전체가 꺼져 있다.**

## 2. 왜 해야 하나

### 두 앱은 직접 대화하지 못한다

Forge 는 앱끼리 서로를 호출하는 길을 막아 두었다. 그래서 승인 앱과 워크포스는 Jira 의 **프로퍼티**라는 칸에 문서를 붙여서 정보를 넘긴다. 프로퍼티는 이슈·사용자·프로젝트에 붙는 데이터 칸이다.

### 그런데 그 칸은 아무나 쓸 수 있다

이슈 편집 권한만 있으면 누구나 API 로 프로퍼티를 쓰고 지울 수 있다. 서명이 없으면 이런 일이 가능하다.

- 누가 자기 계정에 "3월 인증 시간 200시간"이라는 가짜 문서를 붙인다. 워크포스가 그 숫자로 원가를 계산한다.
- 누가 이슈에 "이 이슈는 워크포스 연동이 아니다"라고 붙인다. 승인 앱이 그 이슈의 잠금을 푼다.
- 누가 "이 사람의 팀장은 나"라는 조직 문서를 붙인다. 남의 워크로그를 인증할 수 있게 된다.

### 서명이 있으면 막힌다

보내는 앱이 문서마다 **비밀 키로 도장**을 찍는다. 받는 앱은 **공개 키로 도장이 진짜인지** 확인한 문서만 쓴다. 사람은 비밀 키가 없으니 진짜 도장을 만들 수 없다.

도장 안에는 사이트 id 와 대상(사람·이슈·기간)이 함께 묶여 있다. 그래서 A 회사 사이트의 문서를 B 회사 사이트에 복사해 붙여도, 다른 사람이나 다른 이슈에 옮겨 붙여도 거부된다.

이것이 승인 앱 규칙 9번("엔티티 프로퍼티는 믿지 않는다 — 앱 간 교환은 서명 검증 후에만")이다.

### 키가 없으면 어떻게 되나

받은 문서를 전부 "모르는 도장(UNKNOWN_KID)"으로 보고 무시한다. 두 앱은 각자 혼자 있는 것처럼 동작한다. 오류는 나지 않지만 다음 기능이 **하나도 동작하지 않는다.**

- 인증된 시간으로 워크포스 원가 계산
- 워크포스 팀장 정보로 인증 범위 정하기
- 워크포스 연동 이슈의 워크로그 통제
- 워크포스 탭에서 쓴 워크로그의 출처 표시(없으면 "다른 경로 입력"으로 잡힌다)

## 3. 누가, 어디에, 무엇을

| 무엇 | 어디에 | 누가 | 언제 |
|---|---|---|---|
| 공개 키 두 개 | 두 앱 코드의 키 목록 파일(`keyring.js`) | 우리 개발자 | 처음 한 번, 키를 바꿀 때 |
| 승인 앱 비밀 키 | 승인 앱의 Forge 환경 변수(암호화) | 우리 개발자 | 환경마다 한 번 |
| 워크포스 비밀 키 | 워크포스의 Forge 환경 변수(암호화) | 우리 개발자 | 환경마다 한 번 |
| 연동 켜기 | 승인 앱 설정 > 워크포스 연동 | 고객 관리자 | 설치 후 한 번 |

Forge 환경 변수는 **고객 사이트별이 아니라 앱 환경별**(development·staging·production)로 들어간다. 운영 환경에 한 번 넣으면 모든 고객 사이트가 같은 키를 쓴다. 도장 안에 사이트 id 가 묶여 있으니 사이트끼리 섞이지 않는다.

## 4. 코드가 어떻게 생겼나

### 공통 계약 파일 (두 리포에 **바이트까지 같은** 사본)

| 승인 앱 | 워크포스 | 하는 일 |
|---|---|---|
| `src/integration/workforce/contract.js` | `src/integration/approval/contract.js` | 문서 종류(typ)·키 이름·크기 상한·형식 검사 |
| `.../canonical.js` | `.../canonical.js` | 서명할 내용을 항상 같은 바이트로 만드는 규칙 |
| `.../ed25519.js` | `.../ed25519.js` | 서명·검증 계산(Node 내장 crypto) |
| `.../signature.js` | `.../signature.js` | 문서 봉투를 열고 도장을 확인하는 순서 |
| `.../base64url.js` | `.../base64url.js` | 인코딩 |
| `.../keyring.js` | `.../keyring.js` | **공개 키 목록** — 이번에 손대는 파일 |
| `.../vectors.json` | `.../vectors.json` | 두 앱이 같은 결과를 내는지 보는 시험 문서 |

두 리포의 테스트가 이 파일들의 지문(sha256)을 서로 대조한다. 한쪽만 고치면 테스트가 깨진다. **반드시 두 리포에 똑같이 고친다.**

### 키를 읽고 쓰는 곳

| 앱 | 파일 | 하는 일 |
|---|---|---|
| 승인 앱 | `src/resolver/workforce/WorkforceSigner.js` | 비밀 키로 서명, 신뢰할 워크포스 키 결정, 상태(지문) 보고 |
| 승인 앱 | `src/resolver/workforce/WorkforcePublisher.js` | 인증·결재·통제 문서를 서명해 게시 |
| 승인 앱 | `src/resolver/workforce/WorkforceLink*.js`, `src/integration/workforce/inbound.js` | 워크포스 문서를 받아 검증·보관 |
| 워크포스 | `src/resolver/approvalLink/LinkSigner.js` | 비밀 키로 서명(조직·정책·연동 신호·출처 쪽지) |
| 워크포스 | `src/resolver/approvalLink/ApprovalCertReader.js`, `ApprovalControlLookup.js` | 승인 앱 문서를 받아 검증 |
| 키 생성 | 승인 앱 `scripts/workforce-link/gen-key.mjs` | 키 한 쌍 만들기(두 앱 키 모두 이 스크립트로) |

### 환경 변수 (두 앱 같은 이름)

| 이름 | 내용 | 암호화 |
|---|---|---|
| `MOVES_LINK_SIGNING_KEY` | 이 앱의 **비밀 키**(seed, base64url 43자) | **반드시** |
| `MOVES_LINK_SIGNING_KID` | 이 앱 키의 이름(예: `ap-dev-1`) | 아니오 |
| `MOVES_LINK_TRUSTED_KIDS` | 믿을 **상대 앱** 키 이름 목록(쉼표 구분) | 아니오 |

`MOVES_LINK_TRUSTED_KIDS` 를 비워 두면 키 목록 중 **운영(prd) 키만** 믿는다. 개발·스테이징에서는 반드시 넣는다.

### 키 목록 파일의 모양

```js
export const KEYRING = Object.freeze({
  [Family.APPROVAL]: Object.freeze({
    'ap-dev-1': { x: '<승인 앱 공개 키 43자>', env: 'dev', notAfter: null },
  }),
  [Family.WORKFORCE]: Object.freeze({
    'wf-dev-1': { x: '<워크포스 공개 키 43자>', env: 'dev', notAfter: null },
  }),
});
```

- `x` 는 공개 키다. 공개돼도 괜찮다.
- `env` 는 `dev`·`stg`·`prd` 중 하나다.
- `notAfter` 는 키를 그만 믿을 시각(epoch ms)이다. 평소엔 `null`.

### 키 이름 규칙

`<앱>-<환경>-<번호>` 형식, 소문자·숫자·하이픈 3~16자.

- 승인 앱: `ap-dev-1`, `ap-stg-1`, `ap-prd-1`
- 워크포스: `wf-dev-1`, `wf-stg-1`, `wf-prd-1`
- 키를 바꿀 때는 번호를 올린다(`ap-prd-2`).

## 5. 따라 하기 — 개발 환경

준비물:
- 두 리포 최신 상태
- Forge CLI 로그인(`forge whoami` 로 확인)
- 비밀번호 관리자 같은 안전한 보관 장소

### 5-1. 키 두 쌍 만들기

승인 앱 리포에서 실행한다. **에이전트나 CI 가 아니라 사람이 직접 실행한다.**

```bash
cd C:\CloudJira\moves-approval-jira
node scripts/workforce-link/gen-key.mjs ap-dev-1
node scripts/workforce-link/gen-key.mjs wf-dev-1
```

각 명령이 이렇게 출력한다.

```json
{
  "kid": "ap-dev-1",
  "seed": "<비밀 키 43자>",
  "keyringEntry": { "ap-dev-1": { "x": "<공개 키 43자>", "env": "dev", "notAfter": null } },
  "fingerprint": "1a2b 3c4d 5e6f 7a8b"
}
```

- `seed` 는 **비밀 키**다. 바로 비밀번호 관리자에 저장하고 터미널 출력을 지운다. 파일·커밋·채팅·이슈 댓글에 절대 남기지 않는다.
- `keyringEntry` 는 공개 키다. 다음 단계에서 코드에 넣는다.
- `fingerprint` 는 나중에 화면과 대조할 지문이다. 같이 적어 둔다.

### 5-2. 공개 키를 두 앱 코드에 넣기

다음 두 파일을 **똑같이** 고친다.
- 승인 앱 `src/integration/workforce/keyring.js`
- 워크포스 `src/integration/approval/keyring.js`

넣는 위치:
- `ap-dev-1` 의 `keyringEntry` 내용 → `[Family.APPROVAL]` 안
- `wf-dev-1` 의 `keyringEntry` 내용 → `[Family.WORKFORCE]` 안

두 파일이 같은지, 계약 테스트가 통과하는지 확인한다.

```bash
# 승인 앱
npx jest src/integration
# 워크포스
npx jest src/integration
```

워크포스의 `vectors.test.js` 에는 계약 파일 지문 표가 있다. `keyring.js` 지문이 바뀌었다는 실패가 나오면 그 표의 `keyring.js` 값을 새 지문으로 고친다(승인 앱에서 `node -e "..."` 로 구한 LF 기준 sha256).

커밋 메시지 예: `#RFC-220 [CHORE] 워크포스 연동 개발 환경 공개 키 등록(ap-dev-1, wf-dev-1)`.

### 5-3. 비밀 키를 Forge 환경 변수에 넣기

방법이 두 가지다. **스테이징·운영은 파이프라인 방법(B)을 쓴다.** 개발 환경은 A 든 B 든 괜찮다.

#### B. 파이프라인으로 넣기 (권장)

두 리포의 `bitbucket-pipelines.yml` 배포 단계가 deploy 직전에 `scripts/ci/forge-link-keys.sh <환경>` 을 부른다.
이 스크립트가 Bitbucket 의 **환경별 Secured 변수**를 읽어 Forge 환경 변수에 넣는다. 변수가 없으면 아무것도 하지 않고 넘어간다.

1. Bitbucket 에서 리포 > **Repository settings > Deployments** 로 간다.
2. 환경(Test·Staging·Production)마다 아래 변수를 추가한다. **비밀 키는 반드시 Secured 를 체크**한다.

| Bitbucket 변수 | 값 | Secured | Forge 변수로 들어가는 이름 |
|---|---|---|---|
| `LINK_SIGNING_SEED` | 이 앱의 seed | **예** | `MOVES_LINK_SIGNING_KEY`(암호화) |
| `LINK_SIGNING_KID` | 이 앱 키 이름 | 아니오 | `MOVES_LINK_SIGNING_KID` |
| `LINK_TRUSTED_KIDS` | 상대 앱 키 이름 | 아니오 | `MOVES_LINK_TRUSTED_KIDS` |

   - 승인 앱 리포에는 `ap-...` seed 와 이름을, `LINK_TRUSTED_KIDS` 에는 `wf-...` 를 넣는다.
   - 워크포스 리포에는 그 반대로 넣는다.
   - 운영(Production) 환경은 `LINK_TRUSTED_KIDS` 를 비워 둬도 된다.
3. 해당 환경 배포 버튼을 누른다. 로그에 `[link-keys] <환경>: 서명 키 설정(kid=...)` 이 찍히면 된 것이다. seed 값은 로그에 찍히지 않는다.

파이프라인 대응:
- 승인 앱: `develop` → Staging, `master` → Production, 수동 실행 `deploy-development` → Test(개발 환경)
- 워크포스: `develop` → Staging, `master` → Production(개발 환경은 파이프라인 밖)

키를 바꿀 때는 Bitbucket 변수만 바꾸고 배포 버튼을 누르면 된다. seed 원본이 사람 PC 를 거치지 않고 Bitbucket 보관소에만 남는 것이 이 방법의 장점이다.

#### A. 직접 넣기 (개발 환경, 또는 파이프라인을 못 쓸 때)

승인 앱 리포에서:

```bash
forge variables set --encrypt -e development MOVES_LINK_SIGNING_KEY <ap-dev-1 의 seed>
forge variables set -e development MOVES_LINK_SIGNING_KID ap-dev-1
forge variables set -e development MOVES_LINK_TRUSTED_KIDS wf-dev-1
```

워크포스 리포에서:

```bash
forge variables set --encrypt -e development MOVES_LINK_SIGNING_KEY <wf-dev-1 의 seed>
forge variables set -e development MOVES_LINK_SIGNING_KID wf-dev-1
forge variables set -e development MOVES_LINK_TRUSTED_KIDS ap-dev-1
```

`--encrypt` 를 빼먹지 않는다. 암호화한 변수는 나중에 다시 꺼내 볼 수 없다. 그래서 5-1 의 보관이 중요하다.

명령줄 기록(history)에 seed 가 남지 않게 주의한다. PowerShell 이면 실행 후 `Clear-History`, Git Bash 면 `history -d` 로 지운다.

### 5-4. 두 앱 배포

공개 키가 코드에 들어갔으니 두 앱 모두 다시 배포한다. B 방법을 썼다면 5-3 의 배포 버튼이 이 단계다.

```bash
# 각 리포에서
forge deploy -e development
forge install --upgrade   # scope 가 바뀐 경우만
```

### 5-5. 확인

1. **승인 앱 설정 > 워크포스 연동** 화면을 연다.
   - "서명 가능"으로 나와야 한다.
   - 공개 키 지문이 5-1 에서 적어 둔 `ap-dev-1` 지문과 같아야 한다.
   - 신뢰하는 워크포스 키에 `wf-dev-1` 이 보여야 한다.
2. **워크포스 설정의 연동 진단 카드**에서 키 항목이 통과인지 본다.
3. 승인 앱에서 **"워크포스 연동 사용"** 을 켠다.
4. 실제로 오가는지 본다.
   - 워크포스 쪽 조직 문서가 승인 앱에 검증 수신되는지: 승인 앱 연동 화면의 "마지막 검증 수신" 시각
   - 승인 앱에서 워크로그 하나를 인증한 뒤 몇 분 안에 워크포스 원가 화면의 "확정 원가"에 반영되는지

## 6. 운영·스테이징 환경

출시 직전에 같은 절차를 한 번 더 한다. 다른 점은 이것뿐이다.

- 비밀 키는 **B(파이프라인) 방법으로만** 넣는다. Bitbucket Deployments 의 Staging·Production 환경 변수에 넣고 배포 버튼을 누른다.
- 키 이름: `ap-prd-1`, `wf-prd-1`(스테이징은 `stg`)
- 환경: `-e production`(스테이징은 `-e staging`)
- 운영은 `MOVES_LINK_TRUSTED_KIDS` 를 **비워 둬도 된다.** 기본값이 prd 키만 믿는 것이기 때문이다. 넣는다면 상대 앱의 prd 키 이름만 넣는다.
- **개발 키를 운영에 쓰지 않는다.** 개발 키는 여러 사람이 다루므로 새기 쉽다.
- 운영 비밀 키는 담당자 두 명 이상이 접근할 수 있는 회사 비밀 보관소에 둔다.

## 7. 키를 바꾸거나 폐기할 때

### 정기 교체 (예: 1년마다)

1. 새 키를 만든다(`ap-prd-2`).
2. 새 공개 키를 두 앱 키 목록에 **추가**한다. 옛 키는 아직 지우지 않는다. 두 앱을 배포한다.
3. 비밀 키 환경 변수를 새 키로 바꾼다(`MOVES_LINK_SIGNING_KEY`, `MOVES_LINK_SIGNING_KID`). 상대 앱의 `TRUSTED_KIDS` 를 쓰고 있다면 새 이름을 넣는다.
4. 문서를 새 키로 **다시 게시**한다. 기다리기만 하면 오래 걸린다.
   - 승인 앱: 설정 > 워크포스 연동의 **"전체 재게시"**. 실제 게시는 다음 일일 동기화 때 된다.
   - 워크포스: 연동 진단 카드의 **연동 신호 일괄 게시**. 이슈 연동 신호는 원래 28일 유효라 저절로는 최대 그만큼 걸린다.
   - 양쪽 연동 화면의 "마지막 검증 수신" 시각이 교체 이후로 바뀌었는지 확인한다.
5. 옛 키에 `notAfter` 를 지금 시각으로 넣거나 목록에서 지우고 두 앱을 배포한다.

### 비밀 키가 샌 것 같을 때

1. 위 교체 절차를 **바로** 진행한다. 기다리지 않는다.
2. 샌 키는 즉시 목록에서 지우고 두 앱을 배포한다. 그 키로 만든 서명은 그 순간부터 전부 무효가 된다.
3. 그동안 받은 문서가 다시 게시될 때까지 해당 기능은 잠깐 단독 동작으로 돌아간다. 오류는 나지 않는다.
4. 감사 화면에서 그 기간에 비정상 문서가 들어왔는지 확인한다.

## 8. 문제가 생겼을 때

| 증상 | 원인 | 확인·조치 |
|---|---|---|
| 승인 앱 연동 화면이 "서명 불가" | 비밀 키 환경 변수가 없거나 형식이 틀림 | `forge variables list -e <환경>` 으로 두 변수가 있는지 본다. seed 는 43자여야 한다. 다시 넣고 배포 |
| "키 목록에 없음(inKeyring:false)" | 공개 키를 키 목록에 안 넣었거나 이름이 다름 | `MOVES_LINK_SIGNING_KID` 와 `keyring.js` 의 이름을 대조. 두 앱 배포 여부 확인 |
| 상대 문서가 전부 `UNKNOWN_KID` | 상대 키가 키 목록에 없음 | 상대 앱 공개 키를 **양쪽** `keyring.js` 에 넣었는지, 두 앱을 다 배포했는지 확인 |
| 상대 문서가 `UNTRUSTED_KID` | 키는 목록에 있지만 믿는 목록에 없음 | 개발·스테이징이면 `MOVES_LINK_TRUSTED_KIDS` 에 상대 키 이름을 넣는다 |
| `BAD_SIGNATURE` | 비밀 키와 공개 키 짝이 안 맞음, 또는 계약 파일이 두 리포에서 다름 | 지문 대조. `npx jest src/integration` 을 두 리포에서 실행 |
| 배포 로그에 `[link-keys] ... 형식이 아니다` 로 실패 | Bitbucket `LINK_SIGNING_SEED` 가 43자가 아님(공백·줄바꿈 포함 등) | 변수 값을 다시 붙여 넣는다 |
| 배포 로그에 `LINK_SIGNING_SEED 없음` | 그 Bitbucket 환경에 변수가 없음 | Deployments 의 **해당 환경**에 넣었는지 확인(저장소 전체 변수가 아니라 환경 변수) |
| 연동 상태가 계속 "미연결(NOT_LINKED)" | 워크포스 문서를 한 번도 검증 수신하지 못함 | 워크포스 쪽 키 설정과 진단 카드 먼저 확인. 승인 앱 "연동 사용"이 켜져 있는지 확인 |
| 계약 테스트가 지문 불일치로 실패 | 한쪽 리포만 계약 파일을 고침 | 두 리포 파일을 같게 맞추고 지문 표 갱신 |

## 9. 하지 말아야 할 것

- 비밀 키(seed)를 파일·커밋·채팅·이슈·로그에 남기지 않는다.
- 비밀 키를 `--encrypt` 없이 넣지 않는다.
- 한 리포의 `keyring.js` 만 고치지 않는다.
- 운영에서 개발 키를 쓰지 않는다.
- 키를 목록에서 지우기 전에 교체 절차를 건너뛰지 않는다. 지우는 순간 그 키의 서명이 전부 무효가 된다.
