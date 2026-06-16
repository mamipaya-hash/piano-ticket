const STORAGE_KEY = "pianoStudioManager.v3";
const SESSION_KEY = "pianoStudioManager.session";
const DEFAULT_STUDIO_NAME = "freelyピアノ教室";
const RECEIPT_HISTORY_START = "2026-04";
const RECEIPT_TYPES = {
  monthly: "月謝",
  facility: "施設費",
  live: "ライブ参加費",
  recital: "発表会費",
  leave: "休会中",
  other: "その他",
};

const COURSE_PRESETS = [
  { id: "monthly-beyer", name: "対面月謝 バイエル程度", fee: 6600 },
  { id: "monthly-burgmuller", name: "対面月謝 ブルグミュラー程度", fee: 7700 },
  { id: "monthly-sonatine", name: "対面月謝 ソナチネ程度", fee: 8800 },
  { id: "monthly-sonata", name: "対面月謝 ソナタ・コード譜程度", fee: 9900 },
  { id: "single-60", name: "1レッスン 60分 対面", fee: 4400 },
  { id: "single-60-visit", name: "1レッスン 60分 出張", fee: 5500 },
  { id: "single-80", name: "1レッスン 80分 対面", fee: 6600 },
  { id: "ticket-beyer", name: "チケット バイエル程度 45分 5回", fee: 11000 },
  { id: "ticket-burgmuller", name: "チケット ブルグミュラー程度 45分 5回", fee: 13200 },
  { id: "ticket-burgmuller-visit", name: "チケット ブルグミュラー程度 出張 45分 5回", fee: 14300 },
  { id: "ticket-sonatine", name: "チケット ソナチネ以上 50分 4回", fee: 12100 },
  { id: "ticket-sonatine-visit", name: "チケット ソナチネ以上 出張 50分 4回", fee: 13200 },
  { id: "video-beyer", name: "動画練習サポート バイエル 1回", fee: 1100 },
  { id: "video-burgmuller", name: "動画練習サポート ブルグミュラー 1回", fee: 1100 },
  { id: "video-sonatine", name: "動画練習サポート ソナチネ 1回", fee: 1650 },
  { id: "video-sonata", name: "動画練習サポート ソナタ以上 1回", fee: 1650 },
];

const STUDENT_NAMES = [
  ["青木 花", "小2", "火", "15:30", "monthly-beyer"],
  ["石川 悠真", "小4", "水", "16:00", "monthly-burgmuller"],
  ["上田 紬", "年長", "月", "15:00", "monthly-beyer"],
  ["大野 莉子", "小1", "金", "16:30", "monthly-beyer"],
  ["加藤 湊", "小5", "土", "10:00", "monthly-sonatine"],
  ["佐々木 杏", "中1", "木", "18:00", "monthly-burgmuller"],
  ["高橋 澪", "小3", "火", "17:00", "monthly-beyer"],
  ["中村 凛", "小6", "土", "11:00", "monthly-sonata"],
  ["藤井 奏", "中2", "水", "19:00", "ticket-sonatine"],
  ["森 七海", "小2", "金", "15:30", "monthly-beyer"],
];

const app = document.querySelector("#app");
const channel = "BroadcastChannel" in window ? new BroadcastChannel("piano-studio-sync") : null;
const config = window.PIANO_APP_CONFIG || {};
const cloudEnabled = Boolean(config.supabaseUrl && config.supabaseAnonKey);

let state = createDefaultState();
let session = loadLocalSession();
let supabase = null;
let authUser = null;
let searchTerm = "";
let editingStudentId = null;
let receiptStudentId = null;
let isReceiptModalOpen = false;
let isLoading = true;
let loadingMessage = "起動しています";
let syncMessage = cloudEnabled ? "クラウド保存を準備中です" : "デモ保存中です";

function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(date, amount) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function lastTwelveMonths() {
  const now = new Date();
  const months = [];
  const [startYear, startMonth] = RECEIPT_HISTORY_START.split("-").map(Number);
  const cursor = new Date(startYear, startMonth - 1, 1);
  const current = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cursor <= current) {
    months.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months.slice(-12).reverse();
}

function formatMonth(key) {
  const [year, month] = key.split("-");
  return `${year}年${Number(month)}月`;
}

function yen(value) {
  return Number(value || 0).toLocaleString("ja-JP", { style: "currency", currency: "JPY" });
}

function isVisitCourse(courseId, courses = COURSE_PRESETS) {
  return courses.find((course) => course.id === courseId)?.name.includes("出張");
}

function isTicketCourse(courseId) {
  return getCourse(courseId)?.name.includes("チケット");
}

function isFaceToFaceMonthlyCourse(courseId) {
  return getCourse(courseId)?.name.includes("対面月謝");
}

function createDefaultState() {
  const courses = COURSE_PRESETS.map((course) => ({ ...course }));
  const students = STUDENT_NAMES.map(([name, grade, day, startTime, courseId], index) => {
    const course = courses.find((item) => item.id === courseId);
    return {
      id: uid("student"),
      name,
      grade,
      courseId,
      lessonDay: day,
      startTime,
      fee: course.fee,
      receiptChecked: index % 3 === 0,
      receiptDate: index % 3 === 0 ? today() : "",
      receiptMemo: "",
      receiptItems: createReceiptItems({
        courseId,
        fee: course.fee,
        receiptChecked: index % 3 === 0,
        receiptDate: index % 3 === 0 ? today() : "",
        receiptMemo: "",
      }),
      studioNotice: "次回までに宿題の曲を片手ずつ確認してください。",
      teacherMemo: "",
      updatedAt: new Date().toISOString(),
    };
  });

  return {
    studioName: DEFAULT_STUDIO_NAME,
    teacher: { id: "teacher", password: "admin123" },
    courses,
    students,
    updatedAt: new Date().toISOString(),
  };
}

