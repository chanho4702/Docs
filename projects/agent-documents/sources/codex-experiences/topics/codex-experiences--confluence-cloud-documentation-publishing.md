---
tags:
  - confluence
  - documentation
  - publishing
  - browser
updated: 2026-10-06
---

# Confluence Cloud 고객 문서 게시 방법

Moves Workforce 게시 방식을 Moves Approval에 적용하면서 확인한 재사용 절차다. 새 문서 작업에서 이 노트와 해당 프로젝트의 최신 게시 기록을 함께 읽는다. 원고 작성·초안 생성·실제 게시·게시 후 검증은 서로 다른 상태로 관리한다.

## 사용자가 선호하는 문서 구조

- 공간 홈은 언어 선택과 주요 업무로 연결하는 진입 안내로 쓴다.
- 최상위는 `한국어 가이드`와 `English Guide`로 두고, 각 가이드 아래 기능별 문서를 배치한다.
- `(KR) Moves Approval → 한국어 가이드`처럼 같은 언어 선택을 두 단계로 반복하지 않는다. 이번 작업에서 사용자가 직접 중복을 지적했다.
- 기능의 세부 주제만 하위로 둔다. 예: 페이지 승인 요청 → 영역 승인·재상신, 관리자 초기 설정 → 정책·스페이스·결재선·사용자·데이터 관리.
- 역할별 긴 통합 문서보다 목적·화면·기능별 문서를 선호한다. 각 문서에 경로, 준비 조건, 실제 버튼·입력 의미, 실행 순서, 완료 확인, 문제 해결을 담는다.
- 한영은 같은 주제·계층으로 대응시키고 모든 문서에 목차와 반대 언어로 가는 링크를 둔다. 번역 키가 존재한다는 이유만으로 실제 UI 버튼이 있다고 판단하지 않는다.

## 1. 재개 기록과 현행 서버부터 확인

1. Vault `INDEX.md`, 프로젝트의 작업 규칙, 최신 작업 기록과 게시 큐를 읽는다. 옛 ‘첨부 없음’이나 ‘연결 불가’ 기록을 현재 상태로 단정하지 않는다.
2. 실제 대상 사이트·space key·홈 ID·언어별 페이지 ID와 현재 도구 연결을 확인한다. 이전 세션의 브라우저·탭 ID를 재사용하지 않는다.
3. 사용 가능한 공식 connector/API를 먼저 확인한다. 이번 MA 작업은 연결된 Confluence 쓰기 connector가 없어 공식 Browser의 로그인된 Chrome 편집 UI로 게시했다.
4. Browser 작업 전 현재 설치된 스킬과 선택한 브라우저의 documentation을 읽는다. 예전 플러그인 버전 경로나 selector를 고정된 규격으로 간주하지 않는다.
5. 사용자에게 대상과 작업 범위가 이미 명확히 승인된 경우 같은 승인을 반복해서 묻지 않는다. 이 경험 노트 자체가 다른 사이트 게시나 권한 변경의 승인을 부여하지는 않는다.

## 2. 본문·첨부·매크로 보존

변경 전에 페이지 ID, 제목, 버전, 부모 계층, `body.storage`, `body.atlas_doc_format`, `body.view`, 첨부 목록을 보존한다. 전체 목록과 첨부 목록은 pagination을 끝까지 처리한다.

이번 공개 공간에서 사용한 읽기 경로:

```text
GET /wiki/rest/api/content?spaceKey=MA&type=page&limit=100&expand=version,ancestors,body.storage,body.atlas_doc_format,body.view
GET /wiki/rest/api/content/{pageId}?expand=version,ancestors,body.storage,body.atlas_doc_format,body.view
GET /wiki/rest/api/content/{pageId}/child/attachment?limit=100
```

공개 REST 조회가 되는 공간에서만 비로그인 검증을 쓸 수 있다. 비공개 공간은 정식 인증된 읽기 수단으로 검증한다. 브라우저 쿠키·토큰을 추출하거나 권한을 낮춰 공개하지 않는다.

- 사용자가 수정한 본문이나 첨부 이미지가 있으면 옛 로컬 원고로 전체 덮어쓰지 않는다. 실제 media node, 이미지 크기·배치·캡션과 변경된 텍스트를 보존하는 편집안을 먼저 만든다.
- 첨부 목록과 본문 이미지 참조는 별개다. 파일이 남아 있어도 본문에서 이미지가 사라질 수 있으므로 양쪽을 검사한다. 이미지가 존재하면 가능할 때 원본 파일도 보존한다.
- MA에서는 기존 첨부·본문 이미지가 0개임을 조회한 뒤 개편했다. 일반 페이지는 변경 전 원문과 Confluence 버전 이력을 보존했고, 홈은 기존 본문과 매크로를 실제 본문 안에 유지했다. 모든 프로젝트에 ‘이미지 없음’을 적용하면 안 된다.
- 홈의 native panel은 저장 시 storage `ac:macro-id`가 바뀌었다. 보존 여부는 ADF의 `localId`, node type, 설정·내용으로 대조한다. `recently-updated`, `contributors` 같은 extension의 macro ID와 설정도 검사한다.

