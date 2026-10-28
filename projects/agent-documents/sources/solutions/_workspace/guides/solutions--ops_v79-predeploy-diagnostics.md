# V86 배포 전 진단 — Zabbix 정리 큐(V53) → 명령 장부 승계 (2026-10-11)

> 🔴 2026-10-21 번호 재부여: 알람 브랜치를 master 위로 rebase하며 V76~V80 → **V83~V87**로 바꿨다(옛 V79 = 지금 V86, 테스트 `V86MigrationIT`). 파일 이름은 링크 보존을 위해 그대로 둔다.

> 대상: 알람 재설계 단위 5a-1의 `V86__apm_zbx_command.sql`(워크트리 `apm-c05-followup`, 브랜치 `apm-alert-history`).
> 배포 방식은 설치형 단일 노드의 **중지 후 일괄 교체(coordinated stop)**다. 단위 1~8을 한 번에 배포한다.
> 같은 SQL을 테스트가 돌려 검증한다 — D2~D5는 `V86MigrationIT.DIAGNOSTICS`(실제 V53 시드), D6·D7은 `ApmZbxCommandStoreIT`의 `D6_LANE_MULTI_PROCESSING`·`D7_ID_SPLIT_ACROSS_LANES`. 이 문서를 고치면 그 테스트도 함께 고친다.

## 왜 보는가

V86는 V53 정리 큐(`apm_zbx_cleanup`)의 행을 그대로 물려받고, 트리거 삭제 → 아이템 삭제 의존을 **출처 칸으로 좁게** 복원한다.

- 같은 `rule_uid`·`slo_uid`·`service_id` 중 하나라도 같으면 "트리거가 먼저"로 잇는다.
- 세 칸이 모두 빈 행만 전역 barrier(모든 이관 아이템 ↔ 모든 이관 트리거)로 둔다.

정상 CRUD에서는 이 규칙으로 충분하다. 다만 DB는 같은 `(kind, 대상)`의 규칙 중복을 막지 않는다. 그래서 과거의 동시 생성이나 수동 데이터가 있으면 공유 아이템의 선행 트리거를 놓칠 수 있다. 아래 진단으로 그런 행이 있는지 **V86 적용 전에** 확인한다.

## 진단 SQL (V53 상태 — 배포 전 실행)

```sql
-- D1. 규모 — 종류별 행 수와 출처가 빈 행 수
select object_kind, count(*) as rows,
       count(*) filter (where rule_uid is null and slo_uid is null and service_id is null) as no_origin
  from apm_zbx_cleanup group by object_kind order by 1;

-- D2. 출처가 전부 빈 행 — V86에서 전역 barrier가 된다(무관한 트리거가 DEAD면 모든 이관 아이템 삭제가 멈춘다)
select object_kind || ':' || zbx_id from apm_zbx_cleanup
 where rule_uid is null and slo_uid is null and service_id is null order by 1;

-- D3. 출처는 있는데 같은 출처의 트리거 행이 없는 아이템 — V86에서 barrier 트리거만 기다린다(대개 트리거는 이미 지워진 경우)
select i.object_kind || ':' || i.zbx_id from apm_zbx_cleanup i
 where i.object_kind = 'ITEM'
   and (i.rule_uid is not null or i.slo_uid is not null or i.service_id is not null)
   and not exists (select 1 from apm_zbx_cleanup t
                    where t.object_kind = 'TRIGGER'
                      and (t.rule_uid = i.rule_uid or t.slo_uid = i.slo_uid or t.service_id = i.service_id))
 order by 1;

-- D4. 같은 (kind, 대상)에 규칙이 둘 이상 — 같은 Zabbix 아이템을 공유한다. 트리거 lane은 규칙마다 따로다
select r.kind || ':' || coalesce(b.service_id::text, 'collector') || ':' || coalesce(r.slo_id::text, '-')
  from apm_alert_rule_binding b join apm_alert_rule r on r.id = b.rule_id
 group by r.kind, b.service_id, r.slo_id having count(distinct r.id) > 1 order by 1;

-- D5. 아직 살아 있는 바인딩이 참조하는 이관 아이템 — 실행기가 "보존"으로 미룬다(삭제 대상이 아니다)
select i.zbx_id || ':' || count(distinct b.rule_id) from apm_zbx_cleanup i
  join apm_alert_rule_binding b on b.zbx_itemid = i.zbx_id
 where i.object_kind = 'ITEM' group by i.zbx_id order by 1;
```

## 판정

