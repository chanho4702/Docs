# 검수 인계 — ZM-155 FE 메트릭 허용목록 확장(받기·규칙 목록·서비스 커스텀 지표 탭)

- 대상: 워크트리 `C:\worktrees\zm-155-fe`(브랜치 `ZM-155-fe`, base master `821344b`), **미커밋** — `git -C C:\worktrees\zm-155-fe status`/`diff`로 본다(신규 10 파일은 untracked)
- 정본: 계약 `_workspace/features/apm/metric-allowlist/contract_apm-metric-allowlist.md` **v1.1**(§7), BE DTO `C:\worktrees\zm-155-be`
- 보고: `_workspace/features/apm/metric-allowlist/zm-155_fe-metric-allowlist.md`

## 봐 줬으면 하는 곳(위험 순)

1. **수집기 설정 정규식 기본값** — `collectors/components/ApmTokenIssueDrawer.tsx`의 `customPrefilledRef` 효과 + `ApmProcessorOptionsFields.tsx`의 `forceRender: true`.
   - 효과 순서(초기화 효과 뒤에 선언)에 기대는 구조가 안전한지.
   - `forceRender`로 접힌 패널의 필드가 늘 등록되는데, 기존 "전부 기본값이면 processors 미전송"이 깨지지 않는지(테스트는 통과).
2. **권한 축** — 지시는 `useIsUserRoleAdmin`이었지만 `useApmPermissions().canEdit`(apm.edit)을 썼다. 근거: BE 규칙 EP가 `apm.edit`, `useApmPermissions` 정본 주석. 동의 여부.
3. **예산 +1 계산** `collectors/apmCustomMetricDisplay.ts` `apmCustomMetricBudgetAfterAdd` — 서버 산식 입력만 +1. `activeRules` 정의 가정(계약 F2).
4. **v1.1 문구** — WARN을 "접힘 경고(저장 계속)"로, `clear-warning` 확인 창이 "원인 그대로면 60분 뒤 다시 경고·자리는 7일 남음"을 말하는지(kr/en `apm.collectors.custom_metrics.confirm.clear_warning`).
5. **서비스 탭 그릴 값** `services/customMetricSeries.ts` — COUNTER=sum 막대, GAUGE·UPDOWN=avg 선, MIXED=count 막대, `count:0` 칸은 null.
6. 821344b 힌트 교체 — 수집 사유 표 reason 칸의 "어떻게 하나요?" 제거, `drop_reason_hint.NOT_ALLOWLISTED` 문구를 "관리자가 [받기]로 열 수 있다 — 관리자에게 요청"으로 바꿈(편집 권한 없는 경우의 툴팁).

## 검증(실행함)

`npx tsc --noEmit` · `npm run typecheck:contract` · `npx eslint <28 파일> --max-warnings 0` 통과, jest 대상 12 스위트 385/385 통과. 브라우저 실측 없음(BE :3000에 기능 없음).

## 의도적으로 하지 않은 것

- 새 메뉴·검색 항목·라우트 없음(수집기 화면 탭으로만) — 진입점 5곳 확인 결과는 보고서 §2.
- 이름 직접 입력 UI 없음(Q5), 차원 선택 UI 없음(Q1).
- 커밋 없음.

## 검수 결과(코덱스 v1) — `review_zm-155-fe-metric-allowlist_codex.md`, 판정 "수정 후 재검수" → 반영 완료(2026-10-13)

