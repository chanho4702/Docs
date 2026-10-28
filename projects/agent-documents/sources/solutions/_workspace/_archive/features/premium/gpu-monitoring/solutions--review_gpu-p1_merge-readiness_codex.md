## 병합 준비 검토

**판정: 조건부 진행 가능** — 코드 충돌 위험은 낮지만, Flyway `V72/V73 → V76/V77` 변경과 참조 전수 수정, 새 DB 기준 검증, FE 전체 회귀 테스트가 끝나기 전에는 병합하면 안 됩니다.

### 1. 충돌 지점

| 심각도 | 영역 | 확인 결과 | 근거 및 권고 |
|---|---|---|---|
| 🟢 | BE 직접 충돌 | master 변경 45개, ZM-78 변경 126개이며 **경로 교집합 0개**입니다. `git merge-tree fd4fcfb b61d33e ZM-78`에도 실제 conflict marker가 없습니다. | `DmovePermissions`, `JwtAuthFilter`, `ZabbixClient`, `ErrorCode`, `LicenseArchitectureTest`는 master의 APM 3커밋이 건드리지 않았습니다. rebase 후 diff 재확인이면 충분합니다. |
| 🟡 | FE 직접 충돌 | 8개 파일이 양쪽에서 변경됐습니다: `breadcrumbSegments.ts`, `navSearchEntries.ts`, `routes.ts`, `MobileSideNav.tsx`, `SideNav.tsx`, `locales/en.json`, `locales/kr.json`, `routes/routes.tsx`. | 모두 `cbadb3e`의 APM incidents 추가와 `183b5c3`의 GPU 추가입니다. `merge-tree` conflict marker는 0개라 자동 병합 가능성이 높지만, APM과 GPU 항목이 모두 남았는지 확인해야 합니다. 특히 [SideNav.tsx](/C:/worktrees/zm-78-fe/src/layouts/app/SideNav.tsx:426), [routes.tsx](/C:/worktrees/zm-78-fe/src/routes/routes.tsx:808), 두 locale JSON을 검증하십시오. |
| 🟢 | FE `queryKey.ts` | master는 변경하지 않았고 ZM-78만 변경했습니다. | [queryKey.ts](/C:/worktrees/zm-78-fe/src/constants/queryKey.ts:647)의 GPU 키는 직접 충돌하지 않습니다. |
| 🔴 | Flyway 버전 | 텍스트 충돌은 아니지만 현재 가장 큰 병합 차단점입니다. master에 `V74`, `V75`가 있고 ZM-78은 `V72`, `V73`입니다. | `outOfOrder`를 명시하지 않아 기본값 `false`입니다([application.yml](/C:/worktrees/zm-78-be/src/main/resources/application.yml:102)). V75가 적용된 DB에서는 낮은 번호가 기본적으로 실행되지 않습니다. [Flyway 공식 문서](https://documentation.red-gate.com/fd/flyway-out-of-order-setting-277579015.html)도 기본값이 `false`이며 낮은 버전은 무시된다고 설명합니다. `V76/V77` 변경은 필수입니다. |
| 🟢 | Flyway 의미 충돌 | master `V74/V75`는 `apm_alert_event`만 다룹니다. GPU 권한 JSON이나 `gpu_setting`과 무관합니다. | [V74](/C:/solutions/moveseye-be-spring/src/main/resources/db/migration/V74__apm_alert_event_open_unique.sql:17), [V75](/C:/solutions/moveseye-be-spring/src/main/resources/db/migration/V75__apm_alert_event_fired_idx.sql:7). 따라서 GPU 백필이 V76으로 늦게 실행돼도 결과는 같습니다. |
| 🟢 | 권한 JSON | master 이후 커밋은 `role.dmove_permission`을 변경하지 않습니다. GPU 백필은 기존 `monitoring` feature 배열에 없는 `gpuMonitoring`만 추가합니다. | [V72 SQL](/C:/worktrees/zm-78-be/src/main/resources/db/migration/V72__add_gpu_monitoring_permission.sql:60)의 `NOT EXISTS`와 기존 배열 보존 로직상 APM 등 기존 권한을 덮지 않습니다. |
| 🟡 | 전역 영향 코드 | `JwtAuthFilter`와 `ZabbixClient`는 master와 충돌하지 않지만 영향 범위가 넓습니다. | GPU 테스트뿐 아니라 기존 인증과 Zabbix 호출 회귀 테스트까지 포함된 BE 전체 테스트가 필요합니다. |
| 🟡 | 라이선스 노출 | `Feature.GPU_MONITORING`과 PREMIUM 기본 포함은 이미 분기 기준선에 존재합니다. 신규 enum 작업은 필요 없습니다. | [Feature.java](/C:/worktrees/zm-78-be/src/main/java/com/dmove/moveseye/license/domain/entitlement/Feature.java:15), [Edition.java](/C:/worktrees/zm-78-be/src/main/java/com/dmove/moveseye/license/domain/entitlement/Edition.java:21). 다만 배포 시 **모든 유효 PREMIUM 라이선스**에 GPU가 포함되고, V76이 `serverMonitoring.view`를 따라 권한을 여는 현재 정책이 제품 의도인지 최종 확인해야 합니다. |

### 2. Flyway 판단

`V76__add_gpu_monitoring_permission.sql`, `V77__gpu_setting.sql` 계획은 맞습니다.

현재 확인된 모든 로컬 브랜치·추적 remote ref·등록 worktree에서:

- `V72/V73`: `ZM-78`만 사용
- `V74/V75`: master/APM 브랜치가 사용
- `V76/V77`: 사용 흔적 없음
- untracked `V76/V77`도 없음

단, 이는 현재 fetch된 ref 기준입니다. 실제 작업 직전에 remote 갱신과 다른 작업자 확인 후 번호를 다시 검사해야 합니다. `outOfOrder=true`로 우회하는 것은 권장하지 않습니다.

DB 처리에는 조건이 있습니다.

- 공유 dev DB 5433에 V74/V75만 적용돼 있다면 V76/V77이 정상 적용됩니다.
- V72/V73이 이미 적용된 DB에 파일만 V76/V77로 바꾸면 기존 history가 `Missing`이 되고 새 번호가 다시 실행될 수 있습니다.
- 문서상 5434/5435에는 V72가 적용됐으므로, 이 두 샌드박스는 **재생성 후 V1~V77 전체 적용**이 가장 안전합니다. 공유·운영 DB에 무작정 `flyway repair`를 실행하면 안 됩니다.
- 이번 검토에서 5433/5434/5435는 모두 연결 거부 상태여서 실제 `flyway_schema_history`는 확인하지 못했습니다. DB 기동 후 `72~77` 이력을 읽기 전용 조회해야 합니다.

### 3. 계획 보완

Claude 계획에는 다음이 추가되어야 합니다.

1. **번호 참조 수정 범위를 넓혀야 합니다.**

   파일명·SQL 주석·계약/구현 문서 외에도 아래가 하드코딩돼 있습니다.

   - [GpuPermissionBackfillIT.java](/C:/worktrees/zm-78-be/src/test/java/com/dmove/moveseye/user/GpuPermissionBackfillIT.java:24): 파일명과 `version='72'`
   - [DmovePermissions.java](/C:/worktrees/zm-78-be/src/main/java/com/dmove/moveseye/common/constants/DmovePermissions.java:29)
   - `GpuAccessChecker`, `GpuSetting`, `GpuSettingRepository`, `GpuSetupControllerIT`의 주석
   - `review_gpu-p1.md`, `e2e_gpu-monitoring-runtime.md`, `qa_gpu-monitoring-fe.md`
   - rebase로 바뀌는 BE/FE 커밋 SHA를 `review_gpu-p1.md`에 다시 기록

2. **BE는 새 DB에서 Flyway를 검증해야 합니다.**

   전체 `test`에 더해 `GpuPermissionBackfillIT`, `FlywayMigrationSmokeIT`, GPU setup IT가 실제로 V76/V77을 확인하는지 점검해야 합니다. 최종 `build`/fat jar도 확인하는 편이 안전합니다.

3. **FE는 GPU Jest만으로 부족합니다.**

   충돌 후보 8개가 APM incidents와 공용 navigation/router/i18n 파일입니다. 최소한 `apmRoutes`, `gpuRoutes`, `SideNavPermissions`, `GlobalSearch`를 함께 실행하거나, 더 안전하게 전체 `npm test`를 실행해야 합니다. 여기에 `npm run build`, `npm run lint`, `npm run typecheck:contract`를 권장합니다.

4. **배포 순서는 BE → FE가 맞습니다.**

   BE 배포 후 다음을 확인한 뒤 FE를 배포해야 합니다.

   - Flyway V76/V77 성공
   - `/features`에 `GPU_MONITORING`
   - 사용자 권한 응답에 `gpuMonitoring`
   - `/gpu/devices`, `/gpu/setup/overview` smoke test

5. **정리는 push/CI 확인 뒤로 미루는 것이 안전합니다.**

   현재 master는 origin보다 BE 3커밋, FE 2커밋 앞서 있습니다. 사용자의 master push와 CI 성공을 확인한 후 worktree를 제거하고 `ZM-78` 브랜치를 삭제하십시오. worktree가 연결된 상태에서는 브랜치 삭제도 제약됩니다.

6. **번호 변경은 별도 커밋으로 남기는 편이 명확합니다.**

   예: `#ZM-78 [FIX] Flyway 번호 재배치 및 master 병합 준비 -2026-10-10`.

### 4. 권장 순서

1. remote 갱신 및 `V76/V77` 재선점 확인, 두 ZM-78 worktree clean 확인.
2. BE는 `b61d33e`, FE는 `cbadb3e` 위로 각각 rebase.
3. FE 공용 8개 파일에서 APM incidents와 GPU 항목이 모두 유지됐는지 확인.
4. `V72→V76`, `V73→V77` 변경 및 코드·테스트·문서 참조 전수 수정.
5. 5433의 `flyway_schema_history` 확인. V72/V73이 있으면 병합을 멈추고 DB 처리 방식을 먼저 결정.
6. 새 샌드박스 DB에서 V1~V77 적용 후 BE 전체 test/build.
7. FE 전체 Jest·build·lint·contract typecheck.
8. 최종 diff와 계약 문서, rebase 후 SHA 갱신.
9. 각 master에 `git merge --ff-only ZM-78`.
10. 사용자가 master push 및 CI 확인.
11. BE 먼저 배포·smoke test 후 FE 배포.
12. 배포 확인 뒤 worktree 제거와 브랜치 정리.

현재 상태에서는 **Flyway 번호와 DB 이력 확인만 해결하면 병합을 진행해도 되는 수준**입니다.