# §6 단계별 상세 — 권한 옵션 전환 (DMOVE 권한 `applicationMonitoring/apm`)

> **MovesEye APM 종합 안내서** 분책 09/18 · 원본 절 **§6.4 (+ §3.4 사본)** · 마지막 갱신 **2026-09-14**(원본 `apm-handbook.md` 2026-09-14 작성분을 내용 수정 없이 옮김, 분책 2026-09-14).
>
> **이 문서를 읽으면 알게 되는 것**
> 1. DMOVE 권한 `applicationMonitoring/apm` view/edit 축의 규칙(§3.4 사본)과 세 단계 사연
> 2. 왜 V48은 V27 복제가 아닌가(`'{}'` 기본값·`jsonb_array_elements` 실패)
> 3. "체크를 껐는데 왜 보이나 / 켰는데 안 보이나" 진단 순서와 배포 순서(BE 먼저)
>
> **전제 문서** — 이전 [08-p2-traces.md](08-p2-traces.md) · 다음 [10-p3-operations.md](10-p3-operations.md) · 목차 [00-index.md](00-index.md). 용어는 [14-glossary.md](14-glossary.md), 출처 전체는 [17-sources.md](17-sources.md).
> **표기**: 🔴 = 어기면 데이터가 조용히 틀리는 규칙 · ⚠️ = 알고 있어야 하는 한계 · ✅ = 실측으로 확인된 것.

### 6.4 권한 옵션 전환 (09-03)

[3.4절](03-constraints.md)이 규칙이고 여기는 **왜 V48이 V27 복제가 아닌가**만 다시 적는다. `Role.dmove_permission`은 jsonb 한 덩어리라 코드 템플릿에 모듈을 더해도 저장된 역할 행은 안 바뀐다 → 백필 없이는 역할 편집 화면에 체크박스가 **안 뜨고** 판정은 fail-closed. V1 baseline이 이 컬럼을 `DEFAULT '{}'::jsonb`로 만들어 **한 번도 저장 안 한 역할의 값은 NULL이 아니라 빈 객체**다. V27의 CASE 식은 첫 분기에서 NULL만 거르고 `jsonb_array_elements()`를 부르는데 객체에 그것을 쓰면 `cannot extract elements from an object` — **마이그레이션 실패 = 앱 기동 실패**. V27이 살아남은 건 그런 행이 없었기 때문일 뿐(같은 잠재 결함이 V27에 그대로 있다, 별건). 그래서 V48은 UPDATE 3문(①비배열은 모듈 하나짜리 배열로 세움 ②모듈 없는 배열엔 append ③기능만 없는 배열엔 채움), 모두 "없을 때만"이라 멱등, `DmovePermissionBackfillIT`가 도커 PG로 세 모양+재실행을 검증. view가 V27과 **반대**(V27은 관리자 전용이라 false, APM은 true)인 것도 복제하면 틀리는 지점.

"체크를 껐는데 왜 보이나" 순서: ⑴ `userRole` ADMIN/SUPER_ADMIN인가(우회 세 겹) ⑵ 역할 행에 `apm` 항목이 두 벌인가(`anyMatch`) ⑶ 라우트에 역할 prop이 같이 붙었나(OR 단락). "켰는데 안 보이나": ⑴ V48이 그 DB에 돌았나 ⑵ FE 키가 `apm`인가.

**더 보기**: `guides/apm-code-walkthrough.md` §17 · `features/apm/core/e2e_apm-permission-option.md`.

---

## 보강 — 이 단계와 관련된 §4·§5·§8 조각(사본)

> 🔁 **보강(사본)** — 아래는 §4.2(단계 표)·§4.3(데이터 모델)·§5(데이터의 길)·§8.2(QA 수치)에서 이 단계에 해당하는 조각을 **그대로 복사**한 것이다(각 파일이 혼자 읽히게). 정본은 [04-overview.md](04-overview.md) §4.2·§4.3 · [06-data-path.md](06-data-path.md) §5 · [13-verification.md](13-verification.md) §8.2이며, 어긋나면 정본이 맞다.

**보강 A — §3.4 권한 축 규칙 전문 (정본 03-constraints.md §3.4)**

### 3.4 권한 축 — DMOVE 권한 `applicationMonitoring / apm`

