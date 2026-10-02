# n8n-nodes-max

[![npm version](https://img.shields.io/npm/v/n8n-nodes-max?logo=npm)](https://www.npmjs.com/package/n8n-nodes-max)

Набор функциональных нод для интеграции мессенджера MAX с n8n.
<img width="518" height="429" alt="image" src="https://github.com/user-attachments/assets/577165bb-510f-4523-b898-76ea94dc0f2b" />

## Установка

### Для self-hosted n8n

В `Settings → Community Nodes` нажмите `Install` и укажите `n8n-nodes-max`. Устанавливать community nodes могут владелец и администраторы экземпляра n8n.

Для ручной установки выполните команды в окружении, где работает n8n, затем перезапустите n8n:

```bash
mkdir -p ~/.n8n/nodes
cd ~/.n8n/nodes
npm install n8n-nodes-max
```

### Для n8n Cloud

В n8n Cloud доступны только проверенные community nodes из каталога нод. Если `n8n-nodes-max` отсутствует в вашем каталоге, установить его по имени npm-пакета в Cloud нельзя; используйте self-hosted n8n.

**Полезные ссылки:**

- [Установка и управление community nodes](https://docs.n8n.io/integrations/community-nodes/installation-and-management)
- [Ручная установка](https://docs.n8n.io/integrations/community-nodes/installation-and-management/manual-installation)
- [Установка проверенных нод](https://docs.n8n.io/integrations/community-nodes/installation-and-management/install-verified-community-nodes)

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
- Явная валидация ID получателя: `0` отклоняется с подсказкой по полям из `Max Trigger`; числовые ID за пределами безопасного диапазона JavaScript отклоняются до отправки. Передавайте такие ID строками
- Интерактивные клавиатуры с кнопками

### Max Chat

- Получение информации о чате
- Выход из групповых чатов

Ноды проверяют signed-int64 диапазон входных ID без округления, автоматически переводят старый официальный API host на `platform-api2.max.ru`, нормализуют IDN-домены webhook в Punycode и повторяют отправку при временной обработке медиа. В ответах `Send Message`, `Edit Message`, `Delete Message`, `Answer Callback Query`, `Get Chat Info` и `Leave Chat` безопасные числовые ID сохраняют прежний тип number, а целые значения вне безопасного диапазона JavaScript возвращаются точными строками. Остальные операции и `Max Trigger` нормализуют ID в строки. При отказе MAX принять Markdown сообщение один раз повторяется как читаемый plain text.

`GET /chats` намеренно не представлен: с июня 2026 года метод не поддерживается. Long Polling также не вынесен в production-trigger; для постоянных workflow используется `Max Trigger` с webhook.

### Триггер

- Получение событий в реальном времени:
  - Новые сообщения в личных диалогах (`message_created`) и чатах (`message_chat_created`)
  - Нажатия на кнопки
  - События чатов
- Поддержка webhook URL с интернационализированными доменами (IDN/Punycode) для корректной TLS-валидации
- Для `message_callback` фильтр `User IDs` и `metadata.user_context` используют пользователя, нажавшего кнопку (`callback.user`), а не автора сообщения с кнопкой
- Разные события получают разные `event_id`; повторная доставка одного события с теми же полями и timestamp сохраняет ID. После обновления формат `event_id` меняется: учитывайте это, если храните старые ID для дедупликации
- Ответ MAX `success: false` при создании подписки прерывает активацию; при удалении подписки возвращается признак неудачи
- Если задан `Additional Fields → Webhook Secret`, входящий заголовок `X-Max-Bot-Api-Secret` должен точно совпадать с секретом: запросы без него, с другим значением или несколькими значениями получают HTTP 403 и не запускают workflow. Пробелы по краям настроенного секрета удаляются так же, как при регистрации подписки; значение заголовка не обрезается. Без секрета поведение прежнее.

После добавления или смены `Webhook Secret` деактивируйте и снова активируйте workflow, чтобы MAX использовал тот же секрет в подписке. [MAX рекомендует проверять этот заголовок](https://dev.max.ru/docs-api/methods/POST/subscriptions).

> **Изменение типа ID:** `Max Trigger` теперь возвращает числовые поля `id`, `*_id` и элементы массивов `ids`/`*_ids` строками независимо от величины. Это исключает потерю точности и делает схему стабильной, но существующие строгие сравнения с числами (`=== 123`) нужно заменить на сравнение со строкой (`=== '123'`) либо явное преобразование типа.

## Настройка

1. Создайте бота через @PrimeBot в Max мессенджере
2. Получите токен доступа
3. Добавьте токен в настройки ноды в n8n

### Ошибки SSL-сертификата

При ошибке доверия к сертификату предпочтительно настроить доверенный CA в окружении n8n, сохранив проверку TLS. Используйте сертификат из проверенного источника; не отключайте проверку для всего процесса через `NODE_TLS_REJECT_UNAUTHORIZED=0`.

В credentials `Max API` доступна опция **Ignore SSL Issues (Insecure)**. Она выключена по умолчанию. При явном включении проверка сертификата пропускается для теста credentials, запросов к MAX API, управления webhook-подписками и обоих этапов загрузки вложений с этими credentials.

**Это небезопасное исключение:** без проверки подлинности сервера злоумышленник может перехватить токен бота и данные. После настройки доверия к CA выключите опцию и повторите тест credentials. Автоматического отключения проверки после ошибки сертификата нет; старые credentials без нового поля сохраняют прежнее поведение.

Опция не отключает проверку TLS при скачивании вложений с произвольного URL, не меняет другие credentials и не исправляет сертификат входящего webhook: его проверяет сервер MAX, а не эта нода.

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
