# 상용 전 관문 체크리스트 (RELEASE_GATE)

> 작성 2026-10-22. 흩어진 `_workspace/*/04_spike_todo.md`·PROGRESS·대화에서 **아직 안 끝난 것만** 모았다.
> 끝나면 이 파일의 상태 칸만 고친다(원본 spike_todo 는 그대로). 승인 앱 dev 버전 6.5.0 기준(2026-10-27).
> 상태: ☐ 미완 · ◐ 부분 · ☑ 완료 · ✕ 안 함(사유)

## A. 지금 처리할 것 (코드·저장소)

| # | 항목 | 담당 | 상태 | 메모 |
|---|---|---|---|---|
| A1 | 워크포스 승인 설정 표 UI 미커밋분 커밋·develop 푸시 | Claude | ☑ | `c4f0ac7` → origin/develop. `docs/external-api/README.md` 보강분은 커밋 안 함(사용자 관리) |
| A2 | 승인 앱 `origin/master` 오푸시(`cba7826..1d06b65`) 되돌릴지 | 사용자 결정 | ☑ | 2026-10-27 사용자 "권고대로" → `git push origin cba7826:master --force-with-lease=master:1d06b65` 실행, origin/master = `cba7826`. 떨어진 두 커밋은 develop 에 있음 |
| A3 | 내 이력 탭 페이지가 limit 보다 짧게 끝남(중복 제거가 스캔 뒤) | Claude | ☑ | `5c009e9` — 중복 제거를 창마다로 이동 + 경계 테스트. Codex 검토 결함 0 |
| A4 | 업무함 표 완료 건의 "Jira 적용 상태: Jira 적용 확인" 노출 | Claude | ☑ | `5c009e9` — `compactApplyKey` 로 통일(실패·불명확·진행만 표시) |
| A5 | Sentry 프로젝트 등록 → Forge 환경 변수 `SENTRY_DSN`(dev·staging·prod) | 사용자 | ☐ | `scripts/ci/forge-sentry-dsn.sh` 가 파이프라인에서 넣는다 |
| A6 | egress 좁힌 뒤(워크포스 app id 호스트 dev·prod) 채널 연결 재실측 | Claude | ☑ | 2026-10-26 dev 설정 > 워크포스 "Test connection" 1,477ms · 워크포스 10.7.0 응답, 마지막 성공 호출 11:29. 워크로그 저장 경유는 미실측 |
| A7 | 적용 프로젝트·감사 페이지 UI 정리 dev 눈 확인 | Claude | ☑ | 2026-10-26 확인 — 프로젝트: 검색 입력+버튼 한 줄 우측 정렬. 감사: 필터 한 줄 그리드(From·To·Actor·Requester / Project), 시각 "10/21, 15:56", 행 링크 "Related records" 하나로 접힘. 대상 셀은 3줄(종류 배지·키+링크·요약) — 허용 |
| A8 | DRAFT 잔존 시 dedupe 점유(엔진 R1) | Claude | ☑ | `2fb3c74`(2026-10-27, Codex 3회 검토) — 일일 EXPIRY 스윕 `abandonStaleDrafts`: 생성 1시간 지난 DRAFT → `commit_state='DEAD'`·dedupe `dead:{id}`·업무함 행 삭제(조건부 UPDATE, 배치 50, 유휴 SQL +1 → 예산 11). DEAD 행은 보관 정리 대상 아님(흔적만) |
| A9 | 미사용 잔존물 정리 — `getWorklogPolicyCatalog`, `transition_rule`·`workforce_publish` 테이블 | Claude | ☑ | `2fb3c74` "미사용" 주석(DDL 헤더·컨트롤러·PermissionMap). DROP 은 major 라 상용 뒤 |
| A10 | 앱 내 알림 라이선스 경계(D4 — standalone-worklog 보고서 발견) | Claude | ☑ | `2fb3c74` — `ApprovalRepository` 의 직접 INSERT 두 곳(REQUESTED·선행 요청 EXPIRED)에 `notificationAllowed`(=`shouldEmitNotifications`) 주입. 트리거·큐 소비자 경로가 비활성 라이선스에서 알림을 만들던 구멍 |
| A11 | 채널 전환 때 남은 죽은 import(`WORKFORCE_ORIGIN_PROPERTY`, 통제 워커 `ORIGIN_KEYS` 에 undefined) | Claude | ☑ | `6818bfc` — `forge deploy` webpack ⚠ 로 발견. dev 6.5.0 배포 출력에 경고 없음 |

## B. 플랫폼 실측 — 상용 배포 전 필수 (P0)

