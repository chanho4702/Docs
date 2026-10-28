# Forge Hello World

This project contains a Forge app written in Javascript that displays `Hello World!` in a Jira admin page.

See [developer.atlassian.com/platform/forge/](https://developer.atlassian.com/platform/forge) for documentation and tutorials explaining Forge.

## Requirements

See [Set up Forge](https://developer.atlassian.com/platform/forge/set-up-forge/) for instructions to get set up.


## Quick Development Environment Settings
## 1. Forge 초기 설정

```bash
# Node.js 22.x 설치 (https://nodejs.org/)
node --version

# Yarn 설치 (미설치 시)
npm install -g yarn
yarn --version

# Forge CLI 설치
yarn global add @forge/cli
forge --version

# API 토큰 생성: https://id.atlassian.com/manage-profile/security/api-tokens
# 생성한 api token으로 forge login
forge login
```

---

## 2. 프로젝트 시작
### 2-1.의존성 설치 및 빌드

```bash
# 의존성 설치 및 빌드
yarn setup        # 모든 의존성 명시적 설치 + 모든 프론트엔드 static 하위 앱 빌드
```
**`yarn setup`이 하는 일:**
-  프로젝트 루트 의존성 설치
-  Custom UI 의존성 설치 (scheduler, schedulerModal)
-  모든 프론트엔드 빌드

### 2-2. 문제 발생 시 (Troubleshooting)
- 위(yarn setup)에서 에러 발생시, node_modules 디렉토리 삭제, 캐시 삭제 후 아래 커맨드로 재설치)
```bash
# 프로젝트 루트 디렉토리에서 실행
# 캐시 및 의존성 제거
yarn cache clean
npm cache clean --force
rm -rf node_modules
rm -rf static/scheduler/node_modules
rm -rf static/schedulerModal/node_modules

# 재설치 및 빌드
yarn install:all  # 모든 의존성 명시적 설치
yarn build:all    # 모든 프론트엔드 static 하위 앱 빌드(scheduler, schedulerModal)
```


**권한**: 앱 소유자가 아닌 경우 Developer Console에서 Contributor 권한 필요

**참고**:

>```yarn setup ```: 실행 시 루트디렉토리 의존성 설치 + 자동으로 static/scheduler, static/schedulerModal의 의존성도 설치 + static/scheduler, static/schedulerModal 각각 yarn build도 실행됨
>
> ```yarn install:all ```: 실행 시 자동으로 static/scheduler, static/schedulerModal의 의존성도 설치됨
>
>```yarn build:all ```: 실행 시 자동으로 static/scheduler, static/schedulerModal 디렉토리 각각 yarn build도 실행됨


---

## 3. Environment 설정

```bash
# forge environment 생성 (협업 시 각자 개별 환경 생성하여 사용)
forge environments create 
dev-yourname 입력

# 로컬 default 환경 셋팅(생성한 environments명을 셋팅)
forge settings set default-environment dev-yourname
forge settings list
```

**규칙**: `dev-{이름}` 형식 사용, production은 `production`

---

## 4. 실행 및 테스트

### 배포
```bash
# 프론트엔드 빌드는 yarn setup 성공 시, 빌드커맨드 포함되어 빌드완료된 상태임

# 배포
forge deploy

# 설치 (최초 1회)
# Jira용:
forge install --product jira

# Confluence용:
forge install --product confluence

# 또는 대화형으로
forge install  # → 제품 선택 (Jira 또는 Confluence)
```


## 5. 개발 워크플로우

### 백엔드 수정
```bash
# 실시간 반영
forge tunnel  # (반드시 개별 forge environment 셋팅 후 진행)

# 또는 배포
forge deploy
```

### 프론트엔드 수정
```bash
# 빌드 후 배포
yarn build:all
forge deploy
# 브라우저에서 Ctrl+Shift+R 새로고침 (Jira 또는 Confluence)
```
### 다국어 수정
```bash
# locales/en-US.json, ko-KR.json 수정 후
forge deploy
```


---

## Previous Original Quick start
- Install top-level dependencies:
```
npm install
```

- Install dependencies (inside of the `static/hello-world` directory):
```
npm install
```

- Modify your app by editing the files in `static/hello-world/src/`.

- Build your app (inside of the `static/hello-world` directory):
```
npm run build
```

- Deploy your app by running:
```
forge deploy
```

- Install your app in an Atlassian site by running:
```
forge install
```

### Notes
- Use the `forge deploy` command when you want to persist code changes.
- Use the `forge install` command when you want to install the app on a new site.
- Once the app is installed on a site, the site picks up the new app changes you deploy without needing to rerun the install command.

## Support

See [Get help](https://developer.atlassian.com/platform/forge/get-help/) for how to get help and provide feedback.


