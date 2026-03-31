const grab_id = (id) => document.getElementById(id);

const SUBJECT_FILES = {
  compsci: "data/temp/computing_courses.json",
  engineering: "data/temp/engineering_courses.json",
  business: "data/temp/business_courses.json",
  law: "data/temp/law_courses.json",
  other: "data/temp/other_courses.json",
};

const SUBJECT_LABELS = {
  compsci: "Computing",
  engineering: "Engineering",
  business: "Business",
  law: "Law",
  other: "Other Courses",
};

let universitiesById = new Map(); 
let currentCourses = [];          
let filteredCourses = [];         
let activeSubject = "compsci";    
let currentPage = 1;
const itemsPerPage = 12;

const DEBOUNCE_MS = 200;
let debounceTimer = null;

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

function normalize(s) {
  return (s || "").toLowerCase().trim();
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
}

function fuzzyIncludes(text, term) {
  return text.split(/\s+/).some(word => editDistance(word, term) <= 1);
}

function scoreMatch(course, terms) {
  if (terms.length === 0) return 1;

  const uni = universitiesById.get(String(course.PUBUKPRN));
  const title = normalize(course.TITLE || "");
  const uniName = normalize(uni?.LEGAL_NAME || "");
  const uniAddr = normalize(uni?.PROVADDRESS || "");
  const studyMode = course.KISMODE === "1" ? "full-time" : course.KISMODE === "2" ? "part-time" : "";

  let score = 0;

  for (const term of terms) {
    if (title.includes(term))     { score += 10; continue; }
    if (uniName.includes(term))   { score += 6;  continue; }
    if (uniAddr.includes(term))   { score += 4;  continue; }
    if (studyMode.includes(term)) { score += 3;  continue; }

    if (term.length >= 4) {
      if (fuzzyIncludes(title, term))   { score += 5; continue; }
      if (fuzzyIncludes(uniName, term)) { score += 3; continue; }
    }

    return 0;
  }

  return score;
}

function search() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const input = grab_id("search-input");
    const query = input ? normalize(input.value) : "";
    const terms = query.split(/\s+/).filter(t => t.length > 0);

    const scored = currentCourses
      .map(c => ({ course: c, score: scoreMatch(c, terms) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    filteredCourses = scored.map(({ course }) => course);
    currentPage = 1;
    updateDisplay();
  }, DEBOUNCE_MS);
}

function updateDisplay() {
  const totalPages = Math.ceil(filteredCourses.length / itemsPerPage);
  if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const pageItems = filteredCourses.slice(start, end);

  render(pageItems);
  renderPaginationControls(totalPages);
}

function render(results) {
  const el = grab_id("results-grid"); 
  if (!el) return;
  el.innerHTML = ""; 
  
  const countEl = grab_id("results-count");
  if (countEl) {
    countEl.textContent = `Showing ${filteredCourses.length.toLocaleString()} courses matching your search`;
  }

  const frag = document.createDocumentFragment();

  for (const r of results) {
    const uni = universitiesById.get(String(r.PUBUKPRN));
    const displayTitle = r.TITLE || "Unknown Subject"; 
    const displayUni = uni ? uni.LEGAL_NAME : 'University Code: ' + r.PUBUKPRN;

    const card = document.createElement("div");
    card.className = "card p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all cursor-pointer group";

    card.innerHTML = `
        <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-indigo-600 transition-colors">
            ${displayTitle} 
        </h3>
        <p class="text-slate-500 dark:text-slate-400 text-sm mb-4">
            ${displayUni}
        </p>
        <div class="flex items-center justify-between">
            <span class="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase">
                ${SUBJECT_LABELS[activeSubject] || "General"}
            </span>
            <span class="text-xs font-bold text-slate-400 italic">
                View Details
            </span>
        </div>
    `;

    card.onclick = () => openModal(r, uni);
    frag.appendChild(card);
  }
  el.appendChild(frag); 
}

