/**
 * 스마트 보건실 통합 관리 시스템 - 메인 연동 스크립트 (script.js)
 */

const state = {
  currentView: "student",
  studentStep: 1,
  studentInfo: { grade: "2", class: "3", number: "15", name: "홍길동" },
  selectedType: null,
  selectedDetail: null,
  currentTicket: null,
  
  isLoggedIn: false,
  authToken: null,

  requests: [],
  serverStats: null,
  statsPeriod: "all",
  
  idleTimer: null,
  completionTimer: null,
  resetCountdownInterval: null,
  pollingTimer: null,
  
  isMockMode: false
};

const statsChartInstances = {
  dailyTrend: null,
  purposePie: null,
  hourlyBar: null
};

// ==========================================
// 0. GAS 웹 앱 통신 전용 래퍼 함수 (CORS & 통신 검증)
// ==========================================
async function fetchApi(action, payload = {}) {
  if (!navigator.onLine) {
    throw new Error("네트워크 연결이 끊어졌습니다. 인터넷 연결 상태를 확인해주세요.");
  }

  if (state.isMockMode) {
    throw new Error("현재 시뮬레이션 모드입니다. CONFIG.GAS_WEB_APP_URL 설정을 확인하세요.");
  }

  const requestPayload = JSON.stringify({ action, ...payload });

  try {
    const response = await fetch(CONFIG.GAS_WEB_APP_URL, {
      method: "POST",
      body: requestPayload
    });

    if (!response.ok) {
      throw new Error(`서버 통신 실패 (HTTP 상태 코드: ${response.status})`);
    }

    const resJson = await response.json();
    if (resJson.status === "ERROR") {
      throw new Error(resJson.message || "서버 처리 중 오류가 발생했습니다.");
    }

    return resJson;
  } catch (err) {
    console.error(`[API Error - ${action}]:`, err);
    throw err;
  }
}

// ==========================================
// 1. 앱 통합 컨트롤러 (App)
// ==========================================
const App = {
  init() {
    console.log("LABIT 프론트엔드 연동 시스템 초기화");
    
    window.addEventListener("online", App.updateNetworkStatus);
    window.addEventListener("offline", App.updateNetworkStatus);
    App.updateNetworkStatus();

    if (!CONFIG.GAS_WEB_APP_URL || CONFIG.GAS_WEB_APP_URL.trim() === "" || CONFIG.GAS_WEB_APP_URL.includes("YOUR_SCRIPT_ID")) {
      state.isMockMode = true;
      document.getElementById("mock-banner").classList.remove("hidden");
    }

    StudentFlow.renderVisitTypes();
    
    const savedToken = sessionStorage.getItem("health_admin_token");
    if (savedToken) {
      state.isLoggedIn = true;
      state.authToken = savedToken;
      App.updateAuthUI();
    }

    ["click", "touchstart", "mousemove", "keydown"].forEach(evt => {
      document.addEventListener(evt, StudentFlow.resetIdleTimer);
    });
  },

  updateNetworkStatus() {
    const isOffline = !navigator.onLine;
    const banner = document.getElementById("offline-banner");
    if (isOffline) {
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }
  },

  goHome() {
    if (state.currentView === "teacher") {
      TeacherFlow.stopPolling();
      state.currentView = "student";
      document.getElementById("view-teacher").classList.add("hidden");
      document.getElementById("view-student").classList.remove("hidden");
    }
    StudentFlow.resetToStep1();
  },

  toggleAuthModal() {
    if (state.isLoggedIn) {
      if (confirm("관리자 로그아웃 하시겠습니까?")) {
        TeacherFlow.stopPolling();
        state.isLoggedIn = false;
        state.authToken = null;
        sessionStorage.removeItem("health_admin_token");
        App.updateAuthUI();
        App.goHome();
      }
    } else {
      document.getElementById("modal-login").classList.remove("hidden");
    }
  },

  updateAuthUI() {
    const txt = document.getElementById("txt-header-auth");
    if (state.isLoggedIn) {
      txt.textContent = "관리자 로그아웃";
      if (state.currentView === "teacher") {
        TeacherFlow.renderDashboard();
      }
    } else {
      txt.textContent = "교사 로그인";
    }
  },

  showLoading(text = "서버와 데이터를 동기화하는 중입니다...") {
    document.getElementById("loading-text").textContent = text;
    document.getElementById("loading-overlay").classList.remove("hidden");
  },

  hideLoading() {
    document.getElementById("loading-overlay").classList.add("hidden");
  }
};

