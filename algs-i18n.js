/* ============================================================
   Next Cube Pro -- Algs Trainer translations + language helper
   Extracted from script.js for readability.
   Loaded via <script> before script.js in index.html.
   ============================================================ */

const ALGS_I18N = {
    en: {
        modalTitle: 'Algs Trainer', chooseMethod: 'Choose method', chooseSet: 'Choose set',
        algorithms: 'Algorithms', practicePrefix: 'Practice: ',
        soon: 'Soon', learned: 'Learned', practiceThis: '▶ Practice this',
        onlyNotLearned: 'only not-learned', practiceBtn: '▶ Practice',
        learnedCount: (n, total) => `${n} / ${total} learned`,
        pressSpaceStart: 'Press Space to start', pressSpaceStop: 'Press Space to stop',
        pressSpaceNext: 'Press Space for next', tapStart: 'Tap to start', tapStop: 'Tap to stop', tapNext: 'Tap for next',
        solves: 'Solves', avg: 'Avg', best: 'Best',
        cycle: (c) => `Cycle ${c} / 10`,
        warningText: (name) => `Mastering this algorithm will take about 10 focused minutes. Ready to succeed? Let's go! (${name})`,
        finish: 'Finish', back: 'Back', continueBtn: 'Continue', done: 'Done',
        metroPrev: '⏮ Prev', metroPause: '⏸ Pause', metroResume: '▶ Resume', metroSkip: 'Skip ⏭',
        congrats: (min, solves, avg) => `Congratulations! You mastered it in ${min} minutes! Solves: ${solves}, avg: ${avg}s`,
        sessionComplete: (solves, avg) => `Session complete! Solves: ${solves}, avg: ${avg}s`,
    },
    ru: {
        modalTitle: 'Тренер алгоритмов', chooseMethod: 'Выберите метод', chooseSet: 'Выберите раздел',
        algorithms: 'Алгоритмы', practicePrefix: 'Тренировка: ',
        soon: 'Скоро', learned: 'Выучено', practiceThis: '▶ Тренировать',
        onlyNotLearned: 'только невыученные', practiceBtn: '▶ Тренировка',
        learnedCount: (n, total) => `${n} / ${total} выучено`,
        pressSpaceStart: 'Пробел — старт', pressSpaceStop: 'Пробел — стоп',
        pressSpaceNext: 'Пробел — дальше', tapStart: 'Тапни, чтобы начать', tapStop: 'Тапни, чтобы остановить', tapNext: 'Тапни для следующего',
        solves: 'Решено', avg: 'Средн.', best: 'Лучшее',
        cycle: (c) => `Цикл ${c} / 10`,
        warningText: (name) => `На освоение этого алгоритма уйдёт около 10 минут концентрации. Готовы? Поехали! (${name})`,
        finish: 'Завершить', back: 'Назад', continueBtn: 'Продолжить', done: 'Готово',
        metroPrev: '⏮ Назад', metroPause: '⏸ Пауза', metroResume: '▶ Продолжить', metroSkip: 'Пропустить ⏭',
        congrats: (min, solves, avg) => `Поздравляем! Вы освоили его за ${min} мин! Решено: ${solves}, среднее: ${avg}с`,
        sessionComplete: (solves, avg) => `Сессия завершена! Решено: ${solves}, среднее: ${avg}с`,
    },
};
function algsT() {
    return (window.settingsManager?.settings?.language === 'ru') ? ALGS_I18N.ru : ALGS_I18N.en;
}
