// ============================================================
// storage.js — 本地存储层
// 结构化数据 → localStorage；照片（base64）→ IndexedDB
// 回收站：删除项进入 trash[]，保留30天，可恢复
// 备份：导出/导入 JSON 文件（含全部数据与照片）
// ============================================================

const DB_KEY = "khc_db_v1";
const PHOTO_DB = "khc_photos";
const TRASH_DAYS = 30;

const DEFAULT_DB = () => ({
  profile: {
    name: "",
    gender: "",
    birth: "2023-04",
    height: "",
    weight: "",
    bloodType: "",
    dietTier: "4-5", // 2-3 | 4-5 膳食宝塔档位
    allergiesNote: "",
  },
  diet: [],    // {id, type: 'like'|'dislike'|'avoid', name, reason, symptom, date, note}
  trials: [],  // {id, name, date, reactionTime, symptom, outcome: 'ok'|'mild'|'bad', note, createdAt}
  health: [],  // {id, date, symptom, medicine, dose, medStart, medEnd, note, photoIds: []}
  opinions: [], // {id, link, content, sourceName, sourceOrg, sourceType, date, topic, photoIds: [], createdAt}
  notes: [],   // {id, text, date} 自由补充区未识别归类的备忘便签
  eduOpinions: [], // {id, text, date, tags:[key], note, createdAt} 教育观点（自动分类）
  eduPolicy: null, // {data, updatedAt, fetchedAt} 远程拉取的教育政策大纲（覆盖内置版）
  eduSeeded: false, // 内置示例观点是否已填入
  sportLog: [],     // {id, date, outdoor, indoor, createdAt} 每日运动打卡
  recipeEdits: {},   // {内置食谱原名: 修改后的食谱对象} 内置食谱的本地修改
  customRecipes: [], // {id, name, time, season, ing, select, prep, steps, childTip, adultTip} 自建食谱
  trash: [],   // {id, type, item, deletedAt}
});

// ---------- localStorage DB ----------
function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return DEFAULT_DB();
    const db = JSON.parse(raw);
    const def = DEFAULT_DB();
    for (const k of Object.keys(def)) if (db[k] === undefined) db[k] = def[k];
    return db;
  } catch (e) {
    console.error("loadDB failed", e);
    return DEFAULT_DB();
  }
}

let DB = loadDB();

