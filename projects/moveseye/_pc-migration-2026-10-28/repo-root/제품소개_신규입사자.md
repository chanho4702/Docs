# moveseye (DMOVE) — 제품 소개

> 신규 입사자용 온보딩 문서
> 최종 갱신: 2026-06-23

---

## 1. 한눈에 보는 제품

**moveseye(DMOVE)** 는 **Zabbix 기반 인프라 통합 모니터링 대시보드**입니다.
운영팀과 인프라 담당자가 서버·네트워크 장비·클라우드(AWS) 자원을 **한 화면에서** 실시간으로
지켜보고, 장애를 빠르게 감지하고, IT 자산을 관리할 수 있도록 돕는 웹 애플리케이션입니다.

핵심 가치를 한 줄로 정리하면:

> "흩어져 있는 인프라 상태(온프레미스 + 클라우드 + 자산)를 한 곳에 모아,
> 누가 봐야 할지(권한)까지 통제하면서 보여준다."

### 무엇을 해결하나
- **분산된 모니터링** → Zabbix 데이터를 한 대시보드로 집중
- **느린 장애 대응** → 호스트/그룹별 문제(Problem)·이벤트 추적
- **온프레미스 ↔ 클라우드 단절** → AWS EC2/VPC를 같은 화면에서 통합
- **자산 파악의 어려움** → 자산 인벤토리·감가상각·위치 시각화
- **권한 관리** → 조직 구조에 맞춘 역할 기반 접근 제어(RBAC)

---

## 2. 주요 기능 영역

| 영역 | 사용자에게 주는 가치 |
|------|---------------------|
| **대시보드** | 자산 통계·카테고리별 분포·감가상각을 요약해 전체 현황을 한눈에 |
| **모니터링** | 호스트 그룹 / 서버(CPU·메모리·디스크) / 네트워크(인터페이스·트래픽)를 시계열 그래프로 추적 |
| **클라우드 인프라 모니터링** | AWS EC2 인스턴스·VPC 그룹을 지역별/상태별로 집계해 온프레미스와 통합 관리 |
| **이벤트/알람** | 호스트·그룹별 문제(Problem) 목록과 해결 이력으로 장애를 조기 감지·대응 |
| **자산 관리** | 자산 인벤토리, 지도 기반 맵뷰, 서버 위치별 분포로 IT 자산 생명주기 관리 |
| **사용자/역할 관리(RBAC)** | 사용자·그룹·역할·호스트그룹 권한을 세분화해 조직 구조에 맞게 통제 |
| **설정/마이페이지** | 사용자 프로필, Zabbix 연동 정보, 비밀번호 관리 |
| **다국어(i18n)** | 전 화면 한국어/영어 지원, 사용자 언어 설정 저장 |

### 주요 화면 흐름 (FE 라우팅 기준)
- `/dashboards` — 메인 대시보드(자산 통계·감가상각)
- `/monitoring/...` — 호스트 그룹 / 서버 / 네트워크 모니터링 + 상세·그래프
- `/cloud-infra-monitoring/...` — EC2 대시보드·목록·상세, VPC 그룹
- `/event-alert/...` — 문제 목록·상세, 호스트 그룹별 이벤트
- `/asset/...` — 자산 목록, 맵뷰, 서버 위치
- `/users-roles/...` — 사용자·그룹·역할·호스트그룹 권한
- `/setting/my-page` — 마이페이지
- `/sign-in`, `/password-reset` — 인증

---

## 3. 시스템 구성 (아키텍처 개요)

```
   [사용자 브라우저]
         │
   ┌─────▼──────┐   REST API    ┌──────────────────┐  JSON-RPC 2.0  ┌──────────────┐
   │   FE (React) │ ───────────▶ │  BE (Spring Boot) │ ─────────────▶ │ Zabbix 7.0.6 │
   │  moveseyee_fe│ ◀─────────── │ moveseye-be-spring│ ◀───────────── │  (실 모니터링) │
   └──────────────┘              └────────┬─────────┘                └──────────────┘
                                          │
                            ┌─────────────┼──────────────┐
                            ▼             ▼              ▼
                      [PostgreSQL]     [Redis]        [AWS SDK]
                     사용자·권한·자산   캐시(60s)     EC2/CloudWatch
```

- **FE**는 BE의 REST API만 호출하고, BE가 Zabbix·AWS·DB를 모두 중개합니다.
- BE는 Zabbix API 호출 결과를 **Redis에 캐싱**(기본 TTL 60초)해 반복 호출을 줄입니다.
- **@Scheduled**로 10분마다 Zabbix ↔ DB(호스트그룹/사용자/역할)를 동기화합니다.

> ⚠️ **현재 런타임 주의:** FE는 당분간 구 백엔드(NestJS, :3000)에 연결되어 있습니다.
> 새 백엔드 기능은 Spring(`moveseye-be-spring`)에만 반영하지만, FE의 실제 런타임 전환은 별개 작업입니다.

---

## 4. 모노레포 구조 (`C:\solutions`)

| 디렉터리 | 역할 | 상태 |
|----------|------|------|
| **`moveseye-be-spring/`** | **백엔드 정본** (Spring Boot 3.3 + JPA/Flyway + Redis) | ✅ 2026-06-22 단일 채택 확정. 새 BE 작업은 **여기에만** |
| `moveseye-be/` | 구 백엔드 (NestJS 10 + TypeORM) | 참조용 존치(병행 종료). FE가 아직 이 :3000에 연결됨 |
| `moveseyee_fe/` | 프론트엔드 (React 19 + Vite + Ant Design 5 + TanStack Query) | ✅ 활성 |

