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

function getBallaWord(cost) {
    if (cost % 10 === 1 && cost % 100 !== 11) {
        return 'балл';
    } else if ((cost % 10 >= 2 && cost % 10 <= 4) && (cost % 100 < 12 || cost % 100 > 14)) {
        return 'балла';
    } else {
        return 'баллов';
    }
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
            [{ text: 'Группы' }, { text: 'Тайный санта' }]
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
            bot.sendMessage(chatId, `Добро пожаловать, ${firstName}!`, isAdmin(chatId) ? adminMenu : mainMenu);
        } else {
            bot.sendMessage(chatId, `С возвращением ${firstName}!`, isAdmin(chatId) ? adminMenu : mainMenu); // mainMenu — это ваше главное меню
        }

        // Показать главное меню после того как пользователь зарегистрирован

    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Произошла ошибка при обработке команды /start.');
    }
});




// Обработка кнопки "Задания"
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    const res = await dbClient.query(`SELECT group_id FROM users WHERE user_id = $1 AND is_leader = true`,
        [chatId]);

    if (msg.text === 'Задания') {
        // Проверяем, является ли пользователь администратором
        if (isAdmin(chatId)) {
            // Подменю для администратора
            bot.sendMessage(chatId, 'Выберите действие:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Добавить задание', callback_data: 'add_task' }],
                        [{ text: 'Добавить задание для групп', callback_data: 'add_group_task' }],
                        [{ text: 'Проверить задание', callback_data: 'check_task' }]
                    ]
                }
            });
        } else if (res.rows[0]?.group_id) {
            // Подменю для главы группы
            bot.sendMessage(chatId, 'Выберите действие:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Получить задание', callback_data: 'get_task' }],
                        [{ text: 'Получить групповое задание', callback_data: 'get_group_task' }],
                        [{ text: 'Отправить ответ', callback_data: 'send_answer' }],
                        [{ text: 'Текущее задание', callback_data: 'task_status' }],
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
        if (isAdmin(chatId)) {
            // Подменю для администратора
            bot.sendMessage(chatId, 'Выберите действие:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Создать группу', callback_data: 'create_group' },{ text: 'Добавить в группу', callback_data: 'add_group' }],
                        [{ text: 'Сменить группу', callback_data: 'change_group' },{ text: 'Назначить лидера группы', callback_data: 'assign_leader' }],
                        [{ text: 'Голосование', callback_data: 'roulette_group' }] 
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

    // if (data === 'get_task') {
    //     try {
    //         // Получаем случайное задание, которое пользователь еще не выполнял
    //         const res = await dbClient.query(
    //             `SELECT * FROM tasks 
    //              WHERE id NOT IN (SELECT task_id 
    //                                FROM user_answers 
    //                                WHERE user_id = $1 
    //                                  AND status = 'completed') 
    //              ORDER BY RANDOM() LIMIT 1`,
    //             [chatId]
    //         );
    //         const userCurTask = await dbClient.query(
    //             `SELECT * FROM users 
    //              WHERE user_id = $1`,
    //             [chatId]
    //         )
    //         if (!!userCurTask.rows[0].current_group_task || userCurTask.rows[0].current_task) {
    //             return bot.sendMessage(chatId, 'Не так быстро, новое задание будет доступно после проверки');
    //         }
    //         if (res.rows.length > 0) {
    //             const task = res.rows[0];

    //             // Сохраняем это задание как текущее у пользователя
    //             await dbClient.query('UPDATE users SET current_task = $1 WHERE user_id = $2', [task.id, chatId]);

    //             // Отправляем задание пользователю
    //             bot.sendMessage(chatId, `Ваше задание: ${task.task_text}\nНаграда: ${task.points} балл(ов)`, {
    //                 reply_markup: {
    //                     inline_keyboard: [
    //                         [{ text: 'Отправить ответ', callback_data: 'send_answer' }]
    //                     ]
    //                 }
    //             });
    //         } else {
    //             bot.sendMessage(chatId, 'На данный момент нет доступных заданий.');
    //         }
    //     } catch (error) {
    //         console.error(error);
    //         bot.sendMessage(chatId, 'Произошла ошибка при получении задания.');
    //     }
    // } 
    if (data === 'get_task') {
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id
        });
        try {
            // Проверяем, есть ли у пользователя незавершенные задания
            const userCurTask = await dbClient.query(
                `SELECT current_task, current_group_task 
                 FROM users 
                 WHERE user_id = $1`,
                [chatId]
            );

            if (userCurTask.rows[0]?.current_task || userCurTask.rows[0]?.current_group_task) {
                return bot.sendMessage(chatId, 'Не так быстро, новое задание будет доступно после проверки текущего.');
            }

            // Получаем список доступных заданий, которые пользователь еще не выполнял
            const tasksResult = await dbClient.query(
                `SELECT id, task_text, points, response_type
                 FROM tasks 
                 WHERE id NOT IN (
                    SELECT task_id 
                    FROM user_answers 
                    WHERE user_id = $1 AND status = 'completed'
                 ) 
                 ORDER BY id LIMIT 10`, // Ограничиваем количество заданий
                [chatId]
            );

            if (tasksResult.rows.length === 0) {
                return bot.sendMessage(chatId, 'На данный момент нет доступных заданий.');
            }


            // Формируем inline-клавиатуру с заданиями
            const inlineKeyboard = tasksResult.rows.map(task => {
                let imgTask = ''; // Иконка по умолчанию (пуста)

                // Определяем иконку в зависимости от response_type
                switch (task.response_type) {
                    case 'text':
                        imgTask = '📝'; // Иконка для текста
                        break;
                    case 'image':
                        imgTask = '📸'; // Иконка для изображения
                        break;
                    case 'audio':
                        imgTask = '🎵'; // Иконка для аудио
                        break;
                    case 'video':
                        imgTask = '📹'; // Иконка для видео
                        break;
                    default:
                        imgTask = '❓'; // Иконка для неизвестного типа
                }

                return [{
                    text: `${imgTask} ${task.task_text.slice(0, 50)} (${task.points} ${getBallaWord(task.points)})`,
                    callback_data: `select_task_${task.id}`
                }]
            });

            bot.sendMessage(chatId, 'Выберите задание из списка:', {
                reply_markup: {
                    inline_keyboard: inlineKeyboard
                }
            });
        } catch (error) {
            console.error('Ошибка при получении заданий:', error);
            bot.sendMessage(chatId, 'Произошла ошибка при загрузке списка заданий.');
        }
    }

    // Обработчик выбора задания
    if (data.startsWith('select_task_')) {
        const taskId = data.split('_')[2]; // Извлекаем ID задания

        try {
            // Получаем информацию о задании
            const taskResult = await dbClient.query(
                'SELECT task_text, points FROM tasks WHERE id = $1',
                [taskId]
            );

            if (taskResult.rows.length === 0) {
                return bot.sendMessage(chatId, 'Задание больше недоступно.');
            }

            const task = taskResult.rows[0];

            // Сохраняем это задание как текущее у пользователя
            await dbClient.query(
                'UPDATE users SET current_task = $1 WHERE user_id = $2',
                [taskId, chatId]
            );

            // Отправляем текст задания пользователю
            bot.sendMessage(chatId, `Ваше задание: ${task.task_text}\nНаграда: ${task.points} ${getBallaWord(task.points)}`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Отправить ответ', callback_data: 'send_answer' }],
                        [{ text: 'Отменить задание', callback_data: 'cancel_task' }]
                    ]
                }

            });


            // Убираем клавиатуру после выбора
            bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: callbackQuery.message.chat.id,
                message_id: callbackQuery.message.message_id
            });
        } catch (error) {
            console.error('Ошибка при выборе задания:', error);
            bot.sendMessage(chatId, 'Произошла ошибка при выборе задания.');
        }
    }

    // else if (data === 'get_group_task') {
    //     try {
    //         // Получаем задание для главы группы
    //         const res = await dbClient.query(
    //             `SELECT * FROM group_tasks 
    //              WHERE id NOT IN (SELECT task_id 
    //                                FROM group_task_answers
    //                                WHERE leader_id = $1 
    //                                  AND status = 'completed') 
    //              ORDER BY RANDOM() LIMIT 1`,
    //             [chatId]
    //         );
    //         const userCurTask = await dbClient.query(
    //             `SELECT * FROM users 
    //              WHERE user_id = $1`,
    //             [chatId]
    //         )
    //         if (!!userCurTask.rows[0].current_group_task || userCurTask.rows[0].current_task) {
    //             return bot.sendMessage(chatId, 'Не так быстро, новое задание будет доступно после проверки');
    //         } 

    //         if (res.rows.length > 0) {
    //             const task = res.rows[0];
    //             // Сохраняем это задание как текущее у пользователя
    //             await dbClient.query('UPDATE users SET current_group_task = $1 WHERE user_id = $2', [task.id, chatId]);

    //             // Отправляем задание пользователю
    //             bot.sendMessage(chatId, `Ваше задание: ${task.task_text}\nНаграда: ${task.points} ${getBallaWord(task.points)}`, {
    //                 reply_markup: {
    //                     inline_keyboard: [
    //                         [{ text: 'Отправить ответ', callback_data: 'send_answer' }]
    //                     ]
    //                 }
    //             });
    //         } else {
    //             bot.sendMessage(chatId, 'На данный момент нет доступных заданий.');
    //         }
    //     } catch (error) {
    //         console.error(error);
    //         bot.sendMessage(chatId, 'Произошла ошибка при получении задания.');
    //     }
    // } 
    else if (data === 'get_group_task') {

        bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id
        });
        try {
            // Проверяем, есть ли у пользователя незавершенные задания
            const userCurTask = await dbClient.query(
                `SELECT current_group_task, current_task 
                 FROM users 
                 WHERE user_id = $1`,
                [chatId]
            );

            if (userCurTask.rows[0]?.current_group_task || userCurTask.rows[0]?.current_task) {
                return bot.sendMessage(chatId, 'Не так быстро, новое задание будет доступно после проверки текущего.');
            }

            // Получаем список доступных заданий для группы
            const tasksResult = await dbClient.query(
                `SELECT id, task_text, points, response_type
                 FROM group_tasks 
                 WHERE id NOT IN (
                    SELECT task_id 
                    FROM group_task_answers 
                    WHERE leader_id = $1 AND status = 'completed'
                 ) 
                 ORDER BY id LIMIT 10`, // Ограничиваем количество заданий
                [chatId]
            );

            if (tasksResult.rows.length === 0) {
                return bot.sendMessage(chatId, 'На данный момент нет доступных заданий.');
            }


            // Формируем inline-клавиатуру с заданиями
            const inlineKeyboard = tasksResult.rows.map(task => {
                let imgTask = ''; // Иконка по умолчанию (пуста)

                // Определяем иконку в зависимости от response_type
                switch (task.response_type) {
                    case 'text':
                        imgTask = '📝'; // Иконка для текста
                        break;
                    case 'image':
                        imgTask = '📸'; // Иконка для изображения
                        break;
                    case 'audio':
                        imgTask = '🎵'; // Иконка для аудио
                        break;
                    case 'video':
                        imgTask = '📹'; // Иконка для видео
                        break;
                    default:
                        imgTask = '❓'; // Иконка для неизвестного типа
                }
                return [{
                    text: `${imgTask} ${task.task_text.slice(0, 50)} (${task.points} ${getBallaWord(task.points)})`,
                    callback_data: `select_group_task_${task.id}`
                }]
            });

            bot.sendMessage(chatId, 'Выберите задание для вашей группы из списка:', {
                reply_markup: {
                    inline_keyboard: inlineKeyboard
                }
            });
        } catch (error) {
            console.error('Ошибка при получении заданий для группы:', error);
            bot.sendMessage(chatId, 'Произошла ошибка при загрузке списка заданий.');
        }
    }

    // Обработчик выбора задания для группы
    if (data.startsWith('select_group_task_')) {
        const taskId = data.split('_')[3]; // Извлекаем ID задания

        try {
            // Получаем информацию о задании
            const taskResult = await dbClient.query(
                'SELECT task_text, points FROM group_tasks WHERE id = $1',
                [taskId]
            );

            if (taskResult.rows.length === 0) {
                return bot.sendMessage(chatId, 'Задание больше недоступно.');
            }

            const task = taskResult.rows[0];

            // Сохраняем это задание как текущее групповое задание у пользователя
            await dbClient.query(
                'UPDATE users SET current_group_task = $1 WHERE user_id = $2',
                [taskId, chatId]
            );

            // Отправляем текст задания пользователю
            bot.sendMessage(chatId, `Ваше задание для группы: ${task.task_text}\nНаграда: ${task.points} ${getBallaWord(task.points)}`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Отправить ответ', callback_data: 'send_answer' }],
                        [{ text: 'Отменить задание', callback_data: 'cancel_task' }]
                    ]
                }
            });

            // Убираем клавиатуру после выбора
            bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: callbackQuery.message.chat.id,
                message_id: callbackQuery.message.message_id
            });
        } catch (error) {
            console.error('Ошибка при выборе задания для группы:', error);
            bot.sendMessage(chatId, 'Произошла ошибка при выборе задания.');
        }
    }

    else if (data === 'send_answer') {
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id
        });
        // Получаем текущее задание пользователя
        const curTask = await dbClient.query(
            'SELECT * FROM tasks WHERE id = (SELECT current_task FROM users WHERE user_id = $1)',
            [chatId]
        );
        const groupTask = await dbClient.query(
            'SELECT * FROM group_tasks WHERE id = (SELECT current_group_task FROM users WHERE user_id = $1)',
            [chatId]
        );

        const curTaskStatus = await dbClient.query(
            'SELECT status, answer FROM user_answers WHERE user_id = $1',
            [chatId]
        );
        const curGroupTaskStatus = await dbClient.query(
            'SELECT status, answer, media_type FROM group_task_answers WHERE leader_id = $1',
            [chatId]
        );
        if (curTask.rows.length < 1 && groupTask.rows.length < 1) {
            return bot.sendMessage(chatId, 'У вас нет активного задания.');
        } else if (curTaskStatus.rows.some(item => item.status === 'pending')) {
            const answer = curTaskStatus.rows.find(item => item.status === 'pending' && item.media_type === 'text')?.answer || 'Медиафайл';
            return bot.sendMessage(chatId, `Вы уже отправляли ответ: ${answer}`);
        } else if (curGroupTaskStatus.rows.some(item => item.status === 'pending')) {
            const answer = curGroupTaskStatus.rows.find(item => item.status === 'pending' && item.media_type === 'text')?.answer || 'Медиафайл';
            return bot.sendMessage(chatId, `Вы уже отправляли ответ: ${answer}`);
        }


        // Логика для отправки ответа на задание
        bot.sendMessage(chatId, 'Введите ваш ответ:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Отмена задания', callback_data: 'cancel_task' }]
                ]
            }
        });


        // Ожидаем следующий текст пользователя как ответ
        bot.once('message', async (msg) => {
            try {

                const taskRes = await dbClient.query(
                    'SELECT * FROM tasks WHERE id = (SELECT current_task FROM users WHERE user_id = $1)',
                    [chatId]
                );
                const groupRes = await dbClient.query(
                    'SELECT * FROM group_tasks WHERE id = (SELECT current_group_task FROM users WHERE user_id = $1)',
                    [chatId]
                );

                if (curTask.rows.length < 1 && groupRes.rows.length < 1) {
                    bot.sendMessage(chatId, 'У вас нет активного задания.');
                    return;
                }

                const task = taskRes.rows[0] ? taskRes.rows[0] : groupRes.rows[0];
                const taskId = task.id
                const answer = msg.text;
                const media_type = task.response_type
                // Проверяем тип ответа
                let responseFileId = null;
                if (task.response_type === 'text') {
                    if (!msg.text) {
                        return bot.sendMessage(chatId, 'Это задание требует текстового ответа.');
                    }
                    if (task.is_group) {
                        try {
                            await dbClient.query(
                                'INSERT INTO group_task_answers (leader_id, task_id, answer, media_type, status, is_group) VALUES ($1, $2, $3, $4, $5, $6)',
                                [chatId, taskId, answer, media_type, 'pending', true]
                            );

                            bot.sendMessage(chatId, 'Ответ отправлен.');
                            bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                                chat_id: callbackQuery.message.chat.id,
                                message_id: callbackQuery.message.message_id
                            }).catch((err) => {
                                if (err.response && err.response.body && err.response.body.description.includes('message is not modified')) {
                                    console.log('Клавиатура уже пустая, изменений не требуется.');
                                } else {
                                    console.error('Ошибка при редактировании клавиатуры:', err);
                                }
                            });
                        } catch (error) {
                            console.error('Ошибка при сохранении ответа:', error);
                            bot.sendMessage(chatId, 'Произошла ошибка при сохранении вашего ответа.');
                        }
                    } else {
                        try {
                            await dbClient.query(
                                'INSERT INTO user_answers (user_id, task_id, answer, media_type, status) VALUES ($1, $2, $3, $4, $5)',
                                [chatId, taskId, answer, media_type, 'pending']
                            );
                            bot.sendMessage(chatId, 'Ответ отправлен.');
                            bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                                chat_id: callbackQuery.message.chat.id,
                                message_id: callbackQuery.message.message_id
                            }).catch((err) => {
                                if (err.response && err.response.body && err.response.body.description.includes('message is not modified')) {
                                    console.log('Клавиатура уже пустая, изменений не требуется.');
                                } else {
                                    console.error('Ошибка при редактировании клавиатуры:', err);
                                }
                            });
                        } catch (error) {
                            console.error('Ошибка при сохранении ответа:', error);
                            bot.sendMessage(chatId, 'Произошла ошибка при сохранении вашего ответа.');
                        }
                    }
                } else if (task.response_type === 'image') {
                    if (!msg.photo) {
                        return bot.sendMessage(chatId, 'Это задание требует отправки изображения.');
                    }
                    responseFileId = msg.photo[msg.photo.length - 1].file_id;
                    if (task.is_group) {
                        try {
                            await dbClient.query(
                                'INSERT INTO group_task_answers (leader_id, task_id, answer, media_type, status, is_group) VALUES ($1, $2, $3, $4, $5, $6)',
                                [chatId, taskId, responseFileId, media_type, 'pending', true]
                            );

                            bot.sendMessage(chatId, 'Ответ отправлен.');
                        } catch (error) {
                            console.error('Ошибка при сохранении ответа:', error);
                            bot.sendMessage(chatId, 'Произошла ошибка при сохранении вашего ответа.');
                        }
                    } else {
                        try {
                            await dbClient.query(
                                'INSERT INTO user_answers (user_id, task_id, answer, media_type, status) VALUES ($1, $2, $3, $4, $5)',
                                [chatId, taskId, responseFileId, media_type, 'pending']
                            );
                            bot.sendMessage(chatId, 'Ответ отправлен.');
                        } catch (error) {
                            console.error('Ошибка при сохранении ответа:', error);
                            bot.sendMessage(chatId, 'Произошла ошибка при сохранении вашего ответа.');
                        }
                    }
                } else if (task.response_type === 'audio') {
                    if (!msg.voice) {
                        return bot.sendMessage(chatId, 'Это задание требует отправки аудио.');
                    }
                    responseFileId = msg.voice.file_id;
                    try {
                        await dbClient.query(
                            'INSERT INTO user_answers (user_id, task_id, answer, media_type, status, media_id) VALUES ($1, $2, $3, $4, $5, $6)',
                            [chatId, taskId, responseFileId, media_type, 'pending', responseFileId]
                        );

                        bot.sendMessage(chatId, 'Ответ отправлен.');
                    } catch (error) {
                        console.error('Ошибка при сохранении ответа:', error);
                        bot.sendMessage(chatId, 'Произошла ошибка при сохранении вашего ответа.');
                    }

                } else if (task.response_type === 'video') {
                    if (!msg.video_note) {
                        return bot.sendMessage(chatId, 'Это задание требуется снять на камеру.');
                    }
                    responseFileId = msg.video_note.file_id
                    try {
                        await dbClient.query(
                            'INSERT INTO user_answers (user_id, task_id, answer, media_type, status, media_id) VALUES ($1, $2, $3, $4, $5, $6)',
                            [chatId, taskId, responseFileId, media_type, 'pending', responseFileId]
                        );

                        bot.sendMessage(chatId, 'Ответ отправлен.');
                    } catch (error) {
                        console.error('Ошибка при сохранении ответа:', error);
                        bot.sendMessage(chatId, 'Произошла ошибка при сохранении вашего ответа.');
                    }
                }

            } catch (error) {
                console.error(error);
                bot.sendMessage(chatId, 'Произошла ошибка при проверке ответа.');
            }
        });
    } else if (data === 'task_status') {
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id
        });
        const taskRes = await dbClient.query(
            'SELECT tasks.task_text FROM tasks JOIN users ON tasks.id = users.current_task WHERE users.user_id = $1',
            [chatId]
        );
        const groupRes = await dbClient.query(
            'SELECT task_text FROM group_tasks JOIN users ON group_tasks.id = users.current_group_task WHERE users.user_id = $1',
            [chatId]
        );
        // Логика для проверки статуса текущего задания 

        bot.sendMessage(chatId, `${taskRes.rows[0]?.task_text ? taskRes.rows[0]?.task_text : groupRes.rows[0]?.task_text ? groupRes.rows[0].task_text : 'Заданий нет'}`);
    } else if (data === 'cancel_task') {
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id
        });
        try {
            // Убираем текущее задание пользователя
            await dbClient.query(
                'UPDATE users SET current_task = NULL, current_group_task = NULL WHERE user_id = $1',
                [chatId]
            );
            bot.sendMessage(chatId, 'Задание отменено. Вы можете выбрать новое задание.');
        } catch (error) {
            console.error('Ошибка при отмене задания:', error);
            bot.sendMessage(chatId, 'Произошла ошибка при отмене задания.');
        }
    }


    // Подтверждаем обработку callback_query
    bot.answerCallbackQuery(callbackQuery.id);
});

