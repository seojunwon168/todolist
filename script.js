// ==========================================
// 1. Firebase Initialization & Auth state
// ==========================================
let db;
let auth;

function showLoadingScreen() {
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) loadingScreen.style.display = 'flex';
}

function hideLoadingScreen() {
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) loadingScreen.style.display = 'none';
}

if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
  try {
    auth = firebase.auth();
    db = firebase.firestore();
    
    // 방화벽/백신 통신 차단 우회 및 영구 오프라인 저장소 설정
    db.settings({
      experimentalForceLongPolling: true,
      cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
    });
    db.enablePersistence().catch(function(err) {
      console.warn('[Firestore] 오프라인 저장소 활성화 실패:', err);
    });
    
    // 모바일 리디렉트 로그인 성공 결과 수신 (안전 처리)
    auth.getRedirectResult().then(result => {
      if (result && result.user) {
        console.log('[Auth] 리디렉트 로그인 성공:', result.user.email);
      }
    }).catch(err => {
      console.warn('[Auth] getRedirectResult 에러 (무시 가능):', err);
    });
    
    auth.onAuthStateChanged(async user => {
      try {
        if (isSigningUp) return; 
        
        showLoadingScreen();
        
        if (user && user.uid) {
          currentUser = user;
          const loginContainer = document.getElementById('loginContainer');
          const appContainer = document.getElementById('appContainer');
          
          if (loginContainer) loginContainer.style.display = 'none';
          
          // 순서 보장: 데이터 로딩 및 렌더링이 완전히 끝날 때까지 대기
          updateUserDebugInfo();
          await setupFirestoreListeners(user.uid);
          
          if (appContainer) appContainer.style.display = 'block';
          hideLoadingScreen(); // 데이터 가져온 직후 로딩 화면 제거!
        } else {
          currentUser = null;
          const loginContainer = document.getElementById('loginContainer');
          const appContainer = document.getElementById('appContainer');
          const loginView = document.getElementById('loginView');
          const signupView = document.getElementById('signupView');
          
          if (appContainer) appContainer.style.display = 'none';
          if (loginContainer) loginContainer.style.display = 'flex';
          if (loginView) loginView.style.display = 'block';
          if (signupView) signupView.style.display = 'none';
          
          clearLocalData();
          updateUserDebugInfo();
          hideLoadingScreen();
        }
      } catch (authErr) {
        console.error('[Auth] onAuthStateChanged 실행 예외 방어:', authErr);
        hideLoadingScreen();
      }
    });
  } catch (initErr) {
    console.error('[Firebase] 초기화 중 오류 발생 (UI 멈춤 방지):', initErr);
    hideLoadingScreen();
  }
}

// ==========================================
// 2. Global State & DOM Elements
// ==========================================
let currentUser = null;
let folders = [];
let todos = [];
let activeFolderId = 'inbox';
let filterState = 'all';

let unsubscribeFolders = null;
let unsubscribeTodos = null;
let isSigningUp = false;

// DOM Elements
const authForm = document.getElementById('authForm');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const showSignupBtn = document.getElementById('goToSignupBtn');

const signupForm = document.getElementById('signupForm');
const signupEmailInput = document.getElementById('signupEmailInput');
const signupPasswordInput = document.getElementById('signupPasswordInput');
const signupPasswordConfirm = document.getElementById('signupPasswordConfirmInput');
const showLoginBtn = document.getElementById('goToLoginBtn');

const logoutBtn = document.getElementById('logoutBtn');
const folderList = document.getElementById('folderList');
const addFolderBtn = document.getElementById('addFolderBtn');
const todoList = document.getElementById('todoList');
const emptyState = document.getElementById('emptyState');
const todoForm = document.getElementById('todoForm');
const todoInput = document.getElementById('todoInput');

const typeToggleBtn = document.getElementById('typeToggleBtn');
const filterBtns = document.querySelectorAll('.filter-btn');

// (수정) 정확한 ID 바인딩
const currentFolderTitle = document.getElementById('currentFolderTitle');

// Trash
const trashToggle = document.getElementById('trashToggle');
const trashBody = document.getElementById('trashBody');
const trashChevron = document.getElementById('trashChevron');
const trashList = document.getElementById('trashList');
const emptyTrashBtn = document.getElementById('emptyTrashBtn');
const trashCount = document.getElementById('trashCount');
const trashEmptyState = document.getElementById('trashEmptyState');

