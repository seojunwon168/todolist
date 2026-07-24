// State Management
let folders = JSON.parse(localStorage.getItem('tasks_minimal_folders')) || [{ id: 'inbox', name: 'Inbox' }];
let activeFolderId = localStorage.getItem('tasks_minimal_active_folder') || 'inbox';
let todos = JSON.parse(localStorage.getItem('tasks_minimal_data_v2')) || [];
let filterState = 'all';

// DOM Elements - General
const todoForm = document.getElementById('todoForm');
const todoInput = document.getElementById('todoInput');
const todoList = document.getElementById('todoList');
const emptyState = document.getElementById('emptyState');
const statsText = document.getElementById('statsText');
const typeToggleBtn = document.getElementById('typeToggleBtn');

// DOM Elements - Sidebar & Mobile
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const folderList = document.getElementById('folderList');
const addFolderBtn = document.getElementById('addFolderBtn');
const currentFolderTitle = document.getElementById('currentFolderTitle');

// DOM Elements - Filters & Trash
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

// DOM Elements - Modal
const confirmModal = document.getElementById('confirmModal');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');

let modalCallback = null;

// Initialize
function init() {
  migrateOldData(); // Migrate if previous version data exists
  setupEventListeners();
  renderFolders();
  renderTodos();
}

// Data Migration (from v1 to v2)
function migrateOldData() {
  const oldData = JSON.parse(localStorage.getItem('tasks_minimal_data'));
  if (oldData && !localStorage.getItem('tasks_minimal_data_v2')) {
    todos = oldData.map((item, index) => ({
      ...item,
      folderId: 'inbox',
      type: 'task',
      order: index
    }));
    saveData();
    localStorage.removeItem('tasks_minimal_data');
  }
}

// Save to LocalStorage
function saveData() {
  localStorage.setItem('tasks_minimal_data_v2', JSON.stringify(todos));
  localStorage.setItem('tasks_minimal_folders', JSON.stringify(folders));
  localStorage.setItem('tasks_minimal_active_folder', activeFolderId);
}

/* ================================
   Event Listeners Setup
================================ */
function setupEventListeners() {
  // Mobile Sidebar
  mobileMenuBtn.addEventListener('click', () => {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('show');
  });
  sidebarOverlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('show');
  });

  // Type Toggle (Task / Item)
  typeToggleBtn.addEventListener('click', () => {
    const currentType = typeToggleBtn.dataset.type;
    const newType = currentType === 'task' ? 'item' : 'task';
    typeToggleBtn.dataset.type = newType;
    typeToggleBtn.textContent = newType === 'task' ? 'Task' : 'Item';
  });

  // Folder Actions
  addFolderBtn.addEventListener('click', addNewFolder);

  // Todo Form
  todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = todoInput.value.trim();
    if (text) {
      addTodo(text, typeToggleBtn.dataset.type);
      todoInput.value = '';
    }
  });

  // Filters
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterState = btn.dataset.filter;
      renderTodos();
    });
  });

  // Trash Accordion
  trashToggle.addEventListener('click', (e) => {
    if (e.target.closest('.empty-trash-btn')) return;
    trashSection.classList.toggle('open');
  });

  // Empty Trash
  emptyTrashBtn.addEventListener('click', () => {
    showModal(
      '휴지통 비우기',
      '휴지통을 모두 비우시겠습니까?\n이 작업은 되돌릴 수 없습니다.',
      true,
      () => {
        todos = todos.filter(t => !t.deleted);
        saveData();
        renderTodos();
      }
    );
  });

  // Modal Cancel
  modalCancelBtn.addEventListener('click', closeModal);
}

/* ================================
   Folder System (Sidebar)
================================ */
function renderFolders() {
  folderList.innerHTML = '';
  
  folders.forEach(folder => {
    const li = document.createElement('li');
    li.className = `folder-item ${folder.id === activeFolderId ? 'active' : ''}`;
    
    const textSpan = document.createElement('span');
    textSpan.className = 'folder-text';
    textSpan.textContent = folder.name;
    
    // Double click to rename folder
    textSpan.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startFolderEdit(folder.id, li, textSpan);
    });
    
    li.addEventListener('click', () => {
      activeFolderId = folder.id;
      saveData();
      renderFolders();
      renderTodos();
      // Close sidebar on mobile
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
  currentFolderTitle.textContent = activeFolder.name;
}

function addNewFolder() {
  const folderId = 'folder_' + Date.now();
  const folderName = 'New Project';
  folders.push({ id: folderId, name: folderName });
  activeFolderId = folderId;
  saveData();
  renderFolders();
  renderTodos();
  
  // Try to focus the newly added folder for editing
  setTimeout(() => {
    const items = folderList.querySelectorAll('.folder-item');
    const lastItem = items[items.length - 1];
    if (lastItem) {
      const textSpan = lastItem.querySelector('.folder-text');
      startFolderEdit(folderId, lastItem, textSpan);
    }
  }, 10);
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
  
  const saveFolder = () => {
    const newName = input.value.trim() || currentName;
    const folder = folders.find(f => f.id === id);
    if (folder) folder.name = newName;
    saveData();
    renderFolders();
  };
  
  input.addEventListener('blur', saveFolder);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveFolder();
    if (e.key === 'Escape') {
      input.value = currentName;
      saveFolder();
    }
  });
}

