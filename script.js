// 과거 버전의 로컬 스토리지 찌꺼기 강제 초기화 (충돌 방지)
try {
  localStorage.clear();
} catch (e) {
  console.warn('localStorage clear failed', e);
}

// ==========================================
// 1. Firebase Initialization & Auth state
// ==========================================
let db;
let auth;
let currentUser = null;
let unsubscribeFolders = null;
let unsubscribeTodos = null;
let isSigningUp = false; // 회원가입 자동로그인 방지 플래그

// 상태 변수
let folders = [];
let activeFolderId = 'inbox';
let todos = [];
let filterState = 'all';
let isInitialDataLoaded = false; // 데이터 로드 락(Lock)

// The config will be empty by default, wait for user to fill it in index.html
if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
  auth = firebase.auth();
  db = firebase.firestore();
  
  auth.onAuthStateChanged(user => {
    if (isSigningUp) return; // 가입 진행 중일 땐 리스너 강제 무시
    
    if (user) {
      currentUser = user;
      document.getElementById('loginContainer').style.display = 'none';
      document.getElementById('appContainer').style.display = 'flex';
      setupFirestoreListeners(user.uid);
    } else {
      currentUser = null;
      document.getElementById('loginContainer').style.display = 'flex';
      document.getElementById('appContainer').style.display = 'none';
      // 로그아웃 시엔 기본 로그인 뷰를 노출
      document.getElementById('loginView').style.display = 'block';
      document.getElementById('signupView').style.display = 'none';
      clearLocalData();
    }
  });
} else {
  alert('Firebase 설정이 누락되었거나 로드되지 않았습니다.');
}

function clearLocalData() {
  folders = [];
  todos = [];
  activeFolderId = 'inbox';
  isInitialDataLoaded = false;
  if (unsubscribeFolders) unsubscribeFolders();
  if (unsubscribeTodos) unsubscribeTodos();
}


// ==========================================
// 2. DOM Elements Mapping
// ==========================================
const authForm = document.getElementById('authForm');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');

const signupForm = document.getElementById('signupForm');
const signupEmailInput = document.getElementById('signupEmailInput');
const signupPasswordInput = document.getElementById('signupPasswordInput');
const signupPasswordConfirmInput = document.getElementById('signupPasswordConfirmInput');

const goToSignupBtn = document.getElementById('goToSignupBtn');
const goToLoginBtn = document.getElementById('goToLoginBtn');
const loginView = document.getElementById('loginView');
const signupView = document.getElementById('signupView');

const naverLoginBtn = document.getElementById('naverLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');

const todoForm = document.getElementById('todoForm');
const todoInput = document.getElementById('todoInput');
const todoList = document.getElementById('todoList');
const emptyState = document.getElementById('emptyState');
const statsText = document.getElementById('statsText');
const typeToggleBtn = document.getElementById('typeToggleBtn');

const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const folderList = document.getElementById('folderList');
const addFolderBtn = document.getElementById('addFolderBtn');
const currentFolderTitle = document.getElementById('currentFolderTitle');

const filterBtns = document.querySelectorAll('.filter-btn');
const badgeAll = document.getElementById('badgeAll');
const badgeActive = document.getElementById('badgeActive');
const badgeCompleted = document.getElementById('badgeCompleted');

const trashToggle = document.getElementById('trashToggle');
const trashSection = document.querySelector('.trash-section');
const trashCount = document.getElementById('trashCount');
const trashList = document.getElementById('trashList');
const trashEmptyState = document.getElementById('trashEmptyState');
const emptyTrashBtn = document.getElementById('emptyTrashBtn');

const confirmModal = document.getElementById('confirmModal');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');
let modalCallback = null;


// ==========================================
// 3. Auth UI Handlers
// ==========================================
goToSignupBtn?.addEventListener('click', () => {
  loginView.style.display = 'none';
  signupView.style.display = 'block';
});
goToLoginBtn?.addEventListener('click', () => {
  signupView.style.display = 'none';
  loginView.style.display = 'block';
});

document.querySelectorAll('.pw-toggle-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const input = e.target.previousElementSibling;
    if (input.type === 'password') {
      input.type = 'text';
      e.target.textContent = '숨기기';
    } else {
      input.type = 'password';
      e.target.textContent = '보기';
    }
  });
});

authForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  
  if (!email || !password || !auth) {
    alert('이메일과 비밀번호를 모두 입력해 주세요.');
    return;
  }
  
  auth.signInWithEmailAndPassword(email, password)
    .catch(error => {
      console.error(error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
         alert('❌ 로그인 실패:\n이메일 또는 비밀번호가 일치하지 않습니다.');
      } else {
         alert('❌ 로그인 실패:\n' + error.message);
      }
    });
});

signupForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = signupEmailInput.value.trim();
  const password = signupPasswordInput.value.trim();
  const passwordConfirm = signupPasswordConfirmInput.value.trim();
  
  if (!email || !password || !passwordConfirm || !auth) {
    alert('모든 항목을 입력해 주세요.');
    return;
  }
  if (password.length < 6) {
    alert('비밀번호는 최소 6자리 이상이어야 합니다.');
    return;
  }
  if (password !== passwordConfirm) {
    alert('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
    return;
  }
  
  isSigningUp = true; 
  
  auth.createUserWithEmailAndPassword(email, password)
    .then(() => {
      return auth.signOut();
    })
    .then(() => {
      isSigningUp = false;
      alert('✅ 회원가입이 완료되었습니다. 로그인해 주세요.');
      signupForm.reset();
      signupView.style.display = 'none';
      loginView.style.display = 'block';
    })
    .catch(error => {
      isSigningUp = false;
      console.error(error);
      if (error.code === 'auth/email-already-in-use') {
        alert('❌ 가입 실패:\n이미 사용 중인 이메일 계정입니다.');
      } else if (error.code === 'auth/invalid-email') {
        alert('❌ 가입 실패:\n유효하지 않은 이메일 형식입니다.');
      } else {
        alert('❌ 가입 실패:\n' + error.message);
      }
    });
});

logoutBtn?.addEventListener('click', () => {
  if (auth) {
    auth.signOut().catch(err => alert('로그아웃 실패: ' + err.message));
  }
});

naverLoginBtn?.addEventListener('click', () => {
  alert('네이버 로그인(소셜 로그인) 연동은 외부 REST API 설정이 필요합니다. (뼈대 함수)');
});


// ==========================================
// 4. Firestore Realtime Listeners (완전 재작성)
// ==========================================
function setupFirestoreListeners(uid) {
  console.log(`[Firestore] UID: ${uid} 데이터 동기화 시작`);
  
  const foldersRef = db.collection('users').doc(uid).collection('folders');
  const todosRef = db.collection('users').doc(uid).collection('todos');
  
  // Folders Sync (orderBy 제거로 인덱스 의존성 및 쿼리 실패 완전 차단)
  unsubscribeFolders = foldersRef.onSnapshot(snapshot => {
    folders = [];
    snapshot.forEach(doc => {
      folders.push({ id: doc.id, ...doc.data() });
    });
    
    // 로컬 정렬: createdAt 기준 (없는 경우 뒤로)
    folders.sort((a, b) => {
      const timeA = a.createdAt ? a.createdAt.toMillis() : 9999999999999;
      const timeB = b.createdAt ? b.createdAt.toMillis() : 9999999999999;
      return timeA - timeB;
    });
    
    console.log(`[Firestore] 폴더 로드 성공: ${folders.length}개`);
    
    // 첫 로드 시 데이터가 전혀 없다면 Inbox 생성
    if (folders.length === 0) {
      console.warn(`[Firestore] 기존 폴더가 감지되지 않아 기본 Inbox를 생성합니다.`);
      foldersRef.doc('inbox').set({
        name: 'Inbox',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true })
      .catch(err => {
        alert(`[Firestore Error] Inbox 생성 실패:\n${err.message}`);
      });
      return; // set 이후 onSnapshot이 다시 트리거됨
    }
    
    isInitialDataLoaded = true;
    
    // activeFolderId 유효성 검사
    if (!folders.find(f => f.id === activeFolderId)) {
      activeFolderId = folders[0].id; // 가장 오래된 폴더(대부분 inbox)로 Fallback
    }
    
    renderFolders();
    renderTodos(); // 폴더 목록 갱신 시 투두 목록도 갱신
  }, err => {
    alert(`[Firestore Error] 폴더 동기화 치명적 에러:\n${err.message}`);
    console.error(err);
  });

  // Todos Sync
  unsubscribeTodos = todosRef.onSnapshot(snapshot => {
    todos = [];
    snapshot.forEach(doc => {
      todos.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`[Firestore] 할 일 로드 성공: ${todos.length}개`);
    
    if (isInitialDataLoaded) {
      renderTodos(true); 
    }
  }, err => {
    alert(`[Firestore Error] 할 일 동기화 치명적 에러:\n${err.message}`);
    console.error(err);
  });
}


// ==========================================
// 5. Data Mutators (Firestore Writes)
// ==========================================
function getTodosRef() {
  if (!currentUser) return null;
  return db.collection('users').doc(currentUser.uid).collection('todos');
}
function getFoldersRef() {
  if (!currentUser) return null;
  return db.collection('users').doc(currentUser.uid).collection('folders');
}

function addNewFolder() {
  const ref = getFoldersRef();
  if (!ref) return;
  
  const newFolderRef = ref.doc();
  newFolderRef.set({
    name: 'New Project',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    activeFolderId = newFolderRef.id;
    renderFolders();
    renderTodos();
  }).catch(err => {
    alert(`[Firestore Error] 새 프로젝트 생성 실패:\n${err.message}`);
  });
}

function deleteFolder(folderId, folderName) {
  showModal('폴더 삭제', `'${folderName}' 폴더와 안의 모든 항목이 삭제됩니다.\n계속하시겠습니까?`, true, () => {
    const ref = getFoldersRef();
    if (!ref) return;
    ref.doc(folderId).delete().catch(err => alert(`폴더 삭제 에러:\n${err.message}`));
    
    const todosRef = getTodosRef();
    todos.filter(t => t.folderId === folderId).forEach(t => {
      todosRef.doc(t.id).delete().catch(e => console.error(e));
    });
    
    if (activeFolderId === folderId) {
      activeFolderId = folders.length > 0 ? folders[0].id : 'inbox';
    }
  });
}

function saveFolderName(folderId, newName) {
  const ref = getFoldersRef();
  if (ref) {
    ref.doc(folderId).update({ name: newName }).catch(err => {
      alert(`[Firestore Error] 이름 수정 실패:\n${err.message}`);
    });
  }
}

function addTodo(text, type) {
  const ref = getTodosRef();
  if (!ref) return;
  
  const activeList = getActiveTodos();
  const maxOrder = activeList.length > 0 ? Math.max(...activeList.map(t => t.order)) : 0;
  
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
      filterBtns.forEach(btn => btn.classList.remove('active'));
      document.querySelector('[data-filter="all"]').classList.add('active');
      renderTodos();
    }
  }).catch(err => {
    alert(`[Firestore Error] 할 일 추가 실패:\n${err.message}`);
  });
}

