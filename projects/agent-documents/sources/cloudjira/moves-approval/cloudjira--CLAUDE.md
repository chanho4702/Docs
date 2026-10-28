# moves-approval — Confluence Cloud 승인 앱 (Forge)

> 현행화 기준: 2026-10-22 · 소스 커밋 `86a7586` (development 6.1.0)
> 작업 규칙(스타일·불변식·보안·검증·배포·커밋)은 `AGENTS.md` 를 함께 볼 것.

Confluence DC 승인 앱(`C:\Onpremise\confluence-approval-dc`)을 Forge(Cloud)로 옮기는 프로젝트.
재컴파일이 아니라 **재작성**이다 — 저장·동시성·UI·알림·권한 어느 계층도 겹치지 않는다.

| 계층 | DC | Forge Cloud |
|---|---|---|
| 저장 | Active Objects (트랜잭션·FK) | Forge SQL(TiDB) — **트랜잭션·FK 없음, 문장당 단일 쿼리** |
| 동시성 | Beehive 클러스터 락 | **없음** → 낙관적 CAS |
| UI | Java 가 HTML 문자열 조립 | React Custom UI (샌드박스 iframe) |
| 알림 | Confluence MailQueue | **메일 API 없음** → 앱 내 알림함만 |
| 권한 | PermissionManager 직접 호출 | Cloud REST 를 `asUser()` 로 |

이식되는 것은 **도메인 상태 머신의 규칙**과 **화면 설계 의도**뿐이다.

## 확정 결정

| 항목 | 결정 |
|---|---|
| 범위 | MVP 우선 후 단계 확장 |
| 알림 | 앱 내 알림함만 (이메일 없음) |
| 배포 | Atlassian Marketplace 출시 |
| 저장소 | Forge SQL + KVS 혼합 (관계·집계는 SQL, 스칼라 설정만 KVS) |
| 프론트 | 별도 npm 패키지 `static/ui` + CRA/craco 멀티 엔트리 |
| 개발 사이트 | https://tom-chkim-dev.atlassian.net (development 환경) |
| 과금 | **유료 앱**(`app.licensing.enabled`). 차단은 명시적 INACTIVE 만, 서버(`assertLicenseAllowed`)·화면(`useLicenseStore`) 같은 경계. UI 모듈에 `appIsLicensed` 조건은 걸지 않는다 |
| 관측 | Sentry(프론트만). DSN 은 환경 변수 `SENTRY_DSN` → `getSentryDSN` resolver. 변수 없으면 꺼진다 |

## 디렉터리

```
src/
  domain/approval/   상태 머신. **SQL 무발행, Confluence API 무호출, now 는 항상 주입**
  permission/        guardedDefine · PermissionMap · PrincipalResolver · ConfluencePermission
  rdb/               schema/{ddl,migrate,TableReadiness} · query/{CommonQuery,QueryBuilder}
  api/confluence/    RequestConfluence — asUser 기본, asApp 은 사유 인자 강제
  resolver/{도메인}/  XxxController · XxxService · XxxRepository
                     (retention·storage: 데이터 관리 / approval/StampBoxInserter·CertificateService: 결재란 삽입·증명서
                      / privacy/PrivacyReporter: 개인정보 보고·폐쇄 계정 삭제)
  trigger/           얇은 어댑터만. 로직은 resolver 서비스로 위임. 주기 작업은 하루 한 번 runSweep 하나뿐
  error/ utils/      에러 6종 · ResponseWrapper · ErrorCodes · LicenseGuard · runtimeScope(캐시는 invocation/설치 범위로만)
  resolver/observability/ SentryController(getSentryDSN, PUBLIC)
static/ui/           별도 패키지. entries/{macro,stamp,modal,inbox,feed,settings} — 배너·byline·spike 엔트리는 제거됨(상태·진입점은 byline dynamicProperties + modal)
                     app/mount·AppProviders(테마 + **라이선스 게이트**, variant page/modal/compact) · app/license(useLicenseStore·LicenseGuide·TrialExpiryBanner) · app/sentry.js(동적 청크)
                     components/table(워크포스 표 키트) · components/StampBox · utils/excel(xlsx 공용) · features/certificate(PDF)
test/                횡단 계약 테스트
```