// Counters
const statsText = document.getElementById('statsText');
const badgeAll = document.getElementById('badgeAll');
const badgeActive = document.getElementById('badgeActive');
const badgeCompleted = document.getElementById('badgeCompleted');

// Select Mode & Bulk Bar
let isSelectMode = false;
let selectedTodoIds = new Set();

const toggleSelectModeBtn = document.getElementById('toggleSelectModeBtn');
const bulkBar = document.getElementById('bulkBar');
const bulkCompleteBtn = document.getElementById('bulkCompleteBtn');
const bulkActiveBtn = document.getElementById('bulkActiveBtn');
const resetAllCompletedBtn = document.getElementById('resetAllCompletedBtn');

let currentTodoType = 'task';

// ==========================================
// 2.5 Mobile Navigation & Independent UI Events
// ==========================================
try {
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  mobileMenuBtn?.addEventListener('click', () => {
    sidebar?.classList.add('open');
    sidebarOverlay?.classList.add('show');
  });

  sidebarOverlay?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    sidebarOverlay?.classList.remove('show');
  });
} catch (uiErr) {
  console.warn('모바일 메뉴 이벤트 독립 바인딩 경고:', uiErr);
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  sidebar?.classList.remove('open');
  sidebarOverlay?.classList.remove('show');
}

// ==========================================
// 3. Authentication (Login & Signup)
// ==========================================

// 비밀번호 보기/숨기기 토글 유틸리티
const pwToggleBtns = document.querySelectorAll('.pw-toggle-btn');
pwToggleBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const input = btn.previousElementSibling;
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = '숨기기';
    } else {
      input.type = 'password';
      btn.textContent = '보기';
    }
  });
});

showSignupBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('signupView').style.display = 'block';
});

showLoginBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('signupView').style.display = 'none';
  document.getElementById('loginView').style.display = 'block';
});

authForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  
  if (!email || !password) return;
  
  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      emailInput.value = '';
      passwordInput.value = '';
    })
    .catch(error => {
      alert(`로그인 실패: ${error.message}`);
    });
});

signupForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = signupEmailInput.value.trim();
  const password = signupPasswordInput.value.trim();
  const confirmPassword = signupPasswordConfirm.value.trim();
  
  if (!email || !password) return;
  
  if (password !== confirmPassword) {
    alert("비밀번호가 일치하지 않습니다.");
    return;
  }
  
  isSigningUp = true; 
  
  auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      currentUser = userCredential.user;
      
      signupEmailInput.value = '';
      signupPasswordInput.value = '';
      signupPasswordConfirm.value = '';
      
      document.getElementById('loginContainer').style.display = 'none';
      document.getElementById('appContainer').style.display = 'block';
      
      setupFirestoreListeners(currentUser.uid);
      isSigningUp = false;
    })
    .catch(error => {
      isSigningUp = false;
      alert(`회원가입 실패: ${error.message}`);
    });
});

logoutBtn?.addEventListener('click', () => {
  auth.signOut().catch(error => alert(`로그아웃 에러: ${error.message}`));
});

// ==========================================
// 4. Firestore Database Fetching (덮어쓰기 없음 로직 유지)
// ==========================================

function getFoldersRef() {
  if (!currentUser) return null;
  return db.collection('users').doc(currentUser.uid).collection('folders');
}

function getTodosRef() {
  if (!currentUser) return null;
  return db.collection('users').doc(currentUser.uid).collection('todos');
}

// 디버그 정보 UI 업데이트 함수
function updateUserDebugInfo() {
  const userEmailText = document.getElementById('userEmailText');
  const userUidBadge = document.getElementById('userUidBadge');
  const dataCountText = document.getElementById('dataCountText');
  
  if (currentUser) {
    if (userEmailText) userEmailText.textContent = currentUser.email || '익명 계정';
    if (userUidBadge) userUidBadge.textContent = `UID: ${currentUser.uid.substring(0, 7)} | Firestore 연결됨`;
  } else {
    if (userEmailText) userEmailText.textContent = '로그아웃됨';
    if (userUidBadge) userUidBadge.textContent = 'UID: ----- | 연결 해제됨';
  }
  
  const customFolderCount = folders.filter(f => f.id !== 'inbox').length;
  const activeTodosCount = todos.filter(t => !t.deleted).length;
  if (dataCountText) {
    dataCountText.textContent = `데이터: 프로젝트 ${folders.length}개 (Inbox+${customFolderCount}) / 할 일 ${activeTodosCount}개`;
  }
}

