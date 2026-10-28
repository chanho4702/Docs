---
type: project
tags: [project, moveseye, dmove, harness, monorepo, agent-team, fullstack]
created: 2026-06-02
updated: 2026-06-02
status: active
---

# MovesEye — 통합형 풀스택 하네스 구축 (2026-06-02)

> `C:\solutions`(모노레포 루트)에 FE+BE 협업 하네스를 구축한 기록.
> 서비스 개요는 [[projects/moveseye/moveseye-overview|moveseye-overview]], BE 진단은 [[projects/moveseye/2026-06-02-be-codebase-audit|2026-06-02-be-codebase-audit]], 하네스 일반론은 [[topics/claude/harness-engineering|harness-engineering]] 참고.

## 배경 / 결정
- `C:\solutions` 아래 `moveseye-be`(NestJS), `moveseyee_fe`(React19/Vite) 두 레포가 별개로 존재.
- 요구: "두 프로젝트에 하네스 만들 수 있나? 서로 통신되게?"
- **핵심 사실**: Claude Code 하네스는 cwd 1개에 묶임 → 두 폴더의 에이전트가 런타임에 자동으로 메시지를 주고받지는 않음. "연계"는 ① 통합형(상위 루트 1벌) ② 분리형+계약동기화 ③ 지식공유 중 택1.
- **선택: 통합형** — `C:\solutions`를 루트로 하네스 1벌. FE/BE 전문 에이전트가 **한 세션 안에서 팀**으로 협업.

## 구축 결과 (`C:\solutions\.claude\`)
- **에이전트 3** (모두 `model: opus`)
  - `be-engineer` — NestJS 백엔드. 작업 전 `moveseye-be/CLAUDE.md`(정본) 읽음. 응답 DTO `@ApiProperty`로 **계약 산출(upstream)**.
  - `fe-engineer` — React19/Vite. 작업 전 `moveseyee_fe/CLAUDE.md`(정본) 읽음. 계약 **소비(downstream)**.
  - `integration-qa` — general-purpose. BE 응답 shape ↔ FE 타입/훅 **경계면 교차 검증**(incremental QA).
- **스킬 2**
  - `fullstack-feature` — 오케스트레이터. 에이전트 팀 모드. 흐름: BE 구현+계약 → 동기화 → FE 연동 → QA. Phase0 컨텍스트 확인(초기/부분/새 실행) 포함.
  - `api-contract-sync` — **핵심 연결고리**. BE 컨트롤러/DTO/Swagger ↔ FE services·types·hooks 대조·동기화.
- **`C:\solutions\CLAUDE.md`** — 하네스 포인터(트리거 규칙) + 변경 이력.
- 중간 산출물: `C:\solutions\_workspace/`에 `contract_{기능}.md`(SSOT) / `qa_{기능}.md`.

## "서로 통신"의 실제 구현
1. **계약 파일**(`_workspace/contract_*.md`) = 단일 진실원천. be가 쓰고 fe·qa가 읽음.
2. **에이전트 메시지**(SendMessage) = 계약 변경 협의·불일치 통보.
3. 팀 도구(TeamCreate) 미가용 환경이면 서브에이전트(병렬 `Agent`)로 폴백 설계.

## FE 구조 핵심 발견 (계약 동기화 근거)
- 도메인별 1:1 3층: `services/{d}.api.ts`(axios) · `types/{d}.ts` · `hooks`(react-query). path alias `@/`(BE와 동일).
- **응답 언래핑 2단계**(가장 헷갈리는 지점): ① `axiosInstance`가 axios `.data` 1차 벗김 → 서비스가 `ApiResult` 본문 수신, ② `useDmoveQuery`가 envelope `{data, syncTime}`에서 페이로드·syncTime 2차 분리. → 타입은 페이로드 T 기준, 컴포넌트에서 `data.data` 재언래핑 금지.
- `axiosInstance`가 **Bearer + x-visitor-id 자동 부착**(BE JwtAuthGuard 요구) + 동일 URL 중복요청 abort.
- 도메인 매핑: BE host↔FE host-monitoring, BE aws(cloud-infras)↔FE cloud-infra 등. **FE엔 `asset.api.ts` 있으나 BE asset 모듈 미구현** → contract-sync가 잡을 케이스.

## 부수 작업
- `moveseyee_fe/CLAUDE.md`는 작업 중 이미 충실하게 존재함을 발견(jest.config.cjs·권한·라우팅 패턴까지 정확). 통째 교체하지 않고 **응답 2단계 언래핑 + x-visitor-id 자동부착**만 보강(§3 데이터페칭·§4 서비스레이어).

## 사용법
- **`C:\solutions`를 cwd로 새 세션**을 열어야 하네스 로드됨(루트 CLAUDE.md).
- 풀스택 요청("엔드포인트 추가하고 화면까지") → `fullstack-feature` 트리거.
- 타입만 맞추기("BE 바뀜, FE 타입 맞춰줘") → `api-contract-sync` 단독.
- 한쪽만이면 `be-engineer`/`fe-engineer` 직접.

## 교훈
- 멀티레포 "연계"는 통합 루트 + 계약파일(SSOT) + 메시지 조합이 현실적. 자동 IPC 환상 금지.
- 기존 산출물(여기선 FE CLAUDE.md)은 덮어쓰기 전 반드시 확인 — 더 나으면 보존+보강.

## 관련 노트
- [[projects/moveseye/moveseye-overview|moveseye-overview]] · [[projects/moveseye/2026-06-02-be-codebase-audit|2026-06-02-be-codebase-audit]] · [[topics/claude/harness-engineering|harness-engineering]] · [[projects/moveseye/moveseye|moveseye]]
