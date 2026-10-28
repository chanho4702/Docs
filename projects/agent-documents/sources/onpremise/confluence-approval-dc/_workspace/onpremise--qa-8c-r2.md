# QA 8c — 2차 검증 (재작업 R1~R6 확인, 2026-08-13)

대상: `_workspace/spec-8c4-rework.md` (1차 QA `_workspace/qa-8c.md`의 재작업 지시문)
기준 커밋: `24862fe` (`git diff HEAD` = 8c 순수 변경분)
검증자: approval-qa (독립 실행). Codex 완료 보고는 신뢰하지 않고 게이트를 직접 재실행함.
**범위: 코드 레벨만.** 실기동(브라우저) 확인은 코디네이터가 수행한다 — Codex도 미수행을 정직하게 보고했다.

## verdict: **PASS**

| 심각도 | 1차 | 2차 |
|--------|-----|-----|
| 치명 | 1 | **0** |
| 중대 | 3 | **0** |
| 경미 | 4 | 1 (해소 4 · 신규 1) |

1차 치명 1건·중대 3건·경미 4건이 **전부 해소**됐다. 수정은 지정 지점 밖으로 새지 않았고,
1차 PASS 항목의 회귀도 없다. 남은 1건은 상호 배타의 네 번째 방향(승인 PIN 스텝 ↔ 회수 스텝)으로,
`closeModal`이 안전망 역할을 하므로 잠김 상태를 만들지 않는다 — 1줄 수정 잔여.

---

## 게이트 재실행 결과 (직접 실행)

```
JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
mvn -B -pl approval-confluence9 -am test  → Tests run: 111, Failures: 0, Errors: 0 / BUILD SUCCESS
mvn -B -pl approval-confluence10 compile  → BUILD SUCCESS (1차와 동일 트리 외 Java 변경은 REST 1곳뿐)
```
**111 유지** — Codex 보고("테스트 무변경, Tests run: 111")와 일치. 테스트 파일 3종 mtime이
재작업 파일들보다 오래됐음을 확인했다(약화·삭제 없음).

## JS 문법 검증 (node)

```
approval.js                                   → OK
inbox   (TEMPLATE 52,349자, script 2블록)      → inbox-0.js OK, inbox-1.js OK
settings(TEMPLATE 27,285자, script 2블록)      → settings-0.js OK, settings-1.js OK
```
Sitemesh 꺾쇠 함정 0건, 미치환 토큰 0건 (1차와 동일 방식으로 재검).
inbox 템플릿이 52,231 → **52,349자(+118)** — R6의 mime 검증 문구 추가분과 일치.

## 수정 범위 이탈 검사 (PASS)

`git diff HEAD --numstat`을 1차 기록과 1:1 대조. **변한 것은 정확히 R1~R6 대상 4개 파일뿐이다:**

| 파일 | 1차 +/- | 2차 +/- | 판정 |
|------|---------|---------|------|
| `js/approval.js` | 41/3 | **68/4** | R1·R2·R3 |
| `rest/ApprovalRestResource.java` | 1/1 | **6/3** | R5 |
| `css/approval.css` | 3/0 | 3/0 (내용 교체) | R4 |
| `servlet/ApprovalInboxServlet.java` | 54/5 | 54/5 (내용 교체) | R6 |
| ApprovalMarkup / RegionMacro / PagePanel / NavMarkup / ApprovalSettingsServlet | 38/9, 57/4, 55/1, 6/1, 13/0 | **전부 동일** | 무수정 ✓ |
| 테스트 3종 | 55/0, 14/0, 13/0 | **전부 동일** | 무수정 ✓ |

파일 mtime 정렬로 교차 확인: 최신 4개가 `ApprovalInboxServlet` → `ApprovalRestResource` →
`approval.css` → `approval.js`이고, `NavMarkup` 이하 6개는 원 8c 실행 시점 그대로다.
**R1~R6 밖 파일은 손대지 않았다.**

---

# R1~R6 항목별 실측

## R1 (치명 해소) 반려 확정 TypeError — **PASS, 실행 추적 완료**

