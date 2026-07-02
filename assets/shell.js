/* ============================================================
   UXW 검수 아카이브 — 공통 Shell 스크립트
   - 데이터 로드(fetch → 실패 시 임베드 시드 폴백)
   - 좌측 LNB 렌더링
   ※ 로컬 file:// 로 직접 열면 브라우저 보안정책상 fetch가 막혀
     아래 SEED 데이터로 자동 폴백됩니다. (data/*.json 수정 즉시 반영을
     원하면 폴더에서 `python3 -m http.server` 실행 후 localhost로 여세요.)
   ============================================================ */

/* ── 현재 페이지가 pages/ 하위인지 여부에 따라 루트 경로 결정
   file:// 더블클릭 및 localhost 모두 대응 ── */
const _ROOT = (() => {
  const p = window.location.pathname.replace(/\\/g, '/');
  return p.includes('/pages/') ? '../' : '';
})();

/* ── 임베드 시드(폴백) : data/docs.json 과 동일하게 유지 ── */
const SEED_DOCS = {
  docs: [
    { id: "재고보관내역_0623", title: "재고보관내역", date: "2026-06-23", status: "검토중", planner: "이재호", changeCount: 12, file: "pages/재고보관내역_0623.html" },
    { id: "반품상품관리_0618", title: "반품상품관리", date: "2026-06-18", status: "검토중", planner: "류교빈", changeCount: 12, file: "pages/반품상품관리_0618.html" }
  ]
};

window.UXW_OFFLINE = false;

async function loadJSON(path, fallback) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error("not ok");
    return await res.json();
  } catch (e) {
    window.UXW_OFFLINE = true;
    return fallback;
  }
}

async function loadDocs() {
  const data = await loadJSON(_ROOT + "data/docs.json", SEED_DOCS);
  return (data && data.docs) ? data.docs : [];
}

async function loadGlossary() {
  const data = await loadJSON(_ROOT + "data/glossary.json", null);
  return data && data.terms ? data.terms : null;
}

const STATUSES = ["검토중", "반영완료", "반영거부", "대기중"];
const STATUS_ICON = { "검토중": "🟡", "반영완료": "🟢", "반영거부": "🔴", "대기중": "⚪" };

/* ── 날짜 그룹핑 (오늘 기준) ── */
function monthGroup(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (diff <= 0) return "이번 달";
  if (diff === 1) return "지난달";
  return "이전";
}

