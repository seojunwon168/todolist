/**
 * Tasks — 초미니멀리즘 자동 정렬 To-Do List with Trash & Custom Confirmation Modal
 * Notion / Linear 감성의 간결한 UI/UX, FLIP 자동 정렬, 아코디언 휴지통, 커스텀 모달 확인 로직
 */

class MinimalTodoApp {
  constructor() {
    this.todos = JSON.parse(localStorage.getItem('tasks_minimal_data')) || [
      { id: 1, text: 'Linear 스타일의 여백과 간결한 1px 보더 라인 확인하기', completed: false, deleted: false, createdAt: Date.now() - 3000 },
      { id: 2, text: '완료 체크박스를 클릭하여 하단으로 자동 정렬 테스트하기', completed: false, deleted: false, createdAt: Date.now() - 2000 },
      { id: 3, text: '휴지통으로 이동 후 아코디언에서 복구 또는 영구 삭제하기', completed: true, deleted: false, createdAt: Date.now() - 1000 },
      { id: 4, text: '이전에 삭제된 샘플 할 일 항목 (복구 가능)', completed: false, deleted: true, createdAt: Date.now() - 4000, deletedAt: Date.now() - 500 }
    ];
    this.currentFilter = 'all';
    this.isTrashOpen = false;
    this.activeModalConfirmCallback = null;

    document.addEventListener('DOMContentLoaded', () => this.init());
  }

  init() {
    // DOM 요소 바인딩
    this.todoForm = document.getElementById('todoForm');
    this.todoInput = document.getElementById('todoInput');
    this.todoList = document.getElementById('todoList');
    this.emptyState = document.getElementById('emptyState');
    this.statsText = document.getElementById('statsText');
    
    this.badgeAll = document.getElementById('badgeAll');
    this.badgeActive = document.getElementById('badgeActive');
    this.badgeCompleted = document.getElementById('badgeCompleted');
    this.filterBtns = document.querySelectorAll('.filter-btn');

    // 휴지통 관련 DOM
    this.trashSection = document.querySelector('.trash-section');
    this.trashToggle = document.getElementById('trashToggle');
    this.trashTitleArea = document.querySelector('.trash-title-area');
    this.trashList = document.getElementById('trashList');
    this.trashCount = document.getElementById('trashCount');
    this.trashEmptyState = document.getElementById('trashEmptyState');
    this.emptyTrashBtn = document.getElementById('emptyTrashBtn');

    // 커스텀 모달 관련 DOM
    this.confirmModal = document.getElementById('confirmModal');
    this.modalTitle = document.getElementById('modalTitle');
    this.modalDesc = document.getElementById('modalDesc');
    this.modalCancelBtn = document.getElementById('modalCancelBtn');
    this.modalConfirmBtn = document.getElementById('modalConfirmBtn');

    this.bindEvents();
    this.render(false);
  }

