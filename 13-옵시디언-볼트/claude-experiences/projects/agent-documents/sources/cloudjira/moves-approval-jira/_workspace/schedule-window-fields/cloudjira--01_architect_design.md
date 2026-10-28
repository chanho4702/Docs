# 승인 일정·워크로그 작성 기간을 앱 전용 필드로 — 설계서

> **폐기(2026-10-12 사용자, Q139 Q11).** 이슈별 작성 기간은 `_workspace/linked-issue-schedule` 의 워크포스 팀장 설정으로 대신한다. 이 설계는 구현하지 않는다.

> 2026-10-11 작성 · slug `schedule-window-fields` · 근거: `00_input/requirement.md`, QUESTIONS Q90·Q91·Q137 답
> 앞쪽 "요약"부터 "6. 워크포스와의 관계"까지는 사람이 읽는 설명이다. 구현 계약(resolver 표·스키마·미검증·작업 분해)은 "부록" 이후에 모았다.
> 아직 실제 Jira 사이트에서 확인하지 않은 동작은 "미검증"이라고 적었다. 확인 방법은 §J 에 있다.

---

## 요약

### 결론

이슈마다 날짜 네 개를 **우리 앱만 쓸 수 있는 Jira 필드**에 둔다.

| 묶음 | 필드 | 뜻 | 누가 바꾸나 |
|---|---|---|---|
| 승인 일정 | 승인 시작일, 승인 종료일 | 이 이슈의 일을 언제 하기로 승인받았나 | 필드 변경 승인으로만. 비어 있을 때 첫 값은 관리자가 넣을 수 있다 |
| 워크로그 작성 기간 | 작성 시작일, 작성 종료일 | 이 이슈에 **어느 날짜의 일**을 적을 수 있나 | 관리자가 직접, 또는 필드 변경 승인으로 |

두 묶음은 다른 개념이다. 일정은 "언제 일하기로 했나"이고, 작성 기간은 "어느 날짜의 시간을 이 이슈에 적어도 되나"다. 둘을 따로 둬야 "일정은 3월인데 마무리 작업 때문에 4월 초까지는 적게 해 주자" 같은 운영이 된다.

판정의 원본은 **우리 DB** 다. Jira 필드는 사람이 보고 JQL 로 찾을 수 있게 같은 값을 옮겨 둔 사본이다. 그래서 필드가 어떤 이유로 바뀌어도 판정은 흔들리지 않는다. 다만 사람이 못 바꾸는 필드여야 사본을 믿고 볼 수 있다. 그래서 실제 사이트에서 정말 못 바꾸는지를 배포 전에 확인한다(§J).

Jira 에서 직접 바꾼 값을 앱이 몰래 되돌리는 일은 하지 않는다(Q91 답). 대신 공식 값을 처음부터 사람이 못 바꾸는 곳에 둔다.

### 무엇이 바뀌나

- **기존 "이슈 기간 창"의 기준이 바뀐다.** 지금은 Jira 기본 Start date~Due date 로 막는다. 이 두 필드는 누구나 고칠 수 있다. 게다가 Start date 필드 번호가 사이트마다 달라서 관리자가 매핑까지 해야 했다. 앞으로는 우리 앱의 작성 기간 필드로 막는다. 매핑이 필요 없다.
- **워크포스 연동 이슈에만 걸리던 기간 창이 모든 이슈에 걸린다.** 관리자가 작성 기간을 넣은 이슈라면 연동 여부와 상관없이 적용된다.
- **"3월 것은 4월부터 못 고친다"를 정책으로 걸 수 있다.** 새 정책 "월 마감일"을 둔다. 전체 → 프로젝트 → 이슈 순서로 덮어쓸 수 있다.
- **예외를 세 단위로 줄 수 있다.** 기간 전체는 재개방, 이슈 전체는 이슈 정책 덮어쓰기, 이슈 하나의 특정 기간은 새 "작성 예외 허가"다.
- **이슈 화면에 "일정·작성 기간" 칸이 생긴다.** 승인 일정, 작성 기간, Jira 기본 일정을 나란히 보여 준다. 기본 일정과 승인 일정이 다르면 "기본 일정과 다름"을 표시한다. 변경 요청 버튼과 변경 이력이 있다.
- **워크포스는 같은 규칙을 미리 보여 줄 수 있게 정보를 받는다.** 판정은 여전히 승인 앱이 한다.

### 한 장면으로 보면

> 프로젝트 A 의 이슈 A-12 는 승인 일정이 3월 2일~3월 27일이다. 마무리 작업 때문에 관리자가 작성 기간을 3월 2일~4월 3일로 잡았다. 프로젝트 A 의 월 마감일은 6이다("다음 달 6일 0시부터 잠금").
>
> - 철수가 4월 2일에 "4월 1일, 3시간"을 A-12 에 적는다. 작성 기간 안이고 4월은 아직 안 닫혔다. 된다.
> - 철수가 4월 7일에 "3월 30일, 2시간"을 새로 적는다. 3월은 4월 6일 0시에 닫혔다. 막힌다. "3월 기록은 4월 6일에 마감됐습니다."
> - 철수가 4월 2일에 "4월 5일" 날짜로 적는다. 작성 기간(4월 3일까지) 밖이다. 막힌다.
> - 영희의 3월 타임시트는 이미 승인됐다. 영희가 4월 3일에 3월 기록을 고치려 한다. 마감 전이지만 승인된 기간이다. 막힌다.

---

## 열린 질문

모두 아래 "기본 가정"으로 설계했다. 답이 다르면 표시한 절만 바꾸면 된다.

| # | 질문 | 기본 가정 | 대안 | 영향 절 |
|---|---|---|---|---|
| SW-1 | "작성 기간"은 무엇의 기간인가 | **작업 날짜**가 그 안이어야 한다(기존 기간 창과 같은 뜻) | 작성하는 **시점**이 그 안이어야 한다 | §2, §C |
| SW-2 | 승인 일정의 첫 값 | 비어 있는 이슈에 한해 프로젝트 관리자가 직접 넣을 수 있다(사유·감사 기록). 값이 생긴 뒤에는 승인으로만 | 첫 값부터 승인 | §3, §B |
| SW-3 | 우리 필드가 다른 경로로 바뀌었을 때 | **되돌리지 않는다.** 판정은 DB 기준, 화면에 "필드 값이 앱 기록과 다름" 표시, 관리자 "다시 맞추기" 버튼 | 자동 복원(우리 필드라 고객 데이터는 아니다) | §4.4, §D.5 |
| SW-4 | "3월은 4월부터" 규칙을 어떻게 표현하나 | 새 정책 키 **월 마감일**(다음 달 N일 0시부터 잠금, 0 = 끔) | 기존 "자동 마감 일수"의 의미를 넓힌다. 기존 값의 뜻이 바뀌므로 권하지 않는다 | §2, §C |
| SW-5 | 기간 창 적용 범위 | **모든 이슈**(연동 조건 제거). 작성 기간 값이 있으면 적용 | 지금처럼 워크포스 연동 이슈만 | §4.1, §D |
| SW-6 | 워크포스가 이슈별 작성 기간을 어떻게 아나 | 이슈 필드 값을 직접 읽는다. 통제 문서(`ctl`)에는 필드 id·월 마감일·대체 규칙만 싣는다 | 통제 문서의 이슈 단위 문서에 값까지 싣는다(값 있는 이슈마다 프로퍼티 쓰기) | §6, §E.4 |
| SW-7 | 작성 기간을 직접 고칠 수 있는 사람 | 그 프로젝트 관리자(기존 이슈 정책 저장과 같은 권한 축) | 앱 관리자만 | §B |
| SW-8 | 작성 기간을 줄여서 밖에 남게 된 기존 기록 | 수정·삭제도 막는다(기존 기간 창 규칙과 같다) | 삭제만 허용 | §2 예 13 |
| SW-9 | 작성 예외 허가를 줄 수 있는 사람 | 앱 관리자만 | 프로젝트 관리자도 | §B |
| SW-10 | Q137 두 단계 재개방의 구현 | 별도 slug(`period-reopen-levels`)로 구현한다. 이 설계는 "어떻게 합쳐지나"만 정한다 | 이 slug 에 포함 | §2, §4.2 |

---

## 1. 필드 두 묶음

### 승인 일정 (승인 시작일 / 승인 종료일)

이슈의 일을 언제 하기로 승인받았는지다. Jira 기본 Start date·Due date 와 비슷하다. 하지만 그 둘은 이슈 편집 권한이 있으면 누구나 바꾼다. 승인 일정은 우리 앱만 바꾼다.

- 바꾸는 길은 **필드 변경 승인** 하나다. 요청 → 결재 → 최종 승인 → 앱이 DB 와 필드에 같이 쓴다.
- 처음 비어 있을 때만 관리자가 직접 넣을 수 있다(SW-2). 수백 개 이슈를 하나하나 결재받게 하면 도입이 안 되기 때문이다.
- 승인된 뒤 Jira 기본 Start date·Due date 도 맞춰 줄지는 규칙마다 고른다(기본 끔). 켜면 최종 결재자 권한으로 기본 필드를 고친다. 실패해도 승인 일정은 그대로다.
- 기본 일정과 승인 일정이 다르면 이슈 화면에 "기본 일정과 다름"을 표시한다. 되돌리지는 않는다.

### 워크로그 작성 기간 (작성 시작일 / 작성 종료일)

이 이슈에 어느 날짜의 일을 적을 수 있는지다.

- 관리자가 직접 바꿀 수 있다. 사유를 꼭 적게 하고 기록을 남긴다.
- 관리자가 아닌 사람은 필드 변경 승인으로 요청한다. 프로젝트에 그 규칙이 있을 때만 된다.
- 한쪽만 넣을 수도 있다. "4월 1일부터"만 넣으면 끝이 열린다.
- 둘 다 비어 있으면 이 칸은 아무것도 막지 않는다. 단, 정책 "작성 기간이 없으면 승인 일정으로 제한"이 켜져 있으면 승인 일정을 대신 쓴다.

### 왜 우리 DB 가 원본인가

필드 값은 Jira 가 보관한다. 우리 앱만 쓸 수 있다는 것은 공식 문서에 적혀 있다. 하지만 대량 편집·CSV 가져오기·자동화 같은 경로는 문서에 언급이 없다(§J). 그래서 판정은 DB 로 하고, 필드는 사람이 보는 사본으로 둔다. 필드가 어긋나면 표시하고, 관리자가 다시 맞춘다.

---

## 2. 워크로그 작성 기간 결정 규칙

### 기본 원칙 세 줄

1. **여러 관문을 모두 통과해야 쓸 수 있다.** 어느 하나라도 막으면 막힌다. 한 관문이 다른 관문을 "넓혀 주는" 일은 없다.
2. **예외는 자기 관문만 푼다.** 재개방은 마감을 풀 뿐 작성 기간을 넓히지 않는다. 작성 기간을 넓혀도 승인된 기간은 그대로 잠겨 있다.
3. **고치기와 지우기는 원래 날짜도 본다.** 3월 기록을 4월로 옮기는 수정은 3월과 4월이 둘 다 열려 있어야 한다. 그렇지 않으면 닫힌 달의 기록을 열린 달로 "빼내서" 잠금을 피할 수 있다.

날짜는 모두 **사이트 타임존**(정책 `timeZone`, 기본 Asia/Seoul) 기준의 작업 날짜다. 새로 적기는 새 날짜만, 고치기는 원래 날짜와 새 날짜를, 지우기는 원래 날짜를 본다.

