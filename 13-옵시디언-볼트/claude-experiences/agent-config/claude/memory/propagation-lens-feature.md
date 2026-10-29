---
name: propagation-lens-feature
description: "2026-07-21 전파 가시성+엔티티 렌즈(아이템/트리거 관리 신규 메뉴) 풀스택 구현(미커밋). 드릴다운(컨테이너 렌즈) 위에 엔티티 렌즈 추가. 신규 읽기 EP /zabbix-manage/{items,triggers}/lens(ID-슬라이스 임의 페이징+전파 필드), 호스트 테이블 count 강화. 교훈: Zabbix offset 없어도 ID-슬라이스(ID만 조회→슬라이스→페이지만 하이드레이트)로 전체 임의 페이징 가능(페이지당 0.4~1.3초). 처음 CAP+truncated로 짰다가 미련하다고 지적받고 재작성"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6c5f188f-27ea-4a1a-aee6-b9f557b1edd0
  modified: 2026-07-22T07:42:24.360Z
---

2026-07-21 [[zabbix-config-drilldown-restructure]](컨테이너 렌즈) 위에 **엔티티 렌즈 + 전파(propagation) 가시성** 추가. **미커밋.** 사용자 요구="어떤 데이터가 어떤 호스트/템플릿에 전파됐는지 확인".

## 아키텍처 = 이중 렌즈
- **컨테이너 렌즈**(기존 드릴다운): 호스트/템플릿 → 그 안의 아이템·트리거. "이 컨테이너에 뭐가 있나".
- **엔티티 렌즈**(신규): 아이템 관리/트리거 관리 메뉴 — 전 호스트/템플릿 가로질러 목록+필터+"정의처→전파 대상". "이 데이터가 어디로 퍼졌나". CRUD는 기존 FormDrawer 재사용(생성 버튼 없음, 수정/삭제/상태만 — 생성은 드릴다운으로).
- 디스커버리 = placeholder 유지(이번 범위 아님).

## BE (신규 읽기 EP, 쓰기는 기존 재사용 → 드릴다운 계약 무변경)
- `GET /zabbix-manage/items/lens`, `/triggers/lens` — `ZabbixEntityLensService`. 필터 groupids/hostids/templateids/type|severity/status/search + view(definition|all)+origin(plain|discovered, all뷰 전용). 응답 `LensPagedDto{items,total,limit,offset,truncated,cap}`, 각 행에 `containerKind`+`source{kind:local|template|discovery,templateId,templateName}`+`propagation{hostCount}`.
- 호스트 테이블: `ManagedHostDto`에 itemCount/triggerCount/discoveryCount(host.get select*:"count") additive, 목록 EP templateids 필터 추가. 템플릿: ManagedTemplateDto.triggerCount 추가(hostCount/linkedHosts는 이미 있었음).
- application.yml `app.lens.cap`=**50,000**(env LENS_CAP) — CAP 아니라 ID목록 **안전상한**. ErrorCode LENS_OFFSET_EXCEEDS_CAP은 안전상한 초과 방어로만 존치(정상 흐름 미발생).

## 핵심 교훈 (실 Zabbix 실측)
- **규모**: 아이템 20,440(discovered 9,765!)/트리거 6,940/호스트76/템플릿347/중첩템플릿 0.
- 🔴 **ID-슬라이스 페이징(핵심 교훈 — 처음 틀렸다가 교정)**: Zabbix API에 offset이 없어도 전체 임의 페이징이 된다. 1단계 item.get `output:["itemid"]`+필터+sortfield로 정렬된 전체 ID 목록(가벼움, 페이지당 0.4~1.3초) → 2단계 `[offset:offset+limit]` 슬라이스 ID만 `itemids`로 풀 하이드레이트(보이는 행만). itemids 순서 미보장 → ID→행 맵으로 원순서 복원. total=ID목록 크기. **처음엔 "offset 없으니 서버 페이징 불가"라며 CAP1000+truncated로 때웠다가 "미련하게 하지말라"고 지적받고 재작성** — 무필터 풀조회(36.6초/8.7MB)는 피하되 CAP은 안전상한(5만)으로만. 캐시 불필요(요청당 재조회<1.3초).
- **definition 기본뷰**로 discovered 9,765건 노이즈+상속 사본 숨김(토글로 all). 아이템 origin(plain/discovered) 필터는 all뷰 전용.
- **전파 산출 저비용**: 전 템플릿→호스트 맵 1콜 0.17초로 조인(N+1 없음, D4 요청당 구축·TTL캐시 금지). 상속 행 정의처는 templateid 역추적(깊이당 1콜, 상한 5). host.get count 모드 무비용.
- 무거운 필드(lastvalue/expandExpression)는 반환 페이지분만 2차 보강. 무필터 첫 페이지 3~5초 → FE keepPreviousData/스켈레톤 필수.

