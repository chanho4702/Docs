# ZM-156 FE 구현 보고 — APM 콜드 아카이브 S4 (공통 아카이브 화면 + APM 소스·상태·보류 배너)

- 작성 2026-10-01 · Claude(fe-engineer) · 상태: **구현·정적 검증 완료, 미커밋**(사용자 승인 대기) · 브라우저 실측 **미실시**(BE가 :3000에 없다 — 워크트리 `C:\worktrees\zm-156-be` 미커밋)
- 워크트리 **`C:\worktrees\zm-156-fe`** · 브랜치 `ZM-156-fe`(master `c4eaf55` 기준) · 본체 `C:\solutions\moveseyee_fe`(:5173) 무수정
- 정본: 계약 [`../contract_apm-cold-archive.md`](../06-API-%EA%B3%84%EC%95%BD/%EA%B3%84%EC%95%BD-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B9%99-%EA%B3%B5%ED%86%B5-APM-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-%28ZM-156%29.md)(v1.1 §9 포함) · 설계 [`../designs/devdesign_apm-cold-archive.md`](../02-%EC%84%A4%EA%B3%84/%EC%84%A4%EA%B3%84-APM-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-%EB%B3%B4%EC%A1%B4-%EB%A7%8C%EB%A3%8C-%EC%A0%84%EC%97%90-%ED%8C%8C%EC%9D%BC%EB%A1%9C-%EB%B3%B4%EA%B4%80-%28ZM-156%29.md) §9·§10 · 기반 [`../designs/devdesign_data-archiving.md`](../02-%EC%84%A4%EA%B3%84/%EC%84%A4%EA%B3%84-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B9%99-%28%EA%B0%90%EC%82%AC-%EA%B7%9C%EC%A0%9C-%EB%8C%80%EB%B9%84-%EC%9E%A5%EA%B8%B0-%EB%B3%B4%EA%B4%80%29.md) §7 · BE 보고 [`zm-156_be-cold-archive.md`](ZM-156-BE-%EA%B5%AC%ED%98%84-%EB%B3%B4%EA%B3%A0-APM-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-%28S1-S2-S3-S5-%EC%98%B5%ED%8A%B8%EC%9D%B8%29.md)
- 검수 인계: [`../reviews/review_zm-156-fe-cold-archive.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9D%B8%EA%B3%84-ZM-156-FE%28S4%29-APM-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-%ED%99%94%EB%A9%B4.md)

---

## 1. 한눈에

| # | 범위 | 상태 | 요지 |
|---|---|---|---|
| 1 | 공통 아카이브 화면(관리자) | ✅ | 관리 콘솔 › 운영 › **데이터 아카이브**(`/setting/data-archive`). 탭 ① 아카이브 목록 ② APM 대상(APM 라이선스만) ③ 경로·공통 설정, `?tab=` |
| 2 | APM 소스 탭 | ✅ | 데이터셋 체크(기본 3종, 1m·스팬 옵트인 + 체크 순간 용량 경고 확인) · 마스킹(기본 켬, 끌 때 확인) · `maxHoldDays`(0=무기한 안내) · 실패 시 동작(continue로 바꿀 때 확인) · 지난 데이터 · 기능 스위치(켤 수 없는 이유를 먼저 말함) · 상태 카드 · 보류 목록 · 지금 실행(확인 모달, 10초 폴링 최대 5분) |
| 3 | 보류 배너 | ✅ | APM 라우트 루트(`DashboardLayout` 새 `contentTop` 슬롯)에 `ApmArchiveHoldBanner`. 관리자·APM 라이선스 확정일 때만 **요청 자체를** 한다(비관리자 403이 전역 안내로 새지 않음). 1분 폴링·포커스 재조회 끔·실패 시 조용히 숨김. 링크 `/setting/data-archive?tab=apm` |
| 4 | 스케줄러·알람 | ✅ | `SCHEDULER_JOB_CATALOG`에 `apm_archive` · `ARCHIVE_HOLD` 종류(라벨·단위 count·전역 전용·창 없음·**서버 판정**: 목록 임계·창 칸 "서버 판정", 수정 폼은 임계·창·미리보기 숨김 + `{enabled}`만 전송, 만들기 선택지에는 없음) |
| 5 | 로케일 | ✅ | kr/en 앵커 줄 삽입(재직렬화 없음 — 스크립트가 줄 단위로 끼우고 `JSON.parse`로 검증). 고객 문구 §·HTML·검수번호 없음(테스트로 고정). 도움말 `page_guide.setting_data_archive`(+ `_apm`·`_settings` 탭별) |
| 6 | 계약 타입·픽스처·테스트 | ✅ | `types/archive.ts` · `fixtures/archiveContractSample.ts`(`typecheck:contract` 통과) · 새 스위트 2개 + 기존 2개 보강 |
| v1.1-1 | `RUNNING` 상태 | ✅ | "진행 중" 배지(processing)+툴팁, 체크·다운로드·검사·삭제 잠금 |
| v1.1-2 | 삭제 `rejected[]` | ✅ | 일부만 처리되면 결과 창(파일 삭제 실패·경로 거절·대상 아님 건수와 이유). 전부 성공이면 토스트 |
| v1.1-3 | `ARCHIVE_FILE_REJECTED` | ✅ | 다운로드·검사 실패 전용 문구("경로가 허용 범위 밖 — 관리자가 경로·설정 확인"), `FILE_MISSING`과 분리 |
| v1.1-4 | 락 대기 timeout | ✅ | 삭제(단건·선택)·검사 **3개 호출에만** `timeout: 3분`(공통 인스턴스 기본값 무수정). 삭제 모달·검사 버튼 툴팁에 "같은 날짜 정리·게시가 끝날 때까지 기다림" 안내 |
| v1.1-5 | `csvFormulaGuard:false` | ✅ | 상세 드로어에 값 그대로(`csvFormulaGuard: false`) + "복원용 원본" 안내, manifest JSON에도 그대로. 목록 위 다운로드 안내 한 줄 |
| v1.1-6 | 손상 설정 `warnings[]` | ✅ | APM 탭 상단 빨간 배너(i18n + 서버 원문 설명) + **바꾼 것이 없어도 저장 버튼 활성**. ⚠️ 문장 머리 매칭 — FE 요청 #2 |

---

## 2. 화면 배치 · 진입점 5곳 확인

| 진입점 | 결과 | 근거 |
|---|---|---|
| 사이드바(`layouts/app/SideNav.tsx`) | **없음(의도)** | 설정 화면은 사이드바에 두지 않는다(ZM-161 — 콘솔 내비가 정본). 사이드바의 `PATH_SETTING` 참조는 라이선스·연동 활성 키 판정뿐 |
| 모바일(`MobileSideNav.tsx`) | **없음(의도)** | 같은 이유. `userManagement` 링크 하나만 예외로 있다 |
| ⚙ / 관리 콘솔(`constants/adminConsole.tsx`) | ✅ 추가 | 운영 그룹, `key: "data-archive"`, `adminOnly`. 콘솔 내비·콘솔 홈·⚙ 드롭다운이 이 정본을 읽는다. APM 그룹이 아닌 이유: 원장은 소스 공통·라이선스 밖(자빅스 I7도 같은 화면) |
| 전역 검색(`GlobalSearch` ← `SETTINGS_ENTRIES`) | ✅ 자동 | 정본에서 펼쳐지므로 별도 등록 없음. `navSearchEntries.ts`에는 설정 항목을 따로 적지 않는 규약 |
| 라우트(`routes/routes.tsx`) | ✅ 추가 | 설정 블록, `PageWrapper … adminOnly`. FeatureGate 없음(공통 EP는 premium 밖 — APM 탭만 화면 안에서 라이선스로 가림) |

- 보류 배너: APM 라우트 루트 element(`DashboardLayout contentTop`) — 개요·서비스 등 APM 화면 전부의 제목 아래에 선다.
- 브레드크럼: `/setting/data-archive` → `data_archive.title`(세그먼트 규칙).
- 도움말: `page-guide.ts` 엔트리 + 탭별 키(`?tab=apm`·`?tab=settings`).

---

## 3. 바꾼 파일 (워크트리, 수정 16 · 신규 17)

**신규**

| 파일 | 내용 |
|---|---|
| `src/types/archive.ts` | 계약 §2·§3 타입(+v1.1 `RUNNING`·`rejected`) |
| `src/services/archive.api.ts` | 14 EP. 다운로드 blob(JSON blob = envelope 오류) · 쓰기 언랩 · `ArchiveApiError`(data 보존 — 경로 실검사 결과) · 삭제·검사 락 대기 timeout |
| `src/constants/archive.ts` | 탭·상태 색·데이터셋 순서·범위·폴링 주기·오류 코드·timeout·손상 경고 머리말 |
| `src/hooks/useArchive.ts` | 조회 7 + 쓰기 6. 상태 키 하나를 배너·화면이 나눠 씀 |
| `src/pages/setting/data-archive/DataArchivePage.tsx` | 탭(`?tab=`, 사용자 전환 push / 정규화 replace, 라이선스 없으면 APM 탭 접힘) |
| `…/data-archive/archiveDisplay.ts` | 순수 판정(행·묶음·요약·배너 재구성·손상 감지·삭제 결과 안내·오류 해석·크기·남은 분) |
| `…/components/ArchiveFilesTab.tsx` | 필터(URL)·날짜 묶음 트리 표·선택 다운로드(순차·중단)·선택 삭제·행 버튼(받기·검사·삭제)·상세 |
| `…/components/ArchiveDeleteModal.tsx` | 사유 필수(trim 1~255)·대상 범위·개수·용량 문장·락 대기 안내 |
| `…/components/ArchiveFileDetailDrawer.tsx` | `ResizableDrawer`. 원장 행·manifest·사전·같은 날 원장 이력·`csvFormulaGuard` |
| `…/components/ArchiveSettingsTab.tsx` | 경로·여유 공간·파일 상한, 연결 테스트, 저장 실패 시 실검사 결과 패널, 허용 루트 없으면 잠금 |
| `…/components/ArchivePathCheckPanel.tsx` | 실검사 결과(규칙 번호 i18n 라벨 + 원문, 볼륨 미마운트 빨간 경고) |
| `…/components/ApmArchiveTab.tsx` | APM 설정 편집본·확인 모달·보류 목록·지금 실행·배너 |
| `…/components/ApmArchiveStatusCard.tsx` | 기능·보류 건수/최고 일수·다음 정리까지·여유 공간·마지막 회차 요약·사용량·최근 실패 |
| `src/pages/application-monitoring/shared/components/ApmArchiveHoldBanner.tsx` | APM 메뉴 보류 배너 |
| `src/__tests__/fixtures/archiveContractSample.ts` | 계약 샘플(타입 게이트) |
| `src/__tests__/dataArchiveDisplay.test.ts` | 순수·API·등록·i18n (34) |
| `src/__tests__/DataArchivePage.test.tsx` | 화면·배너 (31) |

**수정**

| 파일 | 변경 |
|---|---|
| `constants/adminConsole.tsx` | 운영 그룹에 `data-archive`(adminOnly) |
| `constants/routes.ts` | `PATH_SETTING.dataArchive` |
| `routes/routes.tsx` | 라우트 1 + APM 루트 `contentTop={<ApmArchiveHoldBanner />}` |
| `layouts/dashboards/index.tsx` | `contentTop?: ReactNode` 슬롯(구역 공통 안내용) |
| `constants/page-guide.ts` | 도움말 엔트리(탭별) |
| `constants/scheduler.ts` | `apm_archive` |
| `constants/queryKey.ts` | `ARCHIVE_QUERY_KEY` |
| `enums/common.ts` | `DATASET`·`INCLUDE_DELETED` 쿼리 키 |
| `types/apm.ts` | `ARCHIVE_HOLD`(종류·순서·단위·전역 전용·창 없음) + `APM_ALERT_SERVER_JUDGED_KINDS` |
| `…/shared/apmAlertDisplay.ts` | `apmAlertServerJudged` |
| `…/alert-rules/components/ApmAlertRuleDrawer.tsx` | 서버 판정 종류: 임계·창·미리보기 숨김, 전용 안내, 수정 시 `{enabled}`만 |
| `…/alert-rules/tabs/ApmAlertRulesTab.tsx` | 임계·창 칸 "서버 판정"/"—" |
| `locales/kr.json`·`en.json` | `data_archive` 블록 + 메뉴 설명·스케줄러·알람 종류·폼 안내·도움말 |
| `__tests__/AdminConsoleNav.test.tsx` | 항목 수 13→14 |
| `__tests__/ApmAlertRulesPage.test.tsx` | ARCHIVE_HOLD 3건 |

---

## 4. 계약과 다르게 한 것 · BE 요청

| # | 계약 | FE | 이유 |
|---|---|---|---|
| 1 | §7 "`warnings[]` 전부 배너" | 서버 문장을 그대로 띄우지 않고 **같은 조건을 구조화 필드로 재판정**해 i18n 배너로 | 한국어 고정 + 내부 표기·`설계 §6.2`·`R3 규모`가 섞여 고객 문구 규칙 위반, 영어 로케일 불가. 예외: 손상 경고(#v1.1-6)는 판정할 필드가 없어 원문을 **설명**으로 붙인다 |
| 2 | §3.2 옵트인 확인 모달에 `datasets[].warning` | metric1m·span은 FE i18n 문장(예상 크기는 응답 `estimatedDailyArchiveBytes`) / 모르는 옵트인은 서버 원문 폴백 | 같은 이유 |
| 3 | §2.1 기본 `limit` 50 | 표 공통 부품(`DmoveTable`)이 첫 마운트에 `limit=10`을 URL에 쓴다 → 첫 페이지 10건 | 레포 표 관례(리포트 관리와 같음). 요청 상한 200으로 자름 |

계약서 `## 🔄 FE 요청사항`에 4건 기록: ① `warnings[]`·`datasets[].warning` 코드화 ② 손상 설정 표지 필드 ③ (확인) 스케줄러 DTO의 리터럴 `'Z'` 시각 ④ (후순위) 날짜 단위 페이지. **어느 것도 화면을 막지 않는다.**

---

## 5. 테스트 결과 (실제 실행)

| 검사 | 결과 |
|---|---|
| `npx tsc --noEmit` | 통과(출력 없음, exit 0) |
| `npm run typecheck:contract` | 통과 |
| `npx eslint <바꾼·새 파일> --max-warnings 0` | 통과(exit 0) |
| `npx jest <대상 10 스위트> -w 2` | **222건 중 219 통과 · 3 실패** — 실패 3건은 전부 `apmHelpContent.test.ts`이고 **master 그대로의 임시 워크트리(`c4eaf55`)에서도 같은 3건이 실패**(chart_help `alert_stuck_table`·option_help `queue_size`/`retry_max_elapsed` 키 목록 미갱신 — 오늘 master 커밋들이 키를 더하고 테스트 기대값을 안 고침). 이 작업과 무관, 수정하지 않음 |

대상 스위트: `DataArchivePage`(31) · `dataArchiveDisplay`(34) · `ApmAlertRulesPage`(+3) · `AdminConsoleNav` · `apmRoutes` · `apmAdminGating` · `apmHelpContent` · `GlobalSearch` · `apmAlertDisplay` · `apmAlertHooks` → Test Suites 9 passed, 1 failed(위 기존 실패).

- 고아 jest 워커: 실행 후 `node … jest` 프로세스 0 확인. 임시 master 확인용 워크트리는 정션 해제 후 제거.
- ⚠️ 첫 화면 테스트 실행에서 **테스트 mock**이 `searchParams`를 렌더마다 새로 만들어 `DmoveTable` effect가 무한 갱신에 빠졌다(15분 정지) — 실제 라우터는 주소가 바뀔 때만 새 객체를 주므로 화면 결함이 아니라 mock 결함. mock을 같은 params에 같은 객체를 주도록 고쳤다(주석 남김).

---

## 6. 미해결 · 한계

| # | 항목 | 비고 |
|---|---|---|
| 1 | **브라우저 실측 미실시** | BE가 :3000에 없다. BE 병합·재기동 뒤 확인할 것: 목록·다운로드(실 ZIP)·삭제 사유·경로 테스트·APM 켜기(허용 루트 있는/없는 설치본)·보류 배너·`ARCHIVE_HOLD` 규칙 행 |
| 2 | 손상 설정 감지가 문장 머리 매칭 | FE 요청 #2 |
| 3 | 스케줄러 시각 `'Z'` 해석 | 설정 › 스케줄러와 같은 해석. 운영 JVM이 KST면 "남은 시간"이 9시간 어긋남(FE 요청 #3) |
| 4 | 날짜 묶음은 페이지 안에서만 | 하루치가 페이지 경계에 걸리면 나뉜다(FE 요청 #4) |
| 5 | 여러 파일 내려받기는 순차 개별 저장 | 브라우저가 "여러 파일 다운로드 허용"을 물을 수 있다. 한 ZIP으로 묶는 EP는 없음 |
| 6 | 미저장 입력 보호 없음 | 탭 간 이동은 마운트 유지로 입력이 남는다. 화면을 떠나면 사라진다(리포트 관리의 `useBlocker` 수준은 미적용) |
| 7 | moveseye-ai 툴·`navSearchEntries` | AI 화면 카탈로그(`screens.json`)에 새 화면 미등록(다른 레포) |

---

## 7. 계약 v1.2(§9.1) · 코덱스 FE 검수 반영 (2026-10-01 추가)

| # | 항목 | 반영 |
|---|---|---|
| v1.2-1 | `warnings[]`·`datasets[].warning` = `{code,message,params}` | 코드 8종 → i18n 배너(`archiveWarningBanner`/`apmArchiveBanners`, 상태·설정 중복 제거), 모르는 코드는 `message` 폴백. 옵트인 확인 모달도 같은 코드(`OPT_IN_VOLUME`: 이 설치본 추정 > 설계 범위 > 미측정). **문장 머리 판별 제거** — §4 #1·#2의 "구조화 필드 재판정" 우회는 끝났다 |
| v1.2-2 | `archiveJob`·`retentionJob` = `JobInfo`(epoch ms) | 전용 타입, 남은 시간 = `nextRunAt − now`. 리터럴 `Z` 문제(FE 요청 #3)는 이 화면에서 사라졌다(설정 › 스케줄러 EP 자체는 BE 별도 이슈) |
| v1.2-3 | `settingsState` | 손상 배너 판정을 이 필드로(상세는 `SETTINGS_INVALID.params.detail`), 손상이면 저장 버튼 활성 |
| v1.2-4 | `ARCHIVE_BUSY`(409) | 전용 문구 + **다시 시도** 확인 창 — 단건 삭제(모달 유지)·무결성 검사·APM 설정 저장 |
| v1.2-5 | 선택 삭제 `busy[]` | 결과 창에 "진행 중이라 건너뜀 n건"(rejected와 별도) |
| v1.2-6 | `lastHoldReason` | 보류 표 "보류 사유" 열: `LOCK_TIMEOUT`/`NOT_ARCHIVED` + 마지막 보관 실패 덧붙임 |
| #9 | `APM_ALERT_RULE_PROTECTED`(400) | 공통 오류 해석(`services/apiEnvelope.ts`)에 `apm.alerts.form.protected` 매핑, 상수·픽스처 |

코덱스 R1~R15: 필수 R1·R4·R5·R9·R11, 권장 R6·R12·R14·R15 반영 / R2·R3·R7·R8·R10·R13 이상 없음 — 표는 검수 인계서 `## 검수 결과(코덱스 v1)`.

추가로 바뀐 파일: `services/apiEnvelope.ts`(보호 규칙 오류 매핑 1줄). 안 쓰게 된 로케일 `data_archive.apm.optin_warning.*`·`hold_not_tried`는 지웠다.

### 재검증(v1.2·코덱스 반영 후, 2026-10-01)

- `npx tsc --noEmit` 통과 · `npm run typecheck:contract` 통과 · 바꾼 파일 `eslint --max-warnings 0` 통과
- `npx jest` 대상 10 스위트 **231건 중 228 통과** — 실패 3건은 `apmHelpContent.test.ts`의 master 기존 실패(그대로). 첫 실행에서 새 테스트 2건이 테스트 자체 결함(데이터셋 순서 가정·한 테스트 안 이중 렌더)으로 실패 → 고쳐 아카이브 2 스위트 재실행 72/72 통과
- 고아 jest 워커 0 · 변경 파일 34(수정 17 · 신규 17) · 커밋 없음 · 브라우저 실측은 여전히 미실시

## 8. 코덱스 v2 재검수 반영 (2026-10-01)

| # | 반영 |
|---|---|
| N1 | APM 설정 저장에도 잠금 대기 timeout 3분(서버 60초 대기와 공통 60초 경계 충돌 해소) |
| R9 | `ARCHIVE_HOLD` 행에서 수정 버튼까지 제거 — 켜기/끄기 스위치만 |
| R12 | 실패 사유 타입을 BE `REASON_*` 6종으로, `failReason`·`lastFailureReason` 타입 좁힘 |
| N2 | 픽스처 주석 정정(JobInfo epoch ms) |
| (v3) | 상태 경고 `LOCK_TIMEOUT` 배너(테이블·날짜·시각), 픽스처 샘플 |

재검증: tsc·typecheck:contract·eslint 통과 · 대상 10 스위트 **232 중 229 통과**(실패 3 = master 기존 `apmHelpContent`) · 변경 파일 34(수정 17·신규 17) · 커밋 없음 · 브라우저 실측 미실시.