// Обработчик кнопки "Список лидеров"
bot.onText(/Список лидеров/, async (msg) => {
    const chatId = msg.chat.id;

    const leaderOptions = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Пользователи', callback_data: 'user_leaders' },
                    { text: 'Группы', callback_data: 'group_leaders' }
                ]
            ]
        }
    };
    bot.sendMessage(chatId, 'Список лидеров', leaderOptions);

});
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'user_leaders') {
        // Запрос на получение списка лидеров среди пользователей
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
                let leaderboard = '🏆 Топ-10 пользователей по баллам 🏆\n\n';
                res.rows.forEach((user, index) => {
                    const ballWord = getBallaWord(user.points);
                    let name = `${user.first_name} ${user.last_name}`
                    leaderboard += `${index + 1}. ${name || 'Аноним'} - ${user.points} ${ballWord}\n`;
                });
                bot.sendMessage(chatId, leaderboard);
            } else {
                bot.sendMessage(chatId, 'Список лидеров пуст. Пока никто не набрал баллов.');
            }
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, 'Произошла ошибка при получении списка лидеров.');
        }
        bot.deleteMessage(chatId, callbackQuery.message.message_id).catch((err) => {
            console.error('Ошибка при удалении сообщения:', err);
        });
    }
    if (data === 'group_leaders') {
        // Запрос на получение списка лидеров среди групп
        try {
            const result = await dbClient.query(
                `SELECT name, points
                 FROM groups
                 ORDER BY points DESC
                 LIMIT 10`
            );

            if (result.rows.length === 0) {
                return bot.sendMessage(chatId, 'Нет доступных данных о группах.');
            }

            let response = '🏆 Топ лидеров среди групп:\n\n';
            result.rows.forEach((group, index) => {
                const ballWord = getBallaWord(group.points);
                response += `${index + 1}. ${group.name} — ${group.points} ${ballWord}\n`;
            });

            bot.sendMessage(chatId, response);
        } catch (error) {
            console.error('Ошибка при получении списка лидеров групп:', error);
            bot.sendMessage(chatId, 'Произошла ошибка при получении списка лидеров групп.');
        }
        bot.deleteMessage(chatId, callbackQuery.message.message_id).catch((err) => {
            console.error('Ошибка при удалении сообщения:', err);
        });
    }
})