function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    const fresh = createDefaultState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  }
  return normalizeState(JSON.parse(saved));
}

function normalizeState(saved) {
  const next = {
    ...createDefaultState(),
    ...saved,
  };
  next.courses = (next.courses || COURSE_PRESETS).map((course) => ({
    id: course.id,
    name: course.name,
    fee: Number(course.fee || 0),
  }));
  next.students = (next.students || []).map((student) => ({
    ...student,
    fee: Number(student.fee || 0),
    receiptChecked: Boolean(student.receiptChecked),
    receiptDate: student.receiptDate || "",
    receiptMemo: student.receiptMemo || "",
    receiptItems: normalizeReceiptItems(student),
    studioNotice: student.studioNotice || "",
    teacherMemo: student.teacherMemo ?? student.parentMemo ?? "",
    updatedAt: student.updatedAt || new Date().toISOString(),
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function createReceiptItems(student) {
  const currentYear = new Date().getFullYear();
  const months = lastTwelveMonths();
  const currentMonth = monthKey();
  const monthlyItems = months.map((month) => ({
    id: uid("receipt"),
    type: "monthly",
    label: "月謝",
    targetMonth: month,
    amount: Number(student.fee || 0),
    receiptDate: student.receiptChecked && month === currentMonth ? student.receiptDate || today() : "",
    memo: student.receiptChecked && month === currentMonth ? student.receiptMemo || "" : "",
    required: true,
  }));

  const annualItems = [];
  if (!isVisitCourse(student.courseId)) {
    annualItems.push({
      id: uid("receipt"),
      type: "facility",
      label: "施設費",
      targetMonth: `${currentYear}-04`,
      amount: 1200,
      receiptDate: today(),
      memo: `${currentYear}年度分`,
      required: true,
    });
  }

  annualItems.push({
    id: uid("receipt"),
    type: "live",
    label: "ライブ参加費",
    targetMonth: `${currentYear}-04`,
    amount: 0,
    receiptDate: today(),
    memo: `${currentYear}年度分・金額は必要に応じて編集`,
    required: true,
  });

  return [...monthlyItems, ...annualItems];
}

function isDeletedReceiptType(type) {
  return String(type || "").startsWith("deleted-");
}

function isDefaultPendingRecital(item) {
  return (
    item.type === "recital" &&
    item.label === "発表会費" &&
    Number(item.amount || 0) === 0 &&
    !item.receiptDate &&
    String(item.memo || "").includes("これから徴収")
  );
}

function normalizeReceiptItems(student) {
  const existing = Array.isArray(student.receiptItems) ? student.receiptItems : [];
  const activeMonths = new Set(lastTwelveMonths());
  const currentMonth = monthKey();
  const normalized = existing
    .map((item) => ({
      id: item.id || uid("receipt"),
      type: item.type || "other",
      label: item.label || RECEIPT_TYPES[item.type] || "その他",
      targetMonth: item.targetMonth || monthKey(),
      amount: Number(item.amount || 0),
      receiptDate: item.receiptDate || "",
      memo: item.memo || "",
      required: item.type === "leave" || isDeletedReceiptType(item.type) ? false : item.required !== false,
    }))
    .filter((item) => !isDefaultPendingRecital(item))
    .filter((item) => activeMonths.has(item.targetMonth) || item.targetMonth >= currentMonth);

  const monthSet = new Set(normalized.filter((item) => item.type === "monthly").map((item) => item.targetMonth));
  const hiddenMonthlySet = new Set(normalized.filter((item) => item.type === "deleted-monthly").map((item) => item.targetMonth));
  const deletedTypes = new Set(normalized.filter((item) => isDeletedReceiptType(item.type)).map((item) => item.type.replace("deleted-", "")));
  const missingMonthly = lastTwelveMonths()
    .filter((month) => !monthSet.has(month) && !hiddenMonthlySet.has(month))
    .map((month) => ({
      id: uid("receipt"),
      type: "monthly",
      label: "月謝",
      targetMonth: month,
      amount: Number(student.fee || 0),
      receiptDate: student.receiptChecked && month === monthKey() ? student.receiptDate || today() : "",
      memo: student.receiptChecked && month === monthKey() ? student.receiptMemo || "" : "",
      required: true,
    }));

  const hasFacility = normalized.some((item) => item.type === "facility") || deletedTypes.has("facility");
  const hasLive = normalized.some((item) => item.type === "live") || deletedTypes.has("live");
  const annual = [];
  const currentYear = new Date().getFullYear();

  if (!hasFacility && !isVisitCourse(student.courseId)) {
    annual.push({
      id: uid("receipt"),
      type: "facility",
      label: "施設費",
      targetMonth: `${currentYear}-04`,
      amount: 1200,
      receiptDate: today(),
      memo: `${currentYear}年度分`,
      required: true,
    });
  }
  if (!hasLive) {
    annual.push({
      id: uid("receipt"),
      type: "live",
      label: "ライブ参加費",
      targetMonth: `${currentYear}-04`,
      amount: 0,
      receiptDate: today(),
      memo: `${currentYear}年度分・不参加の場合は削除`,
      required: true,
    });
  }
  return sortReceiptItems([...normalized, ...missingMonthly, ...annual]);
}

function sortReceiptItems(items) {
  const typeOrder = { leave: 0, monthly: 1, facility: 2, live: 3, recital: 4, other: 5 };
  return [...items].sort((a, b) => {
    if (a.targetMonth !== b.targetMonth) return b.targetMonth.localeCompare(a.targetMonth);
    return (typeOrder[a.type] || 9) - (typeOrder[b.type] || 9);
  });
}

function currentMonthlyReceipt(student) {
  return student.receiptItems.find((item) => item.type === "monthly" && item.targetMonth === monthKey());
}

function leaveItemForMonth(student, targetMonth = monthKey()) {
  return (student.receiptItems || []).find((item) => item.type === "leave" && item.targetMonth === targetMonth);
}

function receiptSummary(student) {
  const items = student.receiptItems || [];
  const leaveMonths = new Set(items.filter((item) => item.type === "leave").map((item) => item.targetMonth));
  const requiredItems = items.filter((item) => item.required !== false && !(item.type === "monthly" && leaveMonths.has(item.targetMonth)));
  const paidItems = requiredItems.filter((item) => item.receiptDate);
  const unpaidItems = requiredItems.filter((item) => !item.receiptDate);
  const latest = [...paidItems].sort((a, b) => b.receiptDate.localeCompare(a.receiptDate))[0];
  return { paidItems, unpaidItems, latest };
}

function loadLocalSession() {
  const saved = sessionStorage.getItem(SESSION_KEY);
  return saved ? JSON.parse(saved) : null;
}

function setSession(next) {
  session = next;
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
  render();
}

async function boot() {
  state = loadLocalState();
  registerServiceWorker();

  if (cloudEnabled) {
    try {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
      supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
      const { data } = await supabase.auth.getSession();
      authUser = data.session?.user || null;
      session = authUser ? { role: "teacher", mode: "cloud" } : null;
      if (authUser) {
        await loadCloudState();
        subscribeToCloudChanges();
      }
      syncMessage = authUser ? "クラウド保存中です" : "クラウドログイン待ちです";
    } catch (error) {
      console.error(error);
      syncMessage = "クラウド接続に失敗しました。デモ保存で表示しています";
    }
  } else {
    syncMessage = "Supabase未設定のため、この端末だけのデモ保存です";
  }

  isLoading = false;
  render();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function getCourse(courseId) {
  return state.courses.find((course) => course.id === courseId) || state.courses[0];
}

function getStudent(id) {
  return state.students.find((student) => student.id === id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toDbCourse(course, orderIndex) {
  return {
    id: course.id,
    user_id: authUser.id,
    name: course.name,
    fee: Number(course.fee || 0),
    order_index: orderIndex,
  };
}

function toDbStudent(student, orderIndex) {
  return {
    id: student.id,
    user_id: authUser.id,
    name: student.name,
    grade: student.grade,
    course_id: student.courseId,
    lesson_day: student.lessonDay,
    start_time: student.startTime,
    fee: Number(student.fee || 0),
    receipt_checked: Boolean(student.receiptChecked),
    receipt_date: student.receiptDate || null,
    receipt_memo: student.receiptMemo || "",
    receipt_items: student.receiptItems || [],
    studio_notice: student.studioNotice || "",
    teacher_memo: student.teacherMemo || "",
    order_index: orderIndex,
    updated_at: student.updatedAt || new Date().toISOString(),
  };
}

function fromDbCourse(course) {
  return {
    id: course.id,
    name: course.name,
    fee: Number(course.fee || 0),
  };
}

function fromDbStudent(student) {
  return {
    id: student.id,
    name: student.name,
    grade: student.grade,
    courseId: student.course_id,
    lessonDay: student.lesson_day,
    startTime: student.start_time,
    fee: Number(student.fee || 0),
    receiptChecked: Boolean(student.receipt_checked),
    receiptDate: student.receipt_date || "",
    receiptMemo: student.receipt_memo || "",
    receiptItems: normalizeReceiptItems({
      ...student,
      courseId: student.course_id,
      fee: student.fee,
      receiptChecked: student.receipt_checked,
      receiptDate: student.receipt_date || "",
      receiptMemo: student.receipt_memo || "",
      receiptItems: student.receipt_items || [],
    }),
    studioNotice: student.studio_notice || "",
    teacherMemo: student.teacher_memo || "",
    updatedAt: student.updated_at || new Date().toISOString(),
  };
}

async function loadCloudState() {
  loadingMessage = "クラウドから読み込んでいます";
  render();

  const [{ data: settings, error: settingsError }, { data: courses, error: coursesError }, { data: students, error: studentsError }] =
    await Promise.all([
      supabase.from("app_settings").select("*").eq("user_id", authUser.id).maybeSingle(),
      supabase.from("courses").select("*").eq("user_id", authUser.id).order("order_index", { ascending: true }),
      supabase.from("students").select("*").eq("user_id", authUser.id).order("order_index", { ascending: true }),
    ]);

  if (settingsError || coursesError || studentsError) {
    throw settingsError || coursesError || studentsError;
  }

  if (!settings) {
    await seedCloudState();
    return loadCloudState();
  }

  state = normalizeState({
    studioName: settings.studio_name || DEFAULT_STUDIO_NAME,
    teacher: { id: "teacher", password: "admin123" },
    courses: courses.map(fromDbCourse),
    students: students.map(fromDbStudent),
    updatedAt: settings.updated_at || new Date().toISOString(),
  });
}

async function seedCloudState() {
  const initial = loadLocalState();
  await supabase.from("app_settings").upsert({
    user_id: authUser.id,
    studio_name: initial.studioName || DEFAULT_STUDIO_NAME,
    updated_at: new Date().toISOString(),
  });
  await supabase.from("courses").upsert(initial.courses.map(toDbCourse));
  await supabase.from("students").upsert(initial.students.map(toDbStudent));
}

async function saveState(message = "保存しました") {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  if (cloudEnabled && supabase && authUser) {
    try {
      syncMessage = "クラウドへ保存中です";
      render();
      await saveCloudState();
      syncMessage = "クラウド保存済みです";
    } catch (error) {
      console.error(error);
      syncMessage = "クラウド保存に失敗しました。通信状態を確認してください";
    }
  }

  channel?.postMessage({ type: "state", updatedAt: state.updatedAt });
  toast(message);
  render();
}

async function saveCloudState() {
  await supabase.from("app_settings").upsert({
    user_id: authUser.id,
    studio_name: state.studioName || DEFAULT_STUDIO_NAME,
    updated_at: state.updatedAt,
  });

  await supabase.from("courses").delete().eq("user_id", authUser.id);
  await supabase.from("students").delete().eq("user_id", authUser.id);
  await supabase.from("courses").insert(state.courses.map(toDbCourse));
  await supabase.from("students").insert(state.students.map(toDbStudent));
}

function subscribeToCloudChanges() {
  supabase
    .channel("piano-studio-data")
    .on("postgres_changes", { event: "*", schema: "public", table: "students", filter: `user_id=eq.${authUser.id}` }, refreshCloudQuietly)
    .on("postgres_changes", { event: "*", schema: "public", table: "courses", filter: `user_id=eq.${authUser.id}` }, refreshCloudQuietly)
    .on("postgres_changes", { event: "*", schema: "public", table: "app_settings", filter: `user_id=eq.${authUser.id}` }, refreshCloudQuietly)
    .subscribe();
}

async function refreshCloudQuietly() {
  if (!authUser) return;
  await loadCloudState();
  syncMessage = "クラウドから最新情報を反映しました";
  render();
}

function render() {
  document.title = `${state.studioName || DEFAULT_STUDIO_NAME} 生徒管理`;

  if (isLoading) {
    app.innerHTML = shell(`<section class="login-wrap"><div class="login-card"><h2>${escapeHtml(loadingMessage)}</h2><p class="hint">少しだけお待ちください。</p></div></section>`);
    return;
  }

  if (!session) {
    app.innerHTML = loginTemplate();
    bindLogin();
    return;
  }

  app.innerHTML = teacherTemplate();
  bindTeacher();
}

function shell(inner, actions = "") {
  return `
    <main class="app-shell">
      <header class="topbar">
        <div class="brand">
          <div class="mark" aria-hidden="true">♪</div>
          <div>
            <h1>${escapeHtml(state.studioName || DEFAULT_STUDIO_NAME)} 生徒管理</h1>
            <p class="subtle">講師専用の生徒カード管理</p>
          </div>
        </div>
        ${actions}
      </header>
      ${inner}
    </main>
    <div class="toast" id="toast"></div>
  `;
}

function loginTemplate() {
  const isCloud = cloudEnabled && supabase;
  return shell(`
    <section class="login-wrap">
      <div class="login-card">
        <h2>講師ログイン</h2>
        <form class="form" id="loginForm">
          <label class="field">
            <span>${isCloud ? "メールアドレス" : "ログインID"}</span>
            <input name="loginId" autocomplete="username" value="${isCloud ? "" : "teacher"}" />
          </label>
          <label class="field">
            <span>パスワード</span>
            <input name="password" type="password" autocomplete="current-password" value="${isCloud ? "" : "admin123"}" />
          </label>
          <div class="error" id="loginError">ログイン情報が違います。</div>
          <button class="btn" type="submit">ログイン</button>
          <p class="hint">${isCloud ? "Supabaseで登録した講師メールでログインします。" : "デモ: teacher / admin123。Supabase設定後はスマホでもクラウド保存できます。"}</p>
        </form>
      </div>
    </section>
  `);
}

function teacherTemplate() {
  const activeMonthlyStudents = state.students.filter((student) => !leaveItemForMonth(student));
  const paid = activeMonthlyStudents.filter((student) => currentMonthlyReceipt(student)?.receiptDate).length;
  const unpaid = activeMonthlyStudents.length - paid;
  const faceMonthly = state.students
    .filter((student) => isFaceToFaceMonthlyCourse(student.courseId))
    .reduce((sum, student) => sum + Number(student.fee || 0), 0);
  const ticketTotal = state.students
    .filter((student) => isTicketCourse(student.courseId))
    .reduce((sum, student) => sum + Number(student.fee || 0), 0);
  const totalUnpaidItems = state.students.reduce((sum, student) => sum + receiptSummary(student).unpaidItems.length, 0);
  const filtered = state.students.filter((student) => {
    const haystack = `${student.name} ${student.grade} ${student.lessonDay} ${getCourse(student.courseId).name}`.toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  return shell(
    `
      <section class="dashboard">
        <div class="sync-banner">${escapeHtml(syncMessage)}</div>
        <div class="toolbar">
          <input id="search" placeholder="名前・学年・曜日・コースで検索" value="${escapeHtml(searchTerm)}" />
          <button class="btn secondary" id="courseSettings">コース設定</button>
          <button class="btn" id="addStudent">＋ 生徒追加</button>
        </div>
        <form class="panel studio-settings" id="studioForm">
          <label class="field">
            <span>お教室名</span>
            <input name="studioName" value="${escapeHtml(state.studioName || DEFAULT_STUDIO_NAME)}" />
          </label>
          <button class="btn secondary" type="submit">教室名を保存</button>
        </form>
        <form class="panel password-settings" id="passwordForm">
          <div>
            <h2>ログインパスワード変更</h2>
            <p class="subtle">管理画面へログインするパスワードを変更できます</p>
          </div>
          <label class="field">
            <span>新しいパスワード</span>
            <input name="newPassword" type="password" autocomplete="new-password" minlength="6" />
          </label>
          <label class="field">
            <span>確認</span>
            <input name="confirmPassword" type="password" autocomplete="new-password" minlength="6" />
          </label>
          <button class="btn secondary" type="submit">パスワードを変更</button>
        </form>
        <div class="stats">
          <div class="stat"><span class="subtle">生徒数</span><strong>${state.students.length}</strong></div>
          <div class="stat"><span class="subtle">今月月謝 領収済み</span><strong>${paid}</strong></div>
          <div class="stat"><span class="subtle">今月月謝 未確認</span><strong>${unpaid}</strong></div>
          <div class="stat"><span class="subtle">対面月謝 合計</span><strong>${yen(faceMonthly)}</strong></div>
          <div class="stat"><span class="subtle">チケット費 合計</span><strong>${yen(ticketTotal)}</strong></div>
          <div class="stat"><span class="subtle">未領収項目</span><strong>${totalUnpaidItems}</strong></div>
        </div>
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>生徒カード</h2>
              <p class="subtle">レッスン予定と領収状況を一覧で確認できます</p>
            </div>
          </div>
          <div class="student-grid">
            ${filtered.map(studentCardTemplate).join("") || `<p class="subtle">該当する生徒がいません。</p>`}
          </div>
        </section>
      </section>
      ${studentModalTemplate()}
      ${receiptModalTemplate()}
      ${courseModalTemplate()}
    `,
    `<button class="btn secondary" id="logout">ログアウト</button>`,
  );
}

function studentCardTemplate(student) {
  const course = getCourse(student.courseId);
  const currentReceipt = currentMonthlyReceipt(student);
  const currentLeave = leaveItemForMonth(student);
  const summary = receiptSummary(student);
  return `
    <article class="student-card" data-student-card="${student.id}">
      <div class="card-head">
        <div>
          <button class="card-name name-button" data-edit="${student.id}" type="button">${escapeHtml(student.name)}</button>
          <p class="subtle">${escapeHtml(student.grade)} / ${escapeHtml(course.name)}</p>
        </div>
        <span class="badge ${currentLeave || currentReceipt?.receiptDate ? "" : "warn"}">${
          currentLeave ? "今月休会中" : currentReceipt?.receiptDate ? "今月領収済み" : "今月未確認"
        }</span>
      </div>
      <div class="meta">
        <div><span>レッスン</span>${escapeHtml(student.lessonDay)}曜 ${escapeHtml(student.startTime)}</div>
        <div><span>レッスン費</span>${yen(student.fee)}</div>
        <div><span>今月月謝</span>${currentLeave ? "休会中" : currentReceipt?.receiptDate ? currentReceipt.receiptDate : "未領収"}</div>
        <div><span>直近領収</span>${summary.latest ? `${summary.latest.receiptDate} ${escapeHtml(summary.latest.label)}` : "なし"}</div>
        <div><span>未領収項目</span>${summary.unpaidItems.length}件</div>
        <div><span>講師メモ</span>${escapeHtml(student.teacherMemo || "なし")}</div>
      </div>
      <div class="card-actions">
        ${
          currentLeave
            ? `<button class="btn secondary" type="button" disabled>休会中</button>`
            : `<button class="btn" data-quick-receipt="${student.id}">${currentReceipt?.receiptDate ? "領収日更新" : "今月月謝を領収"}</button>`
        }
        <button class="btn secondary" data-receipts="${student.id}">入金履歴</button>
        <button class="btn secondary" data-edit="${student.id}">編集</button>
        <button class="btn danger" data-delete="${student.id}">削除</button>
      </div>
    </article>
  `;
}

function studentModalTemplate() {
  const student = editingStudentId ? getStudent(editingStudentId) : emptyStudent();
  const title = editingStudentId ? "生徒カード編集" : "生徒追加";
  return `
    <div class="overlay" id="studentOverlay" aria-hidden="true">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h2>${title}</h2>
          <button class="btn icon secondary" data-close-modal type="button">×</button>
        </div>
        <form class="form" id="studentForm">
          <div class="form-grid">
            <label class="field"><span>名前</span><input name="name" required value="${escapeHtml(student.name)}" /></label>
            <label class="field"><span>学年</span><input name="grade" required value="${escapeHtml(student.grade)}" /></label>
            <label class="field">
              <span>レッスンコース</span>
              <select name="courseId">${state.courses.map((course) => `<option value="${course.id}" ${course.id === student.courseId ? "selected" : ""}>${escapeHtml(course.name)}</option>`).join("")}</select>
            </label>
            <label class="field"><span>レッスン費</span><input name="fee" type="number" min="0" step="100" value="${student.fee}" /></label>
            <label class="field"><span>曜日</span><select name="lessonDay">${["月", "火", "水", "木", "金", "土", "日"].map((day) => `<option ${day === student.lessonDay ? "selected" : ""}>${day}</option>`).join("")}</select></label>
            <label class="field"><span>開始時間</span><input name="startTime" type="time" value="${escapeHtml(student.startTime)}" /></label>
            <label class="field full"><span>お教室からの案内事項</span><textarea name="studioNotice">${escapeHtml(student.studioNotice)}</textarea></label>
            <label class="field full"><span>講師メモ</span><textarea name="teacherMemo">${escapeHtml(student.teacherMemo || "")}</textarea></label>
          </div>
          <button class="btn" type="submit">保存</button>
        </form>
      </div>
    </div>
  `;
}

function receiptModalTemplate() {
  const student = receiptStudentId ? getStudent(receiptStudentId) : null;
  if (!student) {
    return `<div class="overlay" id="receiptOverlay" aria-hidden="true"></div>`;
  }
  const rows = sortReceiptItems(student.receiptItems || []).filter((item) => !isDeletedReceiptType(item.type));
  return `
    <div class="overlay ${isReceiptModalOpen ? "show" : ""}" id="receiptOverlay" aria-hidden="${isReceiptModalOpen ? "false" : "true"}">
      <div class="modal receipt-modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div>
            <h2>${escapeHtml(student.name)}さんの入金履歴</h2>
            <p class="subtle">2026年4月以降、直近1年分の月謝と年1回の徴収項目を確認できます</p>
          </div>
          <button class="btn icon secondary" data-close-modal type="button">×</button>
        </div>
        <div class="receipt-list">
          ${rows.map((item) => receiptRowTemplate(item)).join("")}
        </div>
        <form class="form add-receipt-form" id="addReceiptForm">
          <h3>入金・休会項目を追加</h3>
          <div class="form-grid">
            <label class="field">
              <span>種類</span>
              <select name="type">
                ${Object.entries(RECEIPT_TYPES).map(([value, label]) => `<option value="${value}" ${value === "other" ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </label>
            <label class="field"><span>対象月</span><input name="targetMonth" type="month" value="${monthKey()}" /></label>
            <label class="field"><span>項目名</span><input name="label" value="その他" /></label>
            <label class="field"><span>金額</span><input name="amount" type="number" min="0" step="100" value="0" /></label>
            <label class="field full"><span>メモ</span><input name="memo" placeholder="必要に応じてメモ" /></label>
          </div>
          <button class="btn secondary" type="submit">項目を追加</button>
        </form>
      </div>
    </div>
  `;
}

function receiptRowTemplate(item) {
  const paid = Boolean(item.receiptDate);
  const isLeave = item.type === "leave";
  return `
    <div class="receipt-row ${isLeave ? "leave" : paid ? "paid" : "unpaid"}" data-receipt-row="${item.id}">
      <div>
        <strong>${escapeHtml(item.label || RECEIPT_TYPES[item.type] || "その他")}</strong>
        <span>${formatMonth(item.targetMonth)} / ${isLeave ? "月謝不要" : yen(item.amount)}</span>
      </div>
      ${
        isLeave
          ? `<div class="receipt-note"><span>扱い</span>未領収に含めない</div>`
          : `<label>
              <span>領収日</span>
              <input data-receipt-date="${item.id}" type="date" value="${escapeHtml(item.receiptDate || "")}" />
            </label>`
      }
      <label>
        <span>メモ</span>
        <input data-receipt-memo="${item.id}" value="${escapeHtml(item.memo || "")}" />
      </label>
      <div class="receipt-actions">
        ${isLeave ? "" : `<button class="btn ${paid ? "secondary" : ""}" type="button" data-mark-receipt="${item.id}">${paid ? "日付更新" : "領収"}</button>`}
        <button class="btn secondary" type="button" data-save-receipt="${item.id}">保存</button>
        ${isLeave ? "" : `<button class="btn danger" type="button" data-clear-receipt="${item.id}">取消</button>`}
        ${isLeave ? "" : `<button class="btn secondary" type="button" data-leave-receipt="${item.id}">休会中</button>`}
        <button class="btn danger" type="button" data-delete-receipt="${item.id}">削除</button>
      </div>
    </div>
  `;
}

function courseModalTemplate() {
  return `
    <div class="overlay" id="courseOverlay" aria-hidden="true">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div>
            <h2>レッスンコース設定</h2>
            <p class="subtle">案内資料の金額に合わせて編集できます</p>
          </div>
          <button class="btn icon secondary" data-close-modal type="button">×</button>
        </div>
        <form class="form" id="courseForm">
          <div class="course-list">
            ${state.courses
              .map(
                (course) => `
                <div class="course-row" data-course-row="${course.id}">
                  <label><span>コース名</span><input name="name-${course.id}" value="${escapeHtml(course.name)}" /></label>
                  <label><span>料金</span><input name="fee-${course.id}" type="number" min="0" step="100" value="${course.fee}" /></label>
                  <button class="btn danger" type="button" data-delete-course="${course.id}">削除</button>
                </div>
              `,
              )
              .join("")}
          </div>
          <div class="card-actions">
            <button class="btn secondary" type="button" id="addCourse">＋ コース追加</button>
            <button class="btn" type="submit">保存</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function emptyStudent() {
  const course = state.courses[0];
  return {
    id: uid("student"),
    name: "",
    grade: "",
    courseId: course.id,
    lessonDay: "月",
    startTime: "15:00",
    fee: course.fee,
    receiptChecked: false,
    receiptDate: "",
    receiptMemo: "",
    receiptItems: createReceiptItems({ courseId: course.id, fee: course.fee }),
    studioNotice: "",
    teacherMemo: "",
  };
}

function bindLogin() {
  document.querySelector("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const loginId = data.get("loginId").trim();
    const password = data.get("password").trim();
    const error = document.querySelector("#loginError");

    if (cloudEnabled && supabase) {
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: loginId,
        password,
      });
      if (loginError) {
        error.classList.add("show");
        return;
      }
      authUser = loginData.user;
      session = { role: "teacher", mode: "cloud" };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      await loadCloudState();
      subscribeToCloudChanges();
      syncMessage = "クラウド保存中です";
      render();
      return;
    }

    if (loginId === state.teacher.id && password === state.teacher.password) {
      setSession({ role: "teacher", mode: "local" });
      return;
    }

    error.classList.add("show");
  });
}

function bindTeacher() {
  document.querySelector("#logout").addEventListener("click", logout);
  document.querySelector("#search").addEventListener("input", (event) => {
    searchTerm = event.target.value;
    render();
  });
  document.querySelector("#addStudent").addEventListener("click", () => openStudentModal(null));
  document.querySelector("#courseSettings").addEventListener("click", openCourseModal);
  document.querySelector("#studioForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.studioName = data.get("studioName").trim() || DEFAULT_STUDIO_NAME;
    await saveState("教室名を保存しました");
  });
  document.querySelector("#passwordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const newPassword = data.get("newPassword").trim();
    const confirmPassword = data.get("confirmPassword").trim();
    if (newPassword.length < 6) {
      alert("パスワードは6文字以上で入力してください。");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("確認用パスワードが一致しません。");
      return;
    }
    if (cloudEnabled && supabase && authUser) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        alert("パスワード変更に失敗しました。もう一度お試しください。");
        return;
      }
    } else {
      state.teacher.password = newPassword;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    event.currentTarget.reset();
    toast("パスワードを変更しました");
  });

  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openStudentModal(button.dataset.edit));
  });

  document.querySelectorAll("[data-receipts]").forEach((button) => {
    button.addEventListener("click", () => openReceiptModal(button.dataset.receipts));
  });

  document.querySelectorAll("[data-quick-receipt]").forEach((button) => {
    button.addEventListener("click", async () => {
      const student = getStudent(button.dataset.quickReceipt);
      const receipt = currentMonthlyReceipt(student);
      if (!receipt) return;
      receipt.receiptDate = today();
      receipt.memo = receipt.memo || "月謝を領収";
      student.receiptChecked = true;
      student.receiptDate = receipt.receiptDate;
      student.receiptMemo = receipt.memo;
      student.updatedAt = new Date().toISOString();
      await saveState("今月月謝を領収しました");
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const student = getStudent(button.dataset.delete);
      if (!confirm(`${student.name}さんのカードを削除しますか？`)) return;
      state.students = state.students.filter((item) => item.id !== student.id);
      await saveState("生徒カードを削除しました");
    });
  });

  bindStudentModal();
  bindReceiptModal();
  bindCourseModal();
}

async function logout() {
  if (cloudEnabled && supabase) await supabase.auth.signOut();
  authUser = null;
  setSession(null);
}

function openStudentModal(id) {
  editingStudentId = id;
  render();
  document.querySelector("#studentOverlay").classList.add("show");
  document.querySelector("#studentOverlay").setAttribute("aria-hidden", "false");
}

function openReceiptModal(id) {
  receiptStudentId = id;
  isReceiptModalOpen = true;
  render();
}

function bindReceiptModal() {
  const overlay = document.querySelector("#receiptOverlay");
  if (!overlay || !receiptStudentId) return;
  overlay.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeModals);
  });

  overlay.querySelectorAll("[data-mark-receipt]").forEach((button) => {
    button.addEventListener("click", async () => {
      await updateReceiptItem(button.dataset.markReceipt, { receiptDate: today() }, "領収しました");
    });
  });

  overlay.querySelectorAll("[data-save-receipt]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.saveReceipt;
      const dateInput = overlay.querySelector(`[data-receipt-date="${id}"]`);
      await updateReceiptItem(
        id,
        {
          receiptDate: dateInput ? dateInput.value : "",
          memo: overlay.querySelector(`[data-receipt-memo="${id}"]`).value.trim(),
        },
        "入金履歴を保存しました",
      );
    });
  });

  overlay.querySelectorAll("[data-clear-receipt]").forEach((button) => {
    button.addEventListener("click", async () => {
      await updateReceiptItem(button.dataset.clearReceipt, { receiptDate: "" }, "領収を取り消しました");
    });
  });

  overlay.querySelectorAll("[data-leave-receipt]").forEach((button) => {
    button.addEventListener("click", async () => {
      const student = getStudent(receiptStudentId);
      const item = student.receiptItems.find((receipt) => receipt.id === button.dataset.leaveReceipt);
      if (!item) return;
      addLeaveItems(student, item.targetMonth, item.memo || "休会中のため月謝不要");
      student.updatedAt = new Date().toISOString();
      await saveState("3か月分の休会を追加しました");
    });
  });

  overlay.querySelectorAll("[data-delete-receipt]").forEach((button) => {
    button.addEventListener("click", async () => {
      const student = getStudent(receiptStudentId);
      const item = student.receiptItems.find((receipt) => receipt.id === button.dataset.deleteReceipt);
      student.receiptItems = student.receiptItems.filter((receipt) => receipt.id !== button.dataset.deleteReceipt);
      if (item?.type === "monthly" || item?.type === "facility" || item?.type === "live" || item?.type === "recital") {
        student.receiptItems.push({
          id: uid("receipt"),
          type: `deleted-${item.type}`,
          label: `削除済み${item.label || RECEIPT_TYPES[item.type] || "項目"}`,
          targetMonth: item.targetMonth,
          amount: 0,
          receiptDate: "",
          memo: "削除済み",
          required: false,
        });
      }
      student.updatedAt = new Date().toISOString();
      await saveState("入金項目を削除しました");
    });
  });

  overlay.querySelector("#addReceiptForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const student = getStudent(receiptStudentId);
    const data = new FormData(event.currentTarget);
    const type = data.get("type");
    const targetMonth = data.get("targetMonth") || monthKey();
    if (type === "leave") {
      addLeaveItems(student, targetMonth, data.get("memo").trim() || "休会中のため月謝不要");
    } else {
      student.receiptItems.push({
        id: uid("receipt"),
        type,
        label: data.get("label").trim() || RECEIPT_TYPES[type] || "その他",
        targetMonth,
        amount: Number(data.get("amount") || 0),
        receiptDate: "",
        memo: data.get("memo").trim(),
        required: true,
      });
    }
    student.receiptItems = sortReceiptItems(student.receiptItems);
    student.updatedAt = new Date().toISOString();
    await saveState(type === "leave" ? "3か月分の休会を追加しました" : "入金項目を追加しました");
  });
}

