const TelegramBot = require('node-telegram-bot-api');
const { Client } = require('pg');
require('dotenv').config()

const adminIds = [6705013765, 379802426]; // ID администраторов
const adminChatId = 6705013765; // Замените на ваш chatId администратора


const token = process.env.TG_BOT_ID;
const bot = new TelegramBot(token, { polling: true });

const dbClient = new Client({
    user: process.env.DB_USERNAME,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASS,
    port: process.env.DC_PORT,
});

dbClient.connect();

function isAdmin(chatId) {
    return adminIds.includes(chatId);
}

const mainMenu = {
    reply_markup: {
        keyboard: [
            [{ text: 'Задания' }, { text: 'Список лидеров' }],
            [{ text: 'Мой профиль' }, { text: 'Помощь' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

const adminMenu = {
    reply_markup: {
        keyboard: [
            [{ text: 'Задания' }, { text: 'Список лидеров' }],
            [{ text: 'Мой профиль' }, { text: 'Помощь' }],
            [{ text: 'Группы' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

// Отправляем основное меню при запуске бота
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || "Не указано";  // Если имя пользователя не указано, ставим "Не указано"
    const firstName = msg.from.first_name || "Не указано"; // Имя пользователя
    const lastName = msg.from.last_name || "Не указано"; // Фамилия пользователя (если есть)

    try {
        // Проверяем, существует ли пользователь в базе данных
        const res = await dbClient.query('SELECT * FROM users WHERE user_id = $1', [chatId]);

        if (res.rows.length === 0) {
            // Если пользователя нет в базе, добавляем нового
            await dbClient.query(
                'INSERT INTO users (user_id, username, first_name, last_name, points) VALUES ($1, $2, $3, $4, $5)',
                [chatId, username, firstName, lastName, 0] // По умолчанию 0 баллов
            );
            bot.sendMessage(chatId, `Добро пожаловать, ${firstName}!`);
        } else {
            // Если пользователь уже есть в базе, просто приветствуем его
            bot.sendMessage(chatId, `С возвращением ${firstName}!`);
        }

        // Показать главное меню после того как пользователь зарегистрирован
        bot.sendMessage(chatId, 'Выберите действие:', chatId === adminChatId ? adminMenu : mainMenu); // mainMenu — это ваше главное меню

    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Произошла ошибка при обработке команды /start.');
    }
});




// Обработка кнопки "Задания"
bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    if (msg.text === 'Задания') {
        // Проверяем, является ли пользователь администратором
        if (chatId === adminChatId) {
            // Подменю для администратора
            bot.sendMessage(chatId, 'Выберите действие:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Добавить задание', callback_data: 'add_task' }],
                        [{ text: 'Проверить задание', callback_data: 'check_task' }],
                        // [{ text: 'Назад в меню', callback_data: 'back_to_menu' }]
                    ]
                }
            });
        } else {
            // Подменю для обычного пользователя
            bot.sendMessage(chatId, 'Выберите действие:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Получить задание', callback_data: 'get_task' }],
                        [{ text: 'Отправить ответ', callback_data: 'send_answer' }],
                        [{ text: 'Текущее задание', callback_data: 'task_status' }],
                        // [{ text: 'Назад в меню', callback_data: 'back_to_menu' }]
                    ]
                }
            });
        }
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    if (msg.text === 'Группы') {
        // Проверяем, является ли пользователь администратором
        if (chatId === adminChatId) {
            // Подменю для администратора
            bot.sendMessage(chatId, 'Выберите действие:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Создать группу', callback_data: 'create_group' }],
                        [{ text: 'Добавить в группу', callback_data: 'add_group' }],
                        [{ text: 'Сменить группу', callback_data: 'change_group' }],
                        // [{ text: 'Назад в меню', callback_data: 'back_to_menu' }]
                    ]
                }
            });
        } else {
            // Подменю для обычного пользователя
            bot.sendMessage(chatId, 'В работе...', {

            });
        }
    }
});