### 우선순위 표

검사 순서대로다. 화면 메시지는 처음 걸린 관문의 것을 보여 준다.

| 순서 | 관문 | 무엇을 보나 | 막는 것 | 풀 수 있는 것 | 풀지 못하는 것 |
|---|---|---|---|---|---|
| 0 | 본인·처리 중 | 내 기록인가, 앱이 그 기록을 처리 중인가 | 남의 기록, 처리 중인 기록 | — | — |
| 1 | **이슈 작성 기간** | 작업 날짜가 [작성 시작일, 작성 종료일] 안인가. 둘 다 비었고 대체 정책이 켜져 있으면 [승인 시작일, 승인 종료일] | 작성·수정·삭제 | 작성 기간 자체를 바꾸기(관리자·승인) | 재개방, 작성 예외 허가, 정책 덮어쓰기 |
| 2 | 인증 잠금 | 팀장이 인증한 기록인가 | 수정·삭제 | "수정까지 허용" 재개방(인증 해제) | 그 밖 전부 |
| 3 | 기간 마감 | 그 날짜가 마감된 기간인가(관리자 마감, 자동 마감) | 작성·수정·삭제 | 재개방("새 입력 허용" 이상), 작성 예외 허가(그 이슈만) | 작성 기간 변경 |
| 4 | 제출·승인 잠금 | 내 타임시트가 그 기간에 결재 중이거나 승인됐나 | 결재 중: 작성·수정·삭제(정책 `lockSubmittedPeriod`). 승인: 수정·삭제는 늘, 작성은 재개방 전까지 | 결재 중은 회수·반려. 승인은 "수정까지 허용" 재개방. 승인된 기간의 **새 작성**만은 "새 입력 허용" 재개방 | 작성 예외 허가, 작성 기간 변경 |
| 5 | **월 마감일** (신규) | 작업 날짜가 속한 달의 "다음 달 N일 0시"가 지났나 | 작성·수정·삭제 | 이슈·프로젝트 정책 덮어쓰기(워크포스가 잠그지 않았을 때), 재개방, 작성 예외 허가 | 작성 기간 변경 |
| 6 | 상대 일수 정책 | 과거 날짜 한도, 미래 날짜, 작성 후 N일 수정·삭제 한도 | 정책 `violationAction` 이 BLOCK 이면 막음, WARN 이면 경고만 | 정책 덮어쓰기 | — |

관문 2·3·4 는 지금도 있다. 관문 1 은 기준만 바뀐다. 관문 5 가 새로 생긴다. 관문 4 의 "승인된 기간에 새 작성"은 Q137 두 단계 재개방이 구현될 때 함께 바뀐다(SW-10). 지금 코드는 승인된 기간이면 새 작성도 막는다.

### 단계별 정책: 전체 → 프로젝트 → 이슈

- 월 마감일, 대체 규칙("작성 기간이 없으면 승인 일정으로"), 상대 일수 정책은 기존 정책 계층을 그대로 탄다. 이슈 값이 있으면 이슈 값, 없으면 프로젝트 값, 없으면 전체 값이다.
- 워크포스가 정책을 잠갔으면 더 느슨하게 덮어쓸 수 없다(기존 규칙). 더 엄하게는 된다.
- 작성 기간 날짜 자체는 정책이 아니라 **이슈 값**이다. 상속되지 않는다.

### 예시

공통 가정: 사이트 타임존 Asia/Seoul, 타임시트 단위는 월. 오늘 날짜는 예시마다 적었다.

**예 1. 3월 것을 4월에 고치려 할 때 (월 마감일 = 1)**
프로젝트 A 의 월 마감일이 1이다. "다음 달 1일 0시부터 잠금"이라는 뜻이다. 철수가 4월 10일에 3월 20일 기록을 고치려 한다. 관문 5에서 막힌다. 화면에는 "3월 기록은 4월 1일에 마감됐습니다"가 나온다. 4월 기록은 계속 고칠 수 있다.

**예 2. 같은 상황, 월 마감일 = 6**
"다음 달 6일 0시부터 잠금"이다. 4월 5일 23시 59분까지는 3월 기록을 고칠 수 있다. 4월 6일 0시부터 막힌다. 달마다 마감 처리를 하지 않아도 계산으로 막힌다. 기록 행도 생기지 않는다.

**예 3. 이슈 작성 기간이 비어 있을 때**
A-30 은 작성 기간이 비어 있고 대체 정책도 꺼져 있다. 관문 1은 아무것도 막지 않는다. 나머지 관문(마감·승인·월 마감일·상대 일수)만 본다. 지금까지의 Jira 와 같은 동작이다.

**예 4. 작성 기간은 비었지만 승인 일정이 있을 때**
A-31 은 작성 기간이 비었고 승인 일정이 3월 2일~3월 27일이다. 프로젝트 정책 "작성 기간이 없으면 승인 일정으로 제한"이 켜져 있다. 3월 30일 날짜로 적으려 하면 관문 1에서 막힌다. "이 이슈는 3월 2일~3월 27일 작업만 적을 수 있습니다(승인 일정 기준)." 대체 정책이 꺼져 있으면 막히지 않는다. 승인 일정까지 비어 있어도 막히지 않는다.

**예 5. 프로젝트는 허용인데 이슈 작성 기간이 막을 때**
프로젝트 B 는 월 마감일이 0(끔)이다. 정책상 언제든 적을 수 있다. 그런데 B-7 의 작성 기간이 3월 1일~3월 15일이다. 3월 20일 날짜는 관문 1에서 막힌다. 프로젝트 정책은 작성 기간을 넓혀 주지 않는다.

**예 6. 반대로 이슈 작성 기간은 넓은데 프로젝트가 막을 때**
C-8 의 작성 기간이 1월 1일~12월 31일이다. 프로젝트 C 의 월 마감일은 1이다. 4월 10일에 3월 날짜로 적으려 하면 관문 5에서 막힌다. 작성 기간이 넓다고 마감이 풀리지 않는다.

**예 7. 이 이슈만 예외로 열어 줄 때 (이슈 정책 덮어쓰기)**
프로젝트 A 의 월 마감일은 1이다. 하지만 장기 유지보수 이슈 A-99 는 월 마감일을 0으로 덮어썼다. A-99 에만은 4월에도 3월 기록을 적을 수 있다. 단, 3월 타임시트가 승인된 사람은 관문 4에서 여전히 막힌다. 워크포스가 이 프로젝트의 월 마감일을 잠갔다면 이 덮어쓰기는 저장할 때 거부된다.

**예 8. 특정 이슈의 특정 기간만 열어 줄 때 (작성 예외 허가)**
3월이 마감됐다. 그런데 감사 대응 때문에 A-12 에만 3월 1일~3월 31일 작업분을 4월 20일까지 적게 해 줘야 한다. 앱 관리자가 "작성 예외 허가"를 만든다. 이슈, 작업 날짜 범위, 허가 기한, 사유를 넣는다. A-12 에서만 관문 3·5 가 풀린다. 다른 이슈, 승인·인증 잠금, 작성 기간은 그대로다. 4월 20일이 지나면 효력이 저절로 끝난다.

**예 9. 재개방 "새 입력 허용"과의 관계**
관리자가 3월을 "새 입력 허용"으로 재개방했다. 3월 날짜에 대해 관문 3(마감)과 관문 5(월 마감일)가 풀린다. 그래서:
- 아직 결재하지 않은 사람의 3월 기록은 새로 적고, 고치고, 지울 수 있다.
- 3월이 승인된 영희도 새 기록은 적을 수 있다. 그 기록은 "승인 이후 추가분"으로 표시되고 정산에 들어가지 않는다. 다시 승인받아야 들어간다.
- 영희의 이미 승인된 3월 기록은 고칠 수 없다(관문 4).
- 작성 기간 밖 날짜는 여전히 막힌다(관문 1).

**예 10. 재개방 "수정까지 허용"과의 관계**
관리자가 사유를 적고 3월을 "수정까지 허용"으로 재개방했다. 화면에 "승인 12건·인증 40건이 해제됩니다" 경고가 먼저 나온다. 그 기간의 승인과 인증이 풀리고, 숨겼던 기록이 다시 보인다. 이제 영희도 3월 기록을 고칠 수 있다. 고친 뒤에는 다시 승인·인증을 받아야 한다. 이때도 작성 기간 밖으로 날짜를 옮기는 수정은 막힌다(관문 1).

**예 11. 승인 잠금과의 관계**
월 마감일은 꺼져 있고, 작성 기간 안이고, 마감도 안 된 상태다. 그래도 민수의 3월 타임시트가 승인됐으면 민수는 3월 기록을 고치거나 지울 수 없다. 승인 잠금은 정책 설정과 무관하다(worklog-control 결정). 민수가 결재 중(제출 상태)이고 정책 `lockSubmittedPeriod` 가 켜져 있으면 새 작성도 막힌다. 회수하면 풀린다.

**예 12. 날짜를 옮기는 수정**
A-12 의 작성 기간은 3월 2일~4월 3일이고, 월 마감일은 6이다. 4월 7일에 3월 31일 기록을 4월 2일로 옮기려 한다. 새 날짜 4월 2일은 괜찮다. 하지만 원래 날짜 3월 31일이 이미 닫혔다. 막힌다. 반대로 4월 2일 기록을 4월 5일로 옮기려 하면 새 날짜가 작성 기간 밖이라 막힌다.

**예 13. 작성 기간을 줄였을 때 남은 기록**
처음 작성 기간이 3월 1일~3월 31일이었고, 3월 25일 기록이 있다. 관리자가 작성 기간을 3월 1일~3월 20일로 줄였다. 3월 25일 기록은 이제 수정도 삭제도 막힌다(SW-8 기본 가정). 잘못 들어간 기록이면 관리자가 작성 기간을 잠깐 넓혀서 처리하고 다시 줄인다. 두 변경 모두 이력에 남는다.

**예 14. 워크포스 탭에서 쓸 때**
워크포스 연동 이슈에서 철수가 워크포스 탭으로 시간을 적는다. 워크포스는 승인 앱이 보낸 통제 문서(필드 id·월 마감일·대체 규칙)와 이슈의 작성 기간 필드 값을 읽어 **미리** 막고 안내한다. 그래도 규칙을 벗어나 적힌 기록은 승인 앱이 "다른 경로 입력"으로 표시하고 정산에서 뺀다(기존 통제 동작). 수정·삭제 버튼은 승인 앱 화면으로 넘긴다(기존 Q121 결정).

**예 15. 작성 기간 변경 요청이 결재 중일 때**
A-12 의 작성 기간을 4월 10일까지 늘려 달라는 요청이 결재 중이다. 결재가 끝나기 전에는 **지금 값**(4월 3일까지)으로 판정한다. 요청한 값으로 미리 열어 주지 않는다.

**예 16. 앱 기록을 못 읽었을 때**
DB 조회가 실패하면 "잠시 후 다시 시도하세요"로 막는다. 모르는 상태에서 열어 주지 않는다(기존 fail-close 원칙). 단, 업그레이드 직후 표가 아직 없으면 값이 들어간 적도 없다. 이때는 "작성 기간 없음"으로 본다.

**예 17. 누군가 대량 편집으로 필드를 바꿨을 때**
Jira 대량 편집으로 A-12 의 작성 종료일 필드가 4월 30일로 바뀌었다고 하자(실제로 가능한지는 미검증). 판정은 DB 값 4월 3일로 한다. 이슈 화면에 "필드 값이 앱 기록과 다릅니다"가 뜬다. 관리자가 "다시 맞추기"를 누르면 필드가 4월 3일로 돌아간다. 앱이 혼자 되돌리지는 않는다(SW-3).

