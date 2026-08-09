/* Store title catalog. Rendering and ownership logic live in progression-system.js. */
(function () {
    const title = (id, tier, price, ru, en) => ({ id, tier, price, name: { ru, en } });
    const tiers = {
        beginner: { order: 1, name: { ru: 'Начинающий игрок', en: 'Beginner Player' } },
        common: { order: 2, name: { ru: 'Обычный игрок', en: 'Regular Player' } },
        advanced: { order: 3, name: { ru: 'Продолжающий игрок', en: 'Advancing Player' } },
        amateur: { order: 4, name: { ru: 'Любитель', en: 'Amateur' } },
        pro: { order: 5, name: { ru: 'Профессионал', en: 'Professional' } },
        world: { order: 6, name: { ru: 'Мировой класс', en: 'World Class' } },
        legend: { order: 7, name: { ru: 'Легенды куба', en: 'Cube Legends' } },
        absolute: { order: 8, name: { ru: 'Абсолют', en: 'Absolute' } }
    };
    const titles = [
        title('beginner_rookie','beginner',100,'Новичок','Rookie'),
        title('beginner_first_scramble','beginner',100,'Первый скрамбл','First Scramble'),
        title('beginner_student','beginner',150,'Ученик','Apprentice'),
        title('beginner_twist','beginner',150,'Кручу-верчу','Twist and Turn'),
        title('beginner_plastic','beginner',200,'Любитель пластика','Plastic Enthusiast'),
        title('beginner_forgot','beginner',200,'Запутал и забыл','Scrambled and Forgot'),
        title('beginner_rhythm','beginner',250,'В ритме скрамбла','Scramble Rhythm'),
        title('beginner_algorithms','beginner',300,'Изучающий алгоритмы','Algorithm Student'),

        title('common_cuber','common',400,'Обычный кубер','Everyday Cuber'),
        title('common_steady','common',450,'Стабильный ход','Steady Turns'),
        title('common_tea','common',500,'Собираю под чаёк','Cubing Over Tea'),
        title('common_sexy_move','common',550,'Знаток пиф-пафа','Sexy Move Expert'),
        title('common_no_panic','common',600,'Без паники!','No Panic!'),
        title('common_lessons','common',650,'Кручу вместо уроков','Cubing Instead of Homework'),
        title('common_daily','common',700,'Дневной сборщик','Daily Solver'),
        title('common_pb','common',800,'В поисках PB','Chasing a PB'),

        title('advanced_cuber','advanced',900,'Продолжающий','Advancing Cuber'),
        title('advanced_autopilot','advanced',1000,'Пальцы на автопилоте','Fingers on Autopilot'),
        title('advanced_two_hours','advanced',1100,'Залип на два часа','Two-Hour Cubing Trance'),
        title('advanced_speedup','advanced',1200,'Пальцы в разгоне','Fingers at Full Speed'),
        title('advanced_scrambles','advanced',1300,'Мастер скрамблов','Scramble Master'),
        title('advanced_fridrich','advanced',1400,'Контролёр Фридриха','Fridrich Controller'),
        title('advanced_night','advanced',1500,'Ночной кубер','Night Cuber'),
        title('advanced_cross','advanced',1500,'Укротитель креста','Cross Tamer'),

        title('amateur_experienced','amateur',1600,'Опытный любитель','Experienced Amateur'),
        title('amateur_dark','amateur',1800,'Собрал в темноте','Solved in the Dark'),
        title('amateur_clean','amateur',1900,'Без ошибок и DNF','No Mistakes, No DNF'),
        title('amateur_streak','amateur',2000,'Генератор стриков','Streak Generator'),
        title('amateur_lube','amateur',2100,'Смазка — моё всё','Lube Is Everything'),
        title('amateur_fingers','amateur',2200,'Быстрые пальцы','Fast Fingers'),
        title('amateur_no_pop','amateur',2400,'Только без поппа!','No Pops, Please!'),
        title('amateur_timer','amateur',2500,'Таймер-маньяк','Timer Maniac'),

        title('pro_professional','pro',2800,'Профессионал','Professional'),
        title('pro_record_magnet','pro',3000,'Магнит для рекордов','Record Magnet'),
        title('pro_god','pro',3200,'Спидкубер от Бога','God-Tier Speedcuber'),
        title('pro_focus','pro',3500,'Фокус и скорость','Focus and Speed'),
        title('pro_timer_destroyer','pro',3800,'Разрушитель таймера','Timer Destroyer'),
        title('pro_smoke','pro',4000,'Дым из-под пальцев','Smoke from the Fingers'),
        title('pro_fingertricks','pro',4200,'Мастер фингертриксов','Fingertrick Master'),
        title('pro_max_park','pro',4500,'Макс Парк отдыхает','Max Park Takes a Break'),

        title('world_level','world',5000,'Мировой уровень','World Class'),
        title('world_thought','world',5500,'Быстрее мысли','Faster Than Thought'),
        title('world_light','world',6000,'Скорость света','Speed of Light'),
        title('world_grandmaster','world',6500,'Грандмастер кубинга','Cubing Grandmaster'),
        title('world_champion','world',7000,'Абсолютный чемпион','Absolute Champion'),
        title('world_multiplayer','world',7200,'Герой мультиплеера','Multiplayer Hero'),
        title('world_magnus','world',7500,'Магнус кубинга','Magnus of Cubing'),
        title('world_unreachable','world',7500,'Недосягаемый','Untouchable'),

        title('legend_lord','legend',10000,'Повелитель кубов','Lord of the Cubes'),
        title('legend_commander','legend',10000,'Кубический полководец','Cube Commander'),
        title('legend_president','legend',10000,'Президент спидкубинга','President of Speedcubing'),
        title('legend_dominator','legend',10000,'Абсолютный доминатор','Absolute Dominator'),
        title('absolute','absolute',1000000,'Абсолют','Absolute')
    ];
    window.TITLE_CATALOG = { tiers, titles };
})();
