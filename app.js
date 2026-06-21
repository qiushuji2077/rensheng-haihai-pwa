const STORAGE_KEY = "rensheng-haihai.memories.v1";
const VIEW_KEY = "rensheng-haihai.view.v1";
const APP_VERSION = "1.5.6";
const ARCHIVE_VERSION = 2;
const HOLISTIC_ANALYSIS_KEY = "rensheng-haihai.holistic-analysis.v1";
const CODEX_CONFIG_KEY = "rensheng-haihai.codex-config.v1";
const LAST_BACKUP_KEY = "rensheng-haihai.last-backup.v1";
const RESOLVED_SIGNALS_KEY = "rensheng-haihai.resolved-signals.v1";
const BACKUP_FORMAT = "rensheng-haihai-encrypted-backup";
const BACKUP_AAD = "rensheng-haihai-backup:v1";
const BACKUP_ITERATIONS = 310000;
const SAMPLE_TEXTS = new Set([
  "六点自然醒，没赖床。煮了咖啡，看着窗外的雨，想起十年前在厦门看海的那个清晨。",
  "和妈妈通了电话，她说膝盖最近又疼了，但不肯去医院。我有点担心，又不知道怎么劝她。",
  "中午跑了五公里，比上周快了二十秒。身体在慢慢变好。",
  "项目还悬着。客户说下周给答复，我猜他们是想压价。",
  "读到一句话：「人生海海，敢死不叫勇敢，活着才需要勇气。」记下来。",
  "又熬到半夜才睡，明明说好十一点的。",
  "陪老婆去了趟菜场，买了她爱吃的那条鱼。",
  "改方案改到现在，眼睛很干，肩也僵。",
  "睡前又刷手机刷了一个多小时，停不下来。",
  "给妈妈寄了副护膝，不知道她会不会嫌麻烦。",
  "搬家的事基本定了，下个月十五号。"
]);

const kinds = {
  person: { label: "人", color: "#c16a4e", facets: ["关系线", "成长线", "健康信号"], icon: "人" },
  event: { label: "事", color: "#2e6e73", facets: ["进展", "决定", "风险"], icon: "↗" },
  content: { label: "内容", color: "#b08a3e", facets: ["想法", "阅读", "灵感"], icon: "✦" }
};

const icons = {
  back: `<svg viewBox="0 0 24 24" fill="none"><path d="M15 4l-8 8 8 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" stroke-width="2"/><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0012 0M12 17v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.8-2.8 8.2-7 10-4.2-1.8-7-5.2-7-10V6l7-3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m9.2 12 1.8 1.8 3.9-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  more: `<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

let state = {
  view: sessionStorage.getItem(VIEW_KEY) || "stream",
  selectedId: null,
  facet: null,
  facetBack: "lenses",
  resolvedSignals: loadResolvedSignals(),
  showResolved: false,
  search: "",
  scope: "all",
  composer: false,
  editor: false,
  installHelp: false,
  deleteConfirm: false,
  urgentAlert: null,
  protectionMode: null,
  codexMode: null,
  codexBusy: false,
  pendingRestoreFile: null,
  restoreStrategy: "merge",
  restoreKind: null,
  recording: false,
  recognition: null,
  memories: loadMemories(),
  holisticAnalysis: loadHolisticAnalysis(),
  codexConfig: loadCodexConfig()
};

let lastRenderedView = null;   // 用于切页进场动画（只在视图变化时触发一次）

function loadMemories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) {
        const cleaned = saved
          .filter(item => !SAMPLE_TEXTS.has(item.text))
          .map(migrateMemory);
        safeSetItem(STORAGE_KEY, JSON.stringify(cleaned));
        return cleaned;
      }
    }
  } catch {}
  safeSetItem(STORAGE_KEY, "[]");
  return [];
}

function saveMemories() {
  safeSetItem(STORAGE_KEY, JSON.stringify(state.memories));
  idbSet(STORAGE_KEY, state.memories);          // 异步镜像到更耐久的 IndexedDB
}

function persistHolistic() {
  if (!state.holisticAnalysis) return;
  safeSetItem(HOLISTIC_ANALYSIS_KEY, JSON.stringify(state.holisticAnalysis));
  idbSet(HOLISTIC_ANALYSIS_KEY, state.holisticAnalysis);
}

// ── 耐久存储 ──────────────────────────────────────────────
// iOS 上 localStorage 长期不用可能被系统清理，且只有约 5MB。
// 这里用 IndexedDB 作为更大、更耐久的镜像，两者互为备份；
// 同时请求「持久化」授权，尽量让本站存储免于被自动清除。
// 任何一处写失败都会明确提示，绝不静默丢数据。
function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error("本地存储写入失败", error);
    notify("⚠️ 设备存储写入失败，请尽快用「记忆保护」创建一次备份");
    return false;
  }
}

const IDB_NAME = "rensheng-haihai";
const IDB_STORE = "kv";
let idbPromise = null;
function idbOpen() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise(resolve => {
    if (!("indexedDB" in window)) return resolve(null);
    let request;
    try { request = indexedDB.open(IDB_NAME, 1); } catch { return resolve(null); }
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return idbPromise;
}
function idbSet(key, value) {
  return idbOpen().then(db => {
    if (!db) return false;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch { resolve(false); }
    });
  }).catch(() => false);
}
function idbGet(key) {
  return idbOpen().then(db => {
    if (!db) return undefined;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const request = tx.objectStore(IDB_STORE).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(undefined);
      } catch { resolve(undefined); }
    });
  }).catch(() => undefined);
}
async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return;
    if (await navigator.storage.persisted?.()) return;
    await navigator.storage.persist();
  } catch {}
}

// 启动兜底：若 localStorage 曾被系统清理，用 IndexedDB 镜像补回；
// 两边取并集，确保一条都不丢。再把当前内容回写 IndexedDB（首次启用时迁移已有数据）。
async function hydrateFromDurableStore() {
  await requestPersistentStorage();
  let durable;
  try { durable = await idbGet(STORAGE_KEY); } catch { durable = undefined; }
  if (Array.isArray(durable) && durable.length) {
    const durableMemories = durable.map(migrateMemory).filter(Boolean);
    const merged = mergeMemories(state.memories, durableMemories);
    if (merged.length !== state.memories.length) {
      state.memories = merged;
      safeSetItem(STORAGE_KEY, JSON.stringify(state.memories));
      render();
    }
  }
  idbSet(STORAGE_KEY, state.memories);
  if (state.holisticAnalysis) {
    idbSet(HOLISTIC_ANALYSIS_KEY, state.holisticAnalysis);
  } else {
    try {
      const durableAnalysis = await idbGet(HOLISTIC_ANALYSIS_KEY);
      if (durableAnalysis && typeof durableAnalysis === "object") {
        state.holisticAnalysis = durableAnalysis;
        safeSetItem(HOLISTIC_ANALYSIS_KEY, JSON.stringify(durableAnalysis));
        if (state.view === "summary") render();
      }
    } catch {}
  }
}

function loadHolisticAnalysis() {
  try {
    const saved = JSON.parse(localStorage.getItem(HOLISTIC_ANALYSIS_KEY));
    return saved && typeof saved === "object" ? saved : null;
  } catch { return null; }
}

function loadCodexConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CODEX_CONFIG_KEY));
    const current = saved && typeof saved === "object" ? saved : { token: "", endpoint: "" };
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = params.get("codex_token");
    const endpoint = normalizeEndpoint(params.get("codex_endpoint") || "");
    if (token && endpoint) {
      const paired = { token, endpoint };
      safeSetItem(CODEX_CONFIG_KEY, JSON.stringify(paired));
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      return paired;
    }
    return current;
  } catch { return { token: "", endpoint: "" }; }
}

function migrateMemory(item) {
  if (!item || typeof item.text !== "string") return item;
  if (item.archiveVersion === ARCHIVE_VERSION) return item;
  return {
    ...item,
    ...classifyMemory(item.text),
    urgentSignal: detectUrgentSignal(item.text),
    insight: "",
    insightLabel: "",
    warning: false,
    lenses: [],
    archiveVersion: ARCHIVE_VERSION
  };
}

function memory(text, createdAt = new Date().toISOString()) {
  const archive = classifyMemory(text);
  return {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    text,
    createdAt,
    source: "text",
    seconds: 0,
    ...archive,
    userKind: false,
    urgentSignal: detectUrgentSignal(text),
    insight: "",
    insightLabel: "",
    warning: false,
    lenses: [],
    archiveVersion: ARCHIVE_VERSION
  };
}