// Обработчик кнопки "Мой профиль"
bot.onText(/Мой профиль/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        // Получаем информацию о пользователе из базы данных
        const res = await dbClient.query(
            `SELECT user_id, first_name, last_name, points, secret_santa, groupname, is_leader, santa_for
             FROM users 
             WHERE user_id = $1`,
            [chatId]
        );         
        const santa_user = await dbClient.query(
            `SELECT first_name, last_name
             FROM users 
             WHERE user_id = $1`,
            [res.rows[0].santa_for]
        )
        if (res.rows.length > 0) {
            const user = res.rows[0];
            const fullName = `${user.first_name} ${user.last_name}`;
            const points = user.points;
            const group = user.groupname || 'Нет группы';
            const santaStatus = user.secret_santa ? 'Да' : 'Нет';
            const isLeader = user.is_leader
            const santaFor = user.secret_santa ? `Тайный Санта для <tg-spoiler>${santa_user.rows[0].first_name} ${santa_user.rows[0].last_name}</tg-spoiler>` : ''
            
            

            const ballWord = getBallaWord(points);

            // Формируем сообщение с профилем пользователя
            const groupLeader = isLeader ? 'Лидер группы: Да' : ''
            const profileMessage =
                `👤 Профиль\n\n` +
                `Полное имя: ${fullName}\n` +
                `Баллы: ${points} ${ballWord}\n` +
                `Участвую в Тайном Санте: ${santaStatus}\n` +
                `${santaFor}\n` +
                `Группа: ${group}\n` + 
                `${groupLeader}`;

            // Отправляем сообщение с профилем и кнопками для изменения
            bot.sendMessage(chatId, profileMessage, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Изменить имя', callback_data: 'change_name' }]
                    ]
                },
                parse_mode: 'HTML'
            });
        } else {
            bot.sendMessage(chatId, 'Ваш профиль не найден.');
        }
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Произошла ошибка при получении профиля.');
    }
});

