# 2026-09-02 — APM P2 트레이스 하루 구현 (P1.5 Live 마감 포함)

관련: [[projects/moveseye/2026-08-31-apm-p1-implementation|2026-08-31-apm-p1-implementation]] · [[projects/moveseye/2026-08-26-apm-design|2026-08-26-apm-design]] · 정본 `_workspace/contract_apm.md` §7, `contract_apm-read-api.md` §10·§11, 검수 `_workspace/reviews/review_apm-p2-w{1,2,3}*.md`, `review_apm-p2-fe1_codex.md`

## 흐름
1. P1.5 Live 마감: 4차 코덱스 반영 + 런타임 QA(화면 도달 중앙값 14초·최악 23초) → 커밋 BE `1b43bb1`·FE `57dbd2b`.
2. 사용자 요청 2건 사이 끼움: 쉬운 해설 문서 증보(walkthrough §9~11) · 수집기 초기 설정 물음표 도움말(옵션 21개 "무엇/기본값/언제/잘못 넣으면", FE `cbfd05c`).
3. P2 BE 3물결(파서·V44·수신 → 4종 롤업·EP 17 → 배포 감지·웹훅·표본 JSON), 각 물결 직후 `codex exec` 검수 → 수정 커밋. FE 2물결(트레이스 탐색·워터폴 직접 구현 → 서비스 맵 dagre·에러/DB/의존·admin 게이팅) + 픽스처 실표본 교체. BE 2515·FE 2253 green. 커밋 방식은 이날부터 "완료·검증 즉시 커밋 후 보고"(사용자 "커밋도 해").

## 실측·설계가 뒤집힌 것
- **설계 `PK(trace_id, span_id)`는 만들 수 없다** — PG 파티션 키가 PK에 들어가야 함 → `(trace_id, span_id, start_ts)`. IT가 잡음.
- **P1부터 조회 EP에 운영자 판정이 없었다** — 코덱스가 P2 EP를 지적하다 드러남. 같은 메뉴의 쓰기 EP는 처음부터 `requireAdmin`이라 "메뉴 절반만 잠긴" 상태. 32 EP 일괄 `ApmAccessChecker.requireRead`(ADMIN∪SUPER_ADMIN) → USER 계정 회귀 → FE 사이드바 게이팅으로 마감. 읽기 티어를 로그인 사용자로 넓힐지는 **열린 결정**.
- **tail_sampling은 어느 정책이 통과시켰는지 안 적는다** → `SLOW`는 BE 추정 → 저장값을 `SLOW_INFERRED`로 이름에 한계를 박음.
- **예외 롤업 덧셈 UPSERT는 잡 재실행(커밋 후 결과 불명)에 이중 계상** → 시간대 재계산-대입. 대가: `count_total`이 "평생 누적"→"보존 창 합".
- 동시 첫 수신 요약 2행 → `pg_advisory_xact_lock(hashtextextended(trace_id))` 트레이스=트랜잭션 단위(행이 아직 없어 행 잠금 불가, registry는 일 2천만 행 부담).

## 사고·교훈
- 🔴 **cwd 표류 오커밋**: 배경 명령 뒤 셸 cwd가 FE로 남은 상태에서 상대 경로 `git commit` → BE 메시지로 FE에 다른 에이전트의 작업 중 파일 커밋. `git reset --soft HEAD~1`로 무손실 복구. **git은 항상 `git -C <레포>`**.
- `BE 표본 JSON 없음`을 FE 에이전트가 보고했지만 실은 병렬 BE 에이전트가 같은 시각 만들고 있었음 — 병렬 에이전트 보고의 "없다"는 시점 조건부.
- dagre 3.x는 jsdom에 `structuredClone` 필요(v8 직렬화 폴리필; JSON 왕복은 undefined·Map을 삼켜 레이아웃이 달라짐).
- V44/V45를 실 DB에 적용하기 전이라 자체 수정 가능했다 — "미적용 마이그레이션은 고쳐도 된다"는 규칙을 에이전트 지시에 명시하면 V46 난립을 막는다.
- 코덱스 지적 "되돌려 보기"(수정 하나씩 원복해 의도 테스트만 적색 확인)가 테스트 검출력 증명으로 유효.

