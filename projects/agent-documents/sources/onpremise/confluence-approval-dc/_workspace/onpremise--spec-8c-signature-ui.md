# 배치 8c — 전자서명·PIN UI (설정 체크박스 + 도장 렌더 + PIN 스텝 + 내 서명 화면)

너는 이 저장소의 구현 담당이다. 아래 스펙을 **그대로** 구현하라. 설계 배경: `_workspace/design-batch8.md` (D2, D9, D10). 배치 8a(서명·PIN 백엔드, QA PASS)가 적용된 트리 위에서 작업한다.

## 금지 목록 (위반 시 전체 재작업)
1. **기존 코드 재포매팅·압축 금지.** 수정 지점 외의 줄을 건드리지 마라. 서블릿 text block의 기존 주석을 지우면 실패다.
2. 검증 게이트 우회·테스트 약화 금지.
3. 원시 NUL 바이트 삽입 금지.
4. Java text block 안의 정규식은 `\\d`처럼 이스케이프 두 배. 서블릿 TEMPLATE에 `String.format` 금지(`__TOKEN__` 치환만 — CSS `%` 충돌).
5. approval-confluence10 수정 금지 (컴파일 확인만).
6. mvn clean/package/install 금지. git 커밋 금지.
7. PIN 원문을 로그·URL·콘솔에 넣지 마라. PIN input은 `type="password"` + `autocomplete="off"`.
8. 하지 않은 일을 했다고 보고하지 마라.
9. 새 CSS 색상 값 추가 금지 — 기존 토큰(`--approved`, `--rule`, `--paper` 등)만 재사용.
10. JS는 approval.js의 document 레벨 이벤트 위임 패턴 유지. 개별 요소 addEventListener 바인딩 금지(문서 전체 위임 + closest).

## UI 규칙 (요약)
- BEM: `dmove-approval-{block}__{element}--{modifier}`, `dmove-` 접두 필수.
- 모든 동적 문자열 escape() (파일별 기존 헬퍼). AUI 버튼 클래스 사용.
- 업무함 서블릿 화면은 데코레이터 안 — 자체 다크모드/전체 배경 금지, 카드+표 중심.
- fetch: `credentials: 'same-origin'`, POST엔 `X-Atlassian-Token: no-check`. **이 배치의 예외: 서명/PIN POST는 query가 아니라 `body: new URLSearchParams({...})` (Content-Type은 URLSearchParams가 자동 설정).**
- 접근성: 인라인 스텝은 기존 반려/회수 스텝과 동일한 상호 배타·ESC 우선순위 규칙.

## 배경 (실측 완료)
- 설정 화면: `ApprovalSettingsServlet.java` — 폼 필드 :168-191, loadSettings :275-291, onsubmit :292-320.
- 설정 REST는 8a에서 `signatureEnabled`/`signaturePinRequired` QueryParam 수용(blank면 현재값 유지).
- 상세 모달: `ApprovalMarkup.detailDialog` — 단계 렌더 `appendSteps` :399-433(승인자 `:424-428`), 반려 인라인 스텝 `appendRejectConfirmation` :490-501, 승인/반려 버튼 :246-250.
- 8a가 추가한 것: `ApprovalMarkup.SignatureRef(boolean image, String imageUrl)` record + `detailDialog`의 `Function<String, SignatureRef> signatureResolver` 파라미터(현재 호출부 2곳 null 전달, 렌더 미사용).
- REST(8a): `GET /approvals/signature`(메타 {registered, mimeType, updatedAt, pinSet}), `GET /approvals/signature/image`(본인 원본), `POST /approvals/signature`(FormParam mime, data), `POST /approvals/signature/delete`, `POST /approvals/pin`(FormParam pin, currentPin), `GET /approvals/{id}/signature-image?actorKey=`(권한 검증 서빙).
- **decisions[].signature.imageUrl은 상대 경로**(`/rest/approval/1.0/...`) — 소비 측에서 `root.dataset.contextPath`(업무함) 또는 컨텍스트 패스 토큰을 앞에 붙여야 한다.
- decide REST: approve/reject에 `@FormParam("pin")` (8a). 오류 본문 접두: `PIN_NOT_SET:` `PIN_INVALID:` (403), `PIN_LOCKED:` (409).
- 업무함: `ApprovalInboxServlet.java` — TABS :721-730, detail(row) :484-526(decisions 렌더 :499-507), nav는 `NavMarkup.java`(:191-196 인박스 항목, appendInboxItem :214-241).
- 매크로/패널이 detailDialog에 넘기는 데이터 속성: `data-approval-request-id`, `data-approval-actor-key`, `data-approval-reject-required` 등 (approval.js가 소비).

