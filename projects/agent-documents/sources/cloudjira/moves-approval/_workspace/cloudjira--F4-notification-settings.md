# F4 — 알림 + 설정 화면

> **먼저 `_workspace/_SHARED.md` 를 읽을 것.**

## 이 기능이 하는 일

(1) 결재 상황을 알림함으로 알린다. (2) 관리자가 정책·적용 스페이스·그룹·설정 관리자를 관리한다.

## 건드릴 파일

```
src/resolver/notification/**                 (신규)
src/resolver/settings/**                     (신규)
static/ui/src/entries/settings.jsx           (교체)
static/ui/src/features/settings/**           (신규)
static/ui/src/features/notification/**       (신규)
locales/{kr,en}/{notification,policy,space,manager,common}.json (키 추가)
src/permission/PermissionMap.js              (자기 항목만)
src/index.js                                 (자기 registrar 만)
```

## 알림

**서버는 사람이 읽을 문구를 만들지 않는다.** `{ templateKey, vars }` 로 저장하고 프론트가 렌더한다.
DC 는 발송 시점 언어로 굳혀 저장해서, 한국어 사용자가 만든 알림을 영어 사용자가 보면 한국어가 나왔다.

`vars` 에 **표시명·이메일을 넣지 않는다.** `accountId` 만 넣고 렌더 시점에 조회한다 —
이름이 바뀌어도 자동 반영되고 보관 개인정보가 줄어든다(Marketplace 심사에 유리).

### resolver
```
listNotifications({ cursor?, limit? }) — 'SELF'
  → { items: [{ notificationId, kind, templateKey, vars, requestId, pageId, pageTitle, createdAt, readAt }],
      nextCursor, hasMore }
markNotificationsRead({ notificationIds? }) — 'SELF' → { updated }   // 없으면 전체
getUnreadCount() — 'SELF' → { unread }
createNotifications(...)  // 내부용. resolver 로 노출하지 않는다
```

### 수신자 규칙 (DC 이식)
| 이벤트 | 수신자 |
|---|---|
| REQUESTED | 전체 결재자 |
| APPROVED(최종) | 요청자 |
| REJECTED / EXPIRED | 요청자 + **미결정** 결재자. 단 편집 만료(reason=CONTENT_VERSION)면 **이미 승인한 사람도 포함** — 자기 승인이 무효가 됐음을 알아야 한다 |
| CANCELLED | 미결정 결재자 + (회수자≠요청자면) 요청자 |

마지막에 **행위자 본인을 뺀다.**

INSERT 는 `INSERT IGNORE`. `UNIQUE(event_key, recipient_key, channel)` 이 중복을 막으므로
사전 조회하지 않는다(DC 의 check-then-insert 구멍을 반복하지 말 것).

⚠ 알림 실패가 결재를 되돌리면 안 된다. **커밋 이후**에 넣고 실패는 로그만 남긴다.

## 설정

`confluence:globalSettings` 엔트리. `AppShell` 사이드바 4항목:

| key | 내용 |
|---|---|
| policy | 기본 마감일 · 반려 사유 필수 · 알림 사용 · 마감 임박 기준(시간) · 상태 표시명 |
| spaces | 적용 스페이스 선택. **커서 페이징**(v2 spaces API 는 start/limit 이 아니라 cursor 다) |
| groups | 승인 그룹 등록(Confluence 그룹 가져오기) |
| managers | 설정 관리자 |

### resolver — 전부 `{admin: true}`
```
getApprovalSettings() / saveApprovalSettings(patch)
listSpaces({ cursor?, q? }) / setSpaceEnabled({ spaceKey, enabled })
listManagers() / setManagers({ accountIds })
```
스칼라 설정은 **KVS**, 스페이스 목록은 **`approval_space_config` 테이블**(이미 있다).
목록형을 KVS 에 두지 않는 이유: `findAll()` 이 100건 하드캡이라 스페이스가 많으면 조용히 잘린다.

⚠ **globalSettings 에 도달한 것 자체를 관리자 신호로 쓰지 않는다.** 플랫폼이 admin 을 강제하는지
확인되지 않았으므로 resolver 에서 `{admin:true}` 로 반드시 재검증한다.

⚠ 적용 스페이스를 **한 번도 정하지 않은 설치는 모든 스페이스 허용**이다(기존 동작 유지).
빈 목록과 "미설정"을 구분할 것.

## 테스트
1. 편집 만료는 이미 승인한 사람도 수신자에 포함한다
2. 행위자 본인은 수신자에서 빠진다
3. `vars` 에 표시명·이메일이 없다(accountId 만)
4. 설정 resolver 가 비관리자를 거절한다
5. 적용 스페이스 미설정과 빈 목록이 구분된다