## 종단 QA(같은 날 저녁)
- 1회차 결함 15(HIGH 2) → 전건 수정 → 2회차 15/15 PASS, 새 결함 3(D17 CUMULATIVE 극값 미차분→exemplar 라벨 800배 — delta 전환으로 격리 확정) → 수정. 코덱스 QA-수정분 검수 2건(Live Top 회귀·count 라벨) 반영.
- 뒤집힌 것 추가: **exemplar는 대표 표본이지 최댓값이 아니다**(exemplar 우선이면 0.95s가 11ms로) · **1h 버킷 조인은 창 시작을 정시로 내려야** 15분 창이 산다(대가: count가 근사) · `isLoading`=pending&&fetching이라 fetch 디스패치 전 구간에 빈 문구가 먼저 그려진다(`isPending` 기준).
- 병렬 에이전트 결과 대조: FE가 "BE 표본 없음"이라 보고한 것은 BE 에이전트가 같은 시각 만들던 것 — 시점 조건부 보고.
- 타 세션이 MEMORY.md/메모리 파일을 재작성해 내 `str.replace` 갱신이 조용히 실패 — 메모리 갱신은 assert로 확인. 셸 heredoc의 긴 한글 파이썬은 cp949로 깨짐 → Write 도구로 파일 후 실행.

## 잔여
V47 QA DB 미적용 · `maxMs`→`valueMs` 개명(FE 동시) · Live maxMs 근사 문구 · RUM 토큰 경로 · `dropStatsFlush` IT 플레이크 · 미푸시(BE 15·FE 4) · P3 미착수.

## 09-03 후속 — APM 권한을 DMOVE 권한 옵션으로
- 사용자 지시로 역할 축(ADMIN 일괄) → 역할 편집 화면의 DMOVE 권한 모듈 `applicationMonitoring`/기능 `apm`(view=조회 36 EP·edit=관리 26 EP, 원문 SQL/스택은 ADMIN 유지). 런타임 QA 8/8 PASS.
- 🔴 **V27 복제하면 기동 실패**: `dmove_permission` 기본값이 `'{}'`(객체)라 `jsonb_array_elements`가 죽는다 → V48은 UPDATE 3문. V27에 같은 잠재 결함(행이 없어 안 터졌을 뿐).
- 🔴 `t("apm")` 불가 — 로케일 루트 `apm`이 객체라 라벨만 `apm_permission`으로 우회(권한 키는 BE 계약 유지).
- 축 기준은 HTTP 메서드가 아니라 "관리 화면 데이터인가"(토큰 목록·설정 GET·설치 가이드=edit). 입구(사이드바·설정)도 화면과 같은 축이어야 "항상 벽" 입구가 안 생긴다.
- `enabled:false`로 쿼리를 끄면 훅이 "오류"가 아니라 "빈 데이터"가 돼 거짓 빈 문구(규칙 없음·손실 0건)가 뜬다 → 권한 없으면 컴포넌트 자체를 안 그린다.
- 배포 순서: BE(V48+템플릿) 먼저 — FE `grantAll`은 BE가 준 키만 채워 관리자에게도 메뉴가 사라진다.

## 09-07 — P3 운영 심화 하루 완주
- 물결 3(SLO+위젯 / 합성+메시징+배치 / 리포트) + AI 툴 11 + 설치 출처. 코덱스 3회전(🔴 합계 15), QA 1회차 결함 23 → 전건 반영. BE 2993·FE 2649·AI 139.
- 실측·검수가 뒤집은 것: **SLO 번 알람은 AND가 아니라 SRE 멀티윈도우 OR**((1h&5m)|(6h&30m)), 상한 1/(1-target) 없으면 영원히 안 울리는 임계가 저장됨 · **Zabbix 7.0 httptest는 `post_type`을 안 받고 RAW=0/FORM=1**(반대로 읽고 있었음) · `web.test.error`는 Character(history=1) · 이력 조회 기본 상한 10만이 최신을 자름 · 배치 잡은 완료 후 도착하면 시작 버킷이 창 밖(V54 완료 경로) · `host_group_report`와 `apm_report_snapshot`의 **id 공간이 겹침**(상세 EP·삭제 배열 분리) · `LicenseArchitectureTest` A1이 STANDARD→프리미엄 의존을 실제로 막아 SPI로 역전 · `createdAt`이 KST에 `Z`(NestJS 1:1 보존물) · 공유 아이템에 -1을 밀면 다른 규칙 트리거가 거짓 복구 → 트리거별 `event.acknowledge(close)`.
- 운영 교훈: 두 레포 모두 타 세션 미커밋 파일이 섞여 **항상 선별 커밋**(grep 필터로 foreign 확인 후 add) · 코덱스 사용량 한도는 시각 확인 후 재실행 · 에이전트가 `git stash` 1회·요청서 Write 덮어쓰기 1회 → 지시문에 금지 재강조 · EventSource URL 조립은 baseURL 끝 슬래시에 기대지 말 것(사용자 실보고) · 사용자의 :3000이 타 세션 재빌드로 내려갈 수 있어 QA 보고에 프로세스 상태를 적게 함.

