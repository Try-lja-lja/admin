const DEBOUNCE_MS = 300;
const NOTICE_SUCCESS_MS = 4200;
const NOTICE_ERROR_MS = 6500;

let debounceTimer = null;
let noticeTimer = null;
let currentWordId = 0;

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

function getRightNoticeEl() {
	let el = document.querySelector('.panel-notice');
	if (el) return el;

	el = document.createElement('div');
	el.className = 'panel-notice';
	el.hidden = true;
	document.body.appendChild(el);

	return el;
}

function showPanelNotice(type, message, details = '', timeout = NOTICE_SUCCESS_MS) {
	const el = getRightNoticeEl();
	if (!el) return;

	clearTimeout(noticeTimer);

	const safeMessage = escapeHtml(String(message || ''));
	const safeDetails = details ? escapeHtml(String(details)) : '';

	el.className = `panel-notice ${type === 'error' ? 'is-error' : 'is-success'}`;
	el.innerHTML = `
		<div class="panel-notice-message">${safeMessage}</div>
		${safeDetails ? `<div class="panel-notice-details">${safeDetails}</div>` : ''}
	`;
	el.hidden = false;

	noticeTimer = setTimeout(() => {
		el.hidden = true;
		el.innerHTML = '';
	}, timeout);
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

    currentWordId = id;  // Обновляем currentWordId при выборе старого слова
    await loadWordDetails(id);
});
}

