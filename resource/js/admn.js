const DEBOUNCE_MS = 300;
let debounceTimer = null;

const $ = (sel) => document.querySelector(sel);
// Функция для дебаунсинга, чтобы не дергать сервер на каждый ввод
function debounce(fn, ms) {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(fn, ms);
}
// Функция для сбора фильтров
function gatherFilters() {
	const word = ($('#form_Search').value || '').trim();
	const level = $('#form_level').value || '';
	const part = $('#form_part_of_speech').value || '';
	const tema = $('#form_tema').value || '';

	const fd = new FormData();
	fd.append('word', word || '');
	fd.append('level', level || 'all');
	fd.append('part_of_speech', part || '13');
	fd.append('tema', tema || '43');
	return fd;
}
//
// Функция для выполнения запросов API с получением JSON-ответа и базовой обработкой ошибок
async function apiFetchJson(url, options = {}) {
	const res = await fetch(url, { credentials: 'same-origin', ...options });
	const text = await res.text();
	const ct = (res.headers.get('content-type') || '').toLowerCase();

	if (!ct.includes('application/json')) {
		const short = (text || '').slice(0, 900);
		console.warn('NON-JSON RESPONSE', { url, status: res.status, ct, text });
		alert(
			`Server returned non-JSON (status ${res.status}).\n` +
				`Check Network → Response.\n\n` +
				short,
		);
		throw new Error('Non-JSON response');
	}

	let json = null;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		const short = (text || '').slice(0, 900);
		alert(`Server returned invalid JSON.\n\n${short}`);
		throw new Error('Invalid JSON');
	}

	return { res, json, text };
}
// Функция для поиска слов по фильтрам и отображения результатов
async function doSearch() {
	const fd = gatherFilters();
	try {
		const { json } = await apiFetchJson('api/search.php', {
			method: 'POST',
			body: fd,
			headers: { Accept: 'application/json' },
		});
		renderResults(json);
	} catch (e) {
		$('#results').innerHTML =
			`<div class="center-message">საძიებო შეცდომა</div>`;
		console.warn(e);
	}
}
// Функция для экранирования HTML
function escapeHtml(str) {
	if (!str) return '';
	return ('' + str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/** LEFT */
// Функция для рендеринга результатов поиска
function renderResults(data) {
	const target = $('#results');
	const rows = Array.isArray(data?.rows) ? data.rows : [];

	if (!rows.length) {
		target.innerHTML = `<div class="center-message">ვერ მოიძებნა</div>`;
		return;
	}

	target.innerHTML = '';
	const table = document.createElement('table');
	table.className = 'results-table';
	const tbody = document.createElement('tbody');
	table.appendChild(tbody);
	target.appendChild(table);

	let buf = '';
	for (const r of rows) {
		buf += `
      <tr data-id="${r.id}">
        <td>${escapeHtml(r.word_view || '')}</td>
        <td style="width:60px; text-align:right;">${escapeHtml(r.level || 'WL')}</td>
      </tr>`;
	}
	tbody.insertAdjacentHTML('beforeend', buf);

	table.addEventListener('click', async (ev) => {
		const tr = ev.target.closest('tr[data-id]');
		if (!tr) return;

		table
			.querySelectorAll('tr.active')
			.forEach((x) => x.classList.remove('active'));
		tr.classList.add('active');

		const id = Number(tr.dataset.id || 0);
		if (!id) return;

		await loadWordDetails(id);
	});
}

/** RIGHT */
// Функция для отображения сообщений в правой панели
function setRightMessage(html) {
	$('#details-panel').innerHTML = `<div class="center-message">${html}</div>`;
}
// Функция для загрузки деталей слова по ID и отображения их в правой панели
async function loadWordDetails(id) {
	setRightMessage('იტვირთება...');
	try {
		const { res, json } = await apiFetchJson(
			`api/word_details.php?id=${encodeURIComponent(id)}`,
			{ method: 'GET', headers: { Accept: 'application/json' } },
		);

		if (!res.ok || !json?.success) {
			setRightMessage('ვერ ჩაიტვირთა');
			console.warn('word_details error', json);
			return;
		}

		renderWordCard(json);
	} catch (e) {
		setRightMessage('შეცდომა');
		console.warn(e);
	}
}
// Функция для построения выпадающего списка для части речи:
function buildPosSelect(selectedId) {
	const src = $('#form_part_of_speech');
	if (!src) return `<input id="edit_pos" value="${escapeHtml(selectedId)}">`;

	const opts = Array.from(src.querySelectorAll('option'))
		.filter((o) => o.value && o.value !== '13') // исключаем "All"
		.map((o) => {
			const sel = String(o.value) === String(selectedId) ? 'selected' : '';
			return `<option value="${escapeHtml(o.value)}" ${sel}>${escapeHtml(
				o.textContent || '',
			)}</option>`;
		})
		.join('');

	return `<select id="edit_pos">${opts}</select>`;
}
// Функция для рендеринга карточки с деталями слова:
function renderWordCard(data) {
	const w = data.word || {};
	const pos = w.part_of_speech || {};

	const word = w.word ?? '';
	const wordView = w.word_view ?? '';
	const posId = String(pos.id ?? '');

	$('#details-panel').innerHTML = `
    <div class="card">
      <div class="card-row">
        <label>word</label>
        <input id="edit_word" type="text" maxlength="30" value="${escapeHtml(word)}">
      </div>

      <div class="card-row">
        <label>word_view</label>
        <input id="edit_word_view" type="text" maxlength="30" value="${escapeHtml(wordView)}">
      </div>

      <div class="card-row">
        <label>POS</label>
        ${buildPosSelect(posId)}
      </div>

      <div class="card-actions">
        <button id="btn_word_save" type="button">Сохранить</button>
      </div>
    </div>
  `;

	// сохраним "старый POS" в data-атрибуте
	$('#edit_pos').dataset.old = posId;

	$('#btn_word_save').addEventListener('click', async () => {
		await saveWordFromForm(w.id);
	});
}

async function saveWordFromForm(wordId) {
	const id = Number(wordId || 0);
	if (!id) return;

	const word = ($('#edit_word')?.value || '').trim();
	const word_view = ($('#edit_word_view')?.value || '').trim();

	const posEl = $('#edit_pos');
	const oldPos = String(posEl?.dataset?.old || '');
	const newPos = String($('#edit_pos')?.value || '');

	if (!word) return alert('word cannot be empty');
	if (!word_view) return alert('word_view cannot be empty');
	if (word.length > 30 || word_view.length > 30)
		return alert('Максимум 30 символов');
	if (!newPos || newPos === '13') return alert('Нужно выбрать часть речи');

	// Сохраняем word/word_view + (опционально) смену POS в ОДНОМ запросе к word_save.php
	const ok = await sendWordSaveUnified({
		id,
		word,
		word_view,
		oldPos,
		newPos,
	});
	if (!ok) return;

	await doSearch();
	await loadWordDetails(id);
}

/**
 * ЕДИНЫЙ save:
 * - всегда шлём id/word/word_view
 * - если POS поменяли — шлём {pos:newPos, confirm:0/1}
 * Сервер: word_save.php
 */
async function sendWordSaveUnified({ id, word, word_view, oldPos, newPos }) {
	const url = 'api/word_save.php';
	const posChanged = newPos && oldPos && String(newPos) !== String(oldPos);

	try {
		const fd = new FormData();
		fd.append('id', String(id));
		fd.append('word', word);
		fd.append('word_view', word_view);

		// Передаём pos только если часть речи действительно изменили
		if (posChanged) {
			fd.append('pos', String(newPos));
		}

		console.log('SEND', url, `id=${id} posChange=${posChanged ? 'yes' : 'no'}`);

		const r = await apiFetchJson(url, {
			method: 'POST',
			body: fd,
			headers: {
				Accept: 'application/json',
				'X-Requested-With': 'XMLHttpRequest',
			},
		});

		if (!r.res.ok || !r.json?.success) {
			alert(r.json?.error || 'Save error');
			return false;
		}

		// После успешного сохранения обновляем old POS в UI
		if (posChanged) {
			const posEl = $('#edit_pos');
			if (posEl) posEl.dataset.old = String(newPos);
		}

		return true;
	} catch (e) {
		console.warn(e);
		return false;
	}
}

function init() {
	$('#form_Search').addEventListener('input', () =>
		debounce(doSearch, DEBOUNCE_MS),
	);
	['#form_level', '#form_part_of_speech', '#form_tema'].forEach((sel) => {
		const el = $(sel);
		if (el) el.addEventListener('change', doSearch);
	});
	doSearch();
}

document.addEventListener('DOMContentLoaded', init);