---

## 3. 승인 일정이 바뀌는 흐름

1. 요청자가 이슈 화면의 "일정·작성 기간" 칸에서 "승인 일정 변경 요청"을 누른다.
2. 새 시작일·종료일을 넣는다. 결재선은 프로젝트의 필드 변경 규칙에서 온다. 규칙이 없으면 버튼이 비활성이고 "이 프로젝트에는 승인 일정 변경 규칙이 없습니다"가 나온다.
3. 결재가 끝나면 앱이 요청 당시 값과 지금 DB 값을 비교한다. 같으면 새 값을 쓴다. 다르면(그 사이 다른 변경이 먼저 반영됨) 충돌로 남기고 쓰지 않는다. 기존 필드 변경 승인의 충돌 규칙과 같다.
4. DB 에 쓴 뒤 Jira 필드에도 쓴다. 필드 쓰기가 실패해도 승인 결과는 그대로다. 필드는 나중에 다시 맞춘다(일일 작업).
5. 규칙에서 "기본 일정도 맞추기"를 켰다면, 최종 결재자 권한으로 Jira 기본 Start date·Due date 도 고친다. 실패하면 "기본 일정 동기화 실패"로 보이고 다시 시도 버튼이 생긴다.
6. 모든 변경은 이슈의 변경 이력과 감사 기록에 남는다. 누가, 언제, 어떤 경로(직접·첫 값·승인·다시 맞추기)로, 무엇에서 무엇으로 바꿨는지다.

작성 기간 변경 요청도 같은 흐름이다. 다만 관리자는 결재 없이 바로 바꿀 수 있다. 관리자가 바로 바꾸면 결재 중이던 요청은 "값이 바뀌어 만료"된다.

---

## 4. 기존 기능과 어떻게 맞물리나

### 4.1 지금의 "이슈 기간 창"

worklog-control 에서 만든 기간 창은 이슈의 Jira Start date~Due date 로 막는다. 워크포스 연동 이슈에서만 켜진다. 이번에 이렇게 바꾼다.

- 기준을 우리 작성 기간(DB)으로 바꾼다. 대체 규칙이 켜져 있으면 승인 일정이다.
- 정책 키 이름 `worklogDateWindow` 는 그대로 두고 뜻만 바꾼다. 새 뜻은 "작성 기간이 비었으면 승인 일정으로 제한"이다. 워크포스 계약 사본(WF-11)이 이 키를 이미 알고 잠글 수 있기 때문에 이름을 유지한다. 이 커밋(01e7441)은 아직 운영 배포 전이라 뜻을 바꾸는 비용이 작다.
- 연동 조건을 뗀다(SW-5). 작성 기간 값이 있는 모든 이슈에 적용된다.
- Start date 필드 매핑(`issueStartDateField`)은 남긴다. 용도만 "Jira 기본 일정과 비교·동기화"로 바뀐다. 매핑이 없으면 Due date 만 비교한다.
- 기간 창을 켤 때 요구하던 관문 G_FIELD(Start date 필드 검증)는 필요 없어진다. 대신 새 관문 G_APPFIELD(우리 필드가 정말 읽기 전용인지)를 둔다. G_APPFIELD 는 **판정에 필요한 관문이 아니다.** 판정은 DB 로 하므로 관문 통과 전에도 작성 기간은 동작한다. 이 관문은 "필드를 사람이 보는 공식 값으로 안내해도 되는가"를 정한다.

### 4.2 기간 마감·재개방

- 사이트 단위 마감·재개방(`approval_period_close`)은 그대로다.
- 월 마감일은 계산으로만 막는다. 마감 행을 만들지 않는다.
- 재개방 행(REOPENED)이 그 날짜를 덮으면 월 마감일도 풀린다. 마감 행(CLOSED)이 덮으면 그 행이 이긴다.
- 타임시트 단위가 주여도 월 마감일은 달력의 월 기준이다. 주 단위 재개방 행이 그 날짜를 덮으면 풀린다.
- Q137 두 단계 재개방은 별도 slug 에서 구현한다(SW-10). 이 설계는 §2 표의 관문 3·4 에서 "새 입력 허용"과 "수정까지 허용"이 각각 무엇을 푸는지만 고정한다.

### 4.3 필드 변경 승인

- 승인 엔진(상태 머신)은 고치지 않는다. 대상 종류 `FIELD_CHANGE` 를 그대로 쓰고, 필드 자리에 **가상 필드 id** 두 개를 둔다. `appschedule`(승인 일정)과 `appentrywindow`(작성 기간)다. 열린 요청 하나 규칙도 그대로다(`FIELD_CHANGE:{issueId}:appschedule`).
- 값은 시작·종료 한 쌍이라 새 유형 `DATE_RANGE` 를 둔다. 저장 형식은 `2026-03-02/2026-03-27` 이다. 한쪽이 비면 `/2026-03-27` 처럼 쓴다.
- 적용만 다르다. 일반 필드는 최종 결재자 권한으로 Jira 에 쓴다. 앱 필드는 앱만 쓸 수 있으므로 DB 를 고친 뒤 앱 권한으로 필드에 쓴다. 이것이 새 asApp 사유다(§F.3).
- Q90 답(적용 실패 시 앱 권한 재시도 옵션)과는 별개다. 앱 필드는 처음부터 앱 권한 하나뿐이다.

### 4.4 우리 필드가 다른 경로로 바뀌었을 때

이미 구독 중인 이슈 변경 트리거가 우리 필드의 변경 기록을 본다. 앱이 쓴 것이 아니면 "어긋남"으로 표시하고 이력에 남긴다. 되돌리지는 않는다(SW-3). 관리자가 "다시 맞추기"를 누르면 DB 값으로 필드를 다시 쓴다. 판정은 처음부터 DB 기준이라 어긋나 있는 동안에도 안전하다.

---

## 5. 관리 화면

| 어디 | 누가 | 무엇 |
|---|---|---|
| 앱 설정 › 타임시트 › 워크로그 정책 | 앱 관리자 | 전체 정책: 월 마감일, "작성 기간이 없으면 승인 일정으로 제한", 기존 상대 일수 |
| 앱 설정 › 타임시트 › 워크로그 통제 | 앱 관리자 | 앱 필드 상태(필드 번호·화면 배치 안내·JQL 예시·관문 G_APPFIELD 기록), Start date 비교용 매핑(선택) |
| 앱 설정 › 타임시트 › 작성 예외 허가 | 앱 관리자 | 이슈×작업 날짜 범위×기한×사유 목록·추가·회수 |
| 프로젝트 설정 › Moves Approval | 프로젝트 관리자 | 프로젝트 정책 덮어쓰기(기존 화면에 새 키), 필드 변경 규칙에 "승인 일정"·"작성 기간" 선택지 |
| 이슈 › Moves Approval 칸 | 이슈 열람자 | 승인 일정·작성 기간·기본 일정 비교, 변경 요청, 변경 이력 |
| 이슈 › Moves Approval 칸 | 프로젝트 관리자 | 작성 기간 직접 변경(사유 필수), 승인 일정 첫 값, 이슈 정책 덮어쓰기(기존), 필드 다시 맞추기 |

Jira 쪽에서 관리자가 할 일은 하나다. **필드를 이슈 화면에 배치**한다. 읽기 전용 필드는 화면에 넣어야 이슈 보기에 나타난다(공식 문서). 만들기·전환 화면에는 원래 나오지 않는다. 앱 설정 화면에 이 안내와 JQL 예시를 보여 준다.

---

## 6. 워크포스와의 관계

- 워크포스는 판정하지 않는다. 미리 보여 주고 막는 데만 쓴다.
- 승인 앱이 게시하는 통제 문서 `movesApproval.ctl` 에 새 묶음 `ew` 를 싣는다. 우리 필드 네 개의 Jira 필드 id 와, 그 프로젝트(또는 이슈 덮어쓰기)의 월 마감일이다. 대체 규칙은 기존 `dw` 칸이 새 뜻으로 그대로 실어 나른다.
- 이슈별 날짜 값은 워크포스가 이슈를 읽을 때 필드에서 같이 읽는다(SW-6). 필드는 우리 앱만 쓰므로 표시용으로 충분하다. 값이 있는 이슈마다 문서를 따로 쓰는 비용도 없다.
- 기간 마감·승인 잠금은 이미 워크포스로 가는 연도 문서(`cl`·`lk`)에 있다.
- 워크포스 DB 는 늘지 않는다.

---

# 부록 — 구현 계약

여기부터는 `feature-design` 규약 구조를 따른다(§A = 규약 1장 … §K = 규약 11장).

## A. 개요·영향 범위 (규약 §1)

| 영역 | 변경 |
|---|---|
| 도메인(순수) | 신규 `src/domain/schedule/{range,entryWindow,mismatch,log}.js`. 가산 `domain/timesheet/lock.js`(월 마감일·허가), `domain/worklogPolicy/catalog.js`(`monthlyCloseDay`, `worklogDateWindow` 주석), `domain/worklogControl/rules.js`(연동 조건 제거·BlockCode), `domain/worklogControl/window.js`(쓰기 경로 상태 축소), `domain/fieldChange/{fieldType,fieldValue}.js`(`DATE_RANGE`). `domain/approval/scopeKey.js` 는 가상 필드 id 가 기존 `FIELD_ID` 정규식(`[a-z][a-z0-9]{0,31}`)에 이미 맞아 변경 없음 |
| resolver | 신규 10(§B.1), 변경 9(§B.2) |
| 서비스 | 신규 `src/resolver/schedule/*`(§D.1). 변경: `WorklogControlContext`(창 원천), `WorklogService`(월 마감일·허가 재료), `PeriodLockService`(재료), `FieldChangeService`·`FieldChangeApplier`·`IssueFieldReader`(가상 필드 분기), `WorklogControlCtl`(`ew`), `WorklogControlService`·`WorklogPolicyService`(관문 교체), `WorklogControlDiagnostics`(G_APPFIELD), `onIssueChanged`(어긋남 감지), `runSweep`(조건부 push), `onInstall`(필드 id 발견) |
| 스키마 | v061~v065(§E) |
| manifest | `jira:customField` 4개, scope `write:app-data:jira`(권장 scope — 미검증 S9) |
| 엔트리 | 추가 없음. `issue`(칸 추가), `settings`(섹션 2), `projectSettings`(규칙 선택지·정책 키), `worklog`(창 표시) |
| i18n | 신규 `schedule.json`, 가산 `worklogPolicy`·`worklogControl`·`worklog`·`fieldChange`·`error`·`audit` |
| 워크포스 | `ctl` 본문 `ew` 추가, `monthlyCloseDay` 카탈로그 사본, `worklogDateWindow` 뜻 변경 안내(§K.4) |
| 문서(구현 회차) | AGENTS asApp 신규 항목(§F.3), CLAUDE.md 플랫폼 표(관문 결과 뒤), DESIGN.md §2.0 |

**scopeKey**: 새 결재 대상 없음. 필드 변경 승인 `FIELD_CHANGE:{issueId}:appschedule` / `FIELD_CHANGE:{issueId}:appentrywindow`. 열린 요청은 이슈×묶음당 하나(불변식 1). 승인 일정과 작성 기간은 서로 다른 요청으로 동시에 열릴 수 있다.

## B. 경계면 계약 (규약 §2)

