# 배치 8c 마감 — 잔여 2건만 (signatureResolver 연결 + 내 서명 클릭 동선)

너는 이 저장소의 구현 담당이다. 배치 8c가 두 차례에 걸쳐 대부분 구현됐고 게이트 그린(C9 109 tests)이다. **아래 잔여 2건만 구현하라. 다른 코드를 건드리지 마라.** 원 스펙 `_workspace/spec-8c-signature-ui.md`의 금지 목록·UI 규칙이 그대로 적용된다 (재포매팅 금지·게이트 우회 금지·C10 수정 금지·clean/커밋 금지·허위 보고 금지).

## 잔여 1 — 변경 3: 패널/매크로 signatureResolver 연결
현재 `ApprovalPagePanel`·`ApprovalRegionMacro`가 `detailDialog`에 null resolver를 전달한다. 원 스펙 변경 3대로:
- `settings.signatureEnabled()`일 때만 리졸버 생성, off면 지금처럼 null (off 무영향 원칙).
- 리졸버: actorKey(APPROVE 결정자만 호출됨) → userKey 정규화(각 클래스의 기존 displayName 이중 조회 관례와 같은 순서) → `signatureStore.find(...)` 있으면 `new SignatureRef(true, contextPath + "/rest/approval/1.0/approvals/" + requestId + "/signature-image?actorKey=" + URLEncoder.encode(actorKey, UTF_8))`, 없으면 `new SignatureRef(false, null)`.
- **렌더 1회 범위 Map 캐시** (패널은 싱글턴 — 필드 캐시 금지, 메서드 로컬만).
- signatureStore 인스턴스는 두 클래스가 REST와 같은 방식(ComponentLocator 관례 또는 기존 생성 경로)으로 얻는다 — 기존 코드가 다른 저장소를 어떻게 얻는지 보고 동일하게.
- contextPath는 각 클래스가 이미 쓰는 요청 컨텍스트 방식. 하드코딩 금지.
- 테스트: 도장/이미지 분기 렌더를 검증하는 단위 테스트 1개 이상 (기존 Markup 테스트 파일 관례).

## 잔여 2 — 업무함 "내 서명" 클릭 동선 정리
`?view=signature` 직접 진입은 동작한다. 사이드바 "내 서명" 항목 클릭 시에도 페이지 이동 없이(또는 기존 알림 뷰와 같은 방식으로) 서명 뷰로 전환되어야 한다 — **기존 알림(notifications) 뷰 전환 패턴을 그대로 따르라** (탭 이벤트와 충돌 없이). URL `?view=signature` 갱신·뒤로가기 동작도 기존 뷰 전환과 동일 수준이면 된다.

## 게이트 (실행하고 "Tests run:" 줄 그대로 인용)
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence10 compile
```
완료 보고: 변경 파일 + 게이트 결과 + 미완(있으면 정직하게).
