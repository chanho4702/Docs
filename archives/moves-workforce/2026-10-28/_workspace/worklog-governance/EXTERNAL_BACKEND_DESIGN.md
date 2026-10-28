# Moves Workforce 외부 백엔드 설계 — 워크로그 원본형 · 멀티테넌트 · Java + PostgreSQL

> 버전: **v2.1 (2026-09-30)** · 상태: 설계안. Codex 1차(v1.1)·2차(v2.1) 검토 반영. 구현 착수 전 §12 검증 필요.
> **결정 기록(2026-09-30):** 배포 2모드(우리 호스팅 + 고객 환경 호스팅) **확정**. D11·D14·§1.2·P6 유효. 다음 단계는 §12-1 실측.
> 전제: 외부 백엔드를 둔다(Runs on Atlassian 포기). **워크로그 원본은 우리 DB**, Jira 워크로그는 Tempo처럼 **항상 동기화되는 투영**이다.
> 선행 문서: `WORKLOG_GOVERNANCE_ANALYSIS.md`(요구 분석·옵션 비교), `CUSTOMER_REQUIREMENTS_REPORT.md`(고객 요구)
> 비목표: UI 재설계. OKR·Outlook은 요구 내용 미확정으로 범위 밖(§14).
> 원칙: **평범하게 쓰면 만나는 것만 대응한다.** 측정 전에 붙이는 최적화·계약 전에 붙이는 기능은 §11 보류.
> 코드 사실(2026-09-30 확인): 백엔드 성공 응답은 `{success:true, ...result}` **스프레드**(`responseWrapper.js`). 프론트는 `@forge/bridge`의 `invoke`를 139개 파일에서 직접 import, 호출 236곳.

---

## 0. 결정 사항 요약

| # | 결정 | 근거 |
|---|------|------|
| D1 | 워크로그 원본 = 우리 DB. Jira 워크로그는 우리가 쓰는 투영이며 모든 워크로그가 Jira에 동기화된다(Tempo 동일). Jira 화면 직접 변경은 입력 채널로 수용하되, 잠긴 기간·미소속자 변경은 **탐지 후 보상 복구** | 고객은 Jira 기본 화면을 계속 쓴다 |
| D2 | 테넌트 = Forge 설치 1건. 스키마 공유 + `tenant_id` + RLS(fail-close). 자체 호스팅도 같은 코드·같은 RLS(테넌트 1개) | 코드 갈래 하나. RLS는 다중 고객 기능이 아니라 동일 바이너리의 fail-close 안전장치(Codex 2-5) |
| D3 | 리전별 독립 스택(US·EU). SaaS는 `remotes.baseUrl = {default, US, EU}` + `storage.inScopeEUD: true`로 레지던시 PINNED | 공식 문서 |
| D4 | 급여·단가는 외부 DB에 저장하지 않는다 | 가장 민감한 데이터를 외부로 내보내지 않는다 |
| D5 | 집계는 `worklog_monthly` canonical + dirty-key 절대 재계산 | `+= delta`는 재시도에 안전하지 않다 |
| D6 | Jira 쓰기·알림·사용자 동기화 등 **Jira를 부르는 모든 지연 작업은 Forge 스케줄이 토큰을 들고 백엔드를 호출하는 pull 모델** | 외부 백엔드는 Forge 토큰을 스스로 얻을 수 없고 Forge 함수를 호출할 수도 없다(Codex 1-4.1, 2-28) |
| D7 | 인증은 Atlassian 체계: 들어오는 요청 FIT(JWKS), 나가는 Jira 호출은 동봉 토큰 | 자체 로그인·자격증명 저장 없음 |
| D8 | Java 21 + Spring Boot 3.x + jOOQ + Flyway + HikariCP + PgBouncer, PostgreSQL 16, S3 호환 스토리지. Redis·replica·확장 모듈은 P1 밖 | 측정 전 도입 금지 |
| D9 | 내부 `user_id`(UUID). `account_id`는 속성 | 익명화 시 FK 파손 방지 |
| D10 | 상태 축 분리: 생명주기 / 승인 / 마감 / 투영 | 재오픈·재승인 표현 |
| D11 | 배포 2모드를 마켓플레이스 앱 하나로. SaaS = 고정 `baseUrl`. 자체 호스팅 = Forge 고객 관리형 원격지(`remotes.configurable`, Preview). **토큰이 필요 없는 엔드포인트와 토큰 엔드포인트를 분리**하고, URL 설정 후 **핸드셰이크·installation 바인딩**을 거쳐야 활성화 | 관리자 동의 모달은 고지이지 런타임 안전장치가 아니다(Codex 2-2·3) |
| D12 | 첨부(이미지)는 우리 오브젝트 스토리지가 원본. **표시는 백엔드가 권한 확인 후 발급하는 짧은 서명 GET을 UI가 fetch → blob**으로. Jira 이슈 첨부 미러는 **opt-in**이며 코멘트 표식은 넣지 않는다 | 미러를 기본 표시 경로로 두면 가용성·권한이 Jira 첨부 상태에 종속되고 이슈 첨부 목록이 오염된다(Codex 2-9·11·34) |
| D13 | 프론트는 현 Forge UI 유지, 호출 계층만 교체. `@forge/bridge` `invoke` import를 **기계적으로 어댑터로 치환**(139파일). 응답 형태 `{success:true, ...result}` 스프레드 유지. 전환 단위는 resolver 한 줄이 아니라 **"mutation + 그것을 읽는 모든 query + invalidation"** 묶음. 런타임 폴백 없음 | 같은 화면의 원본이 갈라지는 기간을 만들지 않는다(Codex 2-19·20·24) |
| D14 | 자체 호스팅에서 알 수 없는 `installationId`는 자동 생성·자동 병합하지 않고 `RECONNECT_REQUIRED`. 재연결은 이전 설치가 발급한 1회용 recovery token으로만 | cloudId 일치만으로 데이터 소유권을 넘기면 테넌트 탈취(Codex 2-3) |

---

## 1. 전체 구조