공통: 날짜는 `'YYYY-MM-DD'|null`. `Range = {start:string|null, end:string|null}`. `rev` 는 `issue_schedule.rev`(행이 없으면 null).

`ScheduleView` =
```
{ issueId, projectId,
  schedule:    Range & { updatedAt:number|null },
  entryWindow: Range & { updatedAt:number|null },
  effectiveWindow: { status:'OK'|'READ_FAILED'|'INVALID', start, end, source:'ENTRY'|'SCHEDULE'|null, timeZone } | null,  // null = 제한 없음
  jiraDates: { start:string|null, due:string|null, startKnown:boolean } | null,   // 읽기 실패면 null
  mismatch:  { schedule:boolean, which:Array<'start'|'end'> },
  fieldSync: { state:'SYNCED'|'PENDING'|'FAILED'|'DRIFT', at:number|null } | null, // 행이 없으면 null
  pending:   { schedule:string|null, entryWindow:string|null },                    // 열린 요청 id
  can: { editEntryWindow, seedSchedule, requestSchedule, requestEntryWindow, resync }, // 전부 boolean
  rev: number|null }
```

### B.1 신규 resolver

| resolver | 권한 축 | 입력 | 응답 shape (success) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getIssueSchedule` | `{issue:'view', issueIdKey:'issueId'}` | `{issueId}` | `{item: ScheduleView}` | `INVALID_TARGET` | 이슈 칸 `IssueScheduleSection` |
| `setIssueEntryWindow` | `{project:'admin', projectIdKey:'projectId'}` | `{projectId, issueId, start, end, rev, reason}` | `{item: ScheduleView, expiredRequestId:string\|null}` | `SCHEDULE_RANGE_INVALID`·`SCHEDULE_REASON_REQUIRED`·`SCHEDULE_ISSUE_PROJECT_MISMATCH`·`CONCURRENT_MODIFICATION`·`STORAGE_NOT_READY` | 이슈 칸 작성 기간 모달 |
| `seedIssueSchedule` | `{project:'admin', projectIdKey:'projectId'}` | `{projectId, issueId, start, end, reason}` | `{item: ScheduleView}` | `SCHEDULE_ALREADY_SET`·`SCHEDULE_RANGE_INVALID`·`SCHEDULE_REASON_REQUIRED`·`SCHEDULE_ISSUE_PROJECT_MISMATCH` | 이슈 칸 첫 값 모달 |
| `resyncIssueScheduleField` | `{project:'admin', projectIdKey:'projectId'}` | `{projectId, issueId}` | `{fieldSync}` | `APP_FIELD_UNAVAILABLE`·`APP_FIELD_WRITE_FAILED`·`SCHEDULE_ISSUE_PROJECT_MISMATCH` | 이슈 칸 어긋남 배지 |
| `listIssueScheduleLog` | `{issue:'view', issueIdKey:'issueId'}` | `{issueId, cursor?}` | `{items:[{logId, kind:'SCHEDULE'\|'ENTRY', source:'SEED'\|'ADMIN'\|'APPROVAL'\|'FIELD_DRIFT'\|'RESYNC', from:Range, to:Range, actorKey, actorDisplayName, requestId, reason, at}], nextCursor:string\|null}` | `INVALID_TARGET` | 이슈 칸 이력 펼침 |
| `listEntryGrants` | `{admin:true}` | `{issueId?, state?:'ACTIVE'\|'ALL', cursor?}` | `{items:[EntryGrant], nextCursor}` | `INVALID_TARGET` | 설정 › 작성 예외 허가 |
| `saveEntryGrant` | `{admin:true}` | `{issueId, workFrom, workTo, until:number, reason}` | `{item: EntryGrant}` | `ENTRY_GRANT_INVALID`·`SCHEDULE_REASON_REQUIRED`·`INVALID_TARGET` | 같음 |
| `revokeEntryGrant` | `{admin:true}` | `{grantId, rev}` | `{item: EntryGrant}` | `ENTRY_GRANT_NOT_ACTIVE`·`CONCURRENT_MODIFICATION` | 같음 |
| `getAppFieldStatus` | `{admin:true}` | `{}` | `{fields:[{key, fieldId\|null, name\|null}], discoveredAt\|null, gate:{result, recordedAt\|null}, jqlExamples:[{key, clause}]}` | — | 설정 › 워크로그 통제 |
| `refreshAppFields` | `{admin:true}` | `{}` | 위와 같음 | `APP_FIELD_UNAVAILABLE` | 같음 |

`EntryGrant = {grantId, issueId, issueKey|null, projectId, workFrom, workTo, until, reason, state:'ACTIVE'|'REVOKED'|'EXPIRED', createdBy, createdAt, revokedBy|null, revokedAt|null, rev}`. `EXPIRED` 는 저장값이 아니라 `state='ACTIVE' ∧ until <= now` 의 계산값이다. `saveEntryGrant` 검증: `workFrom<=workTo`, `until > now`, `until - now <= 180일`, 사유 1~500자.

**범위 재확인(불변식 7)**: `setIssueEntryWindow`·`seedIssueSchedule`·`resyncIssueScheduleField` 는 가드가 프로젝트만 본다. 그래서 Service 가 asUser `GET /issue/{issueId}?fields=project` 로 이슈의 프로젝트가 `projectId` 와 같은지 확인한다(`SCHEDULE_ISSUE_PROJECT_MISMATCH`). `listEntryGrants` 는 앱 관리자 전용이라 이슈 열람 재확인을 하지 않는다. 단 `issueKey` 는 asUser 일괄 조회로 보이는 것만 채운다. `listIssueScheduleLog` 의 `reason` 은 이슈 열람자에게 보인다(관리자가 쓰는 운영 사유 — 입력 화면에 "이슈를 볼 수 있는 사람에게 보입니다" 안내).

### B.2 변경 resolver (가산 — 기존 필드 의미 유지)

| resolver | 변경 |
|---|---|
| `getIssueWorklogs`·편집 컨텍스트 | `control.dateWindow` = `{status:'OK'\|'READ_FAILED'\|'INVALID', start, end, timeZone, source:'ENTRY'\|'SCHEDULE', fieldId:null}` 또는 null(제한 없음). `NO_FIELD`·`FIELD_UNVERIFIED` 는 쓰기 경로에서 더 이상 나오지 않는다(프론트는 모르는 상태를 미해결로 취급 — 기존 동작). 연동이 아닌 이슈에도 채운다. `lockRanges[]` 에 `reasonCode:'MONTH_CLOSED'`(계산 구간)와 `grant:{grantId, until}\|null` 가산 |
| `createWorklog`·`updateWorklog`·`deleteWorklog` | `WORKLOG_PERIOD_LOCKED` 의 `cause.reasonCode` 에 `'MONTH_CLOSED'` 가산, `cause.closeAt`(잠긴 시각) 가산. `WORKLOG_OUTSIDE_ISSUE_WINDOW` 의 `cause.source` 가산 |
| `getFieldChangeForm` | `fields[]` 에 `{fieldId:'appschedule'\|'appentrywindow', fieldType:'DATE_RANGE', current:Range, …}` |
| `createFieldChangeApproval` | `DATE_RANGE` 면 `value:{start,end}`. 같은 값이면 기존 `FIELD_CHANGE_NO_CHANGE` |
| `decideApproval`·`applyFieldChange` | 앱 필드면 `apply` 에 `fieldSync:{state}`, `jiraSync:{status:'OFF'\|'APPLIED'\|'FAILED'}\|null` 가산 |
| `listFieldChangeRules`·`saveFieldChangeRule` | 가상 필드 선택지, 규칙 `options:{mirrorJiraDates:boolean}`(appschedule 만) |
| `getWorklogPolicyCatalog`·프로젝트·이슈 정책 저장 | 새 키 `monthlyCloseDay`. `worklogDateWindow` 켜기의 관문 요구(G_FIELD) 제거 |
| `saveWorklogControlSettings` | `issueStartDateField` 는 선택(비교용). `worklogDateWindow` 켜기에 관문 요구 없음 |
| `getWorklogControlStatus` | `settings.startDateField.purpose:'COMPARE'`, `appFields` 요약 가산 |

### B.3 신규 에러 코드 (`ErrorCodes` + `locales/*/error.json`)

`SCHEDULE_RANGE_INVALID`(형식 오류·시작>종료) · `SCHEDULE_REASON_REQUIRED` · `SCHEDULE_ALREADY_SET` · `SCHEDULE_ISSUE_PROJECT_MISMATCH` · `APP_FIELD_UNAVAILABLE`(필드 id 미발견) · `APP_FIELD_WRITE_FAILED` · `ENTRY_GRANT_INVALID` · `ENTRY_GRANT_NOT_ACTIVE`.
기존 재사용: `WORKLOG_OUTSIDE_ISSUE_WINDOW`, `WORKLOG_WINDOW_UNRESOLVED`, `WORKLOG_PERIOD_LOCKED`, `CONCURRENT_MODIFICATION`, `STORAGE_NOT_READY`, `INVALID_TARGET`.

### B.4 프론트 호출 대응

| 화면 | 호출 | 분기 |
|---|---|---|
| `IssueScheduleSection` | `getIssueSchedule`, `listIssueScheduleLog`(펼칠 때) | `can.*` 로 버튼, `mismatch.schedule`·`fieldSync.state==='DRIFT'`·`pending` 배지 |
| 작성 기간 모달 | `setIssueEntryWindow` | `CONCURRENT_MODIFICATION` → 재조회 후 다시 |
| 첫 값 모달 | `seedIssueSchedule` | `SCHEDULE_ALREADY_SET` → 재조회 |
| 변경 요청 | 기존 `getFieldChangeForm` → `createFieldChangeApproval` | `DATE_RANGE` 편집기 |
| 작업 로그 탭·대화상자 | 기존 | `dateWindow.source` 문구, `MONTH_CLOSED` 문구 |
| 설정 섹션 | `listEntryGrants`·`saveEntryGrant`·`revokeEntryGrant`·`getAppFieldStatus`·`refreshAppFields` | |

## C. 도메인 (규약 §3) — 순수, now·timeZone 인자

### C.1 `src/domain/schedule/range.js`
```js
parseDateOnly(raw)      → 'YYYY-MM-DD' | null(빈 값) | false(형식 오류)  // window.js 의 dateOf 를 옮겨 공용화
normalizeRange({start, end}) → {ok:true, value:Range} | {ok:false, code:'SCHEDULE_RANGE_INVALID'}  // start>end 거부
encodeRange(range)      → 'S/E' (빈 쪽은 ''), 둘 다 비면 null
decodeRange(text)       → Range | null(형식 오류)
sameRange(a, b)         → boolean
```

### C.2 `src/domain/schedule/entryWindow.js`
```js
/** row: issue_schedule 행 또는 null. read: 'OK'|'FAILED'|'NO_TABLE'. fallbackToSchedule: 계층 정책 worklogDateWindow */
effectiveEntryWindow({ row, read, fallbackToSchedule, timeZone })
  → null                                                      // 제한 없음(행 없음·두 묶음 다 빔·NO_TABLE)
  | { status:'READ_FAILED', start:null, end:null, source:null, timeZone }
  | { status:'INVALID', start:null, end:null, source, timeZone }   // 저장값 손상(start>end, 형식)
  | { status:'OK', start, end, source:'ENTRY'|'SCHEDULE', timeZone }
