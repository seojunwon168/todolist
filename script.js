// ==========================================
// 1. Firebase Initialization & Auth state
// ==========================================
let db;
let auth;
let currentUser = null;
let unsubscribeFolders = null;
let unsubscribeTodos = null;

// The config will be empty by default, wait for user to fill it in index.html
if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
  auth = firebase.auth();
  db = firebase.firestore();
  
  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      document.getElementById('loginContainer').style.display = 'none';
      document.getElementById('appContainer').style.display = 'flex';
      setupFirestoreListeners(user.uid);
    } else {
      currentUser = null;
      document.getElementById('loginContainer').style.display = 'flex';
      document.getElementById('appContainer').style.display = 'none';
      clearLocalData();
    }
  });
} else {
  console.warn('Firebase config is missing or invalid in index.html');
}

// ==========================================
// 2. Auth UI Handlers
// ==========================================
const authForm = document.getElementById('authForm');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const naverLoginBtn = document.getElementById('naverLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');

authForm?.addEventListener('submit', (e) => {
  e.preventDefault(); // Default to login on enter
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password || !auth) return;
  
  auth.signInWithEmailAndPassword(email, password)
    .catch(error => {
      alert('로그인 실패: ' + error.message);
    });
});

signupBtn?.addEventListener('click', () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password || !auth) return;
  
  auth.createUserWithEmailAndPassword(email, password)
    .catch(error => {
      alert('가입 실패: ' + error.message);
    });
});

logoutBtn?.addEventListener('click', () => {
  if (auth) {
    auth.signOut();
  }
});

naverLoginBtn?.addEventListener('click', () => {
  alert('네이버 로그인(소셜 로그인) 연동은 외부 REST API 설정이 필요합니다. (뼈대 함수)');
  // Example for other social logins:
  // const provider = new firebase.auth.GoogleAuthProvider();
  // auth.signInWithPopup(provider);
});


// ==========================================
// 3. State Management (Local Mirror)
// ==========================================
let folders = [];
let activeFolderId = 'inbox';
let todos = [];
let filterState = 'all';

function clearLocalData() {
  folders = [];
  todos = [];
  activeFolderId = 'inbox';
  if (unsubscribeFolders) unsubscribeFolders();
  if (unsubscribeTodos) unsubscribeTodos();
}


// ==========================================
// 4. Firestore Realtime Listeners
// ==========================================
function setupFirestoreListeners(uid) {
  // Listen to Folders
  unsubscribeFolders = db.collection('users').doc(uid).collection('folders')
    .orderBy('createdAt', 'asc')
    .onSnapshot(snapshot => {
      folders = [];
      snapshot.forEach(doc => {
        folders.push({ id: doc.id, ...doc.data() });
      });
      
      // Default Inbox logic
      if (folders.length === 0) {
        db.collection('users').doc(uid).collection('folders').doc('inbox').set({
          name: 'Inbox',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return;
      }
      
      // Ensure activeFolderId is valid
      if (!folders.find(f => f.id === activeFolderId)) {
        activeFolderId = folders[0].id;
      }
      renderFolders();
      renderTodos();
    }, err => {
      console.error('Folder sync error:', err);
    });

  // Listen to Todos
  unsubscribeTodos = db.collection('users').doc(uid).collection('todos')
    .onSnapshot(snapshot => {
      todos = [];
      snapshot.forEach(doc => {
        todos.push({ id: doc.id, ...doc.data() });
      });
      renderTodos(true); // use FLIP animation on realtime updates
    }, err => {
      console.error('Todo sync error:', err);
    });
}


// ==========================================
// 5. DOM Elements
// ==========================================
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
// 6. UI Event Listeners
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
  showModal('휴지통 비우기', '휴지통을 모두 비우시겠습니까?\n이 작업은 되돌릴 수 없습니다.', true, emptyTrash);
});

modalCancelBtn?.addEventListener('click', closeModal);


