---
type: worklog
project: "[[moves-workforce]]"
tags: [forge, gantt, svar, jira-api, issue-link, custom-field]
date: 2026-07-02
updated: 2026-07-02
---

# 2026-07-02 — 이슈 연결 간트 (projectDetail Gantt 탭)

상위: [[moves-workforce]] · 관련: [[forge-readonly-appfield-write]] · [[2026-06-29-delete-cascade-gantt]](※ 별개 — 그쪽은 *포트폴리오* 간트 오버레이)

> 프로젝트 상세에 **간트 탭** 신설 (RFC-134/139, 2026-06-25~07-01). 이슈를 간트로 시각화 + 일정 드래그/계층/선후행 편집.
> 코드: BE `src/resolver/gantt/`, FE `static/ui/src/pages/projectDetail/gantt/`. **설계·구조 SSOT는 저장소 내 `src/resolver/gantt/GANTT.md`** — 이 노트는 결정·교훈 요약.
> 상태(2026-07-02): 코드 완료·테스트/빌드 통과, **배포 최종확인·커밋 전**. 인계: `_workspace/issue-link-gantt/HANDOFF_v2.md`.

## 1. 핵심 설계 결정 — 두 가지 "관계"는 저장소가 다르다

| 관계 | UI | 저장 | 이유 |
|------|----|------|------|
| **선후행(의존)** | 막대 사이 화살표 | **Jira 네이티브 이슈 링크** ("Blocks", `POST/DELETE /issueLink`, read `fields=issuelinks`) | 원래 커스텀필드(`predecessorsField`)였으나 **readOnly라 write 불가**(400) → 네이티브 전환으로 표준 API(asUser) write + Jira 이슈 화면 자동 연동 |
| **계층(부모-자식)** | 좌측 트리 들여쓰기 | **앱 커스텀 필드** `wbsParentField` (+ 네이티브 `parent` 폴백) | Jira 네이티브 계층은 3레벨+인접만 → **임의 깊이** 필요. 순환은 앱에서 방어 |

- 네이티브 링크는 관계타입(FS/SS)·lag 저장 불가 → Link의 `type:'FS'/lag:0`은 **표시용 고정값** (계약에 명시).
- `predecessorsField`는 manifest에 **미사용 존치** (제거는 기존 설치 배포 파괴 위험).
- 검증은 순수함수 `GanttValidationService.js` — `detectTreeCycle`(부모 재지정) / `detectDagCycle`(링크 add), 위반 시 `LogicalError` + `GANTT_*` 에러코드 → 프론트 토스트.

## 2. 배포 실사용 버그 체인 (교훈 밀도 높음)

배포 후 "선이 안 나옴 → 역방향 → 느림/깜빡임" 3연속. 각각 근본 원인이 달랐다:

1. **선 저장 실패** — readOnly 앱필드는 `PUT /issue`로 못 씀 → 계층은 `PUT /rest/api/3/app/field/{id}/value`(asApp·숫자 issueIds), 선후행은 아예 네이티브 링크로 전환. → [[forge-readonly-appfield-write]]
2. **방향 뒤집힘** — SVAR add-link payload는 **원래 정방향**(source=선행). 역방향 관측은 *옛 번들 배포 타이밍* 탓이었는데 swap을 넣어 오히려 역전 → swap 제거로 확정. 근거는 추측이 아니라 SVAR dist 소스의 링크 기하(`e2s = source.end→target.start`) 직접 확인. **"배포 안 된 번들을 보고 코드 동작을 판단하지 말 것."** 과거 뒤집혀 저장된 링크는 삭제 후 재생성 필요.
3. **느림/깜빡임** — invalidate 전체 재조회(느림) → 낙관적 업데이트(SVAR 내부 임시 링크와 겹쳐 "역→정" 깜빡임) → 최종: **onMutate 낙관 반영 + onSuccess 서버응답으로 해당 target만 부분 패치 + onError 롤백** (전체 재페치 없음). 낙관적 업데이트는 방향이 SVAR/서버와 일치해야 깜빡임이 없다.
4. (부수) **Sentry 429** — `consoleLoggingIntegration` levels 전체 전송이 CSP 노이즈 반복으로 폭주 → `["error"]`로 축소.

## 3. SVAR(@svar-ui/react-gantt) 함정 모음 (유지보수 주의)