function toggleTodo(id) {
  const ref = getTodosRef();
  const todo = todos.find(t => t.id === id);
  if (ref && todo) {
    ref.doc(id).update({ completed: !todo.completed }).catch(err => {
      alert(`[Firestore Error] 상태 변경 실패:\n${err.message}`);
    });
  }
}

function saveTodoText(id, newText) {
  const ref = getTodosRef();
  if (ref) {
    ref.doc(id).update({ text: newText }).catch(err => {
      alert(`[Firestore Error] 텍스트 수정 실패:\n${err.message}`);
    });
  }
}

function moveToTrash(id) {
  showModal('항목 삭제', '이 항목을 휴지통으로 이동하시겠습니까?', false, () => {
    const ref = getTodosRef();
    if (ref) {
      ref.doc(id).update({ 
        deleted: true, 
        deletedAt: firebase.firestore.FieldValue.serverTimestamp() 
      }).catch(err => alert(`[Firestore Error] 휴지통 이동 실패:\n${err.message}`));
    }
  });
}

function restoreFromTrash(id) {
  showModal('항목 복구', '이 항목을 다시 메인 리스트로 복구하시겠습니까?', false, () => {
    const ref = getTodosRef();
    if (ref) {
      const activeList = getActiveTodos();
      const maxOrder = activeList.length > 0 ? Math.max(...activeList.map(t => t.order)) : 0;
      
      ref.doc(id).update({ 
        deleted: false,
        deletedAt: firebase.firestore.FieldValue.delete(),
        order: maxOrder + 1
      }).catch(err => alert(`[Firestore Error] 항목 복구 실패:\n${err.message}`));
    }
  });
}

function permanentlyDelete(id) {
  showModal('영구 삭제', '정말 이 항목을 완전히 삭제하시겠습니까?', true, () => {
    const ref = getTodosRef();
    if (ref) {
      ref.doc(id).delete().catch(err => alert(`[Firestore Error] 영구 삭제 실패:\n${err.message}`));
    }
  });
}

