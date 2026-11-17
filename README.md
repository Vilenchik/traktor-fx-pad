# Traktor FX Pad — PWA для Android

Файлы: `index.html`, `app.js`, `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`.

## 1. Хостинг (нужен https, иначе Web MIDI выключен)

**GitHub Pages (бесплатно, навсегда):**
1. github.com → New repository, например `fx-pad`, Public.
2. Add file → Upload files → перетащить все 6 файлов → Commit.
3. Settings → Pages → Source: *Deploy from a branch*, Branch: `main` / `(root)` → Save.
4. Через 1–2 минуты сайт будет на `https://<ваш-логин>.github.io/fx-pad/`.

Альтернатива без git: Cloudflare Pages → Create → Upload assets → перетащить папку.

## 2. Телефон
1. Открыть ссылку в **Chrome**, меню ⋮ → «Добавить на главный экран» (установится как приложение).
2. USB-кабель к ПК → в шторке уведомление «USB» → режим **MIDI**.
3. Запустить FX Pad, разрешить доступ к MIDI. Вверху должна загореться зелёная точка и имя порта.
   Если портов нет — ⚙ → «Переподключить MIDI».

## 3. Traktor Pro 3: маппинг
Preferences → Controller Manager → Add… → Generic MIDI.
In-Port / Out-Port: устройство телефона (на Windows обычно с именем модели или «Android»).

FX Unit должен быть в режиме **Group** (3 эффекта, как на скриншоте).
Самый простой способ: Add In… → выбрать команду → **Learn** → в приложении ⚙ → нажать ▶ у нужной строки.

| CC (Unit 1 / Unit 2) | Команда Traktor | Тип / Interaction |
|---|---|---|
| 20 / 40 | FX Unit → Dry/Wet Adjust | Fader/Knob, Direct |
| 21 / 41 | FX Unit → Knob 1 (XY по X) | Fader/Knob, Direct |
| 22 / 42 | FX Unit → Knob 2 (XY по Y) | Fader/Knob, Direct |
| 23 / 43 | FX Unit → Button 1 | Button, Hold |
| 24 / 44 | FX Unit → Button 2 | Button, Hold |
| 25 / 45 | FX Unit → Effect Selector, FX Select 1 | Button, **Dec** |
| 26 / 46 | FX Unit → Effect Selector, FX Select 1 | Button, **Inc** |
| 27 / 47 | FX Unit → Effect Selector, FX Select 2 | Button, Dec |
| 28 / 48 | FX Unit → Effect Selector, FX Select 2 | Button, Inc |
| 29 / 49 | Mixer → FX Unit 1/2 On, Assignment: **Deck A** | Button, Hold |
| 30 / 50 | Mixer → FX Unit 1/2 On, Assignment: **Deck B** | Button, Hold |

Для всех команд FX Unit укажите Assignment: FX Unit 1 или FX Unit 2. Канал MIDI: 1 (меняется в ⚙).

### Обратная связь (необязательно, но тогда названия эффектов всегда точные)
Add Out… → FX Unit → Effect Selector (FX Select 1), CC **32 / 52**; для FX Select 2 — CC **33 / 53**.
Controller Range: Min 0, Max 127; MIDI Range: Min 0, Max 127, чтобы приходил номер эффекта как есть.
Названия эффектов по MIDI не передаются, только номер. Когда номер приходит, он виден мелко над
названием (`FX 1 · 14`). Если название не совпало с Traktor — удержите его и выберите правильное:
приложение запомнит «этот номер = этот эффект» навсегда. Достаточно один раз пролистать свои эффекты.
Без Out-маппинга приложение считает номер само по нажатиям ‹ ›, и удержание просто исправляет счётчик.

## 4. Список эффектов
⚙ → «Список эффектов»: одна строка на эффект, в том же порядке, что в
Preferences → Effects → Pre-selection. Первая строка — `No Effect`.

## Управление
- **Ползунок D/W** (режим по умолчанию «По касанию»): задаёт глубину эффекта. Палец на пэде — Dry/Wet
  встаёт на это значение, палец убрали — Dry/Wet в 0. Пока пэд не трогают, ползунок полупрозрачный.
  В ⚙ можно вернуть режим «Только ползунком» (обычный Dry/Wet).
- **XY-пэд**: X = параметр эффекта 1, Y = параметр эффекта 2.
  Кнопка **↺ 0** в шапке юнита: при отпускании XY возвращается в 0. В ⚙ — «Касание = FX вкл».
- **Название эффекта**: тап включает/выключает эффект, долгое нажатие исправляет отображаемое название.
- **‹ ›**: листать эффекты.
- **A / B**: на какую деку повешен юнит (этим же эффект и включается на деке).
- **⛶**: полный экран + горизонтальная ориентация, экран не гаснет.
