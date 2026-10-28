# 이슈 초안 — APM 원문(스택·SQL·스팬 속성) 노출 틈: `keep_raw_sql`을 켰다가 끈 설치본

- 작성 2026-09-28 · 발견 경위: ZM-154(APM 데이터 내보내기) 조사 중 확인(`reports/README_zm-151-156.md` "별도 이슈로 올릴 것")
- 티켓 번호: **미발급**(사용자 발급 대기) · 제안 유형 [FIX] · 제안 우선순위 높음(비관리자에게 고객 데이터 원문이 보임)
- 상태: 코드 수정 없음(초안만)

## 1. 문제

`ApmRawTextPolicy.viewFor()`는 "지금 `keep_raw_sql`이 꺼져 있으면 저장된 값은 이미 적재 시점에 마스킹돼 있다"고 가정하고, **열람 자격이 없는 사용자에게도 저장값을 그대로(RAW) 내려준다.**

| | `keep_raw_sql=false`(기본) | `keep_raw_sql=true` |
|---|---|---|
| 자격 있음(관리자) | RAW | RAW |
| 자격 없음 | 🔴 **RAW** | MASKED |

가정이 깨지는 경우: 설정을 **켰다가 끈** 설치본. 켜져 있던 동안 적재된 스팬 속성(SQL 문)·스팬 이벤트·예외 그룹 `sampleStack`은 원문 그대로 DB에 남아 있고(소급 마스킹 없음), 보존 기간(스팬 7일·예외 그룹 90일) 동안 비관리자 화면에 원문이 보인다.

## 2. 재현

1. 관리자로 APM 설정에서 원문 SQL 보존(`keep_raw_sql`)을 켠다.
2. SQL 리터럴이 있는 트레이스와 예외를 한 건 이상 적재시킨다.
3. 설정을 끈다.
4. `apm.view`만 있는 계정으로 `GET /apm/traces/{traceId}`(스팬 속성·이벤트)와 `GET /apm/errors/groups/{groupId}`(`sampleStack`)를 조회한다.
5. 기대: 리터럴이 `?`로 가려진 값. 실제: 원문.

## 3. 영향 범위

- 화면(BE 응답): 트레이스 상세(`ApmTraceController` → `ApmTraceQueryService.detail(view)`), 예외 그룹 상세(`ApmErrorController` → `ApmErrorQueryService`, `sampleStack`만).
- 내보내기(ZM-154, `ApmExportService`)는 **영향 없음** — 이미 "기본 항상 마스킹, 관리자가 `rawText=true`를 명시할 때만 원문"으로 화면보다 엄격하게 만들었다.
- 기본 설치본(한 번도 켜지 않은 곳)은 영향 없음.

## 4. 원인 코드

`moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmRawTextPolicy.java`

```java
public ApmRawTextView viewFor(TokenUserInfo user) {
    if (ApmAccessChecker.canViewRawText(user)) {
        return ApmRawTextView.RAW;
    }
    return settings != null && settings.keepRawSql() ? ApmRawTextView.MASKED : ApmRawTextView.RAW;
}
```

클래스 Javadoc은 왼쪽 아래 칸을 RAW로 둔 이유를 "두 번 마스킹하면 읽을 수 없는 문자열이 된다 + CPU 낭비"라고 적었다. 그런데 `ApmExportService` Javadoc이 확인한 대로 **마스킹은 멱등**이다(`ApmSqlMasker`가 리터럴을 `?`로 바꾸므로 두 번 걸어도 같다). "두 번 접힌다"는 우려는 성립하지 않는다.

## 5. 수정안

**자격 없는 사용자는 설정과 무관하게 항상 MASKED.** 판정 표의 왼쪽 아래 칸만 바뀐다.

```java
public ApmRawTextView viewFor(TokenUserInfo user) {
    return ApmAccessChecker.canViewRawText(user) ? ApmRawTextView.RAW : ApmRawTextView.MASKED;
}
```

같이 할 것:
- `ApmRawTextPolicy` Javadoc 판정 표·이유 갱신(멱등 근거 명시). `ApmTraceController`·`ApmErrorController` 주석의 "꺼져 있으면 아무 일도 안 한다" 문구 정정.
- 테스트: `ApmRawTextPolicy` 단위 테스트에 "설정 꺼짐 + 자격 없음 → MASKED" 케이스. `ApmSqlPolicy`(또는 `ApmSqlMasker`) 테스트에 **멱등성 케이스** 추가(`apply(apply(x)) == apply(x)`를 SQL·자유 텍스트·스택 세 종류에 대해).
- `settings` 의존이 사라지면 생성자 정리(`ApmSettingService` 주입 제거 가능 여부 확인 — 다른 곳에서 안 쓰면 제거).
- 비용: 마스킹은 자격 없는 사용자의 상세 조회에서만 걸린다. 스팬 수천 개짜리 트레이스에서 CPU 비용을 한 번 재본다(`ApmTraceQueryService.detail`). 문제가 되면 "저장 시점 마스킹 여부" 열을 추가하는 것이 다음 단계지만, 먼저 항상-마스킹으로 막는 것이 우선이다.

## 6. 검증 방법

- 단위: 위 테스트 2건.
- 런타임: §2 절차를 dev(5433)에서 재현 → 수정 후 4단계 응답이 마스킹본인지 확인. 관리자 응답은 그대로 원문인지 함께 확인(회귀 방지).
- 내보내기는 변경 없음 — `ApmExportIT`가 그대로 통과하는지만 확인.

## 7. 범위 밖(별도 논의)

- 설정을 끌 때 기존 원문을 **소급 마스킹**하는 배치. 데이터량이 크고 되돌릴 수 없어 이번 수정과 분리.
- 원문 열람 감사 로그(누가 언제 원문을 봤나) — ZM-155·156이 필요로 하는 공통 감사 로그와 묶어 결정.
