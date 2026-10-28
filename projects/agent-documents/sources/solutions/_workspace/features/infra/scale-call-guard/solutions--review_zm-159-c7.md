# 검수 요청 — ZM-159 C7 잘림 표시(문제 목록 이력 모드) 구현

- 요청: Claude · 2026-09-18 · BE `C:/worktrees/zm-159-be`(HEAD `aff4097` = master) · FE `C:/worktrees/zm-159-fe`(HEAD `aac67f4` = master) — 양쪽 미커밋 변경 전부가 범위
- 설계: `_workspace/features/infra/scale-call-guard/devdesign_zm-159-c7-truncation-notice.md` **§0 v1**(설계 검토 `review_zm-159-c7-design_codex.md` R1~R11 반영)

## 범위
| 층 | 변경 |
|---|---|
| BE | `EventService.listHistoryForScreen`이 상한 **+1건**을 요청해 "정확히 상한"과 "상한 초과"를 구분, 초과 시 상한까지만 쓰고 warn 1줄. `EventProblemResListDto`에 `truncated`·`scanLimit`(3인자 생성자 유지 — RECENT·기존 호출부는 false/0), 계약 주석에 "truncated면 total·statusCounts·트리 모두 부분집합 기준"과 기존 quirk(total은 자식 포함인데 페이징은 루트 기준) 기록 |
| FE | `TProblemListResponse`(= `TResponseList<TProblemLists>` + truncated·scanLimit) 신설, 소비 경로 `services/event.api.ts` 반환형 교체. `ProblemTruncationNotice` 컴포넌트(안내 배너, `role="status"`)를 **필터와 표 사이**에 배치. i18n `kr.json`·`en.json` 2키(`{{limit}}` 보간, 숫자 `toLocaleString`) |
| 결정(설계 v1) | 전체 건수(`countHistory`)는 **싣지 않는다** — 화면 필터(억제·해소기간·심각도)가 앱에서 걸려 모집단이 어긋나고, 실패 시 목록까지 죽고, 페이지 이동마다 다시 센다 |
| 테스트 | BE 3건(초과 → truncated·상한까지만·요청 limit+1 / 정확히 상한 → false / RECENT → false) · FE 3건(배너 노출·미노출·값 없음) |

## 중점 확인 요청
1. 잘림 판정이 실제로 맞는가 — `ofWindowForScan(limit+1)`이 어댑터에서 그대로 `limit`으로 나가는지, 정렬(최신순)과 `subList` 조합이 "최근 N건"인지.
2. `truncated`일 때 화면이 오해를 남기지 않는가 — 칩·총계·페이지네이션은 그대로 부분값이다(배너 문장으로만 알림). 더 필요한 표시가 있는가.
3. 3인자 생성자 유지가 다른 호출부·계약(Swagger·AI 서버)에 문제를 만드는가.
4. FE: 배너 위치·i18n 키·숫자 포맷·접근성, `TResponseList` 오염 회피가 실제로 됐는가, 다른 소비자(`services/alert.ts#getListAlert` 중복 타입) 영향.
5. 테스트가 위를 고정하는가(특히 경계 20,000/20,001).

## 출력 형식
- `R번호 · 심각도(필수/권장/참고) · 파일:줄 · 문제 · 근거 · 제안`. 확인 못 한 것은 "추정". 파일 수정·빌드 금지.

---

## 반영 기록 (2026-09-18, 코덱스 gpt-5.6-sol high → `review_zm-159-c7_codex.md`)
필수 결함 0건. 권장 2건 반영.

| 번호 | 판정 | 반영 |
|---|---|---|
| R1 권장 | 부분 수용 | 실제 `kr.json`·`en.json`을 읽어 **키 존재와 `{{limit}}` 치환자**를 검증하는 테스트 추가(목 t()가 가리던 오타를 잡는다). 🔴 `ProblemList` 전체 렌더 통합 테스트는 **넣지 않았다** — 라우터·쿼리파라미터·표·필터 등 의존이 많아 깨지기 쉬운 테스트가 된다. 배너는 별도 컴포넌트로 분리해 단위로 고정했고, 화면 연결(props 전달·배치)은 코드 리뷰로 확인했다 |
| R2 권장 | 수용 | 이력 픽스처의 시각을 1분 간격으로 벌리고, 정렬을 걸어 **남은 것 중 가장 오래된 건**이 상한번째임을 단언(뒤에서 자르는 회귀를 잡는다). ⚠️ 그 과정에서 기존 성질 발견 — `occurrenceTime` 정렬은 **방향이 반대**(ASC가 최신순)다. 이 티켓에서 고치지 않고 테스트 주석에 기록 |

검증: BE `EventServiceTest` 44건 통과 · FE `ProblemTruncationNotice.test.tsx` 5건·tsc·eslint 통과.
