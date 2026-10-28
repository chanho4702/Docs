# ZM-155 FE 보고 — 메트릭 허용목록 확장 수단 S3(받기·규칙 목록) + S4(서비스 상세 커스텀 지표 탭)

- 작성 2026-10-13 · 워크트리 `C:\worktrees\zm-155-fe` (브랜치 `ZM-155-fe`, master `821344b` 기준) · **미커밋**
- 계약 [`./contract_apm-metric-allowlist.md`](contract_apm-metric-allowlist.md) **v1.1(§7 변경 표)** 기준 — 작업 중 계약이 v1 → v1.1로 바뀌어 같은 작업 안에서 다시 맞췄다
- 설계 [`./devdesign_apm-metric-allowlist-extension.md`](devdesign_apm-metric-allowlist-extension.md) §5.3·§4.6·§8(Q1 이름만, Q5 직접 입력 없음)
- 검수 인계 [`./review_zm-155-fe-metric-allowlist.md`](review_zm-155-fe-metric-allowlist.md)
- 🔴 BE(:3000)에 이 기능이 없어 **브라우저 실측은 하지 않았다**. 검증은 tsc·계약 게이트·eslint·jest까지.

---

## 1. 범위 상태

| # | 항목 | 상태 |
|---|---|---|
| 1 | 수집 사유 표에서 받기(분기·확인 모달·오류 코드별 문구·비권한 안내, `821344b` 문구 교체) | ✅ |
| 2 | 규칙 목록 화면(수집기 > 커스텀 지표 규칙 탭) — 켜기/끄기·경고 해제·삭제(확인 창), n/20·예산·상한 요약 | ✅ |
| 3 | 서비스 상세 커스텀 지표 탭(카드·보존/해상도 배지·`__other__` 건수만·빈 상태) | ✅ |
| 4 | 폐기 사유 라벨(v1.1 기준 2종) + 기존 테스트 갱신, 설치 가이드 재생성 안내 | ✅ |
| 5 | 계약 타입·픽스처(`typecheck:contract`), 화면·훅 테스트 | ✅ |

### 계약 v1.1(§7) 반영

| # | 항목 | 상태 |
|---|---|---|
| 1 | 상태 `ACTIVE·WARN·DISABLED`, 사유 `CUSTOM_RULE_SUSPENDED` 삭제(라벨 2종) | ✅ |
| 2 | `clear-warning` EP, `warnedAtMs`·`warnReason`·`valueKind`, WARN=저장 계속 문구 | ✅ |
| 3 | `limits` 새 필드(`warnFoldPct`·`warnSustainMinutes`·`maxNameLength 127`·`seatRetentionDays`·`failClosedSeconds`) — 규칙 탭 상한 줄·확인 창 문구 | ✅ |
| 4 | `APM_CUSTOM_METRIC_NAME_TRUNCATED`·`blockedReason: NAME_TRUNCATED`·행 `metricNameTruncated`('잘림' 표시 + 받기 비활성 + 이유 툴팁) | ✅ |
| 5 | 조회 `valueKind: UPDOWN`(평균 선), 등록 전 구간 잘림 → 창이 가로지르면 "등록 전 구간은 비어 있음" 각주, 창 전체면 "규칙 등록 전 구간" | ✅ |

## 2. 화면 배치와 진입점(5곳 확인)

| 진입점 | 결과 |
|---|---|
| 사이드바(`layouts/app/SideNav`) | 수집기 항목 없음(10-01 관리 콘솔로 이동) — 변경 없음 |
| 모바일(`MobileSideNav`) | 같음 — 변경 없음 |
| ⚙ 관리 콘솔(`constants/adminConsole.tsx`) | `apm-collectors`(edit 축) 그대로 — 새 메뉴 **추가 안 함** |
| 전역 검색(`navSearchEntries.ts`) | `apm-collectors` 그대로 — 새 항목 **추가 안 함**(탭 단위 검색 항목은 RUM 설정 제거 때와 같은 판단으로 두지 않음) |
| 라우트(`routes.tsx`) | `PATH_SETTING.apmCollectors` 그대로 — 새 라우트 없음 |

- 규칙 목록은 **수집기 화면의 5번째 탭** `?tab=custom_metrics`(계약 FE 요청 2 "수집기 화면 하위 탭"). 진입: 탭 · 폐기 표 "규칙 있음" 링크 · 설치 가이드 배너 · 서비스 상세 빈 상태 링크.
- 서비스 상세 탭 `?tab=custom_metrics`는 런타임 다음(`APM_SERVICE_TAB_ORDER`·`READY`), 도움말 `apm_service_custom_metrics`. 수집기 탭 도움말 `apm_collector_custom_metrics`(page-guide `tabKeys`).
- 권한: 받기·규칙은 **`apm.edit`(`useApmPermissions().canEdit`)**. 🔴 지시서의 `useIsUserRoleAdmin`을 쓰지 않았다 — BE가 규칙 EP를 `apm.edit`으로 막고(관리자는 무조건 통과), `useApmPermissions` 정본 주석이 "역할 축으로 가르면 위임 계정이 막힌다"고 금지한다. 수집기 화면 자체가 `apm.edit` 게이트라 수집 사유 표 안의 "관리자에게 요청" 분기는 방어용이다. 서비스 상세 탭은 `apm.view`, 받기 링크만 `canEdit`.