function emptyTrash() {
  const ref = getTodosRef();
  if (!ref) return;
  
  const batch = db.batch();
  todos.filter(t => t.folderId === activeFolderId && t.deleted).forEach(t => {
    batch.delete(ref.doc(t.id));
  });
  batch.commit().then(() => {
    renderTodos();
  }).catch(err => alert(`[Firestore Error] 휴지통 비우기 실패:\n${err.message}`));
}

function reorderTodos(sourceId, targetId) {
  const activeList = getFilteredTodos();
  const sourceIndex = activeList.findIndex(t => t.id === sourceId);
  const targetIndex = activeList.findIndex(t => t.id === targetId);
  
  if (sourceIndex < 0 || targetIndex < 0) return;
  const sourceTodo = activeList[sourceIndex];
  const targetTodo = activeList[targetIndex];
  
  if (sourceTodo.completed !== targetTodo.completed) return; 
  
  const movedItem = activeList.splice(sourceIndex, 1)[0];
  activeList.splice(targetIndex, 0, movedItem);
  
  const ref = getTodosRef();
  if (!ref) return;
  
  const batch = db.batch();
  activeList.forEach((todo, idx) => {
    if (todo.order !== idx) {
      batch.update(ref.doc(todo.id), { order: idx });
      todo.order = idx; 
    }
  });
  batch.commit().catch(err => alert(`[Firestore Error] 순서 저장 실패:\n${err.message}`));
}


// ==========================================
// 6. UI Event Listeners (Non-Auth)
// ==========================================
mobileMenuBtn?.addEventListener('click', () => {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('show');
});
sidebarOverlay?.addEventListener('click', () => {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('show');
});

typeToggleBtn?.addEventListener('click', () => {
  const currentType = typeToggleBtn.dataset.type;
  const newType = currentType === 'task' ? 'item' : 'task';
  typeToggleBtn.dataset.type = newType;
  typeToggleBtn.textContent = newType === 'task' ? 'Task' : 'Item';
});

addFolderBtn?.addEventListener('click', addNewFolder);

todoForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = todoInput.value.trim();
  if (text) {
    addTodo(text, typeToggleBtn.dataset.type);
    todoInput.value = '';
  }
});

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterState = btn.dataset.filter;
    renderTodos();
  });
});

trashToggle?.addEventListener('click', (e) => {
  if (e.target.closest('.empty-trash-btn')) return;
  trashSection.classList.toggle('open');
});

emptyTrashBtn?.addEventListener('click', () => {
  emptyTrash();
});

currentFolderTitle?.addEventListener('click', () => {
  const currentName = currentFolderTitle.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'folder-header-edit-input';
  input.value = currentName;
  
  currentFolderTitle.parentNode.replaceChild(input, currentFolderTitle);
  input.focus();
  input.select();
  
  let isSaved = false;
  
  const saveAction = () => {
    if (isSaved) return;
    isSaved = true;
    
    const newName = input.value.trim();
    if (!newName) {
      alert('프로젝트 이름을 입력해 주세요.');
      if (input.parentNode) input.parentNode.replaceChild(currentFolderTitle, input);
      return;
    }
    
    currentFolderTitle.textContent = newName;
    if (input.parentNode) {
      input.parentNode.replaceChild(currentFolderTitle, input);
    }
    
    saveFolderName(activeFolderId, newName);
  };
  
  input.addEventListener('blur', saveAction);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveAction();
    if (e.key === 'Escape') {
      isSaved = true;
      if (input.parentNode) input.parentNode.replaceChild(currentFolderTitle, input);
    }
  });
});

modalCancelBtn?.addEventListener('click', closeModal);


// ==========================================
// 7. Drag & Drop Event Handlers
// ==========================================
let dragSourceId = null;
let dragSourceElement = null;

function handleDragStart(e) {
  dragSourceId = this.dataset.id;
  dragSourceElement = this;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSourceId);
  setTimeout(() => this.classList.add('dragging'), 0);
}

function handleDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (this !== dragSourceElement) this.classList.add('drag-over');
  return false;
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  if (e.stopPropagation) e.stopPropagation();
  this.classList.remove('drag-over');
  
  const targetId = this.dataset.id;
  if (dragSourceId && dragSourceId !== targetId) {
    reorderTodos(dragSourceId, targetId);
  }
  return false;
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.todo-item').forEach(item => item.classList.remove('drag-over'));
  dragSourceId = null;
  dragSourceElement = null;
}