```
[Jira Cloud]
   │ 화면(Forge UI)         │ 이벤트(worklog C/U/D, issue created)     │ 스케줄(1분·15분·1시간·야간)
   ▼                        ▼                                         ▼
[Forge 앱 — 얇은 층]      Forge 함수(트리거)                          Forge 함수(스케줄, 시스템 토큰 보유)
   · UI 번들(현행 구조)     · 이벤트 → 백엔드 /sync/events               · /sync/dispatch  (Jira 투영)
   · 호출 어댑터(§8)                                                     · /sync/notifications (알림)
   · 급여/단가 KVS·SQL                                                   · /sync/users (인원)   · /sync/import (초기 적재)
   · 비용 환산 함수
   · 라이선스(Forge)                          ── FIT (+토큰은 sync 엔드포인트만) ──►   [Java 백엔드]
                                                                         · SaaS: 우리 리전 서버      ┐ 같은 바이너리
                                                                         · 자체 호스팅: 고객 서버     ┘ MODE 설정만 다름
                                                                         · API(Spring) · 워커(롤업·보정·정산)
                                                                         · PostgreSQL 16 · S3 호환 스토리지(첨부)
```

- Forge 앱은 남는다. 설치·라이선스·UI·이벤트 수신·급여 보관·**Jira 쓰기용 토큰 공급**이 Forge 몫.
- 백엔드 워커는 DB 안에서 끝나는 일만 한다. Jira를 부르는 일은 토큰이 동봉된 `/sync/*` 요청 안에서만.
- `invokeRemote`: manifest `endpoint` 필수, body JSON만, 2xx 외 JSON 본문 필수, 401은 "FIT 검증 실패"(공식 문서).

### 1.1 요청 흐름

| 흐름 | 경로 |
|------|------|
| 화면 조회·CRUD | UI → 어댑터 → `invokeRemote(endpoint: api)` → 백엔드(FIT, **토큰 없음**) → PG |
| 워크로그 작성(화면) | 원본 INSERT + projection(PENDING) 커밋 → **같은 요청**에서 사용자 토큰으로 Jira `POST worklog` → SYNCED. 이 요청만 `endpoint: api-user`(사용자 토큰 동봉) |
| 첨부 업로드 | UI → `/attachments/prepare`(쿼터 예약 + 서명 POST 정책) → 브라우저 직접 업로드 → `/attachments/commit` → 워커 검증·썸네일 |
| 첨부 표시 | UI → `/attachments/{id}/url`(권한 확인, 서명 GET 5분) → UI `fetch` → blob URL |
| 지연 투영 | Forge 스케줄(1분) → `/sync/dispatch`(시스템 토큰) → PENDING/FAILED 처리 → 결과 ack |
| Jira 쪽 변경 | Jira 이벤트 → Forge 트리거 → `/sync/events`(시스템 토큰) |
| 알림 | Forge 스케줄(5분) → `/sync/notifications`(시스템 토큰) → N건 가져와 같은 요청에서 Jira 호출 → ack |
| 인원 동기화 | Forge 스케줄(1시간) → `/sync/users`(시스템 토큰) → 페이지 체크포인트 방식 |
| 승인·마감·롤업 | v1.1과 동일 |
| 외부 연동(SAP) | export 파일 생성까지 설계. 전달 인증은 SAP 명세 후(§6.6) |

### 1.2 배포 2모드 (D11·D14)

| | SaaS (우리 호스팅) | 자체 호스팅 (고객 호스팅) |
|---|---|---|
| Forge 앱·라이선스 | 마켓플레이스 앱 | 동일 |
| 백엔드 주소 | manifest 고정 `baseUrl`(리전별) | 관리자가 백오피스에서 `permissions.remote.set()`(동의 모달, 관리자만). Connected Apps에서도 변경·초기화 가능 |
| 모드 | `MODE=SAAS`, 테넌트 다수 | `MODE=SELF_HOSTED`, 테넌트 1개, RLS 동일 |
| 데이터 레지던시 | PINNED 자격 | **Atlassian 레지던시 보증 대상 아님.** 고객이 저장 위치를 통제할 뿐(Codex 2-7) |
| 첨부 스토리지 | 우리 리전 S3(SSE-KMS) | 고객 S3 호환(MinIO 등). 로컬 디스크 미지원(§11) |
| 배포물 | 우리 CI | Docker 이미지(backend·worker) + Compose/Helm + `.env` 템플릿, Flyway 자동. 진단 번들 export |
| 호환 | 최신 | `/version`이 **contract revision + capability 목록** 반환. 레지스트리 항목마다 요구 capability 선언, 미충족 mutation은 호출 전 차단, 조회는 구형 contract로. 초기 보장은 **현재·직전 revision**(N-2는 릴리스 주기 확인 후) |

**엔드포인트 분리(토큰 신뢰 경계).** 설정된 URL이 오타·탈취·DNS 이전으로 바뀌면 그 서버가 Jira 권한 토큰을 받는다. 그래서 토큰은 필요한 엔드포인트에만 동봉한다.

```yaml
permissions:
  external:
    configurable: { enabled: true }        # ⚠ 프로덕션 배포 후 제거 불가(공식)
remotes:
  - key: workforce
    baseUrl: { default: https://api-us.workforce.dmove.io, US: https://api-us.workforce.dmove.io, EU: https://api-eu.workforce.dmove.io }
    operations: [storage, compute]
    storage: { inScopeEUD: true }
    configurable:
      name: "Moves Workforce 백엔드"
      description: "자체 호스팅 시 고객 백엔드 주소. 비워 두면 Dmove 서버를 사용합니다."
endpoints:
  - key: api            # 조회·CRUD. 토큰 없음
    remote: workforce
    route: { path: /api }
  - key: api-user       # 화면 작성 동기 투영. 사용자 토큰만
    remote: workforce
    route: { path: /api-user }
    auth: { appUserToken: { enabled: true } }
  - key: sync           # 스케줄·트리거 전용. 시스템 토큰
    remote: workforce
    route: { path: /sync }
    auth: { appSystemToken: { enabled: true } }
```

