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
  collection,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  writeBatch,
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

  onAuthChange: (callback) => onAuthStateChanged(auth, callback),

  // Сменить ник у уже вошедшего пользователя. Резервирует новый ник,
  // освобождает старый (чтобы его мог занять кто-то другой) и обновляет
  // профиль. Бросает Error с .code === 'nickname-in-use', если новый ник
  // уже занят кем-то другим.
  changeNickname: async (newNickname) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Пользователь не авторизован");

    const newKey = normalizeNickname(newNickname);
    const existing = await getDoc(doc(db, "usernames", newKey));
    if (existing.exists() && existing.data().uid !== user.uid) {
      const err = new Error("Nickname already taken");
      err.code = "nickname-in-use";
      throw err;
    }

    const userSnap = await getDoc(doc(db, "users", user.uid));
    const oldNickname = userSnap.exists() ? userSnap.data().nickname : null;

    await reserveNickname(newNickname, user.uid, user.email);
    await setDoc(doc(db, "users", user.uid), { nickname: newNickname }, { merge: true });
    await updateProfile(user, { displayName: newNickname });

    if (oldNickname && normalizeNickname(oldNickname) !== newKey) {
      await deleteDoc(doc(db, "usernames", normalizeNickname(oldNickname)));
    }

    return newNickname;
  }
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
  },

  // ---------------------------------------------------------------
  // Точечная работа со сборками: каждый solve — отдельный документ
  // в users/{uid}/solves/{solveId}, а не поле в одном большом блобе.
  // Это даёт ровно 1 read/write за операцию вместо перезаписи всей
  // истории целиком, и позволяет читать всю историю только один
  // раз (при логине), а не при каждом пересчёте статистики.
  // ---------------------------------------------------------------

  // Один раз (обычно сразу после логина) забрать ВСЮ историю сборок
  // и список "надгробий" удалений — и больше не читать их снова до
  // следующего логина/явного ресинка.
  loadAllSolvesOnce: async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("Пользователь не авторизован");
    const [solvesSnap, tombstonesSnap] = await Promise.all([
      getDocs(collection(db, "users", user.uid, "solves")),
      getDocs(collection(db, "users", user.uid, "tombstones"))
    ]);
    const solves = solvesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const tombstones = tombstonesSnap.docs.map(d => ({ id: d.id, deletedAt: d.data().deletedAt }));
    return { solves, tombstones };
  },

  // Ровно 1 write: новый solve целиком (создание).
  saveSolve: async (sessionId, solve) => {
    const user = auth.currentUser;
    if (!user) return;
    await setDoc(doc(db, "users", user.uid, "solves", solve.id), { ...solve, sessionId });
  },

  // Ровно 1 write: точечное изменение полей существующего solve
  // (DNF/+2/ручное редактирование времени). Не трогает остальные
  // документы и не перезаписывает solve целиком.
  updateSolve: async (solveId, patch) => {
    const user = auth.currentUser;
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid, "solves", solveId), patch);
  },

  // Ровно 1 delete + 1 write (надгробие), атомарно через batch —
  // чтобы другие устройства при следующем логине узнали об удалении
  // и не "воскресили" solve при слиянии.
  deleteSolveRemote: async (solveId) => {
    const user = auth.currentUser;
    if (!user) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, "users", user.uid, "solves", solveId));
    batch.set(doc(db, "users", user.uid, "tombstones", solveId), { deletedAt: Date.now() });
    await batch.commit();
  },

  // Метаданные сессий (имя, дисциплина и т.п.) БЕЗ массивов solves —
  // маленький документ, который почти не растёт и меняется редко
  // (создание/переименование/удаление сессии), в отличие от истории
  // сборок.
  saveSessionsMeta: async (meta) => {
    const user = auth.currentUser;
    if (!user) return;
    await setDoc(doc(db, "users", user.uid), meta, { merge: true });
  }
};

// При старте страницы, если Firebase сам восстановил сессию
// (стандартное поведение — сессия хранится в браузере), запускаем
// полный ресинк один раз. AppSync.runSync() сам читает и метаданные,
// и историю сборок — второй getDoc здесь был бы лишним чтением.
onAuthStateChanged(auth, async (user) => {
  if (!user || !window.AppStorage) return;
  try {
    if (window.AppSync && window.AppSync.runSync) {
      await window.AppSync.runSync();
    }
  } catch (e) {
    console.error("Firebase: не удалось восстановить сессию", e);
  }
});

window.dispatchEvent(new Event("firebase-ready"));
