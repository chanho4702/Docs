# 검토 — MovesEye 기능의 AI(툴) 커버리지

> 작성 2026-08-19 · 요청: "우리가 제공하는 기능도 AI로 가능했으면 좋겠어, 검토해줘" · 기준: BE 컨트롤러 34개(엔드포인트 ~190) × 현재 AI 툴 15개
> 원칙(설계서 §2): AI가 할 수 있는 일 = 우리가 정의한 툴. 만능 API 툴 없음. 조회는 게이트 없이, 변경은 확인 카드(채팅) / 계정 권한(MCP). 툴은 데이터소스별(NEUTRAL/ZABBIX/…).

## 0. 한눈에
| 판정 | 뜻 | 개수(기능 묶음) |
|---|---|---|
| ✅ 됨 | 툴 있음 | 6 |
| 🟢 P1 | 그대로 툴화 가능·가치 큼(다음 스프린트) | 9 |
| 🟡 P2 | 가능하지만 후순위(사용 빈도↓ 또는 파라미터 복잡) | 8 |
| 🔵 요약형 | 툴이 아니라 "이 화면 요약/분석"으로 푸는 게 맞음(시각 화면) | 4 |
| ⛔ 제외 | 보안·권한 상승 경로라 AI에 안 준다 | 5 |

## 1. 영역별 검토

### 1.1 모니터링 (호스트·그룹·리소스)
| 기능(BE) | 지금 | 판정 | 툴(안) · 등급 · 소스 | 메모 |
|---|---|---|---|---|
| 호스트 목록/상세/헬스 `GET /hosts/manage`, `/hosts/detail/{id}`, `/hosts/{id}/collected-info`, `/livecheck` | ✅ `zabbix_list_hosts` `zabbix_get_host` | ✅ | — | 상세는 "뭘 모니터링하나" 카테고리 요약 포함 |
| 호스트그룹 목록 `GET /hosts/hostgroups` | ✅ `list_host_groups` | ✅ | — | 중립 |
| **그룹 모니터링**: 리소스 추이·알람 추이·상위 호스트·디스크 현황 `GET /hosts/{groupid}/resource-trend|alert-trend|top-hosts|disk/current` | ✗ | 🟢 P1 | `get_group_overview`(READ, NEUTRAL): 그룹 요약(호스트 수·가용·상위 CPU/메모리 3대·알람 추이 24h) | "linux 그룹 요즘 어때?"의 정답 툴. 포트 경유 중립 |
| 호스트 자원 요약/차트 `GET /host/{id}/cpu|memory|disk|network|response-time/summary`, `line-charts`, `/interface/{id}/…` | ✗ | 🟢 P1 | `get_host_metrics`(READ, NEUTRAL): hostId + metric(cpu/memory/disk/network/rt) + period → 현재값·최소/최대/평균·상위 인터페이스 | 차트 좌표 통째는 금물, **집계값만**(토큰) |
| 그룹 리포트 `GET /hosts/{groupid}/reports`, `/reports/detail` | ✗ | 🟢 P1 | `get_group_report`(READ): 주/월 리포트 요약 | "지난주 리포트 요약해줘" |
| 호스트 위젯 `GET/POST/PATCH/DELETE /host/{id}/widgets` | ✗ | 🟡 P2 | 조회만 `list_host_widgets` | 위젯 편집은 화면이 낫다 |
| 세션 `GET /session/{id}/summary|history` | ✗ | 🟡 P2 | — | 용도 확인 필요 |
| 호스트 이벤트 상세 `GET /event/{id}/events/*` | ✗ | 🟡 P2 | `get_problem`(READ, NEUTRAL) 안에 흡수 | 설계 R8 |

### 1.2 이벤트/알람
| 기능 | 지금 | 판정 | 툴(안) | 메모 |
|---|---|---|---|---|
| 알람 목록 `GET /event/problems`, 확인 처리 `PUT /event/{id}/acknowledge` | ✅ `list_problems` `acknowledge_problem` | ✅ | — | |
| 알람 상세·이력 `GET /event/problems/{id}`, `/{id}`, `/{id}/list-previous`, `/{id}/acknowledge`(이력) | ✗ | 🟢 P1 | `get_problem`(READ, NEUTRAL): 상세 + 이전 발생 이력 + 조치 이력 | "이 알람 전에도 났어?" |
| 그룹별 알람 현황 `GET /hosts/hostgroup-problems`, `/hostgroup/problems/{groupid}`, `/event/bells` | ✗ | 🟢 P1 | `get_group_overview`에 합침 | |
| 읽음 처리 `PUT /event/isRead` | ✗ | 🟡 P2 | — | UI 상태 성격 |