// ==========================================
// 8. Rendering & Helper Functions
// ==========================================
function getActiveTodos() {
  let activeList = todos.filter(t => t.folderId === activeFolderId && !t.deleted);
  activeList.sort((a, b) => {
    if (a.completed === b.completed) return a.order - b.order;
    return a.completed ? 1 : -1;
  });
  return activeList;
}

function getFilteredTodos() {
  const list = getActiveTodos();
  if (filterState === 'active') return list.filter(t => !t.completed);
  if (filterState === 'completed') return list.filter(t => t.completed);
  return list;
}

function getTrashTodos() {
  return todos.filter(t => t.folderId === activeFolderId && t.deleted)
              .sort((a, b) => {
                 const aTime = a.deletedAt ? a.deletedAt.toMillis() : 0;
                 const bTime = b.deletedAt ? b.deletedAt.toMillis() : 0;
                 return bTime - aTime;
              });
}

function renderFolders() {
  if (!folderList) return;
  folderList.innerHTML = '';
  
  folders.forEach(folder => {
    const li = document.createElement('li');
    li.className = `folder-item ${folder.id === activeFolderId ? 'active' : ''}`;
    
    const textSpan = document.createElement('span');
    textSpan.className = 'folder-text';
    textSpan.textContent = folder.name;
    
    textSpan.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startFolderEdit(folder.id, li, textSpan);
    });
    
    li.addEventListener('click', () => {
      activeFolderId = folder.id;
      renderFolders();
      renderTodos();
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('show');
    });

    li.appendChild(textSpan);

    if (folder.id !== 'inbox') {
      const delBtn = document.createElement('button');
      delBtn.className = 'folder-delete-btn';
      delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteFolder(folder.id, folder.name);
      });
      li.appendChild(delBtn);
    }
    folderList.appendChild(li);
  });
  
  const activeFolder = folders.find(f => f.id === activeFolderId) || folders[0];
  if (activeFolder && currentFolderTitle) currentFolderTitle.textContent = activeFolder.name;
}

function startFolderEdit(id, liElement, textSpan) {
  const currentName = textSpan.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'folder-edit-input';
  input.value = currentName;
  
  liElement.replaceChild(input, textSpan);
  input.focus();
  input.select();
  
  let isSaved = false;
  
  const saveAction = () => {
    if (isSaved) return;
    isSaved = true;
    
    const newName = input.value.trim() || currentName;
    textSpan.textContent = newName;
    if (input.parentNode) liElement.replaceChild(textSpan, input);
    
    saveFolderName(id, newName);
  };
  
  input.addEventListener('blur', saveAction);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveAction();
    if (e.key === 'Escape') {
      isSaved = true;
      textSpan.textContent = currentName;
      if (input.parentNode) liElement.replaceChild(textSpan, input);
    }
  });
}

function startInlineEdit(id, textElement, originalText) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-edit-input';
  input.value = originalText;
  
  textElement.parentNode.replaceChild(input, textElement);
  input.focus();
  
  const length = input.value.length;
  input.setSelectionRange(length, length);
  
  let isSaved = false;
  
  const saveAction = () => {
    if (isSaved) return;
    isSaved = true;
    
    const newText = input.value.trim();
    const finalText = newText ? newText : originalText;
    
    textElement.textContent = finalText;
    if (input.parentNode) {
      input.parentNode.replaceChild(textElement, input);
    }
    
    saveTodoText(id, finalText);
  };
  
  input.addEventListener('blur', saveAction);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveAction();
    if (e.key === 'Escape') {
      isSaved = true;
      textElement.textContent = originalText;
      if (input.parentNode) {
        input.parentNode.replaceChild(textElement, input);
      }
    }
  });
}

