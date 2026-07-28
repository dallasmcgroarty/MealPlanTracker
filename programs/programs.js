import * as db from '../db.js';
import { esc, showConfirm } from '../ui.js';
import '../nav.js';
import '../settingsHint.js';

export let PROGRAMS = [];
export let EXERCISES = [];

// ── DB operations ──
export async function loadAll() {
  try { PROGRAMS = (await db.dbGetAll('programs')) || []; } catch(e) { PROGRAMS = []; }
  try { EXERCISES = (await db.dbGetAll('exercises')) || []; } catch(e) { EXERCISES = []; }
}

export async function saveProgram(program) {
  await db.dbPut('programs', program);
  const idx = PROGRAMS.findIndex(p => p.id === program.id);
  if (idx >= 0) PROGRAMS[idx] = program; else PROGRAMS.push(program);
}

export async function deleteProgramFromDB(id) {
  await db.dbDelete('programs', id);
  const idx = PROGRAMS.findIndex(p => p.id === id);
  if (idx >= 0) PROGRAMS.splice(idx, 1);
}

export async function saveExercise(exercise) {
  await db.dbPut('exercises', exercise);
  const idx = EXERCISES.findIndex(e => e.id === exercise.id);
  if (idx >= 0) EXERCISES[idx] = exercise; else EXERCISES.push(exercise);
}

export async function deleteExerciseFromDB(id) {
  await db.dbDelete('exercises', id);
  const idx = EXERCISES.findIndex(e => e.id === id);
  if (idx >= 0) EXERCISES.splice(idx, 1);
}

// ── Form state ──
// formState: { id, step, name, description, days: [{ dayNumber, exercises: [{exerciseId,exerciseName,sets,reps,rest,notes}] }] }
let formState = null;
let viewingProgramId = null;
let exerciseSearchContext = null; // { dayIdx, exerciseIdx: number|null }
let exerciseSearchQuery = '';
let currentRestUnit = 's';
let currentTimeUnit = 's';
let exLibraryMode = false; // true when opened from the Exercise Library button (no day context)

// ── Entry point ──
export function renderProgramsTab() {
  renderProgramsList();
}

function renderProgramsList() {
  const tab = document.getElementById('tab-programs');
  tab.innerHTML = `
    <header>
      <div class="header-left">
        <h1>Programs</h1>
        <p class="subtitle">Create & manage your workout programs</p>
      </div>
      <div style="display:flex;gap:8px;flex-direction: column;">
        <button style="align-self: auto;" class="add-btn" onclick="window.pgOpenCreate()">+ New Program</button>
        <button style="align-self: auto;" class="ghost-btn pg-exercise-manage-btn" onclick="window.pgOpenExLibrary()">Exercise Library</button>
      </div>
    </header>
    <div id="programs-list"></div>
  `;

  const list = document.getElementById('programs-list');
  if (!PROGRAMS.length) {
    list.innerHTML = `<div class="no-history">No programs yet.<br><br>Create your first workout program to get started.</div>`;
    return;
  }

  PROGRAMS.slice().reverse().forEach(program => {
    const totalEx = program.days.reduce((s, d) => s + d.exercises.length, 0);
    const card = document.createElement('div');
    card.className = 'program-card';
    card.innerHTML = `
      <div class="program-card-info">
        <div class="program-card-name">${esc(program.name)}</div>
        ${program.description ? `<div class="program-card-desc">${esc(program.description)}</div>` : ''}
        <div class="program-card-meta">
          <span>${program.days.length} day${program.days.length !== 1 ? 's' : ''}</span>
          <span class="program-card-meta-sep">·</span>
          <span>${totalEx} exercise${totalEx !== 1 ? 's' : ''} total</span>
        </div>
      </div>
      <div class="program-card-arrow">›</div>
    `;
    card.addEventListener('click', () => openViewModal(program.id));
    list.appendChild(card);
  });
}