### 1.3 Zabbix 관리 (소스 전용)
| 기능 | 지금 | 판정 | 툴(안) | 메모 |
|---|---|---|---|---|
| 호스트 등록/수정/상태/분류/삭제 `POST /hosts/manage`, `PUT /{id}`, `PATCH /{id}/status`, `PATCH /device-type`, `DELETE /{id}` | ✅ 등록만 | 🟢 P1 | `zabbix_update_host`(WRITE, 태그 round-trip) · `zabbix_set_host_status`(WRITE) · `zabbix_set_device_type`(WRITE, 일괄) · `zabbix_delete_host`(**DESTRUCTIVE**, BE가 `confirmName` 요구 → 카드에 이름 재입력) | 설계 W2~W4·D1 |
| 템플릿 목록/연결/해제/생성/수정/삭제 `/zabbix-manage/templates*` | ✅ 목록·연결 | 🟢 P1(해제) 🟡 P2(생성/수정/삭제) | `zabbix_unlink_templates`(WRITE; clear=true는 DESTRUCTIVE) | 템플릿 자체 CRUD는 드묾 |
| 아이템 목록/키/생성/수정/상태/삭제 `/zabbix-manage/items*` | ✅ 목록·키·생성 | 🟢 P1 | `zabbix_update_item` `zabbix_set_item_status`(WRITE) · `zabbix_delete_items`(DESTRUCTIVE ≤10) | |
| 트리거 목록/상세/생성/수정/상태/삭제 `/zabbix-manage/triggers*` | ✅ 목록·생성 | 🟢 P1 | `zabbix_get_trigger` · `zabbix_update_trigger` · `zabbix_set_trigger_status`(WRITE) · `zabbix_delete_triggers`(DESTRUCTIVE) | "이 트리거 임계치 95로 올려줘" |
| 액션·미디어타입 `/zabbix-manage/actions*`, `/media-types*` | ✗ | 🟡 P2 | 목록/상세/on-off만(READ+WRITE 토글). 생성/수정은 바디가 Zabbix 원형 Map이라 자연어→구조 정확도 확보 후 | 설계 §4.4 |
| LLD·프로토타입·네트워크 디스커버리 `/discovery-rules*`, `/network-discovery*` | ✗ | 🟡 P2 | 목록·discovered 조회 READ부터 | 관리 빈도 낮음 |
| 템플릿 그룹 `/template-groups*` | ✗ | 🟡 P2 | — | |

### 1.4 자산·비용·클라우드
| 기능 | 지금 | 판정 | 툴(안) | 메모 |
|---|---|---|---|---|
| 자산 목록/상세/요약 `GET /assets*` | ✅ `list_assets` `get_asset` | ✅ | — | |
| 자산 수정/제외/복구/동기화/활동 `PATCH /assets/{id}`, `DELETE`, `/restore`, `POST /sync`, `/{id}/activities` | ✗ | 🟢 P1 | `update_asset`(WRITE: 소유자·위치·메모·커스텀 속성) · `sync_assets`(WRITE) · `exclude_asset`(DESTRUCTIVE soft) · 활동은 `get_asset`에 이미 일부 | "이 자산 담당자 홍길동으로 바꿔" |
| 비용(HW 감가상각·대시보드·미입력) `GET /costs/hw`, `/dashboard`, `/hw/incomplete`, `/hw/{assetId}/depreciation`, `PATCH /hw/{assetId}` | ✗ | 🟢 P1 | `get_cost_dashboard`(READ) · `list_cost_incomplete`(READ) · `get_asset_cost`(READ) · `update_asset_cost`(WRITE: 취득가·취득일·내용연수) | 미입력 큐를 AI가 채우는 시나리오가 딱 맞음. 일괄 업로드는 화면 |
| 클라우드(AWS EC2/리전/VPC) `GET /cloud-infras/*` | ✗ | 🟡 P2 | `list_ec2`(READ, 소스=AWS?) | 데이터소스 축 정의 필요(AWS는 수집 엔진 소스가 아님) |

### 1.5 지도·홈
| 기능 | 지금 | 판정 | 툴(안) | 메모 |
|---|---|---|---|---|
| 지리 맵/네트워크 맵 CRUD·라이브 `/geo-clusters*`, `/network-architectures*` | ✗ | 🔵 요약형 + 🟡 P2 | 라이브 상태 요약 `get_map_status`(READ) 정도. 작도·좌표 편집은 AI 부적합 | "이 화면 요약"이 답 |
| 홈 위젯·요약·시스템 상태 `/home/*` | ✗(시스템 상태는 내부 사용) | 🔵 요약형 | `get_system_status`(READ: 데이터소스·DB·Redis·스케줄러) | "지금 시스템 상태 어때?" — 값어치 있음, P1로 올려도 됨 |