> 구 NestJS 백엔드는 Spring 변환의 **원본**입니다. Spring은 엔드포인트·필드명·타입·상태코드를
> NestJS와 **1:1로 보존**하도록 변환되어, FE 클라이언트는 변경 없이 동작합니다.

---

## 5. 기술 스택

### 프론트엔드 (`moveseyee_fe`)
| 분류 | 기술 |
|------|------|
| UI / 언어 | React 19 + Ant Design 5 + TypeScript 5 |
| 빌드 | Vite + SWC |
| 라우팅 | React Router DOM 6 |
| 상태 관리 | Redux Toolkit + Redux Persist (인증/테마/언어) |
| 서버 상태 | TanStack React Query 5 (`useDmoveQuery` 래퍼로 통일) |
| 통신 | Axios (토큰 주입·에러 처리 커스텀 인스턴스) |
| 시각화 | Apache ECharts, Mapbox/MapLibre GL |
| 다국어 | i18next |

### 백엔드 (`moveseye-be-spring`)
| 분류 | 기술 |
|------|------|
| 프레임워크 / 언어 | Spring Boot 3.3.5 + Java 17 |
| 빌드 | Gradle (Kotlin DSL) |
| ORM / 마이그레이션 | Spring Data JPA(Hibernate 6) + Flyway |
| 캐시 | Spring Data Redis |
| 인증 | auth0 java-jwt (HS256, Node 토큰 호환) + bcrypt |
| 외부 연동 | Zabbix JSON-RPC 2.0, AWS SDK v2 (EC2/CloudWatch) |
| API 문서 | springdoc-openapi (Swagger UI: `/api/swagger-ui.html`) |
| DB | PostgreSQL (jsonb 활용) |

---

## 6. 핵심 도메인 (BE)

| 도메인 | 다루는 영역 |
|--------|-------------|
| **Auth** | 로그인·세션·JWT 발급/검증 |
| **User** | 사용자·그룹·역할·호스트그룹 권한 관리 |
| **Zabbix 연동** | JSON-RPC 클라이언트(11개 서비스) + 10분 주기 동기화 |
| **Host** | 호스트(서버/네트워크) 모니터링·메트릭 조회 |
| **Host Event** | 이벤트·문제(Problem) 추적 |
| **AWS** | EC2/CloudWatch 기반 클라우드 인프라 모니터링 |
| **Setting** | Zabbix/클라우드 접속정보 관리 |
| **Admin** | 관리자 기능 (Zabbix 사용자/역할 조회 등) |

### 핵심 데이터 모델 (PostgreSQL)
`user`, `user_group`, `host_group`, `role`(권한 JSON), `setting`, `event_problem`,
`dashboard_widget`(개인화 대시보드), `host_group_report`(주/월간 리포트), `otp`

---

## 7. 인증·권한 흐름

### 로그인
1. `/sign-in`에서 이메일/비밀번호 입력 → `POST /auth/login`
2. BE: DB 사용자 조회 → bcrypt 검증 → Zabbix 토큰 발급 → **JWT(HS256) 발급**
3. FE: accessToken 쿠키 저장 → `getMe()`로 프로필 조회 → 역할별 권한 조회
4. 권한 정보를 Redux에 저장 → 메뉴 표시/숨김 및 페이지 접근 판단

### 권한(RBAC) 3단계
- **SUPER_ADMIN** — 전체 / **ADMIN** — 할당된 호스트그룹 제한 / **USER** — 읽기 위주
- FE 제어 레벨: 페이지(`PageWrapper permissionKey`) → 메뉴(`permissions[key].view`) → 버튼(`<Show if=...>`)
- 호스트그룹 접근: SUPER_ADMIN은 전체, 그 외는 `user_group` 매핑으로 할당된 그룹만

---

## 8. 신규 입사자가 먼저 알면 좋은 개발 관례

### 프론트엔드
- **모든 API 호출은 `useDmoveQuery`로 통일** (캐싱·자동 refetch). 쿼리 키는 `constants/queryKey.ts`.
  - ⚠️ axios 인터셉터 + `useDmoveQuery`가 응답을 **2겹 언랩**하므로 소비자는 `payload`를 직접 받습니다(`data.data`는 과다 언랩).
- **`any` 금지** — 모든 응답은 `TResponse<T>` / `TResponseList<T>` 타입 적용.
- 모든 UI 텍스트는 `t()` 함수 + `en.json`/`kr.json` 동시 작성.
- **테스트 실행:** `npx jest` (package.json에 test 스크립트 없음 — 문서와 불일치하니 주의).

### 백엔드
- **계약 1:1 보존이 원칙** — 엔드포인트/필드명/타입/상태코드를 NestJS 원본과 동일하게 유지(일부 403→200 같은 원본 동작도 보존).
- **Flyway 마이그레이션은 적용 후 수정 금지** — 스키마 변경은 항상 새 버전 파일로 분리.
- Zabbix JSON-RPC 본문은 반드시 `objectMapper.writeValueAsString()`으로 직렬화(스트리밍 방식은 "Invalid JSON" 유발).
- 기동 전 `.env` 환경변수 export 필요(자동 로드 안 됨).

### 풀스택 작업 시
- BE→계약→FE→QA를 한 번에 처리하는 하네스가 구성되어 있습니다(`fullstack-feature` 스킬).
- 코딩 규약 정본: `moveseye-be-spring/CLAUDE.md`(BE), `moveseyee_fe` FE 규약은 `fe-engineer` 에이전트 정의.

---

## 9. 더 알아보기

- 모노레포 루트 규약: `C:\solutions\CLAUDE.md`
- 백엔드 규약: `C:\solutions\moveseye-be-spring\CLAUDE.md`
- API 문서(Swagger): BE 기동 후 `/api/swagger-ui.html`
- 모니터링 원천 데이터: Zabbix 7.0.6 (`dmove.co.kr`)