function classifyMemory(text) {
  const relations = [
    [["妈妈","妈","母亲","老妈"],"妈妈"], [["爸爸","爸","父亲","老爸"],"爸爸"],
    [["奶奶"],"奶奶"], [["爷爷"],"爷爷"], [["外婆","姥姥"],"外婆"], [["外公","姥爷"],"外公"],
    [["老婆","妻子","媳妇"],"老婆"], [["老公","丈夫"],"老公"], [["爱人","配偶","对象"],"配偶"],
    [["儿子","男孩"],"儿子"], [["女儿","女孩"],"女儿"],
    [["孙子","孙女","外孙","外孙女"],"孙辈"],
    [["哥哥","姐姐","弟弟","妹妹","兄弟","姐妹"],"兄弟姐妹"],
    [["孩子","小孩","宝宝","娃"],"孩子"],
    [["医生","大夫","护士"],"医护"],
    [["朋友","同学","同事","闺蜜","邻居","老乡"],"朋友"]
  ];
  const has = list => list.some(w => text.includes(w));

  // 1) 明确提到他人 → 人（涉及具体人物优先）
  const other = relations.find(([keys]) => keys.some(k => text.includes(k)))?.[1] || null;

  // 2) 事务信号 → 事（含家庭/就医/生活办事）
  const eventSignal = has(["项目","工作","上班","会议","开会","客户","谈判","合同","方案","搬家",
    "计划","任务","面试","预算","决定","报价","上线","发布","出差","加班","考试","比赛","装修",
    "租房","买房","投资","股票","工资","账单","报销","截止","deadline","签约",
    "挂号","看病","复查","复诊","住院","手术","办理","缴费","预约","约了","快递","维修",
    "退休","养老金","证件","银行","政务","报名","开学","开会"]);

  // 3) 关于自己身心的记录（跑步/睡眠/情绪/血压…）→ 人·我
  const selfSignal = text.includes("我") && has(["跑","健身","锻炼","散步","睡","失眠","累","瘦","胖",
    "体检","身体","生病","情绪","焦虑","开心","难过","压力","心情","状态","早起","熬夜","减肥","习惯",
    "血压","血糖","吃药","头晕","膝盖","腰疼","腰痛","疼","记性","孤独","担心","喘"]);

  // 4) 引用/阅读/想法/灵感/资讯 → 内容（即使句中有“我”，也压过裸“我”）
  const contentSignal = has(["「","」","“","”","\"","『","』","读到","看到一句","摘抄","引用","想起",
    "想法","灵感","感悟","名言","句子","这句","一段话","书","小说","文章","诗","电影","纪录片","播客","觉得",
    "新闻","视频","短视频","刷到","公众号","歌"]);

  let kind, subject = null;
  if (other) { kind = "person"; subject = other; }
  else if (eventSignal) { kind = "event"; }
  else if (selfSignal) { kind = "person"; subject = "我"; }
  else if (contentSignal) { kind = "content"; }
  else { kind = "content"; }   // 默认归内容，而不是“人·我”

  return { kind, subject, topic: detectTopic(text) };
}

function detectTopic(text) {
  const has = words => words.some(word => text.includes(word));
  // 顺序即优先级：健康最先，其后是具体领域，情绪/饮食兜底，避免“吃”“累”等通用词抢标签
  if (has(["疼","痛","病","医院","门诊","发烧","咳嗽","失眠","睡眠","膝盖","头晕","头痛","检查","复查","体检",
    "血压","血糖","血脂","心脏","胆固醇","吃药","服药","降压","降糖","理疗","针灸","康复","住院","手术",
    "化验","报告","挂号","药","过敏","肠胃","关节","视力","听力","牙"])) return "健康";
  if (has(["工资","账单","报销","预算","存款","理财","基金","股票","保险","房贷","车贷","利息","收入","支出","欠款","省钱","养老金","退休金"])) return "财务";
  if (has(["项目","客户","方案","会议","开会","工作","上班","加班","同事","领导","老板","谈判","合同","上线","发布","出差","面试","升职","跳槽","绩效"])) return "工作";
  if (has(["学校","老师","课程","作业","学习","考试","成绩","报名","培训","上课","复习","家长会"])) return "学习";
  if (has(["焦虑","压力","难过","开心","烦","委屈","孤独","生气","害怕","担心","心情","情绪","崩溃","释怀","平静","感动","想念"])) return "情绪心情";
  if (has(["火车","轨道","积木","搭建","拼装","画画","音乐","阅读","看书","下棋","养花","旅行","爬山","跑步","健身","散步","钓鱼","游戏"])) return "兴趣与探索";
  if (has(["吃","糖","饭","菜","水果","零食","早餐","午餐","晚餐","做饭","汤","茶","咖啡"])) return "日常饮食";
  return "日常";
}

function detectUrgentSignal(text) {
  const signals = [
    { terms: ["呼吸困难", "喘不上气"], title: "出现呼吸困难相关描述" },
    { terms: ["胸痛", "胸口痛"], title: "出现胸痛相关描述" },
    { terms: ["昏厥", "晕倒", "意识不清"], title: "出现意识异常相关描述" },
    { terms: ["大量出血", "止不住血"], title: "出现严重出血相关描述" },
    { terms: ["抽搐"], title: "出现抽搐相关描述" },
    { terms: ["高烧不退"], title: "出现持续高烧相关描述" },
    { terms: ["摔倒","跌倒","滑倒","绊倒","摔了一跤"], title: "出现跌倒相关描述" },
    { terms: ["嘴歪","口角歪","脸歪","说话不清","口齿不清","半身无力","半边无力","单侧无力","一侧发麻","手脚发麻","胳膊抬不起来"], title: "出现疑似中风（卒中）相关描述" },
    { terms: ["自杀", "不想活", "伤害自己"], title: "出现自我伤害相关描述", neverNegate: true }
  ];
  for (const signal of signals) {
    const matched = signal.terms.find(term => text.includes(term));
    if (!matched) continue;
    if (!signal.neverNegate && [`没有${matched}`, `无${matched}`, `未出现${matched}`].some(phrase => text.includes(phrase))) continue;
    return {
      term: matched,
      title: signal.title,
      detail: "App 无法判断真实情况。如现在存在现实危险，请立即联系当地急救、可信赖的人或专业人员。"
    };
  }
  return null;
}

function go(view) {
  state.view = view;
  state.selectedId = null;
  sessionStorage.setItem(VIEW_KEY, view);
  render();
  window.scrollTo(0, 0);
}

function openMemory(id) {
  state.selectedId = id;
  state.view = "detail";
  render();
  window.scrollTo(0, 0);
}

function openFacet(type, value) {
  if (!value) return;
  if (state.view !== "facet") state.facetBack = state.view;   // 记住从哪进来的
  state.facet = { type, value };
  state.view = "facet";
  state.selectedId = null;
  render();
  window.scrollTo(0, 0);
}

// 触感反馈（Android 有效；iOS Safari/PWA 不支持 Vibration API，会静默忽略）
function haptic(pattern) { try { navigator.vibrate?.(pattern); } catch {} }

function loadResolvedSignals() {
  try { const a = JSON.parse(localStorage.getItem(RESOLVED_SIGNALS_KEY)); return Array.isArray(a) ? a : []; }
  catch { return []; }
}

// 给信号一个稳定 key（标题 + 相关记忆 id）
function signalKey(signal) {
  const ids = (signal.relatedMemoryIds || []).slice().sort().join(",");
  return `${signal.title}|${ids}`;
}

function resolveSignal(key) {
  if (!state.resolvedSignals.includes(key)) {
    state.resolvedSignals.push(key);
    safeSetItem(RESOLVED_SIGNALS_KEY, JSON.stringify(state.resolvedSignals));
  }
  haptic(15);
  notify("已标记为处理");
  render();
}

function restoreSignal(key) {
  state.resolvedSignals = state.resolvedSignals.filter(k => k !== key);
  safeSetItem(RESOLVED_SIGNALS_KEY, JSON.stringify(state.resolvedSignals));
  render();
}

// 把一条信号记成跟进——在记忆流里生成一条可见的记录
function followUpFromSignal(title) {
  if (!title) return;
  const m = memory(`跟进：${title}`);
  state.memories.unshift(m);
  saveMemories();
  markAnalysisStale();
  syncMemoriesToBridge({ silent: true });
  haptic(15);
  notify("已记为跟进，在记忆流里");
  render();
}

function render() {
  const views = {
    stream: renderStream,
    search: renderSearch,
    lenses: renderLenses,
    facet: renderFacet,
    summary: renderSummary,
    detail: renderDetail
  };
  const viewChanged = state.view !== lastRenderedView;
  lastRenderedView = state.view;
  app.innerHTML = `<main class="app-shell">${(views[state.view] || renderStream)()}</main>${renderModal()}`;
  if (viewChanged) app.querySelector(".screen")?.classList.add("view-enter");  // 仅在切页时做一次进场动画
  bindEvents();
}

function renderStream() {
  const today = state.memories.filter(m => isToday(m.createdAt)).length;
  const groups = groupByDay(state.memories);
  return `<section class="screen">
    <header class="page-pad">
      <p class="eyebrow">记忆流 · MEMORY STREAM</p>
      <div class="date-line"><h1 class="display-title">${chineseDate(new Date())}</h1><span>${weekday(new Date())}</span></div>
      <div class="header-actions">
        <div class="sync-badge"><i class="sync-dot"></i>本地已保存 · 今日 ${today} 条记忆</div>
        <button class="soft-button" data-go="lenses">分类</button>
        <button class="soft-button protect-button ${backupDue() ? "due" : ""}" data-protect aria-label="记忆保护">${icons.shield}</button>
      </div>
    </header>
    <div class="stream page-pad">
      ${groups.length ? groups.map((group, index) => `
        ${index ? `<div class="day-label">${chineseDate(new Date(group.day))} · ${weekday(new Date(group.day))}</div>` : ""}
        <div class="timeline">${group.items.map(renderTimelineCard).join("")}</div>
      `).join("") : renderEmpty("海面还很安静", "轻点下方麦克风，留下第一条记忆。")}
    </div>
    ${renderDock()}
  </section>`;
}

