# 배치 6b: UI — 메모·회수·타임스탬프·사이드바 레이아웃·지표 칩 레일·필터

**시작 전에 반드시 `_workspace/design-batch6.md`를 읽어라.** 이 배치는 §A(요청 메모 UX),
§B(회수 UX·CANCELLED 표시), §C(타임스탬프 로컬 표시), §E(사이드바 레이아웃 2건),
§F(지표 칩 레일 + 필터 + 더 보기)를 구현한다. §D(영역 해시)는 백엔드(6a)로 완료됐다.

백엔드 계약(6a, 커밋 1d79ffb): POST /approvals/{id}/cancel?actorKey=&reason= (요청자/관리자),
create에 requestMessage(≤500자)·regionHash, 응답에 requestMessage·stale·previousRequestId,
상태에 CANCELLED(설정 라벨 "회수"), 알림 eventType CANCELLED.

## 반복 실수 금지 규칙
sr-only는 span에만(label 금지) / 파일 압축 금지(200자 미만) / CSS 중복 정의 금지·교체는 인플레이스 /
죽은 코드 금지 / 지시 외 문구·주석 변경 금지 / 모달·트리거 셀렉터는 컨테이너 스코프 유지 /
설계가 명시한 "주의 함정" 준수 / **완료 기준 자가 검증을 mvn 정확 경로로 직접 실행**
(`C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd`, JAVA_HOME=`C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot`).

## 수정 파일 (이외 금지)
- ApprovalMarkup.java (메모 표시·회수 버튼·time 마크업)
- ApprovalPagePanel.java / ApprovalRegionMacro.java (호출측 인자)
- ApprovalInboxServlet.java (지표 칩 레일·필터 바·더 보기·CANCELLED·타임스탬프·레이아웃)
- ApprovalSettingsServlet.java (cancelledLabel 파라미터 전송·레이아웃)
- NavMarkup.java (사이드바 풀-하이트·아이콘 간격 — §E)
- approval.js (메모 제출·회수 동선·time 치환·diff 링크와 공존)
- approval.css (관련 블록)
- atlassian-plugin.xml (§E-1 아이콘 간격이 mask 좌표 수정을 요구하는 경우)
- 관련 테스트 최소 수정 (RenderTest 등)

## 구현 범위 (설계 문서 §번호가 정본)
1. §A 요청 메모: 모달 textarea(선택, 글자수 설계값), 제출 시 &requestMessage=, 상세 모달 표시,
   업무함 표시, (이메일은 6a 완료).
1-b. **regionHash 전송 (교차 검토 지적)**: 매크로 렌더 시 계산한 영역 해시를
   `data-approval-region-hash`로 컨테이너에 출력하고(ApprovalRegionMacro — 서버는 이미
   ApprovalRegionSupport.regionHash로 계산 가능), approval.js submit이 CONTENT_REGION일 때
   `&regionHash=`로 전송한다. 서버의 낙관적 충돌 검사(409 "영역이 변경되었습니다")가 실동작하게 된다.
   409 응답 처리: 기존 409 reload 동작과 구분해 메시지 표시 후 reload.
2. §B 회수: 상세 모달 인라인 확인 스텝(window.prompt/alert 금지), 요청자(data-approval-user-key
   신규 dataset)·관리자 노출 조건, CANCELLED pill/stamp(회색+점선), 타임라인 "회수", 업무함 칩.
   회수 성공 시 location.reload(). ESC 순서: 확인 스텝 → 모달.
3. §C 타임스탬프: <time class="dmove-approval-time" datetime=...> 마크업 + JS 로컬 치환
   (YYYY-MM-DD HH:MM:SS (UTC±h), Intl 대신 로컬 getter — 설계 근거 준수), 업무함 fmt 통일, ISO 폴백.
4. §E 레이아웃: 사이드바 풀-하이트(sticky 기둥, app-head를 .wb-main 안으로), 아이콘-라벨 간격 교정.
   접힘 rail·반응형과 충돌 금지 (4c 동작 유지).
5. §F 지표 칩 레일(클릭=필터, CANCELLED·마감임박·기한지남은 건수>0일 때만) + 필터 바
   (상태 다중/제목 검색/요청자/Flow/기간/마감/내 차례 — 설계 확정 목록) + 활성 필터 칩 + 전체 해제 +
   ?f_* URL 반영 + "더 보기"(50건). 기존 TABS/render 재사용 우선.
   (서버 페이징·spaceKey 응답 확장은 §G 후속 — 이번 배치 아님.)

## 완료 기준 (자가 검증·보고)
- mvn -B -pl approval-confluence9 -am test green (직접 실행, 결과 인용).
- node --check (approval.js + 서블릿 인라인 스크립트 추출).
- 서블릿 CSS 스코프 검사(콤마 조각) 0건, /confluence/ 하드코딩 0건.
- 요청 모달: 메모 없이도 제출 가능(선택 입력), fromRequestId 재승인 동선과 공존.
- CANCELLED가 업무함 탭 필터·지표에서 만료와 구분됨.

## 코드 스타일
개별 import, statement 한 줄, 중괄호, 주석 한국어.
