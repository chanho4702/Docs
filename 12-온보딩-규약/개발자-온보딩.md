# moveseye (DMOVE) — 개발 신입 온보딩 가이드

> Zabbix 기반 인프라 모니터링 대시보드 **moveseye(DMOVE)** 에 새로 합류한 개발자를 위한 안내서입니다.
> 제품의 정체성부터 기술 구조·코드 흐름·개발 워크플로우까지 다룹니다.

---

## 1. 이 제품이 뭔가

**moveseye(DMOVE)는 Zabbix 기반 인프라 통합 모니터링 대시보드입니다.** 운영팀이 서버·네트워크
장비·클라우드(AWS) 자원의 상태를 한 화면에서 실시간으로 보고, 장애(문제/이벤트)를 추적하고,
IT 자산을 관리할 수 있게 합니다.

엔지니어 관점에서 핵심은 이 한 줄입니다:

> **"Zabbix에 쌓인 모니터링 데이터를 BE가 중개·가공해서, FE 대시보드로 시각화하는 풀스택 앱."**

일반 SaaS와 다른 점은 **모니터링 원천 데이터를 우리가 만들지 않는다**는 것입니다. 실 데이터는
외부 **Zabbix 7.0.6**(`dmove.co.kr`)이 수집하고, 우리 백엔드는 그걸 **JSON-RPC로 끌어와**
권한·집계·캐싱을 입혀 FE에 내려줍니다. 그래서 백엔드의 일은 "데이터 생성"이 아니라
**중개(Zabbix/AWS) + 가공(권한·집계) + 자체 도메인(사용자·권한·자산·리포트) 관리**입니다.

---

## 2. 모노레포 구조 — 어디에 뭘 짜야 하나 (⚠️ 신입 첫 함정)

`C:\solutions` 한 루트에 세 프로젝트가 있습니다. **새 코드를 어디에 넣느냐**가 가장 먼저 헷갈리는 지점입니다.

| 디렉터리 | 역할 | 작업 규칙 |
|---|---|---|
| **`moveseye-be-spring/`** | **백엔드 정본** (Spring Boot 3.3 + JPA/Flyway + Redis) | ✅ 2026-06-22 단일 채택. **새 BE 코드·수정은 여기에만** |
| `moveseye-be/` | 구 백엔드 (NestJS 10 + TypeORM) | 참조용 존치(병행 종료). 계약 확인용으로만 읽음 |
| `moveseyee_fe/` | 프론트엔드 (React 19 + Vite + Ant Design 5) | ✅ 활성 |

> ⚠️ **런타임 주의:** FE는 **아직 구 Nest(:3000)** 에 연결돼 있습니다. 새 BE 기능은 Spring에만 짜지만,
> FE 런타임을 Spring으로 돌리는 전환은 **별개 작업**입니다. "Spring에 짰는데 화면에 안 보인다"면
> 이 연결 상태부터 의심하세요.
>
> 💡 Spring은 Nest를 **엔드포인트/필드명/타입/상태코드까지 1:1로 보존**하도록 변환됐습니다.
> 그래서 BE를 고칠 때 "응답 형식을 바꾸면 FE가 깨진다"가 **최우선 원칙**입니다(§6 참조).

---

## 3. 기술 스택 한눈에

| 영역 | 백엔드 (`moveseye-be-spring`) | 프론트 (`moveseyee_fe`) |
|---|---|---|
| **언어/런타임** | Java 17 / Spring Boot 3.3.5 | TypeScript 5 / React 19 |
| **빌드** | Gradle (Kotlin DSL), `gradlew.bat` | Vite 4 + SWC |
| **데이터** | PostgreSQL(JPA/Hibernate 6) + Flyway + Redis | — |
| **서버 상태** | — | TanStack React Query 5 (`useDmoveQuery` 래퍼) |
| **클라이언트 상태** | — | Redux Toolkit + redux-persist(암호화) |
| **UI** | — | Ant Design 5 (래퍼 컴포넌트 경유) + Emotion/SCSS |
| **통신** | Zabbix JSON-RPC 2.0, AWS SDK v2 | Axios(커스텀 인스턴스: 토큰주입·401처리) |
| **인증** | auth0 java-jwt(HS256), bcrypt | 쿠키 토큰 + Redux |
| **시각화** | — | ECharts(+gl 3D), Mapbox/MapLibre GL |
| **i18n / 문서** | springdoc Swagger | i18next (EN/KR) |

> 익숙지 않을 수 있는 건 **Zabbix JSON-RPC 연동**과 **Nest 1:1 계약 보존 제약** 정도입니다.
> 나머지는 일반적인 Spring + React 풀스택이라 빠르게 적응됩니다.

---

## 4. 전체 아키텍처 — 데이터는 어떻게 흐르나

