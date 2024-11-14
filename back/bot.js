const TelegramBot = require('node-telegram-bot-api');
const { Client } = require('pg');

const adminIds = [6705013765, 379802426]; // Замените на ID администраторов


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



// Функция для отображения меню
function showMainMenu(chatId) {
    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Получить задание', callback_data: 'get_task' },
                    { text: 'Отправить ответ', callback_data: 'complete_task' }
                ],
                [
                    { text: 'Мой профиль', callback_data: 'profile' },
                    { text: 'Лидерборд', callback_data: 'leaderboard' }
                ]
            ]
        }
    };

    bot.sendMessage(chatId, 'Выберите действие:', options);
}

// Отправка главного меню при старте
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    showMainMenu(chatId);
});

bot.onText(/\/addtask (.+) \| (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;

    // Проверяем, является ли пользователь администратором
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, 'Извините, эта команда доступна только администраторам.');
        return;
    }

    const description = match[1];
    const points = parseInt(match[2]);

    // Добавляем задание в базу данных
    try {
        await dbClient.query('INSERT INTO tasks (description, points) VALUES ($1, $2)', [description, points]);
        bot.sendMessage(chatId, `Задание успешно добавлено! Описание: "${description}", Очки: ${points}`);
    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, 'Произошла ошибка при добавлении задания.');
    }
});

// Получение случайного задания, которое пользователь еще не выполнял
async function getRandomTask(chatId) {
    const res = await dbClient.query(`
        SELECT * FROM tasks 
        WHERE id NOT IN (
            SELECT task_id FROM completed_tasks WHERE chat_id = $1
        ) 
        ORDER BY RANDOM() LIMIT 1
    `, [chatId]);
    return res.rows[0];
}

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'get_task') {
        const task = await getRandomTask(chatId);
        if (!task) {
            bot.sendMessage(chatId, 'Извините, все доступные задания уже выполнены.');
        } else {
            bot.sendMessage(chatId, `Твое задание: ${task.description}. За выполнение ты получишь ${task.points} очков.`);
            
            // Обновляем текущее задание для пользователя
            await dbClient.query('UPDATE users SET current_task = $1, waiting_for_answer = FALSE WHERE chat_id = $2', [task.id, chatId]);
        }
    } else if (data === 'complete_task') {
        // bot.sendMessage(chatId, 'Пожалуйста, введи свой ответ текстом.');
        const userRes = await dbClient.query('SELECT * FROM users WHERE chat_id = $1', [chatId]);
        const user = userRes.rows[0];

        if (!user || !user.current_task) {
            bot.sendMessage(chatId, 'У тебя нет активного задания. Получи задание первым!');
            return;
        }

        const taskRes = await dbClient.query('SELECT * FROM tasks WHERE id = $1', [user.current_task]);
        const task = taskRes.rows[0];

        // Включаем режим ожидания ответа и отправляем кнопку для отправки ответа
        await dbClient.query('UPDATE users SET waiting_for_answer = TRUE WHERE chat_id = $1', [chatId]);
        let message = 'Когда будешь готов, нажми "Отправить ответ" и ';
        if (task.answer_type === 'image') {
            message += 'отправь изображение.';
        } else {
            message += 'введи ответ текстом.';
        }

        // const options = {
        //     reply_markup: {
        //         inline_keyboard: [[
        //             { text: 'Отправить ответ', callback_data: 'send_answer' }
        //         ]]
        //     }
        // };
        // bot.sendMessage(chatId, message, options);




    } else if (data === 'send_answer') {
        // Бот теперь ожидает текстовый ответ пользователя
        bot.sendMessage(chatId, 'Пожалуйста, введи свой ответ');
    } else if (data === 'leaderboard') {
        // Отправить лидерборд
        const res = await dbClient.query(`
            SELECT name, score 
            FROM users 
            ORDER BY score DESC 
            LIMIT 10
        `);
        let leaderboardMessage = '🏆 Лидерборд 🏆\n\n';
        res.rows.forEach((user, index) => {
            leaderboardMessage += `${index + 1}. ${user.name} — ${user.score} очков\n`;
        });
        bot.sendMessage(chatId, leaderboardMessage);
    } else if (data === 'profile') {
        // Профиль пользователя
        const userRes = await dbClient.query('SELECT * FROM users WHERE chat_id = $1', [chatId]);
        const user = userRes.rows[0];
        if (user) {
            bot.sendMessage(chatId, `Ваш профиль:\nИмя: ${user.name}\nОчки: ${user.score}`);
        } else {
            bot.sendMessage(chatId, 'Вы не зарегистрированы в системе.');
        }
    } else if (data === 'menu') { 
        showMainMenu(chatId);
    }

    if (data.startsWith('approve_') || data.startsWith('reject_')) {
        const taskId = data.split('_')[1];
        const isApproved = data.startsWith('approve_');

        // Обновляем статус ответа в базе данных
        await dbClient.query('UPDATE completed_tasks SET is_approved = $1 WHERE id = $2', [isApproved, taskId]);

        // Получаем информацию о пользователе
        const taskRes = await dbClient.query('SELECT chat_id, task_id FROM completed_tasks WHERE id = $1', [taskId]);
        const { chat_id: userChatId, task_id } = taskRes.rows[0];

        if (isApproved) {
            // Если ответ подтвержден, начисляем очки пользователю
            const taskPointsRes = await dbClient.query('SELECT points FROM tasks WHERE id = $1', [task_id]);
            const points = taskPointsRes.rows[0].points;

            await dbClient.query('UPDATE users SET score = score + $1 WHERE chat_id = $2', [points, userChatId]);
            bot.sendMessage(userChatId, `Поздравляем! Твое изображение подтверждено. Ты получил ${points} очков.`);
        } else {
            // Если ответ отклонен, отправляем пользователю уведомление
            bot.sendMessage(userChatId, 'К сожалению, твое изображение не прошло проверку. Попробуй отправить другое изображение.');

            // Оставляем задание активным, не изменяем поле current_task пользователя
            // Просто сбрасываем ожидание ответа
            await dbClient.query('UPDATE users SET waiting_for_answer = FALSE WHERE chat_id = $1', [userChatId]);
        }

        bot.answerCallbackQuery(callbackQuery.id, { text: isApproved ? 'Изображение подтверждено.' : 'Изображение отклонено.' });
    }

    // Убираем кнопку, чтобы не было повторных нажатий
    bot.answerCallbackQuery(callbackQuery.id);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // Проверяем состояние пользователя
    const userRes = await dbClient.query('SELECT * FROM users WHERE chat_id = $1', [chatId]);
    const user = userRes.rows[0];

    if (!user || !user.current_task || !user.waiting_for_answer) {
        return;
    }

    // Получаем текущее задание
    const taskRes = await dbClient.query('SELECT * FROM tasks WHERE id = $1', [user.current_task]);
    const task = taskRes.rows[0];

    // Проверка типа ответа
    if (task.answer_type === 'image') {
        if (msg.photo) {
            const fileId = msg.photo[msg.photo.length - 1].file_id;

            // Сохраняем изображение и отмечаем, что оно ожидает проверки
            await dbClient.query('INSERT INTO completed_tasks (chat_id, task_id, response_file_id, is_approved) VALUES ($1, $2, $3, NULL)', [chatId, task.id, fileId]);
            await dbClient.query('UPDATE users SET current_task = NULL, waiting_for_answer = FALSE WHERE chat_id = $1', [chatId]);

            bot.sendMessage(chatId, 'Изображение принято на проверку! Ожидай награду.');
        } else {
            bot.sendMessage(chatId, 'Это не изображение. Пожалуйста, отправь изображение для выполнения задания.');
        }
    } else if (task.answer_type === 'text') {
        // Обработка текстового ответа...
        const userResponse = msg.text;
        if (userResponse && userResponse.toLowerCase() === task.correct_answer.toLowerCase()) {
            await dbClient.query('UPDATE users SET score = score + $1, current_task = NULL, waiting_for_answer = FALSE WHERE chat_id = $2', [task.points, chatId]);
            await dbClient.query('INSERT INTO completed_tasks (chat_id, task_id) VALUES ($1, $2)', [chatId, task.id]);

            bot.sendMessage(chatId, `Правильно! Ты получил ${task.points} очков.`);
        } else {
            bot.sendMessage(chatId, 'Ответ неверный. Попробуй снова.');
        }
    }
});
bot.onText(/\/review_images/, async (msg) => {
    const chatId = msg.chat.id;

    // Получаем изображения, ожидающие проверки
    const pendingRes = await dbClient.query('SELECT * FROM completed_tasks WHERE is_approved IS NULL');

    if (pendingRes.rows.length === 0) {
        bot.sendMessage(chatId, 'Нет изображений, ожидающих проверки.');
        return;
    }

    for (const task of pendingRes.rows) {
        const userRes = await dbClient.query('SELECT name FROM users WHERE chat_id = $1', [task.chat_id]);
        const username = userRes.rows[0] ? userRes.rows[0].name : 'Неизвестный пользователь';

        // Отправляем изображение с кнопками для подтверждения или отклонения
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Подтвердить', callback_data: `approve_${task.id}` }],
                    [{ text: '❌ Отклонить', callback_data: `reject_${task.id}` }]
                ]
            }
        };
        bot.sendPhoto(chatId, task.response_file_id);
        bot.sendMessage(chatId, `Пользователь: ${username}\nЗадание ID: ${task.task_id}`, options);
    }
}); 
 