### 1.6 설정·사용자·라이선스
| 기능 | 지금 | 판정 | 툴(안) | 메모 |
|---|---|---|---|---|
| 기기분류 목록 `GET /settings/device-classifications` | ✗ | 🟢 P1 | `list_device_classifications`(READ, NEUTRAL) | 호스트 등록·분류 툴의 선행 조회 |
| 스케줄러(잡 목록/로그/수동 실행) `/settings/schedulers*` | ✗ | 🟡 P2 | `list_scheduler_jobs`(READ) · `run_scheduler_job`(WRITE) | "리포트 배치 지금 돌려" |
| 리포트 관리(목록/삭제/보존) `/admin/reports*` | ✗ | 🟡 P2 | 목록 READ | |
| Zabbix/클라우드/LLM 접속정보 `/settings/zabbix|cloud-infra|llm` | ✗ | ⛔ 제외(쓰기) · 🟡 조회는 마스킹본만 | — | 자격증명 = 사람이 화면에서 |
| 사용자·역할·그룹·권한 `/users/**`, `/admin/**` | ✗ | ⛔ 제외 | — | 권한 상승 경로 |
| 라이선스 `/license*`, `/settings/license` | ✗ | ⛔ 제외 · 상태 조회만 🟡 | `get_license_status`(READ) | 등록/삭제는 사람 |
| 인증 `/auth/*` | — | ⛔ | — | |

## 2. 권장 로드맵 (2026-08-19 사용자 확정: **공수 낮은 순**)
0. ~~순서 확정~~ → 1(조회 5) → 2(엑셀 리포트) → 3(변경 8) → 4(자산·비용 6) → 5(DESTRUCTIVE 4) → 6("이 화면 요약")
1. ✅ **P1-A 조회 5개** (2026-08-19 완료·실 BE 검증): `get_group_overview` · `get_host_metrics` · `get_problem` · `get_system_status` · `list_device_classifications`. 교훈: BE 메모리 summary의 avg/max/min은 MB, usagePercentage만 % — 툴에서 단위 이름으로 드러냄.
2. ✅ **P1-B 변경 8개 (2026-08-19 완료·실 BE/실 Zabbix 검증)**: `zabbix_update_host`·`zabbix_set_host_status`·`zabbix_set_device_type` · `zabbix_unlink_templates`(clear) · `zabbix_update_item`·`zabbix_set_item_status` · `zabbix_update_trigger`·`zabbix_set_trigger_status` — 전부 확인 카드. 검증: 테스트 호스트 생성→수정(이름·포트·태그·분류)→템플릿 연결(43아이템)→아이템/트리거 생성·수정·비활성→unlink clear(43→1)→호스트 비활성→삭제. 🔴 교훈 2건: (1) `PUT /hosts/manage/{id}`는 **전체 교체**라 툴이 단건 GET으로 read-modify-write(템플릿·그룹·상태 보존, 프록시 감시 호스트는 거부) (2) BE 생성/수정 바디의 인터페이스 키는 **`interface`**(`@JsonProperty`) — `hostInterface`로 보내던 기존 `zabbix_create_host`가 **인터페이스 없는 호스트를 만들고 있었다**(같이 수정). 상속/디스커버리 아이템 수정은 Zabbix가 거부하고 그 메시지가 그대로 모델에 전달된다.
3. ✅ **P1-C 자산·비용 6개 (2026-08-19 완료·실 BE 검증)**: `update_asset`(사용자 소유 3필드만 — 이름·분류 등 동기화 소유는 열지 않는다) · `sync_assets` · `get_cost_dashboard` · `list_cost_incomplete` · `get_asset_cost` · `update_asset_cost`. 검증: dev 자산 87에 비용 입력→상각 계산 확인(장부가 600,000)→clearFields로 원복(미입력 큐 12건 복귀), 자산 104 생애주기 편집→원복, sync add_only(added 0/skipped 76). 🔴 교훈: BE 비용 응답의 자산 키는 `assetId`가 아니라 **`id`**, 연차표는 `years`, 원문은 `rawPurchaseCost`/`rawAcquisitionDate` — 이름만 보고 쓰면 **빈 문자열이 조용히 나간다**(실제로 그랬다). 🔴 곁가지 수정: 깨진 본문(잘못된 인코딩·JSON)이 **500 AI_INTERNAL**로 나가던 것을 400 AI_BAD_REQUEST로 — "AI 서버가 죽었나"로 오진하게 만든다.
4. ✅ **DESTRUCTIVE 4개 (2026-08-19 완료·실 Zabbix 검증)**: `zabbix_delete_host`(confirmName — 툴에서도 실제 이름과 대조 후 불일치면 BE에 가지 않는다) · `zabbix_delete_items`(≤10) · `zabbix_delete_triggers`(≤10) · `exclude_asset`(soft, restore=true 복원). 검증: 테스트 호스트+아이템+트리거 생성 → 트리거·아이템 삭제 → 잘못된 confirmName 거부 확인 → 정확한 이름으로 삭제 / 자산 87 제외→복원. 🔴 **확인 카드에 대상 이름을 싣기 위해 `AiTool.summarize(ToolContext, input)` 오버로드를 신설**했다 — 기존 `summarize(input)`은 모델 입력(=id)만 갖고 있어 "id만 적힌 카드"가 나왔고, 그건 사람이 검토할 수 없어 확인 절차가 형식이 된다.
5. ✅ **화면 요약 + 사용 가이드 (2026-08-19 완료, AI 측)**: 화면 카탈로그 `resources/docs/screens.json`(30개 — 경로·메뉴·무엇을 보여주나·주의점·커버 툴·한국어 검색어) + `search_docs` 툴 + 메시지 본문의 선택 `route`(턴 앞에 `[Current screen: …]` 주입). 툴이 없는 화면(지도·알림 관리·매크로 등)도 "무엇을 하는 화면이고 데이터가 어디서 오나"는 답할 수 있다. **잔여**: FE의 "이 화면 요약" 버튼 + 모든 메시지에 `route` 동봉(계약 §2.2).
6. P2는 사용 요청 나오는 순서로.
   - ✅ **커스텀 차트 4종(2026-08-20, 사용자 요청)**: 호스트 위젯을 "조회만"으로 미뤘던 판단을 뒤집었다 — 실제 모델이 `{제목, 차트종류, 아이템 id 목록}` 3개뿐이라 자연어로 시키기 가장 쉬운 축에 속했다. 실 BE 검증(생성→수정→삭제) 완료. 🔴 좌표는 툴이 계산(모델이 지어내면 겹침), 🔴 남의 호스트 아이템은 저장은 되고 **빈 차트**가 되므로 툴에서 거부.
   - ✅ **AI 알림 분석 홈 위젯(2026-08-20)**: `ai_insight`(V4) 캐시 + `GET /ai/insights/alerts` + BE 위젯 타입 `ai_alert_digest`. 숫자는 서버 집계·모델은 해석. ⚠️ 사전 생성 배치는 보류(배치에 사용자 세션이 없다 — "서버가 관리자인 척" 토큰 발급 여부는 결정 대기).
   - ✅ **알림 설정 7종(2026-08-20, 실 Zabbix 검증)**: 진단(`check_notification_delivery`)·채널·액션·수신처. dev 실측으로 배달 경로 정상 판정, demouser 수신처 추가→원복. ⚠️ **액션 생성/수정은 미착수** — 바디가 Zabbix 원형이라 "초안 만들고 사람이 승인" 방식으로 별도 설계 필요.
   - ✅ **입력창 "/" 명령(2026-08-20)**: `docs/commands.json` 7그룹 26개 + `GET /ai/commands?route=`. 예약어 실행이 아니라 **문구 채우기**(자연어 경로를 그대로 둔다).
