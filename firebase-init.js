// firebase-init.js
// Инициализация Firebase для статического сайта (GitHub Pages), без npm/сборщика.
// Подключается как <script type="module" src="firebase-init.js"></script>

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";

// Конфигурация твоего Firebase-проекта.
// Это публичный ключ веб-приложения — он не секретный и по задумке Firebase
// оказывается в клиентском коде (доступ к данным ограничивается правилами
// безопасности Firestore/Auth/Storage, а не секретностью этого ключа).
const firebaseConfig = {
  apiKey: "AIzaSyDun61xJtTxjhWELGzDvXoblRGwFxVzWUk",
  authDomain: "next-cube-pro.firebaseapp.com",
  projectId: "next-cube-pro",
  storageBucket: "next-cube-pro.firebasestorage.app",
  messagingSenderId: "163503165809",
  appId: "1:163503165809:web:6d3c46e956ca04b5aca6d0"
};

const app = initializeApp(firebaseConfig);

// script.js, sync.js и др. подключены обычными (не module) тегами,
// поэтому им не виден import/export. Прокидываем app в window,
// чтобы остальной код мог им пользоваться.
window.firebaseApp = app;

// Сигнализируем остальным скриптам, что Firebase готов —
// пригодится, если код в sync.js/script.js должен ждать инициализации.
window.dispatchEvent(new Event("firebase-ready"));