```
규칙: 작성 기간 중 하나라도 값이 있으면 ENTRY. 둘 다 비었고 fallback 이면 승인 일정(그것도 비면 null). 포함 판정은 기존 `window.js` 의 `inWindow` 를 그대로 쓴다(경계 포함, 사전순 = 날짜순).

### C.3 `domain/timesheet/lock.js` 가산
```js
monthlyCloseAtOf(t, { day, timeZone }) → ms | null   // day 0 → null. t 의 현지 달의 다음 달 day일 00:00 (zonedMidnight — DST 안전)
grantCovers({ grants, workDate, now })  → grant | null // state ACTIVE ∧ until>now ∧ workFrom<=workDate<=workTo
evaluateWorklogLock({ ...기존, monthlyCloseDay = 0, grants = [] })
lockRangesOf({ ...기존, monthlyCloseDay = 0 })
```
`closedAt(t)` 계산 순서:
1. 덮는 행이 CLOSED → 마감(`PERIOD_CLOSED`). 허가가 덮으면 풀림.
2. 덮는 행이 REOPENED → 열림. 월 마감일도 열림.
3. 행 없음 → 자동 마감 계산과 월 마감일 계산 중 이미 지난 것(둘 다면 이른 쪽). 사유는 각각 `PERIOD_CLOSED`·`MONTH_CLOSED`. 허가가 덮으면 풀림.
본인 잠금(제출·승인)은 허가와 무관하게 그다음에 검사한다. 새 인자 기본값이 0·빈 배열이라 기존 호출부 결과는 그대로다.
`LockReason.MONTH_CLOSED` 추가. 결과에 `closeAt` 가산.
`lockRangesOf` 는 recentKeys 가 걸친 달마다 계산 구간을 `MONTH_CLOSED` 로 추가한다(마감 행과 겹치면 생략).

### C.4 `domain/worklogControl/rules.js` 변경
`judgeCreate`·`judgeMutation` 의 창 조건 `linked && dateWindowOn` → `window !== null && window !== undefined`. 인자 `linked`·`dateWindowOn` 은 호출부 정리 뒤 제거. 검사 순서(본인 → 처리 중 → 창 → 인증 → 잠금)는 그대로. `BlockCode.MONTH_CLOSED` 추가(프론트 툴팁 키와 1:1). `lockVerdict` 의 `BlockCode[lock.reasonCode]` 가 그대로 매핑된다.

### C.5 `domain/worklogControl/window.js`
`WindowStatus` 의 `NO_FIELD`·`FIELD_UNVERIFIED` 는 남긴다(Start date 비교 화면이 쓴다). 쓰기 판정 경로에서는 나오지 않는다. `dateWindowOf` 는 비교용으로 유지한다.

### C.6 `src/domain/schedule/mismatch.js`
```js
scheduleMismatch({ schedule:Range, jira:{start, due, startKnown}|null }) → { schedule:boolean, which:[] }
// jira null 이면 false. startKnown false 면 end↔due 만 비교. 승인 일정이 비었으면 false
```

### C.7 `src/domain/schedule/log.js`
```js
scheduleLogId({ issueId, kind, rev, source }) → 결정적 id(불변식 6)   // deterministicEventId 재사용, requestId=`schedule:{issueId}:{kind}`
driftLogId({ issueId, changelogId, fieldKey }) → 결정적 id           // 트리거 재전송 멱등
grantAuditId({ grantId, action, rev })        → 결정적 id
```

### C.8 `domain/fieldChange` 가산
`FieldType.DATE_RANGE`. 가상 필드 `appschedule`·`appentrywindow` 는 `fieldTypeOf` 가 아니라 상수 표로 `DATE_RANGE` 에 매핑한다. `parseInput('DATE_RANGE', {start,end})` → `normalizeRange` → `encodeRange`. `sameValue` 는 문자열 비교라 그대로 동작한다. `fromChangelogItem` 은 가상 필드에 쓰지 않는다(Jira changelog 에 없다).

### C.9 `domain/worklogPolicy/catalog.js`
```js
monthlyCloseDay:{type:'integer',min:0,max:28,default:0,strict:'limit'},   // 0=끔. 작을수록 엄함(1이 가장 엄함)
// worklogDateWindow: 주석만 변경 — "작성 기간이 비었으면 승인 일정으로 제한"
```
`strict:'limit'` 비교식(0 → -Infinity, 그 밖 -value)이 "작을수록 엄함, 0은 가장 느슨함"과 그대로 맞는다. 상한 28은 2월에도 존재하는 날짜까지라는 뜻이다.

### C.10 테스트 케이스
- range: 형식(2028-02-29 윤년, 2026-02-29, 13월, 빈 문자열), 시작>종료, 한쪽만, encode/decode 왕복
- entryWindow: 행 없음, 작성 기간 한쪽만, 둘 다 비고 fallback on/off, 승인 일정도 빔, FAILED, NO_TABLE, 손상 행
- monthlyCloseAtOf: day 1·6·28, 12월 → 다음 해 1월, DST 타임존(America/New_York 3월), 0
- evaluateWorklogLock: §2 예 1·2·7·8·9·11·12 를 그대로 케이스로(재개방 행 덮음, 마감 행 덮음, 허가 덮음, 허가 기한 지남, 주 단위 재개방 행), 기존 테스트 무변경 통과
- judgeCreate/judgeMutation: 비연동 이슈에도 창 적용, window null 이면 통과, 수정은 이전·새 날짜, 삭제는 이전 날짜(예 13), READ_FAILED 거부
- mismatch: startKnown false 면 end 만 비교, 승인 일정 빔
- catalog 계약 테스트: 정책 기본값 집합 = KVS 키 맵 집합(`monthlyCloseDay` 추가)

## D. 백엔드 (규약 §4)

### D.1 파일 배치
```
src/resolver/schedule/
  ScheduleController.js      guardedDefine 10개
  ScheduleService.js         조회·직접 변경·첫 값·이력·다시 맞추기
  ScheduleRepository.js      issue_schedule CAS, issue_schedule_log INSERT IGNORE
  EntryGrantService.js       허가 저장·회수·목록
  EntryGrantRepository.js
  AppFieldRegistry.js        필드 id 발견·KVS 캐시(approval:appFields)
  AppFieldWriter.js          asApp POST /rest/api/3/app/field/value (사유 'app-field-write')
  ScheduleFieldSync.js       큐 작업 'app-field-sync'
  ScheduleDriftDetector.js   onIssueChanged 분기
  ScheduleTargetBridge.js    FieldChangeApplier·IssueFieldReader 의 가상 필드 분기