async function setupFirestoreListeners(uid) {
  if (!uid || !currentUser) {
    alert("데이터 로드 실패: 유저 인증 정보(UID)를 찾을 수 없습니다.");
    return;
  }

  const foldersRef = getFoldersRef();
  const todosRef = getTodosRef();
  if (!foldersRef || !todosRef) {
    alert("데이터 로드 실패: Firestore 컬렉션 참조 생성 실패.");
    return;
  }
  
  if (unsubscribeFolders) unsubscribeFolders();
  if (unsubscribeTodos) unsubscribeTodos();

  updateUserDebugInfo();

  // 1. 유연한 초기 데이터 로드 (기본 get 사용 - 온/오프라인 자동 동기화)
  try {
    const foldersSnapshot = await foldersRef.get().catch(err => {
      console.warn('[Firestore] 폴더 조회 예외:', err);
      alert("데이터 로드 경고 (폴더 조회): " + err.message);
      return null;
    });
    if (foldersSnapshot) {
      folders = [];
      foldersSnapshot.forEach(doc => folders.push({ id: doc.id, ...doc.data() }));
      processFoldersData();
    }
  } catch (e) {
    alert("데이터 로드 실패 (폴더 예외): " + e.message);
  }

  try {
    const todosSnapshot = await todosRef.get().catch(err => {
      console.warn('[Firestore] 할일 조회 예외:', err);
      alert("데이터 로드 경고 (할일 조회): " + err.message);
      return null;
    });
    if (todosSnapshot) {
      todos = [];
      todosSnapshot.forEach(doc => todos.push({ id: doc.id, ...doc.data() }));
      processTodosData();
    }
  } catch (e) {
    alert("데이터 로드 실패 (할일 예외): " + e.message);
  }

  // 2. 실시간 snapshot 연결 (에러 발생 시 alert 팝업 유지)
  unsubscribeFolders = foldersRef.onSnapshot(snapshot => {
    folders = [];
    snapshot.forEach(doc => {
      folders.push({ id: doc.id, ...doc.data() });
    });
    processFoldersData();
  }, err => {
    alert("데이터 로드 실패 (폴더 리스너): " + err.message);
  });

  unsubscribeTodos = todosRef.onSnapshot(snapshot => {
    todos = [];
    snapshot.forEach(doc => {
      todos.push({ id: doc.id, ...doc.data() });
    });
    processTodosData();
  }, err => {
    alert("데이터 로드 실패 (할일 리스너): " + err.message);
  });
}

function getFolderTimestamp(folder) {
  if (!folder || !folder.createdAt) return 0;
  if (typeof folder.createdAt === 'number') return folder.createdAt;
  if (typeof folder.createdAt.toMillis === 'function') return folder.createdAt.toMillis();
  if (folder.createdAt.seconds) return folder.createdAt.seconds * 1000;
  return 0;
}

function processFoldersData() {
  if (!folders.find(f => f.id === 'inbox')) {
    folders.push({
      id: 'inbox',
      name: 'Inbox',
      createdAt: null
    });
  }

  // [수정1] Inbox 상단 고정 + 생성 순서(createdAt) 명확 오름차순 정렬 (새 프로젝트는 맨 아래)
  folders.sort((a, b) => {
    if (a.id === 'inbox') return -1;
    if (b.id === 'inbox') return 1;
    const timeA = getFolderTimestamp(a);
    const timeB = getFolderTimestamp(b);
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id); // 타임스탬프 동일 시 ID 기반 고정 정렬
  });

  if (!folders.find(f => f.id === activeFolderId)) {
    activeFolderId = folders[0].id;
  }
  
  updateUserDebugInfo();
  renderFolders();
  renderTodos();
}

function processTodosData() {
  todos.sort((a, b) => (a.order || 0) - (b.order || 0));
  renderTodos();
  renderTrash();
  updateUserDebugInfo();
}

function clearLocalData() {
  folders = [];
  todos = [];
  activeFolderId = 'inbox';
  if (unsubscribeFolders) unsubscribeFolders();
  if (unsubscribeTodos) unsubscribeTodos();
}

// ==========================================
// 5. Folders Rendering & Logic
// ==========================================

