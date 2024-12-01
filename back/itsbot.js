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
            // bot.sendMessage(chatId, );
        }

        // Показать главное меню после того как пользователь зарегистрирован
        bot.sendMessage(chatId, `С возвращением ${firstName}!`, chatId === adminChatId ? adminMenu : mainMenu); // mainMenu — это ваше главное меню

    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Произошла ошибка при обработке команды /start.');
    }
});




// Обработка кнопки "Задания"
bot.on('message', async(msg) => {
    const chatId = msg.chat.id;

    const res = await dbClient.query(`SELECT group_id FROM users WHERE user_id = $1 AND is_leader = true`,
            [chatId]);

    if (msg.text === 'Задания') {
        console.log(res.rows[0] ? res.rows[0].group_id : 'Not leader');
        
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
        if (chatId === adminChatId) {
            // Подменю для администратора
            bot.sendMessage(chatId, 'Выберите действие:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Создать группу', callback_data: 'create_group' }],
                        [{ text: 'Добавить в группу', callback_data: 'add_group' }],
                        [{ text: 'Сменить группу', callback_data: 'change_group' }],
                        [{ text: 'Назначить лидера группы', callback_data: 'assign_leader' }],
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
                 WHERE id NOT IN (SELECT task_id 
                                   FROM user_answers 
                                   WHERE user_id = $1 
                                     AND status = 'completed') 
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
    } else if (data === 'get_group_task') {
        try {
            // Получаем задание для главы группы
            const res = await dbClient.query(
                `SELECT * FROM group_tasks 
                 WHERE id NOT IN (SELECT task_id 
                                   FROM group_task_answers
                                   WHERE leader_id = $1 
                                     AND status = 'completed') 
                 ORDER BY RANDOM() LIMIT 1`,
                [chatId]
            );

            console.log(res);
            

            if (res.rows.length > 0) {
                const task = res.rows[0];              
                // Сохраняем это задание как текущее у пользователя
                await dbClient.query('UPDATE users SET current_group_task = $1 WHERE user_id = $2', [task.id, chatId]);

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
        // Получаем текущее задание пользователя
        const curTask = await dbClient.query(
            'SELECT * FROM tasks WHERE id = (SELECT current_task FROM users WHERE user_id = $1)',
            [chatId]
        ); 
        const groupTask = await dbClient.query(
            'SELECT * FROM group_tasks WHERE id = (SELECT current_group_task FROM users WHERE user_id = $1)',
            [chatId]
        );

        const  curTaskStatus = await dbClient.query(
            'SELECT status, answer FROM user_answers WHERE user_id = $1',
            [chatId]
        ); 
        
        if(curTask.rows.length < 1 && groupTask.rows.length < 1){
            return bot.sendMessage(chatId, 'У вас нет активного задания.');
        } else if (curTaskStatus.rows.some(item => item.status === 'pending')){
            const answer = curTaskStatus.rows.find(item => item.status === 'pending')?.answer;
            console.log(curTaskStatus.rows);
            
            return bot.sendMessage(chatId, `Вы уже отправляли ответ: ${answer}`);
        }
        
        
        // Логика для отправки ответа на задание
        bot.sendMessage(chatId, 'Введите ваш ответ:');

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
                    if(task.is_group) {
                        try {
                            await dbClient.query(
                                'INSERT INTO group_task_answers (leader_id, task_id, answer, media_type, status, is_group) VALUES ($1, $2, $3, $4, $5, $6)',
                                [chatId, taskId, answer, media_type, 'pending', true]
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
                                [chatId, taskId, answer, media_type, 'pending']
                            );
                            bot.sendMessage(chatId, 'Ответ отправлен.');
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
                    if(task.is_group) {
                        try {
                            await dbClient.query(
                                'INSERT INTO group_task_answers (leader_id, task_id, answer, media_type, status, is_group) VALUES ($1, $2, $3, $4, $5, $6)',
                                [chatId, taskId, answer, media_type, 'pending', true]
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
        // bot.sendMessage(chatId, 'Пожалуйста, отправьте свой ответ в виде текста или изображения.');
    } else if (data === 'task_status') {
        const taskRes = await dbClient.query(
            'SELECT tasks.task_text FROM tasks JOIN users ON tasks.id = users.current_task WHERE users.user_id = $1',
            [chatId]
        );
        // Логика для проверки статуса текущего задания 
        bot.sendMessage(chatId, `${taskRes.rows[0]?.task_text ? taskRes.rows[0]?.task_text : 'Заданий нет'}`);
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
            `SELECT first_name, last_name, points, secret_santa, groupname, is_leader
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
            const isLeader = user.is_leader

            // Формируем сообщение с профилем пользователя
            const groupLeader = isLeader ? 'Лидер группы: Да' : ''
            const profileMessage =
                `👤 Профиль\n\n` +
                `Полное имя: ${fullName}\n` +
                `Очки: ${points}\n` +
                `Участвует в Тайном Санте: ${santaStatus}\n` +
                `Группа: ${group}\n` +
                `${groupLeader}`;

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

// Обработка кнопок подменю "Помощь"
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'help_description') {
        bot.sendMessage(chatId, 'Бот для участия в конкурсах');
    } else if (data === 'help_prizes') {
        bot.sendMessage(chatId, 'Призы зависят от текущих акций. Следите за обновлениями!');
    } else if (data === 'help_question') {
        bot.sendMessage(chatId, 'Вы можете задать свой вопрос, отправив сообщение прямо здесь. Администратор свяжется с вами!');
    }
});
// Обработка нажатия на кнопку "Помощь" - "Задать вопрос"
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'help_question') {
        bot.sendMessage(chatId, 'Напишите ваш вопрос, и я передам его администратору.');

        // Ожидаем следующий ввод от пользователя (вопрос)
        bot.once('message', (msg) => {
            const userQuestion = msg.text;
            const name = `${msg.from.first_name} ${msg.from.last_name ? msg.from.last_name : ''}`;
            const username = msg.from.username

            // Отправляем вопрос администратору
            const adminChatId = 6705013765;  // Укажите ID чата администратора

            const questionMessage = `Вопрос от @${username} ${name}:\n${userQuestion}`;

            bot.sendMessage(adminChatId, questionMessage); // Отправляем сообщение администратору
            bot.sendMessage(chatId, 'Ваш вопрос был передан администратору. Ожидайте ответа в ЛС.');
        });
    }
});



//Добавление заданий
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
    } else if (data === 'check_task') {
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

            const tasks = tasksResult.rowCount ? tasksResult.rows : groupResult.rows; 
            tasks.forEach(task => {  
                

                const inlineKeyboard = {
                    inline_keyboard: [
                        [{ text: 'Подтвердить', callback_data: `approve_${task.id}_${task.user_id}` }],
                        [{ text: 'Отклонить', callback_data: `reject_${task.id}_${task.user_id}` }]
                    ]
                };
                console.log(task.media_type);
                console.log(task.answer);
                
                if (task.media_type === 'text') {
                    bot.sendMessage(
                        chatId,
                        `Задание: ${task.task_text}\nОтвет: ${task.answer}\nПользователь: ${task.first_name} ${task.last_name}`,
                        { reply_markup: inlineKeyboard }
                    );
                } else if (task.media_type === 'image') {
                    bot.sendPhoto(adminChatId, task.answer)
                    bot.sendMessage(
                        chatId,
                        `Задание: ${task.task_text}\nПользователь: ${task.first_name} ${task.last_name}`,
                        { reply_markup: inlineKeyboard }
                    );
                } else if (task.media_type === 'audio') {
                    bot.sendAudio(adminChatId, task.answer)
                    bot.sendMessage(
                        chatId,
                        `Задание: ${task.task_text}\nПользователь: ${task.first_name} ${task.last_name}`,
                        { reply_markup: inlineKeyboard }
                    );
                } else if (task.media_type === 'video') {
                    bot.sendVideo(adminChatId, task.answer)
                    bot.sendMessage(
                        chatId,
                        `Задание: ${task.task_text}\nПользователь: ${task.first_name} ${task.last_name}`,
                        { reply_markup: inlineKeyboard }
                    );
                }

            });
        } catch (error) {
            console.error('Ошибка при получении заданий:', error);
            bot.sendMessage(chatId, 'Произошла ошибка при получении заданий.');
        }
    }else if (data === 'change_name') {
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
    let res = null



    if (chatId === adminChatId) {
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
                console.log(res.rows);
                
                try {
                    // Начисляем баллы группе
                    await dbClient.query(
                        'UPDATE groups SET points = points + (SELECT points FROM group_tasks) WHERE id = $1',
                        [res.rows[0].group_id]
                    );

                    await dbClient.query(
                        'UPDATE group_task_answers SET status = $1 WHERE leader_id = $2 AND task_id = $3',
                        ['completed', userId, res.rows[0].current_group_task]

                    );
                    await dbClient.query(
                        'UPDATE group_tasks SET status = $1 WHERE id = $2',
                        ['completed', res.rows[0].current_group_task]

                    );
                    await dbClient.query(
                        'UPDATE users SET current_task = $2 WHERE user_id = $1',
                        [userId, null]
                    );

                    bot.sendMessage(chatId, 'Ответ подтвержден. Баллы начислены пользователю.');
                    bot.sendMessage(userId, 'Ваш ответ принят, баллы начислены!');
                } catch (error) {
                    console.error('Ошибка при подтверждении ответа:', error);
                    bot.sendMessage(chatId, 'Произошла ошибка при подтверждении ответа!.');
                }
            }
             else { 
                bot.sendMessage(chatId, 'Вы уже работали с этим заданием');
            }

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
            } else {
                bot.sendMessage(chatId, 'Вы уже работали с этим заданием');
            }
        }
    }
});





//Группы
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