```

### D.2 워크로그 쓰기 경로의 재료
- `WorklogControlContext.contextFor` 는 Start date 읽기 대신 `ScheduleRepository.findOne(issueId)`(invocation memo) → `effectiveEntryWindow`. 표 미준비는 `NO_TABLE`(null), SQL 예외는 `READ_FAILED`(거부). 연동 판정은 통제 행·LINKED_ALL 용으로만 계속 쓴다. `windowLinked` 칸은 제거한다(창 판정이 연동과 무관해졌다).
- `PeriodLockService.load` 에 `monthlyCloseDay`(계층 effective 값 — WorklogService 가 넘긴다)를 전달한다. 허가는 지연 조회한다. 먼저 허가 없이 판정하고, `PERIOD_CLOSED`·`MONTH_CLOSED` 로 막힐 때만 `EntryGrantRepository.findActive(issueId, now)` 를 1회 읽어 다시 판정한다. 평소 경로의 SQL 추가는 0이다.
- `checkPolicy` 의 `assertAuthority` 키 목록에 `monthlyCloseDay` 를 추가한다.
- 화면 사전 판정(`rangesFor`)도 같은 `monthlyCloseDay` 를 받는다. 이슈가 정해진 화면(작업 로그 탭)만 계층 값을 쓰고, 이슈가 없는 화면(내 타임시트)은 사이트 값을 쓴다(표시용 — 서버가 쓰기 때 다시 판정).

### D.3 직접 변경 (`setIssueEntryWindow`)
1. 사유 1~500자, `normalizeRange`.
2. asUser 로 이슈의 프로젝트 확인.
3. CAS. 입력 `rev` 가 null 이면 INSERT(행이 이미 있으면 `CONCURRENT_MODIFICATION`). 있으면 `UPDATE issue_schedule SET entry_start=?, entry_end=?, field_sync='PENDING', rev = rev + 1, updated_at=?, updated_by=? WHERE issue_id=? AND rev=?`.
4. 로그 INSERT IGNORE(`scheduleLogId`), 설정 감사(`settingsAuditRepository.record`, area `issueSchedule`).
5. 열린 `appentrywindow` 요청이 있으면 기존 만료 경로(`ExpiryReason.FIELD_CHANGED`)로 만료.
6. 필드 쓰기 1회 동기 시도(`AppFieldWriter`, 3초 상한). 성공하면 `field_sync='SYNCED', field_synced_rev=? WHERE issue_id=? AND rev=?`. 실패하면 PENDING 유지 + KVS 표식 `approval:appField:pending`.
7. 응답.

`seedIssueSchedule` 은 같은 흐름에 조건 `approved_start IS NULL AND approved_end IS NULL` 을 더한다(0행 → `SCHEDULE_ALREADY_SET`).

### D.4 승인 적용 (가상 필드)
`FieldChangeApplier` 의 순서(claim → 현재 값 → `planApply` → 쓰기 → finish)는 그대로다. 다른 점:
- 현재 값: `ScheduleTargetBridge.read(issueId, fieldId)` = DB 값의 `encodeRange`(known:true, 표 없음이면 빈 값).
- 쓰기: `UPDATE issue_schedule SET {approved|entry}_start=?, …_end=?, field_sync='PENDING', rev = rev + 1, … WHERE issue_id=? AND rev=? AND <해당 두 칸 = from>`. 행이 없으면 INSERT(from 이 빈 값일 때만). 값 조건까지 걸어 적용 사이의 변경을 충돌로 만든다. 0행이면 다시 읽어 `planApply` 를 한 번 더 탄다.
- 로그(APPROVAL, requestId) → 필드 동기 시도(D.3 6과 같다).
- 규칙 `options.mirrorJiraDates` 면 최종 결재자 asUser 로 `PUT /issue/{id}` `{duedate, [startField]}` 를 1회 보낸다. 결과는 `field_change_request.jira_sync` 에 남긴다. 실패는 승인·적용 결과를 바꾸지 않는다.
- 적용 주체가 앱이라 Q90 의 asUser 실패 분기(NO_PERMISSION 등)는 해당 없다. 필드 쓰기 실패는 `fieldSync` 로만 나타내고 `apply.status` 는 APPLIED 다(원본 DB 에는 반영됐다).

### D.5 어긋남 감지 (`onIssueChanged`)
기존 이슈 변경 트리거에서 changelog 항목의 `fieldId` 가 `AppFieldRegistry` 의 우리 필드 id 이고 작성자가 앱 계정이 아니면(판별 방법 미검증 S7):
- `UPDATE issue_schedule SET field_sync='DRIFT', field_sync_at=? WHERE issue_id=? AND field_sync <> 'DRIFT'`. rev 는 올리지 않는다(판정 값이 아니라 표시 상태다).
- `FIELD_DRIFT` 로그(`driftLogId`, 재전송 멱등).
- 되돌리지 않는다.
앱 필드 id 를 모르면(KVS 없음) 아무것도 하지 않는다. KVS 읽기만 하고 SQL 은 0이다. 기존 두 처리처럼 각자 try/catch 로 감싼다.
같은 트리거에서 이슈 프로젝트 이동(S10)이 보이면 `project_id` 를 갱신한다.

### D.6 큐 작업 `app-field-sync` (새 스케줄 없음)
- 일일 `approval-sweep` 의 fan-out 에서 KVS 표식 `approval:appField:pending` 이 있을 때만 push 한다.
- 작업: `SELECT … WHERE field_sync IN ('PENDING','FAILED') AND field_sync_tries < 5 ORDER BY updated_at LIMIT 200` → 필드별로 묶어 `POST /rest/api/3/app/field/value`(한 요청 최대 50 이슈 — 상한 미검증 S2) → 성공 행 `SYNCED WHERE rev = 읽은 rev`, 실패 행 `FAILED, tries+1`.
- 남은 행이 0이면 표식을 지운다. tries 5 이상은 관리자 화면에 "필드 동기화 반복 실패"로 보이고 "다시 맞추기"로만 재시도한다.
- 필드 id 발견도 이 작업과 `onInstall`(installed·upgraded) 트리거에서 asApp `GET /rest/api/3/field` 로 한다. `schema.custom` 이 `…/static/{moduleKey}` 로 끝나는 항목을 고른다(문서: 필드 유형 id = 확장 ARI, 미검증 S3).

### D.7 이미 커밋된 코드의 전환 (01e7441 영향)
| 파일 | 변경 |
|---|---|
| `WorklogControlContext.js` | 창 원천을 ScheduleRepository 로. `startDate` 의존·`windowLinked` 제거 |
| `rules.js` | C.4 |
| `WorklogService.js` | `judgeCreate`/`judgeMutation` 인자 정리, 월 마감일·허가 전달 |
| `StartDateField.js` | `windowOf` → 비교 전용 `jiraDatesOf`(`{start, due, startKnown}`). 후보·검증은 유지 |
| `WorklogControlService.js` | dateWindow 켜기 관문(G_FIELD·필드 verified) 제거, 상태 응답에 appFields |
| `WorklogPolicyService.js` | `dateWindowGuard` 제거 |
| `WorklogControlDiagnostics.js` | G_FIELD 는 비교 필드 확인으로 격하. G_APPFIELD 자동 항목: 표본 이슈에 asUser `PUT /issue` 로 우리 필드 쓰기 → 400 기대, 값 불변 확인 |
| `gates.js` | `G_APPFIELD: GateMode.BOTH` 추가(G_FIELD 는 기존 기록 호환을 위해 남김) |
| `WorklogControlCtl.js` | `sf` 는 계속 싣고(비교 필드 id), `ew` 가산 — §E.4 |
| 프론트 `windowPrecheck.js`·`WorklogDialog`·`WorklogTab`·`WorklogControlSettings` | §G |
| 테스트 | `rules.test`·`WorklogControlContext.test`·`WorklogServiceControl.test`·`WorklogControlCtl.test`·`WorklogControlService.test`·프론트 `worklogControlPure`·`WorklogDialog`·`WorklogTab`·`WorklogControlSettings` 갱신 |

### D.8 불변식 대조
| # | 대응 |
|---|---|
| 1 | 가상 필드 scopeKey 로 이슈×묶음당 열린 요청 하나 |
| 2 | 적용은 결정 뒤(기존 FieldChangeApplier 순서) |
| 3 | C 전부 now·timeZone 인자. 월 마감 시각은 zonedMidnight |
| 4 | issue_schedule·grant 의 상태 UPDATE 전부 `rev = rev + 1`. DRIFT 표시만 예외(판정 값이 아님) — 대신 `field_sync <> 'DRIFT'` 조건 |
| 5 | 승인자 행 무관 |
| 6 | 로그·감사·허가 id 결정적 |
| 7 | B.1 범위 재확인(이슈↔프로젝트, 허가 목록 이슈 키) |
| 8 | asApp 은 필드 쓰기·필드 목록 발견뿐. 쓰는 값은 DB 값, 결과(필드 id)는 메타데이터 |
| 9 | 판정은 DB. 필드·ctl 은 표시 사본 |
| 10 | 무관 |

## E. 스키마·마이그레이션 (규약 §5) — v060 다음

```sql
-- v061_create_issue_schedule
CREATE TABLE IF NOT EXISTS issue_schedule (
    issue_id           VARCHAR(32)  NOT NULL,
    project_id         VARCHAR(32)  NOT NULL,
    approved_start     CHAR(10)     NULL,
    approved_end       CHAR(10)     NULL,
    entry_start        CHAR(10)     NULL,
    entry_end          CHAR(10)     NULL,
    field_sync         VARCHAR(8)   NOT NULL DEFAULT 'PENDING',
    field_synced_rev   INT          NULL,
    field_sync_at      TIMESTAMP    NULL,
    field_sync_tries   INT          NOT NULL DEFAULT 0,
    updated_at         TIMESTAMP    NOT NULL,
    updated_by         VARCHAR(128) NULL,
    rev                INT          NOT NULL DEFAULT 1,
    PRIMARY KEY (issue_id),
    INDEX ix_issue_schedule_project (project_id, issue_id),
    INDEX ix_issue_schedule_sync (field_sync, updated_at)
)
```
날짜를 `DATE` 가 아니라 `CHAR(10)` 으로 둔다. 드라이버 변환과 타임존 해석을 피하고(SqlTime 경계 밖), 사전순이 곧 날짜순이다.

```sql
-- v062_create_issue_schedule_log
CREATE TABLE IF NOT EXISTS issue_schedule_log (
    log_id        VARCHAR(64)  NOT NULL,
    issue_id      VARCHAR(32)  NOT NULL,
    project_id    VARCHAR(32)  NOT NULL,
    kind          VARCHAR(8)   NOT NULL,
    source        VARCHAR(12)  NOT NULL,
    from_value    VARCHAR(24)  NULL,
    to_value      VARCHAR(24)  NULL,
    actor_key     VARCHAR(128) NULL,
    request_id    BINARY(16)   NULL,
    reason        VARCHAR(500) NULL,
    occurred_at   TIMESTAMP    NOT NULL,
    PRIMARY KEY (log_id),
    INDEX ix_schedule_log_issue (issue_id, occurred_at),
    INDEX ix_schedule_log_occurred (occurred_at)
)

-- v063_create_worklog_entry_grant
CREATE TABLE IF NOT EXISTS worklog_entry_grant (
    grant_id     VARCHAR(36)  NOT NULL,
    issue_id     VARCHAR(32)  NOT NULL,
    project_id   VARCHAR(32)  NOT NULL,
    work_from    CHAR(10)     NOT NULL,
    work_to      CHAR(10)     NOT NULL,
    until_at     TIMESTAMP    NOT NULL,
    reason       VARCHAR(500) NOT NULL,
    state        VARCHAR(8)   NOT NULL,
    created_by   VARCHAR(128) NOT NULL,
    created_at   TIMESTAMP    NOT NULL,
    revoked_by   VARCHAR(128) NULL,
    revoked_at   TIMESTAMP    NULL,
    rev          INT          NOT NULL DEFAULT 1,
    PRIMARY KEY (grant_id),
    INDEX ix_entry_grant_issue (issue_id, state, until_at)
)

-- v064_alter_field_change_rule_options
ALTER TABLE field_change_rule ADD COLUMN IF NOT EXISTS options_json VARCHAR(255) NULL

-- v065_alter_field_change_request_jira_sync
ALTER TABLE field_change_request ADD COLUMN IF NOT EXISTS jira_sync VARCHAR(8) NULL
```
- 값 집합: `kind` SCHEDULE|ENTRY, `source` SEED|ADMIN|APPROVAL|FIELD_DRIFT|RESYNC, `state` ACTIVE|REVOKED, `field_sync` SYNCED|PENDING|FAILED|DRIFT, `jira_sync` OFF|APPLIED|FAILED.
- `field_change_request` 의 기존 칸 크기로 충분하다: `field_type VARCHAR(12)` ← `DATE_RANGE`(10자), `from_value/to_value VARCHAR(128)` ← `S/E`(21자), `field_id VARCHAR(48)` ← 가상 id. 그 밖 ALTER 불필요.
- TIMESTAMP 칸 바인딩은 SqlTime 경계를 지킨다(숫자 바인딩 금지).
- SQL 추가 = major upgrade(`--approve MAJOR_VERSION_RULE`).
- 보관: `issue_schedule_log`·`worklog_entry_grant` 를 기존 기록 보관(record retention) 작업 대상에 넣는다. 계정 id 는 남긴다(Q138).
- 정책 KVS: `SettingsRepository` 키 맵·기본값에 `monthlyCloseDay`(`approval:settings:monthlyCloseDay`, 0). 두 집합이 어긋나면 정책 조회 전체가 죽는다(플랫폼 함정) — 계약 테스트로 대조.
- 상태 KVS: `approval:appFields`(`{discoveredAt, fields:{moduleKey:fieldId}}`), `approval:appField:pending`(동기화 표식).

### E.4 `movesApproval.ctl` 계약 가산
본문 `{vs, dw, sf, tz, vt, ui, gen, rev}` 에 **선택 키** `ew` 를 더한다.
```
ew: { f: { as: fieldId|null, ae: fieldId|null, ws: fieldId|null, we: fieldId|null }, mc: 0..28 }
```
- `dw` 의 뜻: "작성 기간이 비었으면 승인 일정으로 제한". `sf`: 비교용 Start date 필드(판정 무관).
- `mc`: 대상(P: 프로젝트 effective / I: 이슈 effective)의 월 마감일.
- `contract.js` validator: `optional(b.ew, …)` — 필드 id 는 `customfield_\d+` 또는 null, `mc` 는 정수 0~28. 벡터 1건 추가. 본문이 바뀌므로 업그레이드 때 `ctlRev` 를 올려 전부 재게시한다.
- 게시 조건(`bodyFor`) 보강: 지금은 "통제 OFF ∧ dw false 면 삭제"다. `mc>0` 이거나 앱 필드 id 를 알면 유지한다.
- 표시·넘김용이다. 워크포스는 이것으로 쓰기 허가를 판단하지 않는다(P0-2 그대로).

## F. Jira 연결 (규약 §6)

### F.1 manifest
```yaml
  jira:customField:
    - key: approved-start-date
      name: Approved start (Moves)
      description: Approved schedule start. Set only by Moves Approval.
      type: date
      readOnly: true
    - key: approved-end-date
      name: Approved end (Moves)
      description: Approved schedule end. Set only by Moves Approval.
      type: date
      readOnly: true
    - key: worklog-entry-start
      name: Worklog entry from (Moves)
      description: First work date that can be logged on this issue. Set only by Moves Approval.
      type: date
      readOnly: true
    - key: worklog-entry-end
      name: Worklog entry until (Moves)
      description: Last work date that can be logged on this issue. Set only by Moves Approval.
      type: date
      readOnly: true

permissions:
  scopes:
    write:app-data:jira: {}    # 앱 필드 값 API 의 권장 scope(곧 필수가 된다고 안내됨) — S9