## 계층 규약

**resolver 등록은 3단계다. 하나라도 빠지면 런타임에서만 죽는다.**
1. Controller 에서 `guardedDefine(resolver, name, handler)`
2. `src/permission/PermissionMap.js` 에 선언 — 미선언은 `PERMISSION_UNMAPPED` 로 원천 거부
3. `src/index.js` 의 `CONTROLLER_REGISTRARS` 에 추가
계약 테스트(`test/permission/permissionMap.contract.test.js`)가 이 세 곳을 대조한다.

**권한 축**(워크포스의 리소스×액션과 다르다):
`'PUBLIC'` | `'SELF'` | `{page:'view'|'edit', pageIdKey}` | `{admin:true}` | `{confluenceAdmin:true}`

**응답**: 성공 `{success:true, ...result}` / 실패 `{success:false, error:{name,code,message,cause}}`.
프론트는 `error.name` 이 아니라 **`error.code`** 로 분기한다.

**서버는 사람이 읽을 문구를 만들지 않는다.** 에러는 코드로, 알림·감사는 `{templateKey, vars}` 로
저장하고 렌더 시점에 번역한다. DC 는 발송 시점 언어로 굳혀 저장해 다른 언어 사용자에게 그대로 보였다.

## 절대 깨면 안 되는 불변식

1. **열린 요청은 대상당 하나** — `scopeKey()` → `dedupe_key` UNIQUE. Forge 엔 락이 없어 이게 **유일한 방어선**이다.
2. **결정이 진실, 상태는 파생** — `approval_approver` 행이 원천이고 `status`/`current_step_order` 는 재계산 가능한 캐시다. 이 성질 덕분에 CAS 실패 후 재계산-재시도가 수렴한다.
3. **도메인은 순수** — `transitions.js`/`derive.js` 에 부작용 금지. `Date.now()` 를 읽으면 재시도 2회차가 다른 결과를 내고 수렴 논증이 무너진다. `now` 는 인자로 주입한다.
4. **CAS UPDATE 의 SET 절에 `rev = rev + 1` 필수** — MySQL affectedRows 는 "값이 실제로 바뀐 행"이라 같은 상태로의 전이가 CAS 실패로 오판된다.
5. **승인자 행은 삭제-재삽입 금지** — `PK(request_id, step_order, actor_key)` + `WHERE decision_type='PENDING'` 조건부 UPDATE 로 남의 결정을 덮을 수 없게 한다.
6. **감사 이벤트 id 는 결정적** — 랜덤 UUID 를 쓰면 CAS 재시도마다 이력이 쌓인다.
7. **복원은 재번호하지 않는다** — 드리프트는 던져야 리컨실러가 고친다. 조용히 고치면 뒤 단계가 앞으로 당겨져 엉뚱한 사람 차례가 된다(권한 상승).
8. **가드 통과 ≠ 데이터 범위 확정** — 목록 resolver 는 통과 후에도 `filterVisiblePages` 로 건별 가시성을 다시 좁힌다.
9. **`asUser()` 가 기본** — `asApp()` 은 사용자 컨텍스트가 없는 경로만. 그 결과를 사용자에게 반환하지 않는다.

## 실측으로 확인한 플랫폼 함정

