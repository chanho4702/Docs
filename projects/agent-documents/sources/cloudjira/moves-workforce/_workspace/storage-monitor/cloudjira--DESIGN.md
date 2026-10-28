# DB 사용량 모니터링 설계서

> 작성: feature-architect
> 작성일: 2026-07-01
> 입력 요구사항: 사용자 지시 (본 세션) — 관리자용 Forge SQL 저장 용량 모니터링
> 단일 진실 원천: 본 문서의 **§2 경계면 계약**. backend/frontend는 이 계약을 글자 그대로 구현한다.
> 스코프: **현재 사용량 표시 + 임계치 경고만**. 추이 스냅샷/투영/아카이빙/엑셀은 이번 범위 제외(후속 확장 여지만 남김).

---

## 0. 스코프 요약 (엄격 준수)

| 포함(v1) | 제외(후속) |
|---------|-----------|
| Forge SQL 실사용량 조회(information_schema) | 증가 추이 스냅샷 적재 |
| 총 사용량 게이지(사용/1 GiB, %) | "n일 후 한도 도달" 투영 |
| 80%/90% 임계치 색상 경고 | 아카이빙/데이터 정리 |
| 테이블별 상세(크기 내림차순, 행수) | 엑셀 추출 |
| — | KVS 용량 상세(§8에서 제외 판단) |

응답 shape·서비스 반환 객체는 후속 확장(스냅샷 `history`, `kvs` 등)을 위해 **최상위에 필드를 추가하기 쉬운 단일 객체** 구조로 설계한다(§2 참조).

---

## 1. 개요 / 영향 범위

| 축 | 신규/수정 | 대상 |
|----|----------|------|
| 백엔드(도메인) | **신규** | `src/resolver/storage/` — `StorageController.js` / `StorageService.js` / `StorageRepository.js` / `StorageQuery.js` |
| 백엔드(등록) | 수정 | `src/index.js` — `import { registerStorageController }` + `registerStorageController(resolver)` 호출 |
| 백엔드(상수) | 신규 | `src/resolver/storage/storageConstants.js` — 한도 바이트 상수 + 임계치(서버는 raw만 반환, 임계치 판정은 프론트) |
| 백엔드(에러코드) | 수정 | `src/utils/errors/ErrorCodes.js` — `STORAGE_USAGE_QUERY_FAILED` 1건 추가(선택, §3.4) |
| 프론트(페이지) | **신규** | `static/ui/src/backoffice/page/storage/StoragePage.jsx` (+ `StorageUsageGauge.jsx` / `StorageTableList.jsx` / `useStorageUsage.js`) |
| 프론트(라우팅) | 수정 | `static/ui/src/App.jsx` — `<Route path="/backoffice/storage" element={<StoragePage/>} />` |
| 프론트(메뉴) | 수정 | `static/ui/src/components/dropdown/BackofficeDropdown.jsx` — 메뉴 항목 1개 추가(권한 게이트) |
| 프론트(권한 ID) | 수정 | `static/ui/src/constants/pages.jsx` — `PAGE_IDS`에 `"STORAGE_MONITORING"` 추가 |
| 프론트(쿼리키) | 수정 | `static/ui/src/utils/queryKey/backofficeKeys.js` — `storageUsage()` 팩토리 추가 |
| 프론트(포맷 유틸) | 신규 | `static/ui/src/utils/format/formatBytes.js` — bytes → KiB/MiB/GiB 사람이 읽는 단위 |
| 권한 시드 | 수정 | `src/seed/SeedData.js` — Admin/Member permission `pages`에 `STORAGE_MONITORING` 추가 (+ 기존 설치 반영은 §7 마이그레이션 판단) |
| 권한 fallback | 수정 | `src/resolver/backoffice/permission/PermissionService.js` — 미등록 사용자 fallback 배열에 `STORAGE_MONITORING`(read:false) 추가 |
| i18n | 신규/수정 | `locales/kr/storage.json`·`locales/en/storage.json`(신규) + `locales/kr(en)/common.json` 메뉴 키(수정) → `npm run merge` |
| DB(MySQL 스키마) | **불변** | 신규 테이블 없음. `information_schema.tables` **조회만**(읽기 전용, DDL 없음) |
| DB(KVS) | **불변** | 이번 범위 제외(§8) |

