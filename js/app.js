// ============================================================
// app.js — 页面渲染与交互
// 模块：首页 / 食谱 / 饮食档案 / 健康记录 / 就诊卡 / 设置(回收站+备份)
// ============================================================

let currentTab = "home";
let currentTier = DB.profile.dietTier || "4-5";

// ---------- 通用 ----------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function toast(msg, ok = true) {
  const t = document.createElement("div");
  t.className = "toast" + (ok ? "" : " toast-err");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

function confirmModal(text, onOk) {
  if (window.confirm(text)) onOk();
}

const TYPE_META = {
  like: { label: "喜欢", cls: "tag-like", icon: "❤️" },
  dislike: { label: "不喜欢", cls: "tag-dislike", icon: "✗" },
  avoid: { label: "忌口", cls: "tag-avoid", icon: "🚫" },
};

function getAvoidNames() {
  return DB.diet.filter((d) => d.type === "avoid").map((d) => d.name.trim());
}

// 检查食物/食谱是否命中忌口（双向子串匹配）
function hitsAvoid(text) {
  const lower = String(text).toLowerCase();
  return getAvoidNames().some((n) => n && (lower.includes(n.toLowerCase()) || n.toLowerCase().includes(lower)));
}

// ---------- 路由 ----------
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tabbar button").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  document.querySelectorAll(".page").forEach((p) =>
    p.classList.toggle("active", p.id === "page-" + tab)
  );
  window.scrollTo(0, 0);
  render(tab);
}

function render(tab) {
  ({ home: renderHome, recipe: renderRecipe, diet: renderDiet, health: renderHealth, card: renderCard, opinions: renderOpinions, edu: renderEdu, sport: renderSport, settings: renderSettings })[tab]?.();
}

// ============================================================
// 首页
// ============================================================
function renderHome() {
  const el = document.getElementById("page-home");
  const tier = DIET_GUIDE.tiers.find((t) => t.key === (DB.profile.dietTier || "4-5"));
  const season = currentSeason();
  const seasonal = SEASONAL[season];

  const pendingTrials = DB.trials.filter((t) => t.outcome !== "ok" && Date.now() - new Date(t.createdAt) < 7 * 86400000);
  const recentHealth = DB.health.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
  const avoidCount = DB.diet.filter((d) => d.type === "avoid").length;

  el.innerHTML = `
    <div class="hero card">
      <div class="hero-title">${esc(DB.profile.name || "宝宝")}的健康小助手</div>
      <div class="hero-sub">${esc(childAgeLabel(DB.profile.birth))} · ${esc(seasonal.label)} · ${new Date().getMonth() + 1}月${new Date().getDate()}日</div>
    </div>

    <div class="card">
      <div class="card-head">今日该吃什么 <span class="muted">(${esc(tier.label)}档)</span></div>
      <div class="portion-grid">
        ${tier.rows.map(([k, v]) => `<div class="portion-item"><div class="pk">${esc(k)}</div><div class="pv">${esc(v)}</div></div>`).join("")}
      </div>
      <div class="hint">${esc(DIET_GUIDE.meals)}</div>
    </div>

    ${pendingTrials.length ? `
    <div class="card warn-card">
      <div class="card-head">⚠️ 有需要关注的试验记录</div>
      ${pendingTrials.map((t) => `<div class="mini-row" onclick="openTrialDetail('${t.id}')"><b>${esc(t.name)}</b> · ${esc(t.symptom || "有反应")}（${fmtDate(t.date)}）</div>`).join("")}
    </div>` : ""}

    <div class="grid2">
      <div class="card stat" onclick="switchTab('diet')">
        <div class="stat-num">${DB.diet.length}</div><div class="stat-label">饮食记录</div>
        <div class="stat-extra">忌口 ${avoidCount} 项</div>
      </div>
      <div class="card stat" onclick="switchTab('health')">
        <div class="stat-num">${DB.health.length}</div><div class="stat-label">健康记录</div>
        <div class="stat-extra">${recentHealth.length ? "最近：" + esc(recentHealth[0].symptom || "无") : "暂无记录"}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">${esc(seasonal.label)}应季食材</div>
      <div class="chips">${seasonal.foods.map((f) => `<span class="chip">${esc(f)}</span>`).join("")}</div>
    </div>

    ${freeNoteCard("fn-home")}

    ${DB.notes.length ? `
    <div class="card">
      <div class="card-head">📝 备忘便签（待归档 ${DB.notes.length}）</div>
      ${DB.notes.slice().reverse().map((n) => `
        <div class="list-item">
          <div class="li-sub">${esc(n.text)}</div>
          <div class="li-sub muted">${fmtDate(n.date)}</div>
          <div class="li-actions">
            <button class="btn-mini" onclick="noteToOpinion('${n.id}')">转为观点</button>
            <button class="btn-mini" onclick='deleteRecord("notes","${n.id}")'>删除</button>
          </div>
        </div>`).join("")}
      <div class="hint">没识别出类别的补充内容会先存到这里，不会丢失；想清楚了随时归档。</div>
    </div>` : ""}

    <div class="card quick-links">
      <button class="btn btn-primary" onclick="switchTab('recipe')">看今日食谱推荐</button>
      <button class="btn" onclick="switchTab('sport')">今日运动与陪玩方案</button>
      <button class="btn" onclick="switchTab('card')">打开就诊卡</button>
    </div>
  `;
}

// ============================================================
// 食谱页
// ============================================================
function renderRecipe() {
  const el = document.getElementById("page-recipe");
  const season = currentSeason();
  const seasonal = SEASONAL[season];
  const tier = DIET_GUIDE.tiers.find((t) => t.key === (DB.profile.dietTier || "4-5"));
  const avoid = getAvoidNames();

  const allR = allRecipes();
  const safeRecipes = allR.filter((r) => !hitsAvoid(r.ing.join(" ")));
  const blocked = allR.filter((r) => hitsAvoid(r.ing.join(" ")));
  const top10 = TOP10_FOODS.filter((f) => !hitsAvoid(f.name));

  el.innerHTML = `
    ${avoid.length ? `<div class="card filter-card">🚫 已自动排除忌口：${avoid.map(esc).join("、")}（${blocked.length}道食谱被过滤）</div>` : ""}

    ${renderRecipeEditForm()}

    <div class="card">
      <div class="card-head">⚠️ 食材安全避坑（新手必读）</div>
      <div class="hint">这些都是家常食材里真实存在的坑，做之前花30秒看一眼。</div>
      ${PITFALLS.map((p) => `
        <div class="food-item">
          <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')">
            <span>${esc(p.t)}</span><span class="arrow">▾</span>
          </div>
          <div class="food-body">
            <p class="risky-box"><b>为什么危险：</b>${esc(p.d)}</p>
            <p><b>✅ 怎么做：</b>${esc(p.do)}</p>
          </div>
        </div>`).join("")}
    </div>

    ${renderTasteReco()}

    <div class="card">
      <div class="card-head">每日分量参考 <button class="btn-mini" onclick="toggleTier()">${esc(tier.label)} ⇄</button></div>
      <div class="portion-grid">
        ${tier.rows.map(([k, v]) => `<div class="portion-item"><div class="pk">${esc(k)}</div><div class="pv">${esc(v)}</div></div>`).join("")}
      </div>
      <div class="hint">来源：${esc(DIET_GUIDE.source)}</div>
      <div class="hint">${esc(DIET_GUIDE.note)}</div>
    </div>

    <div class="card">
      <div class="card-head">${esc(seasonal.label)} · 优先安排这些</div>
      <div class="chips">${seasonal.foods.map((f) => `<span class="chip">${esc(f)}</span>`).join("")}</div>
    </div>

    <div class="card">
      <div class="card-head">TOP10 推荐食材（点击展开）</div>
      ${top10.map((f, i) => `
        <div class="food-item">
          <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')">
            <span>${esc(f.icon)} ${esc(f.name)}</span><span class="arrow">▾</span>
          </div>
          <div class="food-body">
            <p><b>为什么推荐：</b>${esc(f.why)}</p>
            <p><b>怎么挑：</b>${esc(f.pick)}</p>
            <p><b>营养要点：</b>${esc(f.nutrition)}</p>
            <p><b>极简做法：</b>${esc(f.simple)}</p>
            <p><b>换花样：</b>${esc(f.variations.join(" / "))}</p>
          </div>
        </div>`).join("")}
    </div>

    <div class="card">
      <div class="card-head">一锅出食谱（大人孩子一起做） <button class="btn-mini" onclick="editRecipe('')">✏️ 新建食谱</button></div>
      <div class="hint">含肉的菜都写清了「怎么选、怎么处理」，跟着做就能嫩而不腥。每道菜右上角都有 ✏️，可以改成你家自己的做法。</div>
      ${safeRecipes.map((r) => `
        <div class="food-item ${r.season === season ? "in-season" : ""}">
          <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')">
            <span>${esc(r.name)} ${r.season === season ? '<span class="tag tag-season">当季</span>' : ""}${DB.recipeEdits && DB.recipeEdits[r.name] ? '<span class="tag tag-observe">已修改</span>' : ""}${r.id ? '<span class="tag tag-like">自建</span>' : ""}${likedTags(r)}</span>
            <span style="display:flex;align-items:center;gap:6px">
              <button class="btn-mini" onclick="event.stopPropagation();editRecipe('${r.name}')">✏️</button>
              <span class="arrow">▾</span>
            </span>
          </div>
          <div class="food-body">
            <p><b>食材：</b>${r.ing.map(esc).join("、")}</p>
            <p><b>用时：</b>${esc(r.time)}</p>
            ${r.select ? `<p><b>🛒 怎么选：</b>${esc(r.select)}</p>` : ""}
            ${r.prep ? `<p><b>🔪 怎么处理：</b>${esc(r.prep)}</p>` : ""}
            <ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
            <p class="tip-child">👶 孩子份：${esc(r.childTip)}</p>
            <p class="tip-adult">🧑 大人份：${esc(r.adultTip)}</p>
            <div class="li-actions">
              <button class="btn-mini" onclick="event.stopPropagation();editRecipe('${r.name}')">✏️ 编辑这道菜</button>
              ${r.id
                ? `<button class="btn-mini" onclick="event.stopPropagation();deleteCustomRecipe('${r.name}')">🗑 删除</button>`
                : (DB.recipeEdits && DB.recipeEdits[r.name] ? `<button class="btn-mini" onclick="event.stopPropagation();resetRecipe('${r.name}')">↺ 恢复默认</button>` : "")}
            </div>
          </div>
        </div>`).join("") || "<div class='hint'>当前忌口过滤后暂无食谱，可在设置里调整忌口记录。</div>"}
    </div>

    <div class="card">
      <div class="card-head">🍳 新手厨房课（选肉 · 去腥 · 嫩肉 · 刀工）</div>
      <div class="hint">孩子不吃肉，十有八九是「腥」或「柴」。按下面四步做，猪肉牛肉就能做到软嫩入味没腥味。每道含肉的食谱里也都写好了对应细节。</div>
      ${KITCHEN_BASICS.map((k) => `
        <div class="food-item">
          <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')">
            <span>${esc(k.t)}</span><span class="arrow">▾</span>
          </div>
          <div class="food-body">
            ${k.points.map((pt) => `<div class="mini-row">· ${esc(pt)}</div>`).join("")}
          </div>
        </div>`).join("")}
    </div>

    <div class="card">
      <div class="card-head">喂养要点</div>
      ${DIET_GUIDE.tips.map((t) => `<div class="mini-row">· ${esc(t)}</div>`).join("")}
    </div>
  `;
}

function toggleTier() {
  DB.profile.dietTier = DB.profile.dietTier === "4-5" ? "2-3" : "4-5";
  currentTier = DB.profile.dietTier;
  saveDB();
  renderRecipe();
}