  bindEvents() {
    // 1. 할 일 추가
    this.todoForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.addTodo();
    });

    // 2. 필터 변경
    this.filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.render(false);
      });
    });

    // 3. 휴지통 아코디언 토글
    this.trashTitleArea.addEventListener('click', () => {
      this.isTrashOpen = !this.isTrashOpen;
      this.trashSection.classList.toggle('open', this.isTrashOpen);
    });

    // 4. 휴지통 비우기 버튼
    this.emptyTrashBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.emptyTrash();
    });

    // 5. 모달 제어 이벤트 (취소, 확인, 오버레이 클릭, ESC/Enter 키 처리)
    this.modalCancelBtn.addEventListener('click', () => this.hideConfirmModal());
    
    this.modalConfirmBtn.addEventListener('click', () => {
      if (typeof this.activeModalConfirmCallback === 'function') {
        this.activeModalConfirmCallback();
      }
      this.hideConfirmModal();
    });

    this.confirmModal.addEventListener('click', (e) => {
      if (e.target === this.confirmModal) {
        this.hideConfirmModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!this.confirmModal.classList.contains('show')) return;
      if (e.key === 'Escape') {
        this.hideConfirmModal();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.modalConfirmBtn.click();
      }
    });
  }

  /**
   * 커스텀 확인 모달 표시 Helper
   */
  showConfirmModal({ title, desc, confirmText = '확인', isDestructive = false, onConfirm }) {
    this.modalTitle.textContent = title;
    this.modalDesc.textContent = desc;
    this.modalConfirmBtn.textContent = confirmText;
    
    if (isDestructive) {
      this.modalConfirmBtn.classList.add('destructive');
    } else {
      this.modalConfirmBtn.classList.remove('destructive');
    }

    this.activeModalConfirmCallback = onConfirm;
    this.confirmModal.classList.add('show');
    this.modalConfirmBtn.focus();
  }

  /**
   * 커스텀 확인 모달 숨기기 Helper
   */
  hideConfirmModal() {
    this.confirmModal.classList.remove('show');
    this.activeModalConfirmCallback = null;
  }

  /**
   * 새로운 할 일 추가
   */
  addTodo() {
    const text = this.todoInput.value.trim();
    if (!text) return;

    const positionsBefore = this.recordPositions();

    const newTodo = {
      id: Date.now(),
      text: text,
      completed: false,
      deleted: false,
      createdAt: Date.now()
    };

    this.todos.push(newTodo);
    this.saveToStorage();

    this.render(true, positionsBefore, newTodo.id);
    this.todoInput.value = '';
    this.todoInput.focus();
  }

  /**
   * 완료 상태 토글 및 FLIP 자동 정렬
   */
  toggleTodo(id) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;

    const positionsBefore = this.recordPositions();
    todo.completed = !todo.completed;
    this.saveToStorage();

    this.render(true, positionsBefore);
  }

  /**
   * 1. 메인 리스트에서 휴지통으로 이동 시 확인 (삭제 시 확인)
   */
  moveToTrash(id) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;

    this.showConfirmModal({
      title: '휴지통으로 이동',
      desc: `"${todo.text}" 항목을 휴지통으로 이동하시겠습니까?`,
      confirmText: '이동',
      isDestructive: false,
      onConfirm: () => {
        const positionsBefore = this.recordPositions();
        todo.deleted = true;
        todo.deletedAt = Date.now();
        this.saveToStorage();
        this.render(true, positionsBefore);
      }
    });
  }

  /**
   * 2. 휴지통에서 메인 리스트로 복구 시 확인 (복구 시 확인)
   */
  restoreTodo(id) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;

    this.showConfirmModal({
      title: '할 일 복구',
      desc: `"${todo.text}" 항목을 메인 리스트로 복구하시겠습니까?`,
      confirmText: '복구',
      isDestructive: false,
      onConfirm: () => {
        const positionsBefore = this.recordPositions();
        todo.deleted = false;
        todo.deletedAt = null;
        this.saveToStorage();
        this.render(true, positionsBefore, id);
      }
    });
  }

  /**
   * 3. 휴지통에서 영구 삭제 시 확인 (영구 삭제 시 확인)
   */
  permanentDeleteTodo(id) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;

    this.showConfirmModal({
      title: '영구 삭제',
      desc: `"${todo.text}" 항목을 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
      confirmText: '영구 삭제',
      isDestructive: true,
      onConfirm: () => {
        this.todos = this.todos.filter(t => t.id !== id);
        this.saveToStorage();
        this.render(false);
      }
    });
  }

  /**
   * 4. 휴지통 전체 비우기 시 확인 (휴지통 비우기 확인)
   */
  emptyTrash() {
    const trashItems = this.todos.filter(t => t.deleted);
    if (trashItems.length === 0) return;

    this.showConfirmModal({
      title: '휴지통 전체 비우기',
      desc: `휴지통에 있는 ${trashItems.length}개의 할 일을 모두 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
      confirmText: '모두 비우기',
      isDestructive: true,
      onConfirm: () => {
        this.todos = this.todos.filter(t => !t.deleted);
        this.saveToStorage();
        this.render(false);
      }
    });
  }

  /**
   * 정렬 규칙 (미완료 항목 상단, 완료 항목 하단)
   */
  getSortedMainTodos() {
    return this.todos
      .filter(t => !t.deleted)
      .sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        return b.createdAt - a.createdAt;
      });
  }

  /**
   * 필터링 적용
   */
  getFilteredTodos(sortedTodos) {
    if (this.currentFilter === 'active') return sortedTodos.filter(t => !t.completed);
    if (this.currentFilter === 'completed') return sortedTodos.filter(t => t.completed);
    return sortedTodos;
  }

  /**
   * 휴지통 항목 가져오기 (최신 삭제 순)
   */
  getTrashTodos() {
    return this.todos
      .filter(t => t.deleted)
      .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  }

  /**
   * FLIP 전 위치 기록
   */
  recordPositions() {
    const positions = {};
    this.todoList.querySelectorAll('.todo-item').forEach(item => {
      const id = Number(item.dataset.id);
      positions[id] = item.getBoundingClientRect().top;
    });
    return positions;
  }

  /**
   * FLIP 애니메이션 실행
   */
  animateFLIP(positionsBefore, newId = null) {
    this.todoList.querySelectorAll('.todo-item').forEach(item => {
      const id = Number(item.dataset.id);
      if (id === newId) {
        item.classList.add('item-enter');
        return;
      }
      const topBefore = positionsBefore[id];
      if (topBefore !== undefined) {
        const topAfter = item.getBoundingClientRect().top;
        const deltaY = topBefore - topAfter;
        if (deltaY !== 0) {
          item.style.transition = 'none';
          item.style.transform = `translateY(${deltaY}px)`;
          requestAnimationFrame(() => {
            item.getBoundingClientRect();
            item.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
            item.style.transform = 'translateY(0)';
          });
        }
      }
    });
  }

  /**
   * 화면 전체 렌더링
   */
  render(animate = false, positionsBefore = {}, newId = null) {
    const activeList = this.getSortedMainTodos();
    const displayList = this.getFilteredTodos(activeList);
    const trashList = this.getTrashTodos();

    // 1. 통계 및 뱃지 업데이트
    const totalCount = activeList.length;
    const completedCount = activeList.filter(t => t.completed).length;
    const activeCount = totalCount - completedCount;

    this.statsText.textContent = `${completedCount} / ${totalCount}`;
    this.badgeAll.textContent = totalCount;
    this.badgeActive.textContent = activeCount;
    this.badgeCompleted.textContent = completedCount;
    this.trashCount.textContent = trashList.length;

    // 2. 메인 리스트 렌더링
    if (displayList.length === 0) {
      this.todoList.innerHTML = '';
      this.emptyState.classList.add('show');
    } else {
      this.emptyState.classList.remove('show');
      this.todoList.innerHTML = displayList.map(todo => `
        <li class="todo-item ${todo.completed ? 'completed' : ''}" data-id="${todo.id}">
          <label class="todo-content">
            <input 
              type="checkbox" 
              class="todo-checkbox" 
              ${todo.completed ? 'checked' : ''}
              aria-label="완료 여부 토글"
            >
            <span class="todo-text">${this.escapeHtml(todo.text)}</span>
          </label>
          <button class="delete-btn" title="휴지통으로 이동" aria-label="삭제">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </li>
      `).join('');

      // 이벤트 바인딩
      this.todoList.querySelectorAll('.todo-item').forEach(item => {
        const id = Number(item.dataset.id);
        const content = item.querySelector('.todo-content');
        const deleteBtn = item.querySelector('.delete-btn');

        content.addEventListener('click', (e) => {
          e.preventDefault();
          this.toggleTodo(id);
        });

        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.moveToTrash(id);
        });
      });
    }

    // 3. 휴지통 리스트 렌더링
    if (trashList.length === 0) {
      this.trashList.innerHTML = '';
      this.trashEmptyState.classList.add('show');
      this.emptyTrashBtn.style.opacity = '0.3';
      this.emptyTrashBtn.style.pointerEvents = 'none';
    } else {
      this.trashEmptyState.classList.remove('show');
      this.emptyTrashBtn.style.opacity = '1';
      this.emptyTrashBtn.style.pointerEvents = 'auto';

      this.trashList.innerHTML = trashList.map(todo => `
        <li class="trash-item" data-id="${todo.id}">
          <span class="trash-text">${this.escapeHtml(todo.text)}</span>
          <div class="trash-actions">
            <button type="button" class="action-btn restore" title="메인 리스트로 복구">복구</button>
            <button type="button" class="action-btn permanent-delete" title="영구 삭제">영구 삭제</button>
          </div>
        </li>
      `).join('');

      // 휴지통 액션 이벤트 바인딩
      this.trashList.querySelectorAll('.trash-item').forEach(item => {
        const id = Number(item.dataset.id);
        const restoreBtn = item.querySelector('.restore');
        const deleteBtn = item.querySelector('.permanent-delete');

        restoreBtn.addEventListener('click', () => this.restoreTodo(id));
        deleteBtn.addEventListener('click', () => this.permanentDeleteTodo(id));
      });
    }

    // 4. 애니메이션 실행
    if (animate && Object.keys(positionsBefore).length > 0) {
      this.animateFLIP(positionsBefore, newId);
    }
  }

  saveToStorage() {
    localStorage.setItem('tasks_minimal_data', JSON.stringify(this.todos));
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

new MinimalTodoApp();