> ⚠ 다른 세션이 `locales/*`·`gantt` 작업 중 — 본 설계는 **문서로만** i18n 키를 명세한다(설계 단계에서 locale 파일을 실제로 만들지 않음). 구현 단계 담당자가 §6대로 추가한다.

---

## 2. 경계면 계약 (가장 중요 — 단일 진실)

### 2-A. resolver 계약표

| resolver 함수 | 입력 파라미터 | 응답 shape (success 시) | 대응 프론트 훅 / 쿼리키 |
|--------------|-------------|------------------------|------------------------|
| `getStorageUsage` | `{}` (없음) | `{ success:true, content: StorageUsage }` | `useStorageUsage()` / `backofficeKeys.storageUsage()` |

> `responseWrapper`가 `{ success:true, ...serviceResult }`로 펼치므로, **Service는 `{ content: StorageUsage }`를 반환**한다. 프론트는 **`res.content`**를 소비한다(요구사항 예시는 flat이었으나, 코드베이스 관례상 최상위 `content` 래핑으로 확정 — top-level `success`/`error` 키 충돌 방지 + 후속 필드 추가 용이).

### 2-B. `StorageUsage` 객체 shape (글자 그대로 — backend가 생성, frontend가 소비)

```jsonc
{
  "limitBytes": 1073741824,      // number. 한도(바이트). 기본 1 GiB. §3.3 환경 오버라이드 가능
  "totalBytes": 734556160,       // number. 전체 테이블 (data_length + index_length) 합계
  "totalRows": 152340,           // number. 전체 table_rows 합계(근사치, §3.5 caveat)
  "usedPercent": 68.4,           // number. round((totalBytes/limitBytes)*100, 1). limitBytes=0 방어 시 0
  "tables": [                    // dataBytes 내림차순 정렬 (backend가 정렬 완료해서 내려줌)
    { "name": "worklog",  "dataBytes": 524288000, "rows": 98000 },
    { "name": "users",    "dataBytes": 134217728, "rows": 3200  },
    { "name": "project",  "dataBytes": 76050432,  "rows": 512   }
    // ...
  ],
  "generatedAt": "2026-07-01T05:00:00.000Z"  // ISO 8601. 조회 시각(후속 스냅샷 확장 대비, v1은 표시만)
}
```

**필드 규약(불변식):**
- `tables[].name` = `information_schema.tables.table_name` 원본(스키마 접두 없음).
- `tables[].dataBytes` = `COALESCE(data_length,0) + COALESCE(index_length,0)` (요구사항의 "데이터 크기").
- `tables[].rows` = `COALESCE(table_rows,0)`.
- `tables`는 **backend에서 `dataBytes DESC` 정렬 완료** 상태로 전달(프론트 재정렬 불필요, 단 프론트 컬럼 정렬 UX는 자유).
- `totalBytes` = `Σ tables[].dataBytes`. `totalRows` = `Σ tables[].rows`.
- `usedPercent`는 **100을 초과할 수 있다**(한도 초과 시). 프론트 게이지 바 폭은 `min(usedPercent,100)`으로 clamp하되, 숫자 표기는 실제값을 보여준다.
- 빈 결과(테이블 없음)면 `tables:[]`, `totalBytes:0`, `totalRows:0`, `usedPercent:0`.

**임계치(경고 레벨)는 응답에 포함하지 않는다.** 색상/배지는 프레젠테이션 관심사이므로 **프론트가 `usedPercent`로 판정**한다(§4.4 `STORAGE_THRESHOLDS`). 서버-클라 임계치 이중 정의를 피한다.

### 2-C. 실패 응답 (responseWrapper 표준)

```jsonc
{
  "success": false,
  "error": { "name": "SqlError", "code": "STORAGE_USAGE_QUERY_FAILED", "message": "...", "cause": "..." }
}
```
- 프론트 `useStorageUsage`는 `res.success===false`면 `throw new Error(res.error?.code)` → React Query `isError` 경로로 `SectionMessage(appearance="error")` 표시(§4.3).

---

## 3. 백엔드 설계

### 3.1 계층 분해 (`src/resolver/storage/`)

기존 `backoffice/user` 도메인과 동일한 4계층 패턴을 따른다.

```
StorageController.js   → resolver.define('getStorageUsage', responseWrapper(() => getStorageUsageService()))
StorageService.js      → getStorageUsageService(): 조회→합산→정렬→{ content } 반환
StorageRepository.js   → findTableStats(): executeQuery(StorageQuery.TABLE_STATS) 실행
StorageQuery.js        → SQL 상수(information_schema 조회) 격리
storageConstants.js    → DEFAULT_LIMIT_BYTES 등 상수
```