- `endpoint.auth`가 엔드포인트 단위로 토큰을 제어하는지는 **§12-1 P0 실측**. 불가하면 토큰 없는 remote와 토큰 remote를 2개 선언하고 둘 다 configurable로 둔다.
- **연결 핸드셰이크**(URL 설정 직후, 토큰 없는 `/api/handshake`): 백엔드가 `{appId, contractRevision, capabilities, mode, deploymentFingerprint}` 응답 → 프론트가 `appId` 일치·contract 호환 확인 → 관리자에게 fingerprint 표시·확인 → 백엔드 `/api/bind`로 `{cloudId, installationId}` 고정. 바인딩 전에는 `/sync/*` 호출을 Forge 쪽에서 보내지 않는다. URL 변경은 `audit_log`와 관리자 화면에 이전·이후 fingerprint로 남긴다.
- **인증 3단계**(Codex 2-1): ① FIT 서명·`aud`·`iss`·`exp` ② `installationId → tenant` ③ 그 installation이 이 배포에 바인딩된 것인지. ③ 불일치는 fail-close.
- **재설치·재연결(D14)**: 알 수 없는 `installationId`는 SaaS에선 신규 테넌트, 자체 호스팅에선 `RECONNECT_REQUIRED`(신규인지 재연결인지 관리자가 선택). 재연결은 이전 설치에서 백오피스가 발급한 **1회용 recovery token**(백엔드 저장, 24시간) 제시로만. `cloudId` 일치로 자동 병합 금지.
- 상태 전이를 명시: `NEW → HANDSHAKE_OK → BOUND → ACTIVE`, `ACTIVE → RECONNECT_REQUIRED`(installation 불일치), `ACTIVE → SUSPENDED`(앱 제거, 30일 후 purge). SaaS↔자체 호스팅 전환은 테넌트 export/import 별도 절차, 자동 이동 없음.
- 고객 소유 Forge 앱은 폴백이 아니라 **별도 제품·SKU**다(§11). Preview 종료 리스크는 §12.

---

## 2. 멀티테넌트

### 2.1 테넌트 식별과 bootstrap
- FIT `app.installationId` → `tenant_directory`(RLS 밖, 개인정보 없음, 런타임은 exact-key SELECT만) → `TenantContext`. body 값 불신. `BYPASSRLS` 금지.

```sql
tenant_directory (installation_id TEXT PK, tenant_id UUID UNIQUE, cloud_id TEXT, region TEXT, shard TEXT,
                  binding_state TEXT CHECK IN ('NEW','HANDSHAKE_OK','BOUND','ACTIVE','RECONNECT_REQUIRED','SUSPENDED'),
                  deployment_fingerprint TEXT, bound_at TIMESTAMPTZ)
```

### 2.2 격리 (RLS) — v1.1 동일
- 모든 업무 테이블 `ENABLE`+`FORCE`, 정책 `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`, 인터셉터는 누락을 예외로. 트랜잭션 시작 직후 `set_config(..., true)`, `REQUIRES_NEW`·워커·비동기 경계 재설정, 세션 `SET`·connection-init 금지. 역할 `app_owner`(NOLOGIN)/`app_migrator`/`app_runtime`(`NOBYPASSRLS`)/`app_worker`. 테넌트 범위 인덱스는 `tenant_id` 선두, 운영 인덱스는 `(status, next_at, id)`. 샤딩은 디렉터리·라우팅 인터페이스·export/import까지만.

### 2.3 리전 — v1.1 동일
- 백엔드·PG·스토리지·KMS·백업·로그·DLQ·알림 페이로드 리전 독립.

---

## 3. 데이터 모델

원칙·공통 컬럼·`TEXT + CHECK` 상태는 v1.1 동일.

### 3.1 차원·주체

```sql
tenant          (tenant_id PK, cloud_id, region, timezone, approval_unit, deployment_mode CHECK IN ('SAAS','SELF_HOSTED'),
                 import_status, settings JSONB, created_at)
tenant_user     (tenant_id, user_id UUID, account_id TEXT NULL, pseudonym TEXT NOT NULL,
                 account_active BOOL,            -- Jira 계정 활성(관측값)
                 jira_access BOOL,               -- Jira 제품 접근 권한(관측값)
                 employment_status TEXT CHECK IN ('ACTIVE','LEFT','UNKNOWN'),   -- 업무 판정(관리자 또는 규칙)
                 lifecycle TEXT CHECK IN ('CANDIDATE','REGISTERED','ARCHIVED'), -- 앱 등록 상태(미등록 후보 포함)
                 team_key, team_source TEXT CHECK IN ('MANUAL','EXCEL','JIRA_GROUP'), role_key, level_key,
                 last_seen_in_scan TIMESTAMPTZ, missing_scan_count INT DEFAULT 0,
                 PK(tenant_id, user_id), UNIQUE(tenant_id, account_id))
team            (tenant_id, team_key, name, lead_user_id, source, source_ref, revision, PK(tenant_id, team_key))
project         (tenant_id, project_id UUID, name, status_key, start_date, end_date, PK(tenant_id, project_id))
project_member  (tenant_id, membership_id UUID, project_id, user_id, valid_from, valid_to NULL,
                 PK(tenant_id, membership_id),
                 EXCLUDE USING gist (tenant_id WITH =, project_id WITH =, user_id WITH =, daterange(valid_from, valid_to, '[]') WITH &&))
issue           (tenant_id, issue_id BIGINT, issue_key, jira_project_id, project_id UUID NOT NULL, status_category, parent_issue_id, updated_at,
                 PK(tenant_id, issue_id), UNIQUE(tenant_id, issue_key))
```

- 사용자는 **현재 팀 하나**만 갖는다(현행 앱과 동일). 팀 소스 우선순위: `MANUAL > EXCEL > JIRA_GROUP`. 낮은 소스의 동기화는 높은 소스가 정한 값을 덮지 않는다(Codex 2-26).
- 퇴사자(R-2-8): `employment_status=LEFT`여도 행·집계·이력 유지. 현재 인원·가용 MD 화면만 필터.
- 프로젝트 미매핑 이슈의 워크로그는 저장하지 않는다.

