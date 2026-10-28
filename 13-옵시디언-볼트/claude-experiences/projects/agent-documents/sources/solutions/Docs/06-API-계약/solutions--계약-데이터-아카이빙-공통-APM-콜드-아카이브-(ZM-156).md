# 계약 — 데이터 아카이빙 공통 + APM 콜드 아카이브 (ZM-156)

- 작성일: 2026-10-01 · 갱신 2026-10-02 · 상태: ✅ **BE·FE 모두 master 병합(BE `3637c77`·FE `2ed84f7`, 미푸시). 코덱스 BE v5·FE v3 승인. dev BE(:3000) 재기동으로 V69 적용·EP 14개 등록 확인(2026-10-02, 무로그인 범위). 설정 켜기 이후 흐름은 로그인 필요 — 미실측**
- 🆕 **v1.1(코덱스 v1 반영)의 FE 영향은 맨 아래 §9** — `RUNNING` 상태·삭제 결과 `rejected[]`·`ARCHIVE_FILE_REJECTED`·삭제/검사의 락 대기·manifest `csvFormulaGuard:false`·손상 설정 경고
- 설계: [`designs/devdesign_apm-cold-archive.md`](../02-%EC%84%A4%EA%B3%84/%EC%84%A4%EA%B3%84-APM-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-%EB%B3%B4%EC%A1%B4-%EB%A7%8C%EB%A3%8C-%EC%A0%84%EC%97%90-%ED%8C%8C%EC%9D%BC%EB%A1%9C-%EB%B3%B4%EA%B4%80-%28ZM-156%29.md)(§10 결정 7개 반영) · 공통 기반 원설계 [`designs/devdesign_data-archiving.md`](../02-%EC%84%A4%EA%B3%84/%EC%84%A4%EA%B3%84-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B9%99-%28%EA%B0%90%EC%82%AC-%EA%B7%9C%EC%A0%9C-%EB%8C%80%EB%B9%84-%EC%9E%A5%EA%B8%B0-%EB%B3%B4%EA%B4%80%29.md)
- BE 보고: [`reports/zm-156_be-cold-archive.md`](../09-%EB%B3%B4%EA%B3%A0%EC%84%9C/ZM-156-BE-%EA%B5%AC%ED%98%84-%EB%B3%B4%EA%B3%A0-APM-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-%28S1-S2-S3-S5-%EC%98%B5%ED%8A%B8%EC%9D%B8%29.md) · 검수 인계: [`reviews/review_zm-156-be-cold-archive.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-APM-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-BE-%28ZM-156-S1-S2-S3-S5-%EC%98%B5%ED%8A%B8%EC%9D%B8%29.md)
- 🔴 **권한: 전 EP 관리자 전용**(userRole ADMIN ∪ SUPER_ADMIN). 거부는 **HTTP 200 + body `code:403` + `errorCode:"FORBIDDEN"`** + 한국어 메시지(리포트 관리와 같은 모양)
- 라이선스: 공통 `/archives/*`는 **premium 밖**(라이선스 무관 — 만든 파일을 받고 정리하는 길은 막지 않는다). APM 전용 `/archives/sources/apm/*`만 `Feature.APM`
- 헤더 `x-visitor-id` 필수(`@VisitorIdCheck`), 인증 쿠키(`withCredentials`). 응답은 평소 envelope(`{status, code, data}`), 다운로드만 파일 본문
- 시각 표기: 원장·상태의 시각은 **epoch ms(Long)**, 날짜(데이터 날짜)는 **`yyyy-MM-dd` 문자열**(서버 기본 시간대의 하루 — 파티션과 같은 축). ⚠️ `archiveJob`·`retentionJob`은 기존 스케줄러 DTO를 그대로 실어 그 안의 시각만 `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'` 문자열이다(설정 › 스케줄러와 같은 형식)

---

## 0. 화면 전제 — 무엇이 어디서 켜지나

| 스위치·값 | 어디 | 기본 | 비고 |
|---|---|---|---|
| **허용 루트** | 서버 환경변수 `ARCHIVE_ALLOWED_ROOTS` | 비어 있음 | 🔴 비면 기능 자체가 켜지지 않는다(Q7). **화면에서 고칠 수 없다** → `configured:false`면 입력을 막고 "운영자 조치 필요" 안내 |
| **아카이브 경로(basePath)** | `PUT /archives/settings` | 없음 | 허용 루트 아래만. 저장 시 실제로 써 보는 검사를 통과해야 한다. APM 파일은 `{basePath}/apm/{dataset}/{yyyy}/{MM}/` |
| **APM 기능 스위치(`enabled`)** | `PUT /archives/sources/apm/settings` | `false` | 🔴 이게 유일한 기능 스위치다. 켜려면 허용 루트·basePath·경로 검사 통과 필요 |
| 배치 실행 시각 | 설정 › 스케줄러(`apm_archive`, 매일 00:50) | 스케줄러 쪽은 **켜짐** | 기능이 꺼져 있으면 배치는 `skipped: disabled`로 끝난다. ⚠️ 기능을 켠 채 스케줄러에서 배치를 끄면 보관이 멈추고 보류가 쌓인다 → 상태 EP가 경고 배너를 준다 |
| 리드 일수·실행 예산 | 설정 › 스케줄러 `apm_archive` 옵션 `leadDays`(2)·`maxRunMinutes`(20)·`fetchSize` | | 튜닝 값. 서버가 읽을 때 범위로 자른다(leadDays 1~min(보존)-1, maxRunMinutes 1~25) |

**"DROP 게이트"(이 기능의 존재 이유)**: 기능이 켜져 있으면 보존 정리(01:30)는 **보관되지 않은 날을 지우지 않고 보류**한다. 보류는 첫날부터 상태 EP의 `holds`와 APM 알람 `ARCHIVE_HOLD`로 드러나고, `maxHoldDays`(기본 7)를 넘기면 보관 없이 지우되 원장에 `HOLD_EXPIRED`를 남긴다(0 = 무기한 보류). 꺼져 있으면 보존 정리는 예전과 똑같다.

---

## 1. EP 요약

| 메서드 | 경로 | 응답 `data` | 용도 |
|---|---|---|---|
| GET | `/archives` | `{items: ArchiveFileDto[], total}` | 원장 목록(소스·데이터셋·상태·날짜 필터, 페이지) |
| GET | `/archives/{id}` | `ArchiveFileDto`(+`manifest`) | 상세 |
| GET | `/archives/{id}/download` | 🔴 **ZIP 본문**(성공) / JSON envelope(실패) | 다운로드(감사 로그) |
| DELETE | `/archives/{id}` | `ArchiveDeleteResult` | 삭제 — 🔴 사유 필수, 행은 남는다 |
| POST | `/archives/delete-bulk` | `ArchiveDeleteResult` | 선택 삭제(최대 500) |
| POST | `/archives/{id}/verify` | `VerifyResult` | 무결성 검사(SHA-256 재계산 — 행 단위 버튼에서만) |
| GET | `/archives/settings` | `ArchiveSettingsDto` | 공통 설정(허용 루트·경로·여유 공간) |
| PUT | `/archives/settings` | `ArchiveSettingsDto` | 공통 설정 저장(경로 검증 통과해야 저장) |
| POST | `/archives/path-check` | `PathCheckResult` | "연결 테스트"(저장 안 함, 오류도 결과로) |
| GET | `/archives/sources/apm/settings` | `ApmArchiveSettingsDto` | APM 대상 탭(데이터셋·보존·예상 용량·경고) |
| PUT | `/archives/sources/apm/settings` | `ApmArchiveSettingsDto` | APM 설정 저장(부분 수정) |
| GET | `/archives/sources/apm/status` | `ApmArchiveStatusDto` | 상태 카드(보류·다음 실행·사용량·실패·배너) |
| GET | `/archives/sources/apm/holds` | `HoldItem[]` | 보류 목록 |
| POST | `/archives/sources/apm/run` | `{accepted: true}` | 지금 한 번 실행(비동기) |

---

## 2. 공통 EP — `/archives`

### 2.1 `GET /archives` — 목록

| 쿼리 | 타입 | 기본 | 설명 |
|---|---|---|---|
| `source` | `APM` \| `ZABBIX` | 전체 | 대소문자 무시 |
| `dataset` | string | 전체 | `metric1h`·`traceSummary`·`sloSnapshot`·`metric1m`·`span` |
| `status` | string | — | 주면 그 상태만(DELETED 포함 가능). 안 주면 `includeDeleted`가 정한다 |
| `includeDeleted` | boolean | `false` | 🔴 기본은 DELETED 제외("삭제된 항목 표시" 토글) |
| `from` / `to` | `yyyy-MM-dd` | — | `periodDay` 범위(양끝 포함). 형식 오류는 `ARCHIVE_SETTING_INVALID` |
| `page` | int | 1 | 1부터 |
| `limit` | int | 50 | 최대 200 |

정렬: `periodDay` 내림차순 → 같은 날은 최신 행 먼저.

**`ArchiveFileDto`**

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | long | 원장 id |
| `source` | string | `APM`(이번) · `ZABBIX`(I7 예정) |
| `dataset` | string | 데이터셋 키 |
| `periodDay` | string\|null | 데이터 날짜 `yyyy-MM-dd`(서버 기본 시간대) |
| `periodStart` / `periodEnd` | long(ms) | 그 하루의 시작·끝 |
| `status` | string | `RUNNING` \| `OK` \| `SUPERSEDED` \| `DELETED` \| `FAILED` \| `SOURCE_EXPIRED` \| `HOLD_EXPIRED` (아래 표) |
| `fileName` | string\|null | 파일 이름(재생성이면 `-r2` 등이 붙을 수 있다) |
| `absolutePath` | string\|null | 절대 경로 — 🔴 **복사 버튼은 이것** |
| `relativePath` | string\|null | 현재 basePath 기준 상대 경로 — 표에는 이것(밖이면 절대 경로와 같다) |
| `fileExists` | boolean\|null | 🔴 파일이 있어야 하는 행(OK·SUPERSEDED)만 실제 확인값, 그 밖은 null. false면 "파일 없음" 배지 + 다운로드 비활성 |
| `bytes` | long | ZIP 크기 |
| `sourceRows` | long | 내보낸 행 수 |
| `sha256` | string\|null | ZIP SHA-256 |
| `failReason` | string\|null | FAILED 사유 코드: `NO_SPACE` · `VERIFY_MISMATCH` · `WRITE_ERROR` · `SOURCE_ERROR` · `ABANDONED`(크래시) |
| `failDetail` | string\|null | 실패·SOURCE_EXPIRED·HOLD_EXPIRED 설명(사람이 읽는 문장) |
| `deletedAt` / `deletedBy` / `deleteReason` | long\|string | 🔴 DELETED 행의 누가·언제·왜(툴팁). 보관 기간 정책 삭제는 사유 `RETENTION_EXPIRED`(이번 범위 밖) |
| `createdAt` | long(ms) | 행 생성 시각 |
| `manifest` | object\|null | 상세(`GET /archives/{id}`)에서만. ZIP 안 `manifest.json`과 같은 내용 + `files[]`·`fileSha256`·`atomicMove` |

**상태 표**

| status | 파일 | 화면 |
|---|---|---|
| `RUNNING` | 만드는 중(partial) | 🆕 회색 "진행 중" — 다운로드·삭제 대상 아님(`fileExists:null`). 크래시로 남으면 다음 회차가 `FAILED`(`ABANDONED`)로 정리 |
| `OK` | 있음 | 정상(다운로드·검사) |
| `SUPERSEDED` | 있음 | 같은 날 재생성으로 밀려난 옛 파일(덮어쓰지 않는다) — 회색 |
| `DELETED` | 없음 | 회색 "삭제됨" 배지 + 삭제자·일시·사유 |
| `FAILED` | 없음 | 빨강 — `failReason`·`failDetail` |
| `SOURCE_EXPIRED` | 없음 | 회색 "원본이 이미 사라짐"(켜기 전에 지워졌다 등). 재시도 안 함 |
| `HOLD_EXPIRED` | 없음 | 🔴 주황 "보관 없이 삭제됨" — 보관 실패가 보류 기한을 넘겼다 |

예시

```json
GET /archives?source=APM&dataset=metric1h&limit=2
{ "status": "success", "code": 200, "data": {
  "items": [
    { "id": 41, "source": "APM", "dataset": "metric1h", "periodDay": "2025-08-26",
      "periodStart": 1756166400000, "periodEnd": 1756252800000, "status": "OK",
      "fileName": "moveseye-apm_metric1h_2025-08-26.zip",
      "absolutePath": "/data/archive/store/apm/metric1h/2025/08/moveseye-apm_metric1h_2025-08-26.zip",
      "relativePath": "apm/metric1h/2025/08/moveseye-apm_metric1h_2025-08-26.zip",
      "fileExists": true, "bytes": 3145728, "sourceRows": 78012, "sha256": "9f2c…",
      "failReason": null, "failDetail": null, "deletedAt": null, "deletedBy": null, "deleteReason": null,
      "createdAt": 1759276212000, "manifest": null } ],
  "total": 1 } }
```

### 2.2 `GET /archives/{id}/download`

- 성공: HTTP 200, `Content-Type: application/zip`, `Content-Disposition: attachment; filename="…zip"`, `Content-Length`.
- 본문 전 실패(HTTP 200 + JSON envelope): `ARCHIVE_NOT_FOUND`(404) · `ARCHIVE_FILE_MISSING`(404 — OK가 아닌 행이거나 디스크에 없음) · 🆕 `ARCHIVE_FILE_REJECTED`(400 — 원장 경로가 관리 대상 아님) · `FORBIDDEN`(403).
- 🔴 FE는 ZM-154와 같은 패턴: `responseType: "blob"` → `blob.type`이 `application/json`이면 envelope로 파싱해 오류 처리. `window.open`/`<a href>` 금지(`x-visitor-id`를 못 싣는다). 파일명은 목록의 `fileName`을 쓴다.

### 2.3 삭제 — `DELETE /archives/{id}` · `POST /archives/delete-bulk`

```json
DELETE /archives/41      body: { "reason": "디스크 확보" }
POST /archives/delete-bulk  body: { "ids": [41, 42], "reason": "보관 기간 지남" }
→ { "data": { "deleted": 2, "skipped": [], "fileDeleteFailed": [], "rejected": [] } }
```

- 🔴 `reason` 필수(앞뒤 공백 제거 후 1~255자). 빈 값 → `ARCHIVE_REASON_REQUIRED`(400). 삭제 모달은 대상 날짜·개수·총 용량을 문장으로 다시 보여 주고 확인받는다(기반 §7).
- 대상은 `OK`·`SUPERSEDED`뿐. 그 밖(이미 DELETED·FAILED 등)은 `skipped`.
- `fileDeleteFailed`: 행은 DELETED가 됐지만 파일을 못 지웠다(권한 등) → "운영자가 직접 지워야 합니다" 안내.
- 🆕 `rejected`: 원장 경로가 관리 대상이 아니라(허용 루트 밖·심볼릭 링크·이름 규칙 위반) **아무것도 하지 않은** id — 원장 상태 그대로. "파일 경로가 올바르지 않아 삭제하지 않았습니다 — 관리자에게 문의" 안내(감사 로그에 남는다).
- 🆕 삭제는 같은 날짜의 보존 정리 DROP·아카이브 게시가 진행 중이면 **그것이 끝날 때까지 기다린다**(보통 수 초). 요청 타임아웃을 짧게 두지 말 것(60초 이상).
- ⚠️ APM 유효본(OK)을 지우면 그날 원본이 DB에 아직 있을 경우 **보존 정리가 다시 보류**한다(게이트가 실물을 본다) — 다음 아카이브 회차가 새로 만든다.
- bulk: `ids` 비었거나 500 초과 → `ARCHIVE_SETTING_INVALID`.

### 2.4 `POST /archives/{id}/verify`

```json
→ { "data": { "ok": true, "expected": "9f2c…", "actual": "9f2c…", "fileExists": true } }
```
파일 전체를 읽는다 — 목록 조회마다 부르지 말고 행 버튼에서만.

### 2.5 공통 설정 — `GET/PUT /archives/settings`

**`ArchiveSettingsDto`**

| 필드 | 타입 | 설명 |
|---|---|---|
| `configured` | boolean | 허용 루트가 있나. 🔴 false면 화면 입력 비활성 + "운영자 조치 필요(ARCHIVE_ALLOWED_ROOTS)" |
| `allowedRoots` | string[] | 허용 루트(안내 문구용) |
| `basePath` | string\|null | 저장된 아카이브 루트(정규화된 실경로) |
| `minFreeSpaceGb` | int | 최소 여유 공간(기본 10) — 내보내기 시작 조건 |
| `fileSizeLimitMb` | int | ZIP 안 데이터 항목 하나 상한(기본 1024, 넘으면 `partNN`) |
| `archiveRetentionDays` | int | 파일 보관 일수 — **0=무기한 고정**(자동 삭제 배치는 이번 범위 밖) |
| `updatedAt` / `updatedBy` | long\|string | 마지막 저장 |

```json
PUT /archives/settings   body: { "basePath": "/data/archive/store", "minFreeSpaceGb": 10, "fileSizeLimitMb": 1024 }
```
- `basePath` 필수. `minFreeSpaceGb` 1~10000, `fileSizeLimitMb` 64~4096(생략 시 기존 값).
- 🔴 저장 전에 **규칙 + 실검사**를 돈다(§2.6). 실패 → `ARCHIVE_PATH_INVALID`, `data`에 `PathCheckResult`(화면이 그대로 보여 준다).
- 허용 루트 없음 → `ARCHIVE_NOT_CONFIGURED`.

### 2.6 `POST /archives/path-check` — 연결 테스트

```json
POST /archives/path-check  body: { "basePath": "/data/archive/store" }
→ { "data": { "ok": true, "path": "/data/archive/store", "created": false, "writable": true, "atomicMove": true,
     "usableBytes": 512000000000, "totalBytes": 1000000000000, "mountedVolume": true, "mountPoint": "/data/archive",
     "error": null, "warnings": [] } }
```

| 필드 | 설명 |
|---|---|
| `ok` | 쓸 수 있나(경고는 ok를 막지 않는다) |
| `path` | 정규화된 실경로 |
| `created` | 이번 검사가 디렉터리를 만들었나(부모는 있어야 한다) |
| `writable` | 실제로 써 보고(.probe 생성·fsync·재읽기·삭제) 성공 |
| `atomicMove` | 원자적 이동 지원. false면 경고(일부 NFS) |
| `usableBytes`/`totalBytes` | 남은/전체 공간 |
| `mountedVolume` | 🔴 컨테이너 안에서 별도 볼륨 아래인가 — `false`면 **빨간 경고**("재배포 때 파일이 사라짐"), `null`은 판정 불가(컨테이너 밖·윈도우) |
| `error` | 실패 사유 — 규칙 번호가 앞에 붙는다: `[R0]` 허용 루트 없음 · `[R1]` 절대 경로 아님/빈 값 · `[R2]` `..`/정규화 안 됨 · `[R3]` 허용 루트 밖 · `[R4]` 심볼릭 링크 탈출 · `[R5]` 제어 문자·따옴표·`${`·예약 이름·`:` · `[R6]` 로그 디렉터리와 겹침 · `[실검사]` 생성·쓰기 실패 |
| `warnings` | 경고 문장(원자적 이동 미지원·여유 공간 부족·볼륨 미마운트 의심) |

⚠️ 이 EP는 예외 없이 결과로 돌려준다(허용 루트 미설정도 `ok:false, error:"[R0] …"`).

---

## 3. APM 전용 — `/archives/sources/apm` (`Feature.APM`)

### 3.1 `GET /archives/sources/apm/settings`

```json
{ "data": {
  "enabled": false,
  "targets": ["metric1h", "traceSummary", "sloSnapshot"],
  "maskRawText": true, "onFailure": "skipDrop", "maxHoldDays": 7, "backfill": "none",
  "configured": true, "basePath": "/data/archive/store", "apmPath": "/data/archive/store/apm",
  "datasets": [
    { "key": "metric1h", "table": "apm_metric_1h", "format": "csv", "defaultTarget": true, "optIn": false,
      "selected": true, "retentionDays": 400, "recentDailyRows": 78012, "recentDailyDbBytes": 31457280,
      "estimatedDailyArchiveBytes": 3145728, "oldestAvailableDay": "2025-08-27", "warning": null },
    { "key": "metric1m", "table": "apm_metric_1m", "format": "csv", "defaultTarget": false, "optIn": true,
      "selected": false, "retentionDays": 7, "recentDailyRows": 14040000, "recentDailyDbBytes": 9632000000,
      "estimatedDailyArchiveBytes": 963200000, "oldestAvailableDay": "2026-09-23",
      "warning": "1분 원시(metric1m)는 가장 큽니다 — R3 규모(하루 약 1,400만 행) 기준 압축 후 하루 약 0.35~0.7 GB로 추정됩니다(실측 아님, 설계 §6.2). 켜기 전에 여유 공간을 확인하세요." }
  ],
  "warnings": [],
  "updatedAt": null, "updatedBy": null } }
```

| 필드 | 설명 |
|---|---|
| `enabled` | 🔴 기능 스위치(기본 false) |
| `targets` | 선택된 데이터셋 키. 기본(Q1 A안) `metric1h`·`traceSummary`·`sloSnapshot` |
| `maskRawText` | 스팬 원문(SQL·예외 메시지·스택) 마스킹. 기본 true. 끄면 경고 배너 |
| `onFailure` | `skipDrop`(기본) \| `continue`(🔴 손실 감수 — 경고 배너 고정) |
| `maxHoldDays` | 보류 기한(일). **0 = 무기한 보류** |
| `backfill` | `none`(기본 — 앞으로 지워질 날만) \| `all`(보존 기간 안 전부, 며칠에 나눠) |
| `configured` / `basePath` / `apmPath` | 공통 설정 상태(켜기 가능 여부 판단) |
| `datasets[]` | 카탈로그 5종 — `retentionDays`는 **읽기 전용**(설정 › 스케줄러 `apm_retention`이 정본). `recentDaily*`는 최근 최대 7일 평균(통계 추정), `estimatedDailyArchiveBytes`는 DB 크기 × 0.1의 거친 추정(실측 아님), `oldestAvailableDay` 이전은 이미 지워져 보관 불가, `warning`은 옵트인 용량 경고 |
| `warnings[]` | 고정 배너 문장(허용 루트 없음·경로 미저장·continue·마스킹 끔·옵트인 용량) |

데이터셋 카탈로그(고정 — 형식은 선택지가 아니다)

| key | 원본 | 형식 | 기본 | 옵트인 | 비고 |
|---|---|---|---|---|---|
| `metric1h` | `apm_metric_1h` | csv | ✅ | | 400일 뒤 완전 소멸 |
| `traceSummary` | `apm_trace_summary` | csv | ✅ | | 7일 |
| `sloSnapshot` | `apm_slo_snapshot` | csv | ✅ | | 400일, 비파티션(날짜 단위 DELETE에 게이트) |
| `metric1m` | `apm_metric_1m` | csv | | 🔴 | 가장 큼 — 용량 경고 |
| `span` | `apm_span` | jsonl | | 🔴 | 용량 미측정 — 경고, 마스킹 대상 |

### 3.2 `PUT /archives/sources/apm/settings` — 부분 수정(null = 유지)

```json
{ "enabled": true, "targets": ["metric1h", "traceSummary", "sloSnapshot", "metric1m"],
  "maskRawText": true, "onFailure": "skipDrop", "maxHoldDays": 7, "backfill": "none" }
```

- 🔴 `enabled:true`가 되는 저장은 ① 허용 루트(`ARCHIVE_NOT_CONFIGURED`) ② 공통 basePath 저장(`ARCHIVE_SETTING_INVALID`) ③ 경로 실검사 통과(`ARCHIVE_PATH_INVALID`, `data`=PathCheckResult) ④ 대상 1개 이상(`ARCHIVE_SETTING_INVALID`)을 모두 요구한다.
- 모르는 데이터셋 키 → `ARCHIVE_SETTING_INVALID`(범위 밖 데이터셋은 켤 수 없다).
- `onFailure` ∈ {`skipDrop`,`continue`}, `maxHoldDays` 0~365, `backfill` ∈ {`none`,`all`}.
- 끄면(`true → false`) 열린 보류가 모두 닫히고, 다음 보존 정리부터 예전처럼 지운다.
- 🔴 옵트인(metric1m·span)을 체크할 때 FE는 `datasets[].warning`을 확인 모달로 보여 준다. `onFailure=continue`·`maskRawText=false`로 바꿀 때도 확인 모달(되돌릴 수 없는 손실·원문 반출).
- 응답은 저장 후의 `ApmArchiveSettingsDto`(경고 포함).

### 3.3 `GET /archives/sources/apm/status` — 상태 카드

```json
{ "data": {
  "enabled": true, "configured": true, "basePath": "/data/archive/store", "diskUsableBytes": 512000000000,
  "archiveJob":   { "jobKey": "apm_archive", "enabled": true, "scheduleType": "daily", "atHour": 0, "atMinute": 50,
                    "nextRunAt": "2026-10-02T00:50:00.000Z", "lastRun": { "startedAt": "…", "durationMs": 81234,
                    "status": "success", "summary": "ok=3 failed=0 expired=0 deferred=0 abandoned=0 rows=78035 bytes=3150112", "errorMessage": null }, … },
  "retentionJob": { "jobKey": "apm_retention", "nextRunAt": "2026-10-02T01:30:00.000Z", … },
  "holds": { "count": 1, "oldestHeldDays": 2, "maxHoldDays": 7, "items": [
      { "dataset": "metric1h", "table": "apm_metric_1h", "periodDay": "2025-08-26",
        "firstHeldAt": 1759195800000, "lastHeldAt": 1759282200000, "heldCount": 2, "heldDays": 2,
        "expiresInDays": 6, "lastFailureReason": "NO_SPACE",
        "lastFailureDetail": "여유 공간 부족 — 남은 900 MB < 예상 3 MB + 최소 여유", "lastFailureAt": 1759279800000 } ] },
  "usage": [ { "dataset": "metric1h", "files": 12, "bytes": 37748736, "oldestDay": "2025-08-15", "newestDay": "2025-08-26" } ],
  "recentFailures": [ { "id": 77, "dataset": "metric1h", "periodDay": "2025-08-26", "reason": "NO_SPACE", "detail": "…", "createdAt": 1759279800000 } ],
  "warnings": [ "보관하지 못해 정리가 보류된 날이 1건 있습니다(가장 오래된 보류 2일째) — 7일을 넘기면 보관 없이 지워집니다" ] } }
```

| 필드 | 설명 |
|---|---|
| `archiveJob` / `retentionJob` | 기존 스케줄러 DTO 그대로(`nextRunAt` = "다음 정리까지 남은 시간"의 근거, `lastRun.summary` = 회차 요약). 시각은 문자열 형식 |
| `holds.count` | 🔴 1 이상이면 **보류 배너**(Q2 "보류 첫날부터"). 기능이 꺼져 있으면 0 |
| `holds.items[].expiresInDays` | 이 일수가 지나면 보관 없이 지워진다(`HOLD_EXPIRED`). `null` = 무기한. `0` = 다음 정리에서 지워질 수 있다 |
| `holds.items[].lastFailure*` | 그날 마지막 아카이브 실패(없으면 null = 아직 시도 전) |
| `usage[]` | 데이터셋별 파일 수·용량(OK·SUPERSEDED) |
| `recentFailures[]` | 최근 실패 최대 10 |
| `warnings[]` | 고정 배너(보류·스케줄러 꺼짐·continue·마스킹 끔·옵트인·허용 루트 없음) |

회차 요약 형식(`lastRun.summary`): `ok=N failed=N expired=N deferred=N abandoned=N rows=N bytes=N [stopped=NO_SPACE]`. 실패가 하나라도 있으면 회차가 **실패로 기록**되고(`status:"failed"`, `errorMessage`에 같은 요약 + 실패 목록) 다음 회차가 재시도한다. 꺼져 있으면 `skipped: disabled`.

### 3.4 `GET /archives/sources/apm/holds` — 보류 목록

`HoldItem[]`(§3.3 `holds.items`와 같은 모양) — 기능이 꺼져 있어도 장부의 열린 행을 그대로 준다(대개 비어 있다).

### 3.5 `POST /archives/sources/apm/run` — 지금 실행

`{ "data": { "accepted": true } }` — 접수만 하고 돌아온다. 결과는 몇 초~수십 분 뒤 `status.archiveJob.lastRun`과 목록으로 확인(폴링 권장 5~10초, 너무 잦게 하지 말 것).

---

## 4. 오류 코드 (전부 HTTP 200 + body code — 다운로드 본문 전 실패 포함)

| body `code` | `errorCode` | 언제 | `data` |
|---|---|---|---|
| 400 | `ARCHIVE_NOT_CONFIGURED` | 허용 루트 미설정 상태에서 경로 저장·기능 켜기 | — |
| 400 | `ARCHIVE_PATH_INVALID` | 경로 규칙 위반 또는 실검사 실패 | `PathCheckResult` |
| 400 | `ARCHIVE_SETTING_INVALID` | 모르는 데이터셋·범위 밖 값·대상 없이 켜기·basePath 미저장·날짜 형식·bulk ids | — |
| 400 | `ARCHIVE_REASON_REQUIRED` | 삭제 사유 비었음/255자 초과 | — |
| 404 | `ARCHIVE_NOT_FOUND` | 없는 id | — |
| 404 | `ARCHIVE_FILE_MISSING` | 다운로드·검사 대상 파일 없음(상태·디스크) | — |
| 400 | `ARCHIVE_FILE_REJECTED` | 🆕 원장 경로가 관리 대상이 아님(허용 루트 밖·심볼릭 링크·이름 규칙) — 다운로드·검사 거절, 원장 불변 | — |
| 403 | `FORBIDDEN` | 관리자 아님 | — |
| 403 | (라이선스) | APM EP인데 APM 기능 없음 | 기존 라이선스 계약 |
| 401 | — | 미인증(실제 HTTP 401) | — |

---

## 5. 알람 — 새 종류 `ARCHIVE_HOLD`

- APM 알람 규칙 목록(알람 › 규칙 화면)에 **전역 규칙 1건**(V69 시드, `rule_uid …0a4`)이 새로 보인다: `kind:"ARCHIVE_HOLD"`, 단위 `count`, 서비스 축 없음(수집기 실패와 같은 "시스템 축"), 열린 보류 1건 이상이면 발화 · 0이면 해소. Zabbix 아이템 키 `apm.archive_hold[collector]`.
- 🔴 기능이 꺼져 있으면 평가 대상이 없다(바인딩·Zabbix 아이템이 생기지 않는다) — 규칙 행만 보인다.
- 임계·창은 쓰지 않는다(판정은 서버가 한다) — 편집 폼에서 임계·창 입력을 숨기거나 읽기 전용으로. 🆕 서버도 삭제·임계/창 변경을 `APM_ALERT_RULE_PROTECTED`로 거절한다(켜고 끄기만, §9.1 #9).

---

## 6. ZIP 안 (감사인·고객이 보는 파일)

```
moveseye-apm_{dataset}_{yyyy-MM-dd}.zip
├─ data/{원본 테이블}.csv.gz          (span은 .jsonl.gz, 한도 초과 시 .part02… 로 이어짐)
├─ dict/services.csv.gz · dict/hist_bounds.csv.gz · dict/slos.csv.gz   (그 파일에 나온 id만)
├─ checksums.txt                     (sha256sum 호환 — 압축을 푼 뒤 `sha256sum -c checksums.txt`)
└─ manifest.json                     (schemaVersion·source·period(+timezone)·counts·masked·dictionaries·retention·files·gaps)
```
- 열은 원본 컬럼 이름 그대로. 시각은 UTC ISO-8601 + `{컬럼}_epoch_ms`. CSV는 UTF-8 BOM·CRLF·RFC 4180, 🆕 **값을 바꾸지 않는다**(엑셀 수식 주입 방어 `'` 접두를 하지 않음 — 복원용 원본). manifest 최상위 `"csvFormulaGuard": false`(내보내기 ZM-154 CSV는 종전대로 방어 켬).
- 같은 날을 다시 만들면 파일 이름에 `-r2`·`-r3`이 붙는다(덮어쓰지 않는다).
- 사전에 없는 id(그 사이 삭제된 서비스)는 `<deleted:ID>` 행 + `manifest.dictionaries.missing`.

---

## 7. FE 연동 가이드 (S4 — 설정 › 데이터 아카이빙)

- 진입: 관리 콘솔(⚙) — `constants/adminConsole.tsx` 정본에 항목 추가(관리자만). 탭: ① 아카이브 목록 ② APM 대상(라이선스 `apm`일 때만) ③ 경로·공통 설정.
- 목록: 소스·데이터셋 필터, "삭제된 항목 표시" 토글(`includeDeleted`), 날짜별 묶음(같은 `periodDay`), 경로는 `relativePath` 표시 + 복사 버튼은 `absolutePath`, `fileExists:false` 배지, 다운로드(blob — §2.2), 무결성 검사 버튼, 선택 삭제(사유 모달).
- 상태 카드: `retentionJob.nextRunAt`까지 남은 시간, 🔴 `holds.count > 0` 배너, `warnings[]` 전부 배너, 경로 검사 결과(`path-check` 버튼), `diskUsableBytes`.
- APM 대상 탭: `datasets[]` 표(체크·보존 일수 읽기 전용·하루 예상 용량), 옵트인 체크 시 `warning` 모달, `onFailure`·`maxHoldDays`(0=무기한 안내)·`maskRawText`·`backfill`, 켜기 스위치 — 실패 시 `errorCode`별 안내(`ARCHIVE_NOT_CONFIGURED`면 "운영자 조치").
- 실행 이력 이름: 설정 › 스케줄러 표의 `SCHEDULER_JOB_CATALOG`에 `apm_archive`("APM 콜드 아카이브") 추가 필요(없으면 이름이 안 뜬다).
- 알람 규칙 화면: `ARCHIVE_HOLD` 라벨·단위(`count`)·편집 제한(§5).

---

## 🔄 FE 요청사항

> 2026-10-01 FE(S4, 워크트리 `C:\worktrees\zm-156-fe`) 연동 중 남김. **화면은 지금 계약 그대로 동작한다** — 아래는 막힌 것이 아니라 FE가 우회 중인 것.

| # | 요청 | 왜 | FE의 지금 우회 |
|---|---|---|---|
| 1 | `warnings[]`(설정·상태)·`datasets[].warning`에 **코드**를 같이 실어 달라(예: `warningCodes: ["HOLDS","JOB_DISABLED",…]` 또는 `{code, params}[]`) | 문장이 한국어 고정이고 내부 표기(`onFailure=continue`·`maskRawText=false`·`apm_archive`)와 **설계 절 번호·규모 코드(`설계 §6.2`·`R3 규모`)**가 섞여 있다 — 고객 화면·영어 로케일에 그대로 못 띄운다 | 같은 조건을 구조화 필드(`holds`·`configured`·`basePath`·`archiveJob.enabled`·`onFailure`·`maskRawText`·`datasets[].optIn`)로 다시 판정해 i18n 문장으로 그린다. 서버 `warnings[]` 원문은 화면에 직접 쓰지 않는다(아래 #2 예외) |
| 2 | 손상된 APM 설정(§9 #6)에 **표지 필드**(`settingsCorrupted: boolean` + 사유)를 달라 | 지금은 `warnings[0]` 문장 머리(`저장된 APM 아카이브 설정이`)로만 알 수 있다 — 문장을 고치면 화면이 조용히 못 알아챈다 | 문장 머리로 찾아 빨간 배너(i18n) + 원문을 설명으로 붙이고, 바꾼 것이 없어도 저장 버튼을 연다 |
| 3 | (확인) 스케줄러 DTO 시각(`nextRunAt`·`lastRun.startedAt`)은 `LocalDateTime`에 **리터럴 `'Z'`**를 붙인 값이다 — 서버 시간대가 UTC가 아니면 "다음 정리까지 남은 시간"이 시간대 차만큼 어긋난다 | 설정 › 스케줄러 화면도 같은 방식으로 읽고 있어 이번 화면만의 문제는 아니다 | 스케줄러 화면과 같은 해석(`Z` = UTC)을 따른다. 운영 컨테이너가 UTC면 맞고, KST JVM이면 9시간 어긋난다 |
| 4 | (후순위) 목록에 날짜 단위 페이지(또는 `groupBy=day`) | 날짜 묶음은 서버 페이지 안에서만 묶여 하루치가 페이지 경계에 걸리면 두 페이지로 나뉜다 | 화면 문서에 한계로 적었다 |

**BE 회신(2026-10-01, v1.2)** — #1·#2·#3 반영, #4는 이번 범위 밖(후속).
- #1 ✅ `warnings[]`·`datasets[].warning`이 **`{code, message, params}`** 객체가 됐다(§9.1). `message`는 서버 기본 문장(로그·폴백용), 화면은 `code`+`params`로 그린다.
- #2 ✅ `settingsState: "OK" | "INVALID" | "ABSENT"`를 settings·status 응답에 추가. 손상이면 `warnings`에 `{code:"SETTINGS_INVALID", params:{key, detail}}`도 실린다 — 문장 머리 판별은 지워도 된다.
- #3 ✅ 확인: 스케줄러 DTO는 서버 현지 `LocalDateTime`에 리터럴 `Z`를 붙인다(UTC JVM에서만 맞다). **아카이브 상태 EP는 그 DTO를 더 싣지 않고** `archiveJob`·`retentionJob`을 epoch ms로 변환한 `JobInfo`로 바꿨다(§9.1). 설정 › 스케줄러 EP 자체는 이번 범위 밖 — 보고서에 별도 이슈로 기록.
- #4 ⏸ 후속.


---

## 9. v1.1 — 코덱스 v1 검수 반영에 따른 계약 변경 (2026-10-01)

| # | 변경 | FE 영향 |
|---|---|---|
| 1 | 원장 상태 **`RUNNING`** 추가(내보내는 중) | 목록 배지 "진행 중"(회색), 다운로드·삭제·검사 버튼 비활성. `fileExists`는 null |
| 2 | 삭제 결과에 **`rejected: number[]`** 추가 | 관리 대상이 아닌 경로라 아무것도 안 한 id — 별도 안내(원장 그대로) |
| 3 | 오류 코드 **`ARCHIVE_FILE_REJECTED`**(body code 400) | 다운로드·무결성 검사에서 원장 경로가 허용 루트 밖·링크·이름 규칙 위반일 때. `ARCHIVE_FILE_MISSING`(404)과 다르게 안내("경로가 올바르지 않음") |
| 4 | 삭제·무결성 검사는 (소스, 데이터셋, 날짜) **락을 기다린다** | 같은 날짜의 보존 DROP·아카이브 게시가 진행 중이면 그 동안 응답이 늦다(보통 수 초). 클라이언트 타임아웃 60초 이상 권장, 스피너 유지 |
| 5 | manifest 최상위 **`csvFormulaGuard: false`**, `format.csvText` 문구 | 아카이브 CSV는 값 무변형(엑셀에서 `=…` 칸이 수식으로 보일 수 있음 — 다운로드 안내 문구에 "복원용 원본" 명시 권장) |
| 6 | 🔴 APM 설정 행이 손상되면 보존 정리·아카이브가 **멈춘다** | `GET /archives/sources/apm/settings`·`/status`의 `warnings[0]`에 "저장된 APM 아카이브 설정이 올바르지 않아 … 다시 저장하세요" — 빨간 배너 + 설정 다시 저장 유도. 화면은 기본값으로 뜬다 |
| 7 | 회차 요약 `deferred`에 "다른 실행이 같은 날을 만드는 중"도 포함 | 표시 변화 없음 |

응답 필드 이름·경로·권한은 바뀌지 않았다(추가만).


### 9.1 v1.2 — 코덱스 v2 검수 + FE 요청 반영 (2026-10-01)

| # | 변경 | FE 영향 |
|---|---|---|
| 1 | 🆕 **`warnings[]` 요소가 객체** `{code, message, params}`(settings·status), `datasets[].warning`도 같은 객체 또는 null | 코드로 i18n. 코드 목록은 아래 표 |
| 2 | 🆕 **`settingsState`** `"OK" \| "INVALID" \| "ABSENT"`(settings·status) | `INVALID`면 빨간 배너 + "다시 저장" — 보존 정리·아카이브가 멈춰 있다. 화면 값은 기본값으로 채워진다 |
| 3 | 🆕 status의 **`archiveJob`·`retentionJob` = `JobInfo`** `{jobKey, enabled, scheduleType, atHour, atMinute, nextRunAt(epoch ms), lastRun:{startedAt(epoch ms), durationMs, status, summary, errorMessage}}` — 스케줄러 DTO(문자열 시각) 대신 | "다음 정리까지 남은 시간" = `retentionJob.nextRunAt - now`(서버 시간대와 무관) |
| 4 | 🆕 오류 코드 **`ARCHIVE_BUSY`**(body code 409 — APM 설정 저장 중 아카이브 경로가 계속 바뀌어 3회 재검사에도 못 맞춘 경우 포함) | 삭제·무결성 검사·APM 설정 저장이 같은 날짜의 보존 DROP·게시(또는 보존 판정 중인 설정)와 겹쳐 **60초 안에 잠금을 못 얻으면**. 아무것도 바뀌지 않았다 — "잠시 뒤 다시 시도" |
| 5 | 🆕 선택 삭제 결과에 **`busy: number[]`** | 위와 같은 이유로 건너뛴 id(단건 삭제는 `ARCHIVE_BUSY` 오류로 나간다) |
| 6 | 🆕 보류 항목 **`lastHoldReason`** `"NOT_ARCHIVED" \| "LOCK_TIMEOUT"` | `LOCK_TIMEOUT` = 보존 정리가 락을 30초 안에 못 얻어 판정하지 못하고 **지우지 않았다**(다음 정리에서 다시 본다). 보관 실패와 구분해 안내 |
| 7 | 무결성 검사 결과가 검사 도중 바뀐 경우 `ARCHIVE_BUSY` | 다시 누르면 새 상태로 검사 |
| 8 | 🔴 설정 행에 **모르는 키**가 있어도 손상(`SETTINGS_INVALID`, `params.key`에 그 키) | FE는 계약의 키만 보낸다 — 영향 없음 |
| 9 | 🆕 오류 코드 **`APM_ALERT_RULE_PROTECTED`**(body code 400) — 알람 규칙 `ARCHIVE_HOLD`(시스템 규칙) **삭제**, **임계·창 변경**(지금 값과 다를 때), 또는 **`resync?mode=THEIRS`**(Zabbix 임계 채택) 시 — `OURS`는 허용 | 알람 규칙 화면: `ARCHIVE_HOLD` 행은 삭제 버튼·임계/창 입력을 숨기고 **켜기/끄기 토글만**. 폼이 지금 값을 그대로 되보내는 것은 받는다. `STUCK_REQUEST`는 대상 아님(임계가 사용자 설정값 — 기존 동작 그대로) (FE 검수 R9) |

**경고 코드**

| code | params | 화면 |
|---|---|---|
| `SETTINGS_INVALID` | `key`(문제 키, 없으면 null)·`detail` | 🔴 빨간 배너 + 다시 저장 |
| `HOLDS_PENDING` | `count`·`oldestHeldDays`·`maxHoldDays`(0=무기한) | 🔴 보류 배너(Q2) |
| `NOT_CONFIGURED` | — | 운영자 조치(허용 루트) |
| `BASE_PATH_MISSING` | — | 경로 저장 유도 |
| `CONTINUE_POLICY` | — | 손실 감수 경고 |
| `MASK_OFF` | — | 원문 포함 경고 |
| `OPT_IN_VOLUME` | `dataset`·`estimatedGbPerDay`(이 설치본 최근 DB 크기 × 0.1 추정, 없으면 null)·`measured`(boolean)·`designGbPerDayMin`/`Max`(설계 §6.2 추정 — metric1m 0.35/0.7, span은 null=미측정) | 옵트인 용량 확인 모달 |
| `JOB_DISABLED` | `jobKey` | 스케줄러에서 배치가 꺼짐 |
| `LOCK_TIMEOUT` | `lock`(`settings`\|`day`)·`table`·`day`·`at`(epoch ms) | 🆕(v3) 최근 24시간 안에 보존 정리가 잠금을 30초 안에 못 얻어 그 날의 정리를 미뤘다(지우지 않음). 일시 경고 — 서버 재기동 시 사라지고 다음 정리에서 다시 본다 |

예시(status 일부)

```json
"settingsState": "OK",
"warnings": [
  { "code": "HOLDS_PENDING", "message": "보관하지 못해 정리가 보류된 날이 1건 있습니다(…)",
    "params": { "count": 1, "oldestHeldDays": 2, "maxHoldDays": 7 } },
  { "code": "OPT_IN_VOLUME", "message": "1분 원시(metric1m)는 …",
    "params": { "dataset": "metric1m", "estimatedGbPerDay": 0.96, "measured": true,
                "designGbPerDayMin": 0.35, "designGbPerDayMax": 0.7 } } ],
"retentionJob": { "jobKey": "apm_retention", "enabled": true, "scheduleType": "daily", "atHour": 1, "atMinute": 30,
                  "nextRunAt": 1759339800000, "lastRun": { "startedAt": 1759253400000, "durationMs": 812,
                  "status": "success", "summary": "partitions=3 …", "errorMessage": null } }
```

⚠️ 이 절의 #1·#3은 **필드 모양이 바뀐다**(문자열 배열 → 객체 배열, 스케줄러 DTO → JobInfo). FE S4가 아직 병합 전이라 지금 맞춘다.
