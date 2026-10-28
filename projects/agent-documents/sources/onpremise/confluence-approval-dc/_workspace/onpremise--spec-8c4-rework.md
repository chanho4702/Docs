# 재작업 8c-4 — QA FAIL 수정 (치명 1 + 중대 3 + 경미 4)

너는 이 저장소의 구현 담당이다. 배치 8c 구현이 QA에서 FAIL했다. 아래 항목만 고쳐라. **다른 줄은 건드리지 마라.**

## 금지 목록 (위반 시 전체 재작업)
1. 기존 코드 재포매팅·압축 금지. 수정 지점 외의 줄 변경 금지.
2. 검증 게이트 우회·테스트 약화 금지. 원시 NUL 금지.
3. approval-confluence10 수정 금지 (컴파일 확인만). mvn clean/package/install 금지. git 커밋 금지.
4. PIN 원문을 로그·URL·query string에 넣지 마라.
5. 하지 않은 일을 했다고 보고하지 마라. 게이트 출력의 "Tests run:" 줄을 그대로 인용하라.
6. 서블릿 text block CSS 주석에 꺾쇠 태그 문자열 금지 (Sitemesh가 style 내용을 태그로 파싱).

참고: 원 스펙 _workspace/spec-8c-signature-ui.md, QA 상세 _workspace/qa-8c.md.


# 배치 8c 재작업 — QA FAIL 수정 (치명 1 + 중대 3 + 경미 4)

너는 이 저장소의 구현 담당이다. **아래 항목만 고쳐라. 다른 코드를 건드리지 마라.**
원 스펙 `_workspace/spec-8c-signature-ui.md`의 금지 목록·UI 규칙이 그대로 적용된다
(재포매팅 금지 · 게이트 우회/테스트 약화 금지 · C10 수정 금지 · clean/package/커밋 금지 ·
PIN 원문 로그/URL 금지 · 새 CSS 색상 값 추가 금지 · 허위 보고 금지).

## R1 (치명) 반려 확정이 TypeError로 죽는다 — `approval.js:567`
`rejectContainer.closest('.dmove-approval-modal')`는 **항상 null**이다.
`rejectContainer`는 `approvalContainer()`가 돌려주는 `.dmove-approval-page-panel`/`.dmove-approval-region`이고,
상세 모달은 그 **자손**이라 `closest()`(조상만 탐색)로는 찾을 수 없다.
`null.dataset` → TypeError로 핸들러가 죽어 **`signatureEnabled=false`인 기본 구성에서도 반려가 전혀 되지 않는다.**

같은 함수 `:552`에 이미 `var confirmModal = rejectConfirmButton.closest('.dmove-approval-modal');`가
선언돼 있다. 그것을 쓰고 **null 가드를 반드시 넣어라**:
```js
confirmModal && confirmModal.dataset.approvalPinRequired === '1'
    ? new URLSearchParams({pin: rejectPin}) : undefined
```
바로 아래 PIN 핸들러(`:585`)가 `pinConfirm.closest(...)`로 **버튼에서** 올라가는 올바른 패턴이니 참고하라.

## R2 (중대) PIN 오류 접두를 떼고 표시하라 — `approval.js`
지금은 `PIN_INVALID:PIN이 올바르지 않습니다...`가 접두째 화면에 나온다.
공용 헬퍼를 `post()` 근처에 1개 추가하고 승인 PIN 핸들러·반려 핸들러 양쪽에서 사용하라:
```js
function pinErrorText(error, fallback) {
    var body = (error && error.body) || '';
    var match = /^(PIN_NOT_SET|PIN_INVALID|PIN_LOCKED):([\s\S]*)$/.exec(body);
    return match ? match[2] : (body || fallback);
}
```
접두가 없는 기존 오류는 지금과 똑같이 표시되어야 한다(회귀 금지).

## R3 (중대) PIN 스텝 상호 배타·ESC·닫기 리셋 — `approval.js`
네 지점 전부 고쳐라.
1. **ESC 핸들러**(`:797-810`): 열린 confirm이 `.dmove-approval-confirm--pin`이면
   `[data-approval-pin-back]`을 클릭하고 return하는 분기를 `--reject` 분기 옆에 추가.
2. **회수 열기**(`:599-607`): `.dmove-approval-confirm--pin`도 `hidden = true` 처리.
3. **반려 열기**(`:531`): `:not(.dmove-approval-confirm--reject)` 셀렉터는 DOM 순서상 첫 매치만 잡아
   canCancel일 때 회수 박스가 선택되고 PIN 박스가 남는다. PIN 박스를
   `rejectModal.querySelector('.dmove-approval-confirm--pin')`으로 **따로 잡아** 숨겨라.
4. **`closeModal`**(`:415-437`): PIN 박스 리셋 블록 추가 —
   `hidden = true`, `.dmove-approval-pin-message` 비우기, `[data-approval-pin-input]` 값 비우기,
   `[data-approval-action="approve"]`의 `disabled = false`.
   (지금은 승인 클릭으로 걸린 `disabled`가 모달을 닫아도 안 풀려 승인 동선이 막힌다.)

