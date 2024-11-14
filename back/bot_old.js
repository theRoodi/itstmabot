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
                    { text: 'Получить задание', callback_data: 'task' },
                    { text: 'Лидерборд', callback_data: 'leaderboard' }
                ],
                [
                    { text: 'Мой профиль', callback_data: 'profile' }
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

// Обработка нажатий на кнопки
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'task') {
        // Отправить задание
        const task = await getRandomTask(chatId);
        if (!task) {
            bot.sendMessage(chatId, 'Извините, все доступные задания уже выполнены.');
        } else {
            bot.sendMessage(chatId, `Твое задание: ${task.description}. За выполнение ты получишь ${task.points} очков.`);
        }
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
        // Отправить профиль пользователя
        const userRes = await dbClient.query('SELECT * FROM users WHERE chat_id = $1', [chatId]);
        const user = userRes.rows[0];
        if (user) {
            bot.sendMessage(chatId, `Ваш профиль:\nИмя: ${user.name}\nОчки: ${user.score}`);
        } else {
            bot.sendMessage(chatId, 'Вы не зарегистрированы в системе.');
        }
    }

    // Убираем кнопку, чтобы не было повторных нажатий
    bot.answerCallbackQuery(callbackQuery.id);
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

// Выдача задания пользователю
bot.onText(/\/task/, async (msg) => {
    const chatId = msg.chat.id;
    const userName = `${msg.from.first_name} ${msg.from.last_name}` || 'Без имени';
    const task = await getRandomTask(chatId);
    
    if (!task) {
        bot.sendMessage(chatId, 'Извините, все доступные задания уже выполнены.');
        return;
    }
    
    bot.sendMessage(chatId, `Твое задание: ${task.description}. За выполнение ты получишь ${task.points} очков.`);
    
    await dbClient.query(
        'INSERT INTO users (chat_id, score, name) VALUES ($1, 0, $2) ON CONFLICT (chat_id) DO NOTHING',
        [chatId, userName]
    );
    
    await dbClient.query(
        'UPDATE users SET current_task = $1 WHERE chat_id = $2',
        [task.id, chatId]
    );
});

// Начисление очков после выполнения задания
bot.onText(/\/done/, async (msg) => {
    const chatId = msg.chat.id;

    const userRes = await dbClient.query('SELECT * FROM users WHERE chat_id = $1', [chatId]);
    const user = userRes.rows[0];

    if (!user || !user.current_task) {
        bot.sendMessage(chatId, 'У тебя нет активного задания.');
        return;
    }

    const taskRes = await dbClient.query('SELECT * FROM tasks WHERE id = $1', [user.current_task]);
    const task = taskRes.rows[0];

    // Добавляем задание в список выполненных
    await dbClient.query('INSERT INTO completed_tasks (chat_id, task_id) VALUES ($1, $2)', [chatId, task.id]);

    // Начисляем очки и сбрасываем текущее задание
    await dbClient.query('UPDATE users SET score = score + $1, current_task = NULL WHERE chat_id = $2', [task.points, chatId]);

    bot.sendMessage(chatId, `Отлично! Ты получил ${task.points} очков. Теперь у тебя ${user.score + task.points} очков.`);
});


// Команда для отображения лидерборда
bot.onText(/\/score/, async (msg) => {
    const chatId = msg.chat.id;

    // Запросим всех пользователей и отсортируем по очкам в убывающем порядке
    const res = await dbClient.query(`
        SELECT name, score 
        FROM users 
        ORDER BY score DESC 
        LIMIT 10
    `);

    if (res.rows.length === 0) {
        bot.sendMessage(chatId, 'Нет данных для отображения лидерборда.');
        return;
    }

    // Формируем сообщение с лидербордом
    let leaderboardMessage = '🏆 Лидерборд 🏆\n\n';
    res.rows.forEach((user, index) => {
        leaderboardMessage += `${index + 1}. ${user.name} — ${user.score} очков\n`;
    });

    // Отправляем сообщение пользователю
    bot.sendMessage(chatId, leaderboardMessage);
});