| # | 출처 | 항목 | 방법 | 실패 시 | 상태 |
|---|---|---|---|---|---|
| B1 | 채널 S1 | **production webtrigger URL 도메인** — egress 선언·`peerUrl` 정규식이 맞는지 | 두 앱 production 배포 → `webTrigger.getUrl` 값(스파이크 앱으로 먼저 가능) | 도메인에 맞춰 egress·정규식 수정 | ☐ |
| B2 | 채널 S3 | webtrigger `context.license` 유무·형태 | staging 유료 설치에서 sys.ping 로그 | 마지막 resolver 호출의 라이선스 판정을 KVS 에 두고 채널이 읽기 | ☐ |
| B3 | 채널 S2b | 권한 없는 **활성** 계정의 asApp `user/permission/search` → `[]` 인가 | 프로젝트 권한 없는 활성 계정(chanho9611, Member 세트)으로 호출 | 코드 매핑만 조정(판정은 fail-close 유지) | ☐ 사용자 "나중에" |
| B4 | 채널 S13 | 고객이 major 동의 전 구판에 머무는 구간의 동작·문구 | staging 한쪽만 신판 | 배너·"연결 필요" 동작 조정 | ☐ |
| B5 | 채널 S7 | **재설치(uninstall→install)** 뒤 webtrigger URL 유지 여부 | 스파이크 재설치 | 재설치 시 자동 REVOKED + 재연결 안내 | ☐ (업그레이드는 통과) |
| B6 | 채널 S15 | egress 호스트를 정확히 적은 뒤 배포·설치 통과 | 2026-10-22 egress 변경 배포 = A6 과 같이 | — | ☑ dev(6.3.0) 배포·채널 호출 정상. production 호스트는 B1 과 함께 |
| B7 | 상태 변경 K1 | `kvs.transact` 다중 조건부 set(최대 11) 원자성·op 한도 | 스파이크 또는 임시 진단: 11 op 중 1개 gen 틀리게 → 전부 미적용인지, 26 op 한도 | `INDEX_WRITE_MODE` 를 ORDERED 로 한 줄 변경 | ☐ |
| B8 | 상태 변경 K2 | 규칙 저장 직후 다른 컨테이너 읽기 창 | 저장 1초 안 전환 시도 → 거부/자동 요청 | 저장 응답 전 확인 읽기 | ☐ |
| B9 | 상태 변경 A2 | Automation 실행자 판별(`accountType`) | Automation 규칙으로 전환 21 → 로그 `auto NOT_HUMAN` | `humanActorOf` 수정 | ☐ |
| B10 | 상태 변경 A6 | 앱 화면을 연 적 없는 계정의 자동 적용 → `REQUESTER_IMPERSONATION_UNAVAILABLE` 안내 | 미사용 계정으로 S3→승인 | 문구 조정 | ☐ |
| B11 | 상태 변경 Q6·Q7 | consumer `InvocationError` 재전달·멱등(`ALREADY_HANDLED`) | 자연 발생 시 로그 관찰 | — | ☐ 관찰 대기 |
| B12 | 상태 변경 | team-managed 프로젝트 함수형 validator 지원 | team-managed 프로젝트 만들어 규칙 1개 → 전환 | 미지원이면 설정 화면에서 team-managed 안내 | ☐ |
| B13 | 워크로그 제어 | dev 에서 "개발 사이트, 운영 전 재확인"으로 PASS 처리한 사람 확인 3건(B 단계) | staging 에서 재확인 | — | ☐ |

## C. 플랫폼 실측 — 문구·상한 조정 (P1)

| # | 출처 | 항목 | 상태 |
|---|---|---|---|
| C1 | 채널 S2c | `permission/search` 콤마 목록 = "모두 가짐"인지(write.judge 호출 1 vs 3) | ☐ |
| C2 | 채널 S6 | 호출 한도·동시성·응답 크기·콜드 P95 | ☐ |
| C3 | 채널 S16 | 채널 안 중첩 호출(write.judge → link.resolve) 지연이 8초 안 | ☐ |
| C4 | 채널 S17 | webtrigger 안 `getAppContext()` 값(넘김 링크) | ☐ |
| C5 | 채널 S18 | `kvs.deleteSecret`·`deleteUrl` 뒤 `getUrl(key,true)` 순서 | ☐ |
| C6 | 상태 변경 A3 | 콜드에서 validator `auto LATE` 빈도(Q2 실측 2962ms, 여유 작음) | ☐ 관찰 |
| C7 | period-lock P1~P3 | timeTrackingProvider 선택 후 REST·자동화·모바일 경로 차단 여부, `issueAction`·`issueActivity` 의 `timeTrackingProviderEnabled` 조건 | ☐ (가정 "못 막음"이라 설계 영향 없음, 수용 기준 문서만) |

## D. 사용자 결정 대기