function addLeaveItems(student, targetMonth, memo) {
  const [year, month] = targetMonth.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  for (let index = 0; index < 3; index += 1) {
    const leaveMonth = monthKey(addMonths(start, index));
    const exists = student.receiptItems.some((item) => item.type === "leave" && item.targetMonth === leaveMonth);
    if (!exists) {
      student.receiptItems.push({
        id: uid("receipt"),
        type: "leave",
        label: "休会中",
        targetMonth: leaveMonth,
        amount: 0,
        receiptDate: "",
        memo,
        required: false,
      });
    }
  }
  student.receiptItems = sortReceiptItems(student.receiptItems);
}

async function updateReceiptItem(receiptId, updates, message) {
  const student = getStudent(receiptStudentId);
  student.receiptItems = student.receiptItems.map((item) => (item.id === receiptId ? { ...item, ...updates } : item));
  const current = currentMonthlyReceipt(student);
  student.receiptChecked = Boolean(current?.receiptDate);
  student.receiptDate = current?.receiptDate || "";
  student.receiptMemo = current?.memo || "";
  student.updatedAt = new Date().toISOString();
  await saveState(message);
}

function bindStudentModal() {
  const overlay = document.querySelector("#studentOverlay");
  overlay.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeModals);
  });

  const courseSelect = overlay.querySelector("[name='courseId']");
  const feeInput = overlay.querySelector("[name='fee']");
  courseSelect.addEventListener("change", () => {
    feeInput.value = getCourse(courseSelect.value).fee;
  });

  overlay.querySelector("#studentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = {
      id: editingStudentId || uid("student"),
      name: data.get("name").trim(),
      grade: data.get("grade").trim(),
      courseId: data.get("courseId"),
      lessonDay: data.get("lessonDay"),
      startTime: data.get("startTime"),
      fee: Number(data.get("fee")),
      receiptChecked: false,
      receiptDate: "",
      receiptMemo: "",
      receiptItems: editingStudentId
        ? normalizeReceiptItems({
            ...getStudent(editingStudentId),
            courseId: data.get("courseId"),
            fee: Number(data.get("fee")),
          }).map((item) => (item.type === "monthly" ? { ...item, amount: Number(data.get("fee")) } : item))
        : createReceiptItems({ courseId: data.get("courseId"), fee: Number(data.get("fee")) }),
      studioNotice: data.get("studioNotice").trim(),
      teacherMemo: data.get("teacherMemo").trim(),
      updatedAt: new Date().toISOString(),
    };

    if (editingStudentId) {
      state.students = state.students.map((student) => (student.id === editingStudentId ? next : student));
    } else {
      state.students = [...state.students, next];
    }
    editingStudentId = null;
    await saveState("生徒カードを保存しました");
  });
}