## FE
- `pages/zabbix-management/entity-lens/`(ItemLensPage/TriggerLensPage/LensSourceCell/LensPropagationTag), types/services/hooks/constants zabbix-lens. 전파 칩 클릭→템플릿 상세 linkedHosts 팝오버 재사용. 상속 행 비활성(드릴다운 규칙 동일). 호스트 테이블 템플릿 이름 칩+count 컬럼+템플릿 필터.
- **2026-07-22 렌즈 생성 기능 추가(D3 뒤집음)**: `LensCreateTargetModal`(스코프 호스트/템플릿 + 대상 검색) → 기존 ItemFormDrawer/TriggerFormDrawer 생성모드. 렌즈는 대상 없어서 대상 선택 선행 필수. 대상 검색은 useLensFilterHosts/Templates 캐시 재사용. 런타임 검증됨.
- **2026-07-22 호스트 드릴다운 아이템 탭에 정의처 템플릿 컬럼+필터 추가, 최근값 컬럼 제거**: BE ManagedItemDto.sourceTemplate{templateId,templateName}(호스트 스코프·상속만, 렌즈 source 역추적 헬퍼 ZabbixSourceTraceHelper 재사용) + ManagedItemListReqDto.sourceTemplateId 필터. FE는 host 링크 템플릿을 필터 옵션으로.

## 검증
- BE build+test 그린, FE tsc/lint/build 그린 jest 579 통과(선재 실패 useGroupReportHostCompare만).
- integration-qa 정적 **PASS 7/0**(행 액션 scope 배선 안전 확인). LOW 1: 트리거렌즈 scopeTech 미전달(힌트 UX만, 쓰기 무관).
- ⚠️ **런타임 미검증**: Chrome 미연결 + dev DB Setting(ZABBIX) stale(관리자 API 401). ⚠️ 세션 중 서브에이전트 2회 실 Zabbix 비번 하드코딩→보안플래그, 파일 삭제 처리. 재실측 시 자격증명 하드코딩·파일기록 금지.

## ⚠️ 세션 상태 (2026-07-21)
하루에 미커밋·런타임미검증 기능 6~7건 누적: [[trigger-management-feature]] → 구성관리(B,폐기) → [[zabbix-config-drilldown-restructure]](A) → 본 전파렌즈. 다음 세션 우선: **커밋 + 런타임 검증 체크포인트**(브라우저 연결+Setting 교정+BE 재빌드 필요).

관련: [[zabbix-config-drilldown-restructure]], [[trigger-management-feature]], [[item-template-management-feature]], [[host-classification-tags-feature]]


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

전파 가시성·엔티티 렌즈 — 2026-07-21 드릴다운 위에 엔티티 렌즈(아이템/트리거 관리 신규 메뉴)+전파 가시성 풀스택(미커밋). 신규 읽기 EP /zabbix-manage/{items,triggers}/lens(정의처/전파 필드), 호스트 테이블 count 강화. 정적QA PASS7/0. 🔴교훈: Zabbix offset 없어도 ID-슬라이스(ID만조회→슬라이스→페이지만 하이드레이트)로 전체 임의 페이징 가능(페이지당0.4~1.3초). 처음 CAP+truncated로 짰다가 "미련하다" 지적받고 재작성. definition 기본뷰로 discovered노이즈숨김, 전파는 템플릿→호스트맵 1콜조인. 런타임 미검증