function saveDB() {
  purgeTrash();
  localStorage.setItem(DB_KEY, JSON.stringify(DB));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- 回收站 ----------
function trashItem(type, item) {
  DB.trash.push({ id: uid(), type, item, deletedAt: new Date().toISOString() });
  saveDB();
}

function purgeTrash() {
  const now = Date.now();
  const before = DB.trash.length;
  DB.trash = DB.trash.filter(
    (t) => now - new Date(t.deletedAt).getTime() < TRASH_DAYS * 86400000
  );
  if (DB.trash.length !== before) localStorage.setItem(DB_KEY, JSON.stringify(DB));
}

function restoreFromTrash(trashId) {
  const idx = DB.trash.findIndex((t) => t.id === trashId);
  if (idx === -1) return false;
  const t = DB.trash[idx];
  const listMap = { diet: "diet", trial: "trials", health: "health", opinion: "opinions", note: "notes", recipe: "customRecipes", edu: "eduOpinions", sport: "sportLog" };
  const listKey = listMap[t.type];
  if (listKey === "customRecipes" && t.item && t.item._original) {
    // 被修改的内置食谱 → 恢复到本地修改记录里
    if (!DB.recipeEdits) DB.recipeEdits = {};
    DB.recipeEdits[t.item._original] = t.item;
  } else if (listKey) {
    DB[listKey].push(t.item);
  }
  DB.trash.splice(idx, 1);
  saveDB();
  return true;
}

function hardDelete(trashId) {
  DB.trash = DB.trash.filter((t) => t.id !== trashId);
  saveDB();
}

// ---------- IndexedDB 照片 ----------
let photoDbPromise = null;
function openPhotoDB() {
  if (photoDbPromise) return photoDbPromise;
  photoDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("photos");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return photoDbPromise;
}

async function putPhoto(id, dataUrl) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").put(dataUrl, id);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

async function getPhoto(id) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("photos", "readonly").objectStore("photos").get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deletePhoto(id) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// 压缩照片为 dataURL（最长边1200px, 质量0.72）
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1200;
        let { width, height } = img;
        if (width > max || height > max) {
          const r = Math.min(max / width, max / height);
          width = Math.round(width * r);
          height = Math.round(height * r);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- 备份 导出/导入 ----------
async function exportBackup() {
  const photos = {};
  const db = await openPhotoDB();
  const allIds = [
    ...DB.health.flatMap((h) => h.photoIds || []),
    ...DB.opinions.flatMap((o) => o.photoIds || []),
  ];
  for (const id of allIds) {
    const d = await getPhoto(id);
    if (d) photos[id] = d;
  }
  const payload = {
    app: "kid-health-companion",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: DB,
    photos,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  a.download = `宝宝健康档案备份_${ds}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

async function importBackup(file) {
  const text = await file.text();
  const payload = JSON.parse(text);
  if (!payload || payload.app !== "kid-health-companion") {
    throw new Error("不是本应用的备份文件");
  }
  // 照片写入 IndexedDB
  if (payload.photos) {
    for (const [id, dataUrl] of Object.entries(payload.photos)) {
      await putPhoto(id, dataUrl);
    }
  }
  DB = payload.data;
  purgeTrash();
  localStorage.setItem(DB_KEY, JSON.stringify(DB));
}

// ---------- GitHub 云备份（私密 Gist）----------
// 隐私策略：DB.profile（姓名/生日/身高体重/血型/过敏说明）只存本机，
// 永不上传 GitHub，恢复时也永远保留本机版本。照片默认不上传。
const GH_CFG_KEY = "khc_gh_cfg";

function loadGhCfg() {
  try {
    return JSON.parse(localStorage.getItem(GH_CFG_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveGhCfg(cfg) {
  localStorage.setItem(GH_CFG_KEY, JSON.stringify(cfg));
}

// 构建云端备份内容（已隐去隐私信息）
function buildCloudPayload(includePhotos) {
  const data = JSON.parse(JSON.stringify(DB));
  delete data.profile; // 隐私字段不上传
  if (!includePhotos) {
    data.health = data.health.map((h) => ({ ...h, photoIds: [] }));
    data.opinions = data.opinions.map((o) => ({ ...o, photoIds: [] }));
  }
  return {
    app: "kid-health-companion",
    version: 1,
    cloud: true,
    exportedAt: new Date().toISOString(),
    data,
  };
}

function ghHeaders(token) {
  return {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

// 上传备份到私密 Gist（有 gistId 就更新，没有就创建）
async function ghPush(includePhotos) {
  const cfg = loadGhCfg();
  if (!cfg.token) throw new Error("请先填写 GitHub Token 并保存配置");
  const payload = buildCloudPayload(includePhotos);
  const body = JSON.stringify({
    description: "宝宝健康档案云备份（不含隐私信息）",
    public: false,
    files: { "backup.json": { content: JSON.stringify(payload) } },
  });
  const res = await fetch(
    cfg.gistId ? "https://api.github.com/gists/" + cfg.gistId : "https://api.github.com/gists",
    { method: cfg.gistId ? "PATCH" : "POST", headers: ghHeaders(cfg.token), body }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error("GitHub API " + res.status + "：" + t.slice(0, 160));
  }
  const j = await res.json();
  cfg.gistId = j.id;
  cfg.lastPush = new Date().toISOString();
  saveGhCfg(cfg);
  return cfg;
}

// 拉取云端备份内容
async function ghFetchRemote() {
  const cfg = loadGhCfg();
  if (!cfg.token || !cfg.gistId) throw new Error("请先填写 Token 并完成一次上传");
  const res = await fetch("https://api.github.com/gists/" + cfg.gistId, { headers: ghHeaders(cfg.token) });
  if (!res.ok) throw new Error("GitHub API " + res.status + "，检查 Token 是否有效");
  const j = await res.json();
  const f = j.files && j.files["backup.json"];
  if (!f) throw new Error("Gist 里没有 backup.json");
  return JSON.parse(f.content);
}

// 云端数据合并回本机：隐私字段（profile）永远保留本机版本；
// 本机 IndexedDB 里的照片引用（photoIds）合并保留，不因云端没照片而丢失
function applyCloudPayload(payload) {
  if (!payload || payload.app !== "kid-health-companion" || !payload.data) {
    throw new Error("云端备份格式不正确");
  }
  const localProfile = DB.profile;
  const localPhotoIds = {
    health: DB.health.map((h) => ({ id: h.id, photoIds: h.photoIds || [] })),
    opinions: DB.opinions.map((o) => ({ id: o.id, photoIds: o.photoIds || [] })),
  };
  DB = payload.data;
  DB.profile = localProfile;
  const def = DEFAULT_DB();
  for (const k of Object.keys(def)) if (DB[k] === undefined) DB[k] = def[k];
  const mergePhotos = (list, localList) =>
    list.map((x) => {
      const l = localList.find((y) => y.id === x.id);
      if (!l || !l.photoIds.length) return x;
      return { ...x, photoIds: Array.from(new Set([...(x.photoIds || []), ...l.photoIds])) };
    });
  DB.health = mergePhotos(DB.health, localPhotoIds.health);
  DB.opinions = mergePhotos(DB.opinions, localPhotoIds.opinions);
  purgeTrash();
  saveDB();
}

// ---------- 工具 ----------
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
}

function childAgeMonths(birth) {
  if (!birth) return null;
  const [y, m] = birth.split("-").map(Number);
  const now = new Date();
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
}

function childAgeLabel(birth) {
  const mo = childAgeMonths(birth);
  if (mo === null || isNaN(mo)) return "未设置";
  return `${Math.floor(mo / 12)}岁${mo % 12}个月`;
}
