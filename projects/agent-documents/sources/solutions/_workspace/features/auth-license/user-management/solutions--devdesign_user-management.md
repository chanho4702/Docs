# MovesEye 개발 설계 — 사용자 관리 재구성 (User Management Restructure)

> 목표: "4개 화면 중 3개가 조회 전용 반쪽 + 역할 편집 화면은 도달 불가 고아"인 현 사용자·역할 메뉴를
> 사용자 중심으로 재구성한다. BE 쓰기 경로(user/usergroup/role CRUD)는 전부 살아 있으므로 **FE 재구성 중심, BE는 보강 최소**.

작성: 2026-07-16 · 상태: **설계 확정 대기 → 구현은 fullstack-feature 파이프라인**
선행 진단: 본 문서 §1 (2026-07-16 Explore 전수 조사 결과 요약)

---

## 0. 확정 방향 (2026-07-16 사용자 결정)

| 항목 | 결정 |
|------|------|
| 범위 | **구조 재구성** — 화면 재편 + 죽은 기능 재활 + UX 재설계. BE는 기존 API 재사용 중심 |
| 역할·권한 편집 | **DMOVE 권한만 1차** (역할 생성/수정 + view/edit/delete/download 매트릭스). Zabbix rules 편집 탭은 2차 |
| 삭제 정책 | **비활성화 기본 + 영구 삭제는 강확인** (사용자명 타이핑 이중확인 — 호스트 삭제 정책과 일관) |
| 접근 권한 | **SUPER_ADMIN 전용 유지** (현 `@Roles(SUPER_ADMIN)` 구조 그대로, BE 가드 변경 없음) |

### 아키텍처 대원칙 (현 구조 유지)
- **로컬 DB가 정본, Zabbix는 미러.** 인증은 로컬(passwordEncoder), Zabbix는 로그인 후 프록시 토큰 발급용. 이 구조는 건드리지 않는다.
- 이중 저장 흐름(로컬 저장 → zabbixUserService 전파)도 유지. 재구성은 **노출(UX) 계층**의 일이다.

---

## 1. 현황 진단 요약 (근거는 2026-07-16 조사)

| 화면 | 상태 | 핵심 문제 |
|------|------|----------|
| UserList | 유일한 완성 CRUD | 삭제가 항상 하드(`isHard:true` 고정), 역할 권한 미리보기 없음, user_type/status 자동계산 필드 설명 부족, 생성/수정 비밀번호 UX 이원화 |
| UserGroups | 조회 전용 | 생성 버튼·상세 모달·체크박스 삭제 전부 주석 처리 |
| HostGroups | 조회 전용 | 동일. 게다가 "설정 > 호스트 등록 관리"(devdesign_host-registration) 그룹 탭과 역할 중복 예정 |
| UserRoles | 조회 전용 | 생성 진입로 주석 처리 |
| UserRoleUtility | **도달 불가 고아** | DMOVE/Zabbix 권한 편집 탭까지 완성된 구현체가 라우트·진입 버튼 주석으로 고립 |

기타: FE 미호출 BE API(`/admin/users` AdminUserController, `getZabbixUserList` 등), FE/BE 필수 필드 불일치(BE email 필수·password min 8 vs FE 검증 별도 관리), `DmoveTableFilter.tsx:108` `@ts-expect-error` 잔재.

---

## 2. 화면 재편 — 메뉴 4개 → 3개

```
사용자·역할
  ├─ 사용자        (UserList 개선)
  ├─ 사용자 그룹    (UserGroups 재구성 — CRUD 부활)
  └─ 역할          (UserRoles 재구성 + UserRoleUtility 재활)

  ✂ 호스트 그룹    → 메뉴·라우트 제거
```

**HostGroups 화면 제거 근거**: 조회 전용인 데다, 호스트 그룹 CRUD는 "설정 > 호스트 등록 관리" 그룹 탭이 담당하게 된다(devdesign_host-registration §5.2). 권한 관점 정보(어떤 사용자 그룹이 어떤 호스트 그룹에 접근하는가)는 **사용자 그룹 화면의 컬럼/상세로 흡수**한다. 제거는 메뉴+라우트+페이지 파일이며, 공용 모달(`HostGroupDetailModal` 등)은 다른 소비처 전수 확인 후 정리(구코드 소비처 전수확인 교훈 준수).

### 2.1 사용자 화면 (UserList 개선)