**StorageController.js**
```js
import { responseWrapper } from '../../utils/ResponseWrapper';
import { getStorageUsageService } from './StorageService';

export function registerStorageController(resolver) {
    resolver.define('getStorageUsage', responseWrapper(() => getStorageUsageService()));
}
```

**StorageQuery.js** (information_schema 조회 격리 — 기능 전용 페처 원칙)
```js
export const StorageQuery = {
    // 현재 앱 스키마의 테이블별 크기/행수. DATABASE()로 현재 스키마 한정.
    TABLE_STATS: `
        SELECT
            table_name AS name,
            (COALESCE(data_length, 0) + COALESCE(index_length, 0)) AS data_bytes,
            COALESCE(table_rows, 0) AS rows_est
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        ORDER BY data_bytes DESC
    `,
};
```
> `src/rdb/query/` 기존 자산 활용 판단: `QueryBuilder`는 앱 테이블 대상 SELECT 조립기라 `information_schema` + 표현식 컬럼에 부적합. **`CommonQuery.executeQuery`(= `sql.prepare().bindParams().execute()`)를 재사용**하고, SQL 본문은 위 `StorageQuery.TABLE_STATS` 상수로 격리한다. 파라미터가 없어 `bindParams` 불필요.

**StorageRepository.js**
```js
import { executeQuery } from '../../rdb/query/CommonQuery';
import { StorageQuery } from './StorageQuery';

export const findTableStats = async () => {
    const result = await executeQuery(StorageQuery.TABLE_STATS); // { rows: [...] } 반환, 실패 시 SqlError throw
    return result?.rows ?? [];
};
```

**StorageService.js**
```js
import { findTableStats } from './StorageRepository';
import { resolveLimitBytes } from './storageConstants';

export const getStorageUsageService = async () => {
    const raw = await findTableStats();

    const tables = raw
        .map(r => ({
            name: r.name,
            dataBytes: Number(r.data_bytes ?? 0),
            rows: Number(r.rows_est ?? 0),
        }))
        .sort((a, b) => b.dataBytes - a.dataBytes); // SQL ORDER BY 재확인(방어)

    const totalBytes = tables.reduce((s, t) => s + t.dataBytes, 0);
    const totalRows  = tables.reduce((s, t) => s + t.rows, 0);
    const limitBytes = resolveLimitBytes();
    const usedPercent = limitBytes > 0
        ? Math.round((totalBytes / limitBytes) * 1000) / 10  // 소수 1자리
        : 0;

    return {
        content: {
            limitBytes,
            totalBytes,
            totalRows,
            usedPercent,
            tables,
            generatedAt: new Date().toISOString(),
        },
    };
};
```

### 3.2 `src/index.js` 등록 (필수)
```js
import { registerStorageController } from './resolver/storage/StorageController';
// ...
registerStorageController(resolver);
```
> 네이밍은 다수 관례인 `registerXxxController`를 따른다.

### 3.3 한도 상수 & 환경별 처리 (storageConstants.js)

**결론: 단일 기본 상수 1 GiB + Forge 환경변수 오버라이드.** Forge 런타임은 dev/staging/production 환경 타입을 **함수 코드에서 신뢰성 있게 감지하는 공식 API가 없다**(문서화된 런타임 환경 플래그 부재). 따라서:

```js
// 1 GiB (프로덕션 Forge SQL 설치당 한도)
export const DEFAULT_LIMIT_BYTES = 1073741824;

// 환경별 실제 한도는 배포 환경별 Forge 환경변수로 주입(선택):
//   forge variables set --environment production  STORAGE_LIMIT_BYTES 1073741824
//   forge variables set --environment staging     STORAGE_LIMIT_BYTES 268435456   (256 MiB)
//   forge variables set --environment development STORAGE_LIMIT_BYTES 134217728   (128 MiB)
// 미설정 시 프로덕션 기준(1 GiB)으로 폴백 — 가장 보수적으로 "여유 있어 보이게" 하지 않음은 아니나,
// 프로덕션이 주 감시 대상이므로 기본을 프로덕션 한도로 둔다.
export const resolveLimitBytes = () => {
    const v = Number(process.env.STORAGE_LIMIT_BYTES);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_LIMIT_BYTES;
};
```
- 장점: 환경 감지 불필요, 환경별 정확한 한도 반영 가능, 미설정이어도 안전한 기본값.
- **미결정 항목**(§9): 실제로 각 환경 한도(256/128 MiB)가 요구되면 배포 시 `forge variables set`을 운영 체크리스트에 넣어야 함. 이번 코드 범위는 오버라이드 훅만 제공.