## 변경 1 — 설정 화면 체크박스 2개 (D1 마무리)
`ApprovalSettingsServlet.java`:
- "전자서명" 섹션 추가(기존 필드 그룹 마크업 관례를 따라): ① `signatureEnabled` 체크박스 "전자서명 사용 — 승인 결정에 도장/서명을 표시하고, 사용자가 서명·PIN을 등록할 수 있습니다" ② `signaturePinRequired` 체크박스 "승인/반려 시 서명 PIN 검증 (전자서명 사용 시에만 적용)".
- loadSettings에서 두 값 반영, onsubmit 파라미터에 두 키 추가 (checked → "true"/"false" — 기존 boolean 체크박스 필드가 이미 있으면 그 방식 그대로).
- `signaturePinRequired` 체크박스는 `signatureEnabled`가 꺼져 있으면 disabled 처리(JS 토글).
- 렌더 테스트가 있으면(`ApprovalSettingsServlet*Test`) 새 필드 존재 assert 추가.

## 변경 2 — 상세 모달 도장/서명 렌더 (D2)
`ApprovalMarkup.appendSteps` (:424-428):
- `signatureResolver`가 null이 아니고 해당 승인자의 결정이 APPROVE일 때, decision 라벨 뒤에:
  - `SignatureRef.image()==true`: `<img class="dmove-approval-stamp dmove-approval-stamp--image" src="{escape(imageUrl)}" alt="서명">` (imageUrl은 서버 렌더 경로라 이미 컨텍스트 패스 포함 형태로 리졸버가 만든다 — 아래 변경 3).
  - false(자동 도장): `<span class="dmove-approval-stamp dmove-approval-stamp--auto" aria-hidden="true">{escape(축약이름)}</span>` — 축약: displayName 마지막 2자(1자면 그대로). 도장 옆 스크린리더용으로 기존 decision 텍스트가 이미 있으므로 aria-hidden.
- `appendSteps`에 signatureResolver와 이름 리졸버가 함께 필요하므로 파라미터를 추가하고 detailDialog에서 전달.
- **appendTimeline은 건드리지 마라** (텍스트 유지가 설계 결정).
- CSS(`approval.css`): `.dmove-approval-stamp--auto` — 인라인 블록 원형(직경 34px), `1.5px solid` currentColor, color는 `var(--approved)`, 배경 `var(--approved-bg)`, 중앙 정렬, `--sans` 700, 회전 -6deg(도장 느낌), 줄바꿈 방지. `.dmove-approval-stamp--image` — max-height 34px, max-width 68px, vertical-align middle.
- QA 잔여 편승(같은 파일): ① `detailDialog`의 Javadoc이 두 블록으로 쪼개져 마지막 블록만 유효한 상태다 — **한 블록으로 병합**하고 `nameResolver`·`signatureResolver` 설명을 모두 포함시켜라 (SignatureRef record는 Javadoc 위 유지).