/** RIGHT */
// Функция для отображения сообщений в правой панели
function setRightMessage(html) {
	$('#details-panel').innerHTML = `<div class="center-message">${html}</div>`;
}
// Функция для загрузки деталей слова по ID и отображения их в правой панели
async function loadWordDetails(id, options = {}) {
	currentWordId = Number(id || 0);

	const keepContent = !!options.keepContent;
	if (!keepContent) {
		setRightMessage('იტვირთება...');
	}

	try {
		const { res, json } = await apiFetchJson(
			`api/word_details.php?id=${encodeURIComponent(id)}`,
			{ method: 'GET', headers: { Accept: 'application/json' } },
		);

		if (!res.ok || !json?.success) {
			if (!keepContent) {
				setRightMessage('ვერ ჩაიტვირთა');
			}
			console.warn('word_details error', json);
			return;
		}

		renderWordCard(json);
	} catch (e) {
		if (!keepContent) {
			setRightMessage('შეცდომა');
		}
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

function buildLevelSelect(selectedValue, levels, selectId = '') {
  const current = String(selectedValue ?? '');

  if (!Array.isArray(levels) || levels.length === 0) {
    return `
      <select${selectId ? ` id="${selectId}"` : ''} class="use-input use-level">
        <option value="">--</option>
      </select>
    `;
  }

  const options = levels.map(item => {
    const value = String(item?.value ?? '');
    const label = escapeHtml(String(item?.label ?? value));
    const selected = value === current ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${selected}>${label}</option>`;
  }).join('');

  return `
    <select${selectId ? ` id="${selectId}"` : ''} class="use-input use-level">
      ${options}
    </select>
  `;
}

function buildTopicSelect(selectedValue, topics, selectId = '', extraClass = '') {
  const current = String(selectedValue ?? '');
  const cls = ['use-input', extraClass].filter(Boolean).join(' ');

  if (!Array.isArray(topics) || topics.length === 0) {
    return `
      <select${selectId ? ` id="${selectId}"` : ''} class="${cls}">
        <option value="">--</option>
      </select>
    `;
  }

  const options = topics.map(item => {
    const value = String(item?.value ?? '');
    const label = escapeHtml(String(item?.label ?? value));
    const selected = value === current ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${selected}>${label}</option>`;
  }).join('');

  return `
    <select${selectId ? ` id="${selectId}"` : ''} class="${cls}">
      ${options}
    </select>
  `;
}

function renderUseCard(useItem, index, levels, topics) {
  const useId = Number(useItem?.id ?? 0);
  const level = String(useItem?.level ?? '');
  const translate = String(useItem?.translate ?? '');
  const interpretation = String(useItem?.interpretation ?? '');
  const useText = String(useItem?.use_text ?? '');
  const tema1 = String(useItem?.tema1 ?? '');
  const tema2 = String(useItem?.tema2 ?? '');
  const tema3 = String(useItem?.tema3 ?? '');

  const levelId = `use_level_${useId}`;
  const translateId = `use_translate_${useId}`;
  const interpretationId = `use_interpretation_${useId}`;
  const useTextId = `use_text_${useId}`;
  const tema1Id = `use_tema1_${useId}`;
  const tema2Id = `use_tema2_${useId}`;
  const tema3Id = `use_tema3_${useId}`;

  return `
    <div class="use-card" data-use-id="${useId}">
      <div class="use-card-title">გამოყენება ${index + 1}</div>

      <div class="use-row use-row-top">
        <div class="use-field use-field-level">
          <label class="use-label" for="${levelId}">დონე</label>
          ${buildLevelSelect(level, levels, levelId)}
        </div>

        <div class="use-field use-field-translate">
          <label class="use-label" for="${translateId}">თარგმანი</label>
          <input
            id="${translateId}"
            class="use-input use-translate"
            type="text"
            value="${escapeHtml(translate)}"
          >
        </div>
      </div>

      <div class="use-row">
        <div class="use-field use-field-full">
          <label class="use-label" for="${interpretationId}">განმარტება</label>
          <textarea
            id="${interpretationId}"
            class="use-input use-interpretation"
            rows="3"
          >${escapeHtml(interpretation)}</textarea>
        </div>
      </div>

      <div class="use-row">
        <div class="use-field use-field-full">
          <label class="use-label" for="${useTextId}">გამოყენება</label>
          <textarea
            id="${useTextId}"
            class="use-input use-text"
            rows="3"
          >${escapeHtml(useText)}</textarea>
        </div>
      </div>

      <div class="use-row use-row-topics">
        <div class="use-field use-field-topic">
          <label class="use-label" for="${tema1Id}">თემა 1</label>
          ${buildTopicSelect(tema1, topics, tema1Id, 'use-tema1')}
        </div>

        <div class="use-field use-field-topic">
          <label class="use-label" for="${tema2Id}">თემა 2</label>
          ${buildTopicSelect(tema2, topics, tema2Id, 'use-tema2')}
        </div>

        <div class="use-field use-field-topic">
          <label class="use-label" for="${tema3Id}">თემა 3</label>
          ${buildTopicSelect(tema3, topics, tema3Id, 'use-tema3')}
        </div>
      </div>

	        <div class="use-row use-row-related use-row-related-header">
        <div class="use-field use-field-full">
          <div class="use-related-head">
            <div class="use-label">სინონიმები</div>
            <button class="btn primary btn-add-synonym" type="button">
              დამატება სინონიმი
            </button>
          </div>
        </div>
      </div>

      ${Array.isArray(useItem?.synonyms) && useItem.synonyms.length > 0
        ? useItem.synonyms.map((synonym) => `
      <div class="use-row use-row-synonym">
        <div class="use-field use-field-full">
          <div class="use-related-line">
            <input
              class="use-input use-synonym-input"
              type="text"
              value="${escapeHtml(String(synonym ?? ''))}"
            >
            <button class="btn danger btn-remove-synonym" type="button">
              წაშლა
            </button>
          </div>
        </div>
      </div>
      `).join('')
        : ''}

      <div class="use-row use-row-related use-row-related-header">
        <div class="use-field use-field-full">
          <div class="use-related-head">
            <div class="use-label">ანტონიმები</div>
            <button class="btn primary btn-add-antonym" type="button">
              დამატება ანტონიმი
            </button>
          </div>
        </div>
      </div>

      ${Array.isArray(useItem?.antonyms) && useItem.antonyms.length > 0
        ? useItem.antonyms.map((antonym) => `
      <div class="use-row use-row-antonym">
        <div class="use-field use-field-full">
          <div class="use-related-line">
            <input
              class="use-input use-antonym-input"
              type="text"
              value="${escapeHtml(String(antonym ?? ''))}"
            >
            <button class="btn danger btn-remove-antonym" type="button">
              წაშლა
            </button>
          </div>
        </div>
      </div>
      `).join('')
        : ''}

      <div class="use-row use-row-related use-row-related-header">
        <div class="use-field use-field-full">
          <div class="use-related-head">
            <div class="use-label">იდიომები</div>
            <button class="btn primary btn-add-idiom" type="button">
              დამატება იდიომი
            </button>
          </div>
        </div>
      </div>

${Array.isArray(useItem?.idioms) && useItem.idioms.length > 0
  ? useItem.idioms.map((idiom) => `
<div class="use-idiom-block">

  <div class="use-row use-row-idiom">
    <div class="use-field use-field-full">
      <label class="use-label">იდიომა</label>
      <div class="use-related-line">
        <input
          class="use-input use-idiom-input"
          type="text"
          value="${escapeHtml(String(idiom?.idiom ?? ''))}"
        >
        <button class="btn danger btn-remove-idiom" type="button">
          წაშლა
        </button>
      </div>
    </div>
  </div>

  <div class="use-row use-row-idiom-interpretation">
    <div class="use-field use-field-full">
      <label class="use-label">იდიომის განმარტება</label>
      <textarea
        class="use-input use-idiom-interpretation"
        rows="2"
      >${escapeHtml(String(idiom?.interpretation ?? ''))}</textarea>
    </div>
  </div>

  <div class="use-row use-row-idiom-use">
    <div class="use-field use-field-full">
      <label class="use-label">იდიომის გამოყენება</label>
      <textarea
        class="use-input use-idiom-use"
        rows="2"
      >${escapeHtml(String(idiom?.use ?? ''))}</textarea>
    </div>
  </div>

</div>
`).join('')
  : ''}

      <div class="editor-actions">
  <button class="btn primary btn-use-save" type="button">
    შენახვა
  </button>

  <button class="btn danger btn-use-delete" type="button">
    წაშლა
  </button>
</div>
    </div>
  `;
}

function buildSynonymRow(value = '') {
  return `
    <div class="use-row use-row-synonym">
      <div class="use-field use-field-full">
        <div class="use-related-line">
          <input
            class="use-input use-synonym-input"
            type="text"
            value="${escapeHtml(String(value))}"
          >
          <button class="btn danger btn-remove-synonym" type="button">
            წაშლა
          </button>
        </div>
      </div>
    </div>
  `;
}

function buildAntonymRow(value = '') {
  return `
    <div class="use-row use-row-antonym">
      <div class="use-field use-field-full">
        <div class="use-related-line">
          <input
            class="use-input use-antonym-input"
            type="text"
            value="${escapeHtml(String(value))}"
          >
          <button class="btn danger btn-remove-antonym" type="button">
            წაშლა
          </button>
        </div>
      </div>
    </div>
  `;
}

function buildIdiomBlock(idiom = '', interpretation = '', useText = '') {
  return `
    <div class="use-idiom-block">

      <div class="use-row use-row-idiom">
        <div class="use-field use-field-full">
          <label class="use-label">იდიომა</label>
          <div class="use-related-line">
            <input
              class="use-input use-idiom-input"
              type="text"
              value="${escapeHtml(String(idiom))}"
            >
            <button class="btn danger btn-remove-idiom" type="button">
              წაშლა
            </button>
          </div>
        </div>
      </div>

      <div class="use-row use-row-idiom-interpretation">
        <div class="use-field use-field-full">
          <label class="use-label">იდიომის განმარტება</label>
          <textarea
            class="use-input use-idiom-interpretation"
            rows="2"
          >${escapeHtml(String(interpretation))}</textarea>
        </div>
      </div>

      <div class="use-row use-row-idiom-use">
        <div class="use-field use-field-full">
          <label class="use-label">იდიომის გამოყენება</label>
          <textarea
            class="use-input use-idiom-use"
            rows="2"
          >${escapeHtml(String(useText))}</textarea>
        </div>
      </div>

    </div>
  `;
}

function addSynonymRow(cardEl) {
  const headerRows = cardEl.querySelectorAll('.use-row-related-header');
  if (!headerRows.length) return;

  const synonymHeaderRow = headerRows[0];

  let insertAfter = synonymHeaderRow;
  let next = synonymHeaderRow.nextElementSibling;

  while (next && next.classList.contains('use-row-synonym')) {
    insertAfter = next;
    next = next.nextElementSibling;
  }

  insertAfter.insertAdjacentHTML('afterend', buildSynonymRow(''));
}

function addAntonymRow(cardEl) {
  const headerRows = cardEl.querySelectorAll('.use-row-related-header');
  if (headerRows.length < 2) return;

  const antonymHeaderRow = headerRows[1];

  let insertAfter = antonymHeaderRow;
  let next = antonymHeaderRow.nextElementSibling;

  while (next && next.classList.contains('use-row-antonym')) {
    insertAfter = next;
    next = next.nextElementSibling;
  }

  insertAfter.insertAdjacentHTML('afterend', buildAntonymRow(''));
}

function addIdiomBlock(cardEl) {
  const headerRows = cardEl.querySelectorAll('.use-row-related-header');
  if (headerRows.length < 3) return;

  const idiomHeaderRow = headerRows[2];

  let insertAfter = idiomHeaderRow;
  let next = idiomHeaderRow.nextElementSibling;

  while (next && next.classList.contains('use-idiom-block')) {
    insertAfter = next;
    next = next.nextElementSibling;
  }

  insertAfter.insertAdjacentHTML('afterend', buildIdiomBlock('', '', ''));
}

function renderGrammarHtml(data) {
  let grammarHtml = '';
console.log(data.grammar);
console.log(data.pos);
const posId = data.word.part_of_speech.id;  // Берем ID части речи из данных о слове (или добавьте сюда правильное поле)
console.log('Part of speech ID:', posId);  // Лог для проверки
  if (data.grammar) {
    // Проверяем, какая часть речи
    switch (posId) {
      // Существительное (noun)
      case 1:
        console.log('Внутри:', posId);
        grammarHtml += `
          <h3>გრამატიკა - არსებითი სახელი</h3>
          <h4 class="gray">ბრუნება</h4>
          <table class="table">
            <tr><td>&nbsp;</td><td class="gray">მხოლობითი რიცხვი</td><td class="gray">მრავლობითი რიცხვი</td></tr>
            <tr><td class="gray">სახელობითი</td><td>${data.word.word}</td><td><input type="text" maxlength="45" value="${data.grammar.nominative_p || '—'}"></td></tr>
            <tr><td class="gray">მოთხრობითი</td><td><input type="text" maxlength="45" value="${data.grammar.ergative_s || '—'}"></td><td><input type="text" maxlength="45" value="${data.grammar.ergative_p || '—'}"></td></tr>
            <tr><td class="gray">მიცემითი</td><td><input type="text" maxlength="45" value="${data.grammar.dative_s || '—'}"></td><td><input type="text" maxlength="45" value="${data.grammar.dative_p || '—'}"></td></tr>
            <tr><td class="gray">ნათესაობითი</td><td><input type="text" maxlength="45" value="${data.grammar.genetive_s || '—'}"></td><td><input type="text" maxlength="45" value="${data.grammar.genetive_p || '—'}"></td></tr>
            <tr><td class="gray">მოქმედებითი</td><td><input type="text" maxlength="45" value="${data.grammar.instrumental_s || '—'}"></td><td><input type="text" maxlength="45" value="${data.grammar.instrumental_p || '—'}"></td></tr>
            <tr><td class="gray">ვითარებითი</td><td><input type="text" maxlength="45" value="${data.grammar.transformative_s || '—'}"></td><td><input type="text" maxlength="45" value="${data.grammar.transformative_p || '—'}"></td></tr>
            <tr><td class="gray">წოდებითი</td><td><input type="text" maxlength="45" value="${data.grammar.vocative_s || '—'}"></td><td><input type="text" maxlength="45" value="${data.grammar.vacative_p || '—'}"></td></tr>
          </table>
        `;
        break;

      // Прилагательное (adjective)
      case 2:
        console.log('Внутри:', posId);
        grammarHtml += `
          <h3>გრამატიკა - ზედსართავი სახელი</h3>
          <h4 class="gray">გრამატიკული დახასიათება</h4>
          <table class="table">
            <tr><td></td><td class="gray">ხარისხის ფორმები</td></tr>
            <tr><td class="gray">დადებითი</td><td><input type="text" maxlength="45" value="${data.grammar.normal_degree || '—'}"></td></tr>
            <tr><td class="gray">ოდნაობითი</td><td><input type="text" maxlength="45" value="${data.grammar.comparative_degree || '—'}"></td></tr>
            <tr><td class="gray">უფროობითი</td><td><input type="text" maxlength="45" value="${data.grammar.superlative_degree || '—'}"></td></tr>
          </table>

<h4 class="gray">ბრუნება</h4>

          <table class="table">
            <tr><td>&nbsp;</td><td class="gray">მხოლობითი რიცხვი</td><td class="gray">მრავლობითი რიცხვი</td></tr>
            <tr><td class="gray">სახელობითი</td><td>${data.word.word}</td><td><input type="text" maxlength="45" value="${data.grammar.nominative_p || '—'}"></td></tr>
            <tr><td class="gray">მოთხრობითი</td><td><input type="text" maxlength="45" value="${data.grammar.ergative_s || '—'}"></td><td><input type="text" maxlength="45" value="${data.grammar.ergative_p || '—'}"></td></tr>
            <tr><td class="gray">მიცემითი</td><td><input type="text" maxlength="45" value="${data.grammar.dative_s || '—'}"></td><td><input type="text" maxlength="45" value="${data.grammar.dative_p || '—'}"></td></tr>
            <tr><td class="gray">ნათესაობითი</td><td><input type="text" maxlength="45" value="${data.grammar.genetive_s || '—'}"></td><td><input type="text" maxlength="45" value="${data.grammar.genetive_p || '—'}"></td></tr>
            <tr><td class="gray">მოქმედებითი</td><td><input type="text" maxlength="45" value="${data.grammar.instrumental_s || '—'}"></td><td><input type="text" maxlength="45" value="${data.grammar.instrumental_p || '—'}"></td></tr>
            <tr><td class="gray">ვითარებითი</td><td><input type="text" maxlength="45" value="${data.grammar.transformative_s || '—'}"></td><td><input type="text" maxlength="45" value="${data.grammar.transformative_p || '—'}"></td></tr>
            <tr><td class="gray">წოდებითი</td><td><input type="text" maxlength="45" value="${data.grammar.vocative_s || '—'}"></td><td><input type="text" maxlength="45" value="${data.grammar.vacative_p || '—'}"></td></tr>
          </table>
        `;
        break;

      // Числительное (numeral)
      case 3:
        console.log('Внутри:', posId);
        grammarHtml += `
          <h3>გრამატიკა - რიცხვითი სახელი</h3>

          <div class="field">
        <label for="numeral-kind" class="gray">ჯგუფი</label>
        <select id="numeral-kind">
          <option value="1" ${data.grammar.kind === '1' ? 'selected' : ''}>რაოდენობითი</option>
          <option value="2" ${data.grammar.kind === '2' ? 'selected' : ''}>რიგობითი</option>
          <option value="3" ${data.grammar.kind === '3' ? 'selected' : ''}>წილობითი</option>
          <option value="4" ${data.grammar.kind === '4' ? 'selected' : ''}>განუსაზღვრელობითი</option>
        </select>
      </div>

<h4 class="gray">ბრუნება</h4>
      <table class="table">
        <tr><td>სახელობითი</td><td>${data.word.word}</td></tr>
        <tr><td>მოთხრობითი</td><td><input type="text" maxlength="45" value="${data.grammar.ergative_s || '—'}"></td></tr>
        <tr><td>მიცემითი</td><td><input type="text" maxlength="45" value="${data.grammar.dative_s || '—'}"></td></tr>
        <tr><td>ნათესაობითი</td><td><input type="text" maxlength="45" value="${data.grammar.genetive_s || '—'}"></td></tr>
        <tr><td>მოქმედებითი</td><td><input type="text" maxlength="45" value="${data.grammar.instrumental_s || '—'}"></td></tr>
        <tr><td>ვითარებითი</td><td><input type="text" maxlength="45" value="${data.grammar.transformative_s || '—'}"></td></tr>
        <tr><td>წოდებითი</td><td><input type="text" maxlength="45" value="${data.grammar.vocative_s || '—'}"></td></tr>
      </table>
        `;
        break;

      // Местоимение (pronoun)
      case 4:
        console.log('Внутри:', posId);
        grammarHtml += `
          <h3>გრამატიკა - ნაცვალსახელი</h3>
          <h4 class="gray">გრამატიკული დახასიათება</h4>
      <div class="field">
        <label for="pronoun-characteristic" class="gray">ჯგუფი</label>
        <input type="text" id="pronoun-characteristic" value="${data.grammar.characteristic || '—'}">
      </div>

      <h4 class="gray">ბრუნება</h4>
      <table class="table">
        <thead>
          <tr>
            <th></th>
            <th class="gray">მხოლობითი რიცხვი</th>
            <th class="gray">მრავლობითი რიცხვი</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="gray">სახელობითი</td>
            <td>${data.word.word}</td>
            <td><input type="text" maxlength="45" value="${data.grammar.nominative_p || '—'}"></td>
          </tr>
          <tr>
            <td class="gray">მოთხრობითი</td>
            <td><input type="text" maxlength="45" value="${data.grammar.ergative_s || '—'}"></td>
            <td><input type="text" maxlength="45" value="${data.grammar.ergative_p || '—'}"></td>
          </tr>
          <tr>
            <td class="gray">მიცემითი</td>
            <td><input type="text" maxlength="45" value="${data.grammar.dative_s || '—'}"></td>
            <td><input type="text" maxlength="45" value="${data.grammar.dative_p || '—'}"></td>
          </tr>
          <tr>
            <td class="gray">ნათესაობითი</td>
            <td><input type="text" maxlength="45" value="${data.grammar.genetive_s || '—'}"></td>
            <td><input type="text" maxlength="45" value="${data.grammar.genetive_p || '—'}"></td>
          </tr>
          <tr>
            <td class="gray">მოქმედებითი</td>
            <td><input type="text" maxlength="45" value="${data.grammar.instrumental_s || '—'}"></td>
            <td><input type="text" maxlength="45" value="${data.grammar.instrumental_p || '—'}"></td>
          </tr>
          <tr>
            <td class="gray">ვითარებითი</td>
            <td><input type="text" maxlength="45" value="${data.grammar.transformative_s || '—'}"></td>
            <td><input type="text" maxlength="45" value="${data.grammar.transformative_p || '—'}"></td>
          </tr>
          <tr>
            <td class="gray">წოდებითი</td>
            <td><input type="text" maxlength="45" value="${data.grammar.vocative_s || '—'}"></td>
            <td><input type="text" maxlength="45" value="${data.grammar.vocative_p || '—'}"></td>
          </tr>
        </tbody>
      </table>
        `;
        break;

        // Case 5 - Verb (ზმნა)
case 5:
    console.log('Inside case 5:', posId);

    // Construct the HTML for the verb grammar
    grammarHtml += `
        <h3>გრამატიკა - ზმნა</h3>

        <div class="field">
            <label for="infinitive" class="gray">საწყისი</label>
            <input type="text" id="infinitive" value="${data.grammar.infinitive || '—'}">
        </div>

        <div class="field">
            <label for="transilive_intransilive" class="gray">გარდამავლობა</label>
            <select id="transilive_intransilive">
                <option value="1" ${data.grammar.transilive_intransilive === '1' ? 'selected' : ''}>გარდამავალი</option>
                <option value="2" ${data.grammar.transilive_intransilive === '2' ? 'selected' : ''}>გარდაუვალი</option>
                <option value="3" ${data.grammar.transilive_intransilive === '3' ? 'selected' : ''}>პირნაკლი</option>
            </select>
        </div>

        <div class="field">
            <label for="voice" class="gray">გვარი</label>
            <select id="voice">
                <option value="1" ${data.grammar.voice === '1' ? 'selected' : ''}>მოქმედებითი</option>
                <option value="2" ${data.grammar.voice === '2' ? 'selected' : ''}>დინამიკური ვნებითი</option>
                <option value="3" ${data.grammar.voice === '3' ? 'selected' : ''}>სტატიკური ვნებითი</option>
                <option value="4" ${data.grammar.voice === '4' ? 'selected' : ''}>საშუალ-მოქმედებითი</option>
                <option value="5" ${data.grammar.voice === '5' ? 'selected' : ''}>საშუალ-ვნებითი</option>
                <option value="6" ${data.grammar.voice === '6' ? 'selected' : ''}>უგვარო</option>
            </select>
        </div>

        <div class="field">
            <label for="peculiarity" class="gray">თავისებურება</label>
            <select id="peculiarity">
                <option value="0" ${data.grammar.peculiarity === '0' ? 'selected' : ''}>არ არის გამონაკლისი</option>
                <option value="1" ${data.grammar.peculiarity === '1' ? 'selected' : ''}>გამონაკლისი</option>
            </select>
        </div>

        <h4 class="gray">უღლება</h4>
        <table class="table">
            <tr><td class="gray">აწმყო</td><td><textarea maxlength="250">${data.grammar.present_lindicative || '—'}</textarea></td></tr>
            <tr><td class="gray">უწყვეტელი</td><td><textarea maxlength="250">${data.grammar.imperfect || '—'}</textarea></td></tr>
            <tr><td class="gray">აწმყოს კავშირებითი</td><td><textarea maxlength="250">${data.grammar.present_stubjunctive || '—'}</textarea></td></tr>
            <tr><td class="gray">მყოფადი</td><td><textarea maxlength="250">${data.grammar.future || '—'}</textarea></td></tr>
            <tr><td class="gray">ხოლმეობითი</td><td><textarea maxlength="250">${data.grammar.conditional || '—'}</textarea></td></tr>
            <tr><td class="gray">მყოფადის კავშირებითი</td><td><textarea maxlength="250">${data.grammar.future_subjunctive || '—'}</textarea></td></tr>
            <tr><td class="gray">წყვეტილი</td><td><textarea maxlength="250">${data.grammar.aorist || '—'}</textarea></td></tr>
            <tr><td class="gray">II კავშირებითი</td><td><textarea maxlength="250">${data.grammar.conjuctive_II || '—'}</textarea></td></tr>
            <tr><td class="gray">I თურმეობითი</td><td><textarea maxlength="250">${data.grammar.resultative_I || '—'}</textarea></td></tr>
            <tr><td class="gray">II თურმეობითი</td><td><textarea maxlength="250">${data.grammar.resultative_II || '—'}</textarea></td></tr>
            <tr><td class="gray">III თურმეობითი</td><td><textarea maxlength="250">${data.grammar.conjuctive_III || '—'}</textarea></td></tr>
        </table>
        `;
        break;

      // Глагольное существительное (verbnoun)
      case 6:
        console.log('Внутри:', posId);
        grammarHtml += `
        <h3>გრამატიკა - საწყისი</h3>
          <h4 class="gray">გრამატიკული დახასიათება</h4>

        <div class="field">
        <label for="pronoun-characteristic" class="gray">ზმნ(ებ)ისა</label>
        <input type="text" id="pronoun-characteristic" value="${data.grammar.verb || '—'}">
      </div>
        
        <h4 class="gray">ბრუნება</h4>
        <table class="table">
            <tr><td class="gray">სახელობითი</td><td>${data.word.word}</td></tr>
            <tr><td class="gray">მოთხრობითი</td><td><input type="text" maxlength="25" value="${data.grammar.ergative_s || '—'}"></td></tr>
            <tr><td class="gray">მიცემითი</td><td><input type="text" maxlength="25" value="${data.grammar.dative_s || '—'}"></td></tr>
            <tr><td class="gray">ნათესაობითი</td><td><input type="text" maxlength="25" value="${data.grammar.genetive_s || '—'}"></td></tr>
            <tr><td class="gray">მოქმედებითი</td><td><input type="text" maxlength="25" value="${data.grammar.instrumental_s || '—'}"></td></tr>
            <tr><td class="gray">ვითარებითი</td><td><input type="text" maxlength="25" value="${data.grammar.transformative_s || '—'}"></td></tr>
            <tr><td class="gray">წოდებითი</td><td><input type="text" maxlength="25" value="${data.grammar.vocative_s || '—'}"></td></tr>
        </table>
        `;
        break;

// Причастие (participle)
case 7:
    console.log('Inside case 7:', posId);

    const participleVoiceMap = {
    "1": "მოქმედებითი",
    "2": "ვნებითი,წარსული დრო (1)",
    "3": "ვნებითი,წარსული დრო (2)",
    "4": "ვნებითი, მომავალი დრო",
    "5": "ვნებითი, უარყოფითი ფორმა",
    "6": "საშუალი"
};

const participleVoiceValue =
    participleVoiceMap[String(data.grammar.voice || '')] || '—';

    // Добавляем разметку
    grammarHtml += `
        <h3>გრამატიკა - მიმღეობა</h3>
        <h4 class="gray">გრამატიკული დახასიათება</h4>
        <div class="field">
            <label for="pronoun-characteristic" class="gray">ზმნ(ებ)ისა</label>
            <input type="text" id="pronoun-characteristic" value="${data.grammar.verb || '—'}">
        </div>

        <div class="field">
            <label for="voice" class="gray">გვარი</label>
            <input type="text" id="voice" value="${participleVoiceValue}">
        </div>

        <h4 class="gray">ბრუნება</h4>
        <table class="table">
            <thead>
                <tr>
                    <th></th>
                    <th class="gray">მხოლობითი რიცხვი</th>
                    <th class="gray">მრავლობითი რიცხვი</th>
                </tr>
            </thead>
            <tbody>
                <tr><td class="gray">სახელობითი</td><td>${data.word.word}</td><td><input type="text" maxlength="25" value="${data.grammar.nominative_p || '—'}"></td></tr>
                <tr><td class="gray">მოთხრობითი</td><td><input type="text" maxlength="25" value="${data.grammar.ergative_s || '—'}"></td><td><input type="text" maxlength="25" value="${data.grammar.ergative_p || '—'}"></td></tr>
                <tr><td class="gray">მიცემითი</td><td><input type="text" maxlength="25" value="${data.grammar.dative_s || '—'}"></td><td><input type="text" maxlength="25" value="${data.grammar.dative_p || '—'}"></td></tr>
                <tr><td class="gray">ნათესაობითი</td><td><input type="text" maxlength="25" value="${data.grammar.genetive_s || '—'}"></td><td><input type="text" maxlength="25" value="${data.grammar.genetive_p || '—'}"></td></tr>
                <tr><td class="gray">მოქმედებითი</td><td><input type="text" maxlength="25" value="${data.grammar.instrumental_s || '—'}"></td><td><input type="text" maxlength="25" value="${data.grammar.instrumental_p || '—'}"></td></tr>
                <tr><td class="gray">ვითარებითი</td><td><input type="text" maxlength="25" value="${data.grammar.transformative_s || '—'}"></td><td><input type="text" maxlength="25" value="${data.grammar.transformative_p || '—'}"></td></tr>
                <tr><td class="gray">წოდებითი</td><td><input type="text" maxlength="25" value="${data.grammar.vocative_s || '—'}"></td><td><input type="text" maxlength="25" value="${data.grammar.vocative_p || '—'}"></td></tr>
            </tbody>
        </table>
    `;
    break;

      // Наречие (adverb)
      case 8:
        console.log('Внутри:', posId);
        grammarHtml += `
          <h3>გრამატიკა - ზმნიზედა</h3>
          <h4 class="gray">სემანტიკური ჯგუფი</h4>

          <div class="field">
            <input
              type="text"
              maxlength="50"
              value="${data.grammar.semantic_group || '—'}"
            >
          </div>
        `;
        break;

            // Частица (particle)
      case 9:
        console.log('Внутри:', posId);
        grammarHtml += `
        <h3>გრამატიკა - ნაწილაკი</h3>
          <h4 class="gray">სემანტიკური ჯგუფი</h4>

          <div class="field">
            <input
              type="text"
              maxlength="50"
              value="${data.grammar.semantic_group || '—'}"
            >
          </div>
        `;
        break;

      // Союз (conjunction)
      case 10:
        console.log('Внутри:', posId);
        grammarHtml += `
        <h3>გრამატიკა - კავშირი</h3>
          <h4 class="gray">გრამატიკული დახასიათება</h4>

          <div class="field">
            <label for="conjunction-semantic-group" class="gray">ჯგუფი</label>
            <select id="conjunction-semantic-group">
              <option value="მაერთებელი" ${data.grammar.semantic_group === 'მაერთებელი' ? 'selected' : ''}>მაერთებელი</option>
              <option value="მაქვემდებარებელი" ${data.grammar.semantic_group === 'მაქვემდებარებელი' ? 'selected' : ''}>მაქვემდებარებელი</option>
            </select>
          </div>
        `;
        break;

            // Послог (postposition)
      case 11:
        console.log('Внутри:', posId);
        grammarHtml += `
          <h3>გრამატიკა - თანდებული</h3>
          <h4 class="gray">გრამატიკული დახასიათება</h4>

          <div class="field">
            <label for="postposition-case" class="gray">გამოიყენება</label>
            <select id="postposition-case">
              <option value="1" ${String(data.grammar.case) === '1' ? 'selected' : ''}>სახელობით ბრუნვასთან</option>
              <option value="2" ${String(data.grammar.case) === '2' ? 'selected' : ''}>სახელობით/მიცემით ბრუნვებთან</option>
              <option value="3" ${String(data.grammar.case) === '3' ? 'selected' : ''}>მიცემით ბრუნვასთან</option>
              <option value="4" ${String(data.grammar.case) === '4' ? 'selected' : ''}>მიცემით/ნათესაობით ბრუნვებთან</option>
              <option value="5" ${String(data.grammar.case) === '5' ? 'selected' : ''}>ნათესაობით ბრუნვასთან</option>
              <option value="6" ${String(data.grammar.case) === '6' ? 'selected' : ''}>ნათესაობით/მოქმედებით ბრუნვებთან</option>
              <option value="7" ${String(data.grammar.case) === '7' ? 'selected' : ''}>მოქმედებით ბრუნვასთან</option>
              <option value="8" ${String(data.grammar.case) === '8' ? 'selected' : ''}>ვითარებით ბრუნვასთან</option>
            </select>
          </div>
        `;
        break;

            // Междометие (interjection)
      case 12:
        console.log('Внутри:', posId);
        grammarHtml += `
          <h3>გრამატიკა - შორისდებული</h3>
          <h4 class="gray">გრამატიკული დახასიათება</h4>

          <div class="field">
            <label for="interjection-emotic-group" class="gray">ემოციური ჯგუფი</label>
            <input
              type="text"
              id="interjection-emotic-group"
              maxlength="200"
              value="${data.grammar.emotic_group || '—'}"
            >
          </div>

          <div class="field">
            <label for="interjection-semantic-group" class="gray">სემანტიკური ჯგუფი</label>
            <input
              type="text"
              id="interjection-semantic-group"
              maxlength="200"
              value="${data.grammar.semantic_group || '—'}"
            >
          </div>
        `;
        break;
    }
  } else {
    grammarHtml = '<p>გრამატიკა არ არის</p>';
  }
console.log('содержимое граматика:', grammarHtml);
  return grammarHtml;

}

function bindRelatedButtons(panel) {
  if (!panel) return;

  if (panel.dataset.relatedButtonsBound === '1') {
    return;
  }

  panel.dataset.relatedButtonsBound = '1';

  panel.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;

    const card = btn.closest('.use-card');
    if (!card) return;

    if (btn.classList.contains('btn-add-synonym')) {
      addSynonymRow(card);
      return;
    }

    if (btn.classList.contains('btn-add-antonym')) {
      addAntonymRow(card);
      return;
    }

    if (btn.classList.contains('btn-add-idiom')) {
      addIdiomBlock(card);
      return;
    }

    if (btn.classList.contains('btn-remove-synonym')) {
      const row = btn.closest('.use-row-synonym');
      if (row) row.remove();
      return;
    }

    if (btn.classList.contains('btn-remove-antonym')) {
      const row = btn.closest('.use-row-antonym');
      if (row) row.remove();
      return;
    }

    if (btn.classList.contains('btn-remove-idiom')) {
      const block = btn.closest('.use-idiom-block');
      if (block) block.remove();
    }
  });
}

