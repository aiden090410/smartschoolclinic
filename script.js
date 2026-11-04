/**
 * 스마트 보건실 통합 관리 시스템 - 메인 스크립트 (script.js)
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
  
  idleTimer: null,
  completionTimer: null,
  resetCountdownInterval: null,
  
  isMockMode: false
};

// ==========================================
// 1. 앱 통합 컨트롤러 (App)
// ==========================================
const App = {
  init() {
    console.log("스마트 보건실 프론트엔드 시스템 초기화");
    
    window.addEventListener("online", App.updateNetworkStatus);
    window.addEventListener("offline", App.updateNetworkStatus);
    App.updateNetworkStatus();

    if (!CONFIG.GAS_WEB_APP_URL || CONFIG.GAS_WEB_APP_URL.trim() === "" || CONFIG.GAS_WEB_APP_URL.includes("YOUR_SCRIPT_ID")) {
      state.isMockMode = true;
      document.getElementById("mock-banner").classList.remove("hidden");
      state.requests = [...CONFIG.MOCK_DATA.requests];
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
      state.currentView = "student";
      document.getElementById("view-teacher").classList.add("hidden");
      document.getElementById("view-student").classList.remove("hidden");
    }
    StudentFlow.resetToStep1();
  },

  toggleAuthModal() {
    if (state.isLoggedIn) {
      if (confirm("로그아웃 하시겠습니까?")) {
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

  showLoading(text = "서버와 통신 중입니다...") {
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

  submitFinalRequest() {
    if (!navigator.onLine) {
      alert("인터넷 연결이 끊겨 접수를 처리할 수 없습니다.");
      return;
    }

    App.showLoading("대기 번호를 발급받는 중입니다...");

    const payload = {
      action: "submitRequest",
      student_id: `${state.studentInfo.grade}${state.studentInfo.class.padStart(2, '0')}${state.studentInfo.number.padStart(2, '0')}`,
      student_name: state.studentInfo.name,
      visit_type: state.selectedType.id,
      detail_option: state.selectedDetail
    };

    if (state.isMockMode) {
      setTimeout(() => {
        App.hideLoading();
        const prefix = state.selectedType.prefix;
        const newNo = `${prefix}-0${state.requests.length + 1}`;
        const mockTicket = {
          id: `REQ-${Date.now()}`,
          timestamp: new Date().toLocaleString(),
          student_id: payload.student_id,
          student_name: payload.student_name,
          visit_type: payload.visit_type,
          type_name: state.selectedType.name,
          detail_option: payload.detail_option,
          queue_no: newNo,
          status: "WAITING"
        };

        state.requests.unshift(mockTicket);
        state.currentTicket = mockTicket;
        StudentFlow.showCompletionScreen(mockTicket);
      }, 700);
    } else {
      fetch(CONFIG.GAS_WEB_APP_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP 상태: ${res.status}`);
        return res.json();
      })
      .then(data => {
        App.hideLoading();
        if (data.status === "SUCCESS") {
          state.currentTicket = data.ticket;
          StudentFlow.showCompletionScreen(data.ticket);
        } else {
          alert(`접수 실패: ${data.message}`);
        }
      })
      .catch(err => {
        App.hideLoading();
        console.error("접수 등록 통신 오류:", err);
        alert(`서버 통신 오류가 발생했습니다. (상세 내용: ${err.message})`);
      });
    }
  },

  showCompletionScreen(ticket) {
    document.getElementById("txt-issued-ticket-no").textContent = ticket.queue_no;
    const waitingAhead = state.requests.filter(r => r.visit_type === ticket.visit_type && r.status === "WAITING" && r.id !== ticket.id).length;
    document.getElementById("txt-waiting-ahead-count").textContent = `${waitingAhead}명`;

    StudentFlow.nextStep(6);
    StudentFlow.startCompletionTimer();
  },

  cancelCurrentRequest() {
    if (!state.currentTicket) return;

    if (confirm("정말로 접수를 취소하시겠습니까?")) {
      state.requests = state.requests.filter(r => r.id !== state.currentTicket.id);
      alert("접수가 취소되었습니다.");
      StudentFlow.resetToStep1();
    }
  },

  resetIdleTimer() {
    if (state.idleTimer) clearTimeout(state.idleTimer);

    if (state.studentStep >= 2 && state.studentStep <= 5) {
      state.idleTimer = setTimeout(() => {
        alert("30초간 입력이 없어 첫 화면으로 초기화되었습니다.");
        StudentFlow.resetToStep1();
      }, CONFIG.TIMERS.IDLE_TIMEOUT_MS);
    }
  },

  startCompletionTimer() {
    if (state.completionTimer) clearTimeout(state.completionTimer);
    if (state.resetCountdownInterval) clearInterval(state.resetCountdownInterval);

    let timeLeft = 15;
    const txtCount = document.getElementById("txt-reset-countdown");
    txtCount.textContent = timeLeft;

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
// 3. 교사용 관리자 대시보드 (TeacherFlow)
// ==========================================
const TeacherFlow = {
  handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById("input-admin-password").value;

    App.showLoading("관리자 권한을 검증 중입니다...");

    if (state.isMockMode) {
      setTimeout(() => {
        App.hideLoading();
        state.isLoggedIn = true;
        state.authToken = "MOCK-SESSION-TOKEN-1234";
        sessionStorage.setItem("health_admin_token", state.authToken);
        document.getElementById("modal-login").classList.add("hidden");
        App.updateAuthUI();
        TeacherFlow.openDashboard();
      }, 500);
    } else {
      fetch(CONFIG.GAS_WEB_APP_URL, {
        method: "POST",
        body: JSON.stringify({ action: "adminLogin", password: password })
      })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP 응답 에러: ${res.status}`);
        return res.json();
      })
      .then(data => {
        App.hideLoading();
        if (data.status === "SUCCESS") {
          state.isLoggedIn = true;
          state.authToken = data.token;
          sessionStorage.setItem("health_admin_token", data.token);
          document.getElementById("modal-login").classList.add("hidden");
          App.updateAuthUI();
          TeacherFlow.openDashboard();
        } else {
          alert(`로그인 실패: ${data.message}`);
        }
      })
      .catch(err => {
        App.hideLoading();
        console.error("로그인 연동 오류:", err);
        alert(`관리자 로그인 통신 에러가 발생했습니다. (상세 내용: ${err.message})`);
      });
    }
  },

  openDashboard() {
    state.currentView = "teacher";
    document.getElementById("view-student").classList.add("hidden");
    document.getElementById("view-teacher").classList.remove("hidden");
    TeacherFlow.renderDashboard();
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
    if (tabName === "stats") TeacherFlow.renderStats();
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

  updateStatus(reqId, newStatus) {
    const req = state.requests.find(r => r.id === reqId);
    if (!req) return;

    req.status = newStatus;
    TeacherFlow.renderDashboard();

    if (!state.isMockMode) {
      fetch(CONFIG.GAS_WEB_APP_URL, {
        method: "POST",
        body: JSON.stringify({ action: "updateStatus", token: state.authToken, request_id: reqId, status: newStatus })
      });
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

  renderStats() {
    const containerType = document.getElementById("chart-type-ratios");
    const containerHourly = document.getElementById("chart-hourly-peaks");
    const total = state.requests.length || 1;

    // 1. 방문 유형별 비율 시각화
    containerType.innerHTML = "";
    Object.values(CONFIG.VISIT_TYPES).forEach(type => {
      const cnt = state.requests.filter(r => r.visit_type === type.id).length;
      const pct = Math.round((cnt / total) * 100);

      const row = document.createElement("div");
      row.className = "space-y-1";
      row.innerHTML = `
        <div class="flex justify-between text-xs font-bold">
          <span>${type.name}</span>
          <span>${cnt}건 (${pct}%)</span>
        </div>
        <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
          <div class="bg-emerald-500 h-full" style="width: ${pct}%"></div>
        </div>
      `;
      containerType.appendChild(row);
    });

    // 2. 시간대별 접수 피크 분포 시각화
    const hourlyCounts = {};
    for (let h = 9; h <= 16; h++) {
      const slot = `${String(h).padStart(2, '0')}:00`;
      hourlyCounts[slot] = 0;
    }

    state.requests.forEach(r => {
      if (r.timestamp) {
        const hour = new Date(r.timestamp).getHours();
        const slot = `${String(hour).padStart(2, '0')}:00`;
        if (hourlyCounts[slot] !== undefined) {
          hourlyCounts[slot]++;
        }
      }
    });

    const maxCount = Math.max(...Object.values(hourlyCounts), 1);

    containerHourly.innerHTML = "";
    Object.entries(hourlyCounts).forEach(([slot, cnt]) => {
      const pct = Math.round((cnt / maxCount) * 100);
      const row = document.createElement("div");
      row.className = "space-y-1";
      row.innerHTML = `
        <div class="flex justify-between text-xs font-bold">
          <span>${slot} 시간대</span>
          <span>${cnt}건</span>
        </div>
        <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
          <div class="bg-blue-500 h-full" style="width: ${pct}%"></div>
        </div>
      `;
      containerHourly.appendChild(row);
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
    TeacherFlow.renderDashboard();
  }
};

// ==========================================
// 4. 사용자 매뉴얼 모달 (ManualModal)
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
        btn.className = "py-3 px-4 border-b-2 border-emerald-500 text-emerald-600 font-bold whitespace-nowrap";
        content.classList.remove("hidden");
      } else {
        btn.className = "py-3 px-4 border-b-2 border-transparent text-slate-500 hover:text-slate-900 font-bold whitespace-nowrap";
        content.classList.add("hidden");
      }
    }
  }
};

document.addEventListener("DOMContentLoaded", App.init);
