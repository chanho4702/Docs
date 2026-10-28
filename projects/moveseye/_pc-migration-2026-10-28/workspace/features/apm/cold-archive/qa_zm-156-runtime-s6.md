# ZM-156 콜드 아카이브 — S6 런타임 실측 (2026-10-28)

- 환경: dev BE :3000(master `21358d8`, dev70 프로필 · 5433 DB), Windows 로컬 디스크. `ARCHIVE_ALLOWED_ROOTS` = 세션 scratchpad `archive-root`(래퍼 `run_be_3000_archive.ps1`).
- 방법: API + DB 조회 스크립트(scratchpad `rt_arch_*.py`). "오늘 지워질 날"을 만들려고 `apm_retention` 옵션 `traceSummaryDays`를 잠시 6→3→1로 줄였고 끝난 뒤 키를 지워 기본값(7)으로 되돌렸다. 보류 기한은 `apm_archive_hold.first_held_at`을 8일 앞당겨 재현했다.
- 데이터 영향: 트레이스 요약 10-21(1,299행)은 ZIP에 보관된 뒤 DROP, 10-22~10-26은 0행 파티션이라 손실 없음.

## 결과

| # | 항목 | 결과 |
|---|---|---|
| 1 | 경로 규칙 | `[R1]` 상대 경로·`[R2]` `..`·`[R3]` 허용 루트 밖·`[R5]` `${` 거부, 허용 루트 안은 `created/writable/atomicMove=true`, `mountedVolume=null`(윈도우) ✅ |
| 2 | 켜기 전제 | basePath 없이 켜기·대상 없음·모르는 데이터셋 → `ARCHIVE_SETTING_INVALID`, 밖 경로 저장 → `ARCHIVE_PATH_INVALID`+PathCheckResult ✅ |
| 3 | **게이트 거부** | 보관 실패(`NO_SPACE`, 최소 여유 10000GB로 유도) → 회차 `failed` + 원장 FAILED → 보존 정리가 10-21 파티션을 **지우지 않고** 보류(`NOT_ARCHIVED`) ✅ |
| 4 | 보류 표시·알람 | 상태 `holds.count=1`·`expiresInDays=8`·`lastFailure*`, 배너 `HOLDS_PENDING`, `recentFailures` ✅ · `ARCHIVE_HOLD` 알람 다음 평가(5분)에 발화(value 1) ✅ |
| 5 | **다음 회차 보관 → DROP** | 여유 조건 복구 → 10-21 OK(1,299행) → 보존 정리가 DROP, 보류 `ARCHIVED`로 닫힘 ✅ |
| 6 | ZIP 내용 | `data/apm_trace_summary.csv.gz`·`checksums.txt`·`manifest.json`, CSV 1,299행 = DB 1,299행, manifest `counts`·`period`(Asia/Seoul)·`atomicMove=true`, 다운로드 SHA = 원장 SHA, verify ok ✅ |
| 7 | **보류 기한 만료** | `maxHoldDays=0`이면 8일째도 보존(`expiresInDays=null`), 7로 바꾸면 `expiresInDays=0` → 다음 정리에서 DROP + 원장 `HOLD_EXPIRED`(사유 문장 포함), 보류 `HOLD_EXPIRED`로 닫힘 ✅ |
| 8 | **크래시 정리** | 실행 행 없는 2시간 전 `.partial` 삭제 · 2시간 전 RUNNING 행의 `.partial` 삭제 + 행 `FAILED/ABANDONED` · 방금 만든 `.partial`과 이름 규칙 밖 파일은 유지 ✅ |
| 9 | 동시 실행(한 노드) | 실행 요청 3건 동시 → 1건 실행·2건 "이미 실행 중" skip, OK 중복 0·RUNNING 잔여 0 ✅ (backfill all로 metric1h 50일 137,330행 17초) |
| 10 | 삭제 | 사유 공백 `ARCHIVE_REASON_REQUIRED`, 삭제 시 파일 제거·행 DELETED, 삭제된 행 다운로드 `ARCHIVE_FILE_MISSING`, bulk에서 이미 삭제된 id는 `skipped`, 없는 id `ARCHIVE_NOT_FOUND` ✅ |
| 11 | 원장 경로 조작 | file_path를 `C:\Windows\win.ini`로 바꾸면 verify·download 모두 `ARCHIVE_FILE_REJECTED`, 대상 파일 무손상 ✅ · 디스크 파일 없음은 verify `ok:false, fileExists:false` |
| 12 | 끄기 | 열린 보류 → `DISABLED`로 닫힘, 상태 holds 0, 다음 정리는 예전처럼 DROP ✅ · 알람은 다음 평가에서 `ORPHANED`로 해소 |

## 발견

1. 🟡 **APM 설정 감사 로그 `user=null`** — `ApmArchiveController.update`가 `currentUser.getUsername()`을 쓰는데 JWT에 username 클레임이 없어 항상 null(`ActorResolver` javadoc의 기지 원인). 공통 설정(`[ARCHIVE] action=settings user=admin`)·다운로드·삭제(`admin(id=110)`)는 `ActorResolver`를 거쳐 정상. 같은 패턴 21파일 — APM 수신 토큰 `created_by`도 DB에 비어 있음. **콜드 아카이브 밖 공통 결함**이라 별도 처리.
2. 🟢 계약 문구: §2.6 `[R5]`는 "따옴표"라 적었지만 구현은 큰따옴표만 막는다(작은따옴표 경로 허용, 오류 문구도 "큰따옴표"). 문서 정정 대상.
3. 🟢 계약 §4 `ARCHIVE_FILE_MISSING`이 "다운로드·검사 대상 파일 없음"이라 적었지만 verify는 디스크 파일이 없을 때 오류가 아니라 `ok:false, fileExists:false`로 준다(상태가 DELETED인 행 다운로드는 `ARCHIVE_FILE_MISSING`). 문서 정정 대상.

## 미실측

- NFS 원자적 이동·컨테이너 볼륨 판정(`mountedVolume`) — 윈도우 로컬이라 재현 불가. 리눅스 컨테이너 배포본에서 확인 필요.
- 다중 노드(BE 2대) 겹침 — 한 노드 동시 실행만 확인. 노드 간은 PG advisory lock·부분 유니크 인덱스에 맡김.
- 켜진 상태에서 보류 0으로 내려갈 때의 정상 해소(이번엔 끈 뒤라 `ORPHANED`로 해소).
- 1m·스팬 용량(`ARCHIVE_TO_DB_RATIO` 0.1 교체 근거) — dev 규모가 작아(1m 하루 11만 행) 의미 있는 수치가 아님.
