// Wrap script in an IIFE
(function() {
  'use strict';

  // --- State Variables ---
  let entries = [];
  let comments = JSON.parse(localStorage.getItem('comments')) || [];
  let recognition;
  let lastCommandTime = 0;
  let deleteHoldTimeout = null;
  let deleteTargetElement = null;
  let isDecimalTime = false;

  // --- DOM Elements ---
  const timeEntriesBody = document.getElementById('timeEntries');
  const totalElapsedHoursSpan = document.getElementById('totalElapsedHours');
  const commentSuggestionsDatalist = document.getElementById('commentSuggestions');
  const commentsListDiv = document.getElementById('commentsList');
  const clearCommentsBtn = document.getElementById('clearCommentsBtn');
  const voiceBtn = document.getElementById('voiceBtn');
  const languageSelect = document.getElementById('languageSelect');
  const commandFeedbackDiv = document.getElementById('commandFeedback');
  const newEntryBtn = document.getElementById('newEntryBtn');
  const exportBtn = document.getElementById('exportBtn');
  const toggleCommentsBtn = document.getElementById('toggleCommentsBtn');
  const clearEntriesBtn = document.getElementById('clearEntriesBtn');
  const noEntriesMessageDiv = document.getElementById('noEntriesMessage');
  const toggleFormatBtn = document.getElementById('toggleFormatBtn');

  // --- Constants ---
  const DEBOUNCE_TIME = 300;
  const LS_ENTRIES_KEY = 'timeTrackerEntries';
  const LONG_PRESS_DURATION = 1000;
  const newEntryCommands = ["new entry", "neuer eintrag", "eintrag hinzufÃ¼gen"];
  const startCommands    = ["start", "begin", "los", "anfangen", "timer starten", "starte timer"];
  const pauseCommands    = ["pause", "anhalten", "unterbrechen", "pausieren", "timer pausieren"];
  const stopCommands     = ["stop", "stopp", "beenden", "ende", "timer stoppen"];
  const commentCommands  = ["comment", "kommentar", "notiz"];

  // --- Initialization ---
  document.addEventListener('DOMContentLoaded', () => { loadEntriesFromLocalStorage(); updateCommentSuggestions(); setupEventListeners(); initializeVoiceRecognition(); updateFormatButtonText(); });
  function updateFormatButtonText() { toggleFormatBtn.textContent = isDecimalTime ? 'Show HH:MM:SS' : 'Show Decimal'; toggleFormatBtn.title = `Toggle time display format (currently ${isDecimalTime ? 'Decimal Hours' : 'HH:MM:SS'})`; }

  // --- Local Storage ---
  function saveEntriesToLocalStorage() { try { const entriesToSave = entries.map(entry => { const { timerInterval, ...rest } = entry; return rest; }); localStorage.setItem(LS_ENTRIES_KEY, JSON.stringify(entriesToSave)); } catch (error) { console.error("Failed to save entries:", error); } }
  function loadEntriesFromLocalStorage() { const storedEntries = localStorage.getItem(LS_ENTRIES_KEY); if (storedEntries) { try { const parsedEntries = JSON.parse(storedEntries); entries = parsedEntries.map(entry => ({ ...entry, elapsed: entry.elapsed || 0, timerInterval: null, isPaused: entry.isStopped ? true : entry.isPaused, startTime: entry.startTime ? parseInt(entry.startTime, 10) : null, currentStart: entry.currentStart ? parseInt(entry.currentStart, 10) : null, sessions: Array.isArray(entry.sessions) ? entry.sessions : [] })); console.log("Entries loaded"); } catch (error) { console.error("Failed to parse entries:", error); entries = []; localStorage.removeItem(LS_ENTRIES_KEY); } } else { entries = []; } renderTable(); updateTotalElapsedHours(); }

  // --- Event Listeners Setup --- (Unchanged)
  function setupEventListeners() { newEntryBtn.addEventListener('click', addNewEntry); exportBtn.addEventListener('click', exportToExcel); toggleCommentsBtn.addEventListener('click', toggleComments); clearCommentsBtn.addEventListener('click', clearAllComments); clearEntriesBtn.addEventListener('click', clearAllEntries); toggleFormatBtn.addEventListener('click', handleToggleFormat); voiceBtn.addEventListener('mousedown', startVoiceRecognitionPush); voiceBtn.addEventListener('mouseup', stopVoiceRecognitionPush); voiceBtn.addEventListener('touchstart', startVoiceRecognitionPush, { passive: true }); voiceBtn.addEventListener('touchend', stopVoiceRecognitionPush); languageSelect.addEventListener('change', updateLanguage); timeEntriesBody.addEventListener('click', handleTableClick); timeEntriesBody.addEventListener('input', handleTableInput); timeEntriesBody.addEventListener('change', handleTableChange); timeEntriesBody.addEventListener('mousedown', handleDeletePressStart); timeEntriesBody.addEventListener('mouseup', handleDeletePressEnd); timeEntriesBody.addEventListener('mouseleave', handleDeletePressEnd); timeEntriesBody.addEventListener('touchstart', handleDeletePressStart, { passive: true }); timeEntriesBody.addEventListener('touchend', handleDeletePressEnd); timeEntriesBody.addEventListener('touchcancel', handleDeletePressEnd); }

  // --- Event Handlers --- (Unchanged)
  function handleToggleFormat() { isDecimalTime = !isDecimalTime; updateFormatButtonText(); renderTable(); updateTotalElapsedHours(); }
  function handleTableClick(event) { const target = event.target; if (target.classList.contains('delete-btn')) { event.preventDefault(); return; } const row = target.closest('tr'); if (!row || !row.id) return; const entryId = parseInt(row.id.replace('entry-', ''), 10); if (isNaN(entryId)) return; if (target.classList.contains('start-btn')) startEntryTimer(entryId); else if (target.classList.contains('pause-btn')) pauseEntryTimer(entryId); else if (target.classList.contains('stop-btn')) stopEntryTimer(entryId); }
  function handleDeletePressStart(event) { const target = event.target; if (!target.classList.contains('delete-btn')) return; const row = target.closest('tr'); if (!row || !row.id) return; const entryId = parseInt(row.id.replace('entry-', ''), 10); if (isNaN(entryId)) return; clearTimeout(deleteHoldTimeout); deleteTargetElement = target; target.classList.add('delete-btn-hold'); deleteHoldTimeout = setTimeout(() => { if (deleteTargetElement === target) { console.log(`Long press delete ID: ${entryId}`); deleteEntry(entryId); target.classList.remove('delete-btn-hold'); deleteTargetElement = null; deleteHoldTimeout = null; } }, LONG_PRESS_DURATION); }
  function handleDeletePressEnd(event) { if (deleteTargetElement === event.target || deleteHoldTimeout) { clearTimeout(deleteHoldTimeout); deleteHoldTimeout = null; if(deleteTargetElement) { deleteTargetElement.classList.remove('delete-btn-hold'); deleteTargetElement = null; } } }
  function handleTableInput(event) { const target = event.target; if (target.classList.contains('comment-input')) { const row = target.closest('tr'); if (!row || !row.id) return; const entryId = parseInt(row.id.replace('entry-', ''), 10); const entry = entries.find(e => e.id === entryId); if (entry && !entry.isStopped) { entry.comment = target.value; } } }
  function handleTableChange(event) { const target = event.target; if (target.classList.contains('comment-input')) { const row = target.closest('tr'); if (!row || !row.id) return; const entryId = parseInt(row.id.replace('entry-', ''), 10); const entry = entries.find(e => e.id === entryId); if (entry && !entry.isStopped) { saveEntriesToLocalStorage(); } } }

  // --- Core Time Entry Logic --- (Unchanged)
  function addNewEntry() { if (noEntriesMessageDiv) noEntriesMessageDiv.style.display = 'none'; const id = Date.now(); const newEntry = { id, startTime: null, elapsed: 0, timerInterval: null, isPaused: true, isStopped: false, comment: '', date: getCurrentDate(), sessions: [], currentStart: null }; entries.push(newEntry); renderEntryRow(newEntry, true); updateTotalElapsedHours(); saveEntriesToLocalStorage(); }
  function deleteEntry(id) { const entryIndex = entries.findIndex(e => e.id === id); if (entryIndex > -1) { if (entries[entryIndex].timerInterval) { clearInterval(entries[entryIndex].timerInterval); } entries.splice(entryIndex, 1); document.getElementById(`entry-${id}`)?.remove(); updateTotalElapsedHours(); saveEntriesToLocalStorage(); if (entries.length === 0 && noEntriesMessageDiv) { noEntriesMessageDiv.style.display = 'block'; } } else { console.warn(`Attempted to delete non-existent entry ID: ${id}`); } }
  function clearAllEntries() { if (confirm("Are you sure you want to clear ALL time entries?")) { entries.forEach(entry => { if (entry.timerInterval) clearInterval(entry.timerInterval); }); entries = []; localStorage.removeItem(LS_ENTRIES_KEY); renderTable(); updateTotalElapsedHours(); console.log("All entries cleared."); } }
  function startEntryTimer(id) { const alreadyRunning = entries.find(e => !e.isPaused && !e.isStopped && e.id !== id); if (alreadyRunning) { showCommandFeedback(`Timer for entry ${alreadyRunning.id} already running.`, true); return; } const entry = entries.find(e => e.id === id); if (!entry || entry.isStopped || !entry.isPaused) return; const now = Date.now(); const previousElapsed = entry.elapsed || 0; entry.isPaused = false; entry.startTime = now; entry.currentStart = entry.currentStart || now; clearInterval(entry.timerInterval); entry.timerInterval = setInterval(() => { const currentSegmentElapsed = Date.now() - entry.startTime; entry.elapsed = previousElapsed + currentSegmentElapsed; updateEntryTimerDisplay(entry); updateTotalElapsedHours(); }, 1000); renderEntryRow(entry); updateTotalElapsedHours(); }
  function pauseEntryTimer(id) { const entry = entries.find(e => e.id === id); if (!entry || entry.isPaused || entry.isStopped) return; clearInterval(entry.timerInterval); entry.timerInterval = null; entry.isPaused = true; const currentSegmentElapsed = Date.now() - entry.startTime; entry.elapsed += currentSegmentElapsed; if (entry.startTime) entry.sessions.push({ from: getTimeString(new Date(entry.startTime)), to: getTimeString(new Date()) }); entry.startTime = null; renderEntryRow(entry); updateTotalElapsedHours(); saveEntriesToLocalStorage(); }
  function stopEntryTimer(id) { const entry = entries.find(e => e.id === id); if (!entry || entry.isStopped) return; const wasRunning = !entry.isPaused; clearInterval(entry.timerInterval); entry.timerInterval = null; if (wasRunning && entry.startTime) { const currentSegmentElapsed = Date.now() - entry.startTime; entry.elapsed += currentSegmentElapsed; entry.sessions.push({ from: getTimeString(new Date(entry.startTime)), to: getTimeString(new Date()) }); entry.startTime = null; } entry.isPaused = true; entry.isStopped = true; if (entry.comment && !comments.includes(entry.comment)) { comments.push(entry.comment); localStorage.setItem('comments', JSON.stringify(comments)); updateCommentSuggestions(); } renderEntryRow(entry); updateTotalElapsedHours(); saveEntriesToLocalStorage(); }

  // --- UI Rendering Functions --- (Unchanged)
  function renderTable() { timeEntriesBody.innerHTML = ''; if (entries.length === 0) { if (noEntriesMessageDiv) noEntriesMessageDiv.style.display = 'block'; } else { if (noEntriesMessageDiv) noEntriesMessageDiv.style.display = 'none'; entries.forEach(entry => renderEntryRow(entry, true)); } updateTotalElapsedHours(); }
  function renderEntryRow(entry, append = false) { let row = document.getElementById(`entry-${entry.id}`); const rowExists = !!row; const rowHTML = ` <td data-label="Timer Controls"><div class="timer-controls"><button class="start-btn" ${entry.isStopped || !entry.isPaused ? 'disabled' : ''}>Start</button><button class="pause-btn" ${entry.isStopped || entry.isPaused ? 'disabled' : ''}>Pause</button><button class="stop-btn" ${entry.isStopped ? 'disabled' : ''}>Stop</button></div></td> <td class="elapsed-time" data-label="Elapsed Time"></td> <td class="entry-date" data-label="Date">${entry.date}</td> <td data-label="Comment"><input type="text" class="comment-input" placeholder="Add comment" list="commentSuggestions" value="${escapeAttribute(entry.comment || '')}" ${entry.isStopped ? 'disabled' : ''}></td> <td data-label="Action"><button class="delete-btn" title="Long press to delete">Delete</button></td> `; if (!rowExists && append) { row = document.createElement('tr'); row.id = `entry-${entry.id}`; row.innerHTML = rowHTML; timeEntriesBody.appendChild(row); } else if (rowExists) { row.innerHTML = rowHTML; } else { row = document.createElement('tr'); row.id = `entry-${entry.id}`; row.innerHTML = rowHTML; timeEntriesBody.appendChild(row); console.warn(`RenderEntryRow fallback append for ID: ${entry.id}`); } row = document.getElementById(`entry-${entry.id}`); if (!row) { console.error(`Failed find row entry-${entry.id} after update.`); return; } const startBtn = row.querySelector('.start-btn'); const pauseBtn = row.querySelector('.pause-btn'); startBtn?.classList.toggle('active', !entry.isPaused && !entry.isStopped); pauseBtn?.classList.toggle('active', entry.isPaused && !entry.isStopped); updateEntryTimerDisplay(entry, row); const commentInput = row.querySelector('.comment-input'); if (commentInput) commentInput.disabled = entry.isStopped; }
  function updateEntryTimerDisplay(entry, rowElement = null) { const row = rowElement || document.getElementById(`entry-${entry.id}`); if (!row) return; const timeDiv = row.querySelector('.elapsed-time'); if (!timeDiv) return; let liveSessionHTML = ''; if (!entry.isPaused && !entry.isStopped && entry.startTime) { const currentSessionStartStr = getTimeString(new Date(entry.startTime)); const nowStr = getTimeString(new Date()); liveSessionHTML = `<div class="live-session">${currentSessionStartStr} - ${nowStr} (running)</div>`; } const recordedSessionsHTML = (entry.sessions || []).slice().reverse().map(s => `<div>${s.from} - ${s.to}</div>`).join(''); const totalFormattedTime = formatTime(entry.elapsed, isDecimalTime); timeDiv.innerHTML = ` ${liveSessionHTML} ${recordedSessionsHTML} <div class="total-elapsed-display">Elapsed: <span class="pure-elapsed">${totalFormattedTime}</span></div> `; }
  function updateTotalElapsedHours() { const totalMs = entries.reduce((sum, entry) => sum + (entry.elapsed || 0), 0); totalElapsedHoursSpan.textContent = formatTime(totalMs, isDecimalTime); }

  // --- Voice Recognition --- (Unchanged)
  function normalizeText(text) { return text.toLowerCase().replace(/[^\p{L}\d\s]/gu, ' ').replace(/\s+/g, ' ').trim(); }
  function matchesCommand(text, commands) { for (let cmd of commands) { const pattern = '\\b' + cmd.split(/\s+/).join('\\s+') + '\\b'; if (new RegExp(pattern, 'i').test(text)) return true; } return false; }
  function initializeVoiceRecognition() { if (!('webkitSpeechRecognition'in window)) { console.warn('Web Speech API not supported.'); if(voiceBtn) voiceBtn.disabled=true; if(languageSelect) languageSelect.disabled=true; return; } recognition = new webkitSpeechRecognition(); recognition.continuous = true; recognition.interimResults = true; recognition.lang = languageSelect.value; recognition.onstart = () => { console.log('Voice started.'); voiceBtn.classList.add('active'); }; recognition.onerror = e => { console.error('Voice error:', e.error); let msg=`Error: ${e.error}`; if(e.error==='no-speech')msg="No speech."; else if(e.error==='audio-capture')msg="Mic error."; else if(e.error==='not-allowed')msg="Mic permission denied."; showCommandFeedback(msg, true); voiceBtn.classList.remove('active'); }; recognition.onend = () => { console.log('Voice ended.'); voiceBtn.classList.remove('active'); }; recognition.onresult = e => { let finalTranscript=''; for(let i=e.resultIndex; i<e.results.length; i++){ if(e.results[i].isFinal) finalTranscript += e.results[i][0].transcript; } if(finalTranscript){ const cmd = finalTranscript.trim(); console.log('Voice cmd:', cmd); handleVoiceCommand(cmd); } }; }
  function startVoiceRecognitionPush() { if (!recognition) { initializeVoiceRecognition(); if (!recognition) { showCommandFeedback("Voice not supported/initialized.", true); return; } } try { if (!voiceBtn.classList.contains('active')) recognition.start(); } catch (e) { console.error("Voice start error:", e); if(e.name !== 'InvalidStateError') { voiceBtn.classList.remove('active'); showCommandFeedback("Mic start error.", true); } } }
  function stopVoiceRecognitionPush() { if (recognition && voiceBtn.classList.contains('active')) recognition.stop(); }
  function updateLanguage() { if (recognition) { recognition.stop(); recognition.lang = languageSelect.value; console.log('Voice lang:', recognition.lang); } else initializeVoiceRecognition(); }
  function showCommandFeedback(message, isError = false) { clearTimeout(window.feedbackTimeout); if(commandFeedbackDiv){ commandFeedbackDiv.textContent = isError?`Error: ${message}`:`Action: ${message}`; commandFeedbackDiv.style.color = isError?'#d32f2f':'#1976D2'; commandFeedbackDiv.style.fontWeight = 'bold'; commandFeedbackDiv.style.display = 'block'; commandFeedbackDiv.style.opacity = '1'; commandFeedbackDiv.style.transition = 'opacity 0.3s ease-out'; window.feedbackTimeout = setTimeout(() => { commandFeedbackDiv.style.opacity = '0'; setTimeout(() => { if(commandFeedbackDiv.style.opacity === '0') commandFeedbackDiv.style.display = 'none'; }, 300); }, isError?4000:2500); } }
  function handleVoiceCommand(command) { const now=Date.now(); if(now-lastCommandTime<DEBOUNCE_TIME) return; lastCommandTime=now; const normalized=normalizeText(command); console.log('Voice Normalized:', normalized); const running=entries.find(e=>!e.isPaused&&!e.isStopped); const target=running || entries.slice().reverse().find(e=>!e.isStopped); const targetId=target?.id; if(matchesCommand(normalized, newEntryCommands)){ addNewEntry(); showCommandFeedback("New entry added."); return; } if(!targetId){ showCommandFeedback("No active entry for command."); return; } if(matchesCommand(normalized, commentCommands)){ let txt=normalized; commentCommands.forEach(kw=>{ const p='\\b'+kw.split(/\s+/).join('\\s+')+'\\b'; txt=txt.replace(new RegExp(p,'gi'),''); }); txt=txt.trim(); if(txt) { addCommentToEntry(targetId, txt); showCommandFeedback(`Comment "${txt}" added.`); } else { showCommandFeedback("No comment text heard."); } return; } if(matchesCommand(normalized, startCommands)){ startEntryTimer(targetId); showCommandFeedback(`Timer started.`); return; } if(matchesCommand(normalized, pauseCommands)){ pauseEntryTimer(targetId); showCommandFeedback(`Timer paused.`); return; } if(matchesCommand(normalized, stopCommands)){ stopEntryTimer(targetId); showCommandFeedback(`Timer stopped.`); return; } }
  function addCommentToEntry(id, comment) { const entry=entries.find(e=>e.id===id); if(entry&&!entry.isStopped){ entry.comment=comment; renderEntryRow(entry); saveEntriesToLocalStorage(); } }

  // --- Comment Management --- (Unchanged)
  function updateCommentSuggestions() { commentSuggestionsDatalist.innerHTML = comments.map(c => `<option value="${escapeAttribute(c)}"></option>`).join(''); }
  function toggleComments() { const listVisible = commentsListDiv.style.display === 'block'; commentsListDiv.style.display = listVisible?'none':'block'; clearCommentsBtn.style.display = listVisible?'none':'inline-block'; if(!listVisible) showComments(); }
  function showComments() { commentsListDiv.innerHTML = comments.map(c => `<div class="stored-comment"><span>${escapeHTML(c)}</span><button class="delete-comment-btn" data-comment="${escapeAttribute(c)}" title="Delete comment">X</button></div>`).join(''); commentsListDiv.querySelectorAll('.delete-comment-btn').forEach(button => button.addEventListener('click', handleDeleteCommentClick)); }
  function handleDeleteCommentClick(event) { const commentToDelete = event.target.dataset.comment; if(commentToDelete) deleteComment(commentToDelete); }
  function deleteComment(commentToDelete) { comments = comments.filter(c => c !== commentToDelete); localStorage.setItem('comments', JSON.stringify(comments)); updateCommentSuggestions(); showComments(); if(comments.length===0){ commentsListDiv.style.display='none'; clearCommentsBtn.style.display='none'; } }
  function clearAllComments() { if(confirm("Are you sure you want to clear ALL stored comments?")){ comments=[]; localStorage.removeItem('comments'); updateCommentSuggestions(); showComments(); commentsListDiv.style.display='none'; clearCommentsBtn.style.display='none'; } }

  // --- Utility Functions --- (Unchanged formatTime)
  function formatTime(ms, useDecimal = false) { if (isNaN(ms) || ms < 0) ms = 0; if (useDecimal) { const hours = ms / (1000 * 60 * 60); return hours.toFixed(2) + ' hrs'; } else { const pad = n => String(n).padStart(2, '0'); const totalSeconds = Math.floor(ms / 1000); const hours = pad(Math.floor(totalSeconds / 3600)); const minutes = pad(Math.floor((totalSeconds % 3600) / 60)); const seconds = pad(totalSeconds % 60); return `${hours}:${minutes}:${seconds}`; } }
  function getCurrentDate() { const now=new Date(); const d=String(now.getDate()).padStart(2,'0'); const m=String(now.getMonth()+1).padStart(2,'0'); const y=now.getFullYear().toString().slice(-2); return `${d}.${m}.${y}`; }
  function getTimeString(date) { if(!(date instanceof Date)||isNaN(date)) return '00:00:00'; const h=String(date.getHours()).padStart(2,'0'); const m=String(date.getMinutes()).padStart(2,'0'); const s=String(date.getSeconds()).padStart(2,'0'); return `${h}:${m}:${s}`; }
  function escapeHTML(str) { if(typeof str !== 'string') str=''; const div=document.createElement('div'); div.textContent=str; return div.innerHTML; }
  function escapeAttribute(str) { if(typeof str !== 'string') str=''; return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;'); }

  // --- Excel Export ---
  // **MODIFIED** to include Decimal Hours column
  function exportToExcel() {
    if (entries.length === 0) { alert("No time entries to export."); return; }

    // ** ADDED NEW HEADER **
    const headers = ["Date", "Start Time", "End Time", "Elapsed (HH:MM:SS)", "Decimal Hours", "Comment", "Sessions (From - To)"];
    const data = [headers];
    let totalMs = 0;

    entries.forEach(entry => {
      let start = 'N/A', end = 'N/A';
      if (entry.sessions && entry.sessions.length > 0) {
          start = entry.sessions[0].from;
          end = entry.sessions.reduce((latest, session) => session.to > latest ? session.to : latest, entry.sessions[0].to);
      } else if (entry.currentStart) {
          start = getTimeString(new Date(entry.currentStart));
          end = entry.isStopped ? getTimeString(new Date(entry.currentStart + entry.elapsed)) : 'N/A';
      }
      const sessionsStr = (entry.sessions || []).map(s => `${s.from} - ${s.to}`).join('; ');
      const comment = entry.comment || '';

      // Calculate both formats for export
      const elapsedStandard = formatTime(entry.elapsed || 0, false);
      const elapsedDecimal = parseFloat(formatTime(entry.elapsed || 0, true).replace(' hrs','')); // Get decimal number

      // ** ADDED DECIMAL VALUE TO PUSHED ARRAY **
      data.push([
          entry.date,
          start,
          end,
          elapsedStandard,
          elapsedDecimal, // Add the decimal value here
          comment,
          sessionsStr
      ]);
      totalMs += (entry.elapsed || 0);
    });

    // Add Total Row - add empty cell for new column
    data.push(["", "", "Total", formatTime(totalMs, false), parseFloat(formatTime(totalMs, true).replace(' hrs','')), "", ""]);

    try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        // ** ADJUSTED COLUMN WIDTHS **
        ws['!cols'] = [
            { wch: 10 }, // Date
            { wch: 12 }, // Start Time
            { wch: 12 }, // End Time
            { wch: 20 }, // Elapsed (HH:MM:SS)
            { wch: 15 }, // Decimal Hours (New)
            { wch: 40 }, // Comment
            { wch: 50 }  // Sessions
        ];
        // Set number format for the decimal column (E) - Optional but nice
        for (let R = 1; R < data.length; ++R) { // Start from row 1 (skip header)
            const cell_address = { c: 4, r: R }; // Column E (index 4)
            if(ws[XLSX.utils.encode_cell(cell_address)]) { // Check if cell exists
                 ws[XLSX.utils.encode_cell(cell_address)].z = '0.00'; // Apply number format "0.00"
            }
        }

        XLSX.utils.book_append_sheet(wb, ws, "Time Entries");
        const filename = `time_entries_${getCurrentDate().replace(/\./g, '-')}.xlsx`;
        XLSX.writeFile(wb, filename);
    }
    catch (error) { console.error("Excel export error:", error); alert("Error exporting. Check console."); showCommandFeedback("Excel export failed.", true); }
  }

})(); // End of IIFE