| # | 등급 | 내용 | 반영 |
|---|---|---|---|
| [x] R1 | 필수 | 값 종류가 "규칙 전체 첫 수신" 고정이라는 안내 오류 | kr/en `kind_hint`·`no_dims_detail`·`chart_help.col_custom_rules`·`page_guide.apm_collector_custom_metrics`를 "서비스마다 그 서비스의 첫 수신 때 고정, 같은 서비스의 다른 종류만 폐기, 서비스끼리 다르면 '서비스마다 다름'"으로 교체. 규칙 표에서 `MIXED`는 "서비스마다 다름" + 툴팁(`kind_mixed_hint`) |
| [x] R2 | 권장 | 규칙 DTO `valueKind:"MIXED"`·`seatServices` 누락 | `types/apm.ts` 규칙 타입 갱신(BE `ApmCustomMetricRuleDto` 12필드 전부 대조), 픽스처 갱신(MIXED·seatServices 4/2/0), 규칙 표에 "저장 중"(서비스 n곳) 열 |
| [x] R3 | 권장 | `__other__` 카드 값 축 노출 | `customMetricSeries.ts` `apmCustomMetricAxis` — count 카드는 `yAxis.show:false`·라벨·눈금·격자 숨김. 테스트가 축을 단언 |
| [x] R4 | 권장 | GAUGE·UPDOWN 음수가 `min:0`에 잘림 | 같은 함수 — avg 카드는 `min` 제거 + `scale:true`(데이터 기준), 카운터는 0 기준 유지. 음수 픽스처(-3)로 검증 |
| [x] R5 | 권장 | 쓰기 성공 시 5개 무효화 미검증 | `src/__tests__/apmCustomMetricHooks.test.tsx` 신규 — axios 경계만 mock, 진짜 `useDmoveQuery`·`QueryClient`로 create·enable·disable·clear-warning·delete 무효화 키 5개 단언 + 실패 envelope 시 무효화 없음 + 조회 payload 직접 |

추가로 계약 §8(v1.2) 반영: `seatServices`·`MIXED`(위), `budget.activeRules`=켜진 규칙(경고 포함) 문구, 조회는 등록 시각 **다음 온전한 칸**부터 → 등록 직후 한 칸 안의 창은 "미수신"이 아니라 "등록 전 구간"으로 판정(`stepSeconds` 반영)·각주 "최대 한 칸(1시간 해상도면 최대 1시간) 비어 보일 수 있음".

재검증: tsc · `typecheck:contract` · eslint(바꾼·새 29개) 통과, jest 대상 13 스위트 **395/395** 통과.

## 검수 결과(코덱스 v2) — `review_zm-155-fe-metric-allowlist-v2_codex.md`, 판정 "수정 후 재검수" → 반영 완료(2026-10-13)

- R1~R5: 코덱스 판정 **전부 닫힘**.
- F 회신: F1·F3·F5 반영 판정, F2·F4 부분 → 아래 N1·N2로 닫음.

| # | 등급 | 내용 | 반영 |
|---|---|---|---|
| [x] N1 | 필수 | 픽스처 `activeRules`가 ACTIVE+WARN 정의와 모순(켜진 규칙 2인데 1) | 픽스처 budget을 BE 산식대로 `activeRules 2`·`seriesPerServiceMax 2`·86,400행·59,270,400B·414,892,800B로 정정(파생 주석). 모달의 +1은 BE `budget(activeRules = 켜진 규칙)` 정의와 맞음을 재확인 — 받기는 새 ACTIVE 규칙 하나라 켜진 규칙 +1. 테스트: 픽스처의 켜진 규칙 수 = `activeRules` 단언 + 등록 후 3개 기준 기대값 |
| [x] N2 | 필수 | 늦은 `filterMetricsExtra`가 사용자가 비운 목록을 덮음 | `ApmTokenIssueDrawer` — 폼 `onValuesChange`로 추가 규칙 목록 dirty ref를 세우고, dirty면 채우지 않음(열림마다 초기화). `setFieldValue`·`resetFields`는 onValuesChange를 부르지 않아 우리 채우기는 dirty가 되지 않음. 테스트 2건(늦은 응답이 손대지 않은 목록은 채움 / 추가→삭제한 빈 목록은 덮지 않음 → processors 미전송). dirty 검사를 빼면 이 테스트가 실패함을 확인 |
| [x] N3 | 필수 | 첫 칸 경계를 `createdAt + step`으로 계산 | `customMetricSeries.ts` `apmCustomMetricFirstSlotMs = ceil(createdAt/step)×step`(BE `ceilTo`와 같음)을 빈 사유·각주 판정이 함께 씀. 테스트: 경계에 정확히 등록(그 칸부터 → 미수신) / 경계 사이 등록(다음 경계까지 등록 전, 1분 해상도는 미수신, 각주 경계 동일) |