bot.on('message', (msg) => {
    if (msg.text === 'Тайная комната') {
        const chatId = msg.chat.id;
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: 'Зайти', // Текст кнопки
                            web_app: {
                                url: 'https://itstma.vercel.app/', // URL вашего мини-приложения
                            },
                        },
                    ],
                ],
            },
        };
        bot.sendMessage(msg.chat.id, 'Воу, да это же настоящая тайная комната!', keyboard);
    }
});

// Обработка нажатия на кнопку "Тайный санта"
bot.on('message', (msg) => {

    if (msg.text === 'Тайный санта') {
        const helpMenu = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Отправить запрос пользователям', callback_data: 'send_santa' }],
                    [{ text: 'Провести распределение', callback_data: 'roulete_santa' }],
                    [{ text: 'Изменить статус у пользователя', callback_data: 'status_santa' }]
                ],
            },
        };
        bot.sendMessage(msg.chat.id, 'Выберите один из пунктов помощи:', helpMenu);
    }
});



function shuffle(array) {
    let currentIndex = array.length, randomIndex;

    // Пока не осталось элементов для перемешивания
    while (currentIndex !== 0) {
        // Берем случайный индекс
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // Меняем местами элементы
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }

    return array;
}

// Обработка кнопок подменю "Тайный санта"
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;


    if (data === 'send_santa') {
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id
        }).catch((err) => {
            if (err.response && err.response.body && err.response.body.description.includes('message is not modified')) {
                console.log('Клавиатура уже пустая, изменений не требуется.');
            } else {
                console.error('Ошибка при редактировании клавиатуры:', err);
            }
        });
        bot.sendMessage(chatId, 'Запрос отправлен пользователям');
        try {
            const users = await dbClient.query('SELECT user_id FROM users WHERE secret_santa=false');

            if (users.rows.length === 0) {
                console.log('Нет зарегистрированных пользователей.');
                return;
            }

            // Отправляем сообщение каждому пользователю
            for (const user of users.rows) {
                const userId = user.user_id;
                await bot.sendMessage(userId, 'Хочешь участвовать в Тайном Санте?', {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: 'Участвую 🎅', callback_data: `santa_yes_${userId}` },
                                { text: 'Не в этот раз ❌', callback_data: `santa_no_${userId}` }
                            ]
                        ]
                    }
                });
            }
        } catch (error) {
            console.error('Ошибка при отправке запроса:', error);
        }
    } else if (data === 'roulete_santa') {
        bot.sendMessage(chatId, 'Делаю распределение...');

        // Получаем всех пользователей, которые участвуют в Тайном Санте
        const users = await dbClient.query('SELECT user_id, first_name FROM users WHERE secret_santa = true');

        if (users.rows.length < 2) {
            return bot.sendMessage(chatId, 'Для распределения Тайного Санты необходимо хотя бы два участника.');
        }

        // Генерируем случайное распределение
        const shuffledUsers = shuffle(users.rows); // Функция shuffle будет случайным образом перемешивать пользователей

        // Распределяем Тайных Сант
        const assignments = [];
        for (let i = 0; i < shuffledUsers.length; i++) {
            const santa = shuffledUsers[i];
            const receiver = shuffledUsers[(i + 1) % shuffledUsers.length]; // Следующий пользователь будет получателем

            assignments.push({
                user_id: santa.user_id,
                santa_id: receiver.user_id
            });
        }

        // Сохраняем распределение в базу данных
        try {
            await dbClient.query('BEGIN'); // Начинаем транзакцию

            // Удаляем старые назначения
            await dbClient.query('DELETE FROM secret_santa');

            // Вставляем новые назначения
            for (let assignment of assignments) {
                await dbClient.query(
                    'INSERT INTO secret_santa (user_id, santa_id) VALUES ($1, $2)',
                    [assignment.user_id, assignment.santa_id]
                );
            }

            await dbClient.query('COMMIT'); // Подтверждаем транзакцию

            bot.sendMessage(chatId, 'Распределение Тайного Санты завершено!');

            // Оповещаем Тайных Сант о том, кому они должны дарить подарок
            for (let assignment of assignments) {
                const receiver = await dbClient.query(
                    'SELECT first_name, last_name FROM users WHERE user_id = $1',
                    [assignment.santa_id]
                );
                await dbClient.query(
                    'UPDATE users SET santa_for = $1 WHERE user_id = $2',
                    [assignment.santa_id, assignment.user_id]
                ); 
                // Тайный Санта получает сообщение о том, кому он должен дарить подарок
                bot.sendMessage(assignment.user_id, `Ты Тайный Санта для <tg-spoiler>${receiver.rows[0].first_name} ${receiver.rows[0].last_name}</tg-spoiler>. Удачи!`, { parse_mode: 'HTML' });
                // bot.sendMessage(assignment.user_id, `Ты Тайный Санта для ${receiver.rows[0].first_name} ${receiver.rows[0].last_name}`);





            }
            
        } catch (error) {
            await dbClient.query('ROLLBACK'); // Откатываем транзакцию в случае ошибки
            console.error(error);
            bot.sendMessage(chatId, 'Произошла ошибка при распределении Тайного Санты.');
        }


    } else if (data === 'status_santa') {
        bot.sendMessage(chatId, 'Выберите пользователя');
        const users = await dbClient.query('SELECT user_id, first_name, last_name FROM users');

        const keyboard = users.rows.map(user => ([
            { text: `${user.first_name} ${user.last_name}`, callback_data: `change_status_${user.user_id}` }
        ]));

        // Отправляем список пользователей с кнопками
        bot.sendMessage(chatId, 'Выберите пользователя для изменения статуса Тайного Санты:', {
            reply_markup: {
                inline_keyboard: keyboard
            }
        });

    }
});
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (data.startsWith('change_status_')) {
        const targetUserId = data.split('_')[2]; // Получаем user_id целевого пользователя

        // Запрашиваем имя и текущий статус пользователя
        const user = await dbClient.query('SELECT first_name, last_name, secret_santa FROM users WHERE user_id = $1', [targetUserId]);

        if (user.rows.length > 0) {
            const userName = `${user.rows[0].first_name} ${user.rows[0].last_name}`;
            const currentStatus = user.rows[0].secret_santa;

            // Создаем кнопки для изменения статуса
            const statusKeyboard = [
                [
                    { text: currentStatus ? 'Не учавствую' : 'Учавствую', callback_data: `set_santa_status_${targetUserId}_${currentStatus ? 'false' : 'true'}` }
                ]
            ];

            // Отправляем сообщение с выбором статуса
            bot.sendMessage(chatId, `Изменить статус для ${userName}:`, {
                reply_markup: {
                    inline_keyboard: statusKeyboard
                }
            });
        }
    }
});
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (data.startsWith('set_santa_status_')) {
        const [, , , targetUserId, newStatus] = data.split('_');
        const newStatusBoolean = newStatus === 'true';

        // Обновляем статус пользователя в базе данных
        await dbClient.query('UPDATE users SET secret_santa = $1 WHERE user_id = $2', [newStatusBoolean, targetUserId]);
        const user = await dbClient.query('SELECT first_name, last_name FROM users WHERE user_id = $1', [targetUserId]);

        const username = `${user.rows[0].first_name} ${user.rows[0].last_name}`


        // Отправляем подтверждение
        const statusMessage = newStatusBoolean ? 'участвует в Тайном Санте' : 'не участвует в Тайном Санте';
        bot.sendMessage(chatId, `Статус пользователя обновлен. Теперь ${username} ${statusMessage}.`);
    }
});



bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;

    if (data.startsWith('santa_yes_')) {
        const userId = data.split('_')[2];

        try {
            await dbClient.query('UPDATE users SET secret_santa = true WHERE user_id = $1', [userId]);
            await bot.sendMessage(chatId, 'Вы записаны в Тайного Санту! 🎉');
        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
            await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
        }
    } else if (data.startsWith('santa_no_')) {
        const userId = data.split('_')[2];

        try {
            await dbClient.query('UPDATE users SET secret_santa = false WHERE user_id = $1', [userId]);
            await bot.sendMessage(chatId, 'Жаль, что вы не участвуете в этом году. 😞');
        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
            await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
        }
    }
});


// Обработка нажатия на кнопку "Помощь"
bot.on('message', (msg) => {
    if (msg.text === 'Помощь') {
        const helpMenu = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Описание бота', callback_data: 'help_description' },
                        { text: 'Призы', callback_data: 'help_prizes' },
                    ],
                    [
                        { text: 'Задать вопрос', callback_data: 'help_question' },
                    ],
                ],
            },
        };
        bot.sendMessage(msg.chat.id, 'Выберите один из пунктов помощи:', helpMenu);
    }
});

function getBallaWord(cost) {
    if (cost % 10 === 1 && cost % 100 !== 11) {
        return 'балл';
    } else if ((cost % 10 >= 2 && cost % 10 <= 4) && (cost % 100 < 12 || cost % 100 > 14)) {
        return 'балла';
    } else {
        return 'баллов';
    }
}