function renderTimelineCard(m) {
  return `<article class="memory-row">
    <i class="timeline-dot" style="background:${kinds[m.kind].color}"></i>
    ${renderMemoryCard(m)}
  </article>`;
}

function renderMemoryCard(m) {
  return `<button class="memory-card" data-memory="${m.id}">
    <div class="card-top"><time class="time">${formatTime(m.createdAt)}</time>${tag(m)}</div>
    <p class="memory-text">${escapeHTML(m.text)}</p>
  </button>`;
}

function renderDock() {
  return `<nav class="dock" aria-label="主要操作">
    <span class="dock-note">轻点麦克风，说点什么</span>
    <div class="dock-actions">
      <button class="circle-button" data-go="search" aria-label="搜索记忆">${icons.search}</button>
      <button class="record-button" data-compose aria-label="记录新记忆">${icons.mic}</button>
      <button class="circle-button" data-go="summary" aria-label="查看总结">${icons.calendar}</button>
    </div>
  </nav>`;
}

function searchResults() {
  const keyword = state.search.trim().toLowerCase();
  return state.memories
    .filter(m => state.scope === "all" || m.kind === state.scope)
    .filter(m => !keyword || [m.text, m.subject, m.topic].filter(Boolean).join(" ").toLowerCase().includes(keyword))
    .sort(byNewest);
}

// 只更新结果区，不整页重渲染：保住输入框焦点、光标和中文输入法的组字状态。
function updateSearchResults() {
  const keyword = state.search.trim().toLowerCase();
  const results = searchResults();
  const label = document.querySelector(".result-label");
  if (label) label.textContent = keyword ? `找到 ${results.length} 条相关记忆` : `最近 ${results.length} 条`;
  const list = document.querySelector(".result-list");
  if (!list) return;
  list.innerHTML = results.length ? results.map(renderMemoryCard).join("") : renderEmpty("没有找到相关记忆", "换个关键词，或切换分类试试。");
  list.querySelectorAll("[data-memory]").forEach(el => el.addEventListener("click", () => openMemory(el.dataset.memory)));
}

function renderSearch() {
  const keyword = state.search.trim().toLowerCase();
  const results = searchResults();
  return `<section class="screen">
    ${topbar("搜索记忆", "stream")}
    <div class="content-pad">
      <label class="search-box">${icons.search}<input id="search-input" type="search" value="${escapeAttr(state.search)}" placeholder="搜索原文、人物或主题" autocomplete="off" /></label>
      <div class="chips">${["all","person","event","content"].map(scope => `<button class="chip ${state.scope === scope ? "active" : ""}" data-scope="${scope}">${scope === "all" ? "全部" : kinds[scope].label}</button>`).join("")}</div>
      <p class="result-label">${keyword ? `找到 ${results.length} 条相关记忆` : `最近 ${results.length} 条`}</p>
      <div class="result-list">${results.length ? results.map(renderMemoryCard).join("") : renderEmpty("没有找到相关记忆", "换个关键词，或切换分类试试。")}</div>
    </div>
  </section>`;
}

function topicTally() {
  return [...state.memories.reduce((map, m) => { const t = m.topic || "日常"; map.set(t, (map.get(t) || 0) + 1); return map; }, new Map())].sort((a, b) => b[1] - a[1]);
}

// 不靠问卷、靠观察：取出现最多的「有信息量」主题（排除兜底的「日常」，且需积累到一定条数）
function dominantTopic() {
  const top = topicTally().find(([t]) => t !== "日常");
  return top && top[1] >= 3 ? { topic: top[0], count: top[1] } : null;
}

function focusLineHTML() {
  const top = dominantTopic();
  return top ? `<p class="focus-line">最近你记得最多的是 <strong>${escapeHTML(top.topic)}</strong> · ${top.count} 条</p>` : "";
}

function renderLenses() {
  const cards = Object.entries(kinds).map(([kind, meta]) => {
    const items = state.memories.filter(m => m.kind === kind);
    const subjects = [...new Set(items.map(m => m.subject).filter(Boolean))];
    const head = subjects.slice(0, 4);
    const body = kind === "person" && subjects.length
      ? `<div class="subject-chips">${subjects.slice(0, 12).map(s => `<button class="chip" data-subject="${escapeAttr(s)}">${escapeHTML(s)}</button>`).join("")}</div>`
      : `<div class="facet-list">${meta.facets.map(x => `<span>${x}</span>`).join("")}</div>`;
    return `<section class="overview-card" style="--accent:${meta.color}">
      <div class="overview-head"><div class="overview-icon">${meta.icon}</div><div class="overview-copy"><strong>${meta.label}</strong><span>${items.length} 条${head.length ? ` · ${head.join("、")}` : "记忆"}</span></div></div>
      ${body}
      ${items.length ? `<button class="lens-all" data-kind="${kind}">查看全部 ${items.length} 条 →</button>` : ""}
    </section>`;
  }).join("");
  const topicCounts = topicTally();
  const topicsBlock = topicCounts.length
    ? `<div class="section-label">主题</div><div class="topic-chips">${topicCounts.map(([t, c]) => `<button class="chip" data-topic="${escapeAttr(t)}">${escapeHTML(t)} ${c}</button>`).join("")}</div>`
    : "";
  const today = state.memories.filter(m => isToday(m.createdAt)).sort(byOldest);
  const preview = `~/记忆/${isoDay(new Date())}.md\n# ${chineseDate(new Date())}\n${today.slice(0,3).map(m => `- ${formatTime(m.createdAt)} [${tagText(m)}] ${m.text.slice(0,10)}${m.text.length > 10 ? "…" : ""}`).join("\n") || "- 今天还没有记录…"}`;
  return `<section class="screen">
    ${topbar("记忆分类", "stream")}
    <div class="content-pad lens-overview">
      <p class="eyebrow">三种归档 · ARCHIVE</p>
      <h1 class="display-title">先分清，再整体理解</h1>
      ${focusLineHTML()}
      ${cards}
      ${topicsBlock}
      <section class="md-card"><div class="md-head"><span class="md-mark">md</span>本地记录 · 离线也在写</div><pre class="md-preview">${escapeHTML(preview)}</pre><p>Markdown 方便阅读；加密备份才能完整恢复全部记忆与分析。</p><div class="md-actions"><button class="action-button" data-protect>加密备份</button><button class="action-button" data-export>导出 Markdown</button></div></section>
    </div>
  </section>`;
}

function renderFacet() {
  const f = state.facet || {};
  const items = state.memories.filter(m =>
    f.type === "subject" ? m.subject === f.value
    : f.type === "topic" ? (m.topic || "日常") === f.value
    : m.kind === f.value
  ).sort(byNewest);
  const title = f.type === "kind" ? (kinds[f.value]?.label || "分类") : f.value;
  const label = f.type === "subject" ? "人物" : f.type === "topic" ? "主题" : "分类";
  const groups = groupByDay(items);
  return `<section class="screen">
    ${topbar(title, state.facetBack || "lenses")}
    <div class="content-pad">
      <p class="eyebrow">${label} · 时间线</p>
      <p class="result-label">共 ${items.length} 条相关记忆</p>
      <div class="stream">${groups.length ? groups.map((g, i) => `${i ? `<div class="day-label">${chineseDate(new Date(g.day))} · ${weekday(new Date(g.day))}</div>` : ""}<div class="timeline">${g.items.map(renderTimelineCard).join("")}</div>`).join("") : renderEmpty("还没有相关记忆", "换一个看看。")}</div>
    </div>
  </section>`;
}

function renderSignals(analysis) {
  const all = analysis.keySignals || [];
  if (!all.length) return "";
  const active = all.filter(s => !state.resolvedSignals.includes(signalKey(s)));
  const resolved = all.filter(s => state.resolvedSignals.includes(signalKey(s)));
  let html = "";
  if (active.length) {
    html += `<div class="section-label">值得留意</div>` + active.map(signal => {
      const key = signalKey(signal);
      const gold = signal.level !== "attention";
      return `<article class="warning-row ${gold ? "gold" : ""}"><span>${gold ? "✦" : "▲"}</span><div style="flex:1">
        <strong>${escapeHTML(signal.title)}</strong><p>${escapeHTML(signal.detail)}</p>
        <div class="signal-actions"><button class="signal-btn" data-resolve-signal="${escapeAttr(key)}">标记已处理</button><button class="signal-btn ghost" data-followup-title="${escapeAttr(signal.title)}">记为跟进</button></div>
      </div></article>`;
    }).join("");
  }
  if (resolved.length) {
    html += `<button class="resolved-toggle" data-show-resolved>已处理 ${resolved.length} 条 ${state.showResolved ? "▲" : "▼"}</button>`;
    if (state.showResolved) {
      html += resolved.map(signal => `<article class="warning-row resolved"><span>✓</span><div style="flex:1"><strong>${escapeHTML(signal.title)}</strong><div class="signal-actions"><button class="signal-btn ghost" data-restore-signal="${escapeAttr(signalKey(signal))}">恢复</button></div></div></article>`).join("");
    }
  }
  return html;
}