**수정 확인** `approval.js:584-586`
```js
post(restBase() + '/' + encodeURIComponent(rejectContainer.dataset.approvalRequestId)
    + '/reject?actorKey=' + encodeURIComponent(rejectContainer.dataset.approvalActorKey || '')
    + '&reason=' + encodeURIComponent(reason),
    confirmModal && confirmModal.dataset.approvalPinRequired === '1'
        ? new URLSearchParams({pin: rejectPin}) : undefined)
```
기준이 `rejectContainer`(패널/영역 컨테이너 — 모달의 **조상**)에서
`confirmModal`(`:570` `rejectConfirmButton.closest('.dmove-approval-modal')` — **버튼에서 상향 탐색**)로 교체됐다.
`confirmModal &&` null 가드도 지시대로 들어갔다.

**off(signatureEnabled=false) 실행 추적 — TypeError 경로 소멸 확인**

| 단계 | 값 | 비고 |
|------|-----|------|
| `rejectConfirmButton.closest('.dmove-approval-modal')` | 모달 요소 | 버튼은 모달의 자손 → 정상 해결 |
| `confirmModal.dataset.approvalPinRequired` | `"0"` | `ApprovalMarkup:180-182`이 off에서도 `"0"`을 출력 |
| `=== '1'` | `false` | |
| 삼항 결과 | `undefined` | |
| `post(url, undefined)` | `fetch(url, {..., body: undefined})` | |

`confirmModal`이 만에 하나 null이어도 `&&` 단락으로 `undefined`가 되어 **역참조가 일어나지 않는다.**
1차의 `null.dataset` 경로는 완전히 사라졌다.

**`body: undefined`의 무해성 확인** — Fetch 표준상 dictionary 멤버에 `undefined`를 넣는 것은
"멤버 미지정"과 동일하게 처리되므로, 배치 전의 `{method, credentials, headers}`(body 키 없음)와
바이트 수준으로 같은 요청이 나간다. 서버 쪽도 `24862fe`가 `@FormParam`을 `formOnlyParam`으로
바꿔 바디 없는 POST를 정상 처리한다.

**다른 `post()` 호출부 회귀 없음** — 전수 확인(5곳):
`:584`(반려, 2인자) · `:612`(승인 PIN, 2인자) · `:662`(회수, 1인자) ·
`:807`(승인 폴스루, 1인자) · `:895`(1인자). 1인자 호출은 전부 `body: undefined` = 기존과 동일.

## R2 (중대 해소) PIN 오류 접두 제거 — **PASS, 양쪽 스텝 모두 적용**

**헬퍼 신설** `approval.js:58-62`
```js
function pinErrorText(error, fallback) {
    var body = (error && error.body) || '';
    var match = /^(PIN_NOT_SET|PIN_INVALID|PIN_LOCKED):([\s\S]*)$/.exec(body);
    return match ? match[2] : (body || fallback);
}
```

**적용 지점 — 인라인 메시지 출력 직전에 걸린다**
- **반려 스텝** `:588` — `reasonMessage.textContent = pinErrorText(error, '반려 처리에 실패했습니다.');`
  → `.dmove-approval-reject-message`에 접두 제거 후 표시 ✓
- **승인 PIN 스텝** `:614` — `pinMessage.textContent = pinErrorText(error, '승인 처리에 실패했습니다.');`
  → `.dmove-approval-pin-message`에 접두 제거 후 표시 ✓

**동작 검증**
| 서버 본문 | 화면 표시 |
|-----------|-----------|
| `PIN_INVALID:PIN이 올바르지 않습니다. 남은 시도 4회` | `PIN이 올바르지 않습니다. 남은 시도 4회` ✓ |
| `PIN_LOCKED:잘못된 시도가 반복되어 15분간 잠겼습니다.` | `잘못된 시도가 반복되어 15분간 잠겼습니다.` ✓ |
| `PIN_NOT_SET:서명 PIN이 등록되어 있지 않습니다. 업무함 > 내 서명에서 등록하세요.` | 접두 제거된 문장 ✓ |

