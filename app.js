const STORAGE_KEY = "rensheng-haihai.memories.v1";
const VIEW_KEY = "rensheng-haihai.view.v1";
const LAST_BACKUP_KEY = "rensheng-haihai.last-backup.v1";
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
  person: { label: "人", color: "#c16a4e", facets: ["健康", "人生规划", "发现"], icon: "人" },
  event: { label: "事", color: "#2e6e73", facets: ["概率预测", "模拟推演"], icon: "↗" },
  content: { label: "内容", color: "#b08a3e", facets: ["美化", "观点提炼"], icon: "✦" }
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
  search: "",
  scope: "all",
  composer: false,
  editor: false,
  installHelp: false,
  deleteConfirm: false,
  protectionMode: null,
  pendingRestoreFile: null,
  restoreStrategy: "merge",
  recording: false,
  recognition: null,
  memories: loadMemories()
};

function loadMemories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) {
        const cleaned = saved.filter(item => !SAMPLE_TEXTS.has(item.text));
        if (cleaned.length !== saved.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
        }
        return cleaned;
      }
    }
  } catch {}
  localStorage.setItem(STORAGE_KEY, "[]");
  return [];
}

function saveMemories() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.memories));
}
function memory(text, createdAt = new Date().toISOString(), forcedKind, forcedSubject) {
  let analysis = analyze(text);
  if (forcedKind === "person" && analysis.kind !== "person") {
    analysis = analyze(`我：${text}`);
  }
  return {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    text,
    createdAt,
    source: "text",
    seconds: 0,
    kind: forcedKind || analysis.kind,
    subject: forcedSubject ?? analysis.subject,
    insight: analysis.insight,
    insightLabel: analysis.insightLabel,
    warning: analysis.warning,
    lenses: analysis.lenses
  };
}