7. ✅ **엑셀 리포트(순서상 2번, 2026-08-19 완료·실 BE 검증)**: `create_report`(READ·NEUTRAL: kind=problems|hosts|assets + 필터, 전건 페이지 순회 ≤5000행) → 서버가 xlsx 생성(POI SXSSF, 토큰 안 태움) → `ai_artifact`(V3, 24h TTL, 매시 정리) → `GET /ai/artifacts/{id}`(쿠키 인증·소유자만) + SSE `artifact` 이벤트 · `export_table`(모델의 표 ≤500×30). 실측: hosts 76행 2.8s · problems 84행 · assets 80행. **남은 kind**: group_report·cost_incomplete(BE 리포트/비용 API 붙일 때 `ReportBuilder.Kind` 한 줄). FE: 다운로드 카드 — 계약서 §2.2 `artifact` 항목.

## 3. 원칙 재확인(왜 전부 툴로 안 여나)
- **자격증명·사용자·라이선스·인증은 절대 AI에 안 준다** — 잘못되면 되돌릴 수 없고 권한 상승 경로가 된다. 조회도 마스킹본만.
- **삭제류는 DESTRUCTIVE**: 카드에 대상 이름 재표시, 10건 상한, BE가 `confirmName` 요구하는 곳은 카드에서 이름 재입력.
- **차트 데이터는 집계값만** — 좌표 수백 개를 모델에 넘기면 토큰만 태우고 답 품질은 안 오른다.
- **데이터소스별 분리 유지** — Zabbix 관리(1.3)는 `zabbix_` 접두, 모니터링·알람·자산(1.1·1.2·1.4)은 중립 엔드포인트라 NEUTRAL. Prometheus 등이 붙으면 그 소스 전용 툴을 같은 틀로.