**회귀 없음 확인** — 접두 없는 기존 오류는 `match === null`이라 `(body || fallback)`을 반환한다.
이는 수정 전 표현식 `(error && error.body) || '…'`과 **완전히 동일**하다(빈 문자열도 양쪽 다 fallback).
`:807`·`:895`의 비-PIN 경로는 손대지 않았고, 그 경로에서는 PIN 오류가 발생할 수 없다
(`pinRequired === '1'`이면 폴스루 전에 return하므로).

## R3 (중대 해소) 상호 배타·ESC·닫기 리셋 — **PASS 3/4** (네 번째는 아래 N1)

| 지시 | 위치 | 결과 |
|------|------|------|
| ① ESC가 PIN 스텝 우선 처리 | `:826-830` | **PASS** |
| ② 회수 열기가 PIN 닫기 | `:625, :628` | **PASS** |
| ③ 반려 열기의 `:not` 셀렉터 의존 제거 | `:548, :551` | **PASS** |
| ④ `closeModal` PIN 리셋 + 승인 버튼 disabled 복구 | `:445-454` | **PASS** |

**① ESC** — `--reject` 분기 **뒤**, `[data-approval-cancel-back]` 폴백 **앞**에 삽입:
```js
if (confirm.classList.contains('dmove-approval-confirm--pin')) {
    var pinBack = open.querySelector('[data-approval-pin-back]');
    if (pinBack) { pinBack.click(); }
    return;
}
```
`pinBack` 핸들러(`:592-599`)가 PIN 박스를 숨기고 **승인 버튼 `disabled = false` + `focus()`**까지 복구한다 ✓

**② 회수 열기** — `cancelPinBox`를 따로 잡아 `hidden = true` ✓
**③ 반려 열기** — `rejectPinConfirm = rejectModal.querySelector('.dmove-approval-confirm--pin')`을
**독립적으로** 잡아 숨긴다. DOM 순서에 의존하던 `:not(.dmove-approval-confirm--reject)` 셀렉터가
회수 박스를 먼저 잡아 PIN을 놓치던 1차 결함이 해소됐다(기존 `cancelConfirm` 라인은 그대로 유지 — 회수 박스 숨김 목적) ✓

**④ closeModal** `:445-454`
```js
var pinBox = modal.querySelector('.dmove-approval-confirm--pin');
if (pinBox) {
    pinBox.hidden = true;
    var pinMessage = pinBox.querySelector('.dmove-approval-pin-message');
    if (pinMessage) { pinMessage.textContent = ''; }
    var pinInput = pinBox.querySelector('[data-approval-pin-input]');
    if (pinInput) { pinInput.value = ''; }
    var approveButton = modal.querySelector('[data-approval-action="approve"]');
    if (approveButton) { approveButton.disabled = false; }
}
```
지시한 4가지(숨김·메시지 비우기·input 비우기·승인 버튼 복구)가 모두 들어갔다.
**1차의 "모달 재진입 시 승인 동선이 막힌다"가 해소**됐고, PIN 원문이 DOM에 남지 않는 부수 효과도 있다.

## R4 (중대 해소) 도장 CSS — **PASS, var() 의존 완전 제거**

`approval.css:803-805` 현재 값:
```css
.dmove-approval-stamp--auto { display:inline-flex; width:34px; height:34px; margin-left:6px;
  align-items:center; justify-content:center; border:1.5px solid #216e4e; border-radius:50%;
  background:#dcfff1; color:#216e4e; font-weight:700; font-size:12px; line-height:1;
  vertical-align:middle; white-space:nowrap; transform:rotate(-6deg); }
.dmove-approval-stamp--image { max-height:34px; max-width:68px; margin-left:6px; vertical-align:middle; }
.dmove-approval-pin-message:not(:empty) { display:block; margin-top:8px; color:#ae2e24; }
```
- **`grep -c "var(--" approval.css` → 0** — 파일 전체에서 var() 참조가 사라졌다.
  이제 `#dmove-approval-app` 스코프 밖(콘텐츠 페이지의 패널·매크로 상세 모달)에서도 값이 그대로 적용된다.