// ==========================================
// 7. Data Mutators (Firestore Writes)
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
    // Focus rename logic is slightly trickier with async, handled conceptually here.
  });
}

function deleteFolder(folderId, folderName) {
  showModal('폴더 삭제', `'${folderName}' 폴더와 안의 모든 항목이 삭제됩니다.\n계속하시겠습니까?`, true, () => {
    const ref = getFoldersRef();
    if (!ref) return;
    ref.doc(folderId).delete();
    
    // Also delete all todos inside this folder
    const todosRef = getTodosRef();
    todos.filter(t => t.folderId === folderId).forEach(t => {
      todosRef.doc(t.id).delete();
    });
    
    if (activeFolderId === folderId) {
      activeFolderId = 'inbox';
    }
  });
}

function saveFolderName(folderId, newName) {
  const ref = getFoldersRef();
  if (ref) {
    ref.doc(folderId).update({ name: newName });
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
  });
  
  if (filterState === 'completed') {
    filterState = 'all';
    filterBtns.forEach(btn => btn.classList.remove('active'));
    document.querySelector('[data-filter="all"]').classList.add('active');
  }
}

function toggleTodo(id) {
  const ref = getTodosRef();
  const todo = todos.find(t => t.id === id);
  if (ref && todo) {
    ref.doc(id).update({ completed: !todo.completed });
  }
}

function saveTodoText(id, newText) {
  const ref = getTodosRef();
  if (ref) {
    ref.doc(id).update({ text: newText });
  }
}

function moveToTrash(id) {
  showModal('항목 삭제', '이 항목을 휴지통으로 이동하시겠습니까?', false, () => {
    const ref = getTodosRef();
    if (ref) {
      ref.doc(id).update({ 
        deleted: true, 
        deletedAt: firebase.firestore.FieldValue.serverTimestamp() 
      });
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
      });
    }
  });
}

function permanentlyDelete(id) {
  showModal('영구 삭제', '정말 이 항목을 완전히 삭제하시겠습니까?', true, () => {
    const ref = getTodosRef();
    if (ref) ref.doc(id).delete();
  });
}

function emptyTrash() {
  const ref = getTodosRef();
  if (!ref) return;
  
  // Batch delete all deleted items
  const batch = db.batch();
  todos.filter(t => t.deleted).forEach(t => {
    batch.delete(ref.doc(t.id));
  });
  batch.commit();
}


/* ================================
   Drag & Drop Reordering (Firestore Batch)
================================ */
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

function reorderTodos(sourceId, targetId) {
  const activeList = getFilteredTodos();
  const sourceIndex = activeList.findIndex(t => t.id === sourceId);
  const targetIndex = activeList.findIndex(t => t.id === targetId);
  
  if (sourceIndex < 0 || targetIndex < 0) return;
  const sourceTodo = activeList[sourceIndex];
  const targetTodo = activeList[targetIndex];
  
  if (sourceTodo.completed !== targetTodo.completed) return; // Prevent mixing
  
  // Visual array reordering
  const movedItem = activeList.splice(sourceIndex, 1)[0];
  activeList.splice(targetIndex, 0, movedItem);
  
  // Update orders in DB using Batch
  const ref = getTodosRef();
  if (!ref) return;
  
  const batch = db.batch();
  activeList.forEach((todo, idx) => {
    // Only update if order changed
    if (todo.order !== idx) {
      batch.update(ref.doc(todo.id), { order: idx });
      todo.order = idx; // optimistic local update
    }
  });
  batch.commit();
}


