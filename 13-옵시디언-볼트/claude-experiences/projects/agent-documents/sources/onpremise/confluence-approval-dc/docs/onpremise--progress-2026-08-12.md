# 진행 기록 — 2026-08-12: 업무함 사이드 메뉴·모달/매크로 통일·재승인(버전 기록 모델)·배치 6

전날(progress-2026-08-11-2.md)에 이어 하네스 파이프라인으로 배치 4a/4b/4c/5a/5b/6a/6b 완료.
커밋: `fb912b9`(4a) → `2b53754`(4b) → `82e5ce8`(4c) → `b522c17`(5a) → `e06aa16`(5b)
→ `1d79ffb`(6a) → `28d25d7`(교차 검토 반영) → `87d66a3`(6b) → `e527b2b`(docs).

## 배치 4a — 업무함 좌측 사이드 메뉴 (QA PASS)
- 4탭을 nav+aria-current 세로 메뉴로 전환, 지표는 얇은 스트립으로. 탭 배지.
- 스페이스 사이드바 진입 링크 정리(✓ 제거, weight 1000, mask 아이콘), 상단 승인 요청 버튼 아이콘.

## 배치 4b — 요청 모달 재설계 + 매크로 pill/모달 통일 (QA 3차 PASS)
- ApprovalMarkup 공용 헬퍼로 패널·매크로 마크업 1벌화 (구형 생성기 337줄 삭제).
- 요청 모달: 사용자/그룹 scope 세그먼트, 승인자 카드(아바타·순서 배지·아이콘 버튼), 빈 상태.
- 발견 버그 수정: JS 전역 모달 셀렉터(다중 모달 파손), 매크로의 낡은 contentVersion 전송.
- 여정: Codex 1차 FAIL(치명 1 — sr-only 라벨이 input까지 클리핑) → v2 FAIL(치명 2 — 이관 미완
  컴파일 실패) → 사용자 결정으로 Claude 직접 수정 → PASS. 교훈: sr-only는 텍스트 span에만.

## 배치 4c — 이중 사이드바 요구의 기술 검증과 대체 설계 (QA PASS)
- **진짜 스페이스 사이드바는 불가** — 데코레이터 원본(decorators.xml, main.vmd) 검증: 사이드바는
  XWork 밸류스택($spaceKey/$theme)과 Space 객체 요구, meta.spacekey를 읽는 코드 0건.
- 대체: 앱 사이드바 최상단 "← 스페이스명 / 페이지 목록" 복귀 그룹(spaceKey 전달,
  SpaceManager+VIEW fail-close), 접기(56px rail, localStorage, FOUC 부트), 설정 화면 통합
  (NavMarkup 4토큰, 링크형 항목, spaceKey 유지).

## 배치 5 — 재승인: 버전 기록 모델 (5a QA 4차 PASS / 5b 조건부 PASS+후속 반영)
사용자 결정: 버전 기록 모델 / 수동 원클릭 CTA / 그룹 재확장.

**백엔드(5a)**: APPROVED는 편집·마감에도 영구 유지(PENDING만 만료), PREV_REQUEST_ID 연결,
`fromRequestId` 결재선 재사용(단계 스냅샷 + "전원이 같은 그룹 출신"인 단계만 재확장, 비활성
그룹 400), 응답에 stale·previousRequestId. AFTER_APPROVAL 만료 사유는 과거 데이터 표시 전용.

**UI(5b)**: stale pill(`v{a} 승인 · v{c} 미승인`), APPROVED pill 버전 표시, 상세 모달에 stale
안내+diff 링크(AJS.contextPath로 href 주입)+버전별 승인 이력(최대 5), 재승인 원클릭 CTA
(fromRequestId, 결재선 비우고 제출하면 서버가 이전 결재선 복원), 업무함 stale 보조 문구.

**5a QA 여정 (4라운드)**: 1차 FAIL(옛 의미 테스트 잔존·복원 경로 3건) → 재작업이 "단계별
viaGroup 맵"을 도입 → 3차 QA가 **2차 진단이 오진**임을 밝힘(도메인 dedup으로 "한 사람=한 단계"
보장 → 단계별 맵 불필요, 오히려 단계 번호 이중 체계 회귀 유발) → 평탄 맵 환원으로 단순화 + 원래
있던 **putIfAbsent null-부재 함정**(직접 지정 출처가 그룹에 덮임) 수정 → 4차 PASS(실행 probe
8시나리오, GEN2=GEN3 고정점). StepRestorationTest 5건이 회귀 방지선.

## 배치 6 — CJLBioVault 고객 요구 반영 (6a QA 3차 PASS / 6b QA 3차 PASS / Codex 교차 검토 반영)

고객 요구 5건(정서희 님, `requirements-cjlbiovault-2026-08-12.md`) 전부 완료.