- **`font` 단축 속성이 롱핸드 3개로 분리**됐다 — 1차에 지적한
  "var가 invalid이면 단축 선언 전체가 무효가 되어 font-weight·font-size까지 날아간다"가 해소.
- **새 색상 값 없음(금지 9 준수)** — `#216e4e`는 `:71-72, :105, :701, :771`,
  `#dcfff1`은 `:701`(`.dmove-approval-pill--approved` 배경), `#ae2e24`는 `:800-802`에 이미 있는 값이다.
- 업무함(`#dmove-approval-app` 안)은 하드코딩이라도 동일하게 렌더된다 — 회귀 없음.

## R5 (경미 해소) 매직바이트 메시지 분리 — **PASS, 실제 분기에 걸린다**

`ApprovalRestResource.java:962-972` — 1차의 "하나로 묶인 조건문"이 **둘로 쪼개졌다**:
```java
byte[] decoded = Base64.getMimeDecoder().decode(data);
if (decoded.length > 51_200) {
    return 400 "서명 이미지는 50KB 이하여야 합니다.";          // ← 크기 위반 전용
}
if (decoded.length < 8
        || (png && !magic) || (jpeg && !magic)) {
    return 400 "서명 데이터 형식이 올바르지 않습니다.";          // ← 형식/하한 전용
}
```
**입력별 응답 추론**
| 입력 | 응답 |
|------|------|
| 60KB PNG | "서명 이미지는 50KB 이하여야 합니다." ✓ |
| 정상 크기 GIF(mime=image/png로 위조) | "서명 데이터 형식이 올바르지 않습니다." ✓ (1차엔 "50KB 이하") |
| `data="="` (0바이트) | "서명 데이터 형식이 올바르지 않습니다." ✓ |
| 디코드 예외 | catch → "서명 데이터 형식이 올바르지 않습니다." ✓ |

qa-8a2 N2 → 8c 변경 7(문구만 교체, 증상 미해소) → **이번에 실제 증상까지 해소**됐다.

## R6 (경미 해소 3건) — **PASS**

**(a) PIN 클라 검증 완화** `ApprovalInboxServlet:969`
`/^\\d{4,12}$/` → **`/^\\S{4,12}$/`** (text block에서 `/^\S{4,12}$/`로 렌더 — 금지 4 이스케이프 두 배 준수).
서버 `ApprovalPinService.validate`의 `\S{4,12}`와 **정확히 일치**하고 설계 D4("숫자 강제 안 함")에 부합.
안내 문구도 "PIN은 4~12자리 숫자로…" → **"PIN은 4~12자로 두 값이 일치해야 합니다."**로 정정됐다.
지시대로 서버는 건드리지 않았다 ✓

**(b) 업로드 mime 클라 검증** `ApprovalInboxServlet:967`
```js
if (file.type !== "image/png" && file.type !== "image/jpeg") {
    signatureMessage("PNG 또는 JPEG 파일만 등록할 수 있습니다."); return;
}
if (file.size > 51200) { signatureMessage("이미지는 50KB 이하여야 합니다."); return; }
```
mime 검사가 **크기 검사보다 앞**에 있어 메시지가 정확하다 ✓

**(c) 반려 PIN input 비우기 — 성공 경로 포함** `approval.js:583`
```js
rejectConfirmButton.disabled = true;
if (rejectPinField) { rejectPinField.value = ''; }   // ← post() 호출 직전
post(...)
```
전송 직전에 비우므로 성공·실패 양쪽에서 값이 남지 않는다. `.catch`의 기존 비우기(`:587`)도 유지됐다
(무해한 중복). 승인 스텝(`:611` `pinInput.value = ''`)과 동일한 패턴이 됐다 ✓

---

# 신규 경미 1건

## N1. 승인 PIN 스텝을 열 때 **회수 스텝**이 닫히지 않는다 (상호 배타 4번째 방향)

