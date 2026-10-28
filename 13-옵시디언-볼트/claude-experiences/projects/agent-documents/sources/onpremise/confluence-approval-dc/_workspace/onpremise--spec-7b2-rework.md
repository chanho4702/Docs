# 스펙 7b-2 — QA(qa-7b.md) FAIL 재작업

`_workspace/qa-7b.md`를 먼저 읽어라 (치명 1·중대 5·경미 8, 파일:줄 근거). 이 스펙은 수정 방법을 확정한 것이다. 트리의 7b 구현을 되돌리지 말고 아래만 수정하라. REST(7a 커밋분) 파일 수정이 일부 포함된다.

## 반복 실수 금지
1. **재포매팅·압축 절대 금지** — M-5가 바로 이 위반이다. 이번 재작업에서 기능 변경 없는 줄은 건드리지 마라.
2. 테스트 의미 바꿔치기 금지. 3. 제어 문자 금지. 4. text block `\d`→`\\d`. 5. C10 수정 금지·컴파일 유지. 6. `clean`/`package`/`install` 금지. 7. git 커밋 금지.

## 설계 결정 (오케스트레이터 확정)

**뷰 정체성과 사용자 필터의 2단계 분리.** REST가 후보 집합(canView 통과)에 다음 순서로 적용한다:
1. **뷰 단계**: `viewStatus`(CSV, 신규), `myTurn`(=1 내 차례 / =0 내 차례 아님, 신규 의미), `myDecided=1` → 이 결과가 "탭 모집단"
2. 탭 모집단에서 `statusCounts`·`facets` 계산
3. **필터 단계**: `status`(CSV — 칩/사용자 필터), `q`/`spaceKey`/`requesterKey`/`flowId`/`createdFrom·To`/`due` → `total` → 정렬 → 슬라이스
4. 응답에 **`badges` 추가**: 뷰 단계 **이전**(후보 전체) 기준 `{"myTurn":n,"waiting":n,"decided":n}` — waiting = PENDING이면서 myTurn 아님, decided = myDecided 술어. `/mine/requested`의 badges는 `{"requested":n}`(후보 전체 중 PENDING 건수).

뷰 매핑(서블릿):
- 내 차례 → `myTurn=1`
- 진행 중 → `viewStatus=PENDING&myTurn=0`
- 처리한 건 → 기존 술어와 동일하게 (`myDecided=1` — 51205b6 이전 클라이언트 술어와 1:1 확인)
- 내 요청 → `/mine/requested` (뷰 파라미터 없음)

## 수정 항목

### R1 (치명 C-1) — myTurn 부정
`ApprovalRestResource`: `myTurn` 파라미터를 `1`(내 차례)/`0`(내 차례 아님)/부재(무필터)로 확장, `viewStatus` CSV 파라미터 신설(화이트리스트는 status와 동일, 위반 400 JSON). 위 2단계 순서로 재배치. 서블릿 `TABS.waiting.params`를 `{viewStatus:"PENDING", myTurn:"0"}`으로.

### R2 (중대 M-1) — 빈 status 교집합 단락
`serverStatus()` 교집합이 공집합이면 fetch를 보내지 말고 **클라이언트에서 0건 렌더**(total 0, 더 보기 숨김). ("" 반환으로 전건 조회되는 현행 제거.)

### R3 (중대 M-2) — 칩 건수 = 탭 모집단
R1의 2단계 분리로 REST가 해결한다. 서블릿 칩 레일은 새 `statusCounts`(탭 모집단 기준)를 그대로 사용 — 조건부 칩 규칙(>0일 때만) 유지.

### R4 (중대 M-3) — setupFilters 무조건 실행
첫 fetch 결과와 무관하게 `setupFilters()` 실행(51205b6 이전 구조로 복원). non-ok/네트워크 실패 시: 기존 행 유지 + 오류 메시지 표시 + offset 원복 (경미 m-4와 함께 해결).

### R5 (중대 M-4) — 배지 모집단 통일
사이드바 배지를 응답 `badges`로만 갱신: 내 차례=badges.myTurn, 진행 중=badges.waiting, 처리한 건=badges.decided, 내 요청=requested 응답의 badges.requested(그 탭을 방문했을 때 갱신 — 기존 lazy 의미 유지). `?view=notifications` 진입 시 배지 공백 방지: `/mine?limit=1`(뷰 파라미터 없음) 1회 호출로 badges만 반영.

### R6 (중대 M-5) — 압축 원복
`git diff 51205b6 -- approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/ApprovalInboxServlet.java`에서 **기능 변경이 없는 순수 포매팅/압축 hunk를 전부 원복**하라. 특히 삭제된 "로컬/UTC 하루 어긋남" 경고 주석을 복원하고 현재 `toISOString` 변환부 옆에 두라 (from/to 변환이 로컬 자정 기준임을 설명하는 주석).

### R7 (경미 6건)
1. `#fff7f7` 신규 hex 제거 → 기존 `#ffecea` 재사용 (새 색 금지 규칙).
2. 죽은 스페이스 필터 주석(:754-755 부근) 삭제.
3. URL `f_space` 값이 facets.spaces에 없으면 해당 값을 select에 옵션으로 주입(현재 스페이스명 미상 → key 그대로 라벨)해 컨트롤/상태 불일치 해소.
4. `myDecided` 술어를 51205b6 이전 클라이언트 술어와 의미 일치시켜라 (eligible 검사 차이 — qa-7b.md 해당 항목의 실측 참조).
5. 반려 버튼에서 `dmove-approval-action` 클래스/훅과 `decision` 하드코딩 제거 (조기 return에 기대지 않기).
6. "(전체 N건 중)" 카운트 표기 복원 (total 기반).

### R8 (경미) — 반려 스텝 테스트
`ApprovalMarkupCancelTest` 패턴으로: myTurn일 때만 반려 스텝(`data-approval-reject-open`/confirm) 렌더, `rejectReasonRequired` 전달 시 data 속성/필수 라벨 노출 — 2~3케이스.

## 검증 게이트
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -pl approval-confluence10 compile
```

## 완료 보고
R1~R8 각 적용 여부 + 파일:줄, 게이트 출력(모듈별 테스트 수), 이탈 사유. 허위 보고 금지 — 하지 않은 일을 했다고 쓰지 마라(직전 배치에서 "경험 Vault 기록" 허위 보고가 적발됐다).