## 3. 실제 ID로 게시 계획 확정

- 기존 문서는 가능한 한 같은 ID를 갱신한다. 제목과 부모가 바뀌어도 기존 주소를 유지할 수 있다.
- 게시 큐에는 주제 key, 언어, 원고 경로·hash, 제목, 실제 page ID, 부모 ID, 작업 상태, 검증 결과를 둔다. 게시 큐를 옛 생성기로 덮어쓰지 않는다.
- 신규 문서는 부모부터 준비한다. 실제 생성된 ID를 기록한 뒤 로컬 `.md` 링크를 실제 Confluence 페이지 주소로 변환한다. 초안 ID를 확보한 것만으로 게시 완료로 표시하지 않는다.
- 제목만 입력한 초안 중 다시 열리지 않는 사례가 있었다. 저장 상태와 재접근 가능 여부를 확인하고, 접근 불가가 확인된 초안만 대체한다. 대체 ID가 생기면 언어 전환을 포함한 모든 참조 문서를 재생성·재게시한다.
- 큐를 바꿀 때는 파일의 최신 상태를 다시 읽는다. 이번 세션에서는 재할당 전 객체를 참조한 저장 helper가 새 ID와 완료 상태를 옛 값으로 덮은 사고가 있었다. 오래 유지한 메모리 객체보다 디스크의 최신 큐와 서버 상태를 기준으로 복구한다.
- UTF-8 BOM을 제거한 뒤 Markdown을 렌더한다. 그렇지 않으면 첫 `# 제목`이 일반 텍스트로 게시될 수 있다.

## 4. 편집기에서 입력·게시

현행 UI에서 다음 요소를 직접 식별한 뒤 사용한다. 아래 selector는 2026-10-06 한국어 Confluence UI에서 확인한 예시다.

```text
#ak-editor-textarea.ProseMirror[aria-label="페이지 편집 영역입니다. 텍스트를 입력하려면 입력을 시작하세요."]
```

Rovo 입력칸과 본문에 같은 `ak-editor-textarea` ID가 생길 수 있다. ID만으로 선택하지 말고 실제 본문의 aria-label과 `.ProseMirror`를 함께 확인한다. 영어 UI에서는 label이 다르다.

1. 편집기와 제목 입력칸의 로딩이 끝났는지 확인한다. 초기 화면이 보였다가 hydration으로 교체되는 경우가 있다.
2. **전체 교체가 타당한 페이지에 한해서** 본문을 비운다. `fill('')` 성공만 믿지 말고 본문이 실제로 비었는지 확인한다. 편집기 placeholder는 본문으로 계산하지 않는다.
3. 이전 내용이 남으면 실제 본문 포커스를 확인한 뒤 `Control+A` 두 번과 `Backspace`로 지우고 다시 확인한다. 페이지 전체가 선택됐거나 입력이 안 되면 먼저 화면을 점검한다. 사용자가 추가한 이미지가 있는 페이지에는 이 전체 삭제 절차를 적용하지 않는다.
4. HTML을 공식 Browser clipboard/paste 기능으로 넣는다. h2와 표·필수 문장·링크가 본문에 들어갔는지 확인한다.
5. 제목을 입력하고 `Tab`으로 포커스를 옮긴 뒤 값을 확인한다. 제목 입력 직후 업데이트해 예전 제목이 남은 사례가 있었다. 신규 문서는 Rovo 자동 제목도 확인한다.
6. 기존 문서는 `업데이트`. 신규 문서는 `게시... → 위치 → 상위 항목 선택 → 계속 → 게시`를 거친다. 게시 위치가 기본 공간 루트인 경우가 있으므로 부모를 반드시 확인한다.
7. 페이지 이동은 `추가 작업 → 이동`에서 처리한다. 부모 검색이 제목 전체로 0건이어도 짧은 검색어로 정확한 후보가 나타난 사례가 있었다. 후보를 선택한 뒤 최종 부모 ID로 검증한다.
8. 클릭 시간 초과가 나도 실패로 단정해 재실행하지 않는다. 실제 게시 버전·부모를 먼저 조회한다. UI timeout 뒤 이동이 완료된 사례가 있었다.

## 5. 상세 → 목차 → 홈, 그리고 구조 정리

상세 문서를 게시하고 링크를 대조한 뒤 언어별 목차와 공간 홈을 갱신한다. 홈의 기존 매크로는 렌더된 HTML로 재붙여넣지 않고 편집기에서 기존 node를 유지한 채 필요한 부분을 편집한다.