// Обработка кнопок подменю "Помощь"
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'help_description') {
        bot.sendMessage(chatId, 'Бот для участия в конкурсах');
    } else if (data === 'help_prizes') {
        try {
            // Получаем список доступных призов
            const result = await dbClient.query(
                'SELECT name, cost, quantity FROM prizes WHERE is_available = $1',
                [true]
            );

            if (result.rows.length === 0) {
                return bot.sendMessage(chatId, 'На данный момент призы недоступны.');
            }

            // Формируем сообщение с призами

            let prizesMessage = 'Доступные призы:\n\n';
            result.rows.forEach((prize, index) => {
                const word = getBallaWord(prize.cost);
                prizesMessage += `${index + 1}. ${prize.name}\n`;
                prizesMessage += `Стоимость: ${prize.cost} ${word}\n`;
                prizesMessage += `Осталось: ${prize.quantity > 0 ? prize.quantity + ' шт.' : 'Нет в наличии'}\n\n`;
            });

            bot.sendMessage(chatId, prizesMessage);
        } catch (error) {
            console.error('Ошибка при получении списка призов:', error);
            bot.sendMessage(chatId, 'Произошла ошибка при получении списка призов.');
        }
    } else if (data === 'help_question') {
        bot.sendMessage(chatId, 'Вы можете задать свой вопрос или пожелание, отправив сообщение прямо здесь. Администратор свяжется с вами!');
    }
});
// Обработка нажатия на кнопку "Помощь" - "Задать вопрос"
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'help_question') {
        bot.sendMessage(chatId, 'Напишите ваш вопрос, и я передам его администратору.');

        // Ожидаем следующий ввод от пользователя (вопрос)
        bot.once('message', async (msg) => {



            const userId = msg.from.id
            const userQuestion = msg.text;
            const user = await dbClient.query(
                `SELECT * FROM users 
                 WHERE user_id = $1`,
                [userId]
            );


            const name = `${user.rows[0].first_name} ${user.rows[0].last_name ? user.rows[0].last_name : ''}`;
            const username = msg.from.username


            // Отправляем вопрос администратору
            const adminChatId = 6705013765;  // Укажите ID чата администратора
            const questionChat = -1002449625966 // Укажите ID чата канала для вопросов

            const questionMessage = `Вопрос от @${username} ${name}:\n${userQuestion}`;

            bot.sendMessage(adminChatId, questionMessage); // Отправляем сообщение администратору
            bot.sendMessage(questionChat, questionMessage); // Отправляем сообщение в канал
            bot.sendMessage(chatId, 'Ваш вопрос был передан администратору 🫶🏻. Ожидайте ответа в ЛС.');
        });
    }
});

const cancelKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: 'Отмена', callback_data: 'cancel' }]
        ]
    }
};