## 변경 3 — 패널/매크로에서 signatureResolver 연결
`ApprovalPagePanel.java`(:145-159 부근)과 `ApprovalRegionMacro.java`(동일 패턴):
- `settings.signatureEnabled()`일 때만 리졸버 생성, off면 기존처럼 null.
- 리졸버: actorKey → APPROVE 결정자만 호출됨 → userKey 정규화(기존 displayName 이중 조회 관례와 동일 순서) → `signatureStore.find(...)` 존재 시 `new SignatureRef(true, contextPath + "/rest/approval/1.0/approvals/" + requestId + "/signature-image?actorKey=" + URL인코딩(actorKey))`, 없으면 `new SignatureRef(false, null)`.
- **렌더 1회 범위 캐시**: 같은 actorKey 반복 조회를 Map으로 캐시 (패널은 싱글턴이므로 필드 캐시 금지 — 메서드 로컬 Map).
- contextPath는 각 클래스가 이미 쓰는 방식(요청 컨텍스트)에서 얻어라. 하드코딩 금지.

## 변경 4 — PIN 인라인 스텝 (D10)
`ApprovalMarkup.java`:
- `detailDialog`에 이미 있는 `rejectionReasonRequired`처럼 `pinRequired`(boolean) 파라미터 추가(= settings.signatureEnabled && signaturePinRequired, 호출부 2곳에서 계산해 전달). 컨테이너에 `data-approval-pin-required="1|0"` 데이터 속성 출력(기존 data-approval-reject-required 옆).
- **승인 흐름**: `pinRequired`일 때 승인 버튼 클릭 → 즉시 POST하지 말고 인라인 확인 스텝(기존 반려 스텝 마크업 패턴 복제, `dmove-approval-confirm--pin`): 안내 "서명 PIN을 입력해 승인을 확정하세요" + `<input type="password" inputmode="numeric" autocomplete="off" maxlength="12" data-approval-pin-input>` + "돌아가기" + "승인 확정"(`data-approval-pin-confirm`). 마크업은 detailDialog에 hidden으로 미리 렌더.
- **반려 흐름**: 기존 반려 사유 스텝 안에서, `pinRequired`일 때 사유 textarea 아래 PIN 입력 필드가 함께 노출(스텝 2중첩 금지 — 기존 반려 확정 버튼이 PIN까지 실어 보냄).
- `pinRequired=false`면 마크업·동작 모두 현행과 완전 동일해야 한다.

`resources/js/approval.js`:
- 승인 버튼 폴스루(기존 `data-approval-action !== 'approve'` 가드 있는 분기): `container.dataset.approvalPinRequired === "1"`이면 PIN 스텝 열기(반려/회수 스텝과 상호 배타, ESC 우선순위 규칙 동일). PIN 스텝의 "승인 확정" → `fetch(url, {method:'POST', headers:{'X-Atlassian-Token':'no-check'}, credentials:'same-origin', body:new URLSearchParams({pin})})` — approve URL은 기존 query(actorKey) 유지, pin만 body.
- 반려 확정 핸들러: pinRequired면 반려 스텝의 PIN 필드 값을 body에 실어 전송(기존 reason query 유지).
- 오류 처리: 응답 본문이 `PIN_NOT_SET:`/`PIN_INVALID:`/`PIN_LOCKED:`로 시작하면 접두를 떼고 스텝 내 메시지 영역에 표시(alert 금지, 기존 인라인 message 패턴). 그 외는 기존 오류 표시 경로.
- 전송 직후 PIN input 값은 비운다.

