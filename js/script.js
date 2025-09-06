    (function() {
      const STORAGE_KEY = 'vagasDataV1';
      /** @type {{empresa:string, link:string, data:string, concluido?:boolean}[]} */
      let vagas = [];
      // sortState.col === null -> keep insertion order (after partition by concluido)
      let sortState = { col: null, dir: 'asc' };

      const form = document.getElementById('vagaForm');
      const empresaEl = document.getElementById('empresa');
      const linkEl = document.getElementById('link');
      const dataEl = document.getElementById('data');
      const tbody = document.getElementById('tbody');
      const thead = document.querySelector('#tabela thead');
      const btnCopyLink = document.getElementById('btnCopyLink');

      // define default date behavior: prefill form date with today if empty
      function setDefaultDate() {
        try {
          const today = new Date();
          const y = today.getFullYear();
          const m = String(today.getMonth() + 1).padStart(2, '0');
          const d = String(today.getDate()).padStart(2, '0');
          if (!dataEl.value) dataEl.value = `${y}-${m}-${d}`;
        } catch (e) { /* ignore */ }
      }

      function showToast(msg, type = 'ok') {
        const area = document.getElementById('toasts');
        const t = document.createElement('div');
        t.className = 'toast' + (type === 'error' ? ' error' : '');
        t.textContent = msg;
        area.appendChild(t);
        setTimeout(() => t.remove(), 3600);
      }

      function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(vagas));
      }

      function load() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          vagas = raw ? JSON.parse(raw) : [];
          // normalizar datas para YYYY-MM-DD and ensure 'concluido'
          for (const v of vagas) {
            if (v.data && v.data.includes('/')) v.data = toISODate(v.data);
            if (typeof v.concluido !== 'boolean') v.concluido = false;
          }
        } catch (e) {
          console.error(e);
          vagas = [];
        }
      }

      function sanitize(str) { return (str || '').toString().trim(); }

      function isValidUrl(u) {
        try { new URL(u); return true; } catch { return false; }
      }

      function toDisplayDate(iso) {
        if (!iso) return '';
        // expect YYYY-MM-DD
        const [y,m,d] = iso.split('-');
        if (!y || !m || !d) return iso;
        return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`;
      }

      function toISODate(val) {
        // Accepts 'YYYY-MM-DD' or 'DD/MM/YYYY'
        if (!val) return '';
        if (val.includes('/')) {
          const [d, m, y] = val.split('/');
          return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        }
        return val; // assume already ISO
      }

      function addOrUpdate(entry) {
        const idx = vagas.findIndex(v => v.link === entry.link);
        if (idx >= 0) {
          vagas[idx] = entry; // substituir
          return 'replaced';
        } else {
          vagas.push(entry);
          return 'added';
        }
      }

      function importFromArray(arr) {
        // arr: array of objects {empresa,link,data,concluido}
        let added = 0, updated = 0, skipped = 0;
        for (const raw of arr) {
          if (!raw || typeof raw !== 'object') { skipped++; continue; }
          const empresa = sanitize(raw.empresa);
          const link = sanitize(raw.link);
          let dt = sanitize(raw.data);
          dt = toISODate(dt);
          const concluido = raw.concluido === true || raw.concluido === 'true';
          if (!empresa || !link || !dt || !isValidUrl(link)) { skipped++; continue; }
          const idx = vagas.findIndex(v => v.link === link);
          if (idx === -1) {
            vagas.push({ empresa, link, data: dt, concluido });
            added++;
          } else {
            const existing = vagas[idx];
            // compare fields, update only if different
            if (existing.empresa !== empresa || existing.data !== dt || !!existing.concluido !== !!concluido) {
              vagas[idx] = { empresa, link, data: dt, concluido };
              updated++;
            } // else identical -> skip
          }
        }
        if (added || updated) save();
        return { added, updated, skipped };
      }

      // return sequence of focusable editing elements in DOM order
      function getFocusableSequence() {
        const seq = [];
        const rows = Array.from(tbody.querySelectorAll('tr'));
        for (const tr of rows) {
          const empresaTd = tr.querySelector('td[data-col="empresa"]');
          const linkTd = tr.querySelector('td[data-col="link"]');
          const dataTd = tr.querySelector('td[data-col="data"]');
          const chk = tr.querySelector('input[type="checkbox"]');
          const delBtn = tr.querySelector('.delete-btn');
          if (empresaTd) seq.push(empresaTd);
          if (linkTd) seq.push(linkTd);
          if (dataTd) seq.push(dataTd);
          if (chk) seq.push(chk);
          if (delBtn) seq.push(delBtn);
        }
        return seq;
      }

      function focusElement(el) {
        if (!el) return;
        // if td -> focus it (which will enter edit)
        if (el.tagName === 'TD') el.focus();
        else el.focus();
      }

      // close any active inline edit (commit) to avoid multiple inputs/caret leakage
      function closeActiveEdit() {
        const activeTd = tbody.querySelector('td.editing');
        if (!activeTd) return;
        const input = activeTd.querySelector('.inline-edit');
        if (input) {
          try { commitEdit(input, activeTd); } catch (e) { activeTd.classList.remove('editing'); renderTable(); }
        } else {
          activeTd.classList.remove('editing');
        }
      }

      function enterEdit(td) {
        if (!td || td.classList.contains('editing')) return;
        const col = td.dataset.col;
        if (!col) return;

        // close any other active edit first
        closeActiveEdit();

        // store anchor href before clearing
        let anchorHref = null;
        const anchor = td.querySelector && td.querySelector('a');
        if (anchor) anchorHref = anchor.href;

        td.classList.add('editing');
        const orig = td.textContent.trim();
        td.innerHTML = '';

        let input;
        if (col === 'data') {
          input = document.createElement('input');
          input.type = 'date';
          const iso = toISODate(orig) || anchorHref || '';
          input.value = iso || '';
        } else if (col === 'link') {
          input = document.createElement('input');
          input.type = 'url';
          input.value = anchorHref || orig;
        } else {
          input = document.createElement('input');
          input.type = 'text';
          input.value = orig;
        }
        input.className = 'inline-edit';
        // ensure input won't visually overflow or move layout
        input.style.display = 'block';
        input.style.minWidth = '0';
        td.appendChild(input);

        // focus/selection deferred to next frame to avoid layout thrash
        requestAnimationFrame(() => {
          input.focus();
          try { input.select(); } catch (e) {}
        });

        // handlers
        input.addEventListener('blur', () => {
          // small timeout to allow related clicks (eg. Cancel button) before committing
          setTimeout(() => { if (document.activeElement === input) return; commitEdit(input, td); }, 0);
        });

        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            commitEdit(input, td, { focusMove: 1 });
          } else if (ev.key === 'Tab') {
            ev.preventDefault();
            const dir = ev.shiftKey ? -1 : 1;
            commitEdit(input, td, { focusMove: dir });
          } else if (ev.key === 'Escape') {
            td.classList.remove('editing');
            renderTable();
          }
        });
      }

      function commitEdit(input, td, opts = {}) {
        // opts: { focusMove: number } where focusMove 1 -> next, -1 -> prev, undefined -> none
        if (!td || !input) return;
        const move = opts.focusMove;
        // build sequence BEFORE changes to compute next index
        const seqBefore = getFocusableSequence();
        const tdIndex = seqBefore.indexOf(td);
        const targetIndex = (typeof move === 'number') ? tdIndex + move : null;

        const newValRaw = input.value.trim();
        const col = td.dataset.col;
        const tr = td.closest('tr');
        const originalLink = tr ? tr.dataset.link : null;
        const idx = vagas.findIndex(v => v.link === originalLink);
        if (idx === -1) { td.classList.remove('editing'); renderTable(); return; }

        let newEmpresa = vagas[idx].empresa;
        let newLink = vagas[idx].link;
        let newData = vagas[idx].data;

        if (col === 'empresa') {
          if (!newValRaw) { showToast('Nome da empresa não pode ficar vazio', 'error'); input.focus(); return; }
          newEmpresa = newValRaw;
        } else if (col === 'link') {
          if (!isValidUrl(newValRaw)) { showToast('Link inválido', 'error'); input.focus(); return; }
          newLink = newValRaw;
          const conflict = vagas.findIndex((v, i) => v.link === newLink && i !== idx);
          if (conflict !== -1) { showToast('Já existe uma vaga com esse link', 'error'); input.focus(); return; }
        } else if (col === 'data') {
          const iso = toISODate(newValRaw);
          if (!iso) { showToast('Data inválida', 'error'); input.focus(); return; }
          newData = iso;
        }

        vagas[idx] = { empresa: newEmpresa, link: newLink, data: newData, concluido: !!vagas[idx].concluido };
        save();
        renderTable();

        // after render, focus desired element by index if valid. Use setTimeout to ensure DOM updates are applied.
        if (typeof targetIndex === 'number') {
          setTimeout(() => {
            const seqAfter = getFocusableSequence();
            if (targetIndex >= 0 && targetIndex < seqAfter.length) {
              const el = seqAfter[targetIndex];
              // if td -> start edit
              if (el && el.tagName === 'TD') enterEdit(el);
              else focusElement(el);
            }
          }, 0);
        }
      }

      function renderTable() {
        const withIndex = vagas.map((v, i) => ({ ...v, __idx: i }));

        const sorted = withIndex.sort((a,b) => {
          if ((a.concluido || false) !== (b.concluido || false)) return a.concluido ? 1 : -1;
          if (!sortState.col) return a.__idx - b.__idx;
          const col = sortState.col;
          let av = a[col] || '', bv = b[col] || '';
          if (col === 'data') { av = a.data || ''; bv = b.data || ''; }
          else { av = av.toString().toLowerCase(); bv = bv.toString().toLowerCase(); }
          if (av < bv) return sortState.dir === 'asc' ? -1 : 1;
          if (av > bv) return sortState.dir === 'asc' ? 1 : -1;
          return a.__idx - b.__idx;
        });

        // close any stray edits before re-render
        const active = tbody.querySelector('td.editing');
        if (active) active.classList.remove('editing');

        tbody.innerHTML = '';
        for (const v of sorted) {
          const tr = document.createElement('tr');
          tr.dataset.link = v.link;
          if (v.concluido) tr.classList.add('completed');

          const tdEmpresa = document.createElement('td');
          tdEmpresa.dataset.col = 'empresa';
          tdEmpresa.tabIndex = 0;
          tdEmpresa.textContent = v.empresa;

          const tdLink = document.createElement('td');
          tdLink.dataset.col = 'link';
          tdLink.tabIndex = 0;
          const a = document.createElement('a');
          a.href = v.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.textContent = v.link; a.className = 'link';
          tdLink.appendChild(a);

          const tdData = document.createElement('td');
          tdData.dataset.col = 'data';
          tdData.tabIndex = 0;
          tdData.textContent = toDisplayDate(v.data);

          const tdConcluido = document.createElement('td');
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.tabIndex = 0;
          chk.checked = !!v.concluido;
          chk.addEventListener('change', () => {
            const origIdx = vagas.findIndex(x => x.link === v.link);
            if (origIdx >= 0) {
              vagas[origIdx].concluido = chk.checked;
              save();
              renderTable();
            }
          });
          tdConcluido.appendChild(chk);

          const tdDelete = document.createElement('td');
          tdDelete.className = 'delete-cell';
          const delBtn = document.createElement('button');
          delBtn.className = 'delete-btn';
          delBtn.title = 'Excluir';
          delBtn.tabIndex = 0;
          // SVG cross icon for crispness
          delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 6L18 18M6 18L18 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          tdDelete.appendChild(delBtn);

          // attach delete flow
          delBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (tr.querySelector('.delete-pop')) return;
            const pop = document.createElement('div');
            pop.className = 'delete-pop';
            const p = document.createElement('p');
            p.innerHTML = 'Excluindo em <span class="delete-count">5</span>s';
            const btnCancel = document.createElement('button');
            btnCancel.className = 'btn-ghost';
            btnCancel.textContent = 'Cancelar';
            pop.appendChild(p);
            pop.appendChild(btnCancel);

            tr.appendChild(pop);

            // animate open
            requestAnimationFrame(() => pop.classList.add('open'));

            let count = 5;
            const span = pop.querySelector('.delete-count');
            const timer = setInterval(() => {
              count--;
              if (span) span.textContent = String(count);
              if (count <= 0) {
                clearInterval(timer);
                const idx = vagas.findIndex(x => x.link === v.link);
                if (idx >= 0) {
                  vagas.splice(idx, 1);
                  save();
                  renderTable();
                  showToast('Vaga excluída');
                }
              }
            }, 1000);

            btnCancel.addEventListener('click', (e) => {
              e.stopPropagation();
              clearInterval(timer);
              pop.classList.remove('open');
              setTimeout(() => pop.remove(), 160);
            });

            // focus cancel with keyboard
            btnCancel.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btnCancel.click(); } });
          });

          // keyboard support: enter/space on delBtn triggers click
          delBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); delBtn.click(); } });

          // checkbox keyboard toggle
          chk.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chk.checked = !chk.checked; chk.dispatchEvent(new Event('change')); } });

          tr.appendChild(tdEmpresa);
          tr.appendChild(tdLink);
          tr.appendChild(tdData);
          tr.appendChild(tdConcluido);
          tr.appendChild(tdDelete);
          tbody.appendChild(tr);
        }

        // atualizar indicadores visuais de ordenação
        document.querySelectorAll('thead th').forEach(th => {
          const ind = th.querySelector('.sort-indicator') || document.createElement('span');
          ind.className = 'sort-indicator';
          if (th.dataset.col && th.dataset.col === sortState.col) {
            ind.textContent = sortState.dir === 'asc' ? '▴' : '▾';
          } else {
            ind.textContent = '';
          }
          if (th.dataset.col && !th.querySelector('.sort-indicator')) th.appendChild(ind);
        });
      }

      // delegated clicks to enter edit mode when clicking on TDs (but not on anchors or buttons)
      tbody.addEventListener('click', (e) => {
        const td = e.target.closest('td');
        if (!td || !tbody.contains(td)) return;
        if (td.dataset.col) {
          if (e.target.closest && e.target.closest('a')) return;
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
          enterEdit(td);
        }
      });

      // focus behavior: when td receives focus (via Tab), start edit
      tbody.addEventListener('focusin', (e) => {
        const td = e.target.closest && e.target.closest('td');
        if (!td) return;
        if (td.dataset && td.dataset.col) {
          // if focus came from clicking anchor, don't edit
          if (document.activeElement && document.activeElement.tagName === 'A') return;
          enterEdit(td);
        }
      });

      // disable clicks/selection/drag on non-interactive areas
      (function blockNonInteractive() {
        const allowSelector = 'input, textarea, button, a, td[data-col], input[type="checkbox"], #vagaForm *';
        // prevent mouse clicks on everything that is not allowed
        document.addEventListener('click', (e) => {
          if (e.target.closest && e.target.closest(allowSelector)) return;
          // allow right-click context menu, but prevent accidental selections/clicks
          e.preventDefault();
          e.stopPropagation();
        }, true);

        // prevent text selection start outside allowed
        document.addEventListener('selectstart', (e) => {
          if (e.target.closest && e.target.closest(allowSelector)) return;
          e.preventDefault();
        }, true);

        // prevent dragging items (images/links) outside allowed
        document.addEventListener('dragstart', (e) => {
          if (e.target.closest && e.target.closest(allowSelector)) return;
          e.preventDefault();
        }, true);
      })();

      // keyboard navigation helpers
      document.addEventListener('keydown', (e) => {
        // if an INPUT inline exists and is focused, let it handle keys
        const active = document.activeElement;
        if (active && active.classList && active.classList.contains('inline-edit')) return;

        // Enter/Space behavior for focused checkbox or delete button already handled on render
        // Tab/Shift+Tab default behavior is fine for moving focus between focusable elements (we handled edits on focusin)
      });

      // Eventos
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const empresa = sanitize(empresaEl.value);
        const link = sanitize(linkEl.value);
        const data = toISODate(sanitize(dataEl.value));
        if (!empresa) { showToast('Informe o nome da empresa', 'error'); empresaEl.focus(); return; }
        if (!isValidUrl(link)) { showToast('Link inválido', 'error'); linkEl.focus(); return; }
        if (!data) { showToast('Informe a data', 'error'); dataEl.focus(); return; }
        const res = addOrUpdate({ empresa, link, data, concluido: false });
        save();
        renderTable();
        form.reset();
        setDefaultDate();
        empresaEl.focus();
        showToast(res === 'added' ? 'Vaga incluída' : 'Vaga atualizada');
      });

      thead.addEventListener('click', (e) => {
        const th = e.target.closest('th');
        if (!th) return;
        const col = th.dataset.col;
        if (!col) return; // coluna 'CONCLUÍDO' e 'EXCLUIR' não ordenam por clique
        if (sortState.col === col) {
          sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
        } else {
          sortState.col = col; sortState.dir = 'asc';
        }
        renderTable();
      });

      // construir link compartilhável e copiar
      function buildShareUrl() {
        const base = 'https://malgany.github.io/lista-vagas';
        if (!vagas || vagas.length === 0) return base;
        // compactar apenas os campos necessários
        const payload = vagas.map(v => ({ empresa: v.empresa, link: v.link, data: v.data, concluido: !!v.concluido }));
        const encoded = encodeURIComponent(JSON.stringify(payload));
        return `${base}?vagas=${encoded}`;
      }

      // Use fallback copy method only (avoid Clipboard API which may be blocked by permissions)
      btnCopyLink.addEventListener('click', () => {
        if (!vagas || vagas.length === 0) { showToast('Nada para copiar (sem vagas).', 'error'); return; }
        const url = buildShareUrl();
        try {
          const ta = document.createElement('textarea');
          ta.value = url;
          ta.setAttribute('readonly', '');
          ta.style.position = 'absolute';
          ta.style.left = '-9999px';
          ta.style.top = '0';
          document.body.appendChild(ta);

          ta.focus();
          ta.select();
          ta.setSelectionRange(0, ta.value.length);

          const ok = document.execCommand('copy');
          document.body.removeChild(ta);

          if (ok) {
            showToast('Link copiado para a área de transferência!');
          } else {
            showToast('Não foi possível copiar automaticamente. Selecione e copie manualmente.', 'error');
          }
        } catch (e) {
          console.error('Copy fallback failed', e);
          showToast('Falha ao copiar o link. Copie manualmente: ' + url, 'error');
        }
      });

      // importar automaticamente se houver param ?vagas=...
      function tryImportFromUrl() {
        try {
          const params = new URLSearchParams(window.location.search);
          if (!params.has('vagas')) return;
          const raw = params.get('vagas');
          if (!raw) return;
          let arr;
          try { arr = JSON.parse(raw); } catch (e) {
            // talvez esteja percent-encoded
            try { arr = JSON.parse(decodeURIComponent(raw)); } catch (ee) { return; }
          }
          if (!Array.isArray(arr)) return;
          const { added, updated } = importFromArray(arr);
          if (added || updated) {
            // atualiza tabela imediatamente
            renderTable();
            // remove o parâmetro da URL sem recarregar a página
            const u = new URL(window.location.href);
            u.searchParams.delete('vagas');
            history.replaceState(null, '', u.toString());
            window.location = '.'
          }
        } catch (err) {
          console.error('Erro importando da URL', err);
        }
      }

      // Inicialização
      load();
      // preenche o campo data com hoje se estiver vazio (inicial)
      try { setDefaultDate(); } catch (e) { /* ignore */ }
      renderTable();
      tryImportFromUrl();

      // Atalhos: ESC fecha modais (não há modais agora, mas deixo como segurança)
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          // nada para fechar
        }
      });
    })();
