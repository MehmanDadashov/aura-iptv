# Google Play Store - Полный чеклист для публикации AURA IPTV

## 1. ОБЯЗАТЕЛЬНЫЕ АССЕТЫ

### Иконка приложения
- **Размер:** 512×512 px
- **Формат:** PNG (32-bit, без альфа-канала)
- **Файл:** `playstore_ready/icons/icon_heart_512.png`
- **Требования:** Без текста, читаемая на любом фоне

### Feature Graphic (баннер)
- **Размер:** 1024×500 px
- **Формат:** PNG или JPEG
- **Файл:** `playstore_ready/graphics/feature_graphic_1024x500.png`

### Скриншоты (минимум 2, максимум 8)
- **Телефон:** 16:9 или 9:16, мин. 320px, макс. 3840px
- **Планшет (7"):** 16:9 или 9:16
- **Планшет (10"):** 16:9 или 9:16
- **Статус:** Требуется создать скриншоты из приложения

### Видео (опционально)
- **Формат:** YouTube URL
- **Длительность:** 30 сек - 2 мин

---

## 2. ИНФОРМАЦИЯ О ПРИЛОЖЕНИИ

### Основное
| Поле | Значение |
|---|---|
| **Название** | AURA IPTV |
| **Краткое описание** (80 симв.) | Free IPTV player - 11000+ live TV channels from 180+ countries |
| **Полное описание** (4000 симв.) | См. ниже |
| **Категория** | Entertainment |
| **Тип контента** | Everyone (3+) |
| **Email разработчика** | [ВАШ EMAIL] |
| **Сайт** | https://tv.ai-studio.se |
| **Политика конфиденциальности** | https://tv.ai-studio.se/privacy (требуется создать) |

### Полное описание (готово к копированию):
```
AURA IPTV — бесплатный онлайн IPTV плеер. Смотрите 11000+ прямых телеканалов из 180+ стран мира. Фильмы, спорт, новости, музыка, детские каналы. Без регистрации и подписки.

Возможности:
• 11000+ бесплатных прямых телеканалов
• Просмотр по странам, категориям и языкам
• Избранное для быстрого доступа
• Встроенный видеоплеер с поддержкой HLS
• Тёмная тема, оптимизированная для просмотра
• Без регистрации и подписки
• Лёгкое и быстрое приложение
• Chromecast и AirPlay поддержка
• Проверка статуса каналов

Примечание: AURA IPTV не хранит контент. Все потоки предоставлены сторонними источниками.

Поддержка: https://tv.ai-studio.se
```

---

## 3. ТЕХНИЧЕСКИЕ ТРЕБОВАНИЯ

### Формат загрузки
- **AAB (Android App Bundle)** — обязательно для Play Store
- **APK** — только для тестирования
- **Команда сборки:** `gradle bundleRelease`

### Подпись приложения
- **Keystore:** Требуется создать (keytool -genkey)
- **Alias:** aura-iptv
- **Пароль:** [ВАШ ПАРОЛЬ]
- **Срок действия:** 25+ лет

### Целевая аудитория
- **Минимальный API:** 24 (Android 7.0)
- **Целевой API:** 36 (Android 15)
- **Архитектуры:** arm64-v8a, armeabi-v7a, x86, x86_64

### Разрешения
- `INTERNET` — для загрузки каналов и стримов
- `ACCESS_NETWORK_STATE` — проверка подключения

---

## 4. ФОРМА БЕЗОПАСНОСТИ ДАННЫХ (Data Safety)

| Вопрос | Ответ |
|---|---|
| Собирает ли приложение данные? | Нет |
| Передаёт ли данные третьим сторонам? | Нет |
| Использует ли шифрование? | Да (HTTPS) |
| Можно ли удалить данные? | N/A (не собираются) |

---

## 5. РЕЙТИНГ КОНТЕНТА (IARC)
- **Возрастной рейтинг:** 3+ (Everyone)
- **Категория:** Entertainment
- **Насилие:** Нет
- **Сексуальный контент:** Нет
- **Ненормативная лексика:** Нет
- **Азартные игры:** Нет

---

## 6. ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ (требуется создать)

Шаблон для https://tv.ai-studio.se/privacy:
```
Privacy Policy for AURA IPTV

AURA IPTV does not collect, store, or share any personal data.
The app does not require registration or login.
All channels and streams are provided by third-party sources.
The app uses Google AdSense for advertising (web version).
The app uses Google AdMob for advertising (Android version).

Contact: [ВАШ EMAIL]
Last updated: [ДАТА]
```

---

## 7. ЧЕКЛИСТ ПЕРЕД ПУБЛИКАЦИЕЙ

- [ ] Создать Keystore для подписи
- [ ] Собрать AAB (не APK): `gradle bundleRelease`
- [ ] Подписать AAB
- [ ] Загрузить AAB в Google Play Console
- [ ] Заполнить Store Listing (название, описание, иконка, скриншоты)
- [ ] Загрузить Feature Graphic
- [ ] Заполнить Data Safety форму
- [ ] Пройти Content Rating (IARC)
- [ ] Создать Privacy Policy и разместить на сайте
- [ ] Указать email разработчика
- [ ] Выбрать страну распространения
- [ ] Установить цену (Free)
- [ ] Отправить на проверку

---

## 8. КОМАНДЫ ДЛЯ СБОРКИ AAB

```bash
# 1. Создать keystore
keytool -genkey -v -keystore aura-iptv.keystore -alias aura-iptv -keyalg RSA -keysize 2048 -validity 10000

# 2. Собрать AAB
cd /home/amir/iptv_node/android
export ANDROID_HOME=/usr/lib/android-sdk
export PATH=/opt/gradle/gradle-8.14.3/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/35.0.1:$PATH
gradle bundleRelease

# 3. AAB будет в:
# android/app/build/outputs/bundle/release/app-release.aab
```

---

## 9. ФАЙЛЫ (все готовы)

| Файл | Путь | Статус |
|---|---|---|
| Иконка 512×512 | `playstore_ready/icons/icon_heart_512.png` | ✅ |
| Иконка 192×192 | `playstore_ready/icons/icon_heart_192.png` | ✅ |
| Feature Graphic | `playstore_ready/graphics/feature_graphic_1024x500.png` | ✅ |
| Скриншоты | `playstore_ready/screenshots/` | ⚠️ Требуется |
| AAB | `android/app/build/outputs/bundle/release/` | ⚠️ Требуется сборка |
| Privacy Policy | `https://tv.ai-studio.se/privacy` | ⚠️ Требуется создать |

---

## 10. ОСНОВНЫЕ ПРАВИЛА GOOGLE PLAY

1. **Запрещён контент:** пиратский контент, порнография, насилие
2. **IPTV приложения:** Разрешены, но не должны распространять пиратский контент
3. **Реклама:** Должна быть чётко обозначена, не вводить в заблуждение
4. **Разрешения:** Только необходимые, с обоснованием
5. **Политика конфиденциальности:** Обязательна для всех приложений
6. **Data Safety:** Обязательна для всех приложений
7. **Content Rating:** Обязателен для всех приложений
8. **Target API:** Должен быть актуальным (API 34+ для 2025)

---

## ЧТО ТРЕБУЕТСЯ ОТ ВАС:
1. **Email разработчика** — для Google Play Console
2. **Keystore пароль** — для подписи приложения
3. **Скриншоты** — минимум 2 из приложения
4. **Privacy Policy URL** — разместить на сайте
5. **Google Play Console аккаунт** — $25 единоразовый взнос
EOF

print("Play Store checklist created")