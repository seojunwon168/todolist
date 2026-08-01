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
    
    // 오프라인 캐시 지속성(enablePersistence) 전면 비활성화 및 롱폴링 설정
    db.settings({
      experimentalForceLongPolling: true
    });
    
    // 모바일 리디렉트 로그인 성공 결과 수신
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
          
          // 순서 보장: 실시간 데이터 스냅샷 첫 수신까지 완전 대기
          updateUserDebugInfo();
          try {
            await setupFirestoreListeners(user.uid);
          } catch (listenErr) {
            alert('서버 연결 실패: ' + listenErr.message);
          }
          
          if (appContainer) appContainer.style.display = 'block';
          hideLoadingScreen();
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
    console.error('[Firebase] 초기화 중 오류 발생:', initErr);
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
// 4. Firestore Database Fetching (실시간 전면 교체)
// ==========================================

function getFoldersRef() {
  if (!currentUser) return null;
  return db.collection('users').doc(currentUser.uid).collection('folders');
}

function getTodosRef() {
  if (!currentUser) return null;
  return db.collection('users').doc(currentUser.uid).collection('todos');
}

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

let isInitialDataLoaded = false;

// 실시간 동기화(onSnapshot) 전면 적용 및 최초 데이터 양쪽 완전 수신 보장 Promise 반환
function setupFirestoreListeners(uid) {
  return new Promise((resolve, reject) => {
    if (!uid || !currentUser) {
      alert("데이터 로드 실패: 유저 인증 정보(UID)를 찾을 수 없습니다.");
      reject(new Error("No user UID"));
      return;
    }

    const foldersRef = getFoldersRef();
    const todosRef = getTodosRef();
    if (!foldersRef || !todosRef) {
      alert("데이터 로드 실패: Firestore 컬렉션 참조 생성 실패.");
      reject(new Error("No collection refs"));
      return;
    }
    
    if (unsubscribeFolders) unsubscribeFolders();
    if (unsubscribeTodos) unsubscribeTodos();

    isInitialDataLoaded = false;
    let foldersReceived = false;
    let todosReceived = false;

    function checkInitialLoadComplete() {
      if (foldersReceived && todosReceived && !isInitialDataLoaded) {
        isInitialDataLoaded = true;
        
        processFoldersData(false);
        processTodosData(false);
        
        renderFolders();
        renderTodos();
        renderTrash();
        updateUserDebugInfo();
        
        resolve();
      }
    }

    // 실시간 onSnapshot 온전히 활성화 (최초 수신 후 동시 렌더링)
    unsubscribeFolders = foldersRef.onSnapshot(snapshot => {
      folders = [];
      snapshot.forEach(doc => {
        folders.push({ id: doc.id, ...doc.data() });
      });
      foldersReceived = true;
      if (isInitialDataLoaded) {
        processFoldersData(true);
      } else {
        checkInitialLoadComplete();
      }
    }, err => {
      alert("서버 통신 실패 (폴더 리스너): " + err.message);
      reject(err);
    });

    unsubscribeTodos = todosRef.onSnapshot(snapshot => {
      todos = [];
      snapshot.forEach(doc => {
        todos.push({ id: doc.id, ...doc.data() });
      });
      todosReceived = true;
      if (isInitialDataLoaded) {
        processTodosData(true);
      } else {
        checkInitialLoadComplete();
      }
    }, err => {
      alert("서버 통신 실패 (할일 리스너): " + err.message);
      reject(err);
    });
  });
}

function processFoldersData(shouldRender = true) {
  if (!folders.find(f => f.id === 'inbox')) {
    folders.push({
      id: 'inbox',
      name: 'Inbox',
      createdAt: null
    });
  }

  folders.sort((a, b) => {
    if (a.id === 'inbox') return -1;
    if (b.id === 'inbox') return 1;
    const timeA = a.createdAt ? a.createdAt.toMillis() : Date.now();
    const timeB = b.createdAt ? b.createdAt.toMillis() : Date.now();
    return timeA - timeB; 
  });

  if (!folders.find(f => f.id === activeFolderId)) {
    activeFolderId = folders[0].id;
  }
  
  if (shouldRender) {
    updateUserDebugInfo();
    renderFolders();
    renderTodos();
  }
}

function processTodosData(shouldRender = true) {
  todos.sort((a, b) => (a.order || 0) - (b.order || 0));
  if (shouldRender) {
    renderTodos();
    renderTrash();
    updateUserDebugInfo();
  }
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
    
    li.addEventListener('click', () => {
      activeFolderId = folder.id;
      closeMobileSidebar();
      renderFolders();
      renderTodos();
    });
    
    folderList.appendChild(li);
  });
  
  updateFolderTitle();
}

function updateFolderTitle() {
  if (!currentFolderTitle) return;
  const currentFolder = folders.find(f => f.id === activeFolderId);
  currentFolderTitle.textContent = currentFolder ? currentFolder.name : 'Inbox';
}

currentFolderTitle?.addEventListener('click', () => {
  if (activeFolderId === 'inbox') return;
  const currentFolder = folders.find(f => f.id === activeFolderId);
  if (!currentFolder) return;
  
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
  
  currentFolderTitle.replaceWith(input);
  input.focus();
  
  let isSaved = false;
  
  const saveName = async () => {
    if (isSaved) return;
    isSaved = true;
    
    const newName = input.value.trim();
    if (newName && newName !== currentFolder.name) {
      try {
        await getFoldersRef().doc(activeFolderId).update({ name: newName });
      } catch (err) {
        alert('서버 저장 실패 (프로젝트 이름 수정): ' + err.message);
      }
    }
    input.replaceWith(currentFolderTitle);
    updateFolderTitle();
  };
  
  input.addEventListener('blur', saveName);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveName();
    else if (e.key === 'Escape') {
      isSaved = true;
      input.replaceWith(currentFolderTitle);
    }
  });
});