**백엔드(6a)**: `CANCELLED`(회수) 5번째 상태 — 요청자(userKey/username 이중 비교) 또는 관리자,
사유 선택, 종결 상태(만료 면역), 매크로 삭제 영역은 저장 시 자동 회수(REGION_REMOVED).
요청 메모(REQUESTED 이벤트 reason ≤500자, 반려 사유와 타입 분리 — 이메일은 이벤트 타입 분기).
영역 본문 해시(`v1:`+SHA-256, 깊이 인식 토큰 스캐너, 정규화: 공백·identity 속성·빈 요소 접기) —
그 영역이 실제 바뀐 경우만 만료/stale, 불확실은 전부 버전 만료로 폴백(fail-safe).

**UI(6b)**: 상세 모달 요청 메모 블록·회수 인라인 확인 스텝(사유 입력), 회수 타임라인 점선 스탬프,
업무함 칩 레일(조건부 칩)·구체 필터(검색/요청자/Flow/기간 프리셋/마감/내 차례, `?f_*` URL 유지)·
행 메모 표시, 전 화면 로컬 타임 `YYYY-MM-DD HH:MM:SS (UTC±h)` (표는 열 머리 1회).

**교차 검토(Phase 3.5) 성과**: C10 컴파일 파손(enum switch — QA 사각지대), 정규화 정규식
StackOverflow(공백 5,000개 재현) 2건을 Codex가 적발 → `28d25d7`로 수정. 신설 즉시 값 증명.

## 검증 상태
- mvn verify BUILD SUCCESS (domain 52 + c9 80 테스트), JAR/OBR 패키징 완료.
- clean 전체 빌드의 Assert-AdapterArtifact는 여전히 인스턴스 정지 시 1회 필요.

## 화면 테스트 (2026-08-12, 로컬 인스턴스 admin 계정 — 사용자 동석)

배치 5+6 전 동선 브라우저 검증 완료:
1. **stale pill** — v2 페이지에 v1 승인: 호박색 `🕐 v1 승인 · v2 미승인` 표시.
2. **상세 모달** — stale 안내 + `v1과 차이 보기` diff 링크, 버전별 승인 이력, 감사 타임라인
   로컬 타임, 푸터 `같은 결재선으로 재승인 요청` CTA.
3. **재승인 제출** — CTA → 요청 모달(재승인 힌트·메모 0/500 카운터), 메모 입력 후 결재선
   비운 채 제출 → 서버가 이전 결재선 복원(① admin) → PENDING pill.
4. **업무함** — 내 차례 행 제목 아래 메모 표시, 칩 레일 `● 1 승인 대기`, (UTC+9) 열 머리 +
   초 단위 시각.
5. **회수** — 상세 모달 `요청 회수` → 인라인 확인(경고 문구·사유 입력) → `회수 확정` →
   pill `회수`, 타임라인에 회수 이벤트+사유 (점선 스탬프), 종결 상태라 푸터 닫기만.
   요청 메모·v1 승인 이력은 영구 보존 확인.
6. **영역 매크로 독립성** — `콘텐츠 승인 · 테스트` 영역에서 `영역 승인 요청` 모달(전용 타이틀·
   메모), admin 결재선으로 요청 → 승인 → 영역 pill `✅ 승인 완료 | v2`. 같은 페이지의
   페이지 단위 결재는 `회수` 상태 그대로 — 완전 독립 동작 확인.

재기동 절차(좀비 인스턴스 → 고아 java 종료 → run-confluence.ps1 분리 실행 + 라이브 로그
`_workspace/confluence-run-live.log`)도 이번 세션에서 재확립.

## 파이프라인 교훈 (하네스 개선 반영 후보)
- Codex 결함 패턴 누적: 검증 게이트 문자열 우회 2회, 압축 1회, 이관 미완 1회, 원시 NUL 바이트 1회.
  스펙 상단 "반복 실수 금지" 목록이 유효했고, QA의 의미 기반 판정이 매번 잡아냈다.
- QA 진단도 틀릴 수 있다(5a 2차의 오진) — 3차 QA가 "전제를 실측"(probe 테스트)해서 바로잡음.
  재작업 지시에는 전제 검증을 포함할 것.

## C10 이식 백로그 (누적)
배치 1~5 전부: 백엔드 수정 7건, 데코레이터 서블릿, pill/모달, ApprovalMarkup/NavMarkup,
사이드 메뉴, 재승인(버전 기록 모델). + 기존 순차 승인 이식.

## 남은 항목
- 성능 N+1 (findByPageId 요청당 3쿼리, 알림 풀스캔) — 별도 배치 후보.
- qa-5b Minor F6(매크로별 findByPageId 이력 조회), F-11/N-3(fromRequestId+approverKeys 규칙 명문화).
- 업무함 제목 중복(데코레이터 title + 자체 h1) — 사소.