| 결과 | 조치 |
|---|---|
| 전부 0행 | 그대로 배포한다. |
| 🔴 **D1 총건수 > 0** | **배포 차단**(5a-2 3차, 2026-10-12). V53 큐(`apm_zbx_cleanup`)에 행이 **하나라도** 남아 있으면 배포하지 않는다 — 새 실행기는 V53 트리거·해소 확인 행을 대부분 식별하지 못해 `UNIDENTIFIED` DEAD로 남긴다(아래 "식별 규칙"). 옛 버전을 그대로 두고 5분 재시도가 큐를 비우기를 기다리거나, 남은 행을 아래 D2 정리 절차 ①~③으로 직접 처리한 뒤 **D1 총건수 0**을 확인하고 배포한다. D2~D5는 그 정리 대상을 고르는 보조 진단이다. |
| D2 있음 | 🔴 **배포 차단 — 배포 전 수동 정리 필수**(5a-2, 2026-10-12 변경). 출처가 빈 트리거 행은 새 실행기가 식별할 수 없어 `UNIDENTIFIED` DEAD가 되고, 전역 barrier라 **모든 이관 아이템 삭제가 영구히 멈춘다**. 정리: ① 각 행의 `zbx_id`를 Zabbix에서 `owner=moveseye-apm` 태그·`MovesEye APM` 호스트로 확인(트리거는 `trigger.get triggerids`+`selectTags`, 아이템은 `item.get itemids`+`selectTags`·`selectTriggers`) ② 우리 것이고 더 쓰이지 않으면 Zabbix에서 직접 삭제(트리거 먼저, 열린 Problem이 있으면 먼저 닫기 — 트리거 삭제는 Problem을 닫지 않는다), 남의 것이면 그대로 둔다 ③ 확인을 마친 행을 `delete from apm_zbx_cleanup where id = …`로 지운다 ④ D2를 다시 돌려 0행 확인 후 배포. |
| D3 있음 | 그 아이템의 트리거가 Zabbix에 아직 있는지 `owner=moveseye-apm` 태그로 확인한다. 남아 있으면 아이템보다 먼저 손으로 지우거나, 정리 행이 처리될 때까지 둔다. |
| D4 있음 | 중복 규칙을 정리한 뒤 배포하는 것을 권장한다. 공유 아이템 삭제가 다른 규칙의 트리거를 앞지를 수 있다. |
| D5 있음 | 정상이다. 참조가 남은 동안 아이템은 지워지지 않는다. |

### 🔴 V53 트리거·해소 확인 행 전반 — 식별 규칙(5a-2)

새 실행기는 트리거 명령을 (규칙 uid, 대상 uid, 종류) **완전 식별**로만 실행한다. V53 행은 규칙 uid까지만 있으므로, 실행 시점에
그 트리거를 가리키는 살아 있는 바인딩에서 식별을 복원하지 못하면 `UNIDENTIFIED` DEAD가 된다(삭제·닫기를 하지 않는다 — 남의 객체를
건드리지 않기 위해서다). 키 없는 V53 아이템 행도 같은 키의 정규 아이템 삭제가 정확 키를 물려주기 전까지는 `UNIDENTIFIED`가 된다.
그래서 **D1 총건수가 0이어야 배포한다**(위 판정표 — 배포 차단 조건). 옛 버전은 5분마다 재시도하므로 Zabbix가 정상이면 대개 저절로
빈다. 남은 행은 위 D2 정리 절차로 처리한다.

### 배포 뒤 `UNIDENTIFIED` DEAD가 남았을 때

```sql
select id, command, dedup_key, zbx_id, last_error from apm_zbx_command
 where status = 'DEAD' and last_error like 'UNIDENTIFIED%' order by id;
```
각 행의 `zbx_id`를 위 D2 ①②처럼 Zabbix에서 확인·정리한 뒤, **운영자 확인 완료**로 처리한다 — `ApmZbxCommandStore.acknowledgeUnidentified(id, 메모)`
(그 행을 지우고, 그 행을 기다리던 명령의 선행을 푼다. DEAD·`UNIDENTIFIED` 행만 받는다. 메모와 함께 감사 로그 `[AUDIT]` WARN).

> 🔁 **문구 전환 표시** — 아래 raw SQL은 **단위 8 관리자 API가 붙기 전 중간 브랜치 검증용 임시 절차**다. 단위 1~8을 한 번에 내는
> **최종 배포본에서는 이 SQL 단락을 지우고 `acknowledgeUnidentified`(단위 8의 관리자 API)만 쓰도록** 문서를 바꾼다 — raw 삭제는 운영자
> 메모·`[AUDIT]` 기록을 우회한다. (최종 배포 전 체크리스트 항목)
>
> 임시(단위 8 전): `delete from apm_zbx_command where id = … and status = 'DEAD' and last_error like 'UNIDENTIFIED%'`
> (edge는 CASCADE로 풀린다). 실행한 사람·확인 내용·시각을 운영 기록에 따로 남긴다.