### 3.2 워크로그 원본·locator·투영·이력 — v1.1 동일 (`attachment_count` 제거)

```sql
worklog            (tenant_id, work_date, worklog_id, issue_id, project_id, user_id, seconds CHECK (0 < seconds <= 86400),
                    comment_enc BYTEA NULL, origin, lifecycle, version, created_by, created_at, updated_by, updated_at,
                    PRIMARY KEY (tenant_id, work_date, worklog_id)) PARTITION BY RANGE (work_date);
worklog_locator    (tenant_id, worklog_id, work_date, jira_worklog_id NULL, current_version,
                    PRIMARY KEY (tenant_id, worklog_id), UNIQUE (tenant_id, jira_worklog_id));
worklog_projection (tenant_id, worklog_id, desired_version, desired_hash, projected_version NULL, projected_hash NULL,
                    last_jira_updated NULL, operation_id UUID, state CHECK IN ('PENDING','SYNCED','FAILED','CONFLICT','DEAD'),
                    attempts, next_at, last_error, PRIMARY KEY (tenant_id, worklog_id));
worklog_history    (tenant_id, occurred_at, history_id, worklog_id, version, op, actor_user_id, actor_kind, changed JSONB, reason,
                    PRIMARY KEY (tenant_id, occurred_at, history_id)) PARTITION BY RANGE (occurred_at);
```

- 첨부 수는 컬럼이 아니라 `worklog_attachment` 조회로 계산한다(Codex 2-17). 워크로그당 5장 제한은 `prepare` 트랜잭션에서 `worklog_locator` 행 `FOR UPDATE` 후 count.

### 3.3 롤업 — v1.1 동일
`worklog_daily`, `worklog_monthly`(canonical), `rollup_dirty`, `rollup_version`. 절대 재계산.

### 3.4 승인·마감 — v1.1 동일
`approval_period`(EXCLUDE 겹침 금지), `approval_subject`(사용자별, 스냅샷 승인자), `approval_event`, `period_close`(watermark), `plan`(`UNIQUE NULLS NOT DISTINCT`).

### 3.5 동기화·운영

```sql
inbound_event       (tenant_id, event_id, received_at, PK)                                   -- 30일
jira_sync_cursor    (tenant_id, kind CHECK IN ('WORKLOG_UPDATED','WORKLOG_DELETED','USERS','GROUPS'), stable_since, page_token NULL,
                     scan_id UUID NULL, scan_started_at NULL, PK(tenant_id, kind))
notification_outbox (tenant_id, id, kind, dedupe_key TEXT, recipient_user_id, payload JSONB, threshold_revision INT,
                     state CHECK IN ('READY','LEASED','SENT','FAILED','DEAD'), lease_until NULL, attempts, next_at,
                     PK(tenant_id, id), UNIQUE(tenant_id, dedupe_key))
export_job          (tenant_id, job_id, kind CHECK IN ('SAP_MONTHLY','AUDIT','WORKLOG_CSV'), period, state, object_key,
                     mapping_revision INT, approval_snapshot_at TIMESTAMPTZ, requested_by, created_at, expires_at, PK(tenant_id, job_id))
export_download     (tenant_id, job_id, downloaded_by, downloaded_at, ip_hash)               -- 다운로드 감사
recovery_token      (tenant_id, token_hash, issued_by, issued_at, expires_at, used_at NULL, PK(tenant_id, token_hash))
audit_log           (tenant_id, occurred_at, id, actor_user_id, action, target_kind, target_id, detail JSONB,
                     PK(tenant_id, occurred_at, id)) PARTITION BY RANGE (occurred_at)
```

### 3.6 개인정보·암호화 — v1.1 동일 + 외부 식별자
- `comment_enc` 테넌트 데이터 키 AES-GCM. 이력·감사 평문 금지. BYOK 보류. 자체 호스팅은 `KeyProvider`로 고객 키.
- **외부 식별자(SAP 사번 등)는 `tenant_user`에 두지 않는다.** 목적이 다른 개인정보라 별도 암호화 매핑 테이블로 분리(Codex 2-30).

```sql
external_identity (tenant_id, user_id, system TEXT CHECK IN ('SAP'), external_id_enc BYTEA, revision INT,
                   created_by, created_at, PK(tenant_id, user_id, system))   -- 접근은 export 생성·관리자 화면만, 조회는 audit_log 기록
```

### 3.7 첨부 (D12)

```sql
worklog_attachment (
  tenant_id, attachment_id UUID, worklog_id UUID,
  object_key TEXT, thumb_key TEXT NULL,
  mime TEXT CHECK (mime IN ('image/png','image/jpeg','image/webp')),   -- GIF는 P1 제외(애니메이션·프레임 폭탄)
  size_bytes INT CHECK (0 < size_bytes AND size_bytes <= 10485760),
  width INT, height INT, sha256 TEXT,
  verify_state TEXT CHECK (verify_state IN ('UPLOADING','VERIFYING','READY','REJECTED','DELETED')),
  uploaded_by UUID, created_at, expires_at TIMESTAMPTZ NULL,          -- UPLOADING TTL 30분
  deleted_at NULL,
  PRIMARY KEY (tenant_id, attachment_id),
  FOREIGN KEY (tenant_id, worklog_id) REFERENCES worklog_locator (tenant_id, worklog_id),
  UNIQUE (tenant_id, object_key)
);
CREATE UNIQUE INDEX ux_attachment_active_hash ON worklog_attachment (tenant_id, worklog_id, sha256)
  WHERE verify_state IN ('UPLOADING','VERIFYING','READY');           -- 삭제된 것은 재업로드 허용
tenant_storage_usage  (tenant_id PK, bytes_used BIGINT, bytes_reserved BIGINT, object_count BIGINT, quota_bytes BIGINT, updated_at);
attachment_mirror     (tenant_id, attachment_id, jira_issue_id, jira_attachment_id NULL, operation_id UUID,
                       state CHECK IN ('PENDING','LEASED','MIRRORED','FAILED','DEAD'), lease_until, attempts, next_at,
                       PK(tenant_id, attachment_id));                  -- opt-in 미러 전용
```

