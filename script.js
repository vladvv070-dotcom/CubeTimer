/* ============================================================
   CubeTimer 1.3.0 — script.js
   All application logic
   ============================================================ */

// Commentary System
        class CommentarySystem {
            constructor() {
                this.lastCommentary = '';
                this.commentaryElement = document.getElementById('commentaryText');
                this.currentMood = 'friend'; // default mood
                
                // Load saved mood from localStorage
                const savedMood = AppStorage.getRaw('timerMood');
                if (savedMood) {
                    this.currentMood = savedMood;
                }
                
                // Database of commentaries by mood and category
                this.moods = COMMENTARY_MOODS; // moved to commentary-data.js
                this.moodsEn = window.moodsEn; // English phrase banks (commentary-data.js)
                this.customPhrases = this._normalizeCustomPhrases(
                    AppStorage.getJSON('customPhrases', {})
                );

            } // end of constructor

            setMood(mood) {
                if (this.moods[mood]) {
                    this.currentMood = mood;
                    AppStorage.setRaw('timerMood', mood);
                }
            }

            getCommentary(context) {
                let category = 'neutral';
                
                // Determine category based on context
                if (context.isDelete) {
                    category = 'delete';
                } else if (context.isDNF) {
                    category = 'dnf';
                } else if (context.isPluTwo) {
                    category = 'plus_two';
                } else if (context.isNewPB) {
                    category = 'pb_single';
                } else if (context.isAverageImproved) {
                    category = 'pb_average';
                } else if (context.isAverageWorsened) {
                    category = 'worse_average';
                } else if (context.isTargetSuccess) {
                    category = 'target_success';
                } else if (context.isTargetFail) {
                    category = 'target_fail';
                } else if (context.isFast) {
                    category = 'fast_time';
                } else if (context.isSlow) {
                    category = 'slow_time';
                }

                // Get comments from current mood, in the current UI language (falls
                // back to Russian per-mood if that mood isn't translated yet)
                const moodComments = this.getMoodBank(this.currentMood);
                // target_success/target_fail currently only have phrase banks
                // written for the "friend" mood — fall back to friend's phrasing
                // (still respecting language) so other moods don't crash on a
                // category they haven't been written for yet.
                const defaultComments = moodComments[category]
                    || this.getMoodBank('friend')[category]
                    || this.moods.friend[category];
                const customComments = this.customPhrases?.[this.currentMood]?.[category] || [];
                const categoryComments = [...defaultComments, ...customComments];
                let comment;
                
                do {
                    comment = categoryComments[Math.floor(Math.random() * categoryComments.length)];
                } while (comment === this.lastCommentary && categoryComments.length > 1);
                
                this.lastCommentary = comment;
                return comment;
            }

            // Returns the phrase bank for a given mood in the commentary language
            // (independent from the UI language — falls back to the UI language only
            // if the person hasn't explicitly picked a commentary language). Falls
            // back to Russian for any mood not yet present in moodsEn, so commentary
            // keeps working correctly while translation work is still in progress.
            getMoodBank(mood) {
                const s = window.settingsManager?.settings;
                const lang = s?.commentaryLanguage || s?.language;
                if (lang === 'en' && this.moodsEn && this.moodsEn[mood]) return this.moodsEn[mood];
                return this.moods[mood];
            }

            _normalizeCustomPhrases(value) {
                const result = {};
                const allowedCategories = new Set([
                    'neutral', 'fast_time', 'slow_time', 'pb_single', 'pb_average',
                    'worse_average', 'dnf', 'plus_two', 'delete', 'target_success', 'target_fail'
                ]);
                if (!value || typeof value !== 'object' || Array.isArray(value)) return result;

                for (const [mood, categories] of Object.entries(value)) {
                    if (!this.moods?.[mood] || !categories || typeof categories !== 'object' || Array.isArray(categories)) continue;
                    for (const [category, phrases] of Object.entries(categories)) {
                        if (!allowedCategories.has(category) || !Array.isArray(phrases)) continue;
                        const clean = [...new Set(phrases
                            .filter(phrase => typeof phrase === 'string')
                            .map(phrase => phrase.trim())
                            .filter(Boolean)
                            .map(phrase => phrase.slice(0, 300))
                        )].slice(0, 50);
                        if (!clean.length) continue;
                        if (!result[mood]) result[mood] = {};
                        result[mood][category] = clean;
                    }
                }
                return result;
            }

            setCustomPhrases(value, updatedAt = Date.now()) {
                this.customPhrases = this._normalizeCustomPhrases(value);
                AppStorage.setJSON('customPhrases', this.customPhrases);
                const numericUpdatedAt = Number(updatedAt);
                const safeUpdatedAt = Number.isFinite(numericUpdatedAt) && numericUpdatedAt >= 0
                    ? numericUpdatedAt
                    : Date.now();
                AppStorage.setRaw('customPhrasesUpdatedAt', String(safeUpdatedAt));
                window.dispatchEvent(new CustomEvent('customphraseschange'));
            }

            addCustomPhrase(mood, category, phrase) {
                const cleanPhrase = typeof phrase === 'string' ? phrase.trim().slice(0, 300) : '';
                const allowedCategories = this._customPhraseCategoriesSet || (this._customPhraseCategoriesSet = new Set([
                    'neutral', 'fast_time', 'slow_time', 'pb_single', 'pb_average',
                    'worse_average', 'dnf', 'plus_two', 'delete', 'target_success', 'target_fail'
                ]));
                if (!cleanPhrase || !this.moods[mood] || !allowedCategories.has(category)) return { ok: false, reason: 'invalid' };

                const existing = this.customPhrases?.[mood]?.[category] || [];
                if (existing.includes(cleanPhrase)) return { ok: false, reason: 'duplicate' };
                const totalPhrases = Object.values(this.customPhrases).reduce((moodTotal, categories) =>
                    moodTotal + Object.values(categories).reduce((total, phrases) => total + phrases.length, 0), 0);
                if (existing.length >= 50 || totalPhrases >= 500) return { ok: false, reason: 'limit' };

                const next = structuredClone(this.customPhrases);
                if (!next[mood]) next[mood] = {};
                if (!next[mood][category]) next[mood][category] = [];
                next[mood][category].push(cleanPhrase);
                const updatedAt = Date.now();
                this.setCustomPhrases(next, updatedAt);
                return { ok: true, updatedAt };
            }

            removeCustomPhrase(mood, category, index) {
                const existing = this.customPhrases?.[mood]?.[category];
                if (!Array.isArray(existing) || index < 0 || index >= existing.length) return { ok: false };

                const next = structuredClone(this.customPhrases);
                next[mood][category].splice(index, 1);
                if (!next[mood][category].length) delete next[mood][category];
                if (!Object.keys(next[mood]).length) delete next[mood];
                const updatedAt = Date.now();
                this.setCustomPhrases(next, updatedAt);
                return { ok: true, updatedAt };
            }

            show(context) {
                const comment = this.getCommentary(context);
                const html = comment.replace(/\n/g, '<br>');

                // Desktop commentary (left panel)
                this.commentaryElement.classList.remove('updating');
                void this.commentaryElement.offsetWidth; // Force reflow
                this.commentaryElement.classList.add('updating');

                this._typeCommentary(html);
            }

            // Types the commentary out character-by-character with a blinking
            // cursor, like someone is typing it live. Tags (e.g. <br>) are
            // inserted atomically so markup never gets split mid-tag.
            _typeCommentary(html) {
                if (this._typeTimer) {
                    clearTimeout(this._typeTimer);
                    this._typeTimer = null;
                }

                const tokens = html.match(/<[^>]+>|[^<]/g) || [];
                this.commentaryElement.innerHTML = '';
                const cursor = document.createElement('span');
                cursor.className = 'typing-cursor';
                this.commentaryElement.appendChild(cursor);

                let i = 0;
                const typeNext = () => {
                    if (i < tokens.length) {
                        cursor.insertAdjacentHTML('beforebegin', tokens[i]);
                        i++;
                        const delay = 18 + Math.random() * 28;
                        this._typeTimer = setTimeout(typeNext, delay);
                    } else {
                        this._typeTimer = setTimeout(() => {
                            if (cursor && cursor.parentNode) cursor.remove();
                        }, 500);
                    }
                };
                typeNext();
            }
        }

        // Translations
        const translations = window.translations = TRANSLATIONS; // moved to translations.js

        // Settings Manager
        class SettingsManager {
            constructor() {
                this.settings = {
                    holdDelay: 600,
                    timerColor: '#e8edf4',
                    darkTheme: true,
                    sounds: false,
                    showAo5: true,
                    showAo12: true,
                    showAo100: false,
                    showSessionAvg: true,
                    timerMood: 'friend',
                    language: 'en',
                    inspection: false,
                    inspectionMode: 'wca',  // 'wca' = DNF after inspection, 'training' = auto-start
                    // Advanced Customization — reset when base theme changes
                    accentColor: null,      // null = use theme default
                    customFont: 'default',
                    customBg: 'none',
                    timeFormat: 'seconds',   // 'seconds' | 'minutes'
                    clockFormat: '24',        // '24' | '12'
                    timeOffset: 0,            // hours offset (-12..+14)
                    hideUiDuringSolve: false, // hide all UI except timer while solving
                    mouseStart: false,        // start/stop timer with mouse click
                    targetTimeEnabled: false, // beep + color indicator when a goal time is set
                    targetTime: null,         // goal time in seconds (null = not set yet)
                    autoExportEnabled: false,
                    autoExportEvery: 10,      // export every N solves
                    autoExportFormat: 'firecube',
                    autoExportUseFolder: false, // desktop only — write straight to a chosen folder
                    voiceInspectionEnabled: false, // speaks "8 seconds"/"12 seconds" during inspection, like a WCA judge
                    commentaryLanguage: null // null = follow UI language; 'ru'/'en' = pinned independent of it
                };
                
                this.loadSettings();
                this._lastThemeSignature = JSON.stringify([this.settings.darkTheme, this.settings.accentColor, this.settings.customFont, this.settings.customBg]);
                this.applySettings();
                this.applyTranslations();
                this.initEventListeners();
            }

            applyTranslations() {
                const lang = this.settings.language;
                const t = translations[lang];
                
                // Header buttons (только текст, не иконки)
                const statsBtn = document.querySelector('#statisticsBtn span:last-child');
                const sessionsBtn = document.querySelector('#sessionsBtn span:last-child');
                const settingsBtn = document.querySelector('#settingsBtn span:last-child');
                if (statsBtn) statsBtn.textContent = t.statistics;
                if (sessionsBtn) sessionsBtn.textContent = t.sessions;
                if (settingsBtn) settingsBtn.textContent = t.settings;

                const headerButtons = [
                    ['settingsBtn', t.settings],
                    ['sessionsBtn', t.sessions],
                    ['statisticsBtn', t.statistics]
                ];
                headerButtons.forEach(([id, label]) => {
                    const button = DOM(id);
                    if (!button) return;
                    button.title = label;
                    button.setAttribute('aria-label', label);
                    const image = button.querySelector('img');
                    if (image) image.alt = label;
                });

                const setText = (selector, text) => {
                    const el = document.querySelector(selector);
                    if (el) el.textContent = text;
                };
                setText('#fireMenuBtn', t.more);
                setText('#fireMenuAlgsTrainer span:last-child', t.algsTrainer);
                setText('.fire-menu-item-disabled span:nth-child(2)', t.multiplayer);
                setText('.fire-menu-item-disabled .fire-menu-soon', t.soon);
                setText('#dailyChallengeMenuLabel', t.dailyChallengeMenu);
                setText('#achievementsMenuLabel', t.achievementsMenu);
                setText('#shopMenuLabel', t.shopMenu);
                setText('#newScrambleBtn span:last-child', t.newScramble);
                setText('#dailyChallengeTitle', t.dailyChallengeTitle);
                setText('#dailyChallengeCloseBtn', t.dailyChallengeClose);
                setText('#dailyChallengeSolveBtn', t.dailyChallengeSolve);
                setText('#dailyChallengeActiveBadge', `\u{1F4C5} ${t.dailyChallengeActive}`);
                setText('#streakModalTitle', t.streakTitle);
                setText('#streakModalSubtitle', t.streakSubtitle);
                setText('#currentStreakLabel', t.streakCurrent);
                setText('#bestStreakLabel', t.streakBest);
                setText('#activeDaysLabel', t.streakActiveDays);
                setText('#streakCalendarHint', t.streakHint);
                setText('#streakLessLabel', t.streakLess);
                setText('#streakMoreLabel', t.streakMore);
                const streakButton = DOM('streakButton');
                if (streakButton) {
                    streakButton.title = t.streakOpen;
                    streakButton.setAttribute('aria-label', t.streakOpen);
                }
                const streakClose = DOM('streakCloseIcon');
                if (streakClose) streakClose.setAttribute('aria-label', t.close);
                DOM('streakPrevMonth')?.setAttribute('aria-label', t.streakPreviousMonth);
                DOM('streakNextMonth')?.setAttribute('aria-label', t.streakNextMonth);
                
                // Timer hint (reflects Mouse Start setting / touch devices)
                const timerHint = document.querySelector('.timer-hint');
                if (timerHint) {
                    const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
                    timerHint.textContent = this.settings.mouseStart
                        ? t.timerHintMouse
                        : (isTouch ? (t.timerHintTouch || t.timerHintMouse) : t.timerHint);
                }
                
                // Control buttons
                const dnfBtn = document.querySelector('#dnfBtn');
                const plusTwoBtn = document.querySelector('#plusTwoBtn');
                const deleteBtn = document.querySelector('#deleteBtn');
                const editBtn = document.querySelector('#editBtn');
                if (dnfBtn) dnfBtn.textContent = t.dnf;
                if (plusTwoBtn) plusTwoBtn.textContent = t.plusTwo;
                if (deleteBtn) deleteBtn.textContent = t.delete;
                if (editBtn) editBtn.textContent = t.edit;
                
                // Export buttons
                const exportJsonBtn = document.querySelector('#exportJsonBtn');
                const exportCsvBtn = document.querySelector('#exportCsvBtn');
                const importExportBtn = document.querySelector('#importExportBtn');
                const importExportDataBtn = document.querySelector('#importExportDataBtn');
                if (exportJsonBtn) exportJsonBtn.textContent = t.exportJSON;
                if (exportCsvBtn) exportCsvBtn.textContent = t.exportCSV;
                if (importExportBtn) importExportBtn.textContent = `📤 ${t.importExport || 'Import / Export'}`;
                if (importExportDataBtn) importExportDataBtn.textContent = t.importExport || 'Import / Export';

                // Telegram channel promo button (top-right corner)
                const tgPromoBtnLabel = document.querySelector('#tgPromoBtnLabel');
                if (tgPromoBtnLabel) tgPromoBtnLabel.textContent = t.tgPromoBtn;

                // Import/Export modal
                const ieModalTitle = document.querySelector('#ieModalTitle');
                const ieExportTitle = document.querySelector('#ieExportTitle');
                const ieImportTitle = document.querySelector('#ieImportTitle');
                if (ieModalTitle) ieModalTitle.textContent = t.importExport;
                if (ieExportTitle) ieExportTitle.textContent = t.ieExportTitle;
                if (ieImportTitle) ieImportTitle.textContent = t.ieImportTitle;

                // Auth (login / register)
                const authBtn = document.querySelector('#authBtn');
                const authRegisterTitle = document.querySelector('#authRegisterTitle');
                const authNicknameLabel = document.querySelector('#authNicknameLabel');
                const authRegEmailLabel = document.querySelector('#authRegEmailLabel');
                const authRegPasswordLabel = document.querySelector('#authRegPasswordLabel');
                const authRegPasswordRepeatLabel = document.querySelector('#authRegPasswordRepeatLabel');
                const authRegisterBtn = document.querySelector('#authRegisterBtn');
                const authDividerText = document.querySelector('#authDividerText');
                const authLoginIdLabel = document.querySelector('#authLoginIdLabel');
                const authLoginPasswordLabel = document.querySelector('#authLoginPasswordLabel');
                const authCloseBtn = document.querySelector('#authCloseBtn');
                const authLoginBtn = document.querySelector('#authLoginBtn');
                const authWarningTitle = document.querySelector('#authWarningTitle');
                const authWarningText = document.querySelector('#authWarningText');
                const authWarningCloseBtn = document.querySelector('#authWarningCloseBtn');
                const authAccountCloseBtn = document.querySelector('#authAccountCloseBtn');
                const authLogoutBtn = document.querySelector('#authLogoutBtn');
                const authLogoutConfirmTitle = document.querySelector('#authLogoutConfirmTitle');
                const authLogoutCancelBtn = document.querySelector('#authLogoutCancelBtn');
                const authLogoutConfirmBtn = document.querySelector('#authLogoutConfirmBtn');
                if (authBtn) {
                    const authUser = AppStorage.getJSON('authUser');
                    const equippedTitle = authUser ? window.progression?.getEquippedTitle?.() : null;
                    authBtn.innerHTML = '<span class="auth-profile-icon">👤</span><span class="auth-profile-copy"><strong></strong><small></small></span>';
                    authBtn.querySelector('strong').textContent = authUser ? (authUser.nickname || authUser.email) : t.authBtn;
                    const titleSlot=authBtn.querySelector('small');titleSlot.classList.toggle('hidden',!equippedTitle);titleSlot.innerHTML=equippedTitle?window.progression._titleMarkup(equippedTitle):'';
                    window.progression?.fitTitleElements?.(authBtn);
                }
                if (authRegisterTitle) authRegisterTitle.textContent = t.authRegisterTitle;
                if (authNicknameLabel) authNicknameLabel.textContent = t.authNicknameLabel;
                if (authRegEmailLabel) authRegEmailLabel.textContent = t.authRegEmailLabel;
                if (authRegPasswordLabel) authRegPasswordLabel.textContent = t.authRegPasswordLabel;
                if (authRegPasswordRepeatLabel) authRegPasswordRepeatLabel.textContent = t.authRegPasswordRepeatLabel;
                if (authRegisterBtn) authRegisterBtn.textContent = t.authRegisterBtn;
                if (authDividerText) authDividerText.textContent = t.authDividerText;
                if (authLoginIdLabel) authLoginIdLabel.textContent = t.authLoginIdLabel;
                if (authLoginPasswordLabel) authLoginPasswordLabel.textContent = t.authLoginPasswordLabel;
                if (authCloseBtn) authCloseBtn.textContent = t.authCloseBtn;
                if (authLoginBtn) authLoginBtn.textContent = t.authLoginBtn;
                if (authWarningTitle) authWarningTitle.textContent = t.authWarningTitle;
                if (authWarningText) authWarningText.textContent = t.authWarningText;
                if (authWarningCloseBtn) authWarningCloseBtn.textContent = t.authWarningCloseBtn;
                if (authAccountCloseBtn) authAccountCloseBtn.textContent = t.authAccountCloseBtn;
                if (authLogoutBtn) authLogoutBtn.textContent = t.authLogoutBtn;
                if (authLogoutConfirmTitle) authLogoutConfirmTitle.textContent = t.authLogoutConfirm;
                if (authLogoutCancelBtn) authLogoutCancelBtn.textContent = t.authLogoutCancelBtn;
                if (authLogoutConfirmBtn) authLogoutConfirmBtn.textContent = t.authLogoutBtn;

                // Target Time
                const ttModalTitle = document.querySelector('#ttModalTitle');
                const ttEnableLabel = document.querySelector('#ttEnableLabel');
                const ttGoalLabel = document.querySelector('#ttGoalLabel');
                if (ttModalTitle) ttModalTitle.textContent = t.ttModalTitle;
                if (ttEnableLabel) ttEnableLabel.textContent = t.ttEnableLabel;
                if (ttGoalLabel) ttGoalLabel.textContent = t.ttGoalLabel;
                if (window.timer && window.timer._updateTargetTimeBtn) window.timer._updateTargetTimeBtn();

                // Honest Mode
                const hmModalTitle = document.querySelector('#hmModalTitle');
                const hmDesc = document.querySelector('#hmDesc');
                const hmActiveDesc = document.querySelector('#hmActiveDesc');
                const hmMinutesLabel = document.querySelector('#hmMinutesLabel');
                if (hmModalTitle) hmModalTitle.textContent = t.hmModalTitle;
                if (hmDesc) hmDesc.textContent = t.hmDesc;
                if (hmActiveDesc) hmActiveDesc.textContent = t.hmActiveDesc;
                if (hmMinutesLabel) hmMinutesLabel.textContent = t.hmMinutesLabel;

                const honestModeCloseActive = DOM('honestModeCloseActive');
                if (honestModeCloseActive) honestModeCloseActive.textContent = t.hmCloseLabel;
                if (window.timer && window.timer._updateHonestModeBtn) window.timer._updateHonestModeBtn();
                
                // Left column
                const lastSolvesTitle = document.querySelector('.left-column .card-title');
                if (lastSolvesTitle) lastSolvesTitle.textContent = t.lastSolves;
                
                // Right column
                const rightColumnTitles = document.querySelectorAll('.right-column .card-title');
                if (rightColumnTitles[0]) rightColumnTitles[0].textContent = t.bestTimes;
                if (rightColumnTitles[1]) rightColumnTitles[1].textContent = t.averages;
                if (rightColumnTitles[2]) rightColumnTitles[2].textContent = t.progress;

                const bestLabels = document.querySelectorAll('.best-label');
                if (bestLabels[0]) bestLabels[0].textContent = t.best;
                if (bestLabels[1]) bestLabels[1].textContent = t.ao5;
                if (bestLabels[2]) bestLabels[2].textContent = t.ao12;
                if (bestLabels[3]) bestLabels[3].textContent = t.ao100;
                const averageLabels = document.querySelectorAll('.average-label');
                if (averageLabels[0]) averageLabels[0].textContent = t.ao5;
                if (averageLabels[1]) averageLabels[1].textContent = t.ao12;
                if (averageLabels[2]) averageLabels[2].textContent = t.ao100;
                
                // Settings modal
                const settingsTitle = document.querySelector('#settingsOverlay .settings-title');
                if (settingsTitle) settingsTitle.textContent = t.settingsTitle;
                
                const settingsSections = document.querySelectorAll('#settingsOverlay .settings-section-title');
                if (settingsSections[0]) settingsSections[0].textContent = t.timerSettings;
                if (settingsSections[1]) settingsSections[1].textContent = t.theme;
                if (settingsSections[2]) settingsSections[2].textContent = t.audio;
                if (settingsSections[3]) settingsSections[3].textContent = t.language;
                if (settingsSections[4]) settingsSections[4].textContent = t.displayOptions;
                if (settingsSections[5]) settingsSections[5].textContent = t.timerMode;
                if (settingsSections[6]) settingsSections[6].textContent = t.timerMood;
                if (settingsSections[7]) settingsSections[7].textContent = t.dataManagement;
                
                const settingsSubtitles = document.querySelectorAll('#settingsOverlay .settings-subtitle');
                if (settingsSubtitles[0]) settingsSubtitles[0].textContent = t.chooseLanguage;
                if (settingsSubtitles[1]) settingsSubtitles[1].textContent = t.chooseMood;
                
                const settingsLabels = document.querySelectorAll('#settingsOverlay .settings-label');
                if (settingsLabels[0]) settingsLabels[0].textContent = t.holdDelay;
                if (settingsLabels[1]) settingsLabels[1].textContent = t.timerColor;
                if (settingsLabels[2]) settingsLabels[2].textContent = t.darkTheme;
                if (settingsLabels[3]) settingsLabels[3].textContent = t.soundEffects;
                if (settingsLabels[4]) settingsLabels[4].textContent = t.showSessionAvg;
                if (settingsLabels[5]) settingsLabels[5].textContent = t.showAo5;
                if (settingsLabels[6]) settingsLabels[6].textContent = t.showAo12;
                if (settingsLabels[7]) settingsLabels[7].textContent = t.showAo100;
                
                const moodLabels = document.querySelectorAll('.mood-label');
                if (moodLabels[0]) moodLabels[0].textContent = t.moodFriend;
                if (moodLabels[1]) moodLabels[1].textContent = t.moodTeaser;
                if (moodLabels[2]) moodLabels[2].textContent = t.moodTrainer;
                if (moodLabels[3]) moodLabels[3].textContent = t.moodEnemy;
                if (moodLabels[4]) moodLabels[4].textContent = t.moodSilent;

                const commentaryLangLabel = document.getElementById('commentaryLangLabel');
                if (commentaryLangLabel) commentaryLangLabel.textContent = t.commentaryLangLabel;
                
                const settingsButtons = document.querySelectorAll('#settingsOverlay .settings-button');
                if (settingsButtons[0]) settingsButtons[0].textContent = t.exportJSON;
                if (settingsButtons[1]) settingsButtons[1].textContent = t.exportCSV;
                if (settingsButtons[2]) settingsButtons[2].textContent = t.importExport;
                if (settingsButtons[3]) settingsButtons[3].textContent = t.resetSession;
                
                // NEW SETTINGS MODAL - Sidebar navigation
                const settingsNavItems = document.querySelectorAll('.settings-nav-item');
                if (settingsNavItems[0]) settingsNavItems[0].textContent = t.sidebarTimer;
                if (settingsNavItems[1]) settingsNavItems[1].textContent = t.sidebarTheme;
                if (settingsNavItems[2]) settingsNavItems[2].textContent = t.sidebarSound;
                if (settingsNavItems[3]) settingsNavItems[3].textContent = t.sidebarLanguage;
                if (settingsNavItems[4]) settingsNavItems[4].textContent = t.sidebarDisplay;
                if (settingsNavItems[5]) settingsNavItems[5].textContent = t.sidebarMood;
                if (settingsNavItems[6]) settingsNavItems[6].textContent = t.sidebarAnalytics;
                if (settingsNavItems[7]) settingsNavItems[7].textContent = t.sidebarData;
                
                // NEW SETTINGS MODAL - Title
                const settingsTitleNew = document.querySelector('.settings-title-new');
                if (settingsTitleNew) settingsTitleNew.textContent = t.settings;
                
                // NEW SETTINGS MODAL - Section titles (addressed by ID, not fragile DOM index)
                const _st = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
                _st('st-timer',            t.timerSettingsDelay);
                _st('st-theme',            t.interfaceTheme);
                _st('st-theme-custom',     t.advancedCustomization || 'Advanced Customization');
                _st('st-theme-timercolor', t.runningTimerColor);
                _st('st-theme-timeformat', t.timeDisplayFormat || 'Time Display Format');
                _st('st-sound',            t.enableSoundEffects);
                _st('st-soundInspection',  t.inspection);
                _st('st-language',         t.language);
                _st('st-display',          t.displayOptions);
                _st('st-mood',             t.timerMood);
                _st('st-data',             t.dataManagement);

                // Analytics section
                _st('st-analytics-clockformat', t.clockFormat);
                _st('st-analytics-currenttime', t.currentTime);
                _st('st-analytics-offset-label', t.timeOffsetLabel);
                _st('st-analytics-hint', t.timeOffsetHint);

                // Statistics — Trend & Heatmap titles
                _st('st-stat-trend',   t.trendTitle);
                _st('st-stat-heatmap', t.heatmapTitle);
                
                // NEW SETTINGS MODAL - Labels
                const settingLabelNew = document.querySelector('.setting-label-new');
                if (settingLabelNew) settingLabelNew.textContent = t.soundEffects;
                
                const checkboxLabels = document.querySelectorAll('.checkbox-label');
                if (checkboxLabels[0]) checkboxLabels[0].textContent = t.showAo5;
                if (checkboxLabels[1]) checkboxLabels[1].textContent = t.showAo12;
                if (checkboxLabels[2]) checkboxLabels[2].textContent = t.showAo100;
                
                // NEW SETTINGS MODAL - Theme buttons
                const themeLabels = document.querySelectorAll('.theme-label');
                if (themeLabels[0]) themeLabels[0].textContent = t.lightTheme;
                if (themeLabels[1]) themeLabels[1].textContent = t.darkTheme;
                
                // NEW SETTINGS MODAL - Mood cards
                const moodCardLabels = document.querySelectorAll('.mood-card-label');
                if (moodCardLabels[0]) moodCardLabels[0].textContent = t.moodFriend;
                if (moodCardLabels[1]) moodCardLabels[1].textContent = t.moodTeaser;
                if (moodCardLabels[2]) moodCardLabels[2].textContent = t.moodTrainer;
                if (moodCardLabels[3]) moodCardLabels[3].textContent = t.moodEnemy;
                if (moodCardLabels[4]) moodCardLabels[4].textContent = t.moodRival;
                
                // Inspection setting
                const inspectionLabel = document.getElementById('inspectionLabel');
                const inspectionDescElem = document.getElementById('inspectionDesc');
                if (inspectionLabel) inspectionLabel.textContent = t.inspection;
                if (inspectionDescElem) inspectionDescElem.textContent = t.inspectionDesc;
                
                // Inspection Mode segmented control labels
                const inspectionModeLabel = document.getElementById('inspectionModeLabel');
                const inspModeWcaDesc = document.getElementById('inspModeWcaDesc');
                const inspModeTrainingTitle = document.getElementById('inspModeTrainingTitle');
                const inspModeTrainingDesc = document.getElementById('inspModeTrainingDesc');
                if (inspectionModeLabel) inspectionModeLabel.textContent = t.inspectionMode;
                if (inspModeWcaDesc) inspModeWcaDesc.textContent = t.inspectionModeWca;
                if (inspModeTrainingTitle) inspModeTrainingTitle.textContent = t.inspectionModeTraining;
                if (inspModeTrainingDesc) inspModeTrainingDesc.textContent = t.inspectionModeTrainingDesc;

                const voiceInspectionLabel = document.getElementById('voiceInspectionLabel');
                const voiceInspectionDesc = document.getElementById('voiceInspectionDesc');
                if (voiceInspectionLabel) voiceInspectionLabel.textContent = t.voiceInspectionLabel;
                if (voiceInspectionDesc) voiceInspectionDesc.textContent = t.voiceInspectionDesc;
                
                // NEW SETTINGS MODAL - Data buttons
                const dataBtns = document.querySelectorAll('.data-btn');
                if (dataBtns[0]) dataBtns[0].textContent = t.exportCSV;
                if (dataBtns[1]) dataBtns[1].textContent = t.exportJSON;
                if (dataBtns[2]) dataBtns[2].textContent = t.importExport;
                if (dataBtns[3]) dataBtns[3].textContent = t.resetSession;
                
                // Statistics modal
                const statisticsTitle = document.querySelector('#statisticsOverlay .statistics-title');
                if (statisticsTitle) statisticsTitle.textContent = t.statisticsTitle;

                _st('st-stat-distribution', t.timeDistribution);
                _st('st-stat-details',      t.sessionDetails);
                _st('st-stat-trend',        t.trendTitle);
                _st('st-stat-heatmap',      t.heatmapTitle);
                _st('st-stat-subsessions',  t.subsessionsTitle);
                _st('st-stat-penalty-pie',    t.penaltyPieTitle);
                _st('st-stat-discipline-pie', t.disciplinePieTitle);
                _st('st-stat-subsession-pie', t.subsessionPieTitle);
                setText('.chart-section-title', t.progressChart);
                _st('chartZoomHint', t.chartZoomHint);
                if (DOM('chartResetZoom')) DOM('chartResetZoom').textContent = `⊡ ${t.resetZoom}`;
                _st('trendLabel', t.trendNeedMore.replace('{n}', '20'));
                const trendCompareLabels = document.querySelectorAll('.trend-compare-label');
                if (trendCompareLabels[0]) trendCompareLabels[0].textContent = t.trendFirst.replace('{n}', '10');
                if (trendCompareLabels[1]) trendCompareLabels[1].textContent = t.trendLast.replace('{n}', '10');
                _st('heatmapHint', t.heatmapHint);

                // Subsession modal
                _st('subsessionModalTitleEl',  t.subsessionModalTitle);
                _st('subsessionColorLabelEl',  t.subsessionColorLabel);
                _st('subsessionExcludeLabelEl', t.subsessionExcludeLabel);
                _st('subsessionExcludeHintEl',  t.subsessionExcludeHint);
                _st('subsessionCancelBtn',  t.subsessionCancel);
                _st('subsessionCreateBtn',  t.subsessionCreate);
                _st('shContextAddSubsession', t.subsessionContextBtn);

                const nameInput = DOM('subsessionNameInput');
                if (nameInput) nameInput.placeholder = t.subsessionNamePlaceholder || 'e.g. Morning practice';

                // Export Image
                const exportBtn = DOM('exportImageBtn');
                if (exportBtn) exportBtn.textContent = t.exportImageBtn;
                _st('exportImgTitleEl',        t.exportImageTitle);
                _st('exportFormatLabelEl',     t.exportFormatLabel);
                _st('exportFormatStoryEl',     t.exportFormatStory);
                _st('exportFormatPostEl',      t.exportFormatPost);
                _st('exportFormatBannerEl',    t.exportFormatBanner);
                _st('exportIncludeLabelEl',    t.exportIncludeLabel);
                _st('exportOptBestEl',         t.exportOptBest);
                _st('exportOptTrendEl',        t.exportOptTrend);
                _st('exportOptCountEl',        t.exportOptCount);
                _st('exportOptDisciplineEl',   t.exportOptDiscipline);
                _st('exportSessionLabelEl',    t.exportSessionLabel);
                _st('exportImgCancelBtn',      t.cancel);
                const dlBtn = DOM('exportImgDownloadBtn');
                if (dlBtn) dlBtn.textContent = t.exportDownloadBtn;

                // Timer behaviour
                _st('st-hideUiLabel',    t.hideUiLabel);
                _st('st-hideUiDesc',     t.hideUiDesc);
                _st('st-mouseStartLabel', t.mouseStartLabel);
                _st('st-mouseStartDesc',  t.mouseStartDesc);
                _st('st-autoExportLabel', t.autoExportLabel);
                _st('st-autoExportDesc',  t.autoExportDesc);
                _st('st-autoExportEveryLabel', t.autoExportEveryLabel);
                _st('st-autoExportFormatLabel', t.autoExportFormatLabel);
                _st('st-autoExportFolderDesc', t.autoExportFolderDesc);
                
                const statCardLabels = document.querySelectorAll('.stat-card-label');
                if (statCardLabels[0]) statCardLabels[0].textContent = t.bestSingle;
                if (statCardLabels[1]) statCardLabels[1].textContent = t.bestAo5;
                if (statCardLabels[2]) statCardLabels[2].textContent = t.bestAo12;
                if (statCardLabels[3]) statCardLabels[3].textContent = t.bestAo100;
                if (statCardLabels[4]) statCardLabels[4].textContent = t.sessionAvg;
                if (statCardLabels[5]) statCardLabels[5].textContent = t.totalSolves;
                
                const chartToggles = document.querySelectorAll('.chart-toggle label');
                if (chartToggles[0]) chartToggles[0].childNodes[1].textContent = ' ' + t.singles;
                if (chartToggles[1]) chartToggles[1].childNodes[1].textContent = ' Ao5';
                if (chartToggles[2]) chartToggles[2].childNodes[1].textContent = ' Ao12';
                if (chartToggles[3]) chartToggles[3].childNodes[1].textContent = ' Ao100';
                
                const statsRowLabels = document.querySelectorAll('.stats-row-label');
                if (statsRowLabels[0]) statsRowLabels[0].textContent = t.bestSolve;
                if (statsRowLabels[1]) statsRowLabels[1].textContent = t.worstSolve;
                if (statsRowLabels[2]) statsRowLabels[2].textContent = t.dnfs;
                if (statsRowLabels[3]) statsRowLabels[3].textContent = t.penalties;
                if (statsRowLabels[4]) statsRowLabels[4].textContent = t.mean;
                if (statsRowLabels[5]) statsRowLabels[5].textContent = t.stdDev;
                
                // Sessions modal
                const sessionsTitle = document.querySelector('#sessionsOverlay .sessions-title');
                if (sessionsTitle) sessionsTitle.textContent = t.sessionsTitle;
                
                const newSessionBtn = document.querySelector('#newSessionBtn');
                const renameSessionBtn = document.querySelector('#renameSessionBtn');
                const resetSessionBtn = document.querySelector('#resetSessionBtn');
                const deleteSessionBtn = document.querySelector('#deleteSessionBtn');
                const exportSessionBtn = document.querySelector('#exportSessionBtn');
                
                if (newSessionBtn) newSessionBtn.textContent = t.newSession;
                if (renameSessionBtn) renameSessionBtn.textContent = t.rename;
                if (resetSessionBtn) resetSessionBtn.textContent = t.resetSession;
                if (deleteSessionBtn) deleteSessionBtn.textContent = t.deleteSession;
                if (exportSessionBtn) exportSessionBtn.textContent = t.exportSession;
                
                const sessionStatLabels = document.querySelectorAll('.session-stat-label');
                if (sessionStatLabels[0]) sessionStatLabels[0].textContent = t.solves.toUpperCase();
                if (sessionStatLabels[1]) sessionStatLabels[1].textContent = t.best.toUpperCase();
                if (sessionStatLabels[2]) sessionStatLabels[2].textContent = 'AO5';
                if (sessionStatLabels[3]) sessionStatLabels[3].textContent = 'AO12';
                if (sessionStatLabels[4]) sessionStatLabels[4].textContent = 'AO100';
                if (sessionStatLabels[5]) sessionStatLabels[5].textContent = 'AVG';
                if (sessionStatLabels[5]) sessionStatLabels[5].textContent = t.averageShort;

                _st('sessionDetailsTitle', t.noSession);
                _st('sessionDetailsSubtitle', t.defaultSession);

                _st('hotkeySessionsLabel', t.hotkeySessions);
                _st('hotkeyAchievementsLabel', t.hotkeyAchievements);
                _st('hotkeyShopLabel', t.hotkeyShop);
                _st('hotkeyStatsLabel', t.hotkeyStats);
                _st('hotkeyDnfLabel', t.dnf);
                _st('hotkeyPlusTwoLabel', t.plusTwo);
                _st('hotkeyDeleteLabel', t.hotkeyDelete);
                _st('hotkeyEditLabel', t.hotkeyEdit);
                
                // Update language selector active state
                document.querySelectorAll('.lang-btn').forEach(btn => {
                    if (btn.dataset.lang === lang) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
            }

            loadSettings() {
                const saved = AppStorage.getJSON('cubeTimerSettings');
                if (saved) {
                    this.settings = { ...this.settings, ...saved };
                }
            }

            saveSettings() {
                AppStorage.setJSON('cubeTimerSettings', this.settings);
                if (window.progression) {
                    window.dispatchEvent(new CustomEvent('progressionevent', { detail: { type: 'settingsChanged' } }));
                    const signature = JSON.stringify([this.settings.darkTheme, this.settings.accentColor, this.settings.customFont, this.settings.customBg]);
                    if (signature !== this._lastThemeSignature) {
                        window.dispatchEvent(new CustomEvent('progressionevent', { detail: { type: 'themeChanged' } }));
                    }
                    this._lastThemeSignature = signature;
                }
            }

            applySettings() {
                // Apply theme
                if (this.settings.darkTheme) {
                    document.body.classList.remove('light-theme');
                } else {
                    document.body.classList.add('light-theme');
                }

                // Apply customization layer
                this.applyCustomization();

                // Apply display options
                this.updateDisplayOptions();

                // Update UI elements
                const holdDelaySlider = DOM('holdDelaySlider');
                if (holdDelaySlider) {
                    holdDelaySlider.value = this.settings.holdDelay;
                    DOM('holdDelayValue').textContent = `Hold delay: ${this.settings.holdDelay} ms`;
                }
                
                // Update theme buttons
                document.querySelectorAll('.theme-btn').forEach(btn => {
                    if ((btn.dataset.theme === 'dark' && this.settings.darkTheme) || 
                        (btn.dataset.theme === 'light' && !this.settings.darkTheme)) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });

                const soundsToggle = DOM('soundsToggle');
                if (this.settings.sounds) {
                    soundsToggle.classList.add('active');
                } else {
                    soundsToggle.classList.remove('active');
                }

                // Update color picker
                document.querySelectorAll('.color-option-new').forEach(opt => {
                    if (opt.dataset.color === this.settings.timerColor) {
                        opt.classList.add('selected');
                    } else {
                        opt.classList.remove('selected');
                    }
                });

                // Update checkboxes
                const showAo5Checkbox = DOM('showAo5Checkbox');
                const showAo12Checkbox = DOM('showAo12Checkbox');
                const showAo100Checkbox = DOM('showAo100Checkbox');
                
                if (showAo5Checkbox) showAo5Checkbox.checked = this.settings.showAo5;
                if (showAo12Checkbox) showAo12Checkbox.checked = this.settings.showAo12;
                if (showAo100Checkbox) showAo100Checkbox.checked = this.settings.showAo100;

                // Update mood cards
                document.querySelectorAll('.mood-card').forEach(card => {
                    if (card.dataset.mood === this.settings.timerMood) {
                        card.classList.add('active');
                    } else {
                        card.classList.remove('active');
                    }
                });

                // Update commentary language segmented control
                const commentaryLang = this.settings.commentaryLanguage || this.settings.language || 'ru';
                document.querySelectorAll('[data-clang]').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.clang === commentaryLang);
                });

                // Update inspection toggle
                const inspectionToggle = DOM('inspectionToggle');
                if (inspectionToggle) {
                    if (this.settings.inspection) {
                        inspectionToggle.classList.add('active');
                    } else {
                        inspectionToggle.classList.remove('active');
                    }
                }

                // Show/hide inspection mode group based on inspection toggle state
                const inspectionModeGroup = DOM('inspectionModeGroup');
                if (inspectionModeGroup) {
                    inspectionModeGroup.style.display = this.settings.inspection ? 'block' : 'none';
                }

                // Update voice inspection warnings toggle
                const voiceInspectionToggle = DOM('voiceInspectionToggle');
                if (voiceInspectionToggle) {
                    voiceInspectionToggle.classList.toggle('active', !!this.settings.voiceInspectionEnabled);
                }

                // Update active segmented button
                document.querySelectorAll('.segmented-btn').forEach(btn => {
                    if (btn.dataset.imode === this.settings.inspectionMode) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });

                // Update language selector
                document.querySelectorAll('.lang-btn-new, .lang-btn').forEach(btn => {
                    if (btn.dataset.lang === this.settings.language) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });

                // Sync customization UI controls
                this._syncCustomUI();

                // Sync time format segmented control
                this._syncTimeFormatUI();
            }

            // ── Advanced Customization ────────────────────────────────────
            // Accent palette definition (18 colours)
            static get ACCENT_PALETTE() {
                return [
                    { color: '#4a9eff', name: 'Blue' },
                    { color: '#38bdf8', name: 'Sky' },
                    { color: '#7b6fff', name: 'Violet' },
                    { color: '#a855f7', name: 'Purple' },
                    { color: '#ec4899', name: 'Pink' },
                    { color: '#f43f5e', name: 'Rose' },
                    { color: '#ef4444', name: 'Red' },
                    { color: '#f97316', name: 'Orange' },
                    { color: '#f59e0b', name: 'Amber' },
                    { color: '#eab308', name: 'Yellow' },
                    { color: '#84cc16', name: 'Lime' },
                    { color: '#22c55e', name: 'Green' },
                    { color: '#10b981', name: 'Emerald' },
                    { color: '#14b8a6', name: 'Teal' },
                    { color: '#06b6d4', name: 'Cyan' },
                    { color: '#6366f1', name: 'Indigo' },
                    { color: '#be123c', name: 'Crimson' },
                    { color: '#94a3b8', name: 'Slate' },
                ];
            }

            static get DARK_BACKGROUNDS() {
                return [
                    { id: 'none',             label: 'Default'    },
                    { id: 'dark-gradient',    label: 'Gradient'   },
                    { id: 'dark-pattern',     label: 'Dots'       },
                    { id: 'dark-minimal',     label: 'Minimal'    },
                    { id: 'dark-red',         label: 'Red Glow'   },
                    { id: 'dark-violet',      label: 'Violet'     },
                    { id: 'dark-neon',        label: 'Neon'       },
                    { id: 'dark-graphite',    label: 'Graphite'   },
                    // ── 100 new dark backgrounds ──
                    { id: 'dark-aurora',      label: 'Aurora'     },
                    { id: 'dark-nebula',      label: 'Nebula'     },
                    { id: 'dark-cosmos',      label: 'Cosmos'     },
                    { id: 'dark-midnight',    label: 'Midnight'   },
                    { id: 'dark-deep-sea',    label: 'Deep Sea'   },
                    { id: 'dark-eclipse',     label: 'Eclipse'    },
                    { id: 'dark-void',        label: 'Void'       },
                    { id: 'dark-abyss',       label: 'Abyss'      },
                    { id: 'dark-starfield',   label: 'Starfield'  },
                    { id: 'dark-galaxy',      label: 'Galaxy'     },
                    { id: 'dark-ember',       label: 'Ember'      },
                    { id: 'dark-lava',        label: 'Lava'       },
                    { id: 'dark-magma',       label: 'Magma'      },
                    { id: 'dark-copper',      label: 'Copper'     },
                    { id: 'dark-rust',        label: 'Rust'       },
                    { id: 'dark-infrared',    label: 'Infrared'   },
                    { id: 'dark-sunset',      label: 'Sunset'     },
                    { id: 'dark-crimson',     label: 'Crimson'    },
                    { id: 'dark-amber-glow',  label: 'Amber'      },
                    { id: 'dark-volcano',     label: 'Volcano'    },
                    { id: 'dark-arctic',      label: 'Arctic'     },
                    { id: 'dark-ice',         label: 'Ice'        },
                    { id: 'dark-teal-depths', label: 'Teal'       },
                    { id: 'dark-ocean',       label: 'Ocean'      },
                    { id: 'dark-aqua',        label: 'Aqua'       },
                    { id: 'dark-sapphire',    label: 'Sapphire'   },
                    { id: 'dark-cobalt',      label: 'Cobalt'     },
                    { id: 'dark-steel',       label: 'Steel'      },
                    { id: 'dark-slate-glow',  label: 'Slate'      },
                    { id: 'dark-frost',       label: 'Frost'      },
                    { id: 'dark-forest',      label: 'Forest'     },
                    { id: 'dark-matrix',      label: 'Matrix'     },
                    { id: 'dark-jungle',      label: 'Jungle'     },
                    { id: 'dark-emerald-deep',label: 'Emerald'    },
                    { id: 'dark-lime-glow',   label: 'Lime'       },
                    { id: 'dark-mint',        label: 'Mint'       },
                    { id: 'dark-hunter',      label: 'Hunter'     },
                    { id: 'dark-cypress',     label: 'Cypress'    },
                    { id: 'dark-seaweed',     label: 'Seaweed'    },
                    { id: 'dark-bio',         label: 'Bio'        },
                    { id: 'dark-amethyst',    label: 'Amethyst'   },
                    { id: 'dark-orchid',      label: 'Orchid'     },
                    { id: 'dark-rose-dark',   label: 'Rose'       },
                    { id: 'dark-fuchsia',     label: 'Fuchsia'    },
                    { id: 'dark-plum',        label: 'Plum'       },
                    { id: 'dark-magenta',     label: 'Magenta'    },
                    { id: 'dark-mulberry',    label: 'Mulberry'   },
                    { id: 'dark-lavender',    label: 'Lavender'   },
                    { id: 'dark-indigo-deep', label: 'Indigo'     },
                    { id: 'dark-grape',       label: 'Grape'      },
                    { id: 'dark-grid',        label: 'Grid'       },
                    { id: 'dark-hex',         label: 'Hex'        },
                    { id: 'dark-cross',       label: 'Cross'      },
                    { id: 'dark-lines',       label: 'Lines'      },
                    { id: 'dark-diamonds',    label: 'Diamonds'   },
                    { id: 'dark-weave',       label: 'Weave'      },
                    { id: 'dark-circuit',     label: 'Circuit'    },
                    { id: 'dark-mesh',        label: 'Mesh'       },
                    { id: 'dark-stripes',     label: 'Stripes'    },
                    { id: 'dark-checkers',    label: 'Checkers'   },
                    { id: 'dark-aurora-2',    label: 'Aurora II'  },
                    { id: 'dark-prism',       label: 'Prism'      },
                    { id: 'dark-oil',         label: 'Oil Slick'  },
                    { id: 'dark-northern',    label: 'Northern'   },
                    { id: 'dark-borealis',    label: 'Borealis'   },
                    { id: 'dark-aurora-3',    label: 'Aurora III' },
                    { id: 'dark-spectrum',    label: 'Spectrum'   },
                    { id: 'dark-electric',    label: 'Electric'   },
                    { id: 'dark-hologram',    label: 'Hologram'   },
                    { id: 'dark-plasma',      label: 'Plasma'     },
                    { id: 'dark-charcoal',    label: 'Charcoal'   },
                    { id: 'dark-obsidian',    label: 'Obsidian'   },
                    { id: 'dark-jet',         label: 'Jet'        },
                    { id: 'dark-onyx',        label: 'Onyx'       },
                    { id: 'dark-pitch',       label: 'Pitch'      },
                    { id: 'dark-ink',         label: 'Ink'        },
                    { id: 'dark-dim',         label: 'Dim'        },
                    { id: 'dark-shade',       label: 'Shade'      },
                    { id: 'dark-shadow',      label: 'Shadow'     },
                    { id: 'dark-dusk',        label: 'Dusk'       },
                    { id: 'dark-cyberpunk',   label: 'Cyberpunk'  },
                    { id: 'dark-retrowave',   label: 'Retrowave'  },
                    { id: 'dark-vaporwave',   label: 'Vaporwave'  },
                    { id: 'dark-synthwave',   label: 'Synthwave'  },
                    { id: 'dark-outrun',      label: 'Outrun'     },
                    { id: 'dark-glitch',      label: 'Glitch'     },
                    { id: 'dark-stealth',     label: 'Stealth'    },
                    { id: 'dark-carbon',      label: 'Carbon'     },
                    { id: 'dark-tungsten',    label: 'Tungsten'   },
                    { id: 'dark-midnight-2',  label: 'Midnight II'},
                    { id: 'dark-titan',       label: 'Titan'      },
                    { id: 'dark-matrix-2',    label: 'Matrix II'  },
                    { id: 'dark-deep-blue',   label: 'Deep Blue'  },
                    { id: 'dark-midnight-rose',label:'Night Rose' },
                    { id: 'dark-toxic',       label: 'Toxic'      },
                    { id: 'dark-ultraviolet', label: 'UV'         },
                    { id: 'dark-phosphor',    label: 'Phosphor'   },
                    { id: 'dark-solar',       label: 'Solar'      },
                    { id: 'dark-moonlight',   label: 'Moonlight'  },
                    { id: 'dark-gan-cube',    label: 'GAN Cube'   },
                    { id: 'dark-gan-logo',    label: '🟦 GAN Logo'},
                ];
            }

            static get LIGHT_BACKGROUNDS() {
                return [
                    { id: 'none',              label: 'Default'    },
                    { id: 'light-blue',        label: 'Blue'       },
                    { id: 'light-silver',      label: 'Ivory'      },
                    { id: 'light-sky',         label: 'Sky'        },
                    { id: 'light-glass',       label: 'Glass'      },
                    { id: 'light-cream',       label: 'Cream'      },
                    { id: 'light-purple',      label: 'Purple'     },
                    { id: 'light-cyan',        label: 'Cyan'       },
                    { id: 'light-grey',        label: 'Slate'      },
                    // ── 100 new light backgrounds ──
                    { id: 'light-azure',       label: 'Azure'      },
                    { id: 'light-cobalt-l',    label: 'Cobalt'     },
                    { id: 'light-navy-l',      label: 'Navy'       },
                    { id: 'light-periwinkle',  label: 'Periwinkle' },
                    { id: 'light-denim',       label: 'Denim'      },
                    { id: 'light-cornflower',  label: 'Cornflower' },
                    { id: 'light-iceblue',     label: 'Ice Blue'   },
                    { id: 'light-powder',      label: 'Powder'     },
                    { id: 'light-steel-l',     label: 'Steel'      },
                    { id: 'light-horizon',     label: 'Horizon'    },
                    { id: 'light-sage',        label: 'Sage'       },
                    { id: 'light-mint-l',      label: 'Mint'       },
                    { id: 'light-spring',      label: 'Spring'     },
                    { id: 'light-fern',        label: 'Fern'       },
                    { id: 'light-meadow',      label: 'Meadow'     },
                    { id: 'light-jade',        label: 'Jade'       },
                    { id: 'light-pistachio',   label: 'Pistachio'  },
                    { id: 'light-eucalyptus',  label: 'Eucalyptus' },
                    { id: 'light-celery',      label: 'Celery'     },
                    { id: 'light-tropical',    label: 'Tropical'   },
                    { id: 'light-lilac',       label: 'Lilac'      },
                    { id: 'light-lavender-l',  label: 'Lavender'   },
                    { id: 'light-violet-l',    label: 'Violet'     },
                    { id: 'light-mauve',       label: 'Mauve'      },
                    { id: 'light-blush',       label: 'Blush'      },
                    { id: 'light-rose-l',      label: 'Rose'       },
                    { id: 'light-orchid-l',    label: 'Orchid'     },
                    { id: 'light-wisteria',    label: 'Wisteria'   },
                    { id: 'light-amethyst-l',  label: 'Amethyst'   },
                    { id: 'light-plum-l',      label: 'Plum'       },
                    { id: 'light-peach',       label: 'Peach'      },
                    { id: 'light-apricot',     label: 'Apricot'    },
                    { id: 'light-cantaloupe',  label: 'Cantaloupe' },
                    { id: 'light-honey',       label: 'Honey'      },
                    { id: 'light-butter',      label: 'Butter'     },
                    { id: 'light-lemon',       label: 'Lemon'      },
                    { id: 'light-sunshine',    label: 'Sunshine'   },
                    { id: 'light-tangerine',   label: 'Tangerine'  },
                    { id: 'light-melon',       label: 'Melon'      },
                    { id: 'light-sorbet',      label: 'Sorbet'     },
                    { id: 'light-snow',        label: 'Snow'       },
                    { id: 'light-paper',       label: 'Paper'      },
                    { id: 'light-cotton',      label: 'Cotton'     },
                    { id: 'light-chalk',       label: 'Chalk'      },
                    { id: 'light-pearl',       label: 'Pearl'      },
                    { id: 'light-linen',       label: 'Linen'      },
                    { id: 'light-parchment',   label: 'Parchment'  },
                    { id: 'light-alabaster',   label: 'Alabaster'  },
                    { id: 'light-ghost',       label: 'Ghost'      },
                    { id: 'light-mist',        label: 'Mist'       },
                    { id: 'light-grid',        label: 'Grid'       },
                    { id: 'light-dots',        label: 'Dots'       },
                    { id: 'light-lines-l',     label: 'Lines'      },
                    { id: 'light-diamonds-l',  label: 'Diamonds'   },
                    { id: 'light-cross-l',     label: 'Cross'      },
                    { id: 'light-weave-l',     label: 'Weave'      },
                    { id: 'light-hex-l',       label: 'Hex'        },
                    { id: 'light-stripes-l',   label: 'Stripes'    },
                    { id: 'light-mesh-l',      label: 'Mesh'       },
                    { id: 'light-mosaic',      label: 'Mosaic'     },
                    { id: 'light-aqua-l',      label: 'Aqua'       },
                    { id: 'light-seafoam',     label: 'Seafoam'    },
                    { id: 'light-turquoise',   label: 'Turquoise'  },
                    { id: 'light-teal-l',      label: 'Teal'       },
                    { id: 'light-glacier',     label: 'Glacier'    },
                    { id: 'light-lake',        label: 'Lake'       },
                    { id: 'light-pool',        label: 'Pool'       },
                    { id: 'light-breeze',      label: 'Breeze'     },
                    { id: 'light-crystal',     label: 'Crystal'    },
                    { id: 'light-riviera',     label: 'Riviera'    },
                    { id: 'light-sunrise',     label: 'Sunrise'    },
                    { id: 'light-rainbow',     label: 'Rainbow'    },
                    { id: 'light-cotton-candy',label: 'Candy'      },
                    { id: 'light-sherbet',     label: 'Sherbet'    },
                    { id: 'light-bubblegum',   label: 'Bubblegum'  },
                    { id: 'light-frosted',     label: 'Frosted'    },
                    { id: 'light-nordic',      label: 'Nordic'     },
                    { id: 'light-forest-l',    label: 'Forest'     },
                    { id: 'light-desert',      label: 'Desert'     },
                    { id: 'light-blossom',     label: 'Blossom'    },
                    { id: 'light-seafloor',    label: 'Seafloor'   },
                    { id: 'light-sandstone',   label: 'Sandstone'  },
                    { id: 'light-dusk-l',      label: 'Dusk'       },
                    { id: 'light-bloom',       label: 'Bloom'      },
                    { id: 'light-willow',      label: 'Willow'     },
                    { id: 'light-dandelion',   label: 'Dandelion'  },
                    { id: 'light-morning',     label: 'Morning'    },
                    { id: 'light-twilight',    label: 'Twilight'   },
                    { id: 'light-dawn',        label: 'Dawn'       },
                    { id: 'light-cloud',       label: 'Cloud'      },
                    { id: 'light-aurora-l',    label: 'Aurora'     },
                    { id: 'light-opal',        label: 'Opal'       },
                    { id: 'light-vanilla',     label: 'Vanilla'    },
                    { id: 'light-spa',         label: 'Spa'        },
                    { id: 'light-zen',         label: 'Zen'        },
                    { id: 'light-petal',       label: 'Petal'      },
                    { id: 'light-honeydew',    label: 'Honeydew'   },
                    { id: 'light-champagne',   label: 'Champagne'  },
                    { id: 'light-porcelain',   label: 'Porcelain'  },
                    { id: 'light-gan-cube',    label: 'GAN Cube'   },
                    { id: 'light-gan-logo',    label: '🟦 GAN Logo'},
                ];
            }

            buildAccentPalette() {
                const palette = document.getElementById('accentPalette');
                if (!palette || palette.children.length > 0) return; // already built
                SettingsManager.ACCENT_PALETTE.forEach(({ color, name }) => {
                    const swatch = document.createElement('div');
                    swatch.className = 'accent-swatch';
                    swatch.style.background = color;
                    swatch.title = name;
                    swatch.dataset.color = color;
                    if (color === (this.settings.accentColor || '#4a9eff')) {
                        swatch.classList.add('selected');
                    }
                    swatch.addEventListener('click', () => {
                        this.settings.accentColor = color;
                        document.querySelectorAll('.accent-swatch').forEach(s => s.classList.remove('selected'));
                        swatch.classList.add('selected');
                        this.applyCustomization();
                        this.saveSettings();
                    });
                    palette.appendChild(swatch);
                });
            }

            _initThemeGenerator() {
                const input = document.getElementById('themeGenInput');
                const btn   = document.getElementById('themeGenBtn');
                const results = document.getElementById('themeGenResults');
                if (!input || !btn || !results) return;

                btn.addEventListener('click', () => {
                    const query = input.value.trim();
                    if (!query) return;
                    const variants = this._generateThemeVariants(query);
                    this._renderThemeVariants(variants, results);
                });

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') btn.click();
                });
            }

            _parseThemeQuery(query) {
                const q = query.toLowerCase();

                const colorMap = {
                    blue:    { accent: '#4a9eff', bgs: ['dark-deep-blue','dark-cobalt','dark-ocean','dark-sapphire','light-azure','light-cobalt-l','light-navy-l'] },
                    cyan:    { accent: '#06b6d4', bgs: ['dark-teal-depths','dark-aqua','dark-arctic','dark-ice','light-teal-l','light-aqua-l','light-crystal'] },
                    green:   { accent: '#4ade80', bgs: ['dark-forest','dark-matrix','dark-emerald-deep','dark-jungle','light-sage','light-mint-l','light-jade'] },
                    red:     { accent: '#f87171', bgs: ['dark-lava','dark-crimson','dark-volcano','dark-rust','light-rose-l','light-bloom','light-blossom'] },
                    orange:  { accent: '#fb923c', bgs: ['dark-ember','dark-magma','dark-copper','dark-sunset','light-peach','light-apricot','light-tangerine'] },
                    yellow:  { accent: '#fbbf24', bgs: ['dark-amber-glow','dark-solar','dark-titan','light-honey','light-butter','light-sunshine','light-dandelion'] },
                    purple:  { accent: '#a78bfa', bgs: ['dark-amethyst','dark-grape','dark-indigo-deep','dark-lavender','light-lilac','light-lavender-l','light-amethyst-l'] },
                    pink:    { accent: '#f472b6', bgs: ['dark-rose-dark','dark-orchid','dark-fuchsia','dark-magenta','light-blush','light-rose-l','light-cotton-candy'] },
                    white:   { accent: '#e8edf4', bgs: ['dark-charcoal','dark-obsidian','dark-carbon','light-snow','light-paper','light-chalk','light-alabaster'] },
                    black:   { accent: '#e8edf4', bgs: ['dark-void','dark-pitch','dark-jet','dark-obsidian','dark-abyss'] },
                    teal:    { accent: '#2dd4bf', bgs: ['dark-teal-depths','dark-deep-sea','dark-seaweed','light-seafoam','light-turquoise','light-teal-l'] },
                    violet:  { accent: '#8b5cf6', bgs: ['dark-ultraviolet','dark-nebula','dark-plum','dark-eclipse','light-violet-l','light-wisteria','light-plum-l'] },
                };

                const styleMap = {
                    minimal:     { fonts: ['default','tech'],      bgs: ['dark-minimal','dark-dim','dark-shade','light-zen','light-paper','light-mist'] },
                    minimalist:  { fonts: ['default','tech'],      bgs: ['dark-minimal','dark-dim','dark-shade','light-zen','light-paper','light-mist'] },
                    futuristic:  { fonts: ['orbitron','tech'],     bgs: ['dark-electric','dark-cyberpunk','dark-hologram','dark-circuit','dark-neon'] },
                    retro:       { fonts: ['bebas','rajdhani'],    bgs: ['dark-retrowave','dark-synthwave','dark-vaporwave','dark-outrun'] },
                    elegant:     { fonts: ['playfair','default'],  bgs: ['dark-moonlight','dark-obsidian','light-pearl','light-champagne','light-porcelain'] },
                    bold:        { fonts: ['bebas','rajdhani'],    bgs: ['dark-gradient','dark-plasma','dark-electric'] },
                    neon:        { fonts: ['orbitron','tech'],     bgs: ['dark-neon','dark-electric','dark-glitch','dark-cyberpunk','dark-plasma'] },
                    dark:        { fonts: [],                      bgs: ['dark-void','dark-abyss','dark-obsidian','dark-jet','dark-pitch'] },
                    light:       { fonts: [],                      bgs: ['light-snow','light-cotton','light-pearl','light-mist','light-cloud'] },
                    cosmic:      { fonts: ['orbitron','tech'],     bgs: ['dark-galaxy','dark-nebula','dark-cosmos','dark-starfield','dark-aurora'] },
                    nature:      { fonts: ['rounded','default'],   bgs: ['dark-forest','dark-jungle','dark-emerald-deep','light-sage','light-meadow','light-fern'] },
                    warm:        { fonts: ['rounded','default'],   bgs: ['dark-ember','dark-sunset','dark-copper','light-peach','light-honey','light-sunrise'] },
                    cold:        { fonts: ['tech','default'],      bgs: ['dark-arctic','dark-ice','dark-frost','light-glacier','light-breeze','light-cloud'] },
                    gradient:    { fonts: [],                      bgs: ['dark-gradient','dark-aurora','dark-borealis','dark-prism','light-rainbow','light-aurora-l'] },
                    mono:        { fonts: ['mono'],                bgs: ['dark-graphite','dark-carbon','dark-charcoal','light-chalk','light-zen'] },
                    clean:       { fonts: ['default','tech'],      bgs: ['dark-minimal','dark-slate-glow','light-snow','light-mist','light-cotton'] },
                    matrix:      { fonts: ['mono','tech'],         bgs: ['dark-matrix','dark-matrix-2','dark-bio','dark-circuit'] },
                    ocean:       { fonts: ['default','rounded'],   bgs: ['dark-ocean','dark-deep-sea','dark-aqua','light-lake','light-pool','light-riviera'] },
                    space:       { fonts: ['orbitron','tech'],     bgs: ['dark-cosmos','dark-galaxy','dark-nebula','dark-void','dark-starfield'] },
                    aurora:      { fonts: ['default','orbitron'],  bgs: ['dark-aurora','dark-aurora-2','dark-aurora-3','dark-borealis','dark-northern'] },
                    pattern:     { fonts: [],                      bgs: ['dark-grid','dark-circuit','dark-mesh','dark-hex','light-grid','light-dots','light-hex-l'] },
                };

                let colorData = null, styleData = null;
                const isDark = this.settings.darkTheme;

                for (const [key, val] of Object.entries(colorMap)) {
                    if (q.includes(key)) { colorData = val; break; }
                }
                for (const [key, val] of Object.entries(styleMap)) {
                    if (q.includes(key)) { styleData = val; break; }
                }

                let bgCandidates = [];
                if (colorData) bgCandidates.push(...colorData.bgs);
                if (styleData) bgCandidates.push(...styleData.bgs);

                if (isDark) {
                    bgCandidates = bgCandidates.filter(b => !b.startsWith('light-'));
                    if (!bgCandidates.length) bgCandidates = ['dark-gradient','dark-minimal','dark-electric','dark-aurora','dark-ocean'];
                } else {
                    bgCandidates = bgCandidates.filter(b => b.startsWith('light-') || b === 'none');
                    if (!bgCandidates.length) bgCandidates = ['light-azure','light-sage','light-mist','light-frosted','light-pearl'];
                }

                bgCandidates = [...new Set(bgCandidates)];
                let fontCandidates = styleData?.fonts || [];
                if (!fontCandidates.length) fontCandidates = ['default','tech','rounded','mono','orbitron'];
                const accent = colorData?.accent || null;

                return { bgCandidates, fontCandidates, accent, isDark };
            }

            _generateThemeVariants(query) {
                const { bgCandidates, fontCandidates, accent, isDark } = this._parseThemeQuery(query);
                const allAccents = ['#4a9eff','#4ade80','#f87171','#fbbf24','#fb923c','#a78bfa','#f472b6','#06b6d4','#2dd4bf','#e8edf4'];
                const variants = [];
                const usedBgs = new Set();

                for (let i = 0; i < 3; i++) {
                    const remaining = bgCandidates.filter(b => !usedBgs.has(b));
                    const bg = remaining.length
                        ? remaining[Math.floor(i * remaining.length / 3)] || remaining[0]
                        : bgCandidates[i % bgCandidates.length] || 'none';
                    usedBgs.add(bg);
                    const font = fontCandidates[i % fontCandidates.length] || 'default';
                    const ac = accent || allAccents[i % allAccents.length];
                    variants.push({ bg, font, accent: ac, isDark });
                }
                return variants;
            }

            _renderThemeVariants(variants, container) {
                container.innerHTML = '';
                const fontLabels = { default:'Default', mono:'Mono', rounded:'Rounded', tech:'Tech', orbitron:'Futuristic', bebas:'Bold', playfair:'Elegant', rajdhani:'Timer' };
                const fontPreviews = {
                    default:  { family:"'Anybody',sans-serif",        size:'1.1rem' },
                    mono:     { family:"'JetBrains Mono',monospace",   size:'0.95rem' },
                    rounded:  { family:"'Nunito',sans-serif",          size:'1.1rem' },
                    tech:     { family:"'Space Grotesk',sans-serif",   size:'1.05rem' },
                    orbitron: { family:"'Orbitron',sans-serif",        size:'0.82rem' },
                    bebas:    { family:"'Bebas Neue',sans-serif",      size:'1.4rem', spacing:'0.06em' },
                    playfair: { family:"'Playfair Display',serif",     size:'1.05rem' },
                    rajdhani: { family:"'Rajdhani',sans-serif",        size:'1.15rem', spacing:'0.05em' },
                };

                variants.forEach((v) => {
                    const fp = fontPreviews[v.font] || fontPreviews.default;
                    const card = document.createElement('div');
                    card.className = 'theme-gen-card';

                    const bgStyle = this._getPreviewBgStyle(v.bg);

                    card.innerHTML = `
                        <div class="theme-gen-preview" style="${bgStyle} border: 2px solid ${v.accent}55;">
                            <div class="theme-gen-timer" style="font-family:${fp.family};font-size:${fp.size};letter-spacing:${fp.spacing||'normal'};color:${v.accent};">12.34</div>
                        </div>
                        <div class="theme-gen-info">
                            <span class="theme-gen-tag">${v.bg.replace(/^(dark|light)-/,'').replace(/-/g,' ')}</span>
                            <span class="theme-gen-tag">${fontLabels[v.font]||v.font}</span>
                            <span class="theme-gen-swatch" style="background:${v.accent};" title="${v.accent}"></span>
                        </div>
                        <button class="theme-gen-apply" style="border-color:${v.accent}44;color:${v.accent};">Apply</button>
                    `;

                    card.querySelector('.theme-gen-apply').addEventListener('click', () => {
                        this.settings.customBg   = v.bg;
                        this.settings.fontFamily  = v.font;
                        this.settings.accentColor = v.accent;
                        this.applyCustomization();
                        this.saveSettings();
                        this.buildBgOptions();
                        document.querySelectorAll('.font-btn').forEach(b => b.classList.toggle('active', b.dataset.font === v.font));
                        document.querySelectorAll('.color-swatch').forEach(b => b.classList.toggle('active', b.dataset.color === v.accent));
                        card.querySelector('.theme-gen-preview').style.outline = `2px solid ${v.accent}`;
                        setTimeout(() => { card.querySelector('.theme-gen-preview').style.outline = ''; }, 900);
                    });

                    container.appendChild(card);
                });
            }

            _getPreviewBgStyle(bgId) {
                const map = {
                    'none':              'background:#111827;',
                    'dark-gradient':     'background:linear-gradient(135deg,#0a0e1a,#1a1f35);',
                    'dark-minimal':      'background:#0d1117;',
                    'dark-neon':         'background:linear-gradient(135deg,#0a0e1a,#1a1f35);',
                    'dark-graphite':     'background:#1a1a2e;',
                    'dark-electric':     'background:radial-gradient(ellipse at 30% 30%,#080020,#020810);',
                    'dark-aurora':       'background:radial-gradient(ellipse at 20% 20%,#0a2a1a,#030d1a);',
                    'dark-aurora-2':     'background:radial-gradient(ellipse at 20% 20%,#001a18,#020c0e);',
                    'dark-aurora-3':     'background:radial-gradient(ellipse at 20% 30%,#001414,#000a0a);',
                    'dark-nebula':       'background:radial-gradient(ellipse at 30% 30%,#1a0030,#050010);',
                    'dark-galaxy':       'background:radial-gradient(ellipse at 30% 30%,#180028,#04000e);',
                    'dark-cosmos':       'background:linear-gradient(135deg,#000008,#040418);',
                    'dark-void':         'background:radial-gradient(ellipse at 50% 0%,#0a0820,#000000);',
                    'dark-abyss':        'background:linear-gradient(135deg,#020408,#010206);',
                    'dark-ocean':        'background:radial-gradient(ellipse at 20% 30%,#001428,#000814);',
                    'dark-deep-sea':     'background:radial-gradient(ellipse at 40% 40%,#001828,#000c18);',
                    'dark-aqua':         'background:radial-gradient(ellipse at 30% 30%,#001a24,#000c12);',
                    'dark-arctic':       'background:radial-gradient(ellipse at 30% 30%,#002030,#001018);',
                    'dark-ice':          'background:radial-gradient(ellipse at 30% 30%,#001828,#00080e);',
                    'dark-frost':        'background:radial-gradient(ellipse at 30% 30%,#001020,#000610);',
                    'dark-cobalt':       'background:radial-gradient(ellipse at 30% 30%,#000c20,#000610);',
                    'dark-sapphire':     'background:radial-gradient(ellipse at 30% 30%,#001428,#000814);',
                    'dark-deep-blue':    'background:radial-gradient(ellipse at 30% 30%,#000824,#000412);',
                    'dark-teal-depths':  'background:radial-gradient(ellipse at 30% 30%,#001c20,#000e10);',
                    'dark-forest':       'background:radial-gradient(ellipse at 30% 30%,#001c08,#000e04);',
                    'dark-matrix':       'background:radial-gradient(ellipse at 50% 0%,#001400,#000a02);',
                    'dark-jungle':       'background:radial-gradient(ellipse at 30% 30%,#001a04,#000c02);',
                    'dark-emerald-deep': 'background:radial-gradient(ellipse at 30% 30%,#001e14,#00100a);',
                    'dark-lava':         'background:radial-gradient(ellipse at 30% 30%,#2a0800,#100302);',
                    'dark-crimson':      'background:radial-gradient(ellipse at 30% 30%,#240010,#0c0005);',
                    'dark-volcano':      'background:radial-gradient(ellipse at 30% 30%,#2a0400,#0f0100);',
                    'dark-ember':        'background:radial-gradient(ellipse at 20% 30%,#2a1200,#0e0500);',
                    'dark-sunset':       'background:radial-gradient(ellipse at 30% 30%,#280a10,#0e0508);',
                    'dark-amethyst':     'background:radial-gradient(ellipse at 30% 30%,#1c001e,#08000e);',
                    'dark-grape':        'background:radial-gradient(ellipse at 30% 30%,#100020,#080010);',
                    'dark-ultraviolet':  'background:radial-gradient(ellipse at 30% 30%,#080020,#030010);',
                    'dark-plum':         'background:radial-gradient(ellipse at 30% 30%,#10001a,#06000a);',
                    'dark-cyberpunk':    'background:linear-gradient(135deg,#060210,#0a0218);',
                    'dark-retrowave':    'background:radial-gradient(ellipse at 50% 0%,#1a0028,#04000c);',
                    'dark-synthwave':    'background:radial-gradient(ellipse at 30% 30%,#180028,#04000e);',
                    'dark-hologram':     'background:radial-gradient(ellipse at 30% 30%,#020610,#001010);',
                    'dark-plasma':       'background:radial-gradient(ellipse at 30% 30%,#0c0020,#060008);',
                    'dark-glitch':       'background:linear-gradient(135deg,#04001a,#00080e);',
                    'dark-matrix-2':     'background:radial-gradient(ellipse at 50% 0%,#001400,#000800);',
                    'dark-circuit':      'background:#040810;',
                    'dark-grid':         'background:#080c14;',
                    'dark-mesh':         'background:#080a12;',
                    'dark-hex':          'background:#060a12;',
                    'dark-charcoal':     'background:linear-gradient(135deg,#111,#181818);',
                    'dark-obsidian':     'background:linear-gradient(135deg,#050505,#080808);',
                    'dark-carbon':       'background:linear-gradient(135deg,#080808,#0c0c0c);',
                    'dark-dim':          'background:linear-gradient(135deg,#0e0e14,#111118);',
                    'dark-shade':        'background:linear-gradient(135deg,#0a0a12,#0d0d16);',
                    'dark-moonlight':    'background:radial-gradient(ellipse at 30% 30%,#080c10,#040608);',
                    'dark-slate-glow':   'background:radial-gradient(ellipse at 30% 30%,#0c1018,#080a0e);',
                    'dark-borealis':     'background:radial-gradient(ellipse at 20% 20%,#001820,#010810);',
                    'dark-northern':     'background:radial-gradient(ellipse at 20% 20%,#001c10,#000e08);',
                    'dark-bio':          'background:radial-gradient(ellipse at 30% 30%,#041c08,#020e04);',
                    'dark-seaweed':      'background:radial-gradient(ellipse at 30% 30%,#001810,#000c08);',
                    'dark-amber-glow':   'background:radial-gradient(ellipse at 30% 30%,#201000,#0b0700);',
                    'dark-solar':        'background:radial-gradient(ellipse at 30% 30%,#1c1400,#0e0800);',
                    'dark-titan':        'background:radial-gradient(ellipse at 30% 30%,#141400,#080a00);',
                    'dark-midnight':     'background:radial-gradient(ellipse at 30% 30%,#050a2a,#000510);',
                    'dark-midnight-2':   'background:radial-gradient(ellipse at 30% 30%,#000820,#000210);',
                    'dark-copper':       'background:radial-gradient(ellipse at 30% 30%,#1e1000,#0a0600);',
                    'dark-rust':         'background:radial-gradient(ellipse at 30% 40%,#200800,#0c0400);',
                    'dark-magma':        'background:radial-gradient(ellipse at 40% 40%,#281000,#0d0200);',
                    'light-azure':       'background:linear-gradient(135deg,#eff6ff,#bfdbfe);',
                    'light-cobalt-l':    'background:linear-gradient(135deg,#eff8ff,#bfdbfe);',
                    'light-navy-l':      'background:linear-gradient(135deg,#f0f4ff,#c7d2fe);',
                    'light-sage':        'background:linear-gradient(135deg,#f0fdf4,#bbf7d0);',
                    'light-mint-l':      'background:linear-gradient(135deg,#f0fdfb,#99f6e4);',
                    'light-lilac':       'background:linear-gradient(135deg,#faf5ff,#e9d5ff);',
                    'light-lavender-l':  'background:linear-gradient(135deg,#f5f3ff,#ddd6fe);',
                    'light-peach':       'background:linear-gradient(135deg,#fff7f0,#fed7aa);',
                    'light-apricot':     'background:linear-gradient(135deg,#fff5ef,#fdba74);',
                    'light-rose-l':      'background:linear-gradient(135deg,#fff1f2,#fda4af);',
                    'light-blush':       'background:linear-gradient(135deg,#fff0f5,#fda4af);',
                    'light-snow':        'background:#ffffff;',
                    'light-paper':       'background:#fafaf8;',
                    'light-chalk':       'background:#f8f8f8;',
                    'light-pearl':       'background:linear-gradient(135deg,#fefeff,#f5f3ff);',
                    'light-mist':        'background:linear-gradient(135deg,#f5f8ff,#dbeafe);',
                    'light-cloud':       'background:linear-gradient(135deg,#f8f9ff,#bfdbfe);',
                    'light-frosted':     'background:linear-gradient(135deg,#f8f8ff,#e0e7ff);',
                    'light-cotton':      'background:linear-gradient(135deg,#fdfeff,#f0f9ff);',
                    'light-zen':         'background:linear-gradient(135deg,#f8fafb,#e2e8f0);',
                    'light-teal-l':      'background:linear-gradient(135deg,#f0fdf9,#6ee7b7);',
                    'light-aqua-l':      'background:linear-gradient(135deg,#f0fefe,#a5f3fc);',
                    'light-turquoise':   'background:linear-gradient(135deg,#f0fdfd,#99f6e4);',
                    'light-seafoam':     'background:linear-gradient(135deg,#f0fefc,#6ee7b7);',
                    'light-lake':        'background:linear-gradient(135deg,#eff8ff,#7dd3fc);',
                    'light-pool':        'background:linear-gradient(135deg,#f0f9ff,#7dd3fc);',
                    'light-riviera':     'background:linear-gradient(135deg,#edf8ff,#7dd3fc);',
                    'light-glacier':     'background:linear-gradient(135deg,#f0f9fe,#bae6fd);',
                    'light-crystal':     'background:linear-gradient(135deg,#f0fbff,#67e8f9);',
                    'light-honey':       'background:linear-gradient(135deg,#fffaf0,#fde68a);',
                    'light-butter':      'background:linear-gradient(135deg,#fffef0,#fef08a);',
                    'light-sunshine':    'background:linear-gradient(135deg,#fffde8,#fde047);',
                    'light-dandelion':   'background:linear-gradient(135deg,#fffde0,#fde047);',
                    'light-rainbow':     'background:linear-gradient(135deg,#fdf0ff,#c4b5fd 50%,#bfdbfe);',
                    'light-aurora-l':    'background:linear-gradient(135deg,#f0feff,#a5f3fc 60%,#c4b5fd);',
                    'light-cotton-candy':'background:linear-gradient(135deg,#fff0fb,#f9a8d4);',
                    'light-sunrise':     'background:linear-gradient(135deg,#fff8f0,#fca5a5);',
                    'light-grid':        'background:#f8faff;',
                    'light-dots':        'background:#f8f9fc;',
                    'light-hex-l':       'background:#f9fafd;',
                    'light-champagne':   'background:linear-gradient(135deg,#fffbf0,#fde68a);',
                    'light-porcelain':   'background:linear-gradient(135deg,#fafbff,#e0e7ff);',
                    'light-jade':        'background:linear-gradient(135deg,#f0fdf8,#6ee7b7);',
                    'light-meadow':      'background:linear-gradient(135deg,#f3fef3,#86efac);',
                    'light-fern':        'background:linear-gradient(135deg,#f0fdf4,#86efac);',
                    'light-amethyst-l':  'background:linear-gradient(135deg,#f7f0ff,#e9d5ff);',
                    'light-wisteria':    'background:linear-gradient(135deg,#f8f0ff,#ddd6fe);',
                    'light-plum-l':      'background:linear-gradient(135deg,#faf0ff,#d8b4fe);',
                    'light-violet-l':    'background:linear-gradient(135deg,#fdf4ff,#e9d5ff);',
                    'light-blossom':     'background:linear-gradient(135deg,#fff0f5,#fda4af);',
                    'light-bloom':       'background:linear-gradient(135deg,#fff0f0,#fca5a5);',
                    'light-tangerine':   'background:linear-gradient(135deg,#fff4ee,#fb923c);',
                    'light-sandstone':   'background:linear-gradient(135deg,#fdf5e8,#fde68a);',
                };
                return map[bgId] || (bgId.startsWith('light-') ? 'background:#f0f4ff;' : 'background:#0a0e1a;');
            }

            buildBgOptions() {
                const container = DOM('bgOptions');
                if (!container) return;
                container.innerHTML = '';

                const isDark = this.settings.darkTheme;
                const list = isDark
                    ? SettingsManager.DARK_BACKGROUNDS
                    : SettingsManager.LIGHT_BACKGROUNDS;

                // If current customBg belongs to the wrong theme set, reset to 'none'
                const validIds = list.map(b => b.id);
                if (!validIds.includes(this.settings.customBg)) {
                    this.settings.customBg = 'none';
                    if (document.body.dataset.bg) delete document.body.dataset.bg;
                }

                const classicCount = isDark ? 8 : 9;
                const isExpanded = this._bgGroupExpanded === true;

                const visibleList = isExpanded ? list : list.slice(0, classicCount);

                visibleList.forEach(({ id, label }) => {
                    const btn = document.createElement('button');
                    btn.className = 'bg-btn';
                    btn.dataset.bg = id;
                    if (id === (this.settings.customBg || 'none')) btn.classList.add('active');
                    btn.innerHTML = `<span class="bg-btn-label">${label}</span>`;
                    btn.addEventListener('click', () => {
                        this.settings.customBg = id;
                        this.applyCustomization();
                        this.saveSettings();
                        container.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                    });
                    container.appendChild(btn);
                });

                // Show more / Show less button
                const remaining = list.length - classicCount;
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'bg-show-more-btn';
                toggleBtn.textContent = isExpanded
                    ? 'Show less ▲'
                    : `Show ${remaining} more ▼`;
                toggleBtn.addEventListener('click', () => {
                    this._bgGroupExpanded = !isExpanded;
                    this.buildBgOptions();
                });
                container.appendChild(toggleBtn);
            }

            applyCustomization() {
                const { accentColor, customFont, customBg } = this.settings;
                const hasCustom = accentColor || customFont !== 'default' || customBg !== 'none';

                if (hasCustom) {
                    document.body.classList.add('custom-active');
                } else {
                    document.body.classList.remove('custom-active');
                }

                // Accent + timer glow
                const accent = accentColor || '#4a9eff';
                document.documentElement.style.setProperty('--custom-accent', accent);

                // Compute timer-glow from accent hex → rgba(r,g,b, 0.3)
                const glow = this._hexToRgba(accent, 0.3);
                document.documentElement.style.setProperty('--timer-glow', glow);

                // Font
                document.body.dataset.font = customFont || 'default';

                // Background
                const bg = customBg || 'none';
                if (bg === 'none') {
                    delete document.body.dataset.bg;
                } else {
                    document.body.dataset.bg = bg;
                }

                // Sync UI controls
                this._syncCustomUI();
            }

            // Convert #rrggbb / #rgb to rgba(r,g,b,a)
            _hexToRgba(hex, alpha) {
                const h = hex.replace('#', '');
                let r, g, b;
                if (h.length === 3) {
                    r = parseInt(h[0]+h[0], 16);
                    g = parseInt(h[1]+h[1], 16);
                    b = parseInt(h[2]+h[2], 16);
                } else {
                    r = parseInt(h.slice(0,2), 16);
                    g = parseInt(h.slice(2,4), 16);
                    b = parseInt(h.slice(4,6), 16);
                }
                return `rgba(${r},${g},${b},${alpha})`;
            }

            _syncCustomUI() {
                // Accent swatches
                const accent = this.settings.accentColor || '#4a9eff';
                document.querySelectorAll('.accent-swatch').forEach(s => {
                    s.classList.toggle('selected', s.dataset.color === accent);
                });
                // Font buttons
                document.querySelectorAll('.font-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.font === (this.settings.customFont || 'default'));
                });
                // Bg buttons — only inside #bgOptions (dynamic container)
                const bgContainer = DOM('bgOptions');
                if (bgContainer) {
                    bgContainer.querySelectorAll('.bg-btn').forEach(b => {
                        b.classList.toggle('active', b.dataset.bg === (this.settings.customBg || 'none'));
                    });
                }
            }

            _syncTimeFormatUI() {
                const fmt = this.settings.timeFormat || 'seconds';
                document.querySelectorAll('[data-fmt]').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.fmt === fmt);
                });
                const preview = document.getElementById('timeFormatPreview');
                if (preview) preview.textContent = fmt === 'minutes' ? '1:05.89' : '65.89';

                // Sync clock format buttons
                const clockFmt = this.settings.clockFormat || '24';
                document.querySelectorAll('[data-clockfmt]').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.clockfmt === clockFmt);
                });

                // Sync hideUi toggle switch
                const hideUiToggle = DOM('hideUiToggle');
                if (hideUiToggle) hideUiToggle.classList.toggle('active', !!this.settings.hideUiDuringSolve);

                // Sync mouseStart toggle switch
                const mouseStartToggle = DOM('mouseStartToggle');
                if (mouseStartToggle) mouseStartToggle.classList.toggle('active', !!this.settings.mouseStart);
            }

            resetCustomization() {
                this.settings.accentColor = null;
                this.settings.customFont = 'default';
                this.settings.customBg = 'none';
                // Restore default timer glow
                document.documentElement.style.setProperty('--timer-glow', 'rgba(74, 158, 255, 0.3)');
                this.applyCustomization();
                this.saveSettings();
            }

            updateDisplayOptions() {
                // Show/hide Ao5
                const ao5Elements = document.querySelectorAll('.averages .average-item:nth-child(1), .stat-item:nth-child(1), .best-times .best-item:nth-child(2)');
                ao5Elements.forEach(el => {
                    if (this.settings.showAo5) {
                        el.classList.remove('hidden');
                    } else {
                        el.classList.add('hidden');
                    }
                });

                // Show/hide Ao12
                const ao12Elements = document.querySelectorAll('.averages .average-item:nth-child(2), .stat-item:nth-child(2), .best-times .best-item:nth-child(3)');
                ao12Elements.forEach(el => {
                    if (this.settings.showAo12) {
                        el.classList.remove('hidden');
                    } else {
                        el.classList.add('hidden');
                    }
                });

                // Show/hide Session Avg
                const sessionAvgElements = document.querySelectorAll('.stat-item:nth-child(3)');
                sessionAvgElements.forEach(el => {
                    if (this.settings.showSessionAvg) {
                        el.classList.remove('hidden');
                    } else {
                        el.classList.add('hidden');
                    }
                });

                // Note: Ao100 only affects main interface, not Statistics window
                // Show/hide Ao100
                const ao100AvgItem = document.getElementById('avgAo100Item');
                const ao100BestItem = document.getElementById('bestAo100Item');
                if (ao100AvgItem) ao100AvgItem.classList.toggle('hidden', !this.settings.showAo100);
                if (ao100BestItem) ao100BestItem.classList.toggle('hidden', !this.settings.showAo100);
            }

            _customPhrasesCopy() {
                const ru = this.settings.language === 'ru';
                return ru ? {
                    openTitle: 'Добавить свои фразы',
                    openDesc: 'Личные реплики для каждого режима и события',
                    title: 'Свои фразы комментатора',
                    subtitle: 'Они добавляются к встроенным фразам — стандартные реплики не пропадут.',
                    mood: 'Режим бота', category: 'Категория события', phrase: 'Фраза',
                    placeholder: 'Напишите, что должен сказать бот…', add: 'Добавить фразу',
                    listTitle: 'Добавленные фразы', listHint: 'Показаны фразы только для выбранного режима и категории.',
                    empty: 'Здесь пока нет своих фраз.', remove: 'Удалить',
                    added: 'Фраза добавлена', removed: 'Фраза удалена', duplicate: 'Такая фраза уже есть',
                    invalid: 'Введите фразу', limit: 'Достигнут лимит пользовательских фраз',
                    synced: 'Сохранено и отправлено в синхронизацию', local: 'Сохранено на этом устройстве',
                    back: 'Вернуться к настройкам'
                } : {
                    openTitle: 'Add your own phrases',
                    openDesc: 'Personal replies for every bot mood and event',
                    title: 'Your commentary phrases',
                    subtitle: 'They are added to the built-in collection — default phrases remain available.',
                    mood: 'Bot mood', category: 'Event category', phrase: 'Phrase',
                    placeholder: 'Type what the bot should say…', add: 'Add phrase',
                    listTitle: 'Added phrases', listHint: 'Only phrases for the selected mood and category are shown.',
                    empty: 'No custom phrases here yet.', remove: 'Delete',
                    added: 'Phrase added', removed: 'Phrase deleted', duplicate: 'This phrase already exists',
                    invalid: 'Enter a phrase', limit: 'The custom phrase limit has been reached',
                    synced: 'Saved and sent to sync', local: 'Saved on this device',
                    back: 'Back to settings'
                };
            }

            _customPhraseCategories() {
                const ru = this.settings.language === 'ru';
                const labels = ru ? {
                    neutral: 'Обычный результат', fast_time: 'Быстрое время', slow_time: 'Медленное время',
                    pb_single: 'Новый личный рекорд', pb_average: 'Новый рекорд среднего',
                    worse_average: 'Среднее ухудшилось', dnf: 'DNF', plus_two: 'Штраф +2',
                    delete: 'Удаление результата', target_success: 'Цель достигнута', target_fail: 'Цель не достигнута'
                } : {
                    neutral: 'Regular result', fast_time: 'Fast time', slow_time: 'Slow time',
                    pb_single: 'New personal best', pb_average: 'New average PB',
                    worse_average: 'Average got worse', dnf: 'DNF', plus_two: '+2 penalty',
                    delete: 'Solve deleted', target_success: 'Target reached', target_fail: 'Target missed'
                };
                return Object.entries(labels);
            }

            _applyCustomPhrasesCopy() {
                const copy = this._customPhrasesCopy();
                const set = (id, value) => { const el = DOM(id); if (el) el.textContent = value; };
                set('customPhrasesOpenTitle', copy.openTitle);
                set('customPhrasesOpenDesc', copy.openDesc);
                set('customPhrasesTitle', copy.title);
                set('customPhrasesSubtitle', copy.subtitle);
                set('customPhrasesMoodLabel', copy.mood);
                set('customPhrasesCategoryLabel', copy.category);
                set('customPhrasesTextLabel', copy.phrase);
                set('addCustomPhrase', copy.add);
                set('customPhrasesListTitle', copy.listTitle);
                set('customPhrasesListHint', copy.listHint);
                const input = DOM('customPhrasesInput');
                if (input) input.placeholder = copy.placeholder;
                const closeButton = DOM('closeCustomPhrases');
                if (closeButton) closeButton.setAttribute('aria-label', copy.back);

                const moodLabels = translations[this.settings.language] || translations.en;
                const moodNames = {
                    friend: `😊 ${moodLabels.moodFriend}`,
                    teaser: `😏 ${moodLabels.moodTeaser}`,
                    trainer: `🧠 ${moodLabels.moodTrainer}`,
                    enemy: `😈 ${moodLabels.moodEnemy}`,
                    rival: `♟️ ${moodLabels.moodRival}`
                };
                const moodSelect = DOM('customPhrasesMood');
                if (moodSelect) {
                    [...moodSelect.options].forEach(option => {
                        if (moodNames[option.value]) option.textContent = moodNames[option.value];
                    });
                }

                const categorySelect = DOM('customPhrasesCategory');
                if (categorySelect) {
                    const selected = categorySelect.value || 'neutral';
                    categorySelect.replaceChildren(...this._customPhraseCategories().map(([value, label]) => {
                        const option = document.createElement('option');
                        option.value = value;
                        option.textContent = label;
                        return option;
                    }));
                    categorySelect.value = this._customPhraseCategories().some(([value]) => value === selected) ? selected : 'neutral';
                }
            }

            _renderCustomPhrases() {
                if (!window.commentary) return;
                const mood = DOM('customPhrasesMood')?.value || 'friend';
                const category = DOM('customPhrasesCategory')?.value || 'neutral';
                const phrases = window.commentary.customPhrases?.[mood]?.[category] || [];
                const list = DOM('customPhrasesList');
                const copy = this._customPhrasesCopy();
                if (!list) return;
                list.replaceChildren();
                DOM('customPhrasesCount').textContent = String(phrases.length);

                if (!phrases.length) {
                    const empty = document.createElement('div');
                    empty.className = 'custom-phrases-empty';
                    empty.textContent = copy.empty;
                    list.appendChild(empty);
                    return;
                }

                phrases.forEach((phrase, index) => {
                    const row = document.createElement('div');
                    row.className = 'custom-phrase-row';
                    const text = document.createElement('p');
                    text.textContent = phrase;
                    const remove = document.createElement('button');
                    remove.type = 'button';
                    remove.className = 'custom-phrase-remove';
                    remove.textContent = copy.remove;
                    remove.dataset.index = String(index);
                    row.append(text, remove);
                    list.appendChild(row);
                });
            }

            _setCustomPhrasesMessage(message, isError = false) {
                const el = DOM('customPhrasesMessage');
                if (!el) return;
                el.textContent = message;
                el.classList.toggle('error', isError);
            }

            initCustomPhrasesUI() {
                const layer = DOM('customPhrasesLayer');
                if (!layer || layer.dataset.initialized) return;
                layer.dataset.initialized = 'true';
                this._applyCustomPhrasesCopy();

                const open = () => {
                    this._applyCustomPhrasesCopy();
                    DOM('customPhrasesMood').value = this.settings.timerMood || 'friend';
                    this._setCustomPhrasesMessage('');
                    this._renderCustomPhrases();
                    layer.classList.add('visible');
                    layer.setAttribute('aria-hidden', 'false');
                    setTimeout(() => DOM('customPhrasesInput')?.focus(), 180);
                };
                const close = () => {
                    layer.classList.remove('visible');
                    layer.setAttribute('aria-hidden', 'true');
                    DOM('customPhrasesInput').value = '';
                    this._setCustomPhrasesMessage('');
                };

                DOM('openCustomPhrases').addEventListener('click', open);
                DOM('closeCustomPhrases').addEventListener('click', close);
                DOM('customPhrasesMood').addEventListener('change', () => this._renderCustomPhrases());
                DOM('customPhrasesCategory').addEventListener('change', () => this._renderCustomPhrases());

                const addPhrase = async () => {
                    const copy = this._customPhrasesCopy();
                    const result = window.commentary?.addCustomPhrase(
                        DOM('customPhrasesMood').value,
                        DOM('customPhrasesCategory').value,
                        DOM('customPhrasesInput').value
                    );
                    if (!result?.ok) {
                        this._setCustomPhrasesMessage(copy[result?.reason] || copy.invalid, true);
                        return;
                    }
                    DOM('customPhrasesInput').value = '';
                    this._renderCustomPhrases();
                    const synced = await window.AppSync?.pushCustomPhrasesNow?.();
                    this._setCustomPhrasesMessage(`${copy.added}. ${synced ? copy.synced : copy.local}`);
                };

                DOM('addCustomPhrase').addEventListener('click', addPhrase);
                DOM('customPhrasesInput').addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        addPhrase();
                    }
                });

                DOM('customPhrasesList').addEventListener('click', async (e) => {
                    const button = e.target.closest('.custom-phrase-remove');
                    if (!button) return;
                    const copy = this._customPhrasesCopy();
                    const result = window.commentary?.removeCustomPhrase(
                        DOM('customPhrasesMood').value,
                        DOM('customPhrasesCategory').value,
                        Number(button.dataset.index)
                    );
                    if (!result?.ok) return;
                    this._renderCustomPhrases();
                    const synced = await window.AppSync?.pushCustomPhrasesNow?.();
                    this._setCustomPhrasesMessage(`${copy.removed}. ${synced ? copy.synced : copy.local}`);
                });

                window.addEventListener('customphraseschange', () => this._renderCustomPhrases());
                this._closeCustomPhrases = close;
            }

            initEventListeners() {
                this.initCustomPhrasesUI();
                // Open/Close Settings
                document.getElementById('settingsBtn').addEventListener('click', () => {
                    DOM('settingsOverlay').classList.add('visible');
                    // Build palette and bg options, sync all toggle states
                    setTimeout(() => {
                        this.buildAccentPalette();
                        this.buildBgOptions();
                        this._syncTimeFormatUI();
                        // Re-sync inspection mode group visibility
                        const inspectionModeGroup = DOM('inspectionModeGroup');
                        if (inspectionModeGroup) {
                            inspectionModeGroup.style.display = this.settings.inspection ? 'block' : 'none';
                        }
                    }, 30);
                });

                document.getElementById('closeSettings').addEventListener('click', () => {
                    this._closeCustomPhrases?.();
                    DOM('settingsOverlay').classList.remove('visible');
                });

                DOM('settingsOverlay').addEventListener('click', (e) => {
                    if (e.target.id === 'settingsOverlay') {
                        DOM('settingsOverlay').classList.remove('visible');
                    }
                });

                // Close Statistics (open is handled after timer init)
                document.getElementById('closeStatistics').addEventListener('click', () => {
                    DOM('statisticsOverlay').classList.remove('visible');
                });

                DOM('statisticsOverlay').addEventListener('click', (e) => {
                    if (e.target.id === 'statisticsOverlay') {
                        DOM('statisticsOverlay').classList.remove('visible');
                    }
                });

                // Close Sessions (open is handled after timer init)
                document.getElementById('closeSessions').addEventListener('click', () => {
                    DOM('sessionsOverlay').classList.remove('visible');
                });

                DOM('sessionsOverlay').addEventListener('click', (e) => {
                    if (e.target.id === 'sessionsOverlay') {
                        DOM('sessionsOverlay').classList.remove('visible');
                    }
                });

                // ESC key to close
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        if (DOM('shopConfirmOverlay')?.classList.contains('visible')) {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            window.progression?.cancelPurchaseConfirmation?.();
                            return;
                        }
                        if (DOM('customPhrasesLayer')?.classList.contains('visible')) {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            this._closeCustomPhrases?.();
                            return;
                        }
                        DOM('settingsOverlay').classList.remove('visible');
                        DOM('statisticsOverlay').classList.remove('visible');
                        DOM('sessionsOverlay').classList.remove('visible');
                        DOM('shopOverlay')?.classList.remove('visible');
                        DOM('progressionOverlay')?.classList.remove('visible');
                    }
                });

                // NEW: Settings Sidebar Navigation
                document.querySelectorAll('.settings-nav-item').forEach(navItem => {
                    navItem.addEventListener('click', () => {
                        // Remove active from all nav items
                        document.querySelectorAll('.settings-nav-item').forEach(item => item.classList.remove('active'));
                        // Add active to clicked item
                        navItem.classList.add('active');
                        
                        // Hide all sections
                        document.querySelectorAll('.settings-section-content').forEach(section => section.classList.remove('active'));
                        // Show selected section
                        const sectionId = 'section-' + navItem.dataset.section;
                        document.getElementById(sectionId).classList.add('active');
                    });
                });

                // Hold Delay Slider
                const holdDelaySlider = DOM('holdDelaySlider');
                if (holdDelaySlider) {
                    holdDelaySlider.addEventListener('input', (e) => {
                        const value = parseInt(e.target.value);
                        this.settings.holdDelay = value;
                        DOM('holdDelayValue').textContent = `Hold delay: ${value} ms`;
                        this.saveSettings();
                    });
                }

                // NEW: Theme Buttons (Light/Dark)
                document.querySelectorAll('.theme-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const theme = btn.dataset.theme;
                        this.settings.darkTheme = (theme === 'dark');
                        
                        // Update UI
                        document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');

                        // ⚠️ Base theme change → reset all customization (priority rule)
                        this.settings.accentColor = null;
                        this.settings.customFont = 'default';
                        this.settings.customBg = 'none';
                        
                        this.applySettings();
                        this.saveSettings();

                        // Rebuild bg options for new theme (always different set)
                        setTimeout(() => this.buildBgOptions(), 30);
                    });
                });

                // Advanced Customization: build palette on first open of Theme section
                document.querySelectorAll('.settings-nav-item').forEach(navItem => {
                    navItem.addEventListener('click', () => {
                        if (navItem.dataset.section === 'theme') {
                            setTimeout(() => { this.buildAccentPalette(); this.buildBgOptions(); }, 30);
                        }
                        // Always sync inspection mode group on any section switch
                        const inspectionModeGroup = DOM('inspectionModeGroup');
                        if (inspectionModeGroup) {
                            inspectionModeGroup.style.display = this.settings.inspection ? 'block' : 'none';
                        }
                    });
                });
                // Also build immediately if theme section is already active on load
                if (document.getElementById('section-theme')?.classList.contains('active')) {
                    this.buildAccentPalette();
                    this.buildBgOptions();
                }

                // Font buttons
                document.querySelectorAll('.font-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this.settings.customFont = btn.dataset.font;
                        this.applyCustomization();
                        this.saveSettings();
                    });
                });

                // Background buttons
                document.querySelectorAll('.bg-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this.settings.customBg = btn.dataset.bg;
                        this.applyCustomization();
                        this.saveSettings();
                    });
                });

                // Reset customization button
                // ── Theme Generator ──
                this._initThemeGenerator();

                const resetCustomBtn = document.getElementById('resetCustomBtn');
                if (resetCustomBtn) {
                    resetCustomBtn.addEventListener('click', () => {
                        this.resetCustomization();
                    });
                }

                // NEW: Color Picker (Running Timer Color)
                document.querySelectorAll('.color-option-new').forEach(option => {
                    option.addEventListener('click', () => {
                        document.querySelectorAll('.color-option-new').forEach(opt => opt.classList.remove('selected'));
                        option.classList.add('selected');
                        this.settings.timerColor = option.dataset.color;
                        this.saveSettings();
                    });
                });

                // Sounds Toggle
                const soundsToggle = DOM('soundsToggle');
                if (soundsToggle) {
                    soundsToggle.addEventListener('click', () => {
                        this.settings.sounds = !this.settings.sounds;
                        this.applySettings();
                        this.saveSettings();
                    });
                }

                // Inspection Toggle
                const inspectionToggle = DOM('inspectionToggle');
                if (inspectionToggle) {
                    inspectionToggle.addEventListener('click', () => {
                        this.settings.inspection = !this.settings.inspection;
                        this.applySettings();
                        this.saveSettings();
                    });
                }

                // Voice Inspection Warnings Toggle
                const voiceInspectionToggle = DOM('voiceInspectionToggle');
                if (voiceInspectionToggle) {
                    voiceInspectionToggle.classList.toggle('active', !!this.settings.voiceInspectionEnabled);
                    voiceInspectionToggle.addEventListener('click', () => {
                        this.settings.voiceInspectionEnabled = !this.settings.voiceInspectionEnabled;
                        voiceInspectionToggle.classList.toggle('active', this.settings.voiceInspectionEnabled);
                        this.saveSettings();

                        if (this.settings.voiceInspectionEnabled) {
                            if (!('speechSynthesis' in window)) {
                                const t = translations[this.settings.language] || translations.en;
                                alert(t.voiceInspectionUnsupported || "This browser doesn't support voice synthesis, so Voice Warnings won't be audible here.");
                            } else {
                                // Say a quick test phrase right away, so the person doesn't
                                // have to wait for a real inspection to find out it's silent.
                                this.speakInspectionWarning(8);
                            }
                        }
                    });
                }

                // Inspection Mode Segmented Control
                document.querySelectorAll('.segmented-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        // Time format buttons (data-fmt)
                        if (btn.dataset.fmt) {
                            this.settings.timeFormat = btn.dataset.fmt;
                            this._syncTimeFormatUI();
                            this.saveSettings();
                            // Refresh any currently visible timer display
                            if (window.timer) window.timer.updateUI();
                            return;
                        }
                        // Inspection mode buttons (data-imode)
                        const mode = btn.dataset.imode;
                        if (mode) {
                            this.settings.inspectionMode = mode;
                            document.querySelectorAll('.segmented-btn[data-imode]').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            this.saveSettings();
                            return;
                        }
                    });
                });

                // NEW: Display Options Checkboxes
                const showAo5Checkbox = DOM('showAo5Checkbox');
                const showAo12Checkbox = DOM('showAo12Checkbox');
                const showAo100Checkbox = DOM('showAo100Checkbox');
                
                if (showAo5Checkbox) {
                    showAo5Checkbox.addEventListener('change', (e) => {
                        this.settings.showAo5 = e.target.checked;
                        this.applySettings();
                        this.saveSettings();
                    });
                }
                
                if (showAo12Checkbox) {
                    showAo12Checkbox.addEventListener('change', (e) => {
                        this.settings.showAo12 = e.target.checked;
                        this.applySettings();
                        this.saveSettings();
                    });
                }
                
                if (showAo100Checkbox) {
                    showAo100Checkbox.addEventListener('change', (e) => {
                        this.settings.showAo100 = e.target.checked;
                        this.applySettings();
                        this.saveSettings();
                    });
                }

                // NEW: Mood Cards
                document.querySelectorAll('.mood-card:not(.disabled)').forEach(card => {
                    card.addEventListener('click', () => {
                        const mood = card.dataset.mood;
                        this.settings.timerMood = mood;
                        
                        // Update UI
                        document.querySelectorAll('.mood-card').forEach(c => c.classList.remove('active'));
                        card.classList.add('active');
                        
                        // Update commentary system
                        if (window.commentary) {
                            window.commentary.setMood(mood);
                        }
                        
                        this.saveSettings();
                    });
                });

                // Commentary Language — independent from the UI language
                document.querySelectorAll('[data-clang]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this.settings.commentaryLanguage = btn.dataset.clang;
                        document.querySelectorAll('[data-clang]').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        this.saveSettings();
                    });
                });

                // Language Selector (New Settings)
                document.querySelectorAll('.lang-btn-new').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const lang = btn.dataset.lang;
                        this.settings.language = lang;
                        
                        // Update UI
                        document.querySelectorAll('.lang-btn-new').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        
                        // Apply translations
                        this.applyTranslations();
                        this._applyCustomPhrasesCopy();
                        
                        this.saveSettings();
                    });
                });

                // Language Selector (Old - for compatibility)
                document.querySelectorAll('.lang-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const lang = btn.dataset.lang;
                        this.settings.language = lang;
                        
                        // Update UI
                        document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        
                        // Apply translations
                        this.applyTranslations();
                        this._applyCustomPhrasesCopy();
                        
                        this.saveSettings();
                    });
                });

                // Export CSV
                document.getElementById('exportCsvBtn').addEventListener('click', () => {
                    if (window.timer) {
                        window.timer.exportCSV();
                    }
                });

                // Export JSON
                const exportJsonBtn = document.getElementById('exportJsonBtn');
                if (exportJsonBtn) {
                    exportJsonBtn.addEventListener('click', () => {
                        if (window.timer) {
                            window.timer.exportJSON();
                        }
                    });
                }

                // Import / Export
                const importExportDataBtn = document.getElementById('importExportDataBtn');
                if (importExportDataBtn) {
                    importExportDataBtn.addEventListener('click', () => {
                        if (window.timer) window.timer.openImportExportModal();
                    });
                }

                // Reset Data
                document.getElementById('resetDataBtn').addEventListener('click', () => {
                    if (confirm('Are you sure? This will delete all solves in the current session.')) {
                        if (window.timer) {
                            window.timer.resetSession();
                        }
                    }
                });

                // ── Analytics Section ──
                const updateOffsetPreview = () => {
                    const offset = this.settings.timeOffset || 0;
                    const fmt = this.settings.clockFormat || '24';
                    const now = new Date(Date.now() + offset * 3600000);
                    const h = now.getHours();
                    const m = String(now.getMinutes()).padStart(2, '0');
                    let display;
                    if (fmt === '12') {
                        const h12 = h % 12 || 12;
                        const ampm = h < 12 ? 'AM' : 'PM';
                        display = `${h12}:${m} ${ampm}`;
                    } else {
                        display = `${String(h).padStart(2, '0')}:${m}`;
                    }
                    const el = document.getElementById('analyticsTimePreview');
                    if (el) el.textContent = `Current: ${display}`;
                    const valEl = document.getElementById('analyticsOffsetValue');
                    if (valEl) valEl.textContent = offset >= 0 ? `+${offset}` : `${offset}`;
                };

                // Clock format buttons
                document.querySelectorAll('[data-clockfmt]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        document.querySelectorAll('[data-clockfmt]').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        this.settings.clockFormat = btn.dataset.clockfmt;
                        this.saveSettings();
                        updateOffsetPreview();
                    });
                });

                // Offset buttons
                const offsetMinus = document.getElementById('offsetMinus');
                const offsetPlus  = document.getElementById('offsetPlus');
                if (offsetMinus) offsetMinus.addEventListener('click', () => {
                    this.settings.timeOffset = Math.max(-12, (this.settings.timeOffset || 0) - 1);
                    this.saveSettings();
                    updateOffsetPreview();
                });
                if (offsetPlus) offsetPlus.addEventListener('click', () => {
                    this.settings.timeOffset = Math.min(14, (this.settings.timeOffset || 0) + 1);
                    this.saveSettings();
                    updateOffsetPreview();
                });

                // Init preview on page load
                updateOffsetPreview();
                setInterval(updateOffsetPreview, 30000); // update every 30s

                // ── Hide UI During Solve ──
                const hideUiToggle = DOM('hideUiToggle');
                if (hideUiToggle) {
                    hideUiToggle.addEventListener('click', () => {
                        this.settings.hideUiDuringSolve = !this.settings.hideUiDuringSolve;
                        hideUiToggle.classList.toggle('active', this.settings.hideUiDuringSolve);
                        this.saveSettings();
                        // Notify timer of change
                        if (window.timer) window.timer._applyMouseStartMode();
                    });
                }

                // ── Mouse Start ──
                const mouseStartToggle = DOM('mouseStartToggle');
                if (mouseStartToggle) {
                    mouseStartToggle.addEventListener('click', () => {
                        this.settings.mouseStart = !this.settings.mouseStart;
                        mouseStartToggle.classList.toggle('active', this.settings.mouseStart);
                        this.saveSettings();
                        if (window.timer) window.timer._applyMouseStartMode();
                    });
                }

                // ── Auto-Export ──
                this._initAutoExportUI();
            }

            // Sets up the Auto-Export settings block: toggle, interval, format, and
            // (desktop only — File System Access API has no mobile support at all)
            // the "choose a folder" flow.
            _initAutoExportUI() {
                const toggle = document.getElementById('autoExportToggle');
                const options = document.getElementById('autoExportOptions');
                const everyInput = document.getElementById('autoExportEveryInput');
                const formatSelect = document.getElementById('autoExportFormatSelect');
                const folderRow = document.getElementById('autoExportFolderRow');
                const chooseFolderBtn = document.getElementById('autoExportChooseFolderBtn');
                const folderStatus = document.getElementById('autoExportFolderStatus');
                if (!toggle) return;

                const supportsFolderPicker = typeof window.showDirectoryPicker === 'function';
                if (folderRow) folderRow.style.display = supportsFolderPicker ? 'block' : 'none';

                // Restore current state into the UI
                toggle.classList.toggle('active', !!this.settings.autoExportEnabled);
                if (options) options.style.display = this.settings.autoExportEnabled ? 'block' : 'none';
                if (everyInput) everyInput.value = this.settings.autoExportEvery || 10;
                if (formatSelect) formatSelect.value = this.settings.autoExportFormat || 'firecube';

                if (supportsFolderPicker && folderStatus && window.timer) {
                    window.timer._getAutoExportDirHandle().then(handle => {
                        const t = window.timer._ieT ? window.timer._ieT() : {};
                        if (handle) {
                            folderStatus.textContent = (t.autoExportFolderSet || 'Saving to: {folder}').replace('{folder}', handle.name);
                            folderStatus.classList.add('is-set');
                            if (chooseFolderBtn) chooseFolderBtn.textContent = '📁 ' + (t.autoExportReverifyBtn || 'Re-verify Access');
                        } else {
                            folderStatus.textContent = t.autoExportFolderUnset || 'No folder selected — files will go to Downloads';
                            folderStatus.classList.remove('is-set');
                            if (chooseFolderBtn) chooseFolderBtn.textContent = '📁 ' + (t.autoExportChooseBtn || 'Choose Folder');
                        }
                    });
                }

                toggle.addEventListener('click', () => {
                    this.settings.autoExportEnabled = !this.settings.autoExportEnabled;
                    toggle.classList.toggle('active', this.settings.autoExportEnabled);
                    if (options) options.style.display = this.settings.autoExportEnabled ? 'block' : 'none';
                    this.saveSettings();
                });

                if (everyInput) {
                    everyInput.addEventListener('change', () => {
                        const n = parseInt(everyInput.value, 10);
                        this.settings.autoExportEvery = (n && n > 0) ? n : 10;
                        everyInput.value = this.settings.autoExportEvery;
                        this.saveSettings();
                    });
                }

                if (formatSelect) {
                    formatSelect.addEventListener('change', () => {
                        this.settings.autoExportFormat = formatSelect.value;
                        this.saveSettings();
                    });
                }

                if (chooseFolderBtn && supportsFolderPicker) {
                    chooseFolderBtn.addEventListener('click', async () => {
                        try {
                            // If a folder was already picked, try re-confirming write
                            // access on the SAME handle first. Chrome often resets the
                            // write-permission grant back to "ask" between browser
                            // sessions (even though the folder itself is remembered),
                            // which is why auto-export can silently fall back to the
                            // browser's normal "where do you want to save" prompt.
                            // requestPermission() here runs inside a real click, so it's
                            // allowed to actually show the (much smaller) one-time
                            // access prompt instead of us needing to pick the folder
                            // again from scratch.
                            const existing = window.timer ? await window.timer._getAutoExportDirHandle() : null;
                            let handle = existing;

                            if (existing) {
                                const perm = await existing.requestPermission({ mode: 'readwrite' });
                                if (perm !== 'granted') handle = null; // denied — fall through to picking a new folder
                            }

                            if (!handle) {
                                handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                                if (window.timer) await window.timer._saveAutoExportDirHandle(handle);
                            }

                            this.settings.autoExportUseFolder = true;
                            this.saveSettings();
                            if (folderStatus) {
                                const t = window.timer?._ieT ? window.timer._ieT() : {};
                                folderStatus.textContent = (t.autoExportFolderSet || 'Saving to: {folder}').replace('{folder}', handle.name);
                                folderStatus.classList.add('is-set');
                                chooseFolderBtn.textContent = '📁 ' + (t.autoExportReverifyBtn || 'Re-verify Access');
                            }
                        } catch (e) {
                            // User cancelled the picker/permission prompt — nothing to do.
                        }
                    });
                }
            }

            // Reuses a single AudioContext for all beeps instead of creating a new one
            // per sound. Repeatedly spinning up fresh AudioContexts (as this used to
            // do) is a well-known cause of glitchy/dropped audio, especially on
            // mobile — some browsers throttle or silently drop sounds when contexts
            // pile up faster than they're garbage-collected.
            _getAudioContext() {
                if (!this._audioCtx || this._audioCtx.state === 'closed') {
                    this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                if (this._audioCtx.state === 'suspended') {
                    this._audioCtx.resume();
                }
                return this._audioCtx;
            }

            playSound(type) {
                if (!this.settings.sounds) return;
                
                // Create simple beep sounds using Web Audio API
                const audioContext = this._getAudioContext();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                if (type === 'start') {
                    oscillator.frequency.value = 800;
                    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
                } else if (type === 'stop') {
                    oscillator.frequency.value = 1000;
                    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
                }
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.2);
            }

            // Target Time beeps: 'short' = the accelerating warning tick, 'long' = the
            // sustained tone that fires once the goal is missed.
            playTargetBeep(type) {
                if (!this.settings.sounds) return;

                const audioContext = this._getAudioContext();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                if (type === 'long') {
                    oscillator.frequency.value = 480;
                    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + 0.55);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.75);
                    oscillator.start(audioContext.currentTime);
                    oscillator.stop(audioContext.currentTime + 0.8);
                } else {
                    oscillator.frequency.value = 1250;
                    gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.07);
                    oscillator.start(audioContext.currentTime);
                    oscillator.stop(audioContext.currentTime + 0.08);
                }
            }

            // Speaks "8 seconds" / "12 seconds" during inspection, matching how a real
            // WCA judge calls out elapsed time. Respects both the master Sound Effects
            // toggle and its own dedicated Voice Warnings toggle.
            speakInspectionWarning(secondsElapsed) {
                if (!this.settings.sounds || !this.settings.voiceInspectionEnabled) return;
                if (!('speechSynthesis' in window)) return;

                const lang = this.settings.language || 'en';
                const isRuLang = lang === 'ru';
                const text = isRuLang ? `${secondsElapsed} секунд` : `${secondsElapsed} seconds`;

                const speakNow = () => {
                    try {
                        const utterance = new SpeechSynthesisUtterance(text);
                        utterance.lang = isRuLang ? 'ru-RU' : 'en-US';
                        utterance.rate = 1.05;
                        utterance.volume = 1;
                        window.speechSynthesis.speak(utterance);
                    } catch (e) {
                        // Some browser/WebView engines expose `speechSynthesis` without
                        // fully supporting it — fail silently rather than throw.
                    }
                };

                // Some engines (Android WebViews in particular) haven't loaded any
                // voices yet on first use — getVoices() returns [] and speak() then
                // does nothing audible. If that's the case, wait once for the
                // 'voiceschanged' event (with a short timeout fallback so a solve
                // never hangs waiting on it) before actually speaking.
                const trySpeak = () => {
                    if (window.speechSynthesis.getVoices().length > 0 || this._voicesReady) {
                        speakNow();
                        return;
                    }
                    let done = false;
                    const onVoicesChanged = () => {
                        if (done) return;
                        done = true;
                        this._voicesReady = true;
                        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
                        speakNow();
                    };
                    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
                    // Fallback: some engines never fire voiceschanged at all but can
                    // still speak fine with zero voices reported — try anyway after
                    // a short wait rather than staying silent forever.
                    setTimeout(() => {
                        if (done) return;
                        done = true;
                        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
                        speakNow();
                    }, 250);
                };

                // Only cancel if something is actually pending — calling cancel()
                // immediately before speak() in the same tick is a known source of
                // the new utterance getting silently dropped in some engines. A tiny
                // delay after cancelling gives the engine time to actually clear
                // before we queue the next one.
                if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
                    window.speechSynthesis.cancel();
                    setTimeout(trySpeak, 50);
                } else {
                    trySpeak();
                }
            }
        }

        // Timer Logic
        class CubeTimer {
            constructor() {
                this.time = 0;
                this.isRunning = false;
                this.isHolding = false;
                this.holdStartTime = 0;
                this.holdTimeout = null;
                this.isReady = false;
                this.startTime = 0;
                this.animationFrame = null;
                
                // Inspection state
                this.isInspecting = false;
                this.inspectionTime = 15;
                this.inspectionInterval = null;
                this.tapStartTime = 0;
                
                // Sessions management
                this.sessions = this.loadSessions();
                this.currentSessionId = this.loadCurrentSessionId();
                
                // Track previous bests for comparison
                // Initialize from existing solves so first new solve doesn't always trigger "New Best"
                this.previousBest = this.getBestTime();
                this.previousBestAo5 = this.getBestAverage(5);
                this.previousBestAo12 = this.getBestAverage(12);
                this.previousBestAo100 = this.getBestAverage(100);
                this.previousAverageAo5 = null;
                
                this.timerDisplay = document.getElementById('timerDisplay');
                this.timerContainer = this.timerDisplay?.closest('.timer-container');
                this.solvesList = document.getElementById('solvesList');
                this.titleStrip = document.getElementById('titleStrip');
                this.recordTitle = document.getElementById('recordTitle');
                this.activeDailyChallenge = null;
                this.activeDailyChallengeConsumed = false;
                this._dailyChallengeCache = null;
                
                this._scrambleRequestId = 0;
                this.initEventListeners();
                this.generateScramble();
                this.updateUI();
                this.drawChart();
                this.updateSessionDropdown();
                this._applyMouseStartMode(); // Apply mouse/keyboard mode on load
                this._updateTargetTimeBtn();
                this._updateHonestModeBtn();
                if (this.sessions[this.currentSessionId]?.honestMode) {
                    this._startHonestModeTicker();
                }
            }

            loadSessions() {
                const primary = AppStorage.getJSON('cubeTimerSessions');
                const safety = AppStorage.getJSON('cubeTimerSessionsSafetyBackup');
                const countSolves = sessions => Object.values(sessions || {}).reduce((sum, session) => sum + (Array.isArray(session?.solves) ? session.solves.length : 0), 0);
                const saved = countSolves(safety) > countSolves(primary) ? safety : primary;
                if (saved) {
                    const sessions = saved;
                    // ── Migration: add discipline to old sessions ──
                    let needsSave = false;
                    Object.entries(sessions).forEach(([sessionId, s]) => {
                        if (!s.id || s.id !== sessionId) {
                            s.id = sessionId;
                            needsSave = true;
                        }
                        if (!s.discipline) {
                            s.discipline = '3x3';
                            needsSave = true;
                        }
                        if (!s.subsessions) {
                            s.subsessions = [];
                            needsSave = true;
                        }
                        // Honest Mode: if it was active but its timer already ran out
                        // while the app was closed, clear the active lock (the
                        // subsession itself stays, it just stops being "in progress").
                        if (s.honestMode && s.honestMode.endsAt <= Date.now()) {
                            s.honestMode = null;
                            needsSave = true;
                        }
                        // Assign stable IDs to any solves that don't have one
                        (s.solves || []).forEach((solve, i) => {
                            if (!solve.id) {
                                // Deterministic: same input → same id every reload
                                solve.id = `s_${solve.timestamp || i}_${i}`;
                                needsSave = true;
                            }
                        });

                        // Re-index subsession solveIds if they used the old format (solve_...)
                        // Build a map from old-style position-based ids to current solve ids
                        if ((s.subsessions || []).some(ss =>
                            ss.solveIds.some(id => id.startsWith('solve_'))
                        )) {
                            // Old ids were: `solve_${Date.now()}_${i}` — we can't recover them.
                            // But we know the selected indices were stored implicitly via solveIds order.
                            // Best we can do: clear broken solveIds so subsession still exists visually
                            // with 0 solves rather than crashing silently.
                            // User will need to recreate; we warn via subsession name suffix.
                            s.subsessions.forEach(ss => {
                                if (ss.solveIds.some(id => id.startsWith('solve_'))) {
                                    ss.solveIds = [];
                                    ss.name = ss.name + ' ⚠ (re-create)';
                                    needsSave = true;
                                }
                            });
                        }
                    });
                    if (needsSave) {
                        AppStorage.setJSON('cubeTimerSessions', sessions);
                    }
                    if (saved === safety) AppStorage.setJSON('cubeTimerSessions', sessions);
                    return sessions;
                }
                // Default: No Session
                return {
                    'no-session': {
                        id: 'no-session',
                        name: 'No Session',
                        solves: [],
                        subsessions: [],
                        isDefault: true,
                        discipline: '3x3',
                        honestMode: null
                    }
                };
            }

            loadCurrentSessionId() {
                const saved = AppStorage.getRaw('cubeTimerCurrentSession');
                return saved || 'no-session';
            }

            saveSessions() {
                AppStorage.setJSON('cubeTimerSessions', this.sessions);
                AppStorage.setRaw('cubeTimerCurrentSession', this.currentSessionId);
                // Pushes only session metadata (names/disciplines/current session) —
                // the solve history itself is synced separately, one solve at a time,
                // via window.AppSync.pushNewSolve/pushSolveUpdate/pushSolveDelete
                // called right where each solve action happens.
                if (window.queueAutoPush) {
                    window.queueAutoPush();
                }
            }

            get solves() {
                return this.sessions[this.currentSessionId]?.solves || [];
            }

            set solves(value) {
                if (this.sessions[this.currentSessionId]) {
                    this.sessions[this.currentSessionId].solves = value;
                    this.saveSessions();
                }
            }

            get HOLD_DURATION() {
                return window.settingsManager ? window.settingsManager.settings.holdDelay : 600;
            }

            get TIMER_COLOR() {
                return window.settingsManager ? window.settingsManager.settings.timerColor : '#e8edf4';
            }

            initEventListeners() {
                // Keyboard control with hold-to-start (desktop)
                document.addEventListener('keydown', (e) => {
                    if (e.code === 'Space') {
                        e.preventDefault();
                        this.handleSpaceDown();
                    }
                });

                document.addEventListener('keyup', (e) => {
                    if (e.code === 'Space') {
                        e.preventDefault();
                        this.handleSpaceUp();
                    }
                });

                // Touch control (mobile) — tap/hold to start/stop, mirrors spacebar behavior
                const touchArea = document.querySelector('.center-column');
                if (touchArea) {
                    let touchActive = false;

                    touchArea.addEventListener('touchstart', (e) => {
                        if (e.target.closest('.target-time-btn, button, a, select, input, .new-scramble-btn')) return;
                        e.preventDefault();
                        touchActive = true;
                        this.handleSpaceDown();
                    }, { passive: false });

                    touchArea.addEventListener('touchend', (e) => {
                        if (!touchActive) return;
                        e.preventDefault();
                        touchActive = false;
                        this.handleSpaceUp();
                    }, { passive: false });

                    touchArea.addEventListener('touchcancel', () => {
                        if (touchActive && !this.isRunning) {
                            touchActive = false;
                            this.handleSpaceUp();
                        }
                    });
                }

                // Statistics button
                const statsBtn = document.getElementById('statisticsBtn');
                if (statsBtn) {
                    statsBtn.addEventListener('click', () => {
                        this.openStatistics();
                    });
                }

                // Sessions button
                const sessionsBtn = document.getElementById('sessionsBtn');
                if (sessionsBtn) {
                    sessionsBtn.addEventListener('click', () => {
                        this.openSessions();
                    });
                }

                // Button controls
                document.getElementById('newScrambleBtn').addEventListener('click', () => {
                    this.generateScramble();
                });

                DOM('fireMenuDailyChallenge')?.addEventListener('click', () => {
                    this.openDailyChallenge();
                });
                DOM('dailyChallengeCloseBtn')?.addEventListener('click', () => {
                    DOM('dailyChallengeOverlay')?.classList.remove('visible');
                });
                DOM('dailyChallengeSolveBtn')?.addEventListener('click', () => {
                    this.startDailyChallenge();
                });
                DOM('dailyChallengeOverlay')?.addEventListener('click', (e) => {
                    if (e.target.id === 'dailyChallengeOverlay') {
                        e.currentTarget.classList.remove('visible');
                    }
                });
                DOM('streakButton')?.addEventListener('click', () => this.openStreakCalendar());
                DOM('streakPrevMonth')?.addEventListener('click', () => {
                    this._streakCalendarMonth?.setMonth(this._streakCalendarMonth.getMonth() - 1);
                    this._renderStreakMonth();
                });
                DOM('streakNextMonth')?.addEventListener('click', () => {
                    if (!this._streakCalendarMonth) return;
                    this._streakCalendarMonth.setMonth(this._streakCalendarMonth.getMonth() + 1);
                    this._renderStreakMonth();
                });
                DOM('streakCloseIcon')?.addEventListener('click', () => {
                    DOM('streakOverlay')?.classList.remove('visible');
                });
                DOM('streakOverlay')?.addEventListener('click', (e) => {
                    if (e.target.id === 'streakOverlay') e.currentTarget.classList.remove('visible');
                });

                document.getElementById('dnfBtn').addEventListener('click', () => {
                    this.markDNF();
                });

                document.getElementById('plusTwoBtn').addEventListener('click', () => {
                    this.addPenalty();
                });

                document.getElementById('deleteBtn').addEventListener('click', () => {
                    this.deleteSolve();
                });

                document.getElementById('editBtn').addEventListener('click', () => {
                    this.editSolve();
                });

                document.getElementById('importExportBtn').addEventListener('click', () => {
                    this.openImportExportModal();
                });

                const importResultCloseBtn = document.getElementById('importResultCloseBtn');
                if (importResultCloseBtn) {
                    importResultCloseBtn.addEventListener('click', () => {
                        DOM('importResultOverlay').classList.remove('visible');
                    });
                }

                const ieCloseBtn = document.getElementById('ieCloseBtn');
                if (ieCloseBtn) {
                    ieCloseBtn.addEventListener('click', () => {
                        DOM('importExportOverlay').classList.remove('visible');
                    });
                }

                // ── Auth: login/register + account status/logout ──
                const updateAuthBtnUI = () => {
                    const lang = getLang();
                    const t = translations[lang];
                    const authUser = AppStorage.getJSON('authUser');
                    const btn = document.getElementById('authBtn');
                    if (btn) {
                        const equippedTitle=authUser?window.progression?.getEquippedTitle?.():null;
                        btn.innerHTML='<span class="auth-profile-icon">👤</span><span class="auth-profile-copy"><strong></strong><small></small></span>';
                        btn.querySelector('strong').textContent=authUser?(authUser.nickname||authUser.email):t.authBtn;
                        const titleSlot=btn.querySelector('small');titleSlot.classList.toggle('hidden',!equippedTitle);titleSlot.innerHTML=equippedTitle?window.progression._titleMarkup(equippedTitle):'';
                        window.progression?.fitTitleElements?.(btn);
                    }
                };
                this._updateAuthBtnUI = updateAuthBtnUI;
                updateAuthBtnUI();
                window.addEventListener('titlechange',updateAuthBtnUI);

                const updateSyncStatus = (state, code = '') => {
                    const root = DOM('authSyncStatus');
                    const label = DOM('authSyncStatusText');
                    if (!root || !label) return;
                    const ru = getLang() === 'ru';
                    const messages = ru
                        ? { checking: 'Проверка облака…', syncing: 'Синхронизация…', synced: 'Облако подключено', disconnected: 'Firebase не авторизован', error: `Ошибка синхронизации${code ? `: ${code}` : ''}` }
                        : { checking: 'Checking cloud…', syncing: 'Syncing…', synced: 'Cloud connected', disconnected: 'Firebase is not signed in', error: `Sync error${code ? `: ${code}` : ''}` };
                    root.dataset.state = state;
                    label.textContent = messages[state] || messages.checking;
                };
                window.addEventListener('sync-status', event => updateSyncStatus(event.detail?.state || 'checking', event.detail?.code || ''));

                const applyFirebaseAuthState = (firebaseUser) => {
                    if (firebaseUser) {
                        const existing = AppStorage.getJSON('authUser') || {};
                        const sameUser = existing.uid === firebaseUser.uid;
                        AppStorage.setJSON('authUser', {
                            uid: firebaseUser.uid,
                            nickname: firebaseUser.displayName || (sameUser ? existing.nickname : '') || firebaseUser.email,
                            email: firebaseUser.email || (sameUser ? existing.email : '')
                        });
                        updateSyncStatus('syncing');
                    } else {
                        AppStorage.setJSON('authUser', null);
                        updateSyncStatus('disconnected');
                    }
                    updateAuthBtnUI();
                };
                window.addEventListener('firebase-auth-state', event => applyFirebaseAuthState(event.detail?.user || null));
                if (window.CubeAuth?.getCurrentUser) applyFirebaseAuthState(window.CubeAuth.getCurrentUser());

                DOM('authSyncNowBtn')?.addEventListener('click', async () => {
                    const button = DOM('authSyncNowBtn');
                    const user = window.CubeAuth?.getCurrentUser?.();
                    if (!user) {
                        applyFirebaseAuthState(null);
                        DOM('authAccountOverlay')?.classList.remove('visible');
                        DOM('authOverlay')?.classList.add('visible');
                        return;
                    }
                    button.disabled = true;
                    await window.AppSync?.requestSync?.();
                    button.disabled = false;
                });

                const authBtn = document.getElementById('authBtn');
                if (authBtn) {
                    authBtn.addEventListener('click', () => {
                        const authUser = AppStorage.getJSON('authUser');
                        if (authUser) {
                            const lang = getLang();
                            const t = translations[lang];
                            DOM('authAccountTitle').textContent = authUser.nickname || authUser.email || '';
                            const equippedTitle=window.progression?.getEquippedTitle?.(),titlePreview=DOM('authAccountEquippedTitle');
                            titlePreview.classList.toggle('hidden',!equippedTitle);titlePreview.innerHTML=equippedTitle?window.progression._titleMarkup(equippedTitle):'';
                            window.progression?.fitTitleElements?.(titlePreview);
                            DOM('authAccountEmail').textContent = authUser.email || '';
                            DOM('authAccountCloseBtn').textContent = t.authAccountCloseBtn;
                            DOM('authSyncNowBtn').textContent = getLang() === 'ru' ? 'Синхронизировать сейчас' : 'Sync now';
                            DOM('authChangeNicknameBtn').textContent = t.authChangeNicknameBtn;
                            DOM('authLogoutBtn').textContent = t.authLogoutBtn;
                            DOM('authLogoutConfirmTitle').textContent = t.authLogoutConfirm;
                            DOM('authLogoutCancelBtn').textContent = t.authLogoutCancelBtn;
                            DOM('authLogoutConfirmBtn').textContent = t.authLogoutBtn;
                            DOM('authChangeNicknameTitle').textContent = t.authChangeNicknameTitle;
                            DOM('authNewNicknameLabel').textContent = t.authNewNicknameLabel;
                            DOM('authChangeNicknameSaveBtn').textContent = t.authChangeNicknameSaveBtn;
                            DOM('authChangeNicknameCancelBtn').textContent = t.authChangeNicknameCancelBtn;
                            DOM('authNewNickname').value = authUser.nickname || '';
                            const authChangeNicknameErrorEl = DOM('authChangeNicknameError');
                            if (authChangeNicknameErrorEl) authChangeNicknameErrorEl.classList.remove('visible');
                            // Always reopen on the account view, not mid-confirmation.
                            DOM('authAccountView').style.display = '';
                            DOM('authChangeNicknameView').style.display = 'none';
                            DOM('authLogoutConfirmView').style.display = 'none';
                            DOM('authAccountOverlay').classList.add('visible');
                        } else {
                            DOM('authOverlay').classList.add('visible');
                        }
                    });
                }
                const authAccountCloseBtn = document.getElementById('authAccountCloseBtn');
                if (authAccountCloseBtn) {
                    authAccountCloseBtn.addEventListener('click', () => {
                        DOM('authAccountOverlay').classList.remove('visible');
                    });
                }
                const authChangeNicknameBtn = document.getElementById('authChangeNicknameBtn');
                if (authChangeNicknameBtn) {
                    authChangeNicknameBtn.addEventListener('click', () => {
                        const authUser = AppStorage.getJSON('authUser');
                        const errEl = DOM('authChangeNicknameError');
                        if (errEl) errEl.classList.remove('visible');
                        DOM('authNewNickname').value = (authUser && authUser.nickname) || '';
                        DOM('authAccountView').style.display = 'none';
                        DOM('authChangeNicknameView').style.display = '';
                    });
                }
                const authChangeNicknameCancelBtn = document.getElementById('authChangeNicknameCancelBtn');
                if (authChangeNicknameCancelBtn) {
                    authChangeNicknameCancelBtn.addEventListener('click', () => {
                        DOM('authChangeNicknameView').style.display = 'none';
                        DOM('authAccountView').style.display = '';
                    });
                }
                const authChangeNicknameSaveBtn = document.getElementById('authChangeNicknameSaveBtn');
                if (authChangeNicknameSaveBtn) {
                    authChangeNicknameSaveBtn.addEventListener('click', () => {
                        const lang = getLang();
                        const t = translations[lang];
                        const errEl = DOM('authChangeNicknameError');
                        const showErr = (msg) => { errEl.textContent = msg; errEl.classList.add('visible'); };
                        errEl.classList.remove('visible');

                        const newNickname = DOM('authNewNickname').value.trim();
                        const authUser = AppStorage.getJSON('authUser');

                        if (!newNickname) {
                            showErr(t.authErrRequired);
                            return;
                        }
                        if (authUser && newNickname === authUser.nickname) {
                            // No actual change -- just go back without hitting Firebase.
                            DOM('authChangeNicknameView').style.display = 'none';
                            DOM('authAccountView').style.display = '';
                            return;
                        }
                        if (!window.CubeAuth || !window.CubeAuth.changeNickname) {
                            showErr(t.authErrGeneric);
                            return;
                        }

                        authChangeNicknameSaveBtn.disabled = true;
                        (async () => {
                            try {
                                const updatedNickname = await window.CubeAuth.changeNickname(newNickname);
                                const updatedUser = { ...(authUser || {}), nickname: updatedNickname };
                                AppStorage.setJSON('authUser', updatedUser);
                                updateAuthBtnUI();
                                DOM('authAccountTitle').textContent = updatedNickname;
                                DOM('authChangeNicknameView').style.display = 'none';
                                DOM('authAccountView').style.display = '';
                            } catch (error) {
                                if (error.code === 'nickname-in-use') {
                                    showErr(t.authErrNicknameInUse);
                                } else {
                                    showErr(window.authFirebaseErrorMessage(error.code, lang));
                                }
                            } finally {
                                authChangeNicknameSaveBtn.disabled = false;
                            }
                        })();
                    });
                }
                // "Log out" (in the account view) doesn't sign out immediately --
                // it swaps to an in-modal confirmation step. We avoid the native
                // confirm() dialog here since some recording/automation setups
                // suppress it silently, which made the button look broken.
                const authLogoutBtn = document.getElementById('authLogoutBtn');
                if (authLogoutBtn) {
                    authLogoutBtn.addEventListener('click', () => {
                        DOM('authAccountView').style.display = 'none';
                        DOM('authLogoutConfirmView').style.display = '';
                    });
                }
                const authLogoutCancelBtn = document.getElementById('authLogoutCancelBtn');
                if (authLogoutCancelBtn) {
                    authLogoutCancelBtn.addEventListener('click', () => {
                        DOM('authLogoutConfirmView').style.display = 'none';
                        DOM('authAccountView').style.display = '';
                    });
                }
                const authLogoutConfirmBtn = document.getElementById('authLogoutConfirmBtn');
                if (authLogoutConfirmBtn) {
                    authLogoutConfirmBtn.addEventListener('click', () => {
                        authLogoutConfirmBtn.disabled = true;
                        const finishLogout = () => {
                            AppStorage.setJSON('authUser', null);
                            updateAuthBtnUI();
                            authLogoutConfirmBtn.disabled = false;
                            DOM('authAccountOverlay').classList.remove('visible');
                        };
                        if (window.CubeAuth && window.CubeAuth.logout) {
                            window.CubeAuth.logout().catch(e => console.error('Logout failed:', e)).finally(finishLogout);
                        } else {
                            // Firebase module hasn't loaded in this page load (network
                            // hiccup, blocked request, etc). Still let the person log
                            // out locally rather than leaving the button stuck.
                            console.error('window.CubeAuth is not available -- firebase-init.js may not have loaded. Logging out locally only.');
                            finishLogout();
                        }
                    });
                }
                const authCloseBtn = document.getElementById('authCloseBtn');
                if (authCloseBtn) {
                    authCloseBtn.addEventListener('click', () => {
                        DOM('authOverlay').classList.remove('visible');
                    });
                }
                const authRegisterBtn = document.getElementById('authRegisterBtn');
                if (authRegisterBtn) {
                    authRegisterBtn.addEventListener('click', () => {
                        const lang = getLang();
                        const t = translations[lang];
                        const errEl = DOM('authRegError');
                        const showErr = (msg) => { errEl.textContent = msg; errEl.classList.add('visible'); };
                        errEl.classList.remove('visible');

                        const nickname = DOM('authRegNickname').value.trim();
                        const email = DOM('authRegEmail').value.trim();
                        const password = DOM('authRegPassword').value;
                        const passwordRepeat = DOM('authRegPasswordRepeat').value;

                        if (!nickname || !email || !password || !passwordRepeat) {
                            showErr(t.authErrRequired);
                            return;
                        }
                        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                            showErr(t.authErrEmailFormat);
                            return;
                        }
                        if (password.length < 6) {
                            showErr(t.authErrPasswordShort);
                            return;
                        }
                        if (password !== passwordRepeat) {
                            showErr(t.authErrPasswordMismatch);
                            return;
                        }

                        // Validation passed -- create the account.
                        authRegisterBtn.disabled = true;
                        (async () => {
                            try {
                                const user = await window.CubeAuth.registerWithNickname(nickname, email, password);
                                AppStorage.setJSON('authUser', { uid: user.uid, nickname, email });
                                updateAuthBtnUI();
                                await window.AppSync.requestSync();
                                DOM('authOverlay').classList.remove('visible');
                                DOM('authWarningOverlay').classList.remove('visible');
                            } catch (error) {
                                if (error.code === 'nickname-in-use') {
                                    showErr(lang === 'ru' ? 'Этот ник уже занят' : 'This nickname is already taken');
                                } else {
                                    showErr(window.authFirebaseErrorMessage(error.code, lang));
                                }
                            } finally {
                                authRegisterBtn.disabled = false;
                            }
                        })();
                    });
                }
                const authLoginBtn = document.getElementById('authLoginBtn');
                if (authLoginBtn) {
                    authLoginBtn.addEventListener('click', () => {
                        const lang = getLang();
                        const t = translations[lang];
                        const errEl = DOM('authLoginError');
                        const showErr = (msg) => { errEl.textContent = msg; errEl.classList.add('visible'); };
                        errEl.classList.remove('visible');

                        const loginId = DOM('authLoginId').value.trim();
                        const password = DOM('authLoginPassword').value;

                        if (!loginId || !password) {
                            showErr(t.authErrRequired);
                            return;
                        }

                        // Validation passed on our end -- resolve nickname/email and sign in.
                        authLoginBtn.disabled = true;
                        (async () => {
                            let email;
                            try {
                                email = await window.CubeAuth.resolveEmailForLogin(loginId);
                                if (!email) {
                                    showErr(window.authFirebaseErrorMessage('auth/user-not-found', lang));
                                    return;
                                }
                                const cred = await window.CubeAuth.loginWithEmail(email, password);
                                AppStorage.setJSON('authUser', {
                                    uid: cred.user.uid,
                                    nickname: cred.user.displayName || loginId,
                                    email: cred.user.email
                                });
                                updateAuthBtnUI();
                                await window.AppSync.requestSync();
                                DOM('authOverlay').classList.remove('visible');
                                DOM('authWarningOverlay').classList.remove('visible');
                            } catch (error) {
                                if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
                                    const methods = await window.CubeAuth.getSignInMethods(email || loginId);
                                    if (methods.includes('google.com') && !methods.includes('password')) {
                                        showErr(t.authErrUseGoogle);
                                        return;
                                    }
                                }
                                showErr(window.authFirebaseErrorMessage(error.code, lang));
                            } finally {
                                authLoginBtn.disabled = false;
                            }
                        })();
                    });
                }
                const authGoogleBtn = document.getElementById('authGoogleBtn');
                if (authGoogleBtn) {
                    authGoogleBtn.addEventListener('click', () => {
                        const lang = getLang();
                        const errEl = DOM('authRegError');
                        const showErr = (msg) => { errEl.textContent = msg; errEl.classList.add('visible'); };
                        errEl.classList.remove('visible');

                        authGoogleBtn.disabled = true;
                        (async () => {
                            try {
                                const cred = await window.CubeAuth.loginWithGoogle();
                                const nickname = await window.CubeAuth.ensureUserProfile(cred.user);
                                AppStorage.setJSON('authUser', {
                                    uid: cred.user.uid,
                                    nickname,
                                    email: cred.user.email
                                });
                                updateAuthBtnUI();
                                await window.AppSync.requestSync();
                                DOM('authOverlay').classList.remove('visible');
                                DOM('authWarningOverlay').classList.remove('visible');
                            } catch (error) {
                                showErr(window.authFirebaseErrorMessage(error.code, lang));
                            } finally {
                                authGoogleBtn.disabled = false;
                            }
                        })();
                    });
                }
                const authWarningCloseBtn = document.getElementById('authWarningCloseBtn');
                if (authWarningCloseBtn) {
                    authWarningCloseBtn.addEventListener('click', () => {
                        DOM('authWarningOverlay').classList.remove('visible');
                    });
                }
                // Not-logged-in nudge disabled: it was confusing for first-time
                // visitors (shows a red warning before they understand the app).

                const ieOverlay = DOM('importExportOverlay');
                if (ieOverlay) {
                    ieOverlay.addEventListener('click', (e) => {
                        const exportBtn = e.target.closest('[data-export]');
                        const importBtn = e.target.closest('[data-import]');
                        if (exportBtn) this._handleExportChoice(exportBtn.dataset.export);
                        else if (importBtn) this._handleImportChoice(importBtn.dataset.import);
                    });
                }

                // ── Target Time ──
                const targetTimeBtn = DOM('targetTimeBtn');
                const targetTimeOverlay = document.getElementById('targetTimeOverlay');
                const targetTimeToggle = document.getElementById('targetTimeToggle');
                const targetTimeInput = document.getElementById('targetTimeInput');

                const openTargetTimeModal = () => {
                    const s = window.settingsManager.settings;
                    targetTimeToggle.classList.toggle('active', !!s.targetTimeEnabled);
                    targetTimeInput.value = s.targetTime ? this.formatTime(s.targetTime) : '';
                    targetTimeOverlay.classList.add('visible');
                    setTimeout(() => targetTimeInput.focus(), 50);
                };

                if (targetTimeBtn) targetTimeBtn.addEventListener('click', openTargetTimeModal);

                if (targetTimeToggle) {
                    targetTimeToggle.addEventListener('click', () => {
                        targetTimeToggle.classList.toggle('active');
                    });
                }

                const closeTargetTimeModal = () => targetTimeOverlay.classList.remove('visible');

                const targetTimeCancel = document.getElementById('targetTimeCancel');
                if (targetTimeCancel) targetTimeCancel.addEventListener('click', closeTargetTimeModal);

                const targetTimeSave = document.getElementById('targetTimeSave');
                if (targetTimeSave) {
                    targetTimeSave.addEventListener('click', () => {
                        const enabled = targetTimeToggle.classList.contains('active');
                        const parsed = this._parseGoalTimeInput(targetTimeInput.value);

                        if (enabled && !parsed) {
                            alert('Invalid goal time');
                            return;
                        }

                        // A bare number like "1700" is technically valid (1700
                        // seconds = 28:20), but that's an unusual single-solve goal
                        // and often means someone meant to type something shorter.
                        // Double-check before saving instead of silently accepting it.
                        if (enabled && parsed && parsed.time > 300) {
                            const confirmMsg = `That's ${this.formatTime(parsed.time)} (${Math.round(parsed.time)} seconds). Is that really your goal time?`;
                            if (!confirm(confirmMsg)) return;
                        }

                        const s = window.settingsManager.settings;
                        s.targetTimeEnabled = enabled;
                        if (parsed) s.targetTime = parsed.time;
                        window.settingsManager.saveSettings();

                        this._updateTargetTimeBtn();
                        closeTargetTimeModal();
                    });
                }

                // ── Honest Mode ──
                const honestModeBtn = DOM('honestModeBtn');
                const honestModeOverlay = DOM('honestModeOverlay');
                const hmIdleState = document.getElementById('hmIdleState');
                const hmActiveState = document.getElementById('hmActiveState');
                const honestModeMinutesInput = document.getElementById('honestModeMinutesInput');
                const hmCountdownDisplay = DOM('hmCountdownDisplay');

                const openHonestModeModal = () => {
                    const session = this.sessions[this.currentSessionId];
                    const active = session && session.honestMode;

                    if (active) {
                        hmIdleState.style.display = 'none';
                        hmActiveState.style.display = 'block';
                        this._refreshHonestModeCountdownDisplay();
                    } else {
                        hmIdleState.style.display = 'block';
                        hmActiveState.style.display = 'none';
                        honestModeMinutesInput.value = '';
                    }

                    honestModeOverlay.classList.add('visible');
                    if (!active) setTimeout(() => honestModeMinutesInput.focus(), 50);
                };

                if (honestModeBtn) honestModeBtn.addEventListener('click', openHonestModeModal);

                const closeHonestModeModal = () => honestModeOverlay.classList.remove('visible');

                const honestModeCancel = document.getElementById('honestModeCancel');
                if (honestModeCancel) honestModeCancel.addEventListener('click', closeHonestModeModal);

                const honestModeStart = document.getElementById('honestModeStart');
                if (honestModeStart) {
                    honestModeStart.addEventListener('click', () => {
                        const parsed = this._parseHonestModeMinutes(honestModeMinutesInput.value);
                        if (!parsed || parsed.time <= 0) {
                            alert('Enter how many minutes Honest Mode should run for (up to 300).');
                            return;
                        }
                        this.startHonestMode(parsed.time);
                        closeHonestModeModal();
                    });
                }

                // Just closes the modal — Honest Mode itself can't be stopped early,
                // that would defeat the point. It only ends when the timer runs out.
                const honestModeCloseActive = DOM('honestModeCloseActive');
                if (honestModeCloseActive) {
                    honestModeCloseActive.addEventListener('click', closeHonestModeModal);
                }
            }

            // Keeps the countdown text inside the (currently open) Honest Mode modal
            // in sync — separate from _updateHonestModeBtn, which only updates the pills.
            _refreshHonestModeCountdownDisplay() {
                const display = DOM('hmCountdownDisplay');
                if (!display) return;
                const session = this.sessions[this.currentSessionId];
                if (!session || !session.honestMode) return;

                const remaining = Math.max(0, session.honestMode.endsAt - Date.now());
                const m = Math.floor(remaining / 60000);
                const s = Math.floor((remaining % 60000) / 1000);
                display.textContent = `${m}:${String(s).padStart(2, '0')}`;
            }

            // Refreshes the Target Time pill and the goal label near the timer,
            // to reflect current settings.
            _updateTargetTimeBtn() {
                const btn = DOM('targetTimeBtn');
                const label = document.getElementById('targetTimeBtnLabel');
                const goalLabel = document.getElementById('targetTimeGoalLabel');

                const s = window.settingsManager?.settings;
                const lang = getLang();
                const t = translations[lang] || translations.en;
                const isSet = s && s.targetTimeEnabled && s.targetTime > 0;

                const text = isSet ? this.formatTime(s.targetTime) : (t.targetTimeLabel || 'Target Time');

                if (btn && label) {
                    label.textContent = text;
                    btn.classList.toggle('active', !!isSet);
                }

                if (goalLabel) {
                    if (isSet) {
                        const usesMinutes = s.targetTime >= 60;
                        const timeStr = this.formatTime(s.targetTime);
                        const display = (!usesMinutes && Number.isInteger(s.targetTime))
                            ? String(s.targetTime) : timeStr;
                        const unit = usesMinutes ? '' : ` ${t.secAbbrev || 'sec'}`;
                        goalLabel.textContent = `${t.targetGoalPrefix || 'Goal:'} ${display}${unit}`;
                        goalLabel.style.display = 'block';
                    } else {
                        goalLabel.style.display = 'none';
                    }
                }
            }

            handleSpaceDown() {
                // Store inspection state before any modifications
                const wasInspecting = this.isInspecting;
                
                // During inspection, holding space stops inspection and starts normal timer flow
                if (this.isInspecting) {
                    this.stopInspection();
                    // Continue to normal hold logic below - inspection was active, so hold is allowed
                }
                
                if (this.isRunning) {
                    // Stop timer
                    this.stopTimer();
                    return;
                }

                if (this.isHolding) return;

                // CRITICAL: Block hold ONLY if inspection is enabled AND was never active
                // If inspection was just stopped (wasInspecting), allow hold to proceed
                const inspectionEnabled = window.settingsManager && window.settingsManager.settings.inspection;
                
                if (inspectionEnabled && !wasInspecting) {
                    // Inspection is ON but was never active - only tap allowed, block hold
                    this.tapStartTime = Date.now();
                    return;
                }

                // Record tap start time for tap detection
                this.tapStartTime = Date.now();

                // Start holding
                this.isHolding = true;
                this.isReady = false;
                this.holdStartTime = Date.now();
                this.timerDisplay.classList.remove('target-met', 'target-missed');
                if (this.timerContainer) {
                    this.timerContainer.style.setProperty('--hold-duration', `${this.HOLD_DURATION}ms`);
                    this.timerContainer.classList.remove('ready');
                    this.timerContainer.classList.add('holding');
                }

                // Set timeout for ready state
                this.holdTimeout = setTimeout(() => {
                    this.isReady = true;
                    this.timerDisplay.classList.add('ready');
                    if (this.timerContainer) {
                        this.timerContainer.classList.remove('holding');
                        this.timerContainer.classList.add('ready');
                    }
                    // Clear any inline color to let CSS take over
                    this.timerDisplay.style.color = '';
                }, this.HOLD_DURATION);
            }

            handleSpaceUp() {
                if (this.isRunning) return;

                if (this.holdTimeout) {
                    clearTimeout(this.holdTimeout);
                    this.holdTimeout = null;
                }

                if (this.isReady) {
                    // Start timer
                    this.startTimer();
                } else {
                    // Check if this was a tap (quick press/release)
                    const holdDuration = Date.now() - this.tapStartTime;
                    const wasTap = holdDuration < 200; // Less than 200ms = tap
                    
                    if (wasTap && window.settingsManager && window.settingsManager.settings.inspection && !this.isInspecting) {
                        // Start inspection
                        this.startInspection();
                    } else {
                        // False start - reset
                        this.timerDisplay.classList.remove('ready');
                        
                        // Reset color properly in light theme
                        this.timerDisplay.style.color = '';
                        if (document.body.classList.contains('light-theme')) {
                            this.timerDisplay.style.color = '#222222';
                        }
                    }
                }

                if (this.timerContainer) {
                    this.timerContainer.classList.remove('holding', 'ready');
                }

                this.isHolding = false;
                this.isReady = false;
            }

            startTimer() {
                // Stop inspection if active
                if (this.isInspecting) {
                    this.stopInspection();
                }
                
                this.isRunning = true;
                this.startTime = performance.now();
                this.timerDisplay.classList.remove('ready');
                this.timerContainer?.classList.remove('holding', 'ready');
                this.timerDisplay.classList.remove('target-met', 'target-missed');
                this.timerDisplay.classList.add('running');
                this.hideNewBestIndicator();

                // Reset Target Time beeper state for the new solve
                this._ttNextBeepAt = undefined;
                this._ttLongBeepFired = false;

                // Hide UI if enabled
                if (window.settingsManager?.settings?.hideUiDuringSolve) {
                    this._setHideUiActive(true);
                }
                
                // Apply running timer color
                if (window.settingsManager && window.settingsManager.settings.timerColor) {
                    const timerColor = window.settingsManager.settings.timerColor;
                    const isLightTheme = document.body.classList.contains('light-theme');
                    const isDefaultColor = timerColor === '#e8edf4';
                    // In light theme with default color, don't override — CSS handles it (#222)
                    if (!(isLightTheme && isDefaultColor)) {
                        this.timerDisplay.style.color = timerColor;
                    } else {
                        this.timerDisplay.style.color = '';
                    }
                }
                
                if (window.settingsManager) {
                    window.settingsManager.playSound('start');
                }
                
                this.updateTimer();
            }

            // Inspection methods
            startInspection() {
                this.isInspecting = true;
                this.inspectionTime = 15;
                this.timerDisplay.textContent = '15';
                this.timerDisplay.style.fontSize = '10rem';
                
                // Start countdown
                this.inspectionInterval = setInterval(() => {
                    this.updateInspection();
                }, 1000);
            }

            updateInspection() {
                this.inspectionTime--;
                this.timerDisplay.textContent = this.inspectionTime.toString();

                // WCA judges call "8 seconds" after 8s elapsed (7s remaining) and
                // "12 seconds" after 12s elapsed (3s remaining).
                if (this.inspectionTime === 7) {
                    window.settingsManager?.speakInspectionWarning(8);
                } else if (this.inspectionTime === 3) {
                    window.settingsManager?.speakInspectionWarning(12);
                }
                
                // Color changes based on time
                if (this.inspectionTime > 8) {
                    // 15-9: normal color
                    if (document.body.classList.contains('light-theme')) {
                        this.timerDisplay.style.color = '#222222';
                    } else {
                        this.timerDisplay.style.color = '#e8edf4';
                    }
                } else if (this.inspectionTime > 4) {
                    // 8-5: yellow
                    this.timerDisplay.style.color = '#facc15';
                } else {
                    // 4-0: red
                    this.timerDisplay.style.color = '#ef4444';
                }
                
                // Auto-start or DNF based on inspection mode
                if (this.inspectionTime <= 0) {
                    const mode = window.settingsManager ? window.settingsManager.settings.inspectionMode : 'wca';
                    if (mode === 'training') {
                        // Training: auto-start the timer
                        this.stopInspection();
                        this.startTimer();
                    } else {
                        // WCA: inspection expired = DNF
                        this.stopInspection();
                        this.saveSolveDNF();
                    }
                }
            }

            stopInspection() {
                if (this.inspectionInterval) {
                    clearInterval(this.inspectionInterval);
                    this.inspectionInterval = null;
                }
                this.isInspecting = false;
                this.timerDisplay.textContent = '0.00';
                this.timerDisplay.style.fontSize = '7rem';
                
                // Reset color
                if (document.body.classList.contains('light-theme')) {
                    this.timerDisplay.style.color = '#222222';
                } else {
                    this.timerDisplay.style.color = '#e8edf4';
                }
            }

            stopTimer() {
                this.isRunning = false;
                this.timerDisplay.classList.remove('running');
                this.timerDisplay.style.color = '';

                // Restore hidden UI
                this._setHideUiActive(false);

                // Force proper color in light theme
                if (document.body.classList.contains('light-theme')) {
                    this.timerDisplay.style.color = '#222222';
                }
                
                if (this.animationFrame) {
                    cancelAnimationFrame(this.animationFrame);
                }

                if (window.settingsManager) {
                    window.settingsManager.playSound('stop');
                }

                // Save current bests before adding new solve
                this.previousBest = this.getBestTime();
                this.previousBestAo5 = this.getBestAverage(5);
                this.previousBestAo12 = this.getBestAverage(12);
                this.previousBestAo100 = this.getBestAverage(100);

                // Save the solve
                this.saveSolve(this.time);

                // Target Time: flash the timer green (goal met) or red (goal missed)
                const s = window.settingsManager?.settings;
                if (s && s.targetTimeEnabled && s.targetTime > 0) {
                    this.timerDisplay.classList.remove('target-met', 'target-missed');
                    this.timerDisplay.classList.add(this.time <= s.targetTime ? 'target-met' : 'target-missed');
                }

                // Generate new scramble
                setTimeout(() => {
                    this.generateScramble();
                }, 500);
            }

            updateTimer() {
                if (!this.isRunning) return;

                const elapsed = (performance.now() - this.startTime) / 1000;
                this.time = elapsed;
                this.timerDisplay.textContent = this.formatTime(elapsed);
                this._updateTargetTimeBeeper(elapsed);

                this.animationFrame = requestAnimationFrame(() => this.updateTimer());
            }

            // Target Time: beeps faster and faster as elapsed time approaches the goal,
            // then one long beep exactly at the goal, then silence — makes it obvious
            // the goal was missed without having to look at the timer.
            _updateTargetTimeBeeper(elapsed) {
                const s = window.settingsManager?.settings;
                if (!s || !s.targetTimeEnabled || !s.targetTime || s.targetTime <= 0) return;

                const target = s.targetTime;
                const warnWindow = Math.min(5, target * 0.5); // seconds before target when beeping starts
                const remaining = target - elapsed;

                if (remaining <= 0) {
                    if (!this._ttLongBeepFired) {
                        this._ttLongBeepFired = true;
                        window.settingsManager.playTargetBeep('long');
                    }
                    return;
                }

                if (remaining > warnWindow) return;

                if (this._ttNextBeepAt === undefined || elapsed >= this._ttNextBeepAt) {
                    window.settingsManager.playTargetBeep('short');
                    const ratio = Math.max(0, remaining / warnWindow); // 1 (far) -> 0 (close)
                    const interval = 0.12 + 0.68 * ratio; // seconds until next beep, shrinks as we approach target
                    this._ttNextBeepAt = elapsed + interval;
                }
            }

            // ════════════════════════════════════════════════════════════
            // Honest Mode
            // ════════════════════════════════════════════════════════════
            // A timed run where solves can't be deleted or edited while it's active
            // (but +2/DNF stay available). Implemented as an auto-created subsession
            // (green stripe in Solve History) whose solves get locked only while
            // session.honestMode is set; once it ends (timer runs out or user stops
            // it early) the lock lifts immediately — the subsession itself stays
            // forever as a visual record, it just stops being "in progress".

            // Called right after a new solve is added to a session, while its Honest
            // Mode run (if any) is still active — tags the solve into that subsession.
            _registerSolveInHonestMode(session, solve) {
                if (!session || !session.honestMode) return;
                const ss = (session.subsessions || []).find(s => s.id === session.honestMode.subsessionId);
                if (ss) ss.solveIds.push(solve.id);
            }

            // True if this solve currently can't be deleted/edited because it belongs
            // to an in-progress Honest Mode run.
            _isSolveHonestLocked(session, solve) {
                if (!session || !session.honestMode || !solve) return false;
                const ss = (session.subsessions || []).find(s => s.id === session.honestMode.subsessionId);
                return !!ss && ss.solveIds.includes(solve.id);
            }

            _honestModeLockedAlert() {
                const lang = getLang();
                const t = translations[lang] || translations.en;
                alert(t.honestModeLocked || "This solve is locked by Honest Mode and can't be edited or deleted until it ends.");
            }

            _honestModeSessionLabel(count) {
                return count === 0 ? 'HONEST MODE' : `HONEST MODE ${count + 1}`;
            }

            startHonestMode(minutes) {
                const session = this.sessions[this.currentSessionId];
                if (!session || !minutes || minutes <= 0) return;

                if (!session.subsessions) session.subsessions = [];
                const existingHonestCount = session.subsessions.filter(ss => ss.name.startsWith('HONEST MODE')).length;

                const subsession = {
                    id: `ss_honest_${Date.now()}`,
                    name: this._honestModeSessionLabel(existingHonestCount),
                    color: '#4ade80', // green — matches the existing subsession palette
                    excludeFromAvg: false, // honest solves count toward the real average by default
                    solveIds: []
                };
                session.subsessions.push(subsession);

                session.honestMode = {
                    subsessionId: subsession.id,
                    endsAt: Date.now() + Math.round(minutes * 60 * 1000)
                };

                this.saveSessions();
                if (window.sessionsManager) {
                    window.sessionsManager.populateSolveHistory();
                    window.sessionsManager.renderSubsessionStats();
                    window.sessionsManager.renderSubsessionPie();
                }
                this._updateHonestModeBtn();
                this._startHonestModeTicker();
            }

            // Ends the CURRENT session's active Honest Mode run, whether it expired
            // naturally or the user stopped it early. The subsession stays; only the
            // active lock is cleared.
            endHonestMode() {
                const session = this.sessions[this.currentSessionId];
                if (session) {
                    session.honestMode = null;
                    this.saveSessions();
                }
                if (this._honestModeInterval) {
                    clearInterval(this._honestModeInterval);
                    this._honestModeInterval = null;
                }
                this._updateHonestModeBtn();
                if (window.sessionsManager) window.sessionsManager.populateSolveHistory();
            }

            _startHonestModeTicker() {
                if (this._honestModeInterval) clearInterval(this._honestModeInterval);
                this._honestModeInterval = setInterval(() => {
                    const session = this.sessions[this.currentSessionId];
                    if (!session || !session.honestMode) {
                        clearInterval(this._honestModeInterval);
                        this._honestModeInterval = null;
                        return;
                    }
                    if (session.honestMode.endsAt <= Date.now()) {
                        this.endHonestMode();
                    } else {
                        this._updateHonestModeBtn();
                    }
                }, 1000);
            }

            // Refreshes the Honest Mode pill to reflect the CURRENTLY SELECTED
            // session's state — call this on session switch too.
            _updateHonestModeBtn() {
                const btn = DOM('honestModeBtn');
                const label = document.getElementById('honestModeBtnLabel');

                const session = this.sessions[this.currentSessionId];
                const lang = getLang();
                const t = translations[lang] || translations.en;
                const active = session && session.honestMode;

                let text;
                if (active) {
                    const remaining = Math.max(0, session.honestMode.endsAt - Date.now());
                    const m = Math.floor(remaining / 60000);
                    const s = Math.floor((remaining % 60000) / 1000);
                    text = `${m}:${String(s).padStart(2, '0')}`;
                } else {
                    text = t.honestModeLabel || 'Honest Mode';
                }

                if (btn && label) {
                    label.textContent = text;
                    btn.classList.toggle('active', !!active);
                }

                const overlay = DOM('honestModeOverlay');
                if (overlay && overlay.classList.contains('visible')) {
                    this._refreshHonestModeCountdownDisplay();
                }
            }

            formatTime(seconds) {
                const useMinutes = window.settingsManager
                    && window.settingsManager.settings.timeFormat === 'minutes'
                    && seconds >= 60;

                if (useMinutes) {
                    const m = Math.floor(seconds / 60);
                    const s = (seconds % 60).toFixed(2).padStart(5, '0');
                    return `${m}:${s}`;
                }
                return seconds.toFixed(2);
            }

            saveSolve(time) {
                const s = window.settingsManager?.settings;
                const targetMet = (s && s.targetTimeEnabled && s.targetTime > 0)
                    ? (time <= s.targetTime)
                    : null; // null = Target Time wasn't active for this solve

                const now = Date.now();
                const dailyChallengeTag = this._consumeDailyChallengeTag();
                const solve = {
                    id: `s_${now}_${Math.random().toString(36).slice(2,7)}`,
                    time: time,
                    timestamp: now,
                    // Stamped at creation too (not just on later edits) so the
                    // cloud delta-sync query (updatedAt > lastSyncedAt) picks
                    // up brand-new solves, not just edited ones.
                    updatedAt: now,
                    scramble: DOM('scrambleText').textContent,
                    penalty: null,
                    dnf: false,
                    targetMet,
                    ...dailyChallengeTag
                };

                const currentSession = this.sessions[this.currentSessionId];
                if (currentSession) {
                    currentSession.solves.unshift(solve);
                    this._registerSolveInHonestMode(currentSession, solve);
                    this.saveSessions();
                    this._maybeAutoExport();
                    if (window.AppSync) window.AppSync.pushNewSolve(this.currentSessionId, solve);
                    
                    // Update solve history if it's open
                    if (window.sessionsManager && DOM('solveHistorySection').style.display === 'flex') {
                        window.sessionsManager.populateSolveHistory();
                    }
                }
                
                this.updateUI();
                this.checkNewRecords(time);
                
                // Trigger commentary
                if (window.commentary) {
                    this.triggerCommentary();
                }
            }

            // WCA mode: inspection expired → save DNF automatically
            saveSolveDNF() {
                const now = Date.now();
                const dailyChallengeTag = this._consumeDailyChallengeTag();
                const solve = {
                    id: `s_${now}_${Math.random().toString(36).slice(2,7)}`,
                    time: 0,
                    timestamp: now,
                    // See saveSolve() above -- stamped at creation so delta
                    // sync (updatedAt > lastSyncedAt) sees it immediately.
                    updatedAt: now,
                    scramble: DOM('scrambleText').textContent,
                    penalty: null,
                    dnf: true,
                    ...dailyChallengeTag
                };

                const currentSession = this.sessions[this.currentSessionId];
                if (currentSession) {
                    currentSession.solves.unshift(solve);
                    this._registerSolveInHonestMode(currentSession, solve);
                    this.saveSessions();
                    this._maybeAutoExport();
                    if (window.AppSync) window.AppSync.pushNewSolve(this.currentSessionId, solve);

                    if (window.sessionsManager && DOM('solveHistorySection').style.display === 'flex') {
                        window.sessionsManager.populateSolveHistory();
                    }
                }

                // Reset display to 0.00
                this.timerDisplay.textContent = '0.00';
                this.timerDisplay.style.fontSize = '7rem';

                this.updateUI();

                // Trigger commentary with DNF context
                if (window.commentary) {
                    window.commentary.show({ isDNF: true });
                }

                // Generate new scramble
                setTimeout(() => {
                    this.generateScramble();
                }, 500);
            }

            checkNewRecords(time) {
                const messages = [];
                
                // Check single best - only if ACTUALLY better
                const currentBest = this.getBestTime();
                if (currentBest !== null && (this.previousBest === null || currentBest < this.previousBest)) {
                    messages.push('single');
                }
                
                // Check Ao5 best - only if we have enough solves and it's better
                if (this.solves.length >= 5) {
                    const currentBestAo5 = this.getBestAverage(5);
                    if (currentBestAo5 !== null && (this.previousBestAo5 === null || currentBestAo5 < this.previousBestAo5)) {
                        messages.push('ao5');
                    }
                }
                
                // Check Ao12 best
                if (this.solves.length >= 12) {
                    const currentBestAo12 = this.getBestAverage(12);
                    if (currentBestAo12 !== null && (this.previousBestAo12 === null || currentBestAo12 < this.previousBestAo12)) {
                        messages.push('ao12');
                    }
                }
                
                // Check Ao100 best
                if (this.solves.length >= 100) {
                    const currentBestAo100 = this.getBestAverage(100);
                    if (currentBestAo100 !== null && (this.previousBestAo100 === null || currentBestAo100 < this.previousBestAo100)) {
                        messages.push('ao100');
                    }
                }
                
                // Show messages sequentially
                if (messages.length > 0) {
                    this.showNewBestMessages(messages);
                }
            }

            showNewBestMessages(messages) {
                const initialDelay = 2500; // wait 2.5s after the record before starting the slide-in animation
                const holdDuration = 5000; // each record label stays visible for 5s
                messages.forEach((message, index) => {
                    setTimeout(() => {
                        this.showNewBestIndicator(message);
                    }, initialDelay + index * holdDuration);
                });
            }

            showNewBestIndicator(key) {
                if (!this.titleStrip || !this.recordTitle) return;

                const lang = getLang();
                const t = translations[lang] || translations.en;
                const textMap = {
                    single: t.newBestSingle,
                    ao5: t.newBestAo5,
                    ao12: t.newBestAo12,
                    ao100: t.newBestAo100
                };
                const message = textMap[key];
                if (!message) return;

                this.recordTitle.textContent = message;
                this.titleStrip.classList.add('showing-record');

                clearTimeout(this._newBestTimeout);
                this._newBestTimeout = setTimeout(() => {
                    this.titleStrip.classList.remove('showing-record');
                }, 5000);
            }

            hideNewBestIndicator() {
                clearTimeout(this._newBestTimeout);
                if (this.titleStrip) this.titleStrip.classList.remove('showing-record');
            }

            triggerCommentary() {
                if (this.solves.length === 0) return;

                const lastSolve = this.solves[0];
                const sessionAvg = this.calculateSessionAverage();
                
                // Build context for commentary
                const context = {
                    isDelete: false,
                    isDNF: lastSolve.dnf,
                    isPluTwo: lastSolve.penalty === 2,
                    isNewPB: false,
                    isAverageImproved: false,
                    isAverageWorsened: false,
                    isTargetSuccess: false,
                    isTargetFail: false,
                    isFast: false,
                    isSlow: false
                };

                // Check if new PB
                const best = this.getBestTime();
                if (best !== null && this.previousBest !== null && best < this.previousBest) {
                    context.isNewPB = true;
                }

                // Check average trends (if we have enough data)
                if (this.solves.length >= 5 && sessionAvg !== null) {
                    const currentAo5 = this.calculateAverage(5);
                    if (currentAo5 !== null && this.previousAverageAo5 !== undefined) {
                        if (currentAo5 < this.previousAverageAo5) {
                            context.isAverageImproved = true;
                        } else if (currentAo5 > this.previousAverageAo5 * 1.1) {
                            context.isAverageWorsened = true;
                        }
                    }
                    this.previousAverageAo5 = currentAo5;
                }

                // Check Target Time result — only when the solve actually had a
                // target set (targetMet is null if Target Time wasn't active).
                // Skipped if a higher-priority category already applies (PB,
                // average trend, DNF, +2), so those keep their own spotlight.
                if (!context.isDNF && !context.isPluTwo && !context.isNewPB
                    && !context.isAverageImproved && !context.isAverageWorsened
                    && lastSolve.targetMet !== null && lastSolve.targetMet !== undefined) {
                    if (lastSolve.targetMet) {
                        context.isTargetSuccess = true;
                    } else {
                        context.isTargetFail = true;
                    }
                }

                // Check if fast or slow (compared to session average)
                if (!context.isDNF && sessionAvg !== null && this.solves.length >= 3) {
                    const currentTime = lastSolve.time + (lastSolve.penalty || 0);
                    if (currentTime < sessionAvg * 0.85) {
                        context.isFast = true;
                    } else if (currentTime > sessionAvg * 1.15) {
                        context.isSlow = true;
                    }
                }

                window.commentary.show(context);
            }

            getBestTime() {
                const validSolves = this.solves.filter(s => !s.dnf);
                if (validSolves.length === 0) return null;
                
                const times = validSolves.map(s => s.time + (s.penalty || 0));
                return Math.min(...times);
            }

            openStatistics() {
                // Update summary stats
                const best = this.getBestTime();
                const bestAo5 = this.getBestAverage(5);
                const bestAo12 = this.getBestAverage(12);
                const bestAo100 = this.getBestAverage(100);
                const sessionAvg = this.calculateSessionAverage();

                document.getElementById('statBestSingle').textContent = best !== null ? this.formatTime(best) : '--';
                document.getElementById('statBestAo5').textContent = bestAo5 !== null ? this.formatTime(bestAo5) : '--';
                document.getElementById('statBestAo12').textContent = bestAo12 !== null ? this.formatTime(bestAo12) : '--';
                document.getElementById('statBestAo100').textContent = bestAo100 !== null ? this.formatTime(bestAo100) : '--';
                document.getElementById('statSessionAvg').textContent = sessionAvg !== null ? this.formatTime(sessionAvg) : '--';
                document.getElementById('statTotalSolves').textContent = this.solves.length;

                // Update detail stats
                const validSolves = this.solves.filter(s => !s.dnf);
                const worst = validSolves.length > 0 ? Math.max(...validSolves.map(s => s.time + (s.penalty || 0))) : null;
                const dnfCount = this.solves.filter(s => s.dnf).length;
                const penaltyCount = this.solves.filter(s => s.penalty).length;

                document.getElementById('detailBestSolve').textContent = best !== null ? this.formatTime(best) : '--';
                document.getElementById('detailWorstSolve').textContent = worst !== null ? this.formatTime(worst) : '--';
                document.getElementById('detailDNFs').textContent = dnfCount;
                document.getElementById('detailPenalties').textContent = penaltyCount;
                document.getElementById('detailMean').textContent = sessionAvg !== null ? this.formatTime(sessionAvg) : '--';

                // Calculate standard deviation
                if (validSolves.length > 1) {
                    const times = validSolves.map(s => s.time + (s.penalty || 0));
                    const mean = times.reduce((a, b) => a + b, 0) / times.length;
                    const variance = times.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) / times.length;
                    const stdDev = Math.sqrt(variance);
                    DOM('detailStdDev').textContent = this.formatTime(stdDev);
                } else {
                    DOM('detailStdDev').textContent = '--';
                }

                // Render charts
                // Reset zoom state on each open so full view is shown
                window.chartZoomState = null;
                this.renderProgressChart();
                this.renderHistogram();
                this.renderTrend();
                this.renderHeatmap();
                this.renderSubsessionStats();
                this.renderPenaltyPie();
                this.renderDisciplinePie();
                this.renderSubsessionPie();

                // Show modal
                DOM('statisticsOverlay').classList.add('visible');
            }

            renderProgressChart() {
                const ctx = document.getElementById('progressChartCanvas').getContext('2d');
                
                // Destroy existing chart if it exists
                if (window.progressChart && typeof window.progressChart.destroy === 'function') {
                    window.progressChart.destroy();
                }

                // Prepare data
                const labels = this.solves.map((_, i) => this.solves.length - i).reverse();
                const singlesData = this.solves.map(s => s.dnf ? null : s.time + (s.penalty || 0)).reverse();
                
                // Calculate rolling averages
                const ao5Data = [];
                const ao12Data = [];
                const ao100Data = [];

                for (let i = 0; i < this.solves.length; i++) {
                    const subset5 = this.solves.slice(Math.max(0, i - 4), i + 1).reverse();
                    const subset12 = this.solves.slice(Math.max(0, i - 11), i + 1).reverse();
                    const subset100 = this.solves.slice(Math.max(0, i - 99), i + 1).reverse();

                    ao5Data.push(subset5.length >= 5 ? this.calculateAverageForSubset(subset5) : null);
                    ao12Data.push(subset12.length >= 12 ? this.calculateAverageForSubset(subset12) : null);
                    ao100Data.push(subset100.length >= 100 ? this.calculateAverageForSubset(subset100) : null);
                }

                ao5Data.reverse();
                ao12Data.reverse();
                ao100Data.reverse();

                const datasets = [];

                if (document.getElementById('toggleSingles').checked) {
                    datasets.push({
                        label: 'Singles',
                        data: singlesData,
                        borderColor: '#60a5fa',
                        backgroundColor: 'rgba(96, 165, 250, 0.1)',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.1,
                        spanGaps: false
                    });
                }

                if (document.getElementById('toggleAo5').checked) {
                    datasets.push({
                        label: 'Ao5',
                        data: ao5Data,
                        borderColor: '#4ade80',
                        backgroundColor: 'rgba(74, 222, 128, 0.1)',
                        borderWidth: 2,
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        tension: 0.3
                    });
                }

                if (document.getElementById('toggleAo12').checked) {
                    datasets.push({
                        label: 'Ao12',
                        data: ao12Data,
                        borderColor: '#fbbf24',
                        backgroundColor: 'rgba(251, 191, 36, 0.1)',
                        borderWidth: 2,
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        tension: 0.3
                    });
                }

                if (document.getElementById('toggleAo100').checked) {
                    datasets.push({
                        label: 'Ao100',
                        data: ao100Data,
                        borderColor: '#a78bfa',
                        backgroundColor: 'rgba(167, 139, 250, 0.1)',
                        borderWidth: 2,
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        tension: 0.3
                    });
                }

                // Zoom state — persists across re-renders (e.g. toggle changes)
                const totalPoints = labels.length;
                if (!window.chartZoomState) {
                    window.chartZoomState = { xMin: 0, xMax: totalPoints - 1 };
                } else {
                    // Clamp to valid range after data change
                    window.chartZoomState.xMin = Math.max(0, Math.min(window.chartZoomState.xMin, totalPoints - 1));
                    window.chartZoomState.xMax = Math.max(window.chartZoomState.xMin + 9, Math.min(window.chartZoomState.xMax, totalPoints - 1));
                }

                const isLight = document.body.classList.contains('light-theme');
                const textColor    = isLight ? '#222222' : '#e8edf4';
                const mutedColor   = isLight ? '#6b7280' : '#a8b4c8';
                const gridColor    = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';

                window.progressChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: datasets
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: {
                            mode: 'index',
                            intersect: false
                        },
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top',
                                labels: {
                                    font: { family: 'Manrope', size: 12 },
                                    color: textColor
                                }
                            },
                            tooltip: {
                                titleFont: { family: 'Manrope', size: 13 },
                                bodyFont:  { family: 'Manrope', size: 12 },
                                callbacks: {
                                    label: (context) => {
                                        let label = context.dataset.label || '';
                                        if (label) label += ': ';
                                        if (context.parsed.y !== null) label += this.formatTime(context.parsed.y);
                                        return label;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                min: window.chartZoomState.xMin,
                                max: window.chartZoomState.xMax,
                                title: {
                                    display: true,
                                    text: 'Solve Number',
                                    font: { family: 'Manrope', size: 12 },
                                    color: textColor
                                },
                                ticks: {
                                    font: { family: 'Manrope' },
                                    color: mutedColor,
                                    maxTicksLimit: 12
                                },
                                grid: { color: gridColor }
                            },
                            y: {
                                title: {
                                    display: true,
                                    text: 'Time (seconds)',
                                    font: { family: 'Manrope', size: 12 },
                                    color: textColor
                                },
                                ticks: {
                                    font: { family: 'Manrope' },
                                    color: mutedColor,
                                    callback: (value) => this.formatTime(value)
                                },
                                grid: { color: gridColor }
                            }
                        }
                    }
                });

                // Init zoom/drag interactions
                this._initChartZoom(totalPoints);

                // Sync reset button state
                this._updateChartResetBtn(totalPoints);

                // Add event listeners to chart toggles
                ['toggleSingles', 'toggleAo5', 'toggleAo12', 'toggleAo100'].forEach(id => {
                    document.getElementById(id).removeEventListener('change', this.renderProgressChart.bind(this));
                    document.getElementById(id).addEventListener('change', this.renderProgressChart.bind(this));
                });
            }

            _updateChartResetBtn(totalPoints) {
                const btn = DOM('chartResetZoom');
                if (!btn) return;
                const isZoomed = window.chartZoomState &&
                    (window.chartZoomState.xMin > 0 || window.chartZoomState.xMax < totalPoints - 1);
                btn.disabled = !isZoomed;
            }

            _applyChartZoom(newMin, newMax, totalPoints) {
                const MIN_WINDOW = Math.min(10, totalPoints);
                newMin = Math.max(0, Math.round(newMin));
                newMax = Math.min(totalPoints - 1, Math.round(newMax));
                // Enforce minimum window size
                if (newMax - newMin < MIN_WINDOW - 1) {
                    const center = (newMin + newMax) / 2;
                    newMin = Math.max(0, Math.round(center - MIN_WINDOW / 2));
                    newMax = Math.min(totalPoints - 1, newMin + MIN_WINDOW - 1);
                }
                window.chartZoomState = { xMin: newMin, xMax: newMax };

                if (window.progressChart) {
                    window.progressChart.options.scales.x.min = newMin;
                    window.progressChart.options.scales.x.max = newMax;
                    window.progressChart.update('none'); // no animation for smooth feel
                }
                this._updateChartResetBtn(totalPoints);
            }

            _initChartZoom(totalPoints) {
                const container = document.getElementById('progressChartContainer');
                if (!container || totalPoints < 2) return;

                // Clean up previous listeners
                if (container._zoomCleanup) container._zoomCleanup();

                // ── Wheel zoom (Ctrl + Wheel) ──
                const onWheel = (e) => {
                    if (!e.ctrlKey) return;
                    e.preventDefault();

                    const chart = window.progressChart;
                    if (!chart) return;

                    const rect = container.getBoundingClientRect();
                    const chartArea = chart.chartArea;

                    // Mouse X relative to chart plot area
                    const mouseX = e.clientX - rect.left - chartArea.left;
                    const plotWidth = chartArea.right - chartArea.left;
                    const ratio = Math.max(0, Math.min(1, mouseX / plotWidth));

                    const { xMin, xMax } = window.chartZoomState;
                    const span = xMax - xMin;

                    // Zoom factor: wheel up = zoom in (smaller span)
                    const direction = e.deltaY < 0 ? -1 : 1;
                    const factor = direction * 0.15;
                    const newSpan = Math.max(9, Math.round(span * (1 + factor)));

                    // Pivot around mouse position
                    const pivot = xMin + ratio * span;
                    let newMin = pivot - ratio * newSpan;
                    let newMax = pivot + (1 - ratio) * newSpan;

                    this._applyChartZoom(newMin, newMax, totalPoints);
                };

                // ── Drag pan ──
                let dragStart = null;
                let dragStartMin = null;
                let dragStartMax = null;

                const onMouseDown = (e) => {
                    if (e.button !== 0) return;
                    const chart = window.progressChart;
                    if (!chart) return;
                    const { xMin, xMax } = window.chartZoomState;
                    // Only enable drag if zoomed in
                    if (xMin === 0 && xMax === totalPoints - 1) return;

                    dragStart = e.clientX;
                    dragStartMin = xMin;
                    dragStartMax = xMax;
                    container.classList.add('dragging');
                    e.preventDefault();
                };

                const onMouseMove = (e) => {
                    if (dragStart === null) return;
                    const chart = window.progressChart;
                    if (!chart) return;

                    const rect = container.getBoundingClientRect();
                    const chartArea = chart.chartArea;
                    const plotWidth = chartArea.right - chartArea.left;
                    const span = dragStartMax - dragStartMin;

                    // Pixels → data units
                    const pxDelta = e.clientX - dragStart;
                    const dataDelta = -(pxDelta / plotWidth) * span;

                    const newMin = dragStartMin + dataDelta;
                    const newMax = dragStartMax + dataDelta;

                    this._applyChartZoom(newMin, newMax, totalPoints);
                };

                const onMouseUp = () => {
                    if (dragStart !== null) {
                        dragStart = null;
                        container.classList.remove('dragging');
                    }
                };

                // Update cursor based on zoom state
                const updateCursor = () => {
                    const { xMin, xMax } = window.chartZoomState || {};
                    const isZoomed = xMin > 0 || xMax < totalPoints - 1;
                    container.classList.toggle('draggable', isZoomed);
                };
                updateCursor();

                // Reset zoom button
                const resetBtn = DOM('chartResetZoom');
                const onReset = () => {
                    window.chartZoomState = { xMin: 0, xMax: totalPoints - 1 };
                    this._applyChartZoom(0, totalPoints - 1, totalPoints);
                    container.classList.remove('draggable');
                };

                container.addEventListener('wheel', onWheel, { passive: false });
                container.addEventListener('mousedown', onMouseDown);
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
                if (resetBtn) resetBtn.addEventListener('click', onReset);

                // ── Touch: pinch-to-zoom + drag ──
                let touchDragStartX = null;
                let touchDragStartMin = null;
                let touchDragStartMax = null;
                let pinchStartDist = null;
                let pinchStartMin = null;
                let pinchStartMax = null;

                const getTouchDist = (t) =>
                    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

                const onTouchStart = (e) => {
                    if (e.touches.length === 2) {
                        // Pinch start
                        pinchStartDist = getTouchDist(e.touches);
                        pinchStartMin = window.chartZoomState.xMin;
                        pinchStartMax = window.chartZoomState.xMax;
                        touchDragStartX = null; // cancel any drag
                        e.preventDefault();
                    } else if (e.touches.length === 1) {
                        const { xMin, xMax } = window.chartZoomState;
                        if (xMin === 0 && xMax === totalPoints - 1) return; // not zoomed
                        touchDragStartX = e.touches[0].clientX;
                        touchDragStartMin = xMin;
                        touchDragStartMax = xMax;
                        e.preventDefault();
                    }
                };

                const onTouchMove = (e) => {
                    const chart = window.progressChart;
                    if (!chart) return;

                    if (e.touches.length === 2 && pinchStartDist !== null) {
                        e.preventDefault();
                        const dist = getTouchDist(e.touches);
                        const scale = pinchStartDist / dist; // >1 = zoom in
                        const span = pinchStartMax - pinchStartMin;
                        const newSpan = Math.max(9, Math.round(span * scale));
                        const center = (pinchStartMin + pinchStartMax) / 2;
                        this._applyChartZoom(center - newSpan / 2, center + newSpan / 2, totalPoints);
                        updateCursor();
                    } else if (e.touches.length === 1 && touchDragStartX !== null) {
                        e.preventDefault();
                        const chartArea = chart.chartArea;
                        const plotWidth = chartArea.right - chartArea.left;
                        const span = touchDragStartMax - touchDragStartMin;
                        const pxDelta = e.touches[0].clientX - touchDragStartX;
                        const dataDelta = -(pxDelta / plotWidth) * span;
                        this._applyChartZoom(touchDragStartMin + dataDelta, touchDragStartMax + dataDelta, totalPoints);
                    }
                };

                const onTouchEnd = (e) => {
                    if (e.touches.length < 2) pinchStartDist = null;
                    if (e.touches.length === 0) touchDragStartX = null;
                };

                container.addEventListener('touchstart', onTouchStart, { passive: false });
                container.addEventListener('touchmove', onTouchMove, { passive: false });
                container.addEventListener('touchend', onTouchEnd, { passive: true });

                // Cleanup function
                container._zoomCleanup = () => {
                    container.removeEventListener('wheel', onWheel);
                    container.removeEventListener('mousedown', onMouseDown);
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    if (resetBtn) resetBtn.removeEventListener('click', onReset);
                    container.removeEventListener('touchstart', onTouchStart);
                    container.removeEventListener('touchmove', onTouchMove);
                    container.removeEventListener('touchend', onTouchEnd);
                };
            }

            renderHistogram() {
                const ctx = document.getElementById('histogramCanvas').getContext('2d');
                
                // Destroy existing chart if it exists
                if (window.histogramChart && typeof window.histogramChart.destroy === 'function') {
                    window.histogramChart.destroy();
                }

                const validSolves = this.solves.filter(s => !s.dnf);
                if (validSolves.length === 0) {
                    return;
                }

                const times = validSolves.map(s => s.time + (s.penalty || 0));
                const min = Math.floor(Math.min(...times));
                const max = Math.ceil(Math.max(...times));
                
                // Create bins with 1 second intervals
                const binSize = 1;
                const binCount = Math.min(max - min + 1, 25);
                const bins = Array(binCount).fill(0);
                const labels = [];

                for (let i = 0; i < binCount; i++) {
                    const start = min + i * binSize;
                    const end = start + binSize - 0.01;
                    labels.push(`${start.toFixed(0)}-${end.toFixed(0)}s`);
                }

                times.forEach(time => {
                    const binIndex = Math.min(Math.floor(time - min), binCount - 1);
                    bins[binIndex]++;
                });

                window.histogramChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Solves',
                            data: bins,
                            backgroundColor: '#4a9eff',
                            borderColor: '#3a8eef',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                titleFont: {
                                    family: 'Manrope'
                                },
                                bodyFont: {
                                    family: 'Manrope'
                                }
                            }
                        },
                        scales: {
                            x: {
                                ticks: {
                                    font: {
                                        family: 'Manrope',
                                        size: 10
                                    },
                                    color: document.body.classList.contains('light-theme') ? '#6b7280' : '#a8b4c8'
                                },
                                grid: {
                                    display: false
                                }
                            },
                            y: {
                                ticks: {
                                    font: {
                                        family: 'Manrope'
                                    },
                                    color: document.body.classList.contains('light-theme') ? '#6b7280' : '#a8b4c8',
                                    stepSize: 1
                                },
                                grid: {
                                    color: document.body.classList.contains('light-theme') ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'
                                }
                            }
                        }
                    }
                });
            }

            // Shared helper for the three pie/doughnut charts below. `entries` is
            // [{label, value, color}]; zero-value entries are dropped so the chart
            // and legend only ever show categories that actually occurred.
            _renderPieChart(canvasId, legendId, chartVarKey, entries) {
                const canvasEl = document.getElementById(canvasId);
                const legendEl = document.getElementById(legendId);
                if (!canvasEl) return;

                if (window[chartVarKey] && typeof window[chartVarKey].destroy === 'function') {
                    window[chartVarKey].destroy();
                }

                const filtered = entries.filter(e => e.value > 0);
                const total = filtered.reduce((sum, e) => sum + e.value, 0);

                if (total === 0) {
                    if (legendEl) legendEl.innerHTML = '';
                    return;
                }

                const ctx = canvasEl.getContext('2d');
                window[chartVarKey] = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: filtered.map(e => e.label),
                        datasets: [{
                            data: filtered.map(e => e.value),
                            backgroundColor: filtered.map(e => e.color),
                            borderColor: document.body.classList.contains('light-theme') ? '#ffffff' : '#141928',
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '62%',
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                titleFont: { family: 'Manrope' },
                                bodyFont: { family: 'Manrope' },
                                callbacks: {
                                    label: (ctx) => {
                                        const pct = Math.round((ctx.parsed / total) * 100);
                                        return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                                    }
                                }
                            }
                        }
                    }
                });

                if (legendEl) {
                    legendEl.innerHTML = filtered.map(e => {
                        const pct = Math.round((e.value / total) * 100);
                        return `
                            <div class="pie-chart-legend-item">
                                <span class="pie-chart-legend-dot" style="background:${e.color}"></span>
                                <span>${e.label}</span>
                                <span class="pie-chart-legend-value">${e.value} (${pct}%)</span>
                            </div>
                        `;
                    }).join('');
                }
            }

            // Chart 1: how many solves were clean vs +2 vs DNF, current session.
            renderPenaltyPie() {
                const t = (isRu())
                    ? window.translations?.ru : window.translations?.en;

                let clean = 0, plusTwo = 0, dnf = 0;
                for (const s of this.solves) {
                    if (s.dnf) dnf++;
                    else if (s.penalty) plusTwo++;
                    else clean++;
                }

                this._renderPieChart('penaltyPieCanvas', 'penaltyPieLegend', 'penaltyPieChart', [
                    { label: t?.pieClean || 'Clean', value: clean, color: '#22c55e' },
                    { label: t?.piePlusTwo || '+2', value: plusTwo, color: '#f59e0b' },
                    { label: t?.pieDnf || 'DNF', value: dnf, color: '#ef4444' }
                ]);
            }

            // Chart 2: how many solves went to each puzzle/discipline, across ALL
            // sessions (a session is one discipline, so this aggregates session solve
            // counts grouped by each session's discipline).
            renderDisciplinePie() {
                const disciplineColors = {
                    '3x3': '#4a9eff', '2x2': '#22c55e', '4x4': '#f59e0b', '5x5': '#ef4444',
                    '6x6': '#a855f7', '7x7': '#ec4899', 'pyraminx': '#14b8a6',
                    'skewb': '#eab308', 'megaminx': '#f97316'
                };

                const counts = {};
                for (const key of Object.keys(this.sessions)) {
                    const session = this.sessions[key];
                    const disc = session.discipline || '3x3';
                    counts[disc] = (counts[disc] || 0) + (session.solves ? session.solves.length : 0);
                }

                const entries = Object.entries(counts).map(([disc, count]) => ({
                    label: disc,
                    value: count,
                    color: disciplineColors[disc] || '#8899aa'
                }));

                const block = document.getElementById('disciplinePieBlock');
                const hasMultiple = entries.filter(e => e.value > 0).length > 0;
                if (block) block.style.display = hasMultiple ? '' : 'none';

                this._renderPieChart('disciplinePieCanvas', 'disciplinePieLegend', 'disciplinePieChart', entries);
            }

            // Chart 3: how many of the current session's solves fall into each
            // subsession (reusing each subsession's own color), plus a remainder
            // slice for solves that aren't tagged into any subsession at all.
            renderSubsessionPie() {
                const session = this.sessions[this.currentSessionId];
                const subsessions = session?.subsessions || [];
                const block = document.getElementById('subsessionPieBlock');
                if (!block) return;

                if (subsessions.length === 0) {
                    block.style.display = 'none';
                    return;
                }
                block.style.display = '';

                const t = (isRu())
                    ? window.translations?.ru : window.translations?.en;

                const taggedIds = new Set(subsessions.flatMap(ss => ss.solveIds));
                const entries = subsessions.map(ss => ({
                    label: ss.name,
                    value: ss.solveIds.length,
                    color: ss.color
                }));

                const untagged = (session.solves || []).filter(s => !taggedIds.has(s.id)).length;
                entries.push({
                    label: t?.pieRegularSolves || 'Regular',
                    value: untagged,
                    color: '#5b6478'
                });

                this._renderPieChart('subsessionPieCanvas', 'subsessionPieLegend', 'subsessionPieChart', entries);
            }

            renderTrend() {
                const validSolves = this.solves.filter(s => !s.dnf).map(s => s.time + (s.penalty || 0));
                const arrowEl   = document.getElementById('trendArrow');
                const percentEl = document.getElementById('trendPercent');
                const labelEl   = document.getElementById('trendLabel');
                const firstEl   = document.getElementById('trendFirst');
                const lastEl    = document.getElementById('trendLast');
                const firstLblEl = document.querySelector('.trend-compare-item:first-child .trend-compare-label');
                const lastLblEl  = document.querySelector('.trend-compare-item:last-child .trend-compare-label');

                const t = (isRu())
                    ? window.translations?.ru : window.translations?.en;

                if (!arrowEl) return;

                if (validSolves.length < 20) {
                    arrowEl.textContent = '→';
                    arrowEl.className = 'trend-arrow flat';
                    percentEl.textContent = '—';
                    percentEl.className = 'trend-percent flat';
                    const need = 20 - validSolves.length;
                    labelEl.textContent = t?.trendNeedMore?.replace('{n}', need) || `Need ${need} more solves`;
                    firstEl.textContent = '—';
                    lastEl.textContent  = '—';
                    return;
                }

                const n = Math.min(50, Math.floor(validSolves.length / 2));
                const recentTimes = validSolves.slice(0, n);
                const olderTimes  = validSolves.slice(validSolves.length - n);

                const avgRecent = recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length;
                const avgOlder  = olderTimes.reduce((a, b) => a + b, 0) / olderTimes.length;

                const diff   = avgOlder - avgRecent;
                const pct    = Math.abs(diff / avgOlder * 100);
                const pctStr = pct.toFixed(1) + '%';

                if (firstLblEl) firstLblEl.textContent = t?.trendFirst?.replace('{n}', n) || `First ${n} avg`;
                if (lastLblEl)  lastLblEl.textContent  = t?.trendLast?.replace('{n}', n)  || `Last ${n} avg`;

                firstEl.textContent = this.formatTime(avgOlder);
                lastEl.textContent  = this.formatTime(avgRecent);

                if (pct < 0.5) {
                    arrowEl.textContent = '→';
                    arrowEl.className = 'trend-arrow flat';
                    percentEl.textContent = '~0%';
                    percentEl.className = 'trend-percent flat';
                    labelEl.textContent = t?.trendStable || 'Stable pace';
                } else if (diff > 0) {
                    arrowEl.textContent = '↑';
                    arrowEl.className = 'trend-arrow up';
                    percentEl.textContent = `−${pctStr}`;
                    percentEl.className = 'trend-percent up';
                    labelEl.textContent = `${pctStr} ${t?.trendFaster || 'faster vs earlier'} ${n}`;
                } else {
                    arrowEl.textContent = '↓';
                    arrowEl.className = 'trend-arrow down';
                    percentEl.textContent = `+${pctStr}`;
                    percentEl.className = 'trend-percent down';
                    labelEl.textContent = `${pctStr} ${t?.trendSlower || 'slower vs earlier'} ${n}`;
                }
            }

            renderHeatmap() {
                const ctx = document.getElementById('heatmapCanvas');
                if (!ctx) return;

                if (window.heatmapChart && typeof window.heatmapChart.destroy === 'function') {
                    window.heatmapChart.destroy();
                }

                const settings = window.settingsManager ? window.settingsManager.settings : {};
                const offset   = settings.timeOffset || 0;
                const clockFmt = settings.clockFormat || '24';

                // Build hourly buckets
                const hourBuckets = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }));

                this.solves.forEach(s => {
                    if (s.dnf || !s.timestamp) return;
                    const d = new Date(s.timestamp + offset * 3600000);
                    const h = d.getHours();
                    hourBuckets[h].sum   += s.time + (s.penalty || 0);
                    hourBuckets[h].count += 1;
                });

                const avgs   = hourBuckets.map(b => b.count >= 1 ? b.sum / b.count : null);
                const counts = hourBuckets.map(b => b.count);

                // Only show hours that have data, min 0..23 range labels
                const labels = Array.from({ length: 24 }, (_, h) => {
                    if (clockFmt === '12') {
                        const h12 = h % 12 || 12;
                        return h === 0 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h12} AM` : `${h12} PM`;
                    }
                    return String(h).padStart(2, '0') + ':00';
                });

                // Colour bars by avg time: green = fastest, red = slowest
                const validAvgs = avgs.filter(v => v !== null);
                const minAvg = validAvgs.length ? Math.min(...validAvgs) : 1;
                const maxAvg = validAvgs.length ? Math.max(...validAvgs) : 1;

                const barColors = avgs.map(v => {
                    if (v === null) return 'rgba(255,255,255,0.04)';
                    const t = maxAvg === minAvg ? 0.5 : (v - minAvg) / (maxAvg - minAvg);
                    // green (#4ade80) → yellow (#fbbf24) → red (#f87171)
                    const r = t < 0.5 ? Math.round(74 + (251 - 74) * t * 2)   : Math.round(251 + (248 - 251) * (t - 0.5) * 2);
                    const g = t < 0.5 ? Math.round(222 + (191 - 222) * t * 2) : Math.round(191 + (113 - 191) * (t - 0.5) * 2);
                    const b = t < 0.5 ? Math.round(128 + (36 - 128) * t * 2)  : Math.round(36 + (113 - 36) * (t - 0.5) * 2);
                    return `rgba(${r},${g},${b},0.85)`;
                });

                const isLight  = document.body.classList.contains('light-theme');
                const tickClr  = isLight ? '#6b7280' : '#a8b4c8';
                const gridClr  = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
                const fmt      = this; // for formatTime in tooltip

                window.heatmapChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Avg time',
                            data: avgs,
                            backgroundColor: barColors,
                            borderColor: barColors,
                            borderWidth: 0,
                            borderRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                titleFont: { family: 'Manrope', size: 12 },
                                bodyFont:  { family: 'Manrope', size: 12 },
                                callbacks: {
                                    title: (items) => labels[items[0].dataIndex],
                                    label: (item) => {
                                        const idx = item.dataIndex;
                                        if (avgs[idx] === null) return 'No solves';
                                        return `Avg: ${fmt.formatTime(avgs[idx])}  ·  ${counts[idx]} solve${counts[idx] !== 1 ? 's' : ''}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                ticks: {
                                    font: { family: 'Manrope', size: 9 },
                                    color: tickClr,
                                    maxRotation: 45,
                                    minRotation: 0,
                                    autoSkip: true,
                                    maxTicksLimit: 12
                                },
                                grid: { display: false }
                            },
                            y: {
                                ticks: {
                                    font: { family: 'Manrope', size: 10 },
                                    color: tickClr,
                                    callback: (v) => fmt.formatTime(v)
                                },
                                grid: { color: gridClr }
                            }
                        }
                    }
                });

                // Update hint
                const hint = document.getElementById('heatmapHint');
                if (hint) {
                    const t = (isRu())
                        ? window.translations?.ru : window.translations?.en;
                    const best = avgs.reduce((bestH, v, h) => v !== null && (bestH === -1 || v < avgs[bestH]) ? h : bestH, -1);
                    if (best !== -1) {
                        const bestLabel = t?.heatmapBestHour || 'Best hour';
                        hint.textContent = `${bestLabel}: ${labels[best]} (avg ${fmt.formatTime(avgs[best])})`;
                    } else {
                        hint.textContent = t?.heatmapHint || 'Shows your average solve time by hour of day';
                    }
                }
            }

            openSessions() {
                DOM('shopConfirmOverlay')?.classList.remove('visible');
                DOM('shopOverlay')?.classList.remove('visible');
                DOM('progressionOverlay')?.classList.remove('visible');
                DOM('sessionsOverlay')?.classList.add('visible');
                try { this.renderSessionsList(); }
                catch (error) { console.error('Could not render sessions list:', error); }
                try { this.updateSessionDetails(); }
                catch (error) { console.error('Could not render session details:', error); }

                // Setup session action buttons
                document.getElementById('newSessionBtn').onclick = () => this.createNewSession();
                DOM('renameSessionBtn').onclick = () => this.renameSession();
                document.getElementById('resetSessionBtn').onclick = () => this.resetCurrentSession();
                DOM('deleteSessionBtn').onclick = () => this.deleteCurrentSession();
                document.getElementById('exportSessionBtn').onclick = () => this.exportSessionCSV();
                
                // Setup solve history click handler
                const solvesElement = DOM('sessionSolves');
                if (solvesElement) {
                    solvesElement.classList.add('clickable');
                    solvesElement.onclick = () => this.openSolveHistory();
                }
                
                // Setup close solve history button
                const closeSolveHistory = document.getElementById('closeSolveHistory');
                if (closeSolveHistory) {
                    closeSolveHistory.onclick = () => {
                        this.closeSolveHistory();
                        // Reset keyboard nav focus level back to session list
                        if (window.hotkeyManager) {
                            window.hotkeyManager.sessionsFocus = 'list';
                            window.hotkeyManager.solveHistoryIndex = -1;
                            window.hotkeyManager._clearAllFocus();
                            // Re-focus the active session item
                            setTimeout(() => {
                                const items = window.hotkeyManager._getSessionItems();
                                const activeIdx = items.findIndex(i => i.classList.contains('active'));
                                window.hotkeyManager.sessionListIndex = activeIdx >= 0 ? activeIdx : 0;
                                if (window.hotkeyManager.kbNavActive) {
                                    window.hotkeyManager._focusSessionItem(window.hotkeyManager.sessionListIndex);
                                }
                            }, 50);
                        }
                    };
                }
            }

            openSolveHistory() {
                const session = this.sessions[this.currentSessionId];
                if (!session) return;
                
                this.populateSolveHistory();
                DOM('solveHistorySection').style.display = 'flex';
            }

            closeSolveHistory() {
                DOM('solveHistorySection').style.display = 'none';
            }

            populateSolveHistory() {
                const session = this.sessions[this.currentSessionId];
                if (!session) return;

                const tbody = document.getElementById('solveHistoryTableBody');
                tbody.innerHTML = '';

                const subsessions = session.subsessions || [];

                // Build lookup: solveId → subsession
                const solveSubMap = new Map();
                subsessions.forEach(ss => {
                    ss.solveIds.forEach(sid => solveSubMap.set(sid, ss));
                });

                // Track which subsession labels we've already inserted
                const insertedLabels = new Set();

                session.solves.forEach((solve, index) => {
                    const ss = solveSubMap.get(solve.id);

                    // Insert subsession label row (once per subsession, at first occurrence)
                    if (ss && !insertedLabels.has(ss.id)) {
                        insertedLabels.add(ss.id);
                        const labelRow = document.createElement('tr');
                        labelRow.classList.add('sh-subsession-label-row');
                        labelRow.style.setProperty('--ss-color', ss.color);
                        labelRow.innerHTML = `<td colspan="6">${ss.name}${ss.excludeFromAvg ? ' · excluded' : ''}</td>`;
                        tbody.appendChild(labelRow);
                    }

                    const row = document.createElement('tr');
                    row.dataset.index = index;
                    row.dataset.solveId = solve.id || index;

                    if (ss) {
                        row.classList.add('sh-in-subsession');
                        row.style.setProperty('--ss-color', ss.color);
                        if (ss.excludeFromAvg) row.classList.add('sh-excluded');
                    }

                    const solveNumber = session.solves.length - index;

                    const ao5 = (index + 5 <= session.solves.length)
                        ? this.calculateAverageForSubset(session.solves.slice(index, index + 5)) : null;
                    const ao12 = (index + 12 <= session.solves.length)
                        ? this.calculateAverageForSubset(session.solves.slice(index, index + 12)) : null;
                    const ao100 = (index + 100 <= session.solves.length)
                        ? this.calculateAverageForSubset(session.solves.slice(index, index + 100)) : null;

                    let timeDisplay = this.formatTime(solve.time);
                    if (solve.dnf) {
                        timeDisplay = 'DNF(' + timeDisplay + ')';
                    } else if (solve.penalty) {
                        timeDisplay += '+2';
                    }

                    const targetClass = solve.targetMet === true ? 'sh-target-met'
                        : solve.targetMet === false ? 'sh-target-missed' : '';

                    const honestLocked = this._isSolveHonestLocked(session, solve);
                    const dailyChallengeBadge = solve.dailyChallenge
                        ? `<span class="solve-daily-challenge-badge">\u{1F4C5} ${this._dailyChallengeTranslations().dailyChallengeActive}</span>`
                        : '';
                    const deleteBtnHtml = honestLocked
                        ? `<button class="solve-action-btn delete" data-index="${index}" data-action="delete" disabled title="Locked by Honest Mode">🔒</button>`
                        : `<button class="solve-action-btn delete" data-index="${index}" data-action="delete">Delete</button>`;

                    row.innerHTML = `
                        <td>${solveNumber}</td>
                        <td><strong class="${targetClass}">${timeDisplay}</strong></td>
                        <td>${ao5 !== null ? this.formatTime(ao5) : '–'}</td>
                        <td>${ao12 !== null ? this.formatTime(ao12) : '–'}</td>
                        <td>${ao100 !== null ? this.formatTime(ao100) : '–'}</td>
                        <td>
                            ${dailyChallengeBadge}
                            <span class="solve-scramble">${solve.scramble || 'No scramble'}</span>
                            <div class="solve-actions">
                                ${deleteBtnHtml}
                                <button class="solve-action-btn penalty" data-index="${index}" data-action="penalty">+2</button>
                                <button class="solve-action-btn dnf" data-index="${index}" data-action="dnf">DNF</button>
                            </div>
                        </td>
                    `;

                    tbody.appendChild(row);
                });

                // ── Selection logic ──
                let lastSelectedIndex = null;
                this._selectedSolveIndices = new Set();

                tbody.querySelectorAll('tr[data-index]').forEach(row => {
                    row.addEventListener('click', (e) => {
                        if (e.target.closest('.solve-action-btn')) return;
                        const idx = parseInt(row.dataset.index);
                        if (e.shiftKey && lastSelectedIndex !== null) {
                            // Range select — add to existing selection
                            const min = Math.min(idx, lastSelectedIndex);
                            const max = Math.max(idx, lastSelectedIndex);
                            tbody.querySelectorAll('tr[data-index]').forEach(r => {
                                const i = parseInt(r.dataset.index);
                                if (i >= min && i <= max) {
                                    r.classList.add('sh-selected');
                                    this._selectedSolveIndices.add(i);
                                }
                            });
                            lastSelectedIndex = idx;
                        } else {
                            // Single click — toggle only this row, keep others
                            if (row.classList.contains('sh-selected')) {
                                row.classList.remove('sh-selected');
                                this._selectedSolveIndices.delete(idx);
                            } else {
                                row.classList.add('sh-selected');
                                this._selectedSolveIndices.add(idx);
                                lastSelectedIndex = idx;
                            }
                        }
                    });
                });

                // ── Context menu ──
                tbody.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    if (this._selectedSolveIndices.size < 2) return;
                    const menu = DOM('shContextMenu');
                    menu.style.display = 'block';
                    menu.style.left = e.pageX + 'px';
                    menu.style.top  = e.pageY + 'px';
                });

                // ── Action buttons ──
                tbody.querySelectorAll('.solve-action-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const index = parseInt(e.target.dataset.index);
                        const action = e.target.dataset.action;
                        if (action === 'delete') this.deleteSolveFromHistory(index);
                        else if (action === 'penalty') this.togglePenaltyFromHistory(index);
                        else if (action === 'dnf')     this.toggleDNFFromHistory(index);
                    });
                });
            }

            // ─── Mouse Start & Hide UI ────────────────────────
            _applyMouseStartMode() {
                const s = window.settingsManager?.settings;
                const mouseStart = s?.mouseStart || false;

                // NOTE: the clickable area is `.center-column` (same element used for
                // touch start/stop below) — there is no #timerContainer in the DOM,
                // which was the reason this never fired before.
                const tc = document.querySelector('.center-column');
                if (!tc) return;

                // Remove any previously bound mouse handlers
                if (this._mouseStartDownHandler) {
                    tc.removeEventListener('mousedown', this._mouseStartDownHandler);
                    tc.removeEventListener('mouseup', this._mouseStartUpHandler);
                    tc.removeEventListener('mouseleave', this._mouseStartLeaveHandler);
                    this._mouseStartDownHandler = null;
                    this._mouseStartUpHandler = null;
                    this._mouseStartLeaveHandler = null;
                }

                if (mouseStart) {
                    // Reuse the exact same state machine as spacebar/touch so hold delay,
                    // "ready" color, inspection and hide-UI all behave identically.
                    this._mouseHolding = false;

                    this._mouseStartDownHandler = (e) => {
                        if (e.button !== 0) return; // left click only
                        if (e.target.closest('.target-time-btn, button, a, select, input')) return;
                        e.preventDefault();
                        this._mouseHolding = true;
                        this.handleSpaceDown();
                    };

                    this._mouseStartUpHandler = (e) => {
                        if (!this._mouseHolding) return;
                        e.preventDefault();
                        this._mouseHolding = false;
                        this.handleSpaceUp();
                    };

                    this._mouseStartLeaveHandler = () => {
                        // Mouse left the area mid-hold without releasing: treat like a
                        // release so we don't get stuck in a "holding" state.
                        if (this._mouseHolding && !this.isRunning) {
                            this._mouseHolding = false;
                            this.handleSpaceUp();
                        }
                    };

                    tc.addEventListener('mousedown', this._mouseStartDownHandler);
                    tc.addEventListener('mouseup', this._mouseStartUpHandler);
                    tc.addEventListener('mouseleave', this._mouseStartLeaveHandler);
                    tc.style.cursor = 'pointer';
                } else {
                    tc.style.cursor = '';
                }

                // Keep the on-screen hint ("Space..." vs "Click...") in sync
                if (window.settingsManager) {
                    window.settingsManager.applyTranslations();
                }
            }

            _setHideUiActive(active) {
                const elements = [
                    document.querySelector('.left-column'),
                    document.querySelector('.right-column'),
                    document.querySelector('.scramble-section'),
                    document.querySelector('.bottom-controls'),
                    document.querySelector('.commentary-box'),
                    document.querySelector('.app-header'),
                ].filter(Boolean);

                elements.forEach(el => {
                    if (active) {
                        el.style.opacity = '0';
                        el.style.pointerEvents = 'none';
                        el.style.transition = 'opacity 0.25s ease';
                    } else {
                        el.style.opacity = '';
                        el.style.pointerEvents = '';
                    }
                });
            }

            initSubsessionUI() {
                // Close context menu on outside click
                document.addEventListener('click', (e) => {
                    const menu = DOM('shContextMenu');
                    if (menu && !menu.contains(e.target)) menu.style.display = 'none';
                });

                // Context menu → open modal
                document.getElementById('shContextAddSubsession')?.addEventListener('click', () => {
                    DOM('shContextMenu').style.display = 'none';
                    this._openSubsessionModal();
                });

                // Color picker
                document.getElementById('subsessionColors')?.addEventListener('click', (e) => {
                    const btn = e.target.closest('.subsession-color-btn');
                    if (!btn) return;
                    document.querySelectorAll('.subsession-color-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });

                // Close / Cancel
                const closeModal = () => {
                    DOM('subsessionOverlay').style.display = 'none';
                };
                document.getElementById('subsessionModalClose')?.addEventListener('click', closeModal);
                document.getElementById('subsessionCancelBtn')?.addEventListener('click', closeModal);
                DOM('subsessionOverlay')?.addEventListener('click', (e) => {
                    if (e.target === DOM('subsessionOverlay')) closeModal();
                });

                // Create
                document.getElementById('subsessionCreateBtn')?.addEventListener('click', () => {
                    this._createSubsession();
                });

                // Enter key in name input
                DOM('subsessionNameInput')?.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') this._createSubsession();
                });
            }

            _openSubsessionModal() {
                const count = this._selectedSolveIndices?.size || 0;
                if (count < 2) return;

                // Reset modal state
                DOM('subsessionNameInput').value = '';
                DOM('subsessionExcludeToggle').checked = false;
                document.querySelectorAll('.subsession-color-btn').forEach((b, i) => {
                    b.classList.toggle('active', i === 0);
                });
                document.getElementById('subsessionSelectedInfo').textContent =
                    `${count} solve${count !== 1 ? 's' : ''} selected`;

                DOM('subsessionOverlay').style.display = 'flex';
                setTimeout(() => DOM('subsessionNameInput').focus(), 50);
            }

            _createSubsession() {
                const session = this.sessions[this.currentSessionId];
                if (!session) return;

                const name = DOM('subsessionNameInput').value.trim()
                    || `Subsession ${(session.subsessions?.length || 0) + 1}`;
                const color = document.querySelector('.subsession-color-btn.active')?.dataset.color || '#4a9eff';
                const excludeFromAvg = DOM('subsessionExcludeToggle').checked;

                // Ensure solves have stable IDs (same formula as migration in loadSessions)
                session.solves.forEach((s, i) => {
                    if (!s.id) s.id = `s_${s.timestamp || i}_${i}`;
                });
                const selectedIndices = Array.from(this._selectedSolveIndices || []);
                const solveIds = selectedIndices.map(i => session.solves[i].id);

                if (!session.subsessions) session.subsessions = [];
                session.subsessions.push({
                    id: `ss_${Date.now()}`,
                    name,
                    color,
                    excludeFromAvg,
                    solveIds
                });

                this.saveSessions();
                DOM('subsessionOverlay').style.display = 'none';
                this._selectedSolveIndices = new Set();
                this.populateSolveHistory();
                this.renderSubsessionStats();
                this.renderSubsessionPie();
                // Recalculate averages immediately (exclude takes effect right away)
                this.updateUI();
            }

            // ════════════════════════════════════════
            //  EXPORT IMAGE
            // ════════════════════════════════════════

            initExportImageUI() {
                this._exportFormat   = 'story';
                this._exportSessionId = null; // null = current session

                DOM('exportImageBtn')?.addEventListener('click', () => {
                    this._openExportImageModal();
                });

                const closeModal = () => {
                    DOM('exportImgOverlay').style.display = 'none';
                };
                document.getElementById('exportImgClose')?.addEventListener('click', closeModal);
                document.getElementById('exportImgCancelBtn')?.addEventListener('click', closeModal);
                DOM('exportImgOverlay')?.addEventListener('click', (e) => {
                    if (e.target === DOM('exportImgOverlay')) closeModal();
                });

                document.querySelectorAll('.export-format-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        document.querySelectorAll('.export-format-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        this._exportFormat = btn.dataset.format;
                        this._drawExportCard();
                    });
                });

                ['exportOptBest','exportOptTrend','exportOptCount','exportOptDiscipline'].forEach(id => {
                    document.getElementById(id)?.addEventListener('change', () => this._drawExportCard());
                });

                DOM('exportSessionSelect')?.addEventListener('change', (e) => {
                    this._exportSessionId = e.target.value;
                    this._drawExportCard();
                });

                DOM('exportImgDownloadBtn')?.addEventListener('click', () => {
                    this._downloadExportCard();
                });
            }

            _openExportImageModal() {
                // Populate session dropdown
                const sel = DOM('exportSessionSelect');
                if (sel) {
                    sel.innerHTML = '';
                    Object.values(this.sessions).forEach(s => {
                        const opt = document.createElement('option');
                        opt.value = s.id;
                        opt.textContent = `${s.name} (${s.solves.length} solves)`;
                        if (s.id === this.currentSessionId) opt.selected = true;
                        sel.appendChild(opt);
                    });
                    this._exportSessionId = this.currentSessionId;
                }
                DOM('exportImgOverlay').style.display = 'flex';
                this._drawExportCard();
            }

            _computeTrendData() {
                const validSolves = this.solves.filter(s => !s.dnf).map(s => s.time + (s.penalty || 0));
                if (validSolves.length < 20) return null;

                const n = Math.min(50, Math.floor(validSolves.length / 2));
                const recentTimes = validSolves.slice(0, n);
                const olderTimes  = validSolves.slice(validSolves.length - n);
                const avgRecent = recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length;
                const avgOlder  = olderTimes.reduce((a, b) => a + b, 0) / olderTimes.length;
                const diff = avgOlder - avgRecent;
                const pct  = Math.abs(diff / avgOlder * 100);

                return {
                    pct: pct.toFixed(1),
                    direction: pct < 0.5 ? 'flat' : (diff > 0 ? 'up' : 'down'),
                    n
                };
            }

            _drawExportCard() {
                const canvas = DOM('exportImgCanvas');
                if (!canvas) return;
                const ctx = canvas.getContext('2d');

                const dims = {
                    story: { w: 1080, h: 1920 },
                    post:  { w: 1080, h: 1080 },
                    wide:  { w: 1920, h: 1080 }
                };
                const { w, h } = dims[this._exportFormat] || dims.story;
                canvas.width = w; canvas.height = h;

                const includeBest       = document.getElementById('exportOptBest')?.checked       ?? true;
                const includeTrend      = document.getElementById('exportOptTrend')?.checked      ?? true;
                const includeCount      = document.getElementById('exportOptCount')?.checked      ?? true;
                const includeDiscipline = document.getElementById('exportOptDiscipline')?.checked ?? true;

                const sid     = this._exportSessionId || this.currentSessionId;
                const session = this.sessions[sid] || this.sessions[this.currentSessionId];
                const solves  = session?.solves || [];

                const disciplineLabel = ScrambleGenerator.getLabel(session?.discipline || '3x3');
                const totalSolves     = solves.length;
                const excl = new Set((session?.subsessions||[]).filter(ss=>ss.excludeFromAvg).flatMap(ss=>ss.solveIds));
                const validTimes = solves.filter(s=>!s.dnf&&!excl.has(s.id)).map(s=>s.time+(s.penalty||0));
                const best = validTimes.length ? Math.min(...validTimes) : null;

                const calcAo = (n) => {
                    const el = validTimes.slice(0,n);
                    if (el.length < n) return null;
                    const sorted = [...el].sort((a,b)=>a-b).slice(1,-1);
                    return sorted.reduce((a,b)=>a+b,0)/sorted.length;
                };
                const ao5 = calcAo(5), ao12 = calcAo(12);

                const trendData = (() => {
                    if (validTimes.length < 20) return null;
                    const n2 = Math.min(50, Math.floor(validTimes.length/2));
                    const recent = validTimes.slice(0,n2), older = validTimes.slice(validTimes.length-n2);
                    const avgR = recent.reduce((a,b)=>a+b,0)/recent.length;
                    const avgO = older.reduce((a,b)=>a+b,0)/older.length;
                    const diff = avgO-avgR, pct = Math.abs(diff/avgO*100);
                    return { pct:pct.toFixed(1), direction:pct<0.5?'flat':(diff>0?'up':'down') };
                })();

                const lang = isRu() ? 'ru-RU' : 'en-US';
                const dateStr = new Date().toLocaleDateString(lang,{year:'numeric',month:'long',day:'numeric'});
                const sparkData = [...solves].reverse().filter(s=>!s.dnf).map(s=>s.time+(s.penalty||0));

                const cards = [];
                if (includeBest) {
                    cards.push({label:'BEST SINGLE', value:best!==null?this.formatTime(best):'—', color:'#3b6ea5'});
                    cards.push({label:'CURRENT AO5', value:ao5!==null?this.formatTime(ao5):'—',   color:'#b07d28'});
                }
                if (includeTrend && trendData) {
                    const sign = trendData.direction==='up'?'−':trendData.direction==='down'?'+':'~';
                    cards.push({label:'TREND', value:`${sign}${trendData.pct}%`,
                        color:trendData.direction==='up'?'#4c8c5a':trendData.direction==='down'?'#b65454':'#8a8170'});
                } else if (includeBest && ao12!==null) {
                    cards.push({label:'BEST AO12', value:this.formatTime(ao12), color:'#5a8c5e'});
                }
                if (includeCount) cards.push({label:'SOLVES', value:String(totalSolves), color:'#7c5ca5'});
                const finalCards = cards.slice(0,4);

                this._exportWoodBg(ctx,w,h);

                if (this._exportFormat==='wide') {
                    this._exportWide(ctx,w,h,{disciplineLabel,dateStr,includeDiscipline,includeTrend,finalCards,sparkData});
                } else {
                    this._exportVertical(ctx,w,h,{disciplineLabel,dateStr,includeDiscipline,includeTrend,finalCards,sparkData});
                }
            }

            _exportWoodBg(ctx,w,h) {
                const bg=ctx.createLinearGradient(0,0,w,h);
                bg.addColorStop(0,'#5c3d1e'); bg.addColorStop(0.35,'#4a2f12');
                bg.addColorStop(0.65,'#5c3d1e'); bg.addColorStop(1,'#3d2409');
                ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
                ctx.save(); ctx.globalAlpha=0.18;
                for(let i=0;i<55;i++){
                    const x0=Math.random()*w; let cx=x0;
                    ctx.beginPath(); ctx.moveTo(x0,0);
                    for(let seg=0;seg<8;seg++){cx+=(Math.random()-.5)*28;ctx.lineTo(cx,h/8*seg);}
                    ctx.strokeStyle=Math.random()>.5?'#2a1505':'#7a5228';
                    ctx.lineWidth=Math.random()*3+0.5; ctx.stroke();
                }
                ctx.globalAlpha=0.055;
                for(let i=0;i<2000;i++){
                    ctx.fillStyle=Math.random()>.5?'#000':'#fff';
                    ctx.fillRect(Math.random()*w,Math.random()*h,1.5,1.5);
                }
                ctx.restore();
                const vig=ctx.createRadialGradient(w/2,h/2,h*0.2,w/2,h/2,h*0.85);
                vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,0,0,0.45)');
                ctx.fillStyle=vig; ctx.fillRect(0,0,w,h);
            }

            _exportPaper(ctx,x,y,w,h,angle=0) {
                ctx.save();
                ctx.translate(x+w/2,y+h/2); ctx.rotate(angle);
                const ox=-w/2,oy=-h/2;
                ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=28; ctx.shadowOffsetX=5; ctx.shadowOffsetY=10;
                this._roundRect(ctx,ox,oy,w,h,8);
                const pg=ctx.createLinearGradient(ox,oy,ox+w,oy+h);
                pg.addColorStop(0,'#f8f2e4'); pg.addColorStop(1,'#ede4ce');
                ctx.fillStyle=pg; ctx.fill();
                ctx.shadowColor='transparent';
                ctx.strokeStyle='rgba(0,0,0,0.08)'; ctx.lineWidth=1.5; ctx.stroke();
                ctx.globalAlpha=0.055; ctx.strokeStyle='#8b7355'; ctx.lineWidth=1;
                for(let ly=oy+45;ly<oy+h-12;ly+=30){
                    ctx.beginPath(); ctx.moveTo(ox+14,ly); ctx.lineTo(ox+w-14,ly); ctx.stroke();
                }
                ctx.restore();
            }

            _exportPin(ctx,x,y,color,scale=1) {
                const r=Math.round(scale*13);
                const lc=(hex,a)=>{const r2=parseInt(hex.slice(1,3),16),g2=parseInt(hex.slice(3,5),16),b2=parseInt(hex.slice(5,7),16);return `rgb(${Math.min(255,r2+a)},${Math.min(255,g2+a)},${Math.min(255,b2+a)})`;};
                const dc=(hex,a)=>{const r2=parseInt(hex.slice(1,3),16),g2=parseInt(hex.slice(3,5),16),b2=parseInt(hex.slice(5,7),16);return `rgb(${Math.max(0,r2-a)},${Math.max(0,g2-a)},${Math.max(0,b2-a)})`;};
                ctx.save();
                ctx.shadowColor='rgba(0,0,0,0.55)'; ctx.shadowBlur=10; ctx.shadowOffsetY=4;
                const g=ctx.createRadialGradient(x-r*.3,y-r*.3,r*.08,x,y,r);
                g.addColorStop(0,lc(color,50)); g.addColorStop(0.6,color); g.addColorStop(1,dc(color,35));
                ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
                ctx.shadowColor='transparent';
                ctx.beginPath(); ctx.arc(x-r*.3,y-r*.3,r*.3,0,Math.PI*2);
                ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.fill();
                ctx.shadowColor='rgba(0,0,0,0.35)'; ctx.shadowBlur=5; ctx.shadowOffsetY=2;
                ctx.beginPath(); ctx.moveTo(x-r*.15,y+r*.7); ctx.lineTo(x+r*.15,y+r*.7); ctx.lineTo(x,y+r*2.3); ctx.closePath();
                ctx.fillStyle='rgba(60,40,20,0.75)'; ctx.fill();
                ctx.restore();
            }

            _exportSpark(ctx,x,y,w,h,data) {
                ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
                if (data.length<2){ctx.restore();return;}
                const s=data.length>75?data.filter((_,i)=>i%Math.ceil(data.length/75)===0):data;
                const mn=Math.min(...s),mx=Math.max(...s),rng=(mx-mn)||1;
                const cp=Math.round(Math.min(w,h)*0.09);
                const pw=w-cp*2,ph=h-cp*2;
                const fy=y+cp+(1-(s[0]-mn)/rng)*ph;
                const ly2=y+cp+(1-(s[s.length-1]-mn)/rng)*ph;
                ctx.setLineDash([6,6]); ctx.strokeStyle='rgba(59,110,165,0.2)'; ctx.lineWidth=1.5;
                ctx.beginPath(); ctx.moveTo(x+cp,fy); ctx.lineTo(x+cp+pw,ly2); ctx.stroke();
                ctx.setLineDash([]);
                ctx.beginPath();
                s.forEach((v,i)=>{
                    const px2=x+cp+(i/(s.length-1))*pw,py=y+cp+(1-(v-mn)/rng)*ph;
                    i===0?ctx.moveTo(px2,py):ctx.lineTo(px2,py);
                });
                ctx.strokeStyle='#3b6ea5';
                ctx.lineWidth=Math.max(2.5,Math.round(Math.min(w,h)*0.015));
                ctx.lineJoin='round'; ctx.lineCap='round'; ctx.stroke();
                ctx.lineTo(x+cp+pw,y+h-cp); ctx.lineTo(x+cp,y+h-cp); ctx.closePath();
                ctx.fillStyle='rgba(59,110,165,0.08)'; ctx.fill();
                ctx.font=`500 ${Math.round(Math.min(w,h)*0.08)}px Georgia,serif`;
                ctx.fillStyle='rgba(90,75,55,0.55)';
                ctx.textBaseline='bottom'; ctx.textAlign='right';
                ctx.fillText(mn.toFixed(2),x+w-cp*.3,y+h-2);
                ctx.textBaseline='top'; ctx.textAlign='left';
                ctx.fillText(mx.toFixed(2),x+cp*.3,y+4);
                ctx.restore();
            }

            _exportStatOnPaper(ctx,x,y,w,h,label,value,color) {
                const dotR=Math.round(w*0.038);
                ctx.beginPath(); ctx.arc(x+Math.round(w*0.1),y+h*0.26,dotR,0,Math.PI*2);
                ctx.fillStyle=color; ctx.fill();
                ctx.textBaseline='alphabetic';
                ctx.font=`600 ${Math.round(w*0.098)}px 'Inter',sans-serif`;
                ctx.fillStyle='#8a7560';
                ctx.fillText(label,x+Math.round(w*0.08),y+h*0.53);
                let fSz=Math.round(w*0.2);
                ctx.font=`700 ${fSz}px Georgia,'Times New Roman',serif`;
                const maxW2=w*0.84;
                while(ctx.measureText(value).width>maxW2&&fSz>w*0.09){fSz--;ctx.font=`700 ${fSz}px Georgia,serif`;}
                ctx.fillStyle='#2b2519'; ctx.fillText(value,x+Math.round(w*0.08),y+h*0.84);
            }

            _exportHeader(ctx,x,y,disciplineLabel,dateStr,includeDiscipline,scale) {
                const s=scale;
                ctx.textBaseline='alphabetic';
                ctx.font=`700 ${Math.round(55*s)}px Georgia,serif`;
                ctx.fillStyle='#2b2519';
                ctx.fillText('CUBE TIMER',x,y+Math.round(50*s));
                ctx.font=`400 ${Math.round(24*s)}px 'Inter',sans-serif`;
                ctx.fillStyle='#9a8060';
                ctx.fillText(dateStr,x,y+Math.round(50*s)+Math.round(34*s));
                let nextY=y+Math.round(50*s)+Math.round(34*s)+Math.round(22*s);
                if (includeDiscipline) {
                    const bSz=Math.round(27*s);
                    ctx.font=`600 ${bSz}px 'Inter',sans-serif`;
                    const bt=disciplineLabel.toUpperCase();
                    const bw=ctx.measureText(bt).width+Math.round(58*s),bh=Math.round(52*s);
                    this._roundRect(ctx,x,nextY,bw,bh,bh/2);
                    ctx.fillStyle='#2b2519'; ctx.fill();
                    ctx.fillStyle='#f0e8d5'; ctx.fillText(bt,x+Math.round(29*s),nextY+bh*.67);
                    nextY+=bh+Math.round(20*s);
                }
                return nextY;
            }

            _exportStamp(ctx,cx,cy,r) {
                ctx.save(); ctx.globalAlpha=0.5;
                ctx.strokeStyle='#8b3a22'; ctx.lineWidth=Math.round(r*0.09);
                ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
                ctx.beginPath(); ctx.arc(cx,cy,r*0.74,0,Math.PI*2); ctx.stroke();
                for(let i=0;i<10;i++){
                    const a=(i/10)*Math.PI*2;
                    ctx.beginPath(); ctx.arc(cx+Math.cos(a)*r*.87,cy+Math.sin(a)*r*.87,r*.038,0,Math.PI*2);
                    ctx.fillStyle='#8b3a22'; ctx.fill();
                }
                ctx.globalAlpha=0.6;
                ctx.font=`700 ${Math.round(r*.52)}px Georgia,serif`;
                ctx.fillStyle='#8b3a22'; ctx.textAlign='center'; ctx.textBaseline='middle';
                ctx.fillText('\u25C8',cx,cy);
                ctx.textAlign='left'; ctx.textBaseline='alphabetic';
                ctx.restore();
            }

            _exportVertical(ctx,w,h,{disciplineLabel,dateStr,includeDiscipline,includeTrend,finalCards,sparkData}) {
                const pad=Math.round(w*0.065);
                const pinColors=['#c0392b','#27ae60','#8e44ad','#2980b9'];
                const mainH=h>w?Math.round(h*0.46):Math.round(h*0.4);
                this._exportPaper(ctx,pad,Math.round(h*0.04),w-pad*2,mainH,-0.007);
                this._exportPin(ctx,w/2,Math.round(h*0.04)+10,'#c0392b',w/800);
                const innerX=pad+Math.round(w*0.055);
                const headTopY=Math.round(h*0.04)+Math.round(w*0.045);
                const afterH=this._exportHeader(ctx,innerX,headTopY,disciplineLabel,dateStr,includeDiscipline,w/800);
                if (includeTrend) {
                    const chartY=afterH+Math.round(w*0.02);
                    const chartH=mainH-(chartY-Math.round(h*0.04))-Math.round(w*0.04);
                    this._exportSpark(ctx,innerX,chartY,w-pad*2-Math.round(w*0.11),chartH,sparkData);
                }
                const statsTop=Math.round(h*0.04)+mainH+Math.round(h*0.03);
                const gap=Math.round(w*0.04);
                const cw=Math.floor((w-pad*2-gap)/2);
                const ch=h>w?Math.round(h*0.165):Math.round(h*0.2);
                const angles=[-0.015,0.01,0.012,-0.008];
                finalCards.forEach((card,i)=>{
                    const col=i%2,row=Math.floor(i/2);
                    const cx2=pad+col*(cw+gap),cy2=statsTop+row*(ch+Math.round(h*0.025));
                    this._exportPaper(ctx,cx2,cy2,cw,ch,angles[i]||0);
                    this._exportPin(ctx,cx2+cw/2,cy2+10,pinColors[i],w/800);
                    this._exportStatOnPaper(ctx,cx2,cy2,cw,ch,card.label,card.value,card.color);
                });
                const sR=Math.round(w*0.052);
                this._exportStamp(ctx,w-pad-sR,h-pad-sR,sR);
                ctx.font=`400 ${Math.round(w*0.019)}px 'Inter',sans-serif`;
                ctx.fillStyle='rgba(220,190,150,0.55)'; ctx.textBaseline='alphabetic';
                ctx.fillText('Made with Cube Timer',pad,h-Math.round(pad*.38));
            }

            _exportWide(ctx,w,h,{disciplineLabel,dateStr,includeDiscipline,includeTrend,finalCards,sparkData}) {
                const pad=Math.round(h*0.08);
                const pinColors=['#c0392b','#27ae60','#8e44ad','#2980b9'];
                const lpW=Math.round(w*0.43),lpH=h-pad*2;
                this._exportPaper(ctx,pad,pad,lpW,lpH,-0.007);
                this._exportPin(ctx,pad+lpW/2,pad+10,'#c0392b',h/700);
                const innerX=pad+Math.round(h*0.07);
                const afterH=this._exportHeader(ctx,innerX,pad+Math.round(h*0.09),disciplineLabel,dateStr,includeDiscipline,h/700);
                if (includeTrend) {
                    const chartY=afterH+Math.round(h*0.03);
                    const chartH=lpH-(chartY-pad)-Math.round(h*0.07);
                    this._exportSpark(ctx,innerX,chartY,lpW-Math.round(h*0.14),chartH,sparkData);
                }
                const rStart=pad+lpW+pad;
                const rW=w-rStart-pad;
                const gap=Math.round(h*0.04);
                const cw=Math.floor((rW-gap)/2),ch=Math.floor((lpH-gap)/2);
                const angles=[-0.014,0.011,0.013,-0.009];
                finalCards.forEach((card,i)=>{
                    const col=i%2,row=Math.floor(i/2);
                    const cx2=rStart+col*(cw+gap),cy2=pad+row*(ch+gap);
                    this._exportPaper(ctx,cx2,cy2,cw,ch,angles[i]||0);
                    this._exportPin(ctx,cx2+cw/2,cy2+10,pinColors[i],h/700);
                    this._exportStatOnPaper(ctx,cx2,cy2,cw,ch,card.label,card.value,card.color);
                });
                const sR=Math.round(h*0.048);
                this._exportStamp(ctx,w-pad*.6-sR,h-pad*.6-sR,sR);
                ctx.font=`400 ${Math.round(h*0.022)}px 'Inter',sans-serif`;
                ctx.fillStyle='rgba(220,190,150,0.55)'; ctx.textBaseline='alphabetic';
                ctx.fillText('Made with Cube Timer',pad,h-Math.round(pad*.28));
            }

            _roundRect(ctx,x,y,w,h,r) {
                ctx.beginPath();
                ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r);
                ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r);
                ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
            }

            _downloadExportCard() {
                const canvas=DOM('exportImgCanvas');
                if (!canvas) return;
                canvas.toBlob((blob)=>{
                    const url=URL.createObjectURL(blob);
                    const a=document.createElement('a');
                    const sid=this._exportSessionId||this.currentSessionId;
                    const session=this.sessions[sid];
                    const name=(session?.name||'session').replace(/[^a-z0-9а-яё]+/gi,'_');
                    a.href=url; a.download=`cubetimer_${name}_${Date.now()}.png`;
                    document.body.appendChild(a); a.click();
                    document.body.removeChild(a);
                    setTimeout(()=>URL.revokeObjectURL(url),1000);
                },'image/png');
            }


            renderSubsessionStats() {
                const session = this.sessions[this.currentSessionId];
                const subsessions = session?.subsessions || [];
                const block = document.getElementById('subsessionsBlock');
                const list  = document.getElementById('subsessionsList');
                if (!block || !list) return;

                if (subsessions.length === 0) {
                    block.style.display = 'none';
                    return;
                }

                const t = (isRu())
                    ? window.translations?.ru : window.translations?.en;

                block.style.display = '';
                const solveMap = new Map((session.solves || []).map(s => [s.id, s]));

                list.innerHTML = subsessions.map(ss => {
                    const solves = ss.solveIds.map(id => solveMap.get(id)).filter(Boolean);
                    const valid  = solves.filter(s => !s.dnf).map(s => s.time + (s.penalty || 0));
                    const best   = valid.length ? Math.min(...valid) : null;
                    const avg    = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
                    const excludedBadge = t?.subsessionExcludedBadge || 'excluded';

                    return `
                        <div class="subsession-stat-card" style="--ss-color:${ss.color}" data-ssid="${ss.id}">
                            <span class="ss-name">${ss.name}</span>
                            <div class="ss-meta">
                                <div class="ss-meta-item">
                                    <span class="ss-meta-label">Solves</span>
                                    <span class="ss-meta-value">${solves.length}</span>
                                </div>
                                <div class="ss-meta-item">
                                    <span class="ss-meta-label">Best</span>
                                    <span class="ss-meta-value">${best !== null ? this.formatTime(best) : '—'}</span>
                                </div>
                                <div class="ss-meta-item">
                                    <span class="ss-meta-label">Avg</span>
                                    <span class="ss-meta-value">${avg !== null ? this.formatTime(avg) : '—'}</span>
                                </div>
                            </div>
                            ${ss.excludeFromAvg ? `<span class="ss-excluded-badge">${excludedBadge}</span>` : ''}
                            <button class="ss-delete-btn" data-ssid="${ss.id}" title="Delete subsession">×</button>
                        </div>
                    `;
                }).join('');

                // Wire delete buttons
                list.querySelectorAll('.ss-delete-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const ssid = btn.dataset.ssid;
                        session.subsessions = session.subsessions.filter(ss => ss.id !== ssid);
                        this.saveSessions();
                        this.renderSubsessionStats();
                        this.renderSubsessionPie();
                        const historySection = DOM('solveHistorySection');
                        if (historySection && historySection.style.display !== 'none') {
                            this.populateSolveHistory();
                        }
                        if (window.timer) window.timer.updateUI();
                    });
                });
            }

            deleteSolveFromHistory(index) {
                const session = this.sessions[this.currentSessionId];
                const solve = session.solves[index];

                if (this._isSolveHonestLocked(session, solve)) {
                    this._honestModeLockedAlert();
                    return;
                }

                if (!confirm('Delete this solve?')) return;

                session.solves.splice(index, 1);
                if (window.SyncTombstones) window.SyncTombstones.addDeletedSolve(solve.id);
                this.saveSessions();
                this.populateSolveHistory();
                this.updateSessionDetails();
                if (window.AppSync) window.AppSync.pushSolveDelete(solve.id);
                
                // Update main timer display if needed
                if (window.timer) {
                    window.timer.updateUI();
                }
            }

            togglePenaltyFromHistory(index) {
                const session = this.sessions[this.currentSessionId];
                const solve = session.solves[index];
                const removedPlusTwo = solve.penalty === 2;
                if (removedPlusTwo && window.progression && !window.progression.useDnfInsurance()) return;
                
                if (solve.dnf) {
                    solve.dnf = false;
                }
                
                solve.penalty = solve.penalty ? null : 2;
                if (removedPlusTwo && solve.penalty === null) {
                    window.dispatchEvent(new CustomEvent('progressionevent', { detail: { type: 'plusTwoRemoved' } }));
                }
                solve.updatedAt = Date.now();
                this.saveSessions();
                this.populateSolveHistory();
                this.updateSessionDetails();
                if (window.AppSync) {
                    window.AppSync.pushSolveUpdate(solve.id, {
                        dnf: solve.dnf,
                        penalty: solve.penalty,
                        updatedAt: solve.updatedAt
                    });
                }
                
                if (window.timer) {
                    window.timer.updateUI();
                }
            }

            toggleDNFFromHistory(index) {
                const session = this.sessions[this.currentSessionId];
                const solve = session.solves[index];
                if (solve.dnf && window.progression && !window.progression.useDnfInsurance()) return;
                
                solve.dnf = !solve.dnf;
                if (solve.dnf) {
                    solve.penalty = null;
                }
                solve.updatedAt = Date.now();
                
                this.saveSessions();
                this.populateSolveHistory();
                this.updateSessionDetails();
                if (window.AppSync) {
                    window.AppSync.pushSolveUpdate(solve.id, {
                        dnf: solve.dnf,
                        penalty: solve.penalty,
                        updatedAt: solve.updatedAt
                    });
                }
                
                if (window.timer) {
                    window.timer.updateUI();
                }
            }

            renderSessionsList() {
                const container = document.getElementById('sessionsList');
                if (!container) return;
                container.innerHTML = '';
                const sessionTranslations = translations[getLang()] || translations.en;

                Object.entries(this.sessions).forEach(([sessionId, session]) => {
                    if (!session || typeof session !== 'object') return;
                    session.id = sessionId;
                    session.solves = Array.isArray(session.solves) ? session.solves : [];
                    session.subsessions = Array.isArray(session.subsessions) ? session.subsessions : [];
                    const item = document.createElement('div');
                    item.className = 'session-item';
                    if (sessionId === this.currentSessionId) {
                        item.classList.add('active');
                    }
                    if (session.isDefault) {
                        item.classList.add('no-session');
                    }

                    const icon = session.isDefault ? '○' : '●';
                    const count = session.solves.length;
                    const discipline = session.discipline || '3x3';
                    const disciplineLabel = ScrambleGenerator.getLabel(discipline);
                    // Show short label: strip " Cube" suffix for compactness
                    const shortLabel = disciplineLabel.replace(' Cube', '');
                    const displayName = session.isDefault ? sessionTranslations.noSession : (session.name || 'Session');
                    const countTemplate = sessionTranslations.solvesCount || '{n} solves';
                    const countLabel = countTemplate.replace('{n}', count);

                    item.innerHTML = `
                        <div class="session-item-name">
                            <span class="session-item-icon">${icon}</span>
                            <span>${displayName}</span>
                            <span class="session-discipline-badge">${shortLabel}</span>
                        </div>
                        <div class="session-item-count">${countLabel}</div>
                    `;

                    item.onclick = () => {
                        this.switchSession(sessionId);
                    };

                    container.appendChild(item);
                });
            }

            switchSession(sessionId) {
                if (!sessionId || !this.sessions[sessionId]) {
                    console.warn('Session switch ignored: unknown session', sessionId);
                    return;
                }
                this.currentSessionId = sessionId;
                this.saveSessions();
                this.renderSessionsList();
                this.updateSessionDetails();
                this.updateUI();
                
                // Generate scramble for new session's discipline
                this.generateScramble();

                // Update solve history if it's open
                if (DOM('solveHistorySection').style.display === 'flex') {
                    this.populateSolveHistory();
                }
                
                // Update session select in header
                const sessionSelect = DOM('sessionSelect');
                if (sessionSelect) {
                    this.updateSessionDropdown();
                }

                // Honest Mode is per-session: reflect whichever session we just
                // switched to, and (re)start/stop the countdown ticker accordingly.
                this._updateHonestModeBtn();
                if (this.sessions[sessionId]?.honestMode) {
                    this._startHonestModeTicker();
                } else if (this._honestModeInterval) {
                    clearInterval(this._honestModeInterval);
                    this._honestModeInterval = null;
                }
            }

            updateSessionDetails() {
                const session = this.sessions[this.currentSessionId];
                if (!session) return;
                const sessionTranslations = translations[getLang()] || translations.en;
                session.solves = Array.isArray(session.solves) ? session.solves : [];
                session.subsessions = Array.isArray(session.subsessions) ? session.subsessions : [];

                document.getElementById('sessionDetailsTitle').textContent = session.isDefault
                    ? sessionTranslations.noSession
                    : (session.name || 'Session');
                document.getElementById('sessionDetailsSubtitle').textContent = session.isDefault
                    ? sessionTranslations.defaultSession
                    : sessionTranslations.solvesCount.replace('{n}', session.solves.length);

                const solves = session.solves;
                const validSolves = solves.filter(s => !s.dnf);
                const best = validSolves.length > 0 ? Math.min(...validSolves.map(s => s.time + (s.penalty || 0))) : null;
                const ao5 = this.calculateAverageForSession(solves, 5);
                const ao12 = this.calculateAverageForSession(solves, 12);
                const ao100 = this.calculateAverageForSession(solves, 100);
                const avg = validSolves.length > 0 ? 
                    validSolves.reduce((sum, s) => sum + s.time + (s.penalty || 0), 0) / validSolves.length : null;

                DOM('sessionSolves').textContent = solves.length;
                document.getElementById('sessionBest').textContent = best !== null ? this.formatTime(best) : '--';
                document.getElementById('sessionAo5').textContent = ao5 !== null ? this.formatTime(ao5) : '--';
                document.getElementById('sessionAo12').textContent = ao12 !== null ? this.formatTime(ao12) : '--';
                document.getElementById('sessionAo100').textContent = ao100 !== null ? this.formatTime(ao100) : '--';
                document.getElementById('sessionAvg').textContent = avg !== null ? this.formatTime(avg) : '--';

                // Enable/disable buttons
                const isDefault = session.isDefault;
                DOM('renameSessionBtn').disabled = isDefault;
                DOM('deleteSessionBtn').disabled = isDefault;
            }

            calculateAverageForSession(solves, count) {
                if (solves.length < count) return null;
                return this.calculateAverageForSubset(solves.slice(0, count));
            }

            createNewSession() {
                // Show custom modal instead of prompt()
                const overlay = document.getElementById('newSessionOverlay');
                const nameInput = document.getElementById('newSessionName');
                const disciplineSelect = document.getElementById('newSessionDiscipline');
                const createBtn = document.getElementById('newSessionCreate');
                const cancelBtn = document.getElementById('newSessionCancel');

                // Pre-fill default name
                nameInput.value = `Session ${Object.keys(this.sessions).length}`;
                disciplineSelect.value = '3x3';

                overlay.classList.add('visible');
                setTimeout(() => nameInput.focus(), 60);

                const doCreate = () => {
                    const name = nameInput.value.trim();
                    if (!name) { nameInput.focus(); return; }
                    const discipline = disciplineSelect.value;

                    const id = 'session-' + Date.now();
                    this.sessions[id] = {
                        id,
                        name,
                        solves: [],
                        isDefault: false,
                        discipline,
                        createdAt: Date.now()
                    };

                    overlay.classList.remove('visible');
                    cleanup();
                    this.switchSession(id);
                };

                const doCancel = () => {
                    overlay.classList.remove('visible');
                    cleanup();
                };

                const onKey = (e) => {
                    if (e.key === 'Enter') doCreate();
                    if (e.key === 'Escape') doCancel();
                };

                createBtn.addEventListener('click', doCreate);
                cancelBtn.addEventListener('click', doCancel);
                document.addEventListener('keydown', onKey);

                const cleanup = () => {
                    createBtn.removeEventListener('click', doCreate);
                    cancelBtn.removeEventListener('click', doCancel);
                    document.removeEventListener('keydown', onKey);
                };
            }

            renameSession() {
                const session = this.sessions[this.currentSessionId];
                if (session.isDefault) return;

                const newName = prompt('Enter new name:', session.name);
                if (!newName) return;

                session.name = newName;
                this.saveSessions();
                this.renderSessionsList();
                this.updateSessionDetails();
                this.updateSessionDropdown();
            }

            resetCurrentSession() {
                const session = this.sessions[this.currentSessionId];
                if (!confirm(`Reset "${session.name}"? This will delete all ${session.solves.length} solves.`)) return;

                session.solves = [];
                this.saveSessions();
                this.renderSessionsList();
                this.updateSessionDetails();
                this.updateUI();
            }

            deleteCurrentSession() {
                const session = this.sessions[this.currentSessionId];
                if (session.isDefault) return;

                if (!confirm(`Delete "${session.name}"? This will permanently delete all ${session.solves.length} solves.`)) return;

                delete this.sessions[this.currentSessionId];
                if (window.SyncTombstones) window.SyncTombstones.addDeletedSession(this.currentSessionId);
                this.currentSessionId = 'no-session';
                this.saveSessions();
                this.renderSessionsList();
                this.updateSessionDetails();
                this.updateUI();
                DOM('sessionsOverlay').classList.remove('visible');
            }

            exportSessionCSV() {
                const session = this.sessions[this.currentSessionId];
                if (session.solves.length === 0) {
                    alert('No data to export');
                    return;
                }

                // CSV Headers
                let csv = 'Solve #,Time (final),Raw Time,Penalty,Scramble,Timestamp\n';

                // Add rows
                session.solves.slice().reverse().forEach((solve, index) => {
                    const solveNum = index + 1;
                    let finalTime, rawTime, penalty;

                    if (solve.dnf) {
                        finalTime = 'DNF';
                        rawTime = this.formatTime(solve.time);
                        penalty = 'DNF';
                    } else if (solve.penalty) {
                        finalTime = this.formatTime(solve.time + solve.penalty);
                        rawTime = this.formatTime(solve.time);
                        penalty = '+2';
                    } else {
                        finalTime = this.formatTime(solve.time);
                        rawTime = this.formatTime(solve.time);
                        penalty = 'none';
                    }

                    const timestamp = new Date(solve.timestamp).toISOString();
                    const scramble = `"${solve.scramble}"`;

                    csv += `${solveNum},${finalTime},${rawTime},${penalty},${scramble},${timestamp}\n`;
                });

                // Download
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${session.name.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            }

            updateSessionDropdown() {
                const select = DOM('sessionSelect');
                if (!select) return;

                select.innerHTML = '';
                Object.values(this.sessions).forEach(session => {
                    const option = document.createElement('option');
                    option.value = session.id;
                    option.textContent = session.name;
                    if (session.id === this.currentSessionId) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                });

                select.onchange = (e) => {
                    this.switchSession(e.target.value);
                };
            }

            updateUI() {
                // Update last 5 solves
                const last5 = this.solves.slice(0, 5);
                const solvesHTML = [];
                
                for (let i = 0; i < 5; i++) {
                    if (i < last5.length) {
                        const solve = last5[i];
                        let timeStr;
                        let classes = '';
                        
                        if (solve.dnf) {
                            timeStr = 'DNF';
                            classes = 'dnf';
                        } else if (solve.penalty) {
                            const totalTime = solve.time + solve.penalty;
                            timeStr = `${this.formatTime(totalTime)} (+2)`;
                            classes = 'plus-two';
                        } else {
                            timeStr = this.formatTime(solve.time);
                        }
                        
                        solvesHTML.push(`
                            <li class="solve-item">
                                <span class="solve-number">${i + 1}.</span>
                                ${solve.dailyChallenge ? `<span class="solve-daily-challenge-icon" title="${this._dailyChallengeTranslations().dailyChallengeActive}">\u{1F4C5}</span>` : ''}
                                <span class="solve-time ${classes}">${timeStr}</span>
                            </li>
                        `);
                    } else {
                        solvesHTML.push(`
                            <li class="solve-item">
                                <span class="solve-number">${i + 1}.</span>
                                <span class="solve-time" style="color: var(--text-muted);">--</span>
                            </li>
                        `);
                    }
                }
                
                this.solvesList.innerHTML = solvesHTML.join('');
                this.updateActivityStreakButton();

                // Calculate and update averages and best times
                this.updateAverages();
                this.updateBestTimes();
                this.drawChart();
                window.progression?.scheduleEvaluation('ui');
            }

            updateAverages() {
                const ao5 = this.calculateAverage(5);
                const ao12 = this.calculateAverage(12);
                const ao100 = this.calculateAverage(100);
                const sessionAvg = this.calculateSessionAverage();

                // Update left column
                const avgElements = document.querySelectorAll('.averages .average-value');
                avgElements[0].textContent = ao5 !== null ? this.formatTime(ao5) : '--';
                avgElements[1].textContent = ao12 !== null ? this.formatTime(ao12) : '--';

                // Update Ao100 in left column
                const avgAo100Value = document.getElementById('avgAo100Value');
                if (avgAo100Value) avgAo100Value.textContent = ao100 !== null ? this.formatTime(ao100) : '--';

                // Update bottom stats
                const statValues = document.querySelectorAll('.stat-value');
                statValues[0].textContent = ao5 !== null ? this.formatTime(ao5) : '--';
                statValues[1].textContent = ao12 !== null ? this.formatTime(ao12) : '--';
                statValues[2].textContent = sessionAvg !== null ? this.formatTime(sessionAvg) : '--';
            }

            updateBestTimes() {
                const best = this.getBestTime();
                const bestAo5 = this.getBestAverage(5);
                const bestAo12 = this.getBestAverage(12);
                const bestAo100 = this.getBestAverage(100);

                const bestElements = document.querySelectorAll('.best-times .best-value');
                bestElements[0].textContent = best !== null ? this.formatTime(best) : '--';
                bestElements[1].textContent = bestAo5 !== null ? this.formatTime(bestAo5) : '--';
                bestElements[2].textContent = bestAo12 !== null ? this.formatTime(bestAo12) : '--';

                // Update Ao100 in right column
                const bestAo100Value = document.getElementById('bestAo100Value');
                if (bestAo100Value) bestAo100Value.textContent = bestAo100 !== null ? this.formatTime(bestAo100) : '--';
            }

            getBestAverage(count) {
                const excluded = this._getExcludedSolveIds();
                const eligible = excluded.size > 0
                    ? this.solves.filter(s => !excluded.has(s.id))
                    : this.solves;
                if (eligible.length < count) return null;

                let bestAvg = null;
                for (let i = 0; i <= eligible.length - count; i++) {
                    const subset = eligible.slice(i, i + count);
                    const avg = this.calculateAverageForSubset(subset);
                    if (avg !== null && (bestAvg === null || avg < bestAvg)) {
                        bestAvg = avg;
                    }
                }
                return bestAvg;
            }

            // Returns Set of solve IDs that are excluded from session averages
            _getExcludedSolveIds() {
                const session = this.sessions[this.currentSessionId];
                const excluded = new Set();
                (session?.subsessions || []).forEach(ss => {
                    if (ss.excludeFromAvg) ss.solveIds.forEach(id => excluded.add(id));
                });
                return excluded;
            }

            calculateAverage(count) {
                const excluded = this._getExcludedSolveIds();
                const eligible = excluded.size > 0
                    ? this.solves.filter(s => !excluded.has(s.id))
                    : this.solves;
                if (eligible.length < count) return null;
                return this.calculateAverageForSubset(eligible.slice(0, count));
            }

            calculateAverageForSubset(solves) {
                const count = solves.length;
                
                // Count DNFs
                const dnfCount = solves.filter(s => s.dnf).length;
                if (dnfCount >= 2) return null; // 2+ DNFs = no average

                // Get times
                const times = solves.map(s => {
                    if (s.dnf) return Infinity; // DNF is worst
                    return s.time + (s.penalty || 0);
                });

                // Sort to find best and worst
                const sorted = [...times].sort((a, b) => a - b);
                
                // Remove best and worst
                const trimmed = sorted.slice(1, -1);
                
                // If trimmed has Infinity (DNF), it means DNF was not worst, return null
                if (trimmed.some(t => t === Infinity)) return null;
                
                return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
            }

            calculateSessionAverage() {
                const excluded = this._getExcludedSolveIds();
                const validSolves = this.solves.filter(s => !s.dnf && !excluded.has(s.id));
                if (validSolves.length === 0) return null;

                const sum = validSolves.reduce((acc, s) => acc + s.time + (s.penalty || 0), 0);
                return sum / validSolves.length;
            }

            markDNF() {
                if (this.solves.length === 0) return;
                
                const currentSession = this.sessions[this.currentSessionId];
                if (currentSession.solves[0].dnf && window.progression && !window.progression.useDnfInsurance()) return;
                currentSession.solves[0].dnf = !currentSession.solves[0].dnf;
                if (currentSession.solves[0].dnf) {
                    currentSession.solves[0].penalty = null;
                }
                currentSession.solves[0].updatedAt = Date.now();
                this.hideNewBestIndicator();
                this.saveSessions();
                this.updateUI();
                if (window.AppSync) {
                    window.AppSync.pushSolveUpdate(currentSession.solves[0].id, {
                        dnf: currentSession.solves[0].dnf,
                        penalty: currentSession.solves[0].penalty,
                        updatedAt: currentSession.solves[0].updatedAt
                    });
                }
                
                // Trigger commentary for DNF
                if (window.commentary && currentSession.solves[0].dnf) {
                    window.commentary.show({ isDNF: true });
                }
            }

            addPenalty() {
                if (this.solves.length === 0) return;
                const currentSession = this.sessions[this.currentSessionId];
                if (currentSession.solves[0].dnf) return;
                
                const removedPlusTwo = currentSession.solves[0].penalty === 2;
                if (removedPlusTwo && window.progression && !window.progression.useDnfInsurance()) return;
                if (removedPlusTwo) {
                    currentSession.solves[0].penalty = null;
                } else {
                    currentSession.solves[0].penalty = 2;
                }
                currentSession.solves[0].updatedAt = Date.now();
                if (removedPlusTwo) {
                    window.dispatchEvent(new CustomEvent('progressionevent', { detail: { type: 'plusTwoRemoved' } }));
                }
                this.hideNewBestIndicator();
                this.saveSessions();
                this.updateUI();
                if (window.AppSync) {
                    window.AppSync.pushSolveUpdate(currentSession.solves[0].id, {
                        penalty: currentSession.solves[0].penalty,
                        updatedAt: currentSession.solves[0].updatedAt
                    });
                }
                
                // Trigger commentary for +2
                if (window.commentary && currentSession.solves[0].penalty === 2) {
                    window.commentary.show({ isPluTwo: true });
                }
            }

            deleteSolve() {
                if (this.solves.length === 0) return;

                const currentSession = this.sessions[this.currentSessionId];
                if (this._isSolveHonestLocked(currentSession, currentSession.solves[0])) {
                    this._honestModeLockedAlert();
                    return;
                }

                if (confirm('Delete last solve?')) {
                    const removed = currentSession.solves.shift();
                    if (removed && window.SyncTombstones) window.SyncTombstones.addDeletedSolve(removed.id);
                    this.hideNewBestIndicator();
                    this.saveSessions();
                    this.updateUI();
                    if (removed && window.AppSync) window.AppSync.pushSolveDelete(removed.id);
                    
                    // Trigger commentary for delete
                    if (window.commentary) {
                        window.commentary.show({ isDelete: true });
                    }
                }
            }

            // Parses time entered in the Edit prompt. Accepts:
            //   "DNF"           -> DNF
            //   "15.68"         -> 15.68s (explicit decimal, comma also accepted: "15,68")
            //   "1:02.36"       -> 62.36s (explicit mm:ss.xx)
            //   "1568"          -> 15.68s (digits only: last 2 = hundredths, next 2 = seconds, rest = minutes)
            //   "10236"         -> 1:02.36 = 62.36s (same rule, just more digits)
            // This mirrors csTimer's own digit-entry convention, so it should feel
            // familiar to anyone migrating from there — no need to type separators.
            _parseTimeInput(input) {
                if (input === null) return null;
                let str = input.trim();
                if (str === '') return null;
                if (str.toUpperCase() === 'DNF') return { dnf: true, time: 0 };

                // Normalize comma decimal separator
                str = str.replace(',', '.');

                let totalSeconds = null;

                if (str.includes(':')) {
                    // Explicit m:ss.xx (or h:mm:ss.xx) format
                    const parts = str.split(':');
                    const secPart = parseFloat(parts.pop());
                    if (isNaN(secPart)) return null;
                    let minutes = 0;
                    for (const p of parts) {
                        const n = parseInt(p, 10);
                        if (isNaN(n)) return null;
                        minutes = minutes * 60 + n;
                    }
                    totalSeconds = minutes * 60 + secPart;
                } else if (str.includes('.')) {
                    // Explicit decimal seconds, e.g. "15.68"
                    const n = parseFloat(str);
                    if (isNaN(n)) return null;
                    totalSeconds = n;
                } else if (/^\d+$/.test(str)) {
                    // Pure digits, no separators: csTimer-style digit entry.
                    const digits = str;
                    const hundredths = parseInt(digits.slice(-2).padStart(2, '0'), 10);
                    let rest = digits.slice(0, -2);
                    const seconds = parseInt((rest.slice(-2) || '0').padStart(2, '0'), 10);
                    rest = rest.slice(0, -2);
                    const minutes = rest ? parseInt(rest, 10) : 0;
                    totalSeconds = minutes * 60 + seconds + hundredths / 100;
                } else {
                    return null;
                }

                if (totalSeconds === null || isNaN(totalSeconds) || totalSeconds <= 0) return null;
                return { dnf: false, time: totalSeconds };
            }

            // Parses the Target Time goal field. Deliberately NOT the same convention
            // as _parseTimeInput: there, bare digits are csTimer-style digit-entry
            // (last 2 digits = hundredths), which is right for typing a stopwatch
            // reading but wrong for a goal — someone typing "15" here means "15
            // whole seconds", not 0.15s. So here, bare digits are just seconds.
            //   "15"       -> 15s
            //   "15.5"     -> 15.5s
            //   "1:30"     -> 90s
            _parseGoalTimeInput(input) {
                if (input === null) return null;
                let str = input.trim();
                if (str === '') return null;

                str = str.replace(',', '.');
                let totalSeconds = null;

                if (str.includes(':')) {
                    const parts = str.split(':');
                    const secPart = parseFloat(parts.pop());
                    if (isNaN(secPart)) return null;
                    let minutes = 0;
                    for (const p of parts) {
                        const n = parseInt(p, 10);
                        if (isNaN(n)) return null;
                        minutes = minutes * 60 + n;
                    }
                    totalSeconds = minutes * 60 + secPart;
                } else {
                    // Covers both "15" and "15.5" — a bare number is just that many seconds.
                    const n = parseFloat(str);
                    if (isNaN(n)) return null;
                    totalSeconds = n;
                }

                if (totalSeconds === null || isNaN(totalSeconds) || totalSeconds <= 0) return null;
                return { dnf: false, time: totalSeconds };
            }

            // Honest Mode's duration field is in MINUTES, not seconds — this needs
            // its own parser rather than reusing _parseGoalTimeInput (which used to
            // be shared here and caused real confusion: a bare "1700" would be read
            // as 1700 seconds by that parser, then treated as 1700 MINUTES by
            // startHonestMode, i.e. nearly 28 hours). A bare number here is always
            // whole minutes; "mm:ss" style input isn't meaningful for a duration
            // field, so it isn't supported.
            _parseHonestModeMinutes(input) {
                if (input === null) return null;
                const str = input.trim().replace(',', '.');
                if (str === '') return null;

                const n = parseFloat(str);
                if (isNaN(n) || n <= 0) return null;
                if (n > 300) return null; // sanity cap: 5 hours is already generous for one session

                return { time: n };
            }

            editSolve() {
                if (this.solves.length === 0) return;
                
                const currentSession = this.sessions[this.currentSessionId];
                if (this._isSolveHonestLocked(currentSession, currentSession.solves[0])) {
                    this._honestModeLockedAlert();
                    return;
                }

                const currentTime = currentSession.solves[0].dnf ? 'DNF' : this.formatTime(currentSession.solves[0].time);
                const newTime = prompt('Enter new time (e.g. 15.68, 1:02.36, or just 1568) or DNF:', currentTime);
                
                if (newTime !== null) {
                    const parsed = this._parseTimeInput(newTime);
                    if (!parsed) {
                        alert('Invalid time format');
                        return;
                    }
                    if (parsed.dnf) {
                        currentSession.solves[0].dnf = true;
                        currentSession.solves[0].penalty = null;
                    } else {
                        currentSession.solves[0].time = parsed.time;
                        currentSession.solves[0].dnf = false;
                        currentSession.solves[0].penalty = null;
                    }
                    currentSession.solves[0].updatedAt = Date.now();
                    this.hideNewBestIndicator();
                    this.saveSessions();
                    this.updateUI();
                    if (window.AppSync) {
                        window.AppSync.pushSolveUpdate(currentSession.solves[0].id, {
                            time: currentSession.solves[0].time,
                            dnf: currentSession.solves[0].dnf,
                            penalty: currentSession.solves[0].penalty,
                            updatedAt: currentSession.solves[0].updatedAt
                        });
                    }
                }
            }

            _getLocalDateKey(date = new Date()) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }

            _getActivityByDay() {
                const activity = new Map();
                Object.values(this.sessions || {}).forEach(session => {
                    (session.solves || []).forEach(solve => {
                        const timestamp = Number(solve.timestamp);
                        if (!Number.isFinite(timestamp) || timestamp <= 0) return;
                        const key = this._getLocalDateKey(new Date(timestamp));
                        activity.set(key, (activity.get(key) || 0) + 1);
                    });
                });
                return activity;
            }

            _dateFromLocalKey(key) {
                const [year, month, day] = key.split('-').map(Number);
                return new Date(year, month - 1, day);
            }

            _calculateStreakMetrics(activity = this._getActivityByDay()) {
                const frozenDays = window.progression?.getFrozenDays?.() || new Set();
                const keys = [...new Set([...activity.keys(), ...frozenDays])].sort();
                let best = 0;
                let run = 0;
                let previous = null;
                keys.forEach(key => {
                    const date = this._dateFromLocalKey(key);
                    if (previous && Math.round((date - previous) / 86400000) === 1) run++;
                    else run = 1;
                    best = Math.max(best, run);
                    previous = date;
                });

                const cursor = new Date();
                cursor.setHours(0, 0, 0, 0);
                const streakDays = new Set(keys);
                if (!streakDays.has(this._getLocalDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
                let current = 0;
                while (streakDays.has(this._getLocalDateKey(cursor))) {
                    current++;
                    cursor.setDate(cursor.getDate() - 1);
                }
                return { current, best, activeDays: activity.size };
            }

            updateActivityStreakButton() {
                const metrics = this._calculateStreakMetrics();
                const count = DOM('streakButtonCount');
                if (count) count.textContent = metrics.current;
                return metrics;
            }

            _activityLevel(count) {
                if (!count) return 0;
                if (count <= 2) return 1;
                if (count <= 5) return 2;
                if (count <= 10) return 3;
                return 4;
            }

            openStreakCalendar() {
                const overlay = DOM('streakOverlay');
                if (!overlay || !DOM('streakCalendar')) return;
                const activity = this._getActivityByDay();
                const metrics = this._calculateStreakMetrics(activity);
                DOM('currentStreakValue').textContent = metrics.current;
                DOM('bestStreakValue').textContent = metrics.best;
                DOM('activeDaysValue').textContent = metrics.activeDays;
                const now = new Date();
                this._streakCalendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                overlay.classList.add('visible');
                this._renderStreakMonth(activity);
            }

            _renderStreakMonth(activity = this._getActivityByDay()) {
                const calendar = DOM('streakCalendar');
                const weekdays = DOM('streakWeekdays');
                const monthTitle = DOM('streakMonthTitle');
                if (!calendar || !weekdays || !monthTitle || !this._streakCalendarMonth) return;
                const t = this._dailyChallengeTranslations();
                const locale = getLang() === 'ru' ? 'ru-RU' : 'en-US';
                const displayed = this._streakCalendarMonth;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayKey = this._getLocalDateKey(today);
                const frozenDays = window.progression?.getFrozenDays?.() || new Set();

                const monthName = new Intl.DateTimeFormat(locale, { month: 'long' }).format(displayed);
                monthTitle.textContent = `${monthName} ${displayed.getFullYear()}`;
                const nextButton = DOM('streakNextMonth');
                const isCurrentMonth = displayed.getFullYear() === today.getFullYear()
                    && displayed.getMonth() === today.getMonth();
                if (nextButton) nextButton.disabled = isCurrentMonth;

                weekdays.innerHTML = '';
                const weekdayLabels = locale === 'ru-RU'
                    ? ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
                    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                weekdayLabels.forEach(text => {
                    const label = document.createElement('span');
                    label.textContent = text;
                    weekdays.appendChild(label);
                });

                const first = new Date(displayed.getFullYear(), displayed.getMonth(), 1);
                const gridStart = new Date(first);
                gridStart.setDate(first.getDate() - first.getDay());
                calendar.innerHTML = '';
                for (let weekIndex = 0; weekIndex < 6; weekIndex++) {
                    const week = document.createElement('div');
                    week.className = 'streak-month-week';
                    let perfectWeek = true;
                    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
                        const date = new Date(gridStart);
                        date.setDate(gridStart.getDate() + weekIndex * 7 + dayIndex);
                        const key = this._getLocalDateKey(date);
                        const count = activity.get(key) || 0;
                        const frozen = frozenDays.has(key);
                        if (!count || frozen || date > today) perfectWeek = false;
                        const cell = document.createElement('span');
                        cell.className = 'streak-month-day';
                        cell.dataset.level = String(this._activityLevel(count));
                        cell.textContent = date.getDate();
                        if (date.getMonth() !== displayed.getMonth()) cell.classList.add('outside-month');
                        if (date > today) cell.classList.add('future');
                        if (key === todayKey) cell.classList.add('today');
                        if (frozen) cell.classList.add('frozen');
                        const formatted = new Intl.DateTimeFormat(locale, {
                            year: 'numeric', month: 'long', day: 'numeric'
                        }).format(date);
                        cell.title = frozen ? `${formatted}: ${t.streakFrozen}` : `${formatted}: ${count} ${t.streakSolves}`;
                        week.appendChild(cell);
                    }
                    if (perfectWeek) {
                        week.classList.add('perfect-week');
                        week.title = t.streakPerfectWeek;
                    }
                    calendar.appendChild(week);
                }
            }

            _dailyChallengeTranslations() {
                return translations[getLang()] || translations.en;
            }

            _setDailyChallengeState(state, message = '') {
                const status = DOM('dailyChallengeStatus');
                const content = DOM('dailyChallengeContent');
                const solveButton = DOM('dailyChallengeSolveBtn');
                if (status) {
                    status.textContent = message;
                    status.classList.toggle('hidden', state === 'ready');
                    status.classList.toggle('error', state === 'error');
                }
                content?.classList.toggle('hidden', state !== 'ready');
                solveButton?.classList.toggle('hidden', state !== 'ready');
            }

            async openDailyChallenge() {
                const overlay = DOM('dailyChallengeOverlay');
                if (!overlay) return;
                const t = this._dailyChallengeTranslations();
                const dateKey = this._getLocalDateKey();
                this._loadedDailyChallenge = null;
                const date = new Date(`${dateKey}T12:00:00`);
                DOM('dailyChallengeTitle').textContent = t.dailyChallengeTitle;
                DOM('dailyChallengeDate').textContent = new Intl.DateTimeFormat(
                    getLang() === 'ru' ? 'ru-RU' : 'en-US',
                    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
                ).format(date);
                DOM('dailyChallengeCloseBtn').textContent = t.dailyChallengeClose;
                DOM('dailyChallengeSolveBtn').textContent = t.dailyChallengeSolve;
                this._setDailyChallengeState('loading', t.dailyChallengeLoading);
                overlay.classList.add('visible');

                try {
                    let challenge;
                    if (this._dailyChallengeCache?.date === dateKey) {
                        challenge = this._dailyChallengeCache.data;
                    } else {
                        if (!window.CubeSync?.loadDailyChallenge) throw new Error('Daily Challenge API is unavailable');
                        challenge = await window.CubeSync.loadDailyChallenge(dateKey);
                        this._dailyChallengeCache = { date: dateKey, data: challenge };
                    }

                    if (!challenge) {
                        this._setDailyChallengeState('missing', t.dailyChallengeMissing);
                        return;
                    }

                    const scramble = typeof challenge.scramble === 'string' ? challenge.scramble.trim() : '';
                    if (scramble.length < 5 || scramble.length > 500) {
                        throw new Error('Daily Challenge scramble is invalid');
                    }
                    const puzzle = typeof challenge.puzzle === 'string' && challenge.puzzle.trim()
                        ? challenge.puzzle.trim()
                        : '3x3';
                    const note = getLang() === 'ru'
                        ? (challenge.noteRu || challenge.note || challenge.noteEn || '')
                        : (challenge.noteEn || challenge.note || challenge.noteRu || '');

                    this._loadedDailyChallenge = { date: dateKey, puzzle, scramble, note };
                    DOM('dailyChallengePuzzle').textContent = `${t.dailyChallengePuzzle}: ${puzzle}`;
                    DOM('dailyChallengeScramble').textContent = scramble;
                    DOM('dailyChallengeNote').textContent = note;
                    DOM('dailyChallengeNote').classList.toggle('hidden', !note);
                    this._setDailyChallengeState('ready');
                } catch (error) {
                    console.error('Daily Challenge load failed:', error);
                    this._setDailyChallengeState('error', t.dailyChallengeError);
                }
            }

            startDailyChallenge() {
                if (!this._loadedDailyChallenge) return;
                this.activeDailyChallenge = { ...this._loadedDailyChallenge };
                this.activeDailyChallengeConsumed = false;
                // Invalidate a normal scramble request that may still be loading.
                this._scrambleRequestId++;
                DOM('scrambleText').textContent = this.activeDailyChallenge.scramble;
                const badge = DOM('dailyChallengeActiveBadge');
                if (badge) {
                    badge.textContent = `\u{1F4C5} ${this._dailyChallengeTranslations().dailyChallengeActive}`;
                    badge.classList.remove('hidden');
                }
                DOM('dailyChallengeOverlay')?.classList.remove('visible');
            }

            _consumeDailyChallengeTag() {
                if (!this.activeDailyChallenge || this.activeDailyChallengeConsumed) return {};
                this.activeDailyChallengeConsumed = true;
                return {
                    dailyChallenge: true,
                    dailyChallengeDate: this.activeDailyChallenge.date,
                    dailyChallengePuzzle: this.activeDailyChallenge.puzzle
                };
            }

            _clearDailyChallenge() {
                this.activeDailyChallenge = null;
                this.activeDailyChallengeConsumed = false;
                DOM('dailyChallengeActiveBadge')?.classList.add('hidden');
            }

            async generateScramble() {
                this._clearDailyChallenge();
                const session = this.sessions[this.currentSessionId];
                const discipline = session?.discipline || '3x3';
                // Real WCA-engine scrambles load async (cubing.js), so show a
                // placeholder immediately and swap it in once it's ready.
                const el = DOM('scrambleText');
                const requestId = ++this._scrambleRequestId;
                if (el) el.textContent = '...';
                const scramble = await ScrambleGenerator.getScramble(discipline);
                // Ignore stale results if the discipline changed while we were waiting.
                if (requestId !== this._scrambleRequestId) return;
                if (el) el.textContent = scramble;
            }

            drawChart() {
                const canvas = document.getElementById('progressChart');
                const ctx = canvas.getContext('2d');
                
                // Set canvas size
                canvas.width = canvas.offsetWidth * 2;
                canvas.height = canvas.offsetHeight * 2;
                ctx.scale(2, 2);

                const width = canvas.offsetWidth;
                const height = canvas.offsetHeight;

                // Clear canvas
                ctx.clearRect(0, 0, width, height);

                // Get valid solves (reverse to show oldest first)
                const validSolves = this.solves
                    .slice()
                    .reverse()
                    .filter(s => !s.dnf)
                    .map(s => s.time + (s.penalty || 0));

                if (validSolves.length < 2) {
                    // Not enough data to draw
                    ctx.fillStyle = '#6b7896';
                    ctx.font = '14px Anybody';
                    ctx.textAlign = 'center';
                    ctx.fillText('Not enough data', width / 2, height / 2);
                    return;
                }

                const max = Math.max(...validSolves);
                const min = Math.min(...validSolves);
                const range = max - min || 1; // Prevent division by zero

                // Draw grid lines
                ctx.strokeStyle = 'rgba(74, 158, 255, 0.1)';
                ctx.lineWidth = 1;
                
                for (let i = 0; i <= 4; i++) {
                    const y = (height / 4) * i;
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                }

                // Draw line chart
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 2;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                
                ctx.beginPath();
                validSolves.forEach((value, index) => {
                    const x = (width / (validSolves.length - 1)) * index;
                    const y = height - ((value - min) / range) * height * 0.8 - height * 0.1;
                    
                    if (index === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                });
                ctx.stroke();

                // Draw points
                ctx.fillStyle = '#fbbf24';
                validSolves.forEach((value, index) => {
                    const x = (width / (validSolves.length - 1)) * index;
                    const y = height - ((value - min) / range) * height * 0.8 - height * 0.1;
                    
                    ctx.beginPath();
                    ctx.arc(x, y, 3, 0, Math.PI * 2);
                    ctx.fill();
                });
            }

            exportData() {
                const data = {
                    sessions: this.sessions,
                    currentSessionId: this.currentSessionId,
                    exportDate: new Date().toISOString()
                };

                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `cube-timer-all-sessions-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            }

            resetSession() {
                const session = this.sessions[this.currentSessionId];
                if (confirm(`Are you sure? This will delete all ${session.solves.length} solves in "${session.name}".`)) {
                    session.solves = [];
                    this.hideNewBestIndicator();
                    this.saveSessions();
                    this.updateUI();
                    DOM('settingsOverlay').classList.remove('visible');
                }
            }

            // ════════════════════════════════════════════════════════════
            // Import / Export — unified multi-timer system
            // ════════════════════════════════════════════════════════════
            //
            // All formats below were verified against real source code (not guessed):
            //   - csTimer:      cs0x7f/cstimer (JSON wrapped in .txt)
            //   - CubeDesk:     kash/cubedesk (DataSettings.tsx export + cstimer.ts import)
            //   - Twisty Timer: aricneto/TwistyTimer (MainActivity.java CSV export/import)
            //   - Last Cube X:  closed-source iOS app with no public spec. Export uses the
            //     csTimer format (per product instructions); import uses a best-effort,
            //     defensive CSV parser since the exact column layout isn't publicly documented.

            openImportExportModal() {
                DOM('importExportOverlay').classList.add('visible');
            }

            _escapeHtml(str) {
                const div = document.createElement('div');
                div.textContent = String(str);
                return div.innerHTML;
            }

            _ieT() {
                const lang = getLang();
                return translations[lang] || translations.en;
            }

            // ─── Shared helpers ──────────────────────────────
            _maybeParseJson(v) {
                if (typeof v !== 'string') return v;
                try { return JSON.parse(v); } catch (e) { return v; }
            }

            // Opens a file picker with no `accept` filter (some Android pickers hide
            // non-media files entirely when given a narrow/broad type list — see prior
            // fix history) and hands the raw text to the given callback.
            _pickFile(onText) {
                const input = document.createElement('input');
                input.type = 'file';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const text = String(event.target.result).replace(/^\uFEFF/, '');
                        onText(text, file.name);
                    };
                    reader.readAsText(file);
                };
                input.click();
            }

            // Tries to write directly into the folder the user picked for auto-export
            // (desktop Chrome/Edge/Opera only — the File System Access API has no
            // mobile support at all, Android has no matching system picker). Falls
            // back to a normal browser download everywhere else, which lands in the
            // Downloads folder like any other file — this is the only option on phones.
            async _downloadFile(filename, content, mime) {
                const dirHandle = await this._getAutoExportDirHandle();
                if (dirHandle) {
                    try {
                        const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
                        if (perm === 'granted') {
                            const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
                            const writable = await fileHandle.createWritable();
                            await writable.write(content);
                            await writable.close();
                            return;
                        }
                    } catch (e) {
                        // Fall through to the normal download below (e.g. permission was
                        // revoked, or the folder was moved/deleted since it was picked).
                    }
                }

                const blob = new Blob([content], { type: mime || 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
            }

            // ─── Auto-export folder handle (IndexedDB) ──────────────
            // FileSystemDirectoryHandle objects can't go in localStorage (not JSON),
            // but IndexedDB supports storing them directly via structured clone.
            _autoExportDB() {
                return new Promise((resolve, reject) => {
                    const req = indexedDB.open('firecube-autoexport', 1);
                    req.onupgradeneeded = () => req.result.createObjectStore('handles');
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            }

            async _saveAutoExportDirHandle(handle) {
                const db = await this._autoExportDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction('handles', 'readwrite');
                    tx.objectStore('handles').put(handle, 'dir');
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
            }

            async _getAutoExportDirHandle() {
                if (!window.settingsManager?.settings?.autoExportUseFolder) return null;
                if (!('indexedDB' in window)) return null;
                try {
                    const db = await this._autoExportDB();
                    return await new Promise((resolve) => {
                        const tx = db.transaction('handles', 'readonly');
                        const req = tx.objectStore('handles').get('dir');
                        req.onsuccess = () => resolve(req.result || null);
                        req.onerror = () => resolve(null);
                    });
                } catch (e) {
                    return null;
                }
            }

            async _clearAutoExportDirHandle() {
                if (!('indexedDB' in window)) return;
                try {
                    const db = await this._autoExportDB();
                    const tx = db.transaction('handles', 'readwrite');
                    tx.objectStore('handles').delete('dir');
                } catch (e) { /* ignore */ }
            }

            // ─── Auto-export trigger ──────────────
            // Called after every solve is saved; fires the configured export once
            // the current session's solve count is a multiple of the chosen interval.
            _maybeAutoExport() {
                const s = window.settingsManager?.settings;
                if (!s || !s.autoExportEnabled) return;

                const every = parseInt(s.autoExportEvery, 10);
                if (!every || every <= 0) return;

                const session = this.sessions[this.currentSessionId];
                if (!session || session.solves.length === 0) return;
                if (session.solves.length % every !== 0) return;

                switch (s.autoExportFormat) {
                    case 'cstimer': this._exportToCstimerFormat('firecube_autoexport'); break;
                    case 'cubedesk': this._exportToCubeDeskFormat(); break;
                    case 'twistytimer': this._exportToTwistyTimerFormat(); break;
                    default: this.exportData(); break; // 'firecube' / anything unrecognized
                }
            }

            // Takes generic parsed sessions — [{ name, disciplineRaw, discipline, unmapped, solves }] —
            // creates real sessions in this app, and shows the result modal.
            // `timerLabel` is used both for the modal title and to prefix session names.
            _finishImport(timerLabel, parsedSessions) {
                if (!parsedSessions || parsedSessions.length === 0) {
                    alert(`No valid ${timerLabel} data found in this file.`);
                    return;
                }

                const newSessionIds = [];
                const sessionBreakdown = [];
                const warnings = [];
                let importedSolves = 0, skipped = 0;
                const existingSolveIds = new Set();
                Object.values(this.sessions || {}).forEach(session => (session?.solves || []).forEach(solve => {
                    if (solve?.id) existingSolveIds.add(solve.id);
                }));

                for (const ps of parsedSessions) {
                    if (!ps.solves || ps.solves.length === 0) continue;

                    const uniqueSolves = ps.solves.filter(solve => {
                        if (!solve?.id) return true;
                        if (existingSolveIds.has(solve.id)) { skipped++; return false; }
                        existingSolveIds.add(solve.id);
                        return true;
                    });
                    if (!uniqueSolves.length) continue;

                    uniqueSolves.sort((a, b) => b.timestamp - a.timestamp);
                    importedSolves += uniqueSolves.length;
                    skipped += ps.skipped || 0;

                    const fullName = `${timerLabel}: ${ps.name}`;
                    const id = `session-imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                    this.sessions[id] = {
                        id,
                        name: fullName,
                        solves: uniqueSolves,
                        isDefault: false,
                        discipline: ps.discipline || '3x3',
                        createdAt: Date.now()
                    };
                    newSessionIds.push(id);
                    sessionBreakdown.push({ name: fullName, count: uniqueSolves.length });

                    if (ps.unmapped) {
                        const t = this._ieT();
                        const tmpl = t.sessionMarkedAs3x3 || '{session} ({puzzle}) is marked as 3x3';
                        warnings.push(tmpl
                            .replace('{session}', ps.name)
                            .replace('{puzzle}', ps.disciplineRaw || '?'));
                    }
                }

                if (newSessionIds.length === 0) {
                    alert(`No valid ${timerLabel} data found in this file.`);
                    return;
                }

                this.currentSessionId = newSessionIds[0];
                this.saveSessions();
                this.updateUI();
                this.updateSessionDropdown();
                window.AppSync?.pushImportedSessions?.(newSessionIds.map(id => ({ sessionId: id, solves: this.sessions[id].solves })));

                this._showImportResult({ timerLabel, imported: importedSolves, skipped, sessions: sessionBreakdown, warnings });
            }

            // Shows the generic import summary modal: progress bar, per-session
            // breakdown, and "Session X (Puzzle) is marked as 3x3" style warnings.
            _showImportResult({ timerLabel, imported, skipped, sessions, warnings }) {
                const overlay = DOM('importResultOverlay');
                if (!overlay) return;

                const total = imported + skipped;
                const pct = total > 0 ? Math.round((imported / total) * 100) : 100;
                const t = this._ieT();

                document.getElementById('importResultBarFill').style.width = pct + '%';
                document.getElementById('importResultOkLabel').textContent =
                    `${imported} ${t.cstImportedLabel || 'imported'}`;

                const skipRow = document.getElementById('importResultSkipRow');
                if (skipped > 0) {
                    skipRow.style.display = 'flex';
                    document.getElementById('importResultSkipLabel').textContent =
                        `${skipped} ${t.cstSkippedLabel || 'skipped'}`;
                } else {
                    skipRow.style.display = 'none';
                }

                const list = document.getElementById('importResultSessionsList');
                list.innerHTML = (sessions || []).map(s => `
                    <div class="cst-import-session-row">
                        <span class="name">${this._escapeHtml(s.name)}</span>
                        <span class="count">+${s.count}</span>
                    </div>
                `).join('');

                const warnList = document.getElementById('importResultWarningsList');
                warnList.innerHTML = (warnings || []).map(w => `
                    <div class="cst-import-warning-row">⚠️ ${this._escapeHtml(w)}</div>
                `).join('');

                const titleTmpl = t.importCompleteTitle || '{timer} Import Complete';
                document.getElementById('importResultTitle').textContent = titleTmpl.replace('{timer}', timerLabel);
                overlay.classList.add('visible');
            }

            // ─── FireCube Timer (JSON) — our own native format ──────────────
            _parseFireCubeJson(text) {
                const data = JSON.parse(text);
                const parsedSessions = [];

                if (data.sessions) {
                    for (const key of Object.keys(data.sessions)) {
                        const s = data.sessions[key];
                        if (!s || !Array.isArray(s.solves) || s.solves.length === 0) continue;
                        parsedSessions.push({
                            name: s.name || key,
                            discipline: s.discipline || '3x3',
                            solves: s.solves.map(sv => ({ ...sv }))
                        });
                    }
                } else if (Array.isArray(data.solves)) {
                    parsedSessions.push({ name: 'Imported', discipline: '3x3', solves: data.solves });
                }

                return parsedSessions;
            }

            // ─── csTimer (.txt, JSON-wrapped) ──────────────
            // { properties: { sessionData: {...} }, session1: [...], session2: [...] }
            // Each solve: [[penalty, timeMs], scramble, comment, unixTimestampSeconds]
            //   penalty: 0 = clean, 2000 = +2, -1 = DNF
            _cstScrambleTypeToDiscipline(scrType) {
                const map = {
                    '222': '2x2', '222so': '2x2', '222o': '2x2',
                    '333': '3x3', '333ni': '3x3', '333fm': '3x3', '333oh': '3x3', '333custom': '3x3',
                    '444': '4x4', '444bld': '4x4', '444wca': '4x4', '444ni': '4x4',
                    '555': '5x5', '555wca': '5x5', '555ni': '5x5',
                    '666': '6x6', '777': '7x7',
                    'pyram': 'pyraminx', 'skewb': 'skewb',
                    'minx': 'megaminx', 'mgmp': 'megaminx'
                };
                return map[scrType] || null;
            }

            _cstParseSolve(raw) {
                if (!Array.isArray(raw) || raw.length < 2) return null;
                const first = raw[0];
                const [pen, timeMs] = Array.isArray(first) ? first : [0, first];
                if (typeof timeMs !== 'number' || isNaN(timeMs)) return null;

                const scramble = typeof raw[1] === 'string' ? raw[1].trim() : '';
                const ts = (typeof raw[3] === 'number' && raw[3] > 0) ? raw[3] * 1000 : Date.now();
                const dnf = pen === -1;
                const penalty = (!dnf && pen > 0) ? pen / 1000 : null;

                return {
                    id: `s_cst_${ts}_${Math.random().toString(36).slice(2, 7)}`,
                    time: Math.max(0, timeMs) / 1000,
                    timestamp: ts,
                    scramble,
                    penalty,
                    dnf
                };
            }

            _parseCstimerTxt(text) {
                const data = JSON.parse(text);

                let sessionMeta = {};
                const props = this._maybeParseJson(data.properties);
                if (props && props.sessionData) {
                    sessionMeta = this._maybeParseJson(props.sessionData) || {};
                }

                const sessionKeyRe = /^session(\d+)$/;
                const parsedSessions = [];

                for (const key of Object.keys(data)) {
                    const m = key.match(sessionKeyRe);
                    if (!m) continue;
                    const num = m[1];

                    const rawSolves = this._maybeParseJson(data[key]);
                    if (!Array.isArray(rawSolves) || rawSolves.length === 0) continue;

                    const meta = sessionMeta[num] || {};
                    const name = meta.name || `Session ${num}`;
                    const scrType = (meta.opt && meta.opt.scrType) || '333';
                    const discipline = this._cstScrambleTypeToDiscipline(scrType);

                    const solves = [];
                    let sessionSkipped = 0;
                    for (const rawSolve of rawSolves) {
                        const s = this._cstParseSolve(rawSolve);
                        if (s) solves.push(s); else sessionSkipped++;
                    }
                    if (solves.length === 0) continue;

                    parsedSessions.push({
                        name, solves, skipped: sessionSkipped,
                        discipline: discipline || '3x3',
                        disciplineRaw: scrType,
                        unmapped: !discipline
                    });
                }

                return parsedSessions;
            }

            // ─── CubeDesk (.txt/.json) ──────────────
            // { sessions: [{id, name, order}], solves: [{time, raw_time, cube_type, scramble,
            //   session_id, started_at, ended_at, dnf, plus_two, notes, ...}] }
            // `time` includes any +2 baked in (or is -1 for DNF); `raw_time` is the pre-penalty
            // seconds value, which is what we actually want to store.
            _cubeDeskTypeToDiscipline(cubeType) {
                const map = {
                    '333': '3x3', '222': '2x2', '444': '4x4', '555': '5x5',
                    '666': '6x6', '777': '7x7',
                    'pyraminx': 'pyraminx', 'skewb': 'skewb', 'minx': 'megaminx'
                };
                return map[cubeType] || null;
            }

            _parseCubeDeskTxt(text) {
                const data = JSON.parse(text);
                if (!Array.isArray(data.solves)) throw new Error('Not a valid CubeDesk export');

                const nameById = {};
                (data.sessions || []).forEach(s => { nameById[s.id] = s.name; });

                const groups = {}; // key: session_id + cube_type
                for (const solve of data.solves) {
                    if (typeof solve.raw_time !== 'number') continue;

                    const cubeType = solve.cube_type || '333';
                    const key = `${solve.session_id || 'default'}::${cubeType}`;
                    if (!groups[key]) {
                        const discipline = this._cubeDeskTypeToDiscipline(cubeType);
                        groups[key] = {
                            name: `${nameById[solve.session_id] || solve.session_id || 'Session'} (${cubeType})`,
                            discipline: discipline || '3x3',
                            disciplineRaw: cubeType,
                            unmapped: !discipline,
                            solves: [],
                            skipped: 0
                        };
                    }

                    const ts = typeof solve.started_at === 'number' ? solve.started_at : Date.now();
                    groups[key].solves.push({
                        id: `s_cd_${ts}_${Math.random().toString(36).slice(2, 7)}`,
                        time: Math.max(0, solve.raw_time),
                        timestamp: ts,
                        scramble: solve.scramble || '',
                        penalty: solve.plus_two ? 2 : null,
                        dnf: !!solve.dnf
                    });
                }

                return Object.values(groups);
            }

            // ─── Twisty Timer (.txt) ──────────────
            // Two shapes have been observed in the wild:
            //   1) Full backup (as documented in aricneto/TwistyTimer source): a comma
            //      header (cosmetic only) then ';'-delimited, '"'-quoted data rows:
            //      Puzzle,Category,Time(millis),Date(millis),Scramble,Penalty,Comment
            //      Penalty: 0 = none, 1 = +2 (already baked into Time), 2 = DNF
            //   2) A simpler "share/export" shape actually seen from real user files:
            //      no header at all, just 3 ';'-delimited quoted columns per line:
            //      "8.14";"R U2 F' ...";"2025-01-16T19:54:29.685+02:00"
            //      Time here is already plain decimal SECONDS, and there's no
            //      puzzle/penalty info in the file at all — the puzzle type has to be
            //      guessed from the filename (e.g. "Twisty_Timer_2x2.txt"), and every
            //      solve is treated as clean (no way to recover +2/DNF from this shape).
            _twistyTimerTypeToDiscipline(puzzle) {
                const map = {
                    '222': '2x2', '333': '3x3', '444': '4x4', '555': '5x5',
                    '666': '6x6', '777': '7x7',
                    'pyra': 'pyraminx', 'skewb': 'skewb', 'mega': 'megaminx'
                };
                return map[(puzzle || '').toLowerCase()] || null;
            }

            // Best-effort puzzle-type guess from a filename like "Twisty_Timer_2x2.txt"
            // or "twisty timer pyraminx export.txt".
            _guessDisciplineFromFilename(fileName) {
                const name = (fileName || '').toLowerCase();
                // Using (?<!\d)...(?!\d) instead of \b: \b doesn't create a boundary
                // between "_" and a digit (underscore counts as a word character), so
                // "Twisty_Timer_2x2.txt" would otherwise fail to match "2x2".
                const patterns = [
                    [/2x2x2|2x2|(?<!\d)222(?!\d)/, '2x2'],
                    [/3x3x3|3x3|(?<!\d)333(?!\d)/, '3x3'],
                    [/4x4x4|4x4|(?<!\d)444(?!\d)/, '4x4'],
                    [/5x5x5|5x5|(?<!\d)555(?!\d)/, '5x5'],
                    [/6x6x6|6x6|(?<!\d)666(?!\d)/, '6x6'],
                    [/7x7x7|7x7|(?<!\d)777(?!\d)/, '7x7'],
                    [/pyraminx|pyra/, 'pyraminx'],
                    [/skewb/, 'skewb'],
                    [/megaminx|mega/, 'megaminx']
                ];
                for (const [re, disc] of patterns) {
                    if (re.test(name)) return disc;
                }
                return null;
            }

            _parseCsvLine(line, delimiter) {
                // Handles a single "quoted;fields" line (Twisty Timer / Cubic Timer style).
                const out = [];
                let cur = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (ch === '"') {
                        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
                        else inQuotes = !inQuotes;
                    } else if (ch === delimiter && !inQuotes) {
                        out.push(cur); cur = '';
                    } else {
                        cur += ch;
                    }
                }
                out.push(cur);
                return out;
            }

            _parseTwistyTimerTxt(text, fileName) {
                const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
                if (lines.length === 0) throw new Error('Empty Twisty Timer file');

                // Detect which shape we're dealing with by checking the column count
                // of the first data-looking line.
                const probeCols = this._parseCsvLine(lines[0], ';');

                if (probeCols.length >= 7) {
                    // Shape 1: full backup, first line is a (comma) header to skip.
                    return this._parseTwistyTimerFull(lines);
                }

                // Shape 2: simple 3-column "time;scramble;date" export, no header,
                // no puzzle/penalty info in the file itself.
                return this._parseTwistyTimerSimple(lines, fileName);
            }

            _parseTwistyTimerFull(lines) {
                const groups = {};
                for (let i = 1; i < lines.length; i++) {
                    const cols = this._parseCsvLine(lines[i], ';');
                    if (cols.length < 7) continue;

                    const [puzzle, category, timeMs, dateMs, scramble, penaltyCode] = cols;
                    const key = `${puzzle}::${category}`;
                    if (!groups[key]) {
                        const discipline = this._twistyTimerTypeToDiscipline(puzzle);
                        groups[key] = {
                            name: category ? `${puzzle}-${category}` : puzzle,
                            discipline: discipline || '3x3',
                            disciplineRaw: puzzle,
                            unmapped: !discipline,
                            solves: [],
                            skipped: 0
                        };
                    }

                    const timeNum = parseInt(timeMs, 10);
                    if (isNaN(timeNum)) { groups[key].skipped++; continue; }

                    const penalty = penaltyCode === '1' ? 2 : null; // already baked into timeMs
                    const dnf = penaltyCode === '2';
                    const ts = parseInt(dateMs, 10) || Date.now();

                    groups[key].solves.push({
                        id: `s_tt_${ts}_${Math.random().toString(36).slice(2, 7)}`,
                        time: Math.max(0, timeNum - (penalty ? 2000 : 0)) / 1000,
                        timestamp: ts,
                        scramble: scramble || '',
                        penalty,
                        dnf
                    });
                }

                return Object.values(groups);
            }

            _parseTwistyTimerSimple(lines, fileName) {
                const discipline = this._guessDisciplineFromFilename(fileName);
                const group = {
                    name: fileName ? fileName.replace(/\.[^.]+$/, '') : 'Twisty Timer Import',
                    discipline: discipline || '3x3',
                    disciplineRaw: fileName || '?',
                    unmapped: !discipline,
                    solves: [],
                    skipped: 0
                };

                for (const line of lines) {
                    const cols = this._parseCsvLine(line, ';');
                    if (cols.length < 3) { group.skipped++; continue; }

                    const [timeStr, scramble, dateStr] = cols;
                    const timeNum = parseFloat(timeStr);
                    if (isNaN(timeNum) || timeNum <= 0) { group.skipped++; continue; }

                    const ts = this._parseDateFlexible(dateStr) || Date.now();

                    // This export shape carries no penalty/DNF information at all, so
                    // every solve here is imported as clean.
                    group.solves.push({
                        id: `s_tt_${ts}_${Math.random().toString(36).slice(2, 7)}`,
                        time: timeNum,
                        timestamp: ts,
                        scramble: scramble || '',
                        penalty: null,
                        dnf: false
                    });
                }

                return [group];
            }

            _parseDateFlexible(str) {
                if (!str) return null;
                const n = Number(str);
                if (!isNaN(n) && n > 0) {
                    // Could be seconds or already millis; treat as millis if it's a huge number.
                    return n > 1e12 ? n : n * 1000;
                }
                const parsed = Date.parse(str);
                return isNaN(parsed) ? null : parsed;
            }

            // ─── Last Cube X (.csv) ──────────────
            // No public spec exists for this closed-source app, but a real user export
            // confirmed the actual shape: ';'-delimited, '"'-quoted, WITH a header that
            // closely mirrors Twisty Timer's own format:
            //   Puzzle;Session;Time(millis);Date(millis);Scramble;Penalty;Remark;Reconstruction
            // Time(millis) is plain integer milliseconds (NOT the ambiguous digit-entry
            // format used elsewhere in this app) — dividing by 1000 gives seconds
            // directly. Puzzle values are WCA long-form ("3x3x3", "Pyraminx", "Square-1"),
            // and Session is a separate, sometimes-translated display name (e.g. a user
            // can rename "Pyraminx" to "Пирамидка"). Penalty follows the same 0/1/2
            // convention as Twisty Timer (0 = none, 1 = +2 baked into Time, 2 = DNF),
            // given how closely the two header shapes match.
            //
            // If a file doesn't match this header, we fall back to a generic heuristic
            // column-sniffer so other Last Cube X versions/exports still have a chance.
            _lastCubeXPuzzleToDiscipline(puzzle) {
                const p = (puzzle || '').toLowerCase().trim();
                const map = {
                    '2x2x2': '2x2', '2x2': '2x2',
                    '3x3x3': '3x3', '3x3': '3x3',
                    '4x4x4': '4x4', '4x4': '4x4',
                    '5x5x5': '5x5', '5x5': '5x5',
                    '6x6x6': '6x6', '6x6': '6x6',
                    '7x7x7': '7x7', '7x7': '7x7',
                    'pyraminx': 'pyraminx', 'skewb': 'skewb', 'megaminx': 'megaminx'
                };
                return map[p] || null;
            }

            _parseLastCubeXCsv(text) {
                const delimiter = text.includes(';') ? ';' : ',';
                const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
                if (lines.length === 0) throw new Error('Empty file');

                const header = this._parseCsvLine(lines[0], delimiter).map(h => h.trim().toLowerCase());
                const puzzleIdx = header.indexOf('puzzle');
                const sessionIdx = header.indexOf('session');
                const timeIdx = header.findIndex(h => h.startsWith('time'));
                const dateIdx = header.findIndex(h => h.startsWith('date'));
                const scrambleIdx = header.indexOf('scramble');
                const penaltyIdx = header.indexOf('penalty');
                const isMillis = timeIdx !== -1 && header[timeIdx].includes('millis');

                if (timeIdx !== -1 && puzzleIdx !== -1) {
                    // Confirmed real shape (or close enough to it)
                    return this._parseLastCubeXKnownShape(lines, delimiter, {
                        puzzleIdx, sessionIdx, timeIdx, dateIdx, scrambleIdx, penaltyIdx, isMillis
                    });
                }

                return this._parseLastCubeXHeuristic(lines, delimiter, header);
            }

            _parseLastCubeXKnownShape(lines, delimiter, idx) {
                const groups = {};

                for (let i = 1; i < lines.length; i++) {
                    const cols = this._parseCsvLine(lines[i], delimiter);
                    if (cols.length <= idx.timeIdx) continue;

                    const rawPuzzle = cols[idx.puzzleIdx] || '3x3';
                    const rawSession = idx.sessionIdx !== -1 ? cols[idx.sessionIdx] : rawPuzzle;
                    const key = `${rawPuzzle}::${rawSession}`;

                    if (!groups[key]) {
                        const discipline = this._lastCubeXPuzzleToDiscipline(rawPuzzle);
                        groups[key] = {
                            name: rawSession || rawPuzzle,
                            discipline: discipline || '3x3',
                            disciplineRaw: rawPuzzle,
                            unmapped: !discipline,
                            solves: [],
                            skipped: 0
                        };
                    }

                    const rawTime = cols[idx.timeIdx];
                    const timeNum = idx.isMillis ? parseInt(rawTime, 10) : parseFloat(rawTime);
                    if (isNaN(timeNum)) { groups[key].skipped++; continue; }

                    const penaltyCode = idx.penaltyIdx !== -1 ? cols[idx.penaltyIdx] : '0';
                    const dnf = penaltyCode === '2';
                    const penalty = (!dnf && penaltyCode === '1') ? 2 : null;
                    const timeMs = idx.isMillis ? timeNum : Math.round(timeNum * 1000);
                    const rawDate = idx.dateIdx !== -1 ? cols[idx.dateIdx] : null;
                    const ts = this._parseDateFlexible(rawDate) || Date.now();

                    groups[key].solves.push({
                        id: `s_lcx_${ts}_${Math.random().toString(36).slice(2, 7)}`,
                        time: Math.max(0, timeMs - (penalty ? 2000 : 0)) / 1000,
                        timestamp: ts,
                        scramble: idx.scrambleIdx !== -1 ? (cols[idx.scrambleIdx] || '') : '',
                        penalty,
                        dnf
                    });
                }

                return Object.values(groups);
            }

            // Fallback for Last Cube X files that don't match the known header shape.
            _parseLastCubeXHeuristic(lines, delimiter, header) {
                const findCol = (...names) => header.findIndex(h => names.some(n => h.includes(n)));

                const timeIdx = findCol('time');
                const scrambleIdx = findCol('scramble');
                const dateIdx = findCol('date', 'created', 'timestamp');
                const penaltyIdx = findCol('penalty', '+2', 'plustwo');
                const dnfIdx = findCol('dnf');
                const puzzleIdx = findCol('puzzle', 'cube', 'type', 'event');

                const hasHeader = timeIdx !== -1;
                const startRow = hasHeader ? 1 : 0;

                const groups = {};
                let globalSkipped = 0;

                for (let i = startRow; i < lines.length; i++) {
                    const cols = this._parseCsvLine(lines[i], delimiter);

                    const rawTime = hasHeader ? cols[timeIdx] : cols[0];
                    const rawScramble = hasHeader && scrambleIdx !== -1 ? cols[scrambleIdx] : cols[1];
                    const rawDate = hasHeader && dateIdx !== -1 ? cols[dateIdx] : cols[2];
                    const rawPuzzle = hasHeader && puzzleIdx !== -1 ? cols[puzzleIdx] : null;
                    const rawDnf = hasHeader && dnfIdx !== -1 ? cols[dnfIdx] : null;
                    const rawPenalty = hasHeader && penaltyIdx !== -1 ? cols[penaltyIdx] : null;

                    const dnfFromColumn = /^(dnf|yes|true|1)$/i.test(String(rawDnf || '').trim());
                    const timeText = String(rawTime || '').trim();
                    const parsed = this._parseTimeInput(timeText);

                    if (!parsed && !dnfFromColumn) { globalSkipped++; continue; }

                    const puzzleKey = (rawPuzzle || '3x3').toLowerCase().trim();
                    if (!groups[puzzleKey]) {
                        const discipline = this._lastCubeXPuzzleToDiscipline(puzzleKey);
                        groups[puzzleKey] = {
                            name: 'Last Cube X Import',
                            discipline: discipline || '3x3',
                            disciplineRaw: rawPuzzle || '3x3',
                            unmapped: !!rawPuzzle && !discipline,
                            solves: [],
                            skipped: 0
                        };
                    }

                    const dnf = dnfFromColumn || (parsed && parsed.dnf);
                    const penalty = !dnf && /^(\+2|yes|true|1)$/i.test(String(rawPenalty || '')) ? 2 : null;
                    const ts = this._parseDateFlexible(rawDate) || Date.now();

                    groups[puzzleKey].solves.push({
                        id: `s_lcx_${ts}_${Math.random().toString(36).slice(2, 7)}`,
                        time: (dnf || !parsed) ? 0 : parsed.time,
                        timestamp: ts,
                        scramble: rawScramble || '',
                        penalty,
                        dnf
                    });
                }

                const result = Object.values(groups);
                if (result.length > 0) result[0].skipped = globalSkipped;
                return result;
            }

            // ════════════════════════════════════════════════════════════
            // Exporters — convert this app's data INTO another timer's format
            // ════════════════════════════════════════════════════════════

            _disciplineToCstScrType(discipline) {
                const map = {
                    '2x2': '222so', '3x3': '333', '4x4': '444wca', '5x5': '555wca',
                    '6x6': '666wca', '7x7': '777wca',
                    'pyraminx': 'pyrso', 'skewb': 'skbso', 'megaminx': 'mgmp'
                };
                return map[discipline] || '333';
            }

            // Shared by "csTimer" and "Last Cube X" (which also accepts csTimer-format files).
            _exportToCstimerFormat(filenamePrefix) {
                const sessionData = {};
                const out = {};
                let idx = 0;

                for (const key of Object.keys(this.sessions)) {
                    const session = this.sessions[key];
                    idx++;
                    sessionData[idx] = {
                        name: session.name,
                        opt: { scrType: this._disciplineToCstScrType(session.discipline) },
                        rank: idx
                    };

                    out[`session${idx}`] = session.solves.map(s => {
                        const penalty = s.dnf ? -1 : (s.penalty ? Math.round(s.penalty * 1000) : 0);
                        return [
                            [penalty, Math.round(s.time * 1000)],
                            s.scramble || '',
                            '',
                            Math.round((s.timestamp || Date.now()) / 1000)
                        ];
                    });
                }

                out.properties = { sessionData: JSON.stringify(sessionData) };
                this._downloadFile(`${filenamePrefix}_${Date.now()}.txt`, JSON.stringify(out), 'text/plain');
            }

            _disciplineToCubeDeskType(discipline) {
                const map = {
                    '2x2': '222', '3x3': '333', '4x4': '444', '5x5': '555',
                    '6x6': '666', '7x7': '777',
                    'pyraminx': 'pyraminx', 'skewb': 'skewb', 'megaminx': 'minx'
                };
                return map[discipline] || '333';
            }

            _exportToCubeDeskFormat() {
                const sessions = [];
                const solves = [];
                let order = 0;

                for (const key of Object.keys(this.sessions)) {
                    const session = this.sessions[key];
                    order++;
                    sessions.push({ id: key, name: session.name, order });

                    const cubeType = this._disciplineToCubeDeskType(session.discipline);
                    for (const s of session.solves) {
                        const ts = s.timestamp || Date.now();
                        solves.push({
                            id: `s_${ts}_${Math.random().toString(36).slice(2, 7)}`,
                            time: s.dnf ? -1 : (s.time + (s.penalty || 0)),
                            raw_time: s.time,
                            cube_type: cubeType,
                            scramble: s.scramble || '',
                            session_id: key,
                            started_at: ts,
                            ended_at: ts + Math.round(s.time * 1000),
                            dnf: !!s.dnf,
                            plus_two: !!s.penalty,
                            notes: '',
                            trainer_name: null,
                            created_at: new Date(ts).toISOString(),
                            from_timer: true,
                            bulk: false
                        });
                    }
                }

                this._downloadFile(`firecube_cubedesk_${Date.now()}.txt`, JSON.stringify({ sessions, solves }), 'text/plain');
            }

            _disciplineToTwistyTimerType(discipline) {
                const map = {
                    '2x2': '222', '3x3': '333', '4x4': '444', '5x5': '555',
                    '6x6': '666', '7x7': '777',
                    'pyraminx': 'pyra', 'skewb': 'skewb', 'megaminx': 'mega'
                };
                return map[discipline] || '333';
            }

            _exportToTwistyTimerFormat() {
                let out = 'Puzzle,Category,Time(millis),Date(millis),Scramble,Penalty,Comment\n';

                for (const key of Object.keys(this.sessions)) {
                    const session = this.sessions[key];
                    const puzzle = this._disciplineToTwistyTimerType(session.discipline);

                    for (const s of session.solves) {
                        const timeMs = Math.round((s.time + (s.penalty || 0)) * 1000);
                        const penaltyCode = s.dnf ? 2 : (s.penalty ? 1 : 0);
                        const ts = s.timestamp || Date.now();
                        out += `"${puzzle}";"${session.name.replace(/"/g, '""')}";"${timeMs}";"${ts}";"${(s.scramble || '').replace(/"/g, '""')}";"${penaltyCode}";""\n`;
                    }
                }

                this._downloadFile(`firecube_twistytimer_${Date.now()}.txt`, out, 'text/plain');
            }

            // ─── Import/Export menu wiring ──────────────
            _handleImportChoice(source) {
                const t = this._ieT();

                const parsersAndLabels = {
                    firecube: { label: 'FireCube Timer', parse: (txt, name) => this._parseFireCubeJson(txt) },
                    cstimer: { label: 'csTimer', parse: (txt, name) => this._parseCstimerTxt(txt) },
                    lastcubex: { label: 'Last Cube X', parse: (txt, name) => this._parseLastCubeXCsv(txt) },
                    cubedesk: { label: 'CubeDesk', parse: (txt, name) => this._parseCubeDeskTxt(txt) },
                    twistytimer: { label: 'Twisty Timer', parse: (txt, name) => this._parseTwistyTimerTxt(txt, name) }
                };

                const entry = parsersAndLabels[source];
                if (!entry) return;

                DOM('importExportOverlay').classList.remove('visible');

                this._pickFile((text, fileName) => {
                    try {
                        const parsedSessions = entry.parse(text, fileName);
                        this._finishImport(entry.label, parsedSessions);
                    } catch (error) {
                        alert(`Error importing ${entry.label} data: ` + error.message);
                    }
                });
            }

            _handleExportChoice(source) {
                DOM('importExportOverlay').classList.remove('visible');
                switch (source) {
                    case 'firecube': this.exportData(); break;
                    case 'cstimer': this._exportToCstimerFormat('firecube_cstimer'); break;
                    case 'lastcubex': this._exportToCstimerFormat('firecube_lastcubex'); break;
                    case 'cubedesk': this._exportToCubeDeskFormat(); break;
                    case 'twistytimer': this._exportToTwistyTimerFormat(); break;
                }
            }

            importData() {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json,application/json';
                
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    const reader = new FileReader();
                    
                    reader.onload = (event) => {
                        try {
                            const data = JSON.parse(event.target.result);
                            
                            // Check if it's new format (sessions) or old format (single session)
                            if (data.sessions) {
                                this.sessions = data.sessions;
                                this.currentSessionId = data.currentSessionId || 'no-session';
                            } else if (data.solves) {
                                // Old format - import to current session
                                const currentSession = this.sessions[this.currentSessionId];
                                currentSession.solves = data.solves;
                            }
                            
                            this.saveSessions();
                            this.updateUI();
                            this.updateSessionDropdown();
                            alert('Data imported successfully!');
                        } catch (error) {
                            alert('Error importing data: ' + error.message);
                        }
                    };
                    
                    reader.readAsText(file);
                };
                
                input.click();
            }
        }

        // ══════════════════════════════════════════
        // HotkeyManager — keyboard navigation & hotkeys
        // ══════════════════════════════════════════
        class HotkeyManager {
            constructor() {
                // ── state ──
                this.kbNavActive = false;      // keyboard-navigation mode on/off
                this.settingsFocus = 'sidebar'; // 'sidebar' | 'content'
                this.sidebarIndex = 0;          // active nav item index in settings sidebar
                this.contentIndex = 0;          // active element index inside settings section
                this.solveHistoryIndex = -1;    // focused row in solve history table (-1 = none)
                this.sessionListIndex = 0;      // focused row in sessions list
                this.sessionsFocus = 'list';    // 'list' | 'history' — current focus level in Sessions

                // DOM refs (resolved lazily after DOMContentLoaded)
                this.hintEl = document.getElementById('hotkeyHint');

                // Show hint briefly on load so user knows hotkeys exist
                this._showHintBrief();

                this._initListeners();
            }

            // ── helpers ──────────────────────────────

            _isTyping() {
                const tag = document.activeElement?.tagName;
                return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
            }

            _isTimerBusy() {
                return window.timer && (window.timer.isRunning || window.timer.isInspecting);
            }

            _overlayVisible(id) {
                return document.getElementById(id)?.classList.contains('visible');
            }

            _toggleOverlay(id, openFn) {
                if (this._overlayVisible(id)) {
                    document.getElementById(id).classList.remove('visible');
                    // Clear focus and reset nav state on close
                    this._clearAllFocus();
                    if (id === 'settingsOverlay') {
                        this.settingsFocus = 'sidebar';
                        this.sidebarIndex = 0;
                        this.contentIndex = 0;
                    }
                    if (id === 'sessionsOverlay') {
                        this.sessionListIndex = 0;
                        this.solveHistoryIndex = -1;
                        this.sessionsFocus = 'list';
                    }
                } else {
                    if (openFn) openFn();
                    else document.getElementById(id).classList.add('visible');
                }
            }

            // ── keyboard-nav mode ─────────────────────

            _activateKbNav() {
                if (this.kbNavActive) return;
                this.kbNavActive = true;
                document.body.classList.add('kb-nav-active');
                this.hintEl?.classList.add('visible');
            }

            _deactivateKbNav() {
                if (!this.kbNavActive) return;
                this.kbNavActive = false;
                document.body.classList.remove('kb-nav-active');
                this.hintEl?.classList.remove('visible');
                this._clearAllFocus();
            }

            _showHintBrief() {
                setTimeout(() => {
                    this.hintEl?.classList.add('visible');
                    setTimeout(() => this.hintEl?.classList.remove('visible'), 3000);
                }, 800);
            }

            // ── focus ring helpers ────────────────────

            _clearAllFocus() {
                document.querySelectorAll('.kb-focus').forEach(el => el.classList.remove('kb-focus'));
                this.solveHistoryIndex = -1;
            }

            _focusEl(el) {
                this._clearAllFocus();
                if (el) el.classList.add('kb-focus');
            }

            // ── settings keyboard navigation ──────────

            _getNavItems() {
                return [...document.querySelectorAll('.settings-nav-item')];
            }

            _getContentFocusables() {
                // All interactive elements in the active settings section
                const activeSection = document.querySelector('.settings-section-content.active');
                if (!activeSection) return [];
                return [...activeSection.querySelectorAll(
                    'button:not([disabled]), input[type="range"], input[type="checkbox"], .toggle-switch, .theme-btn, .color-option-new, .mood-card:not(.disabled), .lang-btn-new, .segmented-btn'
                )].filter(el => {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                });
            }

            _navigateSettings(key) {
                const navItems = this._getNavItems();

                if (this.settingsFocus === 'sidebar') {
                    if (key === 'ArrowUp') {
                        this.sidebarIndex = Math.max(0, this.sidebarIndex - 1);
                        this._focusEl(navItems[this.sidebarIndex]);
                    } else if (key === 'ArrowDown') {
                        // If no focus shown yet (first arrow press), just show it at current index
                        const hasFocus = navItems.some(n => n.classList.contains('kb-focus'));
                        if (!hasFocus) {
                            this._focusEl(navItems[this.sidebarIndex]);
                        } else {
                            this.sidebarIndex = Math.min(navItems.length - 1, this.sidebarIndex + 1);
                            this._focusEl(navItems[this.sidebarIndex]);
                        }
                    } else if (key === 'ArrowRight' || key === 'Enter') {
                        // If nothing focused yet, focus first item first
                        const hasFocus = navItems.some(n => n.classList.contains('kb-focus'));
                        if (!hasFocus) {
                            this._focusEl(navItems[this.sidebarIndex]);
                            return;
                        }
                        // Activate the nav item and move focus to content
                        navItems[this.sidebarIndex]?.click();
                        this.settingsFocus = 'content';
                        this.contentIndex = 0;
                        setTimeout(() => {
                            this._focusEl(this._getContentFocusables()[0]);
                        }, 50);
                    }
                } else { // content
                    const focusables = this._getContentFocusables();
                    if (key === 'ArrowUp') {
                        this.contentIndex = Math.max(0, this.contentIndex - 1);
                        this._focusEl(focusables[this.contentIndex]);
                    } else if (key === 'ArrowDown') {
                        this.contentIndex = Math.min(focusables.length - 1, this.contentIndex + 1);
                        this._focusEl(focusables[this.contentIndex]);
                    } else if (key === 'ArrowLeft') {
                        // Return to sidebar
                        this.settingsFocus = 'sidebar';
                        this._focusEl(navItems[this.sidebarIndex]);
                    } else if (key === 'Enter' || key === 'ArrowRight') {
                        const el = focusables[this.contentIndex];
                        if (el) el.click();
                        // Re-focus after click (state may have changed)
                        setTimeout(() => {
                            const updated = this._getContentFocusables();
                            const next = updated[this.contentIndex] || updated[updated.length - 1];
                            this._focusEl(next);
                        }, 50);
                    }
                }
            }

            // ── sessions list keyboard navigation ─────

            _getSessionItems() {
                return [...document.querySelectorAll('#sessionsList .session-item')];
            }

            _focusSessionItem(index) {
                const items = this._getSessionItems();
                if (!items.length) return;
                this.sessionListIndex = Math.max(0, Math.min(items.length - 1, index));
                this._activateKbNav();
                this._clearAllFocus();
                items[this.sessionListIndex].classList.add('kb-focus');
                items[this.sessionListIndex].scrollIntoView({ block: 'nearest' });
            }

            _navigateSessions(key) {
                if (this.sessionsFocus === 'history') {
                    // ══ LEVEL 2: Solve History rows ══
                    const rows = this._getSolveRows();

                    if (key === 'ArrowLeft') {
                        // ← go back to session list
                        this.sessionsFocus = 'list';
                        this.solveHistoryIndex = -1;
                        this._clearAllFocus();
                        // Close solve history panel
                        const timer = window.timer || window.sessionsManager;
                        timer?.closeSolveHistory();
                        // Re-focus the session list item
                        setTimeout(() => {
                            const items = this._getSessionItems();
                            const activeIdx = items.findIndex(i => i.classList.contains('active'));
                            this.sessionListIndex = activeIdx >= 0 ? activeIdx : this.sessionListIndex;
                            if (items[this.sessionListIndex]) {
                                this._activateKbNav();
                                items[this.sessionListIndex].classList.add('kb-focus');
                                items[this.sessionListIndex].scrollIntoView({ block: 'nearest' });
                            }
                        }, 30);
                        return;
                    }

                    if (!rows.length) return;

                    if (key === 'ArrowUp') {
                        if (this.solveHistoryIndex < 0) {
                            // First arrow press — jump to first row
                            this._focusSolveRow(0);
                        } else {
                            this._focusSolveRow(Math.max(0, this.solveHistoryIndex - 1));
                        }
                    } else if (key === 'ArrowDown') {
                        if (this.solveHistoryIndex < 0) {
                            this._focusSolveRow(0);
                        } else {
                            this._focusSolveRow(this.solveHistoryIndex + 1);
                        }
                    } else if (key === 'Delete' || key === 'Backspace') {
                        if (this.solveHistoryIndex >= 0) {
                            const prevIdx = this.solveHistoryIndex;
                            this._solveRowAction('delete');
                            setTimeout(() => {
                                const newRows = this._getSolveRows();
                                if (!newRows.length) {
                                    // No rows left — go back to list
                                    this.sessionsFocus = 'list';
                                    this.solveHistoryIndex = -1;
                                    this._clearAllFocus();
                                } else {
                                    this._focusSolveRow(Math.max(0, prevIdx - 1));
                                }
                            }, 250);
                        }
                    } else if (key.toLowerCase() === 'd') {
                        if (this.solveHistoryIndex >= 0) {
                            const idx = this.solveHistoryIndex;
                            this._solveRowAction('dnf');
                            // Re-focus after DOM refresh
                            setTimeout(() => this._focusSolveRow(idx), 100);
                        }
                    } else if (key === '+' || key === 'NumpadAdd') {
                        if (this.solveHistoryIndex >= 0) {
                            const idx = this.solveHistoryIndex;
                            this._solveRowAction('penalty');
                            setTimeout(() => this._focusSolveRow(idx), 100);
                        }
                    } else if (key.toLowerCase() === 'e') {
                        if (this.solveHistoryIndex >= 0) {
                            this._solveRowAction('edit');
                        }
                    }

                } else {
                    // ══ LEVEL 1: Session list ══
                    const items = this._getSessionItems();
                    if (!items.length) return;

                    if (key === 'ArrowUp') {
                        const hasFocus = items.some(i => i.classList.contains('kb-focus'));
                        if (!hasFocus) {
                            // First arrow: start at active session
                            const activeIdx = items.findIndex(i => i.classList.contains('active'));
                            this.sessionListIndex = activeIdx >= 0 ? activeIdx : 0;
                        } else {
                            this.sessionListIndex = Math.max(0, this.sessionListIndex - 1);
                        }
                        this._focusSessionItem(this.sessionListIndex);

                    } else if (key === 'ArrowDown') {
                        const hasFocus = items.some(i => i.classList.contains('kb-focus'));
                        if (!hasFocus) {
                            const activeIdx = items.findIndex(i => i.classList.contains('active'));
                            this.sessionListIndex = activeIdx >= 0 ? activeIdx : 0;
                        } else {
                            this.sessionListIndex = Math.min(items.length - 1, this.sessionListIndex + 1);
                        }
                        this._focusSessionItem(this.sessionListIndex);

                    } else if (key === 'Enter') {
                        // Enter on session list → switch to that session
                        if (items[this.sessionListIndex]) {
                            items[this.sessionListIndex].click();
                            // Re-focus after click re-renders list
                            setTimeout(() => {
                                const updated = this._getSessionItems();
                                const activeIdx = updated.findIndex(i => i.classList.contains('active'));
                                this.sessionListIndex = activeIdx >= 0 ? activeIdx : 0;
                                this._focusSessionItem(this.sessionListIndex);
                            }, 50);
                        }

                    } else if (key === 'ArrowRight') {
                        // → enter Solve History of the focused session
                        // First make sure we actually have a kb-focus on a session item
                        const hasFocus = items.some(i => i.classList.contains('kb-focus'));
                        if (!hasFocus) {
                            // No focus yet — just show the focus ring, don't open history
                            const activeIdx = items.findIndex(i => i.classList.contains('active'));
                            this.sessionListIndex = activeIdx >= 0 ? activeIdx : 0;
                            this._focusSessionItem(this.sessionListIndex);
                            return;
                        }

                        const item = items[this.sessionListIndex];
                        const timer = window.timer || window.sessionsManager;
                        if (!timer) return;

                        // Switch session if needed, then open history
                        if (item && !item.classList.contains('active')) {
                            item.click();
                            // Wait for session switch to complete
                            setTimeout(() => {
                                timer.openSolveHistory();
                                this.sessionsFocus = 'history';
                                this.solveHistoryIndex = -1;
                                setTimeout(() => {
                                    const rows = this._getSolveRows();
                                    if (rows.length) this._focusSolveRow(0);
                                }, 100);
                            }, 150);
                        } else {
                            // Already active session — open immediately
                            timer.openSolveHistory();
                            this.sessionsFocus = 'history';
                            this.solveHistoryIndex = -1;
                            setTimeout(() => {
                                const rows = this._getSolveRows();
                                if (rows.length) this._focusSolveRow(0);
                            }, 80);
                        }
                    }
                }
            }

            _getSolveRows() {
                return [...document.querySelectorAll('#solveHistoryTableBody tr')];
            }

            _focusSolveRow(index) {
                const rows = this._getSolveRows();
                if (!rows.length) return;
                this.solveHistoryIndex = Math.max(0, Math.min(rows.length - 1, index));
                this._activateKbNav(); // ensure kb-nav is active
                // Clear focus WITHOUT resetting solveHistoryIndex
                document.querySelectorAll('.kb-focus').forEach(el => el.classList.remove('kb-focus'));
                const row = rows[this.solveHistoryIndex];
                row.classList.add('kb-focus');
                row.scrollIntoView({ block: 'nearest' });
                // Show action buttons only for focused row, hide others
                rows.forEach((r, i) => {
                    r.querySelectorAll('.solve-actions').forEach(a => {
                        a.style.opacity = i === this.solveHistoryIndex ? '1' : '';
                    });
                });
            }

            _solveRowAction(action) {
                const rows = this._getSolveRows();
                if (this.solveHistoryIndex < 0 || !rows[this.solveHistoryIndex]) return;
                const row = rows[this.solveHistoryIndex];
                const btn = row.querySelector(`[data-action="${action}"]`);
                if (btn) btn.click();
            }

            // ── main listener ─────────────────────────

            _initListeners() {
                // Deactivate kb-nav on mouse click
                document.addEventListener('mousedown', (e) => {
                    // Don't deactivate kb-nav if clicking inside an overlay (sessions, settings, stats)
                    const insideOverlay = e.target.closest('.overlay, .sessions-overlay, .settings-overlay, .statistics-overlay, #sessionsOverlay, #settingsOverlay, #statisticsOverlay');
                    if (!insideOverlay) this._deactivateKbNav();
                });

                document.addEventListener('keydown', (e) => {
                    // ── activate nav mode on arrow keys ──
                    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
                        this._activateKbNav();
                    }

                    // ── ESC: close hint / deactivate ──
                    if (e.key === 'Escape') {
                        if (this._isTyping()) return;
                        this._clearAllFocus();
                        this.settingsFocus = 'sidebar';
                        this.sidebarIndex = 0;
                        this.contentIndex = 0;
                        this.sessionListIndex = 0;
                        this.solveHistoryIndex = -1;
                        this.sessionsFocus = 'list';
                        this._deactivateKbNav();
                        return; // ESC overlay-close already handled in SettingsManager
                    }

                    // ══ SETTINGS OVERLAY OPEN ══
                    if (this._overlayVisible('settingsOverlay')) {
                        if (this._isTyping()) return;
                        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(e.key)) {
                            e.preventDefault();
                            this._navigateSettings(e.key);
                        }
                        return; // don't fire hotkeys while settings open
                    }

                    // ══ SESSIONS OVERLAY OPEN ══
                    if (this._overlayVisible('sessionsOverlay')) {
                        // Allow typing in inputs inside the overlay (e.g. new session name)
                        if (this._isTyping() && !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Escape'].includes(e.key)) return;
                        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(e.key) ||
                            ['d','e','+'].includes(e.key.toLowerCase()) ||
                            e.key === 'Delete' || e.key === 'Backspace') {
                            e.preventDefault();
                            this._navigateSessions(e.key);
                        }
                        return;
                    }

                    // ── never intercept when typing in a field ──
                    if (this._isTyping()) return;

                    // ══ STATISTICS OVERLAY OPEN ══
                    if (this._overlayVisible('statisticsOverlay')) return;
                    if (this._overlayVisible('shopConfirmOverlay')) return;
                    if (this._overlayVisible('progressionOverlay')) {
                        if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
                            e.preventDefault();
                            DOM('progressionOverlay')?.classList.remove('visible');
                        }
                        return;
                    }
                    if (this._overlayVisible('shopOverlay')) {
                        if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey) {
                            e.preventDefault();
                            DOM('shopOverlay')?.classList.remove('visible');
                        }
                        return;
                    }

                    // ══ GLOBAL HOTKEYS (main screen only) ══
                    // Block hotkeys during timer running or inspection
                    if (this._isTimerBusy()) return;

                    const key = e.key;

                    // Section toggles
                    if (key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        this._toggleOverlay('sessionsOverlay', () => window.timer?.openSessions());
                        return;
                    }
                    if (key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        window.progression?.open('achievements');
                        return;
                    }
                    if (key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        window.progression?.openShop();
                        return;
                    }
                    if (key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        this._toggleOverlay('statisticsOverlay', () => window.timer?.openStatistics());
                        return;
                    }

                    // Solve actions (last solve)
                    if (key === 'Delete' || key === 'Backspace') {
                        e.preventDefault();
                        window.timer?.deleteSolve();
                        return;
                    }
                    if (key.toLowerCase() === 'd') {
                        e.preventDefault();
                        window.timer?.markDNF();
                        return;
                    }
                    if (key === '+' || key === 'NumpadAdd' || (e.code === 'NumpadAdd')) {
                        e.preventDefault();
                        window.timer?.addPenalty();
                        return;
                    }
                    if (key.toLowerCase() === 'e') {
                        e.preventDefault();
                        window.timer?.editSolve();
                        return;
                    }
                });
            }
        }

        // ══════════════════════════════════════════════════════════════
        // WCA-Compatible Scramble Engine  (CubeTimer 0.9.1)
        // Inspired by TNoodle architecture — strategy pattern per discipline
        // ══════════════════════════════════════════════════════════════

        // ── Utility ──────────────────────────────────────────────────
        const _rnd = (n) => Math.floor(Math.random() * n);
        const _pick = (arr) => arr[_rnd(arr.length)];

        // ── Base: WCA Cube Generator ──────────────────────────────────
        // Core WCA rule: faces grouped by axis.
        // After a move on axis X, the NEXT move on axis X must be the opposite face.
        // After that, no further move on axis X until a different axis is used.
        // This exactly mirrors TNoodle's cube scramble model.
        class WCA_CubeGenerator {
            // Subclasses define face groups and slice moves
            static get FACE_GROUPS() {
                // [ [face1, face2], ... ] — face1 and face2 share the same axis
                return [ ['R','L'], ['U','D'], ['F','B'] ];
            }

            // Outer-layer modifiers (WCA standard)
            static get OUTER_MODS() { return ["", "'", "2"]; }

            // Wide-move layers and their modifier sets (overridden in big-cube subclasses)
            static get WIDE_MOVES() { return []; }

            // Total scramble length
            static get LENGTH() { return 20; }

            static generate() {
                const groups = this.FACE_GROUPS;
                const outerMods = this.OUTER_MODS;
                const wideMoves = this.WIDE_MOVES;
                const length = this.LENGTH;

                // Map each face to its group index and partner
                const faceGroup = {};   // face -> groupIndex
                const facePartner = {}; // face -> opposite face in group
                groups.forEach(([a, b], idx) => {
                    faceGroup[a] = idx;  faceGroup[b] = idx;
                    facePartner[a] = b;  facePartner[b] = a;
                });

                const allFaces = groups.flat();
                const result = [];

                let lastGroupIdx = -1;   // axis used in last move
                let lastFace = '';       // exact face used in last move
                let sameAxisCount = 0;   // consecutive moves on same axis

                for (let i = 0; i < length; i++) {
                    let face;

                    // Try to pick a valid face
                    const available = allFaces.filter(f => {
                        const gIdx = faceGroup[f];
                        if (gIdx !== lastGroupIdx) return true;          // different axis → always ok
                        if (sameAxisCount >= 2) return false;            // 3rd move on same axis → forbidden
                        if (f === lastFace) return false;                // same face → forbidden
                        if (f === facePartner[lastFace]) return true;    // opposite face → ok (once)
                        return false;
                    });

                    if (available.length === 0) {
                        // Fallback: pick any face from a different axis
                        const otherGroups = allFaces.filter(f => faceGroup[f] !== lastGroupIdx);
                        face = _pick(otherGroups.length ? otherGroups : allFaces);
                    } else {
                        face = _pick(available);
                    }

                    const gIdx = faceGroup[face];
                    if (gIdx === lastGroupIdx) {
                        sameAxisCount++;
                    } else {
                        sameAxisCount = 1;
                    }
                    lastGroupIdx = gIdx;
                    lastFace = face;

                    // Wide move chance (for big cubes): decide if this face gets a wide variant
                    const wideForFace = wideMoves.filter(w => w.face === face);
                    let moveStr;
                    if (wideForFace.length && Math.random() < wideForFace[0].chance) {
                        const w = _pick(wideForFace);
                        const layer = _pick(w.layers); // e.g. 'Rw', '3Rw', '2Uw' — already contains 'w'
                        const mod = _pick(outerMods);  // '', "'", '2'
                        moveStr = layer + mod;          // correct: 'Rw', 'Rw\'', 'Rw2', '3Rw2' etc.
                    } else {
                        moveStr = face + _pick(outerMods);
                    }

                    result.push(moveStr);
                }

                return result.join(' ');
            }
        }

        // ── 3×3 ──────────────────────────────────────────────────────
        // WCA: 20 moves, no same-axis triple, standard outer moves only
        class WCA_3x3 extends WCA_CubeGenerator {
            static get LENGTH() { return 20; }
        }

        // ── 2×2 ──────────────────────────────────────────────────────
        // WCA: 9–11 moves, only 3 independent faces (R,U,F)
        // (L,D,B are equivalent by symmetry; 2x2 is solved in one corner's reference)
        class WCA_2x2 extends WCA_CubeGenerator {
            static get FACE_GROUPS() { return [ ['R'], ['U'], ['F'] ]; } // single-face groups
            static get LENGTH() { return 10; }

            static generate() {
                const faces = ['R','U','F'];
                const mods  = ["","'","2"];
                const result = [];
                let last = '';
                for (let i = 0; i < this.LENGTH; i++) {
                    let f;
                    do { f = _pick(faces); } while (f === last);
                    result.push(f + _pick(mods));
                    last = f;
                }
                return result.join(' ');
            }
        }

        // ── 4×4 ──────────────────────────────────────────────────────
        // WCA: 40–45 moves. Outer moves + one inner-slice layer per axis (2-3 = Rw/Uw etc)
        // Wide moves use Rw notation (2-slice wide = Rw, same as 2Rw).
        class WCA_4x4 extends WCA_CubeGenerator {
            static get LENGTH() { return 40; }
            static get WIDE_MOVES() {
                return [
                    { face: 'R', layers: ['Rw'],  chance: 0.45 },
                    { face: 'L', layers: ['Rw'],  chance: 0.30 },
                    { face: 'U', layers: ['Uw'],  chance: 0.45 },
                    { face: 'D', layers: ['Uw'],  chance: 0.30 },
                    { face: 'F', layers: ['Fw'],  chance: 0.35 },
                    { face: 'B', layers: ['Fw'],  chance: 0.25 },
                ];
            }
        }

        // ── 5×5 ──────────────────────────────────────────────────────
        // WCA: 60 moves. Outer + Rw (2-slice) + 3Rw (3-slice inner)
        class WCA_5x5 extends WCA_CubeGenerator {
            static get LENGTH() { return 60; }
            static get WIDE_MOVES() {
                return [
                    { face: 'R', layers: ['Rw', '3Rw'], chance: 0.5 },
                    { face: 'L', layers: ['Rw', '3Rw'], chance: 0.35 },
                    { face: 'U', layers: ['Uw', '3Uw'], chance: 0.5 },
                    { face: 'D', layers: ['Uw', '3Uw'], chance: 0.35 },
                    { face: 'F', layers: ['Fw', '3Fw'], chance: 0.4 },
                    { face: 'B', layers: ['Fw', '3Fw'], chance: 0.3 },
                ];
            }
        }

        // ── 6×6 ──────────────────────────────────────────────────────
        // WCA: 80 moves. Outer + 2Rw + 3Rw
        class WCA_6x6 extends WCA_CubeGenerator {
            static get LENGTH() { return 80; }
            static get WIDE_MOVES() {
                return [
                    { face: 'R', layers: ['2Rw', '3Rw'], chance: 0.5 },
                    { face: 'L', layers: ['2Rw', '3Rw'], chance: 0.35 },
                    { face: 'U', layers: ['2Uw', '3Uw'], chance: 0.5 },
                    { face: 'D', layers: ['2Uw', '3Uw'], chance: 0.35 },
                    { face: 'F', layers: ['2Fw', '3Fw'], chance: 0.4 },
                    { face: 'B', layers: ['2Fw', '3Fw'], chance: 0.3 },
                ];
            }
        }

        // ── 7×7 ──────────────────────────────────────────────────────
        // WCA: 100 moves. Outer + 2Rw + 3Rw + 4Rw
        class WCA_7x7 extends WCA_CubeGenerator {
            static get LENGTH() { return 100; }
            static get WIDE_MOVES() {
                return [
                    { face: 'R', layers: ['2Rw', '3Rw', '4Rw'], chance: 0.55 },
                    { face: 'L', layers: ['2Rw', '3Rw', '4Rw'], chance: 0.4 },
                    { face: 'U', layers: ['2Uw', '3Uw', '4Uw'], chance: 0.55 },
                    { face: 'D', layers: ['2Uw', '3Uw', '4Uw'], chance: 0.4 },
                    { face: 'F', layers: ['2Fw', '3Fw', '4Fw'], chance: 0.45 },
                    { face: 'B', layers: ['2Fw', '3Fw', '4Fw'], chance: 0.35 },
                ];
            }
        }

        // ── Pyraminx ─────────────────────────────────────────────────
        // WCA: 11 moves total.
        // Main moves: U L R B (tips optional, appended at end)
        // No same-face repeat. Tips: u l r b (1 move each, random inclusion)
        class WCA_Pyraminx {
            static generate() {
                const mainFaces = ['U','L','R','B'];
                const mods = ["", "'"];
                const tipFaces = ['u','l','r','b'];

                // 9 main moves (avoiding same face twice in a row)
                const moves = [];
                let last = '';
                for (let i = 0; i < 9; i++) {
                    let f;
                    do { f = _pick(mainFaces); } while (f === last);
                    moves.push(f + _pick(mods));
                    last = f;
                }

                // 0–2 random tip moves (WCA allows 0–4 but avg is ~1–2)
                const tipCount = _rnd(3); // 0,1,2
                const shuffledTips = [...tipFaces].sort(() => Math.random() - 0.5).slice(0, tipCount);
                const tipMoves = shuffledTips.map(t => t + _pick(mods));

                return [...moves, ...tipMoves].join(' ');
            }
        }

        // ── Skewb ────────────────────────────────────────────────────
        // WCA: 11 moves. 4 independent corner moves: R L U B (no same-face repeat)
        // Skewb moves act on corners, not faces.
        class WCA_Skewb {
            static generate() {
                const faces = ['R','L','U','B'];
                const mods = ["", "'"];
                const result = [];
                let last = '';
                for (let i = 0; i < 11; i++) {
                    let f;
                    do { f = _pick(faces); } while (f === last);
                    result.push(f + _pick(mods));
                    last = f;
                }
                return result.join(' ');
            }
        }

        // ── Megaminx ─────────────────────────────────────────────────
        // WCA official notation: rows of alternating R++/R--/D++/D-- ×5 + U/U' turn
        // 7 rows × (5 face moves + 1 turn) = 42 visible moves displayed in 7 lines
        class WCA_Megaminx {
            static generate() {
                const rMoves = ['R++', 'R--'];
                const dMoves = ['D++', 'D--'];
                const turns  = ['U',   "U'"];
                const rows = 7;
                const lines = [];

                for (let r = 0; r < rows; r++) {
                    const row = [];
                    // Alternate R/D moves: R D R D R, then turn
                    for (let i = 0; i < 5; i++) {
                        row.push(i % 2 === 0 ? _pick(rMoves) : _pick(dMoves));
                    }
                    row.push(_pick(turns));
                    lines.push(row.join(' '));
                }

                return lines.join('\n');
            }
        }

        // ══════════════════════════════════════════════════════════════
        // ScrambleGenerator — public API / strategy router
        // Keeps getLabel() and DISCIPLINES for UI / session display
        // ══════════════════════════════════════════════════════════════
        class ScrambleGenerator {
            // Discipline registry — used for labels + UI dropdown
            static get DISCIPLINES() {
                return {
                    '3x3':      { label: '3x3 Cube'  },
                    '2x2':      { label: '2x2 Cube'  },
                    '4x4':      { label: '4x4 Cube'  },
                    '5x5':      { label: '5x5 Cube'  },
                    '6x6':      { label: '6x6 Cube'  },
                    '7x7':      { label: '7x7 Cube'  },
                    'pyraminx': { label: 'Pyraminx'  },
                    'skewb':    { label: 'Skewb'     },
                    'megaminx': { label: 'Megaminx'  },
                };
            }

            // Maps our internal discipline keys to the WCA event IDs used by
            // cubing.js (https://github.com/cubing/cubing.js), the scramble
            // library maintained by a WCA Board member and used by the WCA's
            // own tooling. For 2x2/3x3/4x4/pyraminx/skewb it generates true
            // random-state scrambles (same method as the official TNoodle
            // program); for 5x5+ and megaminx it uses WCA's specified
            // random-move algorithms — i.e. exactly what a real competition uses.
            static get WCA_EVENT_IDS() {
                return {
                    '3x3':      '333',
                    '2x2':      '222',
                    '4x4':      '444',
                    '5x5':      '555',
                    '6x6':      '666',
                    '7x7':      '777',
                    'pyraminx': 'pyram',
                    'skewb':    'skewb',
                    'megaminx': 'minx',
                };
            }

            // Strategy map — discipline key → local fallback generator class
            // (only used if the cubing.js engine fails to load, e.g. offline)
            static get STRATEGIES() {
                return {
                    '3x3':      WCA_3x3,
                    '2x2':      WCA_2x2,
                    '4x4':      WCA_4x4,
                    '5x5':      WCA_5x5,
                    '6x6':      WCA_6x6,
                    '7x7':      WCA_7x7,
                    'pyraminx': WCA_Pyraminx,
                    'skewb':    WCA_Skewb,
                    'megaminx': WCA_Megaminx,
                };
            }

            // Lazily loads the cubing.js scramble module once and reuses it.
            static _loadEngine() {
                if (location.protocol === 'file:') {
                    return Promise.reject(new Error('file-protocol'));
                }
                if (!this._enginePromise) {
                    this._enginePromise = import('https://cdn.cubing.net/v0/js/cubing/scramble');
                }
                return this._enginePromise;
            }

            // Public API — used by CubeTimer.generateScramble().
            // Async: returns Promise<string>. Tries the real WCA engine first,
            // falls back to the local approximate generator if that's unavailable
            // (e.g. no internet connection).
            static async getScramble(discipline) {
                const eventId = this.WCA_EVENT_IDS[discipline] || '333';
                try {
                    const { randomScrambleForEvent } = await this._loadEngine();
                    const alg = await randomScrambleForEvent(eventId);
                    return this._normalize(alg.toString());
                } catch (err) {
                    if (err?.message !== 'file-protocol') {
                        console.error('WCA scramble engine unavailable, using local fallback generator:', err);
                    }
                    return this._fallbackScramble(discipline);
                }
            }

            // Local approximate generator (random-move, not random-state) — only
            // used as an offline fallback when the real engine can't be loaded.
            static _fallbackScramble(discipline) {
                const strategy = this.STRATEGIES[discipline] || WCA_3x3;
                return this._normalize(strategy.generate());
            }

            // Defensive normalizer — catches any remaining malformed wide-move tokens
            // Valid wide-move pattern: optional-digit + Face + w + optional-modifier
            // e.g. Rw, Rw', Rw2, 3Rw, 3Rw', 2Uw2
            static _normalize(scramble) {
                return scramble.split(/[ \n]+/).map(token => {
                    if (!token) return null;
                    // Only invalid pattern is double-w (ww) — fix by collapsing
                    if (/ww+/.test(token)) {
                        token = token.replace(/ww+/g, 'w');
                    }
                    return token;
                }).filter(Boolean).join(' ');
            }

            // Display label for badge / dropdown
            static getLabel(discipline) {
                return (this.DISCIPLINES[discipline] || { label: discipline }).label;
            }

            // All registered discipline keys
            static get keys() {
                return Object.keys(this.DISCIPLINES);
            }
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            const commentary = new CommentarySystem();
            const settingsManager = new SettingsManager();
            // CubeTimer reads the selected language during its constructor.
            window.settingsManager = settingsManager;
            const timer = new CubeTimer();
            const hotkeyManager = new HotkeyManager();
            
            // Make globally accessible
            window.commentary = commentary;
            window.timer = timer;
            window.sessionsManager = timer; // Alias for solve history
            window.hotkeyManager = hotkeyManager;
            const progression = new ProgressionSystem(timer, settingsManager);
            window.progression = progression;
            progression.init();
            window.dispatchEvent(new Event('timer-ready'));

            // Init subsession UI (context menu, modal handlers)
            timer.initSubsessionUI();
            // Init export image UI
            timer.initExportImageUI();
        });



// Algorithm database (OLL/PLL/F2L/ZZ/COLL/OCELL/CPLL/ZZLL) moved to algs-database.js



// ===================== Algs Trainer: cube-state diagram engine =====================
// Uses the embedded cubejs engine (cube-engine.js, loaded before this file) to compute
// the true last-layer state for each algorithm and render an accurate SVG diagram in
// the classic CubeSkills style: yellow 3x3 grid + a 12-segment colored border ring
// (3 rounded segments per side — 2 corner stickers + 1 edge sticker) + arrows for any
// corner/edge permutation (PLL). OLL algs never permute, so they render with no arrows.
// ===================== Algs Trainer: translations =====================
// ALGS_I18N + algsT() moved to algs-i18n.js

const AlgsDiagram = (function() {
    const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    const COLOR = { U: '#FFEB3B', R: '#FF8C00', F: '#009E60', D: '#E8E8E8', L: '#C41E3A', B: '#1E5AA8' };
    function normalizeAlg(alg) {
        return alg.replace(/2'/g, '2');
    }
    function invertAlg(alg) {
        return normalizeAlg(alg).trim().split(/\s+/).reverse().map(mv => {
            const face = mv[0];
            const mod = mv.slice(1);
            if (mod === "'") return face;
            if (mod === '2') return face + '2';
            return face + "'";
        }).join(' ');
    }

    // U-grid position (col,row) for each U facelet index 0-8
    const U_COL = [0,1,2,0,1,2,0,1,2];
    const U_ROW = [0,0,0,1,1,1,2,2,2];
    function cellCenter(uIdx) { return [50 + 20 * U_COL[uIdx], 50 + 20 * U_ROW[uIdx]]; }

    // corner position id (0..3, URF/UFL/ULB/UBR) -> U facelet index
    const CORNER_U_IDX = [8, 6, 0, 2];
    // edge position id (0..3, UR/UF/UL/UB) -> U facelet index
    const EDGE_U_IDX = [5, 7, 3, 1];

    // 12 border segments, [x, y, w, h, facelet-index], reading each side left-to-right / top-to-bottom.
    // Derived directly from cubejs's cornerFacelet/edgeFacelet tables (see cube-engine.js).
    const BORDER = [
        // top: ULB-back(47), UB-back(46), UBR-back(45)
        [40, 22, 18, 10, 47], [61, 22, 18, 10, 46], [82, 22, 18, 10, 45],
        // right: UBR-right(11), UR-right(10), URF-right(9)
        [108, 40, 10, 18, 11], [108, 61, 10, 18, 10], [108, 82, 10, 18, 9],
        // bottom: URF-front(20), UF-front(19), UFL-front(18)
        [82, 108, 18, 10, 20], [61, 108, 18, 10, 19], [40, 108, 18, 10, 18],
        // left: UFL-left(38), UL-left(37), ULB-left(36)
        [22, 82, 10, 18, 38], [22, 61, 10, 18, 37], [22, 40, 10, 18, 36],
    ];

    function svgRect(x, y, w, h, color) {
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${color}"/>`;
    }
    function svgArrow(x1, y1, x2, y2, id, color) {
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.75" marker-end="url(#${id})" opacity="0.92"/>`;
    }

    // ===== Isometric F2L cube diagram (top + front + right faces) =====
    // Standard axes: a = toward R, b = toward F, c = toward D.
    const ISO_S = 22;
    const ISO_AX = Math.cos(Math.PI / 6), ISO_AY = Math.sin(Math.PI / 6);
    const ISO_BX = -Math.cos(Math.PI / 6), ISO_BY = Math.sin(Math.PI / 6);
    const ISO_OX = 130, ISO_OY = 30;
    function isoPt(x, y, z) {
        return [ISO_OX + (x * ISO_AX + y * ISO_BX) * ISO_S, ISO_OY + (x * ISO_AY + y * ISO_BY) * ISO_S + z * ISO_S];
    }
    function isoPoly(pts) { return pts.map(p => p.join(',')).join(' '); }
    // Net rotation needed so the algorithm's slot always ends up rendered at the
    // canonical Front-Right corner (where the visible F and R faces meet).
    const SLOT_REFRAME_Y = { FR: 0, BR: 1, BL: 2, FL: 3 };

    // Complete facelet tables for all 8 corners / 12 edges (derived from cube-engine.js's
    // cornerFacelet/edgeFacelet). Needed because during an algorithm the tracked pair can
    // temporarily sit anywhere on the cube, not just the U layer.
    const CORNER_ALL = [[8,9,20],[6,18,38],[0,36,47],[2,45,11],[29,26,15],[27,44,24],[33,53,42],[35,17,51]];
    const EDGE_ALL = [[5,10],[7,19],[3,37],[1,46],[32,16],[28,25],[30,43],[34,52],[23,12],[21,41],[50,39],[48,14]];
    // Original (persistent) cubie IDs for each slot's target corner+edge — DFR=4/FR=8 etc.
    const SLOT_CUBIE = { FR: {c: 4, e: 8}, BR: {c: 7, e: 11}, FL: {c: 5, e: 9}, BL: {c: 6, e: 10} };

    function renderIsoF2L(entry) {
        let c, str, json;
        try {
            c = Cube.fromString(SOLVED);
            c.move(invertAlg(entry.alg));
            const k = SLOT_REFRAME_Y[entry.slot] || 0;
            if (k === 1) c.move('y');
            else if (k === 2) c.move('y2');
            else if (k === 3) c.move("y'");
            str = c.asString();
            json = c.toJSON();
        } catch (e) {
            return '<div class="algs-diagram-fallback">?</div>';
        }
        // Find where the tracked corner and edge (the physical pieces that belong in this slot)
        // currently sit — anywhere on the cube — so we know which piece to keep in full color.
        const target = SLOT_CUBIE[entry.slot] || SLOT_CUBIE.FR;
        let cornerPos = -1, edgePos = -1;
        for (let i = 0; i < 8; i++) { if (json.cp[i] === target.c) cornerPos = i; }
        for (let i = 0; i < 12; i++) { if (json.ep[i] === target.e) edgePos = i; }

        // Gray out every OTHER piece that originally belongs to the U layer (i.e. carries a
        // yellow sticker) — corner identities 0-3 and edge identities 0-3 are U-layer pieces.
        // D-layer pieces (identities 4-7) and E-slice edges (identities 8-11) have no yellow
        // sticker at all, so they stay in real color regardless of the current tracked pair.
        const grayed = new Set();
        for (let i = 0; i < 8; i++) {
            if (i === cornerPos) continue;
            if (json.cp[i] < 4) CORNER_ALL[i].forEach(f => grayed.add(f));
        }
        for (let i = 0; i < 12; i++) {
            if (i === edgePos) continue;
            if (json.ep[i] < 4) EDGE_ALL[i].forEach(f => grayed.add(f));
        }
        function pieceColor(idx) {
            if (grayed.has(idx)) return '#8a8a8a';
            return COLOR[str[idx]] || '#999';
        }
        let svg = `<svg viewBox="55 15 150 155" class="algs-diagram-svg" xmlns="http://www.w3.org/2000/svg">`;
        // TOP face (U): row = yi, col = xi
        for (let xi = 0; xi < 3; xi++) for (let yi = 0; yi < 3; yi++) {
            const idx = 0 + yi * 3 + xi;
            const poly = [isoPt(xi,yi,0), isoPt(xi+1,yi,0), isoPt(xi+1,yi+1,0), isoPt(xi,yi+1,0)];
            svg += `<polygon points="${isoPoly(poly)}" fill="${pieceColor(idx)}" stroke="#111" stroke-width="1"/>`;
        }
        // FRONT face (F): row = zi, col = xi, at y=3. Bottom-right (xi=2,zi=2) = target slot.
        for (let xi = 0; xi < 3; xi++) for (let zi = 0; zi < 3; zi++) {
            const isTarget = (xi === 2 && zi === 2);
            const idx = 18 + zi * 3 + xi;
            const color = isTarget ? '#8a8a8a' : pieceColor(idx);
            const poly = [isoPt(xi,3,zi), isoPt(xi+1,3,zi), isoPt(xi+1,3,zi+1), isoPt(xi,3,zi+1)];
            svg += `<polygon points="${isoPoly(poly)}" fill="${color}" stroke="#111" stroke-width="1"/>`;
        }
        // RIGHT face (R): row = zi, col = (2-yi), at x=3. Bottom-left (yi=2,zi=2) = target slot.
        for (let yi = 0; yi < 3; yi++) for (let zi = 0; zi < 3; zi++) {
            const isTarget = (yi === 2 && zi === 2);
            const idx = 9 + zi * 3 + (2 - yi);
            const color = isTarget ? '#8a8a8a' : pieceColor(idx);
            const poly = [isoPt(3,yi,zi), isoPt(3,yi+1,zi), isoPt(3,yi+1,zi+1), isoPt(3,yi,zi+1)];
            svg += `<polygon points="${isoPoly(poly)}" fill="${color}" stroke="#111" stroke-width="1"/>`;
        }
        svg += '</svg>';
        return svg;
    }

    function render(entry) {
        if (entry.slot) return renderIsoF2L(entry);
        if (!window.Cube) return '<div class="algs-diagram-fallback">3D</div>';
        let c, str, json;
        try {
            c = Cube.fromString(SOLVED);
            c.move(invertAlg(entry.alg));
            str = c.asString();
            json = c.toJSON();
        } catch (e) {
            return '<div class="algs-diagram-fallback">?</div>';
        }
        // F2L: this diagram shows where the corner+edge pair currently sits in the top
        // layer before insertion (not a last-layer solved-state check like OLL/PLL).
        // (last-layer top-view diagram for OLL/PLL only — F2L uses renderIsoF2L above)

        let svg = `<svg viewBox="0 0 140 140" class="algs-diagram-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <marker id="arrC-${entry.id}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#7a1020"/>
                </marker>
                <marker id="arrE-${entry.id}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#0d3b8c"/>
                </marker>
            </defs>`;

        // 3x3 grid (real colors from the pre-alg / recognition state)
        for (let i = 0; i < 9; i++) {
            const col = U_COL[i], row = U_ROW[i];
            const color = COLOR[str[i]] || '#999';
            svg += svgRect(40 + 20 * col, 40 + 20 * row, 20, 20, color);
        }
        // 12-segment border ring
        for (const [x, y, w, h, idx] of BORDER) {
            svg += svgRect(x, y, w, h, COLOR[str[idx]] || '#999');
        }

        // arrows for any corner/edge permutation (PLL) — corners in dark red, edges in dark blue
        // so double-cycle cases (e.g. G-perms) read as two distinct cycles instead of a tangled mess.
        for (let i = 0; i < 4; i++) {
            if (json.cp[i] !== i) {
                const [x1,y1] = cellCenter(CORNER_U_IDX[i]);
                const [x2,y2] = cellCenter(CORNER_U_IDX[json.cp[i]]);
                svg += svgArrow(x1, y1, x2, y2, 'arrC-' + entry.id, '#7a1020');
            }
        }
        for (let i = 0; i < 4; i++) {
            if (json.ep[i] !== i) {
                const [x1,y1] = cellCenter(EDGE_U_IDX[i]);
                const [x2,y2] = cellCenter(EDGE_U_IDX[json.ep[i]]);
                svg += svgArrow(x1, y1, x2, y2, 'arrE-' + entry.id, '#0d3b8c');
            }
        }

        svg += '</svg>';
        return svg;
    }

    return { render, invertAlg };
})();

// ===================== Algs Trainer: modal / step logic =====================
(function() {
    const LS_KEY = 'algsTrainerLearned';
    const STATS_KEY = 'algsTrainerStats';
    function getLearned() {
        return AppStorage.getJSON(LS_KEY, {});
    }
    function setLearned(obj) {
        AppStorage.setJSON(LS_KEY, obj);
    }
    function getStats() {
        return AppStorage.getJSON(STATS_KEY, {});
    }
    function setStats(obj) {
        AppStorage.setJSON(STATS_KEY, obj);
    }

    const overlay = document.getElementById('algsOverlay');
    const modal = overlay ? overlay.querySelector('.algs-modal') : null;
    const backBtn = document.getElementById('algsBackBtn');
    const closeBtn = document.getElementById('algsModalClose');
    const titleEl = document.getElementById('algsModalTitle');
    const steps = {
        1: document.getElementById('algsStep1'),
        2: document.getElementById('algsStep2'),
        '2b': document.getElementById('algsStep2b'),
        '2c': document.getElementById('algsStep2c'),
        '2d': document.getElementById('algsStep2d'),
        3: document.getElementById('algsStep3'),
        '3b': document.getElementById('algsStep3b'),
        4: document.getElementById('algsStep4'),
        5: document.getElementById('algsStepPractice'),
    };
    let stepHistory = ['1'];
    let currentSet = null;
    let currentSlot = null;
    let practiceActive = false;

    function showStep(key, pushHistory = true) {
        key = String(key);
        if (pushHistory) {
            if (stepHistory[stepHistory.length - 1] !== key) stepHistory.push(key);
        }
        Object.keys(steps).forEach(k => {
            steps[k].classList.toggle('algs-step-hidden', k !== key);
        });
        backBtn.style.visibility = stepHistory.length <= 1 ? 'hidden' : 'visible';
        modal.classList.toggle('algs-fullscreen', key !== '1');
        const T = algsT();
        const setLabel = currentSet === 'F2L' && currentSlot ? `F2L · ${currentSlot}` : (currentSet || T.algorithms);
        const titles = {1: T.modalTitle, 2: T.chooseMethod, '2b': T.chooseMethod, '2c': T.chooseMethod, 3: T.chooseSet, '3b': T.chooseSet, 4: setLabel, 5: T.practicePrefix + setLabel};
        titleEl.textContent = titles[key];
        practiceActive = (key === '5');
        if (key !== '5') Practice.stop();
        if (key === '4' && currentSet) renderAlgList(currentSet);
    }

    function goBack() {
        if (stepHistory.length <= 1) return;
        stepHistory.pop();
        const prev = stepHistory[stepHistory.length - 1];
        showStep(prev, false);
    }

    function applyAlgsStaticI18n() {
        const T = algsT();
        document.querySelectorAll('#algsOverlay [data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (T[key]) el.textContent = T[key];
        });
    }

    function openAlgs() {
        overlay.classList.add('visible');
        applyAlgsStaticI18n();
        stepHistory = ['1'];
        showStep('1', false);
    }
    function closeAlgs() {
        overlay.classList.remove('visible');
        Practice.stop();
    }

    document.getElementById('fireMenuAlgsTrainer')?.addEventListener('click', () => {
        DOM('fireMenuDropdown')?.classList.remove('visible');
        openAlgs();
    });
    closeBtn?.addEventListener('click', closeAlgs);
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeAlgs(); });
    backBtn?.addEventListener('click', goBack);

    steps[1]?.querySelectorAll('.algs-card[data-puzzle]').forEach(card => {
        card.addEventListener('click', () => showStep('2'));
    });
    steps[2]?.querySelectorAll('.algs-card[data-method]').forEach(card => {
        card.addEventListener('click', () => {
            const method = card.dataset.method;
            if (method === 'zz') {
                showStep('2b');
            } else {
                showStep('3');
            }
        });
    });
    steps['2b']?.querySelectorAll('.algs-card[data-method]').forEach(card => {
        card.addEventListener('click', () => {
            if (card.dataset.method === 'zz-a') {
                showStep('2c');
            } else if (card.dataset.method === 'zz-b') {
                showStep('2d');
            }
        });
    });
    steps['2c']?.querySelectorAll('.algs-card[data-method]').forEach(card => {
        card.addEventListener('click', () => {
            currentSlot = null;
            if (card.dataset.method === 'zz-2828') {
                currentSet = 'ZZ28';
            } else if (card.dataset.method === 'zz-coll') {
                currentSet = 'ZZCOLL';
            } else if (card.dataset.method === 'zz-full') {
                currentSet = 'ZZ';
            } else if (card.dataset.method === 'zz-ocell') {
                currentSet = 'ZZOCELL';
            }
            renderAlgList(currentSet);
            showStep('4');
        });
    });
    steps['2d']?.querySelectorAll('.algs-card[data-method]').forEach(card => {
        card.addEventListener('click', () => {
            currentSlot = null;
            if (card.dataset.method === 'zz-zzll') {
                currentSet = 'ZZLL';
            } else if (card.dataset.method === 'zz-r') {
                currentSet = 'ZZR';
            }
            renderAlgList(currentSet);
            showStep('4');
        });
    });
    steps[3]?.querySelectorAll('.algs-card[data-set]').forEach(card => {
        card.addEventListener('click', () => {
            currentSet = card.dataset.set;
            if (currentSet === 'F2L') {
                showStep('3b');
            } else {
                currentSlot = null;
                renderAlgList(currentSet);
                showStep('4');
            }
        });
    });
    steps['3b']?.querySelectorAll('.algs-card[data-slot]').forEach(card => {
        card.addEventListener('click', () => {
            currentSlot = card.dataset.slot;
            renderAlgList(currentSet);
            showStep('4');
        });
    });

    function renderAlgList(setName) {
        const T = algsT();
        const grid = document.getElementById('algsCardsGrid');
        const countEl = document.getElementById('algsListCount');
        function pickData(name) {
            if (name === 'OLL') return OLL;
            if (name === 'PLL') return PLL;
            if (name === 'ZZ') return ZZ;
            if (name === 'ZZ28') {
                return OLL.filter(e => e.group === 'All Edges Oriented Correctly').concat(PLL);
            }
            if (name === 'ZZCOLL') {
                return COLL.concat(PLL.filter(e => e.group === 'Permutations of Edges Only'));
            }
            if (name === 'ZZOCELL') {
                return OCELL.concat(CPLL);
            }
            if (name === 'ZZLL') {
                return ZZLL;
            }
            if (name === 'ZZR') {
                const olc = OLL.filter(e => e.group === 'All Edges Oriented Correctly');
                const pllNames = ['Aa','Ab','E','F','Na','Nb','T','Z','H'];
                const pllSubset = PLL.filter(e => pllNames.includes(e.name));
                return olc.concat(pllSubset);
            }
            return F2L.filter(e => e.slot === currentSlot);
        }
        let data = pickData(setName);

        const learned = getLearned();
        const totalCount = data.length;
        const onlyUnlearned = DOM('algsPracticeUnlearnedOnly')?.checked;
        if (onlyUnlearned) data = data.filter(e => !learned[e.id]);

        grid.innerHTML = '';
        const learnedCount = pickData(setName).filter(e => learned[e.id]).length;
        let lastGroup = null;
        data.forEach(entry => {
            if (entry.groupName && entry.groupName !== lastGroup) {
                lastGroup = entry.groupName;
                const header = document.createElement('div');
                header.className = 'algs-group-header';
                header.textContent = lastGroup;
                grid.appendChild(header);
            }
            const card = document.createElement('div');
            card.className = 'algs-alg-card';
            const precondBadge = entry.precondition
                ? `<div class="algs-alg-card-precond">⚠ ${entry.precondition} slot must be empty</div>` : '';
            card.innerHTML = `
                <div class="algs-alg-card-left">
                    <div class="algs-alg-card-name">${entry.name}</div>
                    <div class="algs-alg-card-formula">${entry.alg}</div>
                    ${precondBadge}
                    <div class="algs-alg-card-footer">
                        <label class="algs-alg-card-learned-wrap">
                            <input type="checkbox" class="algs-alg-card-learned" data-id="${entry.id}" ${learned[entry.id] ? 'checked' : ''}>
                            <span>${T.learned}</span>
                        </label>
                        <button class="algs-alg-practice-row-btn" data-practice-id="${entry.id}">${T.practiceThis}</button>
                    </div>
                </div>
                <div class="algs-alg-diagram">${AlgsDiagram.render(entry)}</div>
            `;
            grid.appendChild(card);
        });
        countEl.textContent = T.learnedCount(learnedCount, totalCount);
        grid.querySelectorAll('.algs-alg-card-learned').forEach(cb => {
            cb.addEventListener('change', () => {
                const l = getLearned();
                l[cb.dataset.id] = cb.checked;
                setLearned(l);
                renderAlgList(setName);
            });
        });
        grid.querySelectorAll('.algs-alg-practice-row-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const entry = data.find(e => e.id === btn.dataset.practiceId);
                if (!entry) return;
                Practice.startSingle(setName, entry);
                showStep(5);
            });
        });
    }

    // ===== Practice / drilling (step 5) =====
    const Practice = (function() {
        const phase0El = document.getElementById('algsPhase0');
        const phase1El = document.getElementById('algsPhase1');
        const phase2El = document.getElementById('algsPhase2');
        const phaseDoneEl = document.getElementById('algsPhaseDone');
        const phase0Text = document.getElementById('algsPhase0Text');
        const phase0Continue = document.getElementById('algsPhase0Continue');
        const phase0Back = document.getElementById('algsPhase0Back');
        const metroMoveEl = document.getElementById('algsMetronomeMove');
        const metroProgressEl = document.getElementById('algsMetronomeProgress');
        const algTextEl = document.getElementById('algsPracticeScramble');
        const timerEl = document.getElementById('algsPracticeTimer');
        const hintEl = document.getElementById('algsPracticeHint');
        const caseEl = document.getElementById('algsPracticeCase');
        const statsEl = document.getElementById('algsPracticeStats');
        const finishBtn = document.getElementById('algsFinishPractice');
        const doneText = document.getElementById('algsPhaseDoneText');
        const doneClose = document.getElementById('algsPhaseDoneClose');

        let mode = 'single'; // 'single' = Scenario A (metronome then drill) | 'pool' = Scenario B (drill only, mixed)
        let pool = [];
        let current = null;
        let running = false;
        let startTs = 0;
        let rafId = null;
        let sessionCount = 0;
        let sessionTotal = 0;
        let sessionBest = null;
        let trainingStartTs = 0;
        let metroTimeoutId = null;

        function showPhase(el) {
            [phase0El, phase1El, phase2El, phaseDoneEl].forEach(p => p.classList.toggle('algs-step-hidden', p !== el));
        }

        function pickCase() {
            let choices = pool;
            if (choices.length > 1 && current) {
                choices = choices.filter(e => e.id !== current.id);
            }
            return choices[Math.floor(Math.random() * choices.length)];
        }

        function translate(key) {
            const T = algsT();
            const map = {
                practiceHintStart: T.pressSpaceStart,
                practiceHintStop: T.pressSpaceStop,
                practiceHintNext: T.pressSpaceNext,
            };
            return map[key];
        }

        function nextDrillCase() {
            current = pickCase();
            if (!current) return;
            algTextEl.textContent = current.alg;
            caseEl.textContent = current.name + ' · ' + current.group;
            timerEl.textContent = '0.00';
            timerEl.classList.remove('running');
            hintEl.textContent = translate('practiceHintStart');
        }

        function tick() {
            const elapsed = (performance.now() - startTs) / 1000;
            timerEl.textContent = elapsed.toFixed(2);
            rafId = requestAnimationFrame(tick);
        }

        function startTimer() {
            if (running || !current) return;
            running = true;
            startTs = performance.now();
            timerEl.classList.add('running');
            hintEl.textContent = translate('practiceHintStop');
            rafId = requestAnimationFrame(tick);
        }

        function stopTimer() {
            if (!running) return;
            running = false;
            cancelAnimationFrame(rafId);
            const elapsed = (performance.now() - startTs) / 1000;
            timerEl.textContent = elapsed.toFixed(2);
            timerEl.classList.remove('running');
            hintEl.textContent = translate('practiceHintNext');

            sessionCount++;
            sessionTotal += elapsed;
            if (sessionBest === null || elapsed < sessionBest) sessionBest = elapsed;

            const stats = getStats();
            const s = stats[current.id] || { count: 0, total: 0, best: null };
            s.count++;
            s.total += elapsed;
            if (s.best === null || elapsed < s.best) s.best = elapsed;
            stats[current.id] = s;
            setStats(stats);

            const learned = getLearned();
            if (!learned[current.id]) {
                learned[current.id] = true;
                setLearned(learned);
            }

            renderStats();
        }

        function renderStats() {
            const avg = sessionCount ? (sessionTotal / sessionCount).toFixed(2) : '--';
            const T = algsT();
            statsEl.innerHTML = `<span>${T.solves}: ${sessionCount}</span><span>${T.avg}: ${avg}</span><span>${T.best}: ${sessionBest !== null ? sessionBest.toFixed(2) : '--'}</span>`;
        }

        // ----- Phase 1: metronome (10 full cycles through the algorithm, accelerating every 2 cycles) -----
        const metroPrevBtn = document.getElementById('algsMetroPrev');
        const metroPauseBtn = document.getElementById('algsMetroPause');
        const metroSkipBtn = document.getElementById('algsMetroSkip');
        let metroMoves = [];
        let metroDelayByCycle = [4000, 4000, 3000, 3000, 2000, 2000, 1000, 1000, 1000, 1000];
        let metroPos = 0; // linear index across all cycles: cycle = floor(pos/moves.length)+1
        let metroEntry = null;
        let metroPaused = false;

        function metroCycleOf(pos) { return Math.floor(pos / metroMoves.length) + 1; }

        function metroRenderCurrent() {
            const moveIdx = metroPos % metroMoves.length;
            const cycle = metroCycleOf(metroPos);
            metroMoveEl.textContent = metroMoves[moveIdx];
            metroProgressEl.textContent = algsT().cycle(Math.min(cycle, 10));
            metroMoveEl.style.animation = 'none';
            void metroMoveEl.offsetWidth; // force reflow so the animation restarts
            metroMoveEl.style.animation = '';
        }

        function metroScheduleNext() {
            if (metroPaused) return;
            const cycle = metroCycleOf(metroPos);
            if (cycle > 10) {
                showPhase(phase2El);
                beginDrillSingle(metroEntry);
                return;
            }
            metroRenderCurrent();
            const delay = metroDelayByCycle[Math.min(cycle, 10) - 1];
            metroTimeoutId = setTimeout(() => {
                metroPos++;
                metroScheduleNext();
            }, delay);
        }

        function runMetronome(entry) {
            metroEntry = entry;
            metroMoves = entry.alg.trim().split(/\s+/);
            metroPos = 0;
            metroPaused = false;
            metroPauseBtn.textContent = algsT().metroPause;
            metroScheduleNext();
        }

        metroPauseBtn?.addEventListener('click', () => {
            metroPaused = !metroPaused;
            metroPauseBtn.textContent = metroPaused ? algsT().metroResume : algsT().metroPause;
            if (metroTimeoutId) clearTimeout(metroTimeoutId);
            if (!metroPaused) metroScheduleNext();
        });
        metroPrevBtn?.addEventListener('click', () => {
            if (metroTimeoutId) clearTimeout(metroTimeoutId);
            metroPos = Math.max(0, metroPos - 1);
            metroPaused = true;
            metroPauseBtn.textContent = algsT().metroResume;
            metroRenderCurrent();
        });
        metroSkipBtn?.addEventListener('click', () => {
            if (metroTimeoutId) clearTimeout(metroTimeoutId);
            showPhase(phase2El);
            beginDrillSingle(metroEntry);
        });

        function beginDrillSingle(entry) {
            pool = [entry];
            current = null;
            sessionCount = 0; sessionTotal = 0; sessionBest = null;
            renderStats();
            nextDrillCase();
        }

        function handleTimerToggle() {
            if (!current) return;
            if (!running) {
                if (timerEl.textContent !== '0.00' && hintEl.textContent === translate('practiceHintNext')) {
                    nextDrillCase();
                } else {
                    startTimer();
                }
            } else {
                stopTimer();
            }
        }

        function onKeyDown(e) {
            if (!practiceActive || e.code !== 'Space') return;
            if (phase2El.classList.contains('algs-step-hidden')) return; // only active during Phase 2
            e.preventDefault();
            e.stopPropagation();
            if (e.repeat) return;
            handleTimerToggle();
        }
        // Capture phase so this fires BEFORE the main app timer's spacebar handler.
        document.addEventListener('keydown', onKeyDown, true);

        // Tapping/clicking anywhere in the drill area (except the Finish button)
        // starts/stops the timer, same as Space.
        phase2El?.addEventListener('click', (e) => {
            if (!practiceActive || phase2El.classList.contains('algs-step-hidden')) return;
            if (e.target.closest('#algsFinishPractice')) return;
            handleTimerToggle();
        });

        function formatMinutes(ms) {
            return (ms / 60000).toFixed(1);
        }

        // Scenario A: single algorithm — warning -> metronome (10 cycles) -> drill
        function startSingle(setName, entry) {
            mode = 'single';
            trainingStartTs = performance.now();
            phase0Text.textContent = algsT().warningText(entry.name);
            showPhase(phase0El);
            phase0Continue.onclick = () => {
                showPhase(phase1El);
                runMetronome(entry);
            };
        }

        // Scenario B: mixed pool of checked/selected algorithms — straight to drill, no metronome, no scramble.
        function start(setName, unlearnedOnly) {
            mode = 'pool';
            const data = setName === 'OLL' ? OLL : setName === 'PLL' ? PLL : setName === 'ZZ' ? ZZ
                : setName === 'ZZ28' ? OLL.filter(e => e.group === 'All Edges Oriented Correctly').concat(PLL)
                : setName === 'ZZCOLL' ? COLL.concat(PLL.filter(e => e.group === 'Permutations of Edges Only'))
                : setName === 'ZZOCELL' ? OCELL.concat(CPLL)
                : setName === 'ZZLL' ? ZZLL
                : setName === 'ZZR' ? OLL.filter(e => e.group === 'All Edges Oriented Correctly').concat(PLL.filter(e => ['Aa','Ab','E','F','Na','Nb','T','Z','H'].includes(e.name)))
                : F2L.filter(e => e.slot === currentSlot);
            const learned = getLearned();
            pool = unlearnedOnly ? data.filter(e => !learned[e.id]) : data.slice();
            if (pool.length === 0) pool = data.slice();
            sessionCount = 0; sessionTotal = 0; sessionBest = null;
            current = null;
            showPhase(phase2El);
            renderStats();
            nextDrillCase();
        }

        finishBtn?.addEventListener('click', () => {
            running = false;
            if (rafId) cancelAnimationFrame(rafId);
            if (metroTimeoutId) clearTimeout(metroTimeoutId);
            const totalMin = mode === 'single' ? formatMinutes(performance.now() - trainingStartTs) : null;
            const T = algsT();
            const avgStr = sessionCount ? (sessionTotal/sessionCount).toFixed(2) : '--';
            doneText.textContent = totalMin
                ? T.congrats(totalMin, sessionCount, avgStr)
                : T.sessionComplete(sessionCount, avgStr);
            showPhase(phaseDoneEl);
        });
        doneClose?.addEventListener('click', () => {
            showStepRef && showStepRef(4);
        });
        phase0Back?.addEventListener('click', () => {
            showStepRef && showStepRef(4);
        });

        function stop() {
            running = false;
            if (rafId) cancelAnimationFrame(rafId);
            if (metroTimeoutId) clearTimeout(metroTimeoutId);
        }

        let showStepRef = null;
        function setShowStepRef(fn) { showStepRef = fn; }

        return { start, startSingle, stop, setShowStepRef };
    })();
    Practice.setShowStepRef(showStep);

    document.getElementById('algsStartPractice')?.addEventListener('click', () => {
        if (!currentSet) return;
        const unlearnedOnly = DOM('algsPracticeUnlearnedOnly')?.checked;
        Practice.start(currentSet, unlearnedOnly);
        showStep(5);
    });
    DOM('algsPracticeUnlearnedOnly')?.addEventListener('change', () => {
        if (currentSet) renderAlgList(currentSet);
    });
})();

// ===================== Fire Menu dropdown toggle =====================
(function() {
    const btn = document.getElementById('fireMenuBtn');
    const dropdown = DOM('fireMenuDropdown');
    if (!btn || !dropdown) return;
    function translateDropdown() {
        const T = algsT();
        const map = {
            fireMenuTargetTime: T === ALGS_I18N.ru ? 'Целевое время' : 'Target Time',
            fireMenuHonestMode: T === ALGS_I18N.ru ? 'Честный режим' : 'Honest Mode',
            fireMenuDailyChallenge: T === ALGS_I18N.ru ? 'Скрамбл дня' : 'Daily Scramble',
            fireMenuAlgsTrainer: T === ALGS_I18N.ru ? 'Тренер алгоритмов' : 'Algs Trainer',
            fireMenuMultiplayer: T === ALGS_I18N.ru ? 'Мультиплеер' : 'Multiplayer',
            fireMenuSoon: T.soon,
        };
        document.querySelectorAll('.fire-menu-dropdown [data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (map[key]) el.textContent = map[key];
        });
    }
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        translateDropdown();
        dropdown.classList.toggle('visible');
        btn.setAttribute('aria-expanded', dropdown.classList.contains('visible'));
    });
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== btn) {
            dropdown.classList.remove('visible');
        }
    });
    // Close the dropdown whenever any item inside it is clicked
    dropdown.querySelectorAll('.fire-menu-item').forEach(item => {
        item.addEventListener('click', () => dropdown.classList.remove('visible'));
    });
})();