중복 폴더를 없앨 때는 모든 하위 콘텐츠를 먼저 이동하고 폴더가 비었는지 확인한다. 빈 폴더만 복구 가능한 휴지통으로 옮긴다. 기존 소개 문서나 용도를 알 수 없는 사용자 초안을 함께 삭제하지 않는다.

## 6. 완료 판정

- 새로 읽은 서버 제목과 부모 ID가 큐와 일치한다.
- 교체한 가이드는 HTML entity와 공백을 정규화한 **본문 전체**가 원고와 일치한다. 필요한 문장 포함 여부만 검사하면 예전 목차가 앞에 남은 중복을 놓친다.
- 홈처럼 기존 본문을 유지한 페이지는 새 내용과 보존할 기존 텍스트·ADF node를 나누어 검사한다.
- 원고의 내부 링크, 실제 렌더된 링크, 모든 대상 페이지의 존재·접근, 한영 상호 이동을 확인한다. `createpage.action` 같은 미해결 링크도 실패로 본다.
- 첨부 ID와 본문 media 참조, 캡션·배치·너비를 전후 대조한다. 이미지 삽입 위치 표시와 실제 이미지 첨부 수는 따로 보고한다.
- 변경 대상 밖 문서는 버전·내용이 유지됐는지 확인한다. 의도적으로 이동한 문서는 새 부모를 별도로 기록한다.
- 대표 홈·언어별 목차·기능 문서를 실제 브라우저에서 보고 화면 증빙을 남긴다. API 검증만으로 시각 검수를 완료했다고 하지 않는다.
- 서버 게시 확인이 끝난 페이지만 완료 집계에 넣는다. 작업 기록·게시 큐·Vault의 상태를 실제 결과로 갱신한다.

## 재사용할 구현과 주의점

Moves Approval 정본: `C:\CloudJira\moves-approval\docs\guide\handbook\`.

| 파일 | 역할 |
| --- | --- |
| `editorial/publication-queue.json` | 실제 ID·부모·원고·게시 및 검증 상태 |
| `editorial/publication.cjs` | Markdown 변환, 실제 링크 연결, 공개 본문 대조 |
| `editorial/browser-publisher.mjs` | 공식 Browser 탭을 받아 UI 게시·이동 |
| `editorial/verify-publication.cjs` | 전체 페이지·링크·첨부·홈 보존 검사 |
| `editorial/work-log.md` | 재개 기록과 완료 범위 |
| `_workspace/handbook-publication/` (저장소 루트 아래) | before/after 원문, 검증 JSON, 실제 화면 증빙 |

```powershell
Set-Location C:\CloudJira\moves-approval
node docs/guide/handbook/editorial/verify-publication.cjs
```

검증기는 큐의 검증 상태도 기록하므로 완전한 로컬 무변경 명령은 아니다. 원격에서는 읽기만 수행한다.

이 publisher는 MA의 경로·언어·UI에 맞춘 최초 개편용 도구이며, 이미지가 있는 본문의 자동 보존을 구현한 범용 게시기가 아니다. 이후 다시 사용할 때는 새 작업용 현행 백업, 서버 버전 비교, 새 사용자 수정·첨부 보존을 먼저 준비한다. `bodyPublished`나 `refresh` 플래그를 최신 사용자 변경을 덮어쓸 근거로 쓰지 않는다. 홈의 보존 편집도 자동 publisher의 일반 전체 교체와 분리해 수행했다.

Workforce 비교 자료: `C:\CloudJira\moves-workforce\Moves_Workforce_사용자_매뉴얼\confluence\publication.md`, `_workspace\bilingual-guide-preview\CONTINUE.md`, `browser-publisher.mjs`. 오래된 전체 generator를 실행하면 사용자 첨부나 후속 원고 교정을 잃을 수 있으므로 최신 재개 기록을 우선한다.

## 적용 사례

- [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-handbook-publication-2026-10-06|moves-approval-handbook-publication-2026-10-06]] — 한영 48페이지와 홈 게시, 본문 1,942항목·원고 링크 284개·최종 렌더 링크 299개·이미지 위치 44곳 검사. 실제 제품 이미지 첨부는 0개.
- [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-workforce-style-confluence-publishing-2026-10-06|moves-approval-workforce-style-confluence-publishing-2026-10-06]] — 기존 홈 진입 안내와 게시 후 본문 확인의 초기 경험.
- [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-confluence-publication-2026-10-04|moves-workforce-confluence-publication-2026-10-04]] — Workforce 최초 한영 게시 방식.
- [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-focused-guide-update-2026-10-05|moves-workforce-focused-guide-update-2026-10-05]] — 사용자가 추가한 이미지·본문을 보존한 후속 편집.
