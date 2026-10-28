# linked-mode-ux — 배포 전 실측·후속 목록 (취합: 2026-10-13, 리더)

출처: 설계 §14, 02_backend_report §6, 02_frontend_report §6, 05_workforce_report §6·R1, 03_verify_report 재검증 1, codex-review.md §배포 전 필수 실측.

## A. 배포 전 필수 실측 (개발 사이트, 두 앱 설치 + 연동 켬)

| # | 항목 | 실패하면 | 절차 |
|---|---|---|---|
| U-1 | 워크포스 → 승인 앱 전역 페이지 하위 경로 `router.navigate`(`…/worklog/{issueId}/new/{date}/{HHmm}-{HHmm}`, `…/{issueId}/{worklogId}`) | ① 넘김이 실질 BLOCKED("열지 못했습니다") → 창구 통일 무효 | 워크포스 패널·마이워크 모달·캘린더 드래그에서 넘김 → 승인 앱 새 작성 화면에 날짜·시간 프리필 확인 |
| U-2 | Forge 전역 페이지가 넘겨주는 pathname 형식(상대/전체) | 프리필 누락 | U-1 과 같이, 콘솔 pathname 기록 |
| U-7 | 운영 환경 `getAppContext().appAri/environmentAri` → ctl `ui.globalPagePath` | 경로 null → 워크포스 BLOCKED | 승인 앱 진단 `HANDOFF_PATH` |
| U-4 | 승인 앱 asApp 의 프로젝트 프로퍼티 PUT `movesApproval.flows` | ④b 결재선 열이 워크포스에 안 보임 | `workforce_publish` `F:*`/`flows` 행 `last_error_code`, 프로젝트 프로퍼티 GET |
| U-5 | 워크포스 asUser 가 승인 앱이 쓴 `movesApproval.flows` 를 읽는가(타 앱 프로퍼티) | ④b | 워크포스 진단 `FLOWS_DOC`, 승인 설정 표 결재선 열 |
| U-6 | 시간 추적 제공자 미선택 사이트에서 승인 앱 이슈 패널 "작업 시간 기록" 진입 | 연동 이슈 작성 진입점 | lis 관문 G7 증거 재사용(같은 manifest·진입 경로면) |
| V-8 | `listAllApprovals`·history 쿼리 실행 계획 | 관리자 목록 느림 | TiDB `EXPLAIN` — `ix_request_retention`·`ix_inbox_open` 사용 확인 |
| R-U4 | Forge `view.getContext().timezone` 실제 채움 | 내 이력·승인 관리 기간 경계 하루 차이 | 개발 사이트에서 값 확인 |

## B. 배포 전 권장 실측

| # | 항목 | 절차 |
|---|---|---|
| U-3 | 관리자 asUser 로 남의 `movesRms.org` 사용자 프로퍼티 GET(팀 탭 "다시 읽기") — 실패면 캐시만 | 팀 탭 다시 읽기 → `unreadable` 수 |
| R-U2 | 워크포스 수정·삭제의 실행 시점 재판정 지연(이슈 GET + 워크로그 GET + 통제 문서) | 연동 사이트에서 드래그·저장 체감 |
| R-U3 | 승인 앱 연동 판정 ↔ ctl 게시 사이 공백(스위치 OFF 워크포스가 DIRECT 작성 → `LINKED_DIRECT_WF` 관찰) | 연동 직후 게시 주기 실측 |
| FU-1 | 프로젝트 설정 iframe 안 이슈 예외 편집 모달 높이·스크롤 | 프로젝트 설정 › Moves Approval 에서 모달 열기 |
| FU-2 | 관리자 업무함 첫 진입 시 '관리' 묶음 지연 노출(깜박임) | 관리자 계정 |
| FU-8 | 내 이력 엑셀 내보내기가 서버 필터로 전량 조회하는지 | 내 이력에서 엑셀 |
| U-W1 | 드래그 넘김 토스트 2.5초 자동 닫힘 — 버튼 누를 시간 짧음 | 화면 확인, 필요하면 정보 토스트 표시 시간 연장 |

## C. 서버 보강으로 닫힌 것 (실측 불필요)
- R-U1 다른 이슈 id 로 연동 이슈 워크로그를 고치는 우회 → 워크포스 `assertDirectEdit` 가 워크로그 GET 으로 소속·작성자 대조(수정 회차 2).
- R-1 작성자 본인 대조 → 같은 보강.
- V-9 `touchDocKey` 전체 스캔 → `F:` 계정 범위 + `doc_key='flows'` 로 제한(백엔드 R).
- 코덱스 P1 "예외 목록 프로젝트 재확인", "캐시된 DIRECT 로 PUT/DELETE" → 각각 백엔드·워크포스 수정 회차 1.

## D. 후속 (이번 범위 밖)
- W-8a 워크포스 org 문서 팀 칸 게시(관문 G1 뒤) — 그 전까지 승인 앱 팀 탭 "워크포스에서 받은 팀"은 빈 상태 안내(Q146).
- FU-5 승인 관리 프로젝트 필터 UI(프로젝트 선택기).
- FU-4 승인 관리 진행 중 기본 기간 1년 — 오래 열린 건이 있으면 기본값 조정.
- R-3 워크포스 패널 번들 gzip 예산 94.7% — 다음 패널 변경 전에 여유 확보.
- 백엔드 범위 밖 발견: `drainCtl` 문서 크기 상한 검사 없음 / 업무함 키셋 커서가 역할별 두 행일 때 두 번째 행 건너뜀 가능 / `TimesheetTargetAdapter.filterVisible` 은 업무함 밖 목록에 쓰면 불변식 7 위반 / 동결된 인증 요청은 워크로그 삭제 뒤 목록에는 보이고 상세는 거부.
- 수동 독촉 하루 1회는 수동끼리만 — 자동 독촉과 합산은 아님(의도 확인 필요 시 설계 Q148 재검토).

## E. 배포 순서 (설계 §17 + 구현 보고 반영)
1. 승인 앱(읽는 쪽) 먼저 — ctl `rx` 에 `rms.issue.fl`·`approval.flows` 를 함께 싣는다. 계약 7파일은 양쪽 같은 회차 커밋.
2. 워크포스 — 구판 승인 앱의 `ch:'WORKFORCE'` 문서도 HANDOFF 로 처리하므로 ① 은 순서 무관. ④ 화면은 승인 앱 ctl 재게시 뒤 열린다.
3. 한쪽만 롤백 시: 승인 앱 롤백 → `fl` 무시·구판 결재선 규칙 복귀(워크포스는 계속 넘김) / 워크포스 롤백 → 신판 `fl` 은 보존(신판 `issueSettingPlan` 유지), **구판 writer 는 `fl` 을 떨어뜨리므로** 롤백 중 승인 설정 저장을 중단하는 운영 절차 필요(코덱스 P1 잔여).
