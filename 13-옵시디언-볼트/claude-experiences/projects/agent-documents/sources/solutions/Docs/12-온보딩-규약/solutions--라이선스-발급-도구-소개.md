# moveseye-license-issuer — 라이선스 발급 도구 (사내 전용)

DMOVE 라이선스 키(`.lic`)를 만드는 도구다. **제품(`moveseye-be-spring`)과 별도 저장소**이며,
제품 배포본에도 제품 저장소에도 들어가지 않는다 — 개인키를 다루는 코드가 고객사에 넘어가는 소스에
섞이지 않게 하려는 것이다.

설계 근거: `_workspace/designs/devdesign_premium-edition.md` §5.10

## 최초 1회 — 키쌍 만들기

```
issue.bat --genkey
```

- `keys/private-key.pem` — **절대 커밋·공유 금지.** 이 파일이 곧 발급 권한이다.
- `keys/public-key.pem` — 제품에 번들한다:

```
copy keys\public-key.pem ..\moveseye-be-spring\src\main\resources\license\public-1.pem
```

> 🔴 **공개키는 파일 여러 개를 둘 수 있다**(`public-*.pem`). 제품은 리스트를 순회하며 검증하므로,
> 키쌍을 교체할 때 **구 공개키를 남겨두면** 이미 발급한 고객 키가 살아있는 채로 롤오버할 수 있다.
> 반대로 구 공개키를 지우면 그 키로 발급한 라이선스가 **전부 무효**가 된다.

## 발급 — 브라우저 (권장)

```
issue.bat --web
```

`http://127.0.0.1:877` 이 열린다. 폼을 채우고 **발급**을 누르면 `.lic`이 만들어지고 바로 내려받을 수 있다.
발급 대장도 같은 화면에 표로 나온다.

> 👉 **고객사명이 한글이면 이쪽으로 발급하라.** 콘솔·배치 경로는 Windows 인코딩 사고가 나기 쉬운데
> (실제로 세 번 겪었다) 브라우저 폼은 UTF-8이라 그 문제가 아예 없다.

🔴 **이 화면을 띄운 프로세스는 개인키를 들고 있다 — 실행 중인 동안 그 자체가 발급 권한이다.**
기본 바인딩이 `127.0.0.1`이라 같은 PC에서만 열린다. 사내망에 열어야 한다면 토큰이 필수다:

```
issue.bat --web --host 0.0.0.0 --port 877 --token <공유하지 않을 임의 문자열>
```

토큰 없이 `--host`를 바꾸면 **기동을 거부**한다. 쓰고 나면 창을 닫아 프로세스를 내린다.

## 발급 — 콘솔

```
issue.bat
```

질문에 답하면 `issued/고객사_에디션_날짜.lic` 이 생긴다. 인자형도 된다:

```
issue.bat --customer OO기업 --edition PREMIUM --type SUBSCRIPTION --days 365
issue.bat --customer OO기업 --edition STANDARD --type PERPETUAL
issue.bat --customer 체험고객 --edition PREMIUM --days 30 --grace 0
```

| 옵션 | 기본 | 설명 |
|---|---|---|
| `--edition` | PREMIUM | STANDARD \| PREMIUM |
| `--type` | SUBSCRIPTION | SUBSCRIPTION \| PERPETUAL |
| `--days` | 365 | 기간(일). 기간제만 |
| `--grace` | 30 | 만료 후 전 기능이 유지되는 유예 |
| `--features` | (없음) | 등급 기본 기능에 **더해지는** 추가분 |
| `--deadline` | 7 | 이 기간 안에 등록해야 유효 |

## 알아둘 것

- **기간은 발급일이 아니라 고객이 등록한 날부터** 시작한다. 키에 만료일이 없고 `durationDays`만 들어간다.
- **체험판은 `--grace 0`으로** 발급한다. 안 그러면 유예 30일이 붙어 30일 체험이 실질 60일이 된다.
- **등록 기한(기본 7일)이 지나면 거부**된다. 현장 설치가 밀리는 게 예상되면 `--deadline`을 늘려 발급한다.
- **같은 키를 다시 등록해도 기간이 리셋되지 않는다**(`jti` 기준으로 최초 활성화 시각 고정).
- `issued/issued-licenses.csv`가 발급 대장이다. **갱신 문의·분쟁 대응의 유일한 근거**이므로 지우지 말 것.

## 개발용 키

로컬 개발·QA도 라이선스가 필요하다(우회 스위치는 두지 않는다 — 프로파일 오설정 하나로 운영에서
라이선스가 통째로 무력화되는 경로가 생긴다).

```
issue.bat --customer dev --edition PREMIUM --type PERPETUAL --deadline 3650
```

로 만든 뒤 설정 > 라이선스 화면에서 등록한다. `--deadline`을 길게 주는 이유는 dev 키가 7일 뒤
"등록 기한 초과"로 거부되는 걸 막기 위해서다.

## 🔴 제품과 맞춰야 하는 것 (계약)

클레임 상수와 enum은 **양쪽 저장소에 동일한 사본**으로 존재한다. 한쪽만 바꾸면
"발급은 됐는데 제품이 거부한다"가 되고, 그건 고객 현장에서야 드러난다.

| 파일 | 위치 |
|---|---|
| `LicenseClaims.java` | 이 저장소 `src/main/java/com/dmove/moveseye/license/` |
| `Edition.java` · `Feature.java` · `LicenseType.java` | 〃 |
| 제품 쪽 사본 | `moveseye-be-spring/src/main/java/com/dmove/moveseye/license/` |

**바꿀 때는 네 파일을 그대로 복사해 양쪽을 같게 만든다:**

```
copy ..\moveseye-be-spring\src\main\java\com\dmove\moveseye\license\LicenseClaims.java src\main\java\com\dmove\moveseye\license\
```

양쪽의 `LicenseContractTest`가 같은 문자열을 독립적으로 주장하므로, 한쪽만 바뀌면 그쪽 테스트가 깨진다.

## 개발 환경

- **JDK 17 이상**이 필요하다. `issue.bat`이 `C:\Program Files\Java\jdk-17`(또는 `jdk-21`)을 찾아
  그 창에서만 `JAVA_HOME`을 바꾼다 — 전역 `JAVA_HOME`이 JDK 8이어도 그대로 쓸 수 있다.
- 코드를 고쳤으면 `issue.bat --rebuild` 후 다시 실행한다.
- ⚠️ `issue.bat`은 **ASCII로만** 작성한다. 배치 파일 안에 한글을 넣으면 `chcp 65001` 전환과 충돌해
  cmd 파싱이 통째로 깨진다. 사용자에게 보이는 한글은 전부 Java가 출력한다.
