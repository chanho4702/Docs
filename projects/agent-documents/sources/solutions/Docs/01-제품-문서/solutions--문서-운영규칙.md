---
title: MovesEye 문서 운영 규칙
doc_type: governance
audience: [기획, 개발, 운영, QA]
status: current
owner: MovesEye 팀
baseline: 2026-08-05
source_of_truth: C:/solutions/moveseye-docs/문서-운영규칙.md
reviewed_at: 2026-08-05
review_cycle: quarterly
---

# MovesEye 문서 운영 규칙

## 1. 목표

문서는 코드 설명을 복사해 쌓는 공간이 아니다. 독자가 질문의 답을 찾는 **탐색 경로**, 현재 동작을 확인하는 **기준선**, 변경 이유를 복원하는 **기억**을 분리해 관리한다.

## 2. 세 층의 역할

| 층 | 위치 | 담는 것 | 담지 않는 것 |
|---|---|---|---|
| 제품 문서 정본 | `C:\solutions\moveseye-docs` | 현재 제품·사용법·아키텍처·운영 기준 | 세션 로그, 미확정 아이디어 |
| 작업 중 증거 | `C:\solutions\_workspace` | 설계안, `contract_*.md`, QA 결과, 진단 자료 | 영구 사용자 매뉴얼 |
| 경험·결정 기억 | Obsidian `claude-experiences` | 결정 이유, 교훈, 타임라인, 관련 노트 MOC | 최종 문서의 전문 복사본 |

Obsidian에는 최종 문서를 중복 저장하지 않는다. MOC에서 로컬 정본 경로를 안내하고, 변경 이유와 교훈만 위키링크로 연결한다.

## 3. 문서 유형

| 유형 | 질문 | 예시 |
|---|---|---|
| `hub` | 어디서 무엇을 읽는가? | `README.md` |
| `product` | 이 제품은 누구의 어떤 문제를 푸는가? | 제품 개요 |
| `guide` | 목표를 이루려면 어떤 순서로 하는가? | 빠른 시작, 사용자 가이드 |
| `architecture` | 시스템은 어떤 경계와 흐름으로 구성되는가? | 아키텍처, 데이터 모델 |
| `runbook` | 운영 중 무엇을 확인하고 어떻게 복구하는가? | 운영 Runbook |
| `feature` | 기능 하나의 설계·계약·검증은 무엇인가? | 기능 문서 |
| `decision` | 무엇을 왜 채택했는가? | ADR |
| `reference` | 반복해서 확인할 정확한 정의는 무엇인가? | 용어집, 인벤토리 |
| `release` | 어떤 기준선이 언제 바뀌었는가? | CHANGELOG |

## 4. 상태와 메타데이터

모든 정식 문서는 아래 frontmatter를 갖는다.

```yaml
---
title: 문서 제목
doc_type: guide
audience: [운영자]
status: draft        # draft | review | current | superseded
owner: MovesEye 팀
baseline: YYYY-MM-DD # 설명하는 코드·제품 기준일
source_of_truth: 관련 코드/문서 경로
reviewed_at: YYYY-MM-DD
review_cycle: monthly
deployment_scope: source | dev | qa | production
---
```

- `draft`: 구조와 내용이 변할 수 있다.
- `review`: 사실 검증 또는 독자 검토 중이다.
- `current`: 현재 기준선으로 사용할 수 있다.
- `superseded`: 새 문서로 대체됐다. 삭제하지 말고 상단에 대체 문서를 연결한다.

`reviewed_at`은 파일 수정일이 아니라 **사실 원천을 다시 확인한 날**이다.

ADR은 문서 생명주기 `status`와 결정 상태 `decision_status`를 분리한다. 예: `status: current`, `decision_status: accepted`.

`current`가 실제 배포를 뜻하는 것은 아니다. 배포 사실을 주장하는 문서는 `be_commit`, `fe_commit`, `latest_flyway`, `deployment_scope`, `qa_evidence`를 기록한다. 공통 source 기준선은 root `README.md`를 참조할 수 있지만, 배포별 기준은 release 문서에 고정한다.