## 3. 바꾼 파일(30개 — 수정 20, 신규 10)

**신규(소스 7)**
- `src/hooks/useApmCustomMetrics.ts` — 규칙 조회·등록·변경·삭제·시계열 훅. 쓰기 성공 시 규칙·폐기 통계·설정 기본값·설치 가이드·시계열 무효화
- `src/pages/application-monitoring/collectors/apmCustomMetricDisplay.ts` — 받기 칸 판정·막힘/오류 문구 키·상태 색조·예산 +1 계산
- `.../collectors/components/ApmCustomMetricRegisterModal.tsx` — 받기 확인 모달
- `.../collectors/components/ApmDropCustomRuleCell.tsx` — 폐기 표 "조치" 칸
- `.../collectors/tabs/ApmCollectorCustomMetricsTab.tsx` — 규칙 탭
- `.../services/customMetricSeries.ts` — valueKind → 그릴 값·빈 칸 null·빈 이유
- `.../services/detail/tabs/ApmServiceCustomMetricsTab.tsx` — 서비스 상세 탭

**신규(테스트 3)** `src/__tests__/fixtures/apmCustomMetricContractSample.ts` · `apmCustomMetricDisplay.test.ts` · `ApmServiceCustomMetricsTab.test.tsx`

**수정(소스 14)** `types/apm.ts`(계약 타입·사유 2종·`customRule`·`metricNameTruncated`·`filterMetricsExtra`·`customMetrics`) · `services/apm.api.ts`(EP 5종) · `constants/queryKey.ts` · `constants/apm.ts`(탭 상수 2) · `constants/page-guide.ts` · `collectors/ApmCollectorsPage.tsx` · `collectors/apmCollectorDisplay.ts`(힌트 주석) · `collectors/tabs/ApmCollectorStatusTab.tsx`(조치 칸·잘림 표시·모달, 821344b 힌트 제거) · `collectors/tabs/ApmCollectorInstallTab.tsx`(재생성 배너) · `collectors/components/ApmTokenIssueDrawer.tsx`(정규식 기본값 채움) · `collectors/components/ApmProcessorOptionsFields.tsx`(안내 줄·`forceRender`) · `services/ApmServiceDetailPage.tsx` · `locales/kr.json`·`en.json`(줄 단위 삽입·교체만)

**수정(테스트 6)** `apmCollectorDisplay.test.ts` · `ApmCollectorsPage.test.tsx` · `ApmCollectorTokensTab.test.tsx` · `apmHelpContent.test.ts`(위젯 134→137, 화면 도움말 31→33) · `apmRoutes.test.tsx`(열린 탭 11→12) · `ApmServiceDetailPage.test.tsx`(11→12)

## 4. 구현 중 잡은 결함

- 🔴 **수집기 정규식 기본값이 실리지 않던 구조** — 프로세서 패널(Collapse)을 펼치지 않으면 Form.List가 등록되지 않아 `onFinish` 값에서 빠진다. 또 필드 컴포넌트에서 채우면 Drawer의 열림 초기화(`resetFields`)가 같은 커밋에서 지웠다. → 패널 `forceRender` + 채우기를 Drawer의 초기화 효과 **뒤**로 옮김. 신규 테스트("패널을 펼치지 않아도 … 실린다")가 두 단계 모두 잡았다. 전부 기본값이면 `processors`를 싣지 않는 기존 규칙은 그대로(테스트로 확인).

## 5. 계약 차이·BE 요청(계약서 `🔄 FE 요청사항`에 F1~F5로 기록)

- F1 §3 머리말 "새 사유 3종" ↔ 표 2행 — FE는 2종.
- F2 예산 +1이 `activeRules`(WARN 포함·DISABLED 제외) 가정.
- F3 설치 가이드 안내가 FE 배너 + 서버 notice 두 곳(의도).
- F4 `filterMetricsExtra` 채움 규칙(열림마다 1회·손댄 행 보존).
- F5 규칙별 접힘 비율·자리 수·최근 7일 행 수는 응답에 없어 미표시(BE 미해결과 동일).

## 6. 테스트 결과(실제 실행)

| 검사 | 결과 |
|---|---|
| `npx tsc --noEmit` | 통과 |
| `npm run typecheck:contract` | 통과 |
| `npx eslint <바꾼·새 .ts/.tsx 28개> --max-warnings 0` | 통과 |
| `npx jest` 대상 12 스위트(-w 2) — ApmCollectorsPage·ApmCollectorTokensTab·ApmServiceCustomMetricsTab·apmCustomMetricDisplay·apmCollectorDisplay·apmHelpContent·apmRoutes·ApmServiceDetailPage·AdminConsoleNav·apmCollectorHooks·ApmServiceRuntimeTab·PageHeaderDescription | **385/385 통과** |
| 고아 jest 워커 | 워크트리 경로 node 프로세스 0 |