재검증: tsc · `typecheck:contract` · eslint(바꾼·새 29개) 통과, jest 대상 13 스위트 **399/399**, 고아 워커 0.

- **칸 경계 BE 확인 결과(2026-10-13, 계약 §4 "칸 정렬(확정)")**: BE 칸은 epoch가 아니라 서버 기본 시간대 벽시계 기준(30·45분 오프셋 서버에서는 1시간 칸이 epoch와 어긋남) → N3의 epoch `ceil` 공식을 **제거**하고, 첫 데이터 칸을 응답 `points[].ts`에서 `ts >= ruleCreatedAtMs`인 첫 점으로 판정하도록 바꿨다(`customMetricSeries.ts` `apmCustomMetricFirstSlotMs(row)` — 빈 사유·각주 공통). 테스트는 서버가 줄 ts 배열로 "칸 시작에 정확히 등록(그 칸부터 → 미수신)"·"칸 사이 등록(등록 칸은 잘리고 다음 칸부터, 그 전에 창이 끝나면 등록 전 구간)"·"등록이 창보다 앞인데 점 없음(비정상 → 미수신)"을 표현. 재검증 tsc·`typecheck:contract`·eslint 통과, jest 대상 13 스위트 **400/400**.

## 검수 결과(코덱스 v3) — 2026-10-13

- 대상: v2 잔여 N1~N3. 원문 `review_zm-155-fe-metric-allowlist-v3_codex.md`. 전부 닫힘, 새 결함 0 → **승인**.
- 단, 3차 시작 뒤 칸 경계 판정을 `points[].ts` 기준으로 바꾼 변경(BE 칸 정렬이 서버 시간대 기준이라)은 3차 범위 밖 → v4 좁은 확인 별도.

## 검수 결과(코덱스 v4) — `review_zm-155-fe-metric-allowlist-v4_codex.md`, 판정 "수정 후 재검수" → 반영 완료(2026-10-13)

- epoch `ceil` 잔재: 코덱스 판정 이상 없음.

| # | 등급 | 내용 | 반영 |
|---|---|---|---|
| [x] M1 | 필수 | 등록이 창보다 앞이지만 승격(5분·1시간)된 같은 생성 칸 안에 창 전체가 들어가면 "미수신"으로 오판 | `customMetricSeries.ts` `apmCustomMetricEmptyReason` — 우선순위를 보존 밖 → 등록 전/직후 → 미수신으로 정리. 등록 이후 칸(ts ≥ 등록 시각)이 응답에 없을 때: **점이 있으면**(서버는 빈 칸도 점으로 준다) 등록 시각과 창의 앞뒤와 무관하게 "등록 직후 구간", **점이 아예 없으면** 응답 `step`(승격 후 해상도)으로만 보정(창 끝 − 등록 시각 < step이면 등록 직후, 아니면 미수신, step 모르면 미수신). 경계를 직접 계산하지 않는다(§4). 탭은 `data.step`을 넘긴다. 테스트: 1분 등록·1시간 승격·창이 등록 칸 안 → 등록 직후 / 점 없는 응답 step 보정 3케이스 / 보존 밖 우선 |

재검증: tsc · `typecheck:contract` · eslint(바꾼·새 29개) 통과, jest 대상 13 스위트 **402/402**, 고아 워커 0.

## 검수 결과(코덱스 v4·v5) — 2026-10-13

- v4(칸 경계 `points[].ts` 기준 변경만): 필수 M1(승격 해상도 등록 칸 안에 창 전체가 든 경우 미수신 오판) → 반영. 원문 `…-v4_codex.md`.
- v5: M1 닫힘(보존 밖 → 등록 전/직후 → 미수신 순서), 새 결함 0. 원문 `…-v5_codex.md`. **판정: 승인.** 커밋은 사용자 승인 대기. 브라우저 실측 미실시.