```
**키는 영구다.** 워크포스 운영 기록에 "커스텀 필드 모듈 제거는 배포 파괴 위험"이 있다(`moves-workforce/src/resolver/gantt/GANTT.md:49`). 이름·키를 첫 배포 전에 확정한다.

### F.2 REST
| 호출 | 주체 | 언제 | 비고 |
|---|---|---|---|
| `POST /rest/api/3/app/field/value` `{updates:[{customField, issueIds:[…], value:'YYYY-MM-DD'\|null}]}` | asApp | 직접 변경·적용·다시 맞추기·동기 작업 | 필드를 선언한 앱만 쓸 수 있다(문서). `generateChangelog` 는 기본값 그대로 둔다(Jira 이력에도 남게). 대안: 워크포스가 쓰는 `PUT /rest/api/3/app/field/{fieldIdOrKey}/value`. 본문 정확한 형태는 S2 |
| `GET /rest/api/3/field` | asApp(트리거·큐) / asUser(설정 화면 새로고침) | 필드 id 발견 | |
| `GET /rest/api/3/issue/{id}?fields=project,duedate,{startField}` | asUser | 조회·범위 확인·비교 | 한 번에 묶는다 |
| `PUT /rest/api/3/issue/{id}` `{fields:{duedate, startField}}` | asUser(최종 결재자) | 기본 일정 동기화 옵션 | 기존 필드 변경 적용과 같은 규칙 |
| `PUT /rest/api/3/issue/{id}` 우리 필드 | asUser | 관문 G_APPFIELD 자동 진단 | 400 "Field does not support update" 기대 |
| `POST /rest/api/3/search/jql` | asUser | 허가 목록 이슈 키 | 1회 |

`route` 보간 함정: 쿼리스트링은 통째로 보간하지 않는다(기존 `StartDateField` 의 `fields=${…}` 형태 유지).

### F.3 AGENTS.md asApp 신규 항목 — 문구 초안 (구현 회차가 추가)
> **앱 전용 필드 값 쓰기(schedule-window-fields, 2026-10-11)**: `jira:customField` readOnly 필드(승인 일정·작성 기간 4개)는 소유 앱만 쓸 수 있고 사용자 권한 경로가 없다. `AppFieldWriter` 만 asApp 으로 앱 필드 값 API 를 부른다(사유 `app-field-write`). 쓰는 값은 언제나 `issue_schedule` 의 현재 DB 값이다. 사용자 입력을 그대로 쓰지 않고, 권한 확인·CAS 를 통과해 DB 에 반영된 뒤에만 쓴다. 필드 id 발견용 `GET /rest/api/3/field` 는 트리거·큐에서만 asApp 이다(사유 `app-field-discover`). 결과(필드 id)는 메타데이터라 화면에 보여도 된다. 다른 필드·워크로그·이슈 본문은 이 경로로 쓰지 않는다.

## G. 프론트 (규약 §7)

- 엔트리 추가 없음(3곳 무변경).
- `static/ui/src/features/schedule/`
  - `IssueScheduleSection.jsx` — issue 엔트리의 새 칸. 승인 일정 / 작성 기간 / Jira 기본 일정 세 줄, 배지(기본 일정과 다름·필드 어긋남·결재 중), 버튼(변경 요청·직접 변경·첫 값·다시 맞추기), 이력 펼침
  - `EntryWindowModal.jsx`·`SeedScheduleModal.jsx` — 날짜 두 칸 + 사유(필수). Atlaskit `DatePicker` 재사용. 높이는 내용이 정한다(100vh 금지)
  - `ScheduleLogList.jsx` — 공용 이력 목록 컴포넌트 재사용(worklogHistory)
  - `EntryGrantSection.jsx` — settings 타임시트 탭(lazy `importWithReloadOnce`)
  - `AppFieldStatusSection.jsx` — `WorklogControlSettings` 안. 필드 id·화면 배치 안내·JQL 예시 복사
  - `scheduleModel.js` — 순수(배지 판정, 문구 키 선택, 한쪽 빈 범위 표시)
- `features/fieldChange/` — `DATE_RANGE` 편집기·표시, 규칙 편집기에 가상 필드 두 개와 `mirrorJiraDates` 토글, decide 결과의 `fieldSync`·`jiraSync` 안내
- `features/worklog/windowPrecheck.js` — `source` 반영, 연동 조건 제거, `MONTH_CLOSED` 구간
- `features/worklogPolicy/policyFields.js` — `monthlyCloseDay: {type:'integer', min:0, max:28}`(0 은 "끔"으로 표시)
- `features/worklogControl/WorklogControlSettings.jsx` — Start date 매핑 섹션 제목을 "기본 일정 비교용(선택)"으로, 기간 창 토글 문구를 대체 규칙으로
- 쿼리키: `scheduleKeys = { all:['schedule'], issue:(id)=>['schedule','issue',id], log:(id)=>['schedule','log',id], grants:(f)=>['schedule','grants',f], appFields:()=>['schedule','appFields'] }`. 직접 변경·첫 값·적용 성공 시 `issue`·`log` 와 기존 작업 로그 컨텍스트 쿼리를 무효화한다. 허가 저장·회수 시 `grants`.

## H. i18n 키 (규약 §8) — `npm run merge`

신규 `locales/{kr,en}/schedule.json`

| 키 | kr | en |
|---|---|---|
| `schedule.title` | 일정·작성 기간 | Schedule & logging window |
| `schedule.approved` | 승인 일정 | Approved schedule |
| `schedule.entry` | 워크로그 작성 기간 | Worklog entry window |
| `schedule.jira` | Jira 기본 일정 | Jira dates |
| `schedule.empty` | 비어 있음 | Not set |
| `schedule.openStart` | {{end}}까지 | Until {{end}} |
| `schedule.openEnd` | {{start}}부터 | From {{start}} |
| `schedule.badge.mismatch` | 기본 일정과 다름 | Differs from Jira dates |
| `schedule.badge.drift` | 필드 값이 앱 기록과 다릅니다 | Field differs from app record |
| `schedule.badge.pending` | 변경 결재 중 | Change pending approval |
| `schedule.badge.syncFailed` | 필드 동기화 반복 실패 | Field sync keeps failing |
| `schedule.action.request` | 변경 요청 | Request change |
| `schedule.action.edit` | 작성 기간 변경 | Change logging window |
| `schedule.action.seed` | 승인 일정 첫 값 입력 | Set initial schedule |
| `schedule.action.resync` | 다시 맞추기 | Resync field |
| `schedule.reason` | 사유 (필수) | Reason (required) |
| `schedule.reason.visible` | 이 사유는 이슈를 볼 수 있는 사람에게 보입니다 | Anyone who can view the issue can see this reason |
| `schedule.noRule` | 이 프로젝트에는 {{field}} 변경 규칙이 없습니다 | This project has no change rule for {{field}} |
| `schedule.source.ENTRY` | 작성 기간 기준 | Based on logging window |
| `schedule.source.SCHEDULE` | 승인 일정 기준 | Based on approved schedule |
| `schedule.log.source.SEED` | 첫 값 | Initial value |
| `schedule.log.source.ADMIN` | 관리자 변경 | Changed by admin |
| `schedule.log.source.APPROVAL` | 승인 | Approved change |
| `schedule.log.source.FIELD_DRIFT` | 다른 경로 변경 감지 | Changed outside the app |
| `schedule.log.source.RESYNC` | 다시 맞춤 | Resynced |
| `schedule.grant.title` | 작성 예외 허가 | Logging exceptions |
| `schedule.grant.help` | 마감된 기간이라도 이 이슈에 한해 정한 날짜 범위의 작성·수정을 기한까지 허용합니다. 승인·인증된 기록과 작성 기간은 풀리지 않습니다 | Allows logging on this issue for the date range until the deadline, even in closed periods. Approved or certified worklogs and the logging window stay as they are |
| `schedule.grant.state.ACTIVE` | 유효 | Active |
| `schedule.grant.state.REVOKED` | 회수됨 | Revoked |
| `schedule.grant.state.EXPIRED` | 기한 지남 | Expired |
| `schedule.appField.title` | 앱 필드 | App fields |
| `schedule.appField.screenHelp` | 필드를 이슈 화면에 추가해야 이슈 보기에 나타납니다 | Add the fields to issue screens to show them in the issue view |
| `schedule.appField.jql` | JQL 예시 | JQL examples |
| `schedule.appField.missing` | 필드를 아직 찾지 못했습니다. 새로고침을 눌러 주세요 | Fields not found yet. Select Refresh |

가산

| 키 | kr | en |
|---|---|---|
| `worklogPolicy.key.monthlyCloseDay` | 월 마감일 | Monthly close day |
| `worklogPolicy.help.monthlyCloseDay` | 각 달의 기록은 다음 달 이 날짜 0시부터 추가·수정·삭제할 수 없습니다. 0이면 끕니다 | Each month's worklogs lock at 00:00 on this day of the next month. 0 turns it off |
| `worklogPolicy.key.worklogDateWindow` | 작성 기간이 없으면 승인 일정으로 제한 | Use approved schedule when no logging window |
| `worklog.blocked.MONTH_CLOSED` | {{month}} 기록은 {{closeAt}}에 마감됐습니다 | {{month}} worklogs closed on {{closeAt}} |
| `worklog.window.outside` | 이 이슈는 {{start}}~{{end}} 작업만 적을 수 있습니다 ({{source}}) | This issue accepts work dated {{start}}–{{end}} ({{source}}) |
| `fieldChange.field.appschedule` | 승인 일정 | Approved schedule |
| `fieldChange.field.appentrywindow` | 워크로그 작성 기간 | Worklog entry window |
| `fieldChange.rule.mirrorJiraDates` | 승인되면 Jira 기본 일정도 맞추기 | Also update Jira dates when approved |
| `fieldChange.jiraSync.FAILED` | 기본 일정 동기화 실패 | Jira date sync failed |
| `worklogControl.startField.compareTitle` | 기본 일정 비교용 Start date 필드 (선택) | Start date field for comparison (optional) |
| `error.SCHEDULE_RANGE_INVALID` | 날짜 범위가 올바르지 않습니다 | The date range is invalid |
| `error.SCHEDULE_REASON_REQUIRED` | 사유를 입력해 주세요 | Enter a reason |
| `error.SCHEDULE_ALREADY_SET` | 이미 승인 일정이 있습니다. 변경은 승인 요청으로 해 주세요 | An approved schedule already exists. Request a change instead |
| `error.SCHEDULE_ISSUE_PROJECT_MISMATCH` | 이 프로젝트의 이슈가 아닙니다 | This issue is not in this project |
| `error.APP_FIELD_UNAVAILABLE` | 앱 필드를 찾을 수 없습니다 | App fields are unavailable |
| `error.APP_FIELD_WRITE_FAILED` | 필드 값을 쓰지 못했습니다. 앱 기록은 저장됐습니다 | Couldn't write the field. The app record was saved |
| `error.ENTRY_GRANT_INVALID` | 허가 내용이 올바르지 않습니다 | The exception is invalid |
| `error.ENTRY_GRANT_NOT_ACTIVE` | 이미 끝난 허가입니다 | This exception is no longer active |
| `audit.area.issueSchedule` | 이슈 일정·작성 기간 | Issue schedule |
| `audit.area.entryGrant` | 작성 예외 허가 | Logging exceptions |

## I. 용량·호출량 (규약 §9)

### I.1 행·바이트 (200명 기준, 실측 전 추정)
| 테이블 | 연 행 수 | 행 크기 | 연 용량 |
|---|---|---|---|
| `issue_schedule` | 값 있는 이슈 ~20,000(누적, 이슈당 1행) | ~250B | ~5MB |
| `issue_schedule_log` | 이슈당 변경 ~3 → ~60,000 | ~350B | ~21MB |
| `worklog_entry_grant` | ~500 | ~700B | <1MB |
| `field_change_request`(일정·작성 기간 요청) | ~5,000 | 기존 ~1KB | ~5MB |

합계 연 ~31MB. 누적 용량 우려(field-change-approval 설계의 3년 1GiB)에는 보관 작업 편입으로 대응한다.

### I.2 resolver 1회당 호출
| 경로 | Jira | SQL |
|---|---|---|
| 워크로그 작성·수정·삭제 | **기존보다 1회 적다**(Start date GET 제거). 추가 0 | +1 SELECT(PK, memo). 마감으로 막힐 때만 +1(허가) |
| `getIssueWorklogs` | 기간 창용 GET 제거 | +1 SELECT |
| `getIssueSchedule` | 1(asUser, 프로젝트·기본 일정 묶음) | 2(행·열린 요청) |
| `setIssueEntryWindow` | 1 asUser + 1 asApp(필드) | 4~5 |
| 승인 적용 | 1 asApp(+ 옵션 1 asUser) | 기존 + 2 |
| `listEntryGrants` | 1(이슈 키 일괄) | 1 |
| `app-field-sync` 작업 | ⌈n/50⌉ × 필드 수 | 1 + n |

N+1 없음. 허가 목록의 이슈 키는 `search/jql` 1회로 일괄 조회한다.

### I.3 유휴 SQL
사용자 0명·이벤트 0건일 때 이 기능의 하루 SQL = **0**.
- 일일 스윕은 KVS 표식(`approval:appField:pending`)만 읽고, 없으면 push 하지 않는다.
- 월 마감일은 계산이라 행도 쿼리도 없다.
- 어긋남 감지는 이슈 이벤트가 있을 때만, 그것도 우리 필드 변경일 때만 SQL 1회.
- 빈 상태 상한: 표식이 남아 있는데 대상 행이 0이면 작업 1회당 SELECT 1회 후 표식 삭제.

## J. 미검증 (규약 §10)

공식 문서로 확인한 것(2026-10-11 조회):
- `jira:customField` 는 `type: date` 를 지원하고 값은 날짜 문자열이다. `readOnly: true` 필드는 사용자가 UI 로도 Edit issue REST API 로도 편집할 수 없다. 생성·전환 화면에 나오지 않는다. 이슈에 보이려면 관리자가 화면에 넣어야 한다. 앱은 전용 REST 로 값을 쓰고, 이때는 검증을 건너뛴다. — [Forge Jira custom field](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-custom-field/)
- 앱 필드 값 API 는 그 필드를 manifest 에 선언한 앱만 쓸 수 있다. 여러 필드·여러 이슈를 한 요청으로 쓸 수 있다. scope `write:app-data:jira` 는 지금 선택이지만 곧 필수가 된다고 안내한다. `generateChangelog` 쿼리 인자가 있다. — [Issue custom field values (apps)](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-custom-field-values--apps-/) (검색 결과 요약으로 확인. 페이지 전문은 조회 도구에서 잘려 본문 형태는 S2 로 둔다)
- 워크포스 운영 기록: readOnly 앱 필드를 일반 `PUT /issue` 로 쓰면 `400 "Field does not support update"`. — `moves-workforce/_workspace/issue-link-gantt/03_verify_report.md:384`
- 대량 편집 진입점은 객체형만 문서에 있다. CSV 가져오기는 Forge 객체형에서 실패한다는 버그가 있다. — [ECO-1655](https://jira.atlassian.com/browse/ECO-1655)

| # | 항목 | 영향 | 확인 방법 |
|---|---|---|---|
| S1 | readOnly 필드가 **대량 편집·CSV 가져오기·자동화 "이슈 편집"·모바일·이슈 생성 시 값 지정·다른 앱의 asApp PUT(overrideScreenSecurity 포함)** 에서도 막히는가 | 막히지 않아도 판정은 안전(DB). 필드를 "공식 값"으로 안내할 수 있는지가 달라진다 | 관문 G_APPFIELD: 개발 사이트에서 경로마다 시도 → 값 불변 확인, 수동 항목 기록 |
| S2 | 앱 필드 값 API 의 정확한 본문(`customField` 키 이름)·응답(동기 204 인가)·한 요청 상한·`null` 로 값 지우기·`PUT /app/field/{id}/value` 와의 차이 | 동기 작업 묶음 크기, 값 지우기 경로 | 50·100건 묶음 쓰기, null 쓰기 후 `GET /issue` |
| S3 | 필드 id 발견: `GET /field` 의 `schema.custom` 이 확장 ARI(`…/static/{moduleKey}`)인가, 앱 필드 key 로 API 를 부를 수 있는가 | 못 찾으면 쓰기 불가(`APP_FIELD_UNAVAILABLE`) | 배포 후 `GET /field` 응답 확인 |
| S4 | `date` 필드에 `'YYYY-MM-DD'` 쓰기·읽기 형식 | 비교·표시 | 쓰기 후 `GET /issue` |
| S5 | JQL 이름 표기(`"Worklog entry until (Moves)" >= 2026-04-01`, `cf[NNNNN]`)와 날짜 비교 | 설정 화면 JQL 예시 | 이슈 검색에서 실행 |
| S6 | team-managed 프로젝트에서 이 필드를 이슈 화면에 넣을 수 있는가 | 그 프로젝트는 필드가 안 보임(판정은 동작) | team-managed 시험 프로젝트 |
| S7 | 앱이 쓴 값의 changelog 작성자(앱 계정 판별)와, 앱 필드 쓰기가 `avi:jira:updated:issue` 를 일으키는가 | 어긋남 감지 오탐(우리 쓰기를 남의 변경으로) | 앱 쓰기 직후 DB 의 `field_sync` 가 DRIFT 로 바뀌지 않는지 확인 |
| S8 | 필드 이름 다국어(`translations`) | 한국어 사이트에서 영어 필드명 | manifest i18n 키 시험 |
| S9 | `write:app-data:jira` 없이 동작하는가, 추가 시 관리자 재동의 | 배포 순서 | 개발 배포 |
| S10 | 이슈를 다른 프로젝트로 옮겼을 때 필드 값과 우리 `project_id` | 프로젝트 정책·권한 축 | 이동 후 조회, 트리거가 `project_id` 를 갱신하는지 |
| S11 | 이슈 보기에서 readOnly 필드에 인라인 편집 아이콘이 나오지 않는가 | 사용자 혼란 | 화면 확인 |
| S12 | 필드 모듈 추가가 major 업그레이드·관리자 재동의를 요구하는가 | 배포 공지 | 개발 배포 시 `forge deploy` 출력 |

## K. 작업 분해 (규약 §11)

### K.1 선행·순서
1. (사람) 열린 질문 SW-1~SW-10 확인. 특히 SW-1(작성 기간의 뜻), SW-3(되돌리기), SW-5(연동 조건 제거).
2. backend 단계 1 → frontend 단계 1 → 검증 → (배포·S1~S5 실측) → 단계 2·3.
3. Q137 두 단계 재개방(`period-reopen-levels`)은 병행할 수 있다. 이 설계의 관문 3·4 계약만 지키면 된다.

### K.2 backend 체크리스트

단계 1 — 원본과 판정
- [ ] `domain/schedule/{range,entryWindow,mismatch,log}.js` + 테스트(C.10)
- [ ] `lock.js` 월 마감일·허가, `catalog.js` `monthlyCloseDay`, SettingsRepository 키 맵·기본값, 계약 테스트
- [ ] `rules.js` 연동 조건 제거·`BlockCode.MONTH_CLOSED`
- [ ] v061·v062·v063 DDL + migrate 등록 + migrate 테스트
- [ ] `ScheduleRepository`(CAS)·`ScheduleService`·`ScheduleController` — `getIssueSchedule`·`setIssueEntryWindow`·`seedIssueSchedule`·`listIssueScheduleLog`. resolver 3단계 등록(Controller·PermissionMap·CONTROLLER_REGISTRARS)
- [ ] `WorklogControlContext`·`WorklogService`·`PeriodLockService` 전환(D.2·D.7), 기존 테스트 갱신
- [ ] 에러 코드 8개 + `error.json`

단계 2 — 필드
- [ ] manifest `jira:customField` 4개 + scope
- [ ] `AppFieldRegistry`(onInstall·큐 발견)·`AppFieldWriter`·`ScheduleFieldSync`(큐 작업, runSweep 조건부 push)·`resyncIssueScheduleField`·`getAppFieldStatus`·`refreshAppFields`
- [ ] `ScheduleDriftDetector`(onIssueChanged 분기, 각자 try/catch)
- [ ] G_APPFIELD 진단·`gates.js`, dateWindow 관문 요구 제거(WorklogControlService·WorklogPolicyService)
- [ ] AGENTS.md asApp 항목(F.3)

단계 3 — 승인·예외·연동
- [ ] `DATE_RANGE`·가상 필드: fieldType·fieldValue·IssueFieldReader·FieldChangeApplier 분기(`ScheduleTargetBridge`), v064·v065, 규칙 옵션 `mirrorJiraDates`
- [ ] 직접 변경 시 열린 요청 만료
- [ ] `EntryGrant*` resolver 3개
- [ ] `WorklogControlCtl` `ew` + `contract.js` validator·벡터 + ctlRev 증가
- [ ] 보관 작업에 두 테이블 편입, 감사 검색(area `issueSchedule`·`entryGrant`) 노출 확인

### K.3 frontend 체크리스트
- [ ] `features/schedule/*` 섹션·모달·이력·모델 + 테스트, issue 엔트리에 칸 추가
- [ ] `windowPrecheck`·`WorklogDialog`·`WorklogTab` — source·MONTH_CLOSED·연동 조건 제거
- [ ] `policyFields` `monthlyCloseDay`, 정책 화면 문구
- [ ] `WorklogControlSettings` 문구·`AppFieldStatusSection`
- [ ] settings 타임시트 탭 `EntryGrantSection`(lazy)
- [ ] fieldChange `DATE_RANGE` 편집·표시, 규칙 편집기 가상 필드·토글, decide 결과 안내
- [ ] i18n kr/en(§H) + `npm run merge`
- [ ] 쿼리키 `scheduleKeys`, 무효화 연결

### K.4 워크포스 리포 (이 하네스는 구현하지 않음, RFC-220 후속 — 읽기만 함)
- WF-a: `ctl.ew` 수신·검증(계약 사본·벡터)
- WF-b: 워크포스 탭 사전 판정에 이슈 작성 기간 필드 값·`mc`·`dw` 반영(표시·사전 차단만, 판정 아님)
- WF-c: 카탈로그 사본에 `monthlyCloseDay`(rms.policy 로 잠글 수 있게), `worklogDateWindow` 뜻 변경 안내
- WF-d: `sf` 는 비교용으로만 남는다 — 워크포스 간트의 Start date 고정(`customfield_10015`)과 무관해진다

## 출처 (2026-10-11 조회)
- [Forge — Jira custom field](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-custom-field/)
- [Jira REST v3 — Issue custom field values (apps)](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-custom-field-values--apps-/)
- [Forge — migrate Jira issue fields (readOnly date 예시)](https://developer.atlassian.com/platform/adopting-forge-from-connect/migrate-jira-issue-fields/)
- [ECO-1655 Forge 객체형 필드 CSV 가져오기 실패](https://jira.atlassian.com/browse/ECO-1655) · [ECO-1535 객체형 날짜 속성 색인](https://jira.atlassian.com/browse/ECO-1535)
- [커뮤니티 — Forge 필드는 값 API 로 써야 JQL 로 검색된다](https://community.developer.atlassian.com/t/custom-field-from-forge-app-with-jql/48986)
- 워크포스: `moves-workforce/manifest.yml`(readOnly `moves_RMS_projectId`), `.claude/worktrees/RFC-202/src/api/jira/field/AppFieldValueApi.js`, `src/resolver/gantt/GANTT.md:49`
