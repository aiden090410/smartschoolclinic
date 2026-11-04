/**
 * 스마트 보건실 통합 관리 시스템 - 전역 설정 파일 (config.js)
 */
const CONFIG = {
  // Google Apps Script 웹 앱 배포 URL (4단계 백엔드 구현 후 이곳에 주소 입력)
  GAS_WEB_APP_URL: "https://script.google.com/macros/s/AKfycbwXxdjvXCN0f0yxH53AHZDjL7guXIEJNUX_RSeIjnui4147CW3HHOIibqVaG7NQU1aO/exec", 

  // 타이머 설정 (밀리초 단위)
  TIMERS: {
    IDLE_TIMEOUT_MS: 30000,      // 학생 접수 중 부재 시 자동 초기화 (30초)
    COMPLETION_RESET_MS: 15000,  // 접수 완료 화면 유지 시간 (15초)
    POLLING_INTERVAL_MS: 10000   // 대시보드 실시간 갱신 주기 (10초)
  },

  // 5가지 방문 유형 정의 및 데이터 구조
  VISIT_TYPES: {
    TYPE_1: {
      id: "TYPE_1",
      name: "간단한 물품 요청",
      prefix: "A",
      icon: "🩹",
      badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-300",
      description: "밴드, 소독약, 렌즈 세척액 등 간이 물품 수령",
      options: ["밴드/반창고", "소독약품", "렌즈 세척액", "인공눈물", "기타 물품"]
    },
    TYPE_2: {
      id: "TYPE_2",
      name: "휴식 요청",
      prefix: "B",
      icon: "🛏️",
      badgeColor: "bg-blue-100 text-blue-800 border-blue-300",
      description: "보건실 침상 이용 및 안정을 위한 휴식",
      options: ["발열/오한", "체함/복통", "두통/어지러움", "극심한 피로", "기타 휴식"]
    },
    TYPE_3: {
      id: "TYPE_3",
      name: "상처 및 외상 관련",
      prefix: "C",
      icon: "🩹",
      badgeColor: "bg-orange-100 text-orange-800 border-orange-300",
      description: "찰과상, 베임, 타박상 처치 및 보건교사 확인",
      options: ["긁힘/찰과상", "베임/열상", "타박상/멍", "화상", "처치 상태 확인"]
    },
    TYPE_4: {
      id: "TYPE_4",
      name: "통증 및 신체 이상",
      prefix: "D",
      icon: "🩺",
      badgeColor: "bg-purple-100 text-purple-800 border-purple-300",
      description: "신체 이상 통증 상담 및 조치",
      options: ["두통", "생리통", "복통/소화불량", "근육통/관절통", "눈/귀/목 이상"]
    },
    TYPE_5: {
      id: "TYPE_5",
      name: "기타 및 직접 확인 필요",
      prefix: "E",
      icon: "🚨",
      badgeColor: "bg-red-100 text-red-800 border-red-300",
      description: "위 카테고리에 해당하지 않거나 즉시 보건교사 확인 건",
      options: ["기타 사유", "교사 직접 확인 필요", "긴급 건강 상담"]
    }
  },

  // 백엔드 미연동 시 화면을 시연할 수 있는 가상 시뮬레이션 데이터
  MOCK_DATA: {
    requests: [
      {
        id: "REQ-20261104-001",
        timestamp: "2026-11-04 13:45:10",
        student_id: "20315",
        student_name: "김철수",
        visit_type: "TYPE_2",
        type_name: "휴식 요청",
        detail_option: "두통/어지러움",
        queue_no: "B-01",
        status: "IN_PROGRESS",
        updated_at: "2026-11-04 13:50:00"
      },
      {
        id: "REQ-20261104-002",
        timestamp: "2026-11-04 13:52:00",
        student_id: "10104",
        student_name: "이영희",
        visit_type: "TYPE_1",
        type_name: "간단한 물품 요청",
        detail_option: "밴드/반창고",
        queue_no: "A-01",
        status: "WAITING",
        updated_at: "2026-11-04 13:52:00"
      },
      {
        id: "REQ-20261104-003",
        timestamp: "2026-11-04 13:58:30",
        student_id: "30512",
        student_name: "박민수",
        visit_type: "TYPE_5",
        type_name: "기타 및 직접 확인 필요",
        detail_option: "긴급 건강 상담",
        queue_no: "E-01",
        status: "WAITING",
        updated_at: "2026-11-04 13:58:30"
      }
    ],
    stats: {
      totalToday: 28,
      waitingCount: 2,
      inProgressCount: 1,
      completedCount: 25
    }
  }
};