function renderSummary() {
  const analysis = state.holisticAnalysis || buildLocalOverview();
  const connected = Boolean(state.codexConfig.token);
  const stale = Boolean(analysis.stale);
  return `<section class="screen dark">
    ${topbar("总结与方向", "stream")}
    <div class="content-pad summary">
      <p class="eyebrow">${analysis.source === "codex" ? "CLAUDE · 整体分析" : "本地归档 · 等待整体分析"}</p><h1 class="display-title">总结 与 方向</h1>
      ${focusLineHTML()}
      <section class="direction-card">
        <div class="direction-label">${analysis.periodLabel || "当前记忆"}${stale ? " · 有新记录待更新" : ""}</div>
        <p class="direction-quote">「${escapeHTML(analysis.overview)}」</p>
        <button class="codex-refresh" data-codex-analyze ${state.memories.length ? "" : "disabled"}>${state.codexBusy ? "分析中…" : connected ? "用 Claude 更新整体分析" : "连接 Claude 进行整体分析"}</button>
      </section>
      ${analysis.people?.length ? `<div class="section-label">人物线</div><div class="people-lines">${analysis.people.map(person => `<article data-subject="${escapeAttr(person.name)}"><div><strong>${escapeHTML(person.name)}</strong><span>${person.count} 条记忆</span></div><p>${escapeHTML(person.summary)}</p></article>`).join("")}</div>` : ""}
      ${renderSignals(analysis)}
      ${analysis.directions?.length ? `<div class="section-label">下一步方向</div><div class="direction-list">${analysis.directions.map(item => `<article><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.why)}</p><div>${escapeHTML(item.nextStep)}</div><span>${escapeHTML(item.horizon || "接下来")}</span></article>`).join("")}</div>` : ""}
      <p class="privacy-note">${analysis.source === "codex" ? `由 Claude 基于 ${analysis.memoryCount || state.memories.length} 条记忆整体生成 · ${formatAnalysisTime(analysis.generatedAt)}` : "单条只归档，不做过度解读"}<br/>${connected ? "已连接电脑：记忆先加密同步到电脑本地；做整体分析时，会把记忆交给电脑上登录的 Claude（云端模型）处理" : "当前未连接 Claude，记忆只在这台设备本地保存与分析"}</p>
    </div>
  </section>`;
}

function renderDetail() {
  const m = state.memories.find(item => item.id === state.selectedId);
  if (!m) { state.view = "stream"; return renderStream(); }
  return `<section class="screen">
    ${topbar("记忆详情", "stream", `<button class="icon-button" data-share aria-label="分享">${icons.more}</button>`)}
    <div class="content-pad">
      <div class="detail-meta">${tag(m)}<span class="detail-date">${formatFullDate(m.createdAt)}</span></div>
      <p class="detail-text">${escapeHTML(m.text)}</p>
      <div class="source-line">${m.source === "voice" ? "🎙" : "✎"} ${m.source === "voice" ? `语音 ${m.seconds || 0} 秒 · 本地转写` : "手动输入 · 本地记录"}</div>
      <div class="classifier">
        <div class="classifier-head"><span>归档</span>${m.userKind ? '<span class="locked-pill">已手动锁定</span>' : ""}</div>
        <div class="chips kind-chips">${["person","event","content"].map(k => `<button class="chip ${m.kind === k ? "active" : ""}" data-setkind="${k}">${kinds[k].label}</button>`).join("")}</div>
        ${m.kind === "person" ? `<input class="subject-input" id="subject-input" type="text" value="${escapeAttr(m.subject || "")}" placeholder="是谁？如 妈妈、儿子、老王" autocomplete="off" />` : ""}
        <p class="classifier-note">${m.userKind ? "你改过的分类会被锁定，整体分析不会覆盖它。" : `当前主题：${escapeHTML(m.topic || "日常")} · 轻点上面可手动改分类`}</p>
      </div>
      <div class="detail-actions"><button class="action-button" data-edit>修改原文</button><button class="action-button" data-share>分享记忆</button><button class="action-button danger" data-delete>删除记忆</button></div>
    </div>
  </section>`;
}

function topbar(title, backView, trailing = "<span></span>") {
  return `<header class="topbar"><button class="icon-button" data-go="${backView}" aria-label="返回">${icons.back}</button><h1>${title}</h1>${trailing}</header>`;
}

function renderModal() {
  if (state.urgentAlert) return renderUrgentAlert();
  if (state.composer) return renderComposer();
  if (state.editor) return renderEditor();
  if (state.installHelp) return renderInstallHelp();
  if (state.deleteConfirm) return renderDeleteConfirm();
  if (state.protectionMode) return renderProtection();
  if (state.codexMode) return renderCodexConnection();
  return "";
}

function renderComposer() {
  return `<div class="modal"><section class="modal-panel composer">
    <div class="composer-head"><button class="text-button" data-close>取消</button><span class="composer-status">${state.recording ? "正在聆听…" : "本地记录"}</span><span>本机</span></div>
    <button class="mic-orb" data-speech aria-label="开始语音输入">${icons.mic}</button>
    <label class="composer-label" for="composer-text">写下此刻</label>
    <textarea id="composer-text" placeholder="直接输入，或轻点上方麦克风开始听写…"></textarea>
    <p class="composer-tip">在 iPhone 上也可以轻点系统键盘的麦克风进行听写。</p>
    <div class="composer-bottom"><p>完成即记录 · 本地自动归类</p><button class="primary-button" data-save-memory disabled>完成记录</button></div>
  </section></div>`;
}

function renderEditor() {
  const m = state.memories.find(item => item.id === state.selectedId);
  return `<div class="modal"><section class="modal-panel editor-panel">
    <div class="composer-head"><button class="text-button" data-close>取消</button><strong>修改记忆</strong><span></span></div>
    <textarea class="editor-area" id="editor-text">${escapeHTML(m?.text || "")}</textarea>
    <p class="result-label">保存后会根据新文字重新归档，整体分析将在总结页更新。</p>
    <div class="editor-actions"><button class="action-button" data-close>取消</button><button class="action-button" data-save-edit>保存修改</button></div>
  </section></div>`;
}

function renderInstallHelp() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  return `<div class="modal" data-overlay><section class="modal-panel install-sheet">
    <button class="icon-button" data-close style="margin-left:auto">✕</button>
    <h2>${standalone ? "已经安装好了" : "安装到 iPhone"}</h2>
    <p>${standalone ? "现在它会像普通 App 一样独立运行，记忆仍只保存在你的手机里。" : "请使用 Safari 打开本页，然后完成下面三步。安装免费，也没有七天期限。"}</p>
    ${standalone ? "" : `<ol class="install-steps"><li>轻点 Safari 底部的“分享”按钮。</li><li>向下滑，选择“添加到主屏幕”。</li><li>轻点右上角“添加”。</li></ol>`}
    <button class="action-button" data-close style="width:100%">知道了</button>
  </section></div>`;
}

function renderDeleteConfirm() {
  return `<div class="modal" data-overlay><section class="modal-panel install-sheet">
    <button class="icon-button" data-close style="margin-left:auto">✕</button>
    <h2>删除这条记忆？</h2>
    <p>删除后无法恢复，对应的本地记录也会一起移除。</p>
    <div class="editor-actions"><button class="action-button" data-close>取消</button><button class="action-button danger" data-confirm-delete>确认删除</button></div>
  </section></div>`;
}

function renderUrgentAlert() {
  return `<div class="modal" data-overlay><section class="modal-panel install-sheet urgent-sheet">
    <div class="urgent-symbol">!</div>
    <h2>${escapeHTML(state.urgentAlert.title)}</h2>
    <p>${escapeHTML(state.urgentAlert.detail)}</p>
    <p class="urgent-boundary">这只是关键词提醒，不是医疗或安全诊断。</p>
    <button class="wide-primary urgent-button" data-close>我知道了</button>
  </section></div>`;
}

function renderCodexConnection() {
  return `<div class="modal" data-overlay><section class="modal-panel install-sheet protection-sheet">
    <button class="icon-button" data-close style="margin-left:auto">✕</button>
    <div class="protection-symbol codex-symbol">C</div>
    <h2>连接电脑上的 Claude</h2>
    <p>在电脑启动“人生海海桥”后，从配对页复制连接码。桥接地址会自动发现，App 不会保存你的 AI 账号密码。</p>
    <label class="field-label">连接码<input id="codex-token" class="secure-field" type="password" autocomplete="off" value="${escapeAttr(state.codexConfig.token || "")}" placeholder="粘贴电脑生成的连接码" /></label>
    <label class="field-label">桥接地址 · 自动发现，通常不用填写<input id="codex-endpoint" class="secure-field" type="url" autocomplete="off" value="${escapeAttr(state.codexConfig.endpoint || "")}" placeholder="留空即可自动发现" /></label>
    <div class="privacy-box teal"><strong>只开放记忆同步与整体分析</strong><span>连接后，记录会同步到你自己的电脑，供每周任务使用；桥接服务不接收自由指令，也不允许它修改其他文件。</span></div>
    <button class="wide-primary" data-save-codex>保存并测试连接</button>
    ${state.codexConfig.token ? `<button class="plain-link danger-text" data-disconnect-codex>断开连接</button>` : ""}
  </section></div>`;
}

