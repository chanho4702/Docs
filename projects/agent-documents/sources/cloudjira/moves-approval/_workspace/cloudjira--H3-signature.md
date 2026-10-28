# H3 — 전자서명 (도장 · 서명 이미지 · PIN)

> **먼저 `_workspace/_SHARED.md` 를 읽을 것.**

## 무엇을 만드나

결재 확정 시 서명을 남긴다. DC 기능을 옮긴다 — **전체가 관리자 설정이고 기본은 꺼짐**이다.

1. **이름 기반 자동 도장** — 서명을 등록하지 않은 사람은 이름으로 도장을 그린다
2. **등록 서명** — 그리거나 이미지 업로드(PNG/JPEG, 50KB 이하)
3. **서명 PIN** — 승인/반려 확정 시 PIN 검증(4~12자, 5회 실패 시 15분 잠금)

⚠ PIN 은 Confluence 비밀번호와 **별개**이며 **원문을 저장하지 않는다.**

## 건드릴 파일

```
src/rdb/schema/ddl/approvalSignature.sql.js       (신규 — v010, v011 만 쓸 것)
src/rdb/schema/ddl/index.js                       (re-export 추가만)
src/rdb/schema/migrate.js                         (enqueue 추가만 — v010, v011)
src/resolver/signature/SignatureRepository.js     (신규)
src/resolver/signature/SignatureService.js        (신규)
src/resolver/signature/PinService.js              (신규)
src/resolver/signature/SignatureController.js     (신규)
src/resolver/signature/__test__/*.test.js         (신규)
static/ui/src/features/signature/**               (신규 — 등록 화면 + 확정 시 PIN 입력)
static/ui/src/features/inbox/InboxPage.jsx        ❌ 건드리지 말 것
locales/{kr,en}/signature.json                    (신규)
src/permission/PermissionMap.js / src/index.js    (자기 항목만)
```
⚠ 다른 병렬 태스크가 `src/resolver/flow/`, `src/resolver/notification/`,
   `features/settings/{Group,Manager}Settings.jsx`, `SettingsPage.jsx` 를 고치는 중이다. **건드리지 말 것.**
⚠ ddl 번호는 **v010, v011 만** 쓴다.

## 스키마

**v010 `approval_signature`**: account_id VARCHAR(128) PK, mime_type VARCHAR(64) NOT NULL,
data MEDIUMTEXT NOT NULL(base64), updated_at TIMESTAMP NOT NULL.
⚠ 행 최대 6MiB 이므로 **업로드 상한 50KB 를 서버에서 반드시 재검증**한다. 프론트 검증만 믿지 말 것.

**v011 `approval_pin`**: account_id VARCHAR(128) PK, pin_hash VARCHAR(255) NOT NULL,
salt VARCHAR(255) NOT NULL, iterations INT NOT NULL, failed_count INT NOT NULL DEFAULT 0,
locked_until TIMESTAMP NULL, updated_at TIMESTAMP NOT NULL.

## PIN 처리

- `node:crypto` 의 `pbkdf2Sync`(sha256, **210,000회**, 32바이트, salt 16바이트).
  반복 횟수를 컬럼에 저장하는 이유: 나중에 올릴 때 기존 해시를 재검증할 수 있어야 한다.
- 검증은 **타이밍 공격에 안전하게** `crypto.timingSafeEqual` 로.
- 실패 카운터는 **read-modify-write 를 하지 않는다** — `UPDATE ... SET failed_count = failed_count + 1`
  한 문장으로 올린다. 병렬 시도가 카운터를 우회하는 것을 막는다(DC 의 알려진 구멍 C13).
- 5회 실패 → `locked_until = now + 15분`. 잠금 중에는 **PIN 이 맞아도 거절**한다.
- 성공하면 `failed_count = 0, locked_until = NULL`.

## resolver

```
getMySignature()                     — 'SELF' → { hasSignature, mimeType?, updatedAt?, hasPin }
saveMySignature({ dataUrl })         — 'SELF' → { ok }        // 50KB·MIME 재검증
deleteMySignature()                  — 'SELF'
setMyPin({ pin, currentPin? })       — 'SELF'                  // 이미 있으면 currentPin 필요
verifyPinForDecision({ pin })        — 'SELF' → { ok }         // 결재 확정 직전
getSignatureImage({ requestId, actorKey }) — 'SELF'            // 이력에 도장 표시용
```
⚠ `getSignatureImage` 는 **그 요청을 볼 수 있는 사람만** 받을 수 있어야 한다.
   requestId 로 페이지를 찾아 VIEW 권한을 재검증할 것. 남의 서명 이미지가 새면 안 된다.

## 결재 확정과의 연결

⚠ `ApprovalService.decideApproval` 은 **다른 태스크가 건드릴 수 있다.** 직접 수정하지 말고,
   `PinService.assertPinIfRequired(accountId, pin)` 를 export 해 두고
   **연결이 필요하다는 사실을 완료 보고에 적어라.** 통합은 사람이 한다.

## 화면

- **내 서명 등록**: 캔버스에 그리기 + 이미지 업로드 탭. 미리보기, 삭제.
  PIN 설정/변경. 모두 업무함이 아니라 **독립 화면**(`features/signature/`)으로 만들고,
  진입점 연결은 통합 시 사람이 한다.
- **결재 확정 시 PIN 입력**: 설정이 켜져 있을 때만. 잠금 상태면 남은 시간을 알려 준다.
- **이력의 도장**: 서명 이미지가 있으면 그것을, 없으면 **이름 기반 자동 도장**(SVG 로 그린다 — 이미지 저장 불필요).

⚠ 대리 결재에서는 **실제로 누른 사람(대리인)의 도장**을 찍는다. 서명은 "누가 동의했는가"가 아니라
   "누가 그 자리에서 확인했는가"의 산출물이기 때문이다. 도장 테두리를 점선으로 하고 '대리' 표시를 붙인다
   (DC 의 2026-08 사용자 결정).

## 테스트
1. 50KB 초과 업로드를 **서버가** 거절한다
2. PNG/JPEG 외 MIME 을 거절한다
3. 5회 실패 후 잠금되고, 잠금 중에는 맞는 PIN 도 거절된다
4. 실패 카운터가 `failed_count = failed_count + 1` 한 문장으로 오른다(SQL 검사)
5. 성공 시 카운터·잠금이 초기화된다
6. `getSignatureImage` 가 권한 없는 요청을 거절한다