**파일:줄** `approval.js:793-800`
```js
if (approvalModal && approvalModal.dataset.approvalPinRequired === '1') {
    var pinBoxOpen  = approvalModal.querySelector('.dmove-approval-confirm--pin');
    var rejectBoxOpen = approvalModal.querySelector('.dmove-approval-confirm--reject');
    if (rejectBoxOpen) { rejectBoxOpen.hidden = true; }     // ← 반려만 닫는다
    if (pinBoxOpen) { pinBoxOpen.hidden = false; ... }
    button.disabled = true;
    return;
}
```
R3로 나머지 세 방향은 대칭이 됐으나 이 방향만 남았다:

| 여는 스텝 | 반려 닫기 | 회수 닫기 | PIN 닫기 |
|-----------|-----------|-----------|----------|
| 반려(`:548-551`) | — | ✓ | ✓ |
| 회수(`:622-628`) | ✓ | — | ✓ |
| **승인 PIN(`:793-800`)** | ✓ | **✗** | — |

**영향** — 요청자가 동시에 승인자인 경우(canCancel && myTurn)에만 발생한다.
회수 스텝을 열어 둔 채 "승인"을 누르면 회수 스텝과 PIN 스텝이 동시에 보인다.
그 상태에서 ESC를 누르면 `open.querySelector('.dmove-approval-confirm:not([hidden])')`가
**DOM 순서상 첫 번째**인 회수 박스를 잡아 `[data-approval-cancel-back]`을 클릭한다 →
회수 박스만 닫히고 PIN 스텝은 남는다. **두 번째 ESC**에서 PIN 박스가 잡혀 정상 처리된다.

**치명이 아닌 이유** — `closeModal`(R3 ④)이 PIN 박스와 승인 버튼 `disabled`를 모두 리셋하므로
**잠김 상태로 굳지 않는다.** 모달을 닫으면 언제나 깨끗한 상태로 복구된다.

**제안 수정** (1줄 추가)
```js
    var cancelBoxOpen = approvalModal.querySelector('.dmove-approval-confirm:not(.dmove-approval-confirm--reject):not(.dmove-approval-confirm--pin)');
    if (cancelBoxOpen) { cancelBoxOpen.hidden = true; }
    var cancelOpenButton = approvalModal.querySelector('[data-approval-cancel]');
    if (cancelOpenButton) { cancelOpenButton.disabled = false; cancelOpenButton.setAttribute('aria-expanded', 'false'); }
```
(회수 버튼의 `disabled`/`aria-expanded` 복구까지 넣어야 `cancel` 핸들러가 걸어 둔 상태가 풀린다.)

---

# 1차 PASS 항목 회귀 스팟체크 — 되돌림 없음

| 1차 PASS 항목 | 재확인 | 결과 |
|---------------|--------|------|
| **pin이 query에 유입되지 않음** | `grep "pin="` 전수 → **0건** (approval.js·InboxServlet) | 유지 ✓ |
| PIN input 속성(`type=password` 등) | `ApprovalMarkup` 무수정(mtime·numstat) | 유지 ✓ |
| off 무영향 — 승인 폴스루 | `dataset.approvalPinRequired === '1'` 가드 무변경, off면 기존 URL로 즉시 POST | 유지 ✓ |
| off 무영향 — 반려 | **1차 치명 → 해소** | 개선 ✓ |
| off 무영향 — 패널/매크로 리졸버 | `ApprovalPagePanel`·`ApprovalRegionMacro` 무수정 → off면 `null`, 조회 0회 | 유지 ✓ |
| off 무영향 — 설정 화면 | `ApprovalSettingsServlet` 무수정 | 유지 ✓ |
| 리졸버 메서드 로컬 Map(싱글턴 필드 캐시 금지) | 두 파일 무수정 | 유지 ✓ |
| `appendTimeline` 무수정(설계 결정) | `ApprovalMarkup` 무수정 | 유지 ✓ |
| Javadoc 1블록 병합 | `ApprovalMarkup` 무수정 | 유지 ✓ |
| 반려 스텝 2중첩 없음 | `appendRejectConfirmation` 무수정, PIN 필드가 같은 섹션 안 | 유지 ✓ |
| 업무함 상세 도장 contextPath 결합 | `ApprovalInboxServlet:521-529` 무변경(R6는 967·969행) | 유지 ✓ |
| 신규 테스트 2건 | 카운트·mtime 불변, 111 그린 | 유지 ✓ |
| 설정 테스트 강화(qa-8a2 N4) | `ApprovalRestResourceSettingsTest` 무수정 | 유지 ✓ |
| 코디네이터 직접 수정분(`e57169a`) | css 삭제 0줄, 서블릿 삭제분은 8c 자체 교체분뿐 | 유지 ✓ |

