// firebase-init.js
// Firebase для статического сайта (GitHub Pages), без npm/сборщика.
// Модули: Auth (вход/регистрация) + Firestore (синхронизация между устройствами).
// Подключается как <script type="module" src="firebase-init.js"></script>

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  fetchSignInMethodsForEmail
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// Публичный ключ веб-приложения — не секретный, доступ ограничивается
// правилами безопасности Firestore/Auth, а не секретностью ключа.
const firebaseConfig = {
  apiKey: "AIzaSyDun61xJtTxjhWELGzDvXoblRGwFxVzWUk",
  authDomain: "next-cube-pro.firebaseapp.com",
  projectId: "next-cube-pro",
  storageBucket: "next-cube-pro.firebasestorage.app",
  messagingSenderId: "163503165809",
  appId: "1:163503165809:web:6d3c46e956ca04b5aca6d0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Ники хранятся в нижнем регистре как id документа в коллекции
// "usernames" -> { uid, email }. Это и обеспечивает уникальность
// (два setDoc в один и тот же id не может произойти "тихо"),
// и позволяет резолвить "ник или почта" в реальный email для входа.
const normalizeNickname = (nick) => nick.trim().toLowerCase();

async function reserveNickname(nickname, uid, email) {
  const key = normalizeNickname(nickname);
  const existing = await getDoc(doc(db, "usernames", key));
  if (existing.exists() && existing.data().uid !== uid) {
    const err = new Error("Nickname already taken");
    err.code = "nickname-in-use";
    throw err;
  }
  await setDoc(doc(db, "usernames", key), { uid, email });
}

async function findEmailByNickname(nickname) {
  const snap = await getDoc(doc(db, "usernames", normalizeNickname(nickname)));
  return snap.exists() ? snap.data().email : null;
}

// --- Публичный интерфейс для обычных (не-module) скриптов ---
window.CubeAuth = {
  // Регистрация: ник + email + пароль.
  // Бросает Error с .code === 'nickname-in-use', если ник занят,
  // либо обычный Firebase error.code (auth/email-already-in-use и т.п.).
  registerWithNickname: async (nickname, email, password) => {
    const key = normalizeNickname(nickname);
    const taken = await getDoc(doc(db, "usernames", key));
    if (taken.exists()) {
      const err = new Error("Nickname already taken");
      err.code = "nickname-in-use";
      throw err;
    }
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: nickname });
    await reserveNickname(nickname, cred.user.uid, email);
    await setDoc(doc(db, "users", cred.user.uid), { nickname, email }, { merge: true });
    return cred.user;
  },

  // "Ник или почта" -> реальный email для signIn. null, если ника нет.
  resolveEmailForLogin: async (loginId) => {
    if (loginId.includes("@")) return loginId;
    return findEmailByNickname(loginId);
  },

  loginWithEmail: (email, password) =>
    signInWithEmailAndPassword(auth, email, password),

  // Список способов входа, привязанных к email (['password'], ['google.com'], ...).
  // Используется, чтобы объяснить пользователю, почему "неверный пароль",
  // если на самом деле аккаунт создан через Google и пароля не имеет.
  getSignInMethods: async (email) => {
    try {
      return await fetchSignInMethodsForEmail(auth, email);
    } catch (e) {
      return [];
    }
  },

  loginWithGoogle: () => signInWithPopup(auth, googleProvider),

  // Для входа через Google своего "ника" нет — придумываем на основе
  // имени/почты и сохраняем при первом входе, чтобы дальше можно было
  // логиниться по нему тоже.
  ensureUserProfile: async (user) => {
    const existing = await getDoc(doc(db, "users", user.uid));
    if (existing.exists() && existing.data().nickname) {
      return existing.data().nickname;
    }
    let base = (user.displayName || user.email.split("@")[0])
      .replace(/\s+/g, "")
      .toLowerCase() || "user";
    let nickname = base;
    let n = 1;
    while ((await getDoc(doc(db, "usernames", normalizeNickname(nickname)))).exists()) {
      nickname = `${base}${n++}`;
    }
    await reserveNickname(nickname, user.uid, user.email);
    await setDoc(doc(db, "users", user.uid), { nickname, email: user.email }, { merge: true });
    return nickname;
  },

  logout: () => signOut(auth),

  getCurrentUser: () => auth.currentUser,

  onAuthChange: (callback) => onAuthStateChanged(auth, callback)
};

window.CubeSync = {
  // Сохранить данные пользователя (solves, настройки и т.п.) в Firestore
  saveUserData: async (data) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Пользователь не авторизован");
    await setDoc(doc(db, "users", user.uid), data, { merge: true });
  },

  // Разово получить сохранённые данные пользователя
  loadUserData: async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("Пользователь не авторизован");
    const snap = await getDoc(doc(db, "users", user.uid));
    return snap.exists() ? snap.data() : null;
  },

  // Живая подписка на изменения (в т.ч. с другого устройства).
  // Возвращает функцию отписки.
  subscribeUserData: (callback) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Пользователь не авторизован");
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      callback(snap.exists() ? snap.data() : null);
    });
  }
};

// При старте страницы, если Firebase сам восстановил сессию
// (стандартное поведение — сессия хранится в браузере), подтягиваем
// актуальный ник и досинхронизируем данные без повторного логина.
onAuthStateChanged(auth, async (user) => {
  if (!user || !window.AppStorage) return;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const nickname = snap.exists() && snap.data().nickname
      ? snap.data().nickname
      : (user.displayName || (user.email ? user.email.split("@")[0] : "user"));
    window.AppStorage.setJSON("authUser", { uid: user.uid, nickname, email: user.email });
    if (window.AppSync && window.AppSync.runSync) {
      await window.AppSync.runSync();
    }
  } catch (e) {
    console.error("Firebase: не удалось восстановить сессию", e);
  }
});

window.dispatchEvent(new Event("firebase-ready"));