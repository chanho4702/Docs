# 로컬 실행 (Docker)

dmove 공식 사이트(`/data/web/dmove_new/www`)를 로컬에서 똑같이 띄우는 Docker 구성입니다.
운영서버는 **Apache + PHP-FPM + MySQL** 조합이고, 이 구성은 그걸 한 번에 컨테이너로 묶은 것입니다.

| 서비스 | 역할 | 접속 |
|--------|------|------|
| `web` | PHP 8.2 + Apache (소스 = 프로젝트 루트) | http://localhost:8080 |
| `db` | MySQL 8.0 (운영 백업 자동 복원) | localhost:3306 |
| `phpmyadmin` | DB 관리 GUI | http://localhost:8081 |

> ⚠️ **모든 docker 명령은 이 `docker/` 폴더 안에서 실행**하세요. (compose 파일이 여기 있습니다.)

---

## 빠른 시작

```bash
cd docker
docker compose up -d --build
```

- 사이트: **http://localhost:8080**
- phpMyAdmin: **http://localhost:8081** (서버 `db`, 사용자 `root`, 비번 `root_local_pw`)

최초 기동 시 MySQL이 백업을 복원하느라 **30초~1분 정도** 걸립니다. 진행 상황은:

```bash
docker compose logs -f db      # "dmovedb 복원 완료" 가 보이면 끝
```

종료 / 완전 삭제:

```bash
docker compose down            # 컨테이너만 내림 (DB 데이터 유지)
docker compose down -v         # DB 볼륨까지 삭제 (다음 기동 때 백업 재복원)
```

---

## DB 접속 정보

운영 코드(`php/dbconfig.php`)는 DB 정보를 `$_SERVER['main_server_*']` 환경변수로 읽습니다.
운영서버에서는 그 값이 PHP-FPM/Apache 설정에 들어있고, 로컬에서는 **`docker/app.conf`의 `SetEnv`** 가 그 역할을 대신합니다.

| 항목 | 값 |
|------|-----|
| Host (컨테이너 내부) | `db` |
| Host (내 PC의 DB 툴) | `127.0.0.1` |
| Port | `3306` |
| Database | `dmovedb` |
| User / Password | `root` / `root_local_pw` |

비밀번호를 바꾸려면 **`docker-compose.yml`의 `MYSQL_ROOT_PASSWORD`** 와 **`app.conf`의 `SetEnv`** 를 같은 값으로 맞춘 뒤, `docker compose down -v && docker compose up -d --build` 로 재생성해야 합니다. (MySQL 계정/비번은 볼륨 최초 생성 때 굳어지므로 `-v` 로 볼륨을 지워야 반영됩니다.)

---

## 백업 복원 동작 방식

- 사용 백업: **`all_db_backup_20260629.sql.gz`** (운영 `mysqldump --all-databases` 전체 덤프)
- 이 덤프에는 `mysql`, `dataasdb`, `dmovedb`, `dmovetech`, `dmovin`, `dmovindb` 등 **여러 DB**가 들어있습니다.
- 통째로 넣으면 `mysql` 시스템 DB까지 덮어써 **컨테이너 root 인증이 깨질 수 있어서**,
  복원 스크립트(`db-init/10-import-dmovedb.sh`)가 **사이트가 쓰는 `dmovedb` 만 골라서** 복원합니다.
- 이 스크립트는 **DB 볼륨이 빈 상태(최초 기동)일 때만** 자동 실행됩니다.
  이미 한 번 띄운 뒤 백업을 다시 넣고 싶으면 볼륨을 비우고 다시 올리세요:

  ```bash
  docker compose down -v
  docker compose up -d --build
  ```

### 백업 파일을 새 걸로 교체할 때

1. 새 `.sql.gz` 파일을 이 `docker/` 폴더에 둡니다.
2. `docker-compose.yml` 의 db 볼륨 한 줄에서 **왼쪽 경로**만 새 파일명으로 바꿉니다:
   ```yaml
   - ./새백업파일.sql.gz:/backup/db_backup.sql.gz:ro
   ```
3. `docker compose down -v && docker compose up -d --build`

> 사이트 DB 이름이 `dmovedb` 가 아니게 바뀌면 `db-init/10-import-dmovedb.sh` 의 `dmovedb` 와
> `app.conf` 의 `main_database_name` 도 함께 수정하세요.

---

## 폴더 구성

```
docker/
├─ docker-compose.yml          # 서비스 정의 (web / db / phpmyadmin)
├─ Dockerfile                  # PHP 8.2 + Apache + mysqli 확장
├─ php.ini                     # short_open_tag On 등 (dbconfig.php 가 <? 사용)
├─ app.conf                    # DocumentRoot + DB 접속정보(SetEnv)
├─ db-init/
│  └─ 10-import-dmovedb.sh     # 최초 기동 시 백업에서 dmovedb 만 복원
├─ all_db_backup_20260629.sql.gz   # 운영 전체 백업
└─ README.md
```

---

## 트러블슈팅

- **사이트는 뜨는데 게시판/콘텐츠가 비어있다** → DB 복원이 아직 안 끝났거나 실패. `docker compose logs db` 확인. 볼륨을 비우고(`down -v`) 다시 올려보세요.
- **`Access denied for user 'root'`** → `app.conf` 와 `docker-compose.yml` 의 비번이 어긋남. 둘을 맞춘 뒤 `down -v` 후 재기동.
- **포트 충돌(8080/8081/3306 already in use)** → 다른 프로그램(혹은 로컬 MySQL)이 점유 중. `docker-compose.yml` 의 `ports` 왼쪽 번호를 바꾸세요. (예: `"8090:80"`)
- **한글 깨짐** → 본 구성은 `utf8mb4` 로 통일돼 있습니다. 그래도 깨지면 백업 파일 자체 인코딩을 확인하세요.

---

## 참고

- 프로젝트 루트에도 같은 백업 파일 사본이 있을 수 있습니다. 이 구성은 **`docker/` 안의 백업만** 사용하므로, 루트 사본은 필요 없으면 지워도 됩니다.
- `web` 서비스는 프로젝트 루트를 그대로 마운트하므로, **소스 코드를 고치면 새로고침만으로 바로 반영**됩니다 (재빌드 불필요). `Dockerfile`/`php.ini`/`app.conf` 를 바꿨을 때만 `--build` 가 필요합니다.