// 전역 인라인 편집 참조 (상태 누수 방지용)
let isEditingProjectTitle = false;
let activeEditInput = null;
let activeEditingFolderId = null;

// 프로젝트 전환이나 렌더링 시 기존 켜져있던 편집 상태를 강제로 닫는 헬퍼 함수
function cancelFolderTitleEdit() {
  if (activeEditInput && activeEditInput.parentNode) {
    activeEditInput.replaceWith(currentFolderTitle);
  }
  activeEditInput = null;
  activeEditingFolderId = null;
  isEditingProjectTitle = false;
}

function renderFolders() {
  if (!folderList) return;
  folderList.innerHTML = '';
  
  folders.forEach(folder => {
    const li = document.createElement('li');
    li.className = `folder-item ${folder.id === activeFolderId ? 'active' : ''}`;
    
    const icon = document.createElement('span');
    icon.className = 'folder-icon';
    icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
    
    const name = document.createElement('span');
    name.className = 'folder-text';
    name.textContent = folder.name || 'Untitled';
    
    const count = document.createElement('span');
    count.className = 'folder-count';
    const folderTodosCount = todos.filter(t => t.folderId === folder.id && !t.deleted).length;
    count.textContent = folderTodosCount > 0 ? folderTodosCount : '';
    
    li.appendChild(icon);
    li.appendChild(name);
    li.appendChild(count);
    
    if (folder.id !== 'inbox') {
      const delBtn = document.createElement('button');
      delBtn.className = 'folder-delete-btn';
      delBtn.title = '프로젝트 삭제';
      delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`'${folder.name}' 프로젝트를 삭제하시겠습니까?\n내부의 모든 할 일도 함께 삭제됩니다.`)) {
          deleteFolder(folder.id);
        }
      });
      li.appendChild(delBtn);
    }
    
    // 프로젝트 전환 시 기존에 켜져 있던 편집 상태 무조건 강제 종료
    li.addEventListener('click', () => {
      cancelFolderTitleEdit();
      activeFolderId = folder.id;
      closeMobileSidebar();
      renderFolders();
      renderTodos();
    });
    
    folderList.appendChild(li);
  });
  
  updateFolderTitle();
}

// 타이틀 동적 업데이트 (편집 박스 존재 시 강제 원복 후 갱신)
function updateFolderTitle() {
  if (!currentFolderTitle) return;
  if (activeEditInput && activeEditInput.parentNode) {
    activeEditInput.replaceWith(currentFolderTitle);
    activeEditInput = null;
    isEditingProjectTitle = false;
  }
  const currentFolder = folders.find(f => f.id === activeFolderId);
  currentFolderTitle.textContent = currentFolder ? currentFolder.name : 'Inbox';
}

// 프로젝트 이름 인라인 수정 로직 (독립 상태 및 Enter/Blur/Tab전환 완벽 방어)
currentFolderTitle?.addEventListener('click', () => {
  if (isEditingProjectTitle || activeFolderId === 'inbox') return;
  const currentFolder = folders.find(f => f.id === activeFolderId);
  if (!currentFolder) return;
  
  isEditingProjectTitle = true;
  activeEditingFolderId = activeFolderId;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentFolder.name;
  input.className = 'folder-edit-input';
  input.style.fontSize = 'inherit';
  input.style.fontWeight = 'inherit';
  input.style.fontFamily = 'inherit';
  input.style.border = '1px solid var(--border-dark)';
  input.style.background = 'var(--bg-input)';
  input.style.color = 'var(--text-main)';
  input.style.padding = '0.2rem 0.5rem';
  input.style.borderRadius = 'var(--radius-sm)';
  
  activeEditInput = input;
  currentFolderTitle.replaceWith(input);
  input.focus();
  input.select();
  
  let isFinished = false;
  
  const finishEdit = async (shouldSave = true) => {
    if (isFinished) return;
    isFinished = true;
    
    const targetFolderId = activeEditingFolderId;
    
    try {
      const newName = input.value.trim();
      if (shouldSave && newName && newName !== currentFolder.name && targetFolderId) {
        // 1. 해당 프로젝트 상태 및 타이틀 텍스트 즉시 변경
        currentFolder.name = newName;
        currentFolderTitle.textContent = newName;
        
        // 2. 파이어베이스 클라우드 동기화
        const ref = getFoldersRef();
        if (ref) {
          await ref.doc(targetFolderId).update({ name: newName }).catch(err => {
            alert(`프로젝트 이름 수정 실패: ${err.message}`);
          });
        }
      }
    } catch (err) {
      console.warn('프로젝트 이름 수정 중 예외:', err);
    } finally {
      // 3. 편집 상태 완전 청소 및 입력창 종료
      if (input.parentNode) {
        input.replaceWith(currentFolderTitle);
      }
      activeEditInput = null;
      activeEditingFolderId = null;
      isEditingProjectTitle = false;
      updateFolderTitle();
      renderFolders();
    }
  };
  
  input.addEventListener('blur', () => {
    finishEdit(true);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur(); // Enter 시 강제 blur 호출로 완벽 종료
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finishEdit(false);
    }
  });
});

