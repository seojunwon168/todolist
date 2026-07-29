// ==========================================
// 1. Firebase Initialization & Auth state
// ==========================================
let db;
let auth;

// 과거 버전의 로컬 스토리지 찌꺼기 강제 초기화 (충돌 방지)
try {
  localStorage.clear();
} catch (e) {
  console.warn('localStorage clear failed', e);
}

if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
  auth = firebase.auth();
  db = firebase.firestore();
  
  // 1. 방화벽/백신 통신 차단 우회 및 영구 오프라인 저장소 설정
  db.settings({
    experimentalForceLongPolling: true,
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
  });
  
  db.enablePersistence().catch(function(err) {
    console.warn('[Firestore] 오프라인 저장소 활성화 실패:', err);
  });
  
  auth.onAuthStateChanged(user => {
    if (isSigningUp) return; // 가입 진행 중일 땐 리스너 강제 무시
    
    if (user) {
      currentUser = user;
      document.getElementById('loginContainer').style.display = 'none';
      document.getElementById('appContainer').style.display = 'block';
      
      // 유저가 확인되면 즉시 데이터 로드 실행
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
const passwordToggleBtn = document.getElementById('passwordToggleBtn');
const showSignupBtn = document.getElementById('showSignupBtn');

const signupForm = document.getElementById('signupForm');
const signupEmailInput = document.getElementById('signupEmailInput');
const signupPasswordInput = document.getElementById('signupPasswordInput');
const signupPasswordConfirm = document.getElementById('signupPasswordConfirm');
const signupPasswordToggleBtn = document.getElementById('signupPasswordToggleBtn');
const signupConfirmToggleBtn = document.getElementById('signupConfirmToggleBtn');
const showLoginBtn = document.getElementById('showLoginBtn');

const logoutBtn = document.getElementById('logoutBtn');
const folderList = document.getElementById('folderList');
const addFolderBtn = document.getElementById('addFolderBtn');
const todoList = document.getElementById('todoList');
const todoForm = document.getElementById('todoForm');
const todoInput = document.getElementById('todoInput');
const typeToggleBtns = document.querySelectorAll('.type-toggle-btn');
const filterBtns = document.querySelectorAll('.filter-btn');

const folderTitle = document.getElementById('folderTitle');
const trashFolderBtn = document.getElementById('trashFolderBtn');
const trashListContainer = document.getElementById('trashListContainer');
const trashList = document.getElementById('trashList');
const emptyTrashBtn = document.getElementById('emptyTrashBtn');

let currentTodoType = 'task';

// ==========================================
// 3. Authentication (Login & Signup)
// ==========================================

// 비밀번호 보기/숨기기 토글 유틸리티
function setupPasswordToggle(inputEl, btnEl) {
  if(!inputEl || !btnEl) return;
  btnEl.addEventListener('click', () => {
    if (inputEl.type === 'password') {
      inputEl.type = 'text';
      btnEl.textContent = '숨기기';
    } else {
      inputEl.type = 'password';
      btnEl.textContent = '보기';
    }
  });
}

setupPasswordToggle(passwordInput, passwordToggleBtn);
setupPasswordToggle(signupPasswordInput, signupPasswordToggleBtn);
setupPasswordToggle(signupPasswordConfirm, signupConfirmToggleBtn);

// 로그인 <-> 회원가입 화면 전환
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

// 로그인
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

// 회원가입
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
  
  isSigningUp = true; // onAuthStateChanged 방해 방지
  
  auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      // 자동 로그인 처리
      currentUser = userCredential.user;
      
      // 입력창 초기화
      signupEmailInput.value = '';
      signupPasswordInput.value = '';
      signupPasswordConfirm.value = '';
      
      document.getElementById('loginContainer').style.display = 'none';
      document.getElementById('appContainer').style.display = 'block';
      
      // 회원가입 직후 데이터 로드 실행
      setupFirestoreListeners(currentUser.uid);
      isSigningUp = false;
    })
    .catch(error => {
      isSigningUp = false;
      alert(`회원가입 실패: ${error.message}`);
    });
});

