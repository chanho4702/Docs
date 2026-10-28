# E2E (런타임): 호스트 그룹 최근 조회 — functional-qa

검증자: functional-qa / 날짜: 2026-06-19
대상: `moveseye-be`(NestJS, :3000) + `moveseyee_fe`(React/Vite, :5173)
방식: BE 직접 API 호출(node fetch + pg) + Playwright(Chromium) UI 구동. 정적 shape 대조는 integration-qa가 이미 PASS — 여기선 런타임 동작만.

## 총평
- **수정 전 1건 FAIL → 수정 후 ALL PASS.** 발견 버그: 목록 컨텍스트의 `excludeId=`(빈 문자열)가 DTO `@IsNotEmpty()`에 막혀 400 → "최근 조회"가 항상 빈 상태. **be-engineer 수정 후 클로즈드 루프 PASS.**
- 이 버그는 HOSTGROUP 전용이 아니라 SERVER/NETWORK 목록의 기존 "최근 조회"도 동일하게 깨뜨리던 **선재(pre-existing) 버그**였음(git blame: `edb44e3` 2026-05-29 도입, 이번 HOSTGROUP 변경과 무관). 이번 검증이 부수적으로 기존 회귀까지 복구.
- 환경 차단요소(enum 미적용)는 BE 재기동으로 해소(마이그레이션 정상 자동 적용 확인).

---

## 환경 준비 결과
| 항목 | 결과 |
|------|------|
| PG enum `recently_viewed_ref_type_enum` | 검증 시작 시 `SERVER,NETWORK,EC2S`만 존재(HOSTGROUP 없음). 현재 떠 있던 BE(PID 12540)가 마이그레이션 파일 추가(6-18) 이전 부팅 인스턴스였음. |
| 원인 | 마이그레이션 미적용. `migrationsRun:true`+`runMigrations` 정상이나 구(舊) 프로세스라 못 봄. **BE 버그 아님.** |
| `ALTER TYPE ADD VALUE` 트랜잭션 제약 | 우려했으나 실측 결과 PG 12+에서 `transaction:'each'`(BEGIN/COMMIT) 안에서도 정상 성공. 제약 없음. |
| 조치 | BE 재기동 → 마이그레이션 `AddHostgroupToRecentlyViewedEnum1750300000000`이 깨끗이 적용·migrations 테이블 기록. enum에 `HOSTGROUP` 추가 확인. |
| FE | :5173 기동 중, 재사용. |

---

## 시나리오별 결과

### S1. mark-view 기록 — PASS
- UI: 그룹 2/4/5 상세 진입 시 `GET /hosts/mark-view/{groupid}?refType=HOSTGROUP` 각각 HTTP 200 `{data:true}`.
- DB: `recently_viewed`에 `ref_type=HOSTGROUP` 행 누적 확인(pg 직접 조회).
- 근거: `e2e_hgrv_ui_result.json`(markViewReqs), 스크린샷 `e2e-hgrv-01-detail-group2.png`.

### S2. 목록 노출 — 수정 전 FAIL → 수정 후 PASS
- **수정 전**: 목록 화면 요청 `GET /hosts/recently-viewed?refType=HOSTGROUP&excludeId=` → HTTP 200 body `{status:"error",message:"Bad Request Exception",code:400}`. "최근 조회" 영역 빈 상태. (스크린샷 `e2e-hgrv-02-list.png` 1차)
- **수정 후**: 동일 요청 → 200 + `total:3`, items=`[Discovered hosts, Zabbix servers, Linux servers]`. 화면에 "Recently Viewed: Discovered hosts, Zabbix servers, Linux servers" 링크 노출.
- item shape 실측: `{hostid, name, createdAt}` — host/region 없음. **계약 §3 정확 일치.**
- 근거: `e2e_hgrv_ui_result.json`(recentlyViewedReqs status 200/code 200/3 items), `e2e_hgrv_excludeid_probe.json`.

### S3. 링크 이동 — PASS
- 최근 조회 첫 링크(Discovered hosts) 클릭 → `http://localhost:5173/monitoring/host-group/5?period=43200`로 정확히 이동(링크 id = item.hostid = groupid 5).
- 근거: `e2e_hgrv_ui_result.json`(afterClickUrl), 스크린샷 `e2e-hgrv-03-after-click.png`.

### S4. excludeId 자기제외 — PASS
- API: `excludeId=2` → Linux(2) 제외, `[Discovered(5), Zabbix(4)]`만 반환(total 2). 자기 제외 정상.
- UI상으로는 host-group **상세**에 RecentlyView가 배치되지 않아(상세=5탭 구성) "자기 그룹 제외"가 화면에 드러나는 지점은 목록뿐 → 목록은 excludeId가 비어 제외 대상 없음. excludeId 로직 자체는 API 레벨로 검증.
- 근거: `e2e_hgrv_excludeid_probe.json`(`HOSTGROUP excludeId=2`).

### S5. 여러 그룹 누적 + 최대 3개 최신순 — PASS
- 2→4→5 순차 조회 후 목록에서 최신순 `5,4,2`(Discovered, Zabbix, Linux) 정렬 노출. createdAt 내림차순 정확.
- 최대 3개: BE total=3, FE `slice(0,3)` 적용. (조회 그룹이 3개라 slice 효과는 4개 이상 누적 시 별도 확인 필요하나 BE 정렬·FE slice 둘 다 동작 확인됨.)
- 근거: `e2e_hgrv_ui_result.json` 2차(recentlyViewText).