| | |
|---|---|
| **무엇을** | 역할 편집 화면의 체크박스 한 줄: 모듈 `applicationMonitoring`, 기능 `apm`, 칸은 **view**(조회 36 EP + P3 18)·**edit**(관리 26 EP + P3 8). 원문(SQL 원문·스택트레이스) 열람만 **관리자 역할 축**(`canViewRawText`, ADMIN∪SUPER_ADMIN). 리포트 관리는 편입의 대가로 **관리자 축**(`ReportAdminAccess`) |
| **어떻게** | BE `ApmAccessChecker.requireRead/requireEdit`(@Component, 컨트롤러 첫 줄) → `DmovePermissionChecker.has()` 한 곳에서 관리자 우회. FE `useApmPermissions().{canView, canEdit}` 단일 진입점, 사이드바·검색 13·설정 2·라우트 15는 `view`, 수집기·알람 규칙 화면은 **조회부터** `edit`. V48이 기존 역할을 `view=true·edit=false`로 백필 |
| **왜** | 세 단계 사연: ① P1부터 조회 EP에 판정이 **없었다**(설계 🅞가 코드에 없어 일반 USER가 트레이스·스택·SQL을 읽을 수 있었다) ② 09-02 ADMIN 일괄 잠금(우리 역할 축엔 "운영자"가 없다) ③ 09-03 "관리자가 켜고 끌 수 없는 잠금"이라 하루 만에 권한 옵션으로 전환 — **코드가 아니라 데이터로 답한다** |
| **조건·전제** | 🔴 view/edit을 가르는 축은 HTTP 메서드가 아니라 **"관리 화면의 데이터인가"** — 토큰 목록·설정 GET·설치 가이드는 `edit`, `POST /traces/compare`는 `view`. `edit`은 `view`를 함축하지 않는다. 🔴 배포 순서 **BE 먼저**(코드+V48) — FE `grantAll`은 BE가 내려준 키만 채우므로 FE만 먼저 올리면 관리자에게도 메뉴가 사라진다 |
| **함정·교훈** | 🔴 **V48은 V27 복제가 아니다**: `dmove_permission` 기본값이 `'{}'`(객체)라 V27식 `jsonb_array_elements`는 마이그레이션 자체가 실패한다 → UPDATE 3문(비배열 세우기 → 모듈 append → 기능만 채움), 멱등. 🔴 `t("apm")`은 로케일 루트 객체와 충돌해 라벨만 `apm_permission`으로 우회(권한 키는 BE `feature.name`과 동일 유지). 라우트에 `adminOnly`를 같이 주면 `PageWrapper` OR 단락으로 권한 게이트가 죽는다 |

**더 보기**: `features/apm/core/contract_apm-read-api.md` §10.5 · `features/apm/core/e2e_apm-permission-option.md` · `guides/apm-code-walkthrough.md` §17.

**보강 B — §4.2 단계 표에서 권한 옵션 행 · §4.3에서 V48 (정본 04-overview.md)**

| 단계 | 날짜(커밋) | 무엇 | 핵심 수치 | 검증 |
|---|---|---|---|---|
| **권한 옵션** | 09-03 (BE `4264f57`, FE `8ced9ed`) | 역할 축 → DMOVE 권한 `applicationMonitoring/apm` · V48 백필 | view 36·edit 26 EP | 권한 QA 8/8 |

| 마이그레이션 | 표 | 무엇을 담나 |
|---|---|---|
| V48 | `dmove_permission` 백필 | 역할 행에 `applicationMonitoring/apm` view=true·edit=false |

**보강 C — §7.6 권한 켜기 (정본 12-operations.md §7.6)**

### 7.6 권한 켜기

역할 편집 › 애플리케이션 모니터링 › APM — 보기(조회 화면)·생성/편집(토큰·수집기·알람 규칙·SLO/합성 쓰기·서비스 편집). 원문 SQL/스택 열람은 관리자 역할만. 리포트 관리는 관리자만. 🔴 배포 순서 BE 먼저(V48).

**보강 D — §8.2 QA 수치에서 권한 QA 행 (정본 13-verification.md §8.2)**

| 단계 | 결과 | 남은 것 |
|---|---|---|
| 권한 QA(09-03) | 8/8 PASS(V48 실적용·역할 편집·USER 흐름 A/B/C) | — |

---

## 더 보기 — 내부 정본(이 문서에서 근거로 인용한 것)

경로는 `C:\solutions\_workspace\` 기준, 코드는 각 레포 `src/main/java/com/dmove/moveseye/` 기준. 절별 정확한 위치(§·#·클래스)는 본문 각 절 끝의 **더 보기** 줄에 있고, 아래는 그것을 문서 단위로 모은 것이다.

- 문서·코드 경로: `guides/apm-code-walkthrough.md` · `features/apm/core/e2e_apm-permission-option.md` · `features/apm/core/contract_apm-read-api.md`
- 관련 분책: 이전 [08-p2-traces.md](08-p2-traces.md) · 다음 [10-p3-operations.md](10-p3-operations.md) · 목차 [00-index.md](00-index.md) · 용어 [14-glossary.md](14-glossary.md) · 출처 전체 [17-sources.md](17-sources.md)

## 출처 — 외부 공식 문서(이 문서에 쓰인 것만)

이 문서 본문에는 외부 URL을 직접 인용한 줄이 없다. 전체 목록은 [17-sources.md](17-sources.md) D.1.