| 함정 | 내용 |
|---|---|
| **route 인코딩** | `route` 는 보간값을 URL 인코딩한다. `route\`...?${qs}\`` 로 쿼리스트링을 통째로 넣으면 필터가 사라지고 **전체 목록이 돌아온다**. 완성된 문자열은 Forge 가 거부하므로 template strings 배열을 직접 만들어 `route(strings, ...values)` 로 호출한다(`filterVisiblePages` 참조). |
| **페이지 권한 API** | v1 `POST content/{id}/permission/check` 는 operation 을 객체로 못 받아 400. **`GET /wiki/api/v2/pages/{id}/operations`** 를 쓴다 — GET 한 번에 전 권한이 온다. |
| **이벤트 scope** | `avi:confluence:updated:page` 는 granular 등가가 없고 classic `read:confluence-content.summary` 를 강제한다. classic+granular 혼합 배포는 **실제로 된다**(팀 관례의 우려와 다름). |
| **affectedRows** | `ON DUPLICATE KEY UPDATE` 는 신규 1, 갱신 **2** 를 반환한다. |
| **CRA 멀티 엔트리** | CRA 는 단일 엔트리(`main`)를 전제한다. `WebpackManifestPlugin`/`InlineChunkHtmlPlugin` 이 `entrypoints.main` 을 참조해 죽으므로 craco 에서 제거한다. `public/index.html`·`src/index.js` 는 CRA 검증 통과용 자리 표시자다(번들에 안 들어간다). |
| **SQL 추가 = major upgrade** | `sql` 모듈을 넣으면 major version upgrade 가 발생한다(`--approve MAJOR_VERSION_RULE`). |
| **TIMESTAMP 에 숫자 바인딩 불가** | TiDB 는 epoch ms 숫자를 `TIMESTAMP` 로 암묵 변환하지 않는다(`ERROR 1105: cannot convert datum from double to type timestamp`). 도메인은 숫자로 비교하고 Repository 가 `rdb/query/SqlTime.js` 로 `'YYYY-MM-DD HH:MM:SS'`(UTC) 문자열과 상호 변환한다. 새 Repository 도 이 경계를 지킨다. |
| **byline dynamicProperties 규약** | 핸들러는 `(payload, context)` 로 호출되고 문서 id 는 `payload.extension.content.id`. 반환은 `{ title, icon, tooltip }` 뿐이며 **`isHidden` 은 없다**(항목을 숨길 수 없다). dev 환경은 제목에 " (Development)" 가 붙는다. |
| **헤더 툴바 슬롯 없음** | 편집·공유 버튼 옆에 앱 버튼을 두는 모듈이 없다. contentAction=••• 메뉴, byline=제목 아래, pageBanner=상단 띠가 전부다. 진입점은 byline 항목(클릭 → 모달)으로 통일했다. |
| **매크로 높이는 #root 를 재야 한다** | iframe 안의 `<html>` 은 뷰포트 높이에 묶여 내용이 자라도 크기가 변하지 않는다. `<html>` 을 관찰하면 이름·서명 이미지가 늦게 와 길어진 만큼 **아래가 잘린다**(실측). `app/useMacroViewport` 가 #root 를 관찰하고 이미지 load(캡처)에도 다시 잰다. 매크로 HTML 은 body 여백 0. |
| **REST 로 넣는 Forge 매크로 ADF 는 ARI extensionKey** | `ari:cloud:ecosystem::extension/{appId}/{envId}/static/{moduleKey}` 여야 렌더된다(모듈 키만이면 "확장 기능 로드 오류"). app/env id 는 `getAppContext()` 에서. 본문에서 우리 매크로를 찾을 땐 `/static/{moduleKey}` 접미사로 판별(환경마다 앞부분이 다르다). |
| **`forge logs` 는 늦게 온다** | 트리거·스윕 로그가 수 분 뒤에 보이거나 필터에 안 잡힌다. 트리거 동작은 로그가 아니라 **결과 상태(byline·DB)** 로 확인한다. |
| **이미지 자산은 iframe 에서 안 뜬다** | 아바타(`/wiki/aa-avatar/…`)·스페이스 로고는 사이트 쿠키가 필요하고, `requestConfluence` 프록시는 API 경로만 통과시켜 서버가 대신 읽을 수도 없다. 절대 URL 로 시도하고 실패하면 **이니셜 아바타**로 떨어진다(`PersonAvatar`). 실루엣 아이콘은 사용자가 "안 나온다"로 읽는다. |
| **컬럼 추가 = ALTER 마이그레이션** | `ALTER TABLE … ADD COLUMN IF NOT EXISTS` 를 `vNNN_alter_*` 로 넣는다. 배포 직후에는 인스턴스별 첫 resolver 호출이 `ensureMigratedOnce` 로 적용한다(예전엔 스파이크 페이지를 열어 돌렸다 — 스파이크는 PUBLIC resolver 로 페이지 생성까지 열려 있어 제거). byline·트리거처럼 resolver 를 거치지 않는 경로는 시간당 스윕까지 새 컬럼을 읽지 않게 둔다. |
| **정책 기본값과 KVS 키 맵은 같은 집합이어야 한다** | 기본값에만 있는 키는 `store.get(undefined)` 가 되어 **정책 조회 전체**가 `UNKNOWN_ERROR` 로 죽는다(`restrictAccess`·`approverSpaceCheck` 누락으로 설정 화면이 통째로 에러였다). 모듈 로드 시 즉시 던지고, 계약 테스트가 대조한다. 화면 에러 메시지는 원인을 못 알려 주므로 스파이크 `probeSettings` 로 실패 지점을 좁혔다. |
| **lazy 청크는 배포 직후 백지를 만든다** | 설정처럼 `React.lazy` 로 나눈 화면은, 캐시된 옛 문서가 사라진 청크를 요청하면 Suspense 아래 트리가 통째로 언마운트되어 흰 화면이 된다. 청크 로드 실패 시 한 번만 `location.reload()` 로 복구한다. |
| **모달 안에서 `100vh` 는 되먹임을 만든다** | Forge Custom UI iframe 은 내용 높이에 맞춰 스스로 커진다. `minHeight: calc(100vh - …)` 로 버튼을 바닥에 붙이면 커진 iframe 이 다시 100vh 를 키워 720px 까지 부풀고, 부모 뷰포트가 그보다 낮은 노트북에서는 **하단 버튼이 잘려 아예 눌리지 않는다**(승인·반려를 누를 방법이 사라진다). 모달 높이는 내용이 정하게 둔다. |
| **잔존 `forge tunnel` 세션이 배포본을 가린다** | 터널이 떠 있으면(또는 비정상 종료로 세션이 남으면) Confluence 가 iframe `src` 를 `http://localhost:8000/…` 로 내려 화면이 **빈 채로** 뜬다. 배포 검증 전에 `cloudflared`/`forge tunnel` 프로세스가 없는지 본다. |
| **아바타 절대 URL 은 된다** | `siteUrl + /wiki/aa-avatar/…` 를 iframe `<img>` 로 쓰면 실제 프로필 사진이 뜬다(실측). `requestConfluence` 로 이미지를 프록시하는 건 API 게이트웨이가 막는다. 못 뜨면 `PersonAvatar` 가 이니셜로 대체. |
| **globalPage 는 최상위 fetch 를 안 거친다** | 페이지 뷰에서는 상위 창 `fetch` 를 패치해 resolver 응답을 읽을 수 있지만, 업무함(globalPage)에서는 잡히지 않는다(중첩 프레임). 진단은 페이지 뷰 모달에서 한다. |
| **asApp 사용처** | ExpiryService(`loadPageAsApp`) — 트리거·스윕에 사용자 컨텍스트가 없다. 읽은 본문은 버전 비교·영역 해시에만 쓴다. 그 밖에 라이선스 self-query, 개인정보 보고, 보관 정리의 페이지 존재 판정(`filterRetainablePages`)뿐이다. 전체 목록과 사유는 AGENTS.md 보안 1~5번. |
| **라이선스 가드가 있어도 manifest `licensing` 이 없으면 무료 앱이다** | `LicenseGuard`·`ResponseWrapper` 가 다 있어도 `app.licensing.enabled` 가 없으면 context 에 `license` 가 실리지 않아 production 에서 전부 '판정 불가(통과)' 로 끝난다 — 코드는 다 있는데 과금만 안 되는 상태가 조용히 지속된다(2026-10-07 발견). `test/manifest/licensing.contract.test.js` 가 고정한다. 화면 게이트는 엔트리마다가 아니라 `mount` 한 곳에 둔다(하나가 빠지면 그 화면만 결제 없이 열린다). |
| **egress 추가 = major upgrade** | `permissions.external.fetch` 를 넣거나 바꾸면 `MAJOR_VERSION_RULE` 승인이 필요하다(`sql` 추가와 같다). |
| **resolver 예외는 서버 로그에 안 남는다** | `responseWrapper` 가 삼켜 `forge logs` 가 비어 있었다. 지금은 LogicalError·PermissionError·ConcurrencyError 외의 예외를 `[RESOLVER]` 로 남긴다. 그래도 안 보이면 상위 페이지 `fetch` 를 가로채 `error.cause.context.debug.message` 를 읽는다 — **development 에서만** 실린다(production 은 원문 노출을 막으려 업무 오류 외 `cause` 를 비운다). |
| **warm runtime 은 다른 사이트 호출에도 재사용된다** | Forge 문서가 "미완료 작업이 다른 테넌트의 invocation 에서 이어질 수 있다"고 명시하고 테넌트 데이터를 전역 변수에 두지 말라고 요건으로 정한다. 키 없는 모듈 캐시(관리자 판정·명부·마이그레이션 플래그·테이블 준비)는 교차 테넌트 권한 상승이 된다(2026-10-19 출시 전 감사). `utils/runtimeScope` 로만 둔다. |

