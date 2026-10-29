# C:\solutions — moveseye 모노레포

Zabbix 기반 인프라 모니터링 대시보드(DMOVE)의 통합 작업 루트.

- `moveseye-be-spring/` — **백엔드 API 정본** (Spring Boot 3.3 + JPA/Flyway + Redis). 2026-06-22 Spring 단일 채택 확정 — 앞으로 새 BE 기능·수정은 **여기에만** 반영한다. 코딩 규약·주의사항 정본은 `moveseye-be-spring/CLAUDE.md`.
- `moveseye-be/` — 구 백엔드 (NestJS 10 + TypeORM + Redis). NestJS→Spring 변환의 원본이며, Spring 채택 후 **참조용으로 존치**(양쪽 병행 종료, 제거/아카이브 미결). FE→Spring 런타임 전환은 2026-06-23 완료(:3000=Spring).
- `moveseyee_fe/` — 프론트엔드 (React 19 + Vite + Ant Design 5 + TanStack Query). 규약은 하네스의 `fe-engineer` 에이전트 정의에 정리됨.
- `moveseye-license-issuer/` — **라이선스 발급 도구** (사내 전용, Java 17 + Gradle, 2026-08-06 신설). 제품과 **별도 저장소**다 — 개인키를 다루는 코드가 고객사에 넘어가는 소스에 섞이지 않게 분리했다. 🔴 클레임 상수·enum 4개 파일(`LicenseClaims`·`Edition`·`Feature`·`LicenseType`)은 **BE와 동일한 사본**이며 한쪽만 고치면 "발급은 됐는데 제품이 거부"가 난다 — 양쪽 `LicenseContractTest`가 이를 잡는다. 상세는 `moveseye-license-issuer/README.md`.

- `moveseye-ai/` — **AI 어시스턴트 서버**(별도 프로세스 :3100, 2026-08-19 신설). Spring Boot 4 + Spring AI 2.0(프로바이더 중립: Anthropic/OpenAI 호환/Azure/Ollama). 툴 = BE REST 프록시(사용자 쿠키 그대로 전달, BE 무수정, **71개** — 2026-09-07 APM `apm_*` 8종 추가), 쓰기는 확인 게이트. 설계 `_workspace/features/ai/ai-assistant/devdesign_ai-assistant.md`, 규약 `moveseye-ai/CLAUDE.md`. 🔴 Jackson 3(`tools.jackson`)·Boot 4라 BE와 의존성 복붙 금지.

> 라이선스 작업 브랜치는 **`ZM-79`**(BE·FE 모두 develop 기준). 설계 정본은 `_workspace/features/auth-license/license/devdesign_premium-edition.md` v4.

---

## 📁 `_workspace` 문서 위치 규칙 (2026-10-19 재편)

- **같은 기능의 문서는 한 폴더**: `_workspace/features/<영역>/<기능>/`에 설계(`devdesign_`)·계약(`contract_`)·보고·검수 요청서(`review_`)·QA(`qa_`/`e2e_`)를 함께 둔다. 영역 14개·기능 폴더 목록은 `_workspace/README.md` 표가 정본이고, 옵시디언 기능 지도 노드와 1:1이다.
- 코덱스 원시 출력·프롬프트·JSON·테스트 로그·패치는 `_workspace/_archive/features/<영역>/<기능>/`에. 기능 횡단 백로그·스프린트는 `planning/`, 감사·조사는 `analysis/`, 핸드북은 `guides/`.
- 옛 경로(`_workspace/designs/…`·`reviews/…`·루트 `contract_*.md`)는 `_workspace/_moved.tsv`로 찾는다. 코드 주석의 옛 경로는 고치지 않았다.
- 진행 중 세션이 쓰던 문서 중 DB 모니터링만 옛 경로(`reviews/`·`designs/`)가 남아 있다 — 병합 뒤 지운다. APM 알람 채널·장애 메뉴·legacy-hold 옛 경로 하드링크 73건은 2026-10-22 병합 뒤 삭제했다.

---

## 🤝 Codex ↔ Claude 협업 모드 (2026-08-02~)

이 레포는 **Codex와 Claude가 영역을 나눠** 작업한다. 규약 정본은 **[COLLAB.md](./COLLAB.md) — 작업 시작 전 반드시 읽는다.**

> **⚠️ 아래 규칙은 `COLLAB.md` 최상단 `STATUS: ACTIVE`일 때만 적용된다.** `SOLO-CLAUDE`면 소유권·하네스 제약이 전부 무효가 되고 BE·FE 양쪽을 다 맡는다. **먼저 그 한 줄을 확인하라.**
> 사용자가 "이제 너 혼자 해"/"코덱스 안 쓴다"고 하면 파일을 되돌리지 말고 **COLLAB.md의 스위치 한 줄만 바꾼다**(절차: COLLAB.md §7).

| 영역 | 소유자 | 상대편 |
|------|--------|--------|
| `moveseye-be-spring/`, `moveseye-engine/` | **Codex** | 읽기만 |
| `moveseyee_fe/` | **Claude** | 읽기만 |

- **소유하지 않은 레포에 쓰기 금지**(생성·수정·삭제·커밋). 읽기는 자유.
- 브랜치는 양쪽 다 현 브랜치(`ZM-87`) 유지. 각자 자기 레포만 커밋.
- **유일한 접점은 `_workspace/features/<영역>/<기능>/contract_{feature}.md`** — BE 선행(계약 산출) → FE 연동 순서.
- BE 수정이 필요하면 **직접 고치지 말고** 계약서의 `## 🔄 FE 요청사항` 섹션에 남기고 사용자에게 보고한다.
- **`be-engineer`로 BE에 쓰기 작업을 시키지 않는다**(읽기 전용 조사만). `fullstack-feature` 실행 시 BE 단계는 "계약서 대기"로 대체.
- BE(:3000) 기동/재빌드는 Codex, FE(:5173)는 Claude. 상세는 COLLAB.md §5·§6.