function renderTodos(useAnimation = false) {
  if (!todoList) return;
  const activeList = getActiveTodos();
  const filteredList = getFilteredTodos();
  const trashListArray = getTrashTodos();
  
  let oldPositions = {};
  if (useAnimation) oldPositions = recordPositions(todoList);

  const allCount = activeList.length;
  const completedCount = activeList.filter(t => t.completed).length;
  
  if (badgeAll) badgeAll.textContent = allCount;
  if (badgeActive) badgeActive.textContent = allCount - completedCount;
  if (badgeCompleted) badgeCompleted.textContent = completedCount;
  if (statsText) statsText.textContent = `${completedCount} / ${allCount}`;
  if (trashCount) trashCount.textContent = trashListArray.length;

  todoList.innerHTML = '';
  if (filteredList.length === 0) {
    emptyState.classList.add('show');
  } else {
    emptyState.classList.remove('show');
    
    filteredList.forEach(todo => {
      const li = document.createElement('li');
      li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
      li.dataset.id = todo.id;
      li.draggable = true;
      
      li.addEventListener('dragstart', handleDragStart);
      li.addEventListener('dragover', handleDragOver);
      li.addEventListener('dragleave', handleDragLeave);
      li.addEventListener('drop', handleDrop);
      li.addEventListener('dragend', handleDragEnd);

      const contentDiv = document.createElement('div');
      contentDiv.className = 'todo-content';

      const typeIndicator = document.createElement('span');
      typeIndicator.className = 'type-indicator';
      typeIndicator.textContent = todo.type === 'task' ? '•' : '○';

      const textSpan = document.createElement('span');
      textSpan.className = 'todo-text';
      textSpan.textContent = todo.text;
      
      textSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startInlineEdit(todo.id, textSpan, todo.text);
      });

      contentDiv.appendChild(typeIndicator);
      contentDiv.appendChild(textSpan);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'todo-actions';

      const completeBtn = document.createElement('button');
      completeBtn.className = 'action-btn complete-btn';
      completeBtn.innerHTML = todo.completed ? 
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : 
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
      completeBtn.addEventListener('click', () => toggleTodo(todo.id));

      const delBtn = document.createElement('button');
      delBtn.className = 'action-btn delete-btn';
      delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      delBtn.addEventListener('click', () => moveToTrash(todo.id));

      actionsDiv.appendChild(completeBtn);
      actionsDiv.appendChild(delBtn);

      li.appendChild(contentDiv);
      li.appendChild(actionsDiv);
      todoList.appendChild(li);
    });
  }

  // Render Trash
  renderTrash(trashListArray);
  
  if (useAnimation) playFLIP(todoList, oldPositions);
}

function renderTrash(trashListArray) {
  if (!trashList) return;
  trashList.innerHTML = '';
  
  if (trashListArray.length === 0) {
    trashEmptyState.style.display = 'block';
  } else {
    trashEmptyState.style.display = 'none';
    trashListArray.forEach(todo => {
      const li = document.createElement('li');
      li.className = 'trash-item';

      const textSpan = document.createElement('span');
      textSpan.className = 'trash-text';
      textSpan.textContent = todo.text;

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'trash-actions';

      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'trash-action-btn restore-btn';
      restoreBtn.title = '복구하기';
      restoreBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
      restoreBtn.addEventListener('click', () => restoreFromTrash(todo.id));

      const delBtn = document.createElement('button');
      delBtn.className = 'trash-action-btn perm-delete-btn';
      delBtn.title = '영구 삭제';
      delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
      delBtn.addEventListener('click', () => permanentlyDelete(todo.id));

      actionsDiv.appendChild(restoreBtn);
      actionsDiv.appendChild(delBtn);

      li.appendChild(textSpan);
      li.appendChild(actionsDiv);
      trashList.appendChild(li);
    });
  }
}

// ==========================================
// 9. Modals & FLIP Animation
// ==========================================
function showModal(title, desc, isDestructive, callback) {
  modalTitle.textContent = title;
  modalDesc.textContent = desc;
  modalCallback = callback;
  
  if (isDestructive) {
    modalConfirmBtn.style.color = '#e74c3c';
  } else {
    modalConfirmBtn.style.color = 'var(--text-main)';
  }
  
  confirmModal.classList.add('show');
}

function closeModal() {
  confirmModal.classList.remove('show');
  modalCallback = null;
}

modalConfirmBtn?.addEventListener('click', () => {
  if (modalCallback) modalCallback();
  closeModal();
});

function recordPositions(container) {
  const positions = {};
  [...container.children].forEach(child => {
    if (child.dataset.id) {
      positions[child.dataset.id] = child.getBoundingClientRect().top;
    }
  });
  return positions;
}

function playFLIP(container, oldPositions) {
  [...container.children].forEach(child => {
    const id = child.dataset.id;
    if (id && oldPositions[id] !== undefined) {
      const oldTop = oldPositions[id];
      const newTop = child.getBoundingClientRect().top;
      const deltaY = oldTop - newTop;
      
      if (deltaY !== 0) {
        child.style.transform = `translateY(${deltaY}px)`;
        child.style.transition = 'none';
        
        requestAnimationFrame(() => {
          child.style.transform = '';
          child.style.transition = 'transform var(--transition-normal)';
        });
      }
    }
  });
}
