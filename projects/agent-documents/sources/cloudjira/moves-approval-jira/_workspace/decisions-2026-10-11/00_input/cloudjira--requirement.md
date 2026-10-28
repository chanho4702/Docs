# decisions-2026-10-11 — 사용자 결정 묶음 구현 (구현: Codex)

근거: `_workspace/QUESTIONS.md` 의 Q23·Q90·Q137·Q138 답(2026-10-11 사용자). 이 리포 규칙은 `AGENTS.md`·`CLAUDE.md` 가 원천이다.

## T1. 라이선스 만료 강력 경고 (Q23)
- 결정: 만료되면 그대로 막는다(+ 시간 추적 제공자 선택 중이면 사이트 전체 시간 입력이 멈춤). 대신 **만료 7일 전부터 강력 경고**.
- 할 일:
  - 지금 평가판 만료 배너(`static/ui/src/features/license/*`, `useLicenseStore.computeTrialBanner`)는 업무함·설정에만 뜨고 평가판만 다룬다. **정식 구독 만료(subscriptionEndDate 등)도** 다루고, **작업 로그 탭(worklog 엔트리)·이슈 화면·설정**에도 띄운다.
  - 문구(kr/en): "N일 후 라이선스가 만료됩니다. 만료되면 이 사이트의 시간 입력이 멈춥니다(Moves Approval 이 시간 추적 제공자로 지정돼 있으면). 갱신하거나 Jira 설정 > 시간 추적에서 제공자를 Jira 기본으로 되돌리세요." 시간 추적 제공자 지정 여부를 알 수 없으면 조건문으로.
  - 만료 후 안내 화면(`LicenseGuidePage`)에 "시간 입력을 되살리려면 제공자를 Jira 기본으로 되돌리는 방법" 단계 안내 추가.
  - 배너 닫기는 하루 단위로만 기억(매일 다시 뜬다 — "강력").
- 테스트: 정식/평가판 만료 7일 이내·초과·만료 후, 각 엔트리 렌더.

## T2. 재개방 두 단계 (Q137)
- 현재: 관리자 `reopenPeriod` 는 마감(CLOSED) 잠금만 푼다. 승인 잠금(PERIOD_APPROVED, 정책 무관)·인증 잠금·통제 숨김은 그대로.
- 결정: 두 단계 모두 지원.
  - **"새 입력 허용"**(기본): 지금 동작 그대로. 빠진 워크로그 추가만 가능.
  - **"수정까지 허용"**: 그 기간(사용자×기간 또는 사이트 기간 — 기존 재개방 범위와 같게)의 **승인(타임시트 APPROVED)과 인증(CERTIFIED)을 "재개방으로 해제"** 처리하고, 통제 숨김(visibility)을 해제 대상으로 넘기고(기존 worklog-control 해제 경로·원장 재사용), **재승인·재인증이 필요**한 상태로 만든다.
    - 결정은 진실(불변식 2): 결재자 행을 지우거나 덮지 않는다. 승인 기록은 남기고 "재개방 해제" 이벤트(결정적 id)와 상태 전이로 표현. 타임시트는 기존 "승인 후 변경 감지/재제출" 흐름과 맞물리게(설계 판단 근거를 보고서에).
    - 인증은 기존 상태 머신에 "재개방 해제" 전이를 추가(인증 레코드 보존, 상태만 미인증/재인증 필요). 워크포스 게시 문서에서 그 건은 빠지도록(즉시 게시 큐 재사용).
    - **해제 건수 미리 보기**(승인 N건·인증 M건·숨김 K건) → 확인 → 사유 필수(1~500자) → 실행. 감사 기록(통제 이력·설정 감사·결재 이벤트)에 누가·언제·사유.
    - 권한: 앱 관리자(`{admin:true}`), 대량이면 예산·부분 진행·이어하기.
- UI: 기간 관리 화면에 두 버튼, "수정까지 허용"은 강한 경고 + 사유 모달.
- 테스트: 두 단계 각각, 해제 후 수정 가능, 재승인 필요 표시, 감사 기록, 남의 범위 침범 없음.