// ---------- 口味画像推荐（脆口丝状 × 鸡蛋公式） ----------
function renderTasteReco() {
  const recos = CRISP_RECO.recos.filter((r) => !hitsAvoid(r.name + " " + r.base));
  const pending = CRISP_RECO.dietEntries.filter((e) => !DB.diet.some((d) => d.type === e.type && d.name === e.name));
  return `
    <div class="card reco-card">
      <div class="card-head">🎯 按娃口味推荐：${esc(CRISP_RECO.title)}</div>
      <div class="hint">${esc(CRISP_RECO.summary)}</div>
      ${pending.length ? `<div class="quick-links" style="margin:8px 0"><button class="btn btn-primary" onclick="recordTastes()">📝 一键记入饮食档案（${pending.length} 条口味观察）</button></div>` : ""}
      ${recos.map((r) => `
        <div class="food-item">
          <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')">
            <span>🥢 ${esc(r.name)} <span class="tag tag-season">${esc(r.note)}</span></span><span class="arrow">▾</span>
          </div>
          <div class="food-body">
            <p><b>为什么可行：</b>${esc(r.why)}</p>
            <p><b>怎么做：</b>${esc(r.how)}</p>
          </div>
        </div>`).join("")}
      <div class="sub-head">叶菜营养补位 5 招（深色蔬菜要占一半，不能全弃）</div>
      ${CRISP_RECO.veggieFix.map((t) => `<div class="mini-row">· ${esc(t)}</div>`).join("")}
      <div class="hint">${esc(CRISP_RECO.disclaimer)}</div>
    </div>`;
}

function recordTastes() {
  const pending = CRISP_RECO.dietEntries.filter((e) => !DB.diet.some((d) => d.type === e.type && d.name === e.name));
  if (!pending.length) return toast("这些口味观察都已经在饮食档案里了");
  pending.forEach((e) => DB.diet.push({
    id: uid(), type: e.type, name: e.name, reason: "", symptom: "", note: e.note,
    date: fmtDate(new Date().toISOString()),
  }));
  saveDB();
  render(currentTab);
  toast(`已记入 ${pending.length} 条口味观察 ✓`);
}

// ---------- 口味观察分析（南瓜/猕猴桃/火龙果/番茄） ----------
function renderTasteFindings() {
  const pending = TASTE_FINDINGS.dietEntries.filter((e) => !DB.diet.some((d) => d.type === e.type && d.name === e.name));
  return `
    <div class="card reco-card">
      <div class="card-head">🔍 口味观察分析：${esc(TASTE_FINDINGS.title)} <span class="muted small">${esc(TASTE_FINDINGS.updated)}</span></div>
      ${pending.length ? `<div class="quick-links" style="margin:8px 0"><button class="btn btn-primary" onclick="recordFindings()">📝 一键记入饮食档案（${pending.length} 条）</button></div>` : ""}
      ${TASTE_FINDINGS.topics.map((tp) => `
        <div class="food-item">
          <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')">
            <span>${esc(tp.t)}</span><span class="arrow">▾</span>
          </div>
          <div class="food-body">
            <div class="sub-head">可能的原因</div>
            ${tp.why.map((w) => `<div class="mini-row">· ${esc(w)}</div>`).join("")}
            <div class="sub-head">改善做法</div>
            ${tp.how.map((h) => `<div class="mini-row">· ${esc(h)}</div>`).join("")}
          </div>
        </div>`).join("")}
      <div class="hint">${esc(TASTE_FINDINGS.disclaimer)}</div>
    </div>`;
}

function recordFindings() {
  const pending = TASTE_FINDINGS.dietEntries.filter((e) => !DB.diet.some((d) => d.type === e.type && d.name === e.name));
  if (!pending.length) return toast("这些观察都已经在饮食档案里了");
  pending.forEach((e) => DB.diet.push({
    id: uid(), type: e.type, name: e.name, reason: "", symptom: "", note: e.note,
    date: fmtDate(new Date().toISOString()),
  }));
  saveDB();
  render(currentTab);
  toast(`已记入 ${pending.length} 条口味观察 ✓`);
}

// 食谱列表：含娃爱吃食材的标记
function likedTags(r) {
  const likes = DB.diet.filter((d) => d.type === "like").map((d) => d.name);
  const hit = r.ing.filter((i) => likes.some((n) => n.includes(i) || i.includes(n)));
  return hit.length ? ` <span class="tag tag-like">❤️ 含爱吃的：${hit.map(esc).join("、")}</span>` : "";
}

// ---------- 食谱编辑（内置食谱可改，也可新建自建食谱） ----------
function allRecipes() {
  if (!DB.recipeEdits) DB.recipeEdits = {};
  if (!DB.customRecipes) DB.customRecipes = [];
  const edited = RECIPES.map((r) => DB.recipeEdits[r.name] || r);
  return edited.concat(DB.customRecipes);
}

function renderRecipeEditForm() {
  return `
    <div id="recipe-edit-form" class="card hidden form-block">
      <div class="card-head" id="recipe-form-title">✏️ 新建食谱</div>
      <div class="hint">所有内容都能改；步骤一行一步。保存在本机，导出备份时会一起带走。</div>
      <input id="rf-name" class="input" placeholder="菜名，如 娃版青椒肉丝">
      <input id="rf-time" class="input" placeholder="用时，如 20分钟">
      <input id="rf-ing" class="input" placeholder="食材（顿号/逗号分隔）：西葫芦、鸡蛋">
      <textarea id="rf-select" class="input" rows="2" placeholder="🛒 怎么选食材（可选）：如 选表皮光滑、无发芽无绿皮的土豆"></textarea>
      <textarea id="rf-prep" class="input" rows="2" placeholder="🔪 怎么处理食材（可选）：如 削皮擦丝，泡水5分钟去淀粉"></textarea>
      <textarea id="rf-steps" class="input" rows="5" placeholder="做法步骤（每行一步）"></textarea>
      <textarea id="rf-childtip" class="input" rows="2" placeholder="👶 孩子份提示（可选）"></textarea>
      <textarea id="rf-adulttip" class="input" rows="2" placeholder="🧑 大人份提示（可选）"></textarea>
      <div class="quick-links">
        <button class="btn btn-primary" onclick="saveRecipe()">💾 保存</button>
        <button class="btn" onclick="toggleForm('recipe-edit-form')">取消</button>
      </div>
    </div>`;
}

let editingRecipeRef = null; // {kind:'builtin'|'custom', key}

function editRecipe(name) {
  const r = name ? allRecipes().find((x) => x.name === name) : null;
  document.getElementById("recipe-form-title").textContent = r ? "✏️ 编辑：" + r.name : "✏️ 新建食谱";
  document.getElementById("rf-name").value = r ? r.name : "";
  document.getElementById("rf-time").value = r ? (r.time || "") : "";
  document.getElementById("rf-ing").value = r ? r.ing.join("、") : "";
  document.getElementById("rf-select").value = r ? (r.select || "") : "";
  document.getElementById("rf-prep").value = r ? (r.prep || "") : "";
  document.getElementById("rf-steps").value = r ? r.steps.join("\n") : "";
  document.getElementById("rf-childtip").value = r ? (r.childTip || "") : "";
  document.getElementById("rf-adulttip").value = r ? (r.adultTip || "") : "";
  editingRecipeRef = r
    ? (RECIPES.some((x) => x.name === r.name) ? { kind: "builtin", key: r.name } : { kind: "custom", key: r.name })
    : null;
  document.getElementById("recipe-edit-form").classList.remove("hidden");
  window.scrollTo(0, 0);
  document.getElementById("rf-name").focus();
}

function saveRecipe() {
  const name = document.getElementById("rf-name").value.trim();
  if (!name) return toast("请填写菜名", false);
  const ing = document.getElementById("rf-ing").value.split(/[、,，]+/).map((s) => s.trim()).filter(Boolean);
  const steps = document.getElementById("rf-steps").value.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!ing.length) return toast("请填写食材", false);
  if (!steps.length) return toast("请填写至少一步做法", false);
  const obj = {
    name,
    time: document.getElementById("rf-time").value.trim() || "20分钟",
    season: "all",
    ing,
    select: document.getElementById("rf-select").value.trim(),
    prep: document.getElementById("rf-prep").value.trim(),
    steps,
    childTip: document.getElementById("rf-childtip").value.trim(),
    adultTip: document.getElementById("rf-adulttip").value.trim(),
  };
  if (!DB.recipeEdits) DB.recipeEdits = {};
  if (!DB.customRecipes) DB.customRecipes = [];
  if (editingRecipeRef && editingRecipeRef.kind === "builtin") {
    DB.recipeEdits[editingRecipeRef.key] = obj;
  } else if (editingRecipeRef && editingRecipeRef.kind === "custom") {
    const idx = DB.customRecipes.findIndex((x) => x.name === editingRecipeRef.key);
    if (idx >= 0) DB.customRecipes[idx] = obj;
    else DB.customRecipes.push(obj);
  } else {
    if (RECIPES.some((x) => x.name === name) || DB.customRecipes.some((x) => x.name === name)) {
      return toast("已有一道同名食谱，请换个名字，或点开那道菜直接编辑", false);
    }
    obj.id = uid();
    DB.customRecipes.push(obj);
  }
  saveDB();
  renderRecipe();
  toggleForm("recipe-edit-form");
  toast("食谱已保存 ✓");
}

function resetRecipe(name) {
  confirmModal("恢复这道食谱的默认内容？你的修改会先进回收站。", () => {
    const r = DB.recipeEdits && DB.recipeEdits[name];
    if (!r) return;
    trashItem("recipe", { ...r, _original: name });
    delete DB.recipeEdits[name];
    saveDB();
    renderRecipe();
    toast("已恢复默认 ✓");
  });
}

function deleteCustomRecipe(name) {
  const item = (DB.customRecipes || []).find((x) => x.name === name);
  if (!item) return;
  confirmModal("删除这道自建食谱？（进回收站，可恢复）", () => {
    trashItem("recipe", item);
    DB.customRecipes = DB.customRecipes.filter((x) => x.name !== name);
    saveDB();
    renderRecipe();
    toast("已移入回收站");
  });
}

// ============================================================
// 饮食档案页
// ============================================================
function renderDiet() {
  const el = document.getElementById("page-diet");
  const groups = { like: [], dislike: [], avoid: [] };
  DB.diet.forEach((d) => groups[d.type]?.push(d));

  el.innerHTML = `
    ${freeNoteCard("fn-diet")}

    ${renderTasteFindings()}

    <div class="card">
      <div class="card-head">添加饮食记录</div>
      <div class="seg" id="diet-type-seg">
        <button class="seg-btn active" data-v="like" onclick="setDietType('like')">❤️ 喜欢</button>
        <button class="seg-btn" data-v="dislike" onclick="setDietType('dislike')">✗ 不喜欢</button>
        <button class="seg-btn" data-v="avoid" onclick="setDietType('avoid')">🚫 忌口</button>
      </div>
      <input id="diet-name" class="input" placeholder="食物名称，如 虾">
      <div id="diet-avoid-extra" class="hidden">
        <input id="diet-reason" class="input" placeholder="忌口原因（必填），如 医生诊断过敏">
        <input id="diet-symptom" class="input" placeholder="吃了以后的症状（必填），如 全身红疹">
      </div>
      <input id="diet-note" class="input" placeholder="备注（可选）">
      <button class="btn btn-primary" onclick="addDiet()">保存记录</button>
    </div>

    <div class="card">
      <div class="card-head">🧪 新食物试验记录 <button class="btn-mini" onclick="toggleForm('trial-form')">+ 新试验</button></div>
      <div id="trial-form" class="hidden form-block">
        <input id="trial-name" class="input" placeholder="试验食物，如 芒果">
        <input id="trial-date" class="input" type="date" value="${fmtDate(new Date().toISOString())}">
        <input id="trial-time" class="input" placeholder="多久后出现反应，如 30分钟后">
        <input id="trial-symptom" class="input" placeholder="出现的反应（无症状填'无'）">
        <div class="hint">保存后系统自动给出建议：需要观察、就医或转为忌口。</div>
        <button class="btn btn-primary" onclick="addTrial()">保存试验</button>
      </div>
      <div id="trial-list">
        ${DB.trials.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((t) => `
          <div class="list-item">
            <div class="li-head">
              <b>${esc(t.name)}</b>
              <span class="tag ${t.outcome === "ok" ? "tag-like" : t.outcome === "mild" ? "tag-observe" : "tag-avoid"}">${t.outcome === "ok" ? "耐受良好" : t.outcome === "mild" ? "轻微反应" : "不良反应"}</span>
            </div>
            <div class="li-sub">${fmtDate(t.date)} ${esc(t.reactionTime || "")} ${t.symptom ? "· " + esc(t.symptom) : ""}</div>
            <div class="li-actions">
              <button class="btn-mini" onclick="openTrialDetail('${t.id}')">建议</button>
              ${t.outcome !== "ok" ? `<button class="btn-mini" onclick='trialToAvoid("${t.id}")'>转为忌口</button>` : ""}
              <button class="btn-mini" onclick='deleteRecord("trials","${t.id}")'>删除</button>
            </div>
          </div>`).join("") || "<div class='hint'>还没有试验记录。引入新食物时记一笔，排查过敏原很有用。</div>"}
      </div>
    </div>

    ${["avoid", "like", "dislike"].map((type) => `
      <div class="card">
        <div class="card-head">${TYPE_META[type].icon} ${TYPE_META[type].label}（${groups[type].length}）</div>
        ${groups[type].map((d) => `
          <div class="list-item">
            <div class="li-head"><b>${esc(d.name)}</b><span class="tag ${TYPE_META[type].cls}">${TYPE_META[type].label}</span></div>
            ${d.type === "avoid" ? `<div class="li-sub">原因：${esc(d.reason || "-")} · 症状：${esc(d.symptom || "-")}</div>` : ""}
            ${d.note ? `<div class="li-sub">备注：${esc(d.note)}</div>` : ""}
            <div class="li-actions"><button class="btn-mini" onclick='deleteRecord("diet","${d.id}")'>删除</button></div>
          </div>`).join("") || "<div class='hint'>暂无记录</div>"}
      </div>`).join("")}
  `;
}

