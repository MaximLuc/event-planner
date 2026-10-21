# Event Planner API

Практическое руководство по разработке и обслуживанию бэкенда.

- [Описание проекта и быстрый запуск через Docker](../../README.md).
- [Архитектура и технические решения](../../docs/architecture.md).
- [Swagger после запуска API](http://localhost:3000/api/docs).

## Требования

- Node.js 24.
- pnpm 11.22.0 — та же версия используется в Dockerfile и CI.
- Docker с Compose v2 и запущенным Docker daemon.

Если pnpm ещё не установлен:

```bash
npm install --global pnpm@11.22.0
```

Ниже явно указано, откуда выполнять команды: из корня репозитория или из `apps/api`. Общего корневого pnpm workspace с фронтендом пока нет; зависимости API устанавливаются внутри `apps/api`.

## Переменные окружения

Локальный файл — `apps/api/.env`. Для нового клона создай его из [.env.example](.env.example) и заполни два разных случайных JWT-секрета. Существующий `.env` перезаписывать не нужно.

| Переменная                | Значение для локальной разработки                                           | Назначение                                                        |
| ------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `NODE_ENV`                | `development`                                                               | Режим приложения; в production refresh-cookie имеет флаг `Secure` |
| `PORT`                    | `3000`                                                                      | HTTP-порт API; worker не открывает HTTP-порт                      |
| `DATABASE_URL`            | `postgresql://postgres:postgres@localhost:5432/event_planner?schema=public` | Подключение Prisma к PostgreSQL                                   |
| `JWT_ACCESS_SECRET`       | Собственный случайный секрет, минимум 32 символа                            | Подпись access token                                              |
| `JWT_ACCESS_EXPIRES_IN`   | `15m`                                                                       | Срок действия access token                                        |
| `JWT_REFRESH_SECRET`      | Другой случайный секрет, минимум 32 символа                                 | Подпись refresh token                                             |
| `JWT_REFRESH_TTL_SECONDS` | `2592000`                                                                   | Срок refresh token и обновляемой сессии, в секундах               |
| `REDIS_URL`               | `redis://localhost:6379`                                                    | Кэш, ограничения запросов и очередь BullMQ                        |
| `SMTP_HOST`               | `127.0.0.1`                                                                 | Адрес SMTP Mailpit на хосте                                       |
| `SMTP_PORT`               | `1025`                                                                      | SMTP-порт Mailpit                                                 |
| `SMTP_SECURE`             | `false`                                                                     | Использование прямого TLS-соединения с SMTP                       |
| `MAIL_FROM`               | `no-reply@event-planner.test`                                               | Отправитель уведомлений                                           |

API и worker валидируют необходимые им настройки через `ConfigModule` и Joi. Worker не требует JWT-секретов или `PORT`.

В Compose настройки из `environment` перекрывают одноимённые поля из `env_file`. Между контейнерами используются `postgres:5432`, `redis:6379`, `mailpit:1025`; программы на хосте используют опубликованные локальные порты. Не меняй адрес в локальном `.env` на `postgres`, если запускаешь Prisma Studio вне Docker.

## Разработка на хосте

### 1. Поднять только инфраструктуру

Из корня репозитория, если до этого запускал полный Compose:

```bash
docker compose stop api worker
```

Это освобождает порт 3000 и исключает случайную обработку уведомлений вторым worker'ом.

Затем запусти PostgreSQL, Redis и Mailpit:

```bash
docker compose up -d postgres redis mailpit
```

Проверь готовность через `docker compose ps`. Миграционный сервис в этом варианте не запускается автоматически: применим миграции на следующем шаге.

### 2. Установить зависимости и подготовить Prisma

Из `apps/api`, с заполненным `.env`:

```bash
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma migrate deploy
```

`generate` создаёт типизированный клиент по схеме и не применяет миграции. `migrate deploy` применяет существующие миграции к БД, но не создаёт новые.

Не копируй `node_modules`, `dist` и сгенерированный Prisma Client между Windows, macOS и Linux. Устанавливай зависимости и генерируй клиент в нужном окружении.

### 3. Запустить приложение

Для разработки только HTTP-части:

```bash
pnpm start:dev
```

Для проверки API и отдельного worker сначала выполни одну общую сборку:

```bash
pnpm build
```

Затем из `apps/api` в двух терминалах:

```bash
pnpm start:prod
```

```bash
pnpm start:worker
```

Название `start:prod` означает запуск скомпилированного JavaScript без watch. Само по себе оно не меняет `NODE_ENV`: режим берётся из окружения. Не запускай два Nest watch-процесса, перезаписывающих общий `dist`. После изменения worker-кода в этом варианте останови процессы, пересобери проект и запусти их снова.

## Prisma и БД

Все команды раздела выполняются из `apps/api`.

```bash
# Проверить схему и создать актуальный Prisma Client.
pnpm exec prisma validate
pnpm exec prisma generate

# Открыть интерфейс для просмотра данных.
pnpm exec prisma studio
```

Studio выведет адрес в терминале. Подключение берётся из `DATABASE_URL` через `prisma.config.ts`. Интерфейс позволяет не только читать, но и изменять данные — используй его внимательно.

После изменения схемы при разработке создай новую миграцию, заменив имя в примере на описание своего изменения:

```bash
pnpm exec prisma migrate dev --name describe_your_change
pnpm exec prisma generate
```

`migrate dev` используется только для разработки. Если команда неожиданно предлагает сбросить БД, не подтверждай сброс до выяснения причины. Файлы миграций добавляются в Git; `src/generated/prisma` — нет.

В Docker миграции выполняет отдельный сервис `migrate` из этапа `build`, где доступна Prisma CLI. После добавления миграции обычный цикл запуска из корня:

```bash
docker compose up --build -d
docker compose logs --tail 100 migrate
```

## Тесты и проверки

Из `apps/api`, после установки зависимостей и генерации Prisma Client:

```bash
pnpm exec eslint src test --max-warnings=0
pnpm exec tsc --project test/tsconfig.json
pnpm build
pnpm test:e2e
```

Для запуска одного файла:

```bash
pnpm test:e2e --runTestsByPath test/notifications.e2e-spec.ts
```

### Как устроены e2e-тесты

- `global-setup.ts` запускает отдельные PostgreSQL, Redis и Mailpit на динамических портах, задаёт тестовые переменные и применяет миграции.
- `create-test-app.ts` поднимает API и `NotificationsWorkerModule` в одном тестовом процессе. Это не отменяет раздельный запуск в обычном окружении.
- `resetTestState()` приостанавливает очередь, дожидается активной задачи, затем очищает очередь, Mailpit, БД, кэш и счётчики запросов.
- Jest запускает набор последовательно: общие контейнеры рассчитаны на `maxWorkers: 1`. Для параллельных наборов потребуется отдельная изоляция данных.
- `global-teardown.ts` останавливает временные контейнеры. Docker Compose проекта для тестов не нужен.

Проверяются авторизация и cookie, ротация сессий, права владельца, версии событий, публичная витрина, регистрации, приглашения, конкурентное занятие мест, кэш, общие ограничения запросов и доставка уведомлений.

Тесты уведомлений используют реальные Redis/BullMQ и SMTP Mailpit. В сценариях сбоев отдельные вызовы намеренно подменяются для проверки retries. Успех ожидается по состоянию конкретной задачи и содержимому Mailpit, а не по фиксированной задержке.

### Линтер и форматирование

Проверять нужно исходники и тесты. `dist`, `coverage` и `src/generated/prisma` исключены в `eslint.config.mjs`.

```bash
# Проверка без изменения файлов — как в CI.
pnpm exec eslint src test --max-warnings=0

# Автоматическое исправление поддерживаемых проблем в своём коде.
pnpm exec eslint src test --fix
```

Скрипт `pnpm lint` уже содержит `--fix` и меняет файлы; для CI используется отдельная команда без исправлений. Не исправляй сгенерированный Prisma Client вручную и не добавляй результаты сборки в TypeScript-проект ради устранения ошибок линтера.

## Swagger и работа с токенами

Swagger доступен по [http://localhost:3000/api/docs](http://localhost:3000/api/docs), общий префикс API — `/api/v1`.

- В `Authorize → access-token` вставляется только access token. Swagger добавляет `Authorization: Bearer ...`.
- Login возвращает access token и данные пользователя в JSON, а refresh token устанавливает в HttpOnly-cookie `refresh_token`.
- Refresh и обычный logout используют cookie, а не refresh token в JSON-запросе.
- Cookie имеет `path=/api/v1/auth`, `sameSite=lax`, `httpOnly=true`; при `NODE_ENV=production` также `secure=true`.
- Смена пользователя в Swagger требует смены Bearer-токена. Cookie при этом может принадлежать последнему вошедшему пользователю: для разных аккаунтов удобнее отдельные браузерные профили.

Для будущего фронтенда CORS сейчас разрешает `http://localhost:5173` с credentials. Запросам, работающим с refresh-cookie из браузера, потребуется `credentials: 'include'`. Для production отдельно настраиваются HTTPS, origins и cookie.

## Частые проблемы

| Симптом                                 | Что проверить                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `EADDRINUSE` на 3000                    | Не запущен ли API одновременно на хосте и в Docker                                      |
| Ошибка соединения с PostgreSQL/Redis    | Готовность контейнера и адрес: `localhost` на хосте, имя сервиса внутри Compose         |
| Приглашение создано, но письма нет      | Работает ли worker; его логи; статус приглашения и будущая дата опубликованного события |
| `migrate` имеет `Exited (0)`            | Это штатное успешное завершение одноразового сервиса                                    |
| `409` при редактировании события        | Актуален ли `expectedVersion`; перечитай событие и осознанно повтори изменение          |
| `409` при повторном приглашении         | Приглашение уже `PENDING`/`ACCEPTED` либо есть активная регистрация                     |
| `401` в Swagger                         | Access token мог истечь; выполни login/refresh и обнови Authorize                       |
| `429`                                   | Сработало ограничение запросов; дождись окончания блокировки                            |
| ESLint сообщает parsing errors в `dist` | Проверь исключения и запускай линтер для `src test`                                     |
| В CI ошибки generated Prisma            | Закоммичено ли исключение `src/generated/prisma/**`                                     |
| Тесты не могут создать контейнер        | Запущен ли Docker daemon и доступен ли он текущему пользователю                         |

Mailpit — локальный приёмник писем, а не проверка доставки во внешний почтовый ящик. Сообщение `email accepted by SMTP` означает принятие письма SMTP-сервером, а не прочтение пользователем.