### 3.4 에러 케이스 (ErrorCodes)
- `executeQuery` 내부에서 SQL 실패 시 자동으로 `SqlError`를 throw → `responseWrapper`가 `{success:false,error}` 직렬화. **추가 코드 없이도 동작**한다.
- 가독성/프론트 분기용으로 `ErrorCodes.js`에 `STORAGE_USAGE_QUERY_FAILED: 'STORAGE_USAGE_QUERY_FAILED'` 1건 추가(선택). Service에서 try/catch로 감싸 이 코드로 재-throw하면 프론트 메시지 매핑이 쉬움. 최소 구현은 기존 SqlError 전파로 충분.

### 3.5 정확도/엣지 caveat (반드시 인지)
- **information_schema 접근 가능성(최우선 검증)**: Forge SQL(TiDB 관리형)에서 앱 DB 컨텍스트로 `information_schema.tables` 및 `DATABASE()`가 조회 가능한지 **런타임 검증 필요**(§9 P0). 불가하면 대체 경로가 없어 기능 자체가 성립하지 않으므로, 구현 착수 전 `forge tunnel`에서 쿼리 1회 실측 권장.
- **TiDB 통계 근사치**: `data_length`/`index_length`/`table_rows`는 TiDB 통계 기반 **추정치**이며 `ANALYZE TABLE` 이전엔 stale하거나 0/NULL일 수 있다. 모니터링 근사 용도로는 허용. UI에 "추정치" InfoTip 노출 권장(§6 `storage.notice.estimate`). 신뢰 상한이 필요하면 후속에서 `ANALYZE` 스케줄 고려(범위 외).
- **NULL 방어**: SQL에서 `COALESCE(...,0)`, Service에서 `Number(...??0)` 이중 방어.
- **큰 수치**: 1 GiB≈1.07e9, 합계도 수 GiB 규모 → JS `Number.MAX_SAFE_INTEGER`(9e15) 내라 BigInt 불필요. 단 드라이버가 문자열로 줄 수 있어 `Number()` 캐스팅.
- **빈 결과**: 신규 설치 직후 등 테이블 0개 → `tables:[]`, 전부 0 정상 응답.

### 3.6 성능
- 단일 쿼리 1회, 결과 수십 행(앱 테이블 개수) 수준 → N+1 없음, `p-limit` 불필요, 256MB 제약 무관. 캐시 불필요(프론트 `staleTime`으로 충분, §4.2).

---

## 4. 프론트엔드 설계

### 4.1 컴포넌트 트리 (`static/ui/src/backoffice/page/storage/`)

```
StoragePage.jsx
 ├─ <Backoffice subtitle description />                         (기존 공통 헤더, 타 백오피스 페이지와 동일)
 ├─ 권한 게이트: if (!canRead("STORAGE_MONITORING")) → SectionMessage(warning) "권한 없음"
 ├─ (isLoading) Spinner / (isError) SectionMessage(error)
 ├─ <StorageUsageGauge data={content} />        // 총 사용량 게이지 + 경고 배지/메시지
 └─ <StorageTableList tables={content.tables} /> // 테이블별 상세(내림차순)
useStorageUsage.js  // useQuery + invoke('getStorageUsage')
```
> `PublicHolidayPage`/`LevelPage`와 동일한 골격: 상단 `<Backoffice>` 헤더 + 본문. 등록/수정 모달 없음(읽기 전용 페이지).

### 4.2 데이터 훅 (useStorageUsage.js)
```js
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@forge/bridge';
import { backofficeKeys } from '../../../utils/queryKey/backofficeKeys';

export const useStorageUsage = () => {
    return useQuery({
        queryKey: backofficeKeys.storageUsage(),
        queryFn: async () => {
            const res = await invoke('getStorageUsage');
            if (!res?.success || !res.content) {
                throw new Error(res?.error?.code || 'STORAGE_USAGE_QUERY_FAILED');
            }
            return res.content; // = StorageUsage (§2-B)
        },
        staleTime: 60 * 1000,   // 1분. 용량은 급변하지 않음
        refetchOnWindowFocus: false,
    });
};
```
- 수동 새로고침 버튼(선택): `useQueryClient().invalidateQueries({ queryKey: backofficeKeys.storageUsage() })`.

