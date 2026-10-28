---
type: project
tags: [moveseye, apm, runtime-qa, cold-archive, zm-155, zm-156, audit, actor, archunit, cleanup]
created: 2026-10-28
updated: 2026-10-28
status: done
---

# 2026-10-28 — 미뤄 둔 실측 소진(ZM-155·콜드 아카이브 S6) + 감사 행위자 이름 null 수정

- 프로젝트: [[moveseye]] · 기능 지도 [[apm-수집과-운영]] · 관련 [[2026-10-19-zm155-apm-custom-metric-allowlist]] · [[2026-10-02-zm156-apm-cold-archive]]
- 상태: 실측 2건 통과(문서화), 행위자 수정 master `df1b39f`(#ZM-156 [FIX], **미푸시**), ZM-114 정리 완료.

## 1. ZM-114 워크트리 정리
BE `3cc08ea`·FE `ba018f0`이 이미 master에 같은 내용으로 있음을 확인하고 `C:/worktrees/zm-114-be`·`-fe`와 로컬 브랜치 삭제. 🔴 지우기 전에 다른 워크트리의 node_modules 정션이 이 폴더를 가리키는지 확인(메모리 `worktree-remove-junction-node-modules`) — zm-114-fe는 실물 node_modules였다.

## 2. ZM-155 커스텀 지표 런타임 실측 — 통과
정본: [contract_apm-metric-allowlist §11](../agent-documents/sources/solutions/_workspace/features/apm/metric-allowlist/solutions--contract_apm-metric-allowlist.md)
- 규칙 전 폐기 표 `registrable` · 거부 코드(BUILTIN·RESERVED·NOT_OBSERVED·TRUNCATED·INVALID) · 중복 409 · COUNTER 단위 `1`, GAUGE `ms` avg/min/max · 0.2 증가분 보존(`count=0,sum=0.2,observed=true`) · 단위 바뀜은 `CUSTOM_UNIT_MISMATCH`로 폐기 · enable/disable/clear-warning 멱등.
- 함정: `jvm.memory.used`는 내장 허용목록이라 RESERVED가 아니라 BUILTIN이 먼저 나온다 → RESERVED는 `jvm.rt.custom`으로.
- 미실측: L5 접힘·L8 경고·다중 노드 전파·fail-closed.

## 3. 콜드 아카이브 S6 런타임 실측 — 통과
정본: [qa_zm-156-runtime-s6](../agent-documents/sources/solutions/_workspace/features/apm/cold-archive/solutions--qa_zm-156-runtime-s6.md)
- 게이트 거부(최소 여유 10000GB로 `NO_SPACE` 유도) → 보류·배너·`ARCHIVE_HOLD` 알람 → 다음 회차 보관 → DROP·보류 ARCHIVED 해소 · ZIP 1,299행 = DB · 보류 기한(0=무기한, 7 → `HOLD_EXPIRED`) · 크래시 `.partial` 정리 · 동시 3건 중 1건만 실행 · 삭제·경로 조작 거절 · 끄기 시 보류 DISABLED.
- 재현법: "오늘 지워질 날"은 `apm_retention` 옵션 `traceSummaryDays`를 잠시 줄여 만들고, 보류 기한은 `first_held_at`을 앞당겼다. `apm_retention`은 `logSuccess=false`라 완료를 BE 로그 줄로 감지.
- 🔴 실측하려면 BE를 `ARCHIVE_ALLOWED_ROOTS`를 넣어 띄워야 한다(없으면 `configured=false`).
- 미실측: NFS 원자 이동·컨테이너 볼륨·BE 2대 겹침·1m/스팬 용량.

## 4. 발견 → 수정: 감사 기록의 행위자 이름이 항상 null
- 원인: 액세스 토큰 JWT에 username 클레임이 없어 `TokenUserInfo.getUsername()`이 거의 언제나 null. 7월에 만든 `ActorResolver`(id → 사용자 표 조회)를 안 쓰고 직접 꺼낸 곳이 **APM 9군데**(아카이브 설정·수신/RUM 토큰 발급자·수집 설정·수집기·서비스·커스텀 규칙·합성 감시·내보내기 로그).
- 처음 "21개 파일"이라고 보고했다가 정정 — 검색에 로그인 처리·응답 DTO·Zabbix 요청 필드의 다른 `getUsername()`이 섞였다.
- 수정: 9군데 `actorResolver.resolve(currentUser)` + ArchUnit `ActorNameArchTest`(`TokenUserInfo.getUsername()`은 ActorResolver만, 예외는 이름을 기록하지 않는 캐시·키 폴백 3메서드를 **메서드 단위**로).
- 실측: 수신 토큰 발급 → `created_by=admin`(수정 전 행은 `<null>` 그대로 — 소급 불가).
- 덤: `ApmExportIT` 2건은 수정 전 master에서도 실패(기존 문제, 따로 안 봄).

## 교훈
- 공통 결함은 실측 중 **옆 기능의 로그**에서 드러난다 — 콜드 아카이브 공통 설정 로그는 `user=admin`인데 APM 설정 로그만 `user=null`이었다.
- "N개 파일"은 grep 줄 수가 아니라 **같은 타입의 같은 메서드**를 센 뒤에 말한다. ArchUnit 규칙을 먼저 돌려 보면 정확한 목록이 나온다.
- 시스템이 메모리 부족으로 BE·백그라운드 작업을 멈추면 묻기 전에 다시 띄우지 않는다.