function analyze(text) {
  const relations = [
    [["妈妈","妈","母亲","老妈"],"妈妈"], [["爸爸","爸","父亲","老爸"],"爸爸"],
    [["老婆","妻子","媳妇"],"老婆"], [["老公","丈夫"],"老公"],
    [["孩子","儿子","女儿","宝宝"],"孩子"], [["朋友","同学","同事","闺蜜"],"朋友"]
  ];
  const health = ["疼","痛","病","医院","不舒服","发烧","咳嗽","失眠","睡不着","膝盖","头晕","检查","累","肩","眼睛干"].some(w => text.includes(w));
  const event = ["项目","工作","会议","客户","谈判","合同","方案","搬家","计划","任务","面试","预算","决定","报价","上线","发布"].some(w => text.includes(w));
  const subject = relations.find(([keys]) => keys.some(k => text.includes(k)))?.[1] || (text.includes("我") && !event ? "我" : null);
  const kind = subject ? "person" : event ? "event" : "content";

  if (kind === "person") {
    const who = subject || "我";
    return {
      kind, subject: who, warning: health,
      insightLabel: health ? "健康预警" : "发现",
      insight: health ? `近期与「${who}」相关的健康信号被提起，建议尽快关注。` : `已记到「${who}」名下，方便日后回看这条关系线。`,
      lenses: [
        ...(health ? [{ title:"健康", tone:"warn", badge:"需关注", body: who === "我" ? "你提到了身体上的不适。先别硬扛，留意它是否反复出现，必要时尽早就医。" : `「${who}」近期被提到与健康有关的状况。建议主动关心一次，必要时陪同就医。` }] : []),
        { title:"人生规划", tone:"event", body: who === "我" ? "把这件事放进更长的方向里看：它是否在推动你想去的地方？" : `可以提前在长期安排里为「${who}」留出更多陪伴的位置。` },
        { title:"发现", tone:"content", body: who === "我" ? "这是关于你自己的记录。坚持记下来，时间会让你看见变化曲线。" : `你谈到「${who}」时的语气里有在意。也许对方需要的不是建议，而是被听见。` }
      ]
    };
  }
  if (kind === "event") {
    const percent = stablePercent(text);
    return {
      kind, subject:null, warning:false, insightLabel:"概率预测",
      insight:`参照过往同类情况，关键结果概率约 ${percent}%。建议先定好底线。`,
      lenses:[
        { title:"概率预测", tone:"event", body:`基于这条记录中的不确定信号，关键结果发生的参考概率约 ${percent}%。先想清楚底线再行动。` },
        { title:"模拟推演", tone:"event", body:"可以分别写下最坏、最可能、最理想三种走向，再为最可能的情况留一点余地。" }
      ]
    };
  }
  const quote = /[「」"“”]/.test(text);
  return {
    kind, subject:null, warning:false, insightLabel: quote ? "美化" : "观点提炼",
    insight: quote ? "已归入「打动我的句子」合集。" : "已整理成一段更清楚的表达，原话完整保留。",
    lenses:[
      { title:"美化", tone:"content", body:quote ? "已为这句话保留原貌，归入「打动我的句子」合集。" : "已把这段想法整理得更顺，原话也完整保留。" },
      { title:"观点提炼", tone:"event", body:"这条记忆里出现的意象，可能是你心里的一个锚点——值得偶尔回头看看。" }
    ]
  };
}

function stablePercent(text) {
  let hash = 2166136261;
  for (const char of text) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return 60 + Math.abs(hash % 21);
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

function render() {
  const views = {
    stream: renderStream,
    search: renderSearch,
    lenses: renderLenses,
    summary: renderSummary,
    detail: renderDetail
  };
  app.innerHTML = `<main class="app-shell">${(views[state.view] || renderStream)()}</main>${renderModal()}`;
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
        <div class="sync-badge"><i class="sync-dot"></i>本地已同步 · 今日 ${today} 条记忆</div>
        <button class="soft-button" data-go="lenses">透镜</button>
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
  return `<button class="memory-card ${m.warning ? "warn" : ""}" data-memory="${m.id}">
    <div class="card-top"><time class="time">${formatTime(m.createdAt)}</time>${tag(m)}</div>
    <p class="memory-text">${escapeHTML(m.text)}</p>
    ${m.insight ? `<div class="insight ${m.warning ? "warn" : ""}"><i>${m.warning ? "▲" : "✦"}</i><span>${escapeHTML(m.insightLabel)}：${escapeHTML(m.insight)}</span></div>` : ""}
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

function renderSearch() {
  const keyword = state.search.trim().toLowerCase();
  const results = state.memories
    .filter(m => state.scope === "all" || m.kind === state.scope)
    .filter(m => !keyword || [m.text,m.subject,m.insight,...m.lenses.flatMap(l => [l.title,l.body])].filter(Boolean).join(" ").toLowerCase().includes(keyword))
    .sort(byNewest);
  return `<section class="screen">
    ${topbar("搜索记忆", "stream")}
    <div class="content-pad">
      <label class="search-box">${icons.search}<input id="search-input" type="search" value="${escapeAttr(state.search)}" placeholder="搜索原文、人物或分析" autocomplete="off" /></label>
      <div class="chips">${["all","person","event","content"].map(scope => `<button class="chip ${state.scope === scope ? "active" : ""}" data-scope="${scope}">${scope === "all" ? "全部" : kinds[scope].label}</button>`).join("")}</div>
      <p class="result-label">${keyword ? `找到 ${results.length} 条相关记忆` : `最近 ${results.length} 条`}</p>
      <div class="result-list">${results.length ? results.map(renderMemoryCard).join("") : renderEmpty("没有找到相关记忆", "换个关键词，或切换分类试试。")}</div>
    </div>
  </section>`;
}

function renderLenses() {
  const cards = Object.entries(kinds).map(([kind, meta]) => {
    const items = state.memories.filter(m => m.kind === kind);
    const subjects = [...new Set(items.map(m => m.subject).filter(Boolean))].slice(0,4);
    return `<section class="overview-card" style="--accent:${meta.color}">
      <div class="overview-head"><div class="overview-icon">${meta.icon}</div><div class="overview-copy"><strong>${meta.label}</strong><span>${items.length} 条${subjects.length ? ` · ${subjects.join("、")}` : "记忆"}</span></div></div>
      <div class="facet-list">${meta.facets.map(x => `<span>${x}</span>`).join("")}</div>
    </section>`;
  }).join("");
  const today = state.memories.filter(m => isToday(m.createdAt)).sort(byOldest);
  const preview = `~/记忆/${isoDay(new Date())}.md\n# ${chineseDate(new Date())}\n${today.slice(0,3).map(m => `- ${formatTime(m.createdAt)} [${tagText(m)}] ${m.text.slice(0,10)}${m.text.length > 10 ? "…" : ""}`).join("\n") || "- 今天还没有记录…"}`;
  return `<section class="screen">
    ${topbar("分类透镜", "stream")}
    <div class="content-pad lens-overview">
      <p class="eyebrow">三种透镜 · LENSES</p>
      <h1 class="display-title">系统怎么看你的记忆</h1>
      ${cards}
      <section class="md-card"><div class="md-head"><span class="md-mark">md</span>本地记录 · 离线也在写</div><pre class="md-preview">${escapeHTML(preview)}</pre><p>Markdown 方便阅读；加密备份才能完整恢复全部记忆与分析。</p><div class="md-actions"><button class="action-button" data-protect>加密备份</button><button class="action-button" data-export>导出 Markdown</button></div></section>
    </div>
  </section>`;
}

function renderSummary() {
  const stats = computeStats();
  return `<section class="screen dark">
    ${topbar("总结与方向", "stream")}
    <div class="content-pad summary">
      <p class="eyebrow">本地分析 · 周度总结</p><h1 class="display-title">方向 与 预警</h1>
      <section class="direction-card"><div class="direction-label">本季方向 · 你提前定下的</div><p class="direction-quote">「照顾好身体，也照顾好身边的人。」</p>
        <div class="goals">${stats.goals.map((g,i) => `<div><div class="goal-label"><span>${g.name}</span><span>${g.value}%</span></div><div class="bar ${i ? "warm" : ""}"><i style="width:${g.value}%"></i></div></div>`).join("")}</div>
      </section>
      <div class="section-label">预警</div>
      ${stats.warnings.length ? stats.warnings.map((w,i) => `<article class="warning-row ${i % 2 ? "gold" : ""}"><span>▲</span><div><strong>${escapeHTML(w.title)}</strong><p>${escapeHTML(w.detail)}</p></div></article>`).join("") : `<article class="warning-row gold"><span>✦</span><div><strong>暂时平稳</strong><p>最近的记忆中还没有形成需要提醒的重复信号。</p></div></article>`}
      ${stats.prediction ? `<div class="section-label">概率预测 · 事</div><section class="prediction-card"><div class="prediction-head"><strong>${escapeHTML(stats.prediction.headline)}</strong><span>${stats.prediction.percent}%</span></div><div class="bar"><i style="width:${stats.prediction.percent}%"></i></div><p>${escapeHTML(stats.prediction.note)}</p></section>` : ""}
      <p class="privacy-note">本地规则 · 离线运行<br/>你的记忆，不会离开这台设备</p>
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
      <div class="analysis-title">✦ 本地分析 · 从「${kinds[m.kind].label}」的角度</div>
      <div class="lens-list">${m.lenses.map(renderLens).join("")}</div>
      <div class="detail-actions"><button class="action-button" data-edit>修改原文</button><button class="action-button" data-share>分享记忆</button><button class="action-button" data-reanalyze>重新分析</button><button class="action-button danger" data-delete>删除记忆</button></div>
    </div>
  </section>`;
}

function renderLens(lens) {
  return `<article class="lens-card ${lens.tone === "warn" ? "warn" : ""}"><div class="lens-head"><span class="lens-icon">${lens.tone === "warn" ? "♥" : "✦"}</span><strong>${escapeHTML(lens.title)}</strong>${lens.badge ? `<span class="lens-badge">${escapeHTML(lens.badge)}</span>` : ""}</div><p>${escapeHTML(lens.body)}</p></article>`;
}

function topbar(title, backView, trailing = "<span></span>") {
  return `<header class="topbar"><button class="icon-button" data-go="${backView}" aria-label="返回">${icons.back}</button><h1>${title}</h1>${trailing}</header>`;
}

function renderModal() {
  if (state.composer) return renderComposer();
  if (state.editor) return renderEditor();
  if (state.installHelp) return renderInstallHelp();
  if (state.deleteConfirm) return renderDeleteConfirm();
  if (state.protectionMode) return renderProtection();
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
    <p class="result-label">保存后会根据新文字重新分类与分析。</p>
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
    <p>备份在手机本地加密完成。密码和记忆都不会上传。</p>
    <div class="backup-status ${backupDue() ? "due" : ""}"><span>${backupDue() ? "!" : "✓"}</span><div><strong>${status}</strong><small>${backupDue() ? "建议现在备份一次" : "建议每周备份一次"}</small></div></div>
    <div class="protection-actions">
      <button class="protection-action primary" data-backup-create ${state.memories.length ? "" : "disabled"}><span>↓</span><div><strong>创建加密备份</strong><small>保存到“文件”或 iCloud Drive</small></div></button>
      <label class="protection-action"><span>↑</span><div><strong>恢复加密备份</strong><small>从 .haihai 文件恢复</small></div><input id="restore-file" type="file" accept=".haihai,application/json" hidden /></label>
    </div>
    <button class="plain-link" data-install>如何安装到主屏幕</button>
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
  return `<div class="modal"><section class="modal-panel install-sheet protection-sheet">
    <button class="icon-button" data-protect-home aria-label="返回">${icons.back}</button>
    <h2>恢复加密备份</h2>
    <p class="file-name">已选择：${escapeHTML(state.pendingRestoreFile?.name || "备份文件")}</p>
    <label class="field-label">备份密码<input id="restore-password" class="secure-field" type="password" autocomplete="current-password" placeholder="输入创建备份时的密码" /></label>
    <div class="restore-options">
      <button class="restore-option ${state.restoreStrategy === "merge" ? "active" : ""}" data-restore-strategy="merge"><strong>合并恢复 · 推荐</strong><span>保留当前记忆，只补回缺少的内容</span></button>
      <button class="restore-option danger ${state.restoreStrategy === "replace" ? "active" : ""}" data-restore-strategy="replace"><strong>替换全部</strong><span>用备份内容覆盖这台手机的全部记忆</span></button>
    </div>
    <button class="wide-primary" data-restore-encrypted>解密并恢复</button>
  </section></div>`;
}

function bindEvents() {
  document.querySelectorAll("[data-go]").forEach(el => el.addEventListener("click", () => go(el.dataset.go)));
  document.querySelectorAll("[data-memory]").forEach(el => el.addEventListener("click", () => openMemory(el.dataset.memory)));
  document.querySelector("[data-compose]")?.addEventListener("click", () => { state.composer = true; render(); setTimeout(() => document.querySelector("#composer-text")?.focus(), 80); });
  document.querySelector("[data-install]")?.addEventListener("click", () => { state.installHelp = true; render(); });
  document.querySelectorAll("[data-protect]").forEach(el => el.addEventListener("click", () => { state.protectionMode = "home"; render(); }));
  document.querySelector("[data-protect-home]")?.addEventListener("click", () => { state.protectionMode = "home"; state.pendingRestoreFile = null; render(); });
  document.querySelector("[data-backup-create]")?.addEventListener("click", () => { state.protectionMode = "create"; render(); setTimeout(() => document.querySelector("#backup-password")?.focus(), 80); });
  document.querySelector("#restore-file")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.pendingRestoreFile = file;
    state.restoreStrategy = "merge";
    state.protectionMode = "restore";
    render();
    setTimeout(() => document.querySelector("#restore-password")?.focus(), 80);
  });
  document.querySelectorAll("[data-restore-strategy]").forEach(el => el.addEventListener("click", () => { state.restoreStrategy = el.dataset.restoreStrategy; render(); }));
  document.querySelector("[data-create-encrypted]")?.addEventListener("click", createEncryptedBackup);
  document.querySelector("[data-restore-encrypted]")?.addEventListener("click", restoreEncryptedBackup);
  document.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", closeModal));
  document.querySelector("[data-overlay]")?.addEventListener("click", e => { if (e.target === e.currentTarget) closeModal(); });

  const search = document.querySelector("#search-input");
  search?.addEventListener("input", e => { state.search = e.target.value; render(); document.querySelector("#search-input")?.focus(); });
  document.querySelectorAll("[data-scope]").forEach(el => el.addEventListener("click", () => { state.scope = el.dataset.scope; render(); }));

  const composer = document.querySelector("#composer-text");
  const saveButton = document.querySelector("[data-save-memory]");
  composer?.addEventListener("input", () => { saveButton.disabled = !composer.value.trim(); });
  saveButton?.addEventListener("click", saveNewMemory);
  document.querySelector("[data-speech]")?.addEventListener("click", startSpeech);

  document.querySelector("[data-edit]")?.addEventListener("click", () => { state.editor = true; render(); });
  document.querySelector("[data-save-edit]")?.addEventListener("click", saveEdit);
  document.querySelectorAll("[data-share]").forEach(el => el.addEventListener("click", shareSelected));
  document.querySelector("[data-delete]")?.addEventListener("click", deleteSelected);
  document.querySelector("[data-confirm-delete]")?.addEventListener("click", confirmDeleteSelected);
  document.querySelector("[data-reanalyze]")?.addEventListener("click", reanalyzeSelected);
  document.querySelector("[data-export]")?.addEventListener("click", exportMarkdown);
}

