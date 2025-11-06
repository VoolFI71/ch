# Инструкция по загрузке PGN файла через Postman

## Шаг 1: Получить токен авторизации

1. **POST** `http://localhost:8000/api/auth/login`
   - Headers: `Content-Type: application/json`
   - Body (JSON):
   ```json
   {
     "email": "ваш_email@example.com",
     "password": "ваш_пароль"
   }
   ```
   - Сохраните `access_token` из ответа

## Шаг 2: Найти ID курса "Дебют гроба"

1. **GET** `http://localhost:8000/api/courses/`
   - Headers: `Authorization: Bearer {ваш_access_token}`
   - Найдите курс "Опровержение дебюта Гроба" (или похожий)
   - Запишите `id` курса (например, `1`)

## Шаг 3: Найти ID первого урока

1. **GET** `http://localhost:8000/api/courses/{course_id}/lessons/`
   - Замените `{course_id}` на ID курса из шага 2
   - Headers: `Authorization: Bearer {ваш_access_token}`
   - Найдите урок с `order_index: 1` (первый урок)
   - Запишите `id` урока (например, `1`)

## Шаг 4: Прочитать PGN файл

Откройте ваш PGN файл в текстовом редакторе и скопируйте всё содержимое.

## Шаг 5: Обновить урок с PGN контентом

1. **PATCH** `http://localhost:8000/api/courses/{course_id}/lessons/{lesson_id}`
   - Замените `{course_id}` на ID курса
   - Замените `{lesson_id}` на ID урока
   - Headers:
     - `Authorization: Bearer {ваш_access_token}`
     - `Content-Type: application/json`
   - Body (JSON):
   ```json
   {
     "pgn_content": "[Event \"Дебют Гроба - Урок 1\"]\n[Site \"PowerChess\"]\n[Date \"2024.01.15\"]\n[White \"Пример\"]\n[Black \"Защита\"]\n[Result \"1-0\"]\n\n1. g4 d5 2. Bg2 e5 3. c4 c6 4. cxd5 cxd5 5. Nc3 Ne7 \n6. Qb3 Nbc6 7. Qxd5 Qxd5 8. Nxd5 Nxd5 9. Bxd5 Be6 \n10. Bxc6+ bxc6 11. Nf3 Bd6 12. d3 O-O 13. O-O f5 \n14. gxf5 Bxf5 15. Ng5 h6 16. Ne4 Be7 17. Nc3 Bf6 \n18. Be3 Rfd8 19. Rad1 1-0"
   }
   ```
   
   **Важно:** Вставьте полное содержимое вашего PGN файла в поле `pgn_content`. 
   Используйте `\n` для переносов строк или просто вставьте весь текст как есть.

## Альтернативный способ: Создать новый урок с PGN

Если урока еще нет, можно создать новый:

1. **POST** `http://localhost:8000/api/courses/{course_id}/lessons/`
   - Headers:
     - `Authorization: Bearer {ваш_access_token}`
     - `Content-Type: application/json`
   - Body (JSON):
   ```json
   {
     "title": "Урок 1",
     "content": "Описание урока",
     "pgn_content": "[вставьте содержимое PGN файла]",
     "order_index": 1,
     "duration_sec": 0
   }
   ```

## Пример полного PGN файла

```json
{
  "pgn_content": "[Event \"Дебют Гроба - Урок 1\"]\n[Site \"PowerChess\"]\n[Date \"2024.01.15\"]\n[White \"Пример\"]\n[Black \"Защита\"]\n[Result \"1-0\"]\n\n1. g4 d5 2. Bg2 e5 3. c4 c6 4. cxd5 cxd5 5. Nc3 Ne7 6. Qb3 Nbc6 7. Qxd5 Qxd5 8. Nxd5 Nxd5 9. Bxd5 Be6 10. Bxc6+ bxc6 11. Nf3 Bd6 12. d3 O-O 13. O-O f5 14. gxf5 Bxf5 15. Ng5 h6 16. Ne4 Be7 17. Nc3 Bf6 18. Be3 Rfd8 19. Rad1 1-0"
}
```

## Проверка результата

После успешного обновления:

1. **GET** `http://localhost:8000/api/pgn-files/`
   - Headers: `Authorization: Bearer {ваш_access_token}`
   - Вы должны увидеть ваш файл в формате: `"Название курса" Урок 1`