function openModal(course, uni) {
    const modal = grab_id("course-modal");
    const content = grab_id("modal-content");
    const displayUni = uni ? uni.LEGAL_NAME : 'University Code: ' + course.PUBUKPRN;
    
    const foundationText = (course.FOUNDATION === "1" || course.FOUNDATION === "2") ? "Yes" : "No";

    let studyMode = "Unknown";
    if (course.KISMODE === "1") studyMode = "Full-time";
    else if (course.KISMODE === "2") studyMode = "Part-time";
    else if (course.KISMODE === "3") studyMode = "Both";

    const similar = currentCourses
        .filter(c => c.TITLE === course.TITLE && c.PUBUKPRN !== course.PUBUKPRN)
        .slice(0, 3);

    let similarHtml = "";
    if (similar.length > 0) {
        similarHtml = `
            <div class="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                <h4 class="text-sm font-bold text-slate-900 dark:text-white mb-4 italic">Available at other universities:</h4>
                <div class="space-y-3">
                    ${similar.map((s, index) => {
                        const otherUni = universitiesById.get(String(s.PUBUKPRN));
                        const otherUniName = otherUni ? otherUni.LEGAL_NAME : "Other University";
                        
                        return `
                        <div onclick="event.stopPropagation(); closeModal(); setTimeout(() => openModal(${JSON.stringify(s).replace(/"/g, '&quot;')}, universitiesById.get('${s.PUBUKPRN}')), 100)" 
                             class="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer transition-all border border-transparent hover:border-indigo-200 group">
                            <span class="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                                ${index + 1}
                            </span>
                            <div class="flex-1">
                                <p class="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 transition-colors">
                                    ${otherUniName}
                                </p>
                            </div>
                            <i data-lucide="chevron-right" class="w-4 h-4 text-slate-300 group-hover:text-indigo-500"></i>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        `;
    }

    content.innerHTML = `
        <div class="space-y-6">
            <div>
                <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                    ${SUBJECT_LABELS[activeSubject]}
                </span>
                <h2 id="modal-title" class="text-3xl font-extrabold text-slate-900 dark:text-white mt-2 leading-tight">
                    ${course.TITLE}
                </h2>
                <p class="text-lg text-slate-500 dark:text-slate-400 mt-2">${displayUni}</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-center">
                    <p class="text-xs text-slate-400 font-bold uppercase mb-1">Foundation Year</p>
                    <p class="text-slate-900 dark:text-white font-medium">${foundationText}</p>
                </div>
                <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-center">
                    <p class="text-xs text-slate-400 font-bold uppercase mb-1">Study Mode</p>
                    <p class="text-slate-900 dark:text-white font-medium">${studyMode}</p>
                </div>
                <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-center">
                    <p class="text-xs text-slate-400 font-bold uppercase mb-1">Course ID</p>
                    <p class="text-slate-900 dark:text-white font-medium">${course.KISCOURSEID || "N/A"}</p>
                </div>
                 <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-center">
                    <p class="text-xs text-slate-400 font-bold uppercase mb-1">Provider Code (UKPRN)</p>
                    <p class="text-slate-900 dark:text-white font-medium">${course.PUBUKPRN}</p>
                </div>
            </div>

            <div class="pt-4 flex flex-col sm:flex-row gap-3">
                <button onclick="window.open('${course.ASSURL !== "#" ? course.ASSURL : `https://www.google.com/search?q=${encodeURIComponent(course.TITLE + ' at ' + displayUni)}`}', '_blank')" 
                    class="flex-1 px-6 py-4 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20">
                    Visit Official Course Website
                    <i data-lucide="external-link" class="w-4 h-4"></i>
                </button>
            </div>

            ${similarHtml}
        </div>
    `;

    modal.classList.remove("hidden");
    document.body.style.overflow = 'hidden';
    if (window.lucide) window.lucide.createIcons();
}

function closeModal() {
    grab_id("course-modal").classList.add("hidden");
    document.body.style.overflow = 'auto';
}

window.onkeydown = (e) => { if (e.key === "Escape") closeModal(); };

function renderPaginationControls(totalPages) {
  let container = grab_id("pagination-controls");
  if (!container) {
    container = document.createElement("div");
    container.id = "pagination-controls";
    const grid = grab_id("results-grid");
    if (grid) grid.after(container);
  }

  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  const baseChipClass = "whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-all border-none outline-none cursor-pointer";
  const inactiveClass = "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-indigo-600 hover:text-white";
  const disabledClass = "bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 opacity-40 cursor-not-allowed";

  const options = Array.from({ length: totalPages }, (_, i) =>
    `<option value="${i + 1}" ${i + 1 === currentPage ? 'selected' : ''}>Page ${i + 1}</option>`
  ).join('');

  container.className = "flex justify-center items-center gap-3 mt-12 mb-8";
  container.innerHTML = `
    <button onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}
      class="${baseChipClass} ${currentPage === 1 ? disabledClass : inactiveClass}">
      Previous
    </button>
    <select onchange="jumpToPage(this.value)"
      class="px-3 py-2 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-none outline-none cursor-pointer hover:bg-indigo-600 hover:text-white transition-all appearance-none text-center">
      ${options}
    </select>
    <button onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''}
      class="${baseChipClass} ${currentPage === totalPages ? disabledClass : inactiveClass}">
      Next
    </button>
  `;
}

window.changePage = (offset) => {
  currentPage += offset;
  updateDisplay();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.jumpToPage = (page) => {
  currentPage = parseInt(page, 10);
  updateDisplay();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

async function setSubject(subjectKey) {
  activeSubject = subjectKey;
  try {
    currentCourses = await loadJSON(SUBJECT_FILES[subjectKey]);
    search(); 
  } catch (e) {
    console.error("Subject load error:", e);
  }
}

async function init() {
  try {
    const uniResponse = await loadJSON("data/temp/institution.json");
    const uniList = uniResponse[2].data;
    universitiesById = new Map(uniList.map(u => [String(u.PUBUKPRN), u]));

    grab_id("search-input").addEventListener("input", search);

    const filters = grab_id("category-filters");
    if (filters) {
      filters.innerHTML = "";
      Object.keys(SUBJECT_LABELS).forEach(key => {
          const btn = document.createElement("button");
          btn.className = `chip whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-all ${key === activeSubject ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-indigo-500 hover:text-white'}`;
          btn.textContent = SUBJECT_LABELS[key];
          btn.onclick = () => {
              document.querySelectorAll('.chip').forEach(c => {
                c.classList.remove('bg-indigo-600', 'text-white', 'shadow-lg', 'shadow-indigo-500/30');
                c.classList.add('bg-slate-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-400', 'hover:bg-indigo-500', 'hover:text-white');
              });
          btn.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-400', 'hover:bg-indigo-500', 'hover:text-white');
          btn.classList.add('bg-indigo-600', 'text-white', 'shadow-lg', 'shadow-indigo-500/30');
          setSubject(key);
          };
          filters.appendChild(btn);
      });
    }

    await setSubject("compsci");
    if (window.lucide) window.lucide.createIcons();
    
  } catch (err) {
    console.error("Critical Init Error:", err);
  }
}

init();