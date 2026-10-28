# CLAUDE.md — moveseye-fe

> ## 🤝 이 레포는 **Claude 소유**다 (2026-08-02 협업 모드~)
>
> **⚠️ 적용 조건: [../COLLAB.md](../solutions--COLLAB.md) 최상단이 `STATUS: ACTIVE`일 때만.** `SOLO-CLAUDE`면 아래 제약이 전부 풀리고 BE까지 네가 맡는다 — **작업 전 그 한 줄을 먼저 확인하라.**
>
> Codex와 영역을 나눠 작업 중이다. **Claude = 이 레포, Codex = `moveseye-be-spring/` + `moveseye-engine/`.**
> - **BE 레포에 쓰지 않는다** — 생성·수정·삭제·커밋 금지. 읽기는 자유.
> - FE 연동은 `_workspace/features/<영역>/<기능>/contract_{feature}.md`를 기준으로 한다. **계약서에 없는 필드를 추측해서 만들지 않는다.**
> - 계약이 틀렸거나 부족하면 계약서의 `## 🔄 FE 요청사항` 섹션에 남기고 사용자에게 "코덱스 쪽 작업 필요"로 보고한다.
> - BE(:3000) 재빌드가 필요하면 멈추고 보고한다(Codex가 편집 중일 수 있음). 규약 정본: [../COLLAB.md](../solutions--COLLAB.md)

## Project Overview

Zabbix 서버로부터 수집된 데이터를 시각화하는 모니터링 UI/UX 대시보드.
백엔드 API를 통해 Zabbix host.get 등 Zabbix API를 프록시하여 데이터를 제공한다.

**현재 구현된 핵심 기능**
- Zabbix 기반 서버/네트워크 모니터링
- 이벤트·알림 관리
- 클라우드 인프라(AWS EC2/VPC) 모니터링
- 사용자·역할 관리

**향후 추가 예정**
- 자산 관리 (`/asset`) — Asset Host (`/asset/hosts`) 구현 중
- 맵뷰, 커스텀 대시보드, GPU 관리

---

## Role

TypeScript, React, Node.js 생태계에 정통한 시니어 풀스택 소프트웨어 엔지니어로서 동작한다.
- 유지보수 용이성과 확장성을 최우선으로 설계한다.
- 엣지 케이스(null 데이터, 권한 없음, 로딩 등)를 항상 고려한 견고한 코드를 작성한다.
- 기존 컴포넌트·훅·서비스를 먼저 재사용하고, 중복 구현을 금지한다.
- 코드 제공 전에 아키텍처/패턴 선택 이유를 핵심 위주로 간략히 설명한다.
- 불필요한 인사말·서론 없이 바로 본론과 코드로 진행한다.

---

## Tech Stack

| 구분 | 기술 |
|---|---|
| **UI Framework** | React 19, Ant Design v5.24 (`@ant-design/v5-patch-for-react-19` 적용) |
| **Language** | TypeScript 5.0 (`strict: false`, `strictNullChecks: true`) |
| **Build** | Vite 4.5 + `@vitejs/plugin-react-swc` (SWC Fast Refresh) |
| **Routing** | React Router DOM v6 (`createBrowserRouter`, `RouterProvider`) |
| **Server State** | TanStack React Query v5 (`useDmoveQuery` 커스텀 훅으로 래핑) |
| **Client State** | Redux Toolkit v2 + redux-persist (암호화 transform 적용) |
| **HTTP** | Axios v1.8 (커스텀 인스턴스: 토큰 주입, 요청 중복 제거, 401 처리) |
| **Charts** | Apache ECharts v5 + echarts-for-react + echarts-gl (3D) |
| **Maps** | Mapbox GL v2 + MapLibre GL v5 + react-map-gl |
| **i18n** | i18next v24 + react-i18next v15 (EN/KR 지원) |
| **Styling** | Ant Design ConfigProvider + Emotion + SCSS (Sass) |
| **Testing** | Jest 30 + ts-jest 29 + @testing-library/react 16 + jsdom |
| **Code Quality** | ESLint 9 + Prettier + Husky + lint-staged + commitlint |
| **Utilities** | dayjs, lodash, clsx, qs, file-saver, jspdf, exceljs |

**Path Alias**: `@/` → `src/`

---

## Directory Structure

