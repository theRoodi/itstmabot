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
        bot.sendMessage(chatId, 'Выберите действие:', mainMenu); // mainMenu — это ваше главное меню

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
                        [{ text: 'Статус текущего задания', callback_data: 'task_status' }],
                        // [{ text: 'Назад в меню', callback_data: 'back_to_menu' }]
                    ]
                }
            });
        }
    }

    if (msg.text === 'Список лидеров') {
        // Логика для списка лидеров
        bot.sendMessage(chatId, 'Вот текущий список лидеров:', mainMenu);
    }

    if (msg.text === 'Помощь') {
        // Логика для помощи
        bot.sendMessage(chatId, 'Вот информация о доступных командах...', mainMenu);
    }

    if (msg.text === 'Мой профиль') {
        // Логика для профиля пользователя
        bot.sendMessage(chatId, 'Вот информация о вашем профиле...', mainMenu);
    }
});


// Обработка действий подменю
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'get_task') {
        try {
            // Получаем случайное задание из базы данных
            const result = await dbClient.query('SELECT * FROM tasks ORDER BY RANDOM() LIMIT 1');

            if (result.rows.length > 0) {
                const task = result.rows[0];
                // Сохраняем id задания для пользователя, чтобы потом сверить ответ
                await dbClient.query('UPDATE users SET current_task = $1 WHERE user_id = $2', [task.id, chatId]);

                // Отправляем задание пользователю
                bot.sendMessage(chatId, `Ваше задание: ${task.task_text}\nБаллы за выполнение: ${task.points}`);
                bot.sendMessage(chatId, 'Отправьте ваш ответ.');
            } else {
                bot.sendMessage(chatId, 'На данный момент нет доступных заданий.');
            }
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, 'Произошла ошибка при получении задания.');
        }
    } else if (data === 'send_answer') {
        // Логика для отправки ответа на задание
        bot.sendMessage(chatId, 'Пожалуйста, отправьте свой ответ в виде текста или изображения.');
    } else if (data === 'task_status') {
        // Логика для проверки статуса текущего задания
        bot.sendMessage(chatId, 'Вот статус вашего текущего задания...');
    }

    // Подтверждаем обработку callback_query
    bot.answerCallbackQuery(callbackQuery.id);
});


bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'add_task') {
        // Переход к добавлению задания
        bot.sendMessage(chatId, 'Введите текст задания для пользователей:');

        // Ожидаем ввода текста задания
        bot.once('message', async (message) => {
            const taskText = message.text;
            // Запросим количество баллов
            bot.sendMessage(chatId, 'Теперь укажите количество баллов за выполнение задания:');

            bot.once('message', async (message) => {
                const points = parseInt(message.text);
                if (isNaN(points) || points <= 0) {
                    bot.sendMessage(chatId, 'Количество баллов должно быть положительным числом.');
                    return;
                }

                // Запросим правильные ответы
                bot.sendMessage(chatId, 'Перечислите правильные ответы (через пробел):');

                bot.once('message', async (message) => {
                    const correctAnswers = message.text.trim();

                    try {
                        // Сохраняем данные в базу данных
                        const result = await dbClient.query(
                            'INSERT INTO tasks (task_text, points, correct_answers) VALUES ($1, $2, $3) RETURNING id',
                            [taskText, points, correctAnswers]
                        );

                        bot.sendMessage(chatId, `Задание успешно добавлено! ID задания: ${result.rows[0].id}`);
                    } catch (error) {
                        bot.sendMessage(chatId, 'Произошла ошибка при добавлении задания.');
                        console.error(error);
                    }
                });
            });
        });
    }else if (data === 'check_task') {
        // Логика для проверки задания
        bot.sendMessage(chatId, 'Выберите задание для проверки...');
        // Здесь можно добавить функционал для выбора задания для проверки
    } else if (data === 'back_to_menu') {
        // Возврат к основному меню
        bot.sendMessage(chatId, 'Возвращаемся в главное меню.', mainMenu);
    }

    // Подтверждаем обработку callback_query
    bot.answerCallbackQuery(callbackQuery.id);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // Проверяем, является ли пользователь администратором
    if (chatId === adminChatId) {

        if (msg.text === 'Добавить задание') {
            // Запросим текст задания
            bot.sendMessage(chatId, 'Введите текст задания для пользователей:');
            
            bot.once('message', async (message) => {
                const taskText = message.text;
                // Сохраняем текст задания
                bot.sendMessage(chatId, 'Теперь укажите количество баллов за выполнение задания:');

                bot.once('message', async (message) => {
                    const points = parseInt(message.text);
                    if (isNaN(points) || points <= 0) {
                        bot.sendMessage(chatId, 'Количество баллов должно быть положительным числом.');
                        return;
                    }

                    // Сохраняем количество баллов
                    bot.sendMessage(chatId, 'Перечислите правильные ответы (через пробел):');

                    bot.once('message', async (message) => {
                        const correctAnswers = message.text.trim();

                        // Сохраняем правильные ответы в базе данных
                        try {
                            const result = await dbClient.query(
                                'INSERT INTO tasks (task_text, points, correct_answers) VALUES ($1, $2, $3) RETURNING id',
                                [taskText, points, correctAnswers]
                            );

                            bot.sendMessage(chatId, `Задание успешно добавлено! ID задания: ${result.rows[0].id}`);
                        } catch (error) {
                            bot.sendMessage(chatId, 'Произошла ошибка при добавлении задания.');
                            console.error(error);
                        }
                    });
                });
            });
        }
    }
});