function renderProtection() {
  if (state.protectionMode === "create") return renderCreateBackup();
  if (state.protectionMode === "restore") return renderRestoreBackup();
  const lastBackup = localStorage.getItem(LAST_BACKUP_KEY);
  const status = lastBackup
    ? `上次备份：${formatBackupDate(lastBackup)}`
    : state.memories.length ? "还没有创建过备份" : "暂无记忆需要备份";
  return `<div class="modal" data-overlay><section class="modal-panel install-sheet protection-sheet">
    <button class="icon-button" data-close style="margin-left:auto">✕</button>
    <div class="protection-symbol">${icons.shield}</div>
    <h2>记忆保护</h2>
    <p>备份在手机本地完成，记忆不会上传到我们的服务器。</p>
    <div class="backup-status ${backupDue() ? "due" : ""}"><span>${backupDue() ? "!" : "✓"}</span><div><strong>${status}</strong><small>${backupDue() ? "建议现在备份一次" : "建议每周备份一次"}</small></div></div>
    <div class="protection-actions">
      <button class="protection-action primary" data-backup-quick ${state.memories.length ? "" : "disabled"}><span>☁</span><div><strong>一键备份到 iCloud</strong><small>免密码 · 推荐日常使用</small></div></button>
      <button class="protection-action" data-backup-create ${state.memories.length ? "" : "disabled"}><span>🔒</span><div><strong>创建加密备份</strong><small>设密码 · 文件泄露也打不开</small></div></button>
      <label class="protection-action"><span>↑</span><div><strong>恢复备份</strong><small>从 .json 或 .haihai 文件恢复</small></div><input id="restore-file" type="file" hidden /></label>
    </div>
    <button class="plain-link" data-install>如何安装到主屏幕</button>
    <div class="version-line"><span>版本 ${APP_VERSION}</span><button data-check-update>检查更新</button></div>
  </section></div>`;
}

function renderCreateBackup() {
  return `<div class="modal"><section class="modal-panel install-sheet protection-sheet">
    <button class="icon-button" data-protect-home aria-label="返回">${icons.back}</button>
    <h2>创建加密备份</h2>
    <p>设置一个至少 8 位的备份密码。以后恢复时必须使用同一个密码。</p>
    <label class="field-label">备份密码<input id="backup-password" class="secure-field" type="password" minlength="8" autocomplete="new-password" placeholder="至少 8 位" /></label>
    <label class="field-label">再次输入<input id="backup-confirm" class="secure-field" type="password" minlength="8" autocomplete="new-password" placeholder="再次输入密码" /></label>
    <div class="privacy-box"><strong>请记住这个密码</strong><span>为了隐私，App 不保存密码，也无法帮你找回。</span></div>
    <button class="wide-primary" data-create-encrypted>加密并保存</button>
  </section></div>`;
}

function renderRestoreBackup() {
  const kind = state.restoreKind;
  const unknown = kind === "unknown";
  const encrypted = kind === "encrypted";
  const detail = unknown
    ? `<div class="privacy-box"><strong>认不出这个文件</strong><span>请选择人生海海导出的 .json 或 .haihai 备份文件。</span></div>`
    : encrypted
      ? `<label class="field-label">备份密码<input id="restore-password" class="secure-field" type="password" autocomplete="current-password" placeholder="输入创建备份时的密码" /></label>`
      : `<div class="privacy-box"><strong>免密码备份</strong><span>这是 iCloud 快速备份，直接恢复即可。</span></div>`;
  return `<div class="modal"><section class="modal-panel install-sheet protection-sheet">
    <button class="icon-button" data-protect-home aria-label="返回">${icons.back}</button>
    <h2>恢复备份</h2>
    <p class="file-name">已选择：${escapeHTML(state.pendingRestoreFile?.name || "备份文件")}</p>
    ${detail}
    <div class="restore-options">
      <button class="restore-option ${state.restoreStrategy === "merge" ? "active" : ""}" data-restore-strategy="merge"><strong>合并恢复 · 推荐</strong><span>保留当前记忆，只补回缺少的内容</span></button>
      <button class="restore-option danger ${state.restoreStrategy === "replace" ? "active" : ""}" data-restore-strategy="replace"><strong>替换全部</strong><span>用备份内容覆盖这台手机的全部记忆</span></button>
    </div>
    <button class="wide-primary" data-restore-run ${unknown ? "disabled" : ""}>${encrypted ? "解密并恢复" : "恢复"}</button>
  </section></div>`;
}

function bindEvents() {
  document.querySelectorAll("[data-go]").forEach(el => el.addEventListener("click", () => go(el.dataset.go)));
  document.querySelectorAll("[data-memory]").forEach(el => el.addEventListener("click", () => openMemory(el.dataset.memory)));
  document.querySelector("[data-compose]")?.addEventListener("click", () => { state.composer = true; render(); setTimeout(() => document.querySelector("#composer-text")?.focus(), 80); });
  document.querySelector("[data-install]")?.addEventListener("click", () => { state.installHelp = true; render(); });
  document.querySelectorAll("[data-protect]").forEach(el => el.addEventListener("click", () => { state.protectionMode = "home"; render(); }));
  document.querySelector("[data-protect-home]")?.addEventListener("click", () => { state.protectionMode = "home"; state.pendingRestoreFile = null; state.restoreKind = null; render(); });
  document.querySelector("[data-backup-quick]")?.addEventListener("click", createQuickBackup);
  document.querySelector("[data-backup-create]")?.addEventListener("click", () => { state.protectionMode = "create"; render(); setTimeout(() => document.querySelector("#backup-password")?.focus(), 80); });
  document.querySelector("#restore-file")?.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.pendingRestoreFile = file;
    state.restoreStrategy = "merge";
    state.restoreKind = await detectBackupKind(file);
    state.protectionMode = "restore";
    render();
    if (state.restoreKind === "encrypted") setTimeout(() => document.querySelector("#restore-password")?.focus(), 80);
  });
  document.querySelectorAll("[data-restore-strategy]").forEach(el => el.addEventListener("click", () => { state.restoreStrategy = el.dataset.restoreStrategy; render(); }));
  document.querySelector("[data-create-encrypted]")?.addEventListener("click", createEncryptedBackup);
  document.querySelector("[data-restore-run]")?.addEventListener("click", restoreBackup);
  document.querySelector("[data-check-update]")?.addEventListener("click", checkForUpdate);
  document.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", closeModal));
  document.querySelector("[data-overlay]")?.addEventListener("click", e => { if (e.target === e.currentTarget) closeModal(); });

  const search = document.querySelector("#search-input");
  search?.addEventListener("input", e => { state.search = e.target.value; if (e.isComposing) return; updateSearchResults(); });
  search?.addEventListener("compositionend", e => { state.search = e.target.value; updateSearchResults(); });
  document.querySelectorAll("[data-scope]").forEach(el => el.addEventListener("click", () => { state.scope = el.dataset.scope; render(); }));
  document.querySelectorAll("[data-subject]").forEach(el => el.addEventListener("click", () => openFacet("subject", el.dataset.subject)));
  document.querySelectorAll("[data-topic]").forEach(el => el.addEventListener("click", () => openFacet("topic", el.dataset.topic)));
  document.querySelectorAll("[data-kind]").forEach(el => el.addEventListener("click", () => openFacet("kind", el.dataset.kind)));
  document.querySelectorAll("[data-resolve-signal]").forEach(el => el.addEventListener("click", () => resolveSignal(el.dataset.resolveSignal)));
  document.querySelectorAll("[data-restore-signal]").forEach(el => el.addEventListener("click", () => restoreSignal(el.dataset.restoreSignal)));
  document.querySelectorAll("[data-followup-title]").forEach(el => el.addEventListener("click", () => followUpFromSignal(el.dataset.followupTitle)));
  document.querySelector("[data-show-resolved]")?.addEventListener("click", () => { state.showResolved = !state.showResolved; render(); });

  const composer = document.querySelector("#composer-text");
  const saveButton = document.querySelector("[data-save-memory]");
  composer?.addEventListener("input", () => { saveButton.disabled = !composer.value.trim(); });
  saveButton?.addEventListener("click", saveNewMemory);
  document.querySelector("[data-speech]")?.addEventListener("click", startSpeech);

  document.querySelector("[data-edit]")?.addEventListener("click", () => { state.editor = true; render(); });
  document.querySelector("[data-save-edit]")?.addEventListener("click", saveEdit);
  document.querySelectorAll("[data-setkind]").forEach(el => el.addEventListener("click", () => setMemoryKind(el.dataset.setkind)));
  const subjectInput = document.querySelector("#subject-input");
  subjectInput?.addEventListener("change", () => setMemorySubject(subjectInput.value));
  document.querySelectorAll("[data-share]").forEach(el => el.addEventListener("click", shareSelected));
  document.querySelector("[data-delete]")?.addEventListener("click", deleteSelected);
  document.querySelector("[data-confirm-delete]")?.addEventListener("click", confirmDeleteSelected);
  document.querySelector("[data-codex-analyze]")?.addEventListener("click", () => {
    if (!state.codexConfig.token) {
      state.codexMode = "connect";
      render();
    } else {
      refreshHolisticAnalysis();
    }
  });
  document.querySelector("[data-save-codex]")?.addEventListener("click", saveCodexConnection);
  document.querySelector("[data-disconnect-codex]")?.addEventListener("click", disconnectCodex);
  document.querySelector("[data-export]")?.addEventListener("click", exportMarkdown);
}

