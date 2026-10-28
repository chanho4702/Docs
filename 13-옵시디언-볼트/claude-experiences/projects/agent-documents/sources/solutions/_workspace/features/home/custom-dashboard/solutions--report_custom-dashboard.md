# 서버 모니터링 커스텀 차트 개발 완료 보고

> 작성일: 2026-06-17 · 대상: 서버 모니터링 호스트 상세 페이지

---

## 1. 개요

서버 모니터링 **호스트 상세 페이지**(`ServerMonitoringDetail`)에서, 사용자가 해당 호스트가 수집 중인 Zabbix 항목을 직접 골라 **커스텀 차트(위젯)** 를 만들고 드래그/리사이즈로 배치할 수 있는 기능을 추가했다. 기존 시스템 제공 차트(CPU/메모리/디스크/네트워크/이벤트)는 그대로 두고, 별도 탭으로 분리하여 함께 제공한다.

- 위젯은 **호스트별로 공유**된다(특정 사용자 소유 아님, 전역 1벌).
- 레이아웃·항목·차트 유형은 DB에 저장되어 영속화된다.
- 백엔드는 **NestJS·Spring Boot 양쪽에 동일 구현**(동일 API 계약).

---

## 2. 주요 기능

| 구분 | 내용 |
|---|---|
| 차트 추가 | "차트 추가" 모달에서 **템플릿**(서버 기본 모니터링) 또는 **커스텀**(항목 직접 선택) 방식 선택 |
| 항목 선택 | 호스트 수집 항목 중 **숫자형(차트 가능)** 항목만 선택, 항목 설명 표시 |
| 차트 유형 | line / area / bar / scatter(시계열) + pie / gauge(현재값 스냅샷) |
| 배치 | react-grid-layout 기반 **드래그·리사이즈**, 편집 모드에서 레이아웃 일괄 저장 |
| 차트 제어 | 카드별 **기간 필터**(1H/6H/24H/7D), **차트 ↔ 테이블 전환**, 전체화면 보기 |
| 이름 변경 | 편집 모드에서 카드 제목 인라인 수정 |
| 테이블 보기 | 원본 값 표 + 가로/세로 스크롤 + 컬럼 정렬 |
| 동기화 | 페이지 최상단에 **동기화 시간 표시 + 수동 동기화 버튼**(서버 모니터링 목록과 동일) |
| 다국어 | 템플릿/위젯 라벨 i18n(EN/KR) |

---

## 3. 아키텍처

```
[FE] ServerMonitoringDetail (탭: 기본 차트 / 커스텀 차트)
        │  useWidgets (목록 + CRUD + 레이아웃 저장)
        ▼
[BE] GET/POST/PATCH/DELETE /host/{id}/widgets    ← dashboard_widget 테이블 (호스트 스코프, 공유)
[BE] GET /host/{id}/items/history                ← Zabbix history/trend 프록시
[BE] GET /hosts/{id}/collected-info              ← 수집 항목 + 설명 + 차트가능 여부
```

- 백엔드 2종(NestJS / Spring Boot)이 **동일 PostgreSQL(`dmove`)**·동일 계약을 공유한다.
- 위젯 데이터(차트)는 기존 `TMonitorChart[]` 응답 형태를 재사용하여 FE 차트 파이프라인을 그대로 활용한다.

---

## 4. 백엔드 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/host/{id}/widgets` | 호스트의 위젯 목록 |
| POST | `/host/{id}/widgets` | 위젯 생성(제목/차트유형/항목/위치·크기) |
| PATCH | `/host/{id}/widgets/layout` | 레이아웃(위치·크기) 일괄 저장 |
| PATCH | `/host/{id}/widgets/{widgetId}` | 위젯 수정(제목/유형/항목) |
| DELETE | `/host/{id}/widgets/{widgetId}` | 위젯 삭제 |
| GET | `/host/{id}/items/history?itemids=&from=&to=` | 선택 항목들의 history(1시간 초과 시 trend 폴백) |
| GET | `/hosts/{id}/collected-info` | 수집 항목 목록(+ `description`, `chartable`) |