## 변경 5 — 내 서명 화면 (D9, 업무함 `?view=signature`)
`NavMarkup.java`: "알림과 설정" 그룹에 "내 서명" 항목(알림 아래, 승인 설정 위). 아이콘은 기존 ICON_* 상수 스타일로 펜/서명 모양 SVG path 추가. 배지 없음.
`ApprovalInboxServlet.java`:
- `view=signature` 처리: 본문 카드 렌더 (TABS 항목이 아니라 별도 뷰 — 알림 뷰가 이미 이 패턴이면 그대로 따라라).
- 부팅 시 `GET __CONTEXT_PATH__/rest/approval/1.0/approvals/signature` 메타 조회 후:
  - 서버가 내려준 `signatureEnabled` 여부가 필요하다 — **미주입이면**: 서블릿이 settings를 읽어 TEMPLATE 토큰 `__SIGNATURE_ENABLED__`(true/false)로 주입하라(기존 토큰 주입 관례).
  - off: "관리자가 전자서명 기능을 켜면 사용할 수 있습니다." 안내 카드만.
  - on: ① 현재 서명 미리보기 — registered면 `<img src=".../signature/image">`, 아니면 자동 도장 미리보기(span, 접속자 displayName 마지막 2자 — `__USER_DISPLAY_NAME__` 토큰 주입) ② "서명 등록" 카드: 캔버스 320×160(테두리 `var(--rule)`, 배경 `var(--paper)`), pointer events로 그리기(펜 검정 2.5px, pointerdown/move/up + touch 대응은 pointer 이벤트로 충분), "지우기" 버튼, "그린 서명 저장" 버튼 → `canvas.toDataURL('image/png')`에서 base64 추출 → POST FormParam(mime=image/png, data). 빈 캔버스(그린 적 없음) 저장 시도는 클라에서 막고 메시지 ③ 또는 파일 업로드: `<input type="file" accept="image/png,image/jpeg">` — 50KB 초과 시 클라 메시지, FileReader로 base64 추출 후 동일 POST ④ registered면 "서명 삭제" 버튼(확인 스텝 1단 — confirm() 금지, 인라인) ⑤ "서명 PIN" 카드: pinSet이면 "현재 PIN" 필드 노출, 새 PIN + 확인 입력(2회 일치 클라 검증, 4~12자), 저장 → POST /pin FormParam. 성공/실패 메시지는 카드 내 status 영역(aria-live).
  - `signaturePinRequired`가 on인데 pinSet=false면 상단에 안내 배너("관리자가 PIN 검증을 켰습니다. PIN을 등록해야 승인/반려할 수 있습니다").
- 렌더/JS는 기존 서블릿 text block 패턴(토큰 치환, escapeForScript) 준수.
렌더 테스트(`ApprovalInboxServletRenderTest`)에 signature 뷰 항목 존재 assert 추가.

## 변경 6 — 업무함 상세 서명 표시
`ApprovalInboxServlet.java` detail(row) (:499-507): `x.signature`가 있으면 decision 라벨 뒤에 — `type==="image"`: `<img class="dmove-approval-stamp dmove-approval-stamp--image" src="{contextPath + x.signature.imageUrl}">` (**imageUrl은 상대 경로 — 반드시 contextPath를 앞에 붙여라**), `type==="auto"`: displayName 마지막 2자 자동 도장 span. 이 JS 렌더는 DOM API/문자열 조립 중 기존 detail()이 쓰는 방식을 따르고 escape 처리 유지.

## 변경 7 — QA 잔여 편승 (8a 경미, 같은 파일)
- `ApprovalRestResource.java` 서명 업로드 검증: base64 형식 오류(디코드 실패) 메시지가 "50KB 이하"로 나오는 문제 — 형식 오류엔 "서명 데이터 형식이 올바르지 않습니다."로 분리.
- `ApprovalRestResourceSettingsTest`: `(signatureEnabled=true, signaturePinRequired=false)` 조합 케이스 1개 추가.
- `ApprovalRestResourceSettingsTest`의 null 보존 테스트: true 저장 → null 호출 → true 유지 순서로 강화(현재는 기본 false 위에서만 검증돼 하드코딩 false도 통과).

## 게이트 (전부 실행하고 결과를 보고에 포함)
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence10 compile
```
- 완료 보고: 변경 파일 목록(신규/수정) + 게이트 결과 + 미완 항목(정직하게).
- `signatureEnabled=false` 기본값에서 설정·패널·매크로·업무함 화면이 이 배치 전과 동일해야 한다.