- **목록**: 현 컬럼 유지하되 상태 컬럼을 **활성/비활성 스위치**로 승격(SUPER_ADMIN 행은 비활성화 불가). 행 액션: 수정 / 비활성화 / 영구 삭제.
- **삭제 재설계**:
  - 기본 액션 = **비활성화**: 로컬 `User.status=INACTIVE` → 로그인 차단(인증이 로컬이므로 이것으로 충분). 일반 확인 모달.
  - **영구 삭제** = 별도 액션: 강경고("로컬 계정 + 연결된 Zabbix 계정이 함께 영구 삭제됩니다") + 사용자명 타이핑 이중확인(서버측 confirmName 재검증). 체크박스 다중 하드삭제는 제거.
- **UserFormModal 개선**:
  - 역할 select 항목에 **권한 미리보기**: 역할 선택 시 폼 하단(또는 popover)에 해당 역할의 DMOVE 권한 매트릭스 read-only 요약 표시 — "역할 하나 고르기"로 뭉뚱그려진 3중 권한 모델 문제의 1차 해소.
  - user_type/status 자동계산 필드: 회색 disabled 대신 **표시 전용 라벨 + 툴팁**("역할의 유형을 따릅니다" / "소속 그룹 상태로 계산됩니다")로 전환.
  - 비밀번호 UX 통일: 생성/수정 모두 동일한 `PasswordSection` 공용 컴포넌트(수정 시엔 접힘 상태로 "비밀번호 변경" 펼침). 중복 구현된 별도 FormModal 제거. FE 검증에 min 8자 명시(BE와 정합).

### 2.2 사용자 그룹 화면 (재구성)

- **목록**: 이름 / 멤버 수(펼침으로 사용자 링크) / 접근 가능 호스트 그룹 / 상태. 서버사이드 정렬 활성화.
- **생성/수정 Drawer 신규 작성**(주석 처리된 구 `UserGroupFormModal`은 복원이 아니라 재작성): 이름, 상태, 멤버(사용자 다중 select).
- 호스트 그룹 접근권(Zabbix usergroup rights)은 **1차 read-only 표시**(상세에 목록으로) — 편집은 Zabbix rules 성격이므로 역할의 Zabbix 탭과 함께 2차.
- BE 재사용: `GET/POST/PUT/DELETE /users/user-groups` (전부 존재).

### 2.3 역할 화면 (UserRoles 재구성 + UserRoleUtility 재활)

- **목록**: 역할명 / 유형(SUPER_ADMIN·ADMIN·USER) / 소속 사용자 / 플랫폼. 행 클릭 → **권한 매트릭스 read-only 미리보기 Drawer**.
- **생성/수정**: `UserRoleUtility`를 정식 라우트로 복원(`/users-roles/roles/edit/:id?`)하되 재구성:
  - 1차 노출은 **DMOVE Permission 탭만**. Zabbix Permission 탭은 코드 보존 + 숨김(2차 플래그).
  - 이름/유형 입력 + DMOVE 권한 매트릭스(view/edit/delete/download × 기능 그룹) — 기존 `DmovePermission`/`DmoveRowPermission` 컴포넌트 재사용.
  - 저장은 기존 `POST /users/role/storage`(생성·수정 겸용) 재사용.
- 시스템 기본 역할(플랫폼 ZABBIX 동기화분 등) 편집·삭제 가드: 소속 사용자가 있는 역할 삭제 시 경고 + 차단(BE 동작 확인 후 FE 메시지 정합).

---

## 3. BE 변경 (최소 보강 — Spring, `@Roles(SUPER_ADMIN)` 유지)

| # | 변경 | 내용 |
|---|------|------|
| 1 | `PATCH /users/{id}/status` **신설** | `{ enabled }` — 로컬 status 변경(INACTIVE=로그인 차단). SUPER_ADMIN 계정 비활성화 거부. Zabbix 반영은 하지 않음(로컬 인증이 정본) — 사유를 응답/문서에 명시 |
| 2 | `DELETE /users` 정비 | `isHard` 파라미터 실동작 확인. 하드 삭제 요청에 `confirmName` 추가(서버측 사용자명 일치 검증). 마지막 SUPER_ADMIN 삭제 방어 확인 |
| 3 | 검증 정합 | CreateUserDto와 FE 폼 필수/제약(email 필수, password min 8) 대조 — 계약서에 명시 |
| 4 | (기록만) 미사용 API | `AdminUserController(/admin/users)`, FE 미호출 조회 EP들 — **1차 제거 보류**, 삭제 후보 목록으로 계약서에 기록 (구 Nest 참조·외부 소비 가능성 확인 후 별도 정리) |