## 09-08·09-14 — P4(RUM·K8s): 역할 교대 — 코덱스가 짓고 Claude가 검사
- 사용자 지시 "구현 코덱스 최상위 모델 시켜" → `codex exec` `gpt-6-astra` + `model_reasoning_effort=xhigh`를 **격리 git worktree**에서 실행(BE·FE 각각), Claude(be/fe-engineer)가 검수 보고서 작성 → 코덱스가 반영 → Claude가 커밋·병합. BE 3086·FE 2732 green.
- 코덱스 CLI 함정: `--full-auto` 없음(`--approve-for-me`), `-s`와 동시 불가, `writable_roots`는 `-c`로 배열 전달 실패 → `--add-dir`, node_modules **정션**을 add-dir에 넣으면 샌드박스 헬퍼 1223(권한 상승 취소)으로 즉시 실패 → 빼면 정상. 사용량 한도는 시각 확인 후 재실행.
- **"3,051 green이 사실을 감췄다"**: 코덱스 K8s 구현은 지어낸 속성명(`container.restart_count`, OOM을 메트릭으로)을 테스트가 스스로 먹여 통과 — 검수가 contrib 정본(k8sattributes config·k8s_cluster documentation)을 대조해 잡음. observe()를 영수증 앞에 두어 재전송 이중 계산, preflight 401/403이 토큰 존재 노출, FE 표가 구 `useTableColumns` 경유로 숫자 문자열 정렬. 변이 실험(가드 되돌려 보기)이 검출력 공백 5건을 드러냄.
- 검수자도 틀림: R2 위치를 `k8sattributes.extract.metadata`로 지시했으나 contrib 0.159.0은 검증 실패 — 코덱스가 정본 링크로 반박하고 `k8s_cluster.resource_attributes`로 감. 검수 지시도 정본 대조가 필요.
- 병렬 실행 중 사용자 "일단 정지" → 진행 중 에이전트 TaskStop, 상태 보고 후 대기. 6일 뒤 재개 시 레포·worktree 상태 재확인부터.
- 09-14 마감: P4 QA(PASS 92/FAIL 1) — 🔴 `keepRawSql` 생략 시 7인자 편의 생성자가 `kubernetes=false`를 하드코딩(FE 기본 조작 경로, 200+정상 yaml이라 실패 신호 없음; 테스트가 generator를 직접 불러 못 잡음 → **서비스 경유 회귀 필수**). 실브라우저에서 등록 origin 수집·미등록 preflight 차단·CSP 차단·Browser→fetch→SERVER→DB 4단 워터폴 실측. 코덱스가 worktree 안에 `scratchpad/`를 만들어 커밋 시 제외 필요. `git worktree remove`는 node_modules 정션을 먼저 `rmdir`(링크만 제거)한 뒤 — 안 그러면 --force가 본 레포 node_modules를 지울 위험. **APM P1~P4 완주(08-31~09-14).**
- 09-14 종합 안내서 `_workspace/guides/apm-handbook.md`(1,034줄+부록 D 출처: 외부 공식 문서 49·내부 정본) 작성 — 배경지식·구현 조건·메뉴/탭 사전·"해결한 것 18건"·뒤집은 가정 26. 정본 간 불일치 14건 발견(설계 마이그레이션 번호·PK·RUM 토큰 표·리포트 EP·Live export 10000 vs 가이드 15000·RUM 7번째 메뉴 vs 설계 상위 6 등) → §8.5 표.
- 09-14 P4 QA 재검증(§7): D1~D6 런타임 CLOSED(새 jar, K8s 체크만 켜도 k8s 블록 생성·회수 토큰 버튼 disabled). 신규 관찰(낮음): 회수 토큰으로 GET /apm/rum/snippet 200. 타 세션이 BE/FE에 추가 커밋(9838cfa/e4922db)·:3000·:5173 재기동.
- 09-14~15 문서 정리: 종합 안내서 1,108줄을 만들자 사용자 "왜 하나에 다 때려박았대" → 18파일 분책(누락 0 검증). 교훈: **큰 산출물은 처음부터 단위별 파일+index로**. 이어서 메뉴 하나씩 같이 짚는 워크스루(비유 설명이 잘 통함 — 토큰=우편함 출입증).
