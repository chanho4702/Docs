# ZM-159 C7 — 잘림 표시 (문제 목록 이력 모드) · 설계 v1

- 작성 2026-09-18 · 상위 설계 §0.7 C7 · 근거: 감사 **E3**(문제 목록 "이력" 모드 2만 건 절단, 표시 없음)
- 워크트리: BE `C:/worktrees/zm-159-be` · FE `C:/worktrees/zm-159-fe`(브랜치 ZM-159)

## 1. 현상
- `EventService.listHistoryForScreen`은 이력 모드에서 `event.get`을 **경량 2만 건 상한**(`HISTORY_SCAN_LIMIT`)으로 받는다.
- 응답 `EventProblemResListDto`는 `{items, total, statusCounts}`뿐 — **잘렸다는 표시가 없다.**
- 그래서 7일에 350만 건이 있어도 화면은 "총 2만 건"을 **정답처럼** 보여 준다. 심각도 칩·정렬·트리 모두 잘린 2만 건 기준이다.
- RECENT 모드는 사본(DB) 조회라 이 문제가 없다.

## 0. v1 결정 (코덱스 설계 검토 `reviews/review_zm-159-c7-design_codex.md` R1~R11 반영) — 🔴 §2와 충돌하면 여기를 따른다
| 주제 | v1 결정 |
|---|---|
| 잘림 판정 | `countHistory` 대신 **상한 + 1(20,001)건을 요청**하고, 받은 수가 상한을 넘으면 잘림. 목록은 상한까지만 쓴다. 정확히 2만 건이면 **잘리지 않은 것**(R1) |
| 전체 건수 | **싣지 않는다.** 화면 필터(억제·해소기간·심각도)가 앱에서 걸려 `countHistory` 모집단과 어긋나고(R2), 실패 시 목록까지 죽으며(R7), 페이지 이동마다 다시 세게 된다(R8). 커서 페이지네이션이 생기면 그때 다시 본다 |
| 계약 | `EventProblemResListDto`에 `truncated`(boolean)·`scanLimit`(int). RECENT 모드는 `false`/`0`. `total`·`statusCounts`는 **검사한 부분집합 기준**임을 계약 주석에 명시(R4) |
| 기존 quirk | `total`은 자식 포함 건수인데 페이지네이션은 루트 기준이라 뒷페이지가 빌 수 있다 — **이번 범위 밖**, 계약 주석에만 기록(R6) |
| 문구 | "최근 2만 건" 하드코딩 금지. 응답 `scanLimit`을 넣고, **목록·심각도 집계·인과 묶음이 모두 일부**임을 문장으로 알린다(R3·R5) |
| FE 위치 | 실제 소비 경로는 `services/event.api.ts` → `ProblemList.tsx`. 배너는 **필터와 표 사이**, Ant `Alert`(`role="status"`), i18n `kr.json`·`en.json` 양쪽 키(R9·R10) |
| 로그 | 잘린 요청은 warn 1줄(기간·필터) — 요청마다 남기되 문구에 필터를 넣어 원인 파악이 되게 한다. 캐시·metric은 범위 밖 |

## 2. 방향 — "덜 보여 주되, 덜 보여 준다고 말한다"
전량을 다 받는 쪽으로 가지 않는다(350만 건을 메모리에 올릴 수 없다). 대신 **잘렸음을 계약에 싣고 화면이 알린다.**

### 2.1 BE
| 항목 | 내용 |
|---|---|
| DTO | `EventProblemResListDto`에 `truncated`(boolean)·`scanLimit`(int) 추가. RECENT 모드는 항상 `false`/`0` |
| 판정 | 이력 스캔 결과 건수 `>= HISTORY_SCAN_LIMIT`이면 잘림. (상한을 정확히 채운 경우도 잘림으로 본다 — 더 있는지 알 수 없다) |
| 정확한 총계 | 잘렸을 때만 `alertPort.countHistory`로 **기간 내 실제 건수**를 한 번 더 센다(행 없이 개수만, 1콜). `total`은 종전 의미(필터 적용 목록 크기) 유지하고 `matchedTotal`로 따로 싣는다 |
| 로그 | 잘린 요청은 warn 1줄(기간·필터·실제 건수) |

### 2.2 FE (`pages/event-alert/problem/ProblemList.tsx`)
- 목록 위에 안내 배너: **"이 기간의 이력이 많아 최근 2만 건만 표시합니다(전체 N건). 기간을 좁히면 전부 볼 수 있습니다."**
- 배너는 이력 모드 + `truncated`일 때만. 심각도 칩·총계 옆에 `~` 같은 근사 표시는 하지 않는다(숫자를 흐리기보다 문장으로 설명).

## 3. 범위 밖
- 인터페이스 상태 차트의 잔여 절단(수집 주기가 1분보다 촘촘한 아이템) — 메트릭 포트 완전성 계약(C5)이 필요해 이번엔 제외. C8에서 만든 `AlertScanOutcome`처럼 메트릭 쪽에도 같은 형태가 필요하다.
- 이력 모드의 페이지네이션(진짜 커서 페이징) — 별도 과제.

## 4. 테스트
- BE: 2만 건 미만 → `truncated=false`·`countHistory` 미호출 / 정확히 2만 건 → `truncated=true`·`matchedTotal`은 count 결과 / RECENT 모드 → 항상 false.
- FE: `truncated=true`면 배너 노출·전체 건수 표기, `false`면 미노출, RECENT 모드 미노출.