// [수정2] 프로젝트 추가 시 연타 방지 및 명시적 생성시간 부여 (순서 뒤섞임 차단)
let isAddingFolder = false;

addFolderBtn?.addEventListener('click', async () => {
  if (isAddingFolder) return;
  
  const ref = getFoldersRef();
  if (!ref) return;
  
  isAddingFolder = true;
  if (addFolderBtn) {
    addFolderBtn.disabled = true;
    addFolderBtn.style.opacity = '0.5';
    addFolderBtn.style.cursor = 'not-allowed';
  }
  
  try {
    const newFolderRef = ref.doc();
    const newFolderData = {
      name: 'New Project',
      createdAt: Date.now() // 명시적 숫자로 즉시 저장하여 서순 엉킴 100% 방지
    };
    
    await newFolderRef.set(newFolderData);
    activeFolderId = newFolderRef.id;
  } catch (err) {
    alert(`프로젝트 생성 실패: ${err.message}`);
  } finally {
    isAddingFolder = false;
    if (addFolderBtn) {
      addFolderBtn.disabled = false;
      addFolderBtn.style.opacity = '1';
      addFolderBtn.style.cursor = 'pointer';
    }
  }
});

function deleteFolder(folderId) {
  if (folderId === 'inbox') return;
  
  const batch = db.batch();
  batch.delete(getFoldersRef().doc(folderId));
  
  const todosToDelete = todos.filter(t => t.folderId === folderId);
  todosToDelete.forEach(t => {
    batch.delete(getTodosRef().doc(t.id));
  });
  
  batch.commit()
    .then(() => {
      if (activeFolderId === folderId) {
        activeFolderId = 'inbox';
      }
    })
    .catch(err => alert(`프로젝트 삭제 실패: ${err.message}`));
}

// ==========================================
// 6. Todos Rendering & Logic
// ==========================================

function getActiveTodos() {
  let activeList = todos.filter(t => t.folderId === activeFolderId && !t.deleted);
  if (filterState === 'active') activeList = activeList.filter(t => !t.completed);
  if (filterState === 'completed') activeList = activeList.filter(t => t.completed);
  return activeList;
}