//Добавление заданий
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'add_task') {
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id
        });
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
                                { text: 'Фото', callback_data: 'response_type_image' },
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
                            // 'INSERT INTO group_tasks (task_text, points, response_type) VALUES ($1, $2, $3)',
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
    } else if (data === 'add_group_task') {
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id
        });
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
                                { text: 'Фото', callback_data: 'response_type_image' },
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
                            'INSERT INTO group_tasks (task_text, points, response_type) VALUES ($1, $2, $3)',
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
        bot.deleteMessage(chatId, callbackQuery.message.message_id).catch((err) => {
            console.error('Ошибка при удалении сообщения:', err);
        });
        // Логика для проверки задания  
        try {
            // Получаем все задания и ответы
            const tasksResult = await dbClient.query(
                `SELECT t.id, t.task_text, ua.answer, u.first_name, u.last_name, u.user_id, ua.media_type
                 FROM tasks t 
                 JOIN user_answers ua ON t.id = ua.task_id
                 JOIN users u ON ua.user_id = u.user_id
                 WHERE ua.status = $1`,
                ['pending']
            );
            const groupResult = await dbClient.query(
                `SELECT t.id, t.task_text, ua.answer, u.first_name, u.last_name, u.user_id, ua.media_type
                 FROM group_tasks t 
                 JOIN group_task_answers ua ON t.id = ua.task_id
                 JOIN users u ON ua.leader_id = u.user_id
                 WHERE ua.status = $1`,
                ['pending']
            );


            if (tasksResult.rows.length < 1 && groupResult.rows.length < 1) {
                return bot.sendMessage(chatId, 'Нет ответов для проверки.');
            }
            // Объединяем задания из обеих таблиц
            const tasks = [...tasksResult.rows, ...groupResult.rows];

            // Отправляем задания по очереди
            for (const task of tasks) {
                const inlineKeyboard = {
                    inline_keyboard: [
                        [{ text: '✅ Подтвердить', callback_data: `approve_${task.id}_${task.user_id}` }],
                        [{ text: '❌ Отклонить', callback_data: `reject_${task.id}_${task.user_id}` }]
                    ]
                };

                // Отправляем ответ в зависимости от типа медиа
                if (task.media_type === 'text') {
                    await bot.sendMessage(
                        chatId,
                        `📋 Задание: ${task.task_text}\n📝 Ответ: ${task.answer}\n👤 Пользователь: ${task.first_name} ${task.last_name}`,
                        { reply_markup: inlineKeyboard }
                    );
                } else if (task.media_type === 'image') {
                    await bot.sendPhoto(
                        chatId,
                        task.answer,
                        {
                            caption: `📋 Задание: ${task.task_text}\n👤 Пользователь: ${task.first_name} ${task.last_name}`,
                            reply_markup: inlineKeyboard
                        }
                    );
                } else if (task.media_type === 'audio') {
                    await bot.sendAudio(
                        chatId,
                        task.answer,
                        {
                            caption: `📋 Задание: ${task.task_text}\n👤 Пользователь: ${task.first_name} ${task.last_name}`,
                            reply_markup: inlineKeyboard
                        }
                    );
                } else if (task.media_type === 'video') {
                    console.log(task);

                    await bot.sendVideo(
                        chatId,
                        task.answer,
                        {
                            caption: `📋 Задание: ${task.task_text}\n👤 Пользователь: ${task.first_name} ${task.last_name}`,
                            reply_markup: inlineKeyboard
                        }
                    );
                } else {
                    await bot.sendMessage(
                        chatId,
                        `📋 Задание: ${task.task_text}\n👤 Пользователь: ${task.first_name} ${task.last_name}`,
                        { reply_markup: inlineKeyboard }
                    );
                }
            }
        } catch (error) {
            console.error('Ошибка при получении заданий:', error);
            bot.sendMessage(chatId, 'Произошла ошибка при получении заданий.');
        }
    } else if (data === 'change_name') {

        bot.sendMessage(chatId, 'Введите ваше новое полное имя.', cancelKeyboard);

        const nameChangeHandler = async (msg) => {
            // Обработчик завершен, нужно удалить его
            bot.removeListener('message', nameChangeHandler);

            if (msg.text === 'Отмена') {
                bot.sendMessage(chatId, 'Действие отменено.');
                return;
            }

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
        };

        // Слушаем нажатия на кнопки, и если нажали "Отмена", то...
        bot.on('callback_query', async (callbackQuery) => {
            const { data, message } = callbackQuery;

            if (data === 'cancel') {
                bot.sendMessage(chatId, 'Действие отменено.');
                bot.removeListener('message', nameChangeHandler); // Удаляем слушатель на ввод имени
            }
        });

        // Добавляем слушатель на ввод имени
        bot.on('message', nameChangeHandler);
        bot.deleteMessage(chatId, callbackQuery.message.message_id).catch((err) => {
            console.error('Ошибка при удалении сообщения:', err);
        });
    }
    // Подтверждаем обработку callback_query
    bot.answerCallbackQuery(callbackQuery.id);
});


bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    let res = null



    if (isAdmin(chatId)) {
        if (data.startsWith('approve_')) {
            const [_, taskId, userId] = data.split('_');
            try {
                res = await dbClient.query(
                    'SELECT * FROM users WHERE user_id = $1',
                    [userId]
                );

            } catch (error) {
                console.error('Ошибка при проверке задания:', error);
                bot.sendMessage(chatId, 'Произошла ошибка при подтверждении ответа.');
            }

            if (!!res.rows[0].current_task) {
                try {
                    // Начисляем баллы пользователю
                    await dbClient.query(
                        'UPDATE users SET current_task = $3, points = points + (SELECT points FROM tasks WHERE id = $1) WHERE user_id = $2',
                        [taskId, userId, null]
                    );

                    await dbClient.query(
                        'UPDATE user_answers SET status = $1 WHERE user_id = $2 AND task_id = $3',
                        ['completed', userId, taskId]

                    );

                    bot.sendMessage(chatId, 'Ответ подтвержден. Баллы начислены пользователю.');
                    bot.sendMessage(userId, 'Ваш ответ принят, баллы начислены!');
                } catch (error) {
                    console.error('Ошибка при подтверждении ответа:', error);
                    bot.sendMessage(chatId, 'Произошла ошибка при подтверждении ответа.');
                }
            }
            else if (!!res.rows[0].current_group_task) {
                try {
                    // Начисляем баллы группе
                    await dbClient.query(
                        'UPDATE groups SET points = points + (SELECT points FROM group_tasks WHERE id = $2 ) WHERE id = $1',
                        [res.rows[0].group_id, res.rows[0].current_group_task]
                    );

                    await dbClient.query(
                        'UPDATE group_task_answers SET status = $1 WHERE leader_id = $2 AND task_id = $3',
                        ['completed', userId, res.rows[0].current_group_task]

                    );
                    await dbClient.query(
                        'UPDATE users SET current_group_task = $2 WHERE user_id = $1',
                        [userId, null]
                    );

                    bot.sendMessage(chatId, 'Ответ подтвержден. Баллы начислены группе.');
                    bot.sendMessage(userId, 'Ваш ответ принят, баллы начислены группе!');
                } catch (error) {
                    console.error('Ошибка при подтверждении ответа:', error);
                    bot.sendMessage(chatId, 'Произошла ошибка при подтверждении ответа!.');
                }
            }
            else {
                bot.sendMessage(chatId, 'Вы уже работали с этим заданием');
            }

            // Удаление сообщения с ответом
            bot.deleteMessage(chatId, callbackQuery.message.message_id).catch((err) => {
                console.error('Ошибка при удалении сообщения:', err);
            });

        }

        if (data.startsWith('reject_')) {
            const [_, taskId, userId] = data.split('_');
            try {
                res = await dbClient.query(
                    'SELECT * FROM users WHERE user_id = $1',
                    [userId]
                );

            } catch (error) {
                console.error('Ошибка при проверке задания:', error);
                bot.sendMessage(chatId, 'Произошла ошибка при подтверждении ответа.');
            }
            if (!!res.rows[0].current_task) {
                try {
                    await dbClient.query(
                        'DELETE FROM user_answers WHERE user_id = $1 AND task_id = $2',
                        [userId, taskId]
                    );
                    bot.sendMessage(chatId, 'Ответ отклонен. Задание останется активным.');
                    bot.sendMessage(userId, 'Ваш ответ отклонен. Пожалуйста, предоставьте другой ответ.');
                } catch (error) {
                    console.error('Ошибка при отклонении ответа:', error);
                    bot.sendMessage(chatId, 'Произошла ошибка при отклонении ответа.');
                }
            } else if (!!res.rows[0].current_group_task) {
                try {
                    await dbClient.query(
                        'DELETE FROM group_task_answers WHERE leader_id = $1 AND task_id = $2',
                        [userId, taskId]
                    );
                    bot.sendMessage(chatId, 'Ответ отклонен. Задание останется активным.');
                    bot.sendMessage(userId, 'Ваш ответ отклонен. Пожалуйста, предоставьте другой ответ.');
                } catch (error) {
                    console.error('Ошибка при отклонении ответа:', error);
                    bot.sendMessage(chatId, 'Произошла ошибка при отклонении ответа.');
                }
            } else {
                bot.sendMessage(chatId, 'Вы уже работали с этим заданием');
            }
            // Удаление сообщения с ответом
            bot.deleteMessage(chatId, callbackQuery.message.message_id).catch((err) => {
                console.error('Ошибка при удалении сообщения:', err);
            });
        }
    }
});