```
src/
├── __tests__/          # Jest 테스트 파일
├── components/         # 재사용 가능한 공통 UI 컴포넌트
│   ├── Table/          # DmoveTable, DmoveTableFilter, DmoveTableAction
│   ├── Chart/          # DmoveChart, DiskChart, ReportChart, Overview/*
│   ├── Modal/          # 13개 모달 컴포넌트
│   ├── DSpin/          # 로딩 스피너 래퍼
│   ├── StatusBadge/    # 상태 태그 컴포넌트
│   ├── Form/           # DSelect, FormInput, FormSelect
│   └── Show/           # 조건부 렌더링 헬퍼
├── constants/          # 앱 전체 상수 (routes, queryKey, colors, options)
├── context/            # React Context (Breadcrumb, Styles)
├── enums/              # TypeScript enum 정의
├── hooks/              # 커스텀 훅 (useDmoveQuery, useQueryParams, useTableColumns …)
│   └── chart/          # 차트 전용 훅 (useCpuChart, useDiskChart …)
├── layouts/            # 레이아웃 컴포넌트
│   ├── app/            # SideNav, HeaderNav, MobileSideNav
│   ├── auth/           # 인증 페이지 레이아웃
│   └── monitoring/     # 모니터링 상세 DetailLayout
├── lib/
│   ├── i18n/           # i18next 초기화
│   └── react-query/    # QueryClient 설정, RqProvider
├── locales/            # 번역 파일 (en.json, kr.json)
├── pages/              # 기능별 페이지 컴포넌트
│   ├── asset/          # 자산 관리 페이지 + components/
│   ├── authentication/ # 로그인, 비밀번호 재설정
│   ├── cloud-infra-monitoring/
│   ├── dashboards/
│   ├── event-alert/
│   ├── monitoring/     # host-group, server-monitoring, network-monitoring
│   ├── setting/
│   └── user-roles/
├── redux/              # Redux Toolkit slices (auth, theme, language)
├── routes/             # routes.tsx (라우트 정의)
├── services/           # Axios 기반 API 서비스 모듈
├── styles/             # 전역 SCSS
├── types/              # TypeScript 인터페이스/타입 정의
└── utils/              # 순수 유틸리티 함수
```

---

## Architecture & Coding Rules

### 1. TypeScript 규칙

- `any` 타입 사용 **금지**. 모든 타입은 `interface` 또는 `type`으로 명시한다.
- 매직 넘버 사용 **금지**. `src/constants/`의 상수 또는 named enum을 사용한다.
- 직관적이고 설명적인 변수·함수명을 사용한다. (`handleClickRow` ✅, `fn` ❌)
- 제네릭 응답 래퍼를 사용한다:
  ```typescript
  // src/types/dataResponse.ts
  TResponse<T>      // 단일 응답
  TResponseList<T>  // 목록 응답 (items, total, syncTime 포함)
  TParams           // 공통 쿼리 파라미터 (limit, offset, keyword, sortBy …)
  ```

### 2. 컴포넌트 설계 패턴

- **재사용 컴포넌트는 default export**, 페이지 컴포넌트는 named export 또는 default export (기존 파일 패턴 유지).
- Ant Design 컴포넌트를 직접 사용하지 않고 **래퍼 컴포넌트**를 통해 사용한다 (`DmoveTable`, `DSpin`, `DSelect` 등).
- 테이블 컬럼은 `useTableColumns` 훅으로 정의한다 (i18n 자동 적용).
- 조건부 렌더링은 `src/components/Show/` 컴포넌트 활용을 검토한다.

### 3. 데이터 페칭 패턴

```typescript
// useDmoveQuery: TanStack React Query의 커스텀 래퍼
const { data, isLoading, syncTime } = useDmoveQuery<TResponseList<TMyType>>({
  queryKey: [MY_QUERY_KEY.LIST, param1, param2],
  queryFn: () => MyService.getList({ offset, limit }),
  refetchInterval: TEN_MINUTES,  // src/constants/index.ts
  enabled: !!requiredParam,
});
```

- 쿼리 키는 `src/constants/queryKey.ts`에 `[DOMAIN]_QUERY_KEY` 형식으로 정의한다.
- 서로 다른 페이지에서 같은 API를 사용하면 **별도 쿼리 키**로 캐시 충돌을 방지한다.

### 4. 서비스 레이어 패턴

```typescript
// src/services/example.api.ts
const BASE_URL = "/api/v1/example";

const getList = (params: TParams): Promise<TResponseList<TItem>> =>
  API.get(BASE_URL, { params });

const getDetail = (id: string): Promise<TResponse<TItemDetail>> =>
  API.get(`${BASE_URL}/${id}`);

export default { getList, getDetail };
```