function closeModal() {
  stopSpeech();
  state.composer = false;
  state.editor = false;
  state.installHelp = false;
  state.deleteConfirm = false;
  state.urgentAlert = null;
  state.protectionMode = null;
  state.codexMode = null;
  state.pendingRestoreFile = null;
  state.restoreKind = null;
  render();
}

function saveNewMemory() {
  const text = document.querySelector("#composer-text")?.value.trim();
  if (!text) return;
  const m = memory(text);
  m.source = state.recording ? "voice" : "text";
  state.memories.unshift(m);
  saveMemories();
  markAnalysisStale();
  syncMemoriesToBridge({ silent: true });
  stopSpeech();
  state.composer = false;
  state.view = "stream";
  state.urgentAlert = m.urgentSignal;
  haptic(m.urgentSignal ? [30, 60, 30] : 12);
  render();
  if (!m.urgentSignal) notify("记忆已保存到本机");
}

function setMemoryKind(kind) {
  const m = state.memories.find(item => item.id === state.selectedId);
  if (!m || !["person", "event", "content"].includes(kind)) return;
  m.kind = kind;
  if (kind !== "person") m.subject = null;
  m.userKind = true;
  m.archiveVersion = ARCHIVE_VERSION;
  saveMemories();
  markAnalysisStale();
  syncMemoriesToBridge({ silent: true });
  render();
}

function setMemorySubject(value) {
  const m = state.memories.find(item => item.id === state.selectedId);
  if (!m) return;
  m.subject = value.trim().slice(0, 40) || null;
  m.kind = "person";
  m.userKind = true;
  m.archiveVersion = ARCHIVE_VERSION;
  saveMemories();
  markAnalysisStale();
  syncMemoriesToBridge({ silent: true });
  render();
}

function saveEdit() {
  const text = document.querySelector("#editor-text")?.value.trim();
  const m = state.memories.find(item => item.id === state.selectedId);
  if (!text || !m) return;
  Object.assign(m, {
    text,
    ...(m.userKind ? { topic: detectTopic(text) } : classifyMemory(text)),
    urgentSignal: detectUrgentSignal(text),
    insight: "",
    insightLabel: "",
    warning: false,
    lenses: [],
    archiveVersion: ARCHIVE_VERSION
  });
  saveMemories();
  markAnalysisStale();
  syncMemoriesToBridge({ silent: true });
  state.editor = false;
  state.urgentAlert = m.urgentSignal;
  render();
  if (!m.urgentSignal) notify("修改已保存");
}

function deleteSelected() {
  const m = state.memories.find(item => item.id === state.selectedId);
  if (!m) return;
  state.deleteConfirm = true;
  render();
}

function confirmDeleteSelected() {
  const m = state.memories.find(item => item.id === state.selectedId);
  if (!m) return;
  state.memories = state.memories.filter(item => item.id !== m.id);
  saveMemories();
  markAnalysisStale();
  syncMemoriesToBridge({ silent: true });
  state.deleteConfirm = false;
  go("stream");
  notify("记忆已删除");
}

async function shareSelected() {
  const m = state.memories.find(item => item.id === state.selectedId);
  if (!m) return;
  const text = `${chineseDate(new Date(m.createdAt))} ${formatTime(m.createdAt)} · ${tagText(m)}${m.topic ? ` · ${m.topic}` : ""}\n\n${m.text}`;
  if (navigator.share) {
    try { await navigator.share({ title:"人生海海 · 一条记忆", text }); } catch {}
  } else {
    await navigator.clipboard?.writeText(text);
    notify("记忆已复制");
  }
}

function startSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    notify("当前浏览器不支持网页听写，请使用 iPhone 键盘麦克风");
    document.querySelector("#composer-text")?.focus();
    return;
  }
  if (state.recording) { stopSpeech(); state.recording = false; render(); return; }
  const recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = true;
  let finalText = document.querySelector("#composer-text")?.value || "";
  recognition.onresult = event => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      else interim += event.results[i][0].transcript;
    }
    const area = document.querySelector("#composer-text");
    if (area) {
      area.value = finalText + interim;
      document.querySelector("[data-save-memory]").disabled = !area.value.trim();
    }
  };
  recognition.onend = () => { state.recording = false; };
  recognition.onerror = () => { state.recording = false; notify("听写未启动，请改用系统键盘麦克风"); };
  state.recognition = recognition;
  state.recording = true;
  recognition.start();
  render();
}

function stopSpeech() {
  try { state.recognition?.stop(); } catch {}
  state.recognition = null;
  state.recording = false;
}

function exportMarkdown() {
  const grouped = groupByDay(state.memories);
  const md = grouped.map(group => `# ${chineseDate(new Date(group.day))}\n\n${group.items.sort(byOldest).map(m => `- ${formatTime(m.createdAt)} [${tagText(m)}${m.topic ? ` / ${m.topic}` : ""}] ${m.text}`).join("\n")}`).join("\n\n---\n\n");
  const blob = new Blob([md], { type:"text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `人生海海-${isoDay(new Date())}.md`; a.click();
  URL.revokeObjectURL(url);
  notify("Markdown 已导出");
}

function backupPayload() {
  return {
    format: "rensheng-haihai-data",
    version: 2,
    exportedAt: new Date().toISOString(),
    memories: state.memories,
    holisticAnalysis: state.holisticAnalysis
  };
}

async function createQuickBackup() {
  if (!state.memories.length) return notify("暂无记忆需要备份");
  const button = document.querySelector("[data-backup-quick]");
  if (button) button.disabled = true;
  try {
    const file = new File(
      [JSON.stringify(backupPayload())],
      `人生海海-备份-${isoDay(new Date())}.json`,
      { type: "application/json" }
    );
    await saveBackupFile(file);
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
    state.protectionMode = "home";
    render();
    notify("快速备份已保存到 iCloud / 文件");
  } catch (error) {
    if (button) button.disabled = false;
    if (error?.name === "AbortError") return;
    console.error(error);
    notify("备份失败，请稍后重试");
  }
}

async function createEncryptedBackup() {
  const password = document.querySelector("#backup-password")?.value || "";
  const confirmPassword = document.querySelector("#backup-confirm")?.value || "";
  if (password.length < 8) return notify("密码至少需要 8 位");
  if (password !== confirmPassword) return notify("两次密码不一致");
  if (!window.crypto?.subtle) return notify("当前浏览器不支持安全加密");

  const button = document.querySelector("[data-create-encrypted]");
  if (button) { button.disabled = true; button.textContent = "正在加密…"; }
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(password, salt, ["encrypt"]);
    const payload = new TextEncoder().encode(JSON.stringify(backupPayload()));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(BACKUP_AAD) },
      key,
      payload
    );
    const envelope = {
      format: BACKUP_FORMAT,
      version: 1,
      createdAt: new Date().toISOString(),
      kdf: { name: "PBKDF2", hash: "SHA-256", iterations: BACKUP_ITERATIONS, salt: bytesToBase64(salt) },
      cipher: { name: "AES-GCM", iv: bytesToBase64(iv) },
      ciphertext: bytesToBase64(new Uint8Array(encrypted))
    };
    const file = new File(
      [JSON.stringify(envelope)],
      `人生海海-加密备份-${isoDay(new Date())}.haihai`,
      { type: "application/json" }
    );
    await saveBackupFile(file);
    const now = new Date().toISOString();
    localStorage.setItem(LAST_BACKUP_KEY, now);
    state.protectionMode = "home";
    render();
    notify("加密备份已创建");
  } catch (error) {
    console.error(error);
    notify("备份失败，请稍后重试");
    if (button) { button.disabled = false; button.textContent = "加密并保存"; }
  }
}

async function detectBackupKind(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data?.format === BACKUP_FORMAT) return "encrypted";
    if (data?.format === "rensheng-haihai-data" && Array.isArray(data?.memories)) return "plain";
  } catch (error) {
    console.error(error);
  }
  return "unknown";
}

function restoreBackup() {
  if (!state.pendingRestoreFile) return notify("请重新选择备份文件");
  return state.restoreKind === "encrypted" ? restoreEncryptedBackup() : restorePlainBackup();
}

function applyRestoredPayload(payload) {
  if (payload?.format !== "rensheng-haihai-data" || ![1, 2].includes(payload?.version) || !Array.isArray(payload.memories)) {
    throw new Error("invalid payload");
  }
  const restored = payload.memories.map(normalizeBackupMemory).filter(Boolean);
  state.memories = state.restoreStrategy === "replace"
    ? restored.sort(byNewest)
    : mergeMemories(state.memories, restored);
  saveMemories();
  if (payload.holisticAnalysis && typeof payload.holisticAnalysis === "object") {
    state.holisticAnalysis = payload.holisticAnalysis;
    persistHolistic();
  } else {
    markAnalysisStale();
  }
  syncMemoriesToBridge({ silent: true });
  state.protectionMode = null;
  state.pendingRestoreFile = null;
  state.restoreKind = null;
  state.view = "stream";
  render();
  notify(`已恢复 ${restored.length} 条记忆`);
}