- **라이선스**: `@svar-ui/react-gantt` MIT 사용. ⚠️ `wx-react-gantt`는 GPL — 금지.
- **markers(세로선)는 PRO 유료** — 무료 빌드엔 렌더 JS 자체가 없음 → 시작/종료/오늘 표식은 커스텀 오버레이(`computeOverlay`, SVAR `_scales.diff` 동일식으로 픽셀 정합).
- **CSP/CDN**: `all.css`의 cdn.svar.dev @import + 런타임 `<link>` 주입이 Forge CSP에 차단 → `style.css` + patch-package로 CDN 무효화 + 폰트 자체호스팅. SVAR `<Tooltip>`도 같은 이유로 불가 → 커스텀 막대 툴팁(mousemove 위임).
- **`open:true`는 summary에만** — leaf에 주면 `null.forEach` 크래시. 빈 tasks 마운트 가드.
- **트리 아코디언은 `id==='text'` 컬럼에만 붙는다** (dist `findIndex(c=>c.id==='text')`) — 컬럼 id가 다르면 토글이 아예 안 나옴 → 첫 컬럼 id를 `'text'`로.
- **scale `format`은 함수로** — 문자열 토큰은 리터럴 출력.
- **진척율 드래그 핸들 비활성** (`.wx-progress-marker{display:none}`) + progress-only 이벤트 write 스킵.
- **`gridWidth` prop은 무료 빌드가 무시** — 그리드-차트 리사이저 시도 revert, 보류.
- 이벤트 intercept 패턴: add-link 등은 **항상 return false**(SVAR 로컬 변형 차단) → mutate → 우리 데이터로만 렌더 (서버 권위).

## 4. 기타 결정

- **asApp 최소화**([[moves-workforce]] 원칙): 읽기/일정/링크 전부 asUser. 유일 예외 = wbsParentField write (app/field/value 엔드포인트가 asApp 필수).
- **일정 write** = 표준 필드(`customfield_10015` 시작 + `duedate`) `PUT /issue` asUser.
- **미일정 이슈**(R4): SVAR unscheduled 영역은 드래그 불가 → 행에 "일정 설정" 버튼 → DatePicker 모달 → `updateGanttSchedule` 재사용 (`GanttScheduleModal.jsx`).
- **상위 지정 모달**(E-2): 드래그 외 명시 경로 — `@atlaskit/select`, 자기+자손 제외, "최상위" 옵션 (`GanttParentModal.jsx`).
- **토스트 전역 개선**: `ToastFlags.js` AutoDismissFlag(8초·무한쌓임) → Flag 2.5초 자동제거 + 최신 3개만.
- 권한: `PROJECT_GANTT` seed 미등록 — 읽기 권한자 모두 편집 (형제 탭과 일관, 차등은 후속).

## 5. 남은 작업 (GANTT.md §7 + HANDOFF_v2 §3-1)

- **배포 최종 확인**: 링크 정방향/즉시/무깜빡임, Jira 이슈화면 blocks 표시, 아코디언·일정설정·상위지정 육안. 진단 console.log 제거(`useGanttData`/`GanttChart`).
- **E-1**: 드래그로 하위 진입 안 됨 — move-task payload 실구조 진단 후 매핑 교정.
- 부모 편집 낙관/부분패치화(현재 invalidate), setGanttLink 사이클검증 페치 1회 절감, manifest `predecessorsField` 안전 제거.
- 커밋(사용자).

## 교훈

1. **써드파티 필드에 write하기 전에 readOnly 여부부터** — Forge 앱필드의 readOnly는 "표준 API로는 영원히 못 씀"이라는 뜻. 커스텀 저장소를 파기 전에 네이티브 구조(이슈 링크 등)로 풀리는지 먼저 검토.
2. **방향/동작 판단은 배포된 번들 기준으로** — 관측이 코드와 어긋나면 코드를 고치기 전에 "지금 보는 게 어느 빌드인가"를 먼저 의심. 이번엔 그걸 놓쳐 swap을 넣었다 뺐다 두 번 뒤집었다.
3. **라이브러리 동작은 dist 소스로 확정** — SVAR 링크 기하·아코디언 `id==='text'` 조건·markers PRO 부재 모두 추측 대신 번들 소스를 읽어 종결했다.
4. **낙관적 업데이트는 서드파티 내부 상태와의 경합까지 설계** — return false로 로컬 변형을 차단해도 찰나의 내부 렌더와 겹치면 깜빡인다. onSuccess 부분 패치가 절충점.

## 관련
- 저장소 문서: `src/resolver/gantt/GANTT.md`(SSOT) · `_workspace/issue-link-gantt/HANDOFF_v2.md` · `01_architect_design_v2_native.md`
- [[forge-readonly-appfield-write]] — 재사용 교훈 분리
- [[2026-05-29-progress-page]] — 같은 프로젝트디테일 탭 계열, `CALCULATION.md`(진척 계산 SSOT)도 이번에 저장소 공식 문서화
- [[harness-engineering]] — architect→backend/frontend→verifier 파이프라인으로 진행
