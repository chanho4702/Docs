# 검수 요청 — RT-3 1단계 BE: 롤업 커버리지 앞·뒤 경계 분리 (2026-10-11)

- 워크트리 `C:\worktrees\apm-rt3`, 브랜치 `apm-legacy-hold-rt3`(master `3680909`), 미커밋, Flyway 변경 없음. diff 전문 `scratchpad/rt3-be.diff`.
- 해법 정본 `features/apm/alerts/apm-legacy-hold-rt3-20261010.md`, 원인·해법 검토 `_archive/features/apm/alerts/review_apm-legacy-hold-rt3-20261010_codex.md`(1단계·소비자 표·테스트 1,2,4,5,8). 계약 `features/apm/hardening-20261006/contract_apm-late-rollup-20261006.md` 끝 "2026-10-10 RT-3" 절.

## 요지
- `ApmMetricCoverageReader.firstIssue/Issue` 삭제 → `coverage()`/`Coverage{untrustedBefore+prefixReason(BOOTSTRAP_PENDING|LEGACY_UNVERIFIED), incompleteFrom+suffixReason(PENDING|BLOCKED)}`. 신뢰 구간 `[max(from,untrustedBefore), min(to,incompleteFrom??to))`. 앞쪽 경계가 to보다 뒤면 창 전체 미검증.
- 경계 정규화는 `ApmMetricDirtyStore.cutoverBoundary` 공용(롤업과 동일). stage 60 = max(stage5, stage60) 정각. `bootstrap_until`이 경계보다 뒤면 그 끝까지 보류(방어).
- **`legacy_hold`는 경계를 바꾸지 않음**(hold와 무관하게 도입 이전=미검증, 이후=새 보장). dirty marker는 신뢰 후보 구간에서만, stage 60은 stage 5 marker 상속.
- 소비자: SLO series(경계 사이 점만, **앞쪽이 잘리면 errorBudgetTotal·budgetRemainingPct null**, 뒤쪽만이면 기존대로), Calculator(겹치면 completenessVerified=false, Measured에 coverage, unknownReason `LEGACY_UNVERIFIED` 추가 — 표·헤더·오늘 칸), Availability(영향 칸 status null, 24h는 전체 신뢰 시만), RED(`LEGACY_UNVERIFIED`/`ROLLUP_INCOMPLETE` 구분), Endpoint(겹치면 숫자 전체 마스킹, plan에 재요청 시작), plan/notes/JSONL `untrustedBeforeMs`.
- 테스트 대역 `CoverageReaderMocks`(기본 COMPLETE — mock 기본 null이 fail-open이 되지 않게).

## 검증
- 격리 PG 5435: `premium.apm.*` **2,455 전부 통과**. `ApmMetricCoverageReaderIT` 10(재작성), `ApmLegacyUpgradeCoverageIT` 2(전용 DB V69→최신 업그레이드 재현·KST/UTC 경계·hold 지속).
- 제약: 업그레이드 DB 안에서 bootstrap 회차는 직접 안 돌림(운영 쓰기 메서드로 상태 구성), 회차는 기존 IT에서.

## 의견 요청
1. SLO 부분 coverage(앞쪽) 시 예산 필드 null 선택 vs measuredFrom/To 부분값.
2. 뒤쪽만 잘린 경우 예산을 계속 내는 것(수신마다 dirty marker가 생겨 막으면 번다운이 항상 사라짐)이 거짓 정상값 위험이 없는지.
3. 업그레이드 후 일 스냅샷이 최대 7/30일 쌓이지 않음(남은 의문 1) — 배포 전 필수인지.
4. 가용성 최신 꼬리 칸 null(dirty marker) — 기존 성질이나 RT-3과 함께 손볼지.
5. 1m 원본 미판정으로 업그레이드 직후 짧은 창(번 레이트)은 도입 전 원본을 그대로 씀 — 위험도.

## 6. 코덱스 1차 **반려**(`_codex.md`) → 반영 (2026-10-11)
| # | 지적 | 반영 |
|---|---|---|
| 🔴1 | stage 60 marker 탐색 시작이 정렬 안 됨 | 탐색 시작 = `ceil(신뢰 시작, stage)`(자기·상류 marker 모두). `[00:30,02:00)`+00:35 → COMPLETE, 01:05 → incompleteFrom 01:00 IT |
| 🔴2 | 뒤쪽만 잘려도 예산 발표 | 앞·뒤 어느 쪽이든 잘리면 `errorBudgetTotal`·`budgetRemainingPct` null. BLOCKED 중간·PENDING 최신·대조군 테스트 |
| 🔴3 | 업그레이드 후 일 스냅샷 영구 누락 | 일간 창 신뢰 시 good/total/requests 저장, 롤링·1h·6h가 **도입 이전 미검증만** 걸렸으면 그 값만 null로 확정 저장, 처리 지연(dirty·blocked·bootstrap)은 기존대로 skip(재계산 대기). 35일 `backfillDays=7` 배치 모사 테스트 |
| 🔴4 | M1 원본 미판정 | reader에 RAW(1) stage — stage 5 도입 시각을 `cutoverBoundary`로 다음 1분 경계, 앞쪽 경계만. Calculator(번 4창 중 하나라도 걸리면 4창 모두 null→UNKNOWN→SLO_BURN 측정 불가)·SLO series·가용성·RED·Endpoint 적용. 실제 BurnEvaluator·Calculator 경계 6종 테스트, 실 DB 1분 경계 |
| 🔴5 | Endpoint 스냅샷 불일치 | `plan()`이 routeTable·coverage·워터마크를 한 `consistent()`에서, `download()`가 본문 직전 계획 재수립→헤더·_meta·본문 단일 계획, write의 별도 재판정 제거. 계획 후 marker 생성→ACK·값 변경 테스트 |
| 🟡 | 가용성 원천별 판정·`CoverageReaderMocks.strict`·mutation 6종(각 1~8 실패 확인)·prefix 사유 구분·업그레이드 DB 고유 이름 | 전부 반영 |

검증: 격리 PG 5435 `premium.apm.*` **2,470 전부 통과**. diff `scratchpad/rt3-be-r2.diff`.