- 한도: 워크로그당 5장, 장당 10MB, PNG/JPEG/WebP. 최대 8,000×8,000·총 40MP. 테넌트 쿼터(SaaS 기본 5GB).
- **업로드**: `prepare`가 같은 트랜잭션에서 `tenant_storage_usage.bytes_reserved`를 원자적으로 예약(초과 시 거부)하고, **서명 POST 정책**(content-length-range, content-type 고정, 10분)을 발급. 브라우저 직접 업로드 → `commit` → 워커가 `VERIFYING`: 매직 바이트·크기·해시·픽셀 수 검증, **안전한 디코더로 재인코딩**(메타데이터 제거, 디코더 타임아웃·메모리 상한), 256px 썸네일 → `READY`, 예약을 실사용으로 정산. 실패는 `REJECTED` + 객체 삭제 + 예약 해제. `UPLOADING` TTL 초과는 워커가 정리. 스테이징 prefix 라이프사이클 purge. 주간 실사용량 대조.
- **표시**: `/attachments/{id}/url`이 워크로그 조회 권한(프로젝트 스코프)을 확인하고 5분 서명 GET 발급 → UI가 `fetch`로 받아 blob URL. UI 도메인 선언: SaaS는 스토리지 도메인을 `permissions.external.fetch.client`에 정적 선언, 자체 호스팅은 관리자 설정 화면에서 스토리지 도메인을 `permissions.egress.set()`(fetch.client)로 추가. **base64 폴백 없음**(Codex 2-38). 서명 URL 생성의 base는 설정값(Host 헤더 불신).
- **Jira 이슈 첨부 미러(opt-in, 기본 꺼짐)**: 테넌트 설정으로 켜면 `attachment_mirror` 작업 생성. 조건 `verify_state=READY AND worklog projection SYNCED`. `/sync/dispatch`가 lease 잡고 사용자 토큰 없이는 시스템 토큰으로 `POST /issue/{id}/attachments`(파일명에 `attachment_id` 포함, 재시도 전 이슈 첨부 목록에서 동일 파일명 검색으로 중복 방지). 코멘트 표식·파일명 삽입 없음. 워크로그 이슈 변경 시 이전 이슈의 미러는 삭제 시도 후 새 이슈에 재생성. Jira에서 첨부가 지워져도 우리 원본은 영향 없음. 사용자에게는 "저장 성공 / Jira 미러 실패"를 분리 표시.
- **삭제·보존**: 첨부 삭제·워크로그 삭제 → `DELETED`, 30일 후 원본·썸네일 purge, 미러가 있으면 삭제 시도. **테넌트 오프보딩**(앱 제거 30일 후) → 전 객체·버전·썸네일·스테이징 purge, 백업은 보존 창(30일) 경과로 소멸. **개인정보 삭제 요청(DSR)** 절차 별도: 관리자가 특정 첨부를 지정 삭제, `audit_log` 기록. 법적 보존 vs 삭제 요청 충돌은 테넌트 설정이 아니라 **계약 정책**.
- `BlobStore`: `S3BlobStore`만(SaaS·MinIO). 로컬 디스크는 보류.

---

## 4. 파티셔닝·인덱스·조회 성능 — v1.1 동일 + 첨부 인덱스

- 월 RANGE(`worklog`, `worklog_daily`, `worklog_history`, `audit_log`), Spring 스케줄 파티션 관리, locator 경유 단건, 3년 DETACH.
- 인덱스 v1.1 표 그대로. 추가: `worklog_attachment (tenant_id, worklog_id) WHERE verify_state='READY'`, `(verify_state, expires_at) WHERE verify_state='UPLOADING'`, `attachment_mirror (state, next_at)`.
- 롤업 `INCLUDE` 금지, keyset·서명 커서, `statement_timeout`, N+1 금지, export는 별도 잡. 캐시 P1은 Caffeine만. 통계는 autovacuum + import 직후 `ANALYZE`.
- 용량 목표 v1.1 + 첨부: 200명 연 36GB/테넌트 가정, 쿼터·purge 필수.

---

## 5. 동기화 (우리 DB ↔ Jira) — v1.1 동일

- 5.1 우리→Jira: 화면은 사용자 토큰 동기 투영, 지연분은 `/sync/dispatch`(시스템 토큰, 작성자 앱 계정 → 프로퍼티 `movesRms.worklog`에 원 작성자, **고객 수용 계약 조건**), `operation_id` 멱등, C/U/D 직렬화·coalesce, 5회 `DEAD`.
- 5.2 Jira→우리: canonical hash로 자기 이벤트 판정, 판정 ①마감·승인 → 보상 복구 ②미소속 → 보상 복구 ③수용(`SUBMITTED→OPEN`). `CONFLICT`. 삭제 복구는 재생성+`REMAP`. 보정 스윕 15분(overlap 10분, 페이지 커밋 후 커서).
- 5.3 초기 적재: watermark → 전량 → 재생 → 롤업 → `ACTIVE`. `/sync/import`를 Forge 스케줄이 반복 호출.
- **모든 쓰기 경로(API·이벤트 수용·import·이슈 리맵·관리자 보정)는 하나의 `MembershipPolicy.assertMember(tenant, project, user, date)`를 통과한다**(Codex 2-27). 미소속 수용 설정은 요구 준수 모드에서 제공하지 않는다.

---

## 6. 승인·마감·인원·알림·SAP

### 6.1 승인 / 6.2 마감 — v1.1 동일
- 잠금은 우리 API 거부 + Jira 우회 탐지 후 복구. **수용 기준에 "Jira 직접 입력은 일시적으로 생성된 뒤 복구된다"를 명시**(§14).

### 6.3 프로젝트 미소속자 작성 금지 (R-2-6)
- `MembershipPolicy` 단일 판정(§5). Jira 화면 경유는 탐지 후 복구. Jira 프로젝트 역할 동기화는 보류(§11).