### 4.3 StoragePage.jsx 골격
```jsx
export default function StoragePage() {
    const t = useI18nStore(s => s.t);
    const canRead = usePermissionStore(s => s.canRead("STORAGE_MONITORING"));
    const { data, isLoading, isError } = useStorageUsage();

    if (!canRead) return <SectionMessage appearance="warning">{t('storage.noPermission')}</SectionMessage>;

    return (<>
        <Backoffice subtitle={t('storage.page.title')} description={t('storage.page.description')} />
        {isLoading && <Spinner />}
        {isError && <SectionMessage appearance="error" title={t('storage.error.title')}>{t('storage.error.description')}</SectionMessage>}
        {data && <>
            <StorageUsageGauge data={data} />
            <StorageTableList tables={data.tables} />
        </>}
    </>);
}
```
> `canRead` 게이트는 `PortfolioDashboardPage`의 `canRead("REPORT")` 패턴과 동일.

### 4.4 StorageUsageGauge.jsx (게이지 + 경고)
- **임계치 상수(프론트 단일 정의)**: `static/ui/src/backoffice/page/storage/storageConstants.js`
  ```js
  export const STORAGE_THRESHOLDS = { WARNING: 80, CRITICAL: 90 }; // usedPercent 기준(%)
  export const levelOf = (p) => p >= STORAGE_THRESHOLDS.CRITICAL ? 'critical'
                              : p >= STORAGE_THRESHOLDS.WARNING  ? 'warning' : 'normal';
  ```
- **게이지 렌더**: 코드베이스에 Atlaskit `ProgressBar` 전용 컴포넌트 사용례가 뚜렷치 않고, `projectDetail/progress/ProgressBars.jsx`의 **커스텀 막대(div track + fill)** 선례가 있으므로 이를 참고한 수평 막대 사용. 폭 = `min(usedPercent,100)%`, 색상 = 레벨별.
  - normal: 파랑 `#0052CC` / warning: 노랑 `#FF8B00` / critical: 빨강 `#DE350B`.
- **경고 배지**: 기존 `components/lozenge/StatusLozenge.jsx` 재사용.
  - normal → `type="success"`, warning → `type="warn"`, critical → `type="error"`, label은 i18n(§6 `storage.level.*`).
- **경고 메시지**: warning/critical일 때 `SectionMessage`(warning/error)로 안내 문구 노출(§6 `storage.warn.*`).
- **표시 텍스트**: `formatBytes(totalBytes) / formatBytes(limitBytes) (usedPercent%)`. 예 `700.5 MiB / 1 GiB (68.4%)`.

### 4.5 StorageTableList.jsx (테이블별 상세)
- 컬럼: 테이블명 / 데이터 크기(`formatBytes(dataBytes)`) / 행수(`rows.toLocaleString()`). 이미 내림차순 정렬됨.
- 기존 백오피스 리스트 렌더 관례(`@atlaskit/dynamic-table` 또는 프로젝트 공통 `CommonTable`) 중 팀 표준을 따른다. 최소 구현은 `@atlaskit/dynamic-table` 정적 사용으로 충분.
- 빈 배열이면 `storage.table.empty` 안내.

### 4.6 bytes 포맷 유틸 (formatBytes.js)
- 위치: `static/ui/src/utils/format/formatBytes.js` (신규). **이진 단위(1024)**.
  ```js
  export const formatBytes = (bytes, digits = 1) => {
      const n = Number(bytes) || 0;
      if (n < 1024) return `${n} B`;
      const units = ['KiB', 'MiB', 'GiB', 'TiB'];
      let v = n / 1024, i = 0;
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
      return `${v.toFixed(digits)} ${units[i]}`;
  };
  ```

### 4.7 라우팅 / 메뉴 / 쿼리키 / 권한
- **App.jsx**: `import StoragePage` + `<Route path="/backoffice/storage" element={<StoragePage />} />` (다른 `/backoffice/*` 라우트 옆에 추가).
- **BackofficeDropdown.jsx**: 메뉴 항목 추가. 관리자/시스템 성격이므로 **신규 그룹 "시스템"**(또는 기존 projectSetting 그룹) 하위에 배치, `isReadable("STORAGE_MONITORING")` 게이트.
  ```jsx
  {isReadable("STORAGE_MONITORING") && (
    <DropdownItemGroup title={t('common.backoffice.systemSetting.group')}>
      <DropdownItem onClick={() => navigate("/backoffice/storage")}>
        {t('common.backoffice.systemSetting.storage.title')}
      </DropdownItem>
    </DropdownItemGroup>
  )}
  ```
