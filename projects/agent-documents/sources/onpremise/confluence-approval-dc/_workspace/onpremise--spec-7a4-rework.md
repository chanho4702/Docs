# 스펙 7a-4 — QA(qa-7a.md) FAIL 재작업

`_workspace/qa-7a.md`를 먼저 읽어라 (중대 3·경미 9의 근거와 파일:줄). 이 스펙은 그중 수정할 항목과 방법을 확정한 것이다. main 구현은 트리에 있다 — 되돌리기 금지, 아래 항목만 수정.

## 반복 실수 금지
1. 파일 재포매팅 금지. 2. 테스트 의미 바꿔치기 금지(단, 아래 R2·R7처럼 **스펙이 명시한 의미 변경은 수행**). 3. 원시 제어 문자 금지. 4. text block `\d`→`\\d`. 5. C10 수정 금지·컴파일 유지. 6. `clean`/`package`/`install` 금지. 7. git 커밋 금지.

## R1 (중대 1) — hydrate의 불변 리스트 sort 제거
`ActiveObjectsApprovalRequestRepository.java:240-243` 부근: 승인자/이벤트 행이 0건인 requestId에서 `List.of()`(불변)에 `.sort()`를 호출해 `UnsupportedOperationException`. 그룹핑 맵의 기본값을 가변 리스트(`new ArrayList<>()`)로 하거나 `stream().sorted().toList()`로 교체. **빈 행 케이스가 정상 조립(빈 승인자·빈 이벤트 aggregate)되어야 한다.**

## R2 (중대 2) — 청크 단일 출처화 + hydrate 조립 테스트
1. hydrate의 자체 인라인 청크 루프(224-225행 부근)를 제거하고 기존 `chunks()` 헬퍼를 사용 — findMeta/findApproverViaGroupsBatch와 단일 출처.
2. **hydrate 조립 동등성 테스트 신설**: AO 엔티티는 인터페이스이므로 `java.lang.reflect.Proxy`로 fake 행(ApprovalEntity/ApprovalApproverEntity/ApprovalEventEntity)을 만들 수 있다(기존 `ApprovalPagePanelCancelTest`가 ConfluenceUser를 Proxy로 만드는 패턴 참조). 조립 로직(행 배열 → ApprovalRequest)을 받는 오버로드/패키지 프라이빗 진입점을 직접 호출해 검증:
   - 승인자·이벤트 정렬 규칙(HEAD의 SQL ORDER BY와 동일)이 적용되는가
   - legacy STEP_ORDER=0 처리
   - **승인자/이벤트 0건 요청이 예외 없이 조립되는가 (R1 회귀 방지)**
   - 여러 requestId 행이 섞여 들어와도 요청별로 정확히 분배되는가
   AO 자체(activeObjects.find)는 호출하지 않는 순수 조립 테스트면 충분하다.

## R3 (중대 3) — 매크로 읽기 전용 복원 + 패널 sweep 범위 원상
QA 실측: HEAD 매크로는 "lazy expiration이나 저장을 하지 않는다" 주석과 함께 **읽기 전용**이었다. 현재 pageSnapshot(전체 due sweep → expireDue → 클러스터 락+save)로 바뀌어 읽기 전용 렌더 컨텍스트(내보내기·인덱싱)에서 위험. 결정:
1. `ApprovalWorkflowService`에 **`pageSnapshotReadOnly(long pageId)`** 추가: sweep 없이 `repository.findByPageId` 결과만 반환 (순수 읽기).
2. `pageSnapshot(long pageId)`의 sweep 범위를 **HEAD의 findLatestPageRequest와 동일**하게 축소: due 판정·expireDue 대상은 "최신 PAGE 요청" 1건만 (영역 요청 lazy expiration은 HEAD에도 없었다 — 스케줄 sweep 담당). `findLatestPageRequest` 위임 관계 유지.
3. `ApprovalRegionMacro`는 `pageSnapshotReadOnly` 사용 + HEAD에 있던 읽기 전용 주석 복원.
4. `ApprovalPagePanel`은 `pageSnapshot` 유지 (HEAD의 패널 의미: 최신 PAGE 요청 lazy expiration + 읽기).
5. **`PageSnapshotExpiryTest`를 새 의미로 수정** (의도된 의미 변경): 최신 PAGE 요청이 due면 sweep, 다른 due 요청(영역·과거)은 그대로, `pageSnapshotReadOnly`는 어떤 경우에도 저장하지 않음(fake repository의 save 호출 기록으로 검증).

## R4 (경미) — 패널 latest 동률 규칙 단일 출처
패널의 latest 파생(`reduce`/`max` 뒤·앞 우선 불일치)을 제거: 도메인 서비스에 `static Optional<ApprovalRequest> latestPageRequest(List<ApprovalRequest>)` 셀렉터를 추출해 `findLatestPageRequest`와 패널이 **같은 함수**를 쓰게 하라 (동률 포함 의미 동일).

## R5 (경미) — myTurn 술어 단일 출처
`ApprovalRestResource.java:1348` 부근의 필터용 myTurn 재구현을 제거하고 직렬화 로직과 같은 술어 함수를 공유.

## R6 (경미) — 400 본문 JSON 통일
페이징·필터 파라미터 오류 400 본문을 스펙의 `{"error":"..."}` JSON으로 (`ApprovalJson.write` 경유). 기존 다른 엔드포인트의 400 관례가 평문이라면 **이번에 추가된 파라미터 검증 400만** JSON으로 하고 기존 것은 손대지 않는다.

## R7 (경미) — 기타 확정 수정
1. **README**: 새 fromRequestId 규칙 문장이 기존 문장 한가운데 삽입돼 문장이 두 동강 — 문단을 자연스럽게 재배치.
2. **facets**: `Map.of` 비결정 순서 → `LinkedHashMap`(requesters→flows→spaces, 각 목록은 이름 오름차순 유지). displayName/space null 가능성에 NPE 가드.
3. 신규 코드의 274열 라인 — 주변 스타일에 맞게 줄바꿈.

## 수정하지 않는 것 (기록만 — 손대지 마라)
- `findLatestContentRegionRequest`가 죽은 코드가 된 것 (C10/외부 사용 가능성 — 유지).
- 알림 canView의 getPage 캐시 부재, Flow IN 청크 미분할(슬라이스 ≤200이라 안전).

## 검증 게이트
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -pl approval-confluence10 compile
```

## 완료 보고
R1~R7 각각 적용 여부 + 파일:줄, 게이트 출력 요약(모듈별 테스트 수), 이탈 사유.
