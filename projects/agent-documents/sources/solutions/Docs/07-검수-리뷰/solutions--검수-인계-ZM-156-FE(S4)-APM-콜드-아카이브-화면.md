# 검수 인계 — ZM-156 FE(S4) APM 콜드 아카이브 화면

- 대상: 워크트리 **`C:\worktrees\zm-156-fe`** · 브랜치 `ZM-156-fe`(master `c4eaf55` 기준) · **미커밋**(`git status`로 범위 확인 — 수정 16 · 신규 17)
- 짝: BE `C:\worktrees\zm-156-be`(미커밋) · 인계 [`review_zm-156-be-cold-archive.md`](%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-APM-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-BE-%28ZM-156-S1-S2-S3-S5-%EC%98%B5%ED%8A%B8%EC%9D%B8%29.md)
- 정본: 계약 [`../contract_apm-cold-archive.md`](../06-API-%EA%B3%84%EC%95%BD/%EA%B3%84%EC%95%BD-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B9%99-%EA%B3%B5%ED%86%B5-APM-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-%28ZM-156%29.md)(v1.1 §9 + `🔄 FE 요청사항` 4건) · 구현 보고 [`../reports/zm-156_fe-cold-archive.md`](../09-%EB%B3%B4%EA%B3%A0%EC%84%9C/ZM-156-FE-%EA%B5%AC%ED%98%84-%EB%B3%B4%EA%B3%A0-APM-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-S4-%28%EA%B3%B5%ED%86%B5-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-%ED%99%94%EB%A9%B4-APM-%EC%86%8C%EC%8A%A4-%EC%83%81%ED%83%9C-%EB%B3%B4%EB%A5%98-%EB%B0%B0%EB%84%88%29.md)

## 1. 범위

관리 콘솔 › 운영 › **데이터 아카이브**(`/setting/data-archive`, 관리자) — 목록·상세·삭제(사유)·무결성 검사·공통 설정(경로·연결 테스트) / APM 대상 탭(데이터셋·마스킹·보류 기한·실패 시 동작·상태 카드·보류 목록·지금 실행) / APM 메뉴 보류 배너 / 스케줄러 `apm_archive` 이름 / 알람 `ARCHIVE_HOLD`(서버 판정) / 계약 v1.1 6항목.

## 2. 의도 — 판단을 내린 곳