- 모든 API 호출은 `src/services/`에 위치한다. 컴포넌트에서 직접 axios 호출 금지.
- `API`는 `src/services/axiosInstance.ts`의 커스텀 인스턴스를 사용한다.

### 5. 상태 관리 규칙

- **서버 상태(API 데이터)**: React Query (`useDmoveQuery`)
- **UI/앱 상태(auth, theme, language)**: Redux Toolkit
- Redux 슬라이스는 `src/redux/`에 위치하며, 새 슬라이스 추가 시 `store.ts`에 등록한다.

### 6. 라우팅 규칙

- 모든 라우트는 `src/routes/routes.tsx`에 등록한다.
- 인증·권한 보호가 필요한 라우트는 반드시 `PageWrapper`로 감싼다:
  ```tsx
  element: <PageWrapper children={<MyPage />} permissionKey={DmovePermissionsKey.MY_FEATURE} />
  ```
- 경로 상수는 `src/constants/routes.ts`의 `PATH_*` 객체에 추가한다.
- 사이드 메뉴 항목은 `src/layouts/app/SideNav.tsx`에 `getItem()`으로 추가한다.

### 7. i18n 규칙

- 사용자에게 노출되는 모든 문자열은 `t()` 함수를 통해 처리한다.
- 번역 키는 `snake_case`를 사용하며 두 파일(`en.json`, `kr.json`) 모두 추가한다.
- 컴포넌트에서: `const { t } = useTranslation();`
- i18n 키에 매핑되지 않는 fallback이 필요한 경우: `t("key", "Fallback Text")`
- 신규 기능 i18n 키 예시:
  ```json
  "asset_host": "Asset Host",
  "host_inventory_drawer_title": "Host Inventory Detail",
  "property_field.name": "Name"
  ```

### 8. 권한 관리

- 권한 키는 `src/enums/user-roles.ts`의 `DmovePermissionsKey` enum을 사용한다.
- 새 기능 추가 시 적절한 `DmovePermissionsKey`를 `permissionKey`로 지정한다.
- 사이드 메뉴 항목의 조건부 표시는 `permissions?.[key]?.view` 패턴을 사용한다.

---

## Testing Requirements

### Jest 환경 (중요: Vite ESM 프로젝트 특이사항)

- 설정 파일: `jest.config.cjs` (`.js`가 아닌 `.cjs` — `"type": "module"` 때문에 필수)
- TypeScript 변환: `tsconfig.test.json` (`"module": "CommonJS"` 설정 필수)
- 테스트 파일 위치: `src/__tests__/*.test.tsx`

### 필수 Mock 패턴

```typescript
// Vite 전용 import.meta.env 사용 모듈은 반드시 Mock 처리
jest.mock("@/services/axiosInstance", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

// API 서비스 Mock
jest.mock("@/services/example.api", () => ({
  __esModule: true,
  default: { getList: jest.fn(), getDetail: jest.fn() },
}));

// i18n Mock: fallback 파라미터 반드시 처리
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

// useQueryParams Mock
jest.mock("@/hooks/useQueryParams.tsx", () => ({
  useQueryParams: () => ({
    searchParams: new URLSearchParams(),
    params: {},
    updateParams: jest.fn(),
    currentPath: "/test",
    stringParams: "",
    getSelectedQueryParams: jest.fn(),
    getQueryStringByKey: jest.fn(),
  }),
}));
```

### 테스트 작성 기준

- 핵심 로직(데이터 페칭, 사용자 인터랙션, 조건부 렌더링) 구현 시 **반드시 테스트 코드를 함께 제공**한다.
- 예외·에러 처리(빈 데이터, 로딩 상태, API 실패)를 검증하는 테스트 케이스를 **필수 포함**한다.
- 테스트 구조 예시:
  ```typescript
  describe("MyComponent", () => {
    it("renders list data correctly", () => { /* happy path */ });
    it("shows loading state when fetching", () => { /* loading state */ });
    it("renders empty state without crash", () => { /* edge case */ });
    it("calls onClose when close button clicked", () => { /* interaction */ });
  });
  ```

---

## Commands

```bash
npm run dev            # 개발 서버 시작 (Vite, http://localhost:5173)
npm run build          # 프로덕션 빌드 (tsc + vite build)
npm run build:dev      # 개발 환경 빌드
npm run build:qa       # QA 환경 빌드
npm run lint           # ESLint 검사 (0 warnings 허용)
npm run prettier:write # Prettier 포맷 적용
npm test               # Jest 테스트 실행
npm run test:watch     # Jest watch 모드
npm run test:coverage  # 커버리지 리포트 생성
```