/* ================================
   Rendering & Helper Functions
================================ */
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
  if (activeFolder) currentFolderTitle.textContent = activeFolder.name;
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
  
  const saveAction = () => {
    const newName = input.value.trim() || currentName;
    saveFolderName(id, newName);
    // Realtime listener will handle re-render
  };
  
  input.addEventListener('blur', saveAction);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveAction();
    if (e.key === 'Escape') {
      input.value = currentName;
      saveAction();
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
  
  const saveAction = () => {
    const newText = input.value.trim();
    if (newText) {
      saveTodoText(id, newText);
    } else {
      saveTodoText(id, originalText); // Revert if empty
    }
  };
  
  input.addEventListener('blur', saveAction);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveAction();
    if (e.key === 'Escape') {
      input.value = originalText;
      saveAction();
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

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'todo-checkbox';
      checkbox.checked = todo.completed;
      checkbox.addEventListener('change', () => toggleTodo(todo.id));

      const typeBadge = document.createElement('span');
      typeBadge.className = `item-badge ${todo.type || 'task'}`;
      typeBadge.textContent = todo.type === 'task' ? 'T' : 'I';

      const textSpan = document.createElement('span');
      textSpan.className = 'todo-text';
      textSpan.textContent = todo.text;
      
      if (!todo.completed) {
        textSpan.addEventListener('dblclick', () => startInlineEdit(todo.id, textSpan, todo.text));
      }

      contentDiv.appendChild(checkbox);
      contentDiv.appendChild(typeBadge);
      contentDiv.appendChild(textSpan);

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
      delBtn.addEventListener('click', () => moveToTrash(todo.id));

      li.appendChild(contentDiv);
      li.appendChild(delBtn);
      
      if (!useAnimation) li.classList.add('item-enter');
      todoList.appendChild(li);
    });
  }
  
  if (useAnimation) animateFLIP(todoList, oldPositions);
  
  renderTrashList(trashListArray);
}

function renderTrashList(trashListArray) {
  if (!trashList) return;
  trashList.innerHTML = '';
  
  if (trashListArray.length === 0) {
    trashEmptyState.classList.add('show');
    emptyTrashBtn.style.display = 'none';
  } else {
    trashEmptyState.classList.remove('show');
    emptyTrashBtn.style.display = 'block';
    
    trashListArray.forEach(todo => {
      const li = document.createElement('li');
      li.className = 'trash-item item-enter';
      
      const textSpan = document.createElement('span');
      textSpan.className = 'trash-text';
      const badgePrefix = todo.type === 'item' ? '[I] ' : '[T] ';
      textSpan.textContent = badgePrefix + todo.text;
      
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'trash-actions';
      
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'action-btn restore';
      restoreBtn.textContent = '복구';
      restoreBtn.addEventListener('click', () => restoreFromTrash(todo.id));
      
      const permDelBtn = document.createElement('button');
      permDelBtn.className = 'action-btn permanent-delete';
      permDelBtn.textContent = '영구 삭제';
      permDelBtn.addEventListener('click', () => permanentlyDelete(todo.id));
      
      actionsDiv.appendChild(restoreBtn);
      actionsDiv.appendChild(permDelBtn);
      
      li.appendChild(textSpan);
      li.appendChild(actionsDiv);
      trashList.appendChild(li);
    });
  }
}

// FLIP Animation
function recordPositions(container) {
  const positions = {};
  Array.from(container.children).forEach(child => {
    if (child.dataset.id) positions[child.dataset.id] = child.getBoundingClientRect().top;
  });
  return positions;
}

function animateFLIP(container, oldPositions) {
  Array.from(container.children).forEach(child => {
    const id = child.dataset.id;
    if (id && oldPositions[id] !== undefined) {
      const deltaY = oldPositions[id] - child.getBoundingClientRect().top;
      if (deltaY !== 0) {
        child.style.transform = `translateY(${deltaY}px)`;
        child.style.transition = 'transform 0s';
        requestAnimationFrame(() => {
          child.style.transform = '';
          child.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        });
      }
    } else if (id) {
      child.classList.add('item-enter');
    }
  });
}

// Modal Custom Confirm
function showModal(title, desc, isDestructive, onConfirm) {
  modalTitle.textContent = title;
  modalDesc.textContent = desc;
  if (isDestructive) modalConfirmBtn.classList.add('destructive');
  else modalConfirmBtn.classList.remove('destructive');
  
  modalCallback = onConfirm;
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