// bot.on('message', async (msg) => {
//     const chatId = msg.chat.id;
//     const userResponse = msg.text;

//     // Проверяем, находится ли пользователь в режиме ожидания ответа
//     const userRes = await dbClient.query('SELECT * FROM users WHERE chat_id = $1', [chatId]);
//     const user = userRes.rows[0];

//     if (!user || !user.current_task || !user.waiting_for_answer) {
//         return; // Игнорируем сообщения, если не ждем ответа от пользователя
//     }

//     // Получаем данные задания
//     const taskRes = await dbClient.query('SELECT * FROM tasks WHERE id = $1', [user.current_task]);
//     const task = taskRes.rows[0];

//     // Проверка ответа
//     if (userResponse.toLowerCase() === task.correct_answer.toLowerCase()) {
//         // Ответ правильный, начисляем очки и сбрасываем режим ожидания
//         await dbClient.query('UPDATE users SET score = score + $1, current_task = NULL, waiting_for_answer = FALSE WHERE chat_id = $2', [task.points, chatId]);
//         await dbClient.query('INSERT INTO completed_tasks (chat_id, task_id) VALUES ($1, $2)', [chatId, task.id]);

//         bot.sendMessage(chatId, `Правильно! Ты получил ${task.points} очков. Теперь у тебя ${user.score + task.points} очков.`);
//         const options = {
//             reply_markup: {
//                 inline_keyboard: [[
//                     { text: 'Открыть меню', callback_data: 'menu' }
//                 ]]
//             }
//         };
//         bot.sendMessage(chatId, 'Продолжаем игру', options);
//     } else {
//         // Ответ неверный
//         bot.sendMessage(chatId, 'К сожалению, ответ неверный. Попробуй еще раз.');
//     } 
// });