// ── View Modal ──
function openViewModal(programId) {
  viewingProgramId = programId;
  const program = PROGRAMS.find(p => p.id === programId);
  if (!program) return;
  ensureModal('program-view-modal');
  renderViewModal(program);
  document.getElementById('program-view-modal').classList.add('open');
}

function renderViewModal(program) {
  const modal = document.getElementById('program-view-modal');
  const daysHtml = program.days.map(day => `
    <div class="pg-day-section">
      <div class="pg-day-header">
        <span class="pg-day-title">Day ${day.dayNumber}</span>
        <span class="pg-day-count">${day.exercises.length} exercise${day.exercises.length !== 1 ? 's' : ''}</span>
      </div>
      ${day.exercises.map(ex => {
        const meta = metaParts(ex);
        return `
        <div class="pg-exercise-item">
          <div class="pg-exercise-name">${esc(ex.exerciseName)}</div>
          ${meta ? `<div class="pg-exercise-meta">${meta}</div>` : ''}
          ${ex.notes ? `<div class="pg-exercise-notes">${esc(ex.notes)}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
  `).join('');

  modal.innerHTML = `
    <div class="pg-modal-box">
      <div class="pg-modal-header">
        <div>
          <div class="pg-modal-title">${esc(program.name)}</div>
          ${program.description ? `<div class="pg-modal-subtitle">${esc(program.description)}</div>` : ''}
        </div>
        <button class="pg-close-btn" onclick="window.pgCloseView()">×</button>
      </div>
      <div class="pg-modal-body">
        ${daysHtml}
      </div>
      <div class="pg-modal-footer">
        <button class="ghost-btn pg-delete-btn" onclick="window.pgDeleteProgram('${program.id}')">Delete</button>
        <div style="display:flex;gap:8px;">
          <button class="ghost-btn" onclick="window.pgCloseView()">Close</button>
          <button class="add-btn" onclick="window.pgEditProgram('${program.id}')">Edit</button>
        </div>
      </div>
    </div>
  `;
}

function closeViewModal() {
  const modal = document.getElementById('program-view-modal');
  if (modal) modal.classList.remove('open');
  viewingProgramId = null;
}

// ── Create / Edit Form ──
function openCreateForm(programToEdit = null) {
  if (programToEdit) {
    formState = {
      id: programToEdit.id,
      step: 1,
      name: programToEdit.name,
      description: programToEdit.description || '',
      days: programToEdit.days.map(d => ({
        dayNumber: d.dayNumber,
        exercises: d.exercises.map(e => ({ ...e }))
      }))
    };
  } else {
    formState = {
      id: null,
      step: 1,
      name: '',
      description: '',
      days: [{ dayNumber: 1, exercises: [] }]
    };
  }
  ensureModal('program-create-modal');
  renderCreateForm();
  document.getElementById('program-create-modal').classList.add('open');
}

function renderCreateForm() {
  const modal = document.getElementById('program-create-modal');
  const isEdit = !!formState.id;

  if (formState.step === 1) {
    modal.innerHTML = `
      <div class="pg-modal-box">
        <div class="pg-modal-header">
          <div class="pg-modal-title">${isEdit ? 'Edit Program' : 'New Program'}</div>
          <button class="pg-close-btn" onclick="window.pgCloseCreate()">×</button>
        </div>
        <div class="pg-modal-body">
          <div class="pg-step-indicator">
            <span class="pg-step pg-step-active">1 · Details</span>
            <span class="pg-step-sep">›</span>
            <span class="pg-step">2 · Workouts</span>
          </div>
          <div class="field-group" style="margin-bottom:14px;">
            <span class="field-label">Program Name <span style="color:var(--warn)">*</span></span>
            <input type="text" id="pg-name-input" placeholder="e.g. 4-Day Push/Pull" value="${esc(formState.name)}" />
          </div>
          <div class="field-group">
            <span class="field-label">Description</span>
            <textarea id="pg-desc-input" class="pg-textarea" placeholder="Optional description...">${esc(formState.description)}</textarea>
          </div>
        </div>
        <div class="pg-modal-footer">
          <button class="ghost-btn" onclick="window.pgCloseCreate()">Cancel</button>
          <button class="add-btn" onclick="window.pgStep1Next()">Next →</button>
        </div>
      </div>
    `;
    setTimeout(() => document.getElementById('pg-name-input')?.focus(), 50);
  } else {
    renderStep2(modal, isEdit);
  }
}

function renderStep2(modal, isEdit) {
  const daysHtml = formState.days.map((day, dayIdx) => renderDayFormSection(day, dayIdx)).join('');
  modal.innerHTML = `
    <div class="pg-modal-box pg-modal-box-lg">
      <div class="pg-modal-header">
        <div>
          <div class="pg-modal-title">${esc(formState.name)}</div>
          <div class="pg-modal-subtitle">${isEdit ? 'Editing program' : 'New program'}</div>
        </div>
        <button class="pg-close-btn" onclick="window.pgCloseCreate()">×</button>
      </div>
      <div class="pg-modal-body">
        <div class="pg-step-indicator">
          <span class="pg-step">1 · Details</span>
          <span class="pg-step-sep">›</span>
          <span class="pg-step pg-step-active">2 · Workouts</span>
        </div>
        <div id="pg-days-container">${daysHtml}</div>
        ${formState.days.length < 7 ? `<button class="pg-add-day-btn" onclick="window.pgAddDay()">+ Add Day</button>` : ''}
      </div>
      <div class="pg-modal-footer">
        <button class="ghost-btn" onclick="window.pgStep2Back()">← Back</button>
        <button class="add-btn" onclick="window.pgSaveProgram()">${isEdit ? 'Save Changes' : 'Save Program'}</button>
      </div>
    </div>
  `;
}

function renderDayFormSection(day, dayIdx) {
  const exercisesHtml = day.exercises.map((ex, exIdx) => {
    const meta = metaParts(ex);
    return `
    <div class="pg-form-exercise">
      <div class="pg-form-exercise-info">
        <div class="pg-exercise-name">${esc(ex.exerciseName)}</div>
        ${meta ? `<div class="pg-exercise-meta">${meta}</div>` : ''}
      </div>
      <div class="pg-form-exercise-actions">
        ${exIdx > 0
          ? `<button class="pg-arrow-btn" onclick="window.pgMoveExercise(${dayIdx},${exIdx},-1)">↑</button>`
          : `<span class="pg-arrow-btn-ph"></span>`}
        ${exIdx < day.exercises.length - 1
          ? `<button class="pg-arrow-btn" onclick="window.pgMoveExercise(${dayIdx},${exIdx},1)">↓</button>`
          : `<span class="pg-arrow-btn-ph"></span>`}
        <button class="mgmt-edit-btn" style="font-size:11px;padding:5px 10px;height:auto;" onclick="window.pgEditExerciseInDay(${dayIdx},${exIdx})">Edit</button>
        <button class="ghost-btn" style="font-size:11px;padding:5px 10px;height:auto;" onclick="window.pgRemoveExercise(${dayIdx},${exIdx})">Remove</button>
      </div>
    </div>
  `;
  }).join('');

  return `
    <div class="pg-day-form-section">
      <div class="pg-day-form-header">
        <span class="pg-day-title">Day ${day.dayNumber}</span>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button class="add-btn" style="font-size:11px;padding:5px 12px;height:auto;" onclick="window.pgOpenExSearch(${dayIdx})">+ Add Exercise</button>
          ${formState.days.length > 1
            ? `<button class="ghost-btn" style="padding:5px 10px;font-size:11px;color:var(--warn);" onclick="window.pgRemoveDay(${dayIdx})">Remove</button>`
            : ''}
        </div>
      </div>
      <div class="pg-form-exercise-list">
        ${exercisesHtml || `<div class="pg-empty-day">No exercises yet — add at least one.</div>`}
      </div>
    </div>
  `;
}

// ── Exercise Search Modal ──
function openExSearch(dayIdx, editExIdx = null) {
  exLibraryMode = false;
  exerciseSearchContext = { dayIdx, editExIdx };
  exerciseSearchQuery = '';
  ensureModal('pg-ex-search-modal');
  renderExSearchModal();
  document.getElementById('pg-ex-search-modal').classList.add('open');
  setTimeout(() => document.getElementById('pg-ex-search-input')?.focus(), 50);
}

function openExLibrary() {
  exLibraryMode = true;
  exerciseSearchContext = null;
  exerciseSearchQuery = '';
  ensureModal('pg-ex-search-modal');
  renderExSearchModal();
  document.getElementById('pg-ex-search-modal').classList.add('open');
  setTimeout(() => document.getElementById('pg-ex-search-input')?.focus(), 50);
}

function buildExerciseGridHTML() {
  const q = exerciseSearchQuery.toLowerCase().trim();
  const filtered = q ? EXERCISES.filter(e => e.name.toLowerCase().includes(q)) : EXERCISES;
  const cards = filtered.map(ex => {
    const timeVal = Number(ex.time);
    const restVal = Number(ex.rest);
    return `
    <div class="pg-ex-card">
      <div class="pg-ex-card-name">${esc(ex.name)}</div>
      <div class="pg-ex-card-meta">
        ${ex.sets ? `<span class="pg-ex-badge">Sets:${esc(ex.sets)}</span>` : ''}
        ${ex.reps ? `<span class="pg-ex-badge">Reps:${esc(ex.reps)}</span>` : ''}
        ${timeVal ? `<span class="pg-ex-badge">Time:${timeVal}${esc(ex.timeUnit || 's')}</span>` : ''}
      </div>
      ${ex.notes ? `<div class="pg-ex-card-notes">${esc(ex.notes)}</div>` : ''}
      ${!exLibraryMode ? `<button class="pg-ex-add-btn" onclick="window.pgAddFromLibrary('${ex.id}')">+ Add</button>` : ''}
      <div style="display:flex;gap:6px;">
        <button class="ghost-btn" style="flex:1;font-size:10px;padding:4px 0;" onclick="window.pgEditFromLibrary('${ex.id}')">Edit</button>
        <button class="ghost-btn" style="flex:1;font-size:10px;padding:4px 0;color:var(--warn);" onclick="window.pgDeleteFromLibrary('${ex.id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
  return `
    <div class="pg-ex-card pg-ex-create-card" onclick="window.pgOpenExForm()">
      <div class="pg-ex-create-icon">+</div>
      <div class="pg-ex-create-label">Create your own</div>
      <div class="pg-ex-create-sub">Add a custom exercise</div>
    </div>
    ${cards}
  `;
}

function renderExSearchModal() {
  const modal = document.getElementById('pg-ex-search-modal');
  modal.innerHTML = `
    <div class="pg-modal-box pg-modal-box-lg">
      <div class="pg-modal-header">
        <div class="pg-modal-header__left">
          <div class="pg-modal-title">Exercise Library</div>
          <div class="pg-modal-subtitle">${EXERCISES.length} exercise${EXERCISES.length !== 1 ? 's' : ''}</div>
        </div>
        <button class="pg-close-btn" onclick="window.pgCloseExSearch()">×</button>
      </div>
      <div class="pg-modal-body">
        <div class="pg-ex-search-wrap">
          <input type="text" id="pg-ex-search-input" class="pg-ex-search-input" placeholder="Search exercises..."
            value="${esc(exerciseSearchQuery)}" oninput="window.pgExSearchInput(this.value)" />
        </div>
        <div class="pg-ex-grid" id="pg-ex-grid">${buildExerciseGridHTML()}</div>
      </div>
    </div>
  `;
}

// ── Exercise Create/Edit Form ──
function openExForm(prefill = {}, inlineEditContext = null) {
  currentRestUnit = prefill.restUnit || 's';
  currentTimeUnit = prefill.timeUnit || 's';
  ensureModal('pg-ex-form-modal');
  document.body.appendChild(document.getElementById('pg-ex-form-modal'));
  const isInlineEdit = !!inlineEditContext;
  const title = isInlineEdit ? 'Edit Exercise' : 'Create Exercise';
  const unitLabel = { s: 'seconds', min: 'minutes', hr: 'hours' };

  document.getElementById('pg-ex-form-modal').innerHTML = `
    <div class="pg-modal-box">
      <div class="pg-modal-header">
        <div class="pg-modal-title">${title}</div>
        <button class="pg-close-btn" onclick="window.pgCloseExForm()">×</button>
      </div>
      <div class="pg-modal-body">
        <div class="field-group" style="margin-bottom:14px;">
          <span class="field-label">Name <span style="color:var(--warn)">*</span></span>
          <input type="text" id="pgex-name" placeholder="e.g. Barbell Squat" value="${esc(prefill.exerciseName || prefill.name || '')}" />
        </div>
        <div class="pg-ex-form-grid">
          <div class="field-group">
            <span class="field-label">Sets</span>
            <input type="number" id="pgex-sets" placeholder="3" min="1" value="${prefill.sets || ''}" />
          </div>
          <div class="field-group">
            <span class="field-label">Reps</span>
            <input type="number" id="pgex-reps" placeholder="10" min="1" value="${prefill.reps || ''}" />
          </div>
          <div class="field-group" style="grid-column: 1 / -1;">
            <span class="field-label">Rest</span>
            <div style="display:flex;gap:6px;">
              <input type="number" id="pgex-rest" placeholder="60" min="0" value="${prefill.rest || ''}" style="flex:1;min-width:0;" />
              <div class="export-dropdown" id="pgex-rest-unit-dd" style="min-width:90px;">
                <button class="ghost-btn export-dropdown-trigger" style="width:100%;font-size:11px;padding:6px 10px;white-space:nowrap;" onclick="window.pgToggleRestUnit(event)">${esc(unitLabel[currentRestUnit] || currentRestUnit)} ▾</button>
                <div class="export-dropdown-menu">
                  <button onclick="window.pgSelectRestUnit('s')">seconds</button>
                  <button onclick="window.pgSelectRestUnit('min')">minutes</button>
                </div>
              </div>
            </div>
          </div>
          <div class="field-group" style="grid-column: 1 / -1;">
            <span class="field-label">Time</span>
            <div style="display:flex;gap:6px;">
              <input type="number" id="pgex-time" placeholder="30" min="0" value="${prefill.time || ''}" style="flex:1;min-width:0;" />
              <div class="export-dropdown" id="pgex-time-unit-dd" style="min-width:90px;">
                <button class="ghost-btn export-dropdown-trigger" style="width:100%;font-size:11px;padding:6px 10px;white-space:nowrap;" onclick="window.pgToggleTimeUnit(event)">${esc(unitLabel[currentTimeUnit] || currentTimeUnit)} ▾</button>
                <div class="export-dropdown-menu">
                  <button onclick="window.pgSelectTimeUnit('s')">seconds</button>
                  <button onclick="window.pgSelectTimeUnit('min')">minutes</button>
                  <button onclick="window.pgSelectTimeUnit('hr')">hours</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="field-group">
          <span class="field-label">Notes</span>
          <textarea id="pgex-notes" class="pg-textarea">${esc(prefill.notes || '')}</textarea>
        </div>
      </div>
      <div class="pg-modal-footer">
        <button class="ghost-btn" onclick="window.pgCloseExForm()">Cancel</button>
        <button class="add-btn" onclick="window.pgSaveExForm()">Save</button>
      </div>
    </div>
  `;

  // stash inline edit context on the modal element for use in save
  document.getElementById('pg-ex-form-modal')._inlineEdit = inlineEditContext;
  document.getElementById('pg-ex-form-modal').classList.add('open');
  setTimeout(() => document.getElementById('pgex-name')?.focus(), 50);
}

// ── Window-exposed handlers ──
window.pgOpenCreate = () => openCreateForm();

window.pgCloseCreate = () => {
  document.getElementById('program-create-modal')?.classList.remove('open');
  formState = null;
};

window.pgStep1Next = () => {
  const name = document.getElementById('pg-name-input')?.value.trim();
  if (!name) { document.getElementById('pg-name-input')?.focus(); return; }
  formState.name = name;
  formState.description = document.getElementById('pg-desc-input')?.value.trim() || '';
  formState.step = 2;
  renderCreateForm();
};

window.pgStep2Back = () => {
  formState.step = 1;
  renderCreateForm();
};

window.pgAddDay = () => {
  if (formState.days.length >= 7) return;
  formState.days.push({ dayNumber: formState.days.length + 1, exercises: [] });
  renderCreateForm();
};

window.pgRemoveDay = async (dayIdx) => {
  if (!await showConfirm(`Remove Day ${formState.days[dayIdx].dayNumber}?`, 'Remove')) return;
  formState.days.splice(dayIdx, 1);
  formState.days.forEach((d, i) => { d.dayNumber = i + 1; });
  renderCreateForm();
};

window.pgMoveExercise = (dayIdx, exIdx, dir) => {
  const exs = formState.days[dayIdx].exercises;
  const to = exIdx + dir;
  if (to < 0 || to >= exs.length) return;
  [exs[exIdx], exs[to]] = [exs[to], exs[exIdx]];
  renderCreateForm();
};

window.pgEditExerciseInDay = (dayIdx, exIdx) => {
  exerciseSearchContext = { dayIdx, editExIdx: exIdx };
  openExForm(formState.days[dayIdx].exercises[exIdx], { dayIdx, exIdx });
};

window.pgRemoveExercise = async (dayIdx, exIdx) => {
  const name = formState.days[dayIdx].exercises[exIdx].exerciseName;
  if (!await showConfirm(`Remove "${name}" from Day ${formState.days[dayIdx].dayNumber}?`, 'Remove')) return;
  formState.days[dayIdx].exercises.splice(exIdx, 1);
  renderCreateForm();
};

window.pgOpenExSearch = (dayIdx) => openExSearch(dayIdx);
window.pgOpenExLibrary = () => openExLibrary();

window.pgCloseExSearch = () => {
  document.getElementById('pg-ex-search-modal')?.classList.remove('open');
  exerciseSearchContext = null;
  exLibraryMode = false;
};

window.pgExSearchInput = (val) => {
  exerciseSearchQuery = val;
  const grid = document.getElementById('pg-ex-grid');
  if (grid) grid.innerHTML = buildExerciseGridHTML();
};

window.pgAddFromLibrary = (exerciseId) => {
  const ex = EXERCISES.find(e => e.id === exerciseId);
  if (!ex || !exerciseSearchContext) return;
  const { dayIdx } = exerciseSearchContext;
  formState.days[dayIdx].exercises.push({
    exerciseId: ex.id,
    exerciseName: ex.name,
    sets: ex.sets || '',
    reps: ex.reps || '',
    rest: ex.rest || '',
    restUnit: ex.restUnit || 's',
    time: ex.time || '',
    timeUnit: ex.timeUnit || 's',
    notes: ex.notes || ''
  });
  window.pgCloseExSearch();
  renderCreateForm();
};

window.pgOpenExForm = () => openExForm();

window.pgEditFromLibrary = (exerciseId) => {
  const ex = EXERCISES.find(e => e.id === exerciseId);
  if (!ex) return;
  openExForm({ ...ex, exerciseName: ex.name }, { libraryEditId: exerciseId });
};

window.pgDeleteFromLibrary = async (exerciseId) => {
  const ex = EXERCISES.find(e => e.id === exerciseId);
  if (!ex) return;
  if (!await showConfirm(`Delete "${ex.name}" from the library?`, 'Delete')) return;
  await deleteExerciseFromDB(exerciseId);
  renderExSearchModal();
};

window.pgCloseExForm = () => {
  document.getElementById('pg-ex-form-modal')?.classList.remove('open');
};

window.pgToggleRestUnit = (e) => {
  e.stopPropagation();
  const dd = document.getElementById('pgex-rest-unit-dd');
  if (!dd) return;
  const wasOpen = dd.classList.contains('open');
  document.querySelectorAll('.export-dropdown.open').forEach(el => el.classList.remove('open'));
  if (!wasOpen) dd.classList.add('open');
};

window.pgSelectRestUnit = (unit) => {
  currentRestUnit = unit;
  const dd = document.getElementById('pgex-rest-unit-dd');
  if (dd) {
    dd.classList.remove('open');
    const unitLabel = { s: 'seconds', min: 'minutes' };
    const trigger = dd.querySelector('.export-dropdown-trigger');
    if (trigger) trigger.textContent = (unitLabel[unit] || unit) + ' ▾';
  }
};

window.pgToggleTimeUnit = (e) => {
  e.stopPropagation();
  const dd = document.getElementById('pgex-time-unit-dd');
  if (!dd) return;
  const wasOpen = dd.classList.contains('open');
  document.querySelectorAll('.export-dropdown.open').forEach(el => el.classList.remove('open'));
  if (!wasOpen) dd.classList.add('open');
};

window.pgSelectTimeUnit = (unit) => {
  currentTimeUnit = unit;
  const dd = document.getElementById('pgex-time-unit-dd');
  if (dd) {
    dd.classList.remove('open');
    const unitLabel = { s: 'seconds', min: 'minutes', hr: 'hours' };
    const trigger = dd.querySelector('.export-dropdown-trigger');
    if (trigger) trigger.textContent = (unitLabel[unit] || unit) + ' ▾';
  }
};

window.pgSaveExForm = async () => {
  const name = document.getElementById('pgex-name')?.value.trim();
  if (!name) { document.getElementById('pgex-name')?.focus(); return; }
  if (!await showConfirm(`Save exercise "${name}"?`, 'Save')) return;

  const sets = document.getElementById('pgex-sets')?.value !== '' ? parseInt(document.getElementById('pgex-sets').value) : '';
  const reps = document.getElementById('pgex-reps')?.value !== '' ? parseInt(document.getElementById('pgex-reps').value) : '';
  const rest = document.getElementById('pgex-rest')?.value !== '' ? parseInt(document.getElementById('pgex-rest').value) : '';
  const restUnit = currentRestUnit || 's';
  const time = document.getElementById('pgex-time')?.value !== '' ? parseInt(document.getElementById('pgex-time').value) : '';
  const timeUnit = currentTimeUnit || 's';
  const notes = document.getElementById('pgex-notes')?.value.trim() || '';

  const inlineEdit = document.getElementById('pg-ex-form-modal')._inlineEdit;

  if (inlineEdit?.libraryEditId) {
    const libEx = EXERCISES.find(e => e.id === inlineEdit.libraryEditId);
    if (libEx) await saveExercise({ ...libEx, name, sets, reps, rest, restUnit, time, timeUnit, notes });
    window.pgCloseExForm();
    renderExSearchModal();
  } else if (inlineEdit) {
    const { dayIdx, exIdx } = inlineEdit;
    const ex = formState.days[dayIdx].exercises[exIdx];
    Object.assign(ex, { exerciseName: name, sets, reps, rest, restUnit, time, timeUnit, notes });
    if (ex.exerciseId) {
      const libEx = EXERCISES.find(e => e.id === ex.exerciseId);
      if (libEx) await saveExercise({ ...libEx, name, sets, reps, rest, restUnit, time, timeUnit, notes });
    }
    window.pgCloseExForm();
    renderCreateForm();
  } else {
    const newEx = { id: 'ex_' + Date.now(), name, sets, reps, rest, restUnit, time, timeUnit, notes, muscleGroup: '', difficulty: '' };
    await saveExercise(newEx);
    if (exLibraryMode) {
      window.pgCloseExForm();
      renderExSearchModal();
      document.getElementById('pg-ex-search-modal').classList.add('open');
    } else {
      if (exerciseSearchContext) {
        const { dayIdx } = exerciseSearchContext;
        formState.days[dayIdx].exercises.push({
          exerciseId: newEx.id,
          exerciseName: name,
          sets, reps, rest, restUnit, time, timeUnit, notes
        });
      }
      document.getElementById('pg-ex-search-modal')?.classList.remove('open');
      exerciseSearchContext = null;
      window.pgCloseExForm();
      renderCreateForm();
    }
  }
};

window.pgSaveProgram = async () => {
  if (!formState.name.trim()) { await alert_('Program name is required.'); return; }
  for (const day of formState.days) {
    if (!day.exercises.length) { await alert_(`Day ${day.dayNumber} needs at least one exercise.`); return; }
  }
  const isEdit = !!formState.id;
  if (!await showConfirm(`${isEdit ? 'Save changes to' : 'Create'} "${formState.name}"?`, isEdit ? 'Save' : 'Create')) return;

  const existing = isEdit ? PROGRAMS.find(p => p.id === formState.id) : null;
  const program = {
    id: formState.id || 'prog_' + Date.now(),
    name: formState.name,
    description: formState.description,
    days: formState.days.map(d => ({ ...d, exercises: d.exercises.map(e => ({ ...e })) })),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  await saveProgram(program);
  window.pgCloseCreate();
  renderProgramsList();
};

window.pgCloseView = () => closeViewModal();

window.pgDeleteProgram = async (programId) => {
  const program = PROGRAMS.find(p => p.id === programId);
  if (!program) return;
  if (!await showConfirm(`Delete "${program.name}"? This cannot be undone.`, 'Delete')) return;
  await deleteProgramFromDB(programId);
  closeViewModal();
  renderProgramsList();
};

window.pgEditProgram = (programId) => {
  const program = PROGRAMS.find(p => p.id === programId);
  if (!program) return;
  closeViewModal();
  openCreateForm(program);
};

// ── Helpers ──
function metaParts(ex) {
  const parts = [];
  if (ex.sets) parts.push(`Sets: ${ex.sets}`);
  if (ex.reps) parts.push(`Reps: ${ex.reps}`);
  const timeVal = Number(ex.time);
  if (timeVal) parts.push(`Time: ${timeVal}${ex.timeUnit || 's'}`);
  const restVal = Number(ex.rest);
  if (restVal) parts.push(`Rest: ${restVal}${ex.restUnit || 's'}`);
  return parts.join(' · ');
}

function ensureModal(id) {
  if (!document.getElementById(id)) {
    const el = document.createElement('div');
    el.id = id;
    el.className = 'pg-modal';
    el.addEventListener('click', (e) => { if (e.target === el) el.classList.remove('open'); });
    document.body.appendChild(el);
  }
}

function alert_(message) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirm-modal');
    const ok = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    document.getElementById('confirm-message').textContent = message;
    ok.textContent = 'OK';
    cancelBtn.style.display = 'none';
    modal.classList.add('open');
    function cleanup() {
      modal.classList.remove('open');
      ok.textContent = 'Confirm';
      cancelBtn.style.display = '';
      ok.removeEventListener('click', onOk);
      modal.removeEventListener('click', onBd);
      resolve();
    }
    function onOk() { cleanup(); }
    function onBd(e) { if (e.target === modal) cleanup(); }
    ok.addEventListener('click', onOk);
    modal.addEventListener('click', onBd);
  });
}

// ── INIT ──
async function init() {
  await db.openDB();
  await loadAll();
  renderProgramsTab();
}

init();