### 6.4 인원 관리 자동화 (R-1-1 ~ R-1-3)
- **Jira 사용자·그룹 동기화**(`/sync/users`, 1시간, 시스템 토큰): `users/search`(페이지 체크포인트 `jira_sync_cursor.page_token`, `429 Retry-After` 존중, 토큰 수명 안에서 이어받기)로 `account_active`·`jira_access` 관측. 그룹은 `group/member` 대상 그룹만(전체 그룹 스캔 금지, 사용량 측정 후 주기 조정).
- **퇴사 판정 규칙**(Codex 2-25): `account_active=false`가 **관측된 경우에만** 즉시 `employment_status=LEFT`. 스캔에서 "없음"은 **완전 스캔 3회 연속** 부재일 때만 `UNKNOWN` 후보로 표시하고 관리자가 확정. 자동 `LEFT` 전환 금지.
- **신규 입사**: 자동 등록하지 않고 `lifecycle=CANDIDATE`로 "미등록 후보" 목록에 표시(라이선스·급여 입력 필요). 테넌트 설정으로 자동 등록 전환 가능.
- **팀 자동 구성**: `team.source=JIRA_GROUP` 팀은 그룹 멤버십으로 구성원 갱신. 한 사용자가 여러 매핑 그룹에 속하면 **팀 우선순위 목록**(관리자 지정)으로 하나를 고른다. Atlassian 조직·팀 API는 §12-15 검증 후.
- **엑셀 조직도 import**: 현 백오피스 업로드(Forge 큐) 유지, 파싱 결과를 `/api/meta/sync`로 반영. `team_source=EXCEL`. `MANUAL` 값은 덮지 않는다.
- SAP 인력 데이터: 범위 미정. 별도 입력 형식을 만들지 않는다(§11).

### 6.5 알림 (R-2-7) — **검증 필요**
- 계획 초과 판정: 월 배치가 `plan` 대비 `worklog_monthly` 비교 → `notification_outbox`(dedupe `tenant:project:month:threshold_revision`, 수신자 = 프로젝트 PM).
- 발송: Forge 스케줄(5분) → `/sync/notifications`(시스템 토큰) → lease N건 → 같은 요청 안에서 발송 → `SENT/FAILED` ack.
- **발송 채널은 미확정.** Jira에는 임의 사용자에게 일반 메일을 보내는 API가 없고, `POST /issue/{key}/notify`는 이슈에 귀속된다. 후보: ① 앱 내 알림(백오피스·마이페이지 배너, P4 기본) ② 프로젝트별 "관리 이슈"를 지정해 `issue/notify`로 메일(고객이 이슈 지정, 옵션) ③ 자체 호스팅 SMTP / SaaS 메일 공급자(계약 후). §12-17. **R-2-7 상태는 "검증 필요"**.

### 6.6 SAP 연동 (R-3)
- **export 파일 생성까지만 설계 완료**로 본다. 월 1회 `export_job(SAP_MONTHLY)`: 기간의 워크로그(사용자 식별자·프로젝트·이슈·일자·초·승인 상태) + 프로젝트. 생성 시점의 `mapping_revision`·`approval_snapshot_at`을 고정해 같은 달 재생성 결과가 임의로 달라지지 않게 한다. 서명 URL 24시간·1회성, `export_download` 감사, 파일 보존 90일.
- **식별자**: SAP가 가명으로 충분한지 사번이 필요한지 **명세 확정 후** 결정. 사번이면 `external_identity`(암호화, 접근 감사)에서 export 생성 시에만 복호화.
- 전달 방식은 명세 후 **하나만** 선택(apiRoute / 웹트리거 / 자체 호스팅 push). 키 발급·회전·폐기·재생 방지·테넌트 바인딩은 그때 설계.

### 6.7 공휴일 (R-4-2) — 보류
- P1: 현 Forge 저장소가 원본, 가용 MD 계산에 필요한 정규화된 날짜만 `/api/meta/sync`로 백엔드에 동기화. 외부 공휴일 API는 국가·공급자 확정 전까지 만들지 않는다.

---

## 7. 인증·인가
- 필터 1개: FIT JWKS(캐시 1시간) → `aud`·`iss`·`exp`·`nbf` → 디렉터리 → 바인딩 상태 → `TenantContext`. **실패 401도 고정 JSON**(invokeRemote 계약, Codex 2-8): `{"success":false,"error":{"code":"FIT_INVALID","message":"Remote authentication failed","traceId":"..."}}`. 내부 사유 비노출.
- 권한 판정 이식(`PermissionMap`·`ProjectScope`·`TeamAnalyticsScope`·`CostAccess`), FIT principal + `tenant_user`·`project_member`. `SYSTEM` 주체 명시.
- 토큰은 `/api-user`·`/sync/*`에만 도착한다. 저장·로그 금지, 요청 수명 밖 사용 금지. `/api/*`에 토큰 헤더가 오면 무시하고 경고 로그.
- 자체 호스팅 설정 화면은 Jira 관리자만. URL 변경·바인딩·recovery token 발급은 전부 `audit_log`.

---

## 8. 프론트 차용 (D13)

- **화면·스토어·쿼리키·라우팅 유지.** 바꾸는 것은 호출 한 층과 import 한 줄.
- 139개 파일의 `import {invoke} from '@forge/bridge'`를 codemod로 `import {invoke} from '@/utils/backend/invoke'`로 치환(호출 인자·소비 코드 무변경). craco alias로 `@forge/bridge` 자체를 바꾸지 않는다(다른 export를 가리기 쉽다).

```
static/ui/src/utils/backend/
  ├─ invoke.js       // invoke(name, payload): registry 조회 → 백엔드 or 원본 @forge/bridge invoke
  ├─ registry.js     // name → { endpoint:'api'|'api-user', path, method, kind:'query'|'mutation', timeoutMs, requires:[capability] }
  ├─ transport.js    // invokeRemote 호출, 오류 분류, 커넥션 revision
  └─ version.js      // /version 캐시(installation·connection revision별), capability 확인
```