⚠️ `retry-dead`는 식별을 보충하지 않으므로 다시 DEAD가 될 뿐이다.

### 아이템 정리는 운영자가 한다

새 실행기는 Zabbix 아이템을 **지우지 않고 비활성화만** 한다(태그는 바꾸지 않는다. 아이템 삭제는 그 아이템을 쓰는 트리거까지 함께
지우기 때문이다). 정리 대상 = 우리 가상 호스트 · owner 태그 · 비활성 · MovesEye가 더 쓰지 않음. 정리 대상 아이템을 찾고 확인·삭제하는 방법은
[ops_apm-alert-item-cleanup.md](solutions--ops_apm-alert-item-cleanup.md)를 따른다. 위 D2 정리 절차의 아이템 삭제도 같은 확인(그 아이템을 쓰는
트리거 0건)을 먼저 한다.

## 배포 뒤 확인 (V86 적용 후)

```sql
-- 이관 결과 — 마이그레이션 로그의 "V86 이관: …" WARN 줄과 같은 숫자여야 한다
select command, count(*), count(*) filter (where resource_key like 'm:%') as m_keys
  from apm_zbx_command where target ->> 'migratedFrom' = 'V53' group by command;
select count(*) as edges from apm_zbx_command_dep;

-- D6. 한 실행 lane(정규 키 대기 포함)에 PROCESSING이 2행 이상 — 0행이어야 한다(있으면 resource 단일 실행이 깨졌다)
select coalesce(pending_resource_key, resource_key) || ':' || count(*) from apm_zbx_command
 where status = 'PROCESSING'
 group by coalesce(pending_resource_key, resource_key) having count(*) > 1 order by 1;

-- D7. 같은 Zabbix id가 가족(트리거: DELETE_TRIGGER·RESOLVE_CONFIRM / 아이템: DELETE_ITEM) 안에서 서로 다른 lane에 걸림 — 0행이어야 한다
--     (있으면 이관·식별 불가 m: 별칭이 정규 lane으로 합쳐지지 못했다)
--     ⚠️ 탐지 한계(2026-10-11 코덱스): zbx_id·target.zbxIds가 있는 행끼리만 본다. **id를 아직 모르는 키 기반
--     DELETE_ITEM(`deleteItemByKey`, knownIds 없음)과 `m:v53:i:{id}` 행의 논리 중복은 잡지 못한다** — 5a-2 실행기가
--     실제 item id를 조회해 가족 잠금·realias로 반영하기 전까지 D7 0행이 별칭 무결성 전체를 뜻하지 않는다.
--     ↳ 5a-2 반영(2026-10-11): DELETE_ITEM 실행기가 외부 삭제·선형화 전에 조회한 id를 화해한다
--       (ApmZbxCommandStore.reconcileItemIds — m: 별칭 re-key + 그 행의 선행·같은 아이템을 쓰는 DELETE_TRIGGER를 자기 선행으로 복사 →
--       선행이 생기면 REQUEUED). 그래서 "실행 전" 분리는 남을 수 있어도 아이템 삭제가 트리거 삭제를 앞지르지는 않는다
--       (ApmZbxCommandExecutionIT.keyBasedDeleteItemJoinsMigratedLane). D7은 여전히 id가 알려진 분리만 센다.
select family || ':' || zid from (
    select case when c.command = 'DELETE_ITEM' then 'item' else 'trigger' end as family, z.zid,
           coalesce(c.pending_resource_key, c.resource_key) as lane
      from apm_zbx_command c
     cross join lateral (select c.zbx_id as zid
                         union
                         select jsonb_array_elements_text(coalesce(c.target -> 'zbxIds', '[]'::jsonb))) z
     where c.command in ('DELETE_TRIGGER', 'RESOLVE_CONFIRM', 'DELETE_ITEM') and z.zid is not null
) x group by family, zid having count(distinct lane) > 1 order by 1;

-- 이관 DEAD 선행에 막힌 명령
select c.id, c.dedup_key, p.dedup_key as blocked_by, p.status
  from apm_zbx_command c join apm_zbx_command_dep d on d.command_id = c.id
  join apm_zbx_command p on p.id = d.predecessor_id
 where p.status = 'DEAD' and p.resource_key like 'm:%';
```