| # | 항목 | 권고 |
|---|---|---|
| D1 | ~~A2 origin/master 되돌리기~~ | 2026-10-27 되돌림 완료(A2) |
| D2 | ~~워크포스 F1~~ | **2026-10-28 결정**: ⓐ·ⓑ 대신 "워크포스는 승인 여부와 무관하게 연동 워크로그를 앱 자격으로 읽고 자기 권한 모델로 보여 준다, 승인 앱은 상태 사실만". 워크포스 설계 `moves-workforce/_workspace/rfc220-review/04_fix_design.md`, 승인 앱 몫 = `cert.query` BADGE R2 제거 `d9e5351`(Codex 결함 없음, dev 6.7.0, 배포 출력 ⚠ 없음). 워크포스 몫 진행 중 |
| D3 | ~~워크포스 F2·F3 수정 여부~~ | 2026-10-28 "응" → F1 과 함께 수정 진행 중. A5 Sentry 는 사용자가 직접(보류) |
| D4 | 백로그 — admin NEEDS_APPROVER 목록, ~~알림 라이선스 검사~~(A10 완료), validator 누락 감지 | 나머지 둘은 후속 |

## F. 전수 점검(2026-10-28, `full-audit-2026-10-28/REVIEW.md`) 처리 현황

> **2026-10-28 16:40 중단 시점**: 아래 전부 **작업 트리에만 있고 미커밋**(develop 마지막은 `d9e5351`). 워크포스 asApp 전환(`moves-workforce/_workspace/rfc220-review/05_fix_report.md`)도 미커밋. 재개 절차는 옵시디언 노트 `2026-10-28-full-audit-fixes-and-workforce-app-read`.

| # | 우선순위 | 항목 | 상태 | 메모 |
|---|---|---|---|---|
| R05 | P1 | CONTENT_CHANGED 만료 거절 | ☑ | `expireByTargetChange` 허용 사유 추가, 전용 전이와 결과 동일 테스트 |
| R10 | P1 | SQL 장애가 validator 통과 | ☑ | `tableState` READY·MISSING·UNAVAILABLE, UNAVAILABLE → REJECT_UNAVAILABLE |
| R12 | P1 | 일부 그룹 명부로 전원 승인 | ☑ | 끝까지 읽은 명부만, 빈 중간 페이지·상한도 미확정(Codex P2 반영) |
| R09 | P1 | 채널 라이선스 계약 불일치 | ☑ | 공통 `getLicenseDecision`, 2초 상한(Codex P2). B2(webtrigger license 실측)는 그대로 미완 |
| R01~R04 | P1·P2 | 승인 엔진 정합성 | ◐ | 구현 완료(Codex 2회 반영, "단순 규칙" 정리, 한계 8항 — `engine-fix-report.md` 최종 절). EngineConsistency 42건, BE 3,150 통과. **Codex 3차(최종) 검토가 메모리 부족으로 중단 → 재실행 뒤 커밋**. TiDB 상관 서브쿼리 3종 dev 실측 필요 |
| R06 | P2 | 다음 단계 알림 없음 | ☑ | `STEP_OPENED`(결정 주체 기준, Codex P2 반영) |
| R07 | P1 | 통제 증분 200건 경계 | ☑ | keyset 커서 + since/until 고정 + reevaluate 200개씩(Codex P2 2건 반영). dev 실측(200건 이상) 미완 |
| R08 | P1 | 결재선 저장 실패 → 전체 확대 | ☑ | 넣고 지우기 + rev 결속(Codex P2 반영), 단계 교체 전 검토 표식. `INSERT … SELECT … ON DUPLICATE KEY` TiDB 미실측 |
| R11 | P2 | 권한 장애 = 빈 업무함 | ☑ | `incomplete` + 커서 고정 + 배너(`inbox.list.incomplete`) |
| D01 | — | 의존성 보안 | ◐ | BE 0건. UI 패치 가능분 적용, **보류**: js-yaml(@mdxeditor/editor 4.x)·linkify-it·prosemirror-view(@forge/bridge 7.x)·uuid(exceljs 3.x) — major 교체는 UI 회귀 검증과 함께 별도 |
| D02 | — | 일괄 승인 마감 없음 | ☑ | 20초 전체 마감(가장 오래 걸린 한 건 여유, PIN 포함) → `remaining`(UI 기존 표시) |
| D03 | — | KVS 읽기-수정-쓰기 | ◐ | 완화만(세대 역행 재쓰기·표식 조건부 삭제). 완전한 CAS 는 커스텀 엔티티 전환(manifest) — 상용 뒤 |
| 제안 1~7 | — | 문제 처리함·보호 적용 상태·부분 실패 UX·실브라우저 검증 등 | ☐ | 후속(D4 백로그와 합침) |

## E. 상용 배포 절차 (순서)

1. B1·B2·B6 실측(스파이크·staging) → egress·정규식 확정.
2. 두 앱 staging 배포(파이프라인 수동 버튼) → 페어링 → 워크로그 저장·결재·상태 변경 E2E 1회씩.
3. A5 Sentry DSN 세 환경.
4. 마켓플레이스 문서 묶음 `scripts/package-marketplace-docs.cjs`.
5. master 로 병합 → production 배포 수동 버튼. major 면 고객 재동의 안내(S13 문구).