function collectSynonymsFromCard(cardEl) {
  return Array.from(cardEl.querySelectorAll('.use-synonym-input'))
    .map((input) => String(input.value || '').trim())
    .filter((value) => value !== '');
}

function collectAntonymsFromCard(cardEl) {
  return Array.from(cardEl.querySelectorAll('.use-antonym-input'))
    .map((input) => String(input.value || '').trim())
    .filter((value) => value !== '');
}

function collectIdiomsFromCard(cardEl) {
  return Array.from(cardEl.querySelectorAll('.use-idiom-block'))
    .map((block) => {
      const idiom = String(block.querySelector('.use-idiom-input')?.value || '').trim();
      const interpretation = String(
        block.querySelector('.use-idiom-interpretation')?.value || ''
      ).trim();
      const useText = String(block.querySelector('.use-idiom-use')?.value || '').trim();

      return {
        idiom,
        interpretation,
        use: useText,
      };
    })
    .filter((item) => item.idiom !== '');
}

async function sendSynonymsSave(useId, items) {
  const fd = new FormData();
  fd.append('use_id', String(useId));

  items.forEach((item, index) => {
    fd.append(`items[${index}]`, item);
  });

  const r = await apiFetchJson('api/synonym_create.php', {
    method: 'POST',
    body: fd,
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (!r.res.ok || !r.json?.success) {
    throw new Error(r.json?.error || 'სინონიმების შენახვა ვერ მოხერხდა');
  }

  return true;
}

async function sendAntonymsSave(useId, items) {
  const fd = new FormData();
  fd.append('use_id', String(useId));

  items.forEach((item, index) => {
    fd.append(`items[${index}]`, item);
  });

  const r = await apiFetchJson('api/antonym_create.php', {
    method: 'POST',
    body: fd,
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (!r.res.ok || !r.json?.success) {
    throw new Error(r.json?.error || 'ანტონიმების შენახვა ვერ მოხერხდა');
  }

  return true;
}

async function sendIdiomsSave(useId, items) {
  const fd = new FormData();
  fd.append('use_id', String(useId));

  items.forEach((item, index) => {
    fd.append(`items[${index}][idiom]`, item.idiom || '');
    fd.append(`items[${index}][interpretation]`, item.interpretation || '');
    fd.append(`items[${index}][use]`, item.use || '');
  });

  const r = await apiFetchJson('api/idiom_create.php', {
    method: 'POST',
    body: fd,
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (!r.res.ok || !r.json?.success) {
    throw new Error(r.json?.error || 'იდიომების შენახვა ვერ მოხერხდა');
  }

  return true;
}

function renderCreateWordForm() {
  const panel = $('#details-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="card editor-card editor-card-create">
      <div class="field">
        <label for="create_word">სიტყვა</label>
        <input
          id="create_word"
          type="text"
          maxlength="30"
          value=""
        >
      </div>

      <div class="field">
        <label for="create_word_view">სიტყვის ფორმა</label>
        <input
          id="create_word_view"
          type="text"
          maxlength="30"
          value=""
        >
      </div>

      <div class="field">
        <label for="create_pos">მეტყველების ნაწილი</label>
        ${buildPosSelect('')}
      </div>

      <div class="editor-actions">
        <button id="btn_create_word_save" class="btn primary" type="button">
          შენახვა
        </button>
      </div>
    </div>
  `;

  const oldPosEl = $('#edit_pos');
  if (oldPosEl) {
    oldPosEl.id = 'create_pos';
    oldPosEl.removeAttribute('data-old');
  }

  const btnCreateWordSave = $('#btn_create_word_save');
  if (btnCreateWordSave) {
    btnCreateWordSave.addEventListener('click', async () => {
      await createWordFromForm();
    });
  }
}

// Функция для рендеринга карточки с деталями слова:
function renderWordCard(data) {
  const panel = $('#details-panel');

if (!panel) {
    console.error('Элемент #details-panel не найден!');
    return;
  }


  const w = data?.word || null;

  if (!panel) return;
  if (!w) {
    panel.innerHTML = '<div class="muted">მონაცემები ვერ მოიძებნა</div>';
    return;
  }

  const pos = w.part_of_speech || {};
  const uses = Array.isArray(data?.uses) ? data.uses : [];
  const levels = Array.isArray(data?.meta?.levels) ? data.meta.levels : [];
  const topics = Array.isArray(data?.meta?.topics) ? data.meta.topics : [];

  const usesHtml = uses.length > 0
    ? uses.map((useItem, index) => renderUseCard(useItem, index, levels, topics)).join('')
    : '<div class="muted">გამოყენება არ არის</div>';

  panel.innerHTML = `
    <div class="card editor-card">
      <div class="field">
        <label for="edit_word">სიტყვა</label>
        <input
          id="edit_word"
          type="text"
          maxlength="30"
          value="${escapeHtml(w.word || '')}"
        >
      </div>

      <div class="field">
        <label for="edit_word_view">სიტყვის ფორმა</label>
        <input
          id="edit_word_view"
          type="text"
          maxlength="30"
          value="${escapeHtml(w.word_view || '')}"
        >
      </div>

      <div class="field">
        <label for="edit_pos">მეტყველების ნაწილი</label>
        ${buildPosSelect(pos.id)}
      </div>

      <div class="editor-actions">
        <button id="btn_word_save" class="btn primary" type="button">
          შენახვა
        </button>

        <button id="btn_word_delete" class="btn danger" type="button">
          სიტყვის სრულად წაშლა
        </button>
      </div>

    </div>

    <div class="uses-section">
  <div class="uses-section-header">
    <div class="uses-section-title">გამოყენება</div>
    <button id="btn_use_create" class="btn primary" type="button">
      ახალი გამოყენება
    </button>
  </div>

  <div class="uses-list">
    ${usesHtml}
  </div>

    <!-- Добавляем блок для грамматики -->
    <div class="grammar-section">
      ${renderGrammarHtml(data)}  <!-- Вставляем сгенерированный HTML для грамматики -->
      <button id="btn_grammar_save" class="btn primary" type="button">შენახვა</button> <!-- Кнопка для сохранения -->
    </div>

</div>
  `;

  const posEl = $('#edit_pos');
  if (posEl) posEl.dataset.old = String(pos.id || '');

  const btnSave = $('#btn_word_save');
  if (btnSave) {
    btnSave.addEventListener('click', () => saveWordFromForm(w.id));
  }

  const btnWordDelete = $('#btn_word_delete');
  if (btnWordDelete) {
    btnWordDelete.addEventListener('click', async () => {
      if (!confirm('ნამდვილად გსურთ სიტყვის სრულად წაშლა?')) return;
      await deleteWord(w.id);
    });
  }

  const btnUseCreate = $('#btn_use_create');
  if (btnUseCreate) {
    btnUseCreate.addEventListener('click', async () => {
      await createUse(w.id);
    });
  }

  panel.querySelectorAll('.btn-use-save').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.use-card');
      if (!card) return;
      await saveUseFromCard(card);
    });
  });

  panel.querySelectorAll('.btn-use-delete').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const card = btn.closest('.use-card');
    if (!card) return;

    const useId = Number(card.dataset.useId || 0);
    if (!useId) return;

    if (!confirm('ნამდვილად გსურთ გამოყენების წაშლა?')) return;

    await deleteUse(useId);
  });
});

bindRelatedButtons(panel);

}

async function saveWordFromForm(wordId) {
	const id = Number(wordId || 0);
	if (!id) return;

	const word = ($('#edit_word')?.value || '').trim();
	const word_view = ($('#edit_word_view')?.value || '').trim();

	const posEl = $('#edit_pos');
	const oldPos = String(posEl?.dataset?.old || '');
	const newPos = String($('#edit_pos')?.value || '');

if (!word) {
	showPanelNotice(
		'error',
		'სიტყვის შენახვა ვერ მოხერხდა',
		'სიტყვა სავალდებულოა',
		NOTICE_ERROR_MS,
	);
	return;
}

if (!word_view) {
	showPanelNotice(
		'error',
		'სიტყვის შენახვა ვერ მოხერხდა',
		'სიტყვის საჩვენებელი ფორმა სავალდებულოა',
		NOTICE_ERROR_MS,
	);
	return;
}

if (word.length > 30 || word_view.length > 30) {
	showPanelNotice(
		'error',
		'სიტყვის შენახვა ვერ მოხერხდა',
		'მაქსიმალური სიგრძეა 30 სიმბოლო',
		NOTICE_ERROR_MS,
	);
	return;
}

if (!newPos || newPos === '13') {
	showPanelNotice(
		'error',
		'სიტყვის შენახვა ვერ მოხერხდა',
		'აუცილებელია მეტყველების ნაწილის არჩევა',
		NOTICE_ERROR_MS,
	);
	return;
}

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

async function createWordFromForm() {
	const word = ($('#create_word')?.value || '').trim();
	const word_view = ($('#create_word_view')?.value || '').trim();
	const pos = String($('#create_pos')?.value || '');

	if (!word) {
		showPanelNotice(
			'error',
			'სიტყვის დამატება ვერ მოხერხდა',
			'სიტყვა სავალდებულოა',
			NOTICE_ERROR_MS,
		);
		return false;
	}

	if (!word_view) {
		showPanelNotice(
			'error',
			'სიტყვის დამატება ვერ მოხერხდა',
			'სიტყვის საჩვენებელი ფორმა სავალდებულოა',
			NOTICE_ERROR_MS,
		);
		return false;
	}

	if (word.length > 30 || word_view.length > 30) {
		showPanelNotice(
			'error',
			'სიტყვის დამატება ვერ მოხერხდა',
			'მაქსიმალური სიგრძეა 30 სიმბოლო',
			NOTICE_ERROR_MS,
		);
		return false;
	}

	if (!pos || pos === '13') {
		showPanelNotice(
			'error',
			'სიტყვის დამატება ვერ მოხერხდა',
			'აუცილებელია მეტყველების ნაწილის არჩევა',
			NOTICE_ERROR_MS,
		);
		return false;
	}

	try {
		const fd = new FormData();
		fd.append('word', word);
		fd.append('word_view', word_view);
		fd.append('pos', pos);

		const r = await apiFetchJson('api/word_create.php', {
			method: 'POST',
			body: fd,
			headers: {
				Accept: 'application/json',
				'X-Requested-With': 'XMLHttpRequest',
			},
		});

if (!r.res.ok || !r.json?.success) {
    showPanelNotice(
        'error',
        'სიტყვის დამატება ვერ მოხერხდა',
        r.json?.error || 'შეცდომა',
        NOTICE_ERROR_MS,
    );
    return false;
}

const newId = Number(r.json?.created?.id || 0);
if (!newId) {
    showPanelNotice(
        'error',
        'სიტყვის დამატება ვერ მოხერხდა',
        'ახალი ჩანაწერის იდენტიფიკატორი ვერ მოიძებნა',
        NOTICE_ERROR_MS,
    );
    return false;
}

// Обновление currentWordId и загрузка карточки нового слова
currentWordId = newId;
await loadWordDetails(newId);  // Загружаем карточку нового слова

showPanelNotice('success', 'სიტყვა დამატებულია', '', NOTICE_SUCCESS_MS);

		await doSearch();

		return true;
	} catch (e) {
		console.warn(e);
		showPanelNotice(
			'error',
			'სიტყვის დამატება ვერ მოხერხდა',
			'ქსელის ან სერვერის შეცდომა',
			NOTICE_ERROR_MS,
		);
		return false;
	}
}

async function saveUseFromCard(cardEl) {
	const useId = Number(cardEl?.dataset?.useId || 0);
	if (!useId) return false;

	const level = String(cardEl.querySelector('.use-level')?.value || '').trim();
	const translate = String(cardEl.querySelector('.use-translate')?.value || '').trim();
	const interpretation = String(cardEl.querySelector('.use-interpretation')?.value || '').trim();
	const useText = String(cardEl.querySelector('.use-text')?.value || '').trim();
	const tema1 = String(cardEl.querySelector('.use-tema1')?.value || '').trim();
	const tema2 = String(cardEl.querySelector('.use-tema2')?.value || '').trim();
	const tema3 = String(cardEl.querySelector('.use-tema3')?.value || '').trim();

	const synonyms = collectSynonymsFromCard(cardEl);
	const antonyms = collectAntonymsFromCard(cardEl);
	const idioms = collectIdiomsFromCard(cardEl);

	const ok = await sendUseUpdate({
		id: useId,
		level,
		translate,
		interpretation,
		use: useText,
		tema1,
		tema2,
		tema3,
	});

	if (!ok) return false;

	try {
		await sendSynonymsSave(useId, synonyms);
		await sendAntonymsSave(useId, antonyms);
		await sendIdiomsSave(useId, idioms);
	} catch (e) {
		console.warn(e);
		showPanelNotice(
			'error',
			'გამოყენების შენახვა ვერ მოხერხდა',
			e.message || 'დაკავშირებული მონაცემების შენახვის შეცდომა',
			NOTICE_ERROR_MS,
		);
		return false;
	}

	showPanelNotice('success', 'გამოყენება შენახულია', '', NOTICE_SUCCESS_MS);

	if (currentWordId > 0) {
		const rightEl = document.querySelector('.right');
		const prevScrollTop = rightEl ? rightEl.scrollTop : 0;

		try {
			await loadWordDetails(currentWordId, { keepContent: true });

			if (rightEl) {
				rightEl.scrollTop = prevScrollTop;
			}
		} catch (e) {
			console.warn(e);
		}
	}

	return true;
}

async function sendUseUpdate({ id, level, translate, interpretation, use, tema1, tema2, tema3 }) {
	const url = 'api/use_update.php';

	try {
		const fd = new FormData();
		fd.append('id', String(id));
		fd.append('level', level);
		fd.append('translate', translate);
		fd.append('interpretation', interpretation);
		fd.append('use', use);
		fd.append('tema1', tema1 || '0');
		fd.append('tema2', tema2 || '0');
		fd.append('tema3', tema3 || '0');

		const r = await apiFetchJson(url, {
			method: 'POST',
			body: fd,
			headers: {
				Accept: 'application/json',
				'X-Requested-With': 'XMLHttpRequest',
			},
		});

		if (!r.res.ok || !r.json?.success) {
	showPanelNotice(
		'error',
		'გამოყენების შენახვა ვერ მოხერხდა',
		r.json?.error || 'შენახვის შეცდომა',
		NOTICE_ERROR_MS,
	);
	return false;
}

		return true;
	} catch (e) {
		console.warn(e);
		showPanelNotice(
	'error',
	'გამოყენების შენახვა ვერ მოხერხდა',
	'ქსელის ან სერვერის შეცდომა',
	NOTICE_ERROR_MS,
);
		return false;
	}
}

async function deleteUse(useId) {
  try {
    const fd = new FormData();
    fd.append('id', String(useId));

    const r = await apiFetchJson('api/use_delete.php', {
      method: 'POST',
      body: fd,
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    if (!r.res.ok || !r.json?.success) {
      showPanelNotice(
        'error',
        'გამოყენების წაშლა ვერ მოხერხდა',
        r.json?.error || 'შეცდომა',
        NOTICE_ERROR_MS
      );
      return;
    }

    showPanelNotice('success', 'გამოყენება წაიშალა', '', NOTICE_SUCCESS_MS);

    if (currentWordId > 0) {
      await loadWordDetails(currentWordId, { keepContent: true });
    }

  } catch (e) {
    console.warn(e);
    showPanelNotice(
      'error',
      'გამოყენების წაშლა ვერ მოხერხდა',
      'ქსელის ან სერვერის შეცდომა',
      NOTICE_ERROR_MS
    );
  }
}

async function deleteWord(wordId) {
  const id = Number(wordId || 0);
  if (!id) return;

  try {
    const fd = new FormData();
    fd.append('id', String(id));

    const r = await apiFetchJson('api/word_delete.php', {
      method: 'POST',
      body: fd,
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    if (!r.res.ok || !r.json?.success) {
      showPanelNotice(
        'error',
        'სიტყვის წაშლა ვერ მოხერხდა',
        r.json?.error || 'შეცდომა',
        NOTICE_ERROR_MS
      );
      return;
    }

    currentWordId = 0;

    const panel = $('#details-panel');
    if (panel) {
      panel.innerHTML = '<div class="center-message">სიტყვა წაიშალა</div>';
    }

    showPanelNotice('success', 'სიტყვა წაიშალა', '', NOTICE_SUCCESS_MS);

    await doSearch();
  } catch (e) {
    console.warn(e);
    showPanelNotice(
      'error',
      'სიტყვის წაშლა ვერ მოხერხდა',
      'ქსელის ან სერვერის შეცდომა',
      NOTICE_ERROR_MS
    );
  }
}

async function createUse(wordId) {
	const id = Number(wordId || 0);
	if (!id) return false;

	try {
		const fd = new FormData();
		fd.append('word_id', String(id));

		const r = await apiFetchJson('api/use_create.php', {
			method: 'POST',
			body: fd,
			headers: {
				Accept: 'application/json',
				'X-Requested-With': 'XMLHttpRequest',
			},
		});

		if (!r.res.ok || !r.json?.success) {
			showPanelNotice(
				'error',
				'გამოყენების დამატება ვერ მოხერხდა',
				r.json?.error || 'შეცდომა',
				NOTICE_ERROR_MS,
			);
			return false;
		}

		showPanelNotice('success', 'გამოყენება დამატებულია', '', NOTICE_SUCCESS_MS);

		if (currentWordId > 0) {
			const rightEl = document.querySelector('.right');
			const prevScrollTop = rightEl ? rightEl.scrollTop : 0;

			try {
				await loadWordDetails(currentWordId, { keepContent: true });

				if (rightEl) {
					rightEl.scrollTop = prevScrollTop;
				}
			} catch (e) {
				console.warn(e);
			}
		}

		return true;
	} catch (e) {
		console.warn(e);
		showPanelNotice(
			'error',
			'გამოყენების დამატება ვერ მოხერხდა',
			'ქსელის ან სერვერის შეცდომა',
			NOTICE_ERROR_MS,
		);
		return false;
	}
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
	showPanelNotice(
		'error',
		'სიტყვის შენახვა ვერ მოხერხდა',
		r.json?.error || 'შენახვის შეცდომა',
		NOTICE_ERROR_MS,
	);
	return false;
}

		// После успешного сохранения обновляем old POS в UI
if (posChanged) {
	const posEl = $('#edit_pos');
	if (posEl) posEl.dataset.old = String(newPos);
}

showPanelNotice('success', 'სიტყვა შენახულია', '', NOTICE_SUCCESS_MS);

return true;
	} catch (e) {
	console.warn(e);
		showPanelNotice(
	'error',
	'სიტყვის შენახვა ვერ მოხერხდა',
	'ქსელის ან სერვერის შეცდომა',
	NOTICE_ERROR_MS,
);
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

	const btnWordCreate = $('#btn_word_create');
	if (btnWordCreate) {
		btnWordCreate.addEventListener('click', () => {
			currentWordId = 0;
			renderCreateWordForm();
		});
	}

	doSearch();
}

document.addEventListener('DOMContentLoaded', init);