- **backofficeKeys.js**: `storageUsage: () => ["storage", "usage"]` 추가(팩토리 필수, 인라인 금지).
- **pages.jsx `PAGE_IDS`**: `"STORAGE_MONITORING"` 추가.

---

## 5. DB 설계

- **MySQL 스키마 변경 없음.** 신규 테이블/DDL/마이그레이션(`src/rdb/schema/`) 없음. `information_schema.tables` **읽기 전용 조회**만 수행.
- **KVS 변경 없음**(§8 제외 판단).
- 유일한 "쓰기성" 변경은 **권한 시드**(KVS `permission` 엔티티)뿐 — §7.

---

## 6. i18n 키 목록

파일명 = 네임스페이스. 신규 `locales/kr/storage.json`·`locales/en/storage.json` + 기존 `common.json` 메뉴 키. 추가 후 **`cd static/ui && npm run merge`**로 `ko-KR.json`/`en-US.json` 생성(직접 수정 금지). `t()`는 점 표기 참조(`storage.page.title`). 동적 수치(사용량/퍼센트)는 **컴포넌트에서 `formatBytes`/문자열 조합으로 렌더**하므로 i18n 보간 불필요(정적 라벨만 키로 관리).

### `storage.json` (신규)
| 키 | kr | en |
|----|-----|-----|
| `page.title` | `DB 사용량 모니터링` | `Database Usage` |
| `page.description` | `Forge SQL 저장 용량 사용 현황을 확인합니다.` | `Monitor Forge SQL storage usage.` |
| `noPermission` | `이 페이지에 접근할 권한이 없습니다.` | `You do not have permission to view this page.` |
| `gauge.title` | `총 사용량` | `Total usage` |
| `gauge.of` | `/ ` | `/ ` |
| `level.normal` | `정상` | `Normal` |
| `level.warning` | `주의` | `Warning` |
| `level.critical` | `위험` | `Critical` |
| `warn.warning` | `저장 용량이 한도의 80%를 초과했습니다. 데이터 정리를 검토하세요.` | `Storage exceeds 80% of the limit. Consider cleaning up data.` |
| `warn.critical` | `저장 용량이 한도의 90%를 초과했습니다. 곧 한도에 도달할 수 있습니다.` | `Storage exceeds 90% of the limit. The limit may be reached soon.` |
| `notice.estimate` | `테이블 크기와 행수는 데이터베이스 통계 기반 추정치입니다.` | `Table sizes and row counts are estimates based on database statistics.` |
| `table.title` | `테이블별 상세` | `Details by table` |
| `table.col.name` | `테이블` | `Table` |
| `table.col.size` | `데이터 크기` | `Data size` |
| `table.col.rows` | `행수` | `Rows` |
| `table.empty` | `표시할 테이블이 없습니다.` | `No tables to display.` |
| `error.title` | `사용량을 불러오지 못했습니다` | `Failed to load usage` |
| `error.description` | `잠시 후 다시 시도해 주세요.` | `Please try again later.` |

### `common.json` (수정 — 메뉴)
| 키 | kr | en |
|----|-----|-----|
| `backoffice.systemSetting.group` | `시스템` | `System` |
| `backoffice.systemSetting.storage.title` | `DB 사용량 모니터링` | `Database Usage` |
| `backoffice.systemSetting.storage.description` | `Forge SQL 저장 용량 사용 현황` | `Forge SQL storage usage` |
| `pages.storage` | `DB 사용량 모니터링` | `Database Usage` |

> `common.json`은 공유 파일이라 다른 세션(gantt/locales) 충돌 주의 — 구현 시 최신 상태를 pull 후 추가.

---

## 7. 권한 처리 (백오피스 관리자 전용)