function deleteFolder(folderId, folderName) {
  showModal(
    '폴더 삭제',
    `'${folderName}' 폴더와 안에 있는 모든 할 일이 삭제됩니다.\n계속하시겠습니까?`,
    true,
    () => {
      // Remove folder
      folders = folders.filter(f => f.id !== folderId);
      // Remove all todos inside this folder
      todos = todos.filter(t => t.folderId !== folderId);
      
      activeFolderId = 'inbox';
      saveData();
      renderFolders();
      renderTodos();
    }
  );
}

/* ================================
   Todo Management
================================ */
function getActiveTodos() {
  // Sort logic: Incomplete first, then completed. Within same group, sort by custom 'order'.
  let activeList = todos.filter(t => t.folderId === activeFolderId && !t.deleted);
  
  activeList.sort((a, b) => {
    if (a.completed === b.completed) {
      return a.order - b.order;
    }
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
  return todos.filter(t => t.folderId === activeFolderId && t.deleted).sort((a, b) => b.deletedAt - a.deletedAt);
}

function addTodo(text, type) {
  const activeList = getActiveTodos();
  const maxOrder = activeList.length > 0 ? Math.max(...activeList.map(t => t.order)) : 0;
  
  const newTodo = {
    id: Date.now().toString(),
    folderId: activeFolderId,
    text: text,
    completed: false,
    type: type, // 'task' or 'item'
    order: maxOrder + 1,
    createdAt: Date.now()
  };
  
  todos.push(newTodo);
  saveData();
  
  // If filter is completed, switch to all to see the new item
  if (filterState === 'completed') {
    filterState = 'all';
    filterBtns.forEach(btn => btn.classList.remove('active'));
    document.querySelector('[data-filter="all"]').classList.add('active');
  }
  
  renderTodos();
}

function toggleTodo(id) {
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    saveData();
    renderTodos(true); // pass true for FLIP animation
  }
}

function startInlineEdit(id, textElement) {
  const todo = todos.find(t => t.id === id);
  if (!todo || todo.completed) return; // Disallow editing completed items
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-edit-input';
  input.value = todo.text;
  
  textElement.parentNode.replaceChild(input, textElement);
  input.focus();
  
  // Place cursor at end
  const length = input.value.length;
  input.setSelectionRange(length, length);
  
  const saveEdit = () => {
    const newText = input.value.trim();
    if (newText) {
      todo.text = newText;
    }
    saveData();
    renderTodos(); // Re-render to restore text spans
  };
  
  input.addEventListener('blur', saveEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') {
      input.value = todo.text; // Revert
      saveEdit();
    }
  });
}

function moveToTrash(id) {
  showModal(
    '항목 삭제',
    '이 항목을 휴지통으로 이동하시겠습니까?',
    false,
    () => {
      const todo = todos.find(t => t.id === id);
      if (todo) {
        todo.deleted = true;
        todo.deletedAt = Date.now();
        saveData();
        renderTodos(true);
      }
    }
  );
}

function restoreFromTrash(id) {
  showModal(
    '항목 복구',
    '이 항목을 다시 메인 리스트로 복구하시겠습니까?',
    false,
    () => {
      const todo = todos.find(t => t.id === id);
      if (todo) {
        todo.deleted = false;
        delete todo.deletedAt;
        
        // Put at the bottom of the list order
        const activeList = getActiveTodos();
        const maxOrder = activeList.length > 0 ? Math.max(...activeList.map(t => t.order)) : 0;
        todo.order = maxOrder + 1;
        
        saveData();
        renderTodos();
      }
    }
  );
}

function permanentlyDelete(id) {
  showModal(
    '영구 삭제',
    '정말 이 항목을 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.',
    true,
    () => {
      todos = todos.filter(t => t.id !== id);
      saveData();
      renderTodos();
    }
  );
}

/* ================================
   Drag & Drop Reordering
================================ */
let dragSourceId = null;
let dragSourceElement = null;

function handleDragStart(e) {
  dragSourceId = this.dataset.id;
  dragSourceElement = this;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSourceId);
  
  // Slight delay to allow the drag image to be captured without the dragging class styling
  setTimeout(() => {
    this.classList.add('dragging');
  }, 0);
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault(); // Necessary to allow dropping
  }
  e.dataTransfer.dropEffect = 'move';
  
  if (this !== dragSourceElement) {
    this.classList.add('drag-over');
  }
  return false;
}