async function restorePlainBackup() {
  const file = state.pendingRestoreFile;
  if (!file) return notify("请重新选择备份文件");
  const button = document.querySelector("[data-restore-run]");
  if (button) { button.disabled = true; button.textContent = "正在恢复…"; }
  try {
    applyRestoredPayload(JSON.parse(await file.text()));
  } catch (error) {
    console.error(error);
    notify("无法恢复：文件已损坏或格式不正确");
    if (button) { button.disabled = false; button.textContent = "恢复"; }
  }
}

async function restoreEncryptedBackup() {
  const password = document.querySelector("#restore-password")?.value || "";
  const file = state.pendingRestoreFile;
  if (!file) return notify("请重新选择备份文件");
  if (!password) return notify("请输入备份密码");
  if (!window.crypto?.subtle) return notify("当前浏览器不支持安全解密");

  const button = document.querySelector("[data-restore-run]");
  if (button) { button.disabled = true; button.textContent = "正在恢复…"; }
  try {
    const envelope = JSON.parse(await file.text());
    validateBackupEnvelope(envelope);
    const salt = base64ToBytes(envelope.kdf.salt);
    const iv = base64ToBytes(envelope.cipher.iv);
    const key = await deriveBackupKey(password, salt, ["decrypt"], envelope.kdf.iterations);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(BACKUP_AAD) },
      key,
      base64ToBytes(envelope.ciphertext)
    );
    applyRestoredPayload(JSON.parse(new TextDecoder().decode(plain)));
  } catch (error) {
    console.error(error);
    notify("无法恢复：密码错误或文件已损坏");
    if (button) { button.disabled = false; button.textContent = "解密并恢复"; }
  }
}

async function deriveBackupKey(password, salt, usages, iterations = BACKUP_ITERATIONS) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages
  );
}

async function saveBackupFile(file) {
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: "人生海海加密备份", files: [file] });
      return;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function validateBackupEnvelope(envelope) {
  if (
    envelope?.format !== BACKUP_FORMAT ||
    envelope?.version !== 1 ||
    envelope?.kdf?.name !== "PBKDF2" ||
    envelope?.kdf?.hash !== "SHA-256" ||
    !Number.isInteger(envelope?.kdf?.iterations) ||
    envelope.kdf.iterations < 100000 ||
    envelope?.cipher?.name !== "AES-GCM" ||
    typeof envelope?.kdf?.salt !== "string" ||
    typeof envelope?.cipher?.iv !== "string" ||
    typeof envelope?.ciphertext !== "string"
  ) throw new Error("invalid backup");
}