```
   [React UI]
   useDmoveQuery → services/*.api.ts → Axios(/api/v1/...)
        │  Bearer 토큰 자동 주입 (axiosInstance)
        ▼
   [Spring BE]  Controller → Service → Repository/Zabbix → 가공
        │                         │
        │              ┌──────────┼───────────────┐
        ▼              ▼          ▼               ▼
   PostgreSQL      Redis(60s)  Zabbix JSON-RPC   AWS SDK
   (사용자·권한·     캐시        (host.get,        (EC2/
    자산·이벤트)                 history.get …)    CloudWatch)
        ▲
        │  ApiResult<T> { status, code, data, syncTime }
        └────────────────────  응답  ────────────────────▶ FE
```

핵심 흐름 2가지를 기억하세요:

1. **FE는 BE의 REST만 호출**합니다(직접 Zabbix를 부르지 않음). BE가 Zabbix·AWS·DB를 전부 중개합니다.
2. **BE는 Zabbix 결과를 Redis에 캐싱**(기본 TTL 60초)하고, **@Scheduled로 10분마다** 호스트그룹/사용자/역할을 Zabbix↔DB 동기화합니다.

### FE에서 데이터를 읽는 표준 코드
```typescript
const { data, isLoading, syncTime } = useDmoveQuery<TResponseList<TServer>>({
  queryKey: [SERVER_QUERY_KEY.LIST, param],
  queryFn: () => ServerService.getList({ offset, limit }),
  refetchInterval: TEN_MINUTES,
  enabled: !!param,
});
```

---

## 5. 백엔드 구조 (`moveseye-be-spring`)

### 5.1 계층
```
Controller → Service → (Repository / ZabbixXxxService) → PostgreSQL · Redis · Zabbix · AWS
```
도메인: `Auth`, `User`(사용자·그룹·역할·호스트그룹 권한), `Host`(서버/네트워크 메트릭),
`Host Event`(문제·이벤트), `AWS`(클라우드 인프라), `Setting`, `Admin`.

### 5.2 Zabbix 연동의 핵심
- `ZabbixClient`가 JSON-RPC 2.0으로 Zabbix를 호출하고, 도메인별 11개 `ZabbixXxxService`
  (`host.get`, `history.get`, `problem.get`, `event.get` …)가 이를 감쌉니다.
- ⚠️ **본문은 반드시 `objectMapper.writeValueAsString()` 문자열로 전송** — 객체로 보내면
  JDK HttpClient가 chunked 스트리밍해서 Zabbix가 `Invalid JSON(-32700)`을 던집니다.

### 5.3 응답 표준화 — `ApiResult<T>`
모든 응답은 `{ status, code, errorCode, message, data, syncTime }` 형태입니다.
- ⚠️ **권한 거부(403)는 HTTP 200 + body `code:403`** 으로 나갑니다(Nest 원본 동작 보존). `401`만 실제 상태코드입니다. "정상화"하지 마세요 — FE가 그 형태에 맞춰져 있습니다.

### 5.4 인증·권한
- 로그인 → DB 사용자 bcrypt 검증 → Zabbix 토큰 발급 → **JWT(HS256)** 발급.
- 권한은 RBAC 3단계(**SUPER_ADMIN / ADMIN / USER**). `RolesInterceptor`가 전역 등록되어 있어,
  컨트롤러에 **`@RolesGuarded` 마커가 있을 때만** `@Roles`를 검사합니다(Nest의 RolesGuard 적용 범위 1:1 재현).
  - ⚠️ 새 컨트롤러에 `@Roles`만 달고 `@RolesGuarded`를 빠뜨리면 **권한 검사가 조용히 무시**됩니다.

### 5.5 DB / 마이그레이션
- 핵심 엔티티: `user`, `user_group`, `host_group`(host_data JSONB), `role`(권한 JSON),
  `setting`, `event_problem`, `dashboard_widget`, `host_group_report`, `otp`.
- 스키마는 **Flyway**로 버전 관리. 🔴 **적용된 `Vn__*.sql`은 절대 수정 금지** — 변경은 항상
  새 `V(n+1)__*.sql`로 분리하고, 공유 dev DB라 `ADD COLUMN IF NOT EXISTS`처럼 멱등하게 작성합니다.

---

## 6. 프론트엔드 구조 (`moveseyee_fe`)

### 6.1 라우팅 — `src/routes/routes.tsx`
React Router 6(`createBrowserRouter`). 권한 보호 라우트는 **반드시 `PageWrapper`로 감쌉니다.**
```tsx
element: <PageWrapper children={<ServerPage/>} permissionKey={DmovePermissionsKey.SERVER_MONITORING} />
```
경로 상수는 `constants/routes.ts`의 `PATH_*`, 사이드 메뉴는 `layouts/app/SideNav.tsx`에 추가.

화면 영역: `/dashboards`, `/monitoring/*`(호스트그룹·서버·네트워크), `/cloud-infra-monitoring/*`(EC2/VPC),
`/event-alert/*`(문제·이벤트), `/asset/*`(자산·맵뷰), `/users-roles/*`, `/setting/my-page`.