- **응답 계약**: 성공 `{success:true, ...result}` 스프레드(코드 사실), 실패 `{success:false, error:{name, code, message, cause}}`. 백엔드가 동일 형태로 응답하고, 전환 대상 resolver마다 **contract fixture**(현 응답 캡처)로 계약 테스트를 둔다.
- **오류 분류**(Codex 2-21): `invokeRemote` rejection·비 JSON·타임아웃·401 → `{success:false, error:{code:'TRANSPORT_ERROR'|'AUTH_ERROR'|'VERSION_INCOMPATIBLE', message, traceId}}`로 정규화. `cause`에 URL·토큰·스택을 넣지 않는다.
- **재시도·멱등**(Codex 2-22): `kind:'query'`만 제한 재시도(`Retry-After` 존중), `kind:'mutation'`은 자동 재시도 없음 + 클라이언트 `operationId` 필수(백엔드가 멱등 처리). 처리 중/결과 미확인 상태를 UI에 구분.
- **커넥션 revision**(Codex 2-23): 원격지 설정·백엔드 버전 변경을 감지하면 `QueryClient` 전체 폐기 + 페이지 재로드. 쿼리키에 URL을 넣지 않는다.
- **전환 단위**(Codex 2-24): "mutation + 그 데이터를 읽는 모든 query + invalidation"을 하나의 cutover unit으로 registry에 묶어 함께 전환. 전환 전엔 shadow read 비교만, 전환 후 런타임 실패로 구 resolver 폴백 **금지**(특히 mutation). Forge 메타 사본엔 revision을 두고 백엔드 집계 응답이 요구 최소 revision을 명시.
- 1차 cutover unit: ① 내 워크로그(CRUD+목록+캘린더) ② 이슈 패널 워크로그 ③ 프로젝트 공수 집계(진척·인력·팀·포트폴리오의 공수 부분) ④ 작업 이력. 남는 것: 라이선스, 백오피스 메타 CRUD, 급여·비용 환산, `utils/jiraApi/*` 직접 호출.
- 첨부 UI: 워크로그 모달 드롭존(5장·10MB) + 썸네일 스트립, 표시는 §3.7 blob.

---

## 9. 스택·운영 — v2.0 동일
- 자체 호스팅 배포물: Docker(backend·worker) + Compose/Helm + `.env` 템플릿(MODE, DB, S3, KMS, APP_ID) + Flyway 자동 + 진단 번들. 업그레이드·롤백 가이드("Forge UI 하위 호환"과 "백엔드 롤백"을 분리 서술).
- 테스트 고정: RLS 3케이스, 롤업·POST·첨부 미러 재시도 멱등, 잠금 race, 이벤트 역순, 첨부 매직 바이트·픽셀·쿼터 예약, 바인딩 상태 전이, 두 모드 계약 테스트, resolver contract fixture.

---

## 10. 단계별 이행

| 단계 | 내용 |
|------|------|
| P0 | 골격: FIT 필터·엔드포인트 3분리, 디렉터리·바인딩 상태·RLS·역할, Flyway, 파티션 잡, 관측, SaaS 리전 1개, 프론트 codemod + registry(빈 상태) + contract fixture 수집 |
| P1 | 원본 CRUD + 동기 투영 + `/sync/dispatch` + locator/projection + 이력 + 초기 적재. cutover unit ①② |
| P2 | dirty-key 롤업 + 집계 API. cutover unit ③④ |
| P3 | 이벤트 수용·보상 복구·보정 스윕·CONFLICT·`MembershipPolicy` |
| P4 | 승인 subject·기간 마감·감사·앱 내 알림·인원 동기화(후보·퇴사 규칙)·퇴사자 필터 |
| P5 | 첨부(예약·업로드·검증·썸네일·서명 GET·purge) |
| P6 | 자체 호스팅: 고객 관리형 원격지 설정·핸드셰이크·바인딩·recovery token, Docker 배포물, contract/capability 호환 |
| P7 | SAP export 파일 + 전달 방식 1개, 2번째 리전, (계약 시) 메일 채널·Jira 미러 opt-in |

---

## 11. 보류 (측정·계약 후)

| 항목 | 도입 조건 |
|------|-----------|
| Redis / read replica / 축별 롤업 / 서브파티션 / `pg_trgm` / `pg_partman` / BYOK | v1.1과 동일 |
| Jira 이슈 첨부 미러(opt-in 구현 자체) | 고객이 Jira 이슈 첨부에서도 보여야 한다고 요구할 때 |
| `FsBlobStore`(로컬 디스크) | 소규모 자체 호스팅 요구 확인 시. 그전엔 S3 호환만 |
| N-2 호환 보장 | 릴리스 주기·고객 업그레이드 주기 확인 후. 초기는 현재·직전 revision |
| 고객 소유 Forge 앱 | 별도 제품·SKU. Preview 종료 시 사업성 판단 후 |
| 외부 공휴일 API | 국가·공급자 확정 시 |
| Jira 프로젝트 역할 동기화 | 고객이 권한 스킴 변경 수용 시 |
| SMTP / 메일 공급자 | 계약 시(§6.5 채널 결정) |
| SAP push·복수 전달 방식·SAP 인력 입력 형식 | 명세 확정 시 하나만 |
| 첨부 바이러스 스캔·GIF | 문서 첨부 확장 시 |

---

## 12. 착수 전 검증·리스크

