# 배치 8e — "내 서명" 화면 디자인 재작업 (사용자 피드백: 디자인 불만)

너는 이 저장소의 구현 담당이다. 업무함 `?view=signature` 화면의 **마크업·CSS·JS 연결을 아래 설계대로 재구성**하라. 기능(REST 계약·data-* 훅·검증 로직)은 전부 그대로 두고 **표현만** 바꾼다.

## 금지 목록
1. 기존 코드 재포매팅·압축 금지. 수정 범위는 ApprovalInboxServlet.java의 signature 뷰 섹션(마크업 :302 부근)과 그 인라인 CSS, 필요한 최소 JS뿐이다.
2. REST 호출·검증·data-* 속성 이름 변경 금지 (JS 훅 유지: data-signature-canvas/clear/save/file/delete/preview/current/new-pin/confirm-pin/pin-save/message 등).
3. 서블릿 text block 규칙: String.format 금지(`__TOKEN__`만), CSS 주석에 꺾쇠 태그 문자열 금지(Sitemesh).
4. 이 화면은 `#dmove-approval-app` 스코프 안이므로 **토큰(var(--paper) 등) 사용이 올바르다** — 단 approval.css(콘텐츠 페이지용)에는 var() 금지 규칙이 별도로 있다. 이번 작업은 서블릿 인라인 CSS만 다루므로 토큰을 적극 사용하라.
5. 새 색상 값 추가 금지(기존 토큰만). aui-button 계열 유지. C10 수정 금지. mvn clean/커밋 금지. 허위 보고 금지("Tests run:" 그대로 인용).

## 설계 ("문서/결재" 모티프 — 도장을 화면의 주인공으로)

### 레이아웃
- `.panel-body` 안을 **2열 그리드**로: 좌측 고정폭(약 300px) "내 도장" 카드, 우측 가변 "등록/PIN" 영역. 1024px 이하에서는 1열 스택. (기존 workbench 그리드 관례 참조.)

### ① 좌측 — "내 도장" 카드 (미리보기의 격상)
- 카드: `--paper` 배경, `1px solid var(--rule)`, radius 8, `--shadow`.
- 상단 eyebrow 타이틀: 기존 `wb-nav__title` 스타일 관례(mono 10.5px, letter-spacing .14em, uppercase, `--muted`)로 "MY STAMP · 내 도장".
- 중앙: **결재란 프리뷰** — 점선(`1px dashed var(--rule)`) 사각 결재란(높이 ~96px) 가운데에 현재 서명을 표시. 등록 이미지가 있으면 `<img>`(max-height 64px), 없으면 자동 도장(기존 `.dmove-approval-stamp--auto`와 같은 시각: `--approved` 원형 도장, 지름 48px로 크게, -6deg 회전).
- 결재란 아래 캡션(12px `--muted`): "승인 결정 옆에 이렇게 표시됩니다."
- 하단: 등록 상태 라인 — 등록 서명 있으면 "등록 서명 사용 중" + `서명 삭제`(aui-button-link, 기존 data-signature-delete), 없으면 "자동 도장 사용 중 · 오른쪽에서 서명을 등록하세요".
- PIN 상태 스탬프: pinSet이면 stamp 패턴(1px currentColor 테두리+연배경, `--approved`)으로 "PIN 등록됨", 아니면 `--muted` 테두리로 "PIN 미등록". `signaturePinRequired`+미등록이면 기존 notice 문구를 이 카드 하단에 `--pending` 스탬프로.

### ② 우측 상단 — "서명 등록" 카드
- 등록 방식 세그먼트 탭: 기존 요청 모달의 scope 세그먼트 패턴(`dmove-approval-scope__btn`, role=tablist)을 재사용해 **"직접 그리기 | 이미지 업로드"** 2탭. 탭 전환은 hidden 토글(JS 몇 줄, 기존 위임 패턴).
- 그리기 탭: 캔버스를 종이 카드로 — `--paper` 배경, `1px solid var(--rule)` radius 6, 안쪽 하단 1/4 지점에 **점선 서명 가이드라인**(CSS로 캔버스 wrapper에 ::after 점선 — 캔버스 픽셀은 건드리지 않는다), 캔버스 폭은 컨테이너 100%(높이 160 유지, 내부 좌표계는 기존 320×160 유지해도 됨 — 왜곡 없게 CSS width만 늘리지 말고 canvas 속성을 wrapper 실측폭으로 세팅하는 기존 JS가 있으면 유지). 버튼 행 우측 정렬: `지우기`(aui-button) · `그린 서명 저장`(aui-button-primary).
- 업로드 탭: 생 `<input type="file">` 노출 금지 — input은 시각적으로 숨기고(label로 연결, sr-only 관례) **점선 업로드 영역**(대시 테두리 `--rule`, `--sunk` 배경, 중앙에 "PNG/JPEG · 50KB 이하 · 클릭해서 선택" 문구, 파일 선택 시 파일명 표시). 접근성: label+input 연결 유지, 키보드 포커스 스타일(`--accent` outline).
- 카드 타이틀도 eyebrow 스타일 "REGISTER · 서명 등록".

### ③ 우측 하단 — "서명 PIN" 카드
- eyebrow "PIN · 서명 비밀번호".
- 도움말 1줄(12px `--muted`): "4~12자 · 승인/반려 확정에 사용 · Confluence 비밀번호와 다르게 설정하세요."
- 필드 3개(현재/새/확인)를 **가로 3열 그리드**(좁으면 1열 스택), 라벨 위·입력 아래 블록형. 현재 PIN 필드는 pinSet일 때만(기존 hidden 로직 유지).
- `PIN 저장` 버튼 우측 정렬.

### 공통
- 상태 메시지(data-signature-message)는 우측 영역 하단 고정 위치, 기존 message 패턴(role=status).
- 입장 애니메이션은 기존 panel rise만(신규 모션 금지, prefers-reduced-motion 존중).
- 렌더 테스트(`ApprovalInboxServletRenderTest`)의 signature 관련 assert가 마크업 변경으로 깨지면 **의미를 유지한 채** 새 마크업 기준으로 갱신하라(약화 금지 — eyebrow·결재란·세그먼트 존재를 assert에 추가).

## 게이트
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
```
+ 서블릿 렌더 script를 node --check. 완료 보고: 변경 파일 + "Tests run:" 인용 + 미완(정직하게).
