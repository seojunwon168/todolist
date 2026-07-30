// ==========================================
// 1. Firebase Initialization & Auth state
// ==========================================
let db;
let auth;

// 로컬 스토리지 찌꺼기 강제 초기화
try {
  localStorage.clear();
} catch (e) {
  console.warn('localStorage clear failed', e);
}

if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
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
  
  auth.onAuthStateChanged(user => {
    if (isSigningUp) return; 
    
    if (user) {
      currentUser = user;
      document.getElementById('loginContainer').style.display = 'none';
      document.getElementById('appContainer').style.display = 'block';
      setupFirestoreListeners(user.uid);
    } else {
      currentUser = null;
      document.getElementById('loginContainer').style.display = 'flex';
      document.getElementById('appContainer').style.display = 'none';
      document.getElementById('loginView').style.display = 'block';
      document.getElementById('signupView').style.display = 'none';
      clearLocalData();
    }
  });
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

function setupFirestoreListeners(uid) {
  const foldersRef = getFoldersRef();
  const todosRef = getTodosRef();
  
  if (unsubscribeFolders) unsubscribeFolders();
  if (unsubscribeTodos) unsubscribeTodos();
  
  unsubscribeFolders = foldersRef.onSnapshot(snapshot => {
    folders = [];
    snapshot.forEach(doc => {
      folders.push({ id: doc.id, ...doc.data() });
    });
    
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
    
    renderFolders();
    renderTodos();
  }, err => {
    alert(`[Firestore Error] 폴더 불러오기 실패:\n${err.message}`);
  });

  unsubscribeTodos = todosRef.onSnapshot(snapshot => {
    todos = [];
    snapshot.forEach(doc => {
      todos.push({ id: doc.id, ...doc.data() });
    });
    
    todos.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    renderTodos();
    renderTrash();
  }, err => {
    alert(`[Firestore Error] 할 일 불러오기 실패:\n${err.message}`);
  });
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
    
    // [수정1] 올바른 CSS 클래스(folder-text) 할당으로 사이드바 왼쪽 정렬 복구
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
      renderFolders();
      renderTodos();
    });
    
    folderList.appendChild(li);
  });
  
  updateFolderTitle();
}

// [수정2] 타이틀 동적 업데이트 복구
function updateFolderTitle() {
  if (!currentFolderTitle) return;
  const currentFolder = folders.find(f => f.id === activeFolderId);
  currentFolderTitle.textContent = currentFolder ? currentFolder.name : 'Inbox';
}

// [수정3] 인라인 수정 로직 복구
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
  
  const saveName = () => {
    if (isSaved) return;
    isSaved = true;
    
    const newName = input.value.trim();
    if (newName && newName !== currentFolder.name) {
      getFoldersRef().doc(activeFolderId).update({ name: newName }).catch(err => alert(`프로젝트 이름 수정 실패: ${err.message}`));
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

addFolderBtn?.addEventListener('click', () => {
  const ref = getFoldersRef();
  if (!ref) return;
  const newFolderRef = ref.doc();
  newFolderRef.set({
    name: 'New Project',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    activeFolderId = newFolderRef.id;
  }).catch(err => alert(`프로젝트 생성 실패: ${err.message}`));
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
    li.draggable = true;
    
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

// [선택 / 취소] 모드 토글 버튼
toggleSelectModeBtn?.addEventListener('click', () => {
  isSelectMode = !isSelectMode;
  selectedTodoIds.clear();
  
  if (isSelectMode) {
    toggleSelectModeBtn.textContent = '취소';
    toggleSelectModeBtn.classList.add('active');
  } else {
    toggleSelectModeBtn.textContent = '선택';
    toggleSelectModeBtn.classList.remove('active');
  }
  
  updateBulkBarUI();
  renderTodos();
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
      isSelectMode = false;
      toggleSelectModeBtn.textContent = '선택';
      toggleSelectModeBtn.classList.remove('active');
      selectedTodoIds.clear();
      updateBulkBarUI();
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
      isSelectMode = false;
      toggleSelectModeBtn.textContent = '선택';
      toggleSelectModeBtn.classList.remove('active');
      selectedTodoIds.clear();
      updateBulkBarUI();
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