// Обработка действий подменю
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.message.from.id;
    const data = callbackQuery.data;

    if (data === 'get_task') {
        try {
            // Получаем случайное задание, которое пользователь еще не выполнял
            const res = await dbClient.query(
                `SELECT * FROM tasks 
                 WHERE id NOT IN (SELECT task_id FROM completed_tasks WHERE user_id = $1) 
                 ORDER BY RANDOM() LIMIT 1`,
                [chatId]
            );

            if (res.rows.length > 0) {
                const task = res.rows[0];

                // Сохраняем это задание как текущее у пользователя
                await dbClient.query('UPDATE users SET current_task = $1 WHERE user_id = $2', [task.id, chatId]);

                // Отправляем задание пользователю
                bot.sendMessage(chatId, `Ваше задание: ${task.task_text}`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Отправить ответ', callback_data: 'send_answer' }]
                        ]
                    }
                });
            } else {
                bot.sendMessage(chatId, 'На данный момент нет доступных заданий.');
            }
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, 'Произошла ошибка при получении задания.');
        }
    } else if (data === 'send_answer') {
        // Логика для отправки ответа на задание
        bot.sendMessage(chatId, 'Введите ваш ответ:');

        // Ожидаем следующий текст пользователя как ответ
        bot.once('message', async (msg) => {

            try {
                // Получаем текущее задание пользователя
                const taskRes = await dbClient.query(
                    'SELECT * FROM tasks WHERE id = (SELECT current_task FROM users WHERE user_id = $1)',
                    [chatId]
                );

                if (taskRes.rows.length === 0) {
                    bot.sendMessage(chatId, 'У вас нет активного задания.');
                    return;
                }

                const task = taskRes.rows[0];
                console.log(task);

                const correctAnswers = task.correct_answers.split(' '); // Предполагаем, что ответы хранятся через пробел

                // Проверяем тип ответа
                let responseFileId = null;
                if (task.response_type === 'text') {

                    const answer = msg.text.toLowerCase();
                    if (!msg.text) {
                        return bot.sendMessage(chatId, 'Это задание требует текстового ответа.');
                    }
                    // Проверяем правильность ответа
                    if (correctAnswers.includes(answer.trim())) {
                        // Начисляем баллы и отмечаем задание выполненным
                        await dbClient.query('UPDATE users SET points = points + $1, current_task = NULL WHERE user_id = $2', [task.points, chatId]);
                        await dbClient.query('INSERT INTO completed_tasks (user_id, task_id, is_approved) VALUES ($1, $2, TRUE)', [chatId, task.id]);

                        bot.sendMessage(chatId, `Поздравляем! Ваш ответ правильный. Вам начислено ${task.points} баллов.`);
                    } else {
                        // Если ответ неверный, сообщаем пользователю и оставляем задание активным
                        bot.sendMessage(chatId, 'Ответ неверный. Попробуйте еще раз.');
                    }

                } else if (task.response_type === 'image') {
                    if (!msg.photo) {
                        return bot.sendMessage(chatId, 'Это задание требует отправки изображения.');
                    }
                    responseFileId = msg.photo[msg.photo.length - 1].file_id;
                } else if (task.response_type === 'audio') {
                    if (!msg.audio) {
                        return bot.sendMessage(chatId, 'Это задание требует отправки аудио.');
                    }
                    responseFileId = msg.audio.file_id;
                } else if (task.response_type === 'video') {
                    if (!msg.video) {
                        return bot.sendMessage(chatId, 'Это задание требует отправки видео.');
                    }
                    responseFileId = msg.video.file_id;
                }

            } catch (error) {
                console.error(error);
                bot.sendMessage(chatId, 'Произошла ошибка при проверке ответа.');
            }
        });
        // bot.sendMessage(chatId, 'Пожалуйста, отправьте свой ответ в виде текста или изображения.');
    } else if (data === 'task_status') {
        const taskRes = await dbClient.query(
            'SELECT tasks.task_text FROM tasks JOIN users ON tasks.id = users.current_task WHERE users.user_id = $1',
            [chatId]
        );
        // Логика для проверки статуса текущего задания 
        bot.sendMessage(chatId, `${taskRes.rows[0].task_text}`);
    }

    // Подтверждаем обработку callback_query
    bot.answerCallbackQuery(callbackQuery.id);
});

// Обработчик кнопки "Список лидеров"
bot.onText(/Список лидеров/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        // Запрос на получение топ-10 пользователей по количеству баллов
        const res = await dbClient.query(
            `SELECT first_name, last_name, points 
             FROM users 
             ORDER BY points DESC 
             LIMIT 10`
        );

        // Формируем сообщение с лидерами
        if (res.rows.length > 0) {
            let leaderboard = '🏆 Топ-10 пользователей по очкам 🏆\n\n';
            res.rows.forEach((user, index) => {
                let name = `${user.first_name} ${user.last_name}`
                leaderboard += `${index + 1}. ${name || 'Аноним'} - ${user.points} очков\n`;
            });
            bot.sendMessage(chatId, leaderboard);
        } else {
            bot.sendMessage(chatId, 'Список лидеров пуст. Пока никто не набрал очков.');
        }
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Произошла ошибка при получении списка лидеров.');
    }
});