| # | 항목 | 방법 |
|---|------|------|
| 1 | `endpoint.auth`가 엔드포인트 단위로 토큰 동봉을 제어하는지, 고객 관리형 원격지에도 동일한지 | dev 실측 (P0 첫 항목) |
| 2 | 고객 관리형 원격지 Preview 종료 창 | 공식 공지 추적. 대안은 별도 제품(§11) |
| 3 | `configurable.enabled` 프로덕션 배포 후 제거 불가 | 결정 승인 |
| 4 | Forge Remote 리전 라우팅·테넌트 리전 이동 훅 | 문서 + dev 배포 |
| 5 | 시스템 토큰 작성 워크로그의 앱 계정 작성자 표시 수용 | 고객 확인 |
| 6 | Jira 워크로그 프로퍼티(operation_id) 지원 범위 | REST 실측 |
| 7 | 워크로그 이벤트 페이로드 | dev 트리거 실측 |
| 8 | RLS + PgBouncer 3케이스 | 통합 테스트 |
| 9 | 파티션 PK·EXCLUDE·`NULLS NOT DISTINCT`·partial unique DDL | Flyway dry-run |
| 10 | 행 크기·인덱스·WAL 실측, `EXPLAIN` | 1천만 행 부하 시험 |
| 11 | 이슈별 워크로그 전량 반환 규칙 | 현 `getExtraWorklogs` 재확인 |
| 12 | 기존 Forge SQL 데이터 이전 vs 사본 | 설계 결정 |
| 13 | 서명 POST 정책 + Forge UI `fetch.client` + S3 CORS, 자체 호스팅 `permissions.egress.set(fetch.client)` | dev 실측 |
| 14 | Jira 이슈 첨부 API 한도(opt-in 시) | 실측 |
| 15 | Atlassian 조직·팀 API의 Forge 스코프 접근 | 문서·실측 |
| 16 | `users/search` 페이징·rate limit·비활성 반환 여부, `group/member` `includeInactiveUsers` | 실측 |
| 17 | **알림 채널**: `issue/notify` 이슈 귀속 방식이 고객에게 수용되는지, 아니면 메일 공급자 계약인지 | 고객 확인 |
| 18 | SAP 식별자(가명 vs 사번)·형식·전달 인증 | SAP 명세 |
| 19 | codemod 후 `invoke` 호출 236곳 contract fixture 통과 | CI |
| 20 | `invokeRemote` 요청 본문 크기 한도 | 실측 |

---

## 13. 검토 반영 이력

| 버전 | 내용 |
|------|------|
| v1.0 | 초안 |
| v1.1 | Codex 1차: 파티션 PK·locator, dirty-key 롤업, Jira 토큰 pull, approval_subject, RLS bootstrap 등 반드시 수정 14건 |
| v2.0 | 요구 추가: 배포 2모드, 첨부, 프론트 차용, 인원·알림·SAP, 요구 매핑 |
| v2.1 | Codex 2차 반드시 수정 17건·권장 9건 반영: 토큰 엔드포인트 분리·핸드셰이크·바인딩·recovery token, 401 JSON, contract/capability, Jira 미러 opt-in·코멘트 표식 제거·표시는 서명 GET blob, 쿼터 예약·TTL·purge·재인코딩·GDPR, `attachment_count` 제거·FK·partial unique, 응답 스프레드 확정·codemod·오류 분류·mutation 무재시도·cutover unit·커넥션 revision, 퇴사 판정 규칙·후보 lifecycle·팀 소스 우선순위, 알림 pull 경로·채널 검증 필요, SAP 식별자 분리·artifact revision·다운로드 감사, `MembershipPolicy` 단일화, 레지던시 문구, §14 상태 하향. 보류 8건 추가 |

---

## 14. 요구사항 전수 매핑

수용 기준(계약 문구에 넣을 본질적 제한):
- **잠금·미소속 금지는 우리 앱에서는 차단, Jira 화면 직접 입력은 일시 생성 뒤 탐지·복구.** 사전 차단은 고객의 Jira 권한 스킴 변경이 있어야 한다.
- 시스템 토큰으로 지연 반영된 Jira 워크로그의 작성자는 앱 계정으로 보인다.
- 자체 호스팅은 Atlassian 데이터 레지던시 보증 대상이 아니다.

| ID | 고객 요구 | 설계 위치 | 상태 |
|----|-----------|-----------|------|
| R-1-1 | 입사·퇴사 자동 반영 | §6.4 (퇴사는 계정 비활성 관측 시만, 입사는 후보) | 부분 |
| R-1-2 | Atlassian 조직 반영(1순위) | §6.4 Jira 그룹 기준, 조직·팀 API는 §12-15 | 부분 |
| R-1-3 | 엑셀 조직도 → 팀 import | §6.4, 소스 우선순위 | 부분(구성원 충돌 규칙 확정 후 설계됨) |
| R-1-4 | 프로젝트·팀 별개 관리 | 현행 유지 | 충족 |
| R-1-5 | SAP 인력 데이터 | 범위 미정 | 미설계 |
| R-2-1 | 워크로그 잠금·승인 | §6.1·6.2 + 수용 기준 | 부분(탐지 후 복구) |
| R-2-2 | 단순 단계·팀장 일괄 승인 | `approval_subject` 일괄 CAS | 설계됨 |
| R-2-3 | 팀별 승인 체계 | 팀×기간 | 설계됨 |
| R-2-4 | 리뷰어 기록 | `approval_event`, 승인자 스냅샷 | 설계됨 |
| R-2-5 | 변경 이력 감사 로그 | `worklog_history`, `audit_log` | 설계됨 |
| R-2-6 | 미소속자 워크로그 금지 | `MembershipPolicy` + 탐지 후 복구 | 부분 |
| R-2-7 | 계획 초과 PM 메일 | §6.5 판정·outbox·pull 발송. 채널 미확정 | 검증 필요 |
| R-2-8 | 퇴사자 데이터 보존 | `employment_status` 필터만 | 설계됨 |
| R-3-1~3 | SAP 시간·프로젝트 데이터 | §6.6 export 파일까지 | 부분(식별자·전달 명세 대기) |
| R-4-1 | OKR | — | 범위 밖 |
| R-4-2 | 공휴일 자동 import | §6.7 | 보류 |
| R-4-3 | Outlook | — | 범위 밖 |
| A | API 키·REST/OData | 선행 문서. OData 미지원 | 부분 |
| 신규 | Jira 동기화(Tempo 동일) | D1·§5 | 설계됨 |
| 신규 | 프론트 현행 차용 | D13·§8 | 부분(contract fixture·cutover unit 확정 후 설계됨) |
| 신규 | SaaS/자체 호스팅 2모드 | D11·D14·§1.2 | 부분(§12-1·2 검증 후 설계됨) |
| 신규 | 이미지 첨부 | D12·§3.7 | 설계됨(미러는 opt-in 보류) |