---

# 결론 및 코디네이터 인수인계

**코드 레벨 PASS.** 실기동 확인 후 커밋 가능하다.

## 실기동 확인 순서 (우선순위 순)

1. **최우선 — off 상태 반려** (1차 치명의 실증)
   `signatureEnabled=false`(기본)에서 패널·영역 매크로 양쪽의 상세 모달에서 **반려 확정**이
   실제로 처리되는지. 1차 결함은 버튼을 눌러도 아무 반응이 없고 콘솔에 TypeError만 남는 형태였다.
   브라우저 콘솔을 열어 **오류 0건**을 함께 확인할 것.
2. **off 나머지 동선** — 승인, 회수, 요청 생성, 업무함 목록·상세, 설정 저장.
3. **on + PIN off** — 도장 렌더를 **콘텐츠 페이지의 패널·매크로 상세 모달에서** 확인
   (R4가 고친 지점이 정확히 여기다. 업무함은 1차에도 정상이었다).
   자동 도장이 초록 테두리(`#216e4e`)·연초록 배경(`#dcfff1`)·굵은 12px·-6deg 회전으로 보여야 한다.
   등록 서명이 있으면 이미지가 34px 높이로 제한되는지도 확인.
4. **on + PIN on** —
   - 승인 → PIN 스텝 → 정답 승인
   - 반려 → 사유 + PIN 한 화면에서 확정(스텝 2중첩 없음)
   - 오답/미등록/5회 잠금 3오류가 **접두 없이** 인라인 표시되는지 (R2)
   - ESC로 PIN 스텝만 닫히고 승인 버튼이 다시 활성화되는지 (R3 ①)
   - PIN 스텝 연 채 모달 닫고 재진입 → 깨끗한 상태인지 (R3 ④)
   - **N1 재현 시도**: 요청자 본인이 승인자인 요청에서 회수 스텝을 연 뒤 승인 클릭 →
     두 스텝이 겹쳐 보이면 N1 확정(모달 닫기로 복구됨).
5. **내 서명 화면** — 캔버스 그리기·빈 캔버스 차단·PNG/JPEG 외 파일 거부 메시지(R6 b)·
   50KB 초과 거부·PIN 등록(영문 섞인 4~12자도 통과해야 한다 — R6 a)·삭제.

## 잔여 (backlog 후보)

- **N1** (1줄 + 회수 버튼 상태 복구 2줄) — 8d에 끼워 넣거나 잡항목으로.
- 8a·8b에서 이월된 잡항목: `ccJoins` O(E²)(정보), CC 저장소·`/mine/cc`·`cc[]` JSON 테스트 0건,
  CC 테스트 파일 분리(`ApprovalRestResourcePinTest` → `ApprovalRestResourceCcTest`),
  "CC actor 제외" assert 격리, 단건 응답당 CC 조회 2회.

## Codex 보고 정확도 (기록)

이번 보고(수정 파일 4종, "테스트 무변경", "Tests run: 111", "node --check exit 0",
**"실기동 확인 미수행"**)는 **전 항목이 실측과 일치**했다.
특히 검증하지 않은 것을 검증했다고 하지 않고 명시적으로 미수행을 밝힌 점은
8b 1차의 "161 tests" 허위 보고와 대조적이다 — 긍정 사례로 기록한다.