function openCourseModal() {
  document.querySelector("#courseOverlay").classList.add("show");
  document.querySelector("#courseOverlay").setAttribute("aria-hidden", "false");
}

function bindCourseModal() {
  const overlay = document.querySelector("#courseOverlay");
  overlay.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeModals);
  });

  overlay.querySelector("#addCourse").addEventListener("click", async () => {
    state.courses.push({ id: uid("course"), name: "新しいコース", fee: 0 });
    await saveState("コースを追加しました");
    setTimeout(openCourseModal, 0);
  });

  overlay.querySelectorAll("[data-delete-course]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (state.courses.length <= 1) {
        alert("コースは1つ以上必要です。");
        return;
      }
      const courseId = button.dataset.deleteCourse;
      const fallback = state.courses.find((course) => course.id !== courseId);
      state.courses = state.courses.filter((course) => course.id !== courseId);
      state.students = state.students.map((student) =>
        student.courseId === courseId ? { ...student, courseId: fallback.id, fee: fallback.fee, updatedAt: new Date().toISOString() } : student,
      );
      await saveState("コースを削除しました");
      setTimeout(openCourseModal, 0);
    });
  });

  overlay.querySelector("#courseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.courses = state.courses.map((course) => ({
      ...course,
      name: data.get(`name-${course.id}`).trim() || course.name,
      fee: Number(data.get(`fee-${course.id}`) || 0),
    }));
    await saveState("コース設定を保存しました");
  });
}

function closeModals() {
  editingStudentId = null;
  receiptStudentId = null;
  isReceiptModalOpen = false;
  document.querySelectorAll(".overlay").forEach((overlay) => {
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
  });
}

function toast(message) {
  const node = document.querySelector("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  window.setTimeout(() => node.classList.remove("show"), 1800);
}

window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY || !event.newValue || (cloudEnabled && authUser)) return;
  state = JSON.parse(event.newValue);
  render();
});

channel?.addEventListener("message", (event) => {
  if (event.data?.type !== "state" || (cloudEnabled && authUser)) return;
  state = loadLocalState();
  render();
});

boot();