### 6.2 레이어 규칙 (CLAUDE.md 핵심만)
- **API 호출은 전부 `services/*.api.ts`** 에. 컴포넌트에서 직접 axios 금지. `API`는 `services/axiosInstance.ts`.
- **서버 상태 = `useDmoveQuery`**, **앱 상태(auth/theme/language) = Redux Toolkit**.
- 쿼리 키는 `constants/queryKey.ts`의 `[DOMAIN]_QUERY_KEY`. 같은 API라도 페이지가 다르면 키를 분리.
- Ant Design은 **래퍼 경유**(`DmoveTable`, `DSpin`, `DSelect` …). 테이블 컬럼은 `useTableColumns`(i18n 자동).
- 응답 타입은 제네릭 래퍼: `TResponse<T>` / `TResponseList<T>`. **`any` 금지, 매직넘버 금지.**

### 6.3 ⚠️ useDmoveQuery 언랩 깊이 (신입 단골 실수)
axios 인터셉터 + `useDmoveQuery`가 응답을 **2겹 벗깁니다.** 그래서 소비자는 **`payload`를 직접** 받습니다.
`data.data`로 한 번 더 들어가면 **과다 언랩**입니다. 테스트 mock도 payload를 직접 반환하도록 작성하세요.

### 6.4 i18n
사용자 노출 문자열은 전부 `t()`. 키는 `snake_case`로 **`en.json`/`kr.json` 둘 다** 추가. fallback은 `t("key","Fallback")`.

---

## 7. 개발 워크플로우 — 주요 커맨드

### 백엔드 (`moveseye-be-spring/`, PowerShell)
```powershell
.\gradlew.bat build -x test     # 컴파일/빌드
.\gradlew.bat test              # 단위 테스트 (JUnit5 + Mockito)
# bootRun 전: .env를 현재 셸에 export해야 함 (⚠️ 자동 로드 안 됨)
#   안 하면 ${DB_PORT} 미치환으로 APPLICATION FAILED TO START
#   SPRING_FLYWAY_ENABLED=false 로 dev DB 스키마 보호
.\gradlew.bat bootRun
```
- **전제**: JDK 17(`JAVA_HOME` 지정 필수 — 시스템 기본 Java 8), PostgreSQL(:5432 `dmove`) + Redis + 실 Zabbix.
- Swagger: 기동 후 `/api/swagger-ui.html`.

### 프론트엔드 (`moveseyee_fe/`)
```bash
npm run dev            # 개발 서버 (Vite, http://localhost:5173)
npm run build          # 프로덕션 빌드 (tsc && vite build)
npm run lint           # ESLint (0 warnings)
npm test               # Jest 테스트
```
> Jest 설정은 `jest.config.cjs`, 테스트는 `src/__tests__/*.test.tsx`에 있습니다.
> Vite `import.meta.env`를 사용하는 모듈은 반드시 mock 처리합니다.

---

## 8. 도메인 핵심 개념 (코드 곳곳에 등장)

| 용어 | 뜻 |
|---|---|
| **호스트(Host)** | Zabbix가 모니터링하는 대상 1대(서버/네트워크 장비). |
| **호스트 그룹(Host Group)** | 호스트 묶음 + **권한 경계**. ADMIN/USER는 할당된 그룹만 조회 가능. |
| **메트릭/히스토리** | CPU·메모리·디스크·네트워크 시계열. Zabbix `history.get`/`trend.get`에서 옴. |
| **문제(Problem) / 이벤트(Event)** | 활성 알람과 그 발생/해소 이력. 장애 추적의 원천. |
| **syncTime** | 응답에 실려오는 "이 데이터의 기준 시각". 캐시/동기화 신선도 판단용. |
| **Setting** | Zabbix/AWS 접속정보. 없으면 클라우드 호출이 `SETTING_NOT_FOUND`. |

---

## 9. 처음 코드를 파악하는 추천 순서

1. **`moveseye-be-spring/README.md` + `CLAUDE.md`** — BE가 무엇을 어떻게 포팅했고 어떤 함정이 있는지.
2. **`moveseyee_fe/CLAUDE.md`** — FE 레이어 규칙·테스트·i18n 관례.
3. **`manifest`가 아니라 라우팅부터** — `routes.tsx`(FE)로 화면 전체 그림, BE는 도메인별 Controller로 엔드포인트 그림.
4. 관심 기능 하나를 골라 **FE 페이지 → `useDmoveQuery` → `services/*.api.ts` → Spring Controller → Service → Zabbix/DB**까지 한 줄로 따라가 보기.
5. 단위 테스트(`__tests__/`, BE `src/test`)로 도메인 규칙·계약 형태 확인.

> 💡 풀스택 기능(BE 엔드포인트 + FE 연동)을 한 번에 개발할 때는 모노레포에 **`fullstack-feature` 스킬**
> (BE→계약→FE→QA 파이프라인)과 **`api-contract-sync` 스킬**(타입/계약 정합)이 준비돼 있습니다.

---

## 10. 더 보기

- **「제품소개_신규입사자.md」** — 비개발 포함 전반 소개(기능·가치 중심)
- 루트 규약: `C:\solutions\CLAUDE.md` / BE 규약: `moveseye-be-spring\CLAUDE.md` / FE 규약: `moveseyee_fe\CLAUDE.md`
- API 문서(Swagger): BE 기동 후 `/api/swagger-ui.html`