addFolderBtn?.addEventListener('click', async () => {
  const ref = getFoldersRef();
  if (!ref) return;
  try {
    const newFolderRef = ref.doc();
    await newFolderRef.set({
      name: 'New Project',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    activeFolderId = newFolderRef.id;
  } catch (err) {
    alert('서버 저장 실패 (프로젝트 생성): ' + err.message);
  }
});

async function deleteFolder(folderId) {
  if (folderId === 'inbox') return;
  
  try {
    const batch = db.batch();
    batch.delete(getFoldersRef().doc(folderId));
    
    const todosToDelete = todos.filter(t => t.folderId === folderId);
    todosToDelete.forEach(t => {
      batch.delete(getTodosRef().doc(t.id));
    });
    
    await batch.commit();
    if (activeFolderId === folderId) {
      activeFolderId = 'inbox';
    }
  } catch (err) {
    alert('서버 저장 실패 (프로젝트 삭제): ' + err.message);
  }
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
    
    li.addEventListener('click', (e) => {
      if (!isSelectMode) return;
      if (e.target === checkbox) return;
      
      if (selectedTodoIds.has(todo.id)) {
        selectedTodoIds.delete(todo.id);
        checkbox.checked = false;
      } else {
        selectedTodoIds.add(todo.id);
        checkbox.checked = true;
      }
    });
    
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
      if (isSelectMode) return;
      
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text';
      input.value = todo.text;
      input.className = 'todo-edit-input';
      
      contentDiv.replaceChild(input, textSpan);
      input.focus();
      
      let isSaved = false;
      const saveText = async () => {
        if (isSaved) return;
        isSaved = true;
        const newText = input.value.trim();
        if (newText && newText !== todo.text) {
          try {
            await getTodosRef().doc(todo.id).update({ text: newText });
          } catch (err) {
            alert('서버 저장 실패 (내용 수정): ' + err.message);
          }
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

async function reorderTodosInDOM() {
  const items = [...todoList.querySelectorAll('.todo-item')];
  const batch = db.batch();
  const ref = getTodosRef();
  
  items.forEach((item, index) => {
    const id = item.dataset.id;
    batch.update(ref.doc(id), { order: index });
  });
  
  try {
    await batch.commit();
  } catch (err) {
    alert('서버 저장 실패 (순서 변경): ' + err.message);
  }
}

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

async function addTodo(text, type) {
  const ref = getTodosRef();
  if (!ref) return;
  
  const activeList = getActiveTodos();
  const maxOrder = activeList.length > 0 ? Math.max(...activeList.map(t => t.order || 0)) : 0;
  
  try {
    await ref.add({
      folderId: activeFolderId,
      text: text,
      completed: false,
      type: type,
      order: maxOrder + 1,
      deleted: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    if (filterState === 'completed') {
      filterState = 'all';
      updateFilterUI();
    }
  } catch (err) {
    alert('서버 저장 실패 (할 일 추가): ' + err.message);
  }
}

async function toggleTodo(id, isChecked) {
  try {
    await getTodosRef().doc(id).update({ completed: isChecked });
  } catch (err) {
    alert('서버 저장 실패 (상태 변경): ' + err.message);
  }
}

async function deleteTodo(id) {
  try {
    await getTodosRef().doc(id).update({ deleted: true });
  } catch (err) {
    alert('서버 저장 실패 (삭제 처리): ' + err.message);
  }
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
    restoreBtn.addEventListener('click', async () => {
      try {
        await getTodosRef().doc(todo.id).update({ deleted: false, completed: false });
      } catch (err) {
        alert('서버 저장 실패 (복구 처리): ' + err.message);
      }
    });
    
    const permDelBtn = document.createElement('button');
    permDelBtn.className = 'action-btn permanent-delete';
    permDelBtn.textContent = '완전 삭제';
    permDelBtn.addEventListener('click', async () => {
      if (confirm('완전히 삭제하시겠습니까?')) {
        try {
          await getTodosRef().doc(todo.id).delete();
        } catch (err) {
          alert('서버 저장 실패 (영구 삭제): ' + err.message);
        }
      }
    });
    
    actionsDiv.appendChild(restoreBtn);
    actionsDiv.appendChild(permDelBtn);
    
    li.appendChild(textSpan);
    li.appendChild(actionsDiv);
    trashList.appendChild(li);
  });
}

emptyTrashBtn?.addEventListener('click', async () => {
  if (!confirm('휴지통을 비우시겠습니까? 이 작업은 취소할 수 없습니다.')) return;
  
  const deletedTodos = todos.filter(t => t.deleted);
  const batch = db.batch();
  const ref = getTodosRef();
  
  deletedTodos.forEach(todo => {
    batch.delete(ref.doc(todo.id));
  });
  
  try {
    await batch.commit();
  } catch (err) {
    alert('서버 저장 실패 (휴지통 비우기): ' + err.message);
  }
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

bulkCompleteBtn?.addEventListener('click', async () => {
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
  
  try {
    await batch.commit();
    exitSelectMode();
  } catch (err) {
    alert('서버 저장 실패 (일괄 완료): ' + err.message);
  }
});

bulkActiveBtn?.addEventListener('click', async () => {
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
  
  try {
    await batch.commit();
    exitSelectMode();
  } catch (err) {
    alert('서버 저장 실패 (일괄 진행중 이동): ' + err.message);
  }
});

resetAllCompletedBtn?.addEventListener('click', async () => {
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
  
  try {
    await batch.commit();
  } catch (err) {
    alert('서버 저장 실패 (전체 리셋): ' + err.message);
  }
});