function renderTodos(useAnimation = false) {
  if (!todoList) return;
  
  const allActiveTodos = todos.filter(t => t.folderId === activeFolderId && !t.deleted);
  const completedTodos = allActiveTodos.filter(t => t.completed);
  const inProgressTodos = allActiveTodos.filter(t => !t.completed);
  
  // 상단 필터 및 진행률 카운터(배지) 업데이트
  if (badgeAll) badgeAll.textContent = allActiveTodos.length;
  if (badgeActive) badgeActive.textContent = inProgressTodos.length;
  if (badgeCompleted) badgeCompleted.textContent = completedTodos.length;
  if (statsText) statsText.textContent = `${completedTodos.length} / ${allActiveTodos.length}`;
  
  updateBulkBarUI();
  
  const activeList = getActiveTodos();
  todoList.innerHTML = '';
  
  if (activeList.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  
  emptyState.style.display = 'none';
  
  activeList.forEach((todo, index) => {
    const li = document.createElement('li');
    li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
    li.dataset.id = todo.id;
    li.draggable = !isSelectMode;
    
    // 선택 모드일 경우: 행(li) 전체 클릭으로 다중 선택 토글
    li.addEventListener('click', (e) => {
      if (!isSelectMode) return;
      if (e.target === checkbox) return; // 체크박스 자체 클릭 시 중복 처리 방지
      
      if (selectedTodoIds.has(todo.id)) {
        selectedTodoIds.delete(todo.id);
        checkbox.checked = false;
      } else {
        selectedTodoIds.add(todo.id);
        checkbox.checked = true;
      }
    });
    
    // 1. 체크박스 (일반 모드: 완료 토글 / 선택 모드: 다중 선택)
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'todo-checkbox';
    
    if (isSelectMode) {
      checkbox.checked = selectedTodoIds.has(todo.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectedTodoIds.add(todo.id);
        } else {
          selectedTodoIds.delete(todo.id);
        }
      });
    } else {
      checkbox.checked = todo.completed;
      checkbox.addEventListener('change', () => toggleTodo(todo.id, checkbox.checked));
    }
    
    // 2. 할 일 내용 (중앙)
    const contentDiv = document.createElement('div');
    contentDiv.className = 'todo-content';
    
    const typeIndicator = document.createElement('span');
    typeIndicator.className = `item-badge ${todo.type || 'task'}`;
    typeIndicator.textContent = todo.type === 'item' ? 'Item' : 'Task';
    
    const textSpan = document.createElement('span');
    textSpan.className = 'todo-text';
    textSpan.textContent = todo.text;
    
    contentDiv.appendChild(typeIndicator);
    contentDiv.appendChild(textSpan);
    
    // 3. 삭제 버튼 (맨 오른쪽)
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
    `;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTodo(todo.id);
    });

    textSpan.addEventListener('click', (e) => {
      // 선택 모드일 경에는 인라인 수정을 차단 (li 클릭 이벤트가 토글 처리)
      if (isSelectMode) return;
      
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text';
      input.value = todo.text;
      input.className = 'todo-edit-input';
      
      contentDiv.replaceChild(input, textSpan);
      input.focus();
      
      let isSaved = false;
      const saveText = () => {
        if (isSaved) return;
        isSaved = true;
        const newText = input.value.trim();
        if (newText && newText !== todo.text) {
          getTodosRef().doc(todo.id).update({ text: newText }).catch(err => alert(`수정 실패: ${err.message}`));
        } else {
          contentDiv.replaceChild(textSpan, input);
        }
      };
      
      input.addEventListener('blur', saveText);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveText();
        else if (e.key === 'Escape') {
          isSaved = true;
          contentDiv.replaceChild(textSpan, input);
        }
      });
    });

    li.appendChild(checkbox);
    li.appendChild(contentDiv);
    li.appendChild(delBtn);

    setupDragAndDrop(li, todo.id);
    
    if (useAnimation) {
      li.style.animation = `fadeIn 0.3s ease-out ${index * 0.05}s forwards`;
      li.style.opacity = '0';
    }
    
    todoList.appendChild(li);
  });
}

let draggedItem = null;
let dragCounter = 0;

function setupDragAndDrop(li, id) {
  li.addEventListener('dragstart', (e) => {
    if (isSelectMode) {
      e.preventDefault();
      return;
    }
    draggedItem = { element: li, id: id };
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => li.classList.add('dragging'), 0);
  });
  
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    draggedItem = null;
    dragCounter = 0;
    document.querySelectorAll('.todo-item').forEach(item => item.classList.remove('drag-over'));
  });
  
  li.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (draggedItem && draggedItem.element !== li) {
      dragCounter++;
      li.classList.add('drag-over');
    }
  });
  
  li.addEventListener('dragleave', () => {
    if (draggedItem && draggedItem.element !== li) {
      dragCounter--;
      if (dragCounter === 0) li.classList.remove('drag-over');
    }
  });
  
  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  
  li.addEventListener('drop', (e) => {
    e.preventDefault();
    li.classList.remove('drag-over');
    dragCounter = 0;
    
    if (!draggedItem || draggedItem.element === li) return;
    
    const items = [...todoList.querySelectorAll('.todo-item')];
    const dropIndex = items.indexOf(li);
    const draggedIndex = items.indexOf(draggedItem.element);
    
    if (draggedIndex < dropIndex) {
      li.after(draggedItem.element);
    } else {
      li.before(draggedItem.element);
    }
    
    reorderTodosInDOM();
  });
}

function reorderTodosInDOM() {
  const items = [...todoList.querySelectorAll('.todo-item')];
  const batch = db.batch();
  const ref = getTodosRef();
  
  items.forEach((item, index) => {
    const id = item.dataset.id;
    batch.update(ref.doc(id), { order: index });
  });
  
  batch.commit().catch(err => alert(`순서 변경 실패: ${err.message}`));
}

// [수정4] 단일 토글 버튼 로직 복구
typeToggleBtn?.addEventListener('click', () => {
  if (currentTodoType === 'task') {
    currentTodoType = 'item';
    typeToggleBtn.dataset.type = 'item';
    typeToggleBtn.textContent = 'Item';
  } else {
    currentTodoType = 'task';
    typeToggleBtn.dataset.type = 'task';
    typeToggleBtn.textContent = 'Task';
  }
});

todoForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = todoInput.value.trim();
  if (!text) return;
  
  addTodo(text, currentTodoType);
  todoInput.value = '';
});

function addTodo(text, type) {
  const ref = getTodosRef();
  if (!ref) return;
  
  const activeList = getActiveTodos();
  const maxOrder = activeList.length > 0 ? Math.max(...activeList.map(t => t.order || 0)) : 0;
  
  ref.add({
    folderId: activeFolderId,
    text: text,
    completed: false,
    type: type,
    order: maxOrder + 1,
    deleted: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    if (filterState === 'completed') {
      filterState = 'all';
      updateFilterUI();
    }
  }).catch(err => alert(`항목 추가 실패: ${err.message}`));
}

function toggleTodo(id, isChecked) {
  getTodosRef().doc(id).update({ completed: isChecked }).catch(err => alert(`상태 변경 실패: ${err.message}`));
}

// [수정5] 영구 삭제가 아닌 deleted 플래그 처리
function deleteTodo(id) {
  getTodosRef().doc(id).update({ deleted: true }).catch(err => alert(`삭제 실패: ${err.message}`));
}

// ==========================================
// 7. Filters & Trash
// ==========================================

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterState = btn.dataset.filter;
    updateFilterUI();
    updateBulkBarUI();
    renderTodos(true);
  });
});

function updateFilterUI() {
  filterBtns.forEach(b => b.classList.remove('active'));
  document.querySelector(`.filter-btn[data-filter="${filterState}"]`)?.classList.add('active');
}

// [수정5] 휴지통 아코디언 로직 (classList.toggle)
trashToggle?.addEventListener('click', (e) => {
  if (e.target.closest('#emptyTrashBtn')) return;
  const section = trashToggle.closest('.trash-section');
  if (section) {
    section.classList.toggle('open');
  }
});

function renderTrash() {
  if (!trashList) return;
  
  const deletedTodos = todos.filter(t => t.deleted); 
  
  if (trashCount) trashCount.textContent = deletedTodos.length;
  
  trashList.innerHTML = '';
  
  if (deletedTodos.length === 0) {
    trashEmptyState.style.display = 'block';
    emptyTrashBtn.style.display = 'none';
    return;
  }
  
  trashEmptyState.style.display = 'none';
  emptyTrashBtn.style.display = 'block';
  
  deletedTodos.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'trash-item';
    
    const textSpan = document.createElement('span');
    textSpan.className = 'trash-text';
    textSpan.textContent = todo.text;
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'trash-actions';
    
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'action-btn restore';
    restoreBtn.textContent = '복구';
    restoreBtn.addEventListener('click', () => {
      getTodosRef().doc(todo.id).update({ deleted: false, completed: false }).catch(err => alert(`복구 실패: ${err.message}`));
    });
    
    const permDelBtn = document.createElement('button');
    permDelBtn.className = 'action-btn permanent-delete';
    permDelBtn.textContent = '완전 삭제';
    permDelBtn.addEventListener('click', () => {
      if (confirm('완전히 삭제하시겠습니까?')) {
        getTodosRef().doc(todo.id).delete().catch(err => alert(`영구삭제 실패: ${err.message}`));
      }
    });
    
    actionsDiv.appendChild(restoreBtn);
    actionsDiv.appendChild(permDelBtn);
    
    li.appendChild(textSpan);
    li.appendChild(actionsDiv);
    trashList.appendChild(li);
  });
}

emptyTrashBtn?.addEventListener('click', () => {
  if (!confirm('휴지통을 비우시겠습니까? 이 작업은 취소할 수 없습니다.')) return;
  
  const deletedTodos = todos.filter(t => t.deleted);
  const batch = db.batch();
  const ref = getTodosRef();
  
  deletedTodos.forEach(todo => {
    batch.delete(ref.doc(todo.id));
  });
  
  batch.commit().catch(err => alert(`휴지통 비우기 실패: ${err.message}`));
});

// ==========================================
// 8. Select Mode & Bulk Actions
// ==========================================

function updateBulkBarUI() {
  if (!bulkBar) return;
  
  const showBulkComplete = isSelectMode && (filterState === 'all' || filterState === 'active');
  const showBulkActive = isSelectMode && filterState === 'completed';
  const showReset = filterState === 'completed';
  
  if (bulkCompleteBtn) bulkCompleteBtn.style.display = showBulkComplete ? 'inline-block' : 'none';
  if (bulkActiveBtn) bulkActiveBtn.style.display = showBulkActive ? 'inline-block' : 'none';
  if (resetAllCompletedBtn) resetAllCompletedBtn.style.display = showReset ? 'inline-block' : 'none';
  
  if (showBulkComplete || showBulkActive || showReset) {
    bulkBar.style.display = 'flex';
  } else {
    bulkBar.style.display = 'none';
  }
}

// 선택 모드 완전 해제 및 UI 초기화 헬퍼 함수
function exitSelectMode() {
  isSelectMode = false;
  selectedTodoIds.clear();
  if (toggleSelectModeBtn) {
    toggleSelectModeBtn.textContent = '선택';
    toggleSelectModeBtn.classList.remove('active');
  }
  updateBulkBarUI();
  renderTodos();
}

// [선택 / 취소] 모드 토글 버튼
toggleSelectModeBtn?.addEventListener('click', () => {
  if (isSelectMode) {
    exitSelectMode();
  } else {
    isSelectMode = true;
    toggleSelectModeBtn.textContent = '취소';
    toggleSelectModeBtn.classList.add('active');
    selectedTodoIds.clear();
    updateBulkBarUI();
    renderTodos();
  }
});

// [선택 항목 완료 처리]
bulkCompleteBtn?.addEventListener('click', () => {
  if (selectedTodoIds.size === 0) {
    alert('완료 처리할 항목을 선택해 주세요.');
    return;
  }
  
  const batch = db.batch();
  const ref = getTodosRef();
  let count = 0;
  
  selectedTodoIds.forEach(todoId => {
    const targetTodo = todos.find(t => t.id === todoId);
    if (targetTodo && !targetTodo.completed) {
      batch.update(ref.doc(todoId), { completed: true });
      count++;
    }
  });
  
  if (count === 0) {
    alert('선택된 항목 중 완료 처리할 진행 중 항목이 없습니다.');
    return;
  }
  
  batch.commit()
    .then(() => {
      exitSelectMode(); // 일괄 처리 완료 후 자동 선택 모드 해제
    })
    .catch(err => alert(`일괄 완료 처리 실패: ${err.message}`));
});

// [선택 항목 진행 중으로 이동]
bulkActiveBtn?.addEventListener('click', () => {
  if (selectedTodoIds.size === 0) {
    alert('진행 중으로 이동할 항목을 선택해 주세요.');
    return;
  }
  
  const batch = db.batch();
  const ref = getTodosRef();
  let count = 0;
  
  selectedTodoIds.forEach(todoId => {
    const targetTodo = todos.find(t => t.id === todoId);
    if (targetTodo && targetTodo.completed) {
      batch.update(ref.doc(todoId), { completed: false });
      count++;
    }
  });
  
  if (count === 0) {
    alert('선택된 항목 중 진행 중으로 이동할 완료 항목이 없습니다.');
    return;
  }
  
  batch.commit()
    .then(() => {
      exitSelectMode(); // 일괄 처리 완료 후 자동 선택 모드 해제
    })
    .catch(err => alert(`일괄 진행 중 이동 실패: ${err.message}`));
});

// [완료 항목 전체 리셋]
resetAllCompletedBtn?.addEventListener('click', () => {
  const completedInFolder = todos.filter(t => t.folderId === activeFolderId && t.completed && !t.deleted);
  
  if (completedInFolder.length === 0) {
    alert('리셋할 완료 항목이 없습니다.');
    return;
  }
  
  if (!confirm(`완료된 ${completedInFolder.length}개 항목을 모두 진행 중 상태로 리셋하시겠습니까?`)) {
    return;
  }
  
  const batch = db.batch();
  const ref = getTodosRef();
  
  completedInFolder.forEach(t => {
    batch.update(ref.doc(t.id), { completed: false });
  });
  
  batch.commit()
    .catch(err => alert(`전체 리셋 실패: ${err.message}`));
});