//Группы
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    if (isAdmin(chatId)) {

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
        } else if (data === 'assign_leader') {
            try {
                // Получаем все группы
                const groupsResult = await dbClient.query('SELECT DISTINCT groupname FROM users WHERE groupname IS NOT NULL');
                const groups = groupsResult.rows;

                if (groups.length === 0) {
                    return bot.sendMessage(chatId, 'Группы отсутствуют.');
                }
                // Формируем клавиатуру с выбором группы
                const groupButtons = groups.map((g) => ({
                    text: `${g.groupname}`,
                    callback_data: `select_group_${g.groupname}`
                }));


                const inlineKeyboard = {
                    inline_keyboard: [groupButtons]
                };

                bot.sendMessage(chatId, 'Выберите группу:', { reply_markup: inlineKeyboard });
                bot.on('callback_query', async (callbackQuery) => {
                    const data = callbackQuery.data;
                    if (data.startsWith('select_group_')) {
                        const selectedGroup = data.replace('select_group_', '');

                        // Получаем пользователей в выбранной группе
                        const usersResult = await dbClient.query(
                            'SELECT user_id, first_name, last_name FROM users WHERE groupname = $1',
                            [selectedGroup]
                        );

                        const users = usersResult.rows;

                        if (users.length === 0) {
                            return bot.sendMessage(chatId, 'В этой группе нет пользователей.');
                        }

                        // Формируем клавиатуру с выбором пользователя
                        const userButtons = users.map((u) => ({
                            text: `${u.first_name} ${u.last_name}`,
                            callback_data: `assign_leader_${u.user_id}`
                        }));

                        const userKeyboard = {
                            inline_keyboard: [userButtons]
                        };

                        bot.sendMessage(chatId, 'Выберите лидера группы:', { reply_markup: userKeyboard });
                    }

                    if (data.startsWith('assign_leader_')) {
                        const userId = data.replace('assign_leader_', '');

                        // Сбрасываем флаг лидера для всех пользователей группы
                        const userGroupResult = await dbClient.query('SELECT groupname FROM users WHERE user_id = $1', [userId]);
                        const userGroup = userGroupResult.rows[0].group;

                        await dbClient.query('UPDATE users SET is_leader = false WHERE groupname = $1', [userGroup]);

                        // Назначаем нового лидера
                        await dbClient.query('UPDATE users SET is_leader = true WHERE user_id = $1', [userId]);

                        bot.sendMessage(chatId, 'Лидер группы успешно назначен!');
                    }
                });
            } catch (error) {
                console.error('Ошибка при назначении лидера:', error);
                bot.sendMessage(chatId, 'Произошла ошибка при назначении лидера.');
            }
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
            } catch (error) {
                console.error('Ошибка при получении списка групп или пользователей:', error);
                bot.sendMessage(chatId, 'Ошибка при выполнении операции.');
            }
        } else if (data === 'change_group') {
            try {
                // Получаем список всех пользователей
                const usersResult = await dbClient.query('SELECT user_id, first_name, last_name, groupname FROM users');
                const users = usersResult.rows;

                if (users.length === 0) {
                    return bot.sendMessage(chatId, 'Пользователи не найдены.');
                }

                // Формируем клавиатуру с выбором пользователя
                const userButtons = users.map((u) => ({
                    text: `${u.first_name} ${u.last_name} (${u.groupname || 'Нет'})`,
                    callback_data: `select_user_${u.user_id}`
                }));

                const userKeyboard = {
                    inline_keyboard: [userButtons]
                };

                bot.sendMessage(chatId, 'Выберите пользователя для смены группы:', { reply_markup: userKeyboard });

                bot.on('callback_query', async (callbackQuery) => {
                    const data = callbackQuery.data;

                    if (data.startsWith('select_user_')) {
                        const userId = data.replace('select_user_', '');

                        // Получаем список всех групп
                        const groupsResult = await dbClient.query('SELECT name FROM groups');
                        const groups = groupsResult.rows;

                        if (groups.length === 0) {
                            return bot.sendMessage(chatId, 'Группы не найдены.');
                        }

                        // Формируем клавиатуру с выбором группы
                        const groupButtons = groups.map((g) => ({
                            text: `${g.name}`,
                            callback_data: `change_group_${userId}_${g.name}`
                        }));

                        const groupKeyboard = {
                            inline_keyboard: [groupButtons]
                        };

                        bot.sendMessage(chatId, 'Выберите новую группу для пользователя:', { reply_markup: groupKeyboard });
                    }

                    if (data.startsWith('change_group_')) {
                        const [_, , userId, newGroupname] = data.split('_');


                        // Обновляем группу пользователя
                        await dbClient.query('UPDATE users SET groupname = $1, is_leader = false WHERE user_id = $2', [newGroupname, userId]);

                        bot.sendMessage(chatId, 'Группа пользователя успешно изменена!');
                    }
                });
            } catch (error) {
                console.error('Ошибка при смене группы:', error);
                bot.sendMessage(chatId, 'Произошла ошибка при смене группы.');
            }
        } else if (data === 'roulette_group') {
            bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: callbackQuery.message.chat.id,
                message_id: callbackQuery.message.message_id
            });
            try {
                

                bot.sendMessage(chatId, 'Запрос в группы отправлен');
            } catch (error) {
                console.error('Ошибка при отправке запроса', error);
                bot.sendMessage(chatId, 'Произошла ошибка');
            }
        }
    }
});

// Установить меню команд
const setBotCommands = async (bot) => {
    await bot.setMyCommands([
        { command: 'start', description: 'Начать' }
    ]);
};

setBotCommands(bot);