// 로그아웃
logoutBtn?.addEventListener('click', () => {
  auth.signOut().catch(error => alert(`로그아웃 에러: ${error.message}`));
});

// ==========================================
// 4. Firestore Database Fetching (덮어쓰기 로직 전면 제거)
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
  
  // 1. Folders Fetch (빈 배열 상태를 DB에 자동 덮어쓰는 로직 삭제!)
  unsubscribeFolders = foldersRef.onSnapshot(snapshot => {
    folders = [];
    snapshot.forEach(doc => {
      folders.push({ id: doc.id, ...doc.data() });
    });
    
    // 만약 DB에 inbox가 없다면 로컬 배열에만 가상으로 추가해서 UI가 안 깨지게 방어 (서버에는 안 씀)
    if (!folders.find(f => f.id === 'inbox')) {
      folders.push({
        id: 'inbox',
        name: 'Inbox',
        createdAt: null
      });
    }

    // [정렬 로직 수정]: inbox는 무조건 0번(최상단) 고정. 나머지는 createdAt 오름차순(새 프로젝트가 맨 아래로)
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

  // 2. Todos Fetch
  unsubscribeTodos = todosRef.onSnapshot(snapshot => {
    todos = [];
    snapshot.forEach(doc => {
      todos.push({ id: doc.id, ...doc.data() });
    });
    
    // 할일 정렬: order 기준 오름차순
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
    
    const name = document.createElement('span');
    name.className = 'folder-name';
    name.textContent = folder.name || 'Untitled';
    
    const count = document.createElement('span');
    count.className = 'folder-count';
    const folderTodosCount = todos.filter(t => t.folderId === folder.id && !t.deleted).length;
    count.textContent = folderTodosCount > 0 ? folderTodosCount : '';
    
    li.appendChild(icon);
    li.appendChild(name);
    li.appendChild(count);
    
    li.addEventListener('click', () => {
      activeFolderId = folder.id;
      renderFolders();
      renderTodos();
      
      trashFolderBtn.classList.remove('active');
      todoForm.style.display = 'flex';
      trashListContainer.style.display = 'none';
      document.querySelector('.controls-section').style.display = 'flex';
      document.getElementById('todoList').style.display = 'block';
    });
    
    folderList.appendChild(li);
  });
  
  updateFolderTitle();
}

function updateFolderTitle() {
  if (!folderTitle) return;
  const currentFolder = folders.find(f => f.id === activeFolderId);
  folderTitle.textContent = currentFolder ? currentFolder.name : 'Inbox';
}

// 프로젝트 이름 인라인 수정 로직
folderTitle?.addEventListener('click', () => {
  if (activeFolderId === 'inbox' || activeFolderId === 'trash') return;
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
  
  folderTitle.replaceWith(input);
  input.focus();
  
  let isSaved = false;
  
  const saveName = () => {
    if (isSaved) return;
    isSaved = true;
    
    const newName = input.value.trim();
    if (newName && newName !== currentFolder.name) {
      getFoldersRef().doc(activeFolderId).update({ name: newName }).catch(err => alert(`프로젝트 이름 수정 실패: ${err.message}`));
    }
    input.replaceWith(folderTitle);
  };
  
  input.addEventListener('blur', saveName);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveName();
    else if (e.key === 'Escape') {
      isSaved = true;
      input.replaceWith(folderTitle);
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

// ==========================================
// 6. Todos Rendering & Logic (미니멀리즘 디자인 롤백)
// ==========================================

function getActiveTodos() {
  let activeList = todos.filter(t => t.folderId === activeFolderId && !t.deleted);
  if (filterState === 'active') activeList = activeList.filter(t => !t.completed);
  if (filterState === 'completed') activeList = activeList.filter(t => t.completed);
  return activeList;
}

function renderTodos(useAnimation = false) {
  if (!todoList) return;
  
  const activeList = getActiveTodos();
  todoList.innerHTML = '';
  
  if (activeList.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
      <div class="empty-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="9" x2="12" y2="15"></line><line x1="9" y1="12" x2="15" y2="12"></line></svg>
      </div>
      <p>등록된 항목이 없습니다</p>
    `;
    todoList.appendChild(emptyState);
    return;
  }
  
  activeList.forEach((todo, index) => {
    const li = document.createElement('li');
    li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
    li.dataset.id = todo.id;
    li.draggable = true;
    
    // [망가진 UI 롤백] 1. 순정 체크박스 (맨 왼쪽)
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'todo-checkbox';
    checkbox.checked = todo.completed;
    checkbox.addEventListener('change', () => toggleTodo(todo.id, checkbox.checked));
    
    // [망가진 UI 롤백] 2. 할 일 텍스트 및 타입 뱃지 (중앙)
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
    
    // [망가진 UI 롤백] 3. 삭제 버튼 (맨 오른쪽)
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

    // 텍스트 인라인 수정
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

    // 롤백된 DOM 구조 그대로 조립
    li.appendChild(checkbox);
    li.appendChild(contentDiv);
    li.appendChild(delBtn);

    // 드래그 앤 드롭 연결
    setupDragAndDrop(li, todo.id);
    
    if (useAnimation) {
      li.style.animation = `fadeIn 0.3s ease-out ${index * 0.05}s forwards`;
      li.style.opacity = '0';
    }
    
    todoList.appendChild(li);
  });
}

// Drag & Drop
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

typeToggleBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    typeToggleBtns.forEach(b => b.removeAttribute('data-type'));
    btn.dataset.type = 'item';
    currentTodoType = btn.textContent.toLowerCase();
  });
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
    renderTodos(true);
  });
});

function updateFilterUI() {
  filterBtns.forEach(b => b.classList.remove('active'));
  document.querySelector(`.filter-btn[data-filter="${filterState}"]`)?.classList.add('active');
}

trashFolderBtn?.addEventListener('click', () => {
  activeFolderId = 'trash';
  folderList.querySelectorAll('.folder-item').forEach(item => item.classList.remove('active'));
  trashFolderBtn.classList.add('active');
  
  todoForm.style.display = 'none';
  document.querySelector('.controls-section').style.display = 'none';
  todoList.style.display = 'none';
  trashListContainer.style.display = 'block';
  
  folderTitle.textContent = '휴지통';
  renderTrash();
});

function renderTrash() {
  if (!trashList) return;
  const deletedTodos = todos.filter(t => t.deleted);
  
  trashList.innerHTML = '';
  
  if (deletedTodos.length === 0) {
    trashList.innerHTML = '<div class="empty-state"><p>휴지통이 비어 있습니다</p></div>';
    emptyTrashBtn.style.display = 'none';
    return;
  }
  
  emptyTrashBtn.style.display = 'block';
  
  deletedTodos.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'todo-item deleted';
    
    // 휴지통에서도 UI 복원
    const contentDiv = document.createElement('div');
    contentDiv.className = 'todo-content';
    
    const textSpan = document.createElement('span');
    textSpan.className = 'todo-text';
    textSpan.textContent = todo.text;
    
    contentDiv.appendChild(textSpan);
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'todo-actions';
    
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'action-btn restore-btn';
    restoreBtn.textContent = '복구';
    restoreBtn.addEventListener('click', () => {
      getTodosRef().doc(todo.id).update({ deleted: false }).catch(err => alert(`복구 실패: ${err.message}`));
    });
    
    const permDelBtn = document.createElement('button');
    permDelBtn.className = 'action-btn delete-btn';
    permDelBtn.textContent = '영구삭제';
    permDelBtn.addEventListener('click', () => {
      if (confirm('완전히 삭제하시겠습니까?')) {
        getTodosRef().doc(todo.id).delete().catch(err => alert(`영구삭제 실패: ${err.message}`));
      }
    });
    
    actionsDiv.appendChild(restoreBtn);
    actionsDiv.appendChild(permDelBtn);
    
    li.appendChild(contentDiv);
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