### 7.1 기존 권한 체계 요약
- 프론트 `usePermissionStore.loadPermissions()` → `invoke('userPermissionCheck')` → `PermissionService.userPermissionCheckService()`.
- Jira 사이트 관리자(`isAdmin`)는 `Admin` permission 전체 반환. 일반 사용자는 `permission_key`로 매핑된 permission 반환. 미등록 사용자는 전 페이지 `false` fallback 배열 반환.
- 프론트 `permissionMap` 합성: **API에 없는 pageId는 `{read:true, write:true}`로 기본 처리**(usePermissionStore). ← 핵심 리스크.

### 7.2 STORAGE_MONITORING 추가 (관리자 전용 지향)
1. `src/seed/SeedData.js` — `Admin` pages에 `{ pageId:'STORAGE_MONITORING', value:{read:true,write:true} }`, `Member` pages에 `{ pageId:'STORAGE_MONITORING', value:{read:false,write:false} }` 추가.
2. `PermissionService.userPermissionCheckService()` 미등록 사용자 fallback 배열에 `{ pageId:'STORAGE_MONITORING', value:{read:false,write:false} }` 추가.
3. 프론트 `PAGE_IDS`에 `"STORAGE_MONITORING"` 추가(§4.7).
4. 페이지/메뉴 게이트: `canRead("STORAGE_MONITORING")` / `isReadable("STORAGE_MONITORING")`.

### 7.3 ⚠ 기존 설치 마이그레이션 (미결정 — §9 P1)
- `SeedData.js`의 시드는 `if (existing) continue;`로 **이미 존재하는 permission 엔티티엔 새 pageId를 추가하지 않는다**. 따라서 **기존 설치**에서는 `STORAGE_MONITORING`이 API 응답에 없고 → 프론트 fallback `{read:true,write:true}` → **일반 Member도 페이지가 보인다**(관리자 전용 의도 위배).
- 신규 설치(온인스톨 시드)는 정상적으로 Member=false 적용됨.
- **선택지**(리더 결정 필요):
  - (A) **수용**: 모니터링은 읽기 전용·저민감(쓰기 없음)이므로 기존 설치에서 Member 노출을 허용. 가장 단순. → v1 권장 기본값.
  - (B) **시드 마이그레이션**: `onInstall`의 `SEED_VERSION` 상향 + 시드 로직을 "기존 permission에 누락 pageId 병합(merge)"으로 보강해 upgrade 트리거(`avi:forge:upgraded:app`)에서 반영. 정확하지만 시드 멱등 로직 수정 필요(범위 확대).
- 본 설계 기본 가정: **(A) 수용**으로 진행하되, 관리자 전용을 엄격히 원하면 (B)를 별도 태스크로.

---

## 8. KVS 용량 노출 — 제외 판단(제안)

요구사항의 "선택 검토" 항목. **v1에서 제외 권장.** 근거:
- Forge KVS는 **집계 사이즈/총량 API를 제공하지 않는다.** 엔티티 종류/개수를 얻으려면 각 Custom Entity를 전량 스캔(query iterate)해야 하며, 이는 비용·지연이 크고 이번 스코프(SQL 용량 감시)의 핵심도 아니다.
- KVS는 "용량 누적형 위험"이 SQL만큼 크지 않음(요구사항 배경과 일치).
- **후속 확장 훅만 유지**: `StorageUsage` 객체에 추후 `kvs: { entities:[{name,count}], ... }` 필드를 최상위 추가하면 되는 구조라 계약 변경 없이 확장 가능. v1 응답엔 미포함.

---

## 9. 미결정 / 확인 필요 (리더 판단)

| # | 우선순위 | 항목 | 기본 가정(본 설계) |
|---|---------|------|-------------------|
| 1 | **P0** | Forge SQL에서 `information_schema.tables` + `DATABASE()` 조회가 실제로 허용되는가 | 허용된다고 가정. **구현 착수 전 `forge tunnel`로 실측 필수.** 불가 시 기능 성립 불가 → 대안 논의 필요 |
| 2 | P1 | 기존 설치에서 Member의 페이지 노출(§7.3) | (A) 수용(읽기 전용 저민감). 엄격 관리자 전용 원하면 (B) 시드 마이그레이션 별도 태스크 |
| 3 | P1 | 환경별 한도(256/128 MiB) 실제 반영 필요성 | 코드는 `STORAGE_LIMIT_BYTES` 오버라이드 훅 제공. 실제 값 주입은 배포 운영 체크리스트(`forge variables set`) |
| 4 | P2 | 응답 래핑을 `content`로 확정(요구사항 예시는 flat) | `content` 래핑 확정(코드베이스 관례). 프론트는 `res.content` 소비 |
| 5 | P2 | 메뉴 배치 그룹("시스템" 신규 vs 기존 그룹) | 신규 그룹 `common.backoffice.systemSetting` 제안. 팀 선호 시 기존 그룹 편입 가능 |
| 6 | P2 | 테이블 리스트 렌더 컴포넌트(`dynamic-table` vs 공통 `CommonTable`) | 팀 표준 우선. 최소 구현은 `@atlaskit/dynamic-table` |
| 7 | P3 | TiDB 통계 추정치 정확도(§3.5) | 근사치 허용 + InfoTip 고지. 정밀 필요 시 `ANALYZE` 스케줄(범위 외) |

