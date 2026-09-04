# n8n-nodes-max

[![npm version](https://img.shields.io/npm/v/n8n-nodes-max?logo=npm)](https://www.npmjs.com/package/n8n-nodes-max)

Набор функциональных нод для интеграции мессенджера MAX с n8n.
<img width="518" height="429" alt="image" src="https://github.com/user-attachments/assets/577165bb-510f-4523-b898-76ea94dc0f2b" />

## Установка

### Для self-hosted n8n

1. Установите пакет через npm в директории n8n:

```bash
npm install n8n-nodes-max
```

2. Перезапустите n8n для загрузки новой ноды

### Для n8n Cloud

1. Откройте настройки вашего workspace
2. Перейдите в раздел "Community nodes"
3. Нажмите "Install a community node"
4. Введите `n8n-nodes-max` и нажмите "Install"

### Альтернативный способ (переменная окружения)

Добавьте пакет в переменную окружения:

```bash
export N8N_CUSTOM_EXTENSIONS=n8n-nodes-max
```

**Полезные ссылки:**

- [Официальная документация по установке community nodes](https://docs.n8n.io/integrations/community-nodes/installation/)
- [Руководство по self-hosted установке](https://docs.n8n.io/hosting/)

## Для разработки

- После `npm install` автоматически устанавливается Husky pre-commit hook.
- Перед коммитом запускается Prettier для staged исходников (`*.{ts,js,mjs,cjs,json,md,yml,yaml}`).

## Релиз

1. Подготовьте изменения и закоммитьте их обычным git-коммитом.
2. Выберите semver-тип релиза и создайте commit+tag командой `npm version patch`, `npm version minor` или `npm version major`.
3. Запушьте ветку и теги командой `git push origin master --follow-tags`.
4. GitHub Actions опубликует пакет в npm по пушу тега `v*.*.*`.

Автопубликация использует npm Trusted Publisher через GitHub Actions OIDC, без `NPM_TOKEN`.
В настройках пакета npm trusted publisher должен указывать:

- Organization or user: `pfrankov`
- Repository: `n8n-nodes-max`
- Workflow filename: `publish-npm.yml`
- Allowed actions: `npm publish`

## Возможности

### Функциональные ноды

- `Max Bot`: сведения о боте и команды.
- `Max Chat`: сведения и настройки чата, действия бота, закреплённые сообщения и членство самого бота.
- `Max Chat Administrator`: получение, назначение и снятие администраторов.
- `Max Chat Member`: получение, добавление, удаление и блокировка участников.
- `Max Comment`: создание, чтение, изменение и удаление комментариев к постам каналов.
- `Max Message`: отправка, чтение, изменение и удаление сообщений, вложения и callback-ответы.
- `Max Video`: получение сведений для скачивания видео по токену.
- `Max Subscription`: получение, создание и удаление webhook-подписок.
- `Max Trigger`: входящие события через webhook.

Универсальные ноды `Max` и `Max API` удалены в версии 1.0.0. Обновление существующих workflow выполняется вручную по [таблице миграции](#миграция-с-версий-02x-и-01x).

### Max Message

- Отправка текстовых сообщений с форматированием
- Автоматический fallback в plain text при ошибке Max API о неподдерживаемом Markdown
- Редактирование и удаление сообщений
- Для `Edit Message` нода отправляет `message_id` в query-параметре запроса `PUT /messages?message_id=...`
- В `Edit Message` опция `Disable Link Preview` добавляет `disable_link_preview=true` в query-параметры запроса редактирования
- В `Edit Message` опция `Clear Attachments` удаляет текущие вложения сообщения, включая inline-клавиатуру
- Отправка файлов (изображения, видео, аудио, документы)
- Для вложений в `Send Message` доступны три источника: `Binary Data`, `URL` и готовый `Token` MAX
- В `Send Message` текст не обязателен, если отправляются вложения
- В `Send Message` через `Additional Fields → Reply to Message ID` можно ответить на исходное сообщение, а через `Forward Message ID` — переслать оригинал
- Нода не ограничивает вложения по расширению файла: формат проверяется на стороне Max API
- Payload вложения зависит от типа файла: для `image` используются поля из JSON-ответа upload-шага (`token`/`photos`/`url`), для `file` используется `token` из upload-ответа, а для `video`/`audio` нода также поддерживает токен из `POST /uploads`, если upload endpoint возвращает `retval`
- Если у вас уже есть `payload.token` из Max API, выберите `Attachment Source = Token`: нода отправит вложение без повторного скачивания и upload
- Автоматический ретрай отправки с медиа-вложением при временной ошибке `attachment.not.ready`
- Явная валидация ID получателя: `0` отклоняется с подсказкой по полям из `Max Trigger`
- Интерактивные клавиатуры с кнопками

### Max Chat

- Получение информации о чате
- Выход из групповых чатов

Функциональные ноды сохраняют `int64`-идентификаторы строками и проверяют их signed-int64 диапазон, автоматически переводят старый официальный API host на `platform-api2.max.ru`, нормализуют IDN-домены webhook в Punycode и повторяют отправку при временной обработке медиа. При отказе MAX принять Markdown сообщение один раз повторяется как читаемый plain text.

`GET /chats` намеренно не представлен: с июня 2026 года метод не поддерживается. Long Polling также не вынесен в production-trigger; для постоянных workflow используется `Max Trigger` с webhook.

### Триггер

- Получение событий в реальном времени:
  - Новые сообщения в личных диалогах (`message_created`) и чатах (`message_chat_created`)
  - Нажатия на кнопки
  - События чатов
- Поддержка webhook URL с интернационализированными доменами (IDN/Punycode) для корректной TLS-валидации

> **Изменение типа ID:** `Max Trigger` теперь возвращает числовые поля `id`, `*_id` и элементы массивов `ids`/`*_ids` строками независимо от величины. Это исключает потерю точности и делает схему стабильной, но существующие строгие сравнения с числами (`=== 123`) нужно заменить на сравнение со строкой (`=== '123'`) либо явное преобразование типа.

## Настройка

1. Создайте бота через @PrimeBot в Max мессенджере
2. Получите токен доступа
3. Добавьте токен в настройки ноды в n8n

## Быстрый старт

### Отправка сообщения

1. Добавьте ноду `Max Message` в workflow
2. Выберите операцию "Send Message"
3. Укажите ID получателя; при необходимости добавьте текст
4. Чтобы отправить только файл/медиа, оставьте `Message Text` пустым и добавьте вложение в `Additional Fields → Attachments`
5. Чтобы переиспользовать уже загруженный файл, выберите `Additional Fields → Attachments → Attachment Source = Token` и вставьте `File Token`
6. Запустите workflow

### Пересылка входящего сообщения

1. Добавьте `Max Trigger` и подпишитесь на `message_created` или `message_chat_created`
2. Добавьте `Max Message` → `Send Message`
3. В `Send To` выберите `Chat` и укажите ID группы поддержки
4. Оставьте `Message Text` пустым
5. В `Additional Fields` добавьте `Forward Message ID` и передайте `={{$json.event_context.message_id}}`
6. Оставьте остальные additional fields по необходимости, например `Notify`

### Удаление inline-кнопок при редактировании

1. Выберите операцию `Edit Message`
2. Укажите `Message ID` и новый текст
3. Включите `Clear Attachments`, чтобы Max API получил `attachments: []` и удалил текущую inline-клавиатуру

### Получение сообщений

1. Добавьте ноду Max Trigger
2. Настройте webhook
3. Выберите типы событий для отслеживания

### Остальные операции MAX Bot API

1. Добавьте ноду нужного типа, например `Max Comment` или `Max Chat Administrator`.
2. Выберите операцию — интерфейс покажет только относящиеся к ней поля.
3. Передавайте ID из `Max Trigger` как строки, чтобы не потерять точность `int64`.

## Миграция с версий 0.2.x и 0.1.x

После обновления старые ноды показываются в workflow как неизвестные и не выполняются. Замените их вручную:

| Старая нода и ресурс             | Новая нода                                                    |
| :------------------------------- | :------------------------------------------------------------ |
| `Max` → `Message`                | `Max Message`                                                 |
| `Max` → `Chat`                   | `Max Chat`                                                    |
| `Max API` → `Bot`                | `Max Bot`                                                     |
| `Max API` → `Chat`               | `Max Chat`                                                    |
| `Max API` → `Chat Administrator` | `Max Chat Administrator`                                      |
| `Max API` → `Chat Member`        | `Max Chat Member`                                             |
| `Max API` → `Comment`            | `Max Comment`                                                 |
| `Max API` → `Message`            | `Max Message`; операция `Get Video` переносится в `Max Video` |
| `Max API` → `Subscription`       | `Max Subscription`                                            |

Параметры автоматически не переносятся. Для прежних операций `Max API` → `Message` выберите каноническую операцию новой ноды: `Send Message`, `Edit Message` или `Answer Callback Query`. Получателя задавайте отдельным `User ID` или `Chat ID`; callback переносите в `Callback Query ID`; вложения задавайте через `Additional Fields → Attachments`.

## Ресурсы

- [Документация Max Bot API](https://dev.max.ru/docs-api)
- [GitHub репозиторий](https://github.com/pfrankov/n8n-nodes-max)

## Лицензия

[MIT](LICENSE.md)