## 5. 정본 우선순위

1. 실행되는 코드와 runtime 검증 결과
2. 기계 생성 계약: OpenAPI, Flyway migration, build dependency
3. 이 문서 세트의 current 문서
4. `_workspace`의 완료 전 설계·계약
5. Obsidian 경험 노트와 과거 작업 기록

낮은 순위 문서가 높은 순위와 다르면 낮은 문서를 갱신한다. 단, 코드가 확정된 제품 결정과 어긋난 정황이면 코드 결함으로 등록하고 임의로 문서를 맞추지 않는다.

## 6. 변경 트리거

| 변경 | 같은 변경에서 확인할 문서 |
|---|---|
| FE route·SideNav 변경 | 사용자 가이드, 빠른 시작, 제품 개요 |
| Controller·DTO 변경 | 기능 문서, 아키텍처, OpenAPI 링크 |
| Flyway migration·Entity 변경 | 데이터 모델, 운영 Runbook |
| 인증·권한 변경 | 제품 개요, 사용자 가이드, 운영 Runbook, 관련 ADR |
| engine port·adapter 변경 | 아키텍처, 데이터 모델, 관련 기능 문서 |
| 환경변수·기동 명령 변경 | 운영 Runbook, 개발자 온보딩 |
| 릴리스·배포 | `releases/릴리스-노트.md`, 인벤토리 baseline |

## 7. 기능 문서 생명주기

```text
아이디어/기획
  ↓
_workspace/devdesign_*.md 또는 design_*.md
  ↓
_workspace/contract_*.md (BE↔FE 경계)
  ↓
구현 + integration/functional QA 증거
  ↓
features/<feature>.md 로 핵심만 승격
  ↓
사용자·운영·아키텍처 문서에 필요한 변화 반영
```

`_workspace`의 모든 산출물을 옮기지 않는다. 최종 동작, 불변식, 운영상 주의, 검증 근거만 안정 문서로 승격한다.

## 8. 문서 완료 조건

- 대상 독자와 해결하는 질문이 첫 화면에 보인다.
- 코드 identifier와 경로는 실제 기준선과 일치한다.
- 현재 기능과 계획 기능을 구분한다.
- 비밀값·개인정보·실계정은 포함하지 않는다.
- 정상 흐름뿐 아니라 실패·권한·빈 데이터 상태를 설명한다.
- 관련 문서가 양방향으로 연결된다.
- `baseline`, `reviewed_at`, 변경 이력이 갱신된다.
- 배포 상태를 주장하면 commit·migration·환경·QA evidence가 있다.
- 새 독자가 문서만으로 핵심 질문에 답할 수 있다.

## 9. 문체와 파일 규칙

- 파일 경로는 ASCII `kebab-case.md`, 제목과 본문은 한국어를 사용한다.
- 메뉴명·API·class·field 같은 identifier는 코드 표기를 유지한다.
- 한 문단에 한 주장만 둔다. “적절히”, “필요 시”처럼 조건 없는 표현은 피한다.
- Mermaid는 구조·흐름을 설명할 때만 사용한다.
- 표에 들어간 상태는 `현재`, `부분`, `계획`, `보류` 중 하나로 명시한다.
- 스크린샷은 화면 변화가 잦으므로 보조 자료로만 쓰고, 절차의 유일한 근거로 삼지 않는다.

## 10. 검토 주기

- 월간: 인벤토리, 빠른 시작, 운영 Runbook, 릴리스 노트
- 분기: 제품 개요, 아키텍처, 데이터 모델, 용어집
- 이벤트 기반: 보안·권한·schema·data source 경계 변경 직후

문서 검토자는 가능하면 작성자가 아닌 사람으로 정한다. 독자 테스트에서 틀린 답이 나오면 해당 문서를 `review`로 내리고 보완한다.