let dietType = "like";
function setDietType(t) {
  dietType = t;
  document.querySelectorAll("#diet-type-seg .seg-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.v === t)
  );
  document.getElementById("diet-avoid-extra").classList.toggle("hidden", t !== "avoid");
}

function addDiet() {
  const name = document.getElementById("diet-name").value.trim();
  if (!name) return toast("请填写食物名称", false);
  const item = {
    id: uid(), type: dietType, name,
    reason: "", symptom: "", note: "",
    date: fmtDate(new Date().toISOString()),
  };
  if (dietType === "avoid") {
    item.reason = document.getElementById("diet-reason").value.trim();
    item.symptom = document.getElementById("diet-symptom").value.trim();
    if (!item.reason || !item.symptom) return toast("忌口必须填写原因和症状", false);
  }
  item.note = document.getElementById("diet-note").value.trim();
  DB.diet.push(item);
  saveDB();
  renderDiet();
  toast("已保存 ✓");
}

function toggleForm(id) {
  document.getElementById(id).classList.toggle("hidden");
}

function addTrial() {
  const name = document.getElementById("trial-name").value.trim();
  if (!name) return toast("请填写试验食物", false);
  const symptom = document.getElementById("trial-symptom").value.trim();
  const item = {
    id: uid(), name,
    date: document.getElementById("trial-date").value || fmtDate(new Date().toISOString()),
    reactionTime: document.getElementById("trial-time").value.trim(),
    symptom,
    outcome: classifyTrial(symptom),
    note: "",
    createdAt: new Date().toISOString(),
  };
  DB.trials.push(item);
  saveDB();
  renderDiet();
  toast("已保存，查看建议 ↓");
}

function classifyTrial(symptom) {
  const s = symptom || "";
  if (TRIAL_REDFLAG_EMERGENCY.some((k) => s.includes(k))) return "bad";
  if (TRIAL_REDFLAG_SEE_DOC.some((k) => s.includes(k)) || s === "无" || !s) {
    if (!s || s === "无") return "ok";
    return "mild";
  }
  return s ? "mild" : "ok";
}

function openTrialDetail(id) {
  const t = DB.trials.find((x) => x.id === id);
  if (!t) return;
  const s = t.symptom || "";
  let advice;
  if (TRIAL_REDFLAG_EMERGENCY.some((k) => s.includes(k))) {
    advice = "🚨 <b>立即就医/拨打120</b>：出现呼吸困难、喉头水肿、面色苍白等严重过敏反应信号，一刻都不要等。之后如医生确认，请把该食物加入忌口。";
  } else if (t.outcome === "ok") {
    advice = "✅ <b>耐受良好</b>：可以继续少量多次安排这种食物。建议间隔几天再吃一次巩固记录。";
  } else {
    advice = "🩺 <b>建议观察或就医</b>：出现" + esc(s) + "。① 先停掉该食物，观察2-3天；② 反复出现同一种反应，建议带记录去儿科/过敏反应科就诊；③ 若医生确认过敏，点「转为忌口」加入忌口名单，食谱会自动避开。";
  }
  window.alert(`【${t.name} 试验建议】\n\n` + advice.replace(/<[^>]+>/g, ""));
}

function trialToAvoid(id) {
  const t = DB.trials.find((x) => x.id === id);
  if (!t) return;
  DB.diet.push({
    id: uid(), type: "avoid", name: t.name,
    reason: "试验记录发现不良反应",
    symptom: t.symptom || "",
    note: `来源：${fmtDate(t.date)}试验记录`,
    date: fmtDate(new Date().toISOString()),
  });
  saveDB();
  toast("已加入忌口 ✓ 食谱将自动避开");
  renderDiet();
}

function deleteRecord(listKey, id) {
  const item = DB[listKey].find((x) => x.id === id);
  if (!item) return;
  confirmModal("删除后进入回收站（保留30天），可随时恢复。确定删除？", () => {
    trashItem(({ trials: "trial", opinions: "opinion", notes: "note", eduOpinions: "edu", sportLog: "sport" })[listKey] || listKey, item);
    DB[listKey] = DB[listKey].filter((x) => x.id !== id);
    saveDB();
    render(currentTab);
    toast("已移入回收站");
  });
}

// ============================================================
// 健康记录页
// ============================================================
let pendingPhotos = [];