## 7. 미해결

- 브라우저 실측 없음(BE 미기동). BE 병합·:3000 반영 후 받기 → 규칙 탭 → 서비스 탭 → 발급 yaml에 정규식 포함까지 런타임 확인 필요.
- 커밋 없음. 전체 jest 미실행(지시대로 대상 스위트만).
- `CUSTOM_SERIES_OVERFLOW`의 서비스별 분해 필드가 없어 수집 사유 표의 그 행에서 어느 서비스인지 알 수 없다(BE 1차 범위 밖).
- 런타임 탭 `not_ingestible` 문구의 "제품 팀에 전달"은 그대로 뒀다 — 런타임 패밀리 이름은 v1.1에서도 `RESERVED`로 받을 수 없어 여전히 맞는 안내다.

## 8. 코덱스 반영(FE 검수 v1 R1~R5) + 계약 v1.2(§8)

| 항목 | 상태 |
|---|---|
| R1(필수) 값 종류 안내 — 서비스×이름별 고정, 서비스끼리 다르면 "서비스마다 다름" + 툴팁 | ✅ |
| R2 규칙 DTO `MIXED`·`seatServices` 타입·픽스처·"저장 중" 열 | ✅ |
| R3 `__other__` 카드 값 축 숨김 | ✅ |
| R4 게이지·UpDown 음수 축(min 해제·scale) | ✅ |
| R5 훅 무효화 테스트(`apmCustomMetricHooks.test.tsx`) | ✅ |
| §8-1 `seatServices` 열 | ✅ |
| §8-2 `valueKind` 자리 원장 요약(MIXED), 조회 `valueKind`는 서비스 시계열 값 | ✅ |
| §8-3 `activeRules`=ACTIVE+WARN — 예산 문구 "켜진 규칙(경고 포함)" | ✅ |
| §8-4 다음 온전한 칸부터 — 등록 직후 한 칸 안은 "등록 전 구간", 각주 문구 | ✅ |
| §8-5 권한 축(관리 6개 apm.edit·조회 apm.view) — FE와 같음, 변경 없음 | ✅ |
| §8-6 규칙별 7일 행 수 — 화면에 없음(표기 없음) | ✅ |

- 변경 파일 31개(신규 `apmCustomMetricHooks.test.tsx` 추가). BE DTO(규칙 12필드·limits 11·budget 9·collector 3·series Metric 6·Point 6·drops Row `customRule`·`metricNameTruncated`) 전 필드 대조 완료.
- 재검증: tsc · `typecheck:contract` · eslint 통과, jest 대상 13 스위트 395/395, 고아 워커 0.

## 9. 코덱스 v2 반영(N1~N3)

| 항목 | 상태 |
|---|---|
| N1 픽스처 예산 = 켜진 규칙(ACTIVE+WARN) 2 기준으로 정정, 모달 +1이 BE 정의와 맞음을 재확인·테스트 | ✅ |
| N2 발급 창 — 사용자가 추가 규칙 목록을 손댔으면(dirty) 늦은 커스텀 정규식이 덮지 않음, 테스트 2건(회귀 시 실패 확인) | ✅ |
| N3 첫 칸 경계 `ceil(등록 시각, step)` — 빈 사유·각주 공통, 경계 정확/사이 테스트 | ✅ |

재검증: tsc · `typecheck:contract` · eslint 통과, jest 대상 13 스위트 399/399.

### 9-1. 칸 경계 — BE 확인 결과 반영

- BE 칸 정렬은 서버 기본 시간대 기준(계약 §4) → FE의 epoch `ceil` 계산(N3 1차 반영분) 제거. 첫 데이터 칸 = 응답 `points[].ts` 중 `ts >= ruleCreatedAtMs`인 첫 점. 등록 이후 칸이 응답에 없고 등록 시각이 창 안(또는 뒤)이면 "규칙 등록 전 구간"(등록 직후 최대 한 칸 포함).
- 재검증: tsc · `typecheck:contract` · eslint 통과, jest 대상 13 스위트 400/400. 코덱스 FE 3차 결과 파일은 아직 없음.

## 10. 코덱스 v4 반영(M1)

| 항목 | 상태 |
|---|---|
| M1 승격된 짧은 과거 창(점이 모두 등록 시각이 든 칸 안)을 "미수신"이 아니라 "규칙 등록 전 구간(등록 직후)"으로 판정. 우선순위 보존 밖 → 등록 직후 → 미수신. 점 없는 응답만 응답 `step`으로 보정 | ✅ |

재검증: tsc · `typecheck:contract` · eslint 통과, jest 대상 13 스위트 402/402.
