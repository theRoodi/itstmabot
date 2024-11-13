const tasks = [
    { id: 1, description: 'Прочитать статью по JS', points: 10 },
    { id: 2, description: 'Создать простой HTTP-сервер на Node.js', points: 20 }
];

let users = {}; // Простое хранилище данных для очков пользователей

bot.onText(/\/task/, (msg) => {
    const chatId = msg.chat.id;
    const task = tasks[Math.floor(Math.random() * tasks.length)];
    bot.sendMessage(chatId, `Твое задание: ${task.description}. За выполнение ты получишь ${task.points} очков.`);
    
    // Сохраняем текущее задание пользователя
    if (!users[chatId]) {
        users[chatId] = { score: 0, currentTask: task.id };
    } else {
        users[chatId].currentTask = task.id;
    }
});

bot.onText(/\/done/, (msg) => {
    const chatId = msg.chat.id;
    if (users[chatId] && users[chatId].currentTask) {
        const task = tasks.find(t => t.id === users[chatId].currentTask);
        users[chatId].score += task.points;
        users[chatId].currentTask = null;
        bot.sendMessage(chatId, `Отлично! Ты получил ${task.points} очков. Теперь у тебя ${users[chatId].score} очков.`);
    } else {
        bot.sendMessage(chatId, 'У тебя нет активного задания.');
    }
});