function normalizeBackupMemory(item) {
  if (!item || typeof item.text !== "string" || !item.text.trim()) return null;
  const createdAt = Number.isNaN(Date.parse(item.createdAt)) ? new Date().toISOString() : item.createdAt;
  const archive = classifyMemory(item.text.trim());
  return {
    id: typeof item.id === "string" && item.id ? item.id : (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`),
    text: item.text.trim(),
    createdAt,
    source: item.source === "voice" ? "voice" : "text",
    seconds: Number.isFinite(item.seconds) ? Math.max(0, Math.round(item.seconds)) : 0,
    ...archive,
    urgentSignal: detectUrgentSignal(item.text),
    insight: "",
    insightLabel: "",
    warning: false,
    lenses: [],
    archiveVersion: ARCHIVE_VERSION
  };
}

function mergeMemories(current, restored) {
  const ids = new Set(current.map(item => item.id));
  const signatures = new Set(current.map(item => `${item.createdAt}\n${item.text}`));
  const additions = restored.filter(item => !ids.has(item.id) && !signatures.has(`${item.createdAt}\n${item.text}`));
  return [...current, ...additions].sort(byNewest);
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function backupDue() {
  if (!state.memories.length) return false;
  const last = localStorage.getItem(LAST_BACKUP_KEY);
  return !last || Number.isNaN(Date.parse(last)) || (Date.now() - new Date(last).getTime()) > 7 * 86400000;
}

function formatBackupDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

async function checkForUpdate() {
  if (!("serviceWorker" in navigator)) return notify("当前浏览器不支持离线更新");
  const button = document.querySelector("[data-check-update]");
  if (button) { button.disabled = true; button.textContent = "检查中…"; }
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
    notify("已检查更新；如有新版会自动刷新");
  } catch {
    notify("检查失败，请确认网络连接");
  } finally {
    if (button) { button.disabled = false; button.textContent = "检查更新"; }
  }
}

function buildLocalOverview() {
  const memories = state.memories.slice().sort(byNewest);
  if (!memories.length) {
    return {
      source: "local",
      periodLabel: "还没有记录",
      overview: "先留下真实的日常。单条只归档，积累到一定数量后再寻找连续线索。",
      people: [],
      keySignals: [],
      directions: []
    };
  }

  const peopleMap = new Map();
  memories.filter(item => item.kind === "person" && item.subject).forEach(item => {
    const current = peopleMap.get(item.subject) || [];
    current.push(item);
    peopleMap.set(item.subject, current);
  });
  const people = [...peopleMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, items]) => {
      const topics = countValues(items.map(item => item.topic));
      const topicNames = topics.slice(0, 2).map(([topic]) => topic);
      return {
        name,
        count: items.length,
        summary: topicNames.length
          ? `记录集中在${topicNames.join("、")}。先保留连续变化，不从单条日常下结论。`
          : "目前主要是日常片段，继续积累后再看变化。"
      };
    });

  const topicCounts = countValues(memories.map(item => item.topic));
  const leadingPerson = people[0];
  const leadingTopic = topicCounts[0]?.[0];
  const overview = leadingPerson
    ? `现有 ${memories.length} 条记录主要围绕${leadingPerson.name}${leadingTopic ? `，其中“${leadingTopic}”最集中` : ""}。这些更适合作为连续观察线索，而不是逐条分析。`
    : `现有 ${memories.length} 条记录以${leadingTopic || "日常片段"}为主。先看它们是否形成重复主题，再决定值得关注的方向。`;

  const urgentSignals = memories
    .filter(item => item.urgentSignal)
    .slice(0, 3)
    .map(item => ({
      title: item.urgentSignal.title,
      detail: `${item.urgentSignal.detail}（记录于 ${formatFullDate(item.createdAt)}）`,
      level: "attention",
      relatedMemoryIds: [item.id]
    }));
  const keySignals = [...urgentSignals];

  const repeatedInterest = memories.filter(item => item.topic === "兴趣与探索");
  if (repeatedInterest.length >= 2) {
    const subject = repeatedInterest.find(item => item.subject)?.subject;
    keySignals.push({
      title: `${subject || "近期"}的兴趣出现了连续线索`,
      detail: `已有 ${repeatedInterest.length} 条记录涉及兴趣、搭建或探索，可以继续观察主动选择和持续时间。`,
      level: "positive",
      relatedMemoryIds: repeatedInterest.map(item => item.id)
    });
  }

  const repeatedHealth = memories.filter(item => item.topic === "健康");
  if (repeatedHealth.length >= 2) {
    keySignals.push({
      title: "健康相关描述重复出现",
      detail: `共有 ${repeatedHealth.length} 条记录提到身体或睡眠状况。这里只提示重复，不作诊断。`,
      level: "observe",
      relatedMemoryIds: repeatedHealth.map(item => item.id)
    });
  }

  const directions = [];
  if (repeatedInterest.length >= 2) {
    const subject = repeatedInterest.find(item => item.subject)?.subject || "这个兴趣";
    directions.push({
      title: `继续观察${subject}的兴趣如何发展`,
      why: "已经不是孤立的一次提及，但现有信息还不足以定义成长期偏好。",
      nextStep: "下次只需记下：是否主动选择、持续多久、会不会自己搭建或讲述。",
      horizon: "未来两周"
    });
  }
  if (repeatedHealth.length >= 2) {
    directions.push({
      title: "把重复的健康描述放到同一条时间线上",
      why: "时间、频率和是否持续，比单条文字更有判断价值。",
      nextStep: "记录发生时间、持续多久及是否已经寻求专业帮助；不要让 App 代替诊断。",
      horizon: "持续观察"
    });
  }
  const eventItems = memories.filter(item => item.kind === "event");
  if (eventItems.length >= 2) {
    directions.push({
      title: "把重要事情从记录变成可跟进节点",
      why: "多条事情类记录适合比较进展、决定和未解决问题。",
      nextStep: "后续记录时补一句“下一步是什么、何时再看”。",
      horizon: "本周"
    });
  }
  if (!directions.length) {
    directions.push({
      title: "继续留下自然、具体的片段",
      why: "记录数量还少，过早总结容易把偶然当成规律。",
      nextStep: "保持原话即可；出现重复主题后，再交给电脑上的 Claude 做整体复盘。",
      horizon: "先积累 1—2 周"
    });
  }

  return {
    source: "local",
    periodLabel: formatMemoryPeriod(memories),
    overview,
    people,
    keySignals: keySignals.slice(0, 4),
    directions: directions.slice(0, 3)
  };
}

function countValues(values) {
  const counts = new Map();
  values.filter(Boolean).forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function formatMemoryPeriod(memories) {
  if (!memories.length) return "当前记忆";
  const dates = memories.map(item => new Date(item.createdAt)).filter(date => !Number.isNaN(date.getTime())).sort((a, b) => a - b);
  if (!dates.length) return `共 ${memories.length} 条记忆`;
  const first = dates[0];
  const last = dates[dates.length - 1];
  const sameDay = isoDay(first) === isoDay(last);
  const dateText = date => new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
  return `${sameDay ? dateText(last) : `${dateText(first)}—${dateText(last)}`} · ${memories.length} 条记忆`;
}

function formatAnalysisTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function markAnalysisStale() {
  if (!state.holisticAnalysis) return;
  state.holisticAnalysis = { ...state.holisticAnalysis, stale: true };
  persistHolistic();
}

async function saveCodexConnection() {
  const token = document.querySelector("#codex-token")?.value.trim() || "";
  const manualEndpoint = normalizeEndpoint(document.querySelector("#codex-endpoint")?.value || "");
  if (!token) return notify("请填写连接码");
  const button = document.querySelector("[data-save-codex]");
  if (button) { button.disabled = true; button.textContent = "正在测试…"; }
  const previous = state.codexConfig;
  state.codexConfig = { token, endpoint: manualEndpoint || previous.endpoint || "" };
  try {
    if (!state.codexConfig.endpoint) await discoverBridgeEndpoint();
    await bridgeFetch("/health", { timeout: 10000 });
    safeSetItem(CODEX_CONFIG_KEY, JSON.stringify(state.codexConfig));
    await syncMemoriesToBridge({ silent: false });
    state.codexMode = null;
    render();
    notify("已连接电脑上的 Claude");
    pullLatestAnalysis({ silent: true });
  } catch (error) {
    state.codexConfig = previous;
    console.error(error);
    notify("连接失败，请确认电脑桥已启动");
    if (button) { button.disabled = false; button.textContent = "保存并测试连接"; }
  }
}

function disconnectCodex() {
  state.codexConfig = { token: "", endpoint: "" };
  localStorage.removeItem(CODEX_CONFIG_KEY);
  state.codexMode = null;
  render();
  notify("已断开连接；手机记忆没有删除");
}

async function refreshHolisticAnalysis() {
  if (state.codexBusy || !state.memories.length) return;
  state.codexBusy = true;
  render();
  try {
    await syncMemoriesToBridge({ silent: true });
    const analysis = await bridgeFetch("/analyze", {
      method: "POST",
      body: JSON.stringify({ reason: "manual" }),
      timeout: 180000
    });
    applyHolisticAnalysis(analysis);
    notify("整体分析已更新");
  } catch (error) {
    console.error(error);
    notify("Claude 暂时没有完成分析，请确认电脑在线");
  } finally {
    state.codexBusy = false;
    render();
  }
}

async function syncMemoriesToBridge({ silent = true } = {}) {
  if (!state.codexConfig.token || !state.codexConfig.endpoint) return false;
  try {
    await bridgeFetch("/sync", {
      method: "POST",
      body: JSON.stringify({
        memories: state.memories,
        clientUpdatedAt: new Date().toISOString()
      }),
      timeout: 15000
    });
    if (!silent) notify(`已同步 ${state.memories.length} 条记忆到你的电脑`);
    return true;
  } catch (error) {
    if (!silent) throw error;
    console.warn("记忆同步暂时不可用", error);
    return false;
  }
}

async function pullLatestAnalysis({ silent = true } = {}) {
  if (!state.codexConfig.token || !state.codexConfig.endpoint) return null;
  try {
    const analysis = await bridgeFetch("/analysis", { timeout: 10000 });
    if (analysis?.overview) {
      applyHolisticAnalysis(analysis);
      return analysis;
    }
  } catch (error) {
    if (!silent) throw error;
  }
  return null;
}

function applyHolisticAnalysis(analysis) {
  if (!analysis || typeof analysis.overview !== "string") throw new Error("invalid analysis");
  const classifications = Array.isArray(analysis.classifications) ? analysis.classifications : [];
  if (classifications.length) {
    const byId = new Map(classifications.map(item => [item.id, item]));
    state.memories = state.memories.map(memoryItem => {
      if (memoryItem.userKind) return memoryItem;   // 用户手动锁定的分类不被覆盖
      const next = byId.get(memoryItem.id);
      if (!next || !["person", "event", "content"].includes(next.kind)) return memoryItem;
      return {
        ...memoryItem,
        kind: next.kind,
        subject: typeof next.subject === "string" && next.subject ? next.subject : null,
        topic: typeof next.topic === "string" && next.topic ? next.topic : memoryItem.topic,
        archiveVersion: ARCHIVE_VERSION
      };
    });
    saveMemories();
  }
  state.holisticAnalysis = {
    ...analysis,
    source: "codex",
    stale: false,
    generatedAt: analysis.generatedAt || new Date().toISOString(),
    memoryCount: Number.isFinite(analysis.memoryCount) ? analysis.memoryCount : state.memories.length
  };
  persistHolistic();
}

async function bridgeFetch(path, options = {}) {
  if (!state.codexConfig.endpoint) await discoverBridgeEndpoint();
  let endpoint = normalizeEndpoint(state.codexConfig.endpoint);
  if (!endpoint) throw new Error("missing endpoint");
  try {
    return await performBridgeFetch(endpoint, path, options);
  } catch (firstError) {
    const previousEndpoint = endpoint;
    await discoverBridgeEndpoint();
    endpoint = normalizeEndpoint(state.codexConfig.endpoint);
    if (!endpoint || endpoint === previousEndpoint) throw firstError;
    return performBridgeFetch(endpoint, path, options);
  }
}

async function performBridgeFetch(endpoint, path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 15000);
  try {
    const response = await fetch(`${endpoint}${path}`, {
      method: options.method || "GET",
      headers: {
        "Authorization": `Bearer ${state.codexConfig.token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {})
      },
      body: options.body,
      signal: controller.signal,
      cache: "no-store"
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `bridge ${response.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeEndpoint(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(trimmed) && !/^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(trimmed)) return "";
  return trimmed;
}

async function discoverBridgeEndpoint() {
  try {
    const response = await fetch(`./bridge.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return "";
    const data = await response.json();
    const endpoint = normalizeEndpoint(data?.endpoint || "");
    if (!endpoint) return "";
    if (state.codexConfig.endpoint !== endpoint) {
      state.codexConfig = { ...state.codexConfig, endpoint };
      safeSetItem(CODEX_CONFIG_KEY, JSON.stringify(state.codexConfig));
    }
    return endpoint;
  } catch {
    return "";
  }
}

async function hydrateCodexState() {
  if (!state.codexConfig.token) return;
  await discoverBridgeEndpoint();
  if (!state.codexConfig.endpoint) return;
  await syncMemoriesToBridge({ silent: true });
  const analysis = await pullLatestAnalysis({ silent: true });
  if (analysis && state.view === "summary") render();
}

function groupByDay(memories) {
  const map = new Map();
  memories.slice().sort(byNewest).forEach(m => {
    const day = isoDay(new Date(m.createdAt));
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(m);
  });
  return [...map].map(([day, items]) => ({ day:`${day}T00:00:00`, items:items.sort(byNewest) }));
}

function tag(m) { return `<span class="tag ${m.kind}">${escapeHTML(tagText(m))}</span>`; }
function tagText(m) { return m.kind === "person" && m.subject ? `人 · ${m.subject}` : kinds[m.kind].label; }
function renderEmpty(title, detail) { return `<div class="empty"><span style="font-size:30px">≈</span><strong>${title}</strong><span>${detail}</span></div>`; }
function byNewest(a,b) { return new Date(b.createdAt) - new Date(a.createdAt); }
function byOldest(a,b) { return new Date(a.createdAt) - new Date(b.createdAt); }
function isToday(date) { return isoDay(new Date(date)) === isoDay(new Date()); }
function daysAgo(date) { return Math.floor((Date.now() - new Date(date).getTime()) / 86400000); }
function isoDay(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
function formatTime(date) { return new Intl.DateTimeFormat("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(date)); }
function formatFullDate(date) { return new Intl.DateTimeFormat("zh-CN",{month:"long",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(date)); }
function weekday(date) { return new Intl.DateTimeFormat("zh-CN",{weekday:"short"}).format(date); }
function chineseDate(date) {
  const nums = ["零","一","二","三","四","五","六","七","八","九"];
  const n = value => value < 10 ? nums[value] : value < 20 ? `十${value === 10 ? "" : nums[value-10]}` : `${nums[Math.floor(value/10)]}十${value%10 ? nums[value%10] : ""}`;
  return `${n(date.getMonth()+1)}月${n(date.getDate())}日`;
}
function escapeHTML(value="") { return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]); }
function escapeAttr(value="") { return escapeHTML(value).replace(/`/g, "&#96;"); }
function notify(message) { toast.textContent = message; toast.classList.add("show"); clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove("show"), 1800); }

if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
      await registration.update();
    } catch (error) {
      console.warn("离线服务更新失败", error);
    }
  });
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    } catch {}
  });
}
render();
hydrateFromDurableStore();
hydrateCodexState();