// ==========================================
// 2. 학생용 접수 파이프라인 (StudentFlow)
// ==========================================
const StudentFlow = {
  renderVisitTypes() {
    const container = document.getElementById("container-visit-types");
    container.innerHTML = "";

    Object.values(CONFIG.VISIT_TYPES).forEach(type => {
      const card = document.createElement("button");
      card.className = "p-5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-400 text-left transition space-y-2 touch-effect flex flex-col justify-between";
      card.onclick = () => StudentFlow.selectVisitType(type.id);
      
      card.innerHTML = `
        <div class="flex items-center space-x-3">
          <span class="text-3xl">${type.icon}</span>
          <span class="text-lg font-bold text-slate-900">${type.name}</span>
        </div>
        <p class="text-xs text-slate-500">${type.description}</p>
      `;
      container.appendChild(card);
    });
  },

  nextStep(stepNumber) {
    for (let i = 1; i <= 6; i++) {
      const el = document.getElementById(`student-step-${i}`);
      if (el) el.classList.add("hidden");
    }
    const targetEl = document.getElementById(`student-step-${stepNumber}`);
    if (targetEl) targetEl.classList.remove("hidden");

    state.studentStep = stepNumber;
    StudentFlow.resetIdleTimer();
  },

  handleInfoSubmit(e) {
    e.preventDefault();
    state.studentInfo = {
      grade: document.getElementById("input-grade").value,
      class: document.getElementById("input-class").value,
      number: document.getElementById("input-number").value,
      name: document.getElementById("input-name").value.trim()
    };
    StudentFlow.nextStep(3);
  },

  selectVisitType(typeId) {
    state.selectedType = CONFIG.VISIT_TYPES[typeId];
    state.selectedDetail = null;
    
    document.getElementById("txt-selected-type-name").textContent = `선택: ${state.selectedType.name}`;

    const container = document.getElementById("container-detail-options");
    container.innerHTML = "";

    state.selectedType.options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-700 hover:border-emerald-500 hover:bg-emerald-50 transition touch-effect text-center text-sm";
      btn.textContent = opt;
      btn.onclick = () => {
        Array.from(container.children).forEach(c => c.classList.remove("border-emerald-500", "bg-emerald-100", "text-emerald-900"));
        btn.classList.add("border-emerald-500", "bg-emerald-100", "text-emerald-900");
        state.selectedDetail = opt;
        
        const confirmBtn = document.getElementById("btn-to-confirm");
        confirmBtn.disabled = false;
        confirmBtn.classList.remove("bg-slate-300");
        confirmBtn.classList.add("bg-emerald-500", "hover:bg-emerald-600");
      };
      container.appendChild(btn);
    });

    const confirmBtn = document.getElementById("btn-to-confirm");
    confirmBtn.disabled = true;
    confirmBtn.classList.add("bg-slate-300");
    confirmBtn.classList.remove("bg-emerald-500", "hover:bg-emerald-600");

    StudentFlow.nextStep(4);
  },

  async submitFinalRequest() {
    App.showLoading("서버에서 대기 번호를 발급받는 중입니다...");

    const studentId = `${state.studentInfo.grade}${state.studentInfo.class.padStart(2, '0')}${state.studentInfo.number.padStart(2, '0')}`;
    
    try {
      const data = await fetchApi("submitRequest", {
        student_id: studentId,
        student_name: state.studentInfo.name,
        visit_type: state.selectedType.id,
        detail_option: state.selectedDetail
      });

      App.hideLoading();

      state.currentTicket = data.ticket;
      StudentFlow.showCompletionScreen(data.ticket, data.waiting_ahead || 0);

    } catch (err) {
      App.hideLoading();
      alert(`접수 신청에 실패했습니다.\n사유: ${err.message}`);
    }
  },

  showCompletionScreen(ticket, waitingAhead) {
    document.getElementById("txt-issued-ticket-no").textContent = ticket.queue_no;
    document.getElementById("txt-waiting-ahead-count").textContent = `${waitingAhead}명`;

    StudentFlow.nextStep(6);
    StudentFlow.startCompletionTimer();
  },

  async cancelCurrentRequest() {
    if (!state.currentTicket) return;

    if (confirm("정말로 방문 접수를 취소하시겠습니까?")) {
      App.showLoading("접수 취소를 서버에 반영 중입니다...");

      try {
        await fetchApi("cancelRequest", { request_id: state.currentTicket.id });
        App.hideLoading();
        alert("접수가 정상적으로 취소되었습니다.");
        StudentFlow.resetToStep1();
      } catch (err) {
        App.hideLoading();
        alert(`접수 취소 중 오류가 발생했습니다: ${err.message}`);
      }
    }
  },

  resetIdleTimer() {
    if (state.idleTimer) clearTimeout(state.idleTimer);

    if (state.studentStep >= 2 && state.studentStep <= 5) {
      state.idleTimer = setTimeout(() => {
        alert("30초간 입력이 없어 안전을 위해 첫 화면으로 초기화되었습니다.");
        StudentFlow.resetToStep1();
      }, CONFIG.TIMERS.IDLE_TIMEOUT_MS);
    }
  },

  startCompletionTimer() {
    if (state.completionTimer) clearTimeout(state.completionTimer);
    if (state.resetCountdownInterval) clearInterval(state.resetCountdownInterval);

    let timeLeft = 15;
    const txtCount = document.getElementById("txt-reset-countdown");
    if (txtCount) txtCount.textContent = timeLeft;

    state.resetCountdownInterval = setInterval(() => {
      timeLeft--;
      if (txtCount) txtCount.textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(state.resetCountdownInterval);
      }
    }, 1000);

    state.completionTimer = setTimeout(() => {
      StudentFlow.resetToStep1();
    }, CONFIG.TIMERS.COMPLETION_RESET_MS);
  },

  resetToStep1() {
    if (state.completionTimer) clearTimeout(state.completionTimer);
    if (state.resetCountdownInterval) clearInterval(state.resetCountdownInterval);
    if (state.idleTimer) clearTimeout(state.idleTimer);

    state.selectedType = null;
    state.selectedDetail = null;
    state.currentTicket = null;
    
    StudentFlow.nextStep(1);
  }
};

