# 배치 7 교차 검토 (Phase 3.5) — 보고만, 수정 금지

너는 제3자 리뷰어다. **파일을 수정하지 마라. 커밋하지 마라. 빌드 게이트 외 어떤 상태 변경도 금지.** 발견만 보고하라.

## 범위
`git diff a6a653c..HEAD` — 커밋 2개:
- `51205b6` 배치 7a: 저장소 배치 하이드레이션(hydrate/findMeta/findAllByIds/viaGroups 배치), /mine·/mine/requested 서버 페이징({items,total,statusCounts,facets,badges}), 알림 엔티티 255+인덱스·store 쿼리화, pageSnapshot/pageSnapshotReadOnly, fromRequestId 규칙(shouldRestore)
- `40eebf9` 배치 7b: 업무함 서버 연동(뷰/필터 2단계, 배지, 더 보기 offset), 스페이스 필터, 행 회수, 반려 인라인 스텝(prompt 제거), 409 새로고침 버튼

설계: `_workspace/design-batch7.md`, QA 이력: `_workspace/qa-7a.md`·`qa-7a2.md`·`qa-7b.md`·`qa-7b2.md` (이미 적발·수정된 항목은 재보고 불요)

## 중점
1. **버그·회귀**: 특히 (a) 서블릿 인라인 JS(Java text block 내)의 문법·논리 오류 — text block이 렌더한 실제 JS가 유효한지 필요하면 렌더 결과를 node로 검증(임시 파일은 OS temp에), (b) approval.js의 이벤트 위임 분기 순서(반려/회수/승인 폴스루 상호작용), (c) REST 2단계 필터 순서의 엣지(빈 후보, offset>total, viewStatus×status 교집합), (d) hydrate 청크 경계와 정렬 안정성, (e) badges/statusCounts 의미 일관성.
2. **C10 파손**: 도메인 시그니처·동작 변경이 approval-confluence10 컴파일/의미를 깨는지 (`mvn -pl approval-confluence10 compile`만 — **jar 패키징 금지**, dev 인스턴스 실행 중).
3. **설계 불일치**: design-batch7.md 결정(D1~D9)과 구현의 어긋남.
4. **보안**: escape 누락, innerHTML, URL 파라미터 주입, 권한 판정 우회(canView·requester 검증).
5. Claude가 QA 후 직접 수정한 3건을 특히 의심하라: 배지 hasOwnProperty 가드+requested 부팅 loadBadges(ApprovalInboxServlet syncNavBadges/activate), 진행중×내차례만 공집합 단락(loadRows), 승인 폴스루 data-approval-action 가드(approval.js).

## 게이트 (실행해 결과 보고)
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -pl approval-confluence10 compile
```

## 보고 형식
심각도(치명/중대/경미)별로: 파일:줄, 문제, 근거(실측), 제안 수정. 문제없으면 "이상 없음"과 확인한 범위.
