# moveseye-license-issuer — 라이선스 발급 도구

DMOVE(Zabbix 기반 인프라 모니터링) 제품의 **라이선스 키를 만드는 사내 전용 도구**다.
Java 17 + Gradle, Windows 대화형 실행(`issue.bat`)이 주 사용 경로다.

- **설계 정본**: `../\_workspace/devdesign_premium-edition.md` §5.10 (모노레포 `C:\solutions` 기준)
- **제품(검증하는 쪽)**: `../moveseye-be-spring` — `com.dmove.moveseye.license` 패키지
- **작업 브랜치**: 이 저장소는 `main` 단일. 제품 쪽 라이선스 작업은 `ZM-79`

---

## 0. 왜 별도 저장소인가

제품 저장소에 두면 **개인키를 다루는 코드가 고객사에 넘어가는 소스에 섞인다.** 발급 권한과
제품 코드를 물리적으로 갈라두는 것이 이 분리의 전부다. 그 대가로 클레임 상수를 소스로 공유할 수
없게 됐고, 그건 §2의 계약 테스트로 메운다.

---

## 1. 🔴 절대 하면 안 되는 것

| 금지 | 이유 |
|---|---|
| `keys/private-key.pem` 커밋·공유·첨부 | **이 파일이 곧 발급 권한이다.** 유출되면 누구나 PREMIUM 영구 키를 찍어낼 수 있다 |
| 유출됐다고 공개키를 그냥 교체 | 이미 발급한 **고객 키가 전부 무효**가 된다. 롤오버는 구 공개키를 남긴 채 새 공개키를 *추가*하는 것이다 |
| `issued/` 커밋 | 고객사명이 들어간다 |
| `issue.bat`에 한글 넣기 | `chcp 65001` 전환과 충돌해 **cmd 파싱이 통째로 깨진다**(실제로 겪음). 배치는 ASCII 전용, 한글 출력은 Java가 한다. **한글 고객사명은 `--web`으로 발급하면 이 문제 자체가 없다** |
| 키에 `exp`(절대 만료일) 넣기 | 기간은 **고객이 등록한 날부터** 시작한다(설계서 P12). 발급일부터 시계가 돌면 늦게 설치하는 고객이 손해를 본다 |

---

## 2. 🔴 제품과의 계약 — 네 파일은 양쪽이 동일한 사본이다

```
src/main/java/com/dmove/moveseye/license/
├─ LicenseClaims.java     클레임 이름 + 정책 기본값
├─ Edition.java           STANDARD / PREMIUM + 등급별 기본 기능
├─ Feature.java           GPU_MONITORING / DB_MONITORING / APM
└─ LicenseType.java       SUBSCRIPTION / PERPETUAL
```

**제품(`moveseye-be-spring`)의 같은 경로에 글자 하나까지 같은 파일이 있어야 한다.**
한쪽만 바꾸면 *"발급은 됐는데 제품이 거부한다"* 가 되고, 그건 **고객 현장에서야 드러난다.**

바꿀 때는 복사해서 양쪽을 맞춘다:

```bat
copy ..\moveseye-be-spring\src\main\java\com\dmove\moveseye\license\LicenseClaims.java src\main\java\com\dmove\moveseye\license\
```

양쪽의 `LicenseContractTest`가 같은 문자열을 **독립적으로 주장**하므로, 한쪽만 바뀌면 그쪽 테스트가 깨진다.
계약을 의도적으로 바꾸는 경우에는 **양쪽 테스트와 양쪽 사본을 함께** 고쳐야 한다.

---

## 3. 구조

```
issue.bat                    진입점 (ASCII 전용, JDK 탐색 + 빌드 + 실행)
build.gradle.kts             java-jwt 4.4.0 + thymeleaf, application 플러그인, UTF-8 강제
src/main/java/com/dmove/moveseye/
├─ license/                  제품과 공유하는 계약 4파일 (§2)
└─ tools/license/
   ├─ LicenseIssuerCore.java  🔴 발급 본체 — 서명·대장·키쌍. CLI와 웹이 공유한다
   ├─ LicenseIssuer.java      CLI 진입점 (입출력만)
   └─ LicenseIssuerWeb.java   웹 진입점 (JDK 내장 HttpServer)
src/main/resources/templates/issue.html      발급 화면 (Thymeleaf)
src/test/java/.../LicenseContractTest.java   계약 고정 테스트
keys/                        (gitignore) private-key.pem / public-key.pem
issued/                      (gitignore) *.lic + issued-licenses.csv
```