### S6. 회귀 (SERVER/NETWORK) — PASS
- 수정 전: 서버 모니터링 목록도 `excludeId=`로 400(동일 선재 버그)이었음(`e2e_hgrv_regression_result.json`).
- 수정 후: SERVER `excludeId=` → 200, 7 items `{hostid,name,host,createdAt}`. NETWORK → 200, 2 items. 기존 shape(host 필드 포함) 유지, 회귀 없음.
- 근거: `e2e_hgrv_excludeid_probe.json` + 수정후 재검증 로그.

### S7. 선재 리스크 R1 (`RecentlyView.tsx` `t` 미import) — PASS(무해 확정)
- `RecentlyView.tsx:52` `t("recently_view")`가 useTranslation/i18next import 없이 사용됨(파일 내 import 없음).
- **실측: host-group 목록 렌더 시 pageErrors 0건. "Recently Viewed:" 텍스트 정상 렌더.** → `t`가 전역으로 해소되어 ReferenceError 미발생. 렌더 깨짐 없음.
- 결론: R1은 런타임 무해. (전역 t 존재 추정대로) 코드 위생상 import 추가가 바람직하나 동작 차단 아님 — 이번 작업 책임 아님.

### S8. 삭제/유효성(존재하지 않는 groupid 필터) — PASS
- `recently_viewed`에 가짜 HOSTGROUP ref_id=999999 주입 후 조회 → 결과 items=[] (빈 항목/유령 링크 없이 필터됨). Zabbix hostgroup.get 매핑(`host.service.ts:1709` `hostGroups.some(...)`)이 정상 누락 처리. (테스트 후 행 정리 완료.)
- 근거: `enumcheck.cjs`(scenario 8) 실행 로그.

---

## 발견·수정된 버그 (클로즈드 루프 완료)

### BUG-1 (BE, 선재, 실사용자 영향 High) — `excludeId=` 빈 문자열 400 → 목록 최근조회 항상 빈 상태
- 책임 주체: **be-engineer** (수정 완료, agentId a92731da61113eac6)
- 출처: `moveseye-be/src/host/dto/requests/mark-viewed.dto.ts` — `SearchRecentlyViewedReqDto.excludeId`의 `@IsNotEmpty()`
- 모순: 서비스(`host.service.ts:1663`)는 `filter.excludeId || ''`로 빈 값을 처리할 의도였으나 DTO가 ValidationPipe 단에서 차단.
- 재현 절차:
  1. 로그인 → 호스트 그룹/서버 모니터링 목록 진입.
  2. 네트워크: `GET /hosts/recently-viewed?refType=HOSTGROUP&excludeId=` → 200 body `{code:400, message:"Bad Request Exception"}`.
  3. 화면: "최근 조회" 비어 있음.
- 수정 diff (be-engineer):
  ```diff
  -import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
  +import { IsEnum, IsOptional, IsString } from 'class-validator';
  @@ excludeId
  -  required: true,
  +  required: false,
     @IsString()
  -  @IsNotEmpty()
  -  excludeId: string;
  +  @IsOptional()
  +  excludeId?: string;
  ```
- 재검증(클로즈드 루프): BE watch 자동 재기동 → 빈/미전송 excludeId 200+items, excludeId=2 자기제외 유지, UI 목록에 링크 3개 노출, 클릭 이동 정상. **PASS.**
- 비고: `excludeId` 쿼리 파라미터가 Swagger상 `required:true→false`로 바뀜 → integration-qa/fe 계약 영향 있으나 FE는 이미 빈 문자열을 보내고 있어 FE 변경 불필요.

---

## 잔여 리스크
- R1(코드 위생): `RecentlyView.tsx` `t` 미import. 런타임 무해(전역 t 해소)이나, 향후 전역 t 제거 시 깨질 수 있음. 코드 위생상 `useTranslation` import 권장. Low.
- S5 4개+ 누적 시 slice(0,3) 정밀 검증은 조회 그룹 3개로 한정 확인 — BE 정렬·FE slice 둘 다 동작 확인됨(추가 위험 낮음).

## 수용 기준 충족 여부
- mark-view 기록 / 목록 노출 / 링크 이동 / 자기제외 / 누적 최신순 / 회귀 / 유효성 필터: **전부 PASS.**
- 단, 합격은 **BUG-1 수정 반영(merge)을 전제**로 한다. 미수정 상태로는 목록 최근조회가 동작하지 않음.

## 산출물 / 재현 자산 (모두 `C:\solutions\_workspace\`)
- runner: `e2e_hgrv_ui.cjs`(UI 흐름), `e2e_hgrv_regression.cjs`(SERVER/NETWORK 회귀)
- API/DB probe: `moveseye-be/enumcheck.cjs`(단계별 재작성 — enum/login/excludeId/시나리오8), `moveseye-be/enumtest.cjs`(트랜잭션 enum 테스트)
- 결과: `e2e_hgrv_ui_result.json`, `e2e_hgrv_excludeid_probe.json`, `e2e_hgrv_regression_result.json`, `e2e_hgrv_api_result.json`
- 스크린샷: `e2e-hgrv-01-detail-group2.png`, `e2e-hgrv-02-list.png`, `e2e-hgrv-03-after-click.png`, `e2e-hgrv-04-server-list.png`
- 재현 명령: `cd moveseye-be && node enumcheck.cjs` (API/DB), `cd _workspace && node e2e_hgrv_ui.cjs` (UI). BE :3000, FE :5173 기동 전제.