const origNextStep = StudentFlow.nextStep;
StudentFlow.nextStep = function(stepNumber) {
  if (stepNumber === 5) {
    const info = state.studentInfo;
    document.getElementById("summary-student").textContent = `${info.grade}학년 ${info.class}반 ${info.number}번 ${info.name}`;
    document.getElementById("summary-type").textContent = state.selectedType ? state.selectedType.name : "";
    document.getElementById("summary-detail").textContent = state.selectedDetail || "";
  }
  origNextStep.call(StudentFlow, stepNumber);
};

// ==========================================
// 3. 교사용 관리자 대시보드 & 통계 시각화 (TeacherFlow)
// ==========================================
const TeacherFlow = {
  async handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById("input-admin-password").value;

    App.showLoading("서버에서 관리자 권한을 인증 중입니다...");

    try {
      const data = await fetchApi("adminLogin", { password });
      App.hideLoading();

      state.isLoggedIn = true;
      state.authToken = data.token;
      sessionStorage.setItem("health_admin_token", data.token);

      document.getElementById("modal-login").classList.add("hidden");
      document.getElementById("input-admin-password").value = "";
      App.updateAuthUI();
      TeacherFlow.openDashboard();

    } catch (err) {
      App.hideLoading();
      alert(`로그인 실패: ${err.message}`);
    }
  },

  openDashboard() {
    state.currentView = "teacher";
    document.getElementById("view-student").classList.add("hidden");
    document.getElementById("view-teacher").classList.remove("hidden");
    
    TeacherFlow.fetchDashboardData();
    TeacherFlow.startPolling();
  },

  startPolling() {
    TeacherFlow.stopPolling();
    state.pollingTimer = setInterval(() => {
      if (state.currentView === "teacher" && state.isLoggedIn) {
        TeacherFlow.fetchDashboardData(true);
      }
    }, CONFIG.TIMERS.POLLING_INTERVAL_MS);
  },

  stopPolling() {
    if (state.pollingTimer) {
      clearInterval(state.pollingTimer);
      state.pollingTimer = null;
    }
  },

  async fetchDashboardData(isSilent = false) {
    if (!isSilent) App.showLoading("최신 방문 대기 목록을 불러오는 중입니다...");

    try {
      const data = await fetchApi("getAdminDashboardData", { token: state.authToken });
      if (!isSilent) App.hideLoading();

      state.requests = data.requests || [];
      TeacherFlow.renderDashboard();

      const activeTab = document.querySelector("#view-teacher button[id^='tab-btn-'].bg-slate-900");
      if (activeTab && activeTab.id === "tab-btn-kanban") TeacherFlow.renderKanban();
      if (activeTab && activeTab.id === "tab-btn-stats") TeacherFlow.fetchStatsData(true);

    } catch (err) {
      if (!isSilent) App.hideLoading();
      if (err.message.includes("유효하지 않거나 만료")) {
        alert("관리자 세션이 만료되어 다시 로그인해야 합니다.");
        state.isLoggedIn = false;
        sessionStorage.removeItem("health_admin_token");
        App.updateAuthUI();
        App.goHome();
      }
    }
  },

  switchTab(tabName) {
    ["dashboard", "kanban", "stats"].forEach(t => {
      const btn = document.getElementById(`tab-btn-${t}`);
      const tabContent = document.getElementById(`teacher-tab-${t}`);
      
      if (t === tabName) {
        btn.className = "px-4 py-2 rounded-xl text-sm font-bold bg-slate-900 text-white transition";
        tabContent.classList.remove("hidden");
      } else {
        btn.className = "px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition";
        tabContent.classList.add("hidden");
      }
    });

    if (tabName === "kanban") TeacherFlow.renderKanban();
    if (tabName === "stats") TeacherFlow.fetchStatsData();
  },

  renderDashboard() {
    const waiting = state.requests.filter(r => r.status === "WAITING");
    const inProgress = state.requests.filter(r => r.status === "IN_PROGRESS");
    const completed = state.requests.filter(r => r.status === "COMPLETED");

    document.getElementById("kpi-waiting").textContent = waiting.length;
    document.getElementById("kpi-in-progress").textContent = inProgress.length;
    document.getElementById("kpi-completed").textContent = completed.length;
    document.getElementById("kpi-total").textContent = state.requests.length;

    const tbody = document.getElementById("table-request-rows");
    tbody.innerHTML = "";

    if (state.requests.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400">접수된 내역이 없습니다.</td></tr>`;
      return;
    }

    state.requests.forEach(req => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50 transition";
      
      const typeMeta = CONFIG.VISIT_TYPES[req.visit_type] || { name: req.visit_type, badgeColor: "bg-slate-100 text-slate-800" };
      
      let statusBadge = "";
      if (req.status === "WAITING") statusBadge = `<span class="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-800">대기중</span>`;
      else if (req.status === "IN_PROGRESS") statusBadge = `<span class="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-800">상담중</span>`;
      else if (req.status === "COMPLETED") statusBadge = `<span class="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800">완료</span>`;
      else statusBadge = `<span class="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-600">취소</span>`;

      tr.innerHTML = `
        <td class="p-3 pl-4 text-xs text-slate-500">${req.timestamp.split(" ")[1] || req.timestamp}</td>
        <td class="p-3 font-extrabold text-slate-900">${req.queue_no}</td>
        <td class="p-3 font-semibold text-slate-800">${req.student_id} ${req.student_name}</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded text-xs font-bold ${typeMeta.badgeColor}">${typeMeta.name}</span></td>
        <td class="p-3 text-slate-600">${req.detail_option}</td>
        <td class="p-3">${statusBadge}</td>
        <td class="p-3 pr-4 text-right space-x-1">
          ${req.status === "WAITING" ? `<button onclick="TeacherFlow.updateStatus('${req.id}', 'IN_PROGRESS')" class="px-2.5 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700">상담 시작</button>` : ""}
          ${req.status === "IN_PROGRESS" ? `<button onclick="TeacherFlow.updateStatus('${req.id}', 'COMPLETED')" class="px-2.5 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700">완료 처리</button>` : ""}
          <button onclick="TeacherFlow.openDetailModal('${req.id}')" class="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200">상세</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  async updateStatus(reqId, newStatus) {
    App.showLoading("서버 Google Sheets에 상태 변경을 반영 중입니다...");

    try {
      await fetchApi("updateStatus", {
        token: state.authToken,
        request_id: reqId,
        status: newStatus
      });

      App.hideLoading();
      TeacherFlow.fetchDashboardData(true);

    } catch (err) {
      App.hideLoading();
      alert(`상태 변경 실패: ${err.message}`);
    }
  },

  renderKanban() {
    const container = document.getElementById("teacher-tab-kanban");
    container.innerHTML = "";

    Object.values(CONFIG.VISIT_TYPES).forEach(type => {
      const col = document.createElement("div");
      col.className = "bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3 flex flex-col";
      
      const typeReqs = state.requests.filter(r => r.visit_type === type.id && r.status !== "COMPLETED" && r.status !== "CANCELLED");

      col.innerHTML = `
        <div class="flex justify-between items-center border-b pb-2">
          <h4 class="font-bold text-slate-900 text-sm flex items-center space-x-1">
            <span>${type.icon}</span>
            <span>${type.name}</span>
          </h4>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full ${type.badgeColor}">${typeReqs.length}명</span>
        </div>
        <div class="space-y-2 flex-1 overflow-y-auto max-h-[500px]">
          ${typeReqs.length === 0 ? `<p class="text-xs text-slate-400 text-center py-6">대기자 없음</p>` : ""}
          ${typeReqs.map(r => `
            <div class="p-3 rounded-xl border border-slate-100 bg-slate-50 space-y-2">
              <div class="flex justify-between items-center">
                <span class="font-black text-slate-900 text-base">${r.queue_no}</span>
                <span class="text-xs text-slate-500">${r.student_name}</span>
              </div>
              <p class="text-xs text-slate-600 font-medium">${r.detail_option}</p>
              <div class="pt-1 flex justify-end">
                <button onclick="TeacherFlow.updateStatus('${r.id}', 'COMPLETED')" class="px-2 py-1 text-xs bg-emerald-500 text-white font-bold rounded-md">완료</button>
              </div>
            </div>
          `).join("")}
        </div>
      `;
      container.appendChild(col);
    });
  },

  // ==========================================
  // 4. 통계 데이터 집계 및 Chart.js 시각화
  // ==========================================
  async fetchStatsData(isSilent = false) {
    if (!isSilent) App.showLoading("서버 통계 집계 데이터를 계산 중입니다...");

    try {
      const data = await fetchApi("getStats", { token: state.authToken });
      if (!isSilent) App.hideLoading();

      state.serverStats = data.calculated_stats;
      TeacherFlow.renderStats();

    } catch (err) {
      if (!isSilent) App.hideLoading();
      console.error("통계 데이터 수신 실패:", err);
    }
  },

  changeStatsPeriod(period) {
    state.statsPeriod = period;
    TeacherFlow.renderStats();
  },

  renderStats() {
    const period = state.statsPeriod;
    const now = new Date();
    
    const filteredRequests = state.requests.filter(r => {
      if (!r.timestamp) return false;
      const reqDate = new Date(r.timestamp);
      if (isNaN(reqDate.getTime())) return false;

      if (period === "today") {
        return reqDate.toDateString() === now.toDateString();
      } else if (period === "7days") {
        const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return reqDate >= past7;
      } else if (period === "30days") {
        const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return reqDate >= past30;
      }
      return true;
    });

    const totalCount = filteredRequests.length;
    const completedCount = filteredRequests.filter(r => r.status === "COMPLETED").length;
    const activeCount = filteredRequests.filter(r => r.status === "WAITING" || r.status === "IN_PROGRESS").length;
    const cancelledCount = filteredRequests.filter(r => r.status === "CANCELLED").length;
    const validRequests = filteredRequests.filter(r => r.status !== "CANCELLED");

    const emptyAlert = document.getElementById("stats-empty-alert");
    const chartsContainer = document.getElementById("stats-charts-container");

    if (totalCount === 0) {
      emptyAlert.classList.remove("hidden");
      chartsContainer.classList.add("hidden");

      document.getElementById("stat-card-total").textContent = "0건";
      document.getElementById("stat-card-completed").textContent = "0건";
      document.getElementById("stat-card-completed-pct").textContent = "전체 중 0%";
      document.getElementById("stat-card-active").textContent = "0건";
      document.getElementById("stat-card-cancelled").textContent = "0건";
      document.getElementById("stat-card-top-purpose").textContent = "데이터 없음";
      document.getElementById("stat-card-top-purpose-detail").textContent = "접수 수집 필요";
      document.getElementById("stat-card-period-compare").textContent = "기록 없음";
      return;
    }

    emptyAlert.classList.add("hidden");
    chartsContainer.classList.remove("hidden");

    document.getElementById("stat-card-total").textContent = `${totalCount}건`;
    document.getElementById("stat-card-completed").textContent = `${completedCount}건`;
    
    const completedPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    document.getElementById("stat-card-completed-pct").textContent = `전체 중 ${completedPct}% 완료`;
    document.getElementById("stat-card-active").textContent = `${activeCount}건`;
    document.getElementById("stat-card-cancelled").textContent = `${cancelledCount}건`;

    const purposeCounts = {};
    Object.values(CONFIG.VISIT_TYPES).forEach(t => purposeCounts[t.id] = 0);
    
    validRequests.forEach(r => {
      if (purposeCounts[r.visit_type] !== undefined) purposeCounts[r.visit_type]++;
    });

    let topTypeId = null;
    let maxCnt = -1;
    Object.entries(purposeCounts).forEach(([tid, cnt]) => {
      if (cnt > maxCnt && cnt > 0) {
        maxCnt = cnt;
        topTypeId = tid;
      }
    });

    if (topTypeId && CONFIG.VISIT_TYPES[topTypeId]) {
      const topMeta = CONFIG.VISIT_TYPES[topTypeId];
      const pct = validRequests.length > 0 ? Math.round((maxCnt / validRequests.length) * 100) : 0;
      document.getElementById("stat-card-top-purpose").textContent = `${topMeta.icon} ${topMeta.name}`;
      document.getElementById("stat-card-top-purpose-detail").textContent = `${maxCnt}건 (${pct}%) 점유`;
    } else {
      document.getElementById("stat-card-top-purpose").textContent = "접수 없음";
      document.getElementById("stat-card-top-purpose-detail").textContent = "유효 접수 부재";
    }

    if (period === "today") {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yestCnt = state.requests.filter(r => r.timestamp && new Date(r.timestamp).toDateString() === yesterday.toDateString()).length;
      const diff = totalCount - yestCnt;
      document.getElementById("stat-card-period-compare").textContent = diff >= 0 ? `▲ +${diff}건` : `▼ ${diff}건`;
      document.getElementById("stat-card-period-compare-sub").textContent = `어제(${yestCnt}건) 대비`;
    } else {
      document.getElementById("stat-card-period-compare").textContent = `${validRequests.length}건 유효`;
      document.getElementById("stat-card-period-compare-sub").textContent = `취소 ${cancelledCount}건 제외`;
    }

    TeacherFlow.renderDailyTrendChart(validRequests);
    TeacherFlow.renderPurposePieChart(purposeCounts, validRequests.length);
    TeacherFlow.renderHourlyBarChart(validRequests);
  },

  renderDailyTrendChart(requests) {
    const dailyMap = {};
    requests.forEach(r => {
      if (r.timestamp) {
        const dateStr = r.timestamp.split(" ")[0];
        dailyMap[dateStr] = (dailyMap[dateStr] || 0) + 1;
      }
    });

    const labels = Object.keys(dailyMap).sort();
    const dataValues = labels.map(l => dailyMap[l]);

    const ctx = document.getElementById("chart-daily-trend").getContext("2d");
    if (statsChartInstances.dailyTrend) statsChartInstances.dailyTrend.destroy();

    statsChartInstances.dailyTrend = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels.length > 0 ? labels : ["오늘"],
        datasets: [{
          label: "접수 건수",
          data: dataValues.length > 0 ? dataValues : [0],
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          borderWidth: 3,
          fill: true,
          tension: 0.3,
          pointBackgroundColor: "#059669",
          pointRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  },

  renderPurposePieChart(purposeCounts, validTotal) {
    const labels = Object.values(CONFIG.VISIT_TYPES).map(t => t.name);
    const dataValues = Object.keys(CONFIG.VISIT_TYPES).map(tid => purposeCounts[tid] || 0);

    const ctx = document.getElementById("chart-purpose-pie").getContext("2d");
    if (statsChartInstances.purposePie) statsChartInstances.purposePie.destroy();

    statsChartInstances.purposePie = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{
          data: dataValues,
          backgroundColor: [
            "#10b981",
            "#3b82f6",
            "#f97316",
            "#a855f7",
            "#ef4444"
          ],
          borderWidth: 2,
          borderColor: "#ffffff"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 10 } } }
        }
      }
    });
  },

  renderHourlyBarChart(requests) {
    const hourlyMap = {};
    for (let h = 9; h <= 16; h++) {
      hourlyMap[`${String(h).padStart(2, '0')}:00`] = 0;
    }

    requests.forEach(r => {
      if (r.timestamp) {
        const hour = new Date(r.timestamp).getHours();
        const slot = `${String(hour).padStart(2, '0')}:00`;
        if (hourlyMap[slot] !== undefined) hourlyMap[slot]++;
      }
    });

    const labels = Object.keys(hourlyMap);
    const dataValues = Object.values(hourlyMap);

    const ctx = document.getElementById("chart-hourly-bar").getContext("2d");
    if (statsChartInstances.hourlyBar) statsChartInstances.hourlyBar.destroy();

    statsChartInstances.hourlyBar = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "방문 건수",
          data: dataValues,
          backgroundColor: "#3b82f6",
          borderRadius: 8,
          hoverBackgroundColor: "#2563eb"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  },

  openDetailModal(reqId) {
    const req = state.requests.find(r => r.id === reqId);
    if (!req) return;

    const body = document.getElementById("container-detail-body");
    body.innerHTML = `
      <div class="bg-slate-50 p-4 rounded-xl space-y-2 text-xs">
        <div><span class="text-slate-400">접수 ID:</span> <span class="font-mono">${req.id}</span></div>
        <div><span class="text-slate-400">대기 번호:</span> <span class="font-bold text-emerald-600">${req.queue_no}</span></div>
        <div><span class="text-slate-400">학생:</span> <span class="font-bold">${req.student_id} ${req.student_name}</span></div>
        <div><span class="text-slate-400">방문 목적:</span> <span>${req.type_name || req.visit_type}</span></div>
        <div><span class="text-slate-400">세부 선택:</span> <span>${req.detail_option}</span></div>
        <div><span class="text-slate-400">접수 시간:</span> <span>${req.timestamp}</span></div>
      </div>
      <div class="flex space-x-2 pt-2">
        <button onclick="TeacherFlow.updateStatus('${req.id}', 'COMPLETED'); TeacherFlow.closeDetailModal();" class="w-full py-3 bg-emerald-500 text-white font-bold rounded-xl text-xs">완료 처리</button>
      </div>
    `;

    document.getElementById("modal-detail").classList.remove("hidden");
  },

  closeDetailModal() {
    document.getElementById("modal-detail").classList.add("hidden");
  },

  refreshData() {
    TeacherFlow.fetchDashboardData();
  }
};

// ==========================================
// 5. 사용자 매뉴얼 모달 (ManualModal)
// ==========================================
const ManualModal = {
  open() {
    document.getElementById("modal-manual").classList.remove("hidden");
  },
  close() {
    document.getElementById("modal-manual").classList.add("hidden");
  },
  switchTab(tabNum) {
    for (let i = 1; i <= 5; i++) {
      const btn = document.getElementById(`manual-tab-${i}`);
      const content = document.getElementById(`manual-content-${i}`);
      
      if (i === tabNum) {
        btn.className = "py-3 px-3.5 border-b-2 border-emerald-500 text-emerald-600 font-bold whitespace-nowrap transition";
        content.classList.remove("hidden");
      } else {
        btn.className = "py-3 px-3.5 border-b-2 border-transparent text-slate-500 hover:text-slate-900 font-bold whitespace-nowrap transition";
        content.classList.add("hidden");
      }
    }
  }
};

document.addEventListener("DOMContentLoaded", App.init);