🔴 **서명·대장 기록은 `LicenseIssuerCore` 한 곳에만 둔다.** 진입점이 둘로 갈린 뒤로는
한쪽에만 고치면 *"CLI로 낸 키와 웹으로 낸 키가 다르게 서명되는"* 사고가 난다.

---

## 4. 개발·실행

```bat
issue.bat --web           브라우저 발급 화면 (권장)
issue.bat                 대화형 발급 (콘솔)
issue.bat --genkey        키쌍 생성 (최초 1회 / 롤오버)
issue.bat --rebuild       코드 수정 후 다시 빌드 (빌드만 하고 끝난다)
gradlew.bat test          계약 테스트
```

### 웹 발급 화면 (`--web`)

`http://127.0.0.1:877` — 폼에 입력하면 `.lic`을 만들고 바로 다운로드된다. 발급 대장도 표로 보인다.

> 👉 **한글 고객사명은 이쪽으로 발급하는 것이 안전하다.** CLI는 고객사명을 `.bat` 인자로 넘겨야 해서
> Windows 인코딩 사고가 나기 쉬운데(§1), **브라우저 폼은 UTF-8이라 그 경로가 통째로 사라진다.**

| 옵션 | 기본 | 비고 |
|---|---|---|
| `--port` | 877 | |
| `--host` | `127.0.0.1` | 같은 PC의 브라우저만 닿는다 |
| `--token` | 없음 | **`--host`를 바꾸면 필수** |

🔴 **이 프로세스는 개인키를 들고 있다 = 실행 중인 동안 발급 권한 그 자체다.**
그래서 기본이 루프백이고, 다른 주소로 열려면 토큰을 강제한다(토큰 없이 `--host 0.0.0.0`을 주면
기동을 거부한다). **제품에 이 화면을 넣지 않는다** — 개인키가 고객사로 넘어간다.

🔴 **다운로드는 발급 대장에 있는 파일명만 허용한다.** 사용자가 준 문자열로 경로를 만들면
`../keys/private-key.pem` 요청에 **개인키를 그대로 내주게 된다**(화이트리스트로 차단 확인됨).

- **JDK 17 이상 필요.** 이 PC의 전역 `JAVA_HOME`은 JDK 8이라 `issue.bat`이 `C:\Program Files\Java\jdk-17`
  (또는 `jdk-21`)을 찾아 **그 창에서만** `JAVA_HOME`을 바꾼다. 전역 설정은 건드리지 않는다.
- **인코딩**: Windows 기본이 MS949라 `applicationDefaultJvmArgs`로 stdout/stderr를 UTF-8로 고정했다.
  이게 없으면 한글 고객사명이 **깨진 채로 키 클레임에 박힌다.**
- ⚠️ 배치의 `shift`는 `%*`를 다시 쓰지 않는다. 그래서 `--rebuild`는 인자를 걸러내려 하지 말고
  **빌드 전용 명령**으로 둔다(고쳤다가 다시 새는 실수가 잦은 지점).

---

## 5. 발급 시 알아둘 것

- **체험판은 `--grace 0`으로** 발급한다. 기본 유예 30일이 붙으면 30일 체험이 실질 60일이 된다.
- **등록 기한 기본 7일.** 현장 설치가 밀릴 게 예상되면 `--deadline`을 늘려 발급한다.
  dev 키는 `--deadline 3650`처럼 길게 준다(7일 뒤 "기한 초과"로 거부되는 걸 막기 위해).
- **같은 키를 다시 등록해도 기간이 리셋되지 않는다** — 제품이 `jti` 기준으로 최초 활성화 시각을 고정한다.
- `issued/issued-licenses.csv`가 **발급 대장**이다. 갱신 문의·분쟁 대응의 유일한 근거이므로 지우지 않는다.