## R4 (중대) 도장 CSS가 패널·매크로에서 무효 — `approval.css:803, 805`
`var(--approved)`/`var(--approved-bg)`/`var(--sans)`/`var(--rejected)`는 **`approval.css`에 정의되어 있지 않다.**
이 파일에는 커스텀 속성 정의가 0개이고(전수 확인), 그 토큰들은
`ApprovalInboxServlet` TEMPLATE의 `#dmove-approval-app` 스코프에만 있다.
업무함은 상속으로 동작하지만 **Confluence 콘텐츠 페이지의 패널·매크로 상세 모달에서는 전부 무효**가 되고,
특히 `font: 700 12px/1 var(--sans)`는 var가 invalid이면 **단축 속성 전체가 무효**가 되어
font-weight·font-size까지 사라진다.

이 파일의 기존 관례(하드코딩)를 따르고 `font` 단축을 롱핸드로 분리하라. **새 색상 값은 쓰지 마라** —
승인 `#216e4e`(`:71-72, :701, :771`)와 승인 배경 `#dcfff1`(`:701`), 반려 `#ae2e24`(`:800-802`)는 이미 있는 값이다.
```css
.dmove-approval-stamp--auto { display:inline-flex; width:34px; height:34px; margin-left:6px;
  align-items:center; justify-content:center; border:1.5px solid #216e4e; border-radius:50%;
  background:#dcfff1; color:#216e4e; font-weight:700; font-size:12px; line-height:1;
  vertical-align:middle; white-space:nowrap; transform:rotate(-6deg); }
.dmove-approval-pin-message:not(:empty) { display:block; margin-top:8px; color:#ae2e24; }
```

## R5 (경미) 서명 업로드 오류 메시지 실제 분리 — `ApprovalRestResource.java:963-969`
8c는 `catch (IllegalArgumentException)`의 문구만 바꿨는데 **그 블록은 원래도 형식 메시지였다.**
실제 증상은 `:963-968`이 크기 초과·크기 하한(8바이트)·PNG/JPEG 매직바이트 불일치를 한 조건문에 묶어
전부 `"서명 이미지는 50KB 이하여야 합니다."`로 답하는 것이다.
조건을 둘로 쪼개라 — **크기 위반만** "서명 이미지는 50KB 이하여야 합니다.",
**매직바이트 불일치·8바이트 미만**은 "서명 데이터 형식이 올바르지 않습니다."

## R6 (경미) 나머지 3건
- **PIN 형식 정책 통일**: 업무함 내 서명 화면은 `/^\d{4,12}$/`(숫자만), 서버
  `ApprovalPinService.validate`는 `\S{4,12}`다. 설계 D4가 "숫자 강제 안 함"이므로
  **클라를 `/^\S{4,12}$/`로 완화**하고 안내 문구도 "4~12자"로 맞춰라(서버는 건드리지 마라).
- **업로드 mime 클라 검증**: `ApprovalInboxServlet`의 `[data-signature-file]` onchange에서
  `file.type`이 `image/png`·`image/jpeg`가 아니면 "PNG 또는 JPEG 파일만 등록할 수 있습니다." 메시지 후 return.
- **반려 PIN input 비우기**: 승인 스텝처럼 `post()` **호출 직전**에 `rejectPinField.value = ''`
  (지금은 `.catch` 안에만 있다). `.catch`의 기존 비우기는 남겨도 무방.

## 게이트 (전부 실행하고 "Tests run:" 줄을 그대로 인용하라)
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence10 compile
```
**현재 C9 테스트는 111건이다.** 변경 후 몇 건인지 실측해서 보고하라.
추가로 `node --check approval-confluence9/src/main/resources/js/approval.js`를 실행해 문법을 확인하라
(R1~R3이 전부 이 파일이다).

완료 보고: 변경 파일 목록 + 게이트 결과 + 미완 항목(있으면 정직하게).

---

# 코디네이터에게

1. **R1은 화면 테스트로만 드러나는 종류다.** 재작업 후 반드시 실기동으로
   **signatureEnabled=false 상태에서 반려 확정**이 되는지 먼저 확인할 것. 자동 게이트로는 영원히 못 잡는다.
2. **8c는 approval.js가 4건 중 3건(R1~R3)의 무대다.** 재작업 후 이 파일만 집중 검토하면 된다.
3. **실기동 확인 목록** (재작업 QA 통과 후):
   - off: 패널·매크로 상세 모달에서 승인/반려/회수 3동선, 업무함 목록·상세, 설정 저장
   - on + PIN off: 도장 렌더(패널·매크로·업무함 상세), 내 서명 등록/삭제/업로드
   - on + PIN on: 승인 PIN 스텝, 반려 사유+PIN 결합, 오답/미등록/잠금 3오류 메시지,
     ESC·닫기 후 재진입 시 스텝 상태
