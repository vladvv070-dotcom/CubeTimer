# Настройка таблицы лидеров Next Cube Pro

Интерфейс таблицы уже находится на сайте, но запись и чтение заработают после однократной настройки Upstash и Cloudflare Worker.

## 1. Создание базы Upstash Redis

1. Откройте <https://console.upstash.com/> и войдите или создайте аккаунт.
2. Нажмите **Create Database**.
3. В поле имени укажите `next-cube-pro-leaderboard`.
4. Выберите ближайший к большинству пользователей регион. Если основная аудитория в Европе, выбирайте европейский регион.
5. Оставьте бесплатный тариф и нажмите **Create**.
6. Откройте созданную базу.
7. Найдите блок **REST API**.
8. Скопируйте отдельно:
   - `UPSTASH_REDIS_REST_URL` — адрес базы;
   - `UPSTASH_REDIS_REST_TOKEN` — обычный Standard Token.
9. Не публикуйте Standard Token, не вставляйте его в `leaderboard.js`, `index.html` или GitHub. Он будет сохранён только как зашифрованный секрет Cloudflare.

Создавать коллекции, таблицы или ключи вручную не требуется. Worker создаст Sorted Sets и профили автоматически при первой отправке результата.

## 2. Создание Cloudflare Worker через терминал

Откройте терминал VS Code в папке проекта и выполните:

```powershell
cd leaderboard-worker
npm install
npx wrangler login
```

Браузер откроет Cloudflare. Разрешите Wrangler доступ к аккаунту.

Теперь добавьте два секрета. После каждой команды терминал попросит вставить значение:

```powershell
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
```

- В первую команду вставьте REST URL из Upstash.
- Во вторую — Standard REST Token.
- Вводимый секрет может не отображаться в терминале — это нормально.

Разверните Worker:

```powershell
npx wrangler deploy
```

В конце Cloudflare покажет адрес примерно такого вида:

```text
https://next-cube-pro-leaderboard.ИМЯ-ПОДДОМЕНА.workers.dev
```

Скопируйте его.

## 3. Подключение адреса Worker к сайту

Откройте `leaderboard.js`. В начале файла находится строка:

```js
const API_URL='https://next-cube-pro-leaderboard.YOUR-SUBDOMAIN.workers.dev';
```

Замените адрес внутри кавычек на адрес, который показал `wrangler deploy`. Не добавляйте `/` в конце.

Пример:

```js
const API_URL='https://next-cube-pro-leaderboard.viler-cubing.workers.dev';
```

## 4. Проверка Worker до публикации сайта

Откройте в браузере:

```text
АДРЕС_WORKER/health
```

Правильный ответ:

```json
{"ok":true}
```

После этого опубликуйте обновлённые файлы сайта. Войдите в аккаунт Next Cube Pro, сделайте или синхронизируйте сборку и откройте **More → Таблица лидеров**.

## 5. Что создаётся в Upstash автоматически

- `ncp:profiles` — публичный ник и установленный титул пользователя.
- `ncp:board:coins` — монеты.
- `ncp:board:streak` — текущий стрик.
- `ncp:board:totalSolves` — количество сборок.
- `ncp:board:trainingTime` — тренировочное время.
- `ncp:board:pb:<discipline>` — PB Single.
- `ncp:board:best:<discipline>:<average>` — Best Ao5/Ao12/Ao50/Ao100.
- `ncp:board:current:<discipline>:<average>` — Current Ao5/Ao12/Ao100.
- `ncp:board:daily:<date>:<discipline>` — первая попытка скрамбла дня.
- `ncp:daily:dates` — список дат для Зала славы.

## 6. Как обеспечивается безопасность

1. Сайт получает временный Firebase ID token авторизованного пользователя.
2. Сайт отправляет token в Cloudflare Worker по HTTPS.
3. Worker проверяет token через Firebase Authentication и получает UID.
4. Только Worker имеет Standard Token Upstash и право записи.
5. Результат скрамбла дня записывается через Redis `ZADD NX`: после первой принятой попытки изменить её следующей попыткой нельзя.
6. На одного пользователя действует ограничение частоты обновлений.

Публичный репозиторий не содержит приватных ключей. В `wrangler.toml` находятся только Firebase Web API Key и список разрешённых адресов — Firebase Web API Key является конфигурационным идентификатором клиентского приложения, а не серверным секретом.

## 7. Обновление Worker в будущем

После изменения файлов внутри `leaderboard-worker` выполните:

```powershell
cd leaderboard-worker
npx wrangler deploy
```

Повторно вводить Upstash-секреты не нужно: Cloudflare сохраняет их между развёртываниями.

## 8. Если таблица не работает

1. Проверьте `АДРЕС_WORKER/health`.
2. Проверьте, что в `leaderboard.js` нет текста `YOUR-SUBDOMAIN`.
3. Убедитесь, что пользователь вошёл в аккаунт Firebase.
4. В Cloudflare откройте **Workers & Pages → next-cube-pro-leaderboard → Logs**.
5. В Upstash откройте базу и проверьте появление ключей `ncp:*`.
6. Если Worker отвечает `401`, выйдите из аккаунта Next Cube Pro и войдите снова.
7. Если Worker отвечает `429`, подождите 8 секунд — это штатное ограничение частоты записи.