---

## 하네스: 풀스택 기능 개발 (FE+BE 통합)

**목표:** BE 엔드포인트 추가 → API 계약 동기화 → FE 연동 → 경계면 QA를 한 세션에서 처리한다.

**트리거:**
- 풀스택/양쪽에 걸친 기능 요청(예: "엔드포인트 추가하고 화면까지", "BE랑 FE 같이", "API 만들고 연동") → `fullstack-feature` 스킬을 사용하라.
- BE↔FE 타입/계약 정합 작업("API 연동", "타입 맞춰줘", "Swagger와 FE 비교") → `api-contract-sync` 스킬을 사용하라.
- 한쪽만 명확히 끝나는 작업은 해당 에이전트(`be-engineer` / `fe-engineer`)를 직접 써도 된다. 단순 질문은 직접 응답 가능.

**구성:** 에이전트 팀 모드. 에이전트 `be-engineer` / `fe-engineer` / `integration-qa`(정적 경계면) / `functional-qa`(런타임 행위), 스킬 `fullstack-feature`(오케스트레이터) / `api-contract-sync`(공유). 중간 산출물은 `C:\solutions\_workspace/`에 보존.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-06-02 | 초기 구성 (통합형 모노레포 하네스) | 전체 | FE/BE 풀스택 기능을 한 세션에서 협업 처리 |
| 2026-06-02 | 트리거 경계 명확화 + QA 스폰타입·팀 폴백 명시 | api-contract-sync, fullstack-feature | Phase6 검증에서 트리거 충돌·QA 타입 누락 발견 |
| 2026-06-17 | functional-qa(행위/E2E 검증) 역할 신설 + 파이프라인 Phase 3.5 편입 | functional-qa, fullstack-feature | integration-qa가 정적 shape만 봐 런타임 동작 검증 공백 존재 |
| 2026-06-22 | BE를 Spring(`moveseye-be-spring`) 단일 채택 확정 — Nest 병행 종료, 새 BE 작업은 Spring만 | 전체 / be-engineer · fullstack-feature | 채택 구현 결정 → Nest+Spring 이중 유지 비용 종료 ([[be-dual-maintenance]] 메모리 갱신) |
| 2026-07-02 | 하네스 Spring 동기화 — be-engineer를 Spring 기준으로 재작성, 스킬 2종(fullstack-feature·api-contract-sync)의 BE 참조·Swagger 경로(`/v3/api-docs`) Spring 교체, integration-qa 용어 갱신, functional-qa 스택 분기 제거·FE 포트 5173(auto-increment 주의)로 정정, fe-engineer에 언랩 깊이·npx jest 교훈 추가, `_workspace` 규칙을 기능별 누적 보존으로 수정 | 전체 | 하네스 점검에서 06-22 Spring 채택이 파일에 미반영된 drift 발견 (이력만 기록되고 실제 파일 미갱신) |
| 2026-07-28 | **수집 엔진 Phase 1 종료** — Zabbix 단일 → 다중 데이터소스 포트화 완료(스텝 0~5). `engine-api`(계약: 중립 `engine/` + Zabbix 전용 `zabbix/`) / `engine-zabbix`(구현) 멀티모듈, **app→engine-zabbix 컴파일 의존 차단**(빌드가 강제). 각 모듈에 README·CLAUDE.md 신설 | moveseye-be-spring | 메트릭·인벤토리·알람 읽기가 전부 포트 경유. **스텝 6(Prometheus)은 사용자 결정으로 보류** — 재개 지점은 설계서 `⏸ 스텝 6 착수 가이드` |
| 2026-08-02 | **Codex ↔ Claude 협업 모드 도입** — BE/FE 수직 분할(Codex=BE·엔진, Claude=FE), 현 브랜치 유지 + 영역 배타, 접점은 `_workspace/features/**/contract_*.md` 단일. 규약 정본 `COLLAB.md` 신설, 루트/각 레포 규약에 소유권 배너 반영, `fullstack-feature`에 BE 위임 모드 추가 | 전체 | 두 에이전트 병행 작업 시 동시 편집으로 서로의 수정이 소실되는 것을 구조적으로 차단 |
| 2026-08-03 | **협업 모드 → `SOLO-CLAUDE` 전환** — BE/FE 수직 분할 종료. **구현은 Claude 단일(BE·FE 모두), Codex는 검수 담당**(COLLAB.md §8 신설). 소유권·하네스 제약은 `STATUS` 한 줄로 무효화됐고 배너 파일은 그대로 둔다 | 전체 | 실사용 막는 항목이 BE 대기로 멈추는 구조가 비효율(요청 6건이 하루 대기). Codex가 R-1~R-5·A-1 전건 처리·커밋 완료(`e946f7c`) 후 인수인계 확인하고 전환 |
| 2026-10-19 | **`_workspace` 기능 폴더 재편** — 접두어 폴더(designs·reviews·reports·루트 contract_*)를 `features/<영역>/<기능>/`로, 흔적(코덱스 원시·검증 로그)은 `_archive/features/…`로. 715건 이동, 문서·메모리·옵시디언·하네스 경로 재작성(코드 주석 제외, `_moved.tsv`). 병합 완료 코덱스 워크트리 `apm-ux-fix-20261001` 제거 | 전체 / 에이전트·스킬 경로 | 900여 문서가 접두어 폴더에 흩어져 같은 기능이 4~5곳에 있던 것을 기능 단위로 |