---

## 10. 구현 작업 분해

### backend 체크리스트
1. `src/resolver/storage/StorageQuery.js` — `TABLE_STATS` 상수(§3.1).
2. `src/resolver/storage/storageConstants.js` — `DEFAULT_LIMIT_BYTES`, `resolveLimitBytes()`(§3.3).
3. `src/resolver/storage/StorageRepository.js` — `findTableStats()`(`executeQuery` 재사용).
4. `src/resolver/storage/StorageService.js` — `getStorageUsageService()`: 매핑·합산·정렬·`{ content }` 반환(§2-B 정확히).
5. `src/resolver/storage/StorageController.js` — `registerStorageController` + `getStorageUsage` define(responseWrapper).
6. `src/index.js` — import + `registerStorageController(resolver)` 등록.
7. (선택) `src/utils/errors/ErrorCodes.js` — `STORAGE_USAGE_QUERY_FAILED` 추가 + Service try/catch 재-throw.
8. `src/seed/SeedData.js` — Admin(read/write true)·Member(false) `STORAGE_MONITORING` 시드.
9. `src/resolver/backoffice/permission/PermissionService.js` — 미등록 fallback 배열에 `STORAGE_MONITORING`(false) 추가.
10. **(P0)** `forge tunnel`로 `information_schema` 조회 실측 검증.

### frontend 체크리스트
1. `static/ui/src/constants/pages.jsx` — `PAGE_IDS`에 `"STORAGE_MONITORING"`.
2. `static/ui/src/utils/queryKey/backofficeKeys.js` — `storageUsage: () => ["storage","usage"]`.
3. `static/ui/src/utils/format/formatBytes.js` — 신규 유틸(§4.6).
4. `static/ui/src/backoffice/page/storage/storageConstants.js` — `STORAGE_THRESHOLDS`, `levelOf`(§4.4).
5. `static/ui/src/backoffice/page/storage/useStorageUsage.js` — useQuery 훅(§4.2, `res.content` 소비).
6. `.../storage/StorageUsageGauge.jsx` — 게이지 막대 + StatusLozenge + SectionMessage 경고(§4.4).
7. `.../storage/StorageTableList.jsx` — 테이블 상세(§4.5).
8. `.../storage/StoragePage.jsx` — 권한 게이트 + 로딩/에러 + 두 컴포넌트 조립(§4.3).
9. `static/ui/src/App.jsx` — `/backoffice/storage` 라우트.
10. `static/ui/src/components/dropdown/BackofficeDropdown.jsx` — 메뉴 항목(권한 게이트).
11. i18n: `locales/kr/storage.json`·`locales/en/storage.json` 신규 + `common.json` 메뉴 키 → `cd static/ui && npm run merge`.
12. `cd static/ui && npm run build`로 회귀 확인.

### 검증 포인트(integration-verifier 인계)
- `getStorageUsage` 응답이 §2-B `StorageUsage` shape과 정확히 일치(필드명/중첩), 프론트가 `res.content` 소비.
- `tables` 내림차순 정렬 + `totalBytes = Σ dataBytes` + `usedPercent = round(total/limit*100,1)` 계산 일치.
- 임계치 판정이 프론트 `STORAGE_THRESHOLDS`(80/90) 기준으로만 이뤄짐(서버 이중 정의 없음).
- 빈 결과/쿼리 실패/권한 없음 3개 경로 각각 UI 처리 확인.
- 신규 쿼리키가 `backofficeKeys` 팩토리로 정의(인라인 0건).
- i18n `storage.*`·`common.backoffice.systemSetting.*` merge 반영 + 소비 키 일치.
- (P0) information_schema 실측 가능 여부 — 미검증 시 솔직히 분류.
```
