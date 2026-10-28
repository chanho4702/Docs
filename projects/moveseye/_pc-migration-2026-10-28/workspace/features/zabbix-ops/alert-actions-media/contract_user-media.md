# API 계약서 — 사용자 알림 수신처(사용자 미디어)

> **산출 기준**: BE 소스(`zabbixadmin/ZabbixUserMediaManageController` · `ZabbixUserMediaManageService`, 2026-08-19) + Zabbix 7.0.6 실측.
> Zabbix UI: Users › Users › [사용자] › Media 탭. 알림 관리(액션 "누구에게" · 미디어 타입 "어떻게")의 마지막 조각 — 사용자에게 수신 주소가 없으면 알림이 안 간다.

베이스 `/zabbix-manage/user-medias`. **전 EP 관리자 전용**. 에러 200 + body code. `userid`는 **Zabbix userid**(로컬 `TUser.zabbixUserId`) — 로컬 전용 계정(zabbixUserId 없음)은 대상 아님.

**이 계층이 얹는 것**: 🔴 `active`(Zabbix 0=사용, 1=중지 — 반직관) → `enabled` boolean · `sendto`(이메일만 배열, 나머지 문자열) → 응답 항상 배열/요청 배열 → 종류에 맞게 되돌림 · 미디어 타입 이름·종류 조인(삭제된 타입 null) · get의 `mediaid/userid/userdirectory_mediaid`는 update가 안 받으므로 벗김 · 전 사용자 요약(선택자 count 미지원 → 전건 조회 후 계산).

## shape
```ts
UserMedia { mediaid; mediatypeid; mediatypeName: string|null; mediatypeKind: 0|1|2|4|null; sendto: string[]; enabled: boolean; severity: 0..63; period: string }
UserMediaView { userid; username; name; medias: UserMedia[] }
UserMediaSummary { userid; username; mediaCount; enabledCount }
UserMediaUpsertReq { medias: [{ mediatypeid; sendto: string[]; enabled?=true; severity?=63; period?="1-7,00:00-24:00" }] }
```

| EP | 비고 |
|---|---|
| `GET /` | 전 사용자 요약(Zabbix userid 기준). FE 사용자 목록 "알림 수신처" 컬럼 |
| `GET /{userid}` | `user.get selectMedias` + mediatype 조인 |
| `PUT /{userid}` | `user.update medias` — 🔴 **전체 교체**(빈 배열=전부 제거). 이메일(kind 0)만 sendto 배열, 나머지는 첫 항목 문자열. 검증: `USER_MEDIA_TYPE_INVALID: id`(없는 타입) · `USER_MEDIA_SENDTO_REQUIRED: 타입명`(빈 주소) |

에러: `USER_MEDIA_USER_NOT_FOUND` · `USER_MEDIA_TYPE_INVALID` · `USER_MEDIA_SENDTO_REQUIRED` · Zabbix 원문.
severity 비트: 1 미분류 · 2 정보 · 4 경고 · 8 평균 · 16 높음 · 32 재해. period 예 `1-7,00:00-24:00`(1=월…7=일, 구간 `;` 구분).

## FE
- 사용자 관리 › 사용자 탭 목록에 **알림 수신처** 컬럼(`N개 (사용 M)` / 수신처 없음 / 비연동 `-`) → `UserMediaDrawer`(행마다 미디어 타입·수신 주소(이메일 tags)·심각도 체크·시간대·사용 스위치, 저장=전체 교체). 미디어 타입 선택지는 알림 관리의 `useMediaTypeList` 재사용(`enabled` 파라미터 추가).
- 실측: 요약·view(andy: SMS 문자열/이메일 배열/Mattermost)·PUT 검증 2종·PUT 2건 저장·빈 배열 복원·NOT_FOUND 통과, UI 컬럼·드로어(Admin 8건) 렌더 확인.