## T3. 필드 변경 승인 앱 대체 적용 옵션 (Q90)
- 결정: 기본은 지금처럼 최종 결재자 asUser 적용, 실패 시 "다시 적용". **정책 `fieldChangeApplyFallback`(기본 OFF, 값 'APP')** 을 켜면 asUser 적용이 권한·화면 문제로 실패했을 때 **asApp 으로 재시도**(+필요 시 overrideScreenSecurity — 문서 확인, 못 하면 미검증으로).
- Jira 이력에 앱으로 남는다는 안내를 켤 때 보여 준다(kr/en). 우리 결재 기록에는 실제 승인자 유지, 적용 이벤트에 `appliedBy: APP` 사유.
- AGENTS asApp 허용 목록 신설 문구 초안은 보고서에(리더가 반영). 사유 고정 문자열 예: `field-change-apply-fallback`.
- 테스트: OFF 면 기존 동작, ON 이면 asUser 실패 → asApp 성공/실패, 멱등(UNKNOWN 재전송 금지 규칙 유지).

## T4. 탈퇴(삭제) 계정 처리 + 개인정보 보고 (Q138)
- 근거: Forge user privacy guidelines(https://developer.atlassian.com/platform/forge/user-privacy-guidelines/) — 개인정보를 저장하는 앱은 `report:personal-data` scope 로 개인정보 보고 API 에 주기적(기본 7일)으로 accountId 를 보고하고, `closed` 응답이면 지운다.
- 결정:
  - **감사 기록(결재 이벤트·결재자·인증·워크로그 이력·통제 이력·설정 감사)의 계정 id 는 지우지 않는다.**
  - **기능용 개인정보는 지운다**: 서명 이미지·PIN·알림·위임·팀 명부 등록·사용자 캐시 등(전수 조사해 목록화).
  - 화면: 삭제된(closed) 계정은 **"탈퇴한 사용자 A/B/…"** 로 계정마다 구분 표시(같은 계정은 사이트 전체에서 같은 표식, 표식 배정은 결정적·안정적), 비활성화(deactivated) 계정은 Jira 가 주는 이름 그대로.
  - 감사 엑셀 전부에 **이름과 계정 id 를 함께** 넣는다(이미 있으면 확인).
- 구현:
  - manifest `report:personal-data` scope 추가(→ install --upgrade 필요, 보고서에 명시).
  - 보고 작업: 새 스케줄 금지 — 일일 `approval-sweep` 큐 fan-out 에 **7일 주기** 작업 추가(KVS 로 마지막 보고 시각·커서, 주기 아닌 날은 SQL 0 — `idleSqlBudget` 유지). 보고 대상 accountId 수집은 테이블별 DISTINCT 를 커서로 나눠(예산 20초, 90개씩 POST). 응답 `closed` → 기능용 정보 삭제 + closed 표식 저장, `updated` → 캐시 갱신. `Cycle-Period` 헤더 준수.
  - 앱 제거 시(`preUninstall` 기존 훅) 더 필요 없는 기능용 개인정보 정리.
- 문서: `docs/guide/{ko,en}` 관리자 가이드에 "퇴사자는 삭제 말고 비활성화. 삭제가 필요하면 그 전에 감사 기록 내려받기" + 개인정보 처리 설명(감사 기록 식별자 보관 명시).
- 워크포스 리포는 이번에 하지 않는다(후속).

## 공통 제약
- 불변식 1~10, AGENTS 유휴 비용(새 scheduledTrigger 금지, `idleSqlBudget` 미연동 27·연동 38 유지 또는 근거와 함께 갱신), resolver 3단계 등록, 에러 코드는 `ErrorCodes` + `locales/{kr,en}/error.json`, i18n `npm run merge`, 마이그레이션은 현재 마지막 v060 다음부터·칼럼/테이블이 인덱스보다 앞.
- **수정 금지**: `AGENTS.md`·`CLAUDE.md`(문구는 보고서에 초안), `.claude/`, `docs/APP-MANAGED-WORKLOG-DESIGN.md`·`docs/WORKLOG-IDENTITY-PROPERTIES-DESIGN.md`·`docs/DESIGN.md`(다른 세션 미커밋), `_workspace/schedule-window-fields/`(설계 진행 중), 워크포스 리포.
- `git commit/add/push`·`forge` 명령 금지.
- 검증: `npm test`, `npm run merge`, `npm run test:ui`, `npm run build:ui`, `npx forge lint` 모두 통과.
- 보고서: `_workspace/decisions-2026-10-11/02_codex_report.md` — T1~T4 별 바꾼 파일, 실제 resolver 계약(이름·권한 축·입력·응답·에러), 테스트 수, 유휴 SQL, 마이그레이션, manifest 변경, AGENTS/CLAUDE 문구 초안, 미검증, 설계 판단.