## 잃은 것 (DC 대비)

- **전역 헤더 승인 배지·popover** — Cloud 에 해당 모듈이 없고 Custom UI 는 DOM 주입도 불가. `homepageFeed` + `contentBylineItem` 으로 부분 보완.
- 상단 1클릭 요청 버튼 → `contentAction`(••• 메뉴)
- 사용자 전수 목록 → 검색-온-타이핑
- 정확한 총건수 → 권한 필터가 SQL 밖이라 원리적으로 불가. 키셋 커서 "더 보기"로 대체.

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-08-26 | 저장소 생성, 워크포스 계층 이식, 도메인 상태 머신 + 테스트 31건, CRA/craco 멀티 엔트리 6종, P0 스파이크 S1·S3·S5·S6·S7 확정 | Forge 마이그레이션 착수 |
| 2026-08-31 | **워크플로 A안** — 단계 이름 = 진행 중 표시 상태(`step_name`/`current_step_name`, v014~v018). **승인자 등록제** — 명부(KVS)·`restrictAccess`(앱 접근 제한, guard 단계)·`approverSpaceCheck`(v1 permission/check 로 승인자 페이지 권한 확인). **업무함** 열(스페이스·유형·요청일) + CSV 내보내기. **진행 스텝퍼**·이력 카드·버전 비교 링크(Confluence diff). **서명 PIN**(`approval_pin` v019, PBKDF2, 5회 15분 잠금, 정책 `pinRequired`). 모듈 아이콘 `resource:main;logo.png` | 사용자 피드백 라운드 2 |
| 2026-08-31 | **편집은 요청을 죽이지 않는다**(사용자 결정) — 자동 편집 만료 제거, "요청 이후 수정됨" 안내 + **새 버전으로 다시 상신**(이전 요청 `SUPERSEDED`, `prev_request_id`), 버전별 승인 이력·감사 타임라인. 업무함 커서에 BINARY `request_id` 가 Buffer 로 실려 결과 있는 탭이 전부 죽던 버그 수정. 모달 버튼 하단 고정(`ModalLayout`), 섹션 라벨로 볼드 절제, `PersonAvatar`(절대 URL + 이니셜 대체) | 사용자 피드백 |
| 2026-09-02 | **스페이스별 정책 오버라이드** — `policy_json`(v023)을 실제로 연결. 전역 위에 스페이스가 정한 항목만 얹는다(`getEffectivePolicy`). `restrictAccess`·`statusLabels` 는 전역 전용. 스윕도 스페이스별로 판정하되 후보 SQL 은 가장 관대한 값으로 넓힌다. **업무함 내보내기를 서식 있는 xlsx 로**(exceljs, 동적 import) | 남은 실기능 마무리 |
| 2026-09-02 | 모달 하단 버튼이 잘려 눌리지 않던 버그 수정(`ModalLayout` 의 `100vh` 되먹임) | 실측 |
| 2026-10-02 | **스윕 비용 절감** — 만료 스윕 5분→1시간, 시간당 `init-db` 를 스윕에 합침. 마감 임박·독촉은 `event_key` 로 이미 보낸 건을 걸러 load 하지 않는다(due-soon 키에 단계 추가). 테이블 프로브 일괄화. 마감 지난 요청에 결정이 들어오면 결정 경로가 즉시 만료 | 컴퓨팅 비용 점검 |
| 2026-10-02 | **Bitbucket 파이프라인**(워크포스 골격, `npm run merge` 선행, 빌드만 `CI=false`). **모달 요청 폼 지연 로드**(gzip 392→224KB)·업무함 서명/위임 탭 지연 로드. 마감 배지(3일 이내·오늘·기한 초과, `features/approval/deadline.js`), 기한 초과 시 승인·반려 버튼 숨김 | 사용자 요청 |
| 2026-10-02 | **스파이크 모듈 제거**(전 resolver 가 PUBLIC, 출시 전 필수 제거). 배포 직후 마이그레이션은 첫 resolver 호출(`ensureMigratedOnce`)로 대체. Codex 검수 반영(마감 판정 now 일원화·도메인 마감 가드, 만료 배치 반복, 일괄 승인 선택 정리). 모달 버튼 줄을 `ModalLayout` dismiss/actions 슬롯으로 통일 | 사용자 요청·Codex 검수 |
| 2026-10-02 | **설정 > 데이터 관리** — Forge SQL 사용량(1 GiB 기준, `STORAGE_LIMIT_BYTES`)·테이블별 크기, 결재 기록 보관 기간(기본 3년, 사용자 결정) — 기간 지난 기록은 엑셀로 내보내고(`confirmApprovalExport` 로 확정) 그 범위만 삭제. 알림 180일·설정 이력 1년 자동 정리. **워크포스 표 키트 이식**(`components/table`), 문서 이름 → 문서 링크(`PageLink`). 엑셀 서식은 `utils/excel.js` 공용 | 사용자 요청 |
| 2026-10-02 | **결재란 매크로**(`approval-stamp-box`, 엔트리 `stamp`) — 단계·결재자·도장을 종이 결재판처럼 본문에 그린다. 영역 매크로에도 접이식 결재란. **요청 시 자동 삽입**(`stampBoxAutoInsert` 기본 켬, 요청 폼에서 건별 해제) — asUser 로 본문 맨 위에 넣고 오른 버전으로 요청을 건다. extensionKey 는 `getAppContext` 로 만든 ARI | 사용자 요청 |
| 2026-10-02 | **결재 증명서 PDF**(상세 모달, 끝난 결재만) — 결재선·도장·이력·요청 당시 버전 본문의 SHA-256 지문. 한글 글꼴을 심지 않으려 본문은 html2canvas 이미지로, 검증값(요청 ID·지문)은 PDF 텍스트·키워드로 넣는다. `getApprovalCertificate` 는 페이지 열람 가드 + 요청-페이지 일치 확인. jspdf·html2canvas 는 동적 청크 | 사용자 요청 |
| 2026-10-03 | **스윕 하루 한 번**(시간당→`interval: day`, 사용자 결정). 마감 정밀도는 결정 경로(즉시 만료)·재요청(`expireOpenRequest`)·byline(기한 초과 표시)이 지키고, 마감 임박 창은 최소 24시간으로 넓혀 두 스윕 사이에 빠지지 않게 했다 | 비용 |
| 2026-10-04 | **문서 현행화** — Marketplace 가이드 ko/en 9쌍(`docs/guide`), 개발 문서. 그 과정에서 드러난 어긋남 수정: 기한 초과 요청에 요청 버튼 열기, 모듈 제목·설명 manifest 번역 키(`locales/*/manifest.json`), 결재란 버전 메시지 언어 중립화, 죽은 정책 키 제거 | 사용자 요청 |
| 2026-10-07 | **유료 앱 전환** — manifest `app.licensing.enabled`(그동안 가드 코드만 있고 켜져 있지 않았다). 프론트 라이선스 게이트를 `mount`/`AppProviders` 한 곳에(워크포스 `useLicenseStore` 이식 + 서버 `LICENSE_INACTIVE` 응답 시 `markInactive` 로 전환), 구매 안내(`LicenseGuide`, 매크로는 compact)·평가판 만료 배너(업무함·설정). **Sentry 이식** — `getSentryDSN` resolver + `app/sentry.js`(마운트 뒤 비동기, `@sentry/react` 동적 청크, console.error 만 수집), egress 3호스트. manifest 계약 테스트. Marketplace URL 은 리스팅 전이라 검색 링크 | 사용자 요청(워크포스처럼 유료) |
| 2026-10-19 | **출시 전 감사 반영** — 모듈 전역 캐시를 invocation/설치 범위로(`utils/runtimeScope`, 관리자 판정 캐시 제거), production 실패 응답에서 SQL·API 원문 `cause` 제거, 스윕의 마감 임박·독촉 알림에 라이선스 판정, 트리거 라이선스 판정은 런타임 `license` 우선, Sentry 는 처리되지 않은 예외만(로그·breadcrumb·URL 제외), **개인정보 보고**(`report:personal-data`, `PrivacyReporter` 7일 주기, 폐쇄 계정의 서명·PIN·위임·알림·명부 등록 삭제) | Marketplace 유료 출시 점검 |
| 2026-10-20 | **미결제 시 보이는 것**(사용자 결정) — 영역 매크로 본문은 계속 보인다(라이선스 예외 resolver `getRegionBody`, PermissionMap `LICENSE_EXEMPT` 로 고정, 본문만·열람 가드 유지 + 한 줄 구매 안내). byline 결재 상태도 계속 보인다. 폐쇄 계정의 결재 기록 accountId 는 감사 기록이라 남긴다 | 고객 콘텐츠를 볼모로 잡지 않는다 |
| 2026-10-20 | **권한 허점 4건** — 재상신(`supersedes`)은 요청자이거나 요청 이후 수정된 경우만 이전 요청을 닫는다. `getSignatures` 는 페이지 열람 가드 + 그 요청에서 결정한 사람 서명만(클라이언트 accountId 무시). PIN 실패는 비교 전에 DB 에서 원자적으로 센다(`reserveAttempt`). 위임자 행은 '내 차례' 탭에만 합친다 | Marketplace 출시 전 감사 |
| 2026-10-20 | **감사 잔여 항목** — 보관 기간 정리가 Confluence 에서 사라진 페이지의 기록도 내보내고 지운다(`filterRetainablePages`, asApp 존재 판정·사용자 텍스트 가림), 확정된 내보내기는 다른 관리자도 삭제 가능, 영역 요청 상세는 매크로가 지워지거나 복제돼도 열린다(결정은 닫고 회수는 남김), source map 미배포, 평가판 만료일은 `trialEndDate` 우선, 영역 매크로 제목 번역 | Marketplace 출시 전 감사 |
| 2026-10-20 | **감사 수정분 재검토** — 보관 정리 삭제가 지금 누른 관리자 기준으로 열람 권한을 다시 걸러 다른 관리자의 삭제가 멈추던 것 제거(범위는 내보내기 확정 때 고정). PIN 은 센 뒤 다른 시도가 잠갔으면 비교하지 않는다(잠금이 횟수를 0 으로 돌려 동시 시도가 비교까지 갔다). 재상신 권한 확인을 결재란 삽입 앞으로. 앱까지 막는 제한 페이지도 "사라진 페이지"로 처리됨을 문서에 명시 | 수정분 로직 검토 |
| 2026-08-31 | **설정 변경 이력**(`approval_settings_audit` v020, append-only, 설정 '변경 이력' 탭) + **결재 위임/대리 결재**(`approval_delegation` v021, 업무함 '내 위임', 정책 `delegationEnabled`). 결정은 원 결재자 이름으로, 실제 결정자는 `delegateKey` 로 남는다. 업무함은 나 + 나에게 위임한 사람의 '내 차례'를 함께 보여 준다 | DC 격차 ③④ |
| 2026-08-31 | 업무함 표의 스페이스 **이름** 표시 수정(키/숫자 id 양쪽 조회 + 목록 밖 스페이스는 건별 조회), 표에서 스페이스 키 제거. 타이틀(Heading) 외 볼드 전량 제거 | 사용자 피드백 |
| 2026-08-31 | **일괄 승인**(내 차례 최대 50건, PIN 은 묶음당 1회) + **독촉**(`reminderEnabled`/`reminderFirstDays`/`reminderRepeatDays`, 스윕에서 지금 차례인 결재자에게만) | DC 격차 ①② |
| 2026-08-31 | **결재 서명** — `approval_signature`(v013), 업무함 '내 서명'(그리기/업로드), 결정 옆 도장(등록 서명 또는 이름 자동 도장), 정책 `signatureEnabled` | DC 격차 |
| 2026-08-31 | **결재선(Flow) 설정 화면** + 공용 `ApprovalLineEditor`(요청 폼과 동일 컴포넌트), Flow 단계에 승인 그룹(`AGROUP`) 허용, Confluence 그룹 키를 id→**이름**으로 통일 | DC 격차 ① |
| 2026-08-31 | **만료 스윕(5분)·페이지 편집 트리거** — `ExpiryService`: 편집 만료(CONTENT_VERSION)·매크로 삭제 회수(REGION_REMOVED)·마감 만료·마감 임박 알림(DUE_SOON, 결정적 id). `approval_job_state` 리스로 겹침 방지. Repository 에 `closeBySystem`(사용자 없는 CAS 종료) | DC 격차 ③ |
| 2026-08-31 | **참조(CC)** — 요청 폼 선택, `approval_inbox` role='CC' 행, 업무함 "참조" 탭, 상세 표시, 알림 수신(승인은 최종만). **승인/반려/회수 앱 내 알림이 생성되지 않던 것**도 이때 발견해 서비스 경로에 연결. 상세 모달에 감사 타임라인 | DC 격차 ② |
| 2026-08-31 | **Confluence 네이티브 알림 연결** — `CommentNotifier`(대상 페이지 @멘션 코멘트)를 요청 생성·단계 전진·최종 승인·반려·회수 경로에 연결(그동안 호출처가 없었다). 정책 `commentNotifyEnabled` 기본 켬 + 설정 토글. `ApprovalService.policyLoader` 가 실제 정책(KVS)을 읽도록 교체(반려 사유 필수 정책이 이제 실제로 적용됨) | 사용자 요청 |
| 2026-08-31 | 요청 폼 재설계(DC 인벤토리 기반) — 직접 선택/결재선(Flow) 탭, 승인 그룹(`agroup:`) 선택·서버 확장, `getRequestDefaults`(정책 마감·Flow·그룹), 마감일 기본값 자동 제안, 메모 카운터, 재승인 시 이전 결재선 재사용, 단계 카드 UI | DC 대비 격차 보강 |
| 2026-08-31 | 승인 요청 생성 실패 수정(TIMESTAMP 바인딩 → `SqlTime` 경계), byline 을 결재 상태 표시 + 모달 진입점으로 전환(배너의 요청 버튼 제거), 모달 intent 자동 판정, 상세 모달 승인자 이름 해석, 마감 없는 요청의 "기한 초과"·"1970" 오표시 수정, **pageBanner 모듈 제거**(사용자 요청 — 상태·진입점은 byline 로 통일) | 첫 E2E 실측에서 발견 |