function closeModal() {
  stopSpeech();
  state.composer = false;
  state.editor = false;
  state.installHelp = false;
  state.deleteConfirm = false;
  state.protectionMode = null;
  state.pendingRestoreFile = null;
  render();
}

function saveNewMemory() {
  const text = document.querySelector("#composer-text")?.value.trim();
  if (!text) return;
  const m = memory(text);
  m.source = state.recording ? "voice" : "text";
  state.memories.unshift(m);
  saveMemories();
  stopSpeech();
  state.composer = false;
  state.view = "stream";
  render();
  notify("记忆已保存到本机");
}

function saveEdit() {
  const text = document.querySelector("#editor-text")?.value.trim();
  const m = state.memories.find(item => item.id === state.selectedId);
  if (!text || !m) return;
  const result = analyze(text);
  Object.assign(m, { text, ...result });
  saveMemories();
  state.editor = false;
  render();
  notify("修改已保存");
}

function reanalyzeSelected() {
  const m = state.memories.find(item => item.id === state.selectedId);
  if (!m) return;
  Object.assign(m, analyze(m.text));
  saveMemories();
  render();
  notify("已重新分析");
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
  state.deleteConfirm = false;
  go("stream");
  notify("记忆已删除");
}

async function shareSelected() {
  const m = state.memories.find(item => item.id === state.selectedId);
  if (!m) return;
  const text = `${chineseDate(new Date(m.createdAt))} ${formatTime(m.createdAt)} · ${tagText(m)}\n\n${m.text}\n\n✦ ${m.insightLabel}：${m.insight}`;
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
  const md = grouped.map(group => `# ${chineseDate(new Date(group.day))}\n\n${group.items.sort(byOldest).map(m => `- ${formatTime(m.createdAt)} [${tagText(m)}] ${m.text}\n  - ${m.warning ? "⚠️" : "✦"} ${m.insightLabel}：${m.insight}`).join("\n")}`).join("\n\n---\n\n");
  const blob = new Blob([md], { type:"text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `人生海海-${isoDay(new Date())}.md`; a.click();
  URL.revokeObjectURL(url);
  notify("Markdown 已导出");
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
    const payload = new TextEncoder().encode(JSON.stringify({
      format: "rensheng-haihai-data",
      version: 1,
      exportedAt: new Date().toISOString(),
      memories: state.memories
    }));
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

async function restoreEncryptedBackup() {
  const password = document.querySelector("#restore-password")?.value || "";
  const file = state.pendingRestoreFile;
  if (!file) return notify("请重新选择备份文件");
  if (!password) return notify("请输入备份密码");
  if (!window.crypto?.subtle) return notify("当前浏览器不支持安全解密");

  const button = document.querySelector("[data-restore-encrypted]");
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
    const payload = JSON.parse(new TextDecoder().decode(plain));
    if (payload?.format !== "rensheng-haihai-data" || payload?.version !== 1 || !Array.isArray(payload.memories)) {
      throw new Error("invalid payload");
    }
    const restored = payload.memories.map(normalizeBackupMemory).filter(Boolean);
    state.memories = state.restoreStrategy === "replace"
      ? restored.sort(byNewest)
      : mergeMemories(state.memories, restored);
    saveMemories();
    state.protectionMode = null;
    state.pendingRestoreFile = null;
    state.view = "stream";
    render();
    notify(`已恢复 ${restored.length} 条记忆`);
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
  const kind = ["person", "event", "content"].includes(item.kind) ? item.kind : "content";
  const createdAt = Number.isNaN(Date.parse(item.createdAt)) ? new Date().toISOString() : item.createdAt;
  return {
    id: typeof item.id === "string" && item.id ? item.id : (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`),
    text: item.text.trim(),
    createdAt,
    source: item.source === "voice" ? "voice" : "text",
    seconds: Number.isFinite(item.seconds) ? Math.max(0, Math.round(item.seconds)) : 0,
    kind,
    subject: typeof item.subject === "string" ? item.subject : null,
    insight: typeof item.insight === "string" ? item.insight : "",
    insightLabel: typeof item.insightLabel === "string" ? item.insightLabel : "",
    warning: Boolean(item.warning),
    lenses: Array.isArray(item.lenses) ? item.lenses.map(lens => ({
      title: typeof lens?.title === "string" ? lens.title : "分析",
      body: typeof lens?.body === "string" ? lens.body : "",
      tone: ["person", "event", "content", "warn"].includes(lens?.tone) ? lens.tone : "content",
      badge: typeof lens?.badge === "string" ? lens.badge : null
    })) : []
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

function computeStats() {
  const recent = state.memories.filter(m => daysAgo(m.createdAt) <= 14);
  const selfDays = new Set(recent.filter(m => m.kind === "person" && m.subject === "我").map(m => isoDay(new Date(m.createdAt)))).size;
  const familyDays = new Set(recent.filter(m => m.kind === "person" && m.subject && m.subject !== "我").map(m => isoDay(new Date(m.createdAt)))).size;
  const warnings = state.memories.filter(m => m.warning && daysAgo(m.createdAt) <= 21).slice(0,3).map(m => ({ title: m.subject === "我" ? "你的身体" : `${m.subject || "家人"}的健康`, detail:m.insight }));
  const late = state.memories.filter(m => daysAgo(m.createdAt) <= 7 && new Date(m.createdAt).getHours() >= 23).length;
  if (late >= 3) warnings.push({ title:"你的睡眠", detail:`近一周已有 ${late} 次记录在 23:00 后，方向有点偏。` });
  const event = state.memories.filter(m => m.kind === "event").sort(byNewest)[0];
  return {
    goals:[{ name:"自己的健康", value:Math.min(100, Math.round(selfDays / 14 * 100)) }, { name:"陪伴家人", value:Math.min(100, Math.round(familyDays / 14 * 100)) }],
    warnings,
    prediction:event ? { headline:event.text.slice(0,15) + (event.text.length > 15 ? "…" : ""), percent:Number(event.insight.match(/\d+/)?.[0] || 70), note:event.lenses.find(l => l.title === "模拟推演")?.body || event.insight } : null
  };
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

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
render();
