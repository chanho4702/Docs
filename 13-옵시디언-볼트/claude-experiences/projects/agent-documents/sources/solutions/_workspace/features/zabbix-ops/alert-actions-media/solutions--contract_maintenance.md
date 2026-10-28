# API 계약서 — 점검 기간(Maintenance)

> **산출 기준**: BE 소스(`zabbixadmin/ZabbixMaintenanceManageController` · `ZabbixMaintenanceManageService`, 2026-08-19) + Zabbix 7.0.6 실측.
> 선례 계약: `features/zabbix-ops/alert-actions-media/contract_alert-management.md` · `features/zabbix-config/macro/contract_macro.md`. Swagger와 어긋나면 소스가 정본.

베이스 `/zabbix-manage/maintenances`. **전 EP 관리자 전용**(거부 = 200 + body code 403). 업무 에러 200 + body `code`(§5). Flyway 변경 없음.
Zabbix `maintenance.*` 래핑 — 점검 중 대상 호스트의 문제 알림 억제(선택적으로 수집 중단).

**이 계층이 얹는 것**: `state`(ACTIVE/APPROACHING/EXPIRED — Zabbix UI가 프론트에서 계산하는 값) · 기간 한국어 요약 · **지금 이 점검으로 묶인 호스트 수**(host.get maintenanceids) · 사전 검증(대상/기간/범위) · 🔴 **timeperiod 유형별 필드 정리**(§4).

---

## 0. shape

```ts
ManagedMaintenance {
  maintenanceid; name; description;
  maintenanceType: 0|1;              // 0 수집 유지(알림만 억제) · 1 수집 중단
  activeSince: number; activeTill: number;   // epoch초(⚠️ Zabbix가 분 단위로 잘라 저장)
  state: "ACTIVE"|"APPROACHING"|"EXPIRED";  // now<since→APPROACHING, since≤now≤till→ACTIVE, else EXPIRED
  hostGroups: {id,name}[]; hosts: {id,name}[];
  timeperiods: Timeperiod[];         // Zabbix 원본(문자열): timeperiod_type/every/month/dayofweek/day/start_time/period/start_date
  timeperiodSummaries: string[];     // "매주 월·수요일 02:00 부터 1시간" — BE `MaintenanceSummary`
  tagsEvaltype: 0|2;                 // And/Or · Or
  tags: {tag, operator("0" 포함 | "2" 일치), value}[];   // ⚠️ 액션 조건 operator와 값이 다르다
  hostsInMaintenanceNow: number;
}
MaintenanceUpsertReq { name?; description?; maintenanceType?; activeSince?; activeTill?; groupIds?; hostIds?; timeperiods?; tagsEvaltype?; tags? }
```

---

## 1. GET `/` — 전체 목록(이름순) · GET `/{id}` · GET `/options` → `{ hostGroups[], hosts[] }`(이름순)

## 2. POST `/` — 생성
필수: `name` · `timeperiods` 1개 이상 · `groupIds ∪ hostIds` 1개 이상. `activeSince` 기본 now, `activeTill` 기본 +1일, `maintenanceType` 기본 0.
검증 순서: `MAINTENANCE_NAME_REQUIRED` → `MAINTENANCE_TARGET_REQUIRED` → `MAINTENANCE_TIMEPERIODS_REQUIRED` → `MAINTENANCE_RANGE_INVALID`(till ≤ since).

## 3. PUT `/{id}` — 부분 수정
🔴 **groupIds/hostIds/timeperiods/tags는 보내면 전체 교체, 안 보내면 유지**(실측). 폼은 항상 전체를 보낸다.
- 대상: 둘 중 하나라도 보내면 "대상 집합 변경" — 결과가 0이면 `MAINTENANCE_TARGET_REQUIRED`. BE는 안 보낸 쪽을 현재값으로 채워 **둘 다 명시**해 보낸다.
- `timeperiods: []`는 `MAINTENANCE_TIMEPERIODS_REQUIRED`(Zabbix도 "cannot be empty").

## 4. 🔴 timeperiod 유형별 허용 필드 (실측 — 하나라도 더 있으면 `unexpected parameter`)
| type | 허용 |
|---|---|
| 0 일회 | start_date, period |
| 2 매일 | every, start_time, period |
| 3 매주 | every, dayofweek(비트 월=1…일=64), start_time, period |
| 4 매월 | month(비트 1월=1…12월=2048), start_time, period + (**day>0**: day / **아니면**: every(1~4째,5=마지막)+dayofweek) |

`maintenance.get`은 **모든 유형에 모든 필드**를 돌려주므로 그대로 update에 되돌리면 깨진다 → BE `MaintenanceTimeperiodNormalizer`가 정리한다(액션 filter `value2` 함정과 동형). FE는 신경 안 써도 되지만 편집기는 원본 구조를 유지한다.

## 5. DELETE `/` `{ids}` → `{ids, count}`. 삭제 즉시 점검 종료(억제되던 알림 재개).

## 6. 에러 코드
`403` · `MAINTENANCE_NOT_FOUND` · `MAINTENANCE_NAME_REQUIRED` · `MAINTENANCE_TARGET_REQUIRED` · `MAINTENANCE_TIMEPERIODS_REQUIRED` · `MAINTENANCE_RANGE_INVALID` · `MAINTENANCE_IDS_REQUIRED` · `MAINTENANCE_CREATE_FAILED` · 그 외 Zabbix 원문.

## 7. FE 구현 노트
- **알림 관리 탭**으로 편입(2026-08-19 사용자 결정: 점검은 알림의 하위 개념) — `/zabbix-management/alert-management?tab=maintenance`. 구 경로 `/maintenance-management`는 그 탭으로 redirect(북마크 호환), 사이드바 항목 없음.
- `MaintenancePage`(전체 목록 + 클라이언트 키워드/상태 필터) · `MaintenanceFormDrawer` · `TimeperiodEditor`(유형별 필드, 마지막 1개 삭제 금지, 지속=일/시/분 3칸) · 태그 편집.
- 실측 E2E: 생성(매주+태그) → 수정(기간 추가, get 값 round-trip) → 삭제 통과.

## 🔄 FE 요청사항 (BE 후속)
- 없음