- Flyway 신규 없음(V9는 호스트 등록 관리가 선점). 사용자 변경 감사 로그는 2차(host_change_log 패턴 준용 예정).
- 신설 EP 권한: 기존 관례(`@Roles(SUPER_ADMIN)`) 그대로. ⚠️ 순수 admin roleid=null 함정은 이 컨트롤러의 기존 가드 방식과 동일하게 처리(변경하지 않음).

---

## 4. FE 작업 목록 (moveseyee_fe)

1. **제거**: HostGroups 메뉴·라우트·페이지, UserGroups/UserRoles의 주석 잔재 전부, 미사용 서비스 함수(`getZabbixUserList` 등 — 소비처 전수 확인 후), 중복 비밀번호 FormModal.
2. **사용자**: 상태 스위치 + 비활성화/영구삭제 액션 분리, UserFormModal 개선(권한 미리보기·툴팁·PasswordSection).
3. **사용자 그룹**: 목록 재구성 + 생성/수정 Drawer 신규.
4. **역할**: 목록 재구성 + 미리보기 Drawer + UserRoleUtility 라우트 복원·DMOVE 탭 단독 노출.
5. **공통**: 쿼리 키 정리(기존 `USER_ROLES_QUERY_KEY` 체계 유지, 화면 간 캐시 충돌 방지 규칙), i18n en/kr 동시 추가, `DmoveTableFilter.tsx:108` `@ts-expect-error` 해소.
6. **테스트**: 화면별 렌더/빈 목록/로딩 + 비활성화 스위치 → mutation 호출, 영구 삭제 confirmName 불일치 시 버튼 비활성, 역할 저장 폼 필수값, 권한 미리보기 렌더.

---

## 5. 구현 단계 (fullstack-feature 파이프라인)

1. **BE (be-engineer)** — §3의 1~3 (status EP 신설, delete 정비+confirmName, 검증 정합) + 단위 테스트.
2. **계약 산출** — `contract_user-management.md` (springdoc 기준, 미사용 API 삭제 후보 목록 포함).
3. **FE (fe-engineer)** — §4 순서대로. 제거 → 사용자 → 그룹 → 역할.
4. **integration-qa** — DTO↔타입 대조, 제거된 라우트·서비스 함수의 잔존 참조 0건 확인.
5. **functional-qa** — E2E: 사용자 생성(권한 미리보기 확인) → 비활성화 → 로그인 차단 확인 → 재활성화 → 영구 삭제(이중확인) / 그룹 생성·멤버 배정 / 역할 생성(DMOVE 매트릭스) → 해당 역할 사용자로 메뉴 노출 변화 확인. 테스트 계정은 `dmove-qa-` prefix, E2E 안에서 생성·삭제 완결. 스크린샷 최소화.

---

## 6. 2차 로드맵 (기록만)

- 역할 Zabbix Permission 탭 재노출(ui/actions/api rules 편집) + 사용자 그룹 호스트 그룹 rights 편집
- 사용자 변경 감사 로그(host_change_log 패턴) + 이력 조회 UI
- 미디어/알림 채널(medias)·언어·타임존 등 자빅스 확장 필드 편집
- 미사용 BE API(AdminUserController 등) 실제 제거
- ADMIN 접근 개방(세분화 가드) — 이번에 SUPER_ADMIN 전용 유지 결정에 따라 보류

## 7. 미확정 → 구현 중 확인 항목

1. `DELETE /users`의 `isHard=false` 현 동작(소프트 경로가 실제 뭘 하는지) — BE 착수 시 확인 후 status EP와 역할 분담 확정.
2. 역할 삭제 시 소속 사용자 존재 케이스의 BE 현 동작(차단? cascade?) — FE 경고 문구 정합.
3. `HostGroupDetailModal`/`HostDetailModal` 등 공용 모달의 타 소비처 존재 여부 — 제거 범위 확정.
4. Zabbix 미러 관점에서 비활성화 사용자의 Zabbix 계정 처리(그대로 두면 Zabbix 직접 로그인은 가능) — 운영상 허용 여부만 확인, 기본은 "로컬만 차단".
