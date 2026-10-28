# 배치 6b 재작업: QA FAIL 29건

워킹트리(커밋 28d25d7 이후)에 배치 6b가 적용되어 있다. 그 위에서 결함만 고친다.

**시작 전에 반드시 읽어라:**
1. `_workspace/qa-6b.md` — 발견 29건과 재작업 지시 R1~R7 (이 문서가 정본, 우선순위·코드 수준 지시 포함)
2. `_workspace/design-batch6.md` §B·§E·§F — 설계 원문 (특히 §B-7 "지표 5칸 금지" 결정과 §I 제거 목록)

## 수정 파일: 6b와 동일 범위 (qa-6b.md가 지목한 파일)

## 핵심 강조 (R1~R7 전부 적용하되, 이것들은 반복 실수 유형이다)
1. **B1**: canCancel은 같은 파일의 resolveActorKey처럼 **userKey/username 이중 대조** + null 방어.
   서버 판정(ApprovalRestResource의 요청자 확인)과 동일한 규칙이어야 한다. 패널·매크로 양쪽.
2. **B2/B3**: §E-2는 "app-head를 .wb-main 안으로"가 핵심이다 — CSS만 만지지 말고 마크업을 옮겨라.
   ≤1024 반응형(가로 스트립)과 접힘 rail은 4c 동작 그대로 살아 있어야 한다 (회귀 테스트: 두 서블릿
   인라인 CSS에서 미디어쿼리 대상 확인).
3. **B4/B5**: 필터 URL 왕복(writeUrl/파싱)·전체 해제·상태 다중 선택(설계가 정한 UI — multiple
   select 오용 금지)·디바운스는 설계 §F 코드 블록을 그대로 구현하라.
4. **M1**: 설계가 명시적으로 금지한 것(지표 5칸)을 추가하지 마라 — §I 제거 목록을 이행하라.
5. **M8**: 배치 5b 문구("v{n} 기준 · 현재 버전 미승인")를 지시 없이 되돌리지 마라 — 원복.
6. **M6**: UTC 오프셋은 분 단위 포함 (UTC+5:30, UTC+9). 30분 오프셋 시간대가 실존한다.
7. **M9**: 압축 금지 — 818자 한 줄 같은 것 즉시 분해. statement 한 줄에 하나.

## 완료 기준 (자가 검증·보고 필수)
- `C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test` green (직접 실행).
- node --check (approval.js + 두 서블릿 인라인 스크립트 추출).
- qa-6b.md의 치명 6건 각각에 대해 "어떻게 해소했는지" 한 줄씩 보고에 포함.
- 200자 초과 라인 0 (신규 코드), git diff --check 통과.

## 코드 스타일
개별 import, statement 한 줄, 중괄호, 주석 한국어, 지시 외 변경 금지.