/* ── LNB 렌더 ──
   opts: { active: 'glossary' | docId, docs: [...] }
*/
function renderLNB(opts) {
  const docs = (opts.docs || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));

  let docHtml = "";
  docs.forEach(d => {
    const act = opts.active === d.id ? " active" : "";
    const ymd = d.date.slice(2).replace(/-/g, '.');
    docHtml += `<a class="lnb-item${act}" href="${_ROOT}pages/${d.id}.html">
      <span class="lnb-item-label">${escapeHtml(d.title)}</span>
      <span class="lnb-item-date">${ymd}</span>
      <span class="status-dot ${d.status}" title="${d.status}"></span>
    </a>`;
  });
  if (!docHtml) docHtml = `<div style="padding:8px 18px;font-size:11px;color:rgba(0,0,0,0.32)">문서 없음</div>`;

  const glossaryAct = opts.active === "glossary" ? " active" : "";
  const flowAct = opts.active === "flow" ? " active" : "";

  const lnbEl = document.getElementById("lnb");
  const isCollapsed = lnbEl.classList.contains("collapsed");

  lnbEl.innerHTML = `
    <div class="lnb-head">
      <div class="lnb-head-top">
        <a class="lnb-title" href="${_ROOT}index.html">
          <span class="lnb-title-mark">📋</span><span class="lnb-title-text">UXW 검수 아카이브</span>
        </a>
        <button class="lnb-toggle" id="lnbToggle" title="${isCollapsed ? "메뉴 열기" : "메뉴 닫기"}">${isCollapsed ? "▶" : "◀"}</button>
      </div>
      <!-- 새검수건 CTA 제거: 검수 기능은 작성자 전용. create.html 직접 URL로 접속 -->
    </div>
    <div class="lnb-scroll">
      <div class="lnb-section-label">검수 문서</div>
      ${docHtml}
      <div style="border-top:1px solid rgba(0,0,0,0.07);margin:4px 0 2px"></div>
      <a class="lnb-item${glossaryAct}" href="${_ROOT}glossary.html">
        <span class="lnb-item-icon">📖</span><span class="lnb-item-label">용어집</span>
      </a>
      <a class="lnb-item${flowAct}" href="${_ROOT}flow.html">
        <span class="lnb-item-icon">🗺️</span><span class="lnb-item-label">UX Flow</span>
      </a>
    </div>`;

  document.getElementById("lnbToggle").addEventListener("click", function () {
    lnbEl.classList.toggle("collapsed");
    const collapsed = lnbEl.classList.contains("collapsed");
    this.textContent = collapsed ? "▶" : "◀";
    this.title = collapsed ? "메뉴 열기" : "메뉴 닫기";
    try { localStorage.setItem("uxw_lnb_collapsed", collapsed ? "1" : "0"); } catch(e) {}
  });

  // 저장된 상태 복원 (최초 렌더 시에만)
  if (!lnbEl._lnbInited) {
    lnbEl._lnbInited = true;
    try {
      if (localStorage.getItem("uxw_lnb_collapsed") === "1") {
        lnbEl.classList.add("collapsed");
        const btn = document.getElementById("lnbToggle");
        if (btn) { btn.textContent = "▶"; btn.title = "메뉴 열기"; }
      }
    } catch(e) {}
  }
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* JSON 다운로드 헬퍼 */
function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ============================================================
   IndexedDB — 첨부파일 저장소
   DB: uxw-archive  /  Store: attachments
   Record: { id(auto), docId, name, type, size, data(ArrayBuffer), addedAt }
   ============================================================ */
const _IDB_NAME = "uxw-archive";
const _IDB_VER  = 1;

function _openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_IDB_NAME, _IDB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("attachments")) {
        const store = db.createObjectStore("attachments", { keyPath: "id", autoIncrement: true });
        store.createIndex("docId", "docId", { unique: false });
      }
    };
    req.onsuccess  = (e) => resolve(e.target.result);
    req.onerror    = (e) => reject(e.target.error);
  });
}

async function saveAttachment(docId, file) {
  const db   = await _openDB();
  const data = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction("attachments", "readwrite");
    const store = tx.objectStore("attachments");
    const rec   = { docId, name: file.name, type: file.type || "", size: file.size, data, addedAt: new Date().toISOString() };
    const req   = store.add(rec);
    req.onsuccess = (e) => resolve({ id: e.target.result, name: rec.name, type: rec.type, size: rec.size, addedAt: rec.addedAt });
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function getAttachments(docId) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction("attachments", "readonly");
    const idx = tx.objectStore("attachments").index("docId");
    const req = idx.getAll(docId);
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function getAttachment(id) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction("attachments", "readonly");
    const req = tx.objectStore("attachments").get(id);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function deleteAttachment(id) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction("attachments", "readwrite");
    const req = tx.objectStore("attachments").delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function deleteAllAttachments(docId) {
  const list = await getAttachments(docId);
  await Promise.all(list.map(r => deleteAttachment(r.id)));
}

async function downloadAttachmentById(id) {
  const rec = await getAttachment(id);
  if (!rec) return;
  const blob = new Blob([rec.data], { type: rec.type || "application/octet-stream" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = rec.name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileIcon(name, mime) {
  if (mime && mime.startsWith("image/")) return "🖼";
  const ext = (name || "").split(".").pop().toLowerCase();
  if (["xlsx","xls","csv"].includes(ext)) return "📊";
  if (ext === "pdf") return "📄";
  if (["pptx","ppt"].includes(ext)) return "📑";
  if (["doc","docx"].includes(ext)) return "📝";
  return "📎";
}

function formatBytes(n) {
  if (n < 1024)        return n + " B";
  if (n < 1024*1024)   return (n/1024).toFixed(1) + " KB";
  return (n/1024/1024).toFixed(1) + " MB";
}