function renderHealth() {
  const el = document.getElementById("page-health");
  const records = DB.health.slice().sort((a, b) => b.date.localeCompare(a.date));

  el.innerHTML = `
    ${freeNoteCard("fn-health")}

    <div class="card">
      <div class="card-head">记录一次生病/就诊</div>
      <input id="he-date" class="input" type="date" value="${fmtDate(new Date().toISOString())}">
      <input id="he-symptom" class="input" placeholder="症状，如 发热、咳嗽">
      <input id="he-med" class="input" placeholder="用药，如 布洛芬混悬液">
      <input id="he-dose" class="input" placeholder="药量，如 5ml/次，每日2次">
      <div class="row2">
        <input id="he-medstart" class="input" type="date" value="${fmtDate(new Date().toISOString())}">
        <input id="he-medend" class="input" type="date" placeholder="停药日期(选填)">
      </div>
      <textarea id="he-note" class="input" rows="2" placeholder="医生诊断/注意事项（可选）"></textarea>
      <label class="btn btn-file">📷 添加病历/检查单照片
        <input type="file" accept="image/*" multiple id="he-photos" onchange="onPhotoPick(this)">
      </label>
      <div id="photo-preview" class="photo-row"></div>
      <button class="btn btn-primary" onclick="addHealth()">保存记录</button>
      <div class="hint">照片保存在本机浏览器中，不会上传到任何服务器。</div>
    </div>

    <div id="health-list">
      ${records.map((r) => {
        const meds = medDuration(r);
        const matched = matchGuidelines(r);
        return `
        <div class="card record-card">
          <div class="li-head">
            <b>${esc(r.symptom || "未填写症状")}</b>
            <span class="muted">${fmtDate(r.date)}</span>
          </div>
          ${r.medicine ? `<div class="li-sub">💊 ${esc(r.medicine)} ${r.dose ? "· " + esc(r.dose) : ""}</div>` : ""}
          ${meds ? `<div class="li-sub highlight">⏱ 已用药 ${meds} 天${r.medEnd ? "（已结束）" : "（进行中）"}</div>` : ""}
          ${r.note ? `<div class="li-sub">📝 ${esc(r.note)}</div>` : ""}
          ${(r.photoIds || []).length ? `<div class="photo-row">${r.photoIds.map((pid) => `<img class="photo-thumb" data-pid="${pid}" onclick="viewPhoto('${pid}')" alt="病历照片">`).join("")}</div>` : ""}
          ${matched.length ? `
            <div class="guide-box">
              <div class="guide-title">📖 关联指南与建议</div>
              ${matched.map((g) => `
                <div class="guide-entry">
                  <b>${esc(g.title)}</b>
                  <ul>${g.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
                  <div class="redflag"><b>出现以下情况立即就医：</b>
                    <ul>${g.redFlags.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
                  </div>
                  <div class="muted small">来源：${esc(g.source)}</div>
                  <button class="btn-mini" onclick="searchGuideline('${esc(g.title)}')">联网搜索最新指南</button>
                </div>`).join("")}
            </div>` : ""}
          <div class="li-actions">
            ${r.medicine ? `<button class="btn-mini" onclick='stopMed("${r.id}")'>标记停药</button>` : ""}
            <button class="btn-mini" onclick='deleteRecord("health","${r.id}")'>删除</button>
          </div>
        </div>`;
      }).join("") || "<div class='hint'>暂无健康记录。</div>"}
    </div>

    <div class="card">
      <div class="card-head">🏥 就医参考（资料库）</div>
      <div class="hint">${TRIAGE_TIPS.map(esc).join("<br>")}</div>
      <div class="sub-head">权威儿科医院（部分）</div>
      ${HOSPITALS.map((h) => `<div class="mini-row"><b>${esc(h.name)}</b><br><span class="muted">${esc(h.city)} · ${esc(h.note)}</span></div>`).join("")}
      <button class="btn-mini" onclick="searchHospitals()">联网搜索本地儿科医院</button>
    </div>
  `;
  // 加载缩略图
  document.querySelectorAll("#page-health .photo-thumb[data-pid]").forEach(async (img) => {
    const d = await getPhoto(img.dataset.pid);
    if (d) img.src = d;
  });
}

function medDuration(r) {
  if (!r.medStart) return "";
  const end = r.medEnd || fmtDate(new Date().toISOString());
  return String(daysBetween(r.medStart, end));
}

function matchGuidelines(r) {
  const text = [r.symptom, r.medicine, r.note].join(" ");
  return GUIDELINES.filter((g) => g.keywords.some((k) => text.includes(k)));
}

function onPhotoPick(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  files.forEach(async (f) => {
    try {
      const dataUrl = await compressImage(f);
      pendingPhotos.push(dataUrl);
      renderPhotoPreview();
    } catch (e) {
      toast("照片处理失败", false);
    }
  });
  input.value = "";
}

function renderPhotoPreview() {
  const box = document.getElementById("photo-preview");
  if (!box) return;
  box.innerHTML = pendingPhotos
    .map((p, i) => `<div class="pv-wrap"><img src="${p}"><button class="pv-del" onclick="removePending(${i})">×</button></div>`)
    .join("");
}

function removePending(i) {
  pendingPhotos.splice(i, 1);
  renderPhotoPreview();
}

async function addHealth() {
  const symptom = document.getElementById("he-symptom").value.trim();
  if (!symptom) return toast("请填写症状", false);
  const photoIds = [];
  for (let i = 0; i < pendingPhotos.length; i++) {
    const pid = uid() + "_" + i;
    try {
      await putPhoto(pid, pendingPhotos[i]);
      photoIds.push(pid);
    } catch (e) {
      toast("照片保存失败", false);
    }
  }
  DB.health.push({
    id: uid(),
    date: document.getElementById("he-date").value || fmtDate(new Date().toISOString()),
    symptom,
    medicine: document.getElementById("he-med").value.trim(),
    dose: document.getElementById("he-dose").value.trim(),
    medStart: document.getElementById("he-medstart").value || "",
    medEnd: document.getElementById("he-medend").value || "",
    note: document.getElementById("he-note").value.trim(),
    photoIds,
  });
  pendingPhotos = [];
  saveDB();
  renderHealth();
  toast("已保存 ✓ 就诊卡已同步更新");
}

function stopMed(id) {
  const r = DB.health.find((x) => x.id === id);
  if (!r) return;
  r.medEnd = fmtDate(new Date().toISOString());
  saveDB();
  renderHealth();
  toast(`已标记停药：共用药 ${medDuration(r)} 天`);
}

function viewPhoto(pid) {
  getPhoto(pid).then((d) => {
    if (!d) return;
    const w = window.open("");
    if (w) w.document.write(`<img src="${d}" style="max-width:100%">`);
  });
}

function searchGuideline(title) {
  const q = encodeURIComponent(`儿童 ${title} 诊疗指南 最新`);
  window.open("https://www.bing.com/search?q=" + q, "_blank");
}

function searchHospitals() {
  const q = encodeURIComponent("正规 儿科医院 预约挂号 官方平台");
  window.open("https://www.bing.com/search?q=" + q, "_blank");
}

// ============================================================
// 就诊卡页
// ============================================================
function renderCard() {
  const el = document.getElementById("page-card");
  const p = DB.profile;
  const avoids = DB.diet.filter((d) => d.type === "avoid");
  const dislikes = DB.diet.filter((d) => d.type === "dislike");
  const meds = DB.health.filter((h) => h.medicine).sort((a, b) => b.date.localeCompare(a.date));
  const history = DB.health.slice().sort((a, b) => b.date.localeCompare(a.date));

  el.innerHTML = `
    <div class="hint top-hint">就诊卡随所有记录自动更新。看病前出示给医生即可快速了解孩子的忌口、用药和病史。</div>
    <div id="visit-card" class="visit-card">
      <div class="vc-head">
        <div class="vc-title">🩺 儿科就诊卡</div>
        <div class="vc-sub">${esc(p.name || "宝宝")} · ${esc(childAgeLabel(p.birth))}</div>
      </div>
      <div class="vc-sec">
        <div class="vc-sec-title">基础信息</div>
        <div class="vc-grid">
          <div>出生：${esc(p.birth || "未填")}</div>
          <div>性别：${esc(p.gender || "未填")}</div>
          <div>身高：${esc(p.height || "未填")}</div>
          <div>体重：${esc(p.weight || "未填")}</div>
          <div>血型：${esc(p.bloodType || "未填")}</div>
        </div>
      </div>
      <div class="vc-sec">
        <div class="vc-sec-title">⚠️ 过敏与忌口史</div>
        ${avoids.map((d) => `<div class="vc-line"><b>${esc(d.name)}</b> — ${esc(d.reason || "")}，症状：${esc(d.symptom || "")}</div>`).join("") || '<div class="vc-line muted">暂无已知忌口/过敏</div>'}
        ${p.allergiesNote ? `<div class="vc-line">补充：${esc(p.allergiesNote)}</div>` : ""}
      </div>
      <div class="vc-sec">
        <div class="vc-sec-title">💊 用药史（最近 ${Math.min(meds.length, 5)} 条）</div>
        ${meds.slice(0, 5).map((h) => `<div class="vc-line">${fmtDate(h.date)} ${esc(h.medicine)} ${h.dose ? "· " + esc(h.dose) : ""} · 共${medDuration(h)}天</div>`).join("") || '<div class="vc-line muted">暂无用药记录</div>'}
      </div>
      <div class="vc-sec">
        <div class="vc-sec-title">📋 病情史</div>
        ${history.slice(0, 8).map((h) => `<div class="vc-line">${fmtDate(h.date)} ${esc(h.symptom)}${h.note ? "（" + esc(h.note) + "）" : ""}</div>`).join("") || '<div class="vc-line muted">暂无病史记录</div>'}
      </div>
      <div class="vc-sec">
        <div class="vc-sec-title">🍽 饮食偏好提示</div>
        ${dislikes.length ? `<div class="vc-line">不爱吃：${dislikes.map((d) => esc(d.name)).join("、")}</div>` : ""}
      </div>
      <div class="vc-foot">生成于 ${new Date().toLocaleString("zh-CN")} · 本卡由家长电子档案自动整理</div>
    </div>
    <div class="card quick-links">
      <button class="btn btn-primary" onclick="exportCardImage()">导出长图</button>
      <button class="btn" onclick="window.print()">打印</button>
    </div>
    <div class="hint">导出长图后保存到手机相册，去医院直接出示；若导出失败会自动打开打印预览，也可用系统截图。</div>
  `;
}

async function exportCardImage() {
  const node = document.getElementById("visit-card");
  if (!node) return;
  toast("正在生成图片…");
  try {
    if (!window.html2canvas) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    const canvas = await window.html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `就诊卡_${DB.profile.name || "宝宝"}_${fmtDate(new Date().toISOString())}.png`;
    a.click();
    toast("长图已生成 ✓");
  } catch (e) {
    toast("导出失败，已打开打印预览", false);
    window.print();
  }
}

// ============================================================
// 设置页（档案 / 回收站 / 备份）
// ============================================================
function renderSettings() {
  const el = document.getElementById("page-settings");
  const p = DB.profile;
  el.innerHTML = `
    <div class="card">
      <div class="card-head">孩子基础信息</div>
      <input id="sp-name" class="input" placeholder="孩子姓名/小名" value="${esc(p.name)}">
      <div class="row2">
        <select id="sp-gender" class="input">
          <option value="">性别</option>
          <option value="男" ${p.gender === "男" ? "selected" : ""}>男</option>
          <option value="女" ${p.gender === "女" ? "selected" : ""}>女</option>
        </select>
        <input id="sp-birth" class="input" type="month" value="${esc(p.birth)}">
      </div>
      <div class="row2">
        <input id="sp-height" class="input" placeholder="身高 cm" value="${esc(p.height)}">
        <input id="sp-weight" class="input" placeholder="体重 kg" value="${esc(p.weight)}">
      </div>
      <input id="sp-blood" class="input" placeholder="血型（选填）" value="${esc(p.bloodType)}">
      <textarea id="sp-allergy" class="input" rows="2" placeholder="过敏补充说明（选填）">${esc(p.allergiesNote)}</textarea>
      <button class="btn btn-primary" onclick="saveProfile()">保存</button>
    </div>

    <div class="card">
      <div class="card-head">备份与恢复</div>
      <div class="hint">所有数据只存在本机浏览器。<b>强烈建议定期导出备份</b>（换手机/清除浏览器数据前必做）。数据也可以备份到你的 GitHub 私密 Gist（见下方），多设备同步更稳。</div>
      <button class="btn btn-primary" onclick="doExport()">📤 导出备份文件</button>
      <label class="btn btn-file">📥 导入备份恢复
        <input type="file" accept=".json" id="import-file" onchange="doImport(this)">
      </label>
    </div>

    ${renderGhBackupCard()}

    <div class="card">
      <div class="card-head">🗑 回收站（保留${TRASH_DAYS}天）</div>
      ${DB.trash.map((t) => {
        const daysLeft = Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(t.deletedAt)) / 86400000));
        const nameMap = { diet: "饮食记录", trial: "试验记录", health: "健康记录", opinion: "科普观点", note: "备忘便签", recipe: "食谱", edu: "教育观点", sport: "运动打卡" };
        return `<div class="list-item">
          <div class="li-head"><b>${esc(t.item.name || t.item.symptom || "记录")}</b><span class="muted">${esc(nameMap[t.type] || t.type)}</span></div>
          <div class="li-sub">删除于 ${fmtDate(t.deletedAt)} · 剩 ${daysLeft} 天自动清除</div>
          <div class="li-actions">
            <button class="btn-mini" onclick='restoreItem("${t.id}")'>恢复</button>
            <button class="btn-mini" onclick='hardDeleteItem("${t.id}")'>彻底删除</button>
          </div>
        </div>`;
      }).join("") || "<div class='hint'>回收站是空的。</div>"}
    </div>

    <div class="hint bottom-tip">提醒：不要对该站点执行「清除浏览器数据」，否则本地记录会被清空（备份可恢复）。</div>
  `;
}

function saveProfile() {
  const p = DB.profile;
  p.name = document.getElementById("sp-name").value.trim();
  p.gender = document.getElementById("sp-gender").value;
  p.birth = document.getElementById("sp-birth").value || p.birth;
  p.height = document.getElementById("sp-height").value.trim();
  p.weight = document.getElementById("sp-weight").value.trim();
  p.bloodType = document.getElementById("sp-blood").value.trim();
  p.allergiesNote = document.getElementById("sp-allergy").value.trim();
  saveDB();
  toast("已保存 ✓ 就诊卡已同步更新");
}

function doExport() {
  exportBackup().then(() => toast("备份文件已开始下载 ✓")).catch(() => toast("导出失败", false));
}

async function doImport(input) {
  const file = input.files[0];
  if (!file) return;
  confirmModal("导入会覆盖当前所有数据，确定继续？", async () => {
    try {
      await importBackup(file);
      toast("恢复完成 ✓");
      renderSettings();
    } catch (e) {
      toast("导入失败：" + e.message, false);
    }
  });
  input.value = "";
}

function restoreItem(id) {
  if (restoreFromTrash(id)) {
    toast("已恢复 ✓");
    renderSettings();
  }
}

// ---------- GitHub 云备份（隐私信息不上传） ----------
function renderGhBackupCard() {
  const cfg = loadGhCfg();
  return `
    <div class="card">
      <div class="card-head">☁️ GitHub 云备份（自动隐去隐私信息）</div>
      <div class="hint">把记录备份到<b>你自己的 GitHub 私密 Gist</b>，换手机/多设备也能恢复。<b>隐私保护：</b>孩子基础信息（姓名、生日、身高体重、血型、过敏说明）只存在本机、永不上传；云端备份默认不含照片。从云端恢复时，隐私字段同样不会被覆盖。</div>
      <input id="gh-token" class="input" type="password" placeholder="GitHub Token（粘贴后点「保存配置」）">
      <input id="gh-gist" class="input" placeholder="Gist ID（首次上传后自动生成，不用填）" value="${esc(cfg.gistId || "")}">
      <label class="hint" style="display:flex;align-items:center;gap:6px;margin:6px 0">
        <input type="checkbox" id="gh-photos" ${cfg.includePhotos ? "checked" : ""}>
        备份中包含照片（照片属隐私内容，建议关闭）
      </label>
      <div class="quick-links">
        <button class="btn" onclick="ghSaveCfg()">💾 保存配置</button>
        <button class="btn btn-primary" onclick="doGhPush()">⬆ 上传备份</button>
        <button class="btn" onclick="doGhPull()">⬇ 从云端恢复</button>
      </div>
      ${cfg.gistId ? `<div class="hint">最近上传：${cfg.lastPush ? fmtDate(cfg.lastPush) : "未知"} · Gist：<a href="https://gist.github.com/${esc(cfg.gistId)}" target="_blank" rel="noopener">打开查看</a>（私密 Gist，只有持有你 Token 的人能看到）</div>` : ""}
      <div class="hint">Token 获取：GitHub → 右上角头像 → Settings → Developer settings → Personal access tokens → Generate new token，勾选 gist 权限即可（建议设置有效期）。Token 只保存在本机浏览器，不上传。详细步骤见项目里的《部署说明》。</div>
    </div>`;
}

function ghSaveCfg() {
  const prev = loadGhCfg();
  const cfg = {
    token: document.getElementById("gh-token").value.trim() || prev.token || "",
    gistId: document.getElementById("gh-gist").value.trim(),
    includePhotos: document.getElementById("gh-photos").checked,
  };
  saveGhCfg(cfg);
  toast("配置已保存（仅存在本机）✓");
}

async function doGhPush() {
  const includePhotos = document.getElementById("gh-photos").checked;
  toast("正在上传…");
  try {
    await ghPush(includePhotos);
    toast("上传成功 ✓ 已保存到你的私密 Gist");
    renderSettings();
  } catch (e) {
    toast("上传失败：" + e.message, false);
  }
}

function doGhPull() {
  confirmModal("从云端恢复会覆盖本机的记录数据（孩子基础信息保留本机不动）。确定继续？", async () => {
    try {
      const payload = await ghFetchRemote();
      applyCloudPayload(payload);
      toast("已恢复 ✓ 隐私信息保留本机未动");
      renderSettings();
    } catch (e) {
      toast("恢复失败：" + e.message, false);
    }
  });
}

function hardDeleteItem(id) {
  confirmModal("彻底删除后无法恢复，确定？", () => {
    hardDelete(id);
    renderSettings();
    toast("已彻底删除");
  });
}

// ============================================================
// 自由补充区 + 智能归档
// ============================================================
function freeNoteCard(id) {
  return `
    <div class="card freenote-card">
      <div class="card-head">✏️ 自由补充区 <span class="muted small">想到什么写什么</span></div>
      <textarea id="${id}" class="input" rows="2" placeholder="如：今天很爱吃西兰花 / 医生说布洛芬要隔6小时 / 虾过敏以后不能吃了 / 昨晚发烧38.9…"></textarea>
      <button class="btn btn-primary" onclick="smartRoute('${id}')">智能归档</button>
      <div class="hint">自动识别去向：饮食喜欢/不喜欢/忌口 · 新食物试验 · 健康/用药记录 · 教育观点（自动分类） · 医生科普观点 · 孩子档案 · 都不匹配就存为首页备忘便签。</div>
    </div>`;
}

const FOOD_POOL = Array.from(new Set([
  ...TOP10_FOODS.map((f) => f.name),
  ...TOP10_FOODS.flatMap((f) => f.name.split(/[（(]/)[0].split("/")),
  ...RECIPES.flatMap((r) => r.ing),
  ...Object.values(SEASONAL).flatMap((s) => s.foods),
  "虾", "蟹", "贝类", "芒果", "菠萝", "猕猴桃", "花生", "芝麻", "坚果", "蜂蜜", "鸡蛋", "牛奶", "酸奶", "牛肉", "羊肉", "樱桃", "荔枝", "龙眼", "榴莲", "山竹", "桃子", "李子", "杏", "山药", "土豆", "红薯", "玉米", "南瓜", "小米", "燕麦", "面条", "米饭", "豆腐", "豆奶", "香菇", "金针菇", "菠菜", "西兰花", "油菜", "番茄", "黄瓜", "冬瓜", "丝瓜", "毛豆", "豌豆", "芦笋", "春笋", "韭菜", "草莓", "枇杷", "莲藕", "梨", "苹果", "橙子", "柚子", "大白菜", "芋头", "冬笋", "鲈鱼", "鳕鱼", "带鱼", "黄花鱼", "虾仁", "鸡肉", "鸭肉", "猪肉", "排骨", "鸡腿肉", "小麦", "麸质", "蛋白", "蛋黄", "西瓜",
])).filter((n) => n && n.length >= 1);

// 优先级从上到下：命中多个时归到最上面的类别
const ROUTE_RULES = [
  { target: "profile", label: "孩子档案（身高/体重/血型等）", re: /(身高|体重|血型|出生|量了|多少斤|公斤|厘米|kg|cm)/i },
  { target: "avoid", label: "忌口/过敏记录", re: /(过敏|忌口|不能吃|不能碰|不要吃|别吃|不敢吃|吃了[^。]{0,10}(疹|肿|泻|吐|痒)|一吃[^。]{0,10}就)/ },
  { target: "trial", label: "新食物试验记录", re: /(第一次吃|首次吃|新食物|试吃|试验|尝试吃|开始添加)/ },
  { target: "like", label: "饮食喜欢", re: /(爱吃|喜欢吃|很喜欢|爱喝|抢着吃|吃得香|光盘)/ },
  { target: "dislike", label: "饮食不喜欢", re: /(不爱吃|不喜欢吃|讨厌|不肯吃|挑食|剩饭|不咽)/ },
  { target: "health", label: "健康/用药记录", re: /(发烧|发热|咳嗽|流涕|鼻塞|打喷嚏|腹泻|拉肚子|拉稀|呕吐|吐了|恶心|皮疹|红疹|湿疹|荨麻疹|手足口|疱疹|流感|甲流|乙流|感冒|吃了[^。]{0,8}药|开始用药|停药|就医|挂号|去医院|看医生|体检|疫苗|接种|复诊)/ },
  { target: "edu", label: "教育观点（方法/习惯/情绪/学科等）", re: /(教育|数学|英语|语文|作业|做题|刷题|题海|兴趣班|幼小衔接|幼儿园|学前|启蒙|培养|习惯|阅读|绘本|识字|专注|情绪|感受|尊重|沟通|共情|自理|独立|财商|编程|人工智能|AI|大运动|陪玩|午睡|孩子[^。]{0,12}(学|教|玩|练)|老师[^。]{0,10}(说|建议))/ },
  { target: "opinion", label: "医生/博主科普观点", re: /(医生|大夫|主任|教授|药师|博主|科普|视频|文章|公众号|抖音|小红书|微博|知乎|说[:：]|建议[:：]|提醒[:：])/ },
];

function classifyFreeText(text) {
  return ROUTE_RULES.filter((r) => r.re.test(text));
}

function guessFoodName(text) {
  return FOOD_POOL.find((f) => text.includes(f)) || "";
}

function guessSymptom(text) {
  const m = text.match(/(发热|发烧|咳嗽|流涕|鼻塞|腹泻|拉肚子|呕吐|吐了|皮疹|红疹|湿疹|荨麻疹|手足口|疱疹|流感|甲流|乙流|感冒|恶心|皮痒|皮肤痒)/);
  return m ? m[1] : "";
}

function guessDate(text) {
  const m = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!m) return fmtDate(new Date().toISOString());
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
}

function smartRoute(id) {
  const text = document.getElementById(id).value.trim();
  if (!text) return toast("先写点什么吧", false);
  const hits = classifyFreeText(text);
  const food = guessFoodName(text);
  const symptom = guessSymptom(text);
  const dest = hits[0];
  const destLabel = dest ? dest.label : "备忘便签（未识别到明确类别）";
  const extra = hits.length > 1 ? `\n同时检测到：${hits.slice(1).map((h) => h.label).join("、")}（也可复制原文到对应模块）` : "";
  const info = `${food ? "涉及食物：" + food + "\n" : ""}${symptom ? "涉及症状：" + symptom + "\n" : ""}`;
  confirmModal(`识别去向：${destLabel}\n${info}将跳转并自动填入，请补全必填项后保存。${extra}`, () => applyRoute(dest ? dest.target : "note", text, food, symptom));
}

function applyRoute(target, text, food, symptom) {
  if (target === "avoid" || target === "like" || target === "dislike") {
    switchTab("diet");
    setDietType(target);
    document.getElementById("diet-name").value = food || "";
    document.getElementById("diet-note").value = text;
    if (target === "avoid") {
      const m = text.match(/(?:因为|由于)([^。；，,]+)/);
      if (m) document.getElementById("diet-reason").value = m[1].trim();
    }
    document.getElementById("diet-name").focus();
    toast(`已转入「${TYPE_META[target].label}」表单，补全后保存`);
  } else if (target === "trial") {
    switchTab("diet");
    document.getElementById("trial-form").classList.remove("hidden");
    document.getElementById("trial-name").value = food || "";
    document.getElementById("trial-date").value = guessDate(text);
    if (symptom) document.getElementById("trial-symptom").value = text;
    toast("已转入试验表单，补全后保存");
  } else if (target === "health") {
    switchTab("health");
    document.getElementById("he-symptom").value = symptom || "";
    document.getElementById("he-date").value = guessDate(text);
    document.getElementById("he-note").value = text;
    toast("已转入健康记录，补全症状/用药后保存");
  } else if (target === "edu") {
    switchTab("edu");
    document.getElementById("edu-text").value = text;
    updateEduPreview();
    toast("已转入教育观点输入框，确认分类后保存");
  } else if (target === "opinion") {
    switchTab("opinions");
    document.getElementById("op-content").value = text;
    autoFillOpinion();
    toast("已识别内容要点，确认后保存");
  } else if (target === "profile") {
    switchTab("settings");
    const h = text.match(/身高[^\d]{0,4}(\d{2,3})/);
    const w = text.match(/体重[^\d]{0,4}(\d{1,2}(?:\.\d)?)/) || text.match(/(\d{1,2}(?:\.\d)?)\s*kg/i);
    const b = text.match(/血型[^ABOABab0-9]{0,3}([ABOABab]{1,2})型?/);
    if (h) document.getElementById("sp-height").value = h[1];
    if (w) document.getElementById("sp-weight").value = w[1];
    if (b) document.getElementById("sp-blood").value = b[1].toUpperCase() + "型";
    toast(h || w || b ? "已填入可识别的档案字段，确认后保存" : "未识别到具体数值，请手动补充", !!(h || w || b));
  } else {
    DB.notes.push({ id: uid(), text, date: fmtDate(new Date().toISOString()) });
    saveDB();
    render(currentTab);
    toast("已存为备忘便签（首页可查看）");
  }
}

function noteToOpinion(id) {
  const n = DB.notes.find((x) => x.id === id);
  if (!n) return;
  switchTab("opinions");
  document.getElementById("op-content").value = n.text;
  autoFillOpinion();
  toast("已转入观点表单，保存后便签可删除");
}

// ============================================================
// 科普观点库
// ============================================================
let pendingOpPhotos = [];

const PLATFORMS = [
  { k: "douyin|v\\.douyin|iesdouyin", n: "抖音" },
  { k: "xiaohongshu|xhslink", n: "小红书" },
  { k: "weixin|mp\\.weixin|weixin\\.qq", n: "微信公众号" },
  { k: "weibo", n: "微博" },
  { k: "bilibili|b23\\.tv", n: "B站" },
  { k: "zhihu", n: "知乎" },
  { k: "toutiao", n: "今日头条" },
  { k: "kuaishou", n: "快手" },
  { k: "v\\.qq\\.com", n: "腾讯视频" },
];

// 每个指南主题的核对关键词（用于观点↔指南要点匹配）
const VERIFY_TERMS = {
  fever: ["对乙酰氨基酚", "布洛芬", "38.5", "精神状态", "酒精", "捂汗", "温水", "反复", "脱水"],
  flu: ["奥司他韦", "48小时", "阿司匹林", "疫苗", "隔离", "饮水"],
  hfmd: ["隔离", "口腔", "皮肤护理", "布洛芬", "对乙酰氨基酚", "EV-A71", "疫苗", "洗手", "消毒", "清淡"],
  diarrhea: ["补液盐", "脱水", "锌", "抗生素", "蒙脱石", "禁食", "母乳", "继续喂养", "红臀"],
  cough: ["镇咳", "可待因", "湿度", "加湿器", "蜂蜜", "洗鼻", "生理盐水", "犬吠"],
  vomit: ["补液", "禁食", "侧卧", "误吸", "米汤", "胆汁", "喷射", "清淡"],
  rash: ["保湿", "润肤", "激素", "药膏", "冷敷", "过敏原", "风团", "停掉"],
  cold: ["抗生素", "自限", "洗鼻", "复方感冒药", "5-7天", "退热"],
};

// 观点中出现这些说法时重点标红（官方指南明确不推荐/需警惕）
const RISKY_TERMS = [
  { t: "酒精擦浴", msg: "官方指南不推荐酒精擦浴退热" },
  { t: "捂汗", msg: "官方指南不推荐捂汗退热" },
  { t: "阿司匹林", msg: "儿童忌用阿司匹林（瑞氏综合征风险）" },
  { t: "可待因", msg: "含可待因镇咳药18岁以下禁用" },
  { t: "复方感冒药", msg: "不推荐儿童自行使用复方感冒药" },
  { t: "抗生素", msg: "抗生素须医生评估后使用，不建议自行用药" },
  { t: "禁食", msg: "腹泻/呕吐不主张长时间禁食，核心是防脱水+继续喂养" },
  { t: "断食", msg: "不建议让孩子断食，应继续适量喂养" },
  { t: "偏方", msg: "请勿轻信偏方，以官方指南和医生为准" },
  { t: "土方", msg: "请勿轻信土方，以官方指南和医生为准" },
  { t: "果汁", msg: "膳食指南建议吃完整水果，不用果汁代替" },
];

function renderOpinions() {
  const el = document.getElementById("page-opinions");
  const list = DB.opinions.slice().sort((a, b) => b.date.localeCompare(a.date));
  el.innerHTML = `
    ${freeNoteCard("fn-op")}

    <div class="card">
      <div class="card-head">收藏一条科普观点</div>
      <div class="hint">粘贴视频/文章链接、截图，或把观点内容写进来。保存时自动识别医院、医生/博主、日期，并对照内置官方诊疗指南生成对比表（需警惕的说法重点标红）。</div>
      <input id="op-link" class="input" placeholder="链接（选填）：视频/文章 URL，可长按粘贴">
      <textarea id="op-content" class="input" rows="3" placeholder="观点内容（必填）：粘贴文案/字幕/截图里的文字，或自己的摘录"></textarea>
      <div class="row2">
        <input id="op-source-name" class="input" placeholder="医生/博主名称">
        <input id="op-source-org" class="input" placeholder="医院/机构/平台">
      </div>
      <div class="row2">
        <select id="op-source-type" class="input">
          <option value="医生">医生</option>
          <option value="自媒体博主">自媒体博主</option>
          <option value="其他来源">其他来源</option>
        </select>
        <input id="op-date" class="input" type="date" value="${fmtDate(new Date().toISOString())}">
      </div>
      <input id="op-topic" class="input" placeholder="针对症状/主题，如：发热、手足口（可留空自动识别）">
      <label class="btn btn-file">📷 视频/文章截图（选填，可多张）
        <input type="file" accept="image/*" multiple id="op-photos" onchange="onOpPhotoPick(this)">
      </label>
      <div id="op-photo-preview" class="photo-row"></div>
      <div class="quick-links">
        <button class="btn" onclick="autoFillOpinion()">🔍 智能识别</button>
        <button class="btn btn-primary" onclick="addOpinion()">💾 保存并生成对比</button>
      </div>
    </div>

    <div id="opinion-list">
      ${list.map((op) => renderOpinionItem(op)).join("") || "<div class='hint'>还没有收藏观点。看到医生/博主的科普视频随手记一条，以后不用重复翻找。</div>"}
    </div>
  `;
  document.querySelectorAll("#page-opinions .photo-thumb[data-pid]").forEach(async (img) => {
    const d = await getPhoto(img.dataset.pid);
    if (d) img.src = d;
  });
}

function opinionSentences(op) {
  return [op.topic || "", op.content || ""].join("。")
    .split(/[。！？!?;\n；]+/).map((s) => s.trim()).filter((s) => s.length > 1);
}

function buildComparison(op) {
  const text = [op.topic, op.content, op.sourceOrg].join(" ");
  const matched = GUIDELINES.filter((g) => g.keywords.some((k) => text.includes(k)));
  const sentences = opinionSentences(op);
  const risky = RISKY_TERMS.filter((r) => text.includes(r.t));
  const tables = matched.map((g) => {
    const terms = VERIFY_TERMS[g.id] || [];
    const rows = g.points.map((point) => {
      const shared = terms.find((t) => point.includes(t) && sentences.some((s) => s.includes(t)));
      return {
        point,
        op: shared ? sentences.find((s) => s.includes(shared)) : "",
        status: shared ? "✅ 有提及" : "未提及",
      };
    });
    return { title: g.title, source: g.source, rows };
  });
  return { risky, tables };
}

function renderOpinionItem(op) {
  const cmp = buildComparison(op);
  return `
    <div class="card opinion-card">
      <div class="li-head">
        <b>${esc(op.sourceName || "未记录来源")}</b>
        <span class="tag ${op.sourceType === "医生" ? "tag-doctor" : "tag-influencer"}">${esc(op.sourceType)}</span>
      </div>
      <div class="li-sub">${esc(op.sourceOrg || "未记录机构")} · 针对：${esc(op.topic || "未识别主题")} · ${fmtDate(op.date)}</div>
      ${op.link ? `<div class="li-sub"><a href="${esc(op.link)}" target="_blank" rel="noopener" style="word-break:break-all">🔗 原链接</a></div>` : ""}
      <div class="op-content">${esc(op.content)}</div>
      ${(op.photoIds || []).length ? `<div class="photo-row">${op.photoIds.map((pid) => `<img class="photo-thumb" data-pid="${pid}" onclick="viewPhoto('${pid}')" alt="截图">`).join("")}</div>` : ""}
      ${cmp.risky.length ? `<div class="risky-box">⚠️ <b>重点核对</b>：观点中提到「${cmp.risky.map((r) => esc(r.t)).join("、")}」——${cmp.risky.map((r) => esc(r.msg)).join("；")}。</div>` : ""}
      ${cmp.tables.length ? cmp.tables.map((t) => `
        <div class="food-item">
          <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')">
            <span>📋 指南对比：${esc(t.title)}</span><span class="arrow">▾</span>
          </div>
          <div class="food-body">
            <div class="muted small">对照来源：${esc(t.source)}</div>
            <div class="cmp-wrap"><table class="cmp-table">
              <thead><tr><th>官方指南要点</th><th>观点中的相关内容</th><th>判定</th></tr></thead>
              <tbody>
                ${t.rows.map((r) => `<tr class="${r.status === "✅ 有提及" ? "row-hit" : "row-miss"}"><td>${esc(r.point)}</td><td>${r.op ? esc(r.op) : "<span class='muted'>—未提及—</span>"}</td><td>${r.status === "✅ 有提及" ? "✅ 有提及" : "—未提及—"}</td></tr>`).join("")}
              </tbody>
            </table></div>
            <div class="hint">判定基于本机内置指南要点与关键词匹配，仅供快速对照记忆；分歧处请以官方指南原文和主治医生为准。</div>
          </div>
        </div>`).join("") : `<div class="hint">未匹配到内置指南主题（发热/流感/手足口/腹泻/咳嗽/呕吐/皮疹/感冒），如有对应健康记录可在其「关联指南」里查看要点。</div>`}
      <div class="li-actions"><button class="btn-mini" onclick='deleteRecord("opinions","${op.id}")'>删除</button></div>
    </div>`;
}

function onOpPhotoPick(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  files.forEach(async (f) => {
    try {
      const dataUrl = await compressImage(f);
      pendingOpPhotos.push(dataUrl);
      renderOpPhotoPreview();
    } catch (e) {
      toast("截图处理失败", false);
    }
  });
  input.value = "";
}

function renderOpPhotoPreview() {
  const box = document.getElementById("op-photo-preview");
  if (!box) return;
  box.innerHTML = pendingOpPhotos
    .map((p, i) => `<div class="pv-wrap"><img src="${p}"><button class="pv-del" onclick="removeOpPending(${i})">×</button></div>`)
    .join("");
}

function removeOpPending(i) {
  pendingOpPhotos.splice(i, 1);
  renderOpPhotoPreview();
}

function autoFillOpinion() {
  const content = document.getElementById("op-content").value.trim();
  const link = document.getElementById("op-link").value.trim();
  const blob = [content, link].join(" ");
  if (!blob.trim()) return toast("先粘贴链接或输入内容", false);

  const setIfEmpty = (id, v) => {
    const el = document.getElementById(id);
    if (v && !String(el.value).trim()) { el.value = v; return true; }
    return false;
  };
  const filled = [];

  document.getElementById("op-date").value = guessDate(blob);

  const p = PLATFORMS.find((x) => new RegExp(x.k, "i").test(link));
  const hosp = blob.match(/[\u4e00-\u9fa5]{2,12}(?:妇女儿童医疗中心|儿童医院|妇幼保健院|医院|诊所)/);
  const doc = blob.match(/([\u4e00-\u9fa5]{2,4})(?:主任医师|副主任医师|主治医师|主任|医师|医生|大夫|教授|药师)/);
  const blogger = blob.match(/@([\u4e00-\u9fa5A-Za-z0-9_-]{2,20})/);

  if (doc) {
    setIfEmpty("op-source-type", "医生");
    filled.push("类型：医生");
    if (setIfEmpty("op-source-name", doc[1])) filled.push("姓名：" + doc[1]);
    const org = hosp ? hosp[0] : (p ? p.n : "");
    if (org && setIfEmpty("op-source-org", org)) filled.push("机构：" + org);
  } else if (blogger || p) {
    setIfEmpty("op-source-type", "自媒体博主");
    filled.push("类型：自媒体博主");
    if (blogger && setIfEmpty("op-source-name", blogger[1])) filled.push("账号：" + blogger[1]);
    const org = p ? p.n : (hosp ? hosp[0] : "");
    if (org && setIfEmpty("op-source-org", org)) filled.push("平台：" + org);
  } else if (hosp && setIfEmpty("op-source-org", hosp[0])) {
    filled.push("机构：" + hosp[0]);
  }

  const topicGuess = guessSymptom(blob) || (GUIDELINES.map((g) => g.keywords.find((k) => blob.includes(k))).find(Boolean) || "");
  if (topicGuess && setIfEmpty("op-topic", topicGuess)) filled.push("主题：" + topicGuess);

  toast(filled.length ? "已识别：" + filled.join(" · ") : "没有识别到新信息，请手动补充", filled.length > 0);
}

async function addOpinion() {
  const content = document.getElementById("op-content").value.trim();
  if (!content) return toast("请填写观点内容", false);
  const photoIds = [];
  for (let i = 0; i < pendingOpPhotos.length; i++) {
    const pid = uid() + "_op" + i;
    try {
      await putPhoto(pid, pendingOpPhotos[i]);
      photoIds.push(pid);
    } catch (e) {
      toast("截图保存失败", false);
    }
  }
  DB.opinions.push({
    id: uid(),
    link: document.getElementById("op-link").value.trim(),
    content,
    sourceName: document.getElementById("op-source-name").value.trim(),
    sourceOrg: document.getElementById("op-source-org").value.trim(),
    sourceType: document.getElementById("op-source-type").value,
    date: document.getElementById("op-date").value || fmtDate(new Date().toISOString()),
    topic: document.getElementById("op-topic").value.trim(),
    photoIds,
    createdAt: new Date().toISOString(),
  });
  pendingOpPhotos = [];
  saveDB();
  renderOpinions();
  toast("已保存 ✓ 点开条目内的「指南对比」查看对照表");
}

// ============================================================
// 教育观点库：自由输入 → 自动分类整理 + AI时代分龄教育大纲
// ============================================================
const EDU_CFG_KEY = "khc_edu_cfg";

function loadEduCfg() {
  try {
    return JSON.parse(localStorage.getItem(EDU_CFG_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveEduCfg(cfg) {
  localStorage.setItem(EDU_CFG_KEY, JSON.stringify(cfg));
}

function eduTagMeta(key) {
  return EDU_TAGS.find((t) => t.key === key) || { key, label: key, icon: "🏷️" };
}

function renderEdu() {
  const el = document.getElementById("page-edu");
  const list = DB.eduOpinions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // 分类统计
  const counts = {};
  list.forEach((o) => (o.tags.length ? o.tags : ["_none"]).forEach((k) => { counts[k] = (counts[k] || 0) + 1; }));
  const untagged = counts._none || 0;
  const topTag = Object.entries(counts).filter(([k]) => k !== "_none").sort((a, b) => b[1] - a[1])[0];
  const topMeta = topTag ? eduTagMeta(topTag[0]) : null;

  const groupCard = (meta, items) => `
    <div class="card">
      <div class="card-head">${meta.icon} ${esc(meta.label)}（${items.length}）</div>
      ${items.map((o) => `
        <div class="list-item">
          <div class="li-sub">${esc(o.text)}</div>
          <div class="li-sub muted">${fmtDate(o.date)}${o.note ? " · " + esc(o.note) : ""}${o.tags.length ? " · 标签：" + o.tags.map((k) => eduTagMeta(k).label).join("、") : " · 待归类"}</div>
          <div class="li-actions">
            <button class="btn-mini" onclick="editEduTags('${o.id}')">✏️ 改分类</button>
            <button class="btn-mini" onclick='deleteRecord("eduOpinions","${o.id}")'>删除</button>
          </div>
        </div>`).join("")}
    </div>`;

  el.innerHTML = `
    ${freeNoteCard("fn-edu")}

    <div class="card">
      <div class="card-head">💡 收集教育观点（自动整理归类）</div>
      <div class="hint">想到什么写什么：别人的方法、书里/视频里的观点、你自己的决定。保存时自动分类到下方主题组，一条观点可属于多个主题；分类随时可手动改。</div>
      <textarea id="edu-text" class="input" rows="3" placeholder="如：白羊座孩子学数学要做重复性题海战术，同类型题给10-100道且每道不一样 / 要关注孩子的感受、尊重孩子 / 睡前固定亲子共读20分钟…" oninput="updateEduPreview()"></textarea>
      <div id="edu-preview" class="hint hidden"></div>
      <button class="btn btn-primary" onclick="addEduOpinion()">💾 保存并自动分类</button>
    </div>

    <div class="card">
      <div class="card-head">📊 整理总结（共 ${list.length} 条观点）</div>
      ${topTag ? `<div class="li-sub">你关注最多的是：<b>${topMeta.icon} ${esc(topMeta.label)}</b>（${topTag[1]} 条）。各主题分布 ↓ 点击展开该组观点。</div>` : `<div class="hint">还没有教育观点，在上面输入第一条试试。</div>`}
      ${EDU_TAGS.filter((t) => counts[t.key]).length ? `<div class="chips">${EDU_TAGS.filter((t) => counts[t.key]).map((t) => `<span class="chip">${t.icon} ${esc(t.label)} · ${counts[t.key]}</span>`).join("")}</div>` : ""}
      ${untagged ? `<div class="hint">另有 ${untagged} 条待归类观点（列表底部），可点「改分类」手动归类。</div>` : ""}
    </div>

    ${EDU_TAGS.filter((t) => counts[t.key]).map((t) => groupCard(t, list.filter((o) => o.tags.includes(t.key)))).join("")}
    ${untagged ? groupCard({ icon: "❓", label: "待归类" }, list.filter((o) => !o.tags.length)) : ""}

    ${renderEduPolicy()}
  `;
}

function updateEduPreview() {
  const box = document.getElementById("edu-preview");
  if (!box) return;
  const text = document.getElementById("edu-text").value.trim();
  if (!text) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const keys = autoTagEdu(text);
  box.classList.remove("hidden");
  box.innerHTML = keys.length
    ? "🔍 自动归类预览：" + keys.map((k) => eduTagMeta(k).icon + " " + esc(eduTagMeta(k).label)).join("、")
    : "🔍 未匹配到已有分类，保存后将放入「待归类」，可点「改分类」手动归类。";
}

function addEduOpinion() {
  const text = document.getElementById("edu-text").value.trim();
  if (!text) return toast("先写点什么吧", false);
  const tags = autoTagEdu(text);
  DB.eduOpinions.push({
    id: uid(), text,
    date: fmtDate(new Date().toISOString()),
    tags, note: "",
    createdAt: new Date().toISOString(),
  });
  saveDB();
  renderEdu();
  toast(tags.length
    ? "已保存 ✓ 自动归入：" + tags.map((k) => eduTagMeta(k).label).join("、")
    : "已保存 ✓（待归类，可点「改分类」手动归类）");
}

function editEduTags(id) {
  const o = DB.eduOpinions.find((x) => x.id === id);
  if (!o) return;
  const cur = o.tags.map((k) => eduTagMeta(k).label).join("、");
  const input = window.prompt(
    "修改分类（用顿号/空格分隔；可选：\n" + EDU_TAGS.map((t) => t.label).join(" / ") + "；也可以输入自定义标签名）",
    cur
  );
  if (input === null) return;
  const labels = input.split(/[、,，\s]+/).map((s) => s.trim()).filter(Boolean);
  o.tags = labels.map((lb) => {
    const t = EDU_TAGS.find((t) => t.label === lb);
    return t ? t.key : lb;
  });
  saveDB();
  renderEdu();
  toast("分类已更新 ✓");
}

// ---------- AI时代分龄教育大纲（内置版可被远程 JSON 覆盖） ----------
function activeEduPolicy() {
  return (DB.eduPolicy && DB.eduPolicy.data && Array.isArray(DB.eduPolicy.data.stages) && DB.eduPolicy.data.stages.length)
    ? DB.eduPolicy.data
    : EDU_POLICY;
}

const EDU_POLICY_SOURCES = [
  "中共中央、国务院《教育强国建设规划纲要（2024—2035年）》（2025年1月印发）",
  "教育部基础教育教学指导委员会《中小学人工智能通识教育指南（2025年版）》《中小学生成式人工智能使用指南（2025年版）》（2025年5月发布）——分学段AI素养目标",
  "教育部办公厅《关于加强中小学人工智能教育的通知》（2024年）",
  "《义务教育课程方案和课程标准（2022年版）》——核心素养导向、跨学科主题学习、劳动/信息科技独立设课",
  "教育部《3-6岁儿童学习与发展指南》——五大领域：健康/语言/社会/科学/艺术",
  "《中华人民共和国家庭教育促进法》（2022年施行）——家长亲自养育、亲子陪伴的主体责任",
];

function renderEduPolicy() {
  const p = activeEduPolicy();
  const cfg = loadEduCfg();
  const sources = p.sources && p.sources.length ? p.sources : EDU_POLICY_SOURCES;
  return `
    <div class="card">
      <div class="card-head">🧭 AI时代分龄教育大纲 ${DB.eduPolicy ? '<span class="tag tag-season">远程更新版</span>' : '<span class="tag tag-observe">内置版</span>'} <span class="muted small">版本：${esc(p.updated || "")}</span></div>
      ${p.intro ? `<div class="hint">${esc(p.intro)}</div>` : ""}
      ${p.stages.map((st) => `
        <div class="food-item">
          <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')">
            <span>🎂 ${esc(st.age)} — ${esc(st.focus || "")}</span><span class="arrow">▾</span>
          </div>
          <div class="food-body">
            <div class="sub-head">培养要求</div>
            ${(st.items || []).map((i) => `<div class="mini-row">· ${esc(i)}</div>`).join("")}
            <div class="sub-head">AI时代素养要求</div>
            ${(st.aiItems || []).map((i) => `<div class="mini-row">· ${esc(i)}</div>`).join("")}
            <div class="sub-head">家庭做法</div>
            ${(st.homeTips || []).map((i) => `<div class="mini-row">· ${esc(i)}</div>`).join("")}
          </div>
        </div>`).join("")}
      <div class="sub-head">政策依据（现行）</div>
      ${sources.map((s) => `<div class="mini-row">· ${esc(s)}</div>`).join("")}
      <div class="hint">${esc(p.disclaimer || "以上按现行公开政策文件整理，具体以教育部最新文件为准。")}</div>
    </div>

    <div class="card">
      <div class="card-head">🔄 政策更新（国家政策变更后同步）</div>
      <div class="hint">政策文件变更后：把新版大纲 JSON（格式见《部署说明》）放到可访问的 URL（GitHub Gist raw / 仓库 raw 均可），填到这里点「检查政策更新」即可覆盖内置版；也可以直接让 AI 助手按最新政策生成 JSON。拉取结果会随云备份一起保存。</div>
      <input id="edu-policy-url" class="input" placeholder="政策 JSON 的 URL（https://raw.githubusercontent.com/…）" value="${esc(cfg.url || "")}">
      <div class="quick-links">
        <button class="btn" onclick="saveEduPolicyUrl()">💾 保存URL</button>
        <button class="btn btn-primary" onclick="checkEduPolicy()">🔄 检查政策更新</button>
        <button class="btn" onclick="searchEduPolicy()">🔍 联网查最新政策</button>
        ${DB.eduPolicy ? `<button class="btn" onclick="resetEduPolicy()">↺ 恢复内置版</button>` : ""}
      </div>
      ${cfg.lastCheck ? `<div class="hint">上次检查：${fmtDate(cfg.lastCheck)}</div>` : ""}
      ${DB.eduPolicy ? `<div class="hint">当前使用远程版：拉取于 ${fmtDate(DB.eduPolicy.fetchedAt)} · 版本 ${esc(DB.eduPolicy.data.updated || "未标注")}</div>` : ""}
    </div>`;
}

function saveEduPolicyUrl() {
  const url = document.getElementById("edu-policy-url").value.trim();
  if (!url) return toast("先填写 URL", false);
  const cfg = loadEduCfg();
  cfg.url = url;
  saveEduCfg(cfg);
  toast("URL 已保存 ✓");
}

async function checkEduPolicy() {
  const cfg = loadEduCfg();
  const url = document.getElementById("edu-policy-url").value.trim();
  if (!url) return toast("先填写政策 JSON 的 URL", false);
  cfg.url = url;
  cfg.lastCheck = new Date().toISOString();
  saveEduCfg(cfg);
  toast("正在拉取政策更新…");
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const payload = await res.json();
    if (!payload || payload.app !== "kid-edu-policy" || !Array.isArray(payload.stages) || !payload.stages.length) {
      throw new Error("格式不正确（需含 app:\"kid-edu-policy\" 和 stages 数组）");
    }
    DB.eduPolicy = { data: payload, fetchedAt: new Date().toISOString() };
    saveDB();
    renderEdu();
    toast("政策大纲已更新 ✓ 版本：" + (payload.updated || "未标注"));
  } catch (e) {
    toast("更新失败：" + e.message, false);
  }
}

function resetEduPolicy() {
  confirmModal("恢复为内置版大纲？远程版将不再使用。", () => {
    DB.eduPolicy = null;
    saveDB();
    renderEdu();
    toast("已恢复内置版");
  });
}

function searchEduPolicy() {
  window.open("https://www.bing.com/search?q=" + encodeURIComponent("教育部 最新 政策 中小学 人工智能教育 指南 通知 站内文件"), "_blank");
}

// ============================================================
// 运动与居家陪玩页
// ============================================================
function renderSport() {
  const el = document.getElementById("page-sport");
  const ageLabel = childAgeLabel(DB.profile.birth);
  const today = fmtDate(new Date().toISOString());
  const logs = DB.sportLog.slice().sort((a, b) => b.date.localeCompare(a.date));
  const week = logs.filter((l) => Date.now() - new Date(l.date + "T00:00:00").getTime() <= 7 * 86400000);
  const avgOutdoor = week.length ? Math.round(week.reduce((s, l) => s + (Number(l.outdoor) || 0), 0) / week.length) : 0;
  const avgBadge = avgOutdoor >= 120 ? '<span class="tag tag-season">达标 ✓</span>' : `<span class="tag tag-observe">还差 ${120 - Math.min(avgOutdoor, 120)} 分钟/天</span>`;
  const todayLog = logs.find((l) => l.date === today);

  el.innerHTML = `
    ${freeNoteCard("fn-sport")}

    <div class="hero card">
      <div class="hero-title">今日运动任务</div>
      <div class="hero-sub">${esc(ageLabel || "3-4岁")} · 户外 ≥120分钟 · 总活动 ≥180分钟 · 中高强度 ≥60分钟</div>
      <div class="hint">来源：《学龄前儿童（3~6岁）运动指南》(2018) + WHO 5岁以下儿童身体活动指南</div>
    </div>

    <div class="card">
      <div class="card-head">✅ 运动打卡 ${avgBadge} <span class="muted small">近7天户外平均 ${avgOutdoor} 分钟/天</span></div>
      <div class="row2">
        <select id="sport-outdoor" class="input">
          <option value="0">今日户外（分钟）</option>
          ${[15, 30, 45, 60, 75, 90, 105, 120, 150, 180].map((m) => `<option value="${m}" ${todayLog && todayLog.outdoor === m ? "selected" : ""}>户外 ${m} 分钟</option>`).join("")}
        </select>
        <select id="sport-indoor" class="input">
          <option value="0">今日室内消耗（分钟）</option>
          ${[15, 30, 45].map((m) => `<option value="${m}" ${todayLog && todayLog.indoor === m ? "selected" : ""}>室内 ${m} 分钟</option>`).join("")}
        </select>
      </div>
      <button class="btn btn-primary" onclick="addSportLog()">💾 保存今日打卡</button>
      ${logs.slice(0, 7).map((l) => `
        <div class="list-item">
          <div class="li-head"><b>${esc(l.date)}</b><span class="muted">户外 ${l.outdoor || 0} 分钟${l.indoor ? " · 室内 " + l.indoor + " 分钟" : ""}${l.outdoor >= 120 ? " ✓" : ""}</span></div>
          <div class="li-actions"><button class="btn-mini" onclick='deleteRecord("sportLog","${l.id}")'>删除</button></div>
        </div>`).join("")}
      ${logs.length ? "" : `<div class="hint">还没有打卡记录。按下面的每日模板玩完顺手记一笔。</div>`}
    </div>

    <div class="card">
      <div class="card-head">📅 一天怎么排（每日模板）</div>
      <div class="food-item">
        <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')"><span>🏫 幼儿园日</span><span class="arrow">▾</span></div>
        <div class="food-body"><p>${esc(SPORT_GUIDE.dailyPlan.kgDay)}</p></div>
      </div>
      <div class="food-item">
        <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')"><span>🏠 在家日（周末/请假）</span><span class="arrow">▾</span></div>
        <div class="food-body"><p>${esc(SPORT_GUIDE.dailyPlan.homeDay)}</p></div>
      </div>
      <div class="food-item">
        <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')"><span>❄️ 冬季时间调整</span><span class="arrow">▾</span></div>
        <div class="food-body"><p>${esc(SPORT_GUIDE.dailyPlan.winterAdjust)}</p></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">🤸 3-4岁大运动项目库（点开看怎么玩）</div>
      <div class="hint">按每日模板轮换着玩，同一天里「跑跳+骑行/攀爬+投掷」各来一样最理想。每项都标注了场地、工具和「省妈点」。</div>
      ${SPORT_GUIDE.items34.map((it) => `
        <div class="food-item">
          <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')">
            <span>${esc(it.icon)} ${esc(it.name)}</span><span class="arrow">▾</span>
          </div>
          <div class="food-body">
            <p><b>怎么玩：</b>${esc(it.how)}</p>
            <p><b>时长/强度：</b>${esc(it.duration)}</p>
            <p><b>场地：</b>${esc(it.venue)}</p>
            <p><b>工具：</b>${esc(it.tools)}</p>
            <p class="tip-child">省妈点：${esc(it.momSave)}</p>
            <p class="tip-adult">幼儿园衔接：${esc(it.kgLink)}</p>
          </div>
        </div>`).join("")}
    </div>

    <div class="card">
      <div class="card-head">🧥 北京户外策略（当季时冷时不冷怎么办）</div>
      <div class="sub-head">出门前看两样：气温大风 + AQI</div>
      ${SPORT_GUIDE.season.windows.map((w) => `<div class="mini-row">· ${esc(w)}</div>`).join("")}
      <div class="sub-head">穿衣与防护（洋葱三层法）</div>
      ${SPORT_GUIDE.season.dressing.map((d) => `<div class="mini-row">· ${esc(d)}</div>`).join("")}
      <div class="sub-head">四季轮换表</div>
      ${SPORT_GUIDE.season.seasons4.map((s) => `
        <div class="food-item">
          <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')"><span>${esc(s.name)}</span><span class="arrow">▾</span></div>
          <div class="food-body">
            <p><b>户外量：</b>${esc(s.outdoor)}</p>
            ${s.tips.map((t) => `<div class="mini-row">· ${esc(t)}</div>`).join("")}
          </div>
        </div>`).join("")}
    </div>

    <div class="card">
      <div class="card-head">⚡ 居家消耗游戏库（15-25分钟一个，妈妈准备≤5分钟）</div>
      <div class="hint">雾霾天/太冷/饭后睡前用。挑一个、布置不超过5分钟、玩完自己收。反复玩同一款完全没问题，孩子要的是重复。</div>
      ${INDOOR_ENERGY.map((g) => `
        <div class="food-item">
          <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')">
            <span>${esc(g.icon)} ${esc(g.name)}</span><span class="arrow">▾</span>
          </div>
          <div class="food-body">
            <p><b>怎么玩：</b>${esc(g.how)}</p>
            <p><b>时长：</b>${esc(g.duration)} · <b>准备：</b>${esc(g.prep)}</p>
            <p><b>工具：</b>${esc(g.tools)}</p>
            <p class="tip-child">省妈点：${esc(g.momSave)}</p>
          </div>
        </div>`).join("")}
    </div>

    <div class="card">
      <div class="card-head">🎨 居家陪玩清单（绘本/动画/玩具/画画之外还能玩什么）</div>
      <div class="hint">每项都标了「能独立玩多久」「省妈点」「和幼儿园节奏的对齐关系」。原则：你负责点火（5分钟），孩子负责展开。</div>
      ${PLAY_BANK.map((p) => `
        <div class="food-item">
          <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')">
            <span>${esc(p.icon)} ${esc(p.name)} <span class="tag tag-observe">${esc(p.cat)}</span></span><span class="arrow">▾</span>
          </div>
          <div class="food-body">
            ${p.plays.map((pl) => `<div class="mini-row">· ${esc(pl)}</div>`).join("")}
            <p><b>时长：</b>${esc(p.duration)}</p>
            <p class="tip-child">省妈点：${esc(p.momSave)}</p>
            <p class="tip-adult">幼儿园衔接：${esc(p.kgLink)}</p>
          </div>
        </div>`).join("")}
    </div>

    ${renderNapCenter()}

    <div class="card">
      <div class="card-head">📋 分龄速查：儿科医生运动选择表</div>
      <div class="hint">${esc(SPORT_GUIDE.doctorTable.source)} · ${esc(SPORT_GUIDE.doctorTable.keyPoint)}</div>
      ${SPORT_GUIDE.doctorTable.rows.map((r) => `
        <div class="list-item">
          <div class="li-head"><b>${esc(r.age)}</b><span class="muted">${esc(r.items)}</span></div>
          <div class="li-sub">${esc(r.note)}</div>
        </div>`).join("")}
      <div class="sub-head">7类运动优缺点速查</div>
      ${SPORT_GUIDE.sevenSports.map((s) => `
        <div class="food-item">
          <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')">
            <span>${esc(s.icon)} ${esc(s.name)}</span><span class="arrow">▾</span>
          </div>
          <div class="food-body">
            <p><b>✅ 优点：</b>${esc(s.pros)}</p>
            <p><b>⚠️ 缺点/误区：</b>${esc(s.cons)}</p>
            <p class="tip-child">3-4岁怎么用：${esc(s.fit)}</p>
          </div>
        </div>`).join("")}
    </div>
  `;
}

// ---------- 午睡难题中心 ----------
function renderNapCenter() {
  const n = NAP_CENTER;
  return `
    <div class="card">
      <div class="card-head">😴 午睡难题中心 <span class="muted small">版本 ${esc(n.updated)}</span></div>
      <div class="sub-head">先看这4条（放下焦虑）</div>
      ${n.truths.map((t) => `<div class="mini-row">· ${esc(t)}</div>`).join("")}

      <div class="food-item">
        <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')">
          <span>A · ${esc(n.planA.title)}</span><span class="arrow">▾</span>
        </div>
        <div class="food-body">${n.planA.steps.map((s) => `<div class="mini-row">· ${esc(s)}</div>`).join("")}</div>
      </div>
      <div class="food-item">
        <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')">
          <span>B · ${esc(n.planB.title)}</span><span class="arrow">▾</span>
        </div>
        <div class="food-body">${n.planB.steps.map((s) => `<div class="mini-row">· ${esc(s)}</div>`).join("")}</div>
      </div>

      <div class="food-item">
        <div class="food-head" onclick="this.nextElementSibling.classList.toggle('open')">
          <span>🚗 ${esc(n.carRules.title)}</span><span class="arrow">▾</span>
        </div>
        <div class="food-body">${n.carRules.rules.map((s) => `<div class="mini-row">· ${esc(s)}</div>`).join("")}</div>
      </div>

      <div class="sub-head">什么时候可以正式放弃午睡（满足即毕业）</div>
      ${n.giveUpSignals.map((s) => `<div class="mini-row">· ${esc(s)}</div>`).join("")}

      <div class="sub-head">周末与幼儿园同步</div>
      ${n.weekendSync.map((s) => `<div class="mini-row">· ${esc(s)}</div>`).join("")}
      <div class="hint">${esc(n.disclaimer)}</div>
    </div>

    <div class="card">
      <div class="card-head">🧭 今日午睡策略顾问</div>
      <div class="hint">根据昨晚和今天的情况，30秒给出当下最合适的策略。</div>
      <div class="row2">
        <select id="nap-lastnight" class="input">
          <option value="mid">昨晚入睡：20:30-21:30（平时）</option>
          <option value="early">昨晚入睡：20:30 前（早）</option>
          <option value="late">昨晚入睡：21:30 后（晚）</option>
        </select>
        <select id="nap-outdoor" class="input">
          <option value="some">今天上午户外：一般</option>
          <option value="full">今天上午户外：≥60分钟跑跳</option>
          <option value="none">今天上午户外：几乎没有</option>
        </select>
      </div>
      <select id="nap-noon" class="input">
        <option value="no">中午：还没睡/还没躺</option>
        <option value="slept">中午：已经睡着了</option>
      </select>
      <button class="btn btn-primary" onclick="napAdvisor()">🎯 给我今天的策略</button>
      <div id="nap-advice-result" class="hint hidden"></div>
    </div>`;
}

function napAdvisor() {
  const late = document.getElementById("nap-lastnight").value;
  const out = document.getElementById("nap-outdoor").value;
  const noon = document.getElementById("nap-noon").value;
  const box = document.getElementById("nap-advice-result");
  if (!box) return;
  const tips = [];
  if (noon === "slept") {
    tips.push("中午已睡着：核对时长。60-90分钟正常；超过90分钟或14:30后才醒，今晚入睡会推迟——今晚入睡时间顺延到20:30左右，别按平时时间硬哄。");
  } else {
    if (out === "full") tips.push("今天户外量够，睡眠压力足：现在就走午睡仪式（拉帘+白噪音+固定话术，12:45前上床），成功率最高。躺20分钟没睡意就果断转「安静时间」，别恋战——硬哄1小时比不睡更亏。");
    else if (out === "none") tips.push("今天户外几乎没有，午睡大概率失败。别硬哄：直接切「安静时间」（听故事/翻书，不出房间）。下午15:30后补一场高强度户外（追逐/骑行）把消耗补回来，晚上照常早睡。");
    else tips.push("户外量一般：可以试午睡但预期放低；13:15还没睡意就改安静时间，下午再补30分钟户外。");
  }
  if (late === "late") tips.push("昨晚睡晚了：今天中午哪怕睡20-30分钟的小睡也值（止困），但14:30前必须叫醒；今晚入睡提前到19:30-20:00还债。");
  if (late === "early") tips.push("昨晚睡得早：他今天的睡眠压力可能不足，午睡预期放低——安静时间就是合格答案，不必强求睡着。");
  tips.push("通用提醒：如果他放学坐车在16:30-17:30之间——记得「先在幼儿园旁边玩30-40分钟再上车」，这是17点车上睡着的根治法。");
  box.classList.remove("hidden");
  box.innerHTML = tips.map((t) => `<div class="mini-row">· ${esc(t)}</div>`).join("");
}

function addSportLog() {
  const outdoor = parseInt(document.getElementById("sport-outdoor").value, 10) || 0;
  const indoor = parseInt(document.getElementById("sport-indoor").value, 10) || 0;
  if (!outdoor && !indoor) return toast("先选今天的户外/室内运动时长", false);
  const date = fmtDate(new Date().toISOString());
  const exist = DB.sportLog.find((l) => l.date === date);
  if (exist) { exist.outdoor = outdoor; exist.indoor = indoor; }
  else DB.sportLog.push({ id: uid(), date, outdoor, indoor, createdAt: new Date().toISOString() });
  saveDB();
  renderSport();
  toast("今日运动打卡 ✓" + (outdoor >= 120 ? " 户外达标！" : ""));
}

// ---------- 启动 ----------
// 本地隐私配置：js/local-config.js（被 .gitignore 挡住、不上传 GitHub）。
// 里面的孩子基础信息在启动时填入档案；这些字段只存本机，云端备份不会包含。
(function applyLocalPrivacyConfig() {
  const p = window.PRIVATE_PROFILE;
  if (!p) return;
  let changed = false;
  for (const k of ["name", "gender", "birth", "height", "weight", "bloodType", "allergiesNote"]) {
    if (p[k] && !DB.profile[k]) { DB.profile[k] = p[k]; changed = true; }
  }
  if (changed) saveDB();
})();

document.addEventListener("DOMContentLoaded", () => {
  purgeTrash();
  // 内置示例教育观点：仅首次填入，演示自动分类效果，可删除
  if (!DB.eduSeeded) {
    EDU_SEEDS.forEach((s) => DB.eduOpinions.push({
      id: uid(), text: s.text,
      date: fmtDate(new Date().toISOString()),
      tags: autoTagEdu(s.text), note: s.note,
      createdAt: new Date().toISOString(),
    }));
    DB.eduSeeded = true;
    saveDB();
  }
  switchTab("home");
});
