# H2 — 코멘트 @멘션으로 Confluence 네이티브 알림 보내기

> **먼저 `_workspace/_SHARED.md` 를 읽을 것.**

## 왜 이렇게 하나

Forge 앱은 사용자의 **Confluence 알림함에 직접 쓸 수 없다.** 이벤트에 반응할 때 앱 코드는
앱 시스템 사용자로 돌고 `asUser()` 를 쓸 수 없기 때문이다
(https://developer.atlassian.com/platform/forge/in-app-notifications-from-events/).
메일 발송 API 도 없다.

**결재 대상 페이지에 코멘트를 달고 결재자를 @멘션하면**, 그 다음은 Confluence 가 한다 —
알림함에 넣고 메일도 보낸다. 네이티브 알림에 닿는 유일한 경로다.

## 건드릴 파일

```
src/resolver/notification/CommentNotifier.js           (신규)
src/resolver/notification/NotificationService.js       (연결만)
src/resolver/notification/__test__/CommentNotifier.test.js (신규)
src/resolver/settings/SettingsService.js               ❌ 건드리지 말 것(다른 태스크가 사용 중)
locales/{kr,en}/notification.json                      (문구 추가)
```
scope(`write:comment:confluence`)는 **이미 manifest 에 추가돼 있다.** manifest 를 고치지 말 것.

## 요구사항

1. 앱 내 알림을 만들 때 **함께** 코멘트를 단다. 앱 내 알림함은 그대로 유지한다 —
   코멘트는 "밖으로 알리는" 경로이고 알림함은 "모아 보는" 경로다.
2. **관리자가 끌 수 있어야 한다.** 설정에 `commentNotifyEnabled`(기본 **꺼짐**)를 둔다.
   문서에 코멘트가 쌓이는 것을 싫어하는 조직이 있다 — 기본값은 끔이어야 한다.
   (설정 저장 자체는 기존 `saveApprovalSettings` 계약을 쓴다. SettingsService 를 고치지 말고
    NotificationService 에서 설정을 읽기만 할 것.)
3. **한 결재당 코멘트는 최소한으로.** 이벤트마다 달면 문서가 코멘트로 뒤덮인다.
   - 요청 생성(REQUESTED): 현재 차례 결재자만 멘션 — 전체가 아니라 **지금 결정할 사람만**
   - 단계가 넘어갔을 때: 새로 차례가 된 사람만
   - 최종 승인/반려/회수: 요청자만
   - 마감 임박·독촉: **코멘트를 달지 않는다**(알림함으로 충분하다. 반복 코멘트는 소음이다)
4. 코멘트 본문은 짧게. 상태·문서·링크만. `{templateKey, vars}` 대신 **여기서는 문구를 만들어야 한다**
   (코멘트는 Confluence 가 보관하므로 렌더 시점 번역이 불가능하다). 그래서 **요청자의 언어**로 쓴다.
   그 사실을 주석에 남길 것 — 서버가 문구를 만들지 않는다는 원칙의 **의도된 예외**다.
5. ADF 로 코멘트를 만든다. 멘션은 `{ type: 'mention', attrs: { id: accountId } }`.
6. **실패해도 결재를 되돌리지 않는다.** try/catch 로 감싸고 로그만 남긴다 —
   코멘트 권한이 없거나 페이지가 잠겨 있을 수 있다.
7. `asApp()` 이 아니라 **`asUser()`** 로 단다. 요청자 이름으로 코멘트가 남는 편이
   "앱이 남긴 정체불명 코멘트"보다 낫고, 권한도 요청자 기준으로 자연스럽게 검증된다.
   ⚠ 단 스케줄/트리거 경로에는 사용자 컨텍스트가 없다 — 그 경로에서는 **코멘트를 달지 않는다**.

## 테스트
1. `commentNotifyEnabled` 가 꺼져 있으면 코멘트 API 를 호출하지 않는다
2. REQUESTED 에서 **현재 차례 결재자만** 멘션한다(전체 결재자가 아니라)
3. 마감 임박·독촉은 코멘트를 달지 않는다
4. 코멘트 실패가 예외를 밖으로 던지지 않는다
5. 멘션 ADF 의 attrs.id 가 accountId 다