function handleDragEnter(e) {
  // Prevent visual flickering if needed
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
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
  const activeList = getFilteredTodos(); // Currently displayed list
  
  const sourceIndex = activeList.findIndex(t => t.id === sourceId);
  const targetIndex = activeList.findIndex(t => t.id === targetId);
  
  if (sourceIndex < 0 || targetIndex < 0) return;
  
  const sourceTodo = activeList[sourceIndex];
  const targetTodo = activeList[targetIndex];
  
  // Constraint: Prevent mixing completed and incomplete via drag&drop for simplicity
  if (sourceTodo.completed !== targetTodo.completed) {
    return; // Ignore drop across status boundaries
  }
  
  // Reassign orders within the visual list
  // Remove source, insert at target
  const movedItem = activeList.splice(sourceIndex, 1)[0];
  activeList.splice(targetIndex, 0, movedItem);
  
  // Re-calculate orders for all items in the group to maintain consistent increasing order
  activeList.forEach((todo, idx) => {
    todo.order = idx;
  });
  
  saveData();
  renderTodos(true); // Use FLIP to animate reordering
}

/* ================================
   Rendering & FLIP Animation
================================ */
function renderTodos(useAnimation = false) {
  const activeList = getActiveTodos();
  const filteredList = getFilteredTodos();
  const trashListArray = getTrashTodos();
  
  // Record positions for FLIP
  let oldPositions = {};
  if (useAnimation) {
    oldPositions = recordPositions(todoList);
  }

  // Update Badges & Stats
  const allCount = activeList.length;
  const completedCount = activeList.filter(t => t.completed).length;
  const activeCount = allCount - completedCount;
  
  badgeAll.textContent = allCount;
  badgeActive.textContent = activeCount;
  badgeCompleted.textContent = completedCount;
  statsText.textContent = `${completedCount} / ${allCount}`;
  
  trashCount.textContent = trashListArray.length;

  // Render Main List
  todoList.innerHTML = '';
  if (filteredList.length === 0) {
    emptyState.classList.add('show');
  } else {
    emptyState.classList.remove('show');
    
    filteredList.forEach(todo => {
      const li = document.createElement('li');
      li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
      li.dataset.id = todo.id;
      // Make item draggable
      li.draggable = true;
      
      // Drag events
      li.addEventListener('dragstart', handleDragStart);
      li.addEventListener('dragenter', handleDragEnter);
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
      typeBadge.className = `item-badge ${todo.type}`;
      typeBadge.textContent = todo.type === 'task' ? 'T' : 'I';
      typeBadge.title = todo.type === 'task' ? '작업 (Task)' : '물품 (Item)';

      const textSpan = document.createElement('span');
      textSpan.className = 'todo-text';
      textSpan.textContent = todo.text;
      textSpan.title = '더블클릭하여 수정';
      // Inline edit
      textSpan.addEventListener('dblclick', () => startInlineEdit(todo.id, textSpan));
      // For mobile: simple click can also trigger edit if they touch it exactly
      // But double tap is safer on mobile to prevent accidental edits while dragging.

      contentDiv.appendChild(checkbox);
      contentDiv.appendChild(typeBadge);
      contentDiv.appendChild(textSpan);

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.title = '휴지통으로 이동';
      delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
      delBtn.addEventListener('click', () => moveToTrash(todo.id));

      li.appendChild(contentDiv);
      li.appendChild(delBtn);
      
      if (!useAnimation) {
        li.classList.add('item-enter'); // Initial enter animation
      }
      
      todoList.appendChild(li);
    });
  }
  
  if (useAnimation) {
    animateFLIP(todoList, oldPositions);
  }

  // Render Trash List
  renderTrashList(trashListArray);
}

function renderTrashList(trashListArray) {
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

/* ================================
   FLIP Animation Logic
================================ */
function recordPositions(container) {
  const positions = {};
  const children = Array.from(container.children);
  children.forEach(child => {
    if (child.dataset.id) {
      positions[child.dataset.id] = child.getBoundingClientRect().top;
    }
  });
  return positions;
}

function animateFLIP(container, oldPositions) {
  const children = Array.from(container.children);
  
  children.forEach(child => {
    const id = child.dataset.id;
    if (id && oldPositions[id] !== undefined) {
      const oldY = oldPositions[id];
      const newY = child.getBoundingClientRect().top;
      const deltaY = oldY - newY;
      
      if (deltaY !== 0) {
        // Invert
        child.style.transform = `translateY(${deltaY}px)`;
        child.style.transition = 'transform 0s';
        
        // Play
        requestAnimationFrame(() => {
          child.style.transform = '';
          child.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        });
      }
    } else if (id) {
      // New item entering during animation
      child.classList.add('item-enter');
    }
  });
}

/* ================================
   Custom Modal Logic
================================ */
function showModal(title, desc, isDestructive, onConfirm) {
  modalTitle.textContent = title;
  modalDesc.textContent = desc;
  
  if (isDestructive) {
    modalConfirmBtn.classList.add('destructive');
  } else {
    modalConfirmBtn.classList.remove('destructive');
  }
  
  modalCallback = onConfirm;
  confirmModal.classList.add('show');
}

function closeModal() {
  confirmModal.classList.remove('show');
  modalCallback = null;
}

modalConfirmBtn.addEventListener('click', () => {
  if (modalCallback) modalCallback();
  closeModal();
});

// Start app
init();