1. **서버 `warnings[]`를 그대로 띄우지 않는다.** 같은 조건을 응답 필드로 재판정해 i18n 배너로 그린다(문장에 `설계 §6.2`·`R3 규모`·설정 키 이름이 섞여 고객 문구 규칙 위반, 영어 불가). 예외는 손상 설정 경고 하나(판정 필드가 없어 문장 머리 매칭 + 원문을 설명으로).
2. **보류 배너는 비관리자에게 요청조차 하지 않는다**(`enabled: isAdmin && 라이선스 확정 && APM`). 상태 EP는 관리자 전용이라 부르면 body 403이 전역 "권한 없음" 안내로 샌다.
3. **위험한 방향의 변경만 확인한다** — 옵트인 데이터셋 체크, `onFailure → continue`, 마스킹 끄기. 되돌리는 쪽은 묻지 않는다. 켜는 스위치는 허용 루트·경로·대상이 없으면 잠그고 이유를 먼저 말한다(끄는 길은 늘 열림).
4. **삭제·검사만 timeout 3분**(락 대기, 계약 v1.1 §9 #4) — 공통 인스턴스 기본값은 그대로.
5. **`ARCHIVE_HOLD`는 만들 수 없는 종류**(시드 1건) — 수정은 `{enabled}`만 보내 임계·창 저장값을 건드리지 않는다.
6. 공통 원장 화면은 **라이선스 밖**(FeatureGate 없음), APM 탭만 화면 안에서 라이선스로 가린다.

## 3. 중점 확인 요청

| # | 볼 곳 | 질문 |
|---|---|---|
| 1 | `pages/setting/data-archive/archiveDisplay.ts` `apmArchiveWarnings` | 서버 `warnings()`(BE `ApmArchiveAdminService`)와 **같은 조건**인가 — 빠진 경고가 있나(특히 보류 배너는 `enabled && count>0`, 스케줄러 꺼짐은 `enabled && !archiveJob.enabled`) |
| 2 | `ArchiveFilesTab.tsx` 선택 | 트리 표 `checkStrictly:false` + 비활성 자식(RUNNING·DELETED…)일 때 부모 체크가 비활성 자식을 끌어들이지 않는가(`selectedArchiveIds` + 서버 `skipped`가 이중 방어) |
| 3 | `ArchiveFilesTab.tsx` `handleDownload` | 순차 다운로드 중 취소·탭 이동·계정 전환이 요청을 끊고 파일을 버리는가(ZM-154 규칙) |
| 4 | `ApmArchiveTab.tsx` 편집본 동기화 | 편집 중 폴링으로 설정이 다시 와도 덮지 않는가(`dirtyRef`) · 저장 성공 시 서버 정규화 값으로 맞추는가 · 손상 시 저장 버튼 활성 |
| 5 | `ApmArchiveHoldBanner.tsx` + `DashboardLayout contentTop` | 배너가 APM 화면 전환마다 깜빡이지 않는가(같은 쿼리 키 캐시) · 실패 시 숨김이 맞는가 |
| 6 | `ApmAlertRuleDrawer.tsx` | 서버 판정 종류에서 `Show`로 임계 입력을 언마운트해 검증이 빠지는 것이 의도대로인가 |
| 7 | 시각 | 스케줄러 DTO의 리터럴 `'Z'`(계약서 FE 요청 #3) — 화면은 설정 › 스케줄러와 같은 해석 |

## 4. 검증 현황

- `npx tsc --noEmit` 통과 · `npm run typecheck:contract` 통과 · `npx eslint <바꾼 파일> --max-warnings 0` 통과
- `npx jest`(대상 10 스위트) **222 중 219 통과** — 실패 3건은 `apmHelpContent.test.ts`의 **master 기존 실패**(같은 커밋의 깨끗한 워크트리에서 동일 3건 재현)
- **브라우저 실측 미실시**(BE가 :3000에 없음) — BE 병합·재기동 후 보고서 §6 #1 목록으로 확인 필요
- 커밋 없음

## 검수 결과(코덱스 v1) — 반영 현황

정본: [`review_zm-156-fe-cold-archive_codex.md`](%EA%B2%80%EC%88%98-ZM-156-FE-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-%EC%BD%94%EB%8D%B1%EC%8A%A4.md)(판정 "수정 후 재검수"). 계약 v1.2(§9.1) 변경과 겹치는 항목은 그 작업으로 닫았다.

| # | 등급 | 상태 | 반영 |
|---|---|---|---|
| R1 | 필수 | [x] | `TArchiveDeleteResult.busy[]` + 결과 창 "진행 중이라 건너뜀 n건"(rejected와 별도) · 단건 `ARCHIVE_BUSY`(409) → `data_archive.error.busy` + **다시 시도** 확인 창(삭제·검사·APM 설정 저장) — §9.1 #4·#5 |
| R2 | 권장 | [x] 이상 없음 | — |
| R3 | 권장 | [x] 이상 없음 | — |
| R4 | 필수 | [x] | `warnings[]`·`datasets[].warning` = `{code,message,params}` 타입, 코드 8종 → i18n(`archiveWarningBanner`), 모르는 코드는 `message` 폴백 · 손상 판정 = `settingsState === "INVALID"`(상세는 `SETTINGS_INVALID.params.detail`) · **`startsWith` 문장 판별·`APM_ARCHIVE_CORRUPTION_PREFIX` 삭제** — §9.1 #1·#2 |
| R5 | 필수 | [x] | 전용 `TApmArchiveJobInfo`(epoch ms), `TSchedulerSetting` 재사용 중단, `minutesUntil(ms)`·`dayjs(number)` — §9.1 #3 |
| R6 | 권장 | [x] | `ApmArchiveTab` 조회 `enabled = isAdmin && !licenseLoading && allowsFeature("APM")` + 페이지가 라이선스 읽는 중에는 APM 탭 본문 대신 스피너(미마운트) |
| R7 | 권장 | [x] 이상 없음 | — |
| R8 | 권장 | [x] 이상 없음 | — |
| R9 | 필수 | [x] | 서버 판정 규칙(`ARCHIVE_HOLD`) 행에서 **삭제·재동기화 버튼 제거**, 켜기/끄기 토글·수정 폼(`{enabled}`만 전송)만 · BE `APM_ALERT_RULE_PROTECTED`(400, §9.1 #9) → 공통 오류 해석에 `apm.alerts.form.protected` 매핑 + 상수 `APM_ALERT_RULE_PROTECTED` + 픽스처 envelope. `STUCK_REQUEST`는 대상 아님(기존대로) |
| R10 | 권장 | [x] 이상 없음 | — |
| R11 | 필수 | [x] | `lastHoldReason` 타입·픽스처, 보류 표 사유 열: `LOCK_TIMEOUT`(판정 미룸·지우지 않음) / `NOT_ARCHIVED`(보관본 없음) + 실패 기록은 아래 덧붙임. "아직 시도 전" 문구(`hold_not_tried`) 삭제 — §9.1 #6 |
| R12 | 권장 | [x] | BE `ArchiveStatus.REASON_*` 대조 — `ABANDONED`·`DEFERRED` 매핑·kr/en 추가 |
| R13 | 권장 | [x] 이상 없음 | — |
| R14 | 권장 | [x] | 픽스처를 BE 워크트리 DTO(`ApmArchiveStatusDto`·`ApmArchiveSettingsDto`·`ApmArchiveWarning`·`ArchiveDeleteDto.Result`)와 대조해 `busy[]`·`lastHoldReason`·`settingsState`·구조화 경고·`JobInfo` epoch 반영 · 단언: 모르는 경고 코드에도 화면이 선다 · 시간 표시(epoch) · busy 안내 |
| R15 | 권장 | [x] | 같은 날 OK+RUNNING 부모 선택 → 삭제 mutation ids `[41, 42]`(RUNNING 43 제외) · `ARCHIVE_HOLD` 삭제·재동기화 버튼 부재(드리프트가 있어도) |

### 재검증(v1.2·코덱스 반영 후, 2026-10-01)

- `npx tsc --noEmit` 통과 · `npm run typecheck:contract` 통과 · 바꾼 파일 `eslint --max-warnings 0` 통과
- `npx jest` 대상 10 스위트 **231건 중 228 통과** — 실패 3건은 `apmHelpContent.test.ts`의 master 기존 실패(그대로). 첫 실행에서 새 테스트 2건이 테스트 자체 결함(데이터셋 순서 가정·한 테스트 안 이중 렌더)으로 실패 → 고쳐 아카이브 2 스위트 재실행 72/72 통과
- 고아 jest 워커 0 · 변경 파일 34(수정 17 · 신규 17) · 커밋 없음 · 브라우저 실측은 여전히 미실시

### 추가 — 경고 코드 `LOCK_TIMEOUT`(계약 v3, 2026-10-01)

- 상태 EP `warnings[]`의 `LOCK_TIMEOUT`(params `lock`·`table`·`day`·`at` ms) → `data_archive.warning.lock_timeout` 배너(테이블·날짜·시각). (테이블, 날짜)마다 한 건씩, 모르는 코드 폴백은 그대로. 픽스처 `APM_ARCHIVE_LOCK_TIMEOUT_WARNING`.
- tsc·typecheck:contract·eslint 통과, 아카이브 2 스위트 73/73 통과. 코덱스 FE 2차 재검수 결과 파일은 아직 없음.

## 검수 결과(코덱스 v2)

정본: [`review_zm-156-fe-cold-archive-v2_codex.md`](%EA%B2%80%EC%88%98-ZM-156-FE-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-v2-%EC%BD%94%EB%8D%B1%EC%8A%A4.md). R1·R4·R5·R6·R11·R14·R15는 v2에서 닫힘.

| # | 등급 | 상태 | 반영 |
|---|---|---|---|
| N1 | 필수 | [x] | `updateApmSettings`에 `timeout: ARCHIVE_LOCK_WAIT_TIMEOUT_MS`(3분) — 삭제·검사와 같은 축. 호출 인자 단언(`dataArchiveDisplay.test.ts`) |
| R9 | 필수(부분→완료) | [x] | 서버 판정 규칙 행의 **수정 버튼 제거** — 행 스위치(켜기/끄기)가 유일한 조작. 삭제·재동기화는 v1에서 이미 제거. 테스트: 수정·삭제·재동기화 버튼 부재, 스위치 → `{enabled:false}` |
| R12 | 권장(부분→완료) | [x] | `ARCHIVE_FAIL_REASONS`(BE `REASON_*` 6종) 정본 + `TArchiveFailReason`, `TArchiveFile.failReason`·`HoldItem.lastFailureReason`을 그 타입으로 좁힘, 표시 매핑도 같은 배열. `typecheck:contract` 통과 |
| N2 | 권장 | [x] | 픽스처 주석 "배치는 전용 `JobInfo`, 시각은 epoch ms"로 정정 |

검증: tsc·typecheck:contract·eslint 통과 · 대상 10 스위트 232 중 229 통과(실패 3 = `apmHelpContent` master 기존 실패) · 고아 워커 0 · 커밋 없음.

## 검수 결과(코덱스 v3) — 2026-10-01

- 대상: v2 잔여 N1·R9·R12·N2 + `LOCK_TIMEOUT` 경고. 원문 `review_zm-156-fe-cold-archive-v3_codex.md`.
- 전부 닫힘(설정 저장 timeout·ARCHIVE_HOLD 토글 전용·실패 사유 6종 타입·픽스처 주석·LOCK_TIMEOUT 매핑). 다른 알람 규칙 회귀 없음.
- 권장 M1(`constants/archive.ts` timeout 상수 주석이 "두 호출"로 낡음) — [x] 주석 정정(오케스트레이터 직접).
- **판정: 승인.** 커밋은 사용자 승인 대기. 브라우저 실측 미실시(BE :3000에 156 코드 없음).