- **위치/크기는 프론트가 결정해 전달**, 백엔드는 저장만 담당(누락 시 기본값).
- 모든 응답 envelope에는 전역 인터셉터가 **`syncTime`**(Zabbix 동기화 배치 시각)을 자동 주입한다. (Nest `response.interceptor`, Spring `SyncTimeResponseAdvice` — 양쪽 동일)

---

## 5. DB 스키마 — `dashboard_widget`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | serial | PK |
| host_id | varchar | 호스트 스코프 (인덱스) |
| title | varchar | 위젯 제목 |
| chart_type | varchar | line / area / bar / scatter / pie / gauge |
| config | jsonb | `{ itemIds: string[] }` |
| pos_x / pos_y | int | 그리드 좌표 |
| width / height | int | 그리드 크기 |

- **user_id 없음(공유)**. 호스트 단위 1벌.
- Nest TypeORM 마이그레이션 / Spring Flyway 양쪽으로 동일 스키마 관리. dev DB 적용 완료.

---

## 6. 주요 설계 결정

- **공유 모델**: 위젯은 호스트별 공유(사용자 소유 아님). "등록" = DB 저장.
- **항목 설명**: Zabbix `description` 우선, 없으면 핵심 키 사전(FE 상수) → 항목명 순으로 폴백.
- **차트 가능 판별**: value_type ∈ {0(float), 3(unsigned)} 인 숫자형 항목만 차트화 허용.
- **시계열 정합**: 시리즈별 타임스탬프가 달라도 **공통 시각 눈금**으로 정렬(인덱스 기반 아님), 빈 구간은 null + `connectNulls`.
- **기본값 위치/크기**: 프론트가 결정·전달(향후 확장 용이). 템플릿은 고정 좌표를 들고 옴.

---

## 7. UI 개선 · 버그픽스 (마감 단계)

| 항목 | 내용 |
|---|---|
| 탭 분리 | 호스트 정보 박스 하위에서 **기본 차트 / 커스텀 차트** 탭 전환 |
| 그리드 폭 버그 | 커스텀 탭 진입 시 그리드 폭이 초기값(1280px)에 굳어 우측 여백이 남던 문제 → 탭 활성 시 폭 재측정으로 해결 |
| 기간 필터 위치 | 상단 공통 기간 필터를 **기본 차트 탭 안으로** 이동(커스텀은 카드별 자체 필터 사용) |
| 차트 캔버스 넘침 | 기본 차트 ECharts 캔버스가 카드를 벗어나던 문제 → 컨테이너 종속 + `overflow:hidden` 클리핑 |
| 레전드 스크롤 | 항목이 많으면 차트 영역을 침범 → 레전드 `scroll`(페이지네이션) 처리 |
| 동기화 시간 | 카드별 표시 제거, **페이지 최상단 우측에 1회** + 수동 동기화 버튼(목록 화면과 동일) |
| 그리드 여백 | 그리드 바깥 여백 제거(`containerPadding`)로 기본 차트와 정렬 |
| 요청 취소 에러 | 중복 요청 자동 취소 시 발생하던 콘솔 `CanceledError`(정상 동작) 노이즈 제거 |
| 테이블 보기 | **가로/세로 스크롤**(헤더 고정) + **컬럼 정렬**(시간·값) 추가 |

---

## 8. 검증 상태

- 백엔드(Nest/Spring) · 프론트엔드 **전 단계 컴파일/타입 체크 통과**.
- `dashboard_widget` 테이블 dev DB 적용 완료.
- ⚠️ **실 Zabbix 런타임 시각 검증 진행 중** — 호스트 상세에서 위젯 생성/렌더, 드래그·리사이즈 저장, 테이블/정렬, 동기화 버튼 동작을 실데이터로 최종 확인 예정.

---

## 9. 후속(차순위) 항목

- 단위 혼합 차트(bytes + %)의 **다중 Y축** 지원.
- 집계형 위젯(이벤트/호스트그룹 상태 등) 및 전역 공유 대시보드(보류).