// Обработчик кнопки "Мой профиль"
bot.onText(/Мой профиль/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        // Получаем информацию о пользователе из базы данных
        const res = await dbClient.query(
            `SELECT first_name, last_name, points, secret_santa, groupname
             FROM users 
             WHERE user_id = $1`,
            [chatId]
        );

        if (res.rows.length > 0) {
            const user = res.rows[0];
            const fullName = `${user.first_name} ${user.last_name}`;
            const points = user.points;
            const group = user.groupname;
            const santaStatus = user.secret_santa ? 'Да' : 'Нет';

            // Формируем сообщение с профилем пользователя
            const profileMessage =
                `👤 Профиль\n\n` +
                `Полное имя: ${fullName}\n` +
                `Очки: ${points}\n` +
                `Группа: ${group}\n` +
                `Участвует в Тайном Санте: ${santaStatus}`;

            // Отправляем сообщение с профилем и кнопками для изменения
            bot.sendMessage(chatId, profileMessage, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Изменить имя', callback_data: 'change_name' }],
                        [{ text: 'Изменить участие в Тайном Санте', callback_data: 'toggle_santa_status' }]
                    ]
                }
            });
        } else {
            bot.sendMessage(chatId, 'Ваш профиль не найден.');
        }
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Произошла ошибка при получении профиля.');
    }
});


bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'add_task') {
        await bot.sendMessage(chatId, 'Введите текст задания:');
        bot.once('message', async (msg) => {
            const taskText = msg.text;

            await bot.sendMessage(msg.chat.id, 'Укажите количество баллов за выполнение задания:');
            bot.once('message', async (msg) => {
                const taskPoints = parseInt(msg.text, 10);

                if (isNaN(taskPoints)) {
                    return bot.sendMessage(msg.chat.id, 'Ошибка: введите корректное число для баллов.');
                }

                const keyboard = {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: 'Текст', callback_data: 'response_type_text' },
                                { text: 'Изображение', callback_data: 'response_type_image' },
                            ],
                            [
                                { text: 'Аудио', callback_data: 'response_type_audio' },
                                { text: 'Видео', callback_data: 'response_type_video' },
                            ],
                        ],
                    },
                };

                await bot.sendMessage(msg.chat.id, 'Выберите тип ответа для задания:', keyboard);

                bot.once('callback_query', async (responseQuery) => {
                    const responseType = responseQuery.data.replace('response_type_', '');

                    await bot.sendMessage(
                        responseQuery.message.chat.id,
                        `Создание задания завершено. Текст: "${taskText}", Баллы: ${taskPoints}, Тип ответа: ${responseType}`
                    );

                    // Добавляем задание в БД
                    try {
                        await dbClient.query(
                            'INSERT INTO tasks (task_text, points, response_type) VALUES ($1, $2, $3)',
                            [taskText, taskPoints, responseType]
                        );
                        bot.sendMessage(responseQuery.message.chat.id, 'Задание успешно добавлено!');
                    } catch (error) {
                        console.error('Ошибка при добавлении задания:', error);
                        bot.sendMessage(responseQuery.message.chat.id, 'Ошибка при добавлении задания.');
                    }
                });
            });
        });
    } else if (data === 'check_task') {
        // Логика для проверки задания
        bot.sendMessage(chatId, 'Выберите задание для проверки...');
        // Здесь можно добавить функционал для выбора задания для проверки
    } else if (data === 'back_to_menu') {
        // Возврат к основному меню
        bot.sendMessage(chatId, 'Возвращаемся в главное меню.', mainMenu);
    } else if (data === 'change_name') {
        bot.sendMessage(chatId, 'Введите ваше новое полное имя.');
        bot.once('message', async (msg) => {
            const [firstName, lastName] = msg.text.split(' ');
            try {
                await dbClient.query(
                    `UPDATE users SET first_name = $1, last_name = $2 WHERE user_id = $3`,
                    [firstName, lastName || '', chatId]
                );
                bot.sendMessage(chatId, `Ваше имя успешно обновлено на: ${firstName} ${lastName || ''}`);
            } catch (error) {
                console.error(error);
                bot.sendMessage(chatId, 'Ошибка при обновлении имени.');
            }
        });
    } else if (data === 'toggle_santa_status') {// Обработчик кнопки "Изменить участие в Тайном Санте"
        try {
            // Переключаем статус
            const res = await dbClient.query(
                `UPDATE users 
                 SET secret_santa = NOT secret_santa 
                 WHERE user_id = $1 
                 RETURNING secret_santa`,
                [chatId]
            );
            const newStatus = res.rows[0].secret_santa ? 'Да' : 'Нет';
            bot.sendMessage(chatId, `Ваш статус участия в Тайном Санте изменен на: ${newStatus}`);
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, 'Ошибка при обновлении статуса участия в Тайном Санте.');
        }
    }

    // Подтверждаем обработку callback_query
    bot.answerCallbackQuery(callbackQuery.id);
});

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    if (chatId === adminChatId) {

        if (data === 'create_group') {
            bot.sendMessage(chatId, 'Введите название новой группы.');
            bot.once('message', async (groupNameMsg) => {
                const groupName = groupNameMsg.text.trim();

                try {
                    await dbClient.query(
                        `INSERT INTO groups (name) VALUES ($1)`,
                        [groupName]
                    );
                    bot.sendMessage(chatId, `Группа "${groupName}" успешно создана.`);
                } catch (error) {
                    console.error(error);
                    bot.sendMessage(chatId, `Ошибка при создании группы. Возможно, такая группа уже существует.`);
                }
            });
        } else if (data === 'add_group') {
            try {
                // Получаем список всех групп
                const groups = await dbClient.query(`SELECT id, name FROM groups`);
                if (groups.rows.length === 0) {
                    return bot.sendMessage(chatId, 'Группы еще не созданы.');
                }

                // Создаем кнопки для выбора группы
                const groupOptions = groups.rows.map((group) => ({
                    text: group.name,
                    callback_data: `select_group_${group.id}_${group.name}`,
                }));

                bot.sendMessage(chatId, 'Выберите группу:', {
                    reply_markup: {
                        inline_keyboard: groupOptions.map((option) => [option]),
                    },
                });
                // Обрабатываем выбор группы
                bot.on('callback_query', async (query) => {
                    if (query.data.startsWith('select_group_')) {
                        const [, , groupIdStr, groupName] = query.data.split('_');
                        const groupId = parseInt(groupIdStr, 10);

                        if (isNaN(groupId)) {
                            return bot.sendMessage(chatId, 'Ошибка: ID группы некорректен.');
                        }

                        // Получаем список всех пользователей
                        const users = await dbClient.query(`SELECT user_id, first_name, last_name FROM users`);
                        if (users.rows.length === 0) {
                            return bot.sendMessage(chatId, 'Нет пользователей для добавления.');
                        }

                        // Создаем кнопки с именами пользователей
                        const userOptions = users.rows.map((user) => ({
                            text: `${user.first_name} ${user.last_name}` || `ID ${user.user_id}`, // Показываем имя или ID
                            callback_data: `add_user_${groupId}_${user.user_id}_${groupName}`, // Передаем ID группы, пользователя и название группы
                        }));

                        bot.sendMessage(chatId, 'Выберите пользователя для добавления в группу:', {
                            reply_markup: {
                                inline_keyboard: userOptions.map((option) => [option]),
                            },
                        });
                    }

                    if (query.data.startsWith('add_user_')) {
                        const [, , groupIdStr, userIdStr, groupName] = query.data.split('_');
                        const groupId = parseInt(groupIdStr, 10);
                        const userId = parseInt(userIdStr, 10);

                        if (isNaN(groupId) || isNaN(userId)) {
                            return bot.sendMessage(chatId, 'Ошибка: ID группы или пользователя некорректен.');
                        }

                        try {
                            // Обновляем группу пользователя в БД
                            const result = await dbClient.query(
                                `UPDATE users SET group_id = $1, groupname = $2 WHERE user_id = $3`,
                                [groupId, groupName, userId]
                            );

                            if (result.rowCount === 0) {
                                return bot.sendMessage(chatId, `Пользователь с ID ${userId} не найден.`);
                            }

                            bot.sendMessage(chatId, `Пользователь успешно добавлен в группу "${groupName}".`);
                        } catch (error) {
                            console.error('Ошибка при добавлении пользователя в группу:', error);
                            bot.sendMessage(chatId, 'Ошибка при добавлении пользователя в группу.');
                        }
                    }
                });

                // Удаляем старые обработчики перед добавлением нового
                // bot.removeAllListeners('callback_query');
            } catch (error) {
                console.error('Ошибка при получении списка групп или пользователей:', error);
                bot.sendMessage(chatId, 'Ошибка при выполнении операции.');
            }
        }
    }
}); 