# 스펙 7a-3 — 배치 7a 마무리: 신규 단위 테스트만

## 컨텍스트
7a 구현은 **전부 완료**되어 트리에 있다 (되돌리기·재구현 금지): 저장소 hydrate/findMeta/findAllByIds/findApproverViaGroupsBatch, `ApprovalWorkflowService.pageSnapshot`(모든 due 요청 sweep), 패널/매크로 pageSnapshot 사용, `/mine`·`/mine/requested` 서버 페이징({items,total,statusCounts,facets}), 알림 REST 배치화, `shouldRestore` 규칙. 현재 `mvn -pl approval-confluence9 -am test` 그린 (domain 52 + c9 80).

**이 스펙의 범위는 신규 테스트 추가뿐이다. main 소스는 수정하지 마라** — 단, 테스트를 위해 private 로직의 접근 제한을 package-private로 푸는 것과 정적 헬퍼 추출(동작 불변)은 허용한다.

## 반복 실수 금지
1. 파일 재포매팅 금지. 2. 기존 테스트 의미 변경 금지. 3. 원시 제어 문자 금지. 4. text block `\d`→`\\d`. 5. C10 수정 금지. 6. `clean`/`package`/`install` 금지. 7. git 커밋 금지.

## 추가할 테스트 (기존 패턴: JUnit5, Proxy/수제 fake — Mockito 없음)

1. **shouldRestore 규칙** — `StepRestorationTest`에 추가 또는 인접 신규 파일:
   - fromRequestId+approverKeys → 복원 안 함 / +approverGroups → 안 함 / +steps → 안 함 / 단독 → 복원 (previous null이면 false 포함 5케이스 내외).
2. **페이징 파라미터 정규화** — limit(0 이하·비숫자→50, 1~200 유지, 201→200), offset(음수 거절), status CSV(화이트리스트 외 토큰 검출). 판정 로직이 private면 정적/package-private로 추출해 직접 검증.
3. **필터 술어** — due(soon/over/none)·myTurn·myDecided 판정을 `ApprovalRequest.restore`로 조립한 aggregate로 검증 (PENDING 외 상태에 due=false 포함).
4. **IN 청크 분할** — 499/500/501 경계에서 청크 수·원소 보존 (분할 헬퍼 직접 호출).
5. **pageSnapshot 전체 sweep** — approval-domain 테스트: due인 PENDING 2건 + due 아닌 1건 → snapshot에서 2건 EXPIRED, 1건 유지. 기존 ApprovalWorkflowService 관련 테스트 파일(예: ExpiryReasonTest 스타일)의 fake repository/clock 패턴 재사용.

## 검증 게이트
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -pl approval-confluence10 compile
```

## 완료 보고
- 신규 테스트 파일/메서드 목록, 모듈별 테스트 수(before→after), 게이트 출력 요